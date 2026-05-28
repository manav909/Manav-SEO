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
import type { PipelineDefinition, PipelineStepContext, PipelineStepResult } from "./season-pipeline-runner.js";

const MODEL             = "claude-sonnet-4-6";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const PSI_KEY           = process.env.PAGESPEED_API_KEY || "";

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
  try {
    const r = await withTimeout(
      fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOSeasonBot/1.0)" },
        redirect: "follow",
      }).then(r => r.text()),
      `fetchHtml(${url})`, 15000
    );
    return (r as string | null) || "";
  } catch { return ""; }
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

/* ─── PSI call (single URL, mobile strategy) ───────────────────── */
async function runPsi(url: string): Promise<{
  lcp: number | null; tbt: number | null; cls: number | null; score: number | null;
}> {
  const key = PSI_KEY;
  if (!key) return { lcp: null, tbt: null, cls: null, score: null };
  try {
    const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${key}&fields=lighthouseResult.categories.performance.score,lighthouseResult.audits.largest-contentful-paint.numericValue,lighthouseResult.audits.total-blocking-time.numericValue,lighthouseResult.audits.cumulative-layout-shift.numericValue`;
    const r = await withTimeout(fetch(endpoint).then(r => r.json()), `PSI(${url})`, 25000);
    if (!r) return { lcp: null, tbt: null, cls: null, score: null };
    const lr = (r as any)?.lighthouseResult;
    return {
      lcp:   lr?.audits?.["largest-contentful-paint"]?.numericValue ?? null,
      tbt:   lr?.audits?.["total-blocking-time"]?.numericValue ?? null,
      cls:   lr?.audits?.["cumulative-layout-shift"]?.numericValue ?? null,
      score: lr?.categories?.performance?.score != null
        ? Math.round(lr.categories.performance.score * 100) : null,
    };
  } catch { return { lcp: null, tbt: null, cls: null, score: null }; }
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
  zeroClickPages: any[];      // ranked but no clicks = CTR problem
  notRankingPages: any[];     // in GSC but position > 50 = visibility problem
  quickWins: any[];           // positions 4-20 with impressions
}> {
  try {
    const r = await withTimeout(
      db().from("project_knowledge").select("field_key,field_value")
        .eq("project_id", projectId).in("field_key", ["gsc_top_pages","gsc_top_queries"]),
      "gsc_data query"
    );
    const rows = ((r as any)?.data || []) as any[];
    const topPagesRow = rows.find(r => r.field_key === "gsc_top_pages");
    const topPages = topPagesRow ? JSON.parse(topPagesRow.field_value || "[]") : [];

    return {
      topPages,
      zeroClickPages:  topPages.filter((p: any) => (p.impressions || 0) > 0 && (p.clicks || 0) === 0),
      notRankingPages: topPages.filter((p: any) => (p.position || 0) > 50),
      quickWins:       topPages.filter((p: any) => (p.position || 0) >= 4 && (p.position || 0) <= 20),
    };
  } catch {
    return { topPages: [], zeroClickPages: [], notRankingPages: [], quickWins: [] };
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
    const { topPages, zeroClickPages, quickWins } = await loadGscData(ctx.projectId);

    // Cross-reference: which target pages appear in GSC?
    const gscUrlSet = new Set(topPages.map((p: any) => (p.page || p.url || "").replace(/\/$/, "")));
    const invisiblePages   = targetUrls.filter(u => !gscUrlSet.has(u.replace(/\/$/, "")));
    const visiblePages     = targetUrls.filter(u =>  gscUrlSet.has(u.replace(/\/$/, "")));

    const makePageRow = (url: string) => {
      const slug = url.replace(/^https?:\/\/[^/]+/, "") || "/";
      const gscData = topPages.find((p: any) => (p.page || p.url || "").replace(/\/$/, "") === url.replace(/\/$/, ""));
      if (!gscData) return `| ${slug} | NOT IN GSC | — | — | — | 🔴 Invisible |`;
      const pos   = gscData.position?.toFixed(1) || "—";
      const impr  = gscData.impressions || 0;
      const clicks = gscData.clicks || 0;
      const ctr   = impr > 0 ? ((clicks / impr) * 100).toFixed(1) + "%" : "—";
      const flag  = clicks === 0 && impr > 0 ? "🟡 Ranked, 0 clicks"
                  : parseFloat(pos) <= 3 ? "🟢 Top 3"
                  : parseFloat(pos) <= 20 ? "🟡 Quick win"
                  : "🔴 Low ranking";
      return `| ${slug} | ${pos} | ${impr.toLocaleString()} | ${clicks} | ${ctr} | ${flag} |`;
    };

    const analysis = await llm(
      `You are a Senior SEO Analyst writing a GSC visibility audit.
Be specific and data-driven. Every finding must cite a real number.
Do not write generic advice. Write about these specific pages.
Format in clean markdown. 500-700 words.`,
      `GSC Visibility Audit for ${targetUrls.length} target pages.
Data source: ${pageSource}

TARGET PAGE GSC STATUS:
| URL | Position | Impressions | Clicks | CTR | Status |
|---|---|---|---|---|---|
${targetUrls.slice(0, 20).map(makePageRow).join("\n")}

KEY FINDINGS:
- Pages invisible to Google (not in GSC): ${invisiblePages.length} of ${targetUrls.length}
${invisiblePages.slice(0, 5).map(u => `  • ${u.replace(/^https?:\/\/[^/]+/, "") || "/"}`).join("\n")}

- Pages ranking but not clicking (position found, 0 clicks): ${zeroClickPages.length}
${zeroClickPages.slice(0, 5).map((p: any) => `  • ${(p.page||p.url||"").replace(/^https?:\/\/[^/]+/, "") || "/"} — pos ${(p.position||0).toFixed(1)}, ${p.impressions||0} impressions`).join("\n")}

- Quick-win pages (position 4-20): ${quickWins.length}
${quickWins.slice(0, 5).map((p: any) => `  • ${(p.page||p.url||"").replace(/^https?:\/\/[^/]+/, "") || "/"} — pos ${(p.position||0).toFixed(1)}, ${p.impressions||0} impr, ${p.clicks||0} clicks`).join("\n")}

Write:
1. Headline finding (1 paragraph — what's the core GSC problem?)
2. Invisible pages analysis — WHY might these pages be invisible?
3. Quick-win opportunities with specific expected outcomes
4. CTR problems — pages ranking but not being clicked (title/meta issue)
5. Clear priority ranking of these pages`
    );

    return {
      ok: true,
      output: { topPages: topPages.slice(0,20), quickWins: quickWins.slice(0,10), targetUrls, invisiblePages, visiblePages },
      artifact: {
        kind: "traffic_audit",
        title: "GSC Visibility Audit",
        body: `# GSC Visibility Audit\n\n${analysis}\n\n---\n**Target pages:** ${targetUrls.length} | **Source:** ${pageSource} | **Invisible:** ${invisiblePages.length} | **Quick wins:** ${quickWins.length} | **Zero-click ranked pages:** ${zeroClickPages.length}`,
      },
      honest_note: `${targetUrls.length} target pages from ${pageSource}. ${invisiblePages.length} invisible to Google. ${quickWins.length} quick wins at positions 4-20. ${zeroClickPages.length} pages rank but get 0 clicks.`,
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

    // Fetch and analyse up to 8 pages in parallel (Vercel limit consideration)
    const toFetch = targetUrls.slice(0, 8);
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
      honest_note: `${pageResults.length} pages fetched and analysed. ${issues.length} on-page issues found. ${pageResults.filter(p => p.hasNoindex).length} noindex pages. ${pageResults.filter(p => p.wordCount < 300).length} thin-content pages.`,
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
  label: "Technical performance audit (PSI)",
  description: "Live PageSpeed Insights per page — LCP, TBT, performance score",
  artifact_kind: "content_gap",
  continue_on_fail: true,
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const { urls: targetUrls } = await resolveTargetPages(ctx);
    const toTest = targetUrls.slice(0, 6); // PSI rate limit consideration

    // Run PSI sequentially to avoid rate limiting
    const psiResults: Array<{ url: string; lcp: number | null; tbt: number | null; cls: number | null; score: number | null }> = [];
    for (const url of toTest) {
      const r = await runPsi(url);
      psiResults.push({ url, ...r });
    }

    const failed = psiResults.filter(p => p.score === null);
    const scored = psiResults.filter(p => p.score !== null);

    const lcpRating = (ms: number | null) =>
      ms === null ? "N/A" : ms < 2500 ? "✅ Good" : ms < 4000 ? "⚠️ Needs work" : "🔴 Poor";

    const tableRows = psiResults.map(p => {
      const slug  = p.url.replace(/^https?:\/\/[^/]+/, "") || "/";
      const lcp   = p.lcp   ? `${(p.lcp/1000).toFixed(2)}s` : "—";
      const tbt   = p.tbt   ? `${Math.round(p.tbt)}ms` : "—";
      const cls   = p.cls   !== null ? p.cls.toFixed(3) : "—";
      const score = p.score !== null ? `${p.score}/100` : "N/A";
      const rating = lcpRating(p.lcp);
      return `| ${slug} | ${score} | ${lcp} ${rating} | ${tbt} | ${cls} |`;
    }).join("\n");

    const analysis = await llm(
      `You are a Senior SEO Technical Specialist interpreting PageSpeed Insights data.
Be specific — cite real scores and milliseconds. Explain impact on rankings and UX.
Prioritise by severity. 500-600 words in clean markdown.`,
      `Technical Performance Audit — Live PSI results for ${psiResults.length} pages.

PSI RESULTS TABLE (mobile):
| URL | Perf Score | LCP | TBT | CLS |
|---|---|---|---|---|
${tableRows}

${failed.length > 0 ? `Pages where PSI could not load (${failed.length}): ${failed.map(p => p.url.replace(/^https?:\/\/[^/]+/,"")||"/").join(", ")}` : "All pages loaded successfully."}

Average performance score: ${scored.length > 0 ? Math.round(scored.reduce((s,p) => s + (p.score||0), 0) / scored.length) : "N/A"}/100
Pages with poor LCP (>4s): ${psiResults.filter(p => p.lcp && p.lcp > 4000).length}
Pages with high TBT (>600ms): ${psiResults.filter(p => p.tbt && p.tbt > 600).length}

Write:
1. Overall performance health verdict
2. Page-by-page breakdown — what each score means for that specific page
3. LCP analysis — what is likely causing slow LCP on the worst pages?
4. Prioritised fix list — which pages to fix first and what to fix
5. Expected ranking impact of fixing these issues`
    );

    return {
      ok: true,
      output: { psiResults, avgScore: scored.length > 0 ? Math.round(scored.reduce((s,p) => s + (p.score||0), 0) / scored.length) : null },
      artifact: {
        kind: "content_gap",
        title: "Technical Performance (PSI)",
        body: `# Technical Performance Audit\n\n${analysis}\n\n---\n**Pages tested:** ${psiResults.length} | **PSI key available:** ${PSI_KEY ? "Yes" : "No — add PAGESPEED_API_KEY to Vercel env"} | **Poor LCP:** ${psiResults.filter(p => p.lcp && p.lcp > 4000).length} pages`,
      },
      honest_note: PSI_KEY
        ? `${psiResults.length} pages tested via PSI. ${psiResults.filter(p => p.lcp && p.lcp > 4000).length} with poor LCP. Avg score: ${scored.length > 0 ? Math.round(scored.reduce((s,p) => s + (p.score||0), 0) / scored.length) : "N/A"}/100.`
        : `No PSI API key in environment. Add PAGESPEED_API_KEY to Vercel env vars to enable live performance testing.`,
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

    // Fetch authority pages and check which target pages they link to
    const linkMap: Array<{ authorityPage: string; clicks: number; linksToTargets: string[] }> = [];
    for (const ap of authorityPages.slice(0, 3)) { // limit fetches
      const apUrl = ap.page || ap.url || "";
      if (!apUrl) continue;
      const html = await fetchHtml(apUrl);
      if (!html) continue;
      const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]);
      const linksToTargets = targetUrls.filter(t => {
        const slug = t.replace(domain, "");
        return links.some(l => l === slug || l === t || l.endsWith(slug));
      });
      linkMap.push({
        authorityPage: apUrl.replace(domain, "") || "/",
        clicks: ap.clicks || 0,
        linksToTargets,
      });
    }

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
    const avgScore       = techData.avgScore || null;
    const unlinkedCount  = (linkData.unlinkedTargets || []).length;
    const quickWins      = gscData.quickWins || [];

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
• Performance: avg score ${avgScore !== null ? avgScore+"/100" : "not tested — no PSI key"} — ${(techData.psiResults||[]).filter((p:any) => p.lcp && p.lcp > 4000).length} pages with poor LCP
• Internal links: ${unlinkedCount} target pages receive no internal links from high-traffic pages

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
      output: { plan, targetCount: targetUrls.length, invisibleCount, quickWinCount: quickWins.length },
      artifact: {
        kind: "strategy",
        title: "Traffic Growth Action Plan",
        body: `# Traffic Growth Action Plan\n\n${plan}`,
      },
      honest_note: `Plan built from ${targetUrls.length} target pages. ${invisibleCount} invisible to Google, ${quickWins.length} quick wins, ${issueCount} on-page issues, ${unlinkedCount} unlinked pages.`,
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
Quick-win opportunities: ${(gscData.quickWins||[]).length} pages at positions 4-20
On-page issues found: ${onPage.issueCount || 0}
Average performance score: ${techData.avgScore !== null && techData.avgScore !== undefined ? techData.avgScore+"/100" : "not tested"}

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
