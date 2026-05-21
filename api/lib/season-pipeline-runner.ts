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
    let result: PipelineStepResult;
    try {
      result = await step.handler({
        projectId: opts.projectId,
        awareness: opts.awareness,
        scope: opts.scope,
        prior: priorOutputs,
      });
    } catch (e: any) {
      result = { ok: false, error: e?.message || 'step threw unexpectedly' };
    }
    const stepElapsed = Date.now() - stepStart;

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

  const result = await step.handler({
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
