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

interface TargetResolution {
  url:    string;
  source: 'manual' | 'gsc_top_page' | 'strategy_plan';
  note?:  string;
}

interface Finding {
  audit_kind: 'indexability' | 'on_page_fundamentals' | 'core_web_vitals' | 'engagement_signals'
            | 'mobile_friendliness' | 'page_load' | 'schema_markup' | 'meta_tags'
            | 'internal_links' | 'canonical' | 'robots' | 'redirect';
  severity:       'green' | 'amber' | 'red' | 'info';
  finding_title:  string;
  finding_detail?: string;
  recommendation?: string;
  evidence?:      any;
  data_source?:   'gsc' | 'ga4' | 'psi' | 'html_fetch' | 'schema_parser';
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
      checkCtrVsExpected(target.url, c.project_id),
      checkQueryDistribution(target.url, c.project_id, c.keyword),
    ]);

    const findings: Finding[] = [];
    const failedChecks: string[] = [];
    for (let i = 0; i < checkResults.length; i++) {
      const r = checkResults[i];
      if (r.status === 'fulfilled') {
        findings.push(...r.value);
      } else {
        const checkName = ['indexability','on_page','cwv','engagement','schema','keyword_presence','ctr_vs_expected','query_distribution'][i];
        failedChecks.push(checkName);
      }
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
    const panelStatus: 'red' | 'amber' | 'green' = redCount > 0 ? 'red' : amberCount > 0 ? 'amber' : 'green';
    const headline = buildHeadline({ url: target.url, redCount, amberCount, greenCount, failedChecks });
    const bodyMd = renderAuditReport({
      keyword: c.keyword, url: target.url, source: target.source, sourceNote: target.note,
      findings, failedChecks, runId: auditRunId,
    });

    /* Honest confidence rating — combines per-finding source quality AND
       check-execution failures. Either dimension dropping low pulls the
       overall rating down. Previously this only counted failed checks,
       which meant a "green" verdict from a single html_fetch was rated
       the same as one cross-confirmed across GSC+GA4+audit. */
    const sourceConf = weightedFindingConfidence(findings);
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
      summary:          headline,
      tags:             ['technical_audit', `severity:${panelStatus}`, `url:${cleanUrl(target.url)}`,
                         ...(redCount > 0   ? ['has_red'] : []),
                         ...(amberCount > 0 ? ['has_amber'] : [])],
      metricSnapshot:   { red: redCount, amber: amberCount, green: greenCount, total: findings.length, failed_checks: failedChecks },
      updatePanelStatus: true,
      newPanelStatus:    panelStatus,
    });

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

  /* Title tag */
  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const title = titleMatch?.[1]?.trim() || '';
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

  /* Meta description */
  const metaDescMatch = /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html);
  const metaDesc = metaDescMatch?.[1]?.trim() || '';
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

  /* H1 tag(s) */
  const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gis) || [];
  const h1Count = h1Matches.length;
  const h1Text = h1Count > 0 ? h1Matches[0].replace(/<[^>]+>/g, '').trim() : '';
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

  /* Images without alt — list specific images for actionable fixes */
  const imgMatches = html.match(/<img[^>]+>/gi) || [];
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
      `${imgsWithoutAlt.length} of ${imgMatches.length} images (${pct}%) have no alt attribute.`,
    ];
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
      finding_title:  `${imgsWithoutAlt.length} of ${imgMatches.length} images missing alt text (${pct}%)`,
      finding_detail: detailLines.join('\n') + '\n\nAlt text helps screen readers, image search ranking, and acts as backup if images fail to load.',
      recommendation: 'Add descriptive alt text to every meaningful image. Decorative images can use alt="". For the listed image URLs, write 5-12 word descriptions of what the image shows.',
      evidence: { total_images: imgMatches.length, missing_alt: imgsWithoutAlt.length, missing_alt_srcs: missingSrcs, short_alt_count: imgsWithShortAlt },
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

  /* Internal links count */
  const linkMatches = html.match(/<a\s+[^>]*href=["']([^"']+)["']/gi) || [];
  const internalLinks = linkMatches.filter(l => {
    const hrefMatch = /href=["']([^"']+)["']/i.exec(l);
    const href = hrefMatch?.[1] || '';
    try {
      const target = new URL(href, url);
      const source = new URL(url);
      return target.hostname === source.hostname;
    } catch { return false; }
  });
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

  /* Extract the 5 locations */
  const titleMatch    = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const title         = titleMatch?.[1]?.trim() || '';
  const h1Match       = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const h1            = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';
  const metaDescMatch = /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html);
  const metaDesc      = metaDescMatch?.[1]?.trim() || '';
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
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'red',
      finding_title:  `Campaign keyword "${keyword}" missing from both title and H1`,
      finding_detail: `The keyword "${keyword}" does not appear in either the page title or the H1. These are the two strongest on-page ranking signals a Senior SEO Specialist would expect to align with the campaign target.\n\nCoverage breakdown:\n${tableRows}\n\nThe page may rank for this keyword via topical relevance, but absent of explicit keyword presence in title/H1, it will plateau well below top-3.`,
      recommendation: `Rewrite the page title and H1 to contain "${keyword}" naturally. If "${keyword}" is genuinely off-topic for this page, the campaign keyword is wrong — recheck whether this URL is the right target.`,
      evidence: { keyword, coverage, normalized_keyword: normalizeForKeywordMatch(keyword) },
      data_source: 'html_fetch',
    });
  } else if (bothPartial) {
    findings.push({
      audit_kind: 'on_page_fundamentals', severity: 'red',
      finding_title:  `Campaign keyword "${keyword}" only partially present in both title and H1 — significant alignment gap`,
      finding_detail: `Neither the title nor the H1 carries the full keyword phrase. Both have **partial** token coverage only — some tokens of "${keyword}" appear, others are absent.\n\nCoverage breakdown:\n${tableRows}\n\nThe page may be optimized for a related but distinct keyword — not the campaign target. A Senior SEO Specialist would call this a content-strategy mismatch: either the page needs rewriting, or the campaign keyword needs reassignment.`,
      recommendation: `Two options: (a) Rewrite the title and H1 to carry the full "${keyword}" phrase naturally — if it fits the page intent. (b) Change the campaign keyword to one that already matches the page's actual content. Don't try to rank a page for a keyword its title/H1 doesn't carry.`,
      evidence: { keyword, coverage, normalized_keyword: normalizeForKeywordMatch(keyword), missing_tokens_in_title: kwTokens.filter(t => !tokenInText(t, normalizeForKeywordMatch(title))), missing_tokens_in_h1: kwTokens.filter(t => !tokenInText(t, normalizeForKeywordMatch(h1))) },
      data_source: 'html_fetch',
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
      recommendation: `Update ${titleStrong ? 'the H1' : 'the title'} to include "${keyword}".`,
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

async function checkCtrVsExpected(url: string, projectId: string): Promise<Finding[]> {
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

    if (ratio < 0.5) {
      findings.push({
        audit_kind: 'engagement_signals',
        severity:   'red',
        finding_title:  `CTR is ${Math.round(ratio * 100)}% of expected for position ${position.toFixed(1)} — significant underperformance`,
        finding_detail: detail + `\n\nThis is a major underperformance signal. Either (a) the title/meta description is uncompelling at the SERP, or (b) the SERP for this query is dominated by features (AI Overview, featured snippet, PAA) that suppress organic CTR. Both are addressable.`,
        recommendation: `Rewrite the title and meta description for click appeal — front-load the benefit, include a number or specific outcome, and ensure the keyword sits at the start. Then check the live SERP for features that may be siphoning clicks.`,
        evidence: { actual_ctr_pct: Number(actualCtr.toFixed(2)), expected_ctr_pct: Number(expectedCtr.toFixed(1)), position, clicks, impressions, ratio_pct: Math.round(ratio * 100) },
        data_source: 'gsc',
      });
    } else if (ratio < 0.8) {
      findings.push({
        audit_kind: 'engagement_signals',
        severity:   'amber',
        finding_title:  `CTR is ${Math.round(ratio * 100)}% of expected for position ${position.toFixed(1)} — mild underperformance`,
        finding_detail: detail + `\n\nNot critical, but a clearer title or stronger meta description could earn measurably more clicks at this position.`,
        recommendation: `A/B candidates: lead the title with the searcher's intent verb, include a specific year/number for freshness, add a clear value proposition in the meta description.`,
        evidence: { actual_ctr_pct: Number(actualCtr.toFixed(2)), expected_ctr_pct: Number(expectedCtr.toFixed(1)), position, clicks, impressions, ratio_pct: Math.round(ratio * 100) },
        data_source: 'gsc',
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

  /* Look up PSI API key from project_integrations (provider='pagespeed') */
  const { data: psiInt } = await db().from("project_integrations")
    .select("api_key, status").eq("project_id", projectId).eq("provider", 'pagespeed').maybeSingle();
  const apiKey = (psiInt as any)?.api_key as string | undefined;

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
      recommendation: apiKey ? `Verify your PSI API key is valid.` : `Add a PageSpeed Insights API key in Data Room → Integrations for more reliable CWV data. PSI without a key is heavily rate-limited.`,
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
      findings.push({
        audit_kind: 'core_web_vitals', severity: sev,
        finding_title:  `${strat.toUpperCase()} LCP: ${(m.lcp_ms / 1000).toFixed(2)}s ${sev === 'red' ? '— exceeds the 4s threshold' : sev === 'amber' ? '— above the 2.5s target' : '— within target'}`,
        finding_detail: `Largest Contentful Paint measures how long the main content takes to render. Google\'s thresholds: <2.5s good, 2.5-4s needs improvement, >4s poor.${isFromCrux ? ' Data source: Chrome User Experience (real-user data).' : ' Data source: Lighthouse lab test.'}`,
        recommendation: sev === 'green' ? undefined : 'Optimize the largest element above the fold — usually a hero image or text block. Check image sizes, server response time, and render-blocking resources.',
        evidence: { strategy: strat, lcp_ms: m.lcp_ms, source: isFromCrux ? 'crux' : 'lab' },
        data_source: 'psi',
      });
    }

    if (m.inp_ms !== undefined && m.inp_ms !== null) {
      const sev: 'green'|'amber'|'red' = m.inp_ms < 200 ? 'green' : m.inp_ms < 500 ? 'amber' : 'red';
      findings.push({
        audit_kind: 'core_web_vitals', severity: sev,
        finding_title:  `${strat.toUpperCase()} INP: ${Math.round(m.inp_ms)}ms ${sev === 'red' ? '— interactions feel sluggish' : sev === 'amber' ? '— noticeable delay' : '— responsive'}`,
        finding_detail: `Interaction to Next Paint measures responsiveness to user input. Thresholds: <200ms good, 200-500ms needs improvement, >500ms poor.`,
        recommendation: sev === 'green' ? undefined : 'Reduce main-thread blocking JavaScript. Defer non-critical scripts; break up long tasks; use web workers for heavy computation.',
        evidence: { strategy: strat, inp_ms: m.inp_ms },
        data_source: 'psi',
      });
    }

    if (m.cls !== undefined && m.cls !== null) {
      const sev: 'green'|'amber'|'red' = m.cls < 0.1 ? 'green' : m.cls < 0.25 ? 'amber' : 'red';
      findings.push({
        audit_kind: 'core_web_vitals', severity: sev,
        finding_title:  `${strat.toUpperCase()} CLS: ${m.cls.toFixed(3)} ${sev === 'red' ? '— elements shift significantly during load' : sev === 'amber' ? '— some layout shifts' : '— stable layout'}`,
        finding_detail: 'Cumulative Layout Shift measures visual stability. Thresholds: <0.1 good, 0.1-0.25 needs improvement, >0.25 poor.',
        recommendation: sev === 'green' ? undefined : 'Set explicit width+height on images and embeds. Avoid injecting content above existing content. Preload web fonts.',
        evidence: { strategy: strat, cls: m.cls },
        data_source: 'psi',
      });
    }
  }

  if (!apiKey) {
    findings.push({
      audit_kind: 'core_web_vitals', severity: 'info',
      finding_title:  'No PageSpeed Insights API key configured',
      finding_detail: 'CWV checks ran without an API key. PSI rate-limits keyless requests; future audits may fail or return cached data.',
      recommendation: 'Get a free PSI key at https://developers.google.com/speed/docs/insights/v5/get-started and add it under Data Room → Integrations → PageSpeed Insights.',
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

  /* Read site-wide GA4 engagement metrics from project_knowledge.
     IMPORTANT: GA4 currently persists only site-wide aggregates; per-URL
     engagement requires a future pm-ga4 enhancement (top-pages dimension).
     Until then, this check is INFO-level only — it is NOT a page-level
     pass/fail. Marking it green would be synthesis-as-fact (claiming the
     page is engaging when we're really measuring the whole site). */
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
      audit_kind: 'engagement_signals', severity: 'info',
      finding_title:  'No GA4 engagement data available',
      finding_detail: 'Connect GA4 in Data Room → Integrations to enable engagement signal analysis. Engagement is a soft ranking factor and a strong predictor of content quality.',
      data_source: 'ga4',
    });
    return findings;
  }

  /* Engagement rate context — surfaced as INFO since this is site-wide,
     not page-specific. Senior DMS rule: don't dress site-wide stats as
     page-level performance. */
  if (engagementRate < 40) {
    findings.push({
      audit_kind: 'engagement_signals', severity: 'amber',
      finding_title:  `Site-wide engagement rate is low (${engagementRate.toFixed(1)}%) — context only`,
      finding_detail: `Engagement rate below 40% suggests visitors don't find what they expect across the site. This is a **site-wide** metric, not page-specific — it provides backdrop, not a verdict on this page.`,
      recommendation: 'Audit content for matching search intent. Improve above-the-fold clarity. Check for intrusive popups or slow load times. Per-page engagement requires a pm-ga4 enhancement to pull top_pages with engagement metrics.',
      evidence: { engagement_rate_pct: engagementRate, scope: 'site-wide' },
      data_source: 'ga4',
    });
  } else {
    findings.push({
      audit_kind: 'engagement_signals', severity: 'info',
      finding_title:  `Site-wide engagement rate: ${engagementRate.toFixed(1)}% (site-wide, not page-specific)`,
      finding_detail: 'Healthy site-wide engagement provides a positive backdrop for individual pages. **This is not a page-level verdict** — per-URL GA4 metrics require a pm-ga4 top-pages-by-engagement query that has not yet been added.',
      recommendation: 'To turn this into a page-level signal: add a per-page GA4 fetch to pm-ga4.ts (dimensions: pagePath, metrics: engagementRate, averageSessionDuration, eventsPerSession).',
      evidence: { engagement_rate_pct: engagementRate, scope: 'site-wide' },
      data_source: 'ga4',
    });
  }

  if (avgSessionSec > 0 && avgSessionSec < 30) {
    findings.push({
      audit_kind: 'engagement_signals', severity: 'amber',
      finding_title:  `Site-wide avg session duration is short (${Math.round(avgSessionSec)}s) — context only`,
      finding_detail: 'Short sessions across the site suggest content either doesn\'t hold attention or visitors find what they need quickly. **Site-wide signal**, not page-specific.',
      recommendation: 'For content pages, surface related content, add table of contents, embed videos. For tools, this metric is less meaningful. Per-page session duration requires the pm-ga4 enhancement noted above.',
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

  /* Try to parse and detect types */
  const types: string[] = [];
  const errors: string[] = [];
  for (const block of jsonLdMatches) {
    const content = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
    try {
      const parsed = JSON.parse(content);
      const collectTypes = (obj: any) => {
        if (!obj) return;
        if (Array.isArray(obj)) { obj.forEach(collectTypes); return; }
        const t = obj['@type'];
        if (typeof t === 'string') types.push(t);
        else if (Array.isArray(t)) types.push(...t.filter(x => typeof x === 'string'));
        if (obj['@graph']) collectTypes(obj['@graph']);
      };
      collectTypes(parsed);
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

  /* Critical first */
  if (red.length > 0) {
    lines.push('## 🔴 Critical issues (fix first)');
    lines.push('');
    for (const f of red) {
      lines.push(`### ${f.finding_title}`);
      if (f.finding_detail)  lines.push(f.finding_detail);
      if (f.recommendation)  { lines.push(''); lines.push(`**Recommendation:** ${f.recommendation}`); }
      const meta = findingSourceMeta(f);
      if (meta) lines.push(`*Source · ${meta.label} · confidence ${meta.confidence}/100*`);
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
  lines.push('This audit checks: **indexability** (HTTP status, robots directives, GSC presence), **on-page fundamentals** (title, meta description, H1, word count, alt text, canonical, internal links), **Core Web Vitals** (LCP, INP, CLS — mobile + desktop), **engagement signals** (site-wide GA4 — context only), **schema markup** (JSON-LD types), **keyword presence** (campaign keyword in title/H1/URL/meta/first paragraph), **CTR vs expected-for-position** (actual click-through rate vs published position benchmarks), and **GSC query distribution** (top queries this URL actually ranks for, with per-query CTR and campaign-keyword match check).');
  lines.push('');
  lines.push('Not yet covered: **per-page GA4 metrics** (engagement, bounce, sessions by URL — requires a pm-ga4 top-pages-by-engagement query), **SERP feature awareness** (featured snippet, PAA, AI Overview presence — requires SerpAPI integration), **competitive content benchmark** (word count + topical coverage vs top-10 ranking pages), **schema validation** (currently checks presence, not validity), **full site crawl**, **manual penalty checks**, **log file analysis**, **image weight breakdown**, **font loading**, **hreflang**. These will come in later phases.');

  return lines.join('\n');
}
