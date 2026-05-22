/* ════════════════════════════════════════════════════════════════════
   api/lib/seo-chat-suggestions.ts
   Phase 21 — Block 2.5 — Source-cited suggestions + exploration

   GOAL
     The chat is the first quality gate. This module provides:
       • Type-ahead suggestions grounded in real GSC data, existing
         campaigns, and the opportunities inbox — every suggestion cites
         its source.
       • Tool-availability awareness — when GSC/GA4 isn't connected,
         suggestions degrade gracefully with honest disclosures.
       • Exploration responses — when user is uncertain ("what about X?"),
         pull real GSC data + page positioning, produce a strategic read
         with cited sources, offer next-step options.

   CORE PRINCIPLES
     • Never fabricate suggestions. If no real signal exists, say so.
     • Cite the source on every claim ({ kind: 'gsc' | 'campaign' |
       'opportunity' | 'page_fetch', last_refresh: '...' }).
     • Order suggestions by user value: existing campaigns first
       (prevent duplicates), then GSC opportunities (gaps to fill),
       then GSC top performers (extend what works).

   PUBLIC SURFACE
     • getCampaignSuggestions({ projectId, partialInput })
         → returns { suggestions[], tools_status, honest_note? }
     • produceExplorationResponse({ projectId, keyword })
         → returns structured response with real data + strategic read
==================================================================== */

import { db } from "./db.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

const MAX_SUGGESTIONS = 5;

/* ════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════ */

export interface ChatSuggestion {
  id:            string;
  kind:          'existing_campaign_match' | 'gsc_opportunity' | 'gsc_top_performer' | 'inbox_opportunity_promote';
  text:          string;                              // human-readable suggestion text
  command:       string;                              // exact chat command if user clicks (e.g. "rank me for X")
  source:        ChatSource;
  detail?:       Record<string, any>;
}

export interface ChatSource {
  kind:           'gsc' | 'campaign' | 'opportunity' | 'page_fetch' | 'ga4' | 'inferred';
  label:          string;                              // e.g. "Your GSC, refreshed 3 days ago"
  last_refresh?:  string;
  table?:         string;
  detail?:        string;
}

export interface ToolsStatus {
  gsc_connected:           boolean;
  gsc_last_refresh:        string | null;
  ga4_connected:           boolean;
  ga4_last_refresh:        string | null;
  positioning_resolved:    boolean;
  positioning_last_refresh: string | null;
}

export interface ExplorationResponse {
  keyword:               string;
  has_gsc_data:          boolean;
  gsc_snapshot?:         {
    position:           number | null;
    impressions:        number | null;
    clicks:             number | null;
    source:             ChatSource;
  };
  positioning_read?:     {
    aligned:             'yes' | 'partial' | 'no';
    reasoning:           string;
    citations:           string[];
    source:              ChatSource;
  };
  duplicate_check?:      {
    is_duplicate:        boolean;
    existing_campaign?:  { id: string; keyword: string; status: string };
    source:              ChatSource;
  };
  strategic_read:        string;                       // LLM-generated narrative grounded in cited data
  strategic_read_sources: ChatSource[];
  next_step_options:     Array<{
    id:                  'run_feasibility' | 'run_full_campaign' | 'tell_more';
    label:               string;
    description:         string;
  }>;
  honest_note?:          string;
}

/* ════════════════════════════════════════════════════════════════════
   TOOL AVAILABILITY DETECTION
══════════════════════════════════════════════════════════════════════ */

async function readToolsStatus(projectId: string): Promise<ToolsStatus> {
  const status: ToolsStatus = {
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

/* ════════════════════════════════════════════════════════════════════
   SUGGESTIONS — GSC-grounded, source-cited, ordered by user value
══════════════════════════════════════════════════════════════════════ */

export async function getCampaignSuggestions(opts: {
  projectId:    string;
  partialInput: string;
}): Promise<{
  suggestions:   ChatSuggestion[];
  tools_status:  ToolsStatus;
  honest_note?:  string;
}> {
  const tools_status = await readToolsStatus(opts.projectId);
  const partial = (opts.partialInput || '').trim().toLowerCase();
  const suggestions: ChatSuggestion[] = [];

  /* Only surface suggestions once the user is clearly typing a rank command */
  const isRankIntent = /(rank|target|campaign)/i.test(partial);
  if (!isRankIntent) {
    return { suggestions: [], tools_status };
  }

  /* Extract a search fragment from the partial input — what comes after "rank me for" / "for" */
  const fragment = extractSearchFragment(partial);

  /* 1. EXISTING CAMPAIGN MATCHES — duplicate prevention first */
  try {
    const { data: campaigns } = await db().from("seo_campaigns")
      .select("id, keyword, keyword_group, status, current_position")
      .eq("project_id", opts.projectId)
      .in("status", ['active', 'paused']);
    for (const c of (campaigns as any[] | null) || []) {
      const groupKws: string[] = Array.isArray(c.keyword_group) ? c.keyword_group : (c.keyword ? [c.keyword] : []);
      for (const gk of groupKws) {
        if (fragment.length >= 2 && gk.includes(fragment)) {
          suggestions.push({
            id:      `existing-${c.id}-${gk.replace(/\s+/g, '-').slice(0, 30)}`,
            kind:    'existing_campaign_match',
            text:    `You already have a campaign for "${gk}" (${c.status}${c.current_position ? `, pos ${Number(c.current_position).toFixed(1)}` : ''}) — extend it instead of duplicating`,
            command: `rank me for "${gk}"`,
            source:  {
              kind:  'campaign',
              label: 'Existing campaign in this project',
              table: 'seo_campaigns',
              detail: `campaign_id ${c.id.slice(0, 8)}…`,
            },
            detail: { campaign_id: c.id, current_position: c.current_position },
          });
          break;
        }
      }
      if (suggestions.length >= MAX_SUGGESTIONS) break;
    }
  } catch { /* swallow */ }

  /* 2. GSC OPPORTUNITIES — high impressions, weak position (gap to fill) */
  if (tools_status.gsc_connected && suggestions.length < MAX_SUGGESTIONS) {
    try {
      const { data: kn } = await db().from("project_knowledge")
        .select("field_value, updated_at")
        .eq("project_id", opts.projectId)
        .eq("category", "analytics")
        .eq("field_key", "gsc_top_queries")
        .maybeSingle();
      const queries: any[] = (kn as any)?.field_value ? JSON.parse((kn as any).field_value) : [];
      const source: ChatSource = {
        kind:         'gsc',
        label:        'Your Google Search Console',
        last_refresh: (kn as any)?.updated_at || tools_status.gsc_last_refresh || undefined,
        table:        'project_knowledge.gsc_top_queries',
      };

      /* "Opportunity": queries with impressions >= 20 AND position between 10-30 (page 2-3, recoverable) */
      const opportunityQueries = queries
        .filter((q: any) => q && typeof q.query === 'string' &&
          (q.impressions || 0) >= 20 &&
          (q.position || 99) >= 10 &&
          (q.position || 0) <= 30 &&
          (!fragment || q.query.toLowerCase().includes(fragment))
        )
        .sort((a: any, b: any) => (b.impressions || 0) - (a.impressions || 0))
        .slice(0, MAX_SUGGESTIONS - suggestions.length);

      for (const q of opportunityQueries) {
        suggestions.push({
          id:      `gsc-opp-${q.query.replace(/\s+/g, '-').slice(0, 30)}`,
          kind:    'gsc_opportunity',
          text:    `Opportunity: "${q.query}" — ${q.impressions} imp/mo, position ${Number(q.position).toFixed(1)} (recoverable)`,
          command: `rank me for "${q.query}"`,
          source,
          detail:  { position: q.position, impressions: q.impressions, clicks: q.clicks },
        });
      }
    } catch { /* swallow */ }
  }

  /* 3. GSC TOP PERFORMERS — already ranking well, candidates to consolidate */
  if (tools_status.gsc_connected && suggestions.length < MAX_SUGGESTIONS) {
    try {
      const { data: kn } = await db().from("project_knowledge")
        .select("field_value, updated_at")
        .eq("project_id", opts.projectId)
        .eq("category", "analytics")
        .eq("field_key", "gsc_top_queries")
        .maybeSingle();
      const queries: any[] = (kn as any)?.field_value ? JSON.parse((kn as any).field_value) : [];
      const source: ChatSource = {
        kind:         'gsc',
        label:        'Your Google Search Console',
        last_refresh: (kn as any)?.updated_at || tools_status.gsc_last_refresh || undefined,
        table:        'project_knowledge.gsc_top_queries',
      };

      /* Top performer: position <= 10, impressions >= 50 */
      const topPerformers = queries
        .filter((q: any) => q && typeof q.query === 'string' &&
          (q.position || 99) <= 10 &&
          (q.impressions || 0) >= 50 &&
          (!fragment || q.query.toLowerCase().includes(fragment))
        )
        .sort((a: any, b: any) => (b.clicks || 0) - (a.clicks || 0))
        .slice(0, MAX_SUGGESTIONS - suggestions.length);

      /* Skip ones already covered by existing-campaign suggestions */
      const alreadySuggested = new Set(suggestions.map(s => s.command.toLowerCase()));
      for (const q of topPerformers) {
        const cmd = `rank me for "${q.query}"`;
        if (alreadySuggested.has(cmd.toLowerCase())) continue;
        suggestions.push({
          id:      `gsc-top-${q.query.replace(/\s+/g, '-').slice(0, 30)}`,
          kind:    'gsc_top_performer',
          text:    `Top performer: "${q.query}" — pos ${Number(q.position).toFixed(1)}, ${q.clicks || 0} clicks/mo (extend what's working)`,
          command: cmd,
          source,
          detail:  { position: q.position, impressions: q.impressions, clicks: q.clicks },
        });
      }
    } catch { /* swallow */ }
  }

  /* 4. INBOX OPPORTUNITIES — promote pending opportunities to campaigns */
  if (suggestions.length < MAX_SUGGESTIONS) {
    try {
      const { data: opps } = await db().from("seo_opportunities")
        .select("id, title, kind, suggested_keyword, suggested_action, estimated_value, status")
        .eq("project_id", opts.projectId)
        .eq("status", 'open')
        .eq("suggested_action", 'new_campaign')
        .order("created_at", { ascending: false })
        .limit(10);
      for (const o of (opps as any[] | null) || []) {
        const kw = o.suggested_keyword || '';
        if (!kw) continue;
        if (fragment && !kw.toLowerCase().includes(fragment)) continue;
        const command = `rank me for "${kw}"`;
        if (suggestions.some(s => s.command.toLowerCase() === command.toLowerCase())) continue;
        suggestions.push({
          id:      `opp-${o.id}`,
          kind:    'inbox_opportunity_promote',
          text:    `From inbox: "${kw}"${o.estimated_value ? ` (${o.estimated_value} value)` : ''} — promote opportunity to campaign`,
          command,
          source:  {
            kind:  'opportunity',
            label: 'Opportunity in your inbox',
            table: 'seo_opportunities',
            detail: `opportunity_id ${o.id.slice(0, 8)}…`,
          },
          detail: { opportunity_id: o.id, estimated_value: o.estimated_value },
        });
        if (suggestions.length >= MAX_SUGGESTIONS) break;
      }
    } catch { /* swallow */ }
  }

  /* Build honest_note describing source availability */
  let honest_note: string | undefined;
  if (!tools_status.gsc_connected) {
    honest_note = 'GSC not connected for this project — suggestions are limited to existing campaigns and inbox opportunities. Connect GSC in Settings → Integrations for richer guidance.';
  } else if (suggestions.length === 0) {
    honest_note = fragment
      ? `No grounded suggestions for "${fragment}" yet. Type your full campaign command below.`
      : 'No grounded suggestions matched. Type your full campaign command below.';
  }

  return { suggestions: suggestions.slice(0, MAX_SUGGESTIONS), tools_status, honest_note };
}

function extractSearchFragment(partial: string): string {
  /* Pull out the keyword fragment from things like "rank me for X" or "rank for X" */
  const m = partial.match(/(?:rank(?:ing)?\s+(?:me\s+)?for|target(?:s)?|campaign\s+for)\s+["']?([^"']*?)$/i);
  if (m) return m[1].trim().toLowerCase();
  return '';
}

/* ════════════════════════════════════════════════════════════════════
   EXPLORATION RESPONSE — for "what about X?" / "should I rank for X?"

   Returns structured, fully-cited response:
     - Real GSC snapshot for the keyword (or honest "no GSC data" note)
     - Positioning alignment read (LLM, grounded in cached positioning)
     - Duplicate check
     - Strategic read (LLM, grounded in above data with citations)
     - Three next-step options
══════════════════════════════════════════════════════════════════════ */

export async function produceExplorationResponse(opts: {
  projectId:    string;
  keyword:      string;
}): Promise<{ success: boolean; response?: ExplorationResponse; error?: string }> {
  try {
    const keyword = (opts.keyword || '').trim().toLowerCase();
    if (!keyword) return { success: false, error: 'keyword required' };

    const tools_status = await readToolsStatus(opts.projectId);

    /* 1. GSC snapshot for the keyword */
    let gsc_snapshot: ExplorationResponse['gsc_snapshot'] | undefined;
    let has_gsc_data = false;
    if (tools_status.gsc_connected) {
      try {
        const { data: kn } = await db().from("project_knowledge")
          .select("field_value, updated_at")
          .eq("project_id", opts.projectId)
          .eq("category", "analytics")
          .eq("field_key", "gsc_top_queries")
          .maybeSingle();
        const queries: any[] = (kn as any)?.field_value ? JSON.parse((kn as any).field_value) : [];
        const match = queries.find((q: any) => q && typeof q.query === 'string' &&
          q.query.toLowerCase() === keyword);
        if (match) {
          has_gsc_data = true;
          gsc_snapshot = {
            position:    match.position ?? null,
            impressions: match.impressions ?? null,
            clicks:      match.clicks ?? null,
            source:      {
              kind:         'gsc',
              label:        'Your Google Search Console',
              last_refresh: (kn as any)?.updated_at || tools_status.gsc_last_refresh || undefined,
              table:        'project_knowledge.gsc_top_queries',
            },
          };
        }
      } catch { /* swallow */ }
    }

    /* 2. Resolve positioning (cached) */
    let positioning: any = null;
    if (tools_status.positioning_resolved) {
      try {
        const { data: posData } = await db().from("project_knowledge")
          .select("field_value, updated_at")
          .eq("project_id", opts.projectId)
          .eq("category", "strategy")
          .eq("field_key", "project_positioning")
          .maybeSingle();
        if ((posData as any)?.field_value) {
          positioning = JSON.parse((posData as any).field_value);
          positioning._refresh = (posData as any).updated_at;
        }
      } catch { /* swallow */ }
    }

    /* 3. Duplicate check */
    let duplicate_check: ExplorationResponse['duplicate_check'] | undefined;
    try {
      const { data: campaigns } = await db().from("seo_campaigns")
        .select("id, keyword, keyword_group, status")
        .eq("project_id", opts.projectId)
        .in("status", ['active', 'paused']);
      for (const c of (campaigns as any[] | null) || []) {
        const groupKws: string[] = Array.isArray(c.keyword_group) ? c.keyword_group : (c.keyword ? [c.keyword] : []);
        if (groupKws.some(gk => gk.toLowerCase() === keyword)) {
          duplicate_check = {
            is_duplicate:     true,
            existing_campaign:{ id: c.id, keyword: c.keyword, status: c.status },
            source: {
              kind:  'campaign',
              label: 'Existing campaign in this project',
              table: 'seo_campaigns',
            },
          };
          break;
        }
      }
      if (!duplicate_check) {
        duplicate_check = {
          is_duplicate: false,
          source: {
            kind:  'campaign',
            label: 'Checked against active + paused campaigns in this project',
            table: 'seo_campaigns',
          },
        };
      }
    } catch { /* swallow */ }

    /* 4. Positioning alignment read */
    let positioning_read: ExplorationResponse['positioning_read'] | undefined;
    if (positioning) {
      try {
        positioning_read = await runPositioningAlignmentLlm({ keyword, positioning });
      } catch { /* swallow — leave positioning_read undefined */ }
    }

    /* 5. Strategic read — synthesize everything grounded */
    const strategic_read_sources: ChatSource[] = [];
    if (gsc_snapshot?.source) strategic_read_sources.push(gsc_snapshot.source);
    if (positioning) strategic_read_sources.push({
      kind:         'inferred',
      label:        'Project positioning resolver',
      last_refresh: positioning._refresh,
      table:        'project_knowledge.project_positioning',
    });
    if (duplicate_check?.source) strategic_read_sources.push(duplicate_check.source);

    let strategic_read: string;
    try {
      strategic_read = await runStrategicReadLlm({
        keyword, gsc_snapshot, positioning, positioning_read, duplicate_check, tools_status,
      });
    } catch (e: any) {
      /* Fallback: produce a deterministic strategic read from the structured data */
      strategic_read = buildFallbackStrategicRead({ keyword, gsc_snapshot, positioning, positioning_read, duplicate_check, tools_status });
    }

    /* 6. Next-step options */
    const next_step_options: ExplorationResponse['next_step_options'] = [
      {
        id:          'run_feasibility',
        label:       'Run a feasibility exploration campaign',
        description: 'Lightweight pre-campaign — produces a go/no-go report before committing full budget.',
      },
      {
        id:          'run_full_campaign',
        label:       'Set up a full campaign anyway',
        description: positioning_read?.aligned === 'no'
                      ? 'Strategic risk has been flagged. The system will still set it up if you confirm.'
                      : 'Launch the standard rank-for-keyword pipeline.',
      },
      {
        id:          'tell_more',
        label:       'Tell me more about why this matters',
        description: 'Adjust the analysis based on additional context you provide.',
      },
    ];

    /* 7. Honest note about tool availability */
    let honest_note: string | undefined;
    const unavailable: string[] = [];
    if (!tools_status.gsc_connected) unavailable.push('GSC');
    if (!tools_status.ga4_connected) unavailable.push('GA4');
    if (unavailable.length > 0) {
      honest_note = `${unavailable.join(' + ')} not connected — analysis is limited to what's available. Connect in Settings → Integrations for fuller exploration.`;
    }

    const response: ExplorationResponse = {
      keyword,
      has_gsc_data,
      gsc_snapshot,
      positioning_read,
      duplicate_check,
      strategic_read,
      strategic_read_sources,
      next_step_options,
      honest_note,
    };

    return { success: true, response };
  } catch (e: any) {
    return { success: false, error: e?.message || 'exploration failed' };
  }
}

async function runPositioningAlignmentLlm(opts: {
  keyword: string; positioning: any;
}): Promise<ExplorationResponse['positioning_read']> {
  const sys = `You evaluate whether a target keyword aligns with the project's strategic positioning.

HARD RULES:
- Base your verdict ONLY on the positioning data provided. Do not speculate about competitive markets you don't have data on.
- For "citations": quote specific fields from the positioning data that support your verdict.
- Verdicts:
    "yes"     = keyword's typical intent strongly matches the project's competitive tier and audience
    "partial" = some alignment but keyword's typical intent skews toward a different audience or tier
    "no"      = keyword's intent serves a different audience/tier; pursuing it would split topical signal
- One concise sentence for reasoning.

OUTPUT — strict JSON:
{ "aligned": "yes|partial|no", "reasoning": "...", "citations": ["...", "..."] }`;

  const user = `Keyword: "${opts.keyword}"

Project positioning:
${JSON.stringify(opts.positioning, null, 2)}

Does pursuing this keyword align with this project's positioning?`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 500,
      system:     sys,
      messages:   [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  const text = (data?.content?.[0]?.text || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(cleaned);
  return {
    aligned:    ['yes', 'partial', 'no'].includes(parsed.aligned) ? parsed.aligned : 'partial',
    reasoning:  String(parsed.reasoning || '').slice(0, 600),
    citations:  Array.isArray(parsed.citations) ? parsed.citations.filter((c: any) => typeof c === 'string').slice(0, 5) : [],
    source: {
      kind:         'inferred',
      label:        'Positioning alignment analysis (LLM, grounded in your resolved positioning)',
      last_refresh: opts.positioning?._refresh,
    },
  };
}

async function runStrategicReadLlm(opts: {
  keyword:           string;
  gsc_snapshot?:     any;
  positioning?:      any;
  positioning_read?: any;
  duplicate_check?:  any;
  tools_status:      ToolsStatus;
}): Promise<string> {
  const sys = `You are a senior digital marketing strategist giving the user a quick, plain-English read on whether to pursue a keyword.

HARD RULES:
- Base your read ONLY on the data provided below. Cite specific values where you use them.
- Never invent search volumes, difficulty scores, or external market context.
- If a data source isn't available, acknowledge the gap rather than filling it.
- 3-5 sentences. Conversational tone, like a colleague.
- Do not give recommendations beyond what the data supports.

OUTPUT: plain text (no JSON, no markdown headers).`;

  const dataSummary: string[] = [];
  if (opts.gsc_snapshot) {
    dataSummary.push(`GSC snapshot for "${opts.keyword}": position ${opts.gsc_snapshot.position?.toFixed(1) ?? 'n/a'}, ${opts.gsc_snapshot.impressions ?? 0} impressions, ${opts.gsc_snapshot.clicks ?? 0} clicks.`);
  } else {
    dataSummary.push(`No GSC data exists for "${opts.keyword}" — the project doesn't appear in SERP for this query yet.`);
  }
  if (opts.positioning) {
    dataSummary.push(`Project positioning: ${opts.positioning.client_segment} targeting ${opts.positioning.target_audience}. Competitive tier: ${opts.positioning.competitive_tier}. Topical strengths: ${(opts.positioning.topical_authority_strengths || []).join(', ')}.`);
  } else {
    dataSummary.push(`Project positioning has not been resolved — cannot judge competitive fit.`);
  }
  if (opts.positioning_read) {
    dataSummary.push(`Alignment verdict: ${opts.positioning_read.aligned}. Reasoning: ${opts.positioning_read.reasoning}`);
  }
  if (opts.duplicate_check?.is_duplicate) {
    dataSummary.push(`Duplicate detected: a campaign for "${opts.duplicate_check.existing_campaign.keyword}" is already ${opts.duplicate_check.existing_campaign.status}.`);
  }
  if (!opts.tools_status.ga4_connected) {
    dataSummary.push(`GA4 not connected — cannot speak to engagement/conversion metrics.`);
  }

  const user = `Keyword being explored: "${opts.keyword}"

Real data available:
${dataSummary.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Give a brief strategic read.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 600,
      system:     sys,
      messages:   [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  return (data?.content?.[0]?.text || '').trim().slice(0, 2000);
}

function buildFallbackStrategicRead(opts: {
  keyword:           string;
  gsc_snapshot?:     any;
  positioning?:      any;
  positioning_read?: any;
  duplicate_check?:  any;
  tools_status:      ToolsStatus;
}): string {
  const lines: string[] = [];
  if (opts.gsc_snapshot) {
    lines.push(`"${opts.keyword}" sits at position ${opts.gsc_snapshot.position?.toFixed(1)} with ${opts.gsc_snapshot.impressions} impressions and ${opts.gsc_snapshot.clicks} clicks in your GSC.`);
  } else if (opts.tools_status.gsc_connected) {
    lines.push(`No GSC data for "${opts.keyword}" — your site doesn't appear in this SERP yet.`);
  } else {
    lines.push(`GSC isn't connected, so I can't tell you where you stand on "${opts.keyword}" today.`);
  }
  if (opts.duplicate_check?.is_duplicate) {
    lines.push(`Note: you already have an ${opts.duplicate_check.existing_campaign.status} campaign for "${opts.duplicate_check.existing_campaign.keyword}".`);
  }
  if (opts.positioning_read) {
    lines.push(`Positioning alignment: ${opts.positioning_read.aligned}. ${opts.positioning_read.reasoning}`);
  }
  return lines.join(' ');
}
