/* ════════════════════════════════════════════════════════════════
   api/lib/seo-cluster-map.ts
   Phase 16 — Cluster Map pillar engine

   Maps the topical universe around a campaign's keyword.

   Pipeline:
     1. Fetch GSC queries for the project
     2. Filter to queries semantically related to the campaign keyword
        (token overlap, edit distance, related-keyword expansion)
     3. Group filtered queries into clusters using lexical similarity
     4. LLM-name + intent-label each cluster (one batched call)
     5. For each cluster, infer hub page + spokes from GSC top_pages
        whose URL slugs match cluster tokens
     6. Compare against competitor_snapshot to detect gaps
     7. Compute findings, write structured cluster rows + markdown report
     8. Surface high-value gaps as opportunities

   Honest scope: GSC data doesn't store per-query → per-page mapping at
   the level we'd need for perfect hub/spoke detection. We use URL-slug
   token-matching as a heuristic. The report calls this out explicitly.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { writeReportToPanel, recordOpportunity } from "./seo-campaign-engine.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscPageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface Cluster {
  cluster_name:     string;
  primary_intent:   string;
  topic_summary:    string;
  queries:          GscQueryRow[];
  query_count:      number;
  hub_page_url:     string | null;
  spoke_pages:      string[];
  total_clicks:     number;
  total_impressions: number;
  avg_position:     number;
  coverage_status:  'covered' | 'partial' | 'partial_losing' | 'gap' | 'unknown';
  recommendation:   string;
  shared_tokens:    string[];          // tokens that defined this cluster
  /* Phase 16.0.2 — competitive ownership */
  competitor_owners: string[];          // domains/URLs that own this cluster
  /* Phase 16.0.3 — Senior DMS pillar source-tracing (2026-05-24).
     Each cluster declares which sources informed it; consumers compute
     a weighted-mean confidence from these. Optional for backward compat
     with rows persisted before this field existed. */
  sources_used?:     ClusterSourceKey[];
  confidence_score?: number;            // 0..100 weighted mean
  /* Phase 16.0.4 — Senior DMS quality checks (2026-05-24 PM).
     Added after a real audit on alphasoftware.com / keyword "app maker"
     showed the engine could mark a cluster "covered" while the campaign
     keyword itself ranked at position 36.5. These fields surface the
     gaps a Senior SEO Specialist would expect to see. */
  campaign_keyword_position?: number | null;   // position of campaign kw in this cluster's queries (null if absent)
  hub_alignment?: 'strong' | 'partial' | 'weak' | 'no_hub';
  cohesion_position_spread?: number;           // max(pos) - min(pos) within cluster
  is_thin?: boolean;                           // <5 queries OR <500 impressions
}

interface ClusterFinding {
  severity: 'green' | 'amber' | 'red' | 'info';
  title:    string;
  detail:   string;
  sources_used?: ClusterSourceKey[];
  confidence_score?: number;
}

/* ═══════════════════════════════════════════════════════════════════
   SOURCE-CONFIDENCE MAPPING for cluster-map outputs
   Phase 16.0.3 — added 2026-05-24 as part of the Senior DMS pillar
   source-tracing pattern (template established on seo-technical-audit).

   Cluster-map outputs aggregate multiple sources per cluster:
   • gsc_queries        — live GSC query data (the strongest anchor)
   • gsc_pages_slug     — GSC pages filtered by URL-slug match (heuristic; degraded confidence)
   • pipeline_research  — competitor snapshot from pipeline research output
   • llm_naming         — Claude clustering + intent labeling
   • llm_ownership      — Claude competitor-ownership inference per cluster
   • brain_learning     — cross-project pattern lookups (when used)

   Numbers align with intelligenceFabric.ts: gsc_live=95, intelligence_output=80,
   claude_inference=65, brain_learning=80. Heuristic-derived GSC data lands at
   80 (between gsc_live and the LLM tier) to reflect the heuristic uncertainty.
═══════════════════════════════════════════════════════════════════ */

type ClusterSourceKey =
  | 'gsc_queries'
  | 'gsc_pages_slug'
  | 'pipeline_research'
  | 'llm_naming'
  | 'llm_ownership'
  | 'brain_learning';

const CLUSTER_SOURCE_META: Record<
  ClusterSourceKey,
  { confidence: number; label: string; sourceType: string }
> = {
  gsc_queries:       { confidence: 95, label: 'GSC queries (live)',                 sourceType: 'gsc_live' },
  gsc_pages_slug:    { confidence: 80, label: 'GSC pages (URL-slug heuristic)',     sourceType: 'gsc_live' },
  pipeline_research: { confidence: 80, label: 'Pipeline research (competitor)',     sourceType: 'intelligence_output' },
  llm_naming:        { confidence: 65, label: 'Claude clustering + intent naming',  sourceType: 'claude_inference' },
  llm_ownership:     { confidence: 65, label: 'Claude competitor-ownership',        sourceType: 'claude_inference' },
  brain_learning:    { confidence: 80, label: 'Brain learnings (cross-project)',    sourceType: 'brain_learning' },
};

function clusterSourcesConfidence(keys: ClusterSourceKey[]): number {
  if (!keys || keys.length === 0) return 0;
  const total = keys.reduce((acc, k) => acc + CLUSTER_SOURCE_META[k].confidence, 0);
  return Math.round(total / keys.length);
}

/** Weighted-mean confidence across an array of clusters (each having its own
 *  declared sources). Clusters without `sources_used` are excluded from the
 *  mean and surfaced separately as unattributed. */
function weightedClusterConfidence(clusters: Cluster[]): {
  mean: number;
  sourced_count: number;
  unattributed_count: number;
} {
  const sourced = clusters
    .map(c => c.confidence_score)
    .filter((s): s is number => typeof s === 'number');
  const unattributed = clusters.length - sourced.length;
  if (sourced.length === 0) return { mean: 0, sourced_count: 0, unattributed_count: unattributed };
  const total = sourced.reduce((acc, s) => acc + s, 0);
  return { mean: Math.round(total / sourced.length), sourced_count: sourced.length, unattributed_count: unattributed };
}

/* ═══════════════════════════════════════════════════════════════════
   KEYWORD MATCHING + QUALITY CHECKS (Phase 16.0.4 — Senior DMS uplift)
   Added 2026-05-24 PM after the cluster-map output on alphasoftware.com /
   keyword "app maker" was marked "covered" despite the campaign keyword
   itself ranking at position 36.5 (page 4) and the inferred hub being
   an audit-app URL with no keyword presence.

   Helpers duplicate the pattern from seo-technical-audit (same logic,
   intentionally kept local per the standalone-engine convention).
═══════════════════════════════════════════════════════════════════ */

type KeywordMatchStrength = 'exact' | 'full' | 'partial' | 'none';

function normalizeForKeywordMatch(s: string): string {
  return (s || '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenMatchesWord(token: string, word: string): boolean {
  if (token === word) return true;
  if (token + 's' === word) return true;
  if (token === word + 's') return true;
  return false;
}

function tokenInText(token: string, normalizedText: string): boolean {
  return normalizedText.split(' ').some(w => tokenMatchesWord(token, w));
}

function classifyKeywordMatch(rawText: string, keyword: string): KeywordMatchStrength {
  if (!rawText) return 'none';
  const text = normalizeForKeywordMatch(rawText);
  const kw   = normalizeForKeywordMatch(keyword);
  if (!text || !kw) return 'none';
  const tokens = kw.split(' ').filter(Boolean);
  if (tokens.length === 0) return 'none';
  const padded = ' ' + text + ' ';
  if (padded.includes(' ' + kw + ' ')) return 'exact';
  let hits = 0;
  for (const t of tokens) if (tokenInText(t, text)) hits++;
  if (hits === tokens.length) return 'full';
  if (hits > 0)               return 'partial';
  return 'none';
}

/** Find the campaign keyword's position within a cluster's queries.
 *  Returns the position of the best-matching query (exact > full > partial)
 *  or null if no token-level match exists in any query. */
function findCampaignKeywordPosition(queries: GscQueryRow[], keyword: string): {
  position: number | null;
  matched_query: string | null;
  match_strength: KeywordMatchStrength;
} {
  if (!keyword || !queries || queries.length === 0) {
    return { position: null, matched_query: null, match_strength: 'none' };
  }
  let best: { position: number; query: string; strength: KeywordMatchStrength } | null = null;
  const rank = (s: KeywordMatchStrength) => s === 'exact' ? 3 : s === 'full' ? 2 : s === 'partial' ? 1 : 0;
  for (const q of queries) {
    const strength = classifyKeywordMatch(q.query, keyword);
    if (strength === 'none') continue;
    if (!best || rank(strength) > rank(best.strength)) {
      best = { position: q.position, query: q.query, strength };
    }
  }
  return best
    ? { position: best.position, matched_query: best.query, match_strength: best.strength }
    : { position: null, matched_query: null, match_strength: 'none' };
}

/** Assess whether the inferred hub URL carries the campaign keyword tokens.
 *  A Senior SEO Specialist expects the hub for a "${keyword}" cluster to
 *  visibly contain ${keyword} in its slug. If it doesn't, the heuristic
 *  has likely locked onto an adjacent-topic URL rather than the real hub. */
function assessHubAlignment(hubUrl: string | null, keyword: string): {
  alignment: 'strong' | 'partial' | 'weak' | 'no_hub';
  slug: string;
  match: KeywordMatchStrength;
} {
  if (!hubUrl) return { alignment: 'no_hub', slug: '', match: 'none' };
  let slug = '';
  try {
    const u = new URL(hubUrl);
    slug = u.pathname.replace(/[-_/?=&]/g, ' ');
  } catch {
    slug = hubUrl.replace(/[-_/?=&]/g, ' ');
  }
  const match = classifyKeywordMatch(slug, keyword);
  const alignment: 'strong' | 'partial' | 'weak' | 'no_hub' =
    match === 'exact' || match === 'full' ? 'strong' :
    match === 'partial'                   ? 'partial' :
                                            'weak';
  return { alignment, slug: slug.trim(), match };
}

/** Compute cluster cohesion as the position spread (max - min) across
 *  queries that have meaningful impressions. A spread > 20 ranks suggests
 *  the cluster is over-aggregated — queries from very different SERPs
 *  got grouped because their tokens overlap, but they're not the same
 *  topical universe. */
function clusterPositionSpread(queries: GscQueryRow[]): number {
  const positions = queries
    .filter(q => q.impressions >= 5 && q.position > 0)
    .map(q => q.position);
  if (positions.length < 2) return 0;
  return Math.max(...positions) - Math.min(...positions);
}

/** Banner severity for a campaign keyword position. Returns null if the
 *  keyword has no measurable ranking in the cluster's queries. */
function campaignKeywordSeverity(pos: number | null): 'green' | 'amber' | 'red' | 'red_critical' | 'absent' {
  if (pos === null) return 'absent';
  if (pos <= 3)     return 'green';
  if (pos <= 10)    return 'amber';
  if (pos <= 20)    return 'amber';
  if (pos <= 50)    return 'red';
  return 'red_critical';
}

/* ════════════════════════════════════════════════════════════════
   PUBLIC API
═══════════════════════════════════════════════════════════════ */

export async function runClusterMap(opts: {
  campaignId: string;
  panelId?:   string;
  triggeredBy?: 'cron' | 'manual';
}): Promise<{
  success: boolean;
  audit_run_id?: string;
  cluster_count?: number;
  gap_count?: number;
  report_id?: string;
  error?: string;
}> {
  const triggeredBy = opts.triggeredBy || 'manual';
  try {
    const { data: campaign } = await db().from("seo_campaigns")
      .select("id, project_id, keyword").eq("id", opts.campaignId).maybeSingle();
    if (!campaign) return { success: false, error: 'campaign not found' };
    const c = campaign as any;

    let panelId = opts.panelId;
    if (!panelId) {
      const { data: p } = await db().from("seo_campaign_panels")
        .select("id").eq("campaign_id", opts.campaignId).eq("pillar", 'cluster_map').maybeSingle();
      panelId = (p as any)?.id;
    }
    if (!panelId) return { success: false, error: 'no cluster_map panel found for this campaign' };

    /* 1. Fetch GSC data */
    const [queries, pages, competitors, gscFreshnessAt] = await Promise.all([
      readGscQueries(c.project_id),
      readGscPages(c.project_id),
      readCompetitorSnapshot(opts.campaignId),
      readGscFreshness(c.project_id),
    ]);

    /* 2. Filter to keyword-related queries */
    const relatedQueries = filterRelatedQueries(queries, c.keyword);

    /* If we don't have enough actual GSC data on this topic, fall through to
       the aspirational path: cluster the topical universe from competitors +
       LLM reasoning. This is what a real SEO strategist does at campaign
       inception — map what SHOULD exist before content does. */
    if (relatedQueries.length < 3) {
      return runAspirationalClusterMap({
        campaign: c,
        panelId,
        triggeredBy,
        totalGscQueries: queries.length,
        relatedCount: relatedQueries.length,
        projectActualTopQueries: queries.slice(0, 10),
        competitors,
        gscFreshnessAt,
      });
    }

    /* 3. Cluster lexically */
    const rawClusters = lexicalClusters(relatedQueries, c.keyword);

    /* 4. LLM-name + label + recommend (one batched call) */
    const labeled = await labelAndLabelClusters({
      keyword: c.keyword,
      clusters: rawClusters,
      competitorSummary: summarizeCompetitors(competitors),
    });

    /* 5. Hub/spoke inference for each cluster */
    const enriched = labeled.map(cluster => enrichWithPages(cluster, pages));

    /* 5b. Phase 16.0.2 — per-cluster competitor ownership (parallelized LLM calls) */
    const withOwnership = await enrichWithCompetitorOwnership(enriched, c.keyword, competitors);

    /* 6. Gap + dominance detection */
    const competitorTopics = extractCompetitorTopics(competitors);
    const withCoverage = withOwnership.map(cluster => assessCoverage(cluster, competitorTopics));

    /* 6b. Phase 16.0.3 — Senior DMS source attribution.
       Every cluster declares the sources that informed it:
       • gsc_queries — always present (we already filtered/clustered live GSC data)
       • gsc_pages_slug — present when a hub or spokes were inferred
       • pipeline_research — present when competitor snapshot is non-empty
       • llm_naming — always (we always run labelAndLabelClusters)
       • llm_ownership — present when ownership enrichment produced names
       Confidence is a per-cluster weighted mean across these sources. */
    const hasCompetitorData = competitors.length > 0;
    for (const cl of withCoverage) {
      const keys: ClusterSourceKey[] = ['gsc_queries', 'llm_naming'];
      if (cl.hub_page_url || (cl.spoke_pages && cl.spoke_pages.length > 0)) keys.push('gsc_pages_slug');
      if (hasCompetitorData) keys.push('pipeline_research');
      if (cl.competitor_owners && cl.competitor_owners.length > 0) keys.push('llm_ownership');
      cl.sources_used = keys;
      cl.confidence_score = clusterSourcesConfidence(keys);
    }

    /* 6c. Phase 16.0.4 — Senior DMS quality checks per cluster.
       Computes: campaign keyword position WITHIN the cluster's queries,
       hub URL alignment, position-spread cohesion, and thin-cluster flag.
       Then applies a coverage_status post-fix: a cluster cannot be
       "covered" if the campaign keyword itself ranks below position 20,
       regardless of cluster aggregates — that's synthesis-as-fact otherwise. */
    for (const cl of withCoverage) {
      const kwPos        = findCampaignKeywordPosition(cl.queries, c.keyword);
      const hubAlign     = assessHubAlignment(cl.hub_page_url, c.keyword);
      const spread       = clusterPositionSpread(cl.queries);
      const thin         = cl.query_count < 5 || cl.total_impressions < 500;
      cl.campaign_keyword_position = kwPos.position;
      cl.hub_alignment             = hubAlign.alignment;
      cl.cohesion_position_spread  = spread;
      cl.is_thin                   = thin;

      /* Coverage post-fix — Senior DMS bar */
      if (cl.coverage_status === 'covered' && kwPos.position !== null && kwPos.position > 20) {
        cl.coverage_status = 'partial';
      }
      /* If hub doesn't carry the keyword at all (weak alignment) AND we'd
         called this "covered", downgrade — the heuristic likely locked
         onto an adjacent-topic URL, not a real hub. */
      if (cl.coverage_status === 'covered' && hubAlign.alignment === 'weak') {
        cl.coverage_status = 'partial';
      }
      /* If the cluster is thin AND we'd called it covered, downgrade —
         can't claim coverage on 4 queries of evidence. */
      if (cl.coverage_status === 'covered' && thin) {
        cl.coverage_status = 'partial';
      }
      /* Thin clusters get reduced confidence regardless of source-quality */
      if (thin && typeof cl.confidence_score === 'number') {
        cl.confidence_score = Math.min(cl.confidence_score, 60);
      }
    }

    /* 7. Persist clusters + write report */
    const auditRunId = crypto.randomUUID();
    if (withCoverage.length > 0) {
      const clusterRows = withCoverage.map(cl => ({
        campaign_id:        opts.campaignId,
        panel_id:           panelId,
        project_id:         c.project_id,
        cluster_name:       cl.cluster_name.slice(0, 240),
        primary_intent:     cl.primary_intent,
        topic_summary:      cl.topic_summary?.slice(0, 500) || null,
        queries:            cl.queries,
        query_count:        cl.query_count,
        hub_page_url:       cl.hub_page_url,
        spoke_pages:        cl.spoke_pages,
        total_clicks:       cl.total_clicks,
        total_impressions:  cl.total_impressions,
        avg_position:       cl.avg_position,
        coverage_status:    cl.coverage_status,
        recommendation:     cl.recommendation?.slice(0, 1000) || null,
        competitor_owners:  cl.competitor_owners || [],     // Phase 16.0.2
        audit_run_id:       auditRunId,
      }));
      await db().from("cluster_map_clusters").insert(clusterRows);
    }

    const findings = computeFindings(withCoverage, c.keyword, queries.length, relatedQueries.length);
    const gapCount = withCoverage.filter(cl => cl.coverage_status === 'gap').length;
    const partialCount = withCoverage.filter(cl => cl.coverage_status === 'partial').length;
    const partialLosingCount = withCoverage.filter(cl => cl.coverage_status === 'partial_losing').length;

    /* LLM call accounting: 1 for labelAndLabelClusters + 1 per cluster for ownership */
    const llmCallsUsed = 1 + withCoverage.length;

    /* Honest confidence rating — was previously inverted ("more findings =
       higher confidence" which is illogical). Now derived from per-cluster
       source confidence (the data-quality signal) cross-checked with the
       data volume signal (how much GSC anchor we had to work with). */
    const sourceConf = weightedClusterConfidence(withCoverage);
    const dataVolumeSignal: 'high' | 'medium' | 'low' =
      relatedQueries.length >= 30 ? 'high' :
      relatedQueries.length >= 10 ? 'medium' : 'low';
    const sourceQualitySignal: 'high' | 'medium' | 'low' =
      sourceConf.mean >= 85 ? 'high' :
      sourceConf.mean >= 72 ? 'medium' : 'low';
    const overallRating: 'high' | 'medium' | 'low' =
      (dataVolumeSignal === 'low'    || sourceQualitySignal === 'low')    ? 'low' :
      (dataVolumeSignal === 'medium' || sourceQualitySignal === 'medium') ? 'medium' : 'high';

    const reportR = await writeReportToPanel({
      campaignId:       opts.campaignId,
      projectId:        c.project_id,
      pillar:           'cluster_map',
      panelId,
      reportKind:       triggeredBy === 'cron' ? 'scheduled_recheck' : 'manual_refresh',
      generatedBy:      triggeredBy,
      llmCallsUsed,
      dataSources:      ['gsc', 'llm', ...(competitors.length > 0 ? ['pipeline_research' as const] : [])],
      confidenceRating: overallRating,
      confidenceReason: [
        `Clustered ${relatedQueries.length} GSC queries into ${withCoverage.length} clusters.`,
        `Per-cluster source-weighted confidence: ${sourceConf.mean}/100 across ${sourceConf.sourced_count} clusters (${sourceQualitySignal}).`,
        `Data volume signal: ${relatedQueries.length} related queries (${dataVolumeSignal}).`,
        'Hub/spoke inference uses URL-slug heuristic — degraded GSC confidence.',
        `Per-cluster competitor ownership identified via ${withCoverage.length} LLM calls (claude_inference, confidence 65).`,
      ].join(' '),
      title:            `Cluster map: ${withCoverage.length} clusters for "${c.keyword}"`,
      bodyMd:           renderClusterMapReport({
        keyword: c.keyword, clusters: withCoverage, findings,
        totalQueries: queries.length, relatedCount: relatedQueries.length,
        competitorsAnalyzed: competitors.length, runId: auditRunId,
        gscUpdatedAt: gscFreshnessAt,
      }),
      summary:          buildHeadline(withCoverage),
      tags:             ['cluster_map', `keyword:${c.keyword.toLowerCase()}`,
                         ...(gapCount > 0 ? [`gaps:${gapCount}`] : []),
                         ...(partialLosingCount > 0 ? [`losing:${partialLosingCount}`] : []),
                         ...withCoverage.slice(0, 8).map(cl => `cluster:${cl.cluster_name.toLowerCase().slice(0, 40)}`)],
      metricSnapshot:   {
        cluster_count: withCoverage.length,
        gap_count: gapCount,
        partial_count: partialCount,
        partial_losing_count: partialLosingCount,
        covered_count: withCoverage.filter(cl => cl.coverage_status === 'covered').length,
        llm_calls: llmCallsUsed,
      },
      updatePanelStatus: true,
      newPanelStatus:    gapCount > 0 || partialLosingCount > 0 ? 'amber' : 'green',
    });

    /* Update report_id back onto cluster rows (best-effort) */
    if (reportR.report_id && withCoverage.length > 0) {
      await db().from("cluster_map_clusters")
        .update({ report_id: reportR.report_id })
        .eq("audit_run_id", auditRunId);
    }

    /* 8. Surface gaps as opportunities */
    for (const gap of withCoverage.filter(cl => cl.coverage_status === 'gap')) {
      await recordOpportunity({
        projectId:        c.project_id,
        sourceKind:       'manual',
        sourceCampaignId: opts.campaignId,
        sourcePanelId:    panelId,
        sourceStepId:     'cluster_map',
        kind:             'cluster_expansion',
        title:            `Topic gap: no coverage for "${gap.cluster_name}"`,
        description:      gap.recommendation || `Competitors rank for queries in this cluster; the project has no hub page. ${gap.topic_summary}`,
        evidence:         {
          cluster_name:    gap.cluster_name,
          intent:          gap.primary_intent,
          queries_in_cluster: gap.queries.slice(0, 5).map(q => q.query),
          audit_run_id:    auditRunId,
        },
        estimatedValue:   gap.total_impressions > 200 ? 'high' : 'medium',
        estimatedEffort:  'medium',
        suggestedAction:  'new_campaign',
        suggestedCampaignKind: 'rank_for_keyword',
        suggestedKeyword: gap.queries[0]?.query || gap.cluster_name,
      });
    }

    /* Update panel recheck schedule */
    const { data: panelRow } = await db().from("seo_campaign_panels")
      .select("recheck_cadence_days").eq("id", panelId).maybeSingle();
    const cadence = (panelRow as any)?.recheck_cadence_days || 30;
    await db().from("seo_campaign_panels").update({
      last_assessed_at: new Date().toISOString(),
      next_recheck_at:  new Date(Date.now() + cadence * 86_400_000).toISOString(),
    }).eq("id", panelId);

    return {
      success: true,
      audit_run_id: auditRunId,
      cluster_count: withCoverage.length,
      gap_count: gapCount,
      report_id: reportR.report_id,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'cluster map failed' };
  }
}

/* ════════════════════════════════════════════════════════════════
   ASPIRATIONAL CLUSTER MAP
   Used when GSC has too little data for the campaign keyword.
   Generates a topical universe from competitors + LLM reasoning.
   Honestly labeled as aspirational — these are content gaps the
   site should fill, not coverage assessments of existing pages.
═══════════════════════════════════════════════════════════════ */

async function runAspirationalClusterMap(opts: {
  campaign:                any;
  panelId:                 string;
  triggeredBy:             'cron' | 'manual';
  totalGscQueries:         number;
  relatedCount:            number;
  projectActualTopQueries: GscQueryRow[];
  competitors:             any[];
  gscFreshnessAt?:         string | null;
}): Promise<{ success: boolean; audit_run_id?: string; cluster_count?: number; gap_count?: number; report_id?: string; error?: string }> {
  const c = opts.campaign;
  try {
    /* Build clusters from competitors + LLM. One LLM call total. */
    const aspirationalClusters = await buildAspirationalClusters({
      keyword:    c.keyword,
      competitors: opts.competitors,
    });

    if (aspirationalClusters.length === 0) {
      /* Even the LLM couldn't produce anything — honest pending report */
      const reportR = await writeReportToPanel({
        campaignId:       c.id,
        projectId:        c.project_id,
        pillar:           'cluster_map',
        panelId:          opts.panelId,
        reportKind:       opts.triggeredBy === 'cron' ? 'scheduled_recheck' : 'manual_refresh',
        generatedBy:      opts.triggeredBy,
        dataSources:      ['llm'],
        confidenceRating: 'low',
        confidenceReason: 'Could not generate a topical map. LLM returned no clusters.',
        title:            `Cluster map could not be generated for "${c.keyword}"`,
        bodyMd:           buildEmptyAspirationalReport(c.keyword, opts),
        summary:          'No clusters could be generated.',
        tags:             ['cluster_map', 'empty', `keyword:${c.keyword.toLowerCase()}`],
        updatePanelStatus: true,
        newPanelStatus:    'amber',
      });
      return { success: true, cluster_count: 0, gap_count: 0, report_id: reportR.report_id };
    }

    /* Persist clusters as gap-status entries */
    const auditRunId = crypto.randomUUID();
    const clusterRows = aspirationalClusters.map(cl => ({
      campaign_id:        c.id,
      panel_id:           opts.panelId,
      project_id:         c.project_id,
      cluster_name:       cl.cluster_name.slice(0, 240),
      primary_intent:     cl.primary_intent,
      topic_summary:      cl.topic_summary?.slice(0, 500) || null,
      queries:            cl.queries,
      query_count:        cl.queries.length,
      hub_page_url:       null,                       // aspirational — no hub exists yet
      spoke_pages:        [],
      total_clicks:       0,
      total_impressions:  0,
      avg_position:       0,
      coverage_status:    'gap',                      // all aspirational clusters are gaps
      recommendation:     cl.recommendation?.slice(0, 1000) || null,
      competitor_owners:  cl.competitor_owners || [], // Phase 16.0.2 — LLM-cited owners
      audit_run_id:       auditRunId,
    }));
    await db().from("cluster_map_clusters").insert(clusterRows);

    /* Write the report */
    const dataSources: string[] = ['llm'];
    if (opts.competitors.length > 0) dataSources.push('pipeline_research');

    const reportR = await writeReportToPanel({
      campaignId:       c.id,
      projectId:        c.project_id,
      pillar:           'cluster_map',
      panelId:          opts.panelId,
      reportKind:       opts.triggeredBy === 'cron' ? 'scheduled_recheck' : 'manual_refresh',
      generatedBy:      opts.triggeredBy,
      llmCallsUsed:     1,
      dataSources,
      confidenceRating: 'medium',
      confidenceReason: `Aspirational map: built from ${opts.competitors.length > 0 ? `${opts.competitors.length} competitor pages + ` : ''}LLM topical reasoning. No GSC grounding for "${c.keyword}". Confidence is medium because the universe shape is conventional; specific query examples are illustrative, not measured.`,
      title:            `Aspirational cluster map: "${c.keyword}" topical universe`,
      bodyMd:           renderAspirationalReport({
        keyword:                 c.keyword,
        clusters:                aspirationalClusters,
        competitors:             opts.competitors,
        totalGscQueries:         opts.totalGscQueries,
        relatedCount:            opts.relatedCount,
        projectActualTopQueries: opts.projectActualTopQueries,
        runId:                   auditRunId,
        gscUpdatedAt:            opts.gscFreshnessAt ?? null,
      }),
      summary:          `${aspirationalClusters.length} aspirational cluster${aspirationalClusters.length === 1 ? '' : 's'} mapped — no GSC presence yet on this topic.`,
      tags:             ['cluster_map', 'aspirational', `keyword:${c.keyword.toLowerCase()}`,
                         ...aspirationalClusters.slice(0, 8).map(cl => `cluster:${cl.cluster_name.toLowerCase().slice(0, 40)}`)],
      metricSnapshot:   {
        cluster_count: aspirationalClusters.length,
        gap_count:     aspirationalClusters.length,
        kind:          'aspirational',
        competitors_analyzed: opts.competitors.length,
      },
      updatePanelStatus: true,
      newPanelStatus:    'amber',                     // amber, not green — no actual coverage yet
    });

    /* Backfill report_id */
    if (reportR.report_id) {
      await db().from("cluster_map_clusters")
        .update({ report_id: reportR.report_id })
        .eq("audit_run_id", auditRunId);
    }

    /* Surface every aspirational cluster as a content roadmap opportunity */
    for (const cl of aspirationalClusters) {
      await recordOpportunity({
        projectId:        c.project_id,
        sourceKind:       'manual',
        sourceCampaignId: c.id,
        sourcePanelId:    opts.panelId,
        sourceStepId:     'cluster_map_aspirational',
        kind:             'content_gap',
        title:            `Content roadmap: build coverage for "${cl.cluster_name}"`,
        description:      cl.recommendation || `Aspirational cluster — competitors cover this topical area but project has no content yet. ${cl.topic_summary}`,
        evidence:         {
          cluster_name:        cl.cluster_name,
          intent:              cl.primary_intent,
          sample_queries:      cl.queries.slice(0, 5).map(q => q.query),
          audit_run_id:        auditRunId,
          aspirational:        true,
        },
        estimatedValue:   'high',
        estimatedEffort:  'medium',
        suggestedAction:  'investigate',
        suggestedKeyword: cl.queries[0]?.query || cl.cluster_name,
      });
    }

    /* Update panel recheck */
    const { data: panelRow } = await db().from("seo_campaign_panels")
      .select("recheck_cadence_days").eq("id", opts.panelId).maybeSingle();
    const cadence = (panelRow as any)?.recheck_cadence_days || 30;
    await db().from("seo_campaign_panels").update({
      last_assessed_at: new Date().toISOString(),
      next_recheck_at:  new Date(Date.now() + cadence * 86_400_000).toISOString(),
    }).eq("id", opts.panelId);

    return {
      success: true,
      audit_run_id:  auditRunId,
      cluster_count: aspirationalClusters.length,
      gap_count:     aspirationalClusters.length,
      report_id:     reportR.report_id,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'aspirational cluster map failed' };
  }
}

/* Build 4-6 aspirational clusters using LLM + optional competitor context. */
async function buildAspirationalClusters(opts: {
  keyword:     string;
  competitors: any[];
}): Promise<Cluster[]> {
  const competitorContext = opts.competitors.length > 0
    ? `Top competing pages for this keyword (from a prior rank pipeline):\n${opts.competitors.slice(0, 5).map((cp: any, i: number) => {
        const url = cp.url || cp.page || '(unknown url)';
        const title = cp.title || cp.angle || '';
        return `${i + 1}. ${url}${title ? ` — ${title}` : ''}`;
      }).join('\n')}`
    : `(No competitor data available for this campaign — base your clustering on topical reasoning alone.)`;

  const sys = `You are a senior SEO content strategist mapping the topical universe around the keyword "${opts.keyword}". The project has NO GSC ranking history for this topic yet — they're starting from zero.

Your job: produce 4-6 topical clusters that represent the full topical universe a competitive site would need to cover. These are CONTENT CATEGORIES, not individual page recommendations. Think hub-and-spoke: each cluster should be coherent enough that a single pillar page + 5-15 supporting articles could cover it.

For each cluster:
- cluster_name: 3-6 word clear topical name (NOT generic — name the actual user need)
- primary_intent: one of "informational" | "navigational" | "commercial" | "transactional" | "mixed"
- topic_summary: ONE sentence describing what users in this cluster are looking for
- sample_queries: 6-10 realistic queries users would search in this cluster (real search behavior, not made-up phrases)
- recommendation: 2-3 sentences. What content should the project build to win this cluster? Be specific about format (pillar page / comparison / guide / list / tool) and angle.
- competitor_owners: 2-5 domains (NOT full URLs — just domain names like "bubble.io", "adalo.com") that currently own or strongly compete in this cluster. Base these on the competitor pages provided AND your knowledge of who ranks for this topic class. If unsure, return [] — never invent.

Lead with the highest-leverage clusters (the ones most worth building first). Be honest about who owns the topical real estate today — that's critical context for the project to weigh effort vs upside.

Reply with ONLY valid JSON, no preamble:
{
  "clusters": [
    {
      "cluster_name": "...",
      "primary_intent": "...",
      "topic_summary": "...",
      "sample_queries": ["...", "..."],
      "recommendation": "...",
      "competitor_owners": ["domain1.com", "domain2.com"]
    }
  ]
}`;

  const user = `Campaign keyword: "${opts.keyword}"

${competitorContext}

Generate 4-6 aspirational topical clusters. Each cluster should be a content category the project should build coverage for.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  3500,
        system:      sys,
        messages:    [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = await res.json();
    const text = (data?.content?.[0]?.text || '').trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned);
    const llmClusters = Array.isArray(parsed?.clusters) ? parsed.clusters : [];

    /* Convert into our Cluster shape */
    return llmClusters.map((lc: any): Cluster => {
      const sampleQueries: string[] = Array.isArray(lc.sample_queries) ? lc.sample_queries : [];
      /* Fake GscQueryRow stubs for sample queries — values are 0 because we have no data */
      const queries: GscQueryRow[] = sampleQueries.slice(0, 12).map((q: any) => ({
        query:       String(q).slice(0, 200),
        clicks:      0,
        impressions: 0,
        ctr:         0,
        position:    0,
      }));
      /* Phase 16.0.2 — extract competitor_owners that the LLM cited as basis for this cluster */
      const ownersRaw: any = lc.competitor_owners || lc.competitors_owning_cluster || [];
      const competitor_owners: string[] = Array.isArray(ownersRaw)
        ? ownersRaw.filter((o: any) => typeof o === 'string').map((o: string) => o.trim().slice(0, 200)).slice(0, 8)
        : [];
      return {
        cluster_name:    String(lc.cluster_name || 'Unnamed cluster').slice(0, 200),
        primary_intent:  validateIntent(lc.primary_intent),
        topic_summary:   String(lc.topic_summary || '').slice(0, 500),
        queries,
        query_count:     queries.length,
        hub_page_url:    null,
        spoke_pages:     [],
        total_clicks:    0,
        total_impressions: 0,
        avg_position:    0,
        coverage_status: 'gap',
        recommendation:  String(lc.recommendation || '').slice(0, 1000),
        shared_tokens:   [],
        competitor_owners,
      };
    }).filter((cl: Cluster) => cl.cluster_name && cl.queries.length > 0);
  } catch (e: any) {
    console.log(`[buildAspirationalClusters] LLM failed: ${e?.message}`);
    return [];
  }
}

function buildEmptyAspirationalReport(keyword: string, opts: {
  totalGscQueries:         number;
  relatedCount:            number;
  projectActualTopQueries: GscQueryRow[];
  competitors:             any[];
}): string {
  const lines: string[] = [];
  lines.push(`# Cluster map could not be generated for "${keyword}"`);
  lines.push('');
  lines.push(`The system tried to produce an aspirational topical map for "${keyword}" but the LLM returned no clusters. This is rare — usually it means the keyword is ambiguous (could mean many things), too short, or returned a malformed response.`);
  lines.push('');
  lines.push(`## What I tried`);
  lines.push('');
  lines.push(`- **GSC data:** ${opts.totalGscQueries} project queries total, ${opts.relatedCount} semantically related to "${keyword}".`);
  lines.push(`- **Competitor data:** ${opts.competitors.length > 0 ? `${opts.competitors.length} competing pages from a prior rank pipeline` : 'none available — no rank pipeline has run for this campaign yet'}.`);
  lines.push(`- **LLM clustering:** attempted, returned 0 clusters.`);
  lines.push('');
  lines.push(`## What to try`);
  lines.push('');
  lines.push(`- Run \`rank me for "${keyword}"\` first if no rank pipeline has run. The competitor_snapshot step seeds the cluster map.`);
  lines.push(`- Make the keyword more specific. "${keyword}" may be too broad — try "${keyword} for [audience]" or "[adjective] ${keyword}".`);
  lines.push(`- Re-run after a few days. If it persists, share the keyword and I can investigate.`);
  return lines.join('\n');
}

function renderAspirationalReport(opts: {
  keyword:                 string;
  clusters:                Cluster[];
  competitors:             any[];
  totalGscQueries:         number;
  relatedCount:            number;
  projectActualTopQueries: GscQueryRow[];
  runId:                   string;
  gscUpdatedAt?:           string | null;
}): string {
  const { keyword, clusters, competitors, totalGscQueries, relatedCount, projectActualTopQueries } = opts;
  const lines: string[] = [];

  lines.push(`# Cluster map: "${keyword}"`);
  lines.push('');
  lines.push(`This report has two distinct sections. Read them as separate things, not as one fused conclusion:`);
  lines.push('');
  lines.push(`1. **Section 1 — Current state (empirical):** what GSC says about your actual presence on this topic. Hard data, no interpretation.`);
  lines.push(`2. **Section 2 — Aspirational roadmap (strategic projection):** what the topical universe looks like based on competitor coverage and topical reasoning. LLM-generated. Useful as a starting roadmap, not a finished plan.`);
  lines.push('');
  lines.push(`**Audit run id:** \`${opts.runId.slice(0, 8)}\` · **Generated at:** ${new Date().toISOString()}`);
  lines.push(formatGscFreshnessLine(opts.gscUpdatedAt ?? null));
  lines.push('');
  lines.push(`---`);
  lines.push('');

  /* ════════════════════════════════════════════════════════════
     SECTION 1 — CURRENT STATE (EMPIRICAL)
  ═══════════════════════════════════════════════════════════ */
  lines.push(`# Section 1 — Current state (empirical)`);
  lines.push('');
  lines.push(`**GSC queries semantically related to "${keyword}":** ${relatedCount} (out of ${totalGscQueries} total project queries)`);
  lines.push('');
  if (relatedCount === 0) {
    lines.push(`**Bottom line:** The project has **no measurable presence** on the "${keyword}" topic in GSC. The cluster map cannot be built from your data — there is no data on this topic to cluster.`);
  } else {
    lines.push(`**Bottom line:** The project has **${relatedCount} measurable queries** related to "${keyword}" — too few to form meaningful clusters, but not zero. The clusters below are still drawn from competitor analysis, not your data.`);
  }
  lines.push('');

  /* What the project IS ranking for */
  lines.push('## What the project currently ranks for');
  lines.push('');
  if (projectActualTopQueries.length === 0) {
    lines.push(`_No GSC query data available at all — either GSC isn't connected, or the project is brand new._`);
  } else {
    lines.push(`Top 10 queries by impressions (these are about other topics, not "${keyword}"):`);
    lines.push('');
    lines.push(`| Query | Position | Impressions | Clicks |`);
    lines.push(`|---|---:|---:|---:|`);
    for (const q of projectActualTopQueries.slice(0, 10)) {
      lines.push(`| ${q.query} | ${q.position.toFixed(1)} | ${q.impressions.toLocaleString()} | ${q.clicks.toLocaleString()} |`);
    }
    lines.push('');
    lines.push(`**Strategic question to weigh before acting on Section 2:** Does "${keyword}" align with the topical authority your site already has? If your existing presence is in a different topic class, ranking for "${keyword}" means building topical relevance from scratch — slower and harder than reinforcing what you already partially own.`);
  }
  lines.push('');
  lines.push(`---`);
  lines.push('');

  /* ════════════════════════════════════════════════════════════
     SECTION 2 — ASPIRATIONAL ROADMAP (STRATEGIC PROJECTION)
  ═══════════════════════════════════════════════════════════ */
  lines.push(`# Section 2 — Aspirational roadmap (strategic projection)`);
  lines.push('');
  lines.push(`> ⚠️ **These clusters are not measurements of your site.** They are LLM-generated content categories derived from competitor coverage + topical reasoning. The cluster names, sample queries, and recommendations were inferred from how the topical universe is structured competitively — they describe what content **should** exist to compete for "${keyword}", not what your site currently has. Treat as a starting roadmap; validate with keyword research tools before committing.`);
  lines.push('');
  lines.push(`**Competitor pages used as basis:** ${competitors.length}`);
  lines.push(`**Aspirational clusters generated:** ${clusters.length}`);
  lines.push('');

  /* Competitor reference */
  if (competitors.length > 0) {
    lines.push('## Competitor pages that informed this roadmap');
    lines.push('');
    lines.push(`These are the pages from your most recent rank pipeline's competitor_snapshot step. The aspirational clusters below are derived from analyzing how these pages divide up the topical universe.`);
    lines.push('');
    for (let i = 0; i < Math.min(competitors.length, 5); i++) {
      const cp = competitors[i] as any;
      const url = cp.url || cp.page || '';
      const title = cp.title || cp.angle || '';
      lines.push(`${i + 1}. ${url ? `[${title || url}](${url})` : title}${title && cp.angle && title !== cp.angle ? ` — _${cp.angle}_` : ''}`);
    }
    lines.push('');
  } else {
    lines.push('## How this roadmap was built');
    lines.push('');
    lines.push(`No competitor data was available for this campaign (run a rank pipeline first to capture competitors). The clusters below were generated from LLM topical reasoning alone, without grounding in specific competitor pages. Treat with extra caution — the clusters are reasonable categories but specific competitor-ownership claims aren't anchored to anything concrete.`);
    lines.push('');
  }

  /* The aspirational clusters themselves */
  lines.push(`## ${clusters.length} aspirational clusters — content roadmap`);
  lines.push('');
  lines.push(`Numbered by suggested priority (highest-leverage first). Each cluster is a content category, not a single page — think pillar page + 5-15 supporting articles to "own" a cluster.`);
  lines.push('');

  for (let i = 0; i < clusters.length; i++) {
    const cl = clusters[i];
    lines.push(`### ${i + 1}. ${cl.cluster_name}`);
    lines.push('');
    if (cl.topic_summary) lines.push(`_${cl.topic_summary}_`);
    lines.push('');
    lines.push(`**Intent:** ${cl.primary_intent} · **Status:** aspirational (no current coverage on your site)`);
    lines.push('');

    /* Phase 16.0.2 — source attribution per cluster */
    if (cl.competitor_owners && cl.competitor_owners.length > 0) {
      lines.push(`**This cluster is currently owned by:** ${cl.competitor_owners.map(d => `\`${d}\``).join(', ')}`);
      lines.push('');
      lines.push(`> **Source attribution:** This cluster's structure and naming was derived from analyzing how these domains organize coverage of the "${keyword}" topic. Credit for the topical real-estate division goes to them — your roadmap is to build a competitive alternative or carve out an underserved angle within this cluster.`);
      lines.push('');
    } else {
      lines.push(`**Cluster owners:** _LLM couldn't identify specific competitor domains with confidence. The cluster was generated from topical reasoning alone — verify the cluster exists by running a SERP search for the sample queries below._`);
      lines.push('');
    }

    if (cl.recommendation) {
      lines.push(`**Recommendation:** ${cl.recommendation}`);
      lines.push('');
    }
    if (cl.queries.length > 0) {
      lines.push(`**Sample queries** users would search in this cluster (LLM-proposed, not measured):`);
      lines.push('');
      for (const q of cl.queries.slice(0, 10)) {
        lines.push(`- ${q.query}`);
      }
      lines.push('');
    }
  }

  /* Methodology */
  lines.push(`---`);
  lines.push('');
  lines.push('## Methodology + caveats');
  lines.push('');
  lines.push(`**How Section 1 was built:** Direct GSC query data from project_knowledge. No interpretation.`);
  lines.push('');
  lines.push(`**How Section 2 was built:** One LLM call to a senior-strategist persona. Input: the campaign keyword + ${competitors.length > 0 ? `${competitors.length} competitor pages from the most recent rank pipeline` : 'no competitor data — pure topical reasoning'}. Output: 4-6 topical clusters, each with intent, topic_summary, sample queries, recommendation, and the LLM\'s best guess at which domains currently own the cluster.`);
  lines.push('');
  lines.push(`**Why competitor_owners are LLM-cited, not measured:** Running real SERPs per cluster would require an external SERP API or web search calls — significant cost increase. Currently the LLM is asked to cite domains it's confident own each cluster, with explicit instructions to return [] if unsure. Honest "[]" is better than invented domains.`);
  lines.push('');
  lines.push(`**Next steps:**`);
  lines.push(`1. Validate the highest-priority clusters with real keyword research (search volume, difficulty) before committing engineering/content effort`);
  lines.push(`2. For clusters with named competitor_owners, run a SERP check on 2-3 sample queries to verify those domains actually rank — confirms the LLM's call`);
  lines.push(`3. Each cluster has been auto-added to the Opportunities inbox — promote ones you want to pursue into their own campaigns`);
  lines.push(`4. Re-run this cluster map in 2-3 months after content launches — at that point GSC data will exist and Section 1 becomes a real coverage assessment`);
  lines.push('');
  lines.push(`**Limitations:** Sample queries are LLM-proposed, not measured volume. competitor_owners are LLM-cited based on the model's knowledge, not SERP-verified. Cluster prioritization is LLM judgment, not measured competition.`);

  return lines.join('\n');
}

export async function getPanelClusters(opts: {
  panelId: string;
  limit?:  number;
}): Promise<{ success: boolean; clusters?: any[]; error?: string }> {
  try {
    const { data } = await db().from("cluster_map_clusters")
      .select("*").eq("panel_id", opts.panelId)
      .order("total_impressions", { ascending: false })
      .limit(Math.min(opts.limit || 50, 200));
    return { success: true, clusters: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || 'list clusters failed' };
  }
}

/* ════════════════════════════════════════════════════════════════
   DATA FETCHERS
═══════════════════════════════════════════════════════════════ */

async function readGscQueries(projectId: string): Promise<GscQueryRow[]> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_value").eq("project_id", projectId)
      .eq("category", "analytics").eq("field_key", "gsc_top_queries").maybeSingle();
    const raw = (data as any)?.field_value;
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

async function readGscPages(projectId: string): Promise<GscPageRow[]> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_value").eq("project_id", projectId)
      .eq("category", "analytics").eq("field_key", "gsc_top_pages").maybeSingle();
    const raw = (data as any)?.field_value;
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

async function readGscFreshness(projectId: string): Promise<string | null> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("updated_at")
      .eq("project_id", projectId)
      .eq("category", "analytics")
      .eq("field_key", "gsc_top_queries")
      .maybeSingle();
    return (data as any)?.updated_at || null;
  } catch { return null; }
}

function formatGscFreshnessLine(updatedAt: string | null): string {
  if (!updatedAt) return `> ⚠️ **GSC data freshness unknown** — connect GSC in Data Room → Integrations to enable automatic daily pulls.`;
  try {
    const ageDays = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
    if (ageDays > 14) {
      return `> ⚠️ **GSC data is ${ageDays} days old** (last synced: ${updatedAt.slice(0, 10)}). These findings may be stale — refresh GSC in Data Room → Integrations.`;
    }
    return `**GSC data as of:** ${updatedAt.slice(0, 10)} (${ageDays === 0 ? 'today' : `${ageDays} day${ageDays === 1 ? '' : 's'} ago`})`;
  } catch { return ''; }
}

async function readCompetitorSnapshot(campaignId: string): Promise<any[]> {
  try {
    /* Find the most recent rank pipeline run for this campaign + read its
       competitor_snapshot step output */
    const { data: runs } = await db().from("season_pipeline_runs")
      .select("id").eq("campaign_id", campaignId)
      .order("started_at", { ascending: false }).limit(3);
    for (const run of (runs as any[] || [])) {
      const { data: step } = await db().from("season_pipeline_steps")
        .select("output").eq("run_id", run.id).eq("step_id", 'competitor_snapshot').maybeSingle();
      const output = (step as any)?.output;
      const pages = output?.top_pages;
      if (Array.isArray(pages) && pages.length > 0) return pages;
    }
    return [];
  } catch { return []; }
}

/* ════════════════════════════════════════════════════════════════
   CLUSTERING
═══════════════════════════════════════════════════════════════ */

const STOPWORDS = new Set([
  'a','an','the','of','to','in','on','for','and','or','is','are','be','was','were',
  'with','at','by','from','as','it','this','that','these','those','i','you','your',
  'my','me','we','our','us','their','its','they','them','he','she','his','her',
  'do','does','did','have','has','had','will','would','can','could','should',
  'how','what','when','where','why','which','who','about','vs','versus',
]);

function tokenize(s: string): string[] {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

/** Filter queries that share enough tokens with the keyword to be considered
 *  semantically related. Returns ranked by relevance + impressions. */
function filterRelatedQueries(queries: GscQueryRow[], keyword: string): GscQueryRow[] {
  const keywordTokens = new Set(tokenize(keyword));
  if (keywordTokens.size === 0) return queries.slice(0, 100);

  const scored = queries.map(q => {
    const qTokens = new Set(tokenize(q.query));
    let overlap = 0;
    for (const t of qTokens) if (keywordTokens.has(t)) overlap++;
    const overlapPct = keywordTokens.size > 0 ? overlap / keywordTokens.size : 0;
    return { ...q, _overlap: overlap, _overlapPct: overlapPct };
  });

  /* Keep queries with at least one keyword-token overlap OR where the query contains the full keyword. */
  const keywordLc = keyword.toLowerCase();
  const related = scored.filter(q =>
    q._overlap > 0 || q.query.toLowerCase().includes(keywordLc)
  );

  /* Sort by overlap percentage, then impressions */
  related.sort((a, b) => {
    if (b._overlapPct !== a._overlapPct) return b._overlapPct - a._overlapPct;
    return b.impressions - a.impressions;
  });

  /* Strip internal fields */
  return related.slice(0, 150).map(({ _overlap, _overlapPct, ...rest }) => rest as GscQueryRow);
}

/** Group related queries by token-overlap similarity. */
function lexicalClusters(queries: GscQueryRow[], keyword: string): {
  shared_tokens: string[];
  queries: GscQueryRow[];
}[] {
  if (queries.length === 0) return [];
  const keywordTokens = new Set(tokenize(keyword));

  /* Step A: for each query, compute its non-keyword tokens (the "differentiating" tokens) */
  const indexed = queries.map(q => {
    const tokens = tokenize(q.query);
    const differentiating = tokens.filter(t => !keywordTokens.has(t));
    return { query: q, all_tokens: new Set(tokens), differentiating };
  });

  /* Step B: cluster by shared differentiating token. Each token becomes a candidate cluster. */
  const tokenClusters: Record<string, GscQueryRow[]> = {};
  for (const item of indexed) {
    if (item.differentiating.length === 0) {
      /* Pure-keyword queries — bucket as "Core" */
      if (!tokenClusters['__core__']) tokenClusters['__core__'] = [];
      tokenClusters['__core__'].push(item.query);
      continue;
    }
    /* Use the rarest differentiating token to avoid stuffing everything under common tokens */
    const counts = item.differentiating.map(t => ({ t, c: indexed.filter(i => i.all_tokens.has(t)).length }));
    counts.sort((a, b) => a.c - b.c);
    const key = counts[0].t;
    if (!tokenClusters[key]) tokenClusters[key] = [];
    tokenClusters[key].push(item.query);
  }

  /* Step C: keep clusters with ≥2 queries; merge tiny ones into "Other" */
  const result: { shared_tokens: string[]; queries: GscQueryRow[] }[] = [];
  const otherQueries: GscQueryRow[] = [];
  for (const [token, qs] of Object.entries(tokenClusters)) {
    if (qs.length >= 2) {
      result.push({ shared_tokens: token === '__core__' ? ['core'] : [token], queries: qs });
    } else {
      otherQueries.push(...qs);
    }
  }
  if (otherQueries.length > 0) {
    result.push({ shared_tokens: ['various'], queries: otherQueries });
  }

  /* Sort clusters by total impressions */
  result.sort((a, b) => {
    const aImpr = a.queries.reduce((s, q) => s + q.impressions, 0);
    const bImpr = b.queries.reduce((s, q) => s + q.impressions, 0);
    return bImpr - aImpr;
  });

  /* Cap at 12 clusters — beyond that the report becomes unreadable */
  return result.slice(0, 12);
}

/* ════════════════════════════════════════════════════════════════
   LLM LABELING (one batched call)
═══════════════════════════════════════════════════════════════ */

async function labelAndLabelClusters(opts: {
  keyword: string;
  clusters: { shared_tokens: string[]; queries: GscQueryRow[] }[];
  competitorSummary: string;
}): Promise<Cluster[]> {
  /* Build a single prompt with all clusters; ask for naming + intent + recommendation. */
  if (opts.clusters.length === 0) return [];

  const clustersForPrompt = opts.clusters.map((cl, i) => ({
    cluster_id:     i,
    shared_tokens:  cl.shared_tokens,
    query_count:    cl.queries.length,
    total_impressions: cl.queries.reduce((s, q) => s + q.impressions, 0),
    avg_position:   cl.queries.reduce((s, q) => s + q.position, 0) / cl.queries.length,
    sample_queries: cl.queries.slice(0, 8).map(q => q.query),
  }));

  const sys = `You are a senior SEO content strategist. You are given a list of pre-clustered Google Search Console queries for a campaign targeting "${opts.keyword}". For each cluster, produce:
- cluster_name: 3-6 word clear topical name (NOT just the shared tokens — name the actual user need)
- primary_intent: one of "informational" | "navigational" | "commercial" | "transactional" | "mixed"
- topic_summary: ONE sentence describing what users in this cluster are looking for
- recommendation: 1-2 sentences. What should the site do about this cluster? Write a hub page? Refresh existing? Build supporting content? Be SPECIFIC.

Reply with ONLY valid JSON, no preamble:
{
  "clusters": [
    { "cluster_id": 0, "cluster_name": "...", "primary_intent": "...", "topic_summary": "...", "recommendation": "..." }
  ]
}`;

  const user = `Campaign keyword: "${opts.keyword}"

Competitor context: ${opts.competitorSummary}

Clusters to label:
${JSON.stringify(clustersForPrompt, null, 2)}`;

  let llmResult: any = null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        system: sys,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = await res.json();
    const text = (data?.content?.[0]?.text || '').trim();
    /* Strip markdown fences if present */
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    llmResult = JSON.parse(cleaned);
  } catch (e: any) {
    /* LLM failure — degrade to programmatic labels */
    return opts.clusters.map((cl, i) => ({
      cluster_name:    `Cluster: ${cl.shared_tokens.join(', ')}`,
      primary_intent:  'mixed',
      topic_summary:   `${cl.queries.length} queries sharing tokens: ${cl.shared_tokens.join(', ')}.`,
      queries:         cl.queries,
      query_count:     cl.queries.length,
      hub_page_url:    null,
      spoke_pages:     [],
      total_clicks:    cl.queries.reduce((s, q) => s + q.clicks, 0),
      total_impressions: cl.queries.reduce((s, q) => s + q.impressions, 0),
      avg_position:    cl.queries.reduce((s, q) => s + q.position, 0) / cl.queries.length,
      coverage_status: 'unknown',
      recommendation:  `(LLM labeling failed: ${e?.message || 'unknown'}. Review queries manually.)`,
      shared_tokens:   cl.shared_tokens,
      competitor_owners: [],
    }));
  }

  /* Merge LLM labels into raw cluster data */
  const merged: Cluster[] = opts.clusters.map((cl, i) => {
    const llmCl = (llmResult.clusters || []).find((c: any) => c.cluster_id === i)
                || (llmResult.clusters || [])[i]
                || {};
    return {
      cluster_name:    llmCl.cluster_name?.toString().slice(0, 200) || `Cluster ${i + 1}`,
      primary_intent:  validateIntent(llmCl.primary_intent),
      topic_summary:   llmCl.topic_summary?.toString().slice(0, 500) || '',
      queries:         cl.queries,
      query_count:     cl.queries.length,
      hub_page_url:    null,
      spoke_pages:     [],
      total_clicks:    cl.queries.reduce((s, q) => s + q.clicks, 0),
      total_impressions: cl.queries.reduce((s, q) => s + q.impressions, 0),
      avg_position:    Number((cl.queries.reduce((s, q) => s + q.position, 0) / cl.queries.length).toFixed(2)),
      coverage_status: 'unknown',
      recommendation:  llmCl.recommendation?.toString().slice(0, 1000) || '',
      shared_tokens:   cl.shared_tokens,
      competitor_owners: [],     // populated separately via enrichWithCompetitorOwnership
    };
  });

  return merged;
}

function validateIntent(raw: any): string {
  const valid = ['informational', 'navigational', 'commercial', 'transactional', 'mixed'];
  return valid.includes(String(raw).toLowerCase()) ? String(raw).toLowerCase() : 'mixed';
}

/* ════════════════════════════════════════════════════════════════
   HUB/SPOKE INFERENCE
═══════════════════════════════════════════════════════════════ */

function enrichWithPages(cluster: Cluster, pages: GscPageRow[]): Cluster {
  if (pages.length === 0) return cluster;

  const clusterTokens = new Set<string>();
  for (const q of cluster.queries) {
    tokenize(q.query).forEach(t => clusterTokens.add(t));
  }
  if (clusterTokens.size === 0) return cluster;

  /* Score each page by how many cluster tokens appear in its URL slug */
  const scored = pages.map(p => {
    const slug = (p.page || '').toLowerCase();
    let matches = 0;
    for (const t of clusterTokens) if (slug.includes(t)) matches++;
    return { page: p, score: matches };
  }).filter(s => s.score > 0).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.page.impressions || 0) - (a.page.impressions || 0);
  });

  if (scored.length === 0) return cluster;

  return {
    ...cluster,
    hub_page_url: scored[0].page.page,
    spoke_pages: scored.slice(1, 5).map(s => s.page.page),
  };
}

/* ════════════════════════════════════════════════════════════════
   COVERAGE ASSESSMENT
═══════════════════════════════════════════════════════════════ */

function assessCoverage(cluster: Cluster, competitorTokens: Set<string>): Cluster {
  const hasHub = !!cluster.hub_page_url;
  const hasGoodPosition = cluster.avg_position > 0 && cluster.avg_position <= 20;
  const hasStrongPosition = cluster.avg_position > 0 && cluster.avg_position <= 5;

  /* If competitor URLs contain cluster tokens but we don't have a hub, it's a gap */
  const clusterTokens = new Set(cluster.shared_tokens);
  const competitorOverlap = [...clusterTokens].some(t => competitorTokens.has(t));

  /* Phase 16.0.2 — competitor_owners is the per-cluster competitive map (populated
     by enrichWithCompetitorOwnership). If you have a hub AND decent position BUT
     3+ competitors own the cluster and your position is mid-pack (not top-3),
     you're "covered but losing." */
  const competitorOwnerCount = cluster.competitor_owners?.length || 0;
  const isDominated = competitorOwnerCount >= 3 && !hasStrongPosition;

  let status: 'covered' | 'partial' | 'partial_losing' | 'gap' | 'unknown' = 'unknown';
  if (hasHub && hasGoodPosition && isDominated)         status = 'partial_losing';
  else if (hasHub && hasGoodPosition)                   status = 'covered';
  else if (hasHub && !hasGoodPosition)                  status = 'partial';
  else if (!hasHub && competitorOverlap)                status = 'gap';
  else if (!hasHub)                                     status = 'partial';

  return { ...cluster, coverage_status: status };
}

/* ════════════════════════════════════════════════════════════════
   PER-CLUSTER COMPETITOR OWNERSHIP (Phase 16.0.2)

   For each actual cluster (already named + populated), ask the LLM
   which 3-5 domains currently own this cluster's topical real estate.
   Parallelized across all clusters. Honest "[]" if the LLM is unsure.
═══════════════════════════════════════════════════════════════ */

async function enrichWithCompetitorOwnership(
  clusters: Cluster[],
  campaignKeyword: string,
  competitors: any[],
): Promise<Cluster[]> {
  if (clusters.length === 0) return clusters;

  /* Build competitor context once (same for all clusters) */
  const competitorContext = competitors.length > 0
    ? competitors.slice(0, 5).map((cp: any, i: number) => {
        const url   = cp.url || cp.page || '';
        const title = cp.title || cp.angle || '';
        return `${i + 1}. ${url}${title ? ` — ${title}` : ''}`;
      }).join('\n')
    : '(no competitor data available for this campaign)';

  /* One LLM call per cluster, in parallel */
  const enriched = await Promise.all(clusters.map(async (cluster) => {
    try {
      const topQueries = [...cluster.queries].sort((a, b) => b.impressions - a.impressions).slice(0, 8);
      const sys = `You identify which domains own a topical cluster's search real estate. The user gives you a cluster (name + sample queries) for a campaign targeting "${campaignKeyword}". You return 3-5 domain names (NOT full URLs — just domains like "bubble.io", "adalo.com") that you believe currently rank well or dominate this specific cluster's queries.

Base your answer on:
- The competitor pages provided for the parent campaign
- Your knowledge of which sites typically rank for this query class
- The cluster's intent and topic

If you're not confident in specific domains for this cluster, return an empty array — never invent. Honest "[]" is better than guessing.

Reply with ONLY valid JSON:
{ "competitor_owners": ["domain1.com", "domain2.com", "domain3.com"] }`;

      const user = `Campaign keyword: "${campaignKeyword}"
Cluster name: "${cluster.cluster_name}"
Cluster intent: ${cluster.primary_intent}
Topic summary: ${cluster.topic_summary || '(none)'}

Top queries in this cluster (by impressions):
${topQueries.map(q => `- ${q.query} (pos ${q.position.toFixed(1)}, ${q.impressions} impr)`).join('\n')}

Parent campaign competitors (for context — these compete for the keyword broadly, NOT necessarily this specific cluster):
${competitorContext}

Which 3-5 domains own this specific cluster's topical real estate today?`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model:       MODEL,
          max_tokens:  300,
          system:      sys,
          messages:    [{ role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const text = (data?.content?.[0]?.text || '').trim();
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      const parsed = JSON.parse(cleaned);
      const ownersRaw = parsed?.competitor_owners;
      const owners: string[] = Array.isArray(ownersRaw)
        ? ownersRaw.filter((o: any) => typeof o === 'string').map((o: string) => o.trim().slice(0, 200)).slice(0, 8)
        : [];
      return { ...cluster, competitor_owners: owners };
    } catch (e: any) {
      /* Per-cluster failure — keep [], don't fail the whole map */
      console.log(`[enrichWithCompetitorOwnership] failed for "${cluster.cluster_name}": ${e?.message}`);
      return { ...cluster, competitor_owners: [] };
    }
  }));

  return enriched;
}

function extractCompetitorTopics(competitors: any[]): Set<string> {
  const tokens = new Set<string>();
  for (const c of competitors) {
    if (typeof c.url === 'string') {
      tokenize(c.url).forEach(t => tokens.add(t));
    }
    if (typeof c.title === 'string') {
      tokenize(c.title).forEach(t => tokens.add(t));
    }
    if (typeof c.angle === 'string') {
      tokenize(c.angle).forEach(t => tokens.add(t));
    }
  }
  return tokens;
}

function summarizeCompetitors(competitors: any[]): string {
  if (competitors.length === 0) return '(no competitor data available)';
  const top = competitors.slice(0, 5).map((c, i) => {
    const url = c.url || c.page || '';
    const angle = c.angle || c.title || '';
    return `${i + 1}. ${url}${angle ? ` — ${angle}` : ''}`;
  }).join('\n');
  return `Top ${Math.min(competitors.length, 5)} competitors:\n${top}`;
}

/* ════════════════════════════════════════════════════════════════
   FINDINGS + REPORT RENDERING
═══════════════════════════════════════════════════════════════ */

function computeFindings(clusters: Cluster[], keyword: string, totalGscQueries: number, relatedCount: number): ClusterFinding[] {
  const findings: ClusterFinding[] = [];

  /* ══════════════════════════════════════════════════════════════
     PHASE 16.0.4 — Senior DMS uplift findings (BANNER + quality)

     These come FIRST in the report because they answer the question a
     paying client opens the report to ask: "Where do I rank for my
     target keyword, and is the page that ranks the right one?"
  ══════════════════════════════════════════════════════════════ */

  /* Banner: where does the campaign keyword itself rank?
     Look across ALL clusters' queries for the best-matching position. */
  const allQueries = clusters.flatMap(c => c.queries);
  const kwPos = findCampaignKeywordPosition(allQueries, keyword);
  const sev   = campaignKeywordSeverity(kwPos.position);

  if (sev === 'absent') {
    findings.push({
      severity: 'red',
      title:    `Campaign keyword "${keyword}" has NO measurable ranking`,
      detail:   `The campaign keyword "${keyword}" did not appear in any of the ${relatedCount} GSC queries clustered for this campaign. The project may rank for related/adjacent terms, but NOT for the target keyword itself.\n\nThis means the current pages have no organic visibility for "${keyword}". Either the keyword is wrong for the site, or a dedicated landing page is needed.`,
      sources_used: ['gsc_queries'],
      confidence_score: 95,
    });
  } else if (sev === 'red_critical') {
    findings.push({
      severity: 'red',
      title:    `Campaign keyword "${keyword}" ranks at position ${kwPos.position!.toFixed(1)} (deep page rank)`,
      detail:   `Best match: "${kwPos.matched_query}" at position ${kwPos.position!.toFixed(1)} — beyond page 5 of Google. At this depth the page is effectively invisible to organic searchers. Match type: ${kwPos.match_strength}.\n\nThis cluster cannot be considered "covered" until the campaign keyword breaks into at least the top 20.`,
      sources_used: ['gsc_queries'],
      confidence_score: 95,
    });
  } else if (sev === 'red') {
    findings.push({
      severity: 'red',
      title:    `Campaign keyword "${keyword}" ranks at position ${kwPos.position!.toFixed(1)} (page 3-5)`,
      detail:   `Best match: "${kwPos.matched_query}" at position ${kwPos.position!.toFixed(1)}. Pages 3-5 receive less than 1% of organic clicks for most queries. The page may be indexed and topically relevant, but is not earning meaningful traffic for the target keyword. Match type: ${kwPos.match_strength}.\n\nGap to top 10: ${(kwPos.position! - 10).toFixed(0)} positions. Gap to top 3: ${(kwPos.position! - 3).toFixed(0)} positions.`,
      sources_used: ['gsc_queries'],
      confidence_score: 95,
    });
  } else if (sev === 'amber') {
    findings.push({
      severity: 'amber',
      title:    `Campaign keyword "${keyword}" ranks at position ${kwPos.position!.toFixed(1)}`,
      detail:   `Best match: "${kwPos.matched_query}" at position ${kwPos.position!.toFixed(1)}. ${kwPos.position! <= 10 ? 'Page 1, but not top 3 — measurable headroom exists.' : 'Page 2 — close to top-10 visibility but not yet capturing meaningful clicks.'} Match type: ${kwPos.match_strength}.`,
      sources_used: ['gsc_queries'],
      confidence_score: 95,
    });
  } else if (sev === 'green') {
    findings.push({
      severity: 'green',
      title:    `Campaign keyword "${keyword}" ranks in top 3 (position ${kwPos.position!.toFixed(1)})`,
      detail:   `Best match: "${kwPos.matched_query}" at position ${kwPos.position!.toFixed(1)}. Strong organic visibility — preserve the ranking page and look for cluster-expansion opportunities.`,
      sources_used: ['gsc_queries'],
      confidence_score: 95,
    });
  }

  /* Hub alignment findings — per cluster where the hub doesn't carry the keyword */
  const weakHubClusters    = clusters.filter(c => c.hub_alignment === 'weak' && c.hub_page_url);
  const partialHubClusters = clusters.filter(c => c.hub_alignment === 'partial');
  const noHubClusters      = clusters.filter(c => c.hub_alignment === 'no_hub');

  for (const cl of weakHubClusters) {
    findings.push({
      severity: 'red',
      title:    `Hub URL for cluster "${cl.cluster_name}" does NOT carry the keyword "${keyword}"`,
      detail:   `Inferred hub: ${cl.hub_page_url}\n\nThe URL slug contains no tokens from "${keyword}". The URL-slug heuristic has likely locked onto an adjacent-topic page rather than a real hub for this keyword. A Senior SEO Specialist would never trust this page as the hub.\n\nRecommendation: either (a) identify the correct hub page manually and update the campaign's target_url, or (b) accept that there is NO hub yet for "${keyword}" and treat this as a content gap.`,
      sources_used: ['gsc_pages_slug', 'gsc_queries'],
      confidence_score: 88,
    });
  }

  if (partialHubClusters.length > 0) {
    const names = partialHubClusters.slice(0, 3).map(c => `"${c.cluster_name}" → ${c.hub_page_url}`).join('; ');
    findings.push({
      severity: 'amber',
      title:    `${partialHubClusters.length} cluster${partialHubClusters.length === 1 ? '' : 's'} have hubs with only partial keyword alignment`,
      detail:   `Hub URL slugs contain some but not all keyword tokens. The page may rank for adjacent terms but not the campaign keyword itself.\n\n${names}\n\nRecommendation: verify each hub manually against the live SERP for the campaign keyword.`,
      sources_used: ['gsc_pages_slug', 'gsc_queries'],
      confidence_score: 80,
    });
  }

  for (const cl of noHubClusters) {
    findings.push({
      severity: 'amber',
      title:    `No hub identified for cluster "${cl.cluster_name}"`,
      detail:   `No GSC top_page slug overlapped with this cluster's tokens. The cluster represents a content gap — there is no page on the site that the URL-slug heuristic could associate with these queries.\n\nRecommendation: this is a candidate for new-content creation. If a page already exists that should rank, its URL slug doesn't reflect the topic — consider a rename or canonicalization.`,
      sources_used: ['gsc_queries'],
      confidence_score: 85,
    });
  }

  /* Cohesion findings — over-aggregated clusters */
  const overAggregated = clusters.filter(c =>
    typeof c.cohesion_position_spread === 'number' &&
    c.cohesion_position_spread > 20 &&
    c.queries.length >= 3,
  );
  for (const cl of overAggregated) {
    const positions = cl.queries
      .filter(q => q.impressions >= 5 && q.position > 0)
      .map(q => `"${q.query}" at ${q.position.toFixed(1)}`)
      .slice(0, 4)
      .join(', ');
    findings.push({
      severity: 'amber',
      title:    `Cluster "${cl.cluster_name}" is over-aggregated (position spread ${cl.cohesion_position_spread!.toFixed(0)})`,
      detail:   `Queries within this cluster span ${cl.cohesion_position_spread!.toFixed(0)} ranks (>20 = significant spread). This usually means the lexical clustering grouped queries that share tokens but actually have different SERPs and intents.\n\nExamples: ${positions}.\n\nRecommendation: these queries likely warrant separate hubs or pages. Manual review of the SERP for each query will confirm.`,
      sources_used: ['gsc_queries', 'llm_naming'],
      confidence_score: 85,
    });
  }

  /* Thin-cluster honesty */
  const thinClusters = clusters.filter(c => c.is_thin);
  if (thinClusters.length > 0) {
    const examples = thinClusters.slice(0, 3).map(c => `"${c.cluster_name}" (${c.query_count} queries, ${c.total_impressions.toLocaleString()} impressions)`).join('; ');
    findings.push({
      severity: 'amber',
      title:    `${thinClusters.length} cluster${thinClusters.length === 1 ? '' : 's'} built on thin data — low confidence`,
      detail:   `Clusters with fewer than 5 queries OR fewer than 500 impressions are statistically thin. The analysis is directional, not definitive.\n\n${examples}\n\nA Senior SEO Specialist would validate these manually via live SERP checks before acting. As GSC accumulates more data over time, these clusters should be re-run.`,
      sources_used: ['gsc_queries'],
      confidence_score: 95,  /* the thinness observation itself is high-confidence */
    });
  }

  /* ══════════════════════════════════════════════════════════════
     Pre-existing findings (gap / partial_losing / partial / covered)
  ══════════════════════════════════════════════════════════════ */

  const gapCount           = clusters.filter(c => c.coverage_status === 'gap').length;
  const partialCount       = clusters.filter(c => c.coverage_status === 'partial').length;
  const partialLosingCount = clusters.filter(c => c.coverage_status === 'partial_losing').length;
  const coveredCount       = clusters.filter(c => c.coverage_status === 'covered').length;

  if (gapCount > 0) {
    findings.push({
      severity: 'amber',
      title:    `${gapCount} gap cluster${gapCount === 1 ? '' : 's'} detected`,
      detail:   `Competitors rank for queries in ${gapCount} cluster${gapCount === 1 ? '' : 's'} where this project has no hub page. Each becomes a content opportunity.`,
    });
  }

  /* Phase 16.0.2 — partial_losing finding (the big new one) */
  if (partialLosingCount > 0) {
    const losingClusters = clusters
      .filter(c => c.coverage_status === 'partial_losing')
      .map(c => `"${c.cluster_name}" (owned by ${c.competitor_owners.slice(0, 3).join(', ')})`)
      .join('; ');
    findings.push({
      severity: 'amber',
      title:    `${partialLosingCount} cluster${partialLosingCount === 1 ? '' : 's'} where you have a hub but are losing competitively`,
      detail:   `${partialLosingCount === 1 ? 'This cluster has' : 'These clusters have'} hub pages on your site BUT 3+ competitor domains dominate the topical real estate and your average position isn't top-3. Strategic decision: ${losingClusters}. Either invest hard (links, depth, freshness) to beat them, or accept the position and reallocate effort to gap clusters where you can establish first-mover advantage.`,
    });
  }

  if (partialCount > 0) {
    findings.push({
      severity: 'info',
      title:    `${partialCount} cluster${partialCount === 1 ? '' : 's'} with weak coverage`,
      detail:   `Project ranks for queries in these clusters but the hub isn't clear or position is poor. Could be cannibalization or thin content.`,
    });
  }

  if (coveredCount > 0) {
    findings.push({
      severity: 'green',
      title:    `${coveredCount} cluster${coveredCount === 1 ? '' : 's'} well-covered`,
      detail:   `These clusters have a clear hub page ranking on page 1-2, and no significant competitor dominance was detected.`,
    });
  }

  if (relatedCount < totalGscQueries * 0.1 && totalGscQueries > 50) {
    findings.push({
      severity: 'info',
      title:    `Topic is a small slice of overall site traffic`,
      detail:   `Only ${relatedCount} of ${totalGscQueries} GSC queries (${Math.round(relatedCount * 100 / totalGscQueries)}%) are related to "${keyword}". The site's main topical focus is elsewhere.`,
    });
  }

  /* Check for cannibalization — multiple clusters claiming the same hub URL */
  const hubCounts: Record<string, string[]> = {};
  for (const c of clusters) {
    if (!c.hub_page_url) continue;
    if (!hubCounts[c.hub_page_url]) hubCounts[c.hub_page_url] = [];
    hubCounts[c.hub_page_url].push(c.cluster_name);
  }
  for (const [url, clusterNames] of Object.entries(hubCounts)) {
    if (clusterNames.length >= 2) {
      findings.push({
        severity: 'amber',
        title:    `Possible cannibalization: ${url}`,
        detail:   `This URL is the inferred hub for ${clusterNames.length} different clusters: ${clusterNames.join(', ')}. Either the page covers too many topics (split it) or our cluster inference grouped imperfectly.`,
      });
    }
  }

  return findings;
}

function buildHeadline(clusters: Cluster[]): string {
  const gap           = clusters.filter(c => c.coverage_status === 'gap').length;
  const partialLosing = clusters.filter(c => c.coverage_status === 'partial_losing').length;
  const partial       = clusters.filter(c => c.coverage_status === 'partial').length;
  const covered       = clusters.filter(c => c.coverage_status === 'covered').length;
  const losingBit = partialLosing > 0 ? `, ${partialLosing} losing` : '';
  return `${clusters.length} cluster${clusters.length === 1 ? '' : 's'} mapped — ${covered} covered${losingBit}, ${partial} partial, ${gap} gap${gap === 1 ? '' : 's'}.`;
}

function renderClusterMapReport(opts: {
  keyword: string;
  clusters: Cluster[];
  findings: ClusterFinding[];
  totalQueries: number;
  relatedCount: number;
  competitorsAnalyzed: number;
  runId: string;
  gscUpdatedAt?: string | null;
}): string {
  const { keyword, clusters, findings } = opts;
  const lines: string[] = [];

  lines.push(`# Cluster map: "${keyword}"`);
  lines.push('');
  lines.push(`**Campaign keyword:** "${keyword}"  `);
  lines.push(`**GSC queries analyzed:** ${opts.relatedCount} (filtered from ${opts.totalQueries} total project queries)  `);
  lines.push(`**Clusters identified:** ${clusters.length}  `);
  lines.push(`**Competitor pages analyzed:** ${opts.competitorsAnalyzed}  `);
  lines.push(`**Audit run id:** \`${opts.runId.slice(0, 8)}\`  `);
  lines.push(`**Generated at:** ${new Date().toISOString()}`);
  lines.push(formatGscFreshnessLine(opts.gscUpdatedAt ?? null));
  lines.push('');

  /* Summary */
  lines.push('## Summary');
  lines.push('');
  const covered       = clusters.filter(c => c.coverage_status === 'covered').length;
  const partial       = clusters.filter(c => c.coverage_status === 'partial').length;
  const partialLosing = clusters.filter(c => c.coverage_status === 'partial_losing').length;
  const gap           = clusters.filter(c => c.coverage_status === 'gap').length;
  const unknown       = clusters.filter(c => c.coverage_status === 'unknown').length;
  lines.push(`| Coverage | Count | Meaning |`);
  lines.push(`|---|---|---|`);
  lines.push(`| 🟢 Covered | ${covered} | Clear hub, decent position, no significant competitor dominance |`);
  lines.push(`| 🟠 Partial-losing | ${partialLosing} | You have a hub BUT competitors dominate the cluster |`);
  lines.push(`| 🟡 Partial | ${partial} | Hub unclear or position weak |`);
  lines.push(`| 🔴 Gap | ${gap} | No hub, competitors rank |`);
  lines.push(`| ❔ Unknown | ${unknown} | Insufficient data to assess |`);
  lines.push('');

  /* Source confidence — surface upfront so the reader calibrates trust
     BEFORE reading findings or cluster recommendations. */
  const conf = weightedClusterConfidence(clusters);
  lines.push('## Source confidence');
  lines.push('');
  if (conf.sourced_count > 0) {
    lines.push(`**Weighted confidence:** ${conf.mean}/100 across ${conf.sourced_count} cluster(s).`);
    /* Aggregate which sources appeared, and how often */
    const sourceCounts: Record<string, number> = {};
    for (const cl of clusters) {
      for (const k of cl.sources_used || []) {
        const lbl = CLUSTER_SOURCE_META[k].label;
        sourceCounts[lbl] = (sourceCounts[lbl] || 0) + 1;
      }
    }
    const sourceList = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => `${label} (${count} clusters)`)
      .join(', ');
    lines.push(`**Sources used:** ${sourceList}.`);
    lines.push('');
    lines.push('Cluster identities are GSC-anchored (live query data, confidence 95). Names and recommendations are Claude-derived (confidence 65). Hub/spoke inference uses a URL-slug heuristic (confidence 80) — see Methodology below.');
  } else {
    lines.push('**No source attribution available.** Confidence treated as low — investigate before acting.');
  }
  if (conf.unattributed_count > 0) {
    lines.push('');
    lines.push(`⚠️ ${conf.unattributed_count} cluster(s) lack source attribution. Excluded from the confidence calculation.`);
  }
  lines.push('');

  /* Findings */
  if (findings.length > 0) {
    lines.push('## Findings');
    lines.push('');
    for (const f of findings) {
      const icon = f.severity === 'red' ? '🔴' : f.severity === 'amber' ? '🟡' : f.severity === 'green' ? '🟢' : 'ℹ️';
      lines.push(`### ${icon} ${f.title}`);
      lines.push(f.detail);
      lines.push('');
    }
  }

  /* Clusters — order: gap → partial_losing → partial → covered → unknown */
  const order = ['gap', 'partial_losing', 'partial', 'covered', 'unknown'];
  const sorted = [...clusters].sort((a, b) => {
    const oa = order.indexOf(a.coverage_status);
    const ob = order.indexOf(b.coverage_status);
    if (oa !== ob) return oa - ob;
    return b.total_impressions - a.total_impressions;
  });

  lines.push('## Clusters');
  lines.push('');
  for (const cl of sorted) {
    const icon = cl.coverage_status === 'covered'        ? '🟢'
              : cl.coverage_status === 'partial_losing'  ? '🟠'
              : cl.coverage_status === 'partial'         ? '🟡'
              : cl.coverage_status === 'gap'             ? '🔴' : '❔';
    lines.push(`### ${icon} ${cl.cluster_name}`);
    lines.push('');
    if (cl.topic_summary) lines.push(`_${cl.topic_summary}_`);
    lines.push('');
    lines.push(`**Coverage status:** ${cl.coverage_status} · **Intent:** ${cl.primary_intent} · **Queries:** ${cl.query_count} · **Impressions:** ${cl.total_impressions.toLocaleString()} · **Clicks:** ${cl.total_clicks.toLocaleString()} · **Avg position:** ${cl.avg_position.toFixed(1)}`);
    if (typeof cl.confidence_score === 'number' && cl.sources_used && cl.sources_used.length > 0) {
      const labels = cl.sources_used.map(k => CLUSTER_SOURCE_META[k].label).join(' + ');
      lines.push(`*Sources · ${labels} · weighted confidence ${cl.confidence_score}/100*`);
    }
    lines.push('');

    /* Phase 16.0.4 — Senior DMS quality summary line per cluster.
       Shows the consequential signals a senior practitioner reads first:
       where the campaign keyword itself ranks, whether the hub is
       keyword-aligned, position spread, and thin-data warning. */
    const qualityBits: string[] = [];
    if (cl.campaign_keyword_position !== null && typeof cl.campaign_keyword_position === 'number') {
      const pos = cl.campaign_keyword_position;
      const posIcon = pos <= 3 ? '🟢' : pos <= 10 ? '🟡' : pos <= 20 ? '🟡' : '🔴';
      qualityBits.push(`${posIcon} Campaign kw "${keyword}" at position ${pos.toFixed(1)}`);
    } else if (cl.campaign_keyword_position === null) {
      qualityBits.push(`🔴 Campaign kw "${keyword}" not in this cluster's queries`);
    }
    if (cl.hub_alignment) {
      const hubIcon = cl.hub_alignment === 'strong'  ? '🟢'
                   : cl.hub_alignment === 'partial' ? '🟡'
                   : cl.hub_alignment === 'weak'    ? '🔴' : '🔴';
      const hubLabel = cl.hub_alignment === 'strong'  ? 'hub carries keyword'
                    : cl.hub_alignment === 'partial' ? 'hub partial keyword'
                    : cl.hub_alignment === 'weak'    ? 'hub does NOT carry keyword'
                                                     : 'no hub';
      qualityBits.push(`${hubIcon} ${hubLabel}`);
    }
    if (typeof cl.cohesion_position_spread === 'number' && cl.cohesion_position_spread > 20) {
      qualityBits.push(`🟡 over-aggregated (spread ${cl.cohesion_position_spread.toFixed(0)})`);
    }
    if (cl.is_thin) {
      qualityBits.push(`🟡 thin data (${cl.query_count} queries, ${cl.total_impressions} impr)`);
    }
    if (qualityBits.length > 0) {
      lines.push(`**Quality signals:** ${qualityBits.join(' · ')}`);
      lines.push('');
    }

    if (cl.hub_page_url) {
      lines.push(`**Inferred hub:** [${cl.hub_page_url}](${cl.hub_page_url})`);
      if (cl.hub_alignment === 'weak') {
        lines.push('');
        lines.push(`⚠️ This URL slug does NOT contain tokens from "${keyword}". The URL-slug heuristic has likely picked an adjacent-topic page rather than a real hub for this keyword. Treat as unreliable.`);
      } else if (cl.hub_alignment === 'partial') {
        lines.push('');
        lines.push(`⚠️ This URL slug contains some but not all tokens of "${keyword}". May rank for adjacent terms rather than the campaign keyword itself. Verify against the live SERP.`);
      }
    } else {
      lines.push(`**Inferred hub:** _none found — this cluster has no page on the site whose URL slug overlaps with its tokens. Likely a content gap._`);
    }
    if (cl.spoke_pages && cl.spoke_pages.length > 0) {
      lines.push('');
      lines.push(`**Spoke pages:**`);
      for (const sp of cl.spoke_pages) lines.push(`- [${sp}](${sp})`);
    }

    /* Phase 16.0.2 — competitor ownership prominently shown */
    if (cl.competitor_owners && cl.competitor_owners.length > 0) {
      lines.push('');
      lines.push(`**Domains currently owning this cluster:** ${cl.competitor_owners.map(d => `\`${d}\``).join(', ')}`);
      if (cl.coverage_status === 'partial_losing') {
        lines.push('');
        lines.push(`⚠️ **You have a hub for this cluster, but ${cl.competitor_owners.length} competitors dominate it.** Beating them requires either dramatically better content, link equity, or a niche-down angle. Consider whether the effort is worth it vs investing in gap clusters where you can establish first-mover advantage.`);
      }
    } else {
      lines.push('');
      lines.push(`**Domains owning this cluster:** _LLM couldn't identify with confidence — investigate manually via SERP check. Without competitive evidence, "coverage" claims should be treated as provisional._`);
    }

    /* Phase 16.0.4 — recommendation now incorporates actual data signals,
       not generic platitudes. If the LLM-generated recommendation refers
       to "the primary keyword landing page" but no such page exists (weak
       hub), prepend a correction. */
    const overrideBits: string[] = [];
    if (cl.hub_alignment === 'weak' && cl.hub_page_url) {
      overrideBits.push(`**First fix the hub.** The inferred hub (${cl.hub_page_url}) does not carry "${keyword}" in its URL. Either identify the correct hub manually, or build a dedicated landing page for "${keyword}" before pursuing the deeper recommendation below.`);
    }
    if (cl.campaign_keyword_position !== null && cl.campaign_keyword_position !== undefined && cl.campaign_keyword_position > 20) {
      overrideBits.push(`**Reality check on "covered" status.** "${keyword}" itself ranks at position ${cl.campaign_keyword_position.toFixed(1)} — significant gap to top 10. The LLM-generated recommendation below treats the page as a coverage starting point; in practice, more foundational work (title/H1/content alignment) is required first.`);
    }
    if (cl.is_thin) {
      overrideBits.push(`**Thin-data caveat.** This cluster is built from only ${cl.query_count} queries / ${cl.total_impressions.toLocaleString()} impressions. The recommendation below is directional, not definitive — validate via manual SERP check before committing resources.`);
    }
    if (overrideBits.length > 0) {
      lines.push('');
      for (const bit of overrideBits) lines.push(`> ${bit}`);
    }

    if (cl.recommendation) {
      lines.push('');
      lines.push(`**Recommendation (LLM-generated):** ${cl.recommendation}`);
    }
    lines.push('');
    lines.push(`**Sample queries** (top ${Math.min(10, cl.queries.length)} by impressions):`);
    const top = [...cl.queries].sort((a, b) => b.impressions - a.impressions).slice(0, 10);
    lines.push('');
    lines.push(`| Query | Position | Impressions | Clicks |`);
    lines.push(`|---|---:|---:|---:|`);
    for (const q of top) {
      lines.push(`| ${q.query} | ${q.position.toFixed(1)} | ${q.impressions.toLocaleString()} | ${q.clicks.toLocaleString()} |`);
    }
    lines.push('');
  }

  /* Honest scope */
  lines.push('## Methodology + caveats');
  lines.push('');
  lines.push('**How clusters were formed:** Lexical similarity (shared non-stopword, non-keyword tokens) on GSC queries semantically related to the campaign keyword. Clusters were LLM-labeled with names, intents, and recommendations in a single batched API call.');
  lines.push('');
  lines.push('**How competitor ownership was identified:** One LLM call per cluster, asking which domains own this specific cluster\'s topical real estate. Based on competitor_snapshot data + LLM\'s knowledge of common ranking patterns. If unsure, the LLM returns an empty list rather than inventing domains.');
  lines.push('');
  lines.push('**How hub/spoke was inferred:** URL-slug token matching against GSC top_pages. This is a heuristic — GSC does not expose query→page mapping at scale. If a cluster\'s queries don\'t match any URL token, hub will be null.');
  lines.push('');
  lines.push('**How `partial_losing` is detected:** Cluster has a hub AND decent average position, BUT 3+ competitor domains were identified for the cluster AND your average position isn\'t top-3. This means you\'re technically covered but losing the cluster competitively. Worth surfacing because it\'s a strategic decision point: invest more here, or pivot to gap clusters where you can dominate.');
  lines.push('');
  lines.push('**Phase 16.0.4 — Senior DMS quality checks (2026-05-24):**');
  lines.push('');
  lines.push('- **Campaign keyword position banner:** scans cluster queries for the campaign keyword (exact > full > partial match) and surfaces its ranking position as the lead finding. Severity by rank: 1-3 green, 4-20 amber, 21-50 red, >50 red-critical, absent red.');
  lines.push('- **Hub alignment check:** verifies the inferred hub URL slug carries the campaign keyword tokens. A hub URL that ranks for adjacent terms but does not contain the keyword cannot be trusted as a real hub.');
  lines.push('- **Coverage downgrade rules:** a cluster cannot be `covered` if (a) the campaign keyword itself ranks below position 20, (b) the hub does not carry the keyword (weak alignment), or (c) the cluster is thin (<5 queries OR <500 impressions). These downgrades prevent synthesis-as-fact verdicts.');
  lines.push('- **Cluster cohesion:** position spread (max − min) within a cluster. Spread > 20 ranks flags over-aggregation — different SERPs / different intents grouped together because their tokens overlapped.');
  lines.push('- **Thin-cluster honesty:** clusters with <5 queries OR <500 impressions are marked thin and have their confidence capped at 60. The recommendation is treated as directional, not definitive.');
  lines.push('');
  lines.push('**Not yet covered:** Real SERP fetch per cluster (currently competitor_owners is LLM-cited, not measured), semantic similarity via embeddings, project-wide cluster maps across campaigns, automatic content-roadmap generation as kanban tasks, visual graph rendering, intent classification per query (informational / commercial / navigational / transactional) to flag over-aggregation by intent mismatch.');

  return lines.join('\n');
}
