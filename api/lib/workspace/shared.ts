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
export async function fetchHtml(url: string, ms = 12000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOSeasonBot/1.0)" },
      redirect: "follow", signal: controller.signal,
    });
    return (await r.text()) || "";
  } catch { return ""; } finally { clearTimeout(timer); }
}

/** Fetch a URL and return verified on-page facts (status, indexability, title,
    h1, meta, word count, schema). Used for both target and competitor pages. */
export async function fetchPageFacts(url: string): Promise<{
  url: string; loaded: boolean; status_ok: boolean;
  title: string; title_len: number; h1: string; meta: string;
  word_count: number; noindex: boolean; canonical: string; schema: boolean;
}> {
  const html = await fetchHtml(url);
  const loaded = html.length > 300;
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() || "";
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, "").trim() || "";
  const meta = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1]?.trim() || "";
  const canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) || [])[1]?.trim() || "";
  const wordCount = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").split(/\s+/).filter(w => w.length > 2).length;
  const noindex = /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html) || /noindex/i.test(html.slice(0, 3000));
  const schema = /application\/ld\+json/i.test(html);
  return {
    url, loaded, status_ok: loaded, title, title_len: title.length, h1, meta,
    word_count: wordCount, noindex, canonical, schema,
  };
}

/* ─── GSC verified data loaders ────────────────────────────────── */
export interface GscData {
  topPages: any[];
  topQueries: any[];
  queryPagePairs: any[];   // {query, page, clicks, impressions, ctr, position}
  fetchedAt: string;
}

export async function loadGsc(projectId: string): Promise<GscData> {
  const fetchedAt = new Date().toISOString();
  try {
    const r = await withTimeout(
      db().from("project_knowledge").select("field_key,field_value,updated_at")
        .eq("project_id", projectId)
        .in("field_key", ["gsc_top_pages", "gsc_top_queries", "gsc_query_page_pairs"]),
      "gsc"
    );
    const rows = ((r as any)?.data || []) as any[];
    const parse = (k: string) => {
      const row = rows.find(x => x.field_key === k);
      try { return row ? JSON.parse(row.field_value || "[]") : []; } catch { return []; }
    };
    return {
      topPages: parse("gsc_top_pages"),
      topQueries: parse("gsc_top_queries"),
      queryPagePairs: parse("gsc_query_page_pairs"),
      fetchedAt,
    };
  } catch {
    return { topPages: [], topQueries: [], queryPagePairs: [], fetchedAt };
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
  const urls = topPages.slice(0, 30).map((p: any) => p.page || p.url).filter(Boolean);
  return { urls, source: "GSC top pages (no campaign targets found)" };
}

/* re-export the shared external loaders for convenience */
export { ga4PullPageMetrics, fetchSerpFeatures };
