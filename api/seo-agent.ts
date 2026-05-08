import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 120 };

type DeliverableType = "Technical" | "On-Page" | "Off-Page" | "GEO";

interface RequestBody {
  url: string;
  keyword: string;
  deliverableType: DeliverableType;
  projectId?: string;
}

/* ─────────────────────────────────────────────────────────────────
   SYSTEM PROMPTS — unchanged from original, exactly as they were
───────────────────────────────────────────────────────────────── */
const SYSTEM_PROMPTS: Record<DeliverableType, string> = {
  Technical: `You are a Senior Technical SEO Specialist with 15 years of experience. Analyze the provided website content and deliver a comprehensive technical SEO audit. Be specific, reference actual content from the site, and provide actionable recommendations.`.trim(),

  "On-Page": `You are a Senior On-Page SEO Content Strategist. Analyze the provided website content and deliver a comprehensive on-page SEO audit. Reference actual page content, identify real gaps, and give specific actionable recommendations.`.trim(),

  "Off-Page": `You are a Senior Off-Page SEO and Digital PR Strategist. Analyze the provided website content to understand the business, then deliver a comprehensive off-page SEO and link building strategy tailored specifically to this business.`.trim(),

  GEO: `You are a Generative Engine Optimization (GEO) Specialist. Analyze the provided website content and deliver a comprehensive GEO audit covering optimization for ChatGPT, Perplexity, and Google AI Overviews. Reference actual content from the site in your findings.`.trim(),
};

/* ─────────────────────────────────────────────────────────────────
   JINA AI FETCHER — unchanged from original
───────────────────────────────────────────────────────────────── */
async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    const jinaUrl = `https://r.jina.ai/${fullUrl}`;

    const response = await fetch(jinaUrl, {
      headers: {
        "Accept": "text/plain",
        "X-Return-Format": "markdown",
        "X-Timeout": "30",
      },
      signal: AbortSignal.timeout(35000),
    });

    if (!response.ok) {
      return `Could not fetch website. HTTP Status: ${response.status}. Please check the URL is correct and publicly accessible.`;
    }

    const text = await response.text();

    if (!text || text.trim().length < 50) {
      return `Website returned empty or very short content. The site may be blocking crawlers.`;
    }

    return text.trim().slice(0, 15000);

  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return `Website took too long to respond (30s timeout). Try again or check if the site is accessible.`;
    }
    return `Could not fetch website: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

/* ─────────────────────────────────────────────────────────────────
   PROJECT CONTEXT FETCHER — pulls everything from Supabase
───────────────────────────────────────────────────────────────── */
interface ProjectContext {
  project: any;
  client: any;
  latestMetric: any;
  keywordRankings: any[];
  recentAudits: any[];
  allKeywords: string[];
  competitors: string[];
}

async function fetchProjectContext(projectId: string): Promise<ProjectContext | null> {
  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!
    );

    // Project data
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projErr || !project) return null;

    // Client data
    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", project.client_id)
      .single();

    // Latest metrics snapshot
    const { data: metricsRows } = await supabase
      .from("metrics")
      .select("*")
      .eq("project_id", projectId)
      .order("recorded_at", { ascending: false })
      .limit(1);

    const latestMetric = metricsRows?.[0] || null;

    // Last 3 audit reports for cross-verification
    const { data: auditRows } = await supabase
      .from("audit_reports")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(3);

    const recentAudits = auditRows || [];
    const allKeywords: string[] = project.keywords || [];
    const competitors: string[] = project.competitors || [];
    const kwRankings = latestMetric?.keyword_rankings || [];

    return {
      project,
      client,
      latestMetric,
      keywordRankings: kwRankings,
      recentAudits,
      allKeywords,
      competitors,
    };

  } catch {
    return null; // fail gracefully — audit still runs without context
  }
}

/* ─────────────────────────────────────────────────────────────────
   CONTEXT BUILDER — assembles intelligence brief per deliverable type
───────────────────────────────────────────────────────────────── */
function buildContextSection(ctx: ProjectContext, deliverableType: DeliverableType): string {
  const { project, client, latestMetric, keywordRankings, recentAudits, allKeywords, competitors } = ctx;

  const lines: string[] = [];

  lines.push(`\n${"═".repeat(60)}`);
  lines.push(`INTELLIGENCE BRIEF — Use this to enrich your analysis`);
  lines.push(`${"═".repeat(60)}`);

  // Business profile
  if (client || project) {
    lines.push(`\n── BUSINESS PROFILE ──`);
    if (client?.company)  lines.push(`Company:   ${client.company}`);
    if (client?.industry) lines.push(`Industry:  ${client.industry}`);
    if (project?.url)     lines.push(`Website:   ${project.url}`);
    if (client?.name)     lines.push(`Contact:   ${client.name}`);
  }

  // All target keywords
  if (allKeywords.length > 0) {
    lines.push(`\n── TARGET KEYWORDS (all ${allKeywords.length} tracked) ──`);
    lines.push(allKeywords.map((k, i) => `  ${i + 1}. "${k}"`).join("\n"));
    lines.push(`→ When analyzing, check for ALL these keywords, not just the primary one.`);
  }

  // Keyword rankings from last analysis
  if (keywordRankings.length > 0) {
    lines.push(`\n── LIVE KEYWORD RANKINGS (verified via Google SERP) ──`);
    for (const k of keywordRankings) {
      const status = k.found
        ? `${k.positionLabel} (Page ${k.page})`
        : `NOT RANKING in top 30`;
      lines.push(`  "${k.keyword}": ${status}`);
    }
    lines.push(`→ Cross-verify: does the page content actually justify these rankings? Identify gaps.`);
  }

  // Competitor list
  if (competitors.length > 0) {
    lines.push(`\n── KNOWN COMPETITORS ──`);
    lines.push(competitors.map((c, i) => `  ${i + 1}. ${c}`).join("\n"));
    lines.push(`→ Reference these competitors by name in your recommendations where relevant.`);
  }

  // Health scores from last AI analysis
  if (latestMetric) {
    lines.push(`\n── CURRENT HEALTH SCORES (from last analysis on ${latestMetric.recorded_at?.split("T")[0] || "recent date"}) ──`);
    lines.push(`  LLM Visibility:    ${latestMetric.llm_visibility_score ?? "–"}/100`);
    lines.push(`  Google Health:     ${latestMetric.algorithm_health_score ?? "–"}/100`);
    lines.push(`  E-E-A-T:           ${latestMetric.eeat_score ?? "–"}/100`);
    lines.push(`  Content Authority: ${latestMetric.content_authority_score ?? "–"}/100`);
    lines.push(`  Overall Growth:    ${latestMetric.overall_growth_score ?? "–"}/100`);
    lines.push(`  Pages Indexed:     ${latestMetric.pages_indexed ?? "–"} of ${latestMetric.pages_submitted ?? "–"}`);
    lines.push(`  Brand Mentions:    ${latestMetric.brand_mentions ?? "–"}`);
    lines.push(`  AI Citations:      ChatGPT:${latestMetric.chatgpt_citations ?? 0} | Perplexity:${latestMetric.perplexity_citations ?? 0} | Google AI:${latestMetric.google_ai_citations ?? 0}`);

    if (latestMetric.competitor_gap_note) {
      lines.push(`  Competitive Intel: ${latestMetric.competitor_gap_note}`);
    }

    lines.push(`→ CROSS-VERIFY these scores against the actual page content you're about to read.`);
    lines.push(`  If the scores seem high but the content is weak — say so. If scores seem low but content is strong — say so.`);
    lines.push(`  Your audit should either validate or challenge these numbers with evidence.`);
  }

  // Previous audit findings for continuity
  if (recentAudits.length > 0) {
    lines.push(`\n── PREVIOUS AUDIT REPORTS (for continuity & cross-verification) ──`);
    for (const audit of recentAudits) {
      const date = audit.created_at?.split("T")[0] || "unknown date";
      const sections = audit.sections || {};
      const types = Object.keys(sections);
      if (types.length === 0) continue;
      lines.push(`\n  [${types.join(", ")} Audit — ${date}]`);
      for (const type of types) {
        // Include first 800 chars of each previous audit section as context
        const snippet = (sections[type] || "").slice(0, 800).replace(/\n+/g, " ").trim();
        if (snippet) {
          lines.push(`  ${type}: ${snippet}${sections[type]?.length > 800 ? "…" : ""}`);
        }
      }
    }
    lines.push(`\n→ CHECK: Have previously identified issues been addressed? Note what improved, what regressed, what is still outstanding.`);
    lines.push(`  This gives your client a sense of progress, not just a snapshot.`);
  }

  // Deliverable-type-specific intelligence
  lines.push(`\n── DELIVERABLE-SPECIFIC FOCUS (${deliverableType}) ──`);

  if (deliverableType === "Technical") {
    lines.push(`  Focus areas given the above data:`);
    if (latestMetric?.pages_indexed != null && latestMetric?.pages_submitted != null) {
      const ratio = latestMetric.pages_submitted > 0
        ? Math.round((latestMetric.pages_indexed / latestMetric.pages_submitted) * 100)
        : 0;
      lines.push(`  • Indexing is at ${ratio}% — investigate crawl blocks, noindex tags, sitemap issues`);
    }
    if (allKeywords.length > 0) {
      lines.push(`  • Check if ALL target keywords appear in title tags, H1s, and meta descriptions`);
    }
    lines.push(`  • Verify schema markup, Core Web Vitals signals, and mobile usability from page content`);
    lines.push(`  • Check if site structure supports topical authority for the tracked keywords`);
  }

  if (deliverableType === "On-Page") {
    const notRanking = keywordRankings.filter(k => !k.found).map(k => k.keyword);
    const ranking = keywordRankings.filter(k => k.found);
    if (notRanking.length > 0) {
      lines.push(`  • These tracked keywords are NOT ranking: ${notRanking.join(", ")} — find the on-page reason`);
    }
    if (ranking.length > 0) {
      lines.push(`  • These ARE ranking: ${ranking.map(k => `"${k.keyword}" (${k.positionLabel})`).join(", ")} — identify what's working`);
    }
    lines.push(`  • Analyse content depth, topical coverage, and semantic keyword use for ALL ${allKeywords.length} target keywords`);
    lines.push(`  • Check E-E-A-T score is ${latestMetric?.eeat_score ?? "unknown"}/100 — identify specific on-page signals that support or undermine this`);
  }

  if (deliverableType === "Off-Page") {
    if (latestMetric?.brand_mentions != null) {
      lines.push(`  • Brand has ${latestMetric.brand_mentions} detected mentions — assess whether this is strong or weak for the industry`);
    }
    if (competitors.length > 0) {
      lines.push(`  • Build strategy specifically targeting gaps vs: ${competitors.join(", ")}`);
    }
    lines.push(`  • Analyse digital PR angles unique to this business's industry and content`);
    lines.push(`  • Identify specific link-building opportunities from the actual page content (events, case studies, tools, data)`);
  }

  if (deliverableType === "GEO") {
    if (latestMetric) {
      const perplexityStatus = latestMetric.perplexity_citations > 0 ? `VISIBLE (${latestMetric.perplexity_citations} citations)` : "NOT VISIBLE";
      const googleAIStatus = latestMetric.google_ai_citations > 0 ? "REFERENCED" : "NOT FOUND";
      lines.push(`  • Perplexity status: ${perplexityStatus} — explain why and what to do`);
      lines.push(`  • Google AI Overview: ${googleAIStatus} — identify what content gaps prevent AI citation`);
      lines.push(`  • LLM Visibility score is ${latestMetric.llm_visibility_score ?? "unknown"}/100 — verify this against actual content structure`);
    }
    lines.push(`  • Check for FAQ structure, direct-answer formatted content, entity markup`);
    lines.push(`  • Identify which of the ${allKeywords.length} tracked keywords could realistically appear in AI-generated answers`);
  }

  lines.push(`\n${"═".repeat(60)}\n`);

  return lines.join("\n");
}

/* ─────────────────────────────────────────────────────────────────
   AUDIT SAVER — persists completed audit to audit_reports
───────────────────────────────────────────────────────────────── */
async function saveAuditReport(
  projectId: string,
  url: string,
  keyword: string,
  allKeywords: string[],
  competitors: string[],
  deliverableType: DeliverableType,
  content: string
): Promise<void> {
  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!
    );

    // Check if there's an existing audit report from today for this project
    const today = new Date().toISOString().split("T")[0];
    const { data: existing } = await supabase
      .from("audit_reports")
      .select("id, sections")
      .eq("project_id", projectId)
      .gte("created_at", `${today}T00:00:00`)
      .eq("saved_by", "seo-engine")
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      // Update existing today's record — add this section
      const updatedSections = {
        ...(existing[0].sections || {}),
        [deliverableType]: content,
      };
      await supabase
        .from("audit_reports")
        .update({ sections: updatedSections })
        .eq("id", existing[0].id);
    } else {
      // Create new audit record
      const combinedKeywords = Array.from(new Set([keyword, ...allKeywords])).filter(Boolean);
      await supabase.from("audit_reports").insert({
        project_id:  projectId,
        url,
        keywords:    combinedKeywords,
        competitors,
        sections:    { [deliverableType]: content },
        saved_by:    "seo-engine",
        created_at:  new Date().toISOString(),
      });
    }

    // Also save a lightweight summary back to the project for dashboard/launchpad awareness
    const summaryLines = content
      .split("\n")
      .filter(l => l.startsWith("#") || l.startsWith("##"))
      .slice(0, 8)
      .join(" | ");

    await supabase
      .from("projects")
      .update({
        last_analysis: {
          ...({}), // preserve existing
          [`audit_${deliverableType.toLowerCase().replace("-", "_")}_summary`]: summaryLines.slice(0, 400),
          [`audit_${deliverableType.toLowerCase().replace("-", "_")}_at`]: new Date().toISOString(),
        },
      })
      .eq("id", projectId);

  } catch {
    // Fail silently — don't break the audit if saving fails
  }
}

/* ─────────────────────────────────────────────────────────────────
   MAIN HANDLER
───────────────────────────────────────────────────────────────── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  let url: string;
  let keyword: string;
  let deliverableType: DeliverableType;
  let projectId: string | undefined;

  try {
    url             = (req.body?.url             ?? "").toString().trim();
    keyword         = (req.body?.keyword         ?? "").toString().trim();
    deliverableType = (req.body?.deliverableType ?? "") as DeliverableType;
    projectId       = req.body?.projectId        ?? undefined;
  } catch {
    return res.status(400).json({ error: "Could not parse request body." });
  }

  if (!url || !keyword || !deliverableType) {
    return res.status(400).json({ error: "Missing required fields: url, keyword, deliverableType." });
  }

  if (!SYSTEM_PROMPTS[deliverableType]) {
    return res.status(400).json({
      error: `Invalid deliverableType. Must be one of: ${Object.keys(SYSTEM_PROMPTS).join(", ")}.`,
    });
  }

  // Fetch project context (if projectId provided) and website content in parallel
  const [projectCtx, websiteContent] = await Promise.all([
    projectId ? fetchProjectContext(projectId) : Promise.resolve(null),
    fetchWebsiteContent(url),
  ]);

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  const client = new Anthropic();

  // Build the intelligence brief if we have project context
  const contextSection = projectCtx
    ? buildContextSection(projectCtx, deliverableType)
    : "";

  const userMessage = `
You are analyzing a REAL website. Below you will find:
${projectCtx ? "1. An intelligence brief about the project (use this to make your analysis highly specific)\n2. The live website content\n3. Your analysis instructions" : "1. The live website content\n2. Your analysis instructions"}
${contextSection}
=== LIVE WEBSITE CONTENT FROM ${url} ===
${websiteContent}
=== END OF WEBSITE CONTENT ===

Now perform a ${deliverableType} SEO analysis with the following details:
- Target URL: ${url}
- Primary Focus Keyword: ${keyword}
${projectCtx?.allKeywords?.length ? `- All Tracked Keywords: ${projectCtx.allKeywords.join(", ")}` : ""}
${projectCtx?.competitors?.length ? `- Known Competitors: ${projectCtx.competitors.join(", ")}` : ""}
- Today's Date: ${today}

Critical instructions:
- Base ALL findings strictly on the actual website content provided above
- Quote or reference specific text from the site where relevant
- Do NOT invent, assume, or hallucinate data not present in the content
- If project intelligence was provided above, USE it — reference specific scores, keywords, and competitor names by name
- Cross-verify any health scores from the intelligence brief against what you actually see in the content
- If previous audit findings were provided, check whether those issues have been resolved or persist
- Use today's date (${today}) for the analysis date — never write a different year
- Format using clear markdown: headings, bullet points, and tables where appropriate
- Be specific, direct, and actionable
- Write a COMPLETE report — never truncate or summarize at the end
- If running long, reduce section depth but always finish all sections
  `.trim();

  // Streaming headers
  res.setHeader("Content-Type",      "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control",     "no-cache");
  res.status(200);

  let accumulated = "";

  try {
    const anthropicStream = await client.messages.stream({
      model:      "claude-sonnet-4-5",
      max_tokens: 32000,
      system:     SYSTEM_PROMPTS[deliverableType],
      messages:   [{ role: "user", content: userMessage }],
    });

    for await (const chunk of anthropicStream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        accumulated += chunk.delta.text;
        res.write(chunk.delta.text);
      }
    }

  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `Anthropic API error ${err.status}: ${err.message}`
        : "An unexpected error occurred while generating the report.";
    res.write(`\n\n[STREAM_ERROR]: ${message}`);

  } finally {
    res.end();

    // Save audit after stream completes (non-blocking)
    if (projectId && accumulated.length > 200 && projectCtx) {
      saveAuditReport(
        projectId,
        url,
        keyword,
        projectCtx.allKeywords,
        projectCtx.competitors,
        deliverableType,
        accumulated
      );
    }
  }
}
