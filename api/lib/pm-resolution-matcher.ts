/* ════════════════════════════════════════════════════════════════
   api/lib/pm-resolution-matcher.ts
   Phase 5 — Template ↔ Store matching engine.

   Two responsibilities:
     1. matchCardDeps(projectId, action_id) → returns a DependencyItem[]
        array suitable for kanban_tasks.requirements. Each item is
        either RESOLVED (with resolved_via pointer to a store item)
        or UNRESOLVED (with unresolved_pointer telling the PM which
        panel to go fill in).
     2. rematchProjectStrategyCards(projectId) → re-runs matching on
        every strategy card in the project. Called after ANY store
        mutation so existing cards reflect the new state immediately.

   Matching rules: action's templates declare {store, label}. We look
   up project items in that store by case-insensitive exact label
   match. If found AND the item is in a resolved state (held/delivered/
   gathered/approved depending on store), the dep is marked met=true
   with a resolved_via pointer. Otherwise met=false with an
   unresolved_pointer.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { getTemplatesForAction, type ResolutionStore, type ResolutionTemplate } from "./pm-action-templates.js";
import { isItemResolved } from "./pm-resolution-stores.js";

const STORE_TABLE: Record<ResolutionStore, string> = {
  access:   "project_access_items",
  content:  "project_content_assets",
  info:     "project_info_items",
  approval: "project_approvals",
};

/* ─── DependencyItem shape (in kanban_tasks.requirements JSON) ──── */

export interface ResolvedDep {
  id:           string;
  label:        string;
  category:     ResolutionStore | "task_prereq";
  met:          boolean;
  required:     boolean;
  resolved_via?: {
    store:      ResolutionStore;
    item_id:    string;
    item_label: string;
  };
  unresolved_pointer?: {
    store:        ResolutionStore;
    suggested_label: string;
    notes?:       string;
  };
}

/* ─── Per-project store cache (single fetch per rematch run) ──── */

interface StoreCache {
  access:   any[];
  content:  any[];
  info:     any[];
  approval: any[];
}

async function loadStoreCache(projectId: string): Promise<StoreCache> {
  const [accessRes, contentRes, infoRes, approvalRes] = await Promise.all([
    db().from(STORE_TABLE.access).select("*").eq("project_id", projectId),
    db().from(STORE_TABLE.content).select("*").eq("project_id", projectId),
    db().from(STORE_TABLE.info).select("*").eq("project_id", projectId),
    db().from(STORE_TABLE.approval).select("*").eq("project_id", projectId),
  ]);
  return {
    access:   (accessRes.data || []) as any[],
    content:  (contentRes.data || []) as any[],
    info:     (infoRes.data || []) as any[],
    approval: (approvalRes.data || []) as any[],
  };
}

/* ─── Match a single template against cache ─────────────────── */

function matchTemplate(cache: StoreCache, template: ResolutionTemplate, idx: number): ResolvedDep {
  const items = cache[template.store];
  const labelLower = template.label.toLowerCase();
  const match = items.find((i: any) => (i.label || "").toLowerCase() === labelLower);

  if (match && isItemResolved(template.store, match)) {
    return {
      id:       `t${idx}`,
      label:    template.label,
      category: template.store,
      met:      true,
      required: template.required,
      resolved_via: {
        store:      template.store,
        item_id:    match.id,
        item_label: match.label,
      },
    };
  }

  return {
    id:       `t${idx}`,
    label:    template.label,
    category: template.store,
    met:      false,
    required: template.required,
    unresolved_pointer: {
      store:        template.store,
      suggested_label: template.label,
      notes:        template.notes,
    },
  };
}

/* ─── Public: build deps for a single card at push time ──────── */

export async function matchCardDeps(opts: {
  projectId: string;
  actionId:  string;
}): Promise<ResolvedDep[]> {
  const templates = getTemplatesForAction(opts.actionId);
  if (templates.length === 0) return [];
  const cache = await loadStoreCache(opts.projectId);
  return templates.map((t, i) => matchTemplate(cache, t, i));
}

/* ─── Public: retroactive rematch of every strategy card in project ─── */

export async function rematchProjectStrategyCards(projectId: string): Promise<{
  cardsUpdated: number;
  errors: number;
}> {
  let cardsUpdated = 0;
  let errors = 0;

  /* Load all strategy cards in the project */
  const { data: cards, error } = await db().from("kanban_tasks")
    .select("id,source_action_id,requirements")
    .eq("project_id", projectId)
    .not("strategic_link", "is", null);

  if (error || !cards) return { cardsUpdated, errors: 1 };
  if (cards.length === 0) return { cardsUpdated, errors };

  /* Load store cache once for the whole project */
  const cache = await loadStoreCache(projectId);

  for (const card of cards as any[]) {
    const actionId = card.source_action_id;
    if (!actionId) continue;
    const templates = getTemplatesForAction(actionId);
    if (templates.length === 0) continue;

    /* Build fresh deps from templates */
    const fresh = templates.map((t, i) => matchTemplate(cache, t, i));

    /* Preserve any manually-added requirements that aren't template-driven.
       Heuristic: rows without a `resolved_via` AND without an `unresolved_pointer`
       are manual additions — keep them as-is. */
    const existing = Array.isArray(card.requirements) ? card.requirements : [];
    const manual = existing.filter((r: any) =>
      r && !r.resolved_via && !r.unresolved_pointer &&
      /* And not already represented in the fresh template results */
      !fresh.some(f => (f.label || "").toLowerCase() === (r.label || "").toLowerCase())
    );

    /* Renumber manual IDs to avoid clashes */
    const renumbered = manual.map((r: any, i: number) => ({ ...r, id: `m${i}` }));
    const combined = [...fresh, ...renumbered];

    try {
      const { error: e2 } = await db().from("kanban_tasks")
        .update({ requirements: combined, updated_at: new Date().toISOString() })
        .eq("id", card.id);
      if (e2) errors++; else cardsUpdated++;
    } catch {
      errors++;
    }
  }

  return { cardsUpdated, errors };
}

/* ─── Public: manual trigger endpoint ────────────────────────── */

export async function bsRematchProjectCards(body: any): Promise<any> {
  const { projectId } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const result = await rematchProjectStrategyCards(projectId);
    return { success: true, ...result };
  } catch (e: any) {
    return { success: false, error: e?.message || "rematch failed" };
  }
}
