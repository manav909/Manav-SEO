/* ════════════════════════════════════════════════════════════════
   api/lib/pm-compare.ts

   Document Comparison engine.

   Takes two source documents (from any of four pools — saved client
   reports, uploaded attachments, workspace step/panel/pillar reports,
   or one-time ad-hoc uploads), and produces a layered comparison:

     1. STAKEHOLDER ACTION LIST — what someone reading the comparison
        must do, immediately. The "if I only read this, what changes
        about my work today" section.

     2. SEMANTIC SUMMARY — what changed in meaning, intent, and shape.
        Not just text edits — interpreted differences in numbers,
        recommendations, scope, deadlines, risk.

     3. MECHANICAL DIFF — line-by-line additions/removals computed
        client-side from the text representation. The receipts for the
        semantic claims above.

   Persists the result as a seo_campaign_reports row with
   pillar='comparison' so it shows up in the Documents view + is
   downloadable as Word doc through the existing export path.

   Multi-tenant: no hardcoded domains, keywords, or project identifiers.
   The operator's context supplies all project-specific framing.
════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

export type SourceRef =
  | { kind: "client_report"; report_id: string }
  | { kind: "workspace_report"; report_id: string }   // any seo_campaign_reports row
  | { kind: "attachment"; attachment_id: string }     // existing client_report_attachments
  | { kind: "step_report"; step_report_id: string }   // workspace step evidence
  | { kind: "ad_hoc"; file_name: string; content_type: string; file_b64: string; size_bytes: number };

interface LoadedDoc {
  label: string;
  origin: string;          // human-readable source line
  text: string;            // text body if available
  pdf_base64?: string;     // present when this doc is a PDF (passed natively)
  pdf_title?: string;
}

/* ─── Load a document by SourceRef ─────────────────────────────── */
async function loadDoc(ref: SourceRef, opts: { projectId: string }): Promise<LoadedDoc | { error: string }> {
  if (ref.kind === "client_report" || ref.kind === "workspace_report") {
    const { data, error } = await db().from("seo_campaign_reports")
      .select("id, title, body_md, pillar, created_at, project_id")
      .eq("id", ref.report_id).maybeSingle();
    if (error) return { error: `Could not load report: ${error.message}` };
    if (!data) return { error: "Report not found." };
    if ((data as any).project_id !== opts.projectId) return { error: "Report belongs to a different project." };
    return {
      label: (data as any).title || "Untitled report",
      origin: `${(data as any).pillar || "report"} · ${new Date((data as any).created_at).toLocaleDateString("en-GB")}`,
      text: (data as any).body_md || "",
    };
  }

  if (ref.kind === "step_report") {
    const { data, error } = await db().from("step_reports")
      .select("id, step_key, report_md, version, created_at, project_id")
      .eq("id", ref.step_report_id).maybeSingle();
    if (error) return { error: `Could not load step report: ${error.message}` };
    if (!data) return { error: "Step report not found." };
    if ((data as any).project_id !== opts.projectId) return { error: "Step report belongs to a different project." };
    return {
      label: `${(data as any).step_key}${((data as any).version || 1) > 1 ? ` (v${(data as any).version})` : ""}`,
      origin: `step evidence · ${new Date((data as any).created_at).toLocaleDateString("en-GB")}`,
      text: (data as any).report_md || "",
    };
  }

  if (ref.kind === "attachment") {
    const { data, error } = await db().from("client_report_attachments")
      .select("id, file_name, content_type, extracted_text, pdf_base64, parse_status, created_at, project_id")
      .eq("id", ref.attachment_id).maybeSingle();
    if (error) return { error: `Could not load attachment: ${error.message}` };
    if (!data) return { error: "Attachment not found." };
    if ((data as any).project_id !== opts.projectId) return { error: "Attachment belongs to a different project." };
    const a = data as any;
    return {
      label: a.file_name || "Attachment",
      origin: `uploaded ${a.content_type || "file"} · ${new Date(a.created_at).toLocaleDateString("en-GB")}`,
      text: a.extracted_text || "",
      pdf_base64: a.pdf_base64 || undefined,
      pdf_title: a.pdf_base64 ? a.file_name : undefined,
    };
  }

  if (ref.kind === "ad_hoc") {
    // Parse the just-uploaded file inline. Mirrors client-report-uploads.ts
    // parsing logic but doesn't persist to storage — this is a transient
    // upload only for this comparison.
    const isPdf = /pdf$/i.test(ref.content_type || "") || /\.pdf$/i.test(ref.file_name || "");
    if (isPdf) {
      return {
        label: ref.file_name || "Uploaded PDF",
        origin: `ad-hoc upload · ${Math.round((ref.size_bytes || 0) / 1024)} KB`,
        text: "",
        pdf_base64: ref.file_b64,
        pdf_title: ref.file_name,
      };
    }
    // Non-PDF: parse to text inline
    const buffer = Buffer.from(ref.file_b64, "base64");
    let text = "";
    try {
      if (/wordprocessingml/i.test(ref.content_type) || /\.docx$/i.test(ref.file_name)) {
        const mammoth: any = await import("mammoth");
        const res = await mammoth.default.convertToMarkdown({ buffer });
        text = String(res.value || "");
      } else if (/spreadsheetml|excel/i.test(ref.content_type) || /\.xlsx?$/i.test(ref.file_name)) {
        const XLSX: any = await import("xlsx");
        const wb = XLSX.read(buffer, { type: "buffer" });
        const parts: string[] = [];
        for (const name of (wb.SheetNames || [])) {
          parts.push(`## Sheet: ${name}`);
          parts.push(XLSX.utils.sheet_to_csv(wb.Sheets[name]));
        }
        text = parts.join("\n\n");
      } else if (/csv/i.test(ref.content_type) || /\.csv$/i.test(ref.file_name)) {
        text = buffer.toString("utf8");
      } else {
        // Default to text decode — handles md, txt, html, json
        text = buffer.toString("utf8");
      }
    } catch (e: any) {
      return { error: `Could not parse ${ref.file_name}: ${e?.message || "unknown error"}` };
    }
    return {
      label: ref.file_name || "Uploaded file",
      origin: `ad-hoc upload · ${Math.round((ref.size_bytes || 0) / 1024)} KB`,
      text: text.slice(0, 100_000),
    };
  }

  return { error: "Unknown document source type." };
}

/* ─── Mechanical text diff (LCS-based) ─────────────────────────── */
/* Produces a unified-style diff between two text blocks. Used for the
   bottom "receipts" section of the comparison output, so the operator
   can verify the AI's semantic claims against actual textual changes. */
function computeDiff(aText: string, bText: string): string {
  const aLines = aText.split(/\r?\n/);
  const bLines = bText.split(/\r?\n/);
  const N = aLines.length, M = bLines.length;
  // Cap on input size — diff is O(NM) memory. Above ~3000 lines each side
  // the table gets huge and slow. Diff a sample for very long inputs.
  const MAX_LINES = 3000;
  if (N > MAX_LINES || M > MAX_LINES) {
    return `_Diff omitted — both documents have ${N} and ${M} lines respectively, exceeding the ${MAX_LINES}-line per-side limit. The semantic summary above is based on the full content; only the line-by-line receipts are skipped here._`;
  }

  // Standard LCS table
  const lcs: number[][] = Array(N + 1).fill(null).map(() => Array(M + 1).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      lcs[i + 1][j + 1] = aLines[i] === bLines[j]
        ? lcs[i][j] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  // Walk the table backwards to produce the diff
  const out: string[] = [];
  let i = N, j = M;
  const reversed: Array<{ op: "ctx" | "add" | "del"; line: string }> = [];
  while (i > 0 && j > 0) {
    if (aLines[i - 1] === bLines[j - 1]) {
      reversed.push({ op: "ctx", line: aLines[i - 1] });
      i--; j--;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      reversed.push({ op: "del", line: aLines[i - 1] });
      i--;
    } else {
      reversed.push({ op: "add", line: bLines[j - 1] });
      j--;
    }
  }
  while (i > 0) { reversed.push({ op: "del", line: aLines[i - 1] }); i--; }
  while (j > 0) { reversed.push({ op: "add", line: bLines[j - 1] }); j--; }
  reversed.reverse();

  // Group into hunks with context to keep output readable. Skip long
  // runs of unchanged lines.
  const CONTEXT = 2;
  let lastChangeIdx = -1;
  for (let k = 0; k < reversed.length; k++) if (reversed[k].op !== "ctx") { lastChangeIdx = k; break; }
  if (lastChangeIdx === -1) return "_No differences in text content._";

  let lastOutIdx = -CONTEXT - 1;
  for (let k = 0; k < reversed.length; k++) {
    const e = reversed[k];
    if (e.op !== "ctx") {
      if (k - lastOutIdx > 2 * CONTEXT + 1 && lastOutIdx >= 0) out.push("…");
      const start = Math.max(lastOutIdx + 1, k - CONTEXT);
      for (let m = start; m < k; m++) {
        const c = reversed[m];
        if (c.op === "ctx") out.push("  " + c.line);
      }
      out.push((e.op === "add" ? "+ " : "- ") + e.line);
      lastOutIdx = k;
    } else if (k - lastOutIdx <= CONTEXT) {
      out.push("  " + e.line);
      lastOutIdx = k;
    }
  }
  return out.join("\n");
}

/* ─── Main entry — compare two docs and persist the result ────── */
export async function compareDocs(opts: {
  projectId: string;
  campaignId?: string;
  docA: SourceRef;
  docB: SourceRef;
  /** Operator context — what kind of comparison is this for, who's the
      reader, what should we emphasise. Optional but recommended. */
  context?: string;
  /** Persist the comparison as a seo_campaign_reports row. Default true. */
  save?: boolean;
}): Promise<{ success: boolean; comparison_id?: string; title?: string; body_md?: string; error?: string }> {
  if (!opts.projectId) return { success: false, error: "projectId required" };
  if (!ANTHROPIC_API_KEY) return { success: false, error: "ANTHROPIC_API_KEY missing." };

  const a = await loadDoc(opts.docA, { projectId: opts.projectId });
  if ("error" in a) return { success: false, error: `Document A: ${a.error}` };
  const b = await loadDoc(opts.docB, { projectId: opts.projectId });
  if ("error" in b) return { success: false, error: `Document B: ${b.error}` };

  // Compute the mechanical diff up front — saves an LLM token vs. asking
  // it to do this poorly, and gives the operator deterministic receipts.
  const diffText = (a.text && b.text) ? computeDiff(a.text, b.text) : "_Mechanical text diff is not available — one or both documents are PDFs and have no text representation to diff against. The semantic comparison below is based on the model reading each PDF natively._";

  const system = `You are a senior advisor preparing a comparison briefing between two documents for a stakeholder who must act on what they read.

Your output has THREE sections, in this order of priority:

1. STAKEHOLDER ACTION LIST — the most important section. List ONLY the things that someone reading this comparison must DO, decide, or escalate. Each item should be a concrete action with the WHY embedded. If nothing demands action, say so honestly — do not invent action items to pad the list.

2. SEMANTIC SUMMARY — what changed in meaning, intent, or substance between A and B. This goes beyond text differences: numbers that shifted up/down (with the actual values), recommendations that softened or hardened, scope that expanded or narrowed, deadlines that moved, risks that emerged or resolved, stakeholders that came in or out, anything where the SAME line means a different thing now. Be specific: cite the actual text or figures.

3. KEY DELTAS — a structured table of the most consequential differences. Each row: what changed, where (section reference if findable), why it matters in one sentence. Prefer 5-15 high-signal rows over 30 trivial ones.

ABSOLUTE RULES:
- Never invent facts not present in either document. If a number isn't there, do not estimate it.
- Distinguish "added in B / removed from A / changed value" cleanly. If you're not sure which, say so.
- Match the operator's context: if they say "this is for a board meeting" the action list should be board-appropriate; if "this is for an engineer" the language goes technical.
- Never use internal vocabulary like "pillar", "scientist", "workspace", "step evidence", "lab" — this output is read by stakeholders, not by the internal system.

OUTPUT FORMAT — return ONLY this JSON, no prose around it:
{
  "title": "Concise title for this comparison (e.g. 'Q3 Report v1 vs v2 — comparison')",
  "summary": "1-2 sentence framing of what's being compared and the headline takeaway",
  "stakeholder_actions": [
    { "action": "Concrete thing to do or decide", "why": "Why it matters in one sentence", "priority": "high" | "medium" | "low" }
  ],
  "semantic_summary": "Markdown prose covering substantive changes in meaning. Use sub-headings if helpful. Reference specific text or figures.",
  "key_deltas": [
    { "what_changed": "Description of the change", "where": "Section or location, if findable, or null", "why_it_matters": "One sentence on consequence" }
  ],
  "operator_notes": "Things the operator should know but stakeholders shouldn't: anything ambiguous, anything you flagged as 'unclear', anything that would change with more context"
}`;

  const docAHeader = `## DOCUMENT A — ${a.label}\n_Source: ${a.origin}_\n`;
  const docBHeader = `## DOCUMENT B — ${b.label}\n_Source: ${b.origin}_\n`;

  // Build the user message — PDFs go as native document blocks; text goes inline.
  const userContent: any[] = [];
  if (a.pdf_base64) {
    userContent.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.pdf_base64 }, title: `Document A: ${a.pdf_title || a.label}` });
  }
  if (b.pdf_base64) {
    userContent.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b.pdf_base64 }, title: `Document B: ${b.pdf_title || b.label}` });
  }

  const operatorCtxBlock = opts.context && opts.context.trim().length
    ? `\n## OPERATOR CONTEXT (use to shape tone, emphasis, and audience of the comparison)\n"""\n${opts.context.trim()}\n"""\n`
    : "";

  let userText = `Compare these two documents.\n${operatorCtxBlock}\n`;
  if (a.text) userText += `\n${docAHeader}\n\`\`\`\n${a.text.slice(0, 60000)}\n\`\`\`\n`;
  else if (a.pdf_base64) userText += `\n${docAHeader}\n_See attached PDF for Document A._\n`;
  if (b.text) userText += `\n${docBHeader}\n\`\`\`\n${b.text.slice(0, 60000)}\n\`\`\`\n`;
  else if (b.pdf_base64) userText += `\n${docBHeader}\n_See attached PDF for Document B._\n`;
  userText += `\n---\nProduce the comparison as JSON. The stakeholder action list is the most important section — be specific, be honest, never invent.`;
  userContent.push({ type: "text", text: userText });

  // Anthropic call with retry-with-backoff for transient overloads
  const RETRYABLE = new Set([429, 503, 529]);
  let raw = ""; let attempts = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, attempt === 2 ? 1000 : 4000));
    attempts = attempt;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 240_000);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: controller.signal,
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 12000, system, messages: [{ role: "user", content: userContent }] }),
      });
      clearTimeout(timer);
      if (r.ok) {
        const d = await r.json();
        raw = (d?.content || []).filter((blk: any) => blk.type === "text").map((blk: any) => blk.text).join("\n");
        break;
      }
      if (!RETRYABLE.has(r.status) || attempt === 3) {
        const t = await r.text().catch(() => "");
        console.error(`[pm-compare] LLM ${r.status}: ${t.slice(0, 300)}`);
        return { success: false, error: `Comparison call failed (HTTP ${r.status}). ${RETRYABLE.has(r.status) ? "Anthropic is overloaded after 3 retries — wait 30-60s and try again." : t.slice(0, 200)}` };
      }
      console.warn(`[pm-compare] attempt ${attempt}/3 got HTTP ${r.status}. Retrying...`);
    } catch (e: any) {
      clearTimeout(timer);
      if (attempt === 3 || controller.signal.aborted) {
        console.error(`[pm-compare] exc ${e?.message}`);
        return { success: false, error: controller.signal.aborted ? "Comparison timed out after 240 seconds. Try with shorter documents." : `Comparison failed: ${e?.message}` };
      }
    }
  }
  if (!raw) return { success: false, error: "Comparison returned empty output." };

  // Parse JSON with repair
  let parsed: any = null;
  try {
    let clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const first = clean.indexOf("{");
    if (first >= 0) clean = clean.slice(first);
    try { parsed = JSON.parse(clean); } catch {
      const last = clean.lastIndexOf("}");
      if (last > 0) { try { parsed = JSON.parse(clean.slice(0, last + 1)); } catch { /* fall through */ } }
    }
  } catch { /* fall through */ }
  if (!parsed || !parsed.semantic_summary) {
    console.error(`[pm-compare] could not parse comparison output. raw head: ${raw.slice(0, 300)}`);
    return { success: false, error: "Model did not return a valid comparison structure. Try again or with different context." };
  }

  // Render the body_md
  const body_md = renderComparison({
    title: parsed.title || `Comparison · ${a.label} vs ${b.label}`,
    summary: parsed.summary || "",
    docA_origin: `${a.label} — ${a.origin}`,
    docB_origin: `${b.label} — ${b.origin}`,
    stakeholder_actions: Array.isArray(parsed.stakeholder_actions) ? parsed.stakeholder_actions : [],
    semantic_summary: String(parsed.semantic_summary || ""),
    key_deltas: Array.isArray(parsed.key_deltas) ? parsed.key_deltas : [],
    diff: diffText,
  });

  // Persist as a seo_campaign_reports row (unless save:false)
  let comparison_id: string | undefined;
  if (opts.save !== false) {
    const row: any = {
      project_id:       opts.projectId,
      campaign_id:      opts.campaignId || null,
      pillar:           "comparison",
      report_kind:      "comparison",
      generated_by:     "manual",
      llm_calls_used:   attempts,
      web_searches_used: 0,
      title:            parsed.title || `Comparison · ${a.label} vs ${b.label}`,
      body_md,
      confidence_rating: "high",
      data_sources:     [a.origin, b.origin].filter(Boolean),
      llm_summary:      parsed.summary || "",
      operator_notes:   parsed.operator_notes || "",
    };
    let { data: inserted, error } = await db().from("seo_campaign_reports").insert(row).select("id").single();
    if (error) {
      // Constraint or missing-column fallback: retry with minimal columns
      const minimalRow = {
        project_id: opts.projectId, campaign_id: opts.campaignId || null,
        pillar: "comparison", report_kind: "comparison", generated_by: "manual",
        llm_calls_used: attempts, web_searches_used: 0,
        title: row.title, body_md,
      };
      const retry = await db().from("seo_campaign_reports").insert(minimalRow).select("id").single();
      if (retry.error) {
        console.error(`[pm-compare] failed to persist comparison: ${retry.error.message}. Raw row dropped — returning result in-memory only.`);
        return { success: true, title: row.title, body_md, error: `Saved in memory only — could not persist (${retry.error.message}). Run the Build 11 migration if you have not yet.` };
      }
      inserted = retry.data;
    }
    comparison_id = (inserted as any)?.id;
  }

  return { success: true, comparison_id, title: parsed.title || undefined, body_md };
}

/* ─── Render the markdown body ─────────────────────────────────── */
function renderComparison(opts: {
  title: string;
  summary: string;
  docA_origin: string;
  docB_origin: string;
  stakeholder_actions: Array<{ action: string; why?: string; priority?: string }>;
  semantic_summary: string;
  key_deltas: Array<{ what_changed: string; where?: string | null; why_it_matters?: string }>;
  diff: string;
}): string {
  const L: string[] = [];
  L.push(`# ${opts.title}\n`);
  if (opts.summary) L.push(`${opts.summary}\n`);
  L.push(`**Document A:** ${opts.docA_origin}  `);
  L.push(`**Document B:** ${opts.docB_origin}\n`);
  L.push(`---\n`);

  // 1. Stakeholder action list
  L.push(`## Stakeholder action list\n`);
  if (!opts.stakeholder_actions.length) {
    L.push(`_No actions identified — the differences between these documents do not appear to require immediate stakeholder action._\n`);
  } else {
    const byPriority = (p?: string) => p === "high" ? 0 : p === "medium" ? 1 : 2;
    const sorted = [...opts.stakeholder_actions].sort((a, b) => byPriority(a.priority) - byPriority(b.priority));
    for (const a of sorted) {
      const pTag = a.priority ? `**[${a.priority.toUpperCase()}]** ` : "";
      L.push(`- ${pTag}${a.action}${a.why ? ` — _${a.why}_` : ""}`);
    }
    L.push("");
  }

  // 2. Semantic summary
  L.push(`## Semantic summary — what actually changed\n`);
  L.push(opts.semantic_summary);
  L.push("");

  // 3. Key deltas table
  if (opts.key_deltas.length) {
    L.push(`## Key deltas\n`);
    L.push(`| What changed | Where | Why it matters |`);
    L.push(`| --- | --- | --- |`);
    for (const d of opts.key_deltas) {
      const what = String(d.what_changed || "").replace(/\|/g, "\\|");
      const where = d.where ? String(d.where).replace(/\|/g, "\\|") : "—";
      const why = String(d.why_it_matters || "").replace(/\|/g, "\\|");
      L.push(`| ${what} | ${where} | ${why} |`);
    }
    L.push("");
  }

  // 4. Mechanical diff — receipts
  L.push(`## Mechanical text diff — receipts\n`);
  L.push(`_Computed line-by-line. \`+\` = added in B, \`-\` = removed from A, plain = unchanged context._\n`);
  L.push("```diff");
  L.push(opts.diff);
  L.push("```");

  return L.join("\n");
}

/* ─── List candidate docs for the picker ───────────────────────── */
/* Returns all documents the operator can compare for a given project,
   unified across the four pools, sorted newest first. */
export async function listComparableDocs(projectId: string): Promise<{ success: boolean; items: Array<{ kind: string; id: string; label: string; sublabel: string; created_at: string }>; error?: string }> {
  if (!projectId) return { success: false, items: [], error: "projectId required" };
  const items: Array<{ kind: string; id: string; label: string; sublabel: string; created_at: string }> = [];

  // 1) seo_campaign_reports for this project (all pillars including client_report + comparison)
  try {
    const { data: reports } = await db().from("seo_campaign_reports")
      .select("id, title, pillar, created_at")
      .eq("project_id", projectId).order("created_at", { ascending: false }).limit(100);
    for (const r of ((reports || []) as any[])) {
      const isClient = String(r.pillar || "").toLowerCase() === "client_report";
      const isCmp = String(r.pillar || "").toLowerCase() === "comparison";
      items.push({
        kind: isClient ? "client_report" : "workspace_report",
        id: r.id,
        label: r.title || `${r.pillar || "report"} · untitled`,
        sublabel: `${isCmp ? "comparison" : isClient ? "client report" : r.pillar || "report"} · ${new Date(r.created_at).toLocaleDateString("en-GB")}`,
        created_at: r.created_at,
      });
    }
  } catch { /* graceful — table may have schema variance */ }

  // 2) client_report_attachments — uploaded reference files
  try {
    const { data: atts } = await db().from("client_report_attachments")
      .select("id, file_name, content_type, parse_status, created_at")
      .eq("project_id", projectId).order("created_at", { ascending: false }).limit(100);
    for (const a of ((atts || []) as any[])) {
      items.push({
        kind: "attachment",
        id: a.id,
        label: a.file_name || "Attachment",
        sublabel: `uploaded ${a.content_type || "file"} · ${new Date(a.created_at).toLocaleDateString("en-GB")}${a.parse_status && a.parse_status !== "ok" ? ` · ${a.parse_status}` : ""}`,
        created_at: a.created_at,
      });
    }
  } catch { /* graceful */ }

  // 3) step_reports — workspace evidence
  try {
    const { data: steps } = await db().from("step_reports")
      .select("id, step_key, version, created_at")
      .eq("project_id", projectId).order("created_at", { ascending: false }).limit(100);
    for (const s of ((steps || []) as any[])) {
      items.push({
        kind: "step_report",
        id: s.id,
        label: `${s.step_key}${(s.version || 1) > 1 ? ` (v${s.version})` : ""}`,
        sublabel: `workspace evidence · ${new Date(s.created_at).toLocaleDateString("en-GB")}`,
        created_at: s.created_at,
      });
    }
  } catch { /* graceful */ }

  items.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return { success: true, items };
}
