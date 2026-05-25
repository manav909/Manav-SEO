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
       Phase 21 Block 2 — if scope.campaignId is provided (because the chat
       surface already committed the structure via commitCampaignStructure),
       just stamp the run with it. Otherwise fall back to the legacy
       createOrFindCampaign single-keyword flow. */
    let campaignId: string | undefined;
    let panelId:    string | undefined;
    let campaignNote = '';
    try {
      /* Phase 21 Block 2: chat surface already committed the campaign */
      if (scope?.campaignId && pipelineType === 'rank_for_keyword') {
        campaignId = scope.campaignId as string;
        const { getContentPanelId } = await import("./seo-campaign-engine.js");
        panelId = (await getContentPanelId(campaignId)) || undefined;
        campaignNote = 'pre_committed_campaign';

        const { db } = await import("./db.js");
        await db().from("season_pipeline_runs").update({
          campaign_id: campaignId,
          panel_id:    panelId,
        }).eq("id", result.run_id);
      } else {
        /* Legacy single-keyword path */
        const keyword = (scope?.keyword as string) || '';
        if (keyword && pipelineType === 'rank_for_keyword') {
          const { createOrFindCampaign, getContentPanelId } = await import("./seo-campaign-engine.js");
          const camp = await createOrFindCampaign({
            projectId,
            keyword,
            campaignKind: 'rank_for_keyword',
            goal: `Rank for "${keyword}"`,
            /* If scope has a keywordGroup (e.g. from a direct API caller bypassing the
               chat orchestrator), pass it through */
            keywordGroup: Array.isArray(scope?.keywordGroup) ? scope.keywordGroup : undefined,
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
      }
    } catch (e: any) {
      /* Log but don't block */
      console.error(`[bs_season_pipeline_create] campaign linkage failed: ${e?.message}`);
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

/* ════════════════════════════════════════════════════════════════
   Phase 14.2 — Resilience routes (retry-step, retry-from-step, skip-step)
═══════════════════════════════════════════════════════════════ */

export async function bsSeasonPipelineRetryStep(body: any): Promise<any> {
  const { runId, stepIndex } = body || {};
  if (!runId)                  return { success: false, error: "runId required" };
  if (typeof stepIndex !== 'number') return { success: false, error: "stepIndex (0-based number) required" };
  const { retryStep } = await import("./season-pipeline-runner.js");
  return retryStep({ runId, stepIndex });
}

export async function bsSeasonPipelineRetryFromStep(body: any): Promise<any> {
  const { runId, stepIndex } = body || {};
  if (!runId)                  return { success: false, error: "runId required" };
  if (typeof stepIndex !== 'number') return { success: false, error: "stepIndex (0-based number) required" };
  const { retryFromStep } = await import("./season-pipeline-runner.js");
  return retryFromStep({ runId, stepIndex });
}

export async function bsSeasonPipelineSkipStep(body: any): Promise<any> {
  const { runId, stepIndex, reason } = body || {};
  if (!runId)                  return { success: false, error: "runId required" };
  if (typeof stepIndex !== 'number') return { success: false, error: "stepIndex (0-based number) required" };
  const { skipStep } = await import("./season-pipeline-runner.js");
  return skipStep({ runId, stepIndex, reason });
}

/* Phase 17.5 — L1 manual "Refresh from audit" trigger.

   When the technical_audit refreshes (cron or manual), the existing pipeline
   run's downstream artifacts (competitor_snapshot, content_brief, forecast,
   client_update, internal_handover) stay frozen at first-run state. This
   action resets all audit-consuming steps to pending so they re-run with
   the fresh ctx.audit_findings.

   Flow:
     1. Load the run + its pipeline_type + campaign_id
     2. Verify an audit has actually run for the campaign (else clear error)
     3. Build the pipeline definition + locate the first audit-consuming step
     4. Reset all steps from that index forward via retryFromStep
     5. Caller's frontend then drives execution via bs_season_pipeline_execute_next

   Returns:
     { success, steps_reset, first_step_index, first_step_id, audit_run_id }
   or { success: false, error }                                              */
export async function bsSeasonPipelineRefreshFromAudit(body: any): Promise<any> {
  const { runId } = body || {};
  if (!runId) return { success: false, error: "runId required" };

  try {
    /* Load the run to know its pipeline_type + campaign_id */
    const { data: run, error: runErr } = await db().from("season_pipeline_runs")
      .select("id, pipeline_type, campaign_id, status, project_id")
      .eq("id", runId).maybeSingle();
    if (runErr || !run) {
      return { success: false, error: `Run not found: ${runErr?.message || 'no row'}` };
    }
    const r = run as any;
    if (!r.campaign_id) {
      return { success: false, error: "This pipeline run isn't linked to a campaign, so it has no associated audit. Refresh-from-audit only applies to campaign-linked runs." };
    }

    /* Verify an audit has run for this campaign */
    const { data: auditRow } = await db().from("technical_audit_findings")
      .select("audit_run_id, created_at")
      .eq("campaign_id", r.campaign_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!auditRow || !(auditRow as any).audit_run_id) {
      return { success: false, error: "No technical audit has been run for this campaign yet. Run the audit first, then refresh the pipeline from it." };
    }
    const auditRunId = (auditRow as any).audit_run_id as string;

    /* Build the definition for this pipeline_type */
    let definition: any;
    let firstAuditStepIndex: number = -1;
    if (r.pipeline_type === 'rank_for_keyword') {
      const { buildRankForKeywordPipeline, findFirstAuditDependentStepIndex } = await import("./season-pipeline-rank-for-keyword.js");
      definition = buildRankForKeywordPipeline();
      firstAuditStepIndex = findFirstAuditDependentStepIndex(definition);
    } else {
      return { success: false, error: `Refresh-from-audit not implemented for pipeline_type '${r.pipeline_type}' yet.` };
    }

    if (firstAuditStepIndex < 0) {
      return { success: false, error: "Pipeline definition has no audit-consuming steps. Nothing to refresh." };
    }
    const firstStep = definition.steps[firstAuditStepIndex];

    /* Reset all steps from that index forward */
    const { retryFromStep } = await import("./season-pipeline-runner.js");
    const reset = await retryFromStep({ runId, stepIndex: firstAuditStepIndex });
    if (!reset.success) {
      return { success: false, error: reset.error || 'retryFromStep failed' };
    }

    return {
      success: true,
      steps_reset: reset.steps_reset,
      first_step_index: firstAuditStepIndex,
      first_step_id:    firstStep.id,
      first_step_label: firstStep.label,
      audit_run_id:     auditRunId,
      note: `Reset ${reset.steps_reset} step${reset.steps_reset === 1 ? '' : 's'} starting at "${firstStep.label}". Drive execution forward via bs_season_pipeline_execute_next to re-run with fresh audit data.`,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'refresh-from-audit failed unexpectedly' };
  }
}

/* Phase 17.5.8 — reconcile a run's counters + honest_summary against its
   step row state. Used for repairing runs damaged during the brief Phase
   17.5.5-17.5.6 window when the panel and dashboard both drove execution
   in parallel, producing inconsistent counter increments. Idempotent —
   safe to call on already-clean runs (will just rewrite identical state).

   Specifically rebuilds:
     - steps_completed / steps_failed (from step row statuses)
     - llm_calls_used / web_searches_used (from step row sums)
     - estimated_cost_usd
     - honest_summary (re-rendered from current row state)
     - final_artifacts (re-aggregated from completed step outputs)
     - status (completed/partial/failed based on rows)

   Calls finalizeRun internally with force=true to bypass the
   "already terminal" early-return.                                       */
export async function bsSeasonPipelineReconcile(body: any): Promise<any> {
  const { runId } = body || {};
  if (!runId) return { success: false, error: "runId required" };

  try {
    /* Load run to know its pipeline_type */
    const { data: run } = await db().from("season_pipeline_runs")
      .select("id, pipeline_type, status, steps_completed, steps_failed")
      .eq("id", runId).maybeSingle();
    if (!run) return { success: false, error: "run not found" };
    const r = run as any;

    /* Build the definition for this pipeline_type */
    let definition: any;
    if (r.pipeline_type === 'rank_for_keyword') {
      const { buildRankForKeywordPipeline } = await import("./season-pipeline-rank-for-keyword.js");
      definition = buildRankForKeywordPipeline();
    } else {
      return { success: false, error: `Reconcile not implemented for pipeline_type '${r.pipeline_type}'` };
    }

    /* Capture before-state for the response so the caller can see what changed */
    const beforeCompleted = r.steps_completed || 0;
    const beforeFailed    = r.steps_failed    || 0;

    /* Reconcile via finalizeRun with force=true */
    const { finalizeRun } = await import("./season-pipeline-runner.js");
    const result = await finalizeRun({ runId, definition, force: true });
    if (!result.success) {
      return { success: false, error: result.error || 'finalizeRun failed' };
    }

    /* Read after-state */
    const { data: afterRun } = await db().from("season_pipeline_runs")
      .select("status, steps_completed, steps_failed, honest_summary")
      .eq("id", runId).maybeSingle();
    const a = (afterRun as any) || {};

    return {
      success: true,
      before: { steps_completed: beforeCompleted, steps_failed: beforeFailed },
      after:  { status: a.status, steps_completed: a.steps_completed, steps_failed: a.steps_failed },
      changed:
        beforeCompleted !== (a.steps_completed || 0) ||
        beforeFailed    !== (a.steps_failed    || 0),
      note: `Reconciled. Before: ${beforeCompleted}/${a.steps_completed != null ? definition.steps.length : '?'} completed. After: ${a.steps_completed || 0}/${definition.steps.length} completed, ${a.steps_failed || 0} failed. Honest summary regenerated.`,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'reconcile failed unexpectedly' };
  }
}
