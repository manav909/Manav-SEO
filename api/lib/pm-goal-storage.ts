/* ════════════════════════════════════════════════════════════════
   api/lib/pm-goal-storage.ts
   Phase 1M — Goal Engine: CRUD + trajectory + scenario suggestions.

   Endpoints exposed via brand-studio dispatcher:
     - bs_create_goal({projectId, metric, targetValue, targetDate, name?, description?})
         Captures baseline + initial trajectory snapshot.
     - bs_list_goals(projectId, status?)
     - bs_get_goal(goalId)                  → returns goal + fresh trajectory
     - bs_update_goal(...)
     - bs_delete_goal(goalId)
     - bs_record_goal_progress(goalId)      → snapshots current value
     - bs_link_scenario_to_goal({goalId, scenarioId})
     - bs_unlink_scenario_from_goal({goalId, scenarioId})
     - bs_suggest_goal_scenarios(goalId)    → 3 candidate scenarios
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import {
  buildTrajectory, getCurrentMetricValue, suggestGoalScenarios,
  type GoalMetric, type TrajectoryProjection,
} from "./pm-goal-engine.js";

/* ─── Create ─────────────────────────────────────────────────── */

export async function bsCreateGoal(body: any): Promise<any> {
  const { projectId, metric, targetValue, targetDate, name, description, createdByEmail, sharedWithClient } = body;
  if (!projectId)   return { success: false, error: "projectId required" };
  if (!metric)      return { success: false, error: "metric required" };
  if (targetValue == null) return { success: false, error: "targetValue required" };
  if (!targetDate)  return { success: false, error: "targetDate required" };

  const validMetrics: GoalMetric[] = ["clicks","impressions","sessions","conversions","avg_position","ctr","health_score"];
  if (!validMetrics.includes(metric)) return { success: false, error: `metric must be one of ${validMetrics.join(", ")}` };

  /* Snapshot baseline NOW */
  const baselineValue = await getCurrentMetricValue(projectId, metric);
  if (baselineValue == null) return { success: false, error: `No data for ${metric} yet — run a GSC/GA4 pull first` };

  const today = new Date().toISOString().slice(0, 10);
  /* Compute initial trajectory for the projection_snapshot */
  let projSnapshot: TrajectoryProjection | null = null;
  try {
    projSnapshot = await buildTrajectory({
      projectId, metric, baselineValue, baselineDate: today,
      targetValue: Number(targetValue), targetDate: String(targetDate),
    });
  } catch { /* non-fatal — goal still saves */ }

  try {
    const { data, error } = await db().from("analytics_goals").insert({
      project_id:          projectId,
      metric,
      target_value:        Number(targetValue),
      target_date:         String(targetDate),
      baseline_value:      baselineValue,
      baseline_date:       today,
      status:              "active",
      name:                name ? String(name).slice(0, 200) : null,
      description:         description ? String(description).slice(0, 2000) : null,
      projection_snapshot: projSnapshot,
      created_by_email:    createdByEmail || null,
      shared_with_client:  !!sharedWithClient,
    }).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, goal: data, trajectory: projSnapshot };
  } catch (e: any) {
    return { success: false, error: e?.message || "save failed" };
  }
}

/* ─── List ───────────────────────────────────────────────────── */

export async function bsListGoals(body: any): Promise<any> {
  const { projectId, status } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    let q = db().from("analytics_goals")
      .select("*")
      .eq("project_id", projectId)
      .order("target_date", { ascending: true })
      .limit(100);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, goals: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

/* ─── Get one with fresh trajectory ──────────────────────────── */

export async function bsGetGoal(body: any): Promise<any> {
  const { goalId } = body;
  if (!goalId) return { success: false, error: "goalId required" };
  try {
    const { data, error } = await db().from("analytics_goals")
      .select("*").eq("id", goalId).maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Goal not found" };

    /* Recompute trajectory live */
    let trajectory: TrajectoryProjection | null = null;
    try {
      trajectory = await buildTrajectory({
        projectId:     (data as any).project_id,
        metric:        (data as any).metric as GoalMetric,
        baselineValue: Number((data as any).baseline_value),
        baselineDate:  String((data as any).baseline_date),
        targetValue:   Number((data as any).target_value),
        targetDate:    String((data as any).target_date),
      });
    } catch { /* non-fatal */ }

    /* Pull progress history */
    const { data: progress } = await db().from("analytics_goal_progress")
      .select("*").eq("goal_id", goalId).order("recorded_at", { ascending: true });

    return { success: true, goal: data, trajectory, progress: progress || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "get failed" };
  }
}

/* ─── Update ─────────────────────────────────────────────────── */

export async function bsUpdateGoal(body: any): Promise<any> {
  const { goalId, name, description, targetValue, targetDate, status, sharedWithClient } = body;
  if (!goalId) return { success: false, error: "goalId required" };
  const updates: any = { updated_at: new Date().toISOString() };
  if (name !== undefined)        updates.name = name ? String(name).slice(0, 200) : null;
  if (description !== undefined) updates.description = description ? String(description).slice(0, 2000) : null;
  if (targetValue !== undefined) updates.target_value = Number(targetValue);
  if (targetDate !== undefined)  updates.target_date = String(targetDate);
  if (status !== undefined)      updates.status = status;
  if (sharedWithClient !== undefined) updates.shared_with_client = !!sharedWithClient;
  try {
    const { data, error } = await db().from("analytics_goals").update(updates).eq("id", goalId).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, goal: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "update failed" };
  }
}

/* ─── Delete ─────────────────────────────────────────────────── */

export async function bsDeleteGoal(body: any): Promise<any> {
  const { goalId } = body;
  if (!goalId) return { success: false, error: "goalId required" };
  try {
    const { error } = await db().from("analytics_goals").delete().eq("id", goalId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "delete failed" };
  }
}

/* ─── Record progress snapshot ──────────────────────────────── */

export async function bsRecordGoalProgress(body: any): Promise<any> {
  const { goalId } = body;
  if (!goalId) return { success: false, error: "goalId required" };
  try {
    const { data: goal } = await db().from("analytics_goals").select("*").eq("id", goalId).maybeSingle();
    if (!goal) return { success: false, error: "Goal not found" };

    const actual = await getCurrentMetricValue((goal as any).project_id, (goal as any).metric as GoalMetric);
    if (actual == null) return { success: false, error: "No current data for this metric" };

    /* Compute expected value (linear interpolation between baseline and target) */
    const baseline = Number((goal as any).baseline_value);
    const target   = Number((goal as any).target_value);
    const startMs  = new Date((goal as any).baseline_date).getTime();
    const endMs    = new Date((goal as any).target_date).getTime();
    const nowMs    = Date.now();
    const progress = (endMs - startMs > 0) ? (nowMs - startMs) / (endMs - startMs) : 1;
    const clamped  = Math.max(0, Math.min(1, progress));
    const expected = baseline + (target - baseline) * clamped;
    const lowerIsBetter = (goal as any).metric === "avg_position";
    const onTrack = lowerIsBetter ? actual <= expected * 1.05 : actual >= expected * 0.95;

    const { error } = await db().from("analytics_goal_progress").insert({
      goal_id:        goalId,
      actual_value:   actual,
      expected_value: expected,
      on_track:       onTrack,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, snapshot: { actual_value: actual, expected_value: expected, on_track: onTrack } };
  } catch (e: any) {
    return { success: false, error: e?.message || "record failed" };
  }
}

/* ─── Suggest scenarios that close the gap ──────────────────── */

export async function bsSuggestGoalScenarios(body: any): Promise<any> {
  const { goalId } = body;
  if (!goalId) return { success: false, error: "goalId required" };
  try {
    const { data: goal } = await db().from("analytics_goals").select("*").eq("id", goalId).maybeSingle();
    if (!goal) return { success: false, error: "Goal not found" };

    const trajectory = await buildTrajectory({
      projectId:     (goal as any).project_id,
      metric:        (goal as any).metric as GoalMetric,
      baselineValue: Number((goal as any).baseline_value),
      baselineDate:  String((goal as any).baseline_date),
      targetValue:   Number((goal as any).target_value),
      targetDate:    String((goal as any).target_date),
    });

    if (trajectory.isOnTrack) {
      return {
        success: true,
        trajectory,
        scenarios: [],
        message: "You're on track — no intervention needed based on current trajectory.",
      };
    }

    const scenarios = await suggestGoalScenarios({
      projectId:  (goal as any).project_id,
      trajectory,
    });
    return { success: true, trajectory, scenarios };
  } catch (e: any) {
    return { success: false, error: e?.message || "suggest failed" };
  }
}

/* ─── Link scenarios to a goal ──────────────────────────────── */

export async function bsLinkScenarioToGoal(body: any): Promise<any> {
  const { goalId, scenarioId } = body;
  if (!goalId || !scenarioId) return { success: false, error: "goalId and scenarioId required" };
  try {
    const { data: goal } = await db().from("analytics_goals").select("linked_scenario_ids").eq("id", goalId).maybeSingle();
    if (!goal) return { success: false, error: "Goal not found" };
    const ids = new Set<string>(((goal as any).linked_scenario_ids || []) as string[]);
    ids.add(scenarioId);
    const { data, error } = await db().from("analytics_goals")
      .update({ linked_scenario_ids: [...ids], updated_at: new Date().toISOString() })
      .eq("id", goalId).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, goal: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "link failed" };
  }
}

export async function bsUnlinkScenarioFromGoal(body: any): Promise<any> {
  const { goalId, scenarioId } = body;
  if (!goalId || !scenarioId) return { success: false, error: "goalId and scenarioId required" };
  try {
    const { data: goal } = await db().from("analytics_goals").select("linked_scenario_ids").eq("id", goalId).maybeSingle();
    if (!goal) return { success: false, error: "Goal not found" };
    const ids = (((goal as any).linked_scenario_ids || []) as string[]).filter(id => id !== scenarioId);
    const { data, error } = await db().from("analytics_goals")
      .update({ linked_scenario_ids: ids, updated_at: new Date().toISOString() })
      .eq("id", goalId).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, goal: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "unlink failed" };
  }
}
