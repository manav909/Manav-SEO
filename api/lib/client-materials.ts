/* ════════════════════════════════════════════════════════════════
   api/lib/client-materials.ts

   BUILD 12.30 — Client materials ingestion.

   Lets the operator upload their own real work and the client's files —
   prior analysis, notes, GSC/Ads/Semrush exports, brand docs, anything —
   so the report engine can READ that real material and use it to deepen
   the audit and answer brief points the live engines cannot reach alone
   (especially when there is no GSC). The material is real source data,
   provided by the operator; the engine organises and interprets it. It
   does NOT invent — it grounds depth in what was actually uploaded.

   v1 ingests TEXT-bearing content (the frontend extracts text from
   .txt/.md/.csv/.json/.html and from a paste box). Binary documents
   (PDF/DOCX/images) need text extraction first — flagged honestly, not
   silently mis-read. Stored per project so every report can draw on it.

   Multi-tenant: projectId + the uploaded text only.
════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

export interface Material { filename: string; text: string; chars: number; ingested_at: string; }

const MAX_TOTAL_CHARS = 800000;   // storage cap across all materials for a project
const MAX_FILE_CHARS  = 600000;   // per-file (or per-chunk) cap

export async function ingestMaterials(opts: {
  projectId: string;
  files: Array<{ filename?: string; text: string }>;
  replace?: boolean;   // replace existing vs append
}): Promise<{ success: boolean; stored: number; total_chars: number; skipped: string[]; error?: string }> {
  const projectId = String(opts.projectId || "").trim();
  if (!projectId) return { success: false, stored: 0, total_chars: 0, skipped: [], error: "projectId required." };

  const incoming: Material[] = [];
  const skipped: string[] = [];
  for (const f of (opts.files || [])) {
    const text = String(f?.text || "");
    const name = String(f?.filename || "material.txt");
    /* Skip content that looks binary (mostly non-printable) — honest, not mis-read. */
    const sample = text.slice(0, 2000);
    const nonPrintable = (sample.match(/[\x00-\x08\x0e-\x1f]/g) || []).length;
    if (!text.trim()) { skipped.push(`${name} (empty)`); continue; }
    if (sample.length > 50 && nonPrintable / sample.length > 0.1) { skipped.push(`${name} (looks binary — extract text first)`); continue; }
    incoming.push({ filename: name, text: text.slice(0, MAX_FILE_CHARS), chars: Math.min(text.length, MAX_FILE_CHARS), ingested_at: new Date().toISOString() });
  }

  let existing: Material[] = opts.replace ? [] : await loadMaterials(projectId);
  let merged = [...existing, ...incoming];

  /* Enforce the total cap, newest first. */
  let total = 0;
  const capped: Material[] = [];
  for (const m of merged.slice().reverse()) { if (total + m.chars > MAX_TOTAL_CHARS) continue; capped.push(m); total += m.chars; }
  merged = capped.reverse();

  try {
    await db().from("project_knowledge").upsert({
      project_id: projectId, category: "materials", field_key: "client_materials",
      field_value: JSON.stringify(merged), source: "operator_upload", source_name: "client materials",
      data_date: new Date().toISOString().slice(0, 10), notes: "Operator/client-provided materials used to deepen reports.", updated_at: new Date().toISOString(),
    }, { onConflict: "project_id,category,field_key" });
    return { success: incoming.length > 0, stored: merged.length, total_chars: total, skipped };
  } catch (e: any) {
    return { success: false, stored: 0, total_chars: 0, skipped, error: e?.message || "store failed" };
  }
}

export async function loadMaterials(projectId: string): Promise<Material[]> {
  try {
    const { data } = await db().from("project_knowledge").select("field_value")
      .eq("project_id", projectId).eq("category", "materials").eq("field_key", "client_materials").maybeSingle();
    const v = JSON.parse((data as any)?.field_value || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export async function clearMaterials(projectId: string): Promise<{ success: boolean }> {
  try { await db().from("project_knowledge").delete().eq("project_id", projectId).eq("category", "materials").eq("field_key", "client_materials"); return { success: true }; }
  catch { return { success: false }; }
}

/* Concatenate materials for an LLM prompt, capped to a character budget. */
export function materialsForPrompt(materials: Material[], budget = 120000): { text: string; filenames: string[]; truncated: boolean } {
  const filenames = materials.map(m => m.filename);
  let out = ""; let truncated = false;
  for (const m of materials) {
    const block = `\n\n===== FILE: ${m.filename} =====\n${m.text}`;
    if (out.length + block.length > budget) { out += block.slice(0, Math.max(0, budget - out.length)); truncated = true; break; }
    out += block;
  }
  return { text: out.trim(), filenames, truncated };
}
