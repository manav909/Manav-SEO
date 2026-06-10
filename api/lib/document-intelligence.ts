/* ════════════════════════════════════════════════════════════════
   api/lib/document-intelligence.ts

   BUILD 12.31 — Document-intelligence engine.

   Reads the operator's uploaded materials (their own analysis and the
   client's files) and extracts REAL findings from them, organised
   against EACH requirement in the client's brief. This is how the
   uploaded work actually drives the audit — and, because those documents
   often hold the very data GSC would (manual analysis, exports), it is
   the substance path when there is no GSC connection.

   Honesty, enforced:
   - It EXTRACTS from the documents; it does not invent or infer beyond
     them. Every finding cites the source file.
   - Requirements the documents do not address are listed as uncovered —
     not padded.
   - It reads up to a large single-pass budget of the materials (the
     model's context); if the corpus exceeds that, it says plainly that
     it analysed the first N characters and the rest needs another pass.

   One LLM call over the materials (fits a large context); no chunked
   multi-call loop, to stay within the serverless time budget.
   Multi-tenant: projectId + the requirements list only.
════════════════════════════════════════════════════════════════ */

import { loadMaterials, materialsForPrompt } from "./client-materials.js";
import { llm, parseJsonResponse } from "./workspace/llm.js";

export interface RequirementFinding {
  requirement:  string;
  findings:     string[];
  data_points:  string[];
  source_files: string[];
}

export interface DocumentAnalysisReport {
  step_key:            "document_analysis";
  generated_at:        string;
  has_materials:       boolean;
  files:               string[];
  truncated:           boolean;
  requirement_findings:RequirementFinding[];
  uncovered:           string[];
  summary:             string;
  limits:              string[];
}

const DOC_SYSTEM = [
  `You are a senior SEO and AEO analyst. You are given the operator's UPLOADED DOCUMENTS — their own analysis and the client's files — and a list of the client's audit REQUIREMENTS.`,
  `Your job: for EACH requirement, extract what the documents actually contain that answers it.`,
  ``,
  `For each requirement, return: findings (concrete points the documents establish), data_points (any specific numbers, metrics, URLs, or facts stated in the documents), and source_files (the file name(s) the material came from).`,
  `List under "uncovered" any requirement the documents do not meaningfully address.`,
  ``,
  `HARD RULES — non-negotiable:`,
  `- Use ONLY what is in the provided documents. Do NOT invent, estimate, or infer beyond what the documents state.`,
  `- Attribute every finding to its source file (use the "===== FILE: name =====" markers).`,
  `- If a requirement is not addressed by the documents, put it in "uncovered" — do NOT fabricate content for it.`,
  `- Quote or closely paraphrase real specifics; do not generalise into vague filler.`,
  ``,
  `Return ONLY valid JSON, no prose, no fences:`,
  `{"requirement_findings":[{"requirement":"...","findings":["..."],"data_points":["..."],"source_files":["..."]}],"uncovered":["..."]}`,
].join("\n");

export async function analyzeFromDocuments(opts: { projectId: string; requirements: string[]; clientName?: string }): Promise<DocumentAnalysisReport> {
  const now = new Date().toISOString();
  const reqs = (opts.requirements || []).map(s => String(s || "").trim()).filter(Boolean);
  const mats = await loadMaterials(opts.projectId);

  const empty = (msg: string, hasMat: boolean): DocumentAnalysisReport => ({
    step_key: "document_analysis", generated_at: now, has_materials: hasMat, files: mats.map(m => m.filename), truncated: false,
    requirement_findings: [], uncovered: reqs, summary: msg, limits: ["Requires uploaded documents."],
  });

  if (mats.length === 0) return empty("No documents uploaded. Upload your analysis and the client's files, then run this — it reads them and answers each brief requirement from your real material.", false);
  if (reqs.length === 0) return empty("No requirements supplied to map the documents against.", true);

  const { text, filenames, truncated } = materialsForPrompt(mats, 550000);
  const user = [
    `Client: ${opts.clientName || "the website"}.`,
    `Requirements to answer from the documents:`,
    reqs.map((r, i) => `${i + 1}. ${r}`).join("\n"),
    ``,
    `Uploaded documents:`,
    text,
  ].join("\n");

  let parsed: any = null;
  try {
    const raw = await llm({ system: DOC_SYSTEM, user: user.slice(0, 600000), maxTokens: 4000, timeoutMs: 90000, label: "document-intelligence" });
    parsed = parseJsonResponse<any>(raw);
  } catch { /* fall through to honest empty-ish */ }

  if (!parsed || !Array.isArray(parsed.requirement_findings)) {
    return { step_key: "document_analysis", generated_at: now, has_materials: true, files: filenames, truncated,
      requirement_findings: [], uncovered: reqs, summary: "The documents were read but could not be reliably analysed into per-requirement findings on this pass. Try again, or split very large documents.", limits: ["Analysis pass did not return structured findings."] };
  }

  const requirement_findings: RequirementFinding[] = (parsed.requirement_findings || []).map((r: any) => ({
    requirement: String(r?.requirement || "").trim(),
    findings: Array.isArray(r?.findings) ? r.findings.filter((x: any) => typeof x === "string") : [],
    data_points: Array.isArray(r?.data_points) ? r.data_points.filter((x: any) => typeof x === "string") : [],
    source_files: Array.isArray(r?.source_files) ? r.source_files.filter((x: any) => typeof x === "string") : [],
  })).filter((r: RequirementFinding) => r.requirement && (r.findings.length || r.data_points.length));

  const uncovered: string[] = Array.isArray(parsed.uncovered) ? parsed.uncovered.filter((x: any) => typeof x === "string") : [];
  const answered = requirement_findings.length;

  const limits: string[] = [
    `Findings are extracted from the uploaded documents only — they are as accurate as the documents themselves.`,
    truncated ? `The documents exceeded a single analysis pass; the first ~550,000 characters were read. Very large corpora need another pass for full coverage.` : `All uploaded documents were read in this pass.`,
  ];

  return {
    step_key: "document_analysis", generated_at: now, has_materials: true, files: filenames, truncated,
    requirement_findings, uncovered,
    summary: `Read ${filenames.length} document(s) and answered ${answered} of ${reqs.length} requirement(s) from your real material${uncovered.length ? `; ${uncovered.length} requirement(s) are not covered by the documents and need other data (for example, live analysis or GSC)` : ""}.`,
    limits,
  };
}
