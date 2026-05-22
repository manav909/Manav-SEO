/* ════════════════════════════════════════════════════════════════════
   api/lib/season-war-room-extras.ts
   Phase 21 — Block 2.11 Pass 1 — Real panels (no placeholders)

   Aggregators for the panels that ProjectPulse renders:
     • getPillarHealthMatrix     — 6 cards, one per pillar
     • getPerformancePulse       — top performers + falling stars + movers
     • getDecisionsLog           — cross-campaign decisions_avoided
     • getVelocityStats          — this week vs last week
     • getNoticedObservations    — LLM pre-compute, cached 12h
     • getCasualDigest           — editorial digest for Casual mode

   All return shapes are stable, defensive-default arrays so the frontend
   never has to null-check sub-fields.
══════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

/* ════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════ */

export interface PillarHealthCard {
  kind:                'technical_audit' | 'cluster_map' | 'internal_linking' | 'off_page' | 'monitoring' | 'inbox';
  label:               string;
  last_run:            string | null;
  last_run_relative:   string | null;
  status:              'fresh' | 'aging' | 'overdue' | 'failed' | 'never_run';
  critical_findings:   number;
  warning_findings:    number;
  info_findings:       number;
  next_recheck_at:     string | null;
  next_recheck_label:  string | null;
  campaign_count:      number;
  action_path:         string;
}

export interface PerformancePulseItem {
  query:                string;
  current_position:     number;
  previous_position:    number | null;
  delta:                number | null;
  impressions:          number;
  clicks:               number;
  trend:                'rising' | 'falling' | 'stable' | 'unknown';
  landing_url?:         string;
}

export interface PerformancePulse {
  top_performers:       PerformancePulseItem[];
  rising_stars:         PerformancePulseItem[];
  falling_stars:        PerformancePulseItem[];
  source_label:         string;
  source_refreshed:     string | null;
}

export interface DecisionLogEntry {
  id:                   string;
  campaign_id:          string;
  campaign_keyword:     string;
  timestamp:            string;
  decision_type:        string;
  original_intent:      string;
  redirected_to:        string | null;
  reasoning:            string;
}

export interface VelocityStats {
  this_week: {
    campaigns_updated:   number;
    pillar_runs:         number;
    opportunities_open:  number;
    decisions_avoided:   number;
  };
  last_week: {
    campaigns_updated:   number;
    pillar_runs:         number;
    opportunities_open:  number;
    decisions_avoided:   number;
  };
  deltas: {
    campaigns_updated:   number;
    pillar_runs:         number;
    opportunities_open:  number;
    decisions_avoided:   number;
  };
}

export interface NoticedObservation {
  id:                   string;
  observation:          string;          // 1-2 sentence quiet observation
  reasoning:            string;          // why we noticed (grounded in data)
  sources:              string[];        // which data fields support it
  suggested_action:     string | null;   // optional chat command to fire
}

export interface CasualDigestItem {
  id:                   string;
  kind:                 'pillar_finding' | 'trend' | 'opportunity' | 'observation';
  headline:             string;          // editorial headline
  body:                 string;          // 1-2 sentences
  source_label:         string;
  source_refreshed:     string | null;
  suggested_action:     {
    label:   string;
    kind:    'chat_command' | 'navigate';
    payload: any;
  } | null;
}

export interface CasualDigest {
  pick_of_the_day:      CasualDigestItem | null;     // the Season editorial pick
  in_your_world:        CasualDigestItem[];          // 4-6 items
  generated_at:         string;
}

/* ════════════════════════════════════════════════════════════════════
   PILLAR HEALTH MATRIX
══════════════════════════════════════════════════════════════════════ */

export async function getPillarHealthMatrix(opts: { projectId: string }): Promise<{
  success: boolean; cards?: PillarHealthCard[]; error?: string;
}> {
  try {
    const projectId = opts.projectId;

    const [campaigns, reports, panels, inboxOpps] = await Promise.all([
      readProjectCampaigns(projectId),
      readRecentReports(projectId),
      readProjectPanels(projectId),
      readOpenOpportunities(projectId),
    ]);

    const kinds: PillarHealthCard['kind'][] = [
      'technical_audit', 'cluster_map', 'internal_linking', 'off_page', 'monitoring',
    ];

    const now = Date.now();
    const cards: PillarHealthCard[] = kinds.map(kind => {
      const kindReports = reports.filter(r => r.kind === kind);
      const latest = kindReports[0];
      const kindPanels = panels.filter(p => p.kind === kind);
      const overduePanel = kindPanels.find(p => p.next_recheck_at && new Date(p.next_recheck_at).getTime() < now);
      const upcomingPanel = kindPanels
        .filter(p => p.next_recheck_at && new Date(p.next_recheck_at).getTime() >= now)
        .sort((a, b) => new Date(a.next_recheck_at!).getTime() - new Date(b.next_recheck_at!).getTime())[0];

      const findings = Array.isArray(latest?.findings) ? latest!.findings : [];
      const critical = findings.filter((f: any) => f?.severity === 'critical').length;
      const warning  = findings.filter((f: any) => f?.severity === 'warning').length;
      const info     = findings.filter((f: any) => f?.severity === 'info').length;

      let status: PillarHealthCard['status'];
      if (!latest) status = 'never_run';
      else if (latest.status === 'failed' || latest.error_message) status = 'failed';
      else if (overduePanel) status = 'overdue';
      else if (latest && daysBetween(latest.generated_at, new Date().toISOString()) > 14) status = 'aging';
      else status = 'fresh';

      const nextPanel = overduePanel || upcomingPanel;
      return {
        kind,
        label:               humanPillarKind(kind),
        last_run:            latest?.generated_at || null,
        last_run_relative:   latest?.generated_at ? relativeTime(latest.generated_at) : null,
        status,
        critical_findings:   critical,
        warning_findings:    warning,
        info_findings:       info,
        next_recheck_at:     nextPanel?.next_recheck_at || null,
        next_recheck_label:  nextPanel?.next_recheck_at ? relativeTime(nextPanel.next_recheck_at) : null,
        campaign_count:      campaigns.filter(c => kindPanels.some(p => p.campaign_id === c.id)).length || campaigns.length,
        action_path:         pillarPath(kind),
      };
    });

    /* Inbox card — derived differently (no pillar_reports rows) */
    const inboxCard: PillarHealthCard = {
      kind:                'inbox',
      label:               'Opportunities Inbox',
      last_run:            inboxOpps[0]?.created_at || null,
      last_run_relative:   inboxOpps[0]?.created_at ? relativeTime(inboxOpps[0].created_at) : null,
      status:              inboxOpps.length > 10 ? 'overdue' : inboxOpps.length > 0 ? 'fresh' : 'never_run',
      critical_findings:   inboxOpps.filter(o => (o.severity || '').toLowerCase() === 'critical').length,
      warning_findings:    inboxOpps.filter(o => (o.severity || '').toLowerCase() === 'warning').length,
      info_findings:       inboxOpps.filter(o => !o.severity || o.severity === 'info').length,
      next_recheck_at:     null,
      next_recheck_label:  null,
      campaign_count:      inboxOpps.length,
      action_path:         '/launchpad',
    };
    cards.push(inboxCard);

    return { success: true, cards };
  } catch (e: any) {
    return { success: false, error: e?.message || 'pillar matrix failed' };
  }
}

/* ════════════════════════════════════════════════════════════════════
   PERFORMANCE PULSE
══════════════════════════════════════════════════════════════════════ */

export async function getPerformancePulse(opts: { projectId: string }): Promise<{
  success: boolean; pulse?: PerformancePulse; error?: string;
}> {
  try {
    const projectId = opts.projectId;
    const [gscTop, intel] = await Promise.all([
      readGscTopQueries(projectId),
      readAnalyticsIntel(projectId),
    ]);

    /* Top performers: top 5 by clicks where position ≤ 10 */
    const top_performers: PerformancePulseItem[] = (gscTop.queries || [])
      .filter((q: any) => q && (q.position || 99) <= 10 && (q.clicks || 0) >= 1)
      .sort((a: any, b: any) => (b.clicks || 0) - (a.clicks || 0))
      .slice(0, 5)
      .map((q: any) => ({
        query:             q.query || '',
        current_position:  Number(q.position || 0),
        previous_position: null,
        delta:             null,
        impressions:       Number(q.impressions || 0),
        clicks:            Number(q.clicks || 0),
        trend:             'stable',
        landing_url:       q.landing_url || undefined,
      }));

    /* Rising + falling from intel bundle */
    const risingRaw: any[] = Array.isArray(intel?.risingStars) ? intel!.risingStars : [];
    const fallingRaw: any[] = Array.isArray(intel?.fallingStars) ? intel!.fallingStars : [];

    const rising_stars: PerformancePulseItem[] = risingRaw.slice(0, 5).map(s => ({
      query:             s.query || s.page || '',
      current_position:  Number(s.position || 0),
      previous_position: s.previous_position != null ? Number(s.previous_position) : null,
      delta:             s.delta != null ? Number(s.delta) : null,
      impressions:       Number(s.impressions || 0),
      clicks:            Number(s.clicks || 0),
      trend:             'rising',
      landing_url:       s.landing_url || s.page || undefined,
    }));

    const falling_stars: PerformancePulseItem[] = fallingRaw.slice(0, 5).map(s => ({
      query:             s.query || s.page || '',
      current_position:  Number(s.position || 0),
      previous_position: s.previous_position != null ? Number(s.previous_position) : null,
      delta:             s.delta != null ? Number(s.delta) : null,
      impressions:       Number(s.impressions || 0),
      clicks:            Number(s.clicks || 0),
      trend:             'falling',
      landing_url:       s.landing_url || s.page || undefined,
    }));

    return {
      success: true,
      pulse: {
        top_performers,
        rising_stars,
        falling_stars,
        source_label:     'Google Search Console + Analytics intelligence',
        source_refreshed: gscTop.refresh || intel?._refresh || null,
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'performance pulse failed' };
  }
}

/* ════════════════════════════════════════════════════════════════════
   DECISIONS LOG
══════════════════════════════════════════════════════════════════════ */

export async function getDecisionsLog(opts: { projectId: string; limit?: number }): Promise<{
  success: boolean; entries?: DecisionLogEntry[]; total?: number; error?: string;
}> {
  try {
    const projectId = opts.projectId;
    const limit = Math.min(opts.limit || 5, 50);

    const { data } = await db().from("seo_campaigns")
      .select("id, keyword, decisions_avoided")
      .eq("project_id", projectId);

    const entries: DecisionLogEntry[] = [];
    for (const c of (data as any[] || [])) {
      const decisions = Array.isArray(c.decisions_avoided) ? c.decisions_avoided : [];
      for (const d of decisions) {
        if (!d) continue;
        entries.push({
          id:               `${c.id}-${d.timestamp || ''}-${entries.length}`,
          campaign_id:      c.id,
          campaign_keyword: c.keyword || '',
          timestamp:        d.timestamp || new Date(0).toISOString(),
          decision_type:    d.decision_type || 'unknown',
          original_intent:  d.original_intent || '',
          redirected_to:    d.redirected_to || null,
          reasoning:        d.reasoning || '',
        });
      }
    }
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return { success: true, entries: entries.slice(0, limit), total: entries.length };
  } catch (e: any) {
    return { success: false, error: e?.message || 'decisions log failed' };
  }
}

/* ════════════════════════════════════════════════════════════════════
   VELOCITY STATS
══════════════════════════════════════════════════════════════════════ */

export async function getVelocityStats(opts: { projectId: string }): Promise<{
  success: boolean; stats?: VelocityStats; error?: string;
}> {
  try {
    const projectId = opts.projectId;
    const now = Date.now();
    const weekAgo     = new Date(now - 7 * 86400000).toISOString();
    const twoWeeksAgo = new Date(now - 14 * 86400000).toISOString();

    const projectCampaignIds = await getProjectCampaignIds(projectId);
    const idArray = Array.from(projectCampaignIds);

    /* Campaigns updated */
    const { data: campaignsThisWeek } = await db().from("seo_campaigns")
      .select("id, updated_at, decisions_avoided")
      .eq("project_id", projectId)
      .gte("updated_at", weekAgo);
    const { data: campaignsLastWeek } = await db().from("seo_campaigns")
      .select("id, updated_at")
      .eq("project_id", projectId)
      .gte("updated_at", twoWeeksAgo)
      .lt("updated_at", weekAgo);

    /* Pillar runs */
    let pillarRunsThis = 0, pillarRunsLast = 0;
    if (idArray.length > 0) {
      const { data: pillarsThisWeek } = await db().from("pillar_reports")
        .select("id, generated_at")
        .in("campaign_id", idArray)
        .gte("generated_at", weekAgo);
      const { data: pillarsLastWeek } = await db().from("pillar_reports")
        .select("id, generated_at")
        .in("campaign_id", idArray)
        .gte("generated_at", twoWeeksAgo)
        .lt("generated_at", weekAgo);
      pillarRunsThis = (pillarsThisWeek as any[] || []).length;
      pillarRunsLast = (pillarsLastWeek as any[] || []).length;
    }

    /* Opportunities open snapshot — no historical state in DB, so use created_at */
    const { data: oppsThisWeek } = await db().from("seo_opportunities")
      .select("id, created_at")
      .eq("project_id", projectId)
      .eq("status", "open")
      .gte("created_at", weekAgo);
    const { data: oppsLastWeek } = await db().from("seo_opportunities")
      .select("id, created_at")
      .eq("project_id", projectId)
      .eq("status", "open")
      .gte("created_at", twoWeeksAgo)
      .lt("created_at", weekAgo);

    /* Decisions avoided count this week */
    let decisionsThis = 0, decisionsLast = 0;
    for (const c of (campaignsThisWeek as any[] || [])) {
      const d = Array.isArray(c.decisions_avoided) ? c.decisions_avoided : [];
      decisionsThis += d.filter((x: any) => x?.timestamp && new Date(x.timestamp).getTime() >= now - 7 * 86400000).length;
    }
    /* Approximate last week decisions — without historical snapshots this is an estimate */
    const { data: allCampaignsForDecisions } = await db().from("seo_campaigns")
      .select("id, decisions_avoided")
      .eq("project_id", projectId);
    for (const c of (allCampaignsForDecisions as any[] || [])) {
      const d = Array.isArray(c.decisions_avoided) ? c.decisions_avoided : [];
      decisionsLast += d.filter((x: any) => {
        if (!x?.timestamp) return false;
        const t = new Date(x.timestamp).getTime();
        return t >= now - 14 * 86400000 && t < now - 7 * 86400000;
      }).length;
    }

    const this_week = {
      campaigns_updated:  (campaignsThisWeek as any[] || []).length,
      pillar_runs:        pillarRunsThis,
      opportunities_open: (oppsThisWeek as any[] || []).length,
      decisions_avoided:  decisionsThis,
    };
    const last_week = {
      campaigns_updated:  (campaignsLastWeek as any[] || []).length,
      pillar_runs:        pillarRunsLast,
      opportunities_open: (oppsLastWeek as any[] || []).length,
      decisions_avoided:  decisionsLast,
    };
    const deltas = {
      campaigns_updated:  this_week.campaigns_updated - last_week.campaigns_updated,
      pillar_runs:        this_week.pillar_runs - last_week.pillar_runs,
      opportunities_open: this_week.opportunities_open - last_week.opportunities_open,
      decisions_avoided:  this_week.decisions_avoided - last_week.decisions_avoided,
    };

    return { success: true, stats: { this_week, last_week, deltas } };
  } catch (e: any) {
    return { success: false, error: e?.message || 'velocity stats failed' };
  }
}

/* ════════════════════════════════════════════════════════════════════
   I NOTICED — LLM pre-compute, cached 12h per project
══════════════════════════════════════════════════════════════════════ */

const NOTICED_CACHE_KEY = 'war_room_noticed_observations';
const NOTICED_TTL_HOURS = 12;

export async function getNoticedObservations(opts: { projectId: string; force?: boolean }): Promise<{
  success: boolean; observations?: NoticedObservation[]; cached_at?: string; error?: string;
}> {
  try {
    const projectId = opts.projectId;

    if (!opts.force) {
      const cached = await readCache(projectId, NOTICED_CACHE_KEY);
      if (cached && isCacheFresh(cached.cached_at, NOTICED_TTL_HOURS)) {
        return { success: true, observations: cached.observations || [], cached_at: cached.cached_at };
      }
    }

    /* Compose grounded context for the LLM from real project data */
    const [pillarReports, opps, integrations, intel, gsc, campaigns, panels] = await Promise.all([
      readRecentReports(projectId),
      readOpenOpportunities(projectId),
      readIntegrations(projectId),
      readAnalyticsIntel(projectId),
      readGscTopQueries(projectId),
      readProjectCampaigns(projectId),
      readProjectPanels(projectId),
    ]);

    const contextBullets: string[] = [];
    /* Inbox age */
    const old14d = opps.filter(o => daysBetween(o.created_at, new Date().toISOString()) > 14).length;
    if (old14d > 0) contextBullets.push(`${old14d} inbox opportunit${old14d === 1 ? 'y is' : 'ies are'} older than 14 days`);
    /* Pillar staleness */
    const overduePanels = panels.filter(p => p.next_recheck_at && new Date(p.next_recheck_at).getTime() < Date.now());
    for (const p of overduePanels.slice(0, 3)) {
      const days = daysBetween(p.next_recheck_at!, new Date().toISOString());
      contextBullets.push(`${humanPillarKind(p.kind)} recheck overdue by ${days} day${days === 1 ? '' : 's'}`);
    }
    /* GSC integration freshness */
    if (integrations.gsc?.last_pull_at) {
      const days = daysBetween(integrations.gsc.last_pull_at, new Date().toISOString());
      if (days > 7) contextBullets.push(`GSC pull is ${days} days stale`);
    }
    /* Cannibalization signals */
    if (Array.isArray(intel?.cannibalization) && intel!.cannibalization.length > 0) {
      contextBullets.push(`${intel!.cannibalization.length} cannibalization signal${intel!.cannibalization.length === 1 ? '' : 's'} detected in analytics intel`);
    }
    /* Falling stars */
    if (Array.isArray(intel?.fallingStars) && intel!.fallingStars.length > 0) {
      const worst = intel!.fallingStars[0];
      const delta = worst.delta != null ? Math.abs(Number(worst.delta)) : null;
      contextBullets.push(`"${worst.query || worst.page}" dropped${delta != null ? ` ${delta} positions` : ' significantly'}`);
    }
    /* Active campaign concentration */
    if (campaigns.length === 1) contextBullets.push(`Only 1 active campaign — consider expanding the priority set`);
    /* Recoverable opportunities */
    const recoverable = (gsc.queries || []).filter((q: any) => q && (q.impressions || 0) >= 20 && (q.position || 99) >= 10 && (q.position || 0) <= 30);
    if (recoverable.length >= 5) contextBullets.push(`${recoverable.length} keywords on page 2 with ≥20 imp/mo — recoverable signal is unusually rich`);

    /* Reports oldness */
    if (pillarReports.length === 0) contextBullets.push(`No pillar reports in the last 2 weeks — pillars may be stalled`);

    /* If no context, return a calm empty result */
    if (contextBullets.length === 0) {
      const observations: NoticedObservation[] = [];
      await writeCache(projectId, NOTICED_CACHE_KEY, { observations, cached_at: new Date().toISOString() });
      return { success: true, observations, cached_at: new Date().toISOString() };
    }

    /* Call LLM with the grounded context. If it fails or returns garbage,
       fall back to converting the bullets directly into NoticedObservations. */
    const observations = await callNoticedLLM(contextBullets) || synthesizeObservationsFromBullets(contextBullets);

    await writeCache(projectId, NOTICED_CACHE_KEY, { observations, cached_at: new Date().toISOString() });
    return { success: true, observations, cached_at: new Date().toISOString() };
  } catch (e: any) {
    return { success: false, error: e?.message || 'noticed observations failed' };
  }
}

async function callNoticedLLM(bullets: string[]): Promise<NoticedObservation[] | null> {
  try {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
    if (!ANTHROPIC_API_KEY) return null;

    const prompt = `You are a senior digital marketing strategist who quietly observes your client's SEO project state. Given the grounded facts below, write 2-3 short observations in the voice "I noticed…". Each must be:
- 1-2 sentences, calm, observational, not alarmist
- Grounded strictly in the facts provided — no speculation
- Conversational, like notes left on a desk for the operator

Return JSON with this exact shape, no surrounding markdown:
{ "observations": [ { "observation": "string", "reasoning": "string", "sources": ["string"], "suggested_action": "string or null" } ] }

FACTS:
${bullets.map(b => '- ' + b).join('\n')}

Return JSON only.`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 1500,
        messages:   [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const text = j?.content?.[0]?.text || '';
    if (!text) return null;
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed?.observations || !Array.isArray(parsed.observations)) return null;
    return parsed.observations.slice(0, 3).map((o: any, i: number): NoticedObservation => ({
      id:               `noticed-${i}-${Date.now()}`,
      observation:      String(o.observation || '').slice(0, 280),
      reasoning:        String(o.reasoning || '').slice(0, 200),
      sources:          Array.isArray(o.sources) ? o.sources.map(String).slice(0, 5) : [],
      suggested_action: o.suggested_action ? String(o.suggested_action).slice(0, 100) : null,
    }));
  } catch {
    return null;
  }
}

function synthesizeObservationsFromBullets(bullets: string[]): NoticedObservation[] {
  return bullets.slice(0, 3).map((b, i) => ({
    id:               `noticed-${i}-${Date.now()}`,
    observation:      `I noticed: ${b}.`,
    reasoning:        'Derived directly from project data.',
    sources:          [b],
    suggested_action: null,
  }));
}

/* ════════════════════════════════════════════════════════════════════
   CASUAL DIGEST — editorial reading surface (internal content)
══════════════════════════════════════════════════════════════════════ */

export async function getCasualDigest(opts: { projectId: string }): Promise<{
  success: boolean; digest?: CasualDigest; error?: string;
}> {
  try {
    const projectId = opts.projectId;
    const [reports, opps, intel, gsc, campaigns] = await Promise.all([
      readRecentReports(projectId),
      readOpenOpportunities(projectId),
      readAnalyticsIntel(projectId),
      readGscTopQueries(projectId),
      readProjectCampaigns(projectId),
    ]);

    const items: CasualDigestItem[] = [];

    /* Pillar findings reframed as editorial observations */
    for (const r of reports.slice(0, 3)) {
      const findings = Array.isArray(r.findings) ? r.findings : [];
      const critical = findings.find((f: any) => f?.severity === 'critical');
      if (critical) {
        items.push({
          id:           `pillar-${r.id}-${critical.id || ''}`,
          kind:         'pillar_finding',
          headline:     `${humanPillarKind(r.kind)}: ${critical.title || critical.description || 'critical finding'}`,
          body:         String(critical.description || critical.reasoning || '').slice(0, 220),
          source_label: `Last ${humanPillarKind(r.kind)} pillar run`,
          source_refreshed: r.generated_at,
          suggested_action: {
            label:   'Open report',
            kind:    'navigate',
            payload: pillarPath(r.kind),
          },
        });
      }
    }

    /* GSC trends reframed as "your trends" */
    const risingTop = Array.isArray(intel?.risingStars) && intel!.risingStars[0];
    if (risingTop) {
      items.push({
        id:           `trend-rise-${(risingTop as any).query || (risingTop as any).page}`,
        kind:         'trend',
        headline:     `"${(risingTop as any).query || (risingTop as any).page}" is climbing`,
        body:         `Picked up ${(risingTop as any).delta != null ? `${(risingTop as any).delta} positions` : 'noticeable movement'} this period. Worth a closer look at what's working.`,
        source_label: 'Analytics intelligence',
        source_refreshed: intel?._refresh || null,
        suggested_action: {
          label:   'See trajectory',
          kind:    'chat_command',
          payload: `show the 28-day trajectory for "${(risingTop as any).query || (risingTop as any).page}"`,
        },
      });
    }

    const fallingTop = Array.isArray(intel?.fallingStars) && intel!.fallingStars[0];
    if (fallingTop) {
      items.push({
        id:           `trend-fall-${(fallingTop as any).query || (fallingTop as any).page}`,
        kind:         'trend',
        headline:     `"${(fallingTop as any).query || (fallingTop as any).page}" slipped`,
        body:         `${(fallingTop as any).delta != null ? `Down ${Math.abs(Number((fallingTop as any).delta))} positions.` : 'A meaningful drop.'} Could be a content gap or a competitor moving — worth diagnosing.`,
        source_label: 'Analytics intelligence',
        source_refreshed: intel?._refresh || null,
        suggested_action: {
          label:   'Ask why',
          kind:    'chat_command',
          payload: `what happened to "${(fallingTop as any).query || (fallingTop as any).page}" — diagnose the position drop`,
        },
      });
    }

    /* Inbox opps reframed as "worth exploring" */
    for (const o of opps.slice(0, 2)) {
      items.push({
        id:           `opp-${o.id}`,
        kind:         'opportunity',
        headline:     o.title || 'Opportunity worth exploring',
        body:         `In your inbox · ${daysBetween(o.created_at, new Date().toISOString())} day${daysBetween(o.created_at, new Date().toISOString()) === 1 ? '' : 's'} old${o.estimated_value ? ` · ${o.estimated_value}` : ''}.`,
        source_label: 'Opportunities inbox',
        source_refreshed: o.created_at,
        suggested_action: o.suggested_keyword && o.suggested_action === 'new_campaign'
          ? { label: 'Start campaign', kind: 'chat_command' as const, payload: `rank me for "${o.suggested_keyword}"` }
          : { label: 'Open inbox',     kind: 'navigate'     as const, payload: '/launchpad' },
      });
    }

    /* Recoverable observations */
    const recoverable = (gsc.queries || []).filter((q: any) =>
      q && (q.impressions || 0) >= 20 && (q.position || 99) >= 10 && (q.position || 0) <= 30);
    if (recoverable.length >= 1) {
      const top = recoverable.sort((a: any, b: any) => (b.impressions || 0) - (a.impressions || 0))[0];
      items.push({
        id:           `recov-${top.query}`,
        kind:         'opportunity',
        headline:     `"${top.query}" is one shove from page 1`,
        body:         `Currently position ${Number(top.position).toFixed(1)} with ${top.impressions} impressions/month. The demand is already there.`,
        source_label: 'Google Search Console',
        source_refreshed: gsc.refresh,
        suggested_action: {
          label:   'Start campaign',
          kind:    'chat_command',
          payload: `rank me for "${top.query}"`,
        },
      });
    }

    /* Pick of the day — highest-severity item or first item */
    const pickPriority = items.find(i => i.kind === 'pillar_finding')
                      || items.find(i => i.kind === 'trend')
                      || items[0]
                      || null;
    const inYourWorld = items.filter(i => i.id !== pickPriority?.id).slice(0, 6);

    return {
      success: true,
      digest: {
        pick_of_the_day: pickPriority,
        in_your_world:   inYourWorld,
        generated_at:    new Date().toISOString(),
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'casual digest failed' };
  }
}

/* ════════════════════════════════════════════════════════════════════
   SHARED READERS (mirror of season-war-room.ts patterns)
══════════════════════════════════════════════════════════════════════ */

async function readProjectCampaigns(projectId: string): Promise<any[]> {
  try {
    const { data } = await db().from("seo_campaigns")
      .select("id, keyword, status, current_position, updated_at, decisions_avoided")
      .eq("project_id", projectId)
      .in("status", ['active', 'paused']);
    return data as any[] || [];
  } catch { return []; }
}

async function getProjectCampaignIds(projectId: string): Promise<Set<string>> {
  try {
    const { data } = await db().from("seo_campaigns").select("id").eq("project_id", projectId);
    return new Set((data as any[] || []).map(r => r.id));
  } catch { return new Set(); }
}

async function readRecentReports(projectId: string): Promise<any[]> {
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data } = await db().from("pillar_reports")
      .select("id, campaign_id, kind, status, findings, generated_at, error_message")
      .gte("generated_at", since)
      .order("generated_at", { ascending: false })
      .limit(80);
    const ids = await getProjectCampaignIds(projectId);
    return (data as any[] || []).filter(r => ids.has(r.campaign_id));
  } catch { return []; }
}

async function readProjectPanels(projectId: string): Promise<any[]> {
  try {
    const { data } = await db().from("seo_pillar_panels")
      .select("id, campaign_id, kind, next_recheck_at, last_report_at, status");
    const ids = await getProjectCampaignIds(projectId);
    return (data as any[] || []).filter(p => ids.has(p.campaign_id));
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

/* ════════════════════════════════════════════════════════════════════
   CACHE — uses project_knowledge with category='war_room_cache'
══════════════════════════════════════════════════════════════════════ */

async function readCache(projectId: string, key: string): Promise<any | null> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_value, updated_at")
      .eq("project_id", projectId)
      .eq("category", "war_room_cache")
      .eq("field_key", key)
      .maybeSingle();
    if (!(data as any)?.field_value) return null;
    return JSON.parse((data as any).field_value);
  } catch { return null; }
}

async function writeCache(projectId: string, key: string, value: any): Promise<void> {
  try {
    await db().from("project_knowledge").upsert({
      project_id:  projectId,
      category:    "war_room_cache",
      field_key:   key,
      field_value: JSON.stringify(value),
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'project_id,category,field_key' });
  } catch { /* swallow */ }
}

function isCacheFresh(cachedAt: string | undefined, ttlHours: number): boolean {
  if (!cachedAt) return false;
  const age = Date.now() - new Date(cachedAt).getTime();
  return age < ttlHours * 3600 * 1000;
}

/* ════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════ */

function daysBetween(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (isNaN(t1) || isNaN(t2)) return 0;
  return Math.max(0, Math.floor((t2 - t1) / 86400000));
}

function relativeTime(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60); if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);  if (hr < 24)  return `${hr}h ago`;
  const d = Math.floor(hr / 24);    if (d < 30)   return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function humanPillarKind(kind: string): string {
  const map: Record<string, string> = {
    technical_audit:  'Technical Audit',
    cluster_map:      'Cluster Map',
    internal_linking: 'Internal Linking',
    off_page:         'Off-Page',
    monitoring:       'Monitoring',
    inbox:            'Opportunities Inbox',
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
    inbox:            '/launchpad',
  };
  return map[kind] || '/dashboard';
}
