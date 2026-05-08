import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

function tryRecoverJson(raw: string): any | null {
  let braces = 0, brackets = 0, inStr = false, esc = false;
  for (const ch of raw) {
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }
  let closing = inStr ? '"' : '';
  while (brackets > 0) { closing += ']'; brackets--; }
  while (braces > 0) { closing += '}'; braces--; }
  try { return JSON.parse(raw + closing); }
  catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { project, client: clientData, metrics = [], keywordRankings = [], auditReports = [], competitors = [], allKeywords = [] } = req.body;

  const latest  = (metrics as any[])[0] ?? null;
  const safeStr = (v: any) => typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);

  const kwList   = (allKeywords as string[]).slice(0, 8).map((k, i) => `${i+1}."${k}"`).join(' | ');
  const compList = (competitors as string[]).slice(0, 5).join(', ');
  const kwRanks  = (keywordRankings as any[]).slice(0, 8).map((k: any) => `"${k.keyword}":${k.found ? k.positionLabel : 'Not ranking'}`).join(' | ');
  const scores   = latest ? `LLM:${latest.llm_visibility_score??'?'}/100 | Health:${latest.algorithm_health_score??'?'}/100 | EEAT:${latest.eeat_score??'?'}/100 | Authority:${latest.content_authority_score??'?'}/100 | Growth:${latest.overall_growth_score??'?'}/100 | Indexed:${latest.pages_indexed??'?'}/${latest.pages_submitted??'?'} | Mentions:${latest.brand_mentions??'?'} | Perplexity:${latest.perplexity_citations??0} | GoogleAI:${latest.google_ai_citations??0} | ChatGPT:~${latest.chatgpt_citations??0}` : 'No metrics yet';
  const auditSummary = (auditReports as any[]).slice(0, 3).map((a: any) => `${(a.created_at||'').split('T')[0]}: ${Object.keys(a.sections||{}).map(t => `[${t}] ${safeStr(a.sections[t]).slice(0,200)}`).join(' | ')}`).join('\n');

  const brief = `Company: ${clientData?.company??'Unknown'} | Industry: ${clientData?.industry??'Unknown'} | Site: ${project?.url??'Unknown'}\nKeywords: ${kwList||'None'} | Competitors: ${compList||'None'}\nScores: ${scores}\nRankings: ${kwRanks||'No data'}\nAudits:\n${auditSummary||'No audits yet'}`;

  const prompt = `You are an elite SEO strategist. Analyse this client data and return a strategic brief as JSON.
Reference actual scores, keywords, and competitors by name. Nothing generic.

DATA:
${brief}

Return ONLY valid JSON:

{
  "executive_summary": "3-sentence overview referencing specific data",
  "overall_health": "Excellent|Strong|Building|Needs Work|Critical",
  "biggest_opportunity": "Single most impactful action with evidence from data",
  "biggest_risk": "Most urgent issue with evidence from data",
  "quick_wins": [{"title":"Action title","description":"What to do exactly and why","effort":"low|medium|high","impact":"high|medium|low","timeframe":"1-3 days","category":"technical|content|geo|links","evidence":"Specific finding from data"}],
  "weekly_plans": [
    {"week":1,"theme":"Foundation","focus":"What Week 1 achieves","tasks":["specific task 1","specific task 2","specific task 3","specific task 4"],"expected_outcome":"Measurable result"},
    {"week":2,"theme":"Build","focus":"What Week 2 achieves","tasks":["specific task 1","specific task 2","specific task 3","specific task 4"],"expected_outcome":"Measurable result"},
    {"week":3,"theme":"Accelerate","focus":"What Week 3 achieves","tasks":["specific task 1","specific task 2","specific task 3","specific task 4"],"expected_outcome":"Measurable result"},
    {"week":4,"theme":"Compound","focus":"What Week 4 achieves","tasks":["specific task 1","specific task 2","specific task 3","specific task 4"],"expected_outcome":"Measurable result"}
  ],
  "kpi_forecast": [
    {"metric":"LLM Visibility Score","now":"X/100","d30":"target","d60":"target","d90":"target"},
    {"metric":"Algorithm Health","now":"X/100","d30":"target","d60":"target","d90":"target"},
    {"metric":"E-E-A-T Score","now":"X/100","d30":"target","d60":"target","d90":"target"},
    {"metric":"Content Authority","now":"X/100","d30":"target","d60":"target","d90":"target"},
    {"metric":"Overall Growth","now":"X/100","d30":"target","d60":"target","d90":"target"},
    {"metric":"Pages Indexed","now":"X/Y","d30":"target","d60":"target","d90":"target"},
    {"metric":"Brand Mentions","now":"X","d30":"target","d60":"target","d90":"target"}
  ],
  "canvas_blocks": [
    {"id":"b1","type":"technical|quick-win|content|geo|competitive|insight|weekly|monthly|kpi","title":"Short title max 8 words","content":"Full actionable detail — what exactly to do, why, and expected result. Must reference specific data.","priority":"high|medium|low","effort":"low|medium|high","impact":"high|medium|low","tags":["tag1","tag2"],"source":"Technical Audit|Content Analysis|GEO Strategy|Competitive|etc"}
  ]
}

RULES:
- canvas_blocks: exactly 22 items total covering: 5 technical, 5 content, 3 GEO, 3 competitive, 4 quick-wins, 2 insights
- quick_wins: exactly 6 items
- All canvas_block content must cite specific keywords, scores, or competitor names from the data
- Return ONLY the JSON`;

  try {
    const anthropic = new Anthropic();
    const response  = await anthropic.messages.create({
      model:      "claude-sonnet-4-5",
      max_tokens: 6000,
      messages:   [{ role: "user", content: prompt }],
    });

    const raw   = response.content[0].type === "text" ? response.content[0].text : "";
    const first = raw.indexOf("{");
    const last  = raw.lastIndexOf("}");
    if (first === -1) throw new Error("No JSON in response — model returned no data");

    const extracted = raw.slice(first, last !== -1 ? last + 1 : undefined);
    let strategy: any = null;
    try { strategy = JSON.parse(extracted); }
    catch (_) { strategy = tryRecoverJson(extracted); }

    if (!strategy) throw new Error("JSON parse failed after recovery attempt");
    if (!Array.isArray(strategy.canvas_blocks)) strategy.canvas_blocks = [];
    if (!Array.isArray(strategy.quick_wins))    strategy.quick_wins    = [];
    if (!Array.isArray(strategy.weekly_plans))  strategy.weekly_plans  = [];
    if (!Array.isArray(strategy.kpi_forecast))  strategy.kpi_forecast  = [];

    strategy.canvas_blocks = strategy.canvas_blocks.map((b: any, i: number) => ({ ...b, id: b.id || `b${i+1}` }));

    return res.status(200).json({ success: true, strategy, generated_at: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
