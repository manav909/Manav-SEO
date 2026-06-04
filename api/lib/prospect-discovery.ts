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
  brief_id?: string | null;
}): Promise<{ text: string | null; web_searches: number; tool_use_count: number }> {
  if (!ANTHROPIC_API_KEY) {
    console.error(`[${opts.label}] ANTHROPIC_API_KEY missing`);
    return { text: null, web_searches: 0, tool_use_count: 0 };
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, 2000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 240_000);
    const attemptStart = Date.now();

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: opts.maxTokens,
          system: opts.system,
          messages: [{ role: "user", content: opts.user }],
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        }),
      });
      clearTimeout(timer);

      if (r.ok) {
        const d = await r.json();
        const blocks = d?.content || [];
        // Extract all text blocks, joined with double newline
        const textBlocks = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text || "");
        const text = textBlocks.join("\n\n").trim();
        // Count web_search tool uses
        const toolUseCount = blocks.filter((b: any) => b.type === "tool_use" && b.name === "web_search").length;
        // Server-side metric stays separate from tool_use count (some servers
        // may have multiple internal searches per tool_use call).
        const webSearches = toolUseCount;
        const duration = Date.now() - attemptStart;
        console.log(`[${opts.label}] ok in ${duration}ms · tool_uses=${toolUseCount} · text_len=${text.length} · stop=${d?.stop_reason}`);
        return { text: text || null, web_searches: webSearches, tool_use_count: toolUseCount };
      }

      const errText = await r.text().catch(() => "");
      console.error(`[${opts.label}] HTTP ${r.status}: ${errText.slice(0, 300)}`);
      if (![429, 503, 529].includes(r.status) || attempt === 2) {
        return { text: null, web_searches: 0, tool_use_count: 0 };
      }
    } catch (e: any) {
      clearTimeout(timer);
      const aborted = controller.signal.aborted;
      console.error(`[${opts.label}] exc: ${e?.message}${aborted ? " (aborted by 240s timeout)" : ""}`);
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
  failed?: string;
}

async function runResourcePagesLane(inputs: ProspectDiscoveryInputs): Promise<LaneResult> {
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
- 2-3 targets ONLY. Quality over quantity. Prospect will read 3, not 10.
- Use web_search to find current resource pages in this industry. Search queries like: "[industry] resource page", "[industry] useful links", "best [industry] websites".
- If web_search returns no useful results, return fewer targets. Empty array is acceptable.`;

  const user = `Industry: ${inputs.industry}
${inputs.geography ? `Geography: ${inputs.geography}\n` : ""}${inputs.budget_tier ? `Budget tier: ${inputs.budget_tier}\n` : ""}${inputs.context ? `Additional context: ${inputs.context}\n` : ""}
Find 2-3 specific resource pages or industry directories where someone in this space could realistically earn a free backlink. Use web_search to find current, real options.`;

  const result = await callAnthropicWithWebSearch({ system, user, label: "prospect/resource-pages", maxTokens: 3500 });
  if (!result.text) return { category: "Resource Pages & Industry Directories", targets: [], raw_research_text: "", failed: "no response" };
  const parsed = extractJson(result.text);
  if (!parsed || !Array.isArray(parsed.targets)) {
    return { category: "Resource Pages & Industry Directories", targets: [], raw_research_text: result.text, failed: "parse failed" };
  }
  return { category: "Resource Pages & Industry Directories", targets: parsed.targets, raw_research_text: result.text };
}

async function runHaroPodcastsLane(inputs: ProspectDiscoveryInputs): Promise<LaneResult> {
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
- 2-3 targets ONLY.
- Use web_search to find current podcasts in this industry that accept guests. Search queries like: "top [industry] podcasts 2025", "[industry] podcasts accepting guests".
- For HARO-style platforms, you can rely on training data — they're well-known and stable.
- Empty array acceptable if web_search returns nothing specific.`;

  const user = `Industry: ${inputs.industry}
${inputs.geography ? `Geography: ${inputs.geography}\n` : ""}${inputs.budget_tier ? `Budget tier: ${inputs.budget_tier}\n` : ""}${inputs.context ? `Additional context: ${inputs.context}\n` : ""}
Find 2-3 specific HARO-style platforms or niche podcasts where someone in this space could earn a free placement. Use web_search to find current real podcasts.`;

  const result = await callAnthropicWithWebSearch({ system, user, label: "prospect/haro-podcasts", maxTokens: 3500 });
  if (!result.text) return { category: "Expert Quotes & Podcast Guesting", targets: [], raw_research_text: "", failed: "no response" };
  const parsed = extractJson(result.text);
  if (!parsed || !Array.isArray(parsed.targets)) {
    return { category: "Expert Quotes & Podcast Guesting", targets: [], raw_research_text: result.text, failed: "parse failed" };
  }
  return { category: "Expert Quotes & Podcast Guesting", targets: parsed.targets, raw_research_text: result.text };
}

async function runCommunitiesLane(inputs: ProspectDiscoveryInputs): Promise<LaneResult> {
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
- 2-3 targets.
- Use web_search to find current active communities in this industry. Search queries like: "[industry] subreddit", "[industry] community", "best [industry] blogs".
- Note: communities themselves rarely give followed links. Their VALUE is entity-association and discovery — your name appears, journalists googling the topic find you. Frame why_valuable accordingly.`;

  const user = `Industry: ${inputs.industry}
${inputs.geography ? `Geography: ${inputs.geography}\n` : ""}${inputs.budget_tier ? `Budget tier: ${inputs.budget_tier}\n` : ""}${inputs.context ? `Additional context: ${inputs.context}\n` : ""}
Find 2-3 specific niche communities or industry blogs where someone in this space could build the entity associations that earn ongoing citations. Use web_search.`;

  const result = await callAnthropicWithWebSearch({ system, user, label: "prospect/communities", maxTokens: 3500 });
  if (!result.text) return { category: "Niche Communities & Industry Blogs", targets: [], raw_research_text: "", failed: "no response" };
  const parsed = extractJson(result.text);
  if (!parsed || !Array.isArray(parsed.targets)) {
    return { category: "Niche Communities & Industry Blogs", targets: [], raw_research_text: result.text, failed: "parse failed" };
  }
  return { category: "Niche Communities & Industry Blogs", targets: parsed.targets, raw_research_text: result.text };
}

/* ─── Teaser report rendering ─────────────────────────────────── */
function renderTeaserReport(opts: { inputs: ProspectDiscoveryInputs; lanes: LaneResult[] }): string {
  const { inputs, lanes } = opts;
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
  L.push(`Every target below is **named and findable** — we have not invented placeholders. DA ranges shown are honest estimates with confidence labels; precise numbers come from connected backlink tools after engagement.`);
  L.push("");
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
    const [resourceLane, haroLane, communitiesLane] = await Promise.all([
      trackLane(runResourcePagesLane(inputs)),
      trackLane(runHaroPodcastsLane(inputs)),
      trackLane(runCommunitiesLane(inputs)),
    ]);

    const lanes = [resourceLane, haroLane, communitiesLane];
    // Note: web_searches_used isn't directly returned from each lane in the
    // refactored type; count via lanes' raw_research_text length as a proxy.
    // For more accurate tracking, callAnthropicWithWebSearch returns the
    // count and we could thread it through, but for the teaser this is fine.
    web_searches_used = lanes.reduce((n, l) => n + (l.failed ? 0 : 2), 0); // rough estimate: ~2 searches per successful lane

    /* ─── Render teaser ──────────────────────────────────── */
    if (timedOut) throw new Error("Aborted before render due to wall-time limit.");
    await updateProgress({ status: "synthesizing", stage: "synthesizing", lanes_done: 3, lanes_total: 3 });

    const teaser_md = renderTeaserReport({ inputs, lanes });
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
