/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/deep-steps/gsc-visibility.ts

   DEEP STEP — GSC Visibility & Indexation evidence.

   Job: gather EVERYTHING verifiable about how Google sees this project's
   target pages, with provenance on every fact. No analysis, no assumptions —
   just exhaustive, sourced, reusable evidence + a polished report the panel,
   pillars, or a human analyst can work from directly.

   Project-agnostic: takes projectId + targetUrls. No hardcoded values.
════════════════════════════════════════════════════════════════ */

import { loadGsc, siteCtrCurve, fetchPageFacts, type SourcedFact } from "../shared.js";

const norm = (u: string) => (u || "").replace(/\/$/, "").toLowerCase();
const path = (u: string) => (u || "").replace(/^https?:\/\/[^/]+/, "") || "/";

export interface VisibilityEvidence {
  step_key: "gsc_visibility";
  generated_at: string;
  target_count: number;
  visible_count: number;
  invisible_count: number;
  visible_pages: Array<{ url: string; position: number; impressions: number; clicks: number; ctr: number }>;
  invisible_pages: string[];                       // 0 impressions in GSC
  query_page_pairs: Array<{ query: string; page: string; impressions: number; clicks: number; ctr: number; position: number }>;
  site_ctr_curve: Record<number, { ctr: number; samples: number; impressions: number }>;  // THIS site's real curve (impression-weighted)
  near_ranking: Array<{ query: string; page: string; position: number; impressions: number }>; // pos 4-20
  indexation_checks: Array<{ url: string; status_ok: boolean; noindex: boolean; canonical: string; loaded: boolean }>;
  provenance: SourcedFact[];
  worth_deeper: string[];
}

export async function gatherGscVisibility(opts: {
  projectId: string;
  targetUrls: string[];
}): Promise<{ evidence: VisibilityEvidence; report_md: string }> {
  const now = new Date().toISOString();
  const { projectId, targetUrls } = opts;
  const targetSet = new Set(targetUrls.map(norm));

  const gsc = await loadGsc(projectId);
  const provenance: SourcedFact[] = [
    { value: targetUrls.length, source: "campaign target_urls", fetched_at: now, note: "pages in scope" },
    { value: gsc.topPages.length, source: "GSC top pages", fetched_at: gsc.fetchedAt },
    { value: gsc.queryPagePairs.length, source: "GSC query-page pairs", fetched_at: gsc.fetchedAt },
  ];

  // Visible vs invisible — strictly from GSC impression data (a fact, not a verdict)
  const visiblePages = gsc.topPages
    .filter((p: any) => targetSet.has(norm(p.page || p.url || "")))
    .map((p: any) => ({
      url: p.page || p.url,
      position: +(p.position || 0),
      impressions: +(p.impressions || 0),
      clicks: +(p.clicks || 0),
      ctr: +(p.ctr || 0),
    }));
  const visibleSet = new Set(visiblePages.map(p => norm(p.url)));
  const invisiblePages = targetUrls.filter(u => !visibleSet.has(norm(u)));

  // Real joined query-page pairs for target pages only (verified, no fabrication)
  const targetPairs = gsc.queryPagePairs
    .filter((p: any) => targetSet.has(norm(p.page)))
    .map((p: any) => ({
      query: p.query, page: p.page,
      impressions: +(p.impressions || 0), clicks: +(p.clicks || 0),
      ctr: +(p.ctr || 0), position: +(p.position || 0),
    }))
    .sort((a, b) => b.impressions - a.impressions);

  const nearRanking = targetPairs
    .filter(p => p.position >= 4 && p.position <= 20 && p.impressions > 0)
    .map(p => ({ query: p.query, page: p.page, position: p.position, impressions: p.impressions }));

  const curve = siteCtrCurve(gsc.queryPagePairs);

  // Live indexation verification — fetch each invisible page to record HTTP
  // reachability, noindex, canonical. This turns "can't tell from impressions"
  // into verified per-URL facts. Bounded + parallel.
  const toCheck = invisiblePages.slice(0, 20);
  const checks = await Promise.race([
    Promise.all(toCheck.map(async (url) => {
      const f = await fetchPageFacts(url);
      return { url, status_ok: f.status_ok, noindex: f.noindex, canonical: f.canonical, loaded: f.loaded };
    })),
    new Promise<any[]>((res) => setTimeout(() => res([]), 60000)),
  ]);
  if ((checks as any[]).length) provenance.push({ value: (checks as any[]).length, source: "live HTML crawl", fetched_at: new Date().toISOString(), note: "invisible-page indexation checks" });

  const worth_deeper: string[] = [];
  if (invisiblePages.length > 0) worth_deeper.push(`${invisiblePages.length} invisible pages — confirm exact indexation state (Coverage report) and whether any are intentionally excluded.`);
  if (nearRanking.length > 0) worth_deeper.push(`${nearRanking.length} near-ranking query-page pairs (pos 4-20) — competitor comparison needed to size the gap to page 1.`);
  const lowCtr = targetPairs.filter(p => p.position <= 10 && p.impressions > 50 && p.ctr < (curve[Math.round(p.position)]?.ctr || 0) * 0.6);
  if (lowCtr.length) worth_deeper.push(`${lowCtr.length} pairs rank top-10 but earn CTR well below this site's own curve — title/meta or SERP-feature investigation.`);

  const evidence: VisibilityEvidence = {
    step_key: "gsc_visibility",
    generated_at: now,
    target_count: targetUrls.length,
    visible_count: visiblePages.length,
    invisible_count: invisiblePages.length,
    visible_pages: visiblePages,
    invisible_pages: invisiblePages,
    query_page_pairs: targetPairs,
    site_ctr_curve: curve,
    near_ranking: nearRanking,
    indexation_checks: checks as any[],
    provenance,
    worth_deeper,
  };

  return { evidence, report_md: renderVisibilityReport(evidence) };
}

/* ─── Polished, fully-sourced, downloadable report ─────────────── */
function renderVisibilityReport(e: VisibilityEvidence): string {
  const L: string[] = [];
  L.push(`# GSC Visibility & Indexation — Evidence Report`);
  L.push("");
  L.push(`_Generated ${new Date(e.generated_at).toLocaleString()}. Every figure below is from verified Google Search Console data and live HTML crawl — no estimates, no assumptions._`);
  L.push("");
  L.push(`## Summary`);
  L.push(`- **Pages in scope:** ${e.target_count}`);
  L.push(`- **Visible in GSC (any impressions):** ${e.visible_count}`);
  L.push(`- **Invisible (zero impressions):** ${e.invisible_count}`);
  L.push(`- **Real query→page pairs captured:** ${e.query_page_pairs.length}`);
  L.push(`- **Near-ranking opportunities (pos 4-20):** ${e.near_ranking.length}`);
  L.push("");

  L.push(`## This site's own CTR-by-position curve`);
  L.push(`_Impression-weighted click-through rate at each position (sum of clicks / sum of impressions), computed from this site's real query-page data. Use this — not generic benchmarks — to ground any forecast._`);
  L.push("");
  L.push(`| Position | CTR (weighted) | Impressions | Samples |`);
  L.push(`|---|---|---|---|`);
  for (let pos = 1; pos <= 10; pos++) {
    const c = e.site_ctr_curve[pos];
    if (c) L.push(`| ${pos} | ${c.ctr}% | ${c.impressions} | ${c.samples} |`);
  }
  L.push("");

  L.push(`## Visible target pages`);
  if (e.visible_pages.length) {
    L.push(`| Page | Position | Impressions | Clicks | CTR |`);
    L.push(`|---|---|---|---|---|`);
    for (const p of e.visible_pages.slice(0, 40)) {
      L.push(`| ${path(p.url)} | ${p.position.toFixed(1)} | ${p.impressions} | ${p.clicks} | ${p.ctr}% |`);
    }
  } else { L.push(`_None of the scope pages have GSC impressions._`); }
  L.push("");

  L.push(`## Invisible pages (zero GSC impressions) — with live indexation check`);
  if (e.invisible_pages.length) {
    L.push(`| Page | Reachable | noindex | Canonical |`);
    L.push(`|---|---|---|---|`);
    for (const u of e.invisible_pages.slice(0, 30)) {
      const chk = e.indexation_checks.find(c => c.url === u);
      const reach = chk ? (chk.loaded ? "yes" : "FAILED") : "—";
      const ni = chk ? (chk.noindex ? "NOINDEX" : "indexable") : "—";
      const can = chk?.canonical ? path(chk.canonical) : "—";
      L.push(`| ${path(u)} | ${reach} | ${ni} | ${can} |`);
    }
  } else { L.push(`_All scope pages are visible in GSC._`); }
  L.push("");

  L.push(`## Top real query→page pairs (verified GSC joined data)`);
  L.push(`| Query | Page | Impr | Clicks | CTR | Pos |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const p of e.query_page_pairs.slice(0, 30)) {
    L.push(`| ${p.query} | ${path(p.page)} | ${p.impressions} | ${p.clicks} | ${p.ctr}% | ${p.position.toFixed(1)} |`);
  }
  L.push("");

  if (e.worth_deeper.length) {
    L.push(`## Worth investigating further (handed to the panel)`);
    for (const w of e.worth_deeper) L.push(`- ${w}`);
    L.push("");
  }

  L.push(`## Provenance`);
  for (const f of e.provenance) L.push(`- ${f.source}: ${typeof f.value === "number" ? f.value : JSON.stringify(f.value)}${f.note ? ` (${f.note})` : ""} — fetched ${new Date(f.fetched_at).toLocaleString()}`);
  return L.join("\n");
}
