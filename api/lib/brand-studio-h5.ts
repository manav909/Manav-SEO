/* ════════════════════════════════════════════════════════════════
   api/lib/brand-studio-h5.ts
   Brand Studio H.5 — Polish + power features.

   Five concerns:
   1. Stakeholder profile CRUD
   2. Cross-document persona synthesis — takes N source documents
      (sales calls, customer feedback, persona research), synthesizes
      a unified persona with explicit contradictions surfaced, writes
      back to project_knowledge with source='synthesis' (PM-reviewed)
   3. Document re-extract — re-runs ingest extraction against a
      document with the current V2 field catalog (useful when schema
      evolves and existing docs may have undiscovered field evidence)
   4. Version diff — compares two versions of a generated document
      section-by-section for PM review before publishing
   5. Dependency lookup — what does this doc depend on / what
      depends on this input

   Brand-specialist disciplines:
   - Synthesis surfaces CONTRADICTIONS explicitly, never silently
     averages or picks one
   - PM-reviewed write-back, never auto-writes to project_knowledge
   - Re-extract never overwrites manual / GSC / GA4 / seed values
   - Diff is informational only — never auto-publishes a v2
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

/* ═══════════════════════════════════════════════════════════════
   Part 1 — Stakeholder profile CRUD
═══════════════════════════════════════════════════════════════ */

const VALID_STAKEHOLDER_ROLES = [
  "client_executive","client_marketing","client_product","client_legal","client_internal",
  "pm_internal","sales_lead","team_writer","team_designer","team_developer","team_creative",
  "researcher_external","researcher_internal","customer","customer_advocate","investor",
  "advertiser","partner","press","other",
];

export async function bsListStakeholders(body: any): Promise<any> {
  const { projectId, includeInactive } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  let q = db().from("stakeholder_profiles").select("*").eq("project_id", projectId);
  if (!includeInactive) q = q.eq("active", true);
  q = q.order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, stakeholders: data || [] };
}

export async function bsUpsertStakeholder(body: any): Promise<any> {
  const { id, projectId, ...fields } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!fields.display_name || !fields.display_name.trim()) return { success: false, error: "display_name required" };
  if (!fields.stakeholder_role || !VALID_STAKEHOLDER_ROLES.includes(fields.stakeholder_role)) {
    return { success: false, error: `stakeholder_role must be one of: ${VALID_STAKEHOLDER_ROLES.join(", ")}` };
  }

  const payload: any = {
    project_id:               projectId,
    display_name:             String(fields.display_name).slice(0, 200),
    role_title:               fields.role_title ? String(fields.role_title).slice(0, 200) : null,
    stakeholder_role:         fields.stakeholder_role,
    email:                    fields.email ? String(fields.email).slice(0, 200) : null,
    org:                      fields.org ? String(fields.org).slice(0, 200) : null,
    communication_preference: fields.communication_preference ? String(fields.communication_preference).slice(0, 500) : null,
    decision_style:           fields.decision_style ? String(fields.decision_style).slice(0, 500) : null,
    focus_areas:              fields.focus_areas ? String(fields.focus_areas).slice(0, 500) : null,
    what_they_care_about:     fields.what_they_care_about ? String(fields.what_they_care_about).slice(0, 1000) : null,
    language_patterns:        fields.language_patterns ? String(fields.language_patterns).slice(0, 1000) : null,
    interaction_history:      fields.interaction_history ? String(fields.interaction_history).slice(0, 2000) : null,
    watch_outs:               fields.watch_outs ? String(fields.watch_outs).slice(0, 1000) : null,
    preferred_format:         fields.preferred_format ? String(fields.preferred_format).slice(0, 200) : null,
    active:                   fields.active === false ? false : true,
    notes:                    fields.notes ? String(fields.notes).slice(0, 2000) : null,
    created_by:               fields.created_by || null,
  };

  if (id) {
    const { data, error } = await db().from("stakeholder_profiles")
      .update(payload).eq("id", id).eq("project_id", projectId).select().single();
    if (error || !data) return { success: false, error: error?.message || "update failed" };
    return { success: true, stakeholder: data };
  } else {
    const { data, error } = await db().from("stakeholder_profiles")
      .insert(payload).select().single();
    if (error || !data) return { success: false, error: error?.message || "insert failed" };
    return { success: true, stakeholder: data };
  }
}

export async function bsDeleteStakeholder(body: any): Promise<any> {
  const { id, projectId } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };
  const { error } = await db().from("stakeholder_profiles")
    .delete().eq("id", id).eq("project_id", projectId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════
   Part 2 — Cross-document persona synthesis
═══════════════════════════════════════════════════════════════ */

/* Persona fields the synthesis can write to in project_knowledge.audience */
const PERSONA_TARGET_FIELDS = [
  "ideal_customer_profile",
  "persona_1_name", "persona_1_motivations", "persona_1_objections",
  "persona_2_name", "persona_2_motivations", "persona_2_objections",
  "persona_3_name", "persona_3_motivations", "persona_3_objections",
];

/** Returns documents eligible as synthesis sources — types that
 *  carry persona/audience signal. */
export async function bsListSynthesisCandidates(body: any): Promise<any> {
  const { projectId } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  const eligibleDocTypes = [
    "sales_call_notes",
    "customer_feedback",
    "persona_research",
    "case_study",
  ];
  const { data, error } = await db().from("project_documents")
    .select("id,name,doc_type,stakeholder_role,extracted_data,created_at,raw_content")
    .eq("project_id", projectId)
    .in("doc_type", eligibleDocTypes)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  /* Strip raw_content from the listing — too heavy */
  const trimmed = (data || []).map((d: any) => ({
    id:               d.id,
    name:             d.name,
    doc_type:         d.doc_type,
    stakeholder_role: d.stakeholder_role,
    summary:          d.extracted_data?.doc_summary || null,
    key_findings:     d.extracted_data?.key_findings || [],
    created_at:       d.created_at,
    char_count:       (d.raw_content || "").length,
  }));
  return { success: true, candidates: trimmed };
}

/** Run persona synthesis across selected documents. Returns a preview
 *  the PM reviews before approving the write-back to project_knowledge. */
export async function bsSynthesizePersona(body: any): Promise<any> {
  const { projectId, documentIds, pmGuidance } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!Array.isArray(documentIds) || documentIds.length < 2) {
    return { success: false, error: "Synthesis needs at least 2 source documents" };
  }
  if (documentIds.length > 12) {
    return { success: false, error: "Synthesis capped at 12 source documents — pick the most relevant" };
  }

  /* Fetch source docs */
  const { data: docs } = await db().from("project_documents")
    .select("id,name,doc_type,stakeholder_role,raw_content,extracted_data")
    .in("id", documentIds)
    .eq("project_id", projectId);
  if (!docs || docs.length === 0) return { success: false, error: "No source documents found" };

  /* Fetch existing audience knowledge to inform synthesis (and protect against overwrites) */
  const { data: existingAudience } = await db().from("project_knowledge")
    .select("field_key,field_value,source").eq("project_id", projectId).eq("category", "audience");
  const existingMap = new Map<string, { value: string; source: string }>();
  for (const r of (existingAudience || [])) {
    existingMap.set((r as any).field_key, { value: (r as any).field_value, source: (r as any).source || "manual" });
  }

  /* Build source block */
  const sourceBlock = (docs as any[]).map((d) => {
    const excerpt = (d.raw_content || "").slice(0, 4000);
    const findings = (d.extracted_data?.key_findings || []).slice(0, 6).join(" | ");
    return [
      `--- DOCUMENT [doc:${d.id}] ${d.name} (${d.doc_type}${d.stakeholder_role ? `, from: ${d.stakeholder_role}` : ""}) ---`,
      d.extracted_data?.doc_summary ? `Summary: ${d.extracted_data.doc_summary}` : null,
      findings ? `Key findings: ${findings}` : null,
      "Excerpt:",
      excerpt || "(no content)",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const existingBlock = existingMap.size > 0
    ? Array.from(existingMap.entries()).map(([k, v]) => `  ${k}: "${v.value.slice(0, 250)}"  [current source: ${v.source}]`).join("\n")
    : "(no existing audience data)";

  const system = [
    "You are a senior brand strategist synthesizing customer/audience evidence across multiple source documents into unified persona understanding.",
    "",
    "Your job: produce a SYNTHESIZED view across the sources. Honest synthesis is your most important discipline.",
    "",
    "HARD RULES:",
    "1. SURFACE CONTRADICTIONS EXPLICITLY. If two source docs say different things about the same persona attribute (one says 'price-sensitive', another says 'enterprise budget'), DO NOT pick one or silently average. List both views in the contradictions array, naming the source docs.",
    "2. Cite EVIDENCE per field. Every synthesized value carries an evidence array of doc IDs that fed it.",
    "3. NEVER fabricate. If sources don't support a field, omit it. Empty is better than guessed.",
    "4. Avoid AVERAGING — synthesis is about finding the strongest signal across sources, not the mean. If 4 sources say X and 1 says Y, that's signal — note the X but also flag the Y as an outlier worth understanding.",
    "5. Distinguish primary vs. secondary personas with confidence — if evidence supports more than one distinct persona, separate them clearly. If only one is supported, say so.",
    "6. Use the source documents' OWN LANGUAGE where appropriate — quotes from customer feedback or sales calls are more powerful than rewriting.",
    "",
    "TARGET FIELDS (write to these only, all in the 'audience' Data Room category):",
    PERSONA_TARGET_FIELDS.map((f) => "  - " + f).join("\n"),
    "",
    "Field guidance:",
    "  ideal_customer_profile — firmographic/demographic summary of the ideal buyer",
    "  persona_1_name — short label for the primary persona (role-based, NOT a personal name; e.g. 'VP Marketing at growth-stage SaaS')",
    "  persona_1_motivations — what drives them; what they're trying to achieve",
    "  persona_1_objections — what holds them back from buying / hesitations",
    "  persona_2_*, persona_3_* — same structure for secondary/tertiary personas IF evidence supports",
    "",
    "Call submit_synthesis with the result. No prose outside the tool call.",
  ].join("\n");

  const userMsg = [
    `Synthesize a persona understanding from these ${docs.length} source documents for project context.`,
    "",
    pmGuidance ? `PM GUIDANCE:\n${pmGuidance}\n` : "",
    "EXISTING AUDIENCE DATA (do NOT overwrite manual values — these are reference only):",
    existingBlock,
    "",
    "SOURCE DOCUMENTS:",
    sourceBlock,
    "",
    "Call submit_synthesis.",
  ].filter(Boolean).join("\n");

  const schema = {
    type: "object" as const,
    properties: {
      overall_summary: {
        type: "string",
        description: "1-3 sentence summary of the synthesized persona view.",
      },
      synthesized_fields: {
        type: "array",
        description: "Persona fields you can synthesize from the sources. Only include where evidence supports a value.",
        items: {
          type: "object",
          properties: {
            field_key:  { type: "string", enum: PERSONA_TARGET_FIELDS,
              description: "Must be one of the target persona fields." },
            value:      { type: "string", description: "Synthesized value as a string." },
            confidence: { type: "string", enum: ["high","medium","low"] },
            evidence:   { type: "array", items: { type: "string" },
              description: "Array of doc IDs (doc:<id>) that fed this synthesis. At least 1." },
            reasoning:  { type: "string",
              description: "1-2 sentences on how you arrived at this synthesized value." },
          },
          required: ["field_key","value","confidence","evidence","reasoning"],
        },
      },
      contradictions: {
        type: "array",
        description: "Explicit contradictions found across the sources. Each names the contradicting docs and the conflicting views.",
        items: {
          type: "object",
          properties: {
            topic:        { type: "string", description: "What the contradiction is about (e.g. 'budget sensitivity', 'decision authority')" },
            views:        { type: "array", items: { type: "string" },
              description: "Each conflicting view, with the source doc reference inline (e.g. 'Per doc:abc — budget is tight; per doc:xyz — enterprise budget')." },
            recommendation: { type: "string", description: "What the PM should do — typically 'verify with client' or 'segment-specific finding'." },
          },
          required: ["topic","views","recommendation"],
        },
      },
      open_questions: {
        type: "array",
        items: { type: "string" },
        description: "Questions the synthesis surfaced that the PM should follow up on.",
      },
    },
    required: ["overall_summary","synthesized_fields","contradictions"],
  };

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const resp = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 8000,
      system,
      messages:   [{ role: "user", content: userMsg }],
      tools: [{
        name: "submit_synthesis",
        description: "Submit the synthesized persona output.",
        input_schema: schema as any,
      }],
      tool_choice: { type: "tool", name: "submit_synthesis" },
    });

    let toolInput: any = null;
    for (const block of (resp.content || [])) {
      if ((block as any).type === "tool_use" && (block as any).name === "submit_synthesis") {
        toolInput = (block as any).input;
        break;
      }
    }
    if (!toolInput) return { success: false, error: "AI did not return structured synthesis" };

    /* Validate fields against catalog + mark which would-overwrite */
    const NEVER_OVERWRITE = new Set(["manual","gsc_auto","ga4_auto","seed_migration"]);
    const validatedFields = (toolInput.synthesized_fields || []).filter((f: any) =>
      f && typeof f.field_key === "string" && PERSONA_TARGET_FIELDS.includes(f.field_key)
    ).map((f: any) => {
      const existing = existingMap.get(f.field_key);
      const wouldOverwriteProtected = !!(existing && NEVER_OVERWRITE.has(existing.source));
      const conf = String(f.confidence || "").toLowerCase();
      return {
        field_key:    f.field_key,
        value:        String(f.value || "").slice(0, 2000),
        confidence:   (conf === "high" || conf === "medium" || conf === "low") ? conf : "medium",
        evidence:     Array.isArray(f.evidence) ? f.evidence.slice(0, 12).map((e: any) => String(e)) : [],
        reasoning:    String(f.reasoning || "").slice(0, 1000),
        existing_value:      existing?.value || null,
        existing_source:     existing?.source || null,
        would_overwrite_protected: wouldOverwriteProtected,
      };
    });

    return {
      success: true,
      synthesis: {
        overall_summary:     String(toolInput.overall_summary || "").slice(0, 1000),
        synthesized_fields:  validatedFields,
        contradictions:      Array.isArray(toolInput.contradictions) ? toolInput.contradictions.slice(0, 15) : [],
        open_questions:      Array.isArray(toolInput.open_questions) ? toolInput.open_questions.slice(0, 10) : [],
      },
      source_doc_ids:        documentIds,
      tokens:                resp.usage,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "Synthesis failed" };
  }
}

/** Apply the PM-approved synthesis to project_knowledge.
 *  Only writes fields the PM explicitly included in approvedFields. */
export async function bsApplySynthesis(body: any): Promise<any> {
  const { projectId, approvedFields, sourceDocIds } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!Array.isArray(approvedFields) || !approvedFields.length) {
    return { success: false, error: "approvedFields required" };
  }

  /* Re-check NEVER_OVERWRITE at write time */
  const NEVER_OVERWRITE = new Set(["manual","gsc_auto","ga4_auto","seed_migration"]);
  const { data: existing } = await db().from("project_knowledge")
    .select("field_key,source").eq("project_id", projectId).eq("category", "audience");
  const existingMap = new Map<string, string>();
  for (const r of (existing || [])) {
    existingMap.set((r as any).field_key, (r as any).source || "manual");
  }

  const today = new Date().toISOString().slice(0, 10);
  let written = 0;
  let skipped = 0;
  const details: any[] = [];

  for (const f of approvedFields) {
    if (!f.field_key || !PERSONA_TARGET_FIELDS.includes(f.field_key)) {
      details.push({ field_key: f.field_key, action: "skipped_invalid_field" });
      continue;
    }
    const existingSource = existingMap.get(f.field_key);
    if (existingSource && NEVER_OVERWRITE.has(existingSource)) {
      skipped++;
      details.push({ field_key: f.field_key, action: "skipped_protected", existing_source: existingSource });
      continue;
    }

    const notes = JSON.stringify({
      confidence:        f.confidence || "medium",
      reasoning:         f.reasoning || "",
      sources_used:      f.evidence || [],
      synthesized_at:    new Date().toISOString(),
      source_doc_ids:    sourceDocIds || [],
    });

    try {
      await db().from("project_knowledge").upsert({
        project_id:  projectId,
        category:    "audience",
        field_key:   f.field_key,
        field_value: String(f.value || ""),
        source:      "synthesis",
        source_name: `Synthesized from ${(sourceDocIds || []).length} documents`,
        data_date:   today,
        notes,
        updated_at:  new Date().toISOString(),
      }, { onConflict: "project_id,category,field_key" });
      written++;
      details.push({ field_key: f.field_key, action: "written" });
    } catch (e: any) {
      details.push({ field_key: f.field_key, action: "failed", error: e?.message });
    }
  }

  return { success: true, written, skipped, details };
}

/* ═══════════════════════════════════════════════════════════════
   Part 3 — Document re-extract
═══════════════════════════════════════════════════════════════ */

/** Re-run ingest extraction on a previously-ingested document, using
 *  the CURRENT V2 field catalog. Useful when schema evolves. */
export async function bsReextractDocument(body: any): Promise<any> {
  const { documentId } = body;
  if (!documentId) return { success: false, error: "documentId required" };

  /* Reuse the existing bsIngestExtract logic — same extraction engine,
     just runs again with current schema and catalog. */
  const { bsIngestExtract } = await import("./brand-studio-ingest.js");
  const result = await bsIngestExtract({ documentId });
  return result;
}

/* ═══════════════════════════════════════════════════════════════
   Part 4 — Version diff
═══════════════════════════════════════════════════════════════ */

/** Returns side-by-side section data for v1 vs v2 of a generated
 *  document. The "later" document is the one passed; the "earlier"
 *  is its parent_document_id. */
export async function bsGetVersionDiff(body: any): Promise<any> {
  const { documentId } = body;
  if (!documentId) return { success: false, error: "documentId required" };

  const { data: laterDoc } = await db().from("project_documents")
    .select("id,name,version,parent_document_id,extracted_data,generation_context,created_at,template_id")
    .eq("id", documentId).maybeSingle();
  if (!laterDoc) return { success: false, error: "Document not found" };
  const later = laterDoc as any;
  if (!later.parent_document_id) {
    return { success: false, error: "This document has no parent version to compare against" };
  }

  const { data: earlierDoc } = await db().from("project_documents")
    .select("id,name,version,extracted_data,generation_context,created_at,template_id")
    .eq("id", later.parent_document_id).maybeSingle();
  if (!earlierDoc) return { success: false, error: "Parent version not found" };
  const earlier = earlierDoc as any;

  /* Pull section arrays from generation_context (where the structured
     sections live; extracted_data carries the same data) */
  const earlierSections = (earlier.generation_context?.sections || earlier.extracted_data?.sections || []) as any[];
  const laterSections   = (later.generation_context?.sections   || later.extracted_data?.sections   || []) as any[];

  /* Build a section-keyed diff map */
  const earlierByKey = new Map<string, any>();
  for (const s of earlierSections) if (s?.key) earlierByKey.set(s.key, s);
  const laterByKey = new Map<string, any>();
  for (const s of laterSections) if (s?.key) laterByKey.set(s.key, s);
  const allKeys = new Set<string>([...earlierByKey.keys(), ...laterByKey.keys()]);

  const sectionDiffs = Array.from(allKeys).map((key) => {
    const a = earlierByKey.get(key);
    const b = laterByKey.get(key);
    const change_type =
      !a && b ? "added"   :
      a && !b ? "removed" :
      (a?.content || "") === (b?.content || "") ? "unchanged" :
      "modified";
    return {
      key,
      title: b?.title || a?.title || key,
      change_type,
      earlier_content:    a?.content || null,
      later_content:      b?.content || null,
      earlier_confidence: a?.confidence || null,
      later_confidence:   b?.confidence || null,
      earlier_sources:    a?.sources_cited || [],
      later_sources:      b?.sources_cited || [],
    };
  });

  return {
    success: true,
    diff: {
      earlier: {
        id:               earlier.id,
        name:             earlier.name,
        version:          earlier.version,
        created_at:       earlier.created_at,
        overall_summary:  earlier.generation_context?.overall_summary || null,
      },
      later: {
        id:               later.id,
        name:             later.name,
        version:          later.version,
        created_at:       later.created_at,
        overall_summary:  later.generation_context?.overall_summary || null,
      },
      template_id:        later.template_id,
      sections:           sectionDiffs,
      changed_count:      sectionDiffs.filter((s) => s.change_type !== "unchanged").length,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   Part 5 — Dependency lookup
═══════════════════════════════════════════════════════════════ */

/** Given a document ID, return everything it depends on (its
 *  subscription rows enriched with target detail). */
export async function bsGetDocumentDependencies(body: any): Promise<any> {
  const { documentId, projectId } = body;
  if (!documentId || !projectId) return { success: false, error: "documentId + projectId required" };

  const { data: subs } = await db().from("document_subscriptions")
    .select("*").eq("document_id", documentId).eq("project_id", projectId);
  if (!subs || subs.length === 0) return { success: true, dependencies: [] };

  /* Enrich each subscription with target detail */
  const enriched: any[] = [];
  for (const s of (subs as any[])) {
    if (s.subscription_type === "monitor" && s.target_id) {
      /* The target_id could be either a monitor UUID or a project_documents UUID
         (since auto-subscribe uses subscription_type='monitor' for doc:* citations too).
         Try monitor first; fall back to document. */
      const { data: monitorRow } = await db().from("internet_monitors")
        .select("id,label,url,monitor_type").eq("id", s.target_id).maybeSingle();
      if (monitorRow) {
        enriched.push({
          ...s,
          target_label: (monitorRow as any).label,
          target_detail: (monitorRow as any).url,
          target_kind: "monitor",
        });
        continue;
      }
      const { data: docRow } = await db().from("project_documents")
        .select("id,name,doc_type").eq("id", s.target_id).maybeSingle();
      if (docRow) {
        enriched.push({
          ...s,
          target_label: (docRow as any).name,
          target_detail: (docRow as any).doc_type,
          target_kind: "source_document",
        });
        continue;
      }
      enriched.push({ ...s, target_label: "(unknown)", target_kind: "unknown" });
    } else if (s.subscription_type === "traction" && s.target_id) {
      const { data: row } = await db().from("traction_proof_points")
        .select("id,claim,category").eq("id", s.target_id).maybeSingle();
      enriched.push({
        ...s,
        target_label: (row as any)?.claim || "(deleted)",
        target_detail: (row as any)?.category || null,
        target_kind: "traction",
      });
    } else if (s.subscription_type === "market_intel" && s.target_id) {
      const { data: row } = await db().from("market_intelligence")
        .select("id,claim,category").eq("id", s.target_id).maybeSingle();
      enriched.push({
        ...s,
        target_label: (row as any)?.claim || "(deleted)",
        target_detail: (row as any)?.category || null,
        target_kind: "market_intel",
      });
    } else if (s.subscription_type === "dataroom_field") {
      enriched.push({
        ...s,
        target_label: `${s.target_category}.${s.target_field_key}`,
        target_detail: "Data Room field",
        target_kind: "dataroom_field",
      });
    }
  }

  return { success: true, dependencies: enriched };
}

/** Given a Data Room field, return all generated documents subscribing to it. */
export async function bsGetFieldDependents(body: any): Promise<any> {
  const { projectId, category, fieldKey } = body;
  if (!projectId || !category || !fieldKey) {
    return { success: false, error: "projectId + category + fieldKey required" };
  }
  const { data: subs } = await db().from("document_subscriptions")
    .select("document_id,stale_since,stale_reason")
    .eq("project_id", projectId)
    .eq("subscription_type", "dataroom_field")
    .eq("target_category", category)
    .eq("target_field_key", fieldKey);

  if (!subs || subs.length === 0) return { success: true, dependents: [] };
  const docIds = Array.from(new Set((subs as any[]).map((s) => s.document_id)));
  const { data: docs } = await db().from("project_documents")
    .select("id,name,template_id,version,doc_status,published_to_client").in("id", docIds);
  const docMap = new Map<string, any>();
  for (const d of (docs || [])) docMap.set((d as any).id, d);

  return {
    success: true,
    dependents: (subs as any[]).map((s) => ({
      document_id:   s.document_id,
      document_name: docMap.get(s.document_id)?.name,
      template_id:   docMap.get(s.document_id)?.template_id,
      version:       docMap.get(s.document_id)?.version,
      stale_since:   s.stale_since,
      stale_reason:  s.stale_reason,
    })),
  };
}

/* ═══════════════════════════════════════════════════════════════
   Dispatcher
═══════════════════════════════════════════════════════════════ */

export async function handleBrandStudioH5(action: string, body: any): Promise<any | null> {
  switch (action) {
    /* Stakeholders */
    case "bs_list_stakeholders":          return bsListStakeholders(body);
    case "bs_upsert_stakeholder":         return bsUpsertStakeholder(body);
    case "bs_delete_stakeholder":         return bsDeleteStakeholder(body);
    /* Synthesis */
    case "bs_list_synthesis_candidates":  return bsListSynthesisCandidates(body);
    case "bs_synthesize_persona":         return bsSynthesizePersona(body);
    case "bs_apply_synthesis":            return bsApplySynthesis(body);
    /* Re-extract */
    case "bs_reextract_document":         return bsReextractDocument(body);
    /* Diff */
    case "bs_get_version_diff":           return bsGetVersionDiff(body);
    /* Dependencies */
    case "bs_get_document_dependencies":  return bsGetDocumentDependencies(body);
    case "bs_get_field_dependents":       return bsGetFieldDependents(body);
    default: return null;
  }
}
