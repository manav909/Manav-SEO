/* ════════════════════════════════════════════════════════════════
   api/lib/dev-engine.ts  —  Developer Task Engine
   
   Architecture: fire-and-forget execution.
   1. client calls dev_execute_task
   2. server marks task 'running', returns immediately (< 300ms)
   3. server continues: fetch live page → snapshot → call AI → write results
   4. client polls dev_get_tasks every 3s until status !== 'running'
   
   This means execution can take as long as needed (slow sites, large
   pages, AI latency) without the browser timing out or the user waiting.
   
   All logic is generic — no hardcoded site names, URLs, or metrics.
   CMS detection reads from the live page HTML on each execution.
   AI prompts are built from audit finding data on the task record.
════════════════════════════════════════════════════════════════ */

import { db } from './db.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-4-6';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type CmsPlatform =
  | 'wordpress' | 'webflow' | 'squarespace' | 'wix' | 'shopify'
  | 'hubspot' | 'drupal' | 'joomla' | 'ghost' | 'framer'
  | 'custom' | 'unknown';

export type SeoPlugin = 'yoast' | 'rankmath' | 'aioseo' | 'seopress' | 'none' | 'unknown';

export interface CmsContext {
  platform:   CmsPlatform;
  seoPlugin:  SeoPlugin;
  confidence: number;   // 0-100
  signals:    string[]; // what fingerprints were found
  adminPath:  string;   // e.g. '/wp-admin'
}

export interface DevTask {
  id?:                    string;
  project_id:             string;
  campaign_id?:           string | null;
  audit_run_id?:          string | null;
  phase:                  'phase_0' | 'phase_2' | 'phase_3';
  category:               'performance' | 'schema' | 'on_page' | 'content' | 'indexing';
  task_type:              string;
  title:                  string;
  description?:           string;
  finding_title?:         string;
  finding_detail?:        string;
  severity:               'critical' | 'warning' | 'info';
  target_url?:            string;
  priority:               number;
  status:                 TaskStatus;
  // populated after execution
  analysis?:              string;
  fix_code?:              string;
  fix_language?:          string;
  apply_instructions?:    string;
  verification_method?:   string;
  rollback_code?:         string;
  rollback_instructions?: string;
  snapshot_id?:           string;
  backup_confirmed?:      boolean;
  // populated after verification
  verification_result?:   'pass' | 'fail' | 'partial';
  verification_evidence?: Record<string, unknown>;
  cms_platform?:          string;
  llm_calls_used?:        number;
  executed_at?:           string;
  created_at?:            string;
  updated_at?:            string;
}

type TaskStatus = 'pending' | 'running' | 'fix_ready' | 'applied' | 'verifying' | 'done' | 'skipped' | 'failed';

interface AuditFinding {
  audit_kind:      string;
  severity:        string;
  finding_title:   string;
  finding_detail?: string;
  recommendation?: string;
  evidence?:       Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// CMS DETECTION
// Reads live page HTML to detect the platform.
// Falls back to project-stored value if available.
// Never throws — returns 'unknown' if detection fails.
// ─────────────────────────────────────────────────────────────

export async function detectCmsFromHtml(html: string): Promise<CmsContext> {
  // WordPress
  if (/wp-content|wp-includes/i.test(html)) {
    const sp: SeoPlugin = /yoast/i.test(html) ? 'yoast' : /rank.?math/i.test(html) ? 'rankmath' : /aioseo/i.test(html) ? 'aioseo' : /seopress/i.test(html) ? 'seopress' : 'unknown';
    return { platform: 'wordpress', seoPlugin: sp, confidence: 97, signals: ['wp-content/wp-includes in HTML'], adminPath: '/wp-admin' };
  }
  if (/data-wf-site|webflow\.com\/css|\.webflow\.com/i.test(html))
    return { platform: 'webflow', seoPlugin: 'none', confidence: 97, signals: ['Webflow attribute or CDN'], adminPath: 'https://webflow.com/dashboard' };
  if (/squarespace-cdn\.com|sqs-layout|\.sqspcdn\.com/i.test(html))
    return { platform: 'squarespace', seoPlugin: 'none', confidence: 97, signals: ['Squarespace CDN'], adminPath: '/config' };
  if (/parastorage\.com|wixsite\.com|_wix_|static\.wixstatic/i.test(html))
    return { platform: 'wix', seoPlugin: 'none', confidence: 95, signals: ['Wix storage or domain'], adminPath: 'https://manage.wix.com' };
  if (/cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(html))
    return { platform: 'shopify', seoPlugin: 'none', confidence: 97, signals: ['Shopify CDN'], adminPath: '/admin' };
  if (/hs-scripts\.com|hubspot\.com\/hs|hbspt\.|hs-beacon\.com/i.test(html))
    return { platform: 'hubspot', seoPlugin: 'none', confidence: 95, signals: ['HubSpot script'], adminPath: 'https://app.hubspot.com' };
  if (/Drupal\.settings|\/sites\/default\/files|drupal-/i.test(html))
    return { platform: 'drupal', seoPlugin: 'unknown', confidence: 92, signals: ['Drupal JS variable or path'], adminPath: '/admin' };
  if (/ghost\.io|content\.ghost\.io|data-ghost-/i.test(html))
    return { platform: 'ghost', seoPlugin: 'none', confidence: 93, signals: ['Ghost CDN or attribute'], adminPath: '/ghost' };
  if (/framer\.com|framerusercontent\.com/i.test(html))
    return { platform: 'framer', seoPlugin: 'none', confidence: 93, signals: ['Framer CDN'], adminPath: 'https://framer.com' };

  return {
    platform: 'custom', seoPlugin: 'unknown', confidence: 40,
    signals: ['No known CMS fingerprint — likely custom-built or headless'],
    adminPath: '',
  };
}

export function normaliseCmsPlatform(s: string): CmsPlatform {
  const lower = s.toLowerCase().trim();
  if (lower.includes('wordpress') || lower === 'wp') return 'wordpress';
  if (lower.includes('webflow'))     return 'webflow';
  if (lower.includes('squarespace')) return 'squarespace';
  if (lower.includes('wix'))         return 'wix';
  if (lower.includes('shopify'))     return 'shopify';
  if (lower.includes('hubspot'))     return 'hubspot';
  if (lower.includes('drupal'))      return 'drupal';
  if (lower.includes('joomla'))      return 'joomla';
  if (lower.includes('ghost'))       return 'ghost';
  if (lower.includes('framer'))      return 'framer';
  if (lower.includes('custom'))      return 'custom';
  return 'unknown';
}

function cmsAdminPath(p: CmsPlatform): string {
  const paths: Partial<Record<CmsPlatform, string>> = {
    wordpress: '/wp-admin', squarespace: '/config', shopify: '/admin',
    drupal: '/admin', joomla: '/administrator', ghost: '/ghost',
    webflow: 'https://webflow.com/dashboard', wix: 'https://manage.wix.com',
    hubspot: 'https://app.hubspot.com', framer: 'https://framer.com',
  };
  return paths[p] || '';
}

// ─────────────────────────────────────────────────────────────
// LIVE PAGE FETCH
// Fetches the live page HTML for CMS detection, snapshotting,
// and accurate fix generation. Robust — never throws.
// Returns empty string on any failure, caller handles gracefully.
// ─────────────────────────────────────────────────────────────

export async function fetchPageHtml(url: string, timeoutMs = 20000): Promise<{ html: string; fetchedOk: boolean; errorMsg?: string }> {
  if (!url) return { html: '', fetchedOk: false, errorMsg: 'No URL provided' };
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { html: '', fetchedOk: false, errorMsg: `HTTP ${res.status} ${res.statusText}` };
    }
    const raw = await res.text();
    // Limit to 120KB — beyond this, the <head> section (what matters) is already captured
    return { html: raw.slice(0, 120_000), fetchedOk: true };
  } catch (e: any) {
    const msg = e?.name === 'TimeoutError' ? `Page fetch timed out after ${timeoutMs}ms` : (e?.message || 'Fetch failed');
    return { html: '', fetchedOk: false, errorMsg: msg };
  }
}

// ─────────────────────────────────────────────────────────────
// SNAPSHOT
// Captures only the HTML elements relevant to the task type.
// Stored before any fix is applied — the safety net.
// ─────────────────────────────────────────────────────────────

export function snapshotRelevantHtml(taskType: string, html: string): string {
  if (!html) return '';

  const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
  const head = headMatch?.[0] || '';

  switch (taskType) {
    case 'lcp_fix':
    case 'script_defer': {
      // All <script> tags from <head> — these are the blocking candidates
      const scripts = head.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi)
        || head.match(/<script\b[^>]*/gi) || [];
      return scripts.slice(0, 30).join('\n');
    }
    case 'lazy_loading': {
      const imgs = html.match(/<img\b[^>]*>/gi) || [];
      return imgs.slice(0, 40).join('\n');
    }
    case 'image_format': {
      const imgs = html.match(/<img\b[^>]*src=["'][^"']*\.(?:jpg|jpeg|png|gif)[^"']*["'][^>]*>/gi) || [];
      return imgs.slice(0, 40).join('\n');
    }
    case 'faq_schema':
    case 'date_modified_schema': {
      const schemas = html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
      return schemas.join('\n\n');
    }
    case 'h1_update': {
      return (html.match(/<h1\b[\s\S]*?<\/h1>/i) || [])[0] || '';
    }
    case 'first_para': {
      const paras = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
      return paras.slice(0, 5).join('\n');
    }
    case 'h2_section': {
      const headings = html.match(/<h[23]\b[^>]*>[\s\S]*?<\/h[23]>/gi) || [];
      return headings.slice(0, 20).join('\n');
    }
    case 'meta_desc': {
      return (html.match(/<meta[^>]*name=["']description["'][^>]*>/i) || [])[0] || '';
    }
    default:
      // Generic: head + first 3KB of body
      return head + html.slice(0, 3000);
  }
}

export async function saveSnapshot(taskId: string, projectId: string, taskType: string, url: string, snapshot: string): Promise<string | null> {
  if (!taskId || !snapshot) return null;
  try {
    const { data, error } = await db()
      .from('dev_task_snapshots')
      .insert({ task_id: taskId, project_id: projectId, task_type: taskType, url, snapshot })
      .select('id')
      .single();
    if (error) {
      console.error('[dev-engine] saveSnapshot error:', error.message);
      return null;
    }
    return (data as any)?.id || null;
  } catch (e: any) {
    console.error('[dev-engine] saveSnapshot threw:', e?.message);
    return null;
  }
}

export async function loadSnapshot(taskId: string): Promise<{ snapshot: string; captured_at: string } | null> {
  try {
    const { data } = await db()
      .from('dev_task_snapshots')
      .select('snapshot, captured_at')
      .eq('task_id', taskId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as any) || null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// EXECUTE TASK
//
// ARCHITECTURE: This function is called AFTER the HTTP response
// has already been sent to the client (fire-and-forget pattern
// in task-engine.ts). It can take as long as it needs.
//
// Flow:
//   1. Fetch live page HTML (with generous timeout)
//   2. Detect CMS from HTML (no separate fetch)
//   3. Snapshot relevant elements (before any change)
//   4. Call AI to generate fix code + analysis
//   5. Build human-readable apply instructions for the detected CMS
//   6. Build rollback instructions
//   7. Write all results to dev_tasks table
//
// On any failure: writes status='failed' with a useful error message.
// The client polling loop reads whatever status is in the DB.
// ─────────────────────────────────────────────────────────────

export async function executeDevTask(task: DevTask): Promise<void> {
  const taskId = task.id!;

  try {
    // ── Step 1: Fetch live page ──────────────────────────────────
    // Use Googlebot UA so we see the same page Google sees.
    // 25s timeout — generous for slow sites.
    const { html: pageHtml, fetchedOk, errorMsg: fetchError } = await fetchPageHtml(task.target_url || '', 25000);

    // ── Step 2: Detect CMS ──────────────────────────────────────
    // Detection runs on the fetched HTML so we get the true CMS.
    // If the page didn't load, fall back to stored project value.
    let cms: CmsContext;
    if (fetchedOk && pageHtml) {
      cms = await detectCmsFromHtml(pageHtml);
    } else {
      const platform = normaliseCmsPlatform(task.cms_platform || 'unknown');
      cms = { platform, seoPlugin: 'unknown', confidence: 30, signals: ['Page fetch failed — using stored value'], adminPath: cmsAdminPath(platform) };
    }

    // ── Step 3: Snapshot relevant elements ──────────────────────
    // BEFORE generating any fix — this is the safety net for rollback.
    const snapshotHtml = snapshotRelevantHtml(task.task_type, pageHtml);
    const snapshotId = await saveSnapshot(taskId, task.project_id, task.task_type, task.target_url || '', snapshotHtml);

    // ── Step 4: Build AI prompt ──────────────────────────────────
    // We give Claude: the audit finding data + the relevant live HTML section.
    // The audit provides the WHY (metrics, severity). The live HTML provides the WHAT
    // (exact script tags, img tags, schema blocks). Together they produce accurate fixes.
    const { sys, usr } = buildExecutionPrompt(task, snapshotHtml, cms, fetchedOk, fetchError);

    // ── Step 5: Call AI ──────────────────────────────────────────
    let analysis = '', fixCode = '', fixLanguage = 'html', paaQuestions: string[] = [];
    let llmCalls = 0;

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          system: sys,
          messages: [{ role: 'user', content: usr }],
        }),
        signal: AbortSignal.timeout(60000), // 60s — AI can take time on complex fixes
      });
      llmCalls++;
      const data = await resp.json() as any;
      const rawText = (data?.content?.[0]?.text || '').trim();

      // Extract JSON from response — Claude sometimes wraps it in markdown
      const jsonMatch = rawText.match(/\{[\s\S]+\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          analysis      = parsed.analysis      || '';
          fixCode       = parsed.fix_code       || '';
          fixLanguage   = parsed.fix_language   || 'html';
          paaQuestions  = Array.isArray(parsed.paa_questions) ? parsed.paa_questions : [];
        } catch {
          analysis = rawText.slice(0, 800);
        }
      } else {
        analysis = rawText.slice(0, 800);
      }
    } catch (aiErr: any) {
      analysis = `AI call failed: ${aiErr?.message || 'unknown error'}. The fix code could not be generated. Retry the task.`;
    }

    // ── Step 6: Build instructions ───────────────────────────────
    const applyInstructions    = buildApplyInstructions(task, cms, { fixCode, paaQuestions });
    const rollbackInstructions = buildRollbackInstructions(task, cms.platform, snapshotHtml);
    const verificationMethod   = buildVerificationMethod(task);

    // ── Step 7: Write results ────────────────────────────────────
    await updateTask(taskId, {
      status:                'fix_ready',
      analysis:              analysis || (fetchedOk ? 'Analysis complete.' : `Note: page could not be fetched (${fetchError}). Fix code generated from audit data.`),
      fix_code:              fixCode,
      fix_language:          fixLanguage,
      apply_instructions:    applyInstructions,
      rollback_code:         snapshotHtml || '<!-- Page was not reachable — no snapshot available -->',
      rollback_instructions: rollbackInstructions,
      verification_method:   verificationMethod,
      snapshot_id:           snapshotId || undefined,
      backup_confirmed:      false,
      cms_platform:          cms.platform,
      llm_calls_used:        llmCalls,
      updated_at:            new Date().toISOString(),
    });

  } catch (unexpectedErr: any) {
    // Last resort — always write a clean failure state so the UI can show Retry
    await updateTask(taskId, {
      status:   'failed',
      analysis: `Unexpected error: ${unexpectedErr?.message || 'unknown'}. Click Retry.`,
      updated_at: new Date().toISOString(),
    }).catch(() => {}); // if even this fails, nothing we can do
  }
}

// ─────────────────────────────────────────────────────────────
// AI PROMPT BUILDER
// Builds prompts from:
//   - Task finding data (title, detail, evidence — from audit)
//   - Live page HTML snapshot (actual elements to fix)
//   - CMS context (which platform to write code for)
// Prompts are generic — work for any site, any keyword, any page.
// ─────────────────────────────────────────────────────────────

function buildExecutionPrompt(
  task: DevTask,
  snapshotHtml: string,
  cms: CmsContext,
  pageWasFetched: boolean,
  fetchError?: string,
): { sys: string; usr: string } {
  const sys = [
    'You are a senior web developer generating precise, copy-paste-ready code fixes for SEO and performance issues.',
    'You are given:',
    '  1. Audit finding data (the problem + metrics from a live audit)',
    '  2. Live page HTML (the relevant elements from the actual page)',
    '  3. CMS context (platform and SEO plugin)',
    '',
    'Your job: analyze the specific problem on THIS page and generate the exact fix.',
    'Be precise — reference actual elements, script URLs, class names from the HTML.',
    'If live HTML is available, use it. If not, generate the most common pattern for this CMS.',
    '',
    'CMS: ' + cms.platform + (cms.seoPlugin !== 'unknown' && cms.seoPlugin !== 'none' ? ' with ' + cms.seoPlugin + ' SEO plugin' : ''),
    pageWasFetched ? 'Live page: fetched successfully' : 'Live page: could not be fetched (' + (fetchError || 'unknown') + ') — generate based on audit data and CMS patterns',
    '',
    'Reply with ONLY valid JSON (no markdown fences):',
    '{',
    '  "analysis": "2-4 sentences. Reference specific elements/scripts/metrics from the data. Explain what is causing the problem and why this fix resolves it.",',
    '  "fix_code": "Complete, copy-paste-ready code. No placeholders like [YOUR_VALUE]. Must be ready to deploy.",',
    '  "fix_language": "html | json | javascript | bash | text",',
    '  "paa_questions": ["verbatim question strings if this is faq_schema or h2_section, else empty array"]',
    '}',
  ].join('\n');

  const finding = [
    '=== AUDIT FINDING ===',
    'Task: ' + task.title,
    'Type: ' + task.task_type,
    'Severity: ' + task.severity,
    'URL: ' + (task.target_url || 'unknown'),
    'Finding: ' + (task.finding_title || ''),
    task.finding_detail ? 'Detail: ' + task.finding_detail.slice(0, 500) : '',
    '',
    '=== LIVE PAGE HTML (relevant section) ===',
    snapshotHtml ? snapshotHtml.slice(0, 8000) : '[Not available — page fetch failed]',
  ].filter(Boolean).join('\n');

  const taskInstructions: Record<string, string> = {
    lcp_fix: [
      finding,
      '',
      '=== TASK ===',
      'The LCP (Largest Contentful Paint) is critically slow due to render-blocking JavaScript.',
      'Evidence: TTFB is fast but TBT (Total Blocking Time) is high — this confirms the bottleneck',
      'is JavaScript executing on the main thread before the page renders.',
      '',
      'From the script tags above, identify which ones:',
      '  - Are in <head> without defer or async',
      '  - Are third-party (analytics, chat, tag managers, CRM widgets, ad scripts)',
      '  - Are non-critical for initial render',
      '',
      'Generate the modified <script> tags with defer added. Show BEFORE and AFTER for each.',
      'Also explain HOW to find the specific blocking tasks using Chrome DevTools → Performance → Long Tasks.',
    ].join('\n'),

    script_defer: [
      finding,
      '',
      '=== TASK ===',
      'High TBT indicates render-blocking scripts. From the script tags above, identify blocking candidates.',
      'Generate modified script tags with defer or async. Show BEFORE and AFTER.',
      'Include Chrome DevTools Long Tasks profiling steps.',
    ].join('\n'),

    lazy_loading: [
      finding,
      '',
      '=== TASK ===',
      'The image tags above show 0% have loading="lazy". ',
      'For each img tag, determine if it is above or below the fold:',
      '  - First 1-2 content images: keep as eager (no change)',
      '  - All others: add loading="lazy"',
      '',
      'If this is ' + cms.platform + ' and no code access, generate a complete JavaScript snippet',
      'that adds loading="lazy" to all images except the first 2 — ready to paste into a footer.',
      'The snippet: document.querySelectorAll("img:not(:nth-child(-n+2))").forEach(img => img.loading = "lazy")',
      'wrapped in a <script> tag with a DOMContentLoaded listener.',
    ].join('\n'),

    image_format: [
      finding,
      '',
      '=== TASK ===',
      'The images above use legacy formats (jpg/png/gif).',
      'For ' + cms.platform + ': generate the recommended approach (plugin or CDN setting).',
      'Also generate a Node.js script using "sharp" that reads all images in a directory',
      'and outputs webp versions at 85% quality.',
    ].join('\n'),

    faq_schema: [
      finding,
      '',
      '=== TASK ===',
      'The page is missing FAQPage JSON-LD schema.',
      'Look at the existing schema blocks in the HTML above. Build on them if present.',
      '',
      'Extract the actual page topic from: URL=' + (task.target_url || '') + ' and finding detail.',
      'Generate a FAQPage JSON-LD block with 4 questions relevant to this page topic.',
      'Each answer must be 50-80 words — direct, factual, citation-eligible.',
      'Return question strings in paa_questions array.',
      '',
      'For ' + cms.platform + ': provide the exact location to paste this code.',
    ].join('\n'),

    h1_update: [
      finding,
      '',
      '=== TASK ===',
      'Current H1 is shown in the HTML above.',
      'The campaign keyword is NOT in the H1. Extract the keyword from the finding detail.',
      '',
      'Generate 3 H1 options that:',
      '  - Include the campaign keyword naturally (not forced)',
      '  - Preserve the page\'s commercial intent',
      '  - Are 5-10 words',
      '  - Read naturally for humans',
      'Rank them 1-3 with one-sentence rationale. Return all 3 in fix_code.',
    ].join('\n'),

    first_para: [
      finding,
      '',
      '=== TASK ===',
      'Current first paragraph is shown in the HTML above.',
      'It has low keyword overlap — the campaign keyword is barely present.',
      'Extract the keyword from the finding detail.',
      '',
      'Write a replacement first paragraph:',
      '  - 60-100 words',
      '  - Contains the campaign keyword in the first sentence',
      '  - Opens with the specific problem the searcher is trying to solve',
      '  - Names who this product/page is for',
      '  - Previews the key differentiator',
      '  - No generic filler phrases',
      'Return ONLY the new paragraph text in fix_code.',
    ].join('\n'),

    h2_section: [
      finding,
      '',
      '=== TASK ===',
      'Existing H2 structure shown above. PAA questions from the finding detail are unanswered.',
      'Extract the unanswered PAA questions from the finding detail.',
      '',
      'For each unanswered question, generate:',
      '  - The exact H2 tag (verbatim question text — Google matches this)',
      '  - A 50-80 word direct answer paragraph (citation-eligible)',
      '  - A 250-350 word body section with practical guidance',
      '  - Honest mention of alternative solutions where relevant',
      '',
      'Return complete HTML, list question strings in paa_questions.',
    ].join('\n'),

    date_modified_schema: [
      finding,
      '',
      '=== TASK ===',
      'Existing schema blocks shown above.',
      'Add "dateModified" set to today\'s date (' + "2026-05-26" + ') to the most relevant schema block.',
      'Return the complete updated schema block.',
      'Also generate a small visible HTML label: <p class="last-updated">Last updated: [date]</p>',
    ].join('\n'),

    gsc_indexing: [
      finding,
      '',
      '=== TASK ===',
      'Page is not in GSC — 0 organic impressions.',
      'Check the HTML above for indexing blockers:',
      '  - <meta name="robots" content="noindex"> or similar',
      '  - X-Robots-Tag reference in HTML',
      '  - Canonical pointing to a different URL',
      '  - nofollow on important links',
      '',
      'List what you find. If none found, say so explicitly.',
      'Generate a step-by-step GSC URL Inspection checklist in fix_code as plain text.',
    ].join('\n'),

    meta_desc: [
      finding,
      '',
      '=== TASK ===',
      'Current meta description shown above.',
      'Generate 3 meta description options (150-160 chars each):',
      '  - Include the campaign keyword',
      '  - Include a clear benefit or differentiator',
      '  - End with a soft CTA where natural',
      'For ' + cms.platform + ': provide exact location to update it.',
    ].join('\n'),
  };

  const usr = taskInstructions[task.task_type] || [
    finding,
    '',
    '=== TASK ===',
    'Generate the exact fix code for this task. Reference specific elements from the HTML above.',
    'Provide clear application instructions for ' + cms.platform + '.',
  ].join('\n');

  return { sys, usr };
}

// ─────────────────────────────────────────────────────────────
// APPLY INSTRUCTIONS
// CMS-specific, non-technical, step-by-step.
// Built from task data + detected CMS — works for any site.
// ─────────────────────────────────────────────────────────────

export function buildApplyInstructions(
  task: DevTask,
  cms: CmsContext,
  opts: { fixCode?: string; paaQuestions?: string[] },
): string {
  const p  = cms.platform;
  const pl = cms.seoPlugin;
  const url = task.target_url || 'your page URL';
  const qs  = opts.paaQuestions || [];
  const out: string[] = [];

  // Prerequisites
  out.push('## Before you start');
  if (p === 'wordpress') {
    out.push('- Log in to your WordPress dashboard');
    out.push('- You need **Editor** or **Administrator** access');
    if (pl === 'yoast')    out.push('- You have **Yoast SEO** installed — these steps use it');
    if (pl === 'rankmath') out.push('- You have **RankMath SEO** installed — these steps use it');
  } else if (p === 'webflow') {
    out.push('- Log in at **https://webflow.com/dashboard** and open your project in the Designer');
  } else if (p === 'squarespace') {
    out.push('- Log in to Squarespace and navigate to your site');
  } else if (p === 'wix') {
    out.push('- Log in at **https://manage.wix.com** and click Edit Site');
  } else if (p === 'shopify') {
    out.push('- Log in to your Shopify admin');
  } else if (p === 'hubspot') {
    out.push('- Log in at **https://app.hubspot.com** → Marketing → Website → Website Pages');
  } else {
    out.push('- Access your website files or CMS admin panel');
    out.push('- You need to edit the HTML of: **' + url + '**');
  }
  out.push('');

  // Task steps
  switch (task.task_type) {
    case 'lcp_fix':
    case 'script_defer':
      out.push('## Steps to fix render-blocking JavaScript');
      out.push('');
      out.push('> **What this does:** JavaScript files loading before the page renders cause slow load times. Adding `defer` tells the browser: show the page first, then run the JavaScript. This is the highest-priority fix.');
      out.push('');
      out.push('⚠️ **This is a developer task.** If you are not comfortable editing code files, share the Fix Code tab with your developer.');
      out.push('');
      if (p === 'wordpress') {
        out.push('**Recommended: use a plugin (no coding required)**');
        out.push('');
        out.push('**WP Rocket (paid):** Settings → WP Rocket → File Optimization → Defer JS Execution → Save → Purge Cache');
        out.push('');
        out.push('**Autoptimize (free):** Plugins → Add New → Autoptimize → Settings → JavaScript → Defer scripts → Save and Empty Cache');
        out.push('');
        out.push('**Manual (developer):** Apply the BEFORE/AFTER changes shown in Fix Code. Open your theme\'s functions.php or use a child theme.');
      } else if (p === 'webflow') {
        out.push('1. Project Settings → Custom Code');
        out.push('2. Move scripts from **Head Code** to **Footer Code**');
        out.push('3. For scripts that must stay in head: add `defer` attribute as shown in Fix Code');
        out.push('4. Publish');
      } else if (p === 'squarespace') {
        out.push('1. Settings → Advanced → Code Injection');
        out.push('2. Move `<script>` tags from Header to Footer');
        out.push('3. For header-only scripts: add `defer` attribute → Save');
      } else if (p === 'hubspot') {
        out.push('1. Settings → Website → Pages → Custom Code → Footer HTML');
        out.push('2. Move non-critical scripts to the footer');
        out.push('3. Add `defer` to remaining head scripts → Publish');
      } else {
        out.push('Apply the changes from Fix Code. Your developer needs to add `defer` to the `<script>` tags identified in the analysis.');
      }
      break;

    case 'lazy_loading':
      out.push('## Steps to add lazy loading to images');
      out.push('');
      out.push('> **What this does:** loads images only when the user scrolls to them — saving bandwidth and improving perceived load time. No visual change for visitors.');
      out.push('');
      if (p === 'wordpress') {
        out.push('**WordPress 5.5+ adds this automatically.** Verify it is working:');
        out.push('1. Right-click any image below the fold on your live page → Inspect');
        out.push('2. Check for `loading="lazy"` on the `<img>` tag');
        out.push('3. If missing, add the code snippet from Fix Code to **Appearance → Theme Editor → footer.php** (or use a plugin like Autoptimize → Extra → Lazy-load images)');
      } else if (p === 'webflow') {
        out.push('1. Open the page in Webflow Designer');
        out.push('2. Click each image below the first screen → right panel → **Loading → Lazy**');
        out.push('3. Keep the hero/first image as **Eager**');
        out.push('4. Publish');
      } else if (p === 'squarespace' || p === 'wix' || p === 'hubspot') {
        out.push('1. Go to **Settings → Advanced → Code Injection** (location varies by platform)');
        out.push('2. In the **Footer** / **Body End** box, paste the JavaScript snippet from Fix Code');
        out.push('3. Save / Publish');
      } else if (p === 'shopify') {
        out.push('1. Online Store → Themes → Actions → Edit Code');
        out.push('2. Open `layout/theme.liquid`');
        out.push('3. Before `</body>`, paste the JavaScript snippet from Fix Code → Save');
      } else {
        out.push('Paste the JavaScript snippet from Fix Code before the `</body>` tag in your page template.');
      }
      break;

    case 'image_format':
      out.push('## Steps to convert images to modern format (webp/avif)');
      out.push('');
      out.push('> **What this does:** webp is typically 30-50% smaller than jpg/png at the same quality. Reduces load time, especially on mobile.');
      out.push('');
      if (p === 'wordpress') {
        out.push('**Recommended plugin (free tier available):**');
        out.push('1. Plugins → Add New → search **Imagify** → Install → Activate');
        out.push('2. Settings → Imagify → check **Convert to WebP**');
        out.push('3. Click **Bulk Optimize** to convert existing images → future uploads auto-convert');
        out.push('');
        out.push('Alternatives: **ShortPixel** or **Smush** — both have free tiers and identical webp conversion settings.');
      } else if (p === 'webflow' || p === 'squarespace' || p === 'shopify') {
        out.push(p.charAt(0).toUpperCase() + p.slice(1) + ' **automatically serves WebP** for compatible browsers via its CDN.');
        out.push('No action required. To verify: right-click an image → Open in new tab → check URL ends in `.webp`.');
      } else {
        out.push('Run the conversion script from Fix Code on your image directory. Then re-upload the .webp files.');
        out.push('Alternatively: add Cloudflare in front of your site (free plan) — it converts images to webp automatically.');
      }
      break;

    case 'faq_schema':
      out.push('## Steps to add FAQPage structured data');
      out.push('');
      out.push('> **What this does:** registers your Q&A content with Google. Can unlock "People Also Ask" appearances in search results and citations in AI Overviews. Invisible to visitors — search engines only.');
      out.push('');
      if (p === 'wordpress' && pl === 'yoast') {
        out.push('1. Pages → All Pages → find your page → **Edit**');
        out.push('2. In the block editor: click **+** → search **FAQ** → select **Yoast FAQ Block**');
        if (qs.length > 0) { out.push('3. Add these questions and their answers:'); qs.forEach((q, i) => out.push('   - Q' + (i+1) + ': ' + q)); out.push('4. Yoast generates the schema automatically'); }
        out.push('5. Click **Update**');
      } else if (p === 'wordpress' && pl === 'rankmath') {
        out.push('1. Edit your page → click **+** → add **RankMath FAQ Block**');
        out.push('2. Add questions and answers → click **Update**');
      } else if (p === 'wordpress') {
        out.push('1. Edit your page → add a **Custom HTML block** at the bottom');
        out.push('2. Paste the JSON-LD from Fix Code → click **Update**');
      } else if (p === 'webflow') {
        out.push('1. Click page gear icon ⚙ → Page Settings → **Custom Code → Head Code**');
        out.push('2. Paste the JSON-LD from Fix Code → Save → Publish');
      } else if (p === 'squarespace') {
        out.push('1. Pages → hover your page → gear ⚙ → Page Settings → **Advanced** tab');
        out.push('2. In **Page Header Code Injection**, paste the JSON-LD → Save');
      } else if (p === 'wix') {
        out.push('1. Page → SEO → Additional SEO Settings → **Structured Data Markup** → Add Item');
        out.push('2. Paste the JSON-LD → Apply → Publish');
      } else if (p === 'shopify') {
        out.push('1. Online Store → Themes → Actions → Edit Code → `layout/theme.liquid`');
        out.push('2. Find `</head>` → paste JSON-LD just before it → Save');
      } else if (p === 'hubspot') {
        out.push('1. Edit your page → Settings tab → Advanced Options → **Head HTML**');
        out.push('2. Paste the JSON-LD → Update → Publish');
      } else {
        out.push('Paste the JSON-LD from Fix Code inside `<head>`, just before `</head>` in your page HTML.');
      }
      break;

    case 'h1_update':
      out.push('## Steps to update the H1 heading');
      out.push('');
      out.push('> **What this does:** the H1 is the main heading Google reads to understand what this page is about. If the target keyword is absent from the H1, it directly weakens relevance signals.');
      out.push('');
      if (p === 'wordpress') {
        out.push('1. Pages → All Pages → find your page → **Edit**');
        out.push('2. The H1 is the large text at the very top of the editor — click on it');
        out.push('3. Change to Option 1 from Fix Code (or the option that best preserves existing keyword rankings)');
        out.push('4. **Before saving:** check GSC → Performance → Pages → this URL → Queries tab. Note any keywords with >10 impressions and ensure the new H1 preserves those terms.');
        out.push('5. Click **Update**');
      } else if (p === 'webflow') {
        out.push('1. Open page in Webflow Designer → double-click the main heading');
        out.push('2. Change text → confirm the right panel shows **H1** as the element type');
        out.push('3. Publish');
      } else {
        out.push('1. Find `<h1>` in your page content');
        out.push('2. Replace its text with Option 1 from Fix Code');
        out.push('3. Save and publish');
      }
      break;

    case 'first_para':
      out.push('## Steps to update the opening paragraph');
      out.push('');
      out.push('> **What this does:** Google reads the first paragraph to understand the page topic. A generic tagline weakens relevance. A keyword-aligned opener improves topical signals.');
      out.push('');
      if (p === 'wordpress') {
        out.push('1. Pages → All Pages → edit your page');
        out.push('2. Scroll to the first paragraph block below the H1');
        out.push('3. Select all text in that block → replace with the text from Fix Code');
        out.push('4. Click **Update**');
      } else if (p === 'webflow') {
        out.push('1. Open page in Webflow Designer → double-click the first paragraph');
        out.push('2. Select all → paste new text from Fix Code → Publish');
      } else {
        out.push('1. Find the first `<p>` tag after your H1 in the page HTML');
        out.push('2. Replace its content with the text from Fix Code');
        out.push('3. Save and publish');
      }
      break;

    case 'h2_section':
      out.push('## Steps to add new H2 sections');
      out.push('');
      out.push('> **What this does:** Google shows "People Also Ask" questions in search results. Pages with a matching H2 and direct answer can win the PAA citation and be referenced in AI Overviews. Each question needs the verbatim H2 and a direct 50-80 word answer immediately below.');
      out.push('');
      if (qs.length > 0) { out.push('Questions to add as H2 sections:'); qs.forEach((q, i) => out.push('- ' + (i+1) + '. ' + q)); out.push(''); }
      if (p === 'wordpress') {
        out.push('1. Pages → All Pages → edit your page');
        out.push('2. Click at the end of your existing content');
        out.push('3. Add a **Heading block** → set level to **H2** → type the question exactly as shown');
        out.push('4. Below it, add a **Paragraph block** with the answer from Fix Code (open with the direct answer)');
        out.push('5. Repeat for each question → click **Update**');
      } else if (p === 'webflow') {
        out.push('1. Open page in Webflow Designer → drag in a Heading component at the end of content');
        out.push('2. Set to **H2** → type the question text exactly → add Text Block below with answer');
        out.push('3. Repeat for each question → Publish');
      } else {
        out.push('Paste the complete HTML from Fix Code into your page content area, after the existing sections.');
      }
      break;

    case 'gsc_indexing':
      out.push('## Steps to submit for Google indexing');
      out.push('');
      out.push('> **What this does:** if Google has not indexed this page, no SEO work will produce ranking results. Indexing is the prerequisite for everything else.');
      out.push('');
      out.push('**You need access to Google Search Console for this website.**');
      out.push('');
      out.push('1. Go to **https://search.google.com/search-console**');
      out.push('2. Select the correct property for this website');
      out.push('3. Paste this URL in the search bar at the top: `' + url + '`');
      out.push('4. Press Enter — GSC checks the indexing status');
      out.push('5. **If "URL is not on Google":** click **Request Indexing** → Google crawls within 24-48 hours');
      out.push('6. **If "URL is on Google":** page is indexed but has low impressions — the LCP/performance fix is the priority');
      out.push('7. Return in 3-5 days to check if impressions appear in GSC → Performance');
      break;

    case 'date_modified_schema':
      out.push('## Steps to add dateModified to schema');
      out.push('');
      out.push('> **What this does:** adds a verified freshness date to your structured data. More reliable than the Last-Modified HTTP header for signaling content recency to Google.');
      out.push('');
      if (p === 'wordpress') {
        out.push('1. Edit your page → add a **Custom HTML block** at the bottom');
        out.push('2. Paste the updated schema from Fix Code');
        out.push('3. Also add a visible "Last updated: [date]" line near the top of the content');
        out.push('4. Click **Update**');
      } else {
        out.push('1. Find the `<script type="application/ld+json">` block in your page head');
        out.push('2. Replace it with the updated block from Fix Code');
        out.push('3. Also add the visible "Last updated" label from Fix Code to the page body');
        out.push('4. Save and publish');
      }
      break;

    default:
      out.push('## Steps to apply this fix');
      out.push('');
      out.push('Follow the instructions in the Analysis section, or share the Fix Code with your developer.');
  }

  out.push('');
  out.push('---');
  out.push('');
  out.push('## After applying');
  out.push('Click **"I Applied the Fix"** button above, then **"Verify on Live Page"** — Manav will re-fetch your page and confirm the change is in place.');

  return out.join('\n');
}

// ─────────────────────────────────────────────────────────────
// ROLLBACK INSTRUCTIONS
// Generic — works for any site, any keyword.
// ─────────────────────────────────────────────────────────────

export function buildRollbackInstructions(task: DevTask, platform: CmsPlatform, snapshot: string): string {
  const out: string[] = [];
  out.push('## How to undo this change');
  out.push('');
  out.push('> Use this only if the change caused a visible problem. Normal SEO changes (H1 text, schema, lazy loading) cannot break a site — they only affect rankings.');
  out.push('');

  const undoMap: Record<string, string> = {
    lcp_fix:              'Remove the `defer` or `async` attribute from the script tags that were modified. Original script tags are in the Snapshot below.',
    script_defer:         'Remove the `defer` or `async` attribute from the modified script tags. Originals in Snapshot.',
    lazy_loading:         'Remove `loading="lazy"` from the image tags, or remove the JavaScript snippet from your footer code injection. Original img tags in Snapshot.',
    image_format:         'Re-upload the original jpg/png files. WordPress image plugins keep originals — look for "Restore Originals" in the plugin settings.',
    faq_schema:           'Find and delete the `<script type="application/ld+json">` block containing `"@type":"FAQPage"` from your page head.',
    h1_update:            'Change the H1 back to the original text shown in the Snapshot below.',
    first_para:           'Replace the first paragraph with the original text shown in the Snapshot below.',
    h2_section:           'Delete the new H2 heading and paragraph blocks that were added at the bottom of the content.',
    date_modified_schema: 'Remove the `dateModified` field from the JSON-LD schema block. Original schema in Snapshot.',
    gsc_indexing:         'No code was changed — this was a GSC URL Inspection request. Nothing to undo on the site.',
    meta_desc:            'Revert the meta description to the original text shown in the Snapshot.',
  };

  out.push('**What to revert:** ' + (undoMap[task.task_type] || 'Refer to the Snapshot below for the original HTML state.'));
  out.push('');

  // CMS-specific undo navigation
  out.push('## CMS-specific undo steps');
  out.push('');
  if (platform === 'wordpress') {
    out.push('**Fastest: WordPress Revisions**');
    out.push('1. In the page editor, find **Revisions** in the right sidebar (Document tab)');
    out.push('2. Slide back to the version before this change → click **Restore This Revision**');
    out.push('');
    out.push('**Manual revert:** Pages → All Pages → edit → make the change → Update');
  } else if (platform === 'webflow') {
    out.push('1. In Webflow Designer, click the **History** panel (clock icon in left toolbar)');
    out.push('2. Click the version before this change was published → Restore → Publish');
  } else if (platform === 'squarespace') {
    out.push('Edit the page and manually revert the change. For Code Injection: Settings → Advanced → Code Injection → remove the added code.');
  } else if (platform === 'hubspot') {
    out.push('Edit the page → Settings → Advanced Options → revert the Head HTML → Update → Publish');
  } else {
    out.push('Log in to your CMS → navigate to the changed page → revert the change → save and publish.');
  }

  out.push('');
  out.push('## Last resort: full site restore');
  out.push('- **WordPress:** cPanel → Backup → restore files + database to before this change');
  out.push('- **WP Engine / Kinsta / Flywheel:** Dashboard → Backups → Restore Point');
  out.push('- **Webflow:** contact Webflow Support — they retain full backup history');
  out.push('- **Shopify:** Apps → Rewind Backups (free plan available) → restore theme');
  out.push('- **Any host:** call your hosting provider and ask for a server-level file restore to yesterday');

  return out.join('\n');
}

// ─────────────────────────────────────────────────────────────
// VERIFICATION
// ─────────────────────────────────────────────────────────────

export function buildVerificationMethod(task: DevTask): string {
  const url = task.target_url || 'your page URL';
  const methods: Record<string, string> = {
    lcp_fix:              `After deploying, run PageSpeed Insights at https://pagespeed.web.dev for ${url} (Mobile mode). TBT should be < 300ms and LCP should improve. Note: CrUX field data takes 4 weeks to update — use Lab data (Lighthouse) for immediate confirmation.`,
    script_defer:         `Run PageSpeed Insights on ${url} (Mobile). Check TBT in the Lighthouse results. Target: < 300ms for "good". Also check the page loads correctly — verify your site works before and after the change.`,
    lazy_loading:         `Open ${url} in Chrome → right-click any image below the first screen → Inspect → check for loading="lazy" on the img tag. Or run in browser console: document.querySelectorAll('img[loading="lazy"]').length`,
    image_format:         `Open ${url} in Chrome → right-click any image → Open image in new tab → check the URL ends in .webp or .avif.`,
    faq_schema:           `Open ${url} → View Page Source (Ctrl+U) → search for "FAQPage". Or test at https://validator.schema.org/?url=${encodeURIComponent(url)}`,
    h1_update:            `Open ${url} → View Page Source (Ctrl+U) → search for <h1 → verify the new heading text is present.`,
    first_para:           `Open ${url} → read the first paragraph below the H1 — confirm it contains the campaign keyword and addresses the searcher problem.`,
    h2_section:           `Open ${url} → scroll to the bottom of the content — verify the new H2 headings are visible and readable.`,
    date_modified_schema: `Open ${url} → View Page Source → search for "dateModified" → confirm the date is present and correct.`,
    gsc_indexing:         `Go to https://search.google.com/search-console → URL Inspection → paste ${url} → check if status shows "URL is on Google".`,
    meta_desc:            `Open ${url} → View Page Source → search for <meta name="description" → verify new description text.`,
  };
  return methods[task.task_type] || `Open ${url} and confirm the change is visible. Use View Page Source (Ctrl+U) to inspect the HTML.`;
}

// ─────────────────────────────────────────────────────────────
// VERIFICATION EXECUTION
// Re-fetches live page and checks for the specific change.
// ─────────────────────────────────────────────────────────────

export async function verifyDevTask(task: DevTask): Promise<Partial<DevTask>> {
  const url = task.target_url || '';

  const { html, fetchedOk, errorMsg } = await fetchPageHtml(url, 20000);

  if (!fetchedOk) {
    return {
      status:               'applied',
      verification_result:  'partial',
      verification_evidence: { message: 'Could not fetch live page for verification: ' + (errorMsg || 'unknown error') + '. Verify manually using the instructions in the Verify tab.' },
      verified_at:          new Date().toISOString(),
      updated_at:           new Date().toISOString(),
    };
  }

  const evidence: Record<string, unknown> = {};
  let result: 'pass' | 'fail' | 'partial' = 'fail';
  let message = '';

  switch (task.task_type) {
    case 'lazy_loading': {
      const lazyCount  = (html.match(/loading=["']lazy["']/gi) || []).length;
      const totalImgs  = (html.match(/<img\b/gi) || []).length;
      evidence.lazy_count   = lazyCount;
      evidence.total_images = totalImgs;
      if (lazyCount === 0) {
        result  = 'fail';
        message = 'No lazy loading detected — check if the change was published.';
      } else if (lazyCount >= totalImgs * 0.5) {
        result  = 'pass';
        message = lazyCount + ' of ' + totalImgs + ' images now have loading="lazy".';
      } else {
        result  = 'partial';
        message = lazyCount + ' of ' + totalImgs + ' images lazy-loaded. Apply to more images for full coverage.';
      }
      break;
    }
    case 'faq_schema': {
      const hasFaq = /["']FAQPage["']/i.test(html);
      const hasLD  = /application\/ld\+json/i.test(html);
      evidence.has_faq_schema = hasFaq;
      evidence.has_json_ld    = hasLD;
      result  = hasFaq ? 'pass' : 'fail';
      message = hasFaq
        ? 'FAQPage JSON-LD schema detected on live page.'
        : hasLD
          ? 'JSON-LD is present but no FAQPage type found — check the schema was saved correctly.'
          : 'No structured data found — check if the changes were published.';
      break;
    }
    case 'h1_update': {
      const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
      const h1Text  = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';
      evidence.current_h1 = h1Text;
      // We can't hardcode the keyword — check if the H1 changed from what was snapshotted
      result  = h1Text.length > 0 ? 'partial' : 'fail';
      message = h1Text.length > 0
        ? 'Current H1: "' + h1Text.slice(0, 100) + '" — verify this matches the option you selected.'
        : 'Could not find H1 tag — check if the page published correctly.';
      break;
    }
    case 'lcp_fix':
    case 'script_defer': {
      const deferCount = (html.match(/\bdefer\b/gi) || []).length;
      const asyncCount = (html.match(/\basync\b/gi) || []).length;
      evidence.defer_count = deferCount;
      evidence.async_count = asyncCount;
      result  = deferCount + asyncCount > 0 ? 'partial' : 'fail';
      message = deferCount + asyncCount > 0
        ? deferCount + ' deferred + ' + asyncCount + ' async scripts found. Run PageSpeed Insights to confirm TBT improvement (target < 300ms).'
        : 'No deferred scripts detected — check if the changes were published.';
      break;
    }
    case 'image_format': {
      const webpCount = (html.match(/\.webp/gi) || []).length;
      const avifCount = (html.match(/\.avif/gi) || []).length;
      evidence.webp_count = webpCount;
      evidence.avif_count = avifCount;
      result  = webpCount + avifCount > 0 ? 'pass' : 'fail';
      message = webpCount + avifCount > 0
        ? webpCount + ' webp + ' + avifCount + ' avif image references found on live page.'
        : 'No webp/avif images detected — check if conversion was applied.';
      break;
    }
    case 'faq_schema':
    case 'date_modified_schema': {
      const hasDateMod = /dateModified/i.test(html);
      evidence.has_date_modified = hasDateMod;
      result  = hasDateMod ? 'pass' : 'fail';
      message = hasDateMod ? 'dateModified found in schema.' : 'dateModified not found — check if changes were published.';
      break;
    }
    case 'gsc_indexing': {
      evidence.note       = 'GSC indexing cannot be verified by page fetch.';
      evidence.check_url  = 'https://search.google.com/search-console/inspect';
      result  = 'partial';
      message = 'Go to Google Search Console → URL Inspection → paste the page URL → check if it shows "URL is on Google".';
      break;
    }
    case 'first_para': {
      const paras    = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
      const firstPar = paras[0] ? paras[0].replace(/<[^>]+>/g, '').trim() : '';
      evidence.first_paragraph_preview = firstPar.slice(0, 200);
      result  = firstPar.length > 20 ? 'partial' : 'fail';
      message = firstPar.length > 20
        ? 'First paragraph reads: "' + firstPar.slice(0, 120) + '…" — verify this matches the new text you applied.'
        : 'Could not find the first paragraph — check if the page published correctly.';
      break;
    }
    default: {
      evidence.note = 'Manual verification required for this task type.';
      result  = 'partial';
      message = 'Check the live page manually to confirm the change is visible. Use View Page Source (Ctrl+U) to inspect the HTML.';
    }
  }

  evidence.message = message;
  return {
    status:               result === 'pass' ? 'done' : 'applied',
    verification_result:  result,
    verification_evidence: evidence,
    verified_at:          new Date().toISOString(),
    updated_at:           new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// PARSE AUDIT FINDINGS → TASKS
// Generic — works for any audit output, any site, any keyword.
// All task descriptions use finding data, not hardcoded text.
// ─────────────────────────────────────────────────────────────

export function parseFindingsToTasks(
  findings: AuditFinding[],
  opts: { projectId: string; campaignId?: string; auditRunId?: string; targetUrl?: string },
): DevTask[] {
  const tasks: DevTask[] = [];
  const seen = new Set<string>(); // deduplicate by task_type to avoid doubles

  for (const f of findings) {
    const t = classifyFinding(f, opts);
    if (t && !seen.has(t.task_type + ':' + t.phase)) {
      tasks.push(t);
      seen.add(t.task_type + ':' + t.phase);
    }
  }

  // Sort: phase_0 first, then by severity (critical > warning > info), then priority
  const phOrder: Record<string, number> = { phase_0: 0, phase_2: 1, phase_3: 2 };
  const svOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  tasks.sort((a, b) =>
    (phOrder[a.phase] ?? 9) - (phOrder[b.phase] ?? 9) ||
    (svOrder[a.severity] ?? 9) - (svOrder[b.severity] ?? 9) ||
    a.priority - b.priority
  );

  return tasks;
}

function classifyFinding(f: AuditFinding, opts: { projectId: string; campaignId?: string; auditRunId?: string; targetUrl?: string }): DevTask | null {
  const sev = (f.severity === 'red' ? 'critical' : f.severity === 'amber' ? 'warning' : 'info') as DevTask['severity'];
  const ev  = f.evidence || {};
  const base = {
    project_id:    opts.projectId,
    campaign_id:   opts.campaignId  || null,
    audit_run_id:  opts.auditRunId  || null,
    target_url:    opts.targetUrl,
    finding_title: f.finding_title,
    finding_detail: (f.finding_detail || '').slice(0, 2000),
    severity:      sev,
    status:        'pending' as const,
  };

  const lcpMs  = typeof ev.lcp_ms  === 'number' ? ev.lcp_ms  : null;
  const tbtMs  = typeof ev.tbt_ms  === 'number' ? ev.tbt_ms  : null;
  const lcpSec = lcpMs ? (lcpMs / 1000).toFixed(1) + 's' : 'high';
  const tbtStr = tbtMs ? Math.round(tbtMs) + 'ms' : 'high';

  if (/MOBILE LCP.*exceed|LCP.*critical|LCP.*poor/i.test(f.finding_title))
    return { ...base, phase: 'phase_0', category: 'performance', task_type: 'lcp_fix',
      title: 'Fix render-blocking JavaScript — Mobile LCP ' + lcpSec,
      description: 'TTFB is fast; TBT ' + tbtStr + ' confirms JavaScript is blocking the main thread before the page renders. Fix this before any content work.',
      priority: 1 };

  if (/CrUX.*unavailable.*previous.*MOBILE LCP|Mobile CrUX.*unavailable/i.test(f.finding_title))
    return { ...base, phase: 'phase_0', category: 'performance', task_type: 'lcp_fix',
      title: 'Verify and fix mobile LCP (CrUX data previously Critical)',
      description: 'Previous audit confirmed critical mobile LCP. Current run has no CrUX data. Verify and fix before proceeding.',
      priority: 1 };

  if (/TBT.*severe|severe.*TBT|TBT.*critical/i.test(f.finding_title))
    return { ...base, phase: 'phase_0', category: 'performance', task_type: 'script_defer',
      title: (/MOBILE/i.test(f.finding_title) ? 'Mobile' : 'Desktop') + ' TBT ' + tbtStr + ' — defer render-blocking scripts',
      description: 'High Total Blocking Time indicates JavaScript executing on the main thread before the page can respond.',
      priority: 2 };

  if (/Page not in GSC|0 organic impression|not indexed/i.test(f.finding_title))
    return { ...base, phase: 'phase_0', category: 'indexing', task_type: 'gsc_indexing',
      title: 'Submit page for Google indexing',
      description: 'Page has 0 organic impressions. May not be indexed. Request indexing via GSC URL Inspection.',
      priority: 5 };

  if (/Lazy-loading.*low|0%.*lazy|loading.*lazy.*0/i.test(f.finding_title)) {
    const total = typeof ev.total_images === 'number' ? ev.total_images : null;
    return { ...base, phase: 'phase_3', category: 'performance', task_type: 'lazy_loading',
      title: 'Add loading=lazy to images' + (total ? ' (' + total + ' images, 0% lazy)' : ''),
      description: 'No images use lazy loading. Adding it is a free performance win with no visual impact.',
      priority: 30 };
  }

  if (/modern.*format|legacy.*format|jpg.*png.*gif|image.*webp/i.test(f.finding_title)) {
    const legacy = typeof ev.legacy_format === 'number' ? ev.legacy_format : null;
    return { ...base, phase: 'phase_3', category: 'performance', task_type: 'image_format',
      title: 'Convert images to webp/avif' + (legacy ? ' (' + legacy + ' legacy images)' : ''),
      description: 'Legacy formats are 30-50% larger than webp. Many CMS platforms handle this automatically.',
      priority: 31 };
  }

  if (/FAQPage schema missing|no.*FAQ.*schema|FAQ.*schema.*absent/i.test(f.finding_title)) {
    const paaCount = typeof ev.paa_count === 'number' ? ev.paa_count : null;
    return { ...base, phase: 'phase_2', category: 'schema', task_type: 'faq_schema',
      title: 'Add FAQPage JSON-LD schema' + (paaCount ? ' (' + paaCount + ' PAA questions on SERP)' : ''),
      description: 'FAQPage schema unlocks People Also Ask rich results and AI Overview citations.',
      priority: 10 };
  }

  if (/Content freshness|dateModified|date.*modif/i.test(f.finding_title))
    return { ...base, phase: 'phase_3', category: 'schema', task_type: 'date_modified_schema',
      title: 'Add dateModified to schema + visible last-updated label',
      description: 'The Last-Modified HTTP header is unreliable for freshness signals. Add explicit dateModified.',
      priority: 35 };

  if (/keyword.*H1|H1.*keyword|H1.*missing.*keyword/i.test(f.finding_title))
    return { ...base, phase: 'phase_2', category: 'on_page', task_type: 'h1_update',
      title: 'Update H1 to include campaign keyword',
      description: 'The campaign keyword is absent from or weakly present in the H1. Manav generates 3 options.',
      priority: 12 };

  if (/First paragraph.*align|paragraph.*keyword|first para.*weak/i.test(f.finding_title))
    return { ...base, phase: 'phase_2', category: 'on_page', task_type: 'first_para',
      title: 'Rewrite opening paragraph (low keyword alignment)',
      description: 'The first paragraph has low keyword overlap. Manav rewrites it aligned to search intent.',
      priority: 15 };

  if (/PAA.*NOT addressed|PAA.*unanswered|unanswered.*PAA/i.test(f.finding_title)) {
    const unanswered: string[] = Array.isArray(ev.unanswered) ? ev.unanswered as string[] : [];
    return { ...base, phase: 'phase_2', category: 'content', task_type: 'h2_section',
      title: 'Write ' + (unanswered.length || 'missing') + ' new H2 sections for unanswered PAA questions',
      description: unanswered.length > 0
        ? 'Missing: ' + unanswered.slice(0, 3).join(' | ') + (unanswered.length > 3 ? '…' : '')
        : 'Unanswered PAA questions are missed featured snippet and AI Overview opportunities.',
      priority: 11 };
  }

  if (/meta description.*missing|missing.*meta desc/i.test(f.finding_title))
    return { ...base, phase: 'phase_2', category: 'on_page', task_type: 'meta_desc',
      title: 'Write meta description',
      description: 'No meta description found. This affects CTR from search results.',
      priority: 20 };

  return null;
}

// ─────────────────────────────────────────────────────────────
// DATABASE HELPERS
// ─────────────────────────────────────────────────────────────

export async function saveTasks(tasks: DevTask[]): Promise<{ saved: number; error?: string }> {
  if (!tasks.length) return { saved: 0 };
  try {
    const rows = tasks.map(t => ({
      project_id:    t.project_id,
      campaign_id:   t.campaign_id  || null,
      audit_run_id:  t.audit_run_id || null,
      phase:         t.phase,
      category:      t.category,
      task_type:     t.task_type,
      title:         t.title,
      description:   t.description  || null,
      finding_title: t.finding_title || null,
      finding_detail:(t.finding_detail || '').slice(0, 2000),
      severity:      t.severity,
      target_url:    t.target_url   || null,
      priority:      t.priority,
      status:        t.status,
    }));
    const { error } = await db().from('dev_tasks').insert(rows);
    if (error) {
      console.error('[dev-engine] saveTasks error:', error.message);
      return { saved: 0, error: error.message };
    }
    return { saved: rows.length };
  } catch (e: any) {
    return { saved: 0, error: e?.message || 'Insert failed' };
  }
}

export async function updateTask(taskId: string, updates: Partial<DevTask>): Promise<void> {
  const payload = { ...updates, updated_at: new Date().toISOString() } as Record<string, unknown>;
  delete payload.id;
  try {
    const { error } = await db().from('dev_tasks').update(payload).eq('id', taskId);
    if (error) console.error('[dev-engine] updateTask error:', error.message);
  } catch (e: any) {
    console.error('[dev-engine] updateTask threw:', e?.message);
  }
}

export async function getTask(taskId: string): Promise<DevTask | null> {
  try {
    const { data } = await db().from('dev_tasks').select('*').eq('id', taskId).maybeSingle();
    return (data as DevTask) || null;
  } catch {
    return null;
  }
}

export async function getTasksForProject(projectId: string, opts?: { campaignId?: string }): Promise<DevTask[]> {
  try {
    let q = db().from('dev_tasks').select('*').eq('project_id', projectId);
    if (opts?.campaignId) q = q.eq('campaign_id', opts.campaignId);
    q = q.order('priority', { ascending: true }).order('created_at', { ascending: false });
    const { data } = await q;
    return (data as DevTask[]) || [];
  } catch {
    return [];
  }
}

export async function deleteProjectTasks(projectId: string, auditRunId?: string): Promise<void> {
  try {
    let q = db().from('dev_tasks').delete().eq('project_id', projectId);
    if (auditRunId) q = q.eq('audit_run_id', auditRunId);
    await q;
  } catch (e: any) {
    console.error('[dev-engine] deleteProjectTasks threw:', e?.message);
  }
}

export async function detectCmsForProject(projectId: string): Promise<CmsContext | null> {
  try {
    const { data: proj } = await db()
      .from('projects')
      .select('url, cms, seo_plugin')
      .eq('id', projectId)
      .maybeSingle();
    if (!proj) return null;
    const url = (proj as any).url as string || '';
    if (url) {
      const { html, fetchedOk } = await fetchPageHtml(url, 8000);
      if (fetchedOk && html) return detectCmsFromHtml(html);
    }
    // Fallback to stored value
    const platform = normaliseCmsPlatform((proj as any).cms || 'unknown');
    return { platform, seoPlugin: 'unknown', confidence: 60, signals: ['From project settings'], adminPath: cmsAdminPath(platform) };
  } catch {
    return null;
  }
}
