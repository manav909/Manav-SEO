/* ════════════════════════════════════════════════════════════════
   api/lib/pm-scenario-engine.ts
   Phase 1L — What-If Simulator: projection + smart suggestions.

   Three responsibilities:

   1. Smart suggestions — examines current analytics intel and returns
      actions from the library that match the project's CURRENT state.
      Drives the "Recommended for you" section in the UI.

   2. Scenario projection — given a list of action instances + current
      baseline metrics, project the impact over time (immediate /
      30d / 60d / 90d).

   3. Diminishing returns — when multiple actions of similar type
      stack, the marginal impact decays. Modeled here so the engine
      doesn't naively claim "10 title rewrites = 10× the lift".

   Output shape is consumed by the frontend WhatIfSimulator component.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import {
  SEO_ACTION_LIBRARY, getActionById,
  type SeoAction, type ImpactRange, type ActionCategory,
} from "./pm-action-library.js";

/* ─── Types ───────────────────────────────────────────────────── */

export interface ActionInstance {
  action_id:     string;
  inputs:        Record<string, any>;
  target_label?: string;     /* short human label like "Refresh /pricing page" */
}

export interface BaselineSnapshot {
  clicks_30d:        number;
  impressions_30d:   number;
  avg_position:      number;
  ctr_pct:           number;
  sessions_30d:      number;
  conversions_30d:   number;
  health_score:      number;
  resilience_score:  number;
}

export interface ProjectedMetric {
  baseline:        number;
  immediate:       number;
  day_30:          number;
  day_60:          number;
  day_90:          number;
  /* Confidence band — min/max at the 90-day mark */
  day_90_low:      number;
  day_90_high:     number;
  unit:            "count" | "percent" | "position";
}

export interface ScenarioProjection {
  baseline:           BaselineSnapshot;
  projected: {
    clicks:        ProjectedMetric;
    impressions:   ProjectedMetric;
    position:      ProjectedMetric;
    ctr:           ProjectedMetric;
    sessions:      ProjectedMetric;
    conversions:   ProjectedMetric;
  };
  total_effort_hours: number;
  total_cost_summary: string;
  /* Per-action contribution breakdown */
  contributions:      Array<{
    action_id:           string;
    action_name:         string;
    contribution_clicks: number;
    contribution_position: number;
    confidence:          string;
    notes:               string;
  }>;
  /* How much the engine had to discount for diminishing returns */
  diminishing_returns_pct: number;
  /* The intel state at projection time (for retrospectives) */
  intel_snapshot_at?: string;
}

export interface SuggestedAction {
  action:        SeoAction;
  reason:        string;            /* "Because Position Volatility is critical" */
  priority:      "must_do" | "should_do" | "could_do";
  trigger_kpi?:  string;            /* which KPI / signal triggered this */
  /* Pre-filled inputs based on intel data (e.g. query/page from rising-stars list) */
  prefilled_inputs?: Record<string, any>;
}

/* ─── Smart suggestions ───────────────────────────────────────── */

/**
 * Examine the project's current analytics intel and return the
 * actions most relevant to its current state. Returns up to N
 * suggestions ranked by priority + business impact.
 */
export async function getSmartSuggestions(projectId: string, maxResults: number = 12): Promise<SuggestedAction[]> {
  /* Load the most recent intel summary */
  const { data: intelRows } = await db().from("project_knowledge")
    .select("field_key,field_value")
    .eq("project_id", projectId)
    .eq("category",   "analytics")
    .in("field_key", [
      "analytics_intel_kpis",
      "analytics_rising_stars",
      "analytics_falling_stars",
      "analytics_cannibalization",
      "analytics_resilience_score",
      "analytics_health_score",
    ]);

  const fieldMap: Record<string, string> = {};
  for (const r of (intelRows || []) as any[]) {
    fieldMap[r.field_key] = r.field_value;
  }

  const parse = (v: string | undefined) => {
    if (!v) return null;
    try { return JSON.parse(v); } catch { return null; }
  };

  const kpis           = parse(fieldMap["analytics_intel_kpis"])     || [];
  const risingStars    = parse(fieldMap["analytics_rising_stars"])   || [];
  const fallingStars   = parse(fieldMap["analytics_falling_stars"])  || [];
  const cannibalization= parse(fieldMap["analytics_cannibalization"])|| [];

  /* Build a quick lookup of KPI key → health */
  const kpiHealth: Record<string, string> = {};
  for (const k of kpis) {
    if (k?.key && k?.health) kpiHealth[k.key] = k.health;
  }

  const suggestions: SuggestedAction[] = [];

  /* For each action, check if any of its `applicableWhen` triggers
     match the current state. If yes, add to suggestions. */
  for (const action of SEO_ACTION_LIBRARY) {
    for (const trigger of action.applicableWhen) {
      const match = matchTrigger(trigger, { kpiHealth, risingStars, fallingStars, cannibalization });
      if (!match) continue;

      const priority: SuggestedAction["priority"] =
        match.severity === "critical"   ? "must_do" :
        match.severity === "concern"    ? "should_do" :
                                          "could_do";

      /* Pre-fill inputs from intel data where applicable */
      const prefilled = prefillInputs(action, match, { risingStars, fallingStars, cannibalization });

      suggestions.push({
        action,
        reason:    match.reason,
        priority,
        trigger_kpi: match.triggerKpi,
        prefilled_inputs: prefilled,
      });
      break; /* one matched trigger per action is enough */
    }
  }

  /* Sort by priority then by action confidence */
  const priorityRank = { must_do: 0, should_do: 1, could_do: 2 };
  const confidenceRank = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => {
    const p = priorityRank[a.priority] - priorityRank[b.priority];
    if (p !== 0) return p;
    return confidenceRank[a.action.confidence] - confidenceRank[b.action.confidence];
  });

  return suggestions.slice(0, maxResults);
}

interface TriggerMatch {
  reason:     string;
  severity:   "critical" | "concern" | "opportunity";
  triggerKpi: string;
  /* Optional payload — e.g. the specific rising star query */
  payload?:   any;
}

function matchTrigger(trigger: string, ctx: {
  kpiHealth:        Record<string, string>;
  risingStars:      any[];
  fallingStars:     any[];
  cannibalization:  any[];
}): TriggerMatch | null {
  /* Format: "kpi:<key>:<healthLevel>" OR "rising_stars:<opportunityOrAny>" OR "falling_stars:<severityOrAny>" OR "cannibalization:any" */
  if (trigger.startsWith("kpi:")) {
    const parts = trigger.split(":");
    if (parts.length < 3) return null;
    const kpiKey   = parts[1];
    const required = parts[2];
    const actual   = ctx.kpiHealth[kpiKey];
    if (!actual) return null;
    if (actual !== required) return null;
    return {
      reason:     `${humanizeKpiKey(kpiKey)} is currently ${actual}`,
      severity:   required === "critical" ? "critical" : required === "concern" ? "concern" : "opportunity",
      triggerKpi: kpiKey,
    };
  }

  if (trigger.startsWith("rising_stars:")) {
    const filter = trigger.slice("rising_stars:".length);
    if (ctx.risingStars.length === 0) return null;
    const matched = filter === "any"
      ? ctx.risingStars
      : ctx.risingStars.filter((r: any) => r.opportunity === filter);
    if (matched.length === 0) return null;
    return {
      reason:     `${matched.length} rising-star ${matched.length === 1 ? "query has" : "queries have"} climbing momentum`,
      severity:   "opportunity",
      triggerKpi: "rising_stars",
      payload:    matched[0],
    };
  }

  if (trigger.startsWith("falling_stars:")) {
    const filter = trigger.slice("falling_stars:".length);
    if (ctx.fallingStars.length === 0) return null;
    const matched = filter === "any"
      ? ctx.fallingStars
      : ctx.fallingStars.filter((r: any) => r.severity === filter);
    if (matched.length === 0) return null;
    const isCritical = matched.some((r: any) => r.severity === "critical");
    return {
      reason:     `${matched.length} ${matched.length === 1 ? "query is" : "queries are"} losing clicks`,
      severity:   isCritical ? "critical" : "concern",
      triggerKpi: "falling_stars",
      payload:    matched[0],
    };
  }

  if (trigger.startsWith("cannibalization:")) {
    if (ctx.cannibalization.length === 0) return null;
    return {
      reason:     `${ctx.cannibalization.length} cannibalization ${ctx.cannibalization.length === 1 ? "case" : "cases"} detected`,
      severity:   "concern",
      triggerKpi: "cannibalization",
      payload:    ctx.cannibalization[0],
    };
  }

  return null;
}

function prefillInputs(action: SeoAction, match: TriggerMatch, ctx: {
  risingStars: any[]; fallingStars: any[]; cannibalization: any[];
}): Record<string, any> {
  const prefilled: Record<string, any> = {};
  /* For target_query and target_page inputs, source from intel payload */
  if (match.triggerKpi === "rising_stars" && match.payload) {
    const star = match.payload;
    for (const input of action.inputs) {
      if (input.key === "target_query") prefilled[input.key] = star.query;
      if (input.key === "target_page" && star.page) prefilled[input.key] = star.page;
    }
  }
  if (match.triggerKpi === "falling_stars" && match.payload) {
    const star = match.payload;
    for (const input of action.inputs) {
      if (input.key === "target_query") prefilled[input.key] = star.query;
      if (input.key === "target_page" && star.page) prefilled[input.key] = star.page;
    }
  }
  if (match.triggerKpi === "cannibalization" && match.payload) {
    const cannib = match.payload;
    for (const input of action.inputs) {
      if (input.key === "target_query") prefilled[input.key] = cannib.query;
      if (input.key === "winner_page" && cannib.pages?.[0]) prefilled[input.key] = cannib.pages[0].page;
      if (input.key === "loser_page"  && cannib.pages?.[1]) prefilled[input.key] = cannib.pages[1].page;
    }
  }
  return prefilled;
}

function humanizeKpiKey(k: string): string {
  return k.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

/* ─── Baseline extraction ────────────────────────────────────── */

export async function getBaselineSnapshot(projectId: string): Promise<BaselineSnapshot | null> {
  const { data } = await db().from("project_knowledge")
    .select("field_key,field_value")
    .eq("project_id", projectId)
    .eq("category",   "analytics")
    .in("field_key", [
      "gsc_total_clicks","gsc_total_impressions","gsc_avg_position","gsc_ctr",
      "organic_sessions_monthly","conversions_monthly",
      "analytics_health_score","analytics_resilience_score",
    ]);

  const m: Record<string, string> = {};
  for (const r of (data || []) as any[]) m[r.field_key] = r.field_value;

  /* Parse — some are scalar with % suffix etc. */
  const parseNum = (s: string | undefined): number => {
    if (!s) return 0;
    const n = parseFloat(s.replace(/[%, ]/g, ""));
    return isNaN(n) ? 0 : n;
  };

  return {
    clicks_30d:        parseNum(m.gsc_total_clicks),
    impressions_30d:   parseNum(m.gsc_total_impressions),
    avg_position:      parseNum(m.gsc_avg_position),
    ctr_pct:           parseNum(m.gsc_ctr),
    sessions_30d:      parseNum(m.organic_sessions_monthly),
    conversions_30d:   parseNum(m.conversions_monthly),
    health_score:      parseNum(m.analytics_health_score),
    resilience_score:  parseNum(m.analytics_resilience_score),
  };
}

/* ─── Impact projection ──────────────────────────────────────── */

/**
 * Given a list of action instances + the project's baseline metrics,
 * project the impact over the standard timeline (immediate / 30d /
 * 60d / 90d) with confidence bands.
 *
 * Diminishing returns: when N actions target the same metric in the
 * same direction, the marginal lift decays geometrically (each
 * subsequent action contributes 70% of the previous).
 */
export async function projectScenario(opts: {
  projectId:  string;
  actions:    ActionInstance[];
}): Promise<{ success: boolean; projection?: ScenarioProjection; error?: string }> {
  const baseline = await getBaselineSnapshot(opts.projectId);
  if (!baseline) return { success: false, error: "No baseline data — pull GSC + GA4 first" };
  if (!opts.actions || opts.actions.length === 0) {
    return { success: false, error: "Scenario must contain at least one action" };
  }

  /* Sum up per-metric impacts with diminishing returns */
  const metricBuckets: Record<string, Array<{
    min:  number;
    max:  number;
    confidence: string;
    action_id: string;
    action_name: string;
    timeline: SeoAction["timeline"];
    unit: ImpactRange["unit"];
  }>> = {
    clicks: [], impressions: [], position: [], ctr: [], conversions: [], visibility: [],
  };

  let totalEffortHours = 0;
  const contributions: ScenarioProjection["contributions"] = [];

  for (const inst of opts.actions) {
    const action = getActionById(inst.action_id);
    if (!action) continue;
    totalEffortHours += action.effortHours;

    for (const [metric, range] of Object.entries(action.impact)) {
      if (!range) continue;
      metricBuckets[metric].push({
        min:    (range as ImpactRange).min,
        max:    (range as ImpactRange).max,
        confidence: action.confidence,
        action_id: action.id,
        action_name: action.name,
        timeline: action.timeline,
        unit: (range as ImpactRange).unit,
      });
    }

    contributions.push({
      action_id:   action.id,
      action_name: action.name,
      contribution_clicks:   midpoint(action.impact.clicks),
      contribution_position: midpoint(action.impact.position),
      confidence:  action.confidence,
      notes:       inst.target_label || "",
    });
  }

  /* Compute per-metric projection */
  const projected: ScenarioProjection["projected"] = {
    clicks:       buildMetricProjection(metricBuckets.clicks,       baseline.clicks_30d,      "percent"),
    impressions:  buildMetricProjection(metricBuckets.impressions,  baseline.impressions_30d, "percent"),
    position:     buildPositionProjection(metricBuckets.position,   baseline.avg_position),
    ctr:          buildMetricProjection(metricBuckets.ctr,          baseline.ctr_pct,          "percent"),
    sessions:     buildMetricProjection(
                    /* Sessions track clicks ~85% — derive from clicks bucket */
                    metricBuckets.clicks.map(b => ({ ...b, min: b.min * 0.85, max: b.max * 0.85 })),
                    baseline.sessions_30d, "percent"),
    conversions:  buildMetricProjection(metricBuckets.conversions, baseline.conversions_30d, "percent"),
  };

  /* Diminishing returns indicator — share of impact lost vs naive sum */
  const naiveClicks = metricBuckets.clicks.reduce((a, b) => a + (b.min + b.max) / 2, 0);
  const projectedClicksLift = projected.clicks.day_90 - projected.clicks.baseline;
  const projectedLiftPct = baseline.clicks_30d > 0 ? (projectedClicksLift / baseline.clicks_30d) * 100 : 0;
  const diminishingReturnsPct = naiveClicks > 0
    ? Math.max(0, Math.round((1 - projectedLiftPct / naiveClicks) * 100))
    : 0;

  /* Cost summary aggregate */
  let costSummary = `${totalEffortHours} hours total`;
  if (totalEffortHours > 40) costSummary += " (significant — consider phased execution)";

  return {
    success: true,
    projection: {
      baseline,
      projected,
      total_effort_hours: totalEffortHours,
      total_cost_summary: costSummary,
      contributions,
      diminishing_returns_pct: diminishingReturnsPct,
      intel_snapshot_at: new Date().toISOString(),
    },
  };
}

/* ─── Per-metric projection math ─────────────────────────────── */

function buildMetricProjection(
  buckets: Array<{ min: number; max: number; confidence: string; timeline: SeoAction["timeline"]; unit: ImpactRange["unit"] }>,
  baseline: number,
  forceUnit: ProjectedMetric["unit"],
): ProjectedMetric {
  if (buckets.length === 0 || baseline === 0) {
    return {
      baseline,
      immediate: baseline, day_30: baseline, day_60: baseline, day_90: baseline,
      day_90_low: baseline, day_90_high: baseline,
      unit: forceUnit,
    };
  }

  /* Sort descending by midpoint impact — diminishing returns applies in order */
  const sorted = buckets.slice().sort((a, b) => ((b.min + b.max) / 2) - ((a.min + a.max) / 2));

  /* Sum with diminishing returns (each subsequent action gets 70% of previous weight) */
  let cumulativeMinPct = 0;
  let cumulativeMidPct = 0;
  let cumulativeMaxPct = 0;
  /* Weighted-average timeline — bigger contributors weight more */
  let totalWeight = 0;
  let weightedTimeline = { immediate: 0, day_30: 0, day_60: 0, day_90: 0 };

  sorted.forEach((b, i) => {
    const weight = Math.pow(0.7, i);
    const mid = (b.min + b.max) / 2;
    cumulativeMinPct += b.min * weight;
    cumulativeMidPct += mid * weight;
    cumulativeMaxPct += b.max * weight;
    totalWeight += Math.abs(mid) * weight;
    if (totalWeight > 0) {
      const w = Math.abs(mid) * weight;
      weightedTimeline.immediate += b.timeline.immediate * w;
      weightedTimeline.day_30    += b.timeline.day_30    * w;
      weightedTimeline.day_60    += b.timeline.day_60    * w;
      weightedTimeline.day_90    += b.timeline.day_90    * w;
    }
  });

  /* Normalize timeline weights */
  if (totalWeight > 0) {
    weightedTimeline.immediate /= totalWeight;
    weightedTimeline.day_30    /= totalWeight;
    weightedTimeline.day_60    /= totalWeight;
    weightedTimeline.day_90    /= totalWeight;
  }

  const applyPct = (pct: number, t: number) => baseline + (baseline * (pct / 100) * t);

  return {
    baseline,
    immediate:   Math.round(applyPct(cumulativeMidPct, weightedTimeline.immediate)),
    day_30:      Math.round(applyPct(cumulativeMidPct, weightedTimeline.day_30)),
    day_60:      Math.round(applyPct(cumulativeMidPct, weightedTimeline.day_60)),
    day_90:      Math.round(applyPct(cumulativeMidPct, weightedTimeline.day_90)),
    day_90_low:  Math.round(applyPct(cumulativeMinPct, weightedTimeline.day_90)),
    day_90_high: Math.round(applyPct(cumulativeMaxPct, weightedTimeline.day_90)),
    unit:        forceUnit,
  };
}

/* Position is special — it's an absolute delta (negative = better) */
function buildPositionProjection(
  buckets: Array<{ min: number; max: number; timeline: SeoAction["timeline"] }>,
  baseline: number,
): ProjectedMetric {
  if (buckets.length === 0 || baseline === 0) {
    return {
      baseline,
      immediate: baseline, day_30: baseline, day_60: baseline, day_90: baseline,
      day_90_low: baseline, day_90_high: baseline,
      unit: "position",
    };
  }

  const sorted = buckets.slice().sort((a, b) => ((a.min + a.max) / 2) - ((b.min + b.max) / 2));
  /* Position deltas are negative (better); diminishing returns same logic */
  let cumulativeMin = 0, cumulativeMid = 0, cumulativeMax = 0;
  let totalWeight = 0;
  let weightedTimeline = { immediate: 0, day_30: 0, day_60: 0, day_90: 0 };

  sorted.forEach((b, i) => {
    const weight = Math.pow(0.7, i);
    const mid = (b.min + b.max) / 2;
    cumulativeMin += b.min * weight;
    cumulativeMid += mid * weight;
    cumulativeMax += b.max * weight;
    totalWeight += Math.abs(mid) * weight;
    if (totalWeight > 0) {
      const w = Math.abs(mid) * weight;
      weightedTimeline.immediate += b.timeline.immediate * w;
      weightedTimeline.day_30    += b.timeline.day_30    * w;
      weightedTimeline.day_60    += b.timeline.day_60    * w;
      weightedTimeline.day_90    += b.timeline.day_90    * w;
    }
  });

  if (totalWeight > 0) {
    weightedTimeline.immediate /= totalWeight;
    weightedTimeline.day_30    /= totalWeight;
    weightedTimeline.day_60    /= totalWeight;
    weightedTimeline.day_90    /= totalWeight;
  }

  /* Floor at position 1 — can't rank better than #1 */
  const applyDelta = (delta: number, t: number) => Math.max(1, baseline + (delta * t));

  return {
    baseline,
    immediate:   Number(applyDelta(cumulativeMid, weightedTimeline.immediate).toFixed(1)),
    day_30:      Number(applyDelta(cumulativeMid, weightedTimeline.day_30).toFixed(1)),
    day_60:      Number(applyDelta(cumulativeMid, weightedTimeline.day_60).toFixed(1)),
    day_90:      Number(applyDelta(cumulativeMid, weightedTimeline.day_90).toFixed(1)),
    day_90_low:  Number(applyDelta(cumulativeMin, weightedTimeline.day_90).toFixed(1)),
    day_90_high: Number(applyDelta(cumulativeMax, weightedTimeline.day_90).toFixed(1)),
    unit:        "position",
  };
}

function midpoint(range: ImpactRange | undefined): number {
  if (!range) return 0;
  return Math.round((range.min + range.max) / 2);
}
