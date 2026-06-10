/* ════════════════════════════════════════════════════════════════
   api/lib/wizard-run.ts

   BUILD 12.23b-4 — Wizard stage orchestration.

   Runs ONE wizard stage at a time via the real engine behind it, and
   returns its status + output. This is the per-stage execution layer for
   the "confirm and click next" model: the operator advances one stage,
   the wizard runs that stage's engine, reports exactly what happened.

   Two deliberate design choices, both honesty-driven:
   1. STATELESS. No wizard_runs table, no migration. The run's progress
      belongs to the UI layer (12.23c), which holds which stages are done.
      Each call executes one stage independently.
   2. PER-STAGE, human-in-the-loop. Stages are not auto-fired in a blind
      batch. Each stage carries a `validation` flag — "established" for
      engines proven in production, "unvalidated" for the engines built
      this session (the URL classifier, the export, CSV ingestion) and
      the GEO analysis steps, which have not yet been field-validated.
      That flag is the gate: the operator sees, per stage, when output
      should be scrutinised before trusting it. The orchestrator never
      presents unvalidated output as established.

   Multi-tenant: projectId + stage inputs only.
════════════════════════════════════════════════════════════════ */

import { getArchetype } from "./wizard-archetypes.js";
import { getCapability } from "./capability-registry.js";
import { db } from "./db.js";
import { classifyUrls } from "./url-classifier.js";
import { exportUrlInventory } from "./url-inventory-export.js";
import { loadGsc } from "./workspace/shared.js";
import { detectCannibalization } from "./pm-analytics-intel.js";
import { wsCreateRun, wsRunDeepSteps, wsSolveClientReport } from "./workspace/routes.js";
import { runTechnicalAudit } from "./seo-technical-audit.js";

export type StageStatus = "completed" | "manual" | "needs_input" | "needs_connection" | "error";
export type Validation = "established" | "unvalidated";

export interface WizardStageResult {
  archetype_id: string;
  stage_id:     string;
  stage_label:  string;
  status:       StageStatus;
  validation:   Validation;
  ran_engine:   string | null;   // the engine actually invoked
  output:       any;             // the engine's output, or null
  note:         string;          // honest, operator-facing
  error?:       string;
}

/* Capability sets that determine routing + honesty flags. */
const GEO_CAPS = new Set(["geo_citation_gap", "geo_content_template", "geo_displacement"]);
const SESSION_NEW_CAPS = new Set(["site_wide_url_classification", "url_inventory_export", "gsc_csv_ingestion", "topical_authority_map", "competitor_benchmark", "cms_platform_advisory", "paid_organic_substitution"]);
const WORKSPACE_BACKED = new Set(["workspace_deep_analysis", "onpage_audit", "internal_link_graph", "geo_citation_gap", "geo_content_template", "geo_displacement"]);

/* Pragmatic archetype → workspace goal mapping for workspace-backed stages.
   The goal determines which deep-steps (incl. GEO) the run composes. */
const ARCHETYPE_GOAL: Record<string, string> = {
  seo_audit_roadmap:     "page_growth",
  page_optimization:     "page_growth",
  content_authority:     "topical_authority",
  geo_aeo:               "topical_authority",
  technical_remediation: "page_growth",
};

function validationFor(capIds: string[]): Validation {
  return capIds.some(c => GEO_CAPS.has(c) || SESSION_NEW_CAPS.has(c)) ? "unvalidated" : "established";
}

export async function runWizardStage(opts: {
  projectId:    string;
  archetypeId?: string;
  stageId?:     string;
  capabilityIds?: string[];   // dynamic path: run these capabilities directly
  stageLabel?:  string;       // dynamic path: the client's deliverable label
  inputs?:      { targetKeywords?: string[]; campaignId?: string; runId?: string; context?: string; competitors?: string[]; siteUrl?: string };
}): Promise<WizardStageResult> {
  const { projectId } = opts;
  const inputs = opts.inputs || {};

  /* Resolve the stage from either the dynamic capability list or a fixed
     archetype lookup — both feed the same dispatch below. */
  let caps: string[];
  let stageLabel: string;
  let stageId = opts.stageId || "dynamic_stage";
  const archetypeId = opts.archetypeId || "dynamic";

  if (Array.isArray(opts.capabilityIds) && opts.capabilityIds.length) {
    caps = opts.capabilityIds.map(String);
    stageLabel = opts.stageLabel || "stage";
  } else {
    const archetype = getArchetype(opts.archetypeId || "");
    if (!archetype) return base(archetypeId, stageId, "(unknown)", "error", "established", null, null, "Unknown archetype, and no capabilityIds supplied.");
    const stage = archetype.stages.find(s => s.id === opts.stageId);
    if (!stage) return base(archetypeId, stageId, "(unknown)", "error", "established", null, null, "Unknown stage for this archetype.");
    caps = stage.capability_ids;
    stageLabel = stage.label;
    stageId = stage.id;
  }
  if (!projectId) return base(archetypeId, stageId, stageLabel, "error", "established", null, null, "projectId is required.");

  const validation = validationFor(caps);
  const capModes = caps.map(c => getCapability(c)?.mode).filter(Boolean) as string[];
  const result = (status: StageStatus, ran: string | null, output: any, note: string, error?: string): WizardStageResult =>
    base(archetypeId, stageId, stageLabel, status, validation, ran, output, note, error);

  try {
    /* All-manual stage → human judgement, no execution. */
    if (capModes.length > 0 && capModes.every(m => m === "manual_dms")) {
      return result("manual", null, null, `Human judgement call (${caps.join(", ")}). The platform assists with data, but a senior practitioner decides — review the supporting evidence from earlier stages and record the decision.`);
    }

    /* ── Direct, standalone engines (the session-built gap-engines) ── */
    if (caps.includes("site_wide_url_classification")) {
      const report = await classifyUrls({ projectId });
      if (report.total_urls === 0) return result("needs_connection", "url-classifier.ts", report, `No GSC page data stored. Connect Search Console and pull, or ingest a GSC CSV export, then re-run.`);
      return result("completed", "url-classifier.ts", report, `Classified ${report.total_urls} URLs. Unvalidated engine — review the keep/improve/merge calls and treat redirect/pruning as candidates.`);
    }

    if (caps.includes("url_inventory_export")) {
      const file = await exportUrlInventory({ projectId });
      if (!file.success) return result("needs_connection", "url-inventory-export.ts", file, file.error || `No data to export — connect or ingest GSC data first.`);
      return result("completed", "url-inventory-export.ts", file, `Exported ${file.total_urls} URLs to ${file.filename}. Carries the classifier's honesty (redirect = candidate, pruning needs crawl + sitemap).`);
    }

    if (caps.includes("keyword_cannibalization")) {
      const gsc = await loadGsc(projectId);
      const pairs = Array.isArray(gsc.queryPagePairs) ? gsc.queryPagePairs : [];
      if (pairs.length === 0) return result("needs_connection", "detectCannibalization", null, `No query-page pairs stored. The standard GSC CSV export lacks these (API-only); connect GSC or supply a combined export.`);
      const groups = detectCannibalization(pairs.map((p: any) => ({ query: p.query, page: p.page, clicks: Number(p.clicks || 0), position: Number(p.position || 0) })));
      return result("completed", "detectCannibalization", { groups }, `Found ${groups.length} cannibalisation group(s) from observed GSC data.`);
    }

    if (caps.includes("topical_authority_map")) {
      const { mapTopicalAuthority } = await import("./topical-authority.js");
      const report = await mapTopicalAuthority({ projectId });
      if (report.cluster_count === 0) return result("needs_connection", "topical-authority.ts", report, report.summary);
      return result("completed", "topical-authority.ts", report, report.summary);
    }

    if (caps.includes("competitor_benchmark")) {
      const comps = Array.isArray(inputs.competitors) ? inputs.competitors.map(String).filter(Boolean) : [];
      if (comps.length === 0) return result("needs_input", "competitor-benchmark.ts", null, `Supply competitor domains (inputs.competitors) — this engine does not auto-pick competitors, by design.`);
      const { benchmarkCompetitors } = await import("./competitor-benchmark.js");
      const report = await benchmarkCompetitors({ projectId, competitors: comps, keywords: inputs.targetKeywords, siteUrl: inputs.siteUrl });
      return result(report.queries_analyzed > 0 ? "completed" : "needs_connection", "competitor-benchmark.ts", report, report.summary);
    }

    if (caps.includes("cms_platform_advisory")) {
      const { adviseCms } = await import("./cms-advisor.js");
      const report = await adviseCms({ projectId, siteUrl: inputs.siteUrl });
      if (report.detected_platform === "unknown" && report.findings.length === 0) return result("needs_input", "cms-advisor.ts", report, report.summary);
      return result("completed", "cms-advisor.ts", report, report.summary);
    }

    if (caps.includes("paid_organic_substitution")) {
      const { analyzePaidVsOrganic } = await import("./paid-organic.js");
      const report = await analyzePaidVsOrganic({ projectId });
      if (!report.has_data) return result("needs_input", "paid-organic.ts", report, report.summary);
      return result("completed", "paid-organic.ts", report, report.summary);
    }

    if (caps.includes("gsc_csv_ingestion")) {
      return result("needs_input", "gsc-csv-ingest.ts", null, `This stage ingests an uploaded GSC export. Supply the CSV via the wizard_ingest_gsc_csv action, then advance.`);
    }

    /* ── Synthesis (needs a prior run + context) ── */
    if (caps.includes("client_report_narrative")) {
      if (!inputs.runId || !inputs.context || String(inputs.context).trim().length < 5) {
        return result("needs_input", "client-report.ts", null, `The roadmap/summary draws on a completed workspace run. Provide inputs.runId (from an analysis stage) and inputs.context (client name + what the report should cover).`);
      }
      const cr = await wsSolveClientReport({ runId: inputs.runId, projectId, manavContext: inputs.context });
      return result(cr?.success ? "completed" : "error", "client-report.ts", cr, cr?.success ? `Executive summary / roadmap generated from the workspace run.` : (cr?.error || `Client report failed.`), cr?.success ? undefined : cr?.error);
    }

    /* ── Per-page deep audit (campaign-scoped) ── */
    if (caps.includes("technical_audit_deep") || caps.includes("title_meta_h1_reco")) {
      if (!inputs.campaignId) {
        return result("needs_input", "seo-technical-audit.ts", null, `The deep per-page audit is campaign-scoped. Provide inputs.campaignId (the target page's campaign). ${caps.includes("internal_link_graph") ? "Internal-link analysis for this stage runs via a workspace analysis stage." : ""}`);
      }
      const audit = await runTechnicalAudit({ campaignId: inputs.campaignId, triggeredBy: "manual" });
      return result(audit?.success ? "completed" : "error", "seo-technical-audit.ts", audit, audit?.success ? `Deep audit complete: ${audit.findings_count} findings on ${audit.audited_url}.` : (audit?.error || `Audit failed.`), audit?.success ? undefined : audit?.error);
    }

    /* ── Workspace-backed analysis (incl. GEO) ── */
    if (caps.some(c => WORKSPACE_BACKED.has(c))) {
      const goalId = ARCHETYPE_GOAL[archetypeId] || "page_growth";
      const created = await wsCreateRun({ projectId, goalIds: [goalId], targetKeywords: inputs.targetKeywords || [] });
      if (!created?.success || !created.run_id) return result("error", "workspace pipeline", created, created?.error || `Could not create the workspace run.`, created?.error);
      const ran = await wsRunDeepSteps({ runId: created.run_id, projectId });

      /* Pull the REAL findings (each deep-step's report_md), not just a run handle. */
      const CAP_TO_STEPKEYS: Record<string, string[]> = {
        geo_citation_gap: ["ai_overview_citation_gap"], geo_content_template: ["geo_content_template"], geo_displacement: ["geo_displacement"],
        onpage_audit: ["onpage_audit"], internal_link_graph: ["internal_link_graph"],
      };
      const wantAll = caps.includes("workspace_deep_analysis");
      const wantKeys = new Set<string>();
      for (const c of caps) for (const k of (CAP_TO_STEPKEYS[c] || [])) wantKeys.add(k);
      let reports: Array<{ step_key: string; report_md: string }> = [];
      try {
        const { data } = await db().from("step_reports")
          .select("step_key, report_md, version, created_at")
          .eq("run_id", created.run_id)
          .order("version", { ascending: false }).order("created_at", { ascending: false });
        const latest = new Map<string, any>();
        for (const r of (data as any[] || [])) if (!latest.has(r.step_key)) latest.set(r.step_key, r);
        reports = [...latest.values()]
          .filter(r => (wantAll || wantKeys.has(r.step_key)) && r.report_md && String(r.report_md).trim())
          .map(r => ({ step_key: r.step_key, report_md: r.report_md }));
      } catch { /* non-fatal */ }

      const geoNote = caps.some(c => GEO_CAPS.has(c)) ? ` These are AI-Overview / GEO findings, which are not yet field-validated — confirm against real SERPs before acting.` : ``;
      const out = { run_id: created.run_id, project_domain: (created as any)?.project_domain || "", generated_at: new Date().toISOString(), results: ran?.results, reports };
      if (!ran?.success) return result("error", "workspace pipeline (wsCreateRun + wsRunDeepSteps)", out, ran?.error || `Deep steps failed.`, ran?.error);
      if (reports.length === 0) return result("needs_input", "workspace pipeline", out, `The analysis ran but produced no findings for this section. For AI-Overview / GEO analysis this usually means no target keywords were supplied, or none trigger an AI Overview — add target keywords and re-run.${geoNote}`);
      return result("completed", "workspace pipeline", out, `${reports.length} analysis section(s) produced from live search-results analysis.${geoNote}`);
    }

    /* ── GSC data presence check (connect_data / url_inventory) ── */
    if (caps.includes("gsc_metrics_per_url") || caps.includes("gsc_query_page_pairs")) {
      const gsc = await loadGsc(projectId);
      const pages = Array.isArray(gsc.topPages) ? gsc.topPages.length : 0;
      const pairs = Array.isArray(gsc.queryPagePairs) ? gsc.queryPagePairs.length : 0;
      if (pages === 0 && pairs === 0) return result("needs_connection", "loadGsc", null, `No GSC data stored. Connect Search Console (OAuth) and pull, or ingest a GSC CSV export.`);
      return result("completed", "loadGsc", { top_pages: pages, query_page_pairs: pairs }, `GSC data available: ${pages} top pages, ${pairs} query-page pairs.`);
    }

    /* Fallback — capabilities present but no executor mapped. */
    return result("manual", null, null, `No automated executor for this stage's capabilities (${caps.join(", ")}); handle manually or supply the required inputs.`);
  } catch (e: any) {
    return result("error", null, null, `Stage execution threw.`, e?.message || String(e));
  }
}

function base(archetype_id: string, stage_id: string, stage_label: string, status: StageStatus, validation: Validation, ran_engine: string | null, output: any, note: string, error?: string): WizardStageResult {
  return { archetype_id, stage_id, stage_label, status, validation, ran_engine, output, note, ...(error ? { error } : {}) };
}
