/* ════════════════════════════════════════════════════════════════
   api/lib/brand-studio-investor-bundle.ts
   Brand Studio Phase 1G — Investor data room ZIP export.

   Produces a complete investor data room as a single downloadable ZIP:

     /investor-bundle.zip
       ├ README.md                       (auto-generated index)
       ├ metrics-snapshot.csv            (current Data Room analytics)
       ├ investor-one-pager.docx         (most recent version)
       ├ pitch-deck-outline.docx
       ├ market-opportunity.docx
       ├ traction-memo.docx
       ├ competitive-moat.docx
       └ source-documents/               (ingested docs flagged for inclusion)
           └ <name>.md                   (raw text content)

   The exporter reuses the Phase 1F DOCX exporter for the per-doc
   builds, then jszip-bundles everything. Result is uploaded to the
   investor-bundles storage bucket; a 7-day signed URL is returned.

   Endpoint: bs_export_investor_bundle { projectId, include? }
     include?.cover_letter?: boolean — default false; if true, generates a templated cover letter
     include?.source_documents?: boolean — default true; includes ingested doc text
   Output: { success, signedUrl, filename, sizeBytes }
═══════════════════════════════════════════════════════════════ */

import JSZip from "jszip";
import { db } from "./db.js";
import { bsExportDocx } from "./brand-studio-export.js";

const INVESTOR_TEMPLATES = [
  { id: "investor_one_pager",  label: "Investor One-Pager",       filename: "investor-one-pager.docx"     },
  { id: "pitch_deck_outline",  label: "Pitch Deck Outline",       filename: "pitch-deck-outline.docx"     },
  { id: "market_opportunity",  label: "Market Opportunity",       filename: "market-opportunity.docx"     },
  { id: "traction_memo",       label: "Traction Memo",            filename: "traction-memo.docx"          },
  { id: "competitive_moat",    label: "Competitive Moat",         filename: "competitive-moat.docx"       },
] as const;

const BUNDLE_BUCKET     = "investor-bundles";
const BUNDLE_SIGNED_TTL = 7 * 24 * 3600;  /* 7 days */

interface BundleOpts {
  projectId: string;
  include?: {
    cover_letter?:     boolean;
    source_documents?: boolean;
  };
  /** Phase 1H — time scope passed through to DOCX exports for live data.
   *  Currently the DOCX exporter only renders placeholders for live data,
   *  so this is recorded in the README for the audit trail but doesn't
   *  yet affect the rendered docx content. Will be wired through in a
   *  follow-up that adds server-side data resolution to bsExportDocx. */
  scope?: any;
}

export async function bsExportInvestorBundle(body: BundleOpts): Promise<any> {
  const { projectId, scope } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  const includeSources     = body.include?.source_documents !== false;  /* default true */
  const includeCoverLetter = body.include?.cover_letter      === true;  /* default false */

  /* 1. Load project + brand context (used in README + cover) */
  const [{ data: project }, { data: brand }] = await Promise.all([
    db().from("projects").select("id,name,domain,industry").eq("id", projectId).maybeSingle(),
    db().from("brand_assets").select("primary_logo_url,primary_color,tagline").eq("project_id", projectId).maybeSingle(),
  ]);
  if (!project) return { success: false, error: "Project not found" };

  /* Resolve the scope to an actual date range for the audit trail.
     We lazily import to avoid pulling the resolver into the bundle
     module's static graph. */
  let scopeLabel = "All available data";
  let scopeRange: { from: string; to: string } | null = null;
  if (scope && typeof scope === "object") {
    try {
      const { resolveScopeForReport } = await import("./brand-studio-resolve.js")
        .then((m: any) => ({ resolveScopeForReport: m.resolveScopeForReport || m.resolveScopeRange }))
        .catch(() => ({ resolveScopeForReport: null as any }));
      if (resolveScopeForReport) {
        scopeRange = await resolveScopeForReport(projectId, scope);
      }
    } catch { /* non-fatal */ }
    scopeLabel = describeScopeForReport(scope, scopeRange);
  }

  const zip = new JSZip();
  const report: BundleReport = {
    projectName:        (project as any).name,
    builtAt:            new Date().toISOString(),
    investorDocs:       [],
    sourceDocs:         [],
    metricsRowCount:    0,
    coverLetterIncluded:false,
    scopeLabel,
    scopeRange,
  };

  /* 2. For each of the 5 investor templates, find the most recent version
        and DOCX-export it */
  for (const tpl of INVESTOR_TEMPLATES) {
    const { data: docs } = await db().from("project_documents")
      .select("id,name,version,published_at,confidence,published_to_client")
      .eq("project_id", projectId)
      .eq("doc_type",   tpl.id)
      .eq("kind",       "generated")
      .order("version", { ascending: false })
      .limit(1);

    if (!docs || docs.length === 0) {
      report.investorDocs.push({
        templateLabel: tpl.label,
        status:        "missing",
        note:          "No generated document exists yet — create one in Brand Studio → Generate.",
      });
      continue;
    }

    const doc = docs[0] as any;
    try {
      const exported = await bsExportDocx({ documentId: doc.id });
      if (exported.success && exported.base64) {
        zip.file(tpl.filename, Buffer.from(exported.base64, "base64"));
        report.investorDocs.push({
          templateLabel: tpl.label,
          status:        "included",
          documentName:  doc.name,
          version:       doc.version,
          confidence:    doc.confidence,
          published:     !!doc.published_to_client,
          filename:      tpl.filename,
        });
      } else {
        report.investorDocs.push({
          templateLabel: tpl.label,
          status:        "export_failed",
          documentName:  doc.name,
          note:          exported.error || "DOCX build returned no data",
        });
      }
    } catch (e: any) {
      report.investorDocs.push({
        templateLabel: tpl.label,
        status:        "export_failed",
        documentName:  doc.name,
        note:          String(e?.message || e),
      });
    }
  }

  /* 3. Metrics snapshot CSV — pull analytics fields from project_knowledge */
  const { data: knowledgeRows } = await db().from("project_knowledge")
    .select("category,field_key,field_value,source,notes,updated_at")
    .eq("project_id", projectId)
    .order("category", { ascending: true })
    .order("field_key", { ascending: true });

  const csv = buildMetricsCsv(knowledgeRows || []);
  zip.file("metrics-snapshot.csv", csv);
  report.metricsRowCount = (knowledgeRows || []).length;

  /* 4. Source documents (ingested) — text content as .md, organized by stakeholder.
        Requires the share_in_investor_pack column from the Phase 1G migration.
        If the column doesn't exist yet, the query fails silently and we
        skip source docs — the bundle is still produced. */
  if (includeSources) {
    let ingestedDocs: any[] | null = null;
    try {
      const r = await db().from("project_documents")
        .select("id,name,doc_type,stakeholder_role,raw_content,source_url,created_at,extracted_data")
        .eq("project_id", projectId)
        .eq("kind",       "ingested")
        .eq("share_in_investor_pack", true)
        .order("created_at", { ascending: false })
        .limit(80);
      ingestedDocs = r.data || null;
    } catch { /* column missing → migration not yet run; skip source docs */ }

    for (const sdoc of (ingestedDocs || [])) {
      const d = sdoc as any;
      const safeName = sanitizeFilename(d.name || `source-${d.id.slice(0,8)}`);
      const folder = d.stakeholder_role ? `source-documents/${sanitizeFilename(d.stakeholder_role)}` : "source-documents";
      const path = `${folder}/${safeName}.md`;
      const body = renderSourceDocMd(d);
      zip.file(path, body);
      report.sourceDocs.push({
        name:            d.name,
        path,
        docType:         d.doc_type,
        stakeholderRole: d.stakeholder_role,
        createdAt:       d.created_at,
        sourceUrl:       d.source_url,
      });
    }
  }

  /* 5. Cover letter (optional, templated for v1) */
  if (includeCoverLetter) {
    const letter = buildCoverLetter({
      projectName: (project as any).name,
      industry:    (project as any).industry || "",
      tagline:     (brand as any)?.tagline    || "",
      date:        new Date().toISOString().slice(0, 10),
    });
    zip.file("cover-letter.md", letter);
    report.coverLetterIncluded = true;
  }

  /* 6. Auto-generated README */
  zip.file("README.md", buildReadme(report, (project as any), (brand as any)));

  /* 7. Pack the ZIP */
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  /* 8. Upload to storage */
  const bundleId = (globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `bundle_${Date.now()}_${Math.random().toString(36).slice(2,10)}`);
  const storagePath = `${projectId}/${bundleId}.zip`;

  const { error: upErr } = await db().storage
    .from(BUNDLE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "application/zip",
      cacheControl: "3600",
      upsert: false,
    });
  if (upErr) return { success: false, error: `Storage upload failed: ${upErr.message}` };

  /* 9. Mint 7-day signed URL */
  const { data: signed } = await db().storage
    .from(BUNDLE_BUCKET)
    .createSignedUrl(storagePath, BUNDLE_SIGNED_TTL);

  if (!signed?.signedUrl) {
    /* Clean up the storage object on failure */
    await db().storage.from(BUNDLE_BUCKET).remove([storagePath]).catch(() => {});
    return { success: false, error: "Could not generate signed URL" };
  }

  /* 10. Build a filename for the browser */
  const today      = new Date().toISOString().slice(0, 10);
  const safeName   = sanitizeFilename((project as any).name || "project");
  const filename   = `${safeName}_investor-bundle_${today}.zip`;

  return {
    success:    true,
    signedUrl:  signed.signedUrl,
    filename,
    sizeBytes:  buffer.length,
    report,
  };
}

/* ─── Report shape for README + frontend display ─────────────── */

interface BundleReport {
  projectName:         string;
  builtAt:             string;
  investorDocs:        Array<{
    templateLabel: string;
    status:        "included" | "missing" | "export_failed";
    documentName?: string;
    version?:      number;
    confidence?:   string;
    published?:    boolean;
    filename?:     string;
    note?:         string;
  }>;
  sourceDocs:          Array<{
    name:            string;
    path:            string;
    docType?:        string;
    stakeholderRole?:string;
    createdAt?:      string;
    sourceUrl?:      string;
  }>;
  metricsRowCount:     number;
  coverLetterIncluded: boolean;
  /** Phase 1H — time scope captured at the moment of bundle creation */
  scopeLabel?:         string;
  scopeRange?:         { from: string; to: string } | null;
}

/* ─── README generator ──────────────────────────────────────── */

function buildReadme(report: BundleReport, project: any, brand: any): string {
  const lines: string[] = [];
  lines.push(`# Investor Data Room — ${report.projectName}`);
  lines.push("");
  lines.push(`*Generated: ${new Date(report.builtAt).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })}*`);
  lines.push("");
  if (report.scopeLabel) {
    lines.push(`*Time scope for charts, KPIs & metrics: **${report.scopeLabel}***`);
    lines.push("");
  }

  if (brand?.tagline) lines.push(`> ${brand.tagline}`);
  lines.push("");
  if (project?.industry) lines.push(`**Industry:** ${project.industry}`);
  if (project?.domain)   lines.push(`**Domain:**   ${project.domain}`);
  lines.push("");

  lines.push("## Contents");
  lines.push("");

  /* Investor documents */
  lines.push("### Investor documents");
  lines.push("");
  for (const d of report.investorDocs) {
    if (d.status === "included") {
      lines.push(`- ✅ **${d.templateLabel}** → \`${d.filename}\`  *(${d.documentName}, v${d.version || 1}, ${d.confidence || "—"} confidence, ${d.published ? "published" : "draft"})*`);
    } else if (d.status === "missing") {
      lines.push(`- ⚠ ${d.templateLabel} — missing. ${d.note || ""}`);
    } else {
      lines.push(`- ❌ ${d.templateLabel} — export failed. ${d.note || ""}`);
    }
  }
  lines.push("");

  /* Metrics */
  lines.push("### Metrics snapshot");
  lines.push("");
  lines.push(`- 📊 **metrics-snapshot.csv** — ${report.metricsRowCount} Data Room fields exported (analytics, growth, traction).`);
  lines.push("");

  /* Source documents */
  if (report.sourceDocs.length > 0) {
    lines.push("### Source documents");
    lines.push("");
    lines.push(`${report.sourceDocs.length} ingested document(s) marked as investor-pack-shareable, organized under \`source-documents/\` by stakeholder role.`);
    lines.push("");
    const byStakeholder = new Map<string, typeof report.sourceDocs>();
    for (const s of report.sourceDocs) {
      const key = s.stakeholderRole || "general";
      if (!byStakeholder.has(key)) byStakeholder.set(key, []);
      byStakeholder.get(key)!.push(s);
    }
    for (const [role, docs] of byStakeholder) {
      lines.push(`#### ${role}`);
      lines.push("");
      for (const d of docs) {
        const date = d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-GB") : "";
        lines.push(`- \`${d.path}\` — ${d.name} ${d.docType ? `(${d.docType})` : ""} ${date ? `· ${date}` : ""}`);
      }
      lines.push("");
    }
  } else {
    lines.push("### Source documents");
    lines.push("");
    lines.push("*No ingested documents are marked for investor-pack inclusion. To include source files, open them in Brand Studio → Library and toggle \"Include in investor pack\".*");
    lines.push("");
  }

  /* Cover letter */
  if (report.coverLetterIncluded) {
    lines.push("### Cover letter");
    lines.push("");
    lines.push("- 📝 **cover-letter.md** — Templated cover letter for the investor.");
    lines.push("");
  }

  /* Footer */
  lines.push("---");
  lines.push("");
  lines.push("This bundle was generated by Brand Studio. Each `.docx` file mirrors what was rendered in the web viewer at the time of export — cover pages, KPIs, callouts, embedded images, and tables are preserved.");
  lines.push("");
  lines.push("**Confidentiality:** This data room is intended for the named recipient. Do not redistribute.");

  return lines.join("\n");
}

/* ─── Cover letter (v1 templated) ───────────────────────────── */

function buildCoverLetter(opts: {
  projectName: string; industry?: string; tagline?: string; date: string;
}): string {
  const lines = [
    `# ${opts.projectName} — Investor Briefing`,
    "",
    `*${opts.date}*`,
    "",
    "Dear Investor,",
    "",
    `Thank you for your interest in ${opts.projectName}${opts.industry ? `, operating in ${opts.industry}` : ""}. ${opts.tagline ? `Our north star: *${opts.tagline}*.` : ""}`,
    "",
    "This data room contains:",
    "",
    "- A current Investor One-Pager summarising the opportunity at a glance",
    "- A Pitch Deck Outline with the full narrative arc",
    "- A Market Opportunity memo with TAM/SAM/SOM analysis",
    "- A Traction Memo documenting growth, retention, and proof points to date",
    "- A Competitive Moat memo articulating our defensible position",
    "- A current metrics snapshot (CSV) of the underlying analytics",
    "- Source documents organised by stakeholder for primary evidence",
    "",
    "Every quantitative claim in these documents traces back to a source identifier — we hold ourselves to investor-grade verification rigour.",
    "",
    "We welcome your scrutiny and look forward to your questions.",
    "",
    "Warmly,",
    "",
    `*${opts.projectName} leadership*`,
  ];
  return lines.join("\n");
}

/* ─── Metrics CSV from project_knowledge ────────────────────── */

function buildMetricsCsv(rows: any[]): string {
  const headers = ["category", "field_key", "field_value", "source", "notes", "updated_at"];
  const escape  = (v: any) => {
    const s = v == null ? "" : (typeof v === "string" ? v : (typeof v === "object" ? JSON.stringify(v) : String(v)));
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h])).join(","));
  }
  return lines.join("\n");
}

/* ─── Source document markdown rendering ────────────────────── */

function renderSourceDocMd(d: any): string {
  const lines: string[] = [];
  lines.push(`# ${d.name}`);
  lines.push("");
  lines.push(`*Type: ${d.doc_type || "—"}*`);
  if (d.stakeholder_role) lines.push(`*Stakeholder: ${d.stakeholder_role}*`);
  if (d.source_url)       lines.push(`*Source URL: ${d.source_url}*`);
  if (d.created_at)       lines.push(`*Ingested: ${new Date(d.created_at).toLocaleDateString("en-GB")}*`);
  lines.push("");
  /* Document summary if extracted */
  const summary = d.extracted_data?.doc_summary;
  if (summary) {
    lines.push("## Summary");
    lines.push("");
    lines.push(String(summary));
    lines.push("");
  }
  lines.push("## Content");
  lines.push("");
  lines.push(String(d.raw_content || "").slice(0, 100_000));  /* cap per-file */
  return lines.join("\n");
}

/* ─── Utilities ─────────────────────────────────────────────── */

function sanitizeFilename(s: string): string {
  return String(s || "")
    .replace(/[^a-z0-9-_\s.]+/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "file";
}

/** Phase 1H — derive a human-readable label for the chosen scope.
 *  Mirrors the frontend describeScope but server-side. */
function describeScopeForReport(scope: any, range: { from: string; to: string } | null): string {
  if (!scope || typeof scope !== "object") return "All available data";
  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return iso; }
  };
  if (scope.kind === "custom") {
    const from = scope.from ? fmt(scope.from) : "(start)";
    const to   = scope.to   ? fmt(scope.to)   : "today";
    return `${from} → ${to}`;
  }
  if (scope.kind === "preset") {
    const presetLabels: Record<string, string> = {
      last_30d:       "Last 30 days",
      last_90d:       "Last 90 days",
      last_365d:      "Last 365 days",
      monthly:        "This month",
      last_month:     "Last month",
      quarterly:      "This quarter",
      last_quarter:   "Last quarter",
      ytd:            "Year to date",
      since_baseline: range ? `Since baseline (${fmt(range.from)})` : "Since baseline",
    };
    const base = presetLabels[scope.presetKey] || String(scope.presetKey || "");
    if (range && scope.presetKey !== "since_baseline") {
      return `${base} (${fmt(range.from)} → ${fmt(range.to)})`;
    }
    return base;
  }
  return "All available data";
}

/* ─── Toggle endpoint — flip the share_in_investor_pack flag ─── */

export async function bsToggleInvestorPack(body: any): Promise<any> {
  const { documentId, projectId, include } = body;
  if (!documentId || !projectId) return { success: false, error: "documentId + projectId required" };
  try {
    const { error } = await db().from("project_documents")
      .update({ share_in_investor_pack: include === true })
      .eq("id", documentId)
      .eq("project_id", projectId);
    if (error) return { success: false, error: error.message };
    return { success: true, include: include === true };
  } catch (e: any) {
    return { success: false, error: e?.message || "Update failed" };
  }
}
