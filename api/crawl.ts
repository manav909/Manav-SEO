import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 300 };

const SYSTEM = "You are Manav Brain, senior SEO strategist. Extract every piece of SEO-relevant data observable from the live page content provided. Only state facts visible in the content — never invent or estimate. If something cannot be determined from the content, say so explicitly.";

// Exact field keys the Data Room UI recognises
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
    const text = await r.text();
    return { content: text.slice(0, 12000), status: 200 };
  } catch (err: any) {
    return { content: "", status: 0, error: err.message };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action } = req.body;

  // ══ CRAWL MULTIPLE URLS ══════════════════════════════════════════════
  if (action === "crawl_urls") {
    const { urls, projectContext = "", projectId } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: "No URLs provided" });
    }

    // Cap at 10 URLs per call to avoid timeout
    const urlList: string[] = urls.slice(0, 10).map((u: string) =>
      u.trim().startsWith("http") ? u.trim() : `https://${u.trim()}`
    );

    res.setHeader("Content-Type", "application/json");

    const results: Array<{
      url: string;
      status: number;
      error?: string;
      page_analysis: any;
      knowledge_fields: any[];
    }> = [];

    const anthropic = new Anthropic();

    // Process URLs sequentially to stay within rate limits
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
        "Extract everything observable. For each finding, state EXACTLY what you saw — quote the title tag, describe the H1, list schema types present, etc.",
        "",
        "Return ONLY valid JSON:",
        JSON.stringify({
          title_tag:        "exact title tag text or 'Not visible in content'",
          title_length:     0,
          meta_description: "exact meta description or 'Not visible in content'",
          meta_desc_length: 0,
          h1:               "exact H1 text or 'Not found'",
          h2s:              ["up to 5 H2 texts"],
          canonical_url:    "canonical href or 'Not found'",
          schema_types:     ["list of @type values found"],
          internal_links:   0,
          external_links:   0,
          word_count:       0,
          images_total:     0,
          images_no_alt:    0,
          page_speed_signals: ["observable signals: lazy load, inline CSS, etc."],
          content_quality:  "high|medium|low — based on depth, structure, E-E-A-T signals",
          keyword_presence: ["keywords visibly present in headings or first paragraph"],
          issues:           [{ type: "missing_meta|duplicate_title|no_h1|missing_schema|thin_content|etc", severity: "critical|high|medium|low", detail: "specific observation" }],
          opportunities:    [{ action: "specific action", impact: "expected SEO impact", effort: "low|medium|high" }],
          knowledge_fields: [{ category: "analytics|technical|competitor|goal|cms", key: "MUST_BE_VALID_KEY", value: "exact value" }],
        }),
        "",
        "knowledge_fields: ONLY extract if the page explicitly shows the data. Valid keys:",
        "technical: schema_markup, robots_txt, sitemap_url, canonical_issues",
        "cms: cms, seo_plugin, pagespeed_mobile, pagespeed_desktop",
        "goal: target_keywords (from page's visible focus keywords)",
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
        try { parsed = JSON.parse(raw.slice(f, l + 1)); } catch { /* ignore */ }

        // Filter knowledge_fields to valid keys
        if (Array.isArray(parsed.knowledge_fields)) {
          parsed.knowledge_fields = parsed.knowledge_fields.filter(
            (kf: any) => kf.key && validKeySet.has(kf.key) && kf.value && String(kf.value).trim()
          );
        } else {
          parsed.knowledge_fields = [];
        }

        results.push({
          url,
          status: fetched.status,
          page_analysis: parsed,
          knowledge_fields: parsed.knowledge_fields || [],
        });
      } catch (err: any) {
        results.push({ url, status: fetched.status, error: `Analysis failed: ${err.message}`, page_analysis: null, knowledge_fields: [] });
      }
    }

    // Aggregate knowledge_fields across all pages — latest value wins
    const aggregated: Record<string, { category: string; key: string; value: string; source_url: string }> = {};
    for (const r of results) {
      for (const kf of (r.knowledge_fields || [])) {
        aggregated[kf.key] = { ...kf, source_url: r.url };
      }
    }

    // Build cross-page summary
    const allIssues   = results.flatMap(r => (r.page_analysis?.issues || []).map((i: any) => ({ ...i, url: r.url })));
    const allOpps     = results.flatMap(r => (r.page_analysis?.opportunities || []).map((o: any) => ({ ...o, url: r.url })));

    return res.status(200).json({
      success: true,
      urls_crawled: results.length,
      results,
      aggregated_knowledge: Object.values(aggregated),
      cross_page_issues: allIssues,
      cross_page_opportunities: allOpps,
    });
  }

  // ══ FETCH SINGLE URL PREVIEW ═════════════════════════════════════════
  if (action === "preview_url") {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });

    const clean = url.startsWith("http") ? url : `https://${url}`;
    const fetched = await fetchUrl(clean, 8000);
    return res.status(200).json({
      success: fetched.status === 200,
      status:  fetched.status,
      error:   fetched.error,
      preview: fetched.content.slice(0, 300),
      chars:   fetched.content.length,
    });
  }

  return res.status(400).json({ error: "Unknown action" });
}
