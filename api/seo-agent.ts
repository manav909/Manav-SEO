import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { saveLearning } from "./_lib/save";

export const config = { maxDuration: 300 };

type DeliverableType = "Technical" | "On-Page" | "Off-Page" | "GEO";

/* ─────────────────────────────────────────────────────────────────
   SYSTEM PROMPTS
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
───────────────────────────────────────────────────────────────── */
interface ProjectContext {
  company?:              string;
  industry?:             string;
  allKeywords?:          string[];
  competitors?:          string[];
  latestMetric?:         any;
  keywordRankings?:      any[];
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
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _seo_agent_h(req, res); }
  catch (e: any) { try { res.status(200).json({error: e?.message||"unknown"}); } catch (_) {} }
}

async function _seo_agent_h(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed." });

  let url: string, keyword: string, deliverableType: DeliverableType;
  let projectContext: ProjectContext | undefined;
  let projectId: string | null;
  let mode: 'standard' | 'deep' = 'standard';

  try {
    url             = (req.body?.url             ?? "").toString().trim();
    keyword         = (req.body?.keyword         ?? "").toString().trim();
    deliverableType = (req.body?.deliverableType ?? "") as DeliverableType;
    projectContext  = req.body?.projectContext   ?? undefined;
    projectId       = req.body?.projectId        ?? null;
    mode            = req.body?.mode === 'deep' ? 'deep' : 'standard';
  } catch (_e) {
    return res.status(200).json({ error: "Could not parse request body." });
  }

  const cfg = mode === 'deep'
    ? { websiteChars: 15000, maxTokens: 16000 }
    : { websiteChars: 8000,  maxTokens: 8000  };

  if (!url || !keyword || !deliverableType) {
    return res.status(200).json({ error: "Missing required fields: url, keyword, deliverableType." });
  }
  if (!SYSTEM_PROMPTS[deliverableType]) {
    return res.status(200).json({ error: `Invalid deliverableType. Must be one of: ${Object.keys(SYSTEM_PROMPTS).join(", ")}.` });
  }

  const websiteContent = await fetchWebsiteContent(url, cfg.websiteChars);

  /* ── Load market persona for this project (buyer psychology layer) ── */
  let personaSection = "";
  if (projectId) {
    try {
      const { data: personaRow } = await (await import("./_lib/db")).db()
        .from("market_personas")
        .select("persona_data")
        .eq("project_id", projectId)
        .single();
      if (personaRow?.persona_data) {
        const p = personaRow.persona_data;
        personaSection = [
          `\n=== BUYER MARKET PERSONA (Manav Eyes — use this to make recommendations buyer-aware) ===`,
          `Persona: ${p.persona_name} — ${p.persona_archetype}`,
          p.market_context                                                ? `Market: ${p.market_context}` : "",
          (p.psychology?.primary_pain_points||[]).length                 ? `Pain points: ${p.psychology.primary_pain_points.slice(0,3).join(" | ")}` : "",
          (p.language_patterns?.words_that_convert||[]).length           ? `Converting words: ${p.language_patterns.words_that_convert.slice(0,5).join(", ")}` : "",
          (p.trust_signals?.what_builds_immediate_trust||[]).length      ? `Trust signals: ${p.trust_signals.what_builds_immediate_trust.slice(0,3).join(" | ")}` : "",
          (p.seo_content_implications?.content_gaps_this_persona_needs_filled||[]).length
            ? `Content gaps: ${p.seo_content_implications.content_gaps_this_persona_needs_filled.slice(0,3).join(" | ")}` : "",
          p.manav_intelligence_note                                       ? `Key insight: ${p.manav_intelligence_note}` : "",
          `=== END PERSONA ===`,
        ].filter(Boolean).join("\n");
      }
    } catch (_) {}
  }

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  const contextSection = projectContext ? buildContextSection(projectContext, deliverableType) : "";

  const userMessage = `
You are analyzing a REAL website. Below you will find:
${projectContext
  ? "1. An intelligence brief about the project (use this to make your analysis highly specific)\n2. The live website content\n3. Your instructions"
  : "1. The live website content\n2. Your instructions"}
${contextSection}${personaSection}
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

  let fullOutput = "";

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
        fullOutput += chunk.delta.text;
      }
    }

    /* Auto-capture audit insights as brain learnings (fire-and-forget) */
    if (projectId && fullOutput.length > 400) {
      saveLearning({
        source:      `seo_agent_${deliverableType.toLowerCase().replace("-", "_")}`,
        projectId,
        content:     fullOutput,
        title:       `${deliverableType} audit — ${url.replace(/https?:\/\//, "").slice(0, 40)}`,
        cardType:    deliverableType === "Technical" ? "technical" : deliverableType === "GEO" ? "geo" : deliverableType === "Off-Page" ? "competitive" : "content",
        contextSummary: `${deliverableType} SEO audit on ${url}`,
        tags:        ["audit", deliverableType.toLowerCase().replace("-", "_")],
      }).catch(() => {});
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
