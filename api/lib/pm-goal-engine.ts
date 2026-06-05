/* ════════════════════════════════════════════════════════════════
   api/lib/pm-goal-engine.ts
   Phase 1M — Goal Engine.

   Pure computation module — no DB writes. Five jobs:

   1. Extract the current value of any supported goal metric from the
      Data Room (clicks / impressions / sessions / conversions / position
      / CTR / health_score).

   2. Project the NATURAL trajectory — where the metric ends up at the
      target date if NOTHING is done. Uses 90-day daily data + linear
      regression. Falls back to monthly compound rate if data is sparse.

   3. Compute the gap — target value MINUS natural projection.

   4. Generate scenario candidates from the action library that could
      close the gap. Three variants:
        - Minimum effort: cheapest stack of actions
        - Balanced: efficient mix
        - Aggressive: maximum projected lift

   5. Score each candidate against the target.

   The output drives the Goal Engine UI: shows the gap, the path, and
   one-click scenarios that close it.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import {
  SEO_ACTION_LIBRARY,
  type SeoAction, type ImpactRange,
} from "./pm-action-library.js";
import { projectScenario, type ActionInstance } from "./pm-scenario-engine.js";

/* ─── Types ───────────────────────────────────────────────────── */

export type GoalMetric =
  | "clicks" | "impressions" | "sessions" | "conversions"
  | "avg_position" | "ctr" | "health_score"
  /* Build 12.19 — GEO-era goal metrics. ai_overview_impressions and clicks
     come from gsc_ai_overview_summary; ai_platform_sessions and conversions
     come from ga4_ai_platform_summary; geo_visibility_score is the composite
     0-100 metric from Build 12.17/18. */
  | "ai_overview_impressions" | "ai_overview_clicks"
  | "ai_platform_sessions" | "ai_platform_conversions"
  | "geo_visibility_score";

export interface TrajectoryProjection {
  metric:             GoalMetric;
  currentValue:       number;
  baselineValue:      number;
  baselineDate:       string;
  targetValue:        number;
  targetDate:         string;
  daysRemaining:      number;
  /* Where we'll naturally end up at target_date with no intervention */
  projectedNaturalValue: number;
  /* Gap = how much further we need to go */
  gap:                number;
  gapPctOfTarget:     number;
  /* Trend direction over the analysis window */
  monthlyGrowthRate:  number;     /* fractional, e.g. 0.05 = +5%/month */
  confidence:         "high" | "medium" | "low";
  trendDirection:     "growing" | "flat" | "declining";
  isOnTrack:          boolean;
  /* The 90-day historical data used (for charting) */
  history:            Array<{ date: string; value: number }>;
}

export interface CandidateScenario {
  label:                string;            /* "Minimum effort", "Balanced", etc. */
  strategy:             "min_effort" | "balanced" | "aggressive";
  actions:              ActionInstance[];
  projectedFinalValue:  number;
  projectedGoalLift:    number;            /* % of target_value covered by this scenario */
  effortHours:          number;
  meetsTarget:          boolean;
  rationale:            string;
  /* Per-action breakdown */
  actionSummary:        Array<{ action_id: string; action_name: string; impact_score: number }>;
}

/* ─── Read raw values from Data Room ─────────────────────────── */

async function readField(projectId: string, fieldKey: string): Promise<string | null> {
  const { data } = await db().from("project_knowledge")
    .select("field_value")
    .eq("project_id", projectId).eq("category", "analytics").eq("field_key", fieldKey)
    .maybeSingle();
  return (data as any)?.field_value ?? null;
}

async function readJsonField<T>(projectId: string, fieldKey: string): Promise<T | null> {
  const v = await readField(projectId, fieldKey);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

/* ─── Current-value extraction ───────────────────────────────── */

export async function getCurrentMetricValue(projectId: string, metric: GoalMetric): Promise<number | null> {
  const parse = (s: string | null): number | null => {
    if (!s) return null;
    const n = parseFloat(s.replace(/[%, ]/g, ""));
    return isNaN(n) ? null : n;
  };
  /* Build 12.19 — helper to extract a metric from a JSON-encoded summary
     object stored in project_knowledge (AI Overview / AI platform paths). */
  const extractFromJson = async (fieldKey: string, prop: string): Promise<number | null> => {
    const obj = await readJsonField<any>(projectId, fieldKey);
    if (!obj || typeof obj !== "object") return null;
    const v = Number(obj[prop]);
    return Number.isFinite(v) ? v : null;
  };
  switch (metric) {
    case "clicks":         return parse(await readField(projectId, "gsc_total_clicks"));
    case "impressions":    return parse(await readField(projectId, "gsc_total_impressions"));
    case "sessions":       return parse(await readField(projectId, "organic_sessions_monthly"));
    case "conversions":    return parse(await readField(projectId, "conversions_monthly"));
    case "avg_position":   return parse(await readField(projectId, "gsc_avg_position"));
    case "ctr":            return parse(await readField(projectId, "gsc_ctr"));
    case "health_score":   return parse(await readField(projectId, "analytics_health_score"));
    /* Build 12.19 — GEO metrics. Pull from JSON-encoded summary objects. */
    case "ai_overview_impressions":  return await extractFromJson("gsc_ai_overview_summary", "total_impressions");
    case "ai_overview_clicks":       return await extractFromJson("gsc_ai_overview_summary", "total_clicks");
    case "ai_platform_sessions":     return await extractFromJson("ga4_ai_platform_summary", "sessions");
    case "ai_platform_conversions":  return await extractFromJson("ga4_ai_platform_summary", "conversions");
    case "geo_visibility_score": {
      /* Composite — compute inline using same threshold logic as showcase
         composer (Build 12.17) and intel engine (Build 12.18). */
      const ao = await readJsonField<any>(projectId, "gsc_ai_overview_summary");
      const ai = await readJsonField<any>(projectId, "ga4_ai_platform_summary");
      let score = 0;
      if (ao && ao.present && Number(ao.total_impressions || 0) > 0) {
        const imp = Number(ao.total_impressions);
        if (imp >= 50000) score += 60;
        else if (imp >= 10000) score += 50;
        else if (imp >= 1000) score += 35;
        else if (imp >= 100) score += 20;
        else score += 10;
      }
      if (ai && Number(ai.sessions || 0) > 0) {
        const s = Number(ai.sessions);
        const platformCount = Number(ai.source_count || 0);
        let pts = 0;
        if (s >= 5000) pts += 30;
        else if (s >= 500) pts += 25;
        else if (s >= 50) pts += 15;
        else if (s > 0) pts += 8;
        if (platformCount >= 3) pts += 10;
        else if (platformCount >= 2) pts += 5;
        score += Math.min(40, pts);
      }
      return Math.min(100, Math.max(0, Math.round(score)));
    }
  }
}

/* ─── Daily-history extraction ───────────────────────────────── */

async function getDailyHistory(projectId: string, metric: GoalMetric): Promise<Array<{ date: string; value: number }>> {
  /* GSC metrics → gsc_daily_trend_365d
     GA4 metrics → ga4_daily_trend_365d
     AI platform metrics → ga4_ai_platform_daily (Build 12.16 data layer)
     AI Overview metrics + geo_visibility_score → no daily series available
       (GSC searchAppearance returns window totals only); these metrics
       use trajectory math against checkpoints rather than daily history. */
  if (metric === "clicks" || metric === "impressions" || metric === "avg_position" || metric === "ctr") {
    const trend = await readJsonField<any[]>(projectId, "gsc_daily_trend_365d");
    if (!trend) return [];
    return trend.map((r) => ({ date: r.date, value: Number(r[gscFieldFor(metric)] || 0) }));
  }
  if (metric === "sessions" || metric === "conversions") {
    const trend = await readJsonField<any[]>(projectId, "ga4_daily_trend_365d");
    if (!trend) return [];
    return trend.map((r) => ({ date: r.date, value: Number(r[ga4FieldFor(metric)] || 0) }));
  }
  /* Build 12.19 — AI platform sessions and conversions have a daily series
     from the GA4 sessionSource-filtered pull. AI Overview impressions /
     clicks and geo_visibility_score do not have daily data. */
  if (metric === "ai_platform_sessions" || metric === "ai_platform_conversions") {
    const trend = await readJsonField<any[]>(projectId, "ga4_ai_platform_daily");
    if (!trend) return [];
    const field = metric === "ai_platform_sessions" ? "sessions" : "conversions";
    return trend.map((r) => ({ date: r.date, value: Number(r[field] || 0) }));
  }
  /* health_score / ai_overview_* / geo_visibility_score have no daily history.
     Trajectory math relies on baseline + target with linear interpolation. */
  return [];
}

function gscFieldFor(m: GoalMetric): string {
  return m === "clicks" ? "clicks"
       : m === "impressions" ? "impressions"
       : m === "avg_position" ? "position"
       : m === "ctr" ? "ctr"
       : "";
}

function ga4FieldFor(m: GoalMetric): string {
  return m === "sessions" ? "sessions"
       : m === "conversions" ? "conversions"
       : "";
}

/* ─── Trajectory math ────────────────────────────────────────── */

/**
 * Project where a metric naturally ends up at target_date given recent
 * daily history. Linear regression with a confidence rating based on
 * sample size + R².
 */
export function projectTrajectoryFromHistory(
  history: Array<{ date: string; value: number }>,
  targetDate: Date,
  metric: GoalMetric,
): { projectedValue: number; monthlyGrowthRate: number; confidence: "high" | "medium" | "low"; trendDirection: "growing" | "flat" | "declining" } {
  /* Use the most recent 90 days */
  const recent = history.slice(-90).filter(h => h.value > 0 || metric === "avg_position");
  if (recent.length < 14) {
    /* Insufficient data — assume flat trajectory */
    const last = recent.length > 0 ? recent[recent.length - 1].value : 0;
    return { projectedValue: last, monthlyGrowthRate: 0, confidence: "low", trendDirection: "flat" };
  }

  /* Convert to (dayIndex, value) pairs for regression */
  const baseTime = new Date(recent[0].date).getTime();
  const points = recent.map((h, i) => ({
    x: (new Date(h.date).getTime() - baseTime) / 86_400_000,  /* day index */
    y: h.value,
  }));

  /* Linear regression */
  const n = points.length;
  const sumX  = points.reduce((a, p) => a + p.x, 0);
  const sumY  = points.reduce((a, p) => a + p.y, 0);
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = points.reduce((a, p) => a + p.x * p.x, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  const slope = (sumXY - n * meanX * meanY) / (sumXX - n * meanX * meanX);
  const intercept = meanY - slope * meanX;

  /* R² for confidence */
  const ssRes = points.reduce((a, p) => a + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
  const ssTot = points.reduce((a, p) => a + Math.pow(p.y - meanY, 2), 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  const confidence: "high" | "medium" | "low" =
    n >= 60 && r2 >= 0.5 ? "high" :
    n >= 30 && r2 >= 0.25 ? "medium" : "low";

  /* Project forward to target_date */
  const todayMs    = Date.now();
  const targetMs   = targetDate.getTime();
  const targetIdx  = (targetMs - baseTime) / 86_400_000;
  const dailyProjection = slope * targetIdx + intercept;

  /* The natural daily value at target. For 30d-window metrics (which is
     how clicks/impressions/sessions are reported), the "projected value
     at target" is the sum over the 30 days ending at target_date — so
     we compute mean daily × 30. */
  const isMonthlyAccum = metric !== "avg_position" && metric !== "ctr";
  const projectedValue = isMonthlyAccum
    ? Math.max(0, dailyProjection * 30)
    : Math.max(0, dailyProjection);

  /* Monthly growth rate from slope */
  const monthlyDelta = slope * 30;
  const monthlyGrowthRate = meanY > 0 ? monthlyDelta / meanY : 0;
  const trendDirection: "growing" | "flat" | "declining" =
    Math.abs(monthlyGrowthRate) < 0.01 ? "flat" :
    monthlyGrowthRate > 0 ? "growing" : "declining";

  return { projectedValue, monthlyGrowthRate, confidence, trendDirection };
}

/* ─── Full trajectory build ──────────────────────────────────── */

export async function buildTrajectory(opts: {
  projectId:     string;
  metric:        GoalMetric;
  baselineValue: number;
  baselineDate:  string;
  targetValue:   number;
  targetDate:    string;
}): Promise<TrajectoryProjection> {
  const history = await getDailyHistory(opts.projectId, opts.metric);
  const currentValue = (await getCurrentMetricValue(opts.projectId, opts.metric)) ?? opts.baselineValue;
  const targetDateObj = new Date(opts.targetDate);
  const daysRemaining = Math.max(0, Math.floor((targetDateObj.getTime() - Date.now()) / 86_400_000));

  const traj = projectTrajectoryFromHistory(history, targetDateObj, opts.metric);

  /* For position/CTR, lower OR higher might be the target. Default: gap = target - projected. */
  const gap = opts.targetValue - traj.projectedValue;
  const gapPctOfTarget = opts.targetValue !== 0 ? (gap / opts.targetValue) : 0;

  /* On-track: gap is small (within 5% of target) OR trend is already exceeding */
  const lowerIsBetter = opts.metric === "avg_position";
  const onTrack = lowerIsBetter
    ? traj.projectedValue <= opts.targetValue * 1.05
    : traj.projectedValue >= opts.targetValue * 0.95;

  return {
    metric:                opts.metric,
    currentValue,
    baselineValue:         opts.baselineValue,
    baselineDate:          opts.baselineDate,
    targetValue:           opts.targetValue,
    targetDate:            opts.targetDate,
    daysRemaining,
    projectedNaturalValue: Number(traj.projectedValue.toFixed(2)),
    gap:                   Number(gap.toFixed(2)),
    gapPctOfTarget:        Number((gapPctOfTarget * 100).toFixed(2)),
    monthlyGrowthRate:     Number((traj.monthlyGrowthRate * 100).toFixed(2)),
    confidence:            traj.confidence,
    trendDirection:        traj.trendDirection,
    isOnTrack:             onTrack,
    /* Sample down history for charts */
    history:               sampleHistory(history, 60),
  };
}

function sampleHistory(history: Array<{ date: string; value: number }>, maxPoints: number): Array<{ date: string; value: number }> {
  if (history.length <= maxPoints) return history;
  const step = Math.ceil(history.length / maxPoints);
  return history.filter((_, i) => i % step === 0);
}

/* ─── Scenario suggester ─────────────────────────────────────── */

/**
 * Generate candidate scenarios from the action library that could
 * close the gap to target. Returns 3 strategies: min_effort, balanced,
 * aggressive.
 */
export async function suggestGoalScenarios(opts: {
  projectId:    string;
  trajectory:   TrajectoryProjection;
}): Promise<CandidateScenario[]> {
  const { metric, gap, projectedNaturalValue, targetValue } = opts.trajectory;
  /* If on track or trivial gap, no scenarios needed */
  const lowerIsBetter = metric === "avg_position";
  const meaningfulGap = lowerIsBetter ? gap < -0.5 : gap > Math.abs(targetValue * 0.03);
  if (!meaningfulGap) return [];

  /* Map goal metric → which ImpactModel keys to look at */
  const impactKey = mapMetricToImpactKey(metric);
  if (!impactKey) return [];

  /* Score every action in the library by midpoint impact / effort */
  const scoredActions = SEO_ACTION_LIBRARY
    .map((a) => {
      const range = a.impact[impactKey] as ImpactRange | undefined;
      if (!range) return null;
      const mid = (range.min + range.max) / 2;
      /* For position-deltas, negative is better — flip sign for scoring */
      const effectiveImpact = lowerIsBetter ? -mid : mid;
      if (effectiveImpact <= 0) return null;
      return {
        action: a,
        impactMidpoint: effectiveImpact,
        efficiency: effectiveImpact / Math.max(1, a.effortHours),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (scoredActions.length === 0) return [];

  /* Sort by efficiency for "min_effort", by raw impact for "aggressive" */
  const byEfficiency = scoredActions.slice().sort((a, b) => b.efficiency - a.efficiency);
  const byImpact     = scoredActions.slice().sort((a, b) => b.impactMidpoint - a.impactMidpoint);

  const candidates: CandidateScenario[] = [];

  /* Strategy 1: Minimum effort — pick most efficient actions until projected hits target */
  candidates.push(await buildCandidate(opts, "min_effort", "Minimum effort", byEfficiency, 8));
  /* Strategy 2: Balanced — mix of efficient + high-impact */
  const balanced = interleaveActions(byEfficiency, byImpact, 10);
  candidates.push(await buildCandidate(opts, "balanced", "Balanced approach", balanced, 10));
  /* Strategy 3: Aggressive — highest impact regardless of effort */
  candidates.push(await buildCandidate(opts, "aggressive", "Aggressive push", byImpact, 12));

  return candidates;
}

function mapMetricToImpactKey(m: GoalMetric): keyof SeoAction["impact"] | null {
  switch (m) {
    case "clicks":       return "clicks";
    case "impressions":  return "impressions";
    case "sessions":     return "clicks";     /* sessions track clicks closely */
    case "conversions":  return "conversions";
    case "avg_position": return "position";
    case "ctr":          return "ctr";
    case "health_score": return null;          /* composite — no single action moves it cleanly */
  }
}

function interleaveActions<T>(a: T[], b: T[], maxLen: number): T[] {
  const seen = new Set<any>();
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < maxLen; i++) {
    if (a[i] && !seen.has((a[i] as any).action.id)) { seen.add((a[i] as any).action.id); out.push(a[i]); }
    if (b[i] && !seen.has((b[i] as any).action.id) && out.length < maxLen) { seen.add((b[i] as any).action.id); out.push(b[i]); }
  }
  return out;
}

async function buildCandidate(
  opts: { projectId: string; trajectory: TrajectoryProjection },
  strategy: CandidateScenario["strategy"],
  label: string,
  pool: Array<{ action: SeoAction; impactMidpoint: number; efficiency: number }>,
  maxActions: number,
): Promise<CandidateScenario> {
  /* Greedily add actions until projected closes the gap or we hit max */
  const picked: typeof pool = [];
  const lowerIsBetter = opts.trajectory.metric === "avg_position";
  const gapMagnitude = lowerIsBetter ? Math.abs(opts.trajectory.gap) : opts.trajectory.gap;

  /* Estimate cumulative lift with diminishing returns (0.7^i) */
  let cumulativePct = 0;
  let pickedCount = 0;
  for (const a of pool) {
    if (pickedCount >= maxActions) break;
    const weight = Math.pow(0.7, pickedCount);
    cumulativePct += a.impactMidpoint * weight;
    picked.push(a);
    pickedCount += 1;
    /* For percent-based impacts: check whether the lift covers the gap */
    const projectedLiftValue = (opts.trajectory.projectedNaturalValue * cumulativePct) / 100;
    if (lowerIsBetter) {
      /* position deltas are absolute, not percent */
      if (Math.abs(cumulativePct) >= gapMagnitude) break;
    } else {
      if (projectedLiftValue >= gapMagnitude) break;
    }
  }

  /* Convert to ActionInstance shape */
  const instances: ActionInstance[] = picked.map(p => ({
    action_id: p.action.id,
    inputs: {},
    target_label: p.action.name,
  }));

  /* Score with the projection engine for an authoritative number */
  let projectedFinal = opts.trajectory.projectedNaturalValue;
  let effortHours    = picked.reduce((a, p) => a + p.action.effortHours, 0);
  try {
    const proj = await projectScenario({ projectId: opts.projectId, actions: instances });
    if (proj.success && proj.projection) {
      const projectedMetric = mapProjectionMetric(proj.projection, opts.trajectory.metric);
      if (projectedMetric != null) projectedFinal = projectedMetric;
      effortHours = proj.projection.total_effort_hours;
    }
  } catch { /* fall back to estimated */ }

  const projectedGoalLift = opts.trajectory.targetValue !== 0
    ? (projectedFinal / opts.trajectory.targetValue) * 100
    : 0;
  const meetsTarget = lowerIsBetter
    ? projectedFinal <= opts.trajectory.targetValue * 1.05
    : projectedFinal >= opts.trajectory.targetValue * 0.95;

  const rationale =
    strategy === "min_effort"  ? `Cheapest path to close the gap (${effortHours}h total). Picks the highest impact-per-hour actions first.`
    : strategy === "balanced"  ? `Balanced mix of efficient and high-impact actions. ${effortHours}h total.`
    :                            `Maximum projected lift, regardless of effort (${effortHours}h). Use when timeline is tight.`;

  return {
    label, strategy,
    actions:                instances,
    projectedFinalValue:    Number(projectedFinal.toFixed(2)),
    projectedGoalLift:      Number(projectedGoalLift.toFixed(1)),
    effortHours,
    meetsTarget,
    rationale,
    actionSummary:          picked.map(p => ({
      action_id:    p.action.id,
      action_name:  p.action.name,
      impact_score: Number(p.impactMidpoint.toFixed(1)),
    })),
  };
}

function mapProjectionMetric(p: any, m: GoalMetric): number | null {
  if (!p?.projected) return null;
  switch (m) {
    case "clicks":       return p.projected.clicks?.day_90       ?? null;
    case "impressions":  return p.projected.impressions?.day_90  ?? null;
    case "sessions":     return p.projected.sessions?.day_90     ?? null;
    case "conversions":  return p.projected.conversions?.day_90  ?? null;
    case "avg_position": return p.projected.position?.day_90     ?? null;
    case "ctr":          return p.projected.ctr?.day_90          ?? null;
    case "health_score": return null;
  }
}
