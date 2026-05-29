/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/client-report-uploads.ts

   File upload + parse for the Client Report pillar reference material.
   Accepts PDF / DOCX / XLSX. Files arrive base64-encoded from the browser,
   are persisted to Supabase Storage, parsed server-side (DOCX → markdown,
   XLSX → markdown tables, PDF → kept as base64 for native Anthropic API
   document blocks), and registered in client_report_attachments with the
   extracted text.

   Size cap 10MB. Allowlist enforced server-side. No fallback to text/plain
   here — the operator can still paste plain text directly into the form.
════════════════════════════════════════════════════════════════ */

import { db } from "../db.js";

const BUCKET = "client-report-attachments";
const MAX_SIZE_BYTES = 10 * 1024 * 1024;  // 10 MB

const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "docx",  // older .doc — let mammoth try
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",  // older .xls
  "text/csv": "csv",
};

const EXT_FALLBACK: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

function detectExt(fileName: string, contentType: string): string {
  const ct = (contentType || "").toLowerCase();
  if (ALLOWED_MIME[ct]) return ALLOWED_MIME[ct];
  const ext = (fileName || "").toLowerCase().split(".").pop() || "";
  if (EXT_FALLBACK[ext]) return ext;
  return "";
}

interface ParseResult {
  extracted_text: string;
  pdf_base64?: string;
  parse_status: string;   // 'ok' | 'scanned_pdf' | 'empty' | 'failed: ...'
  parse_note?: string;
}

/* ─── Parsers ──────────────────────────────────────────────────────── */

async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  try {
    const mammoth: any = await import("mammoth");
    const res = await mammoth.default.convertToMarkdown({ buffer });
    const md = String(res.value || "").trim();
    if (!md || md.length < 30) return { extracted_text: "", parse_status: "empty", parse_note: "DOCX parsed but contains almost no text." };
    return { extracted_text: md, parse_status: "ok" };
  } catch (e: any) {
    return { extracted_text: "", parse_status: `failed: ${e?.message || "DOCX parse error"}` };
  }
}

async function parseXlsx(buffer: Buffer): Promise<ParseResult> {
  try {
    const XLSX: any = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    if (!wb.SheetNames?.length) return { extracted_text: "", parse_status: "empty", parse_note: "Spreadsheet has no sheets." };
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet) as string;
      if (!csv.trim()) continue;
      // Convert CSV → markdown table for readability in the prompt
      const rows = csv.split(/\r?\n/).filter(r => r.trim());
      if (!rows.length) continue;
      parts.push(`## Sheet: ${name}\n`);
      // Limit per sheet to keep prompt manageable
      const cap = Math.min(rows.length, 200);
      const parsedRows = rows.slice(0, cap).map(r => r.split(",").map(c => c.replace(/^"|"$/g, "").trim()));
      const maxCols = Math.max(...parsedRows.map(r => r.length), 1);
      const header = parsedRows[0] || [];
      while (header.length < maxCols) header.push("");
      parts.push("| " + header.join(" | ") + " |");
      parts.push("| " + Array(maxCols).fill("---").join(" | ") + " |");
      for (let i = 1; i < parsedRows.length; i++) {
        const row = [...parsedRows[i]];
        while (row.length < maxCols) row.push("");
        parts.push("| " + row.join(" | ") + " |");
      }
      if (rows.length > cap) parts.push(`\n_…${rows.length - cap} more rows truncated to keep prompt size manageable._\n`);
      parts.push("");
    }
    const out = parts.join("\n").trim();
    if (!out) return { extracted_text: "", parse_status: "empty", parse_note: "Spreadsheet has no readable data." };
    return { extracted_text: out, parse_status: "ok" };
  } catch (e: any) {
    return { extracted_text: "", parse_status: `failed: ${e?.message || "XLSX parse error"}` };
  }
}

async function parseCsv(buffer: Buffer): Promise<ParseResult> {
  try {
    const text = buffer.toString("utf8");
    const rows = text.split(/\r?\n/).filter(r => r.trim());
    if (!rows.length) return { extracted_text: "", parse_status: "empty" };
    const parsedRows = rows.slice(0, 200).map(r => r.split(",").map(c => c.replace(/^"|"$/g, "").trim()));
    const maxCols = Math.max(...parsedRows.map(r => r.length), 1);
    const header = parsedRows[0] || [];
    while (header.length < maxCols) header.push("");
    const md: string[] = ["| " + header.join(" | ") + " |", "| " + Array(maxCols).fill("---").join(" | ") + " |"];
    for (let i = 1; i < parsedRows.length; i++) {
      const row = [...parsedRows[i]]; while (row.length < maxCols) row.push("");
      md.push("| " + row.join(" | ") + " |");
    }
    if (rows.length > 200) md.push(`\n_…${rows.length - 200} more rows truncated._`);
    return { extracted_text: md.join("\n"), parse_status: "ok" };
  } catch (e: any) {
    return { extracted_text: "", parse_status: `failed: ${e?.message || "CSV parse error"}` };
  }
}

/* ─── Main upload handler ─────────────────────────────────────────── */
export async function clientReportUploadAttachment(opts: {
  projectId: string;
  runId?: string;
  fileName: string;
  contentType: string;
  /** Base64-encoded file content (no data: prefix). */
  fileB64: string;
}): Promise<{ success: boolean; attachment_id?: string; parse_status?: string; parse_note?: string; extracted_text_preview?: string; size_bytes?: number; error?: string }> {
  if (!opts.projectId) return { success: false, error: "projectId required" };
  if (!opts.fileB64) return { success: false, error: "file content required" };

  const ext = detectExt(opts.fileName || "", opts.contentType || "");
  if (!ext) return { success: false, error: `Unsupported file type. Allowed: PDF, DOCX, XLSX, CSV. (Got: ${opts.contentType || "unknown"})` };

  let buffer: Buffer;
  try { buffer = Buffer.from(opts.fileB64, "base64"); }
  catch (e: any) { return { success: false, error: `Could not decode file: ${e?.message}` }; }

  if (buffer.length === 0) return { success: false, error: "Decoded file is empty." };
  if (buffer.length > MAX_SIZE_BYTES) return { success: false, error: `File is ${Math.round(buffer.length / 1024 / 1024)}MB — limit is 10MB.` };

  const safeName = String(opts.fileName || `upload.${ext}`).replace(/[^\w.\-]+/g, "_").slice(0, 180);

  // Parse
  let parseResult: ParseResult;
  if (ext === "pdf") {
    // PDFs go to Anthropic natively — no server-side parsing.
    parseResult = { extracted_text: "", pdf_base64: opts.fileB64, parse_status: "ok", parse_note: "PDF will be passed to the model as a native document block." };
  } else if (ext === "docx" || ext === "doc") {
    parseResult = await parseDocx(buffer);
  } else if (ext === "xlsx" || ext === "xls") {
    parseResult = await parseXlsx(buffer);
  } else if (ext === "csv") {
    parseResult = await parseCsv(buffer);
  } else {
    return { success: false, error: `No parser for .${ext}` };
  }

  // Persist to storage (idempotent path under project)
  const attachmentId = (globalThis.crypto?.randomUUID?.() || `att_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  const storagePath = `${opts.projectId}/${attachmentId}.${ext}`;
  const ct = opts.contentType || EXT_FALLBACK[ext] || "application/octet-stream";

  try {
    const { error: upErr } = await db().storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: ct, cacheControl: "3600", upsert: false,
    });
    if (upErr) {
      // Log the full error server-side regardless of category.
      console.error(`[workspace/client-report-upload] storage upload failed for path=${storagePath} ct=${ct} size=${buffer.length}:`, JSON.stringify({
        message: upErr.message,
        name: (upErr as any).name,
        status: (upErr as any).status,
        statusCode: (upErr as any).statusCode,
        error: (upErr as any).error,
        details: (upErr as any).details,
        hint: (upErr as any).hint,
        stack: (upErr as any).stack ? String((upErr as any).stack).split("\n").slice(0, 4) : undefined,
      }));

      const msg = String(upErr.message || "");
      if (/Bucket not found|not.found/i.test(msg)) {
        return { success: false, error: `Storage bucket '${BUCKET}' not found. Run the Build 10b migration in Supabase. (raw: ${msg})` };
      }
      if (/row.level security|new row violates row.level/i.test(msg)) {
        return { success: false, error: `Storage RLS is still denying uploads. Easiest fix: in Supabase, make the '${BUCKET}' bucket public (storage.buckets.public = true). UUID-based paths keep files unguessable. (raw: ${msg})` };
      }
      if (/duplicate|already exists/i.test(msg)) {
        return { success: false, error: `A file already exists at this path. Try again — the path includes a fresh UUID, so this should be transient. (raw: ${msg})` };
      }
      if (/payload too large|too large|413/i.test(msg)) {
        return { success: false, error: `File too large for the storage backend's per-request limit. (raw: ${msg})` };
      }
      return { success: false, error: `Storage upload failed: ${msg}` };
    }
  } catch (e: any) {
    return { success: false, error: `Storage upload exception: ${e?.message}` };
  }

  // Register metadata row
  const { data: row, error: insErr } = await db().from("client_report_attachments").insert({
    id: attachmentId,
    project_id: opts.projectId,
    run_id: opts.runId || null,
    file_name: safeName,
    content_type: ct,
    size_bytes: buffer.length,
    storage_path: storagePath,
    extracted_text: parseResult.extracted_text || null,
    pdf_base64: parseResult.pdf_base64 || null,
    parse_status: parseResult.parse_status,
    parse_note: parseResult.parse_note || null,
  }).select("id").single();

  if (insErr) {
    // Roll back the storage object so we don't orphan it
    await db().storage.from(BUCKET).remove([storagePath]).catch(() => {});
    if (/relation .* does not exist/i.test(insErr.message || "")) {
      return { success: false, error: "Table 'client_report_attachments' not found — run the Build 10b migration in Supabase first." };
    }
    return { success: false, error: `Metadata insert failed: ${insErr.message}` };
  }

  return {
    success: true,
    attachment_id: (row as any).id,
    parse_status: parseResult.parse_status,
    parse_note: parseResult.parse_note,
    extracted_text_preview: (parseResult.extracted_text || "").slice(0, 400),
    size_bytes: buffer.length,
  };
}

/* ─── List attachments for a run (for UI) ─────────────────────────── */
export async function clientReportListAttachments(opts: { projectId: string; runId?: string }): Promise<{ success: boolean; attachments?: any[]; error?: string }> {
  if (!opts.projectId) return { success: false, error: "projectId required" };
  let q = db().from("client_report_attachments")
    .select("id, file_name, content_type, size_bytes, parse_status, parse_note, created_at")
    .eq("project_id", opts.projectId);
  if (opts.runId) q = q.or(`run_id.eq.${opts.runId},run_id.is.null`);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
  if (error) {
    if (/relation .* does not exist/i.test(error.message || "")) {
      return { success: true, attachments: [] };  // graceful: pre-migration
    }
    return { success: false, error: error.message };
  }
  return { success: true, attachments: data || [] };
}

/* ─── Delete an attachment ────────────────────────────────────────── */
export async function clientReportRemoveAttachment(opts: { attachmentId: string; projectId: string }): Promise<{ success: boolean; error?: string }> {
  if (!opts.attachmentId || !opts.projectId) return { success: false, error: "attachmentId and projectId required" };
  const { data: row, error: fetchErr } = await db().from("client_report_attachments")
    .select("storage_path, project_id").eq("id", opts.attachmentId).maybeSingle();
  if (fetchErr) return { success: false, error: fetchErr.message };
  if (!row) return { success: false, error: "Attachment not found." };
  if ((row as any).project_id !== opts.projectId) return { success: false, error: "Project mismatch." };

  await db().storage.from(BUCKET).remove([(row as any).storage_path]).catch(() => {});
  const { error: delErr } = await db().from("client_report_attachments").delete().eq("id", opts.attachmentId);
  if (delErr) return { success: false, error: delErr.message };
  return { success: true };
}

/* ─── Fetch an attachment's parsed content for prompt building ───── */
export async function clientReportLoadAttachments(attachmentIds: string[]): Promise<Array<{ id: string; file_name: string; content_type: string; extracted_text: string | null; pdf_base64: string | null; parse_status: string; parse_note: string | null }>> {
  if (!attachmentIds.length) return [];
  const { data, error } = await db().from("client_report_attachments")
    .select("id, file_name, content_type, extracted_text, pdf_base64, parse_status, parse_note")
    .in("id", attachmentIds);
  if (error) return [];
  return (data || []) as any[];
}
