/* ════════════════════════════════════════════════════════════════════
   api/lib/seo-campaign-grouping.ts
   Phase 21 — Block 1 — Quality Foundation: keyword grouping + positioning

   GOAL
     Turn a raw user input ("rank me for app maker, no code app builder,
     drag and drop tools") into a sound campaign structure:
       - Primary campaign (1-8 coherent keywords)
       - Suggested follow-up campaigns (for keywords that didn't fit)
       - Opportunities (for orphan keywords worth exploring later)
       - Decisions avoided (duplicate prevented, redirect to better target)

   PUBLIC SURFACE
     • resolveProjectPositioning(projectId)          — 1 LLM call, persisted
     • extractKeywordsFromText(text)                 — hybrid regex + LLM
     • suggestRelatedKeywords(primary, positioning)  — LLM cluster suggestion
     • groupKeywordsByIntentCoherence(kws, pos)      — 1 LLM call, smart grouping
     • detectDuplicateCampaigns(projectId, keywords) — DB cross-reference
     • detectBetterTargets(projectId, keywords, pos) — guard against bad targets
     • recommendCampaignStructure(projectId, input)  — the orchestrator

   ARCHITECTURE NOTES
     - LLM model: Claude Sonnet 4.6
     - Hallucination guards on every prompt (return [] if uncertain, no
       inventing data, mark [unverified] when uncertain)
     - Project positioning is cached to seo_campaigns project_positioning
       and a project-level cache table (created via project_knowledge).
     - Each function fails closed: on LLM failure, returns a sensible
       fallback rather than throwing.
══════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

const HARD_CAP_KEYWORDS_PER_CAMPAIGN = 8;
const SOFT_CAP_KEYWORDS_PER_CAMPAIGN = 6;     // beyond this, suggest splitting
const POSITIONING_CACHE_TTL_DAYS     = 30;    // re-resolve project positioning monthly

/* ════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════ */

export interface ProjectPositioning {
  client_segment:                string;   // e.g. "enterprise B2B SaaS"
  target_audience:               string;   // e.g. "enterprise IT decision-makers, developers"
  competitive_tier:              string;   // e.g. "enterprise low-code (vs OutSystems, Mendix)"
  topical_authority_strengths:   string[]; // existing topics the project owns
  topical_authority_gaps:        string[]; // topics the project does NOT credibly own
  buyer_intent_languages:        string[]; // language patterns of the actual buyer
  resolved_at:                   string;   // ISO timestamp
  confidence:                    'high' | 'medium' | 'low';
  confidence_reason:             string;
  /* [unverified] markers for fields the LLM was unsure about */
  unverified_fields?:            string[];
}

export interface KeywordGroup {
  /* Primary campaign: 1-8 coherent keywords */
  primary_campaign: {
    keywords:        string[];
    intent_label:    string;
    target_url_hint: string | null;       // LLM's best guess of the right target URL
    coherence_score: number;              // 0..1
  };

  /* Suggested follow-up campaigns: separate intent groups */
  suggested_followup_campaigns: Array<{
    keywords:     string[];
    intent_label: string;
    why_separate: string;
  }>;

  /* Orphan keywords → routed to opportunities for later exploration */
  opportunities_to_create: Array<{
    keyword:       string;
    reason:        string;
    feasibility:   'worth_exploring' | 'weak_signal' | 'unclear';
  }>;

  /* Duplicate detection — keywords already covered by existing campaigns */
  duplicates_detected: Array<{
    keyword:                  string;
    existing_campaign_id:     string;
    existing_campaign_keyword:string;
    suggestion:               'merge' | 'skip' | 'verify_intent_match';
  }>;

  /* Better-target detection — when an existing campaign is a stronger fit */
  better_target_detected: Array<{
    keywords:               string[];
    existing_campaign_id:   string;
    existing_campaign_keyword: string;
    reasoning:              string;
  }>;

  /* Decisions Avoided — for the credibility scorecard */
  decisions_avoided: Array<{
    timestamp:        string;
    decision_type:    'duplicate_prevented' | 'redirected_to_better_target' | 'bad_keyword_blocked' | 'misalignment_warned';
    original_intent:  string;
    redirected_to:    string | null;
    reasoning:        string;
  }>;

  /* Honest scope */
  honest_note: string;
}

/* ════════════════════════════════════════════════════════════════════
   PROJECT POSITIONING RESOLVER
══════════════════════════════════════════════════════════════════════ */

/** Resolve a project's strategic positioning. Cached. Idempotent. */
export async function resolveProjectPositioning(opts: {
  projectId: string;
  forceRefresh?: boolean;
}): Promise<{ success: boolean; positioning?: ProjectPositioning; cached?: boolean; error?: string }> {
  try {
    /* Cache check — look for existing positioning persisted on any campaign for this project,
       or in project_knowledge. */
    if (!opts.forceRefresh) {
      const cached = await readCachedPositioning(opts.projectId);
      if (cached) {
        const ageMs = Date.now() - new Date(cached.resolved_at).getTime();
        if (ageMs < POSITIONING_CACHE_TTL_DAYS * 86_400_000) {
          return { success: true, positioning: cached, cached: true };
        }
      }
    }

    /* Gather grounding data: project, GSC top queries + top pages, homepage */
    const [project, topQueries, topPages] = await Promise.all([
      readProject(opts.projectId),
      readGscQueries(opts.projectId),
      readGscPages(opts.projectId),
    ]);

    if (!project) return { success: false, error: 'project not found' };

    /* Resolve via LLM */
    const positioning = await callPositioningLlm({
      projectName:  project.project_name,
      clientUrl:    project.client_url,
      topQueries:   topQueries.slice(0, 50),
      topPages:     topPages.slice(0, 25),
    });
    positioning.resolved_at = new Date().toISOString();

    /* Persist to project_knowledge (project-level cache, not campaign-level
       since positioning is per-project). */
    await persistPositioning(opts.projectId, positioning);

    return { success: true, positioning, cached: false };
  } catch (e: any) {
    return { success: false, error: e?.message || 'positioning resolution failed' };
  }
}

async function readCachedPositioning(projectId: string): Promise<ProjectPositioning | null> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_value")
      .eq("project_id", projectId)
      .eq("category", "strategy")
      .eq("field_key", "project_positioning")
      .maybeSingle();
    const raw = (data as any)?.field_value;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

async function persistPositioning(projectId: string, positioning: ProjectPositioning): Promise<void> {
  try {
    /* Upsert into project_knowledge */
    const existing = await db().from("project_knowledge")
      .select("id")
      .eq("project_id", projectId)
      .eq("category", "strategy")
      .eq("field_key", "project_positioning")
      .maybeSingle();
    const payload = JSON.stringify(positioning);
    if ((existing.data as any)?.id) {
      await db().from("project_knowledge")
        .update({ field_value: payload, updated_at: new Date().toISOString() })
        .eq("id", (existing.data as any).id);
    } else {
      await db().from("project_knowledge").insert({
        project_id:  projectId,
        category:    'strategy',
        field_key:   'project_positioning',
        field_value: payload,
        source:      'llm_resolved',
      });
    }
  } catch (e: any) {
    console.log(`[persistPositioning] failed: ${e?.message}`);
  }
}

async function callPositioningLlm(opts: {
  projectName: string;
  clientUrl:   string | null;
  topQueries:  any[];
  topPages:    any[];
}): Promise<ProjectPositioning> {
  const sys = `You are a senior digital marketing strategist. Given a project's name, domain, and their actual GSC traffic data (queries they currently rank for, pages getting impressions), you resolve the project's strategic positioning.

HARD RULES:
- Ground EVERY field in the data provided. Do not invent positioning that isn't supported by the queries/pages shown.
- If a field is uncertain, mark it with [unverified] suffix AND list it in unverified_fields.
- Return [] for any array if you genuinely don't have signal — never pad lists to look complete.
- Buyer language: extract from actual query patterns (e.g. if many queries use "enterprise" + "platform", that's a real signal; if they don't, don't claim it).

OUTPUT FORMAT — strict JSON only, no preamble:
{
  "client_segment": "...",
  "target_audience": "...",
  "competitive_tier": "...",
  "topical_authority_strengths": ["topic1", "topic2", ...],
  "topical_authority_gaps": ["gap1", "gap2", ...],
  "buyer_intent_languages": ["pattern1", "pattern2", ...],
  "confidence": "high|medium|low",
  "confidence_reason": "1-2 sentences on why this confidence level",
  "unverified_fields": ["field_name1", ...]
}`;

  const user = `Project: ${opts.projectName}
Domain: ${opts.clientUrl || '(not set)'}

Their top 50 GSC queries (what they currently rank for):
${JSON.stringify(opts.topQueries.map(q => ({ q: q.query, pos: q.position, imp: q.impressions, clicks: q.clicks })), null, 2)}

Their top 25 GSC pages (where impressions land):
${JSON.stringify(opts.topPages.map(p => ({ url: p.page, imp: p.impressions, clicks: p.clicks })), null, 2)}

Resolve this project's positioning. Be specific. Use [unverified] for any field you can't confidently ground.`;

  const result = await callClaude(sys, user, 2500, 60_000);

  /* Validate + sanitize output */
  return {
    client_segment:              String(result.client_segment || 'unknown').slice(0, 300),
    target_audience:             String(result.target_audience || 'unknown').slice(0, 300),
    competitive_tier:            String(result.competitive_tier || 'unknown').slice(0, 300),
    topical_authority_strengths: Array.isArray(result.topical_authority_strengths)
      ? result.topical_authority_strengths.filter((x: any) => typeof x === 'string').slice(0, 15)
      : [],
    topical_authority_gaps:      Array.isArray(result.topical_authority_gaps)
      ? result.topical_authority_gaps.filter((x: any) => typeof x === 'string').slice(0, 15)
      : [],
    buyer_intent_languages:      Array.isArray(result.buyer_intent_languages)
      ? result.buyer_intent_languages.filter((x: any) => typeof x === 'string').slice(0, 10)
      : [],
    resolved_at:                 new Date().toISOString(),
    confidence:                  validateConfidence(result.confidence),
    confidence_reason:           String(result.confidence_reason || '').slice(0, 500),
    unverified_fields:           Array.isArray(result.unverified_fields)
      ? result.unverified_fields.filter((x: any) => typeof x === 'string').slice(0, 10)
      : undefined,
  };
}

/* ════════════════════════════════════════════════════════════════════
   KEYWORD EXTRACTION (hybrid regex + LLM fallback)
══════════════════════════════════════════════════════════════════════ */

/** Extract keywords from raw user input. Handles every format we discussed:
   - "rank me for app maker, no code app builder, drag and drop tools"
   - "rank me for app maker plus no code app builder and drag and drop"
   - newline-separated paste
   - quoted: 'rank me for "app maker"'
   - bare list: "app maker / no code app builder"
*/
export async function extractKeywordsFromText(rawInput: string): Promise<{
  keywords: string[];
  intent_phrase: string;             // "rank me for" / "get ranking for" / etc
  used_llm_fallback: boolean;
}> {
  const text = (rawInput || '').trim();
  if (!text) return { keywords: [], intent_phrase: '', used_llm_fallback: false };

  /* Step 1: detect intent phrase */
  const intentMatch = text.match(
    /^(rank\s+(?:me\s+)?for|ranking\s+(?:me\s+)?for|get\s+(?:me\s+)?ranking\s+for|target\s+keywords?|seo\s+for)[\s:]*/i
  );
  const intentPhrase = intentMatch ? intentMatch[0].trim().replace(/[\s:]+$/, '') : '';
  const remainder    = intentMatch ? text.slice(intentMatch[0].length).trim() : text;

  /* Step 2: try deterministic extraction */
  const deterministic = extractDeterministic(remainder);
  if (deterministic.length >= 2 && !hasNaturalLanguageConnectors(remainder)) {
    return {
      keywords: deterministic,
      intent_phrase: intentPhrase,
      used_llm_fallback: false,
    };
  }

  /* If only 1 keyword extracted deterministically AND no natural-language connectors,
     it really is a single keyword input — no need for LLM. */
  if (deterministic.length === 1 && !hasNaturalLanguageConnectors(remainder)) {
    return {
      keywords: deterministic,
      intent_phrase: intentPhrase,
      used_llm_fallback: false,
    };
  }

  /* Step 3: LLM fallback for ambiguous / natural-language inputs */
  try {
    const fromLlm = await extractKeywordsViaLlm(remainder);
    return {
      keywords: fromLlm,
      intent_phrase: intentPhrase,
      used_llm_fallback: true,
    };
  } catch {
    /* LLM failed — return whatever deterministic gave us */
    return {
      keywords: deterministic.length > 0 ? deterministic : [remainder].filter(s => s.length >= 2),
      intent_phrase: intentPhrase,
      used_llm_fallback: false,
    };
  }
}

function extractDeterministic(text: string): string[] {
  if (!text) return [];

  /* Strip leading "for:" or similar */
  let s = text.replace(/^(?:for|targets?|keywords?)[\s:]+/i, '').trim();

  /* Try splitters in order of clarity */
  const splitters: RegExp[] = [
    /[\n\r]+/,           // newlines (paste from spreadsheet)
    /\s*\|\s*/,          // pipe-separated
    /\s*\/\s*/,          // slash-separated
    /\s*;\s*/,           // semicolon-separated
    /\s*,\s*/,           // comma-separated
  ];

  for (const splitter of splitters) {
    if (splitter.test(s)) {
      const parts = s.split(splitter)
        .map(p => cleanKeyword(p))
        .filter(p => p.length >= 2 && p.length <= 120);
      if (parts.length >= 2) return Array.from(new Set(parts));
    }
  }

  /* Single keyword */
  const single = cleanKeyword(s);
  return single.length >= 2 ? [single] : [];
}

function cleanKeyword(raw: string): string {
  return (raw || '')
    .replace(/^["'`]+|["'`]+$/g, '')      // strip surrounding quotes
    .replace(/\s+/g, ' ')                  // collapse whitespace
    .replace(/[?!.]+$/, '')                // strip trailing punctuation
    .trim()
    .toLowerCase();
}

function hasNaturalLanguageConnectors(text: string): boolean {
  return /\b(plus|and also|along with|together with|as well as)\b/i.test(text);
}

async function extractKeywordsViaLlm(text: string): Promise<string[]> {
  const sys = `You extract a clean list of SEO keywords from messy user input. The user may have used natural language ("rank me for X plus Y and also Z"), mixed separators, or quoted some keywords.

HARD RULES:
- Output ONLY the keywords the user actually mentioned. Do NOT add suggestions. Do NOT invent variations.
- Each keyword should be lowercased, trimmed, free of punctuation, 2-120 characters.
- If the input contains 1 keyword, return 1. If 5, return 5. Do not pad.
- Reply with ONLY a JSON array of strings. No preamble, no explanation.`;

  const result = await callClaude(sys, `Extract the keywords from this input:\n\n"${text}"`, 800, 30_000, true);
  if (Array.isArray(result)) {
    return result
      .filter((x: any) => typeof x === 'string')
      .map((s: string) => cleanKeyword(s))
      .filter((s: string) => s.length >= 2 && s.length <= 120)
      .slice(0, 20);
  }
  return [];
}

/* ════════════════════════════════════════════════════════════════════
   SUGGEST RELATED KEYWORDS
══════════════════════════════════════════════════════════════════════ */

/** When the user gives only 1 primary keyword, optionally suggest 4-6 related
   keywords that share intent with the primary AND fit the project's positioning. */
export async function suggestRelatedKeywords(opts: {
  primaryKeyword: string;
  positioning:    ProjectPositioning;
}): Promise<{ keywords: string[]; intent_label: string; reasoning: string }> {
  const sys = `You are a senior SEO strategist. Given a primary keyword and the project's strategic positioning, suggest 4-6 RELATED keywords that:
- Share the same search intent as the primary
- Fit the project's competitive tier and topical authority
- Would naturally cluster together in a single campaign

HARD RULES:
- If you can't find 4 related keywords that genuinely fit, return fewer. Do NOT pad.
- If the primary keyword is misaligned with the project's positioning, FLAG IT in the reasoning field but still return your best honest suggestions.
- No fabricated search terms — use realistic, search-volume-likely keywords.
- Output strict JSON: { "keywords": ["..."], "intent_label": "...", "reasoning": "1-2 sentences" }`;

  const user = `Primary keyword: "${opts.primaryKeyword}"

Project positioning:
${JSON.stringify(opts.positioning, null, 2)}

Suggest 4-6 related keywords that share intent + fit the positioning.`;

  try {
    const result = await callClaude(sys, user, 1200, 45_000);
    return {
      keywords: Array.isArray(result.keywords)
        ? result.keywords.filter((x: any) => typeof x === 'string').map((s: string) => cleanKeyword(s)).slice(0, 6)
        : [],
      intent_label: String(result.intent_label || '').slice(0, 200),
      reasoning:    String(result.reasoning || '').slice(0, 500),
    };
  } catch {
    return { keywords: [], intent_label: '', reasoning: 'LLM suggestion failed' };
  }
}

/* ════════════════════════════════════════════════════════════════════
   GROUP KEYWORDS BY INTENT COHERENCE
══════════════════════════════════════════════════════════════════════ */

/** Given a list of keywords + project positioning, decide which keywords belong
   in the primary campaign and which should split off into follow-ups or opportunities. */
export async function groupKeywordsByIntentCoherence(opts: {
  keywords:        string[];
  positioning:     ProjectPositioning;
}): Promise<{
  primary_campaign:             { keywords: string[]; intent_label: string; target_url_hint: string | null; coherence_score: number };
  suggested_followup_campaigns: Array<{ keywords: string[]; intent_label: string; why_separate: string }>;
  opportunities_to_create:      Array<{ keyword: string; reason: string; feasibility: 'worth_exploring' | 'weak_signal' | 'unclear' }>;
}> {
  if (opts.keywords.length === 0) {
    return {
      primary_campaign:             { keywords: [], intent_label: '', target_url_hint: null, coherence_score: 0 },
      suggested_followup_campaigns: [],
      opportunities_to_create:      [],
    };
  }

  /* Single keyword — trivial case, no grouping needed */
  if (opts.keywords.length === 1) {
    return {
      primary_campaign: {
        keywords:        opts.keywords,
        intent_label:    'single-keyword campaign',
        target_url_hint: null,
        coherence_score: 1.0,
      },
      suggested_followup_campaigns: [],
      opportunities_to_create:      [],
    };
  }

  const sys = `You are a senior SEO strategist grouping keywords for a campaign. Given a list of keywords (which may share intent, may not) and the project's strategic positioning, you decide:

1. PRIMARY CAMPAIGN — Pick the best 5-${HARD_CAP_KEYWORDS_PER_CAMPAIGN} keywords that genuinely cohere (same intent, same target audience, same SERP competitors). Cap at ${HARD_CAP_KEYWORDS_PER_CAMPAIGN}.

2. SUGGESTED FOLLOWUP CAMPAIGNS — If 2+ remaining keywords form their own coherent group (different intent from primary but coherent among themselves), suggest a separate campaign for them.

3. OPPORTUNITIES — Single orphan keywords that don't fit anywhere coherently. Mark these as opportunities for later exploration, with feasibility rating.

HARD RULES:
- Never silently drop a keyword. Every input keyword must end up in primary OR followup OR opportunities.
- Coherence_score 0..1: how tight the primary group is (1 = perfect cohesion, 0.5 = forced).
- If the entire keyword set has mixed intent and the primary group can't be 3+ keywords, surface that honestly (small primary, multiple followups).
- Intent label should reference the project's competitive tier (e.g. "enterprise low-code platform commercial intent", not just "commercial").
- Target_url_hint: only suggest if positioning gives strong signal — otherwise null.
- Feasibility: "worth_exploring" = real potential despite no immediate fit; "weak_signal" = likely not worth pursuing; "unclear" = needs market exploration first.

OUTPUT — strict JSON only:
{
  "primary_campaign": {
    "keywords": ["..."],
    "intent_label": "...",
    "target_url_hint": "/path or null",
    "coherence_score": 0.0-1.0
  },
  "suggested_followup_campaigns": [
    { "keywords": ["..."], "intent_label": "...", "why_separate": "..." }
  ],
  "opportunities_to_create": [
    { "keyword": "...", "reason": "...", "feasibility": "worth_exploring|weak_signal|unclear" }
  ]
}`;

  const user = `Project positioning:
${JSON.stringify(opts.positioning, null, 2)}

Keywords to group (${opts.keywords.length} total):
${JSON.stringify(opts.keywords, null, 2)}

Group them honestly. Cap primary at ${HARD_CAP_KEYWORDS_PER_CAMPAIGN}.`;

  try {
    const result = await callClaude(sys, user, 3000, 60_000);
    return validateGroupingOutput(result, opts.keywords);
  } catch (e: any) {
    /* Fallback: put all keywords in primary up to cap, rest as opportunities */
    console.log(`[groupKeywordsByIntentCoherence] LLM failed: ${e?.message}, using fallback`);
    return fallbackGrouping(opts.keywords);
  }
}

function validateGroupingOutput(raw: any, originalKeywords: string[]): {
  primary_campaign:             { keywords: string[]; intent_label: string; target_url_hint: string | null; coherence_score: number };
  suggested_followup_campaigns: Array<{ keywords: string[]; intent_label: string; why_separate: string }>;
  opportunities_to_create:      Array<{ keyword: string; reason: string; feasibility: 'worth_exploring' | 'weak_signal' | 'unclear' }>;
} {
  const primary = raw?.primary_campaign || {};
  const primaryKeywords = Array.isArray(primary.keywords)
    ? primary.keywords.filter((x: any) => typeof x === 'string').slice(0, HARD_CAP_KEYWORDS_PER_CAMPAIGN)
    : [];

  const followups = Array.isArray(raw?.suggested_followup_campaigns)
    ? raw.suggested_followup_campaigns
        .slice(0, 4)
        .map((f: any) => ({
          keywords:     Array.isArray(f.keywords) ? f.keywords.filter((x: any) => typeof x === 'string').slice(0, HARD_CAP_KEYWORDS_PER_CAMPAIGN) : [],
          intent_label: String(f.intent_label || '').slice(0, 200),
          why_separate: String(f.why_separate || '').slice(0, 500),
        }))
        .filter((f: any) => f.keywords.length >= 1)
    : [];

  const opportunities = Array.isArray(raw?.opportunities_to_create)
    ? raw.opportunities_to_create
        .slice(0, 10)
        .map((o: any) => ({
          keyword:     String(o.keyword || '').slice(0, 120),
          reason:      String(o.reason || '').slice(0, 500),
          feasibility: validateFeasibility(o.feasibility),
        }))
        .filter((o: any) => o.keyword.length >= 2)
    : [];

  /* Coverage check — every original keyword must be accounted for */
  const accounted = new Set<string>([
    ...primaryKeywords,
    ...followups.flatMap((f: any) => f.keywords),
    ...opportunities.map((o: any) => o.keyword),
  ]);
  for (const kw of originalKeywords) {
    if (!accounted.has(kw)) {
      opportunities.push({
        keyword:     kw,
        reason:      'Not classified by grouping LLM; routed to opportunities for review.',
        feasibility: 'unclear' as const,
      });
    }
  }

  return {
    primary_campaign: {
      keywords:        primaryKeywords,
      intent_label:    String(primary.intent_label || '').slice(0, 200),
      target_url_hint: primary.target_url_hint ? String(primary.target_url_hint).slice(0, 500) : null,
      coherence_score: typeof primary.coherence_score === 'number'
        ? Math.max(0, Math.min(1, primary.coherence_score))
        : 0.5,
    },
    suggested_followup_campaigns: followups,
    opportunities_to_create:      opportunities,
  };
}

function fallbackGrouping(keywords: string[]) {
  const primary = keywords.slice(0, HARD_CAP_KEYWORDS_PER_CAMPAIGN);
  const overflow = keywords.slice(HARD_CAP_KEYWORDS_PER_CAMPAIGN);
  return {
    primary_campaign: {
      keywords:        primary,
      intent_label:    '[unverified] grouping fallback — LLM unavailable',
      target_url_hint: null,
      coherence_score: 0.4,
    },
    suggested_followup_campaigns: [],
    opportunities_to_create:      overflow.map(k => ({
      keyword:     k,
      reason:      'LLM grouping unavailable; routed to opportunities. Manual review recommended.',
      feasibility: 'unclear' as const,
    })),
  };
}

/* ════════════════════════════════════════════════════════════════════
   DUPLICATE CAMPAIGN DETECTION
══════════════════════════════════════════════════════════════════════ */

/** Cross-reference proposed keywords against existing project campaigns. */
export async function detectDuplicateCampaigns(opts: {
  projectId: string;
  keywords:  string[];
}): Promise<Array<{
  keyword:                   string;
  existing_campaign_id:      string;
  existing_campaign_keyword: string;
  suggestion:                'merge' | 'skip' | 'verify_intent_match';
}>> {
  if (opts.keywords.length === 0) return [];

  try {
    const { data: campaigns } = await db().from("seo_campaigns")
      .select("id, keyword, keyword_group, status")
      .eq("project_id", opts.projectId)
      .in("status", ['active', 'paused']);   // ignore archived
    if (!campaigns) return [];

    const duplicates: Array<{ keyword: string; existing_campaign_id: string; existing_campaign_keyword: string; suggestion: 'merge' | 'skip' | 'verify_intent_match' }> = [];
    for (const proposed of opts.keywords) {
      const propLc = proposed.toLowerCase().trim();
      for (const c of (campaigns as any[])) {
        const groupKws: string[] = Array.isArray(c.keyword_group) ? c.keyword_group : (c.keyword ? [c.keyword] : []);
        for (const gk of groupKws) {
          if (gk.toLowerCase().trim() === propLc) {
            duplicates.push({
              keyword:                   proposed,
              existing_campaign_id:      c.id,
              existing_campaign_keyword: gk,
              suggestion:                'skip',           // exact duplicate
            });
            break;
          }
          /* Near-duplicate: 80%+ token overlap */
          if (tokenOverlapRatio(propLc, gk.toLowerCase()) >= 0.80) {
            duplicates.push({
              keyword:                   proposed,
              existing_campaign_id:      c.id,
              existing_campaign_keyword: gk,
              suggestion:                'verify_intent_match',
            });
            break;
          }
        }
      }
    }
    return duplicates;
  } catch (e: any) {
    console.log(`[detectDuplicateCampaigns] failed: ${e?.message}`);
    return [];
  }
}

function tokenOverlapRatio(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(t => t.length >= 3));
  const tokensB = new Set(b.split(/\s+/).filter(t => t.length >= 3));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const t of tokensA) if (tokensB.has(t)) shared++;
  return shared / Math.min(tokensA.size, tokensB.size);
}

/* ════════════════════════════════════════════════════════════════════
   BETTER-TARGET DETECTION
══════════════════════════════════════════════════════════════════════ */

/** Detect when an existing campaign is a strategically better target for the
    proposed keywords than starting a new campaign. */
export async function detectBetterTargets(opts: {
  projectId:   string;
  keywords:    string[];
  positioning: ProjectPositioning;
}): Promise<Array<{
  keywords:                  string[];
  existing_campaign_id:      string;
  existing_campaign_keyword: string;
  reasoning:                 string;
}>> {
  if (opts.keywords.length === 0) return [];

  try {
    const { data: campaigns } = await db().from("seo_campaigns")
      .select("id, keyword, keyword_group, keyword_intent_label, status, current_position, target_position")
      .eq("project_id", opts.projectId)
      .in("status", ['active', 'paused']);

    if (!campaigns || (campaigns as any[]).length === 0) return [];

    /* If we have no existing campaigns, nothing to redirect to */
    const sys = `You are a senior SEO strategist preventing wasted work. Given a list of NEW keywords a client wants to pursue AND the existing campaigns already running for this project, identify cases where:

- The new keywords would be better served by extending/merging into an existing campaign
- The new keywords are a worse strategic fit than what's already in motion
- Pursuing the new keywords would split topical authority unnecessarily

HARD RULES:
- Only flag if the existing campaign is GENUINELY a better target. If new keywords have meaningfully different intent or audience, don't flag.
- Reasoning must be specific: name the existing campaign, name the topical overlap or strategic conflict, propose the action.
- Return [] if no genuine better-targets exist. Honest empty is better than padding.

OUTPUT — strict JSON only:
{
  "better_targets": [
    {
      "keywords": ["affected keywords from the new list"],
      "existing_campaign_id": "...",
      "reasoning": "specific explanation: why this existing campaign is the better target"
    }
  ]
}`;

    const user = `Project positioning:
${JSON.stringify(opts.positioning, null, 2)}

New keywords being proposed:
${JSON.stringify(opts.keywords, null, 2)}

Existing campaigns for this project:
${JSON.stringify((campaigns as any[]).map(c => ({
  id:               c.id,
  primary_keyword:  c.keyword,
  keyword_group:    c.keyword_group,
  intent_label:     c.keyword_intent_label,
  status:           c.status,
  current_position: c.current_position,
  target_position:  c.target_position,
})), null, 2)}

Identify better-target redirects. Return [] if none.`;

    const result = await callClaude(sys, user, 2000, 45_000);
    const flagged = Array.isArray(result.better_targets) ? result.better_targets : [];

    const campMap = new Map((campaigns as any[]).map(c => [c.id, c]));
    return flagged
      .map((f: any) => {
        const camp = campMap.get(f.existing_campaign_id);
        if (!camp) return null;
        return {
          keywords:                  Array.isArray(f.keywords) ? f.keywords.filter((x: any) => typeof x === 'string') : [],
          existing_campaign_id:      f.existing_campaign_id,
          existing_campaign_keyword: camp.keyword,
          reasoning:                 String(f.reasoning || '').slice(0, 800),
        };
      })
      .filter((x: any) => x && x.keywords.length > 0);
  } catch (e: any) {
    console.log(`[detectBetterTargets] failed: ${e?.message}`);
    return [];
  }
}

/* ════════════════════════════════════════════════════════════════════
   ORCHESTRATOR — the top-level function the chat surface calls
══════════════════════════════════════════════════════════════════════ */

/** Top-level orchestrator. Takes raw user input + project, returns the full
    campaign structure recommendation. This is what Block 2 will call from
    SeasonModal when the user types "rank me for app maker, no code app builder, …".

    Phase 21 Block 2.5 — now also extracts target URLs + runs grounded fit
    analysis on each URL when the user provides hub-and-spoke mapping. */
export async function recommendCampaignStructure(opts: {
  projectId:  string;
  rawInput:   string;
}): Promise<{ success: boolean; structure?: KeywordGroup & { target_urls?: string[]; keyword_url_mapping?: Record<string, string>; url_fit_analysis?: Record<string, any>; url_warnings?: string[]; url_blocking_issue?: boolean }; positioning?: ProjectPositioning; error?: string }> {
  try {
    /* Step 1: extract keywords AND target URLs from raw input */
    const { extractCampaignIntent } = await import("./seo-url-targeting.js");
    const extracted = await extractCampaignIntent(opts.rawInput);
    if (extracted.keywords.length === 0) {
      return { success: false, error: 'no keywords extracted from input — please rephrase' };
    }

    /* Step 2: resolve project positioning (cached) */
    const posResult = await resolveProjectPositioning({ projectId: opts.projectId });
    if (!posResult.positioning) {
      return { success: false, error: posResult.error || 'positioning resolution failed' };
    }
    const positioning = posResult.positioning;

    /* Step 3-5: run grouping, duplicate detection, better-target detection in parallel.
       If target URLs were provided, also run URL fit validation in parallel. */
    const promises: Array<Promise<any>> = [
      groupKeywordsByIntentCoherence({ keywords: extracted.keywords, positioning }),
      detectDuplicateCampaigns({ projectId: opts.projectId, keywords: extracted.keywords }),
      detectBetterTargets({ projectId: opts.projectId, keywords: extracted.keywords, positioning }),
    ];
    const hasUrls = Object.keys(extracted.keyword_url_mapping).length > 0;
    if (hasUrls) {
      const { validateAndAnalyzeTargetUrls } = await import("./seo-url-targeting.js");
      promises.push(validateAndAnalyzeTargetUrls({
        projectId:         opts.projectId,
        urlKeywordMapping: extracted.keyword_url_mapping,
        positioning,
      }));
    }
    const [grouping, duplicates, betterTargets, urlValidation] = await Promise.all(promises) as any;

    /* Step 6: assemble decisions_avoided log */
    const decisionsAvoided: KeywordGroup['decisions_avoided'] = [];
    for (const d of duplicates) {
      decisionsAvoided.push({
        timestamp:       new Date().toISOString(),
        decision_type:   'duplicate_prevented',
        original_intent: `pursue keyword "${d.keyword}"`,
        redirected_to:   `existing campaign for "${d.existing_campaign_keyword}" (${d.existing_campaign_id.slice(0, 8)})`,
        reasoning:       d.suggestion === 'skip'
                         ? 'Exact duplicate of an existing active campaign.'
                         : 'Near-duplicate (80%+ token overlap) — operator should verify intent before duplicating.',
      });
    }
    for (const bt of betterTargets) {
      decisionsAvoided.push({
        timestamp:       new Date().toISOString(),
        decision_type:   'redirected_to_better_target',
        original_intent: `pursue keywords ${JSON.stringify(bt.keywords)}`,
        redirected_to:   `existing campaign for "${bt.existing_campaign_keyword}" (${bt.existing_campaign_id.slice(0, 8)})`,
        reasoning:       bt.reasoning,
      });
    }
    /* Misalignment warning if coherence is low */
    if (grouping.primary_campaign.coherence_score < 0.5 && grouping.primary_campaign.keywords.length > 1) {
      decisionsAvoided.push({
        timestamp:       new Date().toISOString(),
        decision_type:   'misalignment_warned',
        original_intent: `bundle ${extracted.keywords.length} keywords together`,
        redirected_to:   `split into primary + ${grouping.suggested_followup_campaigns.length} followup campaign(s)`,
        reasoning:       `Coherence score ${grouping.primary_campaign.coherence_score.toFixed(2)} — keywords had mixed intent. System split them into a tighter primary group plus follow-ups to preserve quality.`,
      });
    }
    /* URL-keyword fit warnings → decisions_avoided */
    if (hasUrls && urlValidation) {
      for (const [url, analysis] of Object.entries(urlValidation.fit_analyses || {})) {
        const a = analysis as any;
        for (const [kw, fit] of Object.entries(a.fit_per_keyword || {})) {
          const f = fit as any;
          if (f.verdict === 'poor_fit') {
            decisionsAvoided.push({
              timestamp:       new Date().toISOString(),
              decision_type:   'misalignment_warned',
              original_intent: `target ${url} for "${kw}"`,
              redirected_to:   null,
              reasoning:       `Grounded fit analysis: page content does not serve the keyword's intent. ${f.reasoning}`,
            });
          }
        }
      }
    }

    /* Step 7: build honest_note */
    const honestNoteParts: string[] = [];
    honestNoteParts.push(`Extracted ${extracted.keywords.length} keyword(s)${hasUrls ? ` and ${Object.keys(extracted.keyword_url_mapping).length} URL mapping(s)` : ''} from input${extracted.used_llm_fallback ? ' (LLM-assisted extraction)' : ''}.`);
    honestNoteParts.push(`Primary campaign: ${grouping.primary_campaign.keywords.length} keywords, coherence ${grouping.primary_campaign.coherence_score.toFixed(2)}.`);
    if (grouping.suggested_followup_campaigns.length > 0) {
      honestNoteParts.push(`${grouping.suggested_followup_campaigns.length} followup campaign(s) suggested for keywords with different intent.`);
    }
    if (grouping.opportunities_to_create.length > 0) {
      honestNoteParts.push(`${grouping.opportunities_to_create.length} keyword(s) routed to opportunities for exploration.`);
    }
    if (duplicates.length > 0) {
      honestNoteParts.push(`${duplicates.length} duplicate(s) detected — protected against duplicate work.`);
    }
    if (betterTargets.length > 0) {
      honestNoteParts.push(`${betterTargets.length} keyword group(s) flagged as better-served by existing campaigns.`);
    }
    if (hasUrls && urlValidation) {
      const totalUrls = Object.keys(urlValidation.fit_analyses || {}).length;
      const poorFits = Object.values(urlValidation.fit_analyses || {}).reduce((sum: number, a: any) => {
        return sum + Object.values(a.fit_per_keyword || {}).filter((f: any) => f.verdict === 'poor_fit').length;
      }, 0);
      honestNoteParts.push(`Validated ${totalUrls} target URL(s) via real page fetch${poorFits > 0 ? `; ${poorFits} URL-keyword pair(s) flagged as poor fit` : ''}.`);
    }
    if (positioning.confidence === 'low') {
      honestNoteParts.push(`Project positioning confidence is LOW — recommendations may need manual review.`);
    }

    const structure: any = {
      primary_campaign:             grouping.primary_campaign,
      suggested_followup_campaigns: grouping.suggested_followup_campaigns,
      opportunities_to_create:      grouping.opportunities_to_create,
      duplicates_detected:          duplicates,
      better_target_detected:       betterTargets,
      decisions_avoided:            decisionsAvoided,
      honest_note:                  honestNoteParts.join(' '),
    };

    if (hasUrls) {
      structure.target_urls          = Array.from(new Set(Object.values(extracted.keyword_url_mapping)));
      structure.keyword_url_mapping  = extracted.keyword_url_mapping;
      structure.url_fit_analysis     = urlValidation?.fit_analyses || {};
      structure.url_warnings         = urlValidation?.warnings || [];
      structure.url_blocking_issue   = !!urlValidation?.any_blocking_issue;
    }

    return { success: true, structure, positioning };
  } catch (e: any) {
    return { success: false, error: e?.message || 'recommendation failed' };
  }
}

/* ════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════ */

async function readProject(projectId: string): Promise<{ project_name: string; client_url: string | null } | null> {
  try {
    /* Use select('*') — safe regardless of which column naming convention the
       projects table uses (project_name/client_url vs name/url). Querying
       specific non-existent columns causes a PostgREST 400 and a silent null
       return which triggers the "project not found" error. */
    const { data, error } = await db().from("projects")
      .select("*").eq("id", projectId).maybeSingle();
    if (error || !data) return null;
    const d = data as any;
    const project_name = d.project_name || d.name || d.title || '';
    const client_url   = d.client_url   || d.url   || null;
    if (!project_name) return null;
    return { project_name, client_url };
  } catch { return null; }
}

async function readGscQueries(projectId: string): Promise<any[]> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_value").eq("project_id", projectId)
      .eq("category", "analytics").eq("field_key", "gsc_top_queries").maybeSingle();
    const raw = (data as any)?.field_value;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function readGscPages(projectId: string): Promise<any[]> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_value").eq("project_id", projectId)
      .eq("category", "analytics").eq("field_key", "gsc_top_pages").maybeSingle();
    const raw = (data as any)?.field_value;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function validateConfidence(raw: any): 'high' | 'medium' | 'low' {
  const lc = String(raw).toLowerCase();
  return (['high', 'medium', 'low'].includes(lc) ? lc : 'medium') as any;
}

function validateFeasibility(raw: any): 'worth_exploring' | 'weak_signal' | 'unclear' {
  const lc = String(raw).toLowerCase();
  return (['worth_exploring', 'weak_signal', 'unclear'].includes(lc) ? lc : 'unclear') as any;
}

async function callClaude(sys: string, user: string, maxTokens: number, timeoutMs: number, expectArray: boolean = false): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
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

/* ════════════════════════════════════════════════════════════════════
   Phase 21 — Block 2 — commitCampaignStructure

   Takes a structure recommendation (output of recommendCampaignStructure)
   plus user-confirmed choices, and persists it:

     - Creates the primary campaign with full metadata (positioning,
       keyword_group, intent_label, excluded_keywords, decisions_avoided)
     - For each suggested followup campaign that user accepted: creates as
       an opportunity (kind='keyword', suggested_action='new_campaign')
     - For each opportunity_to_create that user accepted: creates as a
       'keyword' or 'content_gap' opportunity
     - Returns campaign_id of the primary so the pipeline can launch
══════════════════════════════════════════════════════════════════════ */

export async function commitCampaignStructure(opts: {
  projectId:         string;
  structure:         {
    primary_campaign: {
      keywords:        string[];
      intent_label:    string;
      target_url_hint: string | null;
      coherence_score: number;
    };
    suggested_followup_campaigns: Array<{ keywords: string[]; intent_label: string; why_separate: string }>;
    opportunities_to_create:      Array<{ keyword: string; reason: string; feasibility: 'worth_exploring' | 'weak_signal' | 'unclear' }>;
    duplicates_detected:          Array<{ keyword: string; existing_campaign_id: string; existing_campaign_keyword: string; suggestion: string }>;
    better_target_detected:       Array<{ keywords: string[]; existing_campaign_id: string; existing_campaign_keyword: string; reasoning: string }>;
    decisions_avoided:            Array<{ timestamp: string; decision_type: string; original_intent: string; redirected_to: string | null; reasoning: string }>;
    honest_note:                  string;
    /* Phase 21 Block 2.5 — URL targeting fields (optional) */
    target_urls?:                 string[];
    keyword_url_mapping?:         Record<string, string>;
    url_fit_analysis?:            Record<string, any>;
    url_warnings?:                string[];
    url_blocking_issue?:          boolean;
  };
  positioning?: any;
  /* User's choices — which suggested entities to actually create */
  acceptFollowupCampaigns?:  number[];   // indices of followups to materialize as opportunities
  acceptOpportunities?:      number[];   // indices of opportunities_to_create to materialize
  /* If user wants to use a campaign type other than 'standard' (e.g. feasibility_exploration) */
  campaignType?: 'standard' | 'feasibility_exploration';
}): Promise<{
  success: boolean;
  primary_campaign_id?: string;
  followup_opportunity_ids?: string[];
  opportunity_ids?: string[];
  excluded_keywords?: string[];
  error?: string;
}> {
  try {
    const { structure, projectId, positioning } = opts;
    const primaryKeywords = structure.primary_campaign.keywords;

    if (primaryKeywords.length === 0) {
      return { success: false, error: 'primary campaign has no keywords' };
    }

    /* Compute excluded_keywords: everything from input that did NOT end up in primary */
    const allInputKeywords = new Set<string>([
      ...primaryKeywords,
      ...structure.suggested_followup_campaigns.flatMap(f => f.keywords),
      ...structure.opportunities_to_create.map(o => o.keyword),
    ]);
    const primarySet = new Set(primaryKeywords);
    const excludedKeywords = Array.from(allInputKeywords).filter(k => !primarySet.has(k));

    /* Create the primary campaign */
    const { createOrFindCampaign, recordOpportunity } = await import("./seo-campaign-engine.js");
    const primaryResult = await createOrFindCampaign({
      projectId,
      keyword:             primaryKeywords[0],     // primary = first keyword
      campaignKind:        'rank_for_keyword',
      goal:                `Rank for ${primaryKeywords.map(k => `"${k}"`).join(', ')}`,
      keywordGroup:        primaryKeywords,
      keywordIntentLabel:  structure.primary_campaign.intent_label,
      projectPositioning:  positioning,
      excludedKeywords:    excludedKeywords.length > 0 ? excludedKeywords : undefined,
      decisionsAvoided:    structure.decisions_avoided,
      campaignType:        opts.campaignType || 'standard',
      /* Phase 21 Block 2.5 — URL targeting */
      targetUrls:          structure.target_urls,
      keywordUrlMapping:   structure.keyword_url_mapping,
      urlFitAnalysis:      structure.url_fit_analysis,
    });

    if (!primaryResult.success || !primaryResult.campaign_id) {
      return { success: false, error: primaryResult.error || 'primary campaign creation failed' };
    }
    const primaryCampaignId = primaryResult.campaign_id;

    /* Create followup-campaign opportunities (default: accept all unless user filtered) */
    const followupIndices = opts.acceptFollowupCampaigns ?? structure.suggested_followup_campaigns.map((_, i) => i);
    const followupIds: string[] = [];
    for (const idx of followupIndices) {
      const followup = structure.suggested_followup_campaigns[idx];
      if (!followup) continue;
      const oppResult = await recordOpportunity({
        projectId,
        kind:                  'keyword',
        title:                 `Suggested follow-up campaign: "${followup.keywords[0]}" + ${followup.keywords.length - 1} more`,
        description:           `${followup.why_separate}\n\nKeywords: ${followup.keywords.map(k => `"${k}"`).join(', ')}`,
        evidence:              {
          keyword_group:    followup.keywords,
          intent_label:     followup.intent_label,
          why_separate:     followup.why_separate,
          parent_structure: 'campaign_grouping',
          spun_off_from:    primaryCampaignId,
        },
        estimatedValue:        'medium',
        estimatedEffort:       'medium',
        suggestedAction:       'new_campaign',
        suggestedCampaignKind: 'rank_for_keyword',
        suggestedKeyword:      followup.keywords[0],
        sourceCampaignId:      primaryCampaignId,
        sourceKind:            'manual',
      });
      if (oppResult.opportunity_id) followupIds.push(oppResult.opportunity_id);
    }

    /* Create individual opportunity entries (default: accept all unless user filtered) */
    const oppIndices = opts.acceptOpportunities ?? structure.opportunities_to_create.map((_, i) => i);
    const oppIds: string[] = [];
    for (const idx of oppIndices) {
      const opp = structure.opportunities_to_create[idx];
      if (!opp) continue;
      const oppResult = await recordOpportunity({
        projectId,
        kind:                  'keyword',
        title:                 `Explore: "${opp.keyword}" (${opp.feasibility.replace(/_/g, ' ')})`,
        description:           opp.reason,
        evidence:              {
          keyword:        opp.keyword,
          feasibility:    opp.feasibility,
          parent_structure: 'campaign_grouping',
          spun_off_from: primaryCampaignId,
        },
        estimatedValue:        opp.feasibility === 'worth_exploring' ? 'medium' : 'low',
        estimatedEffort:       'medium',
        suggestedAction:       opp.feasibility === 'worth_exploring' ? 'new_campaign' : 'investigate',
        suggestedKeyword:      opp.keyword,
        sourceCampaignId:      primaryCampaignId,
        sourceKind:            'manual',
      });
      if (oppResult.opportunity_id) oppIds.push(oppResult.opportunity_id);
    }

    return {
      success:                  true,
      primary_campaign_id:      primaryCampaignId,
      followup_opportunity_ids: followupIds,
      opportunity_ids:          oppIds,
      excluded_keywords:        excludedKeywords,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'commit failed' };
  }
}
