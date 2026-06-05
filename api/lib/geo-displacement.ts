/* ════════════════════════════════════════════════════════════════
   api/lib/geo-displacement.ts

   BUILD 12.20 — AI Overview competitor citation displacement tracking.

   Given a project's target queries, aggregate the citation lists from
   SerpAPI's ai_overview_references across all queries. Produces:
     (1) Top competitor domains ranked by citation count.
     (2) Citation slot share — what % of total citation slots each
         competitor occupies across the query set.
     (3) Displacement paths — for each competitor, how many of THEIR
         citations could the project realistically take based on
         query overlap and gap analysis.

   This is a snapshot view, not a time-series. True velocity tracking
   would require scheduled SerpAPI runs (multi-day comparison) which
   the platform does not yet have automation for. The snapshot view is
   still meaningfully useful: "across your 30 target queries, these
   are the 5 domains taking your citation slots, this is what their
   pages share, and this is where you should attack first."

   Honest about limitations:
   - Snapshot at one point in time. Citations can shift week-to-week.
   - Citation share != market share — being cited heavily in one niche
     is not the same as competitor dominance.
   - Path-to-displace is a heuristic combining query overlap, current
     ranking, and structural gap. Not deterministic.
════════════════════════════════════════════════════════════════ */

import { fetchSerpFeatures } from "./serpapi.js";

export interface CompetitorCitation {
  domain:             string;
  citation_count:     number;          // queries where this domain is cited
  cited_queries:      string[];        // the actual queries (capped at 10 for report)
  citation_share_pct: number;          // % of total citation slots across analyzed queries
  /* Displacement assessment per competitor */
  displacement: {
    project_ranks_top_10: number;      // queries where project also ranks top 10
    project_not_cited_count: number;   // queries where competitor cited but project not cited
    estimated_displaceable: number;    // heuristic — queries where displacement is plausible
    primary_path: string;              // 1-sentence path-to-displace narrative
  };
}

export interface DisplacementReport {
  project_domain:        string;
  queries_analyzed:      number;
  total_citation_slots:  number;     // sum of citation counts across all queries
  project_citation_count: number;    // queries where project itself was cited
  project_citation_share_pct: number;
  /* Ranked competitor list (top 15) */
  competitors:           CompetitorCitation[];
  /* Queries where project was cited (defenders) */
  project_cited_queries: string[];
  /* Queries with no AI Overview at all */
  queries_without_ai_overview: string[];
  /* Senior-DMS narrative */
  narrative:             string;
  /* Recommended action ordering */
  recommended_priorities: string[];
  generated_at:          string;
}

/* ─── Top-level analysis ────────────────────────────────────── */

export async function runDisplacementAnalysis(opts: {
  projectId:        string;
  projectDomain:    string;
  queries:          string[];
}): Promise<DisplacementReport> {
  const { projectId, projectDomain, queries } = opts;

  /* Run SerpAPI per query. Cap at 30 queries to bound cost — at 1 credit
     per query, 30 queries = 30 credits per analysis run. Larger query
     sets should be sampled or run in batches. */
  const queriesToRun = queries.slice(0, 30).filter(q => q && q.trim());

  /* Per-query results: { query, ai_overview, cited_domains, project_cited, project_in_top_10 } */
  type QueryResult = {
    query: string;
    ai_overview: boolean;
    cited_domains: string[];
    project_cited: boolean;
    project_in_top_10: boolean;
  };

  const perQuery: QueryResult[] = [];
  /* Sequential because SerpAPI rate-limits aggressively when fanned out;
     the platform's existing fetchSerpFeatures handles per-call caching. */
  for (const rawKw of queriesToRun) {
    const kw = rawKw.trim();
    try {
      const r: any = await fetchSerpFeatures(kw, projectId, {});
      if (!r) continue;
      const aoPresent = !!(r.ai_overview || (Array.isArray(r.ai_overview_references) && r.ai_overview_references.length > 0));
      const aoRefs: string[] = Array.isArray(r.ai_overview_references)
        ? r.ai_overview_references.map((x: any) => String(x?.domain || "")).filter(Boolean)
        : [];
      const top10Domains: string[] = Array.isArray(r.top_10_domains) ? r.top_10_domains : [];
      perQuery.push({
        query: kw,
        ai_overview: aoPresent,
        cited_domains: aoRefs,
        project_cited: aoRefs.some(d => d === projectDomain || d.endsWith("." + projectDomain) || projectDomain.endsWith("." + d)),
        project_in_top_10: top10Domains.some(d => d === projectDomain || d.endsWith("." + projectDomain) || projectDomain.endsWith("." + d)),
      });
    } catch { /* skip query on fetch failure */ }
  }

  /* Aggregate citation counts per competitor domain */
  const competitorMap = new Map<string, { count: number; queries: string[] }>();
  for (const q of perQuery) {
    for (const d of q.cited_domains) {
      if (!d || d === projectDomain) continue;
      const entry = competitorMap.get(d) || { count: 0, queries: [] };
      entry.count += 1;
      if (entry.queries.length < 20) entry.queries.push(q.query);
      competitorMap.set(d, entry);
    }
  }

  const totalCitationSlots = perQuery.reduce((s, q) => s + q.cited_domains.length, 0);
  const projectCitedQueries = perQuery.filter(q => q.project_cited).map(q => q.query);
  const projectCitationCount = projectCitedQueries.length;
  const projectCitationSharePct = totalCitationSlots > 0
    ? Number(((projectCitationCount / totalCitationSlots) * 100).toFixed(1))
    : 0;
  const queriesWithoutAo = perQuery.filter(q => !q.ai_overview).map(q => q.query);

  /* Build the competitor list with displacement assessment */
  const competitors: CompetitorCitation[] = [];
  for (const [domain, { count, queries: citedQueries }] of competitorMap.entries()) {
    /* For each competitor's cited queries, check whether the project
       ranks top-10 but isn't cited — those are the highest-leverage
       displacement candidates. */
    const projectAlsoTop10 = citedQueries.filter(q => {
      const result = perQuery.find(p => p.query === q);
      return result?.project_in_top_10;
    });
    const projectNotCitedQueries = citedQueries.filter(q => {
      const result = perQuery.find(p => p.query === q);
      return result && !result.project_cited;
    });

    /* Heuristic for "estimated displaceable":
       - High-leverage: project ranks top-10 + not cited = clear path
       - Medium-leverage: project not cited + competitor is one of many cited
       - Low-leverage: competitor is universally cited and project is not in top-10 */
    const highLeverage = projectAlsoTop10.length;
    const mediumLeverage = projectNotCitedQueries.length - projectAlsoTop10.length;
    /* Rough estimate — actual displacement rate is hard to predict.
       Use 80% of high-leverage + 25% of medium-leverage as a planning number. */
    const estimatedDisplaceable = Math.round(highLeverage * 0.8 + Math.max(0, mediumLeverage) * 0.25);

    /* 1-sentence displacement path narrative */
    let primaryPath: string;
    if (highLeverage > 0) {
      primaryPath = `${highLeverage} ${highLeverage === 1 ? "query" : "queries"} where ${domain} is cited AND your site already ranks top-10 — these are direct displacement candidates. Restructure your top-10 pages with the patterns from ${domain}'s cited pages and citation re-evaluation should follow over 8-16 weeks.`;
    } else if (count >= 3) {
      primaryPath = `Cited on ${count} queries but your site is not in any of their top-10 organic results — ${domain} has both ranking AND citation advantage. Citation displacement requires earning organic visibility first; classic SEO precedes GEO here.`;
    } else if (count === 1) {
      primaryPath = `Single citation only — likely topical adjacency rather than a strategic competitor. Lower priority unless this specific query is a high-value target.`;
    } else {
      primaryPath = `Cited on ${count} queries — assess whether this represents a real competitive overlap or topical adjacency before investing displacement effort.`;
    }

    competitors.push({
      domain,
      citation_count: count,
      cited_queries: citedQueries.slice(0, 10),
      citation_share_pct: totalCitationSlots > 0 ? Number(((count / totalCitationSlots) * 100).toFixed(1)) : 0,
      displacement: {
        project_ranks_top_10:    projectAlsoTop10.length,
        project_not_cited_count: projectNotCitedQueries.length,
        estimated_displaceable:  estimatedDisplaceable,
        primary_path:            primaryPath,
      },
    });
  }
  competitors.sort((a, b) => b.citation_count - a.citation_count);

  /* Senior-DMS narrative */
  let narrative: string;
  if (perQuery.length === 0) {
    narrative = `SerpAPI returned no usable data for any of the ${queriesToRun.length} target queries. Check SERPAPI_KEY configuration and rate-limit status, then re-run.`;
  } else if (totalCitationSlots === 0) {
    narrative = `Across ${perQuery.length} analyzed queries, none currently show AI Overview citations. The niche is still classic SEO territory — citation displacement analysis is not yet applicable. Re-run in 6-12 weeks as AI Overview rollout continues.`;
  } else if (projectCitationCount >= perQuery.filter(q => q.ai_overview).length * 0.6) {
    narrative = `Strong citation position. The project domain holds ${projectCitationSharePct}% of citation slots across analyzed queries — defender posture is appropriate. Top competitors to monitor: ${competitors.slice(0, 3).map(c => c.domain).join(", ")}.`;
  } else if (competitors.length > 0) {
    const topThree = competitors.slice(0, 3);
    const topSharePct = topThree.reduce((s, c) => s + c.citation_share_pct, 0);
    narrative = `${competitors.length} competitor domains hold citation slots across your target queries. Top 3 (${topThree.map(c => c.domain).join(", ")}) hold ${topSharePct.toFixed(0)}% of slots. ${competitors.filter(c => c.displacement.project_ranks_top_10 > 0).length} of these have queries where you already rank top-10 — those are the immediate displacement targets.`;
  } else {
    narrative = `Citation analysis ran but no competitor citations were detected across the queries — unusual result; likely SerpAPI did not return citation references for these queries despite AI Overview presence.`;
  }

  /* Recommended priority ordering */
  const recommendedPriorities: string[] = [];
  const directDisplacementCandidates = competitors
    .filter(c => c.displacement.project_ranks_top_10 > 0)
    .slice(0, 5);
  for (const c of directDisplacementCandidates) {
    recommendedPriorities.push(`Priority: displace ${c.domain} on ${c.displacement.project_ranks_top_10} queries where you already rank top-10. Estimated displaceable: ${c.displacement.estimated_displaceable}.`);
  }
  if (projectCitationCount > 0) {
    recommendedPriorities.push(`Priority: defend ${projectCitationCount} existing citations. Audit the ${projectCitationCount} pages that earned them and document the patterns — these patterns are your replicable template.`);
  }
  const topCompetitorWithoutTop10 = competitors.find(c => c.displacement.project_ranks_top_10 === 0 && c.citation_count >= 3);
  if (topCompetitorWithoutTop10) {
    recommendedPriorities.push(`Long-term: ${topCompetitorWithoutTop10.domain} is cited on ${topCompetitorWithoutTop10.citation_count} queries with no organic overlap from your site. Earning organic top-10 on these queries is the prerequisite to citation displacement.`);
  }

  return {
    project_domain: projectDomain,
    queries_analyzed: queriesToRun.length,
    total_citation_slots: totalCitationSlots,
    project_citation_count: projectCitationCount,
    project_citation_share_pct: projectCitationSharePct,
    competitors: competitors.slice(0, 15),
    project_cited_queries: projectCitedQueries,
    queries_without_ai_overview: queriesWithoutAo,
    narrative,
    recommended_priorities: recommendedPriorities,
    generated_at: new Date().toISOString(),
  };
}

/* ─── Future-AI-Overview detection ──────────────────────────────
   Compare current gsc_search_appearance against historical snapshots
   to detect queries where AI Overview attribution emerged recently.
   This is the leading indicator — pages showing in AI Overview now
   but not 30 days ago. */

export interface FutureAiOverviewSignal {
  surface_type:        string;       // e.g. "aiOverview", "aiOverviewWithCitation"
  previously_zero:     boolean;      // surface had 0 impressions in prior snapshot, now > 0
  prior_impressions:   number;
  current_impressions: number;
  delta_pct:           number | null;  // % growth from prior to current
  recommendation:      string;
}

/* Compare two snapshots of gsc_search_appearance and identify emergent
   surfaces. Returns null when there is insufficient history to compare. */
export function detectFutureAiOverview(opts: {
  currentSearchAppearance: any[] | null;
  priorSearchAppearance:   any[] | null;
}): FutureAiOverviewSignal[] | null {
  const { currentSearchAppearance, priorSearchAppearance } = opts;
  if (!Array.isArray(currentSearchAppearance) || !Array.isArray(priorSearchAppearance)) return null;
  if (currentSearchAppearance.length === 0) return null;

  const priorMap = new Map<string, { impressions: number; clicks: number }>();
  for (const row of priorSearchAppearance) {
    if (row?.appearance) {
      priorMap.set(String(row.appearance), {
        impressions: Number(row.impressions || 0),
        clicks:      Number(row.clicks || 0),
      });
    }
  }

  const signals: FutureAiOverviewSignal[] = [];
  for (const row of currentSearchAppearance) {
    if (!row?.appearance) continue;
    const appearance = String(row.appearance);
    /* We focus on AI-era surfaces. Classic surfaces (richResult etc) are
       not "future" — they have been around for years. */
    if (!/aiOverview|aiOverviewWithCitation|aiAnswer/i.test(appearance)) continue;

    const currImp = Number(row.impressions || 0);
    const prior = priorMap.get(appearance);
    const priorImp = prior?.impressions || 0;
    const previouslyZero = priorImp === 0 && currImp > 0;
    const deltaPct = priorImp > 0 ? Number((((currImp - priorImp) / priorImp) * 100).toFixed(1)) : null;

    let recommendation: string;
    if (previouslyZero) {
      recommendation = `${appearance} surface emerged this period — site now shows in this AI surface where it previously did not. This is the leading indicator: classic CTR for affected queries will typically begin shifting over the next 4-8 weeks. Audit which queries are triggering this surface (GSC searchAppearance filtered to ${appearance}) and confirm citation-ready content patterns are in place.`;
    } else if (deltaPct !== null && deltaPct >= 50) {
      recommendation = `${appearance} impressions grew ${deltaPct}% — substantial expansion in this AI surface. Identify which queries drove the growth and document the pages earning citation.`;
    } else if (deltaPct !== null && deltaPct <= -30) {
      recommendation = `${appearance} impressions dropped ${Math.abs(deltaPct)}% — surface presence is contracting. Possible competitor displacement OR Google adjusting which queries trigger AI Overview. Audit the queries that previously triggered it.`;
    } else {
      recommendation = `${appearance} surface is stable. Continue monitoring; no immediate action.`;
    }

    signals.push({
      surface_type:        appearance,
      previously_zero:     previouslyZero,
      prior_impressions:   priorImp,
      current_impressions: currImp,
      delta_pct:           deltaPct,
      recommendation,
    });
  }

  return signals;
}
