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

import { fetchHtml } from "./workspace/shared.js";
import { resolveTargetUrls } from "./workspace/shared.js";
import { db } from "./db.js";

const withScheme = (u: string) => { const s = String(u || "").trim().replace(/^\/+/, ""); return s && !/^https?:\/\//i.test(s) ? "https://" + s : s; };
const originOf = (u: string) => { try { const x = new URL(withScheme(u)); return `${x.protocol}//${x.host}`; } catch { return ""; } };
const domainOf = (u: string) => { try { return new URL(withScheme(u)).hostname.replace(/^www\./, ""); } catch { return ""; } };
const attr = (h: string, re: RegExp) => { const m = h.match(re); return m ? (m[1] || "").trim() : null; };
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const ASSET_RE = /\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|mjs|pdf|zip|woff2?|ttf|eot|mp4|mp3|xml|json|rss|webmanifest)(\?|$)/i;
const SKIP_PATH_RE = /\/(cart|checkout|account|login|logout|wp-admin|wp-json|cdn-cgi)(\/|$)/i;

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
    title, meta: attr(html || "", /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || "",
    h1_count: h1s.length, h1: h1s[0] || "",
    canonical: attr(html || "", /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i),
    noindex: /noindex/i.test(attr(html || "", /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i) || ""),
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
async function runPsi(url: string, key: string): Promise<any | null> {
  try {
    const u = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    u.searchParams.set("url", url); u.searchParams.set("strategy", "mobile"); u.searchParams.set("category", "performance");
    if (key) u.searchParams.set("key", key);
    const r = await fetch(u.toString());
    if (!r.ok) return null;
    const j: any = await r.json();
    const lr = j.lighthouseResult; const a = lr?.audits || {};
    return { performance_score: Math.round((lr?.categories?.performance?.score || 0) * 100), lcp: a["largest-contentful-paint"]?.displayValue || null, tbt: a["total-blocking-time"]?.displayValue || null, cls: a["cumulative-layout-shift"]?.displayValue || null };
  } catch { return null; }
}

export interface SiteAuditReport {
  project_domain: string; generated_at: string;
  pages_crawled: number; pages_reachable: number; crawl_capped: boolean;
  issues: Record<string, { count: number; pages: string[] }>;
  schema_coverage: Record<string, number>;
  broken_links: string[];
  performance: any | null;
  summary: string; limits: string[];
}

export async function crawlSite(opts: { projectId: string; siteUrl?: string; maxPages?: number; concurrency?: number }): Promise<SiteAuditReport> {
  const now = new Date().toISOString();
  const maxPages = Math.max(5, Math.min(opts.maxPages ?? 50, 120));
  const concurrency = Math.max(2, Math.min(opts.concurrency ?? 6, 10));

  let root = opts.siteUrl ? originOf(opts.siteUrl) : "";
  if (!root) { const tu = await resolveTargetUrls(undefined, opts.projectId).catch(() => ({ urls: [] as string[], source: "" })); root = originOf((tu.urls || [])[0] || ""); }
  const projectDomain = domainOf(root || opts.siteUrl || "");
  const empty = (msg: string): SiteAuditReport => ({ project_domain: projectDomain, generated_at: now, pages_crawled: 0, pages_reachable: 0, crawl_capped: false, issues: {}, schema_coverage: {}, broken_links: [], performance: null, summary: msg, limits: ["No crawlable site URL available."] });
  if (!root) return empty("Could not resolve a site URL to crawl. Supply the site URL.");

  /* BFS crawl with concurrency. */
  const start = root.endsWith("/") ? root : root + "/";
  const visited = new Set<string>();
  const queue: string[] = [start];
  const pages: PageSig[] = [];
  const broken: string[] = [];

  while (queue.length && pages.length < maxPages) {
    const batch: string[] = [];
    while (queue.length && batch.length < concurrency && pages.length + batch.length < maxPages) {
      const u = queue.shift()!;
      const key = u.replace(/\/$/, "");
      if (visited.has(key)) continue;
      visited.add(key); batch.push(u);
    }
    if (!batch.length) break;
    const fetched = await Promise.all(batch.map(async u => { try { const html = await fetchHtml(u); return { u, html, ok: !!html && html.length > 50 }; } catch { return { u, html: "", ok: false }; } }));
    for (const f of fetched) {
      const sig = extract(f.u, f.html, f.ok ? 200 : 0);
      pages.push(sig);
      if (!f.ok) { broken.push(f.u); continue; }
      for (const link of sig.links) { const k = link.replace(/\/$/, ""); if (!visited.has(k) && queue.length < 800) queue.push(link); }
    }
  }
  const crawlCapped = queue.length > 0;
  const ok = pages.filter(p => p.ok);

  /* Aggregate site-wide issues. */
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

  /* Best-effort performance on the homepage. */
  const performance = await runPsi(start, await loadPsiKey(opts.projectId));

  const topIssues = Object.entries(issue).sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([k, v]) => `${v.count} ${k.replace(/_/g, " ")}`).join(", ");
  const summary = ok.length === 0
    ? `Could not crawl any pages of ${projectDomain}. The site may block automated requests, or the URL may be wrong.`
    : `Crawled ${ok.length} page(s) of ${projectDomain}${crawlCapped ? ` (capped at ${maxPages}; more remain)` : ` (full set within the cap)`}. Top issues: ${topIssues || "none of the tracked issues found"}.${performance ? ` Homepage performance score ${performance.performance_score}/100 (LCP ${performance.lcp}).` : ""}`;

  const limits = [
    `Crawl is capped at ${maxPages} pages per pass; counts are over the ${ok.length} pages crawled, not necessarily the entire site. Full-site crawling at scale needs background processing.`,
    `Broken-link detection covers internal links reached during the crawl, not an exhaustive link check.`,
    `Performance is a single best-effort PageSpeed run on the homepage (mobile)${performance ? "" : " — unavailable this run (no PageSpeed key configured or the API did not respond)"}.`,
    `This engine does NOT produce domain authority, backlinks, or keyword-volume data — those need an external source (Ahrefs/Semrush API or export) and are never estimated here.`,
  ];

  return { project_domain: projectDomain, generated_at: now, pages_crawled: pages.length, pages_reachable: ok.length, crawl_capped: crawlCapped, issues: issue, schema_coverage, broken_links: broken.slice(0, 25), performance, summary, limits };
}
