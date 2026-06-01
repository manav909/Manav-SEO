/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/routes.ts

   Orchestration for the Quantum Intelligence Workspace. Action handlers
   for the run lifecycle: create run, run deep steps, run panel rounds,
   submit Manav input, release gate, solve pillars, fetch state.

   Project-agnostic. All ids/urls flow through as data.
════════════════════════════════════════════════════════════════ */

import { db } from "../db.js";
import { resolveTargetUrls } from "./shared.js";
import { composeRunConfig, goalCatalog } from "./goals.js";
// Static imports — if any of these fail to bundle, the build/deploy fails
// VISIBLY, instead of throwing at runtime inside a dynamic import() where the
// error gets swallowed by the orchestrator's outer try/catch.
import { gatherGscVisibility } from "./deep-steps/gsc-visibility.js";
import { gatherCompetitorIntel } from "./deep-steps/competitor-intel.js";
import {
  gatherQueryLandscape, gatherOnpageAudit, gatherCoreWebVitals,
  gatherInternalLinkGraph, gatherEngagementValue, gatherTrajectory,
} from "./deep-steps/traffic-steps.js";

const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/* ─── goal catalog for the picker UI ───────────────────────────── */
export async function wsGoalCatalog() {
  return { success: true, ...goalCatalog() };
}

/* ─── preview a composed run config (no run created yet) ───────── */
export async function wsComposeConfig(body: any) {
  const { goalIds, customNeeds, customLabel } = body || {};
  const config = composeRunConfig({ goalIds, customNeeds, customLabel });
  return { success: true, config };
}

/* ─── create a workspace run with selected goals + config ──────── */
export async function wsCreateRun(body: any) {
  const { projectId, campaignId, goalIds, customNeeds, customLabel, stepOverrides } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };

  // Compose the config from the selected goals, then apply any step overrides
  // (enabled/depth toggles the operator set in the UI).
  const config = composeRunConfig({ goalIds, customNeeds, customLabel });
  if (Array.isArray(stepOverrides)) {
    for (const ov of stepOverrides) {
      const s = config.steps.find(x => x.key === ov.key);
      if (s) { if (typeof ov.enabled === "boolean") s.enabled = ov.enabled; if (ov.depth) s.depth = ov.depth; }
    }
  }

  const { data, error } = await db().from("workspace_runs").insert({
    project_id: projectId,
    campaign_id: campaignId || null,
    goal: config.composed_goal,
    goal_ids: config.goal_ids,
    run_config: config,
    status: "gathering",
  }).select("id").single();
  if (error) return { success: false, error: error.message };
  return { success: true, run_id: (data as any).id, config };
}

/* ─── run the deep steps for a run (gather evidence + reports) ──── */
export async function wsRunDeepSteps(body: any) {
  const { runId, projectId, campaignId } = body || {};
  if (!runId || !projectId) return { success: false, error: "runId and projectId required" };

  // Load the run's composed config to know which steps are enabled.
  const { data: runRow } = await db().from("workspace_runs").select("run_config").eq("id", runId).maybeSingle();
  const config = (runRow as any)?.run_config || null;
  const isEnabled = (key: string) => {
    if (!config || !Array.isArray(config.steps)) return true;  // no config → run the slice's defaults
    const s = config.steps.find((x: any) => x.key === key);
    return s ? s.enabled !== false : false;
  };

  const { urls: targetUrls } = await resolveTargetUrls(campaignId, projectId);
  if (!targetUrls.length) return { success: false, error: "No target pages found for this project." };

  const results: Record<string, string> = {};

  try {
    // Step — GSC visibility (run if enabled or no config)
    let nearRanking: any[] = [];
    if (isEnabled("gsc_visibility")) {
      try {
        const { evidence, report_md } = await gatherGscVisibility({ projectId, targetUrls });
        await upsertStepReport(runId, projectId, "gsc_visibility", evidence, report_md, evidence.worth_deeper);
        results["gsc_visibility"] = "ok";
        nearRanking = evidence.near_ranking || [];
      } catch (e: any) {
        await recordStepFailure(runId, projectId, "gsc_visibility", e?.message || String(e));
        results["gsc_visibility"] = `failed: ${e?.message}`;
      }
    } else {
      await recordStepSkipped(runId, projectId, "gsc_visibility");
    }

    // Step — Competitor intelligence (uses near-ranking queries from visibility)
    if (isEnabled("competitor_intel")) {
      try {
        const projectDomain = domainOf(targetUrls[0] || "");
        const queries = nearRanking
          .sort((a: any, b: any) => b.impressions - a.impressions)
          .map((q: any) => ({ query: q.query, position: q.position }));
        const comp = await gatherCompetitorIntel({ projectId, projectDomain, queries });
        await upsertStepReport(runId, projectId, "competitor_intel", comp.evidence, comp.report_md, comp.evidence.worth_deeper);
        results["competitor_intel"] = "ok";
      } catch (e: any) {
        await recordStepFailure(runId, projectId, "competitor_intel", e?.message || String(e));
        results["competitor_intel"] = `failed: ${e?.message}`;
      }
    } else {
      await recordStepSkipped(runId, projectId, "competitor_intel");
    }

    // Remaining full-depth steps — statically imported above so a bundling
    // problem fails at deploy time, not silently at runtime. Each runtime
    // failure is persisted to step_reports with the real error.
    const runStep = async (key: string, fn: (o: any) => Promise<{ evidence: any; report_md: string }>) => {
      if (!isEnabled(key)) { await recordStepSkipped(runId, projectId, key); return; }
      try {
        const { evidence, report_md } = await fn({ projectId, targetUrls });
        await upsertStepReport(runId, projectId, key, evidence, report_md, evidence.worth_deeper || []);
        results[key] = "ok";
      } catch (e: any) {
        await recordStepFailure(runId, projectId, key, e?.message || String(e));
        results[key] = `failed: ${e?.message}`;
      }
    };
    await runStep("query_landscape", gatherQueryLandscape);
    await runStep("onpage_audit", gatherOnpageAudit);
    await runStep("core_web_vitals", gatherCoreWebVitals);
    await runStep("internal_link_graph", gatherInternalLinkGraph);
    await runStep("engagement_value", gatherEngagementValue);
    await runStep("trajectory", gatherTrajectory);
  } catch (e: any) {
    return { success: false, error: `deep steps failed: ${e?.message}`, results };
  }

  await db().from("workspace_runs").update({ status: "panel_pending" }).eq("id", runId);
  return { success: true, results };
}

async function nextStepVersion(runId: string, stepKey: string): Promise<number> {
  const { data } = await db().from("step_reports")
    .select("version").eq("run_id", runId).eq("step_key", stepKey)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  return ((data as any)?.version || 0) + 1;
}

async function upsertStepReport(runId: string, projectId: string, stepKey: string, evidence: any, reportMd: string, worthDeeper: string[], triggeredBy = "initial") {
  // Versioned: append a new row at version = max+1. Older versions preserved
  // as evidence history. Reads filter to latest per (run_id, step_key).
  const version = await nextStepVersion(runId, stepKey);
  const row: any = {
    run_id: runId, project_id: projectId, step_key: stepKey,
    evidence_json: evidence, report_md: reportMd, worth_deeper_json: worthDeeper || [],
    status: "done", version, triggered_by: triggeredBy,
  };
  let { error } = await db().from("step_reports").insert(row);
  if (error && /version|triggered_by/i.test(error.message || "")) {
    // Column not yet migrated — fall back to pre-versioned overwrite so the
    // step still writes evidence (graceful for pre-migration deploys).
    await db().from("step_reports").delete().eq("run_id", runId).eq("step_key", stepKey);
    delete row.version; delete row.triggered_by;
    await db().from("step_reports").insert(row);
  }
}

/* Persist a failed step so the failure is visible (UI + queryable). */
async function recordStepFailure(runId: string, projectId: string, stepKey: string, error: string, triggeredBy = "initial") {
  const md = `# ${stepKey} — FAILED\n\n_${new Date().toLocaleString()}_\n\n**Error:** ${error}\n\nThis step did not write evidence. The pillar(s) that depend on it will surface the gap honestly rather than synthesise.`;
  try {
    const version = await nextStepVersion(runId, stepKey);
    const row: any = {
      run_id: runId, project_id: projectId, step_key: stepKey,
      evidence_json: { step_key: stepKey, generated_at: new Date().toISOString(), error },
      report_md: md, worth_deeper_json: [], status: `failed: ${(error || "").slice(0, 200)}`,
      version, triggered_by: triggeredBy,
    };
    let { error: ins } = await db().from("step_reports").insert(row);
    if (ins && /version|triggered_by/i.test(ins.message || "")) {
      await db().from("step_reports").delete().eq("run_id", runId).eq("step_key", stepKey);
      delete row.version; delete row.triggered_by;
      await db().from("step_reports").insert(row);
    }
  } catch (e: any) { console.error(`[workspace] recordStepFailure ${stepKey} ${e?.message}`); }
}

/* Persist a skipped (disabled-by-config) step so the UI shows it explicitly. */
async function recordStepSkipped(runId: string, projectId: string, stepKey: string) {
  try {
    const version = await nextStepVersion(runId, stepKey);
    const row: any = {
      run_id: runId, project_id: projectId, step_key: stepKey,
      evidence_json: { step_key: stepKey, skipped: true }, report_md: `_${stepKey} was disabled in the run config and did not execute._`,
      worth_deeper_json: [], status: "skipped", version, triggered_by: "initial",
    };
    let { error: ins } = await db().from("step_reports").insert(row);
    if (ins && /version|triggered_by/i.test(ins.message || "")) {
      await db().from("step_reports").delete().eq("run_id", runId).eq("step_key", stepKey);
      delete row.version; delete row.triggered_by;
      await db().from("step_reports").insert(row);
    }
  } catch (e: any) { console.error(`[workspace] recordStepSkipped ${stepKey} ${e?.message}`); }
}

/* ─── run a panel round ────────────────────────────────────────── */
export async function wsRunPanel(body: any) {
  const { runId, projectId, round, manavInput } = body || {};
  if (!runId || !projectId) return { success: false, error: "runId and projectId required" };
  const r = Number(round) || 1;

  // Diagnostic — confirm manavInput is being received from the client.
  console.error(`[workspace/panel-r${r}] received manavInput: ${manavInput ? `len=${String(manavInput).length} preview="${String(manavInput).slice(0, 120).replace(/\n/g, " ")}"` : "(none)"}`);

  let priorOutput: any = undefined;
  if (r >= 2) {
    const { data: prev } = await db().from("panel_sessions")
      .select("scenarios_json, role_questions_json, headline, cross_checks_json")
      .eq("run_id", runId).order("round", { ascending: false }).limit(1).maybeSingle();
    if (prev) priorOutput = {
      headline: (prev as any).headline,
      scenarios: (prev as any).scenarios_json || [],
      questions: (prev as any).role_questions_json || [],
      cross_checks: (prev as any).cross_checks_json || [],
    };
  }

  const { runPanelRound, renderPanelDocument } = await import("./panel-engine.js");
  const onStatus = async (s: string) => {
    try { await db().from("workspace_runs").update({ pillar_status: s }).eq("id", runId); } catch { /* non-fatal */ }
  };
  const res = await runPanelRound({ runId, projectId, round: r, manavInput, priorOutput, onStatus });
  if (!res.success || !res.output) return { success: false, error: res.error || "panel failed" };

  const doc = renderPanelDocument(res.output, r, manavInput);
  const { data, error } = await db().from("panel_sessions").insert({
    run_id: runId, project_id: projectId, round: r,
    headline: res.output.headline || null,
    scenarios_json: res.output.scenarios || [],
    role_questions_json: res.output.questions || [],
    cross_checks_json: res.output.cross_checks || [],
    manav_input_md: manavInput || null,
    document_md: doc,
    status: "awaiting_manav",
  }).select("id").single();
  if (error) return { success: false, error: error.message };

  await db().from("workspace_runs").update({ status: "panel_review" }).eq("id", runId);
  return { success: true, panel_id: (data as any).id, output: res.output, document_md: doc };
}

/* ─── release the gate → pillars may run ───────────────────────── */
export async function wsReleaseToPillars(body: any) {
  const { runId } = body || {};
  if (!runId) return { success: false, error: "runId required" };
  await db().from("panel_sessions").update({ status: "released" })
    .eq("run_id", runId).order("round", { ascending: false }).limit(1);
  await db().from("workspace_runs").update({ status: "pillars" }).eq("id", runId);
  return { success: true };
}

/* ─── cancel an in-flight solve-all by setting a flag on the run ───── */
export async function wsCancelRun(body: any) {
  const { runId } = body || {};
  if (!runId) return { success: false, error: "runId required" };
  await db().from("workspace_runs").update({ pillar_status: "CANCEL_REQUESTED" }).eq("id", runId);
  return { success: true };
}

/* ─── lightweight poll of pillar_status only (for live solve-all UI) ── */
export async function wsPollStatus(body: any) {
  const { runId } = body || {};
  if (!runId) return { success: false, error: "runId required" };
  const { data } = await db().from("workspace_runs").select("pillar_status").eq("id", runId).maybeSingle();
  return { success: true, pillar_status: (data as any)?.pillar_status || null };
}

/* ─── take pillars' escalations to the panel for round N+1 ─────
   Gathers escalations across all pillar reports for this run, formats them
   as the operator's input to the next panel round, then runs the panel. */
export async function wsTakeEscalationsToPanel(body: any) {
  const { runId, projectId, additionalContext } = body || {};
  if (!runId || !projectId) return { success: false, error: "runId and projectId required" };

  const { data: run } = await db().from("workspace_runs").select("created_at").eq("id", runId).maybeSingle();
  if (!run) return { success: false, error: "run not found" };
  const runStart = (run as any).created_at || new Date(0).toISOString();

  const { data: reports } = await db().from("seo_campaign_reports")
    .select("pillar, escalations_json, created_at")
    .eq("project_id", projectId).gte("created_at", runStart)
    .in("report_kind", ["deep_analysis", "manual_refresh"]).order("created_at", { ascending: false });

  // Take the latest report per pillar so a re-solved pillar's escalations win
  const seen = new Set<string>();
  const escalations: Array<{ pillar: string; question: string; to_roles: string[]; why?: string }> = [];
  for (const r of (reports || []) as any[]) {
    if (seen.has(r.pillar)) continue;
    seen.add(r.pillar);
    const list = Array.isArray(r.escalations_json) ? r.escalations_json : [];
    for (const e of list) if (e && e.question) escalations.push({ pillar: r.pillar, question: e.question, to_roles: e.to_roles || [], why: e.why });
  }

  if (!escalations.length && !additionalContext) {
    return { success: false, error: "No escalations across pillars yet. Solve pillars first, then take their escalations here." };
  }

  // Format as Manav-input for the next panel round
  const grouped: Record<string, typeof escalations> = {};
  for (const e of escalations) { (grouped[e.pillar] = grouped[e.pillar] || []).push(e); }
  let manavInput = `The pillar analyses have surfaced questions that need this panel's judgement. Discuss each in context of the goal and assign answers to the relevant role(s) — or, where appropriate, refine the framing back to a pillar for re-investigation.\n\n`;
  for (const p of Object.keys(grouped)) {
    manavInput += `### From ${p.replace(/_/g, ' ')}:\n`;
    for (const e of grouped[p]) {
      const roles = (e.to_roles || []).join(", ") || "panel";
      manavInput += `- ${e.question} (for ${roles}${e.why ? ` — ${e.why}` : ""})\n`;
    }
    manavInput += `\n`;
  }
  if (additionalContext) manavInput += `\nAdditional operator context:\n${additionalContext}\n`;

  // Determine next round number
  const { data: existing } = await db().from("panel_sessions").select("round").eq("run_id", runId).order("round", { ascending: false }).limit(1).maybeSingle();
  const nextRound = (((existing as any)?.round) || 1) + 1;

  // Run the panel with this input
  return wsRunPanel({ runId, projectId, round: nextRound, manavInput });
}
/* ─── solve the Client Report pillar — context + optional reference paste ───
   This is the communication-purpose pillar. Reads workspace evidence and the
   operator's per-report instructions to produce a client-ready deliverable. */
export async function wsSolveClientReport(body: any) {
  const { runId, projectId, campaignId, manavContext, referenceText, referenceMode, attachmentIds, mode } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  if (!runId) return { success: false, error: "runId required — Client Report draws on a workspace run." };
  if (!manavContext || String(manavContext).trim().length < 5) {
    return { success: false, error: "Provide context — at minimum, the client's name and what they want in this report." };
  }

  const { solveClientReport } = await import("./client-report.js");
  const onStatus = async (s: string) => {
    try { await db().from("workspace_runs").update({ pillar_status: s }).eq("id", runId); } catch { /* non-fatal */ }
  };
  return solveClientReport({
    runId, projectId, campaignId,
    manavContext: String(manavContext),
    referenceText: referenceText ? String(referenceText) : undefined,
    referenceMode: (referenceMode === "template" || referenceMode === "data" || referenceMode === "both") ? referenceMode : undefined,
    attachmentIds: Array.isArray(attachmentIds) ? attachmentIds.filter(Boolean).map(String) : undefined,
    mode: (mode === "comprehensive" || mode === "strict") ? mode : "strict",
    onStatus,
  });
}

/* ─── Upload a reference attachment (PDF / DOCX / XLSX / CSV) ──────── */
export async function wsCrUploadAttachment(body: any) {
  const { projectId, runId, fileName, contentType, fileB64 } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  if (!fileB64) return { success: false, error: "fileB64 required" };
  const { clientReportUploadAttachment } = await import("./client-report-uploads.js");
  return clientReportUploadAttachment({ projectId, runId, fileName, contentType, fileB64 });
}

export async function wsCrListAttachments(body: any) {
  const { projectId, runId } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { clientReportListAttachments } = await import("./client-report-uploads.js");
  return clientReportListAttachments({ projectId, runId });
}

export async function wsCrRemoveAttachment(body: any) {
  const { attachmentId, projectId } = body || {};
  if (!attachmentId || !projectId) return { success: false, error: "attachmentId and projectId required" };
  const { clientReportRemoveAttachment } = await import("./client-report-uploads.js");
  return clientReportRemoveAttachment({ attachmentId, projectId });
}

/* ─── solve one pillar (Path A from panel, or Path B direct) ───── */
export async function wsSolvePillar(body: any) {
  const { runId, projectId, campaignId, pillar, manavContext, targetUrls } = body || {};
  if (!projectId || !pillar) return { success: false, error: "projectId and pillar required" };

  // Path A: pull this pillar's questions from the latest released panel
  let panelQuestions: any[] | undefined;
  if (runId) {
    const { data: panel } = await db().from("panel_sessions")
      .select("role_questions_json").eq("run_id", runId).order("round", { ascending: false }).limit(1).maybeSingle();
    const all = (panel as any)?.role_questions_json || [];
    panelQuestions = all.filter((q: any) => q.pillar === pillar);
  }

  const { solvePillar } = await import("./pillar-scientist.js");
  const res = await solvePillar({
    projectId, campaignId, pillar,
    panelQuestions,
    manavContext,
    targetUrls: Array.isArray(targetUrls) && targetUrls.length ? targetUrls : undefined,
    runId,
    onStatus: async (s: string) => {
      // best-effort live status on the run row
      if (runId) await db().from("workspace_runs").update({ pillar_status: `${pillar}: ${s}` }).eq("id", runId).then(() => {}, () => {});
    },
  });
  return res;
}

/* ─── fetch full run state for the workspace screen ────────────── */
export async function wsGetRun(body: any) {
  const { runId, projectId } = body || {};
  if (!runId && !projectId) return { success: false, error: "runId or projectId required" };

  let run: any;
  if (runId) {
    run = (await db().from("workspace_runs").select("*").eq("id", runId).maybeSingle()).data;
  } else {
    run = (await db().from("workspace_runs").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
  }
  if (!run) return { success: true, run: null, steps: [], panel: null, reports: [] };

  // Pillar reports for this run. Workspace runs often have no campaign_id, so
  // we can't filter on it — match by project, the deep_analysis kind, and the
  // run's start window. (Reports written before this run existed are excluded.)
  const runStart = run.created_at || new Date(0).toISOString();
  // Pull ALL step report rows (incl. older versions) — UI uses latest per
  // (step_key) for the main card, and the full history for the version list.
  const [allSteps, panels, reports] = await Promise.all([
    db().from("step_reports").select("id, step_key, report_md, worth_deeper_json, status, created_at, version, triggered_by").eq("run_id", run.id).order("step_key").order("version", { ascending: false }),
    db().from("panel_sessions").select("*").eq("run_id", run.id).order("round", { ascending: false }),
    db().from("seo_campaign_reports").select("id, pillar, report_kind, title, summary, body_md, confidence_rating, generated_by, data_sources, escalations_json, created_at")
      .eq("project_id", run.project_id).in("report_kind", ["deep_analysis", "manual_refresh"]).gte("created_at", runStart)
      .order("created_at", { ascending: false }),
  ]);

  // Build "latest per step" + attach all_versions for history-on-demand UI.
  const allStepRows = ((allSteps as any).data || []) as any[];
  const latestPerStep: Record<string, any> = {};
  const versionsByStep: Record<string, any[]> = {};
  for (const r of allStepRows) {
    const v = r.version ?? 1;  // pre-migration rows are treated as v1
    if (!versionsByStep[r.step_key]) versionsByStep[r.step_key] = [];
    versionsByStep[r.step_key].push({ id: r.id, version: v, triggered_by: r.triggered_by || "initial", created_at: r.created_at, status: r.status });
    if (!latestPerStep[r.step_key] || (latestPerStep[r.step_key].version ?? 1) < v) {
      latestPerStep[r.step_key] = { ...r, version: v };
    }
  }
  const steps = Object.values(latestPerStep).map((s: any) => ({ ...s, all_versions: versionsByStep[s.step_key] || [] }));

  return {
    success: true,
    run,
    steps,
    panel: ((panels as any).data || [])[0] || null,
    panel_rounds: (panels as any).data || [],
    reports: (reports as any).data || [],
  };
}

/* ─── action router ────────────────────────────────────────────── */
export async function handleWorkspace(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "ws_goal_catalog":        return wsGoalCatalog();
    case "ws_compose_config":      return wsComposeConfig(body);
    case "ws_create_run":          return wsCreateRun(body);
    case "ws_run_deep_steps":      return wsRunDeepSteps(body);
    case "ws_run_panel":           return wsRunPanel(body);
    case "ws_release_to_pillars":  return wsReleaseToPillars(body);
    case "ws_take_escalations_to_panel": return wsTakeEscalationsToPanel(body);
    case "ws_solve_pillar":        return wsSolvePillar(body);
    case "ws_solve_client_report": return wsSolveClientReport(body);
    case "ws_cr_upload_attachment": return wsCrUploadAttachment(body);
    case "ws_cr_list_attachments":  return wsCrListAttachments(body);
    case "ws_cr_remove_attachment": return wsCrRemoveAttachment(body);
    case "ws_cancel_run":          return wsCancelRun(body);
    case "ws_poll_status":         return wsPollStatus(body);
    case "ws_get_run":             return wsGetRun(body);
    default: return null;
  }
}
