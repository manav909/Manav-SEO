/* ════════════════════════════════════════════════════════════════
   api/lib/capability-registry.ts

   BUILD 12.23a — Capability registry (the wizard brain's ground truth).

   This is the single source of truth for what SEO Season can actually
   do, mapped to the REAL engine behind each capability. The wizard
   classifier and planner may reference ONLY the capabilities listed
   here. Nothing else. That constraint is the anti-fabrication anchor:
   the wizard can never tell an operator the platform will do something
   the code cannot do, because the planner has no vocabulary for it.

   Each entry records, honestly:
   - engine: the real file/function that performs it (traceability)
   - inputs_required: what must be present for it to run
   - output: what it produces
   - limits: the honest caveat a senior practitioner would state
   - mode: how it executes —
       auto             runs unattended once inputs exist
       needs_connection requires an integration (GSC/GA4 OAuth) first
       needs_input      requires operator-supplied input (e.g. keywords)
       manual_dms       a human judgement call; platform assists, does not decide
       not_supported    no engine exists yet — an explicit GAP, never faked

   When a new engine ships, add or flip its entry here and the wizard
   picks it up with no other change. Multi-tenant: holds NO client or
   project values — pure capability description.
════════════════════════════════════════════════════════════════ */

export type ExecutionMode =
  | "auto"
  | "needs_connection"
  | "needs_input"
  | "manual_dms"
  | "not_supported";

export interface Capability {
  id:              string;
  label:           string;
  engine:          string;        // real engine reference for traceability
  inputs_required: string[];
  output:          string;
  limits:          string;
  mode:            ExecutionMode;
}

export const CAPABILITY_REGISTRY: Record<string, Capability> = {
  /* ── Search Console data ─────────────────────────────────────── */
  gsc_metrics_per_url: {
    id: "gsc_metrics_per_url",
    label: "Per-URL GSC metrics (clicks / impressions / CTR / position)",
    engine: "pm-gsc.ts → gscPull",
    inputs_required: ["GSC property connected (OAuth)"],
    output: "Per-URL clicks, impressions, CTR and average position, derivable from the 1000-row query-page dataset plus the top-pages set.",
    limits: "Only covers URLs that have impressions in GSC. Zero-impression and non-indexed pages do not appear in the GSC page dimension at all — enumerating those needs a sitemap/crawl supplement. The convenience top_pages field caps at 50; the per-URL table is derived from the 1000 query-page pairs.",
    mode: "needs_connection",
  },
  gsc_query_page_pairs: {
    id: "gsc_query_page_pairs",
    label: "Query-page competition data",
    engine: "pm-gsc.ts → gscPull (query×page dimension, 1000 rows)",
    inputs_required: ["GSC property connected (OAuth)"],
    output: "Which queries each page earns impressions on, with clicks, impressions, CTR and position per pair.",
    limits: "Capped at 1000 rows — covers all but the very largest sites; the lowest-impression pairs on a high-volume site can fall below the cutoff.",
    mode: "needs_connection",
  },
  gsc_csv_ingestion: {
    id: "gsc_csv_ingestion",
    label: "Ingest a GSC CSV export (no OAuth)",
    engine: "gsc-csv-ingest.ts → ingestGscCsv",
    inputs_required: ["GSC performance export file(s) — Pages, Queries, or a combined query-page export"],
    output: "Parses the export and writes it into the same project_knowledge fields the live pull uses, so downstream engines read it transparently.",
    limits: "The standard GSC UI export has Pages and Queries but NOT query-page pairs (API-only), so cannibalisation and CTR-opportunity flagging stay limited until a combined export is supplied. A Pages export can carry up to ~1000 rows (broader than the live pull's 50). Ingestion overwrites the matching field.",
    mode: "auto",
  },

  /* ── Analysis engines ────────────────────────────────────────── */
  keyword_cannibalization: {
    id: "keyword_cannibalization",
    label: "Keyword cannibalisation detection",
    engine: "detectCannibalization (analytics intel engine)",
    inputs_required: ["gsc_query_page_pairs"],
    output: "Queries where two or more of the site's own pages compete for the same term, with the competing URLs.",
    limits: "Detection is from GSC impression data — it finds observed competition, not latent overlap on pages with no impressions yet.",
    mode: "auto",
  },
  topical_authority_map: {
    id: "topical_authority_map",
    label: "Topical authority & search-intent mapping",
    engine: "topical-authority.ts → mapTopicalAuthority",
    inputs_required: ["GSC query-page data"],
    output: "Topic clusters built from the site's own GSC queries, each with search-intent label, coverage depth (strong/partial/thin/under-served), the pages serving it, and a recommendation; plus the under-served intent segments with the biggest impression bases.",
    limits: "Maps existing authority and thin spots from queries the site already earns impressions on — not net-new keyword opportunities (that needs keyword research from a separate source). Intent labels are rule-based heuristics; clustering is lexical, not semantic. Limited to the stored GSC dataset.",
    mode: "auto",
  },
  competitor_benchmark: {
    id: "competitor_benchmark",
    label: "Competitor organic benchmarking (keyword-gap + content-gap)",
    engine: "competitor-benchmark.ts → benchmarkCompetitors",
    inputs_required: ["A curated list of competitor domains (operator-supplied)", "GSC data or target keywords for the query set"],
    output: "Per-query client-vs-competitor SERP standings, aggregate keyword-gap per competitor, and crawl-based content-gap (depth/schema/structure) on the worst-ranking queries.",
    limits: "Competitors are operator-supplied (no auto-discovery, to avoid irrelevant matches). SERP positions are a point-in-time, location-dependent snapshot; query set and content-gap crawling are capped for cost. Backlink-gap is NOT produced — no backlink-profile data source is connected; it requires an Ahrefs/Semrush/Majestic export or API.",
    mode: "needs_input",
  },
  cms_platform_advisory: {
    id: "cms_platform_advisory",
    label: "CMS-platform advisory (Shopify / WordPress / Wix / Squarespace / Webflow / more)",
    engine: "cms-advisor.ts → adviseCms",
    inputs_required: ["A crawlable site URL (resolved from project data, or supplied)"],
    output: "Detected platform with confidence + signals, then universal SEO findings plus platform-specific findings (e.g. Shopify collection canonicalisation), each grounded in crawled conditions, with advisory items where a crawl cannot verify.",
    limits: "Based on a capped sample of crawled pages, not the full site. A crawl cannot see Core Web Vitals field data, theme/app internals, or JS-only-rendered content — those are advisory. Platform detection is signature-based; rule coverage is extensible per platform.",
    mode: "auto",
  },
  paid_organic_substitution: {
    id: "paid_organic_substitution",
    label: "Paid-vs-organic substitution (reduce paid dependency)",
    engine: "paid-organic.ts → analyzePaidVsOrganic (ingest via ads CSV)",
    inputs_required: ["A real Google Ads search-terms export (CSV)", "GSC organic data"],
    output: "Each paid search term cross-referenced with organic standing and bucketed: strong-substitution (already ranking top-5 — test cutting paid), ranking-opportunity, organic-gap, and brand-defence (held separate). Reports the potentially shiftable spend.",
    limits: "REQUIRES a real Ads export — never estimates paid spend. Paid and organic clicks are not 1:1 substitutable, so recommendations are spend-reduction tests, not guarantees. Brand-term paid is separated, not counted as savings. A future Google Ads OAuth connector can feed the same engine.",
    mode: "needs_input",
  },
  workspace_deep_analysis: {
    id: "workspace_deep_analysis",
    label: "Workspace deep-step analysis (sequenced)",
    engine: "workspace/routes.ts → wsCreateRun + wsRunDeepSteps",
    inputs_required: ["Project with target URLs", "GSC connected for full value"],
    output: "Sequenced deep-steps — GSC visibility, query landscape, on-page audit, internal link graph, competitor intel, trajectory, and the GEO steps — each producing a step report with live status.",
    limits: "Scoped to the project's resolved target pages, not an arbitrary 300-URL list. This is the orchestration spine the wizard drives for analysis stages.",
    mode: "auto",
  },
  onpage_audit: {
    id: "onpage_audit",
    label: "On-page audit across target pages",
    engine: "workspace/deep-steps (traffic-steps.ts) → gatherOnpageAudit",
    inputs_required: ["Target URLs"],
    output: "Live crawl of each target page: title, H1, meta, word count, schema presence, canonical, noindex.",
    limits: "Covers the resolved target pages, not the whole site at once.",
    mode: "auto",
  },
  technical_audit_deep: {
    id: "technical_audit_deep",
    label: "Deep per-page technical audit",
    engine: "seo-technical-audit.ts → runTechnicalAudit",
    inputs_required: ["A single target URL", "GSC connected", "GA4 connected for engagement"],
    output: "Deep per-page findings: title/meta/H1, keyword-match strength, Core Web Vitals (CrUX + Lighthouse), schema validation, per-page GA4 engagement, redirect/noindex detection, internal anchor analysis.",
    limits: "Runs one URL per pass and is expensive (PageSpeed, CrUX, GA4, SERP calls). Suitable for the top 10-20 deep-dive pages, not for hundreds of URLs.",
    mode: "auto",
  },
  internal_link_graph: {
    id: "internal_link_graph",
    label: "Internal linking analysis",
    engine: "workspace deep-step + seo-internal-linking.ts",
    inputs_required: ["Target URLs"],
    output: "Internal anchor and link structure analysis with linking opportunities toward priority pages.",
    limits: "Based on crawled authority pages, not necessarily every URL on the site.",
    mode: "auto",
  },
  title_meta_h1_reco: {
    id: "title_meta_h1_reco",
    label: "Title / meta / H1 recommendations per page",
    engine: "seo-technical-audit.ts (per-URL findings)",
    inputs_required: ["Target URL", "Its GSC query data"],
    output: "Recommended SEO title, meta description and H1 for a page, grounded in its real query data.",
    limits: "Generated per URL through the audit path; producing these for 50 pages is real work, lighter than a full deep audit but not free.",
    mode: "auto",
  },

  /* ── GEO / AEO ───────────────────────────────────────────────── */
  geo_citation_gap: {
    id: "geo_citation_gap",
    label: "AI Overview citation gap",
    engine: "workspace deep-step → gatherAiOverviewCitationGap (Build 12.20)",
    inputs_required: ["Target keywords that currently trigger an AI Overview"],
    output: "Per-query analysis of the structural patterns in the pages AI Overview cites, and the gaps versus the project's page.",
    limits: "Only meaningful for queries that actually show an AI Overview. Newly reachable as of Build 12.22 — field validation still owed.",
    mode: "needs_input",
  },
  geo_content_template: {
    id: "geo_content_template",
    label: "AI Overview content templates",
    engine: "workspace deep-step → gatherGeoContentTemplate (Build 12.22)",
    inputs_required: ["geo_citation_gap evidence for the run"],
    output: "Writer-ready page templates derived from the cited pages, plus a site-wide content standard.",
    limits: "Transforms the citation-gap evidence; produces nothing if that step did not run. Field validation owed.",
    mode: "needs_input",
  },
  faq_structure_aeo: {
    id: "faq_structure_aeo",
    label: "FAQ content structure for AEO",
    engine: "geo_content_template / content-structure guidance",
    inputs_required: ["Target page", "Its question-intent queries"],
    output: "Question-phrased heading structure with direct answers, for AI Overview and assistant citation value.",
    limits: "FAQ structure is recommended for AI-search citation value, NOT for FAQ rich results — Google removed FAQ rich results from Search (deprecated 2023, fully gone May 2026). Do not recommend FAQPage schema expecting a rich snippet.",
    mode: "auto",
  },

  /* ── Synthesis ───────────────────────────────────────────────── */
  client_report_narrative: {
    id: "client_report_narrative",
    label: "Executive summary / strategic roadmap narrative",
    engine: "workspace/client-report.ts → solveClientReport (via wsSolveClientReport)",
    inputs_required: ["Completed workspace run evidence"],
    output: "Strategic narrative synthesis — biggest issues, what to fix first, what can wait, phased roadmap framing.",
    limits: "Produces a narrative roadmap, not a structured 30/60/90 grid by default. Quality depends on the evidence the run gathered.",
    mode: "auto",
  },

  /* ── Judgement calls (platform assists, human decides) ───────── */
  eeat_ymyl_assessment: {
    id: "eeat_ymyl_assessment",
    label: "E-E-A-T / YMYL trust assessment",
    engine: "signal-level via gsc-visibility + GEO author/credential detection (partial)",
    inputs_required: ["Target pages", "Knowledge of the entity's real credentials"],
    output: "Assessment of trust and authority signals; for regulated sectors, which credentials and registrations to surface.",
    limits: "Only partially automated. A structured regulated-sector trust audit (e.g. FCA authorisation display, named author bios, company registration) is a senior-DMS judgement the platform assists but does not decide.",
    mode: "manual_dms",
  },
  cta_conversion_reco: {
    id: "cta_conversion_reco",
    label: "CTA / conversion placement recommendations",
    engine: "GA4 per-page engagement informs it; placement is judgement",
    inputs_required: ["Target page", "GA4 engagement data"],
    output: "Where and how to place enquiry CTAs to lift conversion.",
    limits: "Engagement data informs the call, but placement is a human judgement, not an automated output.",
    mode: "manual_dms",
  },

  /* ── Known gaps (explicit, never faked) ──────────────────────── */
  site_wide_url_classification: {
    id: "site_wide_url_classification",
    label: "Site-wide URL classification (keep/improve/merge/redirect/review-for-pruning)",
    engine: "url-classifier.ts → classifyUrls",
    inputs_required: ["GSC property connected and pulled"],
    output: "Every URL with GSC impressions classified into keep / improve / merge / redirect / review_for_pruning, each with reason, confidence, priority and recommended action, plus cannibalisation groups.",
    limits: "Covers only URLs with GSC impressions (top pages + up to 1000 query-page pairs). keep/improve/merge are confident; redirect is a flagged candidate; noindex and delete are never asserted — low-value pages are surfaced as review_for_pruning pending a content crawl and sitemap diff. Zero-impression/orphaned pages are not visible without a sitemap pull.",
    mode: "auto",
  },
  url_inventory_export: {
    id: "url_inventory_export",
    label: "URL inventory spreadsheet export (Sheets / Excel)",
    engine: "url-inventory-export.ts → exportUrlInventory",
    inputs_required: ["A classified URL table (from site_wide_url_classification)"],
    output: "A multi-sheet .xlsx (URL Inventory, Cannibalisation, Notes & Limits) plus a CSV, with URL, page type, clicks, impressions, CTR, average position, current issue, recommended action, priority and notes.",
    limits: "Carries the classifier's honesty through to the file: redirect is a candidate, review_for_pruning needs a crawl + sitemap, and only URLs with GSC impressions are included. Returned as base64 for client download.",
    mode: "auto",
  },
};

/* ─── Helpers ─────────────────────────────────────────────────── */

export function getCapability(id: string): Capability | null {
  return CAPABILITY_REGISTRY[id] || null;
}

export function capabilitiesByMode(mode: ExecutionMode): Capability[] {
  return Object.values(CAPABILITY_REGISTRY).filter(c => c.mode === mode);
}

/* Severity order for resolving a stage's overall readiness from the
   modes of its constituent capabilities. Higher = more blocking. */
export const MODE_SEVERITY: Record<ExecutionMode, number> = {
  auto:             0,
  needs_connection: 1,
  needs_input:      2,
  manual_dms:       3,
  not_supported:    4,
};
