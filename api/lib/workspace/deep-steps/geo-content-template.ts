/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/deep-steps/geo-content-template.ts

   BUILD 12.22 — DEEP STEP — AI Overview content-structure templates.

   Consumes the ai_overview_citation_gap step's STORED evidence for this
   run and turns each per-query gap report into a writer-ready page
   template: section order, word-count and Q-and-A targets, schema to
   add, and (optionally) query-specific heading scaffolding.

   Design note — this step performs NO crawling or SerpAPI of its own.
   It reads the citation-gap evidence already gathered earlier in the
   same run. That keeps it fast (only an optional single LLM call) and
   guarantees the templates are grounded in the exact pages the gap step
   observed — no divergence, no doubled cost. It therefore REQUIRES
   ai_overview_citation_gap to have run first; when that evidence is
   absent it skips honestly rather than inventing a template.

   Project-agnostic. Takes runId + projectId + targetUrls + targetKeywords.
════════════════════════════════════════════════════════════════ */

import { db } from "../../db.js";
import type { SourcedFact } from "../shared.js";
import type { CitationGapReport } from "../../geo-citation-gap.js";
import {
  generateContentTemplate,
  enrichTemplates,
  buildSiteWideStandard,
  type ContentStructureTemplate,
  type SiteWideStandard,
} from "../../geo-content-template.js";

const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const pathOf   = (u: string | null) => (u || "").replace(/^https?:\/\/[^/]+/, "") || "/";

export interface ContentTemplateEvidence {
  step_key: "geo_content_template";
  generated_at: string;
  project_domain: string;
  source_step: "ai_overview_citation_gap";
  templates_generated: number;
  enriched: boolean;
  site_wide_standard: SiteWideStandard | null;
  templates: ContentStructureTemplate[];
  /* Honest skip reason when the citation-gap evidence is unavailable */
  skipped_reason: string | null;
  provenance: SourcedFact[];
  worth_deeper: string[];
}

/* Read the latest-version ai_overview_citation_gap evidence for this run. */
async function loadCitationGapReports(runId: string): Promise<{ reports: CitationGapReport[]; generatedAt: string | null }> {
  const { data } = await db().from("step_reports")
    .select("evidence_json, version, created_at")
    .eq("run_id", runId).eq("step_key", "ai_overview_citation_gap")
    .order("version", { ascending: false }).order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  const ev = (data as any)?.evidence_json;
  const reports: CitationGapReport[] = Array.isArray(ev?.reports) ? ev.reports : [];
  return { reports, generatedAt: ev?.generated_at || (data as any)?.created_at || null };
}

export async function gatherGeoContentTemplate(opts: {
  runId:          string;
  projectId:      string;
  targetUrls:     string[];
  targetKeywords: string[];
}): Promise<{ evidence: ContentTemplateEvidence; report_md: string }> {
  const now = new Date().toISOString();
  const { runId, targetUrls } = opts;
  const projectDomain = domainOf(targetUrls[0] || "");
  const provenance: SourcedFact[] = [];
  const worth_deeper: string[] = [];

  const { reports, generatedAt } = await loadCitationGapReports(runId);

  /* No upstream evidence → skip honestly. Do not fabricate a template. */
  if (reports.length === 0) {
    const evidence: ContentTemplateEvidence = {
      step_key: "geo_content_template",
      generated_at: now,
      project_domain: projectDomain,
      source_step: "ai_overview_citation_gap",
      templates_generated: 0,
      enriched: false,
      site_wide_standard: null,
      templates: [],
      skipped_reason: `No AI Overview citation gap evidence available for this run. Content templates are derived from the cited pages that step observes, so enable and run "AI Overview Citation Gap" first (it needs target keywords that currently trigger an AI Overview).`,
      provenance,
      worth_deeper: [`Run the AI Overview Citation Gap step on target keywords that show an AI Overview, then re-run this step to generate templates.`],
    };
    return { evidence, report_md: renderReport(evidence) };
  }

  provenance.push({
    value: reports.length,
    source: "ai_overview_citation_gap step",
    fetched_at: generatedAt || now,
    note: "citation gap reports consumed to derive templates (no new crawl)",
  });

  /* Deterministic template per query */
  let templates = reports.map(r => generateContentTemplate(r));

  /* Optional one-shot LLM enrichment for query-specific scaffolding.
     Failure is non-fatal — templates render deterministically. */
  try {
    templates = await enrichTemplates(templates, { maxQueries: 10 });
  } catch (e: any) {
    worth_deeper.push(`Heading enrichment did not run (${(e?.message || "unknown").slice(0, 80)}); templates below are the deterministic structure only.`);
  }
  const enriched = templates.some(t => t.enriched);
  if (enriched) provenance.push({ value: "claude-sonnet-4-6", source: "LLM (structural scaffolding only)", fetched_at: now, note: "suggested headings + section cover notes — draft, writer-validated" });

  const usableTemplates = templates.filter(t => t.cited_pages_analyzed > 0);
  const site_wide_standard = usableTemplates.length ? buildSiteWideStandard(templates) : null;

  /* Worth-deeper signals */
  if (usableTemplates.length === 0) {
    worth_deeper.push(`Citation gap evidence existed but no cited pages were successfully fetched, so no template could be derived. Re-run the citation gap step.`);
  } else {
    const heavyGap = templates.filter(t => t.project_missing.length >= 3);
    for (const t of heavyGap) {
      worth_deeper.push(`"${t.query}": your page is missing ${t.project_missing.length} recommended sections (${t.project_missing.slice(0, 3).join(", ")}…). Substantial restructure, not a tweak — scope it as a rewrite.`);
    }
    if (site_wide_standard && site_wide_standard.standard_sections.length >= 3) {
      worth_deeper.push(`A consistent content standard emerged across queries (${site_wide_standard.standard_sections.slice(0, 4).map(s => s.label).join(", ")}). Bake it into your content template / CMS defaults so new pages ship with it by default.`);
    }
  }

  const evidence: ContentTemplateEvidence = {
    step_key: "geo_content_template",
    generated_at: now,
    project_domain: projectDomain,
    source_step: "ai_overview_citation_gap",
    templates_generated: usableTemplates.length,
    enriched,
    site_wide_standard,
    templates,
    skipped_reason: null,
    provenance,
    worth_deeper,
  };

  return { evidence, report_md: renderReport(evidence) };
}

/* ─── Writer-ready markdown rendering ─────────────────────────── */

function renderSection(s: ContentStructureTemplate["sections"][number]): string[] {
  const L: string[] = [];
  const tag = s.prevalence === "universal" ? "all cited pages"
            : s.prevalence === "majority"  ? "most cited pages"
            : `${s.present_in}/${s.cited_total} cited pages`;
  const projectFlag = s.on_project_page === false ? " — **missing on your page**"
                    : s.on_project_page === true ? " — already on your page"
                    : "";
  L.push(`- **${s.label}** _(${tag}${projectFlag})_`);
  L.push(`  - ${s.spec}`);
  if (s.cover) L.push(`  - _What to cover:_ ${s.cover}`);
  if (s.suggested_headings && s.suggested_headings.length) {
    L.push(`  - _Suggested headings (draft — validate against real searcher intent):_`);
    for (const h of s.suggested_headings) L.push(`    - ${h}`);
  }
  return L;
}

function renderReport(e: ContentTemplateEvidence): string {
  const L: string[] = [];
  L.push(`# AI Overview Content Templates`);
  L.push(``);
  L.push(`_Generated ${new Date(e.generated_at).toLocaleString()}. Writer-ready page templates derived from the pages AI Overview currently cites for your target queries. Structure observed, not theorized — every recommendation traces to a page Google is actually citing. Numeric targets are medians of a small sample, so treat them as directional._`);
  L.push(``);

  if (e.skipped_reason) {
    L.push(`## Not generated`);
    L.push(``);
    L.push(e.skipped_reason);
    L.push(``);
    if (e.worth_deeper.length) {
      L.push(`## Next step`);
      for (const w of e.worth_deeper) L.push(`- ${w}`);
    }
    return L.join("\n");
  }

  L.push(`## Summary`);
  L.push(`- **Project domain:** ${e.project_domain || "(unknown)"}`);
  L.push(`- **Templates generated:** ${e.templates_generated}`);
  L.push(`- **Heading scaffolding:** ${e.enriched ? "included (draft, writer-validated)" : "not included — deterministic structure only"}`);
  L.push(``);

  /* Site-wide standard first — the highest-leverage output. */
  if (e.site_wide_standard && e.site_wide_standard.standard_sections.length) {
    const sw = e.site_wide_standard;
    L.push(`## Site-wide content standard`);
    L.push(`_${sw.narrative}_`);
    L.push(``);
    L.push(`| Element | Recommended on every page | In how many queries |`);
    L.push(`| --- | --- | --- |`);
    for (const s of sw.standard_sections) {
      L.push(`| ${s.label} | ✓ | ${s.in_queries} of ${sw.queries_considered} |`);
    }
    L.push(``);
    if (sw.recommended_schema.length) {
      L.push(`**Schema to standardize:** ${sw.recommended_schema.map(s => `${s.type} (${s.in_queries}/${sw.queries_considered} queries)`).join(", ")}`);
      L.push(``);
    }
  }

  /* Per-query writer briefs */
  L.push(`## Per-query page templates`);
  L.push(``);
  for (const t of e.templates) {
    L.push(`### "${t.query}"`);
    L.push(``);
    L.push(`**Brief:** ${t.narrative}`);
    L.push(``);
    if (t.cited_pages_analyzed === 0) { L.push(`---`); L.push(``); continue; }

    if (t.recommended_schema.length) L.push(`**Schema to add:** ${t.recommended_schema.join(", ")}`);
    if (t.target_word_count) L.push(`**Target length:** ~${t.target_word_count.median} words (cited range ${t.target_word_count.low}–${t.target_word_count.high}).`);
    L.push(``);

    L.push(`**Recommended structure (in order):**`);
    for (const s of t.sections) L.push(...renderSection(s));
    L.push(``);

    if (t.optional_sections.length) {
      L.push(`**Situational (seen on some cited pages, not most):**`);
      for (const s of t.optional_sections) L.push(`- ${s.label} — ${s.present_in}/${s.cited_total} cited pages. ${s.spec}`);
      L.push(``);
    }

    if (t.project_missing.length) {
      L.push(`**Gap vs. your current page:** missing ${t.project_missing.join(", ")}.`);
      L.push(``);
    }
    L.push(`---`);
    L.push(``);
  }

  if (e.worth_deeper.length) {
    L.push(`## Worth investigating further`);
    for (const w of e.worth_deeper) L.push(`- ${w}`);
    L.push(``);
  }

  L.push(`## Provenance`);
  for (const f of e.provenance) {
    L.push(`- ${f.source}: ${typeof f.value === "number" ? f.value : JSON.stringify(f.value)}${f.note ? ` (${f.note})` : ""} — ${new Date(f.fetched_at).toLocaleString()}`);
  }

  return L.join("\n");
}
