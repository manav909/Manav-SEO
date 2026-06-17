/* ════════════════════════════════════════════════════════════════
   api/lib/brand-studio-ingest.ts
   Brand Studio H.1 — Ingestion engine.

   Accepts multiple formats:
     - PDF      → Anthropic native document API (no parsing library)
     - DOCX     → mammoth (DOCX → plain text)
     - XLSX     → xlsx (SheetJS — Excel → JSON, sent as structured text)
     - CSV/TXT/HTML/MD → existing pattern, plain text
     - URL      → fetch + clean HTML, treat as document with source_url

   Doc-type catalog is broader than V1's tool-export-only list. New
   types map to V2 Data Room categories with their own tool_use
   extraction schemas.

   Discipline carried from prior phases:
   - tool_use for guaranteed structured output (no JSON parse failures)
   - never fabricates: omit fields without evidence
   - explicit confidence per field
   - full provenance: every extracted field writes a row in
     document_field_provenance linking back to the source doc
   - never overwrites existing data unless source ranks higher
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

const MODEL = "claude-sonnet-4-6";

/* ─── Doc-type catalog (expanded beyond V1) ────────────────────── */

interface DocTypeSpec {
  key:                string;
  label:              string;
  description:        string;
  filename_patterns:  RegExp[];      /* used for auto-detection */
  content_patterns:   RegExp[];      /* secondary auto-detection check */
  target_categories:  string[];      /* V2 Data Room categories this typically populates */
  stakeholder_hint:   string;        /* default stakeholder role */
}

export const DOC_TYPES: DocTypeSpec[] = [
  /* ─── V2 strategic docs ─── */
  {
    key: "brand_guidelines",
    label: "Brand Guidelines / Style Guide",
    description: "Visual + verbal identity rules: colors, fonts, voice, tone, prohibited usage.",
    filename_patterns: [/brand[\s_-]*guide/i, /style[\s_-]*guide/i, /visual[\s_-]*identity/i, /brand[\s_-]*book/i],
    content_patterns: [/brand voice|tone of voice|color palette|primary font|tagline|brand archetype/i],
    target_categories: ["content", "brand_narrative", "identity"],
    stakeholder_hint: "client_marketing",
  },
  {
    key: "persona_research",
    label: "Persona / Audience Research",
    description: "Customer interviews, persona definitions, ICP research, audience studies.",
    filename_patterns: [/persona/i, /audience[\s_-]*research/i, /icp/i, /customer[\s_-]*interview/i],
    content_patterns: [/persona|target audience|ideal customer|user research|customer interview/i],
    target_categories: ["audience"],
    stakeholder_hint: "researcher_internal",
  },
  {
    key: "strategy_deck",
    label: "Strategy Deck / GTM Plan",
    description: "Strategic positioning, go-to-market plans, business strategy presentations.",
    filename_patterns: [/strategy/i, /gtm/i, /go[\s_-]*to[\s_-]*market/i, /pitch[\s_-]*deck/i, /business[\s_-]*plan/i],
    content_patterns: [/positioning|differentiation|go to market|business model|growth strategy/i],
    target_categories: ["goal", "commercial", "audience", "identity"],
    stakeholder_hint: "client_executive",
  },
  {
    key: "sales_call_notes",
    label: "Sales Call Notes / Transcripts",
    description: "Notes or transcripts of sales calls — objections, motivations, language patterns.",
    filename_patterns: [/sales[\s_-]*call/i, /call[\s_-]*notes/i, /transcript/i, /meeting[\s_-]*notes/i],
    content_patterns: [/objection|prospect said|customer asked|discovery call/i],
    target_categories: ["audience", "history"],
    stakeholder_hint: "sales_lead",
  },
  {
    key: "customer_feedback",
    label: "Customer Feedback / Testimonials",
    description: "Customer reviews, testimonials, support tickets, satisfaction surveys.",
    filename_patterns: [/feedback/i, /testimonial/i, /review/i, /survey/i, /nps/i, /csat/i],
    content_patterns: [/customer said|review:|testimonial|nps score|csat/i],
    target_categories: ["audience", "content"],
    stakeholder_hint: "customer_advocate",
  },
  {
    key: "legal_compliance",
    label: "Legal / Compliance Document",
    description: "Disclaimers, regulatory requirements, prohibited claims, legal review notes.",
    filename_patterns: [/legal/i, /compliance/i, /disclaimer/i, /terms/i, /gdpr/i, /policy/i],
    content_patterns: [/disclaimer|prohibited|regulatory|legal review|compliance/i],
    target_categories: ["content"],
    stakeholder_hint: "client_legal",
  },
  {
    key: "market_research",
    label: "Market / Industry Research",
    description: "Market sizing, industry reports, trend analyses, third-party research.",
    filename_patterns: [/market[\s_-]*research/i, /industry[\s_-]*report/i, /sector[\s_-]*analysis/i, /tam/i, /sam/i],
    content_patterns: [/market size|industry report|tam|sam|som|cagr|market share/i],
    target_categories: ["commercial", "competitor"],
    stakeholder_hint: "researcher_external",
  },
  {
    key: "press_coverage",
    label: "Press / Media Coverage",
    description: "News articles, press releases, media mentions of the brand or competitors.",
    filename_patterns: [/press/i, /pr[\s_-]*release/i, /news/i, /article/i, /coverage/i],
    content_patterns: [/announced|published|press release|reported|featured in/i],
    target_categories: ["history", "competitor"],
    stakeholder_hint: "press",
  },
  {
    key: "internal_memo",
    label: "Internal Memo / Strategic Note",
    description: "Strategic notes from PM, project briefs, internal communications.",
    filename_patterns: [/memo/i, /brief/i, /internal/i, /strategic[\s_-]*note/i],
    content_patterns: [/internal use|strategy memo|project brief/i],
    target_categories: ["goal", "history"],
    stakeholder_hint: "pm_internal",
  },
  {
    key: "case_study",
    label: "Case Study / Success Story",
    description: "Customer success stories, results write-ups, win documentation.",
    filename_patterns: [/case[\s_-]*study/i, /success[\s_-]*story/i, /win/i],
    content_patterns: [/case study|achieved|results show|increased by|reduced by/i],
    target_categories: ["audience", "history"],
    stakeholder_hint: "customer_advocate",
  },
  {
    key: "ad_brief",
    label: "Advertising / Campaign Brief",
    description: "Ad creative briefs, campaign requirements, media buyer instructions.",
    filename_patterns: [/ad[\s_-]*brief/i, /campaign[\s_-]*brief/i, /creative[\s_-]*brief/i, /media[\s_-]*plan/i],
    content_patterns: [/campaign|creative direction|target audience|media spend/i],
    target_categories: ["audience", "goal"],
    stakeholder_hint: "advertiser",
  },
  {
    key: "partnership_doc",
    label: "Partnership / Vendor Document",
    description: "Partner agreements, vendor briefs, co-marketing materials.",
    filename_patterns: [/partner/i, /vendor/i, /co[\s_-]*marketing/i, /collaboration/i],
    content_patterns: [/partnership|vendor|collaboration agreement/i],
    target_categories: ["commercial"],
    stakeholder_hint: "partner",
  },

  /* ─── V1 SEO tool exports (preserved) ─── */
  { key: "gsc_export",      label: "Google Search Console Export",
    description: "GSC keyword performance export — queries, positions, clicks, impressions.",
    filename_patterns: [/gsc|search[\s_-]*console/i], content_patterns: [/query|impressions|clicks|ctr|position/i],
    target_categories: ["analytics"], stakeholder_hint: "pm_internal" },
  { key: "screaming_frog",  label: "Screaming Frog Crawl Export",
    description: "Screaming Frog SEO Spider crawl results — URLs, status codes, issues.",
    filename_patterns: [/screaming[\s_-]*frog|crawl[\s_-]*export/i], content_patterns: [/screaming frog|crawl depth|response code/i],
    target_categories: ["technical"], stakeholder_hint: "pm_internal" },
  { key: "semrush_export",  label: "Semrush Export",
    description: "Semrush data export — backlinks, positions, traffic, keywords.",
    filename_patterns: [/semrush/i], content_patterns: [/semrush|sem rush/i],
    target_categories: ["analytics", "competitor", "backlinks"], stakeholder_hint: "pm_internal" },
  { key: "ahrefs_export",   label: "Ahrefs Export",
    description: "Ahrefs data export — backlinks, domain rating, organic keywords.",
    filename_patterns: [/ahrefs/i], content_patterns: [/ahrefs|domain rating|referring domains/i],
    target_categories: ["backlinks", "competitor"], stakeholder_hint: "pm_internal" },
  { key: "ga4_export",      label: "Google Analytics 4 Export",
    description: "GA4 export — sessions, users, conversions, behavior data.",
    filename_patterns: [/ga4|analytics/i], content_patterns: [/sessions|users|conversions|bounce rate/i],
    target_categories: ["analytics"], stakeholder_hint: "pm_internal" },
  { key: "audit_report",    label: "Previous SEO Audit Report",
    description: "Audit report from a previous agency or in-house team.",
    filename_patterns: [/audit/i], content_patterns: [/audit report|findings|recommendations/i],
    target_categories: ["technical", "history"], stakeholder_hint: "client_marketing" },
  { key: "pagespeed",       label: "PageSpeed Insights Results",
    description: "Core Web Vitals + PageSpeed scores.",
    filename_patterns: [/pagespeed|page[\s_-]*speed/i], content_patterns: [/lcp|cls|fid|inp|core web vitals/i],
    target_categories: ["technical"], stakeholder_hint: "pm_internal" },

  /* ─── Catch-all ─── */
  { key: "other",           label: "Other Document",
    description: "Anything that doesn't match the categories above.",
    filename_patterns: [], content_patterns: [],
    target_categories: ["manual"], stakeholder_hint: "other" },
];

/* ─── Auto-detect doc type from filename + content ────────────── */

export function detectDocType(filename: string, contentSample: string): {
  detected: string; confidence: "high" | "medium" | "low"; reason: string;
} {
  const fname = filename.toLowerCase();
  const csamp = (contentSample || "").slice(0, 4000);

  for (const dt of DOC_TYPES) {
    if (dt.key === "other") continue;
    /* check filename patterns first — high confidence */
    for (const pat of dt.filename_patterns) {
      if (pat.test(fname)) {
        return { detected: dt.key, confidence: "high", reason: `Filename matched pattern for "${dt.label}"` };
      }
    }
  }

  /* content-based fallback — medium confidence */
  for (const dt of DOC_TYPES) {
    if (dt.key === "other") continue;
    for (const pat of dt.content_patterns) {
      if (pat.test(csamp)) {
        return { detected: dt.key, confidence: "medium", reason: `Content matched pattern for "${dt.label}"` };
      }
    }
  }

  return { detected: "other", confidence: "low", reason: "No filename or content pattern matched. PM should pick the right type." };
}

/* ─── File parsing (PDF/DOCX/XLSX/text) ────────────────────────── */

interface ParsedDoc {
  text:        string;
  pdfBase64?:  string;        /* present for PDF — sent to Anthropic native */
  binary?:     boolean;
  warning?:    string;
}

export async function parseDocumentContent(opts: {
  base64?:    string;          /* base64-encoded file binary */
  text?:      string;          /* already-extracted text (CSV/TXT/HTML) */
  mimeType:   string;
  filename:   string;
}): Promise<ParsedDoc> {
  const { base64, text, mimeType, filename } = opts;

  /* if we already have text, return it directly */
  if (text && !base64) {
    return { text: text.slice(0, 60000) };
  }

  if (!base64) {
    return { text: "", warning: "No content provided." };
  }

  const mt = (mimeType || "").toLowerCase();
  const fn = (filename || "").toLowerCase();

  /* ── PDF — pass through as base64 for Anthropic native API ── */
  if (mt === "application/pdf" || fn.endsWith(".pdf")) {
    return { text: "", pdfBase64: base64 };
  }

  /* ── DOCX via mammoth ── */
  if (mt.includes("wordprocessingml") || fn.endsWith(".docx")) {
    try {
      const buf = Buffer.from(base64, "base64");
      const result = await mammoth.extractRawText({ buffer: buf });
      return { text: (result.value || "").slice(0, 60000) };
    } catch (e: any) {
      return { text: "", warning: `DOCX parse failed: ${e?.message || "unknown error"}` };
    }
  }

  /* ── XLSX via SheetJS ── */
  if (mt.includes("spreadsheetml") || mt.includes("ms-excel") || fn.endsWith(".xlsx") || fn.endsWith(".xls")) {
    try {
      const buf = Buffer.from(base64, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });
      const out: string[] = [];
      for (const sheetName of wb.SheetNames.slice(0, 8)) {           /* cap at 8 sheets */
        const sheet = wb.Sheets[sheetName];
        out.push(`=== Sheet: ${sheetName} ===`);
        /* CSV-like text per sheet — easier for the AI to read than JSON */
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        out.push(csv.slice(0, 8000));
      }
      return { text: out.join("\n").slice(0, 60000) };
    } catch (e: any) {
      return { text: "", warning: `XLSX parse failed: ${e?.message || "unknown error"}` };
    }
  }

  /* ── CSV / TXT / HTML / Markdown / JSON — decode base64 as utf-8 text ── */
  try {
    const buf = Buffer.from(base64, "base64");
    const decoded = buf.toString("utf-8");
    /* light HTML cleanup if it looks like HTML */
    if (mt.includes("html") || fn.endsWith(".html") || /<html|<body|<head/i.test(decoded.slice(0, 500))) {
      const cleaned = decoded
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { text: cleaned.slice(0, 60000) };
    }
    /* check for binary content */
    const nonPrintable = (decoded.match(/[\x00-\x08\x0e-\x1f\x7f-\x9f]/g) || []).length;
    if (nonPrintable > 100) {
      return { text: "", binary: true, warning: "File appears to be binary. Convert to text-based format first." };
    }
    return { text: decoded.slice(0, 60000) };
  } catch (e: any) {
    return { text: "", warning: `Parse failed: ${e?.message || "unknown error"}` };
  }
}

/* ─── URL ingestion ────────────────────────────────────────────── */

export async function fetchUrlContent(url: string): Promise<{
  text: string; title?: string; warning?: string;
}> {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) {
      return { text: "", warning: "Only http(s) URLs are supported." };
    }
  } catch {
    return { text: "", warning: "Invalid URL." };
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,text/plain,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) return { text: "", warning: `Fetch returned ${res.status}` };
    const html = await res.text();
    /* try to extract title */
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;
    /* clean HTML to readable text */
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    return { text: cleaned.slice(0, 60000), title };
  } catch (e: any) {
    return { text: "", warning: `Fetch failed: ${e?.message || "unknown error"}` };
  }
}

/* ─── V2 field schemas — what each Data Room category accepts ─── */

/* This is the AUTHORITATIVE list of fields the extractor can write to.
   Keeping it inline (not querying schema dynamically) so the AI sees a
   stable contract. Categories match DATA_REQUIREMENTS in DataRoom.tsx. */
const V2_FIELD_CATALOG: Record<string, string[]> = {
  identity: [
    "client_name", "legal_entity", "industry", "industry_specific", "business_model",
    "lifecycle_stage", "primary_offering", "unique_value_prop", "geographic_markets",
    "languages", "year_founded", "public_or_private", "headcount", "annual_revenue",
  ],
  audience: [
    "ideal_customer_profile", "persona_1_name", "persona_1_motivations", "persona_1_objections",
    "persona_2_name", "persona_2_motivations", "persona_2_objections",
    "persona_3_name", "persona_3_motivations", "persona_3_objections",
    "search_intent_split", "funnel_focus", "positioning_statement",
  ],
  content: [
    "brand_voice", "brand_tone_words", "reading_level", "content_themes",
    "prohibited_topics", "required_disclaimers",
  ],
  brand_narrative: [
    "origin_story", "mission_statement", "vision_statement", "values",
    "brand_personality_archetype", "story_arc", "primary_tagline", "secondary_taglines",
  ],
  goal: [
    "primary_goal_narrative", "secondary_goals", "anti_goals", "report_audience",
    "target_keywords",
  ],
  commercial: [
    "engagement_type", "monthly_hours", "deliverables_expected", "point_of_contact_role",
    "decision_maker_role", "value_per_lead", "value_per_customer",
  ],
  history: [
    "prior_seo_work", "prior_agency_name", "what_worked", "what_didnt_work",
    "active_penalties", "penalty_notes", "recent_migrations", "recent_redesigns",
    "algorithm_impacts", "business_changes",
  ],
  competitor: [
    "competitor_1", "competitor_2", "competitor_3",
    "competitor_1_position", "competitor_2_position", "competitor_3_position",
    "differentiation",
  ],
  backlinks: [
    "domain_rating_ahrefs", "referring_domains", "link_building_approach",
  ],
  analytics: [
    "organic_sessions_monthly", "organic_sessions_baseline_date", "top_landing_pages",
    "bounce_rate", "avg_session_duration", "conversions_monthly",
    "gsc_total_impressions", "gsc_total_clicks", "gsc_avg_position",
  ],
  technical: [
    "pages_indexed", "pages_submitted", "crawl_errors", "broken_links",
    "duplicate_content", "schema_markup", "sitemap_url", "robots_txt", "canonical_issues",
  ],
};

/* ─── Extraction tool schema — generic, used for all doc types ── */

function buildExtractionToolSchema(targetCategories: string[]) {
  /* Build per-category enum constraints so the AI can only write to
     known fields. We accept all V2 categories so cross-cutting docs
     (e.g. a strategy deck that touches goal + commercial + audience)
     can populate all of them. */
  const allowedCategories = Object.keys(V2_FIELD_CATALOG);

  return {
    type: "object" as const,
    properties: {
      doc_summary: {
        type: "string",
        description: "1-2 sentence summary of what this document is and what it contains.",
      },
      data_quality: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "Overall quality of evidence in this document — how confidently can we extract from it.",
      },
      knowledge_fields: {
        type: "array",
        description: `Data Room fields you can extract from this document. ONLY include fields where the document contains real evidence. The document was tagged as type relevant to these target categories (but you may write to any V2 category if evidence supports it): ${targetCategories.join(", ")}.`,
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: allowedCategories,
              description: "V2 Data Room category." },
            field_key: { type: "string",
              description: "Field key — MUST match one of the valid keys for the chosen category (see V2_FIELD_CATALOG in the system prompt)." },
            value: { type: "string",
              description: "The extracted value, as a string. Be specific and concrete." },
            confidence: { type: "string", enum: ["high", "medium", "low"],
              description: "high = directly stated; medium = clearly implied; low = inferred (rare)." },
            evidence: { type: "string",
              description: "1-2 sentences citing exactly what in the document supports this value. Quote sparingly (<15 words)." },
            source_location: { type: "string",
              description: "Optional — where in the document this came from (page number, section heading, paragraph location)." },
          },
          required: ["category", "field_key", "value", "confidence", "evidence"],
        },
      },
      key_findings: {
        type: "array",
        items: { type: "string" },
        description: "3-8 specific, actionable findings from this document. Concrete facts, numbers, observations.",
      },
      open_questions: {
        type: "array",
        items: { type: "string" },
        description: "Questions raised by this document that the PM should follow up on.",
      },
    },
    required: ["doc_summary", "data_quality", "knowledge_fields", "key_findings"],
  };
}

/* ─── Per doc-type system prompt builder ──────────────────────── */

function buildSystemPrompt(docTypeKey: string): string {
  const dt = DOC_TYPES.find((d) => d.key === docTypeKey) || DOC_TYPES[DOC_TYPES.length - 1];

  const catalogText = Object.entries(V2_FIELD_CATALOG)
    .map(([cat, keys]) => `  ${cat}: ${keys.join(", ")}`).join("\n");

  /* Per-doc-type extraction guidance */
  const guidanceByType: Record<string, string> = {
    brand_guidelines:
      "Focus: brand voice/tone, color palette (note: just describe; the colors will be stored as text), font names, primary tagline, prohibited usage/topics, required disclaimers, brand archetype, mission/vision/values if present.",
    persona_research:
      "Focus: ICP definition, persona names (titles/roles, NOT personal names), persona motivations + objections, demographic/firmographic data, customer language patterns, persona priority.",
    strategy_deck:
      "Focus: primary goal narrative, anti-goals, secondary goals, positioning statement, UVP, target audience, geographic markets, lifecycle stage, business model, commercial structure.",
    sales_call_notes:
      "Focus: persona objections (what blocks the sale), persona motivations (what drives them), language patterns, what worked in pitches, what didn't work, decision-maker roles.",
    customer_feedback:
      "Focus: persona motivations (why they bought), persona objections (concerns they had), content themes from their language, value-per-customer hints if revenue mentioned.",
    legal_compliance:
      "Focus: prohibited_topics (what we cannot claim), required_disclaimers (what we must include), regulatory constraints affecting content. Be conservative — when in doubt, include.",
    market_research:
      "Focus: industry sizing if quoted, industry-specific context, competitor positioning if covered, differentiation opportunities. CITE the source of any market size figure.",
    press_coverage:
      "Focus: what was said about the brand publicly (history), competitor mentions (positioning hints), algorithm impacts if SEO-related.",
    internal_memo:
      "Focus: strategic direction, project briefs, decisions made, context that explains current state.",
    case_study:
      "Focus: persona motivations (why they bought), what worked (history.what_worked), measurable outcomes if quoted.",
    ad_brief:
      "Focus: target audience definition, persona details, goal/secondary_goals, content themes the ads should hit.",
    partnership_doc:
      "Focus: commercial structure, deliverables, decision_maker_role, engagement type.",
    /* V1 tool exports */
    gsc_export: "Focus: analytics fields — impressions, clicks, average position, top landing pages, target keywords.",
    screaming_frog: "Focus: technical fields — pages indexed, crawl errors, broken links, duplicate content, schema markup, canonical issues.",
    semrush_export: "Focus: backlinks, competitor data, organic positions, traffic estimates.",
    ahrefs_export: "Focus: backlinks (DR, referring domains, link building approach), competitor data.",
    ga4_export: "Focus: analytics — sessions, conversions, bounce rate, top landing pages.",
    audit_report: "Focus: technical baseline, history (what was found), recommendations (note for action items).",
    pagespeed: "Focus: technical fields — Core Web Vitals, performance scores.",
    other: "Extract any V2 field where the document contains real evidence. Be conservative — if unsure, omit.",
  };

  const guidance = guidanceByType[docTypeKey] || guidanceByType.other;

  return [
    `You are a senior digital marketing strategist and brand analyst extracting structured data from a ${dt.label}.`,
    "",
    `Document type: ${dt.label}`,
    `Description: ${dt.description}`,
    "",
    "Your task: extract Data Room field values from this document. You MUST call the `submit_extraction` tool with your output. Do not write prose outside the tool call.",
    "",
    "HARD RULES:",
    "1. ONLY extract fields where the document contains real, specific evidence. If the document doesn't address a field, OMIT it. Never guess.",
    "2. NEVER fabricate specific numbers (employee counts, revenue, percentages, market sizes) — only include if the document literally states them.",
    "3. For select-type fields, you MUST use one of the allowed values exactly. If none fit, omit the field.",
    "4. Every extracted field carries: category, field_key, value, confidence, evidence (citing the source). Quote sparingly — under 15 words per quote.",
    "5. CONFIDENCE LEVELS:",
    "   - high: directly stated in the document",
    "   - medium: clearly implied",
    "   - low: inferred with some risk (rare — usually omit instead)",
    "6. NEVER write to V1 categories (analytics, technical, competitor, backlinks) unless this is a tool export document. Strategic documents write to V2 categories (identity, audience, content, brand_narrative, goal, commercial, history).",
    "",
    `Doc-type focus: ${guidance}`,
    "",
    "VALID FIELDS (write to these only — invalid field_key values will be silently dropped):",
    catalogText,
    "",
    "Be a strategist: read the document for what it actually says about the business, then map insights to fields. Don't force-fit; if a field doesn't have evidence here, skip it.",
  ].join("\n");
}

/* ─── Main extraction function ────────────────────────────────── */

interface ExtractionResult {
  doc_summary:       string;
  data_quality:      "high" | "medium" | "low";
  knowledge_fields:  Array<{
    category:         string;
    field_key:        string;
    value:            string;
    confidence:       "high" | "medium" | "low";
    evidence:         string;
    source_location?: string;
  }>;
  key_findings:      string[];
  open_questions?:   string[];
}

async function extractFromDocument(opts: {
  docTypeKey:  string;
  textContent: string;
  pdfBase64?:  string;
  fileName:    string;
}): Promise<{ result?: ExtractionResult; error?: string; tokensUsed?: any }> {
  const dt = DOC_TYPES.find((d) => d.key === opts.docTypeKey) || DOC_TYPES[DOC_TYPES.length - 1];
  const system = buildSystemPrompt(opts.docTypeKey);
  const schema = buildExtractionToolSchema(dt.target_categories);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  /* Build user content — PDF goes as document block, others as text */
  const userContent: any[] = [];
  if (opts.pdfBase64) {
    userContent.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: opts.pdfBase64 },
    });
    userContent.push({
      type: "text",
      text: `Document filename: ${opts.fileName}\n\nExtract Data Room fields from this PDF using the submit_extraction tool.`,
    });
  } else {
    userContent.push({
      type: "text",
      text: [
        `Document filename: ${opts.fileName}`,
        `Document type: ${dt.label}`,
        "",
        "DOCUMENT CONTENT:",
        opts.textContent || "(empty)",
        "",
        "Extract Data Room fields using the submit_extraction tool.",
      ].join("\n"),
    });
  }

  try {
    const resp = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 8000,
      system,
      messages:   [{ role: "user", content: userContent }],
      tools: [{
        name: "submit_extraction",
        description: "Submit structured Data Room field extractions from the document. Call exactly once with all your findings.",
        input_schema: schema as any,
      }],
      tool_choice: { type: "tool", name: "submit_extraction" },
    });

    /* find the tool_use block */
    let toolInput: any = null;
    for (const block of (resp.content || [])) {
      if ((block as any).type === "tool_use" && (block as any).name === "submit_extraction") {
        toolInput = (block as any).input;
        break;
      }
    }
    if (!toolInput) return { error: "AI did not return structured output" };

    /* server-side validate field_key against V2_FIELD_CATALOG */
    const validatedFields: ExtractionResult["knowledge_fields"] = [];
    for (const f of (toolInput.knowledge_fields || [])) {
      if (!f || typeof f !== "object") continue;
      const cat = String(f.category || "").toLowerCase();
      const key = String(f.field_key || "").trim();
      const val = String(f.value || "").trim();
      if (!cat || !key || !val) continue;
      const allowedKeys = V2_FIELD_CATALOG[cat];
      if (!allowedKeys || !allowedKeys.includes(key)) continue;        /* silently drop unknown */
      const conf = String(f.confidence || "").toLowerCase();
      validatedFields.push({
        category:        cat,
        field_key:       key,
        value:           val,
        confidence:      (conf === "high" || conf === "medium" || conf === "low") ? conf : "medium",
        evidence:        String(f.evidence || "").slice(0, 500),
        source_location: f.source_location ? String(f.source_location).slice(0, 200) : undefined,
      });
    }

    return {
      result: {
        doc_summary:      String(toolInput.doc_summary || ""),
        data_quality:     (toolInput.data_quality === "high" || toolInput.data_quality === "low") ? toolInput.data_quality : "medium",
        knowledge_fields: validatedFields,
        key_findings:     Array.isArray(toolInput.key_findings) ? toolInput.key_findings.slice(0, 12).map((s: any) => String(s)) : [],
        open_questions:   Array.isArray(toolInput.open_questions) ? toolInput.open_questions.slice(0, 8).map((s: any) => String(s)) : [],
      },
      tokensUsed: resp.usage,
    };
  } catch (e: any) {
    return { error: e?.message || "AI extraction failed" };
  }
}

/* ─── Write extracted fields to project_knowledge + provenance ── */

async function writeExtractedFields(opts: {
  projectId:  string;
  documentId: string;
  fields:     ExtractionResult["knowledge_fields"];
  sourceName: string;
}): Promise<{ written: number; skipped: number; details: any[] }> {
  let written = 0;
  let skipped = 0;
  const details: any[] = [];
  const today = new Date().toISOString().slice(0, 10);

  /* fetch existing fields once — never overwrite manual or GSC/GA4 auto-synced */
  const { data: existing } = await db().from("project_knowledge")
    .select("category,field_key,field_value,source").eq("project_id", opts.projectId);
  const existingMap: Record<string, Record<string, { value: string; source: string }>> = {};
  for (const r of (existing || [])) {
    const k = r as any;
    (existingMap[k.category] ||= {})[k.field_key] = { value: k.field_value || "", source: k.source || "" };
  }

  /* source priority: manual/GSC/GA4 > document_extracted > ai_inferred.
     Documents promote ai_inferred values but never overwrite manual or auto-synced. */
  const NEVER_OVERWRITE = new Set(["manual", "gsc_auto", "ga4_auto", "seed_migration"]);

  for (const f of opts.fields) {
    const ex = existingMap[f.category]?.[f.field_key];
    if (ex && ex.value && NEVER_OVERWRITE.has(ex.source)) {
      skipped++;
      details.push({ ...f, action: "skipped_existing", existing_source: ex.source });
      continue;
    }

    const notes = JSON.stringify({
      confidence:   f.confidence,
      evidence:     f.evidence,
      source_doc:   opts.documentId,
      extracted_at: new Date().toISOString(),
      source_location: f.source_location,
    });

    try {
      await db().from("project_knowledge").upsert({
        project_id:  opts.projectId,
        category:    f.category,
        field_key:   f.field_key,
        field_value: f.value,
        source:      "document_extracted",
        source_name: opts.sourceName,
        data_date:   today,
        notes,
        updated_at:  new Date().toISOString(),
      }, { onConflict: "project_id,category,field_key" });

      /* provenance row */
      try {
        await db().from("document_field_provenance").upsert({
          document_id:        opts.documentId,
          project_id:         opts.projectId,
          category:           f.category,
          field_key:          f.field_key,
          extracted_value:    f.value,
          extracted_at:       new Date().toISOString(),
          contribution_weight: 1.0,
          source_location:    f.source_location || null,
        }, { onConflict: "document_id,category,field_key" });
      } catch (e: any) {
        console.error("[bs-ingest] provenance write failed:", e?.message);
      }

      written++;
      details.push({ ...f, action: "written" });
    } catch (e: any) {
      details.push({ ...f, action: "failed", error: e?.message });
    }
  }

  return { written, skipped, details };
}

/* ─── Public action handlers ──────────────────────────────────── */

/** Returns the doc type catalog for the frontend dropdown. */
export function bsGetDocTypes() {
  return {
    success: true,
    doc_types: DOC_TYPES.map((d) => ({
      key: d.key, label: d.label, description: d.description,
      target_categories: d.target_categories, stakeholder_hint: d.stakeholder_hint,
    })),
  };
}

/** Auto-detect doc type from filename + content sample.
 *  Used by the frontend AFTER the file is parsed but BEFORE extraction
 *  runs, so the PM can confirm or override. */
export function bsDetectDocType(body: any) {
  const { filename = "", contentSample = "" } = body;
  return { success: true, ...detectDocType(filename, contentSample) };
}

/** Two-step ingest:
 *    Step 1 — parse the file/URL, save to project_documents, return doc id + detection
 *    Step 2 — PM confirms/overrides doc type + stakeholder, calls bs_ingest_extract
 *  Splitting these keeps the UX clear and lets the PM correct misdetections
 *  before AI tokens are spent. */
export async function bsIngestFile(body: any): Promise<any> {
  const {
    projectId,
    fileName, base64, mimeType, text,
    stakeholderRole, providedBy, audienceRole,
  } = body;

  if (!projectId)  return { success: false, error: "projectId required" };
  if (!fileName)   return { success: false, error: "fileName required" };
  if (!stakeholderRole) return { success: false, error: "stakeholderRole required (who provided this document)" };

  /* Parse content */
  const parsed = await parseDocumentContent({ base64, text, mimeType: mimeType || "", filename: fileName });
  if (parsed.binary) {
    return { success: false, error: parsed.warning || "Binary file — convert to text format first" };
  }
  if (!parsed.text && !parsed.pdfBase64) {
    return { success: false, error: parsed.warning || "Could not extract content from file" };
  }

  /* Auto-detect */
  const detection = detectDocType(fileName, parsed.text || "");

  /* Save to project_documents — with all H.0 V2 fields */
  const sizeKb = base64 ? Math.round((base64.length * 0.75) / 1024) : Math.round((parsed.text.length || 0) / 1024);
  const { data, error } = await db().from("project_documents").insert({
    project_id:        projectId,
    name:              fileName,
    doc_type:          detection.detected,
    kind:              "ingested",
    stakeholder_role:  stakeholderRole,
    provided_by:       providedBy || null,
    audience_role:     audienceRole || null,
    raw_content:       (parsed.text || "").slice(0, 50000),
    file_size_kb:      sizeKb,
    source_date:       new Date().toISOString().slice(0, 10),
    confidence:        null,                                         /* set after extraction */
    doc_status:        "draft",
    /* NOTE: pdfBase64 isn't saved — too large; the AI sees it during
       extraction, then we discard it. The doc summary lives in raw_content
       after extraction completes. */
  }).select().single();

  if (error || !data) {
    return { success: false, error: error?.message || "Failed to save document" };
  }

  /* If PDF, stash the base64 in-memory in the response so the frontend
     can pass it back for extraction step. Don't store in DB. */
  return {
    success: true,
    document_id: (data as any).id,
    document:    data,
    detection,
    parsed_text_preview: parsed.text?.slice(0, 2000),
    pdf_in_memory:       !!parsed.pdfBase64,                       /* signal — extract step needs base64 */
  };
}

/** URL ingestion variant. Fetches the URL, treats result as a document. */
export async function bsIngestUrl(body: any): Promise<any> {
  const { projectId, url, stakeholderRole, providedBy, audienceRole } = body;
  if (!projectId)        return { success: false, error: "projectId required" };
  if (!url)              return { success: false, error: "url required" };
  if (!stakeholderRole)  return { success: false, error: "stakeholderRole required" };

  const fetched = await fetchUrlContent(url);
  if (!fetched.text)     return { success: false, error: fetched.warning || "Could not fetch URL" };

  const fileName = fetched.title || (() => {
    try { return new URL(url).hostname + new URL(url).pathname; } catch { return url; }
  })();

  const detection = detectDocType(fileName, fetched.text);
  const sizeKb = Math.round(fetched.text.length / 1024);

  const { data, error } = await db().from("project_documents").insert({
    project_id:        projectId,
    name:              fileName.slice(0, 240),
    doc_type:          detection.detected,
    kind:              "ingested",
    stakeholder_role:  stakeholderRole,
    provided_by:       providedBy || null,
    audience_role:     audienceRole || null,
    source_url:        url,
    raw_content:       fetched.text.slice(0, 50000),
    file_size_kb:      sizeKb,
    source_date:       new Date().toISOString().slice(0, 10),
    doc_status:        "draft",
  }).select().single();

  if (error || !data) return { success: false, error: error?.message || "Failed to save document" };

  return {
    success: true,
    document_id: (data as any).id,
    document:    data,
    detection,
    parsed_text_preview: fetched.text.slice(0, 2000),
  };
}

/** Step 2 — extract knowledge from a document.
 *  Called after the PM confirms/overrides doc type + stakeholder.
 *  Pass pdfBase64 back if the doc was a PDF (frontend kept it in memory). */
export async function bsIngestExtract(body: any): Promise<any> {
  const { documentId, docTypeOverride, pdfBase64 } = body;
  if (!documentId) return { success: false, error: "documentId required" };

  /* fetch the document */
  const { data: doc } = await db().from("project_documents")
    .select("*").eq("id", documentId).maybeSingle();
  if (!doc) return { success: false, error: "document not found" };
  const d = doc as any;

  /* if PM overrode doc type, update it */
  const finalDocType = docTypeOverride || d.doc_type || "other";
  if (docTypeOverride && docTypeOverride !== d.doc_type) {
    await db().from("project_documents").update({ doc_type: docTypeOverride }).eq("id", documentId);
  }

  /* run extraction */
  const { result, error, tokensUsed } = await extractFromDocument({
    docTypeKey:  finalDocType,
    textContent: d.raw_content || "",
    pdfBase64:   pdfBase64 || undefined,
    fileName:    d.name || "document",
  });
  if (error || !result) return { success: false, error: error || "extraction failed" };

  /* write fields */
  const writeResult = await writeExtractedFields({
    projectId:  d.project_id,
    documentId: documentId,
    fields:     result.knowledge_fields,
    sourceName: d.name || "Document",
  });

  /* update document with extraction metadata */
  await db().from("project_documents").update({
    extracted_data: {
      doc_summary:   result.doc_summary,
      data_quality:  result.data_quality,
      key_findings:  result.key_findings,
      open_questions: result.open_questions,
      fields_extracted: result.knowledge_fields.length,
      fields_written:   writeResult.written,
      fields_skipped:   writeResult.skipped,
      extracted_at: new Date().toISOString(),
    },
    confidence: result.data_quality,
  }).eq("id", documentId);

  return {
    success: true,
    summary: result.doc_summary,
    data_quality: result.data_quality,
    fields_extracted: result.knowledge_fields.length,
    fields_written: writeResult.written,
    fields_skipped: writeResult.skipped,
    key_findings: result.key_findings,
    open_questions: result.open_questions,
    write_details: writeResult.details,
    tokens: tokensUsed,
  };
}

/** Return the full document detail including extracted_data + provenance. */
export async function bsGetDocumentDetail(body: any): Promise<any> {
  const { documentId } = body;
  if (!documentId) return { success: false, error: "documentId required" };

  const { data: doc } = await db().from("project_documents")
    .select("*").eq("id", documentId).maybeSingle();
  if (!doc) return { success: false, error: "document not found" };

  const { data: provRows } = await db().from("document_field_provenance")
    .select("category,field_key,extracted_value,extracted_at,source_location")
    .eq("document_id", documentId);

  return {
    success: true,
    document: doc,
    provenance: provRows || [],
  };
}

/** Delete a document. Cascades to document_field_provenance via FK.
 *  Does NOT delete the project_knowledge rows — those are kept as the
 *  current source-of-truth value, but they lose their provenance link.
 *  Future enhancement: optionally re-extract from remaining docs. */
export async function bsDeleteDocument(body: any): Promise<any> {
  const { documentId } = body;
  if (!documentId) return { success: false, error: "documentId required" };
  const { error } = await db().from("project_documents").delete().eq("id", documentId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Get document provenance for a specific Data Room field — used by the
 *  field UI to show "this value came from these documents." */
export async function bsGetFieldProvenance(body: any): Promise<any> {
  const { projectId, category, fieldKey } = body;
  if (!projectId || !category || !fieldKey) {
    return { success: false, error: "projectId, category, fieldKey all required" };
  }
  const { data } = await db().from("document_field_provenance")
    .select("id,document_id,extracted_value,extracted_at,source_location")
    .eq("project_id", projectId).eq("category", category).eq("field_key", fieldKey);
  if (!data || data.length === 0) return { success: true, sources: [] };

  /* enrich with document names */
  const docIds = (data as any[]).map((r) => r.document_id);
  const { data: docs } = await db().from("project_documents")
    .select("id,name,doc_type,kind,stakeholder_role").in("id", docIds);
  const docMap = new Map<string, any>();
  for (const d of (docs || [])) docMap.set((d as any).id, d);

  return {
    success: true,
    sources: (data as any[]).map((r) => ({
      document_id:     r.document_id,
      document_name:   docMap.get(r.document_id)?.name,
      doc_type:        docMap.get(r.document_id)?.doc_type,
      stakeholder:     docMap.get(r.document_id)?.stakeholder_role,
      extracted_value: r.extracted_value,
      extracted_at:    r.extracted_at,
      source_location: r.source_location,
    })),
  };
}

/* ═══════════════════════════════════════════════════════════════
   Phase 1C — Document image attachments

   Endpoints:
   - bs_attach_image          PM uploads an image to a document
   - bs_list_attachments      List a document's attachments with fresh
                              1-hour signed URLs
   - bs_delete_attachment     Remove an attachment (DB row + storage)
   - bs_refresh_attachment_url Re-sign a single URL (rarely needed —
                              list already returns fresh URLs)

   Storage: bucket 'document-attachments', path '<project_id>/<id>.<ext>'.
   25MB hard cap (matches client_upload pipeline). Compression happens
   client-side before upload.
═══════════════════════════════════════════════════════════════ */

const ATTACHMENT_BUCKET     = "document-attachments";
const ATTACHMENT_SIGNED_TTL = 3600;  /* 1 hour */
const ATTACHMENT_MAX_BYTES  = 25 * 1024 * 1024;
const ATTACHMENT_ALLOWED_TYPES = new Set([
  "image/jpeg","image/png","image/webp","image/gif","image/svg+xml",
]);

function extFromContentType(ct: string): string {
  switch (ct) {
    case "image/jpeg":   return "jpg";
    case "image/png":    return "png";
    case "image/webp":   return "webp";
    case "image/gif":    return "gif";
    case "image/svg+xml":return "svg";
    default:             return "bin";
  }
}

async function freshSignedUrl(storagePath: string): Promise<string | null> {
  try {
    const { data, error } = await db().storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(storagePath, ATTACHMENT_SIGNED_TTL);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch { return null; }
}

export async function bsAttachImage(body: any): Promise<any> {
  const {
    documentId, projectId,
    fileName, contentType, base64,
    alt, caption, width, height,
    uploadedByType, uploadedById, uploadedByLabel,
  } = body;

  if (!documentId || !projectId) return { success: false, error: "documentId + projectId required" };
  if (!base64) return { success: false, error: "base64 content required" };
  if (!contentType || !ATTACHMENT_ALLOWED_TYPES.has(contentType)) {
    return { success: false, error: `Unsupported content_type. Allowed: ${[...ATTACHMENT_ALLOWED_TYPES].join(", ")}` };
  }

  /* Decode base64 — accept either pure base64 or data-URL prefix */
  let cleanB64 = String(base64);
  const dataUrlMatch = cleanB64.match(/^data:[^;]+;base64,(.+)$/);
  if (dataUrlMatch) cleanB64 = dataUrlMatch[1];
  let buffer: Buffer;
  try {
    buffer = Buffer.from(cleanB64, "base64");
  } catch (e: any) {
    return { success: false, error: "Invalid base64: " + (e?.message || "unknown") };
  }
  if (buffer.length === 0) return { success: false, error: "Empty image data" };
  if (buffer.length > ATTACHMENT_MAX_BYTES) {
    return { success: false, error: `Image exceeds 25MB cap (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Compress first.` };
  }

  /* Verify document belongs to project */
  const { data: doc } = await db().from("project_documents")
    .select("project_id").eq("id", documentId).maybeSingle();
  if (!doc) return { success: false, error: "Document not found" };
  if ((doc as any).project_id !== projectId) return { success: false, error: "Document not on this project" };

  /* Generate attachment ID + storage path */
  const attachmentId = (globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `att_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  const ext  = extFromContentType(contentType);
  const path = `${projectId}/${attachmentId}.${ext}`;

  /* Upload to storage */
  const { error: upErr } = await db().storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, buffer, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });
  if (upErr) {
    return { success: false, error: `Storage upload failed: ${upErr.message}` };
  }

  /* Insert metadata row */
  const { data: row, error: insErr } = await db().from("document_attachments").insert({
    id:               attachmentId,
    document_id:      documentId,
    project_id:       projectId,
    name:             String(fileName || `image.${ext}`).slice(0, 200),
    content_type:     contentType,
    size_bytes:       buffer.length,
    storage_path:     path,
    alt:              alt ? String(alt).slice(0, 500) : null,
    caption:          caption ? String(caption).slice(0, 500) : null,
    width:            width != null  ? Number(width)  : null,
    height:           height != null ? Number(height) : null,
    uploaded_by_type: uploadedByType === "client" ? "client" : "staff",
    uploaded_by_id:   uploadedById   ? String(uploadedById)   : null,
    uploaded_by_label:uploadedByLabel? String(uploadedByLabel): null,
  }).select().single();

  if (insErr || !row) {
    /* Roll back the storage object so we don't orphan it */
    await db().storage.from(ATTACHMENT_BUCKET).remove([path]).catch(() => {});
    return { success: false, error: `DB insert failed: ${insErr?.message || "unknown"}` };
  }

  /* Fresh signed URL for immediate use */
  const signedUrl = await freshSignedUrl(path);

  return {
    success: true,
    attachment: {
      ...row,
      signedUrl,
    },
  };
}

export async function bsListAttachments(body: any): Promise<any> {
  const { documentId } = body;
  if (!documentId) return { success: false, error: "documentId required" };

  const { data, error } = await db().from("document_attachments")
    .select("*").eq("document_id", documentId)
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };

  const rows = data || [];
  /* Mint fresh signed URLs in parallel */
  const withUrls = await Promise.all(rows.map(async (r: any) => ({
    ...r,
    signedUrl: await freshSignedUrl(r.storage_path),
  })));

  return { success: true, attachments: withUrls };
}

export async function bsDeleteAttachment(body: any): Promise<any> {
  const { id, projectId } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };

  const { data: row } = await db().from("document_attachments")
    .select("storage_path,project_id").eq("id", id).maybeSingle();
  if (!row) return { success: false, error: "Attachment not found" };
  if ((row as any).project_id !== projectId) return { success: false, error: "Wrong project" };

  /* Delete storage object first; if that fails we still remove the row
     so it's not a dangling reference in the viewer */
  await db().storage.from(ATTACHMENT_BUCKET).remove([(row as any).storage_path]).catch(() => {});

  const { error } = await db().from("document_attachments").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function bsRefreshAttachmentUrl(body: any): Promise<any> {
  const { id } = body;
  if (!id) return { success: false, error: "id required" };
  const { data: row } = await db().from("document_attachments")
    .select("storage_path").eq("id", id).maybeSingle();
  if (!row) return { success: false, error: "Attachment not found" };
  const signedUrl = await freshSignedUrl((row as any).storage_path);
  if (!signedUrl) return { success: false, error: "Could not sign URL" };
  return { success: true, signedUrl };
}

/* ─── Dispatcher ──────────────────────────────────────────────── */

export async function handleBrandStudioIngest(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "bs_get_doc_types":      return bsGetDocTypes();
    case "bs_detect_doc_type":    return bsDetectDocType(body);
    case "bs_ingest_file":        return bsIngestFile(body);
    case "bs_ingest_url":         return bsIngestUrl(body);
    case "bs_ingest_extract":     return bsIngestExtract(body);
    case "bs_get_document":       return bsGetDocumentDetail(body);
    case "bs_delete_document":    return bsDeleteDocument(body);
    case "bs_get_field_provenance": return bsGetFieldProvenance(body);
    /* Phase 1C — attachments */
    case "bs_attach_image":          return bsAttachImage(body);
    case "bs_list_attachments":      return bsListAttachments(body);
    case "bs_delete_attachment":     return bsDeleteAttachment(body);
    case "bs_refresh_attachment_url":return bsRefreshAttachmentUrl(body);
    default: return null;
  }
}
