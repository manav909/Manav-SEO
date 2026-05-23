/* ════════════════════════════════════════════════════════════════
   api/lib/seo-monitoring.ts
   Phase 19 — Monitoring & Rank Tracking engine

   Captures point-in-time snapshots of a campaign's state and compares
   them against a prior snapshot (default 7-day window) to surface
   meaningful changes.

   Pipeline:
     1. Capture current snapshot: keyword position, target_url stats,
        cluster_map aggregate impressions, panel statuses, opportunity counts
     2. Load baseline snapshot (most recent ≥ window_days old)
     3. Compute deltas across all dimensions
     4. Categorize as findings (drop/gain/no_change) with severity
     5. ONE LLM call to synthesize a narrative ("what changed and what it means")
     6. Persist run + findings, write report, surface red findings as opps

   First run on a campaign establishes a baseline — no comparison possible,
   so the report says so honestly.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { writeReportToPanel, recordOpportunity } from "./seo-campaign-engine.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

const DEFAULT_WINDOW_DAYS = 7;

/* Severity thresholds (signed deltas).
   Position is inverse: lower is better, so +position = worse. */
const POSITION_DROP_AMBER  = 2;       // dropped 2+ positions
const POSITION_DROP_RED    = 5;       // dropped 5+ positions
const POSITION_GAIN_AMBER  = 2;
const POSITION_GAIN_RED    = 5;
const PCT_DROP_AMBER       = -15;     // -15% on clicks/impressions
const PCT_DROP_RED         = -30;
const PCT_GAIN_AMBER       = 20;      // amber-positive: gain worth amplifying
const PCT_GAIN_GREEN       = 40;

/* ════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════ */

interface GscQueryRow   { query: string; clicks: number; impressions: number; ctr: number; position: number; }
interface GscPageRow    { page:  string; clicks: number; impressions: number; ctr: number; position: number; }

interface Snapshot {
  id?:                        string;
  campaign_id:                string;
  panel_id:                   string;
  project_id:                 string;
  keyword_position:           number | null;
  keyword_impressions:        number | null;
  keyword_clicks:             number | null;
  keyword_ctr:                number | null;
  target_url:                 string | null;
  target_url_impressions:     number | null;
  target_url_clicks:          number | null;
  target_url_position:        number | null;
  total_cluster_impressions:  number | null;
  total_cluster_clicks:       number | null;
  cluster_count:              number | null;
  panel_statuses:             Record<string, string | null>;
  opp_counts:                 Record<string, number>;
  created_at?:                string;
}

interface Finding {
  finding_kind:    string;
  severity:        'green' | 'amber' | 'red' | 'info';
  finding_title:   string;
  finding_detail?: string;
  recommendation?: string;
  evidence?:       any;
  delta_value?:    number;
  affected_pillar?: string;
}

/* ════════════════════════════════════════════════════════════════
   PUBLIC API
═══════════════════════════════════════════════════════════════ */

export async function runMonitoringCheck(opts: {
  campaignId: string;
  panelId?:   string;
  windowDays?: number;
  triggeredBy?: 'cron' | 'manual';
}): Promise<{
  success: boolean;
  run_id?: string;
  changes_detected?: number;
  red_count?: number;
  amber_count?: number;
  baseline_established?: boolean;
  report_id?: string;
  error?: string;
}> {
  const triggeredBy = opts.triggeredBy || 'manual';
  const windowDays = opts.windowDays || DEFAULT_WINDOW_DAYS;
  const startTime = Date.now();

  try {
    /* Resolve campaign + panel */
    const { data: campaign } = await db().from("seo_campaigns")
      .select("id, project_id, keyword, started_at").eq("id", opts.campaignId).maybeSingle();
    if (!campaign) return { success: false, error: 'campaign not found' };
    const c = campaign as any;

    let panelId = opts.panelId;
    if (!panelId) {
      const { data: p } = await db().from("seo_campaign_panels")
        .select("id").eq("campaign_id", opts.campaignId).eq("pillar", 'monitoring').maybeSingle();
      panelId = (p as any)?.id;
    }
    if (!panelId) return { success: false, error: 'no monitoring panel found for this campaign' };

    /* 1. Capture current snapshot */
    const [currentSnap, gscFreshnessAt] = await Promise.all([
      captureSnapshot({
        campaignId: opts.campaignId,
        panelId,
        projectId:  c.project_id,
        keyword:    c.keyword,
      }),
      readGscFreshness(c.project_id),
    ]);

    /* 2. Load baseline (most recent snapshot ≥ windowDays old) */
    const baselineSnap = await loadBaselineSnapshot({
      campaignId:  opts.campaignId,
      windowDays,
    });

    /* 3. Persist run record (so we can FK the snapshot to it) */
    const runId = crypto.randomUUID();
    await db().from("monitoring_runs").insert({
      id:                   runId,
      campaign_id:          opts.campaignId,
      panel_id:             panelId,
      project_id:           c.project_id,
      triggered_by:         triggeredBy,
      window_days:          windowDays,
      snapshot_id_current:  null,        // will fill after snapshot insert
      snapshot_id_baseline: baselineSnap?.id || null,
      changes_detected:     0,
      green_count:          0,
      amber_count:          0,
      red_count:            0,
      llm_calls_used:       0,
    });

    /* 4. Persist current snapshot + link back */
    const { data: insertedSnap } = await db().from("monitoring_snapshots")
      .insert({ ...currentSnap, run_id: runId })
      .select("id").maybeSingle();
    const currentSnapId = (insertedSnap as any)?.id;
    if (currentSnapId) {
      await db().from("monitoring_runs").update({ snapshot_id_current: currentSnapId }).eq("id", runId);
    }

    /* 5. Compute findings */
    let findings: Finding[];
    let baselineEstablished = false;

    if (!baselineSnap) {
      baselineEstablished = true;
      findings = [{
        finding_kind:   'baseline_established',
        severity:       'info',
        finding_title:  'Baseline established',
        finding_detail: `This is the first monitoring snapshot for this campaign. The next monitoring run (after ${windowDays} days) will compare against this baseline.`,
        evidence:       {
          window_days:           windowDays,
          baseline_position:     currentSnap.keyword_position,
          baseline_impressions:  currentSnap.keyword_impressions,
          baseline_clicks:       currentSnap.keyword_clicks,
        },
      }];
    } else {
      findings = computeDeltaFindings(currentSnap, baselineSnap);
    }

    /* 6. ONE LLM call for narrative synthesis (skip on baseline) */
    let llmCallsUsed = 0;
    let narrative: string | null = null;
    if (!baselineEstablished && findings.length > 0) {
      try {
        narrative = await synthesizeMonitoringNarrative({
          keyword:    c.keyword,
          currentSnap,
          baselineSnap,
          windowDays,
          findings,
        });
        llmCallsUsed = 1;
      } catch (e: any) {
        console.log(`[runMonitoringCheck] narrative synthesis failed: ${e?.message}`);
        narrative = null;
      }
    }

    /* 7. Persist findings */
    if (findings.length > 0) {
      const findingRows = findings.map(f => ({
        run_id:         runId,
        campaign_id:    opts.campaignId,
        panel_id:       panelId,
        project_id:     c.project_id,
        finding_kind:   f.finding_kind,
        severity:       f.severity,
        finding_title:  f.finding_title.slice(0, 240),
        finding_detail: f.finding_detail?.slice(0, 2000) || null,
        recommendation: f.recommendation?.slice(0, 1000) || null,
        evidence:       f.evidence || null,
        delta_value:    f.delta_value ?? null,
        affected_pillar: f.affected_pillar || null,
      }));
      await db().from("monitoring_findings").insert(findingRows);
    }

    /* 8. Update run counters */
    const redCount   = findings.filter(f => f.severity === 'red').length;
    const amberCount = findings.filter(f => f.severity === 'amber').length;
    const greenCount = findings.filter(f => f.severity === 'green').length;
    const durationMs = Date.now() - startTime;
    await db().from("monitoring_runs").update({
      changes_detected: findings.length,
      green_count:      greenCount,
      amber_count:      amberCount,
      red_count:        redCount,
      llm_calls_used:   llmCallsUsed,
      duration_ms:      durationMs,
    }).eq("id", runId);

    /* 9. Write report */
    const panelStatus: 'red' | 'amber' | 'green' =
      redCount > 0   ? 'red'   :
      amberCount > 0 ? 'amber' :
      greenCount > 0 ? 'green' : 'green';

    const reportR = await writeReportToPanel({
      campaignId:        opts.campaignId,
      projectId:         c.project_id,
      pillar:            'monitoring',
      panelId,
      reportKind:        triggeredBy === 'cron' ? 'scheduled_recheck' : 'manual_refresh',
      generatedBy:       triggeredBy,
      llmCallsUsed,
      dataSources:       baselineEstablished
                          ? ['gsc']
                          : ['gsc', ...(narrative ? ['llm' as const] : [])],
      confidenceRating:  baselineEstablished ? 'low' : narrative ? 'high' : 'medium',
      confidenceReason:  baselineEstablished
                          ? `First snapshot — no prior data to compare against. Comparison becomes available after ~${windowDays} days.`
                          : narrative
                          ? `Comparing current state to snapshot from ${windowDays} days ago. LLM narrative synthesizes meaningful changes.`
                          : `Comparing current state to snapshot from ${windowDays} days ago. LLM narrative unavailable; raw findings only.`,
      title:             baselineEstablished
                          ? `Monitoring baseline established for "${c.keyword}"`
                          : `Monitoring check: ${findings.length} change${findings.length === 1 ? '' : 's'} detected for "${c.keyword}"`,
      bodyMd:            renderMonitoringReport({
        keyword:       c.keyword,
        currentSnap,
        baselineSnap,
        findings,
        narrative,
        windowDays,
        durationMs,
        runId,
        baselineEstablished,
        gscUpdatedAt:  gscFreshnessAt,
      }),
      summary:           buildHeadline({
        keyword: c.keyword,
        findings, baselineEstablished,
        redCount, amberCount, greenCount,
      }),
      tags:              ['monitoring', `keyword:${c.keyword.toLowerCase()}`,
                          ...(baselineEstablished ? ['baseline'] : []),
                          ...(redCount > 0 ? [`red:${redCount}`] : []),
                          ...(amberCount > 0 ? [`amber:${amberCount}`] : [])],
      metricSnapshot:    {
        snapshot_id:       currentSnapId,
        baseline_snap_id:  baselineSnap?.id,
        changes_detected:  findings.length,
        red_count:         redCount,
        amber_count:       amberCount,
        green_count:       greenCount,
        window_days:       windowDays,
        llm_calls:         llmCallsUsed,
        duration_ms:       durationMs,
      },
      updatePanelStatus: true,
      newPanelStatus:    panelStatus,
    });

    /* Backfill report_id */
    if (reportR.report_id) {
      await db().from("monitoring_runs").update({ report_id: reportR.report_id }).eq("id", runId);
    }

    /* 10. Surface significant changes as opportunities */
    for (const f of findings.filter(f => f.severity === 'red').slice(0, 5)) {
      const oppKind =
        f.finding_kind === 'keyword_click_drop' || f.finding_kind === 'target_url_drop' || f.finding_kind === 'cluster_impressions_drop' ? 'traffic' :
        f.finding_kind === 'panel_status_regression' ? 'technical' :
        f.finding_kind === 'keyword_rank_drop' ? 'quick_win' :
        'quick_win';
      await recordOpportunity({
        projectId:        c.project_id,
        sourceKind:       'cron_sweep',
        sourceCampaignId: opts.campaignId,
        sourcePanelId:    panelId,
        sourceStepId:     'monitoring',
        kind:             oppKind,
        title:            f.finding_title.slice(0, 240),
        description:      f.recommendation || f.finding_detail || 'Investigate this monitoring change.',
        evidence:         { ...f.evidence, run_id: runId, finding_kind: f.finding_kind },
        estimatedValue:   'high',
        estimatedEffort:  oppKind === 'technical' ? 'medium' : 'low',
        suggestedAction:  'investigate',
      });
    }
    /* Also surface big amber-positive (gain) findings — these are worth amplifying */
    for (const f of findings.filter(f => f.severity === 'green' && (f.finding_kind.endsWith('_gain'))).slice(0, 2)) {
      await recordOpportunity({
        projectId:        c.project_id,
        sourceKind:       'cron_sweep',
        sourceCampaignId: opts.campaignId,
        sourcePanelId:    panelId,
        sourceStepId:     'monitoring',
        kind:             'quick_win',
        title:            `Amplify: ${f.finding_title}`,
        description:      `${f.finding_detail || ''} Consider doubling down — promote the page, build more internal links to it, or pitch it externally.`,
        evidence:         { ...f.evidence, run_id: runId, finding_kind: f.finding_kind, gain_signal: true },
        estimatedValue:   'medium',
        estimatedEffort:  'low',
        suggestedAction:  'kanban_task',
      });
    }

    /* Update panel cadence */
    const { data: panelRow } = await db().from("seo_campaign_panels")
      .select("recheck_cadence_days").eq("id", panelId).maybeSingle();
    const cadence = (panelRow as any)?.recheck_cadence_days || 1;
    await db().from("seo_campaign_panels").update({
      last_assessed_at: new Date().toISOString(),
      next_recheck_at:  new Date(Date.now() + cadence * 86_400_000).toISOString(),
    }).eq("id", panelId);

    return {
      success:              true,
      run_id:               runId,
      changes_detected:     findings.length,
      red_count:            redCount,
      amber_count:          amberCount,
      baseline_established: baselineEstablished,
      report_id:            reportR.report_id,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'monitoring check failed' };
  }
}

export async function getPanelMonitoringData(opts: {
  panelId: string;
  limit?:  number;
}): Promise<{ success: boolean; runs?: any[]; findings?: any[]; latest_snapshot?: any; error?: string }> {
  try {
    const limit = Math.min(opts.limit || 30, 200);
    const [runsRes, findingsRes, snapRes] = await Promise.all([
      db().from("monitoring_runs")
        .select("*").eq("panel_id", opts.panelId)
        .order("created_at", { ascending: false }).limit(limit),
      db().from("monitoring_findings")
        .select("*").eq("panel_id", opts.panelId)
        .order("created_at", { ascending: false }).limit(limit),
      db().from("monitoring_snapshots")
        .select("*").eq("panel_id", opts.panelId)
        .order("created_at", { ascending: false }).limit(1),
    ]);
    return {
      success:         true,
      runs:            runsRes.data || [],
      findings:        findingsRes.data || [],
      latest_snapshot: (snapRes.data || [])[0] || null,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'list failed' };
  }
}

/* ════════════════════════════════════════════════════════════════
   SNAPSHOT CAPTURE
═══════════════════════════════════════════════════════════════ */

async function captureSnapshot(opts: {
  campaignId: string;
  panelId:    string;
  projectId:  string;
  keyword:    string;
}): Promise<Snapshot> {
  const snap: Snapshot = {
    campaign_id:                opts.campaignId,
    panel_id:                   opts.panelId,
    project_id:                 opts.projectId,
    keyword_position:           null,
    keyword_impressions:        null,
    keyword_clicks:             null,
    keyword_ctr:                null,
    target_url:                 null,
    target_url_impressions:     null,
    target_url_clicks:          null,
    target_url_position:        null,
    total_cluster_impressions:  null,
    total_cluster_clicks:       null,
    cluster_count:              null,
    panel_statuses:             {},
    opp_counts:                 {},
  };

  /* GSC queries → find row matching the campaign keyword */
  try {
    const queries = await readGscQueries(opts.projectId);
    const kwLc = opts.keyword.toLowerCase();
    /* Match exact first, fall back to substring */
    const exact = queries.find(q => q.query.toLowerCase() === kwLc);
    const partial = exact || queries.find(q => q.query.toLowerCase().includes(kwLc));
    if (partial) {
      snap.keyword_position    = Number(partial.position?.toFixed(2)) || null;
      snap.keyword_impressions = partial.impressions || 0;
      snap.keyword_clicks      = partial.clicks || 0;
      snap.keyword_ctr         = Number(partial.ctr?.toFixed(4)) || null;
    }
  } catch { /* skip */ }

  /* Target URL stats — from technical_audit panel */
  try {
    const { data: techPanel } = await db().from("seo_campaign_panels")
      .select("target_url").eq("campaign_id", opts.campaignId).eq("pillar", 'technical_audit').maybeSingle();
    const targetUrl = (techPanel as any)?.target_url;
    if (targetUrl) {
      snap.target_url = targetUrl;
      const pages = await readGscPages(opts.projectId);
      const norm = (u: string) => u.replace(/\/$/, '').toLowerCase();
      const match = pages.find(p => norm(p.page) === norm(targetUrl));
      if (match) {
        snap.target_url_impressions = match.impressions || 0;
        snap.target_url_clicks      = match.clicks || 0;
        snap.target_url_position    = Number(match.position?.toFixed(2)) || null;
      }
    }
  } catch { /* skip */ }

  /* Cluster map aggregate impressions — most recent run */
  try {
    const { data: clusters } = await db().from("cluster_map_clusters")
      .select("total_impressions, total_clicks, audit_run_id, created_at")
      .eq("campaign_id", opts.campaignId)
      .order("created_at", { ascending: false }).limit(50);
    if (clusters && (clusters as any[]).length > 0) {
      const latestRunId = (clusters as any[])[0].audit_run_id;
      const latestRunClusters = (clusters as any[]).filter(cl => cl.audit_run_id === latestRunId);
      snap.total_cluster_impressions = latestRunClusters.reduce((s, cl) => s + (cl.total_impressions || 0), 0);
      snap.total_cluster_clicks      = latestRunClusters.reduce((s, cl) => s + (cl.total_clicks || 0), 0);
      snap.cluster_count             = latestRunClusters.length;
    }
  } catch { /* skip */ }

  /* Panel statuses — snapshot of current_status for every panel of this campaign */
  try {
    const { data: panels } = await db().from("seo_campaign_panels")
      .select("pillar, current_status").eq("campaign_id", opts.campaignId);
    const statusMap: Record<string, string | null> = {};
    for (const p of ((panels as any[]) || [])) {
      statusMap[p.pillar] = p.current_status || null;
    }
    snap.panel_statuses = statusMap;
  } catch { /* skip */ }

  /* Open opportunity counts by kind */
  try {
    const { data: opps } = await db().from("seo_opportunities")
      .select("kind").eq("source_campaign_id", opts.campaignId).eq("status", 'open');
    const counts: Record<string, number> = {};
    for (const o of ((opps as any[]) || [])) {
      counts[o.kind] = (counts[o.kind] || 0) + 1;
    }
    snap.opp_counts = counts;
  } catch { /* skip */ }

  return snap;
}

async function loadBaselineSnapshot(opts: {
  campaignId:  string;
  windowDays:  number;
}): Promise<Snapshot | null> {
  /* Find most recent snapshot at least windowDays old */
  const cutoff = new Date(Date.now() - opts.windowDays * 86_400_000).toISOString();
  const { data } = await db().from("monitoring_snapshots")
    .select("*")
    .eq("campaign_id", opts.campaignId)
    .lte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) return data as any;

  /* Fallback: if no snapshot meets windowDays, use the OLDEST available
     (might be only a few days old, but it's something to compare against). */
  const { data: oldest } = await db().from("monitoring_snapshots")
    .select("*")
    .eq("campaign_id", opts.campaignId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (oldest) {
    const ageDays = (Date.now() - new Date((oldest as any).created_at).getTime()) / 86_400_000;
    /* Only return if it's at least 1 day old (don't compare against today's earlier snapshot) */
    if (ageDays >= 1) return oldest as any;
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════
   DELTA COMPUTATION
═══════════════════════════════════════════════════════════════ */

function computeDeltaFindings(curr: Snapshot, base: Snapshot): Finding[] {
  const findings: Finding[] = [];

  /* Keyword position */
  if (curr.keyword_position != null && base.keyword_position != null) {
    const delta = curr.keyword_position - base.keyword_position;       // + means dropped (got worse)
    if (delta >= POSITION_DROP_RED) {
      findings.push({
        finding_kind:    'keyword_rank_drop',
        severity:        'red',
        finding_title:   `Keyword position dropped ${delta.toFixed(1)} spots`,
        finding_detail:  `Position moved from ${base.keyword_position.toFixed(1)} → ${curr.keyword_position.toFixed(1)}. This is a meaningful drop — could indicate an algorithm shift, lost backlinks, competitor improvement, or content drift.`,
        recommendation:  `Open Technical Audit + Cluster Map reports to check for recent issues. Run a fresh rank pipeline to capture the new SERP shape and competing pages.`,
        evidence:        { from: base.keyword_position, to: curr.keyword_position },
        delta_value:     delta,
        affected_pillar: 'content',
      });
    } else if (delta >= POSITION_DROP_AMBER) {
      findings.push({
        finding_kind:    'keyword_rank_drop',
        severity:        'amber',
        finding_title:   `Keyword position slipped ${delta.toFixed(1)} spots`,
        finding_detail:  `Position moved from ${base.keyword_position.toFixed(1)} → ${curr.keyword_position.toFixed(1)}. Worth monitoring — not yet a hard regression but trend matters.`,
        evidence:        { from: base.keyword_position, to: curr.keyword_position },
        delta_value:     delta,
      });
    } else if (-delta >= POSITION_GAIN_RED) {
      findings.push({
        finding_kind:    'keyword_rank_gain',
        severity:        'green',
        finding_title:   `Keyword position improved ${(-delta).toFixed(1)} spots`,
        finding_detail:  `Position moved from ${base.keyword_position.toFixed(1)} → ${curr.keyword_position.toFixed(1)}. Strong gain — worth amplifying with internal links + outreach.`,
        evidence:        { from: base.keyword_position, to: curr.keyword_position },
        delta_value:     delta,
      });
    } else if (-delta >= POSITION_GAIN_AMBER) {
      findings.push({
        finding_kind:    'keyword_rank_gain',
        severity:        'green',
        finding_title:   `Keyword position improved ${(-delta).toFixed(1)} spots`,
        finding_detail:  `Position moved from ${base.keyword_position.toFixed(1)} → ${curr.keyword_position.toFixed(1)}.`,
        evidence:        { from: base.keyword_position, to: curr.keyword_position },
        delta_value:     delta,
      });
    }
  }

  /* Keyword clicks % change */
  pushPctFinding(findings, {
    metric:        'keyword_clicks',
    current:       curr.keyword_clicks,
    baseline:      base.keyword_clicks,
    dropKind:      'keyword_click_drop',
    gainKind:      'keyword_click_gain',
    label:         'Keyword clicks',
  });

  /* Target URL impressions */
  pushPctFinding(findings, {
    metric:        'target_url_impressions',
    current:       curr.target_url_impressions,
    baseline:      base.target_url_impressions,
    dropKind:      'target_url_drop',
    gainKind:      'target_url_gain',
    label:         'Target URL impressions',
  });

  /* Cluster impressions */
  pushPctFinding(findings, {
    metric:        'total_cluster_impressions',
    current:       curr.total_cluster_impressions,
    baseline:      base.total_cluster_impressions,
    dropKind:      'cluster_impressions_drop',
    gainKind:      'cluster_impressions_gain',
    label:         'Cluster aggregate impressions',
  });

  /* Panel status regressions / improvements */
  const allPillars = new Set([
    ...Object.keys(curr.panel_statuses || {}),
    ...Object.keys(base.panel_statuses || {}),
  ]);
  for (const pillar of allPillars) {
    const currStatus = curr.panel_statuses?.[pillar] || null;
    const baseStatus = base.panel_statuses?.[pillar] || null;
    if (currStatus === baseStatus) continue;
    const severityRank: Record<string, number> = { red: 3, amber: 2, green: 1 };
    const cur = severityRank[currStatus || ''] || 0;
    const ba  = severityRank[baseStatus || ''] || 0;
    if (cur > ba && cur > 0) {
      findings.push({
        finding_kind:    'panel_status_regression',
        severity:        currStatus === 'red' ? 'red' : 'amber',
        finding_title:   `${prettyPillar(pillar)} regressed: ${baseStatus || 'unknown'} → ${currStatus}`,
        finding_detail:  `The ${prettyPillar(pillar)} pillar's status worsened since last snapshot. Open the latest pillar report to investigate.`,
        recommendation:  `Review the most recent ${prettyPillar(pillar)} report and address any new findings.`,
        evidence:        { from: baseStatus, to: currStatus },
        affected_pillar: pillar,
      });
    } else if (cur < ba && ba > 0) {
      findings.push({
        finding_kind:    'panel_status_improvement',
        severity:        'green',
        finding_title:   `${prettyPillar(pillar)} improved: ${baseStatus} → ${currStatus || 'unknown'}`,
        finding_detail:  `The ${prettyPillar(pillar)} pillar's status improved since last snapshot.`,
        evidence:        { from: baseStatus, to: currStatus },
        affected_pillar: pillar,
      });
    }
  }

  /* Opportunity volume spike (info-level signal) */
  const currTotal = Object.values(curr.opp_counts || {}).reduce((s, n) => s + n, 0);
  const baseTotal = Object.values(base.opp_counts || {}).reduce((s, n) => s + n, 0);
  if (currTotal - baseTotal >= 10) {
    findings.push({
      finding_kind:    'new_opportunity_spike',
      severity:        'info',
      finding_title:   `${currTotal - baseTotal} new opportunities since last snapshot`,
      finding_detail:  `Open opportunities grew from ${baseTotal} → ${currTotal}. This often means recent pillar audits surfaced new signals — review the Opportunities tab.`,
      evidence:        { from: baseTotal, to: currTotal, by_kind_now: curr.opp_counts },
      delta_value:     currTotal - baseTotal,
    });
  }

  /* If nothing meaningful changed, surface that explicitly */
  if (findings.length === 0) {
    findings.push({
      finding_kind:   'no_change',
      severity:       'green',
      finding_title:  'No significant changes detected',
      finding_detail: 'All tracked metrics remained within normal thresholds since the last snapshot.',
    });
  }

  return findings;
}

function pushPctFinding(findings: Finding[], opts: {
  metric:    string;
  current:   number | null;
  baseline:  number | null;
  dropKind:  string;
  gainKind:  string;
  label:     string;
}): void {
  const { current, baseline, dropKind, gainKind, label } = opts;
  if (current == null || baseline == null) return;
  if (baseline === 0 && current > 0) {
    /* Net-new from zero — treat as a positive gain */
    findings.push({
      finding_kind:   gainKind as any,
      severity:       'green',
      finding_title:  `${label}: net-new (0 → ${current.toLocaleString()})`,
      finding_detail: `${label} went from 0 to ${current.toLocaleString()} since last snapshot — net-new activity.`,
      evidence:       { from: 0, to: current },
      delta_value:    current,
    });
    return;
  }
  if (baseline === 0) return;     // can't compute percentage
  const pctChange = ((current - baseline) / baseline) * 100;

  if (pctChange <= PCT_DROP_RED) {
    findings.push({
      finding_kind:   dropKind as any,
      severity:       'red',
      finding_title:  `${label} dropped ${Math.abs(pctChange).toFixed(0)}%`,
      finding_detail: `${label} fell from ${baseline.toLocaleString()} → ${current.toLocaleString()} (${pctChange.toFixed(1)}%). Significant negative change.`,
      recommendation: `Investigate immediately. Check rank pipeline + technical audit for issues. Verify GSC data freshness.`,
      evidence:       { from: baseline, to: current, pct_change: pctChange },
      delta_value:    pctChange,
    });
  } else if (pctChange <= PCT_DROP_AMBER) {
    findings.push({
      finding_kind:   dropKind as any,
      severity:       'amber',
      finding_title:  `${label} dropped ${Math.abs(pctChange).toFixed(0)}%`,
      finding_detail: `${label} fell from ${baseline.toLocaleString()} → ${current.toLocaleString()} (${pctChange.toFixed(1)}%). Worth a second look.`,
      evidence:       { from: baseline, to: current, pct_change: pctChange },
      delta_value:    pctChange,
    });
  } else if (pctChange >= PCT_GAIN_GREEN) {
    findings.push({
      finding_kind:   gainKind as any,
      severity:       'green',
      finding_title:  `${label} grew ${pctChange.toFixed(0)}%`,
      finding_detail: `${label} rose from ${baseline.toLocaleString()} → ${current.toLocaleString()} (+${pctChange.toFixed(1)}%). Strong positive change — worth amplifying.`,
      evidence:       { from: baseline, to: current, pct_change: pctChange },
      delta_value:    pctChange,
    });
  } else if (pctChange >= PCT_GAIN_AMBER) {
    findings.push({
      finding_kind:   gainKind as any,
      severity:       'green',
      finding_title:  `${label} grew ${pctChange.toFixed(0)}%`,
      finding_detail: `${label} rose from ${baseline.toLocaleString()} → ${current.toLocaleString()} (+${pctChange.toFixed(1)}%).`,
      evidence:       { from: baseline, to: current, pct_change: pctChange },
      delta_value:    pctChange,
    });
  }
}

/* ════════════════════════════════════════════════════════════════
   LLM NARRATIVE SYNTHESIS
═══════════════════════════════════════════════════════════════ */

async function synthesizeMonitoringNarrative(opts: {
  keyword:      string;
  currentSnap:  Snapshot;
  baselineSnap: Snapshot;
  windowDays:   number;
  findings:     Finding[];
}): Promise<string> {
  const sys = `You are a digital marketing strategist summarizing what changed for an SEO campaign in the past ${opts.windowDays} days. You read a snapshot comparison (current vs baseline) and a list of detected findings. You produce a 3-paragraph narrative:

Paragraph 1: ONE sentence on the overall direction (gaining / stalling / losing / mixed). Then 1-2 sentences naming the specific changes that drove it.
Paragraph 2: What this means strategically. Tie it to action — what should the user do this week given these changes?
Paragraph 3: What to watch for next. What's the leading indicator that would tell you the trend is continuing or reversing?

Rules:
- Be specific. Reference actual numbers from the findings, not "things changed."
- Honest. If the picture is mixed (some gains + some drops), say so. Don't varnish.
- Tight. 200-350 words total.
- No platitudes. No "keep optimizing."
- Data gaps: If a metric shows N/A, it means that data was not available for this campaign — no target URL set, no GSC data for that dimension, etc. Do NOT interpret N/A values, infer a trend from them, or treat absence as a signal. Explicitly acknowledge the gap: "target URL data was not available for this period."

Reply with the narrative only — no JSON, no headers, just paragraphs.`;

  const findingsCompact = opts.findings.map(f => ({
    kind:       f.finding_kind,
    severity:   f.severity,
    title:      f.finding_title,
    pillar:     f.affected_pillar || null,
    delta:      f.delta_value ?? null,
  }));

  const user = `Campaign keyword: "${opts.keyword}"
Comparison window: last ${opts.windowDays} days

Baseline snapshot (${opts.windowDays} days ago):
- Keyword position: ${opts.baselineSnap.keyword_position ?? 'N/A'}
- Keyword clicks: ${opts.baselineSnap.keyword_clicks ?? 'N/A'}
- Keyword impressions: ${opts.baselineSnap.keyword_impressions ?? 'N/A'}
- Target URL impressions: ${opts.baselineSnap.target_url_impressions ?? 'N/A'}
- Cluster impressions: ${opts.baselineSnap.total_cluster_impressions ?? 'N/A'}
- Panel statuses: ${JSON.stringify(opts.baselineSnap.panel_statuses)}

Current snapshot:
- Keyword position: ${opts.currentSnap.keyword_position ?? 'N/A'}
- Keyword clicks: ${opts.currentSnap.keyword_clicks ?? 'N/A'}
- Keyword impressions: ${opts.currentSnap.keyword_impressions ?? 'N/A'}
- Target URL impressions: ${opts.currentSnap.target_url_impressions ?? 'N/A'}
- Cluster impressions: ${opts.currentSnap.total_cluster_impressions ?? 'N/A'}
- Panel statuses: ${JSON.stringify(opts.currentSnap.panel_statuses)}

Detected findings (${opts.findings.length}):
${JSON.stringify(findingsCompact, null, 2)}

Write the 3-paragraph monitoring narrative.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1500,
      system:     sys,
      messages:   [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  const text = (data?.content?.[0]?.text || '').trim();
  return text.slice(0, 4000);
}

/* ════════════════════════════════════════════════════════════════
   REPORT RENDERING
═══════════════════════════════════════════════════════════════ */

function renderMonitoringReport(opts: {
  keyword:              string;
  currentSnap:          Snapshot;
  baselineSnap:         Snapshot | null;
  findings:             Finding[];
  narrative:            string | null;
  windowDays:           number;
  durationMs:           number;
  runId:                string;
  baselineEstablished:  boolean;
  gscUpdatedAt?:        string | null;
}): string {
  const lines: string[] = [];
  const { findings, currentSnap, baselineSnap, narrative, baselineEstablished } = opts;

  lines.push(`# Monitoring check: "${opts.keyword}"`);
  lines.push('');
  if (baselineEstablished) {
    lines.push(`> 🌱 **Baseline established.** This is the first monitoring snapshot for this campaign. The next monitoring check (after ${opts.windowDays}+ days) will compare against this baseline and surface what changed.`);
  } else {
    lines.push(`> Comparing current state against snapshot from ~${opts.windowDays} days ago.`);
  }
  lines.push('');

  /* Snapshot summary */
  lines.push(`**Window:** ${opts.windowDays} days  `);
  lines.push(`**Snapshot ID:** \`${opts.runId.slice(0, 8)}\`  `);
  lines.push(`**Generated at:** ${new Date().toISOString()}  `);
  lines.push(`**Duration:** ${(opts.durationMs / 1000).toFixed(1)}s`);
  lines.push(formatGscFreshnessLine(opts.gscUpdatedAt ?? null));
  lines.push('');

  /* Current snapshot metrics */
  lines.push('## Current state');
  lines.push('');
  lines.push(`| Metric | Current${baselineSnap ? ' | Baseline | Change' : ''} |`);
  lines.push(`|---|---|${baselineSnap ? '---|---|' : ''}`);

  const fmtNum = (n: number | null | undefined): string => n == null ? '—' : (typeof n === 'number' ? n.toLocaleString() : String(n));
  const fmtPos = (n: number | null | undefined): string => n == null ? '—' : n.toFixed(1);
  const fmtDelta = (curr: number | null | undefined, base: number | null | undefined, isPosition: boolean = false): string => {
    if (curr == null || base == null) return '—';
    const delta = curr - base;
    if (Math.abs(delta) < 0.01) return '0';
    if (isPosition) {
      const sign = delta > 0 ? '+' : '';
      const dir = delta > 0 ? '🔻' : '🔼';
      return `${dir} ${sign}${delta.toFixed(1)}`;
    }
    if (base === 0) return curr > 0 ? `+${curr.toLocaleString()}` : '0';
    const pct = ((curr - base) / base) * 100;
    const sign = pct > 0 ? '+' : '';
    const dir = pct > 0 ? '🔼' : '🔻';
    return `${dir} ${sign}${pct.toFixed(1)}%`;
  };

  if (baselineSnap) {
    lines.push(`| Keyword position | ${fmtPos(currentSnap.keyword_position)} | ${fmtPos(baselineSnap.keyword_position)} | ${fmtDelta(currentSnap.keyword_position, baselineSnap.keyword_position, true)} |`);
    lines.push(`| Keyword clicks | ${fmtNum(currentSnap.keyword_clicks)} | ${fmtNum(baselineSnap.keyword_clicks)} | ${fmtDelta(currentSnap.keyword_clicks, baselineSnap.keyword_clicks)} |`);
    lines.push(`| Keyword impressions | ${fmtNum(currentSnap.keyword_impressions)} | ${fmtNum(baselineSnap.keyword_impressions)} | ${fmtDelta(currentSnap.keyword_impressions, baselineSnap.keyword_impressions)} |`);
    if (currentSnap.target_url) {
      lines.push(`| Target URL impressions | ${fmtNum(currentSnap.target_url_impressions)} | ${fmtNum(baselineSnap.target_url_impressions)} | ${fmtDelta(currentSnap.target_url_impressions, baselineSnap.target_url_impressions)} |`);
      lines.push(`| Target URL clicks | ${fmtNum(currentSnap.target_url_clicks)} | ${fmtNum(baselineSnap.target_url_clicks)} | ${fmtDelta(currentSnap.target_url_clicks, baselineSnap.target_url_clicks)} |`);
    }
    if (currentSnap.total_cluster_impressions != null) {
      lines.push(`| Cluster aggregate impressions | ${fmtNum(currentSnap.total_cluster_impressions)} | ${fmtNum(baselineSnap.total_cluster_impressions)} | ${fmtDelta(currentSnap.total_cluster_impressions, baselineSnap.total_cluster_impressions)} |`);
    }
  } else {
    lines.push(`| Keyword position | ${fmtPos(currentSnap.keyword_position)} |`);
    lines.push(`| Keyword clicks | ${fmtNum(currentSnap.keyword_clicks)} |`);
    lines.push(`| Keyword impressions | ${fmtNum(currentSnap.keyword_impressions)} |`);
    if (currentSnap.target_url) {
      lines.push(`| Target URL impressions | ${fmtNum(currentSnap.target_url_impressions)} |`);
      lines.push(`| Target URL clicks | ${fmtNum(currentSnap.target_url_clicks)} |`);
    }
    if (currentSnap.total_cluster_impressions != null) {
      lines.push(`| Cluster aggregate impressions | ${fmtNum(currentSnap.total_cluster_impressions)} |`);
    }
  }
  lines.push('');

  /* Panel statuses */
  if (Object.keys(currentSnap.panel_statuses || {}).length > 0) {
    lines.push('## Pillar status');
    lines.push('');
    lines.push(`| Pillar | Current${baselineSnap ? ' | Baseline' : ''} |`);
    lines.push(`|---|---|${baselineSnap ? '---|' : ''}`);
    const allPillars = Array.from(new Set([
      ...Object.keys(currentSnap.panel_statuses || {}),
      ...Object.keys(baselineSnap?.panel_statuses || {}),
    ]));
    const statusIcon = (s: string | null | undefined) => s === 'red' ? '🔴' : s === 'amber' ? '🟡' : s === 'green' ? '🟢' : '⚪';
    for (const p of allPillars) {
      const curr = currentSnap.panel_statuses?.[p] || null;
      const base = baselineSnap?.panel_statuses?.[p] || null;
      if (baselineSnap) {
        lines.push(`| ${prettyPillar(p)} | ${statusIcon(curr)} ${curr || 'pending'} | ${statusIcon(base)} ${base || 'pending'} |`);
      } else {
        lines.push(`| ${prettyPillar(p)} | ${statusIcon(curr)} ${curr || 'pending'} |`);
      }
    }
    lines.push('');
  }

  /* Narrative */
  if (narrative) {
    lines.push('## What this means');
    lines.push('');
    lines.push(narrative);
    lines.push('');
  }

  /* Findings */
  if (findings.length > 0) {
    const red    = findings.filter(f => f.severity === 'red');
    const amber  = findings.filter(f => f.severity === 'amber');
    const green  = findings.filter(f => f.severity === 'green');
    const info   = findings.filter(f => f.severity === 'info');

    if (red.length > 0) {
      lines.push('## 🔴 Critical changes');
      lines.push('');
      for (const f of red) {
        lines.push(`### ${f.finding_title}`);
        if (f.finding_detail) lines.push(f.finding_detail);
        if (f.recommendation) { lines.push(''); lines.push(`**Recommendation:** ${f.recommendation}`); }
        lines.push('');
      }
    }

    if (amber.length > 0) {
      lines.push('## 🟡 Warnings');
      lines.push('');
      for (const f of amber) {
        lines.push(`### ${f.finding_title}`);
        if (f.finding_detail) lines.push(f.finding_detail);
        if (f.recommendation) { lines.push(''); lines.push(`**Recommendation:** ${f.recommendation}`); }
        lines.push('');
      }
    }

    if (green.length > 0) {
      lines.push('## 🟢 Positive movements');
      lines.push('');
      for (const f of green) {
        lines.push(`- **${f.finding_title}**${f.finding_detail ? ` — ${f.finding_detail}` : ''}`);
      }
      lines.push('');
    }

    if (info.length > 0) {
      lines.push('## ℹ️ Notes');
      lines.push('');
      for (const f of info) {
        lines.push(`- **${f.finding_title}**${f.finding_detail ? ` — ${f.finding_detail}` : ''}`);
      }
      lines.push('');
    }
  }

  /* Methodology */
  lines.push('## Methodology + caveats');
  lines.push('');
  lines.push(`**What this audit IS:** A point-in-time snapshot comparison. Captures keyword position, target URL stats, cluster aggregate impressions, panel statuses, and opportunity counts — then compares against the most recent snapshot ${opts.windowDays}+ days old.`);
  lines.push('');
  lines.push(`**Severity thresholds:**`);
  lines.push(`- Position drops: ≥${POSITION_DROP_RED} spots = red, ≥${POSITION_DROP_AMBER} spots = amber`);
  lines.push(`- Click/impression drops: ≤${PCT_DROP_RED}% = red, ≤${PCT_DROP_AMBER}% = amber`);
  lines.push(`- Gains: ≥${PCT_GAIN_GREEN}% = strong (worth amplifying), ≥${PCT_GAIN_AMBER}% = positive`);
  lines.push('');
  lines.push(`**What this audit is NOT:** Real-time rank tracking. GSC data has a 2-3 day delay. Position values are GSC averages, not specific-time-of-day rankings. For minute-level rank tracking, integrate a dedicated rank tracker.`);
  lines.push('');
  lines.push(`**Snapshot persistence:** Each monitoring run persists a snapshot to monitoring_snapshots. Future runs use these for delta computation. Don't manually delete snapshots — that breaks the comparison chain.`);
  lines.push('');
  lines.push(`**Narrative source:** ${narrative ? 'LLM-synthesized from the structured findings + snapshot comparison.' : 'No LLM narrative generated (skipped on baseline runs or LLM unavailable).'}`);

  return lines.join('\n');
}

function buildHeadline(opts: {
  keyword: string;
  findings: Finding[];
  baselineEstablished: boolean;
  redCount: number;
  amberCount: number;
  greenCount: number;
}): string {
  if (opts.baselineEstablished) {
    return `🌱 Baseline snapshot captured for "${opts.keyword}" — comparison available after next monitoring run.`;
  }
  if (opts.redCount > 0) {
    return `🔴 ${opts.redCount} critical change${opts.redCount === 1 ? '' : 's'}, ${opts.amberCount} warning${opts.amberCount === 1 ? '' : 's'}, ${opts.greenCount} positive movement${opts.greenCount === 1 ? '' : 's'}.`;
  }
  if (opts.amberCount > 0) {
    return `🟡 ${opts.amberCount} warning${opts.amberCount === 1 ? '' : 's'}, ${opts.greenCount} positive movement${opts.greenCount === 1 ? '' : 's'}.`;
  }
  if (opts.greenCount > 0) {
    return `🟢 ${opts.greenCount} positive movement${opts.greenCount === 1 ? '' : 's'} — no warnings.`;
  }
  return `Stable — no significant changes detected.`;
}

/* ════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════ */

async function readGscQueries(projectId: string): Promise<GscQueryRow[]> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_value").eq("project_id", projectId)
      .eq("category", "analytics").eq("field_key", "gsc_top_queries").maybeSingle();
    const raw = (data as any)?.field_value;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function readGscPages(projectId: string): Promise<GscPageRow[]> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_value").eq("project_id", projectId)
      .eq("category", "analytics").eq("field_key", "gsc_top_pages").maybeSingle();
    const raw = (data as any)?.field_value;
    return raw ? JSON.parse(raw) : [];
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

function prettyPillar(p: string): string {
  return ({
    research:         'Research',
    technical_audit:  'Technical Audit',
    cluster_map:      'Cluster Map',
    content:          'Content',
    internal_linking: 'Internal Linking',
    off_page:         'Off-Page Strategy',
    monitoring:       'Monitoring',
  } as Record<string, string>)[p] || p;
}
