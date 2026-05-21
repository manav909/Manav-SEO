/* ════════════════════════════════════════════════════════════════
   api/lib/pm-analytics-intel-orchestrator.ts
   Phase 1J — Glue between the raw data pulled by pm-gsc.ts / pm-ga4.ts
   and the pure-computation intelligence engine in pm-analytics-intel.ts.

   When called: reads all of project_knowledge.analytics fields the
   pullers stored (daily trends, top queries, top pages, etc.), runs
   the intel engine, and writes results back into project_knowledge
   as JSON-encoded fields with source='analytics_intel'.

   This is intentionally idempotent — safe to call multiple times.
   Each provider's pull triggers a recompute so the intel always
   reflects the freshest data we have.

   Public endpoints exposed via brand-studio dispatcher:
     - bs_get_analytics_intel(projectId) → returns the full intel object
     - bs_recompute_analytics_intel(projectId) → forces a fresh recompute
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import {
  buildAnalyticsIntelligence,
  type AnalyticsIntelligence,
  type GscDailyRow, type GscQueryRow, type GscPageRow, type GscDimensionRow,
  type Ga4DailyRow, type Ga4DimensionRow,
} from "./pm-analytics-intel.js";

/* ─── Helpers to read JSON-encoded fields from the data room ───── */

async function readJsonField<T>(projectId: string, fieldKey: string): Promise<T | null> {
  const { data } = await db().from("project_knowledge")
    .select("field_value")
    .eq("project_id", projectId)
    .eq("category",   "analytics")
    .eq("field_key",  fieldKey)
    .maybeSingle();
  const raw = (data as any)?.field_value;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

async function readScalarField(projectId: string, fieldKey: string): Promise<string | null> {
  const { data } = await db().from("project_knowledge")
    .select("field_value")
    .eq("project_id", projectId)
    .eq("category",   "analytics")
    .eq("field_key",  fieldKey)
    .maybeSingle();
  return (data as any)?.field_value ?? null;
}

async function readProjectName(projectId: string): Promise<string> {
  const { data } = await db().from("projects").select("name").eq("id", projectId).maybeSingle();
  return (data as any)?.name || "";
}

/* ─── Brand-name extraction (for brand/non-brand KPI) ──────────── */

function extractBrandNames(projectName: string, dataRoomBrandValue: string | null): string[] {
  const names = new Set<string>();
  /* Project name minus common suffixes */
  if (projectName) {
    const cleaned = projectName
      .replace(/\b(inc|llc|ltd|limited|corp|corporation|co\.?|software|technologies|tech|labs|studio|agency|group)\b/gi, "")
      .replace(/[^\w\s-]/g, "")
      .trim();
    if (cleaned.length >= 3) names.add(cleaned);
    /* First token if multi-word — often the brand */
    const firstWord = cleaned.split(/\s+/)[0];
    if (firstWord && firstWord.length >= 3 && firstWord.toLowerCase() !== cleaned.toLowerCase()) {
      names.add(firstWord);
    }
  }
  /* Brand assets value if it looks like a brand name */
  if (dataRoomBrandValue && dataRoomBrandValue.length >= 3 && dataRoomBrandValue.length <= 50) {
    names.add(dataRoomBrandValue.trim());
  }
  return [...names];
}

/* ─── Type shapes used by the data room JSON storage ───────────── */

interface StoredQueryRow { query: string; clicks: number; impressions: number; ctr: number; position: number; }
interface StoredPageRow  { page:  string; clicks: number; impressions: number; ctr: number; position: number; }
interface StoredDimRow   { [k: string]: any; clicks?: number; impressions?: number; sessions?: number; }

/* ─── Main orchestrator ───────────────────────────────────────── */

export async function recomputeAnalyticsIntel(projectId: string): Promise<AnalyticsIntelligence | null> {
  /* Pull every input the intel engine needs from the data room */
  const [
    gscDaily365,
    ga4Daily365,
    gscQueriesCurrent,
    gscQueriesPrevious,
    gscPages,
    gscCountries,
    gscDevices,
    ga4Channels,
    ga4Devices,
    ga4Countries,
    baselineDateRaw,
    projectName,
  ] = await Promise.all([
    readJsonField<GscDailyRow[]>(projectId,    "gsc_daily_trend_365d"),
    readJsonField<Ga4DailyRow[]>(projectId,    "ga4_daily_trend_365d"),
    readJsonField<StoredQueryRow[]>(projectId, "gsc_top_queries"),
    readJsonField<StoredQueryRow[]>(projectId, "gsc_queries_previous_30d"),
    readJsonField<StoredPageRow[]>(projectId,  "gsc_top_pages"),
    readJsonField<StoredDimRow[]>(projectId,   "gsc_top_countries"),
    readJsonField<StoredDimRow[]>(projectId,   "gsc_top_devices"),
    readJsonField<StoredDimRow[]>(projectId,   "ga4_top_traffic_sources"),
    readJsonField<StoredDimRow[]>(projectId,   "ga4_top_devices"),
    readJsonField<StoredDimRow[]>(projectId,   "ga4_top_countries"),
    readScalarField(projectId, "organic_sessions_baseline_date"),
    readProjectName(projectId),
  ]);

  /* No data yet — bail with null. Common on a project that's never
     pulled GSC/GA4. The caller treats this as "no intel available". */
  if ((!gscDaily365 || gscDaily365.length === 0) &&
      (!ga4Daily365 || ga4Daily365.length === 0)) {
    return null;
  }

  /* Brand asset lookup for brand/non-brand split */
  const { data: brand } = await db().from("brand_assets")
    .select("brand_name,tagline").eq("project_id", projectId).maybeSingle();
  const brandValue = (brand as any)?.brand_name || null;
  const brandNames = extractBrandNames(projectName, brandValue);

  /* Map stored dimension shapes (varied) to the intel-engine shape */
  const mapGscDim = (rows: StoredDimRow[] | null, keyField: string): GscDimensionRow[] => {
    if (!rows) return [];
    return rows.map((r: any) => ({
      key:         String(r[keyField] || r.country || r.device || r.key || "(unknown)"),
      clicks:      Number(r.clicks || 0),
      impressions: Number(r.impressions || 0),
    }));
  };
  const mapGa4Dim = (rows: StoredDimRow[] | null, keyField: string): Ga4DimensionRow[] => {
    if (!rows) return [];
    return rows.map((r: any) => ({
      key:         String(r[keyField] || r.country || r.device || r.channel || "(unknown)"),
      sessions:    Number(r.sessions || 0),
      users:       Number(r.users || 0),
      conversions: Number(r.conversions || 0),
    }));
  };

  const intel = buildAnalyticsIntelligence({
    gscDaily:           gscDaily365  || [],
    ga4Daily:           ga4Daily365  || [],
    gscQueriesCurrent:  (gscQueriesCurrent  || []) as GscQueryRow[],
    gscQueriesPrevious: (gscQueriesPrevious || []) as GscQueryRow[],
    gscPages:           (gscPages || []) as GscPageRow[],
    gscCountries:       mapGscDim(gscCountries, "country"),
    gscDevices:         mapGscDim(gscDevices,   "device"),
    ga4Channels:        mapGa4Dim(ga4Channels,  "channel"),
    ga4Devices:         mapGa4Dim(ga4Devices,   "device"),
    ga4Countries:       mapGa4Dim(ga4Countries, "country"),
    brandNames,
    baselineDate:       baselineDateRaw,
  });

  /* Write back to the data room as 6 structured JSON fields */
  await writeIntelFields(projectId, intel);

  return intel;
}

async function writeIntelFields(projectId: string, intel: AnalyticsIntelligence): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = [
    { key: "analytics_period_summary",  value: JSON.stringify({ periods: intel.periods, deltas: intel.deltas, generatedAt: intel.generatedAt }) },
    { key: "analytics_intel_kpis",      value: JSON.stringify(intel.kpis) },
    { key: "analytics_rising_stars",    value: JSON.stringify(intel.risingStars) },
    { key: "analytics_falling_stars",   value: JSON.stringify(intel.fallingStars) },
    { key: "analytics_cannibalization", value: JSON.stringify(intel.cannibalization) },
    { key: "analytics_query_velocity",  value: JSON.stringify(intel.queryVelocity) },
    { key: "analytics_health_score",    value: String(intel.overallHealthScore) },
    { key: "analytics_resilience_score",value: String(intel.algorithmResilience) },
  ];
  for (const r of rows) {
    try {
      await db().from("project_knowledge").upsert({
        project_id:  projectId,
        category:    "analytics",
        field_key:   r.key,
        field_value: r.value,
        source:      "analytics_intel",
        source_name: "Computed from GSC + GA4 raw data",
        data_date:   today,
        notes:       "Auto-computed strategic intelligence — refreshes on every GSC/GA4 pull.",
        updated_at:  new Date().toISOString(),
      }, { onConflict: "project_id,category,field_key" });
    } catch (e: any) {
      console.error(`[intel] write ${r.key} failed:`, e?.message || e);
    }
  }
}

/* ─── Endpoint exports ────────────────────────────────────────── */

export async function bsGetAnalyticsIntel(body: any): Promise<any> {
  const { projectId } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  /* Try to read pre-computed intel first */
  const [
    periodSummary, kpis, risingStars, fallingStars, cannibalization, queryVelocity,
    healthScore, resilienceScore,
  ] = await Promise.all([
    readJsonField<any>(projectId,  "analytics_period_summary"),
    readJsonField<any[]>(projectId, "analytics_intel_kpis"),
    readJsonField<any[]>(projectId, "analytics_rising_stars"),
    readJsonField<any[]>(projectId, "analytics_falling_stars"),
    readJsonField<any[]>(projectId, "analytics_cannibalization"),
    readJsonField<any>(projectId,   "analytics_query_velocity"),
    readScalarField(projectId,      "analytics_health_score"),
    readScalarField(projectId,      "analytics_resilience_score"),
  ]);

  if (!kpis && !periodSummary) {
    /* No intel yet — try a fresh recompute */
    const fresh = await recomputeAnalyticsIntel(projectId);
    if (!fresh) return { success: true, intel: null, message: "No GSC/GA4 data available yet — run a pull first." };
    return { success: true, intel: fresh };
  }

  return {
    success: true,
    intel: {
      generatedAt:         periodSummary?.generatedAt || null,
      periods:             periodSummary?.periods     || {},
      deltas:              periodSummary?.deltas      || {},
      kpis:                kpis || [],
      risingStars:         risingStars  || [],
      fallingStars:        fallingStars || [],
      cannibalization:     cannibalization || [],
      queryVelocity:       queryVelocity   || null,
      overallHealthScore:  healthScore     ? Number(healthScore)     : null,
      algorithmResilience: resilienceScore ? Number(resilienceScore) : null,
    },
  };
}

export async function bsRecomputeAnalyticsIntel(body: any): Promise<any> {
  const { projectId } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const fresh = await recomputeAnalyticsIntel(projectId);
    if (!fresh) return { success: true, intel: null, message: "No GSC/GA4 data available yet — run a pull first." };
    return { success: true, intel: fresh };
  } catch (e: any) {
    return { success: false, error: e?.message || "recompute failed" };
  }
}
