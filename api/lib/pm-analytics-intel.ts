/* ════════════════════════════════════════════════════════════════
   api/lib/pm-analytics-intel.ts
   Phase 1J — Strategic intelligence layer over GSC + GA4 raw data.

   This module is PURE COMPUTATION — it takes raw data already pulled
   by pm-gsc.ts / pm-ga4.ts (multiple time periods + dimension breakdowns)
   and derives 15 strategic KPIs no other SEO platform surfaces in this
   exact form.

   Design principle: every KPI must be DEFENSIBLE (computable from
   first principles, documented formula, no black-box ML). PMs and
   investors can reproduce these from the raw numbers if asked.

   The output is a single object that the pullers serialize into
   project_knowledge.analytics:
     - analytics_period_summary   (totals across 7 time windows + deltas)
     - analytics_intel_kpis       (the 15 strategic KPIs)
     - analytics_rising_stars     (queries trending up — about to rank)
     - analytics_falling_stars    (queries trending down — need investigation)
     - analytics_cannibalization  (multiple pages competing for same query)
     - analytics_query_velocity   (new vs lost queries period over period)

   Combined with the multi-period raw data already in Data Room, this
   gives the AI + UI everything needed to write data-grounded reports,
   power scope-based charts, and feed the upcoming What-If Simulator.
═══════════════════════════════════════════════════════════════ */

/* ─── Types ──────────────────────────────────────────────────── */

export interface GscDailyRow {
  date:        string;   /* YYYY-MM-DD */
  clicks:      number;
  impressions: number;
  position:    number;   /* lower = better */
  ctr:         number;   /* 0..1 */
}

export interface GscQueryRow {
  query:       string;
  clicks:      number;
  impressions: number;
  position:    number;
  ctr:         number;   /* 0..100 (% form for display) */
}

export interface GscPageRow {
  page:        string;
  clicks:      number;
  impressions: number;
  position:    number;
  ctr:         number;
}

export interface GscDimensionRow {
  key:         string;
  clicks:      number;
  impressions: number;
}

export interface Ga4DailyRow {
  date:               string;   /* YYYY-MM-DD */
  sessions:           number;
  users:              number;
  engagedSessions:    number;
  conversions:        number;
  bounceRate:         number;   /* 0..100 (% form) */
  avgSessionDuration: number;   /* seconds */
}

export interface Ga4DimensionRow {
  key:           string;
  sessions:      number;
  users?:        number;
  conversions?:  number;
}

export interface PeriodSummary {
  windowLabel:  string;
  fromDate:     string;
  toDate:       string;
  dayCount:     number;
  /* GSC */
  gscClicks:        number;
  gscImpressions:   number;
  gscAvgPosition:   number;
  gscCtr:           number;   /* % */
  /* GA4 */
  ga4Sessions:        number;
  ga4Users:           number;
  ga4EngagedSessions: number;
  ga4Conversions:     number;
  ga4BounceRate:      number;   /* % */
  ga4AvgDuration:     number;   /* seconds */
  ga4EngagementRate:  number;   /* engagedSessions/sessions, % */
}

export interface PeriodDelta {
  fromLabel:     string;
  toLabel:       string;
  clicks:        Delta;
  impressions:   Delta;
  position:      Delta;   /* note: lower is better, so flip sign of pctChange */
  sessions:      Delta;
  conversions:   Delta;
  bounceRate:    Delta;
  ctr:           Delta;
}

export interface Delta {
  from:        number;
  to:          number;
  change:      number;
  pctChange:   number;     /* 0..1 (use for display formatting upstream) */
  direction:   "up" | "down" | "flat";
}

export type KpiHealth = "excellent" | "good" | "moderate" | "concern" | "critical" | "unknown";
export type KpiTrend  = "improving" | "stable" | "declining" | "unknown";

export interface StrategicKpi {
  key:            string;
  name:           string;
  category:       "stability" | "growth" | "quality" | "diversification" | "efficiency";
  definition:     string;
  value:          number | null;
  unit:           string;
  health:         KpiHealth;
  trend:          KpiTrend;
  recommendation: string;
  formula:        string;
  /** Optional metadata — sub-values, samples, etc. */
  meta?:          Record<string, any>;
}

export interface RisingStarQuery {
  query:           string;
  currentClicks:   number;
  previousClicks:  number;
  currentImpr:     number;
  previousImpr:    number;
  position:        number;
  impressionLift:  number;     /* % */
  opportunity:     "page_2_to_1" | "page_3_to_2" | "first_appearance" | "ranking_climber";
  reason:          string;
}

export interface FallingStarQuery {
  query:           string;
  currentClicks:   number;
  previousClicks:  number;
  currentImpr:     number;
  previousImpr:    number;
  position:        number;
  positionPrevious:number;
  clickLoss:       number;     /* % drop */
  severity:        "warning" | "critical";
  reason:          string;
}

export interface CannibalizationGroup {
  query:           string;
  pages:           Array<{ page: string; clicks: number; position: number }>;
  totalClicks:     number;
  positionSpread:  number;
  recommendation:  string;
}

export interface QueryVelocity {
  newQueriesCount:      number;
  lostQueriesCount:     number;
  retainedQueriesCount: number;
  newQueriesTopExamples:  string[];
  lostQueriesTopExamples: string[];
  discoveryRatePct:     number;
}

export interface AnalyticsIntelligence {
  generatedAt:   string;
  periods:       Record<string, PeriodSummary>;
  deltas:        Record<string, PeriodDelta>;
  kpis:          StrategicKpi[];
  risingStars:   RisingStarQuery[];
  fallingStars:  FallingStarQuery[];
  cannibalization: CannibalizationGroup[];
  queryVelocity: QueryVelocity;
  /* Composite scores */
  overallHealthScore: number;       /* 0..100 — weighted mix of KPI health */
  algorithmResilience: number;      /* 0..100 — stability-weighted */
  /* Build 12.18 — GEO / AI-era attribution snapshot. Sits as a top-level
     block (not folded into PeriodSummary) because GSC searchAppearance
     returns window totals, not daily-grain data. AI platform referrals
     DO have a daily series; geoSnapshot.platform_referrals.weeklyTrend
     carries the 7-vs-7-day growth signal derived from that series. */
  geoSnapshot: null | {
    aiOverview: null | {
      present:           boolean;
      impressions:       number;
      clicks:            number;
      ctr:               number;
      windowDays:        number;
      breakdown:         Array<{ appearance: string; impressions: number; clicks: number }>;
    };
    platformReferrals: null | {
      sessions:           number;
      users:              number;
      conversions:        number;
      platformCount:      number;
      platformsDetected:  string[];
      perPlatform:        Array<{ source: string; sessions: number; conversions: number }>;
      windowDays:         number;
      weeklyTrend:        'rising' | 'flat' | 'falling' | 'unknown';
      weeklyDeltaPct:     number | null;     // last 7d vs prior 7d
    };
    geoVisibilityScore:  number;     /* 0..100 composite */
    geoVisibilityGrade:  'absent' | 'emerging' | 'present' | 'established' | 'strong';
    measuredAt:          string;
  };
}

/* ─── Period derivation from daily-trend data ────────────────── */

/** Given a daily-trend array, slice it to a window and sum/avg as needed. */
function summarizeWindow(
  windowLabel: string,
  gscDaily: GscDailyRow[],
  ga4Daily: Ga4DailyRow[],
  daysAgoStart: number,
  daysAgoEnd: number,
): PeriodSummary {
  const today = todayUtc();
  const start = addDays(today, -daysAgoStart);
  const end   = addDays(today, -daysAgoEnd);
  const fromDate = isoDate(start);
  const toDate   = isoDate(end);

  const gscRows = gscDaily.filter((r) => r.date >= fromDate && r.date <= toDate);
  const ga4Rows = ga4Daily.filter((r) => r.date >= fromDate && r.date <= toDate);
  const dayCount = Math.max(gscRows.length, ga4Rows.length, daysAgoStart - daysAgoEnd);

  /* GSC sums */
  const gscClicks      = sum(gscRows, "clicks");
  const gscImpressions = sum(gscRows, "impressions");
  /* For position: impression-weighted average is the truthful aggregation */
  const gscAvgPosition = gscImpressions > 0
    ? gscRows.reduce((a, r) => a + r.position * r.impressions, 0) / gscImpressions
    : 0;
  const gscCtr = gscImpressions > 0 ? (gscClicks / gscImpressions) * 100 : 0;

  /* GA4 sums */
  const ga4Sessions        = sum(ga4Rows, "sessions");
  const ga4Users           = sum(ga4Rows, "users");
  const ga4EngagedSessions = sum(ga4Rows, "engagedSessions");
  const ga4Conversions     = sum(ga4Rows, "conversions");
  /* Bounce rate + duration: session-weighted average */
  const ga4BounceRate = ga4Sessions > 0
    ? ga4Rows.reduce((a, r) => a + r.bounceRate * r.sessions, 0) / ga4Sessions
    : 0;
  const ga4AvgDuration = ga4Sessions > 0
    ? ga4Rows.reduce((a, r) => a + r.avgSessionDuration * r.sessions, 0) / ga4Sessions
    : 0;
  const ga4EngagementRate = ga4Sessions > 0
    ? (ga4EngagedSessions / ga4Sessions) * 100
    : 0;

  return {
    windowLabel, fromDate, toDate, dayCount,
    gscClicks, gscImpressions,
    gscAvgPosition: round2(gscAvgPosition),
    gscCtr: round2(gscCtr),
    ga4Sessions, ga4Users, ga4EngagedSessions, ga4Conversions,
    ga4BounceRate:     round2(ga4BounceRate),
    ga4AvgDuration:    round1(ga4AvgDuration),
    ga4EngagementRate: round2(ga4EngagementRate),
  };
}

/* ─── Multi-period extraction (entry point #1) ───────────────── */

export function deriveAllPeriods(
  gscDaily: GscDailyRow[],
  ga4Daily: Ga4DailyRow[],
  baselineDate: string | null,
): Record<string, PeriodSummary> {
  const periods: Record<string, PeriodSummary> = {};

  /* Standard windows */
  periods.today            = summarizeWindow("Today",                 gscDaily, ga4Daily, 1,    0);
  periods.last_7d          = summarizeWindow("Last 7 days",           gscDaily, ga4Daily, 7,    0);
  periods.last_30d         = summarizeWindow("Last 30 days",          gscDaily, ga4Daily, 30,   0);
  periods.last_90d         = summarizeWindow("Last 90 days",          gscDaily, ga4Daily, 90,   0);
  periods.last_365d        = summarizeWindow("Last 365 days",         gscDaily, ga4Daily, 365,  0);

  /* Comparison windows */
  periods.previous_7d      = summarizeWindow("Previous 7 days",       gscDaily, ga4Daily, 14,   7);
  periods.previous_30d     = summarizeWindow("Previous 30 days",      gscDaily, ga4Daily, 60,   30);
  periods.previous_90d     = summarizeWindow("Previous 90 days",      gscDaily, ga4Daily, 180,  90);

  /* Year-over-year — same window, 1 year ago */
  periods.yoy_last_30d     = summarizeWindow("Same 30d, last year",   gscDaily, ga4Daily, 395,  365);
  periods.yoy_last_90d     = summarizeWindow("Same 90d, last year",   gscDaily, ga4Daily, 455,  365);

  /* Since baseline */
  if (baselineDate) {
    const baseline = new Date(baselineDate);
    const daysSince = Math.max(1, Math.floor((Date.now() - baseline.getTime()) / 86_400_000));
    periods.since_baseline = summarizeWindow("Since baseline", gscDaily, ga4Daily, daysSince, 0);
  }

  return periods;
}

/* ─── Period-over-period + YoY deltas ────────────────────────── */

export function deriveDeltas(periods: Record<string, PeriodSummary>): Record<string, PeriodDelta> {
  const deltas: Record<string, PeriodDelta> = {};

  const buildDelta = (label: string, fromKey: string, toKey: string) => {
    const f = periods[fromKey];
    const t = periods[toKey];
    if (!f || !t) return;
    deltas[label] = {
      fromLabel:   f.windowLabel,
      toLabel:     t.windowLabel,
      clicks:      delta(f.gscClicks,      t.gscClicks),
      impressions: delta(f.gscImpressions, t.gscImpressions),
      /* Position: LOWER is better. Standard delta sign is reversed for display
         convenience downstream — we keep raw direction here, UI flips meaning. */
      position:    delta(f.gscAvgPosition, t.gscAvgPosition),
      sessions:    delta(f.ga4Sessions,    t.ga4Sessions),
      conversions: delta(f.ga4Conversions, t.ga4Conversions),
      bounceRate:  delta(f.ga4BounceRate,  t.ga4BounceRate),
      ctr:         delta(f.gscCtr,         t.gscCtr),
    };
  };

  buildDelta("last_7d_vs_previous",       "previous_7d",     "last_7d");
  buildDelta("last_30d_vs_previous",      "previous_30d",    "last_30d");
  buildDelta("last_90d_vs_previous",      "previous_90d",    "last_90d");
  buildDelta("last_30d_yoy",              "yoy_last_30d",    "last_30d");
  buildDelta("last_90d_yoy",              "yoy_last_90d",    "last_90d");

  return deltas;
}

/* ─── Strategic KPIs (the 15) ────────────────────────────────── */

export function computeStrategicKpis(opts: {
  gscDaily:      GscDailyRow[];
  ga4Daily:      Ga4DailyRow[];
  gscPages:      GscPageRow[];
  gscQueries:    GscQueryRow[];
  gscCountries:  GscDimensionRow[];
  gscDevices:    GscDimensionRow[];
  ga4Channels:   Ga4DimensionRow[];
  ga4Devices:    Ga4DimensionRow[];
  ga4Countries:  Ga4DimensionRow[];
  periods:       Record<string, PeriodSummary>;
  deltas:        Record<string, PeriodDelta>;
  brandNames:    string[];           /* used for brand/non-brand split */
}): StrategicKpi[] {
  const k: StrategicKpi[] = [];

  /* ── 1. Position Volatility Index ────────────────────────── */
  {
    const last30 = opts.gscDaily.filter(d => d.position > 0).slice(-30);
    if (last30.length >= 7) {
      const stddev = stdDev(last30.map(d => d.position));
      const health: KpiHealth =
        stddev < 1   ? "excellent" :
        stddev < 2   ? "good"      :
        stddev < 3.5 ? "moderate"  :
        stddev < 5   ? "concern"   : "critical";
      const trend = trendFromDelta(opts.deltas.last_30d_vs_previous?.position, /*lowerIsBetter*/ true);
      k.push({
        key:        "position_volatility",
        name:       "Position Volatility Index",
        category:   "stability",
        definition: "Standard deviation of daily average ranking position over the last 30 days. High volatility means rankings are unstable — Google's confidence in your pages is shifting.",
        value:      round2(stddev),
        unit:       "σ positions",
        health, trend,
        formula:    "stddev(daily_avg_position) over 30 days",
        recommendation:
          stddev < 2   ? "Rankings are stable. Focus on growth opportunities."
        : stddev < 3.5 ? "Moderate volatility is normal during algorithm updates or content changes. Monitor your top 20 queries weekly."
        : stddev < 5   ? "Investigate which queries lost stability. Often signals competitor moves or thin content. Refresh top falling pages."
        :                "Critical volatility. Audit core money pages for E-E-A-T signals, refresh stale content, and check for crawl/index issues.",
        meta: { sample_days: last30.length },
      });
    }
  }

  /* ── 2. Click Concentration Index (CCI) ──────────────────── */
  {
    const totalPageClicks = opts.gscPages.reduce((a, p) => a + p.clicks, 0);
    if (totalPageClicks > 0) {
      const top10 = opts.gscPages.slice().sort((a, b) => b.clicks - a.clicks).slice(0, 10);
      const top10Clicks = top10.reduce((a, p) => a + p.clicks, 0);
      const cci = (top10Clicks / totalPageClicks) * 100;
      const health: KpiHealth =
        cci < 40 ? "excellent" :
        cci < 55 ? "good"      :
        cci < 70 ? "moderate"  :
        cci < 85 ? "concern"   : "critical";
      k.push({
        key:        "click_concentration",
        name:       "Click Concentration Index",
        category:   "diversification",
        definition: "Share of total clicks coming from the top 10 pages. High concentration means your site is brittle — losing one page knocks down a huge chunk of traffic.",
        value:      round1(cci),
        unit:       "% from top 10",
        health, trend: "unknown",
        formula:    "(clicks from top 10 pages / total clicks) × 100",
        recommendation:
          cci < 55 ? "Healthy long-tail. Your traffic is diversified across many pages."
        : cci < 70 ? "Moderately concentrated. Identify the next tier of pages and invest in content depth there."
        : cci < 85 ? "Top-heavy. Build out supporting content clusters around your money pages so authority spreads."
        :            "Single-page-risk. One algorithm hit could erase most traffic. Aggressively diversify topical coverage.",
        meta: { top_10_clicks: top10Clicks, total_clicks: totalPageClicks, top_10_pages: top10.length },
      });
    }
  }

  /* ── 3. Query Discovery Rate ─────────────────────────────── */
  {
    /* Approximated from a single 365d query set; refined elsewhere by
       comparing current vs prior 30d query sets. Here we use total
       unique queries as a proxy. */
    const uniqueQueries = opts.gscQueries.length;
    if (uniqueQueries > 0) {
      /* Heuristic: assume ~15% query churn is healthy. We score the
         absolute query count relative to expected volume per click bucket. */
      const expectedQueries = Math.max(50, Math.floor(opts.periods.last_30d?.gscClicks / 5) || 50);
      const ratio = uniqueQueries / expectedQueries;
      const health: KpiHealth =
        ratio > 1.5 ? "excellent" :
        ratio > 1.0 ? "good"      :
        ratio > 0.6 ? "moderate"  :
        ratio > 0.3 ? "concern"   : "critical";
      k.push({
        key:        "query_breadth",
        name:       "Query Breadth Score",
        category:   "growth",
        definition: "Number of unique queries earning impressions, relative to traffic volume. High breadth means topical coverage; low breadth means dependence on a few keywords.",
        value:      uniqueQueries,
        unit:       "unique queries",
        health, trend: "unknown",
        formula:    "count(distinct query) / expected_queries(clicks)",
        recommendation:
          ratio > 1.0 ? "Strong query coverage. Topic clusters are working."
        : ratio > 0.6 ? "Moderate coverage. Add supporting content to expand the query universe."
        :               "Narrow coverage. Few keywords carry the load. Build topic clusters, FAQ sections, and long-tail content.",
        meta: { unique_queries: uniqueQueries, expected_baseline: expectedQueries },
      });
    }
  }

  /* ── 4. Engagement Quality Index (EQI) ───────────────────── */
  {
    const p = opts.periods.last_30d;
    if (p && p.ga4Sessions > 0) {
      /* Composite: engagement_rate (%) × duration_normalized × (1 - bounce_rate%/100)
         Each component scaled 0..1 then averaged × 100 */
      const engagementComponent = clamp01(p.ga4EngagementRate / 100);
      const durationComponent   = clamp01(p.ga4AvgDuration / 180);  /* 3 min = 1.0 */
      const bounceComponent     = clamp01(1 - p.ga4BounceRate / 100);
      const eqi = ((engagementComponent + durationComponent + bounceComponent) / 3) * 100;
      const health: KpiHealth =
        eqi >= 70 ? "excellent" :
        eqi >= 55 ? "good"      :
        eqi >= 40 ? "moderate"  :
        eqi >= 25 ? "concern"   : "critical";
      const trend = trendFromDelta(opts.deltas.last_30d_vs_previous?.bounceRate, /*lowerIsBetter*/ true);
      k.push({
        key:        "engagement_quality",
        name:       "Engagement Quality Index",
        category:   "quality",
        definition: "Composite measure of traffic quality — engagement rate, average session duration, and inverse bounce rate. Investors care about THIS not raw sessions.",
        value:      round1(eqi),
        unit:       "/100",
        health, trend,
        formula:    "mean(engagement_rate%, duration/180s, 100% - bounce%) × 100",
        recommendation:
          eqi >= 55 ? "High-quality traffic. Optimize for conversion volume — engagement is strong."
        : eqi >= 40 ? "Decent engagement but room to grow. Investigate exit pages and add internal-link CTAs."
        :             "Low engagement. Content may not match search intent. Audit top landing pages: do they answer the query in the first 100 words?",
        meta: { engagement_rate: p.ga4EngagementRate, avg_duration: p.ga4AvgDuration, bounce_rate: p.ga4BounceRate },
      });
    }
  }

  /* ── 5. Brand vs Non-Brand Ratio ─────────────────────────── */
  if (opts.brandNames.length > 0) {
    const isBranded = (q: string) => {
      const lower = q.toLowerCase();
      return opts.brandNames.some((b) => b && lower.includes(b.toLowerCase()));
    };
    const totalClicks  = opts.gscQueries.reduce((a, q) => a + q.clicks, 0);
    const brandClicks  = opts.gscQueries.filter(q => isBranded(q.query)).reduce((a, q) => a + q.clicks, 0);
    if (totalClicks > 0) {
      const brandPct = (brandClicks / totalClicks) * 100;
      const health: KpiHealth =
        brandPct < 20 ? "concern"   :   /* almost all SEO-driven — fragile if algo hits */
        brandPct < 35 ? "good"      :
        brandPct < 55 ? "excellent" :   /* balanced brand+SEO */
        brandPct < 75 ? "good"      :
                        "moderate";     /* >75% brand = SEO underperforming */
      k.push({
        key:        "brand_vs_nonbrand",
        name:       "Brand vs Non-Brand Split",
        category:   "diversification",
        definition: "Share of clicks coming from branded queries (queries containing your brand name). A healthy mix means demand-gen marketing AND SEO are both working.",
        value:      round1(brandPct),
        unit:       "% branded",
        health, trend: "unknown",
        formula:    "(branded query clicks / total query clicks) × 100",
        recommendation:
          brandPct < 20 ? "Almost all traffic is unbranded — algorithm-driven. Invest in brand-building so future SEO changes don't erase you."
        : brandPct < 55 ? "Healthy mix. Demand-gen and SEO are working together."
        : brandPct < 75 ? "Brand-dominant. People come looking for you specifically — strong moat."
        :                 "Heavily brand-dependent. Most non-brand searches don't find you. Big SEO opportunity left on the table.",
        meta: { brand_clicks: brandClicks, total_clicks: totalClicks, brand_terms_matched: opts.brandNames },
      });
    }
  }

  /* ── 6. Geographic Concentration ─────────────────────────── */
  {
    const totalCountry = opts.gscCountries.reduce((a, c) => a + c.clicks, 0);
    if (totalCountry > 0 && opts.gscCountries.length > 0) {
      const top = opts.gscCountries.slice().sort((a, b) => b.clicks - a.clicks)[0];
      const topPct = (top.clicks / totalCountry) * 100;
      const health: KpiHealth =
        topPct < 50 ? "excellent" :
        topPct < 70 ? "good"      :
        topPct < 85 ? "moderate"  :
        topPct < 95 ? "concern"   : "critical";
      k.push({
        key:        "geographic_concentration",
        name:       "Geographic Concentration",
        category:   "diversification",
        definition: "Share of clicks coming from the top single country. High concentration = single-market risk; investors flag this in due diligence.",
        value:      round1(topPct),
        unit:       `% from ${top.key}`,
        health, trend: "unknown",
        formula:    "(top country clicks / total clicks) × 100",
        recommendation:
          topPct < 70 ? "Diversified geography. Resilient to single-market shocks."
        : topPct < 85 ? "Concentrated in one market. Strong foothold but consider testing one secondary geography."
        :               "Single-market risk. If currency, regulation, or competition changes in that region, traffic could halve overnight. Test localized content for adjacent markets.",
        meta: { top_country: top.key, top_country_clicks: top.clicks, total_clicks: totalCountry },
      });
    }
  }

  /* ── 7. Mobile-First Score ───────────────────────────────── */
  {
    const totalDevice = opts.ga4Devices.reduce((a, d) => a + d.sessions, 0)
                     || opts.gscDevices.reduce((a, d) => a + d.clicks, 0);
    if (totalDevice > 0) {
      const devices = opts.ga4Devices.length > 0 ? opts.ga4Devices : opts.gscDevices.map(d => ({ key: d.key, sessions: d.clicks }));
      const mobile = devices.find(d => /mobile/i.test(d.key));
      const mobileShare = mobile ? (mobile.sessions / totalDevice) * 100 : 0;
      const health: KpiHealth =
        mobileShare >= 60 && mobileShare <= 80 ? "excellent" :
        mobileShare >= 45 && mobileShare <  60 ? "good"      :
        mobileShare >= 30 && mobileShare <  45 ? "moderate"  :
        mobileShare <  30                       ? "concern"  : "good";
      k.push({
        key:        "mobile_first_score",
        name:       "Mobile-First Score",
        category:   "efficiency",
        definition: "Share of traffic from mobile devices. Google indexes mobile-first since 2021; under-investment in mobile UX has measurable algorithmic cost.",
        value:      round1(mobileShare),
        unit:       "% mobile",
        health, trend: "unknown",
        formula:    "(mobile sessions / total sessions) × 100",
        recommendation:
          mobileShare >= 60 && mobileShare <= 80 ? "Mobile-aligned audience. Continue mobile-first design investments."
        : mobileShare <  30                       ? "Desktop-heavy traffic — unusual. Confirm tracking is correct and that mobile UX isn't pushing users away."
        : mobileShare >  85                       ? "Mobile-exclusive. Ensure desktop UX isn't broken — verify tracking and check if desktop users bounce instantly."
        :                                           "Balanced device mix. Invest in mobile Core Web Vitals — this is your algorithmic upside.",
        meta: { device_breakdown: devices.slice(0, 5) },
      });
    }
  }

  /* ── 8. CTR Health vs Position Benchmark ─────────────────── */
  {
    /* Industry CTR benchmarks by avg position (Sistrix 2023 study, widely cited) */
    const ctrBenchmark = (pos: number): number => {
      const table: [number, number][] = [
        [1, 28.5], [2, 15.7], [3, 11.0], [4, 8.0], [5, 7.2],
        [6, 5.1],  [7, 4.0],  [8, 3.2],  [9, 2.8], [10, 2.5],
      ];
      const rounded = Math.round(pos);
      const found = table.find(([p]) => p === rounded);
      if (found) return found[1];
      if (rounded > 10) return 1.5;
      return 28.5;
    };
    const p30 = opts.periods.last_30d;
    if (p30 && p30.gscImpressions > 0 && p30.gscAvgPosition > 0) {
      const expected = ctrBenchmark(p30.gscAvgPosition);
      const actual   = p30.gscCtr;
      const ratio    = actual / expected;
      const health: KpiHealth =
        ratio >= 1.2 ? "excellent" :
        ratio >= 0.95 ? "good"     :
        ratio >= 0.75 ? "moderate" :
        ratio >= 0.5  ? "concern"  : "critical";
      k.push({
        key:        "ctr_vs_benchmark",
        name:       "CTR vs Position Benchmark",
        category:   "efficiency",
        definition: "Your click-through rate compared to industry CTR at your average ranking position. Outperforming = strong titles/snippets; underperforming = title/meta opportunity.",
        value:      round1(ratio * 100),
        unit:       "% of benchmark",
        health, trend: "unknown",
        formula:    "(actual CTR / industry CTR at avg position) × 100",
        recommendation:
          ratio >= 0.95 ? "Titles and meta descriptions are performing well at your ranking positions."
        : ratio >= 0.75 ? "Slight underperformance. Audit titles for top 20 pages — are they answering the search intent in the first 60 characters?"
        :                 "Significant CTR gap. Big opportunity: rewriting titles and adding compelling meta descriptions could lift clicks 30%+ without ranking improvements.",
        meta: { actual_ctr: p30.gscCtr, expected_ctr: expected, avg_position: p30.gscAvgPosition },
      });
    }
  }

  /* ── 9. Conversion Velocity ──────────────────────────────── */
  {
    const d = opts.deltas.last_30d_vs_previous;
    if (d && d.conversions.from > 0) {
      const velocity = d.conversions.pctChange * 100;
      const health: KpiHealth =
        velocity >= 15  ? "excellent" :
        velocity >= 5   ? "good"      :
        velocity >= -5  ? "moderate"  :
        velocity >= -15 ? "concern"   : "critical";
      k.push({
        key:        "conversion_velocity",
        name:       "Conversion Velocity",
        category:   "growth",
        definition: "Month-over-month change in organic conversions. The leading indicator of whether your SEO investments translate to business outcomes.",
        value:      round1(velocity),
        unit:       "% MoM",
        health,
        trend:      velocity > 5 ? "improving" : velocity < -5 ? "declining" : "stable",
        formula:    "(conversions last 30d - conversions prior 30d) / prior × 100",
        recommendation:
          velocity >= 5   ? "Strategies are compounding. Document what's working and scale it."
        : velocity >= -5  ? "Flat. Either traffic isn't qualified or conversion paths have friction — A/B test your top landing pages."
        :                   "Conversion decline — investigate immediately. Check landing page health, recent algorithm shifts, and whether top converting pages dropped in rankings.",
        meta: { current_conversions: d.conversions.to, previous_conversions: d.conversions.from },
      });
    }
  }

  /* ── 10. Indexation Efficiency ───────────────────────────── */
  {
    const pagesWithClicks = opts.gscPages.length;
    if (pagesWithClicks > 0) {
      /* Heuristic: pages earning clicks vs pages earning impressions */
      const pagesWithImpr = opts.gscPages.filter(p => p.impressions > 0).length;
      const efficiency = (pagesWithClicks / Math.max(pagesWithImpr, pagesWithClicks)) * 100;
      const health: KpiHealth =
        efficiency >= 80 ? "excellent" :
        efficiency >= 60 ? "good"      :
        efficiency >= 40 ? "moderate"  :
        efficiency >= 20 ? "concern"   : "critical";
      k.push({
        key:        "indexation_efficiency",
        name:       "Indexation Efficiency",
        category:   "efficiency",
        definition: "Share of impression-earning pages that actually receive clicks. Low efficiency = pages ranking but not clicked = title/meta problem or query mismatch.",
        value:      round1(efficiency),
        unit:       "% impression→click",
        health, trend: "unknown",
        formula:    "pages_with_clicks / pages_with_impressions × 100",
        recommendation:
          efficiency >= 60 ? "Pages that rank also get clicked. Healthy."
        : efficiency >= 40 ? "Many pages rank but don't get clicks. Audit titles + descriptions for those pages."
        :                    "Severe disconnect: pages appear in search but don't earn clicks. May indicate keyword cannibalization or out-of-intent ranking.",
        meta: { pages_with_clicks: pagesWithClicks, pages_with_impressions: pagesWithImpr },
      });
    }
  }

  /* ── 11. Channel Diversification Index ───────────────────── */
  {
    const totalCh = opts.ga4Channels.reduce((a, c) => a + c.sessions, 0);
    if (totalCh > 0 && opts.ga4Channels.length > 0) {
      /* Inverse Herfindahl-Hirschman: 1 - sum(share²). Higher = more diversified. */
      const sumSquaredShares = opts.ga4Channels.reduce((a, c) => {
        const share = c.sessions / totalCh;
        return a + (share * share);
      }, 0);
      const diversityIndex = (1 - sumSquaredShares) * 100;
      const health: KpiHealth =
        diversityIndex >= 70 ? "excellent" :
        diversityIndex >= 55 ? "good"      :
        diversityIndex >= 40 ? "moderate"  :
        diversityIndex >= 25 ? "concern"   : "critical";
      const topChannel = opts.ga4Channels.slice().sort((a, b) => b.sessions - a.sessions)[0];
      k.push({
        key:        "channel_diversification",
        name:       "Channel Diversification Index",
        category:   "diversification",
        definition: "How spread your traffic is across channels (Organic, Direct, Referral, Social, Email, Paid). Single-channel businesses are fragile; diversified ones are antifragile.",
        value:      round1(diversityIndex),
        unit:       "/100",
        health, trend: "unknown",
        formula:    "(1 - Σ(channel_share²)) × 100  [inverse Herfindahl]",
        recommendation:
          diversityIndex >= 55 ? "Multi-channel demand. Resilient to algorithm changes in any single source."
        : diversityIndex >= 40 ? `Moderate diversification. ${topChannel?.key || "Top channel"} dominates — test investing in a second channel.`
        :                        `Single-channel risk (${topChannel?.key || "top channel"} carries everything). Investors will flag this. Add a 2nd reliable acquisition channel ASAP.`,
        meta: { channels: opts.ga4Channels.slice(0, 5), top_channel: topChannel?.key },
      });
    }
  }

  /* ── 12. Search Visibility Trend (30d slope) ─────────────── */
  {
    const last30 = opts.gscDaily.filter(d => d.date).slice(-30);
    if (last30.length >= 14) {
      const slope = linearSlope(last30.map(d => d.impressions));
      const dailyAvg = mean(last30.map(d => d.impressions));
      const slopePctOfAvg = dailyAvg > 0 ? (slope / dailyAvg) * 100 : 0;
      const health: KpiHealth =
        slopePctOfAvg > 2   ? "excellent" :
        slopePctOfAvg > 0.5 ? "good"      :
        slopePctOfAvg > -0.5 ? "moderate" :
        slopePctOfAvg > -2  ? "concern"   : "critical";
      k.push({
        key:        "visibility_trend",
        name:       "Search Visibility Trend",
        category:   "growth",
        definition: "Linear slope of daily impressions over 30 days, normalized to average daily impressions. The honest answer to 'are we trending up or down?'.",
        value:      round2(slopePctOfAvg),
        unit:       "% / day",
        health,
        trend:      slopePctOfAvg > 0.5 ? "improving" : slopePctOfAvg < -0.5 ? "declining" : "stable",
        formula:    "linear_regression_slope(daily_impressions) / mean(daily_impressions) × 100",
        recommendation:
          slopePctOfAvg > 0.5  ? "Visibility growing. Compound your wins — refresh next-best opportunity pages and add content depth."
        : slopePctOfAvg > -0.5 ? "Plateau. Often precedes either breakout or decline. Audit competitors and refresh top 20 pages."
        :                        "Visibility declining. Identify which queries dropped most and investigate cause (algo update, competitor, content rot).",
        meta: { slope_raw: round2(slope), mean_daily_impressions: round1(dailyAvg), days_used: last30.length },
      });
    }
  }

  /* ── 13. Algorithm Resilience Score ──────────────────────── */
  {
    /* Composite: low position volatility + high engagement quality
       + diversified channels + diversified pages = high resilience */
    const vol  = k.find(x => x.key === "position_volatility");
    const cci  = k.find(x => x.key === "click_concentration");
    const eqi  = k.find(x => x.key === "engagement_quality");
    const ch   = k.find(x => x.key === "channel_diversification");
    if (vol && cci && eqi && ch) {
      const volScore  = vol.value != null ? Math.max(0, 100 - vol.value * 15) : 50;
      const cciScore  = cci.value != null ? Math.max(0, 100 - cci.value) : 50;
      const eqiScore  = eqi.value != null ? eqi.value : 50;
      const chScore   = ch.value  != null ? ch.value  : 50;
      const resilience = (volScore + cciScore + eqiScore + chScore) / 4;
      const health: KpiHealth =
        resilience >= 80 ? "excellent" :
        resilience >= 65 ? "good"      :
        resilience >= 50 ? "moderate"  :
        resilience >= 35 ? "concern"   : "critical";
      k.push({
        key:        "algorithm_resilience",
        name:       "Algorithm Resilience Score",
        category:   "stability",
        definition: "Composite measure of how well your site would weather a major Google algorithm update. Combines stability, traffic diversification, engagement quality, and channel mix.",
        value:      round1(resilience),
        unit:       "/100",
        health, trend: "unknown",
        formula:    "mean(100-volatility×15, 100-CCI, EQI, channel_diversity)",
        recommendation:
          resilience >= 65 ? "Well-positioned to absorb algorithm updates. Continue building topical authority."
        : resilience >= 50 ? "Moderate resilience. Address the lowest-scoring input first (check the other KPIs above)."
        :                    "Vulnerable. A major core update could materially impact traffic. Invest in: traffic diversification, content depth on money pages, and brand-building.",
        meta: { component_scores: { volatility: round1(volScore), concentration: round1(cciScore), engagement: round1(eqiScore), channels: round1(chScore) } },
      });
    }
  }

  /* ── 14. SERP Feature Opportunity Score ──────────────────── */
  {
    /* Estimate: pages with avg_position 3-10 are candidates for
       featured-snippet / PAA capture. Higher % = more upside available. */
    const candidates = opts.gscPages.filter(p => p.position >= 3 && p.position <= 10 && p.impressions > 50).length;
    const totalPages = opts.gscPages.length;
    if (totalPages > 0) {
      const opportunityPct = (candidates / totalPages) * 100;
      const health: KpiHealth =
        opportunityPct >= 25 ? "excellent" :    /* lots of climbing room */
        opportunityPct >= 15 ? "good"      :
        opportunityPct >= 8  ? "moderate"  :
                               "concern";
      k.push({
        key:        "serp_feature_opportunity",
        name:       "SERP Feature Opportunity",
        category:   "growth",
        definition: "Share of pages ranking in positions 3-10 with meaningful impressions — these are 'one push away' from featured snippets, People Also Ask, and page-one moves.",
        value:      round1(opportunityPct),
        unit:       "% of pages",
        health, trend: "unknown",
        formula:    "pages ranking #3-#10 with >50 impressions / total pages × 100",
        recommendation:
          opportunityPct >= 15 ? `Strong climbing pipeline (${candidates} pages). Target one batch per week for refresh: tighten H2s, add FAQ schema, answer the query in the first paragraph.`
        : opportunityPct >= 8  ? `Moderate climbing pool (${candidates} pages). Focus on the top 10 by impressions first.`
        :                        "Limited climbing pool. Either you're already winning (most pages on #1-2) or content depth needs investment to start ranking.",
        meta: { climbing_candidates: candidates, total_pages: totalPages },
      });
    }
  }

  /* ── 15. Topic Depth Score ───────────────────────────────── */
  {
    /* Cluster queries by shared head terms to estimate topical depth */
    const headTermClusters: Record<string, number> = {};
    for (const q of opts.gscQueries) {
      const head = q.query.toLowerCase().split(/\s+/).slice(0, 1)[0] || "";
      if (head.length < 3) continue;
      headTermClusters[head] = (headTermClusters[head] || 0) + 1;
    }
    const clusterCount = Object.keys(headTermClusters).length;
    const avgClusterSize = clusterCount > 0
      ? Object.values(headTermClusters).reduce((a, b) => a + b, 0) / clusterCount
      : 0;
    if (clusterCount > 0) {
      const depth = Math.min(100, avgClusterSize * 10);
      const health: KpiHealth =
        depth >= 60 ? "excellent" :
        depth >= 40 ? "good"      :
        depth >= 25 ? "moderate"  :
                      "concern";
      k.push({
        key:        "topic_depth",
        name:       "Topic Depth Score",
        category:   "growth",
        definition: "How deeply you've covered each topic cluster. High depth = many queries per head term = topical authority. Low depth = scattered keywords.",
        value:      round1(depth),
        unit:       "/100",
        health, trend: "unknown",
        formula:    "min(100, mean(queries per head term) × 10)",
        recommendation:
          depth >= 40 ? "Solid topical authority. Each topic cluster has multiple ranking queries — Google sees you as an expert in these areas."
        : depth >= 25 ? "Mid-depth coverage. Pick your top 3 topics and build out FAQ pages, comparison pages, and guides for each."
        :               "Surface-level coverage. You rank for many disconnected queries. Pick a primary topic and build a content cluster (pillar + 10-15 supporting pages).",
        meta: { topic_clusters: clusterCount, avg_queries_per_cluster: round1(avgClusterSize) },
      });
    }
  }

  return k;
}

/* ─── Rising / Falling stars (period comparison) ─────────────── */

export function detectRisingFallingStars(
  currentQueries:  GscQueryRow[],
  previousQueries: GscQueryRow[],
): { rising: RisingStarQuery[]; falling: FallingStarQuery[]; velocity: QueryVelocity } {
  const prevMap = new Map(previousQueries.map(q => [q.query.toLowerCase(), q]));
  const currMap = new Map(currentQueries.map(q => [q.query.toLowerCase(), q]));

  const rising: RisingStarQuery[] = [];
  const falling: FallingStarQuery[] = [];

  /* Rising: present in both, impressions up >50%, position 11-30 (page 2-3) */
  for (const cur of currentQueries) {
    const prev = prevMap.get(cur.query.toLowerCase());
    if (!prev) {
      /* First appearance — only counts as rising if material */
      if (cur.impressions >= 50 && cur.position <= 50) {
        const opportunity: RisingStarQuery["opportunity"] =
          cur.position <= 10 ? "page_2_to_1" :
          cur.position <= 20 ? "page_3_to_2" : "first_appearance";
        rising.push({
          query: cur.query,
          currentClicks: cur.clicks, previousClicks: 0,
          currentImpr: cur.impressions, previousImpr: 0,
          position: cur.position,
          impressionLift: 100,
          opportunity,
          reason: opportunity === "page_2_to_1" ? "Newly ranking on page 1 — protect & grow." :
                  opportunity === "page_3_to_2" ? "Climbed from invisibility to page 2 — pushing to page 1 is high ROI." :
                  "First appearance — Google is testing your page for this query. Reinforce with internal links.",
        });
      }
      continue;
    }
    const imprLift = prev.impressions > 0
      ? ((cur.impressions - prev.impressions) / prev.impressions) * 100
      : 0;
    if (imprLift >= 50 && cur.impressions >= 100) {
      const opportunity: RisingStarQuery["opportunity"] =
        cur.position <= 10 ? "page_2_to_1" :
        cur.position <= 20 ? "page_3_to_2" : "ranking_climber";
      rising.push({
        query:          cur.query,
        currentClicks:  cur.clicks,    previousClicks: prev.clicks,
        currentImpr:    cur.impressions, previousImpr: prev.impressions,
        position:       cur.position,
        impressionLift: round1(imprLift),
        opportunity,
        reason:         `Impressions grew ${round1(imprLift)}% — Google is showing this query more. Push for clicks.`,
      });
    }
  }

  /* Falling: present in both, clicks down >30% AND was material (>50 prev clicks) */
  for (const prev of previousQueries) {
    const cur = currMap.get(prev.query.toLowerCase());
    if (!cur) {
      if (prev.clicks >= 20) {
        falling.push({
          query: prev.query,
          currentClicks: 0, previousClicks: prev.clicks,
          currentImpr: 0, previousImpr: prev.impressions,
          position: 0, positionPrevious: prev.position,
          clickLoss: 100,
          severity: prev.clicks >= 100 ? "critical" : "warning",
          reason: "Disappeared from results entirely — likely deindexed, ranking lost beyond top 100, or content removed.",
        });
      }
      continue;
    }
    if (prev.clicks < 20) continue;
    const clickDrop = ((prev.clicks - cur.clicks) / prev.clicks) * 100;
    if (clickDrop >= 30) {
      falling.push({
        query:          prev.query,
        currentClicks:  cur.clicks,  previousClicks: prev.clicks,
        currentImpr:    cur.impressions, previousImpr: prev.impressions,
        position:       cur.position, positionPrevious: prev.position,
        clickLoss:      round1(clickDrop),
        severity:       clickDrop >= 60 ? "critical" : "warning",
        reason:         cur.position > prev.position + 2
                          ? `Position dropped from ${round1(prev.position)} to ${round1(cur.position)} — competitor likely overtook.`
                          : `Position stable but clicks halved — possible SERP change (featured snippet, AI overview) consuming clicks.`,
      });
    }
  }

  /* Sort by impact */
  rising.sort((a, b) => b.currentImpr - a.currentImpr);
  falling.sort((a, b) => (b.previousClicks - b.currentClicks) - (a.previousClicks - a.currentClicks));

  /* Query velocity stats */
  const currKeys = new Set(currentQueries.map(q => q.query.toLowerCase()));
  const prevKeys = new Set(previousQueries.map(q => q.query.toLowerCase()));
  const newQueries  = [...currKeys].filter(q => !prevKeys.has(q));
  const lostQueries = [...prevKeys].filter(q => !currKeys.has(q));
  const retained    = [...currKeys].filter(q => prevKeys.has(q));
  const discoveryRatePct = currKeys.size > 0 ? (newQueries.length / currKeys.size) * 100 : 0;

  /* Pull top examples by impressions */
  const newExamples = newQueries.slice(0, 5)
    .map(qLc => currentQueries.find(q => q.query.toLowerCase() === qLc)?.query)
    .filter(Boolean) as string[];
  const lostExamples = lostQueries.slice(0, 5)
    .map(qLc => previousQueries.find(q => q.query.toLowerCase() === qLc)?.query)
    .filter(Boolean) as string[];

  return {
    rising:  rising.slice(0, 20),
    falling: falling.slice(0, 20),
    velocity: {
      newQueriesCount:        newQueries.length,
      lostQueriesCount:       lostQueries.length,
      retainedQueriesCount:   retained.length,
      newQueriesTopExamples:  newExamples,
      lostQueriesTopExamples: lostExamples,
      discoveryRatePct:       round1(discoveryRatePct),
    },
  };
}

/* ─── Cannibalization detection ──────────────────────────────── */

/** Detect queries where multiple pages rank — typically a sign that
 *  authority is split and consolidating would help. Wired into the
 *  buildAnalyticsIntelligence orchestrator as of 2026-05-24; expects
 *  query×page dimension pairs fetched by pm-gsc.ts and read out of
 *  `project_knowledge.gsc_query_page_pairs` by the orchestrator.
 *  Thresholds (top ≥5 clicks, second ≥2 clicks, position spread ≤10)
 *  filter out noise so only meaningful splits surface. */
export function detectCannibalization(
  queryPagePairs: Array<{ query: string; page: string; clicks: number; position: number }>,
): CannibalizationGroup[] {
  const byQuery: Record<string, typeof queryPagePairs> = {};
  for (const row of queryPagePairs) {
    const k = row.query.toLowerCase();
    if (!byQuery[k]) byQuery[k] = [];
    byQuery[k].push(row);
  }
  const groups: CannibalizationGroup[] = [];
  for (const [q, rows] of Object.entries(byQuery)) {
    if (rows.length < 2) continue;
    const sorted = rows.slice().sort((a, b) => b.clicks - a.clicks);
    /* Only flag if both pages have material clicks AND positions are close */
    const top = sorted[0], second = sorted[1];
    if (top.clicks < 5 || second.clicks < 2) continue;
    if (Math.abs(top.position - second.position) > 10) continue;
    groups.push({
      query: q,
      pages: sorted.map(r => ({ page: r.page, clicks: r.clicks, position: round1(r.position) })),
      totalClicks: sum(sorted, "clicks"),
      positionSpread: round1(Math.abs(top.position - second.position)),
      recommendation:
        `Two pages compete for "${q}". Pick the stronger candidate (more clicks: ${top.page}), redirect or canonical the other, and consolidate internal links to one URL.`,
    });
  }
  groups.sort((a, b) => b.totalClicks - a.totalClicks);
  return groups.slice(0, 20);
}

/* ─── Composite scores ───────────────────────────────────────── */

export function computeCompositeScores(kpis: StrategicKpi[]): { overallHealthScore: number; algorithmResilience: number } {
  /* Overall health: weighted average of KPI health labels */
  const healthScore = (h: KpiHealth): number => {
    switch (h) {
      case "excellent": return 90;
      case "good":      return 75;
      case "moderate":  return 60;
      case "concern":   return 40;
      case "critical":  return 20;
      default:          return 50;
    }
  };
  const weights: Record<string, number> = {
    /* Growth KPIs weighted highest — what investors care about */
    "conversion_velocity":     1.5,
    "visibility_trend":        1.5,
    "engagement_quality":      1.3,
    "algorithm_resilience":    1.5,
    "channel_diversification": 1.2,
  };
  let weightedSum = 0, weightTotal = 0;
  for (const k of kpis) {
    const w = weights[k.key] || 1;
    weightedSum += healthScore(k.health) * w;
    weightTotal += w;
  }
  const overall = weightTotal > 0 ? weightedSum / weightTotal : 50;
  const resilienceKpi = kpis.find(k => k.key === "algorithm_resilience");
  return {
    overallHealthScore:  round1(overall),
    algorithmResilience: resilienceKpi?.value ?? round1(overall),
  };
}

/* ─── Top-level orchestrator ─────────────────────────────────── */

export function buildAnalyticsIntelligence(input: {
  gscDaily:        GscDailyRow[];
  ga4Daily:        Ga4DailyRow[];
  gscQueriesCurrent:  GscQueryRow[];
  gscQueriesPrevious: GscQueryRow[];
  gscPages:        GscPageRow[];
  gscCountries:    GscDimensionRow[];
  gscDevices:      GscDimensionRow[];
  ga4Channels:     Ga4DimensionRow[];
  ga4Devices:      Ga4DimensionRow[];
  ga4Countries:    Ga4DimensionRow[];
  /** Query×Page dimension pairs from GSC — required for cannibalization
   *  detection. Optional; defaults to empty array when GSC hasn't pulled
   *  the pair dimension yet (older data, or pre-2026-05-24 cron runs). */
  gscQueryPagePairs?: Array<{ query: string; page: string; clicks: number; position: number }>;
  /* Build 12.18 — GEO-era inputs from Build 12.16 pull. All optional;
     the engine produces geoSnapshot=null when neither GSC AI Overview
     nor GA4 AI platform data is provided. */
  gscAiOverviewSummary?: any | null;
  ga4AiPlatformSummary?: any | null;
  ga4AiPlatformReferrals?: Array<{ source: string; sessions: number; conversions: number; engagedSessions?: number }>;
  ga4AiPlatformDaily?: Array<{ date: string; sessions: number; users?: number; conversions?: number }>;
  brandNames:      string[];
  baselineDate:    string | null;
}): AnalyticsIntelligence {
  const periods = deriveAllPeriods(input.gscDaily, input.ga4Daily, input.baselineDate);
  const deltas  = deriveDeltas(periods);
  const kpis    = computeStrategicKpis({
    gscDaily:     input.gscDaily,
    ga4Daily:     input.ga4Daily,
    gscPages:     input.gscPages,
    gscQueries:   input.gscQueriesCurrent,
    gscCountries: input.gscCountries,
    gscDevices:   input.gscDevices,
    ga4Channels:  input.ga4Channels,
    ga4Devices:   input.ga4Devices,
    ga4Countries: input.ga4Countries,
    periods, deltas,
    brandNames:   input.brandNames,
  });
  const { rising, falling, velocity } = detectRisingFallingStars(
    input.gscQueriesCurrent, input.gscQueriesPrevious,
  );
  const composite = computeCompositeScores(kpis);

  /* Cannibalization — empty when query×page pairs are unavailable (the
     dimension pair was added to the cron 2026-05-24; projects with stale
     data fall back to [] which renders as "no cannibalization detected"). */
  const cannibalization = (input.gscQueryPagePairs && input.gscQueryPagePairs.length > 0)
    ? detectCannibalization(input.gscQueryPagePairs)
    : [];

  /* Build 12.18 — GEO snapshot composition. Combines GSC AI Overview
     attribution + GA4 AI platform referrals + derives the composite
     GEO Visibility Score with the same threshold logic used by the
     showcase composer in Build 12.17 (keeps the score consistent
     across surfaces). */
  const geoSnapshot = composeGeoSnapshot({
    gscAiOverviewSummary:   input.gscAiOverviewSummary || null,
    ga4AiPlatformSummary:   input.ga4AiPlatformSummary || null,
    ga4AiPlatformReferrals: input.ga4AiPlatformReferrals || [],
    ga4AiPlatformDaily:     input.ga4AiPlatformDaily || [],
  });

  return {
    generatedAt: new Date().toISOString(),
    periods, deltas, kpis,
    risingStars:     rising,
    fallingStars:    falling,
    cannibalization,
    queryVelocity:   velocity,
    ...composite,
    geoSnapshot,
  };
}

/* Build 12.18 — Compose GEO snapshot from GSC + GA4 AI-era data. Returns
   null when neither data source is provided. Uses the same composite
   scoring as showcase composer in Build 12.17 so the score reads
   identically across reports. */
function composeGeoSnapshot(input: {
  gscAiOverviewSummary: any | null;
  ga4AiPlatformSummary: any | null;
  ga4AiPlatformReferrals: Array<{ source: string; sessions: number; conversions: number; engagedSessions?: number }>;
  ga4AiPlatformDaily: Array<{ date: string; sessions: number; users?: number; conversions?: number }>;
}): AnalyticsIntelligence['geoSnapshot'] {
  const { gscAiOverviewSummary, ga4AiPlatformSummary, ga4AiPlatformReferrals, ga4AiPlatformDaily } = input;
  if (!gscAiOverviewSummary && !ga4AiPlatformSummary) return null;

  /* AI Overview block */
  let aiOverview: NonNullable<AnalyticsIntelligence['geoSnapshot']>['aiOverview'] = null;
  if (gscAiOverviewSummary) {
    const present = !!gscAiOverviewSummary.present;
    const imp = Number(gscAiOverviewSummary.total_impressions || 0);
    const clk = Number(gscAiOverviewSummary.total_clicks || 0);
    aiOverview = {
      present,
      impressions: imp,
      clicks:      clk,
      ctr:         imp > 0 ? Number(((clk / imp) * 100).toFixed(2)) : 0,
      windowDays:  Number(gscAiOverviewSummary.window_days || 30),
      breakdown:   Array.isArray(gscAiOverviewSummary.breakdown) ? gscAiOverviewSummary.breakdown.map((b: any) => ({
        appearance:  String(b.appearance || ''),
        impressions: Number(b.impressions || 0),
        clicks:      Number(b.clicks || 0),
      })) : [],
    };
  }

  /* Platform referrals block + 7-vs-7 day growth signal */
  let platformReferrals: NonNullable<AnalyticsIntelligence['geoSnapshot']>['platformReferrals'] = null;
  if (ga4AiPlatformSummary) {
    let weeklyTrend: 'rising' | 'flat' | 'falling' | 'unknown' = 'unknown';
    let weeklyDeltaPct: number | null = null;
    if (Array.isArray(ga4AiPlatformDaily) && ga4AiPlatformDaily.length >= 14) {
      const sorted = [...ga4AiPlatformDaily].sort((a, b) => (a.date > b.date ? 1 : -1));
      const recent = sorted.slice(-7).reduce((s, d) => s + Number(d.sessions || 0), 0);
      const prior  = sorted.slice(-14, -7).reduce((s, d) => s + Number(d.sessions || 0), 0);
      if (prior === 0 && recent === 0) { weeklyTrend = 'flat'; weeklyDeltaPct = 0; }
      else if (prior === 0 && recent > 0) { weeklyTrend = 'rising'; weeklyDeltaPct = null; }
      else if (prior > 0) {
        const delta = (recent - prior) / prior;
        weeklyDeltaPct = Number((delta * 100).toFixed(1));
        if (delta > 0.15) weeklyTrend = 'rising';
        else if (delta < -0.15) weeklyTrend = 'falling';
        else weeklyTrend = 'flat';
      }
    }
    platformReferrals = {
      sessions:           Number(ga4AiPlatformSummary.sessions || 0),
      users:              Number(ga4AiPlatformSummary.totalUsers || 0),
      conversions:        Number(ga4AiPlatformSummary.conversions || 0),
      platformCount:      Number(ga4AiPlatformSummary.source_count || 0),
      platformsDetected:  Array.isArray(ga4AiPlatformSummary.platforms_detected) ? ga4AiPlatformSummary.platforms_detected : [],
      perPlatform:        (ga4AiPlatformReferrals || []).map(r => ({
        source: String(r.source || ''),
        sessions: Number(r.sessions || 0),
        conversions: Number(r.conversions || 0),
      })),
      windowDays:         Number(ga4AiPlatformSummary.window_days || 30),
      weeklyTrend,
      weeklyDeltaPct,
    };
  }

  /* GEO Visibility composite score — same threshold logic as showcase
     composer in Build 12.17. Keeping the math centralised here would
     be ideal but cross-engine import would create a circular dep; the
     score is small enough to inline in both. If thresholds change,
     update both places. */
  let score = 0;
  if (aiOverview?.present && aiOverview.impressions > 0) {
    const imp = aiOverview.impressions;
    if (imp >= 50000) score += 60;
    else if (imp >= 10000) score += 50;
    else if (imp >= 1000) score += 35;
    else if (imp >= 100) score += 20;
    else score += 10;
  }
  if (platformReferrals && platformReferrals.sessions > 0) {
    const s = platformReferrals.sessions;
    const platformCount = platformReferrals.platformCount;
    let referralPoints = 0;
    if (s >= 5000) referralPoints += 30;
    else if (s >= 500) referralPoints += 25;
    else if (s >= 50) referralPoints += 15;
    else if (s > 0) referralPoints += 8;
    if (platformCount >= 3) referralPoints += 10;
    else if (platformCount >= 2) referralPoints += 5;
    score += Math.min(40, referralPoints);
  }
  score = Math.min(100, Math.max(0, Math.round(score)));

  let grade: 'absent' | 'emerging' | 'present' | 'established' | 'strong';
  if (score === 0) grade = 'absent';
  else if (score < 25) grade = 'emerging';
  else if (score < 55) grade = 'present';
  else if (score < 80) grade = 'established';
  else grade = 'strong';

  return {
    aiOverview,
    platformReferrals,
    geoVisibilityScore: score,
    geoVisibilityGrade: grade,
    measuredAt:         new Date().toISOString(),
  };
}

/* ─── Helpers ────────────────────────────────────────────────── */

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sum<T>(rows: T[], key: keyof T): number {
  return rows.reduce((a, r) => a + Number(r[key] || 0), 0);
}

function mean(vals: number[]): number {
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function stdDev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  const variance = vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length;
  return Math.sqrt(variance);
}

function linearSlope(vals: number[]): number {
  /* Simple linear regression: slope of best-fit line through (i, val) */
  const n = vals.length;
  if (n < 2) return 0;
  const xs = vals.map((_, i) => i);
  const xMean = mean(xs);
  const yMean = mean(vals);
  const num = xs.reduce((a, x, i) => a + (x - xMean) * (vals[i] - yMean), 0);
  const den = xs.reduce((a, x) => a + (x - xMean) ** 2, 0);
  return den > 0 ? num / den : 0;
}

function delta(from: number, to: number): Delta {
  const change = to - from;
  const pctChange = from !== 0 ? change / from : 0;
  const direction: Delta["direction"] =
    pctChange > 0.01 ? "up" : pctChange < -0.01 ? "down" : "flat";
  return { from, to, change: round2(change), pctChange: round2(pctChange), direction };
}

function trendFromDelta(d: Delta | undefined, lowerIsBetter: boolean): KpiTrend {
  if (!d) return "unknown";
  if (d.direction === "flat") return "stable";
  const isImprovement = lowerIsBetter ? d.direction === "down" : d.direction === "up";
  return isImprovement ? "improving" : "declining";
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
