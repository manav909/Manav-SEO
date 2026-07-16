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
  engagement_type: "site_owner" | "reseller_productized" | "one_off_project" | "consultation";
  artifact_mode:   "audit" | "proposal";  // which document serves the buyer
  target_is_example: boolean;         // the URL mentioned is an example, not the site to work on
  buyer_note:      string;            // who is buying and what they optimise for
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
    `ALSO classify the ENGAGEMENT itself — this decides which ARTIFACT serves the buyer, which matters as much as the SEO-work archetype:`,
    `- engagement_type: exactly one of:`,
    `    "site_owner"          — a business wanting their OWN site analysed or improved.`,
    `    "reseller_productized"— an agency, freelancer or reseller who wants recurring production work to deliver to THEIR OWN clients. Signals: "an example of my clients", "bring on multiple clients", "the same plan", "partner", "white label", "brand new site with my own SEO team", asks for a per-client monthly price, or frames a fixed repeatable deliverable list.`,
    `    "one_off_project"     — a single fixed deliverable, not ongoing.`,
    `    "consultation"        — advice or strategy only, no production.`,
    `- artifact_mode: which document actually serves them — "audit" (a diagnosis of a specific site: findings + recommendations) OR "proposal" (a scope, delivery plan, quality standards and pricing basis for ongoing/productized work). A reseller or ongoing-retainer brief almost always needs "proposal" — auditing an example site is answering a question they did not ask.`,
    `- target_is_example: true if ANY website URL mentioned is only an ILLUSTRATIVE EXAMPLE of the buyer's clients rather than the actual site to be worked on. "Here is an example of the clients I get: example.com" => true. Do NOT audit an example site as if it were the deliverable.`,
    `- buyer_note: one short sentence on who is buying and what they optimise for (price, quality, or scale).`,
    ``,
    `Return ONLY valid JSON, no prose, no markdown fences:`,
    `{"archetype_id":"<id>","confidence":<0-100>,"requirements":["..."],"exclusions":["..."],"deliverable_format":"<short phrase>","ymyl":<true|false>,"engagement_type":"<site_owner|reseller_productized|one_off_project|consultation>","artifact_mode":"<audit|proposal>","target_is_example":<true|false>,"buyer_note":"<one sentence>"}`,
  ].join("\n");
}

async function classifyChat(chatText: string): Promise<{
  archetype_id: string;
  confidence: number;
  requirements: string[];
  exclusions: string[];
  deliverable_format: string;
  ymyl: boolean;
  engagement_type: "site_owner" | "reseller_productized" | "one_off_project" | "consultation";
  artifact_mode: "audit" | "proposal";
  target_is_example: boolean;
  buyer_note: string;
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
  const ENGAGEMENTS = ["site_owner", "reseller_productized", "one_off_project", "consultation"];
  const engagement_type = ENGAGEMENTS.includes(parsed?.engagement_type) ? parsed.engagement_type : "site_owner";

  return {
    archetype_id: validId,
    confidence: parsed && Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(100, Math.round(parsed.confidence))) : (parsed ? 50 : 0),
    requirements: Array.isArray(parsed?.requirements) ? parsed.requirements.filter((x: any) => typeof x === "string") : [],
    exclusions: Array.isArray(parsed?.exclusions) ? parsed.exclusions.filter((x: any) => typeof x === "string") : [],
    deliverable_format: typeof parsed?.deliverable_format === "string" ? parsed.deliverable_format : "(not specified)",
    ymyl: Boolean(parsed?.ymyl),
    engagement_type: engagement_type as any,
    /* A reseller/productized engagement defaults to a proposal even if the model
       hedged on artifact_mode — auditing their example site is the wrong artifact. */
    artifact_mode: (parsed?.artifact_mode === "proposal" || engagement_type === "reseller_productized") ? "proposal" : "audit",
    target_is_example: Boolean(parsed?.target_is_example),
    buyer_note: typeof parsed?.buyer_note === "string" ? parsed.buyer_note : "",
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
    engagement_type: c.engagement_type,
    artifact_mode: c.artifact_mode,
    target_is_example: c.target_is_example,
    buyer_note: c.buyer_note,
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
    const projectId = String(body?.projectId || "").trim();
    try {
      let materialsText = ""; let materialFiles: string[] = [];
      if (projectId) {
        try {
          const { loadMaterials, materialsForPrompt } = await import("./client-materials.js");
          const mats = await loadMaterials(projectId);
          if (mats.length) { const mp = materialsForPrompt(mats, 40000); materialsText = mp.text; materialFiles = mp.filenames; }
        } catch { /* materials optional */ }
      }
      const { composeDynamicPlan } = await import("./wizard-compose.js");
      const plan = await composeDynamicPlan(chatText, materialsText);
      return { success: true, plan, used_materials: !!materialsText, material_files: materialFiles };
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

  /* Build 12.29 — assemble a client-ready report from completed stage outputs.
     Stateless: the UI passes the stage outputs it already holds. */
  if (action === "wizard_report") {
    const stages = Array.isArray(body?.stages) ? body.stages : [];
    if (stages.length === 0) return { success: false, error: "No stage outputs supplied to report on." };
    try {
      const { assembleClientReport, assembleClientReportHtmlEnriched } = await import("./wizard-report.js");
      const o = { author: body?.author, client_name: body?.clientName, client_domain: body?.clientDomain, include_branding: Boolean(body?.includeBranding), report_title: body?.reportTitle, project_id: String(body?.projectId || "").trim() || undefined, requirements: Array.isArray(body?.requirements) ? body.requirements.map(String) : undefined, artifact_mode: (body?.artifactMode === "proposal" ? "proposal" : body?.artifactMode === "audit" ? "audit" : undefined) as ("proposal" | "audit" | undefined), engagement_type: body?.engagementType ? String(body.engagementType) : undefined, target_is_example: typeof body?.targetIsExample === "boolean" ? body.targetIsExample : undefined, buyer_note: body?.buyerNote ? String(body.buyerNote) : undefined, operator_emphasis: body?.operatorEmphasis ? String(body.operatorEmphasis) : undefined, keywords: Array.isArray(body?.keywords) ? body.keywords.map(String) : undefined, competitors: Array.isArray(body?.competitors) ? body.competitors.map(String) : undefined };
      const md = assembleClientReport(stages, o);
      const html = await assembleClientReportHtmlEnriched(stages, o);
      return { success: html.sections > 0, html: html.html, markdown: md.markdown, sections: html.sections, enriched: html.enriched };
    } catch (e: any) {
      return { success: false, error: e?.message || "report assembly failed" };
    }
  }

  /* Multiple meaningful, per-theme documents. The single all-stages report
     truncates on large runs; grouping stages by theme and assembling one
     document per theme keeps each senior pass reliable and detailed, and gives
     the operator several client-ready deep documents to present. */
  if (action === "wizard_report_areas") {
    const stages = Array.isArray(body?.stages) ? body.stages : [];
    if (stages.length === 0) return { success: false, error: "No stage outputs supplied to report on." };
    try {
      const { assembleAreaDocuments } = await import("./wizard-report.js");
      const o = { author: body?.author, client_name: body?.clientName, client_domain: body?.clientDomain, include_branding: Boolean(body?.includeBranding), project_id: String(body?.projectId || "").trim() || undefined, requirements: Array.isArray(body?.requirements) ? body.requirements.map(String) : undefined, artifact_mode: (body?.artifactMode === "proposal" ? "proposal" : body?.artifactMode === "audit" ? "audit" : undefined) as ("proposal" | "audit" | undefined), engagement_type: body?.engagementType ? String(body.engagementType) : undefined, target_is_example: typeof body?.targetIsExample === "boolean" ? body.targetIsExample : undefined, buyer_note: body?.buyerNote ? String(body.buyerNote) : undefined, operator_emphasis: body?.operatorEmphasis ? String(body.operatorEmphasis) : undefined, keywords: Array.isArray(body?.keywords) ? body.keywords.map(String) : undefined, competitors: Array.isArray(body?.competitors) ? body.competitors.map(String) : undefined };
      const { documents } = await assembleAreaDocuments(stages, o);
      return { success: documents.length > 0, documents };
    } catch (e: any) {
      return { success: false, error: e?.message || "multi-document assembly failed" };
    }
  }

  /* Client document — the senior-DMS, no-integration path. From a site URL
     alone it runs the whole crawl-based analysis suite (comprehensive on-page +
     technical + schema audit, structured-data generation, and search/AI-answer
     visibility), then synthesises it into one client-ready document. This is the
     honest answer to "we rarely have GSC": a live crawl yields a genuinely rich,
     data-backed audit without any integration. Respects the audit/proposal
     toggle and states plainly what GSC would add, in one line, not as filler. */
  if (action === "wizard_client_document") {
    const siteUrl = String(body?.siteUrl || "").trim();
    const projectId = String(body?.projectId || "").trim();
    if (!siteUrl) return { success: false, error: "Supply the site URL to build the document from." };
    /* Audit modes: smart = the ~25 most business-critical pages; detailed = 100
       most important pages; full = the whole sitemap. On JavaScript-rendered
       sites the crawler renders each page and caps a single pass lower; reaching
       detailed/full there takes the batched crawl (next capability). */
    const mode = ["smart", "detailed", "full"].includes(String(body?.mode)) ? String(body?.mode) : "smart";
    const modeMax = mode === "full" ? 300 : mode === "detailed" ? 100 : 25;
    /* Surface exactly which operator materials this project has, so it is visible
       whether an uploaded CSV/export actually reached the report (a silent miss
       usually means it was uploaded under a different project). */
    let materialsFound: Array<{ filename: string; chars: number }> = [];
    if (projectId) { try { const { loadMaterials } = await import("./client-materials.js"); materialsFound = (await loadMaterials(projectId)).map((m: any) => ({ filename: m.filename, chars: m.chars || 0 })); } catch { materialsFound = []; } }
    let domain = ""; let brand = "";
    try { const u = new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`); domain = u.hostname.replace(/^www\./, ""); brand = domain.split(".")[0]; } catch { domain = siteUrl; brand = siteUrl; }
    const stages: any[] = [];
    let crawledUrls: string[] = [];
    let homepageTopic = "";
    let jobSchemaPages: any[] = [];

    /* 1. Comprehensive crawl-based audit. If a completed batched-crawl jobId is
       supplied, assemble from the accumulated pages (full coverage); otherwise
       run a single-pass crawl. */
    const jobId = String(body?.jobId || "").trim();
    try {
      let audit: any = null;
      if (jobId) {
        const { db } = await import("./db.js");
        const { data: job } = await db().from("crawl_jobs").select("*").eq("id", jobId).single();
        if (job && job.status === "complete") {
          const { buildAuditReport, homepagePerformance } = await import("./site-crawler.js");
          const m = job.meta || {};
          const performance = await homepagePerformance(projectId, m.start || siteUrl);
          audit = buildAuditReport({ projectDomain: m.projectDomain || domain, pages: job.results || [], broken: job.broken || [], selected: m.selected || [], candidatesCount: m.candidatesCount || 0, allBoilerplate: m.allBoilerplate || [], sitemapCount: m.sitemapCount || 0, sitemapFiles: m.sitemapFiles || 0, renderNote: m.renderNote || "", performance, homeTitle: m.homeTitle || "", homeH1: m.homeH1 || "", target: job.target_count || 0 });
          /* Schema was captured DURING this crawl (same pages) — reuse it so the
             schema section covers all your crawled pages, no wasteful re-crawl. */
          jobSchemaPages = (job.results || []).map((rr: any) => rr && rr._schema).filter(Boolean);
        }
      }
      if (!audit) {
        const { crawlSite } = await import("./site-crawler.js");
        audit = await crawlSite({ projectId, siteUrl, maxPages: modeMax });
      }
      if (audit && audit.pages_reachable > 0) {
        stages.push({ label: "Site-wide SEO and technical audit", ran_engine: "site-crawler.ts", status: "completed", output: audit });
        crawledUrls = Array.isArray(audit.page_selection?.analysed_urls) ? audit.page_selection.analysed_urls : [];
        homepageTopic = audit.homepage_h1 || audit.homepage_title || "";
      }
    } catch { /* proceed with whatever gathers */ }

    /* 2. Structured-data audit + generation. If the batched crawl already
       captured schema for every page (same scope as the audit), aggregate that —
       no re-crawl, one consistent page set. Otherwise run it on the crawled URLs. */
    try {
      if (jobSchemaPages.length) {
        const { assembleSchemaReport } = await import("./schema-llms-engine.js");
        const schema = assembleSchemaReport(jobSchemaPages, siteUrl);
        if (schema && schema.ok) stages.push({ label: "Structured data (schema) and llms.txt", ran_engine: "schema-llms-engine.ts", status: "completed", output: schema });
      } else {
        const { generateSchemaAndLlms } = await import("./schema-llms-engine.js");
        const schema = await generateSchemaAndLlms({ projectId, siteUrl, pageUrls: crawledUrls.length ? crawledUrls : undefined, depth: "deep" });
        if (schema && schema.ok) stages.push({ label: "Structured data (schema) and llms.txt", ran_engine: "schema-llms-engine.ts", status: "completed", output: schema });
      }
    } catch { /* proceed */ }

    /* 3. Market & competitive search research — REAL external intelligence via
       SerpAPI (not a client integration). Queries the brand AND the site's own
       category, then aggregates who owns the results (share of voice), who the
       AI answers cite, and the real questions people ask. This is the data a
       generic LLM cannot produce, and it charts. */
    try {
      const { fetchSerpFeatures } = await import("./serpapi.js");
      const stop = /\b(the|and|to|for|of|a|an|your|our|we|us|create|through|welcome|home|homepage|official|site|website|inc|llc|ltd|co|company|new|best|top)\b/gi;
      let cat = String(homepageTopic || "").toLowerCase();
      for (const w of brand.toLowerCase().split(/\s+/)) if (w.length > 2) cat = cat.replace(new RegExp(`\\b${w.replace(/[^a-z0-9]/g, "")}\\b`, "gi"), " ");
      cat = cat.replace(stop, " ").replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, 5).join(" ");
      const queries = Array.from(new Set([brand, cat].filter(q => q && q.length > 2)));
      const serps = await Promise.all(queries.map(q => fetchSerpFeatures(q, projectId, {}).catch(() => null)));
      const valid = serps.map((s, i) => ({ q: queries[i], s })).filter(x => x.s) as Array<{ q: string; s: any }>;
      if (valid.length) {
        const sov: Record<string, number> = {};
        for (const { s } of valid) for (const d of (s.top_10_domains || [])) if (d) sov[d] = (sov[d] || 0) + 1;
        const share_of_voice = Object.entries(sov).map(([d, n]) => ({ domain: d, appearances: n })).sort((a, b) => b.appearances - a.appearances).slice(0, 12);
        const clientAppears = Object.keys(sov).some(d => d.includes(domain));
        const aiQueries = valid.filter(x => x.s.ai_overview).length;
        const aiCites: Record<string, number> = {};
        for (const { s } of valid) for (const r of (s.ai_overview_references || [])) if (r?.domain) aiCites[r.domain] = (aiCites[r.domain] || 0) + 1;
        const ai_citations = Object.entries(aiCites).map(([d, n]) => ({ domain: d, count: n })).sort((a, b) => b.count - a.count).slice(0, 10);
        const paa = Array.from(new Set(valid.flatMap(x => x.s.paa_questions || []))).slice(0, 10);
        const parts: string[] = [];
        parts.push(`Across ${valid.length} live search(es) (${queries.join('", "')}), ${clientAppears ? `${domain} appears in the top results` : `${domain} does NOT appear in the top results — its own space is owned by other sites`}.`);
        if (share_of_voice.length) parts.push(`The domains that own the top results are led by ${share_of_voice.slice(0, 3).map(x => `${x.domain} (${x.appearances})`).join(", ")}.`);
        if (aiQueries > 0) parts.push(`${aiQueries} of ${valid.length} of these searches show a Google AI Overview${ai_citations.length ? `, citing ${ai_citations.map(x => x.domain).slice(0, 4).join(", ")}` : ""} — and ${clientAppears ? "the client" : `${domain}`} ${ai_citations.some(x => x.domain.includes(domain)) ? "is among them" : "is not cited"}.`);
        if (paa.length) parts.push(`Real questions this audience searches (the content/Q&A opportunity): ${paa.slice(0, 6).join("; ")}.`);
        stages.push({ label: "Market and competitive search visibility", ran_engine: "serpapi.ts", status: "completed", output: { is_market_research: true, queries, share_of_voice, client_appears: clientAppears, client_domain: domain, ai_overview_queries: aiQueries, total_queries: valid.length, ai_citations, paa_questions: paa, summary: parts.join(" ") } });
      }
    } catch { /* research is a bonus; proceed without it */ }

    if (stages.length === 0) return { success: false, error: "Could not gather any data — the site may be blocking crawlers entirely, or the URL is unreachable. Verify the URL and try again." };

    try {
      const { assembleClientReport, assembleClientReportHtmlEnriched } = await import("./wizard-report.js");
      const o = {
        author: body?.author, client_name: body?.clientName, client_domain: body?.clientDomain || domain,
        include_branding: Boolean(body?.includeBranding),
        project_id: projectId || undefined,
        requirements: Array.isArray(body?.requirements) ? body.requirements.map(String) : undefined,
        artifact_mode: (body?.artifactMode === "proposal" ? "proposal" : "audit") as ("proposal" | "audit"),
        engagement_type: body?.engagementType ? String(body.engagementType) : undefined,
        target_is_example: typeof body?.targetIsExample === "boolean" ? body.targetIsExample : undefined,
        buyer_note: body?.buyerNote ? String(body.buyerNote) : undefined, operator_emphasis: body?.operatorEmphasis ? String(body.operatorEmphasis) : undefined,
      };
      const html = await assembleClientReportHtmlEnriched(stages, o);
      const md = assembleClientReport(stages, o);
      /* Persist the report under the project so it is retrievable without
         re-running the whole analysis. Best-effort — never blocks the response. */
      let savedId = "";
      if (projectId) {
        try {
          const { persistArtifacts } = await import("./artifacts.js");
          savedId = `clientdoc:${domain}:${Date.now()}`;
          await persistArtifacts([{
            source_kind: "audit", source_id: savedId, artifact_kind: "audit_report",
            title: `SEO & AEO ${o.artifact_mode === "proposal" ? "Proposal" : "Audit"} — ${domain}`,
            target_url: siteUrl, body: html.html, body_format: "html", project_id: projectId,
            metadata: { mode, artifact_mode: o.artifact_mode, sections: html.sections, ran: stages.map((s: any) => s.ran_engine), generated_at: new Date().toISOString() },
          }]);
        } catch { savedId = ""; }
      }
      return { success: html.sections > 0, html: html.html, markdown: md.markdown, sections: html.sections, enriched: html.enriched, ran: stages.map(s => s.ran_engine), saved_id: savedId, saved: !!savedId, mode, materials_found: materialsFound };
    } catch (e: any) {
      return { success: false, error: e?.message || "document assembly failed" };
    }
  }

  /* Batched, resumable crawl — reaches high page counts (Detailed/Full) on
     JavaScript-rendered sites by crawling a batch per invocation and saving
     progress to a job record, continued with the operator's consent until the
     whole selection is covered. Aggregation happens once, at report time, over
     every accumulated page. */
  /* Suggest target keywords and competitors from the project's REAL data, so the
     operator curates rather than types. Keywords come from Search Console queries
     and the crawled titles; competitors come from who actually ranks for those
     keywords in the live SERP. Honest and grounded, never invented. */
  if (action === "wizard_suggest_targets") {
    const projectId = String(body?.projectId || "").trim();
    const siteUrl = String(body?.siteUrl || body?.clientDomain || "").trim();
    if (!projectId && !siteUrl) return { success: false, error: "No project or site to derive from." };
    const dom = (u: string) => { try { return new URL(u.startsWith("http") ? u : "https://" + u).hostname.replace(/^www\./, ""); } catch { return ""; } };
    const clientDom = dom(siteUrl);
    const brandRoot = (clientDom.split(".")[0] || "").toLowerCase();            // eztips
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");      // "ez tips" -> "eztips"
    const brandNorm = norm(brandRoot);
    /* Infrastructure / non-competitor domains that SERP scraping drags in. */
    const JUNK_DOMAIN_RE = /(^|\.)(google|gstatic|googleusercontent|googleapis|facebook|instagram|youtube|youtu|twitter|x|linkedin|pinterest|reddit|wikipedia|wikimedia|fandom|amazon|ebay|apple|microsoft|bing|yahoo|duckduckgo|zendesk|freshdesk|intercom|helpscout|modrinth|github|gitlab|bitbucket|medium|quora|tumblr|blogspot|t|bit|tiktok|whatsapp|telegram|discord|trustpilot|glassdoor|indeed|crunchbase|yelp|tripadvisor|cloudflare|akamai|wixsite|shopify|myshopify)\.|^(static|cdn|assets|img|images|media|help|support|docs|status|mail|login|account|api|app|apps|play|store|blog\.google)\./i;
    const isClientOwned = (d: string) => { const dn = norm(d.split(".")[0] || ""); return d === clientDom || (brandNorm.length >= 3 && (dn === brandNorm || dn.includes(brandNorm) || brandNorm.includes(dn))); };
    try {
      const { db } = await import("./db.js");
      let gscQueries: string[] = [];
      try {
        const { loadGsc } = await import("./workspace/shared.js");
        const g: any = await loadGsc(projectId);
        const fromTop = ((g && g.topQueries) || []).map((q: any) => q && (q.query || (Array.isArray(q.keys) ? q.keys[0] : ""))).filter(Boolean);
        const fromPairs = ((g && g.queryPagePairs) || []).map((p: any) => p && p.query).filter(Boolean);
        gscQueries = Array.from(new Set([...fromTop, ...fromPairs]));
      } catch { /* no gsc */ }
      let titles: string[] = [];
      let homeTitle = "";
      try { const { data: jobs } = await db().from("crawl_jobs").select("meta,results").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(1); const job: any = Array.isArray(jobs) ? jobs[0] : null; if (job) { homeTitle = job.meta?.homeTitle || ""; titles = [homeTitle, ...(Array.isArray(job.results) ? job.results.slice(0, 25).map((r: any) => r.title) : [])].filter(Boolean); } } catch { /* no crawl */ }

      /* Pre-filter GSC queries: drop search operators and pure-brand/navigational
         terms BEFORE the model sees them, so brand noise cannot leak through. */
      const cleanQueries = Array.from(new Set(gscQueries)).filter((q) => {
        const ql = q.toLowerCase();
        if (/[:]|site:|inurl:|intitle:|filetype:/.test(ql)) return false;         // operators
        const qn = norm(q);
        if (brandNorm.length >= 3 && qn.includes(brandNorm)) return false;         // exact brand / navigational
        if (/official (website|site)|log ?in|sign ?in|\.com\b|\.co\b|\.net\b|download app|customer care|contact number/.test(ql)) return false; // clear navigational markers
        return true;
      });

      const { llmComplete } = await import("./workspace/llm.js");
      const business = homeTitle || titles.slice(0, 3).join(" | ") || clientDom;

      /* Live SERP enrichment: the real search landscape for this space, so the
         analysis is grounded in what people actually ask, who actually ranks,
         and how AI Overviews behave here, not just the client's own data. */
      const seeds = (cleanQueries.length ? cleanQueries : [business]).slice(0, 3);
      const paa: string[] = []; const rankingDomains: string[] = []; const aiRefDomains: string[] = [];
      let aiOverview = false;
      if (projectId) {
        try {
          const { fetchSerpFeatures } = await import("./serpapi.js");
          for (const kw of seeds) {
            const s: any = await fetchSerpFeatures(kw, projectId, {}).catch(() => null);
            if (!s) continue;
            for (const q of (s.paa_questions || [])) paa.push(String(q));
            for (const d of (s.top_10_domains || [])) { const dd = dom(d); if (dd && !isClientOwned(dd) && !JUNK_DOMAIN_RE.test(dd)) rankingDomains.push(dd); }
            if (s.ai_overview) { aiOverview = true; for (const r of (s.ai_overview_references || [])) { const dd = dom(r.domain || ""); if (dd) aiRefDomains.push(dd); } }
          }
        } catch { /* serp unavailable */ }
      }
      const paaU = Array.from(new Set(paa)).slice(0, 20);
      const rankU = Array.from(new Set(rankingDomains)).slice(0, 20);
      const aiU = Array.from(new Set(aiRefDomains)).filter((d) => !isClientOwned(d)).slice(0, 10);

      /* Senior-DMS synthesis: keywords WITH intent and a grounded reason,
         competitors WITH a reason, and a client-ready analysis of the landscape,
         buying behaviour and AI scenario. Strictly grounded in the real data. */
      let keywords: string[] = []; let competitors: string[] = [];
      let keywordDetails: any[] = []; let competitorDetails: any[] = []; let analysisMd = "";
      try {
        const grounding = [
          `Client site: ${clientDom}. Business (from the site): ${business}.`,
          cleanQueries.length ? `Real non-brand Search Console queries this site already earns impressions for: ${cleanQueries.slice(0, 40).join(", ")}.` : "No non-brand Search Console queries were available.",
          titles.length ? `Page titles from the crawl: ${titles.slice(0, 12).join(" | ")}.` : "",
          paaU.length ? `Live People Also Ask questions in this space (real searcher questions): ${paaU.join(" | ")}.` : "",
          rankU.length ? `Domains actually ranking for these terms in the live SERP: ${rankU.join(", ")}.` : "",
          aiOverview ? `Google shows an AI Overview for this space; domains it cites: ${aiU.join(", ") || "none captured"}.` : `No AI Overview detected for the seed queries.`,
        ].filter(Boolean).join("\n");
        const sys = "You are a Senior Digital Marketing Specialist producing a keyword and competitor strategy for a client. Use ONLY the real data provided (Search Console queries, the site's business, live People Also Ask questions, the domains actually ranking, and the AI Overview picture). Think like a senior: search intent (commercial, transactional, informational, navigational), buying and searching behaviour, the trend in this space, and the AI-search (AEO) scenario. EXCLUDE from keywords the client's own brand and domains, navigational queries, search operators, and any other company's brand name. EXCLUDE from competitors CDNs, app stores, marketplaces, forums, wikis, and non-competitors. Return ONLY JSON: {\"keywords\":[{\"term\":\"...\",\"intent\":\"commercial|transactional|informational\",\"reason\":\"one grounded line: why this keyword for this business\"}],\"competitors\":[{\"domain\":\"...\",\"reason\":\"one line: why a genuine competitor\"}],\"analysis\":\"200 to 350 words, client-ready, no em-dashes: the search landscape and who owns it, the buying and searching behaviour, the AI Overview and AEO scenario for this space, and the reasoning behind these keyword and competitor choices\"}. 8 to 14 keywords, 4 to 8 competitors. Never invent anything the data does not support.";
        const { text } = await llmComplete({ system: sys, user: grounding, maxTokens: 2000, timeoutMs: 70000, label: "suggest-research", maxSegments: 1 });
        const parsed: any = parseJsonResponse<any>(text) || {};
        keywordDetails = Array.isArray(parsed.keywords) ? parsed.keywords.filter((k: any) => k && k.term && !norm(String(k.term)).includes(brandNorm)).slice(0, 14) : [];
        competitorDetails = Array.isArray(parsed.competitors) ? parsed.competitors.map((c: any) => ({ ...c, domain: dom(String(c.domain || "")) })).filter((c: any) => c.domain && !isClientOwned(c.domain) && !JUNK_DOMAIN_RE.test(c.domain)).slice(0, 8) : [];
        keywords = keywordDetails.map((k: any) => String(k.term).trim()).filter(Boolean);
        competitors = competitorDetails.map((c: any) => c.domain).filter(Boolean);
        analysisMd = String(parsed.analysis || "").trim();
      } catch { /* fall back to real data below */ }
      if (!keywords.length && cleanQueries.length) keywords = cleanQueries.slice(0, 10);        // never drop real GSC queries to zero
      if (!competitors.length && rankU.length) competitors = rankU.slice(0, 6);                  // fall back to real SERP domains

      const gscFound = gscQueries.length;
      const crawlFound = titles.length;
      const note = (!keywords.length && !competitors.length)
        ? (gscFound === 0 && crawlFound === 0
            ? `Could not find Search Console or crawl data for this project (id ${projectId || "none"}). The crawl and GSC connection must be on the SAME project this wizard is running for. Confirm the selected project, then suggest again.`
            : `Found ${gscFound} Search Console queries and ${crawlFound} crawled pages, but nothing cleared the quality checks this pass. Suggest again, or curate the fields directly.`)
        : "";
      return { success: true, keywords, competitors, keyword_details: keywordDetails, competitor_details: competitorDetails, analysis_md: analysisMd, keyword_basis: cleanQueries.length ? "your Search Console queries plus the live SERP" : "your site content and the live SERP", competitor_basis: competitors.length ? "domains ranking in the live SERP for your terms, verified as real competitors" : "", note, gsc_queries_found: gscFound, crawl_pages_found: crawlFound };
    } catch (e: any) {
      return { success: false, error: e?.message || "suggestion failed" };
    }
  }

  if (action === "wizard_crawl_batch") {
    const projectId = String(body?.projectId || "").trim();
    const jobId = String(body?.jobId || "").trim();
    const stripLinks = (p: any) => { const { links, ...rest } = p || {}; return rest; };
    try {
      const { resolveTargets, crawlUrls, expandFrontier } = await import("./site-crawler.js");
      const { db } = await import("./db.js");

      if (!jobId) {
        const siteUrl = String(body?.siteUrl || "").trim();
        if (!siteUrl) return { success: false, error: "Supply the site URL to start a crawl." };
        const mode = ["smart", "detailed", "full", "max", "advanced"].includes(String(body?.mode)) ? String(body?.mode) : "detailed";
        const target = mode === "advanced" ? 4000 : mode === "max" ? 1000 : mode === "full" ? 400 : mode === "detailed" ? 100 : 25;
        const r = await resolveTargets({ projectId, siteUrl, maxPages: target });
        if (!r || !r.selected.length) return { success: false, error: "Could not resolve the site (unreachable or blocking crawlers)." };
        const batchSize = r.useReader ? 40 : 60;
        const first = r.selected.slice(0, batchSize);
        const { pages, broken, schema } = await crawlUrls(first, r.useReader, r.useReader ? 5 : 6, r.start, r.homeHtml, true);
        const grown = expandFrontier(r.selected, pages, r.projectDomain, target); // spider: follow internal links
        const schemaByUrl = new Map((schema || []).map((s: any) => [s.url, s]));
        const results = pages.map((p: any) => { const item = stripLinks(p); const s = schemaByUrl.get(p.url); if (s) item._schema = s; return item; });
        const complete = first.length >= grown.length;
        const id = `crawljob:${r.projectDomain}:${Date.now()}`;
        const meta = { selected: grown, cap: target, candidatesCount: r.candidatesCount, allBoilerplate: r.allBoilerplate, sitemapCount: r.sitemapCount, sitemapFiles: r.sitemapFiles, renderNote: r.renderNote, useReader: r.useReader, start: r.start, projectDomain: r.projectDomain, homeTitle: r.homeTitle, homeH1: r.homeH1 };
        await db().from("crawl_jobs").insert({ id, project_id: projectId || null, site_url: siteUrl, mode, target_count: grown.length, meta, results, broken, cursor: first.length, status: complete ? "complete" : "running" });
        return { success: true, jobId: id, done: first.length, total: grown.length, complete, use_reader: r.useReader };
      }

      const { data: job } = await db().from("crawl_jobs").select("*").eq("id", jobId).single();
      if (!job) return { success: false, error: "Crawl job not found." };
      if (job.status === "complete") return { success: true, jobId, done: job.cursor, total: job.target_count, complete: true };
      const m = job.meta || {};
      const selected = Array.isArray(m.selected) ? m.selected : [];
      const batchSize = m.useReader ? 40 : 60;
      const next = selected.slice(job.cursor, job.cursor + batchSize);
      const { pages, broken, schema } = next.length ? await crawlUrls(next, m.useReader, m.useReader ? 5 : 6, m.start, "", true) : { pages: [], broken: [], schema: [] };
      const schemaByUrl = new Map((schema || []).map((s: any) => [s.url, s]));
      const newResults = pages.map((p: any) => { const item = stripLinks(p); const s = schemaByUrl.get(p.url); if (s) item._schema = s; return item; });
      const cap = typeof m.cap === "number" ? m.cap : selected.length;
      const grown = pages.length ? expandFrontier(selected, pages, m.projectDomain, cap) : selected; // spider: follow internal links
      const newCursor = job.cursor + next.length;
      const complete = newCursor >= grown.length;
      await db().from("crawl_jobs").update({ results: [...(job.results || []), ...newResults], broken: [...(job.broken || []), ...broken], meta: { ...m, selected: grown }, target_count: grown.length, cursor: newCursor, status: complete ? "complete" : "running", updated_at: new Date().toISOString() }).eq("id", jobId);
      return { success: true, jobId, done: newCursor, total: grown.length, complete };
    } catch (e: any) {
      return { success: false, error: e?.message || "crawl batch failed" };
    }
  }

  /* Build 12.38 — ingest a Semrush data sheet (numbers) as the data layer, replacing the API. */
  if (action === "semrush_ingest_sheet") {
    const projectId = String(body?.projectId || "").trim();
    const csvText = String(body?.csvText || (Array.isArray(body?.csvs) ? body.csvs[0]?.text : "") || "").trim();
    if (!projectId) return { success: false, error: "projectId is required." };
    if (!csvText) return { success: false, error: "Sheet content (csvText) is required." };
    try {
      const { ingestSemrushSheet } = await import("./semrush-intel.js");
      const r = await ingestSemrushSheet({ projectId, csvText, clientDomain: body?.clientDomain, competitors: Array.isArray(body?.competitors) ? body.competitors : [] });
      return r.success ? { success: true, client: r.client, competitors: r.competitors } : { success: false, error: r.error };
    } catch (e: any) {
      return { success: false, error: e?.message || "sheet ingestion failed" };
    }
  }

  /* Build 12.35 — create a project (+ client) from the chat details, so the
     wizard can switch to the correct client instead of running on the wrong one. */
  if (action === "wizard_create_project") {
    const name = String(body?.name || body?.domain || "").trim();
    const domain = String(body?.domain || "").trim();
    const userId = String(body?.userId || "").trim();
    if (!name) return { success: false, error: "A project name or domain is required." };
    try {
      const { db } = await import("./db.js");
      const { data: client, error: cErr } = await db().from("clients").insert({ name, company: name, email: "", website: domain || null }).select("id").single();
      if (cErr) return { success: false, error: cErr.message };
      const clientId = (client as any).id;
      const { data: project, error: pErr } = await db().from("projects").insert({ client_id: clientId, name, url: domain || null, status: "active", keywords: [] }).select("id").single();
      if (pErr) return { success: false, error: pErr.message };
      const projectId = (project as any).id;
      if (userId) {
        try {
          const { data: prof } = await db().from("profiles").select("id,client_id,client_ids").eq("id", userId).single();
          if (prof) {
            const existing: string[] = Array.isArray((prof as any).client_ids) ? (prof as any).client_ids : ((prof as any).client_id ? [(prof as any).client_id] : []);
            if (!existing.includes(clientId)) await db().from("profiles").update({ client_ids: [...existing, clientId], client_id: existing[0] || clientId }).eq("id", userId);
          }
        } catch { /* non-blocking */ }
      }
      try { const { seedV2DataRoom } = await import("./pm-dataroom-seed.js"); await seedV2DataRoom({ projectId }); } catch { /* non-blocking */ }
      return { success: true, projectId, clientId };
    } catch (e: any) {
      return { success: false, error: e?.message || "Could not create the project." };
    }
  }

  /* Build 12.33 — store the Semrush API key for authority/backlink/keyword pulls. */
  if (action === "semrush_save_key") {
    const projectId = String(body?.projectId || "").trim();
    const apiKey = String(body?.apiKey || "").trim();
    if (!projectId || !apiKey) return { success: false, error: "projectId and apiKey are required." };
    try {
      const { saveSemrushKey } = await import("./semrush-intel.js");
      const r = await saveSemrushKey(projectId, apiKey);
      return r.success ? { success: true } : { success: false, error: r.error };
    } catch (e: any) {
      return { success: false, error: e?.message || "save failed" };
    }
  }

  /* Build 12.31 — analyse uploaded documents against the brief's requirements. */
  if (action === "wizard_analyze_documents") {
    const projectId = String(body?.projectId || "").trim();
    if (!projectId) return { success: false, error: "projectId is required." };
    const requirements = Array.isArray(body?.requirements) ? body.requirements.map(String).filter(Boolean) : [];
    try {
      const { analyzeFromDocuments } = await import("./document-intelligence.js");
      const report = await analyzeFromDocuments({ projectId, requirements, clientName: body?.clientName });
      return { success: report.has_materials, report };
    } catch (e: any) {
      return { success: false, error: e?.message || "document analysis failed" };
    }
  }

  /* Build 12.30 — ingest operator/client materials (text-bearing files + pasted notes)
     so reports can be deepened with real provided data. */
  if (action === "wizard_ingest_materials") {
    const projectId = String(body?.projectId || "").trim();
    if (!projectId) return { success: false, error: "projectId is required." };
    const files = Array.isArray(body?.files) ? body.files : [];
    if (files.length === 0) return { success: false, error: "No files supplied." };
    try {
      const { ingestMaterials } = await import("./client-materials.js");
      const r = await ingestMaterials({ projectId, files, replace: Boolean(body?.replace) });
      return r.success ? { success: true, stored: r.stored, total_chars: r.total_chars, skipped: r.skipped } : { success: false, error: r.error || "No usable text found in the upload.", skipped: r.skipped };
    } catch (e: any) {
      return { success: false, error: e?.message || "materials ingestion failed" };
    }
  }

  /* Build 12.28 — ingest a Google Ads search-terms export for paid-vs-organic analysis. */
  if (action === "wizard_ingest_ads_csv") {
    const projectId = String(body?.projectId || "").trim();
    const csvText = String(body?.csvText || (Array.isArray(body?.csvs) ? body.csvs[0]?.text : "") || "").trim();
    if (!projectId) return { success: false, error: "projectId is required." };
    if (!csvText) return { success: false, error: "Ads CSV content (csvText or csvs[0].text) is required." };
    try {
      const { ingestAdsCsv } = await import("./paid-organic.js");
      const r = await ingestAdsCsv({ projectId, csvText, filename: body?.filename || (Array.isArray(body?.csvs) ? body.csvs[0]?.filename : undefined) });
      return r.success ? { success: true, terms: r.terms, note: r.note } : { success: false, error: r.error || r.note };
    } catch (e: any) {
      return { success: false, error: e?.message || "ads csv ingestion failed" };
    }
  }

  return null; // not a wizard action — let the caller fall through
}
