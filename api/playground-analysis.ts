import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 300 };

/* ─────────────────────────────────────────────────────────────────
   Attempt to close truncated JSON by counting open brackets/braces
───────────────────────────────────────────────────────────────── */
function tryRecoverJson(raw: string): any | null {
  let openBraces   = 0;
  let openBrackets = 0;
  let inString     = false;
  let escaped      = false;

  for (const ch of raw) {
    if (escaped)             { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true;  continue; }
    if (ch === '"')          { inString = !inString; continue; }
    if (inString)            continue;
    if      (ch === '{') openBraces++;
    else if (ch === '}') openBraces--;
    else if (ch === '[') openBrackets++;
    else if (ch === ']') openBrackets--;
  }

  // If we're still inside a string, close it first
  let closing = inString ? '"' : '';
  while (openBrackets > 0) { closing += ']'; openBrackets--; }
  while (openBraces   > 0) { closing += '}'; openBraces--;   }

  try   { return JSON.parse(raw + closing); }
  catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    project, client: clientData, metrics = [], keywordRankings = [],
    auditReports = [], competitors = [], allKeywords = [],
  } = req.body;

  const metricsHistory = (metrics as any[]).slice(0, 4);
  const latest         = metricsHistory[0] ?? null;

  /* ── Safe text helper ── */
  const safeStr = (v: any): string =>
    typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);

  /* ── Build data brief ── */
  const dataBrief = `
══════════════════════════════════════════════════
COMPLETE PROJECT INTELLIGENCE BRIEF
══════════════════════════════════════════════════

CLIENT & PROJECT
Company:  ${clientData?.company ?? 'Unknown'}
Industry: ${clientData?.industry ?? 'Unknown'}
Website:  ${project?.url ?? 'Unknown'}
Retainer: $${clientData?.retainer_amount ?? 0}/mo

TRACKED KEYWORDS (${allKeywords.length})
${(allKeywords as string[]).map((k, i) => `  ${i + 1}. "${k}"`).join('\n') || '  None set'}

COMPETITORS
${(competitors as string[]).map((c, i) => `  ${i + 1}. ${c}`).join('\n') || '  None set'}

LATEST SCORES ${latest ? `(${(latest.recorded_at || '').split('T')[0]})` : '(no data yet)'}
${latest ? `
  LLM Visibility:    ${latest.llm_visibility_score ?? '–'}/100
  Google Health:     ${latest.algorithm_health_score ?? '–'}/100
  E-E-A-T:           ${latest.eeat_score ?? '–'}/100
  Content Authority: ${latest.content_authority_score ?? '–'}/100
  Overall Growth:    ${latest.overall_growth_score ?? '–'}/100
  Pages Indexed:     ${latest.pages_indexed ?? '–'} of ${latest.pages_submitted ?? '–'}
  Brand Mentions:    ${latest.brand_mentions ?? '–'}
  Perplexity:        ${latest.perplexity_citations ?? 0} citations
  Google AI:         ${latest.google_ai_citations ?? 0} citations
  ChatGPT:           ${latest.chatgpt_citations ?? 0} citations (estimated)
  Competitor Rank:   #${latest.competitor_rank ?? '–'}
  Milestone:         ${latest.milestone ?? 'None recorded'}
` : '  No metrics available yet — base strategy on audit content and best practices'}

SCORE TREND (${metricsHistory.length} data points)
${metricsHistory.map((m: any) =>
  `  [${(m.recorded_at||'').split('T')[0]}] Overall:${m.overall_growth_score??0} LLM:${m.llm_visibility_score??0} Health:${m.algorithm_health_score??0} EEAT:${m.eeat_score??0}`
).join('\n') || '  No trend data'}

LIVE KEYWORD RANKINGS
${(keywordRankings as any[]).map(k =>
  `  "${k.keyword}": ${k.found ? k.positionLabel : 'Not in top 30'}${k.snippet ? ` — "${k.snippet.slice(0, 60)}"` : ''}`
).join('\n') || '  No ranking data'}

AUDIT REPORTS (${(auditReports as any[]).length} saved)
${(auditReports as any[]).map((a: any) => {
  const types = Object.keys(a.sections || {});
  return types.map(type => {
    const content = safeStr(a.sections[type]).slice(0, 1000);
    return `\n[${type} — ${(a.created_at || '').split('T')[0]}]\n${content}${content.length >= 1000 ? '…' : ''}`;
  }).join('\n');
}).join('\n\n') || '  No audit reports saved yet'}
`.trim();

  /* ── Prompt ── */
  const prompt = `
You are an elite SEO strategist. Analyse the complete project data below and produce a comprehensive strategic brief.

Be specific — reference actual scores, keywords, competitors, and audit findings by name.
If data is limited, build the best possible strategy from what exists.

${dataBrief}

Return ONLY a single valid JSON object. No markdown. No text outside the JSON. Follow this exact schema:

{
  "executive_summary": "3-4 sentence overview referencing specific data points",
  "overall_health": "Excellent|Strong|Building|Needs Work|Critical",
  "biggest_opportunity": "Single most impactful action — specific and evidenced",
  "biggest_risk": "Most urgent issue — specific",

  "quick_wins": [
    {
      "id": "qw1",
      "title": "Action title",
      "description": "What to do exactly, referencing actual findings",
      "effort": "low|medium|high",
      "impact": "high|medium|low",
      "timeframe": "1-3 days",
      "category": "technical|content|geo|links",
      "evidence": "Specific finding from the data"
    }
  ],

  "weekly_plans": [
    {
      "week": 1,
      "theme": "Week theme",
      "focus": "What this week accomplishes",
      "tasks": [
        { "task": "Specific task", "type": "technical|content|outreach|geo", "effort_hours": 2, "priority": "high|medium|low" }
      ],
      "expected_outcome": "What changes after this week"
    }
  ],

  "monthly_roadmap": [
    {
      "month": 1,
      "title": "Month theme",
      "phase_goal": "Single most important goal",
      "goals": ["goal 1", "goal 2"],
      "key_deliverables": ["deliverable 1", "deliverable 2"],
      "metrics_targets": { "llm_visibility": "+10 pts", "overall_growth": "+8 pts" }
    }
  ],

  "technical_priorities": [
    {
      "id": "tp1",
      "issue": "Specific technical issue from audit",
      "fix": "Exact fix instructions",
      "impact": "What this costs in rankings",
      "urgency": "immediate|this_week|this_month",
      "effort": "low|medium|high"
    }
  ],

  "content_calendar": [
    {
      "id": "cc1",
      "title": "Content piece title",
      "type": "blog|landing_page|faq|pillar",
      "target_keyword": "keyword from tracked list",
      "search_intent": "informational|commercial|navigational|transactional",
      "rationale": "Why this content, referenced to data",
      "suggested_week": 2,
      "word_count": 1200
    }
  ],

  "geo_strategy": [
    {
      "platform": "Perplexity|ChatGPT|Google AI Overview",
      "current_status": "Exact status from data",
      "action": "Specific action to take",
      "expected_impact": "What changes when done",
      "timeframe": "Realistic timeline"
    }
  ],

  "competitive_intelligence": [
    {
      "competitor": "domain.com",
      "their_strength": "What they do better",
      "your_opportunity": "Specific gap to close",
      "strategy": "Exact approach to outrank"
    }
  ],

  "kpi_forecast": [
    {
      "metric": "Metric name",
      "current": "Current value",
      "target_30d": "30-day target",
      "target_60d": "60-day target",
      "target_90d": "90-day target",
      "basis": "Why this forecast is realistic"
    }
  ],

  "strategic_insights": [
    {
      "id": "si1",
      "category": "opportunity|risk|strength|pattern",
      "title": "Insight title",
      "detail": "Specific insight with evidence",
      "action": "What to do about this",
      "priority": "high|medium|low"
    }
  ],

  "retainer_value_summary": {
    "score_gain_projection": "+25 overall points in 90 days",
    "ranking_improvements": "3 keywords to Page 1",
    "roi_narrative": "Plain English ROI story",
    "key_milestones": ["milestone 1", "milestone 2", "milestone 3"]
  },

  "canvas_blocks": [
    {
      "id": "b1",
      "type": "quick-win|weekly|monthly|technical|content|geo|competitive|insight|kpi",
      "title": "Block title max 6 words",
      "content": "Full detail — everything needed to act on this block",
      "color": "#4ade80",
      "priority": "high|medium|low",
      "effort": "low|medium|high",
      "impact": "high|medium|low",
      "tags": ["tag1", "tag2"],
      "source": "Which audit or data source"
    }
  ]
}

Requirements:
- weekly_plans: exactly 4 items (one per week)
- monthly_roadmap: exactly 3 items (one per month)
- canvas_blocks: 15-20 items covering the most important actions from all sections
- quick_wins: 6-8 items
- kpi_forecast: include all 5 main scores + pages_indexed + brand_mentions
- Every field must reference THIS client's actual data — nothing generic
- Return ONLY the JSON object, nothing else
`.trim();

  try {
    const anthropic = new Anthropic();
    const response  = await anthropic.messages.create({
      model:      "claude-sonnet-4-5",
      max_tokens: 16000,
      messages:   [{ role: "user", content: prompt }],
    });

    const raw   = response.content[0].type === "text" ? response.content[0].text : "";
    const first = raw.indexOf("{");
    const last  = raw.lastIndexOf("}");

    if (first === -1) {
      return res.status(200).json({
        success:      true,
        strategy:     { executive_summary: "No JSON found in response — please retry.", canvas_blocks: [] },
        generated_at: new Date().toISOString(),
      });
    }

    const extracted = raw.slice(first, last !== -1 ? last + 1 : undefined);

    /* Try full parse first, then recovery */
    let strategy: any = null;
    try {
      strategy = JSON.parse(extracted);
    } catch {
      strategy = tryRecoverJson(extracted);
    }

    if (!strategy) {
      /* Last resort — return whatever partial data we can from the raw text */
      strategy = {
        executive_summary: "Strategy was generated but the response was too large to parse completely. Try regenerating — the system will produce a complete response.",
        biggest_opportunity: "Please retry — full analysis available.",
        canvas_blocks: [],
        _parse_error: true,
      };
    }

    return res.status(200).json({
      success:      true,
      strategy,
      generated_at: new Date().toISOString(),
    });

  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
