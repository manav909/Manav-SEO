/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/deep-steps/target-keyword-baseline.ts

   DEEP STEP — Target Keyword Baseline & Feasibility.

   Runs only when the operator has supplied target_keywords on the run.
   For each target keyword, captures verified data on:
     (1) Current GSC position/impressions on the site — does the site
         already get any visibility for this keyword?
     (2) Live SerpAPI top-10 — who actually ranks, what features show
         (AI Overview, featured snippet, shopping pack, etc.).
     (3) Adjacent intent matches — queries already in the site's GSC
         that overlap semantically (substring/token overlap), so the
         system can honestly say "you're chasing X but already getting
         impressions on Y which is similar intent — better target?".
     (4) Feasibility verdict — classifies each target into one of:
         already_ranking, near_ranking, weak_visibility, no_history,
         better_adjacent_available.

   No hardcoded keywords or domains. Multi-tenant.
════════════════════════════════════════════════════════════════ */

import { fetchSerpFeatures, loadGsc, fetchPageFacts, type SourcedFact } from "../shared.js";

const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s: string) => norm(s).split(" ").filter(t => t.length >= 3);
const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

interface TargetKeywordResult {
  keyword: string;
  /** GSC-derived current position, if the site has any impressions */
  current_gsc: {
    has_impressions: boolean;
    impressions: number;
    clicks: number;
    avg_position: number | null;
    matched_query: string | null;        // exact/close match from GSC
    pages_ranking: string[];             // pages currently picking up impressions
  };
  /** Live SerpAPI top-10 + features */
  serp: {
    top_10_domains: string[];
    features: string[];
    paa_questions: string[];
    project_in_top_10: boolean;
    project_position_in_top_10: number | null;
  } | null;
  /** GSC queries the site already gets impressions on that overlap semantically */
  adjacent_in_gsc: Array<{ query: string; impressions: number; clicks: number; avg_position: number; overlap_tokens: string[] }>;
  /** Feasibility classification + 1-sentence rationale */
  verdict: {
    category: "already_ranking" | "near_ranking" | "weak_visibility" | "no_history" | "better_adjacent_available";
    rationale: string;
    suggested_better_target: string | null;     // when better_adjacent_available
  };
}

export interface TargetKeywordBaselineEvidence {
  step_key: "target_keyword_baseline";
  generated_at: string;
  project_domain: string;
  keywords_supplied: number;
  results: TargetKeywordResult[];
  provenance: SourcedFact[];
  worth_deeper: string[];
}

export async function gatherTargetKeywordBaseline(opts: {
  projectId: string;
  targetUrls: string[];
  targetKeywords: string[];
  gscNearRanking?: any[];     // from gsc_visibility step, if already computed
}): Promise<{ evidence: TargetKeywordBaselineEvidence; report_md: string }> {
  const now = new Date().toISOString();
  const { projectId, targetUrls, targetKeywords } = opts;
  const projectDomain = domainOf(targetUrls[0] || "");
  const provenance: SourcedFact[] = [];

  // Load GSC once for adjacency + current-position lookups
  const gsc = await loadGsc(projectId);
  provenance.push({ value: `${gsc.queryPagePairs.length} GSC query/page pairs`, source: "GSC", fetched_at: gsc.fetchedAt, note: "site's existing query footprint" });

  const results: TargetKeywordResult[] = [];

  for (const rawKw of targetKeywords) {
    const kw = String(rawKw).trim();
    if (!kw) continue;
    const nKw = norm(kw);
    const tkw = new Set(tokens(kw));

    // 1) Current GSC position for this exact keyword (or very close match)
    const gscMatches = (gsc.queryPagePairs || []).filter((p: any) => {
      const nq = norm(p.query || "");
      return nq === nKw || nq.includes(nKw) || nKw.includes(nq);
    });
    const totalImpr = gscMatches.reduce((s: number, p: any) => s + (Number(p.impressions) || 0), 0);
    const totalClicks = gscMatches.reduce((s: number, p: any) => s + (Number(p.clicks) || 0), 0);
    const avgPos = totalImpr > 0
      ? gscMatches.reduce((s: number, p: any) => s + ((Number(p.position) || 0) * (Number(p.impressions) || 0)), 0) / totalImpr
      : null;
    const pagesRanking = Array.from(new Set(gscMatches.map((p: any) => String(p.page || "")).filter(Boolean)));
    const closestMatch = gscMatches.sort((a: any, b: any) => (b.impressions || 0) - (a.impressions || 0))[0];

    // 2) Live SerpAPI top-10
    let serp: TargetKeywordResult["serp"] = null;
    try {
      const r: any = await fetchSerpFeatures(kw, projectId, {}).catch(() => null);
      if (r) {
        provenance.push({ value: kw, source: "SerpAPI", fetched_at: r.fetched_at || now, note: "live SERP top-10" });
        const top10 = (r.organic_results || []).slice(0, 10).map((x: any) => ({
          domain: domainOf(x.link || ""), url: String(x.link || ""), position: Number(x.position) || 0, title: String(x.title || ""),
        }));
        const projHit = top10.find(x => x.domain === projectDomain);
        serp = {
          top_10_domains: Array.from(new Set(top10.map(x => x.domain).filter(Boolean))),
          features: Array.isArray(r.features) ? r.features : [],
          paa_questions: Array.isArray(r.paa) ? r.paa.slice(0, 5) : [],
          project_in_top_10: !!projHit,
          project_position_in_top_10: projHit ? projHit.position : null,
        };
      }
    } catch { /* leave serp null */ }

    // 3) Adjacent intent matches — GSC queries that share ≥1 meaningful token
    //    with this keyword AND have non-trivial impressions, but aren't this
    //    exact keyword. Useful for surfacing "you already get impressions on
    //    'XYZ' which is similar intent — that might be the better target".
    const adjacent: TargetKeywordResult["adjacent_in_gsc"] = [];
    for (const pair of (gsc.queryPagePairs || [])) {
      const q = String(pair.query || "");
      const nq = norm(q);
      if (!q || nq === nKw) continue;
      const tq = tokens(q);
      const overlap = tq.filter(t => tkw.has(t));
      if (overlap.length === 0) continue;
      const impr = Number(pair.impressions) || 0;
      if (impr < 10) continue;     // noise filter
      // Check existence in dedup
      const existing = adjacent.find(a => norm(a.query) === nq);
      if (existing) {
        existing.impressions += impr;
        existing.clicks += Number(pair.clicks) || 0;
      } else {
        adjacent.push({
          query: q, impressions: impr, clicks: Number(pair.clicks) || 0,
          avg_position: Number(pair.position) || 0,
          overlap_tokens: overlap,
        });
      }
    }
    adjacent.sort((a, b) => b.impressions - a.impressions);
    const topAdjacent = adjacent.slice(0, 5);

    // 4) Feasibility verdict
    let category: TargetKeywordResult["verdict"]["category"];
    let rationale: string;
    let suggestedBetterTarget: string | null = null;

    if (totalImpr > 0 && avgPos !== null && avgPos <= 10) {
      category = "already_ranking";
      rationale = `Site already gets ${Math.round(totalImpr)} impressions on this keyword (avg position ${avgPos.toFixed(1)}) — focus is climbing rather than entering the SERP.`;
    } else if (totalImpr > 0 && avgPos !== null && avgPos <= 30) {
      category = "near_ranking";
      rationale = `Site is on page 2-3 (${Math.round(totalImpr)} impressions, avg position ${avgPos.toFixed(1)}). Push to page 1 needs on-page improvements + internal link support.`;
    } else if (totalImpr > 0) {
      category = "weak_visibility";
      rationale = `Site has minimal visibility (${Math.round(totalImpr)} impressions, avg position ${avgPos !== null ? avgPos.toFixed(1) : "n/a"}). Treat as a longer-term build.`;
    } else if (topAdjacent.length > 0 && topAdjacent[0].impressions > 50) {
      category = "better_adjacent_available";
      suggestedBetterTarget = topAdjacent[0].query;
      rationale = `Site has zero impressions for "${kw}" but already gets ${topAdjacent[0].impressions} impressions on "${topAdjacent[0].query}" (avg position ${topAdjacent[0].avg_position.toFixed(1)}). The adjacent query may be a better or complementary target — verify intent match before deciding.`;
    } else {
      category = "no_history";
      rationale = `Site has no GSC history for this keyword or close adjacent queries. Ranking will require new dedicated content + time for Google to index and assess it.`;
    }

    results.push({
      keyword: kw,
      current_gsc: {
        has_impressions: totalImpr > 0,
        impressions: totalImpr,
        clicks: totalClicks,
        avg_position: avgPos,
        matched_query: closestMatch?.query || null,
        pages_ranking: pagesRanking,
      },
      serp,
      adjacent_in_gsc: topAdjacent,
      verdict: { category, rationale, suggested_better_target: suggestedBetterTarget },
    });
  }

  // Worth-deeper flags — anything where there's a meaningful question left
  const worthDeeper: string[] = [];
  for (const r of results) {
    if (r.verdict.category === "near_ranking" && r.adjacent_in_gsc.length === 0 && !r.serp) {
      worthDeeper.push(`Re-fetch SerpAPI for "${r.keyword}" — initial SERP fetch returned no data.`);
    }
    if (r.verdict.category === "better_adjacent_available") {
      worthDeeper.push(`Verify intent match between target "${r.keyword}" and adjacent "${r.verdict.suggested_better_target}" — visit both SERPs and assess whether the operator would accept the adjacent as a valid alternative.`);
    }
  }

  const report_md = renderReport({ projectDomain, results });

  return {
    evidence: {
      step_key: "target_keyword_baseline",
      generated_at: now,
      project_domain: projectDomain,
      keywords_supplied: results.length,
      results,
      provenance,
      worth_deeper: worthDeeper,
    },
    report_md,
  };
}

function renderReport(opts: { projectDomain: string; results: TargetKeywordResult[] }): string {
  const { projectDomain, results } = opts;
  const L: string[] = [];
  L.push(`# Target Keyword Baseline & Feasibility\n`);
  L.push(`**Site:** ${projectDomain || "(unknown)"}  `);
  L.push(`**Keywords evaluated:** ${results.length}\n`);

  // Headline summary table
  L.push(`## Summary\n`);
  L.push(`| Keyword | Current rank | GSC impressions | Verdict |`);
  L.push(`| --- | --- | --- | --- |`);
  for (const r of results) {
    const rank = r.current_gsc.avg_position !== null ? r.current_gsc.avg_position.toFixed(1) : "—";
    const verdictShort = ({
      already_ranking: "Already ranking — push up",
      near_ranking: "Near-ranking — close gap",
      weak_visibility: "Weak — long build",
      no_history: "No history — needs new content",
      better_adjacent_available: "Adjacent target available",
    } as any)[r.verdict.category];
    L.push(`| ${r.keyword} | ${rank} | ${r.current_gsc.impressions} | ${verdictShort} |`);
  }
  L.push("");

  // Per-keyword detail
  L.push(`## Per-keyword detail\n`);
  for (const r of results) {
    L.push(`### "${r.keyword}"\n`);
    L.push(`**Verdict:** ${r.verdict.rationale}\n`);

    // Current state in GSC
    L.push(`**Current state in GSC:**`);
    if (r.current_gsc.has_impressions) {
      L.push(`- ${r.current_gsc.impressions} impressions, ${r.current_gsc.clicks} clicks (avg position ${r.current_gsc.avg_position?.toFixed(1) ?? "n/a"})`);
      if (r.current_gsc.matched_query && r.current_gsc.matched_query !== r.keyword) {
        L.push(`- Closest matched query in GSC: "${r.current_gsc.matched_query}"`);
      }
      if (r.current_gsc.pages_ranking.length) {
        L.push(`- Pages picking up impressions:`);
        for (const p of r.current_gsc.pages_ranking.slice(0, 5)) L.push(`  - ${p}`);
      }
    } else {
      L.push(`- No GSC impressions on file for this keyword.`);
    }
    L.push("");

    // SERP composition
    if (r.serp) {
      L.push(`**SERP composition (live):**`);
      L.push(`- Top-10 domains: ${r.serp.top_10_domains.join(", ") || "(none)"}`);
      L.push(`- SERP features: ${r.serp.features.length ? r.serp.features.join(", ") : "none of note"}`);
      if (r.serp.project_in_top_10) {
        L.push(`- **${projectDomain} is in the top-10** at position ${r.serp.project_position_in_top_10}.`);
      } else {
        L.push(`- ${projectDomain} is NOT in the top-10.`);
      }
      if (r.serp.paa_questions.length) {
        L.push(`- People-Also-Ask:`);
        for (const q of r.serp.paa_questions) L.push(`  - ${q}`);
      }
    } else {
      L.push(`**SERP composition:** _Could not fetch live SERP for this keyword (SerpAPI returned no data or quota exhausted)._`);
    }
    L.push("");

    // Adjacent intent matches
    if (r.adjacent_in_gsc.length) {
      L.push(`**Adjacent queries the site already gets impressions on:**`);
      for (const a of r.adjacent_in_gsc) {
        L.push(`- "${a.query}" — ${a.impressions} impressions, avg position ${a.avg_position.toFixed(1)} (shared tokens: ${a.overlap_tokens.join(", ")})`);
      }
      L.push("");
      if (r.verdict.suggested_better_target) {
        L.push(`> **Note:** "${r.verdict.suggested_better_target}" may be a better or complementary target — see verdict above.`);
        L.push("");
      }
    } else {
      L.push(`**Adjacent queries in GSC:** _None found above the noise floor (≥10 impressions, ≥1 shared token)._`);
      L.push("");
    }
    L.push(`---\n`);
  }

  return L.join("\n");
}
