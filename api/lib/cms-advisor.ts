/* ════════════════════════════════════════════════════════════════
   api/lib/cms-advisor.ts

   BUILD 12.27 — CMS-platform advisory engine (general + extensible).

   Built to handle many platforms and many check types, not one example.
   It (1) detects the platform from real crawl signatures, then (2) runs a
   rule registry — UNIVERSAL rules that apply to every site plus
   PLATFORM-specific rule sets — against actually-crawled page conditions.
   Adding a platform or a rule is a data addition to a registry, not an
   engine change, so coverage scales without rewrites.

   Honesty (the governing constraint):
   - Every finding cites what was OBSERVED on a crawled page. Nothing is
     assumed about a platform's internals.
   - Where a best-practice rule cannot be verified from a crawl (theme/
     liquid internals, app configuration, Core Web Vitals field data,
     JS-only rendered content), it is emitted as an ADVISORY item marked
     not-crawl-verifiable — never a fabricated finding.
   - Platform detection returns a confidence and the signals behind it.

   Cost: a capped set of crawled pages (homepage + sampled internals).
   Multi-tenant: projectId (site URL resolved from project data).
════════════════════════════════════════════════════════════════ */

import { fetchHtml, resolveTargetUrls } from "./workspace/shared.js";
import { extractPagePattern } from "./geo-citation-gap.js";

export type Platform =
  | "shopify" | "woocommerce" | "wordpress" | "wix" | "squarespace"
  | "webflow" | "magento" | "bigcommerce" | "drupal" | "joomla" | "custom" | "unknown";
export type Severity = "critical" | "high" | "medium" | "low" | "advisory";

export interface PageSignals {
  url: string;
  ok: boolean;
  title: string;
  title_len: number;
  meta_description: string;
  h1_count: number;
  canonical: string | null;
  robots_noindex: boolean;
  has_viewport: boolean;
  lang: string | null;
  generator: string | null;
  schema_types: string[];
  hreflang_count: number;
  internal_links: string[];
  mixed_content: boolean;
  word_count: number;
  raw_lc: string;        // lowercased html (capped) for signature/idiom checks
}

export interface CmsFinding {
  id:                string;
  title:             string;
  severity:          Severity;
  observed:          string;     // what was actually seen
  recommendation:    string;
  platform_specific: boolean;
  crawl_verified:    boolean;    // false => advisory, needs manual verification
  url?:              string;
}

export interface CmsAdvisorReport {
  project_domain:     string;
  generated_at:       string;
  detected_platform:  Platform;
  platform_confidence:number;     // 0-100
  platform_signals:   string[];
  pages_examined:     string[];
  findings:           CmsFinding[];
  summary:            string;
  limits:             string[];
}

const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const originOf = (u: string) => { try { const x = new URL(u); return `${x.protocol}//${x.host}`; } catch { return ""; } };
const attr = (html: string, re: RegExp): string | null => { const m = html.match(re); return m ? (m[1] || "").trim() : null; };

/* ─── signal extraction (all from real crawled HTML) ──────────── */
function extractSignals(url: string, html: string): PageSignals {
  const ok = !!html && html.length > 50;
  const lc = (html || "").toLowerCase();
  const pat = extractPagePattern(url, html || null);
  const title = attr(html || "", /<title[^>]*>([\s\S]*?)<\/title>/i) || "";
  const canonical = attr(html || "", /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const robotsMeta = (attr(html || "", /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i) || "").toLowerCase();
  const origin = originOf(url);
  const links = Array.from((html || "").matchAll(/<a[^>]+href=["']([^"']+)["']/gi)).map(m => m[1])
    .map(h => { try { return new URL(h, origin).toString(); } catch { return ""; } })
    .filter(h => h && domainOf(h) === domainOf(url));
  return {
    url, ok,
    title, title_len: title.length,
    meta_description: attr(html || "", /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || "",
    h1_count: (lc.match(/<h1[\s>]/g) || []).length,
    canonical,
    robots_noindex: /noindex/.test(robotsMeta),
    has_viewport: /<meta[^>]+name=["']viewport["']/i.test(html || ""),
    lang: attr(html || "", /<html[^>]+lang=["']([^"']+)["']/i),
    generator: attr(html || "", /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i),
    schema_types: pat.schema_types || [],
    hreflang_count: (html || "").match(/rel=["']alternate["'][^>]+hreflang=/gi)?.length || 0,
    internal_links: Array.from(new Set(links)).slice(0, 200),
    mixed_content: /^https:/i.test(url) && /(src|href)=["']http:\/\//i.test(html || ""),
    word_count: pat.total_word_count || 0,
    raw_lc: lc.slice(0, 200000),
  };
}

/* ─── platform detection (extensible signature registry) ──────── */
const PLATFORM_SIGNATURES: Array<{ platform: Platform; tests: Array<{ re: RegExp; label: string }> }> = [
  { platform: "shopify", tests: [
    { re: /cdn\.shopify\.com|\/cdn\/shop\//i, label: "Shopify CDN" },
    { re: /shopify\.theme|window\.shopify|x-shopify/i, label: "Shopify JS/theme global" },
  ] },
  { platform: "woocommerce", tests: [
    { re: /woocommerce/i, label: "WooCommerce markup/class" },
    { re: /wp-content\/plugins\/woocommerce/i, label: "WooCommerce plugin path" },
  ] },
  { platform: "wordpress", tests: [
    { re: /wp-content|wp-includes|wp-json/i, label: "WordPress paths" },
    { re: /<meta[^>]+name=["']generator["'][^>]+wordpress/i, label: "WordPress generator meta" },
  ] },
  { platform: "wix", tests: [
    { re: /static\.wixstatic\.com|wix\.com|_wixCssStates/i, label: "Wix static/host" },
  ] },
  { platform: "squarespace", tests: [
    { re: /squarespace\.com|static\.squarespace|sqs-/i, label: "Squarespace assets" },
  ] },
  { platform: "webflow", tests: [
    { re: /webflow\.io|data-wf-page|data-wf-site|assets\.website-files\.com/i, label: "Webflow attributes/host" },
  ] },
  { platform: "magento", tests: [
    { re: /\/static\/version|mage\/|magento/i, label: "Magento static/JS" },
  ] },
  { platform: "bigcommerce", tests: [
    { re: /cdn\d*\.bigcommerce\.com|bigcommerce/i, label: "BigCommerce CDN" },
  ] },
  { platform: "drupal", tests: [
    { re: /drupal\.settings|\/sites\/default\/|drupal-/i, label: "Drupal paths/JS" },
  ] },
  { platform: "joomla", tests: [
    { re: /\/media\/jui\/|joomla|com_content/i, label: "Joomla paths" },
  ] },
];

function detectPlatform(homepage: PageSignals): { platform: Platform; confidence: number; signals: string[] } {
  const hay = homepage.raw_lc + " " + (homepage.generator || "").toLowerCase();
  const hits: Array<{ platform: Platform; signals: string[] }> = [];
  for (const sig of PLATFORM_SIGNATURES) {
    const matched = sig.tests.filter(t => t.re.test(hay)).map(t => t.label);
    if (matched.length) hits.push({ platform: sig.platform, signals: matched });
  }
  if (hits.length === 0) {
    /* Distinguish a built site with no recognised CMS from a failed crawl. */
    return { platform: homepage.ok ? "custom" : "unknown", confidence: homepage.ok ? 40 : 0, signals: homepage.ok ? ["No known CMS signature found"] : ["Homepage could not be crawled"] };
  }
  /* WooCommerce implies WordPress; prefer the more specific. */
  hits.sort((a, b) => b.signals.length - a.signals.length);
  const best = hits[0];
  const confidence = Math.min(95, 50 + best.signals.length * 20 + (hits.length === 1 ? 10 : 0));
  return { platform: best.platform, confidence, signals: best.signals };
}

/* ─── rule registry ───────────────────────────────────────────── */
interface RuleCtx { root: string; platform: Platform; pages: PageSignals[]; homepage: PageSignals; productLike: PageSignals | null; }
interface Rule { id: string; evaluate: (ctx: RuleCtx) => CmsFinding[]; }

const f = (o: Omit<CmsFinding, "platform_specific" | "crawl_verified"> & { platform_specific?: boolean; crawl_verified?: boolean }): CmsFinding =>
  ({ platform_specific: false, crawl_verified: true, ...o });

const UNIVERSAL_RULES: Rule[] = [
  { id: "canonical", evaluate: ({ pages }) => pages.filter(p => p.ok && !p.canonical).map(p => f({ id: "missing_canonical", title: "Missing canonical tag", severity: "medium", observed: `No rel=canonical on ${p.url}`, recommendation: "Add a self-referencing canonical to every indexable page to consolidate signals and prevent duplicate-URL dilution.", url: p.url })) },
  { id: "noindex", evaluate: ({ pages }) => pages.filter(p => p.ok && p.robots_noindex).map(p => f({ id: "noindex_present", title: "Page set to noindex", severity: "high", observed: `meta robots noindex on ${p.url}`, recommendation: "Confirm this is intentional. If the page should rank, remove noindex.", url: p.url })) },
  { id: "h1", evaluate: ({ pages }) => pages.filter(p => p.ok && p.h1_count !== 1).map(p => f({ id: "h1_count", title: p.h1_count === 0 ? "No H1 heading" : "Multiple H1 headings", severity: p.h1_count === 0 ? "high" : "low", observed: `${p.h1_count} H1(s) on ${p.url}`, recommendation: p.h1_count === 0 ? "Add one descriptive, keyword-relevant H1 stating the page topic." : "Reduce to a single H1; demote the rest to H2/H3.", url: p.url })) },
  { id: "meta_desc", evaluate: ({ pages }) => pages.filter(p => p.ok && !p.meta_description).map(p => f({ id: "missing_meta_description", title: "Missing meta description", severity: "low", observed: `No meta description on ${p.url}`, recommendation: "Write an intent-matched meta description to improve CTR (it does not affect ranking directly).", url: p.url })) },
  { id: "title_len", evaluate: ({ pages }) => pages.filter(p => p.ok && (p.title_len === 0 || p.title_len > 65)).map(p => f({ id: "title_length", title: p.title_len === 0 ? "Missing title tag" : "Title tag likely truncated", severity: p.title_len === 0 ? "high" : "low", observed: `Title length ${p.title_len} on ${p.url}`, recommendation: p.title_len === 0 ? "Add a unique, descriptive title tag." : "Keep titles roughly under 60 characters so they do not truncate in results.", url: p.url })) },
  { id: "viewport", evaluate: ({ homepage }) => homepage.ok && !homepage.has_viewport ? [f({ id: "missing_viewport", title: "No mobile viewport meta", severity: "medium", observed: `No viewport meta on ${homepage.url}`, recommendation: "Add a responsive viewport meta tag for mobile usability.", url: homepage.url })] : [] },
  { id: "lang", evaluate: ({ homepage }) => homepage.ok && !homepage.lang ? [f({ id: "missing_lang", title: "No html lang attribute", severity: "low", observed: `No lang on <html> at ${homepage.url}`, recommendation: "Set <html lang> for accessibility and language signalling.", url: homepage.url })] : [] },
  { id: "schema", evaluate: ({ pages }) => { const none = pages.filter(p => p.ok && p.schema_types.length === 0); return none.length === pages.filter(p => p.ok).length && none.length > 0 ? [f({ id: "no_structured_data", title: "No structured data found", severity: "medium", observed: `No ld+json schema on any crawled page (${none.length} checked)`, recommendation: "Add relevant schema (Organization sitewide; Product/Article/FAQ per page type) to help Google and AI engines understand the content." })] : [] } },
  { id: "mixed", evaluate: ({ pages }) => pages.filter(p => p.ok && p.mixed_content).map(p => f({ id: "mixed_content", title: "Mixed content (http resources on https page)", severity: "medium", observed: `http:// resource references on ${p.url}`, recommendation: "Serve all resources over https to avoid security warnings and blocked assets.", url: p.url })) },
];

const PLATFORM_RULES: Partial<Record<Platform, Rule[]>> = {
  shopify: [
    { id: "shopify_collection_canonical", evaluate: ({ productLike }) => {
      if (!productLike) return [f({ id: "shopify_collection_canonical", title: "Shopify collection-path duplication — verify", severity: "advisory", observed: "Could not sample a product page to check canonicalization.", recommendation: "Shopify exposes products under both /products/x and /collections/y/products/x. Confirm canonicals point to the clean /products/x URL.", platform_specific: true, crawl_verified: false })];
      const onClean = /\/products\//.test(productLike.canonical || "");
      const dupPath = /\/collections\/[^/]+\/products\//.test(productLike.url);
      return (dupPath || !onClean)
        ? [f({ id: "shopify_collection_canonical", title: "Shopify product canonical may not be consolidated", severity: "medium", observed: `Product URL ${productLike.url} canonical = ${productLike.canonical || "none"}`, recommendation: "Ensure products under /collections/*/products/* canonicalize to the clean /products/* URL to avoid duplicate-URL dilution.", platform_specific: true, url: productLike.url })]
        : [];
    } },
    { id: "shopify_default_title", evaluate: ({ homepage }) => /&ndash;|\s–\s/.test(homepage.title) && /shopify/i.test(homepage.raw_lc) ? [f({ id: "shopify_default_title", title: "Possible default Shopify title pattern", severity: "low", observed: `Homepage title: "${homepage.title.slice(0, 80)}"`, recommendation: "Make sure titles are intentionally written, not left as the theme default (store name – tagline).", platform_specific: true, url: homepage.url })] : [] },
  ],
  wordpress: [
    { id: "wp_default_permalinks", evaluate: ({ homepage }) => /[?&]p=\d+/.test(homepage.internal_links.join(" ")) ? [f({ id: "wp_default_permalinks", title: "Default (?p=) permalinks detected", severity: "high", observed: "Internal links using ?p=ID query-string permalinks.", recommendation: "Switch to a descriptive permalink structure (post name) — query-string URLs are weak for SEO.", platform_specific: true })] : [] },
  ],
  woocommerce: [
    { id: "woo_product_schema", evaluate: ({ productLike }) => productLike && !productLike.schema_types.some(t => /product/i.test(t)) ? [f({ id: "woo_product_schema", title: "Product schema missing on a product page", severity: "high", observed: `No Product schema on ${productLike.url}`, recommendation: "Ensure Product (and Offer/AggregateRating where valid) schema is output on PDPs — usually via the SEO plugin or theme.", platform_specific: true, url: productLike.url })] : [] },
  ],
  wix: [
    { id: "wix_advisory", evaluate: () => [f({ id: "wix_seo_controls", title: "Wix SEO control limits — verify", severity: "advisory", observed: "Platform detected as Wix.", recommendation: "Confirm canonical/robots/redirect controls are accessible for this Wix plan and that critical content is server-rendered, not JS-only.", platform_specific: true, crawl_verified: false })] },
  ],
  squarespace: [
    { id: "sqs_advisory", evaluate: () => [f({ id: "sqs_seo_controls", title: "Squarespace structural limits — verify", severity: "advisory", observed: "Platform detected as Squarespace.", recommendation: "Confirm URL-structure, redirect and schema controls meet the plan's needs; Squarespace constrains some technical SEO levers.", platform_specific: true, crawl_verified: false })] },
  ],
  webflow: [
    { id: "wf_advisory", evaluate: ({ productLike }) => [f({ id: "webflow_commerce", title: "Webflow commerce/CMS limits — verify", severity: "advisory", observed: productLike ? `Sampled ${productLike.url}` : "Platform detected as Webflow.", recommendation: "Confirm collection-page templates output the intended schema and that pagination/canonical are handled — Webflow requires manual setup for these.", platform_specific: true, crawl_verified: false })] },
  ],
};

/* pick a likely product/collection/article page from homepage links */
function pickProductLike(links: string[]): string | null {
  const score = (u: string) => /\/products?\//.test(u) ? 3 : /\/collections?\/|\/category\/|\/product-category\//.test(u) ? 2 : /\/(blog|news|article|p)\//.test(u) ? 1 : 0;
  const ranked = links.map(u => ({ u, s: score(u) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  return ranked[0]?.u || null;
}

export async function adviseCms(opts: { projectId: string; siteUrl?: string; maxPages?: number }): Promise<CmsAdvisorReport> {
  const now = new Date().toISOString();
  const maxPages = Math.max(2, Math.min(opts.maxPages ?? 6, 12));

  /* Resolve a site URL: explicit input, else project target urls. */
  let root = opts.siteUrl ? originOf(opts.siteUrl) : "";
  let seedUrls: string[] = [];
  if (!root) {
    const tu = await resolveTargetUrls(undefined, opts.projectId).catch(() => ({ urls: [] as string[], source: "" }));
    seedUrls = tu.urls || [];
    root = originOf(seedUrls[0] || "");
  }
  const projectDomain = domainOf(root || seedUrls[0] || "");

  if (!root) {
    return { project_domain: "", generated_at: now, detected_platform: "unknown", platform_confidence: 0, platform_signals: [], pages_examined: [], findings: [],
      summary: "Could not resolve a site URL for this project. Supply inputs.siteUrl, or connect GSC / set a campaign target URL.", limits: ["No site URL available to crawl."] };
  }

  /* Crawl homepage first, then sample internal pages. */
  const homepageHtml = await fetchHtml(root).catch(() => "");
  const homepage = extractSignals(root, homepageHtml);
  const productLikeUrl = pickProductLike(homepage.internal_links);
  const sampleUrls = Array.from(new Set([
    ...seedUrls.slice(0, 2),
    productLikeUrl || "",
    ...homepage.internal_links.filter(u => u !== root).slice(0, 3),
  ].filter(Boolean))).slice(0, maxPages - 1);

  const pages: PageSignals[] = [homepage];
  for (const u of sampleUrls) { const h = await fetchHtml(u).catch(() => ""); pages.push(extractSignals(u, h)); }

  const det = detectPlatform(homepage);
  const productLike = pages.find(p => p.ok && productLikeUrl && p.url === productLikeUrl) || null;

  const ctx: RuleCtx = { root, platform: det.platform, pages, homepage, productLike };
  const findings: CmsFinding[] = [];
  for (const r of UNIVERSAL_RULES) findings.push(...r.evaluate(ctx));
  for (const r of (PLATFORM_RULES[det.platform] || [])) findings.push(...r.evaluate(ctx));
  /* WooCommerce sites also get WordPress rules. */
  if (det.platform === "woocommerce") for (const r of (PLATFORM_RULES.wordpress || [])) findings.push(...r.evaluate(ctx));

  const sevRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, advisory: 4 };
  findings.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  const okPages = pages.filter(p => p.ok).length;
  const summary = `Detected platform: ${det.platform} (${det.confidence}% confidence${det.signals.length ? `; signals: ${det.signals.join(", ")}` : ""}). Crawled ${okPages}/${pages.length} pages. ${findings.length} findings (${findings.filter(x => x.severity === "critical" || x.severity === "high").length} high/critical, ${findings.filter(x => !x.crawl_verified).length} advisory needing manual verification). Platform-specific rules applied for ${det.platform}; add more platform rule sets to extend coverage.`;

  const limits = [
    "Findings are based on a capped sample of crawled pages (homepage + sampled internals), not the full site.",
    "A crawl cannot see Core Web Vitals field data, theme/template internals, app/plugin configuration, or content rendered only by JavaScript after load — items needing those are marked advisory (crawl_verified: false).",
    "Platform detection is signature-based; an uncommon or heavily customised stack may read as custom/unknown.",
    "Platform rule coverage is extensible — only the registered platforms have specific rules; universal rules apply everywhere.",
  ];

  return { project_domain: projectDomain, generated_at: now, detected_platform: det.platform, platform_confidence: det.confidence, platform_signals: det.signals, pages_examined: pages.map(p => p.url), findings, summary, limits };
}
