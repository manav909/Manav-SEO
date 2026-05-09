/**
 * Shared cache utility — used by all streaming APIs to persist generated content.
 * Saves to ai_content_cache table so nothing is ever lost.
 */
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );
}

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
    const row = {
      project_id:   projectId,
      content_type: contentType,
      content,
      status,
      input_hash:   inputHash || null,
      token_count:  Math.round(content.length / 4), // rough token estimate
    };
    // Upsert so re-runs overwrite cleanly
    await sb.from("ai_content_cache")
      .upsert(row, { onConflict: "project_id,content_type" });
  } catch {
    // Silent — cache failure must never break the main response
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
    return Object.fromEntries(data.map((r: any) => [r.content_type, { content: r.content, status: r.status, updated_at: r.updated_at }]));
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
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}
