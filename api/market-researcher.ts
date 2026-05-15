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
     Deep market persona — no website needed.
     Pure market intelligence + buyer psychology.
  ═══════════════════════════════════════════ */
  if (action === "build_persona") {
    /* Pull cross-project industry learnings to inform persona */
    let industryWisdom = "";
    if (industry) {
      const { data: crossLearnings } = await sb()
        .from("brain_learnings")
        .select("card_title,improvement,card_type,confidence_score")
        .contains("tags", [industry.toLowerCase().replace(/\s+/g, "-")])
        .order("confidence_score", { ascending: false })
        .limit(20);
      if (crossLearnings?.length) {
        industryWisdom = crossLearnings.map((l: any) =>
          `[${l.card_type}] ${l.card_title}: ${l.improvement?.slice(0, 150)}`
        ).join("\n");
      }
    }

    const prompt = `You are a world-class market researcher and buyer psychologist.
Your task: build a detailed, HONEST buyer persona.

CRITICAL RULES — never break these:
1. NEVER invent specific statistics, percentages, or numbers you don't know (e.g. "73% of buyers..."). Say "many", "most", "typically" instead.
2. CLEARLY distinguish between what you know from the provided data vs what you are inferring from industry knowledge.
3. If the industry is vague or not provided, say so explicitly in data_intelligence.
4. Your analysis must be directly usable by a digital marketing agency presenting to a client.
5. Every insight must be honest — if you are uncertain, say so rather than sounding more confident than you are.

═══ WHAT WAS PROVIDED TO THIS ANALYSIS ═══
${dataProvided.length > 0 ? dataProvided.map(d => `✓ ${d}`).join("\n") : "✗ No project data provided — analysis based entirely on industry pattern knowledge"}

═══ WHAT WAS NOT PROVIDED (ASSUMPTIONS REQUIRED) ═══
${dataAssumed.length > 0 ? dataAssumed.map(d => `⚠ ${d}`).join("\n") : "All key data was provided."}

═══ CROSS-PROJECT INDUSTRY INTELLIGENCE ═══
${industryWisdom ? `From ${industryWisdom.split("\n").length} learnings across other projects in this industry:\n${industryWisdom}` : "No prior cross-project data exists for this industry — this will be the pioneer analysis."}

═══ BUILD THE PERSONA FOR ═══
Industry: ${effectiveIndustry}
Company: ${company || "not specified"}
Region/Market: ${region || "not specified — use global/English-speaking market patterns"}
Keywords: ${keywords.slice(0, 8).join(", ") || "none provided"}
Competitors: ${competitors.slice(0, 5).join(", ") || "none provided"}
Goals: ${goals || "not specified"}

Return ONLY valid JSON. Be specific where you have data. Be honest where you are inferring.

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
  "manav_intelligence_note": "<the single most important insight — must be specific to this industry/company, not a generic statement. If data was limited, say so.>"
}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 6000,
      system: "You are a market research expert. Return ONLY raw JSON — no markdown fences, no prose before or after, no explanation. Start your response with { and end with }.",
      messages: [
        { role: "user",      content: prompt },
      ],
    });

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";
    const raw = rawText;
    const persona = extractJson(raw);
    if (!persona?.persona_name) {
      return res.status(200).json({ success: false, error: "Claude returned invalid JSON — try again", raw: raw.slice(0, 300) });
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

    return res.status(200).json({
      success: true,
      persona,
      // Pass provenance to UI so it can display exactly what was used
      _provenance: { dataProvided, dataAssumed, industry: effectiveIndustry, company, region, keywordCount: keywords.length, competitorCount: competitors.length },
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

  return res.status(200).json({ error: `Unknown action: ${action}` });
}
