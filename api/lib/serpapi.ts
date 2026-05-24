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
   1. SerpAPI key lives in `project_integrations` (provider='serpapi',
      `api_key` column). Matches PSI's pattern exactly. The Data Room
      Integrations UI already handles row creation.
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

import { db } from './db';
import { createHash } from 'crypto';

export interface SerpFeatures {
  /* Boolean presence flags — what's on the SERP */
  ai_overview:        boolean;
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
  /* For downstream competitive analysis */
  top_10_urls:        string[];            /* organic top 10 URLs in order */
  top_10_domains:     string[];            /* unique organic top 10 domains in order */
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
  return `serpapi:google:${country}:${hash}`;
}

/* ─────────────────────────────────────────────────────────────────
   Key lookup. Project-scoped (each project sets its own SerpAPI key
   in Data Room → Integrations). Returns null if no row, no key, or
   status indicates disabled.
   ───────────────────────────────────────────────────────────────── */
async function lookupSerpApiKey(projectId: string): Promise<string | null> {
  try {
    const { data } = await db().from("project_integrations")
      .select("api_key, status")
      .eq("project_id", projectId)
      .eq("provider", 'serpapi')
      .maybeSingle();
    const row = data as { api_key?: string; status?: string } | null;
    if (!row || !row.api_key) return null;
    if (row.status && row.status !== 'active' && row.status !== 'connected') return null;
    return row.api_key;
  } catch {
    return null;
  }
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
    return { ...parsed, cache_hit: true } as SerpFeatures;
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

  /* Organic results */
  const organic = Array.isArray(json?.organic_results) ? json.organic_results : [];
  const organic_count = organic.length;
  const top_10 = organic.slice(0, 10).map((r: any) => r?.link).filter((l: any) => typeof l === 'string');
  const top_10_domains_arr: string[] = [];
  for (const url of top_10) {
    const d = extractDomainFromUrl(url);
    if (d && !top_10_domains_arr.includes(d)) top_10_domains_arr.push(d);
  }

  return {
    ai_overview,
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
    top_10_urls:    top_10,
    top_10_domains: top_10_domains_arr,
    fetched_at:     new Date().toISOString(),
    query,
    country,
    cache_hit:      false,
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

  /* 3. Build SerpAPI request URL */
  const url = new URL('https://serpapi.com/search');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('gl', country);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('num', '10');
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
