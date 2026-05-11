import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

const SYSTEM = "You are Manav Brain, the senior SEO strategist embedded in SEO Season. Every finding must be based on observable data. Never invent rankings, metrics, or technical states. If you cannot verify something from the data provided, say exactly that and tell the user how to verify it manually.";

// Exact field keys recognised by the Data Room UI
// ONLY these keys will show up in forms — use them precisely
const VALID_FIELDS = `
ANALYTICS fields (category="analytics"):
  organic_sessions_monthly   — monthly organic sessions number
  organic_sessions_baseline_date — date of that baseline (YYYY-MM-DD)
  top_landing_pages          — comma-separated top landing page URLs
  bounce_rate                — e.g. "68%"
  avg_session_duration       — e.g. "2m 14s"
  conversions_monthly        — e.g. "47 leads"
  gsc_total_impressions      — e.g. "84,000"
  gsc_total_clicks           — e.g. "2,100"
  gsc_avg_position           — e.g. "18.4"

TECHNICAL fields (category="technical"):
  pages_indexed              — number of indexed pages
  pages_submitted            — number of pages in sitemap
  crawl_errors               — e.g. "23 404s, 5 redirect chains"
  broken_links               — e.g. "12 broken internal links"
  duplicate_content          — e.g. "8 duplicate title tags"
  schema_markup              — "Yes — comprehensive" | "Partial" | "None" | "Unknown"
  sitemap_url                — full URL of sitemap
  robots_txt                 — "OK" | "Blocking important pages" | "Missing" | "Not checked"
  canonical_issues           — e.g. "4 self-referencing / 12 missing"

COMPETITOR fields (category="competitor"):
  competitor_1               — domain of main competitor
  competitor_1_dr            — domain rating e.g. "DR 45"
  competitor_2               — second competitor domain
  competitor_2_dr            — second competitor DR
  competitor_3               — third competitor domain
  our_domain_rating          — our DR e.g. "DR 22"
  our_referring_domains      — number of referring domains
  content_gap_keywords       — keywords they rank for that we don't

GOAL fields (category="goal"):
  target_keywords            — top 3-5 target keywords
  organic_sessions_monthly   — current monthly organic sessions (if mentioned)

CMS fields (category="cms"):
  cms                        — e.g. "WordPress"
  cms_version                — e.g. "6.4.2"
  seo_plugin                 — e.g. "Yoast SEO"
  pagespeed_mobile           — mobile PageSpeed score 0-100
  pagespeed_desktop          — desktop PageSpeed score 0-100
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action = "audit" } = req.body;

  /* ── EXTRACT DOCUMENT ── */
  if (action === "extract") {
    const { content, fileName, docType, projectContext = "" } = req.body;
    if (!content) return res.status(400).json({ error: "No content provided" });

    // Detect if content is binary/garbled (xlsx read as text)
    const nonPrintable = (content.match(/[\x00-\x08\x0e-\x1f\x7f-\x9f]/g) || []).length;
    if (nonPrintable > 50) {
      return res.status(400).json({
        error: "binary_file",
        message: "This file appears to be a binary format (e.g. XLSX). Please export it as CSV first, then re-upload.",
      });
    }

    const extractPrompt = [
      "Extract every piece of SEO-relevant data from this document.",
      `Document: ${fileName || "unknown"} (type: ${docType || "unknown"})`,
      `Project context: ${projectContext}`,
      "",
      "DOCUMENT CONTENT:",
      String(content).slice(0, 15000),
      "",
      "CRITICAL: knowledge_fields must use ONLY these exact field_key values:",
      VALID_FIELDS,
      "",
      "Rules:",
      "- Only extract fields where the document actually contains data",
      "- Do NOT invent or estimate values not present in the document",
      "- Use exact field_key names from the list above — no others",
      "- For category: use exactly 'analytics', 'technical', 'competitor', 'goal', or 'cms'",
      "",
      "Return ONLY valid JSON:",
      '{"doc_summary":"2-sentence description of what this document contains and its date range","data_quality":"high|medium|low","date_range":"period covered or null","extracted":{"keywords":[{"keyword":"","position":null,"impressions":null,"clicks":null,"ctr":null}],"pages":[{"url":"","status_code":null,"title":"","issues":[]}],"technical_issues":[{"issue":"","severity":"critical|high|medium|low","count":null}],"metrics":{"total_pages":null,"indexed_pages":null,"total_keywords":null,"avg_position":null,"total_impressions":null,"total_clicks":null,"organic_traffic":null,"domain_rating":null},"action_items":[{"priority":"critical|high|medium|low","action":"","evidence":""}]},"knowledge_fields":[{"category":"analytics|technical|competitor|goal|cms","key":"MUST_BE_FROM_LIST_ABOVE","value":"","notes":""}]}',
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

      // Filter knowledge_fields to only valid keys (safety net)
      const validKeySet = new Set([
        "organic_sessions_monthly","organic_sessions_baseline_date","top_landing_pages",
        "bounce_rate","avg_session_duration","conversions_monthly","gsc_total_impressions",
        "gsc_total_clicks","gsc_avg_position","pages_indexed","pages_submitted",
        "crawl_errors","broken_links","duplicate_content","schema_markup","sitemap_url",
        "robots_txt","canonical_issues","competitor_1","competitor_1_dr","competitor_2",
        "competitor_2_dr","competitor_3","our_domain_rating","our_referring_domains",
        "content_gap_keywords","target_keywords","cms","cms_version","seo_plugin",
        "pagespeed_mobile","pagespeed_desktop",
      ]);
      if (Array.isArray(parsed.knowledge_fields)) {
        parsed.knowledge_fields = parsed.knowledge_fields.filter(
          (kf: any) => kf.key && validKeySet.has(kf.key) && kf.value && String(kf.value).trim() !== ""
        );
      }

      // ── Live verification: cross-check extracted metrics against live site ──
      let liveVerification: any = null;
      const siteUrl = req.body.siteUrl || (projectContext.split("|")[1] || "").trim();
      if (siteUrl && siteUrl.startsWith("http") && parsed?.knowledge_fields?.length > 0) {
        try {
          const cleanUrl = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
          const liveRes = await fetch(`https://r.jina.ai/${cleanUrl}`, {
            headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "15" },
            signal: AbortSignal.timeout(18000),
          });
          const liveContent = liveRes.ok ? (await liveRes.text()).slice(0, 5000) : "";

          if (liveContent) {
            const verifyPrompt = [
              "You extracted data from an uploaded document. Now cross-check key metrics against the live site content below.",
              "",
              "EXTRACTED FIELDS:",
              (parsed.knowledge_fields as any[]).slice(0, 10).map((kf: any) => `${kf.key}: ${kf.value}`).join("
"),
              "",
              "LIVE SITE CONTENT (fetched right now):",
              liveContent,
              "",
              "For each extracted field, check if the live site confirms, contradicts, or cannot verify it.",
              "Return ONLY valid JSON: {"verified":[{"key":"","extracted_value":"","live_confirms":true,"note":""}],"discrepancies":[{"key":"","extracted_value":"","live_value":"","severity":"high|medium|low","note":""}],"unverifiable":[{"key":"","reason":"why live site cannot confirm this"}]}",
            ].join("
");

            const verifyRes = await anthropic.messages.create({
              model: "claude-sonnet-4-5", max_tokens: 1000,
              system: SYSTEM,
              messages: [{ role: "user", content: verifyPrompt }],
            });
            const verifyRaw = verifyRes.content[0].type === "text" ? verifyRes.content[0].text : "{}";
            const vf = verifyRaw.indexOf("{"), vl = verifyRaw.lastIndexOf("}");
            try { liveVerification = JSON.parse(verifyRaw.slice(vf, vl + 1)); } catch { /* ignore */ }
          }
        } catch { /* live check failed silently — don't block extraction */ }
      }

      return res.status(200).json({ success: true, extracted: parsed, live_verification: liveVerification });
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
