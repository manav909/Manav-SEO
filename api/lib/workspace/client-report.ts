/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/client-report.ts

   THE CLIENT REPORT PILLAR — communicates, doesn't investigate.

   Consumes the workspace's verified outputs (step evidence + panel
   discussion + all 7 analytical pillar reports) and produces a single
   client-ready deliverable. Shape is dictated by the operator's context
   message (what THIS client wants in THIS report at THIS moment), not
   by a fixed schema. Optional reference paste lets the operator either
   match an existing report's structure or feed in additional data.

   DISCIPLINE: same as every other pillar — every claim sources back to
   workspace evidence or to the operator's pasted reference. No
   invention, no synthesis-as-fact. The pillar refuses to write claims
   it cannot ground.

   Project-agnostic throughout; reads project_id + run_id and pulls
   everything it needs from those.
════════════════════════════════════════════════════════════════ */

import { db } from "../db.js";
import { llm } from "./llm.js";
import { resolveTargetUrls } from "./shared.js";

const norm = (u: string) => (u || "").replace(/\/$/, "").toLowerCase();

interface ClientReportOpts {
  runId?: string;
  projectId: string;
  campaignId?: string;
  /** Free-text instructions from the operator: client name, what they asked
      for, tone, format, emphasis. The shape-determining input. */
  manavContext: string;
  /** Optional pasted reference content (sample report, client brief, additional
      data) and how to use it. */
  referenceText?: string;
  referenceMode?: "template" | "data" | "both";
  /** Optional status callback for live UI updates during the call. */
  onStatus?: (s: string) => Promise<void>;
}

interface ClientReportResult {
  success: boolean;
  report_id?: string;
  error?: string;
}

/* ─── Load every relevant artefact from the workspace for this run ───── */
async function loadWorkspaceContext(runId: string, projectId: string): Promise<{
  project_domain: string;
  target_urls: string[];
  goal: string;
  step_summaries: Array<{ step_key: string; version: number; report_md: string; worth_deeper: string[] }>;
  panel_rounds: Array<{ round: number; document_md: string; manav_input?: string }>;
  pillar_findings: Array<{ pillar: string; title: string; body_md: string; created_at: string }>;
}> {
  // Project domain + targets — anchor every claim against the right site.
  const { urls } = await resolveTargetUrls(undefined, projectId);
  const project_domain = (() => { try { return new URL(urls[0] || "").hostname.replace(/^www\./, ""); } catch { return ""; } })();

  const { data: run } = await db().from("workspace_runs").select("goal, created_at").eq("id", runId).maybeSingle();
  const goal = (run as any)?.goal || "improve organic search performance";
  const runStart = (run as any)?.created_at || new Date(0).toISOString();

  // Latest version per step
  const { data: stepRows } = await db().from("step_reports")
    .select("step_key, report_md, worth_deeper_json, version, created_at").eq("run_id", runId)
    .order("step_key").order("version", { ascending: false });
  const latestSteps: Record<string, any> = {};
  for (const r of ((stepRows || []) as any[])) { if (!latestSteps[r.step_key]) latestSteps[r.step_key] = r; }
  const step_summaries = Object.values(latestSteps).map((s: any) => ({
    step_key: s.step_key, version: s.version || 1, report_md: s.report_md || "",
    worth_deeper: s.worth_deeper_json || [],
  }));

  // All panel rounds for this run (most recent first)
  const { data: panelRows } = await db().from("panel_sessions")
    .select("round, document_md, manav_input_md").eq("run_id", runId)
    .order("round", { ascending: true });
  const panel_rounds = ((panelRows || []) as any[]).map(p => ({
    round: p.round, document_md: p.document_md || "", manav_input: p.manav_input_md || undefined,
  }));

  // All pillar findings written during this run window (latest per pillar)
  const { data: reportRows } = await db().from("seo_campaign_reports")
    .select("pillar, title, body_md, created_at").eq("project_id", projectId)
    .in("report_kind", ["deep_analysis", "manual_refresh"])
    .gte("created_at", runStart)
    .order("created_at", { ascending: false });
  const seen = new Set<string>();
  const pillar_findings: Array<{ pillar: string; title: string; body_md: string; created_at: string }> = [];
  for (const r of ((reportRows || []) as any[])) {
    if (r.pillar === "client_report") continue;  // never feed prior client reports back in
    if (seen.has(r.pillar)) continue;
    seen.add(r.pillar);
    pillar_findings.push({ pillar: r.pillar, title: r.title || r.pillar, body_md: r.body_md || "", created_at: r.created_at });
  }

  return { project_domain, target_urls: urls, goal, step_summaries, panel_rounds, pillar_findings };
}

/* ─── Skim helper — compact step/pillar bodies before passing to LLM.
       Same shape as the panel skim — drops markdown table rows that aren't
       essential to a communication-purpose pillar. Pillar findings stay
       fuller since they're the primary input. ───────────────────────── */
function skim(md: string, maxLen: number): string {
  if (!md) return "";
  const lines = md.split("\n");
  const kept: string[] = [];
  let inTable = false, droppedTableRows = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("|") && t.endsWith("|")) { inTable = true; droppedTableRows++; continue; }
    if (inTable && t === "") {
      inTable = false;
      if (droppedTableRows > 2) kept.push(`_…(${droppedTableRows} table rows omitted; full detail in source report)…_`);
      droppedTableRows = 0;
      continue;
    }
    inTable = false;
    kept.push(line);
    if (kept.join("\n").length > maxLen) { kept.push("_…(truncated)…_"); break; }
  }
  return kept.join("\n");
}

/* ─── Main entry — generate one client report ──────────────────────── */
export async function solveClientReport(opts: ClientReportOpts): Promise<ClientReportResult> {
  const status = async (s: string) => { try { await opts.onStatus?.(`client_report: ${s}`); } catch { /* non-fatal */ } };

  if (!opts.runId) return { success: false, error: "Client Report requires a workspace run — start by running the deep steps and at least one analytical pillar." };
  if (!opts.manavContext || opts.manavContext.trim().length < 5) {
    return { success: false, error: "Client Report needs your context — at minimum, tell it who the client is and what they want in this report." };
  }

  await status("loading workspace evidence");
  const ctx = await loadWorkspaceContext(opts.runId, opts.projectId);

  if (!ctx.pillar_findings.length && !ctx.step_summaries.length) {
    return { success: false, error: "No workspace evidence yet — run the deep steps and at least one analytical pillar before generating a client report." };
  }

  // Build the input dossier the LLM will see. Pillar findings first
  // (primary source), then panel context (the strategic discussion), then
  // step summaries (the raw verified data).
  const pillarsBlock = ctx.pillar_findings.length
    ? ctx.pillar_findings.map(p => `### Pillar: ${p.pillar}\n${skim(p.body_md, 5000)}`).join("\n\n---\n\n")
    : "_(No analytical pillars solved yet in this run.)_";

  const panelBlock = ctx.panel_rounds.length
    ? ctx.panel_rounds.map(p => `### Panel Round ${p.round}\n${skim(p.document_md, 3500)}${p.manav_input ? `\n\n**Operator input incorporated:**\n${p.manav_input}` : ""}`).join("\n\n---\n\n")
    : "_(No panel discussion yet.)_";

  const stepsBlock = ctx.step_summaries.length
    ? ctx.step_summaries.map(s => `### Step: ${s.step_key}${s.version > 1 ? ` (v${s.version})` : ""}\n${skim(s.report_md, 3000)}\n\n**Flagged for deeper investigation:**\n${(s.worth_deeper || []).map(w => `- ${w}`).join("\n") || "- (none)"}`).join("\n\n---\n\n")
    : "_(No step evidence yet.)_";

  // Reference paste handling — three modes
  let referenceBlock = "";
  if (opts.referenceText && opts.referenceText.trim().length > 10) {
    const mode = opts.referenceMode || "both";
    const role = mode === "template" ? "Use this reference as the STRUCTURAL TEMPLATE — match its sections, tone, and shape. Fill it with facts drawn from this workspace's evidence, never with facts from the reference unless the operator has explicitly noted them as the client's own data."
      : mode === "data" ? "Use this reference as AN ADDITIONAL SOURCE OF FACTS — treat its claims as verified data the client has provided (e.g. client survey results, third-party audit findings, internal metrics). Cite this reference inline alongside workspace sources when used."
      : "Use this reference BOTH as structural template AND as an additional source of facts. Honor its shape; treat its claims as additional verified data from the client. Cite this reference inline when its facts are used.";
    referenceBlock = `\n\n## Reference material the operator has provided\n\n_${role}_\n\n\`\`\`\n${opts.referenceText.slice(0, 8000)}\n\`\`\`\n`;
  }

  await status("composing the client deliverable");

  const system = `You are a Senior Client Communications specialist preparing a report for a client. You do not investigate — the workspace pillars and panel have already done that. Your job is to communicate the findings to this specific client, in the shape this specific client wants.

PROJECT CONTEXT (use these exact facts; do not invent project details):
- Domain: ${ctx.project_domain || "(see evidence)"}
- Goal of this engagement: ${ctx.goal}
- Pages in scope: ${ctx.target_urls.length}

ABSOLUTE RULES — non-negotiable:
- Every figure, claim, or recommendation in your report must trace to a specific source in the workspace evidence or the operator's reference material. Cite the source inline, e.g. "(source: On-Page Health pillar)" or "(source: GSC Visibility step v2)".
- Never invent numbers, never paraphrase a finding into a stronger claim than the evidence supports.
- If the operator's context asks you to communicate something the evidence does not support, DO NOT write it as fact. Either omit it or flag it transparently as "unverified — please confirm with [source]".
- This report will be read by a real client who is making real decisions. Stakes are high. Soft, accurate, transparent beats bold and unverified.

SHAPE — read the operator's context carefully and produce the report in the shape they request:
- If they specify a format (executive summary, monthly review, audit recap, etc.), use that format.
- If they paste reference material with mode=template, match the reference's structure.
- If they don't specify, default to: (1) brief executive summary, (2) what we found (3-5 sourced headline findings), (3) what we recommend (3-5 prioritised actions with effort + impact), (4) what's next (90-day plan), (5) appendix of sources.

TONE — match what the operator specifies. If unspecified, use a calm, professional, advisor-to-client register. Avoid jargon when the operator says the client isn't technical. Never use words like "scientist" or "lab" — this is a client deliverable, not an internal artifact.

OUTPUT FORMAT: respond with ONLY this JSON (no prose around it, no fences):
{
  "title": "Self-identifying title for the report (e.g. 'Q2 SEO Review for <client>')",
  "summary": "1-2 sentence framing of what this report covers",
  "body_md": "the full report as markdown — this is what the client reads. Use whatever heading structure the operator's context implies. Be thorough but not bloated. Source every claim inline.",
  "operator_notes": "any honest concerns: claims you couldn't ground, places the operator should verify before sending, anything that needed softening because the evidence was thin. This is for the operator's eyes only — do not include in the body."
}`;

  let userPrompt = `OPERATOR CONTEXT — what this client wants in this report:\n"""\n${opts.manavContext.trim()}\n"""\n`;
  if (referenceBlock) userPrompt += referenceBlock;

  userPrompt += `\n\n## Workspace evidence — PILLAR FINDINGS (primary source)\n\n${pillarsBlock}\n\n## Panel discussion context\n\n${panelBlock}\n\n## Raw step evidence (for verification of specific figures)\n\n${stepsBlock}\n\n---\n\nProduce the client report now as JSON. Source every claim. Be honest in operator_notes about anything you couldn't ground.`;

  const raw = await llm({
    system, user: userPrompt,
    maxTokens: 8000, timeoutMs: 240_000, label: "client-report",
  });

  if (!raw) return { success: false, error: "Client Report generation returned empty (LLM timeout or error). Try with a tighter context or shorter reference material." };

  // Parse — accept either JSON or fall back to treating the whole response
  // as body markdown if the model produced prose despite instructions.
  let parsed: any = null;
  try {
    let clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const first = clean.indexOf("{");
    if (first >= 0) {
      clean = clean.slice(first);
      try { parsed = JSON.parse(clean); }
      catch {
        // Try one repair: trim to last brace
        const last = clean.lastIndexOf("}");
        if (last > 0) { try { parsed = JSON.parse(clean.slice(0, last + 1)); } catch { /* fall through */ } }
      }
    }
  } catch { /* fall through */ }

  // Graceful fallback if model produced prose
  if (!parsed || !parsed.body_md) {
    parsed = {
      title: `Client Report · ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`,
      summary: "Generated client report",
      body_md: raw,
      operator_notes: "Note: model did not produce structured JSON output; the body is the model's raw response. Review carefully before sending.",
    };
  }

  await status("saving");

  // Persist as a pillar report so it lives alongside the other reports in
  // Documents / Pillar Findings. pillar="client_report" identifies it.
  const reportTitle = (parsed.title ? String(parsed.title).slice(0, 250) : `Client Report · ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`);
  const body = String(parsed.body_md || "");
  const operatorNotes = parsed.operator_notes ? String(parsed.operator_notes).slice(0, 4000) : "";
  const bodyWithNotes = operatorNotes
    ? `${body}\n\n---\n\n## Operator notes _(internal — not for the client)_\n\n${operatorNotes}`
    : body;

  const row: any = {
    project_id: opts.projectId,
    campaign_id: opts.campaignId || null,
    pillar: "client_report",
    report_kind: "deep_analysis",
    title: reportTitle,
    summary: parsed.summary ? String(parsed.summary).slice(0, 500) : null,
    body_md: bodyWithNotes,
    confidence_rating: 0.9,
    generated_by: "manual",
    data_sources: ["pillar findings", "panel discussion", "step evidence", opts.referenceText ? "operator-provided reference" : null].filter(Boolean),
    llm_calls_used: 1,
    web_searches_used: 0,
    escalations_json: [],
  };

  let { data: inserted, error } = await db().from("seo_campaign_reports").insert(row).select("id").single();
  if (error && /escalations_json/i.test(error.message || "")) {
    const { escalations_json, ...rest } = row;
    const retry = await db().from("seo_campaign_reports").insert(rest).select("id").single();
    inserted = retry.data; error = retry.error;
  }
  if (error && /report_kind/i.test(error.message || "")) {
    const retry = await db().from("seo_campaign_reports").insert({ ...row, report_kind: "manual_refresh" }).select("id").single();
    inserted = retry.data; error = retry.error;
  }
  // Some deployments have a CHECK constraint on `pillar` — if so, surface
  // a clear error rather than failing silently.
  if (error && /pillar/i.test(error.message || "")) {
    return { success: false, error: `Could not save client report — your DB likely has a pillar CHECK constraint that doesn't allow 'client_report'. Drop or extend it: ALTER TABLE seo_campaign_reports DROP CONSTRAINT seo_campaign_panels_pillar_check; (or add client_report to the allowed list).` };
  }
  if (error) return { success: false, error: `Could not save client report: ${error.message}` };

  return { success: true, report_id: (inserted as any)?.id };
}
