/* ════════════════════════════════════════════════════════════════
   api/lib/season-wishes.ts
   Phase 8a — Wish management.

   Endpoints:
     • bsSeasonEmitWish      — internal/LLM-side: log a wish
     • bsSeasonListWishes    — operator-side: read open wishes
     • bsSeasonTriageWish    — operator-side: planned/declined/etc
     • bsSeasonWishStats     — operator-side: counts per status

   De-duplication: identical wish text emitted multiple times bumps
   the emitted_count + similar_count on the existing row instead of
   creating duplicates. Same wish from the same root signal shouldn't
   spam the ledger.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

export interface WishInput {
  projectId?:       string | null;
  wishText:         string;
  category:         "data_source" | "feature" | "integration" | "permission" | "ui_action" | "knowledge" | "other";
  triggeredBy?:     string;
  userInput?:       string;
  contextSummary?:  string;
}

/* ─── Emit a wish ───────────────────────────────────────────── */

export async function bsSeasonEmitWish(body: any): Promise<any> {
  const opts = body as WishInput;
  if (!opts || !opts.wishText || !opts.category) {
    return { success: false, error: "wishText and category are required" };
  }

  const wishText = String(opts.wishText).trim().slice(0, 1000);
  const category = String(opts.category);

  if (wishText.length < 8) return { success: false, error: "wish text too short" };

  try {
    /* Dedupe — same wishText in same project, status='open', within last 30 days */
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const dupeQ = db().from("season_wishes")
      .select("id, emitted_count, similar_count")
      .eq("wish_text", wishText)
      .eq("status", "open")
      .gte("created_at", since);

    if (opts.projectId) dupeQ.eq("project_id", opts.projectId);
    else                dupeQ.is("project_id", null);

    const { data: dupes } = await dupeQ.limit(1);
    const dupe = (dupes && dupes[0]) as any;

    if (dupe) {
      /* Bump existing */
      const { data: updated } = await db().from("season_wishes")
        .update({
          emitted_count:    (dupe.emitted_count || 1) + 1,
          similar_count:    (dupe.similar_count || 1) + 1,
          last_emitted_at:  new Date().toISOString(),
        })
        .eq("id", dupe.id)
        .select("id")
        .maybeSingle();
      return { success: true, wishId: updated?.id || dupe.id, deduped: true };
    }

    /* Insert new */
    const { data: inserted, error } = await db().from("season_wishes").insert({
      project_id:      opts.projectId || null,
      wish_text:       wishText,
      category:        category,
      triggered_by:    opts.triggeredBy ? String(opts.triggeredBy).slice(0, 500) : null,
      user_input:      opts.userInput ? String(opts.userInput).slice(0, 500) : null,
      context_summary: opts.contextSummary ? String(opts.contextSummary).slice(0, 500) : null,
    }).select("id").maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, wishId: inserted?.id, deduped: false };
  } catch (e: any) {
    return { success: false, error: e?.message || "emit failed" };
  }
}

/* ─── List wishes (for the Settings UI) ─────────────────────── */

export async function bsSeasonListWishes(body: any): Promise<any> {
  const { projectId, status, category, limit = 50 } = body || {};

  try {
    let q = db().from("season_wishes")
      .select("id,project_id,wish_text,category,triggered_by,user_input,context_summary,status,priority,operator_note,decided_at,emitted_count,similar_count,last_emitted_at,created_at,updated_at")
      .order("last_emitted_at", { ascending: false })
      .limit(Math.min(Number(limit) || 50, 200));

    if (projectId === "platform") q = q.is("project_id", null);
    else if (projectId)            q = q.eq("project_id", projectId);

    if (status)   q = q.eq("status", status);
    if (category) q = q.eq("category", category);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    return { success: true, wishes: data || [], count: data?.length || 0 };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

/* ─── Triage a wish (planned / declined / etc) ──────────────── */

export async function bsSeasonTriageWish(body: any): Promise<any> {
  const { wishId, status, priority, operatorNote } = body || {};
  if (!wishId)  return { success: false, error: "wishId required" };
  if (!status)  return { success: false, error: "status required" };

  const validStatuses = ["open", "planned", "building", "shipped", "declined", "duplicate", "stale"];
  if (!validStatuses.includes(status)) {
    return { success: false, error: `invalid status (must be one of: ${validStatuses.join(", ")})` };
  }

  try {
    const patch: any = {
      status,
      decided_at: new Date().toISOString(),
    };
    if (priority)     patch.priority      = priority;
    if (operatorNote) patch.operator_note = String(operatorNote).slice(0, 1000);

    const { data, error } = await db().from("season_wishes")
      .update(patch)
      .eq("id", wishId)
      .select("id,status,priority")
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, wish: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "triage failed" };
  }
}

/* ─── Stats (counts per status) ─────────────────────────────── */

export async function bsSeasonWishStats(body: any): Promise<any> {
  const { projectId } = body || {};
  try {
    let q = db().from("season_wishes").select("status,priority,category");
    if (projectId === "platform") q = q.is("project_id", null);
    else if (projectId)            q = q.eq("project_id", projectId);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const stats = {
      total: data?.length || 0,
      by_status:   {} as Record<string, number>,
      by_priority: {} as Record<string, number>,
      by_category: {} as Record<string, number>,
      open_count:  0,
      high_priority_open: 0,
    };
    for (const row of (data || []) as any[]) {
      stats.by_status[row.status]     = (stats.by_status[row.status] || 0) + 1;
      if (row.priority) stats.by_priority[row.priority] = (stats.by_priority[row.priority] || 0) + 1;
      stats.by_category[row.category] = (stats.by_category[row.category] || 0) + 1;
      if (row.status === "open") {
        stats.open_count++;
        if (row.priority === "high") stats.high_priority_open++;
      }
    }
    return { success: true, stats };
  } catch (e: any) {
    return { success: false, error: e?.message || "stats failed" };
  }
}
