/* ════════════════════════════════════════════════════════════════
   Build 12.8 — Prospect Discovery Engine
   "Free backlink finder" for prospects who haven't engaged yet.

   Inputs: industry (required), geography (optional), budget_tier
   (optional), client_url (optional). Output: a teaser report
   intended as a discovery-call leave-behind.

   Three research lanes (not six — kept fast for sales motion):
     1. Resource pages + industry directories
     2. HARO/expert-quote + podcast guesting
     3. Niche communities + topical citation

   Each lane uses Anthropic native web_search tool to find ACTUAL
   named publications/sites in the prospect's industry — not generic
   reasoning.

   DA estimation discipline: every target gets a DA RANGE (e.g.
   "40-60") with a confidence label ("high"/"medium"/"low") and an
   explicit "verify in Ahrefs before pitching" disclaimer. We do
   NOT produce point estimates because LLM-derived point estimates
   are dangerously misleading when the client checks one in their
   own tool.

   Brand: outputs use "Manav S" as primary brand per project rules;
   "SEO Season by Manav S" appears subtly in the footer only.
   ════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-20250514";

/* ─── Build 12.8.2 — Diagnostic persistence ─────────────────── */
/* Same synthesis_diagnostics table used by bde-backlinks Build 12.5.
   When a lane returns empty, parse fails, or web_search returns 0
   tool uses, we persist the raw response so I can post-mortem
   exactly what happened. Without this we are flying blind on
   silent failures like "0 targets across 3 categories". */
async function persistDiagnostic(opts: {
  discovery_id?: string | null;
  label: string;
  http_status?: number | null;
  stop_reason?: string | null;
  parse_error?: string | null;
  raw_response?: string;
  request_summary: { model: string; max_tokens: number; system_length: number; user_length: number; web_search_enabled: boolean };
  attempt_number: number;
  duration_ms: number;
  tool_use_count?: number;
}) {
  try {
    const raw = opts.raw_response || "";
    const truncated = raw.length > 16_000 ? raw.slice(0, 16_000) : raw;
    await db().from("synthesis_diagnostics").insert({
      brief_id: opts.discovery_id || null,        // reuse brief_id column for discovery_id (same nullable uuid)
      module: "prospect_discovery",
      label: opts.label,
      http_status: opts.http_status ?? null,
      stop_reason: opts.stop_reason || null,
      parse_error: opts.parse_error || null,
      raw_response: truncated,
      raw_length: raw.length,
      request_summary: { ...opts.request_summary, tool_use_count: opts.tool_use_count ?? 0 },
      attempt_number: opts.attempt_number,
      duration_ms: opts.duration_ms,
    });
  } catch (e: any) {
    console.warn(`[prospect/diag] persist failed: ${e?.message}`);
  }
}

/* ─── Types ───────────────────────────────────────────────────── */

export interface ProspectDiscoveryInputs {
  industry: string;                    // required
  geography?: string;
  budget_tier?: "low" | "medium" | "high" | "enterprise";
  client_url?: string;                 // optional — prospect may not share
  prospect_name?: string;
  prospect_email?: string;
  context?: string;                    // free-text additional context
}

export interface ProspectTarget {
  category: string;
  name: string;                        // publication / site name
  url?: string;                        // direct URL when known
  da_range: string;                    // e.g. "40-60"
  confidence: "high" | "medium" | "low";
  why_valuable: string;                // 1-sentence why this matters
  attainability: "easy" | "medium" | "hard";
  outreach_path: string;               // how to actually pitch this (1-2 sentences)
}

/* ─── Web-search-enabled Anthropic call ──────────────────────── */
/* Anthropic native web_search tool returns text with embedded
   citations. Tool blocks are handled automatically by the API — we
   send tools spec, get back content[] that may include tool_use,
   tool_result, and text blocks. We extract the final text.

   Differs from callAnthropicJson:
   - sends tools: [{ type: 'web_search_20250305', name: 'web_search' }]
   - extracts text from ALL text blocks, joining them
   - tracks count of tool_use blocks (web_searches_used metric)
   - 240s timeout because web_search adds latency */
async function callAnthropicWithWebSearch(opts: {
  system: string;
  user: string;
  label: string;
  maxTokens: number;
  discovery_id?: string | null;
  /** Build 12.8.2 — when false, omit the tools array entirely.
      Used as fallback when web_search appears disabled on the API key
      so prospects still get useful (LLM-only) results. */
  enable_web_search?: boolean;
}): Promise<{ text: string | null; web_searches: number; tool_use_count: number; stop_reason?: string }> {
  if (!ANTHROPIC_API_KEY) {
    console.error(`[${opts.label}] ANTHROPIC_API_KEY missing`);
    return { text: null, web_searches: 0, tool_use_count: 0 };
  }
  const enableTools = opts.enable_web_search !== false;
  const requestSummary = { model: MODEL, max_tokens: opts.maxTokens, system_length: opts.system.length, user_length: opts.user.length, web_search_enabled: enableTools };

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, 2000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 240_000);
    const attemptStart = Date.now();

    try {
      const body: any = {
        model: MODEL,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      };
      if (enableTools) {
        body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
      }
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      clearTimeout(timer);
      const duration = Date.now() - attemptStart;

      if (r.ok) {
        const d = await r.json();
        const blocks = d?.content || [];
        const textBlocks = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text || "");
        const text = textBlocks.join("\n\n").trim();
        const toolUseCount = blocks.filter((b: any) => b.type === "tool_use" && b.name === "web_search").length;
        const stopReason = d?.stop_reason || null;
        console.log(`[${opts.label}] ok in ${duration}ms · tool_uses=${toolUseCount} · text_len=${text.length} · stop=${stopReason} · tools_enabled=${enableTools}`);

        // Persist diagnostic when something feels off — empty text, 0 tool uses
        // with tools enabled (likely web_search not enabled on key), etc.
        if (!text || (enableTools && toolUseCount === 0)) {
          await persistDiagnostic({
            discovery_id: opts.discovery_id,
            label: opts.label,
            stop_reason: stopReason,
            parse_error: !text ? "empty text response" : "0 tool_use blocks with tools enabled (web_search may be disabled on API key)",
            raw_response: text || JSON.stringify(blocks).slice(0, 4000),
            request_summary: requestSummary,
            attempt_number: attempt,
            duration_ms: duration,
            tool_use_count: toolUseCount,
          });
        }

        return { text: text || null, web_searches: toolUseCount, tool_use_count: toolUseCount, stop_reason: stopReason };
      }

      const errText = await r.text().catch(() => "");
      console.error(`[${opts.label}] HTTP ${r.status}: ${errText.slice(0, 400)}`);
      await persistDiagnostic({
        discovery_id: opts.discovery_id,
        label: opts.label,
        http_status: r.status,
        parse_error: errText.slice(0, 1000),
        raw_response: errText,
        request_summary: requestSummary,
        attempt_number: attempt,
        duration_ms: duration,
      });
      // Specific signal: 400 with "tools" in error message = web_search not enabled
      if (r.status === 400 && /tool|web_search|invalid|not.*enabled/i.test(errText)) {
        console.warn(`[${opts.label}] web_search appears not enabled — caller should fall back to LLM-only`);
      }
      if (![429, 503, 529].includes(r.status) || attempt === 2) {
        return { text: null, web_searches: 0, tool_use_count: 0 };
      }
    } catch (e: any) {
      clearTimeout(timer);
      const aborted = controller.signal.aborted;
      console.error(`[${opts.label}] exc: ${e?.message}${aborted ? " (aborted by 240s timeout)" : ""}`);
      await persistDiagnostic({
        discovery_id: opts.discovery_id,
        label: opts.label,
        parse_error: `${e?.message}${aborted ? " (aborted by timeout)" : ""}`,
        request_summary: requestSummary,
        attempt_number: attempt,
        duration_ms: Date.now() - attemptStart,
      });
      if (attempt === 2 || aborted) return { text: null, web_searches: 0, tool_use_count: 0 };
    }
  }
  return { text: null, web_searches: 0, tool_use_count: 0 };
}

/* ─── Tolerant JSON extraction (mirror of bde-backlinks helper) ─ */
function extractJson(raw: string): any | null {
  if (!raw) return null;
  let clean = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const first = clean.indexOf("{");
  if (first > 0) clean = clean.slice(first);
  const lastClose = clean.lastIndexOf("}");
  if (lastClose > 0 && lastClose < clean.length - 1) clean = clean.slice(0, lastClose + 1);
  try { return JSON.parse(clean); } catch { /* try repair */ }
  try { return JSON.parse(clean.replace(/,(\s*[}\]])/g, "$1")); } catch { /* fail */ }
  return null;
}

/* ─── Shared honesty framing ─────────────────────────────────── */
const DA_HONESTY_BLOCK = `
HARD HONESTY RULES (non-negotiable):
- DA (Domain Authority) and Spam Score are MODEL OUTPUTS from Moz / Ahrefs / Majestic, not measurements. Different tools give different numbers for the same site. Without a connected provider, we estimate.
- Therefore: EVERY target gets a DA RANGE (e.g. "40-60", "60-80"), NOT a point estimate.
- EVERY target gets a confidence label: "high" (you've encountered the site repeatedly in training data and it's a well-known authority), "medium" (you recognise the category and can estimate by analogy), "low" (you're inferring from the URL pattern and topical signals only).
- NEVER produce a precise number like "DA 67". Always a range with confidence.
- If you're not at least medium-confidence that a site exists and matches the industry, do NOT include it.
- Use web_search to FIND actual sites in the industry. Do not invent publication names. If web_search returns nothing useful in a category, return fewer targets — don't fabricate to fill quota.
- The teaser will be sent to a real prospect. Their first instinct will be to verify one of the named sites in Ahrefs. If they find a fabricated name, the entire pitch dies. Better to return 3 honest targets than 5 with one fabrication.`;

/* ─── Research lanes (3 of them, each web-search-enabled) ─────── */

interface LaneResult {
  category: string;
  targets: ProspectTarget[];
  raw_research_text: string;
  tool_use_count: number;       // Build 12.8.2 — surface for orchestrator detection
  failed?: string;
}

async function runResourcePagesLane(inputs: ProspectDiscoveryInputs, opts: { discovery_id?: string | null; enable_web_search?: boolean } = {}): Promise<LaneResult> {
  const system = `You are a senior backlink strategist researching FREE backlink opportunities for a prospect in the ${inputs.industry} industry${inputs.geography ? ` (geography: ${inputs.geography})` : ""}.

Focus: RESOURCE PAGES + INDUSTRY DIRECTORIES.
- Resource pages = "best X for Y" / "useful resources for Z" / curated link roundups.
- Industry directories = niche, vertical-specific listing sites (NOT general business directories like Yelp).
- Free means: no payment required, no exchange of money. Editorial inclusion only.

${DA_HONESTY_BLOCK}

OUTPUT — return ONLY this JSON, no preamble:
{
  "category": "Resource Pages & Industry Directories",
  "targets": [
    {
      "category": "Resource Pages & Industry Directories",
      "name": "actual publication or directory name",
      "url": "https://… if you found it via web_search; omit if you only know the name",
      "da_range": "e.g. 40-60",
      "confidence": "high|medium|low",
      "why_valuable": "1 sentence on topical fit and authority signal",
      "attainability": "easy|medium|hard",
      "outreach_path": "1-2 sentences: how to actually get included"
    }
  ]
}

RULES:
- Produce 2-3 SPECIFIC NAMED targets. Default: 3. Only return fewer when you genuinely cannot name 3 good ones.
- When web_search is available, USE IT before answering. Try queries like: "[industry] resource page", "[industry] useful links", "best [industry] websites 2025".
- When web_search returns useful results, name the actual sites. When training data already contains well-known industry resource pages, you may include those with confidence "medium" or "high".
- Acceptable fallback: if you cannot name a specific publication, you can name a CATEGORY of resource pages with a concrete search operator the prospect can run themselves (e.g., 'inurl:"resources" [industry]'). This counts as a target.
- Empty arrays are NOT acceptable unless this industry is so niche that no resource pages plausibly exist. If you return empty, you must include reasoning in the operator_note field below.

ALWAYS include an "explored" field at the top level:
{
  "explored": "1 sentence on what you searched for or considered",
  "category": "...",
  "targets": [...]
}`;

  const user = `Industry: ${inputs.industry}
${inputs.geography ? `Geography: ${inputs.geography}\n` : ""}${inputs.budget_tier ? `Budget tier: ${inputs.budget_tier}\n` : ""}${inputs.context ? `Additional context: ${inputs.context}\n` : ""}
Find 2-3 specific resource pages or industry directories where someone in this space could realistically earn a free backlink. Use web_search if available; if not, use training-data knowledge of established industry resource pages.`;

  const result = await callAnthropicWithWebSearch({ system, user, label: "prospect/resource-pages", maxTokens: 3500, discovery_id: opts.discovery_id, enable_web_search: opts.enable_web_search });
  if (!result.text) return { category: "Resource Pages & Industry Directories", targets: [], raw_research_text: "", tool_use_count: result.tool_use_count, failed: "no response" };
  const parsed = extractJson(result.text);
  if (!parsed || !Array.isArray(parsed.targets)) {
    return { category: "Resource Pages & Industry Directories", targets: [], raw_research_text: result.text, tool_use_count: result.tool_use_count, failed: "parse failed" };
  }
  return { category: "Resource Pages & Industry Directories", targets: parsed.targets, raw_research_text: result.text, tool_use_count: result.tool_use_count };
}

async function runHaroPodcastsLane(inputs: ProspectDiscoveryInputs, opts: { discovery_id?: string | null; enable_web_search?: boolean } = {}): Promise<LaneResult> {
  const system = `You are a senior backlink strategist researching FREE backlink opportunities via EXPERT-QUOTE PLATFORMS and PODCAST GUESTING for a prospect in the ${inputs.industry} industry${inputs.geography ? ` (geography: ${inputs.geography})` : ""}.

Focus:
- HARO-style platforms (Help A Reporter Out, Featured/Connectively, SourceBottle, Qwoted, etc.) where journalists request expert quotes.
- Podcast guesting — niche podcasts in the prospect's industry that accept guests without payment.
- "Free" means: no payment to be quoted or appear as guest. Editorial only.

${DA_HONESTY_BLOCK}

OUTPUT — return ONLY this JSON, no preamble:
{
  "category": "Expert Quotes & Podcast Guesting",
  "targets": [
    {
      "category": "Expert Quotes & Podcast Guesting",
      "name": "actual platform or podcast name",
      "url": "https://… if found via web_search; omit if name-only",
      "da_range": "e.g. 50-70",
      "confidence": "high|medium|low",
      "why_valuable": "1 sentence on topical fit and authority signal",
      "attainability": "easy|medium|hard",
      "outreach_path": "1-2 sentences: how to actually get featured"
    }
  ]
}

RULES:
- Produce 2-3 SPECIFIC NAMED targets. Default: 3.
- HARO-style platforms are stable; you can name them from training data (HARO/Connectively, Featured, SourceBottle, Qwoted, Help A B2B Writer, etc.) — pick the 1-2 most relevant to this industry.
- Industry-specific podcasts: use web_search if available to find currently-active podcasts that accept guests in this vertical. If web_search unavailable, name 1-2 well-known industry podcasts from training data with confidence "medium".
- Empty arrays are NOT acceptable. HARO-style platforms always apply.
- Always include "explored" field at the top level explaining what you searched/considered.`;

  const user = `Industry: ${inputs.industry}
${inputs.geography ? `Geography: ${inputs.geography}\n` : ""}${inputs.budget_tier ? `Budget tier: ${inputs.budget_tier}\n` : ""}${inputs.context ? `Additional context: ${inputs.context}\n` : ""}
Find 2-3 specific HARO-style platforms or niche podcasts where someone in this space could earn a free placement. Use web_search if available; otherwise rely on training-data knowledge.`;

  const result = await callAnthropicWithWebSearch({ system, user, label: "prospect/haro-podcasts", maxTokens: 3500, discovery_id: opts.discovery_id, enable_web_search: opts.enable_web_search });
  if (!result.text) return { category: "Expert Quotes & Podcast Guesting", targets: [], raw_research_text: "", tool_use_count: result.tool_use_count, failed: "no response" };
  const parsed = extractJson(result.text);
  if (!parsed || !Array.isArray(parsed.targets)) {
    return { category: "Expert Quotes & Podcast Guesting", targets: [], raw_research_text: result.text, tool_use_count: result.tool_use_count, failed: "parse failed" };
  }
  return { category: "Expert Quotes & Podcast Guesting", targets: parsed.targets, raw_research_text: result.text, tool_use_count: result.tool_use_count };
}

async function runCommunitiesLane(inputs: ProspectDiscoveryInputs, opts: { discovery_id?: string | null; enable_web_search?: boolean } = {}): Promise<LaneResult> {
  const system = `You are a senior backlink strategist researching FREE backlink opportunities via NICHE COMMUNITIES and INDUSTRY BLOGS for a prospect in the ${inputs.industry} industry${inputs.geography ? ` (geography: ${inputs.geography})` : ""}.

Focus:
- Niche communities — subreddits, Slack/Discord communities, LinkedIn groups, forums, Stack Exchange sites specific to this industry.
- Industry blogs that accept editorial contributions OR genuinely cite outside expertise.
- "Free" means: no payment to participate or be cited. Built through genuine participation + expertise.

${DA_HONESTY_BLOCK}

OUTPUT — return ONLY this JSON, no preamble:
{
  "category": "Niche Communities & Industry Blogs",
  "targets": [
    {
      "category": "Niche Communities & Industry Blogs",
      "name": "actual community or blog name",
      "url": "https://… if found via web_search; omit if name-only",
      "da_range": "e.g. 30-50",
      "confidence": "high|medium|low",
      "why_valuable": "1 sentence on topical fit — these earn citations through ongoing presence, not one-shot placement",
      "attainability": "easy|medium|hard",
      "outreach_path": "1-2 sentences: how to build presence here that earns citations"
    }
  ]
}

RULES:
- Produce 2-3 SPECIFIC NAMED targets. Default: 3.
- Use web_search if available. If not, name well-known communities from training data: relevant subreddits, Stack Exchange sites, established Slack/Discord communities. For mainstream industries (SaaS, marketing, AI, fintech, e-commerce, healthcare-IT, construction-tech, etc.) you absolutely know real communities exist.
- Note: communities themselves rarely give followed links. Their VALUE is entity-association and discovery — your name appears, journalists googling the topic find you. Frame why_valuable accordingly.
- Empty arrays are NOT acceptable for mainstream industries. Reddit alone has communities for almost everything.
- Always include "explored" field.`;

  const user = `Industry: ${inputs.industry}
${inputs.geography ? `Geography: ${inputs.geography}\n` : ""}${inputs.budget_tier ? `Budget tier: ${inputs.budget_tier}\n` : ""}${inputs.context ? `Additional context: ${inputs.context}\n` : ""}
Find 2-3 specific niche communities or industry blogs where someone in this space could build the entity associations that earn ongoing citations. Use web_search if available.`;

  const result = await callAnthropicWithWebSearch({ system, user, label: "prospect/communities", maxTokens: 3500, discovery_id: opts.discovery_id, enable_web_search: opts.enable_web_search });
  if (!result.text) return { category: "Niche Communities & Industry Blogs", targets: [], raw_research_text: "", tool_use_count: result.tool_use_count, failed: "no response" };
  const parsed = extractJson(result.text);
  if (!parsed || !Array.isArray(parsed.targets)) {
    return { category: "Niche Communities & Industry Blogs", targets: [], raw_research_text: result.text, tool_use_count: result.tool_use_count, failed: "parse failed" };
  }
  return { category: "Niche Communities & Industry Blogs", targets: parsed.targets, raw_research_text: result.text, tool_use_count: result.tool_use_count };
}

/* ─── Teaser report rendering ─────────────────────────────────── */
function renderTeaserReport(opts: { inputs: ProspectDiscoveryInputs; lanes: LaneResult[]; webSearchDisabled?: boolean }): string {
  const { inputs, lanes, webSearchDisabled } = opts;
  const totalTargets = lanes.reduce((n, l) => n + l.targets.length, 0);
  const date = new Date().toLocaleDateString("en-GB");

  const L: string[] = [];

  // Header — Manav S as primary brand
  L.push(`# Free Backlink Opportunity Report`);
  L.push("");
  L.push(`**For:** ${inputs.prospect_name || `Prospect in ${inputs.industry}`}  `);
  L.push(`**Industry:** ${inputs.industry}  `);
  if (inputs.geography) L.push(`**Geography:** ${inputs.geography}  `);
  L.push(`**Prepared by:** Manav S  `);
  L.push(`**Date:** ${date}`);
  L.push("");
  L.push("---");
  L.push("");

  // Opening note — sets honest expectation
  L.push(`This is a **discovery teaser** showing ${totalTargets} specific free backlink opportunities in your space. It is not the full strategy.`);
  L.push("");
  if (webSearchDisabled) {
    // Honest disclosure when live web search was unavailable
    L.push(`> _Note: Targets below are sourced from established industry knowledge, not live web search. The full engagement uses real-time discovery to surface current opportunities including newly-launched podcasts and newly-published resource pages._`);
    L.push("");
  } else {
    L.push(`Every target below is **named and findable** — we have not invented placeholders. DA ranges shown are honest estimates with confidence labels; precise numbers come from connected backlink tools after engagement.`);
    L.push("");
  }
  L.push("---");
  L.push("");

  // Each lane as a section
  let anyTargets = false;
  for (const lane of lanes) {
    if (lane.targets.length === 0) continue;
    anyTargets = true;
    L.push(`## ${lane.category}`);
    L.push("");
    for (const t of lane.targets) {
      L.push(`### ${t.name}`);
      L.push("");
      const metrics: string[] = [];
      metrics.push(`DA range: ${t.da_range}`);
      metrics.push(`confidence: ${t.confidence}`);
      metrics.push(`attainability: ${t.attainability}`);
      L.push(`*${metrics.join(" · ")}*`);
      L.push("");
      if (t.url) { L.push(`**URL:** ${t.url}`); L.push(""); }
      L.push(`**Why this matters for ${inputs.industry}:** ${t.why_valuable}`);
      L.push("");
      L.push(`**How to pursue it:** ${t.outreach_path}`);
      L.push("");
      L.push("---");
      L.push("");
    }
  }

  if (!anyTargets) {
    L.push(`_No targets surfaced — the research lanes returned no results for this industry/geography combination. This usually means the inputs need to be more specific. Reach out and we can refine together._`);
    L.push("");
    L.push("---");
    L.push("");
  }

  // CTA + honest caveat
  L.push(`## What is NOT in this teaser`);
  L.push("");
  L.push(`This shows 3 categories with ${totalTargets} targets — a fraction of what a full strategy includes. The complete approach covers:`);
  L.push("");
  L.push(`- Digital PR with named publication targets and journalist beats`);
  L.push(`- Resource-page mapping with 20-50 specific candidates`);
  L.push(`- Broken-link reclamation and unlinked-mention recovery`);
  L.push(`- Topical co-citation tactics for AI Overview / LLM-search visibility`);
  L.push(`- Partnership and co-marketing opportunities with adjacent brands`);
  L.push(`- Verified Ahrefs/Moz metrics on every target (not estimates)`);
  L.push(`- A 90-day execution plan with effort and budget allocation`);
  L.push("");
  L.push(`---`);
  L.push("");

  // Brand footer — SEO Season subtly
  L.push(`<small>Prepared by **Manav S** · SEO Season by Manav S · ${date}</small>`);

  return L.join("\n");
}

/* ─── Main entry point ───────────────────────────────────────── */

export async function runProspectDiscovery(opts: {
  inputs: ProspectDiscoveryInputs;
  client_request_id?: string;
}): Promise<{
  success: boolean;
  discovery_id?: string;
  teaser_md?: string;
  targets_count?: number;
  llm_calls_used?: number;
  web_searches_used?: number;
  error?: string;
}> {
  const inputs = opts.inputs;
  if (!inputs.industry || inputs.industry.trim().length < 2) {
    return { success: false, error: "Industry is required (at least 2 characters)." };
  }

  const startedAt = Date.now();
  let llm_calls_used = 0;
  let web_searches_used = 0;

  /* ─── Insert row early so client can poll for status ─────── */
  let discovery_id: string | undefined;
  try {
    const { data, error } = await db().from("prospect_discoveries").insert({
      prospect_name: inputs.prospect_name || null,
      prospect_email: inputs.prospect_email || null,
      client_url: inputs.client_url || null,
      industry: inputs.industry.trim(),
      geography: inputs.geography || null,
      budget_tier: inputs.budget_tier || null,
      context: inputs.context || null,
      status: "researching",
      started_at: new Date().toISOString(),
      client_request_id: opts.client_request_id || null,
      progress_json: { stage: "researching", lanes_total: 3, lanes_done: 0 },
    }).select("id").single();
    if (!error && data) discovery_id = (data as any).id;
    else console.warn(`[prospect] initial insert failed: ${error?.message}`);
  } catch (e: any) {
    console.warn(`[prospect] insert threw: ${e?.message}`);
  }

  const updateProgress = async (patch: any) => {
    if (!discovery_id) return;
    try {
      const progress = { ...patch, elapsed_seconds: Math.round((Date.now() - startedAt) / 1000), client_request_id: opts.client_request_id || null };
      await db().from("prospect_discoveries").update({ progress_json: progress, status: patch.status || undefined, updated_at: new Date().toISOString() }).eq("id", discovery_id);
    } catch { /* silent */ }
  };

  /* Wall-time abort — prospect flow should be fast (sales motion).
     180s cap; if it can't deliver in 3 min the prospect has lost
     interest. */
  const WALL_TIMEOUT_MS = 180_000;
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    updateProgress({ status: "timed_out", stage: "timed_out" });
  }, WALL_TIMEOUT_MS);

  try {
    /* ─── 3 lanes in parallel ─────────────────────────────── */
    await updateProgress({ status: "researching", stage: "researching", lanes_done: 0, lanes_total: 3 });

    let lanesDone = 0;
    const trackLane = async <T extends { failed?: string }>(p: Promise<T>): Promise<T> => {
      const res = await p;
      lanesDone++;
      llm_calls_used++;
      await updateProgress({ status: "researching", stage: "researching", lanes_done: lanesDone, lanes_total: 3 });
      return res;
    };

    if (timedOut) throw new Error("Aborted before research lanes due to wall-time limit.");

    // Build 12.8.2 — first attempt with web_search enabled
    let [resourceLane, haroLane, communitiesLane] = await Promise.all([
      trackLane(runResourcePagesLane(inputs, { discovery_id })),
      trackLane(runHaroPodcastsLane(inputs, { discovery_id })),
      trackLane(runCommunitiesLane(inputs, { discovery_id })),
    ]);

    // Build 12.8.2 — detect web_search-disabled state. If ALL THREE lanes
    // returned zero tool_use_count AND zero targets, the most likely cause
    // is web_search not enabled on the Anthropic API key. Fall back to
    // LLM-only research (omit tools array) so the prospect at least gets
    // training-data-grounded suggestions instead of an empty teaser.
    const totalToolUses = resourceLane.tool_use_count + haroLane.tool_use_count + communitiesLane.tool_use_count;
    const totalTargetsFirstPass = resourceLane.targets.length + haroLane.targets.length + communitiesLane.targets.length;
    let usedFallback = false;
    let webSearchDisabled = false;
    if (totalToolUses === 0 && totalTargetsFirstPass === 0) {
      webSearchDisabled = true;
      console.warn(`[prospect] 0/0/0 tool uses + 0/0/0 targets — web_search appears disabled on Anthropic key. Re-running lanes with web_search OFF for honest LLM-only fallback.`);
      usedFallback = true;
      lanesDone = 0;
      await updateProgress({ status: "researching", stage: "researching", lanes_done: 0, lanes_total: 3 });
      [resourceLane, haroLane, communitiesLane] = await Promise.all([
        trackLane(runResourcePagesLane(inputs, { discovery_id, enable_web_search: false })),
        trackLane(runHaroPodcastsLane(inputs, { discovery_id, enable_web_search: false })),
        trackLane(runCommunitiesLane(inputs, { discovery_id, enable_web_search: false })),
      ]);
    }

    const lanes = [resourceLane, haroLane, communitiesLane];
    web_searches_used = lanes.reduce((n, l) => n + l.tool_use_count, 0);

    /* ─── Render teaser ──────────────────────────────────── */
    if (timedOut) throw new Error("Aborted before render due to wall-time limit.");
    await updateProgress({ status: "synthesizing", stage: "synthesizing", lanes_done: 3, lanes_total: 3 });

    const teaser_md = renderTeaserReport({ inputs, lanes, webSearchDisabled });
    const totalTargets = lanes.reduce((n, l) => n + l.targets.length, 0);

    /* ─── Persist final state ─────────────────────────────── */
    const targetsFlat = lanes.flatMap(l => l.targets);
    if (discovery_id) {
      try {
        await db().from("prospect_discoveries").update({
          teaser_md,
          targets_json: targetsFlat,
          status: "complete",
          completed_at: new Date().toISOString(),
          llm_calls_used,
          web_searches_used,
          progress_json: { stage: "complete", lanes_done: 3, lanes_total: 3, elapsed_seconds: Math.round((Date.now() - startedAt) / 1000) },
          updated_at: new Date().toISOString(),
        }).eq("id", discovery_id);
      } catch (e: any) {
        console.warn(`[prospect] final update threw: ${e?.message}`);
      }
    }

    clearTimeout(timeoutHandle);
    console.log(`[prospect] discovery complete in ${Math.round((Date.now() - startedAt) / 1000)}s · targets=${totalTargets} · llm=${llm_calls_used}`);
    return {
      success: true,
      discovery_id,
      teaser_md,
      targets_count: totalTargets,
      llm_calls_used,
      web_searches_used,
    };
  } catch (e: any) {
    clearTimeout(timeoutHandle);
    const msg = e?.message || "Prospect discovery failed.";
    if (discovery_id) {
      try {
        await db().from("prospect_discoveries").update({
          status: timedOut ? "timed_out" : "failed",
          error_message: msg,
          updated_at: new Date().toISOString(),
        }).eq("id", discovery_id);
      } catch { /* silent */ }
    }
    return { success: false, discovery_id, error: msg };
  }
}

/* ─── Status polling endpoint ────────────────────────────────── */
export async function getProspectDiscoveryStatus(opts: { discovery_id?: string; client_request_id?: string }) {
  try {
    let q = db().from("prospect_discoveries").select("id, status, progress_json, teaser_md, targets_json, error_message, industry, client_url, created_at").limit(1);
    if (opts.discovery_id) q = q.eq("id", opts.discovery_id);
    else if (opts.client_request_id) q = q.eq("client_request_id", opts.client_request_id);
    else return { success: false, error: "Either discovery_id or client_request_id required." };
    q = q.order("created_at", { ascending: false });
    const { data, error } = await q.maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "No discovery found yet — may still be starting up." };
    const row: any = data;
    const progress = row.progress_json || {};
    return {
      success: true,
      discovery_id: row.id,
      status: row.status || "unknown",
      stage: progress.stage || row.status,
      lanes_done: progress.lanes_done || 0,
      lanes_total: progress.lanes_total || 3,
      elapsed_seconds: progress.elapsed_seconds || null,
      error_message: row.error_message || null,
      complete: row.status === "complete",
      teaser_md: row.status === "complete" ? row.teaser_md : undefined,
      targets: row.status === "complete" ? row.targets_json : undefined,
    };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

/* ─── List recent discoveries ─────────────────────────────────── */
export async function listProspectDiscoveries(opts: { limit?: number } = {}) {
  try {
    const { data, error } = await db().from("prospect_discoveries")
      .select("id, industry, geography, prospect_name, status, targets_json, llm_calls_used, web_searches_used, converted_to_project_id, created_at")
      .order("created_at", { ascending: false })
      .limit(opts.limit || 50);
    if (error) return { success: false, items: [], error: error.message };
    const items = (data as any[] || []).map(r => ({
      ...r,
      target_count: Array.isArray(r.targets_json) ? r.targets_json.length : 0,
      targets_json: undefined,
    }));
    return { success: true, items };
  } catch (e: any) {
    return { success: false, items: [], error: e?.message };
  }
}
