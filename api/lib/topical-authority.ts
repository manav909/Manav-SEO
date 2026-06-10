/* ════════════════════════════════════════════════════════════════
   api/lib/topical-authority.ts

   BUILD 12.25 — Topical authority & search-intent mapping engine.

   Closes a real gap with a real engine: clusters the site's OWN Search
   Console queries into topic clusters, classifies each query's search
   intent, scores how deeply the site already covers each cluster, and
   surfaces the clusters/intents that are under-served (impressions exist
   but coverage is weak). Every number traces to GSC data — nothing is
   invented.

   Senior-DMS lens, honestly applied:
   - Clusters are built from queries the site ACTUALLY earns impressions
     on (GSC query-page pairs). It does not hallucinate topics the site
     could target; for that you need keyword research (a separate source).
     This engine answers "where do you already have authority, and where
     are you thin on what Google already shows you for" — which is the
     highest-confidence, lowest-cost place to start.
   - Intent labels are rule-based heuristics (clearly marked), not Google
     truth. Clustering is lexical (shared significant tokens), not
     semantic embeddings — stated as a limit.
   - Coverage depth and the gap calls come from real position/clicks/
     impression data per cluster.

   Zero new crawl/API cost — consumes stored GSC data via loadGsc.
   Multi-tenant: projectId only.
════════════════════════════════════════════════════════════════ */

import { loadGsc } from "./workspace/shared.js";

export type Intent = "informational" | "commercial" | "transactional" | "navigational" | "unknown";
export type Coverage = "strong" | "partial" | "thin" | "underserved";

export interface ClusterQuery {
  query: string; clicks: number; impressions: number; ctr: number; position: number; page: string;
}

export interface TopicCluster {
  id:              string;
  label:           string;
  intent:          Intent;
  query_count:     number;
  total_impressions: number;
  total_clicks:    number;
  avg_position:    number;     // impression-weighted
  best_position:   number;
  distinct_pages:  number;     // how many of the site's pages serve this cluster
  pages:           string[];
  coverage:        Coverage;
  gap_reason:      string;
  recommendation:  string;
  top_queries:     ClusterQuery[];   // the cluster's highest-impression queries
}

export interface TopicalAuthorityReport {
  project_domain:      string;
  generated_at:        string;
  cluster_count:       number;
  intent_distribution: Record<Intent, number>;   // clusters per intent
  clusters:            TopicCluster[];
  underserved:         Array<{ cluster: string; intent: Intent; impressions: number; reason: string }>;
  summary:             string;
  limits:              string[];
}

/* ─── intent classification (rule-based, senior-DMS heuristics) ── */
const RX_TRANSACTIONAL = /\b(buy|order|purchase|price|pricing|cost|cheap|discount|deal|deals|coupon|shop|for sale|near me|delivery|shipping)\b/i;
const RX_COMMERCIAL    = /\b(best|top|review|reviews|vs|versus|compare|comparison|alternative|alternatives|brand|brands|quality|premium|recommended)\b/i;
const RX_INFORMATIONAL = /\b(how|what|why|when|where|guide|guides|tutorial|tips|ideas|examples|meaning|definition|learn|explained|benefits|vs)\b/i;

function classifyIntent(query: string, brandTokens: Set<string>): Intent {
  const q = query.toLowerCase();
  const toks = q.split(/\s+/);
  if (toks.some(t => brandTokens.has(t))) return "navigational";
  if (RX_TRANSACTIONAL.test(q)) return "transactional";
  if (RX_COMMERCIAL.test(q)) return "commercial";
  if (RX_INFORMATIONAL.test(q)) return "informational";
  return "unknown";
}

/* ─── lexical clustering by shared significant tokens ──────────── */
const STOPWORDS = new Set(["the","a","an","and","or","for","to","of","in","on","with","my","your","is","are","best","how","what","why","when","where","i","do","does","can","you","near","me"]);

function sigTokens(query: string): string[] {
  return query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface PageAgg { query: string; page: string; clicks: number; impressions: number; ctr: number; position: number; }

/* Greedy clustering: seed from highest-impression query, attach queries
   sharing a significant token with the seed; repeat on the remainder. */
function clusterQueries(rows: PageAgg[]): PageAgg[][] {
  const remaining = rows.slice().sort((a, b) => b.impressions - a.impressions);
  const clusters: PageAgg[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < remaining.length; i++) {
    if (used.has(i)) continue;
    const seedTokens = new Set(sigTokens(remaining[i].query));
    if (seedTokens.size === 0) { clusters.push([remaining[i]]); used.add(i); continue; }
    const cluster: PageAgg[] = [remaining[i]];
    used.add(i);
    for (let j = i + 1; j < remaining.length; j++) {
      if (used.has(j)) continue;
      const t = sigTokens(remaining[j].query);
      if (t.some(tok => seedTokens.has(tok))) { cluster.push(remaining[j]); used.add(j); }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function clusterLabel(cluster: PageAgg[]): string {
  /* Most frequent significant token across the cluster. */
  const freq = new Map<string, number>();
  for (const r of cluster) for (const t of sigTokens(r.query)) freq.set(t, (freq.get(t) || 0) + r.impressions);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);
  return top.join(" / ") || cluster[0]?.query || "cluster";
}

export async function mapTopicalAuthority(opts: { projectId: string }): Promise<TopicalAuthorityReport> {
  const now = new Date().toISOString();
  const gsc = await loadGsc(opts.projectId);
  const pairs: PageAgg[] = (Array.isArray(gsc.queryPagePairs) ? gsc.queryPagePairs : []).map((p: any) => ({
    query: String(p.query || "").trim(),
    page: String(p.page || "").trim(),
    clicks: Number(p.clicks || 0),
    impressions: Number(p.impressions || 0),
    ctr: Number(p.ctr || 0),
    position: Number(p.position || 0),
  })).filter(p => p.query);

  const projectDomain = domainOf(pairs[0]?.page || (gsc.topPages?.[0]?.page) || "");
  const brandTokens = new Set(projectDomain.split(".")[0]?.split(/[^a-z0-9]/i).filter(Boolean).map(s => s.toLowerCase()) || []);

  if (pairs.length === 0) {
    return {
      project_domain: projectDomain, generated_at: now, cluster_count: 0,
      intent_distribution: { informational: 0, commercial: 0, transactional: 0, navigational: 0, unknown: 0 },
      clusters: [], underserved: [],
      summary: "No GSC query data stored for this project. Connect Search Console and pull, or ingest a GSC export, then re-run.",
      limits: ["Requires GSC query-page data."],
    };
  }

  const rawClusters = clusterQueries(pairs);

  const clusters: TopicCluster[] = rawClusters.map((cq, i) => {
    const total_impressions = cq.reduce((s, r) => s + r.impressions, 0);
    const total_clicks = cq.reduce((s, r) => s + r.clicks, 0);
    const posImpr = cq.reduce((s, r) => s + r.position * r.impressions, 0);
    const avg_position = total_impressions > 0 ? round1(posImpr / total_impressions) : round1(cq.reduce((s, r) => s + r.position, 0) / cq.length);
    const best_position = round1(Math.min(...cq.map(r => r.position || 999)));
    const pages = Array.from(new Set(cq.map(r => r.page).filter(Boolean)));
    const ctr = total_impressions > 0 ? round2((total_clicks / total_impressions) * 100) : 0;

    /* intent = the most common intent among the cluster's queries (by impressions) */
    const intentScore: Record<Intent, number> = { informational: 0, commercial: 0, transactional: 0, navigational: 0, unknown: 0 };
    for (const r of cq) intentScore[classifyIntent(r.query, brandTokens)] += r.impressions;
    const intent = (Object.entries(intentScore).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown") as Intent;

    /* coverage depth from real signals */
    let coverage: Coverage;
    if (best_position <= 5 && total_clicks > 0) coverage = "strong";
    else if (best_position <= 15) coverage = "partial";
    else if (total_clicks === 0 && total_impressions > 0) coverage = "underserved";
    else coverage = "thin";

    let gap_reason = "", recommendation = "";
    if (coverage === "strong") {
      gap_reason = "Already ranking well with clicks.";
      recommendation = "Maintain. Protect this cluster; refresh content periodically.";
    } else if (coverage === "partial") {
      gap_reason = `Ranking on page 1-2 (best position ${best_position}) but not in the top results.`;
      recommendation = `Strengthen the strongest page for this cluster: depth, internal links, on-page relevance. Real upside — impressions already exist.`;
    } else if (coverage === "underserved") {
      gap_reason = `${total_impressions} impressions but zero clicks${pages.length > 1 ? ` spread across ${pages.length} pages (possible cannibalisation)` : ""}.`;
      recommendation = pages.length > 1
        ? `Consolidate into one authoritative page for this cluster, then improve title/intent match.`
        : `Build a dedicated, intent-matched page — Google shows you for these queries but the current page does not earn the click.`;
    } else {
      gap_reason = `Weak ranking (avg position ${avg_position}) with little traction.`;
      recommendation = `Lower priority. Address after the partial/underserved clusters with bigger impression bases.`;
    }

    return {
      id: `cluster_${i}`,
      label: clusterLabel(cq),
      intent,
      query_count: cq.length,
      total_impressions, total_clicks, avg_position, best_position,
      distinct_pages: pages.length, pages,
      coverage, gap_reason, recommendation,
      top_queries: cq.slice().sort((a, b) => b.impressions - a.impressions).slice(0, 8)
        .map(r => ({ query: r.query, clicks: r.clicks, impressions: r.impressions, ctr: round2(r.ctr * (r.ctr <= 1 ? 100 : 1)), position: round1(r.position), page: r.page })),
    };
  });

  /* Order by opportunity: partial + underserved with biggest impression bases first. */
  const rank: Record<Coverage, number> = { partial: 0, underserved: 1, thin: 2, strong: 3 };
  clusters.sort((a, b) => rank[a.coverage] - rank[b.coverage] || b.total_impressions - a.total_impressions);

  const intent_distribution: Record<Intent, number> = { informational: 0, commercial: 0, transactional: 0, navigational: 0, unknown: 0 };
  for (const c of clusters) intent_distribution[c.intent] += 1;

  const underserved = clusters
    .filter(c => c.coverage === "underserved" || c.coverage === "partial")
    .slice(0, 15)
    .map(c => ({ cluster: c.label, intent: c.intent, impressions: c.total_impressions, reason: c.gap_reason }));

  const strong = clusters.filter(c => c.coverage === "strong").length;
  const partial = clusters.filter(c => c.coverage === "partial").length;
  const under = clusters.filter(c => c.coverage === "underserved").length;

  const summary = `Mapped ${clusters.length} topic clusters from ${pairs.length} GSC query-page rows: ${strong} strong, ${partial} partial (ranking but not top — the clearest upside), ${under} under-served (impressions, no clicks). Intent mix: ${Object.entries(intent_distribution).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(", ")}. Start with the partial and under-served clusters that have the largest impression bases.`;

  const limits = [
    "Clusters are built only from queries the site already has GSC impressions for — this maps existing authority and thin spots, not net-new keyword opportunities (that needs keyword research from a separate source).",
    "Intent labels are rule-based heuristics, not Google's classification.",
    "Clustering is lexical (shared significant tokens), not semantic embeddings — closely related queries with no shared token may land in separate clusters.",
    "Limited to the stored GSC dataset (up to 1000 query-page pairs).",
  ];

  return { project_domain: projectDomain, generated_at: now, cluster_count: clusters.length, intent_distribution, clusters, underserved, summary, limits };
}
