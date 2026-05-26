/* ════════════════════════════════════════════════════════════════
   api/lib/seo-technical-audit.ts
   Phase 15 — Technical Audit pillar engine

   Runs a comprehensive technical audit on a single target URL for a
   campaign. Produces structured findings, a markdown report linked to
   the campaign panel, and opportunities for any critical issues.

   Six check categories:
     1. Indexability     — GSC index status, robots.txt, meta robots, X-Robots-Tag header
     2. On-page          — title, meta description, H1, word count, alt text, canonical
     3. Core Web Vitals  — LCP, INP, CLS from PageSpeed Insights API
     4. Engagement       — bounce rate, time on page (site-wide GA4 for now)
     5. Mobile           — mobile vs desktop PSI scores
     6. Schema markup    — JSON-LD presence + type detection

   Each check produces 0..N findings. Findings have severity (green/amber/red/info),
   a title, detail, recommendation, and evidence JSON. Red findings auto-create
   opportunities in the project's opportunity inbox.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { writeReportToPanel, recordOpportunity } from "./seo-campaign-engine.js";
import { persistArtifacts } from "./artifacts.js";
import { fetchSerpFeatures, summarizeSerpFeatures } from "./serpapi.js";
import { ga4PullPageMetrics } from "./pm-ga4.js";
/* Phase 16.9 — retired the 6-lens module in favor of a single deep
   technical SEO report. Same Finding evidence flows into a more
   comprehensive cross-referenced document; role-tailored views are
   derived at consumption time by readers (human or LLM) instead of
   at render time. seo-technical-audit-lenses.ts remains in the repo
   for one phase as a safety hedge but is no longer imported. */
import { renderDeepAuditReport, type DeepReportInputs } from "./seo-technical-audit-deep-report.js";
/* Phase 16.11.2 rollback — HTML renderer import removed from the audit's
   load chain. The renderer file remains in api/lib/ but is unreferenced
   at runtime so it cannot affect cold-start. Re-introduce after the
   underlying "audits stop fast" symptom is root-caused with runtime
   evidence. */
// import { renderDeepAuditReportHtml } from "./seo-technical-audit-html.js";

/* Phase 16.4 — ANTHROPIC_API_KEY needed for diffuse-intent classifier
   in checkDiffuseIntentSerp. Single LLM call per audit run when SerpAPI
   has top-10 data; ~$0.0003 per call at Haiku pricing. */
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL   = "claude-haiku-4-5-20251001";

interface TargetResolution {
  url:    string;
  source: 'manual' | 'gsc_top_page' | 'strategy_plan';
  note?:  string;
}

export interface Finding {
  audit_kind: 'indexability' | 'on_page_fundamentals' | 'core_web_vitals' | 'engagement_signals'
            | 'mobile_friendliness' | 'page_load' | 'schema_markup' | 'meta_tags'
            | 'internal_links' | 'canonical' | 'robots' | 'redirect';
  severity:       'green' | 'amber' | 'red' | 'info';
  finding_title:  string;
  finding_detail?: string;
  recommendation?: string;
  evidence?:      any;
  data_source?:   'gsc' | 'ga4' | 'psi' | 'html_fetch' | 'schema_parser';
  enrichment_sources?: Array<'serpapi'>;
  is_foundational?: boolean;
  signals?: Array<'keyword_mismatch' | 'url_not_in_top_10' | 'serp_topic_mismatch' | 'first_paragraph_off_topic' | 'keyword_pivot_cluster'>;
}

/* ═══════════════════════════════════════════════════════════════════
   SOURCE-CONFIDENCE MAPPING — added 2026-05-24 as part of the Senior DMS
   pillar source-tracing template (P0 backbone rule).

   Each finding's `data_source` is mapped to:
   • confidence — 0..100, aligned with intelligenceFabric.ts scale where
     gsc_live=95, ga_live=95, audit_run=88, crawl_jina=85, claude_inference=65
   • label      — human-readable source for the markdown report
   • sourceType — the corresponding intelligenceFabric SourceType
     (used by downstream consumers that want to flow through the fabric)

   PSI is mapped to audit_run (88) — it's a real external audit from
   Google's PageSpeed API, slightly less direct than GSC/GA4 but more
   structured than a generic crawl.
   html_fetch and schema_parser map to crawl_jina (85, normalised to 87
   here because raw HTTP fetch is well-defined for the metrics we extract).
═══════════════════════════════════════════════════════════════════ */

const DATA_SOURCE_META: Record<
  NonNullable<Finding['data_source']>,
  { confidence: number; label: string; sourceType: string }
> = {
  gsc:           { confidence: 95, label: 'Google Search Console (live)', sourceType: 'gsc_live' },
  ga4:           { confidence: 95, label: 'Google Analytics 4 (live)',    sourceType: 'ga_live' },
  psi:           { confidence: 92, label: 'PageSpeed Insights API',       sourceType: 'audit_run' },
  html_fetch:    { confidence: 87, label: 'Live HTML fetch',              sourceType: 'crawl_jina' },
  schema_parser: { confidence: 87, label: 'Schema parser (HTML-derived)', sourceType: 'crawl_jina' },
};

/** Confidence and source label for a single finding. Returns null for
 *  findings without a declared data_source — those should be flagged as
 *  needing source attribution (synthesis-as-fact risk). */
function findingSourceMeta(f: Finding): { confidence: number; label: string; sourceType: string } | null {
  if (!f.data_source) return null;
  return DATA_SOURCE_META[f.data_source];
}

/** Weighted-mean confidence across all findings that declare a source.
 *  Findings without `data_source` are EXCLUDED from the mean and surfaced
 *  separately as "unattributed" — they're a synthesis risk that should
 *  not silently inflate confidence either way. */
function weightedFindingConfidence(findings: Finding[]): {
  mean: number;          // 0..100; 0 if no sourced findings
  sourced_count: number;
  unattributed_count: number;
} {
  const sourced = findings
    .map(f => findingSourceMeta(f))
    .filter((m): m is { confidence: number; label: string; sourceType: string } => m !== null);
  const unattributed = findings.length - sourced.length;
  if (sourced.length === 0) return { mean: 0, sourced_count: 0, unattributed_count: unattributed };
  const total = sourced.reduce((acc, m) => acc + m.confidence, 0);
  return { mean: Math.round(total / sourced.length), sourced_count: sourced.length, unattributed_count: unattributed };
}

/* ════════════════════════════════════════════════════════════════
   Phase 16.3 UTILITIES (2026-05-24 PM) — six small fixes that
   compound to senior-practitioner-grade output:

   • decodeHtmlEntities — fixes "&amp;" rendering in displayed titles
   • computeBusinessImpact — translates CTR-gap ratio to missed
     clicks/month + dollar range
   • pickFoundationalCritical — marks 🎯 on the Critical finding
     whose recommendation, if addressed, would reframe others
   • detectConvergingEvidence — surfaces explicit cross-finding
     reinforcement when 2+ Critical findings share a root cause
   ════════════════════════════════════════════════════════════ */

/** Decode common HTML entities so titles/H1/meta display cleanly
 *  (e.g. "&amp;" → "&"). Targets the entities Google actually
 *  serves in <title> tags. Idempotent — calling twice is safe. */
function decodeHtmlEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&amp;/g,   '&')
    .replace(/&lt;/g,    '<')
    .replace(/&gt;/g,    '>')
    .replace(/&quot;/g,  '"')
    .replace(/&#x27;/g,  "'")
    .replace(/&#39;/g,   "'")
    .replace(/&#x2F;/g,  '/')
    .replace(/&nbsp;/g,  ' ');
}

/** Convert a CTR underperformance ratio into operationally-useful business
 *  impact: missed monthly clicks + dollar range. Click-value bounds
 *  reflect industry benchmarks for SaaS/B2B pages where the audit is
 *  most-used; treat as directional, not precise.
 *
 *  Returns the inline addendum (markdown) or empty string if inputs
 *  are insufficient or the gap is too small to warrant translation. */
function computeBusinessImpact(opts: {
  impressions: number;
  actual_ctr_pct: number;
  expected_ctr_pct: number;
  actual_clicks: number;
}): { markdown: string; structured: { missed_clicks: number; expected_clicks: number; dollar_low: number; dollar_high: number } | null } {
  const { impressions, actual_ctr_pct, expected_ctr_pct, actual_clicks } = opts;
  if (!impressions || impressions < 100) return { markdown: '', structured: null };
  if (!expected_ctr_pct || expected_ctr_pct <= actual_ctr_pct) return { markdown: '', structured: null };
  const expectedClicks = Math.round((impressions * expected_ctr_pct) / 100);
  const missedClicks   = Math.max(0, expectedClicks - actual_clicks);
  if (missedClicks < 5) return { markdown: '', structured: null };
  /* Click-value range: $10-30 is the conservative midrange for B2B SaaS
     pricing-page / commercial-intent traffic. Lower bound covers free-trial
     funnels; upper bound covers enterprise lead-gen. Treat directionally. */
  const lowDollar  = missedClicks * 10;
  const highDollar = missedClicks * 30;
  return {
    markdown: `\n\n**Business impact:** at expected CTR of ${expected_ctr_pct.toFixed(1)}%, ${impressions.toLocaleString()} monthly impressions would yield ~${expectedClicks.toLocaleString()} clicks vs actual ${actual_clicks.toLocaleString()} → **~${missedClicks.toLocaleString()} missed monthly clicks**. At B2B SaaS commercial-page click value of \\$10-30 (industry benchmark, treat directionally), that's **\\$${lowDollar.toLocaleString()}-\\$${highDollar.toLocaleString()} monthly opportunity** at full recovery.`,
    structured: { missed_clicks: missedClicks, expected_clicks: expectedClicks, dollar_low: lowDollar, dollar_high: highDollar },
  };
}

/** Pick the single foundational Critical finding among a list. Rules
 *  (in priority order):
 *
 *  1. If indexability is blocked → that's foundational (nothing else
 *     matters until the page is indexable)
 *  2. If keyword-presence is Critical AND recommends a campaign-keyword
 *     pivot → that's foundational (pivot would reframe other findings)
 *  3. Else the first-paragraph-topicality finding if Critical (lowest-
 *     effort high-impact baseline)
 *  4. Else fall through to no marking (caller doesn't render badge)
 *
 *  Mutates the chosen finding in-place by setting is_foundational = true. */
function pickFoundationalCritical(findings: Finding[]): void {
  const reds = findings.filter(f => f.severity === 'red');
  if (reds.length === 0) return;
  /* Rule 0: extreme mobile LCP (>8s) — page doesn't load for real users.
     This outranks every other concern including keyword and indexability.
     No content change, no H1 rewrite, no schema work will help a page
     that most mobile visitors abandon before it finishes loading.
     8s threshold chosen deliberately: above this the page fails CrUX
     "poor" at the 75th percentile AND Google's own field data would
     show it consistently failing Core Web Vitals assessment. */
  const extremeLcp = reds.find(f => {
    if (f.audit_kind !== 'core_web_vitals') return false;
    if (!/MOBILE LCP/i.test(f.finding_title)) return false;
    const mSec = f.finding_title.match(/(\d+\.\d+)s/);
    return mSec ? parseFloat(mSec[1]) > 8 : false;
  });
  if (extremeLcp) {
    extremeLcp.is_foundational = true;
    const lcpSecMatch = extremeLcp.finding_title.match(/(\d+\.\d+)s/);
    const lcpSecStr = lcpSecMatch ? lcpSecMatch[1] : '?';
    /* Build diagnosis from actual evidence in the finding */
    const lcpEvTtfb: number | null = (extremeLcp.evidence as any)?.ttfb_ms ?? null;
    const lcpEvTbt:  number | null = (extremeLcp.evidence as any)?.tbt_ms  ?? null;
    const lcpEvFcp:  number | null = (extremeLcp.evidence as any)?.fcp_ms  ?? null;
    const lcpEvEl:   string | null = (extremeLcp.evidence as any)?.lcp_element ?? null;

    /* Infer root cause from the data triangle: TTFB vs FCP gap vs TBT */
    let rootCauseBlock: string;
    if (lcpEvTtfb !== null && lcpEvTtfb > 600) {
      /* Slow server — fix TTFB first */
      rootCauseBlock = `**Root cause: server response time.** TTFB is ${Math.round(lcpEvTtfb)}ms — the server is slow before any rendering begins. No front-end optimisation will help until server response is below 600ms.\n\n**Fix sequence:**\n1. Check hosting configuration and CDN setup\n2. Enable full-page caching if possible\n3. Reduce server-side rendering time\n4. After TTFB is <600ms, re-run PSI to isolate the next bottleneck`;
    } else if (lcpEvTbt !== null && lcpEvTbt > 300) {
      /* Fast server, high TBT → render-blocking JS is the cause */
      const ttfbNote = lcpEvTtfb !== null ? `TTFB is ${Math.round(lcpEvTtfb)}ms (server is fast — not the problem). ` : '';
      const fcpNote  = lcpEvFcp  !== null ? `FCP is ${(lcpEvFcp / 1000).toFixed(2)}s, meaning no content paints until ${(lcpEvFcp / 1000).toFixed(2)}s — this is a JavaScript blocking problem, not a network problem. ` : '';
      rootCauseBlock = `**Root cause: render-blocking JavaScript.** ${ttfbNote}${fcpNote}TBT is ${Math.round(lcpEvTbt)}ms — the main thread is blocked by JavaScript for ${Math.round(lcpEvTbt)}ms during page load, delaying all rendering.\n\n**Fix sequence:**\n1. Open Chrome DevTools → Performance tab → record a page load → look for Long Tasks (red bars) in the main thread\n2. Identify which scripts are blocking render (typically large bundles, third-party scripts, analytics)\n3. Defer non-critical scripts with \`defer\` or \`async\`; move them below the fold\n4. Split large JS bundles; lazy-load non-critical components\n5. ${lcpEvEl ? `Optimise the LCP element ("${lcpEvEl}"): compress to <200KB, add fetchpriority="high", ensure not lazy-loaded` : 'Identify the LCP element in PSI and ensure it loads eagerly with fetchpriority="high"'}`;
    } else {
      /* Unknown cause — generic diagnostic */
      rootCauseBlock = `**Diagnostic path (in order):**\n1. Open PageSpeed Insights → identify the LCP element${lcpEvEl ? ` (reported as: "${lcpEvEl}")` : ' (run PSI to identify it — no element data available)'}\n2. Check TTFB${lcpEvTtfb !== null ? ` (currently ${Math.round(lcpEvTtfb)}ms)` : ''} — if >600ms, fix server/CDN first\n3. Check TBT${lcpEvTbt !== null ? ` (currently ${Math.round(lcpEvTbt)}ms)` : ''} — if >300ms, reduce render-blocking JS\n4. Compress LCP element image to <200KB; add fetchpriority="high"; remove lazy-loading from above-fold\n5. Inline render-critical CSS; defer non-critical scripts`;
    }
    extremeLcp.recommendation = `**STOP — fix mobile LCP before any other work begins.**\n\nAt ${lcpSecStr}s on mobile, most visitors abandon before the page loads. Content rewrites, H1 changes, and schema additions have zero ranking effect until this is resolved.\n\n${rootCauseBlock}`;
    return;
  }
  /* Rule 1: indexability blocker */
  const indexBlocked = reds.find(f =>
    f.audit_kind === 'indexability' &&
    /(noindex|blocked|robots\.txt|x-robots-tag)/i.test(f.finding_title));
  if (indexBlocked) { indexBlocked.is_foundational = true; return; }
  /* Rule 2: keyword-presence Critical with pivot recommendation.
     Phase 16.10 — broadened to catch the bothPartial branch's "alignment gap"
     title phrasing AND any keyword-finding whose signals include keyword_mismatch
     (the most reliable structural signal). Previous regex worked on
     finding_title containing "keyword" + recommendation containing
     "change the campaign keyword" — but if either upstream string changes
     phrasing the rule silently misses. Now: title-OR-signal match plus
     recommendation-OR-detail keyword-pivot intent. */
  const kwPivot = reds.find(f => {
    if (f.audit_kind !== 'on_page_fundamentals') return false;
    const titleHit = /keyword/i.test(f.finding_title);
    const signalHit = Array.isArray(f.signals) && f.signals.includes('keyword_mismatch');
    if (!titleHit && !signalHit) return false;
    const recAndDetail = `${f.recommendation || ''} ${f.finding_detail || ''}`;
    return /change the campaign keyword|rewrite the (page )?title|rewrite the title and h1|content overhaul|campaign keyword is wrong|page is built for|content-strategy mismatch/i.test(recAndDetail);
  });
  if (kwPivot) { kwPivot.is_foundational = true; return; }
  /* Rule 3: first-paragraph topicality */
  const firstParaCrit = reds.find(f => /first paragraph/i.test(f.finding_title));
  if (firstParaCrit) { firstParaCrit.is_foundational = true; return; }
}

/** Phase 16.10 — propagate a shared cluster signal across the four findings
 *  that corroborate a keyword-pivot diagnosis. The convergence detector
 *  (detectConvergingEvidence) already identifies these four signals; this
 *  function tags each carrying finding with an additional cluster signal
 *  (`keyword_pivot_cluster`) so the deep-doc renderer's signal-based
 *  cross-reference engine wires them together. Without this, each finding
 *  has a unique single signal and the cross-ref graph stays leaf-only —
 *  §3.1 ↔ §3.2 ↔ §3.3 ↔ §3.9 never link, even though §4.2 correctly
 *  identifies them as corroborating evidence.
 *
 *  Only runs when pickFoundationalCritical has flagged a foundational
 *  finding AND the convergence detector would fire (2+ candidates with
 *  signals in the keyword-pivot family). */
function propagateKeywordPivotClusterSignal(findings: Finding[]): void {
  const PIVOT_FAMILY = ['keyword_mismatch', 'url_not_in_top_10', 'serp_topic_mismatch', 'first_paragraph_off_topic'] as const;
  const candidates = findings.filter(f =>
    (f.severity === 'red' || f.severity === 'amber') &&
    Array.isArray(f.signals) &&
    f.signals.some(s => (PIVOT_FAMILY as readonly string[]).includes(s)));
  if (candidates.length < 2) return;
  for (const f of candidates) {
    if (!Array.isArray(f.signals)) f.signals = [];
    if (!f.signals.includes('keyword_pivot_cluster')) {
      f.signals.push('keyword_pivot_cluster');
    }
  }
  /* Also tag the foundational finding itself (which may not have any of
     the pivot-family signals — keyword-presence finding's only signal is
     keyword_mismatch but the bothPartial branch may have been built before
     signals were added). Find by is_foundational + audit_kind. */
  const foundationalKw = findings.find(f =>
    f.is_foundational === true &&
    f.audit_kind === 'on_page_fundamentals' &&
    /keyword/i.test(f.finding_title));
  if (foundationalKw) {
    if (!Array.isArray(foundationalKw.signals)) foundationalKw.signals = [];
    if (!foundationalKw.signals.includes('keyword_pivot_cluster')) {
      foundationalKw.signals.push('keyword_pivot_cluster');
    }
  }
}

/** Detect when 2+ Critical findings share signals that converge on the
 *  same diagnosis. Returns a banner string (markdown) or null. */
function detectConvergingEvidence(findings: Finding[]): string | null {
  /* Phase 16.7 — count BOTH red AND amber findings tagged with the
     relevant signals. The original Critical-only counting created a
     mismatch where the banner said "2 signals" but listed 3 things
     (the third being the amber diffuse-intent finding's signal). Senior
     DMS read: amber-severity convergence is still convergence — counting
     it is more honest. */
  const SIGNAL_KEYS = ['keyword_mismatch', 'url_not_in_top_10', 'serp_topic_mismatch', 'first_paragraph_off_topic'] as const;
  const candidates = findings.filter(f =>
    (f.severity === 'red' || f.severity === 'amber') &&
    Array.isArray(f.signals) &&
    f.signals.some(s => (SIGNAL_KEYS as readonly string[]).includes(s)));
  if (candidates.length < 2) return null;
  /* Build the dynamic signal-list from what's actually tagged. Each
     bullet refers to the specific evidence that triggered the signal. */
  const presentSignals = new Set<string>();
  for (const f of candidates) {
    if (!f.signals) continue;
    for (const s of f.signals) {
      if ((SIGNAL_KEYS as readonly string[]).includes(s)) presentSignals.add(s);
    }
  }
  const signalDescriptions: Record<string, string> = {
    keyword_mismatch:          'title/H1 token mismatch with the campaign keyword',
    url_not_in_top_10:         'audited URL absent from the live top-10 for the campaign keyword',
    serp_topic_mismatch:       'live top-10 SERP composition is misaligned with this page\'s topic (diffuse-intent SERP)',
    first_paragraph_off_topic: 'first paragraph has zero overlap with title/H1 (templated/off-topic copy)',
  };
  const bullets = Array.from(presentSignals)
    .map(s => `- ${signalDescriptions[s] || s}`)
    .join('\n');
  /* Note the severity mix in the banner so the reader knows the count
     includes both red Critical and amber findings. */
  const redCount   = candidates.filter(f => f.severity === 'red').length;
  const amberCount = candidates.filter(f => f.severity === 'amber').length;
  const severitySummary = amberCount > 0
    ? `${redCount} Critical + ${amberCount} Warning`
    : `${redCount} Critical`;
  return `> 🔗 **Converging evidence — ${candidates.length} independent signal(s) (${severitySummary}) support the campaign-keyword-pivot recommendation:**\n>\n${bullets.split('\n').map(b => `> ${b}`).join('\n')}\n>\n> When 2+ findings independently corroborate the same diagnosis, the recommendation hardens from hypothesis to operational call. Address the keyword pivot before downstream tactical fixes — those will reset against the new target.`;
}

/* ════════════════════════════════════════════════════════════════
   PUBLIC API
═══════════════════════════════════════════════════════════════ */

/** Run a full technical audit on a single panel.
 *  Resolves the target URL (manual > GSC > strategy_plan), executes all checks,
 *  writes findings + report, surfaces critical issues as opportunities. */
export async function runTechnicalAudit(opts: {
  campaignId: string;
  panelId?:   string;          // if omitted, looks up technical_audit panel for the campaign
  triggeredBy?: 'cron' | 'manual';
  manualUrl?: string;          // override: skip resolution, audit this URL
}): Promise<{
  success: boolean;
  audit_run_id?: string;
  audited_url?: string;
  findings_count?: number;
  red_count?: number;
  amber_count?: number;
  report_id?: string;
  error?: string;
}> {
  const triggeredBy = opts.triggeredBy || 'manual';
  try {
    /* Resolve campaign + panel */
    const { data: campaign } = await db().from("seo_campaigns")
      .select("id, project_id, keyword").eq("id", opts.campaignId).maybeSingle();
    if (!campaign) return { success: false, error: 'campaign not found' };
    const c = campaign as any;

    let panelId = opts.panelId;
    if (!panelId) {
      const { data: p } = await db().from("seo_campaign_panels")
        .select("id").eq("campaign_id", opts.campaignId).eq("pillar", 'technical_audit').maybeSingle();
      panelId = (p as any)?.id;
    }
    if (!panelId) return { success: false, error: 'no technical_audit panel found for this campaign' };

    /* Resolve target URL */
    const target = await resolveTargetUrl({
      projectId: c.project_id, campaignId: opts.campaignId, panelId,
      keyword: c.keyword, manualUrl: opts.manualUrl,
    });
    if (!target) {
      /* No URL available — write an info-level "pending" report and exit */
      await writeReportToPanel({
        campaignId:       opts.campaignId,
        projectId:        c.project_id,
        pillar:           'technical_audit',
        panelId,
        reportKind:       triggeredBy === 'cron' ? 'scheduled_recheck' : 'manual_refresh',
        generatedBy:      triggeredBy,
        dataSources:      [],
        confidenceRating: 'low',
        confidenceReason: 'No target URL available yet — page must be published or strategy step must complete.',
        title:            `Technical audit pending — no target URL`,
        bodyMd:           `# Technical audit pending\n\nNo target URL has been set for "${c.keyword}" yet. The audit can run as soon as one of:\n\n- A page is published and starts appearing in GSC for this keyword\n- The strategy_plan step produces a target URL suggestion\n- You manually set a target URL via the "Set target URL" button on the Technical Audit panel\n\nNothing else has been audited.`,
        summary:          'Awaiting target URL.',
        tags:             ['technical_audit', 'pending', 'no_url'],
        updatePanelStatus: true,
        newPanelStatus:    'amber',
      });
      return { success: true, audited_url: undefined, findings_count: 0, red_count: 0, amber_count: 0 };
    }

    /* Update panel with the resolved URL (if not manual) for future visibility */
    await db().from("seo_campaign_panels").update({
      target_url:        target.url,
      target_url_source: target.source,
      updated_at:        new Date().toISOString(),
    }).eq("id", panelId);

    let serpApiMissingWarning = false;
    /* Pre-warm the SerpAPI cache unconditionally.
       fetchSerpFeatures writes to ai_content_cache (platform-wide, keyed
       by keyword + country). Every check that needs SERP data calls
       fetchSerpFeatures internally — they all hit the cache after this
       first call. Doing it here means:
         1. Even a page with 0 GSC impressions gets live SERP data
            (previously gated behind CTR underperformance check)
         2. All checks share ONE SerpAPI call per audit, not N calls
         3. If the key is missing or the call fails, we surface ONE clear
            finding here rather than silent nulls in 3 separate checks */
    try {
      const serpWarm = await fetchSerpFeatures(c.keyword, c.project_id);
      if (!serpWarm) {
        console.warn(`[runTechnicalAudit] SerpAPI returned null for keyword="${c.keyword}" projectId="${c.project_id}" — SERPAPI_KEY may not be set in Vercel env vars`);
        /* Surface as a finding so it's visible in the report — not just a server log */
        serpApiMissingWarning = true;
      }
    } catch (e: any) {
      console.warn(`[runTechnicalAudit] SerpAPI pre-warm failed: ${e?.message}`);
      serpApiMissingWarning = true;
    }

    /* Run all checks in parallel */
    const auditRunId = crypto.randomUUID();
    const checkResults = await Promise.allSettled([
      checkIndexability(target.url, c.project_id, c.keyword),
      checkOnPageFundamentals(target.url),
      checkCoreWebVitals(target.url, c.project_id),
      checkEngagementSignals(target.url, c.project_id),
      checkSchemaMarkup(target.url),
      /* Phase 15.2 — Senior DMS uplift 2026-05-24 */
      checkKeywordPresence(target.url, c.keyword),
      checkCtrVsExpected(target.url, c.project_id, c.keyword),
      checkQueryDistribution(target.url, c.project_id, c.keyword),
      /* Phase 15.3 — Senior DMS uplift batch 2 (2026-05-24 PM) */
      checkFirstParagraphTopicality(target.url),
      /* Phase 16.4 — Tier 1 SerpAPI leverage (2026-05-24 evening).
         All three call fetchSerpFeatures internally; second/third call
         within an audit hits cache, so no extra SerpAPI spend. The
         diffuse-intent check makes 1 LLM call (Haiku, ~$0.0003) when it
         fires. competitive_content_benchmark fetches top-10 URLs in
         parallel (best-effort, fetch failures tolerated). */
      checkHeadingHierarchyVsPaa(target.url, c.project_id, c.keyword),
      checkDiffuseIntentSerp(c.project_id, c.keyword),
      checkCompetitiveContentBenchmark(target.url, c.project_id, c.keyword),
      /* Phase 16.6 — Tier 3 tech-audit-verifiable additions (2026-05-24 night, final).
         All three self-contained: single HTML fetch each, no external API spend.
         Closes the long-standing "Not yet covered" footer gaps for content
         freshness, image optimization, and hreflang validation. */
      checkContentFreshness(target.url),
      checkImageOptimization(target.url),
      checkHreflang(target.url),
    ]);

    const findings: Finding[] = [];
    const failedChecks: string[] = [];
    for (let i = 0; i < checkResults.length; i++) {
      const r = checkResults[i];
      if (r.status === 'fulfilled') {
        findings.push(...r.value);
      } else {
        const checkName = ['indexability','on_page','cwv','engagement','schema','keyword_presence','ctr_vs_expected','query_distribution','first_para_topicality','heading_hierarchy_vs_paa','diffuse_intent_serp','competitive_content_benchmark','content_freshness','image_optimization','hreflang'][i];
        failedChecks.push(checkName);
      }
    }

    /* If SerpAPI was unavailable, inject a top-level amber finding so the
       reader knows why PAA, competitor, and diffuse-intent data is missing.
       Only inject if none of the checks already produced a SerpAPI warning
       (the PAA check adds one when serp is null). */
    if (serpApiMissingWarning && !findings.some(f => f.data_source === 'serpapi' && f.severity === 'amber')) {
      findings.unshift({
        audit_kind: 'on_page_fundamentals',
        severity: 'amber',
        finding_title: 'SerpAPI not configured — live SERP data unavailable for this audit',
        finding_detail: `SerpAPI could not be reached for the keyword "${c.keyword}". Three audit checks depend on live SERP data and returned empty:\\n\\n- **PAA questions** (heading coverage check) — skipped\\n- **Diffuse-intent SERP detection** — skipped\\n- **Competitive content benchmark** — skipped\\n\\n> ⚠️ **How to fix:** The \`SERPAPI_KEY\` environment variable must be set in Vercel. Go to Vercel Dashboard → your project → Settings → Environment Variables → add \`SERPAPI_KEY\` with your SerpAPI key. This covers ALL projects and ALL campaigns automatically. Get a key at https://serpapi.com (free tier: 100 searches/month).`,
        recommendation: 'Set SERPAPI_KEY in Vercel environment variables. One key covers all projects.',
        data_source: 'serpapi',
      });
    }

    /* Phase 16.7 — Cross-finding relationship post-process.
       When diffuse-intent SERP fired AND content-benchmark fired AND the
       audited page exceeds competitor median by >150%, the bloat
       interpretation is misleading: the median is dragged down by
       different-intent pages dominating top-10. A senior DMS reading
       both findings spots this; the audit should make the connection
       explicit so a junior practitioner doesn't conclude "my page is
       bloated" when the truth is "competitors are different content
       types entirely." */
    const diffuseIntentFinding = findings.find(f => /Diffuse-intent SERP/i.test(f.finding_title));
    const benchmarkFinding = findings.find(f => /Content depth.*SERP median/i.test(f.finding_title));
    if (diffuseIntentFinding && benchmarkFinding && benchmarkFinding.evidence?.word_ratio > 1.5) {
      const categoryCount = diffuseIntentFinding.evidence?.distinct_categories || 0;
      const wordRatio = benchmarkFinding.evidence.word_ratio;
      const note = `\n\n**Note on the median:** the competitor median is dragged down by intent diffusion (see the *Diffuse-intent SERP* finding — ${categoryCount} distinct intent categories in top-10). Your content length (${Math.round(wordRatio * 100)}% of median) reflects this intent mismatch, not bloat. Compared to genuine peer content of the SAME intent class, your page may be similar or even shorter. Don't trim length based on this comparison alone — the more reliable signal is heading-hierarchy and topical coverage vs same-intent peers, which requires manually filtering the top-10 list to only the comparable page types.`;
      benchmarkFinding.finding_detail = (benchmarkFinding.finding_detail || '') + note;
    }

    /* Insert findings into the DB */
    if (findings.length > 0) {
      const findingRows = findings.map(f => ({
        campaign_id:    opts.campaignId,
        panel_id:       panelId,
        project_id:     c.project_id,
        audited_url:    target.url,
        audit_kind:     f.audit_kind,
        severity:       f.severity,
        finding_title:  f.finding_title.slice(0, 240),
        finding_detail: f.finding_detail?.slice(0, 2000) || null,
        recommendation: f.recommendation?.slice(0, 1000) || null,
        evidence:       f.evidence || null,
        data_source:    f.data_source || null,
        audit_run_id:   auditRunId,
      }));
      await db().from("technical_audit_findings").insert(findingRows);
    }

    /* Score & write the markdown report */
    const redCount   = findings.filter(f => f.severity === 'red').length;
    const amberCount = findings.filter(f => f.severity === 'amber').length;
    const greenCount = findings.filter(f => f.severity === 'green').length;
    const infoCount  = findings.filter(f => f.severity === 'info').length;
    const panelStatus: 'red' | 'amber' | 'green' = redCount > 0 ? 'red' : amberCount > 0 ? 'amber' : 'green';
    const headline = buildHeadline({ url: target.url, redCount, amberCount, greenCount, failedChecks });

    /* Phase 16.9 — Deep-doc audit rendering.
       Manav 2026-05-24 architectural redirect: Phase 16.8 multi-lens
       retired. Replaced by ONE comprehensive technical SEO report with
       stable §-IDs and internal cross-references. Same findings, one
       deep narrative. Any role reads the sections relevant to them;
       any LLM uploaded the doc derives role-specific views (PM tasks,
       content briefs, client summaries, sales hooks) by querying the
       cross-reference graph. The lens module remains in the repo as
       dormant code for one phase before deletion.

       Phase 16.10 — pre-render passes restored. The legacy renderAuditReport
       called pickFoundationalCritical + detectConvergingEvidence; the
       deep-doc wire-in missed them, so is_foundational was never set,
       which cascaded into §6.1 empty, §0.2 numbering hole, §3.1 missing
       🎯 badge, and §7.1 phantom T1.x dependencies. Restored here, plus
       a new cluster-signal propagation step: when a foundational finding
       is identified, the corroborating signal-tagged findings get a
       shared `keyword_pivot_cluster` signal so the renderer's signal-
       based cross-ref engine wires them together (§3.1 ↔ §3.2 ↔ §3.3 ↔ §3.9). */
    pickFoundationalCritical(findings);
    propagateKeywordPivotClusterSignal(findings);
    const convergingBanner = detectConvergingEvidence(findings);

    const sourceConf = weightedFindingConfidence(findings);
    const sourceCounts: Record<string, number> = {};
    for (const f of findings) {
      const m = findingSourceMeta(f);
      if (m) sourceCounts[m.label] = (sourceCounts[m.label] || 0) + 1;
    }
    const serpapiEnrichedCount = findings.filter(f =>
      Array.isArray(f.enrichment_sources) && f.enrichment_sources.includes('serpapi')).length;
    if (serpapiEnrichedCount > 0) {
      sourceCounts['SerpAPI (live SERP enrichment)'] = serpapiEnrichedCount;
    }
    const deepReportInputs: DeepReportInputs = {
      url:          target.url,
      keyword:      c.keyword,
      source:       target.source,
      source_note:  target.note,
      run_id:       auditRunId,
      audited_at:   new Date().toISOString(),
      failed_checks: failedChecks,
      findings,
      red_count:    redCount,
      amber_count:  amberCount,
      green_count:  greenCount,
      info_count:   infoCount,
      confidence: {
        weighted_mean:       sourceConf.mean,
        sourced_count:       sourceConf.sourced_count,
        unattributed_count:  sourceConf.unattributed_count,
        by_source:           sourceCounts,
      },
      converging_banner:    convergingBanner,
    };
    const bodyMd = renderDeepAuditReport(deepReportInputs);
    /* Phase 16.11.2 rollback — HTML render call disabled after audits started
       failing fast in production with no toast and no visible result. The
       renderer file itself remains in the repo (api/lib/seo-technical-audit-html.ts)
       and the SQL migration adding body_html is harmless if applied. The two
       hotfixes (try/catch on render, retry-without-body_html on insert) did
       not resolve the symptom, so the wire-in is rolled back to the
       Phase 16.10 working state pending diagnosis with runtime evidence. */
    const bodyHtml: string | undefined = undefined;

    /* Honest confidence rating — combines per-finding source quality AND
       check-execution failures. Either dimension dropping low pulls the
       overall rating down. Previously this only counted failed checks,
       which meant a "green" verdict from a single html_fetch was rated
       the same as one cross-confirmed across GSC+GA4+audit. */
    const ratingFromSources: 'high' | 'medium' | 'low' =
      sourceConf.sourced_count === 0 ? 'low' :
      sourceConf.mean >= 88           ? 'high' :
      sourceConf.mean >= 75           ? 'medium' : 'low';
    const ratingFromFailures: 'high' | 'medium' | 'low' =
      failedChecks.length === 0       ? 'high' :
      failedChecks.length <= 2        ? 'medium' : 'low';
    const overallRating: 'high' | 'medium' | 'low' =
      (ratingFromSources === 'low'    || ratingFromFailures === 'low')    ? 'low' :
      (ratingFromSources === 'medium' || ratingFromFailures === 'medium') ? 'medium' : 'high';

    const reportR = await writeReportToPanel({
      campaignId:       opts.campaignId,
      projectId:        c.project_id,
      pillar:           'technical_audit',
      panelId,
      reportKind:       triggeredBy === 'cron' ? 'scheduled_recheck' : 'manual_refresh',
      generatedBy:      triggeredBy,
      dataSources:      collectDataSources(findings),
      confidenceRating: overallRating,
      confidenceReason: [
        failedChecks.length === 0
          ? 'All audit checks completed.'
          : `${failedChecks.length} check(s) failed to execute: ${failedChecks.join(', ')}. Findings below are partial.`,
        sourceConf.sourced_count > 0
          ? `Source-weighted confidence across ${sourceConf.sourced_count} sourced finding(s): ${sourceConf.mean}/100 (${ratingFromSources}).`
          : `No findings declared a data source — confidence treated as low.`,
        sourceConf.unattributed_count > 0
          ? `${sourceConf.unattributed_count} finding(s) lack a data_source attribution and were excluded from the confidence calculation.`
          : null,
      ].filter(Boolean).join(' '),
      title:            `Technical audit: ${cleanUrl(target.url)}`,
      bodyMd,
      bodyHtml,
      summary:          headline,
      tags:             ['technical_audit', `severity:${panelStatus}`, `url:${cleanUrl(target.url)}`,
                         ...(redCount > 0   ? ['has_red'] : []),
                         ...(amberCount > 0 ? ['has_amber'] : [])],
      metricSnapshot:   { red: redCount, amber: amberCount, green: greenCount, total: findings.length, failed_checks: failedChecks },
      updatePanelStatus: true,
      newPanelStatus:    panelStatus,
    });

    /* Phase D-audit — dual-write audit report into the artifacts table so
       Documents page can surface it alongside pipeline artifacts.
       Best-effort: failure is logged but does NOT block the audit return. */
    if (reportR.success && reportR.report_id) {
      try {
        await persistArtifacts([{
          source_kind:    'technical_audit',
          source_id:      reportR.report_id,
          source_step_id: 'technical_audit',
          artifact_kind:  'audit_report',
          title:          `Technical audit: ${cleanUrl(target.url)}`,
          keyword:        c.keyword || null,
          target_url:     target.url,
          body:           bodyMd,
          body_format:    'markdown',
          metadata: {
            audit_run_id:   auditRunId,
            red_count:      redCount,
            amber_count:    amberCount,
            green_count:    greenCount,
            panel_status:   panelStatus,
            triggered_by:   triggeredBy,
            confidence:     overallRating,
          },
          project_id:          c.project_id,
          campaign_id:         opts.campaignId,
          panel_id:            panelId || null,
          generation_cost_usd: undefined,
          llm_calls:           0,
          serpapi_calls:       0,
        }]);
      } catch (artErr: any) {
        console.warn(`[runTechnicalAudit] artifacts persist failed (non-blocking): ${artErr?.message}`);
      }
    }

    /* Create opportunities for every RED finding */
    for (const red of findings.filter(f => f.severity === 'red')) {
      await recordOpportunity({
        projectId:           c.project_id,
        sourceKind:          'cron_sweep',
        sourceCampaignId:    opts.campaignId,
        sourcePanelId:       panelId,
        sourceStepId:        red.audit_kind,
        kind:                'technical',
        title:               `Critical technical issue: ${red.finding_title}`,
        description:         red.recommendation || red.finding_detail || 'Investigate this red finding.',
        evidence:            { audit_run_id: auditRunId, url: target.url, ...(red.evidence || {}) },
        estimatedValue:      'high',
        estimatedEffort:     red.audit_kind === 'core_web_vitals' ? 'high' : 'medium',
        suggestedAction:     'investigate',
      });
    }

    /* Update next_recheck_at for the cron schedule */
    const { data: panelRow } = await db().from("seo_campaign_panels")
      .select("recheck_cadence_days").eq("id", panelId).maybeSingle();
    const cadence = (panelRow as any)?.recheck_cadence_days || 7;
    await db().from("seo_campaign_panels").update({
      last_assessed_at: new Date().toISOString(),
      next_recheck_at:  new Date(Date.now() + cadence * 86_400_000).toISOString(),
    }).eq("id", panelId);

    return {
      success: true,
      audit_run_id:   auditRunId,
      audited_url:    target.url,
      findings_count: findings.length,
      red_count:      redCount,
      amber_count:    amberCount,
      report_id:      reportR.report_id,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'audit failed' };
  }
}

/** Manually set a target URL for a panel. */
export async function setPanelTargetUrl(opts: {
  panelId: string;
  url:     string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    /* Light validation */
    const url = opts.url.trim();
    if (!/^https?:\/\/.+/i.test(url)) return { success: false, error: 'url must start with http:// or https://' };

    await db().from("seo_campaign_panels").update({
      target_url:        url.slice(0, 500),
      target_url_source: 'manual',
      updated_at:        new Date().toISOString(),
    }).eq("id", opts.panelId);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'set url failed' };
  }
}

/** Read recent audit findings for a panel (for trend / detail views). */
export async function getPanelFindings(opts: {
  panelId: string;
  limit?:  number;
}): Promise<{ success: boolean; findings?: any[]; error?: string }> {
  try {
    const { data } = await db().from("technical_audit_findings")
      .select("*").eq("panel_id", opts.panelId)
      .order("measured_at", { ascending: false })
      .limit(Math.min(opts.limit || 50, 200));
    return { success: true, findings: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || 'list findings failed' };
  }
}

/* ════════════════════════════════════════════════════════════════
   TARGET URL RESOLUTION
═══════════════════════════════════════════════════════════════ */

async function resolveTargetUrl(opts: {
  projectId: string; campaignId: string; panelId: string;
  keyword: string; manualUrl?: string;
}): Promise<TargetResolution | null> {
  /* 1. Manual override always wins */
  if (opts.manualUrl) {
    return { url: opts.manualUrl, source: 'manual' };
  }

  /* 2. Existing target_url on the panel */
  const { data: panel } = await db().from("seo_campaign_panels")
    .select("target_url, target_url_source").eq("id", opts.panelId).maybeSingle();
  if (panel && (panel as any).target_url) {
    return {
      url:    (panel as any).target_url,
      source: ((panel as any).target_url_source as any) || 'manual',
    };
  }

  /* 3. Try to infer from GSC top_pages — the page currently ranking for the keyword */
  try {
    const { data: pagesRow } = await db().from("project_knowledge")
      .select("field_value").eq("project_id", opts.projectId)
      .eq("category", "analytics").eq("field_key", "gsc_top_pages").maybeSingle();
    const pages = pagesRow ? JSON.parse((pagesRow as any).field_value) : [];

    /* We don't have per-page query mapping in storage, but project owner's
       site is likely all their URLs. Just take the highest-traffic page
       matching the keyword in slug or title. Limited heuristic but honest. */
    const kwSlug = opts.keyword.toLowerCase().replace(/\s+/g, '-');
    const kwToken = opts.keyword.toLowerCase().split(/\s+/)[0];
    const candidates = (pages || []).filter((p: any) => {
      const url = (p.page || '').toLowerCase();
      return url.includes(kwSlug) || url.includes(kwToken);
    });
    if (candidates.length > 0) {
      candidates.sort((a: any, b: any) => (b.clicks || 0) - (a.clicks || 0));
      return {
        url: candidates[0].page,
        source: 'gsc_top_page',
        note: `Inferred from GSC: page currently ranks for "${opts.keyword}" (or contains its tokens in URL).`,
      };
    }
  } catch { /* GSC unavailable — fall through */ }

  /* 4. Try strategy_plan step output — its target_url_suggestion field */
  try {
    const { data: runs } = await db().from("season_pipeline_runs")
      .select("id").eq("campaign_id", opts.campaignId)
      .order("started_at", { ascending: false }).limit(1);
    const runId = (runs as any)?.[0]?.id;
    if (runId) {
      const { data: stepRow } = await db().from("season_pipeline_steps")
        .select("output").eq("run_id", runId).eq("step_id", 'strategy_plan').maybeSingle();
      const output = (stepRow as any)?.output;
      const suggestion = output?.target_url_suggestion as string | undefined;
      if (suggestion && /^https?:\/\//i.test(suggestion)) {
        return { url: suggestion, source: 'strategy_plan', note: 'Inferred from strategy_plan step.' };
      }
    }
  } catch { /* No strategy or no run — fall through */ }

  return null;
}

/* ════════════════════════════════════════════════════════════════
   CHECK 1: INDEXABILITY (GSC + robots fetch)
═══════════════════════════════════════════════════════════════ */

async function checkIndexability(url: string, projectId: string, keyword: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  /* Sub-check A: HTTP response */
  const fetchResult = await fetchWithTimeout(url, 12000);
  if (!fetchResult.ok || !fetchResult.response) {
    findings.push({
      audit_kind:     'indexability',
      severity:       'red',
      finding_title:  `Page returned ${fetchResult.status || 'no response'}`,
      finding_detail: `Could not fetch the page${fetchResult.error ? `: ${fetchResult.error}` : '.'}. Search engines cannot index a page they cannot fetch.`,
      recommendation: `Investigate the URL. Verify the page exists, the server is reachable, and there are no firewall rules blocking the request.`,
      evidence:       { url, http_status: fetchResult.status, error: fetchResult.error },
      data_source:    'html_fetch',
    });
    return findings;  /* No point continuing if we can't fetch */
  }

  const status = fetchResult.response.status;
  if (status >= 400) {
    findings.push({
      audit_kind:     'indexability',
      severity:       'red',
      finding_title:  `Page returns HTTP ${status}`,
      finding_detail: `The target URL returns an error status. Pages with 4xx/5xx responses are not indexed.`,
      recommendation: status === 404 ? `The page does not exist. Either publish it, or update the campaign's target URL.` : `Investigate the server error and restore access.`,
      evidence:       { url, http_status: status },
      data_source:    'html_fetch',
    });
    return findings;
  }
  if (status >= 300) {
    const location = fetchResult.response.headers.get('location') || '(unknown)';
    findings.push({
      audit_kind:     'redirect',
      severity:       'amber',
      finding_title:  `Page redirects (HTTP ${status})`,
      finding_detail: `The URL returns a ${status} redirect to: ${location}. Redirects reduce link equity; the destination is what gets indexed.`,
      recommendation: `If this redirect is intentional, update the campaign's target URL to the final destination. If unintentional, remove the redirect.`,
      evidence:       { from: url, to: location, http_status: status },
      data_source:    'html_fetch',
    });
  }

  /* Sub-check B: x-robots-tag header */
  const xRobots = fetchResult.response.headers.get('x-robots-tag') || '';
  if (/noindex/i.test(xRobots)) {
    findings.push({
      audit_kind:     'robots',
      severity:       'red',
      finding_title:  `X-Robots-Tag header blocks indexing`,
      finding_detail: `Server returns header: "X-Robots-Tag: ${xRobots}". This explicitly tells Google not to index the page.`,
      recommendation: `Remove the noindex directive from server configuration if this page should rank.`,
      evidence:       { x_robots_tag: xRobots },
      data_source:    'html_fetch',
    });
  }

  /* Sub-check C: meta robots in HTML */
  const html = fetchResult.html || '';
  const metaRobotsMatch = /<meta\s+[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i.exec(html);
  if (metaRobotsMatch && /noindex/i.test(metaRobotsMatch[1])) {
    findings.push({
      audit_kind:     'robots',
      severity:       'red',
      finding_title:  `Meta robots tag blocks indexing`,
      finding_detail: `Page contains <meta name="robots" content="${metaRobotsMatch[1]}"> which prevents indexing.`,
      recommendation: `Remove or change the meta robots tag. Use "index, follow" for pages that should rank.`,
      evidence:       { meta_robots: metaRobotsMatch[1] },
      data_source:    'html_fetch',
    });
  } else {
    findings.push({
      audit_kind:     'robots',
      severity:       'green',
      finding_title:  `No robots blocking detected`,
      finding_detail: `Neither X-Robots-Tag header nor meta robots tag blocks indexing.`,
      data_source:    'html_fetch',
    });
  }

  /* Sub-check D: is the page actually appearing in GSC for any query?
     If yes → it's indexed. If no → could be unindexed OR just not getting impressions. */
  try {
    const { data: pagesRow } = await db().from("project_knowledge")
      .select("field_value").eq("project_id", projectId)
      .eq("category", "analytics").eq("field_key", "gsc_top_pages").maybeSingle();
    const pages = pagesRow ? JSON.parse((pagesRow as any).field_value) : [];
    const inGsc = (pages || []).some((p: any) =>
      (p.page || '').replace(/\/$/, '').toLowerCase() === url.replace(/\/$/, '').toLowerCase()
    );
    if (inGsc) {
      const match = (pages || []).find((p: any) =>
        (p.page || '').replace(/\/$/, '').toLowerCase() === url.replace(/\/$/, '').toLowerCase()
      );
      findings.push({
        audit_kind:     'indexability',
        severity:       'green',
        finding_title:  `Page is indexed and appearing in search`,
        finding_detail: `GSC reports ${match.clicks || 0} clicks and ${match.impressions || 0} impressions for this URL recently, average position ${match.position?.toFixed?.(1) || '?'}.`,
        evidence:       { gsc_clicks: match.clicks, gsc_impressions: match.impressions, gsc_position: match.position },
        data_source:    'gsc',
      });
    } else {
      findings.push({
        audit_kind:     'indexability',
        severity:       'amber',
        finding_title:  `Page not in GSC top pages`,
        finding_detail: `This URL does not appear in the project's GSC top_pages data. Either it's not indexed, or it's indexed but getting no impressions. Verify indexing status in GSC's URL Inspection tool.`,
        recommendation: `Open GSC → URL Inspection → paste the URL → check "URL is on Google" status. If not indexed, click "Request indexing".`,
        evidence:       { url, in_gsc_top_pages: false },
        data_source:    'gsc',
      });
    }
  } catch { /* GSC unavailable — skip this sub-check */ }

  return findings;
}

/* ════════════════════════════════════════════════════════════════
   CHECK 2: ON-PAGE FUNDAMENTALS
═══════════════════════════════════════════════════════════════ */

async function checkOnPageFundamentals(url: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok || !r.html) return findings;  /* indexability check already flagged this */
  const html = r.html;

  /* Title tag.
     Phase 16.3 — decode HTML entities at extraction so all downstream
     display ("&amp;" → "&", etc.) is clean. */
  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const title = decodeHtmlEntities((titleMatch?.[1]?.trim()) || '');
  if (!title) {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'red',
      finding_title:  'Missing <title> tag',
      finding_detail: 'Page has no title tag. This is one of Google\'s strongest ranking signals.',
      recommendation: 'Add a descriptive <title> tag (50-60 characters) including the primary keyword.',
      data_source: 'html_fetch',
    });
  } else if (title.length < 30) {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'amber',
      finding_title:  `Title tag is short (${title.length} chars): "${title}"`,
      finding_detail: 'Short titles miss the opportunity to include modifiers, brand, and keyword variants.',
      recommendation: 'Expand the title to 50-60 characters. Include the primary keyword plus a modifier or brand.',
      evidence: { title, title_length: title.length },
      data_source: 'html_fetch',
    });
  } else if (title.length > 65) {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'amber',
      finding_title:  `Title tag is long (${title.length} chars): "${title}"`,
      finding_detail: 'Google truncates titles over ~600 pixels (~60 chars). The end of long titles gets cut off in SERP.',
      recommendation: 'Tighten the title to 50-60 characters. Put the most important words first.',
      evidence: { title, title_length: title.length },
      data_source: 'html_fetch',
    });
  } else {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'green',
      finding_title:  `Title tag well-formed: "${title}"`,
      finding_detail: `Length ${title.length} chars — within optimal range.`,
      evidence: { title, title_length: title.length },
      data_source: 'html_fetch',
    });
  }

  /* Meta description.
     Phase 16.3 — decode HTML entities at extraction (matches title handling). */
  const metaDescMatch = /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html);
  const metaDesc = decodeHtmlEntities((metaDescMatch?.[1]?.trim()) || '');
  if (!metaDesc) {
    findings.push({
      audit_kind: 'meta_tags', severity: 'amber',
      finding_title:  'Missing meta description',
      finding_detail: 'Without a meta description, Google may auto-generate snippet text — usually less compelling than a written one.',
      recommendation: 'Add a meta description (140-160 chars) that summarizes the page and encourages clicks.',
      data_source: 'html_fetch',
    });
  } else if (metaDesc.length < 120 || metaDesc.length > 165) {
    findings.push({
      audit_kind: 'meta_tags', severity: 'amber',
      finding_title:  `Meta description suboptimal length (${metaDesc.length} chars)`,
      finding_detail: `Current: "${metaDesc.slice(0, 100)}${metaDesc.length > 100 ? '…' : ''}"`,
      recommendation: 'Target 140-160 characters. Below that wastes SERP real estate; above that gets truncated.',
      evidence: { meta_description: metaDesc, length: metaDesc.length },
      data_source: 'html_fetch',
    });
  } else {
    findings.push({
      audit_kind: 'meta_tags', severity: 'green',
      finding_title:  'Meta description well-formed',
      evidence: { length: metaDesc.length },
      data_source: 'html_fetch',
    });
  }

  /* H1 tag(s).
     Phase 16.3 — decode HTML entities at extraction. */
  const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gis) || [];
  const h1Count = h1Matches.length;
  const h1Text = h1Count > 0 ? decodeHtmlEntities(h1Matches[0].replace(/<[^>]+>/g, '').trim()) : '';
  if (h1Count === 0) {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'red',
      finding_title:  'Missing H1 tag',
      finding_detail: 'Every page should have exactly one H1 conveying its main topic.',
      recommendation: 'Add a clear, keyword-aligned <h1> tag.',
      data_source: 'html_fetch',
    });
  } else if (h1Count > 1) {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'amber',
      finding_title:  `Multiple H1 tags (${h1Count})`,
      finding_detail: 'Multiple H1s split the page\'s topical focus. Modern HTML5 allows it, but semantically a single H1 is clearer.',
      recommendation: 'Use one H1; demote others to H2.',
      evidence: { h1_count: h1Count, h1_first: h1Text },
      data_source: 'html_fetch',
    });
  } else {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'green',
      finding_title:  `Single H1: "${h1Text}"`,
      evidence: { h1: h1Text },
      data_source: 'html_fetch',
    });
  }

  /* Word count — rough heuristic stripping tags */
  const textOnly = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                       .replace(/<style[\s\S]*?<\/style>/gi, '')
                       .replace(/<[^>]+>/g, ' ')
                       .replace(/\s+/g, ' ')
                       .trim();
  const wordCount = textOnly.split(/\s+/).length;
  if (wordCount < 300) {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'amber',
      finding_title:  `Thin content (~${wordCount} words)`,
      finding_detail: 'Pages under 300 words rarely rank for competitive queries unless they\'re tools or directly answer a question.',
      recommendation: 'Expand the content with substantive coverage. Aim for 800+ words for informational pages, 400+ for commercial.',
      evidence: { word_count: wordCount },
      data_source: 'html_fetch',
    });
  } else {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'green',
      finding_title:  `Word count: ~${wordCount} words`,
      evidence: { word_count: wordCount },
      data_source: 'html_fetch',
    });
  }

  /* Images without alt — list specific images for actionable fixes.
     Phase 15.3 — filter out known tracking pixels: they have no alt by
     design (Facebook Pixel, GA, Pinterest, LinkedIn Insight, etc.) and
     counting them as "missing alt" is noise that masks real findings. */
  const allImgMatches = html.match(/<img[^>]+>/gi) || [];
  const imgMatches    = allImgMatches.filter(img => !isTrackingPixel(img));
  const trackingPixelsFiltered = allImgMatches.length - imgMatches.length;
  const imgsWithoutAlt = imgMatches.filter(img => !/\salt=/i.test(img));
  if (imgMatches.length > 0 && imgsWithoutAlt.length > 0) {
    const pct = Math.round((imgsWithoutAlt.length / imgMatches.length) * 100);
    /* Extract specific src URLs of images missing alt for actionable fix */
    const missingSrcs = imgsWithoutAlt
      .map(img => {
        const m = /\ssrc=["']([^"']+)["']/i.exec(img);
        return m?.[1] || null;
      })
      .filter((s): s is string => !!s)
      .slice(0, 8);
    /* Also count short/generic alts on the ones that DO have alt */
    const imgsWithShortAlt = imgMatches.filter(img => {
      const m = /\salt=["']([^"']*)["']/i.exec(img);
      if (!m) return false;
      const a = m[1].trim();
      return a.length > 0 && a.length < 5;
    }).length;
    const detailLines = [
      `${imgsWithoutAlt.length} of ${imgMatches.length} content images (${pct}%) have no alt attribute.`,
    ];
    if (trackingPixelsFiltered > 0) {
      detailLines.push(`(${trackingPixelsFiltered} tracking pixel${trackingPixelsFiltered === 1 ? '' : 's'} filtered from the count — they have no alt by design.)`);
    }
    if (missingSrcs.length > 0) {
      detailLines.push('', '**Specific images missing alt:**');
      for (const src of missingSrcs) detailLines.push(`- ${src}`);
      if (imgsWithoutAlt.length > missingSrcs.length) {
        detailLines.push(`- _(${imgsWithoutAlt.length - missingSrcs.length} more)_`);
      }
    }
    if (imgsWithShortAlt > 0) {
      detailLines.push('', `Additionally, ${imgsWithShortAlt} image(s) have very short alt text (<5 chars) — likely insufficient.`);
    }
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity: pct > 50 ? 'amber' : 'info',
      finding_title:  `${imgsWithoutAlt.length} of ${imgMatches.length} content images missing alt text (${pct}%)`,
      finding_detail: detailLines.join('\n') + '\n\nAlt text helps screen readers, image search ranking, and acts as backup if images fail to load.',
      recommendation: 'Add descriptive alt text to every meaningful image. Decorative images can use alt="". For the listed image URLs, write 5-12 word descriptions of what the image shows.',
      evidence: { total_images: imgMatches.length, missing_alt: imgsWithoutAlt.length, missing_alt_srcs: missingSrcs, short_alt_count: imgsWithShortAlt, tracking_pixels_filtered: trackingPixelsFiltered },
      data_source: 'html_fetch',
    });
  }

  /* Canonical */
  const canonicalMatch = /<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(html);
  const canonical = canonicalMatch?.[1] || '';
  if (!canonical) {
    findings.push({
      audit_kind: 'canonical', severity: 'amber',
      finding_title:  'Missing canonical tag',
      finding_detail: 'Without a canonical, duplicate URL variants (tracking params, http/https, with/without trailing slash) compete with each other.',
      recommendation: 'Add <link rel="canonical" href="..."> pointing to the preferred URL.',
      data_source: 'html_fetch',
    });
  } else if (canonical.replace(/\/$/, '') !== url.replace(/\/$/, '')) {
    findings.push({
      audit_kind: 'canonical', severity: 'amber',
      finding_title:  `Canonical points elsewhere: ${canonical}`,
      finding_detail: `Audited URL: ${url}\nCanonical: ${canonical}\nGoogle will index the canonical, not the audited URL.`,
      recommendation: `If this is intentional (e.g., this URL is a duplicate variant), confirm the canonical target is the page being optimized. Otherwise fix the canonical.`,
      evidence: { audited_url: url, canonical },
      data_source: 'html_fetch',
    });
  } else {
    findings.push({
      audit_kind: 'canonical', severity: 'green',
      finding_title:  'Self-referencing canonical present',
      evidence: { canonical },
      data_source: 'html_fetch',
    });
  }

  /* Internal links — Phase 16.5 expanded to include anchor-text quality
     analysis. Existing count finding retained; new quality finding added.
     Industry threshold: >40% generic anchors is a real signal that anchor
     usage isn't strategic. */
  const linkMatches = html.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi) || [];
  type AnchorParsed = { href: string; text: string; isInternal: boolean };
  const allParsed: AnchorParsed[] = [];
  for (const l of linkMatches) {
    const hrefMatch = /href=["']([^"']+)["']/i.exec(l);
    const textMatch = />([\s\S]*?)<\/a>$/i.exec(l);
    const href = hrefMatch?.[1] || '';
    const textRaw = textMatch?.[1] || '';
    /* Strip inner tags + decode entities to get clean anchor text */
    const text = decodeHtmlEntities(textRaw.replace(/<[^>]+>/g, '').trim());
    if (!href || !text) continue;
    let isInternal = false;
    try {
      const target = new URL(href, url);
      const source = new URL(url);
      isInternal = target.hostname === source.hostname;
    } catch { /* invalid URL, treat as not internal */ }
    allParsed.push({ href, text, isInternal });
  }
  const internalLinks = allParsed.filter(a => a.isInternal);
  if (internalLinks.length < 3) {
    findings.push({
      audit_kind: 'internal_links', severity: 'amber',
      finding_title:  `Few internal links (${internalLinks.length})`,
      finding_detail: 'Pages with very few internal links are orphan-like — they don\'t pass equity to other pages and don\'t receive it from a clear topical cluster.',
      recommendation: 'Link to 5-10 related pages within the same topical cluster, using descriptive anchor text.',
      evidence: { internal_link_count: internalLinks.length },
      data_source: 'html_fetch',
    });
  } else {
    findings.push({
      audit_kind: 'internal_links', severity: 'green',
      finding_title:  `${internalLinks.length} internal links present`,
      evidence: { internal_link_count: internalLinks.length },
      data_source: 'html_fetch',
    });

    /* Phase 16.5 — Anchor-text quality analysis.
       Classify each internal anchor:
       • generic        — "click here", "read more", "learn more", "this", "here", "more info", etc.
       • url_based      — anchor text is literally a URL (or starts with http)
       • single_word    — likely-nav single word ("Home", "About", "Pricing")
       • descriptive    — multi-word, content-bearing anchor text
       Aggregate distribution; flag if generic ratio is >40% (industry threshold). */
    const GENERIC_ANCHORS = new Set([
      'click here','read more','learn more','more','here','this','this page','this article','this post',
      'more info','more information','details','see more','find out more','continue reading',
      'click','tap','tap here','go here','view','view more','see','see all','read','read on',
      'next','previous','back','forward','top','home',
    ]);
    let generic = 0, urlBased = 0, singleWord = 0, descriptive = 0;
    const genericExamples: string[] = [];
    for (const a of internalLinks) {
      const normalized = a.text.toLowerCase().trim().replace(/\s+/g, ' ');
      if (normalized.startsWith('http') || normalized.match(/^www\./)) {
        urlBased++;
      } else if (GENERIC_ANCHORS.has(normalized)) {
        generic++;
        if (genericExamples.length < 5 && !genericExamples.includes(a.text)) genericExamples.push(a.text);
      } else if (normalized.split(/\s+/).filter(Boolean).length === 1 && normalized.length < 12) {
        singleWord++;
      } else {
        descriptive++;
      }
    }
    const lowQualityCount = generic + urlBased;
    const lowQualityRatio = internalLinks.length > 0 ? lowQualityCount / internalLinks.length : 0;
    const descriptiveRatio = internalLinks.length > 0 ? descriptive / internalLinks.length : 0;

    if (lowQualityRatio > 0.4) {
      findings.push({
        audit_kind: 'internal_links', severity: 'amber',
        finding_title: `Anchor-text quality is weak — ${Math.round(lowQualityRatio * 100)}% of internal anchors are generic or URL-based`,
        finding_detail: `Across ${internalLinks.length} internal anchors: **${generic} generic** (e.g. "click here", "read more"), **${urlBased} URL-based** (raw href as anchor text), **${singleWord} single-word/nav** (e.g. "Home"), **${descriptive} descriptive** (multi-word, content-bearing).\n\nGeneric anchors give Google's link-equity model nothing to work with — descriptive anchors are how internal linking actually transfers topical authority. The industry threshold is ≤40% generic/URL-based; this page is at ${Math.round(lowQualityRatio * 100)}%.${genericExamples.length > 0 ? `\n\n**Examples of generic anchors on this page:** ${genericExamples.map(e => `"${e}"`).join(', ')}` : ''}`,
        recommendation: `Replace the generic anchors with descriptive multi-word phrases that include the target page's topic keyword. E.g. instead of "click here" → "compare Power Apps pricing tiers". Aim for ≥60% descriptive anchors. URL-based anchors (raw href text) should be replaced with human-readable descriptions.`,
        evidence: { internal_links_total: internalLinks.length, generic, url_based: urlBased, single_word: singleWord, descriptive, low_quality_ratio: Number(lowQualityRatio.toFixed(2)) },
        data_source: 'html_fetch',
      });
    } else if (descriptiveRatio > 0.6) {
      findings.push({
        audit_kind: 'internal_links', severity: 'green',
        finding_title: `Anchor-text quality is strong — ${Math.round(descriptiveRatio * 100)}% of internal anchors are descriptive`,
        finding_detail: `Across ${internalLinks.length} internal anchors: ${descriptive} descriptive, ${singleWord} nav/single-word, ${generic} generic, ${urlBased} URL-based. Descriptive anchors transfer topical authority efficiently.`,
        evidence: { internal_links_total: internalLinks.length, generic, url_based: urlBased, single_word: singleWord, descriptive, descriptive_ratio: Number(descriptiveRatio.toFixed(2)) },
        data_source: 'html_fetch',
      });
    } else {
      findings.push({
        audit_kind: 'internal_links', severity: 'info',
        finding_title: `Anchor-text mix: ${descriptive} descriptive, ${singleWord} nav, ${generic} generic, ${urlBased} URL-based`,
        finding_detail: `Across ${internalLinks.length} internal anchors. Below the 40% generic-anchor threshold but room to improve — descriptive multi-word anchors transfer the most topical authority.`,
        evidence: { internal_links_total: internalLinks.length, generic, url_based: urlBased, single_word: singleWord, descriptive },
        data_source: 'html_fetch',
      });
    }
  }

  return findings;
}

/* ════════════════════════════════════════════════════════════════
   CHECK 6: KEYWORD PRESENCE  (Phase 15.2 — Senior DMS uplift 2026-05-24)

   Verifies that the campaign keyword appears in the 5 high-leverage
   on-page locations a senior practitioner would expect:
     1. <title>
     2. <h1>
     3. URL slug
     4. <meta name="description">
     5. First ~120 words of body text

   Severity logic (worst-case dominant):
     • Keyword absent from title AND h1                  → 🔴 RED critical
     • Keyword in title XOR h1, but not both             → 🟡 AMBER
     • Keyword in both title AND h1 but missing elsewhere → 🟡 AMBER (improvable)
     • Full coverage across all 5 locations              → 🟢 GREEN

   Match strengths per location:
     • 'exact'   — full phrase present (case-insensitive, word-bounded)
     • 'full'    — every token of the keyword present (any order, word-bounded)
     • 'partial' — at least one token present (counts as weak match)
     • 'none'    — no token match

   Word-boundary matching plus light pluralization tolerance ("app" matches
   "apps" via simple +s/-s normalization). NOT semantic synonym matching —
   intentional: a Senior DMS wants to see the campaign keyword visible, not
   inferred. If "app maker" is the campaign target and the page says only
   "Power Apps" — that's a real gap, not a synonym match.
═══════════════════════════════════════════════════════════════ */

type KeywordMatchStrength = 'exact' | 'full' | 'partial' | 'none';

interface KeywordCoverageResult {
  location:       'title' | 'h1' | 'url' | 'meta_description' | 'first_paragraph';
  match_strength: KeywordMatchStrength;
  observed:       string;
  matched_tokens: string[];
}

/* Normalize a text fragment for keyword matching: lowercase, strip non-word
   chars, collapse whitespace. */
function normalizeForKeywordMatch(s: string): string {
  return (s || '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Light pluralization: "app" stems against "app" and "apps"; "maker" against
   "maker" and "makers". One-character +s/-s tolerance only — intentionally
   conservative. */
function tokenMatchesWord(token: string, word: string): boolean {
  if (token === word) return true;
  if (token + 's' === word) return true;
  if (token === word + 's') return true;
  return false;
}

function tokenInText(token: string, normalizedText: string): boolean {
  const words = normalizedText.split(' ');
  return words.some(w => tokenMatchesWord(token, w));
}

function classifyKeywordMatch(rawText: string, keyword: string): KeywordMatchStrength {
  if (!rawText) return 'none';
  const text = normalizeForKeywordMatch(rawText);
  const kw   = normalizeForKeywordMatch(keyword);
  if (!text || !kw) return 'none';
  const tokens = kw.split(' ').filter(Boolean);
  if (tokens.length === 0) return 'none';

  /* Exact phrase: kw appears as a contiguous substring on word boundaries. */
  const padded = ' ' + text + ' ';
  if (padded.includes(' ' + kw + ' ')) return 'exact';

  /* Token coverage */
  let hits = 0;
  for (const t of tokens) if (tokenInText(t, text)) hits++;
  if (hits === tokens.length) return 'full';
  if (hits > 0)               return 'partial';
  return 'none';
}

function urlSlug(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname + ' ' + u.search).replace(/[-_/?=&]/g, ' ');
  } catch {
    return url.replace(/[-_/?=&]/g, ' ');
  }
}

function firstParagraphText(html: string, charLimit = 800): string {
  /* Strip script/style first. Look for the FIRST substantive <p>...</p>
     block. Fall back to the first body chunk after the first H1. */
  const cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                      .replace(/<style[\s\S]*?<\/style>/gi, '');
  const pMatches = cleaned.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  for (const block of pMatches) {
    const text = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length >= 60) return text.slice(0, charLimit);  // substantive paragraph found
  }
  /* Fallback: first 800 chars of body text after first H1 */
  const afterH1 = cleaned.split(/<\/h1>/i)[1] || cleaned;
  return afterH1.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, charLimit);
}

/* ═══════════════════════════════════════════════════════════════════
   Phase 15.3 — Senior DMS uplift batch 2 (2026-05-24 PM)
   After deploying the keyword-presence + CTR + query-distribution checks,
   the alphasoftware audit revealed remaining gaps a senior practitioner
   would still call out:
     • First paragraph extracted from the page was a generic product
       tagline, NOT about the page's stated topic → need a topical-relevance
       check that compares first-para vs title+H1.
     • Facebook tracking pixel was being counted as "image missing alt" →
       need to filter known tracking-pixel domains from the alt-text count.
     • When keyword absent AND first paragraph off-topic, the audit's
       recommendation presented two options without making the call →
       need decision-tree logic that picks (b) "change the keyword" when
       the data clearly shows the page targets something else.
═══════════════════════════════════════════════════════════════════ */

const STOPWORDS_FOR_TOPIC_INFERENCE = new Set([
  /* common English stopwords */
  'the', 'and', 'for', 'with', 'this', 'that', 'than', 'then', 'there', 'their', 'they', 'them',
  'will', 'can', 'should', 'would', 'could', 'must', 'may', 'might', 'have', 'has', 'had', 'been',
  'into', 'over', 'under', 'plus', 'minus', 'are', 'was', 'were', 'all', 'any', 'some', 'each',
  'how', 'what', 'why', 'when', 'where', 'who', 'which', 'your', 'about', 'from',
  /* generic web/marketing chrome — these are never meaningful keyword targets,
     and treating them as topic tokens leads to hallucinated keyword
     suggestions like "welcome site" or "home page" */
  'welcome', 'home', 'page', 'site', 'sites', 'website', 'websites', 'webpage',
  'contact', 'about', 'click', 'here', 'read', 'more', 'less', 'learn', 'started',
  'our', 'us', 'we', 'you', 'they', 'them',
  /* generic article/tutorial fillers — useful in titles, useless as keyword targets */
  'comprehensive', 'guide', 'guides', 'tutorial', 'tutorials',
  'step', 'steps', 'instruction', 'instructions', 'method', 'methods',
  'best', 'top', 'free', 'new', 'old', 'good', 'bad', 'big', 'small', 'right', 'left',
  'tips', 'tricks', 'review', 'reviews', 'complete', 'ultimate', 'simple',
  'easy', 'quick', 'introduction', 'overview', 'beginner', 'beginners',
  'reasons', 'ways', 'examples', 'example',
  /* years — never as topic */
  '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028',
]);

/** Compute the fraction of substantive (non-stopword) tokens in `text`
 *  that also appear in `reference`. Used to measure first-paragraph
 *  topical relevance vs title+H1. Returns 0..1. */
function topicalOverlapFraction(text: string, reference: string): number {
  const textTokens = normalizeForKeywordMatch(text).split(' ')
    .filter(t => t.length > 2 && !STOPWORDS_FOR_TOPIC_INFERENCE.has(t));
  if (textTokens.length === 0) return 0;
  const refTokens = new Set(
    normalizeForKeywordMatch(reference).split(' ')
      .filter(t => t.length > 2 && !STOPWORDS_FOR_TOPIC_INFERENCE.has(t))
  );
  if (refTokens.size === 0) return 0;
  /* Count text tokens that have a stem-tolerant match in reference. */
  let hits = 0;
  for (const t of textTokens) {
    for (const r of refTokens) {
      if (tokenMatchesWord(t, r) || tokenMatchesWord(r, t)) { hits++; break; }
    }
  }
  return hits / textTokens.length;
}

/** Infer what topic the page is ACTUALLY built for, based on title + H1
 *  tokens (excluding stopwords and the campaign keyword's own tokens).
 *  Used when the keyword presence check fails — the audit should be able
 *  to say "the page is built for X, not the campaign keyword".
 *
 *  Generality discipline: only fire when we can extract a HIGH-CONFIDENCE
 *  phrase. The picked phrase must (a) come from a consecutive run of >=2
 *  phrase-eligible title tokens, AND (b) the run must contain the FIRST
 *  title-significant token. Reason: in well-formed titles, the topic
 *  appears at the START — qualifiers, audience descriptors, and discourse
 *  markers ("for first-time visitors", "you need to know") appear at
 *  the end. The gate suppresses the worst hallucination mode where the
 *  longest run is grammatically downstream of the actual topic.
 *
 *  When in doubt, return empty — better to make no call than the wrong call.
 */
function inferActualPageTopic(title: string, h1: string, campaignKw: string): {
  significant_tokens: string[];
  suggested_keyword_phrase: string;
} {
  const kwTokens = new Set(normalizeForKeywordMatch(campaignKw).split(' '));
  const isPhraseEligible = (w: string) =>
    w.length >= 3 && !STOPWORDS_FOR_TOPIC_INFERENCE.has(w) && !/^\d+$/.test(w);
  const matchesKwStem = (t: string): boolean => {
    for (const kt of kwTokens) {
      if (tokenMatchesWord(t, kt) || tokenMatchesWord(kt, t)) return true;
    }
    return false;
  };

  /* Collect significant tokens (non-stopword, non-numeric, non-kw-stem).
     Two separate lists — title-only (for the gate + phrase building) and
     combined title+H1 (for display in the recommendation evidence). */
  function collectSignificant(text: string): string[] {
    const tokens = normalizeForKeywordMatch(text).split(' ').filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tokens) {
      if (t.length < 3 || STOPWORDS_FOR_TOPIC_INFERENCE.has(t) || /^\d+$/.test(t)) continue;
      if (matchesKwStem(t)) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }
  const titleSignificant = collectSignificant(title);
  const h1Significant = collectSignificant(h1);
  /* Combined for display, capped at 6 */
  const significant: string[] = [...titleSignificant];
  for (const t of h1Significant) if (!significant.includes(t)) significant.push(t);
  const significantCapped = significant.slice(0, 6);

  /* Phrase building (title only). Walk runs in order; the FIRST run that
     (a) is >=2 phrase-eligible tokens long AND (b) contains the first
     title-significant token wins. Cap at 4 words. */
  const titleWords = normalizeForKeywordMatch(title).split(' ');
  const firstTitleAnchor = titleSignificant[0];
  let suggestedPhrase = '';
  if (firstTitleAnchor) {
    let i = 0;
    while (i < titleWords.length) {
      if (!isPhraseEligible(titleWords[i])) { i++; continue; }
      let j = i;
      while (j < titleWords.length && isPhraseEligible(titleWords[j])) j++;
      /* titleWords[i..j) is a consecutive run of phrase-eligible tokens */
      const run = titleWords.slice(i, j);
      if (run.length >= 2 && run.includes(firstTitleAnchor)) {
        suggestedPhrase = run.slice(0, 4).join(' ');
        break;  /* first qualifying run wins — topics appear at start of titles */
      }
      i = j + 1;
    }
  }
  return { significant_tokens: significantCapped, suggested_keyword_phrase: suggestedPhrase };
}

/** Tracking pixels appear as <img> tags with no alt by design — they are
 *  analytics infrastructure, not content. Counting them as "missing alt"
 *  is noise. Filter known patterns. */
const TRACKING_PIXEL_PATTERNS: RegExp[] = [
  /facebook\.com\/tr/i,
  /pixel\.facebook\.com/i,
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /doubleclick\.net/i,
  /ct\.pinterest\.com/i,
  /analytics\.twitter\.com/i,
  /linkedin\.com\/li[\/.]/i,
  /bat\.bing\.com/i,
  /hotjar\.com/i,
  /amplitude\.com.*\/event/i,
  /segment\.io/i,
  /mixpanel\.com/i,
  /sentry\.io/i,
  /\/pixel[\.\/?]/i,
  /\/__utm/i,
  /\/collect\?/i,
];

function isTrackingPixel(imgTag: string): boolean {
  const srcMatch = /\ssrc=["']([^"']+)["']/i.exec(imgTag);
  if (!srcMatch) return false;
  const src = srcMatch[1];
  /* Tracking pixels typically have width=1 height=1 too — secondary signal */
  const looksLikePixelDimensions = /\swidth=["']?1["']?/i.test(imgTag) && /\sheight=["']?1["']?/i.test(imgTag);
  for (const pat of TRACKING_PIXEL_PATTERNS) {
    if (pat.test(src)) return true;
  }
  if (looksLikePixelDimensions) return true;
  return false;
}

/** New standalone check (Phase 15.3): does the first paragraph of the page
 *  actually relate to the title/H1? Catches the pattern where pages have
 *  templated hero copy (product tagline, generic CTA) that doesn't reflect
 *  the article's stated topic. Independent of campaign keyword. */
async function checkFirstParagraphTopicality(url: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok || !r.html) return findings;
  const html = r.html;
  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const title      = decodeHtmlEntities((titleMatch?.[1]?.trim()) || '');
  const h1Match    = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const h1         = h1Match ? decodeHtmlEntities(h1Match[1].replace(/<[^>]+>/g, '').trim()) : '';
  const firstPara  = firstParagraphText(html);
  if (!title || !firstPara) return findings;
  const reference = title + ' ' + h1;
  const overlap = topicalOverlapFraction(firstPara, reference);
  if (overlap === 0) {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity: 'red',
      finding_title: `First paragraph is off-topic — no overlap with title/H1`,
      finding_detail: `Above-the-fold content shares zero substantive tokens with the page's title or H1. The first paragraph appears to be templated copy (product tagline, generic CTA, marketing hero) rather than content about the page's stated topic.\n\n**First paragraph:** "${firstPara.slice(0, 240)}${firstPara.length > 240 ? '…' : ''}"\n\n**Title:** "${title}"\n**H1:** "${h1}"\n\nGoogle's content-quality models weigh first-paragraph relevance heavily — searchers landing on this page see content that doesn't match what the SERP promised them.`,
      recommendation: `Rewrite the first paragraph to directly address the page's stated topic. Open with the searcher's problem or question, then frame how the page answers it. Do not lead with product taglines or generic marketing copy.`,
      evidence: { overlap_fraction: 0, first_paragraph: firstPara.slice(0, 400), title, h1 },
      data_source: 'html_fetch',
      /* Phase 16.7 — tag for cross-finding convergence detection.
         When THIS plus keyword_mismatch fire together, three independent
         signals all point at "page is mistargeted." */
      signals: ['first_paragraph_off_topic'],
    });
  } else if (overlap < 0.2) {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity: 'amber',
      finding_title: `First paragraph weakly aligned with page topic (${Math.round(overlap * 100)}% token overlap — internal heuristic)`,
      finding_detail: `Above-the-fold content shares only ${Math.round(overlap * 100)}% of its substantive tokens with the title/H1.\n\n> ⚠️ **Metric caveat:** this token-overlap score is an internal heuristic — not a Google metric, not a published SEO standard. It measures whether the same words appear in both the opener and the title, which is a proxy for topical alignment but not a direct measure of quality. A page can score low here and still be excellent if it uses synonyms or addresses a closely related concept.\n\n**First paragraph:** "${firstPara.slice(0, 240)}${firstPara.length > 240 ? '…' : ''}"\n\n**How to evaluate manually:** does the first paragraph immediately address what a searcher typing "${title.slice(0, 60)}" would expect to find? If yes, this flag can be dismissed. If the opener reads like a generic tagline that could apply to any software product, it's worth tightening.`,
      recommendation: `Read the first paragraph as a first-time visitor arriving from the SERP. Does it immediately confirm they're in the right place and answer their core question? If not, rewrite it to lead with the searcher's problem, who this page is for, and what they'll find here — in that order.`,
      evidence: { overlap_fraction: Number(overlap.toFixed(2)), first_paragraph: firstPara.slice(0, 400), metric_type: 'internal_heuristic_not_google_metric' },
      data_source: 'html_fetch',
    });
  } else if (overlap >= 0.4) {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity: 'green',
      finding_title: `First paragraph well-aligned with page topic (${Math.round(overlap * 100)}% token overlap)`,
      finding_detail: `Opening content explicitly addresses the title's topic — strong topical anchor.`,
      evidence: { overlap_fraction: Number(overlap.toFixed(2)) },
      data_source: 'html_fetch',
    });
  }
  return findings;
}

async function checkKeywordPresence(url: string, keyword: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (!keyword || !keyword.trim()) {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity: 'info',
      finding_title: 'Keyword presence check skipped — no campaign keyword set',
      finding_detail: 'Set a target keyword on the campaign so the audit can verify on-page keyword coverage.',
      data_source: 'html_fetch',
    });
    return findings;
  }

  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok || !r.html) return findings;  /* indexability check already flagged this */
  const html = r.html;

  /* Extract the 5 locations.
     Phase 16.3 — decode HTML entities at extraction so the observed
     coverage rows render clean ("&amp;" → "&"). */
  const titleMatch    = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const title         = decodeHtmlEntities((titleMatch?.[1]?.trim()) || '');
  const h1Match       = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const h1            = h1Match ? decodeHtmlEntities(h1Match[1].replace(/<[^>]+>/g, '').trim()) : '';
  const metaDescMatch = /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html);
  const metaDesc      = decodeHtmlEntities((metaDescMatch?.[1]?.trim()) || '');
  const slug          = urlSlug(url);
  const firstPara     = firstParagraphText(html);

  /* Classify each location */
  const coverage: KeywordCoverageResult[] = [
    { location: 'title',            match_strength: classifyKeywordMatch(title,     keyword), observed: title.slice(0, 120),     matched_tokens: [] },
    { location: 'h1',               match_strength: classifyKeywordMatch(h1,        keyword), observed: h1.slice(0, 120),        matched_tokens: [] },
    { location: 'url',              match_strength: classifyKeywordMatch(slug,      keyword), observed: slug.trim().slice(0, 200), matched_tokens: [] },
    { location: 'meta_description', match_strength: classifyKeywordMatch(metaDesc,  keyword), observed: metaDesc.slice(0, 160),  matched_tokens: [] },
    { location: 'first_paragraph',  match_strength: classifyKeywordMatch(firstPara, keyword), observed: firstPara.slice(0, 200), matched_tokens: [] },
  ];

  /* Severity logic — title and H1 dominate */
  const titleMatch_  = coverage[0].match_strength;
  const h1Match_     = coverage[1].match_strength;
  const titleStrong  = titleMatch_ === 'exact' || titleMatch_ === 'full';
  const h1Strong     = h1Match_ === 'exact' || h1Match_ === 'full';
  const titleAnyMatch = titleMatch_ !== 'none';
  const h1AnyMatch    = h1Match_ !== 'none';
  const kwTokens     = normalizeForKeywordMatch(keyword).split(' ').filter(Boolean);
  const multiToken   = kwTokens.length >= 2;
  /* Senior DMS bar: for a multi-token keyword, BOTH title and H1 being
     partial (missing tokens) is a significant alignment failure — the
     page doesn't carry the full keyword phrase anywhere it counts most. */
  const bothPartial  = multiToken && titleMatch_ === 'partial' && h1Match_ === 'partial';

  const otherStrongCount = coverage.slice(2).filter(c => c.match_strength === 'exact' || c.match_strength === 'full').length;

  /* Build a readable coverage table for the finding */
  const tableRows = coverage.map(c => {
    const icon = c.match_strength === 'exact' ? '✅ exact'
              : c.match_strength === 'full'  ? '✅ all tokens'
              : c.match_strength === 'partial' ? '⚠️ partial'
              : '❌ missing';
    return `  • ${c.location.padEnd(18)} → ${icon}  "${c.observed || '(empty)'}"`;
  }).join('\n');

  if (!titleAnyMatch && !h1AnyMatch) {
    /* Phase 15.3 — decision-tree logic. When the keyword is absent from
       title AND H1, AND the first paragraph is also off-topic from the
       campaign keyword, infer what the page IS targeting and make the
       call instead of presenting two neutral options. */
    const firstParaOverlapWithKeyword = topicalOverlapFraction(firstPara, keyword);
    const actualTopic = inferActualPageTopic(title, h1, keyword);
    const makesTheCall = firstParaOverlapWithKeyword < 0.15 && actualTopic.suggested_keyword_phrase;

    const recommendation = makesTheCall
      ? `Change the campaign keyword to "${actualTopic.suggested_keyword_phrase}" (or a close variant).\n\n**Evidence from this page:**\n- Title + H1 significant tokens: ${actualTopic.significant_tokens.slice(0, 5).join(', ')}\n- First paragraph relevance to "${keyword}": ${Math.round(firstParaOverlapWithKeyword * 100)}%\n- This page is built for "${actualTopic.suggested_keyword_phrase}", not "${keyword}".\n\n**Alternative:** if "${keyword}" is strategically more valuable than this page's actual topic, rewrite the title, H1, first paragraph, and opening section to genuinely cover "${keyword}". This is a content overhaul, not an optimization tweak.`
      : `Rewrite the page title and H1 to contain "${keyword}" naturally. If "${keyword}" is genuinely off-topic for this page, the campaign keyword is wrong — recheck whether this URL is the right target.`;

    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'red',
      finding_title:  `Campaign keyword "${keyword}" missing from both title and H1`,
      finding_detail: `The keyword "${keyword}" does not appear in either the page title or the H1 — the two strongest on-page ranking signals. Without explicit keyword presence in title/H1, the page will plateau well below top-3 for this query, regardless of topical relevance elsewhere on the page.\n\nCoverage breakdown:\n${tableRows}`,
      recommendation,
      evidence: { keyword, coverage, normalized_keyword: normalizeForKeywordMatch(keyword), inferred_actual_topic: actualTopic, first_para_keyword_overlap: Number(firstParaOverlapWithKeyword.toFixed(2)) },
      data_source: 'html_fetch',
    });
  } else if (bothPartial) {
    /* Phase 15.3 — same decision-tree for the bothPartial case (alphasoftware).
       Partial in both title AND H1 + first-para off-topic = strong evidence
       the campaign keyword is wrong. */
    const firstParaOverlapWithKeyword = topicalOverlapFraction(firstPara, keyword);
    const actualTopic = inferActualPageTopic(title, h1, keyword);
    const makesTheCall = firstParaOverlapWithKeyword < 0.15 && actualTopic.suggested_keyword_phrase;

    const recommendation = makesTheCall
      ? `Change the campaign keyword to "${actualTopic.suggested_keyword_phrase}" (or a close variant).\n\n**Evidence from this page:**\n- Title + H1 significant tokens: ${actualTopic.significant_tokens.slice(0, 5).join(', ')}\n- First paragraph relevance to "${keyword}": ${Math.round(firstParaOverlapWithKeyword * 100)}%\n- The SERPs for "${keyword}" and "${actualTopic.suggested_keyword_phrase}" are different queries with different competitive sets — this page cannot serve both well.\n\n**Alternative:** if "${keyword}" is strategically more valuable than this page's actual topic, rewrite the title, H1, first paragraph, and opening section to genuinely cover "${keyword}". This is a content overhaul, not a tweak.`
      : `Two paths exist: rewrite the title and H1 to carry the full "${keyword}" phrase naturally if it fits the page intent, OR change the campaign keyword to one that already matches the page's actual content. Don't try to rank a page for a keyword its title/H1 doesn't carry.`;

    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'red',
      finding_title:  `Campaign keyword "${keyword}" only partially present in both title and H1 — significant alignment gap`,
      finding_detail: `Neither the title nor the H1 carries the full keyword phrase. Both have partial token coverage only — some tokens of "${keyword}" appear, others are absent.\n\nCoverage breakdown:\n${tableRows}\n\nThis is a content-strategy mismatch: the page is built for a related but distinct keyword, not the campaign target. Either the page needs rewriting, or the campaign keyword needs reassignment.`,
      recommendation,
      evidence: { keyword, coverage, normalized_keyword: normalizeForKeywordMatch(keyword), missing_tokens_in_title: kwTokens.filter(t => !tokenInText(t, normalizeForKeywordMatch(title))), missing_tokens_in_h1: kwTokens.filter(t => !tokenInText(t, normalizeForKeywordMatch(h1))), inferred_actual_topic: actualTopic, first_para_keyword_overlap: Number(firstParaOverlapWithKeyword.toFixed(2)) },
      data_source: 'html_fetch',
      /* Phase 16.3 — tag for cross-finding reinforcement detection */
      signals: ['keyword_mismatch'],
    });
  } else if (!titleStrong && !h1Strong) {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'amber',
      finding_title:  `Campaign keyword "${keyword}" appears only weakly in title/H1`,
      finding_detail: `The keyword "${keyword}" has only partial token coverage in the title and H1 — close but not the full phrase or all tokens. A clean phrase match in either of these locations correlates strongly with top-3 ranking.\n\nCoverage breakdown:\n${tableRows}`,
      recommendation: `Rewrite the title or H1 to contain the full keyword phrase. Aim for natural placement — Google can detect over-optimization.`,
      evidence: { keyword, coverage },
      data_source: 'html_fetch',
    });
  } else if (!(titleStrong && h1Strong)) {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'amber',
      finding_title:  `Campaign keyword "${keyword}" present in only one of title/H1`,
      finding_detail: `Strong keyword match in ${titleStrong ? 'title' : 'H1'} but not in ${titleStrong ? 'H1' : 'title'}. Both should carry the keyword for maximum signal.\n\nCoverage breakdown:\n${tableRows}`,
      recommendation: `Before changing the ${titleStrong ? 'H1' : 'title'}, run this check first: **open GSC → Performance → Pages → click this URL → look at the Queries tab**. This shows what other keywords this page already gets impressions for. If the current ${titleStrong ? 'H1' : 'title'} contains tokens that match those existing queries, changing it may eliminate those rankings.\n\nIf the existing rankings are negligible (< 50 impressions each), update ${titleStrong ? 'the H1' : 'the title'} to include "${keyword}" naturally. Keep it readable — forced exact-match placements read as spam to users AND Google's quality raters.`,
      evidence: { keyword, coverage },
      data_source: 'html_fetch',
    });
  } else if (otherStrongCount < 2) {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'amber',
      finding_title:  `Keyword "${keyword}" strong in title + H1, but missing from supporting locations`,
      finding_detail: `Title and H1 carry the keyword well — primary signal is intact. Supporting locations (URL, meta description, first paragraph) have weak or no coverage. Each adds incremental ranking + CTR signal.\n\nCoverage breakdown:\n${tableRows}`,
      recommendation: `Aim to include "${keyword}" naturally in the URL slug, meta description, and first paragraph as well.`,
      evidence: { keyword, coverage },
      data_source: 'html_fetch',
    });
  } else {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'green',
      finding_title:  `Keyword "${keyword}" coverage is strong across on-page locations`,
      finding_detail: `Coverage breakdown:\n${tableRows}`,
      evidence: { keyword, coverage },
      data_source: 'html_fetch',
    });
  }

  return findings;
}

/* ════════════════════════════════════════════════════════════════
   CHECK 7: CTR vs EXPECTED-FOR-POSITION  (Phase 15.2 — Senior DMS uplift)

   Compares the audited URL's actual CTR against published CTR benchmarks
   for its position. Significant underperformance (actual < 50% of
   expected) signals a weak title/meta-description even if ranking is OK.
   Significant over-performance signals a strong title (preserve it).

   Benchmark sources (current as of 2025-2026; methodologies vary so the
   table below uses conservative midpoints):
   • AdvancedWebRanking organic CTR study (rolling)
   • Backlinko 2023 large-scale study
   • FirstPageSage 2024 SERP CTR research

   These are AVERAGES across all SERP types — feature-rich SERPs (PAA,
   featured snippets, AI Overview) reduce organic CTR significantly,
   so a finding below expected may also reflect SERP-feature presence
   rather than a title issue. The recommendation acknowledges both.
═══════════════════════════════════════════════════════════════ */

const POSITION_CTR_BENCHMARK: Record<number, number> = {
  1: 28, 2: 15, 3: 10, 4: 7, 5: 5, 6: 4, 7: 3, 8: 2.5, 9: 2, 10: 1.6,
};

function expectedCtrForPosition(position: number): number {
  if (position <= 0)  return 0;
  if (position <= 1)  return POSITION_CTR_BENCHMARK[1];
  if (position >= 11) return 1.0;
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  if (lo === hi) return POSITION_CTR_BENCHMARK[lo];
  const w = position - lo;
  return POSITION_CTR_BENCHMARK[lo] * (1 - w) + POSITION_CTR_BENCHMARK[hi] * w;
}

async function checkCtrVsExpected(url: string, projectId: string, campaignKeyword?: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const { data: pagesRow } = await db().from("project_knowledge")
      .select("field_value").eq("project_id", projectId)
      .eq("category", "analytics").eq("field_key", "gsc_top_pages").maybeSingle();
    if (!pagesRow) return findings;
    const pages = JSON.parse((pagesRow as any).field_value);
    const match = (pages || []).find((p: any) =>
      (p.page || '').replace(/\/$/, '').toLowerCase() === url.replace(/\/$/, '').toLowerCase()
    );
    if (!match) return findings;  /* indexability sub-check D already noted no-GSC-presence */

    const clicks      = Number(match.clicks || 0);
    const impressions = Number(match.impressions || 0);
    const position    = Number(match.position || 0);
    if (impressions < 100 || position <= 0) {
      /* Sample size too small for a credible CTR finding */
      findings.push({
        audit_kind:    'engagement_signals',
        severity:      'info',
        finding_title: `CTR analysis skipped — only ${impressions} impressions on record`,
        finding_detail: `Need ~100+ impressions to make a credible CTR-vs-benchmark comparison. Current sample (${clicks} clicks / ${impressions} impressions / position ${position.toFixed(1)}) is too small.`,
        data_source:   'gsc',
      });
      return findings;
    }
    const actualCtr   = (clicks / impressions) * 100;
    const expectedCtr = expectedCtrForPosition(position);
    const ratio       = expectedCtr > 0 ? (actualCtr / expectedCtr) : 0;

    const detail = `**Actual:** ${clicks} clicks / ${impressions.toLocaleString()} impressions = **${actualCtr.toFixed(2)}% CTR** at average position **${position.toFixed(1)}**.\n\n**Expected at position ${position.toFixed(1)}:** ~${expectedCtr.toFixed(1)}% (benchmark midpoint from AdvancedWebRanking / Backlinko / FirstPageSage).\n\n**Ratio:** actual is **${Math.round(ratio * 100)}%** of expected.`;

    /* Phase 16.1 + 16.2 — SerpAPI enrichment for underperformance cases.
       Phase 16.1 resolved the (a)-or-(b) CTR hypothesis with verified
       SERP feature detection. Phase 16.2 extracts MORE from the same
       SerpAPI call (no additional API spend):

       a) PAA questions verbatim — surface the actual questions so
          content writers can use them as section-heading candidates
          for AI Overview citation optimization.
       b) Top-10 competitor domains — "Competitive landscape" mini-
          section so the operator knows who they're up against.
       c) SERP-position verification — does the audited URL appear in
          the live top-10? If yes, at what position? If GSC says
          position 7.1 but live SERP says position 12, ranking has
          shifted since GSC last updated — surface as a delta.

       All three use data already in the fetched SerpFeatures response. */
    const ctrUnderperforming = ratio < 0.8;
    let serpEnrichment: { detail_addendum: string; recommendation: string } | null = null;
    /* Phase 16.9 — structured SerpAPI evidence captured alongside the text
       enrichment, so the deep-doc renderer can read AI Overview / PAA /
       top-10 / live-position data directly from evidence rather than
       parsing the detail string. */
    let serpEvidence: any = null;
    const ctrSignals: NonNullable<Finding['signals']> = [];
    const ctrEnrichmentSources: NonNullable<Finding['enrichment_sources']> = [];
    /* Always attempt to enrich with SerpAPI — the pre-warm at audit start
       populated the cache so this is a cache hit, not a new API call.
       Previously this was gated behind ctrUnderperforming, which meant
       new pages (0 impressions) never got SERP enrichment. */
    if (campaignKeyword && campaignKeyword.trim()) {
      const serpFeatures = await fetchSerpFeatures(campaignKeyword, projectId);
      if (serpFeatures) {
        const featuresSummary = summarizeSerpFeatures(serpFeatures);
        /* Build the supplementary blocks once — used in both feature-present
           and plain-SERP branches. */
        const buildPaaBlock = (): string => {
          if (!serpFeatures.paa_questions || serpFeatures.paa_questions.length === 0) return '';
          return `\n\n**PAA questions on this SERP** (use as section-heading candidates for content gap closure):\n${serpFeatures.paa_questions.map(q => `- ${q}`).join('\n')}`;
        };
        const buildCompetitorBlock = (): string => {
          if (!serpFeatures.top_10_domains || serpFeatures.top_10_domains.length === 0) return '';
          return `\n\n**Competitive landscape (live top-10 domains for "${campaignKeyword}"):** ${serpFeatures.top_10_domains.slice(0, 10).map(d => `\`${d}\``).join(', ')}`;
        };
        const buildPositionBlock = (): string => {
          /* Find if the audited URL appears in the live top-100. Phase 16.3
             upgraded from num=10 to num=100 — exact position 1-100 is now
             reportable, vs old binary "in top-10 or not." */
          const normalizedAudited = url.replace(/\/$/, '').toLowerCase();
          /* Prefer top_100_urls when available (Phase 16.3); fall back to
             top_10_urls for any cached entries that pre-date the bump. */
          const liveUrls = (Array.isArray(serpFeatures.top_100_urls) && serpFeatures.top_100_urls.length > 0)
            ? serpFeatures.top_100_urls
            : serpFeatures.top_10_urls;
          const depthLabel = (Array.isArray(serpFeatures.top_100_urls) && serpFeatures.top_100_urls.length > 0)
            ? 'top-100' : 'top-10';
          let livePosition: number | null = null;
          for (let i = 0; i < liveUrls.length; i++) {
            const u = (liveUrls[i] || '').replace(/\/$/, '').toLowerCase();
            if (u === normalizedAudited) {
              livePosition = i + 1;
              break;
            }
          }
          if (livePosition === null) {
            /* Audited URL not in top-100 (or top-10 for legacy cache) */
            const cutoff = depthLabel === 'top-100' ? '100+' : '11+';
            return `\n\n**Live SERP position check:** the audited URL does NOT appear in the live ${depthLabel} for "${campaignKeyword}". GSC reports average position ${position.toFixed(1)} (aggregated across queries and time); the live SERP for the campaign keyword specifically has this URL at position ${cutoff}. The GSC average is therefore driven by other queries — see GSC query distribution finding for which queries actually rank this URL.`;
          }
          const gscLive = Math.abs(livePosition - position);
          if (gscLive >= 3) {
            return `\n\n**Live SERP position check:** the audited URL ranks at live position **${livePosition}** for "${campaignKeyword}" — GSC reports average position **${position.toFixed(1)}**. A delta of **${gscLive.toFixed(1)} positions** suggests ranking has shifted since GSC's last data window (GSC typically lags 2-3 days). Worth re-running GSC freshness pull to confirm the trend.`;
          }
          return `\n\n**Live SERP position check:** the audited URL ranks at live position **${livePosition}** for "${campaignKeyword}", consistent with GSC's average of **${position.toFixed(1)}**. Position is stable across data windows.`;
        };
        /* Phase 16.3 — detect url_not_in_top_10 signal here so the
           outer finding-push can tag it without re-running the loop. */
        const normalizedAudited = url.replace(/\/$/, '').toLowerCase();
        const liveUrlsForSignal = (Array.isArray(serpFeatures.top_100_urls) && serpFeatures.top_100_urls.length > 0)
          ? serpFeatures.top_100_urls
          : serpFeatures.top_10_urls;
        let urlInTop10 = false;
        for (let i = 0; i < Math.min(10, liveUrlsForSignal.length); i++) {
          const u = (liveUrlsForSignal[i] || '').replace(/\/$/, '').toLowerCase();
          if (u === normalizedAudited) { urlInTop10 = true; break; }
        }
        if (!urlInTop10) ctrSignals.push('url_not_in_top_10');
        const paaBlock         = buildPaaBlock();
        const competitorBlock  = buildCompetitorBlock();
        const positionBlock    = buildPositionBlock();
        const cacheNote        = serpFeatures.cache_hit ? '_(SERP features cached within last 7 days)_' : '_(Fresh SERP fetch)_';

        /* Phase 16.9 — structured SerpAPI evidence for the deep-doc renderer.
           Captures the same data that lives in detail-string addendums above,
           but in a programmatically-accessible shape. live_position is null
           when the URL is outside the live top-100 (or top-10 for legacy
           cache entries). */
        {
          const audited = url.replace(/\/$/, '').toLowerCase();
          const urls = (Array.isArray(serpFeatures.top_100_urls) && serpFeatures.top_100_urls.length > 0)
            ? serpFeatures.top_100_urls : serpFeatures.top_10_urls;
          let livePos: number | null = null;
          for (let i = 0; i < urls.length; i++) {
            if ((urls[i] || '').replace(/\/$/, '').toLowerCase() === audited) { livePos = i + 1; break; }
          }
          serpEvidence = {
            ai_overview:             !!serpFeatures.ai_overview,
            featured_snippet:        !!serpFeatures.featured_snippet,
            featured_snippet_owner:  serpFeatures.featured_snippet_owner || null,
            paa_count:               Array.isArray(serpFeatures.paa_questions) ? serpFeatures.paa_questions.length : 0,
            paa_questions:           Array.isArray(serpFeatures.paa_questions) ? serpFeatures.paa_questions : [],
            ads_top:                 serpFeatures.ads_top || 0,
            ads_bottom:              serpFeatures.ads_bottom || 0,
            top_10_domains:          Array.isArray(serpFeatures.top_10_domains) ? serpFeatures.top_10_domains : [],
            top_10_urls:             Array.isArray(serpFeatures.top_10_urls) ? serpFeatures.top_10_urls : [],
            top_100_domains:         Array.isArray(serpFeatures.top_100_domains) ? serpFeatures.top_100_domains : [],
            top_100_urls:            Array.isArray(serpFeatures.top_100_urls) ? serpFeatures.top_100_urls : [],
            live_position:           livePos,
            in_live_top_10:          urlInTop10,
            in_live_top_100:         livePos !== null,
            cache_hit:               !!serpFeatures.cache_hit,
          };
        }

        if (featuresSummary) {
          /* SERP has notable features siphoning organic CTR */
          const detail_addendum = `\n\n**SerpAPI verification — what's actually on the SERP for "${campaignKeyword}":**\n- ${featuresSummary}${paaBlock}${competitorBlock}${positionBlock}\n\n${cacheNote}`;
          /* Tailor recommendation based on dominant feature */
          let rec = '';
          if (serpFeatures.ai_overview) {
            rec = `**Optimize for AI Overview citation, not just position.** With an AI Overview present, top-3 organic positions can lose 30-50% of clicks to the AI summary. Tactics: (1) answer the query in 40-60 words within the first paragraph (citation candidate), (2) ensure FAQPage or HowTo schema is valid and matches visible content, (3) cite authoritative external sources Google's models trust (for SaaS pricing topics: official vendor docs, Gartner, G2 reviews), (4) structure key facts as scannable lists, (5) add H2 sections that answer the PAA questions listed above verbatim — these often surface as AI Overview citation candidates.`;
          } else if (serpFeatures.featured_snippet && serpFeatures.featured_snippet_owner) {
            rec = `**A competitor (\`${serpFeatures.featured_snippet_owner}\`) owns the featured snippet** — target that snippet. Write a concise 40-60 word direct answer to the query, placed within the first 100 words of the page, in the snippet format Google extracts (paragraph for "what is", numbered list for "how to", table for comparisons). Then rewrite the title/meta as the secondary lift.`;
          } else if (serpFeatures.featured_snippet) {
            rec = `**Featured snippet is captured by an unknown owner** — write a concise 40-60 word direct answer to the query within the first 100 words of the page, formatted in the structure Google extracts. This is the highest-leverage SERP real estate.`;
          } else if (serpFeatures.ads_top >= 3) {
            rec = `**Heavy paid placement (${serpFeatures.ads_top} top ads) is compressing organic visibility.** Title/meta clarity matters even more — front-load the differentiator that paid ads typically don't offer (expertise depth, real numbers, original research). Consider whether the keyword is fundamentally commercial-search territory where SEO economics are unfavorable.`;
          } else {
            /* Some features present but none dominant — generic SERP-aware advice */
            rec = `Rewrite the title and meta description for click appeal — front-load the benefit, include a number or specific outcome, and ensure the keyword sits at the start. The SERP features listed above are also pulling attention; consider whether structured-data + answer-first content could win those positions too.`;
          }
          serpEnrichment = { detail_addendum, recommendation: rec };
        } else {
          /* SerpAPI succeeded but found no notable features — the SERP
             is plain organic. That MEANS the CTR problem really IS the
             title/meta. Tighten recommendation accordingly. PAA, competitor
             landscape, and position blocks still surface (they're not
             "features" but they're still useful intel). */
          serpEnrichment = {
            detail_addendum: `\n\n**SerpAPI verification — what's actually on the SERP for "${campaignKeyword}":** plain organic SERP — no AI Overview, no featured snippet, no PAA box, no heavy ad density. The CTR gap is NOT caused by SERP features.${paaBlock}${competitorBlock}${positionBlock}\n\n${cacheNote}`,
            recommendation: `**The SERP has no features siphoning clicks — the title/meta is the actual problem.** Rewrite the title and meta description for click appeal: front-load the benefit, include a number or specific outcome, ensure the keyword sits at the start. Don't waste effort optimizing for snippets/AI Overview that aren't on this SERP.`,
          };
        }
      }
    }

    if (ratio < 0.5) {
      /* Phase 16.3 — business-impact translation appended after the
         SerpAPI enrichment for Critical findings.
         Phase 16.9 — refactored to return both markdown + structured;
         the structured data now flows into evidence for the renderer. */
      const businessImpact = computeBusinessImpact({
        impressions,
        actual_ctr_pct: actualCtr,
        expected_ctr_pct: expectedCtr,
        actual_clicks: clicks,
      });
      const baseDetail = detail + `\n\nThis is a major underperformance signal. ${serpEnrichment ? '' : 'Either (a) the title/meta description is uncompelling at the SERP, or (b) the SERP for this query is dominated by features (AI Overview, featured snippet, PAA) that suppress organic CTR. Both are addressable.'}`;
      /* Phase 16.3 — record SerpAPI as enrichment source when it fired */
      if (serpEnrichment) ctrEnrichmentSources.push('serpapi');
      findings.push({
        audit_kind: 'engagement_signals',
        severity:   'red',
        finding_title:  `CTR is ${Math.round(ratio * 100)}% of expected for position ${position.toFixed(1)} — significant underperformance`,
        finding_detail: baseDetail + (serpEnrichment?.detail_addendum || '') + businessImpact.markdown,
        recommendation: serpEnrichment?.recommendation || `Rewrite the title and meta description for click appeal — front-load the benefit, include a number or specific outcome, and ensure the keyword sits at the start. Then check the live SERP for features that may be siphoning clicks. _To have the platform verify SERP features automatically on every audit, set the \`SERPAPI_KEY\` environment variable on Vercel — applies to all projects, current and future._`,
        evidence: {
          actual_ctr_pct: Number(actualCtr.toFixed(2)),
          expected_ctr_pct: Number(expectedCtr.toFixed(1)),
          position, clicks, impressions,
          ratio_pct: Math.round(ratio * 100),
          serp_verified: !!serpEnrichment,
          ...(serpEvidence || {}),
          ...(businessImpact.structured ? { business_impact: businessImpact.structured } : {}),
        },
        data_source: 'gsc',
        enrichment_sources: ctrEnrichmentSources.length > 0 ? [...ctrEnrichmentSources] : undefined,
        signals: ctrSignals.length > 0 ? [...ctrSignals] : undefined,
      });
    } else if (ratio < 0.8) {
      const businessImpact = computeBusinessImpact({
        impressions,
        actual_ctr_pct: actualCtr,
        expected_ctr_pct: expectedCtr,
        actual_clicks: clicks,
      });
      const baseDetail = detail + `\n\nNot critical, but a clearer title or stronger meta description could earn measurably more clicks at this position.`;
      if (serpEnrichment) ctrEnrichmentSources.push('serpapi');
      findings.push({
        audit_kind: 'engagement_signals',
        severity:   'amber',
        finding_title:  `CTR is ${Math.round(ratio * 100)}% of expected for position ${position.toFixed(1)} — mild underperformance`,
        finding_detail: baseDetail + (serpEnrichment?.detail_addendum || '') + businessImpact.markdown,
        recommendation: serpEnrichment?.recommendation || `A/B candidates: lead the title with the searcher's intent verb, include a specific year/number for freshness, add a clear value proposition in the meta description.`,
        evidence: {
          actual_ctr_pct: Number(actualCtr.toFixed(2)),
          expected_ctr_pct: Number(expectedCtr.toFixed(1)),
          position, clicks, impressions,
          ratio_pct: Math.round(ratio * 100),
          serp_verified: !!serpEnrichment,
          ...(serpEvidence || {}),
          ...(businessImpact.structured ? { business_impact: businessImpact.structured } : {}),
        },
        data_source: 'gsc',
        enrichment_sources: ctrEnrichmentSources.length > 0 ? [...ctrEnrichmentSources] : undefined,
        signals: ctrSignals.length > 0 ? [...ctrSignals] : undefined,
      });
    } else if (ratio > 1.3) {
      findings.push({
        audit_kind: 'engagement_signals',
        severity:   'green',
        finding_title:  `CTR is ${Math.round(ratio * 100)}% of expected — strong title/snippet performance`,
        finding_detail: detail + `\n\nThe title and meta description are out-performing the position. Preserve the structure; replicate the pattern across similar pages.`,
        evidence: { actual_ctr_pct: Number(actualCtr.toFixed(2)), expected_ctr_pct: Number(expectedCtr.toFixed(1)), position, clicks, impressions, ratio_pct: Math.round(ratio * 100) },
        data_source: 'gsc',
      });
    } else {
      findings.push({
        audit_kind: 'engagement_signals',
        severity:   'green',
        finding_title:  `CTR is in line with expected for position ${position.toFixed(1)}`,
        finding_detail: detail,
        evidence: { actual_ctr_pct: Number(actualCtr.toFixed(2)), expected_ctr_pct: Number(expectedCtr.toFixed(1)), position, clicks, impressions, ratio_pct: Math.round(ratio * 100) },
        data_source: 'gsc',
      });
    }
  } catch (e: any) {
    /* GSC data unavailable or parse error — skip silently; the upstream
       indexability sub-check already flagged any GSC absence. */
  }
  return findings;
}

/* ════════════════════════════════════════════════════════════════
   CHECK 8: GSC QUERY DISTRIBUTION for the audited URL
   (Phase 15.2 — Senior DMS uplift; uses gsc_query_page_pairs persisted
   by pm-gsc.ts since 2026-05-24)

   Surfaces the top queries this specific URL ranks for. Reveals:
     • Whether the campaign keyword is even in the top-10 queries
     • Distribution of query intent (informational vs commercial)
     • Per-query CTR (highlights titles that don't speak to the query)
═══════════════════════════════════════════════════════════════ */

async function checkQueryDistribution(url: string, projectId: string, keyword: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const { data: pairsRow } = await db().from("project_knowledge")
      .select("field_value").eq("project_id", projectId)
      .eq("category", "analytics").eq("field_key", "gsc_query_page_pairs").maybeSingle();
    if (!pairsRow) {
      findings.push({
        audit_kind: 'on_page_fundamentals',
        severity:   'info',
        finding_title:  'Query distribution data not yet available',
        finding_detail: 'GSC query×page dimension pairs are pulled by the 6am UTC cron. After the next cron tick (or a manual GSC refresh), this check will surface the top queries this URL actually ranks for.',
        data_source: 'gsc',
      });
      return findings;
    }
    const allPairs: Array<{ query: string; page: string; clicks: number; impressions: number; position: number }> =
      JSON.parse((pairsRow as any).field_value) || [];
    const normUrl = url.replace(/\/$/, '').toLowerCase();
    const forUrl = allPairs
      .filter(p => (p.page || '').replace(/\/$/, '').toLowerCase() === normUrl)
      .sort((a, b) => b.impressions - a.impressions);

    if (forUrl.length === 0) {
      findings.push({
        audit_kind: 'on_page_fundamentals',
        severity:   'info',
        finding_title:  'No query×page data for this URL yet',
        finding_detail: 'GSC has not returned query×page pairs for this URL in the audit window. The page may have very low impressions, or GSC may not yet have surfaced it in the paired dataset.',
        data_source: 'gsc',
      });
      return findings;
    }

    const top = forUrl.slice(0, 10);
    const totalImpr = top.reduce((s, q) => s + (q.impressions || 0), 0);
    const totalClicks = top.reduce((s, q) => s + (q.clicks || 0), 0);

    /* Does the campaign keyword appear in the top-10 queries? */
    const kwNorm = normalizeForKeywordMatch(keyword || '');
    const keywordInTop10 = kwNorm
      ? top.some(q => classifyKeywordMatch(q.query || '', keyword) === 'exact' || classifyKeywordMatch(q.query || '', keyword) === 'full')
      : null;

    const queryLines = top.map((q, i) => {
      const ctr = q.impressions > 0 ? ((q.clicks / q.impressions) * 100).toFixed(2) : '0.00';
      const match = kwNorm ? classifyKeywordMatch(q.query, keyword) : 'none';
      const matchIcon = match === 'exact' ? ' 🎯' : match === 'full' ? ' ✓' : match === 'partial' ? ' ~' : '';
      return `${(i+1).toString().padStart(2, ' ')}. "${q.query}"${matchIcon} · pos ${q.position.toFixed(1)} · ${q.impressions.toLocaleString()} impr · ${q.clicks} clicks · ${ctr}% CTR`;
    }).join('\n');

    if (keywordInTop10 === false && kwNorm) {
      findings.push({
        audit_kind: 'on_page_fundamentals',
        severity:   'amber',
        finding_title:  `Campaign keyword "${keyword}" is NOT in this URL's top-10 actual queries`,
        finding_detail: `GSC reports this URL ranks for ${forUrl.length} distinct queries. None of the top 10 by impressions match "${keyword}". The page is ranking for adjacent/related terms, not the campaign target.\n\nTop 10 queries for this URL:\n${queryLines}\n\nTotal: ${totalImpr.toLocaleString()} impressions, ${totalClicks} clicks across top 10.`,
        recommendation: `Two options: (a) Re-target this campaign to the keyword that actually carries traffic on this page, or (b) revise the page content to align stronger with "${keyword}" (title, H1, body, intent).`,
        evidence: { keyword, top_queries: top, total_queries: forUrl.length },
        data_source: 'gsc',
      });
    } else {
      findings.push({
        audit_kind: 'on_page_fundamentals',
        severity:   keywordInTop10 ? 'green' : 'info',
        finding_title:  keywordInTop10
          ? `Campaign keyword found in this URL's top queries`
          : `Top queries this URL ranks for`,
        finding_detail: `GSC reports ${forUrl.length} distinct queries for this URL.\n\nTop 10 by impressions:\n${queryLines}\n\nTotal: ${totalImpr.toLocaleString()} impressions, ${totalClicks} clicks across top 10.`,
        evidence: { keyword, top_queries: top, total_queries: forUrl.length, keyword_in_top10: keywordInTop10 },
        data_source: 'gsc',
      });
    }
  } catch (e: any) {
    /* Skip silently if the data is unparseable */
  }
  return findings;
}

/* ════════════════════════════════════════════════════════════════
   CHECK 3: CORE WEB VITALS via PageSpeed Insights API
═══════════════════════════════════════════════════════════════ */

async function checkCoreWebVitals(url: string, projectId: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  /* Look up PSI API key — project-level first, then platform-wide env var.
     Platform-wide: set PAGESPEED_API_KEY in Vercel env → one key for all projects. */
  const { data: psiInt } = await db().from("project_integrations")
    .select("api_key, status").eq("project_id", projectId).eq("provider", 'pagespeed').maybeSingle();
  const apiKey: string | undefined =
    (psiInt as any)?.api_key ||
    (process.env.PAGESPEED_API_KEY || '').trim() ||
    undefined;

  /* Call PSI mobile + desktop in parallel */
  const psiUrl = (strategy: 'mobile' | 'desktop') => {
    const u = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    u.searchParams.set('url', url);
    u.searchParams.set('strategy', strategy);
    u.searchParams.append('category', 'PERFORMANCE');
    if (apiKey) u.searchParams.set('key', apiKey);
    return u.toString();
  };

  const fetchPsi = async (strategy: 'mobile' | 'desktop') => {
    try {
      const res = await fetch(psiUrl(strategy), { signal: AbortSignal.timeout(45000) });
      if (!res.ok) throw new Error(`PSI ${strategy} HTTP ${res.status}`);
      const data = await res.json();
      const audits = data?.lighthouseResult?.audits || {};
      const cruxMetrics = data?.loadingExperience?.metrics || {};
      return {
        strategy,
        lcp_ms:    audits['largest-contentful-paint']?.numericValue,
        cls:       audits['cumulative-layout-shift']?.numericValue,
        inp_ms:    audits['interaction-to-next-paint']?.numericValue,
        tbt_ms:    audits['total-blocking-time']?.numericValue,
        ttfb_ms:   audits['server-response-time']?.numericValue,
        fcp_ms:    audits['first-contentful-paint']?.numericValue,
        lcp_element: audits['largest-contentful-paint-element']?.details?.items?.[0]?.node?.nodeLabel || null,
        lcp_element_type: audits['largest-contentful-paint-element']?.details?.items?.[0]?.node?.type || null,
        perf_score: data?.lighthouseResult?.categories?.performance?.score,
        crux_lcp:  cruxMetrics?.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
        crux_inp:  cruxMetrics?.INTERACTION_TO_NEXT_PAINT?.percentile,
        crux_cls:  cruxMetrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile,
        crux_lcp_category: cruxMetrics?.LARGEST_CONTENTFUL_PAINT_MS?.category,
      };
    } catch (e: any) {
      return { strategy, error: e?.message || 'PSI fetch failed' } as any;
    }
  };

  const [mobile, desktop] = await Promise.all([fetchPsi('mobile'), fetchPsi('desktop')]);

  if (mobile.error && desktop.error) {
    findings.push({
      audit_kind: 'core_web_vitals', severity: 'amber',
      finding_title:  'PageSpeed Insights API failed for both strategies',
      finding_detail: `mobile: ${mobile.error}\ndesktop: ${desktop.error}`,
      recommendation: apiKey ? `Verify your PSI API key is valid.` : `Get a free PSI key at https://developers.google.com/speed/docs/insights/v5/get-started, then add it to the database: \`INSERT INTO project_integrations (project_id, provider, api_key, status) VALUES ('<project_id>', 'pagespeed', '<key>', 'connected');\`. _(A platform-wide env-var fallback for PSI — matching the SerpAPI pattern — is on the backlog so a single key serves all projects.)_`,
      data_source: 'psi',
    });
    return findings;
  }

  /* Evaluate mobile (Google primarily uses mobile-first CWV for ranking) */
  for (const m of [mobile, desktop]) {
    if (m.error) continue;
    const strat = m.strategy;
    const isFromCrux = !!m.crux_lcp;

    if (m.lcp_ms !== undefined && m.lcp_ms !== null) {
      const sev: 'green'|'amber'|'red' = m.lcp_ms < 2500 ? 'green' : m.lcp_ms < 4000 ? 'amber' : 'red';
      const lcpSec    = (m.lcp_ms / 1000).toFixed(2);
      const ma        = m as any;
      const lcpEl     = ma.lcp_element || null;
      const ttfbMs    = ma.ttfb_ms    || null;
      const fcpMs     = ma.fcp_ms     || null;
      const tbtMs     = ma.tbt_ms     || null;
      const ttfbNote  = ttfbMs ? `\n- **TTFB (Server Response Time):** ${Math.round(ttfbMs)}ms${ttfbMs > 600 ? ' ← slow server; fix this first before optimising elements' : ''}` : '';
      const fcpNote   = fcpMs  ? `\n- **FCP (First Contentful Paint):** ${(fcpMs / 1000).toFixed(2)}s` : '';
      const lcpElNote = lcpEl  ? `\n- **LCP element:** ${lcpEl} — optimise this specific element first` : '';
      const tbtNote   = tbtMs  ? `\n- **TBT (Total Blocking Time):** ${Math.round(tbtMs)}ms${tbtMs > 300 ? ' ← significant JS blocking; main thread needs work' : ''}` : '';
      const severeNote = m.lcp_ms > 8000 ? `\n\n⚠️ **At ${lcpSec}s, most mobile users abandon before the page loads.** This is a critical UX failure, not an optimisation task. No content change, H1 rewrite, or schema work will produce ranking results until this is resolved.` : '';
      const lcpDetail = `Largest Contentful Paint measures how long the main content takes to render for real users. Google's thresholds: <2.5s good, 2.5-4s needs improvement, >4s poor. Data source: ${isFromCrux ? 'Chrome User Experience (real-user 75th percentile)' : 'Lighthouse lab test'}.${severeNote}\n\n**Diagnostic breakdown:**${lcpElNote}${ttfbNote}${fcpNote}${tbtNote}`;
      const lcpElNote10 = lcpEl
        ? `the LCP element is "${lcpEl}"`
        : `the LCP element could not be identified automatically — run Chrome DevTools → Performance tab → record a page load → look for the largest paint event, OR open PageSpeed Insights and inspect the "Largest Contentful Paint element" diagnostic`;
      const lcpRec = sev === 'green' ? undefined
        : ttfbMs && ttfbMs > 600
          ? `TTFB is ${Math.round(ttfbMs)}ms — the server is slow before any rendering begins. Fix TTFB first: check hosting and CDN configuration, enable full-page caching where possible, reduce server-side rendering time. After TTFB is below 600ms, re-audit to isolate the next bottleneck.`
          : `Identify and optimise the LCP element (${lcpElNote10}). Priority actions: (1) compress to <200KB if an image, (2) add \`fetchpriority="high"\` to the element, (3) ensure it is NOT lazy-loaded, (4) inline critical CSS that controls its render, (5) check for render-blocking scripts above it in the DOM.`;
      findings.push({
        audit_kind: 'core_web_vitals', severity: sev,
        finding_title:  `${strat.toUpperCase()} LCP: ${lcpSec}s ${sev === 'red' ? '— exceeds the 4s threshold' : sev === 'amber' ? '— above the 2.5s target' : '— within target'}`,
        finding_detail: lcpDetail,
        recommendation: lcpRec,
        evidence: { strategy: strat, lcp_ms: m.lcp_ms, ttfb_ms: ttfbMs, fcp_ms: fcpMs, tbt_ms: tbtMs, lcp_element: lcpEl, source: isFromCrux ? 'crux' : 'lab' },
        data_source: 'psi',
      });
    }

    /* INP — use CrUX field data when available (real-user 75th-pct), fall back
       to lab data. CrUX INP reflects actual device conditions; lab data is on
       a controlled mid-tier device and may over or understate real-user pain. */
    const inpMs = m.crux_inp ?? m.inp_ms;
    const inpSource = m.crux_inp !== undefined ? 'crux' : 'lab';
    if (inpMs !== undefined && inpMs !== null) {
      const sev: 'green'|'amber'|'red' = inpMs < 200 ? 'green' : inpMs < 500 ? 'amber' : 'red';
      findings.push({
        audit_kind: 'core_web_vitals', severity: sev,
        finding_title:  `${strat.toUpperCase()} INP: ${Math.round(inpMs)}ms ${sev === 'red' ? '— interactions feel sluggish (users notice delays)' : sev === 'amber' ? '— noticeable delay on interaction' : '— responsive'}`,
        finding_detail: `Interaction to Next Paint measures the delay between a user interaction (click, tap, key press) and the next visual response. Google replaced FID with INP as a Core Web Vital in March 2024. Thresholds: <200ms good, 200-500ms needs improvement, >500ms poor. Data source: ${inpSource === 'crux' ? 'Chrome User Experience (real-user data at 75th percentile).' : 'Lighthouse lab test (controlled device — may not reflect real-user conditions).'}`,
        recommendation: sev === 'green' ? undefined : `Reduce main-thread blocking JavaScript. Audit with Chrome DevTools → Performance panel → look for Long Tasks (>50ms) blocking the main thread on interaction. Specific fixes: defer non-critical third-party scripts, break up long event handlers with scheduler.yield(), use web workers for heavy computation off the main thread.`,
        evidence: { strategy: strat, inp_ms: inpMs, source: inpSource },
        data_source: 'psi',
      });
    }

    if (m.cls !== undefined && m.cls !== null) {
      const sev: 'green'|'amber'|'red' = m.cls < 0.1 ? 'green' : m.cls < 0.25 ? 'amber' : 'red';
      findings.push({
        audit_kind: 'core_web_vitals', severity: sev,
        finding_title:  `${strat.toUpperCase()} CLS: ${(m as any).cls.toFixed(3)} ${sev === 'red' ? '— elements shift significantly during load' : sev === 'amber' ? '— some layout shifts' : '— stable layout'}`,
        finding_detail: 'Cumulative Layout Shift measures visual stability. Thresholds: <0.1 good, 0.1-0.25 needs improvement, >0.25 poor.',
        recommendation: sev === 'green' ? undefined : 'Set explicit width+height on images and embeds. Avoid injecting content above existing content. Preload web fonts.',
        evidence: { strategy: strat, cls: m.cls },
        data_source: 'psi',
      });
    }
    /* TBT — Total Blocking Time is not a Core Web Vital ranking signal but
       is the strongest predictor of interactivity problems and directly
       indicates the same JS-blocking issue that causes mobile LCP failures.
       Surface it as amber when > 300ms regardless of LCP pass/fail,
       so desktop TBT problems are not silently buried in a green LCP finding. */
    const tbtMs10 = (m as any).tbt_ms;
    if (tbtMs10 !== undefined && tbtMs10 !== null && tbtMs10 > 300) {
      const tbtSev: 'amber'|'red' = tbtMs10 > 600 ? 'red' : 'amber';
      findings.push({
        audit_kind: 'core_web_vitals', severity: tbtSev,
        finding_title:  `${strat.toUpperCase()} TBT: ${Math.round(tbtMs10)}ms — ${tbtSev === 'red' ? 'severe JavaScript main-thread blocking' : 'significant JavaScript main-thread blocking'}`,
        finding_detail: `Total Blocking Time measures how long the main thread is blocked by JavaScript during page load. TBT is not a Core Web Vital ranking signal, but it is the strongest lab-data proxy for INP and real-world interactivity — a high TBT means every user interaction in the first ~${Math.round(tbtMs10 / 1000 + 1)}s of page load will feel slow. Google's Lighthouse considers >300ms "needs improvement"; >600ms "poor".

> **Connection to mobile LCP:** the same JavaScript bundles that produce TBT ${Math.round(tbtMs10)}ms on desktop are causing the render-blocking behaviour measured in the mobile LCP finding. Fixing the JS blocking (T1.1–T1.2 in §7) will improve both desktop TBT and mobile LCP simultaneously.`,
        recommendation: `Profile the main thread: open Chrome DevTools → Performance tab → record a cold page load → look for Long Tasks (red bars) in the main thread. Identify the largest blocking scripts. Common sources: large monolithic JS bundles, synchronous third-party analytics or chat widgets, render-blocking CSS-in-JS. Defer non-critical scripts with \`defer\` / \`async\`; split large bundles; lazy-load below-fold components.`,
        evidence: { strategy: strat, tbt_ms: tbtMs10, source: 'lab' },
        data_source: 'psi',
      });
    }
  }

  if (!apiKey) {
    findings.push({
      audit_kind: 'core_web_vitals', severity: 'info',
      finding_title:  'No PageSpeed Insights API key configured',
      finding_detail: 'CWV checks ran without an API key. PSI rate-limits keyless requests; future audits may fail or return cached data.',
      recommendation: 'Get a free PSI key at https://developers.google.com/speed/docs/insights/v5/get-started, then INSERT it into the project_integrations table with provider=pagespeed. (A SERPAPI-style env-var fallback is on the backlog so one key serves all projects.)',
      data_source: 'psi',
    });
  }

  return findings;
}

/* ════════════════════════════════════════════════════════════════
   CHECK 4: ENGAGEMENT SIGNALS (GA4 site-wide)
═══════════════════════════════════════════════════════════════ */

async function checkEngagementSignals(url: string, projectId: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  /* Phase 16.5 — Tier 2: per-page GA4 FIRST. When successful, this
     replaces the site-wide hedge with real per-URL engagement data —
     the most-flagged role-lens gap is finally closed. Falls back to
     site-wide aggregates from project_knowledge when per-page returns
     null (no GA4 connection, no resource_id, no rows for this pagePath,
     or fetch failure). */
  let pagePath = '';
  try {
    pagePath = new URL(url).pathname || '/';
  } catch { /* invalid URL — fall through to site-wide */ }

  if (pagePath) {
    const perPage = await ga4PullPageMetrics({ projectId, pagePath, days: 28 });
    /* If per-page GA4 returns null it means: integration not connected,
       no resource_id on the integration row, token refresh failed, or
       the page genuinely has 0 sessions in the last 28 days.
       We add an explicit finding so the audit explains the gap. */
    if (!perPage) {
      findings.push({
        audit_kind: 'engagement_signals', severity: 'amber',
        finding_title: `GA4 per-page data unavailable for ${pagePath}`,
        finding_detail: `The GA4 integration is connected but returned no data for \`${pagePath}\` in the last 28 days. Possible reasons:\n\n1. **Page has no GA4 traffic yet** — if the page was recently created or hasn't been indexed, there are no sessions to report. This is normal for new pages.\n2. **GA4 pagePath mismatch** — GA4 may track the URL differently (e.g., with a trailing slash, query params, or a redirected path). Check GA4 → Reports → Engagement → Pages and scroll to find this URL.\n3. **GA4 token expired** — if the OAuth token needs refresh, disconnect and reconnect GA4 in the Integrations panel.\n\nSite-wide engagement data (if available) is shown below.`,
        recommendation: `Check GA4 → Reports → Engagement → Pages for \`${pagePath}\`. If the page appears with a different path format, note that for the next audit. If GA4 token issues persist, reconnect GA4 in PM Module → project → Requirements → Integrations.`,
        data_source: 'ga4',
      });
    }
    if (perPage && perPage.sessions > 0) {
      /* Minimum sample size for a reliable engagement verdict.
         Below 50 sessions, rates are statistically noisy — a single
         bot visit or a few accidental clicks can swing engagement rate
         from 20% to 80%. We surface the data but cap severity at Info. */
      const MIN_SESSIONS_FOR_VERDICT = 50;
      const lowSample = perPage.sessions < MIN_SESSIONS_FOR_VERDICT;

      const eRate = perPage.engagement_rate_pct;
      /* Apply severity only when sample is sufficient */
      const sevEng: 'green' | 'amber' | 'red' | 'info' = lowSample
        ? 'info'
        : eRate < 40 ? 'red' : eRate < 55 ? 'amber' : 'green';

      const sampleWarning = lowSample
        ? `\n\n> ⚠️ **Low-sample caveat:** only ${perPage.sessions} sessions in the last ${perPage.date_range_days} days — statistically insufficient for a reliable engagement verdict (minimum 50 sessions required). Monitor as traffic grows before acting on this signal.`
        : '';

      findings.push({
        audit_kind: 'engagement_signals',
        severity:   sevEng === 'info' ? 'info' : sevEng,
        finding_title: lowSample
          ? `Per-page engagement data available but low-volume (${perPage.sessions} sessions, ${eRate.toFixed(1)}%) — insufficient for a verdict`
          : sevEng === 'red'
          ? `Per-page engagement rate is poor (${eRate.toFixed(1)}%) — significant content/intent mismatch signal`
          : sevEng === 'amber'
          ? `Per-page engagement rate is mediocre (${eRate.toFixed(1)}%) — room to improve`
          : `Per-page engagement rate is healthy (${eRate.toFixed(1)}%)`,
        finding_detail: `Page-level GA4 metrics for the last ${perPage.date_range_days} days (data through ${perPage.data_freshness}):\n\n- **Sessions:** ${perPage.sessions.toLocaleString()}\n- **Engaged sessions:** ${perPage.engaged_sessions.toLocaleString()} (${eRate.toFixed(1)}%)\n- **Avg session duration:** ${perPage.avg_session_sec.toFixed(0)}s\n- **Bounce rate:** ${perPage.bounce_rate_pct.toFixed(1)}%\n- **Page views:** ${perPage.views.toLocaleString()}\n- **Conversions:** ${perPage.conversions.toLocaleString()}\n\n${lowSample ? '' : sevEng === 'red' ? 'Engagement below 40% indicates visitors landing on this page aren\'t finding what they expected. The CTR-to-position gap may be compounded by a content-quality gap once visitors arrive.' : sevEng === 'amber' ? 'Engagement is on the low end of healthy. The page is keeping some visitors engaged but losing others — worth a content-quality and intent-match review.' : 'Engagement is strong — visitors who land here are finding what they expected. Preserve the structure; consider what makes this page work and replicate.'}${sampleWarning}`,
        recommendation: lowSample
          ? `Monitor this metric as organic traffic grows. Re-run the audit once the page reaches 50+ sessions in a 28-day window to get a statistically reliable engagement verdict.`
          : sevEng === 'red'
          ? `Audit content for search-intent match: does the page answer the dominant query intent in the first paragraph? Check above-the-fold clarity, slow load times, intrusive popups, and the first-paragraph topicality finding from this audit. If intent mismatch is the cause, the keyword-pivot recommendation (if present) is the strategic fix.`
          : sevEng === 'amber'
          ? `Surface related content via internal links + table of contents. Improve above-the-fold clarity. Ensure the page answers the dominant query intent in the first 100 words.`
          : undefined,
        evidence: { ...perPage, scope: 'per-page', low_sample: lowSample, min_sessions_required: MIN_SESSIONS_FOR_VERDICT },
        data_source: 'ga4',
      });

      /* Avg session duration check — only meaningful for content pages
         (informational/article-like). Use word count as a content-page
         heuristic — we don't fetch it here so we tolerate the noise. */
      if (perPage.avg_session_sec < 30 && perPage.sessions >= 50) {
        findings.push({
          audit_kind: 'engagement_signals',
          severity: 'amber',
          finding_title: `Per-page avg session duration is short (${perPage.avg_session_sec.toFixed(0)}s)`,
          finding_detail: `Visitors are leaving in under 30 seconds on average across ${perPage.sessions.toLocaleString()} sessions. For a content page this typically means either intent mismatch (wrong visitors arriving) or above-the-fold content not delivering on the SERP snippet's promise.`,
          recommendation: `Cross-reference with the first-paragraph topicality finding. If the first paragraph is off-topic OR uncompelling, that's likely the cause. Add a table of contents to set expectations; surface related content for visitors who decide this isn't the right page.`,
          evidence: { avg_session_sec: perPage.avg_session_sec, sessions: perPage.sessions, scope: 'per-page' },
          data_source: 'ga4',
        });
      }
      /* Phase 16.7 — Zero-conversion alert. When the page has meaningful
         traffic but zero conversions, that's either a conversion-tracking
         setup issue OR a real funnel problem on this page. Both warrant
         surfacing. Threshold (sessions >= 50) avoids noise on low-volume
         pages where 0 conversions could just mean low sample size. */
      if (perPage.sessions >= 50 && perPage.conversions === 0) {
        findings.push({
          audit_kind: 'engagement_signals',
          severity: 'amber',
          finding_title: `Zero conversions recorded on ${perPage.sessions.toLocaleString()} sessions — tracking gap or real funnel problem`,
          finding_detail: `Page-level GA4 reports **0 conversions** across ${perPage.sessions.toLocaleString()} sessions over ${perPage.date_range_days} days. This is either:\n\n1. **A conversion-tracking gap** — GA4 conversion events aren't configured for this URL's funnel (form submits, signups, demo requests, paid plan triggers). Common when a page was added after initial GA4 setup.\n2. **A real funnel problem** — visitors arrive and engage (sessions > 0, engagement rate ${eRate.toFixed(1)}%) but none take the conversion action. The page may be informational-only, missing CTAs, or the CTA target doesn't match visitor intent.\n\nA 0% conversion rate on ${perPage.sessions.toLocaleString()} sessions is a signal worth investigating either way — even if the audit's CTR-recovery work succeeds and brings 150+ more clicks/month, those clicks won't translate to outcomes without a working conversion path.`,
          recommendation: `**Step 1:** Verify in GA4 → Admin → Events that conversion events are firing for this URL. Filter Reports → Engagement → Events by pagePath = "${pagePath}" and check that the conversion-flagged event(s) appear. If they don't fire here, you have a tracking gap; instrument the relevant CTAs. **Step 2:** If tracking IS working and conversions genuinely == 0, audit the page's CTA structure: are CTAs present above the fold AND at content end? Does the CTA target match the searcher's intent (pricing query → demo CTA may mismatch intent → "see plans" CTA fits better)? Pair this with the CTR work — recovering clicks without fixing conversion means recovering visitors who still don't convert.`,
          evidence: { sessions: perPage.sessions, conversions: 0, engagement_rate_pct: eRate, page_path: pagePath },
          data_source: 'ga4',
        });
      }
      return findings;
    }
    /* Per-page returned null — log the path that was attempted so the
       fall-through is debuggable. */
    if (perPage === null) {
      /* Not blocking — fall through to site-wide. */
    }
  }

  /* FALLBACK: site-wide GA4 from project_knowledge (existing behavior).
     Per-page lookup failed or returned no data — surface site-wide
     aggregates as info-level only. */
  const fetchField = async (key: string) => {
    const { data } = await db().from("project_knowledge")
      .select("field_value").eq("project_id", projectId)
      .eq("category", "analytics").eq("field_key", key).maybeSingle();
    return (data as any)?.field_value;
  };

  const engagementRate = parseFloat((await fetchField('ga4_engagement_rate') || '').replace('%', ''));
  const avgSessionSec  = parseFloat(await fetchField('ga4_avg_session_sec') || '0');

  if (isNaN(engagementRate) || engagementRate === 0) {
    findings.push({
      audit_kind: 'engagement_signals', severity: 'amber',
      finding_title:  'GA4 not connected for this project — engagement data unavailable',
      finding_detail: `GA4 is not connected to this project. Per-page engagement metrics (sessions, bounce rate, conversions, avg duration) will be blank on every audit until GA4 is linked.\\n\\n> ⚠️ **Action required:** Go to **PM Module → select this project → Requirements tab → Integrations section → Connect GA4**. The OAuth flow takes ~60 seconds. Once connected, re-run this audit to get real engagement data.`,
      recommendation: 'Connect GA4 for this project: PM Module → project → Requirements → Integrations → Connect GA4.',
      data_source: 'ga4',
    });
    return findings;
  }

  /* Site-wide fallback — explicitly note this is a degraded signal
     because per-page lookup failed. */
  const pagePathNote = pagePath
    ? ` _(Per-page GA4 lookup for \`${pagePath}\` returned no data — this URL may be new, low-traffic, or the GA4 pagePath dimension doesn't include it. Falling back to site-wide.)_`
    : '';
  if (engagementRate < 40) {
    findings.push({
      audit_kind: 'engagement_signals', severity: 'amber',
      finding_title:  `Site-wide engagement rate is low (${engagementRate.toFixed(1)}%) — site-wide fallback, not page-specific`,
      finding_detail: `Engagement rate below 40% suggests visitors don't find what they expect across the site. This is a **site-wide** metric, not page-specific.${pagePathNote}`,
      recommendation: 'Audit content for matching search intent. Improve above-the-fold clarity. Check for intrusive popups or slow load times.',
      evidence: { engagement_rate_pct: engagementRate, scope: 'site-wide', per_page_failed: true, page_path_attempted: pagePath || null },
      data_source: 'ga4',
    });
  } else {
    findings.push({
      audit_kind: 'engagement_signals', severity: 'info',
      finding_title:  `Site-wide engagement rate: ${engagementRate.toFixed(1)}% (site-wide fallback)`,
      finding_detail: `Healthy site-wide engagement provides a positive backdrop for individual pages. **This is not a page-level verdict.**${pagePathNote}`,
      evidence: { engagement_rate_pct: engagementRate, scope: 'site-wide', per_page_failed: true, page_path_attempted: pagePath || null },
      data_source: 'ga4',
    });
  }

  if (avgSessionSec > 0 && avgSessionSec < 30) {
    findings.push({
      audit_kind: 'engagement_signals', severity: 'amber',
      finding_title:  `Site-wide avg session duration is short (${Math.round(avgSessionSec)}s) — site-wide fallback, not page-specific`,
      finding_detail: 'Short sessions across the site suggest content either doesn\'t hold attention or visitors find what they need quickly. **Site-wide signal**, not page-specific.',
      recommendation: 'For content pages, surface related content, add table of contents, embed videos. For tools, this metric is less meaningful.',
      evidence: { avg_session_sec: avgSessionSec, scope: 'site-wide' },
      data_source: 'ga4',
    });
  }

  return findings;
}

/* ════════════════════════════════════════════════════════════════
   CHECK 5: SCHEMA MARKUP
═══════════════════════════════════════════════════════════════ */

async function checkSchemaMarkup(url: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok || !r.html) return findings;

  /* Find JSON-LD blocks */
  const jsonLdMatches = r.html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];

  if (jsonLdMatches.length === 0) {
    findings.push({
      audit_kind: 'schema_markup', severity: 'amber',
      finding_title:  'No JSON-LD structured data found',
      finding_detail: 'Schema markup helps Google understand page content and enables rich results (FAQ, breadcrumbs, articles, products, etc.).',
      recommendation: 'Add JSON-LD schema relevant to the page type. For articles: Article. For products: Product. For FAQs: FAQPage. Validate with https://validator.schema.org.',
      data_source: 'schema_parser',
    });
    return findings;
  }

  /* Try to parse and detect types + collect entities for validation */
  const types: string[] = [];
  const errors: string[] = [];
  /* Phase 16.5 — collect typed entities for per-type validation */
  const entities: { type: string; obj: any }[] = [];
  for (const block of jsonLdMatches) {
    const content = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
    try {
      const parsed = JSON.parse(content);
      const collectTypesAndEntities = (obj: any) => {
        if (!obj) return;
        if (Array.isArray(obj)) { obj.forEach(collectTypesAndEntities); return; }
        const t = obj['@type'];
        const typeList: string[] = [];
        if (typeof t === 'string') typeList.push(t);
        else if (Array.isArray(t)) typeList.push(...t.filter(x => typeof x === 'string'));
        for (const ty of typeList) {
          types.push(ty);
          entities.push({ type: ty, obj });
        }
        if (obj['@graph']) collectTypesAndEntities(obj['@graph']);
      };
      collectTypesAndEntities(parsed);
    } catch (e: any) {
      errors.push(e?.message || 'parse error');
    }
  }

  if (errors.length > 0) {
    findings.push({
      audit_kind: 'schema_markup', severity: 'amber',
      finding_title:  `${errors.length} JSON-LD block(s) failed to parse`,
      finding_detail: 'Invalid JSON-LD provides no benefit and may confuse Google\'s parsers.',
      recommendation: 'Validate the markup with https://validator.schema.org. Fix any syntax errors.',
      evidence: { errors },
      data_source: 'schema_parser',
    });
  }

  if (types.length > 0) {
    findings.push({
      audit_kind: 'schema_markup', severity: 'green',
      finding_title:  `Schema present: ${[...new Set(types)].join(', ')}`,
      finding_detail: `${jsonLdMatches.length} JSON-LD block(s) with types: ${[...new Set(types)].join(', ')}.`,
      evidence: { types: [...new Set(types)], block_count: jsonLdMatches.length },
      data_source: 'schema_parser',
    });
  }

  /* Phase 16.5 — Per-type schema validation. For each known type, check
     Google's required fields and (for FAQPage) visible-content match.
     Mismatch between schema and visible content violates Google's
     structured-data policies and can incur manual action. */
  const validationIssues: { type: string; issue: string; severity: 'red' | 'amber' }[] = [];
  /* Visible-text body for FAQPage content-match check.
     Strip scripts/styles + tags + collapse whitespace, then lowercase. */
  const visibleText = r.html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  for (const e of entities) {
    if (e.type === 'FAQPage') {
      /* FAQPage needs mainEntity → Array<Question> with name + acceptedAnswer.text */
      const mainEntity = Array.isArray(e.obj.mainEntity) ? e.obj.mainEntity
                       : (e.obj.mainEntity ? [e.obj.mainEntity] : []);
      if (mainEntity.length === 0) {
        validationIssues.push({ type: 'FAQPage', severity: 'red', issue: 'FAQPage has no mainEntity array — Google requires mainEntity with at least one Question entity.' });
        continue;
      }
      let questionsMissingAnswer = 0;
      let questionsMissingName   = 0;
      let questionsNotInVisibleHtml = 0;
      const orphanedQuestions: string[] = [];
      for (const q of mainEntity) {
        const qName = (q?.name || '').trim();
        const qAnswer = (q?.acceptedAnswer?.text || '').trim();
        if (!qName) questionsMissingName++;
        if (!qAnswer) questionsMissingAnswer++;
        /* Content-match check: does the question appear in visible HTML?
           Strip schema-specific noise (HTML entities, surrounding punctuation)
           and check for substring match. Use a normalized substring threshold
           — exact match would be too strict for content that gets slightly
           paraphrased. */
        if (qName) {
          const qNormalized = decodeHtmlEntities(qName).toLowerCase()
            .replace(/[?!.,;:]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (qNormalized.length >= 8 && !visibleText.includes(qNormalized)) {
            questionsNotInVisibleHtml++;
            if (orphanedQuestions.length < 3) orphanedQuestions.push(qName);
          }
        }
      }
      if (questionsMissingName > 0) {
        validationIssues.push({ type: 'FAQPage', severity: 'red', issue: `${questionsMissingName} of ${mainEntity.length} Question entities have no \`name\` field — Google requires the question text in \`name\`.` });
      }
      if (questionsMissingAnswer > 0) {
        validationIssues.push({ type: 'FAQPage', severity: 'red', issue: `${questionsMissingAnswer} of ${mainEntity.length} Question entities have no \`acceptedAnswer.text\` — Google requires answer content.` });
      }
      if (questionsNotInVisibleHtml > 0) {
        const ratio = questionsNotInVisibleHtml / mainEntity.length;
        const sev = ratio > 0.5 ? 'red' : 'amber';
        validationIssues.push({
          type: 'FAQPage',
          severity: sev,
          issue: `${questionsNotInVisibleHtml} of ${mainEntity.length} FAQ Question(s) do NOT appear in the visible page content (${Math.round(ratio * 100)}%). Google requires schema content to match what users see — schema-only Q&A is a structured-data policy violation and risks manual action.${orphanedQuestions.length > 0 ? ` Example orphaned questions: ${orphanedQuestions.map(q => `"${q.slice(0, 60)}${q.length > 60 ? '…' : ''}"`).join(', ')}.` : ''}`,
        });
      }
    } else if (e.type === 'HowTo') {
      const steps = Array.isArray(e.obj.step) ? e.obj.step : (e.obj.step ? [e.obj.step] : []);
      if (steps.length === 0) {
        validationIssues.push({ type: 'HowTo', severity: 'red', issue: 'HowTo has no `step` field — Google requires an array of HowToStep with text/name.' });
      } else {
        const stepsMissing = steps.filter((s: any) => !s?.text && !s?.name).length;
        if (stepsMissing > 0) {
          validationIssues.push({ type: 'HowTo', severity: 'amber', issue: `${stepsMissing} of ${steps.length} HowTo steps lack both \`text\` and \`name\`.` });
        }
      }
    } else if (e.type === 'Article' || e.type === 'BlogPosting' || e.type === 'NewsArticle') {
      const missing: string[] = [];
      if (!e.obj.headline)        missing.push('headline');
      if (!e.obj.author)          missing.push('author');
      if (!e.obj.datePublished)   missing.push('datePublished');
      if (missing.length > 0) {
        const sev = missing.includes('headline') ? 'red' : 'amber';
        validationIssues.push({ type: e.type, severity: sev, issue: `Missing required field(s): ${missing.join(', ')}.` });
      }
    } else if (e.type === 'Product') {
      const missing: string[] = [];
      if (!e.obj.name)   missing.push('name');
      if (!e.obj.image)  missing.push('image');
      if (!e.obj.offers && !e.obj.aggregateRating && !e.obj.review) {
        missing.push('one of: offers, aggregateRating, or review');
      }
      if (missing.length > 0) {
        validationIssues.push({ type: 'Product', severity: 'amber', issue: `Missing recommended field(s): ${missing.join(', ')}.` });
      }
    } else if (e.type === 'Review') {
      const missing: string[] = [];
      if (!e.obj.itemReviewed)  missing.push('itemReviewed');
      if (!e.obj.author)        missing.push('author');
      if (!e.obj.reviewBody && !e.obj.reviewRating) missing.push('reviewBody or reviewRating');
      if (missing.length > 0) {
        validationIssues.push({ type: 'Review', severity: 'amber', issue: `Missing required field(s): ${missing.join(', ')}.` });
      }
    }
  }

  /* Emit ONE consolidated validation finding (Critical or Amber depending
     on worst severity) so we don't spam multiple Critical findings for
     one underlying schema issue. */
  if (validationIssues.length > 0) {
    const hasRed = validationIssues.some(v => v.severity === 'red');
    const bullets = validationIssues.map(v => `- **${v.type}** — ${v.issue}`).join('\n');
    findings.push({
      audit_kind: 'schema_markup',
      severity: hasRed ? 'red' : 'amber',
      finding_title: hasRed
        ? `Schema validation FAILED — ${validationIssues.length} issue(s) including critical violations`
        : `Schema validation issues — ${validationIssues.length} non-critical problem(s)`,
      finding_detail: `Per-type validation against Google's required-fields specifications surfaced the following:\n\n${bullets}${hasRed ? '\n\nCritical schema issues can disqualify the page from rich results AND incur manual action for policy violations (especially schema-content mismatch on FAQPage).' : ''}`,
      recommendation: hasRed
        ? `Fix the critical issues first — schema-content mismatch is the highest priority (Google policy violation). Validate with https://validator.schema.org and the Rich Results Test at https://search.google.com/test/rich-results before redeploying.`
        : `Add the missing recommended fields. Validate with https://validator.schema.org. Recommended fields aren't required, but rich-result eligibility depends on them.`,
      evidence: { validation_issues: validationIssues, types_validated: [...new Set(entities.map(e => e.type))] },
      data_source: 'schema_parser',
    });
  }

  return findings;
}

/* ════════════════════════════════════════════════════════════════
   Phase 16.4 CHECKS (2026-05-24 evening) — Tier 1 SerpAPI leverage:
   three new findings that compound the SerpAPI data we already
   capture, no additional API spend (SerpAPI cache covers the
   second/third call within a single audit).

   • checkHeadingHierarchyVsPaa  — extract page H2/H3, compare
     against PAA questions, flag content gaps with section-heading
     suggestions for each unanswered question.
   • checkDiffuseIntentSerp      — LLM-classify top-10 domains
     into 1-3 word intent categories; flag when 3+ distinct
     categories appear (signal that the keyword has ambiguous
     intent and SEO economics are harder).
   • checkCompetitiveContentBenchmark — fetch top-10 URLs in
     parallel, derive median word/H2 counts, compare audited
     page's metrics to the SERP-grade benchmark.
   ════════════════════════════════════════════════════════════ */

/** Extract H2 and H3 headings from HTML. Strips inner tags and
 *  decodes entities so headings render cleanly downstream. */
function extractHeadings(html: string): { h2: string[]; h3: string[] } {
  const h2Matches = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
  const h3Matches = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/gi) || [];
  const h2 = h2Matches
    .map(m => decodeHtmlEntities(m.replace(/<[^>]+>/g, '').trim()))
    .filter(t => t.length > 0 && t.length < 200);
  const h3 = h3Matches
    .map(m => decodeHtmlEntities(m.replace(/<[^>]+>/g, '').trim()))
    .filter(t => t.length > 0 && t.length < 200);
  return { h2, h3 };
}

/** Normalize a string for token-overlap comparison. */
function tokensFor(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOPWORDS_FOR_HEADING_MATCH.has(t))
  );
}

const STOPWORDS_FOR_HEADING_MATCH = new Set([
  'the','and','for','what','how','can','you','your','our','with','from','that','this',
  'are','was','were','have','has','will','its','into','about','any','all','one','two',
  'when','where','why','who','which','than','then','more','most','some','some','same',
]);

/** Compute whether a PAA question is "answered" by any existing heading.
 *  Threshold: at least 50% of the PAA question's content tokens appear
 *  in the heading. Returns the matched heading text or null.
 *
 *  NOTE: this is heading-level matching only — it verifies the H2/H3 exists
 *  but cannot verify the content *under* that heading answers the question.
 *  When all PAA questions are matched by headings, the finding notes this
 *  caveat explicitly so the reader doesn't assume content quality is verified. */
function findMatchingHeading(paaQuestion: string, headings: string[]): string | null {
  const paaTokens = tokensFor(paaQuestion);
  if (paaTokens.size === 0) return null;
  for (const h of headings) {
    const hTokens = tokensFor(h);
    if (hTokens.size === 0) continue;
    let matched = 0;
    for (const t of paaTokens) if (hTokens.has(t)) matched++;
    if (matched / paaTokens.size >= 0.5) return h;
  }
  return null;
}

/** Phase 16.4 — Heading-hierarchy vs PAA content-gap analysis.
 *  When SerpAPI returned PAA questions, check whether the audited page
 *  has H2/H3 sections that answer each one. Unanswered questions are
 *  high-leverage content gaps — adding H2 sections that answer them
 *  verbatim is one of the strongest tactics for AI Overview citation
 *  AND PAA box appearance.
 *
 *  Fires only when SerpAPI key is configured AND ≥1 PAA question is
 *  present. Always produces an Info-or-Critical finding (never blocks). */
async function checkHeadingHierarchyVsPaa(
  url: string,
  projectId: string,
  campaignKeyword: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (!campaignKeyword || !campaignKeyword.trim()) return findings;
  const serp = await fetchSerpFeatures(campaignKeyword, projectId);
  if (!serp) {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'amber',
      finding_title: 'SerpAPI not configured — PAA questions, SERP features, and competitor data unavailable',
      finding_detail: `Live SERP data (PAA questions, top-10 domains, AI Overview presence, featured snippet) could not be retrieved because SerpAPI is not configured for this project.\\n\\nThis affects **three audit checks** that depend on live SERP data:\\n- PAA question coverage (heading hierarchy vs live PAA questions)\\n- Diffuse-intent SERP detection (Google's intent spread across top-10)\\n- Competitive content benchmark (top-10 competitor word counts)\\n\\n> ⚠️ **Action required:** Set the SERPAPI_KEY environment variable in Vercel (one key covers all projects), OR add a per-project SerpAPI key via PM Module → project → Requirements → Integrations. Get a free SerpAPI key at https://serpapi.com.`,
      recommendation: 'Set SERPAPI_KEY in Vercel environment variables. This single key enables live SERP data, PAA analysis, and competitor benchmarking across all projects.',
      data_source: 'serpapi',
    });
    return findings;
  }
  if (!Array.isArray(serp.paa_questions) || serp.paa_questions.length === 0) {
    return findings;
  }
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok || !r.html) return findings;
  const { h2, h3 } = extractHeadings(r.html);
  const allHeadings = [...h2, ...h3];

  const answered:    { paa: string; heading: string }[] = [];
  const unanswered:  string[] = [];
  for (const paa of serp.paa_questions) {
    const match = findMatchingHeading(paa, allHeadings);
    if (match) answered.push({ paa, heading: match });
    else       unanswered.push(paa);
  }

  /* Build the finding. Severity reflects content-gap density:
     • ALL PAA answered    → green (page is content-complete for the SERP intent)
     • 0 answered          → red    (significant content gap; AI Overview & PAA capture both at risk)
     • partial             → amber  */
  const total = serp.paa_questions.length;
  const answeredCount = answered.length;
  const headingsListing = answered.length > 0
    ? `\n\n**PAA questions ALREADY answered by your headings:**\n${answered.map(a => `- "${a.paa}" → matched by heading "${a.heading}"`).join('\n')}`
    : '';
  const gapListing = unanswered.length > 0
    ? `\n\n**PAA questions NOT answered by your headings — content-gap candidates:**\n${unanswered.map(q => `- ${q}`).join('\n')}\n\nEach unanswered question is a candidate for a new H2 section. Word the H2 verbatim as the PAA question (or a tight rephrase) — Google's models match PAA boxes and AI Overview citations to literal question phrasings.`
    : '';

  if (answeredCount === total) {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity:   'amber',
      finding_title: `All ${total} PAA questions for "${campaignKeyword}" have matching headings — verify content quality beneath each`,
      finding_detail: `The page's heading outline (${h2.length} H2 + ${h3.length} H3) has a heading that token-matches every PAA question on the live SERP. **This is a structural check only** — it confirms the H2/H3 exists but cannot verify whether the content *beneath* each heading actually answers the question clearly.\n\n> ⚠️ **Action required before marking complete:** open each matched heading below and verify the first 1-3 sentences beneath it provide a direct, citation-friendly answer (40-80 words). A heading that token-matches a PAA question but has vague or marketing copy underneath will NOT capture the PAA box.${headingsListing}\n\n**Verification checklist per matched heading:**\n- First sentence beneath H2 directly answers the PAA question in plain language\n- Answer is 40-80 words (citation-friendly length)\n- No jargon that assumes prior knowledge\n- Answer stands alone without requiring the visitor to read the rest of the section\n\n**Next step after verifying content quality:** add FAQPage JSON-LD schema — see the companion finding on schema gap. These two findings must be completed together: content quality first (this finding), then schema (companion finding).`,
      recommendation: `Verify content quality beneath each matched heading. If any heading has vague or marketing copy as its first paragraph rather than a direct answer, rewrite that paragraph. This is the highest-leverage tactic for PAA box capture and AI Overview citation.`,
      evidence: { paa_total: total, answered_count: answeredCount, h2_count: h2.length, h3_count: h3.length, caveat: 'heading_match_only_content_not_verified' },
      data_source: 'html_fetch',
      enrichment_sources: ['serpapi'],
    });
  } else if (answeredCount === 0) {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity:   'red',
      finding_title: `Content gap — none of the ${total} PAA questions for "${campaignKeyword}" are addressed by page headings`,
      finding_detail: `The live SERP shows ${total} People Also Ask question(s), but the page's heading outline (${h2.length} H2 + ${h3.length} H3) doesn't address any of them. This is a significant content gap: AI Overview citation prefers pages that explicitly answer the questions Google's models are already showing on the SERP; PAA box capture requires the same.${gapListing}`,
      recommendation: `Add ${total} new H2 sections, one per unanswered PAA question. Word each H2 as the question itself (or a tight rephrase that preserves the key tokens). Beneath each H2, provide a 40-80 word direct answer in the first sentence (citation-friendly format).`,
      evidence: { paa_total: total, answered_count: 0, h2_count: h2.length, h3_count: h3.length, unanswered: unanswered },
      data_source: 'html_fetch',
      enrichment_sources: ['serpapi'],
    });
  } else {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity:   'amber',
      finding_title: `${unanswered.length} of ${total} PAA questions for "${campaignKeyword}" are NOT addressed by page headings — content gap`,
      finding_detail: `The page covers ${answeredCount} of ${total} PAA questions in its heading outline, leaving ${unanswered.length} unanswered. Each unanswered question is a content gap that competing pages may be filling.${headingsListing}${gapListing}`,
      recommendation: `Add ${unanswered.length} new H2 section(s) for the unanswered PAA questions, with the H2 worded verbatim as the question. Each section should open with a 40-80 word direct answer for citation-friendliness.`,
      evidence: { paa_total: total, answered_count: answeredCount, h2_count: h2.length, h3_count: h3.length, unanswered: unanswered, answered: answered },
      data_source: 'html_fetch',
      enrichment_sources: ['serpapi'],
    });
  }
  /* Fix: when PAA questions exist but no FAQPage schema is present,
     flag it as a high-priority opportunity. FAQPage is the strongest
     schema type for PAA capture and AI Overview citation.
     Only fires when SerpAPI returned PAA questions (serp check already done above). */
  if (serp.paa_questions.length > 0) {
    const pageHtml = r.html || '';
    const hasFaqSchema = /application\/ld\+json[\s\S]*?FAQPage/i.test(pageHtml);
    if (!hasFaqSchema) {
      findings.push({
        audit_kind: 'schema_markup',
        severity:   'amber',
        finding_title: `FAQPage schema missing — ${serp.paa_questions.length} live PAA question(s) present, no FAQPage schema exists`,
        finding_detail: `The SERP for "${campaignKeyword}" shows ${serp.paa_questions.length} People Also Ask question(s), but the page has no FAQPage JSON-LD schema. This is a missed opportunity for:\n- PAA box capture (Google cites FAQPage schema Q&As as the direct answer source)\n- AI Overview inclusion (AI Overviews pull from FAQPage schema when present and content-matched)\n- Rich results in the SERP (expandable FAQ entries below the organic result)\n\n**IMPORTANT:** Do NOT add FAQPage schema until the visible H2 + answer sections are written. Google requires every Question in FAQPage schema to appear verbatim in the visible page content. Adding schema without matching visible content risks a manual action (loss of rich-result eligibility).\n\n**Add schema AFTER writing visible content for these PAA questions:**\n${serp.paa_questions.map((q: string) => '- ' + q).join('\n')}`,
        recommendation: `Step 1: Write visible H2 sections + 40-80 word direct answers for each PAA question. Step 2: Add FAQPage JSON-LD schema matching those visible Q&As exactly. Step 3: Validate at https://validator.schema.org. Step 4: Submit URL in GSC for re-crawl.`,
        evidence: { paa_questions: serp.paa_questions, has_faq_schema: false, paa_count: serp.paa_questions.length },
        data_source: 'html_fetch',
        enrichment_sources: ['serpapi'],
      });
    }
  }

  return findings;
}

/** Phase 16.4 — Diffuse-intent SERP detection via LLM domain classification.
 *  The senior-DMS read on a SERP like "app maker" (apps.apple.com, figma.com,
 *  jotform.com, no-code builders, …) is that intent is diffuse — Google
 *  can't decide what users want. This dramatically changes SEO economics:
 *  ranking #1 still leaves you splitting clicks across intent buckets.
 *
 *  Heuristics on domain names alone would be brittle. One LLM call (Haiku,
 *  ~$0.0003) classifying the top-10 domains by 1-3 word intent category
 *  produces senior-grade output for negligible cost. */
async function checkDiffuseIntentSerp(
  projectId: string,
  campaignKeyword: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (!campaignKeyword || !campaignKeyword.trim()) return findings;
  if (!ANTHROPIC_API_KEY) return findings;
  const serp = await fetchSerpFeatures(campaignKeyword, projectId);
  if (!serp || !Array.isArray(serp.top_10_domains) || serp.top_10_domains.length < 5) {
    return findings;
  }

  const sys = `You classify the SEARCH INTENT of websites ranking for a Google query. Given a query and a list of top-10 ranking domains, you return a JSON object with each domain assigned to a 1-3 word intent category that describes what users get when they click that result.

Common intent categories include (use these or coin your own):
- "app marketplace browse" (apps.apple.com, play.google.com, microsoft.com/store)
- "design tool" (figma.com, canva.com, sketch.com)
- "form builder" (jotform.com, typeform.com, surveymonkey.com)
- "no-code app builder" (bubble.io, adalo.com, thunkable.com, glideapps.com)
- "informational article" (wikipedia.org, blog posts, guides)
- "vendor product page" (specific SaaS pricing/feature pages)
- "review/comparison" (g2.com, capterra.com, trustradius.com)
- "developer documentation" (developer.mozilla.org, react.dev)

The goal is to detect when a SERP has DIFFUSE INTENT — 3+ distinct categories among the top-10. This signals that Google itself isn't sure what users want, and ranking #1 still means competing against fundamentally different result types.

Reply with ONLY valid JSON:
{
  "domains": [
    { "domain": "...", "category": "..." }
  ],
  "distinct_categories": <number>,
  "is_diffuse": <boolean, true if distinct_categories >= 3>,
  "reasoning": "<one sentence explaining the intent landscape>"
}`;

  const user = `Query: "${campaignKeyword}"
Top-10 ranking domains:
${serp.top_10_domains.slice(0, 10).map((d, i) => `${i + 1}. ${d}`).join('\n')}

Classify each by intent category, count distinct categories, decide if SERP is diffuse-intent (3+ categories).`;

  let json: any;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      ANTHROPIC_MODEL,
        max_tokens: 600,
        system:     sys,
        messages:   [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return findings;
    const body = await res.json();
    const text = body?.content?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return findings;
    json = JSON.parse(m[0]);
  } catch {
    return findings;
  }

  if (!json || !Array.isArray(json.domains) || typeof json.distinct_categories !== 'number') {
    return findings;
  }

  /* Group domains by category for display */
  const byCategory: Record<string, string[]> = {};
  for (const entry of json.domains) {
    if (!entry?.domain || !entry?.category) continue;
    const cat = String(entry.category).trim();
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(String(entry.domain).trim());
  }
  const categoryListing = Object.entries(byCategory)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([cat, doms]) => `- **${cat}** (${doms.length}): ${doms.map(d => `\`${d}\``).join(', ')}`)
    .join('\n');

  if (json.is_diffuse) {
    /* Use actual category key count as authoritative — LLM count can drift from breakdown */
    const actualDistinctCats = Object.keys(byCategory).length || json.distinct_categories;
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity:   'amber',
      finding_title: `Diffuse-intent SERP for "${campaignKeyword}" — ${actualDistinctCats} distinct intent categories in top-10`,
      finding_detail: `The live top-10 SERP for "${campaignKeyword}" spans **${json.distinct_categories} distinct intent categories** — Google hasn't settled on a dominant page type for this query. ${json.reasoning || ''}

**Intent breakdown:**
${categoryListing}

**Two ways to read a diffuse SERP — both are true:**

1. **CTR ceiling is lower.** A user searching with intent X will skip results matching intent Y. Even at #1, you're competing for click-share against fundamentally different result types. Don't expect the same CTR-vs-position economics as a tight-intent SERP.

2. **No single winner yet = contestable territory.** A diffuse SERP often means Google hasn't found one authoritative page that satisfies the full query. This is an opportunity: a page that clearly signals its intent category and serves it comprehensively can establish dominance in that intent slice — and intent-dominant pages hold rankings more stably than weak pages that happen to rank on a crowded query.

**Strategic implication:** the risk is *not* that this SERP is impossible to rank on — it's that volume forecasts and CTR projections from keyword tools won't be accurate because they assume tight-intent economics. Set expectations accordingly and measure success by intent-specific click share, not blended CTR.`,
      recommendation: `Two strategic paths: (a) pursue a tighter keyword variant whose SERP is single-category — use GSC query data to find what this URL already gets impressions for, then identify which of those has a tight SERP; or (b) stay on "${campaignKeyword}" but focus the page clearly on ONE of the intent categories in the top-10 (likely "form builder" or "vendor product page" given the site's nature) and build content depth in that lane. Don't try to serve all 5 intent categories — that produces weak pages that don't rank well for any of them.`,
      evidence: { campaign_keyword: campaignKeyword, distinct_categories: actualDistinctCats, categories: byCategory, reasoning: json.reasoning },
      data_source: 'html_fetch',
      enrichment_sources: ['serpapi'],
      signals: ['serp_topic_mismatch'],
    });
  } else {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity:   'green',
      finding_title: `Tight-intent SERP for "${campaignKeyword}" — ${json.distinct_categories} intent categor${json.distinct_categories === 1 ? 'y' : 'ies'} in top-10`,
      finding_detail: `The live top-10 SERP for "${campaignKeyword}" has cohesive intent — Google's ranking signals point to a single (or near-single) user need. ${json.reasoning || ''}

**Intent breakdown:**
${categoryListing}

Tight-intent SERPs follow normal CTR-vs-position economics; standard tactical fixes (title, snippet, snippet capture) translate directly to click gains.`,
      evidence: { campaign_keyword: campaignKeyword, distinct_categories: json.distinct_categories, categories: byCategory },
      data_source: 'html_fetch',
      enrichment_sources: ['serpapi'],
    });
  }
  return findings;
}

/** Phase 16.4 — Competitive content benchmark via top-10 URL fetching.
 *
 *  SerpAPI gives us the top-10 URLs. Fetching each in parallel + extracting
 *  word count + heading count gives the audited page a measured benchmark
 *  vs the SERP-winning pages, not an abstract "3000 words is good" claim.
 *
 *  Filters: skip non-article pages (app stores, YouTube, PDFs) where word
 *  count isn't comparable to a content page. Best-effort — fetch failures
 *  are tolerated and noted; partial benchmark is better than no benchmark. */
async function checkCompetitiveContentBenchmark(
  url: string,
  projectId: string,
  campaignKeyword: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (!campaignKeyword || !campaignKeyword.trim()) return findings;
  const serp = await fetchSerpFeatures(campaignKeyword, projectId);
  if (!serp || !Array.isArray(serp.top_10_urls) || serp.top_10_urls.length < 3) {
    return findings;
  }
  /* Filter out non-article URLs that would skew the word-count comparison.
     App stores, YouTube, PDFs all have very different content shapes. */
  const eligibleUrls = serp.top_10_urls.filter(u => {
    const lower = (u || '').toLowerCase();
    if (!lower.startsWith('http')) return false;
    if (lower.includes('apps.apple.com'))       return false;
    if (lower.includes('play.google.com'))      return false;
    if (lower.includes('youtube.com'))          return false;
    if (lower.includes('youtu.be'))             return false;
    if (lower.endsWith('.pdf'))                 return false;
    /* Skip the audited URL itself if it's in the SERP — we're benchmarking
       against competitors, not measuring our own page twice. */
    if (lower.replace(/\/$/, '') === url.toLowerCase().replace(/\/$/, '')) return false;
    return true;
  }).slice(0, 8);

  if (eligibleUrls.length < 3) return findings;  /* not enough competitors for a credible median */

  /* Fetch all eligible competitors in parallel (8s timeout per fetch).
     Failures are tolerated — we just exclude them from the median. */
  const competitorMetrics = await Promise.all(eligibleUrls.map(async (cUrl) => {
    try {
      const cr = await fetchWithTimeout(cUrl, 8000);
      if (!cr.ok || !cr.html) return null;
      /* Strip script/style + tags for word count */
      const stripped = cr.html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const wordCount = stripped ? stripped.split(/\s+/).length : 0;
      const { h2, h3 } = extractHeadings(cr.html);
      return { url: cUrl, word_count: wordCount, h2_count: h2.length, h3_count: h3.length };
    } catch {
      return null;
    }
  }));
  const successful = competitorMetrics.filter((m): m is { url: string; word_count: number; h2_count: number; h3_count: number } => m !== null && m.word_count > 100);
  if (successful.length < 3) return findings;  /* not enough successful fetches for a credible median */

  /* Audited page's own metrics */
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok || !r.html) return findings;
  const auditedStripped = r.html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const auditedWordCount = auditedStripped ? auditedStripped.split(/\s+/).length : 0;
  const { h2: auditedH2, h3: auditedH3 } = extractHeadings(r.html);

  /* Compute median word count */
  const sortedWords = [...successful].map(s => s.word_count).sort((a, b) => a - b);
  const medianWords = sortedWords[Math.floor(sortedWords.length / 2)];
  const minWords    = sortedWords[0];
  const maxWords    = sortedWords[sortedWords.length - 1];
  const wordRatio   = medianWords > 0 ? auditedWordCount / medianWords : 1;

  const competitorListing = successful
    .sort((a, b) => b.word_count - a.word_count)
    .map(s => `- ${s.url} — ${s.word_count.toLocaleString()} words, ${s.h2_count} H2 + ${s.h3_count} H3`)
    .join('\n');

  const skippedCount = eligibleUrls.length - successful.length;
  const skippedNote  = skippedCount > 0 ? `\n\n_${skippedCount} top-10 URL(s) could not be fetched and are excluded from the median._` : '';
  const filteredCount = serp.top_10_urls.length - eligibleUrls.length;
  const filteredNote  = filteredCount > 0 ? ` _${filteredCount} top-10 URL(s) were filtered (app stores, video, PDF — not comparable as article content)._` : '';

  if (wordRatio < 0.6) {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity:   'amber',
      finding_title: `Content depth below SERP median — ~${auditedWordCount.toLocaleString()} words vs competitor median ${medianWords.toLocaleString()}`,
      finding_detail: `Your page has **${auditedWordCount.toLocaleString()} words** (${auditedH2.length} H2 + ${auditedH3.length} H3). The median for the top-10 SERP-ranking competitors is **${medianWords.toLocaleString()} words** (range ${minWords.toLocaleString()}-${maxWords.toLocaleString()}). At ${Math.round(wordRatio * 100)}% of competitive depth, the page may be under-covering topics that competitors expand on.${filteredNote}\n\n**Competitor benchmark (${successful.length} fetched):**\n${competitorListing}${skippedNote}`,
      recommendation: `Expand content by ~${Math.max(0, medianWords - auditedWordCount).toLocaleString()} words to reach SERP median. Use the PAA-driven heading-hierarchy finding to identify which topical sections are most worth adding — depth without scope expansion is filler.`,
      evidence: { audited_word_count: auditedWordCount, audited_h2: auditedH2.length, audited_h3: auditedH3.length, competitor_median: medianWords, competitor_min: minWords, competitor_max: maxWords, competitors_fetched: successful.length, word_ratio: Number(wordRatio.toFixed(2)) },
      data_source: 'html_fetch',
      enrichment_sources: ['serpapi'],
    });
  } else if (wordRatio > 1.8) {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity:   'info',
      finding_title: `Content depth significantly exceeds SERP median — ${auditedWordCount.toLocaleString()} words vs ${medianWords.toLocaleString()}`,
      finding_detail: `Your page is **${Math.round(wordRatio * 100)}% of competitor median** — ${auditedWordCount.toLocaleString()} words vs ${medianWords.toLocaleString()} (range ${minWords.toLocaleString()}-${maxWords.toLocaleString()}). Long-form can outperform on competitive informational queries, but verify the extra length adds substance (PAA coverage, schema-eligible Q&A, fresh data) rather than filler.${filteredNote}\n\n**Competitor benchmark (${successful.length} fetched):**\n${competitorListing}${skippedNote}`,
      evidence: { audited_word_count: auditedWordCount, competitor_median: medianWords, competitors_fetched: successful.length, word_ratio: Number(wordRatio.toFixed(2)) },
      data_source: 'html_fetch',
      enrichment_sources: ['serpapi'],
    });
  } else {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity:   'green',
      finding_title: `Content depth in line with SERP — ${auditedWordCount.toLocaleString()} words vs competitor median ${medianWords.toLocaleString()}`,
      finding_detail: `Your page has **${auditedWordCount.toLocaleString()} words** (${auditedH2.length} H2 + ${auditedH3.length} H3) vs competitor median ${medianWords.toLocaleString()} (${Math.round(wordRatio * 100)}% of median, range ${minWords.toLocaleString()}-${maxWords.toLocaleString()}). Content depth is competitive — focus on topical coverage and structural quality rather than raw length.${filteredNote}\n\n**Competitor benchmark (${successful.length} fetched):**\n${competitorListing}${skippedNote}`,
      evidence: { audited_word_count: auditedWordCount, competitor_median: medianWords, competitors_fetched: successful.length, word_ratio: Number(wordRatio.toFixed(2)) },
      data_source: 'html_fetch',
      enrichment_sources: ['serpapi'],
    });
  }
  return findings;
}

/* ════════════════════════════════════════════════════════════════
   Phase 16.6 CHECKS (2026-05-24 night, final) — Tier 3 tech-audit
   trio that closes the remaining "Not yet covered" gaps:

   • checkContentFreshness — Last-Modified header, schema dates,
     visible date detection. Pages older than 12 months on time-
     sensitive topics underperform; stale dated content is one of
     the strongest known under-performance signals.
   • checkImageOptimization — image count, lazy-load coverage,
     alt-text completeness, modern format usage (webp/avif).
     Cannot weigh actual bytes without fetching each asset, but
     structural signals correlate well with CWV outcomes.
   • checkHreflang — detect hreflang tags, validate language
     codes + self-reference + x-default. Only fires when hreflang
     is present (single-locale pages don't need it).

   All three are self-contained (single HTML fetch, no external
   API spend). Verifiable on next audit run.
   ════════════════════════════════════════════════════════════ */

/** Phase 16.6 — Content-freshness signal aggregator.
 *
 *  Pulls freshness signals from four sources, picks the most recent
 *  reliable date, scores staleness:
 *    1. Last-Modified HTTP header (when present and not the same as fetch time)
 *    2. Article/BlogPosting schema's dateModified / datePublished
 *    3. Visible page text — "Updated: <date>" / "Published: <date>" patterns
 *    4. Year in title (e.g., "2024 Guide" → year is the freshness hint)
 *
 *  Severity:
 *    • >24 months stale → red (likely losing rankings to fresher competitors)
 *    • 12-24 months   → amber
 *    • <12 months     → green
 *    • No date found  → info (can't assess) */
async function checkContentFreshness(url: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok || !r.html) return findings;
  const html = r.html;

  const detected: { source: string; date: Date; raw: string }[] = [];
  const now = new Date();

  /* 1. Last-Modified header (rarely set correctly by modern frameworks, but
        when it's present and not equal to Date header, it's authoritative) */
  const lastModifiedHeader = r.response?.headers.get('last-modified');
  if (lastModifiedHeader) {
    const d = new Date(lastModifiedHeader);
    if (!isNaN(d.getTime()) && d.getTime() < now.getTime() && d.getTime() > new Date('2000-01-01').getTime()) {
      detected.push({ source: 'Last-Modified header', date: d, raw: lastModifiedHeader });
    }
  }

  /* 2. JSON-LD Article schema dates */
  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of jsonLdMatches) {
    const content = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
    try {
      const parsed = JSON.parse(content);
      const collectDates = (obj: any) => {
        if (!obj) return;
        if (Array.isArray(obj)) { obj.forEach(collectDates); return; }
        if (obj.dateModified) {
          const d = new Date(obj.dateModified);
          if (!isNaN(d.getTime())) detected.push({ source: 'schema dateModified', date: d, raw: String(obj.dateModified) });
        }
        if (obj.datePublished) {
          const d = new Date(obj.datePublished);
          if (!isNaN(d.getTime())) detected.push({ source: 'schema datePublished', date: d, raw: String(obj.datePublished) });
        }
        if (obj['@graph']) collectDates(obj['@graph']);
      };
      collectDates(parsed);
    } catch { /* ignore parse errors here — checkSchemaMarkup handles those */ }
  }

  /* 3. Visible date patterns — "Updated <date>" / "Published <date>" / "Last updated: ..."
        Matches common formats: "Jan 15, 2024", "January 15, 2024", "2024-01-15", "15/01/2024" */
  const datePatternStrings: { pattern: RegExp; label: string }[] = [
    { pattern: /(?:last\s+updated|updated|published|posted)[\s:on,]+([a-z]{3,9}\s+\d{1,2},?\s+\d{4})/gi, label: 'visible "Updated:" pattern' },
    { pattern: /(?:last\s+updated|updated|published|posted)[\s:on,]+(\d{4}-\d{2}-\d{2})/gi,                    label: 'visible "Updated:" ISO pattern' },
  ];
  const visibleText = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  for (const { pattern, label } of datePatternStrings) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(visibleText)) !== null) {
      const d = new Date(match[1]);
      if (!isNaN(d.getTime()) && d.getTime() < now.getTime() && d.getTime() > new Date('2000-01-01').getTime()) {
        detected.push({ source: label, date: d, raw: match[1] });
      }
      if (detected.length > 30) break;  /* safety cap on regex iteration */
    }
  }

  /* 4. Year in title — e.g. "Microsoft Power Apps Pricing 2026: ...". This is
        a strong intent signal that the page is positioned as time-sensitive. */
  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const title = titleMatch?.[1] || '';
  const yearInTitleMatch = title.match(/\b(20\d{2})\b/);
  let yearInTitle: number | null = null;
  if (yearInTitleMatch) {
    yearInTitle = parseInt(yearInTitleMatch[1], 10);
  }

  /* Pick the most recent reliable date for staleness assessment */
  if (detected.length === 0 && yearInTitle === null) {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity: 'info',
      finding_title: 'No content-freshness signal detected on the page',
      finding_detail: 'No Last-Modified header, schema dateModified/datePublished, visible "Updated:" pattern, or year-in-title was detected. Without a freshness signal, neither Google nor users can assess whether the content is current. For time-sensitive topics this is a competitive disadvantage.',
      recommendation: 'Add a visible "Last updated: <date>" label near the page title AND add `dateModified` to the Article JSON-LD schema with the same date. Update both whenever you genuinely refresh the content.',
      data_source: 'html_fetch',
    });
    return findings;
  }

  detected.sort((a, b) => b.date.getTime() - a.date.getTime());
  const mostRecent = detected[0] || null;
  const dateForScoring = mostRecent ? mostRecent.date : null;

  /* If title says "2026" but no detected date is from 2026, that's a
     promise-vs-content mismatch worth surfacing. */
  if (yearInTitle && dateForScoring) {
    const detectedYear = dateForScoring.getFullYear();
    if (yearInTitle > detectedYear + 1) {
      findings.push({
        audit_kind: 'on_page_fundamentals',
        severity: 'amber',
        finding_title: `Title promises ${yearInTitle} but most-recent date signal is ${detectedYear}`,
        finding_detail: `The page title contains "${yearInTitle}" (signaling time-sensitive currency), but the most-recent detectable date on the page is from **${dateForScoring.toISOString().slice(0, 10)}** (source: ${mostRecent.source}). Users clicking expecting ${yearInTitle} content find ${detectedYear}-era information — a trust hit that compounds CTR loss.`,
        recommendation: `Either (a) update the content (and dateModified schema + visible "Updated:" label) to genuinely reflect ${yearInTitle}, or (b) remove "${yearInTitle}" from the title until the content matches.`,
        evidence: { title_year: yearInTitle, detected_year: detectedYear, detected_source: mostRecent.source },
        data_source: 'html_fetch',
      });
    }
  }

  /* Staleness scoring on the most-recent detected date */
  if (dateForScoring) {
    const ageMs = now.getTime() - dateForScoring.getTime();
    const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30);
    const datesSummary = detected.slice(0, 4).map(d => `- ${d.source}: ${d.date.toISOString().slice(0, 10)} (raw: "${d.raw}")`).join('\n');
    if (ageMonths > 24) {
      findings.push({
        audit_kind: 'on_page_fundamentals',
        severity: 'red',
        finding_title: `Content is stale — most-recent date signal is ${Math.round(ageMonths)} months old`,
        finding_detail: `The most-recent freshness signal on this page is **${dateForScoring.toISOString().slice(0, 10)}** (${Math.round(ageMonths)} months ago, source: ${mostRecent.source}). For most informational/commercial topics, Google rewards recency — content >24 months old typically loses ground to fresher competitors. Pages with year-in-title content (pricing guides, "best of" lists, how-to tutorials) are hit hardest.\n\n**All freshness signals detected:**\n${datesSummary}`,
        recommendation: `Refresh the content this quarter: review for outdated facts, prices, screenshots, and feature claims. Then update **both** the visible "Updated: <date>" label AND the JSON-LD schema's \`dateModified\`. Note: editing inconsequential filler doesn't count — Google's freshness signal weights material content changes, not date-stamp manipulation.`,
        evidence: { age_months: Math.round(ageMonths), most_recent_date: dateForScoring.toISOString(), most_recent_source: mostRecent.source, all_dates: detected.slice(0, 6).map(d => ({ source: d.source, date: d.date.toISOString().slice(0, 10), raw: d.raw })) },
        data_source: 'html_fetch',
      });
    } else if (ageMonths > 12) {
      findings.push({
        audit_kind: 'on_page_fundamentals',
        severity: 'amber',
        finding_title: `Content freshness aging — most-recent date signal is ${Math.round(ageMonths)} months old`,
        finding_detail: `Most-recent freshness signal: **${dateForScoring.toISOString().slice(0, 10)}** (${Math.round(ageMonths)} months ago, source: ${mostRecent.source}). On time-sensitive topics this is on the older end of acceptable — competing pages refreshed in the last 6-12 months will gradually outrank.\n\n**All freshness signals detected:**\n${datesSummary}`,
        recommendation: `Plan a content refresh in the next 1-3 months. Verify all facts/prices/features are current; update visible date label + schema dateModified once the refresh is genuine.`,
        evidence: { age_months: Math.round(ageMonths), most_recent_date: dateForScoring.toISOString(), most_recent_source: mostRecent.source },
        data_source: 'html_fetch',
      });
    } else {
      /* Determine signal reliability. Last-Modified-only is the least
         trustworthy freshness signal — CDN cache purges and deployment
         pipelines routinely update it without any content change.
         Only mark green when a higher-trust signal (schema dateModified,
         visible Updated label, year-in-title) corroborates the date. */
      const lastModOnlySource = detected.length === 1 && mostRecent.source === 'Last-Modified header';
      findings.push({
        audit_kind: 'on_page_fundamentals',
        severity: lastModOnlySource ? 'amber' : 'green',
        finding_title: lastModOnlySource
          ? `Content freshness signal present but authenticity uncertain — Last-Modified header only (${Math.round(ageMonths)} months old)`
          : `Content is fresh — most-recent date signal is ${Math.round(ageMonths)} months old`,
        finding_detail: lastModOnlySource
          ? `Most-recent freshness signal: **${dateForScoring.toISOString().slice(0, 10)}** (${Math.round(ageMonths)} months ago, source: ${mostRecent.source}).\n\n> ⚠️ **Authenticity caveat:** the Last-Modified HTTP header is the least reliable freshness signal. CDN cache purges, server deployments, and build pipelines routinely update this header without any change to the actual page content. Google's own documentation notes it weights *material content changes* over date-stamp manipulation.\n\n**To make this a reliable freshness signal:** cross-verify by checking (a) whether the schema \`dateModified\` field agrees with this date, and (b) whether there's a visible \"Updated:\" or \"Last reviewed:\" label on the page. If neither exists, the freshness signal cannot be confirmed.\n\n**All freshness signals detected:**\n${datesSummary}`
          : `Most-recent freshness signal: **${dateForScoring.toISOString().slice(0, 10)}** (${Math.round(ageMonths)} months ago, source: ${mostRecent.source}). Within the typical "recent" window for SERP freshness signals.\n\n**All freshness signals detected:**\n${datesSummary}`,
        recommendation: lastModOnlySource
          ? `Add a visible "Last updated: <date>" label on the page AND add \`dateModified\` to the Article/BreadcrumbList JSON-LD schema. Update both whenever you genuinely refresh the content. This turns an unverifiable header into a corroborated, trust-worthy freshness signal.`
          : undefined,
        evidence: { age_months: Math.round(ageMonths), most_recent_date: dateForScoring.toISOString(), most_recent_source: mostRecent.source, last_mod_only: lastModOnlySource },
        data_source: 'html_fetch',
      });
    }
  }
  return findings;
}

/** Phase 16.6 — Image optimization audit.
 *
 *  Structural signals (we don't fetch individual images, so byte-weight
 *  isn't measured here — that would require N more HTTP requests). What we
 *  CAN measure structurally:
 *    • Image count
 *    • Lazy-loading coverage (loading="lazy")
 *    • Alt-text completeness (excluding tracking pixels — already filtered)
 *    • Modern format usage (webp/avif) vs legacy (jpg/png)
 *    • Responsive image markup (srcset/sizes presence)
 *
 *  Heuristic thresholds align with CWV-style guidance:
 *    • <50% lazy-loaded on pages with 10+ images → amber
 *    • Zero modern-format images on pages with 5+ images → amber  */
async function checkImageOptimization(url: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok || !r.html) return findings;
  const html = r.html;

  /* Capture each <img> tag fully so we can inspect its attributes */
  const imgMatches = html.match(/<img\s+[^>]*>/gi) || [];
  if (imgMatches.length === 0) {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity: 'info',
      finding_title: 'No <img> tags detected on this page',
      finding_detail: 'Image optimization check skipped — the page has no img tags (or all images are CSS-backgrounds, which this check doesn\'t cover).',
      data_source: 'html_fetch',
    });
    return findings;
  }

  /* Filter out 1x1 tracking pixels and obvious tracking-only images */
  const realImages = imgMatches.filter(tag => {
    if (/width=["']?1["']?/i.test(tag) && /height=["']?1["']?/i.test(tag)) return false;
    if (/src=["'][^"']*\/(track|pixel|beacon|impressions?)\//i.test(tag)) return false;
    if (/src=["'][^"']*\.(gif|png)[^"']*['"][^>]*1x1/i.test(tag)) return false;
    return true;
  });

  let withLazy = 0, withAlt = 0, withSrcset = 0, modernFormat = 0, legacyFormat = 0;
  for (const tag of realImages) {
    if (/loading=["']lazy["']/i.test(tag)) withLazy++;
    const altMatch = /\salt=["']([^"']*)["']/i.exec(tag);
    if (altMatch && altMatch[1].trim().length > 0) withAlt++;
    if (/srcset=/i.test(tag)) withSrcset++;
    const srcMatch = /\ssrc=["']([^"']+)["']/i.exec(tag);
    const src = srcMatch?.[1] || '';
    if (/\.(webp|avif)(\?|#|$)/i.test(src)) modernFormat++;
    else if (/\.(jpg|jpeg|png|gif)(\?|#|$)/i.test(src)) legacyFormat++;
  }

  const total = realImages.length;
  const lazyRatio    = total > 0 ? withLazy / total : 0;
  const altRatio     = total > 0 ? withAlt / total : 0;
  const srcsetRatio  = total > 0 ? withSrcset / total : 0;
  /* Phase 16.10 — unclassified format count (SVG, data: URIs, no extension,
     CDN URLs without explicit format). Previous code silently dropped these
     from the legacy/modern partition which made titles like "all 9 images
     are jpg/png/gif" lie when total was 17 and 8 were SVG icons. */
  const otherFormat = Math.max(0, total - modernFormat - legacyFormat);

  /* Build the per-finding details inline so the report shows the full picture.
     Phase 16.10 — include unclassified count when present so the breakdown
     adds up. */
  const otherFmtNote = otherFormat > 0 ? `, **${otherFormat} other** (svg/data-uri/cdn-no-ext)` : '';
  const summary = `${total} content image(s) detected (tracking pixels filtered): **${withLazy} lazy-loaded** (${Math.round(lazyRatio * 100)}%), **${withAlt} with alt text** (${Math.round(altRatio * 100)}%), **${withSrcset} with srcset** (${Math.round(srcsetRatio * 100)}%), **${modernFormat} modern format** (webp/avif), **${legacyFormat} legacy** (jpg/png/gif)${otherFmtNote}.`;

  /* Phase 16.10 — shared evidence object pushed into EVERY image finding
     so the deep-doc renderer's §1.4 inventory table can extract any field
     from any finding regardless of which one fired. Previously each finding
     only carried its own narrow evidence subset and §1.4 came up empty. */
  const sharedEvidence = {
    total_images: total,
    with_lazy:    withLazy,
    lazy_ratio:   Number(lazyRatio.toFixed(2)),
    with_alt:     withAlt,
    missing_alt:  total - withAlt,
    alt_ratio:    Number(altRatio.toFixed(2)),
    with_srcset:  withSrcset,
    srcset_ratio: Number(srcsetRatio.toFixed(2)),
    modern_format: modernFormat,
    legacy_format: legacyFormat,
    other_format:  otherFormat,
  };

  /* Lazy-loading severity */
  if (total >= 10 && lazyRatio < 0.5) {
    findings.push({
      audit_kind: 'page_load',
      severity: 'amber',
      finding_title: `Lazy-loading coverage is low — ${Math.round(lazyRatio * 100)}% of ${total} images use loading="lazy"`,
      finding_detail: `${summary}\n\nWith ${total} images on the page and only ${withLazy} marked \`loading="lazy"\`, browsers download all non-lazy images upfront — inflating LCP and bandwidth on mobile.`,
      recommendation: `Add \`loading="lazy"\` to all images below the fold (typically all but the first 1-3). Keep eager loading only on hero/above-fold images. This is a free CWV improvement requiring no asset re-encoding.`,
      /* Lazy-loading specific evidence — only fields relevant to this finding */
      evidence: { total_images: total, with_lazy: withLazy, lazy_ratio: Number(lazyRatio.toFixed(2)), with_alt: withAlt, alt_ratio: Number(altRatio.toFixed(2)) },
      data_source: 'html_fetch',
    });
  }

  /* Modern format severity. Phase 16.10 — title rewritten so it does NOT
     lie when total != legacyFormat. The previous "all ${legacyFormat}
     images are jpg/png/gif" misled readers when other formats (SVG icons)
     made up the rest of the image set. */
  if (total >= 5 && modernFormat === 0 && legacyFormat > 0) {
    const legacyShare = Math.round((legacyFormat / total) * 100);
    const titleSuffix = legacyFormat === total
      ? `all ${total} images are jpg/png/gif`
      : `${legacyFormat} of ${total} images are jpg/png/gif (${legacyShare}%)`;
    findings.push({
      audit_kind: 'page_load',
      severity: 'amber',
      finding_title: `No modern image formats used — ${titleSuffix}`,
      finding_detail: `${summary}\n\nLegacy formats (jpg/png/gif) are typically 25-50% larger than equivalent webp, and 40-70% larger than avif at equivalent visual quality. On pages with multiple images this is a measurable LCP and bandwidth hit.`,
      recommendation: `Convert content images to webp (broadest compatibility, 95%+ browser support) or avif (best compression, 90%+ browser support). Most image CDNs (Cloudflare Images, Imgix, ImageKit) can serve format-on-demand based on Accept headers. Use \`<picture>\` with format fallbacks for graceful degradation.`,
      /* Format-specific evidence — only fields relevant to this finding */
      evidence: { total_images: total, modern_format: modernFormat, legacy_format: legacyFormat, other_format: otherFormat, legacy_share_pct: legacyShare },
      data_source: 'html_fetch',
    });
  }

  /* Alt completeness — separate finding because it's an accessibility AND SEO issue */
  if (total >= 5 && altRatio < 0.8) {
    const missing = total - withAlt;
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity: 'amber',
      finding_title: `${missing} of ${total} images missing alt text (${Math.round((1 - altRatio) * 100)}%)`,
      finding_detail: `${summary}\n\nMissing alt text is both an accessibility failure (screen readers can't describe the image) and a missed SEO signal (Google uses alt text as a topical signal, particularly for image search). The ≥80% alt-coverage threshold is the industry baseline.`,
      recommendation: `Add descriptive alt text to all content images. Decorative images (purely visual flourishes) should use \`alt=""\` explicitly to signal "intentionally empty." Avoid generic alts like "image" or "photo" — describe what the image actually shows in 5-15 words.`,
      evidence: { ...sharedEvidence },
      data_source: 'html_fetch',
    });
  }

  /* Pass case — surface the structural metrics positively */
  if (total >= 5 && lazyRatio >= 0.5 && altRatio >= 0.8 && (modernFormat > 0 || legacyFormat < 5)) {
    findings.push({
      audit_kind: 'page_load',
      severity: 'green',
      finding_title: `Image optimization signals look healthy — ${total} images, ${Math.round(lazyRatio * 100)}% lazy, ${Math.round(altRatio * 100)}% with alt`,
      finding_detail: summary,
      evidence: { ...sharedEvidence },
      data_source: 'html_fetch',
    });
  } else if (total < 5) {
    /* Few-images case — surface as info, no severity verdict warranted */
    findings.push({
      audit_kind: 'page_load',
      severity: 'info',
      finding_title: `${total} content image(s) on this page — too few for optimization-pattern verdicts`,
      finding_detail: summary,
      evidence: { ...sharedEvidence },
      data_source: 'html_fetch',
    });
  }
  return findings;
}

/** Phase 16.6 — Hreflang validation.
 *
 *  Hreflang annotations tell Google which language/region variant of a page
 *  to serve to which user. Misconfiguration is one of the most common
 *  international-SEO failures. We can't fully validate reciprocity from a
 *  single audited URL (that requires fetching each alternate), but we can:
 *    • Detect presence
 *    • Validate ISO language/region codes
 *    • Check for x-default (recommended fallback)
 *    • Check for self-reference (each page should list itself in its own
 *      hreflang block)
 *
 *  This check fires ONLY when hreflang is present — single-locale pages
 *  don't need it and shouldn't be penalized for lacking it. */
async function checkHreflang(url: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok || !r.html) return findings;
  const html = r.html;

  /* Parse all hreflang <link> tags */
  const linkPattern = /<link\s+[^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["']|<link\s+[^>]*href=["']([^"']+)["'][^>]*hreflang=["']([^"']+)["']/gi;
  const entries: { hreflang: string; href: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkPattern.exec(html)) !== null) {
    const hreflang = (m[1] || m[4] || '').trim();
    const href     = (m[2] || m[3] || '').trim();
    if (hreflang && href) entries.push({ hreflang, href });
  }

  if (entries.length === 0) {
    /* No hreflang detected — only an issue if this is a multi-locale site,
       which we can't infer from a single page. Skip silently. */
    return findings;
  }

  /* Validate each entry's hreflang code */
  const issues: string[] = [];
  const validLangPattern = /^([a-z]{2,3}|x-default)(-[A-Z]{2,3})?$/;
  for (const e of entries) {
    if (!validLangPattern.test(e.hreflang)) {
      issues.push(`Invalid hreflang code "\`${e.hreflang}\`" → ${e.href}. Use ISO 639-1 language codes optionally followed by ISO 3166-1 region codes (e.g. "en", "en-US", "es-MX", "x-default").`);
    }
  }

  /* Self-reference check: does any entry's href match the audited URL? */
  const normalizedAudited = url.replace(/\/$/, '').toLowerCase();
  const hasSelfReference = entries.some(e => {
    try {
      const target = new URL(e.href, url).href.replace(/\/$/, '').toLowerCase();
      return target === normalizedAudited;
    } catch { return false; }
  });
  if (!hasSelfReference) {
    issues.push(`The page does not list itself in its own hreflang annotations. Google requires self-reference — each page should declare its own \`hreflang\` entry pointing to itself.`);
  }

  /* x-default presence check */
  const hasXDefault = entries.some(e => e.hreflang === 'x-default');
  if (!hasXDefault) {
    issues.push(`No \`x-default\` hreflang declared. Recommended for international pages — tells Google which version to serve when no specific language/region matches the user.`);
  }

  /* Duplicate hreflang values (different hrefs claiming same lang) */
  const seenLangs: Record<string, string[]> = {};
  for (const e of entries) {
    if (!seenLangs[e.hreflang]) seenLangs[e.hreflang] = [];
    seenLangs[e.hreflang].push(e.href);
  }
  for (const [lang, hrefs] of Object.entries(seenLangs)) {
    if (hrefs.length > 1) {
      issues.push(`Duplicate hreflang "\`${lang}\`" declared with conflicting hrefs: ${hrefs.map(h => `"${h}"`).join(', ')}. Each language/region should map to exactly one URL.`);
    }
  }

  const summary = `${entries.length} hreflang annotation(s) detected on this page:\n${entries.slice(0, 12).map(e => `- \`${e.hreflang}\` → ${e.href}`).join('\n')}${entries.length > 12 ? `\n_(${entries.length - 12} more not shown)_` : ''}`;

  if (issues.length > 0) {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity: 'amber',
      finding_title: `Hreflang validation issues — ${issues.length} problem(s) detected`,
      finding_detail: `${summary}\n\n**Issues found:**\n${issues.map(i => `- ${i}`).join('\n')}\n\nReciprocity (each alternate also listing this page) cannot be validated from a single audited URL — verify each alternate has its own complete hreflang block. Use Google's URL Inspection tool in Search Console to confirm Google sees the hreflang signals correctly.`,
      recommendation: `Fix the listed issues. The required structure: each language/region variant declares the full set of hreflang links including itself AND x-default. Validate the full mesh with https://www.aleydasolis.com/english/international-seo-tools/hreflang-tags-generator/ or similar.`,
      evidence: { entries, issues },
      data_source: 'html_fetch',
    });
  } else {
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity: 'green',
      finding_title: `Hreflang well-formed — ${entries.length} valid annotations including x-default and self-reference`,
      finding_detail: summary,
      evidence: { entries },
      data_source: 'html_fetch',
    });
  }
  return findings;
}

/* ════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════ */

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<{
  ok: boolean; response?: Response; html?: string; status?: number; error?: string;
}> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',          // we want to detect redirects, not follow them
      headers: {
        'User-Agent': 'SEOSeason-Bot/1.0 (+https://seoseason.com; Technical audit)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    /* If redirect (3xx), don't try to read body */
    if (res.status >= 300 && res.status < 400) {
      return { ok: true, response: res, status: res.status };
    }
    const html = await res.text();
    return { ok: true, response: res, html, status: res.status };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'fetch failed' };
  }
}

function cleanUrl(u: string): string {
  try { const url = new URL(u); return url.host + url.pathname; }
  catch { return u; }
}

function collectDataSources(findings: Finding[]): string[] {
  const set = new Set<string>();
  for (const f of findings) if (f.data_source) set.add(f.data_source);
  return Array.from(set);
}

function buildHeadline(opts: {
  url: string; redCount: number; amberCount: number; greenCount: number; failedChecks: string[];
}): string {
  const total = opts.redCount + opts.amberCount + opts.greenCount;
  if (opts.redCount > 0) {
    return `🔴 ${opts.redCount} critical issue${opts.redCount === 1 ? '' : 's'} on ${cleanUrl(opts.url)} (${opts.amberCount} warning${opts.amberCount === 1 ? '' : 's'}, ${opts.greenCount} passing)`;
  }
  if (opts.amberCount > 0) {
    return `🟡 ${opts.amberCount} warning${opts.amberCount === 1 ? '' : 's'} on ${cleanUrl(opts.url)} (${opts.greenCount} passing)`;
  }
  if (opts.greenCount > 0) {
    return `🟢 ${opts.greenCount} checks passing on ${cleanUrl(opts.url)} — page is technically clean`;
  }
  return `Audit completed but no findings (${total} checks${opts.failedChecks.length ? `, ${opts.failedChecks.length} failed to run` : ''})`;
}

function renderAuditReport(opts: {
  keyword: string; url: string; source: string; sourceNote?: string;
  findings: Finding[]; failedChecks: string[]; runId: string;
}): string {
  const lines: string[] = [];
  lines.push(`# Technical audit: ${cleanUrl(opts.url)}`);
  lines.push('');
  lines.push(`**Audited URL:** [${opts.url}](${opts.url})`);
  lines.push(`**Campaign keyword:** "${opts.keyword}"`);
  lines.push(`**Target URL source:** ${opts.source}${opts.sourceNote ? ` — ${opts.sourceNote}` : ''}`);
  lines.push(`**Audited at:** ${new Date().toISOString()}`);
  lines.push(`**Audit run id:** \`${opts.runId.slice(0, 8)}\``);
  if (opts.failedChecks.length > 0) {
    lines.push('');
    lines.push(`⚠️ **Checks that failed to run:** ${opts.failedChecks.join(', ')}. Findings below are partial.`);
  }
  lines.push('');

  /* Summary table */
  const red    = opts.findings.filter(f => f.severity === 'red');
  const amber  = opts.findings.filter(f => f.severity === 'amber');
  const green  = opts.findings.filter(f => f.severity === 'green');
  const info   = opts.findings.filter(f => f.severity === 'info');

  /* Phase 16.3 — pre-render passes:
     1. Mark the foundational Critical finding for 🎯 badge
     2. Detect cross-finding converging evidence for the banner */
  pickFoundationalCritical(opts.findings);
  const convergingBanner = detectConvergingEvidence(opts.findings);

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Severity | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| 🔴 Critical | ${red.length} |`);
  lines.push(`| 🟡 Warning  | ${amber.length} |`);
  lines.push(`| 🟢 Pass     | ${green.length} |`);
  lines.push(`| ℹ️ Info     | ${info.length} |`);
  lines.push('');

  /* Source confidence — surface upfront so the reader can calibrate the
     report's trustworthiness BEFORE reading individual findings. */
  const conf = weightedFindingConfidence(opts.findings);
  lines.push('## Source confidence');
  lines.push('');
  if (conf.sourced_count > 0) {
    lines.push(`**Weighted confidence:** ${conf.mean}/100 across ${conf.sourced_count} sourced finding(s).`);
    const sourceCounts: Record<string, number> = {};
    for (const f of opts.findings) {
      const m = findingSourceMeta(f);
      if (m) sourceCounts[m.label] = (sourceCounts[m.label] || 0) + 1;
    }
    /* Phase 16.3 — credit SerpAPI as an enrichment source when ANY finding
       lists it in enrichment_sources. Counts how many findings were
       SerpAPI-enriched and adds them to the sources-used line. */
    const serpapiEnrichedCount = opts.findings.filter(f =>
      Array.isArray(f.enrichment_sources) && f.enrichment_sources.includes('serpapi')).length;
    if (serpapiEnrichedCount > 0) {
      sourceCounts['SerpAPI (live SERP enrichment)'] = serpapiEnrichedCount;
    }
    const sourceList = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => `${label} (${count})`)
      .join(', ');
    lines.push(`**Sources used:** ${sourceList}.`);
  } else {
    lines.push('**No findings declared a data source.** Confidence treated as low — investigate before acting.');
  }
  if (conf.unattributed_count > 0) {
    lines.push('');
    lines.push(`⚠️ ${conf.unattributed_count} finding(s) lack a data-source attribution. Confidence calculation excluded them.`);
  }
  lines.push('');

  /* Critical first — Phase 16.3 prepends the converging-evidence banner
     when 2+ Critical findings corroborate the same diagnosis, and marks
     the foundational finding with 🎯. */
  if (red.length > 0) {
    lines.push('## 🔴 Critical issues (fix first)');
    lines.push('');
    if (convergingBanner) {
      lines.push(convergingBanner);
      lines.push('');
    }
    for (const f of red) {
      const foundationalBadge = f.is_foundational ? '🎯 ' : '';
      lines.push(`### ${foundationalBadge}${f.finding_title}`);
      if (f.is_foundational) {
        lines.push('');
        lines.push(`> **Foundational fix — address this Critical first.** This finding's recommendation, if adopted, will reframe the remaining Critical findings (their context resets against the corrected target). Sequencing matters: tactical fixes done in the wrong order get undone.`);
      }
      if (f.finding_detail)  lines.push(f.finding_detail);
      if (f.recommendation)  { lines.push(''); lines.push(`**Recommendation:** ${f.recommendation}`); }
      const meta = findingSourceMeta(f);
      if (meta) {
        const enrichmentNote = Array.isArray(f.enrichment_sources) && f.enrichment_sources.length > 0
          ? ` · enriched by ${f.enrichment_sources.join(', ')}`
          : '';
        lines.push(`*Source · ${meta.label} · confidence ${meta.confidence}/100${enrichmentNote}*`);
      }
      lines.push('');
    }
  }

  if (amber.length > 0) {
    lines.push('## 🟡 Warnings (improve when possible)');
    lines.push('');
    for (const f of amber) {
      lines.push(`### ${f.finding_title}`);
      if (f.finding_detail)  lines.push(f.finding_detail);
      if (f.recommendation)  { lines.push(''); lines.push(`**Recommendation:** ${f.recommendation}`); }
      const meta = findingSourceMeta(f);
      if (meta) lines.push(`*Source · ${meta.label} · confidence ${meta.confidence}/100*`);
      lines.push('');
    }
  }

  if (green.length > 0) {
    lines.push('## 🟢 Passing checks');
    lines.push('');
    for (const f of green) {
      const meta = findingSourceMeta(f);
      const sourceTag = meta ? ` · *${meta.label}*` : '';
      lines.push(`- **${f.finding_title}**${f.finding_detail ? ` — ${f.finding_detail}` : ''}${sourceTag}`);
    }
    lines.push('');
  }

  if (info.length > 0) {
    lines.push('## ℹ️ Information');
    lines.push('');
    for (const f of info) {
      const meta = findingSourceMeta(f);
      const sourceTag = meta ? ` · *${meta.label}*` : '';
      lines.push(`- **${f.finding_title}**${f.finding_detail ? ` — ${f.finding_detail}` : ''}${sourceTag}`);
      if (f.recommendation) lines.push(`  - ${f.recommendation}`);
    }
    lines.push('');
  }

  /* Honest note about scope */
  lines.push('## Audit scope');
  lines.push('');
  lines.push('This audit checks: **indexability** (HTTP status, robots directives, GSC presence), **on-page fundamentals** (title, meta description, H1, word count, alt text, canonical, internal links — tracking pixels filtered from the alt-text count), **Core Web Vitals** (LCP, INP, CLS — mobile + desktop), **engagement signals** (per-page GA4 with site-wide fallback — engagement rate, avg session duration, bounce rate, views, conversions for the audited URL), **schema markup** (JSON-LD types + per-type field validation including FAQPage Q&A structure and visible-content match, HowTo steps, Article/Product/Review required fields), **keyword presence** (campaign keyword in title/H1/URL/meta/first paragraph, with decision-tree recommendation when page is built for a different topic), **CTR vs expected-for-position** (actual click-through rate vs published position benchmarks, with SerpAPI verification of SERP features — AI Overview, featured snippet, PAA, ads density — to resolve underperformance hypotheses when a SerpAPI key is configured, plus business-impact translation to missed monthly clicks + dollar opportunity), **GSC query distribution** (top queries this URL actually ranks for), **first-paragraph topicality** (does above-the-fold copy actually relate to the title/H1, catching templated hero copy and product taglines that don\'t match the page\'s stated subject), **heading-hierarchy vs PAA content gap** (does the page\'s H2/H3 outline answer the People Also Ask questions on the live SERP — missing PAA coverage is a content gap that hurts both AI Overview citation and PAA capture), **diffuse-intent SERP detection** (LLM-classifies the top-10 domains by intent category — flags when 3+ distinct intents appear, signaling Google itself can\'t decide what users want and SEO economics are harder), **competitive content benchmark** (fetches top-10 ranking competitors, derives median word count + heading count, compares this page\'s depth to the SERP-grade benchmark), **anchor-text quality** (classifies internal anchors as generic/url-based/single-word/descriptive; flags when >40% are generic-or-URL-based), **content freshness** (Last-Modified header + schema dateModified/datePublished + visible "Updated:" pattern detection + year-in-title vs detected-date mismatch; flags pages >24 months stale as red, 12-24 months as amber), **image optimization** (count, lazy-loading coverage, alt-text completeness, modern format usage — webp/avif vs jpg/png/gif; flags lazy-loading <50% on 10+ image pages and alt-coverage <80% on 5+ image pages), **hreflang validation** (when present: validates ISO language codes, self-reference, x-default presence, and duplicate-language conflicts), **converging-evidence detection** (when 2+ Critical findings share signals like keyword-mismatch and url-not-in-top-10, surfaces an explicit cross-finding reinforcement banner), **foundational-fix sequencing** (marks 🎯 on the Critical finding whose recommendation would reframe others if addressed first).');
  lines.push('');
  lines.push('Not yet covered: **schema rich-results testing** (currently uses offline per-type validation including FAQPage content-match; Google Rich Results Test API integration for authoritative confirmation is on the roadmap), **anchor reciprocity check** (currently analyzes outbound anchor quality; cross-domain inbound-anchor analysis requires a separate crawler or backlink API), **full site crawl**, **manual penalty checks**, **log file analysis**, **actual image byte-weight breakdown** (currently checks structural patterns; per-asset HEAD requests would add the bytes dimension), **font loading**, **HTTP/2 push and resource hints**, **CSP / security headers analysis**. These will come in later phases.');

  return lines.join('\n');
}
