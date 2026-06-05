/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/deep-steps/ai-overview-citation-gap.ts

   BUILD 12.20 — DEEP STEP — AI Overview citation gap analysis.

   For each target query, runs SerpAPI to get the AI Overview citation
   list, then fetches and analyzes the cited pages' structural patterns.
   Compares against the project's own target page (when known) and
   produces a specific gap report: "Cited pages share these patterns
   that your page is missing — here is the recommended order to close
   the gap."

   This is the most actionable GEO signal in the platform. The cited
   pages tell you exactly what content shape the AI search models
   reward for this specific query — no theorizing, just observation.

   Project-agnostic. Takes projectId + targetUrls + targetKeywords.
════════════════════════════════════════════════════════════════ */

import { fetchSerpFeatures, loadGsc, type SourcedFact } from "../shared.js";
import { runCitationGapAnalysis, type CitationGapReport } from "../../geo-citation-gap.js";

const norm = (s: string) => String(s || "").toLowerCase().trim();
const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const pathOf = (u: string) => (u || "").replace(/^https?:\/\/[^/]+/, "") || "/";

export interface CitationGapEvidence {
  step_key: "ai_overview_citation_gap";
  generated_at: string;
  project_domain: string;
  queries_analyzed: number;
  /* One gap report per query that had AI Overview citations */
  reports: CitationGapReport[];
  /* Queries where SerpAPI ran but no AI Overview was present (still useful info) */
  no_ai_overview: string[];
  /* Queries where SerpAPI fetch failed */
  fetch_failed: string[];
  /* Aggregate findings across all queries — patterns that recur across multiple queries */
  aggregate_universal_patterns: Array<{ pattern: string; frequency: number; in_queries: number }>;
  provenance: SourcedFact[];
  worth_deeper: string[];
}

/* Heuristic: pick the project page most likely to target this query.
   Uses GSC query-page pairs (Build 12.16 loadGsc) when available to
   find the page already earning impressions for the query, falls back
   to first target URL. */
function pickProjectPageForQuery(query: string, gscPairs: any[], targetUrls: string[]): string | null {
  if (!gscPairs || gscPairs.length === 0) return targetUrls[0] || null;
  const nQuery = norm(query);
  /* Find the page with most impressions for this exact query or a close match */
  const matches = gscPairs.filter((p: any) => {
    const nq = norm(p.query || "");
    return nq === nQuery || nq.includes(nQuery) || nQuery.includes(nq);
  }).sort((a: any, b: any) => (Number(b.impressions) || 0) - (Number(a.impressions) || 0));
  if (matches.length > 0 && matches[0].page) return matches[0].page;
  return targetUrls[0] || null;
}

export async function gatherAiOverviewCitationGap(opts: {
  projectId:       string;
  targetUrls:      string[];
  targetKeywords:  string[];
}): Promise<{ evidence: CitationGapEvidence; report_md: string }> {
  const now = new Date().toISOString();
  const { projectId, targetUrls, targetKeywords } = opts;
  const projectDomain = domainOf(targetUrls[0] || "");
  const provenance: SourcedFact[] = [];

  /* Load GSC query-page pairs so we can intelligently pick the project's
     own page for each query (the page already earning impressions for it). */
  const gsc = await loadGsc(projectId);
  if (gsc.queryPagePairs.length > 0) {
    provenance.push({ value: gsc.queryPagePairs.length, source: "GSC query-page pairs", fetched_at: gsc.fetchedAt, note: "used to pick the project's target page per query" });
  }

  const reports: CitationGapReport[] = [];
  const noAiOverview: string[] = [];
  const fetchFailed: string[] = [];

  /* Cap at 8 keywords per run to bound SerpAPI cost. The deep-step is
     expensive — typical run is 8 SerpAPI fetches + 8*5 page fetches
     = ~48 HTTP calls. Wall-clock 60-120s. */
  const keywordsToRun = targetKeywords.slice(0, 8).filter(k => k && k.trim());

  for (const rawKw of keywordsToRun) {
    const kw = rawKw.trim();
    /* Step 1: SerpAPI to get the AI Overview citation list for this query */
    let serp: any = null;
    try {
      serp = await fetchSerpFeatures(kw, projectId, {});
    } catch { /* swallow — handled below */ }
    if (!serp) {
      fetchFailed.push(kw);
      continue;
    }
    provenance.push({ value: kw, source: "SerpAPI", fetched_at: serp.fetched_at || now, note: "AI Overview citation list" });

    const aoRefs: Array<{ url: string; domain: string; title?: string }> = Array.isArray(serp.ai_overview_references)
      ? serp.ai_overview_references.filter((r: any) => r && typeof r.url === "string")
      : [];

    if (!serp.ai_overview || aoRefs.length === 0) {
      noAiOverview.push(kw);
      continue;
    }

    /* Step 2: pick the project page to compare against */
    const projectUrl = pickProjectPageForQuery(kw, gsc.queryPagePairs, targetUrls);

    /* Step 3: run the gap analysis (fetches all cited pages + project page in parallel) */
    const citedUrls = aoRefs.map(r => r.url).filter(u => domainOf(u) !== projectDomain);
    if (citedUrls.length === 0) {
      /* AI Overview exists but only cites this project's domain — defender scenario */
      noAiOverview.push(kw + " (cited only this site)");
      continue;
    }

    const report = await runCitationGapAnalysis({
      query:         kw,
      projectDomain,
      projectUrl,
      citedUrls,
    });
    provenance.push({ value: report.cited_pages.length, source: "live HTML crawl", fetched_at: report.generated_at, note: `cited pages fetched for "${kw}"` });
    reports.push(report);
  }

  /* Aggregate analysis — patterns that show up across multiple queries
     are stronger signal than single-query patterns. Count universal-
     pattern frequency across all reports. */
  const aggregateMap = new Map<string, { frequency: number; queries: Set<string> }>();
  for (const r of reports) {
    for (const p of r.universal_patterns) {
      const entry = aggregateMap.get(p) || { frequency: 0, queries: new Set<string>() };
      entry.frequency += 1;
      entry.queries.add(r.query);
      aggregateMap.set(p, entry);
    }
  }
  const aggregate_universal_patterns = Array.from(aggregateMap.entries())
    .map(([pattern, { frequency, queries }]) => ({ pattern, frequency, in_queries: queries.size }))
    .sort((a, b) => b.in_queries - a.in_queries || b.frequency - a.frequency);

  /* Worth-deeper signals */
  const worth_deeper: string[] = [];
  if (reports.length === 0 && keywordsToRun.length > 0) {
    if (fetchFailed.length === keywordsToRun.length) {
      worth_deeper.push(`SerpAPI fetch failed for every query — check SERPAPI_KEY configuration or rate limits.`);
    } else if (noAiOverview.length > 0) {
      worth_deeper.push(`None of the supplied target keywords currently show AI Overview. Citation gap analysis is not applicable to these queries — they are classic SEO territory.`);
    }
  }
  const dominantPatterns = aggregate_universal_patterns.filter(p => p.in_queries >= Math.ceil(reports.length / 2));
  if (dominantPatterns.length > 0) {
    worth_deeper.push(`Across ${reports.length} analyzed queries, ${dominantPatterns.length} structural patterns are universal in cited pages for the majority of queries: ${dominantPatterns.map(p => p.pattern).slice(0, 4).join(", ")}. Implementing these site-wide (not just on individual target pages) is the highest-leverage GEO move.`);
  }
  for (const r of reports.filter(rep => rep.gaps.filter(g => g.severity === "critical").length >= 3)) {
    worth_deeper.push(`Query "${r.query}" has ${r.gaps.filter(g => g.severity === "critical").length} critical structural gaps — substantial restructuring required to be competitive for citation. Consider whether the page should target this query at all, or if an adjacent query is more achievable.`);
  }

  const evidence: CitationGapEvidence = {
    step_key: "ai_overview_citation_gap",
    generated_at: now,
    project_domain: projectDomain,
    queries_analyzed: keywordsToRun.length,
    reports,
    no_ai_overview: noAiOverview,
    fetch_failed: fetchFailed,
    aggregate_universal_patterns,
    provenance,
    worth_deeper,
  };

  return { evidence, report_md: renderReport(evidence) };
}

function renderReport(e: CitationGapEvidence): string {
  const L: string[] = [];
  L.push(`# AI Overview Citation Gap Analysis`);
  L.push(``);
  L.push(`_Generated ${new Date(e.generated_at).toLocaleString()}. ${e.queries_analyzed} target queries analyzed. Live SerpAPI + live HTML crawl of cited competitor pages. The most actionable GEO signal — no theorizing, just observed patterns from pages Google is actually citing._`);
  L.push(``);

  L.push(`## Summary`);
  L.push(`- **Project domain:** ${e.project_domain || "(unknown)"}`);
  L.push(`- **Queries analyzed:** ${e.queries_analyzed}`);
  L.push(`- **Queries with AI Overview citations:** ${e.reports.length}`);
  L.push(`- **Queries without AI Overview:** ${e.no_ai_overview.length}`);
  if (e.fetch_failed.length) L.push(`- **SerpAPI fetch failed for:** ${e.fetch_failed.length} queries`);
  L.push(``);

  if (e.aggregate_universal_patterns.length > 0) {
    L.push(`## Universal patterns across cited pages`);
    L.push(`_These patterns appear in ALL cited pages for the listed queries. Strongest possible signal — implementing these on your pages is foundational._`);
    L.push(``);
    L.push(`| Pattern | Universal in N queries | Times observed |`);
    L.push(`| --- | --- | --- |`);
    for (const p of e.aggregate_universal_patterns) {
      L.push(`| ${p.pattern} | ${p.in_queries} of ${e.reports.length} | ${p.frequency} |`);
    }
    L.push(``);
  }

  L.push(`## Per-query gap reports`);
  L.push(``);
  for (const r of e.reports) {
    L.push(`### "${r.query}"`);
    L.push(``);
    L.push(`**Narrative:** ${r.narrative}`);
    L.push(``);

    if (r.cited_pages.length > 0) {
      L.push(`**Cited pages (${r.cited_pages.filter(p => p.loaded).length}/${r.cited_pages.length} successfully fetched):**`);
      L.push(``);
      L.push(`| Domain | Author byline | FAQ schema | Article schema | Summary top | Q-and-A structure | Last updated |`);
      L.push(`| --- | --- | --- | --- | --- | --- | --- |`);
      for (const p of r.cited_pages) {
        if (!p.loaded) {
          L.push(`| ${p.domain} | — fetch failed — | | | | | |`);
          continue;
        }
        L.push(`| ${p.domain} | ${p.has_author_byline ? `✓ ${p.author_name || ""}` : "—"} | ${p.has_faq_schema ? "✓" : "—"} | ${p.has_article_schema ? "✓" : "—"} | ${p.has_summary_top ? `✓ (${p.summary_word_count}w)` : "—"} | ${p.has_qa_structure ? `✓ (${p.qa_block_count})` : "—"} | ${p.has_last_updated ? "✓" : "—"} |`);
      }
      L.push(``);
    }

    if (r.project_page && r.project_page.loaded) {
      L.push(`**Your target page (${pathOf(r.project_page.url)}):**`);
      L.push(`- Author byline: ${r.project_page.has_author_byline ? `✓ ${r.project_page.author_name || ""}` : "missing"}`);
      L.push(`- Credentials: ${r.project_page.has_credentials ? "✓" : "missing"}`);
      L.push(`- FAQ schema: ${r.project_page.has_faq_schema ? "✓" : "missing"}`);
      L.push(`- Article schema: ${r.project_page.has_article_schema ? "✓" : "missing"}`);
      L.push(`- HowTo schema: ${r.project_page.has_howto_schema ? "✓" : "missing"}`);
      L.push(`- Summary paragraph at top: ${r.project_page.has_summary_top ? `✓ (${r.project_page.summary_word_count} words)` : "missing"}`);
      L.push(`- Q-and-A heading structure: ${r.project_page.has_qa_structure ? `✓ (${r.project_page.qa_block_count} question headings)` : "missing"}`);
      L.push(`- Last updated date: ${r.project_page.has_last_updated ? "✓" : "missing"}`);
      L.push(`- TL;DR / key takeaways block: ${r.project_page.has_tldr_block ? "✓" : "missing"}`);
      L.push(`- Total word count: ${r.project_page.total_word_count}`);
      L.push(``);
    } else if (r.project_url) {
      L.push(`_Your target page (${pathOf(r.project_url)}) could not be fetched — fetch failed or page does not exist. Cannot complete gap analysis without it._`);
      L.push(``);
    } else {
      L.push(`_No project target URL identified for this query. Cannot compute the specific gap — supply target URLs or run after GSC has captured impressions for this query._`);
      L.push(``);
    }

    if (r.gaps.length > 0) {
      L.push(`**Identified gaps:**`);
      for (const g of r.gaps) {
        L.push(`- **${g.severity.toUpperCase()}** — ${g.description}`);
      }
      L.push(``);
    }

    if (r.recommended_actions.length > 0) {
      L.push(`**Recommended actions:**`);
      for (const a of r.recommended_actions) L.push(`- ${a}`);
      L.push(``);
    }

    L.push(`---`);
    L.push(``);
  }

  if (e.no_ai_overview.length > 0) {
    L.push(`## Queries without AI Overview`);
    L.push(`_These queries do not currently show AI Overview in SerpAPI results. Citation gap analysis does not apply — classic SEO levers (ranking, CTR, content depth) are the relevant levers._`);
    L.push(``);
    for (const q of e.no_ai_overview) L.push(`- ${q}`);
    L.push(``);
  }

  if (e.fetch_failed.length > 0) {
    L.push(`## Queries where SerpAPI fetch failed`);
    L.push(`_Try re-running. If failures persist, check SERPAPI_KEY configuration or rate-limit status._`);
    L.push(``);
    for (const q of e.fetch_failed) L.push(`- ${q}`);
    L.push(``);
  }

  if (e.worth_deeper.length > 0) {
    L.push(`## Worth investigating further`);
    for (const w of e.worth_deeper) L.push(`- ${w}`);
    L.push(``);
  }

  L.push(`## Provenance`);
  for (const f of e.provenance) {
    L.push(`- ${f.source}: ${typeof f.value === "number" ? f.value : JSON.stringify(f.value)}${f.note ? ` (${f.note})` : ""} — ${new Date(f.fetched_at).toLocaleString()}`);
  }

  return L.join("\n");
}
