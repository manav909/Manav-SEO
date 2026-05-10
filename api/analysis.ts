import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

const SYSTEM = "You are Manav Brain, the senior SEO strategist embedded in SEO Season. Every finding must be based on observable data. Never invent rankings, metrics, or technical states. If you cannot verify something from the data provided, say exactly that and tell the user how to verify it manually.";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action = "audit" } = req.body;

  /* ── EXTRACT DOCUMENT ── */
  if (action === "extract") {
    const { content, fileName, docType, projectContext = "" } = req.body;
    if (!content) return res.status(400).json({ error: "No content provided" });

    const extractPrompt = [
      "Extract every piece of SEO-relevant data from this document.",
      `Document: ${fileName || "unknown"} (type: ${docType || "unknown"})`,
      `Project context: ${projectContext}`,
      "",
      "DOCUMENT CONTENT:",
      String(content).slice(0, 15000),
      "",
      "Return ONLY valid JSON:",
      '{"doc_summary":"2-sentence description of what this document contains and its date range","data_quality":"high|medium|low","date_range":"period or null","extracted":{"keywords":[{"keyword":"","position":null,"impressions":null,"clicks":null,"ctr":null}],"pages":[{"url":"","status_code":null,"title":"","issues":[]}],"technical_issues":[{"issue":"","severity":"critical|high|medium|low","count":null}],"metrics":{"total_pages":null,"indexed_pages":null,"total_keywords":null,"avg_position":null,"total_impressions":null,"total_clicks":null,"organic_traffic":null,"domain_rating":null},"action_items":[{"priority":"critical|high|medium|low","action":"","evidence":""}]},"knowledge_fields":[{"category":"technical|analytics|competitor|content|cms","key":"","value":"","notes":""}]}',
    ].join("\n");

    try {
      const anthropic = new Anthropic();
      const response  = await anthropic.messages.create({
        model: "claude-sonnet-4-5", max_tokens: 4000,
        system: SYSTEM,
        messages: [{ role: "user", content: extractPrompt }],
      });
      const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
      const f = raw.indexOf("{"), l = raw.lastIndexOf("}");
      let parsed: any = {};
      try { parsed = JSON.parse(raw.slice(f, l + 1)); } catch { /* ignore */ }
      return res.status(200).json({ success: true, extracted: parsed });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /* ── AUDIT (streaming) ── */
  const { url, keyword, mode = "standard", projectContext = "" } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200);

  let siteContent = "";
  try {
    const cleanUrl = url.startsWith("http") ? url : `https://${url}`;
    const r = await fetch(`https://r.jina.ai/${cleanUrl}`, {
      headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "25" },
      signal: AbortSignal.timeout(30000),
    });
    if (r.ok) siteContent = (await r.text()).slice(0, mode === "deep" ? 16000 : 8000);
  } catch {
    siteContent = "Could not fetch live site — analysis based on URL and context only.";
  }

  const auditPrompt = [
    `Conduct a comprehensive SEO audit for: ${url}`,
    `Target keyword: ${keyword || "Not specified"}`,
    `Mode: ${mode}`,
    projectContext ? `Project context: ${projectContext}` : "",
    "",
    "LIVE SITE CONTENT:",
    siteContent,
    "",
    "For every finding: cite what you actually observed in the content above, or state: Could not verify — requires manual check with [specific tool].",
    "",
    "## Technical SEO",
    "Crawlability, indexation, page speed signals, Core Web Vitals indicators, schema markup, canonical tags, robots.txt, sitemap",
    "",
    "## On-Page SEO",
    "Title tags, meta descriptions, heading structure, keyword usage, content quality, internal linking, image optimisation",
    "",
    "## Content Analysis",
    "Content depth, topical authority, E-E-A-T signals, freshness, uniqueness, user intent alignment",
    "",
    "## GEO and AI Visibility",
    "Perplexity citation potential, structured data for AI, entity coverage, FAQ opportunities",
    "",
    "## Quick Wins",
    "List 5 highest-impact changes that could be made this week — specific and actionable",
    "",
    "## Priority Action Plan",
    "Ranked list: Critical, then High, then Medium — with specific implementation steps for each",
  ].filter(l => l !== "").join("\n");

  try {
    const anthropic = new Anthropic();
    const stream    = await anthropic.messages.stream({
      model: "claude-sonnet-4-5", max_tokens: mode === "deep" ? 16000 : 8000,
      system: SYSTEM,
      messages: [{ role: "user", content: auditPrompt }],
    });
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        res.write(chunk.delta.text);
      }
    }
  } catch (err: any) {
    res.write(`\nError: ${err.message}`);
  } finally {
    res.end();
  }
}
