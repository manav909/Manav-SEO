import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 300 };

function tryParseJson(raw: string): any | null {
  const first = raw.indexOf("{");
  const last  = raw.lastIndexOf("}");
  if (first === -1) return null;
  const extracted = raw.slice(first, last !== -1 ? last + 1 : undefined);
  // Try direct parse
  try { return JSON.parse(extracted); } catch {}
  // Try recovery by closing open brackets
  let b = 0, br = 0, inStr = false, esc = false;
  for (const ch of extracted) {
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') b++; else if (ch === '}') b--;
    else if (ch === '[') br++; else if (ch === ']') br--;
  }
  let closing = inStr ? '"' : '';
  while (br > 0) { closing += ']'; br--; }
  while (b  > 0) { closing += '}'; b--;  }
  try { return JSON.parse(extracted + closing); } catch { return null; }
}

const anthropic = new Anthropic();

const MANAV_SYSTEM = `You are Manav Brain — the senior SEO strategist embedded in SEO Season. You speak as a senior colleague who genuinely cares about this project. Use "I". Be specific. Never invent data. Flag every assumption. Cite every source.`;

async function generate(prompt: string, maxTokens: number): Promise<string> {
  const msg = await anthropic.messages.create({
    model:      "claude-sonnet-4-5",
    max_tokens: maxTokens,
    system:     MANAV_SYSTEM,
    messages:   [{ role: "user", content: prompt }],
  });
  return msg.content[0].type === "text" ? msg.content[0].text : "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    project, client: clientData,
    metrics = [], keywordRankings = [],
    auditReports = [], competitors = [], allKeywords = [],
    resumeBatch = 0,   // which batch to start from (0 = all, 1/2/3 = specific)
    existingStrategy,  // pass existing partial strategy for resume
  } = req.body;

  const latest  = (metrics as any[])[0] ?? null;
  const safeStr = (v: any) => typeof v === 'string' ? v : v == null ? '' : String(v);

  /* ── Compact data brief (shared across all batches) ── */
  const kwList   = (allKeywords  as string[]).slice(0, 8).map((k, i) => `${i+1}."${k}"`).join(' | ');
  const compList = (competitors  as string[]).slice(0, 5).join(', ');
  const kwRanks  = (keywordRankings as any[]).slice(0, 8)
    .map((k: any) => `"${k.keyword}":${k.found ? k.positionLabel : 'Not ranking'}`).join(' | ');
  const scores   = latest
    ? `LLM:${latest.llm_visibility_score??'?'}/100 Health:${latest.algorithm_health_score??'?'}/100 EEAT:${latest.eeat_score??'?'}/100 Authority:${latest.content_authority_score??'?'}/100 Growth:${latest.overall_growth_score??'?'}/100 Indexed:${latest.pages_indexed??'?'}/${latest.pages_submitted??'?'} Mentions:${latest.brand_mentions??'?'} Perplexity:${latest.perplexity_citations??0} GoogleAI:${latest.google_ai_citations??0} ChatGPT:~${latest.chatgpt_citations??0}`
    : 'No metrics yet';
  const auditSummary = (auditReports as any[]).slice(0, 3)
    .map((a: any) => `${(a.created_at||'').split('T')[0]}: ${Object.keys(a.sections||{}).map(t => `[${t}] ${safeStr(a.sections[t]).slice(0,200)}`).join(' | ')}`)
    .join('\n');

  const brief = `Company: ${clientData?.company??'Unknown'} | Industry: ${clientData?.industry??'Unknown'} | Site: ${project?.url??'Unknown'}
Keywords: ${kwList||'None'} | Competitors: ${compList||'None'}
Scores: ${scores}
Rankings: ${kwRanks||'No data'}
Audits:\n${auditSummary||'No audits yet'}`;

  const systemNote = `You are Manav Brain — the human intelligence layer of SEO Season. You speak as a senior SEO strategist who genuinely cares about this project's success. Use "I". Show enthusiasm for opportunities. Flag risks honestly. Never invent data. Always cite sources. You are not a bot — you are the expert advisor. Return ONLY valid JSON.`;

  /* ════════════════════════════════════════════════════
     THREE FOCUSED BATCHES — each ≤ 2500 tokens output
     This ensures completion and quality on every run.
  ════════════════════════════════════════════════════ */

  const batch1Prompt = `${systemNote}

DATA:
${brief}

Return JSON with ONLY these keys (no others):
{
  "executive_summary": "3 sentences referencing specific data",
  "overall_health": "Excellent|Strong|Building|Needs Work|Critical",
  "biggest_opportunity": "Single most impactful action with evidence",
  "biggest_risk": "Most urgent issue with evidence",
  "quick_wins": [
    {"id":"qw1","title":"title","description":"what + why from data","effort":"low|medium|high","impact":"high|medium|low","timeframe":"1-3 days","category":"technical|content|geo|links","evidence":"specific finding"}
  ],
  "weekly_plans": [
    {"week":1,"theme":"theme","focus":"what this achieves","tasks":["task1","task2","task3","task4"],"expected_outcome":"measurable result"},
    {"week":2,"theme":"theme","focus":"focus","tasks":["t1","t2","t3","t4"],"expected_outcome":"result"},
    {"week":3,"theme":"theme","focus":"focus","tasks":["t1","t2","t3","t4"],"expected_outcome":"result"},
    {"week":4,"theme":"theme","focus":"focus","tasks":["t1","t2","t3","t4"],"expected_outcome":"result"}
  ]
}

Rules: quick_wins exactly 6 items. weekly_plans exactly 4 items. All items cite specific keywords/scores/competitors from data.`;

  const batch2Prompt = `${systemNote}

DATA:
${brief}

Return JSON with ONLY these keys:
{
  "kpi_forecast": [
    {"metric":"LLM Visibility Score","now":"X/100","d30":"target","d60":"target","d90":"target"},
    {"metric":"Algorithm Health","now":"X/100","d30":"target","d60":"target","d90":"target"},
    {"metric":"E-E-A-T Score","now":"X/100","d30":"target","d60":"target","d90":"target"},
    {"metric":"Content Authority","now":"X/100","d30":"target","d60":"target","d90":"target"},
    {"metric":"Overall Growth","now":"X/100","d30":"target","d60":"target","d90":"target"},
    {"metric":"Pages Indexed","now":"X/Y","d30":"target","d60":"target","d90":"target"},
    {"metric":"Brand Mentions","now":"X","d30":"target","d60":"target","d90":"target"}
  ],
  "technical_priorities": [
    {"id":"tp1","issue":"specific issue from data","fix":"exact fix instructions","urgency":"immediate|this_week|this_month","impact":"effect on rankings","effort":"low|medium|high"}
  ],
  "content_calendar": [
    {"id":"cc1","title":"title","type":"blog|landing_page|faq|pillar","target_keyword":"keyword from tracked list","search_intent":"informational|commercial","rationale":"why from data","suggested_week":2,"word_count":1200}
  ]
}

Rules: kpi_forecast exactly 7 items using actual scores from data. technical_priorities 3-5 items. content_calendar 4-6 items.`;

  const batch3Prompt = `${systemNote}

DATA:
${brief}

Return JSON with ONLY these keys:
{
  "geo_strategy": [
    {"platform":"Perplexity|ChatGPT|Google AI Overview","status":"current status from data","action":"specific action","expected_impact":"result","timeframe":"timeline"}
  ],
  "competitive_intelligence": [
    {"competitor":"domain.com","their_strength":"what they do better","your_opportunity":"specific gap to close","strategy":"exact approach to outrank"}
  ],
  "strategic_insights": [
    {"id":"si1","category":"opportunity|risk|strength|pattern","title":"insight title","detail":"specific with evidence","action":"what to do","priority":"high|medium|low"}
  ],
  "retainer_value_summary": {
    "projection":"+X overall score points in 90 days",
    "ranking_win":"X keywords to Page 1",
    "narrative":"2-sentence plain English ROI"
  },
  "canvas_blocks": [
    {"id":"b1","type":"technical|quick-win|content|geo|competitive|insight|weekly|monthly|kpi","title":"Short title max 8 words","content":"Full actionable detail citing specific data. 3-4 sentences.","priority":"high|medium|low","effort":"low|medium|high","impact":"high|medium|low","tags":["tag1","tag2"],"source":"Technical Audit|Content Analysis|etc"}
  ]
}

Rules: geo_strategy 3 items (one per platform). competitive_intelligence 2-4 items (only if competitors exist in data). strategic_insights 4-6 items. canvas_blocks exactly 20 items: 5 technical, 5 content, 3 GEO, 3 competitive, 2 insight, 2 weekly.`;

  try {
    const batches = resumeBatch === 0
      ? [1, 2, 3]
      : [resumeBatch].filter(n => n >= 1 && n <= 3);

    const existing = existingStrategy || {};
    const results  = { ...existing };
    const batchStatus: Record<number, 'ok' | 'failed'> = {};

    for (const batchNum of batches) {
      const prompt  = batchNum === 1 ? batch1Prompt : batchNum === 2 ? batch2Prompt : batch3Prompt;
      const batchKey = `batch${batchNum}`;

      try {
        const raw  = await generate(prompt, 2500);
        const data = tryParseJson(raw);
        if (data) {
          Object.assign(results, data);
          batchStatus[batchNum] = 'ok';
        } else {
          batchStatus[batchNum] = 'failed';
        }
      } catch {
        batchStatus[batchNum] = 'failed';
      }
    }

    /* Ensure required arrays exist */
    if (!Array.isArray(results.canvas_blocks))          results.canvas_blocks          = [];
    if (!Array.isArray(results.quick_wins))             results.quick_wins             = [];
    if (!Array.isArray(results.weekly_plans))           results.weekly_plans           = [];
    if (!Array.isArray(results.kpi_forecast))           results.kpi_forecast           = [];
    if (!Array.isArray(results.technical_priorities))   results.technical_priorities   = [];
    if (!Array.isArray(results.content_calendar))       results.content_calendar       = [];
    if (!Array.isArray(results.geo_strategy))           results.geo_strategy           = [];
    if (!Array.isArray(results.competitive_intelligence))results.competitive_intelligence = [];
    if (!Array.isArray(results.strategic_insights))     results.strategic_insights     = [];

    results.canvas_blocks = results.canvas_blocks.map((b: any, i: number) => ({
      ...b, id: b.id || `b${i + 1}`,
    }));

    const failedBatches = Object.entries(batchStatus).filter(([,s]) => s === 'failed').map(([n]) => Number(n));

    return res.status(200).json({
      success:        true,
      strategy:       results,
      generated_at:   new Date().toISOString(),
      batch_status:   batchStatus,
      failed_batches: failedBatches,
      is_partial:     failedBatches.length > 0,
    });

  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
