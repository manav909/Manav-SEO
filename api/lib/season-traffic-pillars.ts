/* ════════════════════════════════════════════════════════════════
   api/lib/season-traffic-pillars.ts

   Traffic Growth campaign pillars — designed for MULTI-PAGE coverage.

   Unlike rank-for-keyword pillars (which analyse ONE page for ONE
   keyword), these pillars cover ALL target pages of the objective.
   To keep per-page quality high without hitting Vercel timeouts,
   each pillar processes pages in BATCHES and tracks coverage:

     pages_total    — total target pages on the objective
     pages_covered  — how many have been analysed so far
     batch_size     — pages per recheck run (small = high quality)

   The pipeline seeds the first batch. The recheck cadence works
   through remaining pages. Once pages_covered === pages_total, the
   next recheck re-audits from the top (fresh data).

   Coverage tracking lives in seo_campaign_panels.coverage_state (jsonb).
════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

export interface TrafficPillarSpec {
  pillar:               string;
  display_order:        number;
  label:               string;
  goal_summary:         string;
  recheck_cadence_days: number;
  batch_size:           number;   // pages analysed per run — sized for quality + timeout safety
  data_sources:         string[]; // which integrations this pillar leverages
}

/* 7 pillars, each mapped to the integrations it leverages.
   batch_size is tuned: HTML fetch is fast (8), PSI is slow (3),
   GA4/GSC reads are fast (10). */
export const TRAFFIC_GROWTH_PILLARS: TrafficPillarSpec[] = [
  {
    pillar:               'visibility',
    display_order:        1,
    label:                'Visibility',
    goal_summary:         'Track which target pages are indexed and appearing in Google. Identify invisible pages across the whole page set.',
    recheck_cadence_days: 7,
    batch_size:           20,  // GSC read is cheap — can cover many pages
    data_sources:         ['GSC pages', 'GSC queries'],
  },
  {
    pillar:               'query_opportunity',
    display_order:        2,
    label:                'Query Opportunity',
    goal_summary:         'Track quick-win queries (positions 4-20), CTR gaps, and competitor SERP positioning across all pages.',
    recheck_cadence_days: 7,
    batch_size:           15,
    data_sources:         ['GSC queries', 'SerpAPI'],
  },
  {
    pillar:               'on_page_health',
    display_order:        3,
    label:                'On-Page Health',
    goal_summary:         'Audit title tags, H1s, meta, content depth, and schema for every target page. Batched HTML crawl.',
    recheck_cadence_days: 14,
    batch_size:           8,   // live HTML fetch per page
    data_sources:         ['Live HTML fetch'],
  },
  {
    pillar:               'technical_performance',
    display_order:        4,
    label:                'Technical Performance',
    goal_summary:         'Core Web Vitals (LCP, TBT, CLS) per page via live PSI. Batched to respect rate limits.',
    recheck_cadence_days: 14,
    batch_size:           3,   // PSI is slow — small batches
    data_sources:         ['PageSpeed Insights'],
  },
  {
    pillar:               'internal_links',
    display_order:        5,
    label:                'Internal Links',
    goal_summary:         'Map internal link flow from authority pages to target pages. Identify isolated pages site-wide.',
    recheck_cadence_days: 30,
    batch_size:           10,
    data_sources:         ['Live HTML fetch', 'GSC pages'],
  },
  {
    pillar:               'engagement',
    display_order:        6,
    label:                'Engagement',
    goal_summary:         'Live GA4 per-page engagement: sessions, engagement rate, bounce, conversions. Find pages that get traffic but do not convert.',
    recheck_cadence_days: 7,
    batch_size:           10,
    data_sources:         ['GA4'],
  },
  {
    pillar:               'monitoring',
    display_order:        7,
    label:                'Monitoring',
    goal_summary:         'Track aggregate organic traffic trajectory vs target. Escalate when pages slip or growth stalls.',
    recheck_cadence_days: 1,
    batch_size:           50,  // aggregate read, no per-page heavy work
    data_sources:         ['GSC pages', 'GA4'],
  },
];

/* ─── Create panels for a traffic_growth campaign ──────────────────
   Idempotent — only creates panels that don't already exist. */
export async function createTrafficPillars(opts: {
  campaignId: string;
  projectId:  string;
  targetUrls: string[];
}): Promise<{ success: boolean; created: number; error?: string }> {
  try {
    // Check which pillars already exist (idempotent)
    const { data: existing } = await db().from("seo_campaign_panels")
      .select("pillar").eq("campaign_id", opts.campaignId);
    const existingPillars = new Set(((existing || []) as any[]).map(p => p.pillar));

    const pagesTotal = opts.targetUrls.length;
    const toCreate = TRAFFIC_GROWTH_PILLARS
      .filter(p => !existingPillars.has(p.pillar))
      .map(p => ({
        campaign_id:          opts.campaignId,
        project_id:           opts.projectId,
        pillar:               p.pillar,
        display_order:        p.display_order,
        status:               'active',
        goal_summary:         p.goal_summary,
        recheck_cadence_days: p.recheck_cadence_days,
        next_recheck_at:      new Date(Date.now() + p.recheck_cadence_days * 86_400_000).toISOString(),
        current_status:       null,
        current_summary:      `0 of ${pagesTotal} pages analysed`,
        coverage_state:       { pages_total: pagesTotal, pages_covered: 0, batch_size: p.batch_size, last_index: 0 },
      }));

    if (toCreate.length === 0) return { success: true, created: 0 };

    let { error } = await db().from("seo_campaign_panels").insert(toCreate);

    // Resilience: if the coverage_state column doesn't exist yet (migration not
    // run), the insert fails. Retry WITHOUT coverage_state so pillars still get
    // created — coverage shows in current_summary instead of a progress bar.
    if (error && /coverage_state/i.test(error.message || "")) {
      const withoutCoverage = toCreate.map(({ coverage_state, ...rest }: any) => rest);
      const retry = await db().from("seo_campaign_panels").insert(withoutCoverage);
      error = retry.error;
    }

    if (error) return { success: false, created: 0, error: error.message };
    return { success: true, created: toCreate.length };
  } catch (e: any) {
    return { success: false, created: 0, error: e?.message };
  }
}

/* ─── Update a pillar's coverage + summary after a batch run ──────── */
export async function updatePillarCoverage(opts: {
  campaignId:    string;
  pillar:        string;
  pagesCovered:  number;
  lastIndex:     number;
  summary:       string;
  reportBody?:   string;
}): Promise<void> {
  try {
    const { data: panel } = await db().from("seo_campaign_panels")
      .select("id, coverage_state, recheck_cadence_days")
      .eq("campaign_id", opts.campaignId).eq("pillar", opts.pillar).maybeSingle();
    if (!panel) return;

    const cov = (panel as any).coverage_state || {};
    const pagesTotal = cov.pages_total || 0;
    const cadence    = (panel as any).recheck_cadence_days || 7;
    const complete   = opts.pagesCovered >= pagesTotal;

    await db().from("seo_campaign_panels").update({
      last_assessed_at: new Date().toISOString(),
      current_status:   complete ? 'covered' : 'in_progress',
      current_summary:  opts.summary.slice(0, 500),
      coverage_state: {
        ...cov,
        pages_covered: opts.pagesCovered,
        last_index:    complete ? 0 : opts.lastIndex,  // reset to re-audit from top when complete
      },
      next_recheck_at:  new Date(Date.now() + (complete ? cadence : 0) * 86_400_000).toISOString(),
      updated_at:       new Date().toISOString(),
    }).eq("id", (panel as any).id);
  } catch { /* non-blocking */ }
}
