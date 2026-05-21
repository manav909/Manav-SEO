/* ════════════════════════════════════════════════════════════════
   api/lib/season-forecast-routes.ts
   Phase 12.5a — Forecast + monitoring HTTP handlers.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

export async function bsSeasonForecastList(body: any): Promise<any> {
  const { projectId, status, limit = 50 } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const { listForecasts } = await import("./season-forecast-engine.js");
    const forecasts = await listForecasts({ projectId, status, limit });
    return { success: true, forecasts };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

export async function bsSeasonForecastGet(body: any): Promise<any> {
  const { forecastId } = body || {};
  if (!forecastId) return { success: false, error: "forecastId required" };
  try {
    const { data: forecast, error } = await db().from("season_forecasts")
      .select("*").eq("id", forecastId).maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!forecast) return { success: false, error: "forecast not found" };

    const { data: checkpoints } = await db().from("season_forecast_checkpoints")
      .select("*").eq("forecast_id", forecastId)
      .order("checked_at", { ascending: false }).limit(50);

    return { success: true, forecast, checkpoints: checkpoints || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "get failed" };
  }
}

export async function bsSeasonForecastCheck(body: any): Promise<any> {
  const { forecastId, kind = 'manual' } = body || {};
  if (!forecastId) return { success: false, error: "forecastId required" };
  try {
    const { checkForecast } = await import("./season-monitor-engine.js");
    const result = await checkForecast({ forecastId, checkpointKind: kind });
    if (!result) return { success: false, error: "checkpoint creation failed (forecast may not exist or actual data unavailable)" };
    return { success: true, checkpoint: result };
  } catch (e: any) {
    return { success: false, error: e?.message || "check failed" };
  }
}

export async function bsSeasonForecastSweep(body: any): Promise<any> {
  const { projectId } = body || {};
  try {
    const { sweepForecastCheckpoints } = await import("./season-monitor-engine.js");
    const result = await sweepForecastCheckpoints({ projectId });
    return { success: true, swept: result.swept, results: result.results };
  } catch (e: any) {
    return { success: false, error: e?.message || "sweep failed" };
  }
}

/* ───────── Phase 12.5b — escalations ───────── */

export async function bsSeasonEscalationList(body: any): Promise<any> {
  const { projectId, response_kind, approval_status, limit = 50 } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const { db } = await import("./db.js");
    let q = db().from("season_forecast_escalations")
      .select("id, checkpoint_id, forecast_id, project_id, response_kind, detail, reference_id, reference_table, corrective_summary, corrective_artifact, approval_status, approved_at, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Number(limit), 200));
    if (response_kind)    q = q.eq("response_kind", response_kind);
    if (approval_status)  q = q.eq("approval_status", approval_status);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, escalations: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

export async function bsSeasonEscalationDecide(body: any): Promise<any> {
  const { escalationId, decision } = body || {};
  if (!escalationId) return { success: false, error: "escalationId required" };
  if (!decision)     return { success: false, error: "decision required (approved|dismissed)" };
  try {
    const { decideCorrective } = await import("./season-escalation-engine.js");
    return await decideCorrective({ escalationId, decision });
  } catch (e: any) {
    return { success: false, error: e?.message || "decide failed" };
  }
}
