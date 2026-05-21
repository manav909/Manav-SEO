/* ════════════════════════════════════════════════════════════════
   api/lib/season-monitor-engine.ts
   Phase 12.5a — Monitoring engine.

   For each active forecast:
     1. Read current actuals from GSC/GA4 (via project_knowledge)
     2. Interpolate the expected trajectory value at current day
     3. Compute variance
     4. Classify severity: info | watch | warning | critical
     5. Write a checkpoint row
     6. If severity >= watch, return escalation candidates (callers
        in Phase 12.5b will fan out to the five-response escalation)

   This module is the "neck" — every measurement of whether work
   produced results flows through here.

   Leading indicators (Phase 12.5b will expand):
     • Page indexed? (status check from GSC)
     • Competitor rank shifted? (from competitor cache freshness)
     • Anomaly fired in last 24h?
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import type { ForecastTrajectoryPoint, ForecastKpi } from "./season-forecast-engine.js";

/* ─── Public types ──────────────────────────────────────────── */

export type Severity = 'info' | 'watch' | 'warning' | 'critical';

export interface CheckpointResult {
  checkpoint_id:      string;
  forecast_id:        string;
  project_id:         string;
  day_offset_at_check: number;
  actual_value:       number | null;
  expected_value:     number | null;
  variance_pct:       number | null;
  severity:           Severity;
  on_track:           boolean;
  honest_assessment:  string;
  leading_indicators?: any;
}

/* ─── Severity classifier ───────────────────────────────────── */

function classifySeverity(opts: {
  variancePct: number | null;
  kpi:         ForecastKpi;
  expected:    number | null;
  low:         number | null;
  high:        number | null;
  actual:      number | null;
  dayOffset:   number;
  totalDays:   number;
}): Severity {
  if (opts.actual === null) return 'info';   // no data, no judgment

  /* For rank_position: BETTER means LOWER number. Flip the comparison. */
  if (opts.kpi === 'rank_position' && opts.expected !== null) {
    if (opts.low !== null && opts.high !== null) {
      if (opts.actual <= opts.high) return 'info';   // within band (better is lower for rank)
      if (opts.actual <= opts.low * 1.4) return 'watch';
      if (opts.actual <= opts.low * 2.0) return 'warning';
      return 'critical';
    }
  }

  /* For traffic KPIs: BETTER means HIGHER */
  if (opts.low !== null && opts.high !== null && opts.actual !== null) {
    if (opts.actual >= opts.low * 0.95)  return 'info';
    if (opts.actual >= opts.low * 0.70)  return 'watch';
    if (opts.actual >= opts.low * 0.40)  return 'warning';
    return 'critical';
  }

  /* Fallback: variance-based */
  if (opts.variancePct === null) return 'info';
  const absVar = Math.abs(opts.variancePct);

  /* Early in the forecast window, be lenient (early signals are noisy) */
  const progress = opts.totalDays > 0 ? (opts.dayOffset / opts.totalDays) : 0;
  const lenience = progress < 0.3 ? 1.5 : (progress < 0.6 ? 1.2 : 1.0);

  if (absVar <= 15 * lenience) return 'info';
  if (absVar <= 30 * lenience) return 'watch';
  if (absVar <= 55 * lenience) return 'warning';
  return 'critical';
}

/* ─── Read current actual for a forecast ────────────────────── */

async function readActual(opts: {
  projectId:        string;
  kpi:              string;
  targetEntity:     string;
  targetEntityKind: string;
}): Promise<{ value: number | null; source: string; freshnessAt: string | null }> {
  try {
    if (opts.targetEntityKind === 'keyword' &&
        (opts.kpi === 'rank_position' || opts.kpi === 'clicks' || opts.kpi === 'impressions' || opts.kpi === 'ctr')) {
      const { data } = await db().from("project_knowledge")
        .select("field_value, updated_at")
        .eq("project_id", opts.projectId)
        .eq("category", "analytics")
        .eq("field_key", "gsc_top_queries")
        .maybeSingle();
      if ((data as any)?.field_value) {
        const queries = JSON.parse((data as any).field_value);
        const match = queries.find((q: any) => (q.query || '').toLowerCase() === opts.targetEntity.toLowerCase());
        if (match) {
          const v =
            opts.kpi === 'rank_position' ? Number(match.position    || 0) :
            opts.kpi === 'clicks'        ? Number(match.clicks      || 0) :
            opts.kpi === 'impressions'   ? Number(match.impressions || 0) :
            opts.kpi === 'ctr'           ? Number(match.ctr         || 0) : null;
          return { value: v, source: 'gsc', freshnessAt: (data as any).updated_at };
        }
        /* Keyword not in top queries — could mean rank dropped out of top 1000.
           For rank_position, return a high number (worst-case rank). For others, 0. */
        return {
          value: opts.kpi === 'rank_position' ? 100 : 0,
          source: 'gsc_inferred',
          freshnessAt: (data as any).updated_at,
        };
      }
    }
    if (opts.kpi === 'organic_sessions' && opts.targetEntityKind === 'project') {
      const { data } = await db().from("project_knowledge")
        .select("field_value, updated_at")
        .eq("project_id", opts.projectId)
        .eq("category", "analytics")
        .eq("field_key", "ga4_daily_trend_365d")
        .maybeSingle();
      if ((data as any)?.field_value) {
        const days = JSON.parse((data as any).field_value);
        const recent = days.slice(-28);
        if (recent.length > 0) {
          const avg = recent.reduce((s: number, d: any) => s + Number(d.sessions || 0), 0) / recent.length;
          return { value: avg, source: 'ga4', freshnessAt: (data as any).updated_at };
        }
      }
    }
  } catch { /* fall through */ }
  return { value: null, source: 'unavailable', freshnessAt: null };
}

/* ─── Interpolate trajectory at a given day ─────────────────── */

function interpolateExpected(
  trajectory: ForecastTrajectoryPoint[],
  dayOffset: number,
): { expected: number | null; low: number | null; high: number | null } {
  if (!trajectory || trajectory.length === 0) return { expected: null, low: null, high: null };

  /* Find bracketing points */
  let before: ForecastTrajectoryPoint | null = null;
  let after:  ForecastTrajectoryPoint | null = null;
  for (const p of trajectory) {
    if (p.day_offset <= dayOffset) before = p;
    if (p.day_offset >= dayOffset && !after) after = p;
  }
  if (!before && !after) return { expected: null, low: null, high: null };
  if (!before) return { expected: after!.expected, low: after!.low, high: after!.high };
  if (!after  || before === after) return { expected: before.expected, low: before.low, high: before.high };

  const span = after.day_offset - before.day_offset;
  if (span === 0) return { expected: before.expected, low: before.low, high: before.high };
  const t = (dayOffset - before.day_offset) / span;
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    expected: Number(lerp(before.expected, after.expected).toFixed(2)),
    low:      Number(lerp(before.low,      after.low).toFixed(2)),
    high:     Number(lerp(before.high,     after.high).toFixed(2)),
  };
}

/* ─── Check a single forecast — the main entry point ────────── */

export async function checkForecast(opts: {
  forecastId:      string;
  checkpointKind:  'scheduled_7d' | 'scheduled_14d' | 'scheduled_30d' | 'scheduled_60d' | 'scheduled_90d' | 'data_refresh' | 'anomaly_watch' | 'manual';
}): Promise<CheckpointResult | null> {
  try {
    /* Load the forecast */
    const { data: f } = await db().from("season_forecasts")
      .select("*").eq("id", opts.forecastId).maybeSingle();
    if (!f) return null;
    const fc = f as any;

    const createdAt = new Date(fc.forecast_created_at).getTime();
    const now = Date.now();
    const dayOffset = Math.floor((now - createdAt) / 86_400_000);

    /* Read actual */
    const actual = await readActual({
      projectId:        fc.project_id,
      kpi:              fc.kpi,
      targetEntity:     fc.target_entity,
      targetEntityKind: fc.target_entity_kind,
    });

    /* Interpolate expected */
    const { expected, low, high } = interpolateExpected(fc.trajectory || [], dayOffset);

    /* Variance */
    let variancePct: number | null = null;
    if (actual.value !== null && expected !== null && expected !== 0) {
      variancePct = ((actual.value - expected) / expected) * 100;
    }

    /* Severity */
    const severity = classifySeverity({
      variancePct,
      kpi:       fc.kpi,
      expected,
      low,
      high,
      actual:    actual.value,
      dayOffset,
      totalDays: fc.target_day_offset,
    });

    /* Honest assessment string */
    const assessment = buildAssessment({
      kpi: fc.kpi,
      actual: actual.value,
      expected,
      severity,
      dayOffset,
      totalDays: fc.target_day_offset,
      actualSource: actual.source,
    });

    /* Persist checkpoint */
    const { data: cp, error } = await db().from("season_forecast_checkpoints").insert({
      forecast_id:        fc.id,
      project_id:         fc.project_id,
      checkpoint_kind:    opts.checkpointKind,
      day_offset_at_check: dayOffset,
      actual_value:       actual.value,
      expected_value:     expected,
      expected_low:       low,
      expected_high:      high,
      variance_pct:       variancePct,
      severity,
      on_track:           severity === 'info',
      honest_assessment:  assessment,
      data_source:        actual.source,
      data_freshness_at:  actual.freshnessAt,
    }).select("id").maybeSingle();

    if (error || !cp) return null;

    return {
      checkpoint_id:       (cp as any).id,
      forecast_id:         fc.id,
      project_id:          fc.project_id,
      day_offset_at_check: dayOffset,
      actual_value:        actual.value,
      expected_value:      expected,
      variance_pct:        variancePct,
      severity,
      on_track:            severity === 'info',
      honest_assessment:   assessment,
    };
  } catch (e) {
    /* eslint-disable-next-line no-console */
    console.error('[monitor-engine] checkForecast failed:', e);
    return null;
  }
}

function buildAssessment(opts: {
  kpi:        string;
  actual:     number | null;
  expected:   number | null;
  severity:   Severity;
  dayOffset:  number;
  totalDays:  number;
  actualSource: string;
}): string {
  if (opts.actual === null) {
    return `No actual data available yet (${opts.actualSource}). Can't verify trajectory.`;
  }
  if (opts.expected === null) {
    return `Actual reading: ${opts.actual}. No trajectory expected value at day ${opts.dayOffset}.`;
  }
  const progressPct = opts.totalDays > 0 ? Math.round((opts.dayOffset / opts.totalDays) * 100) : 0;
  if (opts.severity === 'info') {
    return `On track at day ${opts.dayOffset}/${opts.totalDays} (${progressPct}%). Actual ${opts.actual.toFixed(2)} vs expected ${opts.expected.toFixed(2)}.`;
  }
  if (opts.severity === 'watch') {
    return `Slightly off pace at day ${opts.dayOffset} (${progressPct}%). Actual ${opts.actual.toFixed(2)} vs expected ${opts.expected.toFixed(2)}. Watch closely on next checkpoint.`;
  }
  if (opts.severity === 'warning') {
    return `Materially off pace at day ${opts.dayOffset} (${progressPct}%). Actual ${opts.actual.toFixed(2)} vs expected ${opts.expected.toFixed(2)}. Intervention warranted.`;
  }
  return `Critical divergence at day ${opts.dayOffset} (${progressPct}%). Actual ${opts.actual.toFixed(2)} vs expected ${opts.expected.toFixed(2)}. Urgent — diagnose immediately.`;
}

/* ─── Sweep: check all active forecasts due for a checkpoint ─── */

export async function sweepForecastCheckpoints(opts?: {
  projectId?: string;
  kinds?: Array<'scheduled_7d' | 'scheduled_14d' | 'scheduled_30d' | 'scheduled_60d' | 'scheduled_90d' | 'data_refresh' | 'anomaly_watch'>;
}): Promise<{
  swept: number;
  results: CheckpointResult[];
}> {
  /* Find active forecasts. For each, determine the right checkpoint kind
     based on day offset since creation. */
  try {
    let q = db().from("season_forecasts")
      .select("id, project_id, forecast_created_at, target_day_offset")
      .eq("status", "active");
    if (opts?.projectId) q = q.eq("project_id", opts.projectId);
    const { data } = await q;

    const due: Array<{ id: string; kind: CheckpointResult['checkpoint_id'] extends string ? any : any }> = [];
    const out: CheckpointResult[] = [];

    for (const f of (data || []) as any[]) {
      const dayOffset = Math.floor((Date.now() - new Date(f.forecast_created_at).getTime()) / 86_400_000);

      /* Has a scheduled checkpoint already fired for this offset? */
      let kind: any = null;
      if (dayOffset >= 90) kind = 'scheduled_90d';
      else if (dayOffset >= 60) kind = 'scheduled_60d';
      else if (dayOffset >= 30) kind = 'scheduled_30d';
      else if (dayOffset >= 14) kind = 'scheduled_14d';
      else if (dayOffset >= 7)  kind = 'scheduled_7d';
      else continue;

      /* Skip if this kind already exists for this forecast */
      const { data: existing } = await db().from("season_forecast_checkpoints")
        .select("id")
        .eq("forecast_id", f.id)
        .eq("checkpoint_kind", kind)
        .limit(1);
      if (existing && existing.length > 0) continue;

      const result = await checkForecast({ forecastId: f.id, checkpointKind: kind });
      if (result) {
        out.push(result);
        /* Phase 12.5b — fan out the five responses based on severity */
        try {
          const { escalateCheckpoint } = await import("./season-escalation-engine.js");
          /* Read baseline_source to inform escalation softness */
          const { data: forecastRow } = await db().from("season_forecasts")
            .select("baseline_source").eq("id", f.id).maybeSingle();
          await escalateCheckpoint({
            checkpoint: result,
            baselineSource: (forecastRow as any)?.baseline_source || 'estimated',
          });
        } catch (e) {
          /* eslint-disable-next-line no-console */
          console.error('[monitor-engine] escalation fan-out failed:', e);
        }
      }
    }

    return { swept: out.length, results: out };
  } catch (e) {
    /* eslint-disable-next-line no-console */
    console.error('[monitor-engine] sweep failed:', e);
    return { swept: 0, results: [] };
  }
}
