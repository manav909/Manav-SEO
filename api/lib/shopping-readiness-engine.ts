/* ════════════════════════════════════════════════════════════════
   api/lib/shopping-readiness-engine.ts

   Google Shopping READINESS audit. It does NOT create or manage ad campaigns —
   that is execution work inside the client's Google Ads / Merchant Center
   account and is done by a human with account access. What it DOES, honestly
   and from the site's real markup, is check whether the product pages carry the
   structured product data a healthy Merchant Center feed needs: Product/Offer
   schema, price and currency, availability, an image, and product identifiers
   (GTIN, MPN, brand). It then produces a prioritised readiness plan.

   Everything is read from the pages themselves. If the site is not an
   e-commerce site, it says so rather than inventing products.
═══════════════════════════════════════════════════════════════ */

import { fetchHtml, resolveTargetUrls } from "./workspace/shared.js";

function jsonLdBlocks(html: string): any[] {
  const out: any[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim()); (Array.isArray(j) ? j : [j]).forEach(x => out.push(x)); } catch { /* skip malformed */ }
  }
  return out;
}
function findProductNode(blocks: any[]): any | null {
  const scan = (node: any): any | null => {
    if (!node || typeof node !== "object") return null;
    const t = node["@type"];
    if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) return node;
    if (Array.isArray(node["@graph"])) for (const g of node["@graph"]) { const f = scan(g); if (f) return f; }
    return null;
  };
  for (const b of blocks) { const f = scan(b); if (f) return f; }
  return null;
}
function productLinks(html: string, origin: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = m[1];
    if (/\/(products?|shop|store|p)\/[a-z0-9]/i.test(href) && !/\.(jpg|png|css|js|svg)(\?|$)/i.test(href)) {
      try { out.add(new URL(href, origin).href); } catch { /* skip */ }
    }
  }
  return Array.from(out).slice(0, 4);
}

export async function auditShoppingReadiness(opts: { projectId: string; siteUrl?: string }): Promise<{
  ok: boolean; site: string; is_ecommerce: boolean; platform: string;
  product_pages_checked: number;
  signals: { product_schema: boolean; price: boolean; currency: boolean; availability: boolean; image: boolean; brand: boolean; identifier: boolean; rating: boolean };
  action_plan: Array<{ priority: 1 | 2 | 3; action: string; why: string }>;
  summary: string; notes: string[];
}> {
  let siteUrl = String(opts.siteUrl || "").trim();
  if (!siteUrl) { const tu = await resolveTargetUrls(undefined, opts.projectId).catch(() => ({ urls: [] as string[], source: "" })); siteUrl = (tu.urls || [])[0] || ""; }
  const base = { ok: false, site: siteUrl, is_ecommerce: false, platform: "", product_pages_checked: 0, signals: { product_schema: false, price: false, currency: false, availability: false, image: false, brand: false, identifier: false, rating: false }, action_plan: [] as Array<{ priority: 1 | 2 | 3; action: string; why: string }> };
  if (!siteUrl) return { ...base, summary: "Supply the store URL to audit Shopping readiness.", notes: ["site URL required"] };

  const home = await fetchHtml(siteUrl).catch(() => "");
  if (!home) return { ...base, summary: `Could not fetch ${siteUrl} (the site may be blocking automated requests).`, notes: ["homepage could not be fetched"] };

  const h = home.toLowerCase();
  const platform = /cdn\.shopify|myshopify/.test(h) ? "Shopify" : /woocommerce|wc-|wp-content.*woo/.test(h) ? "WooCommerce" : /bigcommerce/.test(h) ? "BigCommerce" : /squarespace/.test(h) ? "Squarespace Commerce" : /wixstores|wix.*ecom/.test(h) ? "Wix Stores" : "";
  let origin = siteUrl; try { origin = new URL(siteUrl).origin; } catch { /* keep */ }

  /* Find product pages: from links, or the homepage itself if it carries Product schema. */
  const candidates = productLinks(home, origin);
  const pagesToCheck = candidates.length ? candidates : [siteUrl];
  const sig = { product_schema: false, price: false, currency: false, availability: false, image: false, brand: false, identifier: false, rating: false };
  let checked = 0; let sawProduct = false;
  for (const url of pagesToCheck) {
    const html = url === siteUrl ? home : await fetchHtml(url).catch(() => "");
    if (!html) continue;
    checked++;
    const prod = findProductNode(jsonLdBlocks(html));
    if (prod) {
      sawProduct = true; sig.product_schema = true;
      const offers = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
      if (offers?.price || offers?.lowPrice) sig.price = true;
      if (offers?.priceCurrency) sig.currency = true;
      if (offers?.availability) sig.availability = true;
      if (prod.image) sig.image = true;
      if (prod.brand) sig.brand = true;
      if (prod.gtin || prod.gtin13 || prod.gtin12 || prod.mpn || prod.sku) sig.identifier = true;
      if (prod.aggregateRating) sig.rating = true;
    }
  }
  const is_ecommerce = sawProduct || !!platform || /add to cart|add-to-cart|\/cart|data-product|product-price/i.test(home);

  const plan: Array<{ priority: 1 | 2 | 3; action: string; why: string }> = [];
  if (!is_ecommerce) {
    return { ...base, ok: true, site: siteUrl, platform, product_pages_checked: checked, signals: sig,
      summary: `This does not look like an e-commerce site (no product pages, product schema, or cart detected). Google Shopping needs a product catalogue; confirm the store URL, or this brief item may not apply.`,
      notes: ["No product signals found — Shopping readiness could not be assessed.", "Campaign creation and management are handled in Google Ads / Merchant Center by a human with account access; this engine only audits on-site product-data readiness."] };
  }
  if (!sig.product_schema) plan.push({ priority: 1, action: "Add Product structured data (schema) to every product page — name, image, description, brand, and an Offer with price, priceCurrency and availability.", why: "Merchant Center and Google Shopping read structured product data; without it, the feed is thin and products can be disapproved or under-served." });
  else {
    if (!sig.identifier) plan.push({ priority: 1, action: "Add product identifiers (GTIN, or MPN + brand) to the Product schema and feed.", why: "Google matches your products to the catalogue via GTIN/MPN; missing identifiers suppress reach and raise CPCs." });
    if (!sig.availability) plan.push({ priority: 2, action: "Expose availability (InStock/OutOfStock) in the Offer.", why: "Merchant Center requires availability; wrong or missing values cause disapprovals." });
    if (!sig.price || !sig.currency) plan.push({ priority: 2, action: "Ensure every Offer has price and priceCurrency in the markup.", why: "Price mismatches between the page and the feed are the most common cause of Shopping disapprovals." });
    if (!sig.rating) plan.push({ priority: 3, action: "Add product review/rating markup (aggregateRating) where you have genuine reviews.", why: "Ratings show as stars in Shopping and organic, lifting click-through." });
  }
  plan.push({ priority: 1, action: `Set up (or verify) Google Merchant Center and connect the product feed${platform ? ` — on ${platform} this is a native channel/app, the cleanest feed source` : ""}.`, why: "The Merchant Center feed is what actually powers Shopping ads; the on-page schema above is the quality signal behind it." });
  plan.push({ priority: 2, action: "Once the feed is approved, build the Shopping campaign structure and bid strategy in Google Ads (delivery work, done with account access).", why: "Campaign setup, budgets and bidding live in the ad account and are managed by a human — this audit gets the product data right so the campaigns perform." });
  plan.sort((a, b) => a.priority - b.priority);

  const present = Object.values(sig).filter(Boolean).length;
  const summary = `${siteUrl}${platform ? ` (${platform})` : ""} is an e-commerce site. Across ${checked} product page(s) checked, the product-data readiness for a Google Shopping feed is ${sig.product_schema ? `${present}/8 signals present` : "weak — no Product schema found"}. ${sig.product_schema ? `Missing: ${Object.entries(sig).filter(([, v]) => !v).map(([k]) => k.replace(/_/g, " ")).join(", ") || "nothing — the product data is feed-ready"}.` : "The first job is adding Product/Offer structured data."} Campaign creation and management happen in Google Ads / Merchant Center with account access; this audit gets the on-site product data right first.`;

  return { ok: true, site: siteUrl, is_ecommerce, platform, product_pages_checked: checked, signals: sig, action_plan: plan, summary,
    notes: [
      "Read from the product pages' real markup — product signals are what is actually present, not assumed.",
      "This audits ON-SITE product-data readiness only. Creating and managing Shopping campaigns, budgets and bids is delivery work performed in the client's Google Ads / Merchant Center account by a human — this engine does not access ad accounts or run campaigns.",
    ] };
}
