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

/* ═══════════════════════════════════════════════════════════
   Data Room AI Fill (Tier 1+2 honest inference)
═══════════════════════════════════════════════════════════ */

export interface AIFieldProposal {
  category:        string;
  field_key:       string;
  field_label:     string;
  field_type:      'text' | 'select';
  options?:        readonly string[];
  already_filled:  boolean;
  existing_source?: string;
  proposal: {
    value:      string;
    confidence: 'high' | 'medium' | 'low';
    reasoning:  string;
    sources:    string[];
  };
}

export interface AIClientQuestion {
  field_path:      string;
  question:        string;
  why_we_need_it:  string;
}

export interface AIFillPreview {
  proposals:        AIFieldProposal[];
  client_questions: AIClientQuestion[];
  source_summary:   { pages: number; competitors: number; has_audit: boolean };
}

export async function aiFillPreview(projectId: string): Promise<{
  preview?: AIFillPreview; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_ai_fill_preview', projectId });
  if (!r?.success) return { error: r?.error || 'AI Fill preview failed.' };
  return {
    preview: {
      proposals:        Array.isArray(r.proposals) ? r.proposals : [],
      client_questions: Array.isArray(r.client_questions) ? r.client_questions : [],
      source_summary:   r.source_summary || { pages: 0, competitors: 0, has_audit: false },
    },
  };
}

export async function aiFillApply(opts: {
  projectId: string;
  selectedFields: Array<{
    category: string; field_key: string;
    value: string; confidence: string; reasoning: string; sources: string[];
  }>;
}): Promise<{
  success: boolean; applied?: number; skipped_existing?: number; error?: string;
}> {
  const r = await post(ENGINE, { action: 'pm_ai_fill_apply', ...opts });
  if (!r?.success) return { success: false, error: r?.error || 'AI Fill apply failed.' };
  return { success: true, applied: r.applied, skipped_existing: r.skipped_existing };
}

/* ═══════════════════════════════════════════════════════════
   Phase 1J/1K — Analytics intelligence
═══════════════════════════════════════════════════════════ */

export interface StrategicKpiClient {
  key:            string;
  name:           string;
  category:       'stability' | 'growth' | 'quality' | 'diversification' | 'efficiency';
  definition:     string;
  value:          number | null;
  unit:           string;
  health:         'excellent' | 'good' | 'moderate' | 'concern' | 'critical' | 'unknown';
  trend:          'improving' | 'stable' | 'declining' | 'unknown';
  recommendation: string;
  formula:        string;
  meta?:          Record<string, any>;
}

export interface RisingStarClient {
  query: string;
  currentClicks: number;  previousClicks: number;
  currentImpr: number;    previousImpr: number;
  position: number;
  impressionLift: number;
  opportunity: 'page_2_to_1' | 'page_3_to_2' | 'first_appearance' | 'ranking_climber';
  reason: string;
}

export interface FallingStarClient {
  query: string;
  currentClicks: number;  previousClicks: number;
  currentImpr: number;    previousImpr: number;
  position: number;       positionPrevious: number;
  clickLoss: number;
  severity: 'warning' | 'critical';
  reason: string;
}

export interface QueryVelocityClient {
  newQueriesCount:      number;
  lostQueriesCount:     number;
  retainedQueriesCount: number;
  newQueriesTopExamples:  string[];
  lostQueriesTopExamples: string[];
  discoveryRatePct:     number;
}

export interface PeriodSummaryClient {
  windowLabel: string;
  fromDate: string; toDate: string; dayCount: number;
  gscClicks: number; gscImpressions: number; gscAvgPosition: number; gscCtr: number;
  ga4Sessions: number; ga4Users: number; ga4EngagedSessions: number;
  ga4Conversions: number; ga4BounceRate: number; ga4AvgDuration: number;
  ga4EngagementRate: number;
}

export interface PeriodDeltaClient {
  fromLabel: string; toLabel: string;
  clicks:    { from: number; to: number; change: number; pctChange: number; direction: 'up'|'down'|'flat' };
  impressions: { from: number; to: number; change: number; pctChange: number; direction: 'up'|'down'|'flat' };
  position:    { from: number; to: number; change: number; pctChange: number; direction: 'up'|'down'|'flat' };
  sessions:    { from: number; to: number; change: number; pctChange: number; direction: 'up'|'down'|'flat' };
  conversions: { from: number; to: number; change: number; pctChange: number; direction: 'up'|'down'|'flat' };
  bounceRate:  { from: number; to: number; change: number; pctChange: number; direction: 'up'|'down'|'flat' };
  ctr:         { from: number; to: number; change: number; pctChange: number; direction: 'up'|'down'|'flat' };
}

export interface AnalyticsIntelClient {
  generatedAt:         string | null;
  periods:             Record<string, PeriodSummaryClient>;
  deltas:              Record<string, PeriodDeltaClient>;
  kpis:                StrategicKpiClient[];
  risingStars:         RisingStarClient[];
  fallingStars:        FallingStarClient[];
  cannibalization:     any[];
  queryVelocity:       QueryVelocityClient | null;
  overallHealthScore:  number | null;
  algorithmResilience: number | null;
}

export async function getAnalyticsIntel(projectId: string): Promise<{
  intel: AnalyticsIntelClient | null;
  message?: string;
  error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_get_analytics_intel', projectId });
  if (!r?.success) return { intel: null, error: r?.error || 'Could not load analytics intelligence.' };
  return { intel: r.intel || null, message: r.message };
}

export async function recomputeAnalyticsIntel(projectId: string): Promise<{
  intel: AnalyticsIntelClient | null;
  message?: string;
  error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_recompute_analytics_intel', projectId });
  if (!r?.success) return { intel: null, error: r?.error || 'Could not recompute analytics intelligence.' };
  return { intel: r.intel || null, message: r.message };
}

/* ═══════════════════════════════════════════════════════════
   Phase 1L — What-If Simulator
═══════════════════════════════════════════════════════════ */

export type ActionCategoryClient = "content" | "onpage" | "technical" | "links" | "ux" | "strategy";
export type ActionConfidenceClient = "high" | "medium" | "low";
export type ActionInputTypeClient = "page_url" | "query" | "number" | "text" | "select" | "page_list";

export interface ActionInputDefClient {
  key: string; label: string; type: ActionInputTypeClient;
  required: boolean; helperText?: string; options?: string[];
  defaultValue?: string; min?: number; max?: number;
}

export interface ImpactRangeClient {
  min: number; max: number; basis: string;
  unit: "percent" | "absolute" | "position_delta";
}

export interface ImpactModelClient {
  clicks?:      ImpactRangeClient;
  impressions?: ImpactRangeClient;
  position?:    ImpactRangeClient;
  ctr?:         ImpactRangeClient;
  conversions?: ImpactRangeClient;
  visibility?:  ImpactRangeClient;
}

export interface TimelineCurveClient {
  immediate: number; day_30: number; day_60: number; day_90: number;
  notes: string;
}

export interface SeoActionClient {
  id: string;
  category: ActionCategoryClient;
  name: string;
  shortDescription: string;
  fullDescription: string;
  inputs: ActionInputDefClient[];
  impact: ImpactModelClient;
  timeline: TimelineCurveClient;
  effortHours: number;
  confidence: ActionConfidenceClient;
  costSummary: string;
  evidence: string;
  applicableWhen: string[];
  prerequisites?: string[];
}

export interface SuggestedActionClient {
  action: SeoActionClient;
  reason: string;
  priority: "must_do" | "should_do" | "could_do";
  trigger_kpi?: string;
  prefilled_inputs?: Record<string, any>;
}

export interface ActionInstanceClient {
  action_id: string;
  inputs: Record<string, any>;
  target_label?: string;
}

export interface ProjectedMetricClient {
  baseline: number; immediate: number;
  day_30: number; day_60: number; day_90: number;
  day_90_low: number; day_90_high: number;
  unit: "count" | "percent" | "position";
}

export interface ScenarioProjectionClient {
  baseline: {
    clicks_30d: number; impressions_30d: number; avg_position: number;
    ctr_pct: number; sessions_30d: number; conversions_30d: number;
    health_score: number; resilience_score: number;
  };
  projected: {
    clicks:        ProjectedMetricClient;
    impressions:   ProjectedMetricClient;
    position:      ProjectedMetricClient;
    ctr:           ProjectedMetricClient;
    sessions:      ProjectedMetricClient;
    conversions:   ProjectedMetricClient;
  };
  total_effort_hours: number;
  total_cost_summary: string;
  contributions: Array<{
    action_id: string; action_name: string;
    contribution_clicks: number; contribution_position: number;
    confidence: string; notes: string;
  }>;
  diminishing_returns_pct: number;
}

export interface SavedScenarioClient {
  id: string; project_id: string;
  name: string; description?: string; status: string;
  actions: ActionInstanceClient[];
  baseline_snapshot?: any; projected_impact?: ScenarioProjectionClient;
  tags?: string[]; shared_with_client?: boolean;
  created_at: string; updated_at: string;
  created_by_email?: string;
}

export async function listActions(category?: ActionCategoryClient): Promise<{ actions: SeoActionClient[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_list_actions', category });
  if (!r?.success) return { actions: [], error: r?.error || 'Could not load action library.' };
  return { actions: r.actions || [] };
}

export async function getActionSuggestions(projectId: string, maxResults?: number): Promise<{ suggestions: SuggestedActionClient[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_get_action_suggestions', projectId, maxResults });
  if (!r?.success) return { suggestions: [], error: r?.error || 'Could not get suggestions.' };
  return { suggestions: r.suggestions || [] };
}

export async function projectScenarioImpact(opts: {
  projectId: string; actions: ActionInstanceClient[];
}): Promise<{ projection?: ScenarioProjectionClient; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_project_scenario', ...opts });
  if (!r?.success) return { error: r?.error || 'Projection failed.' };
  return { projection: r.projection };
}

export async function saveScenario(opts: {
  projectId: string;
  name: string;
  description?: string;
  actions: ActionInstanceClient[];
  status?: string;
  tags?: string[];
  sharedWithClient?: boolean;
}): Promise<{ scenario?: SavedScenarioClient; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_save_scenario', ...opts });
  if (!r?.success) return { error: r?.error || 'Save failed.' };
  return { scenario: r.scenario };
}

export async function listScenarios(projectId: string, status?: string): Promise<{ scenarios: SavedScenarioClient[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_list_scenarios', projectId, status });
  if (!r?.success) return { scenarios: [], error: r?.error || 'List failed.' };
  return { scenarios: r.scenarios || [] };
}

export async function getScenario(scenarioId: string): Promise<{ scenario?: SavedScenarioClient; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_get_scenario', scenarioId });
  if (!r?.success) return { error: r?.error || 'Get failed.' };
  return { scenario: r.scenario };
}

export async function updateScenario(opts: {
  scenarioId: string;
  name?: string; description?: string; actions?: ActionInstanceClient[];
  status?: string; tags?: string[]; sharedWithClient?: boolean;
}): Promise<{ scenario?: SavedScenarioClient; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_update_scenario', ...opts });
  if (!r?.success) return { error: r?.error || 'Update failed.' };
  return { scenario: r.scenario };
}

export async function deleteScenario(scenarioId: string): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_delete_scenario', scenarioId });
  if (!r?.success) return { success: false, error: r?.error || 'Delete failed.' };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════
   Phase 1M — Goal Engine
═══════════════════════════════════════════════════════════ */

export type GoalMetricClient =
  | "clicks" | "impressions" | "sessions" | "conversions"
  | "avg_position" | "ctr" | "health_score";

export interface TrajectoryProjectionClient {
  metric:                GoalMetricClient;
  currentValue:          number;
  baselineValue:         number;
  baselineDate:          string;
  targetValue:           number;
  targetDate:            string;
  daysRemaining:         number;
  projectedNaturalValue: number;
  gap:                   number;
  gapPctOfTarget:        number;
  monthlyGrowthRate:     number;
  confidence:            "high" | "medium" | "low";
  trendDirection:        "growing" | "flat" | "declining";
  isOnTrack:             boolean;
  history:               Array<{ date: string; value: number }>;
}

export interface GoalRecord {
  id:                   string;
  project_id:           string;
  metric:               GoalMetricClient;
  target_value:         number;
  target_date:          string;
  baseline_value:       number;
  baseline_date:        string;
  status:               string;
  name:                 string | null;
  description:          string | null;
  linked_scenario_ids:  string[];
  projection_snapshot:  TrajectoryProjectionClient | null;
  created_by_email:     string | null;
  shared_with_client:   boolean;
  created_at:           string;
  updated_at:           string;
}

export interface GoalProgressSnapshot {
  id:             string;
  goal_id:        string;
  recorded_at:    string;
  actual_value:   number;
  expected_value: number | null;
  on_track:       boolean | null;
  notes:          string | null;
}

export interface CandidateScenarioClient {
  label:                string;
  strategy:             "min_effort" | "balanced" | "aggressive";
  actions:              ActionInstanceClient[];
  projectedFinalValue:  number;
  projectedGoalLift:    number;
  effortHours:          number;
  meetsTarget:          boolean;
  rationale:            string;
  actionSummary:        Array<{ action_id: string; action_name: string; impact_score: number }>;
}

export async function createGoal(opts: {
  projectId: string;
  metric: GoalMetricClient;
  targetValue: number;
  targetDate: string;
  name?: string;
  description?: string;
  sharedWithClient?: boolean;
}): Promise<{ goal?: GoalRecord; trajectory?: TrajectoryProjectionClient; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_create_goal', ...opts });
  if (!r?.success) return { error: r?.error || 'Could not create goal.' };
  return { goal: r.goal, trajectory: r.trajectory };
}

export async function listGoals(projectId: string, status?: string): Promise<{ goals: GoalRecord[]; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_list_goals', projectId, status });
  if (!r?.success) return { goals: [], error: r?.error };
  return { goals: r.goals || [] };
}

export async function getGoal(goalId: string): Promise<{
  goal?: GoalRecord; trajectory?: TrajectoryProjectionClient;
  progress?: GoalProgressSnapshot[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_get_goal', goalId });
  if (!r?.success) return { error: r?.error };
  return { goal: r.goal, trajectory: r.trajectory, progress: r.progress };
}

export async function updateGoal(opts: {
  goalId: string;
  name?: string; description?: string;
  targetValue?: number; targetDate?: string;
  status?: string; sharedWithClient?: boolean;
}): Promise<{ goal?: GoalRecord; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_update_goal', ...opts });
  if (!r?.success) return { error: r?.error };
  return { goal: r.goal };
}

export async function deleteGoal(goalId: string): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_delete_goal', goalId });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export async function recordGoalProgress(goalId: string): Promise<{ snapshot?: any; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_record_goal_progress', goalId });
  if (!r?.success) return { error: r?.error };
  return { snapshot: r.snapshot };
}

export async function suggestGoalScenarios(goalId: string): Promise<{
  trajectory?: TrajectoryProjectionClient;
  scenarios?: CandidateScenarioClient[];
  message?: string;
  error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_suggest_goal_scenarios', goalId });
  if (!r?.success) return { error: r?.error };
  return { trajectory: r.trajectory, scenarios: r.scenarios, message: r.message };
}

export async function linkScenarioToGoal(goalId: string, scenarioId: string): Promise<{ goal?: GoalRecord; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_link_scenario_to_goal', goalId, scenarioId });
  if (!r?.success) return { error: r?.error };
  return { goal: r.goal };
}

export async function unlinkScenarioFromGoal(goalId: string, scenarioId: string): Promise<{ goal?: GoalRecord; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_unlink_scenario_from_goal', goalId, scenarioId });
  if (!r?.success) return { error: r?.error };
  return { goal: r.goal };
}

/* ═══════════════════════════════════════════════════════════
   Phase 2 — Strategy-to-PM Bridge
═══════════════════════════════════════════════════════════ */

export type DependencyCategoryClient =
  | "access" | "content" | "info" | "approval" | "task_prereq";

export interface DependencyItemClient {
  id?:            string;
  label:          string;
  category:       DependencyCategoryClient;
  met:            boolean;
  prereq_card_id?: string;
}

export interface StrategicLinkClient {
  type:        "scenario" | "goal";
  id:          string;
  name:        string;
  goal_metric?: string;
  goal_target?: number;
  goal_date?:   string;
}

export interface CardDraftClient {
  source_action_id:       string;
  title:                  string;
  description:            string;
  estimated_hours:        number;
  strategic_link:         StrategicLinkClient;
  expected_impact:        Record<string, ImpactRangeClient>;
  target_start_date:      string;
  target_completion_date: string;
  priority:               "low" | "medium" | "high";
  requirements:           DependencyItemClient[];
  depends_on:             string[];
  action_inputs:          Record<string, any>;
}

export interface StrategyHealthClient {
  total: number;
  counts: { todo: number; in_progress: number; done: number; blocked: number; other: number };
  completion_pct: number;
  unmet_dependencies: number;
  blocked_or_dependent: number;
  upcoming_deadline_7d: number;
  overdue: number;
}

export interface StrategyCardClient {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  strategic_link: StrategicLinkClient;
  target_start_date: string | null;
  target_completion_date: string | null;
  expected_impact: any;
  source_action_id: string | null;
  requirements: DependencyItemClient[];
  depends_on: string[];
  estimated_hours: number | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  executed_at: string | null;
  verified_at: string | null;
  assigned_to: string | null;
}

export async function prepareScenarioPush(opts: { scenarioId?: string; goalId?: string; }): Promise<{
  drafts?: CardDraftClient[];
  projectId?: string;
  scenario_summary?: { id: string; name: string; total_effort_hours: number; projected_impact?: any };
  goal_summary?: { id: string; name?: string; metric: string; target_value: number; target_date: string } | null;
  error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_prepare_scenario_push', ...opts });
  if (!r?.success) return { error: r?.error || 'Could not prepare push.' };
  return {
    drafts: r.drafts, projectId: r.projectId,
    scenario_summary: r.scenario_summary, goal_summary: r.goal_summary,
  };
}

export async function pushScenarioToPm(opts: {
  projectId: string;
  scenarioId?: string;
  goalId?: string;
  drafts: CardDraftClient[];
  sequential?: boolean;
  createdByEmail?: string;
}): Promise<{
  cardIds?: string[];
  cards?: Array<{ id: string; title: string; target_completion_date: string }>;
  summary?: { created: number; failed: number; tag: string };
  errors?: string[];
  error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_push_scenario_to_pm', ...opts });
  if (!r?.success) return { error: r?.error || 'Could not push to PM.', errors: r?.errors };
  return { cardIds: r.cardIds, cards: r.cards, summary: r.summary, errors: r.errors };
}

export async function getStrategyCards(opts: {
  projectId: string;
  scenarioId?: string;
  goalId?: string;
  statusFilter?: string;
}): Promise<{ cards: StrategyCardClient[]; total?: number; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_get_strategy_cards', ...opts });
  if (!r?.success) return { cards: [], error: r?.error };
  return { cards: r.cards || [], total: r.total };
}

export async function getStrategyHealth(opts: {
  projectId: string;
  scenarioId?: string;
  goalId?: string;
}): Promise<{ health?: StrategyHealthClient; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_get_strategy_health', ...opts });
  if (!r?.success) return { error: r?.error };
  return { health: r.health };
}

export async function updateCardDependencies(opts: {
  cardId: string;
  requirements: DependencyItemClient[];
}): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_update_card_dependencies', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════
   Phase 3 — Analytics Provenance & Diagnostics
═══════════════════════════════════════════════════════════ */

export interface GscProvenanceClient {
  connected:           boolean;
  resource_id:         string | null;
  resource_label:      string | null;
  property_type:       "domain" | "url_prefix" | null;
  property_type_label: string;
  search_type:         "web";
  data_state:          "final" | "all";
  data_state_label:    string;
  last_pull_at:        string | null;
  last_pull_status:    string | null;
  last_pull_error:     string | null;
  coverage_from:       string | null;
  coverage_to:         string | null;
  coverage_day_count:  number | null;
  aggregation_type:    "byProperty" | "byPage";
  top_n_queries:       number;
  top_n_pages:         number;
  caveats:             string[];
  freshness:           "fresh" | "stale" | "very_stale" | "never";
}

export interface Ga4ProvenanceClient {
  connected:               boolean;
  property_id:             string | null;
  property_label:          string | null;
  last_pull_at:            string | null;
  last_pull_status:        string | null;
  last_pull_error:         string | null;
  coverage_from:           string | null;
  coverage_to:             string | null;
  coverage_day_count:      number | null;
  channel_filter:          string;
  channel_filter_label:    string;
  conversion_definition:   string;
  bounce_rate_definition:  string;
  metric_definitions:      Array<{ metric: string; definition: string }>;
  caveats:                 string[];
  freshness:               "fresh" | "stale" | "very_stale" | "never";
}

export interface AnalyticsProvenanceClient {
  generatedAt: string;
  gsc: GscProvenanceClient;
  ga4: Ga4ProvenanceClient;
  display: {
    current_window_from: string | null;
    current_window_to:   string | null;
    current_window_label: string;
  };
}

export interface MismatchCauseClient {
  category:    "date_range" | "property" | "filter" | "methodology" | "freshness" | "sampling" | "privacy";
  source:      "gsc" | "ga4" | "both";
  severity:    "common" | "occasional" | "edge_case";
  title:       string;
  explanation: string;
  verify:      string;
  applies:     "always" | "if_recent_dates" | "if_large_range" | "conditional";
}

export interface ExternalDashboardLinksClient {
  gsc: { url: string; instructions: string; resource_id: string } | null;
  ga4: { url: string; instructions: string; property_id: string } | null;
  date_range: { from: string; to: string };
}

export async function getAnalyticsProvenance(projectId: string): Promise<{
  provenance?: AnalyticsProvenanceClient; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_get_analytics_provenance', projectId });
  if (!r?.success) return { error: r?.error };
  return { provenance: r.provenance };
}

export async function diagnoseAnalyticsMismatch(projectId: string): Promise<{
  provenance?: AnalyticsProvenanceClient;
  causes?: MismatchCauseClient[];
  summary?: { total_causes: number; common_causes: number; gsc_causes: number; ga4_causes: number };
  error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_diagnose_analytics_mismatch', projectId });
  if (!r?.success) return { error: r?.error };
  return { provenance: r.provenance, causes: r.causes, summary: r.summary };
}

export async function getExternalDashboardLinks(opts: {
  projectId: string; fromDate?: string; toDate?: string;
}): Promise<{ links?: ExternalDashboardLinksClient; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_get_external_dashboard_links', ...opts });
  if (!r?.success) return { error: r?.error };
  return { links: r.links };
}

/* ═══════════════════════════════════════════════════════════
   Phase 4 — Strategy Dependencies Hub
═══════════════════════════════════════════════════════════ */

export interface DependencyFlatRowClient {
  card_id:               string;
  card_title:            string;
  card_status:           string;
  card_assigned_to:      string | null;
  card_target_start:     string | null;
  card_target_completion: string | null;
  card_created_at:       string;
  strategic_link:        StrategicLinkClient | null;
  strategy_label:        string;
  req_id:                string;
  req_label:             string;
  req_category:          DependencyCategoryClient;
  req_met:               boolean;
  req_prereq_card_id:    string | null;
  age_days:              number;
  age_bucket:            "fresh" | "aging" | "slow" | "very_slow";
}

export interface DependenciesHubStats {
  total_dependencies: number;
  resolved:           number;
  unresolved:         number;
  by_category:        Record<DependencyCategoryClient, { total: number; unresolved: number; resolved: number }>;
  unique_cards:       number;
  aging_warnings:     number;
  very_aged:          number;
}

export async function listStrategyDependencies(opts: {
  projectId: string;
  category?: DependencyCategoryClient;
  status?: "all" | "unresolved" | "resolved";
  strategicLinkId?: string;
}): Promise<{
  dependencies?: DependencyFlatRowClient[];
  stats?:        DependenciesHubStats;
  error?:        string;
}> {
  const r = await post(ENGINE, { action: 'bs_list_strategy_dependencies', ...opts });
  if (!r?.success) return { error: r?.error };
  return { dependencies: r.dependencies, stats: r.stats };
}

export async function toggleDependency(opts: {
  cardId: string; reqId: string; met: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_toggle_dependency', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════
   Phase 5 — Resolution Stores + Blockers + Matcher
═══════════════════════════════════════════════════════════ */

export type ResolutionStoreClient = "access" | "content" | "info" | "approval";

export interface StoreItemBase {
  id?:        string;
  project_id?: string;
  label:      string;
  notes?:     string | null;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  is_resolved?: boolean;
}

export interface AccessItemClient extends StoreItemBase {
  category:              "cms" | "dev" | "analytics" | "seo_tool" | "other";
  status:                "held" | "requested" | "expired" | "revoked";
  url?:                  string | null;
  password_manager_link?: string | null;
  held_by?:              string | null;
  obtained_at?:          string | null;
  expires_at?:           string | null;
}

export interface ContentAssetClient extends StoreItemBase {
  asset_type:   "copy" | "brief" | "image" | "template" | "video" | "other";
  status:       "requested" | "drafting" | "in_review" | "delivered" | "rejected";
  asset_url?:   string | null;
  assignee?:    string | null;
  due_date?:    string | null;
  delivered_at?: string | null;
}

export interface InfoItemClient extends StoreItemBase {
  info_type:   "research" | "data" | "competitor" | "persona" | "strategy" | "other";
  status:      "needed" | "gathered" | "stale";
  value_text?: string | null;
  source_url?: string | null;
  gathered_by?: string | null;
  gathered_at?: string | null;
  expires_at?: string | null;
}

export interface ApprovalItemClient extends StoreItemBase {
  approval_type:  "client" | "internal" | "budget" | "legal";
  status:         "pending" | "approved" | "rejected" | "revoked";
  requested_from?: string | null;
  requested_at?:  string | null;
  decided_at?:    string | null;
  decided_by?:    string | null;
  decision_notes?: string | null;
  evidence_url?:  string | null;
}

export type AnyStoreItem = AccessItemClient | ContentAssetClient | InfoItemClient | ApprovalItemClient;

export async function listStoreItems(opts: {
  projectId: string; store: ResolutionStoreClient; status?: string; search?: string;
}): Promise<{ items: any[]; total?: number; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_list_store_items', ...opts });
  if (!r?.success) return { items: [], error: r?.error };
  return { items: r.items, total: r.total };
}

export async function saveStoreItem(opts: {
  projectId: string; store: ResolutionStoreClient; item: any;
}): Promise<{ item?: any; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_save_store_item', ...opts });
  if (!r?.success) return { error: r?.error };
  return { item: r.item };
}

export async function deleteStoreItem(opts: {
  store: ResolutionStoreClient; itemId: string;
}): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_delete_store_item', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export async function suggestStoreLabels(opts: {
  projectId: string; store: ResolutionStoreClient;
}): Promise<{ suggestions?: Array<{ label: string; used_by_actions: string[] }>; total?: number; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_suggest_store_labels', ...opts });
  if (!r?.success) return { error: r?.error };
  return { suggestions: r.suggestions, total: r.total };
}

export interface BlockedItemClient {
  type:     "card" | "scenario" | "goal" | "report";
  id:       string;
  title:    string;
  status?:  string;
  due_date?: string | null;
}

export interface BlockerClient {
  store:           ResolutionStoreClient;
  label:           string;
  required:        boolean;
  blocks:          BlockedItemClient[];
  block_summary:   { cards: number; scenarios: number; goals: number; reports: number };
  resolution_panel: ResolutionStoreClient;
  notes?:          string;
}

export interface BlockersStatsClient {
  total_blockers: number;
  hard_blockers:  number;
  soft_blockers:  number;
  by_store:       { access: number; content: number; info: number; approval: number };
  total_cards_blocked:     number;
  total_scenarios_blocked: number;
  total_goals_blocked:     number;
}

export async function getStrategyBlockers(projectId: string): Promise<{
  blockers?: BlockerClient[]; stats?: BlockersStatsClient; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_get_strategy_blockers', projectId });
  if (!r?.success) return { error: r?.error };
  return { blockers: r.blockers, stats: r.stats };
}

export async function rematchProjectCards(projectId: string): Promise<{
  cardsUpdated?: number; errors?: number; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_rematch_project_cards', projectId });
  if (!r?.success) return { error: r?.error };
  return { cardsUpdated: r.cardsUpdated, errors: r.errors };
}

/* ═══════════════════════════════════════════════════════════
   Phase 6 — Project Planning Workspace (Strategies)
═══════════════════════════════════════════════════════════ */

export type StrategyHorizonClient = "short_term" | "medium_term" | "long_term";
export type StrategyStatusClient  = "drafting" | "resourcing" | "executing" | "measuring" | "concluded" | "paused";

export interface StrategyRecord {
  id:                    string;
  project_id:            string;
  name:                  string;
  description:           string | null;
  horizon:               StrategyHorizonClient;
  status:                StrategyStatusClient;
  target_start_date:     string | null;
  target_end_date:       string | null;
  source_scenario_id:    string | null;
  linked_goal_ids:       string[];
  expected_impact:       any | null;
  actions:               any[] | null;
  card_ids:              string[];
  actual_impact:         any | null;
  last_impact_pulled_at: string | null;
  on_track:              boolean | null;
  drafted_at:            string | null;
  finalized_at:          string | null;
  started_at:            string | null;
  paused_at:             string | null;
  concluded_at:          string | null;
  conclusion_summary:    string | null;
  created_by:            string | null;
  created_at:            string;
  updated_at:            string;
  health?: {
    total_cards: number; cards_done: number; cards_in_progress: number; cards_todo: number;
    completion_pct: number; hard_blockers: number; soft_blockers: number; on_track: boolean | null;
  };
}

export interface PlanningContext {
  project: { id: string; project_name: string; client_url: string; status: string } | null;
  active_goals: Array<{ id: string; name: string; metric: string; target_value: number; target_date: string; baseline_value: number; status: string }>;
  saved_scenarios: Array<{ id: string; name: string; description: string; projected_impact: any; actions: any[]; created_at: string }>;
  top_kpis: any[];
  rising_stars: any[];
  falling_stars: any[];
  dataroom_categories: Record<string, number>;
  blockers_count: number;
  hard_blockers: number;
  recent_audits: Array<{ id: string; created_at: string; overall_score: number; top_findings: any }>;
}

export async function listStrategies(opts: {
  projectId: string; status?: string; horizon?: string;
}): Promise<{ strategies: StrategyRecord[]; total?: number; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_list_strategies', ...opts });
  if (!r?.success) return { strategies: [], error: r?.error };
  return { strategies: r.strategies || [], total: r.total };
}

export async function getStrategy(strategyId: string): Promise<{
  strategy?: StrategyRecord; cards?: any[]; goals?: any[]; health?: any; blockers?: any[]; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_get_strategy', strategyId });
  if (!r?.success) return { error: r?.error };
  return { strategy: r.strategy, cards: r.cards, goals: r.goals, health: r.health, blockers: r.blockers };
}

export async function saveStrategy(opts: { projectId: string; strategy: Partial<StrategyRecord> & { name: string } }): Promise<{ strategy?: StrategyRecord; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_save_strategy', ...opts });
  if (!r?.success) return { error: r?.error };
  return { strategy: r.strategy };
}

export async function deleteStrategy(strategyId: string): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_delete_strategy', strategyId });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export async function finalizeStrategy(opts: { strategyId: string; sequential?: boolean }): Promise<{
  cards_created?: number; next_status?: string; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_finalize_strategy', ...opts });
  if (!r?.success) return { error: r?.error };
  return { cards_created: r.cards_created, next_status: r.next_status };
}

export async function advanceStrategy(opts: { strategyId: string; toStatus: StrategyStatusClient; override?: boolean }): Promise<{
  status?: string; error?: string; gate_blocked?: boolean; can_override?: boolean;
}> {
  const r = await post(ENGINE, { action: 'bs_advance_strategy', ...opts });
  if (!r?.success) return { error: r?.error, gate_blocked: r?.gate_blocked, can_override: r?.can_override };
  return { status: r.status };
}

export async function concludeStrategy(opts: { strategyId: string; conclusion_summary?: string }): Promise<{ success: boolean; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_conclude_strategy', ...opts });
  if (!r?.success) return { success: false, error: r?.error };
  return { success: true };
}

export async function getStrategyImpact(strategyId: string): Promise<{
  trace?: any[]; summary?: any; error?: string;
}> {
  const r = await post(ENGINE, { action: 'bs_get_strategy_impact', strategyId });
  if (!r?.success) return { error: r?.error };
  return { trace: r.trace, summary: r.summary };
}

export async function getPlanningContext(projectId: string): Promise<{ context?: PlanningContext; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_get_planning_context', projectId });
  if (!r?.success) return { error: r?.error };
  return { context: r.context };
}

/* ═══════════════════════════════════════════════════════════
   Phase 7 — S.E.A.S.O.N.
═══════════════════════════════════════════════════════════ */

export interface BriefingItemClient {
  kind:        "attention" | "win" | "info";
  severity:    "info" | "success" | "warning" | "critical";
  headline:    string;
  detail?:     string;
  source:      string;
  technical?:  any;
  action_id?:  string;
  age_days?:   number;
  linked_entity?: { type: string; id: string };
}

export interface BriefingClient {
  generated_at:    string;
  project_id:      string;
  project_name:    string;
  greeting_phrase: string;
  status_summary:  string;
  attention:       BriefingItemClient[];
  quiet_wins:      BriefingItemClient[];
  honest_gaps:     string[];
  freshness: {
    gsc_last_pull:   string | null;
    ga4_last_pull:   string | null;
    intel_generated: string | null;
    strategies_seen: number;
    goals_seen:      number;
  };
}

export interface ResponseChunkClient {
  kind:    "plain" | "technical" | "artifact" | "action" | "verify";
  content: string;
  detail?: any;
}

export interface CommandResponseClient {
  intent:      string;
  confidence:  number;
  chunks:      ResponseChunkClient[];
  artifacts?:  Array<{ kind: string; title: string; body: string }>;
  actions?:    Array<{ id: string; label: string; payload?: any }>;
  honest_note?: string;
}

export interface ActivityEvent {
  id:           string;
  event_type:   string;
  source:       string;
  headline:     string;
  detail?:      string | null;
  technical?:   any;
  severity:     string;
  strategy_id?: string | null;
  goal_id?:     string | null;
  card_id?:     string | null;
  created_at:   string;
}

export async function seasonBriefing(projectId: string): Promise<{ briefing?: BriefingClient; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_season_briefing', projectId });
  if (!r?.success) return { error: r?.error };
  return { briefing: r.briefing };
}

export async function seasonCommand(opts: { projectId: string; input: string; awareness?: any }): Promise<{ response?: CommandResponseClient; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_season_command', ...opts });
  if (!r?.success) return { error: r?.error };
  return { response: r.response };
}

export async function seasonActivity(opts: { projectId: string; limit?: number }): Promise<{ events?: ActivityEvent[]; count?: number; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_season_activity', ...opts });
  if (!r?.success) return { error: r?.error };
  return { events: r.events, count: r.count };
}

/* ───────── Phase 8a — Wishes ───────── */

export interface SeasonWish {
  id:               string;
  project_id:       string | null;
  wish_text:        string;
  category:         "data_source" | "feature" | "integration" | "permission" | "ui_action" | "knowledge" | "other";
  triggered_by:     string | null;
  user_input:       string | null;
  context_summary:  string | null;
  status:           "open" | "planned" | "building" | "shipped" | "declined" | "duplicate" | "stale";
  priority:         "high" | "medium" | "low" | null;
  operator_note:    string | null;
  decided_at:       string | null;
  emitted_count:    number;
  similar_count:    number;
  last_emitted_at:  string;
  created_at:       string;
  updated_at:       string;
}

export interface WishStats {
  total:              number;
  by_status:          Record<string, number>;
  by_priority:        Record<string, number>;
  by_category:        Record<string, number>;
  open_count:         number;
  high_priority_open: number;
}

export async function seasonListWishes(opts: {
  projectId?: string | "platform";
  status?: SeasonWish["status"];
  category?: SeasonWish["category"];
  limit?: number;
}): Promise<{ wishes?: SeasonWish[]; count?: number; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_season_list_wishes', ...opts });
  if (!r?.success) return { error: r?.error };
  return { wishes: r.wishes, count: r.count };
}

export async function seasonTriageWish(opts: {
  wishId: string;
  status: SeasonWish["status"];
  priority?: "high" | "medium" | "low";
  operatorNote?: string;
}): Promise<{ wish?: any; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_season_triage_wish', ...opts });
  if (!r?.success) return { error: r?.error };
  return { wish: r.wish };
}

export async function seasonWishStats(opts: { projectId?: string | "platform" } = {}): Promise<{ stats?: WishStats; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_season_wish_stats', ...opts });
  if (!r?.success) return { error: r?.error };
  return { stats: r.stats };
}

/* ───────── Phase 10c — Write actions ───────── */

export async function seasonActionSaveDataRoomNote(opts: {
  projectId: string;
  category: string;
  field_key: string;
  note_text: string;
}): Promise<{ changed?: any; previous?: any; message?: string; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_season_action_save_data_room_note', ...opts });
  if (!r?.success) return { error: r?.error };
  return { changed: r.changed, previous: r.previous, message: r.message };
}

export async function seasonActionUpdateStrategyStatus(opts: {
  projectId: string;
  strategyId: string;
  new_status: string;
  reason?: string;
}): Promise<{ changed?: any; previous?: any; message?: string; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_season_action_update_strategy_status', ...opts });
  if (!r?.success) return { error: r?.error };
  return { changed: r.changed, previous: r.previous, message: r.message };
}

export async function seasonActionAddKanbanNote(opts: {
  projectId: string;
  cardId: string;
  note_text: string;
}): Promise<{ changed?: any; previous?: any; message?: string; error?: string }> {
  const r = await post(ENGINE, { action: 'bs_season_action_add_kanban_note', ...opts });
  if (!r?.success) return { error: r?.error };
  return { changed: r.changed, previous: r.previous, message: r.message };
}
