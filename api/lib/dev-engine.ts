/* ════════════════════════════════════════════════════════════════
   api/lib/dev-engine.ts
   Developer task engine — parses audit findings into executable
   dev tasks, runs Claude to generate exact fixes, verifies results.

   This IS the developer for Manav. It reads what the audit found,
   fetches the live page, generates the exact code patch, and
   verifies the fix was applied. The loop:
     parse → task list → execute → fix_ready → apply → verify → done

   Task types:
     Performance:  lcp_fix, lazy_loading, image_format, script_defer, fetchpriority
     Schema:       faq_schema, date_modified_schema
     On-page:      h1_update, meta_desc, first_para, h2_section
     Indexing:     gsc_indexing
════════════════════════════════════════════════════════════════ */

import { db } from './db.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-4-6';

/* ── Types ──────────────────────────────────────────────────── */

export interface DevTask {
  id?: string;
  project_id: string;
  campaign_id?: string | null;
  audit_run_id?: string | null;
  phase: 'phase_0' | 'phase_2' | 'phase_3';
  category: 'performance' | 'schema' | 'on_page' | 'content' | 'analytics' | 'indexing';
  task_type: string;
  title: string;
  description?: string;
  finding_ref?: string;
  finding_title?: string;
  finding_detail?: string;
  severity: 'critical' | 'warning' | 'info';
  target_url?: string;
  priority: number;
  status: 'pending' | 'running' | 'fix_ready' | 'applied' | 'verifying' | 'done' | 'skipped' | 'failed';
  analysis?: string;
  fix_code?: string;
  fix_language?: string;
  apply_instructions?: string;
  verification_method?: string;
  verified_at?: string;
  verification_result?: 'pass' | 'fail' | 'partial';
  verification_evidence?: any;
  llm_calls_used?: number;
  executed_at?: string;
  created_at?: string;
  updated_at?: string;
}

/* ── Audit findings → task list ─────────────────────────────── */

interface AuditFinding {
  audit_kind: string;
  severity: string;
  finding_title: string;
  finding_detail?: string;
  recommendation?: string;
  evidence?: any;
}

/** Parse raw audit findings into structured DevTask rows.
 *  Each finding that requires a developer action maps to one task.
 *  Pure content tasks (PAA H2 writing) are excluded — this is for
 *  technical fixes only. */
export function parseFindingsToTasks(
  findings: AuditFinding[],
  opts: { projectId: string; campaignId?: string; auditRunId?: string; targetUrl?: string },
): DevTask[] {
  const tasks: DevTask[] = [];

  for (const f of findings) {
    const t = classifyFinding(f, opts);
    if (t) tasks.push(t);
  }

  /* Sort: phase_0 first, then by severity (critical > warning > info),
     then by priority within phase. */
  const phaseOrder: Record<string, number> = { phase_0: 0, phase_2: 1, phase_3: 2 };
  const sevOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  tasks.sort((a, b) => {
    const phDiff = (phaseOrder[a.phase] ?? 9) - (phaseOrder[b.phase] ?? 9);
    if (phDiff !== 0) return phDiff;
    const svDiff = (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9);
    if (svDiff !== 0) return svDiff;
    return a.priority - b.priority;
  });

  return tasks;
}

function classifyFinding(
  f: AuditFinding,
  opts: { projectId: string; campaignId?: string; auditRunId?: string; targetUrl?: string },
): DevTask | null {
  const base = {
    project_id: opts.projectId,
    campaign_id: opts.campaignId || null,
    audit_run_id: opts.auditRunId || null,
    target_url: opts.targetUrl,
    finding_title: f.finding_title,
    finding_detail: f.finding_detail,
    severity: (f.severity === 'red' ? 'critical' : f.severity === 'amber' ? 'warning' : 'info') as DevTask['severity'],
    status: 'pending' as const,
  };

  /* ── Performance ── */
  if (/MOBILE LCP.*exceeds/i.test(f.finding_title)) {
    return {
      ...base, phase: 'phase_0', category: 'performance', task_type: 'lcp_fix',
      title: 'Fix render-blocking JavaScript causing 16s+ mobile LCP',
      description: 'Identify and defer non-critical scripts blocking page render. TBT data pinpoints the JS blocking the main thread.',
      finding_ref: extractRef(f.finding_title),
      priority: 1,
    };
  }
  if (/TBT.*severe|severe.*TBT/i.test(f.finding_title)) {
    const strategy = /MOBILE/i.test(f.finding_title) ? 'mobile' : 'desktop';
    return {
      ...base, phase: 'phase_0', category: 'performance', task_type: 'script_defer',
      title: `Defer render-blocking scripts (${strategy} TBT ${f.evidence?.tbt_ms ? Math.round(f.evidence.tbt_ms) + 'ms' : 'high'})`,
      description: 'Profile Long Tasks, identify blocking bundles, apply defer/async attributes.',
      finding_ref: extractRef(f.finding_title),
      priority: 2,
    };
  }
  if (/Lazy-loading.*low|loading.*lazy/i.test(f.finding_title)) {
    return {
      ...base, phase: 'phase_3', category: 'performance', task_type: 'lazy_loading',
      title: 'Add loading="lazy" to below-fold images',
      description: `${f.evidence?.total_images || '20'} images, 0 lazy-loaded. Free CWV improvement.`,
      finding_ref: extractRef(f.finding_title),
      priority: 30,
    };
  }
  if (/modern image format|jpg\/png\/gif/i.test(f.finding_title)) {
    return {
      ...base, phase: 'phase_3', category: 'performance', task_type: 'image_format',
      title: `Convert ${f.evidence?.legacy_format || 12} images to webp/avif`,
      description: 'Legacy formats 25-50% larger than webp. Image CDN or build-pipeline conversion.',
      finding_ref: extractRef(f.finding_title),
      priority: 31,
    };
  }

  /* ── Schema ── */
  if (/FAQPage schema missing/i.test(f.finding_title)) {
    return {
      ...base, phase: 'phase_2', category: 'schema', task_type: 'faq_schema',
      title: 'Generate and add FAQPage JSON-LD schema',
      description: `${f.evidence?.paa_count || 4} PAA questions need FAQPage schema for rich results and AI Overview citations.`,
      finding_ref: extractRef(f.finding_title),
      priority: 10,
    };
  }
  if (/Content freshness.*authenticity/i.test(f.finding_title)) {
    return {
      ...base, phase: 'phase_3', category: 'schema', task_type: 'date_modified_schema',
      title: 'Add dateModified to JSON-LD schema',
      description: 'BreadcrumbList exists. Add dateModified field + visible "Last updated" label.',
      finding_ref: extractRef(f.finding_title),
      priority: 35,
    };
  }

  /* ── On-page ── */
  if (/keyword.*present in only one.*title.*H1|H1.*keyword/i.test(f.finding_title)) {
    return {
      ...base, phase: 'phase_2', category: 'on_page', task_type: 'h1_update',
      title: 'Update H1 to include campaign keyword',
      description: 'H1 currently partial match. Claude will generate optimized H1 that includes "mobile forms" naturally.',
      finding_ref: extractRef(f.finding_title),
      priority: 12,
    };
  }
  if (/First paragraph weakly aligned/i.test(f.finding_title)) {
    return {
      ...base, phase: 'phase_2', category: 'on_page', task_type: 'first_para',
      title: 'Rewrite first paragraph (18% keyword overlap)',
      description: 'Above-fold copy is generic tagline. Claude will generate searcher-aligned opener.',
      finding_ref: extractRef(f.finding_title),
      priority: 15,
    };
  }
  if (/PAA questions.*NOT addressed/i.test(f.finding_title)) {
    const unanswered = Array.isArray(f.evidence?.unanswered) ? f.evidence.unanswered : [];
    return {
      ...base, phase: 'phase_2', category: 'content', task_type: 'h2_section',
      title: `Write ${unanswered.length || 1} new PAA H2 section(s)`,
      description: unanswered.length > 0 ? `Missing: ${unanswered.join(', ')}` : 'Unanswered PAA questions need new H2 sections.',
      finding_ref: extractRef(f.finding_title),
      priority: 11,
    };
  }

  /* ── Indexing ── */
  if (/Page not in GSC top pages/i.test(f.finding_title)) {
    return {
      ...base, phase: 'phase_0', category: 'indexing', task_type: 'gsc_indexing',
      title: 'Request GSC indexing for /mobile-forms',
      description: 'Page not appearing in GSC. Submit via URL Inspection → Request Indexing.',
      finding_ref: extractRef(f.finding_title),
      priority: 5,
    };
  }

  return null; // not a dev-executable task
}

function extractRef(title: string): string {
  return ''; // finding_ref is set by the renderer; here we leave blank for now
}

/* ── Execute a single task ──────────────────────────────────── */

/** Core execution: fetch the live page, run Claude to analyze and
 *  generate the exact fix. Returns updated task fields. */
export async function executeDevTask(task: DevTask): Promise<Partial<DevTask>> {
  const url = task.target_url || '';

  /* Fetch live page HTML */
  let pageHtml = '';
  let fetchError = '';
  if (url) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SEOSeason-DevAgent/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        pageHtml = await res.text();
        // Truncate for LLM — keep head + first 6000 chars of body
        const headMatch = pageHtml.match(/<head[\s\S]*?<\/head>/i);
        const headSection = headMatch ? headMatch[0] : '';
        const bodyStart = pageHtml.substring(0, 8000);
        pageHtml = headSection + '\n...\n' + bodyStart;
      } else {
        fetchError = `HTTP ${res.status}`;
      }
    } catch (e: any) {
      fetchError = e?.message || 'fetch failed';
    }
  }

  /* Build the executor prompt based on task type */
  const executor = getExecutorPrompt(task, pageHtml, fetchError);

  /* Call Claude */
  let callsMade = 0;
  let analysisResult = '';
  let fixCode = '';
  let fixLanguage = 'html';
  let applyInstructions = '';
  let verificationMethod = '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        system: executor.system,
        messages: [{ role: 'user', content: executor.user }],
      }),
    });

    callsMade++;
    const data = await response.json() as any;
    const rawText = (data?.content?.[0]?.text || '').trim();

    /* Try to parse structured JSON response */
    const jsonMatch = rawText.match(/\{[\s\S]+\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        analysisResult = parsed.analysis || '';
        fixCode = parsed.fix_code || '';
        fixLanguage = parsed.fix_language || 'html';
        applyInstructions = parsed.apply_instructions || '';
        verificationMethod = parsed.verification_method || '';
      } catch {
        analysisResult = rawText;
      }
    } else {
      analysisResult = rawText;
    }
  } catch (e: any) {
    analysisResult = `Execution error: ${e?.message}`;
  }

  return {
    status: 'fix_ready',
    analysis: analysisResult,
    fix_code: fixCode,
    fix_language: fixLanguage,
    apply_instructions: applyInstructions,
    verification_method: verificationMethod,
    executed_at: new Date().toISOString(),
    llm_calls_used: callsMade,
    updated_at: new Date().toISOString(),
  };
}

/* ── Verify a task ──────────────────────────────────────────── */

/** Verify that a fix was applied by re-fetching the live page
 *  and checking for the expected change. */
export async function verifyDevTask(task: DevTask): Promise<Partial<DevTask>> {
  const url = task.target_url || '';
  if (!url) {
    return {
      status: 'failed',
      verification_result: 'fail',
      verification_evidence: { error: 'no target URL' },
      verified_at: new Date().toISOString(),
    };
  }

  let pageHtml = '';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SEOSeason-DevAgent/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) pageHtml = await res.text();
  } catch (e: any) {
    return {
      status: 'failed',
      verification_result: 'fail',
      verification_evidence: { error: e?.message },
      verified_at: new Date().toISOString(),
    };
  }

  /* Type-specific verification checks */
  const evidence: Record<string, any> = {};
  let result: 'pass' | 'fail' | 'partial' = 'fail';

  switch (task.task_type) {
    case 'lazy_loading': {
      const lazyCount = (pageHtml.match(/loading=["']lazy["']/gi) || []).length;
      const imgCount  = (pageHtml.match(/<img\b/gi) || []).length;
      evidence.lazy_count = lazyCount;
      evidence.total_images = imgCount;
      result = lazyCount > 0 ? (lazyCount >= imgCount * 0.5 ? 'pass' : 'partial') : 'fail';
      break;
    }
    case 'faq_schema': {
      const hasFaq = /FAQPage/i.test(pageHtml) && /application\/ld\+json/i.test(pageHtml);
      evidence.has_faq_schema = hasFaq;
      result = hasFaq ? 'pass' : 'fail';
      break;
    }
    case 'h1_update': {
      const h1Match = pageHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const h1Text = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';
      evidence.h1_text = h1Text;
      evidence.has_mobile_forms = /mobile forms/i.test(h1Text);
      result = evidence.has_mobile_forms ? 'pass' : 'fail';
      break;
    }
    case 'date_modified_schema': {
      const hasDateMod = /dateModified/i.test(pageHtml);
      evidence.has_date_modified = hasDateMod;
      result = hasDateMod ? 'pass' : 'fail';
      break;
    }
    case 'image_format': {
      const webpCount = (pageHtml.match(/\.webp/gi) || []).length;
      const avifCount = (pageHtml.match(/\.avif/gi) || []).length;
      evidence.webp_count = webpCount;
      evidence.avif_count = avifCount;
      result = (webpCount + avifCount) > 0 ? 'pass' : 'fail';
      break;
    }
    case 'fetchpriority': {
      const hasFetchPriority = /fetchpriority=["']high["']/i.test(pageHtml);
      evidence.has_fetchpriority = hasFetchPriority;
      result = hasFetchPriority ? 'pass' : 'fail';
      break;
    }
    default: {
      /* For complex tasks (LCP, script_defer, first_para, h2_section),
         ask Claude to verify based on the page HTML */
      try {
        const verSys = `You are verifying whether a developer fix was applied to a live web page.
Task: ${task.title}
Fix applied was: ${task.fix_code?.slice(0, 500) || task.apply_instructions?.slice(0, 500) || 'See task description'}
Verification method: ${task.verification_method || 'Check if the fix is present'}

Reply with ONLY valid JSON: { "result": "pass" | "fail" | "partial", "evidence": { "detail": "..." } }`;

        const pageSnippet = pageHtml.substring(0, 4000);
        const verResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 500,
            system: verSys,
            messages: [{ role: 'user', content: `Page HTML snippet:\n\n${pageSnippet}` }],
          }),
        });
        const verData = await verResp.json() as any;
        const verText = verData?.content?.[0]?.text || '';
        const verJson = JSON.parse(verText.match(/\{[\s\S]+\}/)?.[0] || '{}');
        result = verJson.result || 'partial';
        Object.assign(evidence, verJson.evidence || {});
      } catch {
        result = 'partial';
        evidence.note = 'Could not auto-verify — check manually';
      }
    }
  }

  return {
    status: result === 'pass' ? 'done' : result === 'partial' ? 'applied' : 'applied',
    verification_result: result,
    verification_evidence: evidence,
    verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/* ── Executor prompts per task type ─────────────────────────── */

function getExecutorPrompt(task: DevTask, pageHtml: string, fetchError: string): { system: string; user: string } {
  const htmlSection = fetchError
    ? `[Could not fetch live page: ${fetchError}]`
    : `LIVE PAGE HTML (truncated):\n\`\`\`html\n${pageHtml}\n\`\`\``;

  const systemBase = `You are a senior web developer fixing SEO and performance issues on a live production page.
You have access to the live HTML of the page. Your job is to:
1. Analyze the specific problem on THIS page
2. Generate the exact fix code
3. Provide precise application instructions

Reply ONLY with valid JSON matching this shape:
{
  "analysis": "What exactly is wrong on this specific page (2-4 sentences, reference specific elements/scripts found)",
  "fix_code": "The exact code to add/change/replace",
  "fix_language": "html|json|javascript|bash|text",
  "apply_instructions": "Numbered step-by-step instructions to apply the fix. Be specific about WHERE in the file.",
  "verification_method": "Exactly how to verify the fix worked (what to check, what URL, what tool)"
}`;

  const taskContext = `Task: ${task.title}
Finding: ${task.finding_title || ''}
Detail: ${task.finding_detail?.slice(0, 400) || ''}
Target URL: ${task.target_url || 'unknown'}`;

  switch (task.task_type) {

    case 'lcp_fix':
    case 'script_defer':
      return {
        system: systemBase,
        user: `${taskContext}

${htmlSection}

Find all <script> tags that are NOT deferred/async and are in the <head> or before the main content. For each blocking script:
- Identify the script src or inline content
- Determine if it can be safely deferred (third-party analytics, chat widgets, non-critical utilities = YES; critical rendering scripts = be careful)
- Generate the exact modified <script> tags with defer or async added

Also check if there are any render-blocking stylesheets that could be deferred.

Generate the complete fix showing BEFORE and AFTER for each script change.`,
      };

    case 'lazy_loading':
      return {
        system: systemBase,
        user: `${taskContext}

${htmlSection}

Find all <img> tags in the page HTML. Identify which ones are below the fold (not the first 1-3 images in the main content area). Generate the complete list of img tags with loading="lazy" added. Also check if any images that should load eagerly (hero/above-fold) are missing fetchpriority="high".`,
      };

    case 'image_format':
      return {
        system: systemBase,
        user: `${taskContext}

${htmlSection}

Find all jpg/png/gif images on the page. Generate:
1. A node.js script using sharp to convert them to webp
2. The <picture> element HTML for each image showing webp with jpg/png fallback
3. If using an image CDN (Cloudflare, Imgix, etc.) — generate the format-on-demand URL pattern

List all legacy-format images found with their src URLs.`,
      };

    case 'faq_schema': {
      const questions = task.finding_detail?.match(/- (.+\?)/g)?.map(q => q.replace('- ', '')) || [
        'What are mobile forms?',
        "Can you make a form on mobile?",
        "What's the best app to fill out forms?",
        "Does forms have a mobile app?",
      ];
      return {
        system: systemBase,
        user: `${taskContext}

${htmlSection}

Generate a complete FAQPage JSON-LD schema block for these PAA questions:
${questions.map(q => `- ${q}`).join('\n')}

For each question, extract the answer from the page HTML if it exists, OR write a 50-70 word direct answer based on the page content and context (this is a mobile forms software product page for AlphaSoftware).

Requirements:
- Every question must have a matching Answer
- Answers must be 40-80 words (citation-friendly)
- Answers must match visible page content (Google manual action risk if they don't)
- Use @type FAQPage with mainEntity array

Generate the complete <script type="application/ld+json"> block ready to paste into the <head>.`,
      };
    }

    case 'h1_update':
      return {
        system: systemBase,
        user: `${taskContext}

${htmlSection}

Current H1: "${task.finding_detail?.match(/H1[^"]*"([^"]+)"/)?.[1] || 'Best Mobile Data Collection Apps for Business'}"
Campaign keyword: "mobile forms"

Generate an improved H1 that:
- Contains "mobile forms" naturally (not forced)
- Maintains the commercial/product intent (this is a software product page)  
- Is 5-9 words
- Reads well for humans (not keyword-stuffed)
- Preserves the existing brand positioning

Provide 3 options ranked by preference with brief rationale for each.`,
      };

    case 'first_para':
      return {
        system: systemBase,
        user: `${taskContext}

${htmlSection}

Current first paragraph: "Capture accurate data anywhere, even offline, and instantly deliver it to the systems that run your business."

This is a mobile forms software product page. The campaign keyword is "mobile forms". The page title is "Best Mobile Forms Software & Mobile Forms App Builder".

Rewrite the first paragraph following this formula:
1. Open with the searcher's problem (what someone searching "mobile forms" actually wants to solve)
2. Who this product is for (be specific: field teams, construction, healthcare, etc.)  
3. One sentence on what makes AlphaSoftware's mobile forms different

Requirements:
- 60-100 words
- Contains "mobile forms" in sentence 1
- No generic taglines ("In today's world", "Streamline your workflow")
- Written as if Google's AI Overview might quote the first sentence
- Sounds like a real product page, not AI-generated copy`,
      };

    case 'h2_section': {
      const unanswered = task.description?.match(/"([^"]+\?)"/g)?.map(q => q.replace(/"/g, '')) || ["What's the best app to fill out forms?"];
      return {
        system: systemBase,
        user: `${taskContext}

${htmlSection}

Write complete H2 sections for these unanswered PAA questions:
${unanswered.map(q => `- ${q}`).join('\n')}

For each section, provide:
<h2>[exact question or tight rephrase]</h2>
<p>[40-80 word direct answer — this is the citation candidate for Google PAA box]</p>
[300-500 word body with: criteria for evaluating options, comparison of approaches, AlphaSoftware's position honestly stated, decision-tree closing paragraph]

The page is for AlphaSoftware's mobile forms product. Be honest — include competitor options when answering comparison questions. Pages that include honest competitor mentions earn more trust and more links than biased vendor-only answers.`,
      };
    }

    case 'date_modified_schema':
      return {
        system: systemBase,
        user: `${taskContext}

${htmlSection}

1. Find the existing BreadcrumbList JSON-LD schema in the page
2. Generate an updated version with dateModified added (use today's date ${new Date().toISOString().slice(0, 10)})
3. Also generate the HTML for a visible "Last updated: [date]" label to add near the page title or at the bottom of the intro section

Output the complete updated schema block AND the HTML for the visible label.`,
      };

    case 'gsc_indexing':
      return {
        system: systemBase,
        user: `${taskContext}

The page ${task.target_url} is not appearing in Google Search Console. Generate:

1. A checklist to diagnose WHY the page isn't indexed (check robots.txt, canonical, noindex meta, redirect chains)
2. Exact steps to submit for indexing via GSC URL Inspection tool
3. What to look for in the GSC response and what each status means
4. Timeline expectations (how long indexing takes)
5. What to do if indexing is refused

Also check the page HTML above for any obvious indexing blockers (meta robots tags, noindex headers).`,
      };

    default:
      return {
        system: systemBase,
        user: `${taskContext}\n\n${htmlSection}\n\nAnalyze this specific issue on the live page and generate the exact fix code with application instructions.`,
      };
  }
}

/* ── DB helpers ─────────────────────────────────────────────── */

export async function saveTasks(tasks: DevTask[]): Promise<{ saved: number; error?: string }> {
  try {
    if (tasks.length === 0) return { saved: 0 };
    const rows = tasks.map(t => ({
      project_id: t.project_id,
      campaign_id: t.campaign_id || null,
      audit_run_id: t.audit_run_id || null,
      phase: t.phase,
      category: t.category,
      task_type: t.task_type,
      title: t.title,
      description: t.description || null,
      finding_ref: t.finding_ref || null,
      finding_title: t.finding_title || null,
      finding_detail: t.finding_detail?.slice(0, 2000) || null,
      severity: t.severity,
      target_url: t.target_url || null,
      priority: t.priority,
      status: t.status,
    }));
    const { error } = await db().from('dev_tasks').insert(rows);
    if (error) return { saved: 0, error: error.message };
    return { saved: rows.length };
  } catch (e: any) {
    return { saved: 0, error: e?.message };
  }
}

export async function updateTask(taskId: string, updates: Partial<DevTask>): Promise<void> {
  const sanitized: any = { ...updates, updated_at: new Date().toISOString() };
  delete sanitized.id;
  await db().from('dev_tasks').update(sanitized).eq('id', taskId);
}

export async function getTask(taskId: string): Promise<DevTask | null> {
  const { data } = await db().from('dev_tasks').select('*').eq('id', taskId).maybeSingle();
  return (data as DevTask) || null;
}

export async function getTasksForProject(projectId: string, opts?: { campaignId?: string; status?: string }): Promise<DevTask[]> {
  let q = db().from('dev_tasks').select('*').eq('project_id', projectId);
  if (opts?.campaignId) q = q.eq('campaign_id', opts.campaignId);
  if (opts?.status)     q = q.eq('status', opts.status);
  q = q.order('priority', { ascending: true }).order('created_at', { ascending: false });
  const { data } = await q;
  return (data as DevTask[]) || [];
}

export async function deleteProjectTasks(projectId: string, auditRunId?: string): Promise<void> {
  let q = db().from('dev_tasks').delete().eq('project_id', projectId);
  if (auditRunId) q = q.eq('audit_run_id', auditRunId);
  await q;
}
