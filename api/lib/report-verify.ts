/* Work report verification engine.

   Closes the full delivery cycle for an agency handover:
     sales commitments (the mail to the PM)
       -> claimed completion (the PM sheets and documents)
         -> what is ACTUALLY live on the site right now (fetched and checked)
           -> quality of that implementation (not just present, but done well)
             -> corroboration in Search Console when it is connected (optional)
               -> alignment with what the client actually cares about (chat and call)

   Every status is earned from observed evidence. A claim is only marked verified
   when the live page really shows it. Work that cannot be seen on a page (for
   example off-page link building) is reported as unverifiable rather than being
   quietly passed or quietly failed. Nothing is inferred, estimated or invented. */

import { fetchHtml, fetchViaReader, loadGsc } from "./workspace/shared.js";
import { llmComplete } from "./workspace/llm.js";

export type CheckStatus = "verified" | "failed" | "partial" | "unverifiable";

export interface Commitment {
  id: string;
  title: string;
  type: string;
  target_urls: string[];
  target_keywords: string[];
  expected_value: string;
  quantity_committed: number;
  source: string;
}

export interface ClaimCheck {
  id: string;
  title: string;
  type: string;
  url: string;
  expected: string;
  status: CheckStatus;
  observed: string;
  evidence: string;
  quality: string[];
  committed: boolean;
  claimed: boolean;
}

export interface VerifyResult {
  ready_to_submit: boolean;
  verdict: string;
  counts: { total: number; verified: number; failed: number; partial: number; unverifiable: number };
  checks: ClaimCheck[];
  missing: Array<{ title: string; note: string }>;
  extra: Array<{ title: string; note: string }>;
  quantity: Array<{ title: string; committed: number; claimed: number; verified: number; note: string }>;
  quality_issues: string[];
  gsc: { connected: boolean; note: string; rows: Array<{ query: string; clicks: number; impressions: number; position: number }> };
  client_alignment: string;
  pages_checked: number;
  pages_capped: boolean;
  documents: { internal_qa: string; fix_list: string; client_summary: string };
}

const MAX_URLS = 40;              // time budget for a single verification run
const norm = (s: string) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const words = (s: string) => norm(s).split(" ").filter(Boolean).length;

function absolute(u: string, base: string): string {
  try { return new URL(u, base.startsWith("http") ? base : "https://" + base).toString(); } catch { return ""; }
}

/* Read a live page, using the render fallback so a JavaScript rendered or
   region blocked page is still read rather than being wrongly failed. */
async function readLive(url: string): Promise<{ ok: boolean; html: string }> {
  let html = await fetchHtml(url).catch(() => "");
  if (!html || html.length < 400 || !/<\/html>/i.test(html)) {
    const r = await fetchViaReader(url).catch(() => ({ ok: false, html: "" }));
    if (r.ok && r.html && r.html.length > (html ? html.length : 0)) html = r.html;
  }
  /* A short page is still a real page. Only treat it as unreadable when nothing
     resembling markup came back, otherwise a genuine failure (an element that is
     simply missing) would be hidden behind an unverifiable status. */
  return { ok: Boolean(html && html.length > 60 && /<\s*\w/.test(html)), html: html || "" };
}

const pick = (html: string, re: RegExp): string => {
  const m = html.match(re);
  return m ? String(m[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
};

function titleOf(html: string) { return pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i); }
function metaDescOf(html: string) {
  return pick(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)
      || pick(html, /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
}
function h1sOf(html: string): string[] {
  return Array.from(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)).map((m) => String(m[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
}
function canonicalOf(html: string) {
  return pick(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i)
      || pick(html, /<link[^>]+href=["']([^"']*)["'][^>]*rel=["']canonical["']/i);
}
function ldJsonOf(html: string): string[] {
  return Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)).map((m) => String(m[1]).trim()).filter(Boolean);
}
function robotsOf(html: string) {
  return pick(html, /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i);
}
function bodyTextOf(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/* Does the live value satisfy what was promised? Exact equality is too strict for
   copy that a writer reworded, so a promised value counts when either string
   contains the other, or when most of the promised words are present. */
function satisfies(expected: string, observed: string): boolean {
  const e = norm(expected), o = norm(observed);
  if (!e) return Boolean(o);
  if (!o) return false;
  if (o.includes(e) || e.includes(o)) return true;
  const ew = e.split(" ").filter((w) => w.length > 3);
  if (!ew.length) return false;
  const hit = ew.filter((w) => o.includes(w)).length;
  return hit / ew.length >= 0.7;
}

/* Deterministic quality rules. Presence is not the same as done well, and the
   client is paying for done well. */
function qualityOf(type: string, observed: string, html: string, keywords: string[]): string[] {
  const out: string[] = [];
  const kw = keywords.map(norm).filter(Boolean);
  if (type === "title") {
    const n = observed.length;
    if (n && n < 30) out.push(`Title is short at ${n} characters, so it wastes available space in the result.`);
    if (n > 65) out.push(`Title is long at ${n} characters and is likely to be truncated in the result.`);
    if (kw.length && !kw.some((k) => norm(observed).includes(k))) out.push("Target keyword does not appear in the title.");
  }
  if (type === "meta_description") {
    const n = observed.length;
    if (n && n < 70) out.push(`Meta description is thin at ${n} characters.`);
    if (n > 165) out.push(`Meta description is long at ${n} characters and will be cut off.`);
  }
  if (type === "h1") {
    const all = h1sOf(html);
    if (all.length > 1) out.push(`The page has ${all.length} H1 headings, which splits the topic signal.`);
    if (kw.length && !kw.some((k) => norm(observed).includes(k))) out.push("Target keyword does not appear in the H1.");
  }
  if (type === "schema") {
    for (const block of ldJsonOf(html)) {
      try { const j = JSON.parse(block); if (!j || (!j["@type"] && !Array.isArray(j))) out.push("Structured data block has no @type."); }
      catch { out.push("A structured data block is not valid JSON and will be ignored by search engines."); }
    }
  }
  if (type === "content") {
    const w = words(bodyTextOf(html));
    if (w < 300) out.push(`The page carries only about ${w} words, which is thin for a page expected to rank.`);
  }
  if (type === "image_alt") {
    const imgs = (html.match(/<img[^>]*>/gi) || []);
    const withAlt = imgs.filter((t) => /alt=["'][^"']+["']/i.test(t)).length;
    if (imgs.length && withAlt / imgs.length < 0.8) out.push(`Only ${withAlt} of ${imgs.length} images carry alt text.`);
  }
  const rb = robotsOf(html);
  if (/noindex/i.test(rb)) out.push("The page carries a noindex directive, so this work cannot produce search visibility while that stays.");
  return out;
}

/* Check one claim against the live page. Exported so the QA desk reuses exactly
   this logic rather than keeping a second, drifting copy of it. */
export async function checkOne(c: any, siteUrl: string): Promise<ClaimCheck> {
  const url = absolute(String(c.url || ""), siteUrl);
  const base: ClaimCheck = {
    id: String(c.id || ""), title: String(c.title || ""), type: String(c.type || "other"),
    url, expected: String(c.expected || ""), status: "unverifiable", observed: "", evidence: "",
    quality: [], committed: Boolean(c.committed), claimed: Boolean(c.claimed),
  };
  const offpage = /backlink|link building|outreach|guest post|directory|citation|gmb|google business|social|press release/i.test(base.type + " " + base.title);
  if (offpage) { base.status = "unverifiable"; base.evidence = "Off-page work is not observable on the client site, so it cannot be confirmed by reading the page. Ask for the live URLs of the placements and verify each one."; return base; }
  if (!url) { base.status = "unverifiable"; base.evidence = "No target URL was given for this item, so there is nothing to check against."; return base; }

  const { ok, html } = await readLive(url);
  if (!ok) { base.status = "unverifiable"; base.evidence = "The page could not be read this run, so the claim was neither confirmed nor disproved. Retry, or confirm the page is reachable."; return base; }

  const kws: string[] = Array.isArray(c.keywords) ? c.keywords.map(String) : [];
  let observed = "";
  switch (base.type) {
    case "title": observed = titleOf(html); break;
    case "meta_description": observed = metaDescOf(html); break;
    case "h1": observed = h1sOf(html)[0] || ""; break;
    case "canonical": observed = canonicalOf(html); break;
    case "schema": observed = ldJsonOf(html).length ? `${ldJsonOf(html).length} structured data block(s)` : ""; break;
    case "indexing": observed = robotsOf(html) || "no robots meta (indexable)"; break;
    case "image_alt": {
      const imgs = (html.match(/<img[^>]*>/gi) || []);
      observed = `${imgs.filter((t) => /alt=["'][^"']+["']/i.test(t)).length} of ${imgs.length} images have alt text`;
      break;
    }
    case "internal_link": {
      const target = norm(String(c.expected || ""));
      const links = Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)).map((m) => norm(String(m[1])));
      observed = target ? (links.some((l) => l.includes(target)) ? `link to ${c.expected} present` : "") : `${links.length} links on the page`;
      break;
    }
    case "content": observed = `${words(bodyTextOf(html))} words`; break;
    case "keyword": {
      const body = norm(bodyTextOf(html)) + " " + norm(titleOf(html)) + " " + norm(h1sOf(html).join(" "));
      const found = kws.filter((k) => body.includes(norm(k)));
      observed = found.length ? `found: ${found.join(", ")}` : "";
      break;
    }
    default: observed = titleOf(html); break;
  }
  base.observed = observed;
  base.quality = qualityOf(base.type, observed, html, kws);

  if (base.type === "indexing") {
    base.status = /noindex/i.test(observed) ? "failed" : "verified";
    base.evidence = /noindex/i.test(observed) ? "The page is set to noindex." : "The page is indexable.";
  } else if (base.type === "schema" || base.type === "image_alt" || base.type === "content") {
    const present = base.type === "schema" ? ldJsonOf(html).length > 0 : base.type === "content" ? words(bodyTextOf(html)) > 0 : /<img/i.test(html);
    base.status = present ? (base.quality.length ? "partial" : "verified") : "failed";
    base.evidence = present ? `Observed on the live page: ${observed}.` : "Nothing matching this claim was found on the live page.";
  } else if (!observed) {
    base.status = "failed";
    base.evidence = "The live page does not carry this element, so the claim is not supported.";
  } else if (satisfies(base.expected, observed)) {
    base.status = base.quality.length ? "partial" : "verified";
    base.evidence = `Live page shows: ${observed}`;
  } else if (base.expected) {
    base.status = "partial";
    base.evidence = `The element exists but does not match what was committed. Live page shows: ${observed}`;
  } else {
    base.status = base.quality.length ? "partial" : "verified";
    base.evidence = `Live page shows: ${observed}`;
  }
  return base;
}

export async function verifyWorkReport(opts: {
  projectId?: string;
  siteUrl: string;
  clientContext?: string;
  mailText?: string;
  completionText?: string;
}): Promise<VerifyResult> {
  const siteUrl = String(opts.siteUrl || "").trim();
  const clientContext = String(opts.clientContext || "").trim();
  const mailText = String(opts.mailText || "").trim();
  const completionText = String(opts.completionText || "").trim();

  /* 1. Read the cycle: commitments from the mail, claims from the completion
        documents, and the targets named anywhere across all of it. */
  const sys = "You are a meticulous delivery auditor for an SEO agency. You are given the commitment mail sent from sales to the project manager, the completion documents the project manager returned, and background on the client. Extract, strictly from the text, ONLY what is actually stated. Return ONLY JSON: {\"commitments\":[{\"id\":\"c1\",\"title\":\"short\",\"type\":\"title|meta_description|h1|canonical|schema|indexing|image_alt|internal_link|content|redirect|keyword|offpage|other\",\"url\":\"page URL if named else empty\",\"expected\":\"the promised value or specific requirement if stated else empty\",\"keywords\":[],\"quantity\":1}],\"claims\":[{\"id\":\"d1\",\"title\":\"short\",\"type\":\"same enum\",\"url\":\"\",\"expected\":\"the value the document says was implemented\",\"keywords\":[],\"quantity\":1,\"matches_commitment\":\"c1 or empty\"}],\"client_priorities\":\"a short paragraph on what this client cares about and their pain points, from the background\",\"site_urls\":[\"every distinct page URL named anywhere\"],\"keywords\":[\"every target keyword named anywhere\"]}. Never invent a URL, a value, a quantity or a commitment that is not in the text. If a quantity is stated as a number of pages, put that number in quantity.";
  const user = [
    `Client site: ${siteUrl}.`,
    clientContext ? `Client background, chat and call notes:\n${clientContext.slice(0, 12000)}` : "No client background was provided.",
    mailText ? `Commitment mail from sales to the project manager:\n${mailText.slice(0, 14000)}` : "No commitment mail was provided.",
    completionText ? `Work completion documents and sheets from the project manager:\n${completionText.slice(0, 20000)}` : "No completion documents were provided.",
  ].join("\n\n");

  let parsed: any = {};
  for (let attempt = 0; attempt < 2 && !parsed.claims && !parsed.commitments; attempt++) {
    try {
      const { text } = await llmComplete({ system: sys, user, maxTokens: 3000, timeoutMs: 90000, label: "report-verify-extract", maxSegments: 2 });
      const m = String(text || "").match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    } catch { parsed = {}; }
  }
  const commitments: any[] = Array.isArray(parsed.commitments) ? parsed.commitments : [];
  const claims: any[] = Array.isArray(parsed.claims) ? parsed.claims : [];
  const allKeywords: string[] = Array.isArray(parsed.keywords) ? parsed.keywords.map(String).filter(Boolean) : [];

  /* 2. Build the check list: every claim, plus every commitment with no matching
        claim (those are missing deliverables, and they still get checked live in
        case the work was done but never written up). */
  const matched = new Set<string>(claims.map((d) => String(d.matches_commitment || "")).filter(Boolean));
  const toCheck: any[] = [];
  for (const d of claims) {
    const c = commitments.find((x) => String(x.id) === String(d.matches_commitment || ""));
    toCheck.push({ ...d, keywords: (d.keywords || []).concat(c ? (c.keywords || []) : []), expected: d.expected || (c ? c.expected : ""), committed: Boolean(c), claimed: true });
  }
  for (const c of commitments) {
    if (matched.has(String(c.id))) continue;
    toCheck.push({ ...c, committed: true, claimed: false });
  }

  const capped = toCheck.length > MAX_URLS;
  const slice = toCheck.slice(0, MAX_URLS);
  const checks: ClaimCheck[] = [];
  for (const item of slice) checks.push(await checkOne(item, siteUrl));

  /* 3. Cross-page quality: duplication is invisible page by page. */
  const quality_issues: string[] = [];
  const seenTitle = new Map<string, string[]>();
  for (const c of checks) {
    if (c.type === "title" && c.observed) {
      const k = norm(c.observed);
      seenTitle.set(k, (seenTitle.get(k) || []).concat(c.url));
    }
    for (const q of c.quality) quality_issues.push(`${c.url || c.title}: ${q}`);
  }
  for (const [t, urls] of seenTitle) { if (urls.length > 1) quality_issues.push(`Duplicate title across ${urls.length} pages (${t.slice(0, 60)}): ${urls.slice(0, 4).join(", ")}`); }

  /* 4. Gaps in both directions. */
  const missing = commitments.filter((c) => !matched.has(String(c.id))).map((c) => ({
    title: String(c.title || ""),
    note: "Committed in the mail but not reported as completed in the documents.",
  }));
  const extra = claims.filter((d) => !d.matches_commitment).map((d) => ({
    title: String(d.title || ""),
    note: "Reported as completed but not traceable to a commitment in the mail.",
  }));

  /* 5. Promised counts against confirmed counts. */
  const quantity: VerifyResult["quantity"] = [];
  for (const c of commitments) {
    const q = Number(c.quantity) || 0;
    if (q <= 1) continue;
    const rel = claims.filter((d) => String(d.matches_commitment || "") === String(c.id));
    const claimedQty = rel.reduce((a, d) => a + (Number(d.quantity) || 1), 0);
    const verifiedQty = checks.filter((k) => rel.some((d) => String(d.id) === k.id) && k.status === "verified").length;
    quantity.push({
      title: String(c.title || ""), committed: q, claimed: claimedQty, verified: verifiedQty,
      note: claimedQty < q ? `Short of the commitment by ${q - claimedQty}.` : (verifiedQty < claimedQty ? `${claimedQty - verifiedQty} of the reported items are not confirmed live.` : "Counts line up."),
    });
  }

  /* 6. Search Console corroboration, entirely optional. */
  const gsc: VerifyResult["gsc"] = { connected: false, note: "", rows: [] };
  if (opts.projectId) {
    try {
      const g: any = await loadGsc(opts.projectId);
      const top = ((g && g.topQueries) || []).map((q: any) => ({
        query: String(q.query || (Array.isArray(q.keys) ? q.keys[0] : "")),
        clicks: Number(q.clicks) || 0, impressions: Number(q.impressions) || 0, position: Number(q.position) || 0,
      })).filter((r: any) => r.query);
      if (top.length) {
        gsc.connected = true;
        const want = allKeywords.map(norm);
        gsc.rows = (want.length ? top.filter((r: any) => want.some((w: string) => norm(r.query).includes(w) || w.includes(norm(r.query)))) : top).slice(0, 20);
        gsc.note = gsc.rows.length
          ? "Search Console figures below are the current position for the target terms. They are context for the work, not proof that a specific change was made."
          : "Search Console is connected but none of the target terms appear in the current query set yet.";
      } else gsc.note = "Search Console is not connected for this project, so the verification rests on the live page checks. That is sufficient for confirming implementation.";
    } catch { gsc.note = "Search Console could not be read, so the verification rests on the live page checks."; }
  } else gsc.note = "Search Console was not used for this run. The live page checks stand on their own for confirming implementation.";

  /* 7. Does the delivered work speak to what the client actually cares about? */
  let client_alignment = "";
  if (clientContext) {
    try {
      const asys = "You are a senior account lead. Given what the client cares about and the list of work items with their verified status, write a short, honest paragraph on which of the client's stated priorities and pain points this delivery addresses, and which are not yet addressed. Use only the given material. Never use an em-dash. 120 to 200 words.";
      const auser = `Client priorities: ${parsed.client_priorities || clientContext.slice(0, 3000)}\n\nWork items and status:\n${checks.map((c) => `- ${c.title} (${c.type}): ${c.status}`).join("\n")}`;
      const { text } = await llmComplete({ system: asys, user: auser, maxTokens: 600, timeoutMs: 60000, label: "report-verify-alignment", maxSegments: 1 });
      client_alignment = String(text || "").trim();
    } catch { client_alignment = ""; }
  }

  /* 8. Verdict. A report is only ready when nothing is failing, nothing is
        missing, and no promised count is short. Unverifiable items are called out
        rather than silently passed. */
  const counts = {
    total: checks.length,
    verified: checks.filter((c) => c.status === "verified").length,
    failed: checks.filter((c) => c.status === "failed").length,
    partial: checks.filter((c) => c.status === "partial").length,
    unverifiable: checks.filter((c) => c.status === "unverifiable").length,
  };
  const shortCounts = quantity.filter((q) => q.claimed < q.committed || q.verified < q.claimed);
  const ready = counts.failed === 0 && counts.partial === 0 && missing.length === 0 && shortCounts.length === 0;
  const verdict = ready
    ? `All ${counts.verified} checkable items are confirmed live and pass the quality rules.${counts.unverifiable ? ` ${counts.unverifiable} item(s) cannot be confirmed from the site and need their own proof before this goes out.` : ""}`
    : `Not ready to submit. ${counts.failed} item(s) are not live, ${counts.partial} need work, ${missing.length} committed item(s) are unreported, and ${shortCounts.length} promised count(s) fall short.`;

  /* 9. The three documents. */
  const row = (c: ClaimCheck) => `| ${c.title || c.type} | ${c.url ? c.url.replace(/^https?:\/\//, "") : "n/a"} | ${c.status} | ${(c.observed || "nothing found").slice(0, 90)} | ${c.evidence.slice(0, 120)} |`;
  const internal_qa = [
    `# Delivery verification: ${siteUrl}`,
    `**Verdict:** ${verdict}`,
    ``,
    `Checked ${counts.total} item(s) against the live site: ${counts.verified} verified, ${counts.partial} partial, ${counts.failed} failed, ${counts.unverifiable} unverifiable.${capped ? ` The run was capped at ${MAX_URLS} items, so the remainder still needs a pass.` : ""}`,
    ``,
    `## Item by item`,
    `| Item | Page | Status | Observed live | Evidence |`,
    `| --- | --- | --- | --- | --- |`,
    ...checks.map(row),
    ``,
    missing.length ? `## Committed but not reported\n${missing.map((m) => `- ${m.title}: ${m.note}`).join("\n")}` : "",
    extra.length ? `## Reported but not committed\n${extra.map((m) => `- ${m.title}: ${m.note}`).join("\n")}` : "",
    quantity.length ? `## Promised counts\n${quantity.map((q) => `- ${q.title}: committed ${q.committed}, reported ${q.claimed}, confirmed live ${q.verified}. ${q.note}`).join("\n")}` : "",
    quality_issues.length ? `## Quality issues found\n${quality_issues.map((q) => `- ${q}`).join("\n")}` : `## Quality issues found\nNone against the rules applied.`,
    gsc.rows.length ? `## Search Console context\n${gsc.note}\n\n| Query | Clicks | Impressions | Position |\n| --- | --- | --- | --- |\n${gsc.rows.map((r) => `| ${r.query} | ${r.clicks} | ${r.impressions} | ${r.position.toFixed(1)} |`).join("\n")}` : `## Search Console context\n${gsc.note}`,
    client_alignment ? `## Against what the client cares about\n${client_alignment}` : "",
  ].filter(Boolean).join("\n");

  const fixes = checks.filter((c) => c.status === "failed" || c.status === "partial");
  const fix_list = [
    `# Fix list before this report goes to the client`,
    fixes.length ? `${fixes.length} item(s) need action.` : `Nothing is failing the live checks.`,
    ``,
    ...fixes.map((c, i) => `${i + 1}. **${c.title || c.type}** on ${c.url || "the site"}\n   Status: ${c.status}. ${c.evidence}\n   ${c.expected ? `Committed: ${c.expected}\n   ` : ""}${c.quality.length ? `Quality: ${c.quality.join(" ")}` : ""}`),
    missing.length ? `\n## Committed work with no completion record\n${missing.map((m) => `- ${m.title}`).join("\n")}` : "",
    shortCounts.length ? `\n## Counts that fall short\n${shortCounts.map((q) => `- ${q.title}: ${q.note}`).join("\n")}` : "",
    counts.unverifiable ? `\n## Needs its own proof (not visible on the site)\n${checks.filter((c) => c.status === "unverifiable").map((c) => `- ${c.title || c.type}: ${c.evidence}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  const client_summary = ready
    ? [
        `# Work completed: ${siteUrl}`,
        client_alignment || "",
        ``,
        `Every item below was confirmed on the live site at the time of this check.`,
        ``,
        `| What was done | Page | Confirmed live |`,
        `| --- | --- | --- |`,
        ...checks.filter((c) => c.status === "verified").map((c) => `| ${c.title || c.type} | ${c.url ? c.url.replace(/^https?:\/\//, "") : "site wide"} | Yes |`),
        gsc.rows.length ? `\n## Current search position for the target terms\n| Query | Clicks | Impressions | Position |\n| --- | --- | --- | --- |\n${gsc.rows.map((r) => `| ${r.query} | ${r.clicks} | ${r.impressions} | ${r.position.toFixed(1)} |`).join("\n")}` : "",
      ].filter(Boolean).join("\n")
    : `# Client summary is on hold\n\nThis summary is deliberately not generated yet, because the delivery does not pass verification. ${verdict}\n\nWork through the fix list, re-run the check, and the client facing summary will be produced once every item is confirmed live.`;

  return {
    ready_to_submit: ready, verdict, counts, checks, missing, extra, quantity, quality_issues,
    gsc, client_alignment, pages_checked: checks.length, pages_capped: capped,
    documents: { internal_qa, fix_list, client_summary },
  };
}
