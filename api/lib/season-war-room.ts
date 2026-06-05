/* ════════════════════════════════════════════════════════════════════
   api/lib/season-war-room.ts
   Phase 21 — Block 2.11 Phase A — War Room foundation

   GOAL
     Single endpoint that powers the War Room. Aggregates:
       1. Unified priority feed (9 sources, ranked)
       2. Scorecard (5 health numbers + week deltas)

   The unified feed sources:
     1. PM blockers — briefing.attention (existing)
     2. Pillar critical findings — pillar_reports.findings[]
     3. Pillar reruns overdue — seo_pillar_panels.next_recheck_at
     4. Recoverable GSC opportunities — project_knowledge.gsc_top_queries
     5. Inbox opportunities — seo_opportunities (open)
     6. Position regressions — analytics intel fallingStars (when cached)
     7. Conversion anomalies — analytics intel anomalies (when cached)
     8. Failed pillar runs — pillar_reports last_status=failed
     9. Stale integrations — project_integrations.last_pull_at

   Ranking model:
     priority_score = severity_weight × recency_weight × impact_weight

   The 1 celebratory item: top "rising star" (if any), low priority,
   surfaces only when it doesn't push out a critical.

   COST
     • All DB reads, no LLM calls.
     • ~150ms per call typical.
══════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

const MAX_FEED_ITEMS = 10;          // pro mode
const MAX_FEED_ITEMS_CASUAL = 5;    // casual mode

/* ════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════ */

export type Severity = 'critical' | 'warning' | 'info' | 'celebrate';
export type Category = 'pm' | 'pillar' | 'gsc' | 'ga4' | 'geo' | 'inbox' | 'integration' | 'campaign';

export interface UnifiedSource {
  kind:           'briefing' | 'pillar_report' | 'panel_recheck' | 'gsc' | 'geo' | 'opportunity' | 'analytics_intel' | 'integration';
  label:          string;
  last_refresh?:  string;
  table?:         string;
  detail?:        string;
}

export interface UnifiedPriorityItem {
  id:              string;
  category:        Category;
  severity:        Severity;
  title:           string;
  detail:          string;
  source:          UnifiedSource;
  action: {
    label:          string;
    kind:           'chat_command' | 'navigate' | 'rerun_pillar' | 'open_inbox' | 'open_campaign';
    payload:        any;
  };
  priority_score:  number;
  computed_at:     string;
}

export interface ScorecardCell {
  key:             'health' | 'velocity' | 'quality' | 'risk' | 'roi_hint';
  label:           string;
  value:           string;
  numeric_value:   number;
  delta_this_week: number | null;
  delta_label:     string | null;
  sparkline:       number[] | null;
  contributing:    string[];
}

export interface WarRoomBriefingV2 {
  unified_feed:    UnifiedPriorityItem[];
  scorecard:       ScorecardCell[];
  tools_status: {
    gsc_connected:           boolean;
    gsc_last_refresh:        string | null;
    ga4_connected:           boolean;
    ga4_last_refresh:        string | null;
    positioning_resolved:    boolean;
    positioning_last_refresh: string | null;
  };
  honest_note?:    string;
  generated_at:    string;
}

/* ════════════════════════════════════════════════════════════════════
   PUBLIC ENTRY
══════════════════════════════════════════════════════════════════════ */

export async function getWarRoomBriefingV2(opts: {
  projectId: string;
}): Promise<{ success: boolean; briefing?: WarRoomBriefingV2; error?: string }> {
  try {
    const projectId = opts.projectId;
    const now = Date.now();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

    /* Step 1 — parallel reads of every source */
    const [
      attention,
      pillarReports,
      pillarPanels,
      campaigns,
      opportunities,
      integrations,
      gscQueries,
      analyticsIntel,
      geoAttribution,
    ] = await Promise.all([
      readBriefingAttention(projectId),
      readPillarReports(projectId, twoWeeksAgo),
      readPillarPanels(projectId),
      readActiveCampaigns(projectId),
      readOpenOpportunities(projectId),
      readIntegrations(projectId),
      readGscTopQueries(projectId),
      readAnalyticsIntel(projectId),
      readGeoAttribution(projectId),
    ]);

    /* Step 2 — build the feed items from each source */
    const items: UnifiedPriorityItem[] = [];

    items.push(...itemsFromPmBlockers(attention));
    items.push(...itemsFromPillarFindings(pillarReports));
    items.push(...itemsFromPillarRecheck(pillarPanels));
    items.push(...itemsFromRecoverable(gscQueries, integrations));
    items.push(...itemsFromOpportunities(opportunities));
    items.push(...itemsFromFallingStars(analyticsIntel));
    items.push(...itemsFromAnomalies(analyticsIntel));
    items.push(...itemsFromFailedPillarRuns(pillarReports));
    items.push(...itemsFromStaleIntegrations(integrations));
    /* Build 12.18 — GEO-era items from measured AI Overview + AI platform data */
    items.push(...itemsFromGeoAttribution(geoAttribution, integrations));

    /* The 1 celebratory item */
    const winItem = itemFromRisingStars(analyticsIntel);
    if (winItem) items.push(winItem);

    /* Step 3 — dedupe (same source kind + same target key) */
    const seen = new Set<string>();
    const deduped = items.filter(it => {
      const dedupeKey = `${it.category}::${it.id}`;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    });

    /* Step 4 — sort by priority_score desc */
    deduped.sort((a, b) => b.priority_score - a.priority_score);

    /* Step 5 — keep top N */
    const finalFeed = deduped.slice(0, MAX_FEED_ITEMS);

    /* Step 6 — build scorecard */
    const scorecard = buildScorecard({
      attention,
      pillarReports,
      pillarPanels,
      campaigns,
      opportunities,
      integrations,
      gscQueries,
      analyticsIntel,
    });

    /* Step 7 — tools status */
    const tools_status = {
      gsc_connected:            integrations.gsc?.last_pull_status === 'ok' && !!integrations.gsc?.last_pull_at,
      gsc_last_refresh:         integrations.gsc?.last_pull_at || null,
      ga4_connected:            integrations.ga4?.last_pull_status === 'ok' && !!integrations.ga4?.last_pull_at,
      ga4_last_refresh:         integrations.ga4?.last_pull_at || null,
      positioning_resolved:     !!attention.positioning_resolved,
      positioning_last_refresh: attention.positioning_refresh || null,
    };

    /* Step 8 — honest note about coverage */
    const noteParts: string[] = [];
    if (!tools_status.gsc_connected) noteParts.push('GSC not connected — recoverable opportunities + falling stars are absent.');
    if (!tools_status.ga4_connected) noteParts.push('GA4 not connected — conversion anomalies unavailable.');
    if (!analyticsIntel) noteParts.push('Analytics intelligence has not been computed yet — falling stars and anomalies will appear after first compute.');
    const honest_note = noteParts.length > 0 ? noteParts.join(' ') : undefined;

    return {
      success: true,
      briefing: {
        unified_feed: finalFeed,
        scorecard,
        tools_status,
        honest_note,
        generated_at: new Date().toISOString(),
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'war room briefing v2 failed' };
  }
}

/* Casual mode: same payload but trimmed feed */
export async function getWarRoomBriefingCasualV2(opts: { projectId: string }) {
  const r = await getWarRoomBriefingV2(opts);
  if (r.success && r.briefing) {
    r.briefing.unified_feed = r.briefing.unified_feed.slice(0, MAX_FEED_ITEMS_CASUAL);
  }
  return r;
}

/* ════════════════════════════════════════════════════════════════════
   SOURCE READERS
══════════════════════════════════════════════════════════════════════ */

async function readBriefingAttention(projectId: string): Promise<{
  items: any[];
  positioning_resolved: boolean;
  positioning_refresh: string | null;
}> {
  try {
    const { seasonBriefing } = await import("./season-attention.js");
    const r = await seasonBriefing({ projectId });
    const items = r?.success && r.briefing ? (r.briefing.attention || []) : [];
    const positioning = await readPositioningStatus(projectId);
    return { items, positioning_resolved: positioning.resolved, positioning_refresh: positioning.refresh };
  } catch {
    return { items: [], positioning_resolved: false, positioning_refresh: null };
  }
}

async function readPositioningStatus(projectId: string): Promise<{ resolved: boolean; refresh: string | null }> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("updated_at, field_value")
      .eq("project_id", projectId)
      .eq("category", "strategy")
      .eq("field_key", "project_positioning")
      .maybeSingle();
    if ((data as any)?.field_value) return { resolved: true, refresh: (data as any).updated_at || null };
  } catch { /* swallow */ }
  return { resolved: false, refresh: null };
}

async function readPillarReports(projectId: string, sinceIso: string): Promise<any[]> {
  try {
    const { data } = await db().from("pillar_reports")
      .select("id, campaign_id, kind, status, findings, generated_at, error_message")
      .gte("generated_at", sinceIso)
      .order("generated_at", { ascending: false })
      .limit(80);
    /* Filter to this project's campaigns */
    const projectCampaignIds = await getProjectCampaignIds(projectId);
    return (data as any[] || []).filter(r => projectCampaignIds.has(r.campaign_id));
  } catch { return []; }
}

async function getProjectCampaignIds(projectId: string): Promise<Set<string>> {
  try {
    const { data } = await db().from("seo_campaigns").select("id").eq("project_id", projectId);
    return new Set((data as any[] || []).map(r => r.id));
  } catch { return new Set(); }
}

async function readPillarPanels(projectId: string): Promise<any[]> {
  try {
    const { data } = await db().from("seo_pillar_panels")
      .select("id, campaign_id, kind, next_recheck_at, last_report_at, status")
      .order("next_recheck_at", { ascending: true });
    const projectCampaignIds = await getProjectCampaignIds(projectId);
    return (data as any[] || []).filter(p => projectCampaignIds.has(p.campaign_id));
  } catch { return []; }
}

async function readActiveCampaigns(projectId: string): Promise<any[]> {
  try {
    const { data } = await db().from("seo_campaigns")
      .select("id, keyword, keyword_group, status, current_position, updated_at")
      .eq("project_id", projectId)
      .in("status", ['active', 'paused'])
      .order("updated_at", { ascending: false });
    return data as any[] || [];
  } catch { return []; }
}

async function readOpenOpportunities(projectId: string): Promise<any[]> {
  try {
    const { data } = await db().from("seo_opportunities")
      .select("id, title, kind, suggested_keyword, suggested_action, estimated_value, severity, created_at")
      .eq("project_id", projectId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(30);
    return data as any[] || [];
  } catch { return []; }
}

async function readIntegrations(projectId: string): Promise<{ gsc?: any; ga4?: any; raw: any[] }> {
  try {
    const { data } = await db().from("project_integrations")
      .select("provider, last_pull_at, last_pull_status")
      .eq("project_id", projectId);
    const raw = data as any[] || [];
    const gsc = raw.find(i => /gsc|search_console|search-console/i.test(i.provider || ''));
    const ga4 = raw.find(i => /ga4|analytics/i.test(i.provider || ''));
    return { gsc, ga4, raw };
  } catch { return { raw: [] }; }
}

async function readGscTopQueries(projectId: string): Promise<{ queries: any[]; refresh: string | null }> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_value, updated_at")
      .eq("project_id", projectId)
      .eq("category", "analytics")
      .eq("field_key", "gsc_top_queries")
      .maybeSingle();
    const queries: any[] = (data as any)?.field_value ? JSON.parse((data as any).field_value) : [];
    return { queries, refresh: (data as any)?.updated_at || null };
  } catch { return { queries: [], refresh: null }; }
}

async function readAnalyticsIntel(projectId: string): Promise<any | null> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_value, updated_at")
      .eq("project_id", projectId)
      .eq("category", "analytics")
      .eq("field_key", "analytics_intel_bundle")
      .maybeSingle();
    if (!(data as any)?.field_value) return null;
    const intel = JSON.parse((data as any).field_value);
    intel._refresh = (data as any).updated_at;
    return intel;
  } catch { return null; }
}

/* Build 12.18 — Reader for GEO-era attribution. Returns both the GSC
   AI Overview summary and the GA4 AI platform referral summary plus
   their freshness timestamps so the war room can cite "as of X" on
   every claim it makes. */
async function readGeoAttribution(projectId: string): Promise<{
  aiOverview: any | null;
  ga4AiPlatform: any | null;
  searchAppearance: any[];
  ga4AiDaily: any[];
  refresh: string | null;
}> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_key, field_value, updated_at")
      .eq("project_id", projectId)
      .eq("category", "analytics")
      .in("field_key", [
        "gsc_ai_overview_summary",
        "ga4_ai_platform_summary",
        "gsc_search_appearance",
        "ga4_ai_platform_daily",
      ]);
    const rows = ((data as any) || []) as any[];
    const findObj = (k: string) => {
      const r = rows.find(x => x.field_key === k);
      try { return r ? JSON.parse(r.field_value || "null") : null; } catch { return null; }
    };
    const findArr = (k: string) => {
      const r = rows.find(x => x.field_key === k);
      try { return r ? JSON.parse(r.field_value || "[]") : []; } catch { return []; }
    };
    const freshest = rows.map(r => r.updated_at).filter(Boolean).sort().pop() || null;
    return {
      aiOverview:       findObj("gsc_ai_overview_summary"),
      ga4AiPlatform:    findObj("ga4_ai_platform_summary"),
      searchAppearance: findArr("gsc_search_appearance"),
      ga4AiDaily:       findArr("ga4_ai_platform_daily"),
      refresh:          freshest,
    };
  } catch {
    return { aiOverview: null, ga4AiPlatform: null, searchAppearance: [], ga4AiDaily: [], refresh: null };
  }
}

/* ════════════════════════════════════════════════════════════════════
   ITEM BUILDERS — one function per source
══════════════════════════════════════════════════════════════════════ */

function itemsFromPmBlockers(att: { items: any[] }): UnifiedPriorityItem[] {
  const sevRank: Record<string, Severity> = { critical: 'critical', warning: 'warning', info: 'info', success: 'celebrate' };
  return (att.items || []).slice(0, 6).map((a, i) => {
    const severity: Severity = (sevRank[(a as any).severity] || 'info') as Severity;
    const recencyDays = (a as any).age_days ?? 0;
    return {
      id:        `pm-${(a as any).action_id || `${i}-${(a.headline || '').slice(0, 30)}`}`,
      category:  'pm' as Category,
      severity,
      title:     a.headline || 'PM item',
      detail:    a.detail || '',
      source:    {
        kind:  'briefing',
        label: a.source || 'System briefing',
      },
      action: {
        label:   'Open',
        kind:    'navigate',
        payload: (a as any).url || '/planning',
      },
      priority_score: scoreItem(severity, recencyDays, 1.0),
      computed_at:    new Date().toISOString(),
    };
  });
}

function itemsFromPillarFindings(reports: any[]): UnifiedPriorityItem[] {
  const out: UnifiedPriorityItem[] = [];
  for (const report of reports) {
    if (!Array.isArray(report.findings)) continue;
    for (const f of report.findings) {
      const sev = (f.severity || 'info').toLowerCase();
      if (sev !== 'critical' && sev !== 'warning') continue;
      const daysAgo = daysBetween(report.generated_at, new Date().toISOString());
      out.push({
        id:        `pillar-${report.kind}-${(f.id || f.title || '').slice(0, 30)}`,
        category:  'pillar',
        severity:  sev as Severity,
        title:     `${humanPillarKind(report.kind)}: ${f.title || f.description || 'finding'}`,
        detail:    String(f.description || f.reasoning || '').slice(0, 200),
        source:    {
          kind:         'pillar_report',
          label:        `Last ${humanPillarKind(report.kind)} report`,
          last_refresh: report.generated_at,
          table:        'pillar_reports',
        },
        action: {
          label:   `Open ${humanPillarKind(report.kind)}`,
          kind:    'navigate',
          payload: pillarPath(report.kind),
        },
        priority_score: scoreItem(sev as Severity, daysAgo, sev === 'critical' ? 1.4 : 1.1),
        computed_at: new Date().toISOString(),
      });
      if (out.length > 8) break;
    }
    if (out.length > 8) break;
  }
  return out;
}

function itemsFromPillarRecheck(panels: any[]): UnifiedPriorityItem[] {
  const now = Date.now();
  const overdue = panels.filter(p => p.next_recheck_at && new Date(p.next_recheck_at).getTime() < now);
  return overdue.slice(0, 4).map(p => {
    const daysOverdue = Math.floor((now - new Date(p.next_recheck_at).getTime()) / (1000 * 60 * 60 * 24));
    return {
      id:        `recheck-${p.id}`,
      category:  'pillar' as Category,
      severity:  (daysOverdue > 7 ? 'warning' : 'info') as Severity,
      title:     `${humanPillarKind(p.kind)} recheck overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`,
      detail:    `Last report ${p.last_report_at ? `was ${daysBetween(p.last_report_at, new Date().toISOString())} days ago` : 'has never run'}. Data may have drifted.`,
      source: {
        kind:  'panel_recheck',
        label: 'Pillar panel schedule',
        table: 'seo_pillar_panels',
      },
      action: {
        label:   `Rerun ${humanPillarKind(p.kind)}`,
        kind:    'rerun_pillar',
        payload: { panel_id: p.id, pillar_kind: p.kind, campaign_id: p.campaign_id },
      },
      priority_score: scoreItem('warning', daysOverdue, daysOverdue > 14 ? 1.3 : 1.0),
      computed_at: new Date().toISOString(),
    };
  });
}

function itemsFromRecoverable(gsc: { queries: any[]; refresh: string | null }, integrations: any): UnifiedPriorityItem[] {
  if (!gsc.queries.length) return [];
  const recoverable = gsc.queries.filter((q: any) =>
    q && typeof q.query === 'string' &&
    (q.impressions || 0) >= 20 &&
    (q.position || 99) >= 10 && (q.position || 0) <= 30
  );
  const source: UnifiedSource = {
    kind:         'gsc',
    label:        'Your Google Search Console',
    last_refresh: gsc.refresh || integrations.gsc?.last_pull_at || undefined,
    table:        'project_knowledge.gsc_top_queries',
  };
  return recoverable
    .sort((a: any, b: any) => (b.impressions || 0) - (a.impressions || 0))
    .slice(0, 4)
    .map((q: any) => {
      const impactBoost = (q.impressions || 0) >= 100 ? 1.3 : 1.0;
      const severity: Severity = (q.impressions || 0) >= 100 ? 'warning' : 'info';
      return {
        id:        `gsc-rec-${(q.query || '').replace(/\s+/g, '-').slice(0, 40)}`,
        category:  'gsc' as Category,
        severity,
        title:     `Push "${q.query}" to page 1`,
        detail:    `Position ${Number(q.position || 0).toFixed(1)}, ${q.impressions || 0} imp/mo, ${q.clicks || 0} clicks. Recoverable signal.`,
        source,
        action: {
          label:   'Start campaign',
          kind:    'chat_command',
          payload: `rank me for "${q.query}"`,
        },
        priority_score: scoreItem(severity, 0, impactBoost),
        computed_at: new Date().toISOString(),
      };
    });
}

function itemsFromOpportunities(opps: any[]): UnifiedPriorityItem[] {
  return opps.slice(0, 4).map(o => {
    const ageDays = daysBetween(o.created_at, new Date().toISOString());
    const sev: Severity = (o.severity === 'critical' ? 'critical' : o.severity === 'warning' ? 'warning' : 'info') as Severity;
    return {
      id:        `inbox-${o.id}`,
      category:  'inbox' as Category,
      severity:  sev,
      title:     o.title || 'Opportunity pending',
      detail:    `${ageDays} day${ageDays === 1 ? '' : 's'} old${o.estimated_value ? ` · ${o.estimated_value}` : ''}`,
      source: {
        kind:  'opportunity',
        label: 'Opportunities inbox',
        table: 'seo_opportunities',
      },
      action: o.suggested_keyword && o.suggested_action === 'new_campaign'
        ? { label: 'Start campaign', kind: 'chat_command' as const, payload: `rank me for "${o.suggested_keyword}"` }
        : { label: 'Open inbox',     kind: 'open_inbox'    as const, payload: { opportunity_id: o.id } },
      priority_score: scoreItem(sev, ageDays, ageDays > 14 ? 1.2 : 1.0),
      computed_at: new Date().toISOString(),
    };
  });
}

function itemsFromFallingStars(intel: any | null): UnifiedPriorityItem[] {
  if (!intel || !Array.isArray(intel.fallingStars)) return [];
  return (intel.fallingStars as any[]).slice(0, 3).map((s: any) => ({
    id:        `falling-${(s.query || s.page || '').replace(/\s+/g, '-').slice(0, 40)}`,
    category:  'gsc' as Category,
    severity:  'warning' as Severity,
    title:     `Position dropped: "${s.query || s.page}"`,
    detail:    `${s.delta != null ? `Down ${Math.abs(s.delta)} positions` : 'Significant drop detected'}${s.previous_position ? ` (was ${Number(s.previous_position).toFixed(1)})` : ''}`,
    source: {
      kind:         'analytics_intel',
      label:        'Analytics intelligence',
      last_refresh: intel._refresh,
      table:        'project_knowledge.analytics_intel_bundle.fallingStars',
    },
    action: {
      label:   'Ask why',
      kind:    'chat_command' as const,
      payload: `what happened to "${s.query || s.page}" — diagnose the position drop`,
    },
    priority_score: scoreItem('warning', daysBetween(intel._refresh, new Date().toISOString()), 1.3),
    computed_at: new Date().toISOString(),
  }));
}

function itemsFromAnomalies(intel: any | null): UnifiedPriorityItem[] {
  if (!intel || !Array.isArray(intel.anomalies)) return [];
  return (intel.anomalies as any[]).slice(0, 3).map((a: any) => {
    const pctDrop = Math.abs(Number(a.delta_pct) || 0);
    const sev: Severity = (pctDrop >= 30 ? 'critical' : pctDrop >= 15 ? 'warning' : 'info') as Severity;
    return {
      id:        `anomaly-${(a.metric || a.label || '').replace(/\s+/g, '-').slice(0, 40)}`,
      category:  'ga4' as Category,
      severity:  sev,
      title:     `${a.label || a.metric || 'Anomaly'} ${a.delta_pct != null ? (a.delta_pct > 0 ? '+' : '') + a.delta_pct.toFixed(0) + '%' : 'shift detected'}`,
      detail:    String(a.description || a.detail || '').slice(0, 200),
      source: {
        kind:         'analytics_intel',
        label:        'Analytics intelligence',
        last_refresh: intel._refresh,
        table:        'project_knowledge.analytics_intel_bundle.anomalies',
      },
      action: {
        label:   'Investigate',
        kind:    'chat_command' as const,
        payload: `investigate the ${a.label || a.metric} anomaly`,
      },
      priority_score: scoreItem(sev, daysBetween(intel._refresh, new Date().toISOString()), sev === 'critical' ? 1.5 : 1.2),
      computed_at: new Date().toISOString(),
    };
  });
}

function itemsFromFailedPillarRuns(reports: any[]): UnifiedPriorityItem[] {
  const failed = reports.filter(r => r.status === 'failed' || r.error_message);
  return failed.slice(0, 2).map(r => ({
    id:        `failed-${r.id}`,
    category:  'pillar' as Category,
    severity:  'warning' as Severity,
    title:     `${humanPillarKind(r.kind)} run failed`,
    detail:    String(r.error_message || 'Pillar reported failure status with no error message').slice(0, 200),
    source: {
      kind:         'pillar_report',
      label:        `${humanPillarKind(r.kind)} report`,
      last_refresh: r.generated_at,
      table:        'pillar_reports',
    },
    action: {
      label:   'Retry pillar',
      kind:    'rerun_pillar' as const,
      payload: { pillar_kind: r.kind, campaign_id: r.campaign_id },
    },
    priority_score: scoreItem('warning', daysBetween(r.generated_at, new Date().toISOString()), 1.1),
    computed_at: new Date().toISOString(),
  }));
}

function itemsFromStaleIntegrations(integrations: any): UnifiedPriorityItem[] {
  const out: UnifiedPriorityItem[] = [];
  const checks = [
    { key: 'gsc', label: 'GSC', integration: integrations.gsc },
    { key: 'ga4', label: 'GA4', integration: integrations.ga4 },
  ];
  for (const c of checks) {
    if (!c.integration || !c.integration.last_pull_at) continue;
    const daysStale = daysBetween(c.integration.last_pull_at, new Date().toISOString());
    if (daysStale < 7) continue;
    const sev: Severity = (daysStale >= 30 ? 'critical' : 'warning') as Severity;
    out.push({
      id:        `stale-${c.key}`,
      category:  'integration' as Category,
      severity:  sev,
      title:     `${c.label} data is ${daysStale} days stale`,
      detail:    `Last successful pull ${daysStale} days ago. Refresh to keep the war room honest.`,
      source: {
        kind:  'integration',
        label: c.label + ' integration',
        last_refresh: c.integration.last_pull_at,
        table: 'project_integrations',
      },
      action: {
        label:   'Open Data Room',
        kind:    'navigate' as const,
        payload: '/data-room',
      },
      priority_score: scoreItem(sev, daysStale, sev === 'critical' ? 1.4 : 1.0),
      computed_at: new Date().toISOString(),
    });
  }
  return out;
}

/* Build 12.18 — GEO-era war room items from measured AI Overview +
   AI platform referrals. Each item carries provenance (source kind,
   table, last refresh) and a specific action the operator can take.
   Honest about both positive findings (AI Overview citations earned)
   and negative findings (no AI Overview attribution = flagged GEO
   opportunity, not a hedge). */
function itemsFromGeoAttribution(
  geo: { aiOverview: any | null; ga4AiPlatform: any | null; searchAppearance: any[]; ga4AiDaily: any[]; refresh: string | null },
  integrations: any
): UnifiedPriorityItem[] {
  const out: UnifiedPriorityItem[] = [];
  const now = new Date().toISOString();

  /* === AI OVERVIEW ATTRIBUTION FINDING ============================ */
  if (geo.aiOverview) {
    const source: UnifiedSource = {
      kind:         'geo',
      label:        'GSC AI Overview attribution (searchAppearance)',
      last_refresh: geo.refresh || integrations.gsc?.last_pull_at || undefined,
      table:        'project_knowledge.gsc_ai_overview_summary',
    };
    if (geo.aiOverview.present && (geo.aiOverview.total_impressions || 0) > 0) {
      const imp = geo.aiOverview.total_impressions;
      const clk = geo.aiOverview.total_clicks || 0;
      const ctr = imp > 0 ? ((clk / imp) * 100).toFixed(2) : '0.00';
      const sev: Severity = imp >= 10000 ? 'celebrate' : 'info';
      out.push({
        id:        'geo-ai-overview-presence',
        category:  'geo' as Category,
        severity:  sev,
        title:     `AI Overview citing this site — ${imp.toLocaleString()} impressions`,
        detail:    `Over the last ${geo.aiOverview.window_days || 30} days: ${imp.toLocaleString()} impressions, ${clk.toLocaleString()} clicks, ${ctr}% CTR. Defend and expand the queries earning citation.`,
        source,
        action: {
          label:   'Analyse cited content',
          kind:    'chat_command' as const,
          payload: 'Which pages of mine are being cited in AI Overview right now and what content patterns are they sharing?',
        },
        priority_score: scoreItem(sev, 0, sev === 'celebrate' ? 1.3 : 1.0),
        computed_at: now,
      });
    } else if (geo.aiOverview.present === false) {
      /* Honest negative — a real GEO opportunity flagged as such */
      out.push({
        id:        'geo-ai-overview-opportunity',
        category:  'geo' as Category,
        severity:  'warning',
        title:     'No AI Overview citations yet — GEO opportunity flagged',
        detail:    `GSC searchAppearance dimension explicitly registered zero AI Overview rows over the last ${geo.aiOverview.window_days || 30} days. AI Overview now appears for ~20-30% of informational queries in most niches and is the fastest-changing surface in search. Structural changes typically begin earning citations in 2-4 months.`,
        source,
        action: {
          label:   'Plan GEO push',
          kind:    'chat_command' as const,
          payload: 'Build a 90-day GEO plan to earn AI Overview citations — structured content recommendations, schema additions, and topical authority strategy.',
        },
        priority_score: scoreItem('warning', 0, 1.2),
        computed_at: now,
      });
    }
  }

  /* === GA4 AI PLATFORM REFERRALS FINDING =========================== */
  if (geo.ga4AiPlatform) {
    const source: UnifiedSource = {
      kind:         'geo',
      label:        'GA4 AI platform referrals (sessionSource)',
      last_refresh: geo.refresh || integrations.ga4?.last_pull_at || undefined,
      table:        'project_knowledge.ga4_ai_platform_summary',
    };
    const sessions = Number(geo.ga4AiPlatform.sessions || 0);
    const platforms = Array.isArray(geo.ga4AiPlatform.platforms_detected) ? geo.ga4AiPlatform.platforms_detected : [];

    /* Compute 7-vs-7-day growth signal */
    let growthLabel = '';
    let growthBoost = 1.0;
    if (Array.isArray(geo.ga4AiDaily) && geo.ga4AiDaily.length >= 14) {
      const sorted = [...geo.ga4AiDaily].sort((a, b) => (a.date > b.date ? 1 : -1));
      const recent = sorted.slice(-7).reduce((s, d) => s + Number(d.sessions || 0), 0);
      const prior  = sorted.slice(-14, -7).reduce((s, d) => s + Number(d.sessions || 0), 0);
      if (prior === 0 && recent > 0) { growthLabel = ' — rising fast (new channel)'; growthBoost = 1.4; }
      else if (prior > 0) {
        const delta = (recent - prior) / prior;
        if (delta > 0.5)       { growthLabel = ` — up ${Math.round(delta * 100)}% week-on-week`; growthBoost = 1.4; }
        else if (delta > 0.15) { growthLabel = ` — up ${Math.round(delta * 100)}% week-on-week`; growthBoost = 1.2; }
        else if (delta < -0.5)  { growthLabel = ` — down ${Math.round(Math.abs(delta) * 100)}% week-on-week`; growthBoost = 1.3; }
        else if (delta < -0.15) { growthLabel = ` — down ${Math.round(Math.abs(delta) * 100)}% week-on-week`; growthBoost = 1.1; }
      }
    }

    if (sessions > 0) {
      const sev: Severity = sessions >= 500 ? 'celebrate' : 'info';
      out.push({
        id:        'geo-ai-platform-referrals',
        category:  'geo' as Category,
        severity:  sev,
        title:     `AI platforms sent ${sessions.toLocaleString()} sessions${growthLabel}`,
        detail:    `Detected platforms: ${platforms.join(', ') || '(unknown)'} over ${geo.ga4AiPlatform.window_days || 30} days. ${geo.ga4AiPlatform.conversions || 0} conversions attributed. Map which pages earn the referrals — those are your AI-citation-ready content shapes to replicate.`,
        source,
        action: {
          label:   'Audit referral pages',
          kind:    'chat_command' as const,
          payload: 'Which pages received AI platform referral traffic and what structural patterns do they share? Build a replication playbook.',
        },
        priority_score: scoreItem(sev, 0, growthBoost),
        computed_at: now,
      });
    } else {
      out.push({
        id:        'geo-ai-platform-zero',
        category:  'geo' as Category,
        severity:  'warning',
        title:     'No AI platform referral traffic detected',
        detail:    `No sessions from ChatGPT, Perplexity, Gemini, Claude, or Copilot in the last ${geo.ga4AiPlatform.window_days || 30} days. AI platforms increasingly drive citation traffic — sites without presence here will lose share as the surface matures.`,
        source,
        action: {
          label:   'Plan AI citation push',
          kind:    'chat_command' as const,
          payload: 'Build a plan to earn citations in ChatGPT, Perplexity, Gemini, Claude, and Copilot — content structure, schema, and entity authority recommendations.',
        },
        priority_score: scoreItem('warning', 0, 1.15),
        computed_at: now,
      });
    }
  }

  return out;
}

function itemFromRisingStars(intel: any | null): UnifiedPriorityItem | null {
  if (!intel || !Array.isArray(intel.risingStars) || intel.risingStars.length === 0) return null;
  const top = intel.risingStars[0];
  return {
    id:        `rising-${(top.query || top.page || '').replace(/\s+/g, '-').slice(0, 40)}`,
    category:  'gsc' as Category,
    severity:  'celebrate' as Severity,
    title:     `"${top.query || top.page}" climbing — ${top.delta != null ? `+${top.delta} positions` : 'rising'}`,
    detail:    `${top.previous_position ? `From ${Number(top.previous_position).toFixed(1)} to ${Number(top.position || 0).toFixed(1)}` : 'Position improved this period'}. Worth noting in the recap.`,
    source: {
      kind:         'analytics_intel',
      label:        'Analytics intelligence',
      last_refresh: intel._refresh,
      table:        'project_knowledge.analytics_intel_bundle.risingStars',
    },
    action: {
      label:   'See trajectory',
      kind:    'chat_command' as const,
      payload: `show the 28-day trajectory for "${top.query || top.page}"`,
    },
    priority_score: 15,    // intentionally low — celebrations don't push out critical
    computed_at: new Date().toISOString(),
  };
}

/* ════════════════════════════════════════════════════════════════════
   SCORECARD BUILDER
══════════════════════════════════════════════════════════════════════ */

function buildScorecard(ctx: {
  attention: any;
  pillarReports: any[];
  pillarPanels: any[];
  campaigns: any[];
  opportunities: any[];
  integrations: any;
  gscQueries: any;
  analyticsIntel: any | null;
}): ScorecardCell[] {
  /* Health: 10 minus penalties */
  const criticalFindings = ctx.pillarReports.reduce((sum, r) =>
    sum + (Array.isArray(r.findings) ? r.findings.filter((f: any) => f.severity === 'critical').length : 0), 0);
  const warningFindings = ctx.pillarReports.reduce((sum, r) =>
    sum + (Array.isArray(r.findings) ? r.findings.filter((f: any) => f.severity === 'warning').length : 0), 0);
  const overdueRechecks = ctx.pillarPanels.filter(p => p.next_recheck_at && new Date(p.next_recheck_at).getTime() < Date.now()).length;
  const healthPenalty = (criticalFindings * 1.0) + (warningFindings * 0.3) + (overdueRechecks * 0.5);
  const healthRaw = Math.max(0, 10 - healthPenalty);
  const health = Math.round(healthRaw * 10) / 10;

  /* Velocity: campaigns + pillar runs in last 7 days */
  const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const campaignsLastWeek = ctx.campaigns.filter(c => new Date(c.updated_at || 0).getTime() > weekAgoMs).length;
  const pillarRunsLastWeek = ctx.pillarReports.filter(r => new Date(r.generated_at || 0).getTime() > weekAgoMs).length;
  const velocity = campaignsLastWeek + pillarRunsLastWeek;

  /* Quality: % of pillar reports with no critical findings */
  const totalReports = ctx.pillarReports.length;
  const cleanReports = ctx.pillarReports.filter(r =>
    !Array.isArray(r.findings) || !r.findings.some((f: any) => f.severity === 'critical')).length;
  const qualityPct = totalReports > 0 ? Math.round((cleanReports / totalReports) * 100) : 0;

  /* Risk: warnings + stale integrations + overdue rechecks */
  const staleIntegrations = [ctx.integrations.gsc, ctx.integrations.ga4]
    .filter(i => i && i.last_pull_at && daysBetween(i.last_pull_at, new Date().toISOString()) > 7).length;
  const risk = warningFindings + staleIntegrations + overdueRechecks;

  /* ROI hint: # of recoverable opportunities */
  const recoverableCount = (ctx.gscQueries?.queries || []).filter((q: any) =>
    q && (q.impressions || 0) >= 20 && (q.position || 99) >= 10 && (q.position || 0) <= 30).length;

  return [
    {
      key:             'health',
      label:           'Health',
      value:           `${health.toFixed(1)}/10`,
      numeric_value:   health,
      delta_this_week: null,
      delta_label:     totalReports > 0 ? `${criticalFindings} critical · ${warningFindings} warning` : 'no pillar reports yet',
      sparkline:       null,
      contributing:    [
        `${criticalFindings} critical pillar findings`,
        `${warningFindings} warning pillar findings`,
        `${overdueRechecks} overdue rechecks`,
      ],
    },
    {
      key:             'velocity',
      label:           'Velocity',
      value:           `${velocity}`,
      numeric_value:   velocity,
      delta_this_week: null,
      delta_label:     `last 7 days`,
      sparkline:       null,
      contributing:    [
        `${campaignsLastWeek} campaign updates this week`,
        `${pillarRunsLastWeek} pillar runs this week`,
      ],
    },
    {
      key:             'quality',
      label:           'Quality',
      value:           totalReports > 0 ? `${qualityPct}%` : 'n/a',
      numeric_value:   qualityPct,
      delta_this_week: null,
      delta_label:     `${cleanReports}/${totalReports} reports clean`,
      sparkline:       null,
      contributing:    [
        totalReports > 0
          ? `${cleanReports} of ${totalReports} reports have no critical findings`
          : 'No pillar reports in the last 2 weeks',
      ],
    },
    {
      key:             'risk',
      label:           'Risk',
      value:           risk >= 8 ? 'High' : risk >= 4 ? 'Medium' : risk >= 1 ? 'Low' : 'Clean',
      numeric_value:   risk,
      delta_this_week: null,
      delta_label:     `${risk} risk signals`,
      sparkline:       null,
      contributing:    [
        `${warningFindings} warning findings`,
        `${staleIntegrations} stale integration${staleIntegrations === 1 ? '' : 's'}`,
        `${overdueRechecks} overdue recheck${overdueRechecks === 1 ? '' : 's'}`,
      ],
    },
    {
      key:             'roi_hint',
      label:           'ROI Hint',
      value:           `${recoverableCount}`,
      numeric_value:   recoverableCount,
      delta_this_week: null,
      delta_label:     `recoverable opps · ${ctx.opportunities.length} inbox`,
      sparkline:       null,
      contributing:    [
        `${recoverableCount} GSC queries in recoverable zone (pos 10–30, ≥20 imp/mo)`,
        `${ctx.opportunities.length} opportunities pending in inbox`,
      ],
    },
  ];
}

/* ════════════════════════════════════════════════════════════════════
   SCORING + HELPERS
══════════════════════════════════════════════════════════════════════ */

function scoreItem(severity: Severity, daysOld: number, impactWeight: number): number {
  const sevW: Record<Severity, number> = { critical: 100, warning: 60, info: 20, celebrate: 15 };
  let recencyW = 1.0;
  if (daysOld <= 0) recencyW = 1.0;
  else if (daysOld <= 3) recencyW = 0.85;
  else if (daysOld <= 7) recencyW = 0.65;
  else if (daysOld <= 30) recencyW = 0.40;
  else recencyW = 0.15;
  return Math.round(sevW[severity] * recencyW * impactWeight);
}

function daysBetween(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (isNaN(t1) || isNaN(t2)) return 0;
  return Math.max(0, Math.floor((t2 - t1) / (1000 * 60 * 60 * 24)));
}

function humanPillarKind(kind: string): string {
  const map: Record<string, string> = {
    technical_audit:  'Technical Audit',
    cluster_map:      'Cluster Map',
    internal_linking: 'Internal Linking',
    off_page:         'Off-Page',
    monitoring:       'Monitoring',
  };
  return map[kind] || kind.replace(/_/g, ' ');
}

function pillarPath(kind: string): string {
  const map: Record<string, string> = {
    technical_audit:  '/audit',
    cluster_map:      '/playground',
    internal_linking: '/playground',
    off_page:         '/playground',
    monitoring:       '/dashboard',
  };
  return map[kind] || '/dashboard';
}
