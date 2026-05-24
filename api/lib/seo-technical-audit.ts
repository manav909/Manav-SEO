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
    ]);

    const findings: Finding[] = [];
    const failedChecks: string[] = [];
    for (let i = 0; i < checkResults.length; i++) {
      const r = checkResults[i];
      if (r.status === 'fulfilled') {
        findings.push(...r.value);
      } else {
        const checkName = ['indexability','on_page','cwv','engagement','schema'][i];
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

  /* Images without alt */
  const imgMatches = html.match(/<img[^>]+>/gi) || [];
  const imgsWithoutAlt = imgMatches.filter(img => !/\salt=/i.test(img));
  if (imgMatches.length > 0 && imgsWithoutAlt.length > 0) {
    const pct = Math.round((imgsWithoutAlt.length / imgMatches.length) * 100);
    findings.push({
      audit_kind: 'on_page_fundamentals',
      severity: pct > 50 ? 'amber' : 'info',
      finding_title:  `${imgsWithoutAlt.length} of ${imgMatches.length} images missing alt text (${pct}%)`,
      finding_detail: 'Alt text helps screen readers, image search ranking, and acts as backup if images fail to load.',
      recommendation: 'Add descriptive alt text to every meaningful image. Decorative images can use alt="".',
      evidence: { total_images: imgMatches.length, missing_alt: imgsWithoutAlt.length },
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

  /* Read site-wide GA4 engagement metrics from project_knowledge */
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

  /* Engagement rate thresholds */
  if (engagementRate < 40) {
    findings.push({
      audit_kind: 'engagement_signals', severity: 'amber',
      finding_title:  `Site-wide engagement rate is low (${engagementRate.toFixed(1)}%)`,
      finding_detail: `Engagement rate below 40% suggests visitors don\'t find what they expect. While this is a site-wide metric (not page-specific), it provides context for how this page may perform.`,
      recommendation: 'Audit content for matching search intent. Improve above-the-fold clarity. Check for intrusive popups or slow load times.',
      evidence: { engagement_rate_pct: engagementRate, source: 'site-wide' },
      data_source: 'ga4',
    });
  } else {
    findings.push({
      audit_kind: 'engagement_signals', severity: 'green',
      finding_title:  `Site-wide engagement rate: ${engagementRate.toFixed(1)}%`,
      finding_detail: 'Healthy engagement provides a positive backdrop for individual pages.',
      evidence: { engagement_rate_pct: engagementRate },
      data_source: 'ga4',
    });
  }

  if (avgSessionSec > 0 && avgSessionSec < 30) {
    findings.push({
      audit_kind: 'engagement_signals', severity: 'amber',
      finding_title:  `Site-wide avg session duration is short (${Math.round(avgSessionSec)}s)`,
      finding_detail: 'Short sessions across the site suggest content either doesn\'t hold attention or visitors find what they need quickly.',
      recommendation: 'For content pages, surface related content, add table of contents, embed videos. For tools, this metric is less meaningful.',
      evidence: { avg_session_sec: avgSessionSec },
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
  lines.push('This audit checks: indexability (HTTP status, robots directives, GSC presence), on-page fundamentals (title, meta description, H1, word count, alt text, canonical, internal links), Core Web Vitals (LCP, INP, CLS — mobile + desktop), engagement signals (site-wide GA4), and schema markup (JSON-LD types).');
  lines.push('');
  lines.push('Not yet covered: page-specific GA4 metrics, full site crawl, manual penalty checks, log file analysis, image weight breakdown, font loading, hreflang. These will come in later phases.');

  return lines.join('\n');
}
