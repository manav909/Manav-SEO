/**
 * ai-cache.ts — Shared utility (zero serverless function slots consumed).
 *
 * CRITICAL FIX: Removed the redundant `const Anthropic = (await import(...)).default`
 * that existed INSIDE extractAndSaveLearning(). That dynamic import shadowed the
 * static top-level import and could fail at Vercel cold start, crashing every
 * API function that imports this module. Now uses the static import directly.
 */
import Anthropic            from "@anthropic-ai/sdk";
import { createClient }     from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );
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

    // --- FIX: use the statically-imported Anthropic directly, no dynamic import ---
    const anthropic = new Anthropic();

    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-5",
      max_tokens: 600,
      system:     "You extract precise, specific SEO learnings. Be concrete and actionable. Return only valid JSON.",
      messages: [{
        role: "user",
        content: [
          `Extract a structured SEO learning from this ${source} AI output.`,
          `Context: ${metadata.context_summary || source}`,
          metadata.project_name ? `Project: ${metadata.project_name}` : "",
          "",
          "OUTPUT TO LEARN FROM:",
          output.slice(0, 2800),
          "",
          "Return ONLY valid JSON:",
          `{"title":"Short title (max 8 words)","what_worked":["specific strength"],"what_missed":["specific gap"],"improvement":"One actionable sentence: next time do X to achieve Y","tags":["tag1","tag2"],"card_type":"technical|content|geo|competitive|insight|weekly|strategy|audit|general","confidence_score":75}`,
        ].filter(Boolean).join("\n"),
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
    const f = raw.indexOf("{"), l = raw.lastIndexOf("}");
    if (f === -1 || l === -1) return;

    let parsed: any = {};
    try { parsed = JSON.parse(raw.slice(f, l + 1)); } catch (_e) { return; }
    if (!parsed.improvement || !parsed.card_type) return;

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
