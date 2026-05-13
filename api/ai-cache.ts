/**
 * ai-cache.ts — Shared utility (zero serverless function slots consumed).
 *
 * CRITICAL FIX: Removed the redundant `const Anthropic = (await import(...)).default`
 * that existed INSIDE extractAndSaveLearning(). That dynamic import shadowed the
 * static top-level import and could fail at Vercel cold start, crashing every
 * API function that imports this module. Now uses the static import directly.
 */
import { createClient }     from "@supabase/supabase-js";

function getSupabase() {
  /* Use placeholder URL so module NEVER throws on load even if env vars missing.
     Actual queries will fail with auth errors (caught inside handlers), not module crashes. */
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder";
  return createClient(url, key);
}

/* ─── CACHE HELPERS ─── */

export async function saveToCache(
  projectId: string,
  contentType: string,
  content: string,
  status: "partial" | "complete" = "complete",
  inputHash?: string
): Promise<void> {
  if (!projectId) return;
  try {
    const sb = getSupabase();
    await sb.from("ai_content_cache").upsert(
      { project_id: projectId, content_type: contentType, content, status,
        input_hash: inputHash || null, token_count: Math.round(content.length / 4) },
      { onConflict: "project_id,content_type" }
    );
  } catch (_e) { /* cache failure must never break main response */ }
}

export async function loadFromCache(
  projectId: string,
  contentType: string
): Promise<{ content: string; status: string; updated_at: string } | null> {
  if (!projectId) return null;
  try {
    const sb = getSupabase();
    const { data } = await sb.from("ai_content_cache")
      .select("content,status,updated_at")
      .eq("project_id", projectId).eq("content_type", contentType).single();
    return data || null;
  } catch (_e) { return null; }
}

export async function loadAllCache(
  projectId: string,
  prefix?: string
): Promise<Record<string, { content: string; status: string; updated_at: string }>> {
  if (!projectId) return {};
  try {
    const sb = getSupabase();
    let q: any = sb.from("ai_content_cache")
      .select("content_type,content,status,updated_at")
      .eq("project_id", projectId);
    if (prefix) q = q.like("content_type", `${prefix}%`);
    const { data } = await q;
    if (!data) return {};
    return Object.fromEntries(
      data.map((r: any) => [r.content_type, { content: r.content, status: r.status, updated_at: r.updated_at }])
    );
  } catch (_e) { return {}; }
}

export function hashInput(input: any): string {
  const str = JSON.stringify(input).slice(0, 2000);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}

/* ─── BRAIN LEARNING CAPTURE ─── */

export interface LearningMetadata {
  card_type?:       string;
  card_title?:      string;
  context_summary?: string;
  project_name?:    string;
}

export async function extractAndSaveLearning(
  source:    string,
  projectId: string | null,
  output:    string,
  metadata:  LearningMetadata = {}
): Promise<void> {
  // Guards: skip trivial, error, or empty outputs
  if (!output || output.trim().length < 300) return;
  if (output.startsWith("Error:"))            return;
  if (output.toLowerCase().startsWith("sorry")) return;

  try {
    const sb = getSupabase();

    // Cap pending queue at 25 per project
    try {
      const { count } = await sb.from("brain_learnings")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_review")
        .eq("project_id", projectId || "");
      if ((count ?? 0) >= 25) return;
    } catch (_e) {
      // If status column doesn't exist yet (migration not run), skip
      return;
    }

    // Dedup: same source in last 48h
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    try {
      const { data: recent } = await sb.from("brain_learnings")
        .select("id").eq("source", source).eq("project_id", projectId || "")
        .gte("created_at", cutoff).limit(1);
      if (recent && recent.length > 0) return;
    } catch (_e) { return; }

    // Fast heuristic extraction — no Claude call, <50ms, never causes timeouts
    const lines    = output.split("\n").filter(l => l.trim().length > 20);
    const firstLine = lines[0]?.slice(0, 80) || source;
    const cardType  = metadata.card_type ||
      (source.includes("technical") ? "technical" :
       source.includes("content")   ? "content"   :
       source.includes("geo")       ? "geo"        :
       source.includes("audit")     ? "technical"  :
       source.includes("competitive")? "competitive":
       "insight");

    // Extract key phrases as what_worked (lines with positive indicators)
    const positiveLines = lines.filter(l =>
      /improve|optim|strateg|recommend|should|increase|boost|rank|index|schema|fix|add|create|update/i.test(l)
    ).slice(0, 3).map(l => l.trim().slice(0, 120));

    // Extract gaps (lines with negative indicators)
    const gapLines = lines.filter(l =>
      /missing|lack|gap|issue|problem|error|slow|broken|no |not |without|poor|low/i.test(l)
    ).slice(0, 2).map(l => l.trim().slice(0, 120));

    const improvement = positiveLines[0] || lines.slice(1, 3).map(l => l.trim()).join(" | ").slice(0, 200) || "Review output for specific improvements";

    const parsed: any = {
      title:            (metadata.card_title || firstLine).slice(0, 60),
      what_worked:      positiveLines.length > 0 ? positiveLines : [`${source} completed`],
      what_missed:      gapLines.length > 0 ? gapLines : [],
      improvement:      improvement,
      tags:             [cardType, source.split("_")[0]].filter(Boolean),
      card_type:        cardType,
      confidence_score: positiveLines.length > 0 ? 70 : 55,
    };

    // Attempt insert with new columns; if migration not run, fall back gracefully
    const newRow: any = {
      project_id:      projectId || null,
      card_type:       parsed.card_type || "general",
      card_title:      parsed.title || metadata.card_title || `${source} insight`,
      what_worked:     Array.isArray(parsed.what_worked) ? parsed.what_worked : [],
      what_missed:     Array.isArray(parsed.what_missed) ? parsed.what_missed : [],
      redo_reason:     null,
      improvement:     parsed.improvement,
      context_summary: metadata.context_summary || source,
      tags:            Array.isArray(parsed.tags) ? parsed.tags : [source],
      source,
      applied_count:   0,
      updated_at:      new Date().toISOString(),
    };

    // Try with new columns first; fall back if migration not run
    try {
      await sb.from("brain_learnings").insert({
        ...newRow,
        status:           "pending_review",
        auto_captured:    true,
        confidence_score: Math.min(100, Math.max(0, Number(parsed.confidence_score) || 75)),
      });
    } catch (_e) {
      // Migration not run yet — insert without new columns
      try { await sb.from("brain_learnings").insert(newRow); } catch (_e) { /* silent */ }
    }

  } catch (_e) {
    // Completely silent — learning capture must NEVER break the main API response
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   saveToDesk — saves any Brain output to the brain_desk table.
   Fire-and-forget. Called from task-engine execute, intelligence, etc.
───────────────────────────────────────────────────────────────────────── */
export async function saveToDesk(
  projectId:   string | null,
  title:       string,
  content:     string,
  contentType: "text" | "report" | "code" | "analysis" | "audit" | "note",
  source:      string,
  tags:        string[] = []
): Promise<void> {
  if (!projectId || !content || content.length < 100) return;
  try {
    const sb = getSupabase();
    await sb.from("brain_desk").insert({
      project_id:   projectId,
      title:        title.slice(0, 200),
      content_type: contentType,
      content,
      source,
      tags:         [...tags, source].filter(Boolean),
      pinned:       false,
      metadata:     { auto_saved: true, saved_at: new Date().toISOString() },
      updated_at:   new Date().toISOString(),
    });
  } catch (_e) { /* silent — desk save must never break the caller */ }
}
