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
const STEP_TIMEOUT_MS = 120_000;   // 2 min per step. Phase 13a recovery mechanism.

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
        await db().from("season_pipeline_steps").update({
          status: 'completed',
          output: result.output,
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
        await db().from("season_pipeline_steps").update({
          status: 'completed',
          output: result.output,
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

export async function retryStep(opts: {
  runId:   string;
  stepIndex: number;
  definition: PipelineDefinition;
}): Promise<PipelineStepResult> {
  /* Load the run + project + scope + prior outputs */
  const { data: run } = await db().from("season_pipeline_runs")
    .select("*").eq("id", opts.runId).maybeSingle();
  if (!run) return { ok: false, error: "run not found" };
  const r = run as any;

  const { data: priorSteps } = await db().from("season_pipeline_steps")
    .select("step_id, output").eq("run_id", opts.runId)
    .lt("step_index", opts.stepIndex)
    .eq("status", "completed")
    .order("step_index");
  const priorOutputs: Record<string, any> = {};
  for (const s of (priorSteps || []) as any[]) {
    if (s.step_id) priorOutputs[s.step_id] = s.output;
  }

  const step = opts.definition.steps[opts.stepIndex];
  if (!step) return { ok: false, error: "step not in definition" };

  const result = await runStepWithTimeout(step, {
    projectId: r.project_id,
    scope:     r.scope || {},
    prior:     priorOutputs,
  });

  /* Persist the retry */
  await db().from("season_pipeline_steps").upsert({
    run_id: opts.runId,
    step_index: opts.stepIndex,
    step_id: step.id,
    step_label: step.label,
    status: result.ok ? 'completed' : 'failed',
    output: result.output || null,
    honest_note: result.honest_note || null,
    error_message: result.error || null,
    llm_calls: result.llm_calls || 0,
    web_searches: result.web_searches || 0,
    finished_at: new Date().toISOString(),
  }, { onConflict: 'run_id,step_index' });

  return result;
}

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
      .select("id, project_id, scope, status, llm_calls_used, web_searches_used, steps_completed")
      .eq("id", opts.runId).maybeSingle();
    if (!run)   return { error: "run not found" };
    if ((run as any).status !== 'running') {
      return { no_more_steps: true, run_status: (run as any).status };
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
    const result = await runStepWithTimeout(stepDef, {
      projectId: (run as any).project_id,
      scope:     (run as any).scope || {},
      prior:     priorOutputs,
    });
    const stepElapsed = Date.now() - stepStart;
    console.log(`[execute_step] ${result.ok ? '\u2713' : '\u2717'} step ${(pending as any).step_index + 1}: ${stepDef.id} done in ${stepElapsed}ms`);

    /* Persist step result */
    if (result.ok) {
      await db().from("season_pipeline_steps").update({
        status: 'completed',
        output: result.output,
        output_artifact_kind: result.artifact?.kind || null,
        honest_note: result.honest_note || null,
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
}): Promise<{ success: boolean; error?: string }> {
  try {
    /* Load run + all step rows */
    const { data: run } = await db().from("season_pipeline_runs")
      .select("*").eq("id", opts.runId).maybeSingle();
    if (!run) return { success: false, error: 'run not found' };

    /* Already finalized? */
    if (['completed', 'failed', 'cancelled'].includes((run as any).status)) {
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
        /* Look in output for an artifact — the rank-pipeline writes the body string into a known field */
        const out = s.output;
        if (out && typeof out === 'object') {
          /* The pipeline saves whole step output as JSON; we don't have a separate artifact body here.
             Use the artifact_kind field as a hint that the step produced something. */
          if (s.output_artifact_kind) {
            const body = typeof out === 'string' ? out :
                         (out.body || out.content || out.text || JSON.stringify(out, null, 2));
            artifacts.push({
              kind: s.output_artifact_kind,
              title: s.step_label,
              body: String(body),
              step_id: s.step_id,
            });
          }
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

    const elapsedMs = (run as any).started_at
      ? Date.now() - new Date((run as any).started_at).getTime()
      : 0;

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

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'finalize failed' };
  }
}
