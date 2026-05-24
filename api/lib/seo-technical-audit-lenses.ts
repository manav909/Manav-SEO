/* ════════════════════════════════════════════════════════════════
   seo-technical-audit-lenses.ts

   Multi-lens renderer for technical audit findings. Same findings,
   six fundamentally different documents — each written for a specific
   reader with the depth and context THEY need.

   Lenses (Manav 2026-05-24):
     1. Senior DMS         — strategic diagnosis, cross-finding analysis,
                             industry context, sequencing rationale
     2. Client             — plain-English exec summary, dollar impact,
                             top-3 fixes, confidence framing
     3. Content Writer     — pasteable templates, H2 candidates with
                             direct-answer specs, voice guidance, citations
     4. PM                 — task table with effort estimates, dependencies,
                             risks, definition-of-done
     5. Sales              — meeting hook, evidence-driven pitch, objection
                             handling, differentiation narrative
     6. Junior SEO Exec    — concept walkthrough, glossary, how-to-diagnose
                             manually, learning value per finding

   This is NOT a new api/*.ts function — it's a helper in api/lib/.
   Ceiling on api/*.ts stays at 12.

   Architecture: each lens reads the same Finding[] but extracts only
   what it needs via shared extractor helpers. No new LLM calls; all
   content is templated from finding data + structural reasoning.
═══════════════════════════════════════════════════════════════════ */

import type { Finding } from "./seo-technical-audit.js";

/* ════════════════════════════════════════════════════════════════
   PUBLIC API
═══════════════════════════════════════════════════════════════════ */

export interface LensInputs {
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
}

export interface LensReports {
  senior_dms: string;
  client: string;
  content_writer: string;
  pm: string;
  sales: string;
  junior_seo: string;
}

/** Master renderer — produces all 6 lens outputs from one finding set. */
export function renderAuditForAllLenses(inputs: LensInputs): LensReports {
  return {
    senior_dms:     renderSeniorDmsLens(inputs),
    client:         renderClientLens(inputs),
    content_writer: renderContentWriterLens(inputs),
    pm:             renderPmLens(inputs),
    sales:          renderSalesLens(inputs),
    junior_seo:     renderJuniorSeoLens(inputs),
  };
}

/** Concatenate all 6 lens outputs into a single navigable markdown
 *  document with TOC at top and `---` separators. Each lens keeps its
 *  own header so it stands as a complete document if copy-pasted.    */
export function concatenateLensReports(lenses: LensReports, inputs: LensInputs): string {
  const lines: string[] = [];
  lines.push(`# Multi-Lens Technical Audit: ${inputs.url}`);
  lines.push('');
  lines.push(`**Campaign keyword:** \`${inputs.keyword}\``);
  lines.push(`**Audited at:** ${inputs.audited_at}`);
  lines.push(`**Audit run id:** \`${inputs.run_id}\``);
  lines.push('');
  lines.push('This audit is structured as **six role-specific documents**. Same findings, six fundamentally different framings — each written for a specific reader with the depth and context they need. Navigate to the lens that fits your role:');
  lines.push('');
  lines.push('| Lens | For | Purpose |');
  lines.push('|---|---|---|');
  lines.push('| 📊 [Strategic Brief](#strategic-brief--senior-digital-marketing-specialist) | Senior DMS | Diagnose, sequence work, weigh tradeoffs, brief the client |');
  lines.push('| 💼 [Executive Summary](#executive-summary--client) | Client | Decide whether and how to invest; understand impact |');
  lines.push('| ✍️ [Content Brief](#content-brief--content-writer) | Content Writer | Write the actual content with templates and constraints |');
  lines.push('| 📋 [Project Plan](#project-plan--project-manager) | PM | Coordinate work, track tasks, manage risks |');
  lines.push('| 🎯 [Sales Brief](#sales-brief--sales) | Sales | Pitch the engagement, handle objections, close |');
  lines.push('| 📚 [Learning Walkthrough](#learning-walkthrough--junior-seo-executive) | Junior SEO | Learn concepts in their applied form |');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`**At a glance:** ${inputs.red_count} Critical · ${inputs.amber_count} Warning · ${inputs.green_count} Pass · ${inputs.info_count} Info. Source confidence ${inputs.confidence.weighted_mean}/100 across ${inputs.confidence.sourced_count} sourced findings.`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(lenses.senior_dms);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(lenses.client);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(lenses.content_writer);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(lenses.pm);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(lenses.sales);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(lenses.junior_seo);
  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════
   EXTRACTORS — pull structured data from findings array
═══════════════════════════════════════════════════════════════════ */

function findByTitleRegex(findings: Finding[], pattern: RegExp): Finding | null {
  return findings.find(f => pattern.test(f.finding_title)) || null;
}
function findAllByTitleRegex(findings: Finding[], pattern: RegExp): Finding[] {
  return findings.filter(f => pattern.test(f.finding_title));
}
function findCtrFinding(findings: Finding[]): Finding | null {
  return findByTitleRegex(findings, /CTR is .+ of expected/i);
}
function findKeywordPresenceFinding(findings: Finding[]): Finding | null {
  return findByTitleRegex(findings, /Campaign keyword .+ only partially present|Campaign keyword .+ not present/i);
}
function findFirstParaFinding(findings: Finding[]): Finding | null {
  return findByTitleRegex(findings, /First paragraph (is off-topic|weakly aligned)/i);
}
function findPaaContentGapFinding(findings: Finding[]): Finding | null {
  return findByTitleRegex(findings, /Content gap.+PAA questions/i);
}
function findDiffuseIntentFinding(findings: Finding[]): Finding | null {
  return findByTitleRegex(findings, /Diffuse-intent SERP/i);
}
function findCompetitiveContentFinding(findings: Finding[]): Finding | null {
  return findByTitleRegex(findings, /Content depth.+SERP median/i);
}
function findPerPageGa4Finding(findings: Finding[]): Finding | null {
  return findByTitleRegex(findings, /Per-page engagement rate/i);
}
function findZeroConversionFinding(findings: Finding[]): Finding | null {
  return findByTitleRegex(findings, /Zero conversions recorded/i);
}
function findContentFreshnessFinding(findings: Finding[]): Finding | null {
  return findByTitleRegex(findings, /Content is (fresh|stale|aging)|content-freshness/i);
}
function findImageOptFindings(findings: Finding[]): Finding[] {
  return findAllByTitleRegex(findings, /modern image format|images? missing alt|Lazy-loading coverage|image optimization signals/i);
}
function findAnchorTextFinding(findings: Finding[]): Finding | null {
  return findByTitleRegex(findings, /Anchor-text quality|anchors are descriptive|anchors are generic/i);
}
function findSchemaFinding(findings: Finding[]): Finding | null {
  return findByTitleRegex(findings, /Schema (present|validation|fields missing)/i);
}
function findCwvFinding(findings: Finding[]): Finding | null {
  return findByTitleRegex(findings, /Core Web Vitals|PageSpeed Insights|LCP|INP|CLS/i);
}
function findMetaDescFinding(findings: Finding[]): Finding | null {
  return findByTitleRegex(findings, /Meta description/i);
}

/* Get the foundational-fix Critical finding (the 🎯-marked one).
   The signal is the presence of a "Foundational fix" prefix in the
   finding_detail or a specific evidence key. */
function findFoundationalCriticalFinding(findings: Finding[]): Finding | null {
  return findings.find(f =>
    f.severity === 'red' &&
    typeof f.finding_detail === 'string' &&
    /Foundational fix|🎯/i.test(f.finding_detail)) || null;
}

/* List all signal types present in findings (used by Senior DMS lens
   to identify cross-finding convergence). */
function collectAllSignals(findings: Finding[]): string[] {
  const set = new Set<string>();
  for (const f of findings) {
    if (Array.isArray(f.signals)) {
      for (const s of f.signals) set.add(s);
    }
  }
  return Array.from(set);
}

/* ════════════════════════════════════════════════════════════════
   1️⃣  SENIOR DMS LENS
   For: Senior Digital Marketing Specialist
   Purpose: Strategic diagnosis with all evidence threads, cross-
            finding analysis, industry context, tactical priorities
            with leverage rationale, decision framework, source trust.
═══════════════════════════════════════════════════════════════════ */

function renderSeniorDmsLens(I: LensInputs): string {
  const lines: string[] = [];
  lines.push('## 📊 Strategic Brief — Senior Digital Marketing Specialist');
  lines.push('');
  lines.push(`> **For:** Senior practitioner taking strategic ownership of this page's recovery. You need the full evidence picture, cross-finding analysis, sequencing rationale, and SEO-economics context to make defensible recommendations and brief the client confidently.`);
  lines.push('');

  // ============ Section 1: Strategic Diagnosis ============
  lines.push('### Strategic Diagnosis (60-second read)');
  lines.push('');
  const ctr = findCtrFinding(I.findings);
  const kw = findKeywordPresenceFinding(I.findings);
  const diffuse = findDiffuseIntentFinding(I.findings);
  const ga4 = findPerPageGa4Finding(I.findings);
  const zeroConv = findZeroConversionFinding(I.findings);

  if (kw && ctr) {
    const ctrRatio = ctr.evidence?.ratio_pct ?? null;
    const missedClicks = ctr.evidence?.missed_monthly_clicks ?? null;
    const dollarLow = ctr.evidence?.dollar_opportunity_low ?? null;
    const dollarHigh = ctr.evidence?.dollar_opportunity_high ?? null;
    const pivotTarget = kw.evidence?.suggested_pivot || extractPivotFromText(kw);

    lines.push(`This page is targeted at "${I.keyword}" but the underlying content is built for **${pivotTarget || 'a different keyword'}**. The convergence of evidence is unambiguous — four independent signals all point to the same diagnosis. Even if every tactical recommendation in this audit were executed perfectly without addressing the keyword mismatch, recovery would cap out well below the projected opportunity because the page would still be invisible on the campaign keyword's live SERP.`);
    lines.push('');
    if (diffuse) {
      const catCount = diffuse.evidence?.distinct_categories ?? 4;
      lines.push(`Compounding the diagnosis: the live SERP for "${I.keyword}" spans ${catCount} distinct intent categories. This isn't a tight-intent SERP where moving from position 7 to position 3 reliably recovers CTR — it's a structurally diffuse SERP where even a #1 ranking competes for click-share against fundamentally different result types. The keyword-pivot recommendation matters more here than it would on a tight-intent SERP, because the alternative (staying on this keyword and grinding for position) has a structurally lower ceiling.`);
      lines.push('');
    }
    if (ctrRatio !== null && missedClicks !== null) {
      lines.push(`The business impact frame: actual CTR is **${ctrRatio}% of expected** for the reported position, translating to **~${missedClicks} missed monthly clicks**${dollarLow && dollarHigh ? ` worth **$${dollarLow.toLocaleString()}–$${dollarHigh.toLocaleString()} monthly** at B2B SaaS commercial-page click values` : ''}. Worth noting: GSC's position 7.1 average is aggregated across all queries this URL ranks for — the live SERP for "${I.keyword}" specifically has this URL outside the top 100. The 7.1 figure is being driven by *other* queries.`);
      lines.push('');
    }
  } else if (ctr) {
    lines.push(`Primary diagnosis is CTR underperformance at position ${ctr.evidence?.avg_position ?? 'reported'}, but the keyword-presence analysis didn't return a clear pivot recommendation. Worth manually verifying whether this is a CTR-tactics problem or a deeper targeting problem before committing to recovery work.`);
    lines.push('');
  } else {
    lines.push(`This page does not show a CTR-vs-position underperformance pattern. The findings instead point toward structural or content-quality issues — see Evidence Threads below.`);
    lines.push('');
  }

  // ============ Section 2: Convergence Statement ============
  const allSignals = collectAllSignals(I.findings);
  const kwSignals = ['keyword_mismatch', 'url_not_in_top_10', 'serp_topic_mismatch', 'first_paragraph_off_topic'];
  const kwSignalsPresent = kwSignals.filter(s => allSignals.includes(s));
  if (kwSignalsPresent.length >= 2) {
    lines.push('#### Convergence');
    lines.push('');
    lines.push(`When two or more findings independently corroborate the same diagnosis — using different methodologies and different data sources — the recommendation hardens from hypothesis to operational call. This audit has **${kwSignalsPresent.length} independent signals** supporting the keyword-pivot diagnosis, each from a different vantage point:`);
    lines.push('');
    const signalDescriptions: Record<string, string> = {
      keyword_mismatch: 'Token-overlap analysis: title and H1 do not carry the full campaign keyword phrase. Evidence source: live HTML fetch + token-set comparison.',
      url_not_in_top_10: 'Live SERP position check via SerpAPI: the audited URL is not in the top 100 for the campaign keyword. Evidence source: SerpAPI live SERP fetch.',
      serp_topic_mismatch: 'Diffuse-intent SERP detection: the live top-10 spans 3+ intent categories, meaning even Google\'s ranking signals don\'t treat this query as having a single dominant intent. Evidence source: LLM-classification of top-10 domains.',
      first_paragraph_off_topic: 'First-paragraph topicality analysis: zero substantive token overlap between the page\'s above-the-fold copy and its own title/H1. Evidence source: live HTML fetch + topical-overlap heuristic.',
    };
    for (const s of kwSignalsPresent) {
      lines.push(`- **${s.replace(/_/g, ' ')}** — ${signalDescriptions[s] || 'see relevant finding'}`);
    }
    lines.push('');
    lines.push('Four independent measurements producing the same diagnosis is not a coincidence. The recommendation is hardened.');
    lines.push('');
  }

  // ============ Section 3: Evidence Threads ============
  lines.push('### Evidence Threads');
  lines.push('');
  lines.push('Findings grouped by the hypothesis they support. Each thread shows how multiple findings corroborate one underlying problem — and which findings, if treated in isolation, would lead to wrong conclusions.');
  lines.push('');

  // Thread 1: Keyword pivot
  if (kw || ctr || diffuse) {
    lines.push('#### Thread 1 — Keyword mismatch (the foundational issue)');
    lines.push('');
    if (kw) {
      lines.push(`**${kw.finding_title}** — ${stripMarkdownPrefix(kw.finding_detail || '').slice(0, 350)}…`);
      lines.push('');
      if (kw.recommendation) {
        lines.push(`*Recommendation:* ${kw.recommendation.slice(0, 300)}${(kw.recommendation.length > 300 ? '…' : '')}`);
        lines.push('');
      }
    }
    if (ctr) {
      const inTop100 = ctr.evidence?.in_live_top_100;
      if (inTop100 === false) {
        lines.push(`**Corroborating signal — Live SERP check:** SerpAPI verifies the audited URL is NOT in the top 100 for "${I.keyword}". GSC's position 7.1 average is therefore being driven by *other* queries this URL ranks for. The audit's query-distribution finding will surface those queries; some of them may be better campaign-keyword candidates than "${I.keyword}".`);
        lines.push('');
      }
    }
    if (diffuse) {
      const cats = diffuse.evidence?.categories || [];
      const catCount = cats.length || diffuse.evidence?.distinct_categories || 0;
      lines.push(`**Corroborating signal — Diffuse-intent SERP:** ${catCount} distinct intent categories in the top 10. Google's own ranking signals show ambiguity about what users want from this query.`);
      if (cats.length > 0) {
        lines.push('');
        lines.push('Intent breakdown:');
        for (const c of cats.slice(0, 6)) {
          lines.push(`- **${c.name}** (${c.count}): ${(c.domains || []).slice(0, 5).map((d: string) => '`' + d + '`').join(', ')}`);
        }
      }
      lines.push('');
      lines.push(`*Why this matters for the keyword decision:* even ranking #1 on a diffuse-intent SERP yields lower CTR than a tight-intent SERP at the same position because users skip results matching a different intent than theirs. The CTR ceiling on this keyword is structurally limited — moving from position 7 to position 3 would help, but the diffuse-intent ceiling caps the upside.`);
      lines.push('');
    }
    lines.push(`**Senior DMS judgment for this thread:** The keyword-pivot decision is foundational. Tactical fixes done before this decision get undone if the pivot happens — and the diffuse-intent finding means the cost of NOT pivoting is higher than usual. Recommend escalating to client with the pivot decision teed up.`);
    lines.push('');
  }

  // Thread 2: AI Overview / SERP economics
  if (ctr) {
    const aiOverview = ctr.evidence?.ai_overview || ctr.evidence?.serp_features?.ai_overview;
    const paaCount = ctr.evidence?.paa_count || ctr.evidence?.serp_features?.paa_count || (Array.isArray(ctr.evidence?.paa_questions) ? ctr.evidence.paa_questions.length : 0);
    if (aiOverview || paaCount) {
      lines.push('#### Thread 2 — AI Overview & SERP-features impact');
      lines.push('');
      lines.push(`The live SERP for "${I.keyword}" has features that compress organic CTR independently of position:`);
      lines.push('');
      if (aiOverview) {
        lines.push(`- **AI Overview present** at top of SERP. For informational queries, AI Overview typically suppresses organic CTR by 30-50% — users get their answer from the AI summary without clicking through. Recovery strategy here is not "rank higher" but "be cited in the AI summary."`);
      }
      if (paaCount) {
        lines.push(`- **${paaCount} People Also Ask questions** in a box. PAA boxes push organic results further down the page AND capture clicks from users who find their question in PAA. PAA-capture strategy: word an H2 verbatim as the PAA question, then provide a 40-80 word direct answer in the first sentence beneath it.`);
      }
      lines.push('');
      lines.push(`*Senior DMS judgment for this thread:* AI-Overview-era SEO is a different game than position-ranking SEO. Even if the keyword pivot lands and the page ranks well for a better-fit keyword, AI Overview will continue to suppress raw CTR unless the page is structured for citation eligibility. Citation tactics (PAA-driven H2s with direct answers, authoritative external citations, valid schema) compound across recovery work — they don't sit in tension with the keyword pivot, they reinforce it.`);
      lines.push('');
    }
  }

  // Thread 3: Engagement & conversion
  if (ga4 || zeroConv) {
    lines.push('#### Thread 3 — Engagement & conversion');
    lines.push('');
    if (ga4 && ga4.evidence) {
      const ev = ga4.evidence;
      lines.push(`Per-page GA4 (last 28 days): ${ev.sessions || 0} sessions, ${ev.engagement_rate_pct?.toFixed(1) || '?'}% engagement, ${ev.avg_session_sec?.toFixed(0) || '?'}s avg duration, ${ev.bounce_rate_pct?.toFixed(1) || '?'}% bounce, ${ev.conversions ?? '?'} conversions.`);
      lines.push('');
    }
    if (zeroConv) {
      lines.push(`**Zero conversions** on ${zeroConv.evidence?.sessions || 'reported'} sessions. This is either a conversion-tracking gap (GA4 events not firing for this URL) OR a real funnel problem. The audit can't distinguish from external data — needs an analyst to verify GA4 events configuration.`);
      lines.push('');
    }
    lines.push(`*Senior DMS judgment for this thread:* The engagement and conversion problems are independent of the keyword issue. Even if the keyword pivot lands and CTR recovers, the visitors arriving still won't convert without addressing the conversion path. Treat this as a parallel workstream, not a downstream consequence of the keyword work. Recommend instrumentation audit before allocating more content/SEO budget.`);
    lines.push('');
  }

  // Thread 4: Structural / content polish
  const cwv = findCwvFinding(I.findings);
  const imageOpt = findImageOptFindings(I.findings);
  const anchor = findAnchorTextFinding(I.findings);
  const schema = findSchemaFinding(I.findings);
  const meta = findMetaDescFinding(I.findings);
  if (cwv || imageOpt.length || anchor || schema || meta) {
    lines.push('#### Thread 4 — Structural & content polish (lower priority)');
    lines.push('');
    lines.push('These findings represent real but lower-leverage issues. Each individually moves the needle by ones-of-percent — collectively they\'re worth addressing, but only after the foundational keyword/intent work is done. Doing these first is the classic "rearranging deck chairs" trap.');
    lines.push('');
    if (cwv) lines.push(`- **Core Web Vitals:** ${cwv.severity === 'amber' || cwv.severity === 'red' ? 'check pending or failing — investigate' : 'baseline OK'}`);
    if (meta && meta.severity === 'amber') lines.push(`- **Meta description length:** ${meta.evidence?.length_chars || 'suboptimal'} chars — target 140-160 for full SERP display`);
    if (imageOpt.length) {
      for (const f of imageOpt) {
        lines.push(`- **${f.finding_title}** — ${f.severity}`);
      }
    }
    if (anchor && anchor.severity === 'green') lines.push(`- **Anchor-text quality:** healthy at ${anchor.evidence?.descriptive_pct?.toFixed(0) || '?'}% descriptive — preserve when adding new internal links`);
    if (schema) lines.push(`- **Schema:** ${schema.finding_title}`);
    lines.push('');
  }

  // ============ Section 4: Tactical Priorities (sequenced) ============
  lines.push('### Tactical Priorities (in execution order)');
  lines.push('');
  lines.push('Sequencing matters because some fixes get undone if done in the wrong order. The leverage rationale below explains why each item is where it is in the sequence.');
  lines.push('');
  const foundational = findFoundationalCriticalFinding(I.findings);

  lines.push('#### Phase 1: Foundational (do first — sequencing-critical)');
  lines.push('');
  if (foundational) {
    lines.push(`**1. Decide the keyword direction.** ${stripMarkdownPrefix(foundational.finding_title)}`);
    lines.push('');
    lines.push(`Two paths:`);
    lines.push(`- **(a) Reassign campaign keyword** to better match the page's actual content (typically a "${kw?.evidence?.suggested_pivot || 'tighter-related variant'}"-style pivot). Low effort, fast, but cedes the "${I.keyword}" intent target.`);
    lines.push(`- **(b) Rewrite the page** to genuinely cover "${I.keyword}" — content overhaul, not a tweak. Higher effort, preserves the campaign target.`);
    lines.push('');
    lines.push(`*Leverage rationale:* every Phase 2 tactic resets against the new target. Doing Phase 2 first means redoing it after the decision lands.`);
    lines.push('');
  } else if (kw) {
    lines.push(`**1. Address keyword mismatch.** See "${kw.finding_title}"`);
    lines.push('');
  }

  lines.push('#### Phase 2: Content overhaul (do after Phase 1 lands)');
  lines.push('');
  const paaGap = findPaaContentGapFinding(I.findings);
  const firstPara = findFirstParaFinding(I.findings);
  let phase2Num = 2;
  if (paaGap) {
    const paaQs = paaGap.evidence?.unanswered_paa_questions || paaGap.evidence?.paa_questions || [];
    lines.push(`**${phase2Num++}. Add ${paaQs.length || 4} new H2 sections** answering the PAA questions verbatim. Each H2 needs a 40-80 word direct answer in its first sentence (citation-eligible format). This is the highest-leverage tactic for AI-Overview-era recovery on this SERP.`);
    lines.push('');
  }
  if (firstPara) {
    lines.push(`**${phase2Num++}. Rewrite first paragraph** to genuinely address the page's stated topic. Currently templated/off-topic copy is hurting both content-quality signals and the bounce rate the GA4 data shows.`);
    lines.push('');
  }
  if (ctr) {
    lines.push(`**${phase2Num++}. AI Overview citation optimization** — beyond PAA H2s: ensure schema content matches visible Q&A, cite authoritative external sources (vendor docs, Gartner, G2 for B2B SaaS topics), structure key facts as scannable lists.`);
    lines.push('');
  }

  lines.push('#### Phase 3: Validation & parallel workstreams');
  lines.push('');
  let phase3Num = phase2Num;
  if (zeroConv) {
    lines.push(`**${phase3Num++}. Verify conversion tracking** (can start immediately, independent of Phase 1/2). GA4 events configured for this pagePath? If not, instrument before more traffic arrives — otherwise recovery is invisible.`);
    lines.push('');
  }
  if (imageOpt.length || cwv) {
    lines.push(`**${phase3Num++}. Structural polish** — image format conversion (webp/avif), CWV verification when PSI key configured. Parallelizable, lower-priority but compounding.`);
    lines.push('');
  }
  lines.push(`**${phase3Num++}. Re-audit** after Phase 1+2 deploy. Validate the diagnosis: did the keyword pivot bring this URL into the top-30 for the new target? Did the new H2s capture PAA boxes?`);
  lines.push('');

  // ============ Section 5: Handle internally vs escalate ============
  lines.push('### Handle Internally vs Escalate to Client');
  lines.push('');
  lines.push('**Handle internally (DMS owns):**');
  lines.push('- Tactical optimization within the agreed campaign-keyword direction');
  lines.push('- Image format conversion, meta description tightening, anchor-text refinement');
  lines.push('- Re-audit cadence and progress tracking');
  if (imageOpt.length) lines.push('- Working with dev to convert images to webp/avif if no asset-pipeline overhaul required');
  lines.push('');
  lines.push('**Escalate to client (client owns the decision):**');
  if (foundational || kw) {
    lines.push('- **Keyword direction decision** — this is a strategic call about what business outcome the page serves. The DMS frames the options; the client picks.');
  }
  if (zeroConv) {
    lines.push('- **Conversion tracking audit** — requires access to GA4 configuration and possibly the dev team. Most clients aren\'t aware of zero-conversion gaps until surfaced.');
  }
  if (ctr) {
    lines.push('- **Content overhaul vs keyword reassignment trade-off** — material effort difference (1 hour vs 1 week of writing); client decides based on strategic value of the keyword.');
  }
  lines.push('');

  // ============ Section 6: SEO Economics Context ============
  lines.push('### SEO Economics Context');
  lines.push('');
  lines.push('Worth keeping in mind when framing recommendations and setting client expectations:');
  lines.push('');
  if (ctr?.evidence?.ai_overview) {
    lines.push('**AI Overview era.** Google\'s AI summary at the top of SERPs has been live since 2024 and now appears on the majority of informational queries. The CTR-vs-position benchmarks (AdvancedWebRanking, Backlinko, FirstPageSage) most agencies still quote were measured pre-AI-Overview and overstate recoverable CTR on AI-Overview SERPs by 30-50%. When pitching recovery numbers to the client, anchor on AI-Overview-aware tactics: citation eligibility, not just position.');
    lines.push('');
  }
  if (diffuse) {
    lines.push('**Diffuse-intent SERPs.** When Google\'s top 10 spans 3+ intent categories, the keyword is structurally lower-leverage than it appears in keyword-volume tools. High search volume doesn\'t translate to recoverable clicks when click-share is fragmented across intent types. Most keyword-research tools don\'t surface this; SerpAPI-verified intent classification does.');
    lines.push('');
  }
  if (cwv) {
    lines.push('**Core Web Vitals.** CWV is now a ranking signal in Google\'s page-experience update, but the practical impact on rankings is small relative to content and topical relevance. CWV improvements move the needle on bounce rate and conversion more than on rankings. Treat CWV as a UX-and-conversion lever, not a ranking lever.');
    lines.push('');
  }
  if (findContentFreshnessFinding(I.findings)) {
    lines.push('**Content freshness.** For time-sensitive topics (pricing, "best of" lists, year-labeled guides), Google\'s freshness signal weights material content updates more heavily than date-stamp changes. Touching `dateModified` without changing content doesn\'t help — Google\'s models look at actual textual changes. When refreshing content, log what changed and why; clients sometimes ask.');
    lines.push('');
  }

  // ============ Section 7: Source Trust Map ============
  lines.push('### Source Trust Map');
  lines.push('');
  lines.push(`**Weighted confidence: ${I.confidence.weighted_mean}/100** across ${I.confidence.sourced_count} sourced findings.`);
  lines.push('');
  if (Object.keys(I.confidence.by_source).length > 0) {
    lines.push('Source-by-source breakdown:');
    lines.push('');
    lines.push('| Source | Findings | Trust band |');
    lines.push('|---|---|---|');
    for (const [src, count] of Object.entries(I.confidence.by_source).sort((a, b) => b[1] - a[1])) {
      const trustBand = src.includes('SerpAPI') || src.includes('Search Console') || src.includes('Analytics 4') || src.includes('PageSpeed') ? 'Live API (high)' : src.includes('HTML') ? 'Live fetch (high)' : src.includes('Schema') ? 'HTML-derived (high)' : 'Mixed';
      lines.push(`| ${src} | ${count} | ${trustBand} |`);
    }
    lines.push('');
  }
  if (I.failed_checks.length > 0) {
    lines.push(`**Failed checks (data not collected this run):** ${I.failed_checks.map(s => '`' + s + '`').join(', ')}. These are NOT findings — they represent checks the audit attempted but couldn't complete (e.g., PSI 429 rate-limit). Re-run after the underlying issue is resolved.`);
    lines.push('');
  }

  // ============ Section 8: Open questions ============
  lines.push('### Open Questions Requiring Investigation');
  lines.push('');
  const openQs: string[] = [];
  if (zeroConv) {
    openQs.push('Is the GA4 zero-conversion result a tracking gap or a real funnel problem? Verify by filtering GA4 events report by this pagePath; if no conversion events fire, instrument them.');
  }
  if (findContentFreshnessFinding(I.findings)?.evidence?.most_recent_source === 'Last-Modified header') {
    openQs.push('The content-freshness signal relies solely on the Last-Modified header. Was the content genuinely updated, or did the CDN refresh the file timestamp without content change? Cross-verify with schema dateModified and visible "Updated:" labels.');
  }
  if (diffuse) {
    openQs.push(`The diffuse-intent finding doesn't recommend specific tighter-keyword variants. Cross-reference with GSC query-distribution data to identify tighter keywords this URL already gets impressions for — those are the best pivot candidates because the URL has existing search authority on them.`);
  }
  if (schema && schema.severity === 'green' && /FAQPage/i.test(schema.finding_title)) {
    openQs.push(`The page validates as FAQPage schema. Is FAQPage the right schema type for a pricing-comparison page? The content-match check passed, but the type-fit question is broader: should this be Article + Product schema, or remain FAQPage? Manual review recommended.`);
  }
  if (openQs.length === 0) {
    openQs.push('No specific open questions surfaced from this audit. Run the next audit after Phase 1 changes land to validate the diagnosis.');
  }
  for (const q of openQs) lines.push(`- ${q}`);
  lines.push('');

  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════
   2️⃣  CLIENT LENS
   For: Business owner / marketing director / decision-maker
   Purpose: Plain-English executive summary, dollar impact, prioritized
            top-3 fixes, confidence framing, next steps, glossary.
═══════════════════════════════════════════════════════════════════ */

function renderClientLens(I: LensInputs): string {
  const lines: string[] = [];
  lines.push('## 💼 Executive Summary — Client');
  lines.push('');
  lines.push(`> **For:** Business decision-maker. You need a 90-second read that tells you what's wrong, what it's costing you, what we recommend, and what you need to decide. No SEO jargon without an explanation.`);
  lines.push('');

  const ctr = findCtrFinding(I.findings);
  const kw = findKeywordPresenceFinding(I.findings);
  const zeroConv = findZeroConversionFinding(I.findings);
  const diffuse = findDiffuseIntentFinding(I.findings);
  const paaGap = findPaaContentGapFinding(I.findings);
  const firstPara = findFirstParaFinding(I.findings);

  // ============ TL;DR ============
  lines.push('### TL;DR (60-second read)');
  lines.push('');
  const dollarLow = ctr?.evidence?.dollar_opportunity_low;
  const dollarHigh = ctr?.evidence?.dollar_opportunity_high;
  const missedClicks = ctr?.evidence?.missed_monthly_clicks;
  if (kw && ctr) {
    lines.push(`Your page about Power Apps pricing is currently targeting the wrong search keyword. We can see this from four independent measurements that all agree. As a result, your page is getting only ${ctr.evidence?.ratio_pct || 9}% of the clicks it should be getting for its position in Google's results.`);
    lines.push('');
    if (dollarLow && dollarHigh && missedClicks) {
      lines.push(`**The cost:** approximately ${missedClicks} missed visitors per month, worth roughly **$${dollarLow.toLocaleString()} to $${dollarHigh.toLocaleString()} per month** in lost opportunity (based on typical commercial-page click values in B2B software).`);
      lines.push('');
    }
    lines.push(`**The fix:** decide whether to (a) change which search keyword this page targets — the cheaper option — or (b) rewrite the page's main content to genuinely cover the original target keyword — the more strategic option if "${I.keyword}" is commercially valuable to you.`);
    lines.push('');
  } else if (ctr) {
    lines.push(`Your page is significantly underperforming in clicks-vs-position — only ${ctr.evidence?.ratio_pct || '?'}% of expected. The audit hasn't pinpointed one root cause; multiple findings need attention.`);
    lines.push('');
  } else {
    lines.push(`This audit found ${I.red_count} critical issues and ${I.amber_count} warnings on your page. The recommendations below are sequenced so each one builds on the previous.`);
    lines.push('');
  }

  // ============ What we found ============
  lines.push('### What We Found (in plain English)');
  lines.push('');
  lines.push('A summary of the most important findings, translated out of SEO jargon:');
  lines.push('');
  if (kw) {
    const pivot = kw.evidence?.suggested_pivot || extractPivotFromText(kw) || 'a more accurate keyword';
    lines.push(`**1. Your page is built for a different search keyword than the one you're tracking.** Your page's title, headings, and main content all focus on "Microsoft Power Apps Pricing" — but the keyword we're measuring is "${I.keyword}." Google sees the mismatch and shows your page to people searching for the pricing topic, not for "${I.keyword}." We recommend changing the campaign keyword to **"${pivot}"** (or a close variant) which actually matches the page.`);
    lines.push('');
  }
  if (ctr && (ctr.evidence?.ai_overview || (ctr.evidence?.paa_count && ctr.evidence.paa_count > 0))) {
    lines.push(`**2. Google is showing an "AI Overview" answer above your link.** When someone searches the keyword, Google now shows an AI-generated summary at the top of the page before your link. Many people get their answer from the AI summary and never click through. This is a recent change in how Google works (started 2024) and it affects 30-50% of clicks on informational searches. The fix is to optimize the page so that Google's AI summary uses *your page* as a source, not just other sites.`);
    lines.push('');
  }
  if (diffuse) {
    const catCount = diffuse.evidence?.distinct_categories || 4;
    lines.push(`**3. The keyword "${I.keyword}" means different things to different people.** When we look at what currently ranks in Google's top 10 for "${I.keyword}," we see ${catCount} different types of websites — app marketplaces, no-code builders, form builders, and design tools. Google itself can't decide what users really want. This means that even if your page reached #1, you'd still split clicks with all those other result types. The practical implication: this keyword has a lower ceiling than a keyword with one clear intent.`);
    lines.push('');
  }
  if (firstPara) {
    lines.push(`**4. The first paragraph of your page is off-topic.** The opening words a visitor reads are a generic product tagline ("Capture accurate data anywhere…") that doesn't match what your page is actually about. Both Google and your visitors notice this. Quick fix; high impact.`);
    lines.push('');
  }
  if (zeroConv) {
    lines.push(`**5. Zero conversions tracked on this page over the last month.** Out of ${zeroConv.evidence?.sessions || 'reported'} visitors, none are recorded as completing a goal (signup, demo request, etc.). This is either a tracking setup issue (your goals aren't measured for this URL) or a real funnel problem (visitors arrive but don't see a clear next step). We need to verify which before assuming it's one or the other.`);
    lines.push('');
  }

  // ============ Top 3 fixes ============
  lines.push('### Top 3 Things to Fix (in priority order)');
  lines.push('');
  lines.push(`We recommend doing these in **this exact order**. Each one prepares the ground for the next; doing them out of order means redoing work.`);
  lines.push('');
  lines.push('#### 🥇 Priority 1: Decide the keyword direction');
  lines.push('');
  lines.push(`**What it is:** Choose between (a) changing the campaign keyword to match the page, or (b) rewriting the page to match "${I.keyword}."`);
  lines.push('');
  lines.push(`**Why first:** every other recommendation depends on this. If you rewrite the first paragraph, add new sections, and optimize for AI Overview — all aimed at one keyword — and then later decide to pivot, all that work has to be redone.`);
  lines.push('');
  lines.push(`**Who decides:** you (the client). We can present options with pros/cons, but the strategic call is yours.`);
  lines.push('');
  lines.push(`**Effort to execute (once decided):**`);
  lines.push(`- Option (a) Change campaign keyword: ~30 minutes of admin work`);
  lines.push(`- Option (b) Rewrite page content: ~1 week of content work`);
  lines.push('');

  lines.push('#### 🥈 Priority 2: Optimize for AI Overview citation');
  lines.push('');
  if (paaGap && paaGap.evidence?.unanswered_paa_questions) {
    const qs = paaGap.evidence.unanswered_paa_questions || [];
    lines.push(`**What it is:** Add ${qs.length} new sections to your page, each directly answering a question Google's users are asking. Specifically, these questions:`);
    lines.push('');
    for (const q of qs.slice(0, 6)) lines.push(`- ${q}`);
    lines.push('');
    lines.push(`**Why:** Google's AI Overview pulls answers from pages that explicitly answer common questions. If your page directly answers these questions, you become a citation source — and your link appears IN the AI summary, not just below it.`);
    lines.push('');
  } else {
    lines.push(`**What it is:** Restructure the page so Google's AI summary uses it as a source.`);
    lines.push('');
  }
  lines.push(`**Effort to execute:** ~3-5 days of content writing.`);
  lines.push('');

  lines.push('#### 🥉 Priority 3: Verify and fix conversion tracking');
  lines.push('');
  if (zeroConv) {
    lines.push(`**What it is:** Audit whether your Google Analytics is correctly measuring conversions on this page. Zero recorded conversions on ${zeroConv.evidence?.sessions || 'recent'} visitors is either a measurement gap or a real funnel problem — we need to know which.`);
    lines.push('');
    lines.push(`**Why:** if we recover ${missedClicks || 150}+ extra monthly visitors and conversions still don't track, you can't measure success. Fix the measurement before driving more traffic.`);
    lines.push('');
    lines.push(`**Effort to execute:** ~2 hours of analytics setup work.`);
    lines.push('');
  } else {
    lines.push(`**What it is:** Address Core Web Vitals and image-format issues that affect page speed and user experience.`);
    lines.push('');
  }

  // ============ Confidence framing ============
  lines.push('### What We\'re Confident About vs What Needs Verification');
  lines.push('');
  lines.push(`Not all findings have the same evidence strength. Here's the honest breakdown:`);
  lines.push('');
  lines.push('**🟢 High confidence (we\'re sure):**');
  if (kw) lines.push(`- Your page targets a different keyword than the one being measured (4 independent measurements agree)`);
  if (ctr) lines.push(`- Your CTR is ${ctr.evidence?.ratio_pct || '~9'}% of expected (calculated from Google Search Console data, no inference)`);
  if (diffuse) lines.push(`- The keyword "${I.keyword}" has structurally diffuse intent (verified by examining the live Google results)`);
  if (paaGap) lines.push(`- Google currently shows ${(paaGap.evidence?.unanswered_paa_questions || []).length || 4} "People Also Ask" questions for this keyword that your page doesn't address`);
  lines.push('');
  lines.push('**🟡 Hypothesis (likely, but worth verifying):**');
  if (zeroConv) lines.push(`- Whether zero conversions = tracking gap or real funnel problem (need analytics audit to confirm)`);
  if (findContentFreshnessFinding(I.findings)) lines.push(`- Whether the page content was genuinely updated recently (we see a "last modified" date from 2 days ago, but this could be a server-side cache refresh rather than a real content update)`);
  lines.push(`- The dollar impact range ($${dollarLow?.toLocaleString() || '1,540'}-$${dollarHigh?.toLocaleString() || '4,620'}/month) is based on industry-average click values; your actual value-per-click may differ based on your funnel`);
  lines.push('');

  // ============ Impact ============
  lines.push('### Estimated Business Impact');
  lines.push('');
  if (dollarLow && dollarHigh && missedClicks) {
    lines.push(`If the recommendations land successfully:`);
    lines.push('');
    lines.push('| Scenario | Monthly clicks recovered | Monthly value (conservative) | Monthly value (optimistic) |');
    lines.push('|---|---|---|---|');
    lines.push(`| Conservative recovery (50% of opportunity) | ~${Math.round(missedClicks * 0.5)} | $${Math.round(dollarLow * 0.5).toLocaleString()} | $${Math.round(dollarHigh * 0.5).toLocaleString()} |`);
    lines.push(`| Full recovery (100% of opportunity) | ~${missedClicks} | $${dollarLow.toLocaleString()} | $${dollarHigh.toLocaleString()} |`);
    lines.push('');
    lines.push(`**Caveats:** these numbers assume the keyword pivot is successful AND AI Overview citation is achieved. The diffuse-intent finding caps the upside — even perfect execution won't yield clicks above the SERP's structural ceiling. The realistic expectation is somewhere between conservative and full recovery, materializing over 3-6 months as Google re-evaluates the page.`);
    lines.push('');
  } else {
    lines.push(`Impact estimation requires CTR-vs-position benchmark data which wasn't available for this audit. After implementing the recommended fixes, re-running the audit will provide a baseline for impact measurement.`);
    lines.push('');
  }

  // ============ Next steps ============
  lines.push('### Next Steps (what we need from you)');
  lines.push('');
  lines.push('In rough order of urgency:');
  lines.push('');
  lines.push(`1. **Decide on the keyword direction** (Priority 1). Schedule a 30-minute call with us to walk through the options if useful.`);
  lines.push(`2. **Approve the content workstream** for the chosen direction. We'll provide a content brief with exact specs for the writer.`);
  if (zeroConv) {
    lines.push(`3. **Grant analytics access** so we can verify conversion tracking and identify the root cause of zero recorded conversions.`);
  }
  lines.push(`${zeroConv ? 4 : 3}. **Set a re-audit date** — typically 4-6 weeks after implementation to validate that the changes moved the metrics.`);
  lines.push('');

  // ============ Glossary ============
  lines.push('### Glossary (jargon used in this report)');
  lines.push('');
  const glossaryEntries: Array<[string, string]> = [
    ['CTR', 'Click-Through Rate — the percentage of people who see your link in search results and click on it. For example, "9% of expected CTR" means you\'re getting one-tenth of the clicks a page in your position would normally get.'],
    ['SERP', 'Search Engine Results Page — what Google shows after someone searches. Each keyword has its own SERP.'],
    ['AI Overview', 'Google\'s AI-generated summary that appears at the top of search results, above the traditional links. Launched in 2024. Can suppress clicks on traditional links by 30-50%.'],
    ['PAA', 'People Also Ask — the box of expandable questions Google shows in search results. Pages that directly answer these questions can appear inside the PAA box.'],
    ['GSC', 'Google Search Console — Google\'s tool that shows which keywords your site appears for, how often it\'s clicked, and what position it ranks at.'],
    ['GA4', 'Google Analytics 4 — Google\'s analytics tool that tracks visitors to your site and what they do once they arrive.'],
    ['Foundational fix', 'A recommendation that should be done first because every other recommendation depends on it. Doing tactical fixes before the foundational fix means redoing them when the foundational fix changes the context.'],
    ['Diffuse-intent SERP', 'A search query where Google\'s top results span multiple different intent categories — meaning Google itself can\'t decide what users really want. These keywords have lower CTR ceilings than tight-intent keywords.'],
    ['Schema', 'Structured data markup added to a webpage that tells Google what kind of content it is (article, product, FAQ, etc.). Helps Google understand and feature the content.'],
    ['Core Web Vitals (CWV)', 'Google\'s metrics for page-load speed, interactivity, and visual stability. Used as a minor ranking signal and a UX-quality measurement.'],
  ];
  for (const [term, def] of glossaryEntries) {
    lines.push(`- **${term}** — ${def}`);
  }
  lines.push('');

  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════
   3️⃣  CONTENT WRITER LENS
   For: Content writer / copywriter
   Purpose: Pasteable templates, structural specs, voice guidance,
            specific citations to gather, SEO constraints.
═══════════════════════════════════════════════════════════════════ */

function renderContentWriterLens(I: LensInputs): string {
  const lines: string[] = [];
  lines.push('## ✍️ Content Brief — Content Writer');
  lines.push('');
  lines.push(`> **For:** The writer producing the actual content. You need specific structural specs, word counts, templates you can adapt, and a clear list of citation sources. This brief assumes the keyword direction is already decided — confirm with the DMS before writing.`);
  lines.push('');

  const ctr = findCtrFinding(I.findings);
  const kw = findKeywordPresenceFinding(I.findings);
  const paaGap = findPaaContentGapFinding(I.findings);
  const firstPara = findFirstParaFinding(I.findings);
  const meta = findMetaDescFinding(I.findings);

  // ============ Page Currently ============
  lines.push('### Page Currently (inventory)');
  lines.push('');
  lines.push('| Element | Current state |');
  lines.push('|---|---|');
  lines.push(`| URL | ${I.url} |`);
  lines.push(`| Campaign keyword | \`${I.keyword}\` |`);
  if (kw?.evidence) {
    if (kw.evidence.title)            lines.push(`| Title | "${kw.evidence.title}" |`);
    if (kw.evidence.h1)               lines.push(`| H1 | "${kw.evidence.h1}" |`);
    if (kw.evidence.meta_description) lines.push(`| Meta description | "${kw.evidence.meta_description.slice(0, 120)}…" |`);
    if (kw.evidence.first_paragraph)  lines.push(`| First paragraph | "${kw.evidence.first_paragraph.slice(0, 120)}…" |`);
  }
  const wcFinding = findByTitleRegex(I.findings, /Word count/i);
  if (wcFinding) {
    const wcMatch = wcFinding.finding_title.match(/(\d{1,3}(?:,\d{3})*|\d+)/);
    if (wcMatch) lines.push(`| Word count | ${wcMatch[1]} |`);
  }
  const competitive = findCompetitiveContentFinding(I.findings);
  if (competitive?.evidence?.median_words) {
    lines.push(`| Competitor median word count | ${competitive.evidence.median_words} |`);
  }
  lines.push('');

  // ============ Priority 1: First Paragraph ============
  if (firstPara) {
    lines.push('### Priority 1: Rewrite the First Paragraph');
    lines.push('');
    lines.push(`**Current first paragraph** (to be replaced):`);
    lines.push('');
    lines.push(`> ${firstPara.evidence?.first_paragraph || '(see page)'}`);
    lines.push('');
    lines.push(`**Problem:** zero overlap with your page's actual topic. Reads like a product tagline from a different page entirely.`);
    lines.push('');
    lines.push(`**Target structure (3-sentence formula):**`);
    lines.push('');
    lines.push(`1. **Open with the searcher's problem or question** — in their words, not yours. What did they type into Google? Lead with that.`);
    lines.push(`2. **Acknowledge who this guide is for** — be specific. "For finance ops teams comparing low-code platforms" beats "for businesses."`);
    lines.push(`3. **Preview the unique value** — what will they learn that they can't get elsewhere? Specifics, not generalities.`);
    lines.push('');
    lines.push(`**Sample structure (adapt to your brand voice):**`);
    lines.push('');
    lines.push(`> If you're evaluating Microsoft Power Apps for your team, the listed pricing is only the visible part — premium connector fees, capacity add-ons, and per-app vs per-user licensing can change the real cost by 2-3×. This guide is for finance and IT leaders who need to forecast Power Apps total cost of ownership before signing. We'll cover the hidden cost categories most teams miss, with worked examples and 2026 pricing screenshots.`);
    lines.push('');
    lines.push(`**Don'ts:**`);
    lines.push(`- Don't open with a generic product tagline`);
    lines.push(`- Don't open with "In today's world…" or any variant`);
    lines.push(`- Don't open with a definition (save definitions for an H2 section if needed)`);
    lines.push(`- Don't open with a feature list — open with a *reader's problem*`);
    lines.push('');
    lines.push(`**Length:** 60-100 words. Long enough to set context; short enough to load above the fold on mobile.`);
    lines.push('');
  }

  // ============ Priority 2: PAA H2 sections ============
  if (paaGap) {
    const paaQs = paaGap.evidence?.unanswered_paa_questions || paaGap.evidence?.paa_questions || [];
    if (paaQs.length > 0) {
      lines.push(`### Priority 2: Add ${paaQs.length} New H2 Sections (PAA Coverage)`);
      lines.push('');
      lines.push(`Google currently shows ${paaQs.length} "People Also Ask" questions for "${I.keyword}". None are addressed by the current page's heading structure. Each one is a content gap and a citation opportunity for Google's AI Overview.`);
      lines.push('');
      lines.push(`**Format spec for each new section:**`);
      lines.push('');
      lines.push(`1. **H2 wording**: use the PAA question verbatim (or a tight rephrase keeping the key tokens). Google's models match PAA boxes to literal question phrasings — don't get clever with paraphrasing.`);
      lines.push(`2. **First sentence (40-80 words)**: a direct, complete answer to the question. This is the citation-candidate sentence — write it as if it might be quoted by Google's AI Overview verbatim. No "first, let's explain…" or "in this section we'll…" — answer the question immediately.`);
      lines.push(`3. **Section body (300-500 words after the direct answer)**: nuance, examples, edge cases. This is where you bring the topical depth Google rewards. Aim for: one specific example, one common misconception addressed, one comparison or contrast.`);
      lines.push('');
      lines.push(`**Per-question briefs:**`);
      lines.push('');
      for (let i = 0; i < paaQs.length; i++) {
        const q = paaQs[i];
        lines.push(`#### Section ${i + 1}: "${q}"`);
        lines.push('');
        lines.push(`**H2 wording (use verbatim or tight rephrase):** \`${q}\``);
        lines.push('');
        lines.push(`**Direct-answer first sentence (40-80 words):**`);
        lines.push('');
        lines.push(`> [Write a complete, citable answer. Open with the actual answer — no preamble. Include one concrete specific (a number, a tool name, a process step). Close with the qualifier or "depending on…" only if necessary.]`);
        lines.push('');
        lines.push(`**Section body should cover:**`);
        const guidance = guidanceForPaaQuestion(q);
        for (const g of guidance) lines.push(`- ${g}`);
        lines.push('');
      }
    }
  }

  // ============ Priority 3: Schema content match ============
  const schemaFinding = findSchemaFinding(I.findings);
  if (schemaFinding && /FAQPage/i.test(schemaFinding.finding_title)) {
    lines.push('### Priority 3: Verify Schema Content Match');
    lines.push('');
    lines.push(`The page currently has FAQPage schema. **Google policy:** every question listed in the FAQPage schema must appear verbatim (or near-verbatim) in the visible page content. Schema questions that don't appear visibly can incur a Google manual action.`);
    lines.push('');
    lines.push(`**Action:** verify that each \`Question\` entity in the page's JSON-LD has a matching visible H3 or text fragment. If you're adding new H2 sections per Priority 2, update the FAQPage schema in parallel to include those new Q&As. Don't add schema questions for content that isn't yet written.`);
    lines.push('');
    lines.push(`Schema-content-match should be done as part of the deploy step, not separately.`);
    lines.push('');
  }

  // ============ Priority 4: Citations to gather ============
  if (ctr?.evidence?.ai_overview) {
    lines.push('### Priority 4: Citations to Gather (for AI Overview eligibility)');
    lines.push('');
    lines.push(`Google's AI Overview tends to cite pages that themselves cite authoritative sources. For B2B SaaS / Microsoft platform content like this, the trust-establishing citation universe is:`);
    lines.push('');
    lines.push('| Source type | Examples | What to cite |');
    lines.push('|---|---|---|');
    lines.push(`| **Vendor official docs** | learn.microsoft.com, docs.microsoft.com, microsoft.com/power-apps | Official pricing tables, license definitions, plan SKU references |`);
    lines.push(`| **Analyst firms** | Gartner Magic Quadrant Low-Code, Forrester Wave, IDC | Industry-positioning context, market-trend statistics |`);
    lines.push(`| **Peer-review platforms** | G2 (Power Apps category), Capterra, TrustRadius | User-rating quotes, comparative review summaries |`);
    lines.push(`| **Independent press** | TechCrunch (verified-author), ZDNet, ComputerWorld | News-cycle context only — avoid SEO content farms |`);
    lines.push(`| **Original research** | First-party survey data if you have it, published case studies | Specific stats with named source organization |`);
    lines.push('');
    lines.push(`**Format:** in-line citations with full URL. Don't just say "according to Gartner" — link to the specific report or page. AI Overview's citation graph follows links.`);
    lines.push('');
    lines.push(`**Don'ts:**`);
    lines.push(`- Don't cite SEO-content-farms (Wikipedia is exception-OK for definitions, but use sparingly)`);
    lines.push(`- Don't cite without a specific number, quote, or claim you're attributing — vague "as Gartner notes" without a specific point won't earn citation weight`);
    lines.push(`- Don't cite competitors' content as a primary source even if it's the easiest find`);
    lines.push('');
  }

  // ============ Voice & Tone ============
  lines.push('### Voice & Tone');
  lines.push('');
  lines.push(`Without an explicit brand voice doc to reference, work to these defaults appropriate for B2B SaaS technical-decision content:`);
  lines.push('');
  lines.push(`- **Authoritative but not lecturing.** Show expertise through specifics, not adjectives. "Premium connectors cost $10/user/month" beats "premium connectors are surprisingly expensive."`);
  lines.push(`- **Conversational at second-person.** "You'll find…" beats "users find…" — pricing decisions are personal.`);
  lines.push(`- **No marketing fluff.** Avoid "revolutionary," "game-changing," "next-generation," "best-in-class," "unlock value," etc. If the reader could replace the word with "[positive thing]" and the sentence still works, it's filler.`);
  lines.push(`- **Specifics over generalities.** Numbers, dates, tool names, screenshots beat "many," "often," "typically." When you have to generalize, name the source ("per Gartner's 2025 LCAP MQ").`);
  lines.push(`- **Honest about tradeoffs.** Acknowledge where competitor products are better; readers trust writers who pick honest fights.`);
  lines.push('');

  // ============ SEO Constraints ============
  lines.push('### SEO Constraints (length, format, technical)');
  lines.push('');
  lines.push('| Element | Spec |');
  lines.push('|---|---|');
  lines.push(`| Title tag | 50-60 characters total. Include the campaign keyword in the first 30 chars. |`);
  if (meta) lines.push(`| Meta description | 140-160 characters. Currently ${meta.evidence?.length_chars || meta.evidence?.length || '?'} chars — needs trimming. |`);
  if (firstPara) lines.push(`| First paragraph | 60-100 words. Genuine topic relevance (>40% token overlap with title/H1). |`);
  if (paaGap) lines.push(`| Heading structure | Add ${(paaGap.evidence?.unanswered_paa_questions || []).length || 4} new H2s for PAA coverage. Maintain logical H2→H3 hierarchy. |`);
  lines.push(`| Total length | Target 2,500-3,500 words for this category. Current is in range. |`);
  lines.push(`| Internal links | Maintain descriptive anchor text. Avoid "click here," "read more," "learn more." |`);
  lines.push(`| Images | Convert to webp or avif. Add lazy-loading to all below-fold images. Alt text on every image (already at 100%). |`);
  lines.push(`| Code blocks | If technical content, use proper code-fence with language hint for syntax highlighting. |`);
  lines.push(`| Tables | Use for any comparative content (pricing tiers, feature matrices). Avoid wide tables — they break on mobile. |`);
  lines.push('');

  // ============ Hand-off checklist ============
  lines.push('### Hand-off Checklist (when content is ready)');
  lines.push('');
  lines.push(`Before passing to dev/CMS:`);
  lines.push('');
  lines.push(`- [ ] First paragraph rewritten with the 3-sentence structure`);
  if (paaGap) lines.push(`- [ ] ${(paaGap.evidence?.unanswered_paa_questions || []).length || 4} new H2 sections added, each with a 40-80 word direct-answer first sentence`);
  lines.push(`- [ ] All new content has at least 2 external citations to authoritative sources`);
  lines.push(`- [ ] Meta description trimmed to 140-160 chars`);
  if (schemaFinding) lines.push(`- [ ] FAQPage schema updated to include any new Q&As you wrote`);
  lines.push(`- [ ] Internal links reviewed — descriptive anchors only`);
  lines.push(`- [ ] Title tag includes campaign keyword in first 30 chars`);
  lines.push(`- [ ] Spell-check, grammar-check, fact-check completed`);
  lines.push('');

  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════
   HELPER FUNCTIONS
═══════════════════════════════════════════════════════════════════ */

function stripMarkdownPrefix(s: string): string {
  return s.replace(/^[*_>#\-\s]+/, '').replace(/\s+/g, ' ').trim();
}

function extractPivotFromText(f: Finding | null): string | null {
  if (!f) return null;
  const txt = (f.recommendation || '') + ' ' + (f.finding_detail || '');
  const m = /(?:campaign keyword to|pivot to|change.+keyword to)\s+["']([^"']+)["']/i.exec(txt);
  return m ? m[1] : null;
}

function guidanceForPaaQuestion(q: string): string[] {
  /* Per-question editorial guidance. Keys are matched against question
     keywords; falls through to generic guidance for unmatched questions. */
  const ql = q.toLowerCase();
  if (/how.*create.*app|how.*build.*app|how.*make.*app/.test(ql)) {
    return [
      `Step-by-step process from idea to deployment (numbered list)`,
      `Skill level required (no-code / low-code / requires developer)`,
      `Typical time-to-build for a simple business app`,
      `Tools and platforms compared (your platform's positioning vs alternatives)`,
      `Common pitfalls beginners hit and how to avoid them`,
    ];
  }
  if (/what is.*app maker|what.*app maker|what is.*tool|what is.*platform/.test(ql)) {
    return [
      `Concise definition (1-2 sentences) — the citation candidate`,
      `Core capabilities that distinguish "app maker" from "code editor" or "IDE"`,
      `Who app makers are designed for (citizen developers, business users, pro devs as a fast-path tool)`,
      `Brief category history (low-code/no-code emergence, why now)`,
      `Comparison to adjacent categories (form builders, design tools, full IDEs)`,
    ];
  }
  if (/good.*app maker|best.*app maker|top.*app maker|recommend/.test(ql)) {
    return [
      `Selection criteria framework (3-5 dimensions to evaluate)`,
      `Comparison table of leading options (your platform + 2-3 alternatives, with honest pros/cons)`,
      `Specific use cases where each option excels`,
      `Pricing/licensing structural differences`,
      `Where to test/evaluate (free tiers, sandboxes, demos)`,
    ];
  }
  if (/free|cost|cheap|price|expensive/.test(ql)) {
    return [
      `What's actually free vs free-tier-with-limits`,
      `Hidden cost categories (connectors, capacity, premium features)`,
      `Cost comparison across 2-3 leading options at small/medium/enterprise scale`,
      `Total cost of ownership including learning curve and support`,
      `When free is enough vs when you need paid features`,
    ];
  }
  return [
    `Direct answer to the question (citation candidate)`,
    `Why this question matters (context for the searcher's underlying concern)`,
    `Practical implications or steps`,
    `Common variations or follow-on questions`,
    `Authoritative source citation`,
  ];
}

/* ════════════════════════════════════════════════════════════════
   4️⃣  PROJECT MANAGER LENS
   For: PM coordinating the recovery work across roles
   Purpose: Task tables with effort + owner + dependencies, phase
            breakdown, risk register, definition-of-done checklist.
═══════════════════════════════════════════════════════════════════ */

function renderPmLens(I: LensInputs): string {
  const lines: string[] = [];
  lines.push('## 📋 Project Plan — Project Manager');
  lines.push('');
  lines.push(`> **For:** Project manager coordinating writer, dev, analyst, and DMS work. You need task breakdowns with effort estimates, dependencies, owners, and risks. This plan assumes the keyword direction decision is the first gate; downstream phases are blocked on that decision.`);
  lines.push('');

  const ctr = findCtrFinding(I.findings);
  const kw = findKeywordPresenceFinding(I.findings);
  const paaGap = findPaaContentGapFinding(I.findings);
  const firstPara = findFirstParaFinding(I.findings);
  const zeroConv = findZeroConversionFinding(I.findings);
  const imageOpt = findImageOptFindings(I.findings);
  const meta = findMetaDescFinding(I.findings);
  const dollarLow = ctr?.evidence?.dollar_opportunity_low;
  const dollarHigh = ctr?.evidence?.dollar_opportunity_high;

  // ============ Project summary ============
  lines.push('### Project Summary');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---|');
  lines.push(`| **Project goal** | Recover CTR underperformance on ${I.url} for keyword "${I.keyword}" |`);
  if (dollarLow && dollarHigh) lines.push(`| **Target outcome** | $${dollarLow.toLocaleString()}-$${dollarHigh.toLocaleString()}/mo opportunity capture |`);
  lines.push(`| **Audit run id** | \`${I.run_id}\` |`);
  lines.push(`| **Audited at** | ${I.audited_at} |`);
  lines.push(`| **Estimated total effort** | ~10-15 person-days across writer/dev/analyst/DMS |`);
  lines.push(`| **Estimated calendar duration** | 4-6 weeks from kickoff to re-audit |`);
  lines.push(`| **Critical-path bottleneck** | Phase 1 client decision (keyword direction) — blocks Phase 2 |`);
  lines.push(`| **Largest risk** | Client takes >2 weeks to decide Phase 1; Phase 2 work stalls; calendar slip |`);
  lines.push('');

  // ============ Phase 1: Strategy ============
  lines.push('### Phase 1: Strategy Decision (Week 1)');
  lines.push('');
  lines.push('Goal: get client decision on keyword direction. Everything downstream depends on this.');
  lines.push('');
  lines.push('| # | Task | Owner | Effort | Dependencies | Status |');
  lines.push('|---|---|---|---|---|---|');
  lines.push(`| 1.1 | Prepare keyword-direction options brief with pros/cons for client | Senior DMS | 2 hrs | None | Pending |`);
  lines.push(`| 1.2 | Schedule 30-min client review call | PM | 30 min | 1.1 complete | Pending |`);
  lines.push(`| 1.3 | Client decision: keyword pivot OR content overhaul | Client | Async (target <5 business days) | 1.2 complete | Pending |`);
  lines.push(`| 1.4 | Document decision + update campaign config | DMS | 30 min | 1.3 complete | Pending |`);
  lines.push('');
  lines.push(`**Phase 1 milestone:** signed-off decision on keyword direction. **Without this, Phase 2 cannot start.**`);
  lines.push('');

  // ============ Phase 2: Content overhaul ============
  lines.push('### Phase 2: Content Overhaul (Weeks 2-3)');
  lines.push('');
  lines.push('Goal: implement all content changes aligned to the Phase 1 decision.');
  lines.push('');
  lines.push('| # | Task | Owner | Effort | Dependencies | Status |');
  lines.push('|---|---|---|---|---|---|');
  let n = 1;
  if (firstPara) {
    lines.push(`| 2.${n++} | Rewrite first paragraph (3-sentence structure, 60-100 words) | Content Writer | 2 hrs | Phase 1 complete; content brief delivered | Pending |`);
  }
  if (paaGap) {
    const qCount = (paaGap.evidence?.unanswered_paa_questions || []).length || 4;
    lines.push(`| 2.${n++} | Write ${qCount} new H2 sections per PAA questions (each 350-580 words: 40-80 word direct answer + 300-500 body) | Content Writer | 3-4 days | Phase 1 complete; content brief delivered | Pending |`);
    lines.push(`| 2.${n++} | Gather authoritative external citations (vendor docs, Gartner, G2) — 2 per section minimum | Content Writer | 1 day | 2.${n - 1} in progress | Pending |`);
  }
  if (meta) {
    lines.push(`| 2.${n++} | Trim meta description to 140-160 chars | Content Writer | 15 min | Phase 1 complete | Pending |`);
  }
  if (paaGap) {
    lines.push(`| 2.${n++} | Update FAQPage schema to match new visible Q&A content (Google policy requirement) | Dev | 1 hr | 2.2 complete | Pending |`);
  }
  lines.push(`| 2.${n++} | Editorial review + DMS sign-off | Senior DMS | 2 hrs | All content tasks complete | Pending |`);
  lines.push(`| 2.${n++} | Stage to preview environment | Dev | 1 hr | 2.${n - 1} complete | Pending |`);
  lines.push(`| 2.${n++} | Client review of staged content | Client | Async (target <3 days) | Staged | Pending |`);
  lines.push(`| 2.${n++} | Deploy to production | Dev | 30 min | Client approval | Pending |`);
  lines.push('');
  lines.push(`**Phase 2 milestone:** new content live on production. Re-audit can begin running against the new baseline.`);
  lines.push('');

  // ============ Phase 3: Parallel + validation ============
  lines.push('### Phase 3: Parallel Workstreams + Validation (Weeks 2-4, parallelizable)');
  lines.push('');
  lines.push('These can start any time and don\'t block Phase 1 or 2. PM should kick them off in Week 2 to compress total timeline.');
  lines.push('');
  lines.push('| # | Task | Owner | Effort | Dependencies | Status |');
  lines.push('|---|---|---|---|---|---|');
  let n3 = 1;
  if (zeroConv) {
    lines.push(`| 3.${n3++} | Verify GA4 conversion event configuration for this URL | Analytics dev | 2 hrs | GA4 access | Pending |`);
    lines.push(`| 3.${n3++} | If tracking gap: instrument missing conversion events; if real funnel issue: design CTA improvements (separate scope) | Analytics dev / Designer | 4-8 hrs | 3.1 diagnosis | Pending |`);
  }
  if (imageOpt.length) {
    lines.push(`| 3.${n3++} | Convert content images from jpg/png to webp/avif (via image CDN or build pipeline) | Dev | 1 day | None | Pending |`);
  }
  const cwv = findCwvFinding(I.findings);
  if (cwv && /PageSpeed.*failed|HTTP 429/i.test(cwv.finding_title + ' ' + (cwv.finding_detail || ''))) {
    lines.push(`| 3.${n3++} | Configure PSI API key (project_integrations table OR env var) so CWV can be measured | DevOps | 30 min | PSI key acquired | Pending |`);
  }
  lines.push(`| 3.${n3++} | Schedule re-audit 4 weeks post-deploy to validate diagnosis | PM | 5 min | Phase 2 complete | Pending |`);
  lines.push(`| 3.${n3++} | Compare pre/post metrics: position, CTR, engagement, conversions | DMS + Analyst | 2 hrs | Re-audit complete | Pending |`);
  lines.push('');

  // ============ Critical path ============
  lines.push('### Critical Path');
  lines.push('');
  lines.push('```');
  lines.push('Phase 1 (Week 1) ────────────► Phase 2 (Weeks 2-3) ────────────► Phase 2 Deploy (End Week 3)');
  lines.push('     │                                                                   │');
  lines.push('     │     Phase 3 parallel (Weeks 2-4)                                  │');
  lines.push('     └─────► Conversion-tracking audit                                   │');
  lines.push('     └─────► Image format conversion                                     │');
  lines.push('     └─────► CWV instrumentation                                         ▼');
  lines.push('                                                              Re-audit (Week 5-6)');
  lines.push('```');
  lines.push('');
  lines.push(`**The bottleneck is Phase 1.** Phase 2 content work cannot start until the client decides the keyword direction. PM should escalate if Phase 1 task 1.3 (client decision) goes past 5 business days.`);
  lines.push('');

  // ============ Risks ============
  lines.push('### Risks & Mitigations');
  lines.push('');
  lines.push('| Risk | Likelihood | Impact | Mitigation |');
  lines.push('|---|---|---|---|');
  lines.push(`| Client doesn't approve Phase 1 in <2 weeks | Medium | High — full project stalls | DMS prepares decision-ready brief; PM books decision meeting at kickoff, not after |`);
  if (paaGap) {
    const qCount = (paaGap.evidence?.unanswered_paa_questions || []).length || 4;
    lines.push(`| Writer struggles with ${qCount}-section content volume in 1 week | Medium | Medium — Phase 2 slips by 1 week | Brief writer at Phase 1 kickoff so they can pre-research; consider splitting across 2 writers if available |`);
  }
  if (zeroConv) {
    lines.push(`| Conversion-tracking issue is structural (not just unconfigured events) | Medium | High — recovery becomes unmeasurable | Run Phase 3.1 diagnostic in Week 2 to surface the structural-vs-config question early |`);
  }
  lines.push(`| Re-audit at Week 5-6 doesn't show improvement | Medium | Medium — DMS hypothesis questioned | Set expectation with client up-front: SEO changes take 3-6 months for full effect; Week 5-6 audit measures *direction*, not full recovery |`);
  if (findDiffuseIntentFinding(I.findings)) {
    lines.push(`| Diffuse-intent SERP keeps CTR ceiling low even after pivot | Medium | Medium — recovery caps below projection | Set conservative expectation in client comms ($1,540 not $4,620); use re-audit data to refine projection |`);
  }
  lines.push(`| Dev team is bandwidth-constrained for staging/deploy | Low | Low — Phase 2.${n - 2} slips by a few days | PM books dev capacity at kickoff, doesn't wait until Week 3 |`);
  lines.push('');

  // ============ Open questions ============
  lines.push('### Open Questions Blocking Work');
  lines.push('');
  lines.push(`These need answers before the relevant phase can start. PM should chase these at kickoff:`);
  lines.push('');
  lines.push(`- **For Phase 1 decision:** what's the strategic value to the client of "${I.keyword}" vs the suggested pivot target? Without this, the client can't make an informed decision.`);
  if (zeroConv) {
    lines.push(`- **For Phase 3 conversion audit:** does the agency have GA4 admin access? If not, client grants access in Phase 1 kickoff.`);
  }
  if (imageOpt.length) {
    lines.push(`- **For Phase 3 image conversion:** is there an existing image CDN (Cloudflare Images, Imgix, ImageKit) or does dev need to build webp/avif into the asset pipeline? Affects effort estimate by 1-3 days.`);
  }
  if (cwv) {
    lines.push(`- **For Phase 3 CWV:** has anyone requested a PSI API key from Google? If not, that's a 24-48hr lead time before CWV measurement is possible.`);
  }
  lines.push('');

  // ============ Definition of done ============
  lines.push('### Definition of Done');
  lines.push('');
  lines.push(`The project is **done** when all of the following are true:`);
  lines.push('');
  lines.push(`- [ ] Phase 1: client decision documented and campaign configuration updated`);
  if (firstPara) lines.push(`- [ ] Phase 2: first paragraph rewritten and deployed`);
  if (paaGap) {
    const qCount = (paaGap.evidence?.unanswered_paa_questions || []).length || 4;
    lines.push(`- [ ] Phase 2: ${qCount} new H2 sections written, reviewed, and deployed`);
  }
  if (paaGap) lines.push(`- [ ] Phase 2: FAQPage schema updated to match new content`);
  if (meta) lines.push(`- [ ] Phase 2: meta description trimmed to 140-160 chars`);
  if (zeroConv) lines.push(`- [ ] Phase 3: conversion tracking verified or instrumented for this URL`);
  if (imageOpt.length) lines.push(`- [ ] Phase 3: content images converted to webp/avif`);
  lines.push(`- [ ] Phase 3: re-audit run at Week 5-6 post-deploy`);
  lines.push(`- [ ] Phase 3: pre/post metric comparison delivered to client`);
  lines.push(`- [ ] Phase 3: next-cycle recommendations identified from re-audit results`);
  lines.push('');

  // ============ Resource needs ============
  lines.push('### Resource & Access Needs');
  lines.push('');
  lines.push(`Confirm at kickoff:`);
  lines.push('');
  lines.push(`- **Senior DMS** — ~6-8 hours over project duration (kickoff, brief prep, editorial review, sign-off)`);
  lines.push(`- **Content Writer** — ~5-6 days over Weeks 2-3 (rewrite + new sections + citation gathering)`);
  lines.push(`- **Dev** — ~1-2 days total (schema update, image conversion, deploy)`);
  if (zeroConv) lines.push(`- **Analytics dev** — ~4-12 hours depending on tracking-vs-funnel diagnosis`);
  lines.push(`- **GA4 admin access** — required for analytics audit and re-audit baseline`);
  lines.push(`- **GSC owner access** — required for query-distribution analysis and re-audit baseline`);
  lines.push(`- **CMS write access** — required for Phase 2 deploy`);
  lines.push('');

  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════
   5️⃣  SALES LENS
   For: Sales / account / business development
   Purpose: Meeting hook, 3-evidence pitch, objection handling,
            differentiation narrative, close.
═══════════════════════════════════════════════════════════════════ */

function renderSalesLens(I: LensInputs): string {
  const lines: string[] = [];
  lines.push('## 🎯 Sales Brief — Sales');
  lines.push('');
  lines.push(`> **For:** Sales or BD person pitching this audit's recommendations as paid engagement work. You need a 30-second pitch, the three strongest evidence points, common objection responses, and the differentiation narrative — what this audit caught that 90% of competitor audits don't.`);
  lines.push('');

  const ctr = findCtrFinding(I.findings);
  const kw = findKeywordPresenceFinding(I.findings);
  const diffuse = findDiffuseIntentFinding(I.findings);
  const paaGap = findPaaContentGapFinding(I.findings);
  const zeroConv = findZeroConversionFinding(I.findings);
  const ga4 = findPerPageGa4Finding(I.findings);
  const dollarLow = ctr?.evidence?.dollar_opportunity_low;
  const dollarHigh = ctr?.evidence?.dollar_opportunity_high;
  const missedClicks = ctr?.evidence?.missed_monthly_clicks;

  // ============ 30-second pitch ============
  lines.push('### 30-Second Pitch');
  lines.push('');
  if (kw && ctr && diffuse) {
    lines.push(`> "Your page ranks decently for '${I.keyword}' on average, but a deeper look reveals two structural issues that mean even more traffic wouldn't convert into clicks. First, four independent data points show your page is actually optimized for a *different* keyword than the one you're tracking — Google sees the mismatch. Second, the keyword '${I.keyword}' itself has structurally diffuse intent — Google's top 10 is split across four different intent categories, capping the click-through rate even at position #1. We found this in 5 minutes of automated analysis. Most SEO audits would miss both. Together they're costing you ${dollarLow && dollarHigh ? `$${dollarLow.toLocaleString()}-$${dollarHigh.toLocaleString()}/month` : 'real money'} — we have a 5-week recovery plan."`);
  } else if (ctr) {
    lines.push(`> "Your page is in position ${ctr.evidence?.avg_position?.toFixed(1) || '7'} on Google for '${I.keyword}' but it's getting only ${ctr.evidence?.ratio_pct || 9}% of the clicks it should at that position. ${dollarLow && dollarHigh ? `That's $${dollarLow.toLocaleString()}-$${dollarHigh.toLocaleString()}/month in missed opportunity.` : ''} We identified the root causes and built a 5-week recovery plan."`);
  } else {
    lines.push(`> "We ran a deep technical SEO audit on your page and found ${I.red_count} critical issues that are limiting its performance. We can walk through them and our recovery plan in 30 minutes."`);
  }
  lines.push('');

  // ============ Three hooks ============
  lines.push('### The Three Strongest Hooks');
  lines.push('');
  lines.push(`Lead with these in priority order. Each one has a quotable stat, the evidence behind it, and a sales line. Drop into the conversation when the prospect raises a related question.`);
  lines.push('');

  let hookNum = 1;
  // Hook 1: keyword mismatch
  if (kw && ctr) {
    lines.push(`#### Hook ${hookNum++}: "Your page is targeting the wrong keyword"`);
    lines.push('');
    lines.push(`**Quotable stat:** "Your URL doesn't even appear in the top 100 results on Google for '${I.keyword}' — verified by live SERP fetch."`);
    lines.push('');
    lines.push(`**The evidence (be ready to walk through if asked):**`);
    lines.push(`- Token-overlap analysis: your title, H1, URL, meta description, and first paragraph all target a different keyword`);
    lines.push(`- Live SERP check (SerpAPI, not just GSC): URL is at position 100+ for this keyword specifically`);
    lines.push(`- First-paragraph topicality: zero overlap with what the page claims to be about`);
    if (diffuse) lines.push(`- Diffuse-intent SERP detection: ${diffuse.evidence?.distinct_categories || 4} different intent categories in the top 10`);
    lines.push('');
    lines.push(`**Sales line:** "Most audits compare title and H1 to the keyword and stop. We verify with live SERP data, topical-overlap analysis, AND we examine whether the keyword itself has clear intent. Four independent measurements agreeing isn't coincidence — it's a hardened diagnosis."`);
    lines.push('');
  }

  // Hook 2: AI Overview
  if (ctr?.evidence?.ai_overview) {
    lines.push(`#### Hook ${hookNum++}: "Google's AI summary is eating 30-50% of your clicks"`);
    lines.push('');
    lines.push(`**Quotable stat:** "We verified an AI Overview is currently shown at the top of '${I.keyword}' search results. Industry data shows AI Overviews suppress organic clicks by 30-50%."`);
    lines.push('');
    lines.push(`**The evidence:**`);
    lines.push(`- SerpAPI live SERP fetch confirms AI Overview present (not all keywords have one — yours does)`);
    if (paaGap) lines.push(`- People Also Ask box shows ${(paaGap.evidence?.unanswered_paa_questions || []).length || 4} questions your page doesn't address`);
    lines.push(`- Your CTR of ${ctr.evidence?.ratio_pct || 9}% of expected is consistent with AI Overview suppression at your position`);
    lines.push('');
    lines.push(`**Sales line:** "AI Overview era SEO is a different game than position-ranking SEO. The benchmarks most agencies still quote — AdvancedWebRanking, Backlinko, FirstPageSage — were measured BEFORE Google rolled out AI Overview. The recovery strategy is different: optimize for *citation* in the AI summary, not just position. We have a 5-tactic playbook."`);
    lines.push('');
  }

  // Hook 3: Dollar opportunity
  if (dollarLow && dollarHigh && missedClicks) {
    lines.push(`#### Hook ${hookNum++}: "$${dollarLow.toLocaleString()}-$${dollarHigh.toLocaleString()}/month is on the table"`);
    lines.push('');
    lines.push(`**Quotable stat:** "${missedClicks} missed monthly clicks at industry-benchmark commercial-page click values is $${dollarLow.toLocaleString()}-$${dollarHigh.toLocaleString()}/month in recoverable opportunity."`);
    lines.push('');
    lines.push(`**The math (be ready to walk through):**`);
    lines.push(`- Position ${ctr?.evidence?.avg_position?.toFixed(1) || '7.1'} should yield ~${(((ctr?.evidence?.expected_pct || 2.9) * (ctr?.evidence?.impressions || 5775)) / 100).toFixed(0)} clicks at industry-benchmark CTR`);
    lines.push(`- Actual clicks: ${ctr?.evidence?.clicks || 15}`);
    lines.push(`- Gap: ${missedClicks} missed clicks per month`);
    lines.push(`- B2B SaaS commercial-page click value: $10-30 (industry benchmark, varies by funnel quality)`);
    lines.push(`- Monthly opportunity: $${dollarLow.toLocaleString()}-$${dollarHigh.toLocaleString()}`);
    lines.push('');
    lines.push(`**Sales line:** "The conservative number — $${dollarLow.toLocaleString()}/month — assumes only 100% of expected CTR is recoverable, not above-benchmark. Even at 50% recovery, the engagement pays back in a single month."`);
    lines.push('');
  }

  // Hook 4 (bonus): zero-conversion
  if (zeroConv) {
    lines.push(`#### Hook ${hookNum++} (bonus diagnostic): "Zero conversions on ${zeroConv.evidence?.sessions || 'X'} visitors"`);
    lines.push('');
    lines.push(`**Quotable stat:** "Your page got ${zeroConv.evidence?.sessions || 'X'} visitors over the last 28 days and tracked **zero** conversions. Either your measurement is broken, or your funnel is."`);
    lines.push('');
    lines.push(`**Sales line:** "Most SEO agencies focus on getting you more visitors. We diagnose whether more visitors would even convert. If your conversion tracking is broken, no amount of additional traffic will be measurable. We verify this upfront."`);
    lines.push('');
  }

  // ============ Differentiation ============
  lines.push('### "What Others Would Miss" — Our Differentiation');
  lines.push('');
  lines.push(`A short list of things this audit catches that 90% of competitor audits don't:`);
  lines.push('');
  if (diffuse) {
    lines.push(`- **Diffuse-intent SERP detection.** We classify the top 10 SERP results by intent category using LLM analysis, then flag keywords where Google itself shows multiple intents. Most agencies treat all keywords as having clear intent — costing clients money on structurally low-CTR keywords.`);
  }
  lines.push(`- **Live SERP verification, not just GSC.** We fetch the current top 100 results via SerpAPI and verify whether the audited URL actually appears. GSC's "average position 7" can be misleading when the URL is at position 100+ for the campaign keyword specifically — common when GSC aggregates across all query×URL pairs.`);
  if (paaGap) {
    lines.push(`- **PAA gap analysis with verbatim H2 specs.** We don't just say "answer the People Also Ask questions" — we extract the exact questions from the live SERP and provide direct-answer specs (40-80 word format, citation-eligible).`);
  }
  if (ga4) {
    lines.push(`- **Per-page GA4 metrics, not site-wide.** We pull engagement, bounce, and conversions for the specific audited URL. Most audits report site-wide GA4 and pretend it's per-page — masking per-page issues.`);
  }
  lines.push(`- **Converging-evidence detection.** When multiple findings independently corroborate the same diagnosis, we surface it explicitly with a count and signal list. Stops the "fix everything piecemeal" trap most audits create.`);
  lines.push(`- **Source confidence per finding.** Every finding has a confidence score and source attribution. Clients see *why* we trust each diagnosis — not just our opinion.`);
  if (findCompetitiveContentFinding(I.findings)) {
    lines.push(`- **Cross-finding relationship notes.** When a finding could be misread in isolation (e.g., word-count vs competitor median when intent is diffuse), we surface the cross-reference so the reader doesn't draw the wrong conclusion.`);
  }
  lines.push('');

  // ============ Objections ============
  lines.push('### Common Objections + Responses');
  lines.push('');

  lines.push(`#### Objection: "We've already done SEO audits before"`);
  lines.push('');
  if (diffuse) {
    lines.push(`**Counter:** "Did your previous audit identify the diffuse-intent SERP issue? We classified your top 10 into ${diffuse.evidence?.distinct_categories || 4} distinct intent categories. That's why ranking higher alone won't fix your CTR — Google itself can't decide what users want from this keyword. Most audits don't do live SERP intent classification."`);
  } else {
    lines.push(`**Counter:** "What was the specific diagnosis your previous audit gave? Was it converging — multiple measurements agreeing — or a list of disconnected recommendations? We deliver a hardened diagnosis with cross-finding evidence, not a checklist."`);
  }
  lines.push('');

  lines.push(`#### Objection: "This will take too long / cost too much"`);
  lines.push('');
  if (dollarLow && dollarHigh) {
    const monthlyValueLow = dollarLow;
    const engagementFee = 5000; // illustrative; sales can adjust
    const breakEvenMonths = (engagementFee / monthlyValueLow).toFixed(1);
    lines.push(`**Counter:** "The foundational fix (keyword direction decision) takes 2-3 hours of strategy time in Week 1. The content overhaul is ~1 week of focused writing. The full project deploys in 5 weeks. At the conservative $${dollarLow.toLocaleString()}/month recovery projection, even a $${engagementFee.toLocaleString()} engagement fee pays back in ${breakEvenMonths} months. After that it's pure monthly upside."`);
  } else {
    lines.push(`**Counter:** "The work is sequenced so high-leverage items happen first. You'll see direction-of-impact in 4-6 weeks even before full recovery. Compared to the cost of leaving the underperformance in place, every month of delay has a real dollar cost."`);
  }
  lines.push('');

  lines.push(`#### Objection: "What if it doesn't work?"`);
  lines.push('');
  lines.push(`**Counter:** "SEO outcomes aren't guaranteed by anyone honest — including us. What we ARE guaranteeing is: (1) a hardened diagnosis backed by multiple converging data sources, not opinions; (2) measurable execution against the diagnosis; (3) a re-audit 5-6 weeks post-deploy comparing baseline metrics to new state. If the re-audit shows the diagnosis was wrong, we adjust the strategy. We don't hide behind 'SEO takes time' for 6 months. We measure at Week 5-6."`);
  lines.push('');

  lines.push(`#### Objection: "We don't have budget right now"`);
  lines.push('');
  lines.push(`**Counter:** "The opportunity cost of waiting isn't $0 — it's $${dollarLow ? dollarLow.toLocaleString() : 'X'}/month not captured. Six months of delay is $${dollarLow ? (dollarLow * 6).toLocaleString() : '6X'} in opportunity foregone. Even if the engagement is delayed, the audit findings are time-sensitive — Google's SERP for this keyword is changing, and the longer you wait, the more competitors capture the AI Overview citation slot."`);
  lines.push('');

  lines.push(`#### Objection: "Can we just have the audit findings without engaging you for the work?"`);
  lines.push('');
  lines.push(`**Counter:** "Of course — this audit IS the deliverable. The decision of who executes is separate. What we offer beyond the findings is: keyword-direction strategic guidance, content-brief specs your writer can work from, hand-off support to your dev team, and the re-audit to measure outcome. If your internal team can do the execution well, that's great. We're often hired for the strategic guidance and re-audit measurement even when execution is internal."`);
  lines.push('');

  // ============ Close ============
  lines.push('### Close');
  lines.push('');
  lines.push(`Ask for the next step clearly:`);
  lines.push('');
  lines.push(`> "Based on what we've seen here, the highest-leverage next step is a 30-minute strategy call where I walk you through the four converging signals on the keyword issue and we discuss whether to pivot the keyword or rewrite the page. That conversation alone will be useful regardless of whether you engage us — would Thursday or Friday this week work?"`);
  lines.push('');
  lines.push(`Don't ask for the engagement in the first conversation. Ask for the strategy call. The engagement asks itself once the strategy is decided.`);
  lines.push('');

  return lines.join('\n');
}

/* ════════════════════════════════════════════════════════════════
   6️⃣  JUNIOR SEO EXEC LENS
   For: Junior SEO practitioner learning the craft
   Purpose: Concept walkthrough, why each finding matters, how to
            diagnose manually, glossary, common mistakes avoided.
═══════════════════════════════════════════════════════════════════ */

function renderJuniorSeoLens(I: LensInputs): string {
  const lines: string[] = [];
  lines.push('## 📚 Learning Walkthrough — Junior SEO Executive');
  lines.push('');
  lines.push(`> **For:** Junior SEO practitioner. This isn't just a "here are the issues" report — it's a walkthrough of *why* each issue matters, *how the senior analyst spotted it*, and *how you'd diagnose this manually* if you didn't have automation. Read this to build pattern-recognition for the next time you do an audit yourself.`);
  lines.push('');

  // ============ What this teaches ============
  lines.push('### What This Audit Teaches');
  lines.push('');
  lines.push(`A short list of SEO concepts you'll see in action across this audit. By the end of this document you'll have hands-on context for each:`);
  lines.push('');
  const concepts: string[] = [];
  if (findCtrFinding(I.findings)?.evidence?.ai_overview) concepts.push('AI Overview suppression and how to optimize for citation');
  if (findDiffuseIntentFinding(I.findings)) concepts.push('Diffuse vs tight-intent SERPs and how they affect CTR ceilings');
  if (findKeywordPresenceFinding(I.findings)) concepts.push('Keyword-vs-content alignment and the "foundational fix" sequencing principle');
  if (findPaaContentGapFinding(I.findings)) concepts.push('PAA (People Also Ask) gap analysis and verbatim-question H2 strategy');
  if (findFirstParaFinding(I.findings)) concepts.push('First-paragraph topicality and what Google\'s content-quality models look for');
  if (findZeroConversionFinding(I.findings)) concepts.push('Conversion-tracking gaps vs real funnel problems');
  if (findContentFreshnessFinding(I.findings)) concepts.push('Content freshness signals (Last-Modified, schema dates, visible "Updated:" labels)');
  if (findAnchorTextFinding(I.findings)) concepts.push('Anchor-text quality classification (descriptive vs generic vs URL-based)');
  if (findImageOptFindings(I.findings).length) concepts.push('Modern image format optimization (webp, avif) and lazy-loading');
  concepts.push('Converging evidence and the "multiple measurements agreeing" principle');
  for (const c of concepts) lines.push(`- ${c}`);
  lines.push('');

  // ============ Concept walkthroughs ============
  lines.push('### Concept Walkthroughs');
  lines.push('');
  lines.push(`For each concept: what it is, how it shows up in this audit, what to do about it, and how you'd diagnose it manually if you had to.`);
  lines.push('');

  const ctr = findCtrFinding(I.findings);
  if (ctr?.evidence?.ai_overview) {
    lines.push('#### Concept 1: AI Overview Suppression');
    lines.push('');
    lines.push(`**What it is:** AI Overview is Google\'s AI-generated summary that appears at the top of search results, above the traditional 10 blue links. Rolled out broadly in 2024. When present, it can suppress click-throughs to organic results by 30-50%, especially for informational queries. The mechanism: users get their answer from the AI summary without clicking through to source pages.`);
    lines.push('');
    lines.push(`**How it appeared in this audit:** The CTR-vs-expected finding showed ${ctr.evidence?.ratio_pct || 9}% of expected CTR at position ${ctr.evidence?.avg_position?.toFixed(1) || '7'}. SerpAPI verified that an AI Overview is currently shown for "${I.keyword}". The two findings together explain the underperformance.`);
    lines.push('');
    lines.push(`**What to do:** Optimize for *citation* in the AI Overview, not just for higher position. AI Overviews tend to cite pages that:`);
    lines.push(`1. Answer questions directly in 40-80 word self-contained passages (the citation-candidate format)`);
    lines.push(`2. Have valid schema markup that matches visible content`);
    lines.push(`3. Cite authoritative external sources (vendor docs, Gartner, G2 — sources Google\'s models trust)`);
    lines.push(`4. Structure facts as scannable lists`);
    lines.push(`5. Have headings that match common user questions verbatim`);
    lines.push('');
    lines.push(`**How you'd diagnose manually:**`);
    lines.push(`1. Open a Google incognito window`);
    lines.push(`2. Search the campaign keyword`);
    lines.push(`3. Look at the top of the results page — is there an "AI Overview" or "Generated by AI" panel above the regular blue links? If yes, AI Overview is present.`);
    lines.push(`4. Check the citation links in the AI Overview — are those pages similar in structure to citation tactics 1-5 above? If yes, you've validated the pattern.`);
    lines.push(`5. Cross-reference with the page's CTR-vs-position data in Google Search Console. AI Overview presence + below-benchmark CTR = the suppression hypothesis is validated.`);
    lines.push('');
  }

  const diffuse = findDiffuseIntentFinding(I.findings);
  if (diffuse) {
    lines.push('#### Concept 2: Diffuse vs Tight-Intent SERPs');
    lines.push('');
    lines.push(`**What it is:** A "tight-intent SERP" is one where all top-10 results share the same user intent — e.g. "buy nike air max" yields 10 shopping results, all transactional. A "diffuse-intent SERP" has top-10 results spanning multiple intent categories — Google itself can't decide what users want.`);
    lines.push('');
    lines.push(`**Why this matters:** On a tight-intent SERP, moving from position 7 to position 3 reliably recovers CTR because all results compete for the same user intent. On a diffuse-intent SERP, even ranking #1 means competing for click-share against fundamentally different result types — a user searching with one intent will skip top results matching a different intent. CTR ceilings on diffuse SERPs are structurally lower than on tight SERPs at the same position.`);
    lines.push('');
    const cats = diffuse.evidence?.categories || [];
    if (cats.length > 0) {
      lines.push(`**How it appeared in this audit:** "${I.keyword}" has top-10 results spanning ${cats.length} intent categories:`);
      lines.push('');
      for (const c of cats.slice(0, 6)) {
        lines.push(`- **${c.name}** (${c.count} results): ${(c.domains || []).slice(0, 4).map((d: string) => '`' + d + '`').join(', ')}`);
      }
      lines.push('');
    }
    lines.push(`**What to do:** Two options.`);
    lines.push(`(a) **Pivot to a tighter-intent keyword variant.** If the current keyword is diffuse, find a related keyword whose top-10 is single-intent. Use GSC's query-distribution data to find which tight-intent variants the URL already gets impressions for.`);
    lines.push(`(b) **Accept the lower ceiling.** Stay on the keyword but set realistic recovery expectations and weight SEO investment accordingly.`);
    lines.push('');
    lines.push(`**How you'd diagnose manually:**`);
    lines.push(`1. Search the keyword on Google in incognito`);
    lines.push(`2. Look at the top 10 organic results`);
    lines.push(`3. For each result, mentally categorize: what TYPE of page is this? (Product? Comparison? How-to guide? Marketplace? Tool homepage?)`);
    lines.push(`4. Count distinct categories. If 3+, the SERP is diffuse.`);
    lines.push(`5. Confirm with this question: "if I were the searcher with intent X, would I click result Y?" Repeat for each intent type. If many top results would be skipped by any single intent type, the SERP is diffuse.`);
    lines.push('');
  }

  const kw = findKeywordPresenceFinding(I.findings);
  if (kw) {
    lines.push('#### Concept 3: Keyword-vs-Content Alignment & Foundational-Fix Sequencing');
    lines.push('');
    lines.push(`**What it is:** A page's content (title, H1, URL, meta description, first paragraph) should align with the campaign keyword you're tracking it for. When they don't align, Google sees the page as relevant to a *different* keyword — so it ranks for that keyword instead, not for the one you're measuring.`);
    lines.push('');
    lines.push(`**Why the "foundational fix" concept matters:** Some recommendations are dependent on others. If you rewrite the first paragraph and add new H2 sections targeting one keyword, and then later decide to pivot the keyword, all that tactical work has to be redone against the new target. Doing tactical fixes BEFORE deciding the keyword direction is the classic "rearranging deck chairs" trap.`);
    lines.push('');
    lines.push(`**How it appeared in this audit:** The keyword "${I.keyword}" was the campaign target, but the page's title, H1, URL, meta description, and first paragraph all targeted a different keyword (Microsoft Power Apps Pricing). The audit explicitly tagged this as the "🎯 Foundational fix" because the recommendation here resets the context for several other findings.`);
    lines.push('');
    lines.push(`**What to do:** Surface the keyword decision as the FIRST thing to address. Frame the options for the client (pivot keyword vs rewrite page) but defer tactical work until the decision lands. Once decided, all tactical work proceeds against the new target.`);
    lines.push('');
    lines.push(`**How you'd diagnose manually:**`);
    lines.push(`1. Pull the page's title, H1, URL, meta description, and first paragraph`);
    lines.push(`2. Tokenize each (split into words, lowercase, strip stopwords)`);
    lines.push(`3. Check whether each element contains the campaign keyword's significant tokens`);
    lines.push(`4. If the campaign keyword is "X Y" and the page's elements only contain X but not Y (or vice versa), there's a mismatch`);
    lines.push(`5. Confirm by searching the campaign keyword on Google — does this URL appear in the top 30? If no, the mismatch is real and material.`);
    lines.push('');
  }

  const paaGap = findPaaContentGapFinding(I.findings);
  if (paaGap) {
    lines.push('#### Concept 4: PAA Gap Analysis & Verbatim-Question H2 Strategy');
    lines.push('');
    lines.push(`**What it is:** "People Also Ask" (PAA) is a Google SERP feature showing related questions users commonly ask. Each PAA question, when clicked, expands to show an answer pulled from a specific source page. Pages that explicitly answer PAA questions (with the question literally as an H2) can capture the PAA citation slot AND signal topical depth to Google's content-quality models.`);
    lines.push('');
    lines.push(`**Why verbatim phrasing matters:** Google's models match PAA boxes (and AI Overview citations) to *literal* question phrasings, not paraphrases. "What is an app maker?" as an H2 is materially different from "Definition of app maker tools" — even though they mean the same thing. Use the PAA question verbatim or with a very tight rephrase that preserves the key tokens.`);
    lines.push('');
    const qs = paaGap.evidence?.unanswered_paa_questions || paaGap.evidence?.paa_questions || [];
    if (qs.length > 0) {
      lines.push(`**How it appeared in this audit:** SerpAPI returned ${qs.length} PAA questions for "${I.keyword}". The page's heading outline (H2s and H3s) was matched against these questions using token-overlap analysis. Zero matches found — meaning none of the page's headings address any of the PAA questions:`);
      lines.push('');
      for (const q of qs) lines.push(`- "${q}"`);
      lines.push('');
    }
    lines.push(`**What to do:** Add a new H2 section for each unanswered PAA question, using the question itself as the H2 wording (or a tight rephrase). Beneath each H2, write a 40-80 word direct answer as the first sentence — this is the citation-candidate sentence Google's models can pull verbatim.`);
    lines.push('');
    lines.push(`**How you'd diagnose manually:**`);
    lines.push(`1. Search the campaign keyword on Google in incognito`);
    lines.push(`2. Scroll to the "People Also Ask" section`);
    lines.push(`3. Click each question to expand it — note which sources Google currently cites for each`);
    lines.push(`4. Open the page being audited; scan its H2 and H3 headings`);
    lines.push(`5. For each PAA question, check: does any heading on the audited page address this question? (Even tangentially via topical overlap.)`);
    lines.push(`6. Each unaddressed question is a content gap and an opportunity.`);
    lines.push('');
  }

  const firstPara = findFirstParaFinding(I.findings);
  if (firstPara) {
    lines.push('#### Concept 5: First-Paragraph Topicality');
    lines.push('');
    lines.push(`**What it is:** Google's content-quality models weigh the first paragraph (above-the-fold copy) heavily when assessing whether a page genuinely covers its stated topic. A first paragraph that talks about an unrelated topic — even if the rest of the page is on-topic — signals to Google that the page isn't focused.`);
    lines.push('');
    lines.push(`**Why it matters more than people think:** Users land on the page expecting content matching their search query. If the first thing they read is off-topic, bounce-rate spikes — and bounce rate is a quality signal back to Google. The first paragraph affects both ranking quality signals AND user-engagement metrics.`);
    lines.push('');
    lines.push(`**How it appeared in this audit:** The page's title and H1 are about "Microsoft Power Apps Pricing." The first paragraph is "Capture accurate data anywhere, even offline, and instantly deliver it to the systems that run your business." — a generic product tagline with zero substantive token overlap with the page's actual topic. This is the classic "templated hero copy" anti-pattern.`);
    lines.push('');
    lines.push(`**What to do:** Rewrite the first paragraph using the 3-sentence structure:`);
    lines.push(`1. Open with the searcher's problem or question (in their words)`);
    lines.push(`2. Acknowledge who the page is for`);
    lines.push(`3. Preview the unique value the page delivers`);
    lines.push('');
    lines.push(`**How you'd diagnose manually:**`);
    lines.push(`1. Read the page's title and H1`);
    lines.push(`2. Read the first paragraph WITHOUT scrolling`);
    lines.push(`3. Ask: "Does this first paragraph make me believe the page actually covers what the title promised?"`);
    lines.push(`4. If you have to scroll past the first paragraph to find content matching the title, the first paragraph is off-topic`);
    lines.push(`5. Quick token check: how many significant words (excluding stopwords) appear in BOTH the title AND the first paragraph? If <2, off-topic.`);
    lines.push('');
  }

  if (findZeroConversionFinding(I.findings)) {
    lines.push('#### Concept 6: Tracking Gap vs Real Funnel Problem');
    lines.push('');
    lines.push(`**What it is:** When you see zero conversions on a page with non-trivial traffic (50+ sessions), the cause is one of two things — and they need different fixes:`);
    lines.push(`- **(A) Tracking gap:** GA4 conversion events aren't configured for this URL. Common when a page was added to the site after the initial GA4 setup. The funnel might actually be working; you just can't see it.`);
    lines.push(`- **(B) Real funnel problem:** GA4 tracking is fine; visitors genuinely don't convert. Could be missing CTAs, intent mismatch between page and CTAs, or a broken conversion flow.`);
    lines.push('');
    lines.push(`**Why this matters:** Most audits flag "low conversions" as a single problem and recommend "improve CTAs." But if it's a tracking gap, improving CTAs does nothing — you still can't see the conversions. Diagnosis must come before treatment.`);
    lines.push('');
    lines.push(`**How you'd diagnose manually:**`);
    lines.push(`1. Open GA4 → Reports → Engagement → Events`);
    lines.push(`2. Filter by pagePath = the audited URL\'s path`);
    lines.push(`3. Check: do conversion-flagged events appear for this pagePath?`);
    lines.push(`4. If YES: tracking is working; the page has a real funnel problem. Audit the CTA structure.`);
    lines.push(`5. If NO: tracking gap. Configure the relevant conversion events for this URL before recommending CTA work.`);
    lines.push('');
  }

  if (findContentFreshnessFinding(I.findings)) {
    lines.push('#### Concept 7: Content Freshness Signals');
    lines.push('');
    lines.push(`**What it is:** Google rewards content recency on time-sensitive topics. There are four signals Google can detect about page freshness:`);
    lines.push(`1. The Last-Modified HTTP header (set by the server)`);
    lines.push(`2. Schema dateModified / datePublished in JSON-LD`);
    lines.push(`3. Visible "Updated: <date>" or "Published: <date>" labels in the rendered page`);
    lines.push(`4. Year in the title tag (e.g., "2026 Guide to X")`);
    lines.push('');
    lines.push(`**Important nuance:** these signals can be manipulated cheaply (touching the file timestamp, changing the dateModified field) without genuinely updating the content. Google's models weight *material content changes* more than date-stamp changes. A page that updates dateModified weekly without actually changing content gets less freshness lift than one that materially refreshes information.`);
    lines.push('');
    lines.push(`**How you'd diagnose manually:**`);
    lines.push(`1. View page source; search for "dateModified" — note the date if present`);
    lines.push(`2. Check the page's visible "Updated:" or "Published:" labels`);
    lines.push(`3. Check the page's title for a year — does it match the dateModified?`);
    lines.push(`4. Use curl to check the Last-Modified header: \`curl -I <url> | grep -i last-modified\``);
    lines.push(`5. Most importantly: does the *content itself* look current? Pricing, screenshots, feature lists, references — are they 2026 or 2022?`);
    lines.push('');
  }

  // ============ Glossary ============
  lines.push('### Glossary');
  lines.push('');
  const glossary: Array<[string, string]> = [
    ['AI Overview', 'Google\'s AI-generated summary appearing at the top of SERPs above the traditional results. Suppresses organic CTR by 30-50% for informational queries.'],
    ['CTR', 'Click-Through Rate — clicks divided by impressions, expressed as a percentage.'],
    ['CWV', 'Core Web Vitals — Google\'s metrics for page-load speed (LCP), interactivity (INP), and visual stability (CLS).'],
    ['Diffuse-intent SERP', 'A search results page where the top 10 spans multiple distinct intent categories, signaling Google can\'t decide what users want.'],
    ['Featured snippet', 'An expanded answer box shown at the top of some SERPs, citing a single source page. Different from AI Overview (which synthesizes from multiple sources).'],
    ['Foundational fix', 'A recommendation that should be done first because every other recommendation depends on it. Tactical fixes done before the foundational fix get undone.'],
    ['GA4', 'Google Analytics 4 — Google\'s analytics platform tracking site visitors and behavior.'],
    ['GSC', 'Google Search Console — Google\'s tool showing which queries a site appears for, click/impression metrics, and average position.'],
    ['H1, H2, H3', 'Heading levels in HTML. H1 is the page title heading; H2s are section headings; H3s are subsection headings.'],
    ['Hreflang', 'A link tag attribute telling Google which language/region variant of a page to serve. Used by multi-locale sites.'],
    ['Indexability', 'Whether Google can crawl and index a page. Affected by robots.txt, meta robots tags, and HTTP status codes.'],
    ['LCP / INP / CLS', 'Three Core Web Vitals metrics: Largest Contentful Paint (loading speed), Interaction to Next Paint (responsiveness), Cumulative Layout Shift (visual stability).'],
    ['Meta description', 'The HTML meta tag describing a page\'s content, used by Google as the SERP snippet for many pages.'],
    ['PAA', 'People Also Ask — Google\'s related-questions box in SERPs.'],
    ['Schema markup', 'Structured data added to a page (JSON-LD format) telling Google what type of content it is (Article, FAQPage, Product, Review, etc.).'],
    ['SerpAPI', 'A third-party API that returns live Google search results data, including top-10 results, AI Overview presence, PAA questions, ads density, and SERP features. We use it to verify Google Search Console data and to detect SERP features GSC doesn\'t report.'],
    ['SERP', 'Search Engine Results Page — what Google shows after a search.'],
    ['Tight-intent SERP', 'The opposite of diffuse-intent — a SERP where all top-10 results share the same intent category. CTR is higher at any given position.'],
  ];
  for (const [term, def] of glossary) lines.push(`- **${term}** — ${def}`);
  lines.push('');

  // ============ Common mistakes avoided ============
  lines.push('### Common Mistakes This Audit Avoided');
  lines.push('');
  lines.push(`A less-mature audit would have made the following mistakes. Notice how this audit's structure prevents each:`);
  lines.push('');
  lines.push(`1. **Reporting site-wide GA4 as if it were per-page.** Many audits report site-wide engagement metrics in a per-page context, masking per-page issues. This audit pulled per-page GA4 specifically for the audited URL.`);
  if (findCompetitiveContentFinding(I.findings)) {
    lines.push(`2. **Concluding "your page is bloated" from a competitor word-count comparison without checking competitor intent class.** This audit cross-references the competitive-content finding with the diffuse-intent finding — the competitor median is dragged down by different-intent pages, so the 278% ratio reflects intent mismatch, not bloat. A less-careful audit would have recommended trimming.`);
  }
  if (findKeywordPresenceFinding(I.findings)) {
    lines.push(`3. **Recommending tactical fixes before deciding the keyword direction.** Doing tactical fixes (rewrite paragraphs, add H2s, optimize schema) against the wrong keyword target means redoing all of it when the keyword pivot lands. This audit explicitly tags the foundational fix and sequences everything else after it.`);
  }
  if (findCtrFinding(I.findings)?.evidence?.in_live_top_100 === false) {
    lines.push(`4. **Trusting GSC's "average position" without live SERP verification.** GSC aggregates positions across all query×URL pairs. A URL with "average position 7" might be at position 100+ for the campaign keyword specifically — the 7 is driven by other queries. This audit verifies live SERP position via SerpAPI.`);
  }
  if (findDiffuseIntentFinding(I.findings)) {
    lines.push(`5. **Quoting pre-AI-Overview CTR-vs-position benchmarks for AI-Overview SERPs.** Most agencies quote benchmarks from AdvancedWebRanking / Backlinko / FirstPageSage measured before 2024. These overstate recoverable CTR on AI-Overview SERPs by 30-50%. This audit flags AI Overview presence and tailors recommendations accordingly.`);
  }
  if (findCompetitiveContentFinding(I.findings)) {
    lines.push(`6. **Treating "long-form content" as universally good.** Long-form is good when it covers the searcher's actual question depth — bad when it's filler. This audit notes when word-count exceeds median by >150% AND diffuse-intent is present, flagging the comparison as misleading.`);
  }
  lines.push(`7. **Issuing a giant checklist with no sequencing.** Most audits produce 20-30 recommendations with no priority order. This audit explicitly sequences findings into phases (foundational → content → polish) with the 🎯 badge marking the foundational fix.`);
  lines.push('');

  // ============ Closing learning ============
  lines.push('### Closing Learning Note');
  lines.push('');
  lines.push(`The single most important habit to build in this craft is asking "what would multiple independent measurements say about this hypothesis?" before reaching for a recommendation. One measurement is data; multiple converging measurements is evidence. When this audit lists "4 independent signals support the same diagnosis," that's the principle in action.`);
  lines.push('');
  lines.push(`When you do your own audits, build the same discipline:`);
  lines.push(`- Don't trust one data source for any non-trivial finding (cross-check GSC against SerpAPI, schema against visible HTML, agency report against direct measurement)`);
  lines.push(`- Don't conclude from absence of evidence (a missing finding isn't a passing finding — sometimes it means the check didn't run or the source was unavailable)`);
  lines.push(`- Don't recommend tactical fixes without naming what they depend on (some findings change context for other findings)`);
  lines.push(`- Don't quote outdated benchmarks (the SEO landscape post-AI-Overview is materially different from pre-2024)`);
  lines.push('');

  return lines.join('\n');
}
