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
  coverage_status:  'covered' | 'partial' | 'gap' | 'unknown';
  recommendation:   string;
  shared_tokens:    string[];          // tokens that defined this cluster
}

interface ClusterFinding {
  severity: 'green' | 'amber' | 'red' | 'info';
  title:    string;
  detail:   string;
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
    const [queries, pages, competitors] = await Promise.all([
      readGscQueries(c.project_id),
      readGscPages(c.project_id),
      readCompetitorSnapshot(opts.campaignId),
    ]);

    if (queries.length === 0) {
      await writeReportToPanel({
        campaignId:       opts.campaignId,
        projectId:        c.project_id,
        pillar:           'cluster_map',
        panelId,
        reportKind:       triggeredBy === 'cron' ? 'scheduled_recheck' : 'manual_refresh',
        generatedBy:      triggeredBy,
        dataSources:      [],
        confidenceRating: 'low',
        confidenceReason: 'No GSC query data available — cluster map needs query history.',
        title:            `Cluster map pending — no GSC data`,
        bodyMd:           `# Cluster map pending\n\nNo GSC query data is available for this project yet.\n\nConnect GSC in **Data Room → Integrations**, then re-run the cluster map. The pillar needs query-impression data to identify topical clusters.\n\nNothing else has been mapped.`,
        summary:          'Awaiting GSC data.',
        tags:             ['cluster_map', 'pending', 'no_gsc'],
        updatePanelStatus: true,
        newPanelStatus:    'amber',
      });
      return { success: true, cluster_count: 0, gap_count: 0 };
    }

    /* 2. Filter to keyword-related queries */
    const relatedQueries = filterRelatedQueries(queries, c.keyword);

    if (relatedQueries.length < 3) {
      await writeReportToPanel({
        campaignId:       opts.campaignId,
        projectId:        c.project_id,
        pillar:           'cluster_map',
        panelId,
        reportKind:       triggeredBy === 'cron' ? 'scheduled_recheck' : 'manual_refresh',
        generatedBy:      triggeredBy,
        dataSources:      ['gsc'],
        confidenceRating: 'low',
        confidenceReason: `Only ${relatedQueries.length} queries semantically related to "${c.keyword}" — too few to cluster meaningfully.`,
        title:            `Cluster map sparse — limited GSC presence`,
        bodyMd:           `# Cluster map sparse for "${c.keyword}"\n\nFound only **${relatedQueries.length} GSC queries** semantically related to "${c.keyword}" out of ${queries.length} total project queries.\n\nThis means one of:\n\n- Project hasn't yet ranked for this topic universe\n- Topic is too niche for meaningful clustering\n- GSC data window is too short\n\nThe cluster map will become more useful after the campaign produces content that starts ranking. Re-run in a few weeks once new pages have impression history.\n\n## Related queries found (${relatedQueries.length})\n\n${relatedQueries.map(q => `- **${q.query}** — pos ${q.position.toFixed(1)}, ${q.impressions} impr, ${q.clicks} clicks`).join('\n')}`,
        summary:          `Only ${relatedQueries.length} related queries — sparse.`,
        tags:             ['cluster_map', 'sparse', `keyword:${c.keyword.toLowerCase()}`],
        updatePanelStatus: true,
        newPanelStatus:    'amber',
      });
      return { success: true, cluster_count: 0, gap_count: 0 };
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

    /* 6. Gap detection */
    const competitorTopics = extractCompetitorTopics(competitors);
    const withCoverage = enriched.map(cluster => assessCoverage(cluster, competitorTopics));

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
        audit_run_id:       auditRunId,
      }));
      await db().from("cluster_map_clusters").insert(clusterRows);
    }

    const findings = computeFindings(withCoverage, c.keyword, queries.length, relatedQueries.length);
    const gapCount = withCoverage.filter(cl => cl.coverage_status === 'gap').length;
    const partialCount = withCoverage.filter(cl => cl.coverage_status === 'partial').length;

    const reportR = await writeReportToPanel({
      campaignId:       opts.campaignId,
      projectId:        c.project_id,
      pillar:           'cluster_map',
      panelId,
      reportKind:       triggeredBy === 'cron' ? 'scheduled_recheck' : 'manual_refresh',
      generatedBy:      triggeredBy,
      llmCallsUsed:     1,
      dataSources:      ['gsc', 'llm', ...(competitors.length > 0 ? ['pipeline_research' as const] : [])],
      confidenceRating: gapCount > 0 || partialCount > 0 ? 'high' : 'medium',
      confidenceReason: `Clustered ${relatedQueries.length} GSC queries into ${withCoverage.length} clusters. Hub/spoke inference uses URL-slug heuristic (GSC doesn't expose query-page mapping at scale).`,
      title:            `Cluster map: ${withCoverage.length} clusters for "${c.keyword}"`,
      bodyMd:           renderClusterMapReport({
        keyword: c.keyword, clusters: withCoverage, findings,
        totalQueries: queries.length, relatedCount: relatedQueries.length,
        competitorsAnalyzed: competitors.length, runId: auditRunId,
      }),
      summary:          buildHeadline(withCoverage),
      tags:             ['cluster_map', `keyword:${c.keyword.toLowerCase()}`,
                         ...(gapCount > 0 ? [`gaps:${gapCount}`] : []),
                         ...withCoverage.slice(0, 8).map(cl => `cluster:${cl.cluster_name.toLowerCase().slice(0, 40)}`)],
      metricSnapshot:   {
        cluster_count: withCoverage.length,
        gap_count: gapCount,
        partial_count: partialCount,
        covered_count: withCoverage.filter(cl => cl.coverage_status === 'covered').length,
      },
      updatePanelStatus: true,
      newPanelStatus:    gapCount > 0 ? 'amber' : 'green',
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

  /* If competitor URLs contain cluster tokens but we don't have a hub, it's a gap */
  const clusterTokens = new Set(cluster.shared_tokens);
  const competitorOverlap = [...clusterTokens].some(t => competitorTokens.has(t));

  let status: 'covered' | 'partial' | 'gap' | 'unknown' = 'unknown';
  if (hasHub && hasGoodPosition) status = 'covered';
  else if (hasHub && !hasGoodPosition) status = 'partial';
  else if (!hasHub && competitorOverlap) status = 'gap';
  else if (!hasHub) status = 'partial';

  return { ...cluster, coverage_status: status };
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

  const gapCount = clusters.filter(c => c.coverage_status === 'gap').length;
  const partialCount = clusters.filter(c => c.coverage_status === 'partial').length;
  const coveredCount = clusters.filter(c => c.coverage_status === 'covered').length;

  if (gapCount > 0) {
    findings.push({
      severity: 'amber',
      title:    `${gapCount} gap cluster${gapCount === 1 ? '' : 's'} detected`,
      detail:   `Competitors rank for queries in ${gapCount} cluster${gapCount === 1 ? '' : 's'} where this project has no hub page. Each becomes a content opportunity.`,
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
      detail:   `These clusters have a clear hub page ranking on page 1-2.`,
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
  const gap = clusters.filter(c => c.coverage_status === 'gap').length;
  const partial = clusters.filter(c => c.coverage_status === 'partial').length;
  const covered = clusters.filter(c => c.coverage_status === 'covered').length;
  return `${clusters.length} cluster${clusters.length === 1 ? '' : 's'} mapped — ${covered} covered, ${partial} partial, ${gap} gap${gap === 1 ? '' : 's'}.`;
}

function renderClusterMapReport(opts: {
  keyword: string;
  clusters: Cluster[];
  findings: ClusterFinding[];
  totalQueries: number;
  relatedCount: number;
  competitorsAnalyzed: number;
  runId: string;
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
  lines.push('');

  /* Summary */
  lines.push('## Summary');
  lines.push('');
  const covered = clusters.filter(c => c.coverage_status === 'covered').length;
  const partial = clusters.filter(c => c.coverage_status === 'partial').length;
  const gap     = clusters.filter(c => c.coverage_status === 'gap').length;
  const unknown = clusters.filter(c => c.coverage_status === 'unknown').length;
  lines.push(`| Coverage | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| 🟢 Covered (clear hub, good position) | ${covered} |`);
  lines.push(`| 🟡 Partial (hub unclear or weak position) | ${partial} |`);
  lines.push(`| 🔴 Gap (competitor ranks, we don't) | ${gap} |`);
  lines.push(`| ❔ Unknown | ${unknown} |`);
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

  /* Clusters — gaps first, then partial, then covered */
  const order = ['gap', 'partial', 'covered', 'unknown'];
  const sorted = [...clusters].sort((a, b) => {
    const oa = order.indexOf(a.coverage_status);
    const ob = order.indexOf(b.coverage_status);
    if (oa !== ob) return oa - ob;
    return b.total_impressions - a.total_impressions;
  });

  lines.push('## Clusters');
  lines.push('');
  for (const cl of sorted) {
    const icon = cl.coverage_status === 'covered' ? '🟢'
              : cl.coverage_status === 'partial' ? '🟡'
              : cl.coverage_status === 'gap'     ? '🔴' : '❔';
    lines.push(`### ${icon} ${cl.cluster_name}`);
    lines.push('');
    if (cl.topic_summary) lines.push(`_${cl.topic_summary}_`);
    lines.push('');
    lines.push(`**Coverage status:** ${cl.coverage_status} · **Intent:** ${cl.primary_intent} · **Queries:** ${cl.query_count} · **Impressions:** ${cl.total_impressions.toLocaleString()} · **Clicks:** ${cl.total_clicks.toLocaleString()} · **Avg position:** ${cl.avg_position.toFixed(1)}`);
    lines.push('');
    if (cl.hub_page_url) {
      lines.push(`**Inferred hub:** [${cl.hub_page_url}](${cl.hub_page_url})`);
    } else {
      lines.push(`**Inferred hub:** _none found_`);
    }
    if (cl.spoke_pages && cl.spoke_pages.length > 0) {
      lines.push('');
      lines.push(`**Spoke pages:**`);
      for (const sp of cl.spoke_pages) lines.push(`- [${sp}](${sp})`);
    }
    if (cl.recommendation) {
      lines.push('');
      lines.push(`**Recommendation:** ${cl.recommendation}`);
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
  lines.push('**How clusters were formed:** Lexical similarity (shared non-stopword, non-keyword tokens) on GSC queries semantically related to the campaign keyword. The clusters were then LLM-labeled with names, intents, and recommendations using a single batched API call.');
  lines.push('');
  lines.push('**How hub/spoke was inferred:** URL-slug token matching against GSC top_pages. This is a heuristic — GSC does not expose query→page mapping at scale. If a cluster\'s queries don\'t match any URL token, hub will be null.');
  lines.push('');
  lines.push('**How gaps were detected:** Cluster has no inferred hub AND competitor URLs from the most recent `competitor_snapshot` step contain matching tokens. Soft signal — competitors might be ranking but the heuristic could miss matches.');
  lines.push('');
  lines.push('**Not yet covered:** Semantic similarity via embeddings, project-wide cluster maps across campaigns, automatic content-roadmap generation as kanban tasks, visual graph rendering. Coming in 16.1+.');

  return lines.join('\n');
}
