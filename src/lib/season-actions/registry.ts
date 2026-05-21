/* ════════════════════════════════════════════════════════════════
   src/lib/season-actions/registry.ts
   Phase 10a — The S.E.A.S.O.N. action registry.

   Every thing S.E.A.S.O.N. can DO on the UI is registered here as a
   typed action with:
     • id           — stable string, used in suggestions
     • label        — what the button says
     • permission   — gate type (ui_only | data_read | data_write | destructive)
     • scope        — global vs per-page
     • confirm      — does it need a "tap to confirm" before firing
     • match        — natural-language predicate (does "filter overdue" match this?)
     • handler      — what actually runs

   The registry is consulted by:
     • SeasonModal — to render suggested action buttons from LLM responses
     • The keyword router (later phases) — to match user input to actions
     • The Settings → Audit Log — to render readable history

   PERMISSION ENFORCEMENT
   ──────────────────────
   Before any action fires, runAction() checks settings.capabilities.
   If the permission is denied, the action is blocked with a clear
   message ("filter_sort is disabled in your settings"). The user can
   either change settings or do it manually.

   The HARD BOUNDARY:
   ──────────────────
   No action can be registered with permission='destructive' AND
   confirm=false. Destructive actions ALWAYS confirm. Hardcoded at the
   register() function level.
═══════════════════════════════════════════════════════════════ */

import type { SeasonSettings, CapabilitySettings } from '@/contexts/SeasonContext';
import { publishAction, hasSubscribers } from './bus';

export type ActionPermission =
  | 'ui_only'         // pure UI — filter, sort, scroll, open modal, navigate
  | 'data_read'       // calls an existing backend read (compute intel, refresh briefing)
  | 'data_write'      // modifies something (save, update, attach) — always confirms by default
  | 'destructive';    // delete, finalize, cancel — ALWAYS confirms, cannot be auto-allowed

export type ActionScope = 'global' | 'kanban' | 'audit' | 'planning' | 'data-room' | 'dashboard' | 'launchpad' | 'algorithm-intel' | 'command';

export interface ActionContext {
  /* The runtime context an action receives when it fires. */
  projectId?:   string | null;
  awareness?:   any;
  payload?:     any;            // arbitrary data from the LLM's suggestion (strategyId, tab name, etc.)
  navigate?:    (path: string) => void;
  toast?:       (msg: string, kind?: 'success' | 'error' | 'info') => void;
}

export interface ActionResult {
  ok:           boolean;
  message?:     string;
  /* If the action navigates, it may set this so the orchestrator
     can close the modal and wait for the route change. */
  navigated?:   boolean;
}

export interface ActionDef {
  id:           string;
  label:        string;
  description:  string;
  permission:   ActionPermission;
  scope:        ActionScope;
  /* If true, the orchestrator shows a "Tap to confirm" UI before firing.
     For 'destructive' permission, this is enforced TRUE no matter what. */
  confirm:      boolean;
  /* Natural-language phrases that match this action. Used by the future
     LLM action-suggester to map user input to a registered action. */
  matches:      RegExp[];
  /* Static example phrasings shown in the Settings → Capabilities help. */
  examples:     string[];
  handler:      (ctx: ActionContext) => Promise<ActionResult>;
}

/* ─── The registry ──────────────────────────────────────────── */

const REGISTRY = new Map<string, ActionDef>();

export function register(def: ActionDef) {
  /* Enforce the hard boundary: destructive actions ALWAYS confirm. */
  if (def.permission === 'destructive' && !def.confirm) {
    // eslint-disable-next-line no-console
    console.error(`[season-actions] Hard boundary violated: action "${def.id}" is destructive but does not require confirm. Forcing confirm=true.`);
    def = { ...def, confirm: true };
  }
  if (REGISTRY.has(def.id)) {
    // eslint-disable-next-line no-console
    console.warn(`[season-actions] Duplicate registration of "${def.id}" — overwriting.`);
  }
  REGISTRY.set(def.id, def);
}

export function getAction(id: string): ActionDef | undefined {
  return REGISTRY.get(id);
}

export function listActions(opts?: { scope?: ActionScope }): ActionDef[] {
  const all = Array.from(REGISTRY.values());
  if (!opts?.scope) return all;
  return all.filter(a => a.scope === 'global' || a.scope === opts.scope);
}

export function listActionsForUserInput(text: string, scope?: ActionScope): ActionDef[] {
  const candidates = listActions({ scope });
  const lc = text.toLowerCase();
  return candidates
    .map(a => ({
      action: a,
      matchCount: a.matches.reduce((n, re) => n + (re.test(lc) ? 1 : 0), 0),
    }))
    .filter(x => x.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
    .map(x => x.action);
}

/* ─── Permission gate ───────────────────────────────────────── */

export function isActionAllowed(action: ActionDef, settings: SeasonSettings): { allowed: boolean; reason?: string } {
  const c: CapabilitySettings = settings.capabilities;

  /* Destructive can NEVER be auto-allowed regardless of settings.
     But confirm-gated destructive actions are still allowed to be
     suggested — they just require explicit confirmation. */
  if (action.permission === 'destructive') {
    return { allowed: true };  // suggestion is allowed; the runner enforces confirm
  }

  if (action.permission === 'ui_only') {
    /* UI-only actions split between navigate and filter capabilities */
    if (action.id.startsWith('navigate_') || action.id === 'goto') {
      if (!c.navigate) return { allowed: false, reason: 'Navigation is disabled in your settings.' };
    } else if (action.id.startsWith('filter_') || action.id.startsWith('sort_')) {
      if (!c.filter_sort) return { allowed: false, reason: 'Filter & sort is disabled in your settings.' };
    }
    return { allowed: true };
  }

  if (action.permission === 'data_read') {
    if (!c.read_data) return { allowed: false, reason: 'Reading project data is disabled in your settings.' };
    /* Intel compute is a heavier read */
    if (action.id.includes('intel') && !c.compute_intel) {
      return { allowed: false, reason: 'Computing intelligence is disabled in your settings.' };
    }
    return { allowed: true };
  }

  if (action.permission === 'data_write') {
    if (!c.modify_with_confirm && !c.modify_no_confirm) {
      return { allowed: false, reason: 'Modifying data is disabled in your settings. Enable it (with or without confirmation) under Capabilities.' };
    }
    return { allowed: true };
  }

  return { allowed: true };
}

/* Should this action prompt for "tap to confirm" before firing? */
export function actionNeedsConfirm(action: ActionDef, settings: SeasonSettings): boolean {
  if (action.permission === 'destructive') return true;  // hard rule
  if (action.confirm) return true;
  if (action.permission === 'data_write' && !settings.capabilities.modify_no_confirm) return true;
  return false;
}

/* ─── Runner — the single entry point ───────────────────────── */

export async function runAction(
  actionId: string,
  ctx: ActionContext,
  settings: SeasonSettings,
): Promise<ActionResult> {
  const def = REGISTRY.get(actionId);
  if (!def) {
    return { ok: false, message: `Unknown action: "${actionId}".` };
  }
  const gate = isActionAllowed(def, settings);
  if (!gate.allowed) {
    return { ok: false, message: gate.reason || 'This action is not allowed under current settings.' };
  }
  try {
    return await def.handler(ctx);
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Action failed unexpectedly.' };
  }
}

/* ─── Default registrations ─────────────────────────────────── */

/* Pure-UI navigation actions. These prove the architecture works.
   More actions register from the same file in 10b. */

register({
  id:           'navigate_command',
  label:        'Open S.E.A.S.O.N. briefing',
  description:  'Jump to the full /command page with this project briefed.',
  permission:   'ui_only',
  scope:        'global',
  confirm:      false,
  matches:      [/full briefing/i, /command page/i, /open command/i, /briefing page/i],
  examples:     ['open the briefing', 'show the full command page'],
  handler:      async (ctx) => {
    ctx.navigate?.('/command');
    return { ok: true, navigated: true, message: 'Opened briefing.' };
  },
});

register({
  id:           'navigate_planning',
  label:        'Open Planning',
  description:  'Jump to the strategy pipeline board.',
  permission:   'ui_only',
  scope:        'global',
  confirm:      false,
  matches:      [/open planning/i, /go to planning/i, /strateg(y|ies) board/i, /pipeline board/i],
  examples:     ['open planning', 'show me the strategy board'],
  handler:      async (ctx) => {
    ctx.navigate?.('/planning');
    return { ok: true, navigated: true, message: 'Opened Planning.' };
  },
});

register({
  id:           'navigate_data_room',
  label:        'Open Data Room',
  description:  'Jump to the Data Room — the source of truth for what we know.',
  permission:   'ui_only',
  scope:        'global',
  confirm:      false,
  matches:      [/open data.?room/i, /show data.?room/i, /data room/i],
  examples:     ['open data room', 'show me the data room'],
  handler:      async (ctx) => {
    ctx.navigate?.('/data-room');
    return { ok: true, navigated: true, message: 'Opened Data Room.' };
  },
});

register({
  id:           'navigate_dashboard',
  label:        'Open Dashboard',
  description:  'Jump to the top-level Dashboard.',
  permission:   'ui_only',
  scope:        'global',
  confirm:      false,
  matches:      [/open dashboard/i, /go to dashboard/i, /show dashboard/i],
  examples:     ['open dashboard', 'go to the dashboard'],
  handler:      async (ctx) => {
    ctx.navigate?.('/dashboard');
    return { ok: true, navigated: true, message: 'Opened Dashboard.' };
  },
});

register({
  id:           'navigate_audit',
  label:        'Open Audit',
  description:  'Jump to the SEO Audit page.',
  permission:   'ui_only',
  scope:        'global',
  confirm:      false,
  matches:      [/open audit/i, /show audit/i, /go to audit/i, /audit page/i],
  examples:     ['open audit', 'show me audits'],
  handler:      async (ctx) => {
    ctx.navigate?.('/audit');
    return { ok: true, navigated: true, message: 'Opened Audit.' };
  },
});

register({
  id:           'navigate_season_settings',
  label:        'Open S.E.A.S.O.N. Settings',
  description:  'Jump to the control panel.',
  permission:   'ui_only',
  scope:        'global',
  confirm:      false,
  matches:      [/season settings/i, /control panel/i, /my settings/i, /open settings/i],
  examples:     ['open settings', 'control panel'],
  handler:      async (ctx) => {
    ctx.navigate?.('/season-settings');
    return { ok: true, navigated: true, message: 'Opened Settings.' };
  },
});

/* Data-read actions */

register({
  id:           'compute_intelligence',
  label:        'Compute analytics intelligence now',
  description:  'Runs the GSC + GA4 90-day analysis pipeline and caches the bundle.',
  permission:   'data_read',
  scope:        'global',
  confirm:      false,
  matches:      [/compute intel/i, /refresh intel/i, /recompute analytics/i, /run analysis/i, /make it/i],
  examples:     ['compute intelligence', 'refresh analytics'],
  handler:      async (ctx) => {
    /* This is dispatched via the existing seasonCommand path. The handler
       just navigates if needed — the real work is the keyword router. */
    return { ok: true, message: 'Use "compute intelligence" in the S.E.A.S.O.N. input box to run this.' };
  },
});

/* ─── Helper: get human-readable action list per scope (for help) ─── */

export function listActionExamples(scope?: ActionScope): Array<{ id: string; label: string; examples: string[] }> {
  return listActions({ scope }).map(a => ({
    id: a.id,
    label: a.label,
    examples: a.examples,
  }));
}

/* ════════════════════════════════════════════════════════════
   Phase 10b — Page-driving actions (via the action bus)
═══════════════════════════════════════════════════════════ */

/* Helper: navigate first if not on right page, then publish */
function navigateThenPublish(
  path: string,
  busAction: string,
  payload: any,
  ctx: ActionContext,
): ActionResult {
  /* If the page is mounted now (a subscriber exists), publish directly. */
  if (hasSubscribers(busAction)) {
    publishAction(busAction, payload);
    return { ok: true, message: `Applied: ${busAction}` };
  }
  /* Otherwise navigate, then publish after a short delay so the
     destination page has time to mount + subscribe. */
  ctx.navigate?.(path);
  setTimeout(() => {
    if (hasSubscribers(busAction)) publishAction(busAction, payload);
  }, 280);
  return { ok: true, navigated: true, message: `Opened ${path}, applying…` };
}

/* ─── Data Room tab actions ─── */

const DATA_ROOM_TABS: Record<string, string> = {
  'overview': 'overview', 'goals': 'goals', 'cms': 'cms', 'access': 'access',
  'analytics': 'analytics', 'technical': 'technical', 'competitors': 'competitors',
  'documents': 'documents', 'crawl': 'crawl', 'identity': 'identity',
  'audience': 'audience', 'content': 'content', 'backlinks': 'backlinks',
  'commercial': 'commercial', 'history': 'history',
  'brand_narrative': 'brand_narrative',
  'access_vault': 'access_vault', 'content_library': 'content_library',
  'info_repository': 'info_repository', 'approvals_log': 'approvals_log',
};

register({
  id:           'data_room_set_tab',
  label:        'Switch Data Room tab',
  description:  'Opens the requested tab inside the Data Room.',
  permission:   'ui_only',
  scope:        'global',
  confirm:      false,
  matches: [
    /open .*(analytics|goals|identity|audience|competitors|backlinks|brand|content|history)/i,
    /show .*(analytics|goals|identity|audience|competitors|backlinks|brand|content|history)/i,
    /(analytics|goals|identity|audience|competitors|backlinks|brand|content) tab/i,
    /access vault|content library|info repository|approvals log/i,
  ],
  examples: [
    'open the analytics tab',
    'switch to brand narrative',
    'show access vault',
  ],
  handler: async (ctx) => {
    const requested = String(ctx.payload?.tab || '').toLowerCase().trim().replace(/\s+/g, '_');
    const resolvedTab = DATA_ROOM_TABS[requested] || 'overview';
    return navigateThenPublish('/data-room', 'data_room_set_tab', { tab: resolvedTab }, ctx);
  },
});

/* ─── Planning view-switching ─── */

register({
  id:           'planning_open_strategy',
  label:        'Open a strategy in Planning',
  description:  'Jumps to the detail view of a specific strategy.',
  permission:   'ui_only',
  scope:        'global',
  confirm:      false,
  matches: [
    /open (strategy|the strategy)/i, /show me (strategy|the strategy)/i,
    /detail view/i,
  ],
  examples: ['open the strategy', 'show me strategy detail'],
  handler: async (ctx) => {
    const strategyId = ctx.payload?.strategyId || ctx.awareness?.selected?.id;
    if (!strategyId) {
      return { ok: false, message: 'No strategy specified. Try selecting one first or pass an ID.' };
    }
    return navigateThenPublish('/planning', 'planning_open_strategy', { strategyId }, ctx);
  },
});

register({
  id:           'planning_open_board',
  label:        'Show the strategy pipeline board',
  description:  'Returns to the planning board view.',
  permission:   'ui_only',
  scope:        'global',
  confirm:      false,
  matches: [/pipeline board/i, /back to (board|planning)/i, /strategy board/i],
  examples: ['back to the board', 'show the pipeline'],
  handler: async (ctx) => navigateThenPublish('/planning', 'planning_open_board', {}, ctx),
});

/* ─── Audit-page actions ─── */

register({
  id:           'audit_open_latest',
  label:        'Open the most recent audit',
  description:  'Selects and opens the latest audit report.',
  permission:   'ui_only',
  scope:        'global',
  confirm:      false,
  matches: [/latest audit/i, /most recent audit/i, /open the audit/i],
  examples: ['open the latest audit', 'show me the most recent audit'],
  handler: async (ctx) => navigateThenPublish('/audit', 'audit_open_latest', {}, ctx),
});

/* ─── Refresh briefing on /command ─── */

register({
  id:           'refresh_briefing',
  label:        'Refresh the briefing',
  description:  'Re-pulls strategies, blockers, attention items.',
  permission:   'data_read',
  scope:        'global',
  confirm:      false,
  matches: [/refresh briefing/i, /reload (the )?briefing/i, /re-?pull/i],
  examples: ['refresh the briefing', 'reload'],
  handler: async (ctx) => navigateThenPublish('/command', 'refresh_briefing', {}, ctx),
});

/* ─── Open provenance details inside Data Room → Analytics ─── */

register({
  id:           'open_provenance_detail',
  label:        'Open provenance details',
  description:  'Switches to Data Room → Analytics and opens the provenance panel.',
  permission:   'ui_only',
  scope:        'global',
  confirm:      false,
  matches: [
    /(provenance|where (do|did) (these|the) numbers come from)/i,
    /show.*provenance/i, /open.*provenance/i,
  ],
  examples: ['open provenance', 'where do the numbers come from?'],
  handler: async (ctx) => navigateThenPublish('/data-room', 'data_room_set_tab', { tab: 'analytics', focus: 'provenance' }, ctx),
});
