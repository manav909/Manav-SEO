/* QA Desk engine.

   A standing quality assurance operation over delivery workbooks, not a one shot
   check. The design points that matter:

   AGENDA FIRST. Before anything is checked, an agenda is built from the client
   persona, the project and the commitment mail. Every row is then judged against
   that agenda, so the pass is what a senior practitioner would actually look for
   on this account rather than a generic sweep. The agenda is stored and reused on
   every later round so successive checks stay consistent.

   ONE TAB PER SLOT. A workbook can carry many tabs and thousands of rows. Each
   call processes a bounded slice of a single tab and returns a cursor, so the
   work spreads across as many calls as it needs and no single call can time out.
   Progress is persisted, so an interrupted review resumes where it stopped.

   ROUNDS. When an executive resubmits after fixing remarks, the review moves to a
   recheck round. Only unresolved findings are re examined, findings that now pass
   are marked resolved against the round that fixed them, and the history stays.

   PROFILES. Every finding carries a mistake category, so an executive profile is
   the accumulated record of their real work rather than an opinion. */

import { db } from "./db.js";
import { checkOne } from "./report-verify.js";
import { loadGsc, fetchHtml } from "./workspace/shared.js";
import { llmComplete } from "./workspace/llm.js";

type CheckStatusLite = "verified" | "failed" | "partial" | "unverifiable";

const ROWS_PER_SLOT = 25;                 // bounded slice: comfortably inside the function budget
const norm = (s: any) => String(s || "").toLowerCase().trim();

function domainOf(u: string): string {
  const s = String(u || "").trim();
  if (!s) return "";
  try { return new URL(s.startsWith("http") ? s : "https://" + s).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

/* Read the client chat, the calls and the mail, and fill the review fields from
   them, so the reviewer types nothing that the record already contains. */
/* Hosts that appear in a client conversation but are never the client's own site:
   the marketplace the chat happens on, mail providers, link shorteners, social and
   search. Without this the first URL in a Fiverr thread is a Fiverr profile link,
   and a naive pass would offer that as the site to audit. */
const NOT_CLIENT_HOST = /(^|\.)(fiverr|upwork|freelancer|peopleperhour|linkedin|facebook|instagram|twitter|x|t|youtube|whatsapp|telegram|gmail|googlemail|google|bing|yahoo|outlook|hotmail|mail|drive|docs|dropbox|wetransfer|zoom|calendly|meet|loom|bit|tinyurl|lnkd|goo)\.[a-z.]{2,}$/i;

/* Domains and URLs read from the text itself, with no model involved. A URL in a
   conversation is a fact on the page, so it must never depend on an LLM answering
   in valid JSON. This is the floor the extraction can never fall below. */
function domainsInText(text: string): { urls: string[]; domains: string[] } {
  const urls: string[] = []; const domains: string[] = [];
  const seenU = new Set<string>(); const seenD = new Set<string>();
  /* isUrl distinguishes a literal address written in the text from a bare domain
     mention. Only the former may be reported as a page URL: adding a synthesised
     root for every bare mention would put a URL in target_urls that nobody ever
     wrote, which is fabrication however small. */
  const push = (raw: string, isUrl: boolean) => {
    let u = String(raw || "").trim().replace(/[),.;:'"\]]+$/, "");
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    let host = "";
    try { host = new URL(u).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return; }
    if (!host.includes(".") || NOT_CLIENT_HOST.test(host)) return;
    if (isUrl && !seenU.has(u.toLowerCase())) { seenU.add(u.toLowerCase()); urls.push(u); }
    if (!seenD.has(host)) { seenD.add(host); domains.push(host); }
  };
  for (const m of String(text || "").matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) push(m[0], true);
  for (const m of String(text || "").matchAll(/\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi)) push(m[0], false);
  /* A bare domain, which is how a client usually types their own site. Restricted
     to plausible public suffixes so ordinary sentences do not register. */
  for (const m of String(text || "").matchAll(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|ai|app|shop|store|au|uk|us|ca|in|nz|de|fr|es|it|nl|ie|asia|org\.au|com\.au|co\.uk|co\.nz|co\.in)\b/gi)) push(m[0], false);
  /* An address is a strong signal of the client's own domain when nothing else
     names it. */
  for (const m of String(text || "").matchAll(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi)) push(m[1], false);
  return { urls, domains };
}

export async function qaExtractContext(opts: { chatText?: string; mailText?: string }) {
  const chatText = String(opts.chatText || "").trim();
  const mailText = String(opts.mailText || "").trim();
  if (!chatText && !mailText) return { success: false, error: "Paste the client chat, the call notes or the mail first." };

  /* Read first, ask second. */
  const seen = domainsInText(`${chatText}\n${mailText}`);

  let p: any = {};
  let readOk = false;
  let readNote = "";
  try {
    const sys = "You read a client conversation, call notes and an internal commitment mail, and pull out the record they already contain. Extract ONLY what is actually present. Return ONLY JSON, with no prose before or after it: {\"client_id\":\"the client's unique handle or account username if one appears, for example a marketplace username. Not their display name\",\"client_name\":\"the person or business name, for example the person who is speaking as the client\",\"site_url\":\"the CLIENT's own website that the work is for. Not a competitor site, not a marketplace profile\",\"bde_name\":\"the person from OUR side who spoke to the client in this conversation, the business development executive. Never the client, and never the person who did the delivery work\",\"persona\":\"three to five sentences on who this client is, how they judge work, and how they communicate\",\"priorities\":[\"what they care about most, in their words\"],\"pain_points\":[\"what they complained about or fear\"],\"competitor_sites\":[\"any competitor domains named, kept separate from the client site\"],\"target_urls\":[\"any page URLs on the client site\"],\"keywords\":[\"any target keywords named\"]}. A pasted conversation carries interface noise such as the words Profile Image, timestamps, Sent, Delivered and Attachment. Ignore that noise and read the human content around it. The name of the person speaking as the client IS the client name even when the paste is short or ragged. Leave a field empty rather than guessing. Never invent a name, a domain or a requirement. The digital marketing executive who did the work is NOT in these documents, so never guess one.";
    const user = [
      chatText ? `Client chat and call notes:\n${chatText.slice(0, 16000)}` : "",
      mailText ? `Commitment mail:\n${mailText.slice(0, 10000)}` : "",
      seen.domains.length ? `Domains that literally appear in the text above, already filtered of marketplaces and mail providers. One of these is probably the client site, but decide from the context and leave it empty if none of them is:\n${seen.domains.join("\n")}` : "",
    ].filter(Boolean).join("\n\n");

    /* Retried once, because the whole record used to be lost when the model
       answered with prose instead of JSON, and that loss was reported as a
       success. */
    for (let attempt = 0; attempt < 2 && !readOk; attempt++) {
      const { text } = await llmComplete({
        system: attempt === 0 ? sys : `${sys} Your previous answer could not be parsed. Return the JSON object and nothing else.`,
        user, maxTokens: 1200, timeoutMs: 60000, label: "qa-extract-context", maxSegments: 1,
      });
      const raw = String(text || "");
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { p = JSON.parse(m[0]); readOk = true; } catch { p = {}; } }
      if (!readOk && attempt === 1) {
        readNote = raw.trim()
          ? "The reading of the conversation could not be parsed, so only what could be read directly from the text is filled in below. Try again, or fill the fields by hand."
          : "The reading of the conversation returned nothing, so only what could be read directly from the text is filled in below. Try again, or fill the fields by hand.";
      }
    }
  } catch (e: any) {
    readNote = `The conversation could not be read (${e?.message || "unknown error"}). Only what could be read directly from the text is filled in below.`;
  }

  /* The deterministic floor. A site the model missed is still recovered from the
     text, and marked as such so the reviewer knows it was pattern matched rather
     than understood. */
  const modelSite = String(p.site_url || "").trim();
  let site_url = modelSite;
  let siteFrom: "read" | "pattern" | "" = modelSite ? "read" : "";
  if (!site_url && seen.domains.length === 1) { site_url = `https://${seen.domains[0]}/`; siteFrom = "pattern"; }

  const client_name = String(p.client_name || "").trim();
  const client_id = String(p.client_id || "").trim();
  const bde_name = String(p.bde_name || "").trim();

  /* Every field says whether it was found and how, so an empty form can never be
     reported as a filled one. */
  const found: string[] = []; const missing: string[] = [];
  const mark = (label: string, value: string, how: string) => { if (value) found.push(`${label} (${how})`); else missing.push(label); };
  mark("client name", client_name, "read");
  mark("client id", client_id, "read");
  mark("website", site_url, siteFrom === "pattern" ? "found in the text" : "read");
  mark("BDE", bde_name, "read");

  const ambiguousSite = !site_url && seen.domains.length > 1 ? seen.domains.slice(0, 6) : [];

  return {
    success: true,
    read_ok: readOk,
    read_note: readNote,
    found, missing,
    site_from: siteFrom,
    site_candidates: ambiguousSite,
    client_id, client_name, site_url, bde_name,
    competitor_sites: Array.isArray(p.competitor_sites) ? p.competitor_sites.map(String) : [],
    persona: String(p.persona || ""),
    priorities: Array.isArray(p.priorities) ? p.priorities.map(String) : [],
    pain_points: Array.isArray(p.pain_points) ? p.pain_points.map(String) : [],
    target_urls: Array.isArray(p.target_urls) ? p.target_urls.map(String) : (seen.urls.length > 1 ? seen.urls.slice(0, 20) : []),
    keywords: Array.isArray(p.keywords) ? p.keywords.map(String) : [],
  };
}

/* Search Console for a QA round, and the honest answer when the site being
   checked is not the project selected in the nav.

   The live page checks always run against the site URL, so they are correct
   either way. Search Console is per project, so if the active project is a
   DIFFERENT site, its data belongs to another client and must not be attached to
   this review. In that case it is deliberately left out and the reason is said
   plainly, rather than quietly reporting the wrong client's numbers. */
export async function qaGscContext(projectId: string, siteUrl: string) {
  const siteDomain = domainOf(siteUrl);
  if (!projectId) {
    return { connected: false, usable: false, mismatch: false, site_domain: siteDomain, rows: [],
      note: "No project is selected in the nav, so Search Console was not used. The live page checks stand on their own for confirming implementation." };
  }
  let projName = "", projDomain = "";
  try {
    const { data: proj } = await db().from("projects").select("name,url").eq("id", projectId).maybeSingle();
    projName = String((proj as any)?.name || ""); projDomain = domainOf(String((proj as any)?.url || ""));
  } catch { /* project lookup optional */ }

  if (projDomain && siteDomain && projDomain !== siteDomain) {
    return { connected: false, usable: false, mismatch: true, project_name: projName, project_domain: projDomain, site_domain: siteDomain, rows: [],
      note: `The active project in the nav is ${projName || projDomain} (${projDomain}), which is a different site from the one being checked (${siteDomain}). Search Console was deliberately left out of this review, because that data belongs to another client. Every live page check is unaffected and still valid. To bring Search Console in, switch the active project to this client and run again.` };
  }

  /* The bound property has to be THIS site. A project may carry no URL at all, in
     which case nothing has been confirmed, and a property for another domain is
     another site's data. Neither may be reported as usable. */
  try {
    const { data: integ } = await db().from("project_integrations").select("resource_id").eq("project_id", projectId).eq("provider", "gsc").maybeSingle();
    const resource = String((integ as any)?.resource_id || "").replace(/^sc-domain:/, "");
    const gscDomain = domainOf(resource);
    if (gscDomain && siteDomain && gscDomain !== siteDomain) {
      return { connected: false, usable: false, mismatch: true, project_name: projName, project_domain: projDomain, site_domain: siteDomain, rows: [],
        note: `Search Console on this project is bound to ${gscDomain}, which is not the site being checked (${siteDomain}). It was left out of this review because it is another site's data. The live page checks are unaffected.` };
    }
    if (!projDomain && siteDomain && !gscDomain) {
      return { connected: false, usable: false, mismatch: false, project_name: projName, site_domain: siteDomain, rows: [],
        note: `The selected project has no website recorded, so it cannot be confirmed as the project for ${siteDomain}. Search Console from it is not used. Create or select the project for this site to bring it in.` };
    }
  } catch { /* fall through to the read below */ }

  try {
    const g: any = await loadGsc(projectId);
    const rows = ((g && g.topQueries) || []).map((q: any) => ({
      query: String(q.query || (Array.isArray(q.keys) ? q.keys[0] : "")),
      clicks: Number(q.clicks) || 0, impressions: Number(q.impressions) || 0, position: Number(q.position) || 0,
    })).filter((r: any) => r.query).slice(0, 20);
    if (!rows.length) {
      return { connected: false, usable: false, mismatch: false, project_name: projName, site_domain: siteDomain, rows: [],
        note: "Search Console is not connected for this project, or it holds no query data yet. The live page checks stand on their own for confirming implementation." };
    }
    return { connected: true, usable: true, mismatch: false, project_name: projName, project_domain: projDomain, site_domain: siteDomain, rows,
      note: `Search Console is connected for ${projName || projDomain} and matches the site being checked. These figures are context for the round, not proof that a specific change was made.` };
  } catch {
    return { connected: false, usable: false, mismatch: false, project_name: projName, site_domain: siteDomain, rows: [],
      note: "Search Console could not be read, so this round rests on the live page checks." };
  }
}

/* Deterministic tab classification. The tab name is the strongest signal, the
   headers are the tie breaker. No model call is needed for this. */
export function classifyTab(tabName: string, headers: string[]): string {
  const hay = norm(tabName) + " " + headers.map(norm).join(" ");
  if (/back ?link|off.?page|guest post|directory|citation|outreach|gmb|google business/.test(hay)) return "offpage";
  if (/meta desc|description/.test(hay)) return "meta_description";
  if (/title/.test(hay)) return "title";
  if (/\bh1\b|heading/.test(hay)) return "h1";
  if (/schema|structured data|rich result/.test(hay)) return "schema";
  if (/canonical/.test(hay)) return "canonical";
  if (/alt|image/.test(hay)) return "image_alt";
  if (/internal link|interlink|internal_link/.test(hay)) return "internal_link";
  if (/redirect|301|302/.test(hay)) return "redirect";
  if (/index|robots|noindex/.test(hay)) return "indexing";
  if (/keyword|rank|position/.test(hay)) return "keyword";
  if (/blog|content|article|copy|page created/.test(hay)) return "content";
  return "other";
}

/* Find the column that holds the page, and the column that holds the value the
   executive says they implemented. Workbooks are never uniform, so this reads the
   headers and falls back to reading the data itself. */
export function detectColumns(rows: any[]): { urlKey: string; valueKey: string; itemKey: string; refKey: string } {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const find = (re: RegExp) => keys.find((k) => re.test(norm(k))) || "";
  let urlKey = find(/^url$|page url|landing page|\burl\b|\bpage\b|link|address|slug/);
  if (!urlKey) {
    /* Distinct URLs, not raw count: a repeated reference link must not outrank
       the real page list simply because its column is fuller. */
    let best = ""; let bestScore = 0;
    for (const k of keys) {
      const vals = rows.map((r) => String(r[k] || "").trim()).filter((v) => /^https?:\/\/|^www\./i.test(v));
      const distinct = new Set(vals.map((v) => v.toLowerCase())).size;
      if (distinct > bestScore) { bestScore = distinct; best = k; }
    }
    if (bestScore >= 2) urlKey = best;
  }
  /* Never judge the live page against the PREVIOUS value. */
  const OLD = /previous|old|existing|current|before|original|was\b/i;
  const findNew = (re: RegExp) => keys.find((k) => re.test(norm(k)) && !OLD.test(norm(k))) || "";
  const valueKey =
    findNew(/new (title|meta|value|content|h1|description)|updated|implemented|optimi[sz]ed|revised|final|after|suggested|recommended/) ||
    findNew(/^title$|^meta|description|^h1$|value|content|anchor|text/) || "";
  const itemKey = find(/task|item|activity|work|deliverable|type|description of work/) || "";
  /* The sheet's own identifier column, so a finding can name the row the way the
     executive sees it rather than by position alone. */
  const refKey = keys.find((k) => /^#$|^s\.?no\.?$|^sr\.?$|^id$|^row$|serial/i.test(norm(k))) || "";
  return { urlKey, valueKey, itemKey, refKey };
}

/* The keywords a specific row should be judged against: one named in the row
   itself wins, otherwise the account keywords that plausibly relate to the page,
   otherwise the account keywords. Judging every page against all 60 keywords
   would produce noise, so the page path is used to narrow them. */
export function rowKeywords(row: any, accountKeywords: string[]): string[] {
  const keys = Object.keys(row || {});
  const kwKey = keys.find((k) => /keyword|target term|query|focus/i.test(k));
  if (kwKey) {
    const raw = String(row[kwKey] || "").trim();
    if (raw) return raw.split(/[,;|]/).map((x) => x.trim()).filter(Boolean).slice(0, 5);
  }
  if (!accountKeywords.length) return [];
  const urlKey = keys.find((k) => /url|page|link/i.test(k));
  const slug = String(urlKey ? row[urlKey] || "" : "").toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (slug) {
    const fitted = accountKeywords.filter((k) => {
      const parts = String(k).toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      return parts.length > 0 && parts.some((w) => slug.includes(w));
    });
    if (fitted.length) return fitted.slice(0, 5);
  }
  return accountKeywords.slice(0, 3);
}

/* Category of mistake, which is what makes an executive profile meaningful. */
function mistakeCategory(status: string, type: string, quality: string[]): string {
  if (status === "verified") return "";
  if (status === "unverifiable") return "unverifiable_claim";
  if (status === "failed") return "not_implemented";
  const q = quality.join(" ").toLowerCase();
  if (/noindex/.test(q)) return "indexation_risk";
  if (/thin|only about/.test(q)) return "thin_content";
  if (/keyword does not appear/.test(q)) return "keyword_missing";
  if (/short at|long at/.test(q)) return "length_out_of_range";
  if (/duplicate/.test(q)) return "duplication";
  if (/alt text/.test(q)) return "incomplete_execution";
  return "below_standard";
}

function severityOf(status: string, onAgenda: boolean): string {
  if (status === "verified") return "";
  if (status === "failed") return onAgenda ? "high" : "medium";
  if (status === "partial") return onAgenda ? "medium" : "low";
  return onAgenda ? "medium" : "low";
}

/* The remark the executive reads in the returned sheet. Written from observed
   evidence, so it is specific and actionable rather than a generic flag. */
function remarkOf(status: string, expected: string, observed: string, evidence: string, quality: string[]): string {
  if (status === "verified") return "Confirmed live and within standard.";
  if (status === "unverifiable") return evidence;
  if (status === "failed") return `Not live. ${expected ? `Committed: ${expected}. ` : ""}${evidence}`;
  const q = quality.length ? ` ${quality.join(" ")}` : "";
  return `Live but needs work. Observed: ${observed || "nothing usable"}.${q}`;
}

/* A site level item is a fact about the site, so it is checked against the site.
   Where the fact is genuinely not observable from a page fetch, that is said
   plainly instead of being silently passed or silently failed. */
async function siteLevelCheck(type: string, siteUrl: string, expected: string): Promise<{ status: CheckStatusLite; observed: string; remark: string; url: string }> {
  const origin = (() => { try { return new URL(siteUrl.startsWith("http") ? siteUrl : "https://" + siteUrl).origin; } catch { return ""; } })();
  if (!origin) return { status: "unverifiable", observed: "", remark: "No site URL to check this against.", url: "" };

  if (/robots/i.test(type)) {
    const u = `${origin}/robots.txt`;
    const body = await fetchHtml(u).catch(() => "");
    if (!body) return { status: "failed", observed: "", remark: `No robots.txt was returned at ${u}.`, url: u };
    const disallowAll = /disallow:\s*\/\s*$/im.test(body) && !/allow:/im.test(body);
    const sitemapLine = (body.match(/sitemap:\s*(\S+)/i) || [])[1] || "";
    return {
      status: disallowAll ? "failed" : "verified",
      observed: `${body.trim().split(/\n/).length} line(s)${sitemapLine ? `, sitemap declared` : ", no sitemap declared"}`,
      remark: disallowAll
        ? `robots.txt is live but blocks the whole site with Disallow: /.`
        : `robots.txt is live at ${u}${sitemapLine ? ` and declares the sitemap at ${sitemapLine}` : `, though it declares no sitemap`}.`,
      url: u,
    };
  }

  if (/sitemap/i.test(type)) {
    const candidates = [`${origin}/sitemap_index.xml`, `${origin}/sitemap.xml`, `${origin}/sitemap-index.xml`];
    for (const u of candidates) {
      const body = await fetchHtml(u).catch(() => "");
      if (body && /<(urlset|sitemapindex)/i.test(body)) {
        const count = (body.match(/<loc>/gi) || []).length;
        return { status: "verified", observed: `${count} entries`, remark: `An XML sitemap is live at ${u} carrying ${count} entr${count === 1 ? "y" : "ies"}.`, url: u };
      }
    }
    return { status: "failed", observed: "", remark: `No XML sitemap was found at the usual locations under ${origin}.`, url: `${origin}/sitemap.xml` };
  }

  const u = `${origin}/`;
  const html = await fetchHtml(u).catch(() => "");
  if (!html) return { status: "unverifiable", observed: "", remark: `The site did not respond, so this site level item could not be checked.`, url: u };
  return {
    status: "unverifiable", observed: "",
    remark: `This is a site level item rather than per page work${expected ? ` (recorded as: ${expected.slice(0, 90)})` : ""}. It is not observable from a page fetch, so confirm it directly and record the evidence.`,
    url: u,
  };
}

/* ---- Reading a tab the way a practitioner would ----------------------------- */

/* Workbooks are not standardised. Column names, layout and even what a tab is
   FOR differ from one agency sheet to the next, so guessing from regular
   expressions over column names produces confident nonsense. Instead the headers
   and a few real rows of each tab are read and interpreted, and then every part
   of that interpretation is checked against the actual data before it is used.
   The model proposes, the data disposes: a column it names must genuinely exist
   and genuinely hold what it claims, or it is rejected. */
export interface TabMapping {
  check_type: string;          // title | meta_description | h1 | canonical | schema | indexing | image_alt | internal_link | content | redirect | keyword | offpage | robots | sitemap | site_other | other
  scope: "page" | "site";      // per page work, or one site level item
  url_column: string;
  expected_column: string;     // the value that SHOULD now be live
  previous_column: string;     // the value it replaced, used to detect no change
  keyword_column: string;
  ref_column: string;
  what_it_verifies: string;    // plain sentence shown to the reviewer
  confidence: "high" | "medium" | "low";
  source: "read" | "fallback";
}

const looksUrl = (v: any) => /^https?:\/\/|^www\.|^\/[a-z0-9]/i.test(String(v || "").trim());

/* Validate an interpretation against the rows themselves.
   `hint` carries the column choice already made over the WHOLE sheet in the
   browser. It is a last resort, used only when neither the interpretation nor
   the rows supplied here settle a column, because a handful of rows read from
   one part of a sheet can be unrepresentative: blank leading rows would
   otherwise leave a genuine page column undiscovered, which then flips the tab
   to site scope and checks every row against robots.txt. */
function validateMapping(m: any, headers: string[], rows: any[], hint?: { urlKey?: string; valueKey?: string } | null): TabMapping {
  const has = (c: any) => Boolean(c) && headers.includes(String(c));
  const colHasUrls = (c: string) => {
    const vals = rows.map((r) => String(r[c] || "").trim()).filter(Boolean);
    if (!vals.length) return false;
    return vals.filter(looksUrl).length >= Math.max(1, Math.floor(vals.length * 0.5));
  };
  const OLD = /previous|old|existing|current|before|original|was\b/i;

  let url_column = has(m?.url_column) && colHasUrls(String(m.url_column)) ? String(m.url_column) : "";
  /* A tab read as SITE level has no page list, so no page column is looked for.
     Without this, a site tab that happens to carry reference links (the robots.txt
     URL, the sitemap URL) acquires a page column, and the per row path then wins
     over the site level path, so the robots and sitemap checks never run on the
     one tab that needs them. A wrong site reading is corrected by the reviewer in
     the interface, where choosing a page column sets the scope back to page. */
  if (!url_column && m?.scope !== "site") {
    /* Fall back to the column with the most DISTINCT urls, which is the real page
       list rather than a reference link repeated on every row. */
    let best = ""; let bestScore = 0;
    for (const h of headers) {
      const vals = rows.map((r) => String(r[h] || "").trim()).filter(looksUrl);
      const distinct = new Set(vals.map((v) => v.toLowerCase())).size;
      if (distinct > bestScore) { bestScore = distinct; best = h; }
    }
    if (bestScore >= 1) url_column = best;
  }
  /* Still nothing, so trust the choice made over every row before falling
     through to a scope change. Withheld when the tab was read as SITE level: a
     site tab has no page list by definition, and filling one here would leave
     the tab scoped to the site while every row carried a URL, which sends it
     down the per page path and the site level check never runs. */
  if (!url_column && m?.scope !== "site" && hint?.urlKey && headers.includes(String(hint.urlKey))) url_column = String(hint.urlKey);
  let expected_column = has(m?.expected_column) && !OLD.test(String(m.expected_column)) ? String(m.expected_column) : "";
  const previous_column = has(m?.previous_column) ? String(m.previous_column) : (headers.find((h) => OLD.test(h)) || "");
  if (expected_column && expected_column === previous_column) expected_column = "";
  /* When the proposed value column is rejected, recover the real one rather than
     dropping to a presence only check: the strongest candidate is a header that
     reads as the NEW state, then any content bearing column that is not the old
     value and is not the page column. */
  if (!expected_column) {
    const NEWISH = /new|updated|revised|final|optimi[sz]ed|implemented|suggested|recommended|after|proposed/i;
    const usable = headers.filter((h) => h !== url_column && h !== previous_column && !OLD.test(h));
    const values = (h: string) => rows.map((r) => String(r[h] || "").trim()).filter(Boolean);
    const notLinks = (h: string) => { const v = values(h); return v.length > 0 && !v.every(looksUrl); };
    /* A header that says NEW is trusted on its own: an H1 or a title is often
       short, and a length test would wrongly reject it. Otherwise prefer a column
       that carries real copy rather than a status flag. */
    const isCopy = (h: string) => {
      const v = values(h);
      if (!v.length || v.every(looksUrl)) return false;
      const avg = v.reduce((a, x) => a + x.length, 0) / v.length;
      return avg >= 12 && !/^(done|updated|complete|completed|yes|no|pending|na|n\/a|ok)$/i.test(v[0]);
    };
    expected_column = usable.find((h) => NEWISH.test(h) && notLinks(h)) || usable.find(isCopy) || "";
    /* The whole sheet choice is the final resort, and it is accepted only if it
       is not the old value and not the page column. A presence only check is
       better than a comparison against the text the work replaced. */
    if (!expected_column && hint?.valueKey) {
      const hv = String(hint.valueKey);
      if (headers.includes(hv) && hv !== url_column && hv !== previous_column && !OLD.test(hv)) expected_column = hv;
    }
  }

  const scope: "page" | "site" = m?.scope === "site" ? "site" : (url_column ? "page" : "site");
  return {
    check_type: String(m?.check_type || "other"),
    scope,
    url_column, expected_column, previous_column,
    keyword_column: has(m?.keyword_column) ? String(m.keyword_column) : "",
    ref_column: has(m?.ref_column) ? String(m.ref_column) : "",
    what_it_verifies: String(m?.what_it_verifies || ""),
    confidence: (m?.confidence === "high" || m?.confidence === "low") ? m.confidence : "medium",
    source: m ? "read" : "fallback",
  };
}

/* Interpret every tab in one pass. */
export async function qaMapTabs(opts: { siteUrl?: string; tabs: Array<{ name: string; headers: string[]; sample: any[]; rowCount: number; validationRows?: any[]; columns?: { urlKey?: string; valueKey?: string } | null }> }) {
  const tabs = Array.isArray(opts.tabs) ? opts.tabs : [];
  if (!tabs.length) return { success: false, error: "No tabs supplied." };
  let parsed: any = {};
  try {
    const sys = "You are a Senior Digital Marketing Specialist reading an SEO delivery workbook before reviewing it. For EACH tab you are given the tab name, its column headers and a few real rows. Work out what work that tab records and how to verify it. Return ONLY JSON: {\"tabs\":[{\"name\":\"exact tab name\",\"check_type\":\"title|meta_description|h1|canonical|schema|indexing|image_alt|internal_link|content|redirect|keyword|offpage|robots|sitemap|site_other|other\",\"scope\":\"page or site\",\"url_column\":\"the header whose cells hold the page address to check, empty if none\",\"expected_column\":\"the header holding the value that SHOULD NOW BE LIVE after the work, never the old value\",\"previous_column\":\"the header holding the value it replaced, if any\",\"keyword_column\":\"the header holding a target keyword, if any\",\"ref_column\":\"the header holding the sheet's own row number or id, if any\",\"what_it_verifies\":\"one plain sentence a reviewer would understand\",\"confidence\":\"high|medium|low\"}]}. Use scope site for one off site level items such as robots.txt, the XML sitemap, sitemap submission, a mobile friendly check or social profiles, where there is no per page list. Use the EXACT header strings given. Leave a field empty rather than guessing. Never invent a column that is not in the headers.";
    const user = tabs.map((t) => [
      `TAB: ${t.name} (${t.rowCount} rows)`,
      `HEADERS: ${t.headers.join(" | ")}`,
      `SAMPLE ROWS: ${JSON.stringify((t.sample || []).slice(0, 3)).slice(0, 1200)}`,
    ].join("\n")).join("\n\n");
    const { text } = await llmComplete({ system: sys, user, maxTokens: 3000, timeoutMs: 90000, label: "qa-map-tabs", maxSegments: 2 });
    const m = String(text || "").match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : {};
  } catch { parsed = {}; }

  const byName = new Map<string, any>();
  for (const t of (Array.isArray(parsed.tabs) ? parsed.tabs : [])) byName.set(String(t.name || ""), t);

  const mappings = tabs.map((t) => {
    const proposed = byName.get(t.name) || null;
    /* The model reads three rows because that is enough to recognise a format.
       Validation reads rows taken from across the sheet, because a column has to
       hold what it claims throughout, not just at the top. */
    const checkRows = Array.isArray(t.validationRows) && t.validationRows.length ? t.validationRows : (t.sample || []);
    const v = validateMapping(proposed, t.headers || [], checkRows, t.columns || null);
    return { name: t.name, ...v, source: proposed ? "read" : "fallback" };
  });
  return { success: true, mappings };
}

/* ---- The client record ------------------------------------------------------ */

/* Everything that belongs to the client rather than to one review is kept
   against the client's unique handle, so the conversation, the mail, the site,
   the BDE and the keywords are typed once and carried into every later review.
   Existing text is never wiped by an empty field: a review that omits the mail
   leaves the stored mail alone. */
async function upsertClient(rec: {
  clientId?: string; clientName?: string; siteUrl?: string; bdeName?: string;
  clientContext?: string; mailText?: string; persona?: string;
  keywords?: string[]; competitors?: string[];
}): Promise<void> {
  const id = String(rec.clientId || "").trim();
  if (!id) return;
  try {
    const { data: existing } = await db().from("qa_clients").select("*").eq("client_id", id).maybeSingle();
    const keep = (next: any, prev: any) => {
      const n = typeof next === "string" ? next.trim() : next;
      if (Array.isArray(n)) return n.length ? n : (prev || []);
      return n ? n : (prev ?? null);
    };
    const row: any = {
      client_id: id,
      client_name: keep(rec.clientName, (existing as any)?.client_name),
      site_url: keep(rec.siteUrl, (existing as any)?.site_url),
      bde_name: keep(rec.bdeName, (existing as any)?.bde_name),
      client_context: keep(rec.clientContext, (existing as any)?.client_context),
      mail_text: keep(rec.mailText, (existing as any)?.mail_text),
      persona: keep(rec.persona, (existing as any)?.persona),
      target_keywords: keep(rec.keywords, (existing as any)?.target_keywords),
      competitors: keep(rec.competitors, (existing as any)?.competitors),
      last_seen_at: new Date().toISOString(),
      reviews_count: (Number((existing as any)?.reviews_count) || 0) + 1,
    };
    if (existing) await db().from("qa_clients").update(row).eq("client_id", id);
    else await db().from("qa_clients").insert(row);
  } catch { /* the review still runs without the client record */ }
}

/* The known clients, for the picker. */
export async function qaClients(opts: { query?: string }) {
  const q = String(opts.query || "").trim().toLowerCase();
  try {
    const { data } = await db().from("qa_clients")
      .select("client_id,client_name,site_url,bde_name,reviews_count,last_seen_at")
      .order("last_seen_at", { ascending: false }).limit(200);
    let list: any[] = (data as any[]) || [];
    if (q) list = list.filter((c) =>
      String(c.client_id || "").toLowerCase().includes(q) ||
      String(c.client_name || "").toLowerCase().includes(q) ||
      String(c.site_url || "").toLowerCase().includes(q));
    return { success: true, clients: list };
  } catch (e: any) { return { success: false, error: e?.message || "could not read the clients", clients: [] }; }
}

/* The full record for one client, used to fill a new review. */
export async function qaLoadClient(opts: { clientId: string }) {
  const id = String(opts.clientId || "").trim();
  if (!id) return { success: false, error: "A client id is required." };
  try {
    const { data } = await db().from("qa_clients").select("*").eq("client_id", id).maybeSingle();
    if (!data) return { success: false, error: "No record for that client yet." };
    const c: any = data;
    return {
      success: true,
      client: {
        client_id: c.client_id, client_name: c.client_name || "", site_url: c.site_url || "",
        bde_name: c.bde_name || "", client_context: c.client_context || "", mail_text: c.mail_text || "",
        persona: c.persona || "", target_keywords: c.target_keywords || [], competitors: c.competitors || [],
        reviews_count: c.reviews_count || 0, last_seen_at: c.last_seen_at,
      },
    };
  } catch (e: any) { return { success: false, error: e?.message || "could not load the client" }; }
}

/* ---- 1. Create the review and build the agenda ------------------------------ */

export async function qaCreateReview(opts: {
  projectId?: string; siteUrl: string; clientId?: string; clientName?: string;
  executiveName?: string; bdeName?: string; keywords?: string[]; competitors?: string[];
  title?: string; clientContext?: string; mailText?: string;
  tabs: Array<{ name: string; headers: string[]; rowCount: number }>;
}) {
  const siteUrl = String(opts.siteUrl || "").trim();
  if (!siteUrl) return { success: false, error: "A client site URL is required." };
  const tabs = Array.isArray(opts.tabs) ? opts.tabs : [];
  if (!tabs.length) return { success: false, error: "No sheet tabs were supplied." };

  /* The keywords this client is actually trying to rank for, from every real
     source: what the conversation and mail named, what Search Console already
     shows, and what the project carries. Rows are judged against these, which is
     what makes a quality check specific to the account instead of generic. */
  const kw = new Set<string>();
  for (const k of (opts.keywords || [])) { const v = String(k).trim(); if (v) kw.add(v); }
  const comp = new Set<string>();
  for (const c of (opts.competitors || [])) { const v = String(c).trim(); if (v) comp.add(v); }
  if (opts.projectId) {
    try {
      const { data: proj } = await db().from("projects").select("keywords,competitors").eq("id", opts.projectId).maybeSingle();
      const pk = (proj as any)?.keywords; const pc = (proj as any)?.competitors;
      if (Array.isArray(pk)) for (const k of pk) { const v = String(k).trim(); if (v) kw.add(v); }
      if (Array.isArray(pc)) for (const c of pc) { const v = String(c).trim(); if (v) comp.add(v); }
    } catch { /* project keywords are a bonus, never required */ }
    try {
      const g: any = await loadGsc(opts.projectId);
      for (const q of ((g && g.topQueries) || []).slice(0, 40)) {
        const v = String(q.query || (Array.isArray(q.keys) ? q.keys[0] : "")).trim();
        if (v) kw.add(v);
      }
    } catch { /* Search Console stays optional */ }
  }
  const targetKeywords = Array.from(kw).slice(0, 60);
  const competitorList = Array.from(comp).slice(0, 20);

  /* The agenda is the difference between a senior pass and a random one. */
  let agenda: any[] = [];
  try {
    const sys = "You are a Senior Digital Marketing Specialist setting the quality assurance agenda for one client account, before reviewing an executive's delivery workbook. From the client background and the commitment mail, decide what a senior reviewer must check thoroughly on THIS account and why, in the client's terms. Return ONLY JSON: {\"agenda\":[{\"id\":\"a1\",\"focus\":\"the specific thing to check\",\"why\":\"the client reason it matters\",\"applies_to\":[\"title\",\"meta_description\",\"h1\",\"content\",\"schema\",\"image_alt\",\"internal_link\",\"canonical\",\"indexing\",\"keyword\",\"offpage\",\"redirect\",\"other\"],\"weight\":\"high|medium|low\"}]}. Six to ten items. Ground every item in the supplied text and never invent a client requirement.";
    const user = [
      `Client: ${opts.clientName || siteUrl}. Site: ${siteUrl}.`,
      opts.clientContext ? `Client background, chat and call:\n${String(opts.clientContext).slice(0, 10000)}` : "No client background supplied.",
      opts.mailText ? `Commitment mail to the project manager:\n${String(opts.mailText).slice(0, 10000)}` : "No commitment mail supplied.",
      `Workbook tabs being reviewed: ${tabs.map((t) => t.name).join(", ")}.`,
      targetKeywords.length ? `Target keywords for this account: ${targetKeywords.slice(0, 30).join(", ")}.` : "",
      competitorList.length ? `Competitors named: ${competitorList.join(", ")}.` : "",
    ].join("\n\n");
    const { text } = await llmComplete({ system: sys, user, maxTokens: 1400, timeoutMs: 60000, label: "qa-agenda", maxSegments: 1 });
    const m = String(text || "").match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : {};
    agenda = Array.isArray(parsed.agenda) ? parsed.agenda.slice(0, 10) : [];
  } catch { agenda = []; }

  await upsertClient({
    clientId: opts.clientId, clientName: opts.clientName, siteUrl,
    bdeName: opts.bdeName, clientContext: opts.clientContext, mailText: opts.mailText,
    keywords: targetKeywords, competitors: competitorList,
  });
  await registerExecutive(String(opts.executiveName || ""), "dme");
  await registerExecutive(String(opts.bdeName || ""), "bde");
  const { data: rev, error } = await db().from("qa_reviews").insert({
    project_id: opts.projectId || null,
    client_id: opts.clientId || null,
    client_name: opts.clientName || null,
    site_url: siteUrl,
    executive_name: opts.executiveName || null,
    bde_name: opts.bdeName || null,
    title: opts.title || `QA of ${opts.clientName || siteUrl}`,
    status: "checking",
    round: 1,
    agenda,
    client_context: opts.clientContext || null,
    mail_text: opts.mailText || null,
    target_keywords: targetKeywords,
    competitors: competitorList,
    submitted_at: new Date().toISOString(),
  }).select().single();
  if (error || !rev) return { success: false, error: error?.message || "Could not create the review." };

  const tabRows = tabs.map((t, i) => ({
    review_id: (rev as any).id, tab_index: i, tab_name: t.name,
    tab_type: classifyTab(t.name, t.headers || []), row_count: Number(t.rowCount) || 0,
    status: "queued", round: 1,
  }));
  const { data: savedTabs } = await db().from("qa_tabs").insert(tabRows).select();

  /* Resolve Search Console up front so the reviewer knows, before any checking,
     whether it is in play for this round or why it is not. */
  const gsc = await qaGscContext(String(opts.projectId || ""), siteUrl);

  return { success: true, review: rev, agenda, tabs: savedTabs || tabRows, rows_per_slot: ROWS_PER_SLOT, gsc, target_keywords: targetKeywords, competitors: competitorList };
}

/* ---- 2. Check one bounded slice of one tab (its own slot) ------------------- */

export async function qaCheckTab(opts: {
  reviewId: string; tabIndex: number; rowOffset?: number; rows: any[]; totalRows?: number;
  columns?: { urlKey?: string; valueKey?: string; itemKey?: string; refKey?: string };
  headerRows?: number;
  mapping?: any;
}) {
  const reviewId = String(opts.reviewId || "").trim();
  const tabIndex = Number(opts.tabIndex) || 0;
  const offset = Number(opts.rowOffset) || 0;
  /* rows carries ONLY this slot's slice, so a tab with thousands of rows never
     ships its whole body on every call. totalRows is what the tab holds overall. */
  const rows = Array.isArray(opts.rows) ? opts.rows : [];
  const totalRows = Number(opts.totalRows) || (offset + rows.length);
  if (!reviewId) return { success: false, error: "reviewId is required." };

  const { data: rev } = await db().from("qa_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!rev) return { success: false, error: "Review not found." };
  const { data: tabRec } = await db().from("qa_tabs").select("*").eq("review_id", reviewId).eq("tab_index", tabIndex).maybeSingle();
  if (!tabRec) return { success: false, error: "Tab not found on this review." };

  const review: any = rev; const tab: any = tabRec;
  const round = Number(review.round) || 1;
  const agenda: any[] = Array.isArray(review.agenda) ? review.agenda : [];
  const onAgenda = agenda.filter((a) => Array.isArray(a.applies_to) && a.applies_to.includes(tab.tab_type));
  const agendaRef = onAgenda.length ? String(onAgenda[0].id || "") : "";
  const agendaHigh = onAgenda.some((a) => norm(a.weight) === "high");
  /* Keywords reach the check, so the "keyword missing from the title" and
     "missing from the H1" rules can actually fire. They were previously passed an
     empty array, which made those quality rules unreachable. */
  const reviewKeywords: string[] = Array.isArray(review.target_keywords) ? review.target_keywords.map(String) : [];

  /* Search Console per page, so a row can be judged on outcome as well as on
     presence. A page that is live and correct but has earned nothing in 28 days
     is not a failure, and is never marked as one, but a reviewer needs to see it
     rather than sign off on a technically present change. */
  const pageStats = new Map<string, { clicks: number; impressions: number; position: number }>();
  if (review.project_id) {
    try {
      const g: any = await loadGsc(String(review.project_id));
      for (const p of ((g && g.queryPagePairs) || [])) {
        const u = String(p.page || "").replace(/\/$/, "");
        if (!u) continue;
        const cur = pageStats.get(u) || { clicks: 0, impressions: 0, position: 0 };
        cur.clicks += Number(p.clicks) || 0;
        cur.impressions += Number(p.impressions) || 0;
        cur.position = cur.position || Number(p.position) || 0;
        pageStats.set(u, cur);
      }
    } catch { /* Search Console stays optional */ }
  }

  const slice = rows.slice(0, ROWS_PER_SLOT);
  /* The column mapping is decided ONCE for the whole tab and passed in, never
     re-derived per batch. Deriving it per batch let the value based fallback lock
     onto a different column in different batches, which is how a row could be
     checked against a URL that belongs somewhere else. */
  const map = opts.mapping || {};
  const fixed = opts.columns || {};
  const derived = detectColumns(slice);
  /* A supplied interpretation is AUTHORITATIVE for the page column and the
     compared value. It was already validated against real rows, so a blank in it
     is a decision rather than a gap: a site level tab deliberately carries no
     page column, and a tab whose only value column holds the text the work
     replaced deliberately carries no expected column. Refilling either from a
     fallback would resurrect the two defects the interpretation exists to
     prevent, a page column belonging to another row and a comparison against the
     value that was replaced. Without an interpretation the whole sheet choice is
     used, and only with neither does this fall back to the slice, which is the
     path that let the column drift between batches. */
  const hasMap = Boolean(map && (map.check_type || map.url_column || map.scope || map.what_it_verifies));
  const urlKey = hasMap ? String(map.url_column || "") : String(fixed.urlKey || derived.urlKey || "");
  const valueKey = hasMap ? String(map.expected_column || "") : String(fixed.valueKey || derived.valueKey || "");
  const itemKey = String(fixed.itemKey || derived.itemKey || "");
  const refKey = String(map.ref_column || fixed.refKey || "");
  const prevKey = String(map.previous_column || "");
  const kwKey = String(map.keyword_column || "");
  /* The tab's own interpretation decides what is being checked, not its title.
     A tab called "Header Optimization" may hold H1 work, and a tab called
     "Index" may hold nothing checkable at all. */
  const checkType = String(map.check_type || tab.tab_type || "other");
  const isSiteScope = String(map.scope || "") === "site";
  const headerRows = Number(opts.headerRows) || 1;

  /* The crawl is corroboration. If the whole site has been crawled and a claimed
     URL is not among the pages that exist, that is a fact about the URL, not a
     missing element on a page, and it must never be reported as unfinished work. */
  const crawled = new Set<string>();
  try {
    const { data: jobs } = await db().from("crawl_jobs").select("results").eq("project_id", review.project_id).order("updated_at", { ascending: false }).limit(1);
    const job: any = Array.isArray(jobs) ? jobs[0] : null;
    for (const p of (Array.isArray(job?.results) ? job.results : [])) {
      const u = String(p.url || "").replace(/\/$/, "").toLowerCase();
      if (u) crawled.add(u);
    }
  } catch { /* corroboration only */ }
  const findings: any[] = [];

  for (let i = 0; i < slice.length; i++) {
    const r = slice[i] || {};
    const rowIndex = offset + i;
    const url = String(urlKey ? r[urlKey] || "" : "").trim();
    const expected = String(valueKey ? r[valueKey] || "" : "").trim();
    const rowRef = String(refKey ? r[refKey] || "" : "").trim();
    const sheetRow = rowIndex + 1 + headerRows;                 // the row number as seen in the sheet
    const item = String(itemKey ? r[itemKey] || "" : "").trim() || `${tab.tab_name} sheet row ${sheetRow}${rowRef ? ` (ref ${rowRef})` : ""}`;

    /* Site level items are one off facts about the site, not per page work, so
       they are checked against the site itself rather than discarded. */
    if (isSiteScope) {
      const siteChecked = await siteLevelCheck(checkType, review.site_url, expected);
      findings.push({
        review_id: reviewId, tab_id: tab.id, tab_name: tab.tab_name, row_index: rowIndex,
        sheet_row: sheetRow, row_ref: rowRef || null, source_column: null,
        item, check_type: checkType, url: siteChecked.url, expected, observed: siteChecked.observed,
        status: siteChecked.status, severity: siteChecked.status === "failed" ? "high" : siteChecked.status === "partial" ? "medium" : "low",
        mistake_category: siteChecked.status === "verified" ? null : "site_level", agenda_ref: agendaRef || null, round,
        remark: siteChecked.remark, resolved_round: siteChecked.status === "verified" ? round : null,
      });
      continue;
    }

    /* A row with no URL is not a failure, it is a row that cannot be checked. */
    if (!url) {
      findings.push({
        review_id: reviewId, tab_id: tab.id, tab_name: tab.tab_name, row_index: rowIndex,
        sheet_row: sheetRow, row_ref: rowRef || null, source_column: urlKey || null,
        item, check_type: tab.tab_type, url: "", expected, observed: "",
        status: "unverifiable", severity: "low", mistake_category: null, agenda_ref: agendaRef || null, round,
        remark: `No page URL in this row${urlKey ? ` (column "${urlKey}" is empty)` : " and no URL column was found in this tab"}, so there is nothing to check it against.`,
        resolved_round: null,
      });
      continue;
    }

    const crawlKey = (() => { try { return new URL(url.startsWith("http") ? url : "https://" + url).toString().replace(/\/$/, "").toLowerCase(); } catch { return url.toLowerCase(); } })();
    if (crawled.size && !crawled.has(crawlKey)) {
      findings.push({
        review_id: reviewId, tab_id: tab.id, tab_name: tab.tab_name, row_index: rowIndex,
        sheet_row: sheetRow, row_ref: rowRef || null, source_column: urlKey || null,
        item, check_type: tab.tab_type, url, expected, observed: "",
        status: "unverifiable", severity: "medium", mistake_category: "url_not_on_site", agenda_ref: agendaRef || null, round,
        remark: `This URL was not found among the ${crawled.size} pages in the site crawl, so the claim could not be checked against a real page. Confirm the URL in the sheet is correct, or re-crawl if the page is new.`,
        resolved_round: null,
      });
      continue;
    }

    const check = await checkOne(
      { id: `${tabIndex}-${rowIndex}`, title: item, type: checkType, url, expected, keywords: (kwKey && String(r[kwKey] || "").trim()) ? String(r[kwKey]).split(/[,;|]/).map((x: string) => x.trim()).filter(Boolean).slice(0, 5) : rowKeywords(r, reviewKeywords), committed: true, claimed: true },
      review.site_url,
    );
    let cat = mistakeCategory(check.status, checkType, check.quality || []);
    /* If the live page still shows exactly what the sheet records as the PREVIOUS
       value, the work was not applied, whatever the row's status column says. */
    const prevVal = prevKey ? String(r[prevKey] || "").trim() : "";
    let stillOld = "";
    if (prevVal && check.observed && norm(check.observed) === norm(prevVal)) {
      stillOld = ` The live page still shows the previous value recorded in "${prevKey}", so this change was not applied.`;
      if (check.status === "verified" || check.status === "partial") { check.status = "failed"; cat = "not_implemented"; }
    }
    const stat = pageStats.get(String(check.url || url).replace(/\/$/, ""));
    const gscNote = stat
      ? ` Search Console for this page over the window: ${stat.clicks} clicks, ${stat.impressions} impressions, average position ${stat.position.toFixed(1)}.`
      : (pageStats.size ? " This page has no Search Console activity in the window." : "");
    findings.push({
      review_id: reviewId, tab_id: tab.id, tab_name: tab.tab_name, row_index: rowIndex,
      sheet_row: sheetRow, row_ref: rowRef || null, source_column: urlKey || null,
      item, check_type: tab.tab_type, url: check.url || url, expected, observed: check.observed || "",
      status: check.status, severity: severityOf(check.status, agendaHigh),
      mistake_category: cat || null, agenda_ref: agendaRef || null, round,
      remark: remarkOf(check.status, expected, check.observed || "", check.evidence, check.quality || []) + stillOld + gscNote,
      resolved_round: check.status === "verified" ? round : null,
    });
  }

  if (findings.length) await db().from("qa_findings").insert(findings);

  const rowsChecked = offset + slice.length;
  const done = rowsChecked >= totalRows;
  await db().from("qa_tabs").update({
    mapping: opts.mapping || {},
    rows_checked: rowsChecked, row_count: totalRows,
    status: done ? "done" : "checking",
    checked_at: done ? new Date().toISOString() : null,
  }).eq("id", tab.id);
  await db().from("qa_reviews").update({ updated_at: new Date().toISOString() }).eq("id", reviewId);

  /* One short QA remark per tab, written once the tab completes. */
  let tabRemark = "";
  if (done) {
    try {
      const { data: all } = await db().from("qa_findings").select("status,mistake_category,item,observed").eq("review_id", reviewId).eq("tab_id", tab.id).eq("round", round);
      const list: any[] = (all as any[]) || [];
      const bad = list.filter((f) => f.status !== "verified");
      if (bad.length) {
        const sys = "You are a Senior Digital Marketing Specialist writing the reviewer remark for one tab of a delivery workbook. State plainly what is wrong, the pattern behind it if there is one, and what the executive must do. Judge it against what THIS client cares about, which is given to you, not against generic best practice. Separate work that was not done from work that was done below standard. Two to four sentences. Never use an em-dash.";
        const user = [
          `Tab: ${tab.tab_name} (${tab.tab_type}). ${list.length} rows checked, ${bad.length} not clean.`,
          onAgenda.length ? `What matters on this account for this kind of work: ${onAgenda.map((a: any) => `${a.focus} (${a.why})`).join("; ")}.` : "",
          reviewKeywords.length ? `Target keywords: ${reviewKeywords.slice(0, 15).join(", ")}.` : "",
          `Not done: ${bad.filter((f: any) => f.status === "failed").length}. Done below standard: ${bad.filter((f: any) => f.status === "partial").length}.`,
          `Examples: ${bad.slice(0, 8).map((f: any) => `${f.item}: ${f.status}, ${f.mistake_category || "issue"}`).join("; ")}.`,
        ].filter(Boolean).join("\n");
        const { text } = await llmComplete({ system: sys, user, maxTokens: 300, timeoutMs: 40000, label: "qa-tab-remark", maxSegments: 1 });
        tabRemark = String(text || "").trim();
      } else tabRemark = "Every row in this tab is confirmed live and within standard.";
      await db().from("qa_tabs").update({ remarks: tabRemark }).eq("id", tab.id);
    } catch { /* remark is a nicety, never block the pass */ }
  }

  return {
    success: true, tab_name: tab.tab_name, tab_type: tab.tab_type,
    rows_checked: rowsChecked, row_count: totalRows, done,
    next_offset: done ? null : rowsChecked, tab_remark: tabRemark,
    columns: { urlKey, valueKey, itemKey, refKey },
    findings: findings.map((f) => ({ row_index: f.row_index, sheet_row: f.sheet_row, row_ref: f.row_ref, source_column: f.source_column, item: f.item, url: f.url, status: f.status, severity: f.severity, mistake_category: f.mistake_category, remark: f.remark, observed: f.observed, expected: f.expected })),
  };
}

/* Site wide audit over the FULL batch crawl.

   The claimed rows can all pass while the site around them is broken, so the
   final gate reads every crawled page too. Findings are aggregated by issue type
   with counts and example pages, because a reviewer needs "23 pages share one
   title", not twenty three separate lines. High severity issues block the gate;
   the rest are reported so the decision is informed rather than hidden. */
const SITE_BLOCKING = new Set(["broken_page", "noindex_page", "missing_title", "duplicate_title"]);

export async function qaSiteAudit(opts: { reviewId: string; jobId: string }) {
  const reviewId = String(opts.reviewId || "").trim();
  const jobId = String(opts.jobId || "").trim();
  if (!reviewId || !jobId) return { success: false, error: "reviewId and jobId are required." };
  const { data: rev } = await db().from("qa_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!rev) return { success: false, error: "Review not found." };
  const review: any = rev; const round = Number(review.round) || 1;
  const { data: job } = await db().from("crawl_jobs").select("results,cursor,target_count,status").eq("id", jobId).maybeSingle();
  const pages: any[] = Array.isArray((job as any)?.results) ? (job as any).results : [];
  if (!pages.length) return { success: false, error: "The crawl has no pages yet." };

  const norm2 = (s: any) => String(s || "").trim().toLowerCase();
  const group = (key: (p: any) => string) => {
    const m = new Map<string, string[]>();
    for (const p of pages) { const k = key(p); if (!k) continue; m.set(k, (m.get(k) || []).concat(p.url)); }
    return Array.from(m.entries()).filter(([, u]) => u.length > 1);
  };

  const issues: Array<{ category: string; severity: string; label: string; urls: string[]; detail?: string }> = [];
  const push = (category: string, severity: string, label: string, urls: string[], detail?: string) => {
    if (urls.length) issues.push({ category, severity, label, urls, detail });
  };

  push("broken_page", "high", "Pages that did not return a healthy response", pages.filter((p) => p.ok === false || (Number(p.status) || 200) >= 400).map((p) => p.url));
  push("noindex_page", "high", "Pages set to noindex", pages.filter((p) => p.noindex).map((p) => p.url));
  push("missing_title", "high", "Pages with no title", pages.filter((p) => p.ok !== false && !String(p.title || "").trim()).map((p) => p.url));
  for (const [t, urls] of group((p) => norm2(p.title))) push("duplicate_title", "high", `Duplicate title used on ${urls.length} pages`, urls, t.slice(0, 70));
  push("missing_meta", "medium", "Pages with no meta description", pages.filter((p) => p.ok !== false && !String(p.meta || "").trim()).map((p) => p.url));
  for (const [m, urls] of group((p) => norm2(p.meta))) push("duplicate_meta", "medium", `Duplicate meta description on ${urls.length} pages`, urls, m.slice(0, 70));
  push("missing_h1", "medium", "Pages with no H1", pages.filter((p) => p.ok !== false && Number(p.h1_count || 0) === 0).map((p) => p.url));
  push("multiple_h1", "medium", "Pages with more than one H1", pages.filter((p) => Number(p.h1_count || 0) > 1).map((p) => p.url));
  push("thin_content", "medium", "Pages under 300 words", pages.filter((p) => p.ok !== false && Number(p.word_count || 0) > 0 && Number(p.word_count) < 300).map((p) => p.url));
  push("missing_canonical", "low", "Pages with no canonical tag", pages.filter((p) => p.ok !== false && !String(p.canonical || "").trim()).map((p) => p.url));
  const noAlt = pages.filter((p) => Number(p.images_total || 0) > 0 && Number(p.images_no_alt || 0) > 0);
  push("images_no_alt", "low", `Pages carrying images without alt text (${noAlt.reduce((a, p) => a + Number(p.images_no_alt || 0), 0)} images)`, noAlt.map((p) => p.url));

  /* Replace any previous site audit for this round so a re-run does not stack. */
  await db().from("qa_findings").delete().eq("review_id", reviewId).eq("round", round).eq("check_type", "site_audit");

  const rows = issues.map((i, idx) => ({
    review_id: reviewId, tab_id: null, tab_name: "Site wide", row_index: idx,
    item: `Site wide: ${i.label}`, check_type: "site_audit", url: i.urls[0] || "",
    expected: "", observed: `${i.urls.length} page(s)`,
    status: SITE_BLOCKING.has(i.category) ? "failed" : "partial",
    severity: i.severity, mistake_category: i.category, round, resolved_round: null,
    remark: `${i.label}${i.detail ? ` (${i.detail})` : ""}. ${i.urls.length} page(s) affected, for example ${i.urls.slice(0, 3).join(", ")}.`,
  }));
  if (rows.length) await db().from("qa_findings").insert(rows);
  await db().from("qa_reviews").update({ updated_at: new Date().toISOString() }).eq("id", reviewId);

  const blocking = issues.filter((i) => SITE_BLOCKING.has(i.category));
  return {
    success: true, pages_audited: pages.length, issues: issues.length,
    blocking: blocking.length,
    summary: issues.length
      ? `${pages.length} crawled pages audited: ${issues.length} site wide issue type(s) found, ${blocking.length} of them blocking.`
      : `${pages.length} crawled pages audited and no site wide issues were found.`,
    detail: issues.map((i) => ({ category: i.category, severity: i.severity, label: i.label, pages: i.urls.length, examples: i.urls.slice(0, 3) })),
  };
}

/* Reconcile the round against the commitment mail, and produce the documents.
   This is the half that used to live in a separate module: what was promised but
   never reported, what was reported but never promised, whether promised counts
   were met, and the submit gate that holds the client summary back until the
   delivery is actually clean. */
async function reconcileRound(review: any, findings: any[]) {
  const mail = String(review.mail_text || "").trim();
  let commitments: any[] = [];
  if (mail) {
    try {
      const sys = "You are a delivery auditor. From the commitment mail, list ONLY the discrete deliverables actually promised. Return ONLY JSON: {\"commitments\":[{\"id\":\"c1\",\"title\":\"short\",\"type\":\"title|meta_description|h1|canonical|schema|indexing|image_alt|internal_link|content|redirect|keyword|offpage|other\",\"quantity\":1}]}. Never invent a deliverable or a number that is not stated.";
      const { text } = await llmComplete({ system: sys, user: mail.slice(0, 14000), maxTokens: 1200, timeoutMs: 60000, label: "qa-commitments", maxSegments: 1 });
      const m = String(text || "").match(/\{[\s\S]*\}/);
      const p: any = m ? JSON.parse(m[0]) : {};
      commitments = Array.isArray(p.commitments) ? p.commitments : [];
    } catch { commitments = []; }
  }

  const missing: any[] = [];
  const quantity: any[] = [];
  for (const c of commitments) {
    const type = norm(c.type);
    const rel = findings.filter((f) => norm(f.check_type) === type);
    if (!rel.length) { missing.push({ title: String(c.title || type), note: "Promised in the commitment mail but nothing in the workbook reports it." }); continue; }
    const q = Number(c.quantity) || 0;
    if (q > 1) {
      const verified = rel.filter((f) => f.status === "verified").length;
      quantity.push({
        title: String(c.title || type), committed: q, reported: rel.length, verified,
        note: rel.length < q ? `Short of the commitment by ${q - rel.length}.` : (verified < rel.length ? `${rel.length - verified} reported item(s) are not confirmed live.` : "Counts line up."),
      });
    }
  }
  const committedTypes = new Set(commitments.map((c) => norm(c.type)));
  const extraTypes = Array.from(new Set(findings.map((f) => norm(f.check_type)))).filter((t) => t && committedTypes.size > 0 && !committedTypes.has(t));
  const extra = extraTypes.map((t) => ({ title: t, note: "Reported in the workbook but not traceable to the commitment mail." }));
  const shortCounts = quantity.filter((q) => q.reported < q.committed || q.verified < q.reported);
  return { commitments, missing, extra, quantity, shortCounts };
}

function buildDocuments(review: any, findings: any[], totals: any, gaps: any, gsc: any, ready: boolean, verdict: string, round: number, siteFindings: any[] = []) {
  const site = String(review.site_url || "");
  const row = (f: any) => `| ${f.item || f.check_type} | ${f.tab_name || ""} | ${f.url ? String(f.url).replace(/^https?:\/\//, "") : "n/a"} | ${f.status} | ${(f.observed || "nothing found").slice(0, 70)} | ${(f.remark || "").slice(0, 110)} |`;
  const internal_qa = [
    `# QA report: ${review.client_name || site} (round ${round})`,
    `**Verdict:** ${verdict}`,
    ``,
    `Executive: ${review.executive_name || "unattributed"}. Checked ${totals.total} item(s): ${totals.verified} verified, ${totals.partial} partial, ${totals.failed} failed, ${totals.unverifiable} unverifiable.`,
    ``,
    `## Item by item`,
    `| Item | Tab | Page | Status | Observed live | QA remark |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...findings.map(row),
    gaps.missing.length ? `\n## Promised but not reported\n${gaps.missing.map((m: any) => `- ${m.title}: ${m.note}`).join("\n")}` : "",
    gaps.extra.length ? `\n## Reported but not promised\n${gaps.extra.map((m: any) => `- ${m.title}: ${m.note}`).join("\n")}` : "",
    gaps.quantity.length ? `\n## Promised counts\n${gaps.quantity.map((q: any) => `- ${q.title}: committed ${q.committed}, reported ${q.reported}, confirmed live ${q.verified}. ${q.note}`).join("\n")}` : "",
    siteFindings.length ? `\n## Site wide, from the full crawl\n${siteFindings.map((x: any) => `- [${x.severity}] ${x.remark}`).join("\n")}` : "",
    `\n## Search Console\n${gsc.note}${(gsc.rows || []).length ? `\n\n| Query | Clicks | Impressions | Position |\n| --- | --- | --- | --- |\n${gsc.rows.map((r: any) => `| ${r.query} | ${r.clicks} | ${r.impressions} | ${Number(r.position).toFixed(1)} |`).join("\n")}` : ""}`,
  ].filter(Boolean).join("\n");

  const open = findings.filter((f) => f.status === "failed" || f.status === "partial");
  const fix_list = [
    `# Fix list for ${review.executive_name || "the executive"} (round ${round})`,
    open.length ? `${open.length} item(s) need action before this delivery can go to the client.` : `Nothing is failing the live checks.`,
    ``,
    ...open.map((f: any, i: number) => `${i + 1}. **${f.item || f.check_type}** (${f.tab_name})\n   ${f.url || ""}\n   Status: ${f.status}${f.severity ? `, severity ${f.severity}` : ""}. ${f.remark}`),
    gaps.missing.length ? `\n## Promised work with no completion record\n${gaps.missing.map((m: any) => `- ${m.title}`).join("\n")}` : "",
    gaps.shortCounts.length ? `\n## Counts that fall short\n${gaps.shortCounts.map((q: any) => `- ${q.title}: ${q.note}`).join("\n")}` : "",
    siteFindings.filter((x: any) => x.status === "failed").length ? `\n## Site wide issues holding the gate\n${siteFindings.filter((x: any) => x.status === "failed").map((x: any) => `- ${x.remark}`).join("\n")}` : "",
    findings.some((f) => f.status === "unverifiable") ? `\n## Needs its own proof (not visible on the site)\n${findings.filter((f) => f.status === "unverifiable").map((f: any) => `- ${f.item || f.check_type}: ${f.remark}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  const client_summary = ready
    ? [
        `# Work completed: ${review.client_name || site}`,
        ``,
        `Every item below was confirmed on the live site at the time of this check.`,
        ``,
        `| What was done | Page | Confirmed live |`,
        `| --- | --- | --- |`,
        ...findings.filter((f) => f.status === "verified").map((f: any) => `| ${f.item || f.check_type} | ${f.url ? String(f.url).replace(/^https?:\/\//, "") : "site wide"} | Yes |`),
        (gsc.rows || []).length ? `\n## Current search position for the target terms\n| Query | Clicks | Impressions | Position |\n| --- | --- | --- | --- |\n${gsc.rows.map((r: any) => `| ${r.query} | ${r.clicks} | ${r.impressions} | ${Number(r.position).toFixed(1)} |`).join("\n")}` : "",
      ].filter(Boolean).join("\n")
    : `# Client summary is on hold\n\nThis summary is deliberately not generated yet, because the delivery does not pass verification. ${verdict}\n\nClear the fix list, run the recheck round, and the client facing summary will be produced once every item is confirmed live.`;

  return { internal_qa, fix_list, client_summary };
}

/* Compute the whole outcome of a round WITHOUT writing anything, so the same
   report can be regenerated later from the stored findings. qaFinalize adds the
   write; loading a saved review uses this untouched. */
async function computeRound(review: any, all: any[], round: number) {
  /* Delivery items are what the executive claimed. Site wide findings come from
     the full crawl and are judged separately, so a pre existing minor issue
     elsewhere on the site does not fail an otherwise clean delivery, while a
     serious one still holds the gate shut. */
  const list = all.filter((x) => x.check_type !== "site_audit");
  const site = all.filter((x) => x.check_type === "site_audit");
  const siteBlocking = site.filter((x) => x.status === "failed");
  const totals = {
    total: list.length,
    verified: list.filter((x) => x.status === "verified").length,
    failed: list.filter((x) => x.status === "failed").length,
    partial: list.filter((x) => x.status === "partial").length,
    unverifiable: list.filter((x) => x.status === "unverifiable").length,
    site_issues: site.length,
    site_blocking: siteBlocking.length,
  };
  const open = totals.failed + totals.partial;
  const gaps = await reconcileRound(review, list);
  const ready = open === 0 && gaps.missing.length === 0 && gaps.shortCounts.length === 0 && siteBlocking.length === 0;
  const status = ready ? "passed" : "awaiting_fix";

  const byCat: Record<string, number> = {};
  for (const x of list) { if (x.mistake_category) byCat[x.mistake_category] = (byCat[x.mistake_category] || 0) + 1; }
  const gsc = await qaGscContext(String(review.project_id || ""), String(review.site_url || ""));
  const verdict = ready
    ? `Round ${round} passes. All ${totals.verified} checked items are confirmed live and within standard${site.length ? `, and the ${site.length} site wide observation(s) are not blocking` : ""}.${totals.unverifiable ? ` ${totals.unverifiable} item(s) need their own proof because they are not visible on the site.` : ""}`
    : `Round ${round} is not clean. ${totals.failed} item(s) are not live, ${totals.partial} need work, ${gaps.missing.length} promised item(s) are unreported, ${gaps.shortCounts.length} promised count(s) fall short, and ${siteBlocking.length} site wide issue(s) are blocking.`;
  const documents = buildDocuments(review, list, totals, gaps, gsc, ready, verdict, round, site);

  return {
    success: true, status, round, totals, gsc, ready_to_submit: ready, verdict, documents,
    missing: gaps.missing, extra: gaps.extra, quantity: gaps.quantity,
    site_findings: site.map((x) => ({ item: x.item, severity: x.severity, category: x.mistake_category, status: x.status, remark: x.remark })),
    open_items: list.filter((x) => x.status === "failed" || x.status === "partial")
      .map((x) => ({ tab: x.tab_name, item: x.item, url: x.url, status: x.status, severity: x.severity, remark: x.remark })),
    mistake_pattern: Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ category: k, count: v })),
  };
}

export async function qaFinalize(opts: { reviewId: string }) {
  const reviewId = String(opts.reviewId || "").trim();
  const { data: rev } = await db().from("qa_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!rev) return { success: false, error: "Review not found." };
  const review: any = rev; const round = Number(review.round) || 1;
  const { data: f } = await db().from("qa_findings").select("*").eq("review_id", reviewId).eq("round", round);
  const out: any = await computeRound(review, (f as any[]) || [], round);
  await db().from("qa_reviews").update({
    totals: out.totals, status: out.status, updated_at: new Date().toISOString(),
    completed_at: out.ready_to_submit ? new Date().toISOString() : null,
  }).eq("id", reviewId);
  return out;
}

/* ---- 4. Recheck round after the executive resubmits ------------------------- */

export async function qaRecheck(opts: { reviewId: string }) {
  const reviewId = String(opts.reviewId || "").trim();
  const { data: rev } = await db().from("qa_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!rev) return { success: false, error: "Review not found." };
  const review: any = rev; const nextRound = (Number(review.round) || 1) + 1;

  const { data: prior } = await db().from("qa_findings").select("*").eq("review_id", reviewId).eq("round", Number(review.round) || 1);
  const open = ((prior as any[]) || []).filter((x) => x.status === "failed" || x.status === "partial");
  if (!open.length) return { success: false, error: "Nothing is open on the current round, so there is nothing to recheck." };

  await db().from("qa_reviews").update({ round: nextRound, status: "rechecking", updated_at: new Date().toISOString(), submitted_at: new Date().toISOString() }).eq("id", reviewId);
  await db().from("qa_tabs").update({ status: "queued", rows_checked: 0, round: nextRound }).eq("review_id", reviewId);

  return {
    success: true, round: nextRound, status: "rechecking", to_recheck: open.length,
    items: open.map((x) => ({ tab: x.tab_name, row_index: x.row_index, item: x.item, url: x.url, expected: x.expected, previous_status: x.status, previous_remark: x.remark })),
    note: `Round ${nextRound} is open and marked as rechecking. Only the ${open.length} item(s) that were not clean need to be resubmitted and checked again.`,
  };
}

/* Recheck a single previously failing item, so a partial resubmission is fine. */
export async function qaRecheckItems(opts: { reviewId: string; items: Array<{ row_index: number; tab_name: string; url: string; expected: string; item?: string; check_type?: string }> }) {
  const reviewId = String(opts.reviewId || "").trim();
  const { data: rev } = await db().from("qa_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!rev) return { success: false, error: "Review not found." };
  const review: any = rev; const round = Number(review.round) || 1;
  const items = Array.isArray(opts.items) ? opts.items : [];
  const out: any[] = [];
  const rows: any[] = [];
  for (const it of items) {
    const type = String(it.check_type || "other");
    const check = await checkOne({ id: `r-${it.row_index}`, title: it.item || `${it.tab_name} row ${it.row_index + 1}`, type, url: it.url, expected: it.expected, keywords: [], committed: true, claimed: true }, review.site_url);
    const cat = mistakeCategory(check.status, type, check.quality || []);
    rows.push({
      review_id: reviewId, tab_id: null, tab_name: it.tab_name, row_index: it.row_index,
      item: it.item || `${it.tab_name} row ${it.row_index + 1}`, check_type: type, url: check.url || it.url,
      expected: it.expected, observed: check.observed || "", status: check.status,
      severity: severityOf(check.status, false), mistake_category: cat || null, round,
      remark: remarkOf(check.status, it.expected, check.observed || "", check.evidence, check.quality || []),
      resolved_round: check.status === "verified" ? round : null,
    });
    out.push({ item: it.item, url: it.url, status: check.status, remark: rows[rows.length - 1].remark });
  }
  if (rows.length) await db().from("qa_findings").insert(rows);
  await db().from("qa_reviews").update({ updated_at: new Date().toISOString() }).eq("id", reviewId);
  return { success: true, round, checked: out.length, results: out };
}

/* ---- 5. Work list: what is open, what moved today, with timestamps ---------- */

export async function qaWorklist(opts: { day?: string }) {
  const day = String(opts.day || "").trim() || new Date().toISOString().slice(0, 10);
  const from = `${day}T00:00:00.000Z`, to = `${day}T23:59:59.999Z`;
  const { data: open } = await db().from("qa_reviews").select("*").in("status", ["queued", "checking", "awaiting_fix", "rechecking"]).order("updated_at", { ascending: false }).limit(100);
  const { data: today } = await db().from("qa_reviews").select("*").gte("updated_at", from).lte("updated_at", to).order("updated_at", { ascending: false }).limit(100);
  const shape = (r: any) => ({
    id: r.id, title: r.title, client: r.client_name || r.client_id, client_id: r.client_id, site: r.site_url, executive: r.executive_name, bde: r.bde_name,
    status: r.status, round: r.round, totals: r.totals || {},
    submitted_at: r.submitted_at, updated_at: r.updated_at, completed_at: r.completed_at,
  });
  return {
    success: true, day,
    open: ((open as any[]) || []).map(shape),
    touched_today: ((today as any[]) || []).map(shape),
    counts: {
      awaiting_fix: ((open as any[]) || []).filter((r) => r.status === "awaiting_fix").length,
      rechecking: ((open as any[]) || []).filter((r) => r.status === "rechecking").length,
      in_progress: ((open as any[]) || []).filter((r) => r.status === "checking" || r.status === "queued").length,
      closed_today: ((today as any[]) || []).filter((r) => r.status === "passed").length,
    },
  };
}

/* ---- 6. Executive profile, built from their real QA history ----------------- */

/* Names are typed once. Every review registers the executive so the next review
   can offer them, and so their record accumulates against real work rather than
   being retyped from scratch each time. */
async function registerExecutive(name: string, role: "dme" | "bde"): Promise<void> {
  const n = String(name || "").trim();
  if (!n) return;
  try {
    const { data: found } = await db().from("qa_executives").select("id").eq("name", n).eq("role", role).maybeSingle();
    if (!found) await db().from("qa_executives").insert({ name: n, role });
  } catch { /* the directory still reads names from the reviews themselves */ }
}

/* Directory linking executive to client, site and project, searchable in plain
   words. A direct match handles names and domains; a phrased question is read
   for intent first, so "who keeps missing meta descriptions" finds the person. */
export async function qaDirectory(opts: { query?: string }) {
  const q = String(opts.query || "").trim();
  const { data: revs } = await db().from("qa_reviews")
    .select("id,client_id,client_name,site_url,executive_name,bde_name,project_id,status,round,totals,updated_at")
    .order("updated_at", { ascending: false }).limit(400);
  const reviews: any[] = (revs as any[]) || [];

  const ids = reviews.map((r) => r.id);
  let finds: any[] = [];
  if (ids.length) {
    try { const { data: f } = await db().from("qa_findings").select("review_id,status,mistake_category,round").in("review_id", ids).limit(6000); finds = (f as any[]) || []; }
    catch { finds = []; }
  }
  const byReview = new Map<string, any[]>();
  for (const f of finds) byReview.set(f.review_id, (byReview.get(f.review_id) || []).concat(f));

  let knownDmes: string[] = []; let knownBdes: string[] = [];
  let rosterNote = "";
  try {
    const { data: ex, error: exErr } = await db().from("qa_executives").select("name,role").order("name", { ascending: true }).limit(400);
    /* This read used to fail silently, which left both pickers permanently empty
       with nothing on screen to say why. The usual cause is qa_module_migration_2
       not having been applied, since that is what adds qa_executives.role, and
       every insert and every read here names that column. Report it instead. */
    if (exErr) rosterNote = `The saved name roster could not be read (${exErr.message || "unknown error"}). If the message mentions the role column, apply qa_module_migration_2.sql in Supabase. Names already used on past reviews are still listed below.`;
    for (const e of ((ex as any[]) || [])) {
      const n = String(e.name || "").trim(); if (!n) continue;
      if (String(e.role || "dme") === "bde") { if (!knownBdes.includes(n)) knownBdes.push(n); }
      else if (!knownDmes.includes(n)) knownDmes.push(n);
    }
  } catch (e: any) { rosterNote = `The saved name roster could not be read (${e?.message || "unknown error"}). Names already used on past reviews are still listed below.`; }
  for (const r of reviews) {
    const d = String(r.executive_name || "").trim(); if (d && !knownDmes.includes(d)) knownDmes.push(d);
    const b = String(r.bde_name || "").trim(); if (b && !knownBdes.includes(b)) knownBdes.push(b);
  }

  const execMap = new Map<string, any>();
  for (const r of reviews) {
    const name = String(r.executive_name || "").trim() || "unattributed";
    const e = execMap.get(name) || { executive: name, reviews: 0, clients: new Set<string>(), sites: new Set<string>(), projects: new Set<string>(), open: 0, items: 0, cleanFirst: 0, firstItems: 0, cats: {} as Record<string, number>, last_active: r.updated_at };
    e.reviews++;
    if (r.client_name || r.client_id) e.clients.add(String(r.client_name || r.client_id));
    if (r.site_url) e.sites.add(String(r.site_url).replace(/^https?:\/\//, "").replace(/\/$/, ""));
    if (r.project_id) e.projects.add(String(r.project_id));
    if (r.status === "awaiting_fix" || r.status === "rechecking") e.open++;
    if (!e.last_active || String(r.updated_at) > String(e.last_active)) e.last_active = r.updated_at;
    for (const f of (byReview.get(r.id) || [])) {
      e.items++;
      if ((Number(f.round) || 1) === 1) { e.firstItems++; if (f.status === "verified") e.cleanFirst++; }
      if (f.mistake_category) e.cats[f.mistake_category] = (e.cats[f.mistake_category] || 0) + 1;
    }
    execMap.set(name, e);
  }

  let executives = Array.from(execMap.values()).map((e) => ({
    executive: e.executive, reviews: e.reviews,
    clients: Array.from(e.clients) as string[], sites: Array.from(e.sites) as string[], projects: e.projects.size,
    open_reviews: e.open, items_checked: e.items,
    first_pass_rate: e.firstItems ? Math.round((e.cleanFirst / e.firstItems) * 100) : 0,
    recurring_mistakes: Object.entries(e.cats as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ category: k, count: v })),
    last_active: e.last_active,
  })).sort((a, b) => b.reviews - a.reviews);

  let interpreted = "";
  if (q) {
    const ql = q.toLowerCase();
    const hit = (e: any) => e.executive.toLowerCase().includes(ql)
      || e.clients.some((c: string) => c.toLowerCase().includes(ql))
      || e.sites.some((s: string) => s.toLowerCase().includes(ql))
      || e.recurring_mistakes.some((m: any) => String(m.category).toLowerCase().includes(ql));
    let matched = executives.filter(hit);
    if (!matched.length && q.split(/\s+/).length > 1) {
      try {
        const sys = "Map a search over a quality assurance directory to filters. Return ONLY JSON: {\"executive\":\"\",\"client\":\"\",\"mistake_category\":\"one of not_implemented, unverifiable_claim, thin_content, keyword_missing, length_out_of_range, duplication, incomplete_execution, indexation_risk, below_standard, or empty\",\"sort\":\"worst_first_pass|most_open|most_reviews|recent|empty\"}. Leave anything not asked for empty.";
        const { text } = await llmComplete({ system: sys, user: q, maxTokens: 200, timeoutMs: 30000, label: "qa-directory-search", maxSegments: 1 });
        const m = String(text || "").match(/\{[\s\S]*\}/);
        const p: any = m ? JSON.parse(m[0]) : {};
        interpreted = [p.executive && `executive ${p.executive}`, p.client && `client ${p.client}`, p.mistake_category && `mistakes of type ${p.mistake_category}`, p.sort && `sorted by ${String(p.sort).replace(/_/g, " ")}`].filter(Boolean).join(", ");
        matched = executives.filter((e) =>
          (!p.executive || e.executive.toLowerCase().includes(String(p.executive).toLowerCase())) &&
          (!p.client || e.clients.some((c: string) => c.toLowerCase().includes(String(p.client).toLowerCase()))) &&
          (!p.mistake_category || e.recurring_mistakes.some((mm: any) => mm.category === p.mistake_category)));
        if (p.sort === "worst_first_pass") matched.sort((a, b) => a.first_pass_rate - b.first_pass_rate);
        else if (p.sort === "most_open") matched.sort((a, b) => b.open_reviews - a.open_reviews);
        else if (p.sort === "recent") matched.sort((a, b) => String(b.last_active).localeCompare(String(a.last_active)));
      } catch { /* fall back to the plain match */ }
    }
    executives = matched;
  }

  return {
    success: true, query: q, interpreted, known_dmes: knownDmes, known_bdes: knownBdes, roster_note: rosterNote, executives,
    reviews: reviews.slice(0, 60).map((r) => ({ id: r.id, client_id: r.client_id, client: r.client_name, site: r.site_url, executive: r.executive_name, bde: r.bde_name, status: r.status, round: r.round, updated_at: r.updated_at })),
  };
}

export async function qaExecutiveProfile(opts: { executiveName?: string }) {
  const name = String(opts.executiveName || "").trim();
  const { data: revs } = name
    ? await db().from("qa_reviews").select("*").eq("executive_name", name).order("created_at", { ascending: false }).limit(200)
    : await db().from("qa_reviews").select("*").order("created_at", { ascending: false }).limit(200);
  const reviews: any[] = (revs as any[]) || [];
  if (!reviews.length) return { success: true, executives: [], note: "No QA history yet for this name." };

  const byExec = new Map<string, any[]>();
  for (const r of reviews) { const k = r.executive_name || "unattributed"; byExec.set(k, (byExec.get(k) || []).concat(r)); }

  const out: any[] = [];
  for (const [execName, list] of byExec) {
    const ids = list.map((r) => r.id);
    const { data: f } = await db().from("qa_findings").select("status,mistake_category,check_type,round,created_at").in("review_id", ids).limit(4000);
    const finds: any[] = (f as any[]) || [];
    const total = finds.length;
    /* First pass rate must measure the FIRST round only. Counting later rounds
       would dilute the score of someone who corrected their work properly, which
       would misrepresent them on a profile that follows their career. */
    const firstRound = finds.filter((x) => (Number(x.round) || 1) === 1);
    const firstClean = firstRound.filter((x) => x.status === "verified").length;
    const cleanOverall = finds.filter((x) => x.status === "verified").length;
    const byCat: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const x of finds) {
      if (x.mistake_category) byCat[x.mistake_category] = (byCat[x.mistake_category] || 0) + 1;
      if (x.status !== "verified" && x.check_type) byType[x.check_type] = (byType[x.check_type] || 0) + 1;
    }
    const rounds = list.map((r) => Number(r.round) || 1);
    out.push({
      executive: execName,
      reviews: list.length,
      projects: Array.from(new Set(list.map((r) => r.client_name || r.site_url).filter(Boolean))),
      items_checked: total,
      first_pass_rate: firstRound.length ? Math.round((firstClean / firstRound.length) * 100) : 0,
      clean_rate_all_rounds: total ? Math.round((cleanOverall / total) * 100) : 0,
      average_rounds: rounds.length ? Math.round((rounds.reduce((a, b) => a + b, 0) / rounds.length) * 10) / 10 : 1,
      recurring_mistakes: Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ category: k, count: v })),
      weakest_areas: Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ area: k, issues: v })),
      open_reviews: list.filter((r) => r.status === "awaiting_fix" || r.status === "rechecking").map((r) => ({ id: r.id, client: r.client_name, status: r.status, round: r.round })),
    });
  }
  out.sort((a, b) => b.items_checked - a.items_checked);
  return { success: true, executives: out };
}

/* ---- 7. Load a saved review in full (reusable, nothing is temporary) -------- */

export async function qaLoadReview(opts: { reviewId: string }) {
  const reviewId = String(opts.reviewId || "").trim();
  const { data: rev } = await db().from("qa_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!rev) return { success: false, error: "Review not found." };
  const { data: tabs } = await db().from("qa_tabs").select("*").eq("review_id", reviewId).order("tab_index", { ascending: true });
  const { data: finds } = await db().from("qa_findings").select("*").eq("review_id", reviewId).order("round", { ascending: true }).limit(5000);
  const allFinds: any[] = (finds as any[]) || [];
  const round = Number((rev as any).round) || 1;
  /* Regenerate the report for the saved round from the stored findings, so a
     review opened later carries the same QA report, fix list and client summary
     it produced during checking. Nothing is written by this path. */
  let report: any = null;
  try { report = await computeRound(rev, allFinds.filter((x) => (Number(x.round) || 1) === round), round); } catch { report = null; }
  return { success: true, review: rev, tabs: tabs || [], findings: allFinds, report };
}
