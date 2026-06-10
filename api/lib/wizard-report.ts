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
  return ["_This section produced structured data; see the attached detail._"];
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
