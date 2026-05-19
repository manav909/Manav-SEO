/* ════════════════════════════════════════════════════════════════
   src/components/pm/api.ts
   PM Module — typed API client.

   Every network call the module makes goes through here. Cards are
   stored in kanban_tasks (extended via pm_module.sql) and accessed
   through task-engine actions. No component talks to fetch() directly.

   All calls fail soft: on error they resolve to a safe empty shape so
   the UI never crashes on a bad response.
════════════════════════════════════════════════════════════════ */

import type { TaskCard, RequirementContext, ExecRole, ExecutionMode } from './types';

const ENGINE = '/api/task-engine';
const CONTROL = '/api/control';

/* ── low-level POST with safe JSON handling ── */
async function post(url: string, body: any): Promise<any> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'pm-module' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 200);
      try { const e = JSON.parse(text); msg = e.error || e.message || msg; } catch { /* keep raw */ }
      return { success: false, error: msg };
    }
    try { return JSON.parse(text); }
    catch { return { success: false, error: 'Server returned invalid JSON' }; }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' };
  }
}

/* ════════════════════════════════════════════════════
   Mapping — DB row (snake_case) <-> TaskCard (camelCase)
════════════════════════════════════════════════════ */
function rowToCard(r: any): TaskCard {
  return {
    id:            r.id,
    projectId:     r.project_id,
    type:          r.card_type || 'custom',
    title:         r.title || 'Untitled',
    content:       r.description || '',
    priority:      r.priority || 'medium',
    status:        r.status || 'todo',
    week:          typeof r.week === 'number' ? r.week : 5,
    placed:        !!r.placed,
    effortHours:   r.estimated_hours ?? undefined,
    executionMode: r.execution_mode || undefined,
    executedRole:  r.executed_role || undefined,
    assignedTo:    r.assigned_to ?? null,
    output:        r.output || undefined,
    executedAt:    r.executed_at ?? null,
    verifiedAt:    r.verified_at ?? null,
    verifyNotes:   r.verify_notes || undefined,
    requirements:  Array.isArray(r.requirements) ? r.requirements : [],
    dependsOn:     Array.isArray(r.depends_on) ? r.depends_on : [],
    source:        r.source || undefined,
    sourceRefs:    Array.isArray(r.source_refs) ? r.source_refs : [],
    reportedAt:    r.reported_at ?? null,
    invoiceItem:   !!r.invoice_item,
    tags:          Array.isArray(r.tags) ? r.tags : [],
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  };
}

/* Only the fields the PM module owns — sent on save. */
function cardToPayload(c: Partial<TaskCard>): any {
  const p: any = {};
  if (c.id !== undefined)            p.id = c.id;
  if (c.projectId !== undefined)     p.projectId = c.projectId;
  if (c.title !== undefined)         p.title = c.title;
  if (c.content !== undefined)       p.description = c.content;
  if (c.type !== undefined)          p.card_type = c.type;
  if (c.priority !== undefined)      p.priority = c.priority;
  if (c.status !== undefined)        p.status = c.status;
  if (c.week !== undefined)          p.week = c.week;
  if (c.placed !== undefined)        p.placed = c.placed;
  if (c.effortHours !== undefined)   p.estimated_hours = c.effortHours;
  if (c.executionMode !== undefined) p.execution_mode = c.executionMode;
  if (c.executedRole !== undefined)  p.executed_role = c.executedRole;
  if (c.assignedTo !== undefined)    p.assigned_to = c.assignedTo;
  if (c.output !== undefined)        p.output = c.output;
  if (c.requirements !== undefined)  p.requirements = c.requirements;
  if (c.dependsOn !== undefined)     p.depends_on = c.dependsOn;
  if (c.source !== undefined)        p.source = c.source;
  if (c.sourceRefs !== undefined)    p.source_refs = c.sourceRefs;
  if (c.tags !== undefined)          p.tags = c.tags;
  return p;
}

/* ════════════════════════════════════════════════════
   Public API
════════════════════════════════════════════════════ */

/* Load all PM cards for a project. */
export async function loadCards(projectId: string): Promise<TaskCard[]> {
  const r = await post(ENGINE, { action: 'pm_get_cards', projectId });
  if (!r?.success || !Array.isArray(r.cards)) return [];
  return r.cards.map(rowToCard);
}

/* Create or update a single card. Returns the saved card or null. */
export async function saveCard(card: Partial<TaskCard>): Promise<TaskCard | null> {
  const r = await post(ENGINE, { action: 'pm_save_card', card: cardToPayload(card) });
  return r?.success && r.card ? rowToCard(r.card) : null;
}

/* Update placement/status only (lightweight — used on drag). */
export async function updateCard(id: string, patch: Partial<TaskCard>): Promise<boolean> {
  const r = await post(ENGINE, { action: 'pm_save_card', card: { id, ...cardToPayload(patch) } });
  return !!r?.success;
}

/* Delete a card. */
export async function deleteCard(id: string): Promise<boolean> {
  const r = await post(ENGINE, { action: 'pm_delete_card', cardId: id });
  return !!r?.success;
}

/* Gather the project's intelligence into a requirement context. */
export async function gatherRequirements(projectId: string): Promise<RequirementContext | null> {
  const r = await post(ENGINE, { action: 'pm_gather_requirements', projectId });
  return r?.success ? r.context as RequirementContext : null;
}

/* Ask AI to generate a set of task cards from gathered requirements. */
export async function generateCards(projectId: string): Promise<TaskCard[]> {
  const r = await post(ENGINE, { action: 'pm_generate_cards', projectId });
  if (!r?.success || !Array.isArray(r.cards)) return [];
  return r.cards.map(rowToCard);
}

/* Ask AI to enhance / refine a single card. */
export async function enhanceCard(card: TaskCard): Promise<TaskCard | null> {
  const r = await post(ENGINE, { action: 'pm_enhance_card', card: cardToPayload(card) });
  return r?.success && r.card ? rowToCard(r.card) : null;
}

/* Analyse dependencies & prerequisites across all of a project's cards. */
export async function analyzeDependencies(projectId: string): Promise<{
  cardId: string; dependsOn: string[]; requirements: any[];
}[]> {
  const r = await post(ENGINE, { action: 'pm_analyze_dependencies', projectId });
  return r?.success && Array.isArray(r.analysis) ? r.analysis : [];
}

/* Project context for the executor's pre-fill (Data Room data). */
export async function getProjectContext(projectId: string): Promise<any> {
  const r = await post(CONTROL, { action: 'get_context', projectId });
  return r?.context || {};
}

/* Brain learnings relevant to a card type — feeds the executor. */
export async function getRelevantLearnings(projectId: string, cardType: string): Promise<any[]> {
  const r = await post(ENGINE, { action: 'get_relevant', project_id: projectId, card_type: cardType, limit: 8 });
  return Array.isArray(r?.learnings) ? r.learnings : [];
}

/* Execute a card. Streaming — returns the Response so the caller can
   read the stream. Mode decides whether AI does the task or writes a guide. */
export async function executeCard(opts: {
  card: TaskCard;
  projectId: string;
  mode: ExecutionMode;
  role: ExecRole;
  userInputs: Record<string, string>;
  context: any;
  brainLearnings: any[];
}): Promise<Response> {
  return fetch(ENGINE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'pm-module' },
    body: JSON.stringify({
      action: 'pm_execute_card',
      card: cardToPayload(opts.card),
      projectId: opts.projectId,
      mode: opts.mode,
      role: opts.role,
      userInputs: opts.userInputs,
      context: opts.context,
      brainLearnings: opts.brainLearnings,
    }),
  });
}

/* Save the execution result back onto the card. */
export async function saveExecution(opts: {
  cardId: string; mode: ExecutionMode; role: ExecRole; output: string;
}): Promise<boolean> {
  const r = await post(ENGINE, {
    action: 'pm_save_execution',
    cardId: opts.cardId, mode: opts.mode, role: opts.role, output: opts.output,
  });
  return !!r?.success;
}

/* Mark a card verified after the evidence checklist. */
export async function verifyCard(cardId: string, notes: string): Promise<boolean> {
  const r = await post(ENGINE, { action: 'pm_verify_card', cardId, notes });
  return !!r?.success;
}

/* Generate a task/progress report for invoicing. */
export async function generateTaskReport(projectId: string, range: 'daily' | 'on_demand'): Promise<any> {
  const r = await post(ENGINE, { action: 'pm_task_report', projectId, range });
  return r?.success ? r.report : null;
}

/* Manually link a target keyword to a crawled landing-page URL.
   Pass url='' to remove the link. Overrides inferred matching. */
export async function linkKeywordPage(
  projectId: string, keyword: string, url: string,
): Promise<{ success: boolean; linked?: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_link_keyword_page', projectId, keyword, url });
  return r || { success: false, error: 'No response' };
}

/* Run a fresh crawl + AI competitive comparison.
   The crawl itself calls /api/crawl directly (relative path — works
   reliably from the browser). The resulting comparison is then saved
   server-side so the Requirements tab can show it later.
   Slow — crawls live pages + two AI passes. Show a spinner. */
export async function runCrawl(projectId: string): Promise<{
  success: boolean; comparison?: any; crawledCount?: number;
  savedCount?: number; saveError?: string; error?: string;
}> {
  try {
    /* 1. Ask the server which URLs to crawl (site + landing + competitors). */
    const t = await post(ENGINE, { action: 'pm_crawl_targets', projectId });
    if (!t?.success || !Array.isArray(t.urls) || !t.urls.length) {
      return { success: false, error: t?.error || 'No URLs to crawl — add the site URL, landing pages, or competitors in the Data Room.' };
    }

    /* 2. Crawl the URLs — /api/crawl crawl_urls streams NDJSON
          (one JSON object per line, final line type:"complete"). */
    const crawlRes = await fetch('/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'pm-module' },
      body: JSON.stringify({
        action: 'crawl_urls', urls: t.urls, projectId,
        projectContext: t.projectContext || '', forceRefresh: true,
      }),
    });
    if (!crawlRes.ok || !crawlRes.body) {
      return { success: false, error: `Crawl service error (${crawlRes.status}).` };
    }

    /* read the NDJSON stream — the final {type:"complete"} line carries results */
    const reader = crawlRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let crawlResults: any = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'complete') crawlResults = msg;
        } catch { /* skip non-JSON line */ }
      }
    }
    /* the trailing buffer may hold the final line */
    if (buf.trim()) {
      try {
        const msg = JSON.parse(buf);
        if (msg.type === 'complete') crawlResults = msg;
      } catch { /* ignore */ }
    }
    if (!crawlResults?.results?.length) {
      return { success: false, error: 'Crawl returned no results.' };
    }

    /* 3. Run the AI competitive comparison. */
    const cmpRes = await fetch('/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'pm-module' },
      body: JSON.stringify({
        action: 'compare_analysis', crawlResults,
        projectContext: t.projectContext || '',
      }),
    });
    const cmpText = await cmpRes.text();
    let cmp: any;
    try { cmp = JSON.parse(cmpText); }
    catch { return { success: false, error: 'Comparison service returned an unexpected response.' }; }
    const comparison = cmp?.analysis || cmp;
    if (cmp?.error && !comparison?.executive_summary) {
      return { success: false, error: cmp.error };
    }

    /* 4. Persist the comparison server-side. */
    await post(ENGINE, { action: 'pm_save_crawl_comparison', projectId, comparison });

    /* check whether any page failed to persist to crawled_pages */
    const saveErrors = (crawlResults.results || [])
      .filter((r: any) => r?.save_error)
      .map((r: any) => r.save_error);
    const savedCount = (crawlResults.results || [])
      .filter((r: any) => !r?.save_error).length;

    return {
      success: true,
      comparison,
      crawledCount: crawlResults.results.length,
      savedCount,
      saveError: saveErrors.length
        ? `${saveErrors.length} page(s) not saved: ${saveErrors[0]}`
        : undefined,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Crawl failed' };
  }
}
