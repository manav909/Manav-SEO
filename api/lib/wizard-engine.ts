/* ════════════════════════════════════════════════════════════════
   api/lib/wizard-engine.ts

   BUILD 12.23a — Wizard engine (classify + plan).

   The brain of the chat-driven wizard. Given a pasted client
   conversation (or a stated objective), it:
     1. classifies WHICH wizard archetype the engagement is, using one
        LLM call constrained to the known archetype set;
     2. extracts the client's requirements, explicit exclusions, demanded
        deliverable format, and whether the sector is YMYL;
     3. builds the ordered stage plan for that archetype, resolving each
        stage's capabilities against the registry and computing its
        readiness HONESTLY — a stage whose engine does not exist reports
        blocked, a judgement stage reports manual_review, an integration
        stage reports needs_connection, and so on.

   This turn ships classify + plan only (the brain). Stage EXECUTION —
   actually running each ready stage via the live engines and persisting
   status — is the next slice (12.23b), as is the click-next UI (12.23c,
   gated on a layout unfreeze). Nothing here touches layout or the DB, so
   it is freeze-safe and migration-free.

   Multi-tenant: the client chat is INPUT only. No client value is ever
   baked into the engine.
════════════════════════════════════════════════════════════════ */

import { llm, parseJsonResponse } from "./workspace/llm.js";
import { WIZARD_ARCHETYPES, ARCHETYPE_IDS, getArchetype, type WizardArchetype } from "./wizard-archetypes.js";
import { CAPABILITY_REGISTRY, getCapability, MODE_SEVERITY, type ExecutionMode } from "./capability-registry.js";

/* A stage's overall readiness, derived from the worst mode among its
   capabilities. These map to what the wizard UI will show per stage. */
export type StageReadiness =
  | "ready"             // every capability runs auto
  | "needs_connection"  // an integration must be connected first
  | "needs_input"       // operator must supply input (e.g. keywords)
  | "manual_review"     // a human judgement call; platform assists
  | "blocked";          // a capability has no engine yet — an explicit gap

const SEVERITY_TO_READINESS: Record<number, StageReadiness> = {
  0: "ready",
  1: "needs_connection",
  2: "needs_input",
  3: "manual_review",
  4: "blocked",
};

export interface PlannedStage {
  id:           string;
  label:        string;
  produces:     string;
  readiness:    StageReadiness;
  capabilities: Array<{ id: string; label: string; engine: string; mode: ExecutionMode; limits: string }>;
  note:         string;
}

export interface WizardPlan {
  archetype_id:    string;
  archetype_label: string;
  confidence:      number;            // 0-100, the classifier's confidence
  requirements:    string[];          // what the client asked for, extracted
  exclusions:      string[];          // what the client explicitly does NOT want
  deliverable_format: string;         // e.g. "spreadsheet (Sheets/Excel) + summary doc"
  ymyl:            boolean;           // finance/health/legal — forces manual review on trust calls
  stages:          PlannedStage[];
  gaps:            Array<{ stage: string; missing_capability: string; note: string }>;
  manual_calls:    string[];          // stages that need human judgement
  summary:         string;            // one honest paragraph for the operator
}

/* ─── Classification ──────────────────────────────────────────── */

function buildClassifierSystem(): string {
  const list = ARCHETYPE_IDS.map(id => {
    const a = WIZARD_ARCHETYPES[id];
    return `- ${id}: ${a.label}. ${a.description} Signals: ${a.trigger_signals.join("; ")}.`;
  }).join("\n");
  return [
    `You classify an SEO client conversation into exactly ONE wizard archetype, and extract structured scope.`,
    ``,
    `The ONLY valid archetype_id values are:`,
    list,
    ``,
    `Rules:`,
    `- Pick the single archetype that best matches what the client ultimately agreed to. If they discussed several but converged on one (for example, a full site-wide audit), pick that one.`,
    `- archetype_id MUST be one of the ids above, verbatim. If nothing fits well, pick the closest and lower the confidence.`,
    `- Extract requirements faithfully from what the client actually asked for. Do not invent requirements they did not state.`,
    `- Extract explicit exclusions — things the client said they do NOT want.`,
    `- Capture the deliverable format the client demanded (for example, a spreadsheet, a document, specific columns).`,
    `- Set ymyl true if the site is in a Your-Money-or-Your-Life sector: finance, health, legal, insurance, or similar.`,
    ``,
    `Return ONLY valid JSON, no prose, no markdown fences:`,
    `{"archetype_id":"<id>","confidence":<0-100>,"requirements":["..."],"exclusions":["..."],"deliverable_format":"<short phrase>","ymyl":<true|false>}`,
  ].join("\n");
}

async function classifyChat(chatText: string): Promise<{
  archetype_id: string;
  confidence: number;
  requirements: string[];
  exclusions: string[];
  deliverable_format: string;
  ymyl: boolean;
}> {
  const raw = await llm({
    system: buildClassifierSystem(),
    user: `Client conversation:\n\n${chatText.slice(0, 24000)}`,
    maxTokens: 1500,
    timeoutMs: 60000,
    label: "wizard-classify",
  });

  const parsed = parseJsonResponse<any>(raw);
  const validId = parsed && ARCHETYPE_IDS.includes(parsed.archetype_id)
    ? parsed.archetype_id
    : "seo_audit_roadmap"; // safe default — most general, fully scoped

  return {
    archetype_id: validId,
    confidence: parsed && Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(100, Math.round(parsed.confidence))) : (parsed ? 50 : 0),
    requirements: Array.isArray(parsed?.requirements) ? parsed.requirements.filter((x: any) => typeof x === "string") : [],
    exclusions: Array.isArray(parsed?.exclusions) ? parsed.exclusions.filter((x: any) => typeof x === "string") : [],
    deliverable_format: typeof parsed?.deliverable_format === "string" ? parsed.deliverable_format : "(not specified)",
    ymyl: Boolean(parsed?.ymyl),
  };
}

/* ─── Plan assembly (deterministic, grounded in the registry) ──── */

function planStages(archetype: WizardArchetype, ymyl: boolean): { stages: PlannedStage[]; gaps: WizardPlan["gaps"]; manual_calls: string[] } {
  const gaps: WizardPlan["gaps"] = [];
  const manual_calls: string[] = [];

  const stages: PlannedStage[] = archetype.stages.map(stage => {
    const caps = stage.capability_ids.map(id => {
      const c = getCapability(id);
      return c
        ? { id: c.id, label: c.label, engine: c.engine, mode: c.mode, limits: c.limits }
        : { id, label: id, engine: "(unknown)", mode: "not_supported" as ExecutionMode, limits: "Capability id not found in the registry." };
    });

    /* Readiness = worst (highest-severity) mode among the stage's capabilities. */
    let worst = 0;
    for (const c of caps) worst = Math.max(worst, MODE_SEVERITY[c.mode]);
    /* YMYL forces any trust/E-E-A-T stage to at least manual review. */
    if (ymyl && caps.some(c => c.id === "eeat_ymyl_assessment")) worst = Math.max(worst, MODE_SEVERITY.manual_dms);
    const readiness = SEVERITY_TO_READINESS[worst];

    /* Honest per-stage note + side-effects on gaps/manual_calls. */
    let note: string;
    if (readiness === "blocked") {
      const missing = caps.filter(c => c.mode === "not_supported");
      for (const m of missing) gaps.push({ stage: stage.label, missing_capability: m.label, note: m.limits });
      note = `Blocked — needs an engine that does not exist yet: ${missing.map(m => m.label).join(", ")}. ${missing[0]?.limits || ""}`;
    } else if (readiness === "manual_review") {
      manual_calls.push(stage.label);
      note = `Human judgement call. The platform assists with data, but a senior practitioner decides — especially given the YMYL/regulated context.`;
    } else if (readiness === "needs_connection") {
      note = `Runs automatically once the required integration is connected (${caps.filter(c => c.mode === "needs_connection").map(c => c.label).join(", ")}).`;
    } else if (readiness === "needs_input") {
      note = `Runs automatically once the required input is supplied (${caps.filter(c => c.mode === "needs_input").map(c => c.label).join(", ")}).`;
    } else {
      note = `Runs automatically — all capabilities are available.`;
    }

    return { id: stage.id, label: stage.label, produces: stage.produces, readiness, capabilities: caps, note };
  });

  return { stages, gaps, manual_calls };
}

function buildSummary(plan: Omit<WizardPlan, "summary">): string {
  const total = plan.stages.length;
  const ready = plan.stages.filter(s => s.readiness === "ready" || s.readiness === "needs_connection" || s.readiness === "needs_input").length;
  const blocked = plan.stages.filter(s => s.readiness === "blocked").length;
  const manual = plan.manual_calls.length;
  const parts: string[] = [];
  parts.push(`This conversation maps to the "${plan.archetype_label}" wizard (confidence ${plan.confidence}%).`);
  parts.push(`${ready} of ${total} stages can run on existing engines${blocked ? `, ${blocked} are blocked on engines not yet built (${plan.gaps.map(g => g.missing_capability).join(", ")})` : ``}${manual ? `, and ${manual} are human judgement calls` : ``}.`);
  if (plan.ymyl) parts.push(`The sector is YMYL/regulated, so trust and E-E-A-T decisions are held for human review by design.`);
  if (plan.exclusions.length) parts.push(`The client explicitly excluded: ${plan.exclusions.join("; ")}.`);
  if (blocked) parts.push(`The blocked stages are exactly the gap-engines on the roadmap (Build 12.23b); once they ship, this wizard completes end to end.`);
  return parts.join(" ");
}

/* ─── Public: classify a chat into a full wizard plan ─────────── */

export async function classifyAndPlan(chatText: string): Promise<WizardPlan> {
  const c = await classifyChat(chatText);
  const archetype = getArchetype(c.archetype_id) as WizardArchetype;
  const { stages, gaps, manual_calls } = planStages(archetype, c.ymyl);

  const base: Omit<WizardPlan, "summary"> = {
    archetype_id: archetype.id,
    archetype_label: archetype.label,
    confidence: c.confidence,
    requirements: c.requirements,
    exclusions: c.exclusions,
    deliverable_format: c.deliverable_format,
    ymyl: c.ymyl,
    stages,
    gaps,
    manual_calls,
  };
  return { ...base, summary: buildSummary(base) };
}

/* ─── Action router (mirrors handleWorkspace) ─────────────────── */

export async function handleWizard(action: string, body: any): Promise<any | null> {
  if (action === "wizard_archetypes") {
    return {
      success: true,
      archetypes: Object.values(WIZARD_ARCHETYPES).map(a => ({
        id: a.id, label: a.label, description: a.description, stage_count: a.stages.length,
      })),
    };
  }

  if (action === "wizard_classify") {
    const chatText = String(body?.chatText || body?.chat || body?.objective || "").trim();
    if (!chatText) return { success: false, error: "chatText (the client conversation) is required." };
    try {
      const plan = await classifyAndPlan(chatText);
      return { success: true, plan };
    } catch (e: any) {
      return { success: false, error: e?.message || "wizard classification failed" };
    }
  }

  /* Build 12.24 — dynamic composition: bespoke per-brief stages mapped to
     real engines or flagged as honest gaps. The flexible primary path. */
  if (action === "wizard_compose") {
    const chatText = String(body?.chatText || body?.chat || body?.objective || "").trim();
    if (!chatText) return { success: false, error: "chatText (the client brief) is required." };
    try {
      const { composeDynamicPlan } = await import("./wizard-compose.js");
      const plan = await composeDynamicPlan(chatText);
      return { success: true, plan };
    } catch (e: any) {
      return { success: false, error: e?.message || "wizard composition failed" };
    }
  }

  /* Build 12.23b — first executable stage engine: site-wide URL classification.
     Runs the `classify_urls` stage of the audit wizard against a project's
     stored GSC data. No new crawl cost. */
  if (action === "wizard_classify_urls") {
    const projectId = String(body?.projectId || "").trim();
    if (!projectId) return { success: false, error: "projectId is required." };
    try {
      const { classifyUrls } = await import("./url-classifier.js");
      const report = await classifyUrls({ projectId });
      return { success: true, report };
    } catch (e: any) {
      return { success: false, error: e?.message || "url classification failed" };
    }
  }

  /* Build 12.23b-2 — export the classified URL inventory to a spreadsheet
     (multi-sheet xlsx + CSV, base64 for client download). */
  if (action === "wizard_export_inventory") {
    const projectId = String(body?.projectId || "").trim();
    if (!projectId) return { success: false, error: "projectId is required." };
    try {
      const { exportUrlInventory } = await import("./url-inventory-export.js");
      const file = await exportUrlInventory({ projectId });
      return file.success ? { success: true, file } : { success: false, error: file.error, file };
    } catch (e: any) {
      return { success: false, error: e?.message || "url inventory export failed" };
    }
  }

  /* Build 12.23b-3 — ingest a GSC CSV export when OAuth is not granted. */
  if (action === "wizard_ingest_gsc_csv") {
    const projectId = String(body?.projectId || "").trim();
    if (!projectId) return { success: false, error: "projectId is required." };
    try {
      const { ingestGscCsv } = await import("./gsc-csv-ingest.js");
      const report = await ingestGscCsv({ projectId, csvs: body?.csvs, csvText: body?.csvText, filename: body?.filename });
      return report.success ? { success: true, report } : { success: false, error: report.error || report.summary, report };
    } catch (e: any) {
      return { success: false, error: e?.message || "gsc csv ingestion failed" };
    }
  }

  /* Build 12.23b-4 — execute one wizard stage via its real engine. Stateless;
     the UI holds run progress. Each result carries an honest validation flag. */
  if (action === "wizard_run_stage") {
    const projectId = String(body?.projectId || "").trim();
    const archetypeId = String(body?.archetypeId || "").trim();
    const stageId = String(body?.stageId || "").trim();
    const capabilityIds = Array.isArray(body?.capabilityIds) ? body.capabilityIds.map(String) : undefined;
    if (!projectId || (!capabilityIds?.length && (!archetypeId || !stageId))) {
      return { success: false, error: "projectId plus either capabilityIds (dynamic) or archetypeId+stageId (preset) are required." };
    }
    try {
      const { runWizardStage } = await import("./wizard-run.js");
      const result = await runWizardStage({ projectId, archetypeId, stageId, capabilityIds, stageLabel: body?.stageLabel, inputs: body?.inputs });
      return { success: result.status !== "error", result };
    } catch (e: any) {
      return { success: false, error: e?.message || "wizard stage execution failed" };
    }
  }

  return null; // not a wizard action — let the caller fall through
}
