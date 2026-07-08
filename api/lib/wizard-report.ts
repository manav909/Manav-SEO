/* ════════════════════════════════════════════════════════════════
   api/lib/wizard-report.ts

   BUILD 12.29 — Client-ready report assembler.

   Turns the wizard's completed stage outputs into a single, written,
   client-facing audit document. Design rules, all in service of trust:

   - GROUNDED, NOT FREE-WRITTEN. Every line is rendered from the
     structured data the engines actually produced. No prose is invented;
     numbers come straight from the stage outputs. This is a formatter,
     not a copywriter.
   - VERIFIABLE SOURCE PER SECTION. Each section states where its data
     came from in client terms the client can independently check
     (Google Search Console property + date, live search results + date,
     a crawl of specific pages + date, the client's own Ads export). A
     consolidated "Sources and how to verify" section closes the report.
   - AUTHORED, UNBRANDED. A configurable author byline (default a person,
     not a tool). No platform/tool/engine names in client-facing text by
     default; branding is opt-in only.
   - HONEST LIMITS. Each engine's stated limits are collated into a
     limitations section so the client sees the boundaries of the data.

   Stateless: consumes stage outputs passed in (the wizard run holds them
   client-side). Multi-tenant: no stored values.
════════════════════════════════════════════════════════════════ */

import { llm, parseJsonResponse } from "./workspace/llm.js";
import { loadMaterials, materialsForPrompt } from "./client-materials.js";
import { assessCoverage } from "./audit-coverage.js";

export interface ReportStageInput {
  label:      string;
  ran_engine?:string | null;
  status?:    string;
  output:     any;
}
export interface ReportOptions {
  author?:          string;   // byline — a person, e.g. "Manav S"
  client_name?:     string;
  client_domain?:   string;
  include_branding?:boolean;   // default false — no tool branding
  report_title?:    string;
  project_id?:      string;    // to load operator-provided materials for depth
  requirements?:    string[];  // full brief requirement list, for the coverage layer
  artifact_mode?:   "audit" | "proposal";  // which document to produce (default audit)
  engagement_type?: string;    // site_owner | reseller_productized | one_off_project | consultation
  target_is_example?: boolean; // the analysed site is a representative example, not the deliverable
  buyer_note?:      string;    // who is buying and what they optimise for
}

/* Completed sections, with duplicate sections (same engine + same summary)
   collapsed — the composer can map two brief points to one engine. */
function completedStages(stages: ReportStageInput[]): ReportStageInput[] {
  const done = stages.filter(s => s.output && (s.status === "completed" || s.status === undefined));
  /* Collapse stages that ran the SAME engine into one section (the composer
     often maps several brief points to one engine; running it repeatedly
     produced duplicate, sometimes contradictory, sections). Merge the
     requirement labels so the one section credits all of them. */
  const byEngine = new Map<string, ReportStageInput>(); const order: string[] = [];
  for (const s of done) {
    const eng = s.ran_engine || `__${s.label}`;
    if (byEngine.has(eng)) {
      const kept = byEngine.get(eng)!;
      if (!kept.label.split("; ").includes(s.label)) kept.label = `${kept.label}; ${s.label}`;
      continue;
    }
    byEngine.set(eng, { ...s }); order.push(eng);
  }
  return order.map(e => byEngine.get(e)!);
}

const fmtDate = (iso: string | undefined): string => { try { return iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : ""; } catch { return ""; } };

/* Map the internal engine to a CLIENT-FACING, verifiable source phrase.
   Engine filenames never reach the client — only the real data origin. */
function sourceLine(ranEngine: string | null | undefined, output: any): string {
  const e = String(ranEngine || "").toLowerCase();
  const date = fmtDate(output?.generated_at);
  const dom = output?.project_domain || "";
  /* Honest per-engine attribution. The cardinal rule: NEVER cite Google Search
     Console unless the engine actually used it — a no-GSC crawl report that
     claims "Source: Search Console" is a fabricated citation. */
  if (/site-crawler/.test(e)) return `A live crawl of the site${output?.pages_reachable ? ` (${output.pages_reachable} pages reached)` : ""}${output?.performance ? ` plus a Google PageSpeed (Lighthouse) run on the homepage` : ""}${date ? `, ${date}` : ""}. No Search Console data was used.`;
  if (/schema-llms/.test(e)) return `A live crawl and on-page markup analysis${output?.summary?.crawled ? ` of ${output.summary.crawled} page(s)` : ""}${date ? `, ${date}` : ""}. Schema is read from, and generated against, the pages' real HTML.`;
  if (/serpapi/.test(e)) return `Live Google search results (via SerpAPI)${date ? `, ${date}` : ""}. This is public SERP data, not Search Console.`;
  if (/aeo-article|offsite-qa/.test(e)) return `Live Google search results (via SerpAPI) for the topic${date ? `, ${date}` : ""}.`;
  if (/semrush/.test(e)) return `Semrush live API (referring-domain and authority data)${date ? `, ${date}` : ""}.`;
  if (/competitor-benchmark/.test(e)) return `Live Google search results and direct page crawls${date ? `, checked ${date}` : ""}.`;
  if (/cms-advisor/.test(e)) return `A direct crawl of the website${Array.isArray(output?.pages_examined) && output.pages_examined.length ? ` (${output.pages_examined.length} pages examined)` : ""}${date ? `, ${date}` : ""}.`;
  if (/paid-organic/.test(e)) return `The client's own Google Ads search-terms export, cross-referenced with Google Search Console.`;
  if (/detectcannibalization/.test(e)) return `Google Search Console query and page data${dom ? ` for ${dom}` : ""}${date ? `, as of ${date}` : ""}.`;
  if (/url-classifier|url-inventory|topical-authority/.test(e)) return `Google Search Console${dom ? ` (property: ${dom})` : ""}${date ? `, data as of ${date}` : ""}.`;
  if (/geo|aioverview|workspace|client-report/.test(e)) return `Live search-results analysis${date ? `, ${date}` : ""}.`;
  return date ? `Live on-site analysis, ${date}. No Search Console data was used.` : `Live on-site analysis. No Search Console data was used.`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ─── per-type section bodies (rendered from real fields) ─────── */
function renderBody(o: any): string[] {
  const L: string[] = [];
  if (!o) return ["_No data was produced for this section._"];
  if (Array.isArray(o.reports) && o.reports.length) {
    for (const r of o.reports) { L.push(r.report_md, ``, `---`, ``); }
    return L;
  }

  // URL classification / inventory
  if (o.by_classification && Array.isArray(o.urls)) {
    L.push(`Across ${o.total_urls} reviewed URLs: ${Object.entries(o.by_classification).map(([k, v]) => `${v} to ${String(k).replace(/_/g, " ")}`).join(", ")}.`);
    const improve = o.urls.filter((u: any) => u.classification === "improve").slice(0, 8);
    if (improve.length) {
      L.push(``, `**Highest-opportunity pages to improve:**`, ``);
      L.push(`| URL | Issue | Recommended action | Priority |`, `| --- | --- | --- | --- |`);
      for (const u of improve) L.push(`| ${u.url} | ${u.reason} | ${u.recommended_action} | ${u.priority} |`);
    }
    return L;
  }
  // Topical authority
  if (Array.isArray(o.clusters)) {
    L.push(o.summary || `Mapped ${o.cluster_count} topic clusters.`);
    const focus = o.clusters.filter((c: any) => c.coverage === "partial" || c.coverage === "underserved").slice(0, 8);
    if (focus.length) {
      L.push(``, `**Clusters with the clearest upside:**`, ``);
      L.push(`| Topic | Intent | Coverage | Impressions | Recommendation |`, `| --- | --- | --- | --- | --- |`);
      for (const c of focus) L.push(`| ${c.label} | ${c.intent} | ${c.coverage} | ${c.total_impressions} | ${c.recommendation} |`);
    }
    return L;
  }
  // Competitor benchmarking
  if (o.keyword_gap && Array.isArray(o.standings)) {
    L.push(o.summary || ``);
    const gaps = (o.keyword_gap.biggest_gaps || []).slice(0, 10);
    if (gaps.length) {
      L.push(``, `**Where competitors lead (biggest opportunities):**`, ``);
      L.push(`| Query | Competitor | Competitor rank | Your rank |`, `| --- | --- | --- | --- |`);
      for (const g of gaps) L.push(`| ${g.query} | ${g.competitor} | ${g.competitor_position} | ${g.client_position ?? "not ranking"} |`);
    }
    for (const cg of (o.content_gaps || []).slice(0, 5)) L.push(``, `- For "${cg.query}", ${cg.observations.join(" ")}`);
    if (o.backlink_gap && !o.backlink_gap.available) L.push(``, `_Backlink comparison was not included: ${o.backlink_gap.note}_`);
    return L;
  }
  // CMS advisory
  if (o.detected_platform && Array.isArray(o.findings)) {
    L.push(`Detected platform: **${o.detected_platform}** (${o.platform_confidence}% confidence).`);
    const top = o.findings.filter((x: any) => x.severity === "critical" || x.severity === "high" || x.severity === "medium").slice(0, 12);
    if (top.length) {
      L.push(``, `| Finding | Severity | Observed | Recommendation |`, `| --- | --- | --- | --- |`);
      for (const x of top) L.push(`| ${x.title} | ${x.severity} | ${x.observed} | ${x.recommendation} |`);
    }
    const advisory = o.findings.filter((x: any) => !x.crawl_verified);
    if (advisory.length) L.push(``, `_${advisory.length} item(s) require manual verification (not determinable from a crawl): ${advisory.map((a: any) => a.title).join(", ")}._`);
    return L;
  }
  // Paid vs organic
  if (o.buckets && typeof o.shiftable_spend === "number") {
    L.push(o.summary || ``);
    const opp = (o.top_opportunities || []).slice(0, 10);
    if (opp.length) {
      L.push(``, `**Paid terms where organic can reduce spend:**`, ``);
      L.push(`| Search term | Paid cost | Organic position | Recommendation |`, `| --- | --- | --- | --- |`);
      for (const r of opp) L.push(`| ${r.term} | ${r.paid_cost} | ${r.organic_position ?? "not ranking"} | ${r.rationale} |`);
    }
    return L;
  }
  // Generic / narrative
  if (o.summary) return [o.summary];
  return ["_No formatted findings were produced for this section. If this stage needed input that was not supplied, add it and re-run._"];
}

function collectLimits(stages: ReportStageInput[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of stages) for (const l of (s.output?.limits || [])) { if (typeof l === "string" && !seen.has(l)) { seen.add(l); out.push(l); } }
  return out;
}

function collectSources(stages: ReportStageInput[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of stages) { const src = sourceLine(s.ran_engine, s.output); if (!seen.has(src)) { seen.add(src); out.push(src); } }
  return out;
}

export function assembleClientReport(stages: ReportStageInput[], opts: ReportOptions = {}): { markdown: string; sections: number } {
  const author = (opts.author || "Manav S").trim();
  const client = opts.client_name || opts.client_domain || deriveClient(stages) || "the website";
  const title = opts.report_title || `SEO and AEO Audit — ${client}`;
  const today = fmtDate(new Date().toISOString());
  const completed = stages.filter(s => s.output && (s.status === "completed" || s.status === undefined));

  const L: string[] = [];
  L.push(`# ${title}`);
  L.push(``);
  L.push(`**Prepared by ${author}**`);
  L.push(`${today}`);
  if (opts.include_branding) L.push(``, `_Produced with SEO Season._`);
  L.push(``, `---`, ``);

  // Executive summary — collated from each section's own grounded summary
  L.push(`## Executive summary`, ``);
  if (completed.length === 0) {
    L.push(`No completed analysis sections were available to assemble. Run the audit stages first.`);
    return { markdown: L.join("\n"), sections: 0 };
  }
  for (const s of completed) { const sum = s.output?.summary; if (sum) L.push(`- **${s.label}:** ${sum}`); }
  L.push(``);

  // Sections
  for (const s of completed) {
    L.push(`## ${s.label}`, ``);
    for (const line of renderBody(s.output)) L.push(line);
    L.push(``, `**Source:** ${sourceLine(s.ran_engine, s.output)}`, ``, `---`, ``);
  }

  // Sources and verification
  L.push(`## Sources and how to verify`, ``);
  L.push(`Every figure in this report traces to one of the following sources. You can independently verify each:`, ``);
  for (const src of collectSources(completed)) L.push(`- ${src}`);
  L.push(``);

  // Limitations
  const limits = collectLimits(completed);
  if (limits.length) {
    L.push(`## Important notes and limitations`, ``);
    L.push(`So this report is read accurately:`, ``);
    for (const l of limits) L.push(`- ${l}`);
    L.push(``);
  }

  L.push(`---`, ``, `_Prepared by ${author}. ${today}._`);
  return { markdown: L.join("\n"), sections: completed.length };
}

/* ─── HTML rendering — client-ready, print-to-PDF (no JSON for clients) ── */

const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tableHtml = (headers: string[], rows: (string | number)[][]) =>
  `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

function mdToHtml(md: string): string {
  const lines = String(md || "").split("\n");
  const out: string[] = []; let inUl = false, inTable = false; let tRows: string[][] = [];
  const flushUl = () => { if (inUl) { out.push("</ul>"); inUl = false; } };
  const flushTable = () => { if (inTable && tRows.length) { const [h, ...b] = tRows; out.push(tableHtml(h, b)); } inTable = false; tRows = []; };
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>");
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^[\s|:\-]+$/.test(line)) { inTable = true; continue; }   // separator row
      flushUl(); inTable = true; tRows.push(line.replace(/^\s*\||\|\s*$/g, "").split("|").map(c => c.trim())); continue;
    }
    flushTable();
    if (/^#{3,} /.test(line)) { flushUl(); out.push(`<h4>${inline(line.replace(/^#+ /, ""))}</h4>`); }
    else if (/^## /.test(line)) { flushUl(); out.push(`<h3>${inline(line.slice(3))}</h3>`); }
    else if (/^# /.test(line)) { flushUl(); out.push(`<h3>${inline(line.slice(2))}</h3>`); }
    else if (/^\s*[-*] /.test(line)) { if (!inUl) { out.push("<ul>"); inUl = true; } out.push(`<li>${inline(line.replace(/^\s*[-*] /, ""))}</li>`); }
    else if (/^---+\s*$/.test(line)) { flushUl(); }
    else if (line.trim() === "") { flushUl(); }
    else { flushUl(); out.push(`<p>${inline(line)}</p>`); }
  }
  flushUl(); flushTable();
  return out.join("");
}

/* Derive a client label from what was actually analysed, so the report never
   falls back to "the website" when the caller did not pass a name. Reads the
   real site/domain out of the completed stage outputs. */
function deriveClient(stages: ReportStageInput[]): string {
  for (const s of stages || []) {
    const o: any = s.output; if (!o) continue;
    const cand = o.site || o.project_domain || (o.client && (o.client.domain || o.client)) || o.url || o.client_domain;
    if (typeof cand === "string" && cand.trim()) return cand.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  return "";
}

function renderBodyHtml(o: any): string {
  if (!o) return `<p class="muted">No data was produced for this section.</p>`;
  /* Workspace/GEO stages return the real deep-step reports — render them. */
  if (Array.isArray(o.reports) && o.reports.length) {
    return o.reports.map((r: any) => mdToHtml(r.report_md)).join(`<hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0">`);
  }
  /* Document-based analysis — findings per requirement, from uploaded materials. */
  if (Array.isArray(o.requirement_findings)) {
    const P: string[] = [];
    if (o.summary) P.push(`<p>${esc(o.summary)}</p>`);
    for (const rf of o.requirement_findings) {
      P.push(`<h4>${esc(rf.requirement)}</h4>`);
      if (rf.findings?.length) P.push(`<ul>${rf.findings.map((x: string) => `<li>${esc(x)}</li>`).join("")}</ul>`);
      if (rf.data_points?.length) P.push(`<p class="muted"><strong>Data:</strong> ${rf.data_points.map((x: string) => esc(x)).join("; ")}</p>`);
      if (rf.source_files?.length) P.push(`<p class="muted">From: ${esc(rf.source_files.join(", "))}</p>`);
    }
    if (o.uncovered?.length) P.push(`<h4>Not covered by the documents</h4><p class="muted">These need other data (live analysis or GSC): ${esc(o.uncovered.join("; "))}.</p>`);
    return P.join("");
  }
  const P: string[] = [];

  /* Semrush authority / backlinks / keywords comparison (sheet or API) */
  if (o.client && Array.isArray(o.competitors) && typeof o.has_data === "boolean") {
    if (!o.has_data || !o.client) { return `<p class="muted">${esc(o.summary)}</p>`; }
    const m = (x: any) => x == null ? "—" : Number(x).toLocaleString();
    const all = [o.client, ...o.competitors].filter((d: any) => d && !d.error);
    if (o.audit && (o.audit.health_score != null || o.audit.errors != null || Object.keys(o.audit.issues || {}).length)) {
      P.push(`<h4>Site health (from your Semrush data)</h4>`);
      const a = o.audit; const parts: string[] = [];
      if (a.health_score != null) parts.push(`Health score ${a.health_score}`);
      if (a.errors != null) parts.push(`${m(a.errors)} errors`);
      if (a.warnings != null) parts.push(`${m(a.warnings)} warnings`);
      if (a.notices != null) parts.push(`${m(a.notices)} notices`);
      if (parts.length) P.push(`<p>${esc(parts.join(" · "))}</p>`);
      const iss = Object.entries(a.issues || {});
      if (iss.length) P.push(tableHtml(["Issue", "Pages"], iss.map(([k, v]: any) => [String(k).replace(/_/g, " "), v])));
    }
    P.push(`<h4>Authority and link profile</h4>`);
    P.push(tableHtml(["Domain", "Authority", "Organic keywords", "Est. traffic", "Backlinks", "Referring domains"],
      all.map((d: any) => [d.domain + (d.domain === o.client.domain ? " (you)" : ""), m(d.authority_score), m(d.organic_keywords), m(d.organic_traffic), m(d.total_backlinks), m(d.referring_domains)])));
    if (o.gaps?.length) P.push(`<h4>Gaps</h4><ul>${o.gaps.map((g: string) => `<li>${esc(g)}</li>`).join("")}</ul>`);
    return P.join("");
  }

  /* Full-site crawl audit */
  if (o.issues && typeof o.pages_reachable === "number") {
    P.push(`<p>Crawled ${o.pages_reachable} page(s) of ${esc(o.project_domain)}${o.crawl_capped ? " (capped; more pages remain)" : ""}.</p>`);
    if (o.performance) P.push(`<p><strong>Performance (homepage, mobile):</strong> score ${o.performance.performance_score}/100${o.performance.lcp ? `, LCP ${esc(o.performance.lcp)}` : ""}${o.performance.tbt ? `, TBT ${esc(o.performance.tbt)}` : ""}${o.performance.cls ? `, CLS ${esc(o.performance.cls)}` : ""}.</p>`);
    const rows = Object.entries(o.issues).sort((a: any, b: any) => b[1].count - a[1].count).map(([k, v]: any) => [String(k).replace(/_/g, " "), v.count, (v.pages || []).slice(0, 3).join(", ")]);
    if (rows.length) { P.push(`<h4>On-page and technical issues (site-wide)</h4>`); P.push(tableHtml(["Issue", "Pages affected", "Examples"], rows)); }
    const sc = Object.entries(o.schema_coverage || {});
    if (sc.length) P.push(`<p class="muted"><strong>Schema found:</strong> ${sc.map(([t, n]: any) => `${esc(t)} (${n})`).join(", ")}.</p>`);
    if (o.broken_links?.length) P.push(`<p class="muted"><strong>Broken/unreachable URLs found:</strong> ${o.broken_links.slice(0, 10).map((u: string) => esc(u)).join("; ")}.</p>`);
    return P.join("");
  }

  if (o.by_classification && Array.isArray(o.urls)) {
    P.push(`<p>Across ${o.total_urls} reviewed URLs: ${Object.entries(o.by_classification).map(([k, v]) => `${v} to ${esc(String(k).replace(/_/g, " "))}`).join(", ")}.</p>`);
    const improve = o.urls.filter((u: any) => u.classification === "improve").slice(0, 10);
    if (improve.length) { P.push(`<h4>Highest-opportunity pages to improve</h4>`); P.push(tableHtml(["URL", "Issue", "Recommended action", "Priority"], improve.map((u: any) => [u.url, u.reason, u.recommended_action, u.priority]))); }
    return P.join("");
  }
  if (Array.isArray(o.clusters)) {
    P.push(`<p>${esc(o.summary || `Mapped ${o.cluster_count} topic clusters.`)}</p>`);
    const focus = o.clusters.filter((c: any) => c.coverage === "partial" || c.coverage === "underserved").slice(0, 10);
    if (focus.length) { P.push(`<h4>Clusters with the clearest upside</h4>`); P.push(tableHtml(["Topic", "Intent", "Coverage", "Impressions", "Recommendation"], focus.map((c: any) => [c.label, c.intent, c.coverage, c.total_impressions, c.recommendation]))); }
    return P.join("");
  }
  if (o.keyword_gap && Array.isArray(o.standings)) {
    if (o.summary) P.push(`<p>${esc(o.summary)}</p>`);
    const gaps = (o.keyword_gap.biggest_gaps || []).slice(0, 12);
    if (gaps.length) { P.push(`<h4>Where competitors lead</h4>`); P.push(tableHtml(["Query", "Competitor", "Competitor rank", "Your rank"], gaps.map((g: any) => [g.query, g.competitor, g.competitor_position, g.client_position ?? "not ranking"]))); }
    const cg = (o.content_gaps || []).slice(0, 6);
    if (cg.length) { P.push(`<h4>Content gaps</h4><ul>${cg.map((c: any) => `<li><strong>${esc(c.query)}:</strong> ${esc(c.observations.join(" "))}</li>`).join("")}</ul>`); }
    if (o.backlink_gap && !o.backlink_gap.available) P.push(`<p class="muted">Backlink comparison not included: ${esc(o.backlink_gap.note)}</p>`);
    return P.join("");
  }
  if (o.detected_platform && Array.isArray(o.findings)) {
    P.push(`<p>Detected platform: <strong>${esc(o.detected_platform)}</strong> (${o.platform_confidence}% confidence).</p>`);
    const top = o.findings.filter((x: any) => ["critical", "high", "medium"].includes(x.severity)).slice(0, 14);
    if (top.length) P.push(tableHtml(["Finding", "Severity", "Observed", "Recommendation"], top.map((x: any) => [x.title, x.severity, x.observed, x.recommendation])));
    const adv = o.findings.filter((x: any) => !x.crawl_verified);
    if (adv.length) P.push(`<p class="muted">${adv.length} item(s) require manual verification: ${esc(adv.map((a: any) => a.title).join(", "))}.</p>`);
    return P.join("");
  }
  if (o.buckets && typeof o.shiftable_spend === "number") {
    if (o.summary) P.push(`<p>${esc(o.summary)}</p>`);
    const opp = (o.top_opportunities || []).slice(0, 12);
    if (opp.length) { P.push(`<h4>Paid terms where organic can reduce spend</h4>`); P.push(tableHtml(["Search term", "Paid cost", "Organic position", "Recommendation"], opp.map((r: any) => [r.term, r.paid_cost, r.organic_position ?? "not ranking", r.rationale]))); }
    return P.join("");
  }
  /* Schema + llms.txt generation (deterministic engine) */
  if (Array.isArray(o.pages) && typeof o.llms_txt === "string") {
    const sm = o.summary && typeof o.summary === "object" ? o.summary : {};
    const fetched = o.pages.filter((p: any) => p.fetched);
    P.push(`<p>Crawled ${sm.crawled ?? fetched.length} page(s); generated ${sm.schema_blocks ?? 0} JSON-LD block(s), every value grounded in the page's real markup${sm.blocked ? `. ${sm.blocked} page(s) could not be crawled` : ""}.</p>`);
    const rows = fetched.slice(0, 20).map((p: any) => [
      (p.canonical || p.url || "").replace(/^https?:\/\/[^/]+/, "") || "/",
      (p.existing_schema || []).join(", ") || "none",
      (p.generated || []).map((g: any) => g["@type"]).filter(Boolean).join(", ") || "—",
      String((p.gaps || []).length),
    ]);
    if (rows.length) P.push(tableHtml(["Page", "Existing schema", "Generated schema", "Gaps to supply"], rows));
    const gaps = fetched.flatMap((p: any) => (p.gaps || []).map((g: string) => ({ page: (p.canonical || p.url || "").replace(/^https?:\/\/[^/]+/, "") || "/", gap: g }))).slice(0, 8);
    if (gaps.length) P.push(`<h4>Fields to supply (never guessed)</h4><ul>${gaps.map((g: any) => `<li><strong>${esc(g.page)}:</strong> ${esc(g.gap)}</li>`).join("")}</ul>`);
    const blocked = o.pages.filter((p: any) => !p.fetched);
    if (blocked.length) P.push(`<p class="muted">${blocked.length} page(s) could not be crawled (blocked or unreachable); nothing was generated for them — no fabricated blocks.</p>`);
    P.push(`<p class="muted">An llms.txt file was generated from the live crawl, ready to publish at the site root.</p>`);
    return P.join("");
  }
  /* Backlink prospecting */
  if (Array.isArray(o.prospects) && Array.isArray(o.competitors_analysed)) {
    if (typeof o.summary === "string") P.push(`<p>${esc(o.summary)}</p>`);
    if (o.prospects.length) P.push(tableHtml(["Prospect domain", "Authority", "Links to your competitors", "Overlap"],
      o.prospects.slice(0, 20).map((p: any) => [p.domain, p.authority ?? "—", (p.links_to_competitors || []).join(", "), String(p.competitor_overlap)])));
    if ((o.limits || []).length) P.push(`<p class="muted">${o.limits.map((l: string) => esc(l)).join(" ")}</p>`);
    return P.join("");
  }
  /* AEO article draft */
  if (typeof o.article_markdown === "string" && Array.isArray(o.faq)) {
    if (o.title) P.push(`<p><strong>${esc(o.title)}</strong></p>`);
    if (o.meta_description) P.push(`<p class="muted">Meta description: ${esc(o.meta_description)}</p>`);
    if (o.article_markdown) P.push(mdToHtml(o.article_markdown.slice(0, 4000) + (o.article_markdown.length > 4000 ? "\n\n_(draft continues)_" : "")));
    if (o.faq.length) P.push(`<h4>FAQ (from real search questions)</h4><ul>${o.faq.slice(0, 10).map((f: any) => `<li><strong>${esc(f.q)}</strong> ${esc(f.a)}</li>`).join("")}</ul>`);
    if ((o.notes || []).length) P.push(`<p class="muted">${o.notes.map((n: string) => esc(n)).join(" ")}</p>`);
    return P.join("");
  }
  /* Off-site Q&A — real questions with verifiable links */
  if (Array.isArray(o.questions) && o.questions.length && o.questions[0] && o.questions[0].url) {
    if (typeof o.summary === "string") P.push(`<p>${esc(o.summary)}</p>`);
    P.push(`<h4>Real questions found (each links to a live thread)</h4><ul>${o.questions.slice(0, 15).map((q: any) => `<li><a href="${esc(q.url)}">${esc(q.question)}</a> <span class="muted">(${esc(q.source)})</span></li>`).join("")}</ul>`);
    if ((o.notes || []).length) P.push(`<p class="muted">${o.notes.map((n: string) => esc(n)).join(" ")}</p>`);
    return P.join("");
  }

  /* Default — NEVER coerce an object into "[object Object]". Render only a
     string summary or note; otherwise state plainly that no formatted findings
     were produced. This guard is what prevents an engine whose `summary` is an
     object (rather than a string) from printing "[object Object]" to a client. */
  const summaryStr = typeof o.summary === "string" ? o.summary : (typeof o.note === "string" ? o.note : "");
  return `<p>${esc(summaryStr || "No formatted findings were produced for this section. If this stage needed input (a topic, competitor domains, or a connected data source) that was not supplied, add it and re-run.")}</p>`;
}

const REPORT_CSS = `
*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;line-height:1.55;margin:0;background:#f8fafc}
.doc{max-width:880px;margin:0 auto;background:#fff;padding:56px 64px}
.lh{border-bottom:3px solid #111827;padding-bottom:18px;margin-bottom:28px}
.lh h1{font-size:26px;margin:0 0 6px}.lh .by{font-weight:700;color:#111827}.lh .dt{color:#6b7280;font-size:13px}
h2{font-size:18px;margin:34px 0 8px;padding-bottom:6px;border-bottom:1px solid #e5e7eb}
h4{font-size:13px;margin:14px 0 6px;color:#374151;text-transform:uppercase;letter-spacing:.04em}
p{margin:8px 0}.muted{color:#6b7280;font-size:13px}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:12.5px}
th,td{border:1px solid #e5e7eb;padding:7px 9px;text-align:left;vertical-align:top}
th{background:#f3f4f6;font-weight:600}
.src{font-size:12px;color:#6b7280;font-style:italic;margin:8px 0 0;padding:8px 10px;background:#f9fafb;border-left:3px solid #9ca3af}
ul{margin:8px 0;padding-left:20px}li{margin:4px 0}
.exec li{margin:6px 0}.foot{margin-top:36px;padding-top:14px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px}
.brand{color:#9ca3af;font-size:11px;margin-top:4px}
@media print{body{background:#fff}.doc{padding:0;max-width:none}@page{size:A4;margin:1.6cm}h2{page-break-after:avoid}table{page-break-inside:avoid}}
`;

function renderCoverageHtml(opts: ReportOptions, stages: ReportStageInput[]): string {
  const completed = completedStages(stages);
  const docStage = completed.find(s => Array.isArray(s.output?.requirement_findings));
  const docAnswered: string[] = docStage ? (docStage.output.requirement_findings || []).map((r: any) => String(r.requirement || "")) : [];
  const engineCovered = completed.filter(s => !Array.isArray(s.output?.requirement_findings)).map(s => s.label);
  const requirements = (opts.requirements && opts.requirements.length) ? opts.requirements : completed.map(s => s.label);
  if (!requirements.length) return "";
  const cov = assessCoverage({ requirements, engineCovered, docAnswered });

  const H: string[] = [];
  H.push(`<h2>Scope coverage — what was analysed, what is ongoing delivery, and what needs data</h2>`);
  const analysed = cov.items.filter(i => i.status === "engine");
  const yours = cov.items.filter(i => i.status === "your_data");
  const delivered = cov.items.filter(i => i.status === "delivery");
  const unc = cov.items.filter(i => i.status === "uncovered");
  const bits: string[] = [];
  if (analysed.length) bits.push(`${analysed.length} analysed now from live data`);
  if (yours.length) bits.push(`${yours.length} from your uploaded data`);
  if (delivered.length) bits.push(`${delivered.length} delivered as recurring work in the engagement`);
  if (unc.length) bits.push(`${unc.length} awaiting a data source before analysis`);
  H.push(`<p>Of ${cov.items.length} item(s) in scope: ${bits.join(", ")}. Each is stated for what it is — analysed, delivered, or honestly pending — never padded or guessed.</p>`);

  if (analysed.length || yours.length) {
    const done = [...analysed, ...yours];
    H.push(`<p><strong>Covered in this report:</strong> ${done.map(i => esc(i.requirement)).join("; ")}.</p>`);
  }
  if (delivered.length) {
    H.push(`<h4>Recurring delivery work (performed each month — not a one-time audit finding)</h4>`);
    H.push(tableHtml(["Deliverable", "How it is produced"], delivered.map(i => [i.requirement, i.delivery_note || "Recurring delivery work in the monthly engagement."])));
  }
  if (unc.length) {
    H.push(`<h4>Analysis that needs a data source to complete</h4>`);
    H.push(tableHtml(["Requirement", "Data it needs", "Best source(s) to provide it"],
      unc.map(i => [i.requirement, i.recommendation?.data_need || "supporting data", (i.recommendation?.best_sources || []).join("; ")])));
    H.push(`<p class="muted">Connect the source or upload an export in the materials step and re-run — the analysis will fill in. Where nothing is available, it is stated honestly rather than guessed.</p>`);
  }
  return H.join("");
}

export function assembleClientReportHtml(stages: ReportStageInput[], opts: ReportOptions = {}): { html: string; sections: number } {
  const author = (opts.author || "Manav S").trim();
  const client = opts.client_name || opts.client_domain || deriveClient(stages) || "the website";
  const title = opts.report_title || `SEO and AEO Audit — ${client}`;
  const today = fmtDate(new Date().toISOString());
  const completed = completedStages(stages);

  const H: string[] = [];
  H.push(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${REPORT_CSS}</style></head><body><div class="doc">`);
  H.push(`<div class="lh"><h1>${esc(title)}</h1><div class="by">Prepared by ${esc(author)}</div><div class="dt">${esc(today)}</div>${opts.include_branding ? `<div class="brand">Produced with SEO Season</div>` : ``}</div>`);

  if (completed.length === 0) {
    H.push(`<p>No completed analysis sections were available to assemble. Run the audit stages first.</p></div></body></html>`);
    return { html: H.join(""), sections: 0 };
  }

  H.push(`<h2>Executive summary</h2><p>This audit of ${esc(client)} covers ${completed.length} area(s). Each section below sets out the findings, the supporting data, and the source. Read each section for detail.</p>`);

  for (const s of completed) {
    H.push(`<h2>${esc(s.label)}</h2>`);
    H.push(renderBodyHtml(s.output));
    H.push(`<p class="src"><strong>Source:</strong> ${esc(sourceLine(s.ran_engine, s.output))}</p>`);
  }

  H.push(`<h2>Sources and how to verify</h2><p>Every figure above traces to one of these sources, each independently verifiable:</p><ul>`);
  for (const src of collectSources(completed)) H.push(`<li>${esc(src)}</li>`);
  H.push(`</ul>`);

  H.push(renderCoverageHtml(opts, stages));

  const limits = collectLimits(completed);
  if (limits.length) { H.push(`<h2>Important notes and limitations</h2><ul>`); for (const l of limits) H.push(`<li>${esc(l)}</li>`); H.push(`</ul>`); }

  H.push(`<div class="foot">Prepared by ${esc(author)}. ${esc(today)}. To save as PDF, use your browser Print and choose "Save as PDF".</div>`);
  H.push(`</div></body></html>`);
  return { html: H.join(""), sections: completed.length };
}

/* ════════════════════════════════════════════════════════════════
   Senior-DMS + client interpretation layer (AI-assisted, grounded).

   Reads the REAL section data and writes the interpretation a senior
   practitioner adds for a client: what it means, why it matters to the
   business, and what to do first. Hard-constrained to the data passed in
   — it may not invent numbers, pages, or competitors, and must call thin
   data thin. The verifiable data tables and sources remain beneath every
   section; this layer is reviewable interpretation, not new fact.
════════════════════════════════════════════════════════════════ */

interface SectionInterpretation { id: string; interpretation: string; why_it_matters: string; recommendations: string[]; priority: string; }
interface SeniorDmsResult { executive_summary: string; sections: Record<string, SectionInterpretation>; }

/* Compact, bounded data brief per section for the model to interpret. */
function dataBrief(s: ReportStageInput, idx: number): any {
  const o = s.output || {};
  const id = `sec_${idx}`;
  const base: any = { id, label: s.label, summary: o.summary || "", limits: (o.limits || []).slice(0, 4) };
  if (o.by_classification && Array.isArray(o.urls)) base.url_classification = { total: o.total_urls, breakdown: o.by_classification, top_improve: o.urls.filter((u: any) => u.classification === "improve").slice(0, 6).map((u: any) => ({ url: u.url, issue: u.reason, priority: u.priority })) };
  else if (Array.isArray(o.clusters)) base.topical = { cluster_count: o.cluster_count, intents: o.intent_distribution, top_clusters: o.clusters.filter((c: any) => c.coverage === "partial" || c.coverage === "underserved").slice(0, 6).map((c: any) => ({ topic: c.label, intent: c.intent, coverage: c.coverage, impressions: c.total_impressions })) };
  else if (o.keyword_gap && Array.isArray(o.standings)) base.competitor = { biggest_gaps: (o.keyword_gap.biggest_gaps || []).slice(0, 6), content_gaps: (o.content_gaps || []).slice(0, 4).map((c: any) => ({ query: c.query, observations: c.observations })), backlink_gap_available: o.backlink_gap?.available };
  else if (o.detected_platform && Array.isArray(o.findings)) base.cms = { platform: o.detected_platform, confidence: o.platform_confidence, top_findings: o.findings.filter((x: any) => ["critical", "high", "medium"].includes(x.severity)).slice(0, 8).map((x: any) => ({ title: x.title, severity: x.severity, observed: x.observed })) };
  else if (o.buckets && typeof o.shiftable_spend === "number") base.paid = { shiftable_spend: o.shiftable_spend, brand_spend: o.brand_spend, buckets: o.buckets, top: (o.top_opportunities || []).slice(0, 6) };
  else if (Array.isArray(o.reports) && o.reports.length) base.analysis = o.reports.map((r: any) => String(r.report_md || "").slice(0, 1800)).join("\n\n").slice(0, 4000);
  else if (Array.isArray(o.requirement_findings)) base.document_findings = { answered_count: o.requirement_findings.length, requirements_answered: o.requirement_findings.map((r: any) => r.requirement).slice(0, 30), uncovered: (o.uncovered || []).slice(0, 20), files: o.files };
  else if (o.issues && typeof o.pages_reachable === "number") base.site_audit = { pages: o.pages_reachable, capped: o.crawl_capped, performance: o.performance, issues: Object.fromEntries(Object.entries(o.issues).map(([k, v]: any) => [k, v.count])), schema: o.schema_coverage, broken_links: (o.broken_links || []).slice(0, 10) };
  else if (o.client && Array.isArray(o.competitors) && typeof o.has_data === "boolean") base.semrush = { client: o.client, competitors: o.competitors, gaps: o.gaps, audit: o.audit, source: o.source };
  return base;
}

const DMS_SYSTEM = [
  `You are a SENIOR SEO and digital-marketing strategist writing a client-ready audit for a business owner or investor — someone paying for judgement, not a list of machine findings. Your job is to make them think "this person actually understands my business and my site."`,
  `You are given the REAL findings from the analysis (actual numbers, pages, and items). Interpret them the way a seasoned practitioner would.`,
  ``,
  `HOW A SENIOR THINKS — do all of this:`,
  `1. DIAGNOSE ROOT CAUSES, do not list symptoms. When several findings share one cause, say so as ONE diagnosis with ONE fix. Example: duplicate titles + duplicate meta descriptions + missing H1s + URLs like /homepage-04/, /homepage-05/, /blog-grid-col-4/, /masonry-col-4/, /contact-2/ almost always mean the site was built on a theme and the template's DEMO pages were never removed — that is ONE problem ("clean up leftover theme/boilerplate pages"), not five. Spot patterns like this and name the underlying cause.`,
  `2. LEAD WITH THE ONE THING THAT MATTERS MOST. Open the executive summary with the single most business-critical finding stated bluntly, then the next one or two. If the site does not rank for its own brand name, that is almost always the headline for any real business — treat it as urgent, not a footnote.`,
  `3. PRIORITISE RUTHLESSLY. Not everything is "high". Reserve "high" for what genuinely costs the business money or credibility now. Order recommendations by impact-per-effort; put the fastest high-impact win first.`,
  `4. TIE EVERY POINT TO THIS SPECIFIC CLIENT'S BUSINESS. Read what the business is from the pages and brand, and frame consequences in their terms (for a VC firm: credibility with founders, LPs, and co-investors who research them; for a shop: lost sales). Generic "Google likes fast sites" is not senior; "a founder comparing three VC firms on their phone will bounce before your page loads, and you never knew they visited" is.`,
  `5. BE TRANSPARENT ABOUT SCOPE. In one line, say what was analysed and how much — e.g. "39 of the 309 pages in your sitemap were crawled this pass" — so the reader knows the basis and its limits. Never imply more coverage than the data shows.`,
  ``,
  `HARD RULES — non-negotiable:`,
  `- Use ONLY the numbers, pages, and facts in the provided data and the operator's materials. Never invent metrics, pages, competitors, dates, or claims.`,
  `- NEVER cite a data source that was not used. If there is no Search Console / analytics data in the findings, do NOT mention Search Console as a source or basis — the analysis here is a live crawl, PageSpeed, and live search results. Claiming GSC you do not have destroys trust.`,
  `- Where a real figure would strengthen a point but is not in the data, say what is needed to get it (e.g. "connect Search Console to confirm which pages Google indexes") rather than inventing it.`,
  `- The operator's provided materials are real source — use them to deepen sections and attribute to "your provided materials".`,
  `- If a section's data is genuinely thin, say so in one honest line; do not pad. Write in clear business English, no tool names, no jargon dumps, never salesy.`,
  ``,
  `Return ONLY valid JSON, no prose, no fences. The executive_summary must open with the single most important finding and read like a senior wrote it. Priorities across sections must be differentiated (not all "high"):`,
  `{"executive_summary":"...","sections":[{"id":"sec_0","interpretation":"...","why_it_matters":"...","recommendations":["..."],"priority":"high|medium|low"}]}`,
].join("\n");

async function seniorDmsPass(stages: ReportStageInput[], opts: ReportOptions): Promise<(SeniorDmsResult & { material_files: string[] }) | null> {
  const completed = completedStages(stages);
  if (completed.length === 0) return null;
  const briefs = completed.map((s, i) => dataBrief(s, i));

  let material_files: string[] = [];
  if (opts.project_id) { try { material_files = (await loadMaterials(opts.project_id)).map(m => m.filename); } catch { /* non-fatal */ } }

  const ctx = [
    `Client: ${opts.client_name || opts.client_domain || deriveClient(stages) || "the website"}.`,
    `Interpret these section findings (real data already gathered). Write for the client.`,
    JSON.stringify({ sections: briefs }).slice(0, 60000),
  ].join("\n");
  const run = async (): Promise<(SeniorDmsResult & { material_files: string[] }) | null> => {
    const raw = await llm({ system: DMS_SYSTEM, user: ctx, maxTokens: 4000, timeoutMs: 90000, label: "wizard-report-dms" });
    const parsed = parseJsonResponse<any>(raw);
    if (!parsed || !Array.isArray(parsed.sections)) return null;
    const map: Record<string, SectionInterpretation> = {};
    for (const sec of parsed.sections) if (sec?.id) map[sec.id] = { id: sec.id, interpretation: String(sec.interpretation || ""), why_it_matters: String(sec.why_it_matters || ""), recommendations: Array.isArray(sec.recommendations) ? sec.recommendations.filter((x: any) => typeof x === "string") : [], priority: String(sec.priority || "") };
    return { executive_summary: String(parsed.executive_summary || ""), sections: map, material_files };
  };
  try {
    let r = await run();
    if (!r) r = await run();   // one retry — transient parse/timeout
    return r;
  } catch { return null; }
}

/* ── Proposal artifact ──────────────────────────────────────────────
   For productized / reseller / ongoing-retainer briefs, the buyer needs a
   SCOPE & DELIVERY proposal, not an audit of an example site. This presents
   the full scope they asked for, how each item is produced and to what
   standard, a capability demonstration from any live analysis, an honest
   note on what needs a data source, the quality commitments that set the
   work apart, and a scope-anchored investment section. Fully deterministic —
   nothing is invented, and an example site is framed as a demonstration. */
export function assembleProposalHtml(stages: ReportStageInput[], opts: ReportOptions = {}): { html: string; sections: number } {
  const author = (opts.author || "Manav S").trim();
  const client = opts.client_name || opts.client_domain || deriveClient(stages) || "your engagement";
  const named = client && client !== "your engagement";
  const isExample = !!opts.target_is_example;
  const reseller = opts.engagement_type === "reseller_productized";
  const today = fmtDate(new Date().toISOString());
  const completed = completedStages(stages);
  const requirements = (opts.requirements && opts.requirements.length) ? opts.requirements : completed.map(s => s.label);

  const docStage = stages.find(s => Array.isArray(s.output?.requirement_findings));
  const docAnswered = docStage ? (docStage.output.requirement_findings || []).map((r: any) => String(r.requirement || "")) : [];
  const engineCovered = completed.filter(s => !Array.isArray(s.output?.requirement_findings)).map(s => s.label);
  const cov = assessCoverage({ requirements, engineCovered, docAnswered });
  const needsData = cov.items.filter(i => i.status === "uncovered");

  const title = opts.report_title || (reseller ? "Productized SEO & AEO Delivery — Scope & Proposal" : "Monthly SEO & AEO Delivery — Scope & Proposal");
  const H: string[] = [];
  H.push(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${REPORT_CSS}</style></head><body><div class="doc">`);
  H.push(`<div class="lh"><h1>${esc(title)}</h1><div class="by">Prepared by ${esc(author)}${named ? ` · for ${esc(client)}` : ""}</div><div class="dt">${esc(today)}</div>${opts.include_branding ? `<div class="brand">Produced with SEO Season</div>` : ``}</div>`);

  H.push(`<h2>Understanding of the engagement</h2>`);
  const understanding = [
    reseller
      ? `This proposal sets out a recurring monthly SEO and AEO production scope you can deliver to your clients — a repeatable scope and delivery plan built to a consistent quality standard across multiple clients, not an audit of a single site.`
      : `This proposal sets out the recurring monthly SEO and AEO delivery scope, the standard each item is produced to, and the basis for pricing.`,
    opts.buyer_note ? esc(opts.buyer_note) : "",
    isExample ? `The site reviewed below is a representative example of your clients; the findings demonstrate the approach and quality — they are not the deliverable itself.` : "",
  ].filter(Boolean);
  H.push(`<p>${understanding.join(" ")}</p>`);

  H.push(`<h2>Monthly delivery scope</h2>`);
  H.push(`<p>Every item you scoped, and exactly how each is produced. Nothing is padded, and where an item needs a data source to run, that is stated plainly rather than implied.</p>`);
  const scopeRows = cov.items.map(i => {
    if (i.status === "delivery") return [i.requirement, i.delivery_note || "Recurring delivery work each cycle."];
    if (i.status === "engine" || i.status === "your_data") return [i.requirement, "Produced from live analysis each cycle — demonstrated below."];
    const how = i.recommendation ? ((i.recommendation.best_sources && i.recommendation.best_sources[0]) || i.recommendation.data_need) : "the required data source";
    return [i.requirement, `Included — ${how}.`];
  });
  if (scopeRows.length) H.push(tableHtml(["Deliverable (as you scoped it)", "How it is produced, to what standard"], scopeRows));

  if (completed.length) {
    H.push(`<h2>Capability demonstration${isExample && named ? ` — on ${esc(client)}, a representative site` : ""}</h2>`);
    H.push(`<p>To show the delivery quality rather than assert it, the following was produced live${isExample ? " on the example site" : ""}. Every figure traces to a real source.</p>`);
    completed.forEach(s => {
      H.push(`<h4>${esc(s.label)}</h4>`);
      H.push(renderBodyHtml(s.output));
      H.push(`<p class="src"><strong>Source:</strong> ${esc(sourceLine(s.ran_engine, s.output))}</p>`);
    });
  }

  if (needsData.length) {
    H.push(`<h2>What we connect at kickoff</h2>`);
    H.push(`<p>These items produce their reporting once a data source is connected — no output is fabricated in the meantime:</p>`);
    H.push(tableHtml(["Item", "What it needs to run"], needsData.map(i => [i.requirement, `${i.recommendation?.data_need || "a data source"} — ${(i.recommendation?.best_sources || []).join("; ")}`])));
  }

  H.push(`<h2>How the quality is protected</h2><ul>`);
  H.push(`<li><strong>Content:</strong> written to answer the real questions searchers ask, pulled from live SERP data — never thin AI filler. Any figure needing a citation is flagged for a real source, never invented.</li>`);
  H.push(`<li><strong>Backlinks:</strong> real prospects surfaced from competitors' referring-domain gaps and earned through genuine outreach — never bought, spun, or placed on link networks, which risk Google penalties for your clients.</li>`);
  H.push(`<li><strong>Off-site Q&A:</strong> genuinely useful answers to real questions, posted manually with disclosure per platform rules.</li>`);
  H.push(`<li><strong>Structured data:</strong> schema generated from each page's real markup and validated — never guessed.</li>`);
  H.push(`<li><strong>Reporting:</strong> every figure states what was measured, what was not, and its source — no fabricated metrics.</li>`);
  H.push(`</ul>`);

  H.push(`<h2>Investment</h2>`);
  H.push(`<p>The monthly investment is quoted against the scope and volumes above, at the quality standard described${reseller ? ", with per-client tiering available as you bring on more clients" : ""}. This document defines exactly what that figure buys. <em>[Confirm the monthly figure here.]</em></p>`);
  H.push(`<p class="muted">Quality at this scope has a real floor: genuinely-researched articles and earned links cost more to produce than thin content and bought links. Where a budget is fixed, the honest lever is scope (for example fewer articles per cycle), not quality — stated so the engagement is set up to succeed rather than disappoint.</p>`);

  H.push(`<h2>Next steps</h2><ol><li>Confirm the scope and monthly volumes above.</li><li>Connect the data sources noted so reporting runs from the first cycle.</li><li>We begin delivery.</li></ol>`);

  const limits = collectLimits(completed);
  if (limits.length) { H.push(`<h2>Notes and limitations</h2><ul>`); for (const l of limits) H.push(`<li>${esc(l)}</li>`); H.push(`</ul>`); }
  H.push(`<div class="foot">Prepared by ${esc(author)}. ${esc(today)}. Scope and delivery standards as stated above. To save as PDF, use your browser Print and choose "Save as PDF".</div>`);
  H.push(`</div></body></html>`);
  return { html: H.join(""), sections: completed.length };
}

/* Enriched report: senior-DMS interpretation woven around the grounded
   data tables. Falls back to the data-only report if the lens is
   unavailable, with an honest note. */
export async function assembleClientReportHtmlEnriched(stages: ReportStageInput[], opts: ReportOptions = {}): Promise<{ html: string; sections: number; enriched: boolean }> {
  /* Artifact routing: a productized/reseller/ongoing brief needs a scope
     proposal, not an audit of an example site. This is the "right document for
     the brief" decision the wizard now makes. */
  if (opts.artifact_mode === "proposal") { const p = assembleProposalHtml(stages, opts); return { ...p, enriched: false }; }
  const author = (opts.author || "Manav S").trim();
  const client = opts.client_name || opts.client_domain || deriveClient(stages) || "the website";
  const title = opts.report_title || `SEO and AEO Audit — ${client}`;
  const today = fmtDate(new Date().toISOString());
  const completed = completedStages(stages);
  if (completed.length === 0) { const base = assembleClientReportHtml(stages, opts); return { ...base, enriched: false }; }

  const dms = await seniorDmsPass(stages, opts);
  if (!dms) { const base = assembleClientReportHtml(stages, opts); return { html: base.html.replace("</div></body>", `<p class="muted">Note: the written interpretation layer was unavailable for this run; the findings and data below are complete and accurate.</p></div></body>`), sections: base.sections, enriched: false }; }

  const H: string[] = [];
  H.push(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${REPORT_CSS}</style></head><body><div class="doc">`);
  H.push(`<div class="lh"><h1>${esc(title)}</h1><div class="by">Prepared by ${esc(author)}</div><div class="dt">${esc(today)}</div>${opts.include_branding ? `<div class="brand">Produced with SEO Season</div>` : ``}</div>`);
  H.push(`<h2>Executive summary</h2>${mdToHtml(dms.executive_summary)}`);

  completed.forEach((s, i) => {
    const interp = dms.sections[`sec_${i}`];
    H.push(`<h2>${esc(s.label)}</h2>`);
    if (interp) {
      if (interp.priority) H.push(`<p class="muted">Priority: ${esc(interp.priority)}</p>`);
      if (interp.interpretation) H.push(mdToHtml(interp.interpretation));
      if (interp.why_it_matters) H.push(`<p><strong>Why this matters:</strong> ${esc(interp.why_it_matters)}</p>`);
      if (interp.recommendations.length) H.push(`<h4>Recommendations</h4><ol>${interp.recommendations.map(r => `<li>${esc(r)}</li>`).join("")}</ol>`);
    }
    H.push(`<h4>Supporting data</h4>`);
    H.push(renderBodyHtml(s.output));
    H.push(`<p class="src"><strong>Source:</strong> ${esc(sourceLine(s.ran_engine, s.output))}</p>`);
  });

  H.push(`<h2>Sources and how to verify</h2><p>Every figure above traces to one of these sources, each independently verifiable:</p><ul>`);
  for (const src of collectSources(completed)) H.push(`<li>${esc(src)}</li>`);
  if (dms.material_files.length) H.push(`<li>Operator-provided materials and client files: ${esc(dms.material_files.join(", "))}.</li>`);
  H.push(`</ul>`);
  H.push(renderCoverageHtml(opts, stages));
  const limits = collectLimits(completed);
  if (limits.length) { H.push(`<h2>Important notes and limitations</h2><ul>`); for (const l of limits) H.push(`<li>${esc(l)}</li>`); H.push(`</ul>`); }
  H.push(`<div class="foot">Prepared by ${esc(author)}. ${esc(today)}. The written interpretation is the analyst's reading of the data shown; the supporting data and sources under each section are the record. To save as PDF, use your browser Print and choose "Save as PDF".</div>`);
  H.push(`</div></body></html>`);
  return { html: H.join(""), sections: completed.length, enriched: true };
}
