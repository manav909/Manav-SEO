/* ════════════════════════════════════════════════════════════════
   api/lib/seo-internal-linking.ts
   Phase 17 — Internal Linking pillar engine

   Audits the internal link graph among a project's GSC top pages.
   Identifies orphans + underconnected high-value pages. Generates
   specific source→target link recommendations with LLM-crafted anchor
   text and placement hints.

   Pipeline:
     1. Resolve targets: cluster hubs (from Phase 16) + campaign target
        URLs (Phase 15) + any orphaned high-value pages
     2. Pull GSC top_pages — these are the audit universe (pages we have
        evidence are getting traffic)
     3. Fetch HTML for top N pages in parallel, parse internal anchors
     4. Build the link graph: who links to whom, with what anchor
     5. Compute findings:
        - Orphan pages (0 inlinks)
        - Low-inlink pages (<3 inlinks)
        - Generic-anchor over-representation
        - Cluster hubs with weak incoming links
     6. For each target, shortlist top 5 candidate source pages by topic match
     7. One LLM call per target (parallelized) generates anchor + placement
        suggestions for those 5 candidates
     8. Persist findings + recommendations, write report, surface high-value
        recommendations as opportunities

   Honest scope: audits the GSC top_pages universe, NOT a full site crawl.
   A page that doesn't appear in GSC top_pages won't be analyzed. Report
   explicitly states this.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { writeReportToPanel, recordOpportunity } from "./seo-campaign-engine.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";
const DEFAULT_PAGE_LIMIT = 20;
const FETCH_TIMEOUT_MS = 12_000;

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

interface AnchorEntry {
  source_url:  string;
  target_url:  string;
  anchor_text: string;
  is_generic:  boolean;
}

interface PageNode {
  url:         string;
  fetched:     boolean;
  http_status: number | null;
  fetch_error: string | null;
  title:       string | null;
  h1:          string | null;
  word_count:  number;
  outlinks:    AnchorEntry[];        // links FROM this page
  inlinks:     AnchorEntry[];        // links TO this page (computed after all pages fetched)
  /* Provenance */
  gsc_clicks:      number;
  gsc_impressions: number;
  gsc_position:    number;
  /* Cluster mapping (from Phase 16, if available) */
  cluster_name:    string | null;
  cluster_role:    'hub' | 'spoke' | null;
}

interface LinkTarget {
  url:           string;
  kind:          'cluster_hub' | 'campaign_target' | 'money_page' | 'orphan_remediation';
  reason:        string;                       // why this is a target
  cluster_name?: string;
  /* For matching candidates */
  topic_tokens:  string[];
}

interface Recommendation {
  source_url:          string;
  target_url:          string;
  suggested_anchor:    string;
  placement_hint:      string;
  rationale:           string;
  topic_overlap_score: number;
  target_kind:         'cluster_hub' | 'campaign_target' | 'money_page' | 'orphan_remediation' | 'general';
  source_kind:         'gsc_top_page' | 'cluster_spoke' | 'other';
  source_impressions:  number;
  source_inlinks:      number;
}

interface Finding {
  finding_kind:    'orphan_page' | 'low_inlinks' | 'thin_outlinks' | 'generic_anchors'
                 | 'cluster_hub_isolated' | 'high_value_underconnected';
  severity:        'green' | 'amber' | 'red' | 'info';
  finding_title:   string;
  finding_detail?: string;
  recommendation?: string;
  affected_url?:   string;
  evidence?:       any;
  /* Phase 17.1 — Senior DMS source-tracing (2026-05-24) */
  sources_used?:     LinkSourceKey[];
  confidence_score?: number;
}

/* ═══════════════════════════════════════════════════════════════════
   SOURCE-CONFIDENCE MAPPING for internal-linking outputs (Phase 17.1)
   Added 2026-05-24 as part of the Senior DMS pillar source-tracing
   template (established on seo-technical-audit, replicated to all 5).

   This engine's findings combine:
   • gsc_top_pages — live GSC top_pages (the page universe)
   • html_fetch    — fetched page HTML + parsed anchor graph
   • cluster_data  — Phase 16 cluster mapping (hub/spoke assignments)
   • llm_anchor    — Claude-generated anchor text + placement suggestions

   Numbers align with intelligenceFabric: gsc_live=95, crawl_jina=85
   (we use 87 for html_fetch since the metrics we extract — anchors,
   inlinks — are well-defined DOM observations), intelligence_output=80
   (cluster_data is a derived intelligence output from the cluster_map
   pillar), claude_inference=65.
═══════════════════════════════════════════════════════════════════ */

type LinkSourceKey =
  | 'gsc_top_pages'
  | 'html_fetch'
  | 'cluster_data'
  | 'llm_anchor';

const LINK_SOURCE_META: Record<
  LinkSourceKey,
  { confidence: number; label: string; sourceType: string }
> = {
  gsc_top_pages: { confidence: 95, label: 'GSC top_pages (live)',                  sourceType: 'gsc_live' },
  html_fetch:    { confidence: 87, label: 'Live HTML fetch + anchor graph',        sourceType: 'crawl_jina' },
  cluster_data:  { confidence: 80, label: 'Cluster-map intelligence (Phase 16)',   sourceType: 'intelligence_output' },
  llm_anchor:    { confidence: 65, label: 'Claude anchor + placement suggestions', sourceType: 'claude_inference' },
};

function linkSourcesConfidence(keys: LinkSourceKey[]): number {
  if (!keys || keys.length === 0) return 0;
  const total = keys.reduce((acc, k) => acc + LINK_SOURCE_META[k].confidence, 0);
  return Math.round(total / keys.length);
}

/** Map a finding_kind to the sources that informed it. Some kinds rely on
 *  multiple data sources (e.g. orphan_page needs both GSC impression data
 *  and the anchor graph from html_fetch); others rely on a single source
 *  (e.g. generic_anchors is pure html_fetch). */
function findingKindSources(kind: Finding['finding_kind']): LinkSourceKey[] {
  switch (kind) {
    case 'orphan_page':               return ['gsc_top_pages', 'html_fetch'];
    case 'low_inlinks':               return ['gsc_top_pages', 'html_fetch'];
    case 'thin_outlinks':             return ['html_fetch'];
    case 'generic_anchors':           return ['html_fetch'];
    case 'cluster_hub_isolated':      return ['html_fetch', 'cluster_data'];
    case 'high_value_underconnected': return ['gsc_top_pages', 'html_fetch'];
    default:                          return ['html_fetch'];
  }
}

/** Decorate findings with source attribution post-emission. Idempotent —
 *  if a finding already has sources_used, it's left alone. Findings that
 *  fail to map are surfaced separately as unattributed. */
function attachFindingSources(findings: Finding[]): void {
  for (const f of findings) {
    if (f.sources_used && f.sources_used.length > 0) continue;
    const sources = findingKindSources(f.finding_kind);
    f.sources_used = sources;
    f.confidence_score = linkSourcesConfidence(sources);
  }
}

function weightedLinkFindingConfidence(findings: Finding[]): {
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

export async function runInternalLinkingAudit(opts: {
  campaignId:  string;
  panelId?:    string;
  triggeredBy?: 'cron' | 'manual';
  pageLimit?:  number;
}): Promise<{
  success: boolean;
  audit_run_id?: string;
  pages_fetched?: number;
  findings_count?: number;
  recommendation_count?: number;
  report_id?: string;
  error?: string;
}> {
  const triggeredBy = opts.triggeredBy || 'manual';
  const pageLimit = Math.min(opts.pageLimit || DEFAULT_PAGE_LIMIT, 30);
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
        .select("id").eq("campaign_id", opts.campaignId).eq("pillar", 'internal_linking').maybeSingle();
      panelId = (p as any)?.id;
    }
    if (!panelId) return { success: false, error: 'no internal_linking panel found for this campaign' };

    /* 1. Pull GSC top_pages (audit universe) */
    const [gscPages, gscFreshnessAt] = await Promise.all([
      readGscPages(c.project_id),
      readGscFreshness(c.project_id),
    ]);
    if (gscPages.length === 0) {
      return await writePendingReport(c, opts.campaignId, panelId, triggeredBy,
        `No GSC top_pages data available — internal linking audit needs the page universe.`,
        `# Internal linking audit pending\n\nNo GSC top_pages data found for this project. The audit needs to know which pages exist + get traffic before it can analyze the link graph.\n\nConnect GSC and let it populate top_pages, then re-run.`);
    }

    /* 2. Resolve link targets (Phase 16 cluster hubs + Phase 15 campaign targets) */
    const [clusterTargets, campaignTargets] = await Promise.all([
      resolveClusterHubTargets(opts.campaignId, c.project_id),
      resolveCampaignTargets(c.project_id),
    ]);

    /* 3. Pull cluster mapping so we can label nodes */
    const clusterByUrl = await loadClusterMappingByUrl(opts.campaignId);

    /* 4. Fetch HTML for top N pages in parallel */
    const audited = gscPages.slice(0, pageLimit);
    const pageNodes = await fetchAllPages(audited, clusterByUrl);
    const fetchedCount = pageNodes.filter(n => n.fetched).length;
    const failedCount  = pageNodes.length - fetchedCount;

    if (fetchedCount === 0) {
      return await writePendingReport(c, opts.campaignId, panelId, triggeredBy,
        `Could not fetch any pages — all ${pageNodes.length} HTTP requests failed.`,
        `# Internal linking audit failed\n\nThe audit attempted to fetch ${pageNodes.length} top pages from GSC but none returned valid HTML. This usually means the site is blocking the audit bot or has a network issue.\n\nFirst page error: ${pageNodes[0]?.fetch_error || '(unknown)'}.\n\nRe-try in a few minutes, or whitelist the audit user-agent on your server.`);
    }

    /* 5. Build the inlink graph from outlinks */
    computeInlinks(pageNodes);

    /* 6. Compute findings */
    const findings = computeLinkGraphFindings(pageNodes, clusterTargets);
    /* 6b. Phase 17.1 — attach source attribution per finding (post-compute,
       idempotent). Each finding_kind maps to the data sources that informed
       it; per-finding confidence is the weighted-mean across those sources. */
    attachFindingSources(findings);

    /* 7. Build recommendations: shortlist candidates per target, then LLM-enrich */
    const allTargets: LinkTarget[] = [...clusterTargets, ...campaignTargets];
    /* Add orphan_remediation targets for high-value orphans */
    const orphanTargets = pageNodes
      .filter(n => n.fetched && n.inlinks.length === 0 && n.gsc_impressions >= 50)
      .slice(0, 5)
      .map((n): LinkTarget => ({
        url:           n.url,
        kind:          'orphan_remediation',
        reason:        `Orphan page (0 internal inlinks) with ${n.gsc_impressions.toLocaleString()} GSC impressions — high-value page invisible to internal authority flow.`,
        topic_tokens:  tokenize((n.title || '') + ' ' + (n.h1 || '') + ' ' + n.url),
      }));
    allTargets.push(...orphanTargets);

    /* Dedupe targets by URL */
    const uniqueTargets = dedupeTargets(allTargets);

    /* Heuristic shortlist + LLM enrichment per target */
    const recommendations: Recommendation[] = await buildRecommendations(uniqueTargets, pageNodes, c.keyword);
    const llmCallsUsed = uniqueTargets.length;

    /* 8. Persist audit run */
    const auditRunId = crypto.randomUUID();
    const totalLinks = pageNodes.reduce((s, n) => s + n.outlinks.length, 0);
    const orphanCount = pageNodes.filter(n => n.fetched && n.inlinks.length === 0).length;
    const durationMs = Date.now() - startTime;

    await db().from("internal_link_audit_runs").insert({
      id:                   auditRunId,
      campaign_id:          opts.campaignId,
      panel_id:             panelId,
      project_id:           c.project_id,
      triggered_by:         triggeredBy,
      pages_attempted:      pageNodes.length,
      pages_fetched:        fetchedCount,
      pages_failed:         failedCount,
      total_links_found:    totalLinks,
      orphan_count:         orphanCount,
      recommendation_count: recommendations.length,
      llm_calls_used:       llmCallsUsed,
      duration_ms:          durationMs,
    });

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
        affected_url:   f.affected_url?.slice(0, 500) || null,
        evidence:       f.evidence || null,
      }));
      await db().from("internal_link_findings").insert(findingRows);
    }

    /* Persist recommendations */
    if (recommendations.length > 0) {
      const recRows = recommendations.map(r => ({
        run_id:              auditRunId,
        campaign_id:         opts.campaignId,
        panel_id:            panelId,
        project_id:          c.project_id,
        source_url:          r.source_url.slice(0, 500),
        target_url:          r.target_url.slice(0, 500),
        suggested_anchor:    r.suggested_anchor.slice(0, 200),
        placement_hint:      r.placement_hint?.slice(0, 500) || null,
        rationale:           r.rationale?.slice(0, 1000) || null,
        topic_overlap_score: r.topic_overlap_score,
        target_kind:         r.target_kind,
        source_kind:         r.source_kind,
        source_impressions:  r.source_impressions,
        source_inlinks:      r.source_inlinks,
      }));
      await db().from("internal_link_recommendations").insert(recRows);
    }

    /* 9. Write report */
    const redCount   = findings.filter(f => f.severity === 'red').length;
    const amberCount = findings.filter(f => f.severity === 'amber').length;
    const panelStatus: 'red' | 'amber' | 'green' = redCount > 0 ? 'red' : amberCount > 0 ? 'amber' : 'green';

    /* Honest confidence rating — combines fetch coverage (how much of the
       audit scope actually succeeded) AND source quality (weighted-mean
       confidence across findings). Either dimension dropping low pulls the
       overall rating down. Previously only fetch coverage was considered. */
    const sourceConf = weightedLinkFindingConfidence(findings);
    const fetchRating: 'high' | 'medium' | 'low' =
      fetchedCount >= pageNodes.length * 0.8 ? 'high' :
      fetchedCount >= pageNodes.length * 0.5 ? 'medium' : 'low';
    const sourceRating: 'high' | 'medium' | 'low' =
      sourceConf.sourced_count === 0 ? 'low' :
      sourceConf.mean >= 85           ? 'high' :
      sourceConf.mean >= 72           ? 'medium' : 'low';
    const overallRating: 'high' | 'medium' | 'low' =
      (fetchRating === 'low'    || sourceRating === 'low')    ? 'low' :
      (fetchRating === 'medium' || sourceRating === 'medium') ? 'medium' : 'high';

    const reportR = await writeReportToPanel({
      campaignId:        opts.campaignId,
      projectId:         c.project_id,
      pillar:            'internal_linking',
      panelId,
      reportKind:        triggeredBy === 'cron' ? 'scheduled_recheck' : 'manual_refresh',
      generatedBy:       triggeredBy,
      llmCallsUsed,
      dataSources:       ['gsc', 'html_fetch', 'llm'],
      confidenceRating:  overallRating,
      confidenceReason:  [
        `Fetched ${fetchedCount} of ${pageNodes.length} pages (${fetchRating}).`,
        sourceConf.sourced_count > 0
          ? `Source-weighted confidence across ${sourceConf.sourced_count} finding(s): ${sourceConf.mean}/100 (${sourceRating}).`
          : 'No findings produced — confidence treated as low.',
        sourceConf.unattributed_count > 0
          ? `${sourceConf.unattributed_count} finding(s) lack source attribution.`
          : null,
        `Audit scope is the GSC top_pages universe — full-site crawl is out of scope.`,
        `${llmCallsUsed} LLM calls used for anchor/placement suggestions (claude_inference, confidence 65).`,
      ].filter(Boolean).join(' '),
      title:             `Internal linking audit: ${fetchedCount} pages, ${recommendations.length} recommendations`,
      bodyMd:            renderReport({
        keyword:         c.keyword,
        pageNodes,
        findings,
        recommendations,
        clusterTargets,
        campaignTargets,
        orphanTargets,
        fetchedCount,
        failedCount,
        totalLinks,
        durationMs,
        runId:           auditRunId,
        gscUpdatedAt:    gscFreshnessAt,
      }),
      summary:           buildHeadline({
        fetchedCount, orphanCount, recCount: recommendations.length, redCount, amberCount,
      }),
      tags:              ['internal_linking', `keyword:${c.keyword.toLowerCase()}`,
                          ...(orphanCount > 0 ? [`orphans:${orphanCount}`] : []),
                          ...(recommendations.length > 0 ? [`recs:${recommendations.length}`] : [])],
      metricSnapshot:    {
        pages_fetched:        fetchedCount,
        pages_failed:         failedCount,
        orphan_count:         orphanCount,
        total_links:          totalLinks,
        recommendation_count: recommendations.length,
        red_findings:         redCount,
        amber_findings:       amberCount,
        llm_calls:            llmCallsUsed,
        duration_ms:          durationMs,
      },
      updatePanelStatus: true,
      newPanelStatus:    panelStatus,
    });

    /* Backfill report_id onto run */
    if (reportR.report_id) {
      await db().from("internal_link_audit_runs")
        .update({ report_id: reportR.report_id }).eq("id", auditRunId);
    }

    /* 10. Surface high-priority recommendations as opportunities */
    const topRecs = recommendations
      .filter(r => r.target_kind === 'cluster_hub' || r.target_kind === 'campaign_target' || r.target_kind === 'orphan_remediation')
      .slice(0, 8);  // cap to avoid inbox flood

    for (const r of topRecs) {
      const valueLabel = r.target_kind === 'orphan_remediation' ? 'high' : 'medium';
      const oppR = await recordOpportunity({
        projectId:        c.project_id,
        sourceKind:       'cron_sweep',
        sourceCampaignId: opts.campaignId,
        sourcePanelId:    panelId,
        sourceStepId:     'internal_linking',
        kind:             'quick_win',
        title:            `Add internal link: ${cleanUrl(r.source_url)} → ${cleanUrl(r.target_url)}`,
        description:      `Anchor: "${r.suggested_anchor}". Placement: ${r.placement_hint || 'near top of relevant section'}. Rationale: ${r.rationale}`,
        evidence:         {
          source_url:       r.source_url,
          target_url:       r.target_url,
          suggested_anchor: r.suggested_anchor,
          placement_hint:   r.placement_hint,
          target_kind:      r.target_kind,
          audit_run_id:     auditRunId,
        },
        estimatedValue:   valueLabel,
        estimatedEffort:  'low',
        suggestedAction:  'kanban_task',
      });
      /* Link the opportunity back to the recommendation (best-effort) */
      if (oppR.opportunity_id) {
        await db().from("internal_link_recommendations")
          .update({ opportunity_id: oppR.opportunity_id })
          .eq("run_id", auditRunId)
          .eq("source_url", r.source_url)
          .eq("target_url", r.target_url);
      }
    }

    /* 11. Surface orphan findings as opportunities */
    const orphanFindings = findings.filter(f => f.finding_kind === 'orphan_page' || f.finding_kind === 'cluster_hub_isolated');
    for (const of_ of orphanFindings.slice(0, 5)) {
      await recordOpportunity({
        projectId:        c.project_id,
        sourceKind:       'cron_sweep',
        sourceCampaignId: opts.campaignId,
        sourcePanelId:    panelId,
        sourceStepId:     'internal_linking',
        kind:             'technical',
        title:            of_.finding_title.slice(0, 240),
        description:      of_.recommendation || of_.finding_detail || 'Investigate the link graph issue.',
        evidence:         { ...of_.evidence, audit_run_id: auditRunId, finding_kind: of_.finding_kind },
        estimatedValue:   of_.severity === 'red' ? 'high' : 'medium',
        estimatedEffort:  'medium',
        suggestedAction:  'investigate',
      });
    }

    /* Update next_recheck_at */
    const { data: panelRow } = await db().from("seo_campaign_panels")
      .select("recheck_cadence_days").eq("id", panelId).maybeSingle();
    const cadence = (panelRow as any)?.recheck_cadence_days || 30;
    await db().from("seo_campaign_panels").update({
      last_assessed_at: new Date().toISOString(),
      next_recheck_at:  new Date(Date.now() + cadence * 86_400_000).toISOString(),
    }).eq("id", panelId);

    return {
      success:              true,
      audit_run_id:         auditRunId,
      pages_fetched:        fetchedCount,
      findings_count:       findings.length,
      recommendation_count: recommendations.length,
      report_id:            reportR.report_id,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'internal linking audit failed' };
  }
}

/** Read existing audit findings + recommendations for a panel. */
export async function getPanelLinkAuditData(opts: {
  panelId: string;
  limit?:  number;
}): Promise<{ success: boolean; findings?: any[]; recommendations?: any[]; error?: string }> {
  try {
    const limit = Math.min(opts.limit || 50, 200);
    const [findRes, recRes] = await Promise.all([
      db().from("internal_link_findings")
        .select("*").eq("panel_id", opts.panelId)
        .order("created_at", { ascending: false }).limit(limit),
      db().from("internal_link_recommendations")
        .select("*").eq("panel_id", opts.panelId)
        .order("created_at", { ascending: false }).limit(limit),
    ]);
    return { success: true, findings: findRes.data || [], recommendations: recRes.data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || 'list failed' };
  }
}

/** Mark a recommendation as completed / dismissed / in-progress. */
export async function updateRecommendationStatus(opts: {
  recommendationId: string;
  status:           'pending' | 'in_progress' | 'completed' | 'dismissed';
  note?:            string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await db().from("internal_link_recommendations").update({
      status:        opts.status,
      resolved_at:   opts.status === 'completed' || opts.status === 'dismissed' ? new Date().toISOString() : null,
      resolved_note: opts.note?.slice(0, 500) || null,
    }).eq("id", opts.recommendationId);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'update failed' };
  }
}

/* ════════════════════════════════════════════════════════════════
   TARGET RESOLUTION
═══════════════════════════════════════════════════════════════ */

async function resolveClusterHubTargets(campaignId: string, projectId: string): Promise<LinkTarget[]> {
  try {
    /* Get the most recent cluster_map audit run's clusters */
    const { data: clusters } = await db().from("cluster_map_clusters")
      .select("cluster_name, hub_page_url, primary_intent, queries, topic_summary")
      .eq("campaign_id", campaignId)
      .not("hub_page_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!clusters || (clusters as any[]).length === 0) return [];

    /* Dedupe by hub_page_url — only most recent per URL */
    const seen = new Set<string>();
    const targets: LinkTarget[] = [];
    for (const cl of (clusters as any[])) {
      if (seen.has(cl.hub_page_url)) continue;
      seen.add(cl.hub_page_url);
      const queryTokens = (cl.queries || []).flatMap((q: any) => tokenize(q.query || ''));
      targets.push({
        url:           cl.hub_page_url,
        kind:          'cluster_hub',
        reason:        `Cluster hub for "${cl.cluster_name}" (${cl.primary_intent}). ${cl.topic_summary || ''}`,
        cluster_name:  cl.cluster_name,
        topic_tokens:  Array.from(new Set([...tokenize(cl.cluster_name), ...queryTokens])),
      });
    }
    return targets.slice(0, 10);
  } catch (e: any) {
    console.log(`[resolveClusterHubTargets] failed: ${e?.message}`);
    return [];
  }
}

async function resolveCampaignTargets(projectId: string): Promise<LinkTarget[]> {
  try {
    /* Pull all active campaign panels' target_urls for this project (Phase 15) */
    const { data: panels } = await db().from("seo_campaign_panels")
      .select("target_url, campaign_id, seo_campaigns(keyword)")
      .eq("project_id", projectId)
      .eq("pillar", 'technical_audit')
      .not("target_url", "is", null);

    if (!panels) return [];
    const seen = new Set<string>();
    const targets: LinkTarget[] = [];
    for (const p of (panels as any[])) {
      const url = p.target_url;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const keyword = p.seo_campaigns?.keyword || '';
      targets.push({
        url,
        kind:         'campaign_target',
        reason:       `Campaign target URL for keyword "${keyword}".`,
        topic_tokens: tokenize(keyword + ' ' + url),
      });
    }
    return targets.slice(0, 10);
  } catch (e: any) {
    console.log(`[resolveCampaignTargets] failed: ${e?.message}`);
    return [];
  }
}

async function loadClusterMappingByUrl(campaignId: string): Promise<Record<string, { cluster_name: string; role: 'hub' | 'spoke' }>> {
  try {
    const { data: clusters } = await db().from("cluster_map_clusters")
      .select("cluster_name, hub_page_url, spoke_pages")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(20);
    const mapping: Record<string, { cluster_name: string; role: 'hub' | 'spoke' }> = {};
    for (const cl of ((clusters as any[]) || [])) {
      if (cl.hub_page_url && !mapping[cl.hub_page_url]) {
        mapping[cl.hub_page_url] = { cluster_name: cl.cluster_name, role: 'hub' };
      }
      for (const sp of (cl.spoke_pages || [])) {
        if (sp && !mapping[sp]) {
          mapping[sp] = { cluster_name: cl.cluster_name, role: 'spoke' };
        }
      }
    }
    return mapping;
  } catch { return {}; }
}

function dedupeTargets(targets: LinkTarget[]): LinkTarget[] {
  const seen = new Set<string>();
  const result: LinkTarget[] = [];
  for (const t of targets) {
    const norm = normalizeUrl(t.url);
    if (seen.has(norm)) continue;
    seen.add(norm);
    result.push(t);
  }
  return result;
}

/* ════════════════════════════════════════════════════════════════
   HTML FETCH + LINK EXTRACTION
═══════════════════════════════════════════════════════════════ */

async function fetchAllPages(
  gscPages: GscPageRow[],
  clusterByUrl: Record<string, { cluster_name: string; role: 'hub' | 'spoke' }>,
): Promise<PageNode[]> {
  /* Fetch all pages in parallel */
  const results = await Promise.allSettled(
    gscPages.map(p => fetchAndParsePage(p, clusterByUrl))
  );
  const nodes: PageNode[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      nodes.push(r.value);
    } else {
      /* Even on failure, record a node so we can report the failure */
      const p = gscPages[i];
      nodes.push({
        url:             p.page,
        fetched:         false,
        http_status:     null,
        fetch_error:     r.reason?.message || 'fetch rejected',
        title:           null,
        h1:              null,
        word_count:      0,
        outlinks:        [],
        inlinks:         [],
        gsc_clicks:      p.clicks,
        gsc_impressions: p.impressions,
        gsc_position:    p.position,
        cluster_name:    clusterByUrl[p.page]?.cluster_name || null,
        cluster_role:    clusterByUrl[p.page]?.role || null,
      });
    }
  }
  return nodes;
}

async function fetchAndParsePage(
  p: GscPageRow,
  clusterByUrl: Record<string, { cluster_name: string; role: 'hub' | 'spoke' }>,
): Promise<PageNode> {
  const baseNode: PageNode = {
    url:             p.page,
    fetched:         false,
    http_status:     null,
    fetch_error:     null,
    title:           null,
    h1:              null,
    word_count:      0,
    outlinks:        [],
    inlinks:         [],
    gsc_clicks:      p.clicks,
    gsc_impressions: p.impressions,
    gsc_position:    p.position,
    cluster_name:    clusterByUrl[p.page]?.cluster_name || null,
    cluster_role:    clusterByUrl[p.page]?.role || null,
  };

  try {
    const res = await fetch(p.page, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
      headers: {
        'User-Agent': 'SEOSeason-Bot/1.0 (+https://seoseason.com; Internal linking audit)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    baseNode.http_status = res.status;
    if (!res.ok) {
      baseNode.fetch_error = `HTTP ${res.status}`;
      return baseNode;
    }
    const html = await res.text();
    baseNode.fetched = true;

    /* Extract title */
    const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    baseNode.title = titleMatch?.[1]?.trim() || null;

    /* Extract H1 */
    const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    if (h1Match) {
      baseNode.h1 = h1Match[1].replace(/<[^>]+>/g, '').trim();
    }

    /* Word count (rough) */
    const textOnly = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                         .replace(/<style[\s\S]*?<\/style>/gi, '')
                         .replace(/<[^>]+>/g, ' ')
                         .replace(/\s+/g, ' ')
                         .trim();
    baseNode.word_count = textOnly.split(/\s+/).length;

    /* Extract all anchor tags with hrefs */
    baseNode.outlinks = extractInternalAnchors(html, p.page);

    return baseNode;
  } catch (e: any) {
    baseNode.fetch_error = e?.message || 'fetch failed';
    return baseNode;
  }
}

/** Extract internal anchor tags from HTML. Internal = same hostname as the source. */
function extractInternalAnchors(html: string, sourceUrl: string): AnchorEntry[] {
  const anchors: AnchorEntry[] = [];
  let sourceHost: string;
  try {
    sourceHost = new URL(sourceUrl).hostname;
  } catch {
    return anchors;
  }

  /* Match <a ... href="..." ...>text</a> with non-greedy text */
  const re = /<a\s+[^>]*?href=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = match[1].trim();
    const rawText = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;

    let targetUrl: string;
    try {
      targetUrl = new URL(href, sourceUrl).toString();
    } catch { continue; }

    /* Internal only */
    let targetHost: string;
    try { targetHost = new URL(targetUrl).hostname; } catch { continue; }
    if (targetHost !== sourceHost) continue;

    /* Strip fragments for graph purposes */
    targetUrl = targetUrl.split('#')[0];
    if (targetUrl === sourceUrl) continue;

    const anchorText = rawText.slice(0, 200);
    anchors.push({
      source_url:  sourceUrl,
      target_url:  targetUrl,
      anchor_text: anchorText,
      is_generic:  isGenericAnchor(anchorText),
    });
  }
  return anchors;
}

const GENERIC_ANCHORS = new Set([
  'click here', 'read more', 'learn more', 'here', 'this', 'this article', 'this page',
  'more', 'see more', 'see here', 'view more', 'continue reading', 'go here', 'this link',
  'find out more', 'check it out', 'check this out', 'this guide', 'this post',
]);

function isGenericAnchor(text: string): boolean {
  const lc = text.toLowerCase().trim();
  if (lc.length === 0 || lc.length < 3) return true;
  if (GENERIC_ANCHORS.has(lc)) return true;
  /* Short generic patterns */
  if (lc.length <= 4 && /^(here|more|view|next|prev|back)$/.test(lc)) return true;
  return false;
}

function computeInlinks(nodes: PageNode[]): void {
  /* Build a map of normalized URL → node */
  const nodeByUrl: Record<string, PageNode> = {};
  for (const n of nodes) {
    nodeByUrl[normalizeUrl(n.url)] = n;
  }
  /* For each outlink, find the target node and append to its inlinks */
  for (const n of nodes) {
    for (const link of n.outlinks) {
      const targetNorm = normalizeUrl(link.target_url);
      const targetNode = nodeByUrl[targetNorm];
      if (targetNode) {
        targetNode.inlinks.push(link);
      }
    }
  }
}

/* ════════════════════════════════════════════════════════════════
   FINDINGS
═══════════════════════════════════════════════════════════════ */

function computeLinkGraphFindings(nodes: PageNode[], clusterTargets: LinkTarget[]): Finding[] {
  const findings: Finding[] = [];
  const fetched = nodes.filter(n => n.fetched);

  /* Orphans — fetched pages with 0 inlinks */
  const orphans = fetched.filter(n => n.inlinks.length === 0);
  for (const o of orphans.slice(0, 10)) {
    const sev: 'red' | 'amber' | 'info' = o.gsc_impressions >= 100 ? 'red'
                                       : o.gsc_impressions >= 20  ? 'amber' : 'info';
    findings.push({
      finding_kind:   'orphan_page',
      severity:       sev,
      finding_title:  `Orphan page: ${cleanUrl(o.url)} (${o.gsc_impressions.toLocaleString()} impressions)`,
      finding_detail: `This page receives 0 internal links from other audited pages but has GSC impressions (${o.gsc_impressions.toLocaleString()} impr, ${o.gsc_clicks.toLocaleString()} clicks, avg position ${o.gsc_position.toFixed(1)}). Orphan pages get search traffic externally but pass no internal authority — they're invisible to your site's link equity flow.`,
      recommendation: o.gsc_impressions >= 100
        ? `High-priority orphan — this page is getting search traffic but no internal links. Add 3-5 inbound internal links from topically related pages. Use descriptive anchors based on the page's H1 or primary topic.`
        : `Lower-priority orphan — add inbound internal links to improve discoverability and rank potential.`,
      affected_url:   o.url,
      evidence:       {
        inlink_count:    0,
        gsc_impressions: o.gsc_impressions,
        gsc_clicks:      o.gsc_clicks,
        gsc_position:    o.gsc_position,
        title:           o.title,
      },
    });
  }

  /* Low-inlinks — fetched pages with 1-2 inlinks (could be better) */
  const lowInlinks = fetched.filter(n => n.inlinks.length >= 1 && n.inlinks.length <= 2 && n.gsc_impressions >= 50);
  for (const n of lowInlinks.slice(0, 5)) {
    findings.push({
      finding_kind:   'low_inlinks',
      severity:       'amber',
      finding_title:  `Underconnected: ${cleanUrl(n.url)} has only ${n.inlinks.length} internal inlink${n.inlinks.length === 1 ? '' : 's'}`,
      finding_detail: `Page receives ${n.inlinks.length} internal link(s) from audited pages but earns ${n.gsc_impressions.toLocaleString()} GSC impressions. Pages with 3+ inbound topical links generally rank better.`,
      recommendation: `Add 2-3 more internal links from related content pages.`,
      affected_url:   n.url,
      evidence:       {
        inlink_count:    n.inlinks.length,
        gsc_impressions: n.gsc_impressions,
      },
    });
  }

  /* Thin outlinks — fetched pages that contribute few outbound internal links */
  const thinOutlinks = fetched.filter(n => n.outlinks.length < 3 && n.word_count > 300);
  if (thinOutlinks.length > 0) {
    findings.push({
      finding_kind:   'thin_outlinks',
      severity:       'info',
      finding_title:  `${thinOutlinks.length} substantial page${thinOutlinks.length === 1 ? '' : 's'} with <3 internal outlinks`,
      finding_detail: `${thinOutlinks.length} fetched pages have meaningful content (>300 words) but link to fewer than 3 other internal pages. These pages aren't passing equity into the site's link graph as effectively as they could.`,
      recommendation: `For each thin-outlink page, identify 3-5 topically related pages and add contextual links with descriptive anchors. Don't add links for the sake of count — link to genuinely related content.`,
      evidence:       { thin_outlink_count: thinOutlinks.length },
    });
  }

  /* Generic anchor over-representation */
  const allAnchors = fetched.flatMap(n => n.outlinks);
  if (allAnchors.length > 0) {
    const genericCount = allAnchors.filter(a => a.is_generic).length;
    const pct = Math.round((genericCount / allAnchors.length) * 100);
    if (pct >= 20) {
      findings.push({
        finding_kind:   'generic_anchors',
        severity:       pct >= 40 ? 'amber' : 'info',
        finding_title:  `${pct}% of internal anchors are generic ("${Array.from(new Set(allAnchors.filter(a => a.is_generic).map(a => a.anchor_text).slice(0, 3))).join('", "')}")`,
        finding_detail: `Out of ${allAnchors.length} internal links analyzed, ${genericCount} use generic anchor text (click here, read more, etc). Generic anchors waste a strong on-page ranking signal — Google uses anchor text to understand what the linked page is about.`,
        recommendation: `Audit your most-linked pages and rewrite generic anchors to be descriptive. Use keyword-rich phrases that describe the target page's topic. Aim for <10% generic anchors.`,
        evidence:       {
          total_anchors:   allAnchors.length,
          generic_anchors: genericCount,
          generic_pct:     pct,
        },
      });
    }
  }

  /* Cluster hub isolation — hubs with weak incoming links */
  const hubByUrl: Record<string, LinkTarget> = {};
  for (const t of clusterTargets) hubByUrl[normalizeUrl(t.url)] = t;
  for (const n of fetched) {
    const hub = hubByUrl[normalizeUrl(n.url)];
    if (hub && n.inlinks.length < 3) {
      findings.push({
        finding_kind:   'cluster_hub_isolated',
        severity:       'amber',
        finding_title:  `Cluster hub underconnected: "${hub.cluster_name}" hub has ${n.inlinks.length} inlinks`,
        finding_detail: `The hub page for cluster "${hub.cluster_name}" (${n.url}) only receives ${n.inlinks.length} internal link${n.inlinks.length === 1 ? '' : 's'} from audited pages. Hub pages need strong inlink density from their cluster's spoke pages to consolidate topical authority.`,
        recommendation: `Add internal links to this hub from at least 5-8 spoke pages within the same cluster. Use descriptive anchors based on the hub's primary topic.`,
        affected_url:   n.url,
        evidence:       {
          cluster_name:  hub.cluster_name,
          inlink_count:  n.inlinks.length,
        },
      });
    }
  }

  /* High-value underconnected: high GSC impressions + low inlinks */
  const highValueUnder = fetched
    .filter(n => n.gsc_impressions >= 500 && n.inlinks.length < 3)
    .sort((a, b) => b.gsc_impressions - a.gsc_impressions);
  for (const n of highValueUnder.slice(0, 5)) {
    /* Skip if already flagged as orphan */
    if (n.inlinks.length === 0) continue;
    findings.push({
      finding_kind:   'high_value_underconnected',
      severity:       'amber',
      finding_title:  `High-value page underconnected: ${cleanUrl(n.url)}`,
      finding_detail: `Page earns ${n.gsc_impressions.toLocaleString()} GSC impressions but only has ${n.inlinks.length} internal inlinks. This is your audience's interest signal — boost it with more internal links to amplify rankings.`,
      recommendation: `Identify 3-5 topically related pages and add contextual links to this high-impression page.`,
      affected_url:   n.url,
      evidence:       {
        inlink_count:    n.inlinks.length,
        gsc_impressions: n.gsc_impressions,
      },
    });
  }

  /* Positive finding: well-connected hubs */
  const wellConnectedHubs = fetched.filter(n => {
    const hub = hubByUrl[normalizeUrl(n.url)];
    return hub && n.inlinks.length >= 5;
  });
  if (wellConnectedHubs.length > 0) {
    findings.push({
      finding_kind:   'cluster_hub_isolated',  // re-use kind for positive too
      severity:       'green',
      finding_title:  `${wellConnectedHubs.length} cluster hub${wellConnectedHubs.length === 1 ? '' : 's'} well-connected`,
      finding_detail: `${wellConnectedHubs.length} cluster hub page${wellConnectedHubs.length === 1 ? '' : 's'} receive 5+ internal links — strong topical authority signal.`,
      evidence:       { count: wellConnectedHubs.length },
    });
  }

  return findings;
}

/* ════════════════════════════════════════════════════════════════
   RECOMMENDATION BUILDER (heuristic shortlist + LLM enrichment)
═══════════════════════════════════════════════════════════════ */

async function buildRecommendations(
  targets: LinkTarget[],
  nodes: PageNode[],
  campaignKeyword: string,
): Promise<Recommendation[]> {
  if (targets.length === 0) return [];
  const fetched = nodes.filter(n => n.fetched);
  if (fetched.length === 0) return [];

  /* For each target, shortlist top 5 candidate sources */
  const targetCandidates = targets.map(target => {
    const targetNorm = normalizeUrl(target.url);
    /* Find audited pages that aren't the target itself */
    const candidates = fetched
      .filter(n => normalizeUrl(n.url) !== targetNorm)
      /* Filter out pages that already link to the target */
      .filter(n => !n.outlinks.some(l => normalizeUrl(l.target_url) === targetNorm))
      .map(n => {
        /* Heuristic topical match: tokens from title/h1/url vs target's topic_tokens */
        const sourceTokens = new Set([
          ...tokenize(n.title || ''),
          ...tokenize(n.h1 || ''),
          ...tokenize(n.url),
        ]);
        const targetTokenSet = new Set(target.topic_tokens);
        let overlap = 0;
        for (const t of sourceTokens) if (targetTokenSet.has(t)) overlap++;
        const overlapScore = targetTokenSet.size > 0 ? overlap / targetTokenSet.size : 0;
        return { node: n, overlap, overlapScore };
      })
      .filter(c => c.overlap > 0)
      .sort((a, b) => {
        if (b.overlap !== a.overlap) return b.overlap - a.overlap;
        return b.node.gsc_impressions - a.node.gsc_impressions;
      })
      .slice(0, 5);
    return { target, candidates };
  }).filter(tc => tc.candidates.length > 0);

  /* LLM enrich each target's candidates (parallelized) */
  const enriched = await Promise.all(
    targetCandidates.map(tc => enrichTargetWithLlm(tc, campaignKeyword))
  );

  /* Flatten */
  const allRecs: Recommendation[] = [];
  for (const r of enriched) allRecs.push(...r);

  /* Cap total recommendations to avoid explosion */
  return allRecs.slice(0, 40);
}

async function enrichTargetWithLlm(
  tc: { target: LinkTarget; candidates: { node: PageNode; overlap: number; overlapScore: number }[] },
  campaignKeyword: string,
): Promise<Recommendation[]> {
  const target = tc.target;
  const candidateRows = tc.candidates.map((c, i) => ({
    candidate_id:    i,
    source_url:      c.node.url,
    source_title:    c.node.title || '(no title)',
    source_h1:       c.node.h1 || '(no H1)',
    source_word_count: c.node.word_count,
    topic_overlap_score: Number(c.overlapScore.toFixed(2)),
  }));

  const sys = `You are an SEO internal linking strategist. The user gives you a target URL (a page that should receive more internal links) and 5 candidate source pages from their site. For each candidate, you produce:
- suggested_anchor: 4-9 words, descriptive and natural — what humans would actually click. Use keyword phrasing where it fits the candidate's content. Do NOT recommend generic anchors like "click here" or "read more".
- placement_hint: WHERE on the source page to add this link. IMPORTANT CONSTRAINT: you only have the page URL, title, and H1 — you do NOT have the full body text, H2/H3 headings, or paragraph content. Base your suggestion on the page type and topic as inferred from these signals. Use phrasing that reflects what you can infer, not assert: "in the opening paragraph (intro context, inferred from page type)", "near the end as a related resource", "in a tools or comparison section if one exists (inferred from page topic)". Do NOT reference specific headings, sections, or content that you cannot see — they may not exist.
- rationale: ONE sentence why this candidate→target link is high-value. Reference the topical match and the strategic role of the target.

If a candidate is a bad fit despite having token overlap (e.g., the topic is too tangential, or the link would feel forced), DROP it from your response. Honest "this isn't a fit" is better than a contrived recommendation. Return only the candidates worth recommending.

Reply with ONLY valid JSON:
{
  "recommendations": [
    { "candidate_id": 0, "suggested_anchor": "...", "placement_hint": "...", "rationale": "..." }
  ]
}`;

  const user = `Campaign keyword (context): "${campaignKeyword}"

Target URL to receive links: ${target.url}
Target type: ${target.kind}
Target reason: ${target.reason}
${target.cluster_name ? `Target cluster: ${target.cluster_name}` : ''}

Candidate source pages on the site:
${JSON.stringify(candidateRows, null, 2)}

For each candidate that's a good fit (drop ones that aren't), produce anchor + placement + rationale.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 1500,
        system:     sys,
        messages:   [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const text = (data?.content?.[0]?.text || '').trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned);
    const llmRecs: any[] = Array.isArray(parsed?.recommendations) ? parsed.recommendations : [];

    const result: Recommendation[] = [];
    for (const lr of llmRecs) {
      const candidateId = typeof lr.candidate_id === 'number' ? lr.candidate_id : -1;
      const candidate = tc.candidates[candidateId];
      if (!candidate) continue;
      const anchor = String(lr.suggested_anchor || '').slice(0, 200).trim();
      if (!anchor || isGenericAnchor(anchor)) continue;  // skip if LLM returned a generic anchor anyway

      result.push({
        source_url:          candidate.node.url,
        target_url:          target.url,
        suggested_anchor:    anchor,
        placement_hint:      String(lr.placement_hint || '').slice(0, 500),
        rationale:           String(lr.rationale || '').slice(0, 1000),
        topic_overlap_score: candidate.overlapScore,
        target_kind:         target.kind,
        source_kind:         candidate.node.cluster_role === 'spoke' ? 'cluster_spoke' : 'gsc_top_page',
        source_impressions:  candidate.node.gsc_impressions,
        source_inlinks:      candidate.node.inlinks.length,
      });
    }
    return result;
  } catch (e: any) {
    console.log(`[enrichTargetWithLlm] failed for ${target.url}: ${e?.message}`);
    /* Fallback: emit heuristic recommendations without LLM enrichment */
    return tc.candidates.slice(0, 3).map(c => ({
      source_url:          c.node.url,
      target_url:          target.url,
      suggested_anchor:    (target.cluster_name || target.url.split('/').pop() || 'related content').slice(0, 100),
      placement_hint:      `Add this link near the most topically-relevant section. (LLM enrichment failed; manual review recommended.)`,
      rationale:           `Heuristic topic match (overlap score ${c.overlapScore.toFixed(2)}); LLM anchor/placement generation unavailable.`,
      topic_overlap_score: c.overlapScore,
      target_kind:         target.kind,
      source_kind:         c.node.cluster_role === 'spoke' ? 'cluster_spoke' as const : 'gsc_top_page' as const,
      source_impressions:  c.node.gsc_impressions,
      source_inlinks:      c.node.inlinks.length,
    }));
  }
}

/* ════════════════════════════════════════════════════════════════
   REPORT RENDERING
═══════════════════════════════════════════════════════════════ */

function renderReport(opts: {
  keyword:          string;
  pageNodes:        PageNode[];
  findings:         Finding[];
  recommendations:  Recommendation[];
  clusterTargets:   LinkTarget[];
  campaignTargets:  LinkTarget[];
  orphanTargets:    LinkTarget[];
  fetchedCount:     number;
  failedCount:      number;
  totalLinks:       number;
  durationMs:       number;
  runId:            string;
  gscUpdatedAt?:    string | null;
}): string {
  const lines: string[] = [];
  const { findings, recommendations, fetchedCount, failedCount, totalLinks } = opts;

  lines.push(`# Internal linking audit: ${opts.keyword}`);
  lines.push('');
  lines.push(`**Campaign keyword:** "${opts.keyword}"  `);
  lines.push(`**Pages audited:** ${fetchedCount} of ${opts.pageNodes.length} attempted (${failedCount} failed to fetch)  `);
  lines.push(`**Total internal links analyzed:** ${totalLinks.toLocaleString()}  `);
  lines.push(`**Targets evaluated:** ${opts.clusterTargets.length} cluster hubs, ${opts.campaignTargets.length} campaign targets, ${opts.orphanTargets.length} orphan-remediation targets  `);
  lines.push(`**Recommendations generated:** ${recommendations.length}  `);
  lines.push(`**Audit duration:** ${(opts.durationMs / 1000).toFixed(1)}s  `);
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
  lines.push(`| 🟢 Pass     | ${green} |`);
  lines.push(`| ℹ️ Info     | ${info} |`);
  lines.push('');

  /* Source confidence — surface upfront so the reader calibrates trust
     BEFORE reading findings. */
  const conf = weightedLinkFindingConfidence(findings);
  lines.push('## Source confidence');
  lines.push('');
  if (conf.sourced_count > 0) {
    lines.push(`**Weighted confidence:** ${conf.mean}/100 across ${conf.sourced_count} sourced finding(s).`);
    const sourceCounts: Record<string, number> = {};
    for (const f of findings) {
      for (const k of f.sources_used || []) {
        const lbl = LINK_SOURCE_META[k].label;
        sourceCounts[lbl] = (sourceCounts[lbl] || 0) + 1;
      }
    }
    const sourceList = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => `${label} (${count})`)
      .join(', ');
    lines.push(`**Sources used:** ${sourceList}.`);
  } else {
    lines.push('**No findings produced.** Confidence treated as low.');
  }
  if (conf.unattributed_count > 0) {
    lines.push('');
    lines.push(`⚠️ ${conf.unattributed_count} finding(s) lack source attribution.`);
  }
  lines.push('');

  /* Critical findings */
  const redFindings = findings.filter(f => f.severity === 'red');
  if (redFindings.length > 0) {
    lines.push('## 🔴 Critical issues');
    lines.push('');
    for (const f of redFindings) {
      lines.push(`### ${f.finding_title}`);
      if (f.finding_detail)  lines.push(f.finding_detail);
      if (f.recommendation)  { lines.push(''); lines.push(`**Recommendation:** ${f.recommendation}`); }
      if (f.sources_used && f.sources_used.length > 0 && typeof f.confidence_score === 'number') {
        const labels = f.sources_used.map(k => LINK_SOURCE_META[k].label).join(' + ');
        lines.push(`*Source · ${labels} · confidence ${f.confidence_score}/100*`);
      }
      lines.push('');
    }
  }

  /* Amber findings */
  const amberFindings = findings.filter(f => f.severity === 'amber');
  if (amberFindings.length > 0) {
    lines.push('## 🟡 Warnings');
    lines.push('');
    for (const f of amberFindings) {
      lines.push(`### ${f.finding_title}`);
      if (f.finding_detail)  lines.push(f.finding_detail);
      if (f.recommendation)  { lines.push(''); lines.push(`**Recommendation:** ${f.recommendation}`); }
      if (f.sources_used && f.sources_used.length > 0 && typeof f.confidence_score === 'number') {
        const labels = f.sources_used.map(k => LINK_SOURCE_META[k].label).join(' + ');
        lines.push(`*Source · ${labels} · confidence ${f.confidence_score}/100*`);
      }
      lines.push('');
    }
  }

  /* Info / positive findings */
  const infoFindings = findings.filter(f => f.severity === 'info' || f.severity === 'green');
  if (infoFindings.length > 0) {
    lines.push('## ℹ️ Notes');
    lines.push('');
    for (const f of infoFindings) {
      const meta = (f.sources_used && f.sources_used.length > 0)
        ? ` · *${f.sources_used.map(k => LINK_SOURCE_META[k].label).join(' + ')}*`
        : '';
      lines.push(`- **${f.finding_title}**${f.finding_detail ? ` — ${f.finding_detail}` : ''}${meta}`);
      if (f.recommendation) lines.push(`  - ${f.recommendation}`);
    }
    lines.push('');
  }

  /* Recommendations — grouped by target_kind */
  if (recommendations.length > 0) {
    lines.push('## Link recommendations');
    lines.push('');
    lines.push(`${recommendations.length} specific source → target links to add. Each has a suggested anchor and placement hint. Higher-priority recommendations (cluster hubs, campaign targets, orphans) appear first.`);
    lines.push('');

    const order: Array<Recommendation['target_kind']> = ['orphan_remediation', 'cluster_hub', 'campaign_target', 'money_page', 'general'];
    const labelByKind: Record<string, string> = {
      orphan_remediation: '🚨 Orphan remediation',
      cluster_hub:        '🎯 Cluster hub strengthening',
      campaign_target:    '📍 Campaign target boosting',
      money_page:         '💰 Money page authority',
      general:            '🔗 General topical links',
    };

    for (const kind of order) {
      const group = recommendations.filter(r => r.target_kind === kind);
      if (group.length === 0) continue;

      lines.push(`### ${labelByKind[kind] || kind} (${group.length})`);
      lines.push('');

      /* Sub-group by target URL */
      const byTarget: Record<string, Recommendation[]> = {};
      for (const r of group) {
        if (!byTarget[r.target_url]) byTarget[r.target_url] = [];
        byTarget[r.target_url].push(r);
      }

      for (const [targetUrl, recs] of Object.entries(byTarget)) {
        lines.push(`**Target:** [${cleanUrl(targetUrl)}](${targetUrl})`);
        lines.push('');
        for (const r of recs) {
          lines.push(`- **From:** [${cleanUrl(r.source_url)}](${r.source_url})`);
          lines.push(`  - **Anchor:** \`${r.suggested_anchor}\``);
          if (r.placement_hint) lines.push(`  - **Placement:** ${r.placement_hint}`);
          if (r.rationale)      lines.push(`  - **Why:** ${r.rationale}`);
          if (r.source_impressions > 0) {
            lines.push(`  - **Source stats:** ${r.source_impressions.toLocaleString()} GSC impressions, ${r.source_inlinks} current inlinks, ${r.topic_overlap_score.toFixed(2)} topic overlap`);
          }
        }
        lines.push('');
      }
    }
  } else {
    lines.push('## Link recommendations');
    lines.push('');
    lines.push(`_No actionable recommendations generated. This usually means: (a) no cluster hubs or campaign targets exist yet, (b) the audited pages don't have strong topical relationships to suggested targets, or (c) all candidate links already exist._`);
    lines.push('');
  }

  /* Link graph overview */
  const fetched = opts.pageNodes.filter(n => n.fetched);
  lines.push('## Link graph overview');
  lines.push('');
  lines.push(`| URL | Inlinks | Outlinks | GSC impressions | Cluster role |`);
  lines.push(`|---|---:|---:|---:|---|`);
  const ranked = [...fetched].sort((a, b) => b.gsc_impressions - a.gsc_impressions).slice(0, 25);
  for (const n of ranked) {
    const role = n.cluster_role ? `${n.cluster_role} of "${n.cluster_name}"` : '-';
    lines.push(`| ${cleanUrl(n.url)} | ${n.inlinks.length} | ${n.outlinks.length} | ${n.gsc_impressions.toLocaleString()} | ${role} |`);
  }
  if (fetched.length > 25) {
    lines.push(`| _… and ${fetched.length - 25} more pages_ |  |  |  |  |`);
  }
  lines.push('');

  /* Failures */
  const failures = opts.pageNodes.filter(n => !n.fetched);
  if (failures.length > 0) {
    lines.push('## Pages that failed to fetch');
    lines.push('');
    for (const f of failures.slice(0, 10)) {
      lines.push(`- ${f.url} — ${f.fetch_error || 'unknown error'}${f.http_status ? ` (HTTP ${f.http_status})` : ''}`);
    }
    if (failures.length > 10) {
      lines.push(`- _… and ${failures.length - 10} more failures_`);
    }
    lines.push('');
  }

  /* Methodology */
  lines.push('## Methodology + caveats');
  lines.push('');
  lines.push(`**Audit scope:** The ${opts.pageNodes.length} GSC top_pages with measurable impressions. Pages outside GSC top_pages aren't analyzed — a full-site crawl is deliberately out of scope (would exceed serverless function time limits).`);
  lines.push('');
  lines.push('**How findings were detected:** HTML fetch per page (12s timeout, parallel) → anchor extraction via regex → cross-link counting → severity scoring based on GSC impressions and current inlink count.');
  lines.push('');
  lines.push('**How recommendations were generated:** For each target (cluster hub / campaign target / orphan), the engine heuristically shortlists 5 audited pages by topic-token overlap with the target. Then one LLM call per target generates specific anchor + placement + rationale for each candidate. LLM is explicitly instructed to drop candidates that aren\'t a genuine fit — returning fewer recommendations is preferred over forced ones.');
  lines.push('');
  lines.push('**Placement hint accuracy:** The LLM receives each source page\'s URL, title, and H1 only — it does NOT read the full page body, H2/H3 headings, or paragraph content. Placement hints are inferences from page type and topic signals, not verified observations of actual page structure. Treat them as a starting point. Before inserting a link, open the source page and find the section that best matches the hint\'s intent.');
  lines.push('');
  lines.push(`**LLM cost:** ${opts.clusterTargets.length + opts.campaignTargets.length + opts.orphanTargets.length} calls (~$0.30-0.50). Each call is short (max 1500 tokens response).`);
  lines.push('');
  lines.push('**What this won\'t catch:** Internal links to pages NOT in GSC top_pages (untracked corners of the site), 301/302 redirect chains, broken internal links to nonexistent URLs, anchor diversity on a per-page basis, nofollow attributes. These are deferred to Phase 17.1+.');
  lines.push('');
  lines.push('**Treat recommendations as starting points.** Anchor text: adjust to fit your site\'s voice before inserting. Placement hints: these are inferred from page URL, title, and H1 — the engine has not read the full page. Before adding a link, open the source page and confirm the suggested section exists and makes sense contextually.');

  return lines.join('\n');
}

function buildHeadline(opts: {
  fetchedCount: number; orphanCount: number; recCount: number; redCount: number; amberCount: number;
}): string {
  if (opts.redCount > 0) {
    return `🔴 ${opts.redCount} critical link-graph issue${opts.redCount === 1 ? '' : 's'} (${opts.orphanCount} orphan${opts.orphanCount === 1 ? '' : 's'}). ${opts.recCount} link recommendation${opts.recCount === 1 ? '' : 's'} ready.`;
  }
  if (opts.amberCount > 0) {
    return `🟡 ${opts.amberCount} link-graph warning${opts.amberCount === 1 ? '' : 's'} (${opts.orphanCount} orphan${opts.orphanCount === 1 ? '' : 's'}). ${opts.recCount} link recommendation${opts.recCount === 1 ? '' : 's'} ready.`;
  }
  return `🟢 Link graph clean across ${opts.fetchedCount} pages. ${opts.recCount} optional improvement${opts.recCount === 1 ? '' : 's'}.`;
}

/* ════════════════════════════════════════════════════════════════
   HELPERS
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

const STOPWORDS = new Set([
  'a','an','the','of','to','in','on','for','and','or','is','are','be','was','were',
  'with','at','by','from','as','it','this','that','these','those','i','you','your',
  'my','me','we','our','us','their','its','they','them','he','she','his','her',
  'do','does','did','have','has','had','will','would','can','could','should',
  'how','what','when','where','why','which','who','about','vs','versus','com','www',
  'https','http',
]);

function tokenize(s: string): string[] {
  return (s || '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/\/$/, '').toLowerCase();
  } catch {
    return (url || '').replace(/\/$/, '').toLowerCase();
  }
}

function cleanUrl(u: string): string {
  try { const url = new URL(u); return url.host + url.pathname; }
  catch { return u; }
}

async function writePendingReport(
  c: any,
  campaignId: string,
  panelId: string,
  triggeredBy: 'cron' | 'manual',
  reasonLine: string,
  bodyMd: string,
): Promise<{ success: boolean; audit_run_id?: string; pages_fetched?: number; findings_count?: number; recommendation_count?: number; report_id?: string; error?: string }> {
  const reportR = await writeReportToPanel({
    campaignId,
    projectId:        c.project_id,
    pillar:           'internal_linking',
    panelId,
    reportKind:       triggeredBy === 'cron' ? 'scheduled_recheck' : 'manual_refresh',
    generatedBy:      triggeredBy,
    dataSources:      [],
    confidenceRating: 'low',
    confidenceReason: reasonLine,
    title:            `Internal linking audit pending`,
    bodyMd,
    summary:          'Audit pending.',
    tags:             ['internal_linking', 'pending'],
    updatePanelStatus: true,
    newPanelStatus:    'amber',
  });
  return { success: true, pages_fetched: 0, findings_count: 0, recommendation_count: 0, report_id: reportR.report_id };
}
