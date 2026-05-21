/* ════════════════════════════════════════════════════════════════
   api/lib/pm-resolution-stores.ts
   Phase 5 — CRUD for the four resolution stores.

   Each store gets list / get / save (insert or update) / delete /
   change-status endpoints. After ANY mutation, we trigger a project-
   wide retroactive rematch (pm-resolution-matcher) so all existing
   strategy cards reflect the new state immediately.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import type { ResolutionStore } from "./pm-action-templates.js";

/* ─── Table mapping ──────────────────────────────────────────── */

const STORE_TABLE: Record<ResolutionStore, string> = {
  access:   "project_access_items",
  content:  "project_content_assets",
  info:     "project_info_items",
  approval: "project_approvals",
};

/* ─── Resolution check — when is an item considered RESOLVED? ─── */

export function isItemResolved(store: ResolutionStore, item: any): boolean {
  if (!item) return false;
  const today = new Date().toISOString().slice(0, 10);
  switch (store) {
    case "access":
      if (item.status !== "held") return false;
      if (item.expires_at && item.expires_at < today) return false;
      return true;
    case "content":
      return item.status === "delivered";
    case "info":
      if (item.status !== "gathered") return false;
      if (item.expires_at && item.expires_at < today) return false;
      return true;
    case "approval":
      return item.status === "approved";
  }
}

/* ─── List ──────────────────────────────────────────────────── */

export async function bsListStoreItems(body: any): Promise<any> {
  const { projectId, store, status, search } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!store || !(store in STORE_TABLE)) return { success: false, error: "Invalid store" };

  try {
    let q = db().from(STORE_TABLE[store as ResolutionStore])
      .select("*")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    let items = (data || []) as any[];
    if (search) {
      const s = String(search).toLowerCase();
      items = items.filter(i => (i.label || "").toLowerCase().includes(s));
    }
    /* Stamp each item with derived `is_resolved` flag */
    const stamped = items.map(i => ({ ...i, is_resolved: isItemResolved(store as ResolutionStore, i) }));
    return { success: true, items: stamped, total: stamped.length };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

/* ─── Save (insert OR update) ────────────────────────────────── */

export async function bsSaveStoreItem(body: any): Promise<any> {
  const { projectId, store, item } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!store || !(store in STORE_TABLE)) return { success: false, error: "Invalid store" };
  if (!item || !item.label) return { success: false, error: "item with label required" };

  const table = STORE_TABLE[store as ResolutionStore];
  const clean = sanitizeItem(store as ResolutionStore, item);
  clean.project_id = projectId;
  clean.updated_at = new Date().toISOString();

  try {
    let savedItem;
    if (item.id) {
      const { data, error } = await db().from(table)
        .update(clean).eq("id", item.id).select().single();
      if (error) return { success: false, error: error.message };
      savedItem = data;
    } else {
      const { data, error } = await db().from(table)
        .insert(clean).select().single();
      if (error) return { success: false, error: error.message };
      savedItem = data;
    }

    /* Retroactive rematch — any card waiting on this label is now resolved */
    try {
      const { rematchProjectStrategyCards } = await import("./pm-resolution-matcher.js");
      await rematchProjectStrategyCards(projectId);
    } catch (e: any) {
      console.error("[stores] rematch failed:", e?.message || e);
    }

    return { success: true, item: { ...savedItem, is_resolved: isItemResolved(store as ResolutionStore, savedItem) } };
  } catch (e: any) {
    return { success: false, error: e?.message || "save failed" };
  }
}

/* ─── Delete ─────────────────────────────────────────────────── */

export async function bsDeleteStoreItem(body: any): Promise<any> {
  const { store, itemId } = body;
  if (!store || !(store in STORE_TABLE)) return { success: false, error: "Invalid store" };
  if (!itemId) return { success: false, error: "itemId required" };

  try {
    /* Fetch project_id before delete so we can rematch after */
    const { data: existing } = await db().from(STORE_TABLE[store as ResolutionStore])
      .select("project_id").eq("id", itemId).maybeSingle();
    const projectId = (existing as any)?.project_id;

    const { error } = await db().from(STORE_TABLE[store as ResolutionStore])
      .delete().eq("id", itemId);
    if (error) return { success: false, error: error.message };

    if (projectId) {
      try {
        const { rematchProjectStrategyCards } = await import("./pm-resolution-matcher.js");
        await rematchProjectStrategyCards(projectId);
      } catch (e: any) {
        console.error("[stores] rematch failed:", e?.message || e);
      }
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "delete failed" };
  }
}

/* ─── Sanitize per-store fields ──────────────────────────────── */

function sanitizeItem(store: ResolutionStore, raw: any): any {
  const base: any = {
    label: String(raw.label).slice(0, 200),
    notes: raw.notes ? String(raw.notes).slice(0, 2000) : null,
    created_by: raw.created_by ? String(raw.created_by).slice(0, 200) : undefined,
  };

  switch (store) {
    case "access":
      return {
        ...base,
        category: validate(raw.category, ["cms","dev","analytics","seo_tool","other"], "other"),
        status:   validate(raw.status, ["held","requested","expired","revoked"], "requested"),
        url:      raw.url || null,
        password_manager_link: raw.password_manager_link || null,
        held_by:    raw.held_by || null,
        obtained_at: raw.obtained_at || null,
        expires_at:  raw.expires_at || null,
      };
    case "content":
      return {
        ...base,
        asset_type:  validate(raw.asset_type, ["copy","brief","image","template","video","other"], "copy"),
        status:      validate(raw.status, ["requested","drafting","in_review","delivered","rejected"], "requested"),
        asset_url:   raw.asset_url || null,
        assignee:    raw.assignee || null,
        due_date:    raw.due_date || null,
        delivered_at: raw.status === "delivered" ? (raw.delivered_at || new Date().toISOString()) : raw.delivered_at || null,
      };
    case "info":
      return {
        ...base,
        info_type:   validate(raw.info_type, ["research","data","competitor","persona","strategy","other"], "other"),
        status:      validate(raw.status, ["needed","gathered","stale"], "needed"),
        value_text:  raw.value_text ? String(raw.value_text).slice(0, 8000) : null,
        source_url:  raw.source_url || null,
        gathered_by: raw.gathered_by || null,
        gathered_at: raw.status === "gathered" ? (raw.gathered_at || new Date().toISOString()) : raw.gathered_at || null,
        expires_at:  raw.expires_at || null,
      };
    case "approval":
      return {
        ...base,
        approval_type:  validate(raw.approval_type, ["client","internal","budget","legal"], "client"),
        status:         validate(raw.status, ["pending","approved","rejected","revoked"], "pending"),
        requested_from: raw.requested_from || null,
        requested_at:   raw.requested_at || new Date().toISOString(),
        decided_at:     raw.status === "approved" || raw.status === "rejected" ? (raw.decided_at || new Date().toISOString()) : raw.decided_at || null,
        decided_by:     raw.decided_by || null,
        decision_notes: raw.decision_notes ? String(raw.decision_notes).slice(0, 2000) : null,
        evidence_url:   raw.evidence_url || null,
      };
  }
}

function validate<T extends string>(value: any, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value) ? value : fallback;
}

/* ─── Suggest labels needed by the project's pushed actions ───── */
/* Drives the "Labels other actions need" suggestions in store panels.
   Reads which actions are referenced by strategy cards in this project,
   intersects with action templates, returns the unique labels NOT yet
   present in this store. */
export async function bsSuggestStoreLabels(body: any): Promise<any> {
  const { projectId, store } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!store) return { success: false, error: "store required" };

  try {
    const { ACTION_RESOLUTION_TEMPLATES } = await import("./pm-action-templates.js");
    /* What actions have strategy cards in this project? */
    const { data: cards } = await db().from("kanban_tasks")
      .select("source_action_id")
      .eq("project_id", projectId)
      .not("source_action_id", "is", null);
    const usedActions = new Set<string>(
      ((cards || []) as any[]).map(c => c.source_action_id).filter(Boolean),
    );

    /* What labels do those actions reference for this store? */
    const labelMap = new Map<string, string[]>();
    for (const aid of usedActions) {
      const templates = ACTION_RESOLUTION_TEMPLATES[aid] || [];
      for (const t of templates) {
        if (t.store !== store) continue;
        if (!labelMap.has(t.label)) labelMap.set(t.label, []);
        labelMap.get(t.label)!.push(aid);
      }
    }

    /* What's already in the store? */
    const { data: existingItems } = await db().from(STORE_TABLE[store as ResolutionStore])
      .select("label").eq("project_id", projectId);
    const existingLabels = new Set<string>(
      ((existingItems || []) as any[]).map(i => (i.label || "").toLowerCase()),
    );

    const suggestions = Array.from(labelMap.entries())
      .filter(([label]) => !existingLabels.has(label.toLowerCase()))
      .map(([label, actions]) => ({ label, used_by_actions: actions }));

    return { success: true, suggestions, total: suggestions.length };
  } catch (e: any) {
    return { success: false, error: e?.message || "suggest failed" };
  }
}
