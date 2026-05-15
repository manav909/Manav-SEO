/* ═══════════════════════════════════════════════════════════
   market-researcher.ts — Manav's Eyes.

   The market researcher works INDEPENDENTLY of the website.
   It understands the market, the buyers, the industry dynamics,
   and translates that into intelligence the Brain accumulates.

   Actions:
   ─ build_persona        → deep AI buyer persona (JSON)
   ─ suggest_goals        → phased goals + KPIs (JSON)
   ─ research_market      → streaming market intelligence report
   ─ cross_project_patterns → mine brain_learnings for industry wisdom (JSON)

   Every output that teaches the brain something is saved to brain_learnings
   with industry + keyword_cluster tags for cross-project IQ.
═══════════════════════════════════════════════════════════ */

import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

/* ─────────────────────────────────────────────────────────────
   INLINED Intelligence Fabric helpers (mirror of api/lib/intelligenceFabric.ts)
   Inlined here to keep the Lambda standalone — previous lib/ import attempts
   caused FUNCTION_INVOCATION_FAILED on cold start.
   ───────────────────────────────────────────────────────────── */
type SourceType = "manual_user" | "user_comment" | "gsc_live" | "ga_live" | "audit_run" |
  "crawl_jina" | "brain_learning" | "algorithm_intel" | "intelligence_output" |
  "claude_inference" | "industry_pattern" | "unknown";
interface SourceUsage { source: SourceType; confidence: number; weight?: number; label?: string; count?: number; }
const SOURCE_CONFIDENCE: Record<SourceType, number> = {
  manual_user: 98, user_comment: 98, gsc_live: 95, ga_live: 95, audit_run: 88,
  crawl_jina: 85, brain_learning: 80, algorithm_intel: 82, intelligence_output: 80,
  claude_inference: 65, industry_pattern: 45, unknown: 30,
};
function source(type: SourceType, opts: { label?: string; weight?: number; count?: number; overrideConfidence?: number } = {}): SourceUsage {
  return { source: type, confidence: opts.overrideConfidence ?? SOURCE_CONFIDENCE[type], weight: opts.weight ?? 1, label: opts.label, count: opts.count };
}
function computeWeightedConfidence(sources: SourceUsage[]): number {
  if (!sources.length) return 0;
  let s = 0, w = 0;
  for (const x of sources) { const ww = x.weight ?? 1; s += (x.confidence ?? SOURCE_CONFIDENCE[x.source] ?? 30) * ww; w += ww; }
  return w > 0 ? Math.round(s / w) : 0;
}
function fingerprint(input: any): string {
  const str = typeof input === "string" ? input : JSON.stringify(input, Object.keys(input || {}).sort()).slice(0, 5000);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h.toString(16);
}
async function saveIntelligenceOutput(sbc: any, p: {
  projectId: string; analysisType: string; title?: string; summary?: string;
  output: any; sources: SourceUsage[]; modelUsed?: string; inputFingerprint?: string;
  sourceBreakdown?: Record<string, number>; createdBy?: string;
}): Promise<string | null> {
  try {
    const weighted = computeWeightedConfidence(p.sources);
    const fp = p.inputFingerprint || fingerprint(p.output);
    const { data } = await sbc.from("intelligence_outputs").insert({
      project_id: p.projectId, analysis_type: p.analysisType,
      title: p.title?.slice(0, 200) || null, summary: p.summary?.slice(0, 500) || null,
      output: p.output, sources_used: p.sources, weighted_confidence: weighted,
      source_breakdown: p.sourceBreakdown || null, model_used: p.modelUsed || null,
      input_fingerprint: fp, status: "active", created_by: p.createdBy || "system",
      generated_at: new Date().toISOString(),
    }).select("id").single();
    return data?.id || null;
  } catch (_e) { return null; }
}
async function supersedePriorOutputs(sbc: any, projectId: string, analysisType: string, newOutputId: string): Promise<void> {
  try {
    await sbc.from("intelligence_outputs")
      .update({ status: "superseded", superseded_by: newOutputId })
      .eq("project_id", projectId).eq("analysis_type", analysisType)
      .eq("status", "active").neq("id", newOutputId);
  } catch (_e) {}
}

/* Inline Supabase client — avoids local lib/ import resolution issues in Lambda */
function sb() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
  );
}

/* Fire-and-forget save — never throws, never blocks response */
async function quickSave(projectId: string, title: string, content: string, tags: string[]) {
  try {
    await sb().from("brain_learnings").insert({
      project_id: projectId, source: "market_researcher",
      card_type: "market", card_title: title.slice(0, 100),
      improvement: content.slice(0, 400), context_summary: "market_researcher",
      what_worked: [], what_missed: [], tags: [...new Set(tags)],
      applied_count: 0, status: "pending_review", auto_captured: true,
      confidence_score: 78, updated_at: new Date().toISOString(),
    });
  } catch (_) {}
}

/* Jina URL fetch — pulls live page content (max 2500 chars) so persona is grounded in reality, not assumption */
async function fetchUrl(url: string): Promise<string> {
  if (!url) return "";
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    const r = await fetch(`https://r.jina.ai/${u}`, {
      headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "12" },
      signal: AbortSignal.timeout(14000),
    });
    return r.ok ? (await r.text()).slice(0, 2500) : "";
  } catch (_e) { return ""; }
}

async function quickDesk(projectId: string, title: string, content: string, contentType: string, tags: string[]) {
  if (!projectId || content.length < 50) return;
  try {
    await sb().from("brain_desk").insert({
      project_id: projectId, title: title.slice(0, 200),
      content_type: contentType, content, source: "market_researcher",
      tags: [...new Set(tags)], pinned: false,
      metadata: { auto_saved: true }, updated_at: new Date().toISOString(),
    });
  } catch (_) {}
}

export const config = { maxDuration: 300 };

/* Robust JSON extractor — correctly handles strings, escapes, markdown fences */
function extractJson(raw: string): any | null {
  if (!raw) return null;
  // Strip markdown code fences (multiline)
  const s = raw.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/im, "").trim();
  // Try direct parse first (clean output)
  try { return JSON.parse(s); } catch (_) {}
  // Walk character-by-character tracking string context + brace depth
  // This correctly skips { and } that appear inside string values
  let start = -1, depth = 0, inString = false, escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape)              { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true;  continue; }
    if (ch === '"')          { inString = !inString; continue; }
    if (inString)            { continue; }  // skip everything inside strings
    if (ch === "{")          { if (depth === 0) start = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try { return JSON.parse(s.slice(start, i + 1)); }
        catch (_) { start = -1; depth = 0; } // malformed — keep scanning
      }
    }
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _handler(req, res); }
  catch (e: any) {
    console.error("[market-researcher] unhandled:", e?.message, e?.stack?.slice(0, 800));
    try {
      if (!res.headersSent) res.status(200).json({ error: e?.message || "unknown crash" });
    } catch (_) {}
  }
}

async function _handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed" });

  const body = req.body || {};
  const { action, projectId } = body;
  if (!action) return res.status(200).json({ error: "Missing action" });

  const client = new Anthropic();

  /* ── Load project context ── */
  let project: any = null;
  if (projectId) {
    const { data } = await sb().from("projects")
      .select("id,name,url,industry,keywords,competitors,goals,cms,country,city")
      .eq("id", projectId).single();
    project = data;
  }

  const industry: string      = body.industry || project?.industry || "";
  const keywords: string[]    = body.keywords  || project?.keywords  || [];
  const competitors: string[] = body.competitors || project?.competitors || [];
  const company: string       = body.company || project?.name || "";
  const url: string           = body.url || project?.url || "";
  const goals: string         = body.goals || (project?.goals ? String(project.goals) : "");
  const region: string        = [project?.city, project?.country].filter(Boolean).join(", ");

  /* ── Build explicit data provenance record ── */
  /* This tells Claude (and the UI) exactly what was provided vs missing */
  const dataProvided: string[] = [];
  const dataAssumed: string[]  = [];

  if (company)              dataProvided.push(`Company name: "${company}"`);
  else                      dataAssumed.push("Company name: not provided — analysis is generic for the industry");

  if (industry)             dataProvided.push(`Industry: "${industry}"`);
  else                      dataAssumed.push("Industry: NOT PROVIDED — Claude will infer from context or use general digital services; accuracy will be low");

  if (url)                  dataProvided.push(`Website URL: ${url}`);
  else                      dataAssumed.push("Website URL: not provided — cannot analyse actual site content or positioning");

  if (keywords.length)      dataProvided.push(`Target keywords (${keywords.length}): ${keywords.slice(0,6).join(", ")}`);
  else                      dataAssumed.push("Target keywords: none provided — search behavior analysis will be based on industry patterns only");

  if (competitors.length)   dataProvided.push(`Competitors (${competitors.length}): ${competitors.slice(0,4).join(", ")}`);
  else                      dataAssumed.push("Competitors: none provided — competitive analysis will use typical industry alternatives");

  if (goals)                dataProvided.push(`Business goals: provided`);
  else                      dataAssumed.push("Business goals: not provided — recommendations will be based on typical industry objectives");

  if (region)               dataProvided.push(`Market region: ${region}`);
  else                      dataAssumed.push("Market region: not specified — defaulting to global/English-speaking market patterns");

  const effectiveIndustry = industry || "the industry (not specified — you must state this assumption clearly)";

  /* ═══════════════════════════════════════════
     ACTION: build_persona
     Now uses the FULL Brain Command memory:
     project data + analytics + metrics + audits + crawl + learnings + algorithm intel + canvas + live URL fetches.
     No more generic outputs — every insight is grounded in real project data.
  ═══════════════════════════════════════════ */
  if (action === "build_persona") {
    /* ── Pull rich Brain memory from BrainCommand ── */
    const bm = body.brainMemory || {};
    const pc:  any = bm.projectContext || null;        // get_context() payload
    const cb:  any[] = bm.canvasBlocks || [];
    const pLearn: any[] = bm.learnings || [];          // PROJECT-specific learnings
    const algo:   any[] = bm.algoItems || [];          // current algorithm intel
    const prior:  any = bm.priorPersona || null;       // last persona (for evolution awareness)

    /* ── Cross-project industry learnings (separate from project-specific) ── */
    let industryWisdom = "";
    if (industry) {
      const { data: crossLearnings } = await sb()
        .from("brain_learnings")
        .select("card_title,improvement,card_type,confidence_score,project_id")
        .contains("tags", [industry.toLowerCase().replace(/\s+/g, "-")])
        .neq("project_id", projectId || "")
        .order("confidence_score", { ascending: false })
        .limit(15);
      if (crossLearnings?.length) {
        industryWisdom = crossLearnings.map((l: any) =>
          `[${l.card_type}] ${l.card_title}: ${l.improvement?.slice(0, 150)}`
        ).join("\n");
      }
    }

    /* ── Live URL fetch (project + top 2 competitors, parallel, fail-soft) ── */
    const compUrls: string[] = (pc?.competitors?.c1 ? [pc.competitors.c1] : [])
      .concat(pc?.competitors?.c2 ? [pc.competitors.c2] : [])
      .filter((c: string) => /^https?:\/\//i.test(c) || c.includes("."));
    const [siteLive, comp1Live, comp2Live] = await Promise.all([
      url ? fetchUrl(url) : Promise.resolve(""),
      compUrls[0] ? fetchUrl(compUrls[0]) : Promise.resolve(""),
      compUrls[1] ? fetchUrl(compUrls[1]) : Promise.resolve(""),
    ]);

    /* ── Build RICH data provenance using EVERY data point we actually have ── */
    if (pc?.analytics?.organicMonthly)   dataProvided.push(`Organic traffic: ${pc.analytics.organicMonthly}/month (from Data Room)`);
    if (pc?.analytics?.gscClicks)        dataProvided.push(`GSC clicks: ${pc.analytics.gscClicks} | Impressions: ${pc.analytics.gscImpressions || "?"} | Avg position: ${pc.analytics.gscAvgPos || "?"}`);
    if (pc?.metrics?.llmVisibility != null) dataProvided.push(`LLM Visibility: ${pc.metrics.llmVisibility}/100 (Perplexity citations: ${pc.metrics.perplexity || 0}, ChatGPT: ${pc.metrics.chatgpt || 0}, Google AI: ${pc.metrics.googleAI || 0})`);
    if (pc?.metrics?.eeat != null)       dataProvided.push(`E-E-A-T: ${pc.metrics.eeat}/100 | Authority: ${pc.metrics.authority || "?"}/100 | Algo Health: ${pc.metrics.algorithmHealth || "?"}/100`);
    if (pc?.technical?.pagesIndexed)     dataProvided.push(`Pages indexed: ${pc.technical.pagesIndexed} | Crawl errors: ${pc.technical.crawlErrors || 0} | Schema: ${pc.technical.schema || "unknown"}`);
    if (pc?.tech?.cms)                   dataProvided.push(`Tech stack: ${pc.tech.cms}${pc.tech.seoPlugin ? ` + ${pc.tech.seoPlugin}` : ""}${pc.tech.hosting ? ` on ${pc.tech.hosting}` : ""} | PageSpeed mobile: ${pc.tech.pagespdMobile || "?"}`);
    if (pc?.goals?.primary)              dataProvided.push(`Primary goal: ${pc.goals.primary} | Timeline: ${pc.goals.timeline || "not set"} | Success metric: ${pc.goals.success || "not set"}`);
    if (pc?.competitors?.c1)             dataProvided.push(`Competitor 1: ${pc.competitors.c1} (DR ${pc.competitors.c1dr || "?"}) | Our DR: ${pc.competitors.ourDR || "?"}`);
    if (pLearn.length)                   dataProvided.push(`${pLearn.length} active Brain Learning(s) about THIS project`);
    if (algo.length)                     dataProvided.push(`${algo.length} algorithm-intel items loaded (most recent SEO/GEO patterns)`);
    if (cb.length)                       dataProvided.push(`Canvas has ${cb.length} card(s) — current execution state`);
    if (pc?.audits?.length)              dataProvided.push(`${pc.audits.length} prior audit(s) — latest from ${pc.audits[0]?.date || "?"}`);
    if (pc?.crawl_data?.page_count)      dataProvided.push(`Live crawl available: ${pc.crawl_data.page_count} pages analyzed on ${pc.crawl_data.crawled_at || "recent date"}`);
    if (siteLive)                        dataProvided.push(`Live homepage fetched (${siteLive.length} chars) — actual current content`);
    if (comp1Live)                       dataProvided.push(`Competitor 1 page fetched (${comp1Live.length} chars)`);
    if (prior)                           dataProvided.push(`Prior persona exists ("${prior.persona_name || "unnamed"}") — this analysis will note what evolved`);

    /* ── Honest gaps ── */
    if (pc?.gaps?.noGoal)                dataAssumed.push("Primary goal is empty in Data Room — recommendations will be based on typical industry objectives");
    if (pc?.gaps?.noAnalytics)           dataAssumed.push("No analytics data in Data Room — buyer journey claims are inferred from industry patterns");
    if (pc?.gaps?.noCompetitors)         dataAssumed.push("No competitors specified — competitive analysis uses typical industry alternatives");
    if (pc?.gaps?.noTechnical)           dataAssumed.push("No technical data — cannot validate site readiness for this persona");
    if (pc?.gaps?.noMetrics)             dataAssumed.push("No LLM/E-E-A-T metrics — cannot assess current AI search visibility");

    /* ── Compose project-specific learning context (what we ALREADY know about THIS project) ── */
    const projectLearningsText = pLearn.length > 0
      ? pLearn.slice(0, 10).map((l: any, i: number) => {
          const conf = l.confidence_score || 75;
          const worked = (l.what_worked || []).slice(0, 2).join(" | ");
          const missed = (l.what_missed || []).slice(0, 2).join(" | ");
          return `[L${i+1}|${l.card_type}|conf ${conf}] ${l.card_title}\n   → ${l.improvement?.slice(0, 200) || "—"}${worked ? `\n   ✓ ${worked}` : ""}${missed ? `\n   ✗ ${missed}` : ""}`;
        }).join("\n")
      : "No prior learnings for this specific project yet.";

    /* ── Algorithm intel context — recent SEO/GEO patterns that affect persona's search behavior ── */
    const algoText = algo.length > 0
      ? algo.slice(0, 8).map((a: any) => `• [${a.impact_level || "?"}|${a.engine || "?"}] ${a.topic}: ${(a.summary || "").slice(0, 140)}`).join("\n")
      : "No algorithm intel available.";

    /* ── Canvas state — what's already being worked on (so persona doesn't suggest duplicates) ── */
    const canvasText = cb.length > 0
      ? cb.slice(0, 15).map((c: any) => `[${c.type || "?"}|${c.status || "?"}|wk${c.week || "?"}] ${c.title}`).join("\n")
      : "Canvas is empty — no execution work in progress.";

    /* ── Live site snapshot (real content, not assumed) ── */
    const liveSnapshot = [
      siteLive   ? `═ LIVE HOMEPAGE (actual content, ${siteLive.length} chars):\n${siteLive.slice(0, 1500)}` : "",
      comp1Live  ? `\n═ COMPETITOR 1 LIVE (${pc?.competitors?.c1}):\n${comp1Live.slice(0, 1200)}` : "",
      comp2Live  ? `\n═ COMPETITOR 2 LIVE (${pc?.competitors?.c2}):\n${comp2Live.slice(0, 1200)}` : "",
    ].filter(Boolean).join("\n");

    /* ── Prior persona reference ── */
    const priorPersonaText = prior
      ? `═ PRIOR PERSONA (for evolution awareness):\nName: ${prior.persona_name || "?"} | Archetype: ${prior.persona_archetype || "?"}\nKey pain points: ${(prior.psychology?.primary_pain_points || []).slice(0,3).join(" | ")}\nNote: if your new analysis differs, briefly explain WHAT CHANGED and WHY in manav_intelligence_note.`
      : "";

    const prompt = `You are a world-class market researcher and buyer psychologist working INSIDE the SEO Season Brain.
Your task: build a HONEST, DEEP, ACTIONABLE buyer persona that is specifically grounded in this project's real data.

CRITICAL RULES — never break these:
1. NEVER invent specific statistics, percentages, or numbers you don't know (e.g. "73% of buyers..."). Say "many", "most", "typically".
2. CLEARLY distinguish what you know from PROJECT DATA vs what you are inferring from industry patterns.
3. Reference SPECIFIC data points where available — e.g. "Given the site's LLM Visibility of 20/100, this persona is searching AI engines but won't find this brand…"
4. If you cite a Brain Learning, reference it as [L1], [L2] etc.
5. Your output must be presentation-ready for an agency talking to a client. No fluff, no generic claims.
6. Cross-reference: if the canvas already covers something, suggest a DIFFERENT angle, not a duplicate.

═══ PROJECT DATA PROVIDED (use these specifics in your analysis) ═══
${dataProvided.length > 0 ? dataProvided.map(d => `✓ ${d}`).join("\n") : "✗ No project data provided — analysis based entirely on industry pattern knowledge"}

═══ DATA GAPS (be honest about these) ═══
${dataAssumed.length > 0 ? dataAssumed.map(d => `⚠ ${d}`).join("\n") : "All key data was provided."}

═══ WHAT BRAIN ALREADY KNOWS ABOUT THIS PROJECT (${pLearn.length} learnings) ═══
${projectLearningsText}

═══ CURRENT ALGORITHM INTELLIGENCE (affects how the persona searches today) ═══
${algoText}

═══ CANVAS STATE (current execution — don't suggest duplicates) ═══
${canvasText}

═══ CROSS-PROJECT INDUSTRY WISDOM (other projects in ${industry || "this industry"}) ═══
${industryWisdom || "No prior cross-project data exists for this industry — this is the pioneer analysis."}

${liveSnapshot ? `═══ LIVE WEB CONTENT (just fetched, ground your claims in this) ═══\n${liveSnapshot}\n` : ""}
${priorPersonaText ? `${priorPersonaText}\n` : ""}
═══ BUILD THE PERSONA FOR ═══
Industry: ${effectiveIndustry}
Company: ${company || "not specified"}
Region/Market: ${region || "global/English-speaking"}
Keywords: ${keywords.slice(0, 10).join(", ") || "none provided"}
Competitors: ${competitors.slice(0, 5).join(", ") || "none provided"}
Goals: ${goals || pc?.goals?.primary || "not specified"}

Return ONLY valid JSON. Be SPECIFIC. Reference real numbers from project data when you have them.

{
  "data_intelligence": {
    "industry_analyzed": "<exact industry name you analyzed — be specific, e.g. 'B2B SaaS project management software' not just 'software'>",
    "market_region": "<specific market region or 'Global English-speaking markets' if not specified>",
    "company_analyzed": "<company name or 'Not specified'>",
    "analysis_generated": "${new Date().toISOString()}",
    "data_completeness": "<high|medium|low — based on how much project data was provided>",
    "data_completeness_reason": "<1 sentence: why this completeness rating — e.g. 'Industry, keywords, and competitors provided but no website URL or current goals'>",
    "what_was_provided": ${JSON.stringify(dataProvided)},
    "what_was_assumed": ${JSON.stringify(dataAssumed)},
    "cross_project_learnings_used": ${industryWisdom ? `"${industryWisdom.split("\n").length} learnings from existing projects in this industry"` : `"None — no prior data exists for this industry"`},
    "analysis_basis": "<1-2 sentences: what this entire analysis is grounded in — e.g. 'Industry keyword data provided by client, supplemented by buyer psychology patterns from the ${effectiveIndustry} market'>",
    "recency_note": "<honest statement about how current this analysis is — e.g. 'Based on established market patterns; does not reflect events after mid-2025. Validate search queries against live Google data before client presentation.'>",
    "what_would_improve_accuracy": ["<specific thing to add>", "<second thing>"]
  },
  "persona_name": "<archetype name — e.g. 'The Cautious Procurement Lead'>",
  "persona_archetype": "<B2B Decision Maker | B2C Impulse Buyer | Research-First Professional | ...>",
  "market_context": "<2-3 sentences: market reality for buyers in this industry right now — be specific to the industry provided>",
  "buyer_profile": {
    "who_they_are": "<specific description — role, situation, mindset>",
    "triggers_that_start_the_search": ["<trigger 1>", "<trigger 2>", "<trigger 3>"],
    "research_depth": "<how long they research — be specific e.g. '2-4 weeks' not just 'weeks'>",
    "decision_timeline": "<realistic timeline — e.g. 'Typically 3-8 weeks from first search to contract'>",
    "budget_mindset": "<how they think about price — be specific>",
    "decision_authority": "<who makes the call — be specific to the industry>"
  },
  "psychology": {
    "primary_pain_points": ["<specific, honest pain point — not generic>", "<pain 2>", "<pain 3>", "<pain 4>"],
    "deepest_fear": "<the one thing they most fear — be honest if this varies by segment>",
    "decision_triggers": ["<what finally makes them act — be specific>"],
    "what_they_actually_want": "<the real outcome beyond the product>",
    "objections_they_raise": ["<real objection 1>", "<real objection 2>", "<real objection 3>"]
  },
  "search_behavior": {
    "how_they_search": "<describe the typical journey — if keywords were provided, reference them; if not, use industry patterns>",
    "first_search_queries": ["<realistic query 1>", "<realistic query 2>", "<realistic query 3>"],
    "refinement_queries": ["<query when narrowing down>", "<second refinement>"],
    "comparison_queries": ["<comparison query>", "<vs query>"],
    "intent_shift": "<how intent evolves — be specific>"
  },
  "language_patterns": {
    "words_they_use": ["<real terms from their world>"],
    "words_that_convert": ["<terms that resonate — grounded in the industry>"],
    "words_that_repel": ["<jargon or terms that create distance>"],
    "questions_they_type_into_google": ["<real question-format queries>"]
  },
  "trust_signals": {
    "what_builds_immediate_trust": ["<specific trust signal>", "<second signal>"],
    "proof_formats_they_need": ["<case studies | numbers | testimonials | certifications — be specific to industry>"],
    "what_raises_red_flags": ["<specific red flag>", "<second red flag>"],
    "content_they_share_or_save": "<what type of content — be specific>"
  },
  "competitive_awareness": {
    "alternatives_they_consider": ["<realistic alternative 1>", "<realistic alternative 2>"],
    "why_they_choose_one_over_another": "<the real deciding factor — be honest, may be price, trust, speed>",
    "why_they_leave_and_try_someone_else": "<the main switching trigger>"
  },
  "seo_content_implications": {
    "content_gaps_this_persona_needs_filled": ["<specific gap tied to buyer needs>", "<gap 2>", "<gap 3>"],
    "ideal_page_types": ["<specific page type 1>", "<specific page type 2>"],
    "keyword_intent_map": [
      {"intent": "awareness", "example_keywords": ["<realistic keyword>", "<keyword 2>"], "basis": "<provided keywords | industry inference>"},
      {"intent": "consideration", "example_keywords": ["<keyword>", "<keyword>"], "basis": "<provided keywords | industry inference>"},
      {"intent": "decision", "example_keywords": ["<keyword>", "<keyword>"], "basis": "<provided keywords | industry inference>"}
    ],
    "format_recommendations": ["<specific format recommendation with reason>"]
  },
  "actionable_canvas_cards": [
    {"cardType":"content","title":"<specific card title, ≤60 chars>","content":"<2-3 sentences: what to execute, why this persona needs it, expected outcome — reference real project data>","priority":"high|medium|low","week":1,"persona_pain_point_served":"<which pain point from psychology.primary_pain_points this addresses>"},
    {"cardType":"technical","title":"<...>","content":"<...>","priority":"high|medium|low","week":1,"persona_pain_point_served":"<...>"},
    {"cardType":"strategy","title":"<...>","content":"<...>","priority":"medium","week":2,"persona_pain_point_served":"<...>"}
  ],
  "suggested_brain_learnings": [
    {"cardType":"insight","title":"<≤80 chars — a discrete, persistent insight this project should remember>","improvement":"<the actionable lesson>","whatWorked":["<observed strength>"],"whatMissed":["<observed gap>"],"summary":"<1 sentence context>","tags":["market-persona","<industry-tag>","<keyword-tag>"]},
    {"cardType":"strategy","title":"<...>","improvement":"<...>","whatWorked":[],"whatMissed":[],"summary":"<...>","tags":["market-persona","<industry-tag>"]}
  ],
  "data_room_gaps_to_close": [
    {"field":"<exact Data Room field name to fill, e.g. 'analytics.organic_sessions_monthly'>","why_it_matters":"<1 sentence: how this would sharpen the persona>","accuracy_boost":"<rough qualitative gain: 'sharpens search behavior model' or 'unlocks competitive gap analysis'>"}
  ],
  "manav_intelligence_note": "<the single most important insight — must be specific to this project (reference real data points), not generic. If a prior persona existed, mention what changed vs it.>"
}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 14000,    // bumped — schema now includes actionable_canvas_cards + suggested_brain_learnings + data_room_gaps + live-content references
      system: "You are a market research expert. Return ONLY raw JSON — no markdown fences, no prose before or after, no explanation. Start your response with { and end with }.",
      messages: [
        { role: "user",      content: prompt },
      ],
    });

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";
    const stopReason = response.stop_reason || "unknown";
    const raw = rawText;
    let persona = extractJson(raw);

    /* ── Truncation recovery: if Claude hit max_tokens mid-JSON, try to repair by closing braces ── */
    if (!persona?.persona_name && stopReason === "max_tokens") {
      const trimmed = raw.trimEnd();
      // Count unmatched braces/brackets and try simple completion
      let depth = 0, brackDepth = 0, inStr = false, esc = false;
      for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (esc) { esc = false; continue; }
        if (ch === "\\" && inStr) { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        else if (ch === "[") brackDepth++;
        else if (ch === "]") brackDepth--;
      }
      // Drop the final partial line, then close everything
      const lastComma = trimmed.lastIndexOf(",");
      const lastBraceOrBracket = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
      const cutAt = Math.max(lastComma, lastBraceOrBracket);
      if (cutAt > 0) {
        const head = trimmed.slice(0, cutAt).replace(/,\s*$/, "");
        const repaired = head + "]".repeat(Math.max(0, brackDepth)) + "}".repeat(Math.max(0, depth));
        persona = extractJson(repaired);
      }
    }

    if (!persona?.persona_name) {
      console.error("[market-researcher] persona JSON parse failed", { stopReason, rawLen: raw.length, tail: raw.slice(-300) });
      return res.status(200).json({
        success: false,
        error: stopReason === "max_tokens"
          ? "Persona generation hit token limit — Claude couldn't finish the JSON. Try again or fill missing Data Room fields to shorten the input context."
          : `Claude returned invalid JSON (stop: ${stopReason}) — try again`,
        debug: { stopReason, rawLength: raw.length, rawHead: raw.slice(0, 200), rawTail: raw.slice(-200) },
      });
    }

    /* Save persona to brain_learnings as market intelligence */
    if (projectId) {
      const learningContent = [
        persona.market_context,
        `Buyer: ${persona.buyer_profile?.who_they_are}`,
        `Deepest fear: ${persona.psychology?.deepest_fear}`,
        `Trust triggers: ${(persona.trust_signals?.what_builds_immediate_trust || []).join(", ")}`,
        `SEO gaps: ${(persona.seo_content_implications?.content_gaps_this_persona_needs_filled || []).join(", ")}`,
        persona.manav_intelligence_note,
      ].filter(Boolean).join("\n");

      const industryTag = industry.toLowerCase().replace(/\s+/g, "-");
      quickSave(projectId, `Market Persona: ${persona.persona_name} — ${industry}`, learningContent,
        ["market", "persona", industryTag, ...(keywords.slice(0, 3).map((k: string) => k.toLowerCase().replace(/\s+/g, "-")))]);
      quickDesk(projectId, `Market Persona: ${persona.persona_name}`, JSON.stringify(persona, null, 2), "analysis", ["persona", "market", industryTag]);

      /* Persist to market_personas table (upsert by project) */
      try {
        await sb().from("market_personas").upsert({
          project_id:   projectId,
          industry:     industry,
          persona_name: persona.persona_name,
          persona_data: persona,
          updated_at:   new Date().toISOString(),
        }, { onConflict: "project_id" });
      } catch (_e) { /* non-fatal */ }
    }

    /* ═══ INTELLIGENCE FABRIC: persist + score this output ═══ */
    let outputId: string | null = null;
    let weighted = 0;
    let fabricSources: SourceUsage[] = [];
    if (projectId) {
      fabricSources = [
        company   ? source("manual_user",      { label: "Company / project name", weight: 2 }) : null,
        industry  ? source("manual_user",      { label: "Industry",               weight: 2 }) : null,
        url       ? source("manual_user",      { label: "Website URL",            weight: 1 }) : null,
        keywords.length      ? source("manual_user", { label: `${keywords.length} target keywords`,    weight: 2, count: keywords.length })   : null,
        competitors.length   ? source("manual_user", { label: `${competitors.length} competitors`,     weight: 1, count: competitors.length }): null,
        pc?.analytics?.organicMonthly ? source("ga_live",   { label: "Organic traffic (GA/manual)",   weight: 3 }) : null,
        pc?.analytics?.gscClicks      ? source("gsc_live",  { label: "GSC clicks/impressions",         weight: 3 }) : null,
        pc?.metrics?.llmVisibility != null ? source("audit_run", { label: "LLM visibility metric",     weight: 2 }) : null,
        pc?.audits?.length            ? source("audit_run", { label: `${pc.audits.length} prior audit(s)`, weight: 2, count: pc.audits.length }) : null,
        pc?.crawl_data?.page_count    ? source("crawl_jina", { label: `Site crawl (${pc.crawl_data.page_count} pages)`, weight: 2, count: pc.crawl_data.page_count }) : null,
        siteLive    ? source("crawl_jina", { label: "Live homepage fetched",            weight: 2 }) : null,
        comp1Live   ? source("crawl_jina", { label: "Live competitor page fetched",     weight: 1 }) : null,
        comp2Live   ? source("crawl_jina", { label: "Live competitor 2 fetched",        weight: 1 }) : null,
        pLearn.length ? source("brain_learning", { label: `${pLearn.length} project Brain Learnings`, weight: 2, count: pLearn.length,
                                                   overrideConfidence: Math.round(pLearn.reduce((s: number, l: any) => s + (l.confidence_score || 75), 0) / pLearn.length) }) : null,
        algo.length   ? source("algorithm_intel", { label: `${algo.length} algorithm intel items`,    weight: 1, count: algo.length }) : null,
        industryWisdom ? source("intelligence_output", { label: `${industryWisdom.split("\n").length} cross-project industry learnings`, weight: 1 }) : null,
        prior         ? source("intelligence_output", { label: "Prior persona (evolution context)",   weight: 1 }) : null,
        // Always present: Claude's own inference work
        source("claude_inference", { label: "Claude buyer-psychology inference", weight: 2 }),
      ].filter(Boolean) as SourceUsage[];

      weighted = computeWeightedConfidence(fabricSources);

      outputId = await saveIntelligenceOutput(sb(), {
        projectId,
        analysisType:    "persona",
        title:           `Persona: ${persona.persona_name}${industry ? " — " + industry : ""}`,
        summary:         (persona.market_context || persona.manav_intelligence_note || "").slice(0, 480),
        output:          persona,
        sources:         fabricSources,
        modelUsed:       "claude-sonnet-4-6",
        inputFingerprint: fingerprint({ projectId, industry, keywords, competitors, url, goalsHash: pc?.goals }),
        sourceBreakdown: {
          provided:      dataProvided.length,
          assumed:       dataAssumed.length,
          learnings:     pLearn.length,
          algo_items:    algo.length,
          live_fetches:  (siteLive ? 1 : 0) + (comp1Live ? 1 : 0) + (comp2Live ? 1 : 0),
          canvas_cards:  cb.length,
        },
        createdBy: "market_researcher",
      });
      // Mark older personas for this project as superseded
      if (outputId) await supersedePriorOutputs(sb(), projectId, "persona", outputId);
    }

    return res.status(200).json({
      success: true,
      persona,
      // Rich "Powered by" provenance — every data source actually consumed
      _provenance: {
        dataProvided, dataAssumed,
        industry: effectiveIndustry, company, region,
        keywordCount: keywords.length, competitorCount: competitors.length,
        // Intelligence Fabric data
        outputId,
        weightedConfidence: weighted,
        sources: fabricSources,
        brainMemory: {
          projectLearningsCount: pLearn.length,
          algoIntelCount: algo.length,
          canvasCardsCount: cb.length,
          hasMetrics: !!pc?.metrics,
          hasAnalytics: !!pc?.analytics?.organicMonthly,
          hasAudits: (pc?.audits?.length || 0) > 0,
          hasCrawl: !!pc?.crawl_data?.page_count,
          siteFetched: siteLive.length > 0,
          competitorsFetched: (comp1Live.length > 0 ? 1 : 0) + (comp2Live.length > 0 ? 1 : 0),
          industryWisdomCount: industryWisdom ? industryWisdom.split("\n").length : 0,
          priorPersonaExists: !!prior,
        },
      },
    });
  }

  /* ═══════════════════════════════════════════
     ACTION: suggest_goals
     Market-intelligence driven goal setting.
     Aligned to 5-phase framework with KPIs.
  ═══════════════════════════════════════════ */
  if (action === "suggest_goals") {
    const existingPersona = body.existingPersona || null;

    /* Pull existing persona from DB if not provided */
    let personaContext = "";
    if (existingPersona) {
      const p = existingPersona;
      personaContext = `
BUYER PERSONA: ${p.persona_name} (${p.persona_archetype})
Market context: ${p.market_context}
Primary pain points: ${(p.psychology?.primary_pain_points || []).join(", ")}
Decision triggers: ${(p.psychology?.decision_triggers || []).join(", ")}
Search behavior: ${p.search_behavior?.how_they_search}
Trust signals: ${(p.trust_signals?.what_builds_immediate_trust || []).join(", ")}
Content gaps: ${(p.seo_content_implications?.content_gaps_this_persona_needs_filled || []).join(", ")}
`;
    } else if (projectId) {
      const { data: p } = await sb().from("market_personas").select("persona_data").eq("project_id", projectId).single();
      if (p?.persona_data) {
        const pd = p.persona_data;
        personaContext = `BUYER PERSONA: ${pd.persona_name}\nMarket context: ${pd.market_context}\nContent gaps: ${(pd.seo_content_implications?.content_gaps_this_persona_needs_filled || []).join(", ")}`;
      }
    }

    const prompt = `You are a strategic SEO growth advisor with deep knowledge of the ${industry} market.
Your task: suggest realistic, ambitious, market-intelligence-driven goals for this business.

BUSINESS:
Company: ${company || "not specified"} | Industry: ${industry} | Region: ${region || "global"}
Website: ${url || "not specified"}
Target keywords: ${keywords.slice(0, 8).join(", ") || "not specified"}
Competitors: ${competitors.slice(0, 5).join(", ") || "not specified"}
${personaContext}

FRAMEWORK: Use the 5-phase SEO Season methodology:
Phase 1: Discovery & Technical Foundation (Month 1-2)
Phase 2: Architecture & Content Strategy (Month 2-4)
Phase 3: Authority & Citation Building (Month 3-5)
Phase 4: Market Validation & Acceleration (Month 4-6)
Phase 5: Dominance & Defence (Month 6+)

Goals must be:
- Based on MARKET OPPORTUNITY, not current website state
- Realistic given phase duration
- Specific and measurable
- Informed by what the buyer persona actually needs

Return ONLY valid JSON:

{
  "market_opportunity": "<2-3 sentences: the specific opportunity in this market right now — what competitors are missing, what buyers aren't finding>",
  "competitive_gap": "<the single biggest gap in the market that this business can own>",
  "positioning_recommendation": "<how to position to own a specific niche vs. trying to beat everyone>",
  "recommended_6month_outcome": "<the one headline result after 6 months of excellent execution>",
  "phases": [
    {
      "phase": 1,
      "name": "Discovery & Technical Foundation",
      "timeline": "Month 1-2",
      "strategic_focus": "<what this phase achieves in the context of this specific market>",
      "milestone": "<the one concrete deliverable that marks this phase complete>",
      "kpis": [
        {"metric": "<specific metric>", "baseline_estimate": "<estimated current state>", "target": "<specific target>", "by": "Month 2"},
        {"metric": "<specific metric>", "baseline_estimate": "<estimated current state>", "target": "<specific target>", "by": "Month 2"}
      ]
    },
    {
      "phase": 2,
      "name": "Architecture & Content Strategy",
      "timeline": "Month 2-4",
      "strategic_focus": "<market-specific focus>",
      "milestone": "<deliverable>",
      "kpis": [
        {"metric": "<metric>", "baseline_estimate": "<baseline>", "target": "<target>", "by": "Month 4"},
        {"metric": "<metric>", "baseline_estimate": "<baseline>", "target": "<target>", "by": "Month 4"}
      ]
    },
    {
      "phase": 3,
      "name": "Authority & Citation Building",
      "timeline": "Month 3-5",
      "strategic_focus": "<market-specific focus>",
      "milestone": "<deliverable>",
      "kpis": [
        {"metric": "<metric>", "baseline_estimate": "<baseline>", "target": "<target>", "by": "Month 5"}
      ]
    },
    {
      "phase": 4,
      "name": "Market Validation & Acceleration",
      "timeline": "Month 4-6",
      "strategic_focus": "<market-specific focus>",
      "milestone": "<deliverable>",
      "kpis": [
        {"metric": "<metric>", "baseline_estimate": "<baseline>", "target": "<target>", "by": "Month 6"}
      ]
    },
    {
      "phase": 5,
      "name": "Dominance & Defence",
      "timeline": "Month 6+",
      "strategic_focus": "<what dominance looks like in this market>",
      "milestone": "<deliverable>",
      "kpis": [
        {"metric": "<metric>", "baseline_estimate": "<baseline>", "target": "<target>", "by": "Month 9"}
      ]
    }
  ],
  "quick_wins": ["<thing achievable in week 1-2 that builds momentum>", "<quick win 2>"],
  "risk_factors": ["<market or execution risk 1>", "<risk 2>"],
  "manav_note": "<the strategic insight that will make the difference between good and exceptional results>"
}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 5000,
      system: "You are an SEO growth strategist. Return ONLY raw JSON — no markdown fences, no prose before or after, no explanation. Start your response with { and end with }.",
      messages: [
        { role: "user",      content: prompt },
      ],
    });

    const rawText2 = response.content[0].type === "text" ? response.content[0].text : "";
    const raw = rawText2;
    const goalPlan = extractJson(raw);
    if (!goalPlan?.phases) {
      return res.status(200).json({ success: false, error: "Claude returned invalid JSON — try again", raw: raw.slice(0, 300) });
    }

    if (projectId) {
      const industryTag = industry.toLowerCase().replace(/\s+/g, "-");
      quickSave(projectId,
        `Goal Plan: ${company || industry} — ${goalPlan.recommended_6month_outcome?.slice(0, 60)}`,
        `${goalPlan.market_opportunity} ${goalPlan.competitive_gap} ${goalPlan.positioning_recommendation}`,
        ["goals", "market", "strategy", industryTag]);

      try {
        await sb().from("market_personas").upsert({
          project_id: projectId,
          industry,
          goals_data: goalPlan,
          updated_at: new Date().toISOString(),
        }, { onConflict: "project_id" });
      } catch (_e) { /* non-fatal */ }
    }

    return res.status(200).json({ success: true, goalPlan });
  }

  /* ═══════════════════════════════════════════
     ACTION: research_market
     Streaming deep market intelligence report.
     No website. Pure market + industry analysis.
  ═══════════════════════════════════════════ */
  if (action === "research_market") {
    res.writeHead(200, {
      "Content-Type":     "text/plain; charset=utf-8",
      "X-Accel-Buffering": "no",
      "Cache-Control":    "no-cache, no-transform",
      "Transfer-Encoding": "chunked",
    });

    const prompt = `You are the world's most insightful market researcher specialising in digital marketing strategy.
Write a comprehensive market intelligence report for the ${industry} industry${region ? ` in ${region}` : ""}.

CONTEXT:
Business: ${company || "client company"}
Keywords they target: ${keywords.slice(0, 8).join(", ") || "not specified"}
Competitors: ${competitors.slice(0, 5).join(", ") || "not specified"}

Write the report in this structure — be specific, opinionated, and intelligence-dense:

# Market Intelligence Report: ${industry}${region ? ` — ${region}` : ""}

## 1. Market Reality Check
What's actually happening in this market right now. Not the surface-level stuff — the real dynamics buyers experience.

## 2. The Buyer Journey (What Google Data Reveals)
How buyers in this industry search, research, and decide. The psychology behind their queries.

## 3. Where the Market Is Heading (Next 12-18 Months)
Trends, shifts, emerging buyer behaviours. What smart operators are positioning for now.

## 4. The Competitive Landscape
What the top players are doing well. Where the gaps are. What's genuinely differentiating vs. what's commoditised.

## 5. Keyword Opportunity Map
The keyword categories that matter: awareness → consideration → decision intent. Where the traffic is vs. where the intent is.

## 6. Content That Actually Wins in This Market
Format, depth, tone, structure that gets authority in this industry. What the algorithms reward vs. what buyers actually want.

## 7. AI & LLM Visibility in This Industry
How this industry appears in AI search (ChatGPT, Perplexity, Google AI). What types of businesses get cited.

## 8. The Strategic Opportunity
The specific, ownable position in this market that most businesses miss. The niche that compounds.

## 9. Manav's Intelligence Summary
3-5 bullet points — the insights that should immediately change the strategy for any business in this market.

Be direct, specific, and confident. Cite real search patterns and market dynamics. Think like someone who has audited 500 businesses in this industry.`;

    let fullOutput = "";
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 6000,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        const text = chunk.delta.text;
        fullOutput += text;
        try { res.write(text); } catch (_) {}
      }
    }

    res.end();

    if (projectId && fullOutput.length > 500) {
      const industryTag = industry.toLowerCase().replace(/\s+/g, "-");
      quickSave(projectId, `Market Intelligence: ${industry}${region ? ` — ${region}` : ""}`,
        fullOutput.slice(0, 3000), ["market", "intelligence", "industry", industryTag]);
      quickDesk(projectId, `Market Intelligence: ${industry}`, fullOutput, "report", ["market", "intelligence", industryTag]);
    }
    return;
  }

  /* ═══════════════════════════════════════════
     ACTION: cross_project_patterns
     Mine brain_learnings for cross-project wisdom.
     What has the brain learned across all clients
     in the same industry + keyword clusters?
  ═══════════════════════════════════════════ */
  if (action === "cross_project_patterns") {
    const industryTag = industry.toLowerCase().replace(/\s+/g, "-");
    const keywordTags = keywords.slice(0, 5).map((k: string) => k.toLowerCase().replace(/\s+/g, "-"));

    /* Query by industry tag */
    const { data: industryLearnings } = await sb()
      .from("brain_learnings")
      .select("card_title,improvement,card_type,confidence_score,tags,project_id,what_worked,what_missed")
      .contains("tags", [industryTag])
      .neq("project_id", projectId || "none")
      .gte("confidence_score", 60)
      .order("confidence_score", { ascending: false })
      .limit(30);

    /* Query by keyword clusters (union of all keyword tags) */
    let keywordLearnings: any[] = [];
    if (keywordTags.length) {
      const { data: kl } = await sb()
        .from("brain_learnings")
        .select("card_title,improvement,card_type,confidence_score,tags,what_worked")
        .overlaps("tags", keywordTags)
        .gte("confidence_score", 65)
        .order("confidence_score", { ascending: false })
        .limit(20);
      keywordLearnings = kl || [];
    }

    if ((!industryLearnings || !industryLearnings.length) && !keywordLearnings.length) {
      return res.status(200).json({
        success: true,
        patterns: null,
        message: `No cross-project data yet for industry "${industry}". This project will be the pioneer — everything learned here will inform future clients in this space.`,
        industryCount: 0,
        keywordCount: 0,
      });
    }

    /* Synthesize patterns with Claude */
    const learningContext = [
      ...(industryLearnings || []).map((l: any) => `[${l.card_type}|confidence:${l.confidence_score}] ${l.card_title}: ${l.improvement?.slice(0, 200)}`),
      ...keywordLearnings.map((l: any) => `[keyword-match|${l.confidence_score}] ${l.card_title}: ${l.improvement?.slice(0, 150)}`),
    ].join("\n\n");

    const synthResponse = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: "Return ONLY raw JSON — no markdown fences, no prose before or after. Start with { and end with }.",
      messages: [{
        role: "user",
        content: `You are Manav's Brain synthesizing cross-project intelligence.

The following learnings come from OTHER projects in the ${industry} industry and/or targeting similar keywords.
Extract the patterns — what consistently works, what consistently fails, what surprises exist.

LEARNINGS FROM OTHER PROJECTS:
${learningContext}

Return ONLY valid JSON:
{
  "pattern_summary": "<2-3 sentences: the meta-pattern across all these learnings>",
  "what_consistently_works": ["<pattern 1 with why>", "<pattern 2>", "<pattern 3>"],
  "what_consistently_fails": ["<common mistake 1>", "<common mistake 2>"],
  "surprising_insights": ["<thing that contradicts common wisdom>"],
  "apply_immediately": ["<the single most actionable thing to do now based on this data>", "<second action>"],
  "industry_benchmarks": {
    "typical_wins": "<what a well-executed campaign achieves in this industry>",
    "common_ceiling": "<where most businesses plateau and why>",
    "breakthrough_factor": "<what separates top 10% from the rest>"
  },
  "confidence_level": "<high|medium|low — based on volume and quality of cross-project data>",
  "data_points_synthesized": ${(industryLearnings?.length || 0) + keywordLearnings.length}
}`,
      },
      ],
    });

    const rawSynth = synthResponse.content[0].type === "text" ? synthResponse.content[0].text : "";
    const patterns = extractJson(rawSynth);
    if (!patterns?.pattern_summary) {
      return res.status(200).json({ success: false, error: "Synthesis parse error — try again" });
    }

    return res.status(200).json({
      success: true,
      patterns,
      industryCount: industryLearnings?.length || 0,
      keywordCount: keywordLearnings.length,
    });
  }

  if (action === "health_check") {
    return res.status(200).json({ status: "ok", service: "market-researcher" });
  }

  /* ═══════════════════════════════════════════
     ACTION: list_intelligence
     List all prior intelligence outputs for a project (memory panel)
  ═══════════════════════════════════════════ */
  if (action === "list_intelligence") {
    if (!projectId) return res.status(200).json({ error: "Missing projectId" });
    const { data: outputs } = await sb().from("intelligence_outputs")
      .select("id,analysis_type,title,summary,weighted_confidence,sources_used,source_breakdown,model_used,status,generated_at,viewed_at")
      .eq("project_id", projectId).eq("status", "active")
      .order("generated_at", { ascending: false }).limit(80);
    const { data: pending } = await sb().from("field_update_proposals")
      .select("id,field_path,field_category,current_value,proposed_value,proposed_by,proposer_confidence,reasoning,created_at")
      .eq("project_id", projectId).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(20);
    const { data: contradictions } = await sb().from("intelligence_contradictions")
      .select("id,contradiction_summary,severity,output_a_id,output_b_id,created_at")
      .eq("project_id", projectId).eq("status", "open")
      .order("created_at", { ascending: false }).limit(10);
    return res.status(200).json({
      success: true,
      outputs:        outputs || [],
      pendingProposals: pending || [],
      contradictions:   contradictions || [],
    });
  }

  /* ═══════════════════════════════════════════
     ACTION: get_intelligence
     Fetch the full output for a single intelligence_outputs row
  ═══════════════════════════════════════════ */
  if (action === "get_intelligence") {
    const id = body.id;
    if (!id) return res.status(200).json({ error: "Missing id" });
    const { data } = await sb().from("intelligence_outputs").select("*").eq("id", id).single();
    if (!data) return res.status(200).json({ error: "Not found" });
    // Mark as viewed
    try { await sb().from("intelligence_outputs").update({ viewed_at: new Date().toISOString() }).eq("id", id); } catch (_e) {}
    return res.status(200).json({ success: true, output: data });
  }

  /* ═══════════════════════════════════════════
     ACTION: resolve_proposal
     User approves/rejects a protected-field change
  ═══════════════════════════════════════════ */
  if (action === "resolve_proposal") {
    const { id, decision, reviewer, reviewNote } = body;
    if (!id || !["approved", "rejected"].includes(decision)) {
      return res.status(200).json({ error: "Invalid proposal resolution" });
    }
    /* If approved — apply the change to the right table (projects | project_knowledge).
       metrics.* (system-computed) is NEVER written even on approval. */
    if (decision === "approved") {
      const { data: prop } = await sb().from("field_update_proposals").select("*").eq("id", id).single();
      if (prop) {
        const [cat, ...rest] = prop.field_path.split(".");
        const key = rest.join(".");
        try {
          if (cat === "project") {
            /* Columns on the projects table — allowed list ONLY */
            const allowed = ["url", "name", "industry", "country", "city"];
            if (allowed.includes(key)) {
              await sb().from("projects").update({ [key]: prop.proposed_value }).eq("id", prop.project_id);
            }
          } else if (cat === "metrics") {
            /* System-computed metrics — NEVER overwrite via approval. Log a note but no write. */
            try {
              await sb().from("field_update_proposals").update({
                review_note: ((prop.review_note || "") + " [Note: metrics.* are system-computed, not written via approval]").slice(0, 500),
              }).eq("id", id);
            } catch (_e) {}
          } else if (["goal", "competitor", "comment", "analytics"].includes(cat)) {
            /* project_knowledge rows */
            await sb().from("project_knowledge").upsert({
              project_id:   prop.project_id,
              category:     cat,
              field_key:    key,
              field_value:  prop.proposed_value,
              source:       "ai_proposal_approved",
              updated_at:   new Date().toISOString(),
            }, { onConflict: "project_id,category,field_key" });
          }
          /* Any other category: ignored (unknown path — safer not to write) */
        } catch (_e) { /* non-fatal — proposal status still updates below */ }
      }
    }
    try {
      await sb().from("field_update_proposals").update({
        status: decision, reviewed_at: new Date().toISOString(),
        reviewed_by: reviewer || "user", review_note: reviewNote?.slice(0, 500) || null,
      }).eq("id", id);
    } catch (_e) {}
    return res.status(200).json({ success: true });
  }

  /* ═══════════════════════════════════════════
     ACTION: deep_learn
     Brain meta-analysis: read EVERY intelligence_output for this project,
     surface contradictions, propose confidence adjustments to brain_learnings,
     output a "learning evolution report".
  ═══════════════════════════════════════════ */
  if (action === "deep_learn") {
    if (!projectId) return res.status(200).json({ error: "Missing projectId" });

    /* Load everything */
    const [outputsR, learningsR, algoR, contradictionsR] = await Promise.all([
      sb().from("intelligence_outputs")
        .select("id,analysis_type,title,summary,output,weighted_confidence,generated_at")
        .eq("project_id", projectId).eq("status", "active")
        .order("generated_at", { ascending: false }).limit(50),
      sb().from("brain_learnings")
        .select("id,card_type,card_title,improvement,confidence_score,applied_count,what_worked,what_missed,tags,updated_at")
        .eq("project_id", projectId).in("status", ["active", "pending_review"])
        .order("applied_count", { ascending: false }).limit(40),
      sb().from("algorithm_knowledge")
        .select("topic,summary,freshness_score,engine,impact_level")
        .order("freshness_score", { ascending: false }).limit(15),
      sb().from("intelligence_contradictions")
        .select("contradiction_summary,severity,created_at")
        .eq("project_id", projectId).eq("status", "open").limit(10),
    ]);

    const outputs:    any[] = outputsR.data || [];
    const learnings:  any[] = learningsR.data || [];
    const algo:       any[] = algoR.data || [];
    const contradictions: any[] = contradictionsR.data || [];

    if (outputs.length < 2) {
      return res.status(200).json({
        error: "Not enough intelligence outputs yet for deep-learn. Need at least 2 prior analyses — run a persona + an audit (or several Brain chats) first.",
        outputCount: outputs.length,
      });
    }

    /* Build the deep-learn prompt */
    const outputsText = outputs.slice(0, 25).map((o, i) =>
      `[O${i+1}|${o.analysis_type}|conf ${o.weighted_confidence}|${o.generated_at?.split("T")[0]}] ${o.title}\n   ${(o.summary || "").slice(0, 300)}`
    ).join("\n");

    const learningsText = learnings.slice(0, 25).map((l, i) =>
      `[L${i+1}|${l.card_type}|conf ${l.confidence_score}|applied ${l.applied_count || 0}x] ${l.card_title}\n   → ${(l.improvement || "").slice(0, 200)}`
    ).join("\n");

    const dlPrompt = `You are the META-COGNITION of the SEO Season Brain doing a deep learning pass.

Your job: read every analysis this project has accumulated and tell us:
1. What patterns CONSISTENTLY hold across multiple outputs? (high-confidence truths)
2. What CONTRADICTIONS exist between outputs? (need resolution)
3. Which Brain Learnings should have confidence INCREASED (validated repeatedly) or DECREASED (never applied or contradicted)?
4. What NEW insights emerge from the collection that no single output saw alone?
5. What HARD DATA gaps are blocking better analysis? (specific Data Room fields to fill)

CRITICAL: Be honest. If outputs disagree, say so. If a learning has applied_count=0 and isn't backed by other outputs, mark it for confidence-down. If multiple outputs independently support an idea, mark it for confidence-up.

═══ ALL ACCUMULATED INTELLIGENCE OUTPUTS (${outputs.length}) ═══
${outputsText}

═══ ACTIVE BRAIN LEARNINGS (${learnings.length}) ═══
${learningsText}

═══ ALGORITHM INTEL CONTEXT ═══
${algo.slice(0, 6).map(a => `• [${a.impact_level}|${a.engine}] ${a.topic}: ${(a.summary || "").slice(0, 120)}`).join("\n")}

${contradictions.length ? `═══ PREVIOUSLY-LOGGED CONTRADICTIONS ═══\n${contradictions.map(c => `• [${c.severity}] ${c.contradiction_summary}`).join("\n")}` : ""}

Return ONLY raw JSON (no markdown, no prose):

{
  "consistent_patterns": [
    {"pattern":"<the recurring truth>","supported_by_outputs":["O1","O3","O7"],"confidence":85}
  ],
  "contradictions": [
    {"summary":"<what disagrees>","output_a":"O2","output_b":"O5","severity":"high|medium|low","resolution":"<how to reconcile or what data to gather>"}
  ],
  "learning_confidence_adjustments": [
    {"learning_ref":"L1","direction":"up|down","new_confidence":<int 0-100>,"reason":"<why>","supporting_outputs":["O1","O3"]}
  ],
  "new_emergent_insights": [
    {"title":"<the new truth>","reasoning":"<how it emerged from cross-output analysis>","confidence":<int>,"suggested_save_as":"insight|strategy|technical"}
  ],
  "hard_data_gaps_blocking_better_analysis": [
    {"field":"<exact Data Room field name>","why_it_blocks":"<which analyses would sharpen with this>","priority":"high|medium|low"}
  ],
  "field_update_proposals": [
    {"field_path":"<EXACT path from this list ONLY: project.url, project.name, project.industry, project.country, project.city, goal.primary_goal, goal.target_timeline, goal.success_metric, goal.current_baseline, goal.target_keywords, analytics.organic_sessions_monthly, analytics.gsc_total_clicks, analytics.gsc_avg_position, competitor.competitor_1, competitor.competitor_1_dr, competitor.competitor_2, competitor.our_domain_rating, comment.client_question, comment.user_note. NEVER propose metrics.* — those are system-computed.>","proposed_value":"<the value evidence suggests>","reasoning":"<why>","confidence":<int 0-100>}
  ],
  "overall_brain_health": {
    "consistency_score": <0-100>,
    "data_richness_score": <0-100>,
    "learning_velocity": "<accelerating|steady|stale>",
    "next_recommended_action": "<single most valuable next step>"
  }
}`;

    const dlResponse = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 12000,
      system: "You are the meta-cognition layer. Return ONLY raw JSON — no markdown fences, no prose. Start with { end with }.",
      messages: [{ role: "user", content: dlPrompt }],
    });

    const dlRaw = dlResponse.content[0].type === "text" ? dlResponse.content[0].text : "";
    const report = extractJson(dlRaw);
    if (!report) {
      return res.status(200).json({
        error: "Deep-learn returned invalid JSON",
        debug: { stopReason: dlResponse.stop_reason, rawLen: dlRaw.length, tail: dlRaw.slice(-200) },
      });
    }

    /* Apply confidence adjustments to brain_learnings (these are NOT protected) */
    const adjustments = report.learning_confidence_adjustments || [];
    for (const adj of adjustments) {
      const refIdx = parseInt((adj.learning_ref || "").replace(/^L/, "")) - 1;
      const target = learnings[refIdx];
      if (!target?.id || typeof adj.new_confidence !== "number") continue;
      try {
        await sb().from("brain_learnings").update({
          confidence_score: Math.max(0, Math.min(100, adj.new_confidence)),
          updated_at: new Date().toISOString(),
        }).eq("id", target.id);
      } catch (_e) {}
    }

    /* Queue field-update proposals (these ARE protected — never auto-applied).
       Map field_path prefix → field_category matching PROTECTED_FIELDS values. */
    const CAT_MAP: Record<string, string> = {
      project: "project_core", goal: "goals", competitor: "competitors",
      comment: "comments", metrics: "metrics", analytics: "metrics",
    };
    for (const prop of (report.field_update_proposals || [])) {
      if (!prop.field_path || !prop.proposed_value) continue;
      const prefix = prop.field_path.split(".")[0];
      const category = CAT_MAP[prefix];
      if (!category) continue;          // unknown prefix — skip (don't pollute the queue)
      if (prefix === "metrics") continue; // never propose changes to system-computed metrics
      try {
        await sb().from("field_update_proposals").insert({
          project_id:          projectId,
          field_path:          prop.field_path,
          field_category:      category,
          proposed_value:      String(prop.proposed_value).slice(0, 2000),
          proposed_by:         "deep_learn",
          proposer_confidence: Math.max(0, Math.min(100, Math.round(prop.confidence || 60))),
          reasoning:           (prop.reasoning || "").slice(0, 1000),
          status:              "pending",
        });
      } catch (_e) {}
    }

    /* Log new contradictions */
    for (const c of (report.contradictions || [])) {
      if (!c.summary) continue;
      try {
        await sb().from("intelligence_contradictions").insert({
          project_id:            projectId,
          contradiction_summary: c.summary.slice(0, 1000),
          severity:              c.severity || "medium",
          detected_by:           "deep_learn",
          status:                "open",
        });
      } catch (_e) {}
    }

    /* Save the deep-learn report itself as an intelligence_output */
    const dlSources: SourceUsage[] = [
      source("intelligence_output", { label: `${outputs.length} prior intelligence outputs`, weight: 3, count: outputs.length }),
      source("brain_learning",      { label: `${learnings.length} Brain Learnings`,           weight: 2, count: learnings.length,
                                       overrideConfidence: learnings.length ? Math.round(learnings.reduce((s, l) => s + (l.confidence_score || 75), 0) / learnings.length) : 75 }),
      source("algorithm_intel",     { label: `${algo.length} algorithm items`,                weight: 1, count: algo.length }),
      source("claude_inference",    { label: "Meta-cognition reasoning",                      weight: 2 }),
    ];
    const dlOutputId = await saveIntelligenceOutput(sb(), {
      projectId, analysisType: "deep_learn",
      title:   `Deep Learn Report — ${new Date().toISOString().split("T")[0]} (${outputs.length} outputs reviewed)`,
      summary: `Patterns: ${(report.consistent_patterns || []).length} | Contradictions: ${(report.contradictions || []).length} | Adjustments: ${adjustments.length} | New insights: ${(report.new_emergent_insights || []).length} | Field proposals: ${(report.field_update_proposals || []).length}`,
      output: report, sources: dlSources, modelUsed: "claude-sonnet-4-6", createdBy: "deep_learn",
    });

    return res.status(200).json({
      success: true,
      report,
      stats: {
        outputsReviewed:           outputs.length,
        learningsReviewed:         learnings.length,
        confidenceAdjustments:     adjustments.length,
        newProposals:              (report.field_update_proposals || []).length,
        newContradictions:         (report.contradictions || []).length,
        emergentInsights:          (report.new_emergent_insights || []).length,
        outputId:                  dlOutputId,
      },
    });
  }

  return res.status(200).json({ error: `Unknown action: ${action}` });
}
