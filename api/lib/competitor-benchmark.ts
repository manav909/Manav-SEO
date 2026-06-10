/* ════════════════════════════════════════════════════════════════
   api/lib/competitor-benchmark.ts

   BUILD 12.26 — Competitor organic benchmarking engine.

   Closes the competitor gap with a real, domain-vs-domain engine that
   takes a CURATED competitor list (the operator supplies the domains —
   no auto-discovery, which is exactly what produced the irrelevant
   "lock brand + AI company" competitors in the bucketsquad delivery).
   For a query set drawn from the client's own GSC data (plus any
   operator keywords), it measures, against real SERPs and real pages:

   - KEYWORD-GAP: queries where a competitor outranks the client, or
     ranks while the client is absent — computed from live SERP organic
     positions (SerpAPI top-100 domains in rank order).
   - CONTENT-GAP: for the worst gaps, fetch the competitor's ranking page
     and the client's page and compare real structure (word count,
     schema, summary/Q-and-A presence) via the shared page extractor.
   - BACKLINK-GAP: HONEST SUB-GAP. The platform has no backlink-profile
     data source wired (the referring-domains provider returns empty), so
     this engine does NOT fabricate authority numbers. It states plainly
     that backlink-gap needs a real source (Ahrefs/Semrush export or API)
     and leaves an extension point — never a guessed figure.

   Senior-DMS honesty: SERP positions are a point-in-time, location-
   dependent snapshot; the query set is capped for cost; unique-domain
   ranking is an approximation of position. All stated in limits.

   Cost: SerpAPI per query + crawl per content-gap page — both capped.
   Multi-tenant: projectId + the supplied competitor domains only.
════════════════════════════════════════════════════════════════ */

import { loadGsc, fetchHtml } from "./workspace/shared.js";
import { fetchSerpFeatures } from "./serpapi.js";
import { extractPagePattern, type PagePattern } from "./geo-citation-gap.js";

const cleanDomain = (d: string) => String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return cleanDomain(u); } };

export interface QueryStanding {
  query:            string;
  impressions:      number;          // client's GSC impressions for this query (0 if from operator keywords)
  client_position:  number | null;   // client's organic rank (null = not in top 100)
  competitor_positions: Record<string, number | null>;
  verdict:          "client_leads" | "competitor_leads" | "client_absent" | "none_rank";
  leading_competitor: string | null;
}

export interface ContentGap {
  query:       string;
  competitor:  string;
  competitor_url: string;
  client_url:  string | null;
  competitor_pattern: Partial<PagePattern> | null;
  client_pattern:     Partial<PagePattern> | null;
  observations: string[];
}

export interface CompetitorBenchmarkReport {
  project_domain:   string;
  generated_at:     string;
  competitors:      string[];
  queries_analyzed: number;
  standings:        QueryStanding[];
  keyword_gap: {
    per_competitor: Record<string, { outranks_client: number; client_absent: number; sample_queries: string[] }>;
    biggest_gaps:   Array<{ query: string; competitor: string; competitor_position: number; client_position: number | null; impressions: number }>;
  };
  content_gaps:     ContentGap[];
  backlink_gap:     { available: boolean; note: string; data: any | null };
  summary:          string;
  limits:           string[];
}

const num = (n: any) => Number(n || 0);

/* position of a domain in the SERP's unique-domain ranking (1-based) */
function positionOf(domains: string[], domain: string): number | null {
  const target = cleanDomain(domain);
  const i = domains.findIndex(d => cleanDomain(d) === target);
  return i >= 0 ? i + 1 : null;
}
function firstUrlForDomain(urls: string[], domain: string): string | null {
  const target = cleanDomain(domain);
  return urls.find(u => domainOf(u) === target) || null;
}

export async function benchmarkCompetitors(opts: {
  projectId: string;
  competitors: string[];
  keywords?: string[];
  maxQueries?: number;
  maxContentGaps?: number;
}): Promise<CompetitorBenchmarkReport> {
  const now = new Date().toISOString();
  const competitors = Array.from(new Set((opts.competitors || []).map(cleanDomain).filter(Boolean)));
  const maxQueries = Math.max(1, Math.min(opts.maxQueries ?? 15, 30));
  const maxContentGaps = Math.max(1, Math.min(opts.maxContentGaps ?? 8, 15));

  const gsc = await loadGsc(opts.projectId);
  const gscPairs: any[] = Array.isArray(gsc.queryPagePairs) ? gsc.queryPagePairs : [];
  const projectDomain = domainOf(gscPairs[0]?.page || gsc.topPages?.[0]?.page || "");

  const empty = (note: string): CompetitorBenchmarkReport => ({
    project_domain: projectDomain, generated_at: now, competitors, queries_analyzed: 0,
    standings: [], keyword_gap: { per_competitor: {}, biggest_gaps: [] }, content_gaps: [],
    backlink_gap: { available: false, note: "Not evaluated.", data: null }, summary: note, limits: [note],
  });

  if (competitors.length === 0) return empty("Supply at least one competitor domain — this engine does not auto-pick competitors, by design (auto-selection is what produced irrelevant competitors before).");

  /* Query set: operator keywords first, then top GSC queries by impressions. */
  const gscByQuery = new Map<string, number>();
  for (const r of gscPairs) { const q = String(r.query || "").trim(); if (q) gscByQuery.set(q, (gscByQuery.get(q) || 0) + num(r.impressions)); }
  const gscQueries = [...gscByQuery.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const operatorKw = (opts.keywords || []).map(s => s.trim()).filter(Boolean);
  const querySet = Array.from(new Set([...operatorKw, ...gscQueries])).slice(0, maxQueries);

  if (querySet.length === 0) return empty("No queries to benchmark. Supply target keywords, or connect GSC so the engine can use the client's own queries.");

  /* ── keyword-gap from live SERP positions ── */
  const standings: QueryStanding[] = [];
  for (const query of querySet) {
    const serp: any = await fetchSerpFeatures(query, opts.projectId, {}).catch(() => null);
    if (!serp) continue;
    const domains: string[] = Array.isArray(serp.top_100_domains) ? serp.top_100_domains : [];
    const client_position = positionOf(domains, projectDomain);
    const competitor_positions: Record<string, number | null> = {};
    for (const c of competitors) competitor_positions[c] = positionOf(domains, c);

    const rankedComps = competitors.filter(c => competitor_positions[c] != null);
    let verdict: QueryStanding["verdict"];
    let leading_competitor: string | null = null;
    if (rankedComps.length === 0 && client_position == null) verdict = "none_rank";
    else if (rankedComps.length === 0) verdict = "client_leads";
    else {
      const bestComp = rankedComps.reduce((a, b) => (competitor_positions[a]! <= competitor_positions[b]! ? a : b));
      leading_competitor = bestComp;
      if (client_position == null) verdict = "client_absent";
      else verdict = client_position < competitor_positions[bestComp]! ? "client_leads" : "competitor_leads";
    }

    standings.push({ query, impressions: gscByQuery.get(query) || 0, client_position, competitor_positions, verdict, leading_competitor });
  }

  /* aggregate keyword-gap */
  const per_competitor: CompetitorBenchmarkReport["keyword_gap"]["per_competitor"] = {};
  for (const c of competitors) per_competitor[c] = { outranks_client: 0, client_absent: 0, sample_queries: [] };
  for (const s of standings) {
    for (const c of competitors) {
      const cp = s.competitor_positions[c];
      if (cp == null) continue;
      const beatsClient = s.client_position == null || cp < s.client_position;
      if (beatsClient) {
        per_competitor[c].outranks_client += 1;
        if (s.client_position == null) per_competitor[c].client_absent += 1;
        if (per_competitor[c].sample_queries.length < 8) per_competitor[c].sample_queries.push(s.query);
      }
    }
  }

  const biggest_gaps = standings
    .filter(s => s.verdict === "competitor_leads" || s.verdict === "client_absent")
    .map(s => ({ query: s.query, competitor: s.leading_competitor!, competitor_position: s.competitor_positions[s.leading_competitor!]!, client_position: s.client_position, impressions: s.impressions }))
    .sort((a, b) => b.impressions - a.impressions || a.competitor_position - b.competitor_position)
    .slice(0, 20);

  /* ── content-gap: crawl the worst gaps and compare real page structure ── */
  const content_gaps: ContentGap[] = [];
  for (const g of biggest_gaps.slice(0, maxContentGaps)) {
    const serp: any = await fetchSerpFeatures(g.query, opts.projectId, {}).catch(() => null);
    const urls: string[] = serp && Array.isArray(serp.top_100_urls) ? serp.top_100_urls : [];
    const compUrl = firstUrlForDomain(urls, g.competitor);
    const clientUrl = firstUrlForDomain(urls, projectDomain);
    if (!compUrl) continue;

    const compHtml = await fetchHtml(compUrl).catch(() => null);
    const compPat = extractPagePattern(compUrl, compHtml);
    let clientPat: PagePattern | null = null;
    if (clientUrl) { const ch = await fetchHtml(clientUrl).catch(() => null); clientPat = extractPagePattern(clientUrl, ch); }

    const obs: string[] = [];
    if (clientPat) {
      if (compPat.total_word_count > clientPat.total_word_count * 1.3) obs.push(`Competitor page is substantially deeper (${compPat.total_word_count} vs ${clientPat.total_word_count} words).`);
      if (compPat.has_faq_schema && !clientPat.has_faq_schema) obs.push(`Competitor uses FAQ structure; client does not.`);
      if (compPat.schema_types.length > clientPat.schema_types.length) obs.push(`Competitor has richer schema (${compPat.schema_types.join(", ") || "none"} vs ${clientPat.schema_types.join(", ") || "none"}).`);
      if (compPat.has_qa_structure && !clientPat.has_qa_structure) obs.push(`Competitor answers in question-led sections; client does not.`);
      if (obs.length === 0) obs.push(`Competitor ranks higher but page structure is similar — the gap may be authority or relevance, not on-page depth.`);
    } else {
      obs.push(`Client has no page ranking for this query. Competitor page: ${compPat.total_word_count} words${compPat.schema_types.length ? `, schema: ${compPat.schema_types.join(", ")}` : ""}${compPat.has_qa_structure ? ", question-led structure" : ""}. A dedicated, intent-matched page is the gap.`);
    }

    content_gaps.push({
      query: g.query, competitor: g.competitor, competitor_url: compUrl, client_url: clientUrl,
      competitor_pattern: compHtml ? { total_word_count: compPat.total_word_count, schema_types: compPat.schema_types, has_faq_schema: compPat.has_faq_schema, has_qa_structure: compPat.has_qa_structure } : null,
      client_pattern: clientPat ? { total_word_count: clientPat.total_word_count, schema_types: clientPat.schema_types, has_faq_schema: clientPat.has_faq_schema, has_qa_structure: clientPat.has_qa_structure } : null,
      observations: obs,
    });
  }

  /* ── backlink-gap: honest sub-gap, no fabrication ── */
  const backlink_gap = {
    available: false,
    note: "Backlink-gap not produced: the platform has no backlink-profile data source connected. This needs a real source (an Ahrefs/Semrush/Majestic export or API). Wire one and this engine will compute referring-domain and authority gaps; until then it does not estimate authority, by design.",
    data: null,
  };

  /* ── summary + limits ── */
  const leads = standings.filter(s => s.verdict === "client_leads").length;
  const compLeads = standings.filter(s => s.verdict === "competitor_leads").length;
  const absent = standings.filter(s => s.verdict === "client_absent").length;
  const summary = `Benchmarked ${standings.length} queries against ${competitors.length} curated competitor(s): client leads on ${leads}, a competitor leads on ${compLeads}, client is absent on ${absent}. ${content_gaps.length} content gaps examined on the worst-ranking queries. Backlink-gap requires a data source (not connected). Start with the biggest-impression queries where a competitor leads or the client is absent.`;

  const limits = [
    "Competitors are operator-supplied (curated) — the engine does not auto-discover them, to avoid irrelevant matches.",
    "SERP positions are a point-in-time, location-dependent snapshot from SerpAPI; rank is among unique organic domains (an approximation of absolute position).",
    `Query set is capped at ${maxQueries} (highest-impression GSC queries plus any supplied keywords) and content-gap crawling at ${maxContentGaps}, to control cost.`,
    "Content-gap compares on-page structure only (depth, schema, question-led format); it does not by itself explain authority/backlink-driven ranking differences.",
    "Backlink-gap is not computed — no backlink-profile data source is connected.",
  ];

  return {
    project_domain: projectDomain, generated_at: now, competitors, queries_analyzed: standings.length,
    standings, keyword_gap: { per_competitor, biggest_gaps }, content_gaps, backlink_gap, summary, limits,
  };
}
