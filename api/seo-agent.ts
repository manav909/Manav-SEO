import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/* ─── Inline brain helpers (self-contained, no cross-file imports) ─── */
import { createClient as _sbCreate } from "@supabase/supabase-js";
function _sbClient() {
  return _sbCreate(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder"
  );
}
async function extractAndSaveLearning(
  source: string, projectId: string | null, output: string,
  metadata: { card_type?: string; card_title?: string; context_summary?: string } = {}
): Promise<void> {
  if (!projectId || !output || output.length < 200 || output.startsWith("Error:")) return;
  try {
    const row: any = {
      project_id: projectId, source,
      card_type:       metadata.card_type       || "insight",
      card_title:      (metadata.card_title     || source).slice(0, 60),
      context_summary: metadata.context_summary || source,
      what_worked: [], what_missed: [],
      improvement: output.slice(0, 300),
      tags: [source.split("_")[0]].filter(Boolean),
      applied_count: 0, updated_at: new Date().toISOString(),
    };
    try {
      await _sbClient().from("brain_learnings").insert({ ...row, status: "pending_review", auto_captured: true, confidence_score: 65 });
    } catch (_e) {
      try { await _sbClient().from("brain_learnings").insert(row); } catch (_e2) { /* silent */ }
    }
  } catch (_e) { /* never crash callers */ }
}
async function saveToDesk(
  projectId: string | null, title: string, content: string,
  contentType: string, source: string, tags: string[] = []
): Promise<void> {
  if (!projectId || !content || content.length < 50) return;
  try {
    await _sbClient().from("brain_desk").insert({
      project_id: projectId, title: title.slice(0, 200), content_type: contentType,
      content, source, tags: [...tags, source].filter(Boolean),
      pinned: false, metadata: { auto_saved: true }, updated_at: new Date().toISOString(),
    });
  } catch (_e) { /* silent */ }
}


export const config = { maxDuration: 300 };

type DeliverableType = "Technical" | "On-Page" | "Off-Page" | "GEO";

/* ─────────────────────────────────────────────────────────────────
   SYSTEM PROMPTS — unchanged from original
───────────────────────────────────────────────────────────────── */
const SYSTEM_PROMPTS: Record<DeliverableType, string> = {
  Technical: `You are a Senior Technical SEO Specialist with 15 years of experience. Analyze the provided website content and deliver a comprehensive technical SEO audit. Be specific, reference actual content from the site, and provide actionable recommendations.`.trim(),

  "On-Page": `You are a Senior On-Page SEO Content Strategist. Analyze the provided website content and deliver a comprehensive on-page SEO audit. Reference actual page content, identify real gaps, and give specific actionable recommendations.`.trim(),

  "Off-Page": `You are a Senior Off-Page SEO and Digital PR Strategist. Analyze the provided website content to understand the business, then deliver a comprehensive off-page SEO and link building strategy tailored specifically to this business.`.trim(),

  GEO: `You are a Generative Engine Optimization (GEO) Specialist. Analyze the provided website content and deliver a comprehensive GEO audit covering optimization for ChatGPT, Perplexity, and Google AI Overviews. Reference actual content from the site in your findings.`.trim(),
};

/* ─────────────────────────────────────────────────────────────────
   JINA AI FETCHER
───────────────────────────────────────────────────────────────── */
async function fetchWebsiteContent(url: string, maxChars = 8000): Promise<string> {
  try {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    const response = await fetch(`https://r.jina.ai/${fullUrl}`, {
      headers: {
        "Accept": "text/plain",
        "X-Return-Format": "markdown",
        "X-Timeout": "30",
      },
      signal: AbortSignal.timeout(35000),
    });
    if (!response.ok) return `Could not fetch website. HTTP Status: ${response.status}.`;
    const text = await response.text();
    if (!text || text.trim().length < 50) return `Website returned empty content. The site may be blocking crawlers.`;
    return text.trim().slice(0, maxChars);
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") return `Website took too long to respond (30s timeout).`;
    return `Could not fetch website: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

/* ─────────────────────────────────────────────────────────────────
   CONTEXT BUILDER
   projectContext is passed from the frontend — no Supabase here
───────────────────────────────────────────────────────────────── */
interface ProjectContext {
  company?:             string;
  industry?:            string;
  allKeywords?:         string[];
  competitors?:         string[];
  latestMetric?:        any;
  keywordRankings?:     any[];
  recentAuditSummaries?: { date: string; types: string[]; snippet: string }[];
}

function buildContextSection(ctx: ProjectContext, deliverableType: DeliverableType): string {
  const {
    company, industry, allKeywords = [], competitors = [],
    latestMetric, keywordRankings = [], recentAuditSummaries = [],
  } = ctx;

  const lines: string[] = [];
  lines.push(`\n${"═".repeat(60)}`);
  lines.push(`INTELLIGENCE BRIEF — Use this to enrich your analysis`);
  lines.push(`${"═".repeat(60)}`);

  if (company || industry) {
    lines.push(`\n── BUSINESS PROFILE ──`);
    if (company)  lines.push(`Company:   ${company}`);
    if (industry) lines.push(`Industry:  ${industry}`);
  }

  if (allKeywords.length > 0) {
    lines.push(`\n── ALL TRACKED KEYWORDS (${allKeywords.length}) ──`);
    allKeywords.forEach((k, i) => lines.push(`  ${i + 1}. "${k}"`));
    lines.push(`→ Check for ALL these keywords in the content — not just the primary one.`);
  }

  if (keywordRankings.length > 0) {
    lines.push(`\n── LIVE KEYWORD RANKINGS (verified Google SERP) ──`);
    keywordRankings.forEach(k => {
      const status = k.found ? `${k.positionLabel} (Page ${k.page})` : `NOT IN TOP 30`;
      lines.push(`  "${k.keyword}": ${status}`);
    });
    lines.push(`→ Cross-verify: does the page content justify these rankings? Find the gaps.`);
  }

  if (competitors.length > 0) {
    lines.push(`\n── KNOWN COMPETITORS ──`);
    competitors.forEach((c, i) => lines.push(`  ${i + 1}. ${c}`));
    lines.push(`→ Reference these competitors by name in recommendations.`);
  }

  if (latestMetric) {
    const m = latestMetric;
    lines.push(`\n── CURRENT HEALTH SCORES (last analysis: ${(m.recorded_at || '').split('T')[0]}) ──`);
    lines.push(`  LLM Visibility:    ${m.llm_visibility_score ?? '–'}/100`);
    lines.push(`  Google Health:     ${m.algorithm_health_score ?? '–'}/100`);
    lines.push(`  E-E-A-T:           ${m.eeat_score ?? '–'}/100`);
    lines.push(`  Content Authority: ${m.content_authority_score ?? '–'}/100`);
    lines.push(`  Overall Growth:    ${m.overall_growth_score ?? '–'}/100`);
    lines.push(`  Pages Indexed:     ${m.pages_indexed ?? '–'} of ${m.pages_submitted ?? '–'}`);
    lines.push(`  Brand Mentions:    ${m.brand_mentions ?? '–'}`);
    lines.push(`  AI Citations:      ChatGPT:${m.chatgpt_citations ?? 0} | Perplexity:${m.perplexity_citations ?? 0} | Google AI:${m.google_ai_citations ?? 0}`);
    if (m.competitor_gap_note) lines.push(`  Competitive Intel: ${m.competitor_gap_note}`);
    lines.push(`→ CROSS-VERIFY these scores against the actual page content you are about to read.`);
    lines.push(`  If scores seem high but content is weak — say so. If scores seem low but content is strong — say so.`);
  }

  if (recentAuditSummaries.length > 0) {
    lines.push(`\n── PREVIOUS AUDIT REPORTS (cross-verification) ──`);
    recentAuditSummaries.forEach(a => {
      lines.push(`\n  [${a.types.join(', ')} — ${a.date}]`);
      if (a.snippet) lines.push(`  ${a.snippet}`);
    });
    lines.push(`\n→ CHECK: Have previously identified issues been addressed?`);
    lines.push(`  Note what improved, what regressed, what is still outstanding.`);
  }

  lines.push(`\n── FOCUS FOR THIS ${deliverableType.toUpperCase()} AUDIT ──`);

  if (deliverableType === "Technical") {
    if (latestMetric?.pages_indexed != null && latestMetric?.pages_submitted > 0) {
      const ratio = Math.round((latestMetric.pages_indexed / latestMetric.pages_submitted) * 100);
      lines.push(`  • Indexing is ${ratio}% — investigate crawl blocks, noindex tags, sitemap issues`);
    }
    if (allKeywords.length > 0) lines.push(`  • Check if ALL ${allKeywords.length} target keywords appear in title tags, H1s, meta descriptions`);
    lines.push(`  • Verify schema markup, Core Web Vitals signals, mobile usability from page content`);
  }

  if (deliverableType === "On-Page") {
    const notRanking = keywordRankings.filter(k => !k.found).map(k => `"${k.keyword}"`);
    const ranking    = keywordRankings.filter(k => k.found);
    if (notRanking.length > 0) lines.push(`  • NOT RANKING: ${notRanking.join(', ')} — find the on-page reason`);
    if (ranking.length > 0)    lines.push(`  • RANKING: ${ranking.map(k => `"${k.keyword}" (${k.positionLabel})`).join(', ')} — identify what is working`);
    lines.push(`  • Analyse content depth, topical coverage, and semantic use of ALL tracked keywords`);
  }

  if (deliverableType === "Off-Page") {
    if (latestMetric?.brand_mentions != null) lines.push(`  • Brand has ${latestMetric.brand_mentions} web mentions — assess strength for this industry`);
    if (competitors.length > 0) lines.push(`  • Build strategy targeting gaps vs: ${competitors.join(', ')}`);
    lines.push(`  • Identify link-building opportunities from actual page content (events, data, tools)`);
  }

  if (deliverableType === "GEO") {
    if (latestMetric) {
      const pStatus = latestMetric.perplexity_citations > 0 ? `VISIBLE (${latestMetric.perplexity_citations} citations)` : `NOT VISIBLE`;
      const gStatus = latestMetric.google_ai_citations > 0 ? `REFERENCED` : `NOT FOUND`;
      lines.push(`  • Perplexity: ${pStatus} — explain why and what to do`);
      lines.push(`  • Google AI Overview: ${gStatus} — identify content gaps preventing citation`);
      lines.push(`  • LLM Visibility: ${latestMetric.llm_visibility_score ?? '–'}/100 — verify against actual content structure`);
    }
    lines.push(`  • Check for FAQ structure, direct-answer content, entity markup`);
    lines.push(`  • Identify which tracked keywords could realistically appear in AI-generated answers`);
  }

  lines.push(`\n${"═".repeat(60)}\n`);
  return lines.join('\n');
}

/* ─────────────────────────────────────────────────────────────────
   MAIN HANDLER
───────────────────────────────────────────────────────────────── */
/* ── Safe export ── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _seo_agent_h(req, res); }
  catch (e: any) { try { res.status(200).json({error: e?.message||"unknown"}); } catch (_) {} }
}
async function _seo_agent_h(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed." });

  let url: string, keyword: string, deliverableType: DeliverableType;
  let projectContext: ProjectContext | undefined;
  let mode: 'standard' | 'deep' = 'standard';

  try {
    url             = (req.body?.url             ?? "").toString().trim();
    keyword         = (req.body?.keyword         ?? "").toString().trim();
    deliverableType = (req.body?.deliverableType ?? "") as DeliverableType;
    projectContext  = req.body?.projectContext   ?? undefined;
    mode            = req.body?.mode === 'deep' ? 'deep' : 'standard';
  } catch (_e) {
    return res.status(200).json({ error: "Could not parse request body." });
  }

  // Mode-specific limits
  const cfg = mode === 'deep'
    ? { websiteChars: 15000, maxTokens: 16000, snippetNote: 'deep' }
    : { websiteChars: 8000,  maxTokens: 8000,  snippetNote: 'standard' };

  if (!url || !keyword || !deliverableType) {
    return res.status(200).json({ error: "Missing required fields: url, keyword, deliverableType." });
  }
  if (!SYSTEM_PROMPTS[deliverableType]) {
    return res.status(200).json({ error: `Invalid deliverableType. Must be one of: ${Object.keys(SYSTEM_PROMPTS).join(", ")}.` });
  }

  const websiteContent = await fetchWebsiteContent(url, cfg.websiteChars);

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  const contextSection = projectContext ? buildContextSection(projectContext, deliverableType) : "";

  const userMessage = `
You are analyzing a REAL website. Below you will find:
${projectContext
  ? "1. An intelligence brief about the project (use this to make your analysis highly specific)\n2. The live website content\n3. Your instructions"
  : "1. The live website content\n2. Your instructions"}
${contextSection}
=== LIVE WEBSITE CONTENT FROM ${url} ===
${websiteContent}
=== END OF WEBSITE CONTENT ===

Now perform a ${deliverableType} SEO analysis:
- Target URL: ${url}
- Primary Focus Keyword: ${keyword}
${projectContext?.allKeywords?.length ? `- All Tracked Keywords: ${projectContext.allKeywords.join(", ")}` : ""}
${projectContext?.competitors?.length ? `- Known Competitors: ${projectContext.competitors.join(", ")}` : ""}
- Today's Date: ${today}

Critical instructions:
- Base ALL findings strictly on the actual website content provided above
- Quote or reference specific text from the site where relevant
- Do NOT invent, assume, or hallucinate data not present in the content
- If project intelligence was provided, USE it — reference scores, keywords, and competitor names specifically
- Cross-verify any health scores from the intelligence brief against what you actually see in the content
- If previous audit findings were provided, check whether those issues have been resolved or persist
- Use today's date (${today}) — never write a different year
- Format using clear markdown: headings, bullet points, and tables where appropriate
- Be specific, direct, and actionable
${mode === 'deep' ? `- DEEP MODE: Be exhaustive. Every section should have maximum detail, specific examples, numbered action items, and concrete metrics where possible. Do not abbreviate any section.` : `- STANDARD MODE: Be thorough but concise. Use tight bullet points. Cover every section but keep each focused.`}
- Write a COMPLETE report — every section must have a conclusion, never stop mid-section
- Never end with '...' or an incomplete sentence — always write a proper closing summary
- If you are running long, compress bullet depth but NEVER skip or merge sections
  `.trim();

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Accel-Buffering": "no",
    "Cache-Control": "no-cache, no-transform",
    "Transfer-Encoding": "chunked",
  });

  try {
    const client = new Anthropic();
    const stream = await client.messages.stream({
      model:      "claude-sonnet-4-6",
      max_tokens: cfg.maxTokens,
      system:     SYSTEM_PROMPTS[deliverableType],
      messages:   [{ role: "user", content: userMessage }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        res.write(chunk.delta.text);
      }
    }
  } catch (err) {
    const message = err instanceof Anthropic.APIError
      ? `Anthropic API error ${err.status}: ${err.message}`
      : "An unexpected error occurred while generating the report.";
    res.write(`\n\n[STREAM_ERROR]: ${message}`);
  } finally {
    res.end();
  }
}
