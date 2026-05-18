import Anthropic                              from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/* ── Inline saveLearning: routes through task-engine to avoid ./lib/ imports ── */
async function saveLearning(opts: {
  source: string; projectId: string | null; content: string;
  title?: string; cardType?: string; contextSummary?: string;
  whatWorked?: string[]; whatMissed?: string[];
}): Promise<{ saved: boolean }> {
  try {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
    await fetch(`${base}/api/task-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_learning",
        project_id: opts.projectId,
        card_type: opts.cardType || "strategy",
        card_title: (opts.title || opts.content).slice(0, 100),
        improvement: opts.content,
        what_worked: opts.whatWorked || [],
        what_missed: opts.whatMissed || [],
        tags: [opts.source],
        source: opts.source,
        context_summary: opts.contextSummary || "",
      }),
    });
    return { saved: true };
  } catch (_e) { return { saved: false }; }
}


export const config = { maxDuration: 300 };

function tryParseJson(raw: string): any | null {
  const first = raw.indexOf("{");
  const last  = raw.lastIndexOf("}");
  if (first === -1) return null;
  const extracted = raw.slice(first, last !== -1 ? last + 1 : undefined);
  try { return JSON.parse(extracted); } catch (_e) {}
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
  try { return JSON.parse(extracted + closing); } catch (_e) { return null; }
}


const MANAV_SYSTEM = `You are Manav Brain — the senior SEO strategist embedded in SEO Season.
HARD RULES you must never break:
1. Only state facts that are directly supported by the data provided in the prompt.
2. If you do not have data to back a recommendation, DO NOT make it. Omit it entirely.
3. For every recommendation, cite the EXACT data point that supports it (e.g. "Based on LLM score 34/100", "Based on 23 crawl errors in audit").
4. Never invent competitor rankings, keyword positions, or traffic numbers.
5. If a whole category has no data, skip it entirely and add it to data_gaps.
6. ASSUMPTION cards are FORBIDDEN. Every canvas block must have a data_basis citing real input data.`;

async function generate(prompt: string, maxTokens: number, anthropic: any): Promise<string> {
  const msg = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system:     MANAV_SYSTEM,
    messages:   [{ role: "user", content: prompt }],
  });
  if (msg.stop_reason === "max_tokens") {
    console.warn(`[SEO Season] playground-analysis batch hit max_tokens (${maxTokens}). Strategy JSON likely truncated.`);
  }
  return msg.content[0].type === "text" ? msg.content[0].text : "";
}

/* ── Safe export ── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _playground_analysis_h(req, res); }
  catch (e: any) { try { res.status(200).json({error: e?.message||"unknown"}); } catch (_) {} }
}
async function _playground_analysis_h(req: VercelRequest, res: VercelResponse) {
  const anthropic = new Anthropic();
  if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed" });

  const {
    project, client: clientData,
    metrics = [], keywordRankings = [],
    auditReports = [], competitors = [], allKeywords = [],
    resumeBatch = 0,
    existingStrategy,
    dataRoomContext = {},
  } = req.body;

  const latest  = (metrics as any[])[0] ?? null;
  const safeStr = (v: any) => typeof v === "string" ? v : v == null ? "" : String(v);

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

  const brief = `Company: ${clientData?.company??'Unknown'} | Industry: ${clientData?.industry??'Unknown'} | Site: ${project?.url??'Unknown'}\nKeywords: ${kwList||'None'} | Competitors: ${compList||'None'}\nScores: ${scores}\nRankings: ${kwRanks||'No data'}\nAudits:\n${auditSummary||'No audits yet'}`;

  const batch1Prompt = `You are Manav Brain. STRICT MODE: every output must cite specific data. Omit anything you cannot fact-check.\n\nDATA INVENTORY (what you actually have):\n${dataInventory}\n\nFULL DATA:\n${brief}\n\nReturn JSON with ONLY these keys:\n{\n  "executive_summary": "3 sentences citing specific numbers from data. If no data, write: INSUFFICIENT DATA — fill in metrics and run audit first.",\n  "data_confidence": "high|medium|low — based on what data is available",\n  "overall_health": "Excellent|Strong|Building|Needs Work|Critical",\n  "biggest_opportunity": "Cite the specific metric or finding that shows this opportunity. No data = omit.",\n  "biggest_risk": "Cite the specific finding. No data = omit.",\n  "data_gaps": ["list of things I could not analyse because data was missing"],\n  "quick_wins": [\n    {"id":"qw1","title":"title","description":"what + specific evidence from data","effort":"low|medium|high","impact":"high|medium|low","timeframe":"1-3 days","category":"technical|content|geo|links","evidence":"EXACT data point: e.g. 'LLM score 34/100 — well below 60 threshold'","data_grade":"A"}\n  ],\n  "weekly_plans": [\n    {"week":1,"theme":"theme","focus":"what this achieves","tasks":["task citing specific finding"],"expected_outcome":"measurable result based on data"}\n  ]\n}\n\nRULES:\n- quick_wins: ONLY include if you have evidence. If you have enough data for 3 items, return 3 — not 6 invented ones.\n- weekly_plans: exactly 4 weeks, but only include tasks with data backing.\n- data_grade on quick_wins: A = direct metric/audit evidence, B = inferred from available data, C = assumption (DO NOT include C-grade items).\n- If overall data is insufficient, return only: executive_summary, data_confidence: "low", data_gaps, and empty arrays.`;

  const batch2Prompt = `You are Manav Brain. STRICT MODE: only output items you can fact-check against the data.\n\nDATA INVENTORY:\n${dataInventory}\n\nFULL DATA:\n${brief}\n\nReturn JSON with ONLY these keys:\n{\n  "kpi_forecast": [\n    {"metric":"LLM Visibility Score","now":"EXACT value from data or Unknown","d30":"realistic target","d60":"target","d90":"target","basis":"cite the data point justifying this trajectory"}\n  ],\n  "technical_priorities": [\n    {"id":"tp1","issue":"EXACT issue from audit data","fix":"specific fix","urgency":"immediate|this_week|this_month","impact":"effect on rankings","effort":"low|medium|high","evidence":"audit report date and finding","data_grade":"A|B"}\n  ],\n  "content_calendar": [\n    {"id":"cc1","title":"title","type":"blog|landing_page|faq|pillar","target_keyword":"keyword from tracked list ONLY","search_intent":"informational|commercial","rationale":"why from ranking data","suggested_week":2,"word_count":1200,"data_grade":"A|B"}\n  ]\n}\n\nRULES:\n- kpi_forecast: use ACTUAL scores from data for "now". If metric not in data, write "No data — add to Metrics Dashboard".\n- technical_priorities: ONLY from audit data. No audit? Return empty array.\n- content_calendar: ONLY for keywords that appear in allKeywords or rankings data. No keyword data? Return empty array.\n- DO NOT include C-grade (assumption) items. Omit entire category if no supporting data.`;

  const batch3Prompt = `You are Manav Brain. STRICT MODE: canvas blocks must be fact-backed. No invented blocks.\n\nDATA INVENTORY:\n${dataInventory}\n\nFULL DATA:\n${brief}\n\nReturn JSON with ONLY these keys:\n{\n  "geo_strategy": [\n    {"platform":"Perplexity|ChatGPT|Google AI Overview","current_citations":"exact number from metrics or Unknown","action":"specific action","evidence":"cite metric","expected_impact":"result","timeframe":"timeline","data_grade":"A|B"}\n  ],\n  "competitive_intelligence": [\n    {"competitor":"domain from data only","their_strength":"what data shows they do better","your_opportunity":"specific gap","strategy":"exact approach","evidence":"cite source","data_grade":"A|B"}\n  ],\n  "strategic_insights": [\n    {"id":"si1","category":"opportunity|risk|strength|pattern","title":"insight title","detail":"specific with evidence citation","action":"what to do","priority":"high|medium|low","evidence":"cite exact data point","data_grade":"A|B"}\n  ],\n  "retainer_value_summary": {\n    "projection":"based on actual current scores, realistic projection",\n    "ranking_win":"X keywords to Page 1 — only if ranking data exists, else omit",\n    "narrative":"2-sentence honest assessment based on available data"\n  },\n  "canvas_blocks": [\n    {\n      "id":"b1",\n      "type":"technical|quick-win|content|geo|competitive|insight|weekly|monthly|kpi",\n      "title":"Short title max 8 words",\n      "content":"Full actionable detail. MUST cite specific evidence.",\n      "priority":"high|medium|low",\n      "effort":"low|medium|high",\n      "impact":"high|medium|low",\n      "tags":["tag1","tag2"],\n      "source":"exact source (e.g. Audit 2024-01-15, Metrics Dashboard, Ranking data)",\n      "data_basis":"REQUIRED: exact data point backing this card. E.g.: LLM score 34/100, or 23 crawl errors from audit, or keyword ranking pos 18 for X. If you cannot write a real data_basis, DO NOT include this block.",\n      "data_grade":"A|B",\n      "week":1\n    }\n  ],\n  "note_on_week_field": "Set week 1=urgent/quick, 2=content+geo, 3=competitive+authority, 4=compounding, 5=tracking. Spread blocks — do not put everything in week 1 or 5.",\n  "data_gaps_blocking": ["list of block types you WANTED to create but had no data for"]\n}\n\nCRITICAL CANVAS BLOCK RULES:\n1. data_basis is MANDATORY. If you cannot write a real one from the provided data, OMIT the block.\n2. data_grade C (assumption) blocks are FORBIDDEN — they will be filtered out automatically.\n3. Do NOT pad to a fixed count. 8 well-evidenced blocks beats 20 invented ones.\n4. SPREAD BLOCKS ACROSS ALL 4 ACTIVE WEEKS.\n5. Set "week" field explicitly on every canvas block (1-5).`;

  try {
    const batches = resumeBatch === 0 ? [1, 2, 3] : [resumeBatch].filter(n => n >= 1 && n <= 3);
    const results: any = resumeBatch === 0 ? {} : { ...(existingStrategy || {}) };
    const batchStatus: Record<number, "ok" | "failed"> = {};

    for (const batchNum of batches) {
      const prompt = batchNum === 1 ? batch1Prompt : batchNum === 2 ? batch2Prompt : batch3Prompt;
      try {
        const raw  = await generate(prompt, 4000, anthropic);
        const data = tryParseJson(raw);
        if (data) { Object.assign(results, data); batchStatus[batchNum] = "ok"; }
        else      { batchStatus[batchNum] = "failed"; }
      } catch (_e) {
        batchStatus[batchNum] = "failed";
      }
    }

    // Ensure required arrays
    if (!Array.isArray(results.canvas_blocks))            results.canvas_blocks            = [];
    if (!Array.isArray(results.quick_wins))               results.quick_wins               = [];
    if (!Array.isArray(results.weekly_plans))             results.weekly_plans             = [];
    if (!Array.isArray(results.kpi_forecast))             results.kpi_forecast             = [];
    if (!Array.isArray(results.technical_priorities))     results.technical_priorities     = [];
    if (!Array.isArray(results.content_calendar))         results.content_calendar         = [];
    if (!Array.isArray(results.geo_strategy))             results.geo_strategy             = [];
    if (!Array.isArray(results.competitive_intelligence)) results.competitive_intelligence = [];
    if (!Array.isArray(results.strategic_insights))       results.strategic_insights       = [];
    if (!Array.isArray(results.data_gaps))                results.data_gaps                = [];
    if (!Array.isArray(results.data_gaps_blocking))       results.data_gaps_blocking       = [];

    // Filter out assumption/C-grade canvas blocks
    const beforeFilter = results.canvas_blocks.length;
    results.canvas_blocks = (results.canvas_blocks as any[]).filter((b: any) => {
      if (!b.data_basis || b.data_basis.trim() === "") return false;
      if (b.data_grade === "C") return false;
      if (b.data_basis.toLowerCase().includes("assumption")) return false;
      if (b.data_basis.toLowerCase().includes("general best practice")) return false;
      return true;
    });
    const afterFilter = results.canvas_blocks.length;

    results.canvas_blocks = results.canvas_blocks.map((b: any, i: number) => ({
      ...b, id: b.id || `b${i + 1}`,
    }));

    const failedBatches = Object.entries(batchStatus).filter(([,s]) => s === "failed").map(([n]) => Number(n));

    /* Auto-capture strategy generation as a brain learning (fire-and-forget) */
    if (resumeBatch === 0 && results.canvas_blocks.length > 0 && project?.id) {
      const learningContent = [
        `Strategy generated for ${clientData?.company || "Unknown"} (${clientData?.industry || "Unknown industry"})`,
        `Data quality: ${results.data_confidence || "unknown"}`,
        `Canvas blocks: ${results.canvas_blocks.length} (${beforeFilter - afterFilter} filtered as assumptions)`,
        results.data_gaps?.length ? `Data gaps: ${(results.data_gaps as string[]).join(" | ")}` : "",
        results.data_gaps_blocking?.length ? `Blocked: ${(results.data_gaps_blocking as string[]).join(" | ")}` : "",
        `Quick wins: ${results.quick_wins?.length || 0}`,
        results.biggest_opportunity ? `Opportunity: ${results.biggest_opportunity}` : "",
        results.biggest_risk ? `Risk: ${results.biggest_risk}` : "",
      ].filter(Boolean).join("\n");

      saveLearning({
        source:      "playground_strategy",
        projectId:   project.id,
        content:     learningContent,
        title:       `Strategy: ${clientData?.company || "project"} — ${results.canvas_blocks.length} blocks`,
        cardType:    "strategy",
        contextSummary: `Playground strategy generation`,
        tags:        ["strategy", "canvas", results.data_confidence || "unknown-quality"],
      }).catch(() => {});
    }

    return res.status(200).json({
      success:         true,
      strategy:        results,
      generated_at:    new Date().toISOString(),
      batch_status:    batchStatus,
      failed_batches:  failedBatches,
      is_partial:      failedBatches.length > 0,
      blocks_filtered: beforeFilter - afterFilter,
      data_quality:    results.data_confidence || "unknown",
    });

  } catch (err: any) {
    return res.status(200).json({ success: false, error: err.message });
  }
}