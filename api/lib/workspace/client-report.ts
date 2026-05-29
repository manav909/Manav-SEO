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
import { clientReportLoadAttachments } from "./client-report-uploads.js";

const norm = (u: string) => (u || "").replace(/\/$/, "").toLowerCase();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

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
  /** Optional uploaded file attachment ids. PDFs are attached as native
      document blocks; DOCX/XLSX/CSV are passed as extracted markdown text. */
  attachmentIds?: string[];
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
    referenceBlock = `\n\n## Reference material the operator has provided (pasted text)\n\n_${role}_\n\n\`\`\`\n${opts.referenceText.slice(0, 8000)}\n\`\`\`\n`;
  }

  // Uploaded attachments — DOCX/XLSX/CSV become text blocks; PDFs are attached
  // as native Anthropic document blocks (handled in the API call below).
  const pdfAttachments: Array<{ file_name: string; pdf_base64: string }> = [];
  if (opts.attachmentIds && opts.attachmentIds.length) {
    await status(`loading ${opts.attachmentIds.length} attachment(s)`);
    const atts = await clientReportLoadAttachments(opts.attachmentIds);
    let attachmentIndex = 0;
    for (const a of atts) {
      attachmentIndex++;
      if (a.parse_status !== "ok" && a.parse_status !== "scanned_pdf") {
        // Skip failed parses but log to operator notes via prompt
        referenceBlock += `\n\n## Attachment (could not be parsed)\n\n_Status: ${a.parse_status}${a.parse_note ? ` — ${a.parse_note}` : ""}_\n`;
        continue;
      }
      if (a.pdf_base64) {
        pdfAttachments.push({ file_name: a.file_name, pdf_base64: a.pdf_base64 });
        referenceBlock += `\n\n## Attached document (PDF — included below)\n\n_This attached document records the activity / work completed for this client. When referring to it in the report, use neutral phrasing such as "per the activity log", "from the work completed this period", or "from the records of work delivered" — do NOT cite the filename or call it "the attached PDF" by name._\n`;
      } else if (a.extracted_text) {
        const cap = 12000;
        const text = a.extracted_text.length > cap
          ? a.extracted_text.slice(0, cap) + `\n\n_…(truncated; ${a.extracted_text.length - cap} chars omitted)…_`
          : a.extracted_text;
        referenceBlock += `\n\n## Attached document (extracted content)\n\n_This attached document records the activity / work completed for this client. When referring to it in the report, use neutral phrasing such as "per the activity log", "from the work completed this period", or "from the records of work delivered" — do NOT cite the filename or call it "the attachment" by name._\n\n\`\`\`\n${text}\n\`\`\`\n`;
      }
    }
  }

  await status("composing the client deliverable");

  const system = `You are a Senior Client Communications specialist preparing a report for a client. You communicate already-completed work; you do not investigate or expand scope.

PROJECT CONTEXT (use these exact facts; do not invent project details):
- Domain: ${ctx.project_domain || "(see evidence)"}
- Goal of this engagement: ${ctx.goal}
- Pages in scope: ${ctx.target_urls.length}

═══════════════════ STRICT SCOPE RULES — ABSOLUTE ═══════════════════

1. THE OPERATOR'S CONTEXT IS THE EXCLUSIVE GATE FOR WHAT GOES IN THIS REPORT.
   - Only include topics, sections, and points the operator's context explicitly asks for.
   - If the operator asked for "what we did this week + next steps", you write ONLY that. You do NOT add a Technical Performance section, a Visibility analysis, a 90-day plan, or anything else not in the context — even if the workspace has rich findings on those topics.
   - If the operator's context is silent on a topic, that topic is OUT OF SCOPE for this report. Omit it entirely. Do not mention it. Do not flag it as missing.
   - When in doubt about whether something is asked for, leave it out.

2. THE ATTACHED DOCUMENT(S) ARE THE PRIMARY SOURCE OF "WHAT WAS DONE".
   - When the operator's context asks about work completed, activity delivered, links built, tasks done, hours spent, deliverables shipped — the answer comes from the attached document(s), not from workspace findings.
   - Workspace pillar findings / panel / step evidence describe the SITE'S CURRENT STATE and ANALYSIS. They do NOT describe "work the agency did this period". Do not conflate them.
   - If the attached document doesn't contain the activity detail the operator asked for, say so honestly in operator_notes (not in the body) and either omit the section or write only what's verifiable.

3. SOURCE EVERY CLAIM, BUT DO NOT NAME FILENAMES OR INTERNAL TERMS IN THE OUTPUT.
   - Every figure or statement must trace to a real source. Never invent.
   - When citing an attached document, use neutral phrasing: "per the activity log", "from the work completed this period", "as recorded in this week's delivery", "from our work records" — NEVER "(source: attached PDF 'xyz.pdf')", never call out filenames, never reference "the attachment" by name.
   - When citing workspace data (only if the operator's context explicitly asks for analytical input), use natural language like "our analysis shows...", "from the current site review...", "based on our checks of the site...".
   - Never use internal vocabulary in the report body: words like "pillar", "scientist", "panel", "lab", "workspace", "deep step", "GSC" (use "Google Search Console"), "step evidence" should not appear.

4. NEVER STRETCH THE EVIDENCE.
   - If a claim cannot be grounded in either the operator's context, the attached document, or (only if the operator asks for it) the workspace analysis — DO NOT WRITE IT.
   - If a number would need extrapolation or assumption to be stated, either state it conservatively with appropriate hedging or omit it.

═══════════════════ TONE & SHAPE ═══════════════════

- Match the tone the operator specifies. If unspecified: calm, professional, advisor-to-client.
- Match the format the operator specifies. If unspecified: ask yourself "what would a thoughtful agency lead send for this exact situation" and produce that — no more, no less.
- This is a real document going to a real client. Conservative and accurate beats bold and questionable.

═══════════════════ OUTPUT FORMAT ═══════════════════

Respond with ONLY this JSON (no prose around it, no fences):
{
  "title": "Self-identifying title for the report (use the client name + period if the operator provides them)",
  "summary": "1-2 sentence framing of what this report covers",
  "body_md": "the full report as markdown — what the client reads. Section headings only for what the operator's context asks for.",
  "operator_notes": "honest concerns visible to the operator only: things the operator's context asked for that the attached document didn't fully support; claims you softened or omitted; anything to verify before sending. Never copied into the body."
}`;

  let userPrompt = `OPERATOR CONTEXT — this is the ONLY gate for what goes in the report. Include exactly what is asked here, nothing more.\n"""\n${opts.manavContext.trim()}\n"""\n`;
  if (referenceBlock) userPrompt += referenceBlock;

  // Workspace data is provided as optional context the model may CONSULT
  // only if the operator's context explicitly asks for analysis or
  // current-state input. It is NOT material for the report by default.
  userPrompt += `\n\n═══════════════════ OPTIONAL CONTEXT (not for the report unless operator's context asks for it) ═══════════════════\n\nThe following workspace data describes the site's current analytical state. DO NOT include any of it in the report unless the operator's context above explicitly asks for analytical input, current-state observations, or site findings. This is reference-only context — most reports should ignore it entirely.\n\n## Site analysis (optional — consult only if operator asks)\n\n${pillarsBlock}\n\n## Strategy discussion (optional — consult only if operator asks)\n\n${panelBlock}\n\n## Raw site data (optional — consult only if operator asks for specific figures)\n\n${stepsBlock}\n\n═══════════════════ END OPTIONAL CONTEXT ═══════════════════\n\nNow produce the client report as JSON. Remember: the report's content is gated entirely by the operator's context above. Attached documents are the source of "what was done". Workspace data above is OPTIONAL — most reports will not draw on it at all. Never name filenames, never use internal vocabulary, never write what cannot be sourced. Operator concerns go in operator_notes, never in the body.`;

  // ── Call path ── if PDFs are attached we go direct-API so we can include
  // them as document blocks; otherwise the existing text-only llm() helper.
  let raw = "";
  if (pdfAttachments.length) {
    if (!ANTHROPIC_API_KEY) return { success: false, error: "ANTHROPIC_API_KEY missing." };
    const userContent: any[] = [];
    // Document blocks first (Anthropic recommends docs before text)
    for (const p of pdfAttachments) {
      userContent.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: p.pdf_base64 }, title: p.file_name });
    }
    userContent.push({ type: "text", text: userPrompt });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 240_000);
    let stopReason = "";
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: controller.signal,
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 16000, system, messages: [{ role: "user", content: userContent }] }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        console.error(`[workspace/client-report-pdf] LLM ${r.status}: ${t.slice(0, 400)}`);
        return { success: false, error: `LLM call with PDF attachment failed (${r.status}). Check Vercel logs.` };
      }
      const d = await r.json();
      raw = (d?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      stopReason = String(d?.stop_reason || "");
    } catch (e: any) {
      console.error(`[workspace/client-report-pdf] exc ${e?.message}${controller.signal.aborted ? " (timeout 240000ms)" : ""}`);
      return { success: false, error: "Client Report generation timed out or failed. Try removing attachments and retrying." };
    } finally { clearTimeout(timer); }
    if (stopReason === "max_tokens") {
      console.error(`[workspace/client-report-pdf] truncated at max_tokens — raw length ${raw.length}`);
      return { success: false, error: "Report was cut off mid-generation (hit token ceiling). Shorten your context box, remove some attachments, or ask the model for a tighter format like 'one-page exec summary'." };
    }
  } else {
    raw = await llm({
      system, user: userPrompt,
      maxTokens: 16000, timeoutMs: 240_000, label: "client-report",
    });
  }

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
        // Try a more thorough repair sequence
        const tryRepair = (s: string): any => {
          // Step 1: trim to last brace
          const last = s.lastIndexOf("}");
          if (last > 0) {
            try { return JSON.parse(s.slice(0, last + 1)); } catch { /* keep trying */ }
          }
          // Step 2: balance braces — count opens vs closes and append missing closes
          const opens = (s.match(/\{/g) || []).length;
          const closes = (s.match(/\}/g) || []).length;
          if (opens > closes) {
            // Try closing the body_md string before adding braces (most common truncation point)
            const candidates = [
              s + '"' + "}".repeat(opens - closes),
              s + "}".repeat(opens - closes),
              s.replace(/"[^"]*$/, '"') + "}".repeat(opens - closes),  // close last unterminated string
            ];
            for (const c of candidates) {
              try { return JSON.parse(c); } catch { /* keep trying */ }
            }
          }
          return null;
        };
        parsed = tryRepair(clean);
      }
    }
  } catch { /* fall through */ }

  // If we couldn't parse the JSON and the response looks truncated (no closing
  // brace, or very long with prose at the end), refuse honestly rather than
  // pretending mangled text is a successful report. This is what was wrong
  // when you got the cut-off "and fixing it is This the unformatted completely"
  // output — silently treating truncation as success.
  if (!parsed || !parsed.body_md || typeof parsed.body_md !== "string" || parsed.body_md.length < 50) {
    const looksTruncated = raw.length > 2000 && !raw.trim().endsWith("}");
    console.error(`[workspace/client-report] could not parse response. raw length: ${raw.length}, looksTruncated: ${looksTruncated}, head: ${raw.slice(0, 200)}, tail: ${raw.slice(-200)}`);
    if (looksTruncated) {
      return { success: false, error: "Report appears to have been cut off mid-generation. Try a tighter context (e.g. 'one-page exec summary' instead of a long-form report), or remove some attachments to leave more room for output." };
    }
    return { success: false, error: "Model did not return a valid client report structure. Check Vercel logs for the raw output, then try again with a slightly different context." };
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
    confidence_rating: "high",
    generated_by: "manual",
    data_sources: ["pillar findings", "panel discussion", "step evidence", opts.referenceText ? "operator-pasted reference" : null, (opts.attachmentIds?.length ? `${opts.attachmentIds.length} attachment(s)` : null)].filter(Boolean),
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
