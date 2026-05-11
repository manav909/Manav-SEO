import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 300 };

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const SYSTEM = "You are Manav Brain. Extract SEO signals from live page HTML. Quote exact text. State 'Not found' for absent elements. Return ONLY valid JSON, no prose.";

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

const SCHEMA = `{
  "title_tag":"exact text","title_length":0,"title_issues":"OK|Too long|Too short|Missing keyword",
  "meta_description":"exact text","meta_desc_length":0,"meta_desc_issues":"OK|Missing|Too long",
  "h1":"exact text or Not found","h1_issues":"OK|Missing|Multiple",
  "h2s":["up to 5 H2 texts"],"h3s":["up to 3 H3 texts"],
  "canonical_url":"exact href or Missing",
  "word_count":0,"content_quality":"high|medium|low",
  "content_type":"landing_page|blog|product|service|home|about|other",
  "primary_topic":"5 words","reading_level":"technical|intermediate|beginner",
  "keyword_presence":["keywords in H1/H2/first paragraph"],
  "schema_types":["@type values from JSON-LD script tags"],
  "structured_data_quality":"comprehensive|partial|minimal|none",
  "internal_links":0,"external_links":0,"images_total":0,"images_no_alt":0,
  "has_og_tags":false,"has_twitter_card":false,
  "has_robots_meta":"index,follow|noindex|not visible",
  "faqs_detected":["exact FAQ question text visible on page"],
  "cta_elements":["exact button/link CTA text"],
  "trust_signals":["what trust elements are present"],
  "geo_readiness":{
    "has_faq_schema":false,"has_howto_schema":false,
    "answer_format_quality":"high|medium|low|none",
    "perplexity_citation_likelihood":"high|medium|low"
  },
  "issues":[{"type":"str","severity":"critical|high|medium|low","detail":"specific observation","fix":"exact fix"}],
  "opportunities":[{"action":"specific step","impact":"SEO impact","effort":"low|medium|high","evidence":"what in HTML"}],
  "data_confidence":"high|medium|low","confidence_reason":"why",
  "knowledge_fields":[{"category":"technical|cms|analytics|goal","key":"ONE_OF_VALID_KEYS","value":"exact value"}]
}
knowledge_fields valid keys ONLY: schema_markup, robots_txt, sitemap_url, canonical_issues,
crawl_errors, broken_links, cms, seo_plugin, pagespeed_mobile, pagespeed_desktop,
top_landing_pages, target_keywords`;

// ── Cache ─────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
  } catch { return {}; }
}

async function saveToCache(projectId: string, url: string, result: any) {
  if (!projectId) return;
  try {
    await sb.from("crawled_pages").upsert({
      project_id:       projectId,
      url,
      page_analysis:    result.page_analysis    ?? null,
      knowledge_fields: result.knowledge_fields ?? [],
      fetch_status:     result.status           ?? 0,
      fetch_error:      result.error            ?? null,
      html_chars:       result.html_chars       ?? 0,
      crawl_status:     result.page_analysis ? "success"
                        : result.status === 403 ? "blocked" : "failed",
      crawled_at:       new Date().toISOString(),
    }, { onConflict: "project_id,url" });
  } catch (e) {
    console.error("[crawl] saveToCache failed:", e);
  }
}

function isFresh(cachedAt: string): boolean {
  return Date.now() - new Date(cachedAt).getTime() < CACHE_TTL_MS;
}

// ── Fetch: 3 UA strategies with short per-attempt timeouts ────────────
// Each attempt is capped at 8s. Total worst case = 3 × 8s + 2 × 300ms = 24.6s per URL.
// Previously each attempt was 12s → worst case 44.5s → 8-URL timeout.

const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
];

const UA_NAMES = ["chrome", "safari", "googlebot"];

// Minimal but complete header set — too many Sec-* headers on Vercel can
// trigger Cloudflare "browser integrity check" because the headers don't
// match what a real browser would send at the network layer.
function headers(ua: string) {
  return {
    "User-Agent":      ua,
    "Accept":          "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control":   "no-cache",
  };
}

interface FetchResult {
  html:     string;
  status:   number;
  error?:   string;
  strategy: string;
  chars:    number;
}

async function fetchOnce(url: string, ua: string, name: string, ms: number): Promise<FetchResult | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: headers(ua) });
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("text/")) return null;
    const text = await r.text();
    if (!text || text.trim().length < 300) return null;
    // Detect JavaScript challenge pages (Cloudflare/Bot-protection interstitials)
    if (
      text.includes("Just a moment") ||
      text.includes("cf-browser-verification") ||
      text.includes("Enable JavaScript") ||
      text.includes("Checking your browser")
    ) return null;
    return { html: text.slice(0, 14000), status: r.status, strategy: name, chars: text.length };
  } catch (e: any) {
    clearTimeout(t);
    return null;
  }
}

async function fetchUrl(url: string): Promise<FetchResult & { error?: string }> {
  for (let i = 0; i < UAS.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 300)); // 300ms between attempts
    const result = await fetchOnce(url, UAS[i], UA_NAMES[i], 8000);
    if (result) return result;
  }
  // All strategies failed — capture the actual error for the UI
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: headers(UAS[0]) });
    clearTimeout(t);
    const code = r.status;
    return {
      html: "", status: code, chars: 0, strategy: "failed",
      error: code === 403 ? "Blocked (403 Forbidden)" :
             code === 429 ? "Rate limited (429)" :
             code === 503 ? "Server unavailable (503)" :
             `HTTP ${code}`,
    };
  } catch (e: any) {
    clearTimeout(t);
    const m = String(e.message || "");
    return {
      html: "", status: 0, chars: 0, strategy: "failed",
      error: m.includes("abort")      ? "Timeout (page too slow)" :
             m.includes("ENOTFOUND")  ? "Domain not found" :
             m.includes("ECONNRESET") ? "Connection reset" :
             m.slice(0, 80) || "Unknown network error",
    };
  }
}

// ── Analyse HTML with Claude ──────────────────────────────────────────
async function analysePage(
  url: string, html: string,
  projectContext: string, taskHints: string[],
  anthropic: Anthropic,
): Promise<any> {
  const prompt = [
    `SEO analysis of: ${url}`,
    projectContext ? `Project: ${projectContext}` : "",
    taskHints.length ? `Canvas tasks needing data: ${taskHints.slice(0, 4).join(" | ")}` : "",
    "",
    "Extract all SEO signals from the RAW HTML below.",
    "Read <title>, <meta name=description>, H1-H3 text, <link rel=canonical>,",
    "JSON-LD in <script type=application/ld+json>, meta og:*, a[href] counts,",
    "img[alt] vs img[no alt], button/CTA text, visible FAQ questions.",
    "",
    "PAGE HTML:",
    html,
    "",
    `Return ONLY this JSON structure (no prose, no markdown fences):\n${SCHEMA}`,
  ].filter(Boolean).join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5", max_tokens: 2000, system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  if (msg.stop_reason === "max_tokens") console.warn(`[crawl] max_tokens hit for ${url}`);

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  // Strip markdown fences if model adds them despite instructions
  const cleaned = raw.replace(/^```[a-z]*\n?/gm, "").replace(/^```$/gm, "").trim();
  const f = cleaned.indexOf("{"), l = cleaned.lastIndexOf("}");
  let p: any = {};
  try { p = JSON.parse(cleaned.slice(f, l + 1)); } catch {}

  p.knowledge_fields = Array.isArray(p.knowledge_fields)
    ? p.knowledge_fields.filter((k: any) => k.key && VALID_KEYS.has(k.key) && k.value?.toString().trim())
    : [];
  return p;
}

// ── Process single URL (cache-aware) ─────────────────────────────────
async function processUrl(
  url: string, projectId: string | null,
  projectContext: string, taskHints: string[],
  forceRefresh: boolean, cache: Record<string, any>,
  anthropic: Anthropic,
): Promise<any> {
  // Serve from cache if fresh and not forced
  const cached = cache[url];
  if (cached && !forceRefresh && isFresh(cached.crawled_at)) {
    console.log(`[crawl] cache hit ${url}`);
    return {
      url, status: cached.fetch_status || 200,
      page_analysis: cached.page_analysis,
      knowledge_fields: cached.knowledge_fields || [],
      html_chars: cached.html_chars || 0,
      from_cache: true, cached_at: cached.crawled_at,
    };
  }

  // Fetch live
  console.log(`[crawl] live fetch ${url}`);
  const f = await fetchUrl(url);

  if (!f.html) {
    const result = {
      url, status: f.status, error: f.error || "All fetch strategies failed",
      page_analysis: null, knowledge_fields: [], html_chars: 0, from_cache: false,
    };
    if (projectId) await saveToCache(projectId, url, result);
    return result;
  }

  // Analyse
  try {
    const analysis = await analysePage(url, f.html, projectContext, taskHints, anthropic);
    const result = {
      url, status: 200, page_analysis: analysis,
      knowledge_fields: analysis.knowledge_fields || [],
      html_chars: f.chars, fetch_strategy: f.strategy, from_cache: false,
    };
    if (projectId) await saveToCache(projectId, url, result);
    return result;
  } catch (err: any) {
    const result = {
      url, status: f.status, error: `Analysis error: ${err.message}`,
      page_analysis: null, knowledge_fields: [], html_chars: f.chars, from_cache: false,
    };
    if (projectId) await saveToCache(projectId, url, result);
    return result;
  }
}

function buildSummary(results: any[]) {
  const agg: Record<string, any> = {};
  for (const r of results)
    for (const kf of (r.knowledge_fields || []))
      agg[kf.key] = { ...kf, source_url: r.url };
  return {
    aggregated_knowledge: Object.values(agg),
    cross_page_issues: results.flatMap(r =>
      (r.page_analysis?.issues || []).map((i: any) => ({ ...i, url: r.url }))),
    cross_page_opportunities: results.flatMap(r =>
      (r.page_analysis?.opportunities || []).map((o: any) => ({ ...o, url: r.url }))),
  };
}

// ─────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { action } = req.body;
  const anthropic = new Anthropic();

  // ══ CRAWL URLS — streams NDJSON so UI updates per URL ════════════
  if (action === "crawl_urls") {
    const {
      urls, projectId = null, projectContext = "",
      taskHints = [], forceRefresh = false,
    } = req.body;

    if (!Array.isArray(urls) || !urls.length)
      return res.status(400).json({ error: "No URLs provided" });

    const urlList = urls.slice(0, 10)
      .map((u: string) => u.trim().startsWith("http") ? u.trim() : `https://${u.trim()}`)
      .filter(u => u.length > 8);

    // NDJSON streaming — UI shows each URL result as it completes
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Cache-Control", "no-cache");
    res.status(200);

    // One DB round-trip to get all cached results up front
    const cache = projectId ? await getCached(projectId, urlList) : {};

    const results: any[] = [];

    for (const url of urlList) {
      try {
        const r = await processUrl(url, projectId, projectContext, taskHints, forceRefresh, cache, anthropic);
        results.push(r);
        // Stream result immediately — UI renders it without waiting for all URLs
        res.write(JSON.stringify({
          type: "url_complete", url, result: r,
          progress: `${results.length}/${urlList.length}`,
        }) + "\n");
      } catch (err: any) {
        const r = { url, status: 0, error: String(err.message), page_analysis: null, knowledge_fields: [] };
        results.push(r);
        res.write(JSON.stringify({ type: "url_complete", url, result: r, progress: `${results.length}/${urlList.length}` }) + "\n");
      }
    }

    // Final complete message
    res.write(JSON.stringify({
      type: "complete", success: true,
      urls_crawled: results.length,
      crawled_at: new Date().toISOString(),
      results,
      ...buildSummary(results),
    }) + "\n");
    res.end();
    return;
  }

  // ══ LOAD CACHED PAGES ═════════════════════════════════════════════
  if (action === "load_cached") {
    const { projectId, urls } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    try {
      let q = sb.from("crawled_pages")
        .select("url,page_analysis,knowledge_fields,fetch_status,fetch_error,html_chars,crawl_status,crawled_at")
        .eq("project_id", projectId)
        .order("crawled_at", { ascending: false });
      if (Array.isArray(urls) && urls.length) q = q.in("url", urls);
      else q = q.limit(50);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      const results = (data || []).map((row: any) => ({
        url: row.url, status: row.fetch_status || 200,
        error: row.fetch_error || undefined,
        page_analysis: row.page_analysis,
        knowledge_fields: row.knowledge_fields || [],
        html_chars: row.html_chars || 0,
        crawl_status: row.crawl_status,
        from_cache: true, cached_at: row.crawled_at,
      }));
      return res.status(200).json({
        success: true, urls_crawled: results.length,
        crawled_at: results[0]?.cached_at || new Date().toISOString(),
        results, from_cache: true, ...buildSummary(results),
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ══ COMPARE ANALYSIS ══════════════════════════════════════════════
  if (action === "compare_analysis") {
    const { crawlResults, projectContext = "", existingBlocks = [], taskHints = [], compareCriteria = [] } = req.body;
    if (!crawlResults?.results?.length) return res.status(400).json({ error: "No crawl results" });

    const results = crawlResults.results as any[];
    const summaries = results.map((r: any) => {
      const p = r.page_analysis;
      if (!p) return `URL: ${r.url}\nStatus: ${r.error || "no data"}\n`;
      return [
        `URL: ${r.url}${r.from_cache ? ` (cached ${r.cached_at?.split("T")[0]})` : ""}`,
        `Title: "${p.title_tag}" (${p.title_length}ch) — ${p.title_issues}`,
        `H1: "${p.h1}" — ${p.h1_issues}`,
        `Meta: ${p.meta_description ? `"${p.meta_description}" (${p.meta_desc_length}ch)` : "MISSING"}`,
        `H2s: ${p.h2s?.join(" | ") || "none"}`,
        `Schema: ${p.schema_types?.join(", ") || "none"} (${p.structured_data_quality})`,
        `FAQs: ${p.faqs_detected?.length ? p.faqs_detected.slice(0, 2).join(" | ") : "none detected"}`,
        `CTAs: ${p.cta_elements?.join(" | ") || "none"}`,
        `GEO: ${p.geo_readiness?.answer_format_quality} quality | Perplexity: ${p.geo_readiness?.perplexity_citation_likelihood}`,
        `Words: ${p.word_count} | Quality: ${p.content_quality} | Confidence: ${p.data_confidence}`,
        `Issues: ${p.issues?.map((i: any) => `[${i.severity}] ${i.detail}`).join(" | ") || "none"}`,
        `Opportunities: ${p.opportunities?.map((o: any) => o.action).join(" | ") || "none"}`,
      ].join("\n");
    }).join("\n\n---\n\n");

    const criteriaCtx = (compareCriteria as string[]).length
      ? `\nFocus SPECIFICALLY on:\n${(compareCriteria as string[]).map((c, i) => `${i + 1}. ${c.replace(/_/g, " ")}`).join("\n")}`
      : "";
    const taskCtx = (taskHints as string[]).length
      ? `\nCanvas tasks: ${(taskHints as string[]).slice(0, 6).join(" | ")}` : "";
    const cardsCtx = (existingBlocks as any[]).filter(b => b.placed && b.status !== "done")
      .map(b => `[${b.type}|W${b.week}] "${b.title}"`).slice(0, 15).join("\n");

    const prompt = [
      "You are Manav Brain. Multi-page SEO comparison. Be specific, cite exact text.",
      `Project: ${projectContext}`, criteriaCtx, taskCtx, "", "PAGES:", summaries, "",
      cardsCtx ? `CANVAS CARDS:\n${cardsCtx}` : "",
      `\nReturn ONLY valid JSON:\n{
  "executive_summary":"2-3 sentences with specific observations",
  "overall_score":0,
  "comparison_matrix":{"headers":["Signal","URL1","URL2"],"rows":[{"signal":"Title","values":["status per URL"],"verdict":"best|worst|mixed"}]},
  "errors":[{"severity":"critical|high|medium|low","issue":"issue","affected_urls":["url"],"fix":"fix","quick_fix":true}],
  "opportunities":[{"rank":1,"title":"title","description":"what+why","affected_urls":["url"],"effort":"low|medium|high","impact":"high|medium|low","data_basis":"observation"}],
  "competitive_gaps":[{"gap":"missing","evidence":"signals","action":"step","priority":"high|medium|low"}],
  "advantages":[{"advantage":"good","urls":["url"],"how_to_leverage":"suggestion"}],
  "geo_analysis":{"overall_geo_score":"0-100","pages_ready_for_ai_citation":["url"],"faq_opportunities":["topic"],"direct_answer_gaps":["question"],"entity_coverage":"assessment","recommendations":["step"]},
  "confidence_boosters":[{"card_title":"card","confidence_increase":"X to Y%","new_data_available":"data","action":"how"}],
  "card_proposals":[{"title":"max 8 words","type":"technical|content|geo|quick-win|competitive|insight","week":1,"priority":"high|medium|low","content":"detail","data_basis":"exact observation","affected_urls":["url"],"confidence":0,"confidence_reason":"why","merge_candidate":null,"merge_reason":null}],
  "data_gaps":["unknown"],"next_crawl_suggestions":["url"]
}`,
    ].filter(Boolean).join("\n");

    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-5", max_tokens: 5000,
        system: "You are Manav Brain. Return only valid JSON. No markdown fences.",
        messages: [{ role: "user", content: prompt }],
      });
      const raw = (msg.content[0] as any).text || "{}";
      const cleaned = raw.replace(/^```[a-z]*\n?/gm, "").replace(/^```$/gm, "").trim();
      const f = cleaned.indexOf("{"), l = cleaned.lastIndexOf("}");
      let analysis: any = {};
      try { analysis = JSON.parse(cleaned.slice(f, l + 1)); }
      catch { try { analysis = JSON.parse(cleaned.slice(f) + "}"); } catch {} }
      return res.status(200).json({ success: true, analysis });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ══ PREVIEW URL ═══════════════════════════════════════════════════
  if (action === "preview_url") {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });
    const clean = url.startsWith("http") ? url : `https://${url}`;
    const f = await fetchUrl(clean);
    return res.status(200).json({
      success: !!f.html, status: f.status, error: f.error, strategy: f.strategy,
      preview: f.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400),
      chars: f.chars,
    });
  }

  return res.status(400).json({ error: "Unknown action" });
}
