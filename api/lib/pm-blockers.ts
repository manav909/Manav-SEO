/* ════════════════════════════════════════════════════════════════
   api/lib/pm-blockers.ts
   Phase 5 — Strategy Blockers derivation.

   Replaces the dumb "list of unresolved deps" view with a smart
   "what is missing, and what would unblock if I supplied it" view.

   A BLOCKER = a (store, label) pair that:
     - Is required by one or more strategy cards' templates
     - Is NOT present in the project's store with resolved state

   For each blocker we report what it's blocking:
     - Cards directly referencing it
     - Scenarios containing those cards (via strategic_link)
     - Goals containing those scenarios
     - (Future) Reports flagged as depending on the strategy

   Each blocker carries a one-click resolution pointer to the right
   store tab so the PM can fill in the missing item.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { getTemplatesForAction, type ResolutionStore } from "./pm-action-templates.js";
import { isItemResolved } from "./pm-resolution-stores.js";

export interface BlockedItem {
  type:     "card" | "scenario" | "goal" | "report";
  id:       string;
  title:    string;
  status?:  string;
  due_date?: string | null;
}

export interface Blocker {
  store:           ResolutionStore;
  label:           string;
  required:        boolean;        /* if false, it's a "soft" blocker */
  blocks:          BlockedItem[];
  block_summary:   {
    cards: number;
    scenarios: number;
    goals: number;
    reports: number;
  };
  resolution_panel: ResolutionStore;     /* same as store, for clarity */
  notes?:          string;
}

/* ─── Main blocker derivation ──────────────────────────────── */

export async function bsGetStrategyBlockers(body: any): Promise<any> {
  const { projectId } = body;
  if (!projectId) return { success: false, error: "projectId required" };

  try {
    /* 1. Load all strategy cards with their action IDs and strategic links */
    const { data: cards } = await db().from("kanban_tasks")
      .select("id,title,status,source_action_id,strategic_link,target_completion_date")
      .eq("project_id", projectId)
      .not("strategic_link", "is", null);

    const cardRows = (cards || []) as any[];
    if (cardRows.length === 0) {
      return { success: true, blockers: [], stats: { total_blockers: 0, hard_blockers: 0, soft_blockers: 0 } };
    }

    /* 2. Load all 4 stores once */
    const [accessRes, contentRes, infoRes, approvalRes] = await Promise.all([
      db().from("project_access_items").select("*").eq("project_id", projectId),
      db().from("project_content_assets").select("*").eq("project_id", projectId),
      db().from("project_info_items").select("*").eq("project_id", projectId),
      db().from("project_approvals").select("*").eq("project_id", projectId),
    ]);
    const storeCache: Record<ResolutionStore, any[]> = {
      access:   (accessRes.data || []) as any[],
      content:  (contentRes.data || []) as any[],
      info:     (infoRes.data || []) as any[],
      approval: (approvalRes.data || []) as any[],
    };

    /* 3. Build blocker map keyed by (store::label) */
    const blockerMap = new Map<string, Blocker>();
    /* Track unique scenario/goal IDs touched */
    const scenarioIdMap = new Map<string, BlockedItem>();
    const goalIdMap     = new Map<string, BlockedItem>();

    for (const card of cardRows) {
      const actionId = card.source_action_id;
      if (!actionId) continue;
      const templates = getTemplatesForAction(actionId);
      if (templates.length === 0) continue;

      const link = card.strategic_link as any;

      for (const t of templates) {
        const items = storeCache[t.store];
        const labelLower = t.label.toLowerCase();
        const match = items.find((i: any) => (i.label || "").toLowerCase() === labelLower);
        const resolved = match && isItemResolved(t.store, match);
        if (resolved) continue;

        /* Unresolved → this is a blocker */
        const key = `${t.store}::${t.label}`;
        if (!blockerMap.has(key)) {
          blockerMap.set(key, {
            store:    t.store,
            label:    t.label,
            required: t.required,
            blocks:   [],
            block_summary: { cards: 0, scenarios: 0, goals: 0, reports: 0 },
            resolution_panel: t.store,
            notes:    t.notes,
          });
        }
        const blocker = blockerMap.get(key)!;

        /* Add the card it blocks */
        blocker.blocks.push({
          type:     "card",
          id:       card.id,
          title:    card.title,
          status:   card.status,
          due_date: card.target_completion_date || null,
        });
        blocker.block_summary.cards += 1;

        /* Add scenario / goal references via strategic_link */
        if (link?.type === "scenario") {
          const sid = link.id;
          if (!scenarioIdMap.has(`${key}::${sid}`)) {
            scenarioIdMap.set(`${key}::${sid}`, {
              type: "scenario", id: sid, title: link.name || "(scenario)",
            });
            blocker.blocks.push({ type: "scenario", id: sid, title: link.name || "(scenario)" });
            blocker.block_summary.scenarios += 1;
          }
        }
        if (link?.type === "goal") {
          const gid = link.id;
          if (!goalIdMap.has(`${key}::${gid}`)) {
            goalIdMap.set(`${key}::${gid}`, {
              type: "goal", id: gid, title: link.name || "(goal)",
            });
            blocker.blocks.push({ type: "goal", id: gid, title: link.name || "(goal)" });
            blocker.block_summary.goals += 1;
          }
        }
        /* If the blocker's required flag was false on one template but
           true on another, escalate to required */
        if (t.required) blocker.required = true;
      }
    }

    /* 4. Report blocking — scan project_documents (if any) with
          requires_strategy flag. For now this is a stub but the
          shape matches the BlockedItem schema so the UI can render it
          when the field is populated upstream. */
    try {
      const { data: docs } = await db().from("project_documents")
        .select("id,title,linked_strategy")
        .eq("project_id", projectId)
        .not("linked_strategy", "is", null);
      if (docs && docs.length > 0) {
        for (const doc of docs as any[]) {
          const link = doc.linked_strategy;
          if (!link?.id || !link?.type) continue;
          /* Iterate blockers; if this doc's linked strategy matches one,
             add it as a blocked report */
          for (const blocker of blockerMap.values()) {
            const matches = blocker.blocks.some(b =>
              (b.type === "scenario" || b.type === "goal") && b.id === link.id);
            if (!matches) continue;
            blocker.blocks.push({
              type: "report", id: doc.id, title: doc.title || "(document)",
            });
            blocker.block_summary.reports += 1;
          }
        }
      }
    } catch { /* table may not have linked_strategy column — non-fatal */ }

    /* 5. Sort: hard blockers first, then by total things blocked */
    const blockers = Array.from(blockerMap.values()).sort((a, b) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      const aTotal = a.block_summary.cards + a.block_summary.scenarios + a.block_summary.goals + a.block_summary.reports;
      const bTotal = b.block_summary.cards + b.block_summary.scenarios + b.block_summary.goals + b.block_summary.reports;
      return bTotal - aTotal;
    });

    return {
      success: true,
      blockers,
      stats: {
        total_blockers: blockers.length,
        hard_blockers:  blockers.filter(b => b.required).length,
        soft_blockers:  blockers.filter(b => !b.required).length,
        by_store: {
          access:   blockers.filter(b => b.store === "access").length,
          content:  blockers.filter(b => b.store === "content").length,
          info:     blockers.filter(b => b.store === "info").length,
          approval: blockers.filter(b => b.store === "approval").length,
        },
        total_cards_blocked:     new Set(blockers.flatMap(b => b.blocks.filter(x => x.type === "card").map(x => x.id))).size,
        total_scenarios_blocked: new Set(blockers.flatMap(b => b.blocks.filter(x => x.type === "scenario").map(x => x.id))).size,
        total_goals_blocked:     new Set(blockers.flatMap(b => b.blocks.filter(x => x.type === "goal").map(x => x.id))).size,
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "blocker derivation failed" };
  }
}
