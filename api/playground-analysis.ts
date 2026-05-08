import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    project, client: clientData, metrics = [], keywordRankings = [],
    auditReports = [], competitors = [], allKeywords = [],
  } = req.body;

  const metricsHistory = metrics.slice(0, 4);
  const latest = metricsHistory[0] ?? null;

  // Build a rich data brief for Claude
  const dataBrief = `
═══════════════════════════════════════════════════════
COMPLETE PROJECT DATA BRIEF
═══════════════════════════════════════════════════════

CLIENT & PROJECT
Company:  ${clientData?.company ?? "Unknown"}
Industry: ${clientData?.industry ?? "Unknown"}
Website:  ${project?.url ?? "Unknown"}
Retainer: $${clientData?.retainer_amount ?? 0}/mo

TRACKED KEYWORDS (${allKeywords.length})
${allKeywords.map((k: string, i: number) => `  ${i + 1}. "${k}"`).join("\n") || "  None set"}

COMPETITORS
${competitors.map((c: string, i: number) => `  ${i + 1}. ${c}`).join("\n") || "  None set"}

LATEST HEALTH SCORES ${latest ? `(${(latest.recorded_at || "").split("T")[0]})` : "(no data)"}
${latest ? `
  LLM Visibility:    ${latest.llm_visibility_score ?? "–"}/100
  Google Health:     ${latest.algorithm_health_score ?? "–"}/100
  E-E-A-T:           ${latest.eeat_score ?? "–"}/100
  Content Authority: ${latest.content_authority_score ?? "–"}/100
  Overall Growth:    ${latest.overall_growth_score ?? "–"}/100
  Pages Indexed:     ${latest.pages_indexed ?? "–"} of ${latest.pages_submitted ?? "–"}
  Brand Mentions:    ${latest.brand_mentions ?? "–"}
  Perplexity:        ${latest.perplexity_citations ?? 0} citations
  Google AI:         ${latest.google_ai_citations ?? 0} citations
  ChatGPT:           ${latest.chatgpt_citations ?? 0} citations
  Competitor Rank:   #${latest.competitor_rank ?? "–"}
  Milestone:         ${latest.milestone ?? "None"}
` : "  No metrics available yet"}

METRICS TREND (last ${metricsHistory.length} reports)
${metricsHistory.map((m: any, i: number) => `  [${(m.recorded_at || "").split("T")[0]}] Overall:${m.overall_growth_score ?? 0} LLM:${m.llm_visibility_score ?? 0} Health:${m.algorithm_health_score ?? 0} EEAT:${m.eeat_score ?? 0}`).join("\n") || "  No history"}

LIVE KEYWORD RANKINGS
${keywordRankings.map((k: any) => `  "${k.keyword}": ${k.found ? k.positionLabel : "Not ranking"} ${k.snippet ? `— "${k.snippet.slice(0, 80)}"` : ""}`).join("\n") || "  No ranking data"}

AUDIT REPORTS (${auditReports.length} saved)
${auditReports.map((a: any) => {
  const types = Object.keys(a.sections || {});
  return types.map(type => {
    const content = (a.sections[type] || "").slice(0, 1500);
    return `\n[${type} Audit — ${(a.created_at || "").split("T")[0]}]\n${content}${content.length >= 1500 ? "..." : ""}`;
  }).join("\n");
}).join("\n\n") || "  No audit reports saved yet"}
`.trim();

  const prompt = `
You are an elite SEO and digital marketing strategist with 20 years of experience. You have been given complete access to a client's SEO data. Your job is to produce the most comprehensive, actionable, and insightful strategic analysis possible.

Think deeply. Cross-reference every data point. Find patterns. Identify the highest-leverage opportunities. Be specific — reference actual data from the brief. Don't be generic.

${dataBrief}

Return ONLY a valid JSON object (no markdown, no explanation outside the JSON) with EXACTLY this structure. Every array must have meaningful, specific items based on the real data above — never generic placeholder text:

{
  "executive_summary": "<3-4 sentence strategic overview — reference specific scores, keywords, and findings from the data>",
  "overall_health": "<Excellent|Strong|Building|Needs Work|Critical>",
  "biggest_opportunity": "<The single most impactful thing this site could do right now — specific and referenced>",
  "biggest_risk": "<The most urgent issue that needs addressing — specific>",
  "data_quality_note": "<Note on data completeness and confidence>",

  "quick_wins": [
    {
      "id": "qw1",
      "title": "<specific action title>",
      "description": "<what to do exactly, referenced to actual findings>",
      "effort": "low",
      "impact": "high",
      "timeframe": "<1-3 days>",
      "category": "technical|content|geo|links|local",
      "evidence": "<exact finding from the audit/data that supports this>"
    }
  ],

  "weekly_plans": [
    {
      "week": 1,
      "theme": "<strategic theme for the week>",
      "focus": "<what this week accomplishes>",
      "tasks": [
        {
          "task": "<specific actionable task>",
          "type": "technical|content|outreach|analysis|geo",
          "effort_hours": 2,
          "priority": "high|medium|low",
          "expected_output": "<what this produces>"
        }
      ],
      "kpi_to_watch": "<which metric should move this week>",
      "expected_outcome": "<what changes after this week>"
    }
  ],

  "monthly_roadmap": [
    {
      "month": 1,
      "title": "<month theme>",
      "phase_goal": "<single most important goal this month>",
      "goals": ["<specific goal 1>", "<specific goal 2>"],
      "key_deliverables": ["<deliverable 1>", "<deliverable 2>"],
      "metrics_targets": {
        "llm_visibility": "<target or +X points>",
        "overall_growth": "<target or +X points>",
        "keywords_page1": "<target count>"
      },
      "dependencies": "<what must be done first>"
    }
  ],

  "technical_priorities": [
    {
      "id": "tp1",
      "issue": "<specific technical issue from audit>",
      "current_state": "<what is happening now>",
      "impact": "<what this costs in rankings/visibility>",
      "fix": "<exact fix instructions>",
      "urgency": "immediate|this_week|this_month",
      "effort": "low|medium|high",
      "source": "<which audit/data revealed this>"
    }
  ],

  "content_calendar": [
    {
      "id": "cc1",
      "title": "<content piece title>",
      "type": "blog|landing_page|faq|pillar|case_study|comparison",
      "target_keyword": "<specific keyword from tracked list or gap>",
      "search_intent": "informational|commercial|navigational|transactional",
      "rationale": "<why this content, referenced to data>",
      "geo_angle": "<how this helps AI visibility>",
      "suggested_week": 2,
      "word_count": 1200,
      "internal_links": ["<page to link to>"]
    }
  ],

  "geo_strategy": [
    {
      "platform": "Perplexity|ChatGPT|Google AI Overview",
      "current_status": "<exact current visibility from data>",
      "gap": "<what is missing>",
      "action": "<specific action to take>",
      "content_format": "<what type of content helps here>",
      "expected_impact": "<what changes when done>",
      "timeframe": "<when to expect results>"
    }
  ],

  "competitive_intelligence": [
    {
      "competitor": "<domain name>",
      "their_strength": "<what they do better based on data>",
      "your_opportunity": "<specific gap you can close>",
      "strategy": "<exact approach to outrank them>",
      "timeframe": "<realistic timeline>"
    }
  ],

  "kpi_forecast": [
    {
      "metric": "<metric name>",
      "current": "<current value from data>",
      "target_30d": "<realistic 30-day target>",
      "target_60d": "<realistic 60-day target>",
      "target_90d": "<realistic 90-day target>",
      "basis": "<why this forecast is realistic>",
      "leading_indicator": "<what to watch week-by-week>"
    }
  ],

  "strategic_insights": [
    {
      "id": "si1",
      "category": "opportunity|risk|strength|pattern|recommendation",
      "title": "<insight title>",
      "detail": "<specific insight with evidence from data>",
      "action": "<what to do about this>",
      "priority": "high|medium|low"
    }
  ],

  "retainer_value_summary": {
    "months_projected": 3,
    "score_gain_projection": "<e.g. +25 points overall>",
    "ranking_improvements": "<e.g. 3 keywords to Page 1>",
    "roi_narrative": "<plain English ROI story based on industry and retainer>",
    "key_milestones": ["<milestone 1>", "<milestone 2>", "<milestone 3>"]
  },

  "canvas_blocks": [
    {
      "id": "b1",
      "type": "quick-win|weekly|monthly|technical|content|geo|competitive|insight|kpi|metric",
      "title": "<block title — short, max 6 words>",
      "content": "<full detail — everything needed to act on this>",
      "color": "#4ade80",
      "priority": "high|medium|low",
      "effort": "low|medium|high",
      "impact": "high|medium|low",
      "tags": ["tag1", "tag2"],
      "source": "<where this came from — audit type, metric, etc>"
    }
  ]
}

Rules:
- canvas_blocks should have 15-25 items — one block per major action item, insight, or plan
- Every item must be specific to THIS client's data — nothing generic
- If data is limited, say so in executive_summary but still provide the best strategy possible from what exists
- weekly_plans should have exactly 4 weeks
- monthly_roadmap should have exactly 3 months
- kpi_forecast should include all 5 main scores plus 2-3 specific metrics
- Return ONLY valid JSON — no prose outside the object
`;

  try {
    const anthropic = new Anthropic();
    const response  = await anthropic.messages.create({
      model:      "claude-sonnet-4-5",
      max_tokens: 8000,
      messages:   [{ role: "user", content: prompt }],
    });

    const raw     = response.content[0].type === "text" ? response.content[0].text : "";
    const first   = raw.indexOf("{");
    const last    = raw.lastIndexOf("}");
    const cleaned = first !== -1 && last !== -1 ? raw.slice(first, last + 1) : raw;

    let strategy: any;
    try {
      strategy = JSON.parse(cleaned);
    } catch {
      strategy = { executive_summary: "Analysis generated. JSON parsing issue — please retry.", canvas_blocks: [] };
    }

    return res.status(200).json({ success: true, strategy, generated_at: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
