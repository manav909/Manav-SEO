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

/* Phase 17.5 — find the earliest step in a pipeline definition whose handler
   consumes ctx.audit_findings. Used by refresh-from-audit to know where to
   reset and re-run from. Returns -1 if no step consumes audit data. */
export function findFirstAuditDependentStepIndex(definition: PipelineDefinition): number {
  if (!definition || !Array.isArray(definition.steps)) return -1;
  for (let i = 0; i < definition.steps.length; i++) {
    if ((definition.steps[i] as any).consumes_audit === true) return i;
  }
  return -1;
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
  consumes_audit: true,  /* Phase 17.5 — wired in Phase 17.1 */
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const keyword = ctx.scope.keyword as string;
    const cacheKey = `comp:${keyword.toLowerCase().slice(0, 100)}`;

    /* Phase 17.1 — Audit-first. When the technical audit has surfaced
       SerpAPI top-10 data, use it directly. Real URLs, real word counts,
       real SERP features. No LLM call, no hallucination risk. Audit data
       is preferred over both cache (which may be stale LLM output) and
       fresh LLM call (which can hallucinate URLs). */
    const auditSourced = buildCompetitorSnapshotFromAudit(ctx.audit_findings, keyword);
    if (auditSourced) {
      /* Phase 17.1 gave us real verified URLs from SerpAPI.
         That eliminated hallucinated URLs — good.
         But it also eliminated all competitive intelligence — bad.
         Fix: use the real URLs as grounding for a targeted LLM enrichment
         call. The LLM doesn't need to find the URLs (SerpAPI did that);
         it only needs to characterise each known page. One cheap Haiku
         call (~300 output tokens) → zero URL hallucination + full intel. */
      const enriched = await enrichCompetitorSnapshotWithLlm(auditSourced, keyword);

      /* Persist to cache so downstream readers still find a snapshot */
      await cacheKnowledge({
        projectId: ctx.projectId,
        knowledgeType: 'competitor_snapshot',
        key: cacheKey,
        value: enriched,
        summary: `Top ${enriched.top_pages.length} for "${keyword}" (SerpAPI + LLM)`,
        source: 'technical_audit',
        sourceUrls: enriched.top_pages.map((p: any) => p.url).filter(Boolean),
        confidence: 0.92,
      });
      return {
        ok: true,
        output: enriched,
        artifact: {
          kind: 'competitor_snapshot',
          title: `Top-ranking pages for "${keyword}"`,
          body: renderCompetitorArtifact(keyword, enriched),
        },
        honest_note: `Sourced from technical audit (${enriched._source_note}) — ${enriched.top_pages.length} verified URLs enriched with LLM page analysis.`,
        llm_calls: enriched._llm_enriched ? 1 : 0,
      };
    }

    /* No audit data — try cache */
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
  const pages = (data.top_pages || []).map((p: any) => {
    const lines: string[] = [];
    lines.push(`### ${p.rank_position}. ${p.title || p.domain || 'untitled'}`);
    if (p.url) lines.push(`**URL:** ${p.url}`);
    if (p.page_format || p.word_count_estimate) {
      lines.push(`**Format:** ${p.page_format || '—'} · **Length:** ${p.word_count_estimate || '—'}`);
    }
    if (p.structure_pattern) lines.push(`**Structure:** ${p.structure_pattern}`);
    if (p.why_it_ranks) lines.push(`**Why it ranks:** ${p.why_it_ranks}`);
    return lines.join('\n') + '\n';
  }).join('\n---\n\n');
  return `# Competitor Snapshot: "${keyword}"\n\n${pages}\n\n## Shared patterns across top results\n${(data.shared_patterns || []).map((p: string) => `- ${p}`).join('\n')}\n\n## Content gap opportunity\n${data.content_gap_opportunity || '—'}\n`;
}

/* ─── Phase 17.1 — Audit-sourced competitor snapshot ────────────
   Build the competitor_snapshot output directly from technical audit
   findings, no LLM call required. The audit's CTR finding carries
   SerpAPI top_10_urls + top_10_domains (verified real, not LLM-guessed),
   competitive_content_benchmark carries median word counts, diffuse_intent
   carries intent classification, paaGap surfaces content opportunity.

   Returns null when the audit either hasn't run or didn't produce
   SerpAPI top-10 data (the existing LLM path remains the fallback in
   that case). */
function buildCompetitorSnapshotFromAudit(
  findings: Array<{ finding_title: string; evidence?: any }>,
  _keyword: string,
): { top_pages: any[]; shared_patterns: string[]; content_gap_opportunity: string; _source_note: string } | null {
  if (!findings || findings.length === 0) return null;

  /* CTR finding carries the SerpAPI live top-10. Match on the same regex
     pattern used in the audit's renderer (ctrFinding extractor). */
  const ctr = findings.find(f => /CTR is \d+%|CTR underperformance|CTR.*of expected|click-through/i.test(f.finding_title));
  const ctrEv = ctr?.evidence || {};
  const urls: string[] = Array.isArray(ctrEv.top_10_urls) ? ctrEv.top_10_urls : [];
  const domains: string[] = Array.isArray(ctrEv.top_10_domains) ? ctrEv.top_10_domains : [];
  if (urls.length < 3) return null;  /* not enough verified data to replace the LLM path */

  /* Competitive content benchmark — median word counts */
  const compContent = findings.find(f => /Content depth.*SERP median|content exceeds SERP median|word count.*competitor/i.test(f.finding_title));
  const ccEv = compContent?.evidence || {};

  /* Diffuse-intent SERP — intent diversity */
  const diffuse = findings.find(f => /Diffuse-intent SERP|Tight-intent SERP/i.test(f.finding_title));
  const dEv = diffuse?.evidence || {};

  /* PAA gap — content opportunity */
  const paaGap = findings.find(f => /Content gap.+PAA|PAA questions.+addressed/i.test(f.finding_title));
  const paaEv = paaGap?.evidence || {};

  /* Build top_pages from verified URLs. page_format / structure_pattern
     / why_it_ranks are intentionally omitted — qualitative judgments
     aren't in audit data and we'd rather show fewer real fields than
     fabricate any. */
  const top_pages = urls.slice(0, 8).map((url, i) => {
    let domain = domains[i] || '';
    if (!domain) {
      try { domain = new URL(url).hostname; } catch { /* keep blank */ }
    }
    return {
      url,
      domain,
      rank_position: i + 1,
    };
  });

  /* Shared patterns derive from observed signals across the audit findings */
  const shared_patterns: string[] = [];
  if (ccEv.competitor_median) {
    const range = (ccEv.competitor_min !== undefined && ccEv.competitor_max !== undefined)
      ? ` (range ${Number(ccEv.competitor_min).toLocaleString()}–${Number(ccEv.competitor_max).toLocaleString()})`
      : '';
    shared_patterns.push(`Median competitor word count: ${Number(ccEv.competitor_median).toLocaleString()} words${range} across ${ccEv.competitors_fetched || urls.length} fetched competitors`);
  }
  if (ctrEv.ai_overview) {
    shared_patterns.push(`Google AI Overview present on this SERP — citation eligibility (concise direct-answer paragraphs, structured FAQs) matters more than raw position`);
  }
  if (ctrEv.featured_snippet) {
    shared_patterns.push(`Featured snippet captured${ctrEv.featured_snippet_owner ? ' by `' + ctrEv.featured_snippet_owner + '`' : ''} — direct-answer formatting (40-60 word paragraph or list) wins this slot`);
  }
  if (ctrEv.paa_count > 0) {
    shared_patterns.push(`${ctrEv.paa_count} PAA questions live on this SERP — H2 sections answering them verbatim are AI-Overview citation candidates`);
  }
  if (ctrEv.ads_top >= 3) {
    shared_patterns.push(`${ctrEv.ads_top} paid placements at top compressing organic visibility — title/meta differentiation matters more here than typical`);
  }
  if (dEv.distinct_categories && dEv.distinct_categories >= 3) {
    shared_patterns.push(`Diffuse-intent SERP — ${dEv.distinct_categories} distinct intent categories in the top-10; users from different intents skip mismatched results, capping CTR ceiling at any position`);
  }

  /* Content gap opportunity from PAA + competitive content gaps */
  let content_gap_opportunity = '';
  if (paaEv.unanswered && Array.isArray(paaEv.unanswered) && paaEv.unanswered.length > 0) {
    content_gap_opportunity = `${paaEv.unanswered.length} live PAA question(s) lack strong coverage on this SERP. New H2 sections answering them verbatim (40-80 word direct answer + 300-500 word body) carry the highest citation-eligibility leverage.`;
  } else if (ccEv.competitor_median && ccEv.word_ratio !== undefined && Number(ccEv.word_ratio) < 0.8) {
    content_gap_opportunity = `Audited page is at ${Math.round(Number(ccEv.word_ratio) * 100)}% of the competitor median. Topic depth expansion (not filler) is the highest-leverage gap.`;
  } else if (dEv.distinct_categories && dEv.distinct_categories >= 3) {
    content_gap_opportunity = `SERP intent is diffuse (${dEv.distinct_categories} categories) — the gap may not be topical depth but intent precision. Consider whether a tighter-intent keyword variant has better economics.`;
  } else {
    content_gap_opportunity = 'No structural content-gap signal surfaced in the audit. Competitors are covering the topical surface area; the gap (if any) is likely qualitative — angle, freshness, or authority signals.';
  }

  return {
    top_pages,
    shared_patterns,
    content_gap_opportunity,
    _source_note: ctrEv.cache_hit ? `cached SerpAPI snapshot` : `fresh SerpAPI fetch`,
  };
}

/* ─── Enrich audit-sourced competitor snapshot with LLM page analysis ──
   Phase 17.1 gave us real verified URLs from SerpAPI but stripped all
   qualitative intelligence (page_format, structure_pattern, why_it_ranks).
   This function takes the verified URL list and makes ONE cheap Haiku call
   to characterise each page — no web search needed (URLs are already known),
   so there is zero hallucination risk on the page identities.

   Falls back to the URL-only snapshot if the LLM call fails. */
async function enrichCompetitorSnapshotWithLlm(
  snapshot: { top_pages: any[]; shared_patterns: string[]; content_gap_opportunity: string; _source_note: string },
  keyword: string,
): Promise<typeof snapshot & { _llm_enriched?: boolean }> {
  if (!ANTHROPIC_API_KEY || snapshot.top_pages.length === 0) {
    return snapshot;
  }

  const pageList = snapshot.top_pages.slice(0, 8).map((p, i) =>
    `${i + 1}. ${p.url}  (domain: ${p.domain || new URL(p.url).hostname})`
  ).join('\n');

  const sys = `You are an SEO analyst. You will receive a list of real URLs currently ranking for a keyword.
For each URL, infer based on the domain, URL path, and SEO knowledge:
- page_format: one of "guide" | "listicle" | "comparison" | "tool" | "product_page" | "app_store_listing" | "blog" | "landing_page" | "other"
- word_count_estimate: one of "short (<800)" | "medium (800-2000)" | "long (2000-4000)" | "very_long (>4000)"  
- structure_pattern: one sentence — what sections or flow this type of page typically uses
- why_it_ranks: one sentence — the specific authority or content signal that wins this query slot

Do NOT make up facts. If you are uncertain about a field, say so honestly.
Reply with ONLY valid JSON — no prose, no markdown fences:
{
  "pages": [
    { "url": "...", "page_format": "...", "word_count_estimate": "...", "structure_pattern": "...", "why_it_ranks": "..." }
  ]
}`;

  const usr = `Keyword: "${keyword}"\n\nVerified top-ranking URLs (from live SerpAPI fetch):\n${pageList}\n\nCharacterise each page.`;

  const r = await callLlmJson({ systemPrompt: sys, userMessage: usr, maxTokens: 1200, timeoutMs: 40_000 });

  if (!r.ok || !Array.isArray(r.parsed?.pages)) {
    console.warn(`[enrichCompetitorSnapshot] LLM enrichment failed (${r.error}) — returning URL-only snapshot`);
    return snapshot;
  }

  /* Merge LLM fields back onto the SerpAPI-sourced top_pages */
  const enrichedByUrl: Record<string, any> = {};
  for (const p of r.parsed.pages) {
    if (p.url) enrichedByUrl[p.url] = p;
  }

  const enrichedPages = snapshot.top_pages.map(p => {
    const llmData = enrichedByUrl[p.url] || {};
    return {
      ...p,
      page_format:        llmData.page_format        || undefined,
      word_count_estimate:llmData.word_count_estimate|| undefined,
      structure_pattern:  llmData.structure_pattern  || undefined,
      why_it_ranks:       llmData.why_it_ranks       || undefined,
    };
  });

  return {
    ...snapshot,
    top_pages: enrichedPages,
    _llm_enriched: true,
  };
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

/* ─── Phase 17.2 — Audit context for content brief ──────────────
   The skeleton stage of content_brief decides target word count, H2
   headings, schema, and intent — all things the audit has empirical
   ground truth for. Rather than letting the LLM guess these, we
   inject the audit's findings as structured constraints. The LLM
   still does creative work (title, meta, angle, expansion) but
   anchors its structural decisions to verified data.

   This is hybrid: audit constrains, LLM synthesizes within constraints. */

interface BriefAuditContext {
  target_word_count_hint: number | null;   /* from competitive_content_benchmark — competitor median */
  competitor_range:       { min: number; max: number } | null;
  mandatory_h2_candidates: string[];        /* from PAA gap — verbatim citation-eligible H2 candidates */
  paa_total:              number | null;    /* total PAA questions on live SERP */
  schema_guidance:        string | null;    /* derived from schema findings */
  first_paragraph_guidance: string | null;  /* derived from first-paragraph topicality findings */
  critical_signals:       string[];         /* red-severity findings the writer must know about */
  serp_features_note:     string | null;    /* AI Overview / featured snippet context */
  intent_warning:         string | null;    /* diffuse-intent SERP signal */
  source_count:           number;           /* how many audit findings we drew from */
}

function extractAuditContextForBrief(
  findings: Array<{ audit_kind: string; severity: string; finding_title: string; finding_detail?: string; recommendation?: string; evidence?: any }>,
): BriefAuditContext | null {
  if (!findings || findings.length === 0) return null;

  let sourceCount = 0;

  /* Target word count from competitive_content_benchmark */
  const compContent = findings.find(f => /Content depth.*SERP median|content exceeds SERP median|Content depth in line/i.test(f.finding_title));
  const ccEv = compContent?.evidence || {};
  const target_word_count_hint = (ccEv.competitor_median && Number(ccEv.competitor_median) > 0) ? Number(ccEv.competitor_median) : null;
  const competitor_range = (ccEv.competitor_min !== undefined && ccEv.competitor_max !== undefined)
    ? { min: Number(ccEv.competitor_min), max: Number(ccEv.competitor_max) }
    : null;
  if (target_word_count_hint) sourceCount++;

  /* PAA gap — the highest-leverage signal. These are verbatim citation-eligible
     H2 candidates straight from the live SERP. */
  const paaGap = findings.find(f => /PAA questions.+(NOT addressed|not addressed)|Content gap.+PAA/i.test(f.finding_title));
  const paaEv = paaGap?.evidence || {};
  const mandatory_h2_candidates: string[] = Array.isArray(paaEv.unanswered) ? paaEv.unanswered.slice(0, 6) : [];
  const paa_total: number | null = paaEv.paa_total !== undefined ? Number(paaEv.paa_total) : null;
  if (mandatory_h2_candidates.length > 0) sourceCount++;

  /* Schema guidance — combine presence finding (what's there) + recommendation finding (what's missing/wrong) */
  let schema_guidance: string | null = null;
  const schemaPresent = findings.find(f => /Schema present:/i.test(f.finding_title));
  const schemaMissing = findings.find(f => /(Schema|structured data).+(missing|absent|invalid)/i.test(f.finding_title));
  if (schemaMissing) {
    schema_guidance = `${schemaMissing.finding_title}${schemaMissing.recommendation ? ' — ' + schemaMissing.recommendation.slice(0, 200) : ''}`;
    sourceCount++;
  } else if (schemaPresent) {
    schema_guidance = `Existing page already uses: ${schemaPresent.finding_title.replace('Schema present: ', '')}. Maintain consistency.`;
    sourceCount++;
  }

  /* First paragraph guidance — critical for AI Overview citation eligibility */
  let first_paragraph_guidance: string | null = null;
  const firstParaOff = findings.find(f => /First paragraph is off-topic/i.test(f.finding_title));
  const firstParaWeak = findings.find(f => /First paragraph weakly aligned/i.test(f.finding_title));
  if (firstParaOff) {
    first_paragraph_guidance = `Audit detected the existing page's first paragraph is off-topic. The new brief MUST require: first paragraph (40-60 words) directly answers the query "${'X'}" with the primary keyword in sentence 1.`;
    sourceCount++;
  } else if (firstParaWeak) {
    first_paragraph_guidance = `Audit detected weak first-paragraph alignment. Brief must require first paragraph (40-60 words) using primary keyword in sentence 1 + named entity in sentence 2.`;
    sourceCount++;
  }

  /* CTR finding — SERP features context (AI Overview presence shapes content strategy) */
  const ctr = findings.find(f => /CTR is \d+%|CTR underperformance|CTR.*of expected/i.test(f.finding_title));
  const ctrEv = ctr?.evidence || {};
  let serp_features_note: string | null = null;
  const features: string[] = [];
  if (ctrEv.ai_overview) features.push('AI Overview present (citation eligibility > position)');
  if (ctrEv.featured_snippet) features.push(`featured snippet${ctrEv.featured_snippet_owner ? ' owned by `' + ctrEv.featured_snippet_owner + '`' : ''} (40-60w direct-answer wins)`);
  if (ctrEv.paa_count > 0) features.push(`${ctrEv.paa_count} PAA questions on SERP`);
  if (ctrEv.ads_top >= 3) features.push(`${ctrEv.ads_top} top ads compressing organic visibility`);
  if (features.length > 0) { serp_features_note = features.join(' · '); sourceCount++; }

  /* Diffuse-intent SERP — warning that SERP is fragmented */
  const diffuse = findings.find(f => /Diffuse-intent SERP/i.test(f.finding_title));
  const diffEv = diffuse?.evidence || {};
  let intent_warning: string | null = null;
  if (diffuse && diffEv.distinct_categories >= 3) {
    intent_warning = `SERP is intent-diffuse (${diffEv.distinct_categories} distinct categories in top-10). The brief should pick ONE intent class and execute it tightly — generic-coverage articles get punished here.`;
    sourceCount++;
  }

  /* Critical signals — red-severity findings the writer absolutely needs to know */
  const critical_signals: string[] = findings
    .filter(f => f.severity === 'red')
    .map(f => f.finding_title)
    .slice(0, 5);
  if (critical_signals.length > 0) sourceCount++;

  if (sourceCount === 0) return null;

  return {
    target_word_count_hint,
    competitor_range,
    mandatory_h2_candidates,
    paa_total,
    schema_guidance,
    first_paragraph_guidance,
    critical_signals,
    serp_features_note,
    intent_warning,
    source_count: sourceCount,
  };
}

function formatBriefAuditContextForLlm(ctx: BriefAuditContext, keyword: string): string {
  const lines: string[] = [];
  lines.push('═══ AUDIT INTELLIGENCE (verified data — do not override) ═══');

  if (ctx.target_word_count_hint) {
    const range = ctx.competitor_range ? ` (range ${ctx.competitor_range.min.toLocaleString()}–${ctx.competitor_range.max.toLocaleString()})` : '';
    lines.push(`TARGET WORD COUNT: ${ctx.target_word_count_hint.toLocaleString()} words — SERP median${range}. Set target_word_count to this value, not your own estimate.`);
  }

  if (ctx.mandatory_h2_candidates.length > 0) {
    lines.push(`MANDATORY H2 CANDIDATES (live PAA questions from SERP — high citation-eligibility):`);
    ctx.mandatory_h2_candidates.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
    lines.push(`These ${ctx.mandatory_h2_candidates.length} questions MUST appear in section_headings (verbatim where possible — they're what Google's AI Overview cites from). Add 2-4 additional H2s for full topical coverage.`);
  }

  if (ctx.schema_guidance) {
    lines.push(`SCHEMA: ${ctx.schema_guidance}`);
  }

  if (ctx.first_paragraph_guidance) {
    lines.push(`FIRST PARAGRAPH: ${ctx.first_paragraph_guidance.replace('"X"', `"${keyword}"`)}`);
  }

  if (ctx.serp_features_note) {
    lines.push(`SERP FEATURES: ${ctx.serp_features_note}`);
  }

  if (ctx.intent_warning) {
    lines.push(`INTENT WARNING: ${ctx.intent_warning}`);
  }

  if (ctx.critical_signals.length > 0) {
    lines.push(`CRITICAL SIGNALS (red-severity audit findings — writer/strategist must address):`);
    ctx.critical_signals.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
  }

  lines.push('═══ END AUDIT INTELLIGENCE ═══');
  return lines.join('\n');
}

/* ─── STEP 5: Content brief (leverages existing content-engine) ─── */

const stepContentBrief = {
  id: 'content_brief',
  label: 'Generate the full content brief',
  description: 'Five-stage sub-pipeline: skeleton + per-section expansion + facts research + internal links + writer brief',
  artifact_kind: 'brief',
  continue_on_fail: true,
  consumes_audit: true,  /* Phase 17.5 — wired in Phase 17.2 */
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const keyword    = ctx.scope.keyword as string;
    const research   = ctx.prior.keyword_research || {};
    const strategy   = ctx.prior.strategy_plan    || {};
    const competitors = ctx.prior.competitor_snapshot || {};
    const gsc        = ctx.prior.gsc_context      || {};

    let totalLlm = 0;
    let totalWeb = 0;
    const stepNotes: string[] = [];

    /* Phase 17.2 — extract audit context. When available, this anchors the
       skeleton stage to verified data (target word count, mandatory H2 candidates
       from PAA, schema, first-paragraph requirements) rather than LLM guesses. */
    const auditContext = extractAuditContextForBrief(ctx.audit_findings);
    const auditContextBlock = auditContext ? formatBriefAuditContextForLlm(auditContext, keyword) : '';
    if (auditContext) {
      stepNotes.push(`Brief anchored to ${auditContext.source_count} audit signal(s): ${[
        auditContext.target_word_count_hint && 'target word count',
        auditContext.mandatory_h2_candidates.length > 0 && `${auditContext.mandatory_h2_candidates.length} PAA H2 candidates`,
        auditContext.schema_guidance && 'schema',
        auditContext.first_paragraph_guidance && 'first paragraph',
        auditContext.serp_features_note && 'SERP features',
        auditContext.intent_warning && 'intent diversity',
        auditContext.critical_signals.length > 0 && `${auditContext.critical_signals.length} red findings`,
      ].filter(Boolean).join(', ')}.`);
    }

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
- Secondary keywords are real variations searchers use, not synonyms
- When the user provides an AUDIT INTELLIGENCE block, treat it as verified ground truth: use target_word_count from it, include mandatory H2 candidates verbatim in section_headings (you may add 2-4 of your own), honor schema guidance, and reflect the SERP features context in your unique_angle (e.g. if AI Overview is present, the angle should make the article AI-Overview-citation-ready)`;

    const skelUsr = `Keyword: "${keyword}"
${intentLine}
${gscLine}
${compLine}
${stratLine}
${auditContextBlock ? '\n' + auditContextBlock + '\n' : ''}
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
      /* Phase 17.2 — audit-sourced signals embedded as transparency metadata.
         Downstream consumers (writers, editors, audit re-checks) can see which
         brief decisions were anchored to verified audit data vs LLM judgment. */
      _audit_sourced_signals: auditContext ? {
        target_word_count_from_audit: auditContext.target_word_count_hint,
        paa_h2_candidates:            auditContext.mandatory_h2_candidates,
        schema_guidance_from_audit:   auditContext.schema_guidance,
        first_para_guidance:          auditContext.first_paragraph_guidance,
        serp_features:                auditContext.serp_features_note,
        intent_warning:               auditContext.intent_warning,
        critical_signals:             auditContext.critical_signals,
        source_count:                 auditContext.source_count,
      } : null,
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

  /* Phase 17.2 — audit-sourced signals block. Surfaces the verified audit
     intel that anchored this brief's key decisions, so writers/editors know
     which structural choices came from real audit data vs LLM judgment. */
  const audit = brief._audit_sourced_signals;
  const auditBlock = audit ? `

## 🎯 Audit-anchored decisions

This brief's structural choices were anchored to the technical audit's verified findings (${audit.source_count} signal${audit.source_count === 1 ? '' : 's'} consumed):

${audit.target_word_count_from_audit ? `- **Target word count** ${audit.target_word_count_from_audit.toLocaleString()} — pulled from competitive_content_benchmark (SERP median across fetched competitors)` : ''}
${audit.paa_h2_candidates && audit.paa_h2_candidates.length > 0 ? `- **PAA H2 candidates** (live SERP — high citation-eligibility):\n${audit.paa_h2_candidates.map((q: string) => `  - "${q}"`).join('\n')}` : ''}
${audit.schema_guidance ? `- **Schema guidance:** ${audit.schema_guidance}` : ''}
${audit.first_para_guidance ? `- **First paragraph requirement:** ${audit.first_para_guidance}` : ''}
${audit.serp_features ? `- **SERP features context:** ${audit.serp_features}` : ''}
${audit.intent_warning ? `- **Intent warning:** ${audit.intent_warning}` : ''}
${audit.critical_signals && audit.critical_signals.length > 0 ? `- **Critical (red) signals from audit:**\n${audit.critical_signals.map((s: string) => `  - ${s}`).join('\n')}` : ''}

_Brief decisions that ignore these signals are knowingly overriding verified data._
` : '';

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
${auditBlock}
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

/* ─── Phase 17.4 — Audit context for client_update + internal_handover ──
   These two steps are the distribution layer of the pipeline — what the
   client sees + what the PM acts on. Both need to reflect what the audit
   actually found, not generic "we researched competitors" talking points.

   The client update LLM gets audit context injected into its userMessage
   so Manav's voice still composes naturally around real findings. The
   internal handover (template-only) gets a deterministic effort-map
   section appended. Same source extractor, two render paths. */

interface DistAuditContext {
  business_impact: { missed_clicks: number; expected_clicks: number; dollar_low: number; dollar_high: number } | null;
  foundational_signal: string | null;
  content_depth_gate: { current_words: number; target_words: number; ratio_pct: number; words_to_add: number } | null;
  first_para_issue: string | null;
  schema_recommendation: string | null;
  paa_gap_count: number | null;
  ai_overview_present: boolean;
  intent_diffusion: { categories: number } | null;
  red_findings: string[];
  amber_findings_count: number;
  source_count: number;
}

function extractDistAuditContext(
  findings: Array<{ audit_kind: string; severity: string; finding_title: string; finding_detail?: string; recommendation?: string; evidence?: any }>,
): DistAuditContext | null {
  if (!findings || findings.length === 0) return null;

  let sourceCount = 0;

  /* Business impact (dollar opportunity from CTR recovery) */
  const ctr = findings.find(f => /CTR is \d+%|CTR underperformance|CTR.*of expected/i.test(f.finding_title));
  const ctrEv = ctr?.evidence || {};
  const biRaw = ctrEv.business_impact;
  const business_impact = (biRaw && typeof biRaw === 'object' && biRaw.dollar_low !== undefined)
    ? {
        missed_clicks: Number(biRaw.missed_clicks),
        expected_clicks: Number(biRaw.expected_clicks),
        dollar_low: Number(biRaw.dollar_low),
        dollar_high: Number(biRaw.dollar_high),
      }
    : null;
  if (business_impact) sourceCount++;

  /* AI Overview present (changes the work emphasis materially) */
  const ai_overview_present = !!ctrEv.ai_overview;
  if (ai_overview_present) sourceCount++;

  /* Foundational signal — first red as proxy until is_foundational is persisted */
  const reds = findings.filter(f => f.severity === 'red');
  const foundational_signal = reds.length > 0 ? reds[0].finding_title : null;
  if (foundational_signal) sourceCount++;
  const red_findings: string[] = reds.map(f => f.finding_title);

  /* Content depth gate */
  const compContent = findings.find(f => /Content depth.*SERP median|content exceeds SERP median/i.test(f.finding_title));
  const ccEv = compContent?.evidence || {};
  let content_depth_gate: { current_words: number; target_words: number; ratio_pct: number; words_to_add: number } | null = null;
  if (ccEv.audited_word_count && ccEv.competitor_median && ccEv.word_ratio !== undefined && Number(ccEv.word_ratio) < 0.8) {
    const cw = Number(ccEv.audited_word_count);
    const tw = Number(ccEv.competitor_median);
    content_depth_gate = {
      current_words: cw,
      target_words: tw,
      ratio_pct: Math.round(Number(ccEv.word_ratio) * 100),
      words_to_add: Math.max(0, tw - cw),
    };
    sourceCount++;
  }

  /* First paragraph issue */
  const firstParaOff = findings.find(f => /First paragraph is off-topic/i.test(f.finding_title));
  const firstParaWeak = findings.find(f => /First paragraph weakly aligned/i.test(f.finding_title));
  const first_para_issue = firstParaOff
    ? firstParaOff.finding_title
    : (firstParaWeak ? firstParaWeak.finding_title : null);
  if (first_para_issue) sourceCount++;

  /* Schema */
  const schemaMissing = findings.find(f => /(Schema|structured data).+(missing|absent|invalid)/i.test(f.finding_title));
  const schema_recommendation = schemaMissing
    ? `${schemaMissing.finding_title}${schemaMissing.recommendation ? ' — ' + schemaMissing.recommendation.slice(0, 150) : ''}`
    : null;
  if (schema_recommendation) sourceCount++;

  /* PAA gap count */
  const paaGap = findings.find(f => /PAA questions.+(NOT addressed|not addressed)/i.test(f.finding_title));
  const paaEv = paaGap?.evidence || {};
  const paa_gap_count = (Array.isArray(paaEv.unanswered) && paaEv.unanswered.length > 0) ? paaEv.unanswered.length : null;
  if (paa_gap_count !== null) sourceCount++;

  /* Intent diffusion */
  const diffuse = findings.find(f => /Diffuse-intent SERP/i.test(f.finding_title));
  const diffEv = diffuse?.evidence || {};
  const intent_diffusion = (diffuse && diffEv.distinct_categories >= 3)
    ? { categories: Number(diffEv.distinct_categories) }
    : null;
  if (intent_diffusion) sourceCount++;

  const amber_findings_count = findings.filter(f => f.severity === 'amber').length;

  if (sourceCount === 0) return null;

  return {
    business_impact,
    foundational_signal,
    content_depth_gate,
    first_para_issue,
    schema_recommendation,
    paa_gap_count,
    ai_overview_present,
    intent_diffusion,
    red_findings,
    amber_findings_count,
    source_count: sourceCount,
  };
}

/* For LLM injection into client_update prompt. Tone-neutral facts that the
   LLM will weave into Manav's voice. No bullet-spam — concise statements. */
function formatAuditContextForClientUpdate(ctx: DistAuditContext): string {
  const lines: string[] = [];
  lines.push('AUDIT FINDINGS THE CLIENT SHOULD HEAR ABOUT (weave these into the email naturally, do NOT mention "audit" or "pipeline"):');

  if (ctx.foundational_signal) {
    lines.push(`- The biggest single issue blocking progress: ${ctx.foundational_signal}. This is the work that compounds — talk about it as the priority before tactical fixes.`);
  }
  if (ctx.business_impact) {
    lines.push(`- Concrete opportunity available right now (without ranking improvements): roughly $${ctx.business_impact.dollar_low.toLocaleString()}–$${ctx.business_impact.dollar_high.toLocaleString()} per month from fixing how the existing position converts to clicks. ~${ctx.business_impact.missed_clicks} additional clicks/month at current rank.`);
  }
  if (ctx.content_depth_gate) {
    lines.push(`- Content needs ~${ctx.content_depth_gate.words_to_add.toLocaleString()} more words to match what's competing in the top-10 (currently at ${ctx.content_depth_gate.ratio_pct}% of the SERP median). Mention this is a content investment, not a quick fix.`);
  }
  if (ctx.first_para_issue) {
    lines.push(`- The page's opening paragraph isn't aligned with the target query — that's a quick rewrite that improves both reader experience and search relevance.`);
  }
  if (ctx.ai_overview_present) {
    lines.push(`- Google now shows an AI Overview on this query. That changes the work emphasis: content needs to be structured for citation (direct answers, scannable lists, structured data) — not just to rank.`);
  }
  if (ctx.paa_gap_count) {
    lines.push(`- ${ctx.paa_gap_count} live People-Also-Ask questions aren't covered by the current page. The content brief addresses these directly.`);
  }
  if (ctx.intent_diffusion) {
    lines.push(`- The SERP for this query is split across ${ctx.intent_diffusion.categories} different intent types — important context for setting realistic expectations.`);
  }
  return lines.join('\n');
}

/* For internal_handover. Deterministic markdown — PM/strategist reads this
   to know what to action. Priority-ordered, effort-categorized. */
function renderHandoverAuditSection(ctx: DistAuditContext): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('## Audit-identified work items (priority-ordered)');
  lines.push('');
  lines.push(`Source: technical audit. ${ctx.red_findings.length} red-severity, ${ctx.amber_findings_count} amber-severity findings consumed.`);
  lines.push('');

  /* P0 — foundational */
  if (ctx.foundational_signal) {
    lines.push(`### 🎯 P0 — Foundational fix (work compounding starts here)`);
    lines.push(`- ${ctx.foundational_signal}`);
    lines.push(`- _Why P0:_ until this lands, tactical work has limited effect. Address before iterating on title/meta/snippet tweaks.`);
    lines.push('');
  }

  /* P1 — red findings beyond foundational */
  const otherReds = ctx.red_findings.slice(1);
  if (otherReds.length > 0) {
    lines.push(`### ⚠️ P1 — Other critical (red) findings`);
    otherReds.forEach(r => lines.push(`- ${r}`));
    lines.push('');
  }

  /* P2 — quantified opportunities */
  const p2Items: string[] = [];
  if (ctx.business_impact) {
    p2Items.push(`**CTR recovery** — ~${ctx.business_impact.missed_clicks} missed clicks/mo at current position; \\$${ctx.business_impact.dollar_low.toLocaleString()}–\\$${ctx.business_impact.dollar_high.toLocaleString()}/mo opportunity. Effort: medium (title/meta rewrite + snippet structure). Sequence after foundational fix.`);
  }
  if (ctx.content_depth_gate) {
    p2Items.push(`**Content depth expansion** — page at ${ctx.content_depth_gate.ratio_pct}% of SERP median. Add ~${ctx.content_depth_gate.words_to_add.toLocaleString()} words anchored to the content brief's PAA H2 candidates. Effort: high (writer-hours, editorial review).`);
  }
  if (ctx.first_para_issue) {
    p2Items.push(`**First paragraph rewrite** — 40-60w direct answer, primary keyword in sentence 1. Effort: low (~30 min). Schedule with CTR recovery batch.`);
  }
  if (ctx.schema_recommendation) {
    p2Items.push(`**Schema implementation** — ${ctx.schema_recommendation}. Effort: low-to-medium (depends on stack; FAQPage often easiest first move).`);
  }
  if (ctx.paa_gap_count) {
    p2Items.push(`**PAA-question H2 coverage** — ${ctx.paa_gap_count} live PAA questions need verbatim H2 coverage. The content brief carries these as mandatory headings. Effort: bundled into depth expansion.`);
  }
  if (ctx.ai_overview_present) {
    p2Items.push(`**AI Overview citation optimization** — direct-answer paragraph (40-60w) within first 100 words, FAQ schema, scannable lists. Effort: medium (structural rewrite of intro + schema work).`);
  }
  if (p2Items.length > 0) {
    lines.push(`### 🛠 P2 — Quantified opportunities`);
    p2Items.forEach(item => lines.push(`- ${item}`));
    lines.push('');
  }

  /* Constraint / ceiling notes */
  if (ctx.intent_diffusion) {
    lines.push(`### ⚠ Ceiling constraint`);
    lines.push(`- SERP is intent-diffuse (${ctx.intent_diffusion.categories} categories in top-10). Even perfect execution has a CTR ceiling because of audience fragmentation. Plan accordingly — single intent class, tightly executed, beats blended-audience content for this keyword.`);
    lines.push('');
  }

  return lines.join('\n');
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
  consumes_audit: true,  /* Phase 17.5 — wired in Phase 17.4 */
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const keyword = ctx.scope.keyword as string;
    const strategy = ctx.prior.strategy_plan || {};
    const competitors = ctx.prior.competitor_snapshot || {};
    const research = ctx.prior.keyword_research || {};

    /* Phase 17.4 — extract audit context. When available, inject it into
       the LLM's userMessage so Manav's voice composes naturally around
       real findings (foundational issue, dollar opportunity, depth gate,
       AI Overview presence) instead of generic "we analyzed competitors"
       talking points. */
    const auditCtx = extractDistAuditContext(ctx.audit_findings);
    const auditBlock = auditCtx ? formatAuditContextForClientUpdate(auditCtx) : '';

    const sys = `You are drafting an email update from Manav (an SEO operator) to his client. Speak in his voice: direct, plain English, no fluff, no AI references, no pipeline jargon. Reply with ONLY valid JSON:
{
  "subject": "...",
  "body": "the full email — markdown OK"
}
Keep it under 350 words. Lead with what's been done. Then what's coming. Then what we expect.
Honesty: don't claim impact that hasn't happened. Talk about the work and the timeline.
When the user provides AUDIT FINDINGS THE CLIENT SHOULD HEAR ABOUT, weave the most material 2-3 of them into the email naturally — they're the real substance the client cares about. Never use the words "audit" or "pipeline" or mention any tooling.`;
    const usr = `Draft a progress update for the client about our work on ranking for "${keyword}".

WHAT WE'VE COMPLETED:
- Researched the keyword (intent: ${research.primary_intent || 'unknown'}, difficulty: ${research.competitive_difficulty || 'unknown'})
- Analyzed top-ranking competitors for the SERP
- Built a ${strategy.horizon_weeks || '4'}-week strategy: ${strategy.strategy_name || 'see plan'}
- Drafted the content brief for the target article

WHAT'S NEXT:
${(strategy.phases || []).map((p: any) => `- ${p.phase}: ${(p.deliverables || []).join(', ')}`).join('\n')}
${auditBlock ? '\n' + auditBlock + '\n' : ''}
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
      output: {
        ...r.parsed,
        /* Phase 17.4 — surface which audit signals informed the draft so
           downstream consumers / human reviewers see what was anchored. */
        _audit_signals_used: auditCtx ? {
          source_count:        auditCtx.source_count,
          dollar_opportunity:  auditCtx.business_impact ? `$${auditCtx.business_impact.dollar_low.toLocaleString()}-$${auditCtx.business_impact.dollar_high.toLocaleString()}/mo` : null,
          foundational:        auditCtx.foundational_signal,
          ai_overview_present: auditCtx.ai_overview_present,
        } : null,
      },
      artifact: {
        kind: 'email',
        title: `Client update: "${keyword}"`,
        body: `Subject: ${r.parsed.subject || `Update on ${keyword}`}\n\n${r.parsed.body || ''}`,
      },
      honest_note: auditCtx
        ? `Drafted in Manav's voice for client review. Anchored to ${auditCtx.source_count} audit signal(s) including ${auditCtx.business_impact ? `$${auditCtx.business_impact.dollar_low.toLocaleString()}-$${auditCtx.business_impact.dollar_high.toLocaleString()}/mo opportunity` : 'critical findings'}. Edit freely before sending.`
        : `Drafted in Manav's voice for client review. Edit freely before sending.`,
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
  consumes_audit: true,  /* Phase 17.5 — wired in Phase 17.4 */
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const keyword = ctx.scope.keyword as string;
    const research = ctx.prior.keyword_research || {};
    const strategy = ctx.prior.strategy_plan || {};
    const competitors = ctx.prior.competitor_snapshot || {};
    const gsc = ctx.prior.gsc_context || {};

    /* Phase 17.4 — extract audit context. Template-only, deterministic
       markdown appended below. No LLM cost. */
    const auditCtx = extractDistAuditContext(ctx.audit_findings);
    const auditSection = auditCtx ? renderHandoverAuditSection(auditCtx) : '';

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
- Technical audit: ${auditCtx ? `${auditCtx.source_count} signal(s) consumed (see "Audit-identified work items" below)` : 'no audit findings available — was the audit run before this pipeline?'}

## Strategy outline

${strategy.strategy_name ? `**${strategy.strategy_name}** — ${strategy.approach || ''}` : '(strategy step failed)'}

**Phases:**
${(strategy.phases || []).map((p: any) => `- ${p.phase} (${p.duration_days}d): ${(p.deliverables || []).slice(0, 3).join('; ')}`).join('\n')}

**Expected impact:** ${strategy.expected_impact || '—'}
**Risks flagged:** ${(strategy.risks_and_mitigations || []).length}
${auditSection}
## For the PM

- Created strategy can be moved to the planning board manually, or wait for next pipeline phase that creates it directly
- Content brief is in the artifacts list — ready to assign to a writer
- All artifacts produced this run are in season_pipeline_runs.final_artifacts for this run ID
- Manav's client update is ready in artifacts — review and send
${auditCtx ? `- The "Audit-identified work items" section above is the actionable backlog. P0 ships before P1, P1 before P2 — sequencing matters because tactical work on top of an unaddressed foundational issue has limited compounding effect.` : ''}

## Next steps if a human were doing this

1. Review client update — adjust tone if needed, send
2. Review content brief — assign to writer with target date
3. Track new page ranking weekly for the first month
4. Watch ${(strategy.kpi_to_watch || ['organic clicks']).join(', ')} for the strategy's KPI window
${auditCtx?.business_impact ? `5. Re-audit after CTR-recovery work ships to verify the \\$${auditCtx.business_impact.dollar_low.toLocaleString()}-\\$${auditCtx.business_impact.dollar_high.toLocaleString()}/mo opportunity is being captured — reconciliation feeds back into forecast accuracy.` : ''}
`;

    return {
      ok: true,
      output: {
        generated: true,
        /* Phase 17.4 — surface the audit-anchored backlog so downstream
           consumers (PM module, kanban_task auto-creation in future phases)
           can read structured signals rather than parsing markdown. */
        _audit_anchored_backlog: auditCtx ? {
          source_count:        auditCtx.source_count,
          foundational:        auditCtx.foundational_signal,
          red_findings:        auditCtx.red_findings,
          dollar_opportunity:  auditCtx.business_impact,
          depth_gate:          auditCtx.content_depth_gate,
          first_para_issue:    auditCtx.first_para_issue,
          schema:              auditCtx.schema_recommendation,
          paa_gap_count:       auditCtx.paa_gap_count,
          ai_overview_present: auditCtx.ai_overview_present,
          intent_diffusion:    auditCtx.intent_diffusion,
        } : null,
      },
      artifact: {
        kind: 'internal_doc',
        title: `Internal handover: "${keyword}"`,
        body,
      },
      honest_note: auditCtx
        ? `Internal doc + ${auditCtx.source_count}-signal audit backlog. S.E.A.S.O.N. attribution preserved. Client update keeps Manav's voice. PM has priority-ordered work items.`
        : `Internal doc keeps full provenance — S.E.A.S.O.N. attribution preserved. Client update keeps Manav's voice. Both deliverables are now in the run's artifacts.`,
    };
  },
};

/* ─── Phase 17.3 — Audit context for forecast ────────────────
   The forecast engine emits modeled trajectories from GSC baselines +
   difficulty + horizon. The audit's CTR finding carries a complementary
   signal — `business_impact` — which quantifies the CTR-recovery
   opportunity at CURRENT rank position. These are additive layers:

     • Forecast clicks target = "where we'll be after ranking improvement"
     • Audit business_impact  = "what we're leaving on the table right now
                                  by under-CTR'ing the position we already have"

   Showing both turns the forecast artifact from a modeled projection into
   a grounded picture: $X immediately available via CTR recovery + Y%
   additional reach via rank gains over the horizon. */

interface ForecastAuditContext {
  business_impact: { missed_clicks: number; expected_clicks: number; dollar_low: number; dollar_high: number } | null;
  business_impact_position: number | null;        /* the rank position the business_impact was computed at */
  business_impact_actual_ctr_pct: number | null;
  business_impact_expected_ctr_pct: number | null;
  foundational_signal: string | null;             /* red finding likely to be foundational fix */
  content_depth_gate: { current_words: number; target_words: number; ratio_pct: number } | null;
  intent_diffusion: { categories: number } | null;
  critical_caveats: string[];                     /* red findings that gate the forecast */
  source_count: number;
}

function extractAuditContextForForecast(
  findings: Array<{ audit_kind: string; severity: string; finding_title: string; finding_detail?: string; recommendation?: string; evidence?: any }>,
): ForecastAuditContext | null {
  if (!findings || findings.length === 0) return null;

  let sourceCount = 0;

  /* Business impact from CTR finding */
  const ctr = findings.find(f => /CTR is \d+%|CTR underperformance|CTR.*of expected/i.test(f.finding_title));
  const ctrEv = ctr?.evidence || {};
  const biRaw = ctrEv.business_impact;
  const business_impact = (biRaw && typeof biRaw === 'object'
    && biRaw.missed_clicks !== undefined
    && biRaw.dollar_low !== undefined
    && biRaw.dollar_high !== undefined)
    ? {
        missed_clicks: Number(biRaw.missed_clicks),
        expected_clicks: Number(biRaw.expected_clicks),
        dollar_low: Number(biRaw.dollar_low),
        dollar_high: Number(biRaw.dollar_high),
      }
    : null;
  if (business_impact) sourceCount++;
  const business_impact_position = (ctrEv.position !== undefined) ? Number(ctrEv.position) : null;
  const business_impact_actual_ctr_pct = (ctrEv.actual_ctr_pct !== undefined) ? Number(ctrEv.actual_ctr_pct) : null;
  const business_impact_expected_ctr_pct = (ctrEv.expected_ctr_pct !== undefined) ? Number(ctrEv.expected_ctr_pct) : null;

  /* Content depth gate from competitive_content_benchmark */
  const compContent = findings.find(f => /Content depth.*SERP median|content exceeds SERP median/i.test(f.finding_title));
  const ccEv = compContent?.evidence || {};
  let content_depth_gate: { current_words: number; target_words: number; ratio_pct: number } | null = null;
  if (ccEv.audited_word_count && ccEv.competitor_median && ccEv.word_ratio !== undefined && Number(ccEv.word_ratio) < 0.8) {
    content_depth_gate = {
      current_words: Number(ccEv.audited_word_count),
      target_words: Number(ccEv.competitor_median),
      ratio_pct: Math.round(Number(ccEv.word_ratio) * 100),
    };
    sourceCount++;
  }

  /* Intent diffusion warning */
  const diffuse = findings.find(f => /Diffuse-intent SERP/i.test(f.finding_title));
  const diffEv = diffuse?.evidence || {};
  const intent_diffusion = (diffuse && diffEv.distinct_categories >= 3)
    ? { categories: Number(diffEv.distinct_categories) }
    : null;
  if (intent_diffusion) sourceCount++;

  /* Foundational signal — first red finding by severity. is_foundational
     isn't persisted, so we use the first red as proxy. */
  const reds = findings.filter(f => f.severity === 'red');
  const foundational_signal = reds.length > 0 ? reds[0].finding_title : null;
  if (foundational_signal) sourceCount++;

  /* Critical caveats — red findings beyond the foundational */
  const critical_caveats: string[] = reds.slice(1, 5).map(f => f.finding_title);
  if (critical_caveats.length > 0) sourceCount++;

  if (sourceCount === 0) return null;

  return {
    business_impact,
    business_impact_position,
    business_impact_actual_ctr_pct,
    business_impact_expected_ctr_pct,
    foundational_signal,
    content_depth_gate,
    intent_diffusion,
    critical_caveats,
    source_count: sourceCount,
  };
}

function renderForecastAuditSection(ctx: ForecastAuditContext): string {
  const lines: string[] = [];

  /* Section: audit-anchored opportunity (current-position recovery) */
  if (ctx.business_impact) {
    lines.push('');
    lines.push('## Audit-anchored opportunity (current-position recovery)');
    lines.push('');
    lines.push('The technical audit identified concrete recovery potential at the **current rank position**, independent of any ranking improvements:');
    lines.push('');
    const bi = ctx.business_impact;
    lines.push(`| Layer | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| **Missed monthly clicks at expected CTR** | ~${bi.missed_clicks.toLocaleString()} |`);
    lines.push(`| **Expected clicks at proper CTR** | ~${bi.expected_clicks.toLocaleString()}/mo |`);
    lines.push(`| **Monthly dollar opportunity (B2B SaaS click value $10-30)** | **\\$${bi.dollar_low.toLocaleString()} – \\$${bi.dollar_high.toLocaleString()}** |`);
    if (ctx.business_impact_position !== null && ctx.business_impact_actual_ctr_pct !== null && ctx.business_impact_expected_ctr_pct !== null) {
      lines.push(`| Position when measured | ${ctx.business_impact_position.toFixed(1)} (actual CTR ${ctx.business_impact_actual_ctr_pct.toFixed(2)}% vs expected ${ctx.business_impact_expected_ctr_pct.toFixed(1)}%) |`);
    }
    lines.push('');
    lines.push('_Source: technical audit CTR finding (SerpAPI-verified expected CTR for the audited position). Treat dollar ranges as directional._');
    lines.push('');
    lines.push('**How this stacks with the forecast above:**');
    lines.push('- The forecast projects clicks gained from **moving up the SERP** (rank-improvement layer)');
    lines.push('- The opportunity above is clicks gained from **fixing CTR at the current position** (recovery layer)');
    lines.push('- Both layers are additive when both ship: rank gains compound on top of CTR recovery');
  }

  /* Section: forecast preconditions */
  const hasPreconditions = ctx.foundational_signal || ctx.content_depth_gate || ctx.intent_diffusion || ctx.critical_caveats.length > 0;
  if (hasPreconditions) {
    lines.push('');
    lines.push('## Forecast preconditions (audit-identified)');
    lines.push('');
    lines.push('The forecasts above assume the following audit-identified issues are addressed during the horizon. If unaddressed, the forecasts no longer apply:');
    lines.push('');
    if (ctx.foundational_signal) {
      lines.push(`- 🎯 **Foundational fix candidate** — ${ctx.foundational_signal}. Until this is resolved, tactical work on title/meta/snippet has limited compounding effect.`);
    }
    if (ctx.content_depth_gate) {
      const cdg = ctx.content_depth_gate;
      lines.push(`- 📏 **Content depth gate** — page at ${cdg.ratio_pct}% of competitor median (${cdg.current_words.toLocaleString()} of ${cdg.target_words.toLocaleString()} words). The clicks target assumes content expansion to ≥ SERP median during the horizon. If depth stays at current level, expect ~${Math.max(20, Math.round((1 - cdg.ratio_pct/100) * 100 * 0.4))}% downward adjustment to the modeled clicks target.`);
    }
    if (ctx.intent_diffusion) {
      lines.push(`- 🧭 **Intent diffusion ceiling** — SERP is intent-diffuse (${ctx.intent_diffusion.categories} categories in top-10). Even at top-3, CTR has a hard ceiling because users from mismatched intents skip results. Treat the CTR forecast as best-case for an intent-tight visitor segment, not a blended audience.`);
    }
    if (ctx.critical_caveats.length > 0) {
      lines.push(`- ⚠️ **Other red-severity issues** the work cycle must also resolve:`);
      ctx.critical_caveats.forEach(c => lines.push(`  - ${c}`));
    }
  }

  return lines.join('\n');
}

/* ─── STEP: Forecast — commit to numbers, schedule monitoring ─── */

const stepForecast = {
  id: 'forecast',
  label: 'Set realistic expectations and schedule monitoring',
  description: 'Emit forecasts for rank/clicks/impressions/CTR with trajectory + confidence + checkpoints',
  artifact_kind: 'forecast',
  consumes_audit: true,  /* Phase 17.5 — wired in Phase 17.3 */
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

      /* Phase 17.3 — extract audit context for the forecast.
         If the audit found CTR business_impact + foundational signals +
         content depth gates + intent diffusion warnings, append them to
         the artifact AND surface in the output for downstream consumers. */
      const auditCtx = extractAuditContextForForecast(ctx.audit_findings);
      const auditSection = auditCtx ? renderForecastAuditSection(auditCtx) : '';

      /* Build the artifact body, with audit-anchored section appended when available */
      const body = renderForecastArtifact(keyword, forecasts, horizonWeeks) + auditSection;

      return {
        ok: true,
        output: {
          forecasts: forecasts.map(f => f.id),
          forecast_summary: forecasts,
          /* Phase 17.3 — audit-anchored signals exposed for downstream
             consumers (client_update, internal_handover, reconciliation). */
          _audit_anchored: auditCtx ? {
            business_impact:    auditCtx.business_impact,
            foundational:       auditCtx.foundational_signal,
            depth_gate:         auditCtx.content_depth_gate,
            intent_diffusion:   auditCtx.intent_diffusion,
            critical_caveats:   auditCtx.critical_caveats,
            source_count:       auditCtx.source_count,
          } : null,
        },
        artifact: {
          kind: 'forecast',
          title: `Expected results: "${keyword}" (${horizonWeeks}w horizon)`,
          body,
        },
        honest_note: (() => {
          const baseNote = forecasts[0]?.honest_caveats
            ? `Forecasts committed with caveats: ${String(forecasts[0].honest_caveats).replace(/\.$/, '')}. Monitoring will fire at 7d, 14d, 30d intervals.`
            : `Forecasts committed. Monitoring will fire at 7d, 14d, 30d intervals.`;
          if (auditCtx) {
            const audSig = [
              auditCtx.business_impact && `\\$${auditCtx.business_impact.dollar_low.toLocaleString()}-\\$${auditCtx.business_impact.dollar_high.toLocaleString()} CTR-recovery layer surfaced`,
              auditCtx.foundational_signal && 'foundational fix flagged',
              auditCtx.content_depth_gate && 'content-depth gate flagged',
              auditCtx.intent_diffusion && 'intent-diffusion ceiling flagged',
            ].filter(Boolean).join('; ');
            return audSig ? `${baseNote} Audit-anchored: ${audSig}.` : baseNote;
          }
          return baseNote;
        })(),
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
