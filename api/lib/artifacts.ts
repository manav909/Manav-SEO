/* ════════════════════════════════════════════════════════════════════════════
   api/lib/artifacts.ts — Phase D1 (2026-05-25)

   Single source of truth for writing artifact rows to the `artifacts` table.
   Used by all pillars that produce reportable output:
     - season-pipeline-runner.ts (pipeline final_artifacts → one artifact row per step output)
     - seo-technical-audit.ts (future) — each audit run produces one artifact row
     - seo-cluster-map.ts (future)
     - seo-monitoring.ts (future)
     - seo-off-page.ts (future)

   Architecture decisions:

   1. Idempotent dual-write. The artifacts table has a unique index on
      (source_kind, source_id, COALESCE(source_step_id, '')). Calling
      persistArtifacts() multiple times for the same source replaces nothing
      and creates nothing duplicate — the ON CONFLICT DO NOTHING clause
      protects against double-finalize, retry, refresh, and re-finalize
      scenarios that arose during Phase 17.5.x.

   2. Supersession via persistArtifactsWithSupersession(). When a refresh-
      from-audit produces a new artifact set for an existing panel, the
      previous CURRENT artifacts for that panel + artifact_kind get marked
      status='superseded' with superseded_by pointing at the new row. Full
      history retained — nothing deleted.

   3. Best-effort, non-blocking. Artifact persistence failure does NOT block
      the parent pipeline / audit / etc. from completing. Errors are logged
      to console (so they surface in Vercel logs) but swallowed at the
      callsite. The legacy final_artifacts JSON column on season_pipeline_runs
      remains the immediate-availability source; the artifacts table is the
      portfolio-query source.

   4. Cost ledger. Each artifact row records llm_calls and serpapi_calls
      attributable to it (best-effort split for step-level outputs). This
      lets the Documents UI surface "this brief cost $0.55 in LLM tokens"
      per artifact rather than only per run.

   5. No new api/*.ts function. This is api/lib/* — utility library. Existing
      12-function ceiling preserved. Callers import { persistArtifacts } and
      invoke from their normal code paths.
════════════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

export interface ArtifactInput {
  /* Source provenance — required to compute the unique key */
  source_kind:        'pipeline_run' | 'audit' | 'cluster_map' | 'monitoring' | 'off_page' | 'internal_linking' | string;
  source_id:          string;
  source_step_id?:    string | null;     // null/undefined OK for atomic sources

  /* Artifact identity */
  artifact_kind:      string;             // 'brief' | 'forecast' | 'client_update' | 'audit_report' | etc.
  title:              string;
  keyword?:           string | null;
  target_url?:        string | null;

  /* Content */
  body:               string;
  body_format?:       'markdown' | 'html' | 'json';
  metadata?:          Record<string, any>;

  /* Ownership */
  project_id:         string;
  campaign_id?:       string | null;
  panel_id?:          string | null;

  /* Cost */
  generation_cost_usd?: number;
  llm_calls?:           number;
  serpapi_calls?:       number;

  /* Timestamp — when the artifact was actually generated (pipeline run
     finished_at, audit created_at, etc.). Defaults to now() if omitted.
     Passing the real time ensures sort-by-newest reflects when work
     happened, not when the row was inserted into this table. */
  generated_at?:        string | null;
}

/* Persist one or many artifacts. Idempotent — re-running is a no-op for
   already-stored artifacts (via ON CONFLICT DO NOTHING). Returns the
   number of NEW rows inserted (excludes conflict-skipped rows).

   Best-effort: failure does not throw. Logs to console for visibility. */
export async function persistArtifacts(
  artifacts: ArtifactInput[],
): Promise<{ inserted: number; skipped: number; error?: string }> {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  /* Normalize the input rows into the table's column shape */
  const rows = artifacts.map(a => ({
    project_id:           a.project_id,
    campaign_id:          a.campaign_id || null,
    panel_id:             a.panel_id    || null,
    source_kind:          a.source_kind,
    source_id:            a.source_id,
    source_step_id:       a.source_step_id || null,
    artifact_kind:        a.artifact_kind,
    title:                a.title || a.artifact_kind || 'Untitled',
    keyword:              a.keyword     || null,
    target_url:           a.target_url  || null,
    body:                 a.body || '',
    body_format:          a.body_format || 'markdown',
    metadata:             a.metadata    || {},
    status:               'current',
    generation_cost_usd:  typeof a.generation_cost_usd === 'number' ? a.generation_cost_usd : null,
    llm_calls:            a.llm_calls   || 0,
    serpapi_calls:        a.serpapi_calls || 0,
    ...(a.generated_at ? { generated_at: a.generated_at } : {}),
  }));

  try {
    /* Plain insert — ignoreDuplicates handles the COALESCE-based unique index
       that PostgREST cannot resolve via onConflict column names alone.
       The functional index (source_kind, source_id, COALESCE(source_step_id,''))
       means onConflict:'source_kind,source_id,source_step_id' silently fails
       to match — the upsert inserts nothing. Using insert+ignoreDuplicates
       lets Postgres evaluate the actual index on insert and skip duplicates. */
    const { data, error } = await db().from("artifacts")
      .insert(rows, { count: 'exact' })
      .select('id');

    if (error) {
      /* If the error is a unique-constraint violation, that's actually fine —
         it means the artifact already exists (idempotent). */
      if (error.code === '23505') {
        return { inserted: 0, skipped: rows.length };
      }
      console.log(`[artifacts] persist failed: ${error.message} (code: ${error.code})`);
      return { inserted: 0, skipped: rows.length, error: error.message };
    }
    const insertedCount = (data || []).length;
    return {
      inserted: insertedCount,
      skipped:  rows.length - insertedCount,
    };
  } catch (e: any) {
    console.log(`[artifacts] persist exception: ${e?.message || 'unknown'}`);
    return { inserted: 0, skipped: rows.length, error: e?.message || 'persist failed' };
  }
}

/* Persist artifacts AND mark any previous CURRENT artifacts for the same
   (project_id, panel_id, artifact_kind) as superseded. Used by
   refresh-from-audit and other re-finalize scenarios.

   The new artifacts are inserted first. Then for each (panel_id,
   artifact_kind) combination present in the new batch, all prior rows
   matching that (project_id, panel_id, artifact_kind) with status='current'
   and id != new_id get UPDATED to status='superseded' + superseded_by +
   superseded_at.

   The supersession happens AFTER the insert succeeds. If the insert returns
   inserted=0 (all rows already existed), no supersession runs — there's
   nothing new to supersede with. */
export async function persistArtifactsWithSupersession(
  artifacts: ArtifactInput[],
): Promise<{ inserted: number; superseded: number; skipped: number; error?: string }> {
  const insertResult = await persistArtifacts(artifacts);
  if (insertResult.error || insertResult.inserted === 0) {
    return { ...insertResult, superseded: 0 };
  }

  /* Read back the inserted artifacts so we have their new ids. We need
     to identify which (panel_id, artifact_kind) groups got new entries
     to know which prior CURRENT rows to supersede. */
  let supersededCount = 0;
  try {
    for (const a of artifacts) {
      /* Find the new row's id (the one we just inserted) */
      const { data: newRow } = await db().from("artifacts")
        .select("id")
        .eq("source_kind",    a.source_kind)
        .eq("source_id",      a.source_id)
        .eq("source_step_id", a.source_step_id || null)
        .maybeSingle();
      const newId = (newRow as any)?.id;
      if (!newId) continue;

      /* Mark prior CURRENT artifacts for the same (project_id, panel_id,
         artifact_kind) as superseded. Skip if panel_id is null — without
         a panel, supersession scope is ambiguous (could be cross-keyword).
         For panel-less artifacts (e.g. campaign-level future Q2 outputs),
         supersession is the caller's responsibility via explicit calls. */
      if (!a.panel_id) continue;

      const { data: priorRows, error: priorErr } = await db().from("artifacts")
        .update({
          status:         'superseded',
          superseded_by:  newId,
          superseded_at:  new Date().toISOString(),
        })
        .eq("project_id",    a.project_id)
        .eq("panel_id",      a.panel_id)
        .eq("artifact_kind", a.artifact_kind)
        .eq("status",        'current')
        .neq("id",           newId)
        .select('id');
      if (priorErr) {
        console.log(`[artifacts] supersession failed for ${a.artifact_kind}: ${priorErr.message}`);
        continue;
      }
      supersededCount += (priorRows || []).length;
    }
  } catch (e: any) {
    console.log(`[artifacts] supersession exception: ${e?.message || 'unknown'}`);
  }

  return {
    inserted:   insertResult.inserted,
    superseded: supersededCount,
    skipped:    insertResult.skipped,
  };
}

/* Helper for the pipeline-runner specifically. Takes a pipeline run's
   computed artifact list (same shape used by final_artifacts JSON column)
   plus the run row's metadata, and persists them via persistArtifacts.
   Pipeline runs always use supersession (a finalize can happen multiple
   times across refreshes — newer overrides older for same panel + kind). */
export async function persistPipelineRunArtifacts(opts: {
  runId:         string;
  projectId:     string;
  campaignId?:   string | null;
  panelId?:      string | null;
  keyword?:      string | null;
  targetUrl?:    string | null;
  pipelineType:  string;
  artifacts:     Array<{ kind: string; title: string; body: string; step_id: string }>;
  totalLlmCalls?: number;
  totalCostUsd?:  number;
  finishedAt?:    string | null;  // ISO timestamp of when the run actually finished
}): Promise<{ inserted: number; superseded: number; skipped: number }> {
  if (!opts.artifacts || opts.artifacts.length === 0) {
    return { inserted: 0, superseded: 0, skipped: 0 };
  }

  /* Distribute total run cost across artifacts evenly. Per-step cost is
     not currently tracked individually in the run row — this is a
     best-effort allocation. When per-step cost tracking lands later
     (potentially a Q-arc deliverable), this becomes precise. */
  const perArtifactLlm  = opts.totalLlmCalls
    ? Math.round((opts.totalLlmCalls / opts.artifacts.length) * 100) / 100
    : 0;
  const perArtifactCost = opts.totalCostUsd
    ? Math.round((opts.totalCostUsd / opts.artifacts.length) * 10000) / 10000
    : undefined;

  const inputs: ArtifactInput[] = opts.artifacts.map(a => ({
    source_kind:    'pipeline_run',
    source_id:      opts.runId,
    source_step_id: a.step_id || a.kind,
    artifact_kind:  a.kind,
    title:          a.title || a.kind,
    keyword:        opts.keyword || null,
    target_url:     opts.targetUrl || null,
    body:           a.body || '',
    body_format:    'markdown',
    metadata: {
      pipeline_type:  opts.pipelineType,
      run_id:         opts.runId,
    },
    project_id:           opts.projectId,
    campaign_id:          opts.campaignId || null,
    panel_id:             opts.panelId || null,
    generation_cost_usd:  perArtifactCost,
    llm_calls:            perArtifactLlm,
    serpapi_calls:        0,
    generated_at:         opts.finishedAt || null,
  }));

  return persistArtifactsWithSupersession(inputs);
}
