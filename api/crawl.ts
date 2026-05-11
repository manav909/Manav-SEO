import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// 600s: parallel batches of 3 means 8 URLs ≈ 3 batches × ~25s = ~75s total
export const config = { maxDuration: 300 };

const SYSTEM = "You are Manav Brain. Extract SEO signals from live page content. Quote exact text. State 'Not found' for absent elements. Return only valid JSON.";

const VALID_KEYS = new Set([
  "organic_sessions_monthly","organic_sessions_baseline_date","top_landing_pages",
  "bounce_rate","avg_session_duration","conversions_monthly","gsc_total_impressions",
  "gsc_total_clicks","gsc_avg_position","pages_indexed","pages_submitted",
  "crawl_errors","broken_links","duplicate_content","schema_markup","sitemap_url",
  "robots_txt","canonical_issues","competitor_1","competitor_1_dr","competitor_2",
  "competitor_2_dr","competitor_3","our_domain_rating","our_referring_domains",
  "content_gap_keywords","target_keywords","cms","cms_version","seo_plugin",
  "pagespeed_mobile","pagespeed_desktop",
]);

// Compact prompt schema — describes structure without bloating every prompt
// Full PAGE_SCHEMA was 787 tokens per call × 8 URLs = 6,296 wasted tokens
const COMPACT_SCHEMA = `Return ONLY valid JSON with these exact keys:
{
  "title_tag":"exact title text","title_length":0,"title_issues":"OK|Too long|Too short|Missing keyword|Duplicate",
  "meta_description":"exact meta text","meta_desc_length":0,"meta_desc_issues":"OK|Missing|Too long|Not compelling",
  "h1":"exact H1 text or Not found","h1_issues":"OK|Missing|Multiple|Too generic",
  "h2s":["up to 5 H2 texts"],"h3s":["up to 3 H3 texts"],
  "canonical_url":"canonical href or Missing","word_count":0,"content_quality":"high|medium|low",
  "content_type":"landing_page|blog|product|service|home|about|other",
  "primary_topic":"main topic in 5 words","reading_level":"technical|intermediate|beginner",
  "keyword_presence":["keywords in H1/H2/first paragraph"],"lsi_terms":["related entities present"],
  "schema_types":["JSON-LD @type values"],"schema_details":{"Type":"brief description"},
  "structured_data_quality":"comprehensive|partial|minimal|none",
  "internal_links":0,"external_links":0,"images_total":0,"images_no_alt":0,
  "has_og_tags":false,"has_twitter_card":false,"has_robots_meta":"index,follow|noindex|not visible",
  "faqs_detected":["FAQ questions visible — exact text"],"cta_elements":["exact CTA button/link text"],
  "brand_mentions":["brand names mentioned"],"trust_signals":["testimonials|certs|awards present"],
  "speed_signals":["observable: lazy load|minified CSS|large images|render blocking"],
  "geo_readiness":{
    "has_direct_answer_format":false,"has_faq_schema":false,"has_howto_schema":false,
    "answer_format_quality":"high|medium|low|none","perplexity_citation_likelihood":"high|medium|low"
  },
  "issues":[{"type":"type","severity":"critical|high|medium|low","detail":"specific text","fix":"exact fix"}],
  "opportunities":[{"action":"specific step","impact":"SEO impact","effort":"low|medium|high","evidence":"what on page shows this"}],
  "data_confidence":"high|medium|low","confidence_reason":"why",
  "knowledge_fields":[{"category":"technical|cms|analytics|goal","key":"VALID_KEY","value":"exact value"}]
}
Valid knowledge_fields keys: schema_markup, robots_txt, sitemap_url, canonical_issues, crawl_errors, broken_links, cms, seo_plugin, pagespeed_mobile, pagespeed_desktop, top_landing_pages, target_keywords`;

async function fetchUrl(url: string): Promise<{ content: string; status: number; error?: string }> {
  try {
    // 6s total timeout: X-Timeout tells Jina to cap server-side, AbortSignal is our hard kill
    const r = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "5" },
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) return { content: "", status: r.status, error: `HTTP ${r.status}` };
    // First 8000 chars contain title, meta, H1/H2, above-fold content, schema
    return { content: (await r.text()).slice(0, 8000), status: 200 };
  } catch (e: any) {
    return { content: "", status: 0, error: e.message?.includes("abort") ? "Timeout (page too slow)" : e.message };
  }
}

async function analysePage(
  url: string,
  content: string,
  projectContext: string,
  taskHints: string[],
  anthropic: Anthropic,
): Promise<any> {
  const taskContext = taskHints.length > 0
    ? `\nCanvas tasks needing data:\n${taskHints.slice(0, 4).join("\n")}`
    : "";

  const prompt = [
    `SEO analysis of: ${url}`,
    `Project: ${projectContext}`,
    taskContext,
    "",
    "PAGE CONTENT:",
    content,
    "",
    "Quote exact text — do not paraphrase titles, H1s, CTAs. 'Not found' for absent elements.",
    "",
    COMPACT_SCHEMA,
  ].filter(Boolean).join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1200,   // Was 2500 — 1200 is enough for the compact schema output
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  const f = raw.indexOf("{"), l = raw.lastIndexOf("}");
  let parsed: any = {};
  try { parsed = JSON.parse(raw.slice(f, l + 1)); } catch {}

  if (Array.isArray(parsed.knowledge_fields)) {
    parsed.knowledge_fields = parsed.knowledge_fields.filter(
      (kf: any) => kf.key && VALID_KEYS.has(kf.key) && kf.value && String(kf.value).trim()
    );
  } else {
    parsed.knowledge_fields = [];
  }
  return parsed;
}

// Process URLs in parallel batches of BATCH_SIZE to stay within rate limits
const BATCH_SIZE = 3;

async function processBatch(
  urls: string[],
  projectContext: string,
  taskHints: string[],
  anthropic: Anthropic,
): Promise<any[]> {
  const results: any[] = [];

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);

    // Fetch all pages in this batch in parallel
    const fetched = await Promise.all(batch.map(url => fetchUrl(url)));

    // Analyse all pages in this batch in parallel
    const analysed = await Promise.all(
      batch.map(async (url, idx) => {
        const f = fetched[idx];
        if (!f.content) {
          return { url, status: f.status, error: f.error, page_analysis: null, knowledge_fields: [] };
        }
        try {
          const analysis = await analysePage(url, f.content, projectContext, taskHints, anthropic);
          return { url, status: 200, page_analysis: analysis, knowledge_fields: analysis.knowledge_fields || [] };
        } catch (err: any) {
          return { url, status: f.status, error: `Analysis failed: ${err.message}`, page_analysis: null, knowledge_fields: [] };
        }
      })
    );

    results.push(...analysed);
    // No delay needed between batches at this rate — Anthropic handles it
  }

  return results;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { action } = req.body;
  const anthropic = new Anthropic();

  // ══ CRAWL MULTIPLE URLS ══════════════════════════════════════════════
  if (action === "crawl_urls") {
    const { urls, projectContext = "", taskHints = [] } = req.body;
    if (!Array.isArray(urls) || !urls.length) {
      return res.status(400).json({ error: "No URLs provided" });
    }

    const urlList = urls.slice(0, 10).map((u: string) =>
      u.trim().startsWith("http") ? u.trim() : `https://${u.trim()}`
    );

    try {
      const results = await processBatch(urlList, projectContext, taskHints as string[], anthropic);

      const aggregated: Record<string, any> = {};
      for (const r of results) {
        for (const kf of (r.knowledge_fields || [])) {
          aggregated[kf.key] = { ...kf, source_url: r.url };
        }
      }

      return res.status(200).json({
        success: true,
        urls_crawled: results.length,
        crawled_at: new Date().toISOString(),
        results,
        aggregated_knowledge: Object.values(aggregated),
        cross_page_issues: results.flatMap(r =>
          (r.page_analysis?.issues || []).map((i: any) => ({ ...i, url: r.url }))
        ),
        cross_page_opportunities: results.flatMap(r =>
          (r.page_analysis?.opportunities || []).map((o: any) => ({ ...o, url: r.url }))
        ),
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ══ COMPARE + MANAV ANALYSIS ═════════════════════════════════════════
  if (action === "compare_analysis") {
    const { crawlResults, projectContext = "", existingBlocks = [], taskHints = [] } = req.body;
    if (!crawlResults?.results?.length) {
      return res.status(400).json({ error: "No crawl results to analyse" });
    }

    const results = crawlResults.results as any[];

    const pageSummaries = results.map((r: any) => {
      const p = r.page_analysis;
      if (!p) return `URL: ${r.url}\nFailed: ${r.error || "no data"}\n`;
      return [
        `URL: ${r.url}`,
        `Title: "${p.title_tag}" (${p.title_length}ch) ${p.title_issues||""}`,
        `H1: "${p.h1}" ${p.h1_issues||""}`,
        `Meta: ${p.meta_description ? `"${p.meta_description}" (${p.meta_desc_length}ch)` : "MISSING"}`,
        `H2s: ${p.h2s?.join(" | ")||"none"}`,
        `Schema: ${p.schema_types?.join(", ")||"none"} (${p.structured_data_quality||"?"})`,
        `FAQs: ${p.faqs_detected?.length ? p.faqs_detected.slice(0,2).join(" | ") : "none"}`,
        `CTAs: ${p.cta_elements?.join(" | ")||"none"}`,
        `GEO: ${p.geo_readiness?.answer_format_quality||"?"} quality | Perplexity: ${p.geo_readiness?.perplexity_citation_likelihood||"?"}`,
        `Words: ${p.word_count} | Quality: ${p.content_quality} | Type: ${p.content_type}`,
        `Issues: ${p.issues?.map((i: any) => `[${i.severity}] ${i.detail}`).join(" | ")||"none"}`,
        `Opportunities: ${p.opportunities?.map((o: any) => o.action).join(" | ")||"none"}`,
        `Confidence: ${p.data_confidence} — ${p.confidence_reason}`,
      ].join("\n");
    }).join("\n\n---\n\n");

    const existingTitles = (existingBlocks as any[])
      .filter((b: any) => b.placed && b.status !== "done")
      .map((b: any) => `[${b.type}|W${b.week}] "${b.title}"`)
      .slice(0, 15).join("\n");

    const taskContext = (taskHints as string[]).length > 0
      ? `\nActive canvas tasks: ${(taskHints as string[]).slice(0, 6).join(" | ")}`
      : "";

    const prompt = [
      "You are Manav Brain. Comprehensive multi-page SEO comparison. Be specific, cite exact text.",
      `Project: ${projectContext}`,
      taskContext,
      "",
      "PAGES:",
      pageSummaries,
      "",
      existingTitles ? `CANVAS CARDS:\n${existingTitles}` : "",
      "",
      `Return ONLY valid JSON:
{
  "executive_summary": "2-3 sentences, specific observations",
  "overall_score": 0,
  "comparison_matrix": {
    "headers": ["Signal", "...URL labels"],
    "rows": [{"signal": "Title tag", "values": ["per URL status"], "verdict": "best|worst|mixed"}],
    "note": "Values array length must equal number of URLs"
  },
  "errors": [{"severity": "critical|high|medium|low", "issue": "issue", "affected_urls": ["url"], "fix": "exact fix", "quick_fix": true}],
  "opportunities": [{"rank": 1, "title": "title", "description": "what+why", "affected_urls": ["url"], "effort": "low|medium|high", "impact": "high|medium|low", "data_basis": "exact observation"}],
  "competitive_gaps": [{"gap": "what's missing", "evidence": "signals", "action": "step to close", "priority": "high|medium|low"}],
  "advantages": [{"advantage": "what's good", "urls": ["url"], "how_to_leverage": "suggestion"}],
  "geo_analysis": {
    "overall_geo_score": "0-100",
    "pages_ready_for_ai_citation": ["url"],
    "faq_opportunities": ["page/topic needing FAQ schema"],
    "direct_answer_gaps": ["questions pages should answer directly"],
    "entity_coverage": "assessment",
    "recommendations": ["specific GEO step in priority order"]
  },
  "confidence_boosters": [{"card_title": "existing card", "confidence_increase": "X% to Y%", "new_data_available": "what crawl found", "action": "how to use it"}],
  "card_proposals": [{"title": "max 8 words", "type": "technical|content|geo|quick-win|competitive|insight", "week": 1, "priority": "high|medium|low", "content": "actionable detail citing page data", "data_basis": "exact observation", "affected_urls": ["url"], "confidence": 0, "confidence_reason": "why", "merge_candidate": "exact existing card title or null", "merge_reason": "scope to add or null"}],
  "data_gaps": ["couldn't determine from pages alone"],
  "next_crawl_suggestions": ["URLs to crawl next"]
}

RULES: values arrays must match URL count. Quote exact page text. confidence 0-100.`,
    ].filter(Boolean).join("\n");

    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 5000,
        system: "You are Manav Brain. Return only valid JSON. Quote exact text from pages. Never invent.",
        messages: [{ role: "user", content: prompt }],
      });
      const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
      const f = raw.indexOf("{"), l = raw.lastIndexOf("}");
      let analysis: any = {};
      try { analysis = JSON.parse(raw.slice(f, l + 1)); } catch {
        try { analysis = JSON.parse(raw.slice(f) + "}"); } catch {}
      }
      return res.status(200).json({ success: true, analysis });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ══ PREVIEW URL ══════════════════════════════════════════════════════
  if (action === "preview_url") {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });
    const clean = url.startsWith("http") ? url : `https://${url}`;
    const f = await fetchUrl(clean);
    return res.status(200).json({
      success: f.status === 200, status: f.status,
      error: f.error, preview: f.content.slice(0, 300), chars: f.content.length,
    });
  }

  return res.status(400).json({ error: "Unknown action" });
}
