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
  timeoutMs?:   number;
}): Promise<{ ok: boolean; parsed?: any; raw?: string; error?: string; tokens?: number }> {
  if (!ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY missing" };
  const fetchTimeoutMs = opts.timeoutMs || 90_000;
  const ac = new AbortController();
  const abortTimer = setTimeout(() => ac.abort(new Error(`fetch timeout after ${fetchTimeoutMs}ms`)), fetchTimeoutMs);
  console.log(`[callLlmJson] starting fetch (timeout ${fetchTimeoutMs}ms, max_tokens ${opts.maxTokens || 2000})`);
  const startedAt = Date.now();
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
      signal: ac.signal,
    });
    console.log(`[callLlmJson] fetch completed in ${Date.now() - startedAt}ms, status ${res.status}`);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, error: `Anthropic ${res.status}: ${errText.slice(0, 200)}` };
    }
    const data = await res.json();
    const text = (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    if (!text) {
      return { ok: false, error: 'LLM returned empty content', raw: JSON.stringify(data).slice(0, 200) };
    }
    /* Try to extract JSON from the response. The LLM may wrap it in ```json fences
       or surround it with prose. Try several extraction strategies in order. */
    const extracted = extractJson(text);
    if (extracted) {
      return { ok: true, parsed: extracted, raw: text, tokens: data?.usage?.output_tokens };
    }
    /* Honest failure — parse didn't succeed. Return the raw text so the caller
       can decide what to do (don't pretend success). */
    return {
      ok: false,
      error: `LLM response was not valid JSON (got ${text.length} chars; first 100: "${text.slice(0, 100).replace(/\n/g, ' ')}")`,
      raw: text,
    };
  } catch (e: any) {
    const isAbort = e?.name === 'AbortError' || /aborted|timeout/i.test(String(e?.message));
    const elapsedMs = Date.now() - startedAt;
    console.log(`[callLlmJson] failed after ${elapsedMs}ms — ${isAbort ? 'aborted (timeout)' : 'error'}: ${e?.message}`);
    return {
      ok: false,
      error: isAbort
        ? `Anthropic call aborted after ${(elapsedMs/1000).toFixed(0)}s (timeout hit)`
        : (e?.message || "fetch failed"),
    };
  } finally {
    clearTimeout(abortTimer);
  }
}

/* JSON extraction with multiple fallback strategies. Returns parsed object
   or null. Never throws. */
function extractJson(text: string): any | null {
  /* Strategy 1: strip markdown fences, parse */
  const fenced = text.replace(/^```json\s*/i, "").replace(/^```\s*/m, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(fenced); } catch { /* fall through */ }

  /* Strategy 2: find the first { and last } and parse between them */
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = text.slice(firstBrace, lastBrace + 1);
    try { return JSON.parse(slice); } catch { /* fall through */ }
  }

  /* Strategy 3: same for arrays */
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const slice = text.slice(firstBracket, lastBracket + 1);
    try { return JSON.parse(slice); } catch { /* fall through */ }
  }

  /* Strategy 4: JSON repair — fix common LLM mistakes before giving up.
     Most failures from LLMs are: trailing commas, smart quotes, unescaped
     newlines inside strings, and unbalanced brackets. Try repairs on the
     largest brace/bracket region we found. */
  const candidate = (firstBrace !== -1 && lastBrace > firstBrace)
    ? text.slice(firstBrace, lastBrace + 1)
    : (firstBracket !== -1 && lastBracket > firstBracket)
      ? text.slice(firstBracket, lastBracket + 1)
      : null;
  if (candidate) {
    const repaired = repairJson(candidate);
    if (repaired) {
      try { return JSON.parse(repaired); } catch { /* still bad — give up */ }
    }
  }

  return null;
}

/* Common-mistake repairs for LLM-produced JSON. Returns the repaired string
   or null if we can't make it valid. Conservative — only fixes things that
   are unambiguous. */
function repairJson(s: string): string | null {
  let out = s;

  /* 1. Replace smart quotes with straight quotes */
  out = out.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

  /* 2. Strip trailing commas before } or ] */
  out = out.replace(/,(\s*[}\]])/g, '$1');

  /* 3. Try to balance brackets — count and append missing closers.
     ONLY safe if the open/close counts are off by a small amount. */
  let braceDepth = 0, bracketDepth = 0, inString = false, escape = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"' && !escape) { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') braceDepth++;
    else if (c === '}') braceDepth--;
    else if (c === '[') bracketDepth++;
    else if (c === ']') bracketDepth--;
  }
  /* Close unterminated string */
  if (inString) out += '"';
  /* Append missing closers */
  while (bracketDepth-- > 0) out += ']';
  while (braceDepth-- > 0)   out += '}';

  /* 4. Final sanity: try parse. If still bad, return null. */
  try { JSON.parse(out); return out; } catch { return null; }
}

/* ─── Helper: call LLM with web search ───────────────────────── */

async function callLlmWeb(opts: {
  systemPrompt: string;
  userMessage:  string;
  maxTokens?:   number;
  maxUses?:     number;
  timeoutMs?:   number;
}): Promise<{ ok: boolean; parsed?: any; citations?: Array<{ url: string; title?: string }>; webUsed?: boolean; error?: string }> {
  if (!ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY missing" };
  /* Belt-and-suspenders timeout: this aborts the fetch at the network layer,
     independent of the step-level Promise.race timeout. Defaults to 100s so
     it always fires before the 120s step timeout if the request hangs. */
  const fetchTimeoutMs = opts.timeoutMs || 100_000;
  const ac = new AbortController();
  const abortTimer = setTimeout(() => ac.abort(new Error(`fetch timeout after ${fetchTimeoutMs}ms`)), fetchTimeoutMs);
  console.log(`[callLlmWeb] starting fetch (timeout ${fetchTimeoutMs}ms, max_uses ${opts.maxUses || 4})`);
  const startedAt = Date.now();
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
      signal: ac.signal,
    });
    console.log(`[callLlmWeb] fetch completed in ${Date.now() - startedAt}ms, status ${res.status}`);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, error: `Anthropic ${res.status}: ${errText.slice(0, 200)}` };
    }
    const data = await res.json();
    const text = (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");

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
    /* Detect whether the model actually used web_search. The block-type for
       server-side tools is "server_tool_use" (not "tool_use" — that's for
       client-callable tools). We also check for the presence of any
       web_search citations as a fallback signal, since the citation
       extraction above is the most reliable proof that a search ran. */
    const webUsed = citations.length > 0 || (data?.content || []).some((b: any) =>
      (b.type === "server_tool_use" || b.type === "tool_use" || b.type === "web_search_tool_result")
      && (b.name === "web_search" || b.server_name === "web_search")
    );

    if (!text) {
      return { ok: false, error: 'LLM returned empty content', citations, webUsed };
    }

    const extracted = extractJson(text);
    if (extracted) {
      return { ok: true, parsed: extracted, citations, webUsed };
    }
    return {
      ok: false,
      error: `LLM response was not valid JSON (got ${text.length} chars; first 100: "${text.slice(0, 100).replace(/\n/g, ' ')}")`,
      citations,
      webUsed,
    };
  } catch (e: any) {
    const isAbort = e?.name === 'AbortError' || /aborted|timeout/i.test(String(e?.message));
    const elapsedMs = Date.now() - startedAt;
    console.log(`[callLlmWeb] failed after ${elapsedMs}ms — ${isAbort ? 'aborted (timeout)' : 'error'}: ${e?.message}`);
    return {
      ok: false,
      error: isAbort
        ? `Anthropic web-search call aborted after ${(elapsedMs/1000).toFixed(0)}s (timeout hit)`
        : (e?.message || "fetch failed"),
    };
  } finally {
    clearTimeout(abortTimer);
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
    /* Phase 13a-v4: brief sub-pipeline can use up to 12 LLM calls on its own
       (skeleton + 8 section expansions + facts + internal links + writer synthesis).
       Other steps use 3-4 between them. 25 gives comfortable headroom for
       retries without runaway cost. */
    llm_call_cap: 25,
    steps: [
      stepKeywordResearch,
      stepGscContext,
      stepCompetitorSnapshot,
      stepStrategyPlan,
      stepForecast,              // Phase 12.5a — commit to numbers and schedule monitoring
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
    const research    = ctx.prior.keyword_research    || {};
    const gsc         = ctx.prior.gsc_context         || {};
    const competitors = ctx.prior.competitor_snapshot || {};

    /* Phase 14.2 — note any missing upstream so we can flag the strategy as
       lower-confidence rather than silently producing thin output. */
    const missingUpstream: string[] = [];
    if (Object.keys(research).length === 0)    missingUpstream.push('keyword_research');
    if (Object.keys(gsc).length === 0)         missingUpstream.push('gsc_context');
    if (Object.keys(competitors).length === 0) missingUpstream.push('competitor_snapshot');

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

    /* First attempt — generous token budget */
    let r = await callLlmJson({ systemPrompt: sys, userMessage: usr, maxTokens: 3500 });
    let callsMade = 1;

    /* If parse failed, try once more with explicit "be concise, valid JSON only" */
    if (!r.ok) {
      const strictSys = sys + `

CRITICAL: Your previous response was not valid JSON. Reply with ONLY the JSON object, no markdown fences, no prose before or after. Keep each string under 200 chars. Phases array must have exactly 4 items. Deliverables arrays must have 2-4 items each.`;
      r = await callLlmJson({ systemPrompt: strictSys, userMessage: usr, maxTokens: 4000 });
      callsMade = 2;
    }

    if (!r.ok || !r.parsed) {
      /* Honest failure — but don't lose the run. Return a degraded artifact
         that says clearly what happened so the user knows to retry the step. */
      return {
        ok: false,
        error: r.error || 'strategy synthesis failed after 2 attempts',
        llm_calls: callsMade,
      };
    }

    /* Validate the response has the minimum required structure */
    const hasMinStructure = r.parsed.strategy_name && (r.parsed.approach || r.parsed.phases);
    if (!hasMinStructure) {
      return {
        ok: false,
        error: `Strategy response missing required fields. Got keys: ${Object.keys(r.parsed).join(', ')}.`,
        llm_calls: callsMade,
      };
    }

    return {
      ok: true,
      output: r.parsed,
      artifact: {
        kind: 'plan',
        title: `Strategy: ${r.parsed.strategy_name || keyword}`,
        body: renderStrategyArtifact(keyword, r.parsed),
      },
      honest_note: [
        callsMade > 1 ? `First attempt returned malformed JSON; retried with stricter prompt.` : null,
        missingUpstream.length > 0
          ? `⚠️ Built without these upstream steps: ${missingUpstream.join(', ')}. Strategy may be less specific without that data. Re-run those steps for a more grounded plan.`
          : null,
      ].filter(Boolean).join(' ') || undefined,
      llm_calls: callsMade,
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
  description: 'Five-stage sub-pipeline: skeleton + per-section expansion + facts research + internal links + writer brief',
  artifact_kind: 'brief',
  continue_on_fail: true,
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const keyword    = ctx.scope.keyword as string;
    const research   = ctx.prior.keyword_research || {};
    const strategy   = ctx.prior.strategy_plan    || {};
    const competitors = ctx.prior.competitor_snapshot || {};
    const gsc        = ctx.prior.gsc_context      || {};

    let totalLlm = 0;
    let totalWeb = 0;
    const stepNotes: string[] = [];

    /* ════════ STAGE 1 — SKELETON ═════════════════════════════════
       Title, meta, intent, H2 headings, unique angle, schema.
       Kept lean — small input, low token cap. */
    const stratLine = strategy.strategy_name
      ? `Strategy: ${strategy.strategy_name} \u2014 ${(strategy.approach || '').slice(0, 200)}`
      : '';
    const compLine = competitors.top_pages?.length
      ? `Top competitors: ${competitors.top_pages.slice(0, 5).map((p: any) => p.domain).filter(Boolean).join(', ')}`
      : '';
    const gscLine = gsc.current_ranking?.position
      ? `Currently ranking at position ${gsc.current_ranking.position} for this query.`
      : 'No current GSC traction.';
    const intentLine = research.primary_intent
      ? `Intent: ${research.primary_intent}. ${research.intent_explanation || ''}`
      : '';

    const skelSys = `You output ONLY valid JSON for an SEO content brief skeleton. No prose, no fences.

Required shape:
{
  "title": "H1 (60-70 chars)",
  "meta_description": "140-160 chars",
  "search_intent": "informational|commercial|transactional|navigational",
  "target_word_count": 2500,
  "section_headings": ["H2 1", "H2 2", "H2 3", "H2 4", "H2 5", "H2 6", "H2 7", "H2 8"],
  "secondary_keywords": ["3-7 supporting phrases"],
  "unique_angle": "1 sentence",
  "schema_recommendation": "Article|FAQ|HowTo + 5-word why"
}

Rules:
- 6-10 H2 headings, ordered for reader flow
- Headings are specific, not generic
- Secondary keywords are real variations searchers use, not synonyms`;

    const skelUsr = `Keyword: "${keyword}"
${intentLine}
${gscLine}
${compLine}
${stratLine}

Produce the JSON skeleton.`;

    let skelR = await callLlmJson({ systemPrompt: skelSys, userMessage: skelUsr, maxTokens: 1200, timeoutMs: 90_000 });
    totalLlm++;
    if (!skelR.ok) {
      const strict = skelSys + `\n\nCRITICAL: ONLY the JSON object. No fences. No prose.`;
      skelR = await callLlmJson({ systemPrompt: strict, userMessage: skelUsr, maxTokens: 1200, timeoutMs: 90_000 });
      totalLlm++;
    }
    if (!skelR.ok || !skelR.parsed) {
      return { ok: false, error: `Skeleton stage failed: ${skelR.error || 'no response'}`, llm_calls: totalLlm };
    }
    const skel: any = skelR.parsed;
    const headings: string[] = Array.isArray(skel.section_headings) ? skel.section_headings.filter((h: any) => typeof h === 'string' && h.length > 0) : [];
    if (!skel.title || headings.length < 3) {
      return { ok: false, error: `Skeleton missing structure (title="${skel.title}", ${headings.length} headings)`, llm_calls: totalLlm };
    }

    /* ════════ STAGE 2 \u2014 PER-SECTION EXPANSION ══════════════
       One LLM call per H2 heading. Tiny output per call (200-300 tokens).
       Sequential to avoid Vercel concurrent-fetch issues. If one fails,
       we record the section without key_points and continue. */
    const expanded: any[] = [];
    let sectionsFullyExpanded = 0;
    let sectionsPartial       = 0;

    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      const expSys = `You output ONLY valid JSON expanding ONE section of an SEO content brief. No prose, no fences.

Required shape:
{
  "intent": "what this section answers (1 sentence)",
  "key_points": ["4-6 specific points \u2014 facts, claims, comparisons, examples, NOT generic SEO advice"],
  "word_target": 300,
  "examples_to_cite": ["1-3 concrete examples or scenarios writer should include"],
  "suggested_subheadings": ["1-3 H3 subheadings if depth warrants"]
}

Rules:
- key_points must be SPECIFIC to this section's heading
- Reference the unique_angle where relevant
- examples_to_cite must be concrete (real scenarios, real comparisons), not abstract`;

      const expUsr = `Article: "${skel.title}"
Article unique angle: ${skel.unique_angle}
Article target word count: ${skel.target_word_count}

Expand THIS section: "${h}"
(It is section ${i + 1} of ${headings.length} in the article.)

Other sections in the article (for context, don't duplicate their content):
${headings.map((other, idx) => idx === i ? null : `- ${other}`).filter(Boolean).join('\n')}

Produce JSON for this one section only.`;

      let r = await callLlmJson({ systemPrompt: expSys, userMessage: expUsr, maxTokens: 700, timeoutMs: 30_000 });
      totalLlm++;
      if (!r.ok) {
        /* One retry with stricter framing */
        const strict = expSys + `\n\nCRITICAL: ONLY the JSON object. Start with { and end with }.`;
        r = await callLlmJson({ systemPrompt: strict, userMessage: expUsr, maxTokens: 700, timeoutMs: 30_000 });
        totalLlm++;
      }
      if (r.ok && r.parsed) {
        expanded.push({
          h2: h,
          intent: r.parsed.intent || '',
          key_points: Array.isArray(r.parsed.key_points) ? r.parsed.key_points : [],
          word_target: r.parsed.word_target || Math.round((skel.target_word_count || 2500) / headings.length),
          examples_to_cite: Array.isArray(r.parsed.examples_to_cite) ? r.parsed.examples_to_cite : [],
          suggested_subheadings: Array.isArray(r.parsed.suggested_subheadings) ? r.parsed.suggested_subheadings : [],
        });
        sectionsFullyExpanded++;
      } else {
        expanded.push({
          h2: h,
          intent: '',
          key_points: [],
          word_target: Math.round((skel.target_word_count || 2500) / headings.length),
          examples_to_cite: [],
          suggested_subheadings: [],
          _expansion_failed: r.error || 'unknown',
        });
        sectionsPartial++;
      }
    }
    if (sectionsPartial > 0) stepNotes.push(`${sectionsPartial} of ${headings.length} sections only have heading-level info (expansion failed); ${sectionsFullyExpanded} are fully expanded.`);

    /* ════════ STAGE 3 \u2014 FACTS RESEARCH (with web_search) ═══
       Verify 5-8 must-include facts with real sources.
       This is the one place we pay for web search in the brief generation. */
    const factsSys = `You output ONLY valid JSON. No prose, no fences.

Use web_search to verify each fact you propose. Every fact MUST have a real source URL you actually retrieved.

Required shape:
{
  "must_include_facts": [
    {
      "fact": "the specific claim/statistic/quote",
      "source_url": "https://...",
      "source_title": "page title",
      "why_it_matters": "why this fact strengthens the article"
    }
  ]
}

Rules:
- 5-8 facts total
- Facts must be SPECIFIC (numbers, dates, named entities, official standards) \u2014 not generic claims
- If you cannot verify a fact, do NOT include it. Better fewer real facts than padded ones.`;

    const factsUsr = `Article: "${skel.title}"
Article topic: "${keyword}"
Article angle: ${skel.unique_angle}

Section headings (so you know what the article will cover):
${headings.map((h, idx) => `${idx + 1}. ${h}`).join('\n')}

Find 5-8 specific verifiable facts the writer must include. Use web_search to get real sources for each.`;

    const factsR = await callLlmWeb({ systemPrompt: factsSys, userMessage: factsUsr, maxTokens: 2000, maxUses: 6, timeoutMs: 90_000 });
    totalLlm++;
    if (factsR.webUsed) totalWeb += factsR.citations?.length || 0;

    let mustIncludeFacts: any[] = [];
    if (factsR.ok && factsR.parsed?.must_include_facts) {
      mustIncludeFacts = Array.isArray(factsR.parsed.must_include_facts) ? factsR.parsed.must_include_facts : [];
    } else {
      stepNotes.push(`Facts research returned no verified facts: ${factsR.error || 'no parse'}. Brief will need facts added manually.`);
    }

    /* ════════ STAGE 4 \u2014 INTERNAL LINK ANALYSIS ═════════════
       Read project GSC top_pages (cached) + suggest internal links.
       If no GSC data, output suggestions of anchor concepts only. */
    let internalLinks: any[] = [];
    let internalLinkNote = '';
    try {
      const { data: gscPages } = await db().from("project_knowledge")
        .select("field_value")
        .eq("project_id", ctx.projectId)
        .eq("category", "analytics")
        .eq("field_key", "gsc_top_pages")
        .maybeSingle();

      const pages: any[] = (gscPages as any)?.field_value
        ? (typeof (gscPages as any).field_value === 'string'
            ? JSON.parse((gscPages as any).field_value)
            : (gscPages as any).field_value)
        : [];

      if (pages.length > 0) {
        const linkSys = `You output ONLY valid JSON. No prose, no fences.

The user gives you (a) the new article being briefed, and (b) a list of EXISTING pages on the project's site (from GSC).

Suggest 3-6 INTERNAL LINKS \u2014 specific pages from the list that should link IN to the new article, OR pages the new article should link OUT to.

Required shape:
{
  "internal_links": [
    {
      "direction": "in" | "out",
      "from_or_to_url": "https://...",
      "anchor_text": "natural anchor text",
      "rationale": "why this link helps ranking or UX"
    }
  ]
}

Rules:
- Choose pages where the topical relevance is genuine, not forced
- "in" = existing page links TO the new article (passes authority)
- "out" = new article links TO an existing page (helps navigation + relevance)
- Anchor text must read naturally, contain relevant terms, NOT exact-match spammy`;

        const linkUsr = `NEW ARTICLE being briefed:
- Title: "${skel.title}"
- Keyword: "${keyword}"
- Sections: ${headings.join(' | ')}

EXISTING PAGES on the site (with their current GSC top queries):
${pages.slice(0, 30).map((p: any) => `- ${p.page || p.url}  (top queries: ${(p.top_queries || []).slice(0, 3).join(', ')})`).join('\n')}

Suggest internal links.`;

        const linkR = await callLlmJson({ systemPrompt: linkSys, userMessage: linkUsr, maxTokens: 1500, timeoutMs: 45_000 });
        totalLlm++;
        if (linkR.ok && Array.isArray(linkR.parsed?.internal_links)) {
          internalLinks = linkR.parsed.internal_links;
        } else {
          internalLinkNote = `Internal link analysis returned no suggestions: ${linkR.error || 'no parse'}.`;
        }
      } else {
        internalLinkNote = 'No GSC top_pages available for this project \u2014 connect GSC for site-aware link suggestions.';
      }
    } catch (e: any) {
      internalLinkNote = `Internal link analysis failed: ${e?.message || 'unknown'}`;
    }
    if (internalLinkNote) stepNotes.push(internalLinkNote);

    /* ════════ STAGE 5 \u2014 WRITER BRIEF SYNTHESIS ════════════
       Take everything above + write the strategic note to the writer. */
    const writerSys = `You output ONLY valid JSON. No prose, no fences.

Required shape:
{
  "writer_brief": "200-250 word strategic note covering: tone, persona/reader, what NOT to do, quality bar, reference materials",
  "tone_descriptor": "3-5 words (e.g. 'authoritative but accessible')",
  "reader_persona": "who this article is for (specific persona)",
  "things_to_avoid": ["3-5 specific things the writer must NOT do"],
  "quality_checklist": ["4-6 checks the writer/editor should run before publishing"]
}

Rules:
- The writer_brief must reference the unique_angle and how to land it
- things_to_avoid must be specific (e.g. "Don't say 'always check your local laws' \u2014 instead cite specific jurisdictional examples")
- quality_checklist must be auditable (each item is a yes/no question)`;

    const writerUsr = `Synthesize the writer brief for this article.

TITLE: ${skel.title}
ANGLE: ${skel.unique_angle}
INTENT: ${skel.search_intent}
TARGET WORDS: ${skel.target_word_count}

SECTIONS:
${expanded.map((s: any, i: number) => `${i + 1}. ${s.h2}\n   Intent: ${s.intent || '(not expanded)'}\n   Key points: ${(s.key_points || []).slice(0, 2).join('; ') || '(not expanded)'}`).join('\n')}

MUST-INCLUDE FACTS (${mustIncludeFacts.length}):
${mustIncludeFacts.slice(0, 3).map((f: any) => `\u2022 ${f.fact}`).join('\n')}

STRATEGY CONTEXT: ${strategy.strategy_name || ''} \u2014 ${(strategy.approach || '').slice(0, 200)}

Now write the writer's strategic brief.`;

    const writerR = await callLlmJson({ systemPrompt: writerSys, userMessage: writerUsr, maxTokens: 1200, timeoutMs: 45_000 });
    totalLlm++;

    let writerBriefData: any = {};
    if (writerR.ok && writerR.parsed) {
      writerBriefData = writerR.parsed;
    } else {
      stepNotes.push(`Writer brief synthesis failed: ${writerR.error || 'no parse'}. Outputting brief without writer note.`);
    }

    /* ════════ ASSEMBLE FINAL BRIEF ═══════════════════════════════ */
    const brief: any = {
      title:                  skel.title,
      meta_description:       skel.meta_description,
      primary_keyword:        keyword,
      secondary_keywords:     skel.secondary_keywords || [],
      search_intent:          skel.search_intent,
      target_word_count:      skel.target_word_count,
      unique_angle:           skel.unique_angle,
      schema_recommendation:  skel.schema_recommendation,
      outline:                expanded,
      must_include_facts:     mustIncludeFacts,
      internal_links:         internalLinks,
      writer_brief:           writerBriefData.writer_brief || '',
      tone_descriptor:        writerBriefData.tone_descriptor || '',
      reader_persona:         writerBriefData.reader_persona || '',
      things_to_avoid:        writerBriefData.things_to_avoid || [],
      quality_checklist:      writerBriefData.quality_checklist || [],
    };

    const honestNote = stepNotes.length === 0
      ? `Five-stage brief complete: ${headings.length} sections (${sectionsFullyExpanded} fully expanded), ${mustIncludeFacts.length} verified facts, ${internalLinks.length} internal link suggestions. Used ${totalLlm} LLM calls.`
      : `Brief produced with ${stepNotes.length} caveat(s): ${stepNotes.join(' ')} Used ${totalLlm} LLM calls.`;

    return {
      ok: true,
      output: brief,
      artifact: {
        kind: 'brief',
        title: `Content brief: "${keyword}"`,
        body: renderBriefArtifact(keyword, brief),
      },
      honest_note: honestNote,
      llm_calls: totalLlm,
      web_searches: totalWeb,
    };
  },
};


function renderBriefArtifact(keyword: string, brief: any): string {
  /* Outline with full per-section detail */
  const outline = (brief.outline || []).map((s: any, i: number) => {
    const kp = (s.key_points || []).length > 0
      ? (s.key_points || []).map((p: string) => `  - ${p}`).join('\n')
      : (s._expansion_failed ? `  - _(section expansion failed: ${s._expansion_failed})_` : '  - _(no key points)_');
    const examples = (s.examples_to_cite || []).length > 0
      ? `\n  **Examples to cite:**\n${(s.examples_to_cite || []).map((e: string) => `  - ${e}`).join('\n')}`
      : '';
    const subs = (s.suggested_subheadings || []).length > 0
      ? `\n  **Suggested H3s:** ${(s.suggested_subheadings || []).join(' · ')}`
      : '';
    return `### ${i + 1}. ${s.h2 || 'untitled section'}${s.word_target ? ` _(${s.word_target}w)_` : ''}
${s.intent ? `> ${s.intent}` : ''}

  **Key points:**
${kp}${examples}${subs}`;
  }).join('\n\n');

  /* Must-include facts with verified sources */
  const facts = (brief.must_include_facts || []).length > 0
    ? (brief.must_include_facts || []).map((f: any, i: number) => {
        if (typeof f === 'string') return `${i + 1}. ${f}`;
        const src = f.source_url ? ` — [${f.source_title || 'source'}](${f.source_url})` : '';
        const why = f.why_it_matters ? `\n   _Why it matters:_ ${f.why_it_matters}` : '';
        return `${i + 1}. **${f.fact || '(no fact)'}**${src}${why}`;
      }).join('\n\n')
    : '_(no facts verified — writer should add)_';

  /* Internal links with direction + anchor + rationale */
  const links = (brief.internal_links || []).length > 0
    ? (brief.internal_links || []).map((l: any, i: number) => {
        const dir = l.direction === 'in' ? '← link IN from' : l.direction === 'out' ? '→ link OUT to' : '↔';
        const anchor = l.anchor_text ? `\n   _Anchor text:_ "${l.anchor_text}"` : '';
        const why = l.rationale ? `\n   _Rationale:_ ${l.rationale}` : '';
        return `${i + 1}. ${dir} \`${l.from_or_to_url || '(no url)'}\`${anchor}${why}`;
      }).join('\n\n')
    : '_(no internal link suggestions — connect GSC to enable)_';

  /* Things to avoid */
  const avoid = (brief.things_to_avoid || []).length > 0
    ? (brief.things_to_avoid || []).map((t: string) => `- ${t}`).join('\n')
    : '_(none specified)_';

  /* Quality checklist */
  const checks = (brief.quality_checklist || []).length > 0
    ? (brief.quality_checklist || []).map((q: string) => `- [ ] ${q}`).join('\n')
    : '_(none specified)_';

  /* Secondary keywords */
  const secondary = (brief.secondary_keywords || []).length > 0
    ? (brief.secondary_keywords || []).join(', ')
    : '_(none specified)_';

  return `# Content Brief: "${keyword}"

## Top-line specs

| Field | Value |
|---|---|
| **H1 (Title)** | ${brief.title || '—'} |
| **Meta description** | ${brief.meta_description || '—'} |
| **Target word count** | ${brief.target_word_count || '—'} |
| **Search intent** | ${brief.search_intent || '—'} |
| **Schema type** | ${brief.schema_recommendation || '—'} |
| **Primary keyword** | ${brief.primary_keyword || keyword} |
| **Tone** | ${brief.tone_descriptor || '—'} |
| **Reader persona** | ${brief.reader_persona || '—'} |

**Secondary keywords:** ${secondary}

## Unique angle

${brief.unique_angle || '_(none specified)_'}

## Outline

${outline}

## Must-include facts (verified)

${facts}

## Internal link plan

${links}

## Writer brief

${brief.writer_brief || '_(writer brief synthesis failed)_'}

### Tone & persona
- **Tone:** ${brief.tone_descriptor || '—'}
- **Reader:** ${brief.reader_persona || '—'}

### Things to avoid
${avoid}

### Pre-publish quality checklist
${checks}
`;
}

/* ─── STEP 6: Client-facing progress update (Manav's voice) ──── */

const stepClientUpdate = {
  id: 'client_update',
  label: 'Draft the client-facing progress update',
  description: 'In Manav\'s voice, no AI/pipeline mention',
  artifact_kind: 'client_update',
  /* If something upstream failed, the client update can still be drafted
     describing what WAS completed honestly. Don't block on upstream failures. */
  continue_on_fail: true,
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
  /* The internal handover MUST run even when other steps failed — it documents
     what happened, including the failures. Template-only (no LLM), so always cheap. */
  continue_on_fail: true,
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

/* ─── STEP: Forecast — commit to numbers, schedule monitoring ─── */

const stepForecast = {
  id: 'forecast',
  label: 'Set realistic expectations and schedule monitoring',
  description: 'Emit forecasts for rank/clicks/impressions/CTR with trajectory + confidence + checkpoints',
  artifact_kind: 'forecast',
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const keyword = ctx.scope.keyword as string;
    const research = ctx.prior.keyword_research || {};
    const strategy = ctx.prior.strategy_plan || {};
    const gsc = ctx.prior.gsc_context || {};

    const difficulty = (research.competitive_difficulty || 'medium') as 'low' | 'medium' | 'high' | 'very_high';
    const horizonWeeks = Number(strategy.horizon_weeks || 8);
    const horizonDays = horizonWeeks * 7;

    try {
      const { createForecast } = await import("./season-forecast-engine.js");

      /* Emit 4 KPIs for a rank-for-keyword pipeline */
      const forecasts: any[] = [];
      const issues: string[] = [];

      const baselineRank = gsc.current_ranking?.position || null;
      const baselineClicks = gsc.current_ranking?.clicks || null;
      const baselineImpressions = gsc.current_ranking?.impressions || null;
      const baselineCtr = gsc.current_ranking?.ctr || null;

      /* 1. Rank position forecast — primary commitment */
      const f1 = await createForecast({
        projectId: ctx.projectId,
        kpi: 'rank_position',
        targetEntity: keyword,
        targetEntityKind: 'keyword',
        targetDayOffset: horizonDays,
        explicitBaseline: baselineRank,
        competitiveDifficulty: difficulty,
        approach: strategy.approach,
        rationale: `${horizonWeeks}-week strategy: ${strategy.strategy_name || 'unnamed'}. Expected impact stated by strategy step: ${strategy.expected_impact || 'unknown'}.`,
        assumptions: {
          strategy_horizon_weeks: horizonWeeks,
          difficulty,
          baseline_source: baselineRank ? 'gsc_top_queries' : 'estimated_position_50',
        },
      });
      if (f1.success && f1.forecast) forecasts.push(f1.forecast);
      else if (f1.error) issues.push(`rank forecast: ${f1.error}`);

      /* 2. Clicks forecast */
      const f2 = await createForecast({
        projectId: ctx.projectId,
        kpi: 'clicks',
        targetEntity: keyword,
        targetEntityKind: 'keyword',
        targetDayOffset: horizonDays,
        explicitBaseline: baselineClicks,
        competitiveDifficulty: difficulty,
      });
      if (f2.success && f2.forecast) forecasts.push(f2.forecast);
      else if (f2.error) issues.push(`clicks forecast: ${f2.error}`);

      /* 3. Impressions forecast */
      const f3 = await createForecast({
        projectId: ctx.projectId,
        kpi: 'impressions',
        targetEntity: keyword,
        targetEntityKind: 'keyword',
        targetDayOffset: horizonDays,
        explicitBaseline: baselineImpressions,
        competitiveDifficulty: difficulty,
      });
      if (f3.success && f3.forecast) forecasts.push(f3.forecast);
      else if (f3.error) issues.push(`impressions forecast: ${f3.error}`);

      /* 4. CTR forecast (lower priority — derivative) */
      if (baselineCtr !== null) {
        const f4 = await createForecast({
          projectId: ctx.projectId,
          kpi: 'ctr',
          targetEntity: keyword,
          targetEntityKind: 'keyword',
          targetDayOffset: horizonDays,
          explicitBaseline: baselineCtr,
          competitiveDifficulty: difficulty,
        });
        if (f4.success && f4.forecast) forecasts.push(f4.forecast);
      }

      if (forecasts.length === 0) {
        return {
          ok: false,
          error: `No forecasts could be created. Issues: ${issues.join('; ')}`,
        };
      }

      /* Build the artifact body */
      const body = renderForecastArtifact(keyword, forecasts, horizonWeeks);

      return {
        ok: true,
        output: { forecasts: forecasts.map(f => f.id), forecast_summary: forecasts },
        artifact: {
          kind: 'forecast',
          title: `Expected results: "${keyword}" (${horizonWeeks}w horizon)`,
          body,
        },
        honest_note: forecasts[0]?.honest_caveats
          ? `Forecasts committed with caveats: ${String(forecasts[0].honest_caveats).replace(/\.$/, '')}. Monitoring will fire at 7d, 14d, 30d intervals.`
          : `Forecasts committed. Monitoring will fire at 7d, 14d, 30d intervals.`,
      };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'forecast step threw unexpectedly' };
    }
  },
};

function renderForecastArtifact(keyword: string, forecasts: any[], horizonWeeks: number): string {
  const lines: string[] = [];
  lines.push(`# Expected Results: "${keyword}"`);
  lines.push('');
  lines.push(`**Horizon:** ${horizonWeeks} weeks (${horizonWeeks * 7} days)`);
  lines.push(`**Monitoring:** Automatic checkpoints at days 7, 14, 30${horizonWeeks >= 9 ? ', 60' : ''}${horizonWeeks >= 13 ? ', 90' : ''}`);
  lines.push('');
  lines.push('## The commitments');
  lines.push('');
  lines.push('| KPI | Baseline | Target by end | Confidence | Source |');
  lines.push('|---|---|---|---|---|');
  for (const f of forecasts) {
    const baseline = f.baseline_value !== null
      ? (f.kpi === 'ctr' ? `${(f.baseline_value * 100).toFixed(2)}%` : f.baseline_value.toFixed(2))
      : 'estimated';
    const target = f.kpi === 'ctr' ? `${(f.target_value * 100).toFixed(2)}%` : f.target_value.toFixed(2);
    const conf = `${Math.round(f.confidence * 100)}%`;
    const source = f.baseline_source || 'unknown';
    lines.push(`| ${f.kpi.replace(/_/g, ' ')} | ${baseline} | ${target} | ${conf} | ${source} |`);
  }
  lines.push('');
  lines.push('## Trajectory checkpoints');
  lines.push('');
  /* Show day 7, 14, 30 expected for the primary (rank or first forecast) */
  const primary = forecasts[0];
  if (primary && primary.trajectory) {
    lines.push(`Primary KPI: **${primary.kpi.replace(/_/g, ' ')}**`);
    lines.push('');
    lines.push('| Day | Low | Expected | High |');
    lines.push('|---|---|---|---|');
    for (const p of primary.trajectory) {
      lines.push(`| d${p.day_offset} | ${Number(p.low).toFixed(1)} | ${Number(p.expected).toFixed(1)} | ${Number(p.high).toFixed(1)} |`);
    }
  }
  lines.push('');
  lines.push('## Honest caveats');
  const caveats = forecasts[0]?.honest_caveats;
  lines.push(caveats || '(none flagged)');
  lines.push('');
  lines.push('## What happens if we drift');
  lines.push('');
  lines.push('S.E.A.S.O.N. monitors these forecasts continuously. At each checkpoint:');
  lines.push('- **On track** → recorded, no action');
  lines.push('- **Watch** → recorded, logged for attention');
  lines.push('- **Warning** → diagnostic pipeline auto-triggers, orb pulses critical');
  lines.push('- **Critical** → full escalation: diagnostic + wish emission + corrective action drafted for your approval');
  lines.push('');
  lines.push('Prevention runs continuously. Even between scheduled checkpoints, fresh GSC/GA4 data triggers anomaly checks. We do not wait for the target date to discover we missed.');
  return lines.join('\n');
}
