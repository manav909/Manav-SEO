/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/shared.ts

   Shared types and verified-data loaders for the Quantum Intelligence
   Workspace. Project-agnostic: every function takes ids/urls as args.
   No hardcoded domains, paths, scenarios, or project ids anywhere.
════════════════════════════════════════════════════════════════ */

import { db } from "../db.js";
import { ga4PullPageMetrics } from "../pm-ga4.js";
import { fetchSerpFeatures } from "../serpapi.js";

/* ─── A single verified fact: value + where it came from + when ─── */
export interface SourcedFact {
  value: any;
  source: string;      // e.g. "GSC query-page pairs", "live HTML crawl", "SerpAPI"
  fetched_at: string;  // ISO timestamp
  note?: string;
}

export const STAKEHOLDER_ROLES = ["client", "dms", "writer", "brand", "pm", "investor"] as const;
export type StakeholderRole = typeof STAKEHOLDER_ROLES[number];

export const ROLE_LABEL: Record<string, string> = {
  client: "Client", dms: "Senior SEO Specialist", writer: "Content Writer",
  brand: "Brand", pm: "Project Manager", investor: "Investor", manav: "Manav",
};

/* ─── timeout wrapper ──────────────────────────────────────────── */
export async function withTimeout<T>(p: Promise<T>, label = "q", ms = 12000): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms)),
  ]).catch((e) => { console.warn(`[workspace] ${e.message}`); return null; });
}

/* ─── live HTML fetch with hard kill ───────────────────────────── */
/* A real browser UA. The old "SEOSeasonBot/1.0" identifier was being blocked or
   challenged by site WAFs (Cloudflare, hosting rules), which returned a 403 page
   while Googlebot — whitelisted — saw the real page. Crawling as a normal browser
   gets the same page Google indexes, so on-page facts match reality. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/* The full header set a real Chrome navigation sends. Many WAFs (Cloudflare
   managed rules, hosting bot filters) do not block on User-Agent alone — they
   check for the complete, self-consistent set of navigation headers. A request
   with only UA + Accept looks automated and gets a 403 challenge; this set
   passes the common header-completeness heuristics. Accept-Encoding is left to
   the runtime (undici) so the body is always decoded correctly. */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": BROWSER_UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "sec-ch-ua": "\"Chromium\";v=\"124\", \"Google Chrome\";v=\"124\", \"Not-A.Brand\";v=\"99\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"Windows\"",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

export async function fetchHtml(url: string, ms = 12000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow", signal: controller.signal,
    });
    /* never return a 4xx/5xx body so no caller parses an error or challenge page */
    if (!r.ok) return "";
    return (await r.text()) || "";
  } catch { return ""; } finally { clearTimeout(timer); }
}

/* Status-aware fetch. Returns the body ONLY on a genuine 2xx response, plus the
   HTTP status, final URL, and any X-Robots-Tag header. This is what lets callers
   tell a real page from a 403/challenge/error body — the distinction the audit
   crawler previously lacked, which is why it reported a WAF block page's title,
   word count and robots meta as if they were the target page's. */
export async function fetchPageRaw(url: string, ms = 12000): Promise<{
  ok: boolean; status: number; html: string; finalUrl: string; xRobotsTag: string; blocked: boolean;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow", signal: controller.signal,
    });
    const status = r.status;
    const ok = status >= 200 && status < 300;
    const xRobotsTag = r.headers.get("x-robots-tag") || "";
    const finalUrl = (r as any).url || url;
    /* never read a 4xx/5xx body as page content — it is an error or challenge page */
    const html = ok ? ((await r.text()) || "") : "";
    /* 401/403/429/5xx = access blocked or challenged, not a missing or noindex page */
    const blocked = status === 401 || status === 403 || status === 429 || status >= 500;
    return { ok, status, html, finalUrl, xRobotsTag, blocked };
  } catch {
    return { ok: false, status: 0, html: "", finalUrl: url, xRobotsTag: "", blocked: false };
  } finally { clearTimeout(timer); }
}

/** Fetch a URL and return verified on-page facts (status, indexability, title,
    h1, meta, word count, schema). Used for both target and competitor pages.
    On a non-2xx (blocked/challenged/error), returns loaded:false with the real
    status and NO parsed facts — it never treats an error page's body as content. */
export async function fetchPageFacts(url: string): Promise<{
  url: string; loaded: boolean; status_ok: boolean; status: number; blocked: boolean;
  title: string; title_len: number; h1: string; meta: string;
  word_count: number; noindex: boolean; canonical: string; schema: boolean;
}> {
  const { ok, status, html, blocked, xRobotsTag } = await fetchPageRaw(url);
  /* fetch failed / blocked / challenged — report it honestly. NEVER parse the
     error body for title/word-count/robots. Parsing a 403 block page is exactly
     what produced the bogus "403 + noindex + 11 words" reading on every page
     while Googlebot saw the real, indexed page. */
  if (!ok) {
    return {
      url, loaded: false, status_ok: false, status, blocked,
      title: "", title_len: 0, h1: "", meta: "",
      word_count: 0, noindex: false, canonical: "", schema: false,
    };
  }
  const loaded = html.length > 300;
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() || "";
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, "").trim() || "";
  const meta = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1]?.trim() || "";
  const canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) || [])[1]?.trim() || "";
  const wordCount = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").split(/\s+/).filter(w => w.length > 2).length;
  /* indexability = a real robots-meta noindex OR an X-Robots-Tag: noindex header.
     The old code also matched the bare word "noindex" anywhere in the first 3000
     chars, which false-positives on any page that merely mentions it (or on an
     error page). Require the actual directive instead. */
  const metaNoindex   = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*\bnoindex\b/i.test(html);
  const headerNoindex = /\bnoindex\b/i.test(xRobotsTag);
  const noindex = metaNoindex || headerNoindex;
  const schema = /application\/ld\+json/i.test(html);
  return {
    url, loaded, status_ok: true, status, blocked: false,
    title, title_len: title.length, h1, meta,
    word_count: wordCount, noindex, canonical, schema,
  };
}

/* ─── GSC verified data loaders ────────────────────────────────── */
export interface GscData {
  topPages: any[];
  topQueries: any[];
  queryPagePairs: any[];   // {query, page, clicks, impressions, ctr, position}
  /* Build 12.16 — GEO / AI surface attribution */
  aiOverviewSummary: any | null;     // { present, total_impressions, total_clicks, breakdown, ... } or null
  searchAppearance: any[];           // full searchAppearance breakdown (aiOverview, featuredSnippet, richResult, ...)
  discoverSummary: any | null;       // { clicks, impressions, window_days, ... } or null
  newsTopQueries: any[];             // top queries on Google News surface
  fetchedAt: string;
}

export async function loadGsc(projectId: string): Promise<GscData> {
  const fetchedAt = new Date().toISOString();
  try {
    const r = await withTimeout(
      db().from("project_knowledge").select("field_key,field_value,updated_at")
        .eq("project_id", projectId)
        .in("field_key", [
          "gsc_top_pages",
          "gsc_top_queries",
          "gsc_query_page_pairs",
          "gsc_ai_overview_summary",
          "gsc_search_appearance",
          "gsc_discover_summary",
          "gsc_news_top_queries",
        ]),
      "gsc"
    );
    const rows = ((r as any)?.data || []) as any[];
    const parse = (k: string) => {
      const row = rows.find(x => x.field_key === k);
      try { return row ? JSON.parse(row.field_value || "[]") : []; } catch { return []; }
    };
    const parseObj = (k: string) => {
      const row = rows.find(x => x.field_key === k);
      try { return row ? JSON.parse(row.field_value || "null") : null; } catch { return null; }
    };
    return {
      topPages:           parse("gsc_top_pages"),
      topQueries:         parse("gsc_top_queries"),
      queryPagePairs:     parse("gsc_query_page_pairs"),
      aiOverviewSummary:  parseObj("gsc_ai_overview_summary"),
      searchAppearance:   parse("gsc_search_appearance"),
      discoverSummary:    parseObj("gsc_discover_summary"),
      newsTopQueries:     parse("gsc_news_top_queries"),
      fetchedAt,
    };
  } catch {
    return {
      topPages: [], topQueries: [], queryPagePairs: [],
      aiOverviewSummary: null, searchAppearance: [], discoverSummary: null, newsTopQueries: [],
      fetchedAt,
    };
  }
}

/** Compute THIS site's own CTR-by-position curve from its real GSC query-page
    pairs. Returns median CTR per integer position bucket (1..20). This grounds
    forecasts in the site's actual behaviour instead of generic benchmarks. */
export function siteCtrCurve(pairs: any[]): Record<number, { ctr: number; samples: number; impressions: number }> {
  // Impression-WEIGHTED CTR per position bucket: sum(clicks)/sum(impressions).
  // A naive median is broken here — the long tail of 1-2 impression, 0-click
  // pairs drags the median to 0% even at position 1, which is nonsense and
  // poisons every forecast. Weighting by impressions gives the true CTR the
  // site actually earns at each position.
  const buckets: Record<number, { clicks: number; impressions: number; samples: number }> = {};
  for (const p of pairs) {
    const pos = Math.round(p.position || 0);
    if (pos < 1 || pos > 30) continue;
    const impr = +(p.impressions || 0);
    const clicks = +(p.clicks || 0);
    if (impr <= 0) continue;                       // can't contribute CTR with zero impressions
    const b = (buckets[pos] = buckets[pos] || { clicks: 0, impressions: 0, samples: 0 });
    b.clicks += clicks; b.impressions += impr; b.samples += 1;
  }
  const curve: Record<number, { ctr: number; samples: number; impressions: number }> = {};
  for (const k of Object.keys(buckets)) {
    const b = buckets[+k];
    const ctr = b.impressions > 0 ? (b.clicks / b.impressions) * 100 : 0;
    curve[+k] = { ctr: Math.round(ctr * 100) / 100, samples: b.samples, impressions: b.impressions };
  }
  return curve;
}

/* ─── resolve a campaign's target pages (project-agnostic) ─────── */
export async function resolveTargetUrls(campaignId: string | undefined, projectId: string): Promise<{ urls: string[]; source: string }> {
  // 1. the run's own campaign
  if (campaignId) {
    try {
      const r = await withTimeout(db().from("seo_campaigns").select("target_urls").eq("id", campaignId).maybeSingle(), "campaign");
      const urls = ((r as any)?.data as any)?.target_urls;
      if (Array.isArray(urls) && urls.length) return { urls: urls.filter(Boolean), source: "campaign target_urls" };
    } catch { /* fall through */ }
  }
  // 2. any active campaign for the project
  try {
    const r = await withTimeout(
      db().from("seo_campaigns").select("target_urls").eq("project_id", projectId).eq("status", "active").not("target_urls", "is", null), "campaigns");
    const seen = new Set<string>();
    for (const c of ((r as any)?.data || []) as any[]) if (Array.isArray(c.target_urls)) c.target_urls.forEach((u: string) => u && seen.add(u));
    if (seen.size) return { urls: [...seen], source: "active campaign target_urls" };
  } catch { /* fall through */ }
  // 3. GSC top pages
  const { topPages } = await loadGsc(projectId);
  const gscUrls = topPages.slice(0, 30).map((p: any) => p.page || p.url).filter(Boolean);
  if (gscUrls.length) return { urls: gscUrls, source: "GSC top pages" };
  // 4. the project's own site URL (homepage) — lets a prospect project with no
  //    campaign and no GSC still be analysed against the real site the operator
  //    provided, instead of failing with "no target pages".
  try {
    const r = await withTimeout(db().from("projects").select("url").eq("id", projectId).maybeSingle(), "project_url");
    const u = ((r as any)?.data as any)?.url;
    if (u && typeof u === "string" && u.trim()) {
      const full = /^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim().replace(/^\/+/, "")}`;
      return { urls: [full], source: "project homepage URL" };
    }
  } catch { /* fall through */ }
  return { urls: [], source: "no target pages found (no campaign, GSC, or project URL)" };
}

/* ─── CrUX field data (small, project-agnostic wrapper) ──────── */
export async function fetchCrux(target: string, ms = 12000): Promise<{ target: string; level: "url" | "origin"; lcp_ms: number | null; cls: number | null; inp_ms: number | null } | null> {
  const key = process.env.PAGESPEED_API_KEY || "";
  if (!key) return null;
  // If caller passes a full URL, query URL-level. If they pass an origin
  // (e.g. "https://www.example.com"), query origin-level. CrUX uses different
  // body fields ("url" vs "origin") and origin-level returns aggregate field
  // data for the whole domain when URL-level has insufficient traffic.
  const isOrigin = /^https?:\/\/[^/]+\/?$/.test(target.trim());
  const body = isOrigin
    ? { origin: target.replace(/\/$/, ""), formFactor: "PHONE" }
    : { url: target, formFactor: "PHONE" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify(body),
    }).then(x => x.json());
    const m = (r as any)?.record?.metrics; if (!m) return null;
    return {
      target,
      level: isOrigin ? "origin" : "url",
      lcp_ms: m.largest_contentful_paint?.percentiles?.p75 ?? null,
      cls: m.cumulative_layout_shift?.percentiles?.p75 ?? null,
      inp_ms: m.interaction_to_next_paint?.percentiles?.p75 ?? null,
    };
  } catch { return null; } finally { clearTimeout(timer); }
}

/* re-export the shared external loaders for convenience */
export { ga4PullPageMetrics, fetchSerpFeatures };
