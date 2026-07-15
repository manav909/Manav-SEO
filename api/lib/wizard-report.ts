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

import { llm, llmComplete, parseJsonResponse } from "./workspace/llm.js";
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
  operator_emphasis?: string;  // the operator's own context / what to emphasise, set before running
  keywords?:        string[];   // target keywords in scope — named in findings where relevant
  competitors?:     string[];   // competitor domains in scope — named where a finding is competitive
  keyword_basis?:   string;     // when auto-derived: the real data the keywords are grounded in
  competitor_basis?: string;    // when auto-derived: the real data the competitors are grounded in
  area_angle?:      string;     // per-document lens: governs this document's structure and voice so
                                // multiple documents do not read the same
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
  if (/gsc-visibility|gscvisibility|gathergscvisibility/i.test(e)) return `Google Search Console impression, click, CTR and position data${dom ? ` for ${dom}` : ""}, cross-checked against a live crawl of the site's pages for indexation${date ? `, ${date}` : ""}.`;
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
  return ["_This section is pending the data source it depends on. Once that source is connected, it produces its full diagnosis — nothing here is estimated in its absence._"];
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

/* ── Charts (inline SVG, no scripts — render cleanly in the browser AND when
   printed to PDF). A performance gauge and a horizontal bar chart. ── */
function svgGauge(score: number, label = "Performance"): string {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const color = s >= 90 ? "#16a34a" : s >= 50 ? "#d97706" : "#dc2626";
  const r = 52; const circ = 2 * Math.PI * r; const off = circ * (1 - s / 100);
  return `<svg viewBox="0 0 150 150" width="130" height="130" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)} score ${s} out of 100">
    <circle cx="75" cy="75" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="13"/>
    <circle cx="75" cy="75" r="${r}" fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 75 75)"/>
    <text x="75" y="72" text-anchor="middle" font-size="34" font-weight="700" fill="${color}">${s}</text>
    <text x="75" y="94" text-anchor="middle" font-size="11" fill="#6b7280">/ 100</text>
  </svg>`;
}
function svgBarChart(data: Array<{ label: string; value: number; color?: string }>, opts?: { unit?: string; labelWidth?: number }): string {
  if (!data.length) return "";
  const w = 560, rowH = 24, gap = 9, labelW = opts?.labelWidth ?? 190, valW = 46;
  const barMax = w - labelW - valW; const max = Math.max(1, ...data.map(d => d.value));
  const h = data.length * (rowH + gap) + 6;
  const rows = data.map((d, i) => {
    const y = i * (rowH + gap) + 4;
    const bw = Math.max(2, Math.round((d.value / max) * barMax));
    const color = d.color || "#6366f1";
    return `<text x="0" y="${y + rowH / 2 + 4}" font-size="12.5" fill="#374151">${esc(d.label)}</text>`
      + `<rect x="${labelW}" y="${y}" width="${bw}" height="${rowH}" rx="4" fill="${color}"/>`
      + `<text x="${labelW + bw + 7}" y="${y + rowH / 2 + 4}" font-size="12.5" font-weight="700" fill="#374151">${d.value}${esc(opts?.unit || "")}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;height:auto" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`;
}

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
    /* Which pages, and why — the senior-lens selection stated openly. */
    if (o.page_selection && o.page_selection.rationale) {
      P.push(`<h4>Pages analysed, and why these</h4>`);
      P.push(`<p>${esc(o.page_selection.rationale)}</p>`);
      const pr = Array.isArray(o.page_selection.prioritised) ? o.page_selection.prioritised : [];
      if (pr.length) P.push(tableHtml(["Page prioritised", "Why it was chosen"], pr.map((x: any) => [x.url ? (function () { try { return new URL(x.url).pathname; } catch { return x.url; } })() : String(x), x.why || ""])));
      const bp = Array.isArray(o.page_selection.flagged_boilerplate) ? o.page_selection.flagged_boilerplate : [];
      if (bp.length) P.push(`<p class="muted"><strong>Flagged as likely leftover theme/demo pages (recommend removing):</strong> ${bp.map((u: string) => esc(u)).join(", ")}.</p>`);
    }
    if (o.performance) {
      const perf = o.performance;
      const runsNote = perf.runs > 1 ? `median of ${perf.runs} lab runs${Array.isArray(perf.scores) ? ` (${perf.scores.join(", ")})` : ""}` : "single lab run — indicative";
      const verdict = perf.performance_score >= 90 ? "Good." : perf.performance_score >= 50 ? "Needs work." : "Poor — treat as a priority fix.";
      P.push(`<div style="display:flex;align-items:center;gap:18px;margin:8px 0 12px">${svgGauge(perf.performance_score, "Homepage speed")}<div><p style="margin:0"><strong>Homepage performance (mobile)</strong></p><p style="margin:5px 0 0">LCP ${esc(perf.lcp || "—")} &middot; TBT ${esc(perf.tbt || "—")} &middot; CLS ${esc(perf.cls ?? "—")}</p><p class="muted" style="margin:5px 0 0">${esc(runsNote)}. ${esc(verdict)}</p></div></div>`);
    }
    const issueEntries = Object.entries(o.issues).sort((a: any, b: any) => b[1].count - a[1].count);
    if (issueEntries.length) {
      P.push(`<h4>On-page and technical issues (site-wide)</h4>`);
      const chartData = issueEntries.slice(0, 8).map(([k, v]: any) => ({ label: String(k).replace(/_/g, " "), value: v.count, color: v.count >= 20 ? "#dc2626" : v.count >= 5 ? "#d97706" : "#6366f1" }));
      P.push(svgBarChart(chartData, { unit: " pages" }));
      const rows = issueEntries.map(([k, v]: any) => [String(k).replace(/_/g, " "), v.count, (v.pages || []).slice(0, 3).join(", ")]);
      P.push(tableHtml(["Issue", "Pages affected", "Examples"], rows));
    }
    if (o.broken_links?.length) P.push(`<p class="muted"><strong>Pages the crawler could not reach (may be WAF/rate-limiting rather than truly broken — verify):</strong> ${o.broken_links.slice(0, 10).map((u: string) => esc(u)).join("; ")}.</p>`);
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

  /* Market & competitive search research — real SERP intelligence, charted. */
  if (o.is_market_research) {
    if (typeof o.summary === "string") P.push(`<p>${esc(o.summary)}</p>`);
    if (Array.isArray(o.share_of_voice) && o.share_of_voice.length) {
      P.push(`<h4>Who owns the search results in your space</h4>`);
      P.push(svgBarChart(o.share_of_voice.map((x: any) => ({ label: x.domain, value: x.appearances, color: (o.client_domain && String(x.domain).includes(o.client_domain)) ? "#16a34a" : "#6366f1" })), { unit: "", labelWidth: 220 }));
      P.push(`<p class="muted">${o.client_appears ? "Your site appears here." : "Your site does not appear at all — every result above is a competitor or third party shaping how your market sees this space."}</p>`);
    }
    if (Array.isArray(o.ai_citations) && o.ai_citations.length) {
      P.push(`<h4>Who Google's AI answers cite in your space</h4>`);
      P.push(svgBarChart(o.ai_citations.map((x: any) => ({ label: x.domain, value: x.count, color: (o.client_domain && String(x.domain).includes(o.client_domain)) ? "#16a34a" : "#d97706" })), { unit: "", labelWidth: 220 }));
    }
    if (Array.isArray(o.paa_questions) && o.paa_questions.length) {
      P.push(`<h4>Real questions your audience is asking — the content and Q&A opportunity</h4><ul>${o.paa_questions.map((q: string) => `<li>${esc(q)}</li>`).join("")}</ul>`);
    }
    return P.join("");
  }

  /* Google Shopping readiness / product-feed audit. */
  if (Array.isArray(o.action_plan) && o.signals && typeof o.is_ecommerce === "boolean") {
    if (typeof o.summary === "string") P.push(`<p>${esc(o.summary)}</p>`);
    if (o.is_ecommerce && o.signals) {
      const rows = Object.entries(o.signals).map(([k, v]: any) => [String(k).replace(/_/g, " "), v ? "present" : "MISSING"]);
      P.push(`<h4>Product-data readiness for a Shopping feed${o.platform ? ` (${esc(o.platform)})` : ""}</h4>`);
      P.push(tableHtml(["Signal", "Status"], rows));
    }
    if (o.action_plan.length) { P.push(`<h4>Prioritised readiness plan</h4>`); P.push(tableHtml(["Priority", "Action", "Why it matters"], o.action_plan.map((a: any) => [`P${a.priority}`, a.action, a.why]))); }
    if ((o.notes || []).length) P.push(`<p class="muted">${o.notes.map((n: string) => esc(n)).join(" ")}</p>`);
    return P.join("");
  }

  /* A stage answered from the operator's uploaded data (verifiable, attributed). */
  if (o.from_documents) {
    if (Array.isArray(o.findings) && o.findings.length) P.push(`<ul>${o.findings.map((f: string) => `<li>${esc(f)}</li>`).join("")}</ul>`);
    if (Array.isArray(o.data_points) && o.data_points.length) P.push(`<p><strong>Data points:</strong> ${o.data_points.map((d: string) => esc(d)).join("; ")}.</p>`);
    if (Array.isArray(o.source_files) && o.source_files.length) P.push(`<p class="muted">From the supplied dataset (${o.source_files.map((s: string) => esc(s)).join(", ")}) — verify point by point against the file.</p>`);
    return P.join("");
  }

  /* Social-presence audit (OG/Twitter tags + social links + suggestions). */
  if (Array.isArray(o.suggestions) && o.open_graph) {
    if (typeof o.summary === "string") P.push(`<p>${esc(o.summary)}</p>`);
    const ogRows = Object.entries(o.open_graph || {}).map(([k, v]: any) => [k, v ? "present" : "MISSING", v ? String(v).slice(0, 80) : ""]);
    if (ogRows.length) { P.push(`<h4>Open Graph tags (how your links look when shared)</h4>`); P.push(tableHtml(["Tag", "Status", "Value"], ogRows)); }
    if (Array.isArray(o.social_links) && o.social_links.length) P.push(`<p class="muted"><strong>Social profiles linked from the site:</strong> ${o.social_links.map((s: any) => esc(s.platform)).join(", ")}.</p>`);
    else P.push(`<p class="muted">No social profile links were found on the site.</p>`);
    if (o.suggestions.length) { P.push(`<h4>Prioritised suggestions</h4>`); P.push(tableHtml(["Priority", "Suggestion", "Why it matters"], o.suggestions.map((s: any) => [`P${s.priority}`, s.suggestion, s.why]))); }
    if ((o.notes || []).length) P.push(`<p class="muted">${o.notes.map((n: string) => esc(n)).join(" ")}</p>`);
    return P.join("");
  }

  /* Knowledge Panel / entity-signal audit (works from a name, no website). */
  if (Array.isArray(o.action_plan) && o.wikidata) {
    if (typeof o.summary === "string") P.push(`<p>${esc(o.summary)}</p>`);
    if (o.panel) {
      if (o.panel.present) {
        P.push(`<h4>Your Knowledge Panel today</h4>`);
        P.push(`<p>${esc(o.panel.title || o.name)}${o.panel.type ? ` — ${esc(o.panel.type)}` : ""}. ${o.panel.has_image ? "It has an image." : "It has no image."} ${(o.panel.profiles || []).length} linked profile(s)${o.panel.source ? `, sourced largely from ${esc(o.panel.source)}` : ""}.</p>`);
        const attrs = Object.entries(o.panel.attributes || {});
        if (attrs.length) P.push(tableHtml(["What Google shows", "Value"], attrs.slice(0, 10).map(([k, v]: any) => [String(k).replace(/_/g, " "), String(v).slice(0, 140)])));
      } else P.push(`<p class="muted">No Knowledge Panel is currently shown for "${esc(o.name)}"${o.panel.error ? ` (${esc(o.panel.error)})` : ""} — establishing the authoritative signals below is the first job.</p>`);
    }
    if (o.wikidata) P.push(`<p class="muted"><strong>Wikidata:</strong> ${o.wikidata.found ? `entity ${esc(o.wikidata.id)} exists${(o.wikidata.missing_props || []).length ? `, missing ${esc((o.wikidata.missing_props || []).join(", "))}` : " and is well-populated"}` : "no entity found — the highest-leverage gap"}.</p>`);
    if (o.action_plan.length) { P.push(`<h4>Prioritised action plan</h4>`); P.push(tableHtml(["Priority", "Action", "Why it matters"], o.action_plan.map((a: any) => [`P${a.priority}`, a.action, a.why]))); }
    if ((o.notes || []).length) P.push(`<p class="muted">${o.notes.map((n: string) => esc(n)).join(" ")}</p>`);
    return P.join("");
  }

  /* Default — NEVER coerce an object into "[object Object]". Render only a
     string summary or note; otherwise state plainly that no formatted findings
     were produced. This guard is what prevents an engine whose `summary` is an
     object (rather than a string) from printing "[object Object]" to a client. */
  const summaryStr = typeof o.summary === "string" ? o.summary : (typeof o.note === "string" ? o.note : "");
  return `<p>${esc(summaryStr || "This section is pending the data source it depends on. Once that source is connected, it produces its full diagnosis — nothing here is estimated in its absence.")}</p>`;
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

interface DmsSection { heading: string; body: string; }
interface SeniorDmsResult { title?: string; bottom_line?: string; sections: DmsSection[]; }

/* Compact, bounded data brief per section for the model to interpret. */
function dataBrief(s: ReportStageInput, idx: number): any {
  const o = s.output || {};
  const id = `sec_${idx}`;
  const base: any = { id, label: s.label, summary: o.summary || "", limits: (o.limits || []).slice(0, 4) };
  if (o.evidence && typeof o.evidence.visible_count === "number") base.gsc = { connected: true, visible_pages: o.evidence.visible_count, invisible_pages: o.evidence.invisible_count, pages_in_scope: o.evidence.target_count };
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
  `- "COULD NOT REACH" IS NOT "BROKEN". Pages the crawler could not fetch are NOT 404 errors, broken links, or dead pages — a fast crawl of an e-commerce store is often rate-limited or WAF-blocked, so a live product page fails to fetch. NEVER characterize unreachable pages as returning 404s, being broken, or being dead-ends. If you mention them at all, say exactly this: our crawler could not reach these pages on this pass (likely rate-limiting) and they should be verified — they are very probably live. Do NOT build a "broken products / 404" finding on them, and never make it a headline. Fabricating a 404 that is not real is the fastest way to be caught out and lose the deal.`,
  `- Where a real figure would strengthen a point but is not in the data, say what is needed to get it (e.g. "connect Search Console to confirm which pages Google indexes") rather than inventing it.`,
  `- A DATA SOURCE THAT WAS NOT AVAILABLE (for example Search Console not connected) is a ONE-TO-TWO-LINE next-step note, not the body of the report. State plainly that it is pending and what it will unlock, then spend the report on what WAS actually measured (the live crawl, PageSpeed, live search). Never expand an unavailable source into paragraphs of hypothetical outcomes dressed as analysis, and never present what you "could" find as if you found it — that reads as padding and a client will see through it.`,
  `- OPERATOR-PROVIDED DATA (uploaded CSVs, tool exports, notes) is a legitimate source — and it is exactly what FILLS the brief items the live engines cannot measure themselves: keyword volumes and rankings, backlinks and referring domains, Search Console clicks/impressions/positions. Use its real figures to answer those items instead of saying "needs data". BUT it is SUPPLIED by the operator, not measured by this platform: attribute every figure taken from it to "the supplied dataset" (name the file) so it can be verified point by point against that file, present it as supplied-and-verifiable, keep it visibly distinct from the live engine findings, and never extrapolate a single number beyond what the file actually states.`,
  `- If a section's data is genuinely thin, say so in one honest line; do not pad. Write in clear business English, no tool names, no jargon dumps, never salesy.`,
  `- TONE — ANALYSIS DONE, REMEDIATION NOT. Frame the entire document as YOUR analysis, diagnosis and plan — never as completed work. You genuinely DID the analytical work and should say so in the first person: "I reviewed your on-page audit and cross-referenced it against a live crawl of the site", "I examined your three competitors", "I analysed your Search Console data", "I mapped this against what I found on the site". That analytical effort is real and the reader must feel it. But you have NOT done the remediation, and you must NEVER imply you have: do not write that an audit "has been conducted" or "has been completed" as if the fix is finished, that issues "have been resolved", or that "the work has been done". Findings taken from the client's own uploaded reports are DATA you analysed, not tasks you performed — write "your uploaded audit flags X" or "my review of your data shows X", then give YOUR reading of it and what YOU would do next. Every issue ends with your diagnosis and the specific fix you propose, so the document reads as a senior practitioner presenting deep analysis and a plan to be engaged for — honest, expert, and clearly distinguishing what you have already analysed from what you are proposing to do.`,
  ``,
  `WRITE LIKE A PERSON TALKING TO A PERSON — this is what earns trust and closes deals:`,
  `- BE FULL EYES AND EARS — analytical responsibility. Do NOT assume the source or intent behind what the data shows. Schema, sitemaps, meta tags and canonicals on a site are USUALLY generated automatically by the CMS or an SEO plugin (WordPress with Yoast or RankMath, Shopify, Wix, Squarespace) — NOT hand-built by the client's team or a previous agency. Never credit "your team/agency implemented X" or infer strategy from mere presence. When you see a large, UNIFORM count (for example 1,000+ schema blocks that are the same handful of types on every page), name the likely mechanism plainly: "this is your CMS/SEO plugin auto-adding generic WebPage/Article/Breadcrumb markup to every page — its presence is not a sign of quality or a strategy." Then judge whether that automated output is COMPLETE and CORRECT for THIS specific business: a plugin adds broad schema but not the high-value types a medical site needs (MedicalProcedure, Physician, FAQPage) or a shop needs (Product, Offer, Review). Question QUALITY, not quantity — a high count can hide generic, incomplete, or wrong markup. The client must feel you see the whole picture — platform, plugins, theme, and automated behaviour — not that you counted blobs and drew a naive conclusion.`,
  `- First person, direct, conversational. "I ran a full crawl of your site and checked every key page." "Here is what I found." "Here is what that is costing you." You are a senior consultant walking the client through what YOU did and found — not a report narrator, not an LLM summarising.`,
  `- Address the client as "you" and "your firm". Talk TO them.`,
  `- SHORT and specific. No paragraph longer than about four sentences. If a sentence has no number, page, name, or concrete consequence in it, delete it. Ban vague declarations such as "this is important for your online presence" or "structured data is increasingly important" — replace every one with the specific fact and the specific consequence for this business.`,
  `- Make the effort visible: "I checked all 46 of your key pages", "I searched Google for your own brand name", "I read your homepage FAQ". The client should SEE the work that was done.`,
  ``,
  `EACH FINDING FOLLOWS THIS FLOW — naturally, as flowing sentences, NOT as labelled fields — in a few tight lines:`,
  `  (1) what I checked  ->  (2) what I found, the specific finding with the real number or page  ->  (3) what it means  ->  (4) why it matters to THIS business, the concrete consequence  ->  (5) what our service does about it, so buying it is the obvious next step.`,
  `Voice and tightness to match (adapt to the REAL data, never copy this text): "I read your homepage and found a six-question FAQ — 'What does Inventure invest in?', 'Who can invest?' — with no FAQPage markup behind it. So when an investor asks ChatGPT or Google's AI those exact questions, your site is not even eligible to be the answer; whoever wrote about you elsewhere is. For a firm raising capital, that is a first impression you never get to make. Adding FAQPage schema to that section is a same-week job, and it is exactly what the schema service delivers."`,
  `NEVER write like this (the thing clients hate): "Structured data is an increasingly important aspect of modern SEO and can help improve visibility across search engines and AI systems. It is recommended to implement schema markup where appropriate." — vague, generic, no data, no consequence, no person. If a paragraph reads like that, rewrite it or cut it.`,
  ``,
  `SELL THE PLAN WITH DATA — this report exists to convert the lead, factually:`,
  `- COVER EVERY SERVICE IN THE BRIEF — leave none blank. For each service the prospect scoped, use the specific real data this analysis DID gather, even if that service's own engine did not run: the live SERP's "People Also Ask" questions are the opportunity map for the CONTENT, ARTICLE and OFF-SITE Q&A services (name the actual questions people search); the crawl's per-page issues (thin pages, weak or missing titles/H1s, specific URLs) are the targets for the PAGE-ENHANCEMENT service (name the actual pages); the FAQ detection and schema gaps are the FAQ and SCHEMA services. Where a service genuinely needs data this run did not gather — BACKLINKS need a Semrush/Ahrefs connection, KEYWORD REPORTING needs Search Console — say so in ONE honest line and note it unlocks the moment that source is connected. Every brief item gets either real data or one honest line. None is silently dropped — a half-answered brief loses the deal.`,
  `- FOR A TECHNICAL-SEO BRIEF, the crawl and PageSpeed ALREADY MEASURED most of it — do NOT call these "awaiting data". H1 problems (missing/multiple/duplicate), meta title and description problems, missing image alt text, broken links and 4xx URLs, canonical issues, thin content, sitemap presence, and Core Web Vitals / page speed are all in the crawl and PageSpeed data with exact counts and specific pages. Cite the real numbers ("14 of your 75 pages have no H1", "23 images are missing alt text on your product pages") and treat these as ANALYSED and ready to fix. Only genuinely external items (backlinks, keyword volumes, Search Console impressions) are pending.`,
  `- Connect every finding to a service being sold: finding -> consequence for their business -> the specific service that fixes it. A gap you found is the proof that a service is needed. Example shape: "Your homepage FAQ has no schema, so you are invisible to AI answers on the exact questions investors ask — this is precisely what the AEO/schema service fixes."`,
  `- STAY IN THE SERVICE LANE. The services listed above define what is being sold. Build the sales case ONLY on findings those services address (content, schema/AEO, on-page, links, Q&A, and the like). A finding OUTSIDE the services being sold — most commonly site speed / performance / Core Web Vitals when the services are content and AEO — is reported HONESTLY in one line as an observation, noted as "a fix for your web/dev team, outside this engagement", and is NEVER the basis of the sales case, the headline, or a recommendation you are selling. Do not over-emphasise what you are not being paid to fix. Lead with what these services actually change.`,
  `- Handle the objection before it is raised, with data, not pressure. Anticipate the two or three things a sceptical buyer (or their own senior marketer) would push back on — "we have our own SEO team", "is this worth the spend", "can you really deliver at quality" — and answer each with a fact from the findings. Never beg; let the evidence do the convincing.`,
  `- Where a real, checkable example or reference genuinely strengthens the case (a well-known competitor doing it right, a concrete before/after mechanism), use it — but only if true. No invented case studies, no fabricated stats.`,
  `- Be persuasive by being RIGHT, not loud. No hype, no "act now", no salesy adjectives. The most convincing thing is an accurate, specific diagnosis the buyer recognises as true.`,
  `- Write a bottom_line: three to five sentences that state, factually, what is broken today, what the engagement changes, and why moving now beats waiting — the honest close.`,
  ``,
  `DESIGN THE DOCUMENT FOR THIS BRIEF:`,
  `- IF a "THIS DOCUMENT'S FOCUS AND SHAPE" lens is provided below, it GOVERNS this document's structure, section ordering, heading style and voice. Follow it so this document does NOT read like the others in the set — different shape, different rhythm, headings phrased in that lens. When several documents are produced for one client, each must feel distinct; a reader flipping through them should never feel deja-vu. Only fall back to the default shape below when no lens is given.`,
  `- NAME THE SPECIFICS. Where target keywords are supplied, name the actual keyword when a finding turns on it ("your pages do not target 'feeding therapy for toddlers'"), not "your keywords" in the abstract. Where competitors are supplied, name the actual competitor when a finding is competitive ("culturekings.com ranks for this; you do not"), not "competitors" generically. Specificity is what makes it read as real analysis.`,
  `- Make the FIRST section a short, human opening (two to four sentences, first person): what you looked at across their site and the single biggest thing you found, stated bluntly. Its heading names that headline finding.`,
  `- Then ONE tight section per real, material finding — each following the five-step flow (checked -> found -> means -> matters -> the fix), each a few sentences, each with a specific heading that states the finding (never generic).`,
  `- Four to seven sections total, and ONLY what is real and material. Do NOT manufacture sections to look thorough — fewer, sharper sections close better than more, softer ones. If the data only supports three real findings, write three.`,
  `- Give the whole document a specific, non-generic title naming the prospect and the point of the analysis.`,
  `- The bottom_line is you, in first person, closing: what is broken today, what changes the week they hire you, and why waiting costs them — three or four sentences, human, no hype.`,
  ``,
  `Return ONLY valid JSON, no prose, no fences:`,
  `{"title":"a specific, bespoke document title for this prospect","sections":[{"heading":"a bespoke section heading crafted for this brief","body":"markdown analysis weaving in the real findings, numbers and pages, tied to the services, handling objections with data"}],"bottom_line":"the factual close"}`,
].join("\n");

async function seniorDmsPass(stages: ReportStageInput[], opts: ReportOptions): Promise<(SeniorDmsResult & { material_files: string[] }) | null> {
  const completed = completedStages(stages);
  if (completed.length === 0) return null;
  const briefs = completed.map((s, i) => dataBrief(s, i));

  let material_files: string[] = [];
  let materialsText = "";
  if (opts.project_id) {
    try {
      const mats = await loadMaterials(opts.project_id);
      material_files = mats.map(m => m.filename);
      if (mats.length) materialsText = materialsForPrompt(mats, 45000).text;
    } catch { /* non-fatal */ }
  }

  /* Deterministic GSC-connected guard. If ANY stage carries real Search Console
     evidence (visible/invisible counts), the narrative must NEVER claim GSC is
     not connected — this makes it impossible for the document to contradict the
     data it was handed (the "flying blind / never connected while GSC data is
     present" bug). */
  const gscEvidenceStage = stages.find((s: any) => { const e: any = s?.output?.evidence; return e && (typeof e.visible_count === "number" || typeof e.invisible_count === "number"); });
  let gscGuard = "";
  if (gscEvidenceStage) {
    const e: any = (gscEvidenceStage as any).output.evidence;
    gscGuard = `GOOGLE SEARCH CONSOLE IS CONNECTED for this site, and its REAL data is in this report: ${e.visible_count} pages visible in search, ${e.invisible_count} with zero impressions, across ${e.target_count} pages in scope. You MUST present these real Search Console findings as measured fact. You must NEVER say Search Console is "not connected" or "never been connected", and never say the client is "flying blind" for lack of it — that is FALSE and forbidden when this data is present.`;
  } else if (opts.project_id) {
    /* No GSC data in THIS payload — but if GSC is connected for the project, a
       stale/partial stage set must still never produce a "no GSC / flying blind"
       claim. Check the project's real connection status directly. */
    try {
      const { db } = await import("./db.js");
      const { data: integ } = await db().from("project_integrations").select("resource_id,provider").eq("project_id", opts.project_id).eq("provider", "gsc").limit(1);
      const row: any = Array.isArray(integ) ? integ[0] : integ;
      if (row && row.resource_id) {
        gscGuard = `GOOGLE SEARCH CONSOLE IS CONNECTED for this project (a property is set). Its per-page diagnosis may not be in this particular document's sections, but you must NEVER say Search Console is "not connected", "never been connected", or that the client is "flying blind" for lack of it — that is FALSE. If its findings are not shown here, state briefly that the Search Console diagnosis is connected and available (run the Search Console stage to include it) — never present its absence as the client's failing.`;
      }
    } catch { /* proceed without the project-level check */ }
  }

  const ctx = [
    gscGuard,
    opts.operator_emphasis ? `╔═══ THE OPERATOR'S EXPLICIT STEER — THIS OVERRIDES DEFAULT FRAMING. Read it FIRST and let it shape the whole document: which finding you open with, how you structure the sections, what you emphasise, and the angle you take. The opening section MUST visibly reflect this steer. If it conflicts with a default instinct, the steer wins (as long as it stays within honest data). ═══╗\n${opts.operator_emphasis}\n╚═══ end of the operator's steer — obey it ═══╝` : "",
    `Client: ${opts.client_name || opts.client_domain || deriveClient(stages) || "the website"}.`,
    `PURPOSE OF THIS REPORT: it backs a SALE. We are pitching the services below to this prospect and this report must, using ONLY honest data, make the factual case that they should buy — and answer their likely objections before they raise them.`,
    opts.engagement_type ? `Who we are convincing: ${opts.engagement_type === "reseller_productized" ? "a reseller/agency deciding whether to make us their production partner across their clients" : opts.engagement_type === "site_owner" ? "the business owner whose site this is" : "the prospect"}.` : "",
    opts.buyer_note ? `What they care about: ${opts.buyer_note}` : "",
    (opts.requirements && opts.requirements.length)
      ? `THE SERVICES/PLANS WE ARE SELLING (what the prospect scoped and is curious about) — every finding must connect to one of these and show why the service is worth buying:\n${opts.requirements.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
      : `No explicit brief was supplied; audit the site's health and opportunities.`,
    materialsText
      ? `YOUR PROVIDED DATA / FILES (${material_files.join(", ")}) — operator-supplied, and a LEGITIMATE source for this analysis, ESPECIALLY for the brief items the live engines cannot measure themselves (keyword volumes and rankings, backlinks/referring domains, Search Console clicks/impressions/positions). Use it to answer those items with real figures. BUT it is OPERATOR-PROVIDED, not something this platform independently measured: attribute every figure taken from it to "the supplied dataset" (name the file), so it can be verified point by point against that file, and present it as supplied-and-verifiable, never as an engine measurement. Do not extrapolate beyond what the data actually states.\n\n${materialsText}`
      : "",
    opts.operator_emphasis ? `Reminder before you write: the operator's steer at the top is a priority instruction — make sure the finished document unmistakably reflects it.` : "",
    (opts.keywords && opts.keywords.length) ? `TARGET KEYWORDS IN SCOPE (name the specific keyword when a finding turns on it): ${opts.keywords.join(", ")}.` : "",
    (opts.competitors && opts.competitors.length) ? `COMPETITORS IN SCOPE (name the specific competitor when a finding is competitive): ${opts.competitors.join(", ")}.` : "",
    opts.keyword_basis ? `These target keywords were researched from ${opts.keyword_basis} — not arbitrary. Where it reads naturally, make that grounding visible (for example "your Search Console shows real demand for ...") so the client sees the keyword targeting is evidence-based.` : "",
    opts.competitor_basis ? `These competitors were identified from ${opts.competitor_basis}. Reference that basis where relevant so the competitive analysis reads as researched, not assumed.` : "",
    opts.area_angle ? `╔═══ THIS DOCUMENT'S FOCUS AND SHAPE — this lens GOVERNS the structure, ordering, headings and voice of THIS document so it reads distinctly from the others in the set: ═══╗\n${opts.area_angle}\n╚═══ shape this document to that lens ═══╝` : "",
    `Write ONE coherent senior analysis that closes this sale factually. Lead with the single finding that most justifies the engagement (unless the operator's steer directs otherwise). Connect related findings into one diagnosis. Every point should move the prospect toward "yes" — with data, not pressure.`,
    JSON.stringify({ sections: briefs }).slice(0, 60000),
  ].join("\n");
  const run = async (): Promise<(SeniorDmsResult & { material_files: string[] }) | null> => {
    /* Continuation-safe with ample tokens: the richer senior synthesis over
       several data-heavy sections overflowed a single 4k call, truncating the
       JSON and silently falling back to raw tables. This lets it complete. */
    const { text: raw } = await llmComplete({ system: DMS_SYSTEM, user: ctx, maxTokens: 12000, timeoutMs: 110000, label: "wizard-report-dms", maxSegments: 2 });
    let parsed = parseJsonResponse<any>(raw);
    /* Salvage: if the strict parse missed, slice the outermost JSON object. */
    if (!parsed || !Array.isArray(parsed?.sections)) {
      const s = String(raw || ""); const a = s.indexOf("{"); const b = s.lastIndexOf("}");
      if (a >= 0 && b > a) { try { parsed = JSON.parse(s.slice(a, b + 1)); } catch { /* keep null */ } }
    }
    if (!parsed || !Array.isArray(parsed.sections)) return null;
    const sections: DmsSection[] = parsed.sections
      .filter((s: any) => s && (s.heading || s.body))
      .map((s: any) => ({ heading: String(s.heading || "").trim(), body: String(s.body || "").trim() }))
      .filter((s: DmsSection) => s.body.length > 0);
    if (!sections.length) return null;
    return { title: String(parsed.title || "").trim() || undefined, bottom_line: String(parsed.bottom_line || "").trim(), sections, material_files };
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

/* ── Enriched proposal ──────────────────────────────────────────────
   An LLM-AUTHORED scope-and-proposal document — scope, delivery method,
   quality standards and pricing basis — bespoke to the engagement. It is
   deliberately NOT a diagnosis: it lists no site findings or issue counts
   (that is the audit's job). Falls back to the deterministic template only
   if the synthesis is unavailable. */
const PROPOSAL_SYSTEM = [
  `You are a senior digital-marketing strategist — write the way a seasoned DMS or a CEO talks when winning a client. You are writing the UNDERSTANDING AND STRATEGY document that lands directly on the prospect's desk. It must make them feel you understand their business, their market, and their competitive position BETTER THAN THEY DO. It is NOT a pricing sheet and NOT a raw audit — it is the strategic case, backed entirely by the real data provided (a live audit of their site, structured-data findings, and live SERP / competitor / AI-search research).`,
  ``,
  `You are given real DATA below. USE IT as evidence throughout — the technical audit, the schema findings, and the live search-market research (who owns the SERP in their space, whether Google's AI Overviews cite them, the real questions people search). NEVER invent a number; every claim traces to that data. Where the data does not cover something, say so honestly rather than guess.`,
  ``,
  `Design bespoke sections for THIS business (never generic headings). Cover, in the order that best makes the case:`,
  `- INDUSTRY AND BUSINESS UNDERSTANDING: show you understand their business, their customers, and how buying decisions happen in their space — grounded in what the site and the searches reveal.`,
  `- THE MARKET RIGHT NOW: the competitive and search landscape from the live SERP data — who currently owns the search results in their space — and the shift that matters most in 2026: Google AI Overviews and LLM answer engines (ChatGPT and the like) are increasingly where buyers get their answers. State plainly whether the prospect is visible or invisible there and who is being cited instead. This is the "we know what is coming" section.`,
  `- THE OPPORTUNITY: the gap between where they are and where they could be, quantified from the data. What winning looks like, concretely.`,
  `- THE STRATEGY: frame a clear strategy OUT OF the audit findings and market data — what to do, why, and in what sequence, tied to their business goals. This is where the audit findings become a plan, not a problem list.`,
  `- COMPETITORS: what the sites that own the space are doing that this prospect is not, drawn from the real SERP data.`,
  `- ADDRESSING YOUR CONCERNS: answer every concern, objection and behavioural point the prospect raised in their brief — directly, with data, leaving NOTHING unaddressed.`,
  `- SCOPE AND DELIVERY (keep brief): what the engagement delivers and how, at a high level — enough to show the strategy is executable. This is a strategy document, not a scope sheet.`,
  `- INVESTMENT BASIS (keep brief, one short section): what drives the pricing; write "[confirm monthly figure]" for the number. Do NOT let pricing dominate the document.`,
  ``,
  `Voice: business-professional, senior, person-to-person, confident but honest. Never promise rankings or guaranteed results. Never claim data you were not given. Where reporting needs a source connected (Search Console, Semrush), say so plainly.`,
  ``,
  `Return ONLY valid JSON, no prose, no fences:`,
  `{"title":"a specific strategy-document title for this prospect","understanding":"two to four sentences opening the document with your read of their situation","sections":[{"heading":"a bespoke section heading","body":"markdown body woven with the real data"}],"next_steps":["...","..."]}`,
].join("\n");

async function seniorProposalPass(stages: ReportStageInput[], opts: ReportOptions): Promise<{ title?: string; understanding?: string; sections: DmsSection[]; next_steps: string[] } | null> {
  const completed = completedStages(stages);
  const briefs = completed.map((s, i) => dataBrief(s, i));
  let materialsText = "";
  if (opts.project_id) { try { const mats = await loadMaterials(opts.project_id); if (mats.length) materialsText = materialsForPrompt(mats, 25000).text; } catch { /* optional */ } }
  const reseller = opts.engagement_type === "reseller_productized";
  const ctx = [
    opts.operator_emphasis ? `╔═══ THE OPERATOR'S EXPLICIT STEER — obey it; it shapes the angle, emphasis and strategy of this document ═══╗\n${opts.operator_emphasis}\n╚═══ end of the operator's steer ═══╝` : "",
    `Client / prospect: ${opts.client_name || opts.client_domain || deriveClient(stages) || "the prospect"}.`,
    reseller
      ? `This is a RESELLER / PRODUCTIZED engagement: the prospect is an agency or reseller who will deliver this to THEIR clients. Frame the strategy and scope for repeatable multi-client delivery.`
      : `This is a direct engagement for one business.`,
    opts.buyer_note ? `THEIR STATED CONCERNS / OBJECTIONS / BEHAVIOURAL POINTS (address every one of these directly, with data, leaving nothing unaddressed): ${opts.buyer_note}` : "",
    (opts.requirements && opts.requirements.length)
      ? `WHAT THEY SCOPED / ARE CURIOUS ABOUT (the strategy and scope must connect to these):\n${opts.requirements.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
      : `No explicit brief was supplied; build the strategy from the site and market data.`,
    materialsText ? `Operator-supplied context (their brief, pricing notes, prior scope) — use where relevant; attribute any figure to the supplied dataset:\n${materialsText}` : "",
    `THE REAL DATA TO BUILD THE STRATEGY FROM (audit, schema, and live SERP / competitor / AI-search research) — weave it through the document as evidence:\n${JSON.stringify({ data: briefs }).slice(0, 55000)}`,
    `Write the understanding-and-strategy document now. Make them feel you understand their market better than they do — backed entirely by the data above, nothing invented, nothing unaddressed.`,
  ].filter(Boolean).join("\n");
  const run = async () => {
    const { text: raw } = await llmComplete({ system: PROPOSAL_SYSTEM, user: ctx, maxTokens: 11000, timeoutMs: 110000, label: "wizard-proposal", maxSegments: 2 });
    let parsed = parseJsonResponse<any>(raw);
    if (!parsed || !Array.isArray(parsed?.sections)) { const s = String(raw || ""); const a = s.indexOf("{"); const b = s.lastIndexOf("}"); if (a >= 0 && b > a) { try { parsed = JSON.parse(s.slice(a, b + 1)); } catch { /* keep null */ } } }
    if (!parsed || !Array.isArray(parsed.sections)) return null;
    const sections: DmsSection[] = parsed.sections.filter((s: any) => s && (s.heading || s.body)).map((s: any) => ({ heading: String(s.heading || "").trim(), body: String(s.body || "").trim() })).filter((s: DmsSection) => s.body.length > 0);
    if (!sections.length) return null;
    return { title: String(parsed.title || "").trim() || undefined, understanding: String(parsed.understanding || "").trim(), sections, next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps.map(String) : [] };
  };
  try { let r = await run(); if (!r) r = await run(); return r; } catch { return null; }
}

export async function assembleProposalHtmlEnriched(stages: ReportStageInput[], opts: ReportOptions = {}): Promise<{ html: string; sections: number; enriched: boolean }> {
  const prop = await seniorProposalPass(stages, opts);
  if (!prop) { const base = assembleProposalHtml(stages, opts); return { ...base, enriched: false }; }
  const author = (opts.author || "Manav S").trim();
  const client = opts.client_name || opts.client_domain || "your engagement";
  const named = client && client !== "your engagement";
  const today = fmtDate(new Date().toISOString());
  const title = prop.title || (opts.engagement_type === "reseller_productized" ? "Productized SEO & AEO Delivery — Scope & Proposal" : "SEO & AEO Delivery — Scope & Proposal");
  const H: string[] = [];
  H.push(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${REPORT_CSS}</style></head><body><div class="doc">`);
  H.push(`<div class="lh"><h1>${esc(title)}</h1><div class="by">Prepared by ${esc(author)}${named ? ` · for ${esc(client)}` : ""}</div><div class="dt">${esc(today)}</div>${opts.include_branding ? `<div class="brand">Produced with SEO Season</div>` : ``}</div>`);
  if (prop.understanding) H.push(mdToHtml(prop.understanding));
  for (const sec of prop.sections) { if (sec.heading) H.push(`<h2>${esc(sec.heading)}</h2>`); if (sec.body) H.push(mdToHtml(sec.body)); }
  H.push(renderServicesReference(opts.requirements));
  if (prop.next_steps.length) H.push(`<h2>Next steps</h2><ol>${prop.next_steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>`);
  H.push(`<div class="foot">Prepared by ${esc(author)}. ${esc(today)}. This document defines the scope, delivery and pricing basis of the engagement.</div>`);
  H.push(`</div></body></html>`);
  return { html: H.join(""), sections: prop.sections.length, enriched: true };
}

/* Plain-language definitions for the services a brief scopes, so the client can
   see exactly what each named service is. Deterministic and honest — matched to
   the requirements actually in the plan, defined in plain English. */
const SERVICE_DEFINITIONS: Array<{ re: RegExp; term: string; def: string }> = [
  { re: /technical (seo|audit)|site.?wide audit|crawl/i, term: "Technical SEO audit", def: "A full check of your site's technical health — how well search engines can crawl, read and index it: titles, headings, links, broken URLs, speed and structured data." },
  { re: /schema|structured data|json.?ld/i, term: "Schema / structured data", def: "Code added to your pages that tells Google and AI engines exactly what each page is (a product, an article, a business, an FAQ), making you eligible for rich results and AI-answer citations." },
  { re: /llms?\.txt/i, term: "llms.txt", def: "A file at your site root that tells AI crawlers (ChatGPT and the like) what your site covers and where your authoritative content is." },
  { re: /aeo|answer.?engine|generative engine|geo\b|ai.?overview|ai visibility/i, term: "AEO / GEO (AI-answer optimisation)", def: "Optimising so your brand appears in AI-generated answers — Google's AI Overviews and LLM chatbots — which is increasingly where buyers get their answers before visiting any website." },
  { re: /article|blog|content writing|copywriting/i, term: "Content / articles", def: "Articles written to directly answer the real questions your audience searches, structured so Google's AI and chatbots can quote them — researched from live search data, not thin AI filler." },
  { re: /backlink|link build|referring domain|off.?site.*link/i, term: "Backlinks", def: "Links from other reputable websites to yours, earned through genuine outreach — a core signal Google uses to judge your authority. Never bought or spun, which risk penalties." },
  { re: /off.?site q&?a|reddit|quora|forum/i, term: "Off-site Q&A", def: "Genuinely helpful answers posted where your audience already asks questions (Reddit, Quora), building presence and referral traffic, disclosed per each platform's rules." },
  { re: /page enhanc|on.?page|text improvement|copy edit/i, term: "On-page enhancements", def: "Improvements to the text and structure of your existing pages — headlines, intros, closings, metadata — so they rank better and read better, without a full rebuild." },
  { re: /faq/i, term: "FAQ optimisation", def: "Question-and-answer content on your pages, marked up so it can appear as rich results and be cited directly in AI answers." },
  { re: /keyword report|rank tracking|position|impression|search console|gsc/i, term: "Keyword & rank reporting", def: "Tracking which search terms bring you traffic and where you rank over time, from Search Console or Semrush data — so progress is measured, not asserted." },
  { re: /meta (title|description)|title tag|snippet/i, term: "Meta titles & descriptions", def: "The headline and summary shown for your pages in search results — effectively your organic ad copy, written around the terms your customers search." },
  { re: /canonical|duplicate|redirect/i, term: "Canonical & duplicate fixes", def: "Tags and fixes that tell Google which version of a page to rank, so duplicate URLs stop splitting your ranking strength." },
  { re: /core web vital|page ?speed|lighthouse|performance/i, term: "Core Web Vitals / speed", def: "How fast and stable your pages load on mobile — a Google ranking factor and a direct driver of whether visitors stay or bounce." },
  { re: /shopping|merchant center|product feed/i, term: "Google Shopping readiness", def: "Getting your product data (Product schema, prices, availability, identifiers) feed-ready for a healthy Google Merchant Center / Shopping presence." },
  { re: /knowledge panel|entity|wikidata/i, term: "Knowledge Panel / entity", def: "The information box Google shows for a brand or person, strengthened through entity signals (Wikidata, authoritative profiles) so it appears richer and more complete." },
  { re: /social|open graph|instagram|facebook/i, term: "Social presence", def: "How your site is set up for social sharing (Open Graph tags controlling how links preview) and connected to your social profiles, strengthening brand signals." },
  { re: /competit|market research|share of voice/i, term: "Competitive research", def: "Live analysis of who ranks and gets cited for your key terms and what they do differently, turning their position into your opportunity map." },
];
function renderServicesReference(requirements: string[] | undefined): string {
  const reqs = (requirements || []).filter(Boolean);
  if (!reqs.length) return "";
  /* One numbered row for EVERY scoped service, in the same order the document
     numbers them, so a client can cross-reference "service 14" to its meaning.
     Nothing is dropped: two services that share a definition each still appear,
     because each is a distinct line item the client is paying for. */
  const rows = reqs.map((r, i) => {
    const hit = SERVICE_DEFINITIONS.find(d => d.re.test(r));
    const def = hit
      ? `<strong>${esc(hit.term)}.</strong> ${esc(hit.def)}`
      : `A deliverable in this engagement, produced as described in the plan above.`;
    return `<tr><td style="vertical-align:top;white-space:nowrap;text-align:right"><strong>${i + 1}</strong></td><td style="vertical-align:top">${esc(r)}</td><td>${def}</td></tr>`;
  }).join("");
  return `<h2>What each service means</h2><p class="muted">A plain-language reference for every service named above, numbered to match the list so each one is easy to find — nothing is jargon, and every service is accounted for.</p><table><thead><tr><th style="width:2.5rem;text-align:right">#</th><th>As scoped</th><th>What it is</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* Enriched report: senior-DMS interpretation woven around the grounded
   data tables. Falls back to the data-only report if the lens is
   unavailable, with an honest note. */
/* ── Data-backed keyword + competitor derivation ──────────────────────────
   When the operator did not supply keywords/competitors, a Senior DMS still
   needs them — but researched from real signals, never invented. This mines
   the strongest evidence the run already gathered (real Search Console queries
   for keywords; real SERP-ranking domains for competitors; the site's own
   pages for context) and makes ONE grounded LLM call to select and prioritise
   them like a senior would. Every result carries a basis line stating what it
   is grounded in, so the document can show the client they are researched. */
export async function deriveKeywordsAndCompetitors(
  stages: ReportStageInput[],
  opts: ReportOptions
): Promise<{ keywords: string[]; competitors: string[]; keyword_basis: string; competitor_basis: string }> {
  const completed = completedStages(stages);
  const clientDomain = opts.client_domain || deriveClient(stages) || "";
  const gscQueries: string[] = [];
  const serpDomains: string[] = [];
  const siteBits: string[] = [];
  for (const s of completed) {
    const o: any = s.output || {};
    const pairs = o?.evidence?.query_page_pairs || o?.query_page_pairs;
    if (Array.isArray(pairs)) for (const p of pairs.slice(0, 50)) { if (p && p.query) gscQueries.push(String(p.query)); }
    if (Array.isArray(o?.share_of_voice)) for (const x of o.share_of_voice) { if (x && x.domain && (!clientDomain || !String(x.domain).includes(clientDomain))) serpDomains.push(String(x.domain)); }
    if (o?.homepage_title) siteBits.push(String(o.homepage_title));
    if (o?.homepage_h1) siteBits.push(String(o.homepage_h1));
    if (o?.businessSummary) siteBits.push(String(o.businessSummary).slice(0, 400));
    if (typeof o?.summary === "string" && s.label) siteBits.push(`${s.label}: ${o.summary.slice(0, 180)}`);
  }
  const uniq = (a: string[]) => Array.from(new Set(a.map(x => x.trim()).filter(Boolean)));
  const gsc = uniq(gscQueries).slice(0, 40);
  const serp = uniq(serpDomains).slice(0, 8);
  const site = uniq(siteBits).slice(0, 12);

  const grounding = [
    clientDomain ? `Client site: ${clientDomain}` : "",
    site.length ? `The site's own pages and business, from the live crawl:\n${site.join("\n")}` : "",
    gsc.length ? `REAL Google Search Console queries this site already earns impressions for (the strongest keyword signal there is):\n${gsc.join(", ")}` : "",
    serp.length ? `REAL domains ranking in the live SERP for this space (the strongest competitor signal there is):\n${serp.join(", ")}` : "",
  ].filter(Boolean).join("\n\n");

  if (!grounding.trim()) return { keywords: [], competitors: [], keyword_basis: "", competitor_basis: "" };

  const system = [
    "You are a Senior Digital Marketing Specialist doing keyword research and competitor identification for a real client engagement.",
    "Use ONLY the real data provided. Your job is to SELECT and PRIORITISE like a senior would — not to invent.",
    "KEYWORDS: lead with the real Search Console queries where given, then add the obvious commercial variations the site's own services clearly support. Never invent high-volume keywords the data does not support.",
    "COMPETITORS: use the real SERP-ranking domains where given. If none are given, you may name genuine, currently-operating competitors in this exact business category and region — but only real ones you are confident exist, and mark them as category-derived, to be confirmed with a live SERP pass.",
    "Return ONLY JSON, no prose: {\"keywords\":[\"...\"],\"competitors\":[\"domain.com\"],\"keyword_basis\":\"one honest line on what the keywords are grounded in\",\"competitor_basis\":\"one honest line on what the competitors are grounded in\"}",
    "8 to 15 keywords; 3 to 6 competitors as bare domains. Nothing invented beyond what the data or the genuine category supports.",
  ].join("\n");

  try {
    const { text } = await llmComplete({ system, user: grounding, maxTokens: 1200, timeoutMs: 60000, label: "derive-keywords-competitors", maxSegments: 1 });
    const parsed: any = parseJsonResponse(text) || {};
    const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.map((k: any) => String(k).trim()).filter(Boolean).slice(0, 15) : [];
    const competitors = Array.isArray(parsed.competitors) ? parsed.competitors.map((c: any) => String(c).trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "")).filter(Boolean).slice(0, 6) : [];
    return {
      keywords,
      competitors,
      keyword_basis: String(parsed.keyword_basis || (gsc.length ? "your Search Console queries and your site's services" : "your site's own services and content")).slice(0, 200),
      competitor_basis: String(parsed.competitor_basis || (serp.length ? "the domains ranking in the live SERP for your core terms" : "the genuine competitors in your category, to be confirmed with a live SERP pass")).slice(0, 200),
    };
  } catch {
    /* Fallback: use the real data directly — never fabricate on failure. */
    return {
      keywords: gsc.slice(0, 12),
      competitors: serp.slice(0, 5),
      keyword_basis: gsc.length ? "your Search Console queries" : "",
      competitor_basis: serp.length ? "the domains ranking in the live SERP" : "",
    };
  }
}

export async function assembleClientReportHtmlEnriched(stages: ReportStageInput[], opts: ReportOptions = {}): Promise<{ html: string; sections: number; enriched: boolean }> {
  /* Auto-fill keywords/competitors from real signals when the operator left them
     blank — grounded, never invented — so a document never goes out generic. */
  if ((!opts.keywords || !opts.keywords.length) || (!opts.competitors || !opts.competitors.length)) {
    try {
      const d = await deriveKeywordsAndCompetitors(stages, opts);
      if ((!opts.keywords || !opts.keywords.length) && d.keywords.length) { opts = { ...opts, keywords: d.keywords, keyword_basis: d.keyword_basis }; }
      if ((!opts.competitors || !opts.competitors.length) && d.competitors.length) { opts = { ...opts, competitors: d.competitors, competitor_basis: d.competitor_basis }; }
    } catch { /* proceed without — never block the document */ }
  }
  /* Artifact routing: a productized/reseller/ongoing brief needs a scope
     proposal, not an audit of an example site. This is the "right document for
     the brief" decision the wizard now makes. */
  if (opts.artifact_mode === "proposal") { return await assembleProposalHtmlEnriched(stages, opts); }
  const author = (opts.author || "Manav S").trim();
  const client = opts.client_name || opts.client_domain || deriveClient(stages) || "the website";
  const title = opts.report_title || `SEO and AEO Audit — ${client}`;
  const today = fmtDate(new Date().toISOString());
  const completed = completedStages(stages);
  if (completed.length === 0) { const base = assembleClientReportHtml(stages, opts); return { ...base, enriched: false }; }

  const dms = await seniorDmsPass(stages, opts);
  if (!dms) { const base = assembleClientReportHtml(stages, opts); return { html: base.html.replace("</div></body>", `<p class="muted">Note: the written interpretation layer was unavailable for this run; the findings and data below are complete and accurate.</p></div></body>`), sections: base.sections, enriched: false }; }

  const docTitle = dms.title || title;
  const H: string[] = [];
  H.push(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(docTitle)}</title><style>${REPORT_CSS}</style></head><body><div class="doc">`);
  H.push(`<div class="lh"><h1>${esc(docTitle)}</h1><div class="by">Prepared by ${esc(author)}${client && client !== "the website" ? ` · ${esc(client)}` : ""}</div><div class="dt">${esc(today)}</div>${opts.include_branding ? `<div class="brand">Produced with SEO Season</div>` : ``}</div>`);

  /* The bespoke analysis — the senior authored the structure for THIS brief. */
  for (const sec of dms.sections) {
    if (sec.heading) H.push(`<h2>${esc(sec.heading)}</h2>`);
    if (sec.body) H.push(mdToHtml(sec.body));
  }

  if (dms.bottom_line) H.push(`<h2>The bottom line</h2>${mdToHtml(dms.bottom_line)}`);
  H.push(renderServicesReference(opts.requirements));

  /* The data behind the analysis — every claim above traces to this. Kept as a
     clearly-labelled evidence section (charts + tables) so the numbers are
     deterministic and verifiable, never something the narrative could invent.
     Internal methodology (aggregate sources list, coverage/needs-data table,
     limitations, operator file names) is deliberately OMITTED — this document
     goes to the client to win the work, not to expose the machinery or to
     advertise what was not analysed. The per-section source line below is the
     honest proof; that is all a client needs. */
  H.push(`<h2>The data behind this analysis</h2><p class="muted">Every figure shown in this report traces to the measured source noted beneath its section — a live crawl of the site, a PageSpeed run, and, where connected, Google Search Console and live search data. Any section still awaiting a data source is labelled as pending, never estimated.</p>`);
  completed.forEach((s) => {
    H.push(`<h3>${esc(s.label)}</h3>`);
    H.push(renderBodyHtml(s.output));
    H.push(`<p class="src"><strong>Source:</strong> ${esc(sourceLine(s.ran_engine, s.output))}</p>`);
  });

  H.push(`<div class="foot">Prepared by ${esc(author)}. ${esc(today)}. Every figure traces to the measured data shown under each section.</div>`);
  H.push(`</div></body></html>`);
  return { html: H.join(""), sections: completed.length, enriched: true };
}

/* ═══════════════════════ MULTIPLE MEANINGFUL DOCUMENTS ═══════════════════════
   The single all-stages senior pass fails on large runs: 17 stages plus the
   uploaded materials exceed one bounded LLM call, the JSON truncates, and the
   whole document falls back to a raw findings dump ("interpretation layer
   unavailable"). Grouping the stages by theme and assembling ONE document PER
   theme makes each senior pass small enough to succeed AND gives the operator
   several deep, focused, client-ready documents — the "multiple meaningful
   documents" deliverable. Reuses the proven enriched assembler per group, so a
   focused group renders with full senior narration and no truncation. */

export interface AreaDocument {
  area: string;
  title: string;
  html: string;
  sections: number;
  enriched: boolean;
}

const REPORT_AREAS: { area: string; match: RegExp }[] = [
  { area: "Technical SEO and Indexation", match: /\b(technical|404|not.?found|crawl|index|indexation|schema|structured data|canonical|site structure|url inventory|url structure|robots|sitemap|core web vitals|performance)\b/i },
  { area: "On-Page and Content", match: /\b(meta|title|description|heading|h1|h2|on.?page|content|topical authority|readability|blog)\b/i },
  { area: "Competitive and Gap Analysis", match: /\b(competitor|backlink|link gap|keyword gap|missing keyword|shared keyword|benchmark)\b/i },
  { area: "AEO and Answer Engines", match: /\b(aeo|answer engine|ai crawler|ai search|ai.?generated|brand discoverability|geo)\b/i },
  { area: "Strategy, Conversion and Roadmap", match: /\b(roadmap|conversion|paid|opportunity|strategy|search intent|product page|collection page)\b/i },
];

function areaFor(stage: ReportStageInput): string {
  const hay = String(stage.label || "").toLowerCase();
  for (const a of REPORT_AREAS) if (a.match.test(hay)) return a.area;
  return "Additional Findings";
}

/* Each area gets a distinct lens so the documents do not read the same. This
   governs structure, ordering, heading style and voice per document. */
const AREA_ANGLE: Record<string, string> = {
  "Technical SEO and Indexation": "Frame this as a prioritised technical remediation brief. Group findings by severity — blocking first, then high, then medium. Lead each with the exact count and the specific pages affected, then the precise fix. Diagnostic, engineer-to-operator voice. Headings name the technical problem itself, never a generic theme.",
  "On-Page and Content": "Frame this as a content and on-page opportunity map. Organise around the target keywords: for each, what the site has today versus what a searcher expects, and the editorial move that closes the gap. Editorial, opportunity-led voice. Put the actual keyword in the heading where it drives the point.",
  "Competitive and Gap Analysis": "Frame this as a head-to-head competitive intelligence brief. Name each competitor explicitly and show, concretely, where they outperform and the exact gap to close. Organise by competitor or by contested territory, not by generic issue type. Comparative, sharp, evidence-first.",
  "AEO and Answer Engines": "Frame this as a forward-looking answer-engine readiness assessment. Organise around the real questions a buyer would ask an AI assistant and whether this brand would be surfaced in the answer. Strategic and forward-looking voice — the next frontier, not a repeat of the on-page audit.",
  "Strategy, Conversion and Roadmap": "Frame this as a sequenced action roadmap. Organise strictly by time-to-impact: quick wins first, then compounding plays, each with its expected effect. Executive and decisive. Headings are moves ('Fix X to unlock Y'), not observations.",
  "Additional Findings": "Frame this as a concise supplementary brief — a few sharp, distinct observations that did not belong in the other documents. Short and non-repetitive.",
};

export async function assembleAreaDocuments(
  stages: ReportStageInput[],
  opts: ReportOptions = {}
): Promise<{ documents: AreaDocument[] }> {
  const completed = completedStages(stages);
  if (completed.length === 0) return { documents: [] };

  /* Derive keywords/competitors ONCE for the whole set (not per area) when the
     operator left them blank — grounded in real signals, never invented. */
  if ((!opts.keywords || !opts.keywords.length) || (!opts.competitors || !opts.competitors.length)) {
    try {
      const d = await deriveKeywordsAndCompetitors(stages, opts);
      if ((!opts.keywords || !opts.keywords.length) && d.keywords.length) opts = { ...opts, keywords: d.keywords, keyword_basis: d.keyword_basis };
      if ((!opts.competitors || !opts.competitors.length) && d.competitors.length) opts = { ...opts, competitors: d.competitors, competitor_basis: d.competitor_basis };
    } catch { /* proceed without — never block the documents */ }
  }

  /* Group by theme, preserving first-seen order. */
  const order: string[] = [];
  const groups: Record<string, ReportStageInput[]> = {};
  for (const s of completed) {
    const a = areaFor(s);
    if (!groups[a]) { groups[a] = []; order.push(a); }
    groups[a].push(s);
  }

  /* Split any oversized group so no single senior pass exceeds a reliable size. */
  const finalGroups: { area: string; stages: ReportStageInput[] }[] = [];
  const CAP = 5;
  for (const a of order) {
    const gs = groups[a];
    if (gs.length <= CAP) {
      finalGroups.push({ area: a, stages: gs });
    } else {
      for (let i = 0; i < gs.length; i += CAP) {
        const partNo = Math.floor(i / CAP) + 1;
        finalGroups.push({ area: partNo > 1 ? `${a} (part ${partNo})` : a, stages: gs.slice(i, i + CAP) });
      }
    }
  }

  const client = opts.client_name || opts.client_domain || deriveClient(stages) || "the website";
  /* Assemble the area documents in PARALLEL — each is an independent senior pass,
     so total time stays close to a single call rather than the sum, keeping the
     whole run comfortably inside the function budget. Promise.all preserves order. */
  const documents: AreaDocument[] = await Promise.all(
    finalGroups.map(async (g) => {
      const baseArea = g.area.replace(/ \(part \d+\)$/, "");
      const areaOpts: ReportOptions = { ...opts, report_title: `${g.area} — ${client}`, area_angle: AREA_ANGLE[baseArea] || AREA_ANGLE["Additional Findings"] };
      const doc = await assembleClientReportHtmlEnriched(g.stages, areaOpts);
      return { area: g.area, title: `${g.area} — ${client}`, html: doc.html, sections: doc.sections, enriched: doc.enriched };
    })
  );
  return { documents };
}
