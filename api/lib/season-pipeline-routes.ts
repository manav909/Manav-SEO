/* ════════════════════════════════════════════════════════════════
   api/lib/season-pipeline-routes.ts
   Phase 12 — Pipeline endpoint handlers.

   These thin handlers expose the pipeline runner to the frontend
   via the existing task-engine action router. No new function slot.

   Endpoints:
     bs_season_pipeline_run       — start a new pipeline
     bs_season_pipeline_list      — list runs for a project
     bs_season_pipeline_get       — get a run with all steps
     bs_season_pipeline_feedback  — Manav's feedback on a step
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

export async function bsSeasonPipelineRun(body: any): Promise<any> {
  const { projectId, pipelineType, inputText, scope, awareness } = body || {};
  if (!projectId)    return { success: false, error: "projectId required" };
  if (!pipelineType) return { success: false, error: "pipelineType required" };
  if (!inputText)    return { success: false, error: "inputText required" };

  try {
    const { runPipeline } = await import("./season-pipeline-runner.js");

    /* Get the pipeline definition for this type */
    let definition: any;
    if (pipelineType === 'rank_for_keyword') {
      const { buildRankForKeywordPipeline } = await import("./season-pipeline-rank-for-keyword.js");
      definition = buildRankForKeywordPipeline();
    } else {
      return { success: false, error: `Unknown pipeline type: ${pipelineType}. Currently supported: rank_for_keyword.` };
    }

    const result = await runPipeline({
      projectId,
      inputText: String(inputText).slice(0, 2000),
      awareness,
      scope: scope || {},
      definition,
    });

    return { success: true, run: result };
  } catch (e: any) {
    return { success: false, error: e?.message || "pipeline run failed" };
  }
}

export async function bsSeasonPipelineList(body: any): Promise<any> {
  const { projectId, limit = 20, pipelineType, status } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };

  try {
    let q = db().from("season_pipeline_runs")
      .select("id,pipeline_type,input_text,goal_summary,status,step_count,steps_completed,steps_failed,llm_calls_used,estimated_cost_usd,started_at,finished_at")
      .eq("project_id", projectId)
      .order("started_at", { ascending: false })
      .limit(Math.min(Number(limit), 100));
    if (pipelineType) q = q.eq("pipeline_type", pipelineType);
    if (status)       q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, runs: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

export async function bsSeasonPipelineGet(body: any): Promise<any> {
  const { runId } = body || {};
  if (!runId) return { success: false, error: "runId required" };

  try {
    const { data: run, error: runErr } = await db().from("season_pipeline_runs")
      .select("*").eq("id", runId).maybeSingle();
    if (runErr) return { success: false, error: runErr.message };
    if (!run)   return { success: false, error: "run not found" };

    const { data: steps, error: stepsErr } = await db().from("season_pipeline_steps")
      .select("*").eq("run_id", runId).order("step_index");
    if (stepsErr) return { success: false, error: stepsErr.message };

    return { success: true, run, steps: steps || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "get failed" };
  }
}

export async function bsSeasonPipelineFeedback(body: any): Promise<any> {
  const { stepId, feedback, feedback_status } = body || {};
  if (!stepId)   return { success: false, error: "stepId required" };
  if (!feedback) return { success: false, error: "feedback required" };

  const valid = ['approved', 'needs_revision', 'rejected'];
  if (feedback_status && !valid.includes(feedback_status)) {
    return { success: false, error: `feedback_status must be one of: ${valid.join(', ')}` };
  }

  try {
    const { data, error } = await db().from("season_pipeline_steps")
      .update({
        feedback: String(feedback).slice(0, 4000),
        feedback_status: feedback_status || null,
        feedback_at: new Date().toISOString(),
      })
      .eq("id", stepId)
      .select("id, run_id, step_id, feedback_status")
      .maybeSingle();
    if (error) return { success: false, error: error.message };

    /* If approved, store as writing_pattern knowledge for future runs */
    if (feedback_status === 'approved') {
      try {
        const { data: stepRow } = await db().from("season_pipeline_steps")
          .select("output, step_id, run_id").eq("id", stepId).maybeSingle();
        if (stepRow && (stepRow as any).output) {
          const { data: runRow } = await db().from("season_pipeline_runs")
            .select("project_id, pipeline_type").eq("id", (stepRow as any).run_id).maybeSingle();
          if (runRow) {
            const { cacheKnowledge } = await import("./season-knowledge-cache.js");
            await cacheKnowledge({
              projectId: (runRow as any).project_id,
              knowledgeType: 'writing_pattern',
              key: `approved:${(runRow as any).pipeline_type}:${(stepRow as any).step_id}:${Date.now()}`,
              value: { output: (stepRow as any).output, feedback },
              summary: `Approved ${(stepRow as any).step_id} output — pattern stored`,
              source: 'manav_feedback',
              confidence: 0.95,
            });
          }
        }
      } catch { /* non-fatal */ }
    }

    return { success: true, step: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "feedback failed" };
  }
}
