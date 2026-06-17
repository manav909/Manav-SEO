/* ════════════════════════════════════════════════════════════════
   api/lib/season-pillar-deep-engine.ts

   THE DEEP PILLAR ENGINE — the masterwork analysis layer.

   ARCHITECTURE (Manav's vision):
   - The PIPELINE is a panel of expert minds. Each step interrogates the
     data with high-IQ questions from its specialty — forensic diagnosis,
     market context, what-if scenarios, fastest-path, best-combination of
     efforts, doubts to resolve. It passes verified facts AND its open
     questions + context down to the pillars.
   - The PILLARS are the deep engine. Each takes the panel's handoff and,
     with a far larger reasoning budget than the inline pipeline, produces
     the COMPLETE report for its domain: what exists (hard facts), what to
     do, why, the impact, the effort/timeline — ranked by best approach.
   - Every insight is ROLE-TAGGED so each stakeholder filters to theirs:
     client, dms (senior specialist), writer, brand, pm, dev.
   - HARD RULE: verified data only. No synthesis. Anything unproven is
     flagged as an open question requiring verification — never asserted.

   Output is structured JSON (role-tagged insights) so the UI can filter.
════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { ga4PullPageMetrics } from "./pm-ga4.js";
import { fetchSerpFeatures } from "./serpapi.js";

const MODEL             = "claude-sonnet-4-6";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const PSI_KEY           = process.env.PAGESPEED_API_KEY || "";

/* Stakeholder roles every pillar report tags its insights with */
export const STAKEHOLDER_ROLES = ["client", "dms", "writer", "brand", "pm", "dev"] as const;

/* ─── Timeout wrapper ──────────────────────────────────────────── */
async function withTimeout<T>(p: Promise<T>, label = "q", ms = 12000): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms)),
  ]).catch((e) => { console.warn(`[pillar-deep] ${e.message}`); return null; });
}

/* ─── Deep LLM call — large reasoning budget, JSON output ──────── */
async function deepLlm(system: string, user: string, maxTokens = 5000): Promise<string> {
  if (!ANTHROPIC_API_KEY) { console.error("[pillar-deep] no API key"); return ""; }
  // 120s hard cap — deep reports are large but must never hang the invocation.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) { console.error(`[pillar-deep] LLM ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`); return ""; }
    const d = await r.json();
    return (d?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  } catch (e: any) { console.error(`[pillar-deep] exc ${e?.message}${controller.signal.aborted ? " (timed out 120s)" : ""}`); return ""; }
  finally { clearTimeout(timer); }
}

/* ─── HTML fetch with AbortController hard-kill ─────────────────── */
async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", "Accept": "text/html,application/xhtml+xml,*/*" },
      redirect: "follow", signal: controller.signal,
    });
    /* never parse a 4xx/5xx body — an error or WAF challenge page is not the page,
       and treating it as content fabricates false 403/noindex/thin findings */
    if (!r.ok) return "";
    return (await r.text()) || "";
  } catch { return ""; } finally { clearTimeout(timer); }
}

/* ─── CrUX field data ──────────────────────────────────────────── */
async function runCrux(url: string): Promise<any> {
  if (!PSI_KEY) return null;
  try {
    const r = await withTimeout(
      fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${PSI_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, formFactor: "PHONE" }),
      }).then(x => x.json()), `CrUX(${url})`, 12000
    );
    const m = (r as any)?.record?.metrics;
    if (!m) return null;
    return {
      url,
      lcp_ms: m.largest_contentful_paint?.percentiles?.p75 ?? null,
      cls:    m.cumulative_layout_shift?.percentiles?.p75 ?? null,
      inp_ms: m.interaction_to_next_paint?.percentiles?.p75 ?? null,
    };
  } catch { return null; }
}

/* ─── Load all GSC + GA4 data for the project ────────────────────
   Build 12.17 — extended to include AI Overview attribution and AI
   platform referral summaries so the deep engine can reason about
   GEO-era surfaces alongside classic search performance. */
async function loadGsc(projectId: string): Promise<{
  topPages: any[]; topQueries: any[]; queryPagePairs: any[];
  aiOverviewSummary: any | null; ga4AiSummary: any | null; searchAppearance: any[];
}> {
  try {
    const r = await withTimeout(
      db().from("project_knowledge").select("field_key,field_value")
        .eq("project_id", projectId).in("field_key", [
          "gsc_top_pages", "gsc_top_queries", "gsc_query_page_pairs",
          "gsc_ai_overview_summary", "gsc_search_appearance",
          "ga4_ai_platform_summary",
        ]),
      "gsc"
    );
    const rows = ((r as any)?.data || []) as any[];
    const parseArr = (k: string) => {
      const row = rows.find(x => x.field_key === k);
      try { return row ? JSON.parse(row.field_value || "[]") : []; } catch { return []; }
    };
    const parseObj = (k: string) => {
      const row = rows.find(x => x.field_key === k);
      try { return row ? JSON.parse(row.field_value || "null") : null; } catch { return null; }
    };
    return {
      topPages:           parseArr("gsc_top_pages"),
      topQueries:         parseArr("gsc_top_queries"),
      queryPagePairs:     parseArr("gsc_query_page_pairs"),
      aiOverviewSummary:  parseObj("gsc_ai_overview_summary"),
      ga4AiSummary:       parseObj("ga4_ai_platform_summary"),
      searchAppearance:   parseArr("gsc_search_appearance"),
    };
  } catch {
    return {
      topPages: [], topQueries: [], queryPagePairs: [],
      aiOverviewSummary: null, ga4AiSummary: null, searchAppearance: [],
    };
  }
}

/* ─── Resolve the campaign's target pages ──────────────────────── */
async function loadTargetUrls(campaignId: string, projectId: string): Promise<string[]> {
  try {
    const r = await withTimeout(
      db().from("seo_campaigns").select("target_urls").eq("id", campaignId).maybeSingle(), "targets"
    );
    const urls = ((r as any)?.data as any)?.target_urls;
    if (Array.isArray(urls) && urls.length > 0) return urls.filter(Boolean);
  } catch { /* fall through */ }
  // Fallback: GSC top pages
  const { topPages } = await loadGsc(projectId);
  return topPages.slice(0, 30).map((p: any) => p.page || p.url).filter(Boolean);
}

/* ════════════════════════════════════════════════════════════════
   THE INTERROGATIONS — each pillar's expert question architecture.

   These are the high-IQ question sets a world-class specialist would
   relentlessly ask. Five lenses per pillar:
     forensic   — what EXACTLY is happening, traced to data
     market     — competitive / market context
     scenario   — what-if, fastest-path, best-combination of efforts
     impact     — quantified outcome + timeline + effort
     doubts     — what could mislead, what needs verification
════════════════════════════════════════════════════════════════ */
interface Interrogation {
  expert_role: string;
  data_sources: string[];
  forensic: string[];
  market: string[];
  scenario: string[];
  impact: string[];
  doubts: string[];
}

export const PILLAR_INTERROGATIONS: Record<string, Interrogation> = {
  visibility: {
    expert_role: "Senior Technical SEO Lead specialising in indexation and crawl",
    data_sources: ["GSC pages", "GSC queries", "GSC query-page pairs", "live HTML"],
    forensic: [
      "For each invisible page: is it crawled-not-indexed, discovered-not-crawled, or excluded? What is the precise indexation state?",
      "Is each invisible page present in the sitemap and internally linked, or is it orphaned with no crawl path?",
      "For visible pages with impressions but zero clicks: is the title/meta the cause, or is a SERP feature stealing the click?",
      "Which target pages share near-identical content and may be competing or canonicalising each other away?",
    ],
    market: [
      "For each near-ranking target page, who occupies the positions above it, and what specifically do those competitors have that this page lacks?",
      "Which queries show the site appearing via the WRONG page (a generic page ranking where a specialist target page should)?",
    ],
    scenario: [
      "Of all visibility problems, which SINGLE fix unlocks the most impressions for the least effort? State the 80/20.",
      "If indexation + title + internal-linking are fixed together on one page, is the compounded gain greater than doing them in isolation? Quantify.",
      "What is the fastest path to first incremental traffic — which 3 pages move first?",
    ],
    impact: [
      "For each priority page, project the click ceiling at improved position using its real impression volume (label as ceiling, query volume is shared).",
      "Give a realistic 30/60/90-day visibility trajectory if the prioritised actions are executed.",
    ],
    doubts: [
      "Are any 'invisible' pages intentionally noindexed or canonicalised (not a problem)? Flag for verification.",
      "Is any low CTR explained by brand/navigational queries rather than a fixable title issue?",
    ],
  },

  query_opportunity: {
    expert_role: "Senior SEO Strategist specialising in query intent and SERP positioning",
    data_sources: ["GSC queries", "GSC query-page pairs", "SerpAPI"],
    forensic: [
      "Which real query-page pairs sit at positions 4-20 with meaningful impressions — the genuine quick wins?",
      "Which queries have high impressions but a CTR far below the position benchmark, signalling a title/meta or intent-mismatch problem?",
      "Are target pages ranking for queries that do not match their commercial intent (informational query on a product page or vice versa)?",
    ],
    market: [
      "For the top 3 quick-win queries, what SERP features are present (PAA, shopping, video) and how do they change the realistic CTR ceiling?",
      "Who are the consistent organic competitors across these queries, and what query clusters do they dominate that the site is absent from?",
    ],
    scenario: [
      "Which query represents the single best effort-to-reward ratio to target first, and why?",
      "If we built one new page to capture an unserved high-impression query cluster, what is the realistic opportunity vs optimising an existing page?",
    ],
    impact: [
      "For each priority query, project realistic click gain at a target position using real impression volume and a sourced CTR-by-position benchmark.",
    ],
    doubts: [
      "Which queries are seasonal or trend-spiked and should NOT be treated as durable opportunities? Flag for verification.",
      "Are any high-impression queries actually irrelevant to the business (wrong intent)?",
    ],
  },

  on_page_health: {
    expert_role: "Senior On-Page SEO Specialist and content quality auditor",
    data_sources: ["live HTML crawl"],
    forensic: [
      "For each page: exact state of title tag, H1, meta description, word count, schema, canonical — cite the actual values found.",
      "Which pages have thin content (under ~300 words) relative to the query intent they target?",
      "Which pages have missing, duplicate, or truncated title tags / meta descriptions?",
      "Which pages lack structured data that competitors in this category typically deploy?",
    ],
    market: [
      "For the highest-value pages, what content depth and structure do page-1 competitors have that these pages lack?",
    ],
    scenario: [
      "Which on-page fix is mechanical and instant (title rewrite) vs which requires content investment? Separate the quick wins from the projects.",
      "Which single page, if fully optimised on-page, would benefit most given its existing impression volume?",
    ],
    impact: [
      "Rank every on-page issue by expected impact-to-effort, naming the specific page and the specific change.",
    ],
    doubts: [
      "For pages that failed to load during the crawl: flag as unverified — do not assume their on-page state.",
      "Is any 'thin' page intentionally thin (a hub/category page) where word count is not the right metric?",
    ],
  },

  technical_performance: {
    expert_role: "Senior Web Performance Engineer specialising in Core Web Vitals",
    data_sources: ["CrUX field data", "Site Manager lab baseline (if present)"],
    forensic: [
      "For each page with CrUX field data: exact p75 LCP, CLS, INP — which fail Google's thresholds (LCP>2.5s, CLS>0.1, INP>200ms) and by how much?",
      "Which pages have no field data, and is that because of low traffic (a fact to state) rather than a performance verdict?",
    ],
    market: [
      "Does poor performance correlate with the pages that most need to rank? Prioritise CWV fixes on commercially important pages.",
    ],
    scenario: [
      "Which performance fix (image optimisation, render-blocking JS, CLS anchors) addresses the most failing pages at once?",
    ],
    impact: [
      "State the Page Experience ranking risk for failing pages in concrete terms, citing the real metric values.",
    ],
    doubts: [
      "Never speculate on causes that lab/field data does not show. For pages without data, state plainly that no real-user signal exists yet.",
    ],
  },

  internal_links: {
    expert_role: "Senior SEO specialising in site architecture and PageRank flow",
    data_sources: ["live HTML crawl", "GSC pages (authority signal)"],
    forensic: [
      "Which target pages receive zero internal links from the site's high-authority (high-traffic) pages?",
      "Which authority pages exist that SHOULD link to target pages but do not?",
      "Is there a logical hub-and-spoke structure, or are target pages orphaned from the site's link graph?",
    ],
    market: [
      "How does the internal link depth of target pages compare to the typical structure that supports ranking in this category?",
    ],
    scenario: [
      "What is the single highest-leverage internal link to add (from which authority page to which target page) and why?",
      "If a hub page were created or strengthened, how would authority redistribute to the target cluster?",
    ],
    impact: [
      "For each recommended link, state the from-page, to-page, suggested anchor text, and why it helps — ranked by the authority of the source page.",
    ],
    doubts: [
      "For authority pages that could not be fetched: flag their link status as unverified.",
    ],
  },

  engagement: {
    expert_role: "Senior Analytics and CRO specialist",
    data_sources: ["GA4 per-page metrics"],
    forensic: [
      "For each page with GA4 data: sessions, engagement rate, bounce rate, conversions — which pages attract traffic but fail to engage or convert?",
      "Which pages have high engagement but low traffic (deserve more visibility) vs high traffic but low engagement (leaking value)?",
    ],
    market: [
      "Do the engagement patterns suggest an intent mismatch — are visitors arriving and immediately leaving because the page does not match their query?",
    ],
    scenario: [
      "Which page, if its engagement/conversion were fixed, would yield the most value given its existing traffic?",
      "Where is the biggest leak in the funnel from organic landing to conversion?",
    ],
    impact: [
      "Quantify the value at stake for the worst-converting high-traffic pages, using real session and conversion numbers.",
    ],
    doubts: [
      "For pages with no GA4 session data: state plainly there is insufficient traffic — do not infer engagement quality.",
    ],
  },

  monitoring: {
    expert_role: "Senior SEO performance analyst tracking trajectory",
    data_sources: ["GSC pages", "GA4 aggregate"],
    forensic: [
      "What is the aggregate organic trajectory across all target pages — rising, flat, or declining?",
      "Which specific pages improved and which slipped since the last measurement?",
    ],
    market: [
      "Is any movement attributable to seasonality or an algorithm update rather than the campaign's actions? Flag for verification.",
    ],
    scenario: [
      "Are the campaign's actions on track to hit the stated goal in the stated timeframe? If off-trajectory, what is the corrective priority?",
    ],
    impact: [
      "State the gap between current trajectory and goal, and what acceleration is needed.",
    ],
    doubts: [
      "Distinguish real movement from normal GSC data fluctuation and reporting lag.",
    ],
  },
};

/* ════════════════════════════════════════════════════════════════
   THE DEEP ANALYSIS — runs one pillar's full interrogation.
════════════════════════════════════════════════════════════════ */
/* Repair a JSON string that was cut off at the token limit. Strategy: walk the
   string tracking string/escape state and bracket depth; cut at the last point
   where we were at the top level between complete fields, then close all open
   brackets. Produces valid JSON containing every COMPLETE field, dropping only
   the half-written tail. */
function repairTruncatedJson(s: string): string {
  // Find the last position that sits on a clean boundary (just after a complete
  // value, i.e. right after a comma or a closing bracket) at ANY depth >= 1.
  // Cutting there preserves every complete element/field and drops only the
  // half-written tail. Then close all still-open brackets.
  let depth = 0;
  let inStr = false;
  let esc = false;
  let lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") { depth++; }
    else if (c === "}" || c === "]") { depth--; if (depth >= 1) lastSafe = i + 1; }
    else if (c === "," && depth >= 1) { lastSafe = i; }   // boundary BEFORE the next element
  }
  let out = s;
  if (lastSafe > 0 && (inStr || depth > 0)) {
    out = s.slice(0, lastSafe).replace(/,\s*$/, "");
  } else {
    out = s.replace(/,\s*$/, "");
  }
  // Recompute and close any open brackets on the trimmed string.
  inStr = false; esc = false;
  const open: string[] = [];
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") open.push("}");
    else if (c === "[") open.push("]");
    else if (c === "}" || c === "]") open.pop();
  }
  if (inStr) out += '"';
  while (open.length) out += open.pop();
  return out;
}


export async function runDeepPillarAnalysis(opts: {
  campaignId: string;
  pillar: string;
  projectId: string;
}): Promise<{ success: boolean; report_id?: string; error?: string; pillar_create_error?: string }> {
  const interro = PILLAR_INTERROGATIONS[opts.pillar];
  if (!interro) return { success: false, error: `Unknown pillar: ${opts.pillar}` };

  const targetUrls = await loadTargetUrls(opts.campaignId, opts.projectId);
  if (targetUrls.length === 0) return { success: false, error: "No target pages" };

  // Ensure the pillar panels exist (idempotent) — so a campaign that ran before
  // pillar creation, or whose creation failed, still gets its panels here.
  let pillarCreateError = "";
  try {
    const { createTrafficPillars } = await import("./season-traffic-pillars.js");
    const cr = await createTrafficPillars({ campaignId: opts.campaignId, projectId: opts.projectId, targetUrls });
    if (!cr.success && cr.error) {
      pillarCreateError = cr.error;
      console.error(`[pillar-deep] createTrafficPillars failed for ${opts.pillar}: ${cr.error}`);
    }
  } catch (e: any) {
    pillarCreateError = e?.message || "exception";
    console.error(`[pillar-deep] createTrafficPillars threw for ${opts.pillar}: ${e?.message}`);
  }

  const norm = (u: string) => (u || "").replace(/\/$/, "").toLowerCase();
  const targetSet = new Set(targetUrls.map(norm));

  /* ── Gather the VERIFIED data this pillar needs (no synthesis) ── */
  let dataBlock = "";

  if (["visibility", "query_opportunity", "internal_links", "monitoring"].includes(opts.pillar)) {
    const { topPages, topQueries, queryPagePairs, aiOverviewSummary, ga4AiSummary, searchAppearance } = await loadGsc(opts.projectId);
    const targetPairs = queryPagePairs.filter((p: any) => targetSet.has(norm(p.page)))
      .sort((a: any, b: any) => (b.impressions || 0) - (a.impressions || 0));
    const targetPages = topPages.filter((p: any) => targetSet.has(norm(p.page || p.url || "")));
    const invisible = targetUrls.filter(u => !topPages.some((p: any) => norm(p.page || p.url || "") === norm(u)));

    dataBlock += `\n## VERIFIED GSC DATA\n`;
    dataBlock += `Target pages: ${targetUrls.length} | Visible in GSC: ${targetPages.length} | Invisible (0 impressions): ${invisible.length}\n\n`;
    dataBlock += `INVISIBLE PAGES:\n${invisible.slice(0, 20).map(u => `- ${u.replace(/^https?:\/\/[^/]+/, "") || "/"}`).join("\n") || "- none"}\n\n`;
    dataBlock += `VISIBLE TARGET PAGES (GSC):\n${targetPages.slice(0, 20).map((p: any) => `- ${(p.page || p.url || "").replace(/^https?:\/\/[^/]+/, "") || "/"}: pos ${(p.position || 0).toFixed(1)}, ${p.impressions || 0} impr, ${p.clicks || 0} clicks`).join("\n") || "- none"}\n\n`;
    dataBlock += `REAL QUERY-PAGE PAIRS (GSC joined data — facts):\n${targetPairs.slice(0, 25).map((p: any) => `- "${p.query}" -> ${p.page.replace(/^https?:\/\/[^/]+/, "") || "/"}: ${p.impressions} impr, ${p.clicks} clicks, CTR ${p.ctr}%, pos ${p.position?.toFixed(1)}`).join("\n") || "- none"}\n\n`;
    dataBlock += `TOP SITE QUERIES:\n${topQueries.slice(0, 15).map((q: any) => `- "${q.query || q.keyword}": pos ${(q.position || 0).toFixed(1)}, ${q.impressions || 0} impr, ${q.clicks || 0} clicks`).join("\n") || "- none"}\n`;

    /* Build 12.17 — AI Overview + AI platform referral attribution.
       These are measured first-party signals from GSC searchAppearance
       and GA4 sessionSource. They are the GEO-era equivalent of the
       classic clicks/impressions data above. The LLM should treat them
       as evidence at the same confidence level. */
    if (aiOverviewSummary) {
      dataBlock += `\n## VERIFIED GSC AI OVERVIEW ATTRIBUTION (searchAppearance dimension)\n`;
      if (aiOverviewSummary.present) {
        dataBlock += `AI Overview is citing this site: ${aiOverviewSummary.total_impressions} impressions, ${aiOverviewSummary.total_clicks} clicks over the last ${aiOverviewSummary.window_days} days.\n`;
        const aoCtr = aiOverviewSummary.total_impressions > 0 ? ((aiOverviewSummary.total_clicks / aiOverviewSummary.total_impressions) * 100).toFixed(2) : '0.00';
        dataBlock += `AI Overview CTR: ${aoCtr}% (compare to typical organic CTR for context).\n`;
        if (Array.isArray(aiOverviewSummary.breakdown) && aiOverviewSummary.breakdown.length > 0) {
          dataBlock += `Breakdown by appearance type:\n${aiOverviewSummary.breakdown.slice(0, 5).map((b: any) => `- ${b.appearance}: ${b.impressions} impr, ${b.clicks} clicks`).join("\n")}\n`;
        }
      } else {
        dataBlock += `AI Overview is NOT yet citing this site in this window. This is a flagged GEO opportunity — the searchAppearance dimension explicitly registered zero AI Overview rows.\n`;
      }
    }
    if (Array.isArray(searchAppearance) && searchAppearance.length > 0) {
      dataBlock += `\n## FULL SERP-FEATURE BREAKDOWN (GSC)\n${searchAppearance.slice(0, 12).map((r: any) => `- ${r.appearance}: ${r.impressions} impr, ${r.clicks} clicks, CTR ${r.ctr}%, pos ${(r.position || 0).toFixed(1)}`).join("\n")}\n`;
    }
    if (ga4AiSummary) {
      dataBlock += `\n## VERIFIED GA4 AI PLATFORM REFERRALS (sessionSource filtered to known AI platforms)\n`;
      if (ga4AiSummary.sessions > 0) {
        dataBlock += `Sessions from AI platforms: ${ga4AiSummary.sessions} | Conversions: ${ga4AiSummary.conversions} | Window: ${ga4AiSummary.window_days} days\n`;
        dataBlock += `Detected platforms: ${(ga4AiSummary.platforms_detected || []).join(", ") || "(none in this window)"}\n`;
        const aiConvRate = ga4AiSummary.sessions > 0 ? ((ga4AiSummary.conversions / ga4AiSummary.sessions) * 100).toFixed(1) : '0.0';
        dataBlock += `AI platform conversion rate: ${aiConvRate}%\n`;
      } else {
        dataBlock += `No AI platform referral traffic detected in the last ${ga4AiSummary.window_days} days. Either the site is not yet cited in ChatGPT/Perplexity/Gemini/Claude/Copilot answers, or users finding it via AI are not clicking through.\n`;
      }
    }
    if (aiOverviewSummary || ga4AiSummary) {
      dataBlock += `\nWhen building recommendations for this pillar, treat AI Overview attribution and AI platform referrals as first-class measured signals. If the site has AI Overview citations, recommend defending and expanding them. If it does not, GEO opportunity is a real recommendation track — not a hedge, but a specific action.\n`;
    }

    // SerpAPI for query_opportunity — top quick-win query
    if (opts.pillar === "query_opportunity") {
      const tq = targetPairs.find((p: any) => (p.position || 0) >= 4 && (p.position || 0) <= 20);
      if (tq?.query) {
        const serp = await withTimeout(fetchSerpFeatures(tq.query, opts.projectId, {}), "serp", 15000);
        if (serp) {
          dataBlock += `\nLIVE SERP for "${tq.query}" (pos ${(tq.position || 0).toFixed(1)}):\n`;
          dataBlock += `- Features: ${(serp as any).features?.join(", ") || "none"}\n`;
          dataBlock += `- PAA: ${((serp as any).paa || []).slice(0, 4).join(" | ") || "none"}\n`;
          dataBlock += `- Top competitors: ${((serp as any).organic_results || []).slice(0, 5).map((r: any) => r.domain || r.link).join(", ") || "none"}\n`;
        }
      }
    }
  }

  if (["on_page_health", "internal_links"].includes(opts.pillar)) {
    const toFetch = targetUrls.slice(0, 12);
    const pages = await Promise.race([
      Promise.all(toFetch.map(async url => {
        const html = await fetchHtml(url);
        const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim() || "";
        const h1 = (html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, "").trim() || "";
        const meta = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || [])[1]?.trim() || "";
        const wc = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(w => w.length > 2).length;
        const noindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*\bnoindex\b/i.test(html);
        const schema = /application\/ld\+json/i.test(html);
        return { url, title, h1, meta, wc, noindex, schema, loaded: html.length > 500 };
      })),
      new Promise<any[]>((res) => setTimeout(() => res([]), 60000)),
    ]);
    dataBlock += `\n## VERIFIED ON-PAGE DATA (live crawl of ${(pages as any[]).length} pages)\n`;
    dataBlock += (pages as any[]).map((p: any) => `- ${p.url.replace(/^https?:\/\/[^/]+/, "") || "/"}: ${p.loaded ? `title "${p.title.slice(0, 60)}" (${p.title.length}ch), H1 "${p.h1.slice(0, 40)}", meta ${p.meta ? "yes" : "MISSING"}, ${p.wc} words, ${p.noindex ? "NOINDEX" : "indexable"}, schema ${p.schema ? "yes" : "no"}` : "FAILED TO LOAD (unverified)"}`).join("\n");
    dataBlock += "\n";
  }

  if (opts.pillar === "technical_performance") {
    const toTest = targetUrls.slice(0, 12);
    const crux = await Promise.race([
      Promise.all(toTest.map(runCrux)),
      new Promise<any[]>((res) => setTimeout(() => res([]), 45000)),
    ]);
    const valid = (crux as any[]).filter(Boolean);
    dataBlock += `\n## VERIFIED CORE WEB VITALS (CrUX field data, ${valid.length} of ${toTest.length} pages have data)\n`;
    dataBlock += valid.map((c: any) => `- ${c.url.replace(/^https?:\/\/[^/]+/, "") || "/"}: LCP ${c.lcp_ms ? (c.lcp_ms / 1000).toFixed(2) + "s" : "—"}, CLS ${c.cls ?? "—"}, INP ${c.inp_ms ? Math.round(c.inp_ms) + "ms" : "—"}`).join("\n") || "- No CrUX field data — pages lack sufficient real-user traffic (a fact, not a performance verdict)";
    dataBlock += "\n";
  }

  if (["engagement", "monitoring"].includes(opts.pillar)) {
    const toPull = targetUrls.slice(0, 12);
    const ga4 = await Promise.race([
      Promise.all(toPull.map(async url => {
        const path = url.replace(/^https?:\/\/[^/]+/, "") || "/";
        const m = await ga4PullPageMetrics({ projectId: opts.projectId, pagePath: path, days: 28 }).catch(() => null);
        return m ? { path, ...m } : null;
      })),
      new Promise<any[]>((res) => setTimeout(() => res([]), 45000)),
    ]);
    const valid = (ga4 as any[]).filter(Boolean);
    dataBlock += `\n## VERIFIED GA4 ENGAGEMENT (last 28 days, ${valid.length} of ${toPull.length} pages have data)\n`;
    dataBlock += valid.map((g: any) => `- ${g.path}: ${g.sessions} sessions, ${g.engagement_rate_pct}% engaged, ${g.bounce_rate_pct}% bounce, ${g.conversions} conversions`).join("\n") || "- No GA4 session data — pages lack sufficient traffic (a fact, not an engagement verdict)";
    dataBlock += "\n";
  }

  /* ── Build the interrogation prompt ── */
  const questionBlock = [
    `FORENSIC QUESTIONS (what exactly is happening — trace every answer to the data above):`,
    ...interro.forensic.map(q => `  - ${q}`),
    `\nMARKET / COMPETITIVE QUESTIONS:`,
    ...interro.market.map(q => `  - ${q}`),
    `\nSCENARIO QUESTIONS (what-if, fastest-path, best-combination of efforts):`,
    ...interro.scenario.map(q => `  - ${q}`),
    `\nIMPACT QUESTIONS (quantify outcome, effort, timeline):`,
    ...interro.impact.map(q => `  - ${q}`),
    `\nDOUBTS TO RESOLVE (flag anything unproven — never assert it):`,
    ...interro.doubts.map(q => `  - ${q}`),
  ].join("\n");

  const system = `You are a ${interro.expert_role}. You are producing the definitive deep-analysis report for the "${opts.pillar}" pillar of an SEO traffic-growth campaign. This report will be read by the client, a senior digital marketing specialist, a content writer, a brand manager, a project manager, and a developer — each must find exactly what concerns them.

ABSOLUTE RULES:
- Use ONLY the verified data provided. Every factual claim must trace to a specific number or fact in the data block. NEVER synthesize, estimate-as-fact, or invent.
- Anything you cannot prove from the data is an OPEN QUESTION requiring verification — state it as such, never assert it.
- Forecasts are CEILINGS (query impressions are shared across pages) and must cite a sourced benchmark or be omitted.
- Be brutally honest. If the data is thin, say so. If a page is fine, say so. Do not manufacture problems or inflate impact.
- This must be so complete and impactful that following it achieves the goal. Leave nothing out within this pillar's domain.

OUTPUT FORMAT — respond with ONLY valid JSON, no preamble, no markdown fences:
{
  "headline": "one-sentence verdict for this pillar, citing the key number",
  "state_of_play": "2-3 sentence factual summary of what exists right now",
  "insights": [
    {
      "roles": ["client"|"dms"|"writer"|"brand"|"pm"|"dev"],  // which stakeholders this matters to (1+)
      "finding": "what is true, traced to data",
      "evidence": "the specific number/fact from the data",
      "action": "exactly what to do",
      "why": "why it matters / the mechanism",
      "impact": "expected outcome (label ceilings)",
      "effort": "low"|"medium"|"high",
      "priority": 1-5,  // 1 = do first
      "confidence": "high"|"medium"|"low"
    }
  ],
  "open_questions": ["things that need verification before acting — be honest about gaps"],
  "ninety_day_plan": "a tight prioritised sequence: what to do in week 1, month 1, quarter 1, grounded in the insights"
}

Provide 6-10 high-quality insights covering all relevant roles. Quality over quantity — every insight must be specific, evidenced, and actionable. Keep each field concise (1-3 sentences) so the full JSON object completes within the response.`;

  const user = `PILLAR: ${opts.pillar}
Data sources leveraged: ${interro.data_sources.join(", ")}
Target pages in campaign: ${targetUrls.length}
${dataBlock}

INTERROGATION — answer every question below against the verified data:
${questionBlock}

Produce the complete JSON report now.`;

  const raw = await deepLlm(system, user, 8000);
  if (!raw) return { success: false, error: "Deep analysis returned empty (LLM gave no output — likely timeout or API error)" };

  // Parse JSON robustly. Two failure modes to handle:
  //  1. The model wraps the object in prose/fences → strip + extract { ... }.
  //  2. The response was truncated at the token limit mid-JSON → the braces
  //     don't close, so repair by trimming to the last complete field and
  //     closing the open structures before parsing.
  let parsed: any;
  let parseFailed = false;
  const extractAndParse = (text: string): any => {
    let clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const first = clean.indexOf("{");
    if (first === -1) throw new Error("no object");
    clean = clean.slice(first);
    // Try as-is first (handles the complete, well-formed case).
    try { return JSON.parse(clean); } catch { /* try repair */ }
    return JSON.parse(repairTruncatedJson(clean));
  };
  try {
    parsed = extractAndParse(raw);
  } catch (e: any) {
    console.error(`[pillar-deep] JSON parse failed for ${opts.pillar} even after repair. Head: ${raw.slice(0, 200)}`);
    parseFailed = true;
    parsed = {
      headline: `${opts.pillar.replace(/_/g, " ")} analysis`,
      state_of_play: "",
      insights: [],
      open_questions: [],
      ninety_day_plan: "",
      _raw: raw,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { success: false, error: "Deep analysis parsed to a non-object" };
  }

  /* ── Render to markdown for storage + reading ── */
  const md = renderReport(opts.pillar, interro, parsed);

  /* ── Persist as a campaign report ── */
  try {
    const { data: panel } = await db().from("seo_campaign_panels")
      .select("id").eq("campaign_id", opts.campaignId).eq("pillar", opts.pillar).maybeSingle();

    // Use values the existing CHECK constraints already allow, so this works
    // with NO database migration:
    //   generated_by ∈ {cron, manual, pipeline}      → use 'manual'
    //   report_kind  ∈ {... , (deep_analysis if migrated)} → try deep_analysis,
    //                  fall back to 'manual_refresh' which is always allowed.
    // The report is identified by its pillar, not its kind, so the fallback is fine.
    const baseRow: any = {
      campaign_id:       opts.campaignId,
      project_id:        opts.projectId,   // REQUIRED — NOT NULL column; its absence was rejecting every insert
      panel_id:          (panel as any)?.id || null,
      pillar:            opts.pillar,
      report_kind:       "deep_analysis",
      title:             (parsed.headline ? String(parsed.headline).slice(0, 200) : "") || `${opts.pillar} deep analysis`,
      summary:           parsed.state_of_play ? String(parsed.state_of_play).slice(0, 500) : null,
      body_md:           md,
      confidence_rating: avgConfidence(parsed.insights),
      generated_by:      "manual",
      data_sources:      interro.data_sources,
    };

    let { data: inserted, error } = await db().from("seo_campaign_reports").insert(baseRow).select("id").single();

    // If report_kind='deep_analysis' is rejected (migration not run), fall back
    // to 'manual_refresh' — an always-allowed kind. Frontend matches by pillar.
    if (error && /report_kind/i.test(error.message || "")) {
      console.error(`[pillar-deep] deep_analysis kind rejected, using manual_refresh: ${error.message}`);
      const retry = await db().from("seo_campaign_reports").insert({ ...baseRow, report_kind: "manual_refresh" }).select("id").single();
      inserted = retry.data; error = retry.error;
    }
    // Last-resort minimal row (still using only valid values).
    if (error) {
      console.error(`[pillar-deep] insert failed (${error.message}), retrying minimal row`);
      const retry = await db().from("seo_campaign_reports").insert({
        campaign_id: opts.campaignId, project_id: opts.projectId, panel_id: (panel as any)?.id || null,
        pillar: opts.pillar, report_kind: "manual_refresh",
        title: baseRow.title, body_md: md, generated_by: "manual",
      }).select("id").single();
      inserted = retry.data; error = retry.error;
    }
    if (error) return { success: false, error: `report insert failed: ${error.message}` };

    // Update the panel summary — isolated in its own try/catch so a panel-update
    // failure (e.g. a CHECK constraint on current_status) can NEVER fail the
    // report write that already succeeded above. Use 'covered' — the same value
    // season-traffic-pillars uses for a fully-analysed pillar.
    if ((panel as any)?.id) {
      try {
        await db().from("seo_campaign_panels").update({
          current_summary: parsed.headline ? String(parsed.headline).slice(0, 500) : null,
          current_status:  "covered",
          current_findings: parsed.insights || null,
          last_assessed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", (panel as any).id);
      } catch (e: any) {
        console.warn(`[pillar-deep] panel summary update failed (non-fatal): ${e?.message}`);
      }
    }

    return { success: true, report_id: (inserted as any).id, pillar_create_error: pillarCreateError || undefined };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

/* ─── Render the structured report to markdown ─────────────────── */
function renderReport(pillar: string, interro: Interrogation, p: any): string {
  const roleLabel: Record<string, string> = {
    client: "CLIENT", dms: "SPECIALIST", writer: "WRITER", brand: "BRAND", pm: "PM", dev: "DEV",
  };
  const lines: string[] = [];
  lines.push(`# ${pillar.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} — Deep Analysis`);
  lines.push("");

  // Fallback: JSON parse failed, store the model's raw analysis directly.
  if (p._raw) {
    lines.push(`**Analyst:** ${interro.expert_role}`);
    lines.push(`**Data sources:** ${interro.data_sources.join(", ")}`);
    lines.push("");
    lines.push(p._raw);
    return lines.join("\n");
  }

  lines.push(`> ${p.headline || ""}`);
  lines.push("");
  lines.push(`**Analyst:** ${interro.expert_role}`);
  lines.push(`**Data sources:** ${interro.data_sources.join(", ")}`);
  lines.push("");
  if (p.state_of_play) { lines.push(`## State of play`); lines.push(p.state_of_play); lines.push(""); }

  // Insights sorted by priority
  const insights = (p.insights || []).slice().sort((a: any, b: any) => (a.priority || 5) - (b.priority || 5));
  lines.push(`## Insights (${insights.length})`);
  lines.push("");
  for (const ins of insights) {
    const tags = (ins.roles || []).map((r: string) => `[${roleLabel[r] || r.toUpperCase()}]`).join(" ");
    lines.push(`### ${tags} ${ins.finding || ""}`);
    if (ins.evidence) lines.push(`- **Evidence:** ${ins.evidence}`);
    if (ins.action)   lines.push(`- **Action:** ${ins.action}`);
    if (ins.why)      lines.push(`- **Why:** ${ins.why}`);
    if (ins.impact)   lines.push(`- **Impact:** ${ins.impact}`);
    lines.push(`- **Effort:** ${ins.effort || "—"} · **Priority:** ${ins.priority || "—"} · **Confidence:** ${ins.confidence || "—"}`);
    lines.push("");
  }

  if ((p.open_questions || []).length > 0) {
    lines.push(`## Open questions (need verification — not yet proven)`);
    for (const q of p.open_questions) lines.push(`- ${q}`);
    lines.push("");
  }
  if (p.ninety_day_plan) { lines.push(`## 90-day plan`); lines.push(p.ninety_day_plan); lines.push(""); }

  return lines.join("\n");
}

function avgConfidence(insights: any[]): string {
  if (!insights || insights.length === 0) return "medium";
  const score = { high: 3, medium: 2, low: 1 } as Record<string, number>;
  const avg = insights.reduce((s, i) => s + (score[i.confidence] || 2), 0) / insights.length;
  return avg >= 2.5 ? "high" : avg >= 1.5 ? "medium" : "low";
}

/* ─── Run ALL pillars for a campaign (sequential to respect budget) ── */
export async function runAllDeepPillars(opts: {
  campaignId: string; projectId: string;
}): Promise<{ success: boolean; results: Record<string, string> }> {
  const results: Record<string, string> = {};
  for (const pillar of Object.keys(PILLAR_INTERROGATIONS)) {
    const r = await runDeepPillarAnalysis({ ...opts, pillar });
    results[pillar] = r.success ? "ok" : (r.error || "failed");
  }
  return { success: true, results };
}
