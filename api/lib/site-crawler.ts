/* ════════════════════════════════════════════════════════════════
   api/lib/site-crawler.ts

   BUILD 12.32 — Full-site crawler & on-page/technical audit.

   The honest "you had the tools, so do I" engine. Instead of a 5-page
   sample, it crawls the site breadth-first (following internal links,
   with concurrency) and aggregates the same site-wide on-page and
   technical findings a Semrush on-page audit produces — missing /
   duplicate / long / short titles and meta descriptions, missing or
   duplicate H1s, duplicate H1-and-title, missing image alt text, thin
   pages, missing canonicals, schema coverage by type, and broken links
   found during the crawl — all from real fetched HTML. Plus a best-
   effort PageSpeed pass on the homepage for performance (LCP/TBT/CLS).

   Honest constraints:
   - One serverless invocation cannot crawl thousands of pages, so the
     crawl is capped (default 50, configurable). Counts are over the
     crawled set; the report states the cap. Full-site-at-scale needs
     background crawling — a noted larger build, not faked here.
   - It does NOT produce domain authority, backlinks, or keyword-volume
     data — those need an external source (Ahrefs/Semrush API or export),
     and this engine never invents them.

   Multi-tenant: projectId (+ optional siteUrl) only.
════════════════════════════════════════════════════════════════ */

import { fetchHtml, fetchViaReader } from "./workspace/shared.js";
import { resolveTargetUrls } from "./workspace/shared.js";
import { db } from "./db.js";

const withScheme = (u: string) => { const s = String(u || "").trim().replace(/^\/+/, ""); return s && !/^https?:\/\//i.test(s) ? "https://" + s : s; };
const originOf = (u: string) => { try { const x = new URL(withScheme(u)); return `${x.protocol}//${x.host}`; } catch { return ""; } };
const domainOf = (u: string) => { try { return new URL(withScheme(u)).hostname.replace(/^www\./, ""); } catch { return ""; } };
const attr = (h: string, re: RegExp) => { const m = h.match(re); return m ? (m[1] || "").trim() : null; };
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/* Order-independent attribute extraction. HTML attributes have no required
   order, so a pattern like name="description"[...]content="..." silently fails
   whenever a generator (Webflow, for one) emits content="..."[...]name="...".
   These isolate the tag first, then read each attribute regardless of order,
   which is what prevents false "missing meta" / "missing canonical" findings. */
const metaByName = (html: string, wanted: string): string => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const n = (tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (n && n.toLowerCase() === wanted) {
      const c = (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || [])[1];
      if (c && c.trim()) return c.trim();
    }
  }
  return "";
};
const canonicalHref = (html: string): string | null => {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (/\brel\s*=\s*["']canonical["']/i.test(tag)) {
      const h = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (h) return h.trim();
    }
  }
  return null;
};

/* Canonical dedup key: the same logical page under http/https, with or without
   www, and with or without a trailing slash collapses to ONE key, so a
   redirecting host variant (non-www -> www) is never crawled twice — which
   protects the page-cap budget and stops a page being flagged as a duplicate
   of itself. */
const canonKey = (u: string): string => {
  try {
    const x = new URL(withScheme(u));
    const host = x.hostname.replace(/^www\./i, "").toLowerCase();
    const path = x.pathname.replace(/\/+$/, "") || "/";
    /* Drop the query string and fragment for dedup: query-param variants of a
       path (?utm=, ?ref=, ?srsltid=, sort/filter/pagination params) are the same
       page for an SEO audit — keeping them treated the homepage as 17 pages. The
       canonical page is the path; duplicate-via-query-params is itself a finding,
       not 17 pages to crawl. */
    return `${host}${path}`;
  } catch { return String(u || "").replace(/[?#].*$/, "").replace(/\/$/, ""); }
};
const ASSET_RE = /\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|mjs|pdf|zip|woff2?|ttf|eot|mp4|mp3|xml|json|rss|webmanifest)(\?|$)/i;
const SKIP_PATH_RE = /\/(cart|checkout|account|login|logout|wp-admin|wp-json|cdn-cgi)(\/|$)/i;
const SITEMAP_LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
const parseSitemapLocs = (xml: string): string[] => Array.from(xml.matchAll(SITEMAP_LOC_RE)).map(m => m[1].trim().replace(/&amp;/gi, "&")).filter(Boolean);
const isSitemapIndex = (xml: string): boolean => /<sitemapindex[\s>]/i.test(xml);

interface PageSig {
  url: string; ok: boolean; status: number;
  title: string; meta: string; h1_count: number; h1: string;
  canonical: string | null; noindex: boolean;
  schema_types: string[]; word_count: number;
  images_total: number; images_no_alt: number;
  links: string[];
}

function extract(url: string, html: string, status: number): PageSig {
  const ok = !!html && html.length > 50;
  const origin = originOf(url);
  const title = attr(html || "", /<title[^>]*>([\s\S]*?)<\/title>/i) || "";
  const h1s = Array.from((html || "").matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)).map(m => m[1].replace(/<[^>]+>/g, "").trim());
  const imgs = Array.from((html || "").matchAll(/<img\b[^>]*>/gi)).map(m => m[0]);
  const schema_types: string[] = [];
  for (const m of (html || "").matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]); const arr = Array.isArray(j) ? j : [j]; for (const o of arr) { const t = o && o["@type"]; if (t) (Array.isArray(t) ? t : [t]).forEach((x: any) => schema_types.push(String(x))); } } catch { /* ignore */ }
  }
  const links = Array.from((html || "").matchAll(/<a[^>]+href=["']([^"']+)["']/gi)).map(m => m[1])
    .map(h => { try { return new URL(h, origin).toString().split("#")[0]; } catch { return ""; } })
    .filter(h => h && domainOf(h) === domainOf(url) && !ASSET_RE.test(h) && !SKIP_PATH_RE.test(h));
  const text = (html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  return {
    url, ok, status,
    title, meta: metaByName(html || "", "description"),
    h1_count: h1s.length, h1: h1s[0] || "",
    canonical: canonicalHref(html || ""),
    noindex: /noindex/i.test(metaByName(html || "", "robots")),
    schema_types: Array.from(new Set(schema_types)),
    word_count: (text.match(/\b\w+\b/g) || []).length,
    images_total: imgs.length,
    images_no_alt: imgs.filter(i => !/\balt\s*=/.test(i) || /\balt\s*=\s*["']\s*["']/.test(i)).length,
    links: Array.from(new Set(links)),
  };
}

async function loadPsiKey(projectId: string): Promise<string> {
  try { const { data } = await db().from("project_integrations").select("api_key, status").eq("project_id", projectId).eq("provider", "pagespeed").maybeSingle(); const d = data as any; if (d?.status === "connected" && d?.api_key) return d.api_key; } catch { /* ignore */ }
  return (process.env.PAGESPEED_API_KEY || "").trim();
}
async function runPsiOnce(url: string, key: string): Promise<{ score: number; lcp_ms: number | null; tbt_ms: number | null; cls: number | null } | null> {
  try {
    const u = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    u.searchParams.set("url", url); u.searchParams.set("strategy", "mobile"); u.searchParams.set("category", "performance");
    if (key) u.searchParams.set("key", key);
    const r = await fetch(u.toString());
    if (!r.ok) return null;
    const j: any = await r.json();
    const lr = j.lighthouseResult; const a = lr?.audits || {};
    if (!lr?.categories?.performance) return null;
    return {
      score: Math.round((lr.categories.performance.score || 0) * 100),
      lcp_ms: a["largest-contentful-paint"]?.numericValue ?? null,
      tbt_ms: a["total-blocking-time"]?.numericValue ?? null,
      cls: a["cumulative-layout-shift"]?.numericValue ?? null,
    };
  } catch { return null; }
}
function median(nums: number[]): number | null {
  const v = nums.filter(n => typeof n === "number" && isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
/* A single Lighthouse lab run swings run-to-run (48, 31, 50). Run it several
   times IN PARALLEL and take the median — a stable, defensible number, at
   roughly the wall-clock cost of one run. */
async function runPsi(url: string, key: string, runs = 3): Promise<any | null> {
  const results = (await Promise.all(Array.from({ length: runs }, () => runPsiOnce(url, key)))).filter(Boolean) as Array<{ score: number; lcp_ms: number | null; tbt_ms: number | null; cls: number | null }>;
  if (!results.length) return null;
  const scoreMed = median(results.map(r => r.score));
  const lcpMed = median(results.map(r => r.lcp_ms).filter((x): x is number => x != null));
  const tbtMed = median(results.map(r => r.tbt_ms).filter((x): x is number => x != null));
  const clsMed = median(results.map(r => r.cls).filter((x): x is number => x != null));
  return {
    performance_score: scoreMed != null ? Math.round(scoreMed) : 0,
    lcp: lcpMed != null ? (lcpMed / 1000).toFixed(1) + " s" : null,
    tbt: tbtMed != null ? Math.round(tbtMed) + " ms" : null,
    cls: clsMed != null ? clsMed.toFixed(3) : null,
    runs: results.length,
    scores: results.map(r => r.score),
  };
}

export interface SiteAuditReport {
  project_domain: string; generated_at: string;
  pages_crawled: number; pages_reachable: number; crawl_capped: boolean;
  sitemap_url_count: number; discovery: string;
  issues: Record<string, { count: number; pages: string[] }>;
  schema_coverage: Record<string, number>;
  broken_links: string[];
  performance: any | null;
  page_selection?: any;
  homepage_title?: string;
  homepage_h1?: string;
  summary: string; limits: string[];
}

/* CMS-agnostic sitemap discovery. Finds the sitemap the way Google does:
   robots.txt first (the authoritative, platform-independent declaration),
   then the conventional locations used by Wix, WordPress core, Yoast/RankMath,
   Shopify, Squarespace and most platforms. Expands a sitemap INDEX into its
   child sitemaps (any depth, bounded) and returns every page URL on this
   domain. The sitemap is self-canonicalising — its <loc> entries carry the
   site's preferred host (www / non-www), so we end up crawling exactly what
   the site itself declares. Returns an empty list cleanly when no sitemap
   exists (the caller then falls back to link discovery). */
async function discoverSitemapUrls(root: string, projectDomain: string, cap: number): Promise<{ urls: string[]; files: number }> {
  const origin = root.replace(/\/+$/, "");
  const tried = new Set<string>();
  const toFetch: string[] = [];
  const enqueue = (u: string) => { const k = u.replace(/\/+$/, ""); if (k && !tried.has(k)) { tried.add(k); toFetch.push(u); } };

  /* 1) robots.txt — every CMS that auto-generates sitemaps declares them here. */
  try {
    let robots = await fetchHtml(origin + "/robots.txt");
    if (!robots) { const r = await fetchViaReader(origin + "/robots.txt").catch(() => ({ ok: false, html: "" })); if (r.ok && r.html) robots = r.html; }
    if (robots) for (const m of robots.matchAll(/^[ \t]*sitemap:[ \t]*(\S+)/gim)) { try { enqueue(new URL(m[1].trim(), origin).toString()); } catch { /* skip */ } }
  } catch { /* ignore */ }
  /* 2) conventional locations across platforms. */
  for (const p of ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/wp-sitemap.xml", "/sitemap/sitemap.xml"]) enqueue(origin + p);

  const pages = new Set<string>();
  let filesParsed = 0;
  const MAX_FILES = 30;                              // bound fan-out across index + children
  const HARD_URL_CAP = Math.max(cap * 5, 600);       // collect generously; the caller crawls up to its own cap

  while (toFetch.length && filesParsed < MAX_FILES && pages.size < HARD_URL_CAP) {
    const sm = toFetch.shift()!;
    let xml = "";
    try { xml = await fetchHtml(sm); } catch { xml = ""; }
    /* Rescue: a blocked/rate-limited raw fetch of the sitemap returns empty and
       would silently drop the whole site to just its homepage. Retry through the
       reader, which bypasses WAF/rate-limiting — the <loc> tags survive. */
    if (!xml || !/<loc>/i.test(xml)) {
      const r = await fetchViaReader(sm).catch(() => ({ ok: false, html: "" }));
      if (r.ok && r.html && /<loc>/i.test(r.html)) xml = r.html;
    }
    if (!xml || !/<loc>/i.test(xml)) continue;       // genuinely missing/not a sitemap -> skip cleanly
    filesParsed++;
    const locs = parseSitemapLocs(xml);
    if (isSitemapIndex(xml)) {
      for (const child of locs) { try { const c = new URL(child, origin).toString(); if (domainOf(c) === projectDomain && toFetch.length < 200) enqueue(c); } catch { /* skip */ } }
    } else {
      for (const u of locs) {
        let clean = ""; try { clean = new URL(u, origin).toString().split("#")[0]; } catch { continue; }
        if (domainOf(clean) === projectDomain && !ASSET_RE.test(clean) && !SKIP_PATH_RE.test(clean)) pages.add(clean);
      }
    }
  }
  return { urls: Array.from(pages), files: filesParsed };
}

/* ── Senior-lens page selection ──────────────────────────────────────
   Score each candidate URL by how much it matters to the business, so the
   crawl budget is spent on the pages a senior SEO would diagnose first — the
   homepage and money pages — not whatever the sitemap happens to list first.
   Also detects leftover theme/demo boilerplate, which is a real insight (it
   causes the duplicate-title/meta clusters and should be removed). */
type PageClass = "homepage" | "commercial" | "content" | "other" | "utility" | "legal" | "boilerplate_demo";
function classifyUrl(url: string): { cls: PageClass; score: number; reason: string } {
  let path = "/";
  try { path = (new URL(url).pathname || "/").toLowerCase().replace(/\/+$/, "") || "/"; } catch { /* keep default */ }
  if (path === "/") return { cls: "homepage", score: 100, reason: "the homepage — the first impression and highest-traffic page" };
  const seg = path.slice(1);
  /* leftover theme/demo/boilerplate pages a template shipped with — expanded to
     catch the common artefacts (blog-classic, grid-no-gap, service-det-ads,
     service-logo, services-2, client-01, element, column, etc.) */
  if (/(^|\/)(home-?page-?\d+|homepage-?\d+|elementor(-\d+)?|demo(-\d+)?|sample-?page|blog-?(grid|classic|standard|list|masonry|large|small)(-col)?(-\d+)?|masonry(-col)?(-\d+)?|grid(-no-gap|-\d+)?|portfolio-?grid|shortcodes?|typography|elements?(-demo)?|element|columns?|coming-?soon|service-det[a-z-]*|service-logo|services?-\d+)($|\/)/.test(seg)
    || /(^|\/)client\/client-?\d+/.test(seg)
    || (/-\d+$/.test(seg) && /(contact|about|home|service|blog|team|page)/.test(seg)))
    return { cls: "boilerplate_demo", score: 4, reason: "looks like a leftover theme/demo page — a strong candidate for removal" };
  if (/(^|\/)(privacy|terms|disclaimer|cookies?|gdpr|legal|404|thank-?you|cart|checkout|my-?account|login|log-?in|register|wp-|feed|sitemap)($|\/|-)/.test(seg))
    return { cls: "legal", score: 9, reason: "a legal or utility page — low commercial priority" };
  if (/(^|\/)(page\/\d+|tag|tags|category|categories|author|archive)($|\/)/.test(seg))
    return { cls: "utility", score: 7, reason: "an archive or pagination page" };
  if (/(^|\/)(team-?members?|our-?team|people|staff|leadership)($|\/)/.test(seg))
    return { cls: "content", score: 42, reason: "a team / bio page — supports expertise and trust signals (E-E-A-T)" };
  if (/(^|\/)(portfolio|case-?stud(y|ies)|projects?)($|\/)/.test(seg))
    return { cls: "commercial", score: 55, reason: "a portfolio / case-study page — proof of work that supports conversions" };
  if (/(^|\/)(services?|products?|solutions?|offerings?|pricing|plans?|about(-us)?|company|contact(-us)?|investments?|clients?|industries|sectors|acquisitions?|strategy|wealth)($|\/|-)/.test(seg))
    return { cls: "commercial", score: 80, reason: "a primary commercial / high-intent page — where enquiries are won" };
  if (/(^|\/)(blog|news|insights?|articles?|resources?|guides?|learn|press)($|\/)/.test(seg))
    return { cls: "content", score: 45, reason: "a content / thought-leadership page — authority and AEO surface" };
  return { cls: "other", score: 28, reason: "a standard content page" };
}

/* Detect JavaScript-rendered platforms (Squarespace, Wix, SPAs). On these the
   server HTML is missing the meta descriptions, final titles and H1s that the
   platform injects with JavaScript — so a raw-HTML crawl WILDLY over-reports
   "missing meta description / long title / missing H1". The fix is to render the
   page (via the reader) before reading its metadata. */
function detectJsRendering(html: string): { js: boolean; platform: string } {
  const h = html.toLowerCase();
  if (/squarespace|static1\.squarespace|squarespace[_-]context/.test(h)) return { js: true, platform: "Squarespace" };
  if (/wixstatic|_wixcssstates|wix\.com\/website|x-wix-/.test(h)) return { js: true, platform: "Wix" };
  const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const scriptCount = (html.match(/<script/gi) || []).length;
  if (bodyText.length < 600 && scriptCount >= 3 && /<div[^>]+id=["'](root|app|__next|__nuxt|gatsby-focus-wrapper)["']/i.test(html)) return { js: true, platform: "JavaScript app" };
  return { js: false, platform: "" };
}

type Scored = { u: string; cls: PageClass; score: number; reason: string };
export interface ResolveResult {
  root: string; projectDomain: string; start: string;
  selected: Scored[]; candidatesCount: number; allBoilerplate: Scored[];
  useReader: boolean; renderNote: string;
  sitemapCount: number; sitemapFiles: number;
  homeHtml: string; homeTitle: string; homeH1: string;
}

/* Resolve the site's real URL set (sitemap + homepage links), detect JS
   rendering, and score+select the highest-value pages up to `maxPages`. Shared
   by the single-pass crawl and the batched crawl so selection is identical. */
export async function resolveTargets(opts: { projectId: string; siteUrl?: string; maxPages?: number }): Promise<ResolveResult | null> {
  const maxPages = Math.max(5, Math.min(opts.maxPages ?? 80, 1000));
  let root = opts.siteUrl ? originOf(opts.siteUrl) : "";
  if (!root) { const tu = await resolveTargetUrls(undefined, opts.projectId).catch(() => ({ urls: [] as string[], source: "" })); root = originOf((tu.urls || [])[0] || ""); }
  if (!root) return null;
  const projectDomain = domainOf(root || opts.siteUrl || "");
  const start = root.endsWith("/") ? root : root + "/";
  const sm = await discoverSitemapUrls(root, projectDomain, maxPages).catch(() => ({ urls: [] as string[], files: 0 }));
  let homeHtml = await fetchHtml(start).catch(() => "");
  const jsr = homeHtml ? detectJsRendering(homeHtml) : { js: false, platform: "" };
  let useReader = false; let renderNote = "";
  if (jsr.js) {
    const rendered = await fetchViaReader(start).catch(() => ({ ok: false, html: "" }));
    if (rendered.ok && rendered.html) { useReader = true; homeHtml = rendered.html; renderNote = `This site is ${jsr.platform}, which builds its pages with JavaScript. Pages are fetched through a rendering proxy so the on-page metadata reflects what users and Google actually see — a raw server-HTML crawl would falsely report missing meta descriptions, over-long titles and missing H1s that the platform injects via JavaScript.`; }
    else { renderNote = `This site is ${jsr.platform} (JavaScript-rendered) and the rendering proxy was unavailable, so meta-description, title-length and H1 counts are read from server HTML and are LIKELY OVER-REPORTED — the platform injects those fields via JavaScript a raw crawl cannot see. Verify those counts against the rendered page; schema, performance and search-visibility findings are unaffected.`; }
  }
  const homeSig = homeHtml ? extract(start, homeHtml, 200) : null;
  const candidates = new Map<string, string>();
  const addCand = (u: string) => { const k = canonKey(u); if (k && !candidates.has(k)) candidates.set(k, u); };
  addCand(start);
  for (const u of sm.urls) addCand(u);
  if (homeSig) for (const link of homeSig.links) addCand(link);
  const scored: Scored[] = Array.from(candidates.values()).map(u => ({ u, ...classifyUrl(u) }));
  scored.sort((a, b) => b.score - a.score);
  const allBoilerplate = scored.filter(s => s.cls === "boilerplate_demo");
  const selected: Scored[] = [];
  let legalCount = 0, boilerCount = 0;
  for (const s of scored) {
    if (selected.length >= maxPages) break;
    if (s.cls === "legal") { if (legalCount >= 3) continue; legalCount++; }
    if (s.cls === "boilerplate_demo") { if (boilerCount >= 4) continue; boilerCount++; }
    selected.push(s);
  }
  return { root, projectDomain, start, selected, candidatesCount: candidates.size, allBoilerplate, useReader, renderNote, sitemapCount: sm.urls.length, sitemapFiles: sm.files, homeHtml, homeTitle: homeSig?.title || "", homeH1: homeSig?.h1 || "" };
}

/* Crawl a specific set of pages (a batch or the full selection). Renders via the
   reader when useReader. Returns raw page signatures — aggregation happens once,
   over the accumulated set, so cross-page duplicate detection stays correct. */
export async function crawlUrls(items: Scored[], useReader: boolean, concurrency: number, start: string, homeHtml: string, captureSchema = false): Promise<{ pages: PageSig[]; broken: string[]; schema: any[] }> {
  const pages: PageSig[] = []; const broken: string[] = []; const schema: any[] = []; const visited = new Set<string>();
  let buildForPage: ((u: string, h: string, isHome: boolean) => any) | null = null;
  if (captureSchema) { try { ({ buildForPage } = await import("./schema-llms-engine.js")); } catch { buildForPage = null; } }
  const fetchPage = async (u: string): Promise<{ html: string; ok: boolean }> => {
    if (useReader) { const r = await fetchViaReader(u).catch(() => ({ ok: false, html: "" })); if (r.ok && r.html) return { html: r.html, ok: r.html.length > 50 }; }
    try { const html = await fetchHtml(u); if (html && html.length > 50) return { html, ok: true }; } catch { /* fall through to rescue */ }
    /* Rescue: a failed raw fetch is often rate-limiting or a WAF block on a fast
       crawl (common on WooCommerce/Cloudflare stores), NOT a real 404. Retry once
       through the rendering proxy, which uses a different path and usually gets
       through, before ever calling the page unreachable — so live pages are not
       falsely reported as broken. */
    const rescue = await fetchViaReader(u).catch(() => ({ ok: false, html: "" }));
    if (rescue.ok && rescue.html && rescue.html.length > 50) return { html: rescue.html, ok: true };
    return { html: "", ok: false };
  };
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const fetched = await Promise.all(batch.map(async s => {
      if (canonKey(s.u) === canonKey(start) && homeHtml) return { u: s.u, html: homeHtml, ok: homeHtml.length > 50 };
      const r = await fetchPage(s.u); return { u: s.u, html: r.html, ok: r.ok };
    }));
    for (const f of fetched) {
      const key = canonKey(f.u); if (visited.has(key)) continue; visited.add(key);
      const sig = extract(f.u, f.html, f.ok ? 200 : 0);
      pages.push(sig);
      if (!f.ok) broken.push(f.u);
      else if (captureSchema && buildForPage && f.html) { try { schema.push(buildForPage(f.u, f.html, canonKey(f.u) === canonKey(start))); } catch { /* schema capture is best-effort */ } }
    }
  }
  return { pages, broken, schema };
}

/* Build the full audit report from the accumulated crawled pages. Runs ONCE over
   every page (single pass or all batches), so issue and duplicate counts are
   correct across the entire crawl. */
export function buildAuditReport(r: {
  projectDomain: string; pages: PageSig[]; broken: string[];
  selected: Scored[]; candidatesCount: number; allBoilerplate: Scored[];
  sitemapCount: number; sitemapFiles: number; renderNote: string;
  performance: any | null; homeTitle: string; homeH1: string; target: number;
}): SiteAuditReport {
  const now = new Date().toISOString();
  const { pages, broken } = r;
  const ok = pages.filter(p => p.ok);
  const crawlCapped = r.candidatesCount > pages.length;
  const pathOf = (u: string) => { try { return new URL(u).pathname || u; } catch { return u; } };
  const brokenSet = new Set(broken.map(canonKey));
  const loadedSelected = r.selected.filter(s => !brokenSet.has(canonKey(s.u)));
  const byClass: Record<string, number> = {};
  for (const s of loadedSelected) byClass[s.cls] = (byClass[s.cls] || 0) + 1;
  const prioSeen = new Set<string>();
  const prioritised = loadedSelected.filter(s => s.score >= 42)
    .map(s => ({ url: s.u, why: s.reason, _p: pathOf(s.u) }))
    .filter(x => { if (prioSeen.has(x._p)) return false; prioSeen.add(x._p); return true; })
    .map(({ url, why }) => ({ url, why }))
    .slice(0, 18);
  const page_selection = {
    total_candidates: r.candidatesCount,
    analysed: ok.length,
    analysed_urls: ok.map(p => p.url),
    prioritised,
    flagged_boilerplate: Array.from(new Set(r.allBoilerplate.map(s => pathOf(s.u)))).slice(0, 12),
    by_class: byClass,
    rationale: `From ${r.candidatesCount} discoverable page(s), the ${ok.length} highest-value pages that loaded were diagnosed first: the homepage, the primary commercial pages (services, about, contact and the like) and key content — because that is where visibility and credibility are won or lost.${r.allBoilerplate.length ? ` ${r.allBoilerplate.length} page(s) look like leftover theme/demo boilerplate (for example ${r.allBoilerplate.slice(0, 2).map(s => pathOf(s.u)).join(", ")}); these are flagged for removal — they dilute the site and are the usual cause of duplicate titles and meta descriptions.` : ""} Legal and utility pages were intentionally deprioritised.`,
  };
  const issue: Record<string, { count: number; pages: string[] }> = {};
  const add = (key: string, url: string) => { (issue[key] ||= { count: 0, pages: [] }); issue[key].count++; if (issue[key].pages.length < 25) issue[key].pages.push(url); };
  const byTitle = new Map<string, string[]>(); const byMeta = new Map<string, string[]>();
  for (const p of ok) {
    if (!p.title) add("missing_title", p.url);
    else { if (p.title.length > 65) add("long_title", p.url); if (p.title.length < 25) add("short_title", p.url); const t = norm(p.title); byTitle.set(t, [...(byTitle.get(t) || []), p.url]); }
    if (!p.meta) add("missing_meta_description", p.url);
    else { const m = norm(p.meta); byMeta.set(m, [...(byMeta.get(m) || []), p.url]); }
    if (p.h1_count === 0) add("missing_h1", p.url);
    if (p.h1_count > 1) add("multiple_h1", p.url);
    if (p.h1 && p.title && norm(p.h1) === norm(p.title)) add("duplicate_h1_and_title", p.url);
    if (!p.canonical) add("missing_canonical", p.url);
    if (p.noindex) add("noindex", p.url);
    if (p.images_no_alt > 0) add("images_missing_alt", p.url);
    if (p.word_count < 200) add("thin_content", p.url);
  }
  for (const [, urls] of byTitle) if (urls.length > 1) for (const u of urls) add("duplicate_title", u);
  for (const [, urls] of byMeta) if (urls.length > 1) for (const u of urls) add("duplicate_meta_description", u);
  const schema_coverage: Record<string, number> = {};
  for (const p of ok) for (const t of p.schema_types) schema_coverage[t] = (schema_coverage[t] || 0) + 1;
  const topIssues = Object.entries(issue).sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([k, v]) => `${v.count} ${k.replace(/_/g, " ")}`).join(", ");
  const sitemapNote = r.sitemapCount > 0
    ? ` Discovery used the sitemap: ${r.sitemapCount} URL(s) across ${r.sitemapFiles} sitemap file(s)${crawlCapped ? `, more than this crawl audited` : ``}.`
    : ` No sitemap was found, so discovery was by following internal links only.`;
  const summary = ok.length === 0
    ? `Could not crawl any pages of ${r.projectDomain}. The site may block automated requests, or the URL may be wrong.`
    : `Crawled ${ok.length} page(s) of ${r.projectDomain}${crawlCapped ? ` (more pages remain)` : ` (full set covered)`}.${sitemapNote} Top issues: ${topIssues || "none of the tracked issues found"}.${r.performance ? ` Homepage performance score ${r.performance.performance_score}/100 (LCP ${r.performance.lcp}).` : ""}`;
  const limits = [
    ...(r.renderNote ? [r.renderNote] : []),
    r.sitemapCount > 0
      ? `Discovery seeded from the sitemap (${r.sitemapCount} URL(s) across ${r.sitemapFiles} file(s)) plus internal links; ${ok.length} pages were crawled${crawlCapped ? ` — the sitemap declares more, use Detailed/Full mode or continue the batched crawl for complete coverage` : ` (the full declared set was covered)`}.`
      : `No sitemap was found; discovery followed internal links from the homepage. JavaScript-rendered link grids can hide pages from a static crawler — adding or exposing a sitemap would surface them.`,
    `Broken-link detection covers internal links reached during the crawl, not an exhaustive link check.`,
    `Performance is a lab PageSpeed run on the homepage (mobile)${r.performance && r.performance.runs > 1 ? ` — median of ${r.performance.runs} runs, not a real-user field average` : ""}${r.performance ? "" : " — unavailable this run (no PageSpeed key configured or the API did not respond)"}.`,
    `This engine does NOT produce domain authority, backlinks, or keyword-volume data — those need an external source (Ahrefs/Semrush API or export) and are never estimated here.`,
  ];
  return { project_domain: r.projectDomain, generated_at: now, pages_crawled: pages.length, pages_reachable: ok.length, crawl_capped: crawlCapped, sitemap_url_count: r.sitemapCount, discovery: r.sitemapCount > 0 ? "sitemap+links" : "links", issues: issue, schema_coverage, broken_links: broken.slice(0, 25), performance: r.performance, page_selection, homepage_title: r.homeTitle, homepage_h1: r.homeH1, summary, limits };
}

/* Homepage PageSpeed for the batched-crawl report path (which assembles from a
   saved job rather than a live crawlSite call). */
export async function homepagePerformance(projectId: string, start: string): Promise<any | null> {
  if (!start) return null;
  return runPsi(start, await loadPsiKey(projectId)).catch(() => null);
}

export async function crawlSite(opts: { projectId: string; siteUrl?: string; maxPages?: number; concurrency?: number }): Promise<SiteAuditReport> {
  const now = new Date().toISOString();
  const target = Math.max(5, Math.min(opts.maxPages ?? 80, 200));
  const projectDomain = domainOf((opts.siteUrl ? originOf(opts.siteUrl) : "") || opts.siteUrl || "");
  const empty = (msg: string): SiteAuditReport => ({ project_domain: projectDomain, generated_at: now, pages_crawled: 0, pages_reachable: 0, crawl_capped: false, sitemap_url_count: 0, discovery: "none", issues: {}, schema_coverage: {}, broken_links: [], performance: null, summary: msg, limits: ["No crawlable site URL available."] });

  /* ── GLOBAL BATCH CRAWL AS THE SHARED SOURCE ──
     If a batched crawl has already run for this project, build the audit from
     those already-crawled pages instead of paying to re-crawl. Crawl once,
     reuse everywhere: every crawl-dependent stage reads the full batched set
     (e.g. 79 pages) rather than a fresh 25-page single pass. The batch stores
     pages in the exact PageSig shape buildAuditReport consumes. Fail-safe: any
     problem falls through to the fresh crawl below, so nothing breaks. */
  if (opts.projectId) {
    try {
      const { db } = await import("./db.js");
      const wantDomain = opts.siteUrl ? domainOf(originOf(opts.siteUrl) || opts.siteUrl) : "";
      const { data: jobs } = await db()
        .from("crawl_jobs")
        .select("results,broken,meta,site_url,status,updated_at")
        .eq("project_id", opts.projectId)
        .order("updated_at", { ascending: false })
        .limit(5);
      const list = Array.isArray(jobs) ? jobs : [];
      const job = list.find((j: any) =>
        Array.isArray(j.results) && j.results.length > 0 &&
        (!wantDomain || !j.site_url || domainOf(originOf(j.site_url) || j.site_url) === wantDomain)
      );
      if (job) {
        const m = job.meta || {};
        const pages = job.results as PageSig[];
        const performance = await runPsi(m.start || opts.siteUrl || "", await loadPsiKey(opts.projectId)).catch(() => null);
        const renderNote = (m.renderNote || "") + ` Built from the batched site crawl already run for this project (${pages.length} pages), so no re-crawl was needed.`;
        return buildAuditReport({
          projectDomain: m.projectDomain || projectDomain,
          pages,
          broken: Array.isArray(job.broken) ? job.broken : [],
          selected: Array.isArray(m.selected) ? m.selected : [],
          candidatesCount: m.candidatesCount || pages.length,
          allBoilerplate: Array.isArray(m.allBoilerplate) ? m.allBoilerplate : [],
          sitemapCount: m.sitemapCount || 0,
          sitemapFiles: m.sitemapFiles || 0,
          renderNote,
          performance,
          homeTitle: m.homeTitle || "",
          homeH1: m.homeH1 || "",
          target: (Array.isArray(m.selected) ? m.selected.length : pages.length) || pages.length,
        });
      }
    } catch { /* fall through to a fresh crawl */ }
  }

  const r = await resolveTargets({ projectId: opts.projectId, siteUrl: opts.siteUrl, maxPages: target });
  if (!r) return empty("Could not resolve a site URL to crawl. Supply the site URL.");
  /* Single pass: on JS-rendered sites cap this pass at 25 rendered pages (the
     batched crawl reaches the rest); static sites crawl the full selection. */
  const passLimit = r.useReader ? Math.min(25, r.selected.length) : r.selected.length;
  const toCrawl = r.selected.slice(0, passLimit);
  const concurrency = r.useReader ? 5 : Math.max(2, Math.min(opts.concurrency ?? 6, 10));
  const { pages, broken } = await crawlUrls(toCrawl, r.useReader, concurrency, r.start, r.homeHtml);
  const performance = await runPsi(r.start, await loadPsiKey(opts.projectId));
  const renderNote = r.renderNote + (r.useReader && r.selected.length > passLimit ? ` This single pass covered ${passLimit} rendered pages; use the batched crawl to reach the full ${r.selected.length}.` : "");
  return buildAuditReport({ projectDomain: r.projectDomain, pages, broken, selected: toCrawl, candidatesCount: r.candidatesCount, allBoilerplate: r.allBoilerplate, sitemapCount: r.sitemapCount, sitemapFiles: r.sitemapFiles, renderNote, performance, homeTitle: r.homeTitle, homeH1: r.homeH1, target });
}
