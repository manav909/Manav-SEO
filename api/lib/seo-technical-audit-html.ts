/* ════════════════════════════════════════════════════════════════════════
   seo-technical-audit-html.ts  (Phase 16.11)

   HTML rendering of the deep technical SEO audit report. Mirrors the
   structure of seo-technical-audit-deep-report.ts (markdown) but emits
   semantic HTML with embedded CSS so the document survives:

     • Download as .html → open in browser
     • Open in Word (Word imports HTML cleanly with real heading styles,
       native tables, hyperlinks, etc.) → save as .docx
     • Print → PDF (via browser print-to-PDF) with @page rules for headers,
       footers, page numbers, page breaks
     • Email attachment → renders identically across mail clients that
       support HTML

   Design principles (Phase 16.11, Manav 2026-05-24 night):

   1. SELF-CONTAINED. No external CSS, no remote fonts, no remote images.
      The HTML carries everything it needs. A client opening the file in
      an airgapped network gets the same output as someone online.

   2. CLICKABLE INTERNAL ANCHORS. Every §-ID becomes an anchor (id="s3-1");
      every cross-reference becomes <a href="#s3-1">. The "any reader can
      trace any claim back to its source" promise survives format conversion.

   3. PRINT-OPTIMIZED. @page CSS controls margins, headers, footers, page
      numbers. Major sections get page-break-before. Findings get
      page-break-inside: avoid where reasonable.

   4. SEVERITY-ROBUST. Severity isn't communicated by emoji alone — every
      badge has text + color + border. Monochrome printing still reads.
      Foundational fixes get a heavier visual treatment.

   5. CRITICAL-PATH DIAGRAM IN CSS, not ASCII. The §7.2 flow renders as
      styled boxes with arrows. ASCII art looks broken in proportional
      fonts (Word default); CSS boxes don't.

   6. RAW EVIDENCE COLLAPSED BY DEFAULT. <details> elements default
      closed. The client read is clean; the senior-DMS review can open
      individual evidence dumps. In print, the renderer can force them
      open via a query param or by removing the `closed` attribute.

   Architecture:

   Same inputs as renderDeepAuditReport (the markdown renderer):
   DeepReportInputs is the contract; HTML/markdown are two views.

   When runTechnicalAudit produces an audit, it should call BOTH renderers
   and store BOTH outputs (markdown in seo_campaign_reports.body_md, HTML
   in seo_campaign_reports.body_html). The reader can choose which to
   view/download.
════════════════════════════════════════════════════════════════════════ */

import type { Finding } from "./seo-technical-audit.js";
import {
  type DeepReportInputs,
  type FindingWithId,
  assignFindingIds,
  ctrFinding,
  keywordPresenceFinding,
  firstParagraphFinding,
  paaGapFinding,
  diffuseIntentFinding,
  competitiveContentFinding,
  perPageGa4Finding,
  zeroConversionFinding,
  contentFreshnessFinding,
  imageOptFindings,
  anchorTextFinding,
  schemaFinding,
  cwvFindings,
  metaDescFinding,
  titleFinding,
  h1Finding,
  wordCountFinding,
  canonicalFinding,
  indexabilityFindings,
  internalLinksCountFinding,
  hreflangFinding,
  queryDistributionFinding,
  foundationalFinding,
  collectCrossRefs,
  paaQuestionBodyGuidance,
  trustBandForSource,
  findingSourceLabel,
  findingConfidence,
  num,
  dollars,
  clip,
} from "./seo-technical-audit-deep-report.js";

/* ════════════════════════════════════════════════════════════════════════
   PUBLIC API
════════════════════════════════════════════════════════════════════════ */

/** Produce a self-contained HTML document from DeepReportInputs.
 *  Same inputs as renderDeepAuditReport. Use both in parallel. */
export function renderDeepAuditReportHtml(I: DeepReportInputs): string {
  const findingMap = assignFindingIds(I.findings);
  const parts: string[] = [];

  parts.push(renderHtmlHead(I));
  parts.push(`<body>`);
  parts.push(`<div class="page-wrap">`);
  parts.push(renderCoverPage(I));
  parts.push(renderTocHtml(I, findingMap));
  parts.push(renderExecSummaryHtml(I, findingMap));    // §0
  parts.push(renderPageInventoryHtml(I, findingMap));  // §1
  parts.push(renderSearchPerfHtml(I, findingMap));     // §2
  parts.push(renderFindingsHtml(I, findingMap));       // §3
  parts.push(renderConvergenceHtml(I, findingMap));    // §4
  parts.push(renderEconomicsHtml(I, findingMap));      // §5
  parts.push(renderRecommendationsHtml(I, findingMap)); // §6
  parts.push(renderEffortMapHtml(I, findingMap));      // §7
  parts.push(renderBusinessImpactHtml(I, findingMap)); // §8
  parts.push(renderSourceTrustHtml(I, findingMap));    // §9
  parts.push(renderGlossaryHtml(I, findingMap));       // §10
  parts.push(renderMethodologyHtml(I, findingMap));    // §11
  parts.push(`</div>`); // .page-wrap
  parts.push(`</body>`);
  parts.push(`</html>`);

  return parts.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
   HTML PRIMITIVES — escape, anchor IDs, severity badges, xrefs
════════════════════════════════════════════════════════════════════════ */

/** HTML-escape a string. Used for ALL user-controlled / finding-controlled
 *  text that goes into HTML output. Skipping this lets XSS through if a
 *  finding ever carries `<script>` in its title (unlikely from current
 *  audit code, but the discipline matters). */
function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Convert a §-ID like "3.1" or "6.2.1.4" into a CSS-safe HTML element ID.
 *  HTML5 allows dots in ids but some selectors break, so we replace
 *  with hyphens. "3.1" → "s3-1", "6.2.1.4" → "s6-2-1-4". */
function anchorId(sectionId: string): string {
  return 's' + sectionId.replace(/\./g, '-');
}

/** Render a severity badge with both color and text — accessibility-safe,
 *  print-safe, screen-reader-friendly. */
function sevBadge(severity: Finding['severity']): string {
  const labels: Record<Finding['severity'], string> = {
    red: 'Critical', amber: 'Warning', green: 'Pass', info: 'Info',
  };
  return `<span class="sev sev-${esc(severity)}">${labels[severity]}</span>`;
}

/** Inline cross-reference: <a href="#s3-1">§3.1 — Title</a>. Returns
 *  empty string if the finding ref is null (graceful in templates). */
function xrefHtml(fi: FindingWithId | null, opts?: { short?: boolean }): string {
  if (!fi) return '';
  const id = anchorId(fi.id);
  const text = opts?.short
    ? `§${esc(fi.id)}`
    : `§${esc(fi.id)} — ${esc(fi.finding.finding_title)}`;
  return `<a class="xref" href="#${id}">${text}</a>`;
}

/** Render a section anchor for an §-ID — places a marker so cross-refs land
 *  cleanly when the user clicks. Sub-h2 sections (§0.1, §3.4 etc.) use this. */
function sectionAnchor(sectionId: string, title: string, level: 2 | 3 | 4 | 5, opts?: { classes?: string; idOverride?: string }): string {
  const id = opts?.idOverride || anchorId(sectionId);
  const tag = `h${level}`;
  const cls = opts?.classes ? ` class="${opts.classes}"` : '';
  return `<${tag} id="${id}"${cls}>${title}</${tag}>`;
}

/** Format a value-or-em-dash for table cells. */
function val(v: unknown, suffix = ''): string {
  if (v === null || v === undefined || v === '') return '—';
  return esc(String(v)) + (suffix ? ' ' + suffix : '');
}

/* ════════════════════════════════════════════════════════════════════════
   HEAD — meta tags, embedded CSS, print rules
════════════════════════════════════════════════════════════════════════ */

function renderHtmlHead(I: DeepReportInputs): string {
  const title = `Technical SEO Audit — ${cleanUrlForDisplay(I.url)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="SEO Season — Technical Audit (deep-doc)">
<meta name="audit-run-id" content="${esc(I.run_id)}">
<meta name="audit-keyword" content="${esc(I.keyword)}">
<title>${esc(title)}</title>
<style>
${baseStyles()}
${printStyles()}
</style>
</head>`;
}

/** Truncate the URL for display headers — full URL appears on cover page. */
function cleanUrlForDisplay(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 40 ? u.pathname.slice(0, 37) + '…' : u.pathname;
    return u.hostname + path;
  } catch {
    return url;
  }
}

function baseStyles(): string {
  return `
/* Reset + base */
* { box-sizing: border-box; }
html { font-size: 14px; }
body {
  font-family: Georgia, "Times New Roman", "Liberation Serif", serif;
  line-height: 1.6;
  color: #1f2937;
  background: #ffffff;
  margin: 0;
  padding: 0;
}
.page-wrap {
  max-width: 920px;
  margin: 0 auto;
  padding: 32px 36px 64px;
}

/* Typography */
h1, h2, h3, h4, h5 {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #0f172a;
}
h1 { font-size: 28px; margin: 0 0 12px; line-height: 1.2; }
h2 { font-size: 22px; margin: 40px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
h3 { font-size: 17px; margin: 28px 0 10px; color: #1e293b; }
h4 { font-size: 14px; margin: 18px 0 8px; color: #334155; }
h5 { font-size: 13px; margin: 14px 0 6px; color: #475569; font-weight: 500; }
p { margin: 0 0 12px; }
em { color: #475569; }
strong { color: #0f172a; }

/* Links */
a { color: #2563eb; text-decoration: none; }
a:hover { text-decoration: underline; }
a.xref {
  color: #1d4ed8;
  text-decoration: none;
  border-bottom: 1px dotted #93c5fd;
  padding: 0 1px;
  background-color: #eff6ff20;
}
a.xref:hover { background-color: #dbeafe; text-decoration: none; border-bottom-style: solid; }
a.url-display { word-break: break-all; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.92em; }

/* Severity badges */
.sev {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  margin-right: 6px;
  vertical-align: middle;
}
.sev-red    { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
.sev-amber  { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
.sev-green  { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.sev-info   { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }

/* Foundational marker */
.foundational-badge {
  display: inline-block;
  background: #fef3c7;
  color: #92400e;
  border: 2px solid #d97706;
  padding: 3px 10px;
  border-radius: 4px;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-right: 6px;
  font-family: -apple-system, system-ui, sans-serif;
}

/* Code + monospace */
code {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.88em;
  background: #f1f5f9;
  padding: 1px 5px;
  border-radius: 3px;
  color: #0f172a;
}
pre {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  padding: 14px 16px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
pre code { background: transparent; padding: 0; font-size: inherit; }

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 14px 0;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
thead th {
  background: #f8fafc;
  text-align: left;
  padding: 9px 10px;
  border-bottom: 2px solid #cbd5e1;
  font-weight: 600;
  color: #0f172a;
}
tbody td {
  padding: 7px 10px;
  border-bottom: 1px solid #e5e7eb;
  vertical-align: top;
}
tbody tr:nth-child(even) td { background: #fafbfc; }
tbody tr.cluster-signal td {
  background: #fef3c7;
  font-weight: 600;
}

/* Lists */
ul, ol { margin: 8px 0 14px; padding-left: 24px; }
li { margin: 4px 0; }
li > ul, li > ol { margin: 4px 0; }

/* Cover page */
.cover {
  min-height: 95vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 60px 40px;
  page-break-after: always;
  border-bottom: 1px solid transparent;
}
.cover-title {
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 8px;
  color: #0f172a;
}
.cover-subtitle {
  font-size: 14px;
  color: #64748b;
  margin: 0 0 28px;
  font-family: -apple-system, system-ui, sans-serif;
}
.cover-url {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
  color: #1e293b;
  background: #f1f5f9;
  padding: 10px 18px;
  border-radius: 4px;
  word-break: break-all;
  max-width: 700px;
  margin: 4px 0 20px;
  border: 1px solid #e2e8f0;
}
.cover-keyword {
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
  margin: 8px 0;
  font-family: -apple-system, system-ui, sans-serif;
}
.cover-keyword code {
  background: #fef3c7;
  color: #92400e;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid #fde68a;
  font-size: 18px;
}
.cover-severity {
  display: flex;
  gap: 16px;
  margin: 32px 0 16px;
  flex-wrap: wrap;
  justify-content: center;
}
.cover-severity-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 18px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  min-width: 80px;
}
.cover-severity-count {
  font-size: 22px;
  font-weight: 700;
  font-family: -apple-system, system-ui, sans-serif;
  line-height: 1;
}
.cover-severity-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin-top: 4px;
  font-family: -apple-system, system-ui, sans-serif;
}
.cov-sev-red    .cover-severity-count { color: #b91c1c; }
.cov-sev-amber  .cover-severity-count { color: #b45309; }
.cov-sev-green  .cover-severity-count { color: #15803d; }
.cov-sev-info   .cover-severity-count { color: #1e40af; }
.cover-meta {
  font-size: 11px;
  color: #64748b;
  margin-top: 24px;
  font-family: -apple-system, system-ui, sans-serif;
  line-height: 1.8;
}
.cover-meta strong { color: #0f172a; }
.cover-meta code { font-size: 10px; }
.cover-confidence {
  font-size: 12px;
  margin-top: 16px;
  padding: 8px 16px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 4px;
  color: #166534;
  font-family: -apple-system, system-ui, sans-serif;
}

/* TOC */
.toc {
  margin: 28px 0 40px;
  padding: 20px 24px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  page-break-after: always;
}
.toc h2 {
  margin: 0 0 12px;
  border-bottom: none;
  padding-bottom: 0;
  font-size: 18px;
}
.toc-list { list-style: none; padding-left: 0; margin: 0; column-count: 1; }
.toc-list li { margin: 5px 0; font-size: 13px; font-family: -apple-system, system-ui, sans-serif; }
.toc-list .toc-l1 { font-weight: 600; margin-top: 10px; }
.toc-list .toc-l2 { padding-left: 18px; font-size: 12px; color: #475569; }
.toc-list a { color: #1e40af; text-decoration: none; }
.toc-list a:hover { text-decoration: underline; }

/* Diagnosis / callout boxes */
.callout {
  margin: 14px 0;
  padding: 14px 18px;
  border-radius: 0 4px 4px 0;
  background: #f8fafc;
  border-left: 4px solid #cbd5e1;
}
.callout.callout-diagnosis { background: #fef2f2; border-left-color: #dc2626; }
.callout.callout-revenue { background: #ecfdf5; border-left-color: #059669; }
.callout.callout-converging { background: #fffbeb; border-left-color: #d97706; }
.callout p:last-child { margin-bottom: 0; }

/* Findings */
.finding {
  margin: 22px 0;
  padding: 16px 18px 16px 22px;
  border-left: 4px solid #e5e7eb;
  background: #fafbfc;
  border-radius: 0 4px 4px 0;
  page-break-inside: avoid;
}
.finding-red    { border-left-color: #dc2626; }
.finding-amber  { border-left-color: #d97706; }
.finding-green  { border-left-color: #16a34a; background: #fafbfc; }
.finding-info   { border-left-color: #2563eb; }
.finding-foundational {
  border-left-color: #d97706;
  border-left-width: 6px;
  background: #fffbeb;
  padding: 18px 22px;
}
.finding h3 { margin-top: 0; }
.finding-meta {
  font-size: 12px;
  color: #475569;
  margin: 0 0 12px;
  font-family: -apple-system, system-ui, sans-serif;
}
.finding-meta code { font-size: 11px; }
.finding-section-label {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  margin: 14px 0 4px;
  font-family: -apple-system, system-ui, sans-serif;
  font-weight: 600;
}
.finding-detail-pre {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: inherit;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  line-height: inherit;
}
.foundational-callout {
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 4px;
  padding: 10px 14px;
  margin: 10px 0 14px;
  font-size: 13px;
}

/* Cross-refs block on a finding */
.xrefs-block { margin: 10px 0 0; padding: 0; list-style: none; }
.xrefs-block li {
  margin: 4px 0;
  padding-left: 16px;
  position: relative;
  font-size: 13px;
}
.xrefs-block li::before {
  content: "→";
  position: absolute;
  left: 0;
  color: #94a3b8;
}

/* Raw evidence details */
details.evidence {
  margin: 12px 0 0;
  font-size: 13px;
  font-family: -apple-system, system-ui, sans-serif;
}
details.evidence > summary {
  cursor: pointer;
  font-weight: 500;
  color: #475569;
  padding: 4px 0;
  user-select: none;
}
details.evidence > summary::marker { color: #94a3b8; }
details.evidence > summary:hover { color: #1e293b; }
details.evidence[open] > summary { margin-bottom: 6px; }
details.evidence > pre { margin: 6px 0 0; }

/* Critical path diagram (CSS-only replacement for the ASCII art) */
.critical-path {
  margin: 18px 0;
  padding: 20px 24px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}
.critical-path-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 8px 0;
}
.cp-phase {
  display: inline-flex;
  align-items: center;
  padding: 8px 14px;
  background: #ffffff;
  border: 2px solid #cbd5e1;
  border-radius: 6px;
  font-weight: 600;
  font-size: 12px;
  color: #0f172a;
  font-family: -apple-system, system-ui, sans-serif;
  white-space: nowrap;
}
.cp-phase-1 { border-color: #d97706; background: #fffbeb; }
.cp-phase-2 { border-color: #2563eb; background: #eff6ff; }
.cp-phase-3 { border-color: #16a34a; background: #f0fdf4; }
.cp-phase-final { border-color: #475569; background: #f1f5f9; }
.cp-arrow { font-size: 20px; color: #94a3b8; font-family: -apple-system, system-ui, sans-serif; }
.cp-parallel-block {
  margin-top: 12px;
  padding-top: 14px;
  border-top: 1px dashed #cbd5e1;
}
.cp-parallel-block .cp-parallel-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #475569;
  margin-bottom: 8px;
  font-family: -apple-system, system-ui, sans-serif;
  font-weight: 600;
}
.cp-parallel-block ul { margin: 4px 0 0 0; padding-left: 22px; }
.cp-parallel-block li {
  font-size: 12px;
  color: #475569;
  margin: 4px 0;
  font-family: -apple-system, system-ui, sans-serif;
}
.cp-bottleneck {
  margin-top: 14px;
  padding: 10px 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 4px;
  font-size: 13px;
  color: #b91c1c;
  font-family: -apple-system, system-ui, sans-serif;
}
.cp-bottleneck strong { color: #991b1b; }

/* Section dividers */
hr {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 32px 0;
}

/* Footer */
.report-footer {
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
  font-size: 11px;
  color: #64748b;
  text-align: center;
  font-family: -apple-system, system-ui, sans-serif;
}

/* Section intros */
.section-intro {
  font-size: 13px;
  color: #475569;
  font-style: italic;
  margin: 4px 0 18px;
}

/* Cluster signal in §4.1 needs visual prominence */
.signal-cluster-row { background: #fef3c7 !important; font-weight: 700; }
`;
}

function printStyles(): string {
  return `
/* Print-only rules — browser print-to-PDF + Word "Open HTML" use these */
@media print {
  @page {
    size: A4;
    margin: 18mm 16mm 22mm 16mm;
  }
  html { font-size: 11pt; }
  body { padding: 0; margin: 0; background: #ffffff; }
  .page-wrap { max-width: 100%; padding: 0; }
  /* Force a page break before each h2 (top-level §-section) for clean
     visual separation in the PDF. The first h2 (cover or exec summary)
     suppresses this. */
  h2 { page-break-before: always; }
  h2:first-of-type { page-break-before: avoid; }
  /* Findings should not split across pages where possible */
  .finding { page-break-inside: avoid; }
  /* Tables: don't split a row across pages */
  tr { page-break-inside: avoid; }
  /* Always render <details> content even when closed — print readers
     can't click to expand. Senior DMS review use case opens individual
     details; print-for-client use case shows everything inline. */
  details.evidence > summary { display: none; }
  details.evidence > *:not(summary) { display: block !important; }
  /* Critical-path diagram should never split */
  .critical-path { page-break-inside: avoid; }
  /* Suppress hover styles in print */
  a:hover, a.xref:hover { background-color: transparent; border-bottom-style: dotted; }
  /* Cover is one page */
  .cover { min-height: auto; height: auto; padding: 60px 30px; }
  .toc { page-break-after: always; background: transparent; border: none; padding: 0; }
}
`;
}

/* ════════════════════════════════════════════════════════════════════════
   COVER PAGE
════════════════════════════════════════════════════════════════════════ */

function renderCoverPage(I: DeepReportInputs): string {
  const date = new Date(I.audited_at);
  const dateStr = date.toISOString().split('T')[0];
  const timeStr = date.toUTCString().split(' ').slice(4, 5).join('') + ' UTC';
  return `
<section class="cover">
  <h1 class="cover-title">Technical SEO Audit</h1>
  <p class="cover-subtitle">Deep diagnostic report · single source of truth · cross-referenced</p>
  <div class="cover-url"><a class="url-display" href="${esc(I.url)}">${esc(I.url)}</a></div>
  <p class="cover-keyword">Campaign keyword: <code>${esc(I.keyword)}</code></p>
  <div class="cover-severity">
    <div class="cover-severity-item cov-sev-red"><span class="cover-severity-count">${I.red_count}</span><span class="cover-severity-label">Critical</span></div>
    <div class="cover-severity-item cov-sev-amber"><span class="cover-severity-count">${I.amber_count}</span><span class="cover-severity-label">Warning</span></div>
    <div class="cover-severity-item cov-sev-green"><span class="cover-severity-count">${I.green_count}</span><span class="cover-severity-label">Pass</span></div>
    <div class="cover-severity-item cov-sev-info"><span class="cover-severity-count">${I.info_count}</span><span class="cover-severity-label">Info</span></div>
  </div>
  <div class="cover-confidence">Weighted confidence: <strong>${I.confidence.weighted_mean}/100</strong> across ${I.confidence.sourced_count} sourced finding(s)</div>
  <div class="cover-meta">
    <div><strong>Audited at:</strong> ${esc(dateStr)} ${esc(timeStr)}</div>
    <div><strong>Target URL source:</strong> ${esc(I.source)}${I.source_note ? ' · ' + esc(I.source_note) : ''}</div>
    <div><strong>Audit run id:</strong> <code>${esc(I.run_id)}</code></div>
    ${I.failed_checks.length > 0 ? `<div style="color:#b91c1c;margin-top:8px;"><strong>⚠ ${I.failed_checks.length} check(s) failed to execute:</strong> ${I.failed_checks.map(c => '<code>' + esc(c) + '</code>').join(', ')}</div>` : ''}
  </div>
</section>`;
}

/* ════════════════════════════════════════════════════════════════════════
   TABLE OF CONTENTS
════════════════════════════════════════════════════════════════════════ */

function renderTocHtml(I: DeepReportInputs, m: FindingWithId[]): string {
  const lines: string[] = [];
  lines.push(`<nav class="toc" id="toc">`);
  lines.push(`<h2>Table of Contents</h2>`);
  lines.push(`<ul class="toc-list">`);
  lines.push(`<li class="toc-l1"><a href="#s0">§0 — Executive Summary</a></li>`);
  lines.push(`<li class="toc-l1"><a href="#s1">§1 — Page Inventory</a> <span style="color:#94a3b8;font-weight:400;">(current state)</span></li>`);
  lines.push(`<li class="toc-l1"><a href="#s2">§2 — Search Performance Baseline</a></li>`);
  lines.push(`<li class="toc-l1"><a href="#s3">§3 — Findings (${m.length} total)</a></li>`);
  /* Per-finding sub-toc — keep concise: severity icon + title clip */
  for (const fi of m) {
    const sev = fi.finding.severity;
    const sevIcon = sev === 'red' ? '●' : sev === 'amber' ? '◆' : sev === 'green' ? '✓' : 'ⓘ';
    const sevCol = sev === 'red' ? '#dc2626' : sev === 'amber' ? '#d97706' : sev === 'green' ? '#16a34a' : '#2563eb';
    const fnd = fi.finding.is_foundational ? ' <span class="foundational-badge" style="font-size:9px;padding:1px 6px;">Foundational</span>' : '';
    lines.push(`<li class="toc-l2"><span style="color:${sevCol};font-weight:700;">${sevIcon}</span> <a href="#${anchorId(fi.id)}">§${esc(fi.id)} — ${esc(clip(fi.finding.finding_title, 90))}</a>${fnd}</li>`);
  }
  lines.push(`<li class="toc-l1"><a href="#s4">§4 — Convergence Analysis</a></li>`);
  lines.push(`<li class="toc-l1"><a href="#s5">§5 — SEO Economics Context</a></li>`);
  lines.push(`<li class="toc-l1"><a href="#s6">§6 — Recommendations</a></li>`);
  lines.push(`<li class="toc-l2"><a href="#s6-1">§6.1 Phase 1: Foundational</a></li>`);
  lines.push(`<li class="toc-l2"><a href="#s6-2">§6.2 Phase 2: Content overhaul</a></li>`);
  lines.push(`<li class="toc-l2"><a href="#s6-3">§6.3 Phase 3: Validation & parallel</a></li>`);
  lines.push(`<li class="toc-l1"><a href="#s7">§7 — Effort & Dependency Map</a></li>`);
  lines.push(`<li class="toc-l1"><a href="#s8">§8 — Business Impact Model</a></li>`);
  lines.push(`<li class="toc-l1"><a href="#s9">§9 — Source Trust Map</a></li>`);
  lines.push(`<li class="toc-l1"><a href="#s10">§10 — Glossary</a></li>`);
  lines.push(`<li class="toc-l1"><a href="#s11">§11 — Methodology</a></li>`);
  lines.push(`</ul>`);
  lines.push(`</nav>`);
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
   §0 — EXECUTIVE SUMMARY
════════════════════════════════════════════════════════════════════════ */

function renderExecSummaryHtml(I: DeepReportInputs, m: FindingWithId[]): string {
  const ctr = ctrFinding(m);
  const kw = keywordPresenceFinding(m);
  const diffuse = diffuseIntentFinding(m);
  const zeroConv = zeroConversionFinding(m);
  const foundational = foundationalFinding(m);
  const firstPara = firstParagraphFinding(m);
  const ctrEv = ctr?.finding.evidence || {};
  const kwEv = kw?.finding.evidence || {};
  const businessImpact = ctrEv.business_impact;
  const suggestedPivot = kwEv.inferred_actual_topic?.suggested_keyword_phrase;

  const lines: string[] = [];
  lines.push(`<section id="s0"><h2>§0 — Executive Summary</h2>`);

  /* §0.1 Diagnosis */
  lines.push(`<h3 id="s0-1">§0.1 Diagnosis</h3>`);
  if (kw && ctr) {
    const diagXrefs: FindingWithId[] = [];
    if (foundational) diagXrefs.push(foundational);
    if (ctr && ctr !== foundational) diagXrefs.push(ctr);
    if (firstPara && firstPara !== foundational) diagXrefs.push(firstPara);
    if (diffuse && diffuse !== foundational) diagXrefs.push(diffuse);
    const numberWord = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'][diagXrefs.length] || `${diagXrefs.length}`;
    const xrefList = diagXrefs.map(fi => xrefHtml(fi)).join(', ');
    lines.push(`<div class="callout callout-diagnosis">`);
    lines.push(`<p>This page is targeted at <code>${esc(I.keyword)}</code> but the underlying content is built for <strong>${esc(suggestedPivot || 'a different keyword')}</strong>. ${esc(numberWord)} independent ${diagXrefs.length === 1 ? 'measurement' : 'measurements'} corroborate this diagnosis: ${xrefList}. The convergence is documented in <a class="xref" href="#s4-2">§4.2</a>.</p>`);
    lines.push(`</div>`);
    if (ctrEv.ratio_pct !== undefined && businessImpact) {
      lines.push(`<div class="callout callout-revenue">`);
      lines.push(`<p>The keyword mismatch produces a measurable revenue gap: actual CTR is <strong>${esc(ctrEv.ratio_pct)}%</strong> of expected for position <strong>${esc(ctrEv.position?.toFixed(1))}</strong>, translating to <strong>~${esc(num(businessImpact.missed_clicks))} missed monthly clicks</strong> worth <strong>${esc(dollars(businessImpact.dollar_low, businessImpact.dollar_high))} monthly</strong> at B2B SaaS commercial-page click values. Full business-impact model in <a class="xref" href="#s8">§8</a>.</p>`);
      lines.push(`</div>`);
    }
    if (diffuse) {
      const cats = diffuse.finding.evidence?.distinct_categories;
      if (cats) lines.push(`<p>Compounding: the live SERP for <code>${esc(I.keyword)}</code> spans <strong>${esc(cats)} distinct intent categories</strong> ${xrefHtml(diffuse)}. This is a structurally diffuse SERP — even a #1 ranking competes for click-share against fundamentally different result types. The keyword-pivot recommendation matters more here than on a tight-intent SERP. Industry context in <a class="xref" href="#s5-2">§5.2</a>.</p>`);
    }
  } else if (ctr) {
    lines.push(`<p>CTR underperformance is the primary signal ${xrefHtml(ctr)}. The keyword-presence analysis did not produce a clear pivot recommendation — manually verify whether this is a CTR-tactics problem or a deeper targeting problem before committing to recovery work.</p>`);
  } else {
    lines.push(`<p>The audit produced ${I.red_count} Critical, ${I.amber_count} Warning, ${I.green_count} Pass, and ${I.info_count} Info findings. See <a class="xref" href="#s3">§3</a> for the full finding list; <a class="xref" href="#s6">§6</a> for the sequenced recommendation set.</p>`);
  }

  /* §0.2 Top three actions */
  lines.push(`<h3 id="s0-2">§0.2 Top three actions (in execution order)</h3>`);
  type Action = { lead: string; tail: string };
  const actionItems: Action[] = [];
  if (foundational) {
    actionItems.push({
      lead: foundational.finding.finding_title,
      tail: ` — foundational fix ${xrefHtml(foundational)}. Detail in <a class="xref" href="#s6-1">§6.1</a>.`,
    });
  }
  const paaGap = paaGapFinding(m);
  if (paaGap) {
    const paaCount = paaGap.finding.evidence?.unanswered?.length || paaGap.finding.evidence?.paa_total || 0;
    actionItems.push({
      lead: `Add ${paaCount} new H2 sections answering live PAA questions`,
      tail: ` ${xrefHtml(paaGap)}. Each section needs a 40-80 word direct answer as its first sentence. Detail and per-question briefs in <a class="xref" href="#s6-2-1">§6.2.1</a>.`,
    });
  }
  if (zeroConv) {
    actionItems.push({
      lead: `Verify GA4 conversion tracking`,
      tail: ` ${xrefHtml(zeroConv)}. Zero conversions on ${esc(num(zeroConv.finding.evidence?.sessions))} sessions is either a measurement gap or a real funnel problem — needs analyst diagnosis before any traffic-recovery work pays off. Detail in <a class="xref" href="#s6-3-1">§6.3.1</a>.`,
    });
  }
  if (actionItems.length === 0) {
    const firstRed = m.find(f => f.finding.severity === 'red');
    if (firstRed) actionItems.push({ lead: firstRed.finding.finding_title, tail: ` ${xrefHtml(firstRed)}. See <a class="xref" href="#s6">§6</a> for full sequencing.` });
    else actionItems.push({ lead: 'No Critical-severity actions surfaced', tail: '. See <a class="xref" href="#s6-3">§6.3</a> for Phase-3 parallel work that can still ship.' });
  }
  lines.push(`<ol>`);
  for (const a of actionItems) {
    lines.push(`<li><strong>${esc(a.lead)}</strong>${a.tail}</li>`);
  }
  lines.push(`</ol>`);

  /* §0.3 Severity summary */
  lines.push(`<h3 id="s0-3">§0.3 Severity summary</h3>`);
  lines.push(`<table><thead><tr><th>Severity</th><th style="width:80px;text-align:right;">Count</th></tr></thead><tbody>`);
  lines.push(`<tr><td>${sevBadge('red')} Critical</td><td style="text-align:right;font-weight:600;">${I.red_count}</td></tr>`);
  lines.push(`<tr><td>${sevBadge('amber')} Warning</td><td style="text-align:right;font-weight:600;">${I.amber_count}</td></tr>`);
  lines.push(`<tr><td>${sevBadge('green')} Pass</td><td style="text-align:right;font-weight:600;">${I.green_count}</td></tr>`);
  lines.push(`<tr><td>${sevBadge('info')} Info</td><td style="text-align:right;font-weight:600;">${I.info_count}</td></tr>`);
  lines.push(`</tbody></table>`);

  /* §0.4 Source confidence */
  lines.push(`<h3 id="s0-4">§0.4 Source confidence</h3>`);
  lines.push(`<p><strong>Weighted confidence: ${I.confidence.weighted_mean}/100</strong> across ${I.confidence.sourced_count} sourced finding(s). Full source-by-source breakdown in <a class="xref" href="#s9">§9</a>.</p>`);
  if (I.failed_checks.length > 0) {
    lines.push(`<div class="callout" style="background:#fef2f2;border-left-color:#dc2626;"><p><strong>⚠ ${I.failed_checks.length} check(s) failed to execute:</strong> ${I.failed_checks.map(c => '<code>' + esc(c) + '</code>').join(', ')}. Findings below are partial.</p></div>`);
  }

  lines.push(`</section>`);
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
   §1 — PAGE INVENTORY
════════════════════════════════════════════════════════════════════════ */

function renderPageInventoryHtml(I: DeepReportInputs, m: FindingWithId[]): string {
  const titleF = titleFinding(m);
  const h1F = h1Finding(m);
  const kw = keywordPresenceFinding(m);
  const meta = metaDescFinding(m);
  const firstPara = firstParagraphFinding(m);
  const coverage = kw?.finding.evidence?.coverage;
  const titleStr = coverage?.title?.value || titleF?.finding.evidence?.title;
  const h1Str = coverage?.h1?.value || h1F?.finding.evidence?.h1 || h1F?.finding.evidence?.h1_first;
  const metaStr = coverage?.meta_description?.value || meta?.finding.evidence?.meta_description;
  const firstParaStr = coverage?.first_paragraph?.value || firstPara?.finding.evidence?.first_paragraph;
  const wc = wordCountFinding(m);
  const wcVal = wc?.finding.evidence?.word_count;
  const paa = paaGapFinding(m);
  const canon = canonicalFinding(m);
  const schema = schemaFinding(m);
  const imgs = imageOptFindings(m);
  const linkCount = internalLinksCountFinding(m);
  const anchor = anchorTextFinding(m);
  const freshness = contentFreshnessFinding(m);
  const hreflang = hreflangFinding(m);

  const lines: string[] = [];
  lines.push(`<section id="s1"><h2>§1 — Page Inventory</h2>`);
  lines.push(`<p class="section-intro">Current state of the audited URL. Findings in §3 interpret what these values mean. Every value is sourced from live HTML fetch unless noted.</p>`);

  /* §1.1 metadata */
  lines.push(`<h3 id="s1-1">§1.1 — Page metadata</h3>`);
  lines.push(`<table><thead><tr><th>Element</th><th>Value</th><th style="width:80px;">Length</th><th style="width:80px;">Cross-ref</th></tr></thead><tbody>`);
  lines.push(`<tr><td>URL</td><td><a class="url-display" href="${esc(I.url)}">${esc(I.url)}</a></td><td>—</td><td>—</td></tr>`);
  lines.push(`<tr><td>Title</td><td>"${esc(clip(titleStr, 200))}"</td><td>${titleStr ? titleStr.length + ' chars' : '—'}</td><td>${xrefHtml(titleF, { short: true })}</td></tr>`);
  lines.push(`<tr><td>H1</td><td>"${esc(clip(h1Str, 200))}"</td><td>—</td><td>${xrefHtml(h1F, { short: true })}</td></tr>`);
  lines.push(`<tr><td>Meta description</td><td>"${esc(clip(metaStr, 200))}"</td><td>${metaStr ? metaStr.length + ' chars' : '—'}</td><td>${xrefHtml(meta, { short: true })}</td></tr>`);
  lines.push(`<tr><td>First paragraph</td><td>"${esc(clip(firstParaStr, 240))}"</td><td>—</td><td>${xrefHtml(firstPara, { short: true })}</td></tr>`);
  lines.push(`<tr><td>Campaign keyword</td><td><code>${esc(I.keyword)}</code></td><td>—</td><td>${xrefHtml(kw, { short: true })}</td></tr>`);
  lines.push(`</tbody></table>`);

  /* §1.2 content structure */
  lines.push(`<h3 id="s1-2">§1.2 — Content structure</h3>`);
  lines.push(`<table><thead><tr><th>Field</th><th>Value</th><th style="width:80px;">Cross-ref</th></tr></thead><tbody>`);
  lines.push(`<tr><td>Word count</td><td>${wcVal ? num(wcVal) + ' words' : '—'}</td><td>${xrefHtml(wc, { short: true })}</td></tr>`);
  lines.push(`<tr><td>H2 count</td><td>${val(paa?.finding.evidence?.h2_count)}</td><td>${xrefHtml(paa, { short: true })}</td></tr>`);
  lines.push(`<tr><td>H3 count</td><td>${val(paa?.finding.evidence?.h3_count)}</td><td>${xrefHtml(paa, { short: true })}</td></tr>`);
  lines.push(`<tr><td>Canonical</td><td>${canon?.finding.evidence?.canonical ? '<code>' + esc(canon.finding.evidence.canonical) + '</code>' : '—'}</td><td>${xrefHtml(canon, { short: true })}</td></tr>`);
  lines.push(`</tbody></table>`);

  /* §1.3 schema */
  lines.push(`<h3 id="s1-3">§1.3 — Schema markup</h3>`);
  if (schema) {
    const types = schema.finding.evidence?.types;
    const blockCount = schema.finding.evidence?.block_count;
    lines.push(`<ul>`);
    lines.push(`<li><strong>Types present:</strong> ${Array.isArray(types) && types.length ? types.map((t: string) => '<code>' + esc(t) + '</code>').join(', ') : '—'}</li>`);
    if (blockCount !== undefined) lines.push(`<li><strong>JSON-LD blocks:</strong> ${esc(blockCount)}</li>`);
    if (schema.finding.evidence?.validation_issues) {
      lines.push(`<li><strong>Validation issues:</strong> ${schema.finding.evidence.validation_issues.length} — see ${xrefHtml(schema, { short: true })}</li>`);
    } else {
      lines.push(`<li><strong>Validation status:</strong> all per-type checks passed — see ${xrefHtml(schema, { short: true })}</li>`);
    }
    lines.push(`</ul>`);
  } else {
    lines.push(`<p>No schema markup detected on this page.</p>`);
  }

  /* §1.4 images */
  lines.push(`<h3 id="s1-4">§1.4 — Image inventory</h3>`);
  if (imgs.length > 0) {
    const richest = imgs.reduce<FindingWithId | null>((acc, x) => {
      const xc = x.finding.evidence?.total_images ?? 0;
      const ac = acc?.finding.evidence?.total_images ?? 0;
      return xc >= ac ? x : acc;
    }, null);
    const ev = richest?.finding.evidence || {};
    lines.push(`<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>`);
    lines.push(`<tr><td>Total content images (tracking pixels filtered)</td><td>${val(ev.total_images)}</td></tr>`);
    lines.push(`<tr><td>With alt text</td><td>${ev.with_alt !== undefined && ev.total_images ? esc(ev.with_alt) + ' (' + Math.round((ev.with_alt / ev.total_images) * 100) + '%)' : '—'}</td></tr>`);
    lines.push(`<tr><td>Lazy-loaded</td><td>${ev.with_lazy !== undefined && ev.total_images ? esc(ev.with_lazy) + ' (' + Math.round((ev.with_lazy / ev.total_images) * 100) + '%)' : '—'}</td></tr>`);
    lines.push(`<tr><td>Responsive (srcset)</td><td>${ev.with_srcset !== undefined && ev.total_images ? esc(ev.with_srcset) + ' (' + Math.round((ev.with_srcset / ev.total_images) * 100) + '%)' : '—'}</td></tr>`);
    lines.push(`<tr><td>Modern format (webp/avif)</td><td>${val(ev.modern_format)}</td></tr>`);
    lines.push(`<tr><td>Legacy format (jpg/png/gif)</td><td>${val(ev.legacy_format)}</td></tr>`);
    if (ev.other_format !== undefined && ev.other_format > 0) {
      lines.push(`<tr><td>Other format (svg/data-uri/cdn-no-ext)</td><td>${esc(ev.other_format)}</td></tr>`);
    }
    lines.push(`</tbody></table>`);
    lines.push(`<p>Related findings: ${imgs.map(f => xrefHtml(f, { short: true })).join(', ')}</p>`);
  } else {
    lines.push(`<p>No image-optimization findings produced for this page.</p>`);
  }

  /* §1.5 internal links */
  lines.push(`<h3 id="s1-5">§1.5 — Internal-link inventory & anchor-text distribution</h3>`);
  if (linkCount || anchor) {
    const lcEv = linkCount?.finding.evidence || {};
    const acEv = anchor?.finding.evidence || {};
    lines.push(`<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>`);
    lines.push(`<tr><td>Total internal links</td><td>${val(lcEv.internal_link_count ?? acEv.internal_links_total)}</td></tr>`);
    lines.push(`<tr><td>Descriptive anchors</td><td>${acEv.descriptive !== undefined && acEv.internal_links_total ? esc(acEv.descriptive) + ' (' + Math.round((acEv.descriptive / acEv.internal_links_total) * 100) + '%)' : '—'}</td></tr>`);
    lines.push(`<tr><td>Single-word / nav anchors</td><td>${val(acEv.single_word)}</td></tr>`);
    lines.push(`<tr><td>Generic anchors ("click here", etc.)</td><td>${val(acEv.generic)}</td></tr>`);
    lines.push(`<tr><td>URL-based anchors</td><td>${val(acEv.url_based)}</td></tr>`);
    lines.push(`</tbody></table>`);
    const refs = [linkCount, anchor].filter(Boolean) as FindingWithId[];
    lines.push(`<p>Related findings: ${refs.map(f => xrefHtml(f, { short: true })).join(', ')}</p>`);
  }

  /* §1.6 freshness */
  lines.push(`<h3 id="s1-6">§1.6 — Content freshness signals</h3>`);
  if (freshness) {
    const fev = freshness.finding.evidence || {};
    lines.push(`<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>`);
    lines.push(`<tr><td>Age (months since most recent signal)</td><td>${val(fev.age_months)}</td></tr>`);
    if (fev.most_recent_date) lines.push(`<tr><td>Most-recent date</td><td>${esc((fev.most_recent_date as string).slice(0, 10))}</td></tr>`);
    if (fev.most_recent_source) lines.push(`<tr><td>Source of most-recent signal</td><td><code>${esc(fev.most_recent_source)}</code></td></tr>`);
    lines.push(`</tbody></table>`);
    lines.push(`<p>Related finding: ${xrefHtml(freshness, { short: true })}</p>`);
  } else {
    lines.push(`<p>No content-freshness finding produced for this page.</p>`);
  }

  /* §1.7 hreflang */
  lines.push(`<h3 id="s1-7">§1.7 — Hreflang configuration</h3>`);
  if (hreflang) {
    lines.push(`<p>See finding: ${xrefHtml(hreflang)}</p>`);
  } else {
    lines.push(`<p>No hreflang annotations on this page (single-locale page — no penalty for absence).</p>`);
  }

  /* §1.8 indexability */
  lines.push(`<h3 id="s1-8">§1.8 — Indexability</h3>`);
  const idx = indexabilityFindings(m);
  if (idx.length > 0) {
    lines.push(`<ul>`);
    for (const fi of idx) {
      lines.push(`<li>${sevBadge(fi.finding.severity)} ${esc(fi.finding.finding_title)} ${xrefHtml(fi, { short: true })}</li>`);
    }
    lines.push(`</ul>`);
  } else {
    lines.push(`<p>No indexability or robots findings produced.</p>`);
  }

  lines.push(`</section>`);
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
   §2 — SEARCH PERFORMANCE BASELINE
════════════════════════════════════════════════════════════════════════ */

function renderSearchPerfHtml(I: DeepReportInputs, m: FindingWithId[]): string {
  const ctr = ctrFinding(m);
  const ga4 = perPageGa4Finding(m);
  const zeroConv = zeroConversionFinding(m);
  const queryDist = queryDistributionFinding(m);
  const paaGap = paaGapFinding(m);
  const compFinding = competitiveContentFinding(m);
  const diffuse = diffuseIntentFinding(m);
  const ctrEv = ctr?.finding.evidence || {};
  const ga4Ev = ga4?.finding.evidence || {};

  const lines: string[] = [];
  lines.push(`<section id="s2"><h2>§2 — Search Performance Baseline</h2>`);
  lines.push(`<p class="section-intro">What GSC, GA4, SerpAPI, and PSI report about this URL right now. Each subsection cites the finding §-ID(s) that interpret the data.</p>`);

  /* §2.1 GSC */
  lines.push(`<h3 id="s2-1">§2.1 — GSC metrics (Google Search Console, live)</h3>`);
  if (ctr) {
    lines.push(`<table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>`);
    lines.push(`<tr><td>Clicks (28d)</td><td>${val(ctrEv.clicks)}</td></tr>`);
    lines.push(`<tr><td>Impressions (28d)</td><td>${num(ctrEv.impressions)}</td></tr>`);
    lines.push(`<tr><td>CTR actual</td><td>${ctrEv.actual_ctr_pct !== undefined ? esc(ctrEv.actual_ctr_pct) + '%' : '—'}</td></tr>`);
    lines.push(`<tr><td>CTR expected for position</td><td>${ctrEv.expected_ctr_pct !== undefined ? esc(ctrEv.expected_ctr_pct) + '%' : '—'}</td></tr>`);
    lines.push(`<tr><td>Ratio actual / expected</td><td>${ctrEv.ratio_pct !== undefined ? esc(ctrEv.ratio_pct) + '%' : '—'}</td></tr>`);
    lines.push(`<tr><td>Avg position (GSC)</td><td>${ctrEv.position !== undefined ? esc(ctrEv.position.toFixed(1)) : '—'}</td></tr>`);
    lines.push(`</tbody></table>`);
    lines.push(`<p>Interpretation finding: ${xrefHtml(ctr)}.</p>`);
  } else {
    lines.push(`<p>No CTR finding produced — GSC connection may be missing or impressions below the credibility threshold.</p>`);
  }

  /* §2.2 GA4 */
  lines.push(`<h3 id="s2-2">§2.2 — GA4 per-page engagement (last 28 days)</h3>`);
  if (ga4 || zeroConv) {
    const ev = ga4Ev.sessions !== undefined ? ga4Ev : (zeroConv?.finding.evidence || {});
    lines.push(`<table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>`);
    lines.push(`<tr><td>Sessions</td><td>${val(ev.sessions)}</td></tr>`);
    lines.push(`<tr><td>Engaged sessions</td><td>${ev.engaged_sessions !== undefined ? esc(ev.engaged_sessions) + (ev.engagement_rate_pct !== undefined ? ' (' + esc(ev.engagement_rate_pct) + '%)' : '') : '—'}</td></tr>`);
    lines.push(`<tr><td>Avg session duration</td><td>${ev.avg_session_sec !== undefined ? Math.round(ev.avg_session_sec) + 's' : '—'}</td></tr>`);
    lines.push(`<tr><td>Bounce rate</td><td>${ev.bounce_rate_pct !== undefined ? esc(ev.bounce_rate_pct) + '%' : '—'}</td></tr>`);
    lines.push(`<tr><td>Page views</td><td>${val(ev.views)}</td></tr>`);
    lines.push(`<tr><td>Conversions</td><td>${val(ev.conversions)}</td></tr>`);
    lines.push(`</tbody></table>`);
    if (ga4) lines.push(`<p>Engagement interpretation: ${xrefHtml(ga4)}.</p>`);
    if (zeroConv) lines.push(`<p>Zero-conversion alert: ${xrefHtml(zeroConv)}.</p>`);
  } else {
    lines.push(`<p>No per-page GA4 data was retrieved for this audit run.</p>`);
  }

  /* §2.3 Live SERP */
  lines.push(`<h3 id="s2-3">§2.3 — Live SERP composition for <code>${esc(I.keyword)}</code></h3>`);
  if (ctrEv.top_10_domains && Array.isArray(ctrEv.top_10_domains) && ctrEv.top_10_domains.length > 0) {
    lines.push(`<p>Live top-10 domains for <code>${esc(I.keyword)}</code>:</p>`);
    lines.push(`<ol>`);
    for (const d of ctrEv.top_10_domains) lines.push(`<li><code>${esc(d)}</code></li>`);
    lines.push(`</ol>`);
    if (ctrEv.in_live_top_100 === false) {
      lines.push(`<p><strong>Audited URL is NOT in the live top-100</strong> for <code>${esc(I.keyword)}</code>. GSC's reported average position is therefore driven by <em>other</em> queries — see <a class="xref" href="#s2-6">§2.6</a>.</p>`);
    } else if (ctrEv.live_position) {
      lines.push(`<p>Audited URL appears at live SERP position <strong>${esc(ctrEv.live_position)}</strong> for <code>${esc(I.keyword)}</code>.</p>`);
    }
  } else {
    lines.push(`<p>SerpAPI did not return live SERP composition for this audit (CTR may not have been underperforming enough to trigger SerpAPI enrichment, or SerpAPI key not configured).</p>`);
  }

  /* §2.4 SerpAPI features */
  lines.push(`<h3 id="s2-4">§2.4 — SerpAPI feature detection</h3>`);
  if (ctrEv.serp_verified) {
    lines.push(`<table><thead><tr><th>Feature</th><th>Status</th></tr></thead><tbody>`);
    lines.push(`<tr><td>AI Overview present</td><td>${ctrEv.ai_overview ? '✅ Yes' : '❌ No'}</td></tr>`);
    lines.push(`<tr><td>Featured snippet</td><td>${ctrEv.featured_snippet ? '✅ Yes' + (ctrEv.featured_snippet_owner ? ' (' + esc(ctrEv.featured_snippet_owner) + ')' : '') : '❌ No'}</td></tr>`);
    lines.push(`<tr><td>People Also Ask box</td><td>${ctrEv.paa_count > 0 ? '✅ Yes (' + esc(ctrEv.paa_count) + ' questions)' : '❌ No'}</td></tr>`);
    lines.push(`<tr><td>Top ads</td><td>${val(ctrEv.ads_top)}</td></tr>`);
    lines.push(`<tr><td>Bottom ads</td><td>${val(ctrEv.ads_bottom)}</td></tr>`);
    lines.push(`<tr><td>Cache state</td><td>${ctrEv.cache_hit ? 'cached' : 'fresh fetch'}</td></tr>`);
    lines.push(`</tbody></table>`);
    if (ctrEv.paa_questions && Array.isArray(ctrEv.paa_questions) && ctrEv.paa_questions.length > 0) {
      lines.push(`<p><strong>Live PAA questions on this SERP</strong> (citation candidates):</p>`);
      lines.push(`<ul>`);
      for (const q of ctrEv.paa_questions) lines.push(`<li>"${esc(q)}"</li>`);
      lines.push(`</ul>`);
      if (paaGap) lines.push(`<p>Content-gap interpretation: ${xrefHtml(paaGap)}.</p>`);
    }
  } else {
    lines.push(`<p>No SerpAPI feature detection ran for this audit (CTR may not have been underperforming enough to trigger the enrichment path, or SerpAPI key not configured).</p>`);
  }

  /* §2.5 competitive content */
  lines.push(`<h3 id="s2-5">§2.5 — Competitive content landscape</h3>`);
  if (compFinding) {
    const cev = compFinding.finding.evidence || {};
    lines.push(`<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>`);
    lines.push(`<tr><td>Audited word count</td><td>${num(cev.audited_word_count)}</td></tr>`);
    lines.push(`<tr><td>Competitor median word count</td><td>${num(cev.competitor_median)}</td></tr>`);
    if (cev.competitor_min !== undefined || cev.competitor_max !== undefined) {
      lines.push(`<tr><td>Range (min–max)</td><td>${num(cev.competitor_min)}–${num(cev.competitor_max)}</td></tr>`);
    }
    lines.push(`<tr><td>Ratio audited / median</td><td>${cev.word_ratio !== undefined ? Math.round(cev.word_ratio * 100) + '%' : '—'}</td></tr>`);
    lines.push(`<tr><td>Competitors fetched</td><td>${val(cev.competitors_fetched)}</td></tr>`);
    lines.push(`</tbody></table>`);
    lines.push(`<p>Interpretation finding: ${xrefHtml(compFinding)}.</p>`);
    if (diffuse) {
      lines.push(`<p><strong>Cross-reference:</strong> read this together with the diffuse-intent finding ${xrefHtml(diffuse)} — when SERP intent is diffuse, the competitor median is dragged down by different-intent pages, so a 150%+ ratio reflects intent mismatch, not bloat.</p>`);
    }
  } else {
    lines.push(`<p>No competitive-content benchmark produced (SerpAPI required to fetch top-10 competitor URLs).</p>`);
  }

  /* §2.5.1 intent classification */
  if (diffuse) {
    lines.push(`<h4 id="s2-5-1">§2.5.1 — Top-10 intent classification</h4>`);
    const dev = diffuse.finding.evidence || {};
    if (dev.distinct_categories) {
      lines.push(`<p><strong>${esc(dev.distinct_categories)} distinct intent categories</strong> detected in the live top-10.</p>`);
    }
    let normalizedCats: Array<{ name: string; count: number; domains: string[] }> = [];
    if (Array.isArray(dev.categories)) {
      normalizedCats = dev.categories.map((c: any) => ({
        name: c.name || '',
        count: c.count ?? (Array.isArray(c.domains) ? c.domains.length : 0),
        domains: Array.isArray(c.domains) ? c.domains : [],
      })).filter((c) => c.name);
    } else if (dev.categories && typeof dev.categories === 'object') {
      normalizedCats = Object.entries(dev.categories).map(([name, domains]) => ({
        name,
        count: Array.isArray(domains) ? domains.length : 0,
        domains: Array.isArray(domains) ? domains as string[] : [],
      }));
    }
    normalizedCats.sort((a, b) => b.count - a.count);
    if (normalizedCats.length > 0) {
      lines.push(`<table><thead><tr><th>Intent category</th><th style="width:80px;">Count</th><th>Example domains</th></tr></thead><tbody>`);
      for (const c of normalizedCats) {
        lines.push(`<tr><td>${esc(c.name)}</td><td>${esc(c.count)}</td><td>${c.domains.slice(0, 4).map(d => '<code>' + esc(d) + '</code>').join(', ')}</td></tr>`);
      }
      lines.push(`</tbody></table>`);
    }
    lines.push(`<p>Interpretation finding: ${xrefHtml(diffuse)}. SEO-economics implications in <a class="xref" href="#s5-2">§5.2</a>.</p>`);
  }

  /* §2.6 query distribution */
  lines.push(`<h3 id="s2-6">§2.6 — GSC query distribution</h3>`);
  if (queryDist) {
    lines.push(`<p>Query-distribution data pending (typically refreshed by the 6am UTC cron). ${xrefHtml(queryDist)}.</p>`);
  } else {
    lines.push(`<p>GSC query distribution data was not collected this run.</p>`);
  }

  lines.push(`</section>`);
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
   §3 — FINDINGS
════════════════════════════════════════════════════════════════════════ */

function renderFindingsHtml(I: DeepReportInputs, m: FindingWithId[]): string {
  const lines: string[] = [];
  lines.push(`<section id="s3"><h2>§3 — Findings (${m.length} total)</h2>`);
  lines.push(`<p class="section-intro">Every finding produced by the audit, in severity order (Critical → Warning → Pass → Info). Each finding has a stable §-ID for cross-referencing.</p>`);
  for (const fi of m) {
    lines.push(renderSingleFindingHtml(fi, m));
  }
  lines.push(`</section>`);
  return lines.join('\n');
}

function renderSingleFindingHtml(fi: FindingWithId, m: FindingWithId[]): string {
  const f = fi.finding;
  const lines: string[] = [];
  const classes = [
    'finding',
    `finding-${f.severity}`,
    f.is_foundational ? 'finding-foundational' : '',
  ].filter(Boolean).join(' ');
  lines.push(`<article class="${classes}" id="${anchorId(fi.id)}">`);
  /* Heading: §-ID + severity badge + foundational badge + title */
  const foundationalMark = f.is_foundational ? `<span class="foundational-badge">🎯 Foundational</span> ` : '';
  lines.push(`<h3>§${esc(fi.id)} — ${foundationalMark}${sevBadge(f.severity)} ${esc(f.finding_title)}</h3>`);
  lines.push(`<p class="finding-meta"><strong>Severity:</strong> ${sevBadge(f.severity)} · <strong>Audit kind:</strong> <code>${esc(f.audit_kind)}</code></p>`);
  if (f.is_foundational) {
    lines.push(`<div class="foundational-callout"><strong>🎯 Foundational fix</strong> — this finding's recommendation, if adopted, will reframe the remaining Critical findings (their context resets against the corrected target). Sequencing matters: tactical fixes done in the wrong order get undone. See <a class="xref" href="#s6-1">§6.1</a>.</div>`);
  }
  if (f.finding_detail) {
    lines.push(`<span class="finding-section-label">Detail</span>`);
    /* Detail may contain newlines + markdown-ish formatting. We preserve
       newlines via <pre class="finding-detail-pre"> with white-space:
       pre-wrap. Markdown bold/code inside the detail won't render but
       the structure is preserved. */
    lines.push(`<pre class="finding-detail-pre">${formatFindingDetailHtml(f.finding_detail)}</pre>`);
  }
  if (f.recommendation) {
    lines.push(`<span class="finding-section-label">Recommendation</span>`);
    lines.push(`<pre class="finding-detail-pre">${formatFindingDetailHtml(f.recommendation)}</pre>`);
  }
  const srcLabel = findingSourceLabel(f);
  const enrich = Array.isArray(f.enrichment_sources) && f.enrichment_sources.length
    ? ` <em>(enriched by ${f.enrichment_sources.map(e => esc(e)).join(', ')})</em>` : '';
  lines.push(`<p class="finding-meta"><strong>Source:</strong> ${esc(srcLabel)}${enrich} · <strong>Confidence:</strong> ${findingConfidence(f)}/100</p>`);
  if (Array.isArray(f.signals) && f.signals.length > 0) {
    lines.push(`<p class="finding-meta"><strong>Signals tagged:</strong> ${f.signals.map(s => '<code>' + esc(s) + '</code>').join(', ')}. Convergence interpretation in <a class="xref" href="#s4-1">§4.1</a>.</p>`);
  }
  const xrefs = collectCrossRefs(fi, m);
  if (xrefs.length > 0) {
    lines.push(`<span class="finding-section-label">Cross-references</span>`);
    lines.push(`<ul class="xrefs-block">`);
    for (const xr of xrefs) {
      /* xr looks like "Shares signals `keyword_pivot_cluster` with §3.2 — Title" — we want to
         linkify the §-ID portion. */
      lines.push(`<li>${linkifyCrossRefLine(xr)}</li>`);
    }
    lines.push(`</ul>`);
  }
  if (f.evidence && Object.keys(f.evidence).length > 0) {
    lines.push(`<details class="evidence">`);
    lines.push(`<summary>Raw evidence (JSON)</summary>`);
    lines.push(`<pre><code>${esc(JSON.stringify(f.evidence, null, 2))}</code></pre>`);
    lines.push(`</details>`);
  }
  lines.push(`</article>`);
  return lines.join('\n');
}

/** Escape finding detail/recommendation text — preserves the bold/italic
 *  markers as plain text (they read fine in monospace context). Keeps
 *  newlines intact so the <pre> preserves layout. */
function formatFindingDetailHtml(text: string): string {
  return esc(text);
}

/** Turn "Shares signals X with §3.2 — Title" into a hyperlinked version. */
function linkifyCrossRefLine(line: string): string {
  return esc(line).replace(/§(\d+\.\d+(?:\.\d+)*)/g, (_match, id: string) => {
    return `<a class="xref" href="#${anchorId(id)}">§${esc(id)}</a>`;
  });
}

/* ════════════════════════════════════════════════════════════════════════
   §4 — CONVERGENCE ANALYSIS
════════════════════════════════════════════════════════════════════════ */

function renderConvergenceHtml(I: DeepReportInputs, m: FindingWithId[]): string {
  const lines: string[] = [];
  lines.push(`<section id="s4"><h2>§4 — Convergence Analysis</h2>`);
  lines.push(`<p class="section-intro">When two or more findings independently corroborate the same diagnosis using different methodologies and data sources, the recommendation hardens from hypothesis to operational call. This section maps which findings agree on what.</p>`);

  /* §4.1 signal map */
  lines.push(`<h3 id="s4-1">§4.1 — Cross-finding signal map</h3>`);
  const signalMap: Record<string, FindingWithId[]> = {};
  for (const fi of m) {
    const sigs = fi.finding.signals;
    if (!Array.isArray(sigs)) continue;
    for (const s of sigs) {
      if (!signalMap[s]) signalMap[s] = [];
      signalMap[s].push(fi);
    }
  }
  if (Object.keys(signalMap).length === 0) {
    lines.push(`<p>No signal-tagged findings in this audit — no convergence to map.</p>`);
  } else {
    lines.push(`<table><thead><tr><th>Signal</th><th>Findings tagged with this signal</th><th>Severity mix</th></tr></thead><tbody>`);
    /* Sort: cluster signal first (visual prominence), then leaf signals */
    const sortedSignals = Object.entries(signalMap).sort(([a], [b]) => {
      if (a.endsWith('_cluster') && !b.endsWith('_cluster')) return -1;
      if (b.endsWith('_cluster') && !a.endsWith('_cluster')) return 1;
      return a.localeCompare(b);
    });
    for (const [signal, fis] of sortedSignals) {
      const refs = fis.map(fi => `<a class="xref" href="#${anchorId(fi.id)}">§${esc(fi.id)}</a>`).join(', ');
      const sevMix = fis.map(fi => sevBadge(fi.finding.severity)).join('');
      const rowClass = signal.endsWith('_cluster') ? 'cluster-signal' : '';
      lines.push(`<tr class="${rowClass}"><td><code>${esc(signal)}</code></td><td>${refs}</td><td>${sevMix}</td></tr>`);
    }
    lines.push(`</tbody></table>`);
  }

  /* §4.2 hardened diagnoses */
  lines.push(`<h3 id="s4-2">§4.2 — Hardened diagnoses (where 2+ findings agree)</h3>`);
  const kwSignals = ['keyword_mismatch', 'url_not_in_top_10', 'serp_topic_mismatch', 'first_paragraph_off_topic'];
  const kwSignalsPresent = kwSignals.filter(s => signalMap[s] && signalMap[s].length > 0);
  if (kwSignalsPresent.length >= 2) {
    const allFindings = new Set<string>();
    for (const s of kwSignalsPresent) {
      for (const fi of signalMap[s]) allFindings.add(fi.id);
    }
    const findingRefs = Array.from(allFindings).map(id => {
      const fi = m.find(x => x.id === id);
      return fi ? `<a class="xref" href="#${anchorId(id)}">§${esc(id)}</a>` : '';
    }).filter(Boolean).join(', ');
    lines.push(`<div class="callout callout-converging">`);
    lines.push(`<p><strong>Hardened diagnosis: keyword-pivot is foundational.</strong> ${kwSignalsPresent.length} independent signals corroborate, across findings ${findingRefs}. Each signal represents a different methodology and data source:</p>`);
    lines.push(`<ul>`);
    const signalDescriptions: Record<string, string> = {
      keyword_mismatch:          'Token-overlap analysis on title/H1 (live HTML fetch + token-set comparison)',
      url_not_in_top_10:         'Live SERP position check (SerpAPI live SERP fetch)',
      serp_topic_mismatch:       'Diffuse-intent SERP detection (LLM-classification of top-10 domains)',
      first_paragraph_off_topic: 'First-paragraph topicality (live HTML fetch + topical-overlap heuristic)',
    };
    for (const s of kwSignalsPresent) {
      const desc = signalDescriptions[s] || s;
      const fids = signalMap[s].map(fi => `<a class="xref" href="#${anchorId(fi.id)}">§${esc(fi.id)}</a>`).join(', ');
      lines.push(`<li><code>${esc(s)}</code> — ${esc(desc)}. Findings: ${fids}.</li>`);
    }
    lines.push(`</ul>`);
    lines.push(`<p>When findings using different methodologies converge on the same diagnosis, the recommendation is operational — not speculative. Recommendation sequencing in <a class="xref" href="#s6">§6</a> reflects this convergence.</p>`);
    lines.push(`</div>`);
  } else {
    lines.push(`<p>No 2+ signal convergence detected. Either the audit produced only one Critical finding, or critical findings cover distinct methodologies that don't share a signal cluster.</p>`);
  }

  /* §4.3 contradictions */
  lines.push(`<h3 id="s4-3">§4.3 — Contradictions & open questions</h3>`);
  lines.push(`<ul>`);
  const zeroConv = zeroConversionFinding(m);
  if (zeroConv) {
    const sessions = zeroConv.finding.evidence?.sessions;
    lines.push(`<li><strong>Tracking gap vs real funnel</strong> ${xrefHtml(zeroConv, { short: true })}: ${esc(sessions)} sessions, 0 conversions. The audit can't distinguish a measurement gap from a genuine funnel issue using external data alone. Resolution path: GA4 admin verifies whether conversion events are configured for this URL's pagePath. See <a class="xref" href="#s6-3-1">§6.3.1</a>.</li>`);
  }
  const freshness = contentFreshnessFinding(m);
  if (freshness && freshness.finding.evidence?.most_recent_source === 'Last-Modified header') {
    lines.push(`<li><strong>Freshness signal authenticity</strong> ${xrefHtml(freshness, { short: true })}: the most-recent date comes solely from the Last-Modified HTTP header. This can be touched by CDN/cache refresh without genuine content change. Cross-verify with schema dateModified and visible "Updated:" labels. See <a class="xref" href="#s5-4">§5.4</a>.</li>`);
  }
  const schema = schemaFinding(m);
  if (schema && Array.isArray(schema.finding.evidence?.types) && schema.finding.evidence.types.includes('FAQPage')) {
    lines.push(`<li><strong>Schema type-fit not validated</strong> ${xrefHtml(schema, { short: true })}: the page has valid FAQPage schema, but is FAQPage the right TYPE for a pricing-comparison page (vs Article or Product)? The content-match check passes; the type-fit question is broader and requires manual review.</li>`);
  }
  lines.push(`</ul>`);

  lines.push(`</section>`);
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
   §5 — SEO ECONOMICS CONTEXT (subset that depends on findings — narrative
   reads same as markdown version but with HTML anchors for cross-refs)
════════════════════════════════════════════════════════════════════════ */

function renderEconomicsHtml(I: DeepReportInputs, m: FindingWithId[]): string {
  const ctr = ctrFinding(m);
  const ctrEv = ctr?.finding.evidence || {};
  const diffuse = diffuseIntentFinding(m);
  const paaGap = paaGapFinding(m);
  const firstPara = firstParagraphFinding(m);
  const schema = schemaFinding(m);
  const freshness = contentFreshnessFinding(m);
  const anchor = anchorTextFinding(m);
  const imgs = imageOptFindings(m);

  const lines: string[] = [];
  lines.push(`<section id="s5"><h2>§5 — SEO Economics Context</h2>`);
  lines.push(`<p class="section-intro">Industry context for this audit's findings. Each subsection applies only when the corresponding finding fired.</p>`);

  /* §5.1 AI Overview */
  lines.push(`<h3 id="s5-1">§5.1 — AI Overview era</h3>`);
  if (ctrEv.ai_overview) {
    lines.push(`<p>Google's AI Overview, broadly rolled out in 2024, now appears on the majority of informational queries. For SERPs with AI Overview present (verified for <code>${esc(I.keyword)}</code> in <a class="xref" href="#s2-4">§2.4</a>), the CTR-vs-position benchmarks measured pre-AI-Overview (AdvancedWebRanking, Backlinko, FirstPageSage) overstate recoverable CTR by 30-50%.</p>`);
    lines.push(`<p><strong>Implication for THIS audit:</strong> the CTR underperformance ratio in ${xrefHtml(ctr, { short: true })} can't be recovered purely by ranking higher. Recovery requires <em>citation eligibility</em> — being one of the source pages Google's AI summary cites — not just position improvement.</p>`);
    lines.push(`<p><strong>Citation-eligibility tactics</strong> (these compound with each other, listed in order of leverage for THIS page):</p>`);
    lines.push(`<ul>`);
    if (paaGap) lines.push(`<li><strong>Highest leverage:</strong> add H2 sections answering the live PAA questions verbatim — see ${xrefHtml(paaGap)} for the question list and per-section briefs.</li>`);
    if (firstPara && firstPara.finding.severity !== 'green') lines.push(`<li><strong>Second leverage:</strong> rewrite the first paragraph as a 40-80 word direct answer to the core query — see ${xrefHtml(firstPara)}.</li>`);
    lines.push(`<li>Cite authoritative external sources: vendor official docs, industry analysts (Gartner, Forrester, IDC), peer-review platforms (G2, Capterra).</li>`);
    lines.push(`<li>Structure key facts as scannable lists. AI Overview cites pages where the answerable structure is unambiguous.</li>`);
    if (schema) lines.push(`<li>Validate schema-content match: every Question in the FAQPage schema must appear verbatim in the visible content — see ${xrefHtml(schema)} and <a class="xref" href="#s5-5">§5.5</a>.</li>`);
    lines.push(`</ul>`);
  } else {
    lines.push(`<p><em>N/A for this audit — no AI Overview detected on the campaign keyword SERP.</em></p>`);
  }

  /* §5.2 Diffuse intent */
  lines.push(`<h3 id="s5-2">§5.2 — Diffuse-intent SERP economics</h3>`);
  if (diffuse) {
    const cats = diffuse.finding.evidence?.distinct_categories || 'multiple';
    lines.push(`<p>A "diffuse-intent SERP" has top-10 results spanning 3+ distinct intent categories — Google itself can't decide what users want. <code>${esc(I.keyword)}</code> has <strong>${esc(cats)}+ distinct intent categories</strong> in its live top-10 (see <a class="xref" href="#s2-5-1">§2.5.1</a>).</p>`);
    lines.push(`<p><strong>Economic implication:</strong> even ranking #1 on a diffuse-intent SERP yields lower CTR than a tight-intent SERP at the same position. Users searching with one intent skip top results matching a different intent. CTR ceilings on diffuse SERPs are <em>structurally</em> lower than tight SERPs at any given position.</p>`);
    lines.push(`<p><strong>Implication for THIS audit:</strong> the recovery upside on <code>${esc(I.keyword)}</code> is capped below what raw search-volume math would suggest. ${xrefHtml(diffuse)} provides the per-category breakdown. Two strategic responses:</p>`);
    lines.push(`<ol>`);
    lines.push(`<li><strong>Pivot to a tighter-intent keyword variant.</strong> Identify a related keyword whose top-10 is single-intent.</li>`);
    lines.push(`<li><strong>Accept the lower ceiling.</strong> Stay on <code>${esc(I.keyword)}</code> but set realistic recovery expectations. The business-impact model in <a class="xref" href="#s8">§8</a> quotes the conservative scenario for exactly this reason.</li>`);
    lines.push(`</ol>`);
  } else {
    lines.push(`<p><em>N/A for this audit — top-10 SERP not classified as diffuse-intent.</em></p>`);
  }

  /* §5.3 CTR benchmarks */
  lines.push(`<h3 id="s5-3">§5.3 — Per-position CTR benchmarks and their limitations</h3>`);
  if (ctr) {
    lines.push(`<p>The "expected CTR" used in ${xrefHtml(ctr, { short: true })} is the midpoint of published benchmarks from AdvancedWebRanking, Backlinko, and FirstPageSage. These are <em>averages</em> across query types — informational queries skew lower; commercial queries skew higher.</p>`);
    lines.push(`<p><strong>Caveats specific to this audit:</strong></p>`);
    lines.push(`<ul>`);
    if (ctrEv.ai_overview) lines.push(`<li>AI Overview is present (<a class="xref" href="#s2-4">§2.4</a>) → expected CTR overstates achievable by 30-50%.</li>`);
    if (diffuse) lines.push(`<li>Diffuse-intent SERP (<a class="xref" href="#s5-2">§5.2</a>) → users skip results matching different intents, compressing CTR at every position.</li>`);
    if (ctrEv.ads_top && ctrEv.ads_top >= 3) lines.push(`<li>${esc(ctrEv.ads_top)} top ads detected (<a class="xref" href="#s2-4">§2.4</a>) → paid placement compresses organic visibility further.</li>`);
    lines.push(`</ul>`);
    lines.push(`<p><strong>Practical guidance:</strong> quote the conservative recovery scenario in <a class="xref" href="#s8-1">§8.1</a> when discussing with clients.</p>`);
  } else {
    lines.push(`<p><em>N/A for this audit — no CTR finding produced.</em></p>`);
  }

  /* §5.4 freshness */
  lines.push(`<h3 id="s5-4">§5.4 — Content freshness signal weighting</h3>`);
  if (freshness) {
    lines.push(`<p>Google detects content recency through four signals (each documented in <a class="xref" href="#s1-6">§1.6</a>): Last-Modified HTTP header, schema dateModified/datePublished, visible "Updated:" labels, year in title.</p>`);
    lines.push(`<p><strong>Key nuance:</strong> Google's models weight <em>material content changes</em> more heavily than date-stamp changes. Touching dateModified without changing content produces minimal freshness lift.</p>`);
  } else {
    lines.push(`<p><em>N/A for this audit — no freshness finding produced.</em></p>`);
  }

  /* §5.5 schema content match */
  lines.push(`<h3 id="s5-5">§5.5 — Schema-content-match policy</h3>`);
  if (schema) {
    lines.push(`<p>Google policy: every Question listed in a FAQPage schema must appear verbatim (or near-verbatim) in the visible page content. Schema questions that don't appear visibly can incur a Google manual action.</p>`);
    if (paaGap) lines.push(`<p><strong>Implication for THIS audit:</strong> when implementing the PAA H2 recommendations from ${xrefHtml(paaGap, { short: true })}, update the FAQPage schema in parallel — every new Q&A in visible content must be reflected in the schema.</p>`);
  } else {
    lines.push(`<p><em>N/A for this audit — no schema finding produced.</em></p>`);
  }

  /* §5.6 anchor text */
  lines.push(`<h3 id="s5-6">§5.6 — Anchor-text quality signaling</h3>`);
  if (anchor) {
    lines.push(`<p>Internal anchor text transfers topical authority. Google weights anchor text as a content signal — descriptive, on-topic anchors transfer more authority than generic ("click here," "read more") or URL-based anchors.</p>`);
    lines.push(`<p><strong>Implication for THIS audit:</strong> when adding internal links during the recommended Phase 2 content work (<a class="xref" href="#s6-2">§6.2</a>), every new anchor should be descriptive and on-topic for the receiving page.</p>`);
  } else {
    lines.push(`<p><em>N/A for this audit — no anchor-text finding produced.</em></p>`);
  }

  /* §5.7 image format */
  lines.push(`<h3 id="s5-7">§5.7 — Image format optimization</h3>`);
  if (imgs.length > 0) {
    lines.push(`<p>Legacy formats (jpg/png/gif) are typically 25-50% larger than equivalent WebP and 40-70% larger than equivalent AVIF at the same visual quality.</p>`);
    lines.push(`<p><strong>Browser support (2026):</strong> WebP at 95%+, AVIF at 90%+. Both are safe to ship with <code>&lt;picture&gt;</code> fallbacks.</p>`);
    lines.push(`<p><strong>Implication for THIS audit:</strong> image-optimization findings (${imgs.map(f => xrefHtml(f, { short: true })).join(', ')}) flag work the dev team can do in parallel with content work (<a class="xref" href="#s7">§7</a> Phase 3). No content dependencies.</p>`);
  } else {
    lines.push(`<p><em>N/A for this audit — no image-optimization finding produced.</em></p>`);
  }

  lines.push(`</section>`);
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
   §6 — RECOMMENDATIONS
════════════════════════════════════════════════════════════════════════ */

function renderRecommendationsHtml(I: DeepReportInputs, m: FindingWithId[]): string {
  const lines: string[] = [];
  lines.push(`<section id="s6"><h2>§6 — Recommendations (sequenced)</h2>`);
  lines.push(`<p class="section-intro">Each recommendation cross-references the finding(s) it addresses. Sequencing matters: Phase 1 must land before Phase 2 begins, because Phase 2 work resets against Phase 1's outcome. Phase 3 work is parallelizable and can start at kickoff.</p>`);

  /* §6.1 Phase 1 */
  lines.push(`<h3 id="s6-1">§6.1 — Phase 1: Foundational (sequencing-critical)</h3>`);
  const foundational = foundationalFinding(m);
  if (foundational) {
    const f = foundational.finding;
    lines.push(`<h4 id="s6-1-1">§6.1.1 — ${esc(f.finding_title)}</h4>`);
    lines.push(`<p><strong>Addresses:</strong> ${xrefHtml(foundational)}</p>`);
    if (f.recommendation) {
      lines.push(`<span class="finding-section-label">Recommendation</span>`);
      lines.push(`<pre class="finding-detail-pre">${formatFindingDetailHtml(f.recommendation)}</pre>`);
    }
    lines.push(`<p><strong>Why first:</strong> every Phase 2 recommendation resets against the keyword decision. Doing Phase 2 before this lands means redoing it after the decision changes the target.</p>`);
    const xrefList = [ctrFinding(m), diffuseIntentFinding(m), firstParagraphFinding(m)]
      .filter((fi): fi is FindingWithId => fi !== null && fi !== foundational)
      .map(fi => xrefHtml(fi));
    if (xrefList.length > 0) {
      lines.push(`<p><strong>Cross-references:</strong> ${xrefList.join(', ')} — these findings converge on the same diagnosis (see <a class="xref" href="#s4-2">§4.2</a>).</p>`);
    } else {
      lines.push(`<p><strong>Cross-references:</strong> see <a class="xref" href="#s4-2">§4.2</a> for the convergence analysis.</p>`);
    }
  } else {
    lines.push(`<div class="callout"><p><strong>No Phase 1 foundational fix required for this audit.</strong></p><p>No finding triggered the foundational-fix heuristic (indexability blocker, keyword-pivot recommendation, or first-paragraph topicality failure — see <a class="xref" href="#s11">§11.3</a>). Phase 2 work below can begin at kickoff without waiting on a client decision.</p></div>`);
  }

  /* §6.2 Phase 2 */
  lines.push(`<h3 id="s6-2">§6.2 — Phase 2: ${foundational ? 'Content overhaul' : 'Content overhaul (lead phase)'}</h3>`);
  lines.push(`<p>Goal: ${foundational ? 'implement all content changes aligned to the Phase 1 decision' : 'implement the content changes the audit surfaced'}. Each subsection below maps to a specific finding.</p>`);

  const paaGap = paaGapFinding(m);
  if (paaGap) {
    lines.push(`<h4 id="s6-2-1">§6.2.1 — Add new H2 sections for PAA coverage</h4>`);
    lines.push(`<p><strong>Addresses:</strong> ${xrefHtml(paaGap)}</p>`);
    const unansweredArr = paaGap.finding.evidence?.unanswered;
    if (Array.isArray(unansweredArr) && unansweredArr.length > 0) {
      lines.push(`<p><strong>Per-question briefs:</strong></p>`);
      for (let i = 0; i < unansweredArr.length; i++) {
        const q = unansweredArr[i];
        const subId = `s6-2-1-${i + 1}`;
        lines.push(`<h5 id="${subId}">§6.2.1.${i + 1} — Section for: "${esc(q)}"</h5>`);
        lines.push(`<ul>`);
        lines.push(`<li><strong>H2 wording:</strong> use <code>${esc(q)}</code> verbatim (or a tight rephrase preserving key tokens — Google matches PAA boxes to literal phrasings).</li>`);
        lines.push(`<li><strong>First sentence (40-80 words):</strong> direct answer to the question. This is the citation-candidate sentence — write it as if Google's AI Overview might quote it verbatim. No preamble.</li>`);
        lines.push(`<li><strong>Section body (300-500 words after the direct answer):</strong> ${esc(paaQuestionBodyGuidance(q))}</li>`);
        lines.push(`<li><strong>Length target:</strong> 350-580 words total (direct answer + body).</li>`);
        lines.push(`<li><strong>Schema update:</strong> if FAQPage schema exists (<a class="xref" href="#s1-3">§1.3</a>), add this Q&A to the schema's <code>mainEntity</code> array. See <a class="xref" href="#s5-5">§5.5</a>.</li>`);
        lines.push(`</ul>`);
      }
    }
    lines.push(`<p><strong>Why this matters:</strong> the live SERP for <code>${esc(I.keyword)}</code> currently shows ${esc(paaGap.finding.evidence?.paa_total || 0)} PAA questions (<a class="xref" href="#s2-4">§2.4</a>). Each unanswered PAA question is a content gap AND a citation opportunity. Phase 2.1 is the highest-leverage tactic for AI-Overview-era recovery on this SERP.</p>`);
  }

  const firstPara = firstParagraphFinding(m);
  if (firstPara && firstPara.finding.severity !== 'green') {
    lines.push(`<h4 id="s6-2-2">§6.2.2 — Rewrite the first paragraph</h4>`);
    lines.push(`<p><strong>Addresses:</strong> ${xrefHtml(firstPara)}</p>`);
    const fp = firstPara.finding.evidence?.first_paragraph;
    if (fp) {
      lines.push(`<p><strong>Current first paragraph:</strong></p>`);
      lines.push(`<blockquote style="border-left:3px solid #cbd5e1;margin:8px 0;padding:6px 14px;background:#f8fafc;font-style:italic;color:#475569;">${esc(fp)}</blockquote>`);
    }
    lines.push(`<p><strong>Target structure (3-sentence formula):</strong></p>`);
    lines.push(`<ol>`);
    lines.push(`<li><strong>Open with the searcher's problem or question</strong> — in their words, not yours. What did they type into Google? Lead with that.</li>`);
    lines.push(`<li><strong>Acknowledge who this guide is for</strong> — be specific.</li>`);
    lines.push(`<li><strong>Preview the unique value</strong> — what they'll learn that they can't get elsewhere.</li>`);
    lines.push(`</ol>`);
    lines.push(`<p><strong>Length:</strong> 60-100 words. <strong>Don'ts:</strong> generic product taglines, "In today's world…" openers, definition leads, feature-list openers.</p>`);
  }

  const meta = metaDescFinding(m);
  if (meta && meta.finding.severity === 'amber') {
    lines.push(`<h4 id="s6-2-3">§6.2.3 — Trim meta description</h4>`);
    lines.push(`<p><strong>Addresses:</strong> ${xrefHtml(meta)}</p>`);
    const len = meta.finding.evidence?.length;
    lines.push(`<p>Current length: ${esc(len ?? '—')} chars. Target: 140-160 chars. Trim to fit.</p>`);
  }

  /* §6.3 Phase 3 */
  lines.push(`<h3 id="s6-3">§6.3 — Phase 3: Validation & parallel workstreams</h3>`);
  lines.push(`<p>These can start at kickoff and don't block Phase 1 or 2.</p>`);

  const zeroConv = zeroConversionFinding(m);
  if (zeroConv) {
    lines.push(`<h4 id="s6-3-1">§6.3.1 — Verify GA4 conversion tracking</h4>`);
    lines.push(`<p><strong>Addresses:</strong> ${xrefHtml(zeroConv)}</p>`);
    lines.push(`<p><strong>Why parallel:</strong> can run any time, doesn't block content work. <strong>Why mandatory:</strong> if tracking is broken, no traffic-recovery work is measurable.</p>`);
    const pp = zeroConv.finding.evidence?.page_path;
    lines.push(`<p><strong>Diagnosis steps:</strong></p>`);
    lines.push(`<ol>`);
    lines.push(`<li>Open GA4 → Reports → Engagement → Events</li>`);
    if (pp) lines.push(`<li>Filter by pagePath = <code>${esc(pp)}</code></li>`);
    lines.push(`<li>Check whether conversion-flagged events appear for this pagePath</li>`);
    lines.push(`<li>If YES → tracking works, audit the CTA structure (real funnel problem — separate scope)</li>`);
    lines.push(`<li>If NO → tracking gap, instrument the relevant conversion events before more traffic arrives</li>`);
    lines.push(`</ol>`);
  }

  const imgs = imageOptFindings(m);
  if (imgs.length > 0) {
    lines.push(`<h4 id="s6-3-2">§6.3.2 — Image format conversion</h4>`);
    lines.push(`<p><strong>Addresses:</strong> ${imgs.map(f => xrefHtml(f)).join(', ')}</p>`);
    lines.push(`<p>Convert content images from jpg/png/gif to WebP or AVIF. See <a class="xref" href="#s5-7">§5.7</a> for browser-support context.</p>`);
  }

  const psiFailed = cwvFindings(m).find(f => /PageSpeed Insights API failed|HTTP 429/i.test(f.finding.finding_title));
  if (psiFailed) {
    lines.push(`<h4 id="s6-3-3">§6.3.3 — Configure PageSpeed Insights API</h4>`);
    lines.push(`<p><strong>Addresses:</strong> ${xrefHtml(psiFailed)}</p>`);
    lines.push(`<p>PSI is currently returning 429 (rate-limited) because no API key is configured. Get a free key at <a href="https://developers.google.com/speed/docs/insights/v5/get-started">developers.google.com/speed/docs/insights/v5</a> and add to <code>project_integrations</code>.</p>`);
  }

  lines.push(`<h4 id="s6-3-4">§6.3.4 — Schedule re-audit</h4>`);
  lines.push(`<p>Run this audit again 4-6 weeks post-deploy of Phase 1+2 changes. Validate the diagnosis: did the keyword pivot bring this URL into the top-30 for the new target? Did the new H2s capture PAA boxes? Did engagement metrics improve? Compare pre/post values for all findings in <a class="xref" href="#s3">§3</a>.</p>`);

  lines.push(`</section>`);
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
   §7 — EFFORT & DEPENDENCY MAP
════════════════════════════════════════════════════════════════════════ */

function renderEffortMapHtml(I: DeepReportInputs, m: FindingWithId[]): string {
  const foundational = foundationalFinding(m);
  const phase2DepLabel = foundational ? 'T1.4' : 'None';
  const paaGap = paaGapFinding(m);
  const unansweredArr = paaGap?.finding.evidence?.unanswered;
  const firstPara = firstParagraphFinding(m);
  const meta = metaDescFinding(m);
  const schema = schemaFinding(m);
  const zeroConv = zeroConversionFinding(m);
  const imgs = imageOptFindings(m);
  const psiFailed = cwvFindings(m).find(f => /PageSpeed.*failed|HTTP 429/i.test(f.finding.finding_title));

  const lines: string[] = [];
  lines.push(`<section id="s7"><h2>§7 — Effort & Dependency Map</h2>`);
  lines.push(`<p class="section-intro">Each task cross-references the §6 recommendation it implements (and through it, the §3 finding that motivates it). Designed to be ingestible by a downstream PM pipeline.</p>`);

  /* §7.1 task inventory */
  lines.push(`<h3 id="s7-1">§7.1 — Task inventory</h3>`);
  lines.push(`<table><thead><tr><th>Task ID</th><th>Task</th><th>Owner</th><th>Effort</th><th>Dependencies</th><th>Implements</th></tr></thead><tbody>`);
  if (foundational) {
    lines.push(`<tr><td><code>T1.1</code></td><td>Prepare keyword-direction options brief (pivot vs rewrite, with pros/cons)</td><td>Senior DMS</td><td>2 hrs</td><td>None</td><td><a class="xref" href="#s6-1-1">§6.1.1</a></td></tr>`);
    lines.push(`<tr><td><code>T1.2</code></td><td>Schedule 30-min client review call</td><td>PM</td><td>30 min</td><td>T1.1</td><td><a class="xref" href="#s6-1-1">§6.1.1</a></td></tr>`);
    lines.push(`<tr><td><code>T1.3</code></td><td>Client decision: keyword pivot OR content overhaul</td><td>Client</td><td>Async (≤5 business days)</td><td>T1.2</td><td><a class="xref" href="#s6-1-1">§6.1.1</a></td></tr>`);
    lines.push(`<tr><td><code>T1.4</code></td><td>Document decision + update campaign config</td><td>DMS</td><td>30 min</td><td>T1.3</td><td><a class="xref" href="#s6-1-1">§6.1.1</a></td></tr>`);
  }
  if (paaGap && Array.isArray(unansweredArr) && unansweredArr.length > 0) {
    lines.push(`<tr><td><code>T2.1</code></td><td>Write ${unansweredArr.length} new H2 sections per PAA questions (each 350-580 words)</td><td>Content Writer</td><td>3-4 days</td><td>${phase2DepLabel}</td><td><a class="xref" href="#s6-2-1">§6.2.1</a></td></tr>`);
    lines.push(`<tr><td><code>T2.2</code></td><td>Gather external citations (vendor docs, Gartner, G2) — 2 per section minimum</td><td>Content Writer</td><td>1 day</td><td>T2.1 in progress</td><td><a class="xref" href="#s6-2-1">§6.2.1</a></td></tr>`);
  }
  if (firstPara && firstPara.finding.severity !== 'green') {
    lines.push(`<tr><td><code>T2.3</code></td><td>Rewrite first paragraph (3-sentence structure, 60-100 words)</td><td>Content Writer</td><td>2 hrs</td><td>${phase2DepLabel}</td><td><a class="xref" href="#s6-2-2">§6.2.2</a></td></tr>`);
  }
  if (meta && meta.finding.severity === 'amber') {
    lines.push(`<tr><td><code>T2.4</code></td><td>Trim meta description to 140-160 chars</td><td>Content Writer</td><td>15 min</td><td>${phase2DepLabel}</td><td><a class="xref" href="#s6-2-3">§6.2.3</a></td></tr>`);
  }
  if (schema && paaGap) {
    lines.push(`<tr><td><code>T2.5</code></td><td>Update FAQPage schema to match new visible Q&A content</td><td>Dev</td><td>1 hr</td><td>T2.1</td><td><a class="xref" href="#s5-5">§5.5</a></td></tr>`);
  }
  lines.push(`<tr><td><code>T2.6</code></td><td>Editorial review + DMS sign-off</td><td>Senior DMS</td><td>2 hrs</td><td>All T2.* complete</td><td><a class="xref" href="#s6-2">§6.2</a></td></tr>`);
  lines.push(`<tr><td><code>T2.7</code></td><td>Stage to preview environment</td><td>Dev</td><td>1 hr</td><td>T2.6</td><td><a class="xref" href="#s6-2">§6.2</a></td></tr>`);
  lines.push(`<tr><td><code>T2.8</code></td><td>Client review of staged content</td><td>Client</td><td>Async (≤3 days)</td><td>T2.7</td><td><a class="xref" href="#s6-2">§6.2</a></td></tr>`);
  lines.push(`<tr><td><code>T2.9</code></td><td>Deploy to production</td><td>Dev</td><td>30 min</td><td>T2.8</td><td><a class="xref" href="#s6-2">§6.2</a></td></tr>`);
  if (zeroConv) {
    lines.push(`<tr><td><code>T3.1</code></td><td>Verify GA4 conversion event configuration for this URL</td><td>Analytics dev</td><td>2 hrs</td><td>GA4 admin access</td><td><a class="xref" href="#s6-3-1">§6.3.1</a></td></tr>`);
    lines.push(`<tr><td><code>T3.2</code></td><td>If tracking gap: instrument missing conversion events</td><td>Analytics dev</td><td>4-8 hrs</td><td>T3.1 diagnosis</td><td><a class="xref" href="#s6-3-1">§6.3.1</a></td></tr>`);
  }
  if (imgs.length > 0) {
    lines.push(`<tr><td><code>T3.3</code></td><td>Convert content images to webp/avif</td><td>Dev</td><td>1 day</td><td>None</td><td><a class="xref" href="#s6-3-2">§6.3.2</a></td></tr>`);
  }
  if (psiFailed) {
    lines.push(`<tr><td><code>T3.4</code></td><td>Configure PSI API key (project_integrations OR env var)</td><td>DevOps</td><td>30 min</td><td>PSI key acquired</td><td><a class="xref" href="#s6-3-3">§6.3.3</a></td></tr>`);
  }
  lines.push(`<tr><td><code>T3.5</code></td><td>Schedule re-audit 4-6 weeks post-deploy</td><td>PM</td><td>5 min</td><td>T2.9 deployed</td><td><a class="xref" href="#s6-3-4">§6.3.4</a></td></tr>`);
  lines.push(`<tr><td><code>T3.6</code></td><td>Compare pre/post metrics across §3 findings</td><td>DMS + Analyst</td><td>2 hrs</td><td>Re-audit complete</td><td><a class="xref" href="#s6-3-4">§6.3.4</a></td></tr>`);
  lines.push(`</tbody></table>`);

  /* §7.2 critical path — CSS flow diagram instead of ASCII */
  lines.push(`<h3 id="s7-2">§7.2 — Critical path</h3>`);
  lines.push(`<div class="critical-path">`);
  lines.push(`<div class="critical-path-row">`);
  if (foundational) {
    lines.push(`<span class="cp-phase cp-phase-1">Phase 1 · Week 1</span>`);
    lines.push(`<span class="cp-arrow">→</span>`);
    lines.push(`<span class="cp-phase cp-phase-2">Phase 2 · Weeks 2-3</span>`);
    lines.push(`<span class="cp-arrow">→</span>`);
    lines.push(`<span class="cp-phase cp-phase-2">Deploy · end Wk 3</span>`);
    lines.push(`<span class="cp-arrow">→</span>`);
    lines.push(`<span class="cp-phase cp-phase-final">Re-audit · Wks 5-6</span>`);
  } else {
    lines.push(`<span class="cp-phase cp-phase-2">Phase 2 · Weeks 1-2</span>`);
    lines.push(`<span class="cp-arrow">→</span>`);
    lines.push(`<span class="cp-phase cp-phase-2">Deploy · end Wk 2</span>`);
    lines.push(`<span class="cp-arrow">→</span>`);
    lines.push(`<span class="cp-phase cp-phase-final">Re-audit · Wks 4-5</span>`);
  }
  lines.push(`</div>`);
  lines.push(`<div class="cp-parallel-block">`);
  lines.push(`<div class="cp-parallel-label">Phase 3 — parallel (no Phase 1/2 blockers)</div>`);
  lines.push(`<ul>`);
  if (zeroConv) lines.push(`<li>T3.1 / T3.2 — conversion-tracking audit + instrumentation</li>`);
  if (imgs.length > 0) lines.push(`<li>T3.3 — image format conversion</li>`);
  if (psiFailed) lines.push(`<li>T3.4 — PSI API key config</li>`);
  lines.push(`</ul>`);
  lines.push(`</div>`);
  if (foundational) {
    lines.push(`<div class="cp-bottleneck"><strong>Bottleneck:</strong> T1.3 (client decision). Phase 2 cannot start until this lands. PM should escalate if T1.3 exceeds 5 business days.</div>`);
  } else {
    lines.push(`<div class="callout" style="margin-top:14px;"><strong>No Phase 1 bottleneck:</strong> the audit produced no foundational fix requiring client decision before tactical work begins. Phase 2 work starts at kickoff.</div>`);
  }
  lines.push(`</div>`);

  /* §7.3 risks */
  lines.push(`<h3 id="s7-3">§7.3 — Risk register & mitigations</h3>`);
  lines.push(`<table><thead><tr><th>Risk</th><th style="width:90px;">Likelihood</th><th style="width:140px;">Impact</th><th>Mitigation</th></tr></thead><tbody>`);
  if (foundational) {
    lines.push(`<tr><td>Client doesn't decide T1.3 within 2 weeks</td><td>Medium</td><td>High — full project stalls</td><td>DMS preps decision-ready brief at T1.1; PM books decision meeting at kickoff</td></tr>`);
  }
  if (paaGap && Array.isArray(unansweredArr) && unansweredArr.length >= 4) {
    lines.push(`<tr><td>Writer can't deliver ${unansweredArr.length} sections in 1 week</td><td>Medium</td><td>Medium — Phase 2 slips</td><td>Brief writer at Phase 1 kickoff for pre-research; consider parallel writers</td></tr>`);
  }
  if (zeroConv) {
    lines.push(`<tr><td>Conversion-tracking issue is structural (not just unconfigured)</td><td>Medium</td><td>High — recovery becomes unmeasurable</td><td>Run T3.1 in Week 2 to surface structural-vs-config question early</td></tr>`);
  }
  lines.push(`<tr><td>Re-audit at Week 5-6 shows no improvement</td><td>Medium</td><td>Medium — diagnosis questioned</td><td>Set expectation up-front: SEO changes take 3-6 months for full effect; Week 5-6 measures direction, not full recovery</td></tr>`);
  if (diffuseIntentFinding(m)) {
    lines.push(`<tr><td>Diffuse-intent SERP keeps CTR ceiling low even after pivot</td><td>Medium</td><td>Medium — recovery caps below projection</td><td>Quote conservative scenario in <a class="xref" href="#s8-1">§8.1</a> to client (not full-recovery number)</td></tr>`);
  }
  lines.push(`<tr><td>Dev team bandwidth-constrained for staging/deploy</td><td>Low</td><td>Low — Phase 2.9 slips a few days</td><td>PM books dev capacity at kickoff</td></tr>`);
  lines.push(`</tbody></table>`);

  /* §7.4 DoD */
  lines.push(`<h3 id="s7-4">§7.4 — Definition of Done</h3>`);
  lines.push(`<p>The project is <strong>done</strong> when ALL of these are true:</p>`);
  lines.push(`<ul style="list-style-type:none;padding-left:0;">`);
  if (foundational) lines.push(`<li>☐ <strong>T1.4</strong>: keyword direction decision documented + campaign config updated</li>`);
  if (firstPara && firstPara.finding.severity !== 'green') lines.push(`<li>☐ <strong>T2.3</strong>: first paragraph rewritten + deployed</li>`);
  if (paaGap && Array.isArray(unansweredArr) && unansweredArr.length > 0) lines.push(`<li>☐ <strong>T2.1</strong>: ${unansweredArr.length} new H2 sections written, reviewed, deployed</li>`);
  if (schema && paaGap) lines.push(`<li>☐ <strong>T2.5</strong>: FAQPage schema updated to match new content</li>`);
  if (meta && meta.finding.severity === 'amber') lines.push(`<li>☐ <strong>T2.4</strong>: meta description trimmed to 140-160 chars</li>`);
  if (zeroConv) lines.push(`<li>☐ <strong>T3.1/T3.2</strong>: conversion tracking verified or instrumented</li>`);
  if (imgs.length > 0) lines.push(`<li>☐ <strong>T3.3</strong>: content images converted to webp/avif</li>`);
  lines.push(`<li>☐ <strong>T3.5</strong>: re-audit run Week 5-6 post-deploy</li>`);
  lines.push(`<li>☐ <strong>T3.6</strong>: pre/post metric comparison delivered to client</li>`);
  lines.push(`</ul>`);

  /* §7.5 resources */
  lines.push(`<h3 id="s7-5">§7.5 — Resource & access requirements</h3>`);
  lines.push(`<p>Confirm at kickoff:</p>`);
  lines.push(`<ul>`);
  const dmsTasks: string[] = [];
  if (foundational) { dmsTasks.push('T1.1', 'T1.4'); }
  dmsTasks.push('T2.6', 'T3.6');
  lines.push(`<li><strong>Senior DMS</strong> — ~${foundational ? '6-8' : '4-6'} hours total across project (${dmsTasks.join(', ')})</li>`);
  const writerTasks: string[] = [];
  if (paaGap && unansweredArr && unansweredArr.length > 0) writerTasks.push('T2.1', 'T2.2');
  if (firstPara && firstPara.finding.severity !== 'green') writerTasks.push('T2.3');
  if (meta && meta.finding.severity === 'amber') writerTasks.push('T2.4');
  if (writerTasks.length > 0) {
    lines.push(`<li><strong>Content Writer</strong> — ~5-6 days during Weeks 2-3 (${writerTasks.join(', ')})</li>`);
  }
  const devTasks: string[] = [];
  if (schema && paaGap) devTasks.push('T2.5');
  devTasks.push('T2.7', 'T2.9');
  if (imgs.length > 0) devTasks.push('T3.3');
  lines.push(`<li><strong>Dev</strong> — ~1-2 days total (${devTasks.join(', ')})</li>`);
  if (zeroConv) lines.push(`<li><strong>Analytics dev</strong> — ~4-12 hours depending on T3.1 diagnosis (T3.2 scope varies)</li>`);
  lines.push(`<li><strong>Project Manager</strong> — ongoing coordination across all phases</li>`);
  if (zeroConv) lines.push(`<li><strong>GA4 admin access</strong> — required for T3.1 + re-audit baseline</li>`);
  lines.push(`<li><strong>GSC owner access</strong> — required for <a class="xref" href="#s2-6">§2.6</a> query-distribution refresh</li>`);
  lines.push(`<li><strong>CMS write access</strong> — required for T2.7 + T2.9 deploy</li>`);
  lines.push(`</ul>`);

  lines.push(`</section>`);
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
   §8 — BUSINESS IMPACT
════════════════════════════════════════════════════════════════════════ */

function renderBusinessImpactHtml(I: DeepReportInputs, m: FindingWithId[]): string {
  const ctr = ctrFinding(m);
  const ctrEv = ctr?.finding.evidence || {};
  const businessImpact = ctrEv.business_impact;
  const lines: string[] = [];
  lines.push(`<section id="s8"><h2>§8 — Business Impact Model</h2>`);
  lines.push(`<p class="section-intro">Translation of CTR underperformance into recoverable click volume and dollar opportunity. All inputs cite their source §-IDs so the math is auditable.</p>`);

  if (!ctr || !businessImpact) {
    lines.push(`<p>No business-impact model produced — CTR finding or its business_impact evidence missing.</p></section>`);
    return lines.join('\n');
  }

  /* §8.1 inputs */
  lines.push(`<h3 id="s8-1">§8.1 — Inputs (sourced)</h3>`);
  lines.push(`<table><thead><tr><th>Input</th><th>Value</th><th>Source</th></tr></thead><tbody>`);
  lines.push(`<tr><td>Monthly impressions</td><td>${num(ctrEv.impressions)}</td><td><a class="xref" href="#s2-1">§2.1</a> (GSC)</td></tr>`);
  lines.push(`<tr><td>Actual clicks (monthly)</td><td>${num(ctrEv.clicks)}</td><td><a class="xref" href="#s2-1">§2.1</a> (GSC)</td></tr>`);
  lines.push(`<tr><td>Actual CTR</td><td>${esc(ctrEv.actual_ctr_pct)}%</td><td><a class="xref" href="#s2-1">§2.1</a> (derived)</td></tr>`);
  lines.push(`<tr><td>Expected CTR for position</td><td>${esc(ctrEv.expected_ctr_pct)}%</td><td>Published benchmarks (<a class="xref" href="#s5-3">§5.3</a>)</td></tr>`);
  lines.push(`<tr><td>Ratio actual / expected</td><td>${esc(ctrEv.ratio_pct)}%</td><td><a class="xref" href="#s2-1">§2.1</a></td></tr>`);
  lines.push(`<tr><td>Expected clicks at full recovery</td><td>${num(businessImpact.expected_clicks)}</td><td>(impressions × expected CTR) ÷ 100</td></tr>`);
  lines.push(`<tr><td>Missed clicks per month</td><td>${num(businessImpact.missed_clicks)}</td><td>Expected − actual</td></tr>`);
  lines.push(`<tr><td>Click value range</td><td>$10–$30</td><td>B2B SaaS commercial-page benchmark (<a class="xref" href="#s5-3">§5.3</a>)</td></tr>`);
  lines.push(`</tbody></table>`);

  /* §8.2 scenarios */
  lines.push(`<h3 id="s8-2">§8.2 — Recovery scenarios</h3>`);
  const half = Math.round(businessImpact.missed_clicks / 2);
  lines.push(`<table><thead><tr><th>Scenario</th><th>Monthly clicks recovered</th><th>Monthly value (low)</th><th>Monthly value (high)</th></tr></thead><tbody>`);
  lines.push(`<tr><td><strong>Conservative</strong> (50% of opportunity)</td><td>~${half}</td><td>$${Math.round(businessImpact.dollar_low / 2)}</td><td>$${Math.round(businessImpact.dollar_high / 2)}</td></tr>`);
  lines.push(`<tr><td><strong>Full recovery</strong> (100% of opportunity)</td><td>~${businessImpact.missed_clicks}</td><td>$${businessImpact.dollar_low}</td><td>$${businessImpact.dollar_high}</td></tr>`);
  lines.push(`</tbody></table>`);

  /* §8.3 caveats */
  lines.push(`<h3 id="s8-3">§8.3 — Caveats and structural ceilings</h3>`);
  lines.push(`<ul>`);
  if (ctrEv.ai_overview) lines.push(`<li><strong>AI Overview present</strong> (<a class="xref" href="#s2-4">§2.4</a>) → expected-CTR benchmarks overstate achievable by 30-50%. See <a class="xref" href="#s5-1">§5.1</a>.</li>`);
  if (diffuseIntentFinding(m)) lines.push(`<li><strong>Diffuse-intent SERP</strong> (<a class="xref" href="#s2-5-1">§2.5.1</a>, <a class="xref" href="#s5-2">§5.2</a>) → CTR ceiling structurally lower than tight-intent SERPs at same position.</li>`);
  if (ctrEv.ads_top >= 3) lines.push(`<li><strong>${esc(ctrEv.ads_top)} top ads</strong> (<a class="xref" href="#s2-4">§2.4</a>) → paid placement compresses organic visibility.</li>`);
  lines.push(`<li><strong>Click value range</strong> is industry benchmark, not THIS funnel's specific value. Client's actual per-click value depends on conversion rate × deal size.</li>`);
  lines.push(`</ul>`);

  /* §8.4 realistic */
  lines.push(`<h3 id="s8-4">§8.4 — Realistic expectation</h3>`);
  lines.push(`<p>Recommend quoting clients the <strong>conservative scenario</strong> ($${Math.round(businessImpact.dollar_low / 2)}-$${Math.round(businessImpact.dollar_high / 2)}/mo). Reasons:</p>`);
  lines.push(`<ul>`);
  lines.push(`<li>Caveats in <a class="xref" href="#s8-3">§8.3</a> typically apply in combination, not isolation.</li>`);
  lines.push(`<li>SEO outcomes materialize over 3-6 months — under-promising at quoting time reduces "why isn't it working yet" friction.</li>`);
  lines.push(`<li>Re-audit (T3.5) will refine the number once measured against new baseline.</li>`);
  lines.push(`</ul>`);

  lines.push(`</section>`);
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
   §9 — SOURCE TRUST MAP
════════════════════════════════════════════════════════════════════════ */

function renderSourceTrustHtml(I: DeepReportInputs, m: FindingWithId[]): string {
  const lines: string[] = [];
  lines.push(`<section id="s9"><h2>§9 — Source Trust Map</h2>`);

  lines.push(`<h3 id="s9-1">§9.1 — Source-by-source breakdown</h3>`);
  lines.push(`<p><strong>Weighted confidence: ${I.confidence.weighted_mean}/100</strong> across ${I.confidence.sourced_count} sourced finding(s).</p>`);
  lines.push(`<table><thead><tr><th>Source</th><th style="width:90px;">Findings</th><th style="width:140px;">Trust band</th><th>Notes</th></tr></thead><tbody>`);
  const sourceNotes: Record<string, string> = {
    'Live HTML fetch': 'Fresh fetch this audit run',
    'SerpAPI (live SERP enrichment)': 'Cached ≤7d, platform-wide; refresh via re-audit',
    'Google Search Console (live)': 'GSC API lag typically 2-3 days',
    'Google Analytics 4 (live)': 'GA4 streaming; last 28 days window',
    'PageSpeed Insights API': 'Field data (CrUX) when available, else lab data',
    'Schema parser (HTML-derived)': 'Fresh fetch this audit run',
  };
  for (const [src, count] of Object.entries(I.confidence.by_source)) {
    const tb = trustBandForSource(src);
    const nt = sourceNotes[src] || '';
    lines.push(`<tr><td>${esc(src)}</td><td>${esc(count)}</td><td>${esc(tb)}</td><td>${esc(nt)}</td></tr>`);
  }
  lines.push(`</tbody></table>`);

  lines.push(`<h3 id="s9-2">§9.2 — Per-finding confidence</h3>`);
  lines.push(`<table><thead><tr><th style="width:70px;">§-ID</th><th>Finding</th><th>Source(s)</th><th style="width:90px;">Confidence</th></tr></thead><tbody>`);
  for (const fi of m) {
    const src = findingSourceLabel(fi.finding);
    const enr = Array.isArray(fi.finding.enrichment_sources) && fi.finding.enrichment_sources.length
      ? ' + ' + fi.finding.enrichment_sources.join(', ') : '';
    lines.push(`<tr><td><a class="xref" href="#${anchorId(fi.id)}">§${esc(fi.id)}</a></td><td>${esc(clip(fi.finding.finding_title, 80))}</td><td>${esc(src + enr)}</td><td>${findingConfidence(fi.finding)}/100</td></tr>`);
  }
  lines.push(`</tbody></table>`);

  lines.push(`<h3 id="s9-3">§9.3 — Failed checks (data not collected this run)</h3>`);
  if (I.failed_checks.length === 0) {
    lines.push(`<p>No checks failed. All scheduled checks executed successfully.</p>`);
  } else {
    lines.push(`<ul>`);
    for (const c of I.failed_checks) lines.push(`<li><code>${esc(c)}</code></li>`);
    lines.push(`</ul>`);
  }

  lines.push(`</section>`);
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
   §10 — GLOSSARY
════════════════════════════════════════════════════════════════════════ */

function renderGlossaryHtml(I: DeepReportInputs, m: FindingWithId[]): string {
  const terms: Array<[string, string]> = [
    ['AI Overview', 'Google\'s AI-generated summary appearing at the top of search results, above the traditional organic results. Broadly rolled out in 2024. Can suppress organic CTR by 30-50% for informational queries. See §5.1.'],
    ['Canonical URL', 'The HTML link tag (rel="canonical") telling Google which URL is the authoritative version of duplicate or near-duplicate content.'],
    ['Core Web Vitals (CWV)', 'Google\'s metrics for page-load speed (LCP), interactivity (INP), and visual stability (CLS). Minor ranking signal but a real UX-quality measurement.'],
    ['CTR (Click-Through Rate)', 'Clicks divided by impressions, expressed as a percentage. Position-by-position CTR benchmarks (used in §2.1) are published by AdvancedWebRanking, Backlinko, FirstPageSage. See §5.3.'],
    ['Diffuse-intent SERP', 'A search results page where the top 10 spans 3+ distinct intent categories — Google\'s ranking signals show it can\'t decide what users want. CTR ceilings are structurally lower than tight-intent SERPs. See §5.2.'],
    ['Featured snippet', 'An expanded answer box shown at the top of some SERPs, citing a single source page. Distinct from AI Overview (which synthesizes from multiple sources).'],
    ['Foundational fix', 'A recommendation that must be done first because every other recommendation depends on it. Doing tactical fixes before the foundational fix means redoing them when the foundational fix changes context. Marked with 🎯. See §6.1.'],
    ['GA4 (Google Analytics 4)', 'Google\'s analytics platform tracking site visitors and behavior. This audit pulls per-page GA4 data when available (§2.2).'],
    ['GSC (Google Search Console)', 'Google\'s tool showing which queries a site appears for, impressions/clicks per query, and average position. See §2.1.'],
    ['Hreflang', 'A link tag attribute telling Google which language/region variant of a page to serve. Used by multi-locale sites. See §1.7.'],
    ['Indexability', 'Whether Google can crawl and index a page. Affected by robots.txt, meta robots tag, HTTP status codes, canonical configuration. See §1.8.'],
    ['JSON-LD', 'A JSON-based format for structured-data markup (schema.org). The dominant format for schema markup on the web. See §1.3.'],
    ['LCP / INP / CLS', 'The three Core Web Vitals metrics. Largest Contentful Paint = loading speed; Interaction to Next Paint = responsiveness; Cumulative Layout Shift = visual stability.'],
    ['Meta description', 'The HTML meta tag describing a page\'s content. Often (not always) used by Google as the SERP snippet. Target 140-160 chars.'],
    ['PAA (People Also Ask)', 'Google\'s related-questions box appearing in many SERPs. Pages that explicitly answer PAA questions can capture the PAA citation. See §6.2.'],
    ['Schema markup', 'Structured data added to a page (JSON-LD format) telling Google what type of content it is — Article, FAQPage, Product, Review, etc. See §5.5 for the content-match policy.'],
    ['SerpAPI', 'Third-party API returning live Google SERP data including AI Overview presence, PAA questions, top-10 organic results, ads density, and SERP features.'],
    ['SERP (Search Engine Results Page)', 'What Google shows after a search. Each keyword has its own SERP.'],
    ['Signal (in this audit)', 'A tag attached to a finding indicating what KIND of evidence it represents. When multiple findings share a signal, they corroborate the same diagnosis (see §4.1).'],
    ['Tight-intent SERP', 'The opposite of diffuse-intent — a SERP where all top-10 results share the same intent category. CTR is higher at any given position.'],
  ];
  const lines: string[] = [];
  lines.push(`<section id="s10"><h2>§10 — Glossary</h2>`);
  lines.push(`<dl style="margin-top:8px;">`);
  for (const [term, def] of terms) {
    /* linkify §-refs inside the definition */
    const linkedDef = def.replace(/§(\d+\.\d+(?:\.\d+)*)/g, (_match, id: string) => {
      return `<a class="xref" href="#${anchorId(id)}">§${id}</a>`;
    });
    lines.push(`<dt style="font-weight:600;margin-top:10px;color:#1e293b;">${esc(term)}</dt>`);
    lines.push(`<dd style="margin-left:0;padding:4px 0 0;color:#475569;font-size:13px;">${linkedDef}</dd>`);
  }
  lines.push(`</dl>`);
  lines.push(`</section>`);
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
   §11 — METHODOLOGY
════════════════════════════════════════════════════════════════════════ */

function renderMethodologyHtml(I: DeepReportInputs, m: FindingWithId[]): string {
  const lines: string[] = [];
  lines.push(`<section id="s11"><h2>§11 — Methodology</h2>`);

  lines.push(`<h3 id="s11-1">§11.1 — What this audit checks</h3>`);
  lines.push(`<p>15 distinct checks execute per audit run. Each produces zero or more findings.</p>`);
  lines.push(`<ol>`);
  const checks = [
    'Indexability — HTTP status, robots.txt, meta robots tag, X-Robots-Tag header, GSC presence',
    'On-page fundamentals — title, meta description, H1, word count, image alt coverage, canonical, internal-link count, anchor-text classification',
    'Core Web Vitals — LCP, INP, CLS via PageSpeed Insights API (mobile + desktop)',
    'Engagement signals — per-page GA4 (sessions, engagement rate, bounce, duration, conversions); falls back to site-wide',
    'Schema markup — JSON-LD types present + per-type field validation (FAQPage Q&A structure + visible-content match, HowTo steps, Article/Product/Review required fields)',
    'Keyword presence — campaign keyword in title/H1/URL/meta/first paragraph with decision-tree recommendation',
    'CTR vs expected — actual CTR vs published per-position benchmarks, with SerpAPI verification when underperformance is detected',
    'GSC query distribution — top queries this URL actually receives impressions for',
    'First-paragraph topicality — does above-the-fold copy share substantive tokens with the page\'s own title/H1',
    'Heading-hierarchy vs PAA content gap — do the page\'s H2/H3 headings address the live PAA questions',
    'Diffuse-intent SERP detection — LLM classifies top-10 domains into intent categories; flags when 3+ distinct intents appear',
    'Competitive content benchmark — top-10 ranking competitors fetched in parallel; median word count + heading count derived',
    'Content freshness — Last-Modified header, schema dateModified/datePublished, visible "Updated:" labels, year-in-title detection',
    'Image optimization — structural signals: count, lazy-loading coverage, alt-text completeness, modern format usage',
    'Hreflang validation — only fires when hreflang annotations are present',
  ];
  for (const c of checks) lines.push(`<li>${esc(c)}</li>`);
  lines.push(`</ol>`);

  lines.push(`<h3 id="s11-2">§11.2 — Not yet covered</h3>`);
  lines.push(`<ul>`);
  const notCovered = [
    'Schema Rich Results testing via Google\'s API (currently uses offline per-type validation)',
    'Cross-domain inbound-anchor analysis (would require a backlink-data API or separate crawler)',
    'Full site crawl (this audit is single-URL scope)',
    'Manual-penalty checks',
    'Log file analysis',
    'Actual image byte-weight breakdown (currently structural patterns only)',
    'Font loading + HTTP/2 push + resource hints',
    'CSP / security headers analysis',
  ];
  for (const n of notCovered) lines.push(`<li>${esc(n)}</li>`);
  lines.push(`</ul>`);

  lines.push(`<h3 id="s11-3">§11.3 — Heuristics and thresholds</h3>`);
  lines.push(`<p>Material thresholds the audit uses for severity classification:</p>`);
  lines.push(`<ul>`);
  const thresholds = [
    'CTR underperformance: ratio < 0.5 → Critical; 0.5 ≤ ratio < 0.8 → Warning; ratio > 1.3 → Strong (green)',
    'CTR sample size: impressions ≥ 100 required for credible CTR comparison',
    'Click-value range: $10–$30 per commercial-page click (B2B SaaS benchmark)',
    'Engagement rate: per-page <40% → Critical, 40-55% → Warning, ≥55% → Pass',
    'Avg session duration: <30s on a content page with ≥50 sessions → Warning',
    'Zero conversion threshold: sessions ≥50 AND conversions == 0 → Warning',
    'Token overlap (first-paragraph topicality): 0% → Critical, <20% → Warning, ≥40% → Pass',
    'PAA gap: 0 of N PAA questions matched by headings → Critical',
    'Diffuse intent: 3+ distinct intent categories in top-10 → Warning (amber)',
    'Word-count vs competitor median: <60% of median → Critical (thin); >180% → Info (potential bloat)',
    'Content freshness: >24 months → Critical; 12-24 months → Warning; <12 months → Pass',
    'Image optimization: lazy-loading <50% on 10+ image pages → Warning; modern-format 0% on 5+ image pages → Warning',
    'Anchor-text quality: generic-or-URL-based >40% → Warning; descriptive >60% → Pass',
  ];
  for (const t of thresholds) lines.push(`<li>${esc(t)}</li>`);
  lines.push(`</ul>`);

  lines.push(`<h3 id="s11-4">§11.4 — Role view mapping</h3>`);
  lines.push(`<p>How each role can extract a tailored view from this document — both for humans reading and for LLMs queried with the doc as context:</p>`);
  lines.push(`<table><thead><tr><th>Role</th><th>Sections to read</th><th>Cross-reference depth</th></tr></thead><tbody>`);
  const roleMap: Array<[string, string, string]> = [
    ['Senior DMS', 'All sections, with attention to §4 (convergence) and §5 (industry context)', 'Full graph — every claim traceable'],
    ['Client', '§0 (exec summary) + §8 (impact model) + top-3 from §6', 'Cross-refs back to §3 evidence on request'],
    ['Content Writer', '§1.1, §1.2 (current state) + §3.X for PAA gap + §6.2 (content recommendations) + §5.5 (schema policy)', 'Follow §6.2 → §3 → §1 cross-refs'],
    ['PM', '§7 (task map) — each task cross-refs back to §6 + §3', 'Use §7.1 as pipeline input'],
    ['Sales', '§0 + §4.2 (hardened diagnoses) + §8 (dollar opportunity)', 'Quote §-IDs as evidence in pitch'],
    ['Junior SEO', '§3 (findings) + §5 (industry context) + §10 (glossary)', 'Read full evidence chains for learning value'],
  ];
  for (const [role, sections, depth] of roleMap) {
    lines.push(`<tr><td><strong>${esc(role)}</strong></td><td>${esc(sections).replace(/§(\d+\.\d+(?:\.\d+)*|\d+)/g, (_m, id: string) => `<a class="xref" href="#${anchorId(id)}">§${id}</a>`)}</td><td>${esc(depth)}</td></tr>`);
  }
  lines.push(`</tbody></table>`);

  lines.push(`<div class="report-footer">Run id: <code>${esc(I.run_id)}</code> · Generated by SEO Season — Technical Audit (deep-doc renderer)</div>`);
  lines.push(`</section>`);
  return lines.join('\n');
}
