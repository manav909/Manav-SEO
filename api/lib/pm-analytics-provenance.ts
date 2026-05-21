/* ════════════════════════════════════════════════════════════════
   api/lib/pm-analytics-provenance.ts
   Phase 3 — Analytics Provenance & Diagnostics.

   Senior PM principle: every number must answer four questions.
     1. WHEN was this fetched?
     2. WHAT date range does it cover?
     3. FROM WHICH property + filters?
     4. WHY might it differ from the source dashboard?

   This module provides three read-only endpoints that surface the
   answers WITHOUT changing any pull behavior. Numbers themselves are
   unchanged — only their context becomes visible.

   Endpoints:
     - bs_get_analytics_provenance(projectId)
         Returns GSC + GA4 connection metadata, the date range covered
         by the latest pull, filters applied, search type, channel
         scope, and freshness indicators.

     - bs_diagnose_analytics_mismatch(projectId)
         Returns the 12 structured "why might these differ" causes,
         each with category, severity, plain-language explanation,
         and a verify-action the PM can take.

     - bs_get_external_dashboard_links(projectId, fromDate, toDate)
         Returns deep-links to GSC + GA4 for the exact date range
         being viewed in the platform, so the PM can verify
         side-by-side.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

/* ─── Types ───────────────────────────────────────────────────── */

export interface GscProvenance {
  connected:           boolean;
  resource_id:         string | null;
  resource_label:      string | null;
  property_type:       "domain" | "url_prefix" | null;
  property_type_label: string;
  search_type:         "web";
  data_state:          "final" | "all";
  data_state_label:    string;
  last_pull_at:        string | null;
  last_pull_status:    string | null;
  last_pull_error:     string | null;
  /* Date range coverage from the most recent pull */
  coverage_from:       string | null;
  coverage_to:         string | null;
  coverage_day_count:  number | null;
  /* Methodology */
  aggregation_type:    "byProperty" | "byPage";
  top_n_queries:       number;
  top_n_pages:         number;
  caveats:             string[];
  freshness:           "fresh" | "stale" | "very_stale" | "never";
}

export interface Ga4Provenance {
  connected:           boolean;
  property_id:         string | null;
  property_label:      string | null;
  last_pull_at:        string | null;
  last_pull_status:    string | null;
  last_pull_error:     string | null;
  coverage_from:       string | null;
  coverage_to:         string | null;
  coverage_day_count:  number | null;
  /* Filter scope — what we count as "traffic" */
  channel_filter:      string;
  channel_filter_label:string;
  conversion_definition: string;
  bounce_rate_definition: string;
  metric_definitions:  Array<{ metric: string; definition: string }>;
  caveats:             string[];
  freshness:           "fresh" | "stale" | "very_stale" | "never";
}

export interface MismatchCause {
  category:    "date_range" | "property" | "filter" | "methodology" | "freshness" | "sampling" | "privacy";
  source:      "gsc" | "ga4" | "both";
  severity:    "common" | "occasional" | "edge_case";
  title:       string;
  explanation: string;
  verify:      string;     /* what the PM can do to confirm */
  applies:     "always" | "if_recent_dates" | "if_large_range" | "conditional";
}

export interface AnalyticsProvenance {
  generatedAt:   string;
  gsc:           GscProvenance;
  ga4:           Ga4Provenance;
  /* Summary of what's currently displayed in the UI */
  display:       {
    current_window_from: string | null;
    current_window_to:   string | null;
    current_window_label: string;
  };
}

/* ─── Provenance endpoint ─────────────────────────────────────── */

export async function bsGetAnalyticsProvenance(body: any): Promise<any> {
  const { projectId } = body;
  if (!projectId) return { success: false, error: "projectId required" };

  /* GSC + GA4 integration rows */
  const { data: integrations } = await db().from("project_integrations")
    .select("provider,resource_id,resource_label,last_pull_at,last_pull_status,last_pull_error")
    .eq("project_id", projectId)
    .in("provider", ["gsc", "ga4"]);

  const gscRow = (integrations || []).find((r: any) => r.provider === "gsc");
  const ga4Row = (integrations || []).find((r: any) => r.provider === "ga4");

  /* Date coverage — derive from the 365d trend's actual first/last dates */
  const { data: trendRows } = await db().from("project_knowledge")
    .select("field_key,field_value,updated_at")
    .eq("project_id", projectId)
    .eq("category",   "analytics")
    .in("field_key", ["gsc_daily_trend_365d", "ga4_daily_trend_365d"]);

  const trendMap: Record<string, any> = {};
  for (const r of (trendRows || []) as any[]) trendMap[r.field_key] = r;

  const gscDateBounds = deriveDateBounds(trendMap["gsc_daily_trend_365d"]?.field_value);
  const ga4DateBounds = deriveDateBounds(trendMap["ga4_daily_trend_365d"]?.field_value);

  /* Build provenance objects */
  const gsc: GscProvenance = buildGscProvenance(gscRow, gscDateBounds);
  const ga4: Ga4Provenance = buildGa4Provenance(ga4Row, ga4DateBounds);

  /* The "current display window" defaults to the last_30d span from period summary */
  const { data: psRow } = await db().from("project_knowledge")
    .select("field_value")
    .eq("project_id", projectId).eq("category", "analytics")
    .eq("field_key",  "analytics_period_summary")
    .maybeSingle();

  let displayFrom: string | null = null;
  let displayTo:   string | null = null;
  let displayLabel = "Last 30 days";
  try {
    const ps = JSON.parse((psRow as any)?.field_value || "{}");
    if (ps?.periods?.last_30d) {
      displayFrom  = ps.periods.last_30d.fromDate;
      displayTo    = ps.periods.last_30d.toDate;
      displayLabel = ps.periods.last_30d.windowLabel || "Last 30 days";
    }
  } catch { /* non-fatal */ }

  return {
    success: true,
    provenance: {
      generatedAt: new Date().toISOString(),
      gsc, ga4,
      display: {
        current_window_from:  displayFrom,
        current_window_to:    displayTo,
        current_window_label: displayLabel,
      },
    } as AnalyticsProvenance,
  };
}

function deriveDateBounds(raw: string | undefined): { from: string | null; to: string | null; days: number } {
  if (!raw) return { from: null, to: null, days: 0 };
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return { from: null, to: null, days: 0 };
    const dates = arr.map((r: any) => r.date).filter(Boolean).sort();
    if (dates.length === 0) return { from: null, to: null, days: 0 };
    return { from: dates[0], to: dates[dates.length - 1], days: dates.length };
  } catch {
    return { from: null, to: null, days: 0 };
  }
}

function buildGscProvenance(row: any | undefined, bounds: { from: string | null; to: string | null; days: number }): GscProvenance {
  if (!row || !row.resource_id) {
    return {
      connected: false,
      resource_id: null, resource_label: null,
      property_type: null, property_type_label: "Not connected",
      search_type: "web", data_state: "final",
      data_state_label: "Final (excludes last 3 days of pending data)",
      last_pull_at: null, last_pull_status: null, last_pull_error: null,
      coverage_from: null, coverage_to: null, coverage_day_count: null,
      aggregation_type: "byProperty", top_n_queries: 50, top_n_pages: 50,
      caveats: ["Search Console is not connected — connect it via Integrations to enable strategic intel."],
      freshness: "never",
    };
  }

  const resourceId   = row.resource_id as string;
  const propertyType = resourceId.startsWith("sc-domain:") ? "domain" : "url_prefix";
  const propertyTypeLabel = propertyType === "domain"
    ? `Domain property — aggregates ALL subdomains + protocols (https/http, www/non-www)`
    : `URL-prefix property — covers ONLY the exact URL prefix '${resourceId}'`;

  const caveats: string[] = [];
  caveats.push("GSC defaults 'data state' to FINAL — excluding the most recent ~3 days that are still being finalized. Your platform numbers use this default.");
  if (propertyType === "url_prefix") {
    caveats.push(`This property only counts traffic to ${resourceId}. Subdomains and the http variant are NOT included unless you have separate properties.`);
  } else {
    caveats.push(`This domain property aggregates EVERY subdomain and protocol. If you have a separate URL-prefix property in GSC, those numbers will be smaller (subset).`);
  }
  caveats.push("Top 50 queries + Top 50 pages are pulled. The sum of these is LESS than the property total because GSC has a long tail plus anonymized '(other)' rows.");
  caveats.push("Search type = WEB only. Image/Video/News/Discover traffic is NOT included.");
  caveats.push("Country and device filters are NOT applied — all countries and all devices are summed.");

  return {
    connected:           true,
    resource_id:         resourceId,
    resource_label:      row.resource_label || resourceId,
    property_type:       propertyType,
    property_type_label: propertyTypeLabel,
    search_type:         "web",
    data_state:          "final",
    data_state_label:    "Final (the most recent ~3 days are excluded until GSC finalizes them)",
    last_pull_at:        row.last_pull_at,
    last_pull_status:    row.last_pull_status,
    last_pull_error:     row.last_pull_error,
    coverage_from:       bounds.from,
    coverage_to:         bounds.to,
    coverage_day_count:  bounds.days || null,
    aggregation_type:    "byProperty",
    top_n_queries:       50,
    top_n_pages:         50,
    caveats,
    freshness:           computeFreshness(row.last_pull_at),
  };
}

function buildGa4Provenance(row: any | undefined, bounds: { from: string | null; to: string | null; days: number }): Ga4Provenance {
  if (!row || !row.resource_id) {
    return {
      connected: false,
      property_id: null, property_label: null,
      last_pull_at: null, last_pull_status: null, last_pull_error: null,
      coverage_from: null, coverage_to: null, coverage_day_count: null,
      channel_filter: "sessionMedium == 'organic'",
      channel_filter_label: "Organic traffic only (medium = organic)",
      conversion_definition: "All events marked as conversion in GA4",
      bounce_rate_definition: "1 - engagement_rate (GA4's definition, different from Universal Analytics)",
      metric_definitions: [],
      caveats: ["GA4 is not connected — connect it via Integrations to enable session/conversion intel."],
      freshness: "never",
    };
  }

  const metricDefinitions = [
    { metric: "Sessions",         definition: "Distinct sessions where sessionMedium=organic." },
    { metric: "Users",            definition: "Distinct users (totalUsers) — deduplicated across sessions/devices via GA4's identity model." },
    { metric: "Engaged sessions", definition: "Sessions lasting 10s+ OR with conversion OR with 2+ pageviews. GA4's quality threshold." },
    { metric: "Engagement rate",  definition: "engaged_sessions / sessions × 100. Inverse of bounce rate." },
    { metric: "Bounce rate",      definition: "100% - engagement_rate. NOT the old UA definition (single-pageview sessions)." },
    { metric: "Avg session duration", definition: "Total session time / sessions (seconds). Includes engagement time only after the first event." },
    { metric: "Conversions",      definition: "Count of events where event is marked as conversion in your GA4 property. ALL events are summed; we don't filter to a specific one." },
  ];

  const caveats: string[] = [];
  caveats.push("Our filter: sessionMedium = 'organic' (exact match, case-insensitive). GA4's UI default 'Organic Search' channel uses a wider rule set — small overlap differences are possible.");
  caveats.push("Dates are returned in the GA4 PROPERTY TIMEZONE. If you compare to data in a different timezone (UA, BigQuery export, etc.), daily totals will shift.");
  caveats.push("GA4 reports finalize 24–48 hours after the date. Today and yesterday in our data may be partial. The 365-day trend ends at 'yesterday' to mitigate.");
  caveats.push("Sampling can apply when querying large date ranges or many-dimension combinations via the Data API. The UI may use unsampled fast-paths for the same range.");
  caveats.push("GA4 applies data thresholding to small numbers (typically <10) for privacy. Specific dimension+metric combos with low cardinality may be redacted.");
  caveats.push("Conversion counts SUM all conversion events. If you want to count just one event (e.g., 'purchase'), filter in GA4 to that event for a fair comparison.");
  caveats.push("Bounce rate in GA4 is NOT the same as Universal Analytics — GA4 bounce = 100% - engagement_rate. A 'low bounce' here may be a 'high bounce' in old UA terms.");

  return {
    connected:           true,
    property_id:         row.resource_id,
    property_label:      row.resource_label || row.resource_id,
    last_pull_at:        row.last_pull_at,
    last_pull_status:    row.last_pull_status,
    last_pull_error:     row.last_pull_error,
    coverage_from:       bounds.from,
    coverage_to:         bounds.to,
    coverage_day_count:  bounds.days || null,
    channel_filter:      "sessionMedium == 'organic' (exact, case-insensitive)",
    channel_filter_label:"Organic traffic only — sessions where medium = 'organic'",
    conversion_definition: "Sum of ALL events flagged as conversion in your GA4 property",
    bounce_rate_definition: "GA4 definition: 100% minus engagement_rate (NOT Universal Analytics)",
    metric_definitions: metricDefinitions,
    caveats,
    freshness: computeFreshness(row.last_pull_at),
  };
}

function computeFreshness(lastPullAt: string | null): "fresh" | "stale" | "very_stale" | "never" {
  if (!lastPullAt) return "never";
  const ageHours = (Date.now() - new Date(lastPullAt).getTime()) / 3_600_000;
  if (ageHours < 36)  return "fresh";          /* up to ~1.5 days */
  if (ageHours < 168) return "stale";          /* up to a week */
  return "very_stale";
}

/* ─── Mismatch diagnostic ─────────────────────────────────────── */

export async function bsDiagnoseAnalyticsMismatch(body: any): Promise<any> {
  const { projectId } = body;
  if (!projectId) return { success: false, error: "projectId required" };

  /* Pull provenance to tailor the diagnostic */
  const provRes = await bsGetAnalyticsProvenance({ projectId });
  if (!provRes.success) return provRes;
  const prov: AnalyticsProvenance = provRes.provenance;

  const causes: MismatchCause[] = [];

  /* ───────── GSC causes ───────── */
  if (prov.gsc.connected) {
    causes.push({
      category:    "date_range",
      source:      "gsc",
      severity:    "common",
      title:       "GSC's 'Last 28 days' = T−3 to T−31",
      explanation: "Search Console's date presets exclude the most recent ~3 days (the API calls them 'fresh', not 'final'). When you view 'Last 7 days' or 'Last 28 days' in GSC, you're actually seeing finalized data shifted 3 days into the past. Our platform uses the same default — so the ranges should align when set to identical dates, but a 'Last 28 days' in GSC and a 'Last 30 days' here will overlap by 27 days, not 30.",
      verify:      "In GSC: Performance → Search results → Date → set CUSTOM RANGE to the exact dates shown in the provenance panel above. Compare totals.",
      applies:     "always",
    });
    if (prov.gsc.property_type === "domain") {
      causes.push({
        category:    "property",
        source:      "gsc",
        severity:    "common",
        title:       "Domain property aggregates all subdomains + protocols",
        explanation: `Our pull uses '${prov.gsc.resource_id}' which is a DOMAIN property in GSC. It sums clicks/impressions from www, non-www, https, http, AND every subdomain. If you typically view a URL-PREFIX property (e.g., https://www.example.com/) in GSC, our numbers will be LARGER because the domain property is a superset.`,
        verify:      `In GSC: switch to the property dropdown — if you see both 'sc-domain:...' and 'https://...' versions of your site, they are different views. Pick the same one.`,
        applies:     "always",
      });
    } else {
      causes.push({
        category:    "property",
        source:      "gsc",
        severity:    "common",
        title:       "URL-prefix property covers only one variant",
        explanation: `Our pull uses '${prov.gsc.resource_id}' which is a URL-PREFIX property in GSC. It only counts traffic to that exact prefix. Subdomains, the other protocol (http vs https), and www / non-www variants are NOT included. If your audience is split across variants, you're seeing a subset of total traffic.`,
        verify:      `In GSC: check if you have a 'sc-domain:...' (Domain) property — its numbers will be a superset and may match an aggregate view you remember.`,
        applies:     "always",
      });
    }
    causes.push({
      category:    "methodology",
      source:      "gsc",
      severity:    "occasional",
      title:       "Top 50 queries / pages don't sum to property total",
      explanation: "We pull the top 50 queries and top 50 pages. The remaining long-tail queries (plus the anonymized '(other)' bucket that GSC withholds for privacy) are NOT in those lists. If you sum the visible rows, you'll get LESS than the property total shown in the headline.",
      verify:      "In GSC: scroll to the bottom of the queries table — the 'sum of visible rows' will be lower than the total shown at top of the page. Same in our data.",
      applies:     "always",
    });
    causes.push({
      category:    "methodology",
      source:      "gsc",
      severity:    "occasional",
      title:       "Search type filter is hardcoded to WEB",
      explanation: "Our pull queries only WEB search results. Image search, Video search, News, and Discover are NOT included. If you switch search type in GSC's UI, you'll see different numbers — and those numbers are not in our platform.",
      verify:      "In GSC: Performance → Search type (top of report) → confirm it's set to 'Web' for an apples-to-apples comparison.",
      applies:     "always",
    });
    causes.push({
      category:    "freshness",
      source:      "gsc",
      severity:    "common",
      title:       `Data was pulled ${prov.gsc.freshness}`,
      explanation: prov.gsc.freshness === "fresh"
        ? "Pull was within the last 36 hours, so what you see closely matches GSC's current numbers — except for the unavoidable 3-day finalization lag."
        : prov.gsc.freshness === "stale"
        ? "Pull is 1.5–7 days old. GSC's UI has data your platform doesn't yet. Trigger a fresh pull in Integrations to close this gap."
        : prov.gsc.freshness === "very_stale"
        ? "Pull is over a week old. Numbers may be substantially out of date. Run a pull from Integrations now."
        : "Never pulled. Connect GSC and run a pull from Integrations.",
      verify:      "In Integrations panel: check 'Last pull' timestamp. Run pull again if needed.",
      applies:     "always",
    });
  }

  /* ───────── GA4 causes ───────── */
  if (prov.ga4.connected) {
    causes.push({
      category:    "filter",
      source:      "ga4",
      severity:    "common",
      title:       "Channel filter: sessionMedium == 'organic' (exact)",
      explanation: "We filter to sessions where the medium is literally 'organic' (case-insensitive). GA4's default 'Organic Search' channel uses a broader classification (medium AND source patterns). Sessions GA4 attributes to 'Organic Search' via source matching (e.g., google.com referrer without explicit medium) but with non-'organic' medium will be MISSED by our filter. Typically the difference is small (<5%) but on properties with messy UTM tagging it can be larger.",
      verify:      "In GA4: Reports → Acquisition → Traffic acquisition → filter by 'Session medium = organic' (not 'Session default channel grouping = Organic Search'). That matches our pull exactly.",
      applies:     "always",
    });
    causes.push({
      category:    "methodology",
      source:      "ga4",
      severity:    "common",
      title:       "Bounce rate is GA4's definition, not Universal Analytics",
      explanation: "GA4 bounce rate = 100% − engagement_rate. A session is engaged if it lasts 10+ seconds OR has 2+ pageviews OR has a conversion event. This is FUNDAMENTALLY different from UA's bounce rate (single-pageview sessions). A 30% GA4 bounce rate is NOT directly comparable to a 30% UA bounce rate — they measure different things.",
      verify:      "In GA4: Reports → Engagement → confirm Engagement rate + Bounce rate sum to 100%.",
      applies:     "always",
    });
    causes.push({
      category:    "methodology",
      source:      "ga4",
      severity:    "occasional",
      title:       "Conversions sum ALL conversion events",
      explanation: "GA4 lets you mark multiple events as 'conversions' (purchase, generate_lead, contact_form_submit, etc.). Our pull sums them all. If your GA4 dashboard is showing a SINGLE event (e.g., just 'purchase'), our number will be LARGER. To match exactly, sum the same set of events in GA4.",
      verify:      "In GA4: Admin → Events → see which events are toggled as 'Mark as conversion'. Sum those events for the same date range.",
      applies:     "conditional",
    });
    causes.push({
      category:    "date_range",
      source:      "ga4",
      severity:    "common",
      title:       "Dates are in the GA4 property timezone",
      explanation: "GA4 returns dates in the timezone you configured for the property (Admin → Property settings → Reporting time zone). Daily totals are bucketed by property-TZ midnight. If you're comparing to data exported from BigQuery (which is in UTC), or to your own browser's local-time view of GA4, totals for the SAME calendar day will differ.",
      verify:      "In GA4: Admin → Property settings → Reporting time zone. Confirm it matches your mental model of 'today'.",
      applies:     "always",
    });
    causes.push({
      category:    "freshness",
      source:      "ga4",
      severity:    "common",
      title:       "GA4 finalizes data 24–48 hours after the day",
      explanation: "GA4's Data API returns data for today and yesterday but those values are still updating. Our 365-day trend ENDS at 'yesterday' as a safety buffer — but it still includes a partial yesterday. Don't be surprised when a 'last 7d' total here is 5–15% lower than what you see in GA4 a few days later.",
      verify:      "In GA4: pick a window that ends 3+ days ago — those days are fully final and should match our numbers exactly.",
      applies:     "if_recent_dates",
    });
    causes.push({
      category:    "sampling",
      source:      "ga4",
      severity:    "occasional",
      title:       "Sampling can apply to large queries",
      explanation: "GA4's Data API may sample data when the query spans long date ranges or many dimensions. The GA4 UI sometimes uses unsampled fast-paths that the API doesn't have access to. If a long-range query returns a number that feels off, run a smaller range to verify (sampling rarely applies to <90-day queries).",
      verify:      "In GA4: check the small icon next to your report — if it shows '%' or a 'sampling applied' badge, the UI is also sampled.",
      applies:     "if_large_range",
    });
    causes.push({
      category:    "privacy",
      source:      "ga4",
      severity:    "edge_case",
      title:       "Privacy thresholding zeroes small numbers",
      explanation: "GA4 applies thresholds for privacy — typically counts below 10 are redacted in specific dimension combinations. If you're looking at a low-volume page or country, GA4 may show 0 or omit the row entirely. The aggregate total INCLUDES those values, but the per-row breakdown may not.",
      verify:      "In GA4: total sessions for a date will be higher than the sum of visible rows in many reports.",
      applies:     "conditional",
    });
    causes.push({
      category:    "freshness",
      source:      "ga4",
      severity:    "common",
      title:       `GA4 data was pulled ${prov.ga4.freshness}`,
      explanation: prov.ga4.freshness === "fresh"
        ? "Pull was within the last 36 hours."
        : prov.ga4.freshness === "stale"
        ? "Pull is 1.5–7 days old. Run a fresh pull from Integrations."
        : prov.ga4.freshness === "very_stale"
        ? "Pull is over a week old. Numbers may be substantially out of date."
        : "Never pulled. Connect GA4 and run a pull from Integrations.",
      verify:      "In Integrations panel: check 'Last pull' timestamp.",
      applies:     "always",
    });
  }

  /* If neither connected */
  if (!prov.gsc.connected && !prov.ga4.connected) {
    causes.push({
      category:    "filter",
      source:      "both",
      severity:    "common",
      title:       "Neither GSC nor GA4 is connected",
      explanation: "There is no data in the platform to mismatch. Connect at least one provider in Integrations to populate the intelligence layer.",
      verify:      "Go to Integrations panel → connect Google account → pick GSC property + GA4 property.",
      applies:     "always",
    });
  }

  return {
    success:    true,
    provenance: prov,
    causes,
    summary: {
      total_causes:           causes.length,
      common_causes:          causes.filter(c => c.severity === "common").length,
      gsc_causes:             causes.filter(c => c.source === "gsc").length,
      ga4_causes:             causes.filter(c => c.source === "ga4").length,
    },
  };
}

/* ─── Deep links to source dashboards ────────────────────────── */

export async function bsGetExternalDashboardLinks(body: any): Promise<any> {
  const { projectId, fromDate, toDate } = body;
  if (!projectId) return { success: false, error: "projectId required" };

  const provRes = await bsGetAnalyticsProvenance({ projectId });
  if (!provRes.success) return provRes;
  const prov: AnalyticsProvenance = provRes.provenance;

  const startDate = fromDate || prov.display.current_window_from || isoNDaysAgo(30);
  const endDate   = toDate   || prov.display.current_window_to   || isoNDaysAgo(3);

  /* GSC deep link */
  let gscLink: string | null = null;
  let gscInstructions: string | null = null;
  if (prov.gsc.connected && prov.gsc.resource_id) {
    const encodedResource = encodeURIComponent(prov.gsc.resource_id);
    /* GSC's URL params for date filtering are not fully public/stable — the
       safest deep-link goes to the performance page and tells the PM what to set. */
    gscLink = `https://search.google.com/search-console/performance/search-analytics?resource_id=${encodedResource}`;
    gscInstructions = `Set 'Date' to CUSTOM range: ${startDate} → ${endDate}. Verify 'Search type' is 'Web'. Compare totals.`;
  }

  /* GA4 deep link */
  let ga4Link: string | null = null;
  let ga4Instructions: string | null = null;
  if (prov.ga4.connected && prov.ga4.property_id) {
    /* GA4 property_id format: 'properties/123456789' or just '123456789' */
    const numericId = (prov.ga4.property_id || "").replace(/^properties\//, "");
    /* Acquisition → Traffic Acquisition with date range. */
    const dateParam = `_u.date00=${startDate.replace(/-/g, "")}&_u.date01=${endDate.replace(/-/g, "")}`;
    ga4Link = `https://analytics.google.com/analytics/web/#/p${numericId}/reports/explorer?params=${encodeURIComponent(`_u..nav=maui&${dateParam}`)}&r=lifecycle-acquisition-traffic-acquisition`;
    ga4Instructions = `In the report, add a filter: 'Session medium' exactly equals 'organic' (case-insensitive). Sum sessions for the range.`;
  }

  return {
    success: true,
    links: {
      gsc: gscLink
        ? { url: gscLink, instructions: gscInstructions, resource_id: prov.gsc.resource_id }
        : null,
      ga4: ga4Link
        ? { url: ga4Link, instructions: ga4Instructions, property_id: prov.ga4.property_id }
        : null,
      date_range: { from: startDate, to: endDate },
    },
  };
}

function isoNDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
