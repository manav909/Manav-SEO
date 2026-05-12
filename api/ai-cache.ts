/**
 * ai-cache.ts — Shared utility (no serverless handler — zero function slots consumed).
 * Imported by all API files for cache persistence and brain learning capture.
 *
 * Exports:
 *   saveToCache()           — persist AI output to ai_content_cache
 *   loadFromCache()         — retrieve cached content
 *   loadAllCache()          — bulk load cache by prefix
 *   hashInput()             — FNV-1a fingerprint for cache keys
 *   extractAndSaveLearning()— central brain learning capture from any AI output
 */
import Anthropic            from "@anthropic-ai/sdk";
import { createClient }     from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );
}

/* ─────────────────────────────────────────────────────────────────
   CACHE HELPERS (unchanged)
───────────────────────────────────────────────────────────────── */

export async function saveToCache(
  projectId: string,
  contentType: string,
  content: string,
  status: "partial" | "complete" = "complete",
  inputHash?: string
): Promise<void> {
  if (!projectId) return;
  try {
    const sb  = getSupabase();
    const row = {
      project_id:   projectId,
      content_type: contentType,
      content,
      status,
      input_hash:   inputHash || null,
      token_count:  Math.round(content.length / 4),
    };
    await sb.from("ai_content_cache")
      .upsert(row, { onConflict: "project_id,content_type" });
  } catch {
    // Cache failure must never break the main response
  }
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
      .eq("project_id", projectId)
      .eq("content_type", contentType)
      .single();
    return data || null;
  } catch {
    return null;
  }
}

export async function loadAllCache(
  projectId: string,
  prefix?: string
): Promise<Record<string, { content: string; status: string; updated_at: string }>> {
  if (!projectId) return {};
  try {
    const sb = getSupabase();
    let q = sb.from("ai_content_cache")
      .select("content_type,content,status,updated_at")
      .eq("project_id", projectId);
    if (prefix) q = q.like("content_type", `${prefix}%`);
    const { data } = await q;
    if (!data) return {};
    return Object.fromEntries(
      data.map((r: any) => [r.content_type, { content: r.content, status: r.status, updated_at: r.updated_at }])
    );
  } catch {
    return {};
  }
}

/** Simple FNV-1a hash for input fingerprinting */
export function hashInput(input: any): string {
  const str = JSON.stringify(input).slice(0, 2000);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}

/* ─────────────────────────────────────────────────────────────────
   MANAV BRAIN — CENTRAL LEARNING CAPTURE
   Called fire-and-forget from every AI generation point.
   NEVER blocks the main API response.
   Saves to brain_learnings with status='pending_review' so the user
   reviews and approves before learnings enter the AI prompt pipeline.
───────────────────────────────────────────────────────────────── */

export interface LearningMetadata {
  card_type?:       string;   // if known (technical, content, geo, etc.)
  card_title?:      string;   // descriptive title
  context_summary?: string;   // brief context of what generated this output
  project_name?:    string;   // for richer extraction prompts
}

export async function extractAndSaveLearning(
  source:    string,          // e.g. "task_execution_auto", "audit_streaming", "strategy_generation"
  projectId: string | null,
  output:    string,          // the AI-generated text to learn from
  metadata:  LearningMetadata = {}
): Promise<void> {
  // Guards — never run on trivial or error outputs
  if (!output || output.trim().length < 300)      return;
  if (output.startsWith("Error:"))                return;
  if (output.toLowerCase().startsWith("sorry"))   return;

  try {
    const sb = getSupabase();

    // Cap the pending queue at 25 per project to avoid overwhelming the review UI
    const { count } = await sb.from("brain_learnings")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review")
      .eq("project_id", projectId || "");

    if ((count ?? 0) >= 25) return;

    // Dedup: skip if a very similar learning from the same source was captured recently (48h)
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await sb.from("brain_learnings")
      .select("id")
      .eq("source", source)
      .eq("project_id", projectId || "")
      .gte("created_at", cutoff)
      .limit(1);
    if (recent && recent.length > 0) return;

    // Extract structured learning via Claude
    const anthropic  = new Anthropic();
    const outputSnip = output.slice(0, 2800);

    const extractPrompt = [
      `You are extracting a structured SEO learning from an AI-generated output.`,
      `Source system: ${source}`,
      `Context: ${metadata.context_summary || source}`,
      metadata.project_name ? `Project: ${metadata.project_name}` : "",
      ``,
      `OUTPUT TO LEARN FROM:`,
      outputSnip,
      ``,
      `Extract what this output did well, what it missed, and the single most important improvement for next time.`,
      ``,
      `Return ONLY valid JSON (no markdown, no preamble):`,
      `{`,
      `  "title": "Short descriptive title (max 8 words) for this learning",`,
      `  "what_worked": ["specific strength in this output — be precise"],`,
      `  "what_missed": ["specific gap or missing element — be precise"],`,
      `  "improvement": "One actionable sentence: next time, do X to achieve Y (be specific, not generic)",`,
      `  "tags": ["tag1","tag2","tag3"],`,
      `  "card_type": "technical|content|geo|competitive|insight|weekly|strategy|audit|general",`,
      `  "confidence_score": 75`,
      `}`,
    ].filter(Boolean).join("\n");

    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-5",
      max_tokens: 600,
      system:     "You extract precise, specific SEO learnings. Be concrete and actionable. Return only valid JSON.",
      messages:   [{ role: "user", content: extractPrompt }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
    const f   = raw.indexOf("{");
    const l   = raw.lastIndexOf("}");
    if (f === -1 || l === -1) return;

    let parsed: any = {};
    try { parsed = JSON.parse(raw.slice(f, l + 1)); } catch { return; }

    if (!parsed.improvement || !parsed.card_type) return;

    await sb.from("brain_learnings").insert({
      project_id:       projectId || null,
      card_type:        parsed.card_type      || "general",
      card_title:       parsed.title          || metadata.card_title || `${source} insight`,
      what_worked:      Array.isArray(parsed.what_worked)  ? parsed.what_worked  : [],
      what_missed:      Array.isArray(parsed.what_missed)  ? parsed.what_missed  : [],
      redo_reason:      null,
      improvement:      parsed.improvement,
      context_summary:  metadata.context_summary || source,
      tags:             Array.isArray(parsed.tags) ? parsed.tags : [source],
      source,
      applied_count:    0,
      status:           "pending_review",   // User must approve before it enters AI prompts
      auto_captured:    true,
      confidence_score: Math.min(100, Math.max(0, Number(parsed.confidence_score) || 75)),
      updated_at:       new Date().toISOString(),
    });

  } catch {
    // Completely silent — learning capture must NEVER break the main API response
  }
}
