/* ════════════════════════════════════════════════════════════════
   api/lib/seo-off-page.ts
   Phase 18 — Off-Page Strategy pillar engine

   Generates strategic off-page outputs WITHOUT external backlink-data
   APIs (which would require paid third-party services). The pillar
   produces:
     1. Linkable assets the project already has (link-worthy GSC pages)
     2. Asset gaps to build (high-value content types missing from the
        site that this topic universe would attract links for)
     3. Prospect categories — types of sites/people who'd link
     4. Outreach angles per category — specific pitch hooks

   Pipeline:
     1. Gather context: GSC top_pages, cluster_map (Phase 16), competitors
     2. LLM call A: identify existing linkable assets among GSC top pages
     3. LLM call B: identify asset gaps the site should build
     4. LLM call C: generate prospect categories + outreach angles
     5. Persist + write report + surface opportunities

   Honest scope: this is strategy generation, not measurement. No real
   backlink profiling. The report is explicit about this limitation.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { writeReportToPanel, recordOpportunity } from "./seo-campaign-engine.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

/* ════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════ */

interface GscPageRow {
  page:        string;
  clicks:      number;
  impressions: number;
  ctr:         number;
  position:    number;
}

interface ClusterRow {
  cluster_name:    string;
  primary_intent:  string;
  topic_summary:   string | null;
  hub_page_url:    string | null;
  query_count:     number;
  competitor_owners: string[] | null;
}

type AssetType =
  'data_report' | 'comparison_tool' | 'free_tool' | 'ultimate_guide' |
  'visualization' | 'template_or_kit' | 'curated_list' | 'original_research' |
  'glossary_or_dictionary' | 'tutorial_series' | 'other';

type ProspectKind =
  'journalist' | 'blogger' | 'complementary_tool' | 'community' | 'educator' |
  'directory' | 'podcast_or_video' | 'resource_page' | 'broken_link_target' | 'other';

interface ExistingAsset {
  asset_type:        AssetType;
  title:             string;
  url:               string;
  description:       string;
  why_linkable:      string;
  gsc_impressions:   number;
  gsc_clicks:        number;
  gsc_position:      number;
  /* Phase 18.2 — keyword fit scoring. Does this asset attract links
     relevant to the campaign keyword? Scored 0-100, classified as
     high / medium / low. Computed heuristically (no LLM call). */
  keyword_fit_score: number;
  keyword_fit_label: 'high' | 'medium' | 'low';
  keyword_fit_signals: string[];
}

interface AspirationalAsset {
  asset_type:     AssetType;
  title:          string;
  description:    string;
  why_linkable:   string;
  build_effort:   'low' | 'medium' | 'high';
  build_priority: 'high' | 'medium' | 'low';
}

interface ProspectCategory {
  category_name:           string;
  category_kind:           ProspectKind;
  description:             string;
  example_prospects:       string[];
  outreach_angle:          string;
  pitch_template:          string;
  best_asset_match:        string;
  estimated_response_rate: 'high' | 'medium' | 'low';
  estimated_effort:        'low' | 'medium' | 'high';
}

interface Finding {
  finding_kind:    'no_linkable_assets' | 'asset_gap' | 'prospect_drought'
                 | 'competitor_link_dominance' | 'asset_readiness_strong'
                 | 'outreach_strategy_ready' | 'asset_keyword_fit_weak';
  severity:        'green' | 'amber' | 'red' | 'info';
  finding_title:   string;
  finding_detail?: string;
  recommendation?: string;
  evidence?:       any;
  /* Phase 18.1 — Senior DMS source-tracing (2026-05-24) */
  sources_used?:     OffPageSourceKey[];
  confidence_score?: number;
}

/* ═══════════════════════════════════════════════════════════════════
   SOURCE-CONFIDENCE MAPPING for off-page outputs (Phase 18.1)
   Added 2026-05-24 — Senior DMS pillar source-tracing pattern.

   IMPORTANT: this pillar is the most LLM-heavy of the five. The file's
   own header says it explicitly: "this is strategy generation, not
   measurement. No real backlink profiling." Most outputs are claude_inference
   (65). The Senior DMS lens demands this be VISIBLE — clients reading the
   report need to know which findings rest on GSC anchors vs LLM strategy.

   Sources:
   • gsc_top_pages         — for existing-asset identification
   • cluster_data          — Phase 16 cluster mapping (intelligence_output)
   • pipeline_research     — competitor snapshot
   • llm_existing_assets   — Claude classifies GSC pages as linkable
   • llm_aspirational      — Claude invents asset ideas (no measurement anchor)
   • llm_prospects         — Claude generates prospect categories + angles
═══════════════════════════════════════════════════════════════════ */

type OffPageSourceKey =
  | 'gsc_top_pages'
  | 'cluster_data'
  | 'pipeline_research'
  | 'llm_existing_assets'
  | 'llm_aspirational'
  | 'llm_prospects';

const OFFPAGE_SOURCE_META: Record<
  OffPageSourceKey,
  { confidence: number; label: string; sourceType: string }
> = {
  gsc_top_pages:       { confidence: 95, label: 'GSC top_pages (live)',              sourceType: 'gsc_live' },
  cluster_data:        { confidence: 80, label: 'Cluster-map intelligence (Phase 16)', sourceType: 'intelligence_output' },
  pipeline_research:   { confidence: 80, label: 'Pipeline research (competitor)',    sourceType: 'intelligence_output' },
  llm_existing_assets: { confidence: 65, label: 'Claude linkable-asset classification', sourceType: 'claude_inference' },
  llm_aspirational:    { confidence: 65, label: 'Claude asset-gap strategy',         sourceType: 'claude_inference' },
  llm_prospects:       { confidence: 65, label: 'Claude prospect-category strategy', sourceType: 'claude_inference' },
};

function offPageSourcesConfidence(keys: OffPageSourceKey[]): number {
  if (!keys || keys.length === 0) return 0;
  const total = keys.reduce((acc, k) => acc + OFFPAGE_SOURCE_META[k].confidence, 0);
  return Math.round(total / keys.length);
}

function offPageFindingKindSources(kind: Finding['finding_kind']): OffPageSourceKey[] {
  switch (kind) {
    case 'no_linkable_assets':       return ['gsc_top_pages', 'llm_existing_assets'];
    case 'asset_gap':                return ['llm_aspirational', 'cluster_data'];
    case 'prospect_drought':         return ['llm_prospects'];
    case 'competitor_link_dominance': return ['pipeline_research', 'llm_prospects'];
    case 'asset_readiness_strong':   return ['gsc_top_pages', 'llm_existing_assets'];
    case 'outreach_strategy_ready':  return ['llm_prospects'];
    default:                         return ['llm_aspirational'];
  }
}

function attachOffPageFindingSources(findings: Finding[]): void {
  for (const f of findings) {
    if (f.sources_used && f.sources_used.length > 0) continue;
    const sources = offPageFindingKindSources(f.finding_kind);
    f.sources_used = sources;
    f.confidence_score = offPageSourcesConfidence(sources);
  }
}

function weightedOffPageFindingConfidence(findings: Finding[]): {
  mean: number;
  sourced_count: number;
  unattributed_count: number;
} {
  const sourced = findings
    .map(f => f.confidence_score)
    .filter((s): s is number => typeof s === 'number');
  const unattributed = findings.length - sourced.length;
  if (sourced.length === 0) return { mean: 0, sourced_count: 0, unattributed_count: unattributed };
  return {
    mean: Math.round(sourced.reduce((a, b) => a + b, 0) / sourced.length),
    sourced_count: sourced.length,
    unattributed_count: unattributed,
  };
}

/* ════════════════════════════════════════════════════════════════
   PUBLIC API
═══════════════════════════════════════════════════════════════ */

export async function runOffPageStrategy(opts: {
  campaignId:   string;
  panelId?:     string;
  triggeredBy?: 'cron' | 'manual';
}): Promise<{
  success: boolean;
  audit_run_id?: string;
  existing_assets?: number;
  aspirational_assets?: number;
  prospect_categories?: number;
  report_id?: string;
  error?: string;
}> {
  const triggeredBy = opts.triggeredBy || 'manual';
  const startTime = Date.now();

  try {
    /* Resolve campaign + panel */
    const { data: campaign } = await db().from("seo_campaigns")
      .select("id, project_id, keyword").eq("id", opts.campaignId).maybeSingle();
    if (!campaign) return { success: false, error: 'campaign not found' };
    const c = campaign as any;

    let panelId = opts.panelId;
    if (!panelId) {
      const { data: p } = await db().from("seo_campaign_panels")
        .select("id").eq("campaign_id", opts.campaignId).eq("pillar", 'off_page').maybeSingle();
      panelId = (p as any)?.id;
    }
    if (!panelId) return { success: false, error: 'no off_page panel found for this campaign' };

    /* 1. Gather context */
    const [gscPages, clusters, competitors, gscFreshnessAt] = await Promise.all([
      readGscPages(c.project_id),
      readClusters(opts.campaignId),
      readCompetitorSnapshot(opts.campaignId),
      readGscFreshness(c.project_id),
    ]);

    /* If we have NO data at all, write a pending report */
    if (gscPages.length === 0 && clusters.length === 0 && competitors.length === 0) {
      const reportR = await writeReportToPanel({
        campaignId:       opts.campaignId,
        projectId:        c.project_id,
        pillar:           'off_page',
        panelId,
        reportKind:       triggeredBy === 'cron' ? 'scheduled_recheck' : 'manual_refresh',
        generatedBy:      triggeredBy,
        dataSources:      [],
        confidenceRating: 'low',
        confidenceReason: 'No GSC pages, cluster map, or competitor data — off-page strategy needs at least one signal to ground recommendations.',
        title:            'Off-page strategy pending — no input data',
        bodyMd:           buildEmptyReport(c.keyword),
        summary:          'Awaiting data.',
        tags:             ['off_page', 'pending', `keyword:${c.keyword.toLowerCase()}`],
        updatePanelStatus: true,
        newPanelStatus:    'amber',
      });
      return { success: true, existing_assets: 0, aspirational_assets: 0, prospect_categories: 0, report_id: reportR.report_id };
    }

    /* 2-4. Three LLM calls in parallel where possible */
    const auditRunId = crypto.randomUUID();

    const [existingAssets, aspirationalAssets, prospects] = await Promise.all([
      identifyExistingAssets(c.keyword, gscPages),
      identifyAssetGaps(c.keyword, gscPages, clusters, competitors),
      generateProspectStrategy(c.keyword, clusters, competitors),
    ]);
    const llmCallsUsed = 3;

    /* 5. Compute findings */
    const findings = computeFindings({
      existingAssets, aspirationalAssets, prospects,
      gscPages, clusters, competitors,
    });
    /* 5b. Phase 18.1 — attach source attribution per finding */
    attachOffPageFindingSources(findings);

    /* 6. Persist run */
    const durationMs = Date.now() - startTime;
    await db().from("off_page_runs").insert({
      id:                          auditRunId,
      campaign_id:                 opts.campaignId,
      panel_id:                    panelId,
      project_id:                  c.project_id,
      triggered_by:                triggeredBy,
      existing_assets_count:       existingAssets.length,
      aspirational_assets_count:   aspirationalAssets.length,
      prospect_categories_count:   prospects.length,
      total_angles_count:          prospects.length,    // 1 angle per category
      llm_calls_used:              llmCallsUsed,
      duration_ms:                 durationMs,
    });

    /* Persist assets */
    if (existingAssets.length > 0 || aspirationalAssets.length > 0) {
      const assetRows = [
        ...existingAssets.map((a, i) => ({
          run_id:           auditRunId,
          campaign_id:      opts.campaignId,
          panel_id:         panelId,
          project_id:       c.project_id,
          asset_kind:       'existing' as const,
          asset_type:       a.asset_type,
          title:            a.title.slice(0, 240),
          url:              a.url.slice(0, 500),
          description:      a.description.slice(0, 1000),
          why_linkable:     a.why_linkable.slice(0, 1000),
          gsc_impressions:  a.gsc_impressions,
          gsc_clicks:       a.gsc_clicks,
          gsc_position:     a.gsc_position,
          build_effort:     null,
          build_priority:   null,
          display_order:    i,
        })),
        ...aspirationalAssets.map((a, i) => ({
          run_id:           auditRunId,
          campaign_id:      opts.campaignId,
          panel_id:         panelId,
          project_id:       c.project_id,
          asset_kind:       'aspirational' as const,
          asset_type:       a.asset_type,
          title:            a.title.slice(0, 240),
          url:              null,
          description:      a.description.slice(0, 1000),
          why_linkable:     a.why_linkable.slice(0, 1000),
          gsc_impressions:  null,
          gsc_clicks:       null,
          gsc_position:     null,
          build_effort:     a.build_effort,
          build_priority:   a.build_priority,
          display_order:    i,
        })),
      ];
      await db().from("off_page_assets").insert(assetRows);
    }

    /* Persist prospects */
    if (prospects.length > 0) {
      const prospectRows = prospects.map((p, i) => ({
        run_id:                  auditRunId,
        campaign_id:             opts.campaignId,
        panel_id:                panelId,
        project_id:              c.project_id,
        category_name:           p.category_name.slice(0, 200),
        category_kind:           p.category_kind,
        description:             p.description.slice(0, 1000),
        example_prospects:       (p.example_prospects || []).slice(0, 8),
        outreach_angle:          p.outreach_angle.slice(0, 1000),
        pitch_template:          p.pitch_template.slice(0, 2000),
        best_asset_match:        p.best_asset_match.slice(0, 500),
        estimated_response_rate: p.estimated_response_rate,
        estimated_effort:        p.estimated_effort,
        display_order:           i,
      }));
      await db().from("off_page_prospects").insert(prospectRows);
    }

    /* Persist findings */
    if (findings.length > 0) {
      const findingRows = findings.map(f => ({
        run_id:         auditRunId,
        campaign_id:    opts.campaignId,
        panel_id:       panelId,
        project_id:     c.project_id,
        finding_kind:   f.finding_kind,
        severity:       f.severity,
        finding_title:  f.finding_title.slice(0, 240),
        finding_detail: f.finding_detail?.slice(0, 2000) || null,
        recommendation: f.recommendation?.slice(0, 1000) || null,
        evidence:       f.evidence || null,
      }));
      await db().from("off_page_findings").insert(findingRows);
    }

    /* 7. Write report */
    const redCount   = findings.filter(f => f.severity === 'red').length;
    const amberCount = findings.filter(f => f.severity === 'amber').length;
    const panelStatus: 'red' | 'amber' | 'green' =
      redCount > 0   ? 'red'   :
      amberCount > 0 ? 'amber' : 'green';

    /* Honest confidence rating — off-page is LLM-heavy by design (strategy
       generation, no real backlink measurement). Per-finding source-weighted
       confidence drives the rating; the LLM ceiling means even "best case"
       comes out at medium when most findings rest on claude_inference (65).
       To reach 'high' would require a future Block-4 SerpAPI integration
       producing measured competitive-link evidence. */
    const sourceConf = weightedOffPageFindingConfidence(findings);
    const sourceRating: 'high' | 'medium' | 'low' =
      sourceConf.sourced_count === 0 ? 'low' :
      sourceConf.mean >= 82           ? 'high' :   // requires GSC anchors in majority of findings
      sourceConf.mean >= 70           ? 'medium' : 'low';

    const reportR = await writeReportToPanel({
      campaignId:        opts.campaignId,
      projectId:         c.project_id,
      pillar:            'off_page',
      panelId,
      reportKind:        triggeredBy === 'cron' ? 'scheduled_recheck' : 'manual_refresh',
      generatedBy:       triggeredBy,
      llmCallsUsed,
      dataSources:       [
        'llm',
        ...(gscPages.length    > 0 ? ['gsc' as const]               : []),
        ...(clusters.length    > 0 ? ['pipeline_research' as const] : []),
      ],
      confidenceRating:  sourceRating,
      confidenceReason:  [
        buildConfidenceReason(existingAssets.length, aspirationalAssets.length, prospects.length, gscPages.length, clusters.length, competitors.length),
        sourceConf.sourced_count > 0
          ? `Source-weighted confidence: ${sourceConf.mean}/100 across ${sourceConf.sourced_count} finding(s) (${sourceRating}).`
          : 'No findings produced — confidence treated as low.',
        'Off-page is strategy generation; absolute high confidence requires future SerpAPI/backlink-API integration (Block 4).',
      ].filter(Boolean).join(' '),
      title:             `Off-page strategy: ${existingAssets.length} existing assets, ${aspirationalAssets.length} to build, ${prospects.length} prospect categories`,
      bodyMd:            renderReport({
        keyword: c.keyword,
        existingAssets, aspirationalAssets, prospects, findings,
        gscPageCount: gscPages.length,
        clusterCount: clusters.length,
        competitorCount: competitors.length,
        runId: auditRunId,
        durationMs,
        gscUpdatedAt: gscFreshnessAt,
      }),
      summary:           buildHeadline({
        existing: existingAssets.length,
        aspirational: aspirationalAssets.length,
        prospects: prospects.length,
        redCount, amberCount,
      }),
      tags:              ['off_page', `keyword:${c.keyword.toLowerCase()}`,
                          ...(existingAssets.length > 0 ? [`existing:${existingAssets.length}`] : []),
                          ...(aspirationalAssets.length > 0 ? [`to_build:${aspirationalAssets.length}`] : []),
                          ...(prospects.length > 0 ? [`prospects:${prospects.length}`] : [])],
      metricSnapshot:    {
        existing_assets:     existingAssets.length,
        aspirational_assets: aspirationalAssets.length,
        prospect_categories: prospects.length,
        red_findings:        redCount,
        amber_findings:      amberCount,
        llm_calls:           llmCallsUsed,
        duration_ms:         durationMs,
      },
      updatePanelStatus: true,
      newPanelStatus:    panelStatus,
    });

    /* Backfill report_id onto run */
    if (reportR.report_id) {
      await db().from("off_page_runs").update({ report_id: reportR.report_id }).eq("id", auditRunId);
    }

    /* 8. Surface high-priority asset gaps as opportunities */
    for (const a of aspirationalAssets.filter(a => a.build_priority === 'high').slice(0, 5)) {
      await recordOpportunity({
        projectId:        c.project_id,
        sourceKind:       'cron_sweep',
        sourceCampaignId: opts.campaignId,
        sourcePanelId:    panelId,
        sourceStepId:     'off_page',
        kind:             'content_gap',
        title:            `Build linkable asset: ${a.title}`,
        description:      `Type: ${a.asset_type}. ${a.description} — Why linkable: ${a.why_linkable}`,
        evidence:         {
          asset_type:     a.asset_type,
          build_effort:   a.build_effort,
          build_priority: a.build_priority,
          audit_run_id:   auditRunId,
        },
        estimatedValue:   'high',
        estimatedEffort:  a.build_effort,
        suggestedAction:  'new_campaign',
        suggestedCampaignKind: 'rank_for_keyword',
      });
    }

    /* 9. Surface top prospect categories as backlink opportunities */
    for (const p of prospects.filter(p => p.estimated_response_rate === 'high' || p.estimated_response_rate === 'medium').slice(0, 5)) {
      await recordOpportunity({
        projectId:        c.project_id,
        sourceKind:       'cron_sweep',
        sourceCampaignId: opts.campaignId,
        sourcePanelId:    panelId,
        sourceStepId:     'off_page',
        kind:             'backlink',
        title:            `Outreach prospect: ${p.category_name}`,
        description:      `${p.description} · Angle: ${p.outreach_angle} · Match: ${p.best_asset_match}`,
        evidence:         {
          category_kind:           p.category_kind,
          example_prospects:       p.example_prospects,
          pitch_template:          p.pitch_template,
          estimated_response_rate: p.estimated_response_rate,
          audit_run_id:            auditRunId,
        },
        estimatedValue:   p.estimated_response_rate === 'high' ? 'high' : 'medium',
        estimatedEffort:  p.estimated_effort,
        suggestedAction:  'kanban_task',
      });
    }

    /* Update panel recheck */
    const { data: panelRow } = await db().from("seo_campaign_panels")
      .select("recheck_cadence_days").eq("id", panelId).maybeSingle();
    const cadence = (panelRow as any)?.recheck_cadence_days || 14;
    await db().from("seo_campaign_panels").update({
      last_assessed_at: new Date().toISOString(),
      next_recheck_at:  new Date(Date.now() + cadence * 86_400_000).toISOString(),
    }).eq("id", panelId);

    return {
      success:              true,
      audit_run_id:         auditRunId,
      existing_assets:      existingAssets.length,
      aspirational_assets:  aspirationalAssets.length,
      prospect_categories:  prospects.length,
      report_id:            reportR.report_id,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'off-page strategy failed' };
  }
}

export async function getPanelOffPageData(opts: {
  panelId: string;
  limit?:  number;
}): Promise<{ success: boolean; assets?: any[]; prospects?: any[]; findings?: any[]; error?: string }> {
  try {
    const limit = Math.min(opts.limit || 50, 200);
    const [assetsRes, prospectsRes, findingsRes] = await Promise.all([
      db().from("off_page_assets")
        .select("*").eq("panel_id", opts.panelId)
        .order("created_at", { ascending: false }).limit(limit),
      db().from("off_page_prospects")
        .select("*").eq("panel_id", opts.panelId)
        .order("created_at", { ascending: false }).limit(limit),
      db().from("off_page_findings")
        .select("*").eq("panel_id", opts.panelId)
        .order("created_at", { ascending: false }).limit(limit),
    ]);
    return {
      success: true,
      assets:        assetsRes.data || [],
      prospects:     prospectsRes.data || [],
      findings:      findingsRes.data || [],
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'list failed' };
  }
}

/* ════════════════════════════════════════════════════════════════
   DATA FETCHERS
═══════════════════════════════════════════════════════════════ */

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
      .eq("field_key", "gsc_top_pages")
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

async function readClusters(campaignId: string): Promise<ClusterRow[]> {
  try {
    /* Get the most recent cluster_map audit run for this campaign */
    const { data: clusters } = await db().from("cluster_map_clusters")
      .select("cluster_name, primary_intent, topic_summary, hub_page_url, query_count, competitor_owners")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(20);
    return (clusters as ClusterRow[]) || [];
  } catch { return []; }
}

async function readCompetitorSnapshot(campaignId: string): Promise<any[]> {
  try {
    const { data: runs } = await db().from("season_pipeline_runs")
      .select("id").eq("campaign_id", campaignId)
      .order("started_at", { ascending: false }).limit(3);
    for (const run of ((runs as any[]) || [])) {
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
   LLM CALL A — Identify existing linkable assets
═══════════════════════════════════════════════════════════════ */

/* Phase 18.2 — Asset-keyword fit scoring.
   Evaluates whether a linkable asset is topically relevant to the campaign
   keyword — i.e., would a link TO this asset from content about the keyword
   make sense, and would it attract links FROM pages covering the keyword
   topic area?
   Heuristic scoring: no LLM call, computed from URL slug, title tokens,
   and why_linkable text. Score 0-100, label high/medium/low. */
function scoreAssetKeywordFit(
  url: string, title: string, whyLinkable: string, keyword: string
): { score: number; label: 'high' | 'medium' | 'low'; signals: string[] } {
  const kwTokens = new Set(
    keyword.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  );
  const signals: string[] = [];
  let score = 0;

  const urlSlug = url.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const titleLower = title.toLowerCase();
  const whyLower = whyLinkable.toLowerCase();

  /* URL slug token overlap */
  const urlMatches = [...kwTokens].filter(t => urlSlug.includes(t));
  if (urlMatches.length >= 2) {
    score += 35;
    signals.push(`URL slug contains ${urlMatches.length} keyword tokens (${urlMatches.join(', ')})`);
  } else if (urlMatches.length === 1) {
    score += 20;
    signals.push(`URL slug contains keyword token "${urlMatches[0]}"`);
  }

  /* Title token overlap */
  const titleMatches = [...kwTokens].filter(t => titleLower.includes(t));
  if (titleMatches.length >= 2) {
    score += 30;
    signals.push(`Title contains ${titleMatches.length} keyword tokens`);
  } else if (titleMatches.length === 1) {
    score += 15;
    signals.push(`Title contains keyword token "${titleMatches[0]}"`);
  }

  /* why_linkable mentions keyword topic */
  const whyMatches = [...kwTokens].filter(t => whyLower.includes(t));
  if (whyMatches.length >= 2) {
    score += 25;
    signals.push(`Linkability rationale explicitly covers keyword topic`);
  } else if (whyMatches.length >= 1) {
    score += 10;
    signals.push(`Linkability rationale partially covers keyword topic`);
  }

  /* Cap and classify */
  score = Math.min(100, score);
  if (signals.length === 0) {
    signals.push(`No keyword tokens found in URL, title, or linkability rationale — this asset may attract links from a different topic area`);
  }
  const label: 'high' | 'medium' | 'low' = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return { score, label, signals };
}

async function identifyExistingAssets(keyword: string, gscPages: GscPageRow[]): Promise<ExistingAsset[]> {
  if (gscPages.length === 0) return [];

  const topPages = gscPages.slice(0, 25).map(p => ({
    url: p.page, impressions: p.impressions, clicks: p.clicks, position: Number(p.position?.toFixed(1)),
  }));

  const sys = `You are a digital marketing specialist evaluating which existing pages on a site are "linkable assets" — pages that would naturally attract backlinks because they're data-rich, comprehensive, original, or uniquely useful.

The user gives you a campaign keyword and a list of pages with GSC traffic data. You return ONLY the pages that are genuinely linkable assets — not just popular pages. A page with high impressions isn't automatically link-worthy; it has to have the qualities that make journalists, bloggers, or peers want to reference it.

For each linkable asset, classify the asset_type and explain why it's linkable. If a page isn't a linkable asset, DROP it from your response. Returning fewer high-quality assets is better than padding with weak ones.

Valid asset_type values: "data_report" | "comparison_tool" | "free_tool" | "ultimate_guide" | "visualization" | "template_or_kit" | "curated_list" | "original_research" | "glossary_or_dictionary" | "tutorial_series" | "other"

For each asset return:
- url: the page URL (from the input list)
- asset_type: one of the values above
- title: short descriptive name (NOT the full URL — name what the page IS)
- description: 1-2 sentence summary of what makes the page linkable
- why_linkable: 1-2 sentences on WHO would link and WHY (concrete, not generic)

Reply with ONLY valid JSON:
{ "assets": [ { "url": "...", "asset_type": "...", "title": "...", "description": "...", "why_linkable": "..." } ] }`;

  const user = `Campaign keyword: "${keyword}"

Pages with GSC traffic (top 25 by impressions):
${JSON.stringify(topPages, null, 2)}

Which of these are genuinely linkable assets? Drop weak ones — return ${Math.min(8, Math.ceil(gscPages.length * 0.3))} max.`;

  try {
    const llmResult = await callClaude(sys, user, 2500, 60_000);
    const list = Array.isArray(llmResult?.assets) ? llmResult.assets : [];
    const result: ExistingAsset[] = [];
    for (const a of list) {
      if (!a.url || typeof a.url !== 'string') continue;
      const gscPage = gscPages.find(p => p.page === a.url);
      if (!gscPage) continue;
      const fit = scoreAssetKeywordFit(a.url, String(a.title || ''), String(a.why_linkable || ''), keyword);
      result.push({
        asset_type:          validateAssetType(a.asset_type),
        title:               String(a.title || 'Untitled asset').slice(0, 200),
        url:                 a.url,
        description:         String(a.description || '').slice(0, 800),
        why_linkable:        String(a.why_linkable || '').slice(0, 800),
        gsc_impressions:     gscPage.impressions,
        gsc_clicks:          gscPage.clicks,
        gsc_position:        gscPage.position,
        keyword_fit_score:   fit.score,
        keyword_fit_label:   fit.label,
        keyword_fit_signals: fit.signals,
      });
    }
    return result;
  } catch (e: any) {
    console.log(`[identifyExistingAssets] failed: ${e?.message}`);
    return [];
  }
}

/* ════════════════════════════════════════════════════════════════
   LLM CALL B — Identify asset gaps to build
═══════════════════════════════════════════════════════════════ */

async function identifyAssetGaps(
  keyword: string,
  gscPages: GscPageRow[],
  clusters: ClusterRow[],
  competitors: any[],
): Promise<AspirationalAsset[]> {
  const clusterContext = clusters.length > 0
    ? clusters.slice(0, 8).map((c, i) => `${i + 1}. "${c.cluster_name}" (${c.primary_intent}) — ${c.topic_summary || ''} — hub: ${c.hub_page_url || 'NONE'}${(c.competitor_owners?.length || 0) > 0 ? ` — competitors owning: ${(c.competitor_owners || []).slice(0, 3).join(', ')}` : ''}`).join('\n')
    : '(no cluster map data)';

  const competitorContext = competitors.length > 0
    ? competitors.slice(0, 5).map((cp, i) => {
        const url = cp.url || cp.page || '';
        const title = cp.title || cp.angle || '';
        return `${i + 1}. ${url}${title ? ` — ${title}` : ''}`;
      }).join('\n')
    : '(no competitor data)';

  const existingPageTypes = gscPages.length > 0
    ? gscPages.slice(0, 15).map(p => p.page).join('\n')
    : '(no GSC pages)';

  const sys = `You are a senior content + linkbuilding strategist. The user gives you a campaign keyword, what their site already has (GSC pages), the topical cluster map, and competitor pages.

Your job: identify 3-6 SPECIFIC linkable assets the site should BUILD that would attract backlinks in this topic universe. These are content pieces that don't exist yet.

Strong linkable assets have one or more of these qualities:
- Original data (proprietary surveys, benchmarks, studies, scraped statistics)
- Tools (calculators, generators, comparison matrices that solve a real workflow problem)
- Definitive resources (the canonical guide to X; the comprehensive glossary; the curated directory)
- Timely / news-worthy hooks (annual state-of-the-X report; trend visualization)

Weak ideas to AVOID: "blog post about X", "general guide to Y", anything generic that already exists in 100 places. Be specific and creative.

For each asset return:
- asset_type: one of "data_report" | "comparison_tool" | "free_tool" | "ultimate_guide" | "visualization" | "template_or_kit" | "curated_list" | "original_research" | "glossary_or_dictionary" | "tutorial_series" | "other"
- title: catchy, specific (e.g., "The 2026 No-Code App Builder Salary Report" — not "Survey of No-Code Builders")
- description: 2-3 sentences on what the asset is and what makes it linkable
- why_linkable: 1-2 sentences on WHO would link and WHY (concrete prospect types)
- build_effort: "low" | "medium" | "high" (low = ~1 week, medium = ~1 month, high = ~quarter)
- build_priority: "high" | "medium" | "low" (how strongly to recommend)

Reply with ONLY valid JSON:
{ "assets": [ { "asset_type": "...", "title": "...", "description": "...", "why_linkable": "...", "build_effort": "...", "build_priority": "..." } ] }`;

  const user = `Campaign keyword: "${keyword}"

Topical clusters (from cluster map):
${clusterContext}

Top competing pages (from rank pipeline):
${competitorContext}

Pages the site already has (GSC top 15):
${existingPageTypes}

Identify 3-6 specific linkable assets the site should BUILD. Lead with highest-leverage (high build_priority).`;

  try {
    const llmResult = await callClaude(sys, user, 3000, 60_000);
    const list = Array.isArray(llmResult?.assets) ? llmResult.assets : [];
    const result: AspirationalAsset[] = list.map((a: any) => ({
      asset_type:     validateAssetType(a.asset_type),
      title:          String(a.title || 'Untitled asset').slice(0, 200),
      description:    String(a.description || '').slice(0, 800),
      why_linkable:   String(a.why_linkable || '').slice(0, 800),
      build_effort:   validateEnum(a.build_effort, ['low', 'medium', 'high'], 'medium') as any,
      build_priority: validateEnum(a.build_priority, ['high', 'medium', 'low'], 'medium') as any,
    })).filter((a: AspirationalAsset) => a.title && a.title !== 'Untitled asset');
    return result;
  } catch (e: any) {
    console.log(`[identifyAssetGaps] failed: ${e?.message}`);
    return [];
  }
}

/* ════════════════════════════════════════════════════════════════
   LLM CALL C — Generate prospect categories + outreach angles
═══════════════════════════════════════════════════════════════ */

async function generateProspectStrategy(
  keyword: string,
  clusters: ClusterRow[],
  competitors: any[],
): Promise<ProspectCategory[]> {
  const clusterContext = clusters.length > 0
    ? clusters.slice(0, 6).map((c, i) => `${i + 1}. "${c.cluster_name}" (${c.primary_intent})`).join('\n')
    : '(no cluster data)';

  const competitorContext = competitors.length > 0
    ? competitors.slice(0, 5).map((cp, i) => {
        const url = cp.url || cp.page || '';
        return `${i + 1}. ${url}`;
      }).join('\n')
    : '(no competitor data)';

  const sys = `You are a digital marketing specialist generating a backlink outreach strategy for a project targeting "${keyword}". You don't know who specific prospects ARE (you don't have backlink data) — you know the topic universe. Your job is to identify CATEGORIES of prospects who would naturally link to assets in this space, and produce a specific outreach angle for each category.

Generate 4-7 prospect categories. Each should be a coherent group with a shared linking motivation. For each:
- category_name: short, descriptive (e.g., "Niche bloggers covering no-code tools" not "bloggers")
- category_kind: one of "journalist" | "blogger" | "complementary_tool" | "community" | "educator" | "directory" | "podcast_or_video" | "resource_page" | "broken_link_target" | "other"
- description: 1-2 sentences on WHO they are and what their audience cares about
- example_prospects: 3-5 example domains/handles you're confident operate in this space (NOT made up — if you're unsure, return [])
- outreach_angle: the specific pitch hook (e.g., "frame our data report as a definitive source for their year-end roundup posts")
- pitch_template: 3-5 sentence template they could adapt (subject + opening + asset offer + CTA)
- best_asset_match: which asset type from our list would fit (e.g., "the 2026 industry report" or "the comparison tool")
- estimated_response_rate: "high" | "medium" | "low" honestly — outreach to journalists is often low; replacing broken links is often high
- estimated_effort: "low" | "medium" | "high" — how much work per prospect (low = template-able; high = bespoke per-prospect research)

Be honest. If a category is low-response, say so. If you don't know example prospects for a category, return [] — never invent.

Reply with ONLY valid JSON:
{ "prospects": [ { "category_name": "...", "category_kind": "...", "description": "...", "example_prospects": [...], "outreach_angle": "...", "pitch_template": "...", "best_asset_match": "...", "estimated_response_rate": "...", "estimated_effort": "..." } ] }`;

  const user = `Campaign keyword: "${keyword}"

Topical clusters:
${clusterContext}

Top competing pages (the topical universe — your prospect categories should be people/sites in this ecosystem):
${competitorContext}

Generate 4-7 prospect categories with specific outreach angles.`;

  try {
    const llmResult = await callClaude(sys, user, 4000, 75_000);
    const list = Array.isArray(llmResult?.prospects) ? llmResult.prospects : [];
    const result: ProspectCategory[] = list.map((p: any) => ({
      category_name:           String(p.category_name || 'Unnamed category').slice(0, 200),
      category_kind:           validateProspectKind(p.category_kind),
      description:             String(p.description || '').slice(0, 800),
      example_prospects:       Array.isArray(p.example_prospects)
                                ? p.example_prospects.filter((x: any) => typeof x === 'string').map((x: string) => x.trim().slice(0, 150)).slice(0, 8)
                                : [],
      outreach_angle:          String(p.outreach_angle || '').slice(0, 800),
      pitch_template:          String(p.pitch_template || '').slice(0, 1800),
      best_asset_match:        String(p.best_asset_match || '').slice(0, 400),
      estimated_response_rate: validateEnum(p.estimated_response_rate, ['high', 'medium', 'low'], 'medium') as any,
      estimated_effort:        validateEnum(p.estimated_effort, ['low', 'medium', 'high'], 'medium') as any,
    })).filter((p: ProspectCategory) => p.category_name && p.outreach_angle);
    return result;
  } catch (e: any) {
    console.log(`[generateProspectStrategy] failed: ${e?.message}`);
    return [];
  }
}

/* ════════════════════════════════════════════════════════════════
   FINDINGS
═══════════════════════════════════════════════════════════════ */

function computeFindings(opts: {
  existingAssets:      ExistingAsset[];
  aspirationalAssets:  AspirationalAsset[];
  prospects:           ProspectCategory[];
  gscPages:            GscPageRow[];
  clusters:            ClusterRow[];
  competitors:         any[];
}): Finding[] {
  const findings: Finding[] = [];

  /* No linkable assets at all — site too thin */
  if (opts.existingAssets.length === 0 && opts.gscPages.length >= 5) {
    findings.push({
      finding_kind:   'no_linkable_assets',
      severity:       'amber',
      finding_title:  'No existing linkable assets identified',
      finding_detail: `Of ${opts.gscPages.length} pages reviewed, none qualify as linkable assets. This means existing pages are likely too generic, too short, or too commercial to attract editorial links. The aspirational assets below are what to build first.`,
      recommendation: 'Prioritize building 1-2 high-priority aspirational assets before launching outreach.',
      evidence:       { pages_reviewed: opts.gscPages.length },
    });
  }

  /* Strong asset readiness */
  if (opts.existingAssets.length >= 3) {
    findings.push({
      finding_kind:   'asset_readiness_strong',
      severity:       'green',
      finding_title:  `${opts.existingAssets.length} existing linkable assets ready for outreach`,
      finding_detail: `The site already has ${opts.existingAssets.length} pages that qualify as linkable assets. Outreach can start immediately without waiting for new builds.`,
      evidence:       { existing_count: opts.existingAssets.length },
    });
  }

  /* High-priority asset gap */
  const highPriorityGaps = opts.aspirationalAssets.filter(a => a.build_priority === 'high');
  if (highPriorityGaps.length > 0) {
    findings.push({
      finding_kind:   'asset_gap',
      severity:       'amber',
      finding_title:  `${highPriorityGaps.length} high-priority asset gap${highPriorityGaps.length === 1 ? '' : 's'} identified`,
      finding_detail: `These are linkable assets the topic universe demands but the site doesn't have. Building them creates leverage for sustainable outreach.`,
      recommendation: `Prioritize the top 1-2 by build_effort vs build_priority. Each has been added to the Opportunities inbox.`,
      evidence:       { gap_count: highPriorityGaps.length, titles: highPriorityGaps.map(a => a.title) },
    });
  }

  /* Prospect strategy ready */
  if (opts.prospects.length >= 3) {
    const highRateCount = opts.prospects.filter(p => p.estimated_response_rate === 'high').length;
    findings.push({
      finding_kind:   'outreach_strategy_ready',
      severity:       'green',
      finding_title:  `${opts.prospects.length} prospect categor${opts.prospects.length === 1 ? 'y' : 'ies'} mapped${highRateCount > 0 ? `, ${highRateCount} with high response-rate potential` : ''}`,
      finding_detail: `Outreach strategy is structured by prospect type, each with a specific angle. Start with the high-response-rate categories.`,
      evidence:       { prospects: opts.prospects.length, high_rate_count: highRateCount },
    });
  }

  /* Prospect drought — too few categories */
  if (opts.prospects.length > 0 && opts.prospects.length < 3) {
    findings.push({
      finding_kind:   'prospect_drought',
      severity:       'amber',
      finding_title:  `Only ${opts.prospects.length} prospect categor${opts.prospects.length === 1 ? 'y' : 'ies'} found`,
      finding_detail: `The topic universe may be too niche for sustainable outreach at scale. Consider whether off-page should be the priority pillar for this campaign, or whether content + technical SEO would have higher ROI.`,
      recommendation: 'Reconsider whether outreach is the right primary lever for this campaign.',
      evidence:       { prospect_count: opts.prospects.length },
    });
  }

  /* Competitor link dominance — if multiple clusters show competitor_owners */
  const dominantCompetitors = new Set<string>();
  for (const cl of opts.clusters) {
    for (const owner of (cl.competitor_owners || [])) {
      dominantCompetitors.add(owner);
    }
  }
  if (dominantCompetitors.size >= 3) {
    findings.push({
      finding_kind:   'competitor_link_dominance',
      severity:       'info',
      finding_title:  `${dominantCompetitors.size} competitor domains dominate the topic universe`,
      finding_detail: `Cluster map identified these domains as owning multiple topical clusters: ${Array.from(dominantCompetitors).slice(0, 5).join(', ')}. Their links are concentrated on assets you need to compete with — building differentiated linkable assets is the path to displacing them, not directly out-prospecting.`,
      recommendation: 'Focus on creating ONE flagship linkable asset that none of them have, rather than competing on overlapping content.',
      evidence:       { dominant_competitors: Array.from(dominantCompetitors) },
    });
  }

  /* Phase 18.2 — Asset-keyword fit warning: when existing assets are identified
     but none score high on keyword fit, surface it as an amber finding. A link
     from "app maker tutorial" to a "free PDF export tool" doesn't help rank for
     "app maker" — the linker's audience and the asset topic must overlap. */
  if (opts.existingAssets.length > 0) {
    const highFit = opts.existingAssets.filter(a => a.keyword_fit_label === 'high').length;
    const lowFit  = opts.existingAssets.filter(a => a.keyword_fit_label === 'low').length;
    if (highFit === 0 && opts.existingAssets.length >= 2) {
      findings.push({
        finding_kind:   'asset_keyword_fit_weak',
        severity:       'amber',
        finding_title:  `None of ${opts.existingAssets.length} identified assets score high on keyword fit`,
        finding_detail: `The identified linkable assets may attract editorial links, but those links would come from content covering different topics than the campaign keyword. Links from off-topic content carry reduced topical authority for your target keyword.\n\nKeyword fit breakdown:\n${opts.existingAssets.map(a => `- ${a.title}: ${a.keyword_fit_label} fit (${a.keyword_fit_score}/100) — ${(a.keyword_fit_signals || []).join('; ')}`).join('\n')}`,
        recommendation: `Either build assets that are topically aligned with your campaign keyword, or accept that off-page will build general domain authority rather than keyword-specific authority. Consider which aspirational assets (below) have the highest keyword alignment.`,
        evidence: {
          assets_checked:  opts.existingAssets.length,
          high_fit_count:  highFit,
          low_fit_count:   lowFit,
          fit_scores:      opts.existingAssets.map(a => ({ title: a.title, score: a.keyword_fit_score, label: a.keyword_fit_label })),
        },
      });
    }
  }

  return findings;
}

/* ════════════════════════════════════════════════════════════════
   REPORT RENDERING
═══════════════════════════════════════════════════════════════ */

function renderReport(opts: {
  keyword:            string;
  existingAssets:     ExistingAsset[];
  aspirationalAssets: AspirationalAsset[];
  prospects:          ProspectCategory[];
  findings:           Finding[];
  gscPageCount:       number;
  clusterCount:       number;
  competitorCount:    number;
  runId:              string;
  durationMs:         number;
  gscUpdatedAt?:      string | null;
}): string {
  const lines: string[] = [];
  const { existingAssets, aspirationalAssets, prospects, findings } = opts;

  lines.push(`# Off-page strategy: "${opts.keyword}"`);
  lines.push('');
  lines.push(`> **Honest scope.** This pillar generates *strategy* — what linkable assets you have, what to build, and who would link. It does NOT analyze your actual backlink profile (that requires paid external APIs like Ahrefs/Moz which are not integrated). All recommendations are LLM-generated based on your GSC data, cluster map, and competitor pages. Treat as a strategic starting point.`);
  lines.push('');

  /* Sparse-data warning — surfaces before the user reads anything else */
  if (opts.gscPageCount < 5 && opts.clusterCount === 0 && opts.competitorCount === 0) {
    lines.push(`> ⚠️ **Sparse input data.** Only ${opts.gscPageCount} GSC page${opts.gscPageCount === 1 ? '' : 's'} available, no cluster map, and no competitor data. The recommendations below are LLM-generated from very limited context — they represent reasonable starting points for this topic but are NOT grounded in your site's specific content profile. Run a rank pipeline first to seed competitor data, and let GSC populate more pages before treating this output as definitive.`);
    lines.push('');
  } else if (opts.gscPageCount < 5) {
    lines.push(`> ℹ️ **Limited GSC data.** Only ${opts.gscPageCount} GSC page${opts.gscPageCount === 1 ? '' : 's'} available. Asset identification is based on a small sample — re-run after GSC populates more top_pages for a fuller picture.`);
    lines.push('');
  }
  lines.push(`**Campaign keyword:** "${opts.keyword}"  `);
  lines.push(`**Data sources used:** ${opts.gscPageCount} GSC pages · ${opts.clusterCount} topical clusters · ${opts.competitorCount} competitor pages  `);
  lines.push(`**Existing linkable assets:** ${existingAssets.length}  `);
  lines.push(`**Aspirational assets to build:** ${aspirationalAssets.length}  `);
  lines.push(`**Prospect categories:** ${prospects.length}  `);
  lines.push(`**Audit run id:** \`${opts.runId.slice(0, 8)}\`  `);
  lines.push(`**Generated at:** ${new Date().toISOString()}`);
  lines.push(formatGscFreshnessLine(opts.gscUpdatedAt ?? null));
  lines.push('');

  /* Summary */
  const red    = findings.filter(f => f.severity === 'red').length;
  const amber  = findings.filter(f => f.severity === 'amber').length;
  const green  = findings.filter(f => f.severity === 'green').length;
  const info   = findings.filter(f => f.severity === 'info').length;
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Severity | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| 🔴 Critical | ${red} |`);
  lines.push(`| 🟡 Warning  | ${amber} |`);
  lines.push(`| 🟢 Strong   | ${green} |`);
  lines.push(`| ℹ️ Info     | ${info} |`);
  lines.push('');

  /* Source confidence — surface upfront. Off-page is LLM-heavy by design,
     so the reader needs to know which findings rest on GSC anchors and
     which rest purely on strategy reasoning. */
  const conf = weightedOffPageFindingConfidence(findings);
  lines.push('## Source confidence');
  lines.push('');
  if (conf.sourced_count > 0) {
    lines.push(`**Weighted confidence:** ${conf.mean}/100 across ${conf.sourced_count} sourced finding(s).`);
    const sourceCounts: Record<string, number> = {};
    for (const f of findings) {
      for (const k of f.sources_used || []) {
        const lbl = OFFPAGE_SOURCE_META[k].label;
        sourceCounts[lbl] = (sourceCounts[lbl] || 0) + 1;
      }
    }
    const sourceList = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => `${label} (${count})`)
      .join(', ');
    lines.push(`**Sources used:** ${sourceList}.`);
    lines.push('');
    lines.push('Note: this pillar is **strategy generation, not measurement.** No backlink-data APIs are queried. Recommendations rest primarily on Claude reasoning grounded by GSC pages, cluster mapping, and competitor snapshot context. A future SerpAPI/backlink integration would raise the confidence ceiling.');
  } else {
    lines.push('**No findings produced.** Confidence treated as low.');
  }
  if (conf.unattributed_count > 0) {
    lines.push('');
    lines.push(`⚠️ ${conf.unattributed_count} finding(s) lack source attribution.`);
  }
  lines.push('');

  /* Findings */
  if (findings.length > 0) {
    lines.push('## Findings');
    lines.push('');
    for (const f of findings) {
      const icon = f.severity === 'red' ? '🔴' : f.severity === 'amber' ? '🟡' : f.severity === 'green' ? '🟢' : 'ℹ️';
      lines.push(`### ${icon} ${f.finding_title}`);
      if (f.finding_detail) lines.push(f.finding_detail);
      if (f.recommendation) { lines.push(''); lines.push(`**Recommendation:** ${f.recommendation}`); }
      if (f.sources_used && f.sources_used.length > 0 && typeof f.confidence_score === 'number') {
        const labels = f.sources_used.map(k => OFFPAGE_SOURCE_META[k].label).join(' + ');
        lines.push(`*Source · ${labels} · confidence ${f.confidence_score}/100*`);
      }
      lines.push('');
    }
  }

  /* Existing linkable assets */
  lines.push(`## 🟢 Existing linkable assets (${existingAssets.length})`);
  lines.push('');
  if (existingAssets.length === 0) {
    lines.push(`_None identified. The site doesn't currently have pages that qualify as linkable assets — focus on building the aspirational assets below before launching outreach._`);
  } else {
    lines.push(`These pages are already on your site AND qualify as linkable assets. Outreach can start with these immediately.`);
    lines.push('');
    for (let i = 0; i < existingAssets.length; i++) {
      const a = existingAssets[i];
      const fitIcon  = a.keyword_fit_label === 'high' ? '🎯' : a.keyword_fit_label === 'medium' ? '🟡' : '⚠️';
      const fitLabel = a.keyword_fit_label === 'high' ? 'High keyword fit' : a.keyword_fit_label === 'medium' ? 'Medium keyword fit' : 'Low keyword fit';
      lines.push(`### ${i + 1}. ${a.title} (${formatAssetType(a.asset_type)})`);
      lines.push('');
      lines.push(`**URL:** [${a.url}](${a.url})`);
      lines.push('');
      lines.push(`**GSC stats:** ${a.gsc_impressions.toLocaleString()} impressions · ${a.gsc_clicks.toLocaleString()} clicks · avg position ${a.gsc_position.toFixed(1)}`);
      lines.push('');
      lines.push(`**Keyword fit:** ${fitIcon} ${fitLabel} (${a.keyword_fit_score}/100) — ${(a.keyword_fit_signals || []).join('; ')}`);
      lines.push('');
      lines.push(`**What it is:** ${a.description}`);
      lines.push('');
      lines.push(`**Why it's linkable:** ${a.why_linkable}`);
      lines.push('');
    }
  }

  /* Aspirational assets */
  lines.push(`## 🎯 Linkable assets to build (${aspirationalAssets.length})`);
  lines.push('');
  if (aspirationalAssets.length === 0) {
    lines.push(`_LLM didn't identify build-worthy asset gaps. Either the topic is well-served by existing assets, or the cluster/competitor data was too thin to ground recommendations._`);
  } else {
    lines.push(`These are assets the topic universe demands but the site doesn't have yet. Building them creates leverage for sustainable outreach.`);
    lines.push('');
    const sorted = [...aspirationalAssets].sort((a, b) => {
      const pri = { high: 0, medium: 1, low: 2 };
      return pri[a.build_priority] - pri[b.build_priority];
    });
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const priIcon = a.build_priority === 'high' ? '🔥' : a.build_priority === 'medium' ? '⚡' : '💡';
      lines.push(`### ${i + 1}. ${priIcon} ${a.title} (${formatAssetType(a.asset_type)})`);
      lines.push('');
      lines.push(`**Priority:** ${a.build_priority} · **Effort:** ${a.build_effort}`);
      lines.push('');
      lines.push(`**What to build:** ${a.description}`);
      lines.push('');
      lines.push(`**Why it's linkable:** ${a.why_linkable}`);
      lines.push('');
    }
  }

  /* Prospect categories */
  lines.push(`## 📣 Prospect categories & outreach angles (${prospects.length})`);
  lines.push('');
  if (prospects.length === 0) {
    lines.push(`_LLM couldn't generate prospect categories with confidence. This usually means the topic universe is too niche or the input data (clusters + competitors) was too thin. Consider whether off-page should be the priority pillar for this campaign._`);
  } else {
    lines.push(`The outreach strategy is structured by prospect type — each category has its own pitch angle and best-fit asset.`);
    lines.push('');
    const sorted = [...prospects].sort((a, b) => {
      const rate = { high: 0, medium: 1, low: 2 };
      return rate[a.estimated_response_rate] - rate[b.estimated_response_rate];
    });
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const rateIcon = p.estimated_response_rate === 'high' ? '🟢' : p.estimated_response_rate === 'medium' ? '🟡' : '🔵';
      lines.push(`### ${i + 1}. ${rateIcon} ${p.category_name}`);
      lines.push('');
      lines.push(`**Category type:** ${formatProspectKind(p.category_kind)} · **Response rate:** ${p.estimated_response_rate} · **Effort:** ${p.estimated_effort}`);
      lines.push('');
      lines.push(`**Who they are:** ${p.description}`);
      lines.push('');
      if (p.example_prospects.length > 0) {
        lines.push(`**Example prospects** (LLM-cited, verify before outreach):`);
        for (const ex of p.example_prospects) lines.push(`- ${ex}`);
        lines.push('');
      } else {
        lines.push(`**Example prospects:** _LLM didn't have confident citations — verify the category exists by searching for "${p.category_name.toLowerCase()} ${opts.keyword}" before outreach._`);
        lines.push('');
      }
      lines.push(`**Outreach angle:** ${p.outreach_angle}`);
      lines.push('');
      lines.push(`**Best asset match:** ${p.best_asset_match}`);
      lines.push('');
      if (p.pitch_template) {
        lines.push(`**Pitch template:**`);
        lines.push('');
        lines.push('```');
        lines.push(p.pitch_template);
        lines.push('```');
        lines.push('');
      }
    }
  }

  /* Methodology */
  lines.push('## Methodology + caveats');
  lines.push('');
  lines.push(`**What this audit IS:** Strategy generation based on three LLM calls:`);
  lines.push(`1. Identify existing linkable assets among GSC top pages`);
  lines.push(`2. Identify asset gaps to build (informed by cluster map + competitor pages)`);
  lines.push(`3. Generate prospect categories + outreach angles`);
  lines.push('');
  lines.push(`**What this audit is NOT:** A backlink profile audit. We do not have access to:`);
  lines.push(`- Your actual backlinks (need Ahrefs/Moz/Majestic API integration)`);
  lines.push(`- Anchor text distribution on your backlinks`);
  lines.push(`- Lost or new link velocity tracking`);
  lines.push(`- Competitor backlink profiles for gap analysis`);
  lines.push('');
  lines.push(`These all require paid third-party APIs that aren't integrated yet. When they are, this pillar will expand to include them.`);
  lines.push('');
  lines.push(`**LLM cost:** 3 calls (~$0.40-0.60). Each call has explicit instructions to return [] rather than invent data when uncertain.`);
  lines.push('');
  lines.push(`**Example prospects are LLM-cited, not verified.** The LLM was told to return empty arrays rather than fabricate domains. Still — verify any specific domain before sending outreach. If a category's example_prospects is empty, the LLM honestly didn't have confident citations.`);
  lines.push('');
  lines.push(`**Treat pitch templates as starting drafts.** The LLM doesn't know your voice, your existing relationships, or the prospect's recent content. Customize before sending.`);
  lines.push('');
  lines.push(`**Audit duration:** ${(opts.durationMs / 1000).toFixed(1)}s`);

  return lines.join('\n');
}

function buildHeadline(opts: {
  existing: number; aspirational: number; prospects: number; redCount: number; amberCount: number;
}): string {
  if (opts.redCount > 0) {
    return `🔴 Off-page readiness needs work — ${opts.existing} existing assets, ${opts.aspirational} to build, ${opts.prospects} prospect categor${opts.prospects === 1 ? 'y' : 'ies'}.`;
  }
  if (opts.existing === 0 && opts.aspirational > 0) {
    return `🟡 No existing linkable assets — build ${opts.aspirational} first, then outreach to ${opts.prospects} prospect categor${opts.prospects === 1 ? 'y' : 'ies'}.`;
  }
  if (opts.existing >= 3 && opts.prospects >= 3) {
    return `🟢 Off-page ready — ${opts.existing} existing assets + ${opts.prospects} prospect categories mapped. ${opts.aspirational} additional builds queued.`;
  }
  return `${opts.existing} existing assets, ${opts.aspirational} to build, ${opts.prospects} prospect categor${opts.prospects === 1 ? 'y' : 'ies'} mapped.`;
}

function buildConfidenceReason(
  existing: number, aspirational: number, prospects: number,
  gscPages: number, clusters: number, competitors: number,
): string {
  const parts: string[] = [];
  parts.push(`Generated from 3 LLM calls grounded in ${gscPages} GSC pages, ${clusters} clusters, ${competitors} competitor pages.`);
  if (existing === 0 && gscPages > 5) parts.push(`No existing linkable assets identified — site content may be too thin or commercial.`);
  if (aspirational === 0)              parts.push(`No build-worthy assets surfaced — input data may have been too sparse to ground recommendations.`);
  if (prospects < 3)                   parts.push(`Few prospect categories — topic universe may be too niche for sustained outreach.`);
  if (existing >= 3 && prospects >= 3) parts.push(`Asset + prospect coverage is solid; ready to act.`);
  parts.push(`Real backlink profile data is out of scope (no Ahrefs/Moz integration yet).`);
  return parts.join(' ');
}

function buildEmptyReport(keyword: string): string {
  return `# Off-page strategy pending for "${keyword}"

The off-page pillar needs at least one of these data sources to generate strategy:
- GSC top_pages (to identify existing linkable assets)
- Cluster map output (to understand topical universe)
- Competitor snapshot from a rank pipeline run

None are currently available for this project + campaign.

## What to do

1. **Connect GSC** (Data Room → Integrations) so we know which pages exist + get traffic
2. **Run \`rank me for "${keyword}"\`** at least once — captures the competitor_snapshot the off-page strategy uses
3. **Generate a cluster map** for this campaign (Cluster Map panel → "Generate cluster map") so we understand the topical universe

Then re-run this off-page audit.`;
}

/* ════════════════════════════════════════════════════════════════
   LLM HELPER + VALIDATORS
═══════════════════════════════════════════════════════════════ */

async function callClaude(sys: string, user: string, maxTokens: number, timeoutMs: number): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: maxTokens,
      system:     sys,
      messages:   [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  const text = (data?.content?.[0]?.text || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned);
}

function validateAssetType(raw: any): AssetType {
  const valid: AssetType[] = ['data_report', 'comparison_tool', 'free_tool', 'ultimate_guide',
    'visualization', 'template_or_kit', 'curated_list', 'original_research',
    'glossary_or_dictionary', 'tutorial_series', 'other'];
  const lc = String(raw).toLowerCase();
  return (valid.includes(lc as AssetType) ? lc : 'other') as AssetType;
}

function validateProspectKind(raw: any): ProspectKind {
  const valid: ProspectKind[] = ['journalist', 'blogger', 'complementary_tool', 'community',
    'educator', 'directory', 'podcast_or_video', 'resource_page', 'broken_link_target', 'other'];
  const lc = String(raw).toLowerCase();
  return (valid.includes(lc as ProspectKind) ? lc : 'other') as ProspectKind;
}

function validateEnum<T extends string>(raw: any, valid: T[], fallback: T): T {
  const lc = String(raw).toLowerCase() as T;
  return valid.includes(lc) ? lc : fallback;
}

function formatAssetType(t: AssetType): string {
  return t.replace(/_/g, ' ');
}

function formatProspectKind(k: ProspectKind): string {
  return k.replace(/_/g, ' ');
}
