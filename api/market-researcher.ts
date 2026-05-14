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
import { db } from "./lib/db";
import { saveLearning, saveToDesk } from "./lib/save";

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _handler(req, res); }
  catch (e: any) { try { res.status(200).json({ error: e?.message || "unknown" }); } catch (_) {} }
}

async function _handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed" });

  const { action, projectId } = req.body;
  const client = new Anthropic();

  /* ── Load project context ── */
  let project: any = null;
  if (projectId) {
    const { data } = await db().from("projects")
      .select("id,name,url,industry,keywords,competitors,goals,cms,country,city")
      .eq("id", projectId).single();
    project = data;
  }

  const industry: string    = req.body.industry || project?.industry || "digital services";
  const keywords: string[]  = req.body.keywords  || project?.keywords  || [];
  const competitors: string[] = req.body.competitors || project?.competitors || [];
  const company: string     = req.body.company || project?.name || "";
  const url: string         = req.body.url || project?.url || "";
  const goals: string       = req.body.goals || (project?.goals ? String(project.goals) : "");
  const region: string      = [project?.city, project?.country].filter(Boolean).join(", ");

  /* ═══════════════════════════════════════════
     ACTION: build_persona
     Deep market persona — no website needed.
     Pure market intelligence + buyer psychology.
  ═══════════════════════════════════════════ */
  if (action === "build_persona") {
    /* Pull cross-project industry learnings to inform persona */
    let industryWisdom = "";
    if (industry) {
      const { data: crossLearnings } = await db()
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
Your task: build the most detailed, accurate buyer persona for a business in the ${industry} industry.

BUSINESS CONTEXT:
Company: ${company || "not specified"}
Website: ${url || "not specified"}
Industry: ${industry}
Region/Market: ${region || "global"}
Keywords they want to rank for: ${keywords.slice(0, 8).join(", ") || "not specified"}
Competitors: ${competitors.slice(0, 5).join(", ") || "not specified"}
Current goals: ${goals || "not specified"}

EXISTING BRAIN INTELLIGENCE (from other projects in this industry):
${industryWisdom || "No prior data — pioneer analysis."}

Build a persona based on your deep understanding of:
1. WHO actually searches for and buys ${industry} services/products
2. What triggers their search (the moment that makes them look)
3. How they evaluate options (what signals trust vs. distrust)
4. What language they use vs. what the business uses (the gap)
5. What content formats they trust
6. What their journey looks like from awareness → decision
7. What the market looks like from a buyers perspective
8. What they WISH a business would tell them but almost none do

Return ONLY valid JSON, no markdown, no text outside JSON:

{
  "persona_name": "<name that captures the archetype, e.g. 'The Cautious Procurement Lead'>",
  "persona_archetype": "<B2B Decision Maker | B2C Impulse Buyer | Research-First Professional | ...>",
  "market_context": "<2-3 sentences: what is the market reality for buyers in this industry right now>",
  "buyer_profile": {
    "who_they_are": "<specific description of the person — role, situation, mindset>",
    "triggers_that_start_the_search": ["<trigger 1>", "<trigger 2>", "<trigger 3>"],
    "research_depth": "<do they spend 10 minutes or 3 weeks researching>",
    "decision_timeline": "<hours | days | weeks | months>",
    "budget_mindset": "<price-sensitive | value-focused | premium-seeking | budget-first>",
    "decision_authority": "<sole decider | committee | influencer | approver>"
  },
  "psychology": {
    "primary_pain_points": ["<pain 1>", "<pain 2>", "<pain 3>", "<pain 4>"],
    "deepest_fear": "<the one thing they most fear getting wrong>",
    "decision_triggers": ["<what finally makes them act>"],
    "what_they_actually_want": "<beyond the product — the outcome, the feeling, the transformation>",
    "objections_they_raise": ["<objection 1>", "<objection 2>", "<objection 3>"]
  },
  "search_behavior": {
    "how_they_search": "<describe the typical search journey from first thought to converted>",
    "first_search_queries": ["<what they type first>", "<second search>", "<third search>"],
    "refinement_queries": ["<when they narrow down>"],
    "comparison_queries": ["<when they're nearly decided>"],
    "intent_shift": "<how their intent evolves from awareness to decision>"
  },
  "language_patterns": {
    "words_they_use": ["<terms from their world>"],
    "words_that_convert": ["<terms that resonate, trigger action>"],
    "words_that_repel": ["<jargon or terms that create distance>"],
    "questions_they_type_into_google": ["<actual question-format queries>"]
  },
  "trust_signals": {
    "what_builds_immediate_trust": ["<signal 1>", "<signal 2>"],
    "proof_formats_they_need": ["<case studies | numbers | testimonials | certifications | ...>"],
    "what_raises_red_flags": ["<what makes them leave immediately>"],
    "content_they_share_or_save": "<what type of content is valuable enough to save>"
  },
  "competitive_awareness": {
    "alternatives_they_consider": ["<alt 1>", "<alt 2>"],
    "why_they_choose_one_over_another": "<the real deciding factor>",
    "why_they_leave_and_try_someone_else": "<the main switching trigger>"
  },
  "seo_content_implications": {
    "content_gaps_this_persona_needs_filled": ["<gap 1>", "<gap 2>", "<gap 3>"],
    "ideal_page_types": ["<page type 1>", "<page type 2>"],
    "keyword_intent_map": [
      {"intent": "<awareness>", "example_keywords": ["..."]},
      {"intent": "<consideration>", "example_keywords": ["..."]},
      {"intent": "<decision>", "example_keywords": ["..."]}
    ],
    "format_recommendations": ["<long-form guide | FAQ page | comparison page | ...>"]
  },
  "manav_intelligence_note": "<1-2 sentences: the single most important insight from this analysis that most SEO agencies miss>"
}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const first = raw.indexOf("{"); const last = raw.lastIndexOf("}");
    let persona: any;
    try {
      persona = JSON.parse((first !== -1 && last !== -1) ? raw.slice(first, last + 1) : raw);
    } catch (_) {
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
      saveLearning({
        source: "market_researcher",
        projectId,
        content: learningContent,
        title: `Market Persona: ${persona.persona_name} — ${industry}`,
        cardType: "market",
        tags: ["market", "persona", industryTag, ...(keywords.slice(0, 3).map((k: string) => k.toLowerCase().replace(/\s+/g, "-")))],
        confidenceOverride: 82,
        whatWorked: persona.trust_signals?.what_builds_immediate_trust || [],
        whatMissed: persona.psychology?.objections_they_raise || [],
      }).catch(() => {});

      /* Also save to brain_desk for full access */
      saveToDesk({
        projectId,
        title: `Market Persona: ${persona.persona_name}`,
        content: JSON.stringify(persona, null, 2),
        contentType: "analysis",
        source: "market_researcher",
        tags: ["persona", "market", industryTag],
      }).catch(() => {});

      /* Persist to market_personas table (upsert by project) */
      await db().from("market_personas").upsert({
        project_id:   projectId,
        industry:     industry,
        persona_name: persona.persona_name,
        persona_data: persona,
        updated_at:   new Date().toISOString(),
      }, { onConflict: "project_id" }).catch(() => {});
    }

    return res.status(200).json({ success: true, persona });
  }

  /* ═══════════════════════════════════════════
     ACTION: suggest_goals
     Market-intelligence driven goal setting.
     Aligned to 5-phase framework with KPIs.
  ═══════════════════════════════════════════ */
  if (action === "suggest_goals") {
    const existingPersona = req.body.existingPersona || null;

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
      const { data: p } = await db().from("market_personas").select("persona_data").eq("project_id", projectId).single();
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
      max_tokens: 3500,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const first = raw.indexOf("{"); const last = raw.lastIndexOf("}");
    let goalPlan: any;
    try {
      goalPlan = JSON.parse((first !== -1 && last !== -1) ? raw.slice(first, last + 1) : raw);
    } catch (_) {
      return res.status(200).json({ success: false, error: "Claude returned invalid JSON — try again", raw: raw.slice(0, 300) });
    }

    if (projectId) {
      const industryTag = industry.toLowerCase().replace(/\s+/g, "-");
      saveLearning({
        source: "market_researcher",
        projectId,
        content: `${goalPlan.market_opportunity} ${goalPlan.competitive_gap} ${goalPlan.positioning_recommendation}`,
        title: `Goal Plan: ${company || industry} — ${goalPlan.recommended_6month_outcome?.slice(0, 60)}`,
        cardType: "strategy",
        tags: ["goals", "market", "strategy", industryTag],
        confidenceOverride: 80,
      }).catch(() => {});

      await db().from("market_personas").upsert({
        project_id: projectId,
        industry,
        goals_data: goalPlan,
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id" }).catch(() => {});
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
      max_tokens: 4000,
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
      saveLearning({
        source: "market_researcher",
        projectId,
        content: fullOutput.slice(0, 3000),
        title: `Market Intelligence: ${industry}${region ? ` — ${region}` : ""}`,
        cardType: "market",
        tags: ["market", "intelligence", "industry", industryTag],
        confidenceOverride: 78,
      }).catch(() => {});
      saveToDesk({
        projectId,
        title: `Market Intelligence: ${industry}`,
        content: fullOutput,
        contentType: "report",
        source: "market_researcher",
        tags: ["market", "intelligence", industryTag],
      }).catch(() => {});
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
    const { data: industryLearnings } = await db()
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
      const { data: kl } = await db()
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
      }],
    });

    const raw2 = synthResponse.content[0].type === "text" ? synthResponse.content[0].text : "";
    const f2 = raw2.indexOf("{"); const l2 = raw2.lastIndexOf("}");
    let patterns: any;
    try {
      patterns = JSON.parse((f2 !== -1 && l2 !== -1) ? raw2.slice(f2, l2 + 1) : raw2);
    } catch (_) {
      return res.status(200).json({ success: false, error: "Synthesis parse error — try again" });
    }

    return res.status(200).json({
      success: true,
      patterns,
      industryCount: industryLearnings?.length || 0,
      keywordCount: keywordLearnings.length,
    });
  }

  return res.status(200).json({ error: `Unknown action: ${action}` });
}
