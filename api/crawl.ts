import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 300 };

const SYSTEM = "You are Manav Brain, senior SEO strategist. Extract every piece of SEO-relevant data observable from the live page content provided. Only state facts visible in the content — never invent or estimate. If something cannot be determined from the content, say so explicitly.";

const VALID_FIELDS_MAP: Record<string, string[]> = {
  analytics:  ["organic_sessions_monthly","organic_sessions_baseline_date","top_landing_pages","bounce_rate","avg_session_duration","conversions_monthly","gsc_total_impressions","gsc_total_clicks","gsc_avg_position"],
  technical:  ["pages_indexed","pages_submitted","crawl_errors","broken_links","duplicate_content","schema_markup","sitemap_url","robots_txt","canonical_issues"],
  competitor: ["competitor_1","competitor_1_dr","competitor_2","competitor_2_dr","competitor_3","our_domain_rating","our_referring_domains","content_gap_keywords"],
  goal:       ["target_keywords"],
  cms:        ["cms","cms_version","seo_plugin","pagespeed_mobile","pagespeed_desktop"],
};
const validKeySet = new Set(Object.values(VALID_FIELDS_MAP).flat());

async function fetchUrl(url: string, timeoutMs = 12000): Promise<{ content: string; status: number; error?: string }> {
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "10" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return { content: "", status: r.status, error: `HTTP ${r.status}` };
    return { content: (await r.text()).slice(0, 12000), status: 200 };
  } catch (err: any) {
    return { content: "", status: 0, error: err.message };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { action } = req.body;
  const anthropic = new Anthropic();

  // ══ CRAWL MULTIPLE URLS ══════════════════════════════════════════════
  if (action === "crawl_urls") {
    const { urls, projectContext = "" } = req.body;
    if (!Array.isArray(urls) || !urls.length) return res.status(400).json({ error: "No URLs provided" });

    const urlList = urls.slice(0, 10).map((u: string) =>
      u.trim().startsWith("http") ? u.trim() : `https://${u.trim()}`
    );

    const results: any[] = [];

    for (const url of urlList) {
      const fetched = await fetchUrl(url);
      if (!fetched.content) {
        results.push({ url, status: fetched.status, error: fetched.error, page_analysis: null, knowledge_fields: [] });
        continue;
      }

      const prompt = [
        `Analyse this live page for all observable SEO data.`,
        `URL: ${url}`,
        `Project context: ${projectContext}`,
        "",
        "PAGE CONTENT (fetched live):",
        fetched.content,
        "",
        "Extract everything observable. Quote exact text you see.",
        "",
        "Return ONLY valid JSON:",
        JSON.stringify({
          title_tag: "exact title tag text or 'Not visible'",
          title_length: 0,
          meta_description: "exact meta description or 'Not visible'",
          meta_desc_length: 0,
          h1: "exact H1 text or 'Not found'",
          h2s: ["up to 5 H2 texts"],
          canonical_url: "canonical href or 'Not found'",
          schema_types: ["list of @type values found"],
          internal_links: 0,
          external_links: 0,
          word_count: 0,
          images_total: 0,
          images_no_alt: 0,
          content_quality: "high|medium|low",
          keyword_presence: ["keywords in headings/first paragraph"],
          issues: [{ type: "issue_type", severity: "critical|high|medium|low", detail: "specific observation" }],
          opportunities: [{ action: "specific action", impact: "expected SEO impact", effort: "low|medium|high" }],
          knowledge_fields: [{ category: "analytics|technical|competitor|goal|cms", key: "MUST_BE_VALID_KEY", value: "exact value" }],
        }),
        "",
        "knowledge_fields valid keys: schema_markup, robots_txt, sitemap_url, canonical_issues, cms, seo_plugin, pagespeed_mobile, pagespeed_desktop, target_keywords",
      ].join("\n");

      try {
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-5", max_tokens: 1500,
          system: SYSTEM,
          messages: [{ role: "user", content: prompt }],
        });
        const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
        const f = raw.indexOf("{"), l = raw.lastIndexOf("}");
        let parsed: any = {};
        try { parsed = JSON.parse(raw.slice(f, l + 1)); } catch {}
        if (Array.isArray(parsed.knowledge_fields)) {
          parsed.knowledge_fields = parsed.knowledge_fields.filter(
            (kf: any) => kf.key && validKeySet.has(kf.key) && kf.value && String(kf.value).trim()
          );
        } else {
          parsed.knowledge_fields = [];
        }
        results.push({ url, status: 200, page_analysis: parsed, knowledge_fields: parsed.knowledge_fields || [] });
      } catch (err: any) {
        results.push({ url, status: fetched.status, error: `Analysis failed: ${err.message}`, page_analysis: null, knowledge_fields: [] });
      }
    }

    const aggregated: Record<string, any> = {};
    for (const r of results) {
      for (const kf of (r.knowledge_fields || [])) {
        aggregated[kf.key] = { ...kf, source_url: r.url };
      }
    }

    return res.status(200).json({
      success: true,
      urls_crawled: results.length,
      results,
      aggregated_knowledge: Object.values(aggregated),
      cross_page_issues: results.flatMap(r => (r.page_analysis?.issues || []).map((i: any) => ({ ...i, url: r.url }))),
      cross_page_opportunities: results.flatMap(r => (r.page_analysis?.opportunities || []).map((o: any) => ({ ...o, url: r.url }))),
    });
  }

  // ══ COMPARE + MANAV ANALYSIS ═════════════════════════════════════════
  if (action === "compare_analysis") {
    const { crawlResults, projectContext = "", existingBlocks = [] } = req.body;

    if (!crawlResults?.results?.length) {
      return res.status(400).json({ error: "No crawl results to analyse" });
    }

    const results = crawlResults.results as any[];

    // Build compact per-page summary for the prompt
    const pageSummaries = results.map((r: any) => {
      const p = r.page_analysis;
      if (!p) return `URL: ${r.url}\nStatus: ${r.error || "failed"}\n`;
      return [
        `URL: ${r.url}`,
        `Title: ${p.title_tag || "missing"} (${p.title_length || 0} chars)`,
        `H1: ${p.h1 || "missing"}`,
        `Meta: ${p.meta_description ? `${p.meta_desc_length || 0} chars` : "missing"}`,
        `Schema: ${p.schema_types?.join(", ") || "none"}`,
        `Words: ~${p.word_count || 0} | Internal links: ${p.internal_links || 0}`,
        `Content quality: ${p.content_quality || "unknown"}`,
        `Issues (${p.issues?.length || 0}): ${(p.issues || []).map((i: any) => `[${i.severity}] ${i.detail || i.type}`).join(" | ") || "none"}`,
        `Opportunities (${p.opportunities?.length || 0}): ${(p.opportunities || []).map((o: any) => o.action).join(" | ") || "none"}`,
        `Keywords present: ${p.keyword_presence?.join(", ") || "none"}`,
      ].join("\n");
    }).join("\n\n---\n\n");

    // Existing canvas blocks for merge candidate detection
    const existingTitles = (existingBlocks as any[])
      .map((b: any) => `[${b.type}|W${b.week}|${b.priority}] "${b.title}" — ${(b.content || "").slice(0, 80)}`)
      .slice(0, 20)
      .join("\n");

    const prompt = [
      "You are Manav Brain. Perform a comprehensive multi-page SEO comparison analysis.",
      `Project: ${projectContext}`,
      "",
      "CRAWLED PAGES DATA:",
      pageSummaries,
      "",
      existingTitles ? `EXISTING CANVAS CARDS (for merge detection):\n${existingTitles}` : "",
      "",
      "Produce a structured analysis. Return ONLY valid JSON with these exact keys:",
      JSON.stringify({
        executive_summary: "2-3 sentence honest assessment of overall SEO health across all pages",
        overall_score: "0-100 based on what you observed",
        comparison_matrix: {
          headers: ["Signal", "...one column per URL (short label)"],
          rows: [
            { signal: "Title tag", values: ["status per page: OK/Missing/Too long/etc"], verdict: "best|worst|mixed" },
            { signal: "H1 present", values: [], verdict: "best|worst|mixed" },
            { signal: "Meta description", values: [], verdict: "" },
            { signal: "Schema markup", values: [], verdict: "" },
            { signal: "Word count", values: [], verdict: "" },
            { signal: "Internal linking", values: [], verdict: "" },
            { signal: "Content quality", values: [], verdict: "" },
          ],
          note: "Add more rows for any other signals found. Values array length must match headers length minus 1.",
        },
        errors: [
          { severity: "critical|high|medium|low", issue: "issue description", affected_urls: ["url1"], fix: "exact fix", quick_fix: true },
        ],
        opportunities: [
          { rank: 1, title: "opportunity title", description: "what + why", affected_urls: ["url1"], effort: "low|medium|high", impact: "high|medium|low", data_basis: "cite what you saw" },
        ],
        competitive_gaps: [
          { gap: "what competitors likely have that these pages don't", evidence: "what signals suggest this", action: "specific step to close it", priority: "high|medium|low" },
        ],
        advantages: [
          { advantage: "what these pages do well", urls: ["url1"], how_to_leverage: "specific suggestion" },
        ],
        card_proposals: [
          {
            title: "Short actionable card title max 8 words",
            type: "technical|content|geo|quick-win|competitive|insight",
            week: 1,
            priority: "high|medium|low",
            content: "Full actionable detail. Must cite specific page data.",
            data_basis: "exact observation from crawl (e.g. 'Missing H1 on /page', 'Schema absent on all 3 pages')",
            affected_urls: ["url1"],
            merge_candidate: "exact title of existing canvas card if this overlaps, or null",
            merge_reason: "why it overlaps and what scope to add, or null",
          },
        ],
        data_gaps: ["list of things that couldn't be determined from live page content alone"],
      }),
      "",
      "RULES:",
      "- comparison_matrix.values arrays must have exactly the same length as headers minus 1",
      "- card_proposals: only create if there is direct evidence from the crawl data",
      "- merge_candidate must be the EXACT title string from existing canvas cards, or null",
      "- opportunities: rank by ROI (impact/effort ratio), highest first",
      "- competitive_gaps: infer from missing elements competitors typically have",
    ].filter(Boolean).join("\n");

    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-5", max_tokens: 4000,
        system: "You are Manav Brain, senior SEO strategist. Return only valid JSON. Every finding must cite specific data from the page content provided.",
        messages: [{ role: "user", content: prompt }],
      });
      const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
      const f = raw.indexOf("{"), l = raw.lastIndexOf("}");
      let analysis: any = {};
      try { analysis = JSON.parse(raw.slice(f, l + 1)); } catch {
        // Try partial recovery
        try { analysis = JSON.parse(raw.slice(f) + "}"); } catch {}
      }
      return res.status(200).json({ success: true, analysis });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ══ FETCH SINGLE URL PREVIEW ═════════════════════════════════════════
  if (action === "preview_url") {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });
    const clean = url.startsWith("http") ? url : `https://${url}`;
    const fetched = await fetchUrl(clean, 8000);
    return res.status(200).json({
      success: fetched.status === 200, status: fetched.status,
      error: fetched.error, preview: fetched.content.slice(0, 300), chars: fetched.content.length,
    });
  }

  return res.status(400).json({ error: "Unknown action" });
}
