/* ════════════════════════════════════════════════════════════════
   api/lib/schema-llms-engine.ts

   Generates JSON-LD structured data and an llms.txt file for a site.

   Design principle (non-negotiable): FULLY DETERMINISTIC. No LLM in the
   generation path. Every value emitted is extracted from the page's real
   HTML — a title, a canonical, an Open Graph tag, an existing schema field,
   or the URL path. Nothing is inferred or invented. If a field is not
   present in the markup, it is reported as a gap to fill, never guessed.
   This is the only way to promise "100% accurate": the output cannot contain
   a value the page does not actually carry.

   Fetch goes through the hardened, challenge-aware fetchHtml, so a WAF
   interstitial is never parsed as a real page.
═══════════════════════════════════════════════════════════════ */

import { fetchHtml } from "./workspace/shared.js";

type Depth = "sample" | "standard" | "deep";
const DEPTH_PAGES: Record<Depth, number> = { sample: 5, standard: 15, deep: 40 };

interface PageResult {
  url: string;
  fetched: boolean;
  title: string;
  description: string;
  canonical: string;
  existing_schema: string[];
  generated: any[];          // JSON-LD objects grounded in real values
  grounded_on: string[];     // what each generated block was built from
  gaps: string[];            // fields absent from markup — supply to enrich
}

/* ── deterministic extractors ─────────────────────────────────── */
function firstMatch(re: RegExp, html: string): string {
  const m = html.match(re); return m ? (m[1] || "").trim() : "";
}
function titleOf(html: string): string {
  return firstMatch(/<title[^>]*>([^<]*)<\/title>/i, html);
}
function metaName(html: string, name: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const n = (tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (n && n.toLowerCase() === name.toLowerCase()) {
      const c = (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || [])[1];
      if (c != null) return c.trim();
    }
  }
  return "";
}
function canonicalOf(html: string): string {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (/\brel\s*=\s*["']canonical["']/i.test(tag)) {
      const h = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (h) return h.trim();
    }
  }
  return "";
}
function existingSchema(html: string): { types: string[]; raw: any[] } {
  const types = new Set<string>(); const raw: any[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim()); raw.push(j);
      const walk = (o: any) => {
        if (!o) return; if (Array.isArray(o)) return o.forEach(walk);
        const t = o["@type"]; if (t) (Array.isArray(t) ? t : [t]).forEach((x: any) => types.add(String(x)));
        if (o["@graph"]) walk(o["@graph"]);
      };
      walk(j);
    } catch { /* skip unparseable */ }
  }
  return { types: Array.from(types), raw };
}
/* Price/availability ONLY from explicit markup — OG product tags, itemprop, or
   an existing Product schema. Never scraped from arbitrary visible text, which
   would risk a wrong price. */
function productSignals(html: string): { price: string; currency: string; availability: string; found: boolean } {
  const price = metaName(html, "product:price:amount") || metaName(html, "og:price:amount")
    || firstMatch(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i, html)
    || firstMatch(/content=["']([^"']+)["'][^>]*itemprop=["']price["']/i, html);
  const currency = metaName(html, "product:price:currency") || metaName(html, "og:price:currency")
    || firstMatch(/itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i, html) || "";
  const availRaw = metaName(html, "product:availability") || metaName(html, "og:availability")
    || firstMatch(/itemprop=["']availability["'][^>]*(?:content|href)=["']([^"']+)["']/i, html) || "";
  const availability = /instock|in stock|available/i.test(availRaw) ? "https://schema.org/InStock"
    : /outofstock|out of stock/i.test(availRaw) ? "https://schema.org/OutOfStock" : "";
  return { price: price.replace(/[^0-9.]/g, ""), currency, availability, found: !!price };
}
function sameOriginLinks(html: string, origin: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#?]+)["']/gi)) {
    let href = m[1]; if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try { const u = new URL(href, origin); if (u.origin === origin) out.add(u.toString().split("#")[0].replace(/\/$/, "")); } catch { /* skip */ }
  }
  return Array.from(out);
}

/* ── grounded JSON-LD builders (only real values in, or the block is skipped) ── */
function breadcrumbFor(url: string, title: string): any | null {
  let u: URL; try { u = new URL(url); } catch { return null; }
  const segs = u.pathname.split("/").filter(Boolean);
  if (!segs.length) return null;
  const items = [{ "@type": "ListItem", position: 1, name: "Home", item: u.origin }];
  let path = u.origin;
  segs.forEach((seg, i) => {
    path += "/" + seg;
    const name = i === segs.length - 1 && title ? title : seg.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    items.push({ "@type": "ListItem", position: i + 2, name, item: path });
  });
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items };
}

function stripTags(s: string): string {
  return s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}
/* Deterministic FAQ detection — real Q&A already on the page. Catches native
   <details> accordions, question-form headings, and common accordion/toggle
   markup (Elementor, Bootstrap). Every pair is grounded in the page; nothing is
   invented. This is the biggest AEO miss on most sites. */
function extractFaqs(html: string): Array<{ q: string; a: string }> {
  const faqs: Array<{ q: string; a: string }> = [];
  const seen = new Set<string>();
  const looksLikeQuestion = (q: string) => /\?$/.test(q) || /^(what|who|how|why|when|where|can|do|does|is|are|should|which|will|may|might)\b/i.test(q);
  const push = (q0: string, a0: string) => {
    const q = q0.trim(), a = a0.trim();
    if (q.length < 8 || q.length > 220 || a.length < 20 || a.length > 1400) return;
    if (!looksLikeQuestion(q)) return;
    const k = q.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(k)) return; seen.add(k);
    faqs.push({ q, a });
  };
  /* 1. native <details><summary>Q</summary> A </details> */
  for (const m of html.matchAll(/<details[^>]*>([\s\S]*?)<\/details>/gi)) {
    const inner = m[1];
    const qm = inner.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
    if (qm) push(stripTags(qm[1]), stripTags(inner.replace(/<summary[\s\S]*?<\/summary>/i, "")));
  }
  /* 2. question-form headings (h2-h5) followed by their content block */
  const parts = html.split(/(?=<h[2-5][\s>])/i);
  for (const part of parts) {
    const hm = part.match(/^<h[2-5][^>]*>([\s\S]*?)<\/h[2-5]>/i);
    if (!hm) continue;
    const q = stripTags(hm[1]);
    if (!looksLikeQuestion(q)) continue;
    push(q, stripTags(part.replace(/^<h[2-5][^>]*>[\s\S]*?<\/h[2-5]>/i, "")).slice(0, 900));
  }
  /* 3. accordion/toggle title -> adjacent content (Elementor, Bootstrap, generic) */
  for (const m of html.matchAll(/class=["'][^"']*(?:accordion-title|faq-question|elementor-(?:accordion|toggle|tab)-title|toggle-title|question)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>([\s\S]{0,120}?)class=["'][^"']*(?:accordion-content|faq-answer|elementor-(?:accordion|toggle|tab)-content|toggle-content|answer|elementor-tab-content)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/gi)) {
    push(stripTags(m[1]), stripTags(m[3]));
  }
  return faqs.slice(0, 12);
}
/* Real social profiles for Organization.sameAs — the authoritative links Google
   and AI engines use to confirm entity identity. Extracted from the page, never
   guessed. */
function extractSocialLinks(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.match(/https?:\/\/(?:www\.)?(?:facebook|linkedin|twitter|x|instagram|youtube|tiktok|pinterest|crunchbase)\.com\/[^\s"'<>)]+/gi) || []) {
    const u = m.replace(/[),.]+$/, "");
    if (!/\/(?:sharer|share|intent|plugins|dialog)\b/i.test(u)) out.add(u);
  }
  return Array.from(out).slice(0, 8);
}
function extractPhone(html: string): string {
  return (html.match(/tel:\s*([+\d][\d\s().\-]{6,})/i) || [])[1]?.trim().replace(/\s+/g, " ") || "";
}
/* Person schema from a real team/bio page: name from the URL slug, role from the
   H1/title where present. Only on obvious team pages; never invented. */
function personFromPage(url: string, html: string): { name: string; jobTitle: string } | null {
  let path = ""; try { path = new URL(url).pathname.toLowerCase(); } catch { return null; }
  const m = path.match(/\/(?:team-?members?|team|people|staff)\/([a-z0-9-]+)\/?$/);
  if (!m) return null;
  const slug = m[1];
  if (slug.length < 3 || /^\d+$/.test(slug)) return null;
  const name = slug.split("-").filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
  const h1text = h1 ? stripTags(h1) : "";
  let jobTitle = "";
  const roleMatch = h1text.match(/\b(CEO|CFO|COO|CTO|President|Vice President|VP|Founder|Co-?Founder|Partner|Director|Managing Director|Principal|Manager|Associate|Advisor|Consultant|Agent|Broker|Analyst|Controller|Coordinator)\b/i);
  if (roleMatch) jobTitle = roleMatch[0];
  return { name, jobTitle };
}

export function buildForPage(url: string, html: string, isHome: boolean): PageResult {
  const title = titleOf(html);
  const description = metaName(html, "description");
  const canonical = canonicalOf(html) || url;
  const ex = existingSchema(html);
  const generated: any[] = []; const grounded: string[] = []; const gaps: string[] = [];

  /* WebPage — always groundable from title + canonical. */
  if (title) {
    const wp: any = { "@context": "https://schema.org", "@type": "WebPage", name: title, url: canonical };
    if (description) wp.description = description; else gaps.push("meta description missing — add one to enrich WebPage/SEO snippet");
    generated.push(wp); grounded.push("title + canonical" + (description ? " + meta description" : ""));
  } else gaps.push("no <title> found — cannot ground WebPage schema");

  /* BreadcrumbList — from the real URL path. */
  const bc = breadcrumbFor(canonical, title);
  if (bc) { generated.push(bc); grounded.push("URL path segments"); }

  /* Organization + WebSite — homepage only, from real site identity tags. */
  if (isHome) {
    const siteName = metaName(html, "og:site_name") || title;
    const logo = metaName(html, "og:image");
    const social = extractSocialLinks(html);
    const phone = extractPhone(html);
    let origin = ""; try { origin = new URL(canonical).origin; } catch { origin = url; }
    if (siteName) {
      const org: any = { "@context": "https://schema.org", "@type": "Organization", name: siteName, url: origin };
      if (logo) org.logo = logo; else gaps.push("no og:image on homepage — supply a logo URL for Organization.logo");
      if (social.length) org.sameAs = social;
      if (phone) org.telephone = phone;
      generated.push(org);
      grounded.push("og:site_name / title" + (logo ? " + og:image" : "") + (social.length ? ` + ${social.length} social profile(s)` : "") + (phone ? " + phone" : ""));
      generated.push({ "@context": "https://schema.org", "@type": "WebSite", name: siteName, url: origin });
      if (!social.length) gaps.push("no social profile links found on the homepage — add them (usually footer icons) so Organization.sameAs can confirm your entity to Google and AI engines (important where a brand competes with sibling brands)");
    }
  }

  /* FAQPage — from REAL Q&A already on the page. The single biggest AEO win most
     sites leave on the table: an FAQ section with no FAQPage markup. */
  if (!ex.types.includes("FAQPage")) {
    const faqs = extractFaqs(html);
    if (faqs.length >= 2) {
      generated.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
      grounded.push(`${faqs.length} real FAQ Q&A pair(s) found on the page — a strong AEO / rich-result opportunity`);
    }
  }

  /* Person — on a real team/bio page, from the URL and the H1. */
  const person = personFromPage(url, html);
  if (person && person.name && !ex.types.includes("Person")) {
    const ps: any = { "@context": "https://schema.org", "@type": "Person", name: person.name, url: canonical };
    if (person.jobTitle) ps.jobTitle = person.jobTitle;
    generated.push(ps);
    grounded.push(`team/bio page — Person "${person.name}"${person.jobTitle ? ` (${person.jobTitle})` : ""} from the URL and heading`);
  }

  /* Product Offer — ONLY if price is in the markup. Never invented. */
  const p = productSignals(html);
  if (p.found && title) {
    const offer: any = { "@type": "Offer", price: p.price };
    if (p.currency) offer.priceCurrency = p.currency; else gaps.push("price found but no currency in markup — supply priceCurrency");
    if (p.availability) offer.availability = p.availability;
    const product: any = { "@context": "https://schema.org", "@type": "Product", name: title, offers: offer };
    if (canonical) product.url = canonical;
    if (description) product.description = description;
    generated.push(product); grounded.push("explicit price markup (OG/itemprop/existing schema)");
  } else {
    /* Only flag a genuine product page — a strong e-commerce signal, NOT the mere
       presence of the word "price" (which appears on plenty of non-shop sites,
       e.g. a VC firm's "share price" or legal text). Firing on "price" is what
       told a venture-capital site to add Product/Offer schema. */
    const strongProduct = /property=["']og:type["'][^>]*content=["']product|content=["']product["'][^>]*property=["']og:type["']|itemprop=["']offers["']|itemtype=["'][^"']*schema\.org\/Product|add to (cart|basket|bag)/i.test(html)
      || /\/(products?|shop|store)\//i.test(url);
    if (strongProduct && !ex.types.includes("Product")) {
      gaps.push("appears to be a product page but no machine-readable price is in the markup — supply price + currency to generate Product/Offer schema");
    }
  }

  return {
    url: canonical, fetched: true, title, description, canonical,
    existing_schema: ex.types, generated, grounded_on: grounded, gaps,
  };
}

function buildLlmsTxt(siteName: string, siteDesc: string, pages: PageResult[]): string {
  const L: string[] = [];
  L.push(`# ${siteName || "Site"}`);
  if (siteDesc) L.push(`\n> ${siteDesc}`);
  L.push(`\n## Pages\n`);
  for (const p of pages) {
    if (!p.fetched || !p.title) continue;
    L.push(`- [${p.title}](${p.canonical})${p.description ? `: ${p.description}` : ""}`);
  }
  L.push(`\n---\n_Generated from a live crawl on ${new Date().toISOString().slice(0, 10)}. Lists ${pages.filter(p => p.fetched && p.title).length} pages with their real titles and meta descriptions._`);
  return L.join("\n");
}

export async function generateSchemaAndLlms(opts: {
  projectId: string;
  siteUrl: string;
  pageUrls?: string[];
  depth?: Depth;
}): Promise<{
  ok: boolean;
  site: string;
  pages: PageResult[];
  llms_txt: string;
  summary: { crawled: number; blocked: number; schema_blocks: number; total_gaps: number };
  note: string;
}> {
  const depth = opts.depth || "standard";
  const cap = DEPTH_PAGES[depth];
  let origin = ""; let homeUrl = opts.siteUrl;
  try { const u = new URL(opts.siteUrl); origin = u.origin; homeUrl = u.origin + "/"; } catch { /* keep as given */ }

  /* Normalise a URL to origin + path without a trailing slash, so the homepage
     is never crawled twice as "/" and "" (the duplicate-row bug). */
  const norm = (u: string) => { try { const x = new URL(u); return (x.origin + x.pathname).replace(/\/+$/, "") || x.origin; } catch { return String(u).replace(/\/+$/, ""); } };

  /* Resolve the page set: caller-supplied, else discover from the homepage. */
  let targets: string[] = (opts.pageUrls && opts.pageUrls.length ? opts.pageUrls : []);
  const homeHtml = await fetchHtml(homeUrl);
  if (!targets.length) {
    targets = [homeUrl, ...sameOriginLinks(homeHtml, origin)];
  } else if (!targets.some(t => norm(t) === norm(homeUrl))) {
    targets = [homeUrl, ...targets];
  }
  /* Dedup by normalised URL (keep first occurrence), then cap. */
  const seen = new Set<string>(); const deduped: string[] = [];
  for (const u of targets) { const n = norm(u); if (seen.has(n)) continue; seen.add(n); deduped.push(u); }
  targets = deduped.slice(0, cap);
  const homeNorm = norm(homeUrl);

  const pages: PageResult[] = [];
  let blocked = 0;
  for (const url of targets) {
    const isHome = norm(url) === homeNorm;
    const html = isHome && homeHtml ? homeHtml : await fetchHtml(url);
    if (!html) {
      blocked++;
      pages.push({ url, fetched: false, title: "", description: "", canonical: url, existing_schema: [], generated: [], grounded_on: [], gaps: ["page could not be fetched (blocked/challenged/unreachable) — verify access; nothing generated so nothing is invented"] });
      continue;
    }
    pages.push(buildForPage(url, html, isHome));
  }

  const siteName = metaName(homeHtml, "og:site_name") || titleOf(homeHtml);
  const siteDesc = metaName(homeHtml, "description");
  return assembleSchemaReport(pages, origin || opts.siteUrl, siteName, siteDesc);
}

/* Aggregate per-page schema results into the report. Shared by the live
   generator above AND the batched crawl (which captures buildForPage results
   during the crawl, so schema uses the SAME pages as the audit — no re-crawl,
   one consistent scope). */
export function assembleSchemaReport(pages: PageResult[], site: string, siteName?: string, siteDesc?: string): {
  ok: boolean; site: string; pages: PageResult[]; llms_txt: string; schema_source?: string;
  summary: { crawled: number; blocked: number; schema_blocks: number; total_gaps: number };
  note: string;
} {
  const name = siteName || pages[0]?.title || "";
  const desc = siteDesc || pages[0]?.description || "";
  const llms_txt = buildLlmsTxt(name, desc, pages);
  const schemaBlocks = pages.reduce((s, p) => s + p.generated.length, 0);
  const totalGaps = pages.reduce((s, p) => s + p.gaps.length, 0);
  const existingTotal = pages.reduce((s, p) => s + (p.existing_schema?.length || 0), 0);
  const crawled = pages.filter(p => p.fetched).length;
  /* Is the existing schema likely CMS/plugin auto-generated? The tell is
     UNIFORMITY — the same base types on most pages. A senior recognises this and
     does not credit a strategy or an agency for a plugin's automatic output. */
  const fetchedPages = pages.filter(p => p.fetched);
  const n = fetchedPages.length || 1;
  const typeCounts: Record<string, number> = {};
  for (const p of fetchedPages) for (const t of new Set(p.existing_schema || [])) typeCounts[t] = (typeCounts[t] || 0) + 1;
  const ubiquitous = Object.entries(typeCounts).filter(([, c]) => c / n >= 0.6).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const likelyPlugin = existingTotal > n * 2 && ubiquitous.length >= 2;
  const schema_source = likelyPlugin
    ? `The same base schema types (${ubiquitous.slice(0, 4).join(", ")}) appear on ${Math.round((typeCounts[ubiquitous[0]] / n) * 100)}%+ of pages — a strong signal this schema is AUTO-GENERATED by the CMS or an SEO plugin (e.g. Yoast/RankMath), not hand-authored. Its presence is not a quality or strategy signal; what matters is whether the high-value, page-specific types are present.`
    : "";
  const existingPhrase = existingTotal === 0
    ? `The site currently has NO structured data (schema) on the crawled pages`
    : `The site has ${existingTotal} existing schema block(s) across the crawled pages${likelyPlugin ? " — but these are almost certainly plugin-auto-generated (see below), not a hand-built strategy" : ""}`;
  return {
    ok: pages.some(p => p.fetched),
    site,
    pages,
    llms_txt,
    schema_source,
    summary: { crawled, blocked: pages.filter(p => !p.fetched).length, schema_blocks: schemaBlocks, total_gaps: totalGaps, existing_blocks: existingTotal } as any,
    note: `${existingPhrase}.${schema_source ? ` ${schema_source}` : ""} This engine GENERATED ${schemaBlocks} new JSON-LD block(s) across ${crawled} page(s) — every value grounded in the page's real content — ready to deploy into each page head. ${totalGaps} field(s) flagged to supply, never guessed. An llms.txt file was also generated for the site root.`,
  };
}
