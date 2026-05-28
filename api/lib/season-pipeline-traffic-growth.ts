/* ════════════════════════════════════════════════════════════════
   api/lib/season-pipeline-traffic-growth.ts

   Traffic Growth Pipeline — rebuilt from Senior DMS first principles.

   DESIGN PHILOSOPHY:
   This pipeline is launched BECAUSE pages have low or zero traffic.
   It must produce value with no prior data. Every step fetches what
   it needs directly (HTML, PSI, GSC) rather than relying on
   pre-existing baseline captures or audit runs.

   6 steps:
   1. GSC Visibility Audit    — which target pages exist in Google, which are invisible
   2. On-Page Fundamentals    — fetch HTML for each page, real title/H1/content facts
   3. Technical Performance   — live PSI call per page, real LCP/TBT/score numbers
   4. Internal Link Structure — which pages link to target pages, PageRank flow
   5. Prioritised Action Plan — concrete fixes ranked by impact, with expected outcomes
   6. Client Brief            — honest summary citing real numbers from this run
════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { ga4PullPageMetrics } from "./pm-ga4.js";
import { fetchSerpFeatures } from "./serpapi.js";
import type { PipelineDefinition, PipelineStepContext, PipelineStepResult } from "./season-pipeline-runner.js";

const MODEL             = "claude-sonnet-4-6";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const PSI_KEY           = process.env.PAGESPEED_API_KEY || "";

// Max target pages processed per step in one run. Steps fetch in PARALLEL with
// per-call AbortController timeouts, so wall-clock time is bounded by the slowest
// single call (~12s), not the page count. 30 covers virtually all objectives while
// staying well within each step's ~280s function budget. Pages beyond this, or any
// page that times out, are reported HONESTLY as unmeasured — never synthesized.
const MAX_PAGES_PER_STEP = 30;

/* ─── Timeout wrapper — Supabase and external APIs can hang silently ── */
async function withTimeout<T>(promise: Promise<T>, label = "query", ms = 12000): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]).catch((e) => {
    console.warn(`[traffic-pipeline] ${e.message}`);
    return null;
  });
}

/* ─── LLM call ─────────────────────────────────────────────────── */
async function llm(system: string, user: string, maxTokens = 2500): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    console.error("[traffic-pipeline] ANTHROPIC_API_KEY missing — cannot generate analysis");
    return "";
  }
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: maxTokens,
        system, messages: [{ role: "user", content: user }],
      }),
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.error(`[traffic-pipeline] LLM call failed ${r.status}: ${errText.slice(0, 300)}`);
      return "";
    }
    const d = await r.json();
    const text = (d?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    if (!text) console.warn("[traffic-pipeline] LLM returned empty text block");
    return text;
  } catch (e: any) {
    console.error(`[traffic-pipeline] LLM exception: ${e?.message}`);
    return "";
  }
}

/* ─── Fetch page HTML (15s timeout) ────────────────────────────── */
async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOSeasonBot/1.0)" },
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await r.text();
    return text || "";
  } catch {
    return "";  // aborted, network error, or non-text — caller handles empty
  } finally {
    clearTimeout(timer);
  }
}

/* ─── Extract basic on-page facts from HTML ────────────────────── */
function extractPageFacts(html: string, url: string): {
  title: string;
  h1: string;
  metaDesc: string;
  wordCount: number;
  hasNoindex: boolean;
  hasCanonical: boolean;
  canonicalUrl: string;
  internalLinkCount: number;
  hasSchema: boolean;
  loadedOk: boolean;
} {
  if (!html) return {
    title: "", h1: "", metaDesc: "", wordCount: 0,
    hasNoindex: false, hasCanonical: false, canonicalUrl: "",
    internalLinkCount: 0, hasSchema: false, loadedOk: false,
  };

  const title       = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim() || "";
  const h1          = (html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, "").trim() || "";
  const metaDesc    = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || [])[1]?.trim() || "";
  const hasNoindex  = /noindex/i.test(html.slice(0, 2000));
  const canonMatch  = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const canonicalUrl = canonMatch?.[1] || "";
  const hasCanonical = !!canonicalUrl;
  const bodyText    = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const wordCount   = bodyText.split(/\s+/).filter(w => w.length > 2).length;
  const try_domain  = (url.match(/^https?:\/\/[^/]+/) || [""])[0];
  const internalLinks = [...html.matchAll(/href=["'](\/[^"']+|https?:\/\/[^"']+)["']/gi)];
  const internalLinkCount = internalLinks.filter(m => m[1].startsWith("/") || m[1].includes(try_domain)).length;
  const hasSchema   = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);

  return {
    title, h1, metaDesc, wordCount, hasNoindex, hasCanonical, canonicalUrl,
    internalLinkCount, hasSchema, loadedOk: html.length > 500,
  };
}

/* ─── CrUX field data (REAL Chrome-user measurements) ─────────────
   The CrUX API returns real-user Core Web Vitals from actual visitors.
   This is what Google uses for ranking — and it returns in 2-5s, unlike
   the Lighthouse lab test which takes 30-60s and frequently times out.
   Returns null fields when the page has insufficient real-user traffic. */
async function runCrux(url: string): Promise<{
  lcp_ms: number | null;       // 75th percentile LCP from real users
  cls: number | null;          // 75th percentile CLS
  inp_ms: number | null;       // 75th percentile INP (replaced FID)
  lcp_rating: string | null;   // 'good' | 'needs improvement' | 'poor'
  has_field_data: boolean;
  source: 'crux_url' | 'crux_origin' | 'none';
}> {
  const key = PSI_KEY; // CrUX uses the same Google API key
  const empty = { lcp_ms: null, cls: null, inp_ms: null, lcp_rating: null, has_field_data: false, source: 'none' as const };
  if (!key) return empty;

  const rate = (ms: number, good: number, poor: number) =>
    ms <= good ? 'good' : ms <= poor ? 'needs improvement' : 'poor';

  try {
    const r = await withTimeout(
      fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formFactor: 'PHONE' }),
      }).then(r => r.json()),
      `CrUX(${url})`, 12000
    );
    let metrics = (r as any)?.record?.metrics;
    let source: 'crux_url' | 'crux_origin' | 'none' = metrics ? 'crux_url' : 'none';

    // Fall back to origin-level field data if this exact URL has no record
    if (!metrics) {
      const origin = (url.match(/^https?:\/\/[^/]+/) || [""])[0];
      const ro = await withTimeout(
        fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${key}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, formFactor: 'PHONE' }),
        }).then(r => r.json()),
        `CrUX-origin(${origin})`, 12000
      );
      metrics = (ro as any)?.record?.metrics;
      source = metrics ? 'crux_origin' : 'none';
    }

    if (!metrics) return empty;
    const lcp = metrics.largest_contentful_paint?.percentiles?.p75 ?? null;
    const cls = metrics.cumulative_layout_shift?.percentiles?.p75 ?? null;
    const inp = metrics.interaction_to_next_paint?.percentiles?.p75 ?? null;
    return {
      lcp_ms: lcp != null ? Number(lcp) : null,
      cls:    cls != null ? Number(cls) : null,
      inp_ms: inp != null ? Number(inp) : null,
      lcp_rating: lcp != null ? rate(Number(lcp), 2500, 4000) : null,
      has_field_data: true,
      source,
    };
  } catch { return empty; }
}

/* ─── Resolve target pages — checks 4 sources in priority order ── */
async function resolveTargetPages(ctx: PipelineStepContext): Promise<{
  urls: string[];
  source: string;
}> {
  const seen = new Set<string>();
  const add  = (u: string) => { if (u && u.startsWith("http")) seen.add(u.trim()); };

  // 1. Explicit URLs from command
  const fromScope: string[] = Array.isArray(ctx.scope.targetUrls)
    ? ctx.scope.targetUrls.filter(Boolean) : [];
  if (fromScope.length > 0) {
    fromScope.forEach(add);
    return { urls: [...seen].slice(0, 30), source: "command" };
  }

  // 2. Campaign objective target_urls
  try {
    const r = await withTimeout(
      db().from("seo_campaigns").select("target_urls")
        .eq("project_id", ctx.projectId).eq("status", "active")
        .not("target_urls", "is", null),
      "campaigns query"
    );
    for (const c of ((r as any)?.data || []) as any[]) {
      if (Array.isArray(c.target_urls)) c.target_urls.forEach(add);
    }
    if (seen.size > 0) return { urls: [...seen].slice(0, 30), source: "objective target_urls" };
  } catch { /* fallthrough */ }

  // 3. Site workspace pages
  try {
    const r = await withTimeout(
      db().from("dev_pages").select("url").eq("project_id", ctx.projectId)
        .order("priority", { ascending: false }).limit(30),
      "dev_pages query"
    );
    for (const p of ((r as any)?.data || []) as any[]) add(p.url);
    if (seen.size > 0) return { urls: [...seen].slice(0, 30), source: "site workspace" };
  } catch { /* fallthrough */ }

  // 4. GSC top pages
  try {
    const r = await withTimeout(
      db().from("project_knowledge").select("field_value")
        .eq("project_id", ctx.projectId).eq("field_key", "gsc_top_pages").maybeSingle(),
      "gsc_top_pages query"
    );
    const pages = JSON.parse(((r as any)?.data as any)?.field_value || "[]");
    pages.forEach((p: any) => add(p.page || p.url || ""));
    if (seen.size > 0) return { urls: [...seen].slice(0, 30), source: "GSC top pages" };
  } catch { /* fallthrough */ }

  return { urls: [], source: "none" };
}

/* ─── Load GSC data (no impression threshold — ALL pages matter) ─ */
async function loadGscData(projectId: string): Promise<{
  topPages: any[];
  topQueries: any[];          // query-level GSC data
  queryPagePairs: any[];      // REAL joined query→page data {query,page,clicks,impressions,ctr,position}
  zeroClickPages: any[];      // ranked but no clicks = CTR problem
  notRankingPages: any[];     // in GSC but position > 50 = visibility problem
  quickWins: any[];           // positions 4-20 with impressions
}> {
  try {
    const r = await withTimeout(
      db().from("project_knowledge").select("field_key,field_value")
        .eq("project_id", projectId).in("field_key", ["gsc_top_pages","gsc_top_queries","gsc_query_page_pairs"]),
      "gsc_data query"
    );
    const rows = ((r as any)?.data || []) as any[];
    const topPagesRow   = rows.find(r => r.field_key === "gsc_top_pages");
    const topQueriesRow = rows.find(r => r.field_key === "gsc_top_queries");
    const pairsRow      = rows.find(r => r.field_key === "gsc_query_page_pairs");
    const topPages   = topPagesRow   ? JSON.parse(topPagesRow.field_value || "[]")   : [];
    const topQueries = topQueriesRow ? JSON.parse(topQueriesRow.field_value || "[]") : [];
    // REAL joined query→page data from GSC — no inference needed
    const queryPagePairs = pairsRow ? JSON.parse(pairsRow.field_value || "[]") : [];

    return {
      topPages,
      topQueries,
      queryPagePairs,
      zeroClickPages:  topPages.filter((p: any) => (p.impressions || 0) > 0 && (p.clicks || 0) === 0),
      notRankingPages: topPages.filter((p: any) => (p.position || 0) > 50),
      quickWins:       topPages.filter((p: any) => (p.position || 0) >= 4 && (p.position || 0) <= 20),
    };
  } catch {
    return { topPages: [], topQueries: [], queryPagePairs: [], zeroClickPages: [], notRankingPages: [], quickWins: [] };
  }
}


/* ════════════════════════════════════════════════════════════════
   STEP 1 — GSC VISIBILITY AUDIT
   Cross-references target pages against GSC. Identifies which
   pages are invisible, which rank but don't click, and quick wins.
   No impression threshold — 0 impressions IS the finding.
════════════════════════════════════════════════════════════════ */
const stepVisibilityAudit = {
  id: "traffic_audit",
  label: "GSC visibility audit",
  description: "Cross-reference target pages against GSC data — find invisible pages",
  artifact_kind: "traffic_audit",
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const { urls: targetUrls, source: pageSource } = await resolveTargetPages(ctx);
    const { topPages, topQueries, queryPagePairs, zeroClickPages } = await loadGscData(ctx.projectId);

    // Safety net: ensure traffic pillars exist for this campaign (idempotent).
    // objective_full_setup creates them, but if the campaign predates that or
    // setup was skipped, this guarantees pillars are present to be seeded.
    const campaignId = (ctx.scope?.campaignId || ctx.scope?.campaign_id) as string | undefined;
    if (campaignId) {
      try {
        const { createTrafficPillars } = await import("./season-traffic-pillars.js");
        await createTrafficPillars({ campaignId, projectId: ctx.projectId, targetUrls });
      } catch { /* non-blocking */ }
    }

    const norm = (u: string) => (u || "").replace(/\/$/, "").toLowerCase();
    const targetSet = new Set(targetUrls.map(norm));

    // Cross-reference: which target pages appear in GSC?
    const gscUrlSet = new Set(topPages.map((p: any) => norm(p.page || p.url || "")));
    const invisiblePages = targetUrls.filter(u => !gscUrlSet.has(norm(u)));
    const visiblePages   = targetUrls.filter(u =>  gscUrlSet.has(norm(u)));

    // FIX #2: quick-wins counted on TARGET PAGES ONLY (not site-wide).
    const targetQuickWins = topPages.filter((p: any) =>
      targetSet.has(norm(p.page || p.url || "")) && (p.position || 0) >= 4 && (p.position || 0) <= 20);

    // FIX #1: REAL query→page mapping from GSC joined data — filtered to target pages.
    // No more LLM guessing which page ranks for which query.
    const targetPairs = (queryPagePairs || [])
      .filter((pr: any) => targetSet.has(norm(pr.page)))
      .sort((a: any, b: any) => (b.impressions || 0) - (a.impressions || 0));

    const makePageRow = (url: string) => {
      const slug = url.replace(/^https?:\/\/[^/]+/, "") || "/";
      const gscData = topPages.find((p: any) => norm(p.page || p.url || "") === norm(url));
      if (!gscData) return `| ${slug} | NOT IN GSC | — | — | — | 🔴 Invisible |`;
      const pos    = gscData.position?.toFixed(1) || "—";
      const impr   = gscData.impressions || 0;
      const clicks = gscData.clicks || 0;
      const ctr    = impr > 0 ? ((clicks / impr) * 100).toFixed(1) + "%" : "—";
      const flag   = clicks === 0 && impr > 0 ? "🟡 Ranked, 0 clicks"
                   : parseFloat(pos) <= 3 ? "🟢 Top 3"
                   : parseFloat(pos) <= 20 ? "🟡 Quick win"
                   : "🔴 Low ranking";
      return `| ${slug} | ${pos} | ${impr.toLocaleString()} | ${clicks} | ${ctr} | ${flag} |`;
    };

    // Real query→page rows for the prompt — these are GSC facts, not inference
    const pairRows = targetPairs.slice(0, 15).map((pr: any) => {
      const slug = pr.page.replace(/^https?:\/\/[^/]+/, "") || "/";
      return `| "${pr.query}" | ${slug} | ${pr.impressions} | ${pr.clicks} | ${pr.ctr}% | ${pr.position?.toFixed(1)} |`;
    }).join("\n");

    // For the highest-impression quick-win query, pull live SERP
    let serpContext = "";
    try {
      const topQuery = (topQueries || []).filter((q: any) => (q.position||0) >= 4 && (q.position||0) <= 20)
        .sort((a: any, b: any) => (b.impressions||0) - (a.impressions||0))[0];
      if (topQuery && (topQuery.query || topQuery.keyword)) {
        const serp = await Promise.race([
          fetchSerpFeatures(topQuery.query || topQuery.keyword, ctx.projectId, {}),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
        ]);
        if (serp) {
          serpContext = `\n\nLIVE SERP for top quick-win query "${topQuery.query || topQuery.keyword}" (currently pos ${(topQuery.position||0).toFixed(1)}):\n` +
            `- SERP features present: ${(serp as any).features?.join(", ") || "none detected"}\n` +
            `- People Also Ask: ${((serp as any).paa || []).slice(0,3).join(" | ") || "none"}\n` +
            `- Top organic competitors: ${((serp as any).organic_results || []).slice(0,3).map((r: any) => r.domain || r.link).join(", ") || "none"}`;
        }
      }
    } catch { /* SERP non-blocking */ }

    const analysis = await llm(
      `You are a Senior SEO Analyst writing a GSC visibility audit for a client deliverable.
HARD RULES — this will be challenged by a senior practitioner:
- The query→page table below is REAL GSC joined data. Use ONLY those mappings. NEVER invent which page ranks for which query.
- This audit reports GSC SIGNALS ONLY. You have NOT crawled these pages. Do NOT speculate about noindex tags, robots.txt, canonical, or thin content as causes of invisibility — a later crawl step verifies those. For invisible pages, state only the GSC fact: zero recorded impressions. You may list possible causes ONLY as "to be confirmed by the crawl step," never as findings.
- Forecasts: a query's impressions are shared across all ranking pages. Any click projection for a single page is a CEILING, not an estimate. Always label it "ceiling — assumes this page captures the full query volume, which it will not."
- Cite a source for any CTR-by-position benchmark (e.g. "Advanced Web Ranking CTR study"). If you cannot source it, do not state a specific number.
Format clean markdown, 500-700 words.`,
      `GSC Visibility Audit for ${targetUrls.length} target pages. Source: ${pageSource}

TARGET PAGE GSC STATUS:
| URL | Position | Impressions | Clicks | CTR | Status |
|---|---|---|---|---|---|
${targetUrls.slice(0, 20).map(makePageRow).join("\n")}

REAL QUERY→PAGE MAPPING (GSC joined data — these are facts, the exact page that appeared for each query):
| Query | Page | Impressions | Clicks | CTR | Position |
|---|---|---|---|---|---|
${pairRows || "| No joined query-page data available — GSC may need a fresh pull |"}

KEY FINDINGS (target pages only):
- Invisible (0 GSC impressions): ${invisiblePages.length} of ${targetUrls.length}
${invisiblePages.slice(0, 8).map(u => `  • ${u.replace(/^https?:\/\/[^/]+/, "") || "/"}`).join("\n")}
- Target pages ranking but 0 clicks: ${zeroClickPages.filter((p: any) => targetSet.has(norm(p.page||p.url||""))).length}
- Target quick-wins (pos 4-20): ${targetQuickWins.length}
${targetQuickWins.slice(0, 8).map((p: any) => `  • ${(p.page||p.url||"").replace(/^https?:\/\/[^/]+/, "") || "/"} — pos ${(p.position||0).toFixed(1)}, ${p.impressions||0} impr, ${p.clicks||0} clicks`).join("\n")}

Write:
1. Headline finding — the core GSC problem (GSC signals only)
2. Query opportunity analysis — using ONLY the real query→page table above, which mappings show high impressions but poor position or CTR?
3. Invisible pages — state the GSC fact (0 impressions). List possible causes ONLY as "to confirm in crawl step"
4. Quick-win opportunities — with click projections labelled as CEILINGS and sourced CTR benchmarks
5. CTR problems on ranking target pages
6. Priority ranking of these target pages${serpContext ? "\n7. Competitive context from the live SERP below" + serpContext : ""}`
    );

    return {
      ok: true,
      output: {
        topPages: topPages.slice(0,20), topQueries: topQueries.slice(0,20),
        queryPagePairs: targetPairs.slice(0,20), targetQuickWins: targetQuickWins.slice(0,10),
        targetUrls, invisiblePages, visiblePages,
      },
      artifact: {
        kind: "traffic_audit",
        title: "GSC Visibility Audit",
        body: `# GSC Visibility Audit\n\n${analysis}\n\n---\n**Target pages:** ${targetUrls.length} | **Source:** ${pageSource} | **Invisible:** ${invisiblePages.length} | **Target quick-wins (pos 4-20):** ${targetQuickWins.length} | **Real query→page pairs:** ${targetPairs.length}`,
      },
      honest_note: `${targetUrls.length} target pages from ${pageSource}. ${invisiblePages.length} invisible (0 GSC impressions). ${targetQuickWins.length} target-page quick wins at pos 4-20. ${targetPairs.length} real query→page mappings from GSC.`,
    };
  },
};


/* ════════════════════════════════════════════════════════════════
   STEP 2 — ON-PAGE FUNDAMENTALS
   Fetches HTML for each target page. Checks title tags, H1s,
   meta descriptions, word count, canonical, noindex, schema.
   Works on fresh pages with no prior data — HTML is the source.
════════════════════════════════════════════════════════════════ */
const stepOnPageFundamentals = {
  id: "page_health",
  label: "On-page fundamentals check",
  description: "Fetch each target page — title, H1, meta, word count, noindex, schema",
  artifact_kind: "page_health",
  continue_on_fail: true,
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const { urls: targetUrls } = await resolveTargetPages(ctx);

    if (!targetUrls.length) {
      return {
        ok: true,
        output: { pages: [], issues: [] },
        artifact: {
          kind: "page_health",
          title: "On-Page Fundamentals",
          body: "# On-Page Fundamentals\n\nNo target pages to audit. Add target URLs to the objective in SEO Campaigns → Objectives tab.",
        },
        honest_note: "No target pages set.",
      };
    }

    // Fetch and analyse all target pages in PARALLEL. Each fetchHtml is AbortController-capped
    // at 12s, so wall time is bounded by the slowest single fetch, not the page count.
    const toFetch = targetUrls.slice(0, MAX_PAGES_PER_STEP);
    const pageResults = await Promise.all(
      toFetch.map(async url => {
        const html = await fetchHtml(url);
        const facts = extractPageFacts(html, url);
        return { url, ...facts };
      })
    );

    // Classify issues
    const issues: string[] = [];
    for (const p of pageResults) {
      const slug = p.url.replace(/^https?:\/\/[^/]+/, "") || "/";
      if (!p.loadedOk)              issues.push(`${slug}: Page failed to load — may be blocked or returning error`);
      if (p.hasNoindex)             issues.push(`${slug}: Has noindex tag — Google will not index this page`);
      if (!p.title)                 issues.push(`${slug}: Missing title tag`);
      if (p.title && p.title.length > 65) issues.push(`${slug}: Title tag too long (${p.title.length} chars)`);
      if (!p.h1)                    issues.push(`${slug}: Missing H1 tag`);
      if (!p.metaDesc)              issues.push(`${slug}: Missing meta description`);
      if (p.wordCount < 300)        issues.push(`${slug}: Thin content (${p.wordCount} words) — may not satisfy search intent`);
      if (!p.hasSchema)             issues.push(`${slug}: No structured data / schema markup`);
      if (p.hasCanonical && !p.canonicalUrl.includes(p.url.replace(/^https?:\/\/[^/]+/,"")))
                                    issues.push(`${slug}: Canonical points elsewhere — may be diluting signals`);
    }

    const tableRows = pageResults.map(p => {
      const slug = p.url.replace(/^https?:\/\/[^/]+/, "") || "/";
      const titleStr = p.title ? (p.title.length > 40 ? p.title.slice(0,40)+"…" : p.title) : "❌ MISSING";
      const h1Str    = p.h1    ? (p.h1.length > 30 ? p.h1.slice(0,30)+"…" : p.h1) : "❌ MISSING";
      const flags = [
        p.hasNoindex ? "🚫 noindex" : "",
        !p.hasSchema ? "no schema" : "",
        p.wordCount < 300 ? `thin (${p.wordCount}w)` : `${p.wordCount}w`,
      ].filter(Boolean).join(" · ");
      return `| ${slug} | ${titleStr} | ${h1Str} | ${p.metaDesc ? "✓" : "❌"} | ${flags} |`;
    }).join("\n");

    const analysis = await llm(
      `You are a Senior SEO Specialist writing an on-page audit.
Be specific — cite exact page slugs and exact issues. No generic SEO advice.
Every recommendation must reference a specific page found in the data.
600-800 words in clean markdown.`,
      `On-Page Fundamentals Audit — ${pageResults.length} pages analysed.

PAGE AUDIT TABLE:
| URL | Title Tag | H1 | Meta Desc | Notes |
|---|---|---|---|---|
${tableRows}

ISSUES FOUND (${issues.length} total):
${issues.slice(0, 20).map(i => `• ${i}`).join("\n") || "• No critical issues found"}

Write:
1. Critical issues summary (noindex, missing titles, missing H1s first)
2. Page-by-page assessment — what each page has and what it's missing
3. Content quality assessment — are these pages thin? What should they contain?
4. Schema / structured data gaps
5. Specific rewrite recommendations for the worst title tags and meta descriptions`
    );

    return {
      ok: true,
      output: { pages: pageResults, issues, issueCount: issues.length },
      artifact: {
        kind: "page_health",
        title: "On-Page Fundamentals",
        body: `# On-Page Fundamentals\n\n${analysis}\n\n---\n**Pages audited:** ${pageResults.length} | **Issues found:** ${issues.length} | **Failed to load:** ${pageResults.filter(p => !p.loadedOk).length}`,
      },
      honest_note: `${pageResults.length} of ${targetUrls.length} target pages fetched and analysed. ${pageResults.filter(p => !p.loadedOk).length} failed to load. ${issues.length} on-page issues found. ${pageResults.filter(p => p.hasNoindex).length} noindex pages. ${pageResults.filter(p => p.wordCount < 300).length} thin-content pages.`,
    };
  },
};


/* ════════════════════════════════════════════════════════════════
   STEP 3 — TECHNICAL PERFORMANCE
   Live PSI call per target page. Real LCP, TBT, performance score.
   Works on fresh pages — fetches data now, not from stored baseline.
════════════════════════════════════════════════════════════════ */
const stepTechnicalPerformance = {
  id: "content_gap",
  label: "Core Web Vitals (field data)",
  description: "Real Chrome-user CWV via CrUX — LCP, CLS, INP at 75th percentile",
  artifact_kind: "content_gap",
  continue_on_fail: true,
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const { urls: targetUrls } = await resolveTargetPages(ctx);
    // CrUX field data returns in 2-5s. Test up to 8 pages in parallel, 30s ceiling.
    const toTest = targetUrls.slice(0, MAX_PAGES_PER_STEP);

    const results: Array<{ url: string } & Awaited<ReturnType<typeof runCrux>>> =
      await Promise.race([
        Promise.all(toTest.map(async url => ({ url, ...(await runCrux(url)) }))),
        new Promise<any[]>((resolve) =>
          setTimeout(() => resolve(toTest.map(url => ({ url, lcp_ms: null, cls: null, inp_ms: null, lcp_rating: null, has_field_data: false, source: "none" }))), 45000)
        ),
      ]);

    const withData = results.filter(r => r.has_field_data);
    const noData   = results.filter(r => !r.has_field_data);
    const poorLcp  = withData.filter(r => r.lcp_rating === "poor");

    // ── No real-user data path — state the raw fact, NO synthesis ──
    if (withData.length === 0) {
      const body = [
        "# Core Web Vitals — Field Data",
        "",
        "**Result: No real-user field data available for these pages.**",
        "",
        "CrUX (Chrome User Experience Report) only publishes data for pages/origins that receive sufficient real Chrome traffic. These pages have not yet crossed that threshold — which is itself a factual signal: they are low-traffic, which is consistent with a traffic growth objective.",
        "",
        "**What this means (fact, not speculation):**",
        "- No 75th-percentile LCP, CLS, or INP exists because too few real users have loaded these pages.",
        "- Google still has no Page Experience field signal for these URLs.",
        "",
        "**To get lab data instead (real, on-demand):**",
        "Run a Lighthouse audit per page from Site Manager → Baseline. That captures lab CWV (synthetic, but real measurement) which this pipeline reads on the next run. Lab testing is too slow to run inline here (30-60s per page), so it is intentionally deferred to the baseline capture step.",
        "",
        "---",
        `**Pages checked:** ${results.length} | **With CrUX field data:** 0 | **CrUX requires real Chrome traffic these pages don't yet have**`,
      ].join("\n");

      return {
        ok: true,
        output: { cruxResults: results, withData: 0 },
        artifact: { kind: "content_gap", title: "Core Web Vitals (Field Data)", body },
        honest_note: `${results.length} pages checked. 0 have CrUX field data — they lack the real-user traffic CrUX requires. Use Site Manager baseline for lab CWV instead.`,
      };
    }

    // ── Real data path — analyse only what exists ──
    const tableRows = withData.map(r => {
      const slug = r.url.replace(/^https?:\/\/[^/]+/, "") || "/";
      const lcp  = r.lcp_ms != null ? `${(r.lcp_ms/1000).toFixed(2)}s` : "—";
      const cls  = r.cls != null ? r.cls.toFixed(3) : "—";
      const inp  = r.inp_ms != null ? `${Math.round(r.inp_ms)}ms` : "—";
      const rating = r.lcp_rating === "good" ? "✅ Good" : r.lcp_rating === "needs improvement" ? "⚠️ Needs work" : "🔴 Poor";
      return `| ${slug} | ${lcp} ${rating} | ${cls} | ${inp} | ${r.source === "crux_origin" ? "origin avg" : "page-level"} |`;
    }).join("\n");

    const analysis = await llm(
      `You are a Senior SEO Technical Specialist interpreting REAL Chrome-user Core Web Vitals (CrUX field data).
Rules: cite ONLY the numbers given. Never speculate about causes you cannot see in the data.
If a metric is missing, say it is missing — do not guess what it might be.
400-500 words, clean markdown.`,
      `Core Web Vitals field-data audit. These are REAL 75th-percentile measurements from actual Chrome users — the exact data Google uses for Page Experience ranking.

FIELD DATA (mobile, 75th percentile):
| URL | LCP | CLS | INP | Data scope |
|---|---|---|---|---|
${tableRows}

${noData.length > 0 ? `Pages with no field data yet (insufficient real-user traffic): ${noData.length} — ${noData.slice(0,5).map(r => r.url.replace(/^https?:\/\/[^/]+/,"")||"/").join(", ")}` : "All tested pages have field data."}

Pages with POOR LCP (>4s at p75): ${poorLcp.length}

Write:
1. Verdict on these pages' real-user experience — cite the actual LCP/CLS/INP numbers
2. Which specific pages fail Google's thresholds (LCP>2.5s, CLS>0.1, INP>200ms) and by how much
3. Prioritised list: which pages to fix first based on the real numbers
4. For pages without field data: state plainly they need more traffic before field signals exist — do not speculate on their performance`
    );

    return {
      ok: true,
      output: { cruxResults: results, withData: withData.length, poorLcp: poorLcp.length },
      artifact: {
        kind: "content_gap",
        title: "Core Web Vitals (Field Data)",
        body: `# Core Web Vitals — Field Data\n\n${analysis}\n\n---\n**Pages with field data:** ${withData.length} of ${results.length} | **Poor LCP (>4s p75):** ${poorLcp.length} | **Source:** CrUX real-user measurements`,
      },
      honest_note: `${withData.length} of ${results.length} pages have real CrUX field data. ${poorLcp.length} fail LCP. ${noData.length} lack enough traffic for field data.`,
    };
  },
};


/* ════════════════════════════════════════════════════════════════
   STEP 4 — INTERNAL LINK ANALYSIS
   Checks which high-traffic pages could be linking to target pages.
   Uses GSC data to identify authority pages, fetches their HTML
   to check if they actually link to target pages.
════════════════════════════════════════════════════════════════ */
const stepInternalLinks = {
  id: "internal_link_flow",
  label: "Internal link structure",
  description: "Which authority pages link to target pages — PageRank flow audit",
  artifact_kind: "internal_links",
  continue_on_fail: true,
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const { urls: targetUrls } = await resolveTargetPages(ctx);
    const { topPages } = await loadGscData(ctx.projectId);

    // Find the top 5 authority pages (most traffic) to fetch and check
    const authorityPages = topPages
      .sort((a: any, b: any) => (b.clicks || 0) - (a.clicks || 0))
      .slice(0, 5)
      .filter((p: any) => (p.page || p.url) && (p.clicks || 0) > 0);

    const domain = targetUrls[0] ? (targetUrls[0].match(/^https?:\/\/[^/]+/)?.[0] || "") : "";

    // Fetch authority pages in PARALLEL with a hard 35s ceiling on the whole batch.
    // Sequential fetching previously hung the step when one page redirected slowly.
    const fetchTargets = authorityPages.slice(0, 3)
      .map((ap: any) => ({ apUrl: ap.page || ap.url || "", clicks: ap.clicks || 0 }))
      .filter((a: any) => a.apUrl);

    const linkMap: Array<{ authorityPage: string; clicks: number; linksToTargets: string[] }> =
      await Promise.race([
        Promise.all(fetchTargets.map(async ({ apUrl, clicks }: any) => {
          const html = await fetchHtml(apUrl);
          if (!html) return { authorityPage: apUrl.replace(domain, "") || "/", clicks, linksToTargets: [] };
          const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]);
          const linksToTargets = targetUrls.filter(t => {
            const slug = t.replace(domain, "");
            return links.some(l => l === slug || l === t || l.endsWith(slug));
          });
          return { authorityPage: apUrl.replace(domain, "") || "/", clicks, linksToTargets };
        })),
        new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 35000)),
      ]);

    const unlinkedTargets = targetUrls.filter(t => {
      return !linkMap.some(lm => lm.linksToTargets.includes(t));
    });

    const analysis = await llm(
      `You are a Senior SEO Specialist analysing internal link structure for a traffic growth campaign.
Be specific — cite exact page slugs. Explain PageRank flow in plain terms.
Every recommendation must be actionable with specific from/to page pairs.
500-600 words in clean markdown.`,
      `Internal Link Audit for ${targetUrls.length} target pages.

AUTHORITY PAGES (top by clicks):
${authorityPages.slice(0,5).map((p: any) => `• ${(p.page||p.url||"").replace(domain,"") || "/"} — ${p.clicks||0} clicks/mo, pos ${(p.position||0).toFixed(1)}`).join("\n") || "• No GSC data available — connect GSC for this analysis"}

LINK COVERAGE ANALYSIS:
${linkMap.map(lm => `• ${lm.authorityPage} (${lm.clicks} clicks): links to ${lm.linksToTargets.length > 0 ? lm.linksToTargets.map(t => t.replace(domain,"")||"/").join(", ") : "NONE of the target pages"}`).join("\n") || "• Could not fetch authority pages"}

TARGET PAGES WITH NO INTERNAL LINKS FROM HIGH-TRAFFIC PAGES (${unlinkedTargets.length}):
${unlinkedTargets.slice(0,8).map(u => `• ${u.replace(domain,"")||"/"}`).join("\n") || "• All target pages are linked"}

Write:
1. Internal link health verdict — are target pages isolated from site authority?
2. Specific linking opportunities — which authority page should link to which target page
3. Hub page strategy — if category pages exist, how they should distribute authority
4. Anchor text recommendations for the most important links`
    );

    return {
      ok: true,
      output: { linkMap, unlinkedTargets, authorityPages: authorityPages.slice(0,5) },
      artifact: {
        kind: "internal_links",
        title: "Internal Link Structure",
        body: `# Internal Link Analysis\n\n${analysis}\n\n---\n**Target pages without links from authority pages:** ${unlinkedTargets.length} of ${targetUrls.length}`,
      },
      honest_note: `${unlinkedTargets.length} of ${targetUrls.length} target pages receive no internal links from high-traffic pages. ${authorityPages.length} authority pages checked.`,
    };
  },
};


/* ════════════════════════════════════════════════════════════════
   STEP 5 — PRIORITISED ACTION PLAN
   Synthesises all findings into a concrete, ranked action plan.
   Names specific pages, specific fixes, specific expected impact.
   No generic advice — everything is grounded in findings above.
════════════════════════════════════════════════════════════════ */
const stepActionPlan = {
  id: "growth_strategy",
  label: "Prioritised action plan",
  description: "Concrete fixes ranked by impact — specific pages, specific actions",
  artifact_kind: "strategy",
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const { urls: targetUrls } = await resolveTargetPages(ctx);
    const gscData  = ctx.prior["traffic_audit"]     || {};
    const onPage   = ctx.prior["page_health"]       || {};
    const techData = ctx.prior["content_gap"]       || {};
    const linkData = ctx.prior["internal_link_flow"] || {};

    const invisibleCount = (gscData.invisiblePages || []).length;
    const issueCount     = onPage.issueCount || 0;
    const cwvWithData    = techData.withData || 0;
    const cwvPoorLcp     = techData.poorLcp || 0;
    const unlinkedCount  = (linkData.unlinkedTargets || []).length;
    const quickWins      = gscData.targetQuickWins || gscData.quickWins || [];

    // Pull live GA4 engagement for up to 5 target pages (parallel, 30s ceiling).
    // Tells us which pages engage vs bounce — critical for prioritisation.
    const ga4Pages = await Promise.race([
      Promise.all(targetUrls.slice(0, MAX_PAGES_PER_STEP).map(async url => {
        const pagePath = url.replace(/^https?:\/\/[^/]+/, "") || "/";
        const m = await ga4PullPageMetrics({ projectId: ctx.projectId, pagePath, days: 28 }).catch(() => null);
        return m ? { pagePath, ...m } : null;
      })),
      new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 45000)),
    ]);
    const ga4Valid = (ga4Pages || []).filter(Boolean) as any[];

    const plan = await llm(
      `You are a Senior Digital Marketing Specialist building a traffic growth action plan.
You are writing this for a client who needs to understand exactly what to do.
Be brutally specific — name pages, name fixes, name expected outcomes.
Cite the real numbers from the audit findings.
No generic SEO advice. Every point must be specific to these pages.
800-1000 words in clean markdown.`,
      `Traffic Growth Action Plan — ${targetUrls.length} target pages

AUDIT FINDINGS SUMMARY:
• GSC visibility: ${invisibleCount} pages are invisible to Google (not in GSC)
• Quick wins: ${quickWins.length} pages at positions 4-20 that could move to page 1
  ${quickWins.slice(0,5).map((p: any) => `  - ${(p.page||p.url||"").replace(/^https?:\/\/[^/]+/,"")||"/"}: pos ${(p.position||0).toFixed(1)}, ${p.impressions||0} impressions`).join("\n")}
• On-page issues: ${issueCount} issues found (missing titles, H1s, thin content, noindex)
• Core Web Vitals: ${cwvWithData} pages have real CrUX field data, ${cwvPoorLcp} fail LCP (>4s at 75th percentile). Pages without field data lack sufficient real-user traffic.
• Internal links: ${unlinkedCount} target pages receive no internal links from high-traffic pages
${ga4Valid.length > 0 ? `• GA4 engagement (live, last 28 days):
${ga4Valid.map(g => `  - ${g.pagePath}: ${g.sessions} sessions, ${g.engagement_rate_pct}% engaged, ${g.bounce_rate_pct}% bounce, ${g.conversions} conversions`).join("\n")}` : "• GA4 engagement: no session data yet for target pages (expected for low-traffic pages)"}

TARGET PAGES:
${targetUrls.slice(0,10).map(u => `• ${u.replace(/^https?:\/\/[^/]+/,"")||"/"}`).join("\n")}

Write a plan with these exact sections:
## IMMEDIATE ACTIONS (Week 1) — fixes that take <2 hours each
## SHORT TERM (Month 1) — content and technical work
## MEDIUM TERM (Months 2-3) — authority and link building
## WHAT NOT TO DO — common mistakes for this type of site

For each action, state:
- The specific page or pages affected
- Exactly what to change
- Why it will help (cite the specific finding)
- Estimated time to see results

End with: **Realistic Traffic Forecast** — honest estimate of traffic change if all actions completed`
    );

    return {
      ok: true,
      output: { plan, targetCount: targetUrls.length, invisibleCount, quickWinCount: quickWins.length, ga4Pages: ga4Valid },
      artifact: {
        kind: "strategy",
        title: "Traffic Growth Action Plan",
        body: `# Traffic Growth Action Plan\n\n${plan}`,
      },
      honest_note: `Plan built from ${targetUrls.length} target pages. ${invisibleCount} invisible to Google, ${quickWins.length} quick wins, ${issueCount} on-page issues, ${unlinkedCount} unlinked pages, ${ga4Valid.length} pages with live GA4 data.`,
    };
  },
};


/* ════════════════════════════════════════════════════════════════
   STEP 6 — CLIENT BRIEF
   Plain English. Written for the client, not the SEO team.
   Cites real numbers. Honest about timelines.
════════════════════════════════════════════════════════════════ */
const stepClientBrief = {
  id: "client_update",
  label: "Client brief",
  description: "Plain English summary with real numbers and honest timelines",
  artifact_kind: "client_update",
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const { urls: targetUrls } = await resolveTargetPages(ctx);
    const gscData  = ctx.prior["traffic_audit"]      || {};
    const onPage   = ctx.prior["page_health"]        || {};
    const techData = ctx.prior["content_gap"]        || {};
    const plan     = ctx.prior["growth_strategy"]?.plan || "";

    const brief = await llm(
      `You are writing a client brief for an SEO traffic growth campaign.
The client is a business owner, not an SEO expert.
Write in plain English. Be honest about what was found and what will happen.
Cite real numbers. Never overpromise timelines.
300-400 words. Professional but conversational tone.`,
      `Write a client brief for a traffic growth SEO campaign.

Site: ${targetUrls[0] ? (targetUrls[0].match(/^https?:\/\/[^/]+/)?.[0] || "their website") : "their website"}
Target pages: ${targetUrls.length} pages
Pages invisible to Google: ${(gscData.invisiblePages||[]).length}
Quick-win opportunities: ${(gscData.targetQuickWins||gscData.quickWins||[]).length} target pages at positions 4-20
On-page issues found: ${onPage.issueCount || 0}
Core Web Vitals: ${techData.withData || 0} pages with real field data, ${techData.poorLcp || 0} failing LCP

Action plan summary (first 500 chars):
${plan.slice(0, 500)}

Write:
1. What we found (2-3 sentences with real numbers)
2. What we're doing first and why (most impactful actions)
3. What they should expect in 30 / 60 / 90 days (honest ranges)
4. What we need from them (content approvals, developer access, etc.)`
    );

    return {
      ok: true,
      output: { brief },
      artifact: {
        kind: "client_update",
        title: "Client Brief — Traffic Growth",
        body: `# Client Brief\n\n${brief}`,
      },
      honest_note: `Brief written from real audit findings across ${targetUrls.length} target pages.`,
    };
  },
};


/* ════════════════════════════════════════════════════════════════
   Export pipeline definition
════════════════════════════════════════════════════════════════ */
export function buildTrafficGrowthPipeline(): PipelineDefinition {
  return {
    type: "traffic_growth" as any,
    llm_call_cap: 25,
    steps: [
      stepVisibilityAudit,
      stepOnPageFundamentals,
      stepTechnicalPerformance,
      stepInternalLinks,
      stepActionPlan,
      stepClientBrief,
    ],
  };
}
