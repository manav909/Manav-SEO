/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/deep-steps/competitor-intel.ts

   DEEP STEP — Competitor Intelligence.

   Job: for this project's most valuable near-ranking queries, capture the
   real SERP (positions, features, PAA) AND fetch the actual competitor pages
   ranking above the project, recording verified on-page facts. This turns
   "competitors are stronger" (an assumption) into "competitor X has 1,850
   words + schema vs this page's 320 words" (a verified, sourced fact).

   Project-agnostic: derives queries and the project's own domain from data
   passed in. No hardcoded competitor lists or domains.
════════════════════════════════════════════════════════════════ */

import { fetchSerpFeatures, fetchPageFacts, type SourcedFact } from "../shared.js";

const path = (u: string) => (u || "").replace(/^https?:\/\/[^/]+/, "") || "/";
const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export interface CompetitorEvidence {
  step_key: "competitor_intel";
  generated_at: string;
  project_domain: string;
  queries_analysed: Array<{
    query: string;
    project_position: number;            // where the project ranks (from GSC)
    serp_features: string[];             // AI overview, featured snippet, PAA, shopping, etc.
    paa_questions: string[];
    competitors: Array<{
      domain: string; url: string; serp_position: number;
      title: string; word_count: number; schema: boolean; loaded: boolean;
    }>;
  }>;
  provenance: SourcedFact[];
  worth_deeper: string[];
}

export async function gatherCompetitorIntel(opts: {
  projectId: string;
  projectDomain: string;            // derived from target urls by the caller
  queries: Array<{ query: string; position: number }>;  // near-ranking queries from the visibility step
  maxQueries?: number;
  maxCompetitorsPerQuery?: number;
}): Promise<{ evidence: CompetitorEvidence; report_md: string }> {
  const now = new Date().toISOString();
  const { projectId, projectDomain } = opts;
  const maxQ = opts.maxQueries ?? 4;
  const maxC = opts.maxCompetitorsPerQuery ?? 4;
  const provenance: SourcedFact[] = [];

  // Pick the highest-impact near-ranking queries (caller already sorted/filtered)
  const queries = (opts.queries || []).slice(0, maxQ);
  const analysed: CompetitorEvidence["queries_analysed"] = [];

  for (const q of queries) {
    const serp: any = await fetchSerpFeatures(q.query, projectId, {}).catch(() => null);
    if (!serp) continue;
    provenance.push({ value: q.query, source: "SerpAPI", fetched_at: serp.fetched_at || now, note: "live SERP" });

    const features: string[] = [];
    if (serp.ai_overview) features.push("AI Overview");
    if (serp.featured_snippet) features.push(`Featured snippet${serp.featured_snippet_owner ? ` (${serp.featured_snippet_owner})` : ""}`);
    if (serp.people_also_ask) features.push("People Also Ask");
    if (serp.shopping_carousel) features.push("Shopping");
    if (serp.video_carousel) features.push("Video");
    if (serp.knowledge_panel) features.push("Knowledge panel");

    // Competitor URLs = top organic urls that are NOT the project's own domain
    const top: string[] = (serp.top_100_urls || serp.top_10_urls || []) as string[];
    const competitorUrls = top.filter(u => domainOf(u) && domainOf(u) !== projectDomain).slice(0, maxC);

    // Fetch each competitor page live to verify what they actually have
    const comps = await Promise.race([
      Promise.all(competitorUrls.map(async (url, i) => {
        const f = await fetchPageFacts(url);
        return {
          domain: domainOf(url), url, serp_position: i + 1,
          title: f.title, word_count: f.word_count, schema: f.schema, loaded: f.loaded,
        };
      })),
      new Promise<any[]>((res) => setTimeout(() => res([]), 45000)),
    ]);
    if ((comps as any[]).length) provenance.push({ value: (comps as any[]).length, source: "live HTML crawl", fetched_at: new Date().toISOString(), note: `competitor pages for "${q.query}"` });

    analysed.push({
      query: q.query,
      project_position: q.position,
      serp_features: features,
      paa_questions: (serp.paa_questions || []).slice(0, 6),
      competitors: comps as any[],
    });
  }

  const worth_deeper: string[] = [];
  for (const a of analysed) {
    const loaded = a.competitors.filter(c => c.loaded);
    if (loaded.length) {
      const avgWords = Math.round(loaded.reduce((s, c) => s + c.word_count, 0) / loaded.length);
      worth_deeper.push(`"${a.query}": competitors ranking above average ${avgWords} words; ${loaded.filter(c => c.schema).length}/${loaded.length} use schema. Compare against this project's page.`);
    }
  }

  const evidence: CompetitorEvidence = {
    step_key: "competitor_intel",
    generated_at: now,
    project_domain: projectDomain,
    queries_analysed: analysed,
    provenance,
    worth_deeper,
  };
  return { evidence, report_md: renderCompetitorReport(evidence) };
}

function renderCompetitorReport(e: CompetitorEvidence): string {
  const L: string[] = [];
  L.push(`# Competitor Intelligence — Evidence Report`);
  L.push("");
  L.push(`_Generated ${new Date(e.generated_at).toLocaleString()}. SERP data from SerpAPI; competitor on-page facts from live crawl of the actual ranking pages. Project domain: ${e.project_domain || "—"}._`);
  L.push("");
  if (!e.queries_analysed.length) {
    L.push(`_No near-ranking queries were available to analyse competitors for._`);
    return L.join("\n");
  }
  for (const a of e.queries_analysed) {
    L.push(`## "${a.query}" — this project ranks ~${a.project_position?.toFixed?.(1) ?? a.project_position}`);
    L.push(`**SERP features:** ${a.serp_features.length ? a.serp_features.join(", ") : "none detected"}`);
    if (a.paa_questions.length) { L.push(""); L.push(`**People Also Ask:**`); for (const p of a.paa_questions) L.push(`- ${p}`); }
    L.push("");
    if (a.competitors.length) {
      L.push(`| # | Competitor | Words | Schema | Title |`);
      L.push(`|---|---|---|---|---|`);
      for (const c of a.competitors) {
        L.push(`| ${c.serp_position} | ${c.domain} | ${c.loaded ? c.word_count : "—"} | ${c.loaded ? (c.schema ? "yes" : "no") : "—"} | ${c.loaded ? (c.title || "").slice(0, 50) : "fetch failed"} |`);
      }
    } else { L.push(`_No competitor pages could be fetched for this query._`); }
    L.push("");
  }
  if (e.worth_deeper.length) {
    L.push(`## Worth investigating further (handed to the panel)`);
    for (const w of e.worth_deeper) L.push(`- ${w}`);
    L.push("");
  }
  L.push(`## Provenance`);
  for (const f of e.provenance) L.push(`- ${f.source}: ${typeof f.value === "number" ? f.value : JSON.stringify(f.value)}${f.note ? ` (${f.note})` : ""} — ${new Date(f.fetched_at).toLocaleString()}`);
  return L.join("\n");
}
