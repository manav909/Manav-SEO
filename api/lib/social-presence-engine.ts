/* ════════════════════════════════════════════════════════════════
   api/lib/social-presence-engine.ts

   Social-presence audit. Reviews the REAL, checkable social signals on a
   site — its Open Graph and Twitter Card tags (which control how the site
   looks when shared), and the social profiles it links to — and produces a
   prioritised list of concrete improvements.

   Everything is read from the page's actual markup. Nothing about the brand's
   social accounts is assumed or invented: if a profile is not linked from the
   site, the engine says so and recommends adding it, rather than guessing that
   it exists.
═══════════════════════════════════════════════════════════════ */

import { fetchHtml, resolveTargetUrls } from "./workspace/shared.js";

function metaTag(html: string, key: string): string {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]*>`, "i");
  const m = html.match(re);
  if (!m) return "";
  const c = m[0].match(/content=["']([^"']*)["']/i);
  return c ? c[1].trim() : "";
}

function extractSocialLinks(html: string): Array<{ platform: string; url: string }> {
  const out: Array<{ platform: string; url: string }> = [];
  const seen = new Set<string>();
  const patterns: Array<[string, RegExp]> = [
    ["Facebook", /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>)]+/i],
    ["Instagram", /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>)]+/i],
    ["X (Twitter)", /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s"'<>)]+/i],
    ["LinkedIn", /https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'<>)]+/i],
    ["YouTube", /https?:\/\/(?:www\.)?youtube\.com\/[^\s"'<>)]+/i],
    ["TikTok", /https?:\/\/(?:www\.)?tiktok\.com\/[^\s"'<>)]+/i],
    ["Pinterest", /https?:\/\/(?:www\.)?pinterest\.[a-z.]+\/[^\s"'<>)]+/i],
  ];
  for (const [platform, re] of patterns) {
    const m = html.match(re);
    if (m) {
      const u = m[0].replace(/[),.]+$/, "");
      if (!/\/(?:sharer|share|intent|plugins|dialog)\b/i.test(u) && !seen.has(platform)) { seen.add(platform); out.push({ platform, url: u }); }
    }
  }
  return out;
}

export async function auditSocialPresence(opts: { projectId: string; siteUrl?: string; brand?: string }): Promise<{
  ok: boolean; site: string;
  open_graph: Record<string, string>; open_graph_missing: string[];
  twitter_card: Record<string, string>; twitter_card_missing: string[];
  social_links: Array<{ platform: string; url: string }>;
  suggestions: Array<{ priority: 1 | 2 | 3; suggestion: string; why: string }>;
  summary: string; notes: string[];
}> {
  let siteUrl = String(opts.siteUrl || "").trim();
  if (!siteUrl) { const tu = await resolveTargetUrls(undefined, opts.projectId).catch(() => ({ urls: [] as string[], source: "" })); siteUrl = (tu.urls || [])[0] || ""; }
  if (!siteUrl) return { ok: false, site: "", open_graph: {}, open_graph_missing: [], twitter_card: {}, twitter_card_missing: [], social_links: [], suggestions: [], summary: "Supply the site URL to audit social presence.", notes: ["site URL required"] };

  const html = await fetchHtml(siteUrl).catch(() => "");
  if (!html) return { ok: false, site: siteUrl, open_graph: {}, open_graph_missing: [], twitter_card: {}, twitter_card_missing: [], social_links: [], suggestions: [], summary: `Could not fetch ${siteUrl} to read its social tags (the site may be blocking automated requests).`, notes: ["homepage could not be fetched"] };

  const open_graph: Record<string, string> = {
    "og:title": metaTag(html, "og:title"), "og:description": metaTag(html, "og:description"),
    "og:image": metaTag(html, "og:image"), "og:type": metaTag(html, "og:type"),
    "og:url": metaTag(html, "og:url"), "og:site_name": metaTag(html, "og:site_name"),
  };
  const twitter_card: Record<string, string> = {
    "twitter:card": metaTag(html, "twitter:card"), "twitter:title": metaTag(html, "twitter:title"),
    "twitter:description": metaTag(html, "twitter:description"), "twitter:image": metaTag(html, "twitter:image"),
    "twitter:site": metaTag(html, "twitter:site"),
  };
  const open_graph_missing = Object.entries(open_graph).filter(([, v]) => !v).map(([k]) => k);
  const twitter_card_missing = Object.entries(twitter_card).filter(([, v]) => !v).map(([k]) => k);
  const social_links = extractSocialLinks(html);
  const linked = new Set(social_links.map(s => s.platform));

  const suggestions: Array<{ priority: 1 | 2 | 3; suggestion: string; why: string }> = [];
  if (!open_graph["og:image"]) suggestions.push({ priority: 1, suggestion: "Add an og:image (a 1200x630 share image) to the homepage and key pages.", why: "Without it, every link shared on Facebook, LinkedIn, WhatsApp and Slack renders as a bare grey box — the single biggest hit to social click-through." });
  if (!open_graph["og:title"] || !open_graph["og:description"]) suggestions.push({ priority: 1, suggestion: `Add the missing Open Graph tags (${[!open_graph["og:title"] && "og:title", !open_graph["og:description"] && "og:description"].filter(Boolean).join(", ")}).`, why: "These set the headline and summary shown when your pages are shared — without them the platform guesses from page content, usually badly." });
  if (!twitter_card["twitter:card"]) suggestions.push({ priority: 2, suggestion: "Add Twitter Card tags (twitter:card=summary_large_image, plus title, description and image).", why: "Controls how links preview on X/Twitter — a large-image card earns far more engagement than a plain link." });
  if (!social_links.length) suggestions.push({ priority: 1, suggestion: "Add and link your social profiles from the site (usually footer icons).", why: "No social links were found on the site — Google and visitors cannot connect your site to your social presence, weakening brand and entity signals." });
  else {
    const baseline = ["Facebook", "Instagram", "LinkedIn"].filter(p => !linked.has(p));
    if (baseline.length) suggestions.push({ priority: 2, suggestion: `Link your ${baseline.join(", ")} profile(s) from the site (and confirm the ones you already link are active and on-brand).`, why: "Cross-linking site and profiles strengthens brand/entity signals and gives visitors a consistent presence to follow." });
  }
  suggestions.push({ priority: 3, suggestion: "Ensure every linked profile is complete and on-brand — same name, logo and bio — and links back to the site.", why: "Consistent, reciprocal linking is how search engines confirm the profiles genuinely belong to the brand." });
  suggestions.sort((a, b) => a.priority - b.priority);

  const ogPresent = 6 - open_graph_missing.length;
  const summary = `On ${siteUrl}: Open Graph tags are ${open_graph_missing.length === 0 ? "fully present" : `${ogPresent}/6 present (missing ${open_graph_missing.join(", ")})`}, Twitter Card tags are ${twitter_card_missing.length === 5 ? "absent" : `${5 - twitter_card_missing.length}/5 present`}, and the site links to ${social_links.length} social profile(s)${social_links.length ? ` (${social_links.map(s => s.platform).join(", ")})` : ""}.${!open_graph["og:image"] ? " The most urgent fix is the missing share image (og:image), which makes shared links look broken." : ""}`;

  return {
    ok: true, site: siteUrl,
    open_graph, open_graph_missing, twitter_card, twitter_card_missing, social_links, suggestions, summary,
    notes: [
      "Read from the homepage's real markup — the tags and profile links are what is actually on the page, not assumed.",
      "This checks the SITE's social signals and links; it does not log in to or audit the content inside each social account.",
    ],
  };
}
