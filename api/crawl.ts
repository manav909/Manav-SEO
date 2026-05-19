import { extractAndSaveLearning } from './lib/ai-cache';
import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/* ── Inline db() — avoids ./lib/db import ── */
import { createClient } from "@supabase/supabase-js";
let _db: any = null;
function db(): any {
  if (_db) return _db;
  try {
    _db = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder"
    );
  } catch (_e) { _db = null; }
  return _db;
}


/* ── Inline fetch utilities — avoids ./lib/fetch import ── */
function cleanHtml(html: string, maxChars = 12000): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "").replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/\s{2,}/g, " ").trim().slice(0, maxChars);
}
function parseJson(text: string): any | null {
  const clean = text.replace(/^```[a-z]*\n?/gm, "").replace(/^```\s*$/gm, "").trim();
  const f = clean.indexOf("{"); const l = clean.lastIndexOf("}");
  if (f < 0 || l < 0) return null;
  try { return JSON.parse(clean.slice(f, l + 1)); } catch (_e) {}
  try { return JSON.parse(clean.slice(f) + '"}]}'); } catch (_e) {}
  return null;
}
async function fetchUrl(url: string): Promise<{ html: string; status: number; strategy: string; chars: number; allFailed?: boolean; error?: string }> {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
  try {
    const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url.startsWith("http") ? url : `https://${url}`, {
      signal: ctrl.signal, headers: { "User-Agent": ua, "Accept": "text/html,*/*", "Cache-Control": "no-cache" }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const html = cleanHtml(text);
    return { html, status: r.status, strategy: "direct", chars: html.length };
  } catch (e: any) {
    return { html: "", status: 0, strategy: "failed", chars: 0, allFailed: true, error: e?.message || "Fetch failed" };
  }
}


export const config = { maxDuration: 300 };

const VALID_KEYS = new Set([
  "organic_sessions_monthly","organic_sessions_baseline_date","top_landing_pages",
  "bounce_rate","avg_session_duration","conversions_monthly","gsc_total_impressions",
  "gsc_total_clicks","gsc_avg_position","pages_indexed","pages_submitted",
  "crawl_errors","broken_links","duplicate_content","schema_markup","sitemap_url",
  "robots_txt","canonical_issues","competitor_1","competitor_1_dr","competitor_2",
  "competitor_2_dr","competitor_3","our_domain_rating","our_referring_domains",
  "content_gap_keywords","target_keywords","cms","cms_version","seo_plugin",
  "pagespeed_mobile","pagespeed_desktop",
]);

// ─────────────────────────────────────────────────────────────────────
// Claude extraction — single combined prompt (one API call)
// ─────────────────────────────────────────────────────────────────────
async function analysePage(url: string, html: string, projectContext: string, taskHints: string[], anthropic: Anthropic): Promise<any> {
  const taskCtx = taskHints.length ? `\nCanvas tasks needing data: ${taskHints.slice(0, 3).join(" | ")}` : "";

  const prompt = `You are an SEO extraction engine. Read the HTML below and extract every SEO signal you can directly observe.
URL: ${url}
Project: ${projectContext}${taskCtx}

HTML:
${html}

INSTRUCTIONS:
- Extract ONLY what is directly present in the HTML markup.
- For missing elements write exactly: "Not found"
- For knowledge_fields: derive values from what IS visible in the HTML:
  * robots_txt: read <meta name="robots" content="..."> value
  * sitemap_url: read <link rel="sitemap" href="..."> value
  * canonical_issues: "ok" if canonical matches URL, "mismatch" or "missing" otherwise
  * cms: detect from /wp-content/, /wp-includes/, generator meta, Shopify CDN, Webflow scripts, Wix scripts, Squarespace comments
  * seo_plugin: detect Yoast (yoast), RankMath (rankmath), AIO SEO markers in HTML
  * schema_markup: summarise all @type values found, e.g. "Article, FAQPage, Organization"
  * target_keywords: extract from the H1 text and title tag, comma-separated
  * top_landing_pages: always "Not available from HTML" — skip this key
  * pagespeed_mobile, pagespeed_desktop: always skip — not visible in HTML

Return ONLY this JSON (no fences, no prose):
{
  "title_tag": "exact <title> text or Not found",
  "title_length": 0,
  "title_issues": "OK or Too long or Too short or Missing keyword or Duplicate",
  "meta_description": "exact <meta name=description content> or Not found",
  "meta_desc_length": 0,
  "meta_desc_issues": "OK or Missing or Too long or Not compelling",
  "h1": "exact first <h1> text or Not found",
  "h1_issues": "OK or Missing or Multiple or Too generic",
  "h2s": ["up to 6 exact <h2> texts"],
  "h3s": ["up to 4 exact <h3> texts"],
  "canonical_url": "exact <link rel=canonical href> or Not found",
  "word_count": 0,
  "content_type": "landing_page|blog|product|service|home|about|other",
  "primary_topic": "5 words",
  "schema_types": ["exact @type values from JSON-LD <script> tags"],
  "structured_data_quality": "comprehensive|partial|minimal|none",
  "has_og_tags": false,
  "has_twitter_card": false,
  "internal_links": 0,
  "external_links": 0,
  "images_total": 0,
  "images_no_alt": 0,
  "has_robots_meta": "exact content value or Not found",
  "faqs_detected": ["up to 5 exact FAQ question texts visible on page"],
  "cta_elements": ["up to 8 exact CTA button/link texts"],
  "trust_signals": ["each trust element: testimonials, reviews, certifications, awards"],
  "keyword_presence": ["keywords in H1, H2s, or page title"],
  "content_quality": "high|medium|low",
  "geo_readiness": {
    "has_faq_schema": false,
    "has_howto_schema": false,
    "answer_format_quality": "high|medium|low|none",
    "perplexity_citation_likelihood": "high|medium|low"
  },
  "issues": [
    {"severity": "critical|high|medium|low", "detail": "specific observation", "fix": "exact fix"}
  ],
  "opportunities": [
    {"action": "specific step", "impact": "SEO or conversion impact", "effort": "low|medium|high", "evidence": "what in the HTML suggests this"}
  ],
  "data_confidence": "high|medium|low",
  "confidence_reason": "one sentence why",
  "knowledge_fields": [
    {"category": "technical|cms|analytics|goal", "key": "EXACT_KEY", "value": "exact observed value"}
  ]
}

KNOWLEDGE FIELD RULES:
- key must be EXACTLY one of: schema_markup, robots_txt, sitemap_url, canonical_issues, crawl_errors, broken_links, cms, seo_plugin, target_keywords
- Only include keys where you found real evidence in the HTML
- Do NOT include top_landing_pages, pagespeed_mobile, pagespeed_desktop (not visible in HTML)
- broken_links: count any href="#" or dead-looking links you notice
- crawl_errors: note any noindex, nofollow signals

Include 3-6 issues and 3-5 opportunities. Be specific — cite exact text from the HTML.`;

  const msg = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 3500,
    system:     "You are a precise SEO data extraction engine. Return ONLY valid JSON. No prose. No markdown fences. Every field must have a value — never null.",
    messages:   [{ role: "user", content: prompt }],
  });

  if (msg.stop_reason === "max_tokens") {
    console.warn(`[crawl] analysePage hit max_tokens for ${url}`);
  }

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  const parsed = parseJson(raw);
  if (!parsed) {
    console.error(`[crawl] analysePage JSON parse failed for ${url}. Raw (first 200): ${raw.slice(0, 200)}`);
    return null;
  }

  parsed.knowledge_fields = Array.isArray(parsed.knowledge_fields)
    ? parsed.knowledge_fields.filter((k: any) => k.key && VALID_KEYS.has(k.key) && k.value && String(k.value).trim() !== "")
    : [];

  return parsed;
}

// URL-only fallback when fetch fails
async function analyseUrlOnly(url: string, anthropic: Anthropic): Promise<any> {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6", max_tokens: 800,
    system: "Return ONLY valid JSON. No prose. No markdown fences.",
    messages: [{ role: "user", content: `Page at ${url} could not be fetched. Infer what you can from the URL structure only.
Return JSON with these fields set to "Not fetched" where unknown:
{
  "title_tag": "Not fetched — URL suggests: [infer from slug]",
  "title_length": 0, "title_issues": "Cannot determine — page not fetched",
  "meta_description": "Not fetched", "meta_desc_length": 0, "meta_desc_issues": "Cannot determine",
  "h1": "Not fetched", "h1_issues": "Cannot determine",
  "h2s": [], "h3s": [], "canonical_url": "Not fetched",
  "word_count": 0, "content_type": "infer from URL path",
  "primary_topic": "infer from URL slug words",
  "schema_types": [], "structured_data_quality": "none",
  "has_og_tags": false, "has_twitter_card": false,
  "internal_links": 0, "external_links": 0, "images_total": 0, "images_no_alt": 0,
  "has_robots_meta": "Not fetched", "faqs_detected": [], "cta_elements": [], "trust_signals": [],
  "keyword_presence": [], "content_quality": "low",
  "geo_readiness": {"has_faq_schema": false, "has_howto_schema": false, "answer_format_quality": "none", "perplexity_citation_likelihood": "low"},
  "issues": [{"severity": "critical", "detail": "Page could not be fetched — all 4 strategies failed", "fix": "Check URL is publicly accessible. Set JINA_API_KEY env var to enable proxy fetching."}],
  "opportunities": [{"action": "Ensure page is publicly crawlable", "impact": "Enable full SEO analysis", "effort": "low", "evidence": "Page blocked all fetch attempts"}],
  "data_confidence": "low", "confidence_reason": "URL-only analysis — page not fetched",
  "knowledge_fields": []
}` }],
  });
  const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  return parseJson(raw) || null;
}

// ─────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function getCached(projectId: string, urls: string[]): Promise<Record<string, any>> {
  if (!projectId || !urls.length) return {};
  try {
    const { data } = await db()
      .from("crawled_pages")
      .select("url,page_analysis,knowledge_fields,fetch_status,html_chars,crawl_status,crawled_at")
      .eq("project_id", projectId).in("url", urls);
    const map: Record<string, any> = {};
    for (const r of (data || [])) map[r.url] = r;
    return map;
  } catch (e) { console.error("[cache] getCached failed:", e); return {}; }
}

async function saveToCache(projectId: string, url: string, result: any): Promise<string | null> {
  if (!projectId) return "no projectId — page not persisted";
  try {
    const { error } = await db().from("crawled_pages").upsert({
      project_id: projectId, url,
      page_analysis:    result.page_analysis ?? null,
      knowledge_fields: result.knowledge_fields ?? [],
      fetch_status:     result.status ?? 0,
      fetch_error:      result.error ?? null,
      html_chars:       result.html_chars ?? 0,
      crawl_status:     result.page_analysis ? "success" : result.status === 403 ? "blocked" : "failed",
      crawled_at:       new Date().toISOString(),
    }, { onConflict: "project_id,url" });
    if (error) {
      console.error("[cache] saveToCache DB error:", error.message);
      return error.message;
    }
    return null;
  } catch (e: any) {
    console.error("[cache] saveToCache failed:", e?.message || e);
    return e?.message || "save failed";
  }
}

function isFresh(cachedAt: string): boolean {
  return Date.now() - new Date(cachedAt).getTime() < CACHE_TTL_MS;
}

// ─────────────────────────────────────────────────────────────────────
// Process single URL
// ─────────────────────────────────────────────────────────────────────
async function processUrl(
  url: string, projectId: string | null,
  projectContext: string, taskHints: string[],
  forceRefresh: boolean, cache: Record<string, any>,
  anthropic: Anthropic,
): Promise<any> {
  const cached = cache[url];
  if (cached && !forceRefresh && isFresh(cached.crawled_at)) {
    console.log(`[crawl] cache hit: ${url}`);
    return {
      url, status: cached.fetch_status || 200,
      page_analysis: cached.page_analysis,
      knowledge_fields: cached.knowledge_fields || [],
      html_chars: cached.html_chars || 0,
      from_cache: true, cached_at: cached.crawled_at,
    };
  }

  console.log(`[crawl] fetching: ${url}`);
  const fetched = await fetchUrl(url);

  let pageAnalysis: any = null;

  if (fetched.html) {
    console.log(`[crawl] analysing: ${url} (${fetched.chars} chars via ${fetched.strategy})`);
    try {
      pageAnalysis = await analysePage(url, fetched.html, projectContext, taskHints, anthropic);
    } catch (err: any) {
      console.error(`[crawl] analysePage threw for ${url}:`, err.message);
    }
    if (!pageAnalysis) {
      console.warn(`[crawl] falling back to URL-only for ${url}`);
      pageAnalysis = await analyseUrlOnly(url, anthropic);
    }
  } else {
    console.log(`[crawl] fetch failed for ${url}: ${fetched.error}`);
    pageAnalysis = await analyseUrlOnly(url, anthropic);
    if (pageAnalysis) {
      pageAnalysis.issues = [
        { severity: "critical", detail: `Page could not be fetched: ${fetched.error}`, fix: "Ensure page is publicly accessible. Add JINA_API_KEY env var for proxy access." },
        ...(pageAnalysis.issues || []).slice(0, 4),
      ];
    }
  }

  const knowledge_fields = Array.isArray(pageAnalysis?.knowledge_fields)
    ? pageAnalysis.knowledge_fields.filter((k: any) => k.key && VALID_KEYS.has(k.key) && k.value?.toString().trim())
    : [];

  const result = {
    url,
    status:           fetched.html ? 200 : (fetched.status || 0),
    error:            fetched.html ? undefined : fetched.error,
    page_analysis:    pageAnalysis,
    knowledge_fields,
    html_chars:       fetched.chars,
    fetch_strategy:   fetched.strategy,
    from_cache:       false,
    fetch_failed:     !fetched.html,
  };

  if (projectId) {
    const saveErr = await saveToCache(projectId, url, result);
    if (saveErr) result.save_error = saveErr;
  }
  return result;
}

function buildSummary(results: any[]) {
  const agg: Record<string, any> = {};
  for (const r of results)
    for (const kf of (r.knowledge_fields || []))
      agg[kf.key] = { ...kf, source_url: r.url };
  return {
    aggregated_knowledge:     Object.values(agg),
    cross_page_issues:        results.flatMap(r => (r.page_analysis?.issues || []).map((i: any) => ({ ...i, url: r.url }))),
    cross_page_opportunities: results.flatMap(r => (r.page_analysis?.opportunities || []).map((o: any) => ({ ...o, url: r.url }))),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _handler(req, res); }
  catch (e: any) { try { res.status(200).json({ error: "Unexpected: " + (e?.message||"unknown"), healthy: false }); } catch (_) {} }
}

async function _handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed" });
  const { action } = req.body;
  const anthropic = new Anthropic();

  // ── crawl_urls: stream NDJSON ────────────────────────────────────
  if (action === "crawl_urls") {
    const { urls, projectId = null, projectContext = "", taskHints = [], forceRefresh = false } = req.body;
    if (!Array.isArray(urls) || !urls.length) return res.status(200).json({ error: "No URLs provided" });

    const urlList = urls.slice(0, 10)
      .map((u: string) => u.trim().startsWith("http") ? u.trim() : `https://${u.trim()}`)
      .filter(u => u.length > 8);

    res.writeHead(200, {
      "Content-Type": "application/x-ndjson",
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache, no-transform",
      "Transfer-Encoding": "chunked",
    });

    const cache = projectId ? await getCached(projectId, urlList) : {};
    const results: any[] = [];

    for (const url of urlList) {
      try {
        const r = await processUrl(url, projectId, projectContext, taskHints as string[], forceRefresh as boolean, cache, anthropic);
        results.push(r);
        res.write(JSON.stringify({ type: "url_complete", url, result: r, progress: `${results.length}/${urlList.length}` }) + "\n");
      } catch (err: any) {
        const r = { url, status: 0, error: String(err.message), page_analysis: null, knowledge_fields: [] };
        results.push(r);
        res.write(JSON.stringify({ type: "url_complete", url, result: r, progress: `${results.length}/${urlList.length}` }) + "\n");
      }
    }

    res.write(JSON.stringify({ type: "complete", success: true, urls_crawled: results.length, crawled_at: new Date().toISOString(), results, ...buildSummary(results) }) + "\n");
    res.end();
    return;
  }

  // ── load_cached ───────────────────────────────────────────────────
  if (action === "load_cached") {
    const { projectId, urls } = req.body;
    if (!projectId) return res.status(200).json({ error: "projectId required" });
    try {
      let q = db().from("crawled_pages")
        .select("url,page_analysis,knowledge_fields,fetch_status,fetch_error,html_chars,crawl_status,crawled_at")
        .eq("project_id", projectId).order("crawled_at", { ascending: false });
      if (Array.isArray(urls) && urls.length) q = q.in("url", urls); else q = q.limit(50);
      const { data, error } = await q;
      if (error) return res.status(200).json({ error: error.message });
      const results = (data || []).map((row: any) => ({
        url: row.url, status: row.fetch_status || 200, error: row.fetch_error || undefined,
        page_analysis: row.page_analysis, knowledge_fields: row.knowledge_fields || [],
        html_chars: row.html_chars || 0, crawl_status: row.crawl_status,
        from_cache: true, cached_at: row.crawled_at,
      }));
      return res.status(200).json({ success: true, urls_crawled: results.length, crawled_at: results[0]?.cached_at || new Date().toISOString(), results, from_cache: true, ...buildSummary(results) });
    } catch (err: any) { return res.status(200).json({ success: false, error: err.message }); }
  }

  // ── compare_analysis ──────────────────────────────────────────────
  if (action === "compare_analysis") {
    const { crawlResults, projectContext = "", existingBlocks = [], taskHints = [], compareCriteria = [] } = req.body;
    if (!crawlResults?.results?.length) return res.status(200).json({ error: "No crawl results" });

    const results = crawlResults.results as any[];
    const withData = results.filter(r => r.page_analysis);
    if (!withData.length) {
      return res.status(200).json({
        error: "No page data available — all URLs failed to fetch. Check that the URLs are publicly accessible and try again with Force re-crawl enabled.",
      });
    }

    const summaries = results.map((r: any) => {
      const p = r.page_analysis;
      const cached = r.from_cache ? ` [cached ${r.cached_at?.split("T")[0]}]` : "";
      if (!p) return `URL: ${r.url}${cached}\nStatus: ${r.error || "fetch failed"}\n`;
      const lines = [
        `URL: ${r.url}${cached}`,
        p.title_tag && p.title_tag !== "Not found" ? `Title: "${p.title_tag}" (${p.title_length}ch) — ${p.title_issues}` : "Title: MISSING",
        p.h1 && p.h1 !== "Not found" ? `H1: "${p.h1}" — ${p.h1_issues}` : "H1: MISSING",
        p.meta_description && p.meta_description !== "Not found" ? `Meta: "${p.meta_description.slice(0, 80)}…" (${p.meta_desc_length}ch) — ${p.meta_desc_issues}` : "Meta: MISSING",
        p.h2s?.length ? `H2s: ${p.h2s.slice(0, 4).join(" | ")}` : null,
        p.schema_types?.length ? `Schema: ${p.schema_types.join(", ")} (${p.structured_data_quality})` : "Schema: none",
        p.faqs_detected?.length ? `FAQs: ${p.faqs_detected.slice(0, 2).join(" | ")}` : null,
        p.cta_elements?.length ? `CTAs: ${p.cta_elements.slice(0, 4).join(" | ")}` : null,
        `GEO: answer_format=${p.geo_readiness?.answer_format_quality} | perplexity=${p.geo_readiness?.perplexity_citation_likelihood}`,
        `Words: ${p.word_count} | Quality: ${p.content_quality} | Confidence: ${p.data_confidence}`,
        p.issues?.length ? `Issues: ${p.issues.slice(0, 3).map((i: any) => `[${i.severity}] ${i.detail.slice(0, 60)}`).join(" | ")}` : null,
        p.opportunities?.length ? `Opps: ${p.opportunities.slice(0, 2).map((o: any) => o.action.slice(0, 60)).join(" | ")}` : null,
      ].filter(Boolean);
      return lines.join("\n");
    }).join("\n\n---\n\n");

    const criteriaCtx = (compareCriteria as string[]).length
      ? `\n\nFOCUS on these criteria:\n${(compareCriteria as string[]).map((c, i) => `${i + 1}. ${c.replace(/_/g, " ")}`).join("\n")}` : "";
    const taskCtx = (taskHints as string[]).length
      ? `\nCanvas tasks: ${(taskHints as string[]).slice(0, 5).join(" | ")}` : "";
    const cardsCtx = (existingBlocks as any[]).filter(b => b.placed && b.status !== "done")
      .map(b => `[${b.type}|W${b.week}] "${b.title}"`).slice(0, 12).join("\n");

    const prompt = `You are Manav Brain — an expert SEO strategist. Analyse the crawled page data below and produce a comprehensive, actionable comparison.

Project: ${projectContext}${criteriaCtx}${taskCtx}

CRAWLED PAGES:
${summaries}

${cardsCtx ? `EXISTING CANVAS CARDS:\n${cardsCtx}` : ""}

Return ONLY valid JSON (absolutely no markdown fences, no prose before or after):
{
  "executive_summary": "2-3 sentences with the most important specific findings from the data above",
  "overall_score": 65,
  "comparison_matrix": {
    "headers": ["Signal", "${results.map((r: any) => r.url.replace(/https?:\/\//, "").split("/")[0]).join('", "')}"],
    "rows": [
      {"signal": "Title tag", "values": ["one status per URL"], "verdict": "best or worst or mixed"},
      {"signal": "H1", "values": ["one status per URL"], "verdict": "best or worst or mixed"},
      {"signal": "Meta description", "values": ["one status per URL"], "verdict": "best or worst or mixed"},
      {"signal": "Schema markup", "values": ["one status per URL"], "verdict": "best or worst or mixed"},
      {"signal": "Word count", "values": ["number or status per URL"], "verdict": "best or worst or mixed"},
      {"signal": "FAQs", "values": ["count or none per URL"], "verdict": "best or worst or mixed"},
      {"signal": "GEO readiness", "values": ["rating per URL"], "verdict": "best or worst or mixed"}
    ]
  },
  "errors": [
    {"severity": "critical", "issue": "specific issue with exact details", "affected_urls": ["url"], "fix": "exact fix step", "quick_fix": true}
  ],
  "opportunities": [
    {"rank": 1, "title": "opportunity title", "description": "specific what and why citing page data", "affected_urls": ["url"], "effort": "low", "impact": "high", "data_basis": "exact observation from the crawled data"}
  ],
  "competitive_gaps": [
    {"gap": "what is missing", "evidence": "which signals show this", "action": "specific step to close the gap", "priority": "high"}
  ],
  "advantages": [
    {"advantage": "what is done well", "urls": ["url"], "how_to_leverage": "specific suggestion"}
  ],
  "geo_analysis": {
    "overall_geo_score": "0-100",
    "pages_ready_for_ai_citation": ["urls with high readiness"],
    "faq_opportunities": ["specific page or topic needing FAQ"],
    "direct_answer_gaps": ["questions these pages should answer directly"],
    "entity_coverage": "assessment of entity markup",
    "recommendations": ["specific prioritised steps"]
  },
  "confidence_boosters": [
    {"card_title": "existing card title", "confidence_increase": "60% to 85%", "new_data_available": "what the crawl found", "action": "how to use it"}
  ],
  "card_proposals": [
    {"title": "max 8 words", "type": "technical", "week": 1, "priority": "high", "content": "specific actionable detail citing page data", "data_basis": "exact observation", "affected_urls": ["url"], "confidence": 80, "confidence_reason": "why this confidence", "merge_candidate": null, "merge_reason": null}
  ],
  "data_gaps": ["what could not be determined from the HTML alone"],
  "next_crawl_suggestions": ["specific URLs that would improve the analysis"]
}`;

    try {
      const msg = await anthropic.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 6000,
        system:     "You are Manav Brain. Return ONLY valid JSON. No markdown fences. No text before or after the JSON. Cite specific observations from the page data.",
        messages:   [{ role: "user", content: prompt }],
      });

      if (msg.stop_reason === "max_tokens") {
        console.warn("[compare] Response was truncated — attempting partial parse");
      }

      const raw   = (msg.content[0] as any).text || "";
      const analysis = parseJson(raw);

      if (!analysis || Object.keys(analysis).length < 3) {
        console.error("[compare] JSON parse failed. Raw response (first 300):", raw.slice(0, 300));
        return res.status(200).json({
          success: false,
          error: "Analysis could not be parsed. The model may have returned an incomplete response. Try again — if it persists, reduce the number of URLs.",
          raw_preview: raw.slice(0, 200),
        });
      }

      return res.status(200).json({ success: true, analysis });
    } catch (err: any) {
      console.error("[compare] Claude API error:", err.message);
      return res.status(200).json({ success: false, error: err.message });
    }
  }

  // ── preview_url ───────────────────────────────────────────────────
  if (action === "preview_url") {
    const { url } = req.body;
    if (!url) return res.status(200).json({ error: "URL required" });
    const clean = url.startsWith("http") ? url : `https://${url}`;
    const f = await fetchUrl(clean);
    return res.status(200).json({
      success: !!f.html, status: f.status, error: f.error, strategy: f.strategy,
      preview: f.html ? f.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) : "",
      chars: f.chars,
    });
  }

  return res.status(200).json({ error: "Unknown action" });
}