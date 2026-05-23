/* ════════════════════════════════════════════════════════════════
   api/lib/seo-campaign-engine.ts
   Phase 14 — Campaign foundation.

   Campaigns reframe work from one-shot pipelines to ongoing programs.
   When `rank me for X` runs, this engine ensures there's a campaign
   with 6 panels, links the pipeline run to the content panel, and
   writes pipeline artifacts as panel reports.

   Functions exported:
     • createOrFindCampaign — idempotent, called from rank pipeline
     • listCampaigns        — for PM UI
     • getCampaignDetail    — campaign + panels + recent reports + opportunities
     • pauseCampaign / resumeCampaign / archiveCampaign
     • writeReportToPanel   — used by pipeline + (later) cron + manual
     • generateLivingOverview — synthesize executive summary
     • activatePanel / schedulePanelRecheck — used when phases ship pillars
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

/* ─── Pillar definitions ──────────────────────────────────── */

interface PillarSpec {
  pillar: 'technical_audit' | 'cluster_map' | 'content' | 'internal_linking' | 'off_page' | 'monitoring' | 'research';
  display_order: number;
  goal_summary: string;
  recheck_cadence_days: number;
  /* Initially active for THIS rank command? */
  initial_status: 'scheduled' | 'active';
  scheduled_note?: string;
}

const RANK_CAMPAIGN_PILLARS: PillarSpec[] = [
  {
    pillar: 'content',
    display_order: 1,
    goal_summary: 'Produce a senior-strategist-quality brief, then track content publication and performance.',
    recheck_cadence_days: 14,
    initial_status: 'active',
  },
  {
    pillar: 'research',
    display_order: 2,
    goal_summary: 'Hold the research intelligence: keyword research, SERP/competitor snapshot, GSC context, strategy. Reusable across campaigns.',
    recheck_cadence_days: 30,
    initial_status: 'active',                    // populated by every rank pipeline
  },
  {
    pillar: 'technical_audit',
    display_order: 3,
    goal_summary: 'Audit target page on-page, indexability, Core Web Vitals; recommend prioritized fixes.',
    recheck_cadence_days: 7,
    initial_status: 'active',                  // Phase 15 — audits target page when one exists
  },
  {
    pillar: 'cluster_map',
    display_order: 4,
    goal_summary: 'Map the topical cluster; identify hub-and-spoke structure; surface coverage gaps.',
    recheck_cadence_days: 30,
    initial_status: 'active',                   // Phase 16 — maps GSC query universe into clusters
  },
  {
    pillar: 'internal_linking',
    display_order: 5,
    goal_summary: 'Identify authority pages, suggest internal links, track link execution and impact.',
    recheck_cadence_days: 30,
    initial_status: 'active',                  // Phase 17 — link graph audit + recommendations
  },
  {
    pillar: 'off_page',
    display_order: 6,
    goal_summary: 'Identify linkable assets, outreach targets, broken-link opportunities, brand mentions.',
    recheck_cadence_days: 14,
    initial_status: 'active',                   // Phase 18 — linkable assets + prospect strategy
  },
  {
    pillar: 'monitoring',
    display_order: 7,
    goal_summary: 'Daily rank/traffic tracking, forecast variance detection, escalation when off-trajectory.',
    recheck_cadence_days: 1,
    initial_status: 'active',
  },
];

/* ─── createOrFindCampaign — idempotent for (project, keyword) ───
   Phase 21 Block 2: extended to accept keyword_group + positioning +
   decisions_avoided. The primary keyword is the first element of the
   group; if no group is provided, [keyword] is used. */

export async function createOrFindCampaign(opts: {
  projectId: string;
  keyword: string;
  campaignKind?: 'rank_for_keyword' | 'traffic_growth' | 'sales_funnel' | 'authority_building' | 'recovery';
  goal?: string;
  /* Phase 21 Block 2 — quality foundation metadata */
  keywordGroup?:        string[];                    // 1-8 keywords, primary first
  keywordIntentLabel?:  string;
  projectPositioning?:  any;                         // ProjectPositioning JSON
  excludedKeywords?:    string[];
  decisionsAvoided?:    any[];                       // array of decision_avoided entries
  campaignType?:        'standard' | 'feasibility_exploration' | 'merged_with';
  parentCampaignId?:    string;
  /* Phase 21 Block 2.5 — URL targeting */
  targetUrls?:          string[];
  keywordUrlMapping?:   Record<string, string>;
  urlFitAnalysis?:      Record<string, any>;
}): Promise<{ success: boolean; campaign_id?: string; created?: boolean; reused?: boolean; error?: string }> {
  const kind = opts.campaignKind || 'rank_for_keyword';
  const keywordSlim = opts.keyword.trim().toLowerCase().slice(0, 240);

  /* Normalize the keyword_group: ensure primary is at index 0, dedupe, cap at 8 */
  let keywordGroup: string[] | undefined;
  if (Array.isArray(opts.keywordGroup) && opts.keywordGroup.length > 0) {
    const cleaned = opts.keywordGroup
      .map(k => (k || '').trim().toLowerCase())
      .filter(k => k.length >= 2 && k.length <= 240);
    /* Ensure primary keyword is first */
    const withoutPrimary = cleaned.filter(k => k !== keywordSlim);
    keywordGroup = [keywordSlim, ...withoutPrimary].slice(0, 8);
    /* Dedupe while preserving order */
    keywordGroup = Array.from(new Set(keywordGroup));
  }

  try {
    /* Look for an existing active or paused campaign with the same keyword */
    const { data: existing } = await db().from("seo_campaigns")
      .select("id, status")
      .eq("project_id", opts.projectId)
      .eq("keyword", keywordSlim)
      .in("status", ['active', 'paused'])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const e = existing as any;
      /* If paused, auto-resume (decision: same keyword → reuse + append) */
      if (e.status === 'paused') {
        await db().from("seo_campaigns").update({
          status: 'active',
          resumed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", e.id);
      }
      return { success: true, campaign_id: e.id, reused: true };
    }

    /* Create new campaign */
    const insertRow: any = {
      project_id:     opts.projectId,
      keyword:        keywordSlim,
      campaign_kind:  kind,
      goal:           (opts.goal || `Rank for "${opts.keyword}"`).slice(0, 500),
      status:         'active',
    };

    /* Phase 21 Block 2 — persist quality foundation metadata when provided */
    if (keywordGroup && keywordGroup.length > 0) {
      insertRow.keyword_group = keywordGroup;
    } else {
      /* Default: single-keyword campaigns get keyword_group = [keyword] for consistency */
      insertRow.keyword_group = [keywordSlim];
    }
    if (opts.keywordIntentLabel) insertRow.keyword_intent_label = opts.keywordIntentLabel.slice(0, 200);
    if (opts.projectPositioning) insertRow.project_positioning  = opts.projectPositioning;
    if (Array.isArray(opts.excludedKeywords) && opts.excludedKeywords.length > 0) {
      insertRow.excluded_keywords = opts.excludedKeywords.slice(0, 30);
    }
    if (Array.isArray(opts.decisionsAvoided) && opts.decisionsAvoided.length > 0) {
      insertRow.decisions_avoided = opts.decisionsAvoided.slice(0, 50);
    }
    if (opts.campaignType) insertRow.campaign_type = opts.campaignType;
    if (opts.parentCampaignId) insertRow.parent_campaign_id = opts.parentCampaignId;

    /* Phase 21 Block 2.5 — URL targeting persistence */
    if (Array.isArray(opts.targetUrls) && opts.targetUrls.length > 0) {
      insertRow.target_urls = opts.targetUrls.slice(0, 20);
    }
    if (opts.keywordUrlMapping && Object.keys(opts.keywordUrlMapping).length > 0) {
      insertRow.keyword_url_mapping = opts.keywordUrlMapping;
    }
    if (opts.urlFitAnalysis && Object.keys(opts.urlFitAnalysis).length > 0) {
      insertRow.url_fit_analysis = opts.urlFitAnalysis;
    }

    const { data: inserted, error: insertErr } = await db().from("seo_campaigns").insert(insertRow).select("id").maybeSingle();

    if (insertErr || !inserted) {
      return { success: false, error: insertErr?.message || 'campaign insert failed' };
    }
    const campaignId = (inserted as any).id as string;

    /* Create the 6 panels */
    const panelRows = RANK_CAMPAIGN_PILLARS.map(p => ({
      campaign_id:           campaignId,
      project_id:            opts.projectId,
      pillar:                p.pillar,
      display_order:         p.display_order,
      status:                p.initial_status,
      goal_summary:          p.goal_summary,
      recheck_cadence_days:  p.recheck_cadence_days,
      next_recheck_at:       p.initial_status === 'active'
        ? new Date(Date.now() + p.recheck_cadence_days * 86_400_000).toISOString()
        : null,
      scheduled_note:        p.scheduled_note || null,
      current_status:        null,
      current_summary:       p.initial_status === 'scheduled' ? p.scheduled_note : null,
    }));

    const { error: panelsErr } = await db().from("seo_campaign_panels").insert(panelRows);
    if (panelsErr) {
      /* Best-effort rollback */
      await db().from("seo_campaigns").delete().eq("id", campaignId);
      return { success: false, error: `panels insert failed: ${panelsErr.message}` };
    }

    return { success: true, campaign_id: campaignId, created: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'createOrFindCampaign failed' };
  }
}

/* ─── Get the content panel ID for a campaign (used to link pipeline runs) */

export async function getContentPanelId(campaignId: string): Promise<string | null> {
  const { data } = await db().from("seo_campaign_panels")
    .select("id").eq("campaign_id", campaignId).eq("pillar", 'content').maybeSingle();
  return (data as any)?.id || null;
}

/* ─── listCampaigns — for PM UI ─────────────────────────────── */

export async function listCampaigns(opts: {
  projectId: string;
  statusFilter?: 'active' | 'paused' | 'completed' | 'archived' | 'all';
}): Promise<{ success: boolean; campaigns?: any[]; error?: string }> {
  try {
    let q = db().from("seo_campaigns")
      .select("id, keyword, goal, campaign_kind, status, health, current_position, target_position, started_at, target_due_at, last_assessed_at, paused_at, updated_at")
      .eq("project_id", opts.projectId)
      .order("updated_at", { ascending: false });

    if (opts.statusFilter && opts.statusFilter !== 'all') {
      q = q.eq("status", opts.statusFilter);
    }

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, campaigns: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || 'list failed' };
  }
}

/* ─── getCampaignDetail — full drill-in view ────────────────── */

export async function getCampaignDetail(opts: {
  campaignId: string;
}): Promise<{
  success: boolean;
  campaign?: any;
  panels?: any[];
  recent_reports?: any[];
  open_opportunities?: any[];
  pipeline_runs?: any[];
  error?: string;
}> {
  try {
    const { data: campaign, error: campErr } = await db().from("seo_campaigns")
      .select("*").eq("id", opts.campaignId).maybeSingle();
    if (campErr || !campaign) return { success: false, error: campErr?.message || 'campaign not found' };

    const { data: panels } = await db().from("seo_campaign_panels")
      .select("*").eq("campaign_id", opts.campaignId).order("display_order");

    const { data: reports } = await db().from("seo_campaign_reports")
      .select("id, panel_id, pillar, report_kind, title, summary, body_md, confidence_rating, generated_by, llm_calls_used, web_searches_used, data_sources, created_at")
      .eq("campaign_id", opts.campaignId)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: opps } = await db().from("seo_opportunities")
      .select("id, kind, title, description, estimated_value, estimated_effort, suggested_action, discovered_at")
      .eq("source_campaign_id", opts.campaignId)
      .eq("status", 'open')
      .order("discovered_at", { ascending: false })
      .limit(20);

    const { data: runs } = await db().from("season_pipeline_runs")
      .select("id, pipeline_type, status, started_at, finished_at, steps_completed, step_count, llm_calls_used, estimated_cost_usd")
      .eq("campaign_id", opts.campaignId)
      .order("started_at", { ascending: false })
      .limit(10);

    return {
      success: true,
      campaign,
      panels:             panels || [],
      recent_reports:     reports || [],
      open_opportunities: opps || [],
      pipeline_runs:      runs || [],
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'detail failed' };
  }
}

/* ─── pauseCampaign / resumeCampaign / archiveCampaign ────── */

export async function pauseCampaign(opts: {
  campaignId: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await db().from("seo_campaigns").update({
      status:        'paused',
      paused_at:     new Date().toISOString(),
      paused_reason: (opts.reason || '').slice(0, 500),
      updated_at:    new Date().toISOString(),
    }).eq("id", opts.campaignId);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'pause failed' };
  }
}

export async function resumeCampaign(opts: {
  campaignId: string;
}): Promise<{ success: boolean; resumed_after_days?: number; error?: string }> {
  try {
    const { data: c } = await db().from("seo_campaigns").select("paused_at").eq("id", opts.campaignId).maybeSingle();
    const pausedAt = (c as any)?.paused_at ? new Date((c as any).paused_at).getTime() : null;
    const daysPaused = pausedAt ? Math.round((Date.now() - pausedAt) / 86_400_000) : 0;

    await db().from("seo_campaigns").update({
      status:        'active',
      resumed_at:    new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    }).eq("id", opts.campaignId);

    /* Mode (c) — write a "resumed after N days" report */
    if (daysPaused > 0) {
      await db().from("seo_campaign_reports").insert({
        campaign_id:     opts.campaignId,
        project_id:      await projectIdForCampaign(opts.campaignId),
        pillar:          'monitoring',
        report_kind:     'resumed_diff',
        generated_by:    'manual',
        title:           `Campaign resumed after ${daysPaused} day${daysPaused === 1 ? '' : 's'}`,
        body_md:         `## Campaign resumed\n\nThe campaign was paused on ${(c as any)?.paused_at} and resumed on ${new Date().toISOString()}.\n\n**Days paused:** ${daysPaused}\n\nNext steps:\n- Stale panel data will be flagged at next scheduled recheck\n- Monitoring resumes immediately\n- Forecasts that were paused will recompute from current baseline`,
        summary:         `Resumed after ${daysPaused} days.`,
        data_sources:    ['system'],
      });
    }

    return { success: true, resumed_after_days: daysPaused };
  } catch (e: any) {
    return { success: false, error: e?.message || 'resume failed' };
  }
}

export async function archiveCampaign(opts: {
  campaignId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await db().from("seo_campaigns").update({
      status:     'archived',
      updated_at: new Date().toISOString(),
    }).eq("id", opts.campaignId);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'archive failed' };
  }
}

/* ─── writeReportToPanel ────────────────────────────────────
   Called by pipeline steps, cron sweeps, or manual triggers. */

export type ReportKind =
  | 'initial_baseline' | 'scheduled_recheck' | 'manual_refresh'
  | 'pipeline_artifact' | 'resumed_diff' | 'living_overview'
  /* Phase 14.0.2 — specific artifact kinds for reusability/searchability */
  | 'keyword_research' | 'gsc_baseline' | 'competitor_intel'
  | 'strategy' | 'forecast_emission'
  | 'content_brief' | 'client_update' | 'handover';

export async function writeReportToPanel(opts: {
  campaignId:        string;
  projectId:         string;
  pillar:            string;
  panelId?:          string;
  reportKind:        ReportKind;
  generatedBy:       'cron' | 'manual' | 'pipeline';
  pipelineRunId?:    string;
  llmCallsUsed?:     number;
  webSearchesUsed?:  number;
  dataSources?:      string[];
  confidenceRating?: 'high' | 'medium' | 'low';
  confidenceReason?: string;
  title:             string;
  bodyMd:            string;
  summary?:          string;
  metricSnapshot?:   any;
  tags?:             string[];        // Phase 14.0.2 — findability
  searchableText?:   string;          // Phase 14.0.2 — full-text search
  /* Also update the panel's current_summary + last_assessed_at? */
  updatePanelStatus?: boolean;
  newPanelStatus?:    'green' | 'amber' | 'red';
}): Promise<{ success: boolean; report_id?: string; error?: string }> {
  try {
    /* Resolve panelId if not given */
    let panelId = opts.panelId;
    if (!panelId) {
      const { data: p } = await db().from("seo_campaign_panels")
        .select("id").eq("campaign_id", opts.campaignId).eq("pillar", opts.pillar).maybeSingle();
      panelId = (p as any)?.id;
    }

    const { data: inserted, error: insertErr } = await db().from("seo_campaign_reports").insert({
      campaign_id:        opts.campaignId,
      panel_id:           panelId,
      project_id:         opts.projectId,
      pillar:             opts.pillar,
      report_kind:        opts.reportKind,
      generated_by:       opts.generatedBy,
      pipeline_run_id:    opts.pipelineRunId || null,
      llm_calls_used:     opts.llmCallsUsed || 0,
      web_searches_used:  opts.webSearchesUsed || 0,
      data_sources:       opts.dataSources || null,
      confidence_rating:  opts.confidenceRating || null,
      confidence_reason:  opts.confidenceReason || null,
      title:              opts.title.slice(0, 240),
      body_md:            opts.bodyMd,
      summary:            opts.summary?.slice(0, 1000) || null,
      metric_snapshot:    opts.metricSnapshot || null,
      tags:               opts.tags && opts.tags.length > 0 ? opts.tags.slice(0, 30) : null,
      searchable_text:    opts.searchableText
                            ? opts.searchableText.slice(0, 8000)
                            : `${opts.title}\n${opts.summary || ''}\n${opts.bodyMd.slice(0, 3000)}`.slice(0, 8000),
    }).select("id").maybeSingle();

    if (insertErr || !inserted) return { success: false, error: insertErr?.message || 'report insert failed' };

    /* Update panel if requested */
    if (panelId && opts.updatePanelStatus) {
      await db().from("seo_campaign_panels").update({
        last_assessed_at:    new Date().toISOString(),
        current_status:      opts.newPanelStatus || null,
        current_summary:     opts.summary?.slice(0, 500) || null,
        updated_at:          new Date().toISOString(),
      }).eq("id", panelId);
    }

    return { success: true, report_id: (inserted as any).id };
  } catch (e: any) {
    return { success: false, error: e?.message || 'write report failed' };
  }
}

/* ─── generateLivingOverview ────────────────────────────────
   Phase 20 — LLM-synthesized executive summary across all pillars.

   Pulls each pillar's current_status + latest report summary + open
   opportunities, then makes ONE Claude call that produces a strategic
   synthesis: headline + momentum + top 3 priorities + cross-pillar
   insights + 90-day arc + risks.

   Fallback: if the LLM call fails or there's not enough data yet, falls
   back to the template version (same as Phase 14 behavior). Callers
   don't break.

   Cost: ~1 LLM call per refresh (~$0.05). Called from campaign creation,
   post-pipeline auto-refresh, and the manual Refresh button. */

const ANTHROPIC_API_KEY_LO = process.env.ANTHROPIC_API_KEY || "";
const MODEL_LO = "claude-sonnet-4-6";

export async function generateLivingOverview(opts: {
  campaignId: string;
}): Promise<{ success: boolean; overview_md?: string; error?: string }> {
  try {
    const { campaign, panels, recent_reports, open_opportunities } = await getCampaignDetail({ campaignId: opts.campaignId });
    if (!campaign) return { success: false, error: 'campaign not found' };

    const activePanels = (panels || []).filter((p: any) => p.status === 'active');
    const hasReports   = (recent_reports || []).length > 0;

    /* Decide synthesis path. */
    let overviewMd: string;
    let usedLlm = false;
    if (hasReports && activePanels.length >= 2) {
      /* Try LLM synthesis. Fallback to template on any failure. */
      try {
        const synthesis = await synthesizeOverviewWithLlm({
          campaign,
          panels:     panels || [],
          reports:    recent_reports || [],
          opportunities: open_opportunities || [],
        });
        overviewMd = renderSynthesizedOverview(campaign, panels || [], recent_reports || [], synthesis);
        usedLlm = true;
      } catch (e: any) {
        console.log(`[generateLivingOverview] LLM synthesis failed, falling back to template: ${e?.message}`);
        overviewMd = renderTemplateOverview(campaign, panels || [], recent_reports || []);
      }
    } else {
      /* Not enough data for meaningful synthesis — template only. */
      overviewMd = renderTemplateOverview(campaign, panels || [], recent_reports || []);
    }

    await db().from("seo_campaigns").update({
      living_overview_md: overviewMd,
      last_assessed_at:   new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    }).eq("id", opts.campaignId);

    return { success: true, overview_md: overviewMd };
  } catch (e: any) {
    return { success: false, error: e?.message || 'overview gen failed' };
  }
}

/* ─── Template overview (fallback) ──────────────────────── */

function renderTemplateOverview(campaign: any, panels: any[], reports: any[]): string {
  const activePanels    = panels.filter(p => p.status === 'active');
  const scheduledPanels = panels.filter(p => p.status === 'scheduled');
  const reportCount     = reports.length;

  const lines: string[] = [];
  lines.push(`# Campaign: ${campaign.keyword}\n`);
  lines.push(`**Goal:** ${campaign.goal || `Rank for "${campaign.keyword}"`}\n`);
  lines.push(`**Status:** ${campaign.status}${campaign.health ? ` (${campaign.health})` : ''}\n`);
  lines.push(`**Started:** ${new Date(campaign.started_at).toLocaleDateString()}\n`);
  if (campaign.current_position && campaign.target_position) {
    lines.push(`**Current → Target:** position ${campaign.current_position} → ${campaign.target_position}\n`);
  }

  lines.push(`\n## Active pillars (${activePanels.length})\n`);
  if (activePanels.length === 0) {
    lines.push(`_No pillars active yet._`);
  } else {
    for (const p of activePanels) {
      const status = p.current_status ? ` (${p.current_status})` : '';
      const summary = p.current_summary || p.goal_summary || '_(no summary yet)_';
      lines.push(`- **${prettyPillar(p.pillar)}**${status}: ${summary}`);
    }
  }

  if (scheduledPanels.length > 0) {
    lines.push(`\n## Pillars activating in future releases (${scheduledPanels.length})\n`);
    for (const p of scheduledPanels) {
      lines.push(`- **${prettyPillar(p.pillar)}**: ${p.scheduled_note || '(activation note pending)'}`);
    }
  }

  lines.push(`\n## Recent activity\n`);
  if (reportCount === 0) {
    lines.push(`_No reports yet._`);
  } else {
    lines.push(`${reportCount} reports in the last 20 entries. Most recent:\n`);
    for (const r of reports.slice(0, 5)) {
      lines.push(`- _${new Date(r.created_at).toLocaleString()}_ — **${r.title}** (${prettyPillar(r.pillar)})${r.summary ? `: ${r.summary}` : ''}`);
    }
  }

  return lines.join('\n');
}

/* ─── LLM synthesis ────────────────────────────────────── */

interface SynthesisOutput {
  headline:               string;
  momentum:               'gaining' | 'stalled' | 'losing' | 'early';
  top_priorities:         { title: string; pillar: string; rationale: string; effort_estimate: 'low' | 'medium' | 'high' }[];
  cross_pillar_insights:  { insight: string; pillars_involved: string[] }[];
  ninety_day_arc:         string;
  risks:                  { risk: string; mitigation: string }[];
  confidence:             'high' | 'medium' | 'low';
  confidence_reason:      string;
}

async function synthesizeOverviewWithLlm(opts: {
  campaign: any;
  panels:   any[];
  reports:  any[];
  opportunities: any[];
}): Promise<SynthesisOutput> {
  const { campaign, panels, reports, opportunities } = opts;

  /* Build per-pillar context: status + summary + latest report */
  const activePanels = panels.filter(p => p.status === 'active');
  const pillarContexts = activePanels.map(p => {
    const latestReport = reports.find(r => r.pillar === p.pillar);
    return {
      pillar:          p.pillar,
      current_status:  p.current_status || 'unknown',
      current_summary: p.current_summary || p.goal_summary || '',
      latest_report:   latestReport ? {
        title:      latestReport.title,
        summary:    latestReport.summary || '',
        confidence: latestReport.confidence_rating || 'unknown',
        kind:       latestReport.report_kind,
        age_days:   Math.round((Date.now() - new Date(latestReport.created_at).getTime()) / 86_400_000),
      } : null,
    };
  });

  /* Aggregate opportunities by kind */
  const opportunitiesByKind: Record<string, number> = {};
  for (const o of opportunities) {
    opportunitiesByKind[o.kind] = (opportunitiesByKind[o.kind] || 0) + 1;
  }
  const topOpportunities = opportunities.slice(0, 5).map(o => ({
    kind:  o.kind,
    title: o.title,
    value: o.estimated_value || 'unknown',
    effort: o.estimated_effort || 'unknown',
  }));

  const campaignAgeDays = Math.round((Date.now() - new Date(campaign.started_at).getTime()) / 86_400_000);

  const sys = `You are a senior digital marketing strategist synthesizing the strategic state of an SEO campaign. You read each pillar's current status + latest report + open opportunities, then produce ONE coherent strategic synthesis.

Your output MUST be honest. Failure modes to avoid:
- Don't say "everything looks great" if any pillar is amber/red — surface the weakness
- Don't generate generic platitudes ("keep optimizing!") — be specific and operational
- Don't ignore the data — every claim in your output must trace to a pillar report or opportunity
- If you see cross-pillar patterns (e.g., the same URL flagged by both Technical Audit AND Internal Linking), connect them — that's the highest-value insight type
- "Confidence" should reflect data quality. Sparse reports + few opportunities → low confidence. Comprehensive recent reports → high.

Output structure (JSON only, no preamble):
{
  "headline": "ONE sentence — the strategic state of this campaign right now. Specific. NOT 'campaign is progressing.'",
  "momentum": "gaining" | "stalled" | "losing" | "early",
  "top_priorities": [
    { "title": "...", "pillar": "...", "rationale": "1 sentence why this is the top priority", "effort_estimate": "low|medium|high" }
  ],
  "cross_pillar_insights": [
    { "insight": "...", "pillars_involved": ["pillar1", "pillar2"] }
  ],
  "ninety_day_arc": "2-3 sentences. What does success look like in 90 days IF the priorities above are executed? What does failure look like?",
  "risks": [
    { "risk": "...", "mitigation": "..." }
  ],
  "confidence": "high" | "medium" | "low",
  "confidence_reason": "1-2 sentences"
}

Rules:
- top_priorities: exactly 3 items, ordered by urgency. Each must reference a specific pillar.
- cross_pillar_insights: 0-3 items. ONLY include if you genuinely see a cross-pillar pattern. Empty array is better than forced.
- risks: 0-3 items. ONLY surface real risks, not theoretical ones.
- Keep total output under ~800 words. Tight beats verbose.`;

  const user = `Campaign: "${campaign.keyword}"
Goal: ${campaign.goal || `Rank for "${campaign.keyword}"`}
Status: ${campaign.status}${campaign.health ? ` (health: ${campaign.health})` : ''}
Age: ${campaignAgeDays} days
${campaign.current_position ? `Current position: ${campaign.current_position}` : ''}${campaign.target_position ? ` → Target: ${campaign.target_position}` : ''}

Active pillars (${activePanels.length}):
${JSON.stringify(pillarContexts, null, 2)}

Open opportunities (${opportunities.length} total):
- By kind: ${JSON.stringify(opportunitiesByKind)}
- Top 5:
${JSON.stringify(topOpportunities, null, 2)}

Recent reports count: ${reports.length} (last 20)

Synthesize the strategic state.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         ANTHROPIC_API_KEY_LO,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model:      MODEL_LO,
      max_tokens: 2500,
      system:     sys,
      messages:   [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  const text = (data?.content?.[0]?.text || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(cleaned);

  /* Validate + sanitize */
  return {
    headline:    String(parsed.headline || 'Campaign state synthesis').slice(0, 500),
    momentum:    validateMomentum(parsed.momentum),
    top_priorities: Array.isArray(parsed.top_priorities)
      ? parsed.top_priorities.slice(0, 3).map((p: any) => ({
          title:           String(p.title || '').slice(0, 200),
          pillar:          String(p.pillar || '').slice(0, 50),
          rationale:       String(p.rationale || '').slice(0, 500),
          effort_estimate: validateEffortEstimate(p.effort_estimate),
        })).filter((p: any) => p.title && p.pillar)
      : [],
    cross_pillar_insights: Array.isArray(parsed.cross_pillar_insights)
      ? parsed.cross_pillar_insights.slice(0, 3).map((i: any) => ({
          insight:          String(i.insight || '').slice(0, 800),
          pillars_involved: Array.isArray(i.pillars_involved)
                              ? i.pillars_involved.filter((x: any) => typeof x === 'string').slice(0, 6)
                              : [],
        })).filter((i: any) => i.insight && i.pillars_involved.length > 0)
      : [],
    ninety_day_arc:    String(parsed.ninety_day_arc || '').slice(0, 1000),
    risks: Array.isArray(parsed.risks)
      ? parsed.risks.slice(0, 3).map((r: any) => ({
          risk:       String(r.risk || '').slice(0, 400),
          mitigation: String(r.mitigation || '').slice(0, 400),
        })).filter((r: any) => r.risk && r.mitigation)
      : [],
    confidence:        validateOverviewConfidence(parsed.confidence),
    confidence_reason: String(parsed.confidence_reason || '').slice(0, 500),
  };
}

function validateMomentum(raw: any): 'gaining' | 'stalled' | 'losing' | 'early' {
  const valid = ['gaining', 'stalled', 'losing', 'early'];
  const lc = String(raw).toLowerCase();
  return (valid.includes(lc) ? lc : 'early') as any;
}

function validateEffortEstimate(raw: any): 'low' | 'medium' | 'high' {
  const valid = ['low', 'medium', 'high'];
  const lc = String(raw).toLowerCase();
  return (valid.includes(lc) ? lc : 'medium') as any;
}

function validateOverviewConfidence(raw: any): 'high' | 'medium' | 'low' {
  const valid = ['high', 'medium', 'low'];
  const lc = String(raw).toLowerCase();
  return (valid.includes(lc) ? lc : 'medium') as any;
}

/* ─── Render synthesis to markdown ────────────────────── */

function renderSynthesizedOverview(
  campaign: any,
  panels: any[],
  reports: any[],
  s: SynthesisOutput,
): string {
  const activePanels    = panels.filter(p => p.status === 'active');
  const scheduledPanels = panels.filter(p => p.status === 'scheduled');
  const lines: string[] = [];

  /* Header */
  lines.push(`# Campaign: ${campaign.keyword}`);
  lines.push('');

  /* Momentum badge + headline */
  const momentumIcon = s.momentum === 'gaining'  ? '📈'
                     : s.momentum === 'stalled'  ? '➡️'
                     : s.momentum === 'losing'   ? '📉'
                     : '🌱';
  lines.push(`## ${momentumIcon} ${s.headline}`);
  lines.push('');
  lines.push(`**Momentum:** ${s.momentum} · **Goal:** ${campaign.goal || `Rank for "${campaign.keyword}"`} · **Started:** ${new Date(campaign.started_at).toLocaleDateString()}`);
  if (campaign.current_position && campaign.target_position) {
    lines.push(`**Position:** ${campaign.current_position} → target ${campaign.target_position}`);
  }
  lines.push('');

  /* Top priorities */
  if (s.top_priorities.length > 0) {
    lines.push(`## 🎯 Top priorities this week`);
    lines.push('');
    for (let i = 0; i < s.top_priorities.length; i++) {
      const p = s.top_priorities[i];
      const effortIcon = p.effort_estimate === 'low' ? '🟢' : p.effort_estimate === 'medium' ? '🟡' : '🔴';
      lines.push(`${i + 1}. **${p.title}** _(${prettyPillar(p.pillar)} · ${effortIcon} ${p.effort_estimate} effort)_`);
      lines.push(`   ${p.rationale}`);
      lines.push('');
    }
  }

  /* Cross-pillar insights — the most valuable section */
  if (s.cross_pillar_insights.length > 0) {
    lines.push(`## 🔗 Cross-pillar connections`);
    lines.push('');
    lines.push(`_Patterns that span multiple pillars — these are usually the highest-leverage signals._`);
    lines.push('');
    for (const i of s.cross_pillar_insights) {
      const pillarList = i.pillars_involved.map(p => `**${prettyPillar(p)}**`).join(' + ');
      lines.push(`- ${i.insight}`);
      lines.push(`  _Pillars involved: ${pillarList}_`);
      lines.push('');
    }
  }

  /* 90-day arc */
  if (s.ninety_day_arc) {
    lines.push(`## 🗺️ 90-day arc`);
    lines.push('');
    lines.push(s.ninety_day_arc);
    lines.push('');
  }

  /* Risks */
  if (s.risks.length > 0) {
    lines.push(`## ⚠️ Risks`);
    lines.push('');
    for (const r of s.risks) {
      lines.push(`- **${r.risk}**`);
      lines.push(`  _Mitigation:_ ${r.mitigation}`);
      lines.push('');
    }
  }

  /* Pillar status grid (compact) */
  lines.push(`## Pillar status`);
  lines.push('');
  if (activePanels.length === 0) {
    lines.push(`_No pillars active yet._`);
  } else {
    lines.push(`| Pillar | Status | Summary |`);
    lines.push(`|---|---|---|`);
    for (const p of activePanels) {
      const status = p.current_status ? p.current_status : 'pending';
      const icon   = status === 'green' ? '🟢' : status === 'amber' ? '🟡' : status === 'red' ? '🔴' : '⚪';
      const summary = (p.current_summary || p.goal_summary || '').replace(/\|/g, '\\|').slice(0, 120);
      lines.push(`| ${prettyPillar(p.pillar)} | ${icon} ${status} | ${summary} |`);
    }
  }
  if (scheduledPanels.length > 0) {
    lines.push('');
    lines.push(`_${scheduledPanels.length} pillar${scheduledPanels.length === 1 ? '' : 's'} scheduled for future activation._`);
  }
  lines.push('');

  /* Recent reports */
  if (reports.length > 0) {
    lines.push(`## Recent reports`);
    lines.push('');
    for (const r of reports.slice(0, 5)) {
      lines.push(`- _${new Date(r.created_at).toLocaleString()}_ — **${r.title}** (${prettyPillar(r.pillar)})${r.summary ? `: ${r.summary}` : ''}`);
    }
    lines.push('');
  }

  /* Methodology */
  lines.push(`---`);
  lines.push('');
  lines.push(`_**Synthesis confidence:** ${s.confidence} — ${s.confidence_reason}_`);
  lines.push('');
  lines.push(`_This overview is LLM-synthesized from ${activePanels.length} active pillar${activePanels.length === 1 ? '' : 's'}. Each claim traces to a pillar report or opportunity. Re-run the Refresh button after major changes to update the synthesis._`);

  return lines.join('\n');
}


/* ─── helpers ──────────────────────────────────────────────── */

async function projectIdForCampaign(campaignId: string): Promise<string> {
  const { data } = await db().from("seo_campaigns").select("project_id").eq("id", campaignId).maybeSingle();
  return (data as any)?.project_id || '';
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

/* ─── Opportunity helpers (exported for the rank pipeline) ─── */

export async function recordOpportunity(opts: {
  projectId:              string;
  kind:                   'keyword' | 'traffic' | 'content_gap' | 'quick_win' | 'technical' | 'competitor_move' | 'backlink' | 'cluster_expansion';
  title:                  string;
  description?:           string;
  evidence?:              any;
  estimatedValue?:        'high' | 'medium' | 'low';
  estimatedEffort?:       'high' | 'medium' | 'low';
  suggestedAction:        'new_campaign' | 'kanban_task' | 'investigate' | 'add_to_existing_campaign';
  suggestedCampaignKind?: string;
  suggestedKeyword?:      string;
  sourcePipelineRunId?:   string;
  sourceCampaignId?:      string;
  sourcePanelId?:         string;
  sourceStepId?:          string;
  sourceKind?:            'pipeline_step' | 'cron_sweep' | 'manual' | 'monitor_drift';
}): Promise<{ success: boolean; opportunity_id?: string; error?: string }> {
  try {
    const { data: inserted, error: insertErr } = await db().from("seo_opportunities").insert({
      project_id:              opts.projectId,
      source_kind:             opts.sourceKind || 'pipeline_step',
      source_pipeline_run_id:  opts.sourcePipelineRunId || null,
      source_campaign_id:      opts.sourceCampaignId || null,
      source_panel_id:         opts.sourcePanelId || null,
      source_step_id:          opts.sourceStepId || null,
      kind:                    opts.kind,
      title:                   opts.title.slice(0, 240),
      description:             opts.description?.slice(0, 2000) || null,
      evidence:                opts.evidence || null,
      estimated_value:         opts.estimatedValue || null,
      estimated_effort:        opts.estimatedEffort || null,
      suggested_action:        opts.suggestedAction,
      suggested_campaign_kind: opts.suggestedCampaignKind || null,
      suggested_keyword:       opts.suggestedKeyword || null,
    }).select("id").maybeSingle();
    if (insertErr || !inserted) return { success: false, error: insertErr?.message || 'opp insert failed' };
    return { success: true, opportunity_id: (inserted as any).id };
  } catch (e: any) {
    return { success: false, error: e?.message || 'record opp failed' };
  }
}

export async function listOpportunities(opts: {
  projectId: string;
  status?: 'open' | 'reviewed' | 'dismissed' | 'promoted' | 'expired' | 'all';
  /* Phase 22 — additional filters for the operator inbox */
  kind?:            'keyword' | 'traffic' | 'content_gap' | 'quick_win' | 'technical' | 'competitor_move' | 'backlink' | 'cluster_expansion' | 'all';
  estimatedValue?:  'high' | 'medium' | 'low' | 'all';
  sourceCampaignId?: string;
  discoveredSince?:  string;       // ISO datetime — only opportunities discovered at-or-after this
  limit?: number;
}): Promise<{ success: boolean; opportunities?: any[]; counts?: any; counts_by_kind?: any; counts_by_value?: any; counts_by_campaign?: any; error?: string }> {
  try {
    let q = db().from("seo_opportunities")
      .select("*")
      .eq("project_id", opts.projectId)
      .order("discovered_at", { ascending: false })
      .limit(Math.min(opts.limit || 50, 200));
    if (opts.status && opts.status !== 'all')                 q = q.eq("status", opts.status);
    if (opts.kind && opts.kind !== 'all')                     q = q.eq("kind", opts.kind);
    if (opts.estimatedValue && opts.estimatedValue !== 'all') q = q.eq("estimated_value", opts.estimatedValue);
    if (opts.sourceCampaignId)                                q = q.eq("source_campaign_id", opts.sourceCampaignId);
    if (opts.discoveredSince)                                 q = q.gte("discovered_at", opts.discoveredSince);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    /* Include cross-filter counts for the inbox sidebar badges */
    const { data: countsRaw } = await db().from("seo_opportunities")
      .select("status, kind, estimated_value, source_campaign_id")
      .eq("project_id", opts.projectId);

    const counts: any              = { open: 0, reviewed: 0, dismissed: 0, promoted: 0, expired: 0 };
    const counts_by_kind: any      = {};
    const counts_by_value: any     = { high: 0, medium: 0, low: 0 };
    const counts_by_campaign: any  = {};
    for (const r of (countsRaw || []) as any[]) {
      if (counts[r.status] !== undefined) counts[r.status]++;
      /* Phase 22 counts only count OPEN opportunities (inbox is what's pending) */
      if (r.status === 'open') {
        counts_by_kind[r.kind]               = (counts_by_kind[r.kind] || 0) + 1;
        if (counts_by_value[r.estimated_value] !== undefined) counts_by_value[r.estimated_value]++;
        if (r.source_campaign_id) {
          counts_by_campaign[r.source_campaign_id] = (counts_by_campaign[r.source_campaign_id] || 0) + 1;
        }
      }
    }

    return { success: true, opportunities: data || [], counts, counts_by_kind, counts_by_value, counts_by_campaign };
  } catch (e: any) {
    return { success: false, error: e?.message || 'list opps failed' };
  }
}

/* Phase 22 — Bulk-update many opportunities in a single call. */
export async function bulkUpdateOpportunities(opts: {
  opportunityIds:    string[];
  status?:           'open' | 'reviewed' | 'dismissed' | 'promoted';
  dismissedReason?:  string;
}): Promise<{ success: boolean; updated_count?: number; error?: string }> {
  try {
    if (!Array.isArray(opts.opportunityIds) || opts.opportunityIds.length === 0) {
      return { success: false, error: 'opportunityIds required (non-empty array)' };
    }
    if (opts.opportunityIds.length > 100) {
      return { success: false, error: 'bulk update limited to 100 opportunities per call' };
    }
    if (!opts.status) {
      return { success: false, error: 'status required' };
    }
    const update: any = { status: opts.status };
    if (opts.status === 'dismissed') {
      update.dismissed_at = new Date().toISOString();
      if (opts.dismissedReason) update.dismissed_reason = opts.dismissedReason.slice(0, 500);
    }
    if (opts.status === 'reviewed' || opts.status === 'promoted') {
      update.reviewed_at = new Date().toISOString();
    }
    const { error, count } = await db().from("seo_opportunities")
      .update(update)
      .in("id", opts.opportunityIds)
      .select("id", { count: 'exact', head: true });
    if (error) return { success: false, error: error.message };
    return { success: true, updated_count: count || opts.opportunityIds.length };
  } catch (e: any) {
    return { success: false, error: e?.message || 'bulk update failed' };
  }
}

export async function updateOpportunity(opts: {
  opportunityId: string;
  status?:           'open' | 'reviewed' | 'dismissed' | 'promoted';
  notes?:            string;
  dismissedReason?:  string;
  promotedToKind?:   'campaign' | 'kanban_task' | 'panel_finding';
  promotedToId?:     string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const update: any = {};
    if (opts.status)             update.status            = opts.status;
    if (opts.notes !== undefined) update.notes            = opts.notes.slice(0, 2000);
    if (opts.dismissedReason)    update.dismissed_reason  = opts.dismissedReason.slice(0, 500);
    if (opts.promotedToKind)     update.promoted_to_kind  = opts.promotedToKind;
    if (opts.promotedToId)       update.promoted_to_id    = opts.promotedToId;
    if (opts.status === 'reviewed' || opts.status === 'dismissed' || opts.status === 'promoted') {
      update.reviewed_at = new Date().toISOString();
    }

    await db().from("seo_opportunities").update(update).eq("id", opts.opportunityId);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'update opp failed' };
  }
}

export async function promoteOpportunityToCampaign(opts: {
  opportunityId: string;
}): Promise<{ success: boolean; campaign_id?: string; error?: string }> {
  try {
    const { data: opp } = await db().from("seo_opportunities").select("*").eq("id", opts.opportunityId).maybeSingle();
    if (!opp) return { success: false, error: 'opportunity not found' };
    const o = opp as any;

    if (o.status !== 'open' && o.status !== 'reviewed') {
      return { success: false, error: `opportunity is ${o.status}, cannot promote` };
    }

    const keyword = o.suggested_keyword || o.title.replace(/^Consider also targeting /i, '').replace(/['"]/g, '').slice(0, 240);
    const campaignKind = o.suggested_campaign_kind || 'rank_for_keyword';

    const createR = await createOrFindCampaign({
      projectId: o.project_id,
      keyword,
      campaignKind: campaignKind as any,
      goal: `Promoted from opportunity: ${o.title}`,
    });
    if (!createR.success || !createR.campaign_id) {
      return { success: false, error: createR.error || 'create campaign failed' };
    }

    await updateOpportunity({
      opportunityId: opts.opportunityId,
      status:        'promoted',
      promotedToKind: 'campaign',
      promotedToId:  createR.campaign_id,
    });

    return { success: true, campaign_id: createR.campaign_id };
  } catch (e: any) {
    return { success: false, error: e?.message || 'promote failed' };
  }
}

/* ─── Cron job: expire stale opportunities (called from existing sweep) */

export async function expireStaleOpportunities(): Promise<{ success: boolean; expired_count?: number; error?: string }> {
  try {
    const { data, error } = await db().from("seo_opportunities")
      .update({ status: 'expired', dismissed_reason: 'expired without review (30 days)' })
      .eq("status", 'open')
      .lt("expires_at", new Date().toISOString())
      .select("id");
    if (error) return { success: false, error: error.message };
    return { success: true, expired_count: (data || []).length };
  } catch (e: any) {
    return { success: false, error: e?.message || 'expire failed' };
  }
}

/* ════════════════════════════════════════════════════════════════
   Phase 14.1 — Unification adapters

   These helpers let OTHER surfaces (Autopilot alerts, Analytics Intel,
   Reports panel) write into the campaign + opportunity stores without
   re-implementing the same boilerplate.

   Three adapters:
     1. recordOpportunityFromAlert — convert a project_alert into an opportunity
     2. recordOpportunityFromAnalyticsFinding — convert a rising/falling star into one
     3. linkReportFromOtherSource — copy a report_generation into a campaign panel

   Plus one search helper:
     4. searchReportsAcrossCampaigns — project-level full-text + tag filter
═══════════════════════════════════════════════════════════════ */

/* Look up an active campaign by keyword (case-insensitive) so we can auto-link.
   Returns the campaign_id + content panel_id if a match exists. */
async function findActiveCampaignByKeyword(opts: {
  projectId: string;
  keyword: string;
}): Promise<{ campaign_id?: string; content_panel_id?: string }> {
  if (!opts.keyword) return {};
  const norm = opts.keyword.trim().toLowerCase().slice(0, 240);
  const { data } = await db().from("seo_campaigns")
    .select("id").eq("project_id", opts.projectId).eq("keyword", norm)
    .eq("status", 'active').maybeSingle();
  if (!data) return {};
  const campaignId = (data as any).id;
  const { data: panel } = await db().from("seo_campaign_panels")
    .select("id").eq("campaign_id", campaignId).eq("pillar", 'content').maybeSingle();
  return { campaign_id: campaignId, content_panel_id: (panel as any)?.id };
}

/* ─── Adapter 1: alert → opportunity ─────────────────────── */

export async function recordOpportunityFromAlert(opts: {
  projectId:   string;
  alertId:     string;
  alertType:   'rank_drop' | 'click_drop' | 'audit_score_drop' | string;
  severity:    'info' | 'warn' | 'critical' | string;
  title:       string;
  detail:      any;        // alert.detail JSON (may include keyword, page, deltas)
}): Promise<{ success: boolean; opportunity_id?: string; campaign_id?: string; error?: string }> {
  try {
    /* Try to infer a keyword from the alert detail */
    const keyword = (opts.detail?.keyword as string)
                    || (opts.detail?.query as string)
                    || '';

    /* If there's an active campaign for this keyword, link the opportunity */
    const { campaign_id, content_panel_id } = keyword
      ? await findActiveCampaignByKeyword({ projectId: opts.projectId, keyword })
      : {};

    /* Map alert type → opportunity kind */
    const oppKind = opts.alertType === 'rank_drop'         ? 'quick_win'
                  : opts.alertType === 'click_drop'        ? 'traffic'
                  : opts.alertType === 'audit_score_drop'  ? 'technical'
                  :                                          'investigate' as any;
    const oppKindFinal = oppKind === 'investigate' ? 'technical' : oppKind;

    /* Severity → value/effort heuristic */
    const value: 'high' | 'medium' | 'low' =
      opts.severity === 'critical' ? 'high' :
      opts.severity === 'warn'     ? 'medium' : 'low';

    const r = await recordOpportunity({
      projectId:        opts.projectId,
      sourceKind:       'monitor_drift',
      sourceCampaignId: campaign_id,
      sourcePanelId:    content_panel_id,
      sourceStepId:     opts.alertId,       // store alert id here for traceback
      kind:             oppKindFinal as any,
      title:            opts.title,
      description:      buildAlertOpportunityDescription(opts),
      evidence:         { alert_id: opts.alertId, alert_type: opts.alertType, ...opts.detail },
      estimatedValue:   value,
      estimatedEffort:  opts.alertType === 'audit_score_drop' ? 'medium' : 'low',
      suggestedAction:  campaign_id ? 'add_to_existing_campaign' : (keyword ? 'new_campaign' : 'investigate'),
      suggestedKeyword: keyword || undefined,
    });

    return { success: r.success, opportunity_id: r.opportunity_id, campaign_id, error: r.error };
  } catch (e: any) {
    return { success: false, error: e?.message || 'alert → opportunity failed' };
  }
}

function buildAlertOpportunityDescription(opts: {
  alertType: string; detail: any;
}): string {
  const d = opts.detail || {};
  if (opts.alertType === 'rank_drop') {
    const drop = d.position_drop || d.delta || 'significant';
    return `Average position dropped by ${drop} positions over the comparison window. Investigate the page, check recent algo changes, and consider refreshing the content or strengthening internal links.`;
  }
  if (opts.alertType === 'click_drop') {
    const drop = d.click_drop_pct || d.delta_pct || '';
    return `Clicks dropped ${drop ? `${drop}% ` : ''}period-over-period. May indicate SERP feature changes, seasonality, or a competitor move. Review GSC for the affected queries.`;
  }
  if (opts.alertType === 'audit_score_drop') {
    return `Page audit score declined. Run the technical audit pillar (when it activates) or manually review on-page, indexability, and CWV signals.`;
  }
  return `Autopilot detected an anomaly. Review the alert details for context.`;
}

/* ─── Adapter 2: analytics finding → opportunity ─────────── */

export async function recordOpportunityFromAnalyticsFinding(opts: {
  projectId:    string;
  findingKind:  'rising_star' | 'falling_star' | 'query_velocity_gain' | 'query_velocity_loss';
  query:        string;
  position?:    number;
  impressions?: number;
  clicks?:      number;
  lift_pct?:    number;
  reason?:      string;
  /* the raw analytics row, for the evidence field */
  raw?:         any;
}): Promise<{ success: boolean; opportunity_id?: string; campaign_id?: string; error?: string }> {
  try {
    const { campaign_id, content_panel_id } = await findActiveCampaignByKeyword({
      projectId: opts.projectId,
      keyword:   opts.query,
    });

    const isPositive = opts.findingKind === 'rising_star' || opts.findingKind === 'query_velocity_gain';

    const oppKind = isPositive ? 'quick_win' : 'traffic';

    let title: string;
    let description: string;
    if (opts.findingKind === 'rising_star') {
      title = `Rising query: "${opts.query}" — push it onto page 1`;
      description = `Query gaining traction: position ${opts.position?.toFixed(1) || '?'}, ${opts.impressions || 0} impressions, +${opts.lift_pct || 0}% lift. ${opts.reason || ''}`.trim();
    } else if (opts.findingKind === 'falling_star') {
      title = `Falling query: "${opts.query}" — investigate decline`;
      description = `Query losing clicks. Position ${opts.position?.toFixed(1) || '?'}, ${opts.clicks || 0} clicks, ${opts.lift_pct ? `${opts.lift_pct}%` : 'declining'}. ${opts.reason || ''}`.trim();
    } else if (opts.findingKind === 'query_velocity_gain') {
      title = `New query emerged: "${opts.query}"`;
      description = `This query started appearing in GSC during the comparison window. Worth tracking — could become a future ranking target.`;
    } else {
      title = `Query lost: "${opts.query}"`;
      description = `This query disappeared from GSC. Either Google stopped showing your site for it, or impressions fell below GSC's reporting threshold.`;
    }

    const r = await recordOpportunity({
      projectId:        opts.projectId,
      sourceKind:       'manual',
      sourceCampaignId: campaign_id,
      sourcePanelId:    content_panel_id,
      kind:             oppKind,
      title,
      description,
      evidence:         { finding_kind: opts.findingKind, query: opts.query, position: opts.position, impressions: opts.impressions, clicks: opts.clicks, lift_pct: opts.lift_pct, raw: opts.raw },
      estimatedValue:   isPositive ? 'high' : 'medium',
      estimatedEffort:  'low',
      suggestedAction:  campaign_id ? 'add_to_existing_campaign' : 'new_campaign',
      suggestedKeyword: opts.query,
    });

    return { success: r.success, opportunity_id: r.opportunity_id, campaign_id, error: r.error };
  } catch (e: any) {
    return { success: false, error: e?.message || 'analytics → opportunity failed' };
  }
}

/* ─── Adapter 3: existing report → campaign panel report ─── */

export async function linkReportFromOtherSource(opts: {
  projectId:        string;
  campaignId:       string;
  sourceTable:      string;      // 'report_generations' | 'audit_reports' | etc
  sourceId:         string;
  sourceTitle:      string;
  sourceBodyMd?:    string;
  sourceSummary?:   string;
  pillar?:          string;      // defaults to 'content'
  reportKind?:      ReportKind;  // defaults to 'manual_refresh'
  llmCallsUsed?:    number;
  webSearchesUsed?: number;
  dataSources?:     string[];
  tags?:            string[];
}): Promise<{ success: boolean; report_id?: string; error?: string }> {
  try {
    /* Prefix the title so users know it's a linked artifact from another source */
    const prefixedTitle = `[Linked from ${opts.sourceTable}] ${opts.sourceTitle}`;

    /* Build a body if none provided — store the linkage at minimum */
    const bodyMd = opts.sourceBodyMd
      || `_(Linked report from \`${opts.sourceTable}\`, id=\`${opts.sourceId}\`.\nThe original artifact remains in its source table. This entry exists so the report is findable from the campaign drawer.)_`;

    return writeReportToPanel({
      campaignId:       opts.campaignId,
      projectId:        opts.projectId,
      pillar:           opts.pillar || 'content',
      reportKind:       opts.reportKind || 'manual_refresh',
      generatedBy:      'manual',
      llmCallsUsed:     opts.llmCallsUsed,
      webSearchesUsed:  opts.webSearchesUsed,
      dataSources:      opts.dataSources || ['external'],
      title:            prefixedTitle.slice(0, 240),
      bodyMd,
      summary:          opts.sourceSummary || `Linked from ${opts.sourceTable}.`,
      tags:             [...(opts.tags || []), `source:${opts.sourceTable}`, `source_id:${opts.sourceId}`],
      searchableText:   `${prefixedTitle}\n${opts.sourceSummary || ''}\n${(opts.sourceBodyMd || '').slice(0, 3000)}`,
    });
  } catch (e: any) {
    return { success: false, error: e?.message || 'link report failed' };
  }
}

/* ─── Search helper: cross-campaign report search ────────── */

export async function searchReportsAcrossCampaigns(opts: {
  projectId:   string;
  query?:      string;       // free-text — searches title, summary, searchable_text
  pillar?:     string;
  reportKind?: ReportKind | string;
  tag?:        string;       // exact tag match
  limit?:      number;
}): Promise<{ success: boolean; reports?: any[]; error?: string }> {
  try {
    let q = db().from("seo_campaign_reports")
      .select("id, campaign_id, panel_id, pillar, report_kind, title, summary, confidence_rating, tags, generated_by, llm_calls_used, web_searches_used, data_sources, created_at")
      .eq("project_id", opts.projectId)
      .order("created_at", { ascending: false })
      .limit(Math.min(opts.limit || 50, 200));

    if (opts.pillar)     q = q.eq("pillar", opts.pillar);
    if (opts.reportKind) q = q.eq("report_kind", opts.reportKind);
    if (opts.tag)        q = q.contains("tags", [opts.tag]);
    if (opts.query) {
      /* ILIKE on title + summary (no Postgres full-text yet — keep simple) */
      const term = opts.query.trim().replace(/[%_]/g, '');
      q = q.or(`title.ilike.%${term}%,summary.ilike.%${term}%,searchable_text.ilike.%${term}%`);
    }

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, reports: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || 'search failed' };
  }
}

/* ─── livingOverviewCronTick ─────────────────────────────────────
   Phase 20+ — Daily cron entry point for Living Overview refresh.

   Iterates every active campaign and refreshes its synthesized
   executive summary IF there's been a new pillar report since the
   last assessment. Campaigns with no new data are skipped (no LLM
   call, no cost).

   Called from task-engine.ts run_scheduled_verifications chain.
   Hard cap of 50 campaigns per tick for predictable cost.

   Cost model:
     • Each refresh = ~1 LLM call = ~$0.05
     • Skipped campaigns = $0
     • Worst-case 50 active campaigns with all-new data: ~$2.50/day
     • Typical case (5-15 campaigns, half with new data): <$0.50/day
══════════════════════════════════════════════════════════════════ */

export async function livingOverviewCronTick(): Promise<{
  swept:          number;
  refreshed:      number;
  skipped_fresh:  number;
  failed:         number;
  errors:         string[];
}> {
  try {
    const { data: campaigns } = await db().from("seo_campaigns")
      .select("id, keyword, last_assessed_at")
      .eq("status", "active")
      .limit(50);

    if (!campaigns || (campaigns as any[]).length === 0) {
      return { swept: 0, refreshed: 0, skipped_fresh: 0, failed: 0, errors: [] };
    }

    let refreshed = 0;
    let skipped_fresh = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const c of (campaigns as any[])) {
      try {
        /* Skip if no new pillar reports since the last overview generation */
        if (c.last_assessed_at) {
          const { data: newerReports } = await db().from("seo_campaign_reports")
            .select("id")
            .eq("campaign_id", c.id)
            .gt("created_at", c.last_assessed_at)
            .limit(1);
          if (!newerReports || (newerReports as any[]).length === 0) {
            skipped_fresh++;
            continue;
          }
        }

        const r = await generateLivingOverview({ campaignId: c.id });
        if (r.success) {
          refreshed++;
        } else {
          failed++;
          if (r.error) errors.push(`${c.keyword}: ${r.error}`);
        }
      } catch (e: any) {
        failed++;
        errors.push(`${c.keyword}: ${e?.message || 'unknown'}`);
      }
    }

    return {
      swept:         (campaigns as any[]).length,
      refreshed,
      skipped_fresh,
      failed,
      errors:        errors.slice(0, 5),
    };
  } catch (e: any) {
    return {
      swept: 0, refreshed: 0, skipped_fresh: 0, failed: 0,
      errors: [e?.message || 'cron tick failed'],
    };
  }
}
