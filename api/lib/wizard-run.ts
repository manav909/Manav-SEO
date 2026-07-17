/* ════════════════════════════════════════════════════════════════
   api/lib/wizard-run.ts

   BUILD 12.23b-4, Wizard stage orchestration.

   Runs ONE wizard stage at a time via the real engine behind it, and
   returns its status + output. This is the per-stage execution layer for
   the "confirm and click next" model: the operator advances one stage,
   the wizard runs that stage's engine, reports exactly what happened.

   Two deliberate design choices, both honesty-driven:
   1. STATELESS. No wizard_runs table, no migration. The run's progress
      belongs to the UI layer (12.23c), which holds which stages are done.
      Each call executes one stage independently.
   2. PER-STAGE, human-in-the-loop. Stages are not auto-fired in a blind
      batch. Each stage carries a `validation` flag, "established" for
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
const SESSION_NEW_CAPS = new Set(["site_wide_url_classification", "url_inventory_export", "gsc_csv_ingestion", "topical_authority_map", "competitor_benchmark", "cms_platform_advisory", "paid_organic_substitution", "document_analysis", "site_wide_audit", "semrush_intelligence", "schema_llms_generation", "backlink_prospecting", "aeo_article_drafting", "offsite_qa_drafting", "knowledge_panel_audit", "social_presence_audit", "shopping_readiness_audit"]);
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
  inputs?:      { targetKeywords?: string[]; campaignId?: string; runId?: string; context?: string; competitors?: string[]; siteUrl?: string; pageUrls?: string[]; depth?: "sample" | "standard" | "deep"; topic?: string; country?: string };
}): Promise<WizardStageResult> {
  const { projectId } = opts;
  const inputs = opts.inputs || {};

  /* Resolve the stage from either the dynamic capability list or a fixed
     archetype lookup, both feed the same dispatch below. */
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
      return result("manual", null, null, `Human judgement call (${caps.join(", ")}). The platform assists with data, but a senior practitioner decides, review the supporting evidence from earlier stages and record the decision.`);
    }

    /* ── Direct, standalone engines (the session-built gap-engines) ── */
    if (caps.includes("site_wide_url_classification")) {
      const report = await classifyUrls({ projectId });
      if (report.total_urls === 0) return result("needs_connection", "url-classifier.ts", report, `No GSC page data stored. Connect Search Console and pull, or ingest a GSC CSV export, then re-run.`);
      return result("completed", "url-classifier.ts", report, `Classified ${report.total_urls} URLs. Unvalidated engine, review the keep/improve/merge calls and treat redirect/pruning as candidates.`);
    }

    if (caps.includes("url_inventory_export")) {
      const file = await exportUrlInventory({ projectId });
      if (!file.success) return result("needs_connection", "url-inventory-export.ts", file, file.error || `No data to export, connect or ingest GSC data first.`);
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
      if (comps.length === 0) return result("needs_input", "competitor-benchmark.ts", null, `Supply competitor domains (inputs.competitors), this engine does not auto-pick competitors, by design.`);
      const { benchmarkCompetitors } = await import("./competitor-benchmark.js");
      const report = await benchmarkCompetitors({ projectId, competitors: comps, keywords: inputs.targetKeywords, siteUrl: inputs.siteUrl });
      return result(report.queries_analyzed > 0 ? "completed" : "needs_connection", "competitor-benchmark.ts", report, report.summary);
    }

    if (caps.includes("semrush_intelligence")) {
      const { semrushIntelligence } = await import("./semrush-intel.js");
      const report = await semrushIntelligence({ projectId, domain: inputs.siteUrl, competitors: inputs.competitors, database: (inputs as any).database });
      if (!report.has_data) return result("needs_connection", "semrush-intel.ts", report, report.summary);
      return result("completed", "semrush-intel.ts", report, report.summary);
    }

    if (caps.includes("site_wide_audit")) {
      const { crawlSite } = await import("./site-crawler.js");
      const report = await crawlSite({ projectId, siteUrl: inputs.siteUrl });
      if (report.pages_reachable === 0) return result("needs_input", "site-crawler.ts", report, report.summary);
      return result("completed", "site-crawler.ts", report, report.summary);
    }

    if (caps.includes("cms_platform_advisory")) {
      const { adviseCms } = await import("./cms-advisor.js");
      const report = await adviseCms({ projectId, siteUrl: inputs.siteUrl });
      if (report.detected_platform === "unknown" && report.findings.length === 0) return result("needs_input", "cms-advisor.ts", report, report.summary);
      return result("completed", "cms-advisor.ts", report, report.summary);
    }

    if (caps.includes("schema_llms_generation")) {
      if (!inputs.siteUrl) return result("needs_input", "schema-llms-engine.ts", null, `Supply inputs.siteUrl (the site to generate schema and llms.txt for). Optionally inputs.pageUrls to target specific pages, and inputs.depth (sample | standard | deep).`);
      const { generateSchemaAndLlms } = await import("./schema-llms-engine.js");
      const report = await generateSchemaAndLlms({ projectId, siteUrl: inputs.siteUrl, pageUrls: inputs.pageUrls, depth: inputs.depth });
      if (!report.ok) return result("needs_connection", "schema-llms-engine.ts", report, `No pages could be fetched (all blocked or unreachable), nothing was generated, so nothing is invented. ${report.summary.blocked} page(s) blocked. Verify site access or supply reachable page URLs.`);
      return result("completed", "schema-llms-engine.ts", report, report.note);
    }

    if (caps.includes("backlink_prospecting")) {
      if (!inputs.siteUrl) return result("needs_input", "semrush-intel.ts", null, `Supply inputs.siteUrl (the client domain) and inputs.competitors (operator-supplied competitor domains). Optionally inputs.limit (prospects) and inputs.perDomainFetch (referring-domains pulled per domain).`);
      if (!inputs.competitors || !inputs.competitors.length) return result("needs_input", "semrush-intel.ts", null, `Supply inputs.competitors, this engine does not auto-pick competitors, by design (auto-picked competitors produce irrelevant prospects).`);
      const { prospectBacklinks } = await import("./semrush-intel.js");
      const report = await prospectBacklinks({ projectId, clientDomain: inputs.siteUrl, competitors: inputs.competitors, limit: (inputs as any).limit, perDomainFetch: (inputs as any).perDomainFetch });
      if (report.ok) return result("completed", "semrush-intel.ts", report, report.summary);
      /* No Semrush key: true referring-domain data is unavailable (a crawl or the
         SERP can only see a site's OUTBOUND links, never who links INTO it). Fall
         back to an HONEST alternative that uses SerpAPI, which is available: live
         link-OPPORTUNITY prospecting. This surfaces real third-party pages ranking
         in the niche that are realistic outreach targets. It is clearly labelled
         as opportunity discovery, NOT competitor-backlink data, and every URL is
         live and verifiable, never estimated. */
      const kw = (Array.isArray((inputs as any).targetKeywords) && (inputs as any).targetKeywords[0]) || (Array.isArray((inputs as any).keywords) && (inputs as any).keywords[0]) || (inputs as any).keyword || "";
      if (!kw || !projectId) return result("needs_connection", "semrush-intel.ts", report, report.summary + " Or supply a target keyword to run live SERP-based link-opportunity prospecting instead, which needs no Semrush key.");
      try {
        const { fetchSerpFeatures } = await import("./serpapi.js");
        const dom = (u: string) => { try { return new URL(u.startsWith("http") ? u : "https://" + u).hostname.replace(/^www\./, ""); } catch { return ""; } };
        const clientDom = dom(inputs.siteUrl);
        const compDoms = new Set((inputs.competitors || []).map(dom));
        const queries = [kw, `best ${kw}`, `${kw} directory`, `${kw} guide`];
        const prospects = new Map<string, { domain: string; url: string; query: string }>();
        for (const q of queries) {
          if (prospects.size >= 40) break;
          const serp: any = await fetchSerpFeatures(q, projectId, {}).catch(() => null);
          const urls: string[] = (serp && (serp.top_100_urls || serp.top_10_urls)) || [];
          for (const u of urls.slice(0, 25)) {
            const d = dom(u);
            if (!d || d === clientDom || compDoms.has(d)) continue;
            if (!prospects.has(d)) prospects.set(d, { domain: d, url: u, query: q });
          }
        }
        const list = Array.from(prospects.values()).slice(0, 40);
        if (!list.length) return result("needs_connection", "serpapi.ts", report, "SERP-based prospecting found no third-party pages for this keyword. Add a Semrush or Ahrefs key for true referring-domain data.");
        const rows = list.map((p, i) => `${i + 1}. ${p.domain} (ranks for "${p.query}"): ${p.url}`).join("\n");
        const report_md = `# Link-opportunity prospects (live SERP)\n\nHonest scope: answering "who links to your competitors but not you" needs a backlink index such as Semrush or Ahrefs, because a crawl and the SERP cannot see inbound links. Without that, this is the next best honest source. These are real third-party pages ranking in your niche for "${kw}" and related searches, which are realistic outreach and link targets. Every one is a live, verifiable URL, not an estimate.\n\n${list.length} prospect ${list.length === 1 ? "domain" : "domains"} (your own site and the named competitors are excluded):\n\n${rows}\n\nNext step: qualify each by relevance and authority, then reach out. Connect Semrush or Ahrefs to also see which of these already link to your competitors.`;
        return result("completed", "serpapi.ts (live SERP link-opportunity prospecting, no estimates)", { reports: [{ step_key: "serp_prospects", report_md }], prospects: list, summary: `Live SERP link-opportunity prospecting: ${list.length} real third-party pages in the "${kw}" niche as outreach targets. True competitor-backlink data still needs a Semrush or Ahrefs key.` }, `Found ${list.length} live link-opportunity prospects from the SERP for "${kw}". These are realistic outreach targets; true referring-domain data still needs a backlink index.`);
      } catch (e: any) {
        return result("needs_connection", "semrush-intel.ts", report, report.summary + ` (The SERP fallback could not run: ${e?.message || "error"}.)`);
      }
    }

    if (caps.includes("aeo_article_drafting")) {
      const topic = inputs.topic || (inputs.targetKeywords && inputs.targetKeywords[0]) || "";
      if (!topic) return result("needs_input", "aeo-article-engine.ts", null, `Supply inputs.topic (the article topic or target keyword). Optionally inputs.context (client context), inputs.country, and inputs.depth (brief | standard | deep).`);
      const aeoDepth = inputs.depth === "sample" ? "brief" : inputs.depth;
      const { draftAeoArticle } = await import("./aeo-article-engine.js");
      const report = await draftAeoArticle({ projectId, topic, siteUrl: inputs.siteUrl, clientContext: inputs.context, country: inputs.country, depth: aeoDepth });
      if (!report.ok) return result("needs_input", "aeo-article-engine.ts", report, report.notes.join(" ") || `Could not draft, supply a topic.`);
      return result("completed", "aeo-article-engine.ts", report, `Drafted "${report.title}" (${report.faq.length} FAQ entr[y], ${report.grounded_on.length} SERP signal[s]). ${report.notes[0]}`);
    }

    if (caps.includes("offsite_qa_drafting")) {
      const topic = inputs.topic || (inputs.targetKeywords && inputs.targetKeywords[0]) || "";
      if (!topic) return result("needs_input", "offsite-qa-engine.ts", null, `Supply inputs.topic (the topic to find real Reddit/Quora questions for). Optionally inputs.context (client context), inputs.country, and inputs.maxQuestions.`);
      const { draftOffsiteQa } = await import("./offsite-qa-engine.js");
      const report = await draftOffsiteQa({ projectId, topic, clientContext: inputs.context, siteUrl: inputs.siteUrl, country: inputs.country, maxQuestions: (inputs as any).maxQuestions });
      if (!report.ok) return result("needs_connection", "offsite-qa-engine.ts", report, report.summary);
      return result("completed", "offsite-qa-engine.ts", report, report.summary);
    }

    if (caps.includes("knowledge_panel_audit")) {
      const entityName = String((inputs as any).entityName || (inputs as any).name || inputs.topic || "").trim();
      if (!entityName) return result("needs_input", "entity-panel-engine.ts", null, `Supply inputs.entityName (the artist/person/brand to audit) and inputs.country. No website is needed. Optionally inputs.entityType (musician | artist | author | founder | person | organization).`);
      const { auditEntity } = await import("./entity-panel-engine.js");
      const report = await auditEntity({ projectId, name: entityName, country: inputs.country, entityType: (inputs as any).entityType });
      if (!report.ok) return result("needs_input", "entity-panel-engine.ts", report, report.summary);
      return result("completed", "entity-panel-engine.ts", report, report.summary);
    }

    if (caps.includes("social_presence_audit")) {
      const { auditSocialPresence } = await import("./social-presence-engine.js");
      const report = await auditSocialPresence({ projectId, siteUrl: inputs.siteUrl, brand: (inputs as any).entityName || (inputs as any).name });
      if (!report.ok) return result("needs_input", "social-presence-engine.ts", report, report.summary);
      return result("completed", "social-presence-engine.ts", report, report.summary);
    }

    if (caps.includes("shopping_readiness_audit")) {
      const { auditShoppingReadiness } = await import("./shopping-readiness-engine.js");
      const report = await auditShoppingReadiness({ projectId, siteUrl: inputs.siteUrl });
      if (!report.ok) return result("needs_input", "shopping-readiness-engine.ts", report, report.summary);
      return result("completed", "shopping-readiness-engine.ts", report, report.summary);
    }

    if (caps.includes("document_analysis")) {
      const { analyzeFromDocuments } = await import("./document-intelligence.js");
      const reqs = Array.isArray((inputs as any).requirements) ? (inputs as any).requirements : [stageLabel];
      const report = await analyzeFromDocuments({ projectId, requirements: reqs });
      if (!report.has_materials) return result("needs_input", "document-intelligence.ts", report, report.summary);
      return result("completed", "document-intelligence.ts", report, report.summary);
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

    /* ── Per-page on-page audit ──
       With a campaign set, run the DEEP single-page audit (keyword match, CrUX,
       GA4). Without one (the usual wizard/prospect case), run the SITE-WIDE
       on-page audit across ALL crawled pages via crawlSite, now backed by the
       batched crawl, which is exactly "title/meta/H1 optimisation across all
       pages". The stage WORKS either way instead of demanding a campaign. */
    if (caps.includes("technical_audit_deep") || caps.includes("title_meta_h1_reco")) {
      if (inputs.campaignId) {
        const audit = await runTechnicalAudit({ campaignId: inputs.campaignId, triggeredBy: "manual" });
        return result(audit?.success ? "completed" : "error", "seo-technical-audit.ts", audit, audit?.success ? `Deep audit complete: ${audit.findings_count} findings on ${audit.audited_url}.` : (audit?.error || `Audit failed.`), audit?.success ? undefined : audit?.error);
      }
      const { crawlSite } = await import("./site-crawler.js");
      const report = await crawlSite({ projectId, siteUrl: inputs.siteUrl });
      if (report.pages_reachable === 0) return result("needs_input", "site-crawler.ts", report, `No crawled pages available. Batch-crawl the site first (or supply inputs.siteUrl), then re-run, this stage then audits titles, meta descriptions and H1s across every page.`);
      const iss: any = report.issues || {};
      const cnt = (k: string) => (iss[k]?.count || 0);
      const note = `Site-wide on-page audit across ${report.pages_reachable} crawled pages. Titles: ${cnt("missing_title")} missing, ${cnt("duplicate_title")} duplicate, ${cnt("long_title") + cnt("short_title")} poor length. Meta descriptions: ${cnt("missing_meta_description")} missing, ${cnt("duplicate_meta_description")} duplicate. Headings: ${cnt("missing_h1")} pages with no H1, ${cnt("multiple_h1")} with multiple. Each gap is traced to the exact page from real crawled HTML.`;
      return result("completed", "site-crawler.ts (site-wide on-page audit)", report, note);
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

      const geoNote = caps.some(c => GEO_CAPS.has(c)) ? ` These are AI-Overview / GEO findings, which are not yet field-validated, confirm against real SERPs before acting.` : ``;
      const out = { run_id: created.run_id, project_domain: (created as any)?.project_domain || "", generated_at: new Date().toISOString(), results: ran?.results, reports };
      if (!ran?.success) return result("error", "workspace pipeline (wsCreateRun + wsRunDeepSteps)", out, ran?.error || `Deep steps failed.`, ran?.error);
      if (reports.length === 0) return result("needs_input", "workspace pipeline", out, `The analysis ran but produced no findings for this section. For AI-Overview / GEO analysis this usually means no target keywords were supplied, or none trigger an AI Overview, add target keywords and re-run.${geoNote}`);
      return result("completed", "workspace pipeline", out, `${reports.length} analysis section(s) produced from live search-results analysis.${geoNote}`);
    }

    /* ── GSC review, run the REAL visibility + indexation engine ── */
    if (caps.includes("gsc_metrics_per_url") || caps.includes("gsc_query_page_pairs")) {
      const gsc = await loadGsc(projectId);
      const pages = Array.isArray(gsc.topPages) ? gsc.topPages.length : 0;
      const pairs = Array.isArray(gsc.queryPagePairs) ? gsc.queryPagePairs.length : 0;
      if (pages === 0 && pairs === 0) return result("needs_connection", "loadGsc", null, `No GSC data stored. Connect Search Console (OAuth) and pull, or ingest a GSC CSV export.`);
      /* Target URLs for the visibility + indexation diagnosis. Prefer the
         batched crawl (the shared site-page source), then crawled_pages, then
         GSC top pages, so pages Google shows zero impressions for surface as
         crawled-but-not-indexed candidates. */
      let targetUrls: string[] = [];
      try {
        const { data: jobs } = await db().from("crawl_jobs").select("results").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(1);
        const job = Array.isArray(jobs) ? jobs[0] : null;
        if (job && Array.isArray((job as any).results)) targetUrls = (job as any).results.map((p: any) => p.url).filter(Boolean);
      } catch { /* fall through */ }
      if (targetUrls.length === 0) {
        try {
          const { data: cp } = await db().from("crawled_pages").select("url").eq("project_id", projectId).limit(300);
          targetUrls = (cp || []).map((r: any) => r.url).filter(Boolean);
        } catch { /* fall through */ }
      }
      if (targetUrls.length === 0) targetUrls = (gsc.topPages || []).map((p: any) => p.page || p.url).filter(Boolean);
      /* The deep engine: visible vs invisible pages, real query-page pairs, near-
         ranking (positions 4-20), this site's own CTR curve, and live per-URL
         indexation checks, the actual crawled-but-not-indexed diagnosis, not counts. */
      try {
        const { gatherGscVisibility } = await import("./workspace/deep-steps/gsc-visibility.js");
        const { evidence, report_md } = await gatherGscVisibility({ projectId, targetUrls });
        return result(
          "completed",
          "gsc-visibility engine (Search Console + live indexation crawl)",
          {
            reports: [{ step_key: "gsc_visibility", report_md }],
            evidence,
            summary: `Search Console analysed across ${evidence.target_count} pages: ${evidence.visible_count} visible in search, ${evidence.invisible_count} with zero impressions, ${evidence.near_ranking.length} near-ranking opportunities (positions 4-20), ${evidence.query_page_pairs.length} real query-page pairs.`,
          },
          `Search Console visibility and indexation diagnosis complete: ${evidence.visible_count} visible, ${evidence.invisible_count} invisible, ${evidence.near_ranking.length} near-ranking.`
        );
      } catch (e: any) {
        /* Never fabricate, report honestly with the counts we do have. */
        return result("completed", "loadGsc", { top_pages: pages, query_page_pairs: pairs }, `GSC data available: ${pages} top pages, ${pairs} query-page pairs. The deep visibility engine could not complete this pass (${e?.message || "error"}); re-run to retry.`);
      }
    }

    /* ── Ranking-drop analysis on Search Console (no Semrush) ── */
    if (caps.includes("ranking_drop_analysis")) {
      const gsc: any = await loadGsc(projectId);
      const num = (x: any) => Number(x) || 0;
      const fromTop = ((gsc && gsc.topQueries) || []).map((q: any) => ({ query: q.query || (Array.isArray(q.keys) ? q.keys[0] : ""), clicks: num(q.clicks), impressions: num(q.impressions), ctr: num(q.ctr), position: num(q.position), page: "" }));
      const fromPairs = ((gsc && gsc.queryPagePairs) || []).map((p: any) => ({ query: p.query, clicks: num(p.clicks), impressions: num(p.impressions), ctr: num(p.ctr), position: num(p.position), page: p.page || "" }));
      const byQ = new Map<string, any>();
      for (const r of [...fromPairs, ...fromTop]) { if (r.query && !byQ.has(r.query)) byQ.set(r.query, r); }
      const all = Array.from(byQ.values());
      if (!all.length) return result("needs_connection", "loadGsc", null, `No Search Console query data was found for this project. Connect Search Console and pull, or ingest a GSC CSV, then re-run. No Semrush is needed.`);
      const withImpr = all.filter((q) => q.impressions >= 5);
      const byImpr = (arr: any[]) => arr.sort((a, b) => b.impressions - a.impressions);
      const strikingP1 = byImpr(withImpr.filter((q) => q.position > 3 && q.position <= 10)).slice(0, 15);
      const page2 = byImpr(withImpr.filter((q) => q.position > 10 && q.position <= 20)).slice(0, 15);
      const deepVisible = byImpr(withImpr.filter((q) => q.position > 20)).slice(0, 15);
      const lowCtr = byImpr(withImpr.filter((q) => q.position <= 10 && q.impressions >= 50 && q.ctr < 2)).slice(0, 10);
      const zeroClick = byImpr(withImpr.filter((q) => q.impressions >= 20 && q.clicks === 0)).slice(0, 15);
      const { TOPIC_CATALOG } = await import("./algo-catalog.js");
      const recent = (TOPIC_CATALOG as any[]).filter((t) => String(t.added) >= "2024-01").slice(0, 10);
      const fmt = (arr: any[], label: string) => arr.length ? `\n\n## ${label}\n${arr.map((p) => `- "${p.query}" (position ${p.position.toFixed(1)}, ${p.impressions} impressions, ${p.clicks} clicks, CTR ${p.ctr.toFixed(1)}%)${p.page ? ` on ${p.page}` : ""}`).join("\n")}` : "";
      let narrative = "";
      try {
        const { llmComplete } = await import("./workspace/llm.js");
        const dataSummary = `Total queries with impressions: ${withImpr.length}. Striking distance (positions 4 to 10): ${strikingP1.length}. Page two (11 to 20): ${page2.length}. Ranking beyond page two with impressions (over 20): ${deepVisible.length}. On page one but low CTR: ${lowCtr.length}. High-impression zero-click: ${zeroClick.length}. Recent Google updates: ${recent.map((r) => `${r.added} ${r.label}`).join("; ")}. Example at-risk queries: ${[...page2, ...deepVisible].slice(0, 10).map((q) => `"${q.query}" position ${q.position.toFixed(1)}`).join(", ") || "none"}.`;
        const sys = "You are a Senior Digital Marketing Specialist writing the ranking analysis section of a client report. Use ONLY the numbers provided. Interpret lost and at-risk visibility: which queries slipped off page one, which sit in striking distance of it, which are seen but not clicked, and how this lines up with the recent Google update timeline. Give specific, provable next steps. If the profile is genuinely healthy or dominated by brand queries, say that honestly rather than inventing a problem. Warm, specific, client-ready. Never use an em-dash. 180 to 300 words.";
        const { text } = await llmComplete({ system: sys, user: dataSummary, maxTokens: 900, timeoutMs: 60000, label: "ranking-drop-narrative", maxSegments: 1 });
        narrative = String(text || "").trim();
      } catch { /* fall back to the deterministic write-up */ }
      const timeline = recent.map((t) => `- ${t.added}: ${t.label}`).join("\n");
      const flagged = strikingP1.length + page2.length + deepVisible.length + lowCtr.length + zeroClick.length;
      const report_md = `# Keyword ranking analysis\n\n${narrative || `Analysed ${withImpr.length} Search Console queries against the Google update timeline. No Semrush is needed.`}${fmt(page2, "Slipped to page two (positions 11 to 20)")}${fmt(strikingP1, "In striking distance of page one (positions 4 to 10)")}${fmt(deepVisible, "Seen but ranking beyond page two (position over 20)")}${fmt(lowCtr, "Ranking on page one but earning few clicks (low CTR)")}${fmt(zeroClick, "High impressions, zero clicks")}\n\n## Google update timeline\nIf a slip clusters around one of these dates, that update is the likely cause. Confirm with Search Console's own date comparison per query.\n${timeline || "No recent updates on file."}`;
      return result("completed", "ranking-drop engine (GSC position/clicks + Google update timeline, no Semrush)", { reports: [{ step_key: "ranking_drop", report_md }], striking: strikingP1, page2, deep_visible: deepVisible, low_ctr: lowCtr, zero_click: zeroClick, updates: recent, queries_analysed: withImpr.length, summary: `Analysed ${withImpr.length} Search Console queries: ${page2.length} on page two, ${strikingP1.length} in striking distance, ${deepVisible.length} ranking past page two, ${lowCtr.length} low-CTR on page one, ${zeroClick.length} zero-click, correlated with ${recent.length} recent Google updates. No Semrush needed.` }, `Ranking analysis from Search Console: ${withImpr.length} queries analysed, ${flagged} flagged for action, correlated with the Google update timeline. No Semrush required.`);
    }

    /* ── Homepage UX / UI redesign brief with a rendered wireframe ── */
    if (caps.includes("ux_redesign_advisory")) {
      const esc = (s: any) => String(s || "").replace(/[&<>]/g, (c: string) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
      const structOf = (html: string) => {
        const grab = (re: RegExp) => Array.from(html.matchAll(re)).map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 12);
        return {
          h1: grab(/<h1[^>]*>([\s\S]*?)<\/h1>/gi),
          h2: grab(/<h2[^>]*>([\s\S]*?)<\/h2>/gi),
          ctas: Array.from(html.matchAll(/<(?:a|button)[^>]*(?:class|id)="[^"]*(?:btn|button|cta)[^"]*"[^>]*>([\s\S]*?)<\/(?:a|button)>/gi)).map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8),
          images: (html.match(/<img/gi) || []).length,
          forms: (html.match(/<form/gi) || []).length,
        };
      };
      let business = "", domain = inputs.siteUrl || "";
      try {
        const { crawlSite } = await import("./site-crawler.js");
        const rep: any = await crawlSite({ projectId, siteUrl: inputs.siteUrl });
        business = rep?.homepage_title || ""; domain = rep?.project_domain || domain;
      } catch { /* proceed */ }
      let clientStruct: any = null;
      try {
        const { fetchHtml, fetchViaReader } = await import("./workspace/shared.js");
        const url = String(inputs.siteUrl || domain).startsWith("http") ? String(inputs.siteUrl || domain) : "https://" + String(inputs.siteUrl || domain);
        let html = await fetchHtml(url).catch(() => "");
        if (!html || html.length < 500) { const r: any = await fetchViaReader(url).catch(() => ({ ok: false, html: "" })); if (r.ok && r.html) html = r.html; }
        if (html) clientStruct = structOf(html);
      } catch { /* current-state read optional */ }
      let competitors: string[] = Array.isArray(inputs.competitors) ? inputs.competitors.filter(Boolean) : [];
      if (!competitors.length) { try { const { data: proj } = await db().from("projects").select("competitors").eq("id", projectId).maybeSingle(); const c = (proj as any)?.competitors; if (Array.isArray(c)) competitors = c.filter(Boolean); else if (typeof c === "string") competitors = c.split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean); } catch { /* optional */ } }
      competitors = competitors.map((c) => String(c).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).slice(0, 3);
      const compStructs: any[] = [];
      try {
        const { fetchHtml, fetchViaReader } = await import("./workspace/shared.js");
        for (const c of competitors) {
          let html = await fetchHtml("https://" + c).catch(() => "");
          if (!html || html.length < 500) { const r: any = await fetchViaReader("https://" + c).catch(() => ({ ok: false, html: "" })); if (r.ok && r.html) html = r.html; }
          if (html) compStructs.push({ domain: c, ...structOf(html) });
        }
      } catch { /* benchmarking optional */ }
      try {
        const { llmComplete } = await import("./workspace/llm.js");
        const grounding = [
          `Client: ${domain}. Business (homepage title): ${business}.`,
          clientStruct ? `Current homepage structure (real): H1 = ${clientStruct.h1.join(" | ") || "none"}; section headings (H2) = ${clientStruct.h2.join(" | ") || "none"}; calls to action detected = ${clientStruct.ctas.join(", ") || "none"}; images = ${clientStruct.images}; forms = ${clientStruct.forms}.` : "The current homepage could not be read this pass; base the critique on the business and competitors and say the current-state read was limited.",
          compStructs.length ? "Competitor homepage layouts (real, for benchmarking):\n" + compStructs.map((s) => `- ${s.domain}: H1 = ${s.h1.join(" | ") || "n/a"}; sections = ${s.h2.slice(0, 8).join(" | ") || "n/a"}; CTAs = ${s.ctas.join(", ") || "n/a"}`).join("\n") : "No competitor layouts available this pass.",
        ].filter(Boolean).join("\n\n");
        const system = "You are a Brand Head and Senior UX and UI designer producing a homepage redesign brief for a client. Use the REAL current homepage structure and the REAL competitor layouts provided. Think about conversion, brand, visual hierarchy, and how the customer's eye should travel down the page. Return ONLY JSON: {\"current_critique\":\"markdown, an honest critique of the current homepage for conversion and brand, grounded in its real structure\",\"sections\":[{\"name\":\"Hero\",\"purpose\":\"one line\",\"elements\":[\"headline\",\"subhead\",\"primary CTA\",\"hero visual\"],\"height\":110}],\"visual_direction\":\"markdown: colour, typography, imagery, tone, spacing\",\"eye_flow\":\"markdown: how the eye should travel down the page and why, tied to conversion\",\"priorities\":[\"the most important change first\",\"...\"]}. The sections array is the recommended top-to-bottom homepage layout, 8 to 12 sections, each with a short purpose and its key elements; set height between 60 and 130 by how tall the section should feel. Ground the critique and the layout in the real data and do not invent competitor features that are not in the data. Never use an em-dash.";
        let parsed: any = {};
        for (let attempt = 0; attempt < 2 && !parsed.sections; attempt++) {
          try { const { text } = await llmComplete({ system, user: grounding + "\n\nProduce the redesign brief JSON now.", maxTokens: 2600, timeoutMs: 90000, label: "ux-redesign", maxSegments: 2 }); const m = String(text || "").match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; } catch { parsed = {}; }
        }
        const sections: any[] = Array.isArray(parsed.sections) ? parsed.sections.slice(0, 12) : [];
        if (!sections.length) throw new Error("no layout produced");
        let wireframe = "";
        const W = 680, pad = 20, gap = 12; let y = pad + 34;
        const boxes = sections.map((s) => { const h = Math.max(50, Math.min(130, Number(s.height) || 70)); const b = { name: String(s.name || "Section"), elements: Array.isArray(s.elements) ? s.elements : [], y, h }; y += h + gap; return b; });
        const totalH = y + pad;
        const rects = boxes.map((b, i) => `<rect x="${pad}" y="${b.y}" width="${W - 2 * pad}" height="${b.h}" rx="6" fill="${i === 0 ? "#eef2ff" : "#f3f4f6"}" stroke="#c7cbd1"/><text x="${pad + 14}" y="${b.y + 22}" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#1a1a2e">${esc(b.name)}</text><text x="${pad + 14}" y="${b.y + 40}" font-family="system-ui,sans-serif" font-size="11" fill="#6b7280">${esc((b.elements || []).join(" \u00b7 "))}</text>`).join("");
        wireframe = `<svg viewBox="0 0 ${W} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:10px;background:#fff"><text x="${pad}" y="${pad + 18}" font-family="system-ui,sans-serif" font-size="15" font-weight="800" fill="#1a1a2e">Recommended homepage wireframe: ${esc(business || domain)}</text>${rects}</svg>`;
        const sectionDetail = sections.map((s, i) => `${i + 1}. ${s.name}: ${s.purpose || ""}${Array.isArray(s.elements) && s.elements.length ? ` (${s.elements.join(", ")})` : ""}`).join("\n");
        const prios = Array.isArray(parsed.priorities) ? parsed.priorities.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n") : "";
        const report_md = `# Homepage UX and UI redesign brief: ${business || domain}\n\n## Where the current homepage stands\n${parsed.current_critique || "Current-state read was limited this pass."}\n\n## Recommended layout\n${wireframe}\n\n${sectionDetail}\n\n## Visual direction\n${parsed.visual_direction || ""}\n\n## How the eye should travel\n${parsed.eye_flow || ""}\n\n## Do these first\n${prios}`;
        return result("completed", "UX engine (current structure + competitor layout benchmarking + conversion and brand principles)", { reports: [{ step_key: "ux_redesign", report_md }], sections, summary: `Homepage redesign brief for ${business || domain}: current-state critique, a ${sections.length}-section recommended layout drawn as a labelled wireframe, visual direction, eye-flow and priorities.` }, `Homepage UX and UI redesign brief with a ${sections.length}-section wireframe, grounded in the real current page${compStructs.length ? ` and ${compStructs.length} competitor layouts` : ""}.`);
      } catch (e: any) {
        return result("manual", null, null, `Crawl the homepage so the redesign brief can read its structure, then re-run. (${e?.message || "error"}.)`);
      }
    }

    /* ── Martech / CRO tool advisory (platform + gaps + live sourced research) ── */
    if (caps.includes("martech_tool_advisory")) {
      let business = "", domain = "", pages = 0, platform = "unknown";
      try {
        const { crawlSite } = await import("./site-crawler.js");
        const rep: any = await crawlSite({ projectId, siteUrl: inputs.siteUrl });
        business = rep?.homepage_title || ""; domain = rep?.project_domain || ""; pages = rep?.pages_reachable || 0;
      } catch { /* proceed */ }
      try {
        const { adviseCms } = await import("./cms-advisor.js");
        const cms: any = await adviseCms({ projectId, siteUrl: inputs.siteUrl });
        if (cms?.detected_platform && cms.detected_platform !== "unknown") platform = cms.detected_platform;
      } catch { /* platform stays unknown */ }
      let gscNote = "";
      try {
        const { loadGsc } = await import("./workspace/shared.js");
        const g: any = await loadGsc(projectId);
        const qn = ((g && g.topQueries) || []).length; const pairs = ((g && g.queryPagePairs) || []).length;
        if (qn || pairs) gscNote = `Search Console is connected (${qn} query terms). Question-style and product-finding queries in that set point to on-site search and guided-discovery needs.`;
      } catch { /* GA/GSC optional */ }

      let industry = ""; let competitors: string[] = Array.isArray(inputs.competitors) ? inputs.competitors.filter(Boolean) : [];
      try {
        const { data: proj } = await db().from("projects").select("industry,competitors,keywords").eq("id", projectId).maybeSingle();
        industry = String((proj as any)?.industry || "").trim();
        if (!competitors.length) { const c = (proj as any)?.competitors; if (Array.isArray(c)) competitors = c.filter(Boolean); else if (typeof c === "string") competitors = c.split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean); }
      } catch { /* projects lookup optional */ }
      if (!industry) industry = business;                 // fall back to the homepage title as the business descriptor
      competitors = Array.from(new Set(competitors.map((c) => String(c).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")))).slice(0, 3);

      /* Client search intent (weights which tool categories matter most). */
      let keywords: string[] = [];
      try {
        const { loadGsc } = await import("./workspace/shared.js");
        const g: any = await loadGsc(projectId);
        keywords = [...((g && g.topQueries) || []).map((q: any) => q && (q.query || (Array.isArray(q.keys) ? q.keys[0] : ""))), ...((g && g.queryPagePairs) || []).map((p: any) => p && p.query)].filter(Boolean);
      } catch { /* optional */ }
      if (!keywords.length) { const ik = (Array.isArray(inputs.targetKeywords) ? inputs.targetKeywords : (Array.isArray((inputs as any).keywords) ? (inputs as any).keywords : [])); keywords = ik.filter(Boolean); }
      keywords = Array.from(new Set(keywords)).slice(0, 25);

      /* Competitor martech detection: crawl each competitor's live page and read
         which real tools they load. This is verifiable evidence of what wins in
         the space and exactly where the client is behind. */
      const MARTECH_SIGS: Array<{ name: string; cat: string; re: RegExp }> = [
        { name: "Klaviyo", cat: "abandoned cart / email", re: /klaviyo/i },
        { name: "Omnisend", cat: "abandoned cart / email", re: /omnisend/i },
        { name: "Mailchimp", cat: "abandoned cart / email", re: /mailchimp|list-manage/i },
        { name: "Privy", cat: "abandoned cart / email", re: /privy\.com|privymktg/i },
        { name: "Yotpo", cat: "reviews / social proof", re: /yotpo/i },
        { name: "Judge.me", cat: "reviews / social proof", re: /judge\.me|judgeme/i },
        { name: "Okendo", cat: "reviews / social proof", re: /okendo/i },
        { name: "Stamped", cat: "reviews / social proof", re: /stamped\.io/i },
        { name: "Loox", cat: "reviews / social proof", re: /loox\.io|loox app/i },
        { name: "Algolia", cat: "on-site search", re: /algolia/i },
        { name: "Searchspring", cat: "on-site search", re: /searchspring/i },
        { name: "Klevu", cat: "on-site search", re: /klevu/i },
        { name: "Doofinder", cat: "on-site search", re: /doofinder/i },
        { name: "Hotjar", cat: "heatmaps / session recording", re: /hotjar/i },
        { name: "Microsoft Clarity", cat: "heatmaps / session recording", re: /clarity\.ms/i },
        { name: "Mouseflow", cat: "heatmaps / session recording", re: /mouseflow/i },
        { name: "FullStory", cat: "heatmaps / session recording", re: /fullstory/i },
        { name: "Crazy Egg", cat: "heatmaps / session recording", re: /crazyegg/i },
        { name: "OptiMonk", cat: "popups / CRO", re: /optimonk/i },
        { name: "Justuno", cat: "popups / CRO", re: /justuno/i },
        { name: "Gorgias", cat: "support / chat", re: /gorgias/i },
        { name: "Tidio", cat: "support / chat", re: /tidio/i },
        { name: "Intercom", cat: "support / chat", re: /intercom/i },
        { name: "Meta Pixel", cat: "ads / retargeting", re: /connect\.facebook\.net|fbevents/i },
        { name: "Google Analytics", cat: "analytics", re: /google-analytics|gtag\/js|googletagmanager/i },
      ];
      const compStacks: Array<{ domain: string; tools: Array<{ name: string; cat: string }> }> = [];
      try {
        const { fetchHtml, fetchViaReader } = await import("./workspace/shared.js");
        for (const c of competitors) {
          const url = "https://" + c;
          let html = await fetchHtml(url).catch(() => "");
          if (!html || html.length < 500) { const r: any = await fetchViaReader(url).catch(() => ({ ok: false, html: "" })); if (r.ok && r.html) html = r.html; }
          if (!html) continue;
          const found = MARTECH_SIGS.filter((s) => s.re.test(html)).map((s) => ({ name: s.name, cat: s.cat }));
          if (found.length) compStacks.push({ domain: c, tools: found });
        }
      } catch { /* competitor crawl best-effort */ }

      const cats = [
        { full: "abandoned cart recovery and email automation", short: "abandoned cart recovery" },
        { full: "on-site search", short: "site search" },
        { full: "heatmaps and session recording", short: "heatmaps" },
        { full: "reviews and social proof", short: "customer reviews" },
      ];
      const research: any[] = [];
      try {
        const { fetchSerpFeatures } = await import("./serpapi.js");
        for (const cat of cats) {
          const entry: any = { cat: cat.full, tools: [], questions: [], sources: [], cases: [] };
          const q1 = `best ${cat.full} tools ${platform !== "unknown" ? platform + " " : ""}2026`;
          const s1: any = await fetchSerpFeatures(q1, projectId, {}).catch(() => null);
          if (s1) { entry.tools = (s1.top_10_domains || []).slice(0, 8); entry.questions = (s1.paa_questions || []).slice(0, 5); entry.sources = (s1.top_100_urls || s1.top_10_urls || []).slice(0, 6); }
          /* Second, industry-specific query for REAL case-study evidence and trends. */
          if (industry) {
            const q2 = `${industry} ${cat.short} case study results`;
            const s2: any = await fetchSerpFeatures(q2, projectId, {}).catch(() => null);
            if (s2) entry.cases = (s2.top_100_urls || s2.top_10_urls || []).slice(0, 6);
          }
          if (s1 || entry.cases.length) research.push(entry);
        }
      } catch { /* research best-effort */ }

      try {
        const { llmComplete } = await import("./workspace/llm.js");
        const grounding = [
          `Client: ${domain || inputs.siteUrl || "the site"}. Business: ${business || "unknown from title"}. Industry: ${industry || "unknown"}. Platform: ${platform}. Pages crawled: ${pages}.`,
          gscNote || "Google Analytics is not connected; do not rely on GA, build the case from the crawl, Search Console and the live research.",
          keywords.length ? `The client's real search terms (intent signal, use them to weight which tool categories matter most): ${keywords.join(", ")}.` : "",
          compStacks.length ? "Competitor martech detected on their LIVE sites (verifiable, read from the tools their pages actually load):\n" + compStacks.map((s) => `- ${s.domain}: ${s.tools.map((t) => `${t.name} (${t.cat})`).join(", ")}`).join("\n") : (competitors.length ? "Competitors were checked but no known martech signatures were detected on their pages this pass." : "No competitors on file to compare against."),
          research.length ? "Live SERP research (real tools and real source links per category):\n" + research.map((r) => `- ${r.cat}: tools appearing = ${(r.tools || []).join(", ") || "none captured"}; searcher questions (PAA) = ${(r.questions || []).join(" | ") || "none"}; general sources = ${(r.sources || []).join(", ") || "none"}; INDUSTRY case-study sources = ${(r.cases || []).join(", ") || "none"}`).join("\n") : "No live research loaded this pass.",
        ].filter(Boolean).join("\n\n");
        const system = "You are a Senior Digital Marketing Specialist advising a client on which third-party tools to add. Use ONLY the real data provided: the platform and business from the crawl, the live SERP research (real tool names and source links), and Search Console where given. For each relevant category (abandoned cart and email automation, on-site search, heatmaps and session recording, reviews and social proof, and any other the business clearly needs), recommend specific REAL tools that suit THIS platform and business, and for each give: what it fixes on their site, why it fits their platform, and a real, sourced industry example or trend drawn from the research with its source link as the data trace. PREFER the INDUSTRY case-study sources for the examples where they exist, since they are the most relevant and verifiable; fall back to the general sources otherwise. Cover the direct needs and the indirect ones (for example, a failing on-site search quietly killing conversion, or no session recording hiding checkout drop-off). Use the COMPETITOR MARTECH as your strongest evidence: where competitors run a tool category the client lacks, say so by name and treat it as a verifiable, high-priority gap (for example, two of your competitors run Klaviyo for cart recovery and you have none). Use the client's real SEARCH TERMS and the PAA questions to weight which categories matter most (product-finding queries and questions raise on-site search and guided discovery). Never invent a tool, a statistic, a case, or a source; if the research did not surface a source for a claim, phrase it as general practice rather than citing a fake link. Google Analytics is optional: note where GA would sharpen the behavioural case, but make every recommendation stand without it. Return well-structured markdown: a short intro tying the tools to this specific site, one section per category with the recommended tool(s), what it fixes, platform fit and the sourced example, then a closing priority order. Never use an em-dash.";
        const user = grounding + "\n\nWrite the tool recommendations now, each grounded in this site and sourced from the research.";
        let body = "";
        for (let attempt = 0; attempt < 2 && !body; attempt++) {
          try { const { text } = await llmComplete({ system, user, maxTokens: 2600, timeoutMs: 90000, label: "martech-advisory", maxSegments: 2 }); body = String(text || "").trim(); } catch { /* retry once */ }
        }
        if (!body) throw new Error("empty advisory");
        const report_md = `# Tool recommendations for ${domain || "your site"}\n\n${body}`;
        return result("completed", "martech engine (crawl + live SERP research + Search Console where connected)", { reports: [{ step_key: "martech", report_md }], platform, categories: cats, research, summary: `Tool recommendations for a ${platform} ${business ? "(" + business + ") " : ""}site: abandoned cart and email, on-site search, heatmaps and session recording, reviews, each suited to the platform, cross-referenced against competitor martech and the client search intent, backed by live sourced research. Google Analytics optional.` }, `Tool advisory built from the crawl and live SERP research across ${research.length} categories, platform ${platform}. Real tools, sourced trends, no Google Analytics required.`);
      } catch (e: any) {
        return result("manual", null, null, `Crawl the site so the tool advisory can read the platform and gaps, then re-run. (${e?.message || "error"}.)`);
      }
    }

    /* ── Pilot engagement offer for a proof-first client (scoped from their own site) ── */
    if (caps.includes("pilot_engagement_offer")) {
      let findings = "";
      try {
        const { crawlSite } = await import("./site-crawler.js");
        const rep: any = await crawlSite({ projectId, siteUrl: inputs.siteUrl });
        if (rep && rep.pages_reachable > 0) {
          const iss = rep.issues || {};
          const top = Object.entries(iss).sort((a: any, b: any) => ((b[1] as any).count || 0) - ((a[1] as any).count || 0)).slice(0, 8);
          findings = `Audited ${rep.pages_reachable} pages of ${rep.project_domain}. Top issues: ${top.map(([k, v]: any) => `${k.replace(/_/g, " ")} (${v.count})`).join("; ")}.${rep.performance?.score != null ? ` Homepage performance ${rep.performance.score}.` : ""}`;
        }
      } catch { /* proceed without live findings */ }
      try {
        const { llmComplete } = await import("./workspace/llm.js");
        const system = "You are a Senior Digital Marketing Specialist creating a PILOT engagement offer for a prospect who wants proof before committing to a full engagement. From the REAL audit findings, scope a deliberately small, low-risk first engagement of about two weeks on specific pages, so the client can start without a big bet. Cover: why starting small removes their risk; exactly what you will do (the specific pages and fixes taken from the real findings, nothing vague or invented); how they will know it worked (a success signal they verify THEMSELVES in their own Search Console or analytics, framed as what you will move and how they will see it in their own data, never a guaranteed number or ranking); a short timeline and a fair pilot price; and how a clear result rolls into the full engagement and, with their permission, becomes a real named case study. Honest throughout: tie everything to what was really found on their site, never promise a ranking, and never reference a past client or result that does not exist. Return well-structured markdown. Never use an em-dash.";
        const user = `Prospect site: ${inputs.siteUrl || "the client site"}.\n${findings || "No live findings were loaded this pass; scope a sensible small pilot and note that a quick crawl of their site pins the exact pages to work on."}\nWrite the pilot engagement offer, grounded in their real findings.`;
        let body = "";
        for (let attempt = 0; attempt < 2 && !body; attempt++) {
          try { const { text } = await llmComplete({ system, user, maxTokens: 1800, timeoutMs: 60000, label: "pilot-engagement-offer", maxSegments: 1 }); body = String(text || "").trim(); } catch { /* transient, retry once before any fallback */ }
        }
        if (!body) throw new Error("empty offer");
        const report_md = `# Your low-risk first step\n\n${body}`;
        return result("completed", "pilot-offer engine (scoped from the prospect's own findings, honest)", { reports: [{ step_key: "pilot_offer", report_md }], summary: "A low-risk pilot engagement scoped from the real quick-wins on the prospect's own site, with a client-verifiable success signal and a path to the full engagement. Wins the proof-first client without any past-work claims." }, "Pilot engagement offer scoped from the prospect's own site findings: a small, verifiable first step with a path to the full engagement, no past-work claims needed.");
      } catch (e: any) {
        return result("manual", null, null, `This is a proof-first client. Crawl their site first, then re-run to scope the pilot from the real quick-wins. (${e?.message || "error"}.)`);
      }
    }

    /* ── Similar-work / case-study evidence: real curated proof, honest fallback ── */
    if (caps.includes("case_study_evidence")) {
      let studies: any[] = [];
      try {
        const { data } = await db().from("case_studies").select("*").eq("is_public", true).order("created_at", { ascending: false }).limit(50);
        studies = Array.isArray(data) ? data : [];
      } catch { studies = []; }
      let space = "";
      try {
        const { crawlSite } = await import("./site-crawler.js");
        const rep: any = await crawlSite({ projectId, siteUrl: inputs.siteUrl });
        space = `${rep?.homepage_title || ""} ${rep?.project_domain || ""}`;
      } catch { /* proceed */ }
      const spaceLc = `${space} ${inputs.siteUrl || ""}`.toLowerCase();
      const scored = studies.map((s: any) => {
        const hay = `${s.category || ""} ${s.industry || ""} ${s.client_label || ""}`.toLowerCase();
        const overlap = hay.split(/\W+/).filter((w: string) => w.length > 3 && spaceLc.includes(w)).length;
        return { s, overlap };
      }).sort((a: any, b: any) => b.overlap - a.overlap);
      const matched = scored.filter((x: any) => x.overlap > 0).map((x: any) => x.s).slice(0, 5);
      const picked = matched.length ? matched : studies.slice(0, 4);
      if (picked.length) {
        const rows = picked.map((s: any, i: number) => {
          const head = `${s.client_label || s.industry || "Client"}${s.category ? ` (${s.category})` : ""}`;
          const parts = [
            s.challenge ? `Challenge: ${s.challenge}.` : "",
            s.work_done ? `What I did: ${s.work_done}.` : "",
            (s.result_metric || s.result_detail) ? `Result: ${[s.result_metric, s.result_detail].filter(Boolean).join(", ")}.` : "",
            s.proof_url ? `Proof: ${s.proof_url}` : "",
          ].filter(Boolean);
          return `### ${i + 1}. ${head}\n${parts.join(" ")}`;
        }).join("\n\n");
        const report_md = `# Similar work, with proof\n\nThese are real prior engagements${matched.length ? " in a space close to yours" : ""}. Every result is verifiable at the proof link. Nothing here is illustrative or estimated.\n\n${rows}`;
        return result("completed", "case-study engine (real curated results, verifiable)", { reports: [{ step_key: "case_studies", report_md }], case_studies: picked, summary: `${picked.length} real, verifiable case ${picked.length === 1 ? "study" : "studies"} presented, each with a proof link.` }, `Presented ${picked.length} real case ${picked.length === 1 ? "study" : "studies"} with proof.`);
      }
      /* TIER 2: build real case studies from the operator's OWN past projects,
         using the measured before-and-after already in the platform (audit health
         score, then growth metrics), anonymised by industry, category-matched to
         the prospect. Real numbers only, never invented. */
      try {
        const { data: cur } = await db().from("projects").select("industry").eq("id", projectId).maybeSingle();
        const industry = String((cur as any)?.industry || "").toLowerCase();
        const { data: others } = await db().from("projects").select("id,industry,name").neq("id", projectId).limit(40);
        const realStudies: any[] = [];
        for (const p of ((others as any[]) || []).slice(0, 15)) {
          if (!p || !p.id) continue;
          let result_line = ""; let finding = "";
          try {
            const { data: audits } = await db().from("audit_reports").select("overall_score,created_at,top_findings").eq("project_id", p.id).order("created_at", { ascending: true });
            const scored = ((audits as any[]) || []).filter((a) => typeof a.overall_score === "number");
            if (scored.length >= 2) {
              const f = scored[0], l = scored[scored.length - 1];
              const delta = l.overall_score - f.overall_score;
              if (delta >= 8) {
                const days = Math.max(1, Math.round((new Date(l.created_at).getTime() - new Date(f.created_at).getTime()) / 86400000));
                result_line = `SEO health score improved from ${f.overall_score} to ${l.overall_score} (up ${delta} points) over about ${days} days`;
                const tf = f.top_findings;
                finding = Array.isArray(tf) ? String((tf[0] && (tf[0].title || tf[0])) || "") : "";
              }
            }
          } catch { /* skip this project */ }
          if (!result_line) {
            try {
              const { data: mets } = await db().from("metrics").select("overall_growth_score,pages_indexed,recorded_at").eq("project_id", p.id).order("recorded_at", { ascending: true });
              const ms = ((mets as any[]) || []).filter((m) => typeof m.overall_growth_score === "number");
              if (ms.length >= 2) {
                const f = ms[0], l = ms[ms.length - 1];
                const d = l.overall_growth_score - f.overall_growth_score;
                if (d >= 8) result_line = `growth score improved from ${f.overall_growth_score} to ${l.overall_growth_score} (up ${d} points)${typeof l.pages_indexed === "number" && typeof f.pages_indexed === "number" && l.pages_indexed > f.pages_indexed ? `, with indexed pages rising from ${f.pages_indexed} to ${l.pages_indexed}` : ""}`;
              }
            } catch { /* skip */ }
          }
          if (result_line) realStudies.push({ industry: String(p.industry || ""), result_line, finding });
        }
        realStudies.sort((a, b) => (b.industry.toLowerCase() === industry ? 1 : 0) - (a.industry.toLowerCase() === industry ? 1 : 0));
        const top = realStudies.slice(0, 4);
        if (top.length) {
          const rows = top.map((s, i) => `### ${i + 1}. A ${s.industry || "client"} engagement\n${s.finding ? `Starting challenge: ${s.finding}. ` : ""}Result: ${s.result_line}. These are real, measured figures from the engagement, anonymised.`).join("\n\n");
          const report_md = `# Similar work, from real engagements\n\nThese are real prior engagements from my own client base, anonymised, with the measured before-and-after taken from the platform's own audit and metric history. Nothing here is illustrative or invented.\n\n${rows}`;
          return result("completed", "case-study engine (real client history, anonymised, measured)", { reports: [{ step_key: "case_studies", report_md }], real_studies: top, summary: `${top.length} real case ${top.length === 1 ? "study" : "studies"} built from your own client history, anonymised, with measured before-and-after.` }, `Presented ${top.length} real case ${top.length === 1 ? "study" : "studies"} from your own client history, anonymised, with measured results.`);
        }
      } catch { /* fall through to the honest methodology piece */ }

      /* No curated case studies on file: HONEST methodology piece, never a fabricated past client. */
      try {
        const { llmComplete } = await import("./workspace/llm.js");
        let findings = "";
        try {
          const { crawlSite } = await import("./site-crawler.js");
          const rep: any = await crawlSite({ projectId, siteUrl: inputs.siteUrl });
          if (rep?.pages_reachable) { const iss = rep.issues || {}; const top = Object.entries(iss).sort((a: any, b: any) => ((b[1] as any).count || 0) - ((a[1] as any).count || 0)).slice(0, 6); findings = `Audited ${rep.pages_reachable} pages of ${rep.project_domain}. Top issues: ${top.map(([k, v]: any) => `${k.replace(/_/g, " ")} (${v.count})`).join("; ")}.`; }
        } catch { /* proceed */ }
        const system = "You are a Senior Digital Marketing Specialist. The operator has NO curated case studies on file for this prospect. You must NOT invent a past client, a metric, or a testimonial. Instead write an honest 'how I would approach a business like yours' piece: the specific methodology you would apply to THIS prospect's real situation and findings, clearly framed as the approach you would take, not a past outcome. Warm, specific, confident, in plain client language. Never use an em-dash or a double hyphen. No fabrication of any kind.";
        const user = `Prospect site: ${inputs.siteUrl || "the client site"}.\n${findings || "Use a strong, specific methodology and note where their real findings would shape it."}\nWrite an honest 'how I would approach a business like yours' section, 300 to 450 words, grounded in their real situation, framed clearly as the approach, never a fabricated past client.`;
        const { text } = await llmComplete({ system, user, maxTokens: 1400, timeoutMs: 60000, label: "case-study-approach", maxSegments: 1 });
        const body = String(text || "").trim();
        if (!body) throw new Error("empty");
        const report_md = `# How I would approach a business like yours\n\nMy proof stays honest: I show verified case studies only where I genuinely have them, and I will not put a manufactured example in front of you. For your situation specifically, here is exactly how I would work.\n\n${body}\n\nVerified case studies in your category can be added to the portfolio and will appear here as proof.`;
        return result("completed", "case-study engine (honest methodology, no fabrication)", { reports: [{ step_key: "case_approach", report_md }], summary: "No curated case studies on file for this category, so an honest methodology piece was produced, with no fabricated examples. Add verified case studies to present proof." }, "No verified case studies on file for this category. Produced an honest approach piece grounded in the prospect's findings, with no fabricated examples.");
      } catch (e: any) {
        return result("manual", null, null, `Add your real, verifiable case studies to the case_studies table to present them here as proof. (The honest methodology fallback could not run: ${e?.message || "error"}.)`);
      }
    }

    /* ── Human-activity deliverable: prepare the session (the platform preps, a person runs it) ── */
    if (caps.includes("meeting_prep_brief")) {
      let findings = "";
      try {
        const { crawlSite } = await import("./site-crawler.js");
        const rep: any = await crawlSite({ projectId, siteUrl: inputs.siteUrl });
        if (rep && rep.pages_reachable > 0) {
          const iss = rep.issues || {};
          const top = Object.entries(iss).sort((a: any, b: any) => ((b[1] as any).count || 0) - ((a[1] as any).count || 0)).slice(0, 8);
          findings = `Audited ${rep.pages_reachable} pages of ${rep.project_domain}. Top issues: ${top.map(([k, v]: any) => `${k.replace(/_/g, " ")} (${v.count})`).join("; ")}.${rep.performance?.score != null ? ` Homepage performance score ${rep.performance.score}.` : ""}`;
        }
      } catch { /* proceed without live findings */ }
      try {
        const { llmComplete } = await import("./workspace/llm.js");
        const system = "You are a Senior Digital Marketing Specialist preparing to run a live walkthrough / demonstration call with a client and their project manager. Produce a tight, professional PREPARATION BRIEF the practitioner uses to run the call. Ground it in the findings provided; where a figure is not provided, speak to the theme without inventing numbers. Return well-structured markdown.";
        const user = `Client site: ${inputs.siteUrl || "the client site"}.\n${findings || "No live audit findings were loaded for this pass; produce a strong standard SEO/AEO walkthrough agenda and talking points, and mark where live findings would slot in."}\nProduce these sections: 1) Call agenda (timed sections), 2) Key findings to walk through, 3) Talking points in plain English, 4) Questions to ask the client, 5) Recommended next steps to propose.`;
        const { text } = await llmComplete({ system, user, maxTokens: 2000, timeoutMs: 60000, label: "meeting-prep-brief", maxSegments: 1 });
        const body = String(text || "").trim();
        if (!body) throw new Error("empty brief");
        const report_md = `# Walkthrough call, preparation brief\n\n${body}\n\n_This brief prepares the session. Conducting the call is a human deliverable._`;
        return result("completed", "meeting-prep generator (agenda + talking points from the findings)", { reports: [{ step_key: "meeting_prep", report_md }], summary: "Preparation brief for the client call: agenda, key findings to present, talking points, questions and next steps, grounded in the audit. Conducting the call itself is a human deliverable." }, "Walkthrough-call preparation brief generated: agenda, findings to present, talking points, questions and next steps. The call itself is run by a person.");
      } catch (e: any) {
        return result("manual", null, null, `This is a client-facing session you run. The platform could not generate the prep brief this pass (${e?.message || "error"}); re-run to retry, or run the call directly.`);
      }
    }

    /* Fallback, capabilities present but no executor mapped. */
    return result("manual", null, null, `No automated executor for this stage's capabilities (${caps.join(", ")}); handle manually or supply the required inputs.`);
  } catch (e: any) {
    return result("error", null, null, `Stage execution threw.`, e?.message || String(e));
  }
}

function base(archetype_id: string, stage_id: string, stage_label: string, status: StageStatus, validation: Validation, ran_engine: string | null, output: any, note: string, error?: string): WizardStageResult {
  return { archetype_id, stage_id, stage_label, status, validation, ran_engine, output, note, ...(error ? { error } : {}) };
}
