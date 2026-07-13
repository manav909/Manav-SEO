/* ════════════════════════════════════════════════════════════════
   api/lib/instant-audit-engine.ts

   BUILD 12.33 — Lead Intake instant audit, rebuilt honest.

   WHY THIS EXISTS
   The previous instant_audit_showcase handler fetched the target through
   the Jina reader FIRST (r.jina.ai, reader mode). Reader mode returns
   cleaned article HTML with the entire <head> stripped: no <title>, no
   <meta>, no <link rel=canonical>, and JSON-LD <script> blocks removed.
   Its deterministic parser then read that head-less document, found every
   structural signal absent, and reported a fully-optimised Wix site
   (scrumsleds.com) as "18/100, invisible to Google" with zero title,
   meta, H1, canonical and schema — every one of which is in fact present
   and served in the raw SSR HTML. It also mis-identified a rugby scrum
   sled manufacturer as an American-football business and recommended a
   football keyword strategy.

   THE FIX
   Structural signals are extracted ONLY from raw HTML (fetchPageRaw),
   which preserves the head that Wix, Squarespace, Shopify and every real
   CMS server-side render. The reader is used solely to top up visible
   body text on a genuine JavaScript shell, and never overrides a head
   signal. A 401/403/429/5xx or WAF interstitial is reported as blocked,
   never as a missing tag or a 404. The business and its industry are
   derived deterministically from the real page content and handed to the
   model as ground truth, so the narrative can never invent the wrong
   sport. Presence and absence of every element is decided by the parser,
   not the model — the model writes prose only, hard-grounded in the
   verified block. This is the BACKBONE rule applied end to end.

   Multi-path safe: no new api/*.ts, no migration, no layout.
════════════════════════════════════════════════════════════════ */

import { fetchPageRaw, fetchViaReader } from "./workspace/shared.js";
import { db } from "./db.js";

export interface InstantAuditOpts {
  url: string;
  forLead?: string;
  conversationAnalysis?: any;
  salesContext?: string;
  /* deep-audit controls */
  maxPages?: number; /* money pages to crawl beyond the homepage (default 6) */
  keyword?: string; /* target keyword for the competitive read; if absent it is derived */
  projectId?: string; /* required for the SERP competitive read */
  enableCompetitive?: boolean; /* OFF by default — SERP calls cost money; flip on when a project + budget exist */
}

/* Severity is deliberately the SAME four values the previous engine emitted.
   Every downstream consumer (generate_sales_pack, generate_context_suggestions,
   generate_client_doc, suggest_sales_documents sevCounts, Intake.tsx SEV_COLOR,
   BdePanel buildAuditHtml sevC) iterates issues as PROBLEMS. Introducing a fifth
   "positive" value would leak strengths into pitches, client documents and the
   on-screen problem list. Strengths are carried separately in AuditResult.strengths
   and reflected in the narrative — never inside any issues array. */
export interface AuditIssue {
  issue: string;
  severity: "critical" | "high" | "medium" | "low";
  explanation: string;
  fix: string;
  algorithmNote: string | null;
  category?: string;
}

export interface AuditCategory {
  name: string;
  score: number;
  narrative: string;
  issues: AuditIssue[];
}

export interface AuditResult {
  success: boolean;
  url: string;
  reachable: boolean;
  blocked?: boolean;
  score: number;
  executiveSummary: string;
  categories: AuditCategory[];
  issues: AuditIssue[];
  quickWins: string[];
  algorithmHighlights: string[];
  showcase_message: string;
  contextSummary: string;
  /* additive fields (ignored by the current UI, available to future views) */
  platform?: string;
  indexable?: boolean;
  businessSummary?: string;
  strengths?: string[];
  signals?: Signals;
  /* deep-audit facets — each is a DISTINCT slice so a downstream doc can draw
     its own value from the same audit rather than restating the others */
  auditDepth?: "homepage" | "deep";
  pagesAudited?: PageAudit[];
  siteFindings?: SiteFinding[];
  contentAssessment?: ContentAssessment;
  businessProfile?: BusinessProfile;
  competitive?: CompetitiveRead;
  opportunities?: Opportunity[];
  error?: string;
}

/* ─────────────────── deep-audit facet interfaces ────────────────────
   Kept separate and purpose-built. The audit doc reads categories +
   findings + strengths; the pitch reads businessProfile + opportunities;
   the action plan reads opportunities (sequenced by impact/effort); the
   competitive brief reads competitive; the case study is matched against
   businessProfile. No two docs need to restate the same facts. */

export interface PageAudit {
  url: string;
  pageType: string; /* home | product | category | about | contact | blog | other */
  status: number;
  title: string;
  titleLen: number;
  metaDescription: string;
  h1Count: number;
  wordCount: number;
  schemaTypes: string[];
  hasProductSchema: boolean;
  price: string; /* detected on-page price, or "" */
  indexable: boolean;
  canonical: string;
  altCoveragePct: number;
  imgTotal: number;
}

export interface SiteFinding {
  kind: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  affectedUrls: string[];
  fix: string;
  category: string; /* one of the four audit category names */
}

export interface BusinessProfile {
  industry: string;
  offering: string;
  products: { name: string; price: string; url: string }[];
  priceRange: string;
  positioning: string;
  primaryKeywords: string[];
  audience: string;
}

export interface ContentAssessment {
  totalPagesAudited: number;
  avgWordCount: number;
  hasInformationalContent: boolean;
  hasBlog: boolean;
  hasFaq: boolean;
  thinPages: string[];
  gapSummary: string;
}

export interface CompetitiveRead {
  ran: boolean;
  keyword: string;
  competitors: { domain: string; title: string; position: number }[];
  clientAppears: boolean;
  clientPosition: number | null;
  note: string;
}

export interface Opportunity {
  title: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  detail: string;
  category: string;
}

/* ────────────────────────────── signals ────────────────────────── */

export interface Signals {
  fetchedVia: "raw" | "reader-augmented" | "unreachable";
  httpStatus: number;
  finalUrl: string;
  https: boolean;
  platform: string;
  generator: string;
  jsRendered: boolean;
  title: string;
  titleLen: number;
  metaDescription: string;
  metaLen: number;
  canonical: string;
  canonicalSelfReferential: boolean;
  robotsMeta: string;
  xRobotsTag: string;
  indexable: boolean;
  noindexReason: string;
  h1Count: number;
  h1Text: string;
  headingOutline: { tag: string; text: string }[];
  schemaTypes: string[];
  ogTags: Record<string, string>;
  ogComplete: boolean;
  twitterTags: Record<string, string>;
  twitterComplete: boolean;
  viewport: boolean;
  lang: string;
  hreflang: string[];
  favicon: boolean;
  imgTotal: number;
  imgWithAlt: number;
  altCoveragePct: number;
  internalLinkCount: number;
  navLabels: string[];
  wordCount: number;
  verificationTags: string[];
  robotsTxt: boolean;
  sitemapXml: boolean;
  businessSummary: string;
  topKeywords: string[];
}

const STOPWORDS = new Set(
  ("the a an and or but of to in on for with at by from up about into over after your you our we us it is are was be as that this these those all any can will your are not have has had do does your more most other some such no nor only own same so than too very just").split(
    " "
  )
);

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectPlatform(html: string, generator: string): { platform: string; js: boolean } {
  const h = html.toLowerCase();
  const g = generator.toLowerCase();
  if (/wixstatic|_wixcssstates|wix\.com\/website|x-wix-/.test(h) || g.includes("wix"))
    return { platform: "Wix", js: true };
  if (/squarespace|static1\.squarespace|squarespace[_-]context/.test(h) || g.includes("squarespace"))
    return { platform: "Squarespace", js: true };
  if (/cdn\.shopify|shopify\.com|x-shopify/.test(h) || g.includes("shopify"))
    return { platform: "Shopify", js: false };
  if (/wp-content|wp-includes|wp-json/.test(h) || g.includes("wordpress"))
    return { platform: "WordPress", js: false };
  if (/webflow\.com|wf-/.test(h) || g.includes("webflow"))
    return { platform: "Webflow", js: false };
  const bodyText = stripTags(html);
  const scriptCount = (html.match(/<script/gi) || []).length;
  if (
    bodyText.length < 600 &&
    scriptCount >= 3 &&
    /<div[^>]+id=["'](root|app|__next|__nuxt|gatsby-focus-wrapper)["']/i.test(html)
  )
    return { platform: "JavaScript app", js: true };
  return { platform: "", js: false };
}

function metaContent(html: string, key: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const n = (tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (n && n.toLowerCase() === key.toLowerCase()) {
      const c = (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || [])[1];
      if (c) return c.trim();
    }
  }
  return "";
}

function allMeta(html: string, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const n = (tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (n && n.toLowerCase().startsWith(prefix.toLowerCase())) {
      const c = (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || [])[1];
      if (c) out[n.toLowerCase()] = c.trim();
    }
  }
  return out;
}

function extractSchemaTypes(html: string): string[] {
  const types = new Set<string>();
  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const walk = (o: any) => {
        if (!o) return;
        if (Array.isArray(o)) {
          o.forEach(walk);
          return;
        }
        const t = o["@type"];
        if (t) (Array.isArray(t) ? t : [t]).forEach((x: any) => types.add(String(x)));
        if (o["@graph"]) walk(o["@graph"]);
      };
      walk(JSON.parse(m[1].trim()));
    } catch {
      /* skip unparseable block */
    }
  }
  return Array.from(types);
}

function buildSignals(
  rawHtml: string,
  bodyHtml: string,
  status: number,
  finalUrl: string,
  xRobotsHeader: string,
  robotsTxt: boolean,
  sitemapXml: boolean,
  fetchedVia: Signals["fetchedVia"]
): Signals {
  const generator = metaContent(rawHtml, "generator");
  const { platform, js } = detectPlatform(rawHtml, generator);

  const title = ((rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "")
    .replace(/\s+/g, " ")
    .trim();
  const metaDescription = metaContent(rawHtml, "description");
  const robotsMeta = metaContent(rawHtml, "robots").toLowerCase();
  const xRobotsTag = (xRobotsHeader || "").toLowerCase();

  let canonical = "";
  for (const tag of rawHtml.match(/<link\b[^>]*>/gi) || []) {
    if (/\brel\s*=\s*["']canonical["']/i.test(tag)) {
      const href = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (href) {
        canonical = href.trim();
        break;
      }
    }
  }

  /* headings — h1 from raw head-rendered HTML; outline from whichever body we trust */
  const headSource = bodyHtml || rawHtml;
  const h1s = Array.from(headSource.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
    .map((m) => stripTags(m[1]))
    .filter(Boolean);
  const headingOutline: { tag: string; text: string }[] = [];
  for (const m of headSource.matchAll(/<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = stripTags(m[2]);
    if (text) headingOutline.push({ tag: m[1].toLowerCase(), text: text.slice(0, 120) });
    if (headingOutline.length >= 40) break;
  }

  const schemaTypes = extractSchemaTypes(rawHtml);
  const ogTags = allMeta(rawHtml, "og:");
  const twitterTags = allMeta(rawHtml, "twitter:");
  const ogComplete = Boolean(ogTags["og:title"] && ogTags["og:description"] && ogTags["og:image"]);
  const twitterComplete = Boolean(twitterTags["twitter:card"] && twitterTags["twitter:title"]);

  const viewport = /<meta[^>]+name=["']viewport["']/i.test(rawHtml);
  const lang = (rawHtml.match(/<html[^>]*\blang\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
  const hreflang = Array.from(
    rawHtml.matchAll(/<link[^>]*\brel=["']alternate["'][^>]*\bhreflang=["']([^"']+)["']/gi)
  ).map((m) => m[1]);
  const favicon = /<link[^>]*\brel=["'][^"']*icon[^"']*["']/i.test(rawHtml);

  /* image alt coverage — measured, not guessed */
  const imgTags = rawHtml.match(/<img\b[^>]*>/gi) || [];
  const imgTotal = imgTags.length;
  const imgWithAlt = imgTags.filter((t) => {
    const alt = (t.match(/\balt\s*=\s*["']([^"']*)["']/i) || [])[1];
    return alt !== undefined && alt.trim().length > 0;
  }).length;
  const altCoveragePct = imgTotal ? Math.round((imgWithAlt / imgTotal) * 100) : 0;

  /* links + nav labels */
  const domain = (() => {
    try {
      return new URL(finalUrl).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  let internalLinkCount = 0;
  const navLabels: string[] = [];
  for (const m of rawHtml.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1];
    const label = stripTags(m[2]);
    const internal = href.startsWith("/") || (domain && href.includes(domain));
    if (internal) {
      internalLinkCount++;
      if (label && label.length <= 40 && navLabels.length < 12 && !navLabels.includes(label))
        navLabels.push(label);
    }
  }

  const bodyText = stripTags(bodyHtml || rawHtml);
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;

  /* webmaster verification — a site verified with Google or Bing is actively
     managed and is not "invisible to Google" */
  const verificationTags: string[] = [];
  if (metaContent(rawHtml, "google-site-verification")) verificationTags.push("Google Search Console");
  if (metaContent(rawHtml, "msvalidate.01")) verificationTags.push("Bing Webmaster Tools");
  if (metaContent(rawHtml, "yandex-verification")) verificationTags.push("Yandex");

  /* indexability verdict */
  let indexable = true;
  let noindexReason = "";
  if (robotsMeta.includes("noindex")) {
    indexable = false;
    noindexReason = "robots meta contains noindex";
  } else if (xRobotsTag.includes("noindex")) {
    indexable = false;
    noindexReason = "X-Robots-Tag header contains noindex";
  }

  /* business summary + top keywords from real content only */
  const ogSite = ogTags["og:site_name"] || "";
  const businessSource = [title, h1s[0] || "", ogSite, metaDescription, bodyText.slice(0, 1200)]
    .join(" ")
    .toLowerCase();
  const freq: Record<string, number> = {};
  for (const w of businessSource.match(/[a-z][a-z-]{2,}/g) || []) {
    if (STOPWORDS.has(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  const topKeywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map((e) => e[0]);
  const businessSummary = [
    title ? `Page title: ${title}.` : "",
    h1s[0] ? `Primary heading: ${h1s[0]}.` : "",
    ogSite ? `Brand/site name: ${ogSite}.` : "",
    metaDescription ? `Meta description: ${metaDescription}.` : "",
    topKeywords.length ? `Dominant on-page terms: ${topKeywords.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const canonicalSelfReferential = (() => {
    if (!canonical) return false;
    try {
      const c = new URL(canonical).hostname.replace(/^www\./, "");
      return c === domain;
    } catch {
      return false;
    }
  })();

  return {
    fetchedVia,
    httpStatus: status,
    finalUrl,
    https: finalUrl.startsWith("https://"),
    platform,
    generator,
    jsRendered: js,
    title,
    titleLen: title.length,
    metaDescription,
    metaLen: metaDescription.length,
    canonical,
    canonicalSelfReferential,
    robotsMeta,
    xRobotsTag,
    indexable,
    noindexReason,
    h1Count: h1s.length,
    h1Text: h1s[0] || "",
    headingOutline,
    schemaTypes,
    ogTags,
    ogComplete,
    twitterTags,
    twitterComplete,
    viewport,
    lang,
    hreflang,
    favicon,
    imgTotal,
    imgWithAlt,
    altCoveragePct,
    internalLinkCount,
    navLabels,
    wordCount,
    verificationTags,
    robotsTxt,
    sitemapXml,
    businessSummary,
    topKeywords,
  };
}

/* ─────────────────── deterministic issues + scoring ──────────────── */

function deterministicIssues(s: Signals): AuditIssue[] {
  const out: AuditIssue[] = [];
  const commerceSchema = ["Product", "Offer", "LocalBusiness", "Organization"];
  const hasCommerceSchema = s.schemaTypes.some((t) => commerceSchema.includes(t));

  /* Technical */
  if (!s.indexable) {
    out.push({
      category: "Technical SEO",
      issue: `Page is set to noindex (${s.noindexReason})`,
      severity: "critical",
      explanation:
        "A noindex directive tells Google to keep this page out of its index entirely, so it cannot rank for anything regardless of how strong the content is.",
      fix: "Remove the noindex directive from the page robots meta tag or the X-Robots-Tag header, then request re-indexing in Search Console.",
      algorithmNote: null,
    });
  }
  if (!s.https) {
    out.push({
      category: "Technical SEO",
      issue: "Site is not served over HTTPS",
      severity: "high",
      explanation:
        "HTTPS is a confirmed lightweight ranking signal and a trust requirement; browsers flag non-HTTPS pages as not secure, which hurts conversions.",
      fix: "Enable HTTPS and force a redirect from the HTTP version to the HTTPS version.",
      algorithmNote: null,
    });
  }
  if (!s.canonical) {
    out.push({
      category: "Technical SEO",
      issue: "No canonical tag present",
      severity: "medium",
      explanation:
        "Without a canonical, Google may crawl multiple URL variants (www vs non-www, trailing slash) and split ranking signals across duplicates.",
      fix: "Add a self-referential canonical link element to each page pointing at its preferred URL.",
      algorithmNote: null,
    });
  } else if (!s.canonicalSelfReferential) {
    out.push({
      category: "Technical SEO",
      issue: "Canonical tag points to a different domain or host",
      severity: "high",
      explanation:
        "A cross-host canonical tells Google the real page lives elsewhere, which can suppress the current page from search results.",
      fix: "Confirm the canonical target is correct. If this page should rank, set the canonical to its own URL.",
      algorithmNote: null,
    });
  }
  if (!s.schemaTypes.length) {
    out.push({
      category: "Technical SEO",
      issue: "No structured data (JSON-LD schema) detected",
      severity: "high",
      explanation:
        "Schema markup tells Google exactly what the business sells and enables rich results. For a product business, Product and Organization or LocalBusiness schema unlock rich snippets that raise click-through rates.",
      fix: "Add Organization or LocalBusiness schema to the homepage and Product schema to each product page, as a JSON-LD block.",
      algorithmNote:
        "Google structured-data guidelines confirm Product schema can surface price, availability and review stars in results.",
    });
  } else if (!hasCommerceSchema) {
    out.push({
      category: "Technical SEO",
      issue: `Structured data present (${s.schemaTypes.join(", ")}) but no Product, Organization or LocalBusiness type`,
      severity: "medium",
      explanation:
        "The existing schema does not describe the business or its products, so it cannot unlock commerce rich results.",
      fix: "Add Organization or LocalBusiness and Product schema alongside the existing markup.",
      algorithmNote: null,
    });
  }
  if (!s.sitemapXml) {
    out.push({
      category: "Technical SEO",
      issue: "No XML sitemap found at /sitemap.xml",
      severity: "medium",
      explanation:
        "A sitemap helps Google discover every page efficiently, which matters most for sites where pages are not all linked from the homepage.",
      fix: "Publish an XML sitemap and submit it in Google Search Console. Most platforms generate one automatically once enabled.",
      algorithmNote: null,
    });
  }

  /* On-Page */
  if (!s.title) {
    out.push({
      category: "On-Page SEO",
      issue: "No title tag detected",
      severity: "critical",
      explanation:
        "The title tag is the single most weighted on-page ranking signal and the clickable headline in search results. Without it the page cannot rank on target queries.",
      fix: "Add a descriptive 50 to 60 character title with the primary keyword in the first 30 characters.",
      algorithmNote: null,
    });
  } else if (s.titleLen > 62 || s.titleLen < 20) {
    out.push({
      category: "On-Page SEO",
      issue: `Title length is ${s.titleLen} characters (${s.titleLen > 62 ? "too long, will truncate" : "very short"})`,
      severity: "low",
      explanation:
        s.titleLen > 62
          ? "Titles over roughly 60 characters get truncated in search results, so the tail of the title is not seen."
          : "A very short title leaves ranking and click-through value on the table.",
      fix: "Aim for 50 to 60 characters with the primary keyword front-loaded.",
      algorithmNote: null,
    });
  }
  if (!s.metaDescription) {
    out.push({
      category: "On-Page SEO",
      issue: "No meta description on the homepage",
      severity: "medium",
      explanation:
        "Meta descriptions are the snippet Google shows in results. A missing one means Google pulls random page text, which typically lowers click-through rate.",
      fix: "Write a 150 to 160 character description with a clear value proposition and call to action.",
      algorithmNote: null,
    });
  }
  if (s.h1Count === 0) {
    out.push({
      category: "On-Page SEO",
      issue: "No H1 heading on the homepage",
      severity: "high",
      explanation:
        "The H1 is the primary on-page topic signal and an accessibility landmark. Without it Google has reduced clarity about the page subject.",
      fix: "Add exactly one H1 per page containing the primary target keyword.",
      algorithmNote: null,
    });
  } else if (s.h1Count > 1) {
    out.push({
      category: "On-Page SEO",
      issue: `Multiple H1 tags found (${s.h1Count})`,
      severity: "low",
      explanation:
        "Multiple H1s dilute the primary topic signal. One clear H1 per page is the safest structure.",
      fix: "Keep a single H1 as the page headline and demote the rest to H2 or H3.",
      algorithmNote: null,
    });
  }

  /* Content */
  if (s.imgTotal > 0 && s.altCoveragePct < 80) {
    out.push({
      category: "Content Quality",
      issue: `Image alt-text coverage is ${s.altCoveragePct}% (${s.imgWithAlt} of ${s.imgTotal} images)`,
      severity: s.altCoveragePct < 40 ? "high" : "medium",
      explanation:
        "Descriptive alt text is the primary signal Google Images uses to understand and rank photos, and it is an accessibility requirement. Images without alt text cannot surface in image search.",
      fix: "Add a descriptive, keyword-relevant alt attribute to every meaningful product and content image.",
      algorithmNote:
        "Google image-search documentation states descriptive alt text is the primary signal for Images indexing.",
    });
  }
  if (s.wordCount > 0 && s.wordCount < 300) {
    out.push({
      category: "Content Quality",
      issue: `Thin homepage content (~${s.wordCount} words in the crawlable layer)`,
      severity: "medium",
      explanation:
        "Sparse text gives Google little to match against buyer queries. Depth that answers real buyer questions is rewarded by the Helpful Content system.",
      fix: "Expand the page with genuinely useful buyer-focused content: product benefits, use cases, buyer FAQs.",
      algorithmNote: "Helpful Content system rewards depth and demonstrated expertise.",
    });
  }

  return out;
}

function scoreCategory(name: string, issues: AuditIssue[], s: Signals): number {
  const weight: Record<string, number> = { critical: 30, high: 18, medium: 10, low: 4, positive: 0 };
  let penalty = 0;
  for (const i of issues) penalty += weight[i.severity] || 0;
  let base = 100;
  /* small structural credit so a clean category never reads artificially low */
  if (name === "Technical SEO") base = s.indexable && s.https ? 100 : 90;
  const score = Math.max(6, Math.min(100, base - penalty));
  return score;
}

/* ───────────────────────── strengths (honest wins) ──────────────────
   Returned as plain strings, NEVER as issue objects. They surface in
   AuditResult.strengths and in the narrative, so no consumer that treats
   the issues array as a problem list can misread a strength as a fault. */

function strengthNotes(s: Signals): string[] {
  const wins: string[] = [];
  if (s.verificationTags.length)
    wins.push(
      `Verified with ${s.verificationTags.join(" and ")} — the site is actively managed and already known to search engines.`
    );
  if (s.ogComplete && s.twitterComplete)
    wins.push(
      "Social sharing is fully configured (Open Graph and Twitter Card), so shared links render with a title, description and image."
    );
  if (s.imgTotal > 0 && s.altCoveragePct >= 80)
    wins.push(
      `Strong image alt-text coverage (${s.altCoveragePct}% of ${s.imgTotal} images), which supports Google Images visibility and accessibility.`
    );
  if (s.canonical && s.canonicalSelfReferential)
    wins.push("A self-referential canonical tag is in place, consolidating ranking signals to the preferred URL.");
  if (s.title && s.metaDescription && s.h1Count === 1)
    wins.push("The three core on-page signals are present and well-formed: a single H1, a title tag and a meta description.");
  return wins;
}

/* ────────────────────────────── JSON extract ────────────────────── */

function extractJson(raw: string): any {
  if (!raw) return null;
  let t = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  const body = t.slice(first, last + 1);
  try {
    return JSON.parse(body);
  } catch {
    /* balance-repair a truncated tail */
    let op = 0,
      cl = 0,
      ao = 0,
      ac = 0,
      inS = false,
      es = false;
    for (const c of body) {
      if (es) {
        es = false;
        continue;
      }
      if (c === "\\") {
        es = true;
        continue;
      }
      if (c === '"') {
        inS = !inS;
        continue;
      }
      if (!inS) {
        if (c === "{") op++;
        if (c === "}") cl++;
        if (c === "[") ao++;
        if (c === "]") ac++;
      }
    }
    const closing = "]".repeat(Math.max(0, ao - ac)) + "}".repeat(Math.max(0, op - cl));
    try {
      return JSON.parse(body + closing);
    } catch {
      return null;
    }
  }
}

/* ───────────────────────────── LLM narrative ─────────────────────── */

async function narrate(
  displayUrl: string,
  s: Signals,
  detIssues: AuditIssue[],
  strengths: string[],
  ctxParts: string[],
  salesContext: string,
  algoData: any[],
  deep: {
    pages: PageAudit[];
    findings: SiteFinding[];
    content: ContentAssessment;
    profile: BusinessProfile;
    competitive: CompetitiveRead;
    opportunities: Opportunity[];
  }
): Promise<{
  executiveSummary: string;
  narratives: Record<string, string>;
  quickWins: string[];
  strategic: AuditIssue[];
  showcase_message: string;
  contextSummary: string;
} | null> {
  const key = process.env.ANTHROPIC_API_KEY || "";
  if (!key) return null;

  const verified = [
    "VERIFIED SIGNALS — authoritative, parsed from the raw server HTML. These are ground truth.",
    "You may NOT state that any element is missing if it is marked PRESENT here. You may NOT invent any platform-internal, rendering, or configuration detail that is not in this list. You may NOT describe the industry as anything other than what the BUSINESS CONTEXT states.",
    `- Platform: ${s.platform || "not identified"}${s.generator ? ` (generator: ${s.generator})` : ""}`,
    `- HTTP status: ${s.httpStatus} | HTTPS: ${s.https ? "yes" : "no"} | Indexable: ${s.indexable ? "yes" : `NO (${s.noindexReason})`}`,
    `- Title: ${s.title ? `PRESENT ("${s.title}") length ${s.titleLen}` : "NONE"}`,
    `- Meta description: ${s.metaDescription ? `PRESENT ("${s.metaDescription.slice(0, 160)}")` : "NONE"}`,
    `- Canonical: ${s.canonical ? `PRESENT (${s.canonical})` : "NONE"}`,
    `- H1: ${s.h1Count} found${s.h1Text ? ` (first: "${s.h1Text}")` : ""}`,
    `- JSON-LD schema types: ${s.schemaTypes.length ? s.schemaTypes.join(", ") : "NONE"}`,
    `- Open Graph complete: ${s.ogComplete ? "yes" : "no"} | Twitter Card complete: ${s.twitterComplete ? "yes" : "no"}`,
    `- Mobile viewport: ${s.viewport ? "yes" : "no"} | Language: ${s.lang || "unset"}`,
    `- Images: ${s.imgTotal}, with alt text ${s.imgWithAlt} (${s.altCoveragePct}% coverage)`,
    `- Internal links: ${s.internalLinkCount} | Nav: ${s.navLabels.join(", ") || "n/a"}`,
    `- Crawlable word count: ${s.wordCount}`,
    `- Webmaster verification: ${s.verificationTags.join(", ") || "none"}`,
    `- robots.txt present: ${s.robotsTxt ? "yes" : "no"} | sitemap.xml present: ${s.sitemapXml ? "yes" : "no"}`,
  ].join("\n");

  const businessContext = "BUSINESS CONTEXT — derive the industry and keyword strategy ONLY from this:\n" + s.businessSummary;

  const deepBlock = [
    "DEEP AUDIT CONTEXT — this audit crawled the money pages, not just the homepage. Ground the narrative in these real facts:",
    `- Pages audited: ${deep.pages.length} (${deep.pages.map((p) => p.pageType).join(", ") || "homepage only"})`,
    deep.profile.products.length
      ? `- Products found: ${deep.profile.products.map((p) => p.name + (p.price ? ` (${p.price})` : "")).slice(0, 6).join("; ")}`
      : "",
    deep.profile.priceRange ? `- Price range: ${deep.profile.priceRange} | Positioning: ${deep.profile.positioning}` : "",
    `- Content depth: average ${deep.content.avgWordCount} words per page; informational content (guides/FAQ): ${deep.content.hasInformationalContent ? "yes" : "no"}. ${deep.content.gapSummary}`,
    deep.findings.length
      ? "- Site-level findings the homepage alone could not reveal:\n" + deep.findings.map((f) => `   [${f.severity}] ${f.title}`).join("\n")
      : "- No cross-page structural problems detected.",
    deep.competitive.ran && deep.competitive.competitors.length
      ? `- Competitive SERP for "${deep.competitive.keyword}": top domains are ${deep.competitive.competitors.slice(0, 5).map((c) => c.domain).join(", ")}; this site ${deep.competitive.clientAppears ? `ranks at position ${deep.competitive.clientPosition}` : "does not appear in the top results"}.`
      : "",
    deep.opportunities.length
      ? "- Ranked opportunities: " + deep.opportunities.slice(0, 5).map((o) => `${o.title} (impact ${o.impact}, effort ${o.effort})`).join("; ")
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const detList = detIssues
    .map((i) => `[${i.severity}] ${i.category}: ${i.issue}`)
    .join("\n");

  const schemaStr =
    '{"executiveSummary":"<3-4 sentences, specific to THIS site, honest about its real state>",' +
    '"narratives":{"Technical SEO":"<2-3 sentences>","On-Page SEO":"<2-3 sentences>","Content Quality":"<2-3 sentences>","User Experience":"<2-3 sentences>"},' +
    '"quickWins":["<action>","<action>","<action>"],' +
    '"strategic":[{"issue":"<opportunity specific to this real business and industry>","severity":"medium|low","explanation":"<why it matters>","fix":"<concrete step>","category":"Content Quality|User Experience","algorithmNote":"<or null>"}],' +
    '"showcase_message":"<one honest sentence for a sales conversation>","contextSummary":"<what the sales brief changed, or empty>"}';

  const prompt = [
    "You are a senior digital marketing specialist writing a client-facing lead audit. Return ONLY raw JSON, no markdown, no code fences.",
    "Rules: ground every structural statement in the VERIFIED SIGNALS. Never contradict them. Never claim a present element is missing. Never invent rendering, platform-internal, or configuration facts. Identify the industry and any keyword suggestions ONLY from the BUSINESS CONTEXT. If the site is competent, say so plainly rather than manufacturing problems.",
    `URL: ${displayUrl}`,
    ctxParts.length ? "Lead context: " + ctxParts.join(" | ") : "",
    salesContext ? "Sales brief (follow precisely): " + String(salesContext).slice(0, 600) : "",
    verified,
    businessContext,
    deepBlock,
    "Deterministic findings already computed (do not restate as prose the presence/absence facts; instead write narrative and add genuinely NEW strategic opportunities grounded in the real industry):\n" + (detList || "none"),
    strengths.length
      ? "Verified STRENGTHS to acknowledge honestly in the executive summary and narratives (do NOT list these as problems):\n" +
        strengths.map((w) => "- " + w).join("\n")
      : "",
    algoData.length
      ? "Relevant algorithm updates you may cite if accurate: " +
        algoData.map((a: any) => `${a.topic}: ${(a.summary || "").slice(0, 80)}`).join("; ")
      : "",
    "Return exactly this JSON shape (no line breaks inside string values):",
    schemaStr,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2600,
        system: "Return ONLY valid JSON. No markdown. No code fences. No line breaks inside string values.",
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return null;
    const data: any = await r.json();
    const text = Array.isArray(data?.content)
      ? data.content.map((b: any) => (b?.type === "text" ? b.text : "")).join("")
      : "";
    const parsed = extractJson(text);
    if (!parsed) return null;
    const strat: AuditIssue[] = Array.isArray(parsed.strategic)
      ? parsed.strategic
          .filter((x: any) => x && x.issue && x.fix)
          .map((x: any) => ({
            issue: String(x.issue),
            severity: (["medium", "low"].includes(x.severity) ? x.severity : "low") as AuditIssue["severity"],
            explanation: String(x.explanation || ""),
            fix: String(x.fix),
            algorithmNote: x.algorithmNote ? String(x.algorithmNote) : null,
            category: ["Content Quality", "User Experience"].includes(x.category) ? x.category : "Content Quality",
          }))
      : [];
    return {
      executiveSummary: String(parsed.executiveSummary || ""),
      narratives: parsed.narratives && typeof parsed.narratives === "object" ? parsed.narratives : {},
      quickWins: Array.isArray(parsed.quickWins) ? parsed.quickWins.map(String).slice(0, 4) : [],
      strategic: strat.slice(0, 4),
      showcase_message: String(parsed.showcase_message || ""),
      contextSummary: String(parsed.contextSummary || ""),
    };
  } catch {
    return null;
  }
}

/* ─────────────────────────── resource checks ────────────────────── */

async function resourceExists(url: string): Promise<boolean> {
  try {
    const r = await fetchPageRaw(url, 8000);
    return r.ok && r.html.length > 0;
  } catch {
    return false;
  }
}

/* ═══════════════════════ DEEP-AUDIT LAYER (Stage 1) ═══════════════════════
   Turns the homepage-hygiene snapshot into a Senior-DMS lead audit: crawls the
   money pages, detects duplicate/canonical problems a single page cannot see,
   checks Product schema where prices actually live, assesses content depth, and
   builds distinct intelligence facets for the downstream sales documents. */

function classifyPageType(url: string, title: string): string {
  let p = "";
  try {
    p = new URL(url).pathname.toLowerCase();
  } catch {
    p = url.toLowerCase();
  }
  const t = (title || "").toLowerCase();
  if (p === "/" || p === "" || p === "/home" || p === "/index" || p === "/index.html") return "home";
  if (/\b(faq|faqs|questions)\b/.test(p)) return "faq";
  if (/\b(blog|news|article|articles|guide|guides|resources|learn)\b/.test(p)) return "blog";
  if (/\b(about|our-story|who-we-are|company)\b/.test(p)) return "about";
  if (/\b(contact|contact-us|get-in-touch|quote)\b/.test(p)) return "contact";
  if (/\b(shop|products|product-line|collections|store|catalog|catalogue|our-product)\b/.test(p)) return "category";
  if (/\b(product|item|p\/|buy)\b/.test(p) || /\$|price|buy|order/.test(t)) return "product";
  return "other";
}

function extractPrice(html: string): string {
  const text = stripTags(html);
  const matches = text.match(/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g) || [];
  let best = 0;
  let bestStr = "";
  for (const m of matches) {
    const n = Number(m.replace(/[^0-9.]/g, ""));
    if (n > best && n < 1000000) {
      best = n;
      bestStr = m.replace(/\s/g, "");
    }
  }
  return bestStr;
}

function normTitle(t: string): string {
  return (t || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function extractCandidateUrls(
  homeHtml: string,
  origin: string,
  domain: string,
  homeUrl: string,
  maxPages: number
): string[] {
  const found: { url: string; type: string }[] = [];
  const seen = new Set<string>();
  const homePath = (() => {
    try {
      return new URL(homeUrl).pathname.replace(/\/+$/, "") || "/";
    } catch {
      return "/";
    }
  })();

  for (const m of homeHtml.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = m[1].trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:"))
      continue;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4|css|js)(\?|$)/i.test(href)) continue;
    let abs = "";
    try {
      abs = new URL(href, origin).href.split("#")[0].replace(/\/+$/, "");
    } catch {
      continue;
    }
    let host = "";
    let path = "/";
    try {
      const u = new URL(abs);
      host = u.hostname.replace(/^www\./, "");
      path = u.pathname.replace(/\/+$/, "") || "/";
    } catch {
      continue;
    }
    if (host !== domain) continue; /* internal only */
    if (path === homePath || path === "/") continue; /* skip the homepage itself */
    const key = path;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ url: abs, type: classifyPageType(abs, stripTags(m[2])) });
  }

  /* always probe /home to catch the Wix root-vs-/home duplicate */
  const homeVariant = origin.replace(/\/+$/, "") + "/home";
  if (!seen.has("/home")) found.push({ url: homeVariant, type: "home" });

  const priority: Record<string, number> = { product: 0, category: 1, home: 2, blog: 3, faq: 4, about: 5, contact: 6, other: 7 };
  found.sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9));
  return found.slice(0, Math.max(1, maxPages)).map((f) => f.url);
}

async function auditOnePage(url: string): Promise<PageAudit | null> {
  let page: { ok: boolean; status: number; html: string; finalUrl: string; xRobotsTag: string; blocked: boolean };
  try {
    page = await fetchPageRaw(url, 10000);
  } catch {
    return null;
  }
  if (!page.ok || !page.html) return null;

  const rawHtml = page.html;
  const { js } = detectPlatform(rawHtml, metaContent(rawHtml, "generator"));
  let bodyHtml = rawHtml;
  let via: Signals["fetchedVia"] = "raw";
  if (js && stripTags(rawHtml).length < 500) {
    try {
      const reader = await fetchViaReader(page.finalUrl || url);
      if (reader.ok && reader.html && stripTags(reader.html).length > stripTags(rawHtml).length) {
        bodyHtml = reader.html;
        via = "reader-augmented";
      }
    } catch {
      /* keep raw */
    }
  }

  const sig = buildSignals(rawHtml, bodyHtml, page.status, page.finalUrl || url, page.xRobotsTag, false, false, via);
  const price = extractPrice(bodyHtml);
  const pageType = classifyPageType(page.finalUrl || url, sig.title);
  return {
    url: page.finalUrl || url,
    pageType: price && pageType !== "home" ? "product" : pageType,
    status: page.status,
    title: sig.title,
    titleLen: sig.titleLen,
    metaDescription: sig.metaDescription,
    h1Count: sig.h1Count,
    wordCount: sig.wordCount,
    schemaTypes: sig.schemaTypes,
    hasProductSchema: sig.schemaTypes.some((t) => ["Product", "Offer", "AggregateOffer"].includes(t)),
    price,
    indexable: sig.indexable,
    canonical: sig.canonical,
    altCoveragePct: sig.altCoveragePct,
    imgTotal: sig.imgTotal,
  };
}

function detectSiteFindings(homeSig: Signals, homeUrl: string, pages: PageAudit[]): SiteFinding[] {
  const out: SiteFinding[] = [];
  const homePathIsHome = pages.filter((p) => p.pageType === "home");

  /* duplicate homepage — the Wix root-vs-/home problem a single-page audit misses */
  for (const hp of homePathIsHome) {
    if (normTitle(hp.title) && normTitle(hp.title) !== normTitle(homeSig.title) && normTitle(homeSig.title)) {
      out.push({
        kind: "duplicate_homepage",
        severity: "high",
        title: "Two homepage versions are live with conflicting titles",
        detail: `The site serves both ${homeUrl} and ${hp.url} as homepages, and they carry different title tags ("${homeSig.title}" versus "${hp.title}"). Search engines may index both and split ranking signals between them.`,
        affectedUrls: [homeUrl, hp.url],
        fix: "Pick one canonical homepage, 301-redirect the other, and confirm a single self-referential canonical so all authority consolidates to one URL and one title.",
        category: "Technical SEO",
      });
      break;
    }
  }

  /* duplicate titles across pages */
  const byTitle: Record<string, string[]> = {};
  const withHome = [...pages];
  for (const p of withHome) {
    const t = normTitle(p.title);
    if (!t) continue;
    (byTitle[t] = byTitle[t] || []).push(p.url);
  }
  for (const [t, urls] of Object.entries(byTitle)) {
    if (urls.length > 1) {
      out.push({
        kind: "duplicate_titles",
        severity: "medium",
        title: `${urls.length} pages share the same title tag`,
        detail: `Duplicate title tags ("${t.slice(0, 80)}") make it hard for search engines to tell the pages apart and dilute keyword targeting.`,
        affectedUrls: urls.slice(0, 6),
        fix: "Give each page a unique, keyword-specific title that matches its content.",
        category: "On-Page SEO",
      });
    }
  }

  /* Product schema missing on priced pages — the highest-ROI commerce gap */
  const pricedNoSchema = pages.filter((p) => (p.price || p.pageType === "product") && !p.hasProductSchema);
  if (pricedNoSchema.length) {
    out.push({
      kind: "missing_product_schema",
      severity: "high",
      title: `Product schema is missing on ${pricedNoSchema.length} priced product ${pricedNoSchema.length === 1 ? "page" : "pages"}`,
      detail: `Product and Offer JSON-LD is absent on pages that carry real prices${pricedNoSchema[0]?.price ? ` (for example ${pricedNoSchema[0].price})` : ""}. Without it, Google cannot show price, availability or review stars in the result, which forfeits click-through on exactly the commercial searches that convert.`,
      affectedUrls: pricedNoSchema.map((p) => p.url).slice(0, 6),
      fix: "Add Product plus Offer schema (name, price, priceCurrency, availability) to each product page, and Organization or LocalBusiness schema on the homepage.",
      category: "Technical SEO",
    });
  }

  /* canonical missing on interior pages */
  const noCanon = pages.filter((p) => p.pageType !== "home" && !p.canonical);
  if (noCanon.length >= 2) {
    out.push({
      kind: "canonical_missing",
      severity: "medium",
      title: `${noCanon.length} interior pages have no canonical tag`,
      detail: "Interior pages without a canonical are vulnerable to duplicate-URL variants splitting their ranking signal.",
      affectedUrls: noCanon.map((p) => p.url).slice(0, 6),
      fix: "Add a self-referential canonical link element to every page.",
      category: "Technical SEO",
    });
  }

  /* non-indexable interior pages */
  const noindexed = pages.filter((p) => !p.indexable);
  if (noindexed.length) {
    out.push({
      kind: "noindex_pages",
      severity: "high",
      title: `${noindexed.length} crawled ${noindexed.length === 1 ? "page is" : "pages are"} set to noindex`,
      detail: "Pages carrying a noindex directive are excluded from search entirely and cannot rank.",
      affectedUrls: noindexed.map((p) => p.url).slice(0, 6),
      fix: "Remove the noindex directive from any page that should rank, then request re-indexing.",
      category: "Technical SEO",
    });
  }

  return out;
}

function assessContent(pages: PageAudit[]): ContentAssessment {
  const total = pages.length;
  const words = pages.map((p) => p.wordCount).filter((w) => w > 0);
  const avg = words.length ? Math.round(words.reduce((a, b) => a + b, 0) / words.length) : 0;
  const hasBlog = pages.some((p) => p.pageType === "blog");
  const hasFaq = pages.some((p) => p.pageType === "faq");
  const hasInformationalContent = hasBlog || hasFaq;
  const thinPages = pages.filter((p) => p.pageType !== "contact" && p.wordCount > 0 && p.wordCount < 250).map((p) => p.url);
  const gapSummary = hasInformationalContent
    ? "The site carries some informational content, which supports top-of-funnel discovery."
    : "The site is transactional-only: product and company pages but no informational content (buying guides, comparisons, FAQ) to capture buyers researching before they purchase. Competitors that publish this content typically own the top-of-funnel queries.";
  return { totalPagesAudited: total, avgWordCount: avg, hasInformationalContent, hasBlog, hasFaq, thinPages, gapSummary };
}

function buildBusinessProfile(homeSig: Signals, pages: PageAudit[]): BusinessProfile {
  const productPages = pages.filter((p) => p.pageType === "product" || p.price);
  const products = productPages
    .map((p) => ({ name: (p.title || "").split(/[|\u2013\u2014-]/)[0].trim().slice(0, 60), price: p.price, url: p.url }))
    .filter((x) => x.name);
  const prices = productPages
    .map((p) => Number((p.price || "").replace(/[^0-9.]/g, "")))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const priceRange = prices.length
    ? prices.length === 1
      ? `$${prices[0].toLocaleString()}`
      : `$${prices[0].toLocaleString()} to $${prices[prices.length - 1].toLocaleString()}`
    : "";
  const bs = homeSig.businessSummary.toLowerCase();
  const positioningBits: string[] = [];
  if (/manufactur|made in|american made|direct/.test(bs)) positioningBits.push("direct manufacturer");
  if (/premium|professional|elite|top of the line|heavy duty/.test(bs)) positioningBits.push("quality-led");
  if (/affordable|budget|value/.test(bs)) positioningBits.push("value-conscious");
  return {
    industry: homeSig.title || homeSig.topKeywords.slice(0, 3).join(" ") || "not identified",
    offering: homeSig.metaDescription || homeSig.h1Text || "",
    products: products.slice(0, 10),
    priceRange,
    positioning: positioningBits.join(", ") || "niche direct-to-buyer",
    primaryKeywords: homeSig.topKeywords.slice(0, 8),
    audience: /youth|club|team|school/.test(bs) ? "clubs, teams and organisations" : "direct buyers",
  };
}

async function competitiveRead(
  keyword: string,
  projectId: string,
  enable: boolean
): Promise<CompetitiveRead> {
  const base: CompetitiveRead = {
    ran: false,
    keyword: keyword || "",
    competitors: [],
    clientAppears: false,
    clientPosition: null,
    note:
      "Competitive SERP analysis was not run in this pass (it is gated off by default because it consumes a paid SERP call and needs a project context). Enabling it shows exactly who ranks for the target keyword, where this site sits, and the gap to close.",
  };
  if (!enable || !keyword || !projectId) return base;
  try {
    const mod: any = await import("./serpapi.js");
    const serp: any = await mod.fetchSerpFeatures(keyword, projectId, {});
    if (!serp) return base;
    const organic: any[] = serp.organic_results || serp.organic || serp.results || [];
    const competitors = organic
      .slice(0, 8)
      .map((r: any, i: number) => ({
        domain: (() => {
          try {
            return new URL(r.link || r.url || "").hostname.replace(/^www\./, "");
          } catch {
            return String(r.domain || "");
          }
        })(),
        title: String(r.title || ""),
        position: Number(r.position || i + 1),
      }))
      .filter((c: any) => c.domain);
    return { ...base, ran: true, competitors, note: "Competitive SERP read completed." };
  } catch {
    return base;
  }
}

function buildOpportunities(
  findings: SiteFinding[],
  content: ContentAssessment,
  homeSig: Signals,
  competitive: CompetitiveRead
): Opportunity[] {
  const ops: Opportunity[] = [];
  if (findings.some((f) => f.kind === "missing_product_schema"))
    ops.push({
      title: "Add Product and Offer schema across the product range",
      impact: "high",
      effort: "low",
      detail: "Unlocks price, availability and review rich results on the commercial queries that convert, lifting click-through with no content rewrite.",
      category: "Technical SEO",
    });
  if (findings.some((f) => f.kind === "duplicate_homepage"))
    ops.push({
      title: "Consolidate the duplicate homepage into one canonical URL",
      impact: "high",
      effort: "low",
      detail: "Merges split ranking signals from the two competing homepages onto a single strong page and one clear title.",
      category: "Technical SEO",
    });
  if (!content.hasInformationalContent)
    ops.push({
      title: "Build buyer-intent content (guides, comparisons, FAQ)",
      impact: "high",
      effort: "medium",
      detail: "Captures the top-of-funnel research queries that transactional-only sites forfeit to content-rich competitors, and feeds internal links to the product pages.",
      category: "Content Quality",
    });
  if (!homeSig.schemaTypes.some((t) => ["Organization", "LocalBusiness"].includes(t)))
    ops.push({
      title: "Add Organization or LocalBusiness schema to the homepage",
      impact: "medium",
      effort: "low",
      detail: "Helps Google understand the business entity and is a prerequisite for a knowledge panel and local visibility.",
      category: "Technical SEO",
    });
  if (content.thinPages.length)
    ops.push({
      title: "Deepen thin pages with buyer-focused detail",
      impact: "medium",
      effort: "medium",
      detail: `${content.thinPages.length} crawled ${content.thinPages.length === 1 ? "page has" : "pages have"} sparse copy that gives search engines little to rank.`,
      category: "Content Quality",
    });
  if (competitive.ran && competitive.competitors.length && !competitive.clientAppears)
    ops.push({
      title: "Close the visibility gap on the core commercial keyword",
      impact: "high",
      effort: "medium",
      detail: `The site does not appear in the top results for "${competitive.keyword}", where ${competitive.competitors.slice(0, 3).map((c) => c.domain).join(", ")} currently rank.`,
      category: "On-Page SEO",
    });
  const impactRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const effortRank: Record<string, number> = { low: 0, medium: 1, high: 2 };
  return ops.sort((a, b) => impactRank[a.impact] - impactRank[b.impact] || effortRank[a.effort] - effortRank[b.effort]);
}

function findingsToIssues(findings: SiteFinding[]): AuditIssue[] {
  return findings.map((f) => ({
    issue: f.title,
    severity: f.severity,
    explanation: f.detail,
    fix: f.fix,
    algorithmNote: null,
    category: f.category,
  }));
}

/* ──────────────────────────────── main ──────────────────────────── */

export async function runInstantAudit(opts: InstantAuditOpts): Promise<AuditResult> {
  const rawInput = String(opts.url || "").trim();
  if (!rawInput) return { ...emptyResult(""), error: "url required" };

  const host = rawInput.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const candidates = [`https://${host}`, `https://www.${host}`, `http://${host}`];

  let page: { ok: boolean; status: number; html: string; finalUrl: string; xRobotsTag: string; blocked: boolean } | null = null;
  for (const c of candidates) {
    try {
      const r = await fetchPageRaw(c, 13000);
      if (r.ok && r.html) {
        page = r;
        break;
      }
      if (!page) page = r; /* remember the last status for honest reporting */
    } catch {
      /* try next variant */
    }
  }

  if (!page || (!page.ok && page.blocked)) {
    /* honest: blocked is not the same as missing */
    return {
      ...emptyResult(host),
      reachable: false,
      blocked: Boolean(page?.blocked),
      score: 0,
      executiveSummary: page?.blocked
        ? `${host} responded but blocked our audit request (HTTP ${page.status}). The site is live; a firewall or bot protection refused the automated fetch. This is not an SEO fault and says nothing about the page content.`
        : `${host} could not be reached. Verify the URL is correct and the site is live.`,
      categories: [
        {
          name: "Accessibility",
          score: 0,
          narrative: page?.blocked
            ? "The site is up but declined the automated request."
            : "The site did not respond.",
          issues: [
            {
              issue: page?.blocked ? "Automated audit request was blocked by the site" : "Site could not be reached",
              severity: "critical",
              explanation: page?.blocked
                ? "A 401, 403, 429 or challenge response means bot protection refused this origin. Real users and Googlebot may still load the page fine."
                : "No successful response was returned from any URL variant.",
              fix: page?.blocked
                ? "Re-run from a browser to confirm the page loads, or audit via a rendering proxy. Do not treat this as a missing page."
                : "Confirm the domain is spelled correctly and the site is online.",
              algorithmNote: null,
            },
          ],
        },
      ],
    };
  }

  const rawHtml = page.html;

  /* JS shell? only then augment body text via the reader — head signals stay raw */
  const { js } = detectPlatform(rawHtml, metaContent(rawHtml, "generator"));
  const rawBodyText = stripTags(rawHtml);
  let bodyHtml = rawHtml;
  let fetchedVia: Signals["fetchedVia"] = "raw";
  if (js && rawBodyText.length < 500) {
    try {
      const reader = await fetchViaReader(page.finalUrl || candidates[0]);
      if (reader.ok && reader.html && stripTags(reader.html).length > rawBodyText.length) {
        bodyHtml = reader.html;
        fetchedVia = "reader-augmented";
      }
    } catch {
      /* keep raw */
    }
  }

  /* crawlability resources */
  let origin = "";
  try {
    origin = new URL(page.finalUrl || candidates[0]).origin;
  } catch {
    origin = candidates[0];
  }
  const [robotsTxt, sitemapXml] = await Promise.all([
    resourceExists(origin + "/robots.txt"),
    resourceExists(origin + "/sitemap.xml"),
  ]);

  const s = buildSignals(
    rawHtml,
    bodyHtml,
    page.status,
    page.finalUrl || candidates[0],
    page.xRobotsTag,
    robotsTxt,
    sitemapXml,
    fetchedVia
  );

  const homeUrl = page.finalUrl || candidates[0];
  let domain = "";
  try {
    domain = new URL(homeUrl).hostname.replace(/^www\./, "");
  } catch {
    domain = host.replace(/^www\./, "");
  }

  /* ── DEEP CRAWL: audit the money pages in parallel, bounded ── */
  const maxPages = typeof opts.maxPages === "number" ? Math.max(0, Math.min(10, opts.maxPages)) : 6;
  const homePageAudit: PageAudit = {
    url: homeUrl,
    pageType: "home",
    status: page.status,
    title: s.title,
    titleLen: s.titleLen,
    metaDescription: s.metaDescription,
    h1Count: s.h1Count,
    wordCount: s.wordCount,
    schemaTypes: s.schemaTypes,
    hasProductSchema: s.schemaTypes.some((t) => ["Product", "Offer", "AggregateOffer"].includes(t)),
    price: extractPrice(bodyHtml),
    indexable: s.indexable,
    canonical: s.canonical,
    altCoveragePct: s.altCoveragePct,
    imgTotal: s.imgTotal,
  };
  let crawledPages: PageAudit[] = [];
  if (maxPages > 0) {
    const candidateUrls = extractCandidateUrls(rawHtml, origin, domain, homeUrl, maxPages);
    const settled = await Promise.allSettled(candidateUrls.map((u) => auditOnePage(u)));
    crawledPages = settled
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter((p): p is PageAudit => Boolean(p));
  }
  const pages: PageAudit[] = [homePageAudit, ...crawledPages];

  /* ── site-level intelligence a single page cannot see ── */
  const siteFindings = detectSiteFindings(s, homeUrl, pages);
  const content = assessContent(pages);
  const profile = buildBusinessProfile(s, pages);
  const derivedKeyword = (opts.keyword || profile.primaryKeywords.slice(0, 2).join(" ") || "").trim();
  const competitive = await competitiveRead(derivedKeyword, opts.projectId || "", Boolean(opts.enableCompetitive));
  const opportunities = buildOpportunities(siteFindings, content, s, competitive);

  /* live context for algorithm highlights */
  let algoData: any[] = [];
  try {
    const algoR = await db()
      .from("algorithm_knowledge")
      .select("topic,summary")
      .order("freshness_score", { ascending: false })
      .limit(4);
    algoData = algoR.data || [];
  } catch {
    /* non-fatal */
  }

  const ctxParts: string[] = [];
  if (opts.forLead) ctxParts.push("Client name: " + opts.forLead);
  const ca: any = opts.conversationAnalysis || {};
  if (ca.main_need) ctxParts.push("Their main need: " + ca.main_need);
  if (ca.urgency) ctxParts.push("Urgency: " + ca.urgency);

  /* problems = homepage-level deterministic + cross-page findings + content gap */
  const detIssues = [...deterministicIssues(s), ...findingsToIssues(siteFindings)];
  if (pages.length > 1 && !content.hasInformationalContent) {
    detIssues.push({
      issue: "No informational content to capture buyers researching before they purchase",
      severity: "medium",
      explanation: content.gapSummary,
      fix: "Publish buyer-intent content — buying guides, product comparisons and an FAQ — and link it to the product pages.",
      algorithmNote: "The Helpful Content system rewards genuinely useful, in-depth content.",
      category: "Content Quality",
    });
  }

  /* strengths (never placed in an issues array) — homepage + deep */
  const strengths = [...strengthNotes(s)];
  const richProductPages = pages.filter((p) => p.pageType === "product" && p.wordCount >= 200);
  if (richProductPages.length >= 2)
    strengths.push(
      `Product pages carry detailed, specific copy (${richProductPages.length} pages with full specifications), which both search engines and buyers reward.`
    );
  if (profile.priceRange)
    strengths.push(
      `Pricing is transparent on-page (${profile.priceRange}), which builds buyer trust and enables Product schema rich results.`
    );

  const narrated = await narrate(host, s, detIssues, strengths, ctxParts, opts.salesContext || "", algoData, {
    pages,
    findings: siteFindings,
    content,
    profile,
    competitive,
    opportunities,
  });

  /* assemble categories: deterministic facts are authoritative; LLM adds prose + strategy.
     STRENGTHS are NOT placed in any issues array — every consumer treats issues as
     problems. They live in AuditResult.strengths and in the narrative instead. */
  const catNames = ["Technical SEO", "On-Page SEO", "Content Quality", "User Experience"];
  const strategic = narrated?.strategic || [];
  const allIssues = [...detIssues, ...strategic];
  const categories: AuditCategory[] = catNames.map((name) => {
    const issues = allIssues.filter((i) => (i.category || "Technical SEO") === name);
    /* User Experience has no deterministic facts here (needs a live perf run) — seed one honest note */
    if (name === "User Experience" && !issues.length) {
      issues.push({
        issue: "Core Web Vitals not measured in this instant pass",
        severity: "low",
        explanation:
          "Instant audit does not run a full performance test. Core Web Vitals (LCP, CLS, INP) are a confirmed ranking factor and should be checked on key pages.",
        fix: "Run Google PageSpeed Insights on the homepage and top product pages; target 90-plus on mobile with LCP under 2.5 seconds.",
        algorithmNote: "Core Web Vitals have been a ranking signal since 2021.",
        category: "User Experience",
      });
    }
    const scoreForCat = scoreCategory(name, issues, s);
    return {
      name,
      score: scoreForCat,
      narrative: narrated?.narratives?.[name] || "",
      issues,
    };
  });

  const overall = Math.round(categories.reduce((a, c) => a + c.score, 0) / categories.length);
  const flat = categories.flatMap((c) => c.issues.map((i) => ({ ...i, category: c.name })));

  return {
    success: true,
    url: host,
    reachable: true,
    blocked: false,
    score: overall,
    executiveSummary:
      narrated?.executiveSummary ||
      `${host} is a ${s.platform || "live"} site audited across ${pages.length} ${pages.length === 1 ? "page" : "pages"}, with ${detIssues.length} identified SEO ${detIssues.length === 1 ? "gap" : "gaps"}${strengths.length ? " alongside genuine strengths (" + strengths.length + " noted)" : ""}. ${s.indexable ? "It is indexable" : "It is currently set to noindex"} and ${s.verificationTags.length ? "already known to search engines" : "should be connected to Search Console"}.`,
    categories,
    issues: flat,
    quickWins: narrated?.quickWins?.length
      ? narrated.quickWins
      : opportunities
          .filter((o) => o.effort === "low")
          .slice(0, 3)
          .map((o) => o.title),
    algorithmHighlights: algoData.map((a: any) => `${a.topic}: ${(a.summary || "").slice(0, 100)}`).slice(0, 2),
    showcase_message: narrated?.showcase_message || "",
    contextSummary: narrated?.contextSummary || "",
    platform: s.platform,
    indexable: s.indexable,
    businessSummary: s.businessSummary,
    strengths,
    signals: s,
    /* deep facets */
    auditDepth: pages.length > 1 ? "deep" : "homepage",
    pagesAudited: pages,
    siteFindings,
    contentAssessment: content,
    businessProfile: profile,
    competitive,
    opportunities,
  };
}

function emptyResult(host: string): AuditResult {
  return {
    success: true,
    url: host,
    reachable: true,
    score: 50,
    executiveSummary: "",
    categories: [],
    issues: [],
    quickWins: [],
    algorithmHighlights: [],
    showcase_message: "",
    contextSummary: "",
  };
}
