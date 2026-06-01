/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/panel-engine.ts

   THE PANEL — a working discussion of senior stakeholders over the verified
   evidence the deep steps gathered. AS OF BUILD 6, the panel is also a
   tool-using analyst: it can call the deep-step gatherers itself to extend
   evidence (writing a new VERSION of a step report) and call spot
   verification tools (fetch_page, fetch_serp, get_gsc/ga4/crux, etc.) when
   evaluating evidence. Rule: every claim sourced; no fluff; only call a
   tool when a specific question cannot be answered with current evidence.

   Round 1 over the evidence (with optional pre-gather), then STOPS at the
   operator's gate. Round 2+ incorporates operator input (incl. pillar
   escalations), can call gather tools, then refines questions back to
   pillars.

   Project-agnostic: scenarios are derived from the project's own evidence.
════════════════════════════════════════════════════════════════ */

import { db } from "../db.js";
import { llmWithTools, parseJsonResponse } from "./llm.js";
import {
  STAKEHOLDER_ROLES, resolveTargetUrls, loadGsc, fetchPageFacts, fetchSerpFeatures,
  fetchCrux, ga4PullPageMetrics, type SourcedFact,
} from "./shared.js";

export interface PanelQuestion {
  role: string;        // which stakeholder is asking
  pillar: string;      // which pillar must answer
  question: string;    // the specific question
  why: string;         // why it matters to that role
}
export interface PanelScenario {
  title: string;
  description: string;     // grounded in evidence
  traffic_lever: string;   // how this moves traffic
  evidence_basis: string;  // which facts support it
}
export interface PanelOutput {
  headline: string;
  scenarios: PanelScenario[];
  questions: PanelQuestion[];
  cross_checks: string[];     // angles the panel wants verified
}

/* ════════════ PANEL TOOLKIT ════════════════════════════════════
   Panel can call gather_more_<step> to extend a step report (writes a new
   version) AND quick spot tools (fetch_page, fetch_serp, get_gsc/ga4/crux)
   for direct verification without a full step re-run.
══════════════════════════════════════════════════════════════════ */
const PANEL_TOOL_DEFS = [
  {
    name: "gather_more_gsc_visibility",
    description: "Re-run GSC visibility + live indexation crawl with an extended set of target URLs. Use when the current step v1 missed pages the operator just added or you need indexation status on additional URLs. Writes a new version of gsc_visibility step report.",
    input_schema: { type: "object", properties: { extra_urls: { type: "array", items: { type: "string" }, description: "Additional absolute URLs to include in the gather (added to existing scope, not replacing)." }, reason: { type: "string", description: "Why this extension is needed — must reference a specific question/escalation it answers." } }, required: ["extra_urls", "reason"] },
  },
  {
    name: "gather_more_competitor_intel",
    description: "Re-run competitor intelligence for additional queries (live SerpAPI + fetch competitor pages). Use to verify competitive positioning on queries the v1 didn't cover. Writes a new version.",
    input_schema: { type: "object", properties: { extra_queries: { type: "array", items: { type: "object", properties: { query: { type: "string" }, position: { type: "number" } }, required: ["query"] } }, reason: { type: "string" } }, required: ["extra_queries", "reason"] },
  },
  {
    name: "gather_more_onpage_audit",
    description: "Re-crawl additional URLs for on-page facts (title, H1, meta, words, schema, canonical). Writes a new version.",
    input_schema: { type: "object", properties: { extra_urls: { type: "array", items: { type: "string" } }, reason: { type: "string" } }, required: ["extra_urls", "reason"] },
  },
  {
    name: "gather_more_query_landscape",
    description: "Re-run query landscape with explicit additional queries to verify (live SerpAPI + PAA). Writes a new version.",
    input_schema: { type: "object", properties: { extra_queries: { type: "array", items: { type: "string" } }, reason: { type: "string" } }, required: ["extra_queries", "reason"] },
  },
  {
    name: "fetch_page",
    description: "Spot-fetch a specific URL for verified on-page facts. Cheap, single-URL — use for quick checks instead of a full step re-run when you only need one or two pages.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
  {
    name: "fetch_serp",
    description: "Spot-fetch a single SERP for a query (top URLs, features, PAA). Use when one query verification answers the question; reach for gather_more_competitor_intel only when multiple queries need extension.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "get_gsc_for_query_or_page",
    description: "Look up GSC data for a specific query, page, or query+page pair. Use to verify a single number quickly.",
    input_schema: { type: "object", properties: { query: { type: "string" }, page: { type: "string" }, limit: { type: "number" } } },
  },
  {
    name: "get_ga4_for_page",
    description: "GA4 metrics for one page path (sessions, engagement, conversions). 28-day window default.",
    input_schema: { type: "object", properties: { page_path: { type: "string" }, days: { type: "number" } }, required: ["page_path"] },
  },
  {
    name: "get_crux_for_page",
    description: "CrUX field data for a URL or origin (use origin when URL-level returns null).",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
];

interface PanelToolCtx {
  projectId: string;
  runId: string;
  round: number;
  provenance: SourcedFact[];
  callsMade: number;
}

async function dispatchPanelTool(name: string, input: any, ctx: PanelToolCtx, statusFn?: (s: string) => Promise<void>): Promise<{ text: string; is_error?: boolean }> {
  const now = () => new Date().toISOString();
  const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const pathOf = (u: string) => (u || "").replace(/^https?:\/\/[^/]+/, "") || "/";

  try {
    // ── Step extension tools — write a new VERSION of the step_report ──
    if (name.startsWith("gather_more_")) {
      const stepKey = name.replace("gather_more_", "");
      if (!input?.reason || String(input.reason).trim().length < 10) {
        return { text: "ERROR: 'reason' is required and must explain which specific question/escalation this extension answers. Refusing the call.", is_error: true };
      }
      await statusFn?.(`panel: extending ${stepKey} — ${String(input.reason).slice(0, 80)}`);

      // Determine the full extended scope: current target URLs + extras
      const { urls: baseUrls } = await resolveTargetUrls(undefined, ctx.projectId);
      let extendedUrls = [...baseUrls];
      if (Array.isArray(input?.extra_urls)) {
        for (const u of input.extra_urls) {
          if (typeof u === "string" && /^https?:\/\//.test(u) && !extendedUrls.includes(u)) extendedUrls.push(u);
        }
      }

      // Run the appropriate gatherer
      let evidence: any, report_md: string, worth_deeper: string[];
      try {
        if (stepKey === "gsc_visibility") {
          const { gatherGscVisibility } = await import("./deep-steps/gsc-visibility.js");
          const r = await gatherGscVisibility({ projectId: ctx.projectId, targetUrls: extendedUrls });
          evidence = r.evidence; report_md = r.report_md; worth_deeper = (r.evidence as any).worth_deeper || [];
        } else if (stepKey === "competitor_intel") {
          const { gatherCompetitorIntel } = await import("./deep-steps/competitor-intel.js");
          const projectDomain = domainOf(baseUrls[0] || "");
          const q = (input?.extra_queries || []).map((x: any) => ({ query: x.query, position: +(x.position || 50) }));
          const r = await gatherCompetitorIntel({ projectId: ctx.projectId, projectDomain, queries: q });
          evidence = r.evidence; report_md = r.report_md; worth_deeper = (r.evidence as any).worth_deeper || [];
        } else if (stepKey === "onpage_audit") {
          const TS = await import("./deep-steps/traffic-steps.js");
          const r = await TS.gatherOnpageAudit({ projectId: ctx.projectId, targetUrls: extendedUrls });
          evidence = r.evidence; report_md = r.report_md; worth_deeper = (r.evidence as any).worth_deeper || [];
        } else if (stepKey === "query_landscape") {
          // Re-run with extras conceptually — current gatherer reads from GSC,
          // so the "extra_queries" mostly drives the SERP-feature SERPAPI calls.
          // For now: re-run the standard gatherer; the report_md will be regenerated.
          const TS = await import("./deep-steps/traffic-steps.js");
          const r = await TS.gatherQueryLandscape({ projectId: ctx.projectId, targetUrls: extendedUrls });
          evidence = r.evidence; report_md = r.report_md; worth_deeper = (r.evidence as any).worth_deeper || [];
        } else {
          return { text: `ERROR: gather_more for '${stepKey}' is not yet wired in Build 6 (visibility/competitor_intel/onpage_audit/query_landscape only). Use spot tools instead.`, is_error: true };
        }
      } catch (e: any) {
        return { text: `ERROR running gather_more_${stepKey}: ${e?.message || String(e)}`, is_error: true };
      }

      // Write a new VERSION of this step report
      try {
        const { data: latestRow } = await db().from("step_reports")
          .select("version").eq("run_id", ctx.runId).eq("step_key", stepKey)
          .order("version", { ascending: false }).limit(1).maybeSingle();
        const nextV = ((latestRow as any)?.version || 0) + 1;
        const row: any = {
          run_id: ctx.runId, project_id: ctx.projectId, step_key: stepKey,
          evidence_json: evidence, report_md, worth_deeper_json: worth_deeper || [],
          status: "done", version: nextV, triggered_by: `panel:r${ctx.round}`,
        };
        const { error: ins } = await db().from("step_reports").insert(row);
        if (ins && /version|triggered_by/i.test(ins.message || "")) {
          // Migration not yet applied — fall back to upsert (overwrite). Loses
          // history but the gather still propagates to readers.
          await db().from("step_reports").delete().eq("run_id", ctx.runId).eq("step_key", stepKey);
          delete row.version; delete row.triggered_by;
          await db().from("step_reports").insert(row);
        }
        ctx.provenance.push({ value: `${stepKey} v${nextV}`, source: "panel-triggered step extension", fetched_at: now() });
        return { text: JSON.stringify({ step_key: stepKey, version: nextV, summary: `Step ${stepKey} extended to v${nextV} with ${extendedUrls.length} URLs (was ${baseUrls.length}). Updated evidence available; pillars will read the new version automatically.` }) };
      } catch (e: any) {
        return { text: `ERROR persisting extension of ${stepKey}: ${e?.message}`, is_error: true };
      }
    }

    // ── Spot verification tools ──
    if (name === "fetch_page") {
      const url = String(input?.url || "").trim();
      if (!/^https?:\/\//.test(url)) return { text: "ERROR: 'url' must be absolute https://.", is_error: true };
      const host = domainOf(url);
      if (/^(www\.)?example\.(com|org|net)$/i.test(host)) return { text: `ERROR: '${host}' is a placeholder — use the project's real domain.`, is_error: true };
      await statusFn?.(`panel: fetch_page(${pathOf(url)})`);
      const f = await fetchPageFacts(url);
      ctx.provenance.push({ value: url, source: "live HTML crawl", fetched_at: now() });
      return { text: JSON.stringify(f) };
    }
    if (name === "fetch_serp") {
      const q = String(input?.query || "").trim();
      if (!q) return { text: "ERROR: 'query' is required.", is_error: true };
      await statusFn?.(`panel: fetch_serp("${q.slice(0, 40)}")`);
      const serp: any = await fetchSerpFeatures(q, ctx.projectId, {}).catch(() => null);
      if (!serp) return { text: "ERROR: SerpAPI returned no data.", is_error: true };
      ctx.provenance.push({ value: q, source: "SerpAPI", fetched_at: serp.fetched_at || now() });
      return { text: JSON.stringify({
        query: q,
        top_urls: (serp.top_100_urls || serp.top_10_urls || []).slice(0, 10),
        features: [serp.ai_overview && "AI Overview", serp.featured_snippet && "Featured snippet", serp.people_also_ask && "PAA", serp.shopping_carousel && "Shopping"].filter(Boolean),
        paa: (serp.paa_questions || []).slice(0, 8),
      }) };
    }
    if (name === "get_gsc_for_query_or_page") {
      await statusFn?.(`panel: GSC lookup`);
      const gsc = await loadGsc(ctx.projectId);
      ctx.provenance.push({ value: gsc.queryPagePairs.length, source: "GSC query-page pairs", fetched_at: gsc.fetchedAt });
      const q = (input?.query || "").toString().toLowerCase().trim();
      const p = (input?.page || "").toString().toLowerCase().trim();
      const limit = Math.max(1, Math.min(50, +input?.limit || 20));
      const matches = gsc.queryPagePairs.filter((row: any) => {
        const qOk = !q || String(row.query || "").toLowerCase().includes(q);
        const pOk = !p || String(row.page || "").toLowerCase().includes(p);
        return qOk && pOk;
      }).slice(0, limit);
      return { text: JSON.stringify({ count: matches.length, rows: matches }) };
    }
    if (name === "get_ga4_for_page") {
      const path = String(input?.page_path || "").trim();
      if (!path.startsWith("/")) return { text: "ERROR: page_path must start with '/'.", is_error: true };
      await statusFn?.(`panel: GA4(${path})`);
      const m = await ga4PullPageMetrics({ projectId: ctx.projectId, pagePath: path, days: +input?.days || 28 }).catch(() => null);
      if (!m) return { text: JSON.stringify({ note: "No GA4 data for this page in the window." }) };
      ctx.provenance.push({ value: path, source: `GA4 (${+input?.days || 28}d)`, fetched_at: now() });
      return { text: JSON.stringify(m) };
    }
    if (name === "get_crux_for_page") {
      const url = String(input?.url || "").trim();
      if (!/^https?:\/\//.test(url)) return { text: "ERROR: 'url' required.", is_error: true };
      await statusFn?.(`panel: CrUX(${pathOf(url) || url})`);
      const c = await fetchCrux(url);
      if (!c) return { text: JSON.stringify({ note: "No CrUX data at this level. If page-level returned null, retry with the origin." }) };
      ctx.provenance.push({ value: url, source: "CrUX field data", fetched_at: now() });
      return { text: JSON.stringify(c) };
    }
    return { text: `ERROR: unknown tool '${name}'.`, is_error: true };
  } catch (e: any) {
    return { text: `ERROR running ${name}: ${e?.message || String(e)}`, is_error: true };
  }
}

/* Panel budgets — tight enough to keep cost in check; loose enough for genuine
   investigation when warranted. */
const PANEL_MAX_TOOL_CALLS      = 5;
const PANEL_MAX_TOOL_CALLS_HARD = 8;
const PANEL_MAX_LOOP_TURNS      = PANEL_MAX_TOOL_CALLS_HARD + 3;
const PANEL_TOTAL_BUDGET_MS     = 270_000;  // 4.5 min wall-time (allows ~one 4-min LLM call + tool dispatches)

/* Compact a step's full report_md down to the panel's actual needs: the
   step name, top-level headlines, "what we found" / state-of-play, and the
   worth_deeper flags. Drops markdown table rows (per-page detail) — the
   pillars get the full evidence verbatim; the panel only needs the picture. */
function skimStepReportForPanel(md: string, maxLen = 6000): string {
  if (!md) return "";
  const lines = md.split("\n");
  const kept: string[] = [];
  let inTable = false, droppedTableRows = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("|") && t.endsWith("|")) { inTable = true; droppedTableRows++; continue; }
    if (inTable && t === "") {
      inTable = false;
      if (droppedTableRows > 2) kept.push(`_…(${droppedTableRows} table rows omitted from panel view; full detail in pillar evidence)…_`);
      droppedTableRows = 0;
      continue;
    }
    inTable = false;
    kept.push(line);
    if (kept.join("\n").length > maxLen) { kept.push("_…(truncated for panel context)…_"); break; }
  }
  return kept.join("\n");
}

async function loadStepEvidence(runId: string): Promise<{ reports: string; goal: string; framing: string }> {
  const { data: run } = await db().from("workspace_runs").select("goal, run_config").eq("id", runId).maybeSingle();
  const cfg = (run as any)?.run_config || null;
  // Latest version per step (versioned step_reports introduced in Build 6).
  const { data: steps } = await db().from("step_reports")
    .select("step_key, report_md, worth_deeper_json, version, created_at").eq("run_id", runId)
    .order("step_key").order("version", { ascending: false }).order("created_at", { ascending: false });
  const latest: Record<string, any> = {};
  for (const s of ((steps || []) as any[])) { if (!latest[s.step_key]) latest[s.step_key] = s; }
  const reports = Object.values(latest).map((s: any) =>
    `### Evidence: ${s.step_key}${(s.version || 1) > 1 ? ` (v${s.version})` : ""}\n${skimStepReportForPanel(s.report_md || "")}\n\nFlagged for deeper investigation:\n${(s.worth_deeper_json || []).map((w: string) => `- ${w}`).join("\n") || "- (none)"}`
  ).join("\n\n---\n\n");
  return {
    reports,
    goal: (run as any)?.goal || "grow organic traffic",
    framing: cfg?.panel_framing || "",
  };
}

/* Run a panel round. round=1 over evidence; round=2 incorporates Manav input. */
export async function runPanelRound(opts: {
  runId: string;
  projectId: string;
  round: number;
  manavInput?: string;        // round 2+ or operator pre-input
  priorOutput?: PanelOutput;  // round 2+: the prior round's result to build on
  onStatus?: (s: string) => Promise<void>;  // live status callback
}): Promise<{ success: boolean; output?: PanelOutput; provenance?: SourcedFact[]; error?: string }> {
  const status = async (s: string) => { try { await opts.onStatus?.(`panel:r${opts.round} ${s}`); } catch { /* non-fatal */ } };

  const { reports, goal, framing } = await loadStepEvidence(opts.runId);
  if (!reports.trim()) return { success: false, error: "No step evidence found for this run." };

  // Project context — domain + canonical target URLs, so the panel never
  // synthesises hostnames or makes claims about pages it hasn't seen.
  const { urls: targetUrls } = await resolveTargetUrls(undefined, opts.projectId);
  const projectDomain = (() => { try { return new URL(targetUrls[0] || "").hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const projectContext = projectDomain
    ? `PROJECT CONTEXT (use these exact values when calling tools):\n- Project domain: ${projectDomain}\n- Target pages (full URLs):\n${targetUrls.slice(0, 30).map(u => `  ${u}`).join("\n")}\nWhen any tool takes a URL, use the actual URLs above — never synthesise hostnames, never use placeholder domains like example.com.\n\n`
    : "";

  const isEscalationMode = !!opts.manavInput && /pillar analyses have surfaced questions/i.test(opts.manavInput);

  const roleList = STAKEHOLDER_ROLES.join(", ");
  const system = `You are facilitating a panel of senior stakeholders analysing how to achieve a specific goal for a website. The panel roles: ${roleList}.

Goal: ${goal}
${framing ? `\nHow to frame this goal:\n${framing}\n` : ""}
YOU HAVE A REAL TOOLKIT. Use it to make sure the dossier is COMPLETE before you frame questions for the analyst pillars. Real money will be spent on what the pillars do — your job is to ensure they investigate on a fully-grounded, fully-sourced foundation, not a thin one.

When to use which tool:
- A specific page's on-page facts → fetch_page(url).
- A single SERP / competitor lineup / PAA → fetch_serp(query).
- A specific GSC number → get_gsc_for_query_or_page.
- A page's engagement/conversion behaviour → get_ga4_for_page(page_path).
- Page or origin Core Web Vitals → get_crux_for_page.
- Step evidence is missing a swath of URLs / queries / depth → gather_more_<step> with the additions. Writes a new VERSION of that step report — pillars will read it automatically.

DISCIPLINE — non-negotiable:
- Every claim in your output cites its source inline (evidence file, tool call, or step-version).
- Before calling any tool: state explicitly what specific question you cannot answer with current evidence and what specific call would close that gap. Reasonless gathers waste money; refuse them yourself.
- 'gather_more_*' requires a 'reason' field of at least 10 chars referencing a specific question. The dispatcher will refuse anything weaker.
- Budget: at most ${PANEL_MAX_TOOL_CALLS} tool calls per round. Use them where leverage is highest.
- A null/no-data tool result is itself a verified fact — record it and use it, do not invent.
- Exhaust alternatives before declaring a gap: try adjacent inputs, substitute tools, related step. Three attempts minimum before flagging something as unanswerable.

OUTPUT — WHEN DONE USING TOOLS, your FINAL message must be valid JSON only (no prose, no fences):
{
  "headline": "one sentence on the biggest traffic opportunity this evidence reveals",
  "scenarios": [{"title":"","description":"with sourced facts","traffic_lever":"","evidence_basis":"which step/tool"}],
  "questions": [{"role":"client|dms|writer|brand|pm|investor","pillar":"visibility|query_opportunity|on_page_health|technical_performance|internal_links|engagement|monitoring","question":"","why":"why it matters to this role + the source it comes from"}],
  "cross_checks": ["angles to verify, with which tool would verify them"]
}

${isEscalationMode ? `\nESCALATION ROUND. The pillars have done their first pass and surfaced specific questions needing this panel's judgement. Your job in this round is to:
  1) Read each escalated question against the (now-updated) step evidence.
  2) Decide if any extension or spot verification is needed — call the appropriate tool if so, with a stated reason.
  3) For each escalation, produce one QUESTION entry routed to the role(s) or pillar that should answer it next (use the 'why' field to record the framing the next pillar pass needs).
  4) Refine scenarios only where the escalations genuinely change the picture; otherwise keep prior scenarios.\n` : `\nROUND ${opts.round}. Read the evidence carefully. If it's complete enough to frame strong scenarios + questions for the pillars, produce the JSON. If material gaps remain, call gather_more_* or a spot tool first.\n`}`;

  let userPrompt = projectContext + `VERIFIED EVIDENCE FROM THE DEEP STEPS (latest version of each step):\n\n${reports}\n\n`;
  if (opts.round >= 2 && opts.priorOutput) {
    userPrompt += `\nPrior round output — BUILD ON IT, do not discard:\n${JSON.stringify(opts.priorOutput)}\n`;
  }
  if (opts.manavInput) {
    // Make the operator input authoritative — not just additional context.
    // The earlier "Operator input for this round: …" framing was easy for the
    // model to treat as ambient context. Phrasing it as PRIMARY FRAMING +
    // explicit incorporation instructions forces the panel to react to it.
    userPrompt += `\n═══════════════════ OPERATOR FRAMING — PRIMARY INPUT ═══════════════════\n\nThe operator has provided the following input. This is AUTHORITATIVE framing for this panel round. You MUST:\n  1. Build your scenarios around what the operator has said (target keywords, hypotheses, constraints, data they have).\n  2. Reference the operator's input by name in the relevant scenario descriptions and questions ("As the operator notes, …" / "Given the operator's target keyword X, …").\n  3. Treat any specific keywords/targets/data the operator names as the primary subject of investigation — pillars must investigate THOSE first, not generic site-wide analysis.\n  4. If the operator asks a specific question or raises a scenario, your output must include a corresponding scenario or pillar question that directly addresses it.\n\nOperator input:\n"""\n${opts.manavInput}\n"""\n\n═══════════════════ END OPERATOR FRAMING ═══════════════════\n`;
    console.error(`[workspace/panel-r${opts.round}] applied operator input to prompt: len=${opts.manavInput.length}`);
  }
  userPrompt += `\nInvestigate with tools if material gaps remain, then produce the JSON output.`;

  await status("starting analysis");

  // ── Tool-use loop ──
  const ctx: PanelToolCtx = { projectId: opts.projectId, runId: opts.runId, round: opts.round, provenance: [], callsMade: 0 };
  const messages: Array<{ role: "user" | "assistant"; content: any }> = [{ role: "user", content: userPrompt }];
  const startedAt = Date.now();
  let output: PanelOutput | null = null;
  let loops = 0;

  while (loops < PANEL_MAX_LOOP_TURNS) {
    loops++;
    if (Date.now() - startedAt > PANEL_TOTAL_BUDGET_MS) { await status(`time budget reached after ${ctx.callsMade} tool calls — finalising`); break; }

    const remaining = PANEL_MAX_TOOL_CALLS_HARD - ctx.callsMade;
    const turnTools = remaining > 0 ? PANEL_TOOL_DEFS : [];
    const res = await llmWithTools({
      system, messages, tools: turnTools,
      maxTokens: 8000, timeoutMs: 300_000, label: `panel-r${opts.round}`,
    });
    if (!res) return { success: false, error: "Panel returned empty (LLM timeout or error)." };

    messages.push({ role: "assistant", content: res.content });

    const toolUses = (res.content || []).filter((b: any) => b.type === "tool_use");
    if (res.stop_reason === "tool_use" && toolUses.length && ctx.callsMade < PANEL_MAX_TOOL_CALLS_HARD) {
      const toolResults: any[] = [];
      for (const tu of toolUses) {
        if (ctx.callsMade >= PANEL_MAX_TOOL_CALLS_HARD) {
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: "ERROR: tool-call budget exhausted; produce your final JSON now.", is_error: true });
          continue;
        }
        ctx.callsMade++;
        await status(`tool ${ctx.callsMade}/${PANEL_MAX_TOOL_CALLS}: ${tu.name}`);
        const r = await dispatchPanelTool(tu.name, tu.input || {}, ctx, status);
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: r.text, ...(r.is_error ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    const finalText = (res.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    output = parseJsonResponse<PanelOutput>(finalText);
    if (output) break;

    messages.push({ role: "user", content: "Your last message wasn't valid JSON. Produce ONLY the JSON output now, matching the schema exactly. No prose, no fences, no tools." });
  }

  if (!output) return { success: false, error: `Panel did not produce parseable JSON after ${loops} turns (${ctx.callsMade} tool calls).` };

  output.scenarios = Array.isArray(output.scenarios) ? output.scenarios : [];
  output.questions = Array.isArray(output.questions) ? output.questions : [];
  output.cross_checks = Array.isArray(output.cross_checks) ? output.cross_checks : [];
  if (!output.scenarios.length && !output.questions.length) {
    return { success: false, error: "Panel produced neither scenarios nor questions — model did not follow the schema." };
  }

  await status(`done · ${ctx.callsMade} tool calls`);
  return { success: true, output, provenance: ctx.provenance };
}

/* Render the panel discussion to a downloadable document. */
export function renderPanelDocument(o: PanelOutput, round: number, manavInput?: string): string {
  const roleLabel: Record<string, string> = { client: "Client", dms: "SEO Lead", writer: "Writer", brand: "Brand", pm: "PM", investor: "Investor", dev: "Dev" };
  const pillarLabel: Record<string, string> = {
    visibility: "Visibility", query_opportunity: "Query Opportunity", on_page_health: "On-Page Health",
    technical_performance: "Technical Performance", internal_links: "Internal Links", engagement: "Engagement", monitoring: "Monitoring",
  };
  const L: string[] = [];
  L.push(`# Panel Discussion${round > 1 ? ` — Round ${round}` : ""}`);
  L.push("");
  if (o.headline) { L.push(`> ${o.headline}`); L.push(""); }

  L.push(`## Scenarios on the table`);
  L.push("");
  (o.scenarios || []).forEach((s, i) => {
    L.push(`### ${i + 1}. ${s.title}`);
    if (s.description) { L.push(""); L.push(s.description); }
    if (s.traffic_lever) { L.push(""); L.push(`**How it would move traffic.** ${s.traffic_lever}`); }
    if (s.evidence_basis) { L.push(""); L.push(`**What the evidence shows.** ${s.evidence_basis}`); }
    L.push("");
  });

  // Questions grouped by PILLAR (which scientist must answer them), with the
  // asking role shown as a quiet metadata tag — not a screaming heading.
  const byPillar: Record<string, PanelQuestion[]> = {};
  (o.questions || []).forEach(q => { (byPillar[q.pillar] = byPillar[q.pillar] || []).push(q); });
  if (Object.keys(byPillar).length) {
    L.push(`## Questions to investigate`);
    L.push("");
    for (const pk of Object.keys(byPillar)) {
      L.push(`### ${pillarLabel[pk] || pk}`);
      for (const q of byPillar[pk]) {
        L.push(`- ${q.question} _(asked by ${roleLabel[q.role] || q.role}${q.why ? ` — ${q.why}` : ""})_`);
      }
      L.push("");
    }
  }

  if ((o.cross_checks || []).length) {
    L.push(`## Cross-checks`);
    L.push("");
    for (const c of o.cross_checks) L.push(`- ${c}`);
    L.push("");
  }

  if (manavInput) {
    L.push(`## Operator input (incorporated)`);
    L.push("");
    L.push(manavInput);
    L.push("");
  }

  return L.join("\n");
}
