/* ════════════════════════════════════════════════════════════════
   api/lib/season-pipeline-rank-for-keyword.ts
   Phase 12 — The first real pipeline.

   Input:  "rank for 'best CRM for small teams'" (or similar)
   Output: A full deliverable pack:
     1. Keyword research artifact (intent, volume estimate, related, SERP shape)
     2. Competitor snapshot (top 5 ranking pages, their structure)
     3. Target-page analysis (does this project rank? what's missing?)
     4. Strategy plan (the play we'll run)
     5. Content brief (full structure for the article)
     6. Client-facing progress note (in Manav's voice)
     7. Internal handover doc (for the PM)

   Each step leverages existing modules where possible:
     • content-engine.ts (existing) for the content brief
     • season-llm.ts for analytical reasoning
     • season-llm-web.ts for live SERP/competitor lookup
     • season-knowledge-cache.ts to avoid re-fetching
     • Existing GSC/GA4 readers via project_knowledge

   Each step writes its honest_note. If GSC data is thin, the step
   says so. If the cache had a fresh result, the step says so.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { cacheKnowledge, getKnowledge } from "./season-knowledge-cache.js";
import type { PipelineDefinition, PipelineStepResult, PipelineStepContext } from "./season-pipeline-runner.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

/* ─── Helper: call LLM with JSON output ──────────────────────── */

async function callLlmJson(opts: {
  systemPrompt: string;
  userMessage:  string;
  maxTokens?:   number;
}): Promise<{ ok: boolean; parsed?: any; raw?: string; error?: string; tokens?: number }> {
  if (!ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY missing" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: opts.maxTokens || 2000,
        system: opts.systemPrompt,
        messages: [{ role: "user", content: opts.userMessage }],
      }),
    });
    if (!res.ok) return { ok: false, error: `Anthropic ${res.status}` };
    const data = await res.json();
    const text = (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      return { ok: true, parsed, raw: text, tokens: data?.usage?.output_tokens };
    } catch {
      return { ok: true, parsed: { _raw: text }, raw: text };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || "fetch failed" };
  }
}

/* ─── Helper: call LLM with web search ───────────────────────── */

async function callLlmWeb(opts: {
  systemPrompt: string;
  userMessage:  string;
  maxTokens?:   number;
  maxUses?:     number;
}): Promise<{ ok: boolean; parsed?: any; citations?: Array<{ url: string; title?: string }>; webUsed?: boolean; error?: string }> {
  if (!ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY missing" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: opts.maxTokens || 3000,
        system: opts.systemPrompt,
        messages: [{ role: "user", content: opts.userMessage }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: opts.maxUses || 4 }],
      }),
    });
    if (!res.ok) return { ok: false, error: `Anthropic ${res.status}` };
    const data = await res.json();
    const text = (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

    /* Extract citations */
    const citations: Array<{ url: string; title?: string }> = [];
    for (const block of (data?.content || [])) {
      if (block.type === "text" && Array.isArray(block.citations)) {
        for (const c of block.citations) {
          if (c.type === "web_search_result_location" && c.url) {
            citations.push({ url: c.url, title: c.title });
          }
        }
      }
    }
    const webUsed = (data?.content || []).some((b: any) => b.type === "tool_use" && b.name === "web_search");

    try {
      const parsed = JSON.parse(cleaned);
      return { ok: true, parsed, citations, webUsed };
    } catch {
      return { ok: true, parsed: { _raw: text }, citations, webUsed };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || "fetch failed" };
  }
}

/* ─── Helper: read GSC top queries for project ────────────────── */

async function readGscQueries(projectId: string): Promise<any[]> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_value")
      .eq("project_id", projectId)
      .eq("category", "analytics")
      .eq("field_key", "gsc_top_queries")
      .maybeSingle();
    const raw = (data as any)?.field_value;
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

/* ────────────────────────────────────────────────────────────
   THE PIPELINE DEFINITION
─────────────────────────────────────────────────────────── */

export function buildRankForKeywordPipeline(): PipelineDefinition {
  return {
    type: 'rank_for_keyword',
    llm_call_cap: 12,
    steps: [
      stepKeywordResearch,
      stepGscContext,
      stepCompetitorSnapshot,
      stepStrategyPlan,
      stepContentBrief,
      stepClientUpdate,
      stepInternalHandover,
    ],
  };
}

/* ─── STEP 1: Keyword research ──────────────────────────────── */

const stepKeywordResearch = {
  id: 'keyword_research',
  label: 'Research the target keyword',
  description: 'Search intent, related queries, SERP shape',
  artifact_kind: 'keyword_research',
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const keyword = ctx.scope.keyword;
    if (!keyword) return { ok: false, error: 'no keyword in scope' };

    /* Check cache first */
    const cacheKey = `kw:${keyword.toLowerCase().slice(0, 100)}`;
    const cached = await getKnowledge({
      projectId: ctx.projectId,
      knowledgeType: 'keyword_research',
      key: cacheKey,
    });
    if (cached) {
      return {
        ok: true,
        output: cached.value,
        artifact: {
          kind: 'keyword_research',
          title: `Keyword research: "${keyword}"`,
          body: renderKeywordArtifact(keyword, cached.value),
        },
        honest_note: `Used cached keyword research (last refreshed ${cached.updatedAt.slice(0,10)}). Cache will refresh next month.`,
      };
    }

    /* Live research with web */
    const sys = `You are S.E.A.S.O.N. researching an SEO keyword. Output ONLY valid JSON with this shape:
{
  "keyword": "...",
  "primary_intent": "informational | commercial | transactional | navigational",
  "intent_explanation": "1-2 sentences",
  "search_volume_estimate": "broad bucket: low (<500/mo) | medium (500-5k) | high (5k-50k) | very_high (>50k)",
  "related_queries": ["..."],
  "people_also_ask": ["..."],
  "serp_features": ["featured_snippet | knowledge_panel | video | shopping | local_pack | etc."],
  "competitive_difficulty": "low | medium | high | very_high",
  "difficulty_reasoning": "what's competing for this — established brands? aggregators? thin content?",
  "ranking_strategy_hint": "what kind of content tends to win for this keyword (long-form guide, comparison, listicle, tool, etc.)"
}
Use web_search to verify current SERP shape. Be honest — if you can't determine something, say so.`;
    const usr = `Research the keyword: "${keyword}"`;
    const r = await callLlmWeb({ systemPrompt: sys, userMessage: usr, maxTokens: 2000, maxUses: 4 });

    if (!r.ok || !r.parsed) {
      return { ok: false, error: r.error || 'no response', llm_calls: 1 };
    }

    /* Cache it */
    await cacheKnowledge({
      projectId: ctx.projectId,
      knowledgeType: 'keyword_research',
      key: cacheKey,
      value: r.parsed,
      summary: `${keyword} · ${r.parsed.primary_intent} · ${r.parsed.competitive_difficulty}`,
      source: 'web_search',
      sourceUrls: r.citations?.map(c => c.url),
      confidence: r.webUsed ? 0.8 : 0.6,
    });

    return {
      ok: true,
      output: r.parsed,
      artifact: {
        kind: 'keyword_research',
        title: `Keyword research: "${keyword}"`,
        body: renderKeywordArtifact(keyword, r.parsed),
      },
      honest_note: r.webUsed
        ? `Researched live via web search (${r.citations?.length || 0} sources cited).`
        : `Couldn't run a live SERP check — used training knowledge only. Confidence reduced.`,
      llm_calls: 1,
      web_searches: r.webUsed ? (r.citations?.length || 1) : 0,
    };
  },
};

function renderKeywordArtifact(keyword: string, data: any): string {
  return `# Keyword Research: "${keyword}"

**Primary intent:** ${data.primary_intent || 'unknown'}
${data.intent_explanation ? `> ${data.intent_explanation}` : ''}

**Search volume bucket:** ${data.search_volume_estimate || 'unknown'}
**Competitive difficulty:** ${data.competitive_difficulty || 'unknown'}
${data.difficulty_reasoning ? `> ${data.difficulty_reasoning}` : ''}

**Related queries:**
${(data.related_queries || []).map((q: string) => `- ${q}`).join('\n') || '(none surfaced)'}

**People also ask:**
${(data.people_also_ask || []).map((q: string) => `- ${q}`).join('\n') || '(none surfaced)'}

**SERP features present:**
${(data.serp_features || []).join(', ') || '(none)'}

**Ranking strategy hint:**
${data.ranking_strategy_hint || '—'}
`;
}

/* ─── STEP 2: GSC context for this keyword ──────────────────── */

const stepGscContext = {
  id: 'gsc_context',
  label: 'Check GSC for current ranking + neighboring queries',
  description: 'Are we already ranking for this or anything close?',
  artifact_kind: 'metric_table',
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const keyword = ctx.scope.keyword as string;
    const allQueries = await readGscQueries(ctx.projectId);

    if (allQueries.length === 0) {
      return {
        ok: true,
        output: { current_ranking: null, neighboring: [], note: 'no_gsc_data' },
        artifact: {
          kind: 'metric_table',
          title: `GSC check: "${keyword}"`,
          body: `# GSC Context\n\n**No GSC data available for this project yet.** S.E.A.S.O.N. will proceed using general benchmarks, but the strategy will lack the precision that real ranking data provides. Connect GSC in Data Room → Integrations to upgrade this step on the next run.`,
        },
        honest_note: 'GSC has no data for this project. Strategy will use general benchmarks instead of actual ranking position.',
      };
    }

    /* Find exact + fuzzy matches */
    const lc = keyword.toLowerCase();
    const tokens = lc.split(/\s+/).filter(t => t.length > 3);
    const exact = allQueries.find((q: any) => (q.query || '').toLowerCase() === lc);
    const neighboring = allQueries.filter((q: any) => {
      const qLc = (q.query || '').toLowerCase();
      if (qLc === lc) return false;
      return tokens.some(t => qLc.includes(t));
    }).slice(0, 15);

    const output = { current_ranking: exact || null, neighboring };
    return {
      ok: true,
      output,
      artifact: {
        kind: 'metric_table',
        title: `GSC check: "${keyword}"`,
        body: renderGscArtifact(keyword, exact, neighboring),
      },
      honest_note: exact
        ? `Already ranking at position ${exact.position?.toFixed?.(1) || '?'} for the exact phrase.`
        : neighboring.length > 0
          ? `No exact match in GSC. Found ${neighboring.length} neighboring queries — likely earning some near-miss impressions.`
          : `No GSC traction yet on this keyword or its tokens.`,
    };
  },
};

function renderGscArtifact(keyword: string, exact: any, neighboring: any[]): string {
  const exactBlock = exact
    ? `**Currently ranking:** Position ${exact.position?.toFixed?.(1) || '?'}\nClicks (28d): ${exact.clicks || 0} · Impressions: ${exact.impressions || 0} · CTR: ${exact.ctr ? (exact.ctr * 100).toFixed(1) + '%' : '—'}`
    : `**Not currently ranking** for the exact phrase.`;
  const neighborTable = neighboring.length > 0
    ? '\n\n**Neighboring queries (token overlap):**\n\n| Query | Pos | Clicks | Impr |\n|---|---|---|---|\n' +
      neighboring.map(q => `| ${q.query} | ${q.position?.toFixed?.(1) || '?'} | ${q.clicks || 0} | ${q.impressions || 0} |`).join('\n')
    : '';
  return `# GSC Context: "${keyword}"\n\n${exactBlock}${neighborTable}`;
}

/* ─── STEP 3: Competitor snapshot ───────────────────────────── */

const stepCompetitorSnapshot = {
  id: 'competitor_snapshot',
  label: 'Snapshot the top 5 competing pages',
  description: 'What kind of pages win for this keyword and what makes them win',
  artifact_kind: 'competitor_snapshot',
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const keyword = ctx.scope.keyword as string;
    const cacheKey = `comp:${keyword.toLowerCase().slice(0, 100)}`;
    const cached = await getKnowledge({
      projectId: ctx.projectId,
      knowledgeType: 'competitor_snapshot',
      key: cacheKey,
    });
    if (cached) {
      return {
        ok: true,
        output: cached.value,
        artifact: {
          kind: 'competitor_snapshot',
          title: `Top-ranking pages for "${keyword}"`,
          body: renderCompetitorArtifact(keyword, cached.value),
        },
        honest_note: `Used cached competitor snapshot (refreshed ${cached.updatedAt.slice(0,10)}).`,
      };
    }

    const sys = `You are S.E.A.S.O.N. analyzing what wins the SERP for an SEO keyword. Reply with ONLY valid JSON:
{
  "top_pages": [
    {
      "url": "...",
      "title": "...",
      "domain": "...",
      "rank_position": 1,
      "page_format": "guide | listicle | comparison | tool | product_page | blog | other",
      "word_count_estimate": "short (<800) | medium (800-2000) | long (2000-4000) | very_long (>4000)",
      "structure_pattern": "what sections, what flow, what unique angle",
      "why_it_ranks": "the specific reasons this page wins this query"
    }
  ],
  "shared_patterns": ["patterns across top 3-5 — content structure these pages agree on"],
  "content_gap_opportunity": "what's missing from top results that we could uniquely offer"
}
Use web_search to actually look at the SERP. Don't fabricate URLs.`;
    const usr = `Snapshot the top 5 pages currently ranking for: "${keyword}"`;
    const r = await callLlmWeb({ systemPrompt: sys, userMessage: usr, maxTokens: 3000, maxUses: 5 });
    if (!r.ok || !r.parsed) {
      return { ok: false, error: r.error || 'competitor snapshot failed', llm_calls: 1 };
    }

    await cacheKnowledge({
      projectId: ctx.projectId,
      knowledgeType: 'competitor_snapshot',
      key: cacheKey,
      value: r.parsed,
      summary: `Top 5 for "${keyword}"`,
      source: 'web_search',
      sourceUrls: r.citations?.map(c => c.url),
      confidence: r.webUsed ? 0.85 : 0.5,
    });

    return {
      ok: true,
      output: r.parsed,
      artifact: {
        kind: 'competitor_snapshot',
        title: `Top-ranking pages for "${keyword}"`,
        body: renderCompetitorArtifact(keyword, r.parsed),
      },
      honest_note: r.webUsed
        ? `Live SERP snapshot — ${r.citations?.length || 0} pages reviewed.`
        : `Couldn't run live SERP — output may be approximate.`,
      llm_calls: 1,
      web_searches: r.webUsed ? (r.citations?.length || 1) : 0,
    };
  },
};

function renderCompetitorArtifact(keyword: string, data: any): string {
  const pages = (data.top_pages || []).map((p: any) =>
    `### ${p.rank_position}. ${p.title || p.domain || 'untitled'}\n` +
    `**URL:** ${p.url}\n` +
    `**Format:** ${p.page_format} · **Length:** ${p.word_count_estimate}\n` +
    `**Structure:** ${p.structure_pattern}\n` +
    `**Why it ranks:** ${p.why_it_ranks}\n`
  ).join('\n---\n\n');
  return `# Competitor Snapshot: "${keyword}"\n\n${pages}\n\n## Shared patterns across top results\n${(data.shared_patterns || []).map((p: string) => `- ${p}`).join('\n')}\n\n## Content gap opportunity\n${data.content_gap_opportunity || '—'}\n`;
}

/* ─── STEP 4: Strategy plan ─────────────────────────────────── */

const stepStrategyPlan = {
  id: 'strategy_plan',
  label: 'Build the ranking strategy',
  description: 'The play we\'ll run, synthesized from research + GSC + competitor analysis',
  artifact_kind: 'plan',
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const keyword = ctx.scope.keyword as string;
    const research = ctx.prior.keyword_research;
    const gsc = ctx.prior.gsc_context;
    const competitors = ctx.prior.competitor_snapshot;

    const sys = `You are S.E.A.S.O.N. building an SEO ranking strategy. You have keyword research, the project's GSC data, and a competitor snapshot. Synthesize a tight, actionable plan. Reply with ONLY valid JSON:
{
  "strategy_name": "short evocative name",
  "horizon_weeks": 4,
  "target_page_recommendation": "new_page | refresh_existing | create_cluster",
  "target_url_suggestion": "/proposed-slug or 'identify existing page first'",
  "approach": "1-2 sentence summary of the play",
  "phases": [
    { "phase": "research", "duration_days": 3, "deliverables": ["..."] },
    { "phase": "content", "duration_days": 7, "deliverables": ["..."] },
    { "phase": "publish", "duration_days": 1, "deliverables": ["..."] },
    { "phase": "promote", "duration_days": 14, "deliverables": ["..."] }
  ],
  "expected_impact": "honest range — best case, realistic case, downside",
  "kpi_to_watch": ["primary metric to track this against"],
  "risks_and_mitigations": [
    { "risk": "...", "mitigation": "..." }
  ]
}
Be honest about expected impact — not all keywords are winnable.`;
    const usr = `Synthesize a ranking strategy for "${keyword}".

KEYWORD RESEARCH:
${JSON.stringify(research, null, 2)}

CURRENT GSC POSITION:
${JSON.stringify(gsc, null, 2)}

COMPETITOR SNAPSHOT:
${JSON.stringify(competitors, null, 2)}`;
    const r = await callLlmJson({ systemPrompt: sys, userMessage: usr, maxTokens: 2500 });
    if (!r.ok || !r.parsed) {
      return { ok: false, error: r.error || 'strategy failed', llm_calls: 1 };
    }

    return {
      ok: true,
      output: r.parsed,
      artifact: {
        kind: 'plan',
        title: `Strategy: ${r.parsed.strategy_name || keyword}`,
        body: renderStrategyArtifact(keyword, r.parsed),
      },
      llm_calls: 1,
    };
  },
};

function renderStrategyArtifact(keyword: string, data: any): string {
  const phases = (data.phases || []).map((p: any) =>
    `### ${p.phase} (${p.duration_days}d)\n${(p.deliverables || []).map((d: string) => `- ${d}`).join('\n')}`
  ).join('\n\n');
  const risks = (data.risks_and_mitigations || []).map((r: any) =>
    `- **${r.risk}** → ${r.mitigation}`
  ).join('\n');
  return `# Strategy: ${data.strategy_name || keyword}

**Approach:** ${data.approach || '—'}
**Horizon:** ${data.horizon_weeks || '?'} weeks
**Target page recommendation:** ${data.target_page_recommendation || '—'}
**Suggested URL:** ${data.target_url_suggestion || '—'}

## Phases
${phases}

## Expected impact
${data.expected_impact || '—'}

## KPIs to watch
${(data.kpi_to_watch || []).map((k: string) => `- ${k}`).join('\n')}

## Risks
${risks || '(none flagged)'}
`;
}

/* ─── STEP 5: Content brief (leverages existing content-engine) ─── */

const stepContentBrief = {
  id: 'content_brief',
  label: 'Generate the full content brief',
  description: 'H1 / H2 outline, target word count, internal links, schema',
  artifact_kind: 'brief',
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const keyword = ctx.scope.keyword as string;
    try {
      const { generateContentBrief } = await import("./content-engine.js");
      const result: any = await generateContentBrief(ctx.projectId, keyword, 'high');
      if (!result || result.success === false) {
        return { ok: false, error: result?.error || 'brief generation returned nothing', llm_calls: 1 };
      }
      return {
        ok: true,
        output: result.brief || result,
        artifact: {
          kind: 'brief',
          title: `Content brief: "${keyword}"`,
          body: typeof result.brief === 'string'
            ? result.brief
            : JSON.stringify(result.brief || result, null, 2),
        },
        honest_note: 'Brief produced by existing content-engine; ready for writer (or the next pipeline step in Phase 13).',
        llm_calls: 1,
      };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'content-engine import failed', llm_calls: 0 };
    }
  },
};

/* ─── STEP 6: Client-facing progress update (Manav's voice) ──── */

const stepClientUpdate = {
  id: 'client_update',
  label: 'Draft the client-facing progress update',
  description: 'In Manav\'s voice, no AI/pipeline mention',
  artifact_kind: 'client_update',
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const keyword = ctx.scope.keyword as string;
    const strategy = ctx.prior.strategy_plan || {};
    const competitors = ctx.prior.competitor_snapshot || {};
    const research = ctx.prior.keyword_research || {};

    const sys = `You are drafting an email update from Manav (an SEO operator) to his client. Speak in his voice: direct, plain English, no fluff, no AI references, no pipeline jargon. Reply with ONLY valid JSON:
{
  "subject": "...",
  "body": "the full email — markdown OK"
}
Keep it under 350 words. Lead with what's been done. Then what's coming. Then what we expect.
Honesty: don't claim impact that hasn't happened. Talk about the work and the timeline.`;
    const usr = `Draft a progress update for the client about our work on ranking for "${keyword}".

WHAT WE'VE COMPLETED:
- Researched the keyword (intent: ${research.primary_intent || 'unknown'}, difficulty: ${research.competitive_difficulty || 'unknown'})
- Analyzed top-ranking competitors for the SERP
- Built a ${strategy.horizon_weeks || '4'}-week strategy: ${strategy.strategy_name || 'see plan'}
- Drafted the content brief for the target article

WHAT'S NEXT:
${(strategy.phases || []).map((p: any) => `- ${p.phase}: ${(p.deliverables || []).join(', ')}`).join('\n')}

CONTEXT FOR YOUR TONE:
- Manav is competent, not chatty
- Numbers when they exist, no inflated promises
- Client should feel informed, not pitched`;
    const r = await callLlmJson({ systemPrompt: sys, userMessage: usr, maxTokens: 1500 });
    if (!r.ok || !r.parsed) {
      return { ok: false, error: r.error || 'client update failed', llm_calls: 1 };
    }
    return {
      ok: true,
      output: r.parsed,
      artifact: {
        kind: 'email',
        title: `Client update: "${keyword}"`,
        body: `Subject: ${r.parsed.subject || `Update on ${keyword}`}\n\n${r.parsed.body || ''}`,
      },
      honest_note: 'Drafted in Manav\'s voice for client review. Edit freely before sending.',
      llm_calls: 1,
    };
  },
};

/* ─── STEP 7: Internal handover doc (for the PM) ─────────────── */

const stepInternalHandover = {
  id: 'internal_handover',
  label: 'Internal handover document',
  description: 'For the project manager — accurate provenance, full context',
  artifact_kind: 'internal_doc',
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const keyword = ctx.scope.keyword as string;
    const research = ctx.prior.keyword_research || {};
    const strategy = ctx.prior.strategy_plan || {};
    const competitors = ctx.prior.competitor_snapshot || {};
    const gsc = ctx.prior.gsc_context || {};

    /* No LLM needed — pure template. Faster and cheaper. */
    const body = `# Internal Handover: Rank-for-Keyword Pipeline
**Target keyword:** ${keyword}
**Generated by:** S.E.A.S.O.N. (autonomous pipeline)
**Date:** ${new Date().toISOString().slice(0, 10)}

## Provenance — what's real, what's inferred

This document is the *internal* counterpart to the client-facing update. Accuracy here is the audit trail.

**Data used:**
- Keyword research: ${research.primary_intent ? `live (${research.competitive_difficulty} difficulty)` : 'fallback to training knowledge'}
- GSC: ${gsc.current_ranking ? `currently at position ${gsc.current_ranking.position?.toFixed?.(1)}` : (gsc.neighboring?.length > 0 ? `${gsc.neighboring.length} neighboring queries found` : 'no GSC data available for this keyword')}
- Competitor snapshot: ${competitors.top_pages?.length || 0} pages analyzed

## Strategy outline

${strategy.strategy_name ? `**${strategy.strategy_name}** — ${strategy.approach || ''}` : '(strategy step failed)'}

**Phases:**
${(strategy.phases || []).map((p: any) => `- ${p.phase} (${p.duration_days}d): ${(p.deliverables || []).slice(0, 3).join('; ')}`).join('\n')}

**Expected impact:** ${strategy.expected_impact || '—'}
**Risks flagged:** ${(strategy.risks_and_mitigations || []).length}

## For the PM

- Created strategy can be moved to the planning board manually, or wait for next pipeline phase that creates it directly
- Content brief is in the artifacts list — ready to assign to a writer
- All artifacts produced this run are in season_pipeline_runs.final_artifacts for this run ID
- Manav's client update is ready in artifacts — review and send

## Next steps if a human were doing this

1. Review client update — adjust tone if needed, send
2. Review content brief — assign to writer with target date
3. Track new page ranking weekly for the first month
4. Watch ${(strategy.kpi_to_watch || ['organic clicks']).join(', ')} for the strategy's KPI window
`;

    return {
      ok: true,
      output: { generated: true },
      artifact: {
        kind: 'internal_doc',
        title: `Internal handover: "${keyword}"`,
        body,
      },
      honest_note: 'Internal doc keeps full provenance — S.E.A.S.O.N. attribution preserved. Client update keeps Manav\'s voice. Both deliverables are now in the run\'s artifacts.',
    };
  },
};
