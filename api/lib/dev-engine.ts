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
const MODEL      = 'claude-sonnet-4-6';
const MODEL_FAST = 'claude-haiku-4-5-20251001';

/* ─────────────────────────────────────────────────────────────
   RELIABLE TIMEOUT UTILITY

   Node.js fetch + AbortController does NOT reliably kill a
   hanging TCP connection on Vercel Lambda. The abort signal fires
   but the underlying socket stays open and the promise never rejects.

   Promise.race is different: it does NOT kill the underlying fetch,
   but it DOES let this function return a value to the caller while
   the hung fetch sits quietly in the Lambda background. The caller
   gets a timeout error immediately. The Lambda may stay warm for
   a while longer, but the client is never blocked.

   Use this for ALL external HTTP calls in this codebase.
───────────────────────────────────────────────────────────── */

export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const timeoutErr = new Error('Request timed out after ' + timeoutMs + 'ms');
  (timeoutErr as any).isTimeout = true;

  return Promise.race([
    fetch(url, options),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(timeoutErr), timeoutMs)
    ),
  ]);
}

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
  // Site Manager
  page_id?:               string | null;
  template_fix_id?:       string | null;
  // Client approval thread
  client_thread?:         ClientMessage[];
  client_approved?:       boolean;
  client_approved_at?:    string;
  created_at?:            string;
  updated_at?:            string;
}

export interface ClientMessage {
  role:      'pm' | 'client';
  content:   string;
  timestamp: string;
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

// Detect CMS from HTTP response headers alone — works even when HTML is blocked.
// Many CDN/CMS platforms expose themselves through cookies, Server headers, or custom headers.
export function detectCmsFromHeaders(headers: Record<string,string>): CmsContext | null {
  const h = (k: string) => (headers[k.toLowerCase()] || '').toLowerCase();
  const all = Object.entries(headers).map(([k,v]) => k.toLowerCase() + ': ' + v.toLowerCase()).join(' ');

  // HubSpot — distinctive cookie names and CDN headers
  if (/hubspot|hs-scripts|hs-analytics|hubspotutk/.test(all) || h('server').includes('hubspot')) {
    return { platform: 'hubspot', seoPlugin: 'none', confidence: 85, signals: ['HubSpot header/cookie signal'], adminPath: 'https://app.hubspot.com' };
  }
  // WordPress — wp-login cookie, x-powered-by, x-pingback
  if (/x-pingback|xmlrpc|wp-includes|wp-json/.test(all) || h('x-powered-by').includes('wordpress') || h('x-generator').includes('wordpress')) {
    const sp: SeoPlugin = /yoast/.test(all) ? 'yoast' : /rankmath/.test(all) ? 'rankmath' : 'unknown';
    return { platform: 'wordpress', seoPlugin: sp, confidence: 88, signals: ['WordPress header signal'], adminPath: '/wp-admin' };
  }
  // Shopify — distinctive server headers and cookies
  if (h('x-shopify-stage') || h('x-sorting-hat-podid') || h('x-shardid') || /shopify/.test(all)) {
    return { platform: 'shopify', seoPlugin: 'none', confidence: 90, signals: ['Shopify header signal'], adminPath: '/admin' };
  }
  // Squarespace — server name or cookie
  if (h('server').includes('squarespace') || /squarespace/.test(all)) {
    return { platform: 'squarespace', seoPlugin: 'none', confidence: 85, signals: ['Squarespace header signal'], adminPath: '/config' };
  }
  // Wix — wixsite or distinctive cookie
  if (/wix/.test(all) || h('x-wix-request-id')) {
    return { platform: 'wix', seoPlugin: 'none', confidence: 82, signals: ['Wix header signal'], adminPath: 'https://manage.wix.com' };
  }
  // Webflow — server or powered-by
  if (h('x-powered-by').includes('webflow') || h('server').includes('webflow') || /webflow/.test(all)) {
    return { platform: 'webflow', seoPlugin: 'none', confidence: 88, signals: ['Webflow header signal'], adminPath: 'https://webflow.com/dashboard' };
  }
  // Drupal — X-Generator header
  if (h('x-generator').includes('drupal') || h('x-drupal-cache') || /drupal/.test(all)) {
    return { platform: 'drupal', seoPlugin: 'unknown', confidence: 87, signals: ['Drupal header signal'], adminPath: '/admin' };
  }
  return null;
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

export async function fetchPageHtml(url: string, timeoutMs = 20000): Promise<{ html: string; fetchedOk: boolean; errorMsg?: string; headers?: Record<string,string> }> {
  if (!url) return { html: '', fetchedOk: false, errorMsg: 'No URL provided' };
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    }, timeoutMs);
    // Capture response headers — they often reveal CMS even when page is blocked
    const headers: Record<string,string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    if (!res.ok) {
      return { html: '', fetchedOk: false, errorMsg: `HTTP ${res.status}`, headers };
    }
    const raw = await res.text();
    return { html: raw.slice(0, 120_000), fetchedOk: true, headers };
  } catch (e: any) {
    const isTimeout = (e as any)?.isTimeout;
    const msg = isTimeout
      ? `Page fetch timed out after ${timeoutMs}ms`
      : (e?.message || 'Fetch failed');
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

/* ─────────────────────────────────────────────────────────────
   TASK EXECUTION ROUTING

   Tasks are classified into three execution paths based on what
   data they actually need. This is critical for reliability across
   all sites — including slow sites, bot-protected sites, and any
   site where a server-side fetch may never return.

   PATH A — Instant (no network calls):
     These tasks have all data they need in the audit finding.
     They generate the complete fix in < 1 second.
     Tasks: gsc_indexing, faq_schema, h1_update, first_para,
            h2_section, date_modified_schema, meta_desc

   PATH B — Page-enhanced (try fetch, always succeed):
     These benefit from the live page HTML but work without it.
     Page fetch has a 10s timeout. If it fails, proceeds with
     audit data and tells the user explicitly.
     Tasks: lazy_loading, image_format

   PATH C — Page-required (try fetch, degrade gracefully):
     These need the actual script/element URLs for accurate fixes.
     Page fetch has a 12s timeout. If it fails, generates a
     diagnostic guide instead of a code patch, plus instructions
     to apply the fix using the correct CMS tools.
     Tasks: lcp_fix, script_defer
───────────────────────────────────────────────────────────── */

const INSTANT_TASKS    = new Set(['gsc_indexing', 'faq_schema', 'h1_update', 'first_para', 'h2_section', 'date_modified_schema', 'meta_desc']);
const PAGE_ENHANCED    = new Set(['lazy_loading', 'image_format']);
const PAGE_REQUIRED    = new Set(['lcp_fix', 'script_defer']);

export async function executeDevTask(task: DevTask): Promise<void> {
  const taskId = task.id!;

  try {
    // ── Determine what data we need ──────────────────────────────
    const needsPageFetch  = PAGE_ENHANCED.has(task.task_type) || PAGE_REQUIRED.has(task.task_type);
    const pageIsRequired  = PAGE_REQUIRED.has(task.task_type);

    // ── Fetch live page if needed ────────────────────────────────
    let pageHtml    = '';
    let fetchedOk   = false;
    let fetchError  = '';
    let fetchResult: { html: string; fetchedOk: boolean; errorMsg?: string; headers?: Record<string,string> } | null = null;

    if (needsPageFetch) {
      // Short timeout — if the site blocks server fetches or is unreachable,
      // fail fast and proceed with audit data. Don't hang for 25 seconds.
      const timeout = pageIsRequired ? 12000 : 10000;
      const r = await fetchPageHtml(task.target_url || '', timeout);
      pageHtml    = r.html;
      fetchedOk   = r.fetchedOk;
      fetchError  = r.errorMsg || '';
      fetchResult = r;
    }

    // ── CMS detection ────────────────────────────────────────────
    // Priority order:
    // 1. Already fetched the page → detect from HTML (most accurate)
    // 2. Task has a stored cms_platform → use it (from previous execution)
    // 3. Page not fetched yet (PATH A) → do a quick lightweight CMS fetch
    // 4. Nothing works → 'unknown', instructions tell user to specify their CMS

    let cms: CmsContext | undefined = undefined;

    if (fetchedOk && pageHtml) {
      // Best case: detected from live HTML
      cms = await detectCmsFromHtml(pageHtml);
    } else {
      // Try header-based detection first — works even on Cloudflare-blocked pages
      if (fetchResult?.headers && Object.keys(fetchResult.headers).length > 3) {
        const headerCms = detectCmsFromHeaders(fetchResult.headers);
        if (headerCms && headerCms.platform !== 'unknown') {
          cms = headerCms;
        }
      }

      if (!cms) {
      // Resolution order:
      // 1. cms_platform stored on this task (set by a previous execution)
      // 2. cms column on the projects table (set by user or previous detection)
      // 3. Page fetch for CMS detection (only if site allows server fetches)
      // 4. unknown — instructions explain how to proceed manually

      const taskPlatform    = normaliseCmsPlatform(task.cms_platform || '');
      let   resolvedPlatform: CmsPlatform = 'unknown';
      let   resolvedPlugin:   SeoPlugin   = 'unknown';
      let   resolvedSource                = 'unknown';

      if (taskPlatform !== 'unknown') {
        resolvedPlatform = taskPlatform;
        resolvedSource   = 'Stored on task from previous run';
      } else {
        // Try the project record
        try {
          const { data: proj } = await db()
            .from('projects')
            .select('cms, seo_plugin')
            .eq('id', task.project_id)
            .maybeSingle();
          const projPlatform = normaliseCmsPlatform((proj as any)?.cms || '');
          if (projPlatform !== 'unknown') {
            resolvedPlatform = projPlatform;
            resolvedPlugin   = ((proj as any)?.seo_plugin || 'unknown') as SeoPlugin;
            resolvedSource   = 'From project settings';
          }
        } catch { /* continue */ }
      }

      // If still unknown, try a quick page fetch for CMS detection only
      if (resolvedPlatform === 'unknown' && task.target_url) {
        const cmsDetect = await fetchPageHtml(task.target_url, 6000);
        if (cmsDetect.fetchedOk && cmsDetect.html) {
          cms = await detectCmsFromHtml(cmsDetect.html);
          if (!pageHtml) { pageHtml = cmsDetect.html; fetchedOk = true; }
        } else {
          cms = {
            platform:  'unknown',
            seoPlugin: 'unknown',
            confidence: 0,
            signals:   ['Page blocked server fetch — CMS unknown. User should specify CMS in project settings.'],
            adminPath: '',
          };
        }
      } else {
        cms = {
          platform:   resolvedPlatform,
          seoPlugin:  resolvedPlugin,
          confidence: resolvedPlatform !== 'unknown' ? 75 : 0,
          signals:    [resolvedSource],
          adminPath:  cmsAdminPath(resolvedPlatform),
        };
      }
      // Final fallback if header check also found nothing
      if (!cms) {
        cms = {
          platform:   'unknown',
          seoPlugin:  'unknown',
          confidence: 0,
          signals:    ['All detection methods failed — page blocked all server requests'],
          adminPath:  '',
        };
      }
    }
      } // end if (!cms) — CMS resolution complete

    // TypeScript: cms is always assigned by this point

    // ── Snapshot relevant HTML (safety net for rollback) ─────────
    const snapshotHtml = pageHtml ? snapshotRelevantHtml(task.task_type, pageHtml) : '';
    const snapshotId   = snapshotHtml ? await saveSnapshot(taskId, task.project_id, task.task_type, task.target_url || '', snapshotHtml) : null;

    // ── Route to correct execution path ─────────────────────────
    let result: AiResult;
    // cms is resolved above

    if (INSTANT_TASKS.has(task.task_type)) {
      result = await executeWithAuditData(task, cms);
    } else if (fetchedOk && pageHtml) {
      // PATH B or C with live page: use the actual HTML
      result = await executeWithPageHtml(task, pageHtml, snapshotHtml, cms);
    } else if (PAGE_ENHANCED.has(task.task_type)) {
      // PATH B fallback: page not available, proceed with patterns
      result = await executeWithAuditData(task, cms);
    } else {
      // PATH C fallback: page required but not available
      // Generate a diagnostic guide + manual instructions instead of a code patch
      result = {
        analysis: `Could not fetch the live page (${fetchError || 'server did not respond'}). This task requires reading the actual HTML to identify specific blocking scripts. The Fix Code section contains a step-by-step guide to find and fix the blocking scripts yourself using Chrome DevTools.`,
        fixCode: buildManualDiagnosticGuide(task, cms),
        fixLanguage: 'text',
        paaQuestions: [],
      };
    }

    // ── Build CMS-specific instructions ──────────────────────────
    const applyInstructions    = buildApplyInstructions(task, cms, { fixCode: result.fixCode, paaQuestions: result.paaQuestions });
    const rollbackInstructions = buildRollbackInstructions(task, cms.platform, snapshotHtml);
    const verificationMethod   = buildVerificationMethod(task);

    // ── Write results ─────────────────────────────────────────────
    await updateTask(taskId, {
      status:                'fix_ready',
      analysis:              result.analysis,
      fix_code:              result.fixCode,
      fix_language:          result.fixLanguage,
      apply_instructions:    applyInstructions,
      rollback_code:         snapshotHtml || '<!-- Page not fetched this run — no snapshot available -->',
      rollback_instructions: rollbackInstructions,
      verification_method:   verificationMethod,
      snapshot_id:           snapshotId || undefined,
      backup_confirmed:      false,
      cms_platform:          cms.platform,
      llm_calls_used:        result.llmCalls,
      updated_at:            new Date().toISOString(),
    });

  } catch (unexpectedErr: any) {
    await updateTask(taskId, {
      status:     'failed',
      analysis:   `Error: ${unexpectedErr?.message || 'unknown'}. Click Retry.`,
      updated_at: new Date().toISOString(),
    }).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────
// AI RESULT TYPE
// ─────────────────────────────────────────────────────────────

interface AiResult {
  analysis:     string;
  fixCode:      string;
  fixLanguage:  string;
  paaQuestions: string[];
  llmCalls:     number;
}

// ─────────────────────────────────────────────────────────────
// PATH A: EXECUTE WITH AUDIT DATA ONLY
// Used for: instant tasks + page-enhanced fallback.
// Makes one AI call with a 30s timeout.
// Prompt is built entirely from task.finding_title + finding_detail + evidence.
// ─────────────────────────────────────────────────────────────

async function executeWithAuditData(task: DevTask, cms: CmsContext): Promise<AiResult> {
  // Pass client thread if it exists — regeneration takes their feedback into account
  const thread = Array.isArray(task.client_thread) && task.client_thread.length > 0
    ? task.client_thread : undefined;
  const { sys, usr } = buildPromptFromAuditData(task, cms, thread);
  // Use Sonnet when there is a client thread — their concerns need quality reasoning
  const model = thread ? MODEL : MODEL_FAST;
  return callAI(task, sys, usr, model);
}

// ─────────────────────────────────────────────────────────────
// PATH B/C: EXECUTE WITH LIVE PAGE HTML
// Used when the page was successfully fetched.
// The snapshot HTML (relevant elements only) is given to Claude.
// ─────────────────────────────────────────────────────────────

async function executeWithPageHtml(task: DevTask, _pageHtml: string, snapshotHtml: string, cms: CmsContext): Promise<AiResult> {
  const { sys, usr } = buildPromptWithHtml(task, snapshotHtml, cms);
  return callAI(task, sys, usr);
}

// ─────────────────────────────────────────────────────────────
// RUNTIME AI OUTPUT VALIDATOR
// Called on every AI response before it is saved to the DB.
// Catches hallucinated placeholders, empty responses, invalid JSON,
// and task-specific structural issues.
// Returns { valid, issues[] } — caller decides whether to save or fail.
// ─────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:  boolean;
  issues: string[];
  warnings: string[];
}

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\[YOUR_[A-Z_]+\]/,
  /\[INSERT[_ ]/i,
  /<!--\s*INSERT/i,
  /<!--\s*REPLACE/i,
  /<!--\s*ADD\s/i,
  /\[REPLACE[_ ]/i,
  /\[PASTE[_ ]/i,
  /TODO:/i,
  /PLACEHOLDER/i,
  /your-domain\.com/i,
  /example\.com(?!\/bot)/i,
  /\[URL\]/i,
  /\[KEYWORD\]/i,
];

export function validateAiOutput(taskType: string, fixCode: string, fixLanguage: string): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  // 1. Empty check
  if (!fixCode || fixCode.trim().length < 10) {
    issues.push('Fix code is empty or too short — AI did not generate a usable response.');
    return { valid: false, issues, warnings };
  }

  // 2. Placeholder check
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(fixCode)) {
      issues.push('AI response contains placeholder text: ' + (fixCode.match(pattern)?.[0] || pattern.toString()));
    }
  }

  // 3. Language-specific validation
  if (fixLanguage === 'json' || (fixLanguage === 'html' && fixCode.includes('ld+json'))) {
    const jsonStr = fixCode.includes('<script') ? (fixCode.match(/\{[\s\S]+\}/) || [''])[0] : fixCode;
    try { JSON.parse(jsonStr); } catch (e: any) { issues.push('JSON is invalid: ' + e.message); }
  }

  if (fixLanguage === 'javascript' || fixLanguage === 'html') {
    const open  = (fixCode.match(/\{/g) || []).length;
    const close = (fixCode.match(/\}/g) || []).length;
    if (Math.abs(open - close) > 3) {
      warnings.push('Brace count mismatch: ' + open + ' open, ' + close + ' close — may indicate truncated output');
    }
  }

  // 4. Task-specific structural checks
  switch (taskType) {
    case 'faq_schema':
      if (!fixCode.includes('FAQPage'))    issues.push('faq_schema: missing @type FAQPage');
      if (!fixCode.includes('mainEntity')) issues.push('faq_schema: missing mainEntity array');
      if (!fixCode.includes('Question'))   issues.push('faq_schema: missing @type Question');
      if (!fixCode.includes('Answer'))     issues.push('faq_schema: missing @type Answer');
      break;
    case 'lazy_loading':
      if (!fixCode.includes('loading') && !fixCode.includes('lazy')) {
        issues.push('lazy_loading: code does not reference loading or lazy');
      }
      break;
    case 'lcp_fix':
    case 'script_defer':
      if (!fixCode.includes('defer') && !fixCode.includes('async') && !fixCode.includes('STEP')) {
        issues.push('lcp_fix/script_defer: code does not contain defer, async, or diagnostic steps');
      }
      break;
    case 'date_modified_schema':
      if (!fixCode.includes('dateModified')) issues.push('date_modified_schema: missing dateModified field');
      break;
    case 'h1_update': {
      const hasHtml = fixCode.includes('<h1');
      const hasNumbered = /^1\.\s+.{5,}/m.test(fixCode);
      if (!hasHtml && !hasNumbered) {
        issues.push('h1_update: should contain either <h1> HTML or numbered options (1. ...)');
      }
      break;
    }
    case 'gsc_indexing':
      if (fixCode.length < 100) {
        warnings.push('gsc_indexing: fix code is very short — expected a checklist');
      }
      break;
  }

  return { valid: issues.length === 0, issues, warnings };
}

// ─────────────────────────────────────────────────────────────
// SHARED AI CALLER
// Single point of truth for Anthropic calls.
// Always resolves — never throws. Returns structured AiResult.
// ─────────────────────────────────────────────────────────────

async function callAI(task: DevTask, sys: string, usr: string, model = MODEL): Promise<AiResult> {
  let llmCalls = 0;
  // Timeout via AbortController — AbortSignal.timeout() is unreliable on Vercel.
  // 90s: well within Vercel maxDuration:300s, handles any realistic Anthropic latency.
  // The old 30s was too tight — Sonnet under load regularly takes 30-60s for 2000 tokens.
  const AI_TIMEOUT_MS = 45000; // 45s — Promise.race makes this reliable
  const maxTokens = model === MODEL_FAST ? 2000 : 4000;

  try {
    const resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: sys,
        messages: [{ role: 'user', content: usr }],
      }),
    }, AI_TIMEOUT_MS);
    llmCalls++;
    const data = await resp.json() as any;

    if (data?.error) {
      return {
        analysis:     `AI service error: ${data.error?.message || 'unknown'}. Retry in a moment.`,
        fixCode:      '',
        fixLanguage:  'text',
        paaQuestions: [],
        llmCalls,
      };
    }

    const rawText = (data?.content?.[0]?.text || '').trim();

    // Strip markdown code fences — the AI sometimes wraps JSON in ```json...```
    // despite the system prompt saying not to. Handle defensively.
    const stripped = rawText
      .replace(/^```(?:json)?[\s]*/i, '')
      .replace(/[\s]*```$/i, '')
      .trim();

    const jsonMatch = stripped.match(/\{[\s\S]+\}/);

    if (jsonMatch) {
      try {
        const parsed      = JSON.parse(jsonMatch[0]);
        const fixCode     = parsed.fix_code     || '';
        const fixLanguage = parsed.fix_language || 'html';
        const analysis    = parsed.analysis     || 'Analysis complete.';

        const validation   = validateAiOutput(task.task_type, fixCode, fixLanguage);
        const analysisNote = validation.issues.length > 0
          ? '\n\n⚠️ Code note: ' + validation.issues[0]
          : '';

        return {
          analysis:     analysis + analysisNote,
          fixCode,
          fixLanguage,
          paaQuestions: Array.isArray(parsed.paa_questions) ? parsed.paa_questions : [],
          llmCalls,
        };
      } catch {
        // JSON.parse failed — response was likely truncated mid-JSON.
        // Try to salvage analysis and fix_code using targeted regex.
        const aMatch = stripped.match(/"analysis"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const fMatch = stripped.match(/"fix_code"\s*:\s*"((?:[^"\\]|\\.)*)/);
        const salvaged = {
          analysis:     (aMatch?.[1] || '').replace(/\\n/g, '\n').replace(/\\"/g, '"') || '',
          fixCode:      (fMatch?.[1] || '').replace(/\\n/g, '\n').replace(/\\"/g, '"'),
          fixLanguage:  'html' as string,
          paaQuestions: [] as string[],
          llmCalls,
        };
        if (salvaged.fixCode) {
          salvaged.analysis = (salvaged.analysis || 'Fix generated.') +
            ' (Response was very long and may be slightly truncated — the critical changes are shown in Fix Code.)';
        } else {
          salvaged.analysis = 'The fix was too long to fit in one response. Click Re-generate — it will retry.';
        }
        return salvaged;
      }
    }

    return {
      analysis:     'Unexpected AI response format. Click Re-generate to retry.',
      fixCode:      '',
      fixLanguage:  'text',
      paaQuestions: [],
      llmCalls,
    };

  } catch (e: any) {
    const isTimeout = (e as any)?.isTimeout || e?.name === 'AbortError' || e?.name === 'TimeoutError';
    const msg = isTimeout
      ? `AI call timed out after ${Math.round(AI_TIMEOUT_MS / 1000)}s. Click Re-generate to retry.`
      : `AI error: ${e?.message || 'unknown'}`;
    return { analysis: msg, fixCode: '', fixLanguage: 'text', paaQuestions: [], llmCalls };
  }
}

// ─────────────────────────────────────────────────────────────
// MANUAL DIAGNOSTIC GUIDE
// Used when PATH C page fetch fails.
// Gives the developer a precise manual checklist without needing
// the actual HTML.
// ─────────────────────────────────────────────────────────────

function buildManualDiagnosticGuide(task: DevTask, cms: CmsContext): string {
  const p = cms.platform;
  const lines: string[] = [];

  lines.push('STEP 1: Profile the blocking scripts in Chrome DevTools');
  lines.push('');
  lines.push('1. Open the page in Chrome: ' + (task.target_url || 'your page URL'));
  lines.push('2. Press F12 to open DevTools');
  lines.push('3. Click the Performance tab');
  lines.push('4. Click the record button (⏺) then reload the page, then stop recording');
  lines.push('5. In the flame chart, look for red bars labeled "Long Task" near the top');
  lines.push('6. Click on each Long Task to see which script caused it');
  lines.push('7. The script URL is your target — it needs defer or async');
  lines.push('');
  lines.push('STEP 2: Identify deferrable scripts');
  lines.push('');
  lines.push('Scripts safe to defer (add defer attribute):');
  lines.push('  - Google Analytics / Google Tag Manager');
  lines.push('  - Facebook Pixel / Meta Pixel');
  lines.push('  - HubSpot tracking (hs-scripts.com)');
  lines.push('  - Intercom / Drift / Zendesk chat widgets');
  lines.push('  - Any analytics or marketing pixel');
  lines.push('');
  lines.push('Scripts NOT safe to defer (leave as-is):');
  lines.push('  - jQuery or core framework scripts (if other scripts depend on them)');
  lines.push('  - Any script with document.write()');
  lines.push('  - Critical rendering scripts referenced in HTML attributes');
  lines.push('');
  lines.push('STEP 3: Apply defer for ' + p);
  lines.push('');

  if (p === 'wordpress') {
    lines.push('Option A (no code): WP Rocket → File Optimization → Defer JS execution');
    lines.push('Option B (no code): Autoptimize → Settings → Defer scripts');
    lines.push('Option C (code): add defer to the <script> tags identified in Step 1');
  } else if (p === 'webflow') {
    lines.push('Project Settings → Custom Code → move identified scripts from Head Code to Footer Code');
    lines.push('For scripts that must stay in head: add defer attribute');
  } else if (p === 'hubspot') {
    lines.push('Settings → Website → Pages → Custom Code → Footer HTML');
    lines.push('Move identified scripts to the footer instead of the head');
  } else {
    lines.push('Find the <script> tag for the blocking script identified in Step 1');
    lines.push('Change: <script src="...script-url...">');
    lines.push('    To: <script defer src="...script-url...">');
  }

  lines.push('');
  lines.push('STEP 4: Verify the fix');
  lines.push('After deploying: run https://pagespeed.web.dev for this page in Mobile mode.');
  lines.push('Target: TBT < 300ms. LCP < 4s.');

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// PROMPT BUILDERS
// ─────────────────────────────────────────────────────────────

const AI_SYSTEM = `You are a senior web developer generating precise, copy-paste-ready code fixes for SEO and performance issues.

You are given audit finding data and (when available) live page HTML. Generate the exact fix for THIS specific page.

Rules:
- Reference actual values from the data (script URLs, H1 text, PAA questions, existing schema)
- No placeholders like [YOUR_VALUE] or [INSERT HERE]
- Code must be complete and ready to deploy
- Be specific to the CMS and SEO plugin detected

Reply with ONLY valid JSON (no markdown, no backticks):
{
  "analysis": "2-4 sentences explaining the specific problem and why this fix resolves it",
  "fix_code": "Complete copy-paste-ready code",
  "fix_language": "html|json|javascript|bash|text",
  "paa_questions": ["question strings if faq_schema or h2_section task, else empty array"]
}`;

function buildPromptFromAuditData(task: DevTask, cms: CmsContext, clientThread?: ClientMessage[]): { sys: string; usr: string } {
  const ev  = task.finding_detail || '';
  const url = task.target_url || 'the page URL';
  const p   = cms.platform;
  const pluginNote = (cms.seoPlugin !== 'unknown' && cms.seoPlugin !== 'none') ? ' with ' + cms.seoPlugin : '';

  const context = [
    'CMS: ' + p + pluginNote,
    'URL: ' + url,
    'Finding: ' + (task.finding_title || ''),
    'Audit detail: ' + ev.slice(0, 600),
  ].join('\n');

  const nl = '\n';

  // Each prompt is built with explicit string concatenation — no multi-line literals.
  const gsc = context + nl + nl + 'Generate: (1) 2-sentence analysis of what "not indexed" means for this page. (2) Step-by-step GSC URL Inspection checklist. (3) In fix_code as plain text: the full diagnosis and Request Indexing steps, including what to check for noindex meta tags, canonical tags pointing elsewhere, and X-Robots-Tag headers.';

  const faq = context + nl + nl + 'Extract PAA questions from the audit detail above. Generate a complete FAQPage JSON-LD <script type="application/ld+json"> block. Write 50-80 word direct answers for each question based on the page URL and industry context. The answers must match what the page content would plausibly say. Return question strings in paa_questions array.';

  const h1 = context + nl + nl + 'The current H1 and campaign keyword are in the audit detail. Generate 3 H1 options that: include the keyword naturally (not forced), maintain commercial intent, are 5-10 words, read well for humans. Rank them 1-3 with one-sentence rationale for the top choice. Return all 3 numbered in fix_code.';

  const para = context + nl + nl + 'The current first paragraph and keyword overlap percentage are in the audit detail. Write a replacement first paragraph: 60-100 words, campaign keyword in sentence 1, opens with the specific problem the searcher is trying to solve, names who the product is for, previews the key differentiator. No generic filler phrases. Return ONLY the new paragraph text in fix_code.';

  const h2 = context + nl + nl + 'Extract the unanswered PAA questions from the audit detail. For each question: write the H2 tag using the verbatim question text (Google matches exact phrasing), then a 50-80 word direct answer paragraph (citation-eligible — starts with the answer, not preamble), then a 250-350 word body section covering evaluation criteria and practical guidance. Include honest mention of alternative options. Return complete HTML in fix_code and question strings in paa_questions.';

  const dateMod = context + nl + nl + 'Generate: (1) A complete Article or WebPage JSON-LD schema block with dateModified set to today\'s date. Include @context, @type, url, name, and dateModified fields. (2) An HTML snippet for a visible "Last updated: [date]" label to add near the page title. Return the complete <script type="application/ld+json"> block in fix_code.';

  const metaD = context + nl + nl + 'Generate 3 meta description options, each 150-160 characters. Each must: include the campaign keyword, state a clear benefit, and end with a soft CTA where natural. Return all 3 numbered in fix_code.';

  const lazy = context + nl + nl + 'Generate: (1) 1-sentence analysis of the performance impact of 0% lazy-loaded images. (2) A complete, self-contained JavaScript snippet that adds loading="lazy" to all img elements on the page except the first 2 (which are above the fold). Wrap it in a <script> tag with a DOMContentLoaded event listener so it works on any CMS via footer code injection. The snippet must handle already-lazy images gracefully (check before setting).';

  const imgFmt = context + nl + nl + 'Generate: (1) 1-sentence analysis of the file size impact of legacy image formats. (2) The recommended approach for ' + p + ' (name specific plugins or CDN settings). (3) A Node.js script using the sharp library that reads all jpg/png/gif files in a "./images" directory and writes webp versions at 85% quality into an "./images/webp" output directory.';

  const prompts: Record<string, string> = {
    gsc_indexing: gsc,
    faq_schema: faq,
    h1_update: h1,
    first_para: para,
    h2_section: h2,
    date_modified_schema: dateMod,
    meta_desc: metaD,
    lazy_loading: lazy,
    image_format: imgFmt,
  };

  let basePrompt = prompts[task.task_type] || (context + nl + nl + 'Generate the exact fix code for this task based on the audit finding data.');

  // If a client thread exists, append it — the regenerated fix must account for their concerns
  if (clientThread && clientThread.length > 0) {
    const threadText = clientThread
      .map(m => (m.role === 'client' ? 'CLIENT: ' : 'PM: ') + m.content)
      .join(nl);
    basePrompt += nl + nl +
      '=== CLIENT FEEDBACK ===' + nl +
      'The client has reviewed this fix and provided the following feedback. ' +
      'Adjust your analysis and fix code to address their concerns while still solving the underlying SEO issue.' + nl +
      threadText + nl +
      '=== END CLIENT FEEDBACK ===' + nl +
      'Generate an updated fix that addresses the client\'s concerns.';
  }

  return { sys: AI_SYSTEM, usr: basePrompt };
}

function buildPromptWithHtml(task: DevTask, snapshotHtml: string, cms: CmsContext): { sys: string; usr: string } {
  const ev  = task.finding_detail || '';
  const url = task.target_url || 'the page URL';
  const p   = cms.platform;
  const pluginNote = (cms.seoPlugin !== 'unknown' && cms.seoPlugin !== 'none') ? ' with ' + cms.seoPlugin : '';
  const nl = '\n';

  const context = [
    'CMS: ' + p + pluginNote,
    'URL: ' + url,
    'Finding: ' + (task.finding_title || ''),
    'Audit detail: ' + ev.slice(0, 400),
    nl + '=== LIVE PAGE HTML (relevant section) ===',
    snapshotHtml ? snapshotHtml.slice(0, 8000) : '[Not captured]',
  ].join('\n');

  const lcp = context + nl + nl + 'From the script tags in the HTML above: identify which are in <head> without defer or async. For each blocking script found: show BEFORE (original tag) and AFTER (with defer added) clearly labelled. Focus on third-party scripts first (analytics, chat widgets, pixels, tag managers) as they are the safest to defer. Return all changes in fix_code as a diff showing each modification.';

  const defer = context + nl + nl + 'From the script tags in the HTML above: identify blocking scripts without defer or async attributes. Generate the modified versions with defer or async. Show BEFORE and AFTER for each. Return in fix_code.';

  const lazy = context + nl + nl + 'From the img tags in the HTML above: the first 1-2 images are above the fold (keep as eager). All others should have loading="lazy" added. Generate: (1) The modified img tags. (2) A JavaScript fallback snippet that does the same programmatically, for CMS platforms without direct HTML access.';

  const imgFmt = context + nl + nl + 'From the img tags in the HTML above: list all legacy-format (jpg/png/gif) image URLs found. Generate: (1) A Node.js sharp conversion script for those specific files. (2) A <picture> element example showing webp + legacy fallback for the first 3 images.';

  const prompts: Record<string, string> = {
    lcp_fix: lcp,
    script_defer: defer,
    lazy_loading: lazy,
    image_format: imgFmt,
  };

  return { sys: AI_SYSTEM, usr: prompts[task.task_type] || (context + nl + nl + 'Generate the exact fix from the HTML above.') };
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
  if (p === 'unknown') {
    out.push('> ⚠️ **CMS could not be detected automatically.** The fix code and analysis above are correct regardless of your CMS. For the step-by-step instructions below, find your platform:');
    out.push('');
    out.push('**What CMS does this site use?**');
    out.push('- **WordPress** → look for /wp-admin in the URL when logged in');
    out.push('- **Webflow** → you design it at webflow.com/dashboard');
    out.push('- **HubSpot** → you edit pages at app.hubspot.com');
    out.push('- **Squarespace** → you log in at yoursite.com/config');
    out.push('- **Shopify** → you manage it at yoursite.myshopify.com/admin');
    out.push('- **Wix** → you edit at manage.wix.com');
    out.push('- **Other/custom** → share the Fix Code tab with your developer');
    out.push('');
    out.push('The Fix Code and analysis above work for **any** CMS — paste it wherever your platform accepts custom HTML or code injection.');
  } else if (p === 'wordpress') {
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

  // Task steps — written for non-coders. Plain English. Every step numbered.
  // No jargon. If something requires a developer, say so clearly upfront.
  switch (task.task_type) {

    case 'lcp_fix':
    case 'script_defer': {
      out.push('## What is happening and why it matters');
      out.push('');
      out.push('Your page is loading **' + (task.title.match(/\d+\.\d+s/) || ['slowly'])[0] + '** on mobile. The reason is that JavaScript files are blocking the page from showing anything until they finish loading. This is like a store that makes every customer wait at the door while the staff counts stock in the back — before anyone is even let in.');
      out.push('');
      out.push('The fix is called **defer** — it tells the browser: show the page to visitors first, then load those scripts quietly in the background. Visitors see the page immediately. Nothing visual changes.');
      out.push('');

      if (p === 'hubspot') {
        out.push('## How to fix this in HubSpot (no developer needed)');
        out.push('');
        out.push('HubSpot loads most tracking scripts automatically. The fastest fix is to move them to the footer:');
        out.push('');
        out.push('1. Log in to **app.hubspot.com**');
        out.push('2. Click **Settings** (gear icon, top right)');
        out.push('3. In the left menu: **Website → Pages**');
        out.push('4. Scroll down to **Site footer HTML**');
        out.push('5. Any `<script>` tags you see in **Site header HTML** that are for analytics or tracking — cut them from the header and paste them into the footer instead');
        out.push('6. Click **Save**');
        out.push('7. Also check: Settings → **Tracking & Analytics** → ensure Google Analytics is set to load **asynchronously**');
        out.push('');
        out.push('> If you are not sure which scripts to move, copy the Fix Code tab and send it to your developer with this note: "Please move these scripts to the footer or add defer/async to them."');
      } else if (p === 'wordpress') {
        out.push('## How to fix this in WordPress (no developer needed)');
        out.push('');
        out.push('The easiest way is a free plugin:');
        out.push('');
        out.push('**Option A — Autoptimize (free):**');
        out.push('1. In your WordPress dashboard, go to **Plugins → Add New**');
        out.push('2. Search for **Autoptimize** → click **Install Now** → click **Activate**');
        out.push('3. Go to **Settings → Autoptimize**');
        out.push('4. Click the **JavaScript Options** tab');
        out.push('5. Check the box: **Defer JavaScript**');
        out.push('6. Click **Save Changes and Empty Cache**');
        out.push('7. Visit your page and make sure it still looks correct');
        out.push('');
        out.push('**Option B — WP Rocket (paid, if you have it):**');
        out.push('1. Settings → WP Rocket → **File Optimization** tab');
        out.push('2. Under JavaScript: enable **Defer JavaScript execution**');
        out.push('3. Click **Save Changes** → click **Clear Cache**');
      } else if (p === 'webflow') {
        out.push('## How to fix this in Webflow');
        out.push('');
        out.push('1. Log in to **webflow.com/dashboard** and open your project');
        out.push('2. Click the **gear icon ⚙** (Project Settings) in the top left');
        out.push('3. Click the **Custom Code** tab');
        out.push('4. You will see a **Head Code** box and a **Footer Code** box');
        out.push('5. Look at the scripts in Head Code — copy any analytics or tracking scripts (Google Analytics, Facebook Pixel, etc.)');
        out.push('6. Remove them from Head Code and paste them into **Footer Code** instead');
        out.push('7. Click **Save** → click **Publish**');
        out.push('');
        out.push('> Moving scripts from head to footer has the same effect as "defer" — the page renders first, scripts load after.');
      } else if (p === 'squarespace') {
        out.push('## How to fix this in Squarespace');
        out.push('');
        out.push('1. Log in to Squarespace → click **Settings** in the left menu');
        out.push('2. Click **Advanced** → click **Code Injection**');
        out.push('3. You will see a **Header** box and a **Footer** box');
        out.push('4. Cut any `<script>` tracking tags from **Header** and paste them into **Footer**');
        out.push('5. Click **Save**');
      } else {
        out.push('## How to fix this');
        out.push('');
        out.push('This fix requires editing your website\'s HTML template. We recommend sharing the Fix Code tab with your developer. Here is the message to send:');
        out.push('');
        out.push('> "Please add the `defer` attribute to the script tags listed in the Fix Code tab on my SEO task. This will improve our mobile page load time from ' + (task.title.match(/\d+\.\d+s/) || ['its current slow speed'])[0] + ' to under 4 seconds."');
      }
      out.push('');
      out.push('## How do you know it worked?');
      out.push('');
      out.push('After making the change, come back here and click **"I Applied the Fix"** → then **"Verify on Live Page"**. Manav will check the page automatically.');
      out.push('For the full result: go to **https://pagespeed.web.dev** and test your page in Mobile mode. The TBT score should drop significantly within 24 hours of deploying.');
      break;
    }

    case 'lazy_loading': {
      out.push('## What is happening and why it matters');
      out.push('');
      out.push('Your page has images that all load at the same time — even images the visitor hasn\'t scrolled to yet. This wastes bandwidth and slows the initial page load.');
      out.push('');
      out.push('Lazy loading means: images near the top load immediately. Images further down the page load only when the visitor scrolls to them. The page feels faster and uses less data on mobile.');
      out.push('');

      if (p === 'hubspot') {
        out.push('## How to fix this in HubSpot');
        out.push('');
        out.push('1. Log in to **app.hubspot.com**');
        out.push('2. Click **Settings → Website → Pages**');
        out.push('3. Scroll to **Site footer HTML**');
        out.push('4. Paste the JavaScript snippet from the **Fix Code tab** into the footer box');
        out.push('5. Click **Save**');
        out.push('');
        out.push('That snippet automatically adds lazy loading to all images below the first two on every page.');
      } else if (p === 'wordpress') {
        out.push('## How to fix this in WordPress');
        out.push('');
        out.push('WordPress automatically adds lazy loading to images since version 5.5. Check if it is already working:');
        out.push('');
        out.push('1. Visit your live page in Chrome');
        out.push('2. Right-click on an image that is lower on the page → click **Inspect**');
        out.push('3. Look in the code that appears for the text `loading="lazy"` — if it is there, you are done!');
        out.push('');
        out.push('If you do NOT see `loading="lazy"`:');
        out.push('1. Go to **Plugins → Add New** in your WordPress dashboard');
        out.push('2. Search for **Autoptimize** → Install → Activate');
        out.push('3. Go to **Settings → Autoptimize → Extra** tab');
        out.push('4. Check **Lazy-load images**');
        out.push('5. Save Changes and Empty Cache');
      } else if (p === 'webflow') {
        out.push('## How to fix this in Webflow');
        out.push('');
        out.push('1. Open your page in **Webflow Designer**');
        out.push('2. Click on each image that is below the main banner/hero section');
        out.push('3. In the right panel, find **Loading** and change it to **Lazy**');
        out.push('4. Leave the first 1-2 images at the top set to **Eager** (they need to load immediately)');
        out.push('5. Click **Publish** when done');
      } else if (p === 'squarespace' || p === 'wix') {
        out.push('## How to fix this in ' + (p === 'squarespace' ? 'Squarespace' : 'Wix'));
        out.push('');
        out.push('1. Log in to your ' + (p === 'squarespace' ? 'Squarespace dashboard → Settings → Advanced → Code Injection' : 'Wix dashboard → Settings → Custom Code'));
        out.push('2. In the **Footer** section, paste the JavaScript snippet from the **Fix Code tab**');
        out.push('3. Click **Save**');
        out.push('');
        out.push('This snippet adds lazy loading to all images below the first two automatically.');
      } else if (p === 'shopify') {
        out.push('## How to fix this in Shopify');
        out.push('');
        out.push('1. Go to **Online Store → Themes**');
        out.push('2. Click **Actions → Edit Code**');
        out.push('3. In the left panel, open **Layout → theme.liquid**');
        out.push('4. Scroll to the very bottom and find the `</body>` tag');
        out.push('5. Paste the JavaScript snippet from Fix Code just before `</body>`');
        out.push('6. Click **Save**');
      } else {
        out.push('## How to fix this');
        out.push('');
        out.push('Paste the JavaScript snippet from Fix Code just before the `</body>` tag in your page template, or share it with your developer.');
      }
      break;
    }

    case 'image_format': {
      out.push('## What is happening and why it matters');
      out.push('');
      out.push('The images on this page are in older formats (JPG, PNG, or GIF). Modern browsers support WebP images, which are typically 30-50% smaller at the same visual quality. Smaller images = faster loading, especially on mobile connections.');
      out.push('');

      if (p === 'wordpress') {
        out.push('## How to fix this in WordPress (5 minutes, no developer needed)');
        out.push('');
        out.push('1. In your WordPress dashboard, go to **Plugins → Add New**');
        out.push('2. Search for **Imagify** → click **Install Now** → click **Activate**');
        out.push('3. You will be prompted to create a free Imagify account — do that (free tier covers most sites)');
        out.push('4. Go to **Settings → Imagify**');
        out.push('5. Check the box: **Convert to WebP**');
        out.push('6. Click **Save & Go to Bulk Optimizer**');
        out.push('7. Click **Imagine All** — it converts all your existing images automatically');
        out.push('');
        out.push('From now on, every new image you upload will also be converted automatically.');
      } else if (p === 'webflow' || p === 'squarespace' || p === 'shopify') {
        const pName = p.charAt(0).toUpperCase() + p.slice(1);
        out.push('## Good news — ' + pName + ' handles this automatically');
        out.push('');
        out.push(pName + ' automatically converts and serves images in WebP format to browsers that support it (over 95% of users). You do not need to do anything manually.');
        out.push('');
        out.push('**To confirm it is working:**');
        out.push('1. Open your live page in Chrome');
        out.push('2. Right-click any image → click **Open image in new tab**');
        out.push('3. Look at the URL in the address bar — it should end in `.webp`');
        out.push('');
        out.push('If it does not end in .webp, contact ' + pName + ' support — this should be happening automatically.');
      } else {
        out.push('## How to fix this');
        out.push('');
        out.push('If your site uses Cloudflare (free plan): enable **Polish** in Cloudflare → Speed → Optimization. Cloudflare converts images to WebP automatically at the CDN level — no changes to your site needed.');
        out.push('');
        out.push('Otherwise: share the conversion script in Fix Code with your developer. It converts all images in a folder to WebP format.');
      }
      break;
    }

    case 'faq_schema': {
      out.push('## What is happening and why it matters');
      out.push('');
      out.push('There are questions being asked on Google related to this page, and Google is showing them in "People Also Ask" boxes in search results. If your page has a special invisible code tag (called FAQ schema) that tells Google your answers, Google may show your page as the answer in those boxes.');
      out.push('');
      out.push('This is invisible to your visitors — it only affects how Google reads your page.');
      out.push('');

      if (p === 'hubspot') {
        out.push('## How to add FAQ schema in HubSpot');
        out.push('');
        out.push('1. Log in to **app.hubspot.com**');
        out.push('2. Click **Marketing → Website → Website Pages**');
        out.push('3. Find your page and click **Edit**');
        out.push('4. In the page editor, click **Settings** (the gear tab at the top)');
        out.push('5. Scroll down to **Advanced Options**');
        out.push('6. Find the **Head HTML** box');
        out.push('7. Copy the code from the **Fix Code tab** and paste it into that box');
        out.push('8. Click **Update** → then click **Publish**');
        out.push('');
        out.push('That is it. The code is invisible to visitors but Google will read it.');
      } else if (p === 'wordpress' && pl === 'yoast') {
        out.push('## How to add FAQ schema in WordPress with Yoast');
        out.push('');
        out.push('Yoast handles this automatically through a special FAQ block:');
        out.push('');
        out.push('1. Go to **Pages → All Pages** → find your page → click **Edit**');
        out.push('2. Click the **+** button to add a new block');
        out.push('3. Search for **FAQ** and select **Yoast FAQ Block**');
        out.push('4. Add each question and its answer in the fields provided');
        if (qs.length > 0) { qs.forEach((q, i) => out.push('   - Question ' + (i+1) + ': ' + q)); }
        out.push('5. Write a direct answer for each question (2-4 sentences)');
        out.push('6. Click **Update**');
        out.push('');
        out.push('Yoast automatically adds the invisible schema code. No copy-pasting required.');
      } else if (p === 'wordpress') {
        out.push('## How to add FAQ schema in WordPress');
        out.push('');
        out.push('1. Go to **Pages → All Pages** → find your page → click **Edit**');
        out.push('2. Scroll to the bottom of your page content');
        out.push('3. Click **+** to add a new block → search for **Custom HTML** → select it');
        out.push('4. Copy the code from the **Fix Code tab** and paste it into the Custom HTML block');
        out.push('5. Click **Update**');
      } else if (p === 'webflow') {
        out.push('## How to add FAQ schema in Webflow');
        out.push('');
        out.push('1. Open your project in Webflow');
        out.push('2. Click the **gear icon ⚙** (Project Settings)');
        out.push('3. Click the **Custom Code** tab');
        out.push('4. In the **Head Code** box, paste the code from the **Fix Code tab**');
        out.push('5. Click **Save** → click **Publish**');
      } else if (p === 'squarespace') {
        out.push('## How to add FAQ schema in Squarespace');
        out.push('');
        out.push('1. Go to **Pages** → hover over your page → click the **gear icon ⚙**');
        out.push('2. Click **Page Settings**');
        out.push('3. Click the **Advanced** tab');
        out.push('4. In the **Page Header Code Injection** box, paste the code from Fix Code');
        out.push('5. Click **Save**');
      } else if (p === 'wix') {
        out.push('## How to add FAQ schema in Wix');
        out.push('');
        out.push('1. Go to your page in the Wix Editor');
        out.push('2. Click the **Page** menu (top of editor) → **SEO**');
        out.push('3. Click **Additional SEO Settings**');
        out.push('4. Click **Structured Data Markup**');
        out.push('5. Click **Add Item** → paste the code from Fix Code → click **Apply**');
        out.push('6. Publish your site');
      } else {
        out.push('## How to add FAQ schema');
        out.push('');
        out.push('Paste the code from Fix Code into the `<head>` section of your page HTML, just before the closing `</head>` tag. Share with your developer if needed.');
      }
      break;
    }

    case 'h1_update': {
      out.push('## What is happening and why it matters');
      out.push('');
      out.push('The main title of this page (called the H1) does not contain your target keyword. Google reads the H1 first when deciding what a page is about. If the keyword is missing from the title, the page is less likely to rank for it.');
      out.push('');
      out.push('The Fix Code tab shows 3 alternative title options. Pick the one that sounds best for your audience — they all include the keyword naturally.');
      out.push('');

      if (p === 'hubspot') {
        out.push('## How to update the title in HubSpot');
        out.push('');
        out.push('1. Log in to **app.hubspot.com**');
        out.push('2. Click **Marketing → Website → Website Pages**');
        out.push('3. Find your page → click **Edit**');
        out.push('4. Click directly on the large title text at the top of the page');
        out.push('5. Replace it with your chosen option from Fix Code');
        out.push('6. Click **Update** → **Publish**');
        out.push('');
        out.push('> Before you publish: check that the new title still accurately represents what the page is about. It should read naturally, not feel stuffed with keywords.');
      } else if (p === 'wordpress') {
        out.push('## How to update the H1 in WordPress');
        out.push('');
        out.push('1. Go to **Pages → All Pages** → find your page → click **Edit**');
        out.push('2. At the very top of the page editor, you will see a large text field — that is your H1');
        out.push('3. Delete the current title and type in your chosen option from Fix Code');
        out.push('4. Click **Update**');
      } else if (p === 'webflow') {
        out.push('## How to update the H1 in Webflow');
        out.push('');
        out.push('1. Open your page in **Webflow Designer**');
        out.push('2. Double-click on the main page title');
        out.push('3. Replace the text with your chosen option from Fix Code');
        out.push('4. Check the right panel — it should say **H1** as the tag type');
        out.push('5. Click **Publish**');
      } else if (p === 'squarespace') {
        out.push('## How to update the H1 in Squarespace');
        out.push('');
        out.push('1. Edit your page in Squarespace');
        out.push('2. Click on the main title text');
        out.push('3. Replace it with your chosen option from Fix Code');
        out.push('4. Make sure the text style is set to **Heading 1** in the toolbar');
        out.push('5. Click **Save**');
      } else {
        out.push('## How to update the H1');
        out.push('');
        out.push('Find the main title of this page in your CMS editor and replace it with Option 1 from Fix Code. If you need help, share Fix Code with your developer.');
      }
      break;
    }

    case 'first_para': {
      out.push('## What is happening and why it matters');
      out.push('');
      out.push('The first paragraph of this page is too generic — it does not mention your target keyword or directly address what someone searching for it wants to know. Google reads the first paragraph to confirm a page matches a search query. A stronger opener improves how well this page ranks.');
      out.push('');
      out.push('The Fix Code tab has a replacement paragraph already written. It includes the keyword and starts with the searcher\'s problem.');
      out.push('');

      if (p === 'hubspot') {
        out.push('## How to update the opening paragraph in HubSpot');
        out.push('');
        out.push('1. Log in to **app.hubspot.com → Marketing → Website → Website Pages**');
        out.push('2. Find your page → click **Edit**');
        out.push('3. Click on the first paragraph of text on the page (just below the title)');
        out.push('4. Select all the text and delete it');
        out.push('5. Type or paste the new paragraph from Fix Code');
        out.push('6. Click **Update** → **Publish**');
      } else if (p === 'wordpress') {
        out.push('## How to update the opening paragraph in WordPress');
        out.push('');
        out.push('1. Go to **Pages → All Pages** → edit your page');
        out.push('2. Find the first paragraph block just below your H1');
        out.push('3. Click on it → select all text → delete it');
        out.push('4. Paste the new text from Fix Code');
        out.push('5. Click **Update**');
      } else if (p === 'webflow') {
        out.push('## How to update the opening paragraph in Webflow');
        out.push('');
        out.push('1. Open your page in Webflow Designer');
        out.push('2. Double-click on the first paragraph of body text');
        out.push('3. Select all → paste the new text from Fix Code');
        out.push('4. Click **Publish**');
      } else {
        out.push('## How to update the opening paragraph');
        out.push('');
        out.push('Find the first paragraph of text on this page in your editor. Select all the text and replace it with the content from Fix Code.');
      }
      break;
    }

    case 'h2_section': {
      out.push('## What is happening and why it matters');
      out.push('');
      out.push('Google is showing "People Also Ask" questions related to this page in search results. These are questions real people are searching for. If your page has a section that directly answers each question, Google may feature your page in the PAA box — giving you extra visibility without any extra ranking effort.');
      out.push('');
      if (qs.length > 0) {
        out.push('Questions to add to this page:');
        qs.forEach((q, i) => out.push('- ' + (i+1) + '. ' + q));
        out.push('');
      }
      out.push('The Fix Code tab has the full text already written for each section — title and answer. You just need to add them to the page.');
      out.push('');

      if (p === 'hubspot') {
        out.push('## How to add the new sections in HubSpot');
        out.push('');
        out.push('1. Log in to **app.hubspot.com → Marketing → Website → Website Pages**');
        out.push('2. Find your page → click **Edit**');
        out.push('3. Scroll to the bottom of your page content');
        out.push('4. Click **+** to add a new module → choose **Rich Text**');
        out.push('5. In the rich text editor, type each question as a **Heading 2**');
        out.push('6. Below each heading, paste the answer paragraph from Fix Code');
        out.push('7. Repeat for each question');
        out.push('8. Click **Update** → **Publish**');
        out.push('');
        out.push('> The heading text must match the question exactly — word for word. Google matches these precisely.');
      } else if (p === 'wordpress') {
        out.push('## How to add the new sections in WordPress');
        out.push('');
        out.push('1. Go to **Pages → All Pages** → edit your page');
        out.push('2. Click at the end of your last content section');
        out.push('3. Press Enter to get a new line');
        out.push('4. Click **+** → search for **Heading** → select it');
        out.push('5. In the heading toolbar, change the heading level to **H2**');
        out.push('6. Type the question exactly as shown in Fix Code');
        out.push('7. Click **+** again → add a **Paragraph** block');
        out.push('8. Paste the answer text from Fix Code');
        out.push('9. Repeat steps 4-8 for each question');
        out.push('10. Click **Update**');
      } else if (p === 'webflow') {
        out.push('## How to add the new sections in Webflow');
        out.push('');
        out.push('1. Open your page in **Webflow Designer**');
        out.push('2. Drag a **Heading** element to the bottom of your page content');
        out.push('3. Set it to **H2** in the right panel');
        out.push('4. Type the question text exactly as written in Fix Code');
        out.push('5. Drag a **Text Block** below it');
        out.push('6. Paste the answer text from Fix Code');
        out.push('7. Repeat for each question');
        out.push('8. Click **Publish**');
      } else if (p === 'squarespace') {
        out.push('## How to add the new sections in Squarespace');
        out.push('');
        out.push('1. Edit your page in Squarespace');
        out.push('2. Scroll to the bottom of your content and add a new **Text block**');
        out.push('3. Type the question → select it → set to **Heading 2** in the text toolbar');
        out.push('4. Press Enter → type the answer paragraph');
        out.push('5. Repeat for each question');
        out.push('6. Click **Save**');
      } else {
        out.push('## How to add the new sections');
        out.push('');
        out.push('In your CMS, go to the bottom of your page content and add a new heading (H2) with the question text, followed by a paragraph with the answer. Repeat for each question. Or share Fix Code with your developer to paste the HTML directly.');
      }
      break;
    }

    case 'gsc_indexing': {
      out.push('## What is happening and why it matters');
      out.push('');
      out.push('This page may not be in Google\'s index yet — meaning it does not appear in search results at all. No amount of SEO work will help if Google hasn\'t found and stored the page. This step requests Google to crawl and index it.');
      out.push('');
      out.push('## How to submit the page to Google (5 minutes)');
      out.push('');
      out.push('You need access to **Google Search Console** for this website. If you do not have it, ask your developer or account manager to invite you — or to do these steps for you.');
      out.push('');
      out.push('1. Go to **https://search.google.com/search-console** and sign in');
      out.push('2. Make sure you have selected the correct website in the top-left dropdown');
      out.push('3. In the search bar at the top of the page, paste this exact URL:');
      out.push('   **' + url + '**');
      out.push('4. Press Enter — Google will check if this page is in its index');
      out.push('');
      out.push('**If the result says "URL is not on Google":**');
      out.push('5. Click the button: **Request Indexing**');
      out.push('6. Google will crawl the page within 24-48 hours');
      out.push('7. Come back in 3-5 days and check **Performance → Pages** to see if this URL starts appearing');
      out.push('');
      out.push('**If the result says "URL is on Google":**');
      out.push('The page IS indexed. The issue is performance — prioritise the LCP fix (Phase 0, Task 1) first.');
      break;
    }

    case 'date_modified_schema': {
      out.push('## What is happening and why it matters');
      out.push('');
      out.push('Google checks how fresh a page\'s content is when deciding how prominently to show it. Adding a "last updated" date in a format Google can read (called schema markup) makes the freshness signal more reliable and trustworthy than the server\'s automatic timestamp.');
      out.push('');

      if (p === 'hubspot') {
        out.push('## How to add this in HubSpot');
        out.push('');
        out.push('1. Log in to **app.hubspot.com → Marketing → Website → Website Pages**');
        out.push('2. Find your page → click **Edit**');
        out.push('3. Click the **Settings** tab (at the top of the editor)');
        out.push('4. Scroll to **Advanced Options → Head HTML**');
        out.push('5. Paste the code from Fix Code into that box');
        out.push('6. Also add a small "Last updated: [today\'s date]" line near the top of your visible page content');
        out.push('7. Click **Update** → **Publish**');
      } else if (p === 'wordpress') {
        out.push('## How to add this in WordPress');
        out.push('');
        out.push('1. Go to **Pages → All Pages** → edit your page');
        out.push('2. Scroll to the bottom of your content');
        out.push('3. Click **+** → search **Custom HTML** → add it');
        out.push('4. Paste the code from Fix Code');
        out.push('5. Also add a visible "Last updated: [today\'s date]" line near the top of your content');
        out.push('6. Click **Update**');
      } else {
        out.push('## How to add this');
        out.push('');
        out.push('Paste the code from Fix Code into your page\'s head section (the same place as other meta tags). Also add a visible "Last updated: [today\'s date]" label near the top of the page content.');
      }
      break;
    }

    default: {
      out.push('## How to apply this fix');
      out.push('');
      out.push('Review the Analysis section above for what was found, and use the Fix Code tab for the exact code to apply. Share with your developer if you are not comfortable making these changes directly.');
      break;
    }
  }

  out.push('');
  out.push('---');
  out.push('');
  out.push('## Done? Tell Manav');
  out.push('Click **"I Applied the Fix"** above once you have made the change. Then click **"Verify on Live Page"** — Manav will check the live page automatically and confirm whether it worked.');

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
    // Skip task_types that already have an executed version — preserve fix code
    const executedStatuses = ['fix_ready', 'applied', 'verifying', 'done', 'running'];
    const projectId  = tasks[0].project_id;
    const auditRunId = tasks[0].audit_run_id;
    let alreadyExecuted = new Set<string>();
    const pageId = tasks[0]?.page_id;
    if (auditRunId || pageId) {
      let q = db().from('dev_tasks').select('task_type').eq('project_id', projectId).in('status', executedStatuses);
      if (pageId)    q = q.eq('page_id', pageId);
      else if (auditRunId) q = q.eq('audit_run_id', auditRunId);
      const { data: existing } = await q;
      if (existing) alreadyExecuted = new Set((existing as any[]).map((r: any) => r.task_type));
    }
    const toInsert = tasks.filter(t => !alreadyExecuted.has(t.task_type));
    if (!toInsert.length) return { saved: 0 };

    const rows = toInsert.map(t => ({
      project_id:      t.project_id,
      campaign_id:     t.campaign_id      || null,
      audit_run_id:    t.audit_run_id     || null,
      page_id:         t.page_id          || null,
      template_fix_id: t.template_fix_id  || null,
      phase:           t.phase,
      category:        t.category,
      task_type:       t.task_type,
      title:           t.title,
      description:     t.description      || null,
      finding_title:   t.finding_title    || null,
      finding_detail:  (t.finding_detail  || '').slice(0, 2000),
      severity:        t.severity,
      target_url:      t.target_url       || null,
      priority:        t.priority,
      status:          t.status,
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
  // SAFETY: only delete tasks that have never been executed.
  // Tasks with fix_ready/applied/done status contain generated fix code
  // that the user needs — never wipe those regardless of re-uploads or audit refreshes.
  try {
    let q = db().from('dev_tasks')
      .delete()
      .eq('project_id', projectId)
      .in('status', ['pending', 'failed', 'skipped']);
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
