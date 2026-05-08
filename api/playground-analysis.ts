import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

/* ── Recover truncated JSON by closing open brackets ── */
function tryRecoverJson(raw: string): any | null {
  let braces = 0, brackets = 0, inStr = false, esc = false;
  for (const ch of raw) {
    if (esc)               { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true;  continue; }
    if (ch === '"')        { inStr = !inStr; continue; }
    if (inStr)             continue;
    if      (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }
  let closing = inStr ? '"' : '';
  while (brackets > 0) { closing += ']'; brackets--; }
  while (braces   > 0) { closing += '}'; braces--;   }
  try   { return JSON.parse(raw + closing); }
  catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    project, client: clientData,
    metrics = [], keywordRankings = [],
    auditReports = [], competitors = [], allKeywords = [],
  } = req.body;

  const latest     = (metrics as any[])[0] ?? null;
  const safeStr    = (v: any) => typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);

  /* ── Compact data brief (keep input small) ── */
  const kwList   = (allKeywords  as string[]).slice(0, 8).map((k, i) => `${i + 1}."${k}"`).join(' | ');
  const compList = (competitors  as string[]).slice(0, 4).join(', ');
  const kwRanks  = (keywordRankings as any[]).slice(0, 8)
    .map(k => `"${k.keyword}":${k.found ? k.positionLabel : 'Not ranking'}`).join(' | ');

  const scores = latest ? [
    `LLM:${latest.llm_visibility_score??'?'}/100`,
    `Health:${latest.algorithm_health_score??'?'}/100`,
    `EEAT:${latest.eeat_score??'?'}/100`,
    `Authority:${latest.content_authority_score??'?'}/100`,
    `Growth:${latest.overall_growth_score??'?'}/100`,
    `Indexed:${latest.pages_indexed??'?'}/${latest.pages_submitted??'?'}`,
    `Mentions:${latest.brand_mentions??'?'}`,
    `Perplexity:${latest.perplexity_citations??0}`,
    `GoogleAI:${latest.google_ai_citations??0}`,
    `ChatGPT:~${latest.chatgpt_citations??0}(est)`,
  ].join(' | ') : 'No metrics yet';

  /* Trim audit content aggressively so input stays small */
  const auditSummary = (auditReports as any[]).slice(0, 3).map((a: any) => {
    const types   = Object.keys(a.sections || {});
    const date    = (a.created_at || '').split('T')[0];
    const snippet = types.map(t => {
      const text = safeStr(a.sections[t]).slice(0, 300);
      return `[${t}] ${text}`;
    }).join(' || ');
    return `${date}: ${snippet}`;
  }).join('\n');

  const brief = `
Company: ${clientData?.company ?? 'Unknown'} | Industry: ${clientData?.industry ?? 'Unknown'} | Site: ${project?.url ?? 'Unknown'} | Retainer: $${clientData?.retainer_amount ?? 0}/mo
Keywords: ${kwList || 'None'}
Competitors: ${compList || 'None'}
Scores: ${scores}
Rankings: ${kwRanks || 'No data'}
Audits:
${auditSummary || 'No audits saved yet'}
`.trim();

  const prompt = `You are an elite SEO strategist. Analyse this client data and return a comprehensive strategy as a single JSON object. Be specific — reference actual scores, keywords, and findings from the data. Nothing generic.

DATA:
${brief}

Return ONLY valid JSON matching this exact schema. Keep string values concise (1-2 sentences max per field). Arrays should have 4-6 items each:

{
  "executive_summary": "3-sentence overview referencing specific data",
  "overall_health": "Excellent|Strong|Building|Needs Work|Critical",
  "biggest_opportunity": "Single most impactful action with evidence",
  "biggest_risk": "Most urgent issue with evidence",

  "quick_wins": [
    { "id":"qw1", "title":"Action title", "description":"What to do and why", "timeframe":"1-3 days", "effort":"low|medium|high", "impact":"high|medium|low", "category":"technical|content|geo|links" }
  ],

  "weekly_plans": [
    { "week":1, "theme":"Week theme", "focus":"What this week achieves", "tasks":["task 1","task 2","task 3"], "expected_outcome":"Result after this week" }
  ],

  "monthly_roadmap": [
    { "month":1, "title":"Month theme", "goal":"Primary goal", "deliverables":["item 1","item 2"], "score_targets":"e.g. LLM +8pts, Growth +5pts" }
  ],

  "technical_priorities": [
    { "id":"tp1", "issue":"Specific issue from audit", "fix":"Exact fix", "urgency":"immediate|this_week|this_month", "impact":"Effect on rankings" }
  ],

  "content_calendar": [
    { "id":"cc1", "title":"Content title", "type":"blog|landing_page|faq|pillar", "keyword":"target keyword", "intent":"informational|commercial", "rationale":"Why this, from data", "week":2 }
  ],

  "geo_strategy": [
    { "platform":"Perplexity|ChatGPT|Google AI Overview", "status":"current status from data", "action":"specific action", "impact":"expected result" }
  ],

  "competitive_intelligence": [
    { "competitor":"domain.com", "gap":"what they do better", "strategy":"how to close this gap" }
  ],

  "kpi_forecast": [
    { "metric":"metric name", "now":"current value", "d30":"30-day target", "d60":"60-day target", "d90":"90-day target" }
  ],

  "strategic_insights": [
    { "id":"si1", "category":"opportunity|risk|strength|pattern", "title":"Insight title", "detail":"Specific insight with data evidence", "action":"What to do" }
  ],

  "retainer_value_summary": {
    "projection": "e.g. +20 overall score points in 90 days",
    "ranking_win": "e.g. 2-3 keywords to Page 1",
    "narrative": "2-sentence plain English ROI story"
  },

  "canvas_blocks": [
    { "id":"b1", "type":"quick-win|weekly|monthly|technical|content|geo|competitive|insight|kpi", "title":"Short title max 5 words", "content":"Full actionable detail for this block", "color":"#4ade80", "priority":"high|medium|low", "effort":"low|medium|high", "impact":"high|medium|low", "tags":["tag1"], "source":"where this came from" }
  ]
}

Rules:
- weekly_plans: exactly 4 entries
- monthly_roadmap: exactly 3 entries  
- canvas_blocks: 12-16 entries, one per key insight or action
- kpi_forecast: 5-6 key metrics
- Return ONLY the JSON object`;

  try {
    const anthropic = new Anthropic();
    const response  = await anthropic.messages.create({
      model:      "claude-sonnet-4-5",
      max_tokens: 4000,
      messages:   [{ role: "user", content: prompt }],
    });

    const raw   = response.content[0].type === "text" ? response.content[0].text : "";
    const first = raw.indexOf("{");
    const last  = raw.lastIndexOf("}");

    if (first === -1) throw new Error("No JSON in response");

    const extracted = raw.slice(first, last !== -1 ? last + 1 : undefined);

    let strategy: any = null;
    try       { strategy = JSON.parse(extracted); }
    catch (_) { strategy = tryRecoverJson(extracted); }

    if (!strategy) throw new Error("Could not parse strategy JSON after recovery attempt");

    /* Ensure canvas_blocks always exists */
    if (!Array.isArray(strategy.canvas_blocks)) strategy.canvas_blocks = [];

    return res.status(200).json({ success: true, strategy, generated_at: new Date().toISOString() });

  } catch (err: any) {
    console.error("Playground analysis error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
