/* ════════════════════════════════════════════════════════════════
   api/lib/wizard-archetypes.ts

   BUILD 12.23a — Wizard archetypes and their stage templates.

   A wizard is an ORDERED set of stages. Each stage names the capability
   ids (from capability-registry.ts) that perform it. The wizard engine
   resolves those ids to real engines and computes each stage's readiness
   honestly — a stage whose capability is not_supported reports blocked,
   never faked.

   The classifier picks ONE archetype from this set based on the client
   chat. Adding a new archetype here makes a new wizard available with no
   other change. Multi-tenant: no client or project values — pure
   workflow templates.
════════════════════════════════════════════════════════════════ */

export interface WizardStage {
  id:             string;
  label:          string;
  capability_ids: string[];   // references into CAPABILITY_REGISTRY
  produces:       string;     // the artifact this stage yields
}

export interface WizardArchetype {
  id:             string;
  label:          string;
  description:    string;
  trigger_signals:string[];   // phrases/intents that point the classifier here
  stages:         WizardStage[];
}

export const WIZARD_ARCHETYPES: Record<string, WizardArchetype> = {
  seo_audit_roadmap: {
    id: "seo_audit_roadmap",
    label: "Site-wide SEO Audit & Roadmap",
    description: "A full site-wide audit using GSC data: classify every URL, find the priority pages, deep-dive the most important, and produce a prioritised roadmap. Deliverable only, no implementation.",
    trigger_signals: ["site-wide audit", "audit/roadmap", "classify URLs", "all indexed URLs", "spreadsheet of URLs", "no direct changes until approved", "priority pages"],
    stages: [
      { id: "connect_data",      label: "Connect Search Console data",          capability_ids: ["gsc_metrics_per_url", "gsc_query_page_pairs"], produces: "Per-URL metrics and query-page data" },
      { id: "url_inventory",     label: "Build site-wide URL inventory",         capability_ids: ["gsc_metrics_per_url"],                        produces: "Table of all URLs with clicks/impressions/CTR/position" },
      { id: "classify_urls",     label: "Classify every URL",                    capability_ids: ["site_wide_url_classification"],               produces: "keep/improve/merge/redirect/noindex/delete per URL" },
      { id: "cannibalization",   label: "Detect keyword cannibalisation",        capability_ids: ["keyword_cannibalization"],                    produces: "Competing-page pairs per query" },
      { id: "priority_pages",    label: "Top-50 priority page recommendations",  capability_ids: ["title_meta_h1_reco", "internal_link_graph"],  produces: "Title/meta/H1/internal-link/CTA recommendations" },
      { id: "deep_dive",         label: "Top 10-20 deep-dive",                   capability_ids: ["technical_audit_deep", "eeat_ymyl_assessment"],produces: "Deep content, E-E-A-T/YMYL and trust-signal notes" },
      { id: "roadmap",           label: "Executive summary & roadmap",           capability_ids: ["client_report_narrative"],                    produces: "Biggest issues, fix order, phased roadmap" },
      { id: "export",            label: "Export deliverable spreadsheet",        capability_ids: ["url_inventory_export"],                       produces: "Sheets/Excel URL inventory with all columns" },
    ],
  },

  page_optimization: {
    id: "page_optimization",
    label: "Existing-Page Optimisation (CTR / on-page)",
    description: "Improve a set of existing pages already getting impressions — titles, metas, H1/H2, FAQ structure, internal links — to lift clicks and enquiries without new content or backlinks.",
    trigger_signals: ["high impressions low clicks", "optimise existing pages", "rewrite titles and metas", "improve CTR", "no new blogs", "improve pages Google already shows"],
    stages: [
      { id: "connect_data",     label: "Connect Search Console data",       capability_ids: ["gsc_metrics_per_url", "gsc_query_page_pairs"], produces: "Per-URL metrics" },
      { id: "opportunity_pages",label: "Identify opportunity pages",         capability_ids: ["gsc_metrics_per_url"],                        produces: "High-impression low-click pages ranked" },
      { id: "per_page_reco",    label: "Per-page title/meta/H1 rewrites",    capability_ids: ["title_meta_h1_reco"],                         produces: "Recommended snippets per page" },
      { id: "faq_structure",    label: "FAQ content structure (AEO)",        capability_ids: ["faq_structure_aeo"],                          produces: "Question-led structure for AI-search value" },
      { id: "internal_linking", label: "Internal linking improvements",      capability_ids: ["internal_link_graph"],                        produces: "Linking opportunities toward target pages" },
      { id: "cannibalization",  label: "Cannibalisation check",              capability_ids: ["keyword_cannibalization"],                    produces: "Competing-page pairs" },
      { id: "cta",              label: "CTA / conversion placement",         capability_ids: ["cta_conversion_reco"],                        produces: "Enquiry CTA recommendations" },
    ],
  },

  content_authority: {
    id: "content_authority",
    label: "Content / Topical Authority Build",
    description: "Map a topic's query space, find content gaps versus competitors, and produce a content plan and writer-ready templates to own the cluster.",
    trigger_signals: ["content strategy", "topical authority", "content gaps", "build out content", "educational content", "guides and comparisons"],
    stages: [
      { id: "analysis",   label: "Query landscape & competitor gaps", capability_ids: ["workspace_deep_analysis"],  produces: "Query space + competitor coverage gaps" },
      { id: "templates",  label: "Content templates",                 capability_ids: ["geo_content_template"],     produces: "Writer-ready page templates" },
      { id: "roadmap",    label: "Content roadmap",                   capability_ids: ["client_report_narrative"], produces: "Prioritised content plan" },
    ],
  },

  geo_aeo: {
    id: "geo_aeo",
    label: "GEO / AI Overview Program",
    description: "Win citation in AI Overviews: find where competitors are cited and you are not, generate the content templates to close the gap, and track displacement.",
    trigger_signals: ["AI Overview", "AI search", "generative engine optimisation", "ChatGPT/Perplexity citation", "AEO"],
    stages: [
      { id: "connect_data",   label: "Connect Search Console data", capability_ids: ["gsc_metrics_per_url"],    produces: "AI-surface attribution baseline" },
      { id: "citation_gap",   label: "AI Overview citation gap",    capability_ids: ["geo_citation_gap"],       produces: "Cited-page patterns and your gaps" },
      { id: "content_templates",label: "Content templates",         capability_ids: ["geo_content_template"],   produces: "Writer-ready templates from cited pages" },
      { id: "roadmap",        label: "GEO roadmap",                 capability_ids: ["client_report_narrative"],produces: "Prioritised GEO actions" },
    ],
  },

  technical_remediation: {
    id: "technical_remediation",
    label: "Technical SEO Remediation",
    description: "Find and prioritise technical issues — indexation, crawlability, Core Web Vitals, schema, internal links — and produce a fix roadmap.",
    trigger_signals: ["technical SEO", "indexing issues", "crawl errors", "core web vitals", "schema", "site health"],
    stages: [
      { id: "analysis",   label: "Site technical analysis",   capability_ids: ["workspace_deep_analysis", "onpage_audit"], produces: "Indexation, on-page and link findings" },
      { id: "deep_audit", label: "Deep technical audit (key pages)", capability_ids: ["technical_audit_deep"],            produces: "Per-page CWV, schema, technical findings" },
      { id: "roadmap",    label: "Fix roadmap",               capability_ids: ["client_report_narrative"],                produces: "Prioritised technical fixes" },
    ],
  },
};

export const ARCHETYPE_IDS = Object.keys(WIZARD_ARCHETYPES);

export function getArchetype(id: string): WizardArchetype | null {
  return WIZARD_ARCHETYPES[id] || null;
}
