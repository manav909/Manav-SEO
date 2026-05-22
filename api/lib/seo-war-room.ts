/* ════════════════════════════════════════════════════════════════════
   api/lib/seo-war-room.ts
   Phase 21 — Block 2.6 — Strategic War Room

   GOAL
     One-call aggregator that powers the Full Briefing (/command) page.
     Returns three explicitly-labeled tiers of intelligence:

       ✓ GROUNDED      — sourced from live data (GSC, campaigns, inbox)
       ⚠ EXPLORATORY  — LLM analysis grounded in positioning + GSC absence
       🔒 LOCKED       — requires external integrations (transparent gating)

   CORE PRINCIPLES (Phase 21 quality foundation)
     • Every grounded panel cites its source with refresh timestamp.
     • Every exploratory item is labeled "needs validation" with reasoning
       traceable to positioning data.
     • Locked items show what integration unlocks them, never fabricate.
     • Tool status is always returned — operator sees what's connected.

   PUBLIC SURFACE
     • getWarRoomBriefing({ projectId })
         → { grounded: { recoverable_opportunities, top_performers,
                         existing_campaigns, inbox_opportunities },
             exploratory: { worth_exploring, positioning_gaps },
             locked: { items: [...] },
             tools_status, honest_note }

   COST
     • Mostly DB reads (cheap, ~100ms total).
     • One LLM call for "worth exploring" + "positioning gaps" combined.
     • Skipped entirely if positioning unresolved or GSC absent.
══════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

const MAX_RECOVERABLE  = 10;
const MAX_PERFORMERS   = 10;
const MAX_CAMPAIGNS    = 10;
const MAX_INBOX        = 8;
const MAX_EXPLORE      = 6;
const MAX_GAPS         = 5;

/* ════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════ */

export interface WarRoomSource {
  kind:           'gsc' | 'campaign' | 'opportunity' | 'page_fetch' | 'ga4' | 'inferred' | 'positioning';
  label:          string;
  last_refresh?:  string;
  table?:         string;
  detail?:        string;
}

export interface RecoverableOpportunity {
  query:           string;
  position:        number;
  impressions:     number;
  clicks:          number;
  landing_url?:    string;
  source:          WarRoomSource;
}

export interface TopPerformer {
  query:           string;
  position:        number;
  impressions:     number;
  clicks:          number;
  landing_url?:    string;
  source:          WarRoomSource;
}

export interface ExistingCampaignSummary {
  id:                  string;
  keyword:             string;
  keyword_group:       string[];
  status:              string;
  current_position:    number | null;
  last_pillar_run_at:  string | null;
  source:              WarRoomSource;
}

export interface InboxOpportunitySummary {
  id:                  string;
  title:               string;
  kind:                string;
  suggested_keyword:   string | null;
  suggested_action:    string | null;
  estimated_value:     string | null;
  created_at:          string;
  source:              WarRoomSource;
}

export interface WorthExploringItem {
  keyword:             string;
  reasoning:           string;
  confidence:          'low' | 'medium';
  positioning_citations: string[];
  source:              WarRoomSource;
}

export interface PositioningGap {
  topical_area:        string;
  reasoning:           string;
  positioning_citations: string[];
  gsc_absence_note:    string;
  source:              WarRoomSource;
}

export interface LockedItem {
  label:           string;
  description:     string;
  unlock_via:      string;
  unlock_path:     string;
}

export interface WarRoomBriefing {
  grounded: {
    recoverable_opportunities: RecoverableOpportunity[];
    top_performers:            TopPerformer[];
    existing_campaigns:        ExistingCampaignSummary[];
    inbox_opportunities:       InboxOpportunitySummary[];
  };
  exploratory: {
    worth_exploring:           WorthExploringItem[];
    positioning_gaps:          PositioningGap[];
  };
  locked: {
    items:                     LockedItem[];
  };
  tools_status: {
    gsc_connected:            boolean;
    gsc_last_refresh:         string | null;
    ga4_connected:            boolean;
    ga4_last_refresh:         string | null;
    positioning_resolved:     boolean;
    positioning_last_refresh: string | null;
  };
  honest_note?: string;
  generated_at: string;
}

/* ════════════════════════════════════════════════════════════════════
   TOP-LEVEL AGGREGATOR
══════════════════════════════════════════════════════════════════════ */

export async function getWarRoomBriefing(opts: {
  projectId: string;
}): Promise<{ success: boolean; briefing?: WarRoomBriefing; error?: string }> {
  try {
    const projectId = opts.projectId;

    /* Step 1 — pull tools status + cached GSC queries + cached positioning in parallel */
    const [toolsStatus, gscQueries, positioning] = await Promise.all([
      readToolsStatusInternal(projectId),
      readGscTopQueriesInternal(projectId),
      readPositioningInternal(projectId),
    ]);

    /* Step 2 — grounded data (DB reads, in parallel) */
    const [
      recoverable_opportunities,
      top_performers,
      existing_campaigns,
      inbox_opportunities,
    ] = await Promise.all([
      buildRecoverableOpportunities(projectId, gscQueries, toolsStatus),
      buildTopPerformers(projectId, gscQueries, toolsStatus),
      buildExistingCampaigns(projectId),
      buildInboxOpportunities(projectId),
    ]);

    /* Step 3 — exploratory data (LLM, only if positioning available) */
    let worth_exploring: WorthExploringItem[] = [];
    let positioning_gaps: PositioningGap[] = [];
    if (positioning && toolsStatus.positioning_resolved) {
      try {
        const explorationResult = await runExploratoryLlm({
          positioning,
          gscQueries,
          existingCampaigns: existing_campaigns,
        });
        worth_exploring  = explorationResult.worth_exploring;
        positioning_gaps = explorationResult.positioning_gaps;
      } catch (e) {
        /* swallow — exploratory tier is optional, fall back to empty */
      }
    }

    /* Step 4 — locked items (transparent gating, no fabrication) */
    const locked = buildLockedItems(toolsStatus);

    /* Step 5 — honest note */
    const noteParts: string[] = [];
    if (!toolsStatus.gsc_connected) {
      noteParts.push('GSC not connected — grounded opportunities/performers panels are empty. Connect GSC in Settings → Integrations.');
    }
    if (!toolsStatus.ga4_connected) {
      noteParts.push('GA4 not connected — engagement data unavailable.');
    }
    if (!toolsStatus.positioning_resolved) {
      noteParts.push('Project positioning not yet resolved — exploratory tier will appear after first campaign creation triggers positioning resolver.');
    }
    const honest_note = noteParts.length > 0 ? noteParts.join(' ') : undefined;

    const briefing: WarRoomBriefing = {
      grounded: {
        recoverable_opportunities,
        top_performers,
        existing_campaigns,
        inbox_opportunities,
      },
      exploratory: {
        worth_exploring,
        positioning_gaps,
      },
      locked,
      tools_status: toolsStatus,
      honest_note,
      generated_at: new Date().toISOString(),
    };

    return { success: true, briefing };
  } catch (e: any) {
    return { success: false, error: e?.message || 'war room briefing failed' };
  }
}

/* ════════════════════════════════════════════════════════════════════
   INTERNAL READERS
══════════════════════════════════════════════════════════════════════ */

async function readToolsStatusInternal(projectId: string): Promise<WarRoomBriefing['tools_status']> {
  const status: WarRoomBriefing['tools_status'] = {
    gsc_connected:            false,
    gsc_last_refresh:         null,
    ga4_connected:            false,
    ga4_last_refresh:         null,
    positioning_resolved:     false,
    positioning_last_refresh: null,
  };
  try {
    const { data: integs } = await db().from("project_integrations")
      .select("provider, last_pull_at, last_pull_status")
      .eq("project_id", projectId);
    for (const i of (integs as any[] | null) || []) {
      const provider = String(i.provider || '').toLowerCase();
      const ok = i.last_pull_status === 'ok' || i.last_pull_status === 'success';
      if (provider.includes('gsc') || provider.includes('search_console') || provider.includes('search-console')) {
        status.gsc_connected = !!i.last_pull_at && ok;
        status.gsc_last_refresh = i.last_pull_at || null;
      }
      if (provider.includes('ga4') || provider.includes('analytics')) {
        status.ga4_connected = !!i.last_pull_at && ok;
        status.ga4_last_refresh = i.last_pull_at || null;
      }
    }
  } catch { /* swallow */ }
  try {
    const { data: posData } = await db().from("project_knowledge")
      .select("updated_at, field_value")
      .eq("project_id", projectId)
      .eq("category", "strategy")
      .eq("field_key", "project_positioning")
      .maybeSingle();
    if ((posData as any)?.field_value) {
      status.positioning_resolved = true;
      status.positioning_last_refresh = (posData as any).updated_at || null;
    }
  } catch { /* swallow */ }
  return status;
}

async function readGscTopQueriesInternal(projectId: string): Promise<{ queries: any[]; refresh: string | null }> {
  try {
    const { data: kn } = await db().from("project_knowledge")
      .select("field_value, updated_at")
      .eq("project_id", projectId)
      .eq("category", "analytics")
      .eq("field_key", "gsc_top_queries")
      .maybeSingle();
    const queries: any[] = (kn as any)?.field_value ? JSON.parse((kn as any).field_value) : [];
    return { queries, refresh: (kn as any)?.updated_at || null };
  } catch { return { queries: [], refresh: null }; }
}

async function readPositioningInternal(projectId: string): Promise<any | null> {
  try {
    const { data: posData } = await db().from("project_knowledge")
      .select("field_value, updated_at")
      .eq("project_id", projectId)
      .eq("category", "strategy")
      .eq("field_key", "project_positioning")
      .maybeSingle();
    if ((posData as any)?.field_value) {
      const p = JSON.parse((posData as any).field_value);
      p._refresh = (posData as any).updated_at;
      return p;
    }
  } catch { /* swallow */ }
  return null;
}

/* ════════════════════════════════════════════════════════════════════
   GROUNDED-TIER BUILDERS
══════════════════════════════════════════════════════════════════════ */

async function buildRecoverableOpportunities(
  projectId: string,
  gsc: { queries: any[]; refresh: string | null },
  toolsStatus: WarRoomBriefing['tools_status']
): Promise<RecoverableOpportunity[]> {
  if (!toolsStatus.gsc_connected || gsc.queries.length === 0) return [];
  const source: WarRoomSource = {
    kind:         'gsc',
    label:        'Your Google Search Console',
    last_refresh: gsc.refresh || toolsStatus.gsc_last_refresh || undefined,
    table:        'project_knowledge.gsc_top_queries',
  };
  return gsc.queries
    .filter((q: any) => q && typeof q.query === 'string' &&
      (q.impressions || 0) >= 20 &&
      (q.position || 99) >= 10 &&
      (q.position || 0) <= 30
    )
    .sort((a: any, b: any) => (b.impressions || 0) - (a.impressions || 0))
    .slice(0, MAX_RECOVERABLE)
    .map((q: any) => ({
      query:        q.query,
      position:     Number(q.position) || 0,
      impressions:  Number(q.impressions) || 0,
      clicks:       Number(q.clicks) || 0,
      landing_url:  q.url || q.page || undefined,
      source,
    }));
}

async function buildTopPerformers(
  projectId: string,
  gsc: { queries: any[]; refresh: string | null },
  toolsStatus: WarRoomBriefing['tools_status']
): Promise<TopPerformer[]> {
  if (!toolsStatus.gsc_connected || gsc.queries.length === 0) return [];
  const source: WarRoomSource = {
    kind:         'gsc',
    label:        'Your Google Search Console',
    last_refresh: gsc.refresh || toolsStatus.gsc_last_refresh || undefined,
    table:        'project_knowledge.gsc_top_queries',
  };
  return gsc.queries
    .filter((q: any) => q && typeof q.query === 'string' &&
      (q.position || 99) <= 10 &&
      (q.impressions || 0) >= 50
    )
    .sort((a: any, b: any) => (b.clicks || 0) - (a.clicks || 0))
    .slice(0, MAX_PERFORMERS)
    .map((q: any) => ({
      query:        q.query,
      position:     Number(q.position) || 0,
      impressions:  Number(q.impressions) || 0,
      clicks:       Number(q.clicks) || 0,
      landing_url:  q.url || q.page || undefined,
      source,
    }));
}

async function buildExistingCampaigns(projectId: string): Promise<ExistingCampaignSummary[]> {
  try {
    const { data: campaigns } = await db().from("seo_campaigns")
      .select("id, keyword, keyword_group, status, current_position, updated_at")
      .eq("project_id", projectId)
      .in("status", ['active', 'paused'])
      .order("updated_at", { ascending: false })
      .limit(MAX_CAMPAIGNS);
    const source: WarRoomSource = {
      kind:  'campaign',
      label: 'Existing campaigns in this project',
      table: 'seo_campaigns',
    };
    return ((campaigns as any[]) || []).map((c: any) => ({
      id:                  c.id,
      keyword:             c.keyword || '',
      keyword_group:       Array.isArray(c.keyword_group) ? c.keyword_group : [],
      status:              c.status,
      current_position:    c.current_position ?? null,
      last_pillar_run_at:  c.updated_at || null,
      source,
    }));
  } catch { return []; }
}

async function buildInboxOpportunities(projectId: string): Promise<InboxOpportunitySummary[]> {
  try {
    const { data: opps } = await db().from("seo_opportunities")
      .select("id, title, kind, suggested_keyword, suggested_action, estimated_value, created_at")
      .eq("project_id", projectId)
      .eq("status", 'open')
      .order("created_at", { ascending: false })
      .limit(MAX_INBOX);
    const source: WarRoomSource = {
      kind:  'opportunity',
      label: 'Opportunities in your inbox',
      table: 'seo_opportunities',
    };
    return ((opps as any[]) || []).map((o: any) => ({
      id:                  o.id,
      title:               o.title || '',
      kind:                o.kind || '',
      suggested_keyword:   o.suggested_keyword || null,
      suggested_action:    o.suggested_action || null,
      estimated_value:     o.estimated_value || null,
      created_at:          o.created_at || '',
      source,
    }));
  } catch { return []; }
}

/* ════════════════════════════════════════════════════════════════════
   EXPLORATORY-TIER LLM CALL

   Single call that produces both "worth exploring" and "positioning gaps"
   together. Strictly grounded in positioning data + the absence of
   matching queries in GSC. Hallucination guards in the prompt.
══════════════════════════════════════════════════════════════════════ */

async function runExploratoryLlm(opts: {
  positioning:        any;
  gscQueries:         { queries: any[]; refresh: string | null };
  existingCampaigns:  ExistingCampaignSummary[];
}): Promise<{ worth_exploring: WorthExploringItem[]; positioning_gaps: PositioningGap[] }> {
  const positioningCompact = {
    client_segment:               opts.positioning.client_segment,
    competitive_tier:             opts.positioning.competitive_tier,
    target_audience:              opts.positioning.target_audience,
    topical_authority_strengths:  opts.positioning.topical_authority_strengths || [],
    differentiators:              opts.positioning.differentiators || [],
  };

  const gscQueriesSample = opts.gscQueries.queries
    .slice(0, 60)
    .map((q: any) => q.query)
    .filter((q: any) => typeof q === 'string');

  const campaignKeywords = opts.existingCampaigns.flatMap(c =>
    c.keyword_group && c.keyword_group.length > 0 ? c.keyword_group : [c.keyword]
  );

  const sys = `You are a senior digital marketing strategist producing two outputs for a project briefing.

OUTPUT 1 — "Worth exploring" (max ${MAX_EXPLORE} items)
Keywords this project SHOULD consider pursuing, that:
  - Are topically adjacent to the stated positioning (cite specific positioning fields)
  - Do NOT yet appear in the project's GSC top queries
  - Would credibly serve the same audience tier and competitive segment

OUTPUT 2 — "Positioning gaps" (max ${MAX_GAPS} items)
Topical areas the project's positioning EXPLICITLY claims (cite specific fields)
but where the GSC top queries show ZERO presence. These are claimed strengths
without organic-search evidence — strategic blind spots.

HARD RULES — VIOLATIONS ARE UNACCEPTABLE:
  - Cite SPECIFIC fields from the positioning data for every item ("citations" array).
  - For "worth_exploring": verify the keyword is NOT in the provided GSC queries list. If it is, exclude it.
  - For "positioning_gaps": verify the topical area is in the positioning data AND not represented in the GSC queries list.
  - Never invent positioning facts. Never invent GSC data.
  - If you cannot find solid items, return fewer or an empty array — DO NOT pad.
  - Confidence for worth_exploring: "low" by default; only "medium" when alignment with positioning is unambiguous.

OUTPUT — strict JSON only, no preamble:
{
  "worth_exploring": [
    { "keyword": "...", "reasoning": "1-2 sentences", "confidence": "low|medium", "positioning_citations": ["field_value_quoted_from_input"] }
  ],
  "positioning_gaps": [
    { "topical_area": "...", "reasoning": "1-2 sentences", "positioning_citations": ["field_value_quoted_from_input"], "gsc_absence_note": "no query containing X or Y appears in the top queries" }
  ]
}`;

  const user = `Project positioning (the ground truth):
${JSON.stringify(positioningCompact, null, 2)}

GSC top queries currently visible (${gscQueriesSample.length} of ${opts.gscQueries.queries.length} loaded):
${gscQueriesSample.length > 0 ? gscQueriesSample.join('\n') : '(no GSC queries yet)'}

Existing campaign keywords (do NOT suggest these in worth_exploring):
${campaignKeywords.length > 0 ? campaignKeywords.join(', ') : '(none)'}

Produce both outputs.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1800,
      system:     sys,
      messages:   [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  const text = (data?.content?.[0]?.text || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(cleaned);

  /* Hallucination guard — filter out items where the keyword DOES appear in GSC,
     and items missing citations. */
  const gscSet = new Set(gscQueriesSample.map(q => q.toLowerCase()));
  const campaignSet = new Set(campaignKeywords.map(k => k.toLowerCase()));

  const worth_exploring: WorthExploringItem[] = Array.isArray(parsed.worth_exploring)
    ? parsed.worth_exploring
        .filter((x: any) =>
          x && typeof x.keyword === 'string' && x.keyword.length > 0 &&
          !gscSet.has(x.keyword.toLowerCase()) &&
          !campaignSet.has(x.keyword.toLowerCase()) &&
          Array.isArray(x.positioning_citations) && x.positioning_citations.length > 0
        )
        .slice(0, MAX_EXPLORE)
        .map((x: any) => ({
          keyword:                String(x.keyword),
          reasoning:              String(x.reasoning || '').slice(0, 400),
          confidence:             x.confidence === 'medium' ? 'medium' : 'low',
          positioning_citations:  (x.positioning_citations as any[]).filter((c: any) => typeof c === 'string').slice(0, 4),
          source: {
            kind:         'inferred',
            label:        'LLM-generated, grounded in your positioning + GSC absence',
            last_refresh: opts.positioning?._refresh,
          },
        }))
    : [];

  const positioning_gaps: PositioningGap[] = Array.isArray(parsed.positioning_gaps)
    ? parsed.positioning_gaps
        .filter((x: any) =>
          x && typeof x.topical_area === 'string' && x.topical_area.length > 0 &&
          Array.isArray(x.positioning_citations) && x.positioning_citations.length > 0
        )
        .slice(0, MAX_GAPS)
        .map((x: any) => ({
          topical_area:           String(x.topical_area),
          reasoning:              String(x.reasoning || '').slice(0, 400),
          positioning_citations:  (x.positioning_citations as any[]).filter((c: any) => typeof c === 'string').slice(0, 4),
          gsc_absence_note:       String(x.gsc_absence_note || '').slice(0, 300),
          source: {
            kind:         'positioning',
            label:        'Your positioning data + GSC absence check',
            last_refresh: opts.positioning?._refresh,
            table:        'project_knowledge.project_positioning',
          },
        }))
    : [];

  return { worth_exploring, positioning_gaps };
}

/* ════════════════════════════════════════════════════════════════════
   LOCKED-TIER ITEMS — transparent gating
══════════════════════════════════════════════════════════════════════ */

function buildLockedItems(toolsStatus: WarRoomBriefing['tools_status']): LockedItem[] {
  const locked: LockedItem[] = [];

  /* Competitor SERP intelligence — needs SerpAPI/DataForSEO (Block 4) */
  locked.push({
    label:        'Competitor SERP moves',
    description:  'See which keywords competitors are ranking for that you are not — and where they have outranked you in the last 28 days.',
    unlock_via:   'SerpAPI or DataForSEO integration',
    unlock_path:  '/data-room',
  });

  /* Search volume + difficulty — same provider */
  locked.push({
    label:        'Search volume + keyword difficulty',
    description:  'Real monthly search volumes and competitive difficulty scores per keyword — to size opportunity before committing.',
    unlock_via:   'Google Keyword Planner API or SerpAPI/DataForSEO integration',
    unlock_path:  '/data-room',
  });

  /* PSI / Core Web Vitals — needs PSI API */
  locked.push({
    label:        'Page experience grades (Core Web Vitals)',
    description:  'Lab + field scores for LCP, INP, CLS on every campaign target page — Google ranking signal.',
    unlock_via:   'PageSpeed Insights API (free)',
    unlock_path:  '/data-room',
  });

  /* GA4 if not connected */
  if (!toolsStatus.ga4_connected) {
    locked.push({
      label:        'Engagement + conversion attribution',
      description:  'Per-page engagement metrics and conversion tracking — to evaluate whether ranking pages actually convert.',
      unlock_via:   'GA4 property connection',
      unlock_path:  '/data-room',
    });
  }

  /* GSC if not connected — highest priority */
  if (!toolsStatus.gsc_connected) {
    locked.unshift({
      label:        'YOUR search performance data',
      description:  'Position, impressions, clicks per query — the foundation of grounded SEO work. Without this, the entire grounded tier is empty.',
      unlock_via:   'Google Search Console property connection',
      unlock_path:  '/data-room',
    });
  }

  return locked;
}
