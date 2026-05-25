/* ════════════════════════════════════════════════════════════════
   api/lib/season-pipeline-runner.ts
   Phase 12 — The pipeline runner.

   Executes a chained pipeline:
     1. Receives a pipeline definition (id, steps[], inputs)
     2. Creates a season_pipeline_runs row
     3. For each step:
        a. Creates a season_pipeline_steps row
        b. Calls the step's handler with accumulated context
        c. Persists the artifact
        d. Updates progress
        e. Stops on failure (unless step is marked continue_on_fail)
     4. Aggregates final artifacts into the run row
     5. Writes activity_log entries throughout

   Step handlers receive:
     • ctx (projectId, awareness, prior step outputs by id)
     • the step's own input
   and return:
     • { ok, output, artifact?, honest_note?, llm_calls, web_searches }

   Important guarantees:
     • Honesty: a step that uses fallback data must say so via honest_note
     • Cost: per-pipeline LLM cap (default 20 calls) — soft-fail if exceeded
     • Resumability: any failed step can be re-run alone via retryStep()
     • Audit trail: every step is persisted with input snapshot + output
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
/* Phase 17.0 — type-only import so PipelineStepContext can expose audit_findings
   without creating runtime coupling. Erased at compile time. */
import type { Finding } from "./seo-technical-audit.js";

/* ─── Public types ──────────────────────────────────────────── */

export type PipelineType =
  | 'rank_for_keyword'
  | 'content_production'
  | 'audit_remediation'
  | 'monthly_client_pack'
  | 'competitor_deep_dive'
  | 'algorithm_response';

export interface PipelineStepContext {
  projectId:        string;
  awareness?:       any;
  scope:            Record<string, any>;
  /* Outputs from prior steps, keyed by step_id */
  prior:            Record<string, any>;
  /* Phase 17.0 — audit-to-pipeline bridge.
     The most recent technical audit's findings for this campaign, if an
     audit has run. Empty array when no audit exists (greenfield campaign)
     or when no campaign is associated with the run (one-off pipelines).
     Steps that want to leverage audit intelligence read from this; steps
     that don't can ignore it. */
  audit_findings:   Finding[];
}

export interface PipelineStepResult {
  ok:           boolean;
  output?:      any;
  artifact?:    { kind: string; title: string; body: string };
  honest_note?: string;
  llm_calls?:   number;
  web_searches?:number;
  error?:       string;
}

export interface PipelineStep {
  id:               string;     // e.g. 'research_keyword'
  label:            string;     // e.g. 'Research the target keyword'
  description:      string;
  artifact_kind?:   string;     // 'brief' | 'outline' | 'draft' | etc.
  handler:          (ctx: PipelineStepContext) => Promise<PipelineStepResult>;
  /* If true, a failure here doesn't abort the whole pipeline.
     Useful for "nice to have" steps. */
  continue_on_fail?: boolean;
  /* Phase 17.5 — set to true when the step's handler reads ctx.audit_findings.
     Used by refresh-from-audit to identify which steps to reset when the
     technical audit refreshes. The earliest such step is the entry point
     for selective re-execution. */
  consumes_audit?:   boolean;
}

export interface PipelineDefinition {
  type:         PipelineType;
  steps:        PipelineStep[];
  /* Optional: per-pipeline cost ceiling */
  llm_call_cap?: number;
}

export interface PipelineRunResult {
  run_id:                string;
  status:                'completed' | 'failed' | 'partial' | 'awaiting_review';
  step_count:            number;
  steps_completed:       number;
  steps_failed:          number;
  final_artifacts:       Array<{ kind: string; title: string; body: string; step_id: string }>;
  honest_summary:        string;
  client_facing_summary: string;
  llm_calls_used:        number;
  web_searches_used:     number;
  estimated_cost_usd:    number;
  elapsed_ms:            number;
}

const DEFAULT_LLM_CAP = 20;
const COST_PER_CALL   = 0.10;   // rough estimate, sonnet-4-6 average
const STEP_TIMEOUT_MS = 280_000;   /* 4min 40s — just under Vercel's 5min hard cap.
                                       The inner timeout shouldn't fire before Vercel
                                       itself would. Real protection happens at the
                                       per-fetch AbortController level. */

/* Race a step handler against a timeout so a hung step (stuck LLM call, hung
   DB query, dropped connection) doesn't take down the whole function before
   Vercel kills it. Returns a failed result if the timeout fires. */
async function runStepWithTimeout(
  step: PipelineStep,
  ctx: PipelineStepContext,
  timeoutMs: number = STEP_TIMEOUT_MS,
): Promise<PipelineStepResult> {
  let timeoutId: any = null;
  const timeoutPromise = new Promise<PipelineStepResult>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        ok: false,
        error: `Step "${step.label}" exceeded ${Math.round(timeoutMs/1000)}s timeout — aborted to keep the pipeline responsive.`,
      });
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([
      step.handler(ctx),
      timeoutPromise,
    ]);
    return result;
  } catch (e: any) {
    return { ok: false, error: e?.message || 'step threw unexpectedly' };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/* ─── Phase 17.0 — Audit findings loader ────────────────────
   The bridge between the technical_audit pillar and the pipeline.
   Loads the most-recent audit's findings for a campaign so step
   handlers can leverage them via ctx.audit_findings.

   Returns [] when:
     • campaignId is null/undefined (one-off pipeline, no campaign)
     • no audit has ever run on this campaign
     • the table query fails (logged, caught — never throws upward)

   Empty array is the "audit data unavailable" signal — distinct from
   "audit ran and found nothing". Steps deciding whether to use audit
   data should check `audit_findings.length > 0`. */
async function loadLatestAuditFindings(campaignId: string | null | undefined): Promise<Finding[]> {
  if (!campaignId) return [];
  try {
    const { data: rows, error } = await db().from("technical_audit_findings")
      .select("audit_kind, severity, finding_title, finding_detail, recommendation, evidence, data_source, audit_run_id, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.warn(`[pipeline-runner] audit findings load failed for campaign ${campaignId.slice(0,8)}: ${error.message}`);
      return [];
    }
    if (!rows || rows.length === 0) return [];
    const latestRunId = (rows[0] as any).audit_run_id;
    if (!latestRunId) return [];
    /* Filter to just the most recent audit run's findings */
    const latestRows = (rows as any[]).filter(r => r.audit_run_id === latestRunId);
    return latestRows.map(r => ({
      audit_kind:     r.audit_kind,
      severity:       r.severity,
      finding_title:  r.finding_title,
      finding_detail: r.finding_detail || undefined,
      recommendation: r.recommendation || undefined,
      evidence:       r.evidence || undefined,
      data_source:    r.data_source || undefined,
    })) as Finding[];
  } catch (e: any) {
    console.warn(`[pipeline-runner] audit findings load threw for campaign ${(campaignId || '').slice(0,8)}: ${e?.message || e}`);
    return [];
  }
}

/* Helper: resolve campaignId from runner opts. The route layer stamps
   campaign_id onto season_pipeline_runs after the run is created (for
   campaign-linked pipelines), so we look it up if not present in scope. */
async function resolveCampaignIdForRun(runId: string, scope: Record<string, any>): Promise<string | null> {
  /* Scope can carry campaignId directly (cleanest path when caller knows) */
  if (scope?.campaignId && typeof scope.campaignId === 'string') return scope.campaignId;
  if (scope?.campaign_id && typeof scope.campaign_id === 'string') return scope.campaign_id;
  /* Otherwise read it from the run row */
  try {
    const { data: run } = await db().from("season_pipeline_runs")
      .select("campaign_id").eq("id", runId).maybeSingle();
    return ((run as any)?.campaign_id as string | undefined) || null;
  } catch {
    return null;
  }
}

/* ─── Public entrypoint ─────────────────────────────────────── */

export async function runPipeline(opts: {
  projectId: string;
  inputText: string;
  awareness?: any;
  scope: Record<string, any>;
  definition: PipelineDefinition;
}): Promise<PipelineRunResult> {
  const start = Date.now();
  const cap = opts.definition.llm_call_cap || DEFAULT_LLM_CAP;

  /* ─── Create the run record ─── */
  const { data: runInsert, error: runErr } = await db().from("season_pipeline_runs").insert({
    project_id:    opts.projectId,
    pipeline_type: opts.definition.type,
    input_text:    opts.inputText.slice(0, 2000),
    goal_summary:  String(opts.scope.goal || '').slice(0, 240),
    scope:         opts.scope,
    status:        'running',
    step_count:    opts.definition.steps.length,
  }).select("id").maybeSingle();

  if (runErr || !runInsert) {
    return {
      run_id: '',
      status: 'failed',
      step_count: opts.definition.steps.length,
      steps_completed: 0,
      steps_failed: 0,
      final_artifacts: [],
      honest_summary: `Couldn't create pipeline run: ${runErr?.message || 'unknown'}.`,
      client_facing_summary: '',
      llm_calls_used: 0,
      web_searches_used: 0,
      estimated_cost_usd: 0,
      elapsed_ms: Date.now() - start,
    };
  }
  const runId = (runInsert as any).id as string;

  await logActivity(opts.projectId, runId, 'pipeline_started',
    `Pipeline started: ${opts.definition.type} — "${opts.inputText.slice(0, 80)}${opts.inputText.length > 80 ? '…' : ''}"`,
    `${opts.definition.steps.length} steps planned.`,
  );

  /* ─── Walk steps ─── */
  const priorOutputs: Record<string, any> = {};
  const artifacts: PipelineRunResult['final_artifacts'] = [];
  let totalLlm  = 0;
  let totalWeb  = 0;
  let stepsCompleted = 0;
  let stepsFailed    = 0;
  const honestNotes: string[] = [];

  /* Phase 17.0 — load audit findings ONCE at run start, pass to every step.
     Findings don't change mid-pipeline; reloading per step would be wasteful. */
  const campaignIdForAudit = await resolveCampaignIdForRun(runId, opts.scope);
  const auditFindings = await loadLatestAuditFindings(campaignIdForAudit);
  if (auditFindings.length > 0) {
    console.log(`[runPipeline] loaded ${auditFindings.length} audit findings for campaign ${(campaignIdForAudit || '').slice(0,8)} — available to all steps via ctx.audit_findings`);
  }

  for (let i = 0; i < opts.definition.steps.length; i++) {
    const step = opts.definition.steps[i];

    /* Cost check */
    if (totalLlm >= cap) {
      honestNotes.push(`Stopped at step ${i + 1} ("${step.label}") — hit the per-pipeline LLM cap of ${cap}. Resume later or raise the cap in code.`);
      await markStepFailed(runId, i, step, 'llm cap reached', { cap, used: totalLlm });
      stepsFailed++;
      break;
    }

    /* Create step record */
    const { data: stepInsert } = await db().from("season_pipeline_steps").insert({
      run_id: runId,
      step_index: i,
      step_id: step.id,
      step_label: step.label,
      status: 'running',
      started_at: new Date().toISOString(),
      input_snapshot: { scope: opts.scope, prior_keys: Object.keys(priorOutputs) },
    }).select("id").maybeSingle();
    const stepRowId = (stepInsert as any)?.id;

    await db().from("season_pipeline_runs").update({
      step_current: i + 1,
    }).eq("id", runId);

    const stepStart = Date.now();
    console.log(`[runPipeline] ▶ step ${i + 1}/${opts.definition.steps.length}: ${step.id} ("${step.label}")`);
    const result: PipelineStepResult = await runStepWithTimeout(step, {
      projectId: opts.projectId,
      awareness: opts.awareness,
      scope: opts.scope,
      prior: priorOutputs,
      audit_findings: auditFindings,
    });
    const stepElapsed = Date.now() - stepStart;
    console.log(`[runPipeline] ${result.ok ? '✓' : '✗'} step ${i + 1}: ${step.id} done in ${stepElapsed}ms — ${result.ok ? 'ok' : 'failed: ' + (result.error || 'unknown')}`);

    /* Persist outputs */
    totalLlm += result.llm_calls || 0;
    totalWeb += result.web_searches || 0;

    if (result.ok) {
      stepsCompleted++;
      priorOutputs[step.id] = result.output;
      if (result.artifact) {
        artifacts.push({ ...result.artifact, step_id: step.id });
      }
      if (result.honest_note) honestNotes.push(`(${step.label}) ${result.honest_note}`);

      if (stepRowId) {
        /* Phase 13a-v3: nest the artifact body into the output JSONB so the
           dashboard viewer can render formatted markdown directly without
           falling through to a JSON dump. */
        const outputWithBody = (result.output && typeof result.output === 'object' && !Array.isArray(result.output))
          ? { ...result.output, _artifact_body: result.artifact?.body || null }
          : { value: result.output, _artifact_body: result.artifact?.body || null };
        await db().from("season_pipeline_steps").update({
          status: 'completed',
          output: outputWithBody,
          output_artifact_kind: result.artifact?.kind || null,
          honest_note: result.honest_note || null,
          llm_calls: result.llm_calls || 0,
          web_searches: result.web_searches || 0,
          duration_ms: stepElapsed,
          finished_at: new Date().toISOString(),
        }).eq("id", stepRowId);
      }

      await db().from("season_pipeline_runs").update({
        steps_completed:  stepsCompleted,
        llm_calls_used:   totalLlm,
        web_searches_used: totalWeb,
        estimated_cost_usd: Number((totalLlm * COST_PER_CALL).toFixed(4)),
      }).eq("id", runId);
    } else {
      stepsFailed++;
      if (stepRowId) {
        await db().from("season_pipeline_steps").update({
          status: 'failed',
          error_message: (result.error || 'unknown').slice(0, 500),
          llm_calls: result.llm_calls || 0,
          web_searches: result.web_searches || 0,
          duration_ms: stepElapsed,
          finished_at: new Date().toISOString(),
        }).eq("id", stepRowId);
      }
      honestNotes.push(`Step "${step.label}" failed: ${result.error || 'unknown'}.`);
      if (!step.continue_on_fail) break;
    }
  }

  /* ─── Finalize the run ─── */
  const elapsedMs = Date.now() - start;
  const success = stepsCompleted === opts.definition.steps.length;
  const finalStatus: 'completed' | 'failed' | 'partial' =
    success ? 'completed' : (stepsCompleted > 0 ? 'partial' : 'failed');

  const honestSummary = buildHonestSummary({
    stepsCompleted, stepsFailed,
    stepCount: opts.definition.steps.length,
    notes: honestNotes,
    elapsedMs,
  });
  const clientFacingSummary = buildClientFacingSummary({
    pipelineType: opts.definition.type,
    artifacts,
    stepsCompleted,
  });

  await db().from("season_pipeline_runs").update({
    status: finalStatus === 'partial' ? 'completed' : finalStatus,
    steps_completed: stepsCompleted,
    steps_failed:    stepsFailed,
    final_artifacts: artifacts,
    honest_summary:  honestSummary,
    client_facing_summary: clientFacingSummary,
    finished_at:     new Date().toISOString(),
  }).eq("id", runId);

  await logActivity(opts.projectId, runId,
    success ? 'pipeline_completed' : 'pipeline_partial',
    `Pipeline ${finalStatus}: ${opts.definition.type} (${stepsCompleted}/${opts.definition.steps.length} steps)`,
    `Used ${totalLlm} LLM calls, ${totalWeb} web searches, ~$${(totalLlm * COST_PER_CALL).toFixed(2)}, ${(elapsedMs/1000).toFixed(1)}s total.`,
  );

  /* Phase D1 — dual-write artifacts into the artifacts table.
     Same logic as finalizeRun; this is the runPipeline (synchronous) path.
     Best-effort; failures logged but don't block return. */
  try {
    const { persistPipelineRunArtifacts } = await import("./artifacts.js");
    await persistPipelineRunArtifacts({
      runId,
      projectId:      opts.projectId,
      campaignId:     (opts.scope?.campaign_id || opts.scope?.campaignId) as string | undefined,
      panelId:        (opts.scope?.panel_id    || opts.scope?.panelId)    as string | undefined,
      keyword:        (opts.scope?.keyword as string) || null,
      targetUrl:      (opts.scope?.target_url as string) || null,
      pipelineType:   opts.definition.type,
      artifacts,
      totalLlmCalls:  totalLlm,
      totalCostUsd:   Number((totalLlm * COST_PER_CALL).toFixed(4)),
      finishedAt:     new Date().toISOString(),
    });
  } catch (e: any) {
    console.log(`[runPipeline] artifacts persist failed: ${e?.message || 'unknown'} — not blocking`);
  }

  return {
    run_id: runId,
    status: finalStatus,
    step_count: opts.definition.steps.length,
    steps_completed: stepsCompleted,
    steps_failed: stepsFailed,
    final_artifacts: artifacts,
    honest_summary: honestSummary,
    client_facing_summary: clientFacingSummary,
    llm_calls_used: totalLlm,
    web_searches_used: totalWeb,
    estimated_cost_usd: Number((totalLlm * COST_PER_CALL).toFixed(4)),
    elapsed_ms: elapsedMs,
  };
}

/* ─── Helpers ───────────────────────────────────────────────── */

/* Phase 13a — variant for use with bsSeasonPipelineLaunch.
   The run row is already created by the launch endpoint; this function
   just walks the steps using the existing run_id. Same logic as runPipeline
   but without the row-creation step at the top. */
export async function runPipelineWithExistingRow(opts: {
  runId: string;
  projectId: string;
  inputText: string;
  awareness?: any;
  scope: Record<string, any>;
  definition: PipelineDefinition;
}): Promise<PipelineRunResult> {
  const start = Date.now();
  const cap = opts.definition.llm_call_cap || DEFAULT_LLM_CAP;
  const runId = opts.runId;

  await logActivity(opts.projectId, runId, 'pipeline_started',
    `Pipeline started: ${opts.definition.type} — "${opts.inputText.slice(0, 80)}${opts.inputText.length > 80 ? '…' : ''}"`,
    `${opts.definition.steps.length} steps planned.`,
  );

  const priorOutputs: Record<string, any> = {};
  const artifacts: PipelineRunResult['final_artifacts'] = [];
  let totalLlm  = 0;
  let totalWeb  = 0;
  let stepsCompleted = 0;
  let stepsFailed    = 0;
  const honestNotes: string[] = [];

  /* Phase 17.0 — load audit findings ONCE at run start, pass to every step. */
  const campaignIdForAudit = await resolveCampaignIdForRun(runId, opts.scope);
  const auditFindings = await loadLatestAuditFindings(campaignIdForAudit);
  if (auditFindings.length > 0) {
    console.log(`[runPipelineWithExistingRow] loaded ${auditFindings.length} audit findings for campaign ${(campaignIdForAudit || '').slice(0,8)} — available to all steps via ctx.audit_findings`);
  }

  for (let i = 0; i < opts.definition.steps.length; i++) {
    const step = opts.definition.steps[i];

    if (totalLlm >= cap) {
      honestNotes.push(`Stopped at step ${i + 1} ("${step.label}") — hit the per-pipeline LLM cap of ${cap}.`);
      await markStepFailed(runId, i, step, 'llm cap reached', { cap, used: totalLlm });
      stepsFailed++;
      break;
    }

    const { data: stepInsert } = await db().from("season_pipeline_steps").insert({
      run_id: runId,
      step_index: i,
      step_id: step.id,
      step_label: step.label,
      status: 'running',
      started_at: new Date().toISOString(),
      input_snapshot: { scope: opts.scope, prior_keys: Object.keys(priorOutputs) },
    }).select("id").maybeSingle();
    const stepRowId = (stepInsert as any)?.id;

    await db().from("season_pipeline_runs").update({
      step_current: i + 1,
    }).eq("id", runId);

    const stepStart = Date.now();
    console.log(`[runPipeline] ▶ step ${i + 1}/${opts.definition.steps.length}: ${step.id} ("${step.label}")`);
    const result: PipelineStepResult = await runStepWithTimeout(step, {
      projectId: opts.projectId,
      awareness: opts.awareness,
      scope: opts.scope,
      prior: priorOutputs,
      audit_findings: auditFindings,
    });
    const stepElapsed = Date.now() - stepStart;
    console.log(`[runPipeline] ${result.ok ? '✓' : '✗'} step ${i + 1}: ${step.id} done in ${stepElapsed}ms — ${result.ok ? 'ok' : 'failed: ' + (result.error || 'unknown')}`);

    totalLlm += result.llm_calls || 0;
    totalWeb += result.web_searches || 0;

    if (result.ok) {
      stepsCompleted++;
      priorOutputs[step.id] = result.output;
      if (result.artifact) {
        artifacts.push({ ...result.artifact, step_id: step.id });
      }
      if (result.honest_note) honestNotes.push(`(${step.label}) ${result.honest_note}`);

      if (stepRowId) {
        /* Phase 13a-v3: nest the artifact body into the output JSONB so the
           dashboard viewer can render formatted markdown directly without
           falling through to a JSON dump. */
        const outputWithBody = (result.output && typeof result.output === 'object' && !Array.isArray(result.output))
          ? { ...result.output, _artifact_body: result.artifact?.body || null }
          : { value: result.output, _artifact_body: result.artifact?.body || null };
        await db().from("season_pipeline_steps").update({
          status: 'completed',
          output: outputWithBody,
          output_artifact_kind: result.artifact?.kind || null,
          honest_note: result.honest_note || null,
          llm_calls: result.llm_calls || 0,
          web_searches: result.web_searches || 0,
          duration_ms: stepElapsed,
          finished_at: new Date().toISOString(),
        }).eq("id", stepRowId);
      }

      await db().from("season_pipeline_runs").update({
        steps_completed:    stepsCompleted,
        llm_calls_used:     totalLlm,
        web_searches_used:  totalWeb,
        estimated_cost_usd: Number((totalLlm * COST_PER_CALL).toFixed(4)),
      }).eq("id", runId);
    } else {
      stepsFailed++;
      if (stepRowId) {
        await db().from("season_pipeline_steps").update({
          status: 'failed',
          error_message: (result.error || 'unknown').slice(0, 500),
          llm_calls: result.llm_calls || 0,
          web_searches: result.web_searches || 0,
          duration_ms: stepElapsed,
          finished_at: new Date().toISOString(),
        }).eq("id", stepRowId);
      }
      honestNotes.push(`Step "${step.label}" failed: ${result.error || 'unknown'}.`);
      if (!step.continue_on_fail) break;
    }
  }

  const elapsedMs = Date.now() - start;
  const success = stepsCompleted === opts.definition.steps.length;
  const finalStatus: 'completed' | 'failed' | 'partial' =
    success ? 'completed' : (stepsCompleted > 0 ? 'partial' : 'failed');

  const honestSummary = buildHonestSummary({
    stepsCompleted, stepsFailed,
    stepCount: opts.definition.steps.length,
    notes: honestNotes,
    elapsedMs,
  });
  const clientFacingSummary = buildClientFacingSummary({
    pipelineType: opts.definition.type,
    artifacts,
    stepsCompleted,
  });

  await db().from("season_pipeline_runs").update({
    status:                finalStatus === 'partial' ? 'completed' : finalStatus,
    steps_completed:       stepsCompleted,
    steps_failed:          stepsFailed,
    final_artifacts:       artifacts,
    honest_summary:        honestSummary,
    client_facing_summary: clientFacingSummary,
    finished_at:           new Date().toISOString(),
  }).eq("id", runId);

  await logActivity(opts.projectId, runId,
    success ? 'pipeline_completed' : 'pipeline_partial',
    `Pipeline ${finalStatus}: ${opts.definition.type} (${stepsCompleted}/${opts.definition.steps.length} steps)`,
    `Used ${totalLlm} LLM calls, ${totalWeb} web searches, ~$${(totalLlm * COST_PER_CALL).toFixed(2)}, ${(elapsedMs/1000).toFixed(1)}s total.`,
  );

  /* Phase D1 — dual-write artifacts. Same logic as finalizeRun + runPipeline. */
  try {
    const { persistPipelineRunArtifacts } = await import("./artifacts.js");
    await persistPipelineRunArtifacts({
      runId,
      projectId:      opts.projectId,
      campaignId:     (opts.scope?.campaign_id || opts.scope?.campaignId) as string | undefined,
      panelId:        (opts.scope?.panel_id    || opts.scope?.panelId)    as string | undefined,
      keyword:        (opts.scope?.keyword as string) || null,
      targetUrl:      (opts.scope?.target_url as string) || null,
      pipelineType:   opts.definition.type,
      artifacts,
      totalLlmCalls:  totalLlm,
      totalCostUsd:   Number((totalLlm * COST_PER_CALL).toFixed(4)),
      finishedAt:     new Date().toISOString(),
    });
  } catch (e: any) {
    console.log(`[runPipelineWithExistingRow] artifacts persist failed: ${e?.message || 'unknown'} — not blocking`);
  }

  return {
    run_id:                runId,
    status:                finalStatus,
    step_count:            opts.definition.steps.length,
    steps_completed:       stepsCompleted,
    steps_failed:          stepsFailed,
    final_artifacts:       artifacts,
    honest_summary:        honestSummary,
    client_facing_summary: clientFacingSummary,
    llm_calls_used:        totalLlm,
    web_searches_used:     totalWeb,
    estimated_cost_usd:    Number((totalLlm * COST_PER_CALL).toFixed(4)),
    elapsed_ms:            elapsedMs,
  };
}

async function markStepFailed(runId: string, idx: number, step: PipelineStep, reason: string, technical: any) {
  await db().from("season_pipeline_steps").insert({
    run_id: runId,
    step_index: idx,
    step_id: step.id,
    step_label: step.label,
    status: 'failed',
    error_message: reason,
    finished_at: new Date().toISOString(),
  });
}

async function logActivity(projectId: string, runId: string, eventType: string, headline: string, detail?: string) {
  try {
    await db().from("activity_log").insert({
      project_id: projectId,
      event_type: eventType,
      source: 'system',
      headline:  headline.slice(0, 240),
      detail:    (detail || '').slice(0, 500),
      technical: { run_id: runId },
      severity:  'info',
    });
  } catch { /* non-fatal */ }
}

function buildHonestSummary(opts: {
  stepsCompleted: number; stepsFailed: number; stepCount: number;
  notes: string[]; elapsedMs: number;
}): string {
  const lines: string[] = [];
  lines.push(`Pipeline ran in ${(opts.elapsedMs/1000).toFixed(1)}s.`);
  lines.push(`${opts.stepsCompleted}/${opts.stepCount} steps completed${opts.stepsFailed > 0 ? `, ${opts.stepsFailed} failed` : ''}.`);
  if (opts.notes.length > 0) {
    lines.push('');
    lines.push('Honest notes from the run:');
    for (const n of opts.notes) lines.push(`  • ${n}`);
  }
  return lines.join('\n');
}

function buildClientFacingSummary(opts: {
  pipelineType: PipelineType;
  artifacts: PipelineRunResult['final_artifacts'];
  stepsCompleted: number;
}): string {
  /* Client-facing voice: "Manav has produced X, Y, Z." No mention
     of pipelines or AI. Factual about what was produced. */
  if (opts.artifacts.length === 0) return '';
  const artifactList = opts.artifacts.map(a => `${a.kind}: ${a.title}`).join('; ');
  return `Completed deliverables: ${artifactList}.`;
}

/* ─── Retry a specific step (resume support) ────────────────── */

/* ─── Removed Phase 17.5.2 (2026-05-25) ────────────────────────
   A legacy retryStep that took { runId, stepIndex, definition } and
   inline-executed the step lived here. It was replaced by the Phase
   13a-v2 retryStep below (which just marks the step pending and lets
   executeNextPendingStep pick it up), but the legacy version was never
   deleted — only the second declaration was being called. Local TS
   tolerated the duplicate via skipLibCheck quirks, but the Vercel
   Node ESM nodenext runtime rejected the module load with:
       SyntaxError: Identifier 'retryStep' has already been declared
   This blocked Phase 17.5's refresh-from-audit route (which imports
   season-pipeline-runner via routes.ts) from ever loading. Confirmed
   zero callers of the 3-arg signature in api/ or src/ before removal. */

/* ════════════════════════════════════════════════════════════════
   Phase 13a-v2 — Step-by-step execution.

   Replaces the fire-and-forget background pattern that was prone to
   Vercel function freezes. Each step is now its own HTTP request
   with its own 5-min function budget.

   Three functions: createRunOnly, executeNextPendingStep, finalizeRun.
═══════════════════════════════════════════════════════════════ */

/* Create the run row + a pending row for each step. No execution.
   The frontend then drives the chain by calling executeNextPendingStep. */
export async function createRunOnly(opts: {
  projectId: string;
  inputText: string;
  scope: Record<string, any>;
  definition: PipelineDefinition;
}): Promise<{ run_id: string; step_count: number; error?: string }> {
  try {
    const { data: runInsert, error: runErr } = await db().from("season_pipeline_runs").insert({
      project_id:    opts.projectId,
      pipeline_type: opts.definition.type,
      input_text:    opts.inputText.slice(0, 2000),
      goal_summary:  String(opts.scope.goal || '').slice(0, 240),
      scope:         opts.scope,
      status:        'running',
      step_count:    opts.definition.steps.length,
      step_current:  0,
    }).select("id").maybeSingle();

    if (runErr || !runInsert) {
      return { run_id: '', step_count: 0, error: runErr?.message || 'could not create run row' };
    }
    const runId = (runInsert as any).id as string;

    /* Create all step rows up front so the dashboard sees the full pipeline shape immediately */
    const stepRows = opts.definition.steps.map((step, i) => ({
      run_id:     runId,
      step_index: i,
      step_id:    step.id,
      step_label: step.label,
      status:     'pending',
    }));
    const { error: stepsErr } = await db().from("season_pipeline_steps").insert(stepRows);
    if (stepsErr) {
      /* Mark the run failed and bail */
      await db().from("season_pipeline_runs").update({
        status: 'failed',
        honest_summary: `Could not create step rows: ${stepsErr.message}`,
        finished_at: new Date().toISOString(),
      }).eq("id", runId);
      return { run_id: runId, step_count: 0, error: stepsErr.message };
    }

    await logActivity(opts.projectId, runId, 'pipeline_started',
      `Pipeline started: ${opts.definition.type} — "${opts.inputText.slice(0, 80)}${opts.inputText.length > 80 ? '…' : ''}"`,
      `${opts.definition.steps.length} steps planned. Step-by-step execution.`,
    );

    return { run_id: runId, step_count: opts.definition.steps.length };
  } catch (e: any) {
    return { run_id: '', step_count: 0, error: e?.message || 'create failed' };
  }
}

/* Execute the next pending step in this run. Synchronous — returns when
   the step is done. Each call is its own HTTP request, so it has a fresh
   5-min Vercel function budget. */
export async function executeNextPendingStep(opts: {
  runId: string;
  definition: PipelineDefinition;
}): Promise<{
  step_index?: number;
  step_id?: string;
  step_label?: string;
  step_status?: string;
  step_error?: string;
  no_more_steps?: boolean;
  run_status?: string;
  error?: string;
}> {
  try {
    /* Load run + completed steps to rebuild priorOutputs */
    const { data: run } = await db().from("season_pipeline_runs")
      .select("id, project_id, campaign_id, scope, status, llm_calls_used, web_searches_used, steps_completed")
      .eq("id", opts.runId).maybeSingle();
    if (!run)   return { error: "run not found" };
    /* Phase 14.2 — accept 'retrying' (after a retry/skip op) as well as 'running' */
    if ((run as any).status !== 'running' && (run as any).status !== 'retrying') {
      return { no_more_steps: true, run_status: (run as any).status };
    }

    /* If we're entering on 'retrying', flip to 'running' for normal flow */
    if ((run as any).status === 'retrying') {
      await db().from("season_pipeline_runs").update({ status: 'running' }).eq("id", opts.runId);
    }

    const { data: allSteps } = await db().from("season_pipeline_steps")
      .select("id, step_index, step_id, status, output")
      .eq("run_id", opts.runId)
      .order("step_index");

    /* Find next pending step */
    const pending = (allSteps || []).find((s: any) => s.status === 'pending');
    if (!pending) {
      /* No more pending steps — finalize the run */
      await finalizeRun({ runId: opts.runId, definition: opts.definition });
      return { no_more_steps: true, run_status: 'completed' };
    }

    /* Build priorOutputs from completed steps */
    const priorOutputs: Record<string, any> = {};
    for (const s of ((allSteps || []) as any[])) {
      if (s.status === 'completed' && s.step_id && s.output !== null) {
        priorOutputs[s.step_id] = s.output;
      }
    }

    const stepDef = opts.definition.steps[(pending as any).step_index];
    if (!stepDef) {
      return { error: `step ${(pending as any).step_index} not found in definition` };
    }

    /* Cost cap check */
    const cap = opts.definition.llm_call_cap || DEFAULT_LLM_CAP;
    if (((run as any).llm_calls_used || 0) >= cap) {
      await db().from("season_pipeline_steps").update({
        status: 'failed',
        error_message: `LLM cap (${cap}) reached for this pipeline. Manual retry or raise cap to continue.`,
        finished_at: new Date().toISOString(),
      }).eq("id", (pending as any).id);
      await db().from("season_pipeline_runs").update({
        status: 'failed',
        honest_summary: `Stopped at step ${(pending as any).step_index + 1}: hit LLM call cap of ${cap}.`,
        finished_at: new Date().toISOString(),
      }).eq("id", opts.runId);
      return { step_index: (pending as any).step_index, step_status: 'failed', step_error: 'llm cap reached' };
    }

    /* Mark step as running, update run.step_current */
    await db().from("season_pipeline_steps").update({
      status: 'running',
      started_at: new Date().toISOString(),
      input_snapshot: { scope: (run as any).scope || {}, prior_keys: Object.keys(priorOutputs) },
    }).eq("id", (pending as any).id);

    await db().from("season_pipeline_runs").update({
      step_current: (pending as any).step_index + 1,
    }).eq("id", opts.runId);

    /* Execute the step with timeout protection */
    const stepStart = Date.now();
    console.log(`[execute_step] \u25b6 run ${opts.runId.slice(0,8)} step ${(pending as any).step_index + 1}/${opts.definition.steps.length}: ${stepDef.id}`);
    /* Phase 17.0 — load audit findings for this step. One DB query per step
       (this function executes one step per call), so the per-step cost is
       a single read against an indexed column. */
    const auditFindings = await loadLatestAuditFindings((run as any).campaign_id);
    if (auditFindings.length > 0) {
      console.log(`[execute_step] loaded ${auditFindings.length} audit findings for campaign ${((run as any).campaign_id || '').slice(0,8)} — passing to ctx.audit_findings`);
    }
    const result = await runStepWithTimeout(stepDef, {
      projectId: (run as any).project_id,
      scope:     (run as any).scope || {},
      prior:     priorOutputs,
      audit_findings: auditFindings,
    });
    const stepElapsed = Date.now() - stepStart;
    console.log(`[execute_step] ${result.ok ? '\u2713' : '\u2717'} step ${(pending as any).step_index + 1}: ${stepDef.id} done in ${stepElapsed}ms`);

    /* Persist step result */
    if (result.ok) {
      /* Phase 13a-v3: nest artifact body into output for clean rendering */
      const outputWithBody = (result.output && typeof result.output === 'object' && !Array.isArray(result.output))
        ? { ...result.output, _artifact_body: result.artifact?.body || null }
        : { value: result.output, _artifact_body: result.artifact?.body || null };

      /* Phase 14 — add storage_location tail to honest_note so the user knows
         where to find this output AFTER the dashboard closes. */
      const isCampaignLinked = !!(run as any).campaign_id;
      const storageNote = isCampaignLinked
        ? `\n\n_Stored at: season_pipeline_steps (step_id="${stepDef.id}") + linked to Campaign ${(run as any).campaign_id.slice(0,8)}. Re-open this run from the Campaign's content panel, or from PM → SEO Campaigns._`
        : `\n\n_Stored at: season_pipeline_steps (step_id="${stepDef.id}") in run ${opts.runId.slice(0,8)}. Re-open this run from PM → Pipelines history (when that surface ships) or query the DB directly._`;
      const finalHonestNote = (result.honest_note || '') + storageNote;

      await db().from("season_pipeline_steps").update({
        status: 'completed',
        output: outputWithBody,
        output_artifact_kind: result.artifact?.kind || null,
        honest_note: finalHonestNote,
        llm_calls: result.llm_calls || 0,
        web_searches: result.web_searches || 0,
        duration_ms: stepElapsed,
        finished_at: new Date().toISOString(),
      }).eq("id", (pending as any).id);
    } else {
      await db().from("season_pipeline_steps").update({
        status: 'failed',
        error_message: (result.error || 'unknown').slice(0, 500),
        llm_calls: result.llm_calls || 0,
        web_searches: result.web_searches || 0,
        duration_ms: stepElapsed,
        finished_at: new Date().toISOString(),
      }).eq("id", (pending as any).id);
    }

    /* Update aggregates on the run */
    const newLlm  = ((run as any).llm_calls_used    || 0) + (result.llm_calls    || 0);
    const newWeb  = ((run as any).web_searches_used || 0) + (result.web_searches || 0);
    const newDone = ((run as any).steps_completed   || 0) + (result.ok ? 1 : 0);

    await db().from("season_pipeline_runs").update({
      llm_calls_used:     newLlm,
      web_searches_used:  newWeb,
      estimated_cost_usd: Number((newLlm * COST_PER_CALL).toFixed(4)),
      steps_completed:    newDone,
    }).eq("id", opts.runId);

    /* If this step failed and isn't marked continue_on_fail, mark the whole run failed */
    if (!result.ok && !stepDef.continue_on_fail) {
      /* But still let the frontend know about it; the FE may try to finalize later */
      await db().from("season_pipeline_runs").update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        honest_summary: `Stopped at step ${(pending as any).step_index + 1} ("${stepDef.label}"): ${result.error || 'failed'}.`,
      }).eq("id", opts.runId);
      return {
        step_index: (pending as any).step_index,
        step_id: stepDef.id,
        step_label: stepDef.label,
        step_status: 'failed',
        step_error: result.error,
        run_status: 'failed',
      };
    }

    /* Step succeeded (or failed but continue_on_fail). Check if there are more pending. */
    const { data: remainingPending } = await db().from("season_pipeline_steps")
      .select("id")
      .eq("run_id", opts.runId)
      .eq("status", 'pending')
      .limit(1);

    if (!remainingPending || remainingPending.length === 0) {
      /* This was the last step — finalize */
      await finalizeRun({ runId: opts.runId, definition: opts.definition });
      return {
        step_index: (pending as any).step_index,
        step_id: stepDef.id,
        step_label: stepDef.label,
        step_status: result.ok ? 'completed' : 'failed',
        run_status: 'completed',
      };
    }

    /* More steps pending — return the result of this step */
    return {
      step_index: (pending as any).step_index,
      step_id: stepDef.id,
      step_label: stepDef.label,
      step_status: result.ok ? 'completed' : 'failed',
      step_error: result.ok ? undefined : result.error,
      run_status: 'running',
    };
  } catch (e: any) {
    return { error: e?.message || 'execute step failed' };
  }
}

/* Finalize a run — aggregate artifacts, write summaries, mark completed. */
export async function finalizeRun(opts: {
  runId: string;
  definition: PipelineDefinition;
  /* Phase 17.5.8 — bypass the "already terminal" early-return.
     Used by the repair route to reconcile drifted run state on runs
     that completed during the Phase 17.5.5-17.5.6 window where the
     dashboard + panel both drove execution and produced inconsistent
     counters. Default false (preserves the safety guard for normal
     execution paths). */
  force?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    /* Load run + all step rows */
    const { data: run } = await db().from("season_pipeline_runs")
      .select("*").eq("id", opts.runId).maybeSingle();
    if (!run) return { success: false, error: 'run not found' };

    /* Already finalized? Skip unless force=true. */
    if (['completed', 'failed', 'cancelled'].includes((run as any).status) && !opts.force) {
      return { success: true };
    }

    const { data: steps } = await db().from("season_pipeline_steps")
      .select("step_index, step_id, step_label, status, output, output_artifact_kind, honest_note, error_message, duration_ms")
      .eq("run_id", opts.runId)
      .order("step_index");

    const stepRows = (steps || []) as any[];

    /* Aggregate artifacts (from each completed step's output if it contains an artifact body) */
    const artifacts: Array<{ kind: string; title: string; body: string; step_id: string }> = [];
    const honestNotes: string[] = [];
    let stepsCompleted = 0;
    let stepsFailed    = 0;

    for (const s of stepRows) {
      if (s.status === 'completed') {
        stepsCompleted++;
        if (s.honest_note) honestNotes.push(`(${s.step_label}) ${s.honest_note}`);
        const out = s.output;
        if (out && typeof out === 'object' && s.output_artifact_kind) {
          /* Phase 13a-v3: prefer the rendered markdown body if the runner stashed
             it into _artifact_body. Falls back to body/content/text/JSON if not. */
          const body = (typeof out._artifact_body === 'string' && out._artifact_body.length > 0)
            ? out._artifact_body
            : (typeof out === 'string' ? out
              : (out.body || out.content || out.text || JSON.stringify({ ...out, _artifact_body: undefined }, null, 2)));
          artifacts.push({
            kind: s.output_artifact_kind,
            title: s.step_label,
            body: String(body),
            step_id: s.step_id,
          });
        }
      } else if (s.status === 'failed') {
        stepsFailed++;
        if (s.error_message) honestNotes.push(`Step "${s.step_label}" failed: ${s.error_message}`);
      }
    }

    const finalStatus: 'completed' | 'failed' | 'partial' =
      stepsFailed === 0 ? 'completed' :
      stepsCompleted > 0 ? 'partial' : 'failed';
    const persistedStatus = finalStatus === 'partial' ? 'completed' : finalStatus;

    /* Phase 17.5.7 — compute elapsed from step duration_ms sums, not wall-clock
       since run.started_at. The original computation gave wrong results after
       retryFromStep / refresh-from-audit because started_at is the ORIGINAL run
       launch timestamp, not when the latest refresh began — so a run refreshed
       3 days later would report elapsed = 268,853s. Summing per-step durations
       gives the true work time regardless of retry history. */
    const elapsedMs = stepRows.reduce((sum, s) => sum + (s.duration_ms || 0), 0);

    const honestSummary = buildHonestSummary({
      stepsCompleted, stepsFailed,
      stepCount: opts.definition.steps.length,
      notes: honestNotes,
      elapsedMs,
    });
    const clientFacingSummary = buildClientFacingSummary({
      pipelineType: opts.definition.type,
      artifacts,
      stepsCompleted,
    });

    await db().from("season_pipeline_runs").update({
      status:                persistedStatus,
      steps_completed:       stepsCompleted,
      steps_failed:          stepsFailed,
      final_artifacts:       artifacts,
      honest_summary:        honestSummary,
      client_facing_summary: clientFacingSummary,
      finished_at:           new Date().toISOString(),
    }).eq("id", opts.runId);

    await logActivity((run as any).project_id, opts.runId,
      finalStatus === 'completed' ? 'pipeline_completed' : 'pipeline_partial',
      `Pipeline ${finalStatus}: ${opts.definition.type} (${stepsCompleted}/${opts.definition.steps.length} steps)`,
      honestSummary.slice(0, 500),
    );

    /* Phase D1 (2026-05-25) — promote artifacts to first-class rows.
       Dual-write each artifact into the `artifacts` table alongside the
       legacy final_artifacts JSON column. The JSON stays for backward
       compat; the artifacts table is the source of truth for portfolio
       queries (Documents page, search, filter by keyword/campaign/etc).

       Best-effort: failure does NOT block run finalization. Logs to
       console for visibility. Idempotent — re-finalize (refresh-from-
       audit, reconcile) is a no-op for already-stored artifacts.

       Supersession: persistPipelineRunArtifacts calls the supersession
       variant, so a refresh-from-audit producing a new content_brief
       automatically marks the previous brief for the same panel as
       status='superseded'. */
    try {
      const { persistPipelineRunArtifacts } = await import("./artifacts.js");
      await persistPipelineRunArtifacts({
        runId:          opts.runId,
        projectId:      (run as any).project_id,
        campaignId:     (run as any).campaign_id,
        panelId:        (run as any).panel_id,
        keyword:        (run as any).scope?.keyword || null,
        targetUrl:      (run as any).scope?.target_url || null,
        pipelineType:   opts.definition.type,
        artifacts,
        totalLlmCalls:  (run as any).llm_calls_used || 0,
        totalCostUsd:   (run as any).estimated_cost_usd || 0,
        finishedAt:     (run as any).finished_at || new Date().toISOString(),
      });
    } catch (e: any) {
      console.log(`[finalizeRun] artifacts persist failed: ${e?.message || 'unknown'} — not blocking`);
    }

    /* Phase 14 — if this run is linked to a campaign, write the artifact report
       to the content panel and refresh the living overview. Best-effort. */
    if ((run as any).campaign_id) {
      try {
        const { writeReportToPanel, generateLivingOverview } = await import("./seo-campaign-engine.js");

        /* Phase 14.0.2 — write EACH completed step's artifact as its own report.
           Maps each step to the right pillar AND uses a specific report_kind
           so the document is searchable/filterable later. */
        const keyword = (run as any).scope?.keyword || '';
        const stepToPillarKind: Record<string, { pillar: string; kind: any; updatePanelStatus?: boolean }> = {
          keyword_research:    { pillar: 'research',    kind: 'keyword_research' },
          gsc_context:         { pillar: 'research',    kind: 'gsc_baseline' },
          competitor_snapshot: { pillar: 'research',    kind: 'competitor_intel' },
          strategy_plan:       { pillar: 'research',    kind: 'strategy' },
          forecast:            { pillar: 'monitoring',  kind: 'forecast_emission', updatePanelStatus: true },
          content_brief:       { pillar: 'content',     kind: 'content_brief', updatePanelStatus: true },
          client_update:       { pillar: 'content',     kind: 'client_update' },
          internal_handover:   { pillar: 'content',     kind: 'handover' },
        };

        for (const stepRow of stepRows as any[]) {
          if (stepRow.status !== 'completed') continue;
          const mapping = stepToPillarKind[stepRow.step_id];
          if (!mapping) continue;
          const out = stepRow.output || {};
          const body = (typeof out._artifact_body === 'string' && out._artifact_body.length > 0)
            ? out._artifact_body
            : (typeof out === 'string' ? out
              : (out.body || out.content || out.text
                  || JSON.stringify({ ...out, _artifact_body: undefined }, null, 2)));

          /* Extract tags from the step output for searchability */
          const tags = extractTagsFromStepOutput(stepRow.step_id, out, keyword);

          await writeReportToPanel({
            campaignId:        (run as any).campaign_id,
            projectId:         (run as any).project_id,
            pillar:             mapping.pillar,
            reportKind:         mapping.kind,
            generatedBy:        'pipeline',
            pipelineRunId:      opts.runId,
            llmCallsUsed:       stepRow.llm_calls || 0,
            webSearchesUsed:    stepRow.web_searches || 0,
            dataSources:        deriveDataSourcesFromStep(stepRow.step_id, out),
            confidenceRating:   stepRow.step_id === 'content_brief' && stepsFailed === 0 ? 'high'
                                : stepRow.step_id === 'keyword_research' && (out.confidence || 0) > 0.7 ? 'high'
                                : 'medium',
            confidenceReason:   stepRow.honest_note?.replace(/\n\n_Stored at:[\s\S]+$/, '') || undefined,
            title:              `${prettifyStepLabel(stepRow.step_label)}`,
            bodyMd:             String(body),
            summary:            stepRow.honest_note?.replace(/\n\n_Stored at:[\s\S]+$/, '').slice(0, 500) || undefined,
            tags,
            updatePanelStatus:  mapping.updatePanelStatus || false,
            newPanelStatus:     stepsFailed === 0 ? 'green' : 'amber',
          });
        }

        /* Refresh living overview now that all reports are in */
        await generateLivingOverview({ campaignId: (run as any).campaign_id });

        /* Phase 14 — scan step outputs for opportunities */
        await scanForOpportunities({
          projectId:     (run as any).project_id,
          campaignId:    (run as any).campaign_id,
          panelId:       (run as any).panel_id || undefined,
          runId:         opts.runId,
          keyword,
          stepOutputs:   stepRows.reduce((acc: any, s: any) => { if (s.status === 'completed') acc[s.step_id] = s.output; return acc; }, {}),
        });
      } catch (e: any) {
        console.log(`[finalizeRun] campaign report write failed: ${e?.message}`);
      }
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'finalize failed' };
  }
}

/* ─── helpers ─── */
function prettifyStepLabel(s: string): string {
  /* Step labels like "Generate the full content brief" are already nice — keep them. */
  return s;
}

function deriveDataSourcesFromStep(stepId: string, out: any): string[] {
  const arr: string[] = [];
  if (stepId === 'keyword_research')    arr.push('llm', 'web_search');
  if (stepId === 'gsc_context')         arr.push('gsc');
  if (stepId === 'competitor_snapshot') arr.push('llm', 'web_search');
  if (stepId === 'strategy_plan')       arr.push('llm');
  if (stepId === 'forecast')            arr.push('llm', 'gsc');
  if (stepId === 'content_brief')       arr.push('llm', 'web_search', 'gsc');
  if (stepId === 'client_update')       arr.push('llm');
  if (stepId === 'internal_handover')   arr.push('template');
  return arr;
}

function extractTagsFromStepOutput(stepId: string, out: any, keyword: string): string[] {
  const tags: Set<string> = new Set();
  if (keyword) tags.add(keyword.toLowerCase());
  tags.add(stepId);

  if (stepId === 'keyword_research') {
    if (out.primary_intent) tags.add(`intent:${out.primary_intent}`);
    if (out.competitive_difficulty) tags.add(`difficulty:${out.competitive_difficulty}`);
    if (Array.isArray(out.related_queries)) {
      for (const q of out.related_queries.slice(0, 5)) {
        if (typeof q === 'string') tags.add(q.toLowerCase());
      }
    }
  }
  if (stepId === 'competitor_snapshot') {
    if (Array.isArray(out.top_pages)) {
      for (const p of out.top_pages.slice(0, 5)) {
        if (p?.domain) tags.add(`domain:${p.domain.toLowerCase()}`);
      }
    }
  }
  if (stepId === 'content_brief') {
    if (out.primary_keyword) tags.add(out.primary_keyword.toLowerCase());
    if (Array.isArray(out.secondary_keywords)) {
      for (const k of out.secondary_keywords.slice(0, 5)) {
        if (typeof k === 'string') tags.add(k.toLowerCase());
      }
    }
  }
  if (stepId === 'strategy_plan') {
    if (out.strategy_name) tags.add(`strategy:${out.strategy_name.toLowerCase().slice(0, 40)}`);
  }
  return Array.from(tags).slice(0, 25);
}

/* ════════════════════════════════════════════════════════════════
   Opportunity scanner — Phase 14
   Reads completed step outputs and emits opportunities for things
   S.E.A.S.O.N. noticed off-scope. Pure data-driven heuristics, no LLM.
═══════════════════════════════════════════════════════════════ */
async function scanForOpportunities(opts: {
  projectId:    string;
  campaignId?:  string;
  panelId?:     string;
  runId:        string;
  keyword:      string;
  stepOutputs:  Record<string, any>;
}): Promise<void> {
  try {
    const { recordOpportunity } = await import("./seo-campaign-engine.js");
    const research    = opts.stepOutputs.keyword_research || {};
    const gsc         = opts.stepOutputs.gsc_context       || {};
    const competitors = opts.stepOutputs.competitor_snapshot || {};
    const strategy    = opts.stepOutputs.strategy_plan     || {};

    /* Trigger 1: related queries that look easier to rank for than the target.
       Heuristic: research.related_queries contains entries; if any look like
       lower-difficulty or more specific long-tail variants, flag. */
    if (Array.isArray(research.related_queries) && research.related_queries.length > 0) {
      const longTail = research.related_queries.filter((q: string) =>
        typeof q === 'string' && q.split(' ').length >= 4 && !q.toLowerCase().includes(opts.keyword.toLowerCase().slice(0, 12)),
      ).slice(0, 3);
      for (const q of longTail) {
        await recordOpportunity({
          projectId:        opts.projectId,
          sourcePipelineRunId: opts.runId,
          sourceCampaignId: opts.campaignId,
          sourcePanelId:    opts.panelId,
          sourceStepId:     'keyword_research',
          sourceKind:       'pipeline_step',
          kind:             'keyword',
          title:            `Consider also targeting "${q}"`,
          description:      `This long-tail variant surfaced during keyword research for "${opts.keyword}". Long-tail queries with 4+ words typically have lower difficulty and clearer intent — worth a separate campaign if traffic data confirms volume.`,
          evidence:         { source_keyword: opts.keyword, related_query: q, surfaced_at: new Date().toISOString() },
          estimatedValue:   'medium',
          estimatedEffort:  'medium',
          suggestedAction:  'new_campaign',
          suggestedCampaignKind: 'rank_for_keyword',
          suggestedKeyword: q,
        });
      }
    }

    /* Trigger 2: neighboring queries in GSC at page-2 positions (4-20)
       with meaningful impressions — quick wins. */
    if (Array.isArray(gsc.neighboring_queries)) {
      const quickWins = (gsc.neighboring_queries as any[]).filter(nq =>
        nq && typeof nq.position === 'number' && nq.position >= 4 && nq.position <= 20
        && (nq.impressions || 0) >= 50,
      ).slice(0, 3);
      for (const qw of quickWins) {
        await recordOpportunity({
          projectId:        opts.projectId,
          sourcePipelineRunId: opts.runId,
          sourceCampaignId: opts.campaignId,
          sourcePanelId:    opts.panelId,
          sourceStepId:     'gsc_context',
          sourceKind:       'pipeline_step',
          kind:             'quick_win',
          title:            `Quick-win opportunity: "${qw.query}" is at position ${Number(qw.position).toFixed(1)}`,
          description:      `Already ranking on page 2 with ${qw.impressions || 0} impressions/month. Minor on-page improvements or internal links could push to page 1 fast.`,
          evidence:         { query: qw.query, current_position: qw.position, impressions: qw.impressions, clicks: qw.clicks, ctr: qw.ctr },
          estimatedValue:   'high',
          estimatedEffort:  'low',
          suggestedAction:  'new_campaign',
          suggestedCampaignKind: 'rank_for_keyword',
          suggestedKeyword: qw.query,
        });
      }
    }

    /* Trigger 3: a competitor domain dominates the SERP (appears in top 3 of top_pages multiple times). */
    if (Array.isArray(competitors.top_pages) && competitors.top_pages.length >= 3) {
      const domainCounts: Record<string, number> = {};
      for (const p of competitors.top_pages as any[]) {
        if (p?.domain) domainCounts[p.domain] = (domainCounts[p.domain] || 0) + 1;
      }
      const dominators = Object.entries(domainCounts).filter(([, n]) => n >= 2).map(([d]) => d);
      for (const dom of dominators.slice(0, 2)) {
        await recordOpportunity({
          projectId:        opts.projectId,
          sourcePipelineRunId: opts.runId,
          sourceCampaignId: opts.campaignId,
          sourcePanelId:    opts.panelId,
          sourceStepId:     'competitor_snapshot',
          sourceKind:       'pipeline_step',
          kind:             'competitor_move',
          title:            `Competitor "${dom}" dominates this SERP (${domainCounts[dom]} pages in top 5)`,
          description:      `When the same domain holds multiple top positions, ranking against them requires more than content quality — it requires authority and depth at the topic-cluster level. A deeper competitor intel deep-dive is worth running.`,
          evidence:         { dominant_domain: dom, top_page_count: domainCounts[dom], all_domains: domainCounts },
          estimatedValue:   'medium',
          estimatedEffort:  'medium',
          suggestedAction:  'investigate',
        });
      }
    }

    /* Trigger 4: strategy plan mentions backlink/internal-link/technical-fix as critical.
       String-search the strategy approach text. */
    const strategyText = JSON.stringify(strategy).toLowerCase();
    if (/backlink|link build|off.page|outreach/.test(strategyText)) {
      await recordOpportunity({
        projectId:        opts.projectId,
        sourcePipelineRunId: opts.runId,
        sourceCampaignId: opts.campaignId,
        sourcePanelId:    opts.panelId,
        sourceStepId:     'strategy_plan',
        sourceKind:       'pipeline_step',
        kind:             'backlink',
        title:            `Strategy requires off-page work — needs the Off-Page pillar`,
        description:      `The strategy for "${opts.keyword}" mentions backlinks or outreach. This depends on the Off-Page Strategy pillar, which activates in a future release. Note this dependency now so it isn't forgotten when the pillar ships.`,
        evidence:         { strategy_excerpt: String(strategy.approach || '').slice(0, 500) },
        estimatedValue:   'high',
        estimatedEffort:  'high',
        suggestedAction:  'investigate',
      });
    }

    if (/internal link|internal-link|site structure|hub.spoke/.test(strategyText)) {
      await recordOpportunity({
        projectId:        opts.projectId,
        sourcePipelineRunId: opts.runId,
        sourceCampaignId: opts.campaignId,
        sourcePanelId:    opts.panelId,
        sourceStepId:     'strategy_plan',
        sourceKind:       'pipeline_step',
        kind:             'content_gap',
        title:            `Strategy requires internal linking work — needs the Internal Linking pillar`,
        description:      `Strategy mentions internal linking or site structure. The Internal Linking pillar will surface specific page-to-page link plans when it activates.`,
        evidence:         { strategy_excerpt: String(strategy.approach || '').slice(0, 500) },
        estimatedValue:   'medium',
        estimatedEffort:  'low',
        suggestedAction:  'investigate',
      });
    }
  } catch (e: any) {
    console.log(`[scanForOpportunities] failed: ${e?.message}`);
  }
}

/* ════════════════════════════════════════════════════════════════
   Phase 14.2 — Resilience operations
   
   Three operations exposed to the API layer:
     - retryStep:        re-run a single failed step in place
     - retryFromStep:    reset step N + all downstream back to pending
     - skipStep:         mark a failed step as skipped, let pipeline continue

   All three set the run back to 'retrying' so the standard
   executeNextPendingStep loop picks up where it left off.
═══════════════════════════════════════════════════════════════ */

const MAX_RETRY_HARD_CEILING = 3;

export async function retryStep(opts: {
  runId: string;
  stepIndex: number;
}): Promise<{ success: boolean; new_retry_count?: number; error?: string }> {
  try {
    /* Load the step + run to validate operation is allowed */
    const { data: step } = await db().from("season_pipeline_steps")
      .select("id, status, retry_count, max_retries, step_id, step_label")
      .eq("run_id", opts.runId).eq("step_index", opts.stepIndex).maybeSingle();
    if (!step) return { success: false, error: 'step not found' };
    const s = step as any;

    if (s.status !== 'failed' && s.status !== 'skipped') {
      return { success: false, error: `cannot retry a step in '${s.status}' state — only 'failed' or 'skipped' can be retried` };
    }

    const ceiling = Math.min(s.max_retries || MAX_RETRY_HARD_CEILING, MAX_RETRY_HARD_CEILING);
    if ((s.retry_count || 0) >= ceiling) {
      return { success: false, error: `retry limit (${ceiling}) reached for step "${s.step_label}". This step has failed repeatedly — investigate the underlying cause or skip it.` };
    }

    /* Reset the step to pending, increment retry counter */
    const newCount = (s.retry_count || 0) + 1;
    await db().from("season_pipeline_steps").update({
      status:         'pending',
      retry_count:    newCount,
      error_message:  null,
      started_at:     null,
      finished_at:    null,
      duration_ms:    null,
      output:         null,
      honest_note:    null,
      output_artifact_kind: null,
      llm_calls:      0,
      web_searches:   0,
      skipped_reason: null,
      skipped_at:     null,
      skipped_by:     null,
    }).eq("id", s.id);

    /* Set run back to retrying so executeNextPendingStep picks it up */
    await db().from("season_pipeline_runs").update({
      status:         'retrying',
      finished_at:    null,
      honest_summary: `Step ${opts.stepIndex + 1} "${s.step_label}" being retried (attempt ${newCount}/${ceiling}).`,
    }).eq("id", opts.runId);

    /* Phase 17.5.5 — same recompute as retryFromStep. A single-step retry
       changes one row from failed/skipped → pending; counters need to
       reflect that or steps_failed accumulates across retries. */
    const { data: allSteps } = await db().from("season_pipeline_steps")
      .select("status, llm_calls, web_searches")
      .eq("run_id", opts.runId);
    if (allSteps && (allSteps as any[]).length > 0) {
      const rows = allSteps as any[];
      const recomputedDone   = rows.filter(s => s.status === 'completed').length;
      const recomputedFailed = rows.filter(s => s.status === 'failed').length;
      const recomputedLlm    = rows.reduce((sum, s) => sum + (s.llm_calls    || 0), 0);
      const recomputedWeb    = rows.reduce((sum, s) => sum + (s.web_searches || 0), 0);
      await db().from("season_pipeline_runs").update({
        steps_completed:    recomputedDone,
        steps_failed:       recomputedFailed,
        llm_calls_used:     recomputedLlm,
        web_searches_used:  recomputedWeb,
        estimated_cost_usd: Number((recomputedLlm * COST_PER_CALL).toFixed(4)),
      }).eq("id", opts.runId);
    }

    /* Log */
    const { data: run } = await db().from("season_pipeline_runs").select("project_id").eq("id", opts.runId).maybeSingle();
    if (run) {
      await logActivity((run as any).project_id, opts.runId, 'pipeline_step_retry',
        `Retrying step ${opts.stepIndex + 1}: "${s.step_label}"`,
        `Attempt ${newCount} of ${ceiling}`);
    }

    return { success: true, new_retry_count: newCount };
  } catch (e: any) {
    return { success: false, error: e?.message || 'retry failed' };
  }
}

export async function retryFromStep(opts: {
  runId: string;
  stepIndex: number;
}): Promise<{ success: boolean; steps_reset?: number; error?: string }> {
  try {
    /* Load all steps from stepIndex onward */
    const { data: steps } = await db().from("season_pipeline_steps")
      .select("id, status, retry_count, max_retries, step_index, step_label, step_id")
      .eq("run_id", opts.runId)
      .gte("step_index", opts.stepIndex)
      .order("step_index");
    if (!steps || (steps as any[]).length === 0) {
      return { success: false, error: 'no steps found at or after that index' };
    }

    /* Validate the starting step's retry limit */
    const startStep = (steps as any[])[0];
    const ceiling = Math.min(startStep.max_retries || MAX_RETRY_HARD_CEILING, MAX_RETRY_HARD_CEILING);
    if ((startStep.retry_count || 0) >= ceiling) {
      return { success: false, error: `retry limit (${ceiling}) reached for step "${startStep.step_label}". Investigate root cause or skip and resume from next step.` };
    }

    /* Reset every step in range to pending. Only increment retry_count on the
       first one (the actual retry); downstream steps just get reset to pending
       since they weren't the failure point. */
    let resetCount = 0;
    for (const s of steps as any[]) {
      const isFirst = s.step_index === opts.stepIndex;
      const update: any = {
        status:         'pending',
        error_message:  null,
        started_at:     null,
        finished_at:    null,
        duration_ms:    null,
        output:         null,
        honest_note:    null,
        output_artifact_kind: null,
        llm_calls:      0,
        web_searches:   0,
        skipped_reason: null,
        skipped_at:     null,
        skipped_by:     null,
      };
      if (isFirst) update.retry_count = (s.retry_count || 0) + 1;
      await db().from("season_pipeline_steps").update(update).eq("id", s.id);
      resetCount++;
    }

    /* Run goes back to retrying */
    await db().from("season_pipeline_runs").update({
      status:         'retrying',
      finished_at:    null,
      honest_summary: `Resuming from step ${opts.stepIndex + 1}. ${resetCount} step${resetCount === 1 ? '' : 's'} reset to pending.`,
    }).eq("id", opts.runId);

    /* Phase 17.5.5 — recompute run-level counters from actual step rows.
       Without this, retryFromStep silently corrupts the run state:
       executeNextPendingStep increments steps_completed by 1 per success,
       but never DECREMENTS when a previously-completed step is reset to
       pending. So a refresh of 5 of 8 steps that already completed
       produces counters like 13/8 completed + N/8 failed — visibly wrong
       in the panel and confusing for the runner's terminal-state logic. */
    const { data: allSteps } = await db().from("season_pipeline_steps")
      .select("status, llm_calls, web_searches")
      .eq("run_id", opts.runId);
    if (allSteps && (allSteps as any[]).length > 0) {
      const rows = allSteps as any[];
      const recomputedDone   = rows.filter(s => s.status === 'completed').length;
      const recomputedFailed = rows.filter(s => s.status === 'failed').length;
      const recomputedLlm    = rows.reduce((sum, s) => sum + (s.llm_calls    || 0), 0);
      const recomputedWeb    = rows.reduce((sum, s) => sum + (s.web_searches || 0), 0);
      await db().from("season_pipeline_runs").update({
        steps_completed:    recomputedDone,
        steps_failed:       recomputedFailed,
        llm_calls_used:     recomputedLlm,
        web_searches_used:  recomputedWeb,
        estimated_cost_usd: Number((recomputedLlm * COST_PER_CALL).toFixed(4)),
      }).eq("id", opts.runId);
    }

    const { data: run } = await db().from("season_pipeline_runs").select("project_id").eq("id", opts.runId).maybeSingle();
    if (run) {
      await logActivity((run as any).project_id, opts.runId, 'pipeline_resume_from_step',
        `Resume from step ${opts.stepIndex + 1}`,
        `${resetCount} steps reset to pending. First step retry count: ${(startStep.retry_count || 0) + 1}/${ceiling}.`);
    }

    return { success: true, steps_reset: resetCount };
  } catch (e: any) {
    return { success: false, error: e?.message || 'retry-from failed' };
  }
}

export async function skipStep(opts: {
  runId: string;
  stepIndex: number;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: step } = await db().from("season_pipeline_steps")
      .select("id, status, step_label, step_id")
      .eq("run_id", opts.runId).eq("step_index", opts.stepIndex).maybeSingle();
    if (!step) return { success: false, error: 'step not found' };
    const s = step as any;

    if (s.status !== 'failed' && s.status !== 'pending') {
      return { success: false, error: `cannot skip a step in '${s.status}' state — only 'failed' or 'pending' can be skipped` };
    }

    await db().from("season_pipeline_steps").update({
      status:         'skipped',
      skipped_reason: (opts.reason || 'manually skipped from dashboard').slice(0, 500),
      skipped_at:     new Date().toISOString(),
      skipped_by:     'user',
      finished_at:    new Date().toISOString(),
      honest_note:    `Step was skipped${opts.reason ? `: ${opts.reason}` : ''}. Downstream steps may produce less complete output without this data.`,
    }).eq("id", s.id);

    /* Set run back to retrying so executeNextPendingStep can pick up the next pending step */
    const { data: anyPending } = await db().from("season_pipeline_steps")
      .select("id").eq("run_id", opts.runId).eq("status", 'pending').limit(1).maybeSingle();
    if (anyPending) {
      await db().from("season_pipeline_runs").update({
        status:         'retrying',
        finished_at:    null,
        honest_summary: `Step ${opts.stepIndex + 1} "${s.step_label}" skipped. Continuing with remaining steps.`,
      }).eq("id", opts.runId);
    }

    const { data: run } = await db().from("season_pipeline_runs").select("project_id").eq("id", opts.runId).maybeSingle();
    if (run) {
      await logActivity((run as any).project_id, opts.runId, 'pipeline_step_skipped',
        `Skipped step ${opts.stepIndex + 1}: "${s.step_label}"`,
        opts.reason);
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'skip failed' };
  }
}
