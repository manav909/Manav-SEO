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
/* Ask AI to generate task cards from the gathered intelligence.
   Returns the saved cards or, on failure, a clear error message
   from the backend so the user can see what actually went wrong. */
export async function generateCards(projectId: string): Promise<{
  cards: TaskCard[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_generate_cards', projectId });
  if (!r) return { cards: [], error: 'No response from the card generator.' };
  if (!r.success) {
    return {
      cards: Array.isArray(r.cards) ? r.cards.map(rowToCard) : [],
      error: r.error || 'Card generation failed without a stated reason.',
    };
  }
  if (!Array.isArray(r.cards)) {
    return { cards: [], error: 'Card generator returned an unexpected response.' };
  }
  return { cards: r.cards.map(rowToCard) };
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

/* Re-run the full rich audit via /api/run-analysis — replaces a thin
   orchestrated audit with one that carries detailed sections. */
export async function runFullAudit(opts: {
  projectId: string; url: string; keywords: string[]; competitors: string[];
  brandName?: string;
}): Promise<{ success: boolean; overall_confidence?: number; error?: string }> {
  try {
    const res = await fetch('/api/run-analysis', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url:         opts.url,
        keywords:    opts.keywords,
        competitors: opts.competitors,
        brand_name:  opts.brandName || '',
        project_id:  opts.projectId,
      }),
    });
    const data = await res.json();
    if (!data?.success) return { success: false, error: data?.error || 'Audit failed' };
    return { success: true, overall_confidence: data.overall_confidence };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Audit failed' };
  }
}

/* Enrich a single algorithm topic on demand (writes a full
   algorithm_knowledge row with practices, ranking factors, checklist).
   Used by the Algorithm Intelligence section's per-topic Enrich button. */
export async function enrichAlgorithmTopic(topicId: string): Promise<{
  success: boolean; error?: string;
}> {
  try {
    const res = await fetch('/api/algorithm-intel', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fetch_topic', topic_id: topicId, project_id: '' }),
    });
    const data = await res.json();
    if (!data?.success && !data?.title) {
      return { success: false, error: data?.error || 'Enrichment failed' };
    }
    /* fetch_topic generates and returns the topic; save_item persists it */
    if (data?.title) {
      await fetch('/api/algorithm-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_item', item: data, topic_id: topicId }),
      });
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Enrichment failed' };
  }
}
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
/* Fetch the candidate crawl URLs (site + landing pages + competitors)
   so the user can choose which to crawl before running. */
export async function getCrawlTargets(projectId: string): Promise<{
  success: boolean; urls?: string[]; projectContext?: string; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_crawl_targets', projectId });
  return r || { success: false, error: 'No response' };
}

/* Run a fresh crawl + AI competitive comparison on a chosen URL list.
   Pass the URLs the user selected. Slow — crawls live pages + AI. */
export async function runCrawl(
  projectId: string, urls: string[], projectContext = '',
): Promise<{
  success: boolean; comparison?: any; crawledCount?: number;
  savedCount?: number; saveError?: string; error?: string;
}> {
  try {
    if (!Array.isArray(urls) || !urls.length) {
      return { success: false, error: 'No URLs selected to crawl.' };
    }

    /* Crawl — /api/crawl crawl_urls streams NDJSON (one JSON object per
       line, final line type:"complete"). */
    const crawlRes = await fetch('/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'pm-module' },
      body: JSON.stringify({
        action: 'crawl_urls', urls, projectId,
        projectContext, forceRefresh: true,
      }),
    });
    if (!crawlRes.ok || !crawlRes.body) {
      return { success: false, error: `Crawl service error (${crawlRes.status}).` };
    }

    const reader = crawlRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let crawlResults: any = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const ls = buf.split('\n');
      buf = ls.pop() ?? '';
      for (const line of ls) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'complete') crawlResults = msg;
        } catch { /* skip non-JSON line */ }
      }
    }
    if (buf.trim()) {
      try {
        const msg = JSON.parse(buf);
        if (msg.type === 'complete') crawlResults = msg;
      } catch { /* ignore */ }
    }
    if (!crawlResults?.results?.length) {
      return { success: false, error: 'Crawl returned no results.' };
    }

    /* AI competitive comparison */
    const cmpRes = await fetch('/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'pm-module' },
      body: JSON.stringify({
        action: 'compare_analysis', crawlResults, projectContext,
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

    /* persist the comparison */
    await post(ENGINE, { action: 'pm_save_crawl_comparison', projectId, comparison });

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
/* ═══════════════════════════════════════════════════════════
   Client report API client
═══════════════════════════════════════════════════════════ */

import type {
  ReportBlock, Sliders, PmContext, ReportSummary, FullReport, SharedReport,
} from './types';

/* Build the block catalog for the picker. */
export async function reportCatalog(
  projectId: string, periodStart: string, periodEnd: string,
): Promise<{ catalog: ReportBlock[]; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_report_catalog', projectId, periodStart, periodEnd });
  if (!r?.success) return { catalog: [], error: r?.error || 'Failed to load block catalog.' };
  return { catalog: Array.isArray(r.catalog) ? r.catalog : [] };
}

/* Generate a new report — picks blocks, AI writes narratives, persists as draft. */
export async function generateReport(opts: {
  projectId: string; periodStart: string; periodEnd: string;
  selectedBlocks: string[]; sliders: Sliders; pmContext: PmContext; title?: string;
}): Promise<{ report?: FullReport; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_report_generate', ...opts });
  if (!r?.success || !r.report) return { error: r?.error || 'Generation failed.' };
  return { report: r.report };
}

/* Save edits (block order, edited text, title, finalize). */
export async function saveReport(opts: {
  reportId: string; blocks?: ReportBlock[]; title?: string; status?: 'draft' | 'finalized';
}): Promise<{ report?: FullReport; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_report_save', ...opts });
  if (!r?.success || !r.report) return { error: r?.error || 'Save failed.' };
  return { report: r.report };
}

/* Regenerate one block in place with current (or new) sliders/context. */
export async function regenerateBlock(opts: {
  reportId: string; blockId: string; sliders?: Sliders; pmContext?: PmContext;
}): Promise<{ report?: FullReport; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_report_regenerate', ...opts });
  if (!r?.success || !r.report) return { error: r?.error || 'Regenerate failed.' };
  return { report: r.report };
}

/* Generate or revoke a public share token. */
export async function shareReport(reportId: string, revoke = false): Promise<{
  shareToken: string | null; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_report_share', reportId, revoke });
  if (!r?.success) return { shareToken: null, error: r?.error || 'Share failed.' };
  return { shareToken: r.share_token || null };
}

export async function listReports(projectId: string): Promise<{
  reports: ReportSummary[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_report_list', projectId });
  if (!r?.success) return { reports: [], error: r?.error || 'List failed.' };
  return { reports: Array.isArray(r.reports) ? r.reports : [] };
}

export async function getReport(reportId: string): Promise<{
  report?: FullReport; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_report_get', reportId });
  if (!r?.success || !r.report) return { error: r?.error || 'Load failed.' };
  return { report: r.report };
}

/* Public read by share token — no auth required. Called from /r/:token. */
export async function getSharedReport(token: string): Promise<{
  report?: SharedReport; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_report_get_shared', token });
  if (!r?.success || !r.report) return { error: r?.error || 'Report not available.' };
  return { report: r.report };
}

export async function deleteReport(reportId: string): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_report_delete', reportId });
  if (!r?.success) return { success: false, error: r?.error || 'Delete failed.' };
  return { success: true };
}

/* Manual metric snapshot — adds a point to the time-series for trend charts. */
export async function takeMetricsSnapshot(projectId: string): Promise<{
  success: boolean; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_metrics_snapshot', projectId, source: 'manual' });
  if (!r?.success) return { success: false, error: r?.error || 'Snapshot failed.' };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════
   Lifecycle API (Phase B — execution loop)
═══════════════════════════════════════════════════════════ */

import type {
  LifecycleState, CardDetail, LifecycleMap, CardShipment,
} from './types';

/* Get a card with its full lifecycle context — blockers, shipments, activity. */
export async function cardDetail(cardId: string): Promise<{
  detail?: CardDetail; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_card_detail', cardId });
  if (!r?.success) return { error: r?.error || 'Could not load card.' };
  return {
    detail: {
      card:      r.card,
      blockers:  Array.isArray(r.blockers) ? r.blockers : [],
      isBlocked: !!r.isBlocked,
      shipments: Array.isArray(r.shipments) ? r.shipments : [],
      activity:  Array.isArray(r.activity) ? r.activity : [],
    },
  };
}

/* Map of cards with blockers / shipment counts — used by the board to render
   blocked-state styling and shipment badges. */
export async function lifecycleMap(projectId: string): Promise<{
  map?: LifecycleMap; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_card_lifecycle_map', projectId });
  if (!r?.success) return { error: r?.error || 'Could not load lifecycle map.' };
  return {
    map: {
      blockedByCard:        r.blockedByCard || {},
      shipmentCountsByCard: r.shipmentCountsByCard || {},
    },
  };
}

/* Non-shipping lifecycle transition. */
export async function transitionCard(opts: {
  cardId: string; toState: LifecycleState; note?: string; archiveReason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_card_transition', ...opts });
  if (!r?.success) return { success: false, error: r?.error || 'Transition failed.' };
  return { success: true };
}

/* Ship a card. Captures baseline metrics + writes shipment + activity. */
export async function shipCard(opts: {
  cardId: string;
  affectedUrls?: string[];
  actualShippedUrl?: string;
  changesSummary: string;
  evidenceUrl?: string;
  forceShipReason?: string;
}): Promise<{ shipment?: CardShipment; error?: string; wasBlocked?: boolean }> {
  const r = await post(ENGINE, { action: 'pm_card_ship', ...opts });
  if (!r?.success) return { error: r?.error || 'Ship failed.', wasBlocked: !!r?.wasBlocked };
  return { shipment: r.shipment };
}

/* Take a post-ship measurement (manual now; cron-driven later). */
export async function measureCard(opts: {
  cardId: string; shipmentId?: string;
}): Promise<{ shipment?: CardShipment; lift?: any; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_card_measure', ...opts });
  if (!r?.success) return { error: r?.error || 'Measure failed.' };
  return { shipment: r.shipment, lift: r.lift };
}

/* ═══════════════════════════════════════════════════════════
   GSC integration API (Phase D)
═══════════════════════════════════════════════════════════ */

interface GscStatus {
  connected:     boolean;
  resourceId?:   string;
  resourceLabel?: string;
  lastPullAt?:   string;
  lastPullStatus?: string;
  lastPullError?: string;
  connectedAt?:  string;
}

/* Get current GSC connection status for a project. */
export async function gscStatus(projectId: string): Promise<{
  status?: GscStatus; error?: string;
}> {
  const r = await post(ENGINE, { action: 'gsc_status', projectId });
  if (!r?.success) return { error: r?.error || 'Could not load status.' };
  return {
    status: {
      connected:      !!r.connected,
      resourceId:     r.resourceId,
      resourceLabel:  r.resourceLabel,
      lastPullAt:     r.lastPullAt,
      lastPullStatus: r.lastPullStatus,
      lastPullError:  r.lastPullError,
      connectedAt:    r.connectedAt,
    },
  };
}

/* Start the GSC OAuth flow — returns a URL to open in a popup. */
export async function gscOauthStart(projectId: string): Promise<{
  url?: string; error?: string;
}> {
  const r = await post(ENGINE, { action: 'gsc_oauth_start', projectId });
  if (!r?.success) return { error: r?.error || 'OAuth start failed.' };
  return { url: r.url };
}

/* List the Search Console properties the connected account can read. */
export async function gscListProperties(projectId: string): Promise<{
  sites: { url: string; perm: string }[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'gsc_list_properties', projectId });
  if (!r?.success) return { sites: [], error: r?.error || 'List failed.' };
  return { sites: Array.isArray(r.sites) ? r.sites : [] };
}

/* Save the chosen GSC property for this project. */
export async function gscSelectProperty(opts: {
  projectId: string; siteUrl: string; label?: string;
}): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'gsc_select_property', ...opts });
  if (!r?.success) return { success: false, error: r?.error || 'Select failed.' };
  return { success: true };
}

/* Pull metrics now (manual). */
export async function gscPull(opts: {
  projectId: string; days?: number;
}): Promise<{ totals?: { clicks: number; impressions: number; position: number; ctr: number }; error?: string }> {
  const r = await post(ENGINE, { action: 'gsc_pull', ...opts });
  if (!r?.success) return { error: r?.error || 'Pull failed.' };
  return { totals: r.totals };
}

export async function gscDisconnect(projectId: string): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'gsc_disconnect', projectId });
  if (!r?.success) return { success: false, error: r?.error || 'Disconnect failed.' };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════
   GA4 integration API (Phase E)
═══════════════════════════════════════════════════════════ */

interface Ga4Status {
  connected:     boolean;
  resourceId?:   string;
  resourceLabel?: string;
  lastPullAt?:   string;
  lastPullStatus?: string;
  lastPullError?: string;
  connectedAt?:  string;
}

export async function ga4Status(projectId: string): Promise<{
  status?: Ga4Status; error?: string;
}> {
  const r = await post(ENGINE, { action: 'ga4_status', projectId });
  if (!r?.success) return { error: r?.error || 'Could not load status.' };
  return {
    status: {
      connected:      !!r.connected,
      resourceId:     r.resourceId,
      resourceLabel:  r.resourceLabel,
      lastPullAt:     r.lastPullAt,
      lastPullStatus: r.lastPullStatus,
      lastPullError:  r.lastPullError,
      connectedAt:    r.connectedAt,
    },
  };
}

export async function ga4OauthStart(projectId: string): Promise<{
  url?: string; error?: string;
}> {
  const r = await post(ENGINE, { action: 'ga4_oauth_start', projectId });
  if (!r?.success) return { error: r?.error || 'OAuth start failed.' };
  return { url: r.url };
}

export async function ga4ListProperties(projectId: string): Promise<{
  properties: { id: string; name: string; account: string }[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'ga4_list_properties', projectId });
  if (!r?.success) return { properties: [], error: r?.error || 'List failed.' };
  return { properties: Array.isArray(r.properties) ? r.properties : [] };
}

export async function ga4SelectProperty(opts: {
  projectId: string; propertyId: string; label?: string;
}): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'ga4_select_property', ...opts });
  if (!r?.success) return { success: false, error: r?.error || 'Select failed.' };
  return { success: true };
}

export async function ga4Pull(opts: {
  projectId: string; days?: number;
}): Promise<{
  totals?: { sessions: number; users: number; conversions: number; bounceRate: number; engagedSessions: number; avgSessionSec: number };
  error?: string;
}> {
  const r = await post(ENGINE, { action: 'ga4_pull', ...opts });
  if (!r?.success) return { error: r?.error || 'Pull failed.' };
  return { totals: r.totals };
}

export async function ga4Disconnect(projectId: string): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'ga4_disconnect', projectId });
  if (!r?.success) return { success: false, error: r?.error || 'Disconnect failed.' };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════
   Auto-pilot API (Phase F)
═══════════════════════════════════════════════════════════ */

import type {
  RuleType, ProjectRule, CardSuggestion, ProjectAlert,
} from './types';

/* Rules */
export async function rulesList(projectId: string): Promise<{
  rules: ProjectRule[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_rules_list', projectId });
  if (!r?.success) return { rules: [], error: r?.error || 'List failed.' };
  return { rules: Array.isArray(r.rules) ? r.rules : [] };
}

export async function ruleUpsert(opts: {
  projectId: string; ruleType: RuleType; enabled?: boolean;
  schedule?: any; config?: any;
}): Promise<{ rule?: ProjectRule; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_rule_upsert', ...opts });
  if (!r?.success) return { error: r?.error || 'Upsert failed.' };
  return { rule: r.rule };
}

export async function ruleSetEnabled(ruleId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_rule_set_enabled', ruleId, enabled });
  if (!r?.success) return { success: false, error: r?.error || 'Toggle failed.' };
  return { success: true };
}

export async function ruleDelete(ruleId: string): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_rule_delete', ruleId });
  if (!r?.success) return { success: false, error: r?.error || 'Delete failed.' };
  return { success: true };
}

export async function ruleRunNow(ruleId: string): Promise<{ success: boolean; result?: any; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_rule_run_now', ruleId });
  if (!r?.success) return { success: false, error: r?.error || 'Run failed.' };
  return { success: true, result: r.result };
}

/* Suggestions */
export async function suggestionsList(projectId: string, status?: string): Promise<{
  suggestions: CardSuggestion[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_suggestions_list', projectId, status });
  if (!r?.success) return { suggestions: [], error: r?.error || 'List failed.' };
  return { suggestions: Array.isArray(r.suggestions) ? r.suggestions : [] };
}

export async function suggestionAccept(suggestionId: string): Promise<{ success: boolean; cardId?: string; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_suggestion_accept', suggestionId });
  if (!r?.success) return { success: false, error: r?.error || 'Accept failed.' };
  return { success: true, cardId: r.card?.id };
}

export async function suggestionDismiss(suggestionId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_suggestion_dismiss', suggestionId, reason });
  if (!r?.success) return { success: false, error: r?.error || 'Dismiss failed.' };
  return { success: true };
}

/* Alerts */
export async function alertsList(projectId: string, status?: string): Promise<{
  alerts: ProjectAlert[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_alerts_list', projectId, status });
  if (!r?.success) return { alerts: [], error: r?.error || 'List failed.' };
  return { alerts: Array.isArray(r.alerts) ? r.alerts : [] };
}

export async function alertAcknowledge(alertId: string): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_alert_acknowledge', alertId });
  if (!r?.success) return { success: false, error: r?.error || 'Acknowledge failed.' };
  return { success: true };
}

export async function alertResolve(alertId: string, note?: string): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'pm_alert_resolve', alertId, note });
  if (!r?.success) return { success: false, error: r?.error || 'Resolve failed.' };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════
   Mission Control API (Phase G)
═══════════════════════════════════════════════════════════ */

export interface McProjectRow {
  id: string;
  name: string;
  url: string | null;
  client_name: string;
  industry: string;
  primary_goal: string;
  report_audience: string;
  last_activity: string | null;
  audit_score: number | null;
  audit_date: string | null;
  counts: {
    in_progress: number; planned: number; blocked: number;
    shipped_this_month: number; ripe_unmeasured: number;
    open_alerts: number; critical_alerts: number; acknowledged_alerts: number;
    pending_suggestions: number;
  };
  integrations: {
    gsc: { state: 'live' | 'stale' | 'not_connected'; last_pull_at: string | null; property: string | null };
    ga4: { state: 'live' | 'stale' | 'not_connected'; last_pull_at: string | null; property: string | null };
  };
  attention: {
    score: number;
    flags: string[];
    severity: 'critical' | 'warn' | 'info' | 'calm';
  };
}

export interface McSummary {
  projects: McProjectRow[];
  totals: {
    projects: number;
    cards_in_progress: number; cards_planned: number; cards_blocked: number;
    shipped_this_month: number; ripe_unmeasured: number;
    open_alerts: number; critical_alerts: number; pending_suggestions: number;
    projects_needing_attention: number;
    integrations: {
      gsc_live: number; gsc_stale: number; gsc_not: number;
      ga4_live: number; ga4_stale: number; ga4_not: number;
    };
  };
  attention: McProjectRow[];
  generated_at: string;
}

export async function missionControlSummary(): Promise<{
  summary?: McSummary; error?: string;
}> {
  const r = await post(ENGINE, { action: 'mc_summary' });
  if (!r?.success) return { error: r?.error || 'Mission control fetch failed.' };
  return {
    summary: {
      projects:   Array.isArray(r.projects) ? r.projects : [],
      totals:     r.totals,
      attention:  Array.isArray(r.attention) ? r.attention : [],
      generated_at: r.generated_at,
    },
  };
}

/* ═══════════════════════════════════════════════════════════
   V2 Data Room seed migration (one-shot, idempotent)
═══════════════════════════════════════════════════════════ */

export interface SeedReport {
  project_id:    string;
  project_name?: string;
  client_name?:  string;
  fields_seeded: string[];
  fields_skipped_existing: string[];
  fields_skipped_no_source: string[];
}

export interface SeedSummary {
  reports: SeedReport[];
  totals: {
    projects:                 number;
    fields_seeded_total:      number;
    fields_skipped_existing:  number;
    fields_skipped_no_source: number;
  };
}

/** Run the V2 Data Room seed. Pass projectId to seed a single project,
 *  omit it to seed every active project. Idempotent — re-runs are safe.
 *  Returns per-project reports + totals. */
export async function seedV2DataRoom(projectId?: string): Promise<{
  summary?: SeedSummary; error?: string;
}> {
  const r = await post(ENGINE, {
    action: 'pm_seed_v2_dataroom',
    ...(projectId ? { projectId } : {}),
  });
  if (!r?.success) return { error: r?.error || 'Seed failed.' };
  return {
    summary: {
      reports: Array.isArray(r.reports) ? r.reports : [],
      totals:  r.totals || { projects: 0, fields_seeded_total: 0, fields_skipped_existing: 0, fields_skipped_no_source: 0 },
    },
  };
}
