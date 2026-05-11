import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 30 };

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

// ─────────────────────────────────────────────────────────────────────
// brain-learning.ts
// Manages Manav Brain's incremental learning from task execution reviews.
// Learnings are retrieved at task execution time and injected into the
// prompt so every future task benefits from accumulated experience.
// ─────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { action } = req.body;
  if (!action) return res.status(400).json({ error: "action required" });

  try {
    // ══ SAVE LEARNING ════════════════════════════════════════════════
    // Called after evaluation phase when user clicks "Save to Learning".
    if (action === "save_learning") {
      const { project_id, card_type, card_title, what_worked, what_missed,
              redo_reason, improvement, context_summary, tags } = req.body;

      if (!card_type) return res.status(400).json({ error: "card_type required" });

      const { data, error } = await sb.from("brain_learnings").insert({
        project_id:      project_id || null,
        card_type:       card_type,
        card_title:      card_title || "",
        what_worked:     Array.isArray(what_worked) ? what_worked : [],
        what_missed:     Array.isArray(what_missed) ? what_missed : [],
        redo_reason:     redo_reason || null,
        improvement:     improvement || null,
        context_summary: context_summary || null,
        tags:            Array.isArray(tags) ? tags : [],
        source:          "task_execution",
        applied_count:   0,
        updated_at:      new Date().toISOString(),
      }).select().single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, learning: data });
    }

    // ══ GET RELEVANT LEARNINGS ═══════════════════════════════════════
    // Returns the most relevant learnings for a card type, used to
    // inject Manav Brain's accumulated experience into task execution.
    // Prioritises: same card type + same project, then same card type
    // globally, then any recent high-value learnings.
    if (action === "get_relevant") {
      const { project_id, card_type, limit = 8 } = req.body;

      let rows: any[] = [];

      // 1. Same card type + same project (most specific)
      if (project_id && card_type) {
        const { data } = await sb.from("brain_learnings")
          .select("*")
          .eq("project_id", project_id)
          .eq("card_type", card_type)
          .order("applied_count", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(limit);
        rows = data || [];
      }

      // 2. Same card type, any project (cross-project knowledge)
      if (rows.length < limit && card_type) {
        const existing = new Set(rows.map((r: any) => r.id));
        const { data } = await sb.from("brain_learnings")
          .select("*")
          .eq("card_type", card_type)
          .order("applied_count", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(limit - rows.length + 5); // fetch a few extra to deduplicate
        const extra = (data || []).filter((r: any) => !existing.has(r.id));
        rows = [...rows, ...extra].slice(0, limit);
      }

      // 3. Recent general learnings if still under limit
      if (rows.length < 3) {
        const existing = new Set(rows.map((r: any) => r.id));
        const { data } = await sb.from("brain_learnings")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5);
        const extra = (data || []).filter((r: any) => !existing.has(r.id));
        rows = [...rows, ...extra].slice(0, limit);
      }

      // Increment applied_count for returned learnings
      const ids = rows.map((r: any) => r.id);
      if (ids.length) {
        // Fire-and-forget — don't block the response
        sb.rpc("increment_learning_applied", { ids }).catch(() => {});
        // Fallback if RPC doesn't exist — update individually
        for (const id of ids.slice(0, 3)) {
          sb.from("brain_learnings")
            .update({ applied_count: sb.rpc as any, updated_at: new Date().toISOString() })
            .eq("id", id).catch(() => {});
        }
      }

      return res.status(200).json({ success: true, learnings: rows });
    }

    // ══ GET ALL ══════════════════════════════════════════════════════
    if (action === "get_all") {
      const { project_id } = req.body;
      let q = sb.from("brain_learnings").select("*").order("created_at", { ascending: false });
      if (project_id) {
        // Get project-specific AND global learnings
        q = sb.from("brain_learnings").select("*")
          .or(`project_id.eq.${project_id},project_id.is.null`)
          .order("created_at", { ascending: false });
      }
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, learnings: data || [] });
    }

    // ══ DELETE ═══════════════════════════════════════════════════════
    if (action === "delete") {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });
      const { error } = await sb.from("brain_learnings").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    // ══ UPDATE ═══════════════════════════════════════════════════════
    if (action === "update") {
      const { id, improvement, tags } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });
      const { data, error } = await sb.from("brain_learnings").update({
        improvement:  improvement,
        tags:         tags,
        updated_at:   new Date().toISOString(),
      }).eq("id", id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, learning: data });
    }

    return res.status(400).json({ error: "Unknown action" });

  } catch (err: any) {
    console.error("[brain-learning] Fatal:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
