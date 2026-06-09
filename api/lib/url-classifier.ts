/* ════════════════════════════════════════════════════════════════
   api/lib/url-classifier.ts

   BUILD 12.23b — Site-wide URL classification engine.

   The spine of an audit deliverable: classify every URL the site has
   GSC impressions for into an action — keep / improve / merge /
   redirect / review_for_pruning — driven by the site's OWN behavioural
   data, not generic benchmarks.

   Honest by design (the senior-DMS line):
   - keep / improve / merge are confident calls — they come straight
     from observed GSC behaviour (impressions, the site's own CTR-by-
     position curve, position bands, and detected cannibalisation).
   - redirect is a flagged CANDIDATE, not an assertion — it needs human
     confirmation of which URL is the canonical target.
   - noindex and delete are NOT decided here. GSC only surfaces URLs that
     already have impressions, so it cannot see zero-impression or
     orphaned pages, and it cannot judge content quality without a crawl.
     Pages that look low-value are surfaced as "review_for_pruning" with
     an explicit note that a content crawl plus a sitemap diff is required
     before choosing noindex vs delete. The engine never asserts a delete.

   Cost: zero new crawl or API calls — it consumes the GSC data already
   pulled into project_knowledge. Multi-tenant: takes projectId only.
════════════════════════════════════════════════════════════════ */

import { loadGsc, siteCtrCurve } from "./workspace/shared.js";
import { detectCannibalization } from "./pm-analytics-intel.js";

export type UrlClassification = "keep" | "improve" | "merge" | "redirect" | "review_for_pruning";

export interface ClassifiedUrl {
  url:                string;
  page_type:          string;
  clicks:             number;
  impressions:        number;
  ctr:                number;        // percent
  avg_position:       number;
  query_count:        number;
  classification:     UrlClassification;
  recommended_action: string;
  reason:             string;
  priority:           "high" | "medium" | "low";
  confidence:         "high" | "medium" | "low";
  notes:              string;
  data_source:        "gsc_page_total" | "derived_from_pairs";
}

export interface UrlClassificationReport {
  project_domain:         string;
  generated_at:           string;
  total_urls:             number;
  by_classification:      Record<UrlClassification, number>;
  urls:                   ClassifiedUrl[];
  cannibalization_groups: Array<{ query: string; pages: Array<{ page: string; clicks: number; position: number }>; recommendation: string }>;
  limits:                 string[];
  summary:                string;
}

/* ─── helpers ─────────────────────────────────────────────────── */

const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const pathOf   = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u || "/"; } };

/* Light, clearly-heuristic page-type guess from the URL path. */
function guessPageType(url: string): string {
  const p = pathOf(url).toLowerCase().replace(/\/+$/, "");
  if (p === "" || p === "/") return "homepage";
  if (/\/(blog|news|article|post|insights?|guide|resources?)\b/.test(p)) return "content/resource";
  if (/\/(category|categories|tag|tags|archive)\b/.test(p)) return "taxonomy";
  if (/\/(about|contact|team|careers?|privacy|terms|cookie|legal|sitemap)\b/.test(p)) return "utility";
  if (/\/(product|service|services|solutions?|finance|loan|loans|funding)\b/.test(p)) return "service/commercial";
  const segs = p.split("/").filter(Boolean);
  if (segs.length <= 1) return "top-level page";
  return "deep page";
}

const pct = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/* Tercile cutoffs for impressions, computed from the site's own pages. */
function terciles(values: number[]): { low: number; high: number } {
  const a = values.filter(v => v > 0).sort((x, y) => x - y);
  if (a.length === 0) return { low: 0, high: 0 };
  const at = (frac: number) => a[Math.min(a.length - 1, Math.floor(frac * a.length))];
  return { low: at(1 / 3), high: at(2 / 3) };
}

/* ─── main ────────────────────────────────────────────────────── */

export async function classifyUrls(opts: { projectId: string }): Promise<UrlClassificationReport> {
  const now = new Date().toISOString();
  const gsc = await loadGsc(opts.projectId);

  const pairs: Array<{ query: string; page: string; clicks: number; impressions: number; ctr: number; position: number }> =
    Array.isArray(gsc.queryPagePairs) ? gsc.queryPagePairs : [];
  const topPages: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }> =
    Array.isArray(gsc.topPages) ? gsc.topPages : [];

  const projectDomain = domainOf(topPages[0]?.page || pairs[0]?.page || "");

  /* Per-URL aggregation. topPages carries the authoritative per-page
     totals (GSC page dimension); pages present only in the query-page
     pairs are derived (approximate, and flagged as such). */
  interface Agg { url: string; clicks: number; impressions: number; positionWeighted: number; queryCount: number; source: "gsc_page_total" | "derived_from_pairs"; }
  const byUrl = new Map<string, Agg>();

  for (const tp of topPages) {
    if (!tp.page) continue;
    byUrl.set(tp.page, {
      url: tp.page,
      clicks: Number(tp.clicks || 0),
      impressions: Number(tp.impressions || 0),
      positionWeighted: Number(tp.position || 0),
      queryCount: 0,
      source: "gsc_page_total",
    });
  }

  /* Tally query counts from pairs, and add pages not in topPages. */
  const pairAgg = new Map<string, { clicks: number; impressions: number; posImpr: number; impr: number; queries: number }>();
  for (const r of pairs) {
    if (!r.page) continue;
    const a = pairAgg.get(r.page) || { clicks: 0, impressions: 0, posImpr: 0, impr: 0, queries: 0 };
    a.clicks += Number(r.clicks || 0);
    a.impressions += Number(r.impressions || 0);
    a.posImpr += Number(r.position || 0) * Number(r.impressions || 0);
    a.impr += Number(r.impressions || 0);
    a.queries += 1;
    pairAgg.set(r.page, a);
  }
  for (const [url, a] of pairAgg.entries()) {
    const existing = byUrl.get(url);
    if (existing) {
      existing.queryCount = a.queries;
    } else {
      byUrl.set(url, {
        url,
        clicks: a.clicks,
        impressions: a.impressions,
        positionWeighted: a.impr > 0 ? a.posImpr / a.impr : 0,
        queryCount: a.queries,
        source: "derived_from_pairs",
      });
    }
  }

  /* Site's own CTR-by-position curve, for honest CTR-gap judgement. */
  const ctrCurve = siteCtrCurve(pairs);
  const expectedCtrAt = (pos: number): number => {
    const p = Math.max(1, Math.min(30, Math.round(pos)));
    /* Walk outward to the nearest populated bucket if exact is missing. */
    for (let d = 0; d <= 10; d++) {
      if (ctrCurve[p - d]?.impressions) return ctrCurve[p - d].ctr;
      if (ctrCurve[p + d]?.impressions) return ctrCurve[p + d].ctr;
    }
    return 0;
  };

  /* Cannibalisation groups → quick lookup of pages that have a stronger
     sibling competing for the same query. */
  const cannibalGroups = detectCannibalization(pairs.map(p => ({ query: p.query, page: p.page, clicks: Number(p.clicks || 0), position: Number(p.position || 0) })));
  const inMergeSet = new Set<string>();
  const strongerSibling = new Map<string, string>(); // weaker url -> stronger url
  for (const g of cannibalGroups) {
    const sorted = g.pages.slice().sort((a, b) => b.clicks - a.clicks);
    const top = sorted[0]?.page;
    for (const pg of g.pages) {
      inMergeSet.add(pg.page);
      if (top && pg.page !== top) strongerSibling.set(pg.page, top);
    }
  }

  const imprValues = [...byUrl.values()].map(a => a.impressions);
  const { high: imprHigh } = terciles(imprValues);

  /* ─── classify each URL ─────────────────────────────────────── */
  const urls: ClassifiedUrl[] = [];
  for (const a of byUrl.values()) {
    const ctr = a.impressions > 0 ? pct((a.clicks / a.impressions) * 100) : 0;
    const pos = round1(a.positionWeighted);
    const expected = expectedCtrAt(pos);
    const ctrGap = expected - ctr;               // positive = underperforming its position
    const recoverable = a.impressions * Math.max(0, ctrGap) / 100; // est. clicks left on the table
    const highImpr = a.impressions >= Math.max(imprHigh, 1);

    let classification: UrlClassification;
    let reason: string;
    let recommended_action: string;
    let confidence: ClassifiedUrl["confidence"];
    let notes = "";

    if (inMergeSet.has(a.url) && strongerSibling.has(a.url)) {
      classification = "redirect";
      confidence = "low";
      reason = `Competes with a stronger sibling page for shared queries and earns far fewer clicks.`;
      recommended_action = `Candidate to redirect or canonical to ${strongerSibling.get(a.url)} and consolidate internal links. Confirm the canonical target before acting.`;
      notes = `Flagged from cannibalisation data — human confirmation required.`;
    } else if (inMergeSet.has(a.url)) {
      classification = "merge";
      confidence = "medium";
      reason = `Shares ranking queries with one or more other pages on the site (cannibalisation).`;
      recommended_action = `Review the competing pages and consolidate into a single authoritative URL; redirect or canonical the rest.`;
    } else if (highImpr && ctrGap > 1 && pos <= 20) {
      classification = "improve";
      confidence = "high";
      reason = `High impressions (${a.impressions}) but CTR ${ctr}% is below the site's own ${pct(expected)}% at position ${pos} — a snippet opportunity.`;
      recommended_action = `Rewrite the SEO title and meta description to match query intent and lift CTR. No ranking change required.`;
      notes = `Estimated recoverable clicks at current ranking: ~${Math.round(recoverable)}/period.`;
    } else if (a.impressions > 0 && pos >= 8 && pos <= 20) {
      classification = "improve";
      confidence = "medium";
      reason = `Ranking in the page-1-bottom / page-2 band (avg position ${pos}) with ${a.impressions} impressions — a ranking opportunity.`;
      recommended_action = `Strengthen on-page relevance, internal links and content depth to push onto page 1.`;
    } else if (a.impressions > 0 && a.clicks === 0 && ctrGap <= 0.5) {
      classification = "review_for_pruning";
      confidence = "low";
      reason = `Has impressions but no clicks and no clear CTR or ranking lever from GSC data alone.`;
      recommended_action = `Review for noindex or deletion — but only after a content crawl and a sitemap diff confirm it is genuinely low-value and not an orphaned-but-useful page.`;
      notes = `GSC cannot decide noindex vs delete: it does not see zero-impression or orphaned pages and cannot judge content quality. Crawl + sitemap required before acting.`;
    } else {
      classification = "keep";
      confidence = a.source === "gsc_page_total" ? "high" : "medium";
      reason = `Earning clicks (${a.clicks}) at a healthy position (${pos}); no cannibalisation or snippet gap detected.`;
      recommended_action = `Keep. Monitor; revisit only if trajectory declines.`;
    }

    /* Priority from opportunity size, grounded in the site's data. */
    let priority: ClassifiedUrl["priority"] = "low";
    if (classification === "improve") priority = recoverable >= 20 || a.impressions >= imprHigh * 2 ? "high" : recoverable >= 5 ? "medium" : "low";
    else if (classification === "merge" || classification === "redirect") priority = a.impressions >= imprHigh ? "high" : "medium";
    else if (classification === "review_for_pruning") priority = "low";
    else priority = a.clicks >= 1 ? "medium" : "low";

    urls.push({
      url: a.url,
      page_type: guessPageType(a.url),
      clicks: a.clicks,
      impressions: a.impressions,
      ctr,
      avg_position: pos,
      query_count: a.queryCount,
      classification,
      recommended_action,
      reason,
      priority,
      confidence,
      notes,
      data_source: a.source,
    });
  }

  /* Sort: highest opportunity first (improve/merge high-priority on top). */
  const pri = { high: 0, medium: 1, low: 2 } as const;
  urls.sort((x, y) => pri[x.priority] - pri[y.priority] || y.impressions - x.impressions);

  const by_classification = urls.reduce((acc, u) => { acc[u.classification] = (acc[u.classification] || 0) + 1; return acc; }, {} as Record<UrlClassification, number>);

  const limits: string[] = [
    `Covers only URLs with GSC impressions in the stored dataset (top pages plus up to 1000 query-page pairs). Zero-impression and orphaned pages are not visible here — enumerating those needs a sitemap pull and crawl.`,
    `noindex and delete are never asserted from GSC data alone; low-value pages are surfaced as "review_for_pruning" pending a content crawl and sitemap diff.`,
    `Pages marked data_source "derived_from_pairs" are aggregated from query-page pairs and are approximate vs the GSC page-total figures.`,
    `CTR judgements use the site's own CTR-by-position curve, not a generic benchmark.`,
  ];

  const summary = urls.length === 0
    ? `No GSC page data is stored for this project yet. Connect Search Console and run a pull before classifying.`
    : `Classified ${urls.length} URLs from GSC behaviour: ${Object.entries(by_classification).map(([k, v]) => `${v} ${k}`).join(", ")}. ${cannibalGroups.length} cannibalisation group(s) detected. keep/improve/merge are confident; redirect is a flagged candidate; pruning needs a crawl plus sitemap before any noindex or delete.`;

  return {
    project_domain: projectDomain,
    generated_at: now,
    total_urls: urls.length,
    by_classification,
    urls,
    cannibalization_groups: cannibalGroups.map(g => ({ query: g.query, pages: g.pages, recommendation: g.recommendation })),
    limits,
    summary,
  };
}
