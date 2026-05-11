import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 300 };

function tryParseJson(raw: string): any | null {
  const first = raw.indexOf("{");
  const last  = raw.lastIndexOf("}");
  if (first === -1) return null;
  const extracted = raw.slice(first, last !== -1 ? last + 1 : undefined);
  try { return JSON.parse(extracted); } catch {}
  let b = 0, br = 0, inStr = false, esc = false;
  for (const ch of extracted) {
    if (esc) { esc = false; continue; }
    if (ch === "\\" && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") b++; else if (ch === "}") b--;
    else if (ch === "[") br++; else if (ch === "]") br--;
  }
  let closing = inStr ? '"' : "";
  while (br > 0) { closing += "]"; br--; }
  while (b  > 0) { closing += "}"; b--;  }
  try { return JSON.parse(extracted + closing); } catch { return null; }
}

const anthropic = new Anthropic();

const MANAV_SYSTEM = `You are Manav Brain — the senior SEO strategist embedded in SEO Season.
HARD RULES you must never break:
1. Only state facts that are directly supported by the data provided in the prompt.
2. If you do not have data to back a recommendation, DO NOT make it. Omit it entirely.
3. For every recommendation, cite the EXACT data point that supports it (e.g. "Based on LLM score 34/100", "Based on 23 crawl errors in audit").
4. Never invent competitor rankings, keyword positions, or traffic numbers.
5. If a whole category has no data, skip it entirely and add it to data_gaps.
6. ASSUMPTION cards are FORBIDDEN. Every canvas block must have a data_basis citing real input data.`;

async function generate(prompt: string, maxTokens: number): Promise<string> {
  const msg = await anthropic.messages.create({
    model:      "claude-sonnet-4-5",
    max_tokens: maxTokens,
    system:     MANAV_SYSTEM,
    messages:   [{ role: "user", content: prompt }],
  });
  // Warn in logs if output was cut off at token limit
  if (msg.stop_reason === "max_tokens") {
    console.warn(`[SEO Season] playground-analysis batch hit max_tokens (${maxTokens}). Strategy JSON likely truncated. Increase maxTokens if this persists.`);
  }
  return msg.content[0].type === "text" ? msg.content[0].text : "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    project, client: clientData,
    metrics = [], keywordRankings = [],
    auditReports = [], competitors = [], allKeywords = [],
    resumeBatch = 0,
    existingStrategy,
    // dataRoom context for richer grounding
    dataRoomContext = {},
  } = req.body;

  const latest  = (metrics as any[])[0] ?? null;
  const safeStr = (v: any) => typeof v === "string" ? v : v == null ? "" : String(v);

  // ── Build a data inventory so the AI knows exactly what it has ──
  const hasMetrics     = !!latest;
  const hasKeywords    = (allKeywords as string[]).length > 0;
  const hasRankings    = (keywordRankings as any[]).length > 0;
  const hasAudits      = (auditReports as any[]).length > 0;
  const hasCompetitors = (competitors as string[]).length > 0;
  const hasDR          = Object.keys(dataRoomContext).length > 0;

  const dataInventory = [
    hasMetrics     ? `✓ Metrics: LLM=${latest?.llm_visibility_score??'?'}/100, Health=${latest?.algorithm_health_score??'?'}/100, EEAT=${latest?.eeat_score??'?'}/100, Authority=${latest?.content_authority_score??'?'}/100, Growth=${latest?.overall_growth_score??'?'}/100, Indexed=${latest?.pages_indexed??'?'}/${latest?.pages_submitted??'?'}, Mentions=${latest?.brand_mentions??'?'}, Perplexity=${latest?.perplexity_citations??0}, GoogleAI=${latest?.google_ai_citations??0}` : "✗ No metrics data",
    hasKeywords    ? `✓ Keywords (${(allKeywords as string[]).length}): ${(allKeywords as string[]).slice(0,6).map((k,i)=>`"${k}"`).join(", ")}` : "✗ No keyword data",
    hasRankings    ? `✓ Rankings: ${(keywordRankings as any[]).slice(0,6).map((k:any)=>`"${k.keyword}":${k.found?k.positionLabel:"Not ranking"}`).join(" | ")}` : "✗ No ranking data",
    hasAudits      ? `✓ Audit reports (${(auditReports as any[]).length}): ${(auditReports as any[]).slice(0,3).map((a:any)=>`${(a.created_at||"").split("T")[0]}`).join(", ")}` : "✗ No audit data",
    hasCompetitors ? `✓ Competitors: ${(competitors as string[]).slice(0,4).join(", ")}` : "✗ No competitor data",
    hasDR          ? `✓ Data Room: goals=${!!dataRoomContext.goals}, CMS=${!!dataRoomContext.tech?.cms}, analytics=${!!dataRoomContext.analytics?.organicMonthly}, technical=${!!dataRoomContext.technical?.pagesIndexed}` : "✗ No Data Room context",
  ].join("\n");

  const kwList   = (allKeywords  as string[]).slice(0, 8).map((k, i) => `${i+1}."${k}"`).join(" | ");
  const compList = (competitors  as string[]).slice(0, 5).join(", ");
  const kwRanks  = (keywordRankings as any[]).slice(0, 8).map((k: any) => `"${k.keyword}":${k.found ? k.positionLabel : "Not ranking"}`).join(" | ");
  const scores   = latest
    ? `LLM:${latest.llm_visibility_score??'?'}/100 Health:${latest.algorithm_health_score??'?'}/100 EEAT:${latest.eeat_score??'?'}/100 Authority:${latest.content_authority_score??'?'}/100 Growth:${latest.overall_growth_score??'?'}/100 Indexed:${latest.pages_indexed??'?'}/${latest.pages_submitted??'?'} Mentions:${latest.brand_mentions??'?'} Perplexity:${latest.perplexity_citations??0} GoogleAI:${latest.google_ai_citations??0} ChatGPT:~${latest.chatgpt_citations??0}`
    : "No metrics yet";
  const auditSummary = (auditReports as any[]).slice(0, 3)
    .map((a: any) => `${(a.created_at||"").split("T")[0]}: ${Object.keys(a.sections||{}).map(t => `[${t}] ${safeStr(a.sections[t]).slice(0,200)}`).join(" | ")}`)
    .join("\n");

  const brief = `Company: ${clientData?.company??'Unknown'} | Industry: ${clientData?.industry??'Unknown'} | Site: ${project?.url??'Unknown'}
Keywords: ${kwList||'None'} | Competitors: ${compList||'None'}
Scores: ${scores}
Rankings: ${kwRanks||'No data'}
Audits:\n${auditSummary||'No audits yet'}`;

  // ── Batch 1: Executive summary, quick wins, weekly plans ──
  const batch1Prompt = `You are Manav Brain. STRICT MODE: every output must cite specific data. Omit anything you cannot fact-check.

DATA INVENTORY (what you actually have):
${dataInventory}

FULL DATA:
${brief}

Return JSON with ONLY these keys:
{
  "executive_summary": "3 sentences citing specific numbers from data. If no data, write: INSUFFICIENT DATA — fill in metrics and run audit first.",
  "data_confidence": "high|medium|low — based on what data is available",
  "overall_health": "Excellent|Strong|Building|Needs Work|Critical",
  "biggest_opportunity": "Cite the specific metric or finding that shows this opportunity. No data = omit.",
  "biggest_risk": "Cite the specific finding. No data = omit.",
  "data_gaps": ["list of things I could not analyse because data was missing"],
  "quick_wins": [
    {"id":"qw1","title":"title","description":"what + specific evidence from data","effort":"low|medium|high","impact":"high|medium|low","timeframe":"1-3 days","category":"technical|content|geo|links","evidence":"EXACT data point: e.g. 'LLM score 34/100 — well below 60 threshold'","data_grade":"A"}
  ],
  "weekly_plans": [
    {"week":1,"theme":"theme","focus":"what this achieves","tasks":["task citing specific finding"],"expected_outcome":"measurable result based on data"}
  ]
}

RULES:
- quick_wins: ONLY include if you have evidence. If you have enough data for 3 items, return 3 — not 6 invented ones.
- weekly_plans: exactly 4 weeks, but only include tasks with data backing.
- data_grade on quick_wins: A = direct metric/audit evidence, B = inferred from available data, C = assumption (DO NOT include C-grade items).
- If overall data is insufficient, return only: executive_summary, data_confidence: "low", data_gaps, and empty arrays.`;

  // ── Batch 2: KPI forecast, technical priorities, content calendar ──
  const batch2Prompt = `You are Manav Brain. STRICT MODE: only output items you can fact-check against the data.

DATA INVENTORY:
${dataInventory}

FULL DATA:
${brief}

Return JSON with ONLY these keys:
{
  "kpi_forecast": [
    {"metric":"LLM Visibility Score","now":"EXACT value from data or Unknown","d30":"realistic target","d60":"target","d90":"target","basis":"cite the data point justifying this trajectory"}
  ],
  "technical_priorities": [
    {"id":"tp1","issue":"EXACT issue from audit data","fix":"specific fix","urgency":"immediate|this_week|this_month","impact":"effect on rankings","effort":"low|medium|high","evidence":"audit report date and finding","data_grade":"A|B"}
  ],
  "content_calendar": [
    {"id":"cc1","title":"title","type":"blog|landing_page|faq|pillar","target_keyword":"keyword from tracked list ONLY","search_intent":"informational|commercial","rationale":"why from ranking data","suggested_week":2,"word_count":1200,"data_grade":"A|B"}
  ]
}

RULES:
- kpi_forecast: use ACTUAL scores from data for "now". If metric not in data, write "No data — add to Metrics Dashboard".
- technical_priorities: ONLY from audit data. No audit? Return empty array.
- content_calendar: ONLY for keywords that appear in allKeywords or rankings data. No keyword data? Return empty array.
- DO NOT include C-grade (assumption) items. Omit entire category if no supporting data.`;

  // ── Batch 3: GEO, competitive, insights, canvas blocks ──
  const batch3Prompt = `You are Manav Brain. STRICT MODE: canvas blocks must be fact-backed. No invented blocks.

DATA INVENTORY:
${dataInventory}

FULL DATA:
${brief}

Return JSON with ONLY these keys:
{
  "geo_strategy": [
    {"platform":"Perplexity|ChatGPT|Google AI Overview","current_citations":"exact number from metrics or Unknown","action":"specific action","evidence":"cite metric","expected_impact":"result","timeframe":"timeline","data_grade":"A|B"}
  ],
  "competitive_intelligence": [
    {"competitor":"domain from data only","their_strength":"what data shows they do better","your_opportunity":"specific gap","strategy":"exact approach","evidence":"cite source","data_grade":"A|B"}
  ],
  "strategic_insights": [
    {"id":"si1","category":"opportunity|risk|strength|pattern","title":"insight title","detail":"specific with evidence citation","action":"what to do","priority":"high|medium|low","evidence":"cite exact data point","data_grade":"A|B"}
  ],
  "retainer_value_summary": {
    "projection":"based on actual current scores, realistic projection",
    "ranking_win":"X keywords to Page 1 — only if ranking data exists, else omit",
    "narrative":"2-sentence honest assessment based on available data"
  },
  "canvas_blocks": [
    {
      "id":"b1",
      "type":"technical|quick-win|content|geo|competitive|insight|weekly|monthly|kpi",
      "title":"Short title max 8 words",
      "content":"Full actionable detail. MUST cite specific evidence.",
      "priority":"high|medium|low",
      "effort":"low|medium|high",
      "impact":"high|medium|low",
      "tags":["tag1","tag2"],
      "source":"exact source (e.g. Audit 2024-01-15, Metrics Dashboard, Ranking data)",
      "data_basis":"REQUIRED: exact data point backing this card. E.g.: LLM score 34/100, or 23 crawl errors from audit, or keyword ranking pos 18 for X. If you cannot write a real data_basis, DO NOT include this block.",
      "data_grade":"A|B"
    }
  ],
  "data_gaps_blocking": ["list of block types you WANTED to create but had no data for"]
}

CRITICAL CANVAS BLOCK RULES:
1. data_basis is MANDATORY. If you cannot write a real one from the provided data, OMIT the block.
2. data_grade C (assumption) blocks are FORBIDDEN — they will be filtered out automatically.
3. Do NOT pad to a fixed count. 8 well-evidenced blocks beats 20 invented ones.
4. geo_strategy: only if perplexity_citations or google_ai_citations data exists, or audit mentions GEO.
5. competitive_intelligence: only if competitors list is non-empty AND audit or ranking data shows gaps.
6. For each type, only generate blocks with DIRECT evidence: technical from audit, content from keywords/rankings, geo from GEO metrics.`;

  try {
    const batches = resumeBatch === 0 ? [1, 2, 3] : [resumeBatch].filter(n => n >= 1 && n <= 3);

    // On full generation (resumeBatch=0), start with EMPTY results — no stale merge
    const results: any = resumeBatch === 0 ? {} : { ...(existingStrategy || {}) };
    const batchStatus: Record<number, "ok" | "failed"> = {};

    for (const batchNum of batches) {
      const prompt = batchNum === 1 ? batch1Prompt : batchNum === 2 ? batch2Prompt : batch3Prompt;
      try {
        const raw  = await generate(prompt, 4000);
        const data = tryParseJson(raw);
        if (data) {
          Object.assign(results, data);
          batchStatus[batchNum] = "ok";
        } else {
          batchStatus[batchNum] = "failed";
        }
      } catch {
        batchStatus[batchNum] = "failed";
      }
    }

    // Ensure required arrays
    if (!Array.isArray(results.canvas_blocks))           results.canvas_blocks           = [];
    if (!Array.isArray(results.quick_wins))              results.quick_wins              = [];
    if (!Array.isArray(results.weekly_plans))            results.weekly_plans            = [];
    if (!Array.isArray(results.kpi_forecast))            results.kpi_forecast            = [];
    if (!Array.isArray(results.technical_priorities))    results.technical_priorities    = [];
    if (!Array.isArray(results.content_calendar))        results.content_calendar        = [];
    if (!Array.isArray(results.geo_strategy))            results.geo_strategy            = [];
    if (!Array.isArray(results.competitive_intelligence)) results.competitive_intelligence = [];
    if (!Array.isArray(results.strategic_insights))      results.strategic_insights      = [];
    if (!Array.isArray(results.data_gaps))               results.data_gaps               = [];
    if (!Array.isArray(results.data_gaps_blocking))      results.data_gaps_blocking      = [];

    // Filter out assumption (grade C or missing data_basis) canvas blocks
    const beforeFilter = results.canvas_blocks.length;
    results.canvas_blocks = (results.canvas_blocks as any[]).filter((b: any) => {
      if (!b.data_basis || b.data_basis.trim() === "") return false;
      if (b.data_grade === "C") return false;
      if (b.data_basis.toLowerCase().includes("assumption")) return false;
      if (b.data_basis.toLowerCase().includes("general best practice")) return false;
      return true;
    });
    const afterFilter = results.canvas_blocks.length;

    // Assign IDs
    results.canvas_blocks = results.canvas_blocks.map((b: any, i: number) => ({
      ...b, id: b.id || `b${i + 1}`,
    }));

    const failedBatches = Object.entries(batchStatus).filter(([,s]) => s === "failed").map(([n]) => Number(n));

    return res.status(200).json({
      success:        true,
      strategy:       results,
      generated_at:   new Date().toISOString(),
      batch_status:   batchStatus,
      failed_batches: failedBatches,
      is_partial:     failedBatches.length > 0,
      blocks_filtered: beforeFilter - afterFilter,
      data_quality:    results.data_confidence || "unknown",
    });

  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
