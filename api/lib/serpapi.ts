/* ═══════════════════════════════════════════════════════════════════
   api/lib/serpapi.ts — SerpAPI integration (Phase 16.1, 2026-05-24)

   Provides verified SERP-feature detection and top-10 URL listing for
   the campaign keyword. Currently consumed by:
     - seo-technical-audit.ts: enriches the CTR-underperformance finding
       with the actual SERP features present (AI Overview, featured
       snippet, PAA, ads, etc.) — turning the "either (a) title/meta is
       weak OR (b) features are siphoning clicks" hypothesis into a
       verified answer.

   Future consumers (planned, not yet wired):
     - seo-cluster-map.ts: verified competitor_owners (replaces
       LLM-cited list with actual top-10 domain ownership)
     - hub-candidate ranking: cross-reference top-10 with the project's
       own URLs to detect where the project ranks for cluster queries
     - competitive content benchmark: fetch top-10 word counts, derive
       median, compare to audited page's word count
     - freshness comparison: top-10 dateModified vs audited page

   Architecture decisions (read before changing):
   1. SerpAPI key resolved in two tiers (see `lookupSerpApiKey`):
        (a) per-project override from `project_integrations` (provider='serpapi')
            — useful for white-label clients with separate billing
        (b) platform-wide `SERPAPI_KEY` env var (Vercel) — the DEFAULT
            path for normal multi-tenant operation. SerpAPI keys are
            account-scoped, so one key naturally serves all projects.
      Set the env var once; every current AND future project picks it
      up automatically. No SQL ritual when new projects are created.
   2. Cache uses `ai_content_cache` with `project_id: null` — platform-
      wide because SERP data is public (Google serves identical SERPs
      to all users in a country at a point in time). One client audit
      benefits all subsequent clients auditing the same keyword.
   3. Cache TTL is 7 days. SERP features (AI Overview presence, snippet
      ownership, ads density) shift on the order of weeks for stable
      queries. 7 days balances cost against staleness. AI Overview
      churn is the fastest-moving — accept some staleness here as the
      cost of not being expensive.
   4. Function returns `null` on any failure (missing key, fetch error,
      timeout, parse error). Callers MUST handle null and fall back to
      their original behavior. Never throw — never block the audit.
   5. NOT a new api/*.ts function (we are at the 12-function ceiling).
      This is api/lib/* — a utility library called from existing
      pillars. No registry changes needed.
═══════════════════════════════════════════════════════════════════ */

import { db } from './db.js';
import { createHash } from 'crypto';

export interface SerpFeatures {
  /* Boolean presence flags — what's on the SERP */
  ai_overview:        boolean;
  /* Build 12.16 — when an AI Overview is present, capture WHICH domains
     Google cited inside it. This is the most actionable GEO signal —
     "the AI Overview for your keyword cites these 5 sites." Empty array
     when ai_overview is false or SerpAPI did not return references. */
  ai_overview_references: { url: string; domain: string; title?: string }[];
  ai_overview_reference_count: number;
  featured_snippet:   boolean;
  featured_snippet_owner: string | null;   /* domain of the page in the featured snippet */
  people_also_ask:    boolean;
  paa_questions:      string[];            /* extracted PAA questions for content-gap analysis */
  knowledge_panel:    boolean;
  top_stories:        boolean;
  video_carousel:     boolean;
  shopping_carousel:  boolean;
  /* Density counters */
  ads_top:            number;              /* top-of-page ads count */
  ads_bottom:         number;
  organic_count:      number;
  /* For downstream competitive analysis.
     Phase 16.3 — num bumped from 10 to 100 (same cost per call, much more
     useful for position-check depth). top_10_* fields retained for
     backward compatibility with cluster-map consumers; new top_100_*
     fields enable exact position-in-100 reporting for the audited URL. */
  top_10_urls:        string[];            /* organic top 10 URLs in order (first 10 from top_100_urls) */
  top_10_domains:     string[];            /* unique organic top 10 domains in order */
  top_100_urls:       string[];            /* organic top 100 URLs in order — full depth for position-check */
  top_100_domains:    string[];            /* unique organic top 100 domains in order */
  /* Provenance */
  fetched_at:         string;              /* ISO timestamp */
  query:              string;
  country:            string;
  cache_hit:          boolean;             /* true if served from cache, false if fresh fetch */
}

export interface FetchSerpOptions {
  /** ISO country code, defaults to 'us'. SerpAPI uses `gl` parameter. */
  country?: string;
  /** Bypass cache and force a fresh fetch. Default false. */
  no_cache?: boolean;
}

const CACHE_TTL_DAYS = 7;
const FETCH_TIMEOUT_MS = 15000;

/* ─────────────────────────────────────────────────────────────────
   Cache key generation. Platform-wide (no project ID in key) since
   SERP data is public. Format:
     serpapi:google:{country}:{query_hash}
   Query hash is md5 of lowercase-normalized query to avoid case/
   whitespace mismatches creating duplicate cache rows.
   ───────────────────────────────────────────────────────────────── */
function buildCacheKey(query: string, country: string): string {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
  const hash = createHash('md5').update(normalized).digest('hex').slice(0, 16);
  /* Phase 16.3 — v2 prefix forces fresh fetch since num=100 (was 10).
     Old v1 cache entries become orphaned but expire naturally in 7 days. */
  return `serpapi:google:v2:${country}:${hash}`;
}

/* ─────────────────────────────────────────────────────────────────
   Key lookup. Two-tier resolution:

   1. Per-project override from `project_integrations` (provider='serpapi').
      Use this only when a specific project needs a different key
      (white-label clients with separate SerpAPI billing, etc.).

   2. Platform-wide env-var fallback (`SERPAPI_KEY`). This is the
      DEFAULT path for normal multi-tenant operation — set the env
      var once on Vercel, every project (current AND future) uses
      that key. SerpAPI keys are account-scoped anyway, so one key
      naturally serves all projects.

   Returns null if neither tier provides a key. Callers handle null
   gracefully and fall through to the original recommendation.
   ───────────────────────────────────────────────────────────────── */
async function lookupSerpApiKey(projectId: string): Promise<string | null> {
  /* Tier 1: per-project override */
  try {
    const { data } = await db().from("project_integrations")
      .select("api_key, status")
      .eq("project_id", projectId)
      .eq("provider", 'serpapi')
      .maybeSingle();
    const row = data as { api_key?: string; status?: string } | null;
    if (row?.api_key) {
      if (!row.status || row.status === 'active' || row.status === 'connected') {
        return row.api_key;
      }
    }
  } catch {
    /* DB lookup failed — fall through to env-var tier rather than aborting */
  }

  /* Tier 2: platform-wide env-var. Default for normal operation. */
  const envKey = (process.env.SERPAPI_KEY || '').trim();
  if (envKey) return envKey;

  return null;
}

/* ─────────────────────────────────────────────────────────────────
   Cache read. Returns the cached SerpFeatures or null if absent/stale.
   ───────────────────────────────────────────────────────────────── */
async function readCache(cacheKey: string): Promise<SerpFeatures | null> {
  try {
    const { data } = await db().from("ai_content_cache")
      .select("response, updated_at")
      .eq("cache_key", cacheKey)
      .is("project_id", null)
      .maybeSingle();
    const row = data as { response?: any; updated_at?: string } | null;
    if (!row || !row.response || !row.updated_at) return null;
    /* TTL check */
    const ageMs = Date.now() - new Date(row.updated_at).getTime();
    if (ageMs > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) return null;
    /* response may be string (JSON) or object depending on insert form */
    const parsed = typeof row.response === 'string' ? JSON.parse(row.response) : row.response;
    /* Defensive normalization (Phase 16.3): if a cached entry pre-dates
       the top_100_* fields, derive them from top_10_*. The v2 cache-key
       prefix should orphan all v1 entries, but this guards against any
       slip-through (e.g. if the prefix is changed back). */
    const normalized: SerpFeatures = {
      ...parsed,
      top_100_urls:    Array.isArray(parsed?.top_100_urls)    ? parsed.top_100_urls    : (Array.isArray(parsed?.top_10_urls)    ? parsed.top_10_urls    : []),
      top_100_domains: Array.isArray(parsed?.top_100_domains) ? parsed.top_100_domains : (Array.isArray(parsed?.top_10_domains) ? parsed.top_10_domains : []),
      /* Build 12.16 — older cache rows pre-date the AI Overview reference
         extraction. Default to empty arrays so consumers can rely on the
         fields existing. Stale cache rows will repopulate naturally on
         next refresh (within the 7-day TTL). */
      ai_overview_references:      Array.isArray(parsed?.ai_overview_references)      ? parsed.ai_overview_references      : [],
      ai_overview_reference_count: typeof parsed?.ai_overview_reference_count === 'number' ? parsed.ai_overview_reference_count : (Array.isArray(parsed?.ai_overview_references) ? parsed.ai_overview_references.length : 0),
      cache_hit:       true,
    };
    return normalized;
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────
   Cache write. Best-effort — failures don't block the return.
   ───────────────────────────────────────────────────────────────── */
async function writeCache(cacheKey: string, features: SerpFeatures): Promise<void> {
  try {
    await db().from("ai_content_cache").upsert({
      cache_key:   cacheKey,
      response:    features,
      project_id:  null,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'cache_key' });
  } catch (e: any) {
    console.log(`[serpapi] cache write failed: ${e?.message || 'unknown'} — not blocking`);
  }
}

/* ─────────────────────────────────────────────────────────────────
   Parse SerpAPI's google engine response into structured SerpFeatures.

   SerpAPI response shape (relevant keys):
     - ai_overview              { text_blocks, references } | undefined
     - answer_box               { type, title, ... }       | undefined
     - related_questions        [{ question, answer }, …]  | undefined
     - knowledge_graph          { title, ... }             | undefined
     - top_stories              [{ ... }, …]               | undefined
     - inline_videos            [{ ... }, …]               | undefined
     - shopping_results         [{ ... }, …]               | undefined
     - ads                      [{ position, link, ... }]  | undefined
     - organic_results          [{ position, link, displayed_link, ... }]

   The featured_snippet is sometimes called `answer_box` in SerpAPI's
   schema. We treat any `answer_box` with type 'organic_result' as a
   featured snippet for our purposes.
   ───────────────────────────────────────────────────────────────── */
function parseSerpApiResponse(json: any, query: string, country: string): SerpFeatures {
  /* AI Overview */
  const ai_overview = !!(json?.ai_overview);

  /* Build 12.16 — extract citation list (domains Google cites inside
     the AI Overview answer for this query). SerpAPI exposes this as
     ai_overview.references which is an array of { link, title, source }.
     Some responses use ai_overview.text_blocks[].reference_indexes
     pointing into a flat references array; we normalise both shapes
     into a clean domain list with up to one entry per unique domain. */
  let ai_overview_references: { url: string; domain: string; title?: string }[] = [];
  if (ai_overview) {
    const refsRaw = Array.isArray(json.ai_overview?.references) ? json.ai_overview.references : [];
    const seenDomains = new Set<string>();
    for (const r of refsRaw) {
      const url = typeof r?.link === 'string' ? r.link : (typeof r?.url === 'string' ? r.url : '');
      if (!url) continue;
      const domain = extractDomainFromUrl(url);
      if (!domain || seenDomains.has(domain)) continue;
      seenDomains.add(domain);
      ai_overview_references.push({
        url,
        domain,
        title: typeof r?.title === 'string' ? r.title : (typeof r?.source === 'string' ? r.source : undefined),
      });
      if (ai_overview_references.length >= 20) break;
    }
  }
  const ai_overview_reference_count = ai_overview_references.length;

  /* Featured snippet (SerpAPI answer_box) */
  const ab = json?.answer_box;
  const featured_snippet = !!(ab && (ab.type === 'organic_result' || ab.type === 'paragraph' || ab.type === 'list' || ab.snippet || ab.answer));
  const featured_snippet_owner = featured_snippet ? (extractDomainFromUrl(ab?.link || ab?.source_link || '') || null) : null;

  /* PAA */
  const paa = Array.isArray(json?.related_questions) ? json.related_questions : [];
  const people_also_ask = paa.length > 0;
  const paa_questions = paa.map((p: any) => p?.question).filter((q: any) => typeof q === 'string').slice(0, 8);

  /* Other SERP features */
  const knowledge_panel = !!(json?.knowledge_graph);
  const top_stories = Array.isArray(json?.top_stories) && json.top_stories.length > 0;
  const video_carousel = Array.isArray(json?.inline_videos) && json.inline_videos.length > 0;
  const shopping_carousel = Array.isArray(json?.shopping_results) && json.shopping_results.length > 0;

  /* Ads density */
  const ads_arr = Array.isArray(json?.ads) ? json.ads : [];
  const ads_top    = ads_arr.filter((a: any) => a?.position && a.position <= 4).length;
  const ads_bottom = ads_arr.filter((a: any) => a?.position && a.position > 4).length;

  /* Organic results.
     Phase 16.3 — extract full top 100. top_10_* fields are derived slices
     for backward compat with cluster-map's existing logic. */
  const organic = Array.isArray(json?.organic_results) ? json.organic_results : [];
  const organic_count = organic.length;
  const top_100 = organic.slice(0, 100).map((r: any) => r?.link).filter((l: any) => typeof l === 'string');
  const top_100_domains_arr: string[] = [];
  for (const u of top_100) {
    const d = extractDomainFromUrl(u);
    if (d && !top_100_domains_arr.includes(d)) top_100_domains_arr.push(d);
  }
  const top_10 = top_100.slice(0, 10);
  const top_10_domains_arr: string[] = [];
  for (const u of top_10) {
    const d = extractDomainFromUrl(u);
    if (d && !top_10_domains_arr.includes(d)) top_10_domains_arr.push(d);
  }

  return {
    ai_overview,
    ai_overview_references,
    ai_overview_reference_count,
    featured_snippet,
    featured_snippet_owner,
    people_also_ask,
    paa_questions,
    knowledge_panel,
    top_stories,
    video_carousel,
    shopping_carousel,
    ads_top,
    ads_bottom,
    organic_count,
    top_10_urls:     top_10,
    top_10_domains:  top_10_domains_arr,
    top_100_urls:    top_100,
    top_100_domains: top_100_domains_arr,
    fetched_at:      new Date().toISOString(),
    query,
    country,
    cache_hit:       false,
  };
}

function extractDomainFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────
   Main entry point. Fetches SERP features for a query, with caching.

   Returns null if:
     - No SerpAPI key configured for the project
     - Network fetch fails (timeout, 4xx, 5xx)
     - Response cannot be parsed

   Never throws. Callers MUST handle null and fall back gracefully.
   ───────────────────────────────────────────────────────────────── */
export async function fetchSerpFeatures(
  query: string,
  projectId: string,
  options: FetchSerpOptions = {},
): Promise<SerpFeatures | null> {
  if (!query || !query.trim()) return null;
  if (!projectId) return null;

  const country = (options.country || 'us').toLowerCase();
  const cacheKey = buildCacheKey(query, country);

  /* 1. Check cache unless explicitly bypassed */
  if (!options.no_cache) {
    const cached = await readCache(cacheKey);
    if (cached) return cached;
  }

  /* 2. Look up API key */
  const apiKey = await lookupSerpApiKey(projectId);
  if (!apiKey) {
    console.log(`[serpapi] no key configured for project ${projectId} — returning null`);
    return null;
  }

  /* 3. Build SerpAPI request URL.
     Phase 16.3 — num bumped to 100 (was 10). Same SerpAPI cost per call,
     dramatically more useful for position-check depth ("URL at position 47"
     vs "URL not in top-10") and future competitive-depth analyses. */
  const url = new URL('https://serpapi.com/search');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('gl', country);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('num', '100');
  url.searchParams.set('api_key', apiKey);

  /* 4. Fetch with timeout */
  let json: any;
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      console.log(`[serpapi] fetch failed: HTTP ${res.status} for query "${query}"`);
      return null;
    }
    json = await res.json();
    if (json?.error) {
      console.log(`[serpapi] API error: ${json.error} for query "${query}"`);
      return null;
    }
  } catch (e: any) {
    console.log(`[serpapi] fetch exception: ${e?.message || 'unknown'} for query "${query}"`);
    return null;
  }

  /* 5. Parse + cache + return */
  const features = parseSerpApiResponse(json, query, country);
  await writeCache(cacheKey, features);
  return features;
}

/* Finds REAL question threads on Reddit and Quora for a topic — the actual
   titles and links from a live Google search via SerpAPI. NO SYNTHESIS: every
   question is a real, clickable thread the operator can verify. Returns an empty
   list with a reason when there is no key or no results — never an invented
   question. Consumes one SerpAPI search credit. */
/* Fetches Google's Knowledge Panel (knowledge_graph) for a NAME — works with no
   website. Returns the real panel if Google shows one (title, type, description,
   its source, attributes, and the profile links it surfaces), else present:false.
   This is the ground truth for a Knowledge Panel enrichment audit. */
export async function fetchKnowledgePanel(query: string, projectId: string, options: { country?: string } = {}): Promise<{ present: boolean; title?: string; type?: string; description?: string; source?: string; attributes?: Record<string, string>; profiles?: Array<{ name: string; link: string }>; has_image?: boolean; raw_keys?: string[]; error?: string }> {
  const q = (query || "").trim();
  if (!q) return { present: false, error: "no query supplied" };
  if (!projectId) return { present: false, error: "no project" };
  const apiKey = await lookupSerpApiKey(projectId);
  if (!apiKey) return { present: false, error: "no SerpAPI key configured" };
  const country = (options.country || "us").toLowerCase();
  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", q);
  url.searchParams.set("gl", country);
  url.searchParams.set("hl", country === "it" ? "it" : country === "fr" ? "fr" : country === "de" ? "de" : country === "es" ? "es" : "en");
  url.searchParams.set("api_key", apiKey);
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return { present: false, error: `SerpAPI HTTP ${res.status}` };
    const json = await res.json();
    if (json?.error) return { present: false, error: String(json.error) };
    const kg = json?.knowledge_graph;
    if (!kg) return { present: false };
    const SKIP = new Set(["title", "type", "description", "kgmid", "knowledge_graph_search_link", "serpapi_knowledge_graph_search_link", "thumbnail", "image", "header_images", "description_link", "description_source", "source"]);
    const attributes: Record<string, string> = {};
    for (const [k, v] of Object.entries(kg)) if (typeof v === "string" && !SKIP.has(k)) attributes[k] = v;
    const profiles = Array.isArray(kg.profiles) ? kg.profiles.map((p: any) => ({ name: String(p?.name || ""), link: String(p?.link || "") })).filter((p: any) => p.link) : [];
    return { present: true, title: kg.title, type: kg.type, description: kg.description, source: kg?.source?.name || kg?.description_source || undefined, attributes, profiles, has_image: !!(kg.thumbnail || kg.image || (Array.isArray(kg.header_images) && kg.header_images.length)), raw_keys: Object.keys(kg) };
  } catch (e: any) { return { present: false, error: e?.message || "request failed" }; }
}

export async function findForumQuestions(
  topic: string,
  projectId: string,
  options: { country?: string; limit?: number } = {},
): Promise<{ questions: Array<{ question: string; url: string; source: string; snippet: string }>; error?: string }> {
  const q = (topic || "").trim();
  if (!q) return { questions: [], error: "no topic supplied" };
  if (!projectId) return { questions: [], error: "no project" };
  const apiKey = await lookupSerpApiKey(projectId);
  if (!apiKey) return { questions: [], error: "no SerpAPI key configured — cannot find real questions, and none will be invented" };
  const country = (options.country || "us").toLowerCase();
  const limit = Math.max(1, Math.min(options.limit || 12, 30));

  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", `${q} (site:reddit.com OR site:quora.com)`);
  url.searchParams.set("gl", country);
  url.searchParams.set("hl", "en");
  url.searchParams.set("num", "30");
  url.searchParams.set("api_key", apiKey);

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return { questions: [], error: `SerpAPI HTTP ${res.status}` };
    const json = await res.json();
    if (json?.error) return { questions: [], error: String(json.error) };
    const organic = Array.isArray(json?.organic_results) ? json.organic_results : [];
    const seen = new Set<string>();
    const questions: Array<{ question: string; url: string; source: string; snippet: string }> = [];
    for (const r of organic) {
      const link = typeof r?.link === "string" ? r.link : "";
      const title = typeof r?.title === "string" ? r.title : "";
      if (!link || !title) continue;
      const domain = extractDomainFromUrl(link);
      const source = /reddit\.com/i.test(domain) ? "Reddit" : /quora\.com/i.test(domain) ? "Quora" : "";
      if (!source) continue;
      if (seen.has(link)) continue; seen.add(link);
      questions.push({
        question: title.replace(/\s*[-|]\s*(Reddit|Quora).*$/i, "").trim(),
        url: link, source,
        snippet: typeof r?.snippet === "string" ? r.snippet : "",
      });
      if (questions.length >= limit) break;
    }
    return { questions };
  } catch (e: any) {
    return { questions: [], error: e?.message || "request failed" };
  }
}

/* ─────────────────────────────────────────────────────────────────
   Helper: human-readable summary of the most impactful SERP features.
   Used by audit findings to explain WHY CTR is suppressed.
   Returns null if no significant features present.
   ───────────────────────────────────────────────────────────────── */
export function summarizeSerpFeatures(f: SerpFeatures): string | null {
  const notes: string[] = [];
  if (f.ai_overview) {
    notes.push('**AI Overview** present at top of SERP — Google AI summary typically suppresses organic CTR by 30-50% for informational queries');
  }
  if (f.featured_snippet) {
    if (f.featured_snippet_owner) {
      notes.push(`**Featured snippet** owned by \`${f.featured_snippet_owner}\` — captures zero-click traffic before your organic result`);
    } else {
      notes.push('**Featured snippet** present — captures zero-click traffic before organic results');
    }
  }
  if (f.people_also_ask) {
    notes.push(`**People Also Ask** box (${f.paa_questions.length} questions) — pushes organic results further down`);
  }
  if (f.ads_top >= 3) {
    notes.push(`**${f.ads_top} top-of-page ads** — heavy paid placement compresses organic visibility`);
  }
  if (f.shopping_carousel) {
    notes.push('**Shopping carousel** present — commercial-intent queries push organic below product listings');
  }
  if (f.video_carousel) {
    notes.push('**Video carousel** present — visual results compete for attention with text results');
  }
  if (f.top_stories) {
    notes.push('**Top Stories** carousel — news results occupy prime SERP real estate');
  }
  if (notes.length === 0) return null;
  return notes.join('\n- ');
}
