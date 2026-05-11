import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 300 };

const SYSTEM = "You are Manav Brain. Extract SEO signals from live page HTML. Quote exact text you see. State Not found for absent elements. Return only valid JSON.";

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

const COMPACT_SCHEMA = `Return ONLY valid JSON:
{
  "title_tag":"exact title element text","title_length":0,"title_issues":"OK|Too long|Too short|Missing keyword|Duplicate",
  "meta_description":"exact content attr of meta description tag","meta_desc_length":0,"meta_desc_issues":"OK|Missing|Too long|Not compelling",
  "h1":"exact H1 text or Not found","h1_issues":"OK|Missing|Multiple|Too generic",
  "h2s":["up to 5 H2 texts"],"h3s":["up to 3 H3 texts"],
  "canonical_url":"exact canonical href or Missing",
  "word_count":0,"content_quality":"high|medium|low",
  "content_type":"landing_page|blog|product|service|home|about|other",
  "primary_topic":"main topic in 5 words","reading_level":"technical|intermediate|beginner",
  "keyword_presence":["keywords in H1/H2/first paragraph"],"lsi_terms":["related entities present"],
  "schema_types":["JSON-LD @type values found in script tags"],"structured_data_quality":"comprehensive|partial|minimal|none",
  "internal_links":0,"external_links":0,"images_total":0,"images_no_alt":0,
  "has_og_tags":false,"has_twitter_card":false,"has_robots_meta":"index,follow|noindex|not visible",
  "faqs_detected":["FAQ questions visible on page"],"cta_elements":["exact CTA button/link text"],
  "trust_signals":["testimonials|certifications|awards present"],
  "geo_readiness":{
    "has_faq_schema":false,"has_howto_schema":false,
    "answer_format_quality":"high|medium|low|none","perplexity_citation_likelihood":"high|medium|low"
  },
  "issues":[{"type":"type","severity":"critical|high|medium|low","detail":"specific text observed","fix":"exact fix"}],
  "opportunities":[{"action":"specific step","impact":"SEO/conversion impact","effort":"low|medium|high","evidence":"what in HTML shows this"}],
  "data_confidence":"high|medium|low","confidence_reason":"why",
  "knowledge_fields":[{"category":"technical|cms|analytics|goal","key":"VALID_KEY","value":"exact value"}]
}
Valid knowledge_fields keys: schema_markup, robots_txt, sitemap_url, canonical_issues, crawl_errors, broken_links, cms, seo_plugin, pagespeed_mobile, pagespeed_desktop, top_landing_pages, target_keywords`;

// Direct HTTP fetch — no Jina dependency, no IP restrictions.
// Jina AI blocks Vercel serverless IPs. Direct fetch has no such restriction.
// Claude reads raw HTML natively and extracts all SEO signals from the markup.
async function fetchUrl(url: string): Promise<{ content: string; status: number; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0; +https://seoseason.com)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
      },
    });
    clearTimeout(timer);
    if (!r.ok) return { content: "", status: r.status, error: `HTTP ${r.status}` };
    const html = await r.text();
    // 12000 chars covers full <head> (all meta/schema/canonical) + first ~600 body words
    return { content: html.slice(0, 12000), status: 200 };
  } catch (e: any) {
    clearTimeout(timer);
    const msg: string = e.message || "";
    if (msg.includes("abort") || msg.includes("timeout")) return { content: "", status: 0, error: "Timeout — page took over 10s" };
    if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) return { content: "", status: 0, error: "Domain not found" };
    return { content: "", status: 0, error: msg.slice(0, 100) };
  }
}

async function analysePage(
  url: string,
  htmlContent: string,
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
    "RAW HTML (extract all SEO signals from this markup):",
    htmlContent,
    "",
    "Read the HTML directly. Extract: <title>, <meta name=description>, <h1-h3>, <link rel=canonical>, JSON-LD schema in <script> tags, <meta property=og:*>, href counts, img alt attributes, button/CTA text, FAQ sections.",
    "Quote exact text as it appears in the HTML. Not found for absent elements.",
    "",
    COMPACT_SCHEMA,
  ].filter(Boolean).join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  if (msg.stop_reason === "max_tokens") {
    console.warn(`[crawl] analysePage hit max_tokens for ${url}`);
  }

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
    const fetched = await Promise.all(batch.map(url => fetchUrl(url)));
    const analysed = await Promise.all(
      batch.map(async (url, idx) => {
        const f = fetched[idx];
        if (!f.content) {
          return { url, status: f.status, error: f.error || "Could not fetch page", page_analysis: null, knowledge_fields: [] };
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
  }
  return results;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { action } = req.body;
  const anthropic = new Anthropic();

  if (action === "crawl_urls") {
    const { urls, projectContext = "", taskHints = [] } = req.body;
    if (!Array.isArray(urls) || !urls.length) return res.status(400).json({ error: "No URLs provided" });
    const urlList = urls.slice(0, 10).map((u: string) => u.trim().startsWith("http") ? u.trim() : `https://${u.trim()}`);
    try {
      const results = await processBatch(urlList, projectContext, taskHints as string[], anthropic);
      const aggregated: Record<string, any> = {};
      for (const r of results) for (const kf of (r.knowledge_fields || [])) aggregated[kf.key] = { ...kf, source_url: r.url };
      return res.status(200).json({
        success: true,
        urls_crawled: results.length,
        crawled_at: new Date().toISOString(),
        results,
        aggregated_knowledge: Object.values(aggregated),
        cross_page_issues: results.flatMap(r => (r.page_analysis?.issues || []).map((i: any) => ({ ...i, url: r.url }))),
        cross_page_opportunities: results.flatMap(r => (r.page_analysis?.opportunities || []).map((o: any) => ({ ...o, url: r.url }))),
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (action === "compare_analysis") {
    const { crawlResults, projectContext = "", existingBlocks = [], taskHints = [], compareCriteria = [] } = req.body;
    if (!crawlResults?.results?.length) return res.status(400).json({ error: "No crawl results" });
    const results = crawlResults.results as any[];
    const pageSummaries = results.map((r: any) => {
      const p = r.page_analysis;
      if (!p) return `URL: ${r.url}\nFailed: ${r.error || "no data"}\n`;
      return [`URL: ${r.url}`,`Title: "${p.title_tag}" (${p.title_length}ch) ${p.title_issues||""}`,`H1: "${p.h1}" ${p.h1_issues||""}`,`Meta: ${p.meta_description?`"${p.meta_description}" (${p.meta_desc_length}ch)`:"MISSING"}`,`H2s: ${p.h2s?.join(" | ")||"none"}`,`Schema: ${p.schema_types?.join(", ")||"none"} (${p.structured_data_quality||"?"})`,`FAQs: ${p.faqs_detected?.length?p.faqs_detected.slice(0,2).join(" | "):"none"}`,`CTAs: ${p.cta_elements?.join(" | ")||"none"}`,`GEO: ${p.geo_readiness?.answer_format_quality||"?"} | Perplexity: ${p.geo_readiness?.perplexity_citation_likelihood||"?"}`,`Words: ${p.word_count} | Quality: ${p.content_quality}`,`Issues: ${p.issues?.map((i:any)=>`[${i.severity}] ${i.detail}`).join(" | ")||"none"}`,`Opportunities: ${p.opportunities?.map((o:any)=>o.action).join(" | ")||"none"}`,`Confidence: ${p.data_confidence}`].join("\n");
    }).join("\n\n---\n\n");
    const existingTitles = (existingBlocks as any[]).filter((b:any)=>b.placed&&b.status!=="done").map((b:any)=>`[${b.type}|W${b.week}] "${b.title}"`).slice(0,15).join("\n");
    const criteriaContext = (compareCriteria as string[]).length > 0
      ? `\nFocus the comparison SPECIFICALLY on these criteria (in this priority order):\n${(compareCriteria as string[]).map((c:string, i:number) => `${i+1}. ${c.replace(/_/g,' ')}`).join('\n')}\nFor each criterion: show current state per page, what the gap is, and the exact action to fix it.`
      : "";
    const taskContext = (taskHints as string[]).length>0?`\nActive canvas tasks: ${(taskHints as string[]).slice(0,6).join(" | ")}`:"";
    const prompt = ["You are Manav Brain. Comprehensive multi-page SEO comparison.",`Project: ${projectContext}`,criteriaContext,taskContext,"","PAGES:",pageSummaries,"",existingTitles?`CANVAS CARDS:\n${existingTitles}`:"","",`Return ONLY valid JSON:\n{\n  "executive_summary":"2-3 sentences",\n  "overall_score":0,\n  "comparison_matrix":{"headers":["Signal","...URL labels"],"rows":[{"signal":"Title","values":["per URL"],"verdict":"best|worst|mixed"}],"note":"Values length=URL count"},\n  "errors":[{"severity":"critical|high|medium|low","issue":"issue","affected_urls":["url"],"fix":"fix","quick_fix":true}],\n  "opportunities":[{"rank":1,"title":"title","description":"what+why","affected_urls":["url"],"effort":"low|medium|high","impact":"high|medium|low","data_basis":"observation"}],\n  "competitive_gaps":[{"gap":"missing","evidence":"signals","action":"step","priority":"high|medium|low"}],\n  "advantages":[{"advantage":"good","urls":["url"],"how_to_leverage":"suggestion"}],\n  "geo_analysis":{"overall_geo_score":"0-100","pages_ready_for_ai_citation":["url"],"faq_opportunities":["page"],"direct_answer_gaps":["question"],"entity_coverage":"assessment","recommendations":["step"]},\n  "confidence_boosters":[{"card_title":"card","confidence_increase":"X to Y%","new_data_available":"data","action":"how"}],\n  "card_proposals":[{"title":"max 8 words","type":"technical|content|geo|quick-win|competitive|insight","week":1,"priority":"high|medium|low","content":"detail","data_basis":"observation","affected_urls":["url"],"confidence":0,"confidence_reason":"why","merge_candidate":null,"merge_reason":null}],\n  "data_gaps":["unknown"],"next_crawl_suggestions":["url"]\n}`].filter(Boolean).join("\n");
    try {
      const msg = await anthropic.messages.create({ model:"claude-sonnet-4-5", max_tokens:5000, system:"You are Manav Brain. Return only valid JSON.", messages:[{role:"user",content:prompt}] });
      const raw = msg.content[0].type==="text"?msg.content[0].text:"{}";
      const f=raw.indexOf("{"),l=raw.lastIndexOf("}");
      let analysis:any={};
      try{analysis=JSON.parse(raw.slice(f,l+1));}catch{try{analysis=JSON.parse(raw.slice(f)+"}");}catch{}}
      return res.status(200).json({success:true,analysis});
    } catch(err:any){return res.status(500).json({success:false,error:err.message});}
  }

  if (action === "preview_url") {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });
    const clean = url.startsWith("http") ? url : `https://${url}`;
    const f = await fetchUrl(clean);
    return res.status(200).json({
      success: f.status === 200, status: f.status, error: f.error,
      preview: f.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300),
      chars: f.content.length,
    });
  }

  return res.status(400).json({ error: "Unknown action" });
}
