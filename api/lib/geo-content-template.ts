/* ════════════════════════════════════════════════════════════════
   api/lib/geo-content-template.ts

   BUILD 12.22 — AI Overview content-structure template generation.

   Citation gap analysis (Build 12.20, geo-citation-gap.ts) tells you
   WHAT structural patterns the pages Google actually cites for a query
   have in common. This module turns that observation into a concrete,
   writer-ready page template: section order, word-count targets, schema
   to add, heading shape — derived ENTIRELY from the observed cited
   pages, not from theory.

   The senior-DMS lens: a writer should not have to read a gap report
   and infer a structure. They should get a brief they can execute. This
   module produces that brief from real observed patterns.

   Honest about what this is and is not:
   - Templates reflect PATTERNS OBSERVED in pages currently cited. That
     is correlation, not a guarantee. A page built to this shape is
     better positioned for citation; it is not promised citation.
   - Numeric targets (word counts, Q-and-A counts) are medians of the
     cited sample. Small samples (3-6 pages) make these directional, not
     precise. The template says so.
   - The optional LLM enrichment proposes query-specific heading text and
     a one-line "what to cover" per section. That is DRAFT SCAFFOLDING a
     writer must validate against real user intent and their own subject
     expertise. The enrichment is forbidden from inventing facts, stats,
     prices, or citation guarantees — it only shapes structure.
   - This module performs NO crawling. It consumes citation-gap reports
     produced upstream, so it adds no SerpAPI or HTTP cost of its own.

   Multi-tenant: holds NO project-specific values. Pure transformation.
════════════════════════════════════════════════════════════════ */

import { llm, parseJsonResponse } from "./workspace/llm.js";
import type { CitationGapReport, PagePattern } from "./geo-citation-gap.js";

export type Prevalence = "universal" | "majority" | "minority" | "absent";

export interface TemplateSection {
  id:               string;        // stable id for cross-referencing
  label:            string;        // human label
  prevalence:       Prevalence;    // how common among cited pages
  present_in:       number;        // count of loaded cited pages with it
  cited_total:      number;        // total loaded cited pages
  spec:             string;        // deterministic, grounded instruction
  suggested_headings?: string[];   // LLM-enriched, query-specific DRAFT
  cover?:           string;        // LLM-enriched one-line DRAFT
  on_project_page?: boolean | null;// whether the project page already has it (null = unknown)
}

export interface ContentStructureTemplate {
  query:               string;
  project_url:         string | null;
  cited_pages_analyzed:number;
  target_word_count:   { median: number; low: number; high: number } | null;
  recommended_schema:  string[];   // schema @types prevalent in cited pages
  sections:            TemplateSection[];      // RECOMMENDED core (universal/majority), ordered
  optional_sections:   TemplateSection[];      // seen in a minority — situational
  project_missing:     string[];   // labels of recommended sections missing on the project page
  narrative:           string;
  enriched:            boolean;
  generated_at:        string;
}

export interface SiteWideStandard {
  queries_considered:  number;
  /* Sections that are universal/majority in cited pages across the MAJORITY
     of analyzed queries — i.e. patterns worth applying to ALL content, not
     just one page. The highest-leverage output. */
  standard_sections:   Array<{ id: string; label: string; in_queries: number; spec: string }>;
  recommended_schema:  Array<{ type: string; in_queries: number }>;
  narrative:           string;
}

/* ─── Pattern → section definitions (the writer-facing model) ──── */
/* Each tracked PagePattern boolean maps to a writer-facing section with a
   deterministic spec. The spec text is grounded — it describes the observed
   shape, not a promise. Order is the recommended page order. */

interface SectionDef {
  id:    string;
  patternKey: keyof PagePattern;
  label: string;
  /* Builds the deterministic spec from the cited sample. `stat` is an
     optional numeric pulled from the sample (e.g. median summary words). */
  spec:  (ctx: { presentIn: number; total: number; stat?: number }) => string;
}

const SECTION_DEFS: SectionDef[] = [
  {
    id: "opening_summary", patternKey: "has_summary_top", label: "Opening summary paragraph",
    spec: ({ stat }) =>
      `A declarative summary paragraph directly under the H1 that answers the query in plain language before any preamble. Cited pages that use this average about ${stat || 60} words. Aim for a self-contained answer a reader (or an AI model) can lift verbatim.`,
  },
  {
    id: "tldr_block", patternKey: "has_tldr_block", label: "TL;DR / key-takeaways block",
    spec: () =>
      `An explicit "Key takeaways" or "TL;DR" block near the top — typically 3-5 bullet points capturing the core answers. Makes the page easy to extract from.`,
  },
  {
    id: "qa_structure", patternKey: "has_qa_structure", label: "Question-phrased H2/H3 sections",
    spec: ({ stat }) =>
      `Structure the body as question-phrased headings (How…, What…, Why…, Can…), each answered in the first 1-2 sentences below it. Cited pages average about ${stat || 4} such question headings. This is the single most consistent pattern in AI-Overview-cited content.`,
  },
  {
    id: "author_block", patternKey: "has_author_byline", label: "Named author byline",
    spec: () =>
      `A visible, named author byline (not "Admin" or "Staff"). Attribution is a recurring trait of cited pages.`,
  },
  {
    id: "credentials", patternKey: "has_credentials", label: "Author credentials",
    spec: () =>
      `Surface the author's relevant credential or role next to the byline (title, certification, or domain experience). Reinforces the E-E-A-T signal cited pages carry.`,
  },
  {
    id: "freshness", patternKey: "has_last_updated", label: "Visible last-updated date",
    spec: () =>
      `A visible "last updated" date AND a matching dateModified in Article schema. Cited pages signal freshness; stale-looking pages are cited less.`,
  },
];

/* Schema sections are handled separately because they map to multiple
   boolean fields and produce a single schema recommendation. */
const SCHEMA_DEFS: Array<{ key: keyof PagePattern; type: string }> = [
  { key: "has_faq_schema",     type: "FAQPage" },
  { key: "has_article_schema", type: "Article" },
  { key: "has_howto_schema",   type: "HowTo" },
];

/* ─── Small numeric helpers ───────────────────────────────────── */

function median(nums: number[]): number {
  const a = nums.filter(n => Number.isFinite(n) && n > 0).sort((x, y) => x - y);
  if (a.length === 0) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

function classify(presentIn: number, total: number): Prevalence {
  if (total === 0) return "absent";
  if (presentIn === total) return "universal";
  if (presentIn >= Math.ceil(total / 2)) return "majority";
  if (presentIn > 0) return "minority";
  return "absent";
}

/* ─── Deterministic template from a single citation-gap report ─── */

export function generateContentTemplate(report: CitationGapReport): ContentStructureTemplate {
  const now = new Date().toISOString();
  const loaded = report.cited_pages.filter(p => p.loaded);
  const total = loaded.length;

  /* Numeric targets from the cited sample */
  const summaryStat = median(loaded.filter(p => p.has_summary_top).map(p => p.summary_word_count));
  const qaStat      = median(loaded.filter(p => p.has_qa_structure).map(p => p.qa_block_count));
  const wordCounts  = loaded.map(p => p.total_word_count).filter(n => n > 0).sort((a, b) => a - b);
  const targetWordCount = wordCounts.length
    ? { median: median(wordCounts), low: wordCounts[0], high: wordCounts[wordCounts.length - 1] }
    : null;

  const statFor = (id: string): number | undefined =>
    id === "opening_summary" ? summaryStat : id === "qa_structure" ? qaStat : undefined;

  /* Build every candidate section with its prevalence */
  const allSections: TemplateSection[] = SECTION_DEFS.map(def => {
    const presentIn = loaded.filter(p => Boolean(p[def.patternKey])).length;
    const prevalence = classify(presentIn, total);
    const onProject = report.project_page && report.project_page.loaded
      ? Boolean(report.project_page[def.patternKey])
      : null;
    return {
      id: def.id,
      label: def.label,
      prevalence,
      present_in: presentIn,
      cited_total: total,
      spec: def.spec({ presentIn, total, stat: statFor(def.id) }),
      on_project_page: onProject,
    };
  });

  /* Recommended core = universal or majority. Optional = minority.
     Absent sections are dropped — do not recommend a shape the cited
     pages themselves do not use. */
  const ORDER = SECTION_DEFS.map(d => d.id);
  const byOrder = (a: TemplateSection, b: TemplateSection) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id);

  /* H1 is always first and always present by definition. */
  const h1Section: TemplateSection = {
    id: "title_h1", label: "H1 stating the query intent",
    prevalence: "universal", present_in: total, cited_total: total,
    spec: `An H1 that states the query intent directly and naturally — what the reader typed, phrased as a page title. One H1 per page.`,
    on_project_page: report.project_page?.loaded ? true : null,
  };

  const core = allSections.filter(s => s.prevalence === "universal" || s.prevalence === "majority").sort(byOrder);
  const optional = allSections.filter(s => s.prevalence === "minority").sort(byOrder);

  /* Body-depth section is always recommended, placed after the Q-and-A
     block conceptually; spec carries the word-count target. */
  const bodySection: TemplateSection = {
    id: "body_depth", label: "Body depth",
    prevalence: "universal", present_in: total, cited_total: total,
    spec: targetWordCount
      ? `Cited pages for this query run roughly ${targetWordCount.low}–${targetWordCount.high} words (median ${targetWordCount.median}). Match the depth of the cited median; do not pad. Depth should come from covering the question set thoroughly, not filler.`
      : `Could not measure cited-page word counts (fetches failed). Cover the question set thoroughly; depth follows coverage, not a target number.`,
    on_project_page: report.project_page?.loaded
      ? (targetWordCount ? report.project_page.total_word_count >= Math.round(targetWordCount.median * 0.6) : null)
      : null,
  };

  /* Schema recommendation */
  const recommended_schema: string[] = [];
  for (const s of SCHEMA_DEFS) {
    const presentIn = loaded.filter(p => Boolean(p[s.key])).length;
    if (presentIn >= Math.ceil(total / 2) && total > 0) recommended_schema.push(s.type);
  }

  /* Assemble ordered recommended sections: H1, then summary/tldr/qa from
     core in their natural order, then body depth, then trust signals. */
  const trustIds = new Set(["author_block", "credentials", "freshness"]);
  const contentCore = core.filter(s => !trustIds.has(s.id));
  const trustCore   = core.filter(s => trustIds.has(s.id));
  const sections: TemplateSection[] = [h1Section, ...contentCore, bodySection, ...trustCore];

  /* Project gaps — recommended sections the project page lacks */
  const project_missing = report.project_page && report.project_page.loaded
    ? sections.filter(s => s.on_project_page === false).map(s => s.label)
    : [];

  /* Narrative */
  let narrative: string;
  if (total === 0) {
    narrative = `No cited pages were successfully fetched for "${report.query}", so no template could be derived. Re-run the citation gap step, or check whether the cited domains block automated requests.`;
  } else {
    const schemaTxt = recommended_schema.length ? ` Add ${recommended_schema.join(" + ")} schema.` : ``;
    const gapTxt = project_missing.length
      ? ` Your current page is missing ${project_missing.length} of these recommended sections: ${project_missing.join(", ")}.`
      : report.project_page?.loaded ? ` Your current page already covers the recommended structure.` : ``;
    narrative = `Template for "${report.query}" derived from ${total} pages AI Overview currently cites. The recommended structure below reflects what those pages share.${schemaTxt}${gapTxt} Treat numeric targets as directional given the small sample.`;
  }

  return {
    query: report.query,
    project_url: report.project_url,
    cited_pages_analyzed: total,
    target_word_count: targetWordCount,
    recommended_schema,
    sections,
    optional_sections: optional,
    project_missing,
    narrative,
    enriched: false,
    generated_at: now,
  };
}

/* ─── Site-wide standard across multiple per-query templates ───── */

export function buildSiteWideStandard(templates: ContentStructureTemplate[]): SiteWideStandard {
  const usable = templates.filter(t => t.cited_pages_analyzed > 0);
  const n = usable.length;

  /* Count how many queries recommend each section in their core. */
  const sectionCount = new Map<string, { label: string; inQueries: number; spec: string }>();
  for (const t of usable) {
    for (const s of t.sections) {
      const entry = sectionCount.get(s.id) || { label: s.label, inQueries: 0, spec: s.spec };
      entry.inQueries += 1;
      sectionCount.set(s.id, entry);
    }
  }
  const threshold = Math.ceil(n / 2);
  const standard_sections = Array.from(sectionCount.entries())
    .filter(([, v]) => v.inQueries >= threshold && n > 0)
    .map(([id, v]) => ({ id, label: v.label, in_queries: v.inQueries, spec: v.spec }))
    .sort((a, b) => b.in_queries - a.in_queries);

  /* Schema across queries */
  const schemaCount = new Map<string, number>();
  for (const t of usable) for (const s of t.recommended_schema) schemaCount.set(s, (schemaCount.get(s) || 0) + 1);
  const recommended_schema = Array.from(schemaCount.entries())
    .map(([type, inQ]) => ({ type, in_queries: inQ }))
    .sort((a, b) => b.in_queries - a.in_queries);

  let narrative: string;
  if (n === 0) {
    narrative = `No usable per-query templates, so no site-wide standard could be derived.`;
  } else {
    const top = standard_sections.slice(0, 4).map(s => s.label).join(", ");
    narrative = `Across ${n} analyzed queries, ${standard_sections.length} structural elements recur in the cited pages for a majority of queries${top ? `: ${top}` : ``}. Applying these as a default content standard — on every new page, not just individual targets — is the highest-leverage move, because it shapes content before it ships rather than retrofitting it.`;
  }

  return { queries_considered: n, standard_sections, recommended_schema, narrative };
}

/* ─── Optional LLM enrichment (one batched call for all queries) ── */
/* Generates query-specific suggested headings + a one-line "what to cover"
   per recommended section. Strictly scaffolding; forbidden from inventing
   facts. One round-trip keeps wall-time bounded. On any failure the
   templates are returned unchanged (enriched stays false). */

const ENRICH_SYSTEM = [
  `You are a senior content strategist producing STRUCTURAL scaffolding for SEO writers.`,
  `You are given page templates already derived from real pages that Google's AI Overview cites. Your only job is to make each template easier to execute by proposing, per query:`,
  `- For the question-section ("qa_structure"): 3-6 concrete question-phrased H2 headings a writer could use, phrased the way a real searcher would ask.`,
  `- For each recommended section: a single short line ("cover") describing what that section should contain for THIS query.`,
  ``,
  `HARD RULES — non-negotiable:`,
  `- Do NOT invent facts, statistics, prices, dates, study results, or product claims. You are shaping structure, not writing content.`,
  `- Do NOT promise or imply that following the template guarantees citation or ranking.`,
  `- Headings must be answerable, neutral, and derived from the query intent. No clickbait.`,
  `- If you are unsure what a query means, keep headings generic rather than guessing specifics.`,
  `- Output is DRAFT scaffolding the writer will validate against real user intent. Stay structural.`,
  ``,
  `Return ONLY valid JSON, no prose, no markdown fences, in this exact shape:`,
  `{"templates":[{"query":"<query>","qa_headings":["...","..."],"sections":[{"id":"<section id>","cover":"<one line>"}]}]}`,
].join("\n");

export async function enrichTemplates(
  templates: ContentStructureTemplate[],
  opts?: { industry?: string; maxQueries?: number }
): Promise<ContentStructureTemplate[]> {
  const usable = templates.filter(t => t.cited_pages_analyzed > 0);
  if (usable.length === 0) return templates;

  const cap = Math.max(1, Math.min(opts?.maxQueries ?? 10, usable.length));
  const subset = usable.slice(0, cap);

  /* Compact, structural-only payload for the model. */
  const payload = subset.map(t => ({
    query: t.query,
    recommended_sections: t.sections.map(s => ({ id: s.id, label: s.label })),
    has_qa_section: t.sections.some(s => s.id === "qa_structure"),
  }));

  const user = [
    opts?.industry ? `Industry context: ${opts.industry}` : ``,
    `Templates to enrich (structure only — propose headings and one-line "cover" notes):`,
    JSON.stringify({ templates: payload }),
  ].filter(Boolean).join("\n\n");

  const raw = await llm({
    system: ENRICH_SYSTEM,
    user,
    maxTokens: 2500,
    timeoutMs: 60000,
    label: "geo-content-template",
  });

  const parsed = parseJsonResponse<{ templates: Array<{ query: string; qa_headings?: string[]; sections?: Array<{ id: string; cover?: string }> }> }>(raw);
  if (!parsed || !Array.isArray(parsed.templates)) return templates;

  const byQuery = new Map(parsed.templates.map(p => [String(p.query || "").toLowerCase().trim(), p]));

  return templates.map(t => {
    const enr = byQuery.get(t.query.toLowerCase().trim());
    if (!enr) return t;
    const coverById = new Map((enr.sections || []).map(s => [s.id, s.cover]));
    const sections = t.sections.map(s => {
      const out: TemplateSection = { ...s };
      const cover = coverById.get(s.id);
      if (cover && typeof cover === "string") out.cover = cover.trim();
      if (s.id === "qa_structure" && Array.isArray(enr.qa_headings)) {
        out.suggested_headings = enr.qa_headings.filter(h => typeof h === "string" && h.trim()).slice(0, 6);
      }
      return out;
    });
    return { ...t, sections, enriched: true };
  });
}
