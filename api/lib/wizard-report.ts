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
}

/* Completed sections, with duplicate sections (same engine + same summary)
   collapsed — the composer can map two brief points to one engine. */
function completedStages(stages: ReportStageInput[]): ReportStageInput[] {
  const done = stages.filter(s => s.output && (s.status === "completed" || s.status === undefined));
  const seen = new Set<string>(); const out: ReportStageInput[] = [];
  for (const s of done) {
    const key = `${s.ran_engine || ""}|${String(s.output?.summary || JSON.stringify(s.output || {}).slice(0, 200))}`;
    if (seen.has(key)) continue; seen.add(key); out.push(s);
  }
  return out;
}

const fmtDate = (iso: string | undefined): string => { try { return iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : ""; } catch { return ""; } };

/* Map the internal engine to a CLIENT-FACING, verifiable source phrase.
   Engine filenames never reach the client — only the real data origin. */
function sourceLine(ranEngine: string | null | undefined, output: any): string {
  const e = String(ranEngine || "").toLowerCase();
  const date = fmtDate(output?.generated_at);
  const dom = output?.project_domain || "";
  if (/competitor-benchmark/.test(e)) return `Live Google search results and direct page crawls${date ? `, checked ${date}` : ""}.`;
  if (/cms-advisor/.test(e)) return `A direct crawl of the website${Array.isArray(output?.pages_examined) && output.pages_examined.length ? ` (${output.pages_examined.length} pages examined)` : ""}${date ? `, ${date}` : ""}.`;
  if (/paid-organic/.test(e)) return `The client's own Google Ads search-terms export, cross-referenced with Google Search Console.`;
  if (/detectcannibalization/.test(e)) return `Google Search Console query and page data${dom ? ` for ${dom}` : ""}${date ? `, as of ${date}` : ""}.`;
  if (/url-classifier|url-inventory|topical-authority/.test(e)) return `Google Search Console${dom ? ` (property: ${dom})` : ""}${date ? `, data as of ${date}` : ""}.`;
  if (/geo|aioverview|workspace|client-report/.test(e)) return `Live search-results analysis${date ? `, ${date}` : ""}.`;
  return date ? `Search Console and on-site analysis, ${date}.` : `Search Console and on-site analysis.`;
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
  const client = opts.client_name || opts.client_domain || "the website";
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
  return `<p>${esc(o.summary || o.note || "No formatted findings were produced for this section. If this stage needed input (target keywords, competitor domains, or a connected data source) that was not supplied, add it and re-run.")}</p>`;
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

export function assembleClientReportHtml(stages: ReportStageInput[], opts: ReportOptions = {}): { html: string; sections: number } {
  const author = (opts.author || "Manav S").trim();
  const client = opts.client_name || opts.client_domain || "the website";
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
  else if (Array.isArray(o.requirement_findings)) base.document_findings = { answered: o.requirement_findings, uncovered: o.uncovered, files: o.files };
  else if (o.issues && typeof o.pages_reachable === "number") base.site_audit = { pages: o.pages_reachable, capped: o.crawl_capped, performance: o.performance, issues: Object.fromEntries(Object.entries(o.issues).map(([k, v]: any) => [k, v.count])), schema: o.schema_coverage, broken_links: (o.broken_links || []).slice(0, 10) };
  return base;
}

const DMS_SYSTEM = [
  `You are a senior digital marketing strategist writing an SEO and AEO audit FOR A CLIENT — a business owner, not a technician.`,
  `You are given the REAL findings from the analysis: actual numbers and items. Interpret them through a senior practitioner's lens and write for the client.`,
  ``,
  `For the whole report, write an executive_summary: what the analysis found overall and what it means for their business.`,
  `For each section, write: interpretation (what this finding means in plain business terms), why_it_matters (the impact on visibility, traffic, enquiries, revenue, or wasted spend), recommendations (specific actions in priority order), and a priority (high/medium/low).`,
  ``,
  `HARD RULES — non-negotiable:`,
  `- Use ONLY the numbers and facts in the provided data and the operator-provided materials (if any). Do NOT invent metrics, pages, competitors, dates, or claims that are not present in either.`,
  `- The operator-provided materials are real source: the operator's own analysis and the client's files. Use them to DEEPEN each section and to answer brief points the live-engine data does not fully cover. Attribute to "provided materials" where a point comes from them.`,
  `- Answer EVERY section/requirement substantively. If neither the engine data nor the materials cover a requirement, say plainly what is needed to answer it (for example, "this needs Search Console access" or "provide the client's analytics") rather than padding or inventing.`,
  `- If a section's data is thin, say so plainly. Do NOT pad it to look substantial.`,
  `- Write in clear business English. No tool names, no jargon dumps, not salesy.`,
  ``,
  `Return ONLY valid JSON, no prose, no fences:`,
  `{"executive_summary":"...","sections":[{"id":"sec_0","interpretation":"...","why_it_matters":"...","recommendations":["..."],"priority":"high"}]}`,
].join("\n");

async function seniorDmsPass(stages: ReportStageInput[], opts: ReportOptions): Promise<(SeniorDmsResult & { material_files: string[] }) | null> {
  const completed = completedStages(stages);
  if (completed.length === 0) return null;
  const briefs = completed.map((s, i) => dataBrief(s, i));

  let materialsBlock = ""; let material_files: string[] = [];
  if (opts.project_id) {
    try {
      const mats = await loadMaterials(opts.project_id);
      if (mats.length) { const mp = materialsForPrompt(mats, 110000); materialsBlock = mp.text; material_files = mp.filenames; }
    } catch { /* non-fatal */ }
  }

  const ctx = [
    `Client: ${opts.client_name || opts.client_domain || "the website"}.`,
    `Section findings to interpret (live-engine data):`,
    JSON.stringify({ sections: briefs }),
    materialsBlock ? `\n\nOPERATOR-PROVIDED MATERIALS AND CLIENT FILES (real source — use to deepen sections and answer requirements the engine data does not cover; attribute where used):${materialsBlock}` : ``,
  ].join("\n");
  try {
    const raw = await llm({ system: DMS_SYSTEM, user: ctx.slice(0, 150000), maxTokens: 4000, timeoutMs: 90000, label: "wizard-report-dms" });
    const parsed = parseJsonResponse<any>(raw);
    if (!parsed || !Array.isArray(parsed.sections)) return null;
    const map: Record<string, SectionInterpretation> = {};
    for (const sec of parsed.sections) if (sec?.id) map[sec.id] = { id: sec.id, interpretation: String(sec.interpretation || ""), why_it_matters: String(sec.why_it_matters || ""), recommendations: Array.isArray(sec.recommendations) ? sec.recommendations.filter((x: any) => typeof x === "string") : [], priority: String(sec.priority || "") };
    return { executive_summary: String(parsed.executive_summary || ""), sections: map, material_files };
  } catch { return null; }
}

/* Enriched report: senior-DMS interpretation woven around the grounded
   data tables. Falls back to the data-only report if the lens is
   unavailable, with an honest note. */
export async function assembleClientReportHtmlEnriched(stages: ReportStageInput[], opts: ReportOptions = {}): Promise<{ html: string; sections: number; enriched: boolean }> {
  const author = (opts.author || "Manav S").trim();
  const client = opts.client_name || opts.client_domain || "the website";
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
  const limits = collectLimits(completed);
  if (limits.length) { H.push(`<h2>Important notes and limitations</h2><ul>`); for (const l of limits) H.push(`<li>${esc(l)}</li>`); H.push(`</ul>`); }
  H.push(`<div class="foot">Prepared by ${esc(author)}. ${esc(today)}. The written interpretation is the analyst's reading of the data shown; the supporting data and sources under each section are the record. To save as PDF, use your browser Print and choose "Save as PDF".</div>`);
  H.push(`</div></body></html>`);
  return { html: H.join(""), sections: completed.length, enriched: true };
}
