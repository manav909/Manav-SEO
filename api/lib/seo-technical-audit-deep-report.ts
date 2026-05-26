/* ════════════════════════════════════════════════════════════════════════
   seo-technical-audit-deep-report.ts

   Single-document deep technical SEO audit report. Replaces the multi-lens
   architecture (Phase 16.8 retired). One source of truth, internally
   cross-referenced, machine-parsable for downstream pipelines.

   Design principles (Manav 2026-05-24 architectural call):

   1. ONE DOCUMENT, NOT SIX. Same findings, one comprehensive narrative.
      Any role reads the sections relevant to them. Any LLM uploaded the
      doc can derive role-specific outputs (PM tasks, client summary,
      content brief, sales hooks) by querying the cross-reference graph.

   2. STABLE §-IDs. Each section gets a deterministic identifier — §3.4,
      §6.2.1, §8.3 — so cross-references survive across audit runs.
      §1, §2  — current-state data
      §3      — findings (one §-ID per finding)
      §4-§5   — analysis layers built ON findings
      §6      — recommendations (each cross-refs the finding it addresses)
      §7      — task map (each cross-refs the recommendation it implements)
      §8      — business impact model
      §9-§12  — trust/glossary/methodology/appendix

   3. EVERY CLAIM CITES ITS SOURCE. Cross-refs render as (§3.4) in
      narrative and as full anchor links in section headings. A reader
      can follow any thread to its supporting data.

   4. NO LLM CALLS in the renderer. All content is templated from
      structured Finding evidence. (Audit-side augmentations in
      Phase 16.9 ensured the evidence carries what the renderer needs:
      SerpAPI features now in CTR evidence, business-impact dollars
      now structured, etc.)

   5. EMPTY SECTIONS RENDER AN EXPLICIT NOTE rather than being omitted.
      A missing §6.2 because no Phase 2 work applies still gets a row
      saying so — so the cross-reference graph stays stable across runs.

   Architecture for future role-extraction:

   When Manav (or a future pipeline) uploads this document to an LLM
   asking for "the PM plan" or "the content brief", the LLM reads:
     - PM plan       → §7 (task map) + cross-refs back to §6 + §3
     - Content brief → §1.1 + §1.2 + §3.X (PAA gap) + §6.2 + §5.5
     - Client summary → §0 + §8 + top-3 from §6
     - Sales hooks   → §0 + §4 (hardened diagnoses) + §8 (dollar opp)
     - Junior SEO learning → §3 (findings) + §5 (industry context) + §10

   No additional rendering code required — the LLM does the role view.
════════════════════════════════════════════════════════════════════════ */

import type { Finding } from "./seo-technical-audit.js";

/* ════════════════════════════════════════════════════════════════════════
   PUBLIC API
════════════════════════════════════════════════════════════════════════ */

export interface DeepReportInputs {
  url: string;
  keyword: string;
  source: string;
  source_note?: string;
  run_id: string;
  audited_at: string;
  failed_checks: string[];
  findings: Finding[];
  red_count: number;
  amber_count: number;
  green_count: number;
  info_count: number;
  confidence: {
    weighted_mean: number;
    sourced_count: number;
    unattributed_count: number;
    by_source: Record<string, number>;
  };
  converging_banner?: string | null;  // optional; renderer derives §4 from signals directly
}

/** Stable per-finding §-ID assignment. Sort: Critical (red) → Warning
 *  (amber) → Pass (green) → Info. Within each severity, preserve
 *  insertion order (which mirrors the check execution order). */
interface FindingWithId {
  id: string;       // e.g. "3.4"
  finding: Finding;
}

export function renderDeepAuditReport(I: DeepReportInputs): string {
  const findingMap = assignFindingIds(I.findings);
  const lines: string[] = [];

  renderTitleHeader(lines, I);
  renderTableOfContents(lines, I, findingMap);
  renderExecutiveSummary(lines, I, findingMap);          // §0
  renderPageInventory(lines, I, findingMap);             // §1
  renderSearchPerformanceBaseline(lines, I, findingMap); // §2
  renderFindings(lines, I, findingMap);                  // §3
  renderConvergenceAnalysis(lines, I, findingMap);       // §4
  renderSeoEconomicsContext(lines, I, findingMap);       // §5
  renderRecommendations(lines, I, findingMap);           // §6
  renderEffortDependencyMap(lines, I, findingMap);       // §7
  renderBusinessImpactModel(lines, I, findingMap);       // §8
  renderSourceTrustMap(lines, I, findingMap);            // §9
  renderGlossary(lines, I, findingMap);                  // §10
  renderMethodology(lines, I, findingMap);               // §11
  renderAppendix(lines, I, findingMap);                  // §12

  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
   ID ASSIGNMENT — stable §3.N for each finding
════════════════════════════════════════════════════════════════════════ */

function assignFindingIds(findings: Finding[]): FindingWithId[] {
  const order: Record<Finding['severity'], number> = { red: 0, amber: 1, green: 2, info: 3 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
  return sorted.map((f, i) => ({ id: `3.${i + 1}`, finding: f }));
}

function findingsBy(findingMap: FindingWithId[], pred: (f: Finding) => boolean): FindingWithId[] {
  return findingMap.filter(({ finding }) => pred(finding));
}
function firstFindingBy(findingMap: FindingWithId[], pred: (f: Finding) => boolean): FindingWithId | null {
  return findingMap.find(({ finding }) => pred(finding)) || null;
}

/* ════════════════════════════════════════════════════════════════════════
   EVIDENCE EXTRACTORS — typed accessors for findings
════════════════════════════════════════════════════════════════════════ */

function ctrFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /CTR is .+ of expected/i.test(f.finding_title));
}
function keywordPresenceFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /Campaign keyword .+ partially present|Campaign keyword .+ not present|keyword .+ alignment gap/i.test(f.finding_title));
}
function firstParagraphFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /First paragraph (is off-topic|weakly aligned|well-aligned)/i.test(f.finding_title));
}
function paaGapFinding(m: FindingWithId[]) {
  /* Match all PAA finding title variants:
     "Content gap — none of the N PAA questions..."
     "N of N PAA questions...are NOT addressed..."
     "All N PAA questions...are addressed by existing headings"  (old)
     "All N PAA questions...have matching headings..."           (new) */
  return firstFindingBy(m, f =>
    /Content gap.+PAA|PAA questions.+(addressed|matching heading)/i.test(f.finding_title) ||
    /All \d+ PAA questions/i.test(f.finding_title)
  );
}
function diffuseIntentFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /Diffuse-intent SERP|Tight-intent SERP/i.test(f.finding_title));
}
function competitiveContentFinding(m: FindingWithId[]) {
  /* Phase 16.10 — only match findings that carry the actual comparison
     evidence (audited_word_count + competitor_median), not the basic
     "Word count: ~3052 words" pass finding which has only `word_count`.
     The previous regex /word count/i matched §3.15 first (basic word
     count) and §2.5 inventory came up empty. */
  return firstFindingBy(m, f => {
    const ev = f.evidence || {};
    const titleHit = /Content depth|content exceeds SERP median|word count.*competitor|competitor median|SERP median/i.test(f.finding_title);
    const evidenceHit = (ev.audited_word_count !== undefined && ev.competitor_median !== undefined);
    return titleHit || evidenceHit;
  });
}
function perPageGa4Finding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /Per-page engagement rate|Per-page avg session/i.test(f.finding_title));
}
function zeroConversionFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /Zero conversions recorded/i.test(f.finding_title));
}
function contentFreshnessFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /Content is (fresh|stale|aging)|freshness signal/i.test(f.finding_title));
}
function imageOptFindings(m: FindingWithId[]) {
  return findingsBy(m, f => /modern image format|images? missing alt|Lazy-loading|image optimization/i.test(f.finding_title));
}
function anchorTextFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /Anchor-text quality|anchors are descriptive|anchors are generic|Anchor-text mix/i.test(f.finding_title));
}
function schemaFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /Schema (present|validation|fields missing)/i.test(f.finding_title));
}
function cwvFindings(m: FindingWithId[]) {
  return findingsBy(m, f => /Core Web Vitals|PageSpeed Insights|LCP|INP|CLS/i.test(f.finding_title));
}
function metaDescFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /Meta description/i.test(f.finding_title));
}
function titleFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /Title tag/i.test(f.finding_title));
}
function h1Finding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /Single H1|H1 missing|Multiple H1/i.test(f.finding_title));
}
function wordCountFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /^Word count:/i.test(f.finding_title));
}
function canonicalFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /canonical/i.test(f.finding_title));
}
function indexabilityFindings(m: FindingWithId[]) {
  return findingsBy(m, f => f.audit_kind === 'indexability' || f.audit_kind === 'robots');
}
function internalLinksCountFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /internal links present/i.test(f.finding_title));
}
function hreflangFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /Hreflang/i.test(f.finding_title));
}
function queryDistributionFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => /query distribution|top queries this URL/i.test(f.finding_title));
}
function foundationalFinding(m: FindingWithId[]) {
  return firstFindingBy(m, f => f.is_foundational === true);
}

/* ════════════════════════════════════════════════════════════════════════
   HELPERS — markdown formatting + cross-reference helpers
════════════════════════════════════════════════════════════════════════ */

/** Render a cross-reference as `(see §3.4 — Title)` inline with anchor link. */
function xref(fi: FindingWithId | null, opts?: { paren?: boolean }): string {
  if (!fi) return '';
  const anchor = `finding-${fi.id.replace('.', '-')}`;
  const inner = `[§${fi.id}](#${anchor}) — ${fi.finding.finding_title}`;
  return opts?.paren === false ? inner : `(see ${inner})`;
}
function xrefShort(fi: FindingWithId | null): string {
  if (!fi) return '';
  const anchor = `finding-${fi.id.replace('.', '-')}`;
  return `[§${fi.id}](#${anchor})`;
}
/** Severity emoji */
function sev(s: Finding['severity']): string {
  return s === 'red' ? '🔴' : s === 'amber' ? '🟡' : s === 'green' ? '🟢' : 'ℹ️';
}
function sevLabel(s: Finding['severity']): string {
  return s === 'red' ? 'Critical' : s === 'amber' ? 'Warning' : s === 'green' ? 'Pass' : 'Info';
}
/** Format a number with commas. */
function num(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString();
}
/** Format a dollar value range. */
function dollars(low: number | undefined | null, high: number | undefined | null): string {
  if (!low || !high) return '—';
  return `\\$${low.toLocaleString()}–\\$${high.toLocaleString()}`;
}
function pct(n: number | undefined | null, places = 1): string {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return `${n.toFixed(places)}%`;
}
function clip(s: string | undefined | null, max = 180): string {
  if (!s) return '—';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
function bullet(line: string): string {
  return `- ${line}`;
}

/* ════════════════════════════════════════════════════════════════════════
   HEADER + TOC
════════════════════════════════════════════════════════════════════════ */

function renderTitleHeader(lines: string[], I: DeepReportInputs): void {
  lines.push(`# Technical SEO Audit Report`);
  lines.push('');
  lines.push(`**Audited URL:** [${I.url}](${I.url})`);
  lines.push(`**Campaign keyword:** \`${I.keyword}\``);
  lines.push(`**Target URL source:** ${I.source}${I.source_note ? ` _(${I.source_note})_` : ''}`);
  lines.push(`**Audited at:** ${I.audited_at}`);
  lines.push(`**Audit run id:** \`${I.run_id}\``);
  lines.push('');
  lines.push(`> **How to read this document:** this is the single source of truth for the audit. Every finding is numbered with a stable §-ID (e.g. §3.4) so other sections can reference it. Cross-references render as \`(see §3.4 — Finding title)\` — follow them to trace any claim back to its supporting evidence.`);
  lines.push('');
  lines.push(`> **For role-specific extraction:** any reader (human or LLM) can derive a role-tailored view by reading the sections relevant to that role. The mapping is documented in §11.3.`);
  lines.push('');
}

function renderTableOfContents(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## Table of Contents`);
  lines.push('');
  lines.push(`- **§0 — Executive Summary**`);
  lines.push(`- **§1 — Page Inventory** (current state of the audited URL)`);
  lines.push(`  - §1.1 Page metadata (title, H1, meta description, first paragraph)`);
  lines.push(`  - §1.2 Content structure (word count, heading hierarchy)`);
  lines.push(`  - §1.3 Schema markup`);
  lines.push(`  - §1.4 Image inventory`);
  lines.push(`  - §1.5 Internal-link inventory & anchor-text distribution`);
  lines.push(`  - §1.6 Content freshness signals`);
  lines.push(`  - §1.7 Hreflang configuration`);
  lines.push(`  - §1.8 Indexability`);
  lines.push(`- **§2 — Search Performance Baseline**`);
  lines.push(`  - §2.1 GSC metrics (clicks, impressions, CTR vs benchmark, position)`);
  lines.push(`  - §2.2 GA4 per-page engagement`);
  lines.push(`  - §2.3 Live SERP composition for campaign keyword`);
  lines.push(`  - §2.4 SerpAPI feature detection`);
  lines.push(`  - §2.5 Competitive content landscape`);
  lines.push(`  - §2.6 GSC query distribution`);
  lines.push(`- **§3 — Findings (${m.length} total)**`);
  for (const fi of m) {
    /* Markdown anchor: lowercase the id, replace dot with empty (§3.7 -> finding-3-7) */
    const anchor = `finding-${fi.id.replace('.', '-')}`;
    lines.push(`  - [§${fi.id} ${sev(fi.finding.severity)} ${fi.finding.finding_title}${fi.finding.is_foundational ? ' 🎯' : ''}](#${anchor})`);
  }
  lines.push(`- **§4 — Convergence Analysis**`);
  lines.push(`- **§5 — SEO Economics Context**`);
  lines.push(`- **§6 — Recommendations (sequenced)**`);
  lines.push(`  - §6.1 Phase 1: Foundational`);
  lines.push(`  - §6.2 Phase 2: Content overhaul`);
  lines.push(`  - §6.3 Phase 3: Validation & parallel workstreams`);
  lines.push(`- **§7 — Effort & Dependency Map**`);
  lines.push(`- **§8 — Business Impact Model**`);
  lines.push(`- **§9 — Source Trust Map**`);
  lines.push(`- **§10 — Glossary**`);
  lines.push(`- **§11 — Methodology**`);
  lines.push(`- **§12 — Appendix (raw evidence)**`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
}

/* ════════════════════════════════════════════════════════════════════════
   §0 — EXECUTIVE SUMMARY
════════════════════════════════════════════════════════════════════════ */

function renderExecutiveSummary(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## §0 — Executive Summary`);
  lines.push('');

  const ctr = ctrFinding(m);
  const kw = keywordPresenceFinding(m);
  const diffuse = diffuseIntentFinding(m);
  const ga4 = perPageGa4Finding(m);
  const zeroConv = zeroConversionFinding(m);
  const foundational = foundationalFinding(m);
  const ctrEv = ctr?.finding.evidence || {};
  const kwEv = kw?.finding.evidence || {};
  const businessImpact = ctrEv.business_impact;
  const suggestedPivot = kwEv.inferred_actual_topic?.suggested_keyword_phrase;

  lines.push(`### §0.1 Diagnosis`);
  lines.push('');
  if (kw && ctr) {
    /* Phase 16.10 — dynamic cross-ref construction. Previous version
       hardcoded "Four independent measurements" while emitting xref(null)
       for any missing finding, producing a count mismatch. Now: build the
       list from non-null cross-refs and number-name accordingly. */
    const firstPara = firstParagraphFinding(m);
    const diagXrefs: FindingWithId[] = [];
    if (foundational) diagXrefs.push(foundational);
    if (ctr && ctr !== foundational) diagXrefs.push(ctr);
    if (firstPara && firstPara !== foundational) diagXrefs.push(firstPara);
    if (diffuse && diffuse !== foundational) diagXrefs.push(diffuse);
    const numberWord = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'][diagXrefs.length] || `${diagXrefs.length}`;
    const xrefList = diagXrefs.map(fi => xref(fi)).join(', ');
    lines.push(`This page is targeted at \`${I.keyword}\` but the underlying content is built for **${suggestedPivot || 'a different keyword'}**. ${numberWord} independent measurement(s) corroborate this diagnosis: ${xrefList}. The convergence is documented in §4.2.`);
    lines.push('');
    if (ctrEv.ratio_pct !== undefined && businessImpact) {
      lines.push(`The keyword mismatch produces a measurable revenue gap: actual CTR is **${ctrEv.ratio_pct}%** of expected for position **${ctrEv.position?.toFixed(1)}**, translating to **~${num(businessImpact.missed_clicks)} missed monthly clicks** worth **${dollars(businessImpact.dollar_low, businessImpact.dollar_high)} monthly** at B2B SaaS commercial-page click values. Full business-impact model in §8.`);
      lines.push('');
    }
    if (diffuse) {
      const cats = diffuse.finding.evidence?.distinct_categories;
      if (cats) lines.push(`Compounding: the live SERP for \`${I.keyword}\` spans **${cats} distinct intent categories** ${xref(diffuse)}. This is a structurally diffuse SERP — even a #1 ranking competes for click-share against fundamentally different result types. The keyword-pivot recommendation matters more here than on a tight-intent SERP. Industry context in §5.2.`);
      lines.push('');
    }
  } else if (ctr) {
    lines.push(`CTR underperformance is the primary signal ${xref(ctr)}. The keyword-presence analysis did not produce a clear pivot recommendation — manually verify whether this is a CTR-tactics problem or a deeper targeting problem before committing to recovery work.`);
    lines.push('');
  } else {
    lines.push(`The audit produced ${I.red_count} Critical, ${I.amber_count} Warning, ${I.green_count} Pass, and ${I.info_count} Info findings. See §3 for the full finding list; §6 for the sequenced recommendation set.`);
    lines.push('');
  }

  lines.push(`### §0.2 Top three actions (in execution order)`);
  lines.push('');
  /* Phase 16.10 — dynamic numbering. Previous version hardcoded **1.** for
     foundational, **2.** for PAA gap, **3.** for zero-conversion — so
     when foundational was null the list started at "2." with no "1.",
     producing a numbering hole. Now we build the action list as
     {bold_lead, tail} pairs and render them sequentially with correct
     bold scoping. */
  type Action = { lead: string; tail: string };
  const actionItems: Action[] = [];
  if (foundational) {
    actionItems.push({
      lead: foundational.finding.finding_title,
      tail: ` — foundational fix ${xref(foundational)}. Detail in §6.1.`,
    });
  }
  const paaGap = paaGapFinding(m);
  if (paaGap) {
    const paaCount = paaGap.finding.evidence?.unanswered?.length || paaGap.finding.evidence?.paa_total || 0;
    actionItems.push({
      lead: `Add ${paaCount} new H2 sections answering live PAA questions`,
      tail: ` ${xref(paaGap)}. Each section needs a 40-80 word direct answer as its first sentence. Detail and per-question briefs in §6.2.1.`,
    });
  }
  if (zeroConv) {
    actionItems.push({
      lead: `Verify GA4 conversion tracking`,
      tail: ` ${xref(zeroConv)}. Zero conversions on ${num(zeroConv.finding.evidence?.sessions)} sessions is either a measurement gap or a real funnel problem — needs analyst diagnosis before any traffic-recovery work pays off. Detail in §6.3.1.`,
    });
  }
  /* When foundational exists but we still have fewer than 3 items,
     fill from next-highest-priority findings: first para, image opt,
     keyword alignment — anything amber or higher. */
  if (actionItems.length < 3) {
    const candidates = m.filter(fi =>
      (fi.finding.severity === 'red' || fi.finding.severity === 'amber') &&
      fi.finding !== foundational?.finding &&
      fi.finding !== paaGap?.finding &&
      fi.finding !== zeroConv?.finding
    );
    for (const fi of candidates) {
      if (actionItems.length >= 3) break;
      actionItems.push({ lead: fi.finding.finding_title, tail: ` ${xref(fi)}.` });
    }
  }
  /* Fallback when none of the standard action sources fired */
  if (actionItems.length === 0) {
    const firstRed = m.find(f => f.finding.severity === 'red');
    if (firstRed) actionItems.push({ lead: firstRed.finding.finding_title, tail: ` ${xref(firstRed)}. See §6 for full sequencing.` });
    else actionItems.push({ lead: 'No Critical-severity actions surfaced', tail: '. See §6.3 for Phase-3 parallel work that can still ship.' });
  }
  for (let i = 0; i < actionItems.length; i++) {
    const a = actionItems[i];
    lines.push(`**${i + 1}. ${a.lead}**${a.tail}`);
    lines.push('');
  }

  lines.push(`### §0.3 Severity summary`);
  lines.push('');
  lines.push(`| Severity | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| 🔴 Critical | ${I.red_count} |`);
  lines.push(`| 🟡 Warning | ${I.amber_count} |`);
  lines.push(`| 🟢 Pass | ${I.green_count} |`);
  lines.push(`| ℹ️ Info | ${I.info_count} |`);
  lines.push('');

  lines.push(`### §0.4 Source confidence`);
  lines.push('');
  lines.push(`**Weighted confidence: ${I.confidence.weighted_mean}/100** across ${I.confidence.sourced_count} sourced finding(s). Full source-by-source breakdown in §9.`);
  if (I.failed_checks.length > 0) {
    lines.push('');
    lines.push(`⚠️ **${I.failed_checks.length} check(s) failed to execute:** ${I.failed_checks.map(s => `\`${s}\``).join(', ')}. Findings below are partial.`);
  }
  lines.push('');
  lines.push(`---`);
  lines.push('');
}

/* ════════════════════════════════════════════════════════════════════════
   §1 — PAGE INVENTORY
════════════════════════════════════════════════════════════════════════ */

function renderPageInventory(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## §1 — Page Inventory`);
  lines.push('');
  lines.push(`> Current state of the audited URL. This section documents what's THERE — findings in §3 interpret what that means. Every value below is sourced from live HTML fetch unless noted.`);
  lines.push('');

  /* §1.1 — Page metadata */
  lines.push(`### §1.1 — Page metadata`);
  lines.push('');
  const titleF = titleFinding(m);
  const h1F = h1Finding(m);
  const kw = keywordPresenceFinding(m);
  const meta = metaDescFinding(m);
  const firstPara = firstParagraphFinding(m);

  /* Pull title/H1 from coverage object if keyword-presence finding exists, else from individual findings */
  const coverage = kw?.finding.evidence?.coverage;
  const titleStr = coverage?.title?.value || titleF?.finding.evidence?.title;
  const h1Str = coverage?.h1?.value || h1F?.finding.evidence?.h1 || h1F?.finding.evidence?.h1_first;
  const metaStr = coverage?.meta_description?.value || meta?.finding.evidence?.meta_description;
  const firstParaStr = coverage?.first_paragraph?.value || firstPara?.finding.evidence?.first_paragraph;

  lines.push(`| Element | Value | Length | Cross-ref |`);
  lines.push(`|---|---|---|---|`);
  lines.push(`| URL | \`${I.url}\` | — | — |`);
  lines.push(`| Title | "${clip(titleStr, 200)}" | ${titleStr ? titleStr.length + ' chars' : '—'} | ${xrefShort(titleF)} |`);
  lines.push(`| H1 | "${clip(h1Str, 200)}" | — | ${xrefShort(h1F)} |`);
  lines.push(`| Meta description | "${clip(metaStr, 200)}" | ${metaStr ? metaStr.length + ' chars' : '—'} | ${xrefShort(meta)} |`);
  lines.push(`| First paragraph | "${clip(firstParaStr, 240)}" | — | ${xrefShort(firstPara)} |`);
  lines.push(`| Campaign keyword | \`${I.keyword}\` | — | ${xrefShort(kw)} |`);
  lines.push('');

  /* §1.2 — Content structure */
  lines.push(`### §1.2 — Content structure`);
  lines.push('');
  const wc = wordCountFinding(m);
  const wcVal = wc?.finding.evidence?.word_count;
  const paa = paaGapFinding(m);
  const h2c = paa?.finding.evidence?.h2_count;
  const h3c = paa?.finding.evidence?.h3_count;
  lines.push(`| Field | Value | Cross-ref |`);
  lines.push(`|---|---|---|`);
  lines.push(`| Word count | ${wcVal ? num(wcVal) + ' words' : '—'} | ${xrefShort(wc)} |`);
  lines.push(`| H2 count | ${h2c !== undefined ? h2c : '—'} | ${xrefShort(paa)} |`);
  lines.push(`| H3 count | ${h3c !== undefined ? h3c : '—'} | ${xrefShort(paa)} |`);
  const canon = canonicalFinding(m);
  lines.push(`| Canonical | ${canon?.finding.evidence?.canonical ? '`' + canon.finding.evidence.canonical + '`' : '—'} | ${xrefShort(canon)} |`);
  lines.push('');

  /* §1.3 — Schema markup */
  lines.push(`### §1.3 — Schema markup`);
  lines.push('');
  const schema = schemaFinding(m);
  if (schema) {
    const types = schema.finding.evidence?.types;
    const blockCount = schema.finding.evidence?.block_count;
    lines.push(`- **Types present:** ${Array.isArray(types) && types.length ? types.map((t: string) => `\`${t}\``).join(', ') : '—'}`);
    if (blockCount !== undefined) lines.push(`- **JSON-LD blocks:** ${blockCount}`);
    if (schema.finding.evidence?.validation_issues) {
      lines.push(`- **Validation issues:** ${schema.finding.evidence.validation_issues.length} — see ${xrefShort(schema)}`);
    } else {
      lines.push(`- **Validation status:** all per-type checks passed — see ${xrefShort(schema)}`);
    }
  } else {
    lines.push(`No schema markup detected on this page.`);
  }
  lines.push('');

  /* §1.4 — Image inventory */
  lines.push(`### §1.4 — Image inventory`);
  lines.push('');
  const imgs = imageOptFindings(m);
  if (imgs.length > 0) {
    /* Find the most-data-rich image finding for the inventory line */
    const richest = imgs.reduce<FindingWithId | null>((acc, x) => {
      const xc = x.finding.evidence?.total_images ?? 0;
      const ac = acc?.finding.evidence?.total_images ?? 0;
      return xc >= ac ? x : acc;
    }, null);
    const ev = richest?.finding.evidence || {};
    lines.push(`| Field | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Total content images (tracking pixels filtered) | ${ev.total_images ?? '—'} |`);
    lines.push(`| With alt text | ${ev.with_alt ?? '—'}${ev.with_alt && ev.total_images ? ` (${Math.round((ev.with_alt / ev.total_images) * 100)}%)` : ''} |`);
    lines.push(`| Lazy-loaded | ${ev.with_lazy ?? '—'}${ev.with_lazy && ev.total_images ? ` (${Math.round((ev.with_lazy / ev.total_images) * 100)}%)` : ''} |`);
    lines.push(`| Responsive (srcset) | ${ev.with_srcset ?? '—'}${ev.with_srcset && ev.total_images ? ` (${Math.round((ev.with_srcset / ev.total_images) * 100)}%)` : ''} |`);
    lines.push(`| Modern format (webp/avif) | ${ev.modern_format ?? '—'} |`);
    lines.push(`| Legacy format (jpg/png/gif) | ${ev.legacy_format ?? '—'} |`);
    /* Phase 16.10 — show unclassified images so the breakdown sums to total */
    if (ev.other_format !== undefined && ev.other_format > 0) {
      lines.push(`| Other format (svg/data-uri/cdn-no-ext) | ${ev.other_format} |`);
    }
    lines.push('');
    lines.push(`Related findings: ${imgs.map(f => xrefShort(f)).join(', ')}`);
  } else {
    lines.push(`No image-optimization findings produced for this page.`);
  }
  lines.push('');

  /* §1.5 — Internal-link inventory */
  lines.push(`### §1.5 — Internal-link inventory & anchor-text distribution`);
  lines.push('');
  const linkCount = internalLinksCountFinding(m);
  const anchor = anchorTextFinding(m);
  if (linkCount || anchor) {
    const lcEv = linkCount?.finding.evidence || {};
    const acEv = anchor?.finding.evidence || {};
    lines.push(`| Field | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Total internal links | ${lcEv.internal_link_count ?? acEv.internal_links_total ?? '—'} |`);
    if (acEv.descriptive !== undefined) {
      lines.push(`| Descriptive anchors | ${acEv.descriptive}${acEv.internal_links_total ? ` (${Math.round((acEv.descriptive / acEv.internal_links_total) * 100)}%)` : ''} |`);
      lines.push(`| Single-word / nav anchors | ${acEv.single_word ?? '—'} |`);
      lines.push(`| Generic anchors ("click here", etc.) | ${acEv.generic ?? '—'} |`);
      lines.push(`| URL-based anchors | ${acEv.url_based ?? '—'} |`);
    }
    lines.push('');
    lines.push(`Related findings: ${[linkCount, anchor].filter(Boolean).map(f => xrefShort(f)).join(', ')}`);
  } else {
    lines.push(`Internal-link inventory not produced for this page.`);
  }
  lines.push('');

  /* §1.6 — Content freshness */
  lines.push(`### §1.6 — Content freshness signals`);
  lines.push('');
  const fresh = contentFreshnessFinding(m);
  if (fresh) {
    const fev = fresh.finding.evidence || {};
    lines.push(`| Field | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Age (months since most recent signal) | ${fev.age_months ?? '—'} |`);
    lines.push(`| Most-recent date | ${fev.most_recent_date ? fev.most_recent_date.slice(0, 10) : '—'} |`);
    lines.push(`| Source of most-recent signal | ${fev.most_recent_source ? '`' + fev.most_recent_source + '`' : '—'} |`);
    if (Array.isArray(fev.all_dates) && fev.all_dates.length > 0) {
      lines.push(`| All detected signals | ${fev.all_dates.length} |`);
    }
    lines.push('');
    lines.push(`Related finding: ${xrefShort(fresh)}`);
  } else {
    lines.push(`No content-freshness signals detected on this page (or check didn't fire).`);
  }
  lines.push('');

  /* §1.7 — Hreflang */
  lines.push(`### §1.7 — Hreflang configuration`);
  lines.push('');
  const hreflang = hreflangFinding(m);
  if (hreflang) {
    const entries = hreflang.finding.evidence?.entries;
    if (Array.isArray(entries) && entries.length > 0) {
      lines.push(`${entries.length} hreflang annotation(s) detected. Related finding: ${xrefShort(hreflang)}.`);
    } else {
      lines.push(`No hreflang annotations on this page (single-locale page — no penalty for absence).`);
    }
  } else {
    lines.push(`No hreflang annotations on this page (single-locale page — no penalty for absence).`);
  }
  lines.push('');

  /* §1.8 — Indexability */
  lines.push(`### §1.8 — Indexability`);
  lines.push('');
  const idxs = indexabilityFindings(m);
  if (idxs.length > 0) {
    for (const ix of idxs) {
      lines.push(bullet(`${sev(ix.finding.severity)} ${ix.finding.finding_title} ${xref(ix)}`));
    }
  } else {
    lines.push(`No indexability findings — neither blocking nor flagged.`);
  }
  lines.push('');
  lines.push(`---`);
  lines.push('');
}

/* ════════════════════════════════════════════════════════════════════════
   §2 — SEARCH PERFORMANCE BASELINE
════════════════════════════════════════════════════════════════════════ */

function renderSearchPerformanceBaseline(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## §2 — Search Performance Baseline`);
  lines.push('');
  lines.push(`> What GSC, GA4, SerpAPI, and PSI report about this URL right now. Each subsection cites the finding §-ID(s) that interpret the data.`);
  lines.push('');

  /* §2.1 — GSC metrics */
  lines.push(`### §2.1 — GSC metrics (Google Search Console, live)`);
  lines.push('');
  const ctr = ctrFinding(m);
  const ctrEv = ctr?.finding.evidence || {};
  if (ctr) {
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Clicks (28d) | ${num(ctrEv.clicks)} |`);
    lines.push(`| Impressions (28d) | ${num(ctrEv.impressions)} |`);
    lines.push(`| CTR actual | ${pct(ctrEv.actual_ctr_pct, 2)} |`);
    lines.push(`| CTR expected for position | ${pct(ctrEv.expected_ctr_pct, 1)} |`);
    lines.push(`| Ratio actual / expected | ${ctrEv.ratio_pct ?? '—'}% |`);
    lines.push(`| Avg position (GSC) | ${ctrEv.position?.toFixed(1) ?? '—'} |`);
    lines.push('');
    lines.push(`Interpretation finding: ${xref(ctr)}.`);
  } else {
    /* Check why — is the page in GSC at all? */
    const inGscF = firstFindingBy(m, f => /Page is indexed and appearing|Page not in GSC/i.test(f.finding_title));
    if (inGscF && /Page not in GSC/i.test(inGscF.finding.finding_title)) {
      lines.push(`Page not in GSC top pages — either not indexed yet or getting 0 impressions for this keyword. CTR analysis requires ≥100 impressions at a measurable position.`);
      lines.push('');
      lines.push(`**Next step:** Open Google Search Console → URL Inspection → paste \`${I.url}\` → check indexing status. If not indexed, click **Request Indexing**. Come back in 24-48 hours.`);
    } else {
      lines.push(`GSC impressions for this URL are below the 100-impression threshold required for a credible CTR-vs-benchmark comparison. Insufficient data — monitor as organic visibility grows.`);
    }
  }
  lines.push('');

  /* §2.2 — GA4 per-page engagement */
  lines.push(`### §2.2 — GA4 per-page engagement (last 28 days)`);
  lines.push('');
  const ga4 = perPageGa4Finding(m);
  const ga4Ev = ga4?.finding.evidence || {};
  if (ga4 && ga4Ev.scope === 'per-page') {
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Sessions | ${num(ga4Ev.sessions)} |`);
    lines.push(`| Engaged sessions | ${num(ga4Ev.engaged_sessions)}${ga4Ev.engagement_rate_pct !== undefined ? ` (${ga4Ev.engagement_rate_pct.toFixed(1)}%)` : ''} |`);
    lines.push(`| Avg session duration | ${ga4Ev.avg_session_sec !== undefined ? ga4Ev.avg_session_sec.toFixed(0) + 's' : '—'} |`);
    lines.push(`| Bounce rate | ${ga4Ev.bounce_rate_pct !== undefined ? ga4Ev.bounce_rate_pct.toFixed(1) + '%' : '—'} |`);
    lines.push(`| Page views | ${num(ga4Ev.views)} |`);
    lines.push(`| Conversions | ${ga4Ev.conversions !== undefined ? ga4Ev.conversions : '—'} |`);
    lines.push('');
    lines.push(`Engagement interpretation: ${xref(ga4)}.`);
    const zeroConv = zeroConversionFinding(m);
    if (zeroConv) {
      lines.push(`Zero-conversion alert: ${xref(zeroConv)}.`);
    }
  } else if (ga4) {
    lines.push(`Per-page GA4 lookup failed; falling back to site-wide engagement signal — see ${xref(ga4)}.`);
  } else {
    /* Check if there is a diagnostic finding explaining why */
    const ga4Diag = firstFindingBy(m, f => /GA4 per-page data unavailable|GA4 not connected for this project/i.test(f.finding_title));
    if (ga4Diag) {
      lines.push(`${ga4Diag.finding.finding_detail || ga4Diag.finding.finding_title}`);
    } else {
      lines.push(`No GA4 per-page engagement data available. Either:\n- GA4 is not connected for this project (connect via PM Module → project → Requirements → Integrations)\n- The page has no sessions in the last 28 days (normal for new pages)\n- The GA4 OAuth token needs refresh (reconnect GA4 if issue persists)`);
    }
  }
  lines.push('');

  /* §2.3 — Live SERP composition */
  lines.push(`### §2.3 — Live SERP composition for \`${I.keyword}\``);
  lines.push('');
  if (ctrEv.top_10_domains && Array.isArray(ctrEv.top_10_domains) && ctrEv.top_10_domains.length > 0) {
    lines.push(`Live top-10 domains for \`${I.keyword}\`:`);
    lines.push('');
    for (let i = 0; i < ctrEv.top_10_domains.length; i++) {
      lines.push(`${i + 1}. \`${ctrEv.top_10_domains[i]}\``);
    }
    lines.push('');
    if (ctrEv.live_position !== null && ctrEv.live_position !== undefined) {
      lines.push(`**Audited URL live position:** ${ctrEv.live_position} (in live top-100 = ${ctrEv.in_live_top_100}).`);
    } else if (ctrEv.in_live_top_100 === false) {
      lines.push(`**Audited URL is NOT in the live top-100** for \`${I.keyword}\`. GSC's reported average position is therefore driven by *other* queries — see §2.6.`);
    }
  } else {
    /* Fall back to diffuse-intent finding evidence which always runs SerpAPI */
    const diffuse = diffuseIntentFinding(m);
    const diffuseEv = diffuse?.finding.evidence || {};
    const serpDomains: string[] = Object.values(diffuseEv.categories || {}).flat() as string[];
    if (serpDomains.length > 0) {
      lines.push(`Live top-10 domains for \`${I.keyword}\` (from SERP intent analysis):`);
      lines.push('');
      Object.entries(diffuseEv.categories || {}).forEach(([cat, doms]: [string, any]) => {
        (doms as string[]).forEach(d => lines.push(`- \`${d}\` — ${cat}`));
      });
      lines.push('');
    } else {
      lines.push(`Live SERP composition not retrieved — SerpAPI key not configured or API call failed. Set \`SERPAPI_KEY\` in Vercel environment variables to enable live SERP data.`);
    }
  }
  lines.push('');

  /* §2.4 — SerpAPI feature detection */
  lines.push(`### §2.4 — SerpAPI feature detection`);
  lines.push('');
  if (ctrEv.serp_verified) {
    lines.push(`| Feature | Status |`);
    lines.push(`|---|---|`);
    lines.push(`| AI Overview present | ${ctrEv.ai_overview ? '✅ Yes' : '❌ No'} |`);
    lines.push(`| Featured snippet | ${ctrEv.featured_snippet ? '✅ Yes' : '❌ No'}${ctrEv.featured_snippet_owner ? ` (owner: \`${ctrEv.featured_snippet_owner}\`)` : ''} |`);
    lines.push(`| People Also Ask box | ${ctrEv.paa_count > 0 ? `✅ Yes (${ctrEv.paa_count} questions)` : '❌ No'} |`);
    lines.push(`| Top ads | ${ctrEv.ads_top || 0} |`);
    lines.push(`| Bottom ads | ${ctrEv.ads_bottom || 0} |`);
    lines.push(`| Cache state | ${ctrEv.cache_hit ? 'cached (≤7d old)' : 'fresh fetch'} |`);
    lines.push('');
    if (ctrEv.paa_questions && Array.isArray(ctrEv.paa_questions) && ctrEv.paa_questions.length > 0) {
      lines.push(`**Live PAA questions on this SERP** (citation candidates):`);
      lines.push('');
      for (const q of ctrEv.paa_questions) lines.push(bullet(`"${q}"`));
      lines.push('');
      const paaGap = paaGapFinding(m);
      if (paaGap) lines.push(`Content-gap interpretation: ${xref(paaGap)}.`);
    }
  } else {
    /* Fall back to PAA finding for PAA questions, diffuse finding for SERP features */
    const paaF = paaGapFinding(m);
    const diffuseF = diffuseIntentFinding(m);
    const paaEv = paaF?.finding.evidence || {};
    const diffuseEv2 = diffuseF?.finding.evidence || {};
    if (paaEv.paa_total > 0 || diffuseF) {
      lines.push(`| Feature | Status |`);
      lines.push(`|---|---|`);
      if (diffuseF) {
        const cats = Object.keys(diffuseEv2.categories || {}).length;
        lines.push(`| Intent diversity | ${cats} distinct intent categories ${xref(diffuseF)} |`);
      }
      if (paaEv.paa_total > 0) {
        lines.push(`| People Also Ask box | ✅ Yes (${paaEv.paa_total} questions) |`);
      }
      lines.push('');
      if (paaEv.answered && Array.isArray(paaEv.answered) && paaEv.answered.length > 0) {
        lines.push(`**Live PAA questions — covered by existing headings:**`);
        lines.push('');
        for (const a of paaEv.answered) lines.push(bullet(`"${a.paa}" → matched by heading "${a.heading}"`));
        lines.push('');
      }
      if (paaEv.unanswered && Array.isArray(paaEv.unanswered) && paaEv.unanswered.length > 0) {
        lines.push(`**Live PAA questions — NOT covered (content gaps):**`);
        lines.push('');
        for (const q of paaEv.unanswered) lines.push(bullet(`"${q}"`));
        lines.push('');
      }
    } else {
      lines.push(`No SerpAPI feature detection ran for this audit — SerpAPI key not configured or API call failed. Set \`SERPAPI_KEY\` in Vercel environment variables.`);
    }
  }
  lines.push('');

  /* §2.5 — Competitive content landscape */
  lines.push(`### §2.5 — Competitive content landscape`);
  lines.push('');
  const compFinding = competitiveContentFinding(m);
  if (compFinding) {
    const cev = compFinding.finding.evidence || {};
    lines.push(`| Field | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Audited word count | ${num(cev.audited_word_count)} |`);
    lines.push(`| Competitor median word count | ${num(cev.competitor_median)} |`);
    lines.push(`| Range (min–max) | ${num(cev.competitor_min)}–${num(cev.competitor_max)} |`);
    lines.push(`| Ratio audited / median | ${cev.word_ratio !== undefined ? Math.round(cev.word_ratio * 100) + '%' : '—'} |`);
    lines.push(`| Competitors fetched | ${cev.competitors_fetched ?? '—'} |`);
    lines.push('');
    lines.push(`Interpretation finding: ${xref(compFinding)}.`);
    const diffuse = diffuseIntentFinding(m);
    if (diffuse) {
      lines.push(`**Cross-reference:** read this together with the diffuse-intent finding ${xref(diffuse)} — when SERP intent is diffuse, the competitor median is dragged down by different-intent pages, so a 150%+ ratio reflects intent mismatch, not bloat.`);
    }
  } else {
    lines.push(`No competitive-content benchmark produced (SerpAPI required to fetch top-10 competitor URLs).`);
  }
  lines.push('');

  /* §2.5b — Intent classification */
  const diffuse = diffuseIntentFinding(m);
  if (diffuse) {
    lines.push(`#### §2.5.1 — Top-10 intent classification`);
    lines.push('');
    const dev = diffuse.finding.evidence || {};
    if (dev.distinct_categories) {
      lines.push(`**${dev.distinct_categories} distinct intent categories** detected in the live top-10.`);
      lines.push('');
    }
    /* Phase 16.10 — normalize categories shape. The audit's
       checkDiffuseIntentSerp produces categories as an OBJECT MAP
       `{categoryName: [domain1, domain2]}` but the renderer was written
       expecting an ARRAY of `{name, count, domains[]}`. Accept both. */
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
    /* Sort by count desc so the biggest intent category shows first */
    normalizedCats.sort((a, b) => b.count - a.count);
    if (normalizedCats.length > 0) {
      lines.push(`| Intent category | Count | Example domains |`);
      lines.push(`|---|---|---|`);
      for (const c of normalizedCats) {
        lines.push(`| ${c.name} | ${c.count} | ${c.domains.slice(0, 4).map((d: string) => '`' + d + '`').join(', ')} |`);
      }
      lines.push('');
    }
    lines.push(`Interpretation finding: ${xref(diffuse)}. SEO-economics implications in §5.2.`);
    lines.push('');
  }

  /* §2.6 — GSC query distribution */
  lines.push(`### §2.6 — GSC query distribution`);
  lines.push('');
  const qd = queryDistributionFinding(m);
  if (qd) {
    const qdEv = qd.finding.evidence || {};
    if (Array.isArray(qdEv.top_queries) && qdEv.top_queries.length > 0) {
      lines.push(`This URL receives impressions from **${qdEv.total_queries ?? qdEv.top_queries.length}** distinct queries. Top 10 by impressions:`);
      lines.push('');
      lines.push(`| Query | Impressions | Clicks | Position |`);
      lines.push(`|---|---|---|---|`);
      for (const q of qdEv.top_queries.slice(0, 10)) {
        lines.push(`| \`${q.query || q.keys?.[0] || '—'}\` | ${num(q.impressions)} | ${num(q.clicks)} | ${q.position?.toFixed(1) ?? '—'} |`);
      }
      lines.push('');
      lines.push(`Interpretation finding: ${xref(qd)}. ${qdEv.keyword_in_top10 ? 'Campaign keyword is present in the URL\'s top queries.' : 'Campaign keyword is **NOT** in the URL\'s top queries — this URL ranks for different queries than the campaign target.'}`);
    } else {
      lines.push(`Query-distribution data pending (typically refreshed by the 6am UTC cron). ${xref(qd)}.`);
    }
  } else {
    lines.push(`No query-distribution data available for this audit run.`);
  }
  lines.push('');
  lines.push(`---`);
  lines.push('');
}

/* ════════════════════════════════════════════════════════════════════════
   §3 — FINDINGS (one §-ID per finding, full evidence + recommendation)
════════════════════════════════════════════════════════════════════════ */

function renderFindings(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## §3 — Findings`);
  lines.push('');
  lines.push(`> Every finding produced by the audit, in severity order (Critical → Warning → Pass → Info). Each finding has a stable §-ID for cross-referencing. The "Evidence" field shows the raw structured data; the "Cross-references" field lists which other findings share signals or context with this one.`);
  lines.push('');

  for (const fi of m) {
    renderSingleFinding(lines, fi, I, m);
  }
  lines.push(`---`);
  lines.push('');
}

function renderSingleFinding(lines: string[], fi: FindingWithId, I: DeepReportInputs, m: FindingWithId[]): void {
  const f = fi.finding;
  const foundationalBadge = f.is_foundational ? '🎯 ' : '';
  const anchor = `finding-${fi.id.replace('.', '-')}`;
  lines.push(`<a id="${anchor}"></a>`);
  lines.push('');
  lines.push(`### §${fi.id} — ${foundationalBadge}${sev(f.severity)} ${f.finding_title}`);
  lines.push('');
  lines.push(`**Severity:** ${sevLabel(f.severity)} · **Audit kind:** \`${f.audit_kind}\``);
  if (f.is_foundational) {
    lines.push('');
    lines.push(`🎯 **Foundational fix** — this finding's recommendation, if adopted, will reframe the remaining Critical findings (their context resets against the corrected target). Sequencing matters: tactical fixes done in the wrong order get undone. See §6.1.`);
  }
  lines.push('');

  /* Finding detail (with markdown preserved) */
  if (f.finding_detail) {
    lines.push(`**Detail:**`);
    lines.push('');
    /* The detail may contain newlines; preserve them */
    const detailLines = f.finding_detail.split('\n');
    for (const line of detailLines) lines.push(line);
    lines.push('');
  }

  /* Recommendation */
  if (f.recommendation) {
    lines.push(`**Recommendation:**`);
    lines.push('');
    const recLines = f.recommendation.split('\n');
    for (const line of recLines) lines.push(line);
    lines.push('');
  }

  /* Source attribution */
  const srcLabel = findingSourceLabel(f);
  const enrich = Array.isArray(f.enrichment_sources) && f.enrichment_sources.length
    ? ` (enriched by ${f.enrichment_sources.join(', ')})` : '';
  lines.push(`**Source:** ${srcLabel}${enrich} · **Confidence:** ${findingConfidence(f)}/100`);

  /* Signals tagged on this finding */
  if (Array.isArray(f.signals) && f.signals.length > 0) {
    lines.push('');
    lines.push(`**Signals tagged:** ${f.signals.map(s => '`' + s + '`').join(', ')}. Convergence interpretation in §4.1.`);
  }

  /* Cross-references — other findings sharing signals */
  const xrefs = collectCrossRefs(fi, m);
  if (xrefs.length > 0) {
    lines.push('');
    lines.push(`**Cross-references:**`);
    for (const xr of xrefs) lines.push(bullet(xr));
  }

  /* Raw evidence dump (compact JSON) */
  if (f.evidence && Object.keys(f.evidence).length > 0) {
    lines.push('');
    lines.push(`<details><summary>Raw evidence (JSON)</summary>`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(f.evidence, null, 2));
    lines.push('```');
    lines.push('');
    lines.push(`</details>`);
  }
  lines.push('');
}

/** Build cross-reference lines for a finding based on signals and topic. */
function collectCrossRefs(fi: FindingWithId, m: FindingWithId[]): string[] {
  const refs: string[] = [];
  const f = fi.finding;

  /* Signal-based cross-refs: any other finding sharing at least one signal */
  if (Array.isArray(f.signals) && f.signals.length > 0) {
    for (const other of m) {
      if (other.id === fi.id) continue;
      const sharedSigs = (other.finding.signals || []).filter(s => (f.signals || []).includes(s));
      if (sharedSigs.length > 0) {
        refs.push(`Shares signals ${sharedSigs.map(s => '`' + s + '`').join(', ')} with §${other.id} — ${other.finding.finding_title}`);
      }
    }
  }

  /* Topic-based cross-refs by audit_kind */
  if (f.audit_kind === 'engagement_signals') {
    const otherEng = m.filter(o => o.id !== fi.id && o.finding.audit_kind === 'engagement_signals');
    for (const o of otherEng) {
      if (!refs.some(r => r.includes(`§${o.id}`))) {
        refs.push(`Related engagement signal: §${o.id} — ${o.finding.finding_title}`);
      }
    }
  }

  return refs;
}

/* ════════════════════════════════════════════════════════════════════════
   §4 — CONVERGENCE ANALYSIS
════════════════════════════════════════════════════════════════════════ */

function renderConvergenceAnalysis(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## §4 — Convergence Analysis`);
  lines.push('');
  lines.push(`> When two or more findings independently corroborate the same diagnosis using different methodologies and data sources, the recommendation hardens from hypothesis to operational call. This section maps which findings agree on what.`);
  lines.push('');

  /* §4.1 — Signal map */
  lines.push(`### §4.1 — Cross-finding signal map`);
  lines.push('');
  /* Build signal → finding-id table */
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
    lines.push(`No signal-tagged findings in this audit — no convergence to map.`);
  } else {
    lines.push(`| Signal | Findings tagged with this signal | Severity mix |`);
    lines.push(`|---|---|---|`);
    for (const [signal, fis] of Object.entries(signalMap)) {
      const refs = fis.map(fi => `[§${fi.id}](#finding-${fi.id.replace('.', '-')})`).join(', ');
      const sevMix = fis.map(fi => sev(fi.finding.severity)).join('');
      lines.push(`| \`${signal}\` | ${refs} | ${sevMix} |`);
    }
  }
  lines.push('');

  /* §4.2 — Hardened diagnoses — only render when meaningful convergence exists */
  const kwSignals = ['keyword_mismatch', 'url_not_in_top_10', 'serp_topic_mismatch', 'first_paragraph_off_topic'];
  const kwSignalsPresent = kwSignals.filter(s => signalMap[s] && signalMap[s].length > 0);
  const totalSignalCount = Object.keys(signalMap).length;
  /* Only show §4.2 when there's real convergence — hide the "no convergence" placeholder */
  if (totalSignalCount > 0) {
    lines.push(`### §4.2 — Hardened diagnoses (where 2+ findings agree)`);
    lines.push('');
  }
  if (kwSignalsPresent.length >= 2) {
    const totalFis = new Set<string>();
    for (const s of kwSignalsPresent) signalMap[s].forEach(fi => totalFis.add(fi.id));
    const fiList = [...totalFis].map(id => `§${id}`).join(', ');
    lines.push(`**Hardened diagnosis: keyword-pivot is foundational.** ${kwSignalsPresent.length} independent signals corroborate, across findings ${fiList}. Each signal represents a different methodology and data source:`);
    lines.push('');
    const descs: Record<string, string> = {
      keyword_mismatch: 'Token-overlap analysis on title/H1 (live HTML fetch + token-set comparison)',
      url_not_in_top_10: 'Live SERP position check (SerpAPI live SERP fetch)',
      serp_topic_mismatch: 'Diffuse-intent SERP detection (LLM-classification of top-10 domains)',
      first_paragraph_off_topic: 'First-paragraph topicality (live HTML fetch + topical-overlap heuristic)',
    };
    for (const s of kwSignalsPresent) {
      const findings = signalMap[s].map(fi => `§${fi.id}`).join(', ');
      lines.push(bullet(`\`${s}\` — ${descs[s]}. Findings: ${findings}.`));
    }
    lines.push('');
    lines.push(`When findings using different methodologies converge on the same diagnosis, the recommendation is operational — not speculative. Recommendation sequencing in §6 reflects this convergence.`);
  } else if (totalSignalCount > 0) {
    /* Has signals but not 2+ keyword signals — show what we have */
    lines.push(`No 2+ signal convergence on a single diagnosis. The ${totalSignalCount} signal(s) above are each supported by a single finding — useful context but not a hardened diagnosis.`);
  }
  lines.push('');

  /* §4.3 — Contradictions / open questions */
  lines.push(`### §4.3 — Contradictions & open questions`);
  lines.push('');
  const openQs: string[] = [];
  const zeroConv = zeroConversionFinding(m);
  if (zeroConv) {
    openQs.push(`**Tracking gap vs real funnel** (${xrefShort(zeroConv)}): ${zeroConv.finding.evidence?.sessions || 'N'} sessions, 0 conversions. The audit can't distinguish a measurement gap from a genuine funnel issue using external data alone. Resolution path: GA4 admin verifies whether conversion events are configured for this URL's pagePath. See §6.3.1.`);
  }
  const fresh = contentFreshnessFinding(m);
  if (fresh && fresh.finding.evidence?.most_recent_source === 'Last-Modified header') {
    openQs.push(`**Freshness signal authenticity** (${xrefShort(fresh)}): the most-recent date comes solely from the Last-Modified HTTP header. This can be touched by CDN/cache refresh without genuine content change. Cross-verify with schema dateModified and visible "Updated:" labels. See §5.4.`);
  }
  const diffuse = diffuseIntentFinding(m);
  const qd = queryDistributionFinding(m);
  if (diffuse) {
    if (!qd) {
      openQs.push(`**Tighter-keyword candidates pending** (${xrefShort(diffuse)}): the diffuse-intent finding doesn't yet name specific tighter-keyword pivot candidates. Once GSC query-distribution data is available (next cron tick), cross-reference with the diffuse-intent classification to identify tighter keywords this URL already has impression authority on.`);
    }
  }
  const schema = schemaFinding(m);
  if (schema && schema.finding.severity === 'green' && /FAQPage/i.test(schema.finding.finding_title)) {
    openQs.push(`**Schema type-fit not validated** (${xrefShort(schema)}): the page has valid FAQPage schema, but is FAQPage the right TYPE for a pricing-comparison page (vs Article or Product)? The content-match check passes; the type-fit question is broader and requires manual review.`);
  }
  if (openQs.length === 0) {
    lines.push(`No unresolved contradictions in this audit run.`);
  } else {
    for (const q of openQs) lines.push(bullet(q));
  }
  lines.push('');
  lines.push(`---`);
  lines.push('');
}

/* ════════════════════════════════════════════════════════════════════════
   §5 — SEO ECONOMICS CONTEXT
════════════════════════════════════════════════════════════════════════ */

function renderSeoEconomicsContext(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## §5 — SEO Economics Context`);
  lines.push('');
  lines.push(`> Industry context for this audit's findings. Each subsection applies only when the corresponding finding fired — irrelevant subsections render an explicit "N/A for this audit" note so the section structure stays stable across runs.`);
  lines.push('');

  /* §5.1 — AI Overview era */
  lines.push(`### §5.1 — AI Overview era`);
  lines.push('');
  const ctr = ctrFinding(m);
  const aiOverview = ctr?.finding.evidence?.ai_overview;
  if (aiOverview) {
    lines.push(`Google's AI Overview, broadly rolled out in 2024, now appears on the majority of informational queries. For SERPs with AI Overview present (verified for \`${I.keyword}\` in §2.4), the CTR-vs-position benchmarks measured pre-AI-Overview (AdvancedWebRanking, Backlinko, FirstPageSage) overstate recoverable CTR by 30-50%.`);
    lines.push('');
    lines.push(`**Implication for THIS audit:** the CTR underperformance ratio in ${xrefShort(ctr)} can't be recovered purely by ranking higher. Recovery requires *citation eligibility* — being one of the source pages Google's AI summary cites — not just position improvement.`);
    lines.push('');
    lines.push(`**Citation-eligibility tactics** (these compound with each other, listed in order of leverage for THIS page):`);
    const paaGap = paaGapFinding(m);
    if (paaGap) {
      lines.push(bullet(`**Highest leverage:** add H2 sections answering the live PAA questions verbatim — see ${xref(paaGap)} for the question list and per-section briefs.`));
    }
    const firstPara = firstParagraphFinding(m);
    if (firstPara) {
      lines.push(bullet(`**Second leverage:** rewrite the first paragraph as a 40-80 word direct answer to the core query — see ${xref(firstPara)}.`));
    }
    lines.push(bullet(`Cite authoritative external sources: vendor official docs (for SaaS pricing topics, that's the platform vendor's own pricing/licensing docs), industry analysts (Gartner, Forrester, IDC), peer-review platforms (G2, Capterra).`));
    lines.push(bullet(`Structure key facts as scannable lists. AI Overview cites pages where the answerable structure is unambiguous.`));
    const schema = schemaFinding(m);
    if (schema) {
      lines.push(bullet(`Validate schema-content match: every Question in the FAQPage schema must appear verbatim in the visible content — see ${xref(schema)} and §5.5.`));
    }
  } else {
    lines.push(`**N/A for this audit** — the live SERP for \`${I.keyword}\` does not currently show an AI Overview (verified in §2.4). Pre-AI-Overview CTR benchmarks remain applicable.`);
  }
  lines.push('');

  /* §5.2 — Diffuse-intent SERPs */
  lines.push(`### §5.2 — Diffuse-intent SERP economics`);
  lines.push('');
  const diffuse = diffuseIntentFinding(m);
  if (diffuse) {
    const cats = diffuse.finding.evidence?.distinct_categories;
    lines.push(`A "diffuse-intent SERP" has top-10 results spanning 3+ distinct intent categories — Google itself can't decide what users want. \`${I.keyword}\` has **${cats || 3}+ distinct intent categories** in its live top-10 (see §2.5.1).`);
    lines.push('');
    lines.push(`**Economic implication:** even ranking #1 on a diffuse-intent SERP yields lower CTR than a tight-intent SERP at the same position. Users searching with one intent skip top results matching a different intent. CTR ceilings on diffuse SERPs are *structurally* lower than tight SERPs at any given position. Most keyword-research tools (Ahrefs, SEMrush, etc.) don't surface this — they report search volume without intent classification.`);
    lines.push('');
    lines.push(`**Implication for THIS audit:** the recovery upside on \`${I.keyword}\` is capped below what raw search-volume math would suggest. ${xref(diffuse)} provides the per-category breakdown. Two strategic responses:`);
    lines.push('');
    lines.push(`1. **Pivot to a tighter-intent keyword variant.** Identify a related keyword whose top-10 is single-intent. Best candidate path: cross-reference §2.6 GSC query distribution (when available) with the intent categories in §2.5.1 — pick a tight variant this URL already has impression authority on.`);
    lines.push(`2. **Accept the lower ceiling.** Stay on \`${I.keyword}\` but set realistic recovery expectations. The business-impact model in §8 quotes the conservative scenario for exactly this reason.`);
  } else {
    lines.push(`**N/A for this audit** — \`${I.keyword}\` does not have a detected diffuse-intent SERP (no diffuse-intent finding in §3). Standard CTR-vs-position economics apply.`);
  }
  lines.push('');

  /* §5.3 — CTR benchmark caveats */
  lines.push(`### §5.3 — Per-position CTR benchmarks and their limitations`);
  lines.push('');
  if (ctr) {
    lines.push(`The "expected CTR" used in ${xrefShort(ctr)} is the midpoint of published benchmarks from AdvancedWebRanking, Backlinko, and FirstPageSage. These are *averages* across query types — informational queries skew lower (more research-heavy users, more PAA/AI-Overview clicks); commercial queries skew higher (clearer click intent).`);
    lines.push('');
    lines.push(`**Caveats specific to this audit:**`);
    if (aiOverview) {
      lines.push(bullet(`AI Overview is present (§2.4) → expected CTR overstates achievable by 30-50%. The actual ceiling is lower than the "expected" figure implies.`));
    }
    if (diffuse) {
      lines.push(bullet(`Diffuse-intent SERP (§5.2) → users skip results matching different intents, compressing CTR at every position.`));
    }
    const ads = ctr.finding.evidence?.ads_top;
    if (ads && ads >= 3) {
      lines.push(bullet(`${ads} top ads detected (§2.4) → paid placement compresses organic visibility further.`));
    }
    lines.push('');
    lines.push(`**Practical guidance:** quote the conservative recovery scenario in §8.1 when discussing with clients. The full-recovery scenario assumes none of the above caveats — rarely true on a real underperforming page.`);
  } else {
    lines.push(`**N/A** — no CTR-vs-expected finding for this audit.`);
  }
  lines.push('');

  /* §5.4 — Content freshness signal weighting */
  lines.push(`### §5.4 — Content freshness signal weighting`);
  lines.push('');
  const fresh = contentFreshnessFinding(m);
  if (fresh) {
    lines.push(`Google detects content recency through four signals (each documented in §1.6):`);
    lines.push('');
    lines.push(`1. **Last-Modified HTTP header** — set by the server. Easiest to manipulate (touch the file timestamp; CDN cache refresh can also trigger).`);
    lines.push(`2. **Schema dateModified / datePublished** in JSON-LD — set by the CMS. Often manipulated via plugins that bump dates without changing content.`);
    lines.push(`3. **Visible "Updated:" or "Published:" labels** — set in template/page content. Closer to truth than the above two but still cheap to manipulate.`);
    lines.push(`4. **Year in title** (e.g. "2026 Guide to X") — strong implicit recency claim.`);
    lines.push('');
    lines.push(`**Key nuance:** Google's models weight *material content changes* more heavily than date-stamp changes. Touching dateModified without changing content produces minimal freshness lift. A page that updates dates weekly without changing content gets less freshness reward than one that genuinely refreshes information annually.`);
    lines.push('');
    if (fresh.finding.evidence?.most_recent_source === 'Last-Modified header') {
      lines.push(`**Open question for this audit (§4.3):** the freshness signal in ${xrefShort(fresh)} rests entirely on Last-Modified header. The detected date may or may not reflect a genuine content update — cross-verify against schema dateModified and visible labels before reporting "fresh content" to the client.`);
    }
  } else {
    lines.push(`**N/A** — no content-freshness finding produced for this audit.`);
  }
  lines.push('');

  /* §5.5 — Schema-content-match policy */
  lines.push(`### §5.5 — Schema-content-match policy`);
  lines.push('');
  const schema = schemaFinding(m);
  if (schema && schema.finding.severity !== 'info') {
    lines.push(`Google policy: every Question listed in a FAQPage schema must appear verbatim (or near-verbatim) in the visible page content. Schema questions that don't appear visibly can incur a Google manual action (loss of rich-result eligibility, ranking demotion).`);
    lines.push('');
    lines.push(`Same principle applies to HowTo schema (steps must appear visibly), Article schema (headline, author, datePublished must appear visibly), and Product schema (name, image, offers).`);
    lines.push('');
    const paaRef5 = paaGapFinding(m);
  const paaRefText = paaRef5 ? xrefShort(paaRef5) : '§6.2 (PAA content work)';
  lines.push(`**Implication for THIS audit:** when implementing the PAA H2 recommendations from ${paaRefText}, update the FAQPage schema in parallel — every new Q&A in visible content must be reflected in the schema, AND every existing schema Question must remain in visible content. Don't add schema questions for content not yet written. Don't remove visible questions without removing the corresponding schema entries.`);
  } else {
    lines.push(`**N/A** — no schema-validation finding requires action for this audit.`);
  }
  lines.push('');

  /* §5.6 — Anchor-text quality */
  lines.push(`### §5.6 — Anchor-text quality signaling`);
  lines.push('');
  const anchor = anchorTextFinding(m);
  if (anchor) {
    lines.push(`Internal anchor text transfers topical authority. Google weights anchor text as a content signal — descriptive, on-topic anchors transfer more authority than generic ("click here," "read more") or URL-based ("https://example.com/page") anchors.`);
    lines.push('');
    lines.push(`**Categories** (per ${xrefShort(anchor)}):`);
    lines.push('');
    lines.push(`- **Generic** — \`click here\`, \`read more\`, \`learn more\`, \`this\`, \`here\` — zero topical signal`);
    lines.push(`- **URL-based** — literal URL as anchor text — zero topical signal`);
    lines.push(`- **Single-word / nav** — \`Home\`, \`About\`, \`Pricing\` — minimal topical signal`);
    lines.push(`- **Descriptive** — multi-word, content-bearing — high topical signal`);
    lines.push('');
    lines.push(`**Implication for THIS audit:** when adding internal links during the recommended Phase 2 content work (§6.2), every new anchor should be descriptive and on-topic for the receiving page. Audit existing nav and footer links during cleanup if descriptive ratio drops below 60%.`);
  } else {
    lines.push(`**N/A** — no anchor-text finding for this audit.`);
  }
  lines.push('');

  /* §5.7 — Image format optimization */
  lines.push(`### §5.7 — Image format optimization`);
  lines.push('');
  const imgs = imageOptFindings(m);
  if (imgs.length > 0) {
    lines.push(`Legacy formats (jpg/png/gif) are typically 25-50% larger than equivalent WebP and 40-70% larger than equivalent AVIF at the same visual quality. On pages with multiple images, this is a measurable Largest Contentful Paint (LCP) and bandwidth penalty.`);
    lines.push('');
    lines.push(`**Browser support (2026):** WebP at 95%+, AVIF at 90%+. Both are safe to ship with \`<picture>\` fallbacks.`);
    lines.push('');
    lines.push(`**Implication for THIS audit:** image-optimization findings ${imgs.map(f => xrefShort(f)).join(', ')} flagged work the dev team can do in parallel with content work (§7 Phase 3). No content dependencies.`);
  } else {
    lines.push(`**N/A** — no image-optimization finding for this audit.`);
  }
  lines.push('');
  lines.push(`---`);
  lines.push('');
}

/* ════════════════════════════════════════════════════════════════════════
   §6 — RECOMMENDATIONS (sequenced)
════════════════════════════════════════════════════════════════════════ */

function renderRecommendations(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## §6 — Recommendations (sequenced)`);
  lines.push('');
  lines.push(`> Each recommendation cross-references the finding(s) it addresses. Sequencing matters: Phase 1 must land before Phase 2 begins, because Phase 2 work resets against Phase 1's outcome. Phase 3 work is parallelizable and can start at kickoff.`);
  lines.push('');

  /* §6.1 — Foundational */
  lines.push(`### §6.1 — Phase 1: Foundational (sequencing-critical)`);
  lines.push('');
  const foundational = foundationalFinding(m);
  if (foundational) {
    const f = foundational.finding;
    lines.push(`#### §6.1.1 — ${f.finding_title}`);
    lines.push('');
    lines.push(`**Addresses:** ${xref(foundational)}`);
    lines.push('');
    if (f.recommendation) {
      lines.push(`**Recommendation:**`);
      lines.push('');
      const recLines = f.recommendation.split('\n');
      for (const line of recLines) lines.push(line);
      lines.push('');
    }
    lines.push(`**Why first:** every Phase 2 recommendation resets against the keyword decision. Doing Phase 2 before this lands means redoing it after the decision changes the target.`);
    lines.push('');
    /* Phase 16.10 — cross-references built from non-null cited findings only.
       Previous version called xref(null) for missing findings producing
       blank cross-ref slots. */
    const xrefList = [ctrFinding(m), diffuseIntentFinding(m), firstParagraphFinding(m)]
      .filter((fi): fi is FindingWithId => fi !== null && fi !== foundational)
      .map(fi => xref(fi));
    if (xrefList.length > 0) {
      lines.push(`**Cross-references:** ${xrefList.join(', ')} — these findings converge on the same diagnosis (see §4.2).`);
    } else {
      lines.push(`**Cross-references:** see §4.2 for the convergence analysis.`);
    }
  } else {
    /* Phase 16.10 — explicit empty-Phase-1 messaging. No foundational
       fix means Phase 2 acts as the lead phase; this is normal for audits
       on pages that already match their keyword and just have tactical
       gaps. Tell the reader directly rather than leaving them to infer. */
    lines.push(`**No Phase 1 foundational fix required for this audit.**`);
    lines.push('');
    lines.push(`No finding triggered the foundational-fix heuristic (indexability blocker, keyword-pivot recommendation, or first-paragraph topicality failure — see §11.3). This means Phase 2 work below can begin at kickoff without waiting on a client decision. The phase numbering retains §6.2 / §6.3 for cross-reference stability across audit runs.`);
  }
  lines.push('');

  /* §6.2 — Content overhaul */
  lines.push(`### §6.2 — Phase 2: ${foundational ? 'Content overhaul' : 'Content overhaul (lead phase)'}`);
  lines.push('');
  lines.push(`Goal: ${foundational ? 'implement all content changes aligned to the Phase 1 decision' : 'implement the content changes the audit surfaced'}. Each subsection below maps to a specific finding.`);
  lines.push('');

  const paaGap = paaGapFinding(m);
  if (paaGap) {
    lines.push(`#### §6.2.1 — Add new H2 sections for PAA coverage`);
    lines.push('');
    lines.push(`**Addresses:** ${xref(paaGap)}`);
    lines.push('');
    const unansweredArr = paaGap.finding.evidence?.unanswered;
    if (Array.isArray(unansweredArr) && unansweredArr.length > 0) {
      lines.push(`**Per-question briefs:**`);
      lines.push('');
      for (let i = 0; i < unansweredArr.length; i++) {
        const q = unansweredArr[i];
        lines.push(`##### §6.2.1.${i + 1} — Section for: "${q}"`);
        lines.push('');
        lines.push(`- **H2 wording:** use \`${q}\` verbatim (or a tight rephrase preserving key tokens — Google matches PAA boxes to literal phrasings).`);
        lines.push(`- **First sentence (40-80 words):** direct answer to the question. This is the citation-candidate sentence — write it as if Google's AI Overview might quote it verbatim. No preamble.`);
        lines.push(`- **Section body (300-500 words after the direct answer):** ${paaQuestionBodyGuidance(q)}`);
        lines.push(`- **Length target:** 350-580 words total (direct answer + body).`);
        lines.push(`- **Schema update:** if FAQPage schema exists (§1.3), add this Q&A to the schema's \`mainEntity\` array. See §5.5.`);
        lines.push('');
      }
    }
    lines.push(`**Why this matters:** the live SERP for \`${I.keyword}\` currently shows ${unansweredArr?.length || 'multiple'} PAA questions (§2.4). Each unanswered PAA question is a content gap AND a citation opportunity. Phase 2.1 is the highest-leverage tactic for AI-Overview-era recovery on this SERP.`);
    lines.push('');
  }

  const firstPara = firstParagraphFinding(m);
  if (firstPara && firstPara.finding.severity !== 'green') {
    lines.push(`#### §6.2.2 — Rewrite the first paragraph`);
    lines.push('');
    lines.push(`**Addresses:** ${xref(firstPara)}`);
    lines.push('');
    const currentPara = firstPara.finding.evidence?.first_paragraph;
    if (currentPara) {
      lines.push(`**Current first paragraph:**`);
      lines.push('');
      lines.push(`> ${clip(currentPara, 400)}`);
      lines.push('');
    }
    lines.push(`**Target structure (3-sentence formula):**`);
    lines.push('');
    lines.push(`1. **Open with the searcher's problem or question** — in their words, not yours. What did they type into Google? Lead with that.`);
    lines.push(`2. **Acknowledge who this guide is for** — be specific.`);
    lines.push(`3. **Preview the unique value** — what they'll learn that they can't get elsewhere.`);
    lines.push('');
    lines.push(`**Length:** 60-100 words.`);
    lines.push('');
    lines.push(`**Don'ts:** generic product taglines, "In today's world…" openers, definition leads (save for an H2), feature-list openers.`);
    lines.push('');
  }

  const meta = metaDescFinding(m);
  if (meta && meta.finding.severity === 'amber') {
    lines.push(`#### §6.2.3 — Trim meta description`);
    lines.push('');
    lines.push(`**Addresses:** ${xref(meta)}`);
    lines.push('');
    const currentLen = meta.finding.evidence?.length;
    lines.push(`Current length: ${currentLen || '—'} chars. Target: 140-160 chars. ${currentLen && currentLen > 160 ? 'Trim to fit.' : currentLen && currentLen < 140 ? 'Expand to fill more SERP real estate.' : ''}`);
    lines.push('');
  }

  /* §6.3 — Validation & parallel work */
  lines.push(`### §6.3 — Phase 3: Validation & parallel workstreams`);
  lines.push('');
  lines.push(`These can start at kickoff and don't block Phase 1 or 2.`);
  lines.push('');

  const zeroConv = zeroConversionFinding(m);
  if (zeroConv) {
    lines.push(`#### §6.3.1 — Verify GA4 conversion tracking`);
    lines.push('');
    lines.push(`**Addresses:** ${xref(zeroConv)}`);
    lines.push('');
    lines.push(`**Why parallel:** can run any time, doesn't block content work. **Why mandatory:** if tracking is broken, no traffic-recovery work is measurable.`);
    lines.push('');
    lines.push(`**Diagnosis steps:**`);
    lines.push(`1. Open GA4 → Reports → Engagement → Events`);
    lines.push(`2. Filter by pagePath = \`${zeroConv.finding.evidence?.page_path || '<this URL\'s path>'}\``);
    lines.push(`3. Check whether conversion-flagged events appear for this pagePath`);
    lines.push(`4. If YES → tracking works, audit the CTA structure (real funnel problem — separate scope)`);
    lines.push(`5. If NO → tracking gap, instrument the relevant conversion events before more traffic arrives`);
    lines.push('');
  }

  const imgs = imageOptFindings(m);
  if (imgs.length > 0) {
    lines.push(`#### §6.3.2 — Image format conversion`);
    lines.push('');
    lines.push(`**Addresses:** ${imgs.map(f => xref(f)).join(', ')}`);
    lines.push('');
    lines.push(`Convert content images from jpg/png/gif to WebP or AVIF. See §5.7 for browser-support context. Implementation: image CDN (Cloudflare Images, Imgix, ImageKit) with format-on-demand, OR build-pipeline transform with \`<picture>\` fallbacks.`);
    lines.push('');
  }

  const cwv = cwvFindings(m);
  const psiFailed = cwv.find(f => /PageSpeed Insights API failed|HTTP 429/i.test(f.finding.finding_title));
  if (psiFailed) {
    lines.push(`#### §6.3.3 — Configure PageSpeed Insights API`);
    lines.push('');
    lines.push(`**Addresses:** ${xref(psiFailed)}`);
    lines.push('');
    lines.push(`PSI is currently returning 429 (rate-limited) because no API key is configured. Get a free key at https://developers.google.com/speed/docs/insights/v5/get-started and add to \`project_integrations\`. Lead time ~24-48hr from request to first audit run using the key.`);
    lines.push('');
  }

  lines.push(`#### §6.3.4 — Schedule re-audit`);
  lines.push('');
  lines.push(`Run this audit again 4-6 weeks post-deploy of Phase 1+2 changes. Validate the diagnosis: did the keyword pivot bring this URL into the top-30 for the new target? Did the new H2s capture PAA boxes? Did engagement metrics improve? Compare pre/post values for all findings in §3.`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
}

/** Per-PAA-question body-guidance — content writer brief.
 *  Phase 16.10 — router order fixed. The "what is X" check used to fire
 *  before the "good/best X" check, so "what is a good app maker?" matched
 *  the category-definition branch instead of the comparison branch (which
 *  caused §6.2.1.2 and §6.2.1.3 to render IDENTICAL guidance in the
 *  alphasoftware audit). Now: quality/comparison check first, then
 *  category-definition only for plain "what is" questions. */
function paaQuestionBodyGuidance(q: string): string {
  const ql = q.toLowerCase();
  /* Quality/comparison/recommendation intent — must check BEFORE "what is"
     because "what is a good X" should route here, not to category definition. */
  if (/\b(good|best|top|recommend|popular|leading|ideal)\b/.test(ql)) {
    return 'Selection criteria framework (3-5 evaluation dimensions); honest comparison table of leading options including this product; use-case specifics (small business vs enterprise, technical vs no-code audience); pricing/licensing structural differences; how to evaluate (free tiers, sandboxes, proof-of-concept timelines). End with a decision-tree paragraph: "if you need X, pick A; if Y, pick B."';
  }
  /* How-to / process intent */
  if (/\b(how to|how can|how do)\b.*\b(create|build|make|develop|launch|set up|setup|start)\b/.test(ql)) {
    return 'Step-by-step process from idea to deployment (numbered list); skill level required (no-code/low-code/dev needed); typical time-to-build; tools/platforms compared; beginner pitfalls; cost considerations at each stage.';
  }
  /* Cost / pricing intent */
  if (/\b(free|cost|cheap|price|expensive|affordable|budget|pricing)\b/.test(ql)) {
    return 'What\'s actually free vs free-tier-with-limits; hidden cost categories (connectors, capacity, premium features); cost comparison at small/medium/enterprise scale; total cost of ownership including learning curve and switching cost; when free is enough vs when paid features are needed; pricing-model patterns (per-user, per-app, per-resource).';
  }
  /* "What is X" — plain category-definition intent (no quality modifier) */
  if (/^what (is|are)\b/.test(ql)) {
    return 'Concise category definition (the citation candidate); distinguishing capabilities; target audience; category history and how it evolved; comparison to adjacent categories (form builders, IDEs, design tools); when to use this category vs alternatives.';
  }
  /* "Why X" — rationale / justification intent */
  if (/^why\b/.test(ql)) {
    return 'The underlying problem this addresses (open with searcher pain); three to five distinct reasons with concrete examples; common misconceptions debunked; real-world outcome scenarios; counter-considerations (when this is the wrong answer).';
  }
  /* "Can I X" — feasibility / permission intent */
  if (/^can (i|you|we)\b/.test(ql)) {
    return 'Direct yes/no answer in the first sentence (citation candidate); conditions and constraints (when yes, when no, when partial); concrete examples of each case; common mistakes / unexpected failures; how to verify your specific situation.';
  }
  return 'Direct answer to the question (citation candidate, 40-80 words); why this question matters (searcher\'s underlying concern); practical implications and concrete steps; common follow-on questions; authoritative source citation.';
}

/* ════════════════════════════════════════════════════════════════════════
   §7 — EFFORT & DEPENDENCY MAP
════════════════════════════════════════════════════════════════════════ */

function renderEffortDependencyMap(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## §7 — Effort & Dependency Map`);
  lines.push('');
  lines.push(`> Each task cross-references the §6 recommendation it implements (and through it, the §3 finding that motivates it). Designed to be ingestible by a downstream PM pipeline.`);
  lines.push('');

  const foundational = foundationalFinding(m);
  /* Phase 16.10 — task-dependency anchor. When foundational exists,
     Phase 2 work depends on T1.4 (the documented decision). When it
     doesn't, Phase 2 acts as the lead phase and tasks have no Phase 1
     dependency. Previously T2.* dependencies hardcoded "T1.4" which
     produced phantom references when foundational was null. */
  const phase2DepLabel = foundational ? 'T1.4' : 'None';

  /* §7.1 — Task inventory */
  lines.push(`### §7.1 — Task inventory`);
  lines.push('');
  lines.push(`| Task ID | Task | Owner | Effort | Dependencies | Implements |`);
  lines.push(`|---|---|---|---|---|---|`);

  if (foundational) {
    const isLcpFoundational = /LCP/i.test(foundational.finding.finding_title);
    const isKwFoundational  = /keyword/i.test(foundational.finding.finding_title);
    if (isLcpFoundational) {
      /* LCP foundational — dev tasks, not a client keyword decision */
      lines.push(`| T1.1 | Run PageSpeed Insights on mobile — capture LCP element, TTFB, TBT, and performance score | Dev | 30 min | None | §6.1.1 |`);
      lines.push(`| T1.2 | Profile main-thread blocking JS (TBT ${foundational.finding.evidence?.tbt_ms ? Math.round(foundational.finding.evidence.tbt_ms) + 'ms' : 'high'}) — identify largest bundles and defer non-critical scripts | Dev | 2 hrs | T1.1 | §6.1.1 |`);
      lines.push(`| T1.3 | Convert LCP element to webp/avif, add fetchpriority="high", remove lazy-loading from above-fold images | Dev | 1 day | T1.1 | §6.1.1 |`);
      lines.push(`| T1.4 | Deploy + verify mobile LCP < 4s in PSI before Phase 2 begins | Dev | 30 min | T1.2, T1.3 | §6.1.1 |`);
    } else if (isKwFoundational) {
      /* Keyword-pivot foundational — client decision gate */
      lines.push(`| T1.1 | Prepare keyword-direction options brief (pivot vs rewrite, with pros/cons) | Senior DMS | 2 hrs | None | §6.1.1 |`);
      lines.push(`| T1.2 | Schedule 30-min client review call | PM | 30 min | T1.1 | §6.1.1 |`);
      lines.push(`| T1.3 | Client decision: keyword pivot OR content overhaul | Client | Async (target ≤5 business days) | T1.2 | §6.1.1 |`);
      lines.push(`| T1.4 | Document decision + update campaign config | DMS | 30 min | T1.3 | §6.1.1 |`);
    } else {
      /* Generic foundational */
      lines.push(`| T1.1 | Resolve foundational issue: ${foundational.finding.finding_title} | Dev/DMS | TBD | None | §6.1.1 |`);
      lines.push(`| T1.2 | Verify fix deployed + confirm issue resolved | Dev | 30 min | T1.1 | §6.1.1 |`);
    }
  }

  const paaGap = paaGapFinding(m);
  const unansweredArr = paaGap?.finding.evidence?.unanswered;
  if (paaGap && Array.isArray(unansweredArr) && unansweredArr.length > 0) {
    lines.push(`| T2.1 | Write ${unansweredArr.length} new H2 sections per PAA questions (each 350-580 words) | Content Writer | 3-4 days | ${phase2DepLabel} | §6.2.1 |`);
    lines.push(`| T2.2 | Gather external citations (vendor docs, Gartner, G2) — 2 per section minimum | Content Writer | 1 day | T2.1 in progress | §6.2.1 |`);
  }

  const firstPara = firstParagraphFinding(m);
  if (firstPara && firstPara.finding.severity !== 'green') {
    lines.push(`| T2.3 | Rewrite first paragraph (3-sentence structure, 60-100 words) | Content Writer | 2 hrs | ${phase2DepLabel} | §6.2.2 |`);
  }

  const meta = metaDescFinding(m);
  if (meta && meta.finding.severity === 'amber') {
    lines.push(`| T2.4 | Trim meta description to 140-160 chars | Content Writer | 15 min | ${phase2DepLabel} | §6.2.3 |`);
  }

  const schema = schemaFinding(m);
  if (schema && paaGap) {
    lines.push(`| T2.5 | Update FAQPage schema to match new visible Q&A content | Dev | 1 hr | T2.1 | §5.5 |`);
  }

  lines.push(`| T2.6 | Editorial review + DMS sign-off | Senior DMS | 2 hrs | All T2.* complete | §6.2 |`);
  lines.push(`| T2.7 | Stage to preview environment | Dev | 1 hr | T2.6 | §6.2 |`);
  lines.push(`| T2.8 | Client review of staged content | Client | Async (target ≤3 days) | T2.7 | §6.2 |`);
  lines.push(`| T2.9 | Deploy to production | Dev | 30 min | T2.8 | §6.2 |`);

  const zeroConv = zeroConversionFinding(m);
  if (zeroConv) {
    lines.push(`| T3.1 | Verify GA4 conversion event configuration for this URL | Analytics dev | 2 hrs | GA4 admin access | §6.3.1 |`);
    lines.push(`| T3.2 | If tracking gap: instrument missing conversion events (separate scope if real funnel issue) | Analytics dev | 4-8 hrs | T3.1 diagnosis | §6.3.1 |`);
  }

  const imgs = imageOptFindings(m);
  if (imgs.length > 0) {
    lines.push(`| T3.3 | Convert content images to webp/avif | Dev | 1 day | None | §6.3.2 |`);
  }

  const psiFailed = cwvFindings(m).find(f => /PageSpeed.*failed|HTTP 429/i.test(f.finding.finding_title));
  if (psiFailed) {
    lines.push(`| T3.4 | Configure PSI API key (project_integrations OR env var) | DevOps | 30 min | PSI key acquired | §6.3.3 |`);
  }

  lines.push(`| T3.5 | Schedule re-audit 4-6 weeks post-deploy | PM | 5 min | T2.9 deployed | §6.3.4 |`);
  lines.push(`| T3.6 | Compare pre/post metrics across §3 findings | DMS + Analyst | 2 hrs | Re-audit complete | §6.3.4 |`);
  lines.push('');

  /* §7.2 — Critical path. Phase 16.10 — render Phase 1 lane only when
     foundational exists; otherwise show Phase 2 as the lead phase with
     no Phase 1 swimlane and no T1.3 bottleneck text. */
  lines.push(`### §7.2 — Critical path`);
  lines.push('');
  lines.push('```');
  if (foundational) {
    lines.push(`Phase 1 (Week 1) ────► Phase 2 (Weeks 2-3) ────► Phase 2 Deploy (end Week 3)`);
    lines.push(`     │                                                       │`);
    lines.push(`     │   Phase 3 parallel (Weeks 2-4, no Phase 1/2 blockers) │`);
    lines.push(`     ├─► T3.1/T3.2 conversion-tracking audit                 │`);
    lines.push(`     ├─► T3.3 image format conversion                       │`);
    lines.push(`     ├─► T3.4 PSI key config                                │`);
    lines.push(`     │                                                       ▼`);
    lines.push(`     └──────────────────────────────────► Re-audit (Week 5-6)`);
  } else {
    lines.push(`Phase 2 (Weeks 1-2) ────► Phase 2 Deploy (end Week 2)`);
    lines.push(`     │                                            │`);
    lines.push(`     │   Phase 3 parallel (no Phase 2 blockers)   │`);
    lines.push(`     ├─► T3.1/T3.2 conversion-tracking audit      │`);
    lines.push(`     ├─► T3.3 image format conversion             │`);
    lines.push(`     ├─► T3.4 PSI key config                      │`);
    lines.push(`     │                                            ▼`);
    lines.push(`     └────────────────────► Re-audit (Week 4-5)`);
  }
  lines.push('```');
  lines.push('');
  if (foundational) {
    lines.push(`**Bottleneck:** T1.3 (client decision). Phase 2 cannot start until this lands. PM should escalate if T1.3 exceeds 5 business days.`);
  } else {
    lines.push(`**No Phase 1 bottleneck:** the audit produced no foundational fix requiring client decision before tactical work begins. Phase 2 work starts at kickoff. PM should still book Phase 2 review and deploy windows up front (T2.6, T2.8, T2.9).`);
  }
  lines.push('');

  /* §7.3 — Risks */
  lines.push(`### §7.3 — Risk register & mitigations`);
  lines.push('');
  lines.push(`| Risk | Likelihood | Impact | Mitigation |`);
  lines.push(`|---|---|---|---|`);
  if (foundational) {
    lines.push(`| Client doesn't decide T1.3 within 2 weeks | Medium | High — full project stalls | DMS preps decision-ready brief at T1.1; PM books decision meeting at kickoff |`);
  }
  if (paaGap && Array.isArray(unansweredArr) && unansweredArr.length >= 4) {
    lines.push(`| Writer can't deliver ${unansweredArr.length} sections in 1 week | Medium | Medium — Phase 2 slips | Brief writer at Phase 1 kickoff for pre-research; consider parallel writers |`);
  }
  if (zeroConv) {
    lines.push(`| Conversion-tracking issue is structural (not just unconfigured) | Medium | High — recovery becomes unmeasurable | Run T3.1 in Week 2 to surface structural-vs-config question early |`);
  }
  lines.push(`| Re-audit at Week 5-6 shows no improvement | Medium | Medium — diagnosis questioned | Set expectation up-front: SEO changes take 3-6 months for full effect; Week 5-6 measures *direction*, not full recovery |`);
  if (diffuseIntentFinding(m)) {
    lines.push(`| Diffuse-intent SERP keeps CTR ceiling low even after pivot | Medium | Medium — recovery caps below projection | Quote conservative scenario in §8.1 to client (not the full-recovery number) |`);
  }
  lines.push(`| Dev team bandwidth-constrained for staging/deploy | Low | Low — Phase 2.9 slips a few days | PM books dev capacity at kickoff |`);
  lines.push('');

  /* §7.4 — Definition of done */
  lines.push(`### §7.4 — Definition of Done`);
  lines.push('');
  lines.push(`The project is **done** when ALL of these are true:`);
  lines.push('');
  if (foundational) lines.push(`- [ ] T1.4: keyword direction decision documented + campaign config updated`);
  if (firstPara && firstPara.finding.severity !== 'green') lines.push(`- [ ] T2.3: first paragraph rewritten + deployed`);
  if (paaGap && Array.isArray(unansweredArr) && unansweredArr.length > 0) lines.push(`- [ ] T2.1: ${unansweredArr.length} new H2 sections written, reviewed, deployed`);
  if (schema && paaGap) lines.push(`- [ ] T2.5: FAQPage schema updated to match new content`);
  if (meta && meta.finding.severity === 'amber') lines.push(`- [ ] T2.4: meta description trimmed to 140-160 chars`);
  if (zeroConv) lines.push(`- [ ] T3.1/T3.2: conversion tracking verified or instrumented`);
  if (imgs.length > 0) lines.push(`- [ ] T3.3: content images converted to webp/avif`);
  lines.push(`- [ ] T3.5: re-audit run Week 5-6 post-deploy`);
  lines.push(`- [ ] T3.6: pre/post metric comparison delivered to client`);
  lines.push('');

  /* §7.5 — Resource & access needs. Phase 16.10 — DMS task list is
     conditional on which T-tasks actually exist; previously T1.1/T1.4
     were always cited even when no foundational. */
  lines.push(`### §7.5 — Resource & access requirements`);
  lines.push('');
  lines.push(`Confirm at kickoff:`);
  lines.push('');
  const dmsTasks: string[] = [];
  if (foundational) { dmsTasks.push('T1.1', 'T1.4'); }
  dmsTasks.push('T2.6', 'T3.6');
  lines.push(`- **Senior DMS** — ~${foundational ? '6-8' : '4-6'} hours total across project (${dmsTasks.join(', ')})`);
  const writerTasks: string[] = [];
  if (paaGap && unansweredArr && unansweredArr.length > 0) writerTasks.push('T2.1', 'T2.2');
  if (firstPara && firstPara.finding.severity !== 'green') writerTasks.push('T2.3');
  if (meta && meta.finding.severity === 'amber') writerTasks.push('T2.4');
  if (writerTasks.length > 0) {
    lines.push(`- **Content Writer** — ~5-6 days during Weeks 2-3 (${writerTasks.join(', ')})`);
  }
  const devTasks: string[] = [];
  if (schema && paaGap) devTasks.push('T2.5');
  devTasks.push('T2.7', 'T2.9');
  if (imgs.length > 0) devTasks.push('T3.3');
  lines.push(`- **Dev** — ~1-2 days total (${devTasks.join(', ')})`);
  if (zeroConv) lines.push(`- **Analytics dev** — ~4-12 hours depending on T3.1 diagnosis (T3.2 scope varies)`);
  lines.push(`- **Project Manager** — ongoing coordination across all phases`);
  if (zeroConv) lines.push(`- **GA4 admin access** — required for T3.1 + re-audit baseline`);
  lines.push(`- **GSC owner access** — required for §2.6 query-distribution refresh`);
  lines.push(`- **CMS write access** — required for T2.7 + T2.9 deploy`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
}

/* ════════════════════════════════════════════════════════════════════════
   §8 — BUSINESS IMPACT MODEL
════════════════════════════════════════════════════════════════════════ */

function renderBusinessImpactModel(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## §8 — Business Impact Model`);
  lines.push('');
  lines.push(`> Translation of CTR underperformance into recoverable click volume and dollar opportunity. All inputs cite their source §-IDs so the math is auditable.`);
  lines.push('');

  const ctr = ctrFinding(m);
  const ev = ctr?.finding.evidence;
  const bi = ev?.business_impact;

  if (!ctr || !bi) {
    lines.push(`**N/A for this audit** — no Critical or Warning CTR finding produced. Business-impact modeling requires (a) CTR underperformance and (b) sufficient impression volume (≥100/month) to compute meaningfully. Re-audit after Phase 2 deploy will produce this section if recovery uncovers measurable CTR gap.`);
    lines.push('');
    lines.push(`---`);
    lines.push('');
    return;
  }

  /* §8.1 — Inputs */
  lines.push(`### §8.1 — Inputs (sourced)`);
  lines.push('');
  lines.push(`| Input | Value | Source |`);
  lines.push(`|---|---|---|`);
  lines.push(`| Monthly impressions | ${num(ev.impressions)} | §2.1 (GSC) |`);
  lines.push(`| Actual clicks (monthly) | ${num(ev.clicks)} | §2.1 (GSC) |`);
  lines.push(`| Actual CTR | ${pct(ev.actual_ctr_pct, 2)} | §2.1 (derived: clicks ÷ impressions) |`);
  lines.push(`| Expected CTR for position | ${pct(ev.expected_ctr_pct, 1)} | Published benchmarks (§5.3) |`);
  lines.push(`| Ratio actual / expected | ${ev.ratio_pct}% | §2.1 |`);
  lines.push(`| Expected clicks at full recovery | ${num(bi.expected_clicks)} | (impressions × expected CTR) ÷ 100 |`);
  lines.push(`| Missed clicks per month | ${num(bi.missed_clicks)} | Expected − actual |`);
  lines.push(`| Click value range | \\$10–\\$30 | B2B SaaS commercial-page benchmark (§5.3) |`);
  lines.push('');

  /* §8.2 — Recovery scenarios */
  lines.push(`### §8.2 — Recovery scenarios`);
  lines.push('');
  const halfClicks = Math.round(bi.missed_clicks * 0.5);
  const halfLow = halfClicks * 10;
  const halfHigh = halfClicks * 30;
  lines.push(`| Scenario | Monthly clicks recovered | Monthly value (low) | Monthly value (high) |`);
  lines.push(`|---|---|---|---|`);
  lines.push(`| **Conservative** (50% of opportunity) | ~${halfClicks} | \\$${halfLow.toLocaleString()} | \\$${halfHigh.toLocaleString()} |`);
  lines.push(`| **Full recovery** (100% of opportunity) | ~${bi.missed_clicks} | \\$${bi.dollar_low.toLocaleString()} | \\$${bi.dollar_high.toLocaleString()} |`);
  lines.push('');

  /* §8.3 — Caveats */
  lines.push(`### §8.3 — Caveats and structural ceilings`);
  lines.push('');
  lines.push(`These factors compress the realistic recovery below the "full recovery" number:`);
  lines.push('');
  if (ev.ai_overview) {
    lines.push(bullet(`**AI Overview present** (§2.4) → expected-CTR benchmarks overstate achievable by 30-50%. See §5.1.`));
  }
  if (diffuseIntentFinding(m)) {
    lines.push(bullet(`**Diffuse-intent SERP** (§2.5.1, §5.2) → CTR ceiling structurally lower than tight-intent SERPs at same position. Best-case recovery is below the full-recovery number.`));
  }
  if (ev.ads_top && ev.ads_top >= 3) {
    lines.push(bullet(`**${ev.ads_top} top ads** (§2.4) → paid placement compresses organic visibility.`));
  }
  lines.push(bullet(`**Click value range** is industry benchmark, not THIS funnel's specific value — see §11.3 for the per-click value derivation. Client's actual per-click value depends on conversion rate × deal size; verify if possible.`));
  lines.push('');

  /* §8.4 — Realistic call */
  lines.push(`### §8.4 — Realistic expectation`);
  lines.push('');
  lines.push(`Recommend quoting clients the **conservative scenario** (\\$${halfLow.toLocaleString()}-\\$${halfHigh.toLocaleString()}/mo). Reasons:`);
  lines.push('');
  lines.push(bullet(`Caveats in §8.3 typically apply in combination, not isolation.`));
  lines.push(bullet(`SEO outcomes materialize over 3-6 months — under-promising at quoting time reduces "why isn't it working yet" friction.`));
  lines.push(bullet(`Re-audit (T3.5) will refine the number once measured against new baseline.`));
  lines.push('');
  lines.push(`---`);
  lines.push('');
}

/* ════════════════════════════════════════════════════════════════════════
   §9 — SOURCE TRUST MAP
════════════════════════════════════════════════════════════════════════ */

function renderSourceTrustMap(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## §9 — Source Trust Map`);
  lines.push('');
  lines.push(`### §9.1 — Source-by-source breakdown`);
  lines.push('');
  lines.push(`**Weighted confidence: ${I.confidence.weighted_mean}/100** across ${I.confidence.sourced_count} sourced finding(s).`);
  lines.push('');
  if (Object.keys(I.confidence.by_source).length > 0) {
    lines.push(`| Source | Finding count | Trust band | Notes |`);
    lines.push(`|---|---|---|---|`);
    for (const [src, count] of Object.entries(I.confidence.by_source).sort((a, b) => b[1] - a[1])) {
      const trustBand = trustBandForSource(src);
      const note = sourceNote(src);
      lines.push(`| ${src} | ${count} | ${trustBand} | ${note} |`);
    }
  }
  lines.push('');

  /* §9.2 — Per-finding confidence cross-reference */
  lines.push(`### §9.2 — Per-finding confidence`);
  lines.push('');
  lines.push(`| §-ID | Finding | Source(s) | Confidence |`);
  lines.push(`|---|---|---|---|`);
  for (const fi of m) {
    const srcs = [findingSourceLabel(fi.finding)];
    if (Array.isArray(fi.finding.enrichment_sources) && fi.finding.enrichment_sources.length > 0) {
      srcs.push(`+ ${fi.finding.enrichment_sources.join(', ')}`);
    }
    lines.push(`| §${fi.id} | ${clip(fi.finding.finding_title, 80)} | ${srcs.join(' ')} | ${findingConfidence(fi.finding)}/100 |`);
  }
  lines.push('');

  /* §9.3 — Failed checks */
  lines.push(`### §9.3 — Failed checks (data not collected this run)`);
  lines.push('');
  if (I.failed_checks.length === 0) {
    lines.push(`No checks failed. All 15 scheduled checks executed successfully.`);
  } else {
    lines.push(`${I.failed_checks.length} check(s) failed to execute. Findings above are partial; re-run after the underlying issue is resolved.`);
    lines.push('');
    for (const fc of I.failed_checks) lines.push(bullet(`\`${fc}\``));
  }
  lines.push('');
  lines.push(`---`);
  lines.push('');
}

function trustBandForSource(src: string): string {
  if (/SerpAPI|Search Console|Analytics 4|PageSpeed/i.test(src)) return 'Live API (high)';
  if (/HTML/i.test(src)) return 'Live fetch (high)';
  if (/Schema/i.test(src)) return 'HTML-derived (high)';
  return 'Mixed';
}
function sourceNote(src: string): string {
  if (/SerpAPI/i.test(src)) return 'Cached ≤7d, platform-wide; refresh via re-audit';
  if (/Search Console/i.test(src)) return 'GSC API lag typically 2-3 days';
  if (/Analytics 4/i.test(src)) return 'GA4 streaming; last 28 days window';
  if (/PageSpeed/i.test(src)) return 'Field data (CrUX) when available, else lab data';
  if (/HTML/i.test(src)) return 'Fresh fetch this audit run';
  if (/Schema/i.test(src)) return 'Parsed from HTML this audit run';
  return '—';
}
function findingSourceLabel(f: Finding): string {
  if (!f.data_source) return 'Unsourced';
  const map: Record<string, string> = {
    gsc: 'GSC',
    ga4: 'GA4',
    psi: 'PSI',
    html_fetch: 'HTML fetch',
    schema_parser: 'Schema parser',
  };
  return map[f.data_source] || f.data_source;
}
function findingConfidence(f: Finding): number {
  if (!f.data_source) return 0;
  const baseMap: Record<string, number> = {
    gsc: 95, ga4: 95, psi: 92, html_fetch: 87, schema_parser: 87,
  };
  const base = baseMap[f.data_source] || 80;
  /* +3 if enrichment_sources present (multi-source corroboration) */
  return Math.min(100, base + (Array.isArray(f.enrichment_sources) && f.enrichment_sources.length ? 3 : 0));
}

/* ════════════════════════════════════════════════════════════════════════
   §10 — GLOSSARY
════════════════════════════════════════════════════════════════════════ */

function renderGlossary(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## §10 — Glossary`);
  lines.push('');
  lines.push(`> 📖 **Reference section** — definitions for practitioners unfamiliar with any term used above. Skip if you know SEO.`);
  lines.push('');
  const terms: Array<[string, string]> = [
    ['AI Overview', 'Google\'s AI-generated summary appearing at the top of search results, above the traditional organic results. Broadly rolled out in 2024. Can suppress organic CTR by 30-50% for informational queries. See §5.1.'],
    ['Canonical URL', 'The HTML link tag (`rel="canonical"`) telling Google which URL is the authoritative version of duplicate or near-duplicate content. Self-referencing canonicals are the safe default.'],
    ['Core Web Vitals (CWV)', 'Google\'s metrics for page-load speed (LCP — Largest Contentful Paint), interactivity (INP — Interaction to Next Paint), and visual stability (CLS — Cumulative Layout Shift). Minor ranking signal but a real UX-quality measurement.'],
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
    ['PAA (People Also Ask)', 'Google\'s related-questions box appearing in many SERPs. Pages that explicitly answer PAA questions can capture the PAA citation. See §6.2.1.'],
    ['Schema markup', 'Structured data added to a page (JSON-LD format) telling Google what type of content it is — Article, FAQPage, Product, Review, etc. See §5.5 for the content-match policy.'],
    ['SerpAPI', 'Third-party API returning live Google SERP data including AI Overview presence, PAA questions, top-10 organic results, ads density, and SERP features. This audit uses SerpAPI to verify GSC data and detect features GSC doesn\'t report.'],
    ['SERP (Search Engine Results Page)', 'What Google shows after a search. Each keyword has its own SERP.'],
    ['Signal (in this audit)', 'A tag attached to a finding indicating what KIND of evidence it represents. When multiple findings share a signal, they corroborate the same diagnosis (see §4.1).'],
    ['Tight-intent SERP', 'The opposite of diffuse-intent — a SERP where all top-10 results share the same intent category. CTR is higher at any given position.'],
  ];
  for (const [term, def] of terms) lines.push(bullet(`**${term}** — ${def}`));
  lines.push('');
  lines.push(`---`);
  lines.push('');
}

/* ════════════════════════════════════════════════════════════════════════
   §11 — METHODOLOGY
════════════════════════════════════════════════════════════════════════ */

function renderMethodology(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## §11 — Methodology`);
  lines.push('');
  lines.push(`> 🔧 **Platform documentation** — describes what this audit checks, what thresholds it uses, and what it doesn't cover. Relevant for: platform operators, Senior DMS calibrating findings, developers auditing the engine. Skip if you're here for the SEO findings.`);
  lines.push('');
  lines.push(`### §11.1 — What this audit checks`);
  lines.push('');
  lines.push(`15 distinct checks execute per audit run. Each produces zero or more Findings (§3 lists all findings produced this run).`);
  lines.push('');
  lines.push(`1. **Indexability** — HTTP status, robots.txt, meta robots tag, X-Robots-Tag header, GSC presence`);
  lines.push(`2. **On-page fundamentals** — title, meta description, H1, word count, image alt coverage, canonical, internal-link count, anchor-text classification`);
  lines.push(`3. **Core Web Vitals** — LCP, INP, CLS via PageSpeed Insights API (mobile + desktop)`);
  lines.push(`4. **Engagement signals** — per-page GA4 (sessions, engagement rate, bounce, duration, conversions); falls back to site-wide if per-page lookup fails`);
  lines.push(`5. **Schema markup** — JSON-LD types present + per-type field validation (FAQPage Q&A structure + visible-content match, HowTo steps, Article/Product/Review required fields)`);
  lines.push(`6. **Keyword presence** — campaign keyword in title/H1/URL/meta/first paragraph with decision-tree recommendation when page is built for a different topic`);
  lines.push(`7. **CTR vs expected** — actual CTR vs published per-position benchmarks, with SerpAPI verification of SERP features when underperformance is detected and SerpAPI is configured`);
  lines.push(`8. **GSC query distribution** — top queries this URL actually receives impressions for`);
  lines.push(`9. **First-paragraph topicality** — does above-the-fold copy share substantive tokens with the page's own title/H1`);
  lines.push(`10. **Heading-hierarchy vs PAA content gap** — do the page's H2/H3 headings address the live PAA questions for the campaign keyword`);
  lines.push(`11. **Diffuse-intent SERP detection** — LLM classifies top-10 domains into intent categories; flags when 3+ distinct intents appear`);
  lines.push(`12. **Competitive content benchmark** — top-10 ranking competitors fetched in parallel; median word count + heading count derived; this page compared against the SERP-grade benchmark`);
  lines.push(`13. **Content freshness** — Last-Modified header, schema dateModified/datePublished, visible "Updated:" labels, year-in-title detection`);
  lines.push(`14. **Image optimization** — structural signals: count, lazy-loading coverage, alt-text completeness, modern format usage (webp/avif vs jpg/png/gif)`);
  lines.push(`15. **Hreflang validation** — only fires when hreflang annotations are present; validates ISO codes, self-reference, x-default, duplicate-language conflicts`);
  lines.push('');

  lines.push(`### §11.2 — Not yet covered`);
  lines.push('');
  lines.push(`- Schema Rich Results testing via Google's API (currently uses offline per-type validation)`);
  lines.push(`- Cross-domain inbound-anchor analysis (would require a backlink-data API or separate crawler)`);
  lines.push(`- Full site crawl (this audit is single-URL scope)`);
  lines.push(`- Manual-penalty checks`);
  lines.push(`- Log file analysis`);
  lines.push(`- Actual image byte-weight breakdown (currently structural patterns only)`);
  lines.push(`- Font loading + HTTP/2 push + resource hints`);
  lines.push(`- CSP / security headers analysis`);
  lines.push('');

  lines.push(`### §11.3 — Heuristics and thresholds`);
  lines.push('');
  lines.push(`Material thresholds the audit uses for severity classification:`);
  lines.push('');
  lines.push(`- **CTR underperformance:** ratio < 0.5 → Critical; 0.5 ≤ ratio < 0.8 → Warning; ratio > 1.3 → Strong (green)`);
  lines.push(`- **CTR sample size:** impressions ≥ 100 required for credible CTR comparison; below threshold returns Info ("skipped — too small")`);
  lines.push(`- **Click-value range:** \\$10–\\$30 per commercial-page click (B2B SaaS benchmark, lower bound = free-trial funnels, upper bound = enterprise lead-gen). Used in §8 dollar opportunity computation.`);
  lines.push(`- **Engagement rate:** per-page <40% → Critical, 40-55% → Warning, ≥55% → Pass`);
  lines.push(`- **Avg session duration:** <30s on a content page with ≥50 sessions → Warning`);
  lines.push(`- **Zero conversion threshold:** sessions ≥50 AND conversions == 0 → Warning (tracking gap vs funnel diagnosis)`);
  lines.push(`- **Token overlap (first-paragraph topicality):** 0% → Critical, <20% → Warning, ≥40% → Pass`);
  lines.push(`- **PAA gap:** 0 of N PAA questions matched by headings → Critical`);
  lines.push(`- **Diffuse intent:** 3+ distinct intent categories in top-10 → Warning (amber)`);
  lines.push(`- **Word-count vs competitor median:** <60% of median → Critical (thin); >180% → Info (potential bloat, cross-check §5.2 for intent diffusion)`);
  lines.push(`- **Content freshness:** >24 months → Critical; 12-24 months → Warning; <12 months → Pass`);
  lines.push(`- **Image optimization:** lazy-loading <50% on 10+ image pages → Warning; modern-format 0% on 5+ image pages → Warning; alt-coverage <80% on 5+ image pages → Warning`);
  lines.push(`- **Anchor-text quality:** generic-or-URL-based >40% → Warning; descriptive >60% → Pass`);
  lines.push('');

  lines.push(`### §11.4 — Role view mapping`);
  lines.push('');
  lines.push(`How each role can extract a tailored view from this document — both for humans reading and for LLMs queried with the doc as context:`);
  lines.push('');
  lines.push(`| Role | Sections to read | Cross-reference depth |`);
  lines.push(`|---|---|---|`);
  lines.push(`| **Senior DMS** | All sections, with attention to §4 (convergence) and §5 (industry context) | Full graph — every claim traceable |`);
  lines.push(`| **Client** | §0 (exec summary) + §8 (impact model) + top-3 from §6 | Cross-refs back to §3 evidence on request |`);
  lines.push(`| **Content Writer** | §1.1, §1.2 (current state) + §3.X for PAA gap + §6.2 (content recommendations) + §5.5 (schema policy) | Follow §6.2 → §3 → §1 cross-refs |`);
  lines.push(`| **PM** | §7 (task map) — each task cross-refs back to §6 + §3 | Use §7.1 as pipeline input |`);
  lines.push(`| **Sales** | §0 + §4.2 (hardened diagnoses) + §8 (dollar opportunity) | Quote §-IDs as evidence in pitch |`);
  lines.push(`| **Junior SEO** | §3 (findings) + §5 (industry context) + §10 (glossary) | Read full evidence chains for learning value |`);
  lines.push('');
  lines.push(`---`);
  lines.push('');
}

/* ════════════════════════════════════════════════════════════════════════
   §12 — APPENDIX
════════════════════════════════════════════════════════════════════════ */

function renderAppendix(lines: string[], I: DeepReportInputs, m: FindingWithId[]): void {
  lines.push(`## §12 — Appendix`);
  lines.push('');
  lines.push(`### §12.1 — Raw finding evidence (JSON dumps)`);
  lines.push('');
  lines.push(`Each finding's full evidence object, for verification or downstream pipeline ingestion.`);
  lines.push('');
  for (const fi of m) {
    if (!fi.finding.evidence || Object.keys(fi.finding.evidence).length === 0) continue;
    lines.push(`<details><summary>§${fi.id} — ${fi.finding.finding_title}</summary>`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(fi.finding.evidence, null, 2));
    lines.push('```');
    lines.push('');
    lines.push(`</details>`);
    lines.push('');
  }

  /* §12.2 — Top-10 competitor content table (when available) */
  const comp = competitiveContentFinding(m);
  if (comp) {
    lines.push(`### §12.2 — Top-10 competitor content benchmark`);
    lines.push('');
    /* The competitor table is embedded in the finding's detail string;
       link to it for now */
    lines.push(`Full competitor benchmark in ${xref(comp)}.`);
    lines.push('');
  }

  /* §12.3 — Audit run metadata */
  lines.push(`### §12.3 — Audit run metadata`);
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Run ID | \`${I.run_id}\` |`);
  lines.push(`| Audited at | ${I.audited_at} |`);
  lines.push(`| Source | \`${I.source}\`${I.source_note ? ` (${I.source_note})` : ''} |`);
  lines.push(`| Total findings | ${m.length} |`);
  lines.push(`| Failed checks | ${I.failed_checks.length === 0 ? 'none' : I.failed_checks.length} |`);
  lines.push('');
}
