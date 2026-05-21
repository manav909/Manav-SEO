/* ════════════════════════════════════════════════════════════════
   api/lib/brand-studio-generate.ts
   Brand Studio H.2 — Document generation engine.

   Consumes any TemplateSpec from brand-studio-templates.ts uniformly.
   Pulls Data Room + brand assets + relevant ingested documents,
   generates the document via tool_use (guaranteed structured output),
   enforces source citation per section, saves as a versioned
   project_documents row with kind='generated' and full provenance.

   Discipline:
   - Required categories MUST be populated; refuses to generate
     otherwise with a clear "needs X" message.
   - Every section carries: content, sources_cited (array of IDs),
     confidence (high/medium/low).
   - Source IDs use stable schema: dataroom:<cat>.<key>, doc:<id>,
     brand:<asset>, ASSUMPTION (explicit, never silent).
   - investor_grade strictness penalises uncited sections at validation.
   - Versioning: regeneration creates v=N+1 with parent_document_id
     linking back to the previous version.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import Anthropic from "@anthropic-ai/sdk";
import {
  getTemplate, publicTemplateCatalog, type TemplateSpec, type SectionSpec,
} from "./brand-studio-templates.js";

const MODEL = "claude-sonnet-4-6";

/* ─── Source gathering ────────────────────────────────────────── */

interface SourceBundle {
  project:      any;
  client:       any;
  brand_assets: any;
  knowledge:    Record<string, Record<string, { value: string; source: string; notes?: string }>>;
  documents:    Array<{
    id:               string;
    name:             string;
    doc_type:         string;
    stakeholder_role: string | null;
    raw_excerpt:      string;
    extracted_summary: string | null;
    key_findings:     string[];
  }>;
  /* H.3 — investor data, populated only for investor templates */
  traction_proof_points?: Array<{
    id:             string;
    category:       string;
    claim:          string;
    metric_value:   string | null;
    metric_period:  string | null;
    evidence_date:  string;
    evidence_type:  string;
    source_name:    string | null;
    source_url:     string | null;
    confidence:     string;
    status:         string;
  }>;
  market_intelligence?: Array<{
    id:             string;
    category:       string;
    claim:          string;
    metric_value:   string | null;
    source_url:     string | null;
    source_name:    string | null;
    source_date:    string | null;
    methodology:    string | null;
    confidence:     string;
    status:         string;
    competitor_name: string | null;
  }>;
}

async function gatherSources(opts: {
  projectId:        string;
  template:         TemplateSpec;
  specificDocIds?:  string[];     /* optional — PM can manually select docs */
}): Promise<SourceBundle | null> {
  const { projectId, template, specificDocIds } = opts;

  /* fetch project */
  const { data: project } = await db().from("projects")
    .select("id,name,url,client_id,keywords").eq("id", projectId).maybeSingle();
  if (!project) return null;
  const p = project as any;

  /* fetch client */
  let client: any = null;
  if (p.client_id) {
    const { data } = await db().from("clients")
      .select("name,company,industry,website").eq("id", p.client_id).maybeSingle();
    client = data;
  }

  /* fetch brand assets */
  const { data: brandData } = await db().from("brand_assets")
    .select("*").eq("project_id", projectId).maybeSingle();

  /* fetch knowledge across all required + optional categories */
  const allCategories = [...template.required_categories, ...template.optional_categories];
  const { data: knowledgeRaw } = await db().from("project_knowledge")
    .select("category,field_key,field_value,source,notes")
    .eq("project_id", projectId)
    .in("category", allCategories);
  const knowledge: SourceBundle["knowledge"] = {};
  for (const k of (knowledgeRaw || [])) {
    const r = k as any;
    if (!r.field_value || !r.field_value.trim()) continue;
    (knowledge[r.category] ||= {})[r.field_key] = {
      value:  r.field_value,
      source: r.source || "manual",
      notes:  r.notes || undefined,
    };
  }

  /* fetch ingested documents — by either specific IDs or doc_type filter */
  let documents: SourceBundle["documents"] = [];
  if (specificDocIds && specificDocIds.length) {
    const { data: docs } = await db().from("project_documents")
      .select("id,name,doc_type,stakeholder_role,raw_content,extracted_data")
      .in("id", specificDocIds)
      .eq("project_id", projectId);          /* security: scope to this project */
    documents = (docs || []).map((d: any) => ({
      id:                d.id,
      name:              d.name,
      doc_type:          d.doc_type || "other",
      stakeholder_role:  d.stakeholder_role,
      raw_excerpt:       (d.raw_content || "").slice(0, 5000),
      extracted_summary: d.extracted_data?.doc_summary || null,
      key_findings:      d.extracted_data?.key_findings || [],
    }));
  } else if (template.useful_doc_types.length) {
    const { data: docs } = await db().from("project_documents")
      .select("id,name,doc_type,stakeholder_role,raw_content,extracted_data,created_at")
      .eq("project_id", projectId)
      .in("doc_type", template.useful_doc_types)
      .order("created_at", { ascending: false })
      .limit(8);                              /* cap to keep token budget sane */
    documents = (docs || []).map((d: any) => ({
      id:                d.id,
      name:              d.name,
      doc_type:          d.doc_type || "other",
      stakeholder_role:  d.stakeholder_role,
      raw_excerpt:       (d.raw_content || "").slice(0, 3500),
      extracted_summary: d.extracted_data?.doc_summary || null,
      key_findings:      d.extracted_data?.key_findings || [],
    }));
  }

  /* H.3 — for investor templates, pull traction proof points and
     market intelligence. Identifying "investor templates" by the
     default_audience_role being investor — keeps this self-describing
     in the template config without needing a new flag. */
  let tractionProofPoints: SourceBundle["traction_proof_points"];
  let marketIntelligence:  SourceBundle["market_intelligence"];
  if (template.default_audience_role === "investor") {
    const { data: tractionRows } = await db().from("traction_proof_points")
      .select("id,category,claim,metric_value,metric_period,evidence_date,evidence_type,source_name,source_url,confidence,status")
      .eq("project_id", projectId)
      .neq("status", "archived")
      .order("evidence_date", { ascending: false })
      .limit(40);
    tractionProofPoints = (tractionRows || []) as any[];

    const { data: miRows } = await db().from("market_intelligence")
      .select("id,category,claim,metric_value,source_url,source_name,source_date,methodology,confidence,status,competitor_name")
      .eq("project_id", projectId)
      .neq("status", "archived")
      .order("source_date", { ascending: false, nullsFirst: false })
      .limit(40);
    marketIntelligence = (miRows || []) as any[];
  }

  return {
    project: p, client,
    brand_assets: brandData || null,
    knowledge,
    documents,
    traction_proof_points: tractionProofPoints,
    market_intelligence:   marketIntelligence,
  };
}

/* ─── Required-category gate ──────────────────────────────────── */

interface ReadinessReport {
  ready:                boolean;
  missing_categories:   string[];      /* required cats with no fields */
  populated_categories: string[];
  populated_field_count: number;
  document_count:       number;
  warning?:             string;
}

function checkReadiness(template: TemplateSpec, bundle: SourceBundle): ReadinessReport {
  const populatedCats = Object.entries(bundle.knowledge)
    .filter(([_, fields]) => Object.values(fields).some((f) => f.value.trim()))
    .map(([cat]) => cat);

  const missing = template.required_categories.filter((c) => !populatedCats.includes(c));
  const fieldCount = Object.values(bundle.knowledge)
    .reduce((acc, fields) => acc + Object.values(fields).filter((f) => f.value.trim()).length, 0);

  const report: ReadinessReport = {
    ready:                missing.length === 0,
    missing_categories:   missing,
    populated_categories: populatedCats,
    populated_field_count: fieldCount,
    document_count:       bundle.documents.length,
  };

  if (template.verification_strictness === "investor_grade" && fieldCount < 8) {
    report.warning = "Investor-grade templates need rich Data Room context. With only " + fieldCount +
      " populated fields, output will be heavily caveated or refuse to generate uncited sections.";
  }
  return report;
}

/* ─── Prompt construction ─────────────────────────────────────── */

function buildContextBlock(bundle: SourceBundle): string {
  const lines: string[] = [];
  const p = bundle.project;
  lines.push(`PROJECT: ${p.name || ""}`);
  if (p.url) lines.push(`URL: ${p.url}`);
  if (Array.isArray(p.keywords) && p.keywords.length) lines.push(`TARGET KEYWORDS: ${p.keywords.join(", ")}`);

  if (bundle.client) {
    lines.push("");
    lines.push("CLIENT:");
    if (bundle.client.name)     lines.push(`  Name: ${bundle.client.name}`);
    if (bundle.client.company)  lines.push(`  Legal: ${bundle.client.company}`);
    if (bundle.client.industry) lines.push(`  Industry: ${bundle.client.industry}`);
  }

  /* Brand assets block */
  if (bundle.brand_assets) {
    const b = bundle.brand_assets;
    const brandLines: string[] = [];
    if (b.primary_tagline)         brandLines.push(`  Primary tagline: ${b.primary_tagline}  [source: brand:tagline]`);
    if (b.tagline_rationale)       brandLines.push(`  Tagline rationale: ${b.tagline_rationale}`);
    if (b.brand_archetype)         brandLines.push(`  Brand archetype: ${b.brand_archetype}  [source: brand:archetype]`);
    if (b.color_palette?.length)   brandLines.push(`  Color palette: ${b.color_palette.map((c: any) => `${c.name || c.role || ''} ${c.hex}`).join(", ")}  [source: brand:colors]`);
    if (b.font_families?.length)   brandLines.push(`  Typography: ${b.font_families.map((f: any) => `${f.name}${f.role ? ` (${f.role})` : ''}`).join(", ")}  [source: brand:fonts]`);
    if (b.brand_application_notes) brandLines.push(`  Brand application notes: ${b.brand_application_notes}  [source: brand:application_notes]`);
    if (brandLines.length) {
      lines.push("");
      lines.push("BRAND ASSETS:");
      lines.push(...brandLines);
    }
  }

  /* Data Room knowledge */
  const knowledgeEntries = Object.entries(bundle.knowledge);
  if (knowledgeEntries.length) {
    lines.push("");
    lines.push("DATA ROOM (cite as dataroom:<category>.<field_key>):");
    for (const [cat, fields] of knowledgeEntries) {
      const filled = Object.entries(fields).filter(([_, f]) => f.value.trim());
      if (!filled.length) continue;
      lines.push(`  [${cat}]`);
      for (const [k, f] of filled) {
        lines.push(`    ${k}: ${String(f.value).slice(0, 400)}  [source: dataroom:${cat}.${k}]`);
      }
    }
  }

  /* Documents */
  if (bundle.documents.length) {
    lines.push("");
    lines.push("INGESTED DOCUMENTS (cite as doc:<id>):");
    for (const d of bundle.documents) {
      lines.push("");
      lines.push(`--- DOCUMENT [doc:${d.id}] ${d.name} (${d.doc_type}${d.stakeholder_role ? `, from: ${d.stakeholder_role}` : ''}) ---`);
      if (d.extracted_summary) {
        lines.push(`Summary: ${d.extracted_summary}`);
      }
      if (d.key_findings && d.key_findings.length) {
        lines.push(`Key findings: ${d.key_findings.slice(0, 6).join(" | ")}`);
      }
      lines.push("Content excerpt:");
      lines.push(d.raw_excerpt || "(no content captured)");
    }
  }

  /* H.3 — Traction Proof Points (cite as traction:<id>) */
  if (bundle.traction_proof_points && bundle.traction_proof_points.length) {
    lines.push("");
    lines.push("TRACTION PROOF POINTS (cite as traction:<id>):");
    lines.push("Each entry below has been entered by the PM as defensible evidence of company performance. Use these for any traction-related claims in the document.");
    for (const t of bundle.traction_proof_points) {
      const parts = [`[traction:${t.id}]`, `(${t.category}, ${t.confidence} confidence, ${t.evidence_type})`];
      lines.push(parts.join(" "));
      lines.push(`  Claim: ${t.claim}`);
      if (t.metric_value)  lines.push(`  Value: ${t.metric_value}`);
      if (t.metric_period) lines.push(`  Period: ${t.metric_period}`);
      lines.push(`  Evidence date: ${t.evidence_date}`);
      if (t.source_name)   lines.push(`  Source: ${t.source_name}`);
      if (t.source_url)    lines.push(`  URL: ${t.source_url}`);
    }
  }

  /* H.3 — Market Intelligence (cite as market_intel:<id>) */
  if (bundle.market_intelligence && bundle.market_intelligence.length) {
    lines.push("");
    lines.push("MARKET INTELLIGENCE (cite as market_intel:<id>):");
    lines.push("Each entry below is a market data point the PM has captured with citation. Use these for any market sizing, competitor, or industry claims. NEVER fabricate market data — if you need a figure not listed here, write '[Market data needed — populate market_intelligence first]' rather than guessing.");
    for (const m of bundle.market_intelligence) {
      const parts = [`[market_intel:${m.id}]`, `(${m.category}, ${m.confidence} confidence)`];
      lines.push(parts.join(" "));
      lines.push(`  Claim: ${m.claim}`);
      if (m.metric_value)     lines.push(`  Value: ${m.metric_value}`);
      if (m.methodology)      lines.push(`  Methodology: ${m.methodology}`);
      if (m.competitor_name)  lines.push(`  Competitor: ${m.competitor_name}`);
      if (m.source_name)      lines.push(`  Source: ${m.source_name}${m.source_date ? ` (${m.source_date})` : ''}`);
      if (m.source_url)       lines.push(`  URL: ${m.source_url}`);
    }
  }

  return lines.join("\n");
}

function buildSystemPrompt(template: TemplateSpec, audienceRole: string, pmVision: string): string {
  const sectionGuidance = template.sections.map((s) =>
    `  ${s.key}  ("${s.title}")\n    Purpose: ${s.description}`
  ).join("\n");

  const audienceCalibration = (() => {
    /* light calibration of voice based on audience */
    if (audienceRole.startsWith("investor")) return "Audience is investors / board. Voice: precise, evidence-led, defensive against scrutiny. Every quantitative claim must be cited. Acknowledge limits of evidence explicitly.";
    if (audienceRole.startsWith("client_executive")) return "Audience is the client's executive team. Voice: confident, strategic, jargon-controlled. Lead with the verdict. Be honest about gaps.";
    if (audienceRole.startsWith("sales")) return "Audience is the sales team. Voice: tactical, action-ready. They'll read this 5 minutes before a call — make it useful immediately.";
    if (audienceRole.startsWith("team_creative") || audienceRole.startsWith("team_writer")) return "Audience is writers / designers / creatives. Voice: practical, example-led, prescriptive where it matters.";
    if (audienceRole.startsWith("press")) return "Audience is press / journalists. Voice: clear, quotable, newsworthy. Lead with the angle.";
    if (audienceRole.startsWith("partner")) return "Audience is a partner / vendor. Voice: collaborative, structured, mutual-benefit framing.";
    return "Audience is internal stakeholders. Voice: professional, evidence-led, honest about limits.";
  })();

  const strictness = template.verification_strictness === "investor_grade"
    ? [
        "VERIFICATION RIGOR (investor-grade):",
        "- Every quantitative claim MUST cite a source ID.",
        "- Every comparative claim ('we are X-er than competitor Y') MUST cite a source ID.",
        "- Sections without ANY source citations get confidence='low' AND the content must explicitly note '[Limited evidence — directional only]'.",
        "- Inferences not directly supported by sources must be tagged with [ASSUMPTION] in the source list.",
        "- Never invent numbers. If a metric isn't in the sources, omit the claim or describe directionally.",
      ].join("\n")
    : [
        "VERIFICATION RIGOR (standard):",
        "- Cite source IDs for every concrete claim (specific number, name, comparative statement).",
        "- For inferences, tag with [ASSUMPTION] explicitly.",
        "- Be honest about confidence. Low-evidence sections should say so.",
      ].join("\n");

  return [
    `You are a senior brand strategist and document writer producing a ${template.label} for an SEO/brand consultancy's client project.`,
    "",
    `Template: ${template.label}`,
    `Description: ${template.description}`,
    `Voice hint: ${template.voice_hint}`,
    "",
    audienceCalibration,
    "",
    pmVision ? `PM-WRITTEN VISION FOR THIS GENERATION:\n${pmVision}\n` : "",
    "Your task: call the `submit_document` tool exactly once with the full output. No prose outside the tool call.",
    "",
    "HARD RULES:",
    "1. Generate EVERY section listed below. Each section is required.",
    "2. For each section provide: content (markdown allowed for structure), sources_cited (array of source ID strings used), confidence (high/medium/low).",
    "3. Source IDs follow these schemas — use them exactly:",
    "   - dataroom:<category>.<field_key>    (e.g. dataroom:identity.unique_value_prop)",
    "   - doc:<document_id>                  (e.g. doc:a1b2c3d4-...)",
    "   - brand:<asset>                      (e.g. brand:tagline, brand:colors, brand:archetype)",
    "   - traction:<proof_point_id>          (for investor templates — dated, sourced traction evidence)",
    "   - market_intel:<intel_id>            (for investor templates — TAM/SAM/growth/competitor data with URL)",
    "   - ASSUMPTION                         (explicit assumption flag — never silent)",
    "4. NEVER fabricate facts. Numbers, names, dates, comparative claims must all trace to a source.",
    "5. If the available context is insufficient for a section, write what you can with [Limited evidence] flag and set confidence='low'. Don't pad.",
    "",
    strictness,
    "",
    "SECTION OUTLINE:",
    sectionGuidance,
    "",
    "The output document will be saved to the project's library and may be shared with the audience listed above. Write to that standard.",
  ].filter(Boolean).join("\n");
}

/* ─── Generation tool schema ──────────────────────────────────── */

function buildToolSchema(template: TemplateSpec) {
  return {
    type: "object" as const,
    properties: {
      overall_summary: {
        type: "string",
        description: "1-2 sentences summarizing the document at a glance.",
      },
      overall_confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "Lowest confidence across sections, OR average — your judgement.",
      },
      sections: {
        type: "array",
        description: "Sections of the document. Must include EVERY section in the outline.",
        items: {
          type: "object",
          properties: {
            key:        { type: "string", description: "Must match one of the section keys in the outline." },
            content:    { type: "string", description: "The section's content. Markdown formatting (headings, lists, bold) allowed." },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            sources_cited: {
              type: "array",
              items: { type: "string" },
              description: "Source IDs used to write this section. Use the schemas in the system prompt.",
            },
          },
          required: ["key", "content", "confidence", "sources_cited"],
        },
      },
      open_questions: {
        type: "array",
        items: { type: "string" },
        description: "Questions the writer would ask if they could — for follow-up with the PM or client.",
      },
    },
    required: ["overall_summary", "overall_confidence", "sections"],
  };
}

/* ─── Generation result types ─────────────────────────────────── */

interface GeneratedSection {
  key:           string;
  title:         string;          /* enriched from template */
  content:       string;
  confidence:    "high" | "medium" | "low";
  sources_cited: string[];
  /* server-side enriched: is this section's confidence under-supported? */
  flagged?:      "uncited_strict" | null;
}

interface GenerationOutput {
  overall_summary:    string;
  overall_confidence: "high" | "medium" | "low";
  sections:           GeneratedSection[];
  open_questions:     string[];
}

/* ─── Engine ──────────────────────────────────────────────────── */

async function runGeneration(opts: {
  template:      TemplateSpec;
  bundle:        SourceBundle;
  audienceRole:  string;
  pmVision:      string;
}): Promise<{ result?: GenerationOutput; error?: string; tokensUsed?: any }> {
  const { template, bundle, audienceRole, pmVision } = opts;
  const system = buildSystemPrompt(template, audienceRole, pmVision);
  const userMsg = buildContextBlock(bundle);
  const schema = buildToolSchema(template);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const resp = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 12000,
      system,
      messages:   [{ role: "user", content: userMsg }],
      tools: [{
        name: "submit_document",
        description: "Submit the generated document. Call exactly once with all sections filled.",
        input_schema: schema as any,
      }],
      tool_choice: { type: "tool", name: "submit_document" },
    });

    let toolInput: any = null;
    for (const block of (resp.content || [])) {
      if ((block as any).type === "tool_use" && (block as any).name === "submit_document") {
        toolInput = (block as any).input;
        break;
      }
    }
    if (!toolInput) return { error: "AI did not return a structured document" };

    /* Validate + enrich sections — fill missing keys with low-confidence placeholders */
    const sectionsIn: any[] = Array.isArray(toolInput.sections) ? toolInput.sections : [];
    const sectionsMap = new Map<string, any>();
    for (const s of sectionsIn) {
      if (s && typeof s.key === "string") sectionsMap.set(s.key, s);
    }

    const sections: GeneratedSection[] = template.sections.map((spec: SectionSpec): GeneratedSection => {
      const s = sectionsMap.get(spec.key);
      if (!s) {
        return {
          key:        spec.key,
          title:      spec.title,
          content:    "[Section not generated — limited context]",
          confidence: "low" as const,
          sources_cited: [] as string[],
          flagged:    "uncited_strict" as const,
        };
      }
      const conf = String(s.confidence || "").toLowerCase();
      const sources = Array.isArray(s.sources_cited)
        ? s.sources_cited.slice(0, 12).map((src: any) => String(src))
        : [];
      const validConf = (conf === "high" || conf === "medium" || conf === "low") ? (conf as "high" | "medium" | "low") : ("medium" as const);

      /* Investor-grade enforcement: sections with no sources cited
         get downgraded to low confidence and flagged. */
      let flagged: "uncited_strict" | null = null;
      let finalConf: "high" | "medium" | "low" = validConf;
      if (template.verification_strictness === "investor_grade" && sources.length === 0) {
        finalConf = "low";
        flagged = "uncited_strict";
      }

      return {
        key:           spec.key,
        title:         spec.title,
        content:       String(s.content || "").trim(),
        confidence:    finalConf,
        sources_cited: sources,
        flagged,
      };
    });

    const overallConf = String(toolInput.overall_confidence || "").toLowerCase();
    return {
      result: {
        overall_summary:    String(toolInput.overall_summary || "").slice(0, 800),
        overall_confidence: (overallConf === "high" || overallConf === "low") ? overallConf : "medium",
        sections,
        open_questions:     Array.isArray(toolInput.open_questions)
          ? toolInput.open_questions.slice(0, 10).map((q: any) => String(q))
          : [],
      },
      tokensUsed: resp.usage,
    };
  } catch (e: any) {
    return { error: e?.message || "Generation failed" };
  }
}

/* ─── Save generated document to project_documents ────────────── */

async function saveGeneration(opts: {
  projectId:       string;
  template:        TemplateSpec;
  audienceRole:    string;
  pmVision:        string;
  bundle:          SourceBundle;
  output:          GenerationOutput;
  parentDocumentId?: string;      /* for regeneration */
}): Promise<{ documentId?: string; version?: number; error?: string }> {
  const { projectId, template, audienceRole, pmVision, bundle, output, parentDocumentId } = opts;

  /* If regenerating, compute the new version number */
  let version = 1;
  if (parentDocumentId) {
    const { data: parent } = await db().from("project_documents")
      .select("version").eq("id", parentDocumentId).maybeSingle();
    if (parent) version = ((parent as any).version || 1) + 1;
  }

  /* Render full markdown content as raw_content for storage + viewing */
  const renderedContent = [
    `# ${template.label}`,
    "",
    `*Generated for: ${audienceRole}*`,
    `*Confidence: ${output.overall_confidence}*`,
    "",
    `## Summary`,
    output.overall_summary,
    "",
    ...output.sections.flatMap((s) => [
      `## ${s.title}`,
      "",
      s.content,
      "",
      s.sources_cited.length ? `*Sources: ${s.sources_cited.join(", ")}*` : "*No sources cited*",
      s.flagged === "uncited_strict" ? "\n> ⚠ This section was flagged for review — investor-grade strictness requires source citation." : "",
      "",
    ]),
  ].join("\n");

  const today = new Date().toISOString().slice(0, 10);
  const docName = `${template.label}${version > 1 ? ` (v${version})` : ''} — ${bundle.project.name} — ${today}`;

  /* What document IDs and Data Room fields did this draw from?
     Useful for the subscription/dependency model in H.4. */
  const sourceDocumentIds = Array.from(new Set(
    output.sections.flatMap((s) =>
      s.sources_cited.filter((src) => src.startsWith("doc:")).map((src) => src.slice(4))
    )
  ));

  const generationContext = {
    template_id:        template.id,
    template_label:     template.label,
    audience_role:      audienceRole,
    pm_vision:          pmVision || null,
    overall_summary:    output.overall_summary,
    overall_confidence: output.overall_confidence,
    open_questions:     output.open_questions,
    sections:           output.sections,             /* full structured output */
    generated_at:       new Date().toISOString(),
    sources_summary: {
      knowledge_fields: Object.values(bundle.knowledge).reduce((acc, fields) =>
        acc + Object.values(fields).filter((f) => f.value.trim()).length, 0),
      documents:        bundle.documents.length,
      has_brand_assets: !!bundle.brand_assets,
    },
  };

  const { data, error } = await db().from("project_documents").insert({
    project_id:           projectId,
    name:                 docName.slice(0, 240),
    doc_type:             template.id,                  /* template id IS the doc type for generated */
    kind:                 "generated",
    audience_role:        audienceRole,
    template_id:          template.id,
    confidence:           output.overall_confidence,
    version,
    parent_document_id:   parentDocumentId || null,
    doc_status:           "draft",
    published_to_client:  false,                        /* never auto-publish */
    raw_content:          renderedContent.slice(0, 50000),
    extracted_data:       generationContext,            /* full structured output here too */
    generation_context:   generationContext,
    source_documents:     sourceDocumentIds,
    web_sources:          [],                           /* none in H.2 */
    source_date:          today,
    stakeholder_role:     null,                         /* generated docs aren't from a stakeholder */
    provided_by:          "Brand Studio (generated)",
  }).select().single();

  if (error || !data) return { error: error?.message || "Failed to save generated document" };

  const documentId = (data as any).id;

  /* H.4 — auto-create document_subscriptions from cited source IDs.
     Each unique source ID becomes a subscription that will track
     staleness when the underlying input changes. Best-effort — failures
     here don't fail the save. */
  try {
    const allCitedIds = new Set<string>();
    for (const sec of output.sections) {
      for (const src of sec.sources_cited) allCitedIds.add(src);
    }
    const subscriptionRows: any[] = [];
    for (const src of allCitedIds) {
      if (src.startsWith("doc:")) {
        const targetId = src.slice(4);
        if (targetId) subscriptionRows.push({
          document_id: documentId, project_id: projectId,
          subscription_type: "monitor",          /* docs can be re-ingested → subscription tracks the source doc */
          target_id: targetId,
        });
      } else if (src.startsWith("traction:")) {
        const targetId = src.slice(9);
        if (targetId) subscriptionRows.push({
          document_id: documentId, project_id: projectId,
          subscription_type: "traction", target_id: targetId,
        });
      } else if (src.startsWith("market_intel:")) {
        const targetId = src.slice(13);
        if (targetId) subscriptionRows.push({
          document_id: documentId, project_id: projectId,
          subscription_type: "market_intel", target_id: targetId,
        });
      } else if (src.startsWith("dataroom:")) {
        const rest = src.slice(9);
        const dotIdx = rest.indexOf(".");
        if (dotIdx > 0) {
          const category = rest.slice(0, dotIdx);
          const fieldKey = rest.slice(dotIdx + 1);
          subscriptionRows.push({
            document_id: documentId, project_id: projectId,
            subscription_type: "dataroom_field",
            target_category: category, target_field_key: fieldKey,
          });
        }
      }
      /* brand: and ASSUMPTION don't get subscriptions — brand assets
         change via direct PM edit which doesn't need automated staleness;
         ASSUMPTION is the writer's explicit caveat with no input to watch. */
    }
    if (subscriptionRows.length) {
      await db().from("document_subscriptions").insert(subscriptionRows);
    }
  } catch (e: any) {
    console.error("[bs-generate] subscription creation failed:", e?.message);
  }

  return { documentId, version };
}

/* ─── Public action handlers ──────────────────────────────────── */

export function bsGetTemplates() {
  return { success: true, templates: publicTemplateCatalog() };
}

/** Check readiness for a template — does the project have enough context?
 *  Cheap operation, no AI tokens spent. Use this before showing the "Generate"
 *  button. */
export async function bsCheckReadiness(body: any): Promise<any> {
  const { projectId, templateId } = body;
  if (!projectId)  return { success: false, error: "projectId required" };
  if (!templateId) return { success: false, error: "templateId required" };
  const template = getTemplate(templateId);
  if (!template) return { success: false, error: `Unknown template: ${templateId}` };
  const bundle = await gatherSources({ projectId, template });
  if (!bundle) return { success: false, error: "project not found" };
  const report = checkReadiness(template, bundle);
  return { success: true, readiness: report, template_label: template.label };
}

/** Run the generation. Returns the result without saving — the PM reviews
 *  in the modal, then calls bs_generate_apply to commit. */
export async function bsGeneratePreview(body: any): Promise<any> {
  const { projectId, templateId, audienceRole, pmVision, specificDocIds } = body;
  if (!projectId)  return { success: false, error: "projectId required" };
  if (!templateId) return { success: false, error: "templateId required" };

  const template = getTemplate(templateId);
  if (!template) return { success: false, error: `Unknown template: ${templateId}` };

  const bundle = await gatherSources({ projectId, template, specificDocIds });
  if (!bundle) return { success: false, error: "project not found" };

  const readiness = checkReadiness(template, bundle);
  if (!readiness.ready) {
    return {
      success: false,
      error: `Cannot generate "${template.label}" — needs at least one populated field in each of: ${readiness.missing_categories.join(", ")}. Populate these in the Data Room first.`,
      readiness,
    };
  }

  const audience = audienceRole || template.default_audience_role;
  const vision   = (pmVision || "").trim().slice(0, 2000);

  const { result, error, tokensUsed } = await runGeneration({
    template, bundle, audienceRole: audience, pmVision: vision,
  });
  if (error || !result) return { success: false, error: error || "generation failed", readiness };

  /* Return preview WITHOUT saving — caller can edit + apply or discard */
  return {
    success: true,
    preview: {
      template_id:        template.id,
      template_label:     template.label,
      audience_role:      audience,
      pm_vision:          vision || null,
      overall_summary:    result.overall_summary,
      overall_confidence: result.overall_confidence,
      sections:           result.sections,
      open_questions:     result.open_questions,
      readiness,
    },
    tokens: tokensUsed,
  };
}

/** Commit a previously-previewed generation. The PM can pass edited sections
 *  back (allowing in-flight edits in the preview modal before save). */
export async function bsGenerateApply(body: any): Promise<any> {
  const {
    projectId, templateId, audienceRole, pmVision,
    sections: editedSections,                       /* PM-edited sections from preview */
    overallSummary, overallConfidence, openQuestions,
    parentDocumentId,                               /* if regenerating */
  } = body;

  if (!projectId)  return { success: false, error: "projectId required" };
  if (!templateId) return { success: false, error: "templateId required" };
  if (!Array.isArray(editedSections) || !editedSections.length) {
    return { success: false, error: "sections required" };
  }

  const template = getTemplate(templateId);
  if (!template) return { success: false, error: `Unknown template: ${templateId}` };

  const bundle = await gatherSources({ projectId, template });
  if (!bundle) return { success: false, error: "project not found" };

  /* Validate edited sections — coerce to GeneratedSection shape */
  const sections: GeneratedSection[] = template.sections.map((spec) => {
    const edited = editedSections.find((s: any) => s?.key === spec.key);
    if (!edited) {
      return {
        key: spec.key, title: spec.title,
        content: "[Section missing]",
        confidence: "low", sources_cited: [], flagged: "uncited_strict",
      };
    }
    const conf = String(edited.confidence || "").toLowerCase();
    return {
      key:           spec.key,
      title:         spec.title,
      content:       String(edited.content || "").slice(0, 8000),
      confidence:    (conf === "high" || conf === "medium" || conf === "low") ? conf : "medium",
      sources_cited: Array.isArray(edited.sources_cited)
        ? edited.sources_cited.slice(0, 12).map((s: any) => String(s)) : [],
      flagged:       edited.flagged === "uncited_strict" ? "uncited_strict" : null,
    };
  });

  const overall = String(overallConfidence || "").toLowerCase();
  const output: GenerationOutput = {
    overall_summary:    String(overallSummary || "").slice(0, 800),
    overall_confidence: (overall === "high" || overall === "low") ? overall : "medium",
    sections,
    open_questions:     Array.isArray(openQuestions) ? openQuestions.slice(0, 10).map((q: any) => String(q)) : [],
  };

  const { documentId, version, error } = await saveGeneration({
    projectId,
    template,
    audienceRole: audienceRole || template.default_audience_role,
    pmVision:     (pmVision || "").slice(0, 2000),
    bundle,
    output,
    parentDocumentId,
  });
  if (error || !documentId) return { success: false, error: error || "save failed" };

  return { success: true, document_id: documentId, version };
}

/** List generated documents for a project (kind='generated' filter). */
export async function bsListGenerated(body: any): Promise<any> {
  const { projectId } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  const { data, error } = await db().from("project_documents")
    .select("id,name,doc_type,template_id,audience_role,confidence,version,parent_document_id,doc_status,published_to_client,published_at,created_at,extracted_data")
    .eq("project_id", projectId)
    .eq("kind", "generated")
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, documents: data || [] };
}

/* ─── Dispatcher ──────────────────────────────────────────────── */

export async function handleBrandStudioGenerate(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "bs_get_templates":         return bsGetTemplates();
    case "bs_check_readiness":       return bsCheckReadiness(body);
    case "bs_generate_preview":      return bsGeneratePreview(body);
    case "bs_generate_apply":        return bsGenerateApply(body);
    case "bs_list_generated":        return bsListGenerated(body);
    default: return null;
  }
}
