import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 300 };

// ─────────────────────────────────────────────────────────────────────
// Supabase client
// ─────────────────────────────────────────────────────────────────────
const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

// ─────────────────────────────────────────────────────────────────────
// Valid knowledge-field keys (must match project_knowledge schema)
// ─────────────────────────────────────────────────────────────────────
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
// HTML cleaning — strip everything Claude doesn't need
// Before: 14 000 chars of minified JS + CSS + HTML = 10 000 useless tokens
// After:  3 000 chars of pure <head> meta + visible body text
// ─────────────────────────────────────────────────────────────────────
function cleanHtml(html: string): string {
  let c = html;
  // Remove block tags and their content
  c = c.replace(/<script[\s\S]*?<\/script>/gi, "");
  c = c.replace(/<style[\s\S]*?<\/style>/gi, "");
  c = c.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  c = c.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  // Remove HTML comments
  c = c.replace(/<!--[\s\S]*?-->/g, "");
  // Collapse whitespace
  c = c.replace(/\s{2,}/g, " ").trim();
  // Return at most 12000 chars — enough for full <head> + first ~800 words of body
  return c.slice(0, 12000);
}

// ─────────────────────────────────────────────────────────────────────
// Multi-strategy fetch
//
// Strategy 1 — Direct Chrome UA
//   Works for ~60% of sites. Fast.
//
// Strategy 2 — Direct Googlebot UA
//   Sites that block Chrome but allow Googlebot (deliberately open to indexing).
//
// Strategy 3 — Jina Reader with API key (if JINA_API_KEY set)
//   r.jina.ai converts any page to clean markdown regardless of IP.
//   Requires JINA_API_KEY env var. Get free key at jina.ai.
//   Falls back gracefully if key not set.
//
// Strategy 4 — Google Web Cache
//   webcache.googleusercontent.com/search?q=cache:URL
//   Google serves its last crawl of the page. Bypasses bot protection entirely.
//   May be slightly stale (hours to days old) but always SEO-relevant.
//
// Strategy 5 — URL-only analysis (zero-fetch fallback)
//   If the URL itself is meaningful (contains slug keywords, path structure)
//   Claude can infer basic SEO signals without fetching HTML at all.
//   Gives partial results rather than a hard failure.
// ─────────────────────────────────────────────────────────────────────

const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const GBOT_UA   = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

interface FetchResult {
  html:      string;
  status:    number;
  strategy:  string;
  chars:     number;
  error?:    string;
}

// Low-level single fetch attempt with timeout
async function tryFetch(url: string, ua: string, extraHeaders: Record<string,string>, timeoutMs: number): Promise<FetchResult | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal:   ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent":      ua,
        "Accept":          "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control":   "no-cache",
        ...extraHeaders,
      },
    });
    clearTimeout(t);
    if (!r.ok) return null;

    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("text/")) return null;

    const text = await r.text();
    if (!text || text.trim().length < 200) return null;

    // Reject JavaScript challenge interstitials
    if (
      text.includes("cf-browser-verification") ||
      text.includes("Just a moment...") ||
      text.includes("Checking your browser before accessing") ||
      text.includes("DDoS protection by Cloudflare") ||
      (text.includes("Enable JavaScript") && text.length < 3000)
    ) return null;

    const clean = cleanHtml(text);
    return { html: clean, status: r.status, strategy: ua.includes("Googlebot") ? "googlebot" : "direct", chars: clean.length };
  } catch {
    clearTimeout(t);
    return null;
  }
}

// Jina Reader — converts any page to clean markdown (requires API key)
async function tryJina(url: string): Promise<FetchResult | null> {
  const key = process.env.JINA_API_KEY;
  if (!key) return null; // not configured — skip silently
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      signal: ctrl.signal,
      headers: {
        "Authorization":    `Bearer ${key}`,
        "Accept":           "text/plain",
        "X-Return-Format":  "text",
        "X-Timeout":        "12",
      },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const text = await r.text();
    if (!text || text.trim().length < 100) return null;
    return { html: text.slice(0, 12000), status: 200, strategy: "jina", chars: text.length };
  } catch {
    clearTimeout(t);
    return null;
  }
}

// Google Web Cache — fetches Google's stored copy of the page
async function tryGoogleCache(url: string): Promise<FetchResult | null> {
  const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}&hl=en`;
  const r = await tryFetch(cacheUrl, CHROME_UA, { "Referer": "https://www.google.com/" }, 10000);
  if (!r) return null;
  return { ...r, strategy: "google-cache" };
}

// Master fetch — runs all strategies in order, returns first success
async function fetchUrl(url: string): Promise<FetchResult & { allFailed?: boolean }> {
  // S1: Direct Chrome
  const s1 = await tryFetch(url, CHROME_UA, {}, 8000);
  if (s1) return s1;

  // S2: Googlebot
  await new Promise(r => setTimeout(r, 300));
  const s2 = await tryFetch(url, GBOT_UA, {}, 8000);
  if (s2) return s2;

  // S3: Jina (if API key configured)
  const s3 = await tryJina(url);
  if (s3) return s3;

  // S4: Google Web Cache
  await new Promise(r => setTimeout(r, 300));
  const s4 = await tryGoogleCache(url);
  if (s4) return s4;

  // All strategies failed — get the error code for reporting
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": CHROME_UA } });
    clearTimeout(t);
    const code = r.status;
    return {
      html: "", status: code, strategy: "failed", chars: 0,
      error: code === 403 ? "Site blocked server-side requests (403). Add JINA_API_KEY env var to bypass." :
             code === 429 ? "Rate limited (429)" :
             code === 503 ? "Server unavailable (503)" :
             `HTTP ${code}`,
      allFailed: true,
    };
  } catch (e: any) {
    clearTimeout(t);
    const m = String(e.message || "");
    return {
      html: "", status: 0, strategy: "failed", chars: 0, allFailed: true,
      error: m.includes("abort")      ? "Timeout — page took >8s on all strategies" :
             m.includes("ENOTFOUND")  ? "Domain not found — check the URL" :
             m.includes("ECONNRESET") ? "Connection reset by server" :
             m.slice(0, 100) || "Unknown network error",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// HTML → SEO analysis via Claude
// ─────────────────────────────────────────────────────────────────────

// Two-pass extraction:
// Pass 1 — Core fields: always present, no empty strings allowed
// Pass 2 — Enrichment: issues, opportunities, knowledge_fields
// This guarantees Pass 1 always returns complete data even if Pass 2 has gaps.

async function extractCore(url: string, html: string, anthropic: Anthropic): Promise<any> {
  const prompt = `You are an SEO extraction engine. Read the HTML below and extract ONLY what you can see directly in the markup. Do NOT guess or invent. If an element is absent write exactly "Not found".

URL: ${url}

HTML:
${html}

Return ONLY this JSON — every field required, no nulls, no empty strings:
{
  "title_tag": "exact text from <title> tag or Not found",
  "title_length": 0,
  "title_issues": "OK or Too long or Too short or Missing keyword or Duplicate",
  "meta_description": "exact content attribute of <meta name=description> or Not found",
  "meta_desc_length": 0,
  "meta_desc_issues": "OK or Missing or Too long or Not compelling",
  "h1": "exact text of first <h1> tag or Not found",
  "h1_issues": "OK or Missing or Multiple or Too generic",
  "h2s": ["exact text of each <h2> — up to 6"],
  "h3s": ["exact text of each <h3> — up to 4"],
  "canonical_url": "exact href of <link rel=canonical> or Not found",
  "word_count": 0,
  "content_type": "landing_page or blog or product or service or home or about or other",
  "primary_topic": "5-word summary of page topic",
  "schema_types": ["exact @type values found in JSON-LD script tags"],
  "structured_data_quality": "comprehensive or partial or minimal or none",
  "has_og_tags": true,
  "has_twitter_card": false,
  "internal_links": 0,
  "external_links": 0,
  "images_total": 0,
  "images_no_alt": 0,
  "has_robots_meta": "index,follow or noindex or Not found",
  "faqs_detected": ["exact FAQ question text visible on page — up to 5"],
  "cta_elements": ["exact text of each button, CTA link, or call-to-action — up to 8"],
  "trust_signals": ["each trust element present: testimonials, reviews count, certifications, awards, badges"],
  "keyword_presence": ["keywords appearing in H1, H2s, or first 200 words"],
  "content_quality": "high or medium or low",
  "geo_readiness": {
    "has_faq_schema": false,
    "has_howto_schema": false,
    "answer_format_quality": "high or medium or low or none",
    "perplexity_citation_likelihood": "high or medium or low"
  },
  "data_confidence": "high or medium or low",
  "confidence_reason": "one sentence explaining confidence level"
}`;

  const msg = await anthropic.messages.create({
    model:      "claude-sonnet-4-5",
    max_tokens: 2500,
    system:     "You are a precise SEO data extraction engine. Return ONLY valid JSON. No prose. No markdown fences. Every field must have a value — never null, never empty string except arrays which may be empty.",
    messages:   [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  const clean = raw.replace(/^```[a-z]*\n?/gm, "").replace(/^```\s*$/gm, "").trim();
  const f = clean.indexOf("{");
  const l = clean.lastIndexOf("}");
  if (f < 0 || l < 0) return {};
  try { return JSON.parse(clean.slice(f, l + 1)); } catch { return {}; }
}

async function extractEnrichment(url: string, html: string, coreData: any, anthropic: Anthropic): Promise<any> {
  const prompt = `You are an SEO analyst. Given the HTML and core data already extracted, add the remaining fields.

URL: ${url}
Already extracted: title="${coreData.title_tag}", h1="${coreData.h1}", word_count=${coreData.word_count}, schema=${JSON.stringify(coreData.schema_types)}

HTML:
${html}

Return ONLY this JSON:
{
  "issues": [
    {"severity": "critical or high or medium or low", "detail": "specific observation from the HTML", "fix": "exact actionable fix"}
  ],
  "opportunities": [
    {"action": "specific actionable step", "impact": "expected SEO or conversion impact", "effort": "low or medium or high", "evidence": "what in the HTML suggests this"}
  ],
  "knowledge_fields": [
    {"category": "technical or cms or analytics or goal", "key": "EXACT_KEY", "value": "exact observed value"}
  ]
}

For knowledge_fields use ONLY these exact keys (others will be rejected):
schema_markup, robots_txt, sitemap_url, canonical_issues, crawl_errors, broken_links,
cms, seo_plugin, pagespeed_mobile, pagespeed_desktop, top_landing_pages, target_keywords

Include 3-6 issues and 3-5 opportunities. Only include knowledge_fields you can actually observe in the HTML (e.g. if you see WordPress in the HTML, set cms=WordPress).`;

  const msg = await anthropic.messages.create({
    model:      "claude-sonnet-4-5",
    max_tokens: 1500,
    system:     "Return ONLY valid JSON. No prose. No markdown fences.",
    messages:   [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  const clean = raw.replace(/^```[a-z]*\n?/gm, "").replace(/^```\s*$/gm, "").trim();
  const f = clean.indexOf("{");
  const l = clean.lastIndexOf("}");
  if (f < 0 || l < 0) return { issues: [], opportunities: [], knowledge_fields: [] };
  try {
    const p = JSON.parse(clean.slice(f, l + 1));
    // Filter knowledge_fields to valid keys only
    p.knowledge_fields = (p.knowledge_fields || []).filter(
      (k: any) => k.key && VALID_KEYS.has(k.key) && k.value && String(k.value).trim()
    );
    return p;
  } catch {
    return { issues: [], opportunities: [], knowledge_fields: [] };
  }
}

// URL-only fallback: Claude infers SEO signals from the URL structure alone
async function analyseUrlOnly(url: string, anthropic: Anthropic): Promise<any> {
  const msg = await anthropic.messages.create({
    model:      "claude-sonnet-4-5",
    max_tokens: 1000,
    system:     "Return ONLY valid JSON. No prose. No markdown fences.",
    messages: [{
      role: "user",
      content: `The page at ${url} could not be fetched. Based ONLY on the URL structure, domain, and path, provide what you can infer about this page's SEO.

Return this JSON:
{
  "title_tag": "Not fetched — inferred: [what you can infer from URL]",
  "title_length": 0,
  "title_issues": "Cannot determine — page not fetched",
  "meta_description": "Not fetched",
  "meta_desc_length": 0,
  "meta_desc_issues": "Cannot determine — page not fetched",
  "h1": "Not fetched",
  "h1_issues": "Cannot determine",
  "h2s": [],
  "h3s": [],
  "canonical_url": "Not fetched",
  "word_count": 0,
  "content_type": "infer from URL path",
  "primary_topic": "infer from URL slug",
  "schema_types": [],
  "structured_data_quality": "none",
  "has_og_tags": false,
  "has_twitter_card": false,
  "internal_links": 0,
  "external_links": 0,
  "images_total": 0,
  "images_no_alt": 0,
  "has_robots_meta": "Not fetched",
  "faqs_detected": [],
  "cta_elements": [],
  "trust_signals": [],
  "keyword_presence": ["infer from URL slug words"],
  "content_quality": "low",
  "geo_readiness": {"has_faq_schema": false, "has_howto_schema": false, "answer_format_quality": "none", "perplexity_citation_likelihood": "low"},
  "issues": [{"severity": "critical", "detail": "Page could not be fetched — all access strategies failed", "fix": "Check URL is correct and publicly accessible. Add JINA_API_KEY environment variable to enable proxy fetching."}],
  "opportunities": [{"action": "Make page publicly accessible for crawling", "impact": "Enable full SEO analysis", "effort": "low", "evidence": "Page blocked all fetch attempts"}],
  "data_confidence": "low",
  "confidence_reason": "Page could not be fetched — analysis based on URL structure only",
  "knowledge_fields": []
}`,
    }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  const clean = raw.replace(/^```[a-z]*\n?/gm, "").replace(/^```\s*$/gm, "").trim();
  const f = clean.indexOf("{"), l = clean.lastIndexOf("}");
  if (f < 0 || l < 0) return null;
  try { return JSON.parse(clean.slice(f, l + 1)); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function getCached(projectId: string, urls: string[]): Promise<Record<string, any>> {
  if (!projectId || !urls.length) return {};
  try {
    const { data } = await sb
      .from("crawled_pages")
      .select("url,page_analysis,knowledge_fields,fetch_status,html_chars,crawl_status,crawled_at")
      .eq("project_id", projectId)
      .in("url", urls);
    const map: Record<string, any> = {};
    for (const r of (data || [])) map[r.url] = r;
    return map;
  } catch (e) {
    console.error("[cache] getCached failed:", e);
    return {};
  }
}

async function saveToCache(projectId: string, url: string, result: any) {
  if (!projectId) return;
  try {
    await sb.from("crawled_pages").upsert({
      project_id:       projectId,
      url,
      page_analysis:    result.page_analysis ?? null,
      knowledge_fields: result.knowledge_fields ?? [],
      fetch_status:     result.status ?? 0,
      fetch_error:      result.error ?? null,
      html_chars:       result.html_chars ?? 0,
      fetch_strategy:   result.fetch_strategy ?? null,
      crawl_status:     result.page_analysis ? "success"
                        : result.status === 403 ? "blocked" : "failed",
      crawled_at:       new Date().toISOString(),
    }, { onConflict: "project_id,url" });
  } catch (e) {
    console.error("[cache] saveToCache failed:", e);
  }
}

function isFresh(cachedAt: string): boolean {
  return Date.now() - new Date(cachedAt).getTime() < CACHE_TTL_MS;
}

// ─────────────────────────────────────────────────────────────────────
// Process a single URL end-to-end
// ─────────────────────────────────────────────────────────────────────
async function processUrl(
  url: string,
  projectId: string | null,
  projectContext: string,
  taskHints: string[],
  forceRefresh: boolean,
  cache: Record<string, any>,
  anthropic: Anthropic,
): Promise<any> {
  // ── Serve from cache if fresh ──
  const cached = cache[url];
  if (cached && !forceRefresh && isFresh(cached.crawled_at)) {
    console.log(`[crawl] cache hit: ${url}`);
    return {
      url,
      status:           cached.fetch_status || 200,
      page_analysis:    cached.page_analysis,
      knowledge_fields: cached.knowledge_fields || [],
      html_chars:       cached.html_chars || 0,
      fetch_strategy:   cached.fetch_strategy || "cache",
      from_cache:       true,
      cached_at:        cached.crawled_at,
    };
  }

  // ── Fetch live ──
  console.log(`[crawl] fetching: ${url}`);
  const fetched = await fetchUrl(url);

  let pageAnalysis: any;
  let fetchStrategy = fetched.strategy;

  if (fetched.html) {
    // ── Two-pass Claude extraction ──
    console.log(`[crawl] analysing: ${url} (${fetched.chars} chars, strategy: ${fetched.strategy})`);
    try {
      const [core, enrichment] = await Promise.all([
        extractCore(url, fetched.html, anthropic),
        extractEnrichment(url, fetched.html, {}, anthropic),
      ]);
      // Merge core + enrichment into single analysis object
      pageAnalysis = {
        ...core,
        issues:           enrichment.issues           || [],
        opportunities:    enrichment.opportunities    || [],
        knowledge_fields: enrichment.knowledge_fields || [],
      };
    } catch (err: any) {
      console.error(`[crawl] analysis error for ${url}:`, err.message);
      // Try URL-only fallback if analysis itself crashes
      pageAnalysis = await analyseUrlOnly(url, anthropic);
    }
  } else {
    // ── Fetch failed — URL-only analysis ──
    console.log(`[crawl] fetch failed for ${url}: ${fetched.error}. Running URL-only analysis.`);
    pageAnalysis = await analyseUrlOnly(url, anthropic);
    // Mark the real fetch error in the analysis
    if (pageAnalysis) {
      pageAnalysis.fetch_error = fetched.error;
      pageAnalysis.issues = [
        { severity: "critical", detail: `Page could not be fetched: ${fetched.error}`, fix: "Ensure the page is publicly accessible. Add JINA_API_KEY env var for proxy access." },
        ...(pageAnalysis.issues || []).slice(0, 4),
      ];
    }
  }

  const knowledgeFields = Array.isArray(pageAnalysis?.knowledge_fields)
    ? pageAnalysis.knowledge_fields.filter((k: any) => k.key && VALID_KEYS.has(k.key) && k.value?.toString().trim())
    : [];

  const result = {
    url,
    status:           fetched.html ? 200 : (fetched.status || 0),
    error:            fetched.html ? undefined : fetched.error,
    page_analysis:    pageAnalysis,
    knowledge_fields: knowledgeFields,
    html_chars:       fetched.chars,
    fetch_strategy:   fetchStrategy,
    from_cache:       false,
    fetch_failed:     !fetched.html,
  };

  if (projectId) await saveToCache(projectId, url, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────
// Summary aggregation
// ─────────────────────────────────────────────────────────────────────
function buildSummary(results: any[]) {
  const agg: Record<string, any> = {};
  for (const r of results)
    for (const kf of (r.knowledge_fields || []))
      agg[kf.key] = { ...kf, source_url: r.url };
  return {
    aggregated_knowledge:     Object.values(agg),
    cross_page_issues:        results.flatMap(r => (r.page_analysis?.issues        || []).map((i: any) => ({ ...i, url: r.url }))),
    cross_page_opportunities: results.flatMap(r => (r.page_analysis?.opportunities || []).map((o: any) => ({ ...o, url: r.url }))),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { action } = req.body;
  const anthropic = new Anthropic();

  // ════════════════════════════════════════════════════════════════════
  // ACTION: crawl_urls
  // Streams NDJSON — one JSON line per URL as it completes, then a
  // final "complete" line. UI can render results progressively.
  // ════════════════════════════════════════════════════════════════════
  if (action === "crawl_urls") {
    const {
      urls,
      projectId      = null,
      projectContext = "",
      taskHints      = [],
      forceRefresh   = false,
    } = req.body;

    if (!Array.isArray(urls) || !urls.length)
      return res.status(400).json({ error: "No URLs provided" });

    const urlList = urls
      .slice(0, 10)
      .map((u: string) => u.trim().startsWith("http") ? u.trim() : `https://${u.trim()}`)
      .filter(u => u.length > 8);

    // Start NDJSON stream
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Cache-Control", "no-cache");
    res.status(200);

    // Load all cached results in one DB round-trip
    const cache = projectId ? await getCached(projectId, urlList) : {};
    const results: any[] = [];

    for (const url of urlList) {
      try {
        const r = await processUrl(
          url, projectId, projectContext,
          taskHints as string[], forceRefresh as boolean,
          cache, anthropic,
        );
        results.push(r);

        res.write(JSON.stringify({
          type:     "url_complete",
          url,
          result:   r,
          progress: `${results.length}/${urlList.length}`,
        }) + "\n");

      } catch (err: any) {
        const r = {
          url, status: 0, error: String(err.message),
          page_analysis: null, knowledge_fields: [],
        };
        results.push(r);
        res.write(JSON.stringify({ type: "url_complete", url, result: r, progress: `${results.length}/${urlList.length}` }) + "\n");
      }
    }

    res.write(JSON.stringify({
      type:        "complete",
      success:     true,
      urls_crawled: results.length,
      crawled_at:  new Date().toISOString(),
      results,
      ...buildSummary(results),
    }) + "\n");
    res.end();
    return;
  }

  // ════════════════════════════════════════════════════════════════════
  // ACTION: load_cached
  // Returns all previously-crawled pages for a project from DB.
  // ════════════════════════════════════════════════════════════════════
  if (action === "load_cached") {
    const { projectId, urls } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    try {
      let q = sb
        .from("crawled_pages")
        .select("url,page_analysis,knowledge_fields,fetch_status,fetch_error,html_chars,crawl_status,crawled_at")
        .eq("project_id", projectId)
        .order("crawled_at", { ascending: false });
      if (Array.isArray(urls) && urls.length) q = q.in("url", urls);
      else q = q.limit(50);

      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });

      const results = (data || []).map((row: any) => ({
        url:              row.url,
        status:           row.fetch_status || 200,
        error:            row.fetch_error  || undefined,
        page_analysis:    row.page_analysis,
        knowledge_fields: row.knowledge_fields || [],
        html_chars:       row.html_chars || 0,
        crawl_status:     row.crawl_status,
        fetch_strategy:   (row as any).fetch_strategy || undefined,
        from_cache:       true,
        cached_at:        row.crawled_at,
      }));

      return res.status(200).json({
        success:      true,
        urls_crawled: results.length,
        crawled_at:   results[0]?.cached_at || new Date().toISOString(),
        results,
        from_cache:   true,
        ...buildSummary(results),
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // ACTION: compare_analysis
  // Runs Manav Brain comparison across all crawled pages.
  // ════════════════════════════════════════════════════════════════════
  if (action === "compare_analysis") {
    const {
      crawlResults,
      projectContext = "",
      existingBlocks = [],
      taskHints      = [],
      compareCriteria = [],
    } = req.body;

    if (!crawlResults?.results?.length)
      return res.status(400).json({ error: "No crawl results to analyse" });

    const results = crawlResults.results as any[];

    const summaries = results.map((r: any) => {
      const p = r.page_analysis;
      const cached = r.from_cache ? ` [cached ${r.cached_at?.split("T")[0]}]` : "";
      if (!p) return `URL: ${r.url}${cached}\nStatus: ${r.error || "no data"}\n`;
      return [
        `URL: ${r.url}${cached}`,
        `Title: "${p.title_tag}" (${p.title_length}ch) — ${p.title_issues}`,
        `H1: "${p.h1}" — ${p.h1_issues}`,
        `Meta: ${p.meta_description !== "Not found" ? `"${p.meta_description}" (${p.meta_desc_length}ch) — ${p.meta_desc_issues}` : "MISSING"}`,
        `H2s: ${p.h2s?.join(" | ") || "none"}`,
        `Schema: ${p.schema_types?.length ? p.schema_types.join(", ") : "none"} (${p.structured_data_quality})`,
        `FAQs: ${p.faqs_detected?.length ? p.faqs_detected.slice(0, 2).join(" | ") : "none"}`,
        `CTAs: ${p.cta_elements?.slice(0, 4).join(" | ") || "none"}`,
        `GEO: ${p.geo_readiness?.answer_format_quality} | Perplexity: ${p.geo_readiness?.perplexity_citation_likelihood}`,
        `Words: ${p.word_count} | Quality: ${p.content_quality} | Confidence: ${p.data_confidence}`,
        `Issues: ${p.issues?.slice(0, 3).map((i: any) => `[${i.severity}] ${i.detail}`).join(" | ") || "none"}`,
        `Opportunities: ${p.opportunities?.slice(0, 3).map((o: any) => o.action).join(" | ") || "none"}`,
      ].join("\n");
    }).join("\n\n---\n\n");

    const criteriaCtx = (compareCriteria as string[]).length
      ? `\nFocus on these criteria:\n${(compareCriteria as string[]).map((c, i) => `${i + 1}. ${c.replace(/_/g, " ")}`).join("\n")}`
      : "";
    const taskCtx = (taskHints as string[]).length
      ? `\nCanvas tasks: ${(taskHints as string[]).slice(0, 6).join(" | ")}` : "";
    const cardsCtx = (existingBlocks as any[])
      .filter(b => b.placed && b.status !== "done")
      .map(b => `[${b.type}|W${b.week}] "${b.title}"`)
      .slice(0, 15).join("\n");

    const prompt = `You are Manav Brain. Comprehensive SEO comparison. Cite exact text from page data.

Project: ${projectContext}${criteriaCtx}${taskCtx}

PAGES:
${summaries}

${cardsCtx ? `CANVAS CARDS:\n${cardsCtx}` : ""}

Return ONLY valid JSON (no fences):
{
  "executive_summary": "2-3 sentences with specific observations from the data",
  "overall_score": 0,
  "comparison_matrix": {
    "headers": ["Signal", "URL short label per page"],
    "rows": [{"signal": "Title tag", "values": ["status per page"], "verdict": "best or worst or mixed"}],
    "note": "values array length must equal number of pages"
  },
  "errors": [{"severity": "critical|high|medium|low", "issue": "issue description", "affected_urls": ["url"], "fix": "exact fix", "quick_fix": true}],
  "opportunities": [{"rank": 1, "title": "opportunity", "description": "what and why", "affected_urls": ["url"], "effort": "low|medium|high", "impact": "high|medium|low", "data_basis": "exact observation from data"}],
  "competitive_gaps": [{"gap": "what is missing", "evidence": "what signals show this", "action": "step to close", "priority": "high|medium|low"}],
  "advantages": [{"advantage": "what is done well", "urls": ["url"], "how_to_leverage": "specific suggestion"}],
  "geo_analysis": {"overall_geo_score": "0-100", "pages_ready_for_ai_citation": ["url"], "faq_opportunities": ["page or topic"], "direct_answer_gaps": ["question"], "entity_coverage": "assessment", "recommendations": ["specific step"]},
  "confidence_boosters": [{"card_title": "existing card title", "confidence_increase": "X to Y%", "new_data_available": "what the crawl found", "action": "how to use it"}],
  "card_proposals": [{"title": "max 8 words", "type": "technical|content|geo|quick-win|competitive|insight", "week": 1, "priority": "high|medium|low", "content": "actionable detail citing page data", "data_basis": "exact observation", "affected_urls": ["url"], "confidence": 0, "confidence_reason": "why", "merge_candidate": null, "merge_reason": null}],
  "data_gaps": ["what could not be determined"],
  "next_crawl_suggestions": ["specific URLs to crawl next"]
}`;

    try {
      const msg = await anthropic.messages.create({
        model:      "claude-sonnet-4-5",
        max_tokens: 5000,
        system:     "You are Manav Brain. Return only valid JSON. No markdown fences. Cite exact text from the page data provided.",
        messages:   [{ role: "user", content: prompt }],
      });
      const raw   = (msg.content[0] as any).text || "{}";
      const clean = raw.replace(/^```[a-z]*\n?/gm, "").replace(/^```\s*$/gm, "").trim();
      const f = clean.indexOf("{"), l = clean.lastIndexOf("}");
      let analysis: any = {};
      try { analysis = JSON.parse(clean.slice(f, l + 1)); }
      catch { try { analysis = JSON.parse(clean.slice(f) + "}"); } catch {} }
      return res.status(200).json({ success: true, analysis });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // ACTION: preview_url
  // Quick reachability check with content preview.
  // ════════════════════════════════════════════════════════════════════
  if (action === "preview_url") {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });
    const clean = url.startsWith("http") ? url : `https://${url}`;
    const f = await fetchUrl(clean);
    return res.status(200).json({
      success:  !!f.html,
      status:   f.status,
      error:    f.error,
      strategy: f.strategy,
      preview:  f.html ? f.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) : "",
      chars:    f.chars,
    });
  }

  return res.status(400).json({ error: "Unknown action" });
}
