/* ════════════════════════════════════════════════════════════════
   api/lib/season-forecast-engine.ts
   Phase 12.5a — Forecast engine.

   Takes a strategy + baseline GSC data → produces a structured
   forecast with:
     • Trajectory (day_offset, low, expected, high) array
     • Target value + target day
     • Confidence (0-1)
     • Honest caveats and assumptions

   Then writes the forecast to season_forecasts and creates
   scheduled checkpoint placeholders for d7, d14, d30 (and d60/d90
   for longer horizons).

   Philosophy: every forecast is a HONEST commitment. If we don't
   know baseline (no GSC data), we say so in caveats and set
   confidence lower. We never fabricate baseline values.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

/* ─── Public types ──────────────────────────────────────────── */

export type ForecastKpi =
  | 'rank_position'
  | 'clicks'
  | 'impressions'
  | 'ctr'
  | 'organic_sessions'
  | 'conversions';

export interface ForecastInput {
  projectId:        string;
  pipelineRunId?:   string;
  strategyId?:      string;
  kpi:              ForecastKpi;
  targetEntity:     string;            // the keyword, URL, etc.
  targetEntityKind: 'keyword' | 'url' | 'page' | 'project';
  /* The strategic claim — used to derive target_value if not given directly */
  targetValue?:     number;
  targetDayOffset?: number;
  /* Optional explicit baseline. If not given, we try to read from GSC. */
  explicitBaseline?: number;
  /* Honest-context fields for trajectory math */
  competitiveDifficulty?: 'low' | 'medium' | 'high' | 'very_high';
  approach?: string;
  rationale?: string;
  honestCaveats?: string;
  assumptions?: Record<string, any>;
}

export interface ForecastTrajectoryPoint {
  day_offset:  number;
  low:         number;
  expected:    number;
  high:        number;
}

export interface ForecastRecord {
  id:                  string;
  kpi:                 ForecastKpi;
  target_entity:       string;
  trajectory:          ForecastTrajectoryPoint[];
  target_value:        number;
  target_day_offset:   number;
  confidence:          number;
  baseline_value:      number | null;
  baseline_source:     string | null;
  rationale:           string | null;
  honest_caveats:      string | null;
  forecast_created_at: string;
  target_due_at:       string;
}

/* ─── Default trajectory shapes by KPI + difficulty ──────────── */

/* The shape function: given baseline, target, and total days,
   what's the curve? SEO results aren't linear — they ramp up
   slowly then accelerate, then plateau. Different KPIs have
   different curves. */

function shapeMultiplier(dayOffset: number, totalDays: number, kpi: ForecastKpi): number {
  /* 0..1 value at day_offset out of totalDays. Sigmoid for most;
     slower for rank position (rankings move discretely). */
  const t = Math.min(1, dayOffset / Math.max(totalDays, 1));
  if (kpi === 'rank_position') {
    /* Rank position improves slower and noisier. Linear-ish with slight curve */
    return Math.pow(t, 0.7);
  }
  if (kpi === 'ctr') {
    /* CTR follows ranking — same shape */
    return Math.pow(t, 0.7);
  }
  /* Clicks, impressions, sessions, conversions — sigmoid-ish */
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

function confidenceBandWidth(kpi: ForecastKpi, difficulty?: string): number {
  /* How wide is the low-high band as a fraction of expected.
     Higher difficulty = wider bands (less certainty). */
  const diffMult = { low: 0.7, medium: 1.0, high: 1.4, very_high: 1.9 }[difficulty || 'medium'] || 1.0;
  const baseWidth: Record<ForecastKpi, number> = {
    rank_position:    0.40 * diffMult,   // rank is noisy
    clicks:           0.55 * diffMult,
    impressions:      0.45 * diffMult,
    ctr:              0.30 * diffMult,
    organic_sessions: 0.50 * diffMult,
    conversions:      0.70 * diffMult,   // conversions are the noisiest
  };
  return baseWidth[kpi] || 0.5;
}

function defaultTargetDayOffset(kpi: ForecastKpi, difficulty?: string): number {
  const base: Record<ForecastKpi, number> = {
    rank_position:    60,
    clicks:           60,
    impressions:      45,
    ctr:              60,
    organic_sessions: 60,
    conversions:      90,
  };
  const diffAdd = { low: -15, medium: 0, high: 15, very_high: 30 }[difficulty || 'medium'] || 0;
  return Math.max(14, (base[kpi] || 60) + diffAdd);
}

function defaultConfidence(input: ForecastInput, baselineSource: string | null): number {
  let conf = 0.65;
  /* No baseline → lower confidence */
  if (!baselineSource || baselineSource === 'estimated') conf -= 0.15;
  /* Higher difficulty → lower confidence */
  if (input.competitiveDifficulty === 'high') conf -= 0.10;
  if (input.competitiveDifficulty === 'very_high') conf -= 0.20;
  /* Lower difficulty → higher confidence */
  if (input.competitiveDifficulty === 'low') conf += 0.10;
  return Math.max(0.25, Math.min(0.90, conf));
}

/* ─── Baseline reader ───────────────────────────────────────── */

async function readBaseline(
  projectId: string,
  kpi: ForecastKpi,
  targetEntity: string,
  targetEntityKind: 'keyword' | 'url' | 'page' | 'project',
): Promise<{ value: number | null; source: string | null; measuredAt: string | null }> {
  try {
    if (targetEntityKind === 'keyword' && (kpi === 'rank_position' || kpi === 'clicks' || kpi === 'impressions' || kpi === 'ctr')) {
      /* Read from gsc_top_queries */
      const { data } = await db().from("project_knowledge")
        .select("field_value, updated_at")
        .eq("project_id", projectId)
        .eq("category", "analytics")
        .eq("field_key", "gsc_top_queries")
        .maybeSingle();
      if ((data as any)?.field_value) {
        const queries = JSON.parse((data as any).field_value);
        const match = queries.find((q: any) => (q.query || '').toLowerCase() === targetEntity.toLowerCase());
        if (match) {
          const v =
            kpi === 'rank_position' ? Number(match.position || 0) :
            kpi === 'clicks'        ? Number(match.clicks   || 0) :
            kpi === 'impressions'   ? Number(match.impressions || 0) :
            kpi === 'ctr'           ? Number(match.ctr      || 0) :
            null;
          return { value: v, source: 'gsc', measuredAt: (data as any).updated_at };
        }
      }
      return { value: null, source: null, measuredAt: null };
    }
    if (kpi === 'organic_sessions' && targetEntityKind === 'project') {
      const { data } = await db().from("project_knowledge")
        .select("field_value, updated_at")
        .eq("project_id", projectId)
        .eq("category", "analytics")
        .eq("field_key", "ga4_daily_trend_365d")
        .maybeSingle();
      if ((data as any)?.field_value) {
        const days = JSON.parse((data as any).field_value);
        /* Average the last 28 days */
        const recent = days.slice(-28);
        if (recent.length > 0) {
          const avg = recent.reduce((s: number, d: any) => s + Number(d.sessions || 0), 0) / recent.length;
          return { value: avg, source: 'ga4', measuredAt: (data as any).updated_at };
        }
      }
    }
  } catch { /* fallthrough */ }
  return { value: null, source: null, measuredAt: null };
}

/* ─── Trajectory builder ────────────────────────────────────── */

function buildTrajectory(opts: {
  baseline:        number;
  target:          number;
  totalDays:       number;
  kpi:             ForecastKpi;
  bandWidth:       number;
}): ForecastTrajectoryPoint[] {
  /* Pick checkpoint days that are commonly measured */
  const checkpoints = [0, 7, 14, 21, 30, 45, 60, 75, 90];
  const within = checkpoints.filter(d => d <= opts.totalDays);
  if (!within.includes(opts.totalDays)) within.push(opts.totalDays);

  const points: ForecastTrajectoryPoint[] = [];
  for (const d of within) {
    const t = shapeMultiplier(d, opts.totalDays, opts.kpi);
    /* For rank_position: lower numbers are BETTER. So if baseline=20 and target=3,
       progression is 20 → 3 (decreasing). For everything else, baseline → target (typically increasing). */
    const expected = opts.baseline + (opts.target - opts.baseline) * t;
    const halfBand = Math.abs(expected) * opts.bandWidth * 0.5;
    points.push({
      day_offset: d,
      low:        opts.kpi === 'rank_position' ? expected + halfBand : Math.max(0, expected - halfBand),
      expected:   Number(expected.toFixed(2)),
      high:       opts.kpi === 'rank_position' ? Math.max(1, expected - halfBand) : expected + halfBand,
    });
  }
  return points;
}

/* ─── Main API ──────────────────────────────────────────────── */

export async function createForecast(input: ForecastInput): Promise<{
  success: boolean;
  forecast?: ForecastRecord;
  error?: string;
}> {
  try {
    /* Resolve baseline */
    let baselineValue: number | null = input.explicitBaseline ?? null;
    let baselineSource: string | null = baselineValue !== null ? 'manual' : null;
    let baselineMeasuredAt: string | null = null;

    if (baselineValue === null) {
      const b = await readBaseline(input.projectId, input.kpi, input.targetEntity, input.targetEntityKind);
      baselineValue = b.value;
      baselineSource = b.source;
      baselineMeasuredAt = b.measuredAt;
    }

    /* If still no baseline, set to a reasonable starting estimate.
       For rank, assume position 50 (unranked-ish). For traffic metrics, 0. */
    if (baselineValue === null) {
      baselineValue = input.kpi === 'rank_position' ? 50 : 0;
      baselineSource = 'estimated';
    }

    /* Resolve target */
    const totalDays = input.targetDayOffset || defaultTargetDayOffset(input.kpi, input.competitiveDifficulty);
    const targetValue = input.targetValue ?? defaultTargetForKpi(input.kpi, baselineValue, input.competitiveDifficulty);

    /* Trajectory */
    const bandWidth = confidenceBandWidth(input.kpi, input.competitiveDifficulty);
    const trajectory = buildTrajectory({
      baseline: baselineValue,
      target:   targetValue,
      totalDays,
      kpi:      input.kpi,
      bandWidth,
    });

    /* Honest caveats — assemble */
    const caveats: string[] = [];
    if (baselineSource === 'estimated') {
      caveats.push(`No baseline GSC/GA4 data — using estimated starting point (${baselineValue}). Actual baseline could differ significantly.`);
    }
    if (baselineSource === 'gsc' && baselineMeasuredAt) {
      const ageHrs = (Date.now() - new Date(baselineMeasuredAt).getTime()) / 3_600_000;
      if (ageHrs > 72) {
        caveats.push(`Baseline GSC data is ${Math.round(ageHrs / 24)} days old — re-pull before relying heavily on these forecasts.`);
      }
    }
    if (input.competitiveDifficulty === 'very_high') {
      caveats.push('Very high competitive difficulty — even the low estimate may be optimistic.');
    }
    if (input.kpi === 'conversions') {
      caveats.push('Conversion forecasts are inherently noisy at low volumes — wide bands by design.');
    }
    const honestCaveatsText = caveats.join(' ');

    const confidence = defaultConfidence(input, baselineSource);
    const now = new Date();
    const dueAt = new Date(now.getTime() + totalDays * 86_400_000);

    /* Write */
    const { data: inserted, error } = await db().from("season_forecasts").insert({
      project_id:           input.projectId,
      pipeline_run_id:      input.pipelineRunId || null,
      strategy_id:          input.strategyId || null,
      kpi:                  input.kpi,
      target_entity:        input.targetEntity.slice(0, 240),
      target_entity_kind:   input.targetEntityKind,
      baseline_value:       baselineValue,
      baseline_measured_at: baselineMeasuredAt,
      baseline_source:      baselineSource,
      trajectory:           trajectory,
      target_value:         targetValue,
      target_day_offset:    totalDays,
      confidence:           confidence,
      rationale:            input.rationale ? String(input.rationale).slice(0, 2000) : null,
      honest_caveats:       honestCaveatsText || (input.honestCaveats ? String(input.honestCaveats).slice(0, 2000) : null),
      assumptions:          input.assumptions || null,
      target_due_at:        dueAt.toISOString(),
    }).select("*").maybeSingle();

    if (error) return { success: false, error: error.message };
    const row = inserted as any;

    return {
      success: true,
      forecast: {
        id:                  row.id,
        kpi:                 row.kpi,
        target_entity:       row.target_entity,
        trajectory:          row.trajectory,
        target_value:        Number(row.target_value),
        target_day_offset:   row.target_day_offset,
        confidence:          Number(row.confidence),
        baseline_value:      row.baseline_value !== null ? Number(row.baseline_value) : null,
        baseline_source:     row.baseline_source,
        rationale:           row.rationale,
        honest_caveats:      row.honest_caveats,
        forecast_created_at: row.forecast_created_at,
        target_due_at:       row.target_due_at,
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "forecast creation failed" };
  }
}

function defaultTargetForKpi(kpi: ForecastKpi, baseline: number, difficulty?: string): number {
  const diffMult = { low: 1.0, medium: 1.0, high: 0.7, very_high: 0.5 }[difficulty || 'medium'] || 1.0;
  if (kpi === 'rank_position') {
    /* Improve by half the gap to position 3, weighted by difficulty */
    if (baseline <= 3) return Math.max(1, baseline - 1);
    const improvement = (baseline - 3) * 0.6 * diffMult;
    return Math.max(3, Math.round(baseline - improvement));
  }
  /* For traffic metrics: 2-4x baseline depending on difficulty */
  const mult = (3.0 * diffMult);
  return baseline > 0 ? Math.round(baseline * mult * 100) / 100 : Math.round(10 * diffMult);
}

/* ─── Forecast retrieval ────────────────────────────────────── */

export async function listForecasts(opts: {
  projectId:  string;
  status?:    'active' | 'completed' | 'cancelled' | 'superseded';
  limit?:     number;
}): Promise<ForecastRecord[]> {
  try {
    let q = db().from("season_forecasts")
      .select("*")
      .eq("project_id", opts.projectId)
      .order("target_due_at", { ascending: true })
      .limit(Math.min(opts.limit || 50, 200));
    if (opts.status) q = q.eq("status", opts.status);
    const { data } = await q;
    return ((data || []) as any[]).map(r => ({
      id:                  r.id,
      kpi:                 r.kpi,
      target_entity:       r.target_entity,
      trajectory:          r.trajectory,
      target_value:        Number(r.target_value),
      target_day_offset:   r.target_day_offset,
      confidence:          Number(r.confidence),
      baseline_value:      r.baseline_value !== null ? Number(r.baseline_value) : null,
      baseline_source:     r.baseline_source,
      rationale:           r.rationale,
      honest_caveats:      r.honest_caveats,
      forecast_created_at: r.forecast_created_at,
      target_due_at:       r.target_due_at,
    }));
  } catch {
    return [];
  }
}

export async function getActiveForecastsDue(opts: {
  withinDays?: number;
}): Promise<Array<{ forecast_id: string; project_id: string; kpi: string; target_entity: string; target_due_at: string; }>> {
  const within = opts.withinDays || 1;
  const cutoff = new Date(Date.now() + within * 86_400_000).toISOString();
  try {
    const { data } = await db().from("season_forecasts")
      .select("id, project_id, kpi, target_entity, target_due_at")
      .eq("status", "active")
      .lte("target_due_at", cutoff)
      .order("target_due_at");
    return ((data || []) as any[]).map(r => ({
      forecast_id: r.id,
      project_id:  r.project_id,
      kpi:         r.kpi,
      target_entity: r.target_entity,
      target_due_at: r.target_due_at,
    }));
  } catch { return []; }
}
