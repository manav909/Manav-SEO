import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 300 };

const SYSTEM = "You are Manav Brain. Extract every observable SEO and content signal from the live page. Quote exact text. Only state facts visible in the content — never invent. If something is absent, say 'Not found'.";

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

async function fetchUrl(url: string, ms = 12000): Promise<{ content: string; status: number; error?: string }> {
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "10" },
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) return { content: "", status: r.status, error: `HTTP ${r.status}` };
    return { content: (await r.text()).slice(0, 14000), status: 200 };
  } catch (e: any) {
    return { content: "", status: 0, error: e.message };
  }
}

// ── Deep per-page extraction schema — everything Manav Brain needs ──
const PAGE_SCHEMA = {
  // On-page fundamentals
  title_tag: "exact title tag text",
  title_length: 0,
  title_issues: "Too long|Too short|Missing keyword|Duplicate|OK",
  meta_description: "exact meta description text",
  meta_desc_length: 0,
  meta_desc_issues: "Missing|Too long|Not compelling|OK",
  h1: "exact H1 text or 'Not found'",
  h1_issues: "Missing|Multiple|Too generic|OK",
  h2s: ["exact H2 texts up to 6"],
  h3s: ["exact H3 texts up to 4"],
  canonical_url: "canonical href or 'Self-referencing'|'Missing'|'Points elsewhere'",
  // Content signals
  word_count: 0,
  content_quality: "high|medium|low",
  reading_level: "technical|intermediate|beginner — based on vocabulary",
  content_type: "landing_page|blog|product|service|home|about|other",
  primary_topic: "main topic of this page in 5 words",
  keyword_presence: ["keywords found in H1/H2/first 200 words"],
  lsi_terms: ["related terms and entities present in content"],
  faqs_detected: ["FAQ questions visible on page — exact text"],
  cta_elements: ["CTAs visible: exact button/link text"],
  brand_mentions: ["brand names mentioned beyond site owner"],
  trust_signals: ["testimonials|certifications|awards|social proof — what is present"],
  // Technical signals
  schema_types: ["all JSON-LD @type values found"],
  schema_details: { "SchemaType": "brief description of what the schema covers" },
  internal_links: 0,
  external_links: 0,
  images_total: 0,
  images_no_alt: 0,
  images_with_alt: 0,
  has_sitemap_link: false,
  has_robots_meta: "index,follow|noindex|not visible",
  has_og_tags: false,
  has_twitter_card: false,
  structured_data_quality: "comprehensive|partial|minimal|none",
  // GEO / AI visibility signals
  geo_readiness: {
    has_direct_answer_format: false,
    has_faq_schema: false,
    has_howto_schema: false,
    has_entity_definitions: false,
    answer_format_quality: "high|medium|low|none — how well content answers questions directly",
    perplexity_citation_likelihood: "high|medium|low — based on content structure",
  },
  // Page speed observable signals
  speed_signals: ["lazy loading|minified CSS|minified JS|large unoptimised images|render blocking — what is observable"],
  mobile_signals: ["responsive meta viewport|mobile-friendly layout signals — what is observable"],
  // Competitive intelligence from page
  competitor_features: ["features/sections this page has that competitor pages typically lack"],
  content_gaps_vs_page: ["topics mentioned but not covered in depth"],
  // Issues and opportunities
  issues: [{ type: "issue_type", severity: "critical|high|medium|low", detail: "specific text observed", fix: "exact fix" }],
  opportunities: [{ action: "specific actionable step", impact: "expected SEO/conversion impact", effort: "low|medium|high", evidence: "what on the page indicates this" }],
  // Confidence assessment
  data_confidence: "high|medium|low",
  confidence_reason: "why confidence is high/medium/low for this page",
  // Knowledge fields mappable to Data Room
  knowledge_fields: [{ category: "analytics|technical|competitor|goal|cms", key: "EXACT_VALID_KEY", value: "exact value" }],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { action } = req.body;
  const anthropic = new Anthropic();

  // ══ CRAWL MULTIPLE URLS ══════════════════════════════════════════════
  if (action === "crawl_urls") {
    const { urls, projectContext = "", taskHints = [] } = req.body;
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

      // Build task-focused extraction hints if canvas cards were passed
      const taskContext = (taskHints as string[]).length > 0
        ? `\nFocus especially on signals relevant to these canvas tasks:\n${(taskHints as string[]).slice(0, 5).join("\n")}`
        : "";

      const prompt = [
        `Deep SEO analysis of this live page. Extract every observable signal.`,
        `URL: ${url}`,
        `Project context: ${projectContext}`,
        taskContext,
        "",
        "PAGE CONTENT (fetched live now):",
        fetched.content,
        "",
        "Extract everything observable. Quote exact text — do not paraphrase titles, H1s, CTAs.",
        "For missing elements, say exactly 'Not found' or 'Not visible'.",
        "",
        "Return ONLY valid JSON:",
        JSON.stringify(PAGE_SCHEMA),
        "",
        "knowledge_fields valid keys only:",
        "technical: schema_markup, robots_txt, sitemap_url, canonical_issues, crawl_errors, broken_links, duplicate_content",
        "cms: cms, seo_plugin, pagespeed_mobile, pagespeed_desktop",
        "analytics: top_landing_pages",
        "goal: target_keywords",
      ].join("\n");

      try {
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-5", max_tokens: 2500,
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
      crawled_at: new Date().toISOString(),
      results,
      aggregated_knowledge: Object.values(aggregated),
      cross_page_issues: results.flatMap(r => (r.page_analysis?.issues || []).map((i: any) => ({ ...i, url: r.url }))),
      cross_page_opportunities: results.flatMap(r => (r.page_analysis?.opportunities || []).map((o: any) => ({ ...o, url: r.url }))),
    });
  }

  // ══ COMPARE + MANAV ANALYSIS ═════════════════════════════════════════
  if (action === "compare_analysis") {
    const { crawlResults, projectContext = "", existingBlocks = [], taskHints = [] } = req.body;
    if (!crawlResults?.results?.length) return res.status(400).json({ error: "No crawl results to analyse" });

    const results = crawlResults.results as any[];

    const pageSummaries = results.map((r: any) => {
      const p = r.page_analysis;
      if (!p) return `URL: ${r.url}\nStatus: ${r.error || "failed"}\n`;
      return [
        `URL: ${r.url}`,
        `Title: "${p.title_tag}" (${p.title_length}ch) — ${p.title_issues || ""}`,
        `H1: "${p.h1}" — ${p.h1_issues || ""}`,
        `Meta: ${p.meta_description ? `"${p.meta_description}" (${p.meta_desc_length}ch)` : "MISSING"}`,
        `H2s: ${p.h2s?.join(" | ") || "none"}`,
        `Schema: ${p.schema_types?.join(", ") || "none"} | Quality: ${p.structured_data_quality || "unknown"}`,
        `FAQs: ${p.faqs_detected?.length ? p.faqs_detected.slice(0,2).join(" | ") : "none detected"}`,
        `CTAs: ${p.cta_elements?.join(" | ") || "none"}`,
        `GEO readiness: ${p.geo_readiness?.answer_format_quality || "?"} | Perplexity likelihood: ${p.geo_readiness?.perplexity_citation_likelihood || "?"}`,
        `Words: ${p.word_count} | Quality: ${p.content_quality} | Type: ${p.content_type}`,
        `Keywords: ${p.keyword_presence?.join(", ") || "none"}`,
        `Issues: ${p.issues?.map((i: any) => `[${i.severity}] ${i.detail}`).join(" | ") || "none"}`,
        `Opportunities: ${p.opportunities?.map((o: any) => o.action).join(" | ") || "none"}`,
        `Confidence: ${p.data_confidence} — ${p.confidence_reason}`,
      ].join("\n");
    }).join("\n\n---\n\n");

    const existingTitles = (existingBlocks as any[])
      .map((b: any) => `[${b.type}|W${b.week}|${b.priority}|conf:${b.confidence||"?"}%] "${b.title}" — ${(b.content || "").slice(0, 80)}`)
      .slice(0, 20).join("\n");

    const taskContext = (taskHints as string[]).length > 0
      ? `\nACTIVE CANVAS TASKS NEEDING DATA:\n${(taskHints as string[]).slice(0, 8).join("\n")}\nFor each card proposal, assess how the crawled data boosts its execution confidence.`
      : "";

    const prompt = [
      "You are Manav Brain. Perform a comprehensive multi-page SEO comparison. Be specific, cite exact text.",
      `Project: ${projectContext}`,
      taskContext,
      "",
      "CRAWLED PAGE DATA:",
      pageSummaries,
      "",
      existingTitles ? `EXISTING CANVAS CARDS:\n${existingTitles}` : "",
      "",
      "Return ONLY valid JSON:",
      JSON.stringify({
        executive_summary: "2-3 sentences: honest SEO health assessment with specific observations",
        overall_score: 0,
        confidence_data_available: "high|medium|low — how much data we have to work with",
        comparison_matrix: {
          headers: ["Signal", "...URL labels"],
          rows: [
            { signal: "Title tag", values: ["status per page"], verdict: "best|worst|mixed" },
            { signal: "H1", values: [], verdict: "" },
            { signal: "Meta description", values: [], verdict: "" },
            { signal: "Schema markup", values: [], verdict: "" },
            { signal: "FAQ / Direct answers", values: [], verdict: "" },
            { signal: "GEO readiness", values: [], verdict: "" },
            { signal: "Word count", values: [], verdict: "" },
            { signal: "CTAs present", values: [], verdict: "" },
            { signal: "Internal links", values: [], verdict: "" },
            { signal: "Images alt text", values: [], verdict: "" },
          ],
          note: "Add rows for all other signals found. Values array length must equal number of URLs.",
        },
        errors: [
          { severity: "critical|high|medium|low", issue: "issue", affected_urls: ["url"], fix: "exact fix", quick_fix: true }
        ],
        opportunities: [
          { rank: 1, title: "title", description: "what+why", affected_urls: ["url"], effort: "low|medium|high", impact: "high|medium|low", data_basis: "cite exact observation" }
        ],
        competitive_gaps: [
          { gap: "what's missing", evidence: "what signals show this", action: "step to close gap", priority: "high|medium|low" }
        ],
        advantages: [
          { advantage: "what's done well", urls: ["url"], how_to_leverage: "specific suggestion" }
        ],
        geo_analysis: {
          overall_geo_score: "0-100",
          pages_ready_for_ai_citation: ["url"],
          faq_opportunities: ["page/topic that should have FAQ schema"],
          direct_answer_gaps: ["questions these pages should answer directly but don't"],
          entity_coverage: "assessment of brand entity presence",
          recommendations: ["specific GEO improvement in priority order"],
        },
        confidence_boosters: [
          {
            card_title: "existing card title this data helps",
            confidence_increase: "from X% to Y%",
            new_data_available: "specific data now available from crawl",
            action: "how to use this data to improve the card",
          }
        ],
        card_proposals: [
          {
            title: "Short title max 8 words",
            type: "technical|content|geo|quick-win|competitive|insight",
            week: 1,
            priority: "high|medium|low",
            content: "Full actionable detail citing specific page observations",
            data_basis: "exact crawl observation: quoted text from title/H1/etc",
            affected_urls: ["url"],
            confidence: 0,
            confidence_reason: "why this confidence level based on data available",
            merge_candidate: "exact title of existing card if overlap, or null",
            merge_reason: "what scope to add, or null",
          }
        ],
        data_gaps: ["what couldn't be determined from live pages alone"],
        next_crawl_suggestions: ["specific URLs or page types to crawl next to fill gaps"],
      }),
      "",
      "RULES:",
      "- comparison_matrix values arrays must have exactly the same length as URLs crawled",
      "- card_proposals confidence must be 0-100 based on evidence quality",
      "- quote exact page text as data_basis — never invent",
      "- confidence_boosters: for every existing card where this crawl data improves execution confidence",
      "- geo_analysis: required even if just noting gaps",
    ].filter(Boolean).join("\n");

    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-5", max_tokens: 5000,
        system: "You are Manav Brain. Return only valid JSON. Quote exact text from page content. Never invent.",
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
    const f = await fetchUrl(clean, 8000);
    return res.status(200).json({ success: f.status === 200, status: f.status, error: f.error, preview: f.content.slice(0, 300), chars: f.content.length });
  }

  return res.status(400).json({ error: "Unknown action" });
}
