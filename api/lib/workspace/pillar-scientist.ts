/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/pillar-scientist.ts

   THE PILLARS (scientists / quantum brain).

   Each pillar runs as a SCIENTIST with a real toolkit (Anthropic tool-use
   loop). It reads the stored deep-step evidence, formulates sub-questions,
   and calls bounded, project-scoped tools (fetch_page, fetch_serp, GSC/GA4/
   CrUX lookups, snapshot history, cross-reading other pillar reports, fetch
   any URL the operator names) to actually verify what it claims — instead
   of just rephrasing the dossier.

   Hard budgets: 8 tool calls per pillar (12 hard cap as escape valve), per-
   call timeout 15s, total time budget 180s per pillar. Every tool call shows
   in live status. Every claim in the final report cites its source inline.

   Project-agnostic. All ids/urls flow through as data.
════════════════════════════════════════════════════════════════ */

import { db } from "../db.js";
import { llmWithTools, parseJsonResponse } from "./llm.js";
import {
  loadGsc, siteCtrCurve, fetchPageFacts, resolveTargetUrls,
  fetchSerpFeatures, fetchCrux, ga4PullPageMetrics, type SourcedFact,
} from "./shared.js";

const norm = (u: string) => (u || "").replace(/\/$/, "").toLowerCase();
const pathOf = (u: string) => (u || "").replace(/^https?:\/\/[^/]+/, "") || "/";
const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/* ── Per-pillar budgets (declared, enforced). Tight enough that the
   scientist focuses on high-leverage verifications; loose enough for real
   investigation. ───────────────────────────────────────────────── */
const MAX_TOOL_CALLS      = 8;
const MAX_TOOL_CALLS_HARD = 12;
const MAX_LOOP_TURNS      = MAX_TOOL_CALLS_HARD + 3;
const TOTAL_BUDGET_MS     = 180_000;

/* Interrogation per pillar — expert lens, data scope, source step evidence
   (Path A), default questions (Path B), and the tools this scientist may call. */
interface Interrogation { expert_role: string; data_sources: string[]; step_keys: string[]; default_questions: string[]; tools: string[]; }

const UNIVERSAL_TOOLS = ["fetch_page", "read_other_pillar_report"];

const INTERROGATIONS: Record<string, Interrogation> = {
  visibility: {
    expert_role: "Senior Technical SEO scientist specialising in indexation, crawl and visibility",
    data_sources: ["GSC pages", "GSC query-page pairs", "this site's CTR curve", "live HTML crawl", "SerpAPI"],
    step_keys: ["gsc_visibility", "competitor_intel"],
    default_questions: [
      "Which target pages are invisible to Google and what is each one's verified indexation state (reachable / noindex / canonicalised)?",
      "For near-ranking pages, what specifically do the competitors ranking above have that this page lacks?",
      "What is the realistic click ceiling if priority pages reach their target position, using THIS site's own CTR curve?",
      "Which single fix unlocks the most impressions for the least effort?",
    ],
    tools: [...UNIVERSAL_TOOLS, "fetch_serp", "get_gsc_for_query_or_page"],
  },
  query_opportunity: {
    expert_role: "Senior SEO scientist specialising in query intent and SERP positioning",
    data_sources: ["GSC query-page pairs", "SerpAPI", "this site's CTR curve"],
    step_keys: ["query_landscape", "gsc_visibility", "competitor_intel"],
    default_questions: [
      "Which queries rank via the wrong page (cannibalisation), and which page should own each?",
      "Which high-impression, low-CTR queries signal a title/meta or intent mismatch, and what's the fix?",
      "Which untapped query clusters (PAA, related) could the site realistically capture, and with what page?",
      "Rank the query opportunities by realistic click gain using the site's own CTR curve.",
    ],
    tools: [...UNIVERSAL_TOOLS, "fetch_serp", "get_gsc_for_query_or_page"],
  },
  on_page_health: {
    expert_role: "Senior On-Page SEO and content-quality scientist",
    data_sources: ["live HTML crawl", "competitor pages"],
    step_keys: ["onpage_audit", "competitor_intel"],
    default_questions: [
      "Which pages have title/meta/H1/schema/word-count deficits, with the actual values?",
      "Which thin pages are thin relative to the competitor depth for their target query?",
      "Separate the instant mechanical fixes (title rewrites) from the content-investment projects.",
      "Which single page, fully optimised, would benefit most given its impression volume?",
    ],
    tools: [...UNIVERSAL_TOOLS, "fetch_serp", "get_gsc_for_query_or_page", "get_ga4_for_page"],
  },
  technical_performance: {
    expert_role: "Senior Web Performance scientist specialising in Core Web Vitals",
    data_sources: ["CrUX field data"],
    step_keys: ["core_web_vitals"],
    default_questions: [
      "Which pages fail Google's CWV thresholds (LCP>2.5s, CLS>0.1, INP>200ms) and by how much, from real field data?",
      "Which pages lack field data and is that a traffic-volume fact rather than a performance verdict?",
      "Which fix addresses the most failing commercially-important pages at once?",
    ],
    tools: [...UNIVERSAL_TOOLS, "get_crux_for_page", "get_ga4_for_page"],
  },
  internal_links: {
    expert_role: "Senior SEO scientist specialising in site architecture and PageRank flow",
    data_sources: ["live HTML crawl", "GSC authority signal"],
    step_keys: ["internal_link_graph", "gsc_visibility"],
    default_questions: [
      "Which target pages receive no internal links from the site's highest-authority pages?",
      "What is the single highest-leverage internal link to add (from which authority page to which target), and why?",
      "For each recommended link, give from-page, to-page, suggested anchor, ranked by source authority.",
    ],
    tools: [...UNIVERSAL_TOOLS, "get_gsc_for_query_or_page"],
  },
  engagement: {
    expert_role: "Senior Analytics and CRO scientist",
    data_sources: ["GA4 (28 days)"],
    step_keys: ["engagement_value"],
    default_questions: [
      "Which pages attract traffic but fail to engage or convert, with the real GA4 numbers?",
      "Which pages engage well but get little traffic (visibility upside)?",
      "Where is the biggest leak from organic landing to conversion, and which page to fix first?",
    ],
    tools: [...UNIVERSAL_TOOLS, "get_ga4_for_page", "get_gsc_for_query_or_page"],
  },
  monitoring: {
    expert_role: "Senior SEO performance scientist tracking trajectory vs goal",
    data_sources: ["metrics_snapshots", "GSC", "GA4"],
    step_keys: ["trajectory", "gsc_visibility"],
    default_questions: [
      "What is the verified organic trajectory (clicks/impressions/position/sessions) over the available history?",
      "Is the campaign on track to the goal in the timeframe; if off-trajectory, what is the corrective priority?",
      "Distinguish real movement from normal GSC fluctuation and reporting lag.",
    ],
    tools: [...UNIVERSAL_TOOLS, "get_snapshot_history", "get_gsc_for_query_or_page", "get_ga4_for_page"],
  },
};

/* ════════════ TOOL DEFINITIONS (Anthropic tool-use schema) ══════
   Each entry is an Anthropic tool. The dispatcher below runs it. Tool
   inputs/outputs are bounded and project-scoped (no arbitrary code, no
   destructive ops, hard timeouts per call).
══════════════════════════════════════════════════════════════════ */
const TOOL_DEFS: Record<string, { name: string; description: string; input_schema: any }> = {
  fetch_page: {
    name: "fetch_page",
    description: "Fetch a specific URL and return its verified on-page facts: HTTP reachable, title, title length, H1, meta description, word count, schema/structured-data presence, canonical, noindex. Works on any URL — target page, competitor page, or a URL the operator has named in their context.",
    input_schema: { type: "object", properties: { url: { type: "string", description: "Absolute URL to fetch (https://...)." } }, required: ["url"] },
  },
  fetch_serp: {
    name: "fetch_serp",
    description: "Live SerpAPI lookup for a specific query. Returns top organic URLs, SERP features (AI Overview, featured snippet, PAA, shopping, video, knowledge panel), and People-Also-Ask questions. Use to verify competitor positioning or SERP intent.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "Search query." } }, required: ["query"] },
  },
  get_gsc_for_query_or_page: {
    name: "get_gsc_for_query_or_page",
    description: "Look up verified Google Search Console data for a specific query, a specific page, or a specific query+page pair. Returns impressions, clicks, CTR, average position. Use to verify a claim with the actual GSC numbers.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "Optional query string to filter by." }, page: { type: "string", description: "Optional page URL or path to filter by." }, limit: { type: "number", description: "Max rows to return (default 20)." } } },
  },
  get_ga4_for_page: {
    name: "get_ga4_for_page",
    description: "Pull Google Analytics 4 metrics for a single page path: sessions, engaged sessions, engagement rate, bounce rate, average session duration, page views, conversions. Last 28 days by default.",
    input_schema: { type: "object", properties: { page_path: { type: "string", description: "Page path beginning with /." }, days: { type: "number", description: "Lookback window in days (default 28)." } }, required: ["page_path"] },
  },
  get_crux_for_page: {
    name: "get_crux_for_page",
    description: "Real Chrome User Experience (CrUX) field data for a specific URL: p75 LCP (ms), CLS, INP (ms). Returns null fields if Chrome lacks sufficient real-user traffic for that URL.",
    input_schema: { type: "object", properties: { url: { type: "string", description: "Absolute URL." } }, required: ["url"] },
  },
  get_snapshot_history: {
    name: "get_snapshot_history",
    description: "Historical metric snapshots for this project: gsc_clicks, gsc_impressions, gsc_avg_position, organic_sessions, conversions per captured_at timestamp. Newest first. Use to verify trajectory over time.",
    input_schema: { type: "object", properties: { limit: { type: "number", description: "Max snapshots (default 12)." } } },
  },
  read_other_pillar_report: {
    name: "read_other_pillar_report",
    description: "Read another solved pillar's report from this same run (for cross-reference). Valid pillar names: visibility, query_opportunity, on_page_health, technical_performance, internal_links, engagement, monitoring. Returns the body markdown if that pillar has been solved, else null.",
    input_schema: { type: "object", properties: { pillar: { type: "string", description: "Pillar name to read." } }, required: ["pillar"] },
  },
};

/* Build the tool list the model sees for this pillar — filtered allowlist. */
function toolsForPillar(pillarKey: string): Array<{ name: string; description: string; input_schema: any }> {
  const allowed = INTERROGATIONS[pillarKey]?.tools || [];
  return allowed.map(name => TOOL_DEFS[name]).filter(Boolean);
}

/* The execution context every tool sees. Holds the project + run + a per-call
   provenance accumulator + a hard call counter. Never any project literals. */
interface ToolCtx {
  projectId: string;
  runId?: string;
  pillar: string;
  provenance: SourcedFact[];
  callsMade: number;
}

/* Dispatch one tool call. Returns a string result that gets fed back to the
   model as tool_result content. Errors are caught and returned (with
   is_error=true) so the model can recover instead of the whole run crashing. */
async function dispatchTool(name: string, input: any, ctx: ToolCtx): Promise<{ text: string; is_error?: boolean }> {
  const now = () => new Date().toISOString();
  try {
    if (name === "fetch_page") {
      const url = String(input?.url || "").trim();
      if (!/^https?:\/\//.test(url)) return { text: "ERROR: 'url' must be an absolute https:// URL.", is_error: true };
      const f = await fetchPageFacts(url);
      ctx.provenance.push({ value: url, source: "live HTML crawl", fetched_at: now() });
      return { text: JSON.stringify(f) };
    }
    if (name === "fetch_serp") {
      const q = String(input?.query || "").trim();
      if (!q) return { text: "ERROR: 'query' is required.", is_error: true };
      const serp: any = await fetchSerpFeatures(q, ctx.projectId, {}).catch(() => null);
      if (!serp) return { text: "ERROR: SerpAPI returned no data (rate limit, key missing, or quota).", is_error: true };
      ctx.provenance.push({ value: q, source: "SerpAPI", fetched_at: serp.fetched_at || now() });
      const out = {
        query: q,
        top_urls: (serp.top_100_urls || serp.top_10_urls || []).slice(0, 10),
        features: [serp.ai_overview && "AI Overview", serp.featured_snippet && `Featured snippet${serp.featured_snippet_owner ? ` (${serp.featured_snippet_owner})` : ""}`, serp.people_also_ask && "PAA", serp.shopping_carousel && "Shopping", serp.video_carousel && "Video", serp.knowledge_panel && "Knowledge panel"].filter(Boolean),
        paa: (serp.paa_questions || []).slice(0, 8),
      };
      return { text: JSON.stringify(out) };
    }
    if (name === "get_gsc_for_query_or_page") {
      const gsc = await loadGsc(ctx.projectId);
      ctx.provenance.push({ value: gsc.queryPagePairs.length, source: "GSC query-page pairs", fetched_at: gsc.fetchedAt });
      const q = (input?.query || "").toString().toLowerCase().trim();
      const p = (input?.page || "").toString().toLowerCase().trim();
      const limit = Math.max(1, Math.min(50, +input?.limit || 20));
      const matches = gsc.queryPagePairs.filter((row: any) => {
        const qOk = !q || String(row.query || "").toLowerCase().includes(q);
        const pOk = !p || String(row.page || "").toLowerCase().includes(p);
        return qOk && pOk;
      }).slice(0, limit).map((r: any) => ({ query: r.query, page: r.page, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: r.position }));
      return { text: JSON.stringify({ count: matches.length, rows: matches }) };
    }
    if (name === "get_ga4_for_page") {
      const path = String(input?.page_path || "").trim();
      if (!path.startsWith("/")) return { text: "ERROR: page_path must start with '/'.", is_error: true };
      const m = await ga4PullPageMetrics({ projectId: ctx.projectId, pagePath: path, days: +input?.days || 28 }).catch(() => null);
      if (!m) return { text: JSON.stringify({ note: "No GA4 data for this page in the requested window — could be a low-traffic page or GA4 not configured. This is a fact about the data, not a verdict on the page." }) };
      ctx.provenance.push({ value: path, source: `GA4 (${+input?.days || 28}d)`, fetched_at: now() });
      return { text: JSON.stringify(m) };
    }
    if (name === "get_crux_for_page") {
      const url = String(input?.url || "").trim();
      if (!/^https?:\/\//.test(url)) return { text: "ERROR: 'url' must be an absolute https:// URL.", is_error: true };
      const c = await fetchCrux(url);
      if (!c) return { text: JSON.stringify({ note: "No CrUX field data — page lacks sufficient real-user Chrome traffic (a fact about volume, not performance)." }) };
      ctx.provenance.push({ value: url, source: "CrUX field data", fetched_at: now() });
      return { text: JSON.stringify(c) };
    }
    if (name === "get_snapshot_history") {
      const limit = Math.max(1, Math.min(36, +input?.limit || 12));
      const { data } = await db().from("metrics_snapshots")
        .select("gsc_clicks, gsc_impressions, gsc_avg_position, organic_sessions, conversions, captured_at")
        .eq("project_id", ctx.projectId).order("captured_at", { ascending: false }).limit(limit);
      const rows = (data || []) as any[];
      ctx.provenance.push({ value: rows.length, source: "metrics_snapshots", fetched_at: now() });
      return { text: JSON.stringify({ count: rows.length, snapshots: rows }) };
    }
    if (name === "read_other_pillar_report") {
      const target = String(input?.pillar || "").trim();
      if (!INTERROGATIONS[target]) return { text: `ERROR: unknown pillar '${target}'.`, is_error: true };
      if (target === ctx.pillar) return { text: "ERROR: cannot read your own report.", is_error: true };
      if (!ctx.runId) return { text: JSON.stringify({ note: "No run id — cannot look up sibling reports for this run." }) };
      // Look up the latest report for that pillar from this run window
      const { data: run } = await db().from("workspace_runs").select("project_id, created_at").eq("id", ctx.runId).maybeSingle();
      const projectId = (run as any)?.project_id || ctx.projectId;
      const since = (run as any)?.created_at || new Date(0).toISOString();
      const { data } = await db().from("seo_campaign_reports")
        .select("title, body_md, created_at")
        .eq("project_id", projectId).eq("pillar", target)
        .in("report_kind", ["deep_analysis", "manual_refresh"])
        .gte("created_at", since)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!data) return { text: JSON.stringify({ note: `Pillar '${target}' has not been solved in this run yet.` }) };
      ctx.provenance.push({ value: target, source: `sibling pillar (${target})`, fetched_at: now() });
      return { text: JSON.stringify({ title: (data as any).title, body_md: (data as any).body_md }) };
    }
    return { text: `ERROR: unknown tool '${name}'.`, is_error: true };
  } catch (e: any) {
    return { text: `ERROR running ${name}: ${e?.message || String(e)}`, is_error: true };
  }
}

/* Read the stored step evidence reports for a pillar (Path A). These were
   already gathered exhaustively + sourced by the deep steps, so the pillar
   builds on them rather than re-gathering. Returns the concatenated sourced
   evidence blocks + a provenance note. */
async function loadStepEvidenceForPillar(runId: string, stepKeys: string[]): Promise<{ block: string; provenance: SourcedFact[]; found: string[] }> {
  const { data } = await db().from("step_reports")
    .select("step_key, report_md").eq("run_id", runId).in("step_key", stepKeys);
  const rows = (data || []) as any[];
  const found = rows.map(r => r.step_key);
  const block = rows.map(r => `## Evidence: ${r.step_key}\n${r.report_md || ""}`).join("\n\n");
  const provenance: SourcedFact[] = rows.map(r => ({ value: r.step_key, source: "deep step evidence", fetched_at: new Date().toISOString() }));
  return { block, provenance, found };
}

/** Gather the verified data the visibility scientist needs. Returns a sourced
    evidence block (string) plus the structured facts for forecasting. */
async function gatherVisibilityData(projectId: string, targetUrls: string[]): Promise<{ block: string; provenance: SourcedFact[] }> {
  const now = new Date().toISOString();
  const targetSet = new Set(targetUrls.map(norm));
  const gsc = await loadGsc(projectId);
  const provenance: SourcedFact[] = [];

  const visible = gsc.topPages.filter((p: any) => targetSet.has(norm(p.page || p.url || "")));
  const invisible = targetUrls.filter(u => !gsc.topPages.some((p: any) => norm(p.page || p.url || "") === norm(u)));
  const pairs = gsc.queryPagePairs.filter((p: any) => targetSet.has(norm(p.page)))
    .sort((a: any, b: any) => (b.impressions || 0) - (a.impressions || 0));
  const curve = siteCtrCurve(gsc.queryPagePairs);
  provenance.push({ value: gsc.topPages.length, source: "GSC top pages", fetched_at: gsc.fetchedAt });
  provenance.push({ value: pairs.length, source: "GSC query-page pairs", fetched_at: gsc.fetchedAt });

  // Live indexation check on invisible pages (fresh, since this is the crux)
  const checks = await Promise.race([
    Promise.all(invisible.slice(0, 15).map(async (u) => {
      const f = await fetchPageFacts(u);
      return { url: u, loaded: f.loaded, noindex: f.noindex, canonical: f.canonical };
    })),
    new Promise<any[]>((res) => setTimeout(() => res([]), 50000)),
  ]) as any[];
  if (checks.length) provenance.push({ value: checks.length, source: "live HTML crawl", fetched_at: new Date().toISOString(), note: "indexation checks" });

  // Competitor verification for the top near-ranking query (fresh SerpAPI + crawl)
  const projDomain = domainOf(targetUrls[0] || "");
  const nearQ = pairs.find((p: any) => (p.position || 0) >= 4 && (p.position || 0) <= 20);
  let compBlock = "";
  if (nearQ?.query) {
    const serp: any = await fetchSerpFeatures(nearQ.query, projectId, {}).catch(() => null);
    if (serp) {
      provenance.push({ value: nearQ.query, source: "SerpAPI", fetched_at: serp.fetched_at || now });
      const compUrls = ((serp.top_100_urls || serp.top_10_urls || []) as string[])
        .filter(u => domainOf(u) && domainOf(u) !== projDomain).slice(0, 3);
      const comps = await Promise.race([
        Promise.all(compUrls.map(async (u) => { const f = await fetchPageFacts(u); return { domain: domainOf(u), words: f.word_count, schema: f.schema, loaded: f.loaded }; })),
        new Promise<any[]>((res) => setTimeout(() => res([]), 35000)),
      ]) as any[];
      if (comps.length) provenance.push({ value: comps.length, source: "live HTML crawl", fetched_at: new Date().toISOString(), note: "competitor pages" });
      compBlock = `\nCOMPETITORS for "${nearQ.query}" (this site pos ${(nearQ.position || 0).toFixed(1)}), SERP features: ${[serp.ai_overview && "AI Overview", serp.featured_snippet && "Featured snippet", serp.people_also_ask && "PAA", serp.shopping_carousel && "Shopping"].filter(Boolean).join(", ") || "none"}\n` +
        comps.map(c => `- ${c.domain}: ${c.loaded ? `${c.words} words, schema ${c.schema ? "yes" : "no"}` : "fetch failed"}`).join("\n");
    }
  }

  const block =
    `## VERIFIED DATA (sources tagged)\n` +
    `Target pages: ${targetUrls.length} | Visible in GSC: ${visible.length} | Invisible (0 impressions): ${invisible.length} [source: GSC top pages]\n\n` +
    `INVISIBLE PAGES with live indexation check [source: live HTML crawl]:\n` +
    (checks.length ? checks.map(c => `- ${pathOf(c.url)}: ${c.loaded ? "reachable" : "FETCH FAILED"}, ${c.noindex ? "NOINDEX" : "indexable"}${c.canonical ? `, canonical→${pathOf(c.canonical)}` : ""}`).join("\n") : invisible.slice(0, 15).map(u => `- ${pathOf(u)} (not yet crawled)`).join("\n")) + "\n\n" +
    `THIS SITE'S OWN CTR CURVE [source: GSC query-page pairs] (position: median CTR):\n` +
    Object.keys(curve).map(Number).filter(p => p <= 10).sort((a, b) => a - b).map(p => `- pos ${p}: ${curve[p].ctr}% (n=${curve[p].samples})`).join("\n") + "\n\n" +
    `TOP REAL QUERY→PAGE PAIRS [source: GSC query-page pairs]:\n` +
    pairs.slice(0, 25).map((p: any) => `- "${p.query}" → ${pathOf(p.page)}: ${p.impressions} impr, ${p.clicks} clicks, CTR ${p.ctr}%, pos ${(p.position || 0).toFixed(1)}`).join("\n") +
    compBlock;

  return { block, provenance };
}

export async function solvePillar(opts: {
  projectId: string;
  campaignId?: string;
  pillar: string;
  panelQuestions?: Array<{ role: string; pillar: string; question: string; why: string }>;
  manavContext?: string;
  targetUrls?: string[];
  runId?: string;
  onStatus?: (s: string) => Promise<void>;
}): Promise<{ success: boolean; report_id?: string; error?: string }> {
  const interro = INTERROGATIONS[opts.pillar];
  if (!interro) return { success: false, error: `Pillar "${opts.pillar}" not yet implemented in this slice (Visibility is the proven slice).` };

  const status = async (s: string) => { try { await opts.onStatus?.(s); } catch { /* non-fatal */ } };

  await status("Resolving target pages");
  let targetUrls = opts.targetUrls?.length ? opts.targetUrls : (await resolveTargetUrls(opts.campaignId, opts.projectId)).urls;
  if (!targetUrls.length) return { success: false, error: "No target pages to analyse." };

  // Gather the evidence to solve from. PATH A: read the deep steps' stored,
  // already-sourced evidence for this pillar's domain. PATH B (no run, or no
  // step evidence found): gather fresh — for visibility we have a full fresh
  // gatherer; for other pillars without a run we tell the operator to run the
  // deep steps (they're the gatherers), keeping the no-synthesis guarantee.
  await status("Loading verified evidence");
  let block = "";
  let provenance: SourcedFact[] = [];
  if (opts.runId) {
    const ev = await loadStepEvidenceForPillar(opts.runId, interro.step_keys);
    block = ev.block; provenance = ev.provenance;
  }
  if (!block.trim()) {
    if (opts.pillar === "visibility") {
      await status("No prior evidence — gathering fresh (GSC, live crawl, SerpAPI)");
      const fresh = await gatherVisibilityData(opts.projectId, targetUrls);
      block = fresh.block; provenance = fresh.provenance;
    } else {
      return { success: false, error: `No evidence found for ${opts.pillar}. Run the deep steps first (Deep Steps tab) so the scientist has verified data — the steps are the gatherers; pillars solve on their output.` };
    }
  }

  // Build the question set: panel questions for this pillar (Path A) or defaults (Path B)
  const pillarQs = (opts.panelQuestions || []).filter(q => q.pillar === opts.pillar);
  const questions = pillarQs.length
    ? pillarQs.map(q => `  - [asked by ${q.role}] ${q.question}${q.why ? ` (why: ${q.why})` : ""}`)
    : interro.default_questions.map(q => `  - ${q}`);

  await status("Investigating with verified tools");
  const system = `You are a ${interro.expert_role}. You answer questions about the "${opts.pillar}" pillar with the rigour of an experimental scientist working in a lab.

YOU HAVE A REAL TOOLKIT. Do not just summarise the evidence dossier — use the tools to actually verify the specific claims your answers will make. For every figure you cite, you must have either (a) found it in the provided evidence with its source labelled, or (b) called a tool to fetch it and recorded what the tool returned. No exceptions.

When to use which tool (these are the rules of the lab):
- A specific page's on-page state → fetch_page(url).
- A specific query's SERP / competitors / PAA → fetch_serp(query).
- A specific GSC number for a query or page → get_gsc_for_query_or_page.
- A specific page's engagement/conversion behaviour → get_ga4_for_page(page_path).
- A specific page's Core Web Vitals → get_crux_for_page(url).
- Movement over time → get_snapshot_history.
- Cross-reference what another pillar found → read_other_pillar_report(pillar).
- Any URL the operator has named in their context — fetch_page(url) works on any URL.

Budgets and discipline:
- You have at most ${MAX_TOOL_CALLS} tool calls. Use them on the highest-leverage verifications. Do not call tools for things already plainly answered by the evidence. Do not loop on the same query/url.
- A null/no-data result from a tool is itself a verified fact — record it honestly and use it.
- If a tool returns an error, recover: try a different angle or proceed without that data, but never invent the missing number.

ABSOLUTE RULES for the final answer:
- Every claim must cite its source inline, e.g. "13 of 17 pages invisible (source: GSC top pages)" or "competitor maxandlily.com has 1758 words vs this page's 320 (source: fetch_page)". Never state a number without its source.
- Forecasts are CEILINGS and MUST use THIS site's own CTR curve (sum-of-clicks / sum-of-impressions per position) from the evidence. State the curve value you used.
- Tag each insight with the stakeholder roles it serves: client, dms, writer, brand, pm, investor.
- Honest and specific. No fluff. If something genuinely cannot be answered with the tools available, list it under open_questions with the role you'd ask.

WHEN YOU ARE DONE USING TOOLS, your FINAL message MUST be valid JSON only (no prose, no fences):
{
  "headline": "one-sentence verdict citing the key sourced number",
  "state_of_play": "2-3 sentence factual summary with sources",
  "answers": [
    {"question":"the panel question or default","roles":["client","dms"],"answer":"sourced answer","evidence":"the specific sourced figures","action":"what to do","impact":"ceiling, with the CTR-curve value used","effort":"low|medium|high","priority":1,"confidence":"high|medium|low"}
  ],
  "open_questions": ["what still needs verification, honestly"],
  "ninety_day_plan": "prioritised week1 / month1 / quarter1 sequence grounded in the answers"
}`;

  let userPrompt = `PILLAR: ${opts.pillar}\nData sources available: ${interro.data_sources.join(", ")}\nTarget pages: ${targetUrls.length}\n\nEVIDENCE FROM THE DEEP STEPS (already verified and sourced):\n\n${block}\n\nQUESTIONS TO SOLVE:\n${questions.join("\n")}\n`;
  if (opts.manavContext) userPrompt += `\nADDITIONAL CONTEXT FROM THE OPERATOR — address this too (URLs they name here can be inspected with fetch_page):\n"""\n${opts.manavContext}\n"""\n`;
  userPrompt += `\nInvestigate with the tools as needed, then produce the JSON solution. Cite a source inline for every figure.`;

  // ── Tool-use loop ──
  const ctx: ToolCtx = { projectId: opts.projectId, runId: opts.runId, pillar: opts.pillar, provenance, callsMade: 0 };
  const tools = toolsForPillar(opts.pillar);
  const messages: Array<{ role: "user" | "assistant"; content: any }> = [{ role: "user", content: userPrompt }];
  const startedAt = Date.now();
  let parsed: any = null;
  let loops = 0;

  while (loops < MAX_LOOP_TURNS) {
    loops++;
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) { await status(`Time budget reached after ${ctx.callsMade} tool calls — finalising`); break; }
    // Once over the cap, drop tools so model must produce final answer
    const remaining = MAX_TOOL_CALLS_HARD - ctx.callsMade;
    const turnTools = remaining > 0 ? tools : [];
    const res = await llmWithTools({
      system, messages, tools: turnTools,
      maxTokens: 8000, timeoutMs: 150000, label: `pillar-${opts.pillar}`,
    });
    if (!res) return { success: false, error: "Pillar analysis returned empty (LLM timeout or error)." };

    messages.push({ role: "assistant", content: res.content });

    // If the model wants tools and we have budget, run them and continue
    const toolUses = (res.content || []).filter((b: any) => b.type === "tool_use");
    if (res.stop_reason === "tool_use" && toolUses.length && ctx.callsMade < MAX_TOOL_CALLS_HARD) {
      const toolResults: any[] = [];
      for (const tu of toolUses) {
        if (ctx.callsMade >= MAX_TOOL_CALLS_HARD) {
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: "ERROR: tool-call budget exhausted; produce your final JSON now.", is_error: true });
          continue;
        }
        ctx.callsMade++;
        await status(`tool ${ctx.callsMade}/${MAX_TOOL_CALLS}: ${tu.name}(${JSON.stringify(tu.input).slice(0, 60)})`);
        const r = await dispatchTool(tu.name, tu.input || {}, ctx);
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: r.text, ...(r.is_error ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // No more tools requested — try to extract final JSON
    const finalText = (res.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    parsed = parseJsonResponse<any>(finalText);
    if (parsed) break;

    // The model ended without producing parseable JSON — prompt it once more
    messages.push({ role: "user", content: "Your last message wasn't valid JSON. Produce ONLY the JSON solution now, matching the schema exactly. No prose, no fences, no tools." });
  }

  if (!parsed) return { success: false, error: `Pillar analysis did not produce parseable JSON after ${loops} turns (${ctx.callsMade} tool calls).` };

  await status("Writing report");
  const md = renderPillarReport(opts.pillar, interro, parsed, provenance);

  // Persist — constraint-valid values; project_id is required (NOT NULL).
  try {
    const { data: panel } = await db().from("seo_campaign_panels")
      .select("id").eq("campaign_id", opts.campaignId || "").eq("pillar", opts.pillar).maybeSingle();

    const row: any = {
      campaign_id: opts.campaignId || null,
      project_id: opts.projectId,
      panel_id: (panel as any)?.id || null,
      pillar: opts.pillar,
      report_kind: "deep_analysis",
      title: (parsed.headline ? String(parsed.headline).slice(0, 200) : "") || `${opts.pillar} analysis`,
      summary: parsed.state_of_play ? String(parsed.state_of_play).slice(0, 500) : null,
      body_md: md,
      confidence_rating: avgConfidence(parsed.answers),
      generated_by: "manual",
      data_sources: interro.data_sources,
      // Schema-confirmed NOT NULL counters — set explicitly so the insert
      // succeeds whether or not the column carries a DB-side default.
      llm_calls_used: 1,
      web_searches_used: 0,
    };
    let { data: inserted, error } = await db().from("seo_campaign_reports").insert(row).select("id").single();
    if (error && /report_kind/i.test(error.message || "")) {
      const retry = await db().from("seo_campaign_reports").insert({ ...row, report_kind: "manual_refresh" }).select("id").single();
      inserted = retry.data; error = retry.error;
    }
    if (error) return { success: false, error: `report insert failed: ${error.message}` };

    if ((panel as any)?.id) {
      try {
        await db().from("seo_campaign_panels").update({
          current_summary: parsed.headline ? String(parsed.headline).slice(0, 500) : null,
          current_status: "covered",
          current_findings: parsed.answers || null,
          last_assessed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", (panel as any).id);
      } catch (e: any) { console.warn(`[pillar-scientist] panel update non-fatal: ${e?.message}`); }
    }
    await status("Done");
    return { success: true, report_id: (inserted as any).id };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

function renderPillarReport(pillar: string, interro: Interrogation, p: any, provenance: SourcedFact[]): string {
  const roleLabel: Record<string, string> = { client: "CLIENT", dms: "SPECIALIST", writer: "WRITER", brand: "BRAND", pm: "PM", investor: "INVESTOR", dev: "DEV" };
  const L: string[] = [];
  L.push(`# ${pillar.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} — Scientist Solution`);
  L.push("");
  if (p._raw) { L.push(`**Analyst:** ${interro.expert_role}`); L.push(""); L.push(p._raw); return L.join("\n"); }
  L.push(`> ${p.headline || ""}`);
  L.push("");
  L.push(`**Analyst:** ${interro.expert_role}`);
  L.push(`**Data sources:** ${interro.data_sources.join(", ")}`);
  L.push("");
  if (p.state_of_play) { L.push(`## State of play`); L.push(p.state_of_play); L.push(""); }
  const answers = (p.answers || []).slice().sort((a: any, b: any) => (a.priority || 5) - (b.priority || 5));
  L.push(`## Solved questions (${answers.length})`);
  L.push("");
  for (const a of answers) {
    const tags = (a.roles || []).map((r: string) => `[${roleLabel[r] || r.toUpperCase()}]`).join(" ");
    L.push(`### ${tags} ${a.question || ""}`);
    if (a.answer) L.push(`- **Answer:** ${a.answer}`);
    if (a.evidence) L.push(`- **Evidence:** ${a.evidence}`);
    if (a.action) L.push(`- **Action:** ${a.action}`);
    if (a.impact) L.push(`- **Impact:** ${a.impact}`);
    L.push(`- **Effort:** ${a.effort || "—"} · **Priority:** ${a.priority || "—"} · **Confidence:** ${a.confidence || "—"}`);
    L.push("");
  }
  if ((p.open_questions || []).length) { L.push(`## Open questions (need verification)`); for (const q of p.open_questions) L.push(`- ${q}`); L.push(""); }
  if (p.ninety_day_plan) { L.push(`## 90-day plan`); L.push(p.ninety_day_plan); L.push(""); }
  L.push(`## Provenance`);
  for (const f of provenance) L.push(`- ${f.source}: ${typeof f.value === "number" ? f.value : JSON.stringify(f.value)}${f.note ? ` (${f.note})` : ""} — ${new Date(f.fetched_at).toLocaleString()}`);
  return L.join("\n");
}

function avgConfidence(answers: any[]): string {
  if (!answers || !answers.length) return "medium";
  const score: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const avg = answers.reduce((s, a) => s + (score[a.confidence] || 2), 0) / answers.length;
  return avg >= 2.5 ? "high" : avg >= 1.5 ? "medium" : "low";
}
