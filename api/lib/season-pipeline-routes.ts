/* ════════════════════════════════════════════════════════════════
   api/lib/season-pipeline-routes.ts
   Phase 12 — Pipeline endpoint handlers.

   These thin handlers expose the pipeline runner to the frontend
   via the existing task-engine action router. No new function slot.

   Endpoints:
     bs_season_pipeline_run       — start a new pipeline (synchronous, blocks until done)
     bs_season_pipeline_launch    — start a new pipeline (async, returns run_id immediately)
     bs_season_pipeline_list      — list runs for a project
     bs_season_pipeline_get       — get a run with all steps (used for polling)
     bs_season_pipeline_feedback  — Manav's feedback on a step
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

/* Phase 13a — launch endpoint for live dashboard.
   Creates the run row, returns run_id immediately, and triggers the
   pipeline execution as fire-and-forget. The frontend polls
   bs_season_pipeline_get to watch progress live.
   The pipeline runs inside the same serverless function invocation —
   Vercel keeps the process alive until either work completes or
   maxDuration (300s) is hit, both of which are fine. */
export async function bsSeasonPipelineLaunch(body: any): Promise<any> {
  const { projectId, pipelineType, inputText, scope, awareness } = body || {};
  if (!projectId)    return { success: false, error: "projectId required" };
  if (!pipelineType) return { success: false, error: "pipelineType required" };
  if (!inputText)    return { success: false, error: "inputText required" };

  try {
    /* Resolve the pipeline definition first so we can write step_count to the run row */
    let definition: any;
    if (pipelineType === 'rank_for_keyword') {
      const { buildRankForKeywordPipeline } = await import("./season-pipeline-rank-for-keyword.js");
      definition = buildRankForKeywordPipeline();
    } else {
      return { success: false, error: `Unknown pipeline type: ${pipelineType}. Currently supported: rank_for_keyword.` };
    }

    /* Create the run row immediately so the frontend has a run_id to poll. */
    const { data: runInsert, error: runErr } = await db().from("season_pipeline_runs").insert({
      project_id:    projectId,
      pipeline_type: pipelineType,
      input_text:    String(inputText).slice(0, 2000),
      goal_summary:  String((scope || {}).goal || '').slice(0, 240),
      scope:         scope || {},
      status:        'running',
      step_count:    definition.steps.length,
    }).select("id").maybeSingle();

    if (runErr || !runInsert) {
      return { success: false, error: runErr?.message || 'could not create run row' };
    }
    const runId = (runInsert as any).id as string;

    /* Fire-and-forget the actual pipeline work. The function process stays
       alive until the work completes or maxDuration hits. Errors here are
       captured into the run row by runPipelineWithExistingRow. */
    (async () => {
      try {
        const { runPipelineWithExistingRow } = await import("./season-pipeline-runner.js");
        await runPipelineWithExistingRow({
          runId,
          projectId,
          inputText: String(inputText).slice(0, 2000),
          awareness,
          scope: scope || {},
          definition,
        });
      } catch (e: any) {
        /* If the background work crashes, write a failure to the run row so
           the polling frontend sees the failure rather than an eternal "running". */
        try {
          await db().from("season_pipeline_runs").update({
            status: 'failed',
            honest_summary: `Pipeline crashed in background: ${e?.message || 'unknown error'}`,
            finished_at: new Date().toISOString(),
          }).eq("id", runId);
        } catch { /* non-fatal */ }
      }
    })();

    /* Return immediately so the frontend can start polling */
    return { success: true, run_id: runId, step_count: definition.steps.length };
  } catch (e: any) {
    return { success: false, error: e?.message || "pipeline launch failed" };
  }
}

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

/* Phase 13a recovery — mark a stuck run as interrupted.
   Used when the frontend detects a run has been stuck in 'running'
   status with no progress for too long (Vercel maxDuration likely hit).
   This is a safe cleanup operation: it only acts on runs whose status
   is currently 'running', so accidental re-calls are no-ops. */
export async function bsSeasonPipelineInterrupt(body: any): Promise<any> {
  const { runId, reason } = body || {};
  if (!runId) return { success: false, error: "runId required" };
  try {
    /* Update the run row */
    const { data: existing } = await db().from("season_pipeline_runs")
      .select("status, steps_completed, step_count")
      .eq("id", runId)
      .maybeSingle();
    if (!existing) return { success: false, error: "run not found" };
    if ((existing as any).status !== 'running') {
      return { success: true, message: `Run already in terminal state: ${(existing as any).status}` };
    }

    const honestReason = String(reason || "Marked interrupted from dashboard — likely Vercel maxDuration hit").slice(0, 500);

    await db().from("season_pipeline_runs").update({
      status:          'failed',
      honest_summary:  `Run interrupted. ${honestReason}. Steps completed before interruption: ${(existing as any).steps_completed} / ${(existing as any).step_count}.`,
      finished_at:     new Date().toISOString(),
    }).eq("id", runId);

    /* Mark any 'running' steps as interrupted too */
    await db().from("season_pipeline_steps").update({
      status:        'failed',
      error_message: 'Interrupted — see run honest_summary.',
      finished_at:   new Date().toISOString(),
    }).eq("run_id", runId).eq("status", 'running');

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "interrupt failed" };
  }
}

/* Phase 13a-v2 — step-by-step execution routes.
   These replace bsSeasonPipelineLaunch (which used fire-and-forget background
   work that Vercel was freezing). Each step is now its own HTTP request. */

export async function bsSeasonPipelineCreate(body: any): Promise<any> {
  const { projectId, pipelineType, inputText, scope } = body || {};
  if (!projectId)    return { success: false, error: "projectId required" };
  if (!pipelineType) return { success: false, error: "pipelineType required" };
  if (!inputText)    return { success: false, error: "inputText required" };

  try {
    let definition: any;
    if (pipelineType === 'rank_for_keyword') {
      const { buildRankForKeywordPipeline } = await import("./season-pipeline-rank-for-keyword.js");
      definition = buildRankForKeywordPipeline();
    } else {
      return { success: false, error: `Unknown pipeline type: ${pipelineType}` };
    }

    const { createRunOnly } = await import("./season-pipeline-runner.js");
    const result = await createRunOnly({
      projectId,
      inputText: String(inputText).slice(0, 2000),
      scope: scope || {},
      definition,
    });

    if (result.error || !result.run_id) {
      return { success: false, error: result.error || 'create failed' };
    }

    /* Phase 14 — wire the run to a campaign + content panel.
       Best-effort: if campaign creation fails, the run still proceeds without
       campaign linkage. We don't want to block a pipeline on campaign infrastructure. */
    let campaignId: string | undefined;
    let panelId:    string | undefined;
    let campaignNote = '';
    try {
      const keyword = (scope?.keyword as string) || '';
      if (keyword && pipelineType === 'rank_for_keyword') {
        const { createOrFindCampaign, getContentPanelId } = await import("./seo-campaign-engine.js");
        const camp = await createOrFindCampaign({
          projectId,
          keyword,
          campaignKind: 'rank_for_keyword',
          goal: `Rank for "${keyword}"`,
        });
        if (camp.success && camp.campaign_id) {
          campaignId = camp.campaign_id;
          panelId = (await getContentPanelId(camp.campaign_id)) || undefined;
          campaignNote = camp.created ? 'new_campaign' : 'reused_campaign';

          /* Stamp the run with campaign_id + panel_id */
          const { db } = await import("./db.js");
          await db().from("season_pipeline_runs").update({
            campaign_id: campaignId,
            panel_id:    panelId,
          }).eq("id", result.run_id);
        }
      }
    } catch (e: any) {
      /* Log but don't block */
      console.log(`[bs_season_pipeline_create] campaign linkage failed: ${e?.message}`);
    }

    return {
      success: true,
      run_id: result.run_id,
      step_count: result.step_count,
      campaign_id: campaignId,
      panel_id:    panelId,
      campaign_state: campaignNote,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "create failed" };
  }
}

export async function bsSeasonPipelineExecuteNext(body: any): Promise<any> {
  const { runId, pipelineType } = body || {};
  if (!runId) return { success: false, error: "runId required" };
  if (!pipelineType) return { success: false, error: "pipelineType required" };

  try {
    let definition: any;
    if (pipelineType === 'rank_for_keyword') {
      const { buildRankForKeywordPipeline } = await import("./season-pipeline-rank-for-keyword.js");
      definition = buildRankForKeywordPipeline();
    } else {
      return { success: false, error: `Unknown pipeline type: ${pipelineType}` };
    }

    const { executeNextPendingStep } = await import("./season-pipeline-runner.js");
    const result = await executeNextPendingStep({ runId, definition });
    if (result.error) return { success: false, error: result.error };

    return {
      success: true,
      step_index:    result.step_index,
      step_id:       result.step_id,
      step_label:    result.step_label,
      step_status:   result.step_status,
      step_error:    result.step_error,
      no_more_steps: result.no_more_steps,
      run_status:    result.run_status,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "execute next failed" };
  }
}
