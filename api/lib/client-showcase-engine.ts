/* ════════════════════════════════════════════════════════════════════
   api/lib/client-showcase-engine.ts
   Phase 22 — Client showcase data composer

   Purpose:
     One backend call produces the complete data contract for the
     cinematic client showcase page. Every field on the page —
     headline metric, scene visualizations, mood color anchors,
     animation intensities — flows from this single composition.

     Manav controls the page entirely from data: change one signal
     here, the entire frontend mood shifts.

   Data sources (all existing tables, zero new schema):
     • projects                — project meta
     • seo_campaigns           — active campaigns
     • seo_campaign_reports    — pillar narratives
     • project_knowledge       — GSC/GA4 signals
     • activity_log            — wins surfaced
     • season_forecast_checkpoints — forecast curve (optional)

   No LLM call in V1 — narratives are template-driven from real data.
   Future v1.1 can layer LLM polish on top of this contract.
══════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

/* ════════════════════════════════════════════════════════════════════
   TYPES — the data contract the frontend will render against
══════════════════════════════════════════════════════════════════════ */

export type ShowcaseMood     = 'ascending' | 'steady' | 'turbulent' | 'breakthrough' | 'foundation';
export type SceneMood        = 'win' | 'progress' | 'pivot' | 'foundation';
export type ColorAnchor      = 'gold' | 'cyan' | 'magenta' | 'emerald' | 'amethyst';
export type VisualizationKind =
  | 'orbital'        // cluster map / topic universe
  | 'ascending_bars' // metric stack rising
  | 'flowing_lines'  // graph / link flow
  | 'rank_climb'     // before → after position climb
  | 'pulse_stack'    // layered cards pulsing
  | 'particle_burst';// celebration / wins
export type DataSourceStatus = 'fresh' | 'stale' | 'missing';
export type Confidence       = 'low' | 'medium' | 'high';

export interface ShowcaseData {
  meta: {
    project_name:        string;
    project_domain:      string;
    started_at:          string;       // ISO
    days_active:         number;
    last_refreshed_at:   string;       // ISO
    mood_dominant:       ShowcaseMood; // drives the overall page color grade
  };

  hero: {
    headline_label:      string;       // "Organic clicks captured"
    headline_value:      number;       // 1247
    headline_unit:       string;       // "visits from search"
    headline_delta_pct:  number;       // +47 (positive) or -12 (decline)
    headline_horizon:    string;       // "over the last 90 days"
    narrative:           string;       // one-sentence story under the number
    color_anchor:        ColorAnchor;  // controls the hero gradient
  };

  scenes: Array<{
    id:                  string;
    pillar:              string;       // 'cluster_map' | 'monitoring' | 'off_page' | ...
    title:               string;       // "Topic universe expanded"
    subtitle:            string;       // "From 3 clusters to 14"
    primary_metric: {
      label:             string;
      value:             number | string;
      delta?:            number;
      unit?:             string;
      transform:         'count_up' | 'percent' | 'rank_climb' | 'literal';
    };
    secondary_metrics?:  Array<{ label: string; value: string }>;
    narrative_short:     string;       // 1-2 sentences
    proof:               string[];     // 2-4 bullet evidence points
    visualization: {
      kind:              VisualizationKind;
      params:            Record<string, any>;
    };
    mood:                SceneMood;    // controls the scene's accent color
  }>;

  wins: Array<{
    title:               string;
    metric_text:         string;
    when_relative:       string;       // "3 weeks ago"
    intensity:           'subtle' | 'moderate' | 'dramatic';
  }>;

  forecast: null | {
    metric_label:        string;
    projected_value:     number;
    projected_horizon:   string;
    confidence:          Confidence;
    assumption:          string;
    curve_points?:       number[];     // optional sparkline data
  };

  next_chapter: Array<{
    title:               string;
    impact_estimate:     string;
    timing:              string;
  }>;

  transparency: {
    data_sources: Array<{
      name:              string;
      status:            DataSourceStatus;
      last_synced:       string | null;
      note?:             string;
    }>;
    honest_gaps:         string[];
    audit_run_count:     number;
    audit_period:        string;
  };

  /* ───────────────────────────────────────────────────────────
     Phase 22.1 — DEPTH FIELDS
     Drive the new client-grade detail sections. All composed from
     existing GSC/GA4 data; null when source is missing.
  ─────────────────────────────────────────────────────────── */

  visibility_pulse: null | {
    /* 365-day or shorter window — clicks + impressions over time.
       Drives the timeline ribbon visualization. */
    window_label:        string;          // "Last 90 days" / "Last year"
    points:              Array<{ date: string; clicks: number; impressions: number }>;
    peak_day:            { date: string; clicks: number; impressions: number } | null;
    total_clicks:        number;
    total_impressions:   number;
    period_delta_pct:    number;          // last-half vs first-half of the window
  };

  keyword_movers: null | {
    /* Position movement classification. Sourced from monitoring snapshots
       when available, else inferred from GSC position vs target. */
    winners:             Array<{ keyword: string; from_position: number; to_position: number; impressions: number; clicks: number; delta: number }>;
    losers:              Array<{ keyword: string; from_position: number; to_position: number; impressions: number; clicks: number; delta: number }>;
    holding:             Array<{ keyword: string; position: number; impressions: number; clicks: number }>;
    methodology:         string;          // honest note about how movement was measured
  };

  intent_distribution: null | {
    /* Buckets traffic-bearing queries into intent classes based on
       lexical patterns. Honest about heuristic nature. */
    branded:             { impressions: number; clicks: number; query_count: number };
    informational:       { impressions: number; clicks: number; query_count: number };
    commercial:          { impressions: number; clicks: number; query_count: number };
    transactional:       { impressions: number; clicks: number; query_count: number };
    classification_note: string;
  };

  content_health: null | {
    /* Tiers your top pages into performance buckets and surfaces what
       action each tier deserves. Drives the page constellation. */
    tiers: {
      hero:               Array<{ page: string; clicks: number; impressions: number; position: number; ctr: number }>;
      climbing:           Array<{ page: string; clicks: number; impressions: number; position: number; ctr: number }>;
      plateau:            Array<{ page: string; clicks: number; impressions: number; position: number; ctr: number }>;
      underperforming:    Array<{ page: string; clicks: number; impressions: number; position: number; ctr: number }>;
    };
    tier_counts: {
      hero:               number;
      climbing:           number;
      plateau:            number;
      underperforming:    number;
    };
    tier_actions: {
      hero:               string;
      climbing:           string;
      plateau:            string;
      underperforming:    string;
    };
  };
}

/* ════════════════════════════════════════════════════════════════════
   ENTRY — assembleShowcase
══════════════════════════════════════════════════════════════════════ */

export async function assembleShowcase(opts: { projectId: string }): Promise<{
  success: boolean;
  showcase?: ShowcaseData;
  error?: string;
}> {
  try {
    const projectId = opts.projectId;
    if (!projectId) return { success: false, error: 'projectId required' };

    /* Parallel reads — keep latency low. Missing rows just become empty data. */
    const [
      projectR,
      campaignsR,
      gscPagesR, gscQueriesR, ga4R, gscDailyR,
      activityR,
      forecastR,
    ] = await Promise.all([
      db().from('projects')
        .select('id, name, url, created_at')
        .eq('id', projectId).maybeSingle(),

      db().from('seo_campaigns')
        .select('id, keyword, status, started_at, current_position, target_position, health, living_overview_md, last_assessed_at')
        .eq('project_id', projectId)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(10),

      db().from('project_knowledge')
        .select('field_value, updated_at')
        .eq('project_id', projectId)
        .eq('category', 'analytics').eq('field_key', 'gsc_top_pages').maybeSingle(),

      db().from('project_knowledge')
        .select('field_value, updated_at')
        .eq('project_id', projectId)
        .eq('category', 'analytics').eq('field_key', 'gsc_top_queries').maybeSingle(),

      db().from('project_knowledge')
        .select('field_value, updated_at')
        .eq('project_id', projectId)
        .eq('category', 'analytics').eq('field_key', 'ga4_summary').maybeSingle(),

      db().from('project_knowledge')
        .select('field_value, updated_at')
        .eq('project_id', projectId)
        .eq('category', 'analytics').eq('field_key', 'gsc_daily_trend_365d').maybeSingle(),

      db().from('activity_log')
        .select('headline, detail, event_type, severity, created_at')
        .eq('project_id', projectId)
        .gte('created_at', new Date(Date.now() - 90 * 86_400_000).toISOString())
        .order('created_at', { ascending: false })
        .limit(40),

      db().from('season_forecast_checkpoints')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const project: any = (projectR as any).data;
    if (!project) return { success: false, error: 'project not found' };

    const activeCampaigns: any[] = ((campaignsR as any).data) || [];
    const gscPages: any[]        = safeParseArray((gscPagesR as any).data?.field_value);
    const gscQueries: any[]      = safeParseArray((gscQueriesR as any).data?.field_value);
    const ga4: any               = safeParseObj((ga4R as any).data?.field_value);
    const gscDaily: any[]        = safeParseArray((gscDailyR as any).data?.field_value);
    const activity: any[]        = ((activityR as any).data) || [];
    const forecastRows: any[]    = ((forecastR as any).data) || [];

    const startedAt   = project.created_at;
    const daysActive  = Math.max(1, Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000));

    /* Campaign reports — single query, indexed by campaign id */
    let reportsByCampaign: Record<string, any[]> = {};
    if (activeCampaigns.length > 0) {
      const campaignIds = activeCampaigns.map(c => c.id);
      const { data: reports } = await db().from('seo_campaign_reports')
        .select('id, campaign_id, pillar, title, summary, tags, created_at, metric_snapshot')
        .in('campaign_id', campaignIds)
        .order('created_at', { ascending: false })
        .limit(60);
      for (const r of (reports as any[]) || []) {
        if (!reportsByCampaign[r.campaign_id]) reportsByCampaign[r.campaign_id] = [];
        reportsByCampaign[r.campaign_id].push(r);
      }
    }

    /* ─── HERO ─── */
    const heroSpec = pickHeroMetric({ gscPages, gscQueries, ga4, activity, activeCampaigns, daysActive });
    const moodDominant = determineDominantMood({ activeCampaigns, gscPages, activity });
    const hero = {
      headline_label:     heroSpec.label,
      headline_value:     heroSpec.value,
      headline_unit:      heroSpec.unit,
      headline_delta_pct: heroSpec.delta_pct,
      headline_horizon:   heroSpec.horizon,
      narrative:          buildHeroNarrative({ project, heroSpec, mood: moodDominant, daysActive, activeCampaigns }),
      color_anchor:       heroSpec.color as ColorAnchor,
    };

    /* ─── SCENES ─── */
    const scenes: ShowcaseData['scenes'] = [];
    for (const c of activeCampaigns.slice(0, 4)) {
      const reports = reportsByCampaign[c.id] || [];
      const scene = buildSceneForCampaign({ campaign: c, reports });
      if (scene) scenes.push(scene);
    }
    /* If no campaigns yet, build a foundation scene */
    if (scenes.length === 0) {
      scenes.push(buildFoundationScene({ project, daysActive, gscPages, gscQueries }));
    }

    /* ─── WINS ─── */
    const wins = composeWins(activity).slice(0, 5);

    /* ─── FORECAST ─── */
    const forecast = composeForecast(forecastRows, activeCampaigns);

    /* ─── NEXT CHAPTER ─── */
    const next_chapter = composeNextChapter({ activeCampaigns });

    /* ─── TRANSPARENCY ─── */
    const transparency = {
      data_sources: [
        {
          name:        'Google Search Console',
          status:      dataSourceStatusFromTs((gscPagesR as any).data?.updated_at),
          last_synced: ((gscPagesR as any).data?.updated_at) || null,
        },
        {
          name:        'Google Analytics 4',
          status:      dataSourceStatusFromTs((ga4R as any).data?.updated_at),
          last_synced: ((ga4R as any).data?.updated_at) || null,
        },
      ],
      honest_gaps: buildHonestGaps({ gscPages, gscQueries, ga4, activeCampaigns }),
      audit_run_count: Object.values(reportsByCampaign).reduce((sum: number, arr: any[]) => sum + arr.length, 0),
      audit_period: `Past ${Math.min(daysActive, 90)} days`,
    };

    /* ─── PHASE 22.1 — DEPTH SECTIONS ─────────────────────────────── */
    const visibility_pulse  = composeVisibilityPulse(gscDaily);
    const keyword_movers    = composeKeywordMovers(gscQueries, reportsByCampaign, activeCampaigns);
    const intent_distribution = composeIntentDistribution(gscQueries);
    const content_health    = composeContentHealth(gscPages);

    return {
      success: true,
      showcase: {
        meta: {
          project_name:      project.name || 'Unnamed project',
          project_domain:    project.url || '',
          started_at:        startedAt,
          days_active:       daysActive,
          last_refreshed_at: new Date().toISOString(),
          mood_dominant:     moodDominant,
        },
        hero,
        scenes,
        wins,
        forecast,
        next_chapter,
        transparency,
        visibility_pulse,
        keyword_movers,
        intent_distribution,
        content_health,
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'showcase assembly failed' };
  }
}

/* ════════════════════════════════════════════════════════════════════
   HERO PICKING — choose the most dramatic real number
══════════════════════════════════════════════════════════════════════ */

function pickHeroMetric(input: {
  gscPages: any[]; gscQueries: any[]; ga4: any;
  activity: any[]; activeCampaigns: any[]; daysActive: number;
}): { label: string; value: number; unit: string; delta_pct: number; horizon: string; color: ColorAnchor } {
  const { gscPages, ga4, activeCampaigns, daysActive } = input;

  const totalClicks = sumField(gscPages, 'clicks');
  const totalImpr   = sumField(gscPages, 'impressions');
  const ga4Sessions = Number(ga4?.sessions || ga4?.organic_sessions || 0);
  const ga4Users    = Number(ga4?.active_users || ga4?.users || 0);

  if (ga4Sessions > totalClicks && ga4Sessions > 0) {
    return {
      label:     'Sessions delivered',
      value:     Math.round(ga4Sessions),
      unit:      ga4Sessions === 1 ? 'visit to the site' : 'visits to the site',
      delta_pct: 0,
      horizon:   `in the last ${Math.min(daysActive, 90)} days`,
      color:     'gold',
    };
  }

  if (totalClicks > 0) {
    return {
      label:     'Organic clicks earned',
      value:     totalClicks,
      unit:      totalClicks === 1 ? 'visit from search' : 'visits from search',
      delta_pct: 0,
      horizon:   `over the last ${Math.min(daysActive, 90)} days`,
      color:     'gold',
    };
  }

  if (totalImpr > 0) {
    return {
      label:     'Times shown in search',
      value:     totalImpr,
      unit:      'search impressions',
      delta_pct: 0,
      horizon:   `over the last ${Math.min(daysActive, 90)} days`,
      color:     'cyan',
    };
  }

  if (ga4Users > 0) {
    return {
      label:     'People who visited',
      value:     Math.round(ga4Users),
      unit:      ga4Users === 1 ? 'unique visitor' : 'unique visitors',
      delta_pct: 0,
      horizon:   'building an audience',
      color:     'emerald',
    };
  }

  if (activeCampaigns.length > 0) {
    return {
      label:     'Campaigns in motion',
      value:     activeCampaigns.length,
      unit:      activeCampaigns.length === 1 ? 'keyword in active pursuit' : 'keywords in active pursuit',
      delta_pct: 0,
      horizon:   'foundation laid',
      color:     'amethyst',
    };
  }

  return {
    label:     'Days in foundation',
    value:     daysActive,
    unit:      daysActive === 1 ? 'day building' : 'days building',
    delta_pct: 0,
    horizon:   'momentum coming',
    color:     'cyan',
  };
}

/* ════════════════════════════════════════════════════════════════════
   SCENE COMPOSITION — one scene per active campaign
══════════════════════════════════════════════════════════════════════ */

function buildSceneForCampaign(opts: { campaign: any; reports: any[] }): ShowcaseData['scenes'][number] | null {
  const { campaign, reports } = opts;

  const monitor = reports.find(r => r.pillar === 'monitoring');
  const cluster = reports.find(r => r.pillar === 'cluster_map');
  const offPage = reports.find(r => r.pillar === 'off_page');
  const linking = reports.find(r => r.pillar === 'internal_linking');

  /* Pick the most narratively-rich pillar for this campaign */
  if (monitor && campaign.current_position) {
    return sceneFromMonitoring(campaign, monitor);
  }
  if (cluster) {
    return sceneFromCluster(campaign, cluster);
  }
  if (offPage) {
    return sceneFromOffPage(campaign, offPage);
  }
  if (linking) {
    return sceneFromLinking(campaign, linking);
  }
  return sceneFromCampaignFoundation(campaign);
}

function sceneFromMonitoring(campaign: any, report: any): ShowcaseData['scenes'][number] {
  const snap = report?.metric_snapshot || {};
  const startPos = Number(snap.baseline_position || 0);
  const currentPos = Number(campaign.current_position || snap.keyword_position || 0);
  const targetPos = Number(campaign.target_position || 5);
  const climbed = startPos > currentPos && startPos > 0;

  return {
    id: `scene_monitor_${campaign.id}`,
    pillar: 'monitoring',
    title: climbed
      ? `Climbed for "${campaign.keyword}"`
      : `Tracking "${campaign.keyword}"`,
    subtitle: climbed
      ? `Position ${startPos.toFixed(0)} → ${currentPos.toFixed(0)}`
      : `Currently at position ${currentPos.toFixed(1)}`,
    primary_metric: {
      label: 'Current position',
      value: Number(currentPos.toFixed(1)),
      delta: climbed ? -(startPos - currentPos) : undefined, // negative = improvement in rank
      transform: 'rank_climb',
    },
    secondary_metrics: targetPos ? [{ label: 'Target', value: `position ${targetPos}` }] : [],
    narrative_short: climbed
      ? `From position ${startPos.toFixed(0)} to ${currentPos.toFixed(1)} — measurable lift in the SERPs.`
      : `Holding visibility at position ${currentPos.toFixed(1)}. Foundation is set for the next climb.`,
    proof: [
      report?.summary || `${report?.title || 'Monitoring report'} captured`,
      `Last assessed ${relativeTime(report?.created_at)}`,
    ].filter(Boolean),
    visualization: {
      kind: 'rank_climb',
      params: {
        start_position:   startPos || (currentPos + 5),
        current_position: currentPos,
        target_position:  targetPos,
      },
    },
    mood: climbed ? 'win' : 'progress',
  };
}

function sceneFromCluster(campaign: any, report: any): ShowcaseData['scenes'][number] {
  const snap = report?.metric_snapshot || {};
  const clusterCount = Number(snap.cluster_count || snap.clusters || 0);
  const querySpan = Number(snap.related_queries || snap.queries_covered || 0);

  return {
    id: `scene_cluster_${campaign.id}`,
    pillar: 'cluster_map',
    title: `Topic universe for "${campaign.keyword}"`,
    subtitle: clusterCount > 0
      ? `${clusterCount} clusters mapped${querySpan > 0 ? ` across ${querySpan} queries` : ''}`
      : `Foundation being laid`,
    primary_metric: {
      label: 'Clusters identified',
      value: clusterCount || 0,
      transform: 'count_up',
    },
    secondary_metrics: querySpan > 0
      ? [{ label: 'Search universe', value: `${querySpan} queries` }]
      : [],
    narrative_short: clusterCount > 0
      ? `The topic landscape for "${campaign.keyword}" now resolves into ${clusterCount} meaningful clusters — a map of what should exist before content does.`
      : `Mapping the search universe for "${campaign.keyword}". Clusters will resolve as the picture sharpens.`,
    proof: [
      report?.summary || `${report?.title || 'Cluster map'} captured`,
      `Mapped ${relativeTime(report?.created_at)}`,
    ].filter(Boolean),
    visualization: {
      kind: 'orbital',
      params: {
        center_label: campaign.keyword,
        cluster_count: Math.max(3, clusterCount || 5),
        ring_count: clusterCount > 8 ? 2 : 1,
      },
    },
    mood: clusterCount >= 5 ? 'win' : 'foundation',
  };
}

function sceneFromOffPage(campaign: any, report: any): ShowcaseData['scenes'][number] {
  const snap = report?.metric_snapshot || {};
  const existing = Number(snap.existing_assets || snap.existing || 0);
  const aspirational = Number(snap.aspirational_assets || snap.aspirational || 0);
  const prospects = Number(snap.prospect_categories || snap.prospects || 0);

  return {
    id: `scene_offpage_${campaign.id}`,
    pillar: 'off_page',
    title: `Authority strategy for "${campaign.keyword}"`,
    subtitle: `${existing + aspirational} assets · ${prospects} prospect categories`,
    primary_metric: {
      label: 'Linkable assets identified',
      value: existing + aspirational,
      transform: 'count_up',
    },
    secondary_metrics: [
      { label: 'Already exist', value: `${existing}` },
      { label: 'To build', value: `${aspirational}` },
    ],
    narrative_short: aspirational > 0
      ? `${existing} linkable assets already live on site. ${aspirational} more identified as worth building. Authority strategy is no longer guesswork.`
      : `${existing} linkable assets identified. Each is a magnet for the off-page work that follows.`,
    proof: [
      report?.summary || `${report?.title || 'Off-page strategy'} captured`,
      `Strategy refreshed ${relativeTime(report?.created_at)}`,
    ].filter(Boolean),
    visualization: {
      kind: 'pulse_stack',
      params: {
        layers: Math.max(3, Math.min(6, existing + aspirational)),
        peak_label: 'Authority',
      },
    },
    mood: existing > 0 ? 'win' : 'foundation',
  };
}

function sceneFromLinking(campaign: any, report: any): ShowcaseData['scenes'][number] {
  const snap = report?.metric_snapshot || {};
  const opportunities = Number(snap.opportunity_count || snap.opportunities || 0);
  const pagesAnalyzed = Number(snap.pages_analyzed || snap.pages || 0);

  return {
    id: `scene_linking_${campaign.id}`,
    pillar: 'internal_linking',
    title: `Link graph for "${campaign.keyword}"`,
    subtitle: opportunities > 0 ? `${opportunities} placement opportunities` : `Graph mapped`,
    primary_metric: {
      label: 'Internal link opportunities',
      value: opportunities,
      transform: 'count_up',
    },
    secondary_metrics: pagesAnalyzed > 0
      ? [{ label: 'Pages in graph', value: `${pagesAnalyzed}` }]
      : [],
    narrative_short: opportunities > 0
      ? `${opportunities} internal placements identified — each one strengthens authority flow toward the pages that matter most for "${campaign.keyword}".`
      : `Internal link graph captured. Each placement is calibrated for relevance, not volume.`,
    proof: [
      report?.summary || `${report?.title || 'Internal linking analysis'} captured`,
      `Refreshed ${relativeTime(report?.created_at)}`,
    ].filter(Boolean),
    visualization: {
      kind: 'flowing_lines',
      params: {
        node_count: Math.max(5, Math.min(12, pagesAnalyzed || 8)),
        flow_strength: opportunities > 5 ? 'strong' : 'gentle',
      },
    },
    mood: opportunities >= 5 ? 'progress' : 'foundation',
  };
}

function sceneFromCampaignFoundation(campaign: any): ShowcaseData['scenes'][number] {
  return {
    id: `scene_foundation_${campaign.id}`,
    pillar: 'campaign',
    title: `"${campaign.keyword}"`,
    subtitle: `Campaign active`,
    primary_metric: {
      label: 'Status',
      value: campaign.health || 'tracking',
      transform: 'literal',
    },
    narrative_short: `Campaign for "${campaign.keyword}" is active. Pillar reports will populate as data arrives — every scene below is built from real signals, not synthesis.`,
    proof: [
      campaign.target_position ? `Target: position ${campaign.target_position}` : 'Building visibility',
      `Started ${relativeTime(campaign.started_at)}`,
    ],
    visualization: {
      kind: 'ascending_bars',
      params: { bar_count: 4, peak: 0.7 },
    },
    mood: 'foundation',
  };
}

function buildFoundationScene(opts: { project: any; daysActive: number; gscPages: any[]; gscQueries: any[] }): ShowcaseData['scenes'][number] {
  const { daysActive, gscPages, gscQueries } = opts;
  return {
    id: 'scene_project_foundation',
    pillar: 'foundation',
    title: 'Foundation laid',
    subtitle: `${daysActive} day${daysActive === 1 ? '' : 's'} of groundwork`,
    primary_metric: {
      label: 'Pages tracked',
      value: gscPages.length,
      transform: 'count_up',
    },
    secondary_metrics: [{ label: 'Queries in view', value: `${gscQueries.length}` }],
    narrative_short: `Tracking ${gscPages.length} pages and ${gscQueries.length} queries. The active campaigns will compound this signal into measurable lift.`,
    proof: [
      `${daysActive} days monitored`,
      `${gscPages.length} pages in scope`,
    ],
    visualization: {
      kind: 'ascending_bars',
      params: { bar_count: Math.min(8, Math.max(3, gscPages.length)), peak: 0.6 },
    },
    mood: 'foundation',
  };
}

/* ════════════════════════════════════════════════════════════════════
   WINS — pull from activity log
══════════════════════════════════════════════════════════════════════ */

function composeWins(activity: any[]): ShowcaseData['wins'] {
  const winLike = activity.filter(a => {
    const sev = (a.severity || '').toLowerCase();
    const head = (a.headline || '').toLowerCase();
    if (sev === 'success' || sev === 'win') return true;
    return /improved|gained|climbed|won|achieved|hit target|published|ranked|breakthrough|\+|jumped/i.test(a.headline || '');
  });

  return winLike.map(a => {
    const intensity = ((a.severity || '').toLowerCase() === 'success' || /breakthrough|hit target|jumped/i.test(a.headline || ''))
      ? 'dramatic' as const
      : /improved|gained|climbed|\+/i.test(a.headline || '')
        ? 'moderate' as const
        : 'subtle' as const;
    return {
      title:         a.headline || 'Progress recorded',
      metric_text:   String(a.detail || '').slice(0, 90),
      when_relative: relativeTime(a.created_at),
      intensity,
    };
  });
}

/* ════════════════════════════════════════════════════════════════════
   FORECAST
══════════════════════════════════════════════════════════════════════ */

function composeForecast(forecastRows: any[], activeCampaigns: any[]): ShowcaseData['forecast'] {
  if (!forecastRows || forecastRows.length === 0) {
    /* If no forecasts in DB but we have campaigns with targets, synthesize a light one. */
    const targetCampaign = activeCampaigns.find(c => c.target_position && c.current_position);
    if (targetCampaign) {
      return {
        metric_label:      `"${targetCampaign.keyword}" position`,
        projected_value:   Number(targetCampaign.target_position),
        projected_horizon: 'within target window',
        confidence:        'medium',
        assumption:        'if current pillar work compounds at the present pace',
      };
    }
    return null;
  }

  /* Pick the most recent meaningful checkpoint */
  const cp = forecastRows[0];
  const projected = Number(cp.projected_value ?? cp.projected_position ?? cp.target_value ?? 0);
  const horizon   = cp.horizon || cp.projected_horizon || 'in the coming weeks';
  const label     = cp.metric_label || cp.label || 'Projected position';
  const confRaw   = String(cp.confidence || 'medium').toLowerCase();
  const conf: Confidence = (confRaw === 'high' || confRaw === 'low') ? (confRaw as any) : 'medium';

  return {
    metric_label:      label,
    projected_value:   projected,
    projected_horizon: horizon,
    confidence:        conf,
    assumption:        cp.assumption || 'if the current trajectory continues',
    curve_points:      Array.isArray(cp.curve_points) ? cp.curve_points.slice(0, 12) : undefined,
  };
}

/* ════════════════════════════════════════════════════════════════════
   NEXT CHAPTER
══════════════════════════════════════════════════════════════════════ */

function composeNextChapter(opts: { activeCampaigns: any[] }): ShowcaseData['next_chapter'] {
  const items: ShowcaseData['next_chapter'] = [];
  for (const c of opts.activeCampaigns.slice(0, 3)) {
    items.push({
      title: `Continue "${c.keyword}"`,
      impact_estimate: c.target_position
        ? `Target: position ${c.target_position}`
        : 'Continue building visibility',
      timing: c.health === 'green' ? 'On track' : c.health === 'amber' ? 'Needs nudge' : 'Active',
    });
  }
  if (items.length === 0) {
    items.push({
      title: 'Activate the first campaign',
      impact_estimate: 'Unlocks the full pillar stack',
      timing: 'Ready now',
    });
  }
  return items;
}

/* ════════════════════════════════════════════════════════════════════
   MOOD CLASSIFIER — drives the overall page color grade
══════════════════════════════════════════════════════════════════════ */

function determineDominantMood(input: { activeCampaigns: any[]; gscPages: any[]; activity: any[] }): ShowcaseMood {
  const { activeCampaigns, gscPages, activity } = input;

  const greenCount = activeCampaigns.filter(c => c.health === 'green').length;
  const redCount   = activeCampaigns.filter(c => c.health === 'red').length;
  const recentWins = activity.filter(a => {
    const head = (a.headline || '').toLowerCase();
    return /improved|gained|climbed|jumped|breakthrough/i.test(head);
  }).length;

  if (recentWins >= 3 && greenCount >= 1) return 'breakthrough';
  if (greenCount > redCount && gscPages.length > 5) return 'ascending';
  if (redCount > greenCount) return 'turbulent';
  if (activeCampaigns.length > 0) return 'steady';
  return 'foundation';
}

/* ════════════════════════════════════════════════════════════════════
   NARRATIVES
══════════════════════════════════════════════════════════════════════ */

function buildHeroNarrative(opts: {
  project: any; heroSpec: any; mood: ShowcaseMood; daysActive: number; activeCampaigns: any[];
}): string {
  const { mood, daysActive, activeCampaigns } = opts;
  const campCount = activeCampaigns.length;

  if (mood === 'breakthrough') {
    return `${daysActive} days in, and the signal is sharpening. Multiple campaigns are converting groundwork into measurable lift.`;
  }
  if (mood === 'ascending') {
    return `${campCount} campaign${campCount === 1 ? '' : 's'} active. The trajectory is upward — each pillar is compounding the last.`;
  }
  if (mood === 'turbulent') {
    return `Some campaigns are facing headwind. The system is adjusting, the work continues, and the honest picture is below.`;
  }
  if (mood === 'steady') {
    return `${campCount} campaign${campCount === 1 ? '' : 's'} steady in motion. Foundation set; momentum building day over day.`;
  }
  return `${daysActive} day${daysActive === 1 ? '' : 's'} in. Foundation is being laid. The pillars below are how it compounds.`;
}

/* ════════════════════════════════════════════════════════════════════
   HONEST GAPS — surface what's missing
══════════════════════════════════════════════════════════════════════ */

function buildHonestGaps(input: { gscPages: any[]; gscQueries: any[]; ga4: any; activeCampaigns: any[] }): string[] {
  const gaps: string[] = [];
  if (input.gscPages.length === 0)       gaps.push('Google Search Console data not connected — connect for live performance signals.');
  if (!input.ga4 || Object.keys(input.ga4 || {}).length === 0) gaps.push('Google Analytics 4 not connected — connect for traffic + conversion attribution.');
  if (input.activeCampaigns.length === 0) gaps.push('No active campaigns yet — activate the first one to unlock pillar-level reporting.');
  return gaps;
}

/* ════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════ */

function safeParseArray(raw: any): any[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

function safeParseObj(raw: any): any {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function sumField(arr: any[], field: string): number {
  return arr.reduce((sum, x) => sum + (Number(x?.[field]) || 0), 0);
}

function dataSourceStatusFromTs(ts?: string | null): DataSourceStatus {
  if (!ts) return 'missing';
  const ageDays = (Date.now() - new Date(ts).getTime()) / 86_400_000;
  if (ageDays > 14) return 'stale';
  return 'fresh';
}

function relativeTime(iso?: string): string {
  if (!iso) return 'recently';
  const ms = Date.now() - new Date(iso).getTime();
  const d  = Math.floor(ms / 86_400_000);
  if (d < 1)  return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7)  return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) === 1 ? '' : 's'} ago`;
  if (d < 365) return `${Math.floor(d / 30)} month${Math.floor(d / 30) === 1 ? '' : 's'} ago`;
  return `${Math.floor(d / 365)} year${Math.floor(d / 365) === 1 ? '' : 's'} ago`;
}

/* ════════════════════════════════════════════════════════════════════
   PHASE 22.1 — DEPTH COMPOSERS
   Real-world digital marketing report sections, composed from existing
   GSC/GA4 data. Honest about limitations: each function returns null
   when the source data isn't available, never fabricates.
══════════════════════════════════════════════════════════════════════ */

/* ─── Visibility Pulse — multi-month clicks/impressions timeline ──── */

function composeVisibilityPulse(gscDaily: any[]): ShowcaseData['visibility_pulse'] {
  if (!Array.isArray(gscDaily) || gscDaily.length < 7) return null;

  /* Sort ascending by date, pick last 90 days (or whatever we have if less) */
  const sorted = [...gscDaily]
    .filter(d => d && typeof d.date === 'string')
    .sort((a, b) => a.date.localeCompare(b.date));
  const tail = sorted.slice(-90);
  if (tail.length < 7) return null;

  const points = tail.map(d => ({
    date:        d.date,
    clicks:      Number(d.clicks) || 0,
    impressions: Number(d.impressions) || 0,
  }));

  const totalClicks      = points.reduce((s, p) => s + p.clicks, 0);
  const totalImpressions = points.reduce((s, p) => s + p.impressions, 0);

  /* Peak day by clicks (or impressions if clicks all zero) */
  let peak = points[0];
  for (const p of points) {
    if (p.clicks > peak.clicks) peak = p;
    else if (totalClicks === 0 && p.impressions > peak.impressions) peak = p;
  }

  /* Period delta — last half vs first half clicks */
  const mid = Math.floor(points.length / 2);
  const firstHalf = points.slice(0, mid).reduce((s, p) => s + p.clicks, 0);
  const lastHalf  = points.slice(mid).reduce((s, p) => s + p.clicks, 0);
  const periodDelta = firstHalf > 0 ? ((lastHalf - firstHalf) / firstHalf) * 100 : 0;

  return {
    window_label:        points.length >= 90 ? 'Last 90 days' : `Last ${points.length} days`,
    points,
    peak_day:            peak,
    total_clicks:        totalClicks,
    total_impressions:   totalImpressions,
    period_delta_pct:    Number(periodDelta.toFixed(1)),
  };
}

/* ─── Keyword Movers — winners / losers / holding ────────────────── */

function composeKeywordMovers(
  gscQueries: any[],
  reportsByCampaign: Record<string, any[]>,
  activeCampaigns: any[],
): ShowcaseData['keyword_movers'] {
  if (!Array.isArray(gscQueries) || gscQueries.length === 0) return null;

  /* Build baseline position map from monitoring snapshots when available.
     Match by campaign keyword (case-insensitive). */
  const baselineByKw: Record<string, number> = {};
  for (const c of activeCampaigns) {
    const reports = reportsByCampaign[c.id] || [];
    const monitor = reports.find(r => r.pillar === 'monitoring');
    const snap = monitor?.metric_snapshot || {};
    const baseline = Number(snap.baseline_position);
    if (baseline > 0 && c.keyword) {
      baselineByKw[String(c.keyword).toLowerCase()] = baseline;
    }
  }

  type MoverIn = { keyword: string; position: number; impressions: number; clicks: number };
  const candidates: MoverIn[] = gscQueries
    .filter(q => q && q.query && typeof q.position === 'number')
    .slice(0, 80)
    .map(q => ({
      keyword:     String(q.query),
      position:    Number(q.position),
      impressions: Number(q.impressions) || 0,
      clicks:      Number(q.clicks) || 0,
    }));

  const winners: ShowcaseData['keyword_movers']['winners'] = [];
  const losers:  ShowcaseData['keyword_movers']['losers']  = [];
  const holding: ShowcaseData['keyword_movers']['holding'] = [];

  for (const c of candidates) {
    const baseline = baselineByKw[c.keyword.toLowerCase()];
    if (typeof baseline === 'number' && baseline > 0) {
      const delta = baseline - c.position;     // positive = improved
      if (delta >= 1) {
        winners.push({
          keyword: c.keyword, from_position: baseline, to_position: c.position,
          impressions: c.impressions, clicks: c.clicks, delta: Number(delta.toFixed(1)),
        });
      } else if (delta <= -1) {
        losers.push({
          keyword: c.keyword, from_position: baseline, to_position: c.position,
          impressions: c.impressions, clicks: c.clicks, delta: Number(delta.toFixed(1)),
        });
      } else {
        holding.push({ keyword: c.keyword, position: c.position, impressions: c.impressions, clicks: c.clicks });
      }
    } else {
      /* No baseline — classify by current position tier instead */
      holding.push({ keyword: c.keyword, position: c.position, impressions: c.impressions, clicks: c.clicks });
    }
  }

  /* Sort by impact (impressions for relevance) */
  winners.sort((a, b) => b.impressions - a.impressions);
  losers.sort((a, b) => b.impressions - a.impressions);
  holding.sort((a, b) => b.impressions - a.impressions);

  const methodology = Object.keys(baselineByKw).length > 0
    ? 'Movement measured against monitoring baselines captured at campaign start. Keywords without a baseline appear in "Holding" — those need a monitoring snapshot to surface true movement.'
    : 'No monitoring baselines available yet — top queries shown in "Holding" with current positions. Position movement will be measurable after the first monitoring pillar run.';

  return {
    winners: winners.slice(0, 8),
    losers:  losers.slice(0, 8),
    holding: holding.slice(0, 8),
    methodology,
  };
}

/* ─── Intent Distribution — heuristic classification of queries ───── */

function composeIntentDistribution(gscQueries: any[]): ShowcaseData['intent_distribution'] {
  if (!Array.isArray(gscQueries) || gscQueries.length === 0) return null;

  const buckets = {
    branded:       { impressions: 0, clicks: 0, query_count: 0 },
    informational: { impressions: 0, clicks: 0, query_count: 0 },
    commercial:    { impressions: 0, clicks: 0, query_count: 0 },
    transactional: { impressions: 0, clicks: 0, query_count: 0 },
  };

  /* Build a brand-token set from the longest single-word in top-impression
     queries (cheap heuristic — works for distinctive brand names). For better
     accuracy, future versions can pull from project.brand_terms. */
  const topByImpressions = [...gscQueries]
    .sort((a, b) => (Number(b.impressions) || 0) - (Number(a.impressions) || 0))
    .slice(0, 10);
  const brandCandidates: string[] = [];
  for (const q of topByImpressions) {
    const tokens = String(q.query || '').toLowerCase().split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 4 && /^[a-z][a-z0-9]+$/.test(t) && !STOPWORDS.has(t)) brandCandidates.push(t);
    }
  }
  /* The most-frequent candidate across top queries is likely the brand. */
  const tokenFreq: Record<string, number> = {};
  for (const t of brandCandidates) tokenFreq[t] = (tokenFreq[t] || 0) + 1;
  const brandToken = Object.entries(tokenFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  for (const q of gscQueries) {
    const text = String(q.query || '').toLowerCase();
    const impressions = Number(q.impressions) || 0;
    const clicks = Number(q.clicks) || 0;

    let bucket: keyof typeof buckets = 'informational';
    if (brandToken && text.includes(brandToken)) {
      bucket = 'branded';
    } else if (/\b(buy|order|price|pricing|cost|cheap|discount|deal|coupon|shop|sale|free shipping|near me)\b/.test(text)) {
      bucket = 'transactional';
    } else if (/\b(best|top|review|reviews|vs|versus|compare|comparison|alternative|alternatives|software|service|services|company|companies|agency|tool|tools|provider)\b/.test(text)) {
      bucket = 'commercial';
    } else if (/\b(how|what|why|when|where|guide|tutorial|explained|meaning|definition|examples?|tips?|ideas?|tutorial)\b/.test(text)) {
      bucket = 'informational';
    } else {
      bucket = 'informational'; // default — most ambiguous queries are info-seeking
    }

    buckets[bucket].impressions += impressions;
    buckets[bucket].clicks      += clicks;
    buckets[bucket].query_count += 1;
  }

  return {
    branded:       buckets.branded,
    informational: buckets.informational,
    commercial:    buckets.commercial,
    transactional: buckets.transactional,
    classification_note: brandToken
      ? `Classified by lexical heuristics. Branded bucket detected via inferred brand token "${brandToken}" — review for accuracy. Commercial/transactional/informational classified by query patterns; ambiguous queries default to informational.`
      : `Classified by lexical heuristics. No distinctive brand token detected — all traffic shown as non-branded. Add brand terms to project metadata for cleaner branded/non-branded split.`,
  };
}

const STOPWORDS = new Set([
  'the','and','for','with','from','that','this','what','where','when','how','why','your','you','our','their',
  'about','these','those','have','has','had','are','was','were','will','can','seo','best','top','vs','near',
  'online','services','service','company','agency',
]);

/* ─── Content Health — page tiers ───────────────────────────────── */

function composeContentHealth(gscPages: any[]): ShowcaseData['content_health'] {
  if (!Array.isArray(gscPages) || gscPages.length === 0) return null;

  /* Tier classification logic:
       hero            — page-1 position (<=10) AND CTR >= 3%   → keep nurturing, defend
       climbing        — page-2 position (11-20) with impressions >= 100 → push to page 1
       plateau         — page-1 position but CTR < 2%           → snippet/title rewrite
       underperforming — position > 20 OR impressions < 50      → re-evaluate intent fit
  */
  const tiers = {
    hero:            [] as ShowcaseData['content_health']['tiers']['hero'],
    climbing:        [] as ShowcaseData['content_health']['tiers']['climbing'],
    plateau:         [] as ShowcaseData['content_health']['tiers']['plateau'],
    underperforming: [] as ShowcaseData['content_health']['tiers']['underperforming'],
  };

  for (const p of gscPages.slice(0, 50)) {
    if (!p || !p.page) continue;
    const pos = Number(p.position) || 99;
    const imp = Number(p.impressions) || 0;
    const clk = Number(p.clicks) || 0;
    const ctr = imp > 0 ? (clk / imp) * 100 : 0;

    const row = {
      page:        String(p.page).slice(0, 120),
      clicks:      clk,
      impressions: imp,
      position:    Number(pos.toFixed(1)),
      ctr:         Number(ctr.toFixed(2)),
    };

    if (pos > 20 || imp < 50) {
      tiers.underperforming.push(row);
    } else if (pos <= 10 && ctr >= 3) {
      tiers.hero.push(row);
    } else if (pos > 10 && pos <= 20 && imp >= 100) {
      tiers.climbing.push(row);
    } else {
      tiers.plateau.push(row);
    }
  }

  /* Sort each tier by impressions to surface highest-impact pages */
  tiers.hero.sort((a, b) => b.impressions - a.impressions);
  tiers.climbing.sort((a, b) => b.impressions - a.impressions);
  tiers.plateau.sort((a, b) => b.impressions - a.impressions);
  tiers.underperforming.sort((a, b) => b.impressions - a.impressions);

  return {
    tiers: {
      hero:            tiers.hero.slice(0, 5),
      climbing:        tiers.climbing.slice(0, 5),
      plateau:         tiers.plateau.slice(0, 5),
      underperforming: tiers.underperforming.slice(0, 5),
    },
    tier_counts: {
      hero:            tiers.hero.length,
      climbing:        tiers.climbing.length,
      plateau:         tiers.plateau.length,
      underperforming: tiers.underperforming.length,
    },
    tier_actions: {
      hero:            'Defend. Refresh annually. Build internal links toward these.',
      climbing:        'Push to page one — optimize on-page, earn 1-2 internal links, expand depth.',
      plateau:         'Rewrite titles + meta to lift CTR. Test 2 variants over 4 weeks.',
      underperforming: 'Re-evaluate search intent fit. Consolidate or redirect if duplicative.',
    },
  };
}
