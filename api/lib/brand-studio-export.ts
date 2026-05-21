/* ════════════════════════════════════════════════════════════════
   api/lib/brand-studio-export.ts
   Brand Studio Phase 1F — DOCX export.

   Walks a document's raw_content (markdown + directives) and produces
   a downloadable .docx. Maps each markdown/directive construct to its
   docx equivalent:
     - Headings, paragraphs, lists, blockquotes, code, tables, hr
     - All 10 directives → appropriate docx representation
     - Inline: bold / italic / inline code / links

   Returns base64 so the frontend can decode + trigger a browser
   download with the right filename + content-type.

   Endpoint: bs_export_docx { documentId } → { success, base64, filename, contentType }
═══════════════════════════════════════════════════════════════ */

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun,
  PageBreak, ShadingType, UnderlineType, ExternalHyperlink, LevelFormat,
} from "docx";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import { db } from "./db.js";

/* ─── Public endpoint ────────────────────────────────────────── */

export async function bsExportDocx(body: any): Promise<any> {
  const { documentId } = body;
  if (!documentId) return { success: false, error: "documentId required" };

  /* 1. Load the document */
  const { data: doc, error } = await db().from("project_documents")
    .select("id,project_id,name,doc_type,raw_content,extracted_data,published_at,version,confidence,audience_role")
    .eq("id", documentId).maybeSingle();
  if (error || !doc) return { success: false, error: "Document not found" };

  /* 2. Load attachments + brand assets in parallel (for image resolution + cover logo) */
  const [{ data: attRows }, { data: brand }, { data: project }] = await Promise.all([
    db().from("document_attachments").select("*").eq("document_id", documentId),
    db().from("brand_assets").select("primary_logo_url,primary_color").eq("project_id", (doc as any).project_id).maybeSingle(),
    db().from("projects").select("name").eq("id", (doc as any).project_id).maybeSingle(),
  ]);

  /* 3. Pre-fetch image binaries via signed URLs */
  const attachmentsByPath: Record<string, Buffer> = {};
  const attachmentsMeta: Record<string, { width?: number; height?: number; alt?: string; caption?: string }> = {};
  for (const a of (attRows || [])) {
    try {
      const { data: signed } = await db().storage
        .from("document-attachments")
        .createSignedUrl((a as any).storage_path, 600);
      if (!signed?.signedUrl) continue;
      const res = await fetch(signed.signedUrl);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      attachmentsByPath[(a as any).id] = buf;
      attachmentsMeta[(a as any).id] = {
        width:   (a as any).width   || undefined,
        height:  (a as any).height  || undefined,
        alt:     (a as any).alt     || undefined,
        caption: (a as any).caption || undefined,
      };
    } catch { /* skip on error — exporter is resilient */ }
  }

  /* 4. Brand logo binary */
  let brandLogo: Buffer | null = null;
  const brandLogoUrl = (brand as any)?.primary_logo_url;
  if (brandLogoUrl) {
    try {
      const res = await fetch(brandLogoUrl);
      if (res.ok) brandLogo = Buffer.from(await res.arrayBuffer());
    } catch { /* not fatal */ }
  }

  /* 5. Parse markdown */
  const content = String((doc as any).raw_content || "");
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .parse(content);

  const ctx: ExportContext = {
    brandColor:        (brand as any)?.primary_color || "#8B5CF6",
    attachmentBuffers: attachmentsByPath,
    attachmentMeta:    attachmentsMeta,
    brandLogo,
    projectName:       (project as any)?.name || "",
    docName:           (doc as any).name || "",
  };

  /* 6. Walk → docx children */
  const children: any[] = [];
  for (const node of (tree as any).children || []) {
    const out = blockToDocx(node, ctx);
    if (Array.isArray(out)) children.push(...out);
    else if (out) children.push(out);
  }

  /* 7. Build the Document */
  const document = new Document({
    creator: "Brand Studio",
    title:   (doc as any).name,
    description: (doc as any).extracted_data?.overall_summary || "",
    styles: {
      default: {
        document: {
          run:       { font: "Georgia", size: 22 },  /* 22 half-points = 11pt */
          paragraph: { spacing: { after: 120 } },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",  name: "Heading 1", basedOn: "Normal", next: "Normal",
          run:       { size: 36, bold: true, font: "Calibri" },  /* 18pt */
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        {
          id: "Heading2",  name: "Heading 2", basedOn: "Normal", next: "Normal",
          run:       { size: 30, bold: true, font: "Calibri", color: hexNoHash(ctx.brandColor) },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
        {
          id: "Heading3",  name: "Heading 3", basedOn: "Normal", next: "Normal",
          run:       { size: 26, bold: true, font: "Calibri" },
          paragraph: { spacing: { before: 160, after: 80 } },
        },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      children,
    }],
  });

  /* 8. Pack to buffer + base64 */
  const buffer = await Packer.toBuffer(document);
  const base64 = buffer.toString("base64");

  /* 9. Build a clean filename */
  const today = new Date().toISOString().slice(0, 10);
  const safeName = String((doc as any).name || "document")
    .replace(/[^a-z0-9-_\s]+/gi, "")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "document";
  const filename = `${safeName}_${today}.docx`;

  return {
    success: true,
    base64,
    filename,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

/* ─── Context passed through the walker ──────────────────────── */

interface ExportContext {
  brandColor:        string;
  attachmentBuffers: Record<string, Buffer>;
  attachmentMeta:    Record<string, { width?: number; height?: number; alt?: string; caption?: string }>;
  brandLogo:         Buffer | null;
  projectName:       string;
  docName:           string;
}

/* ─── Block-level walker ────────────────────────────────────── */

function blockToDocx(node: any, ctx: ExportContext): any[] | any | null {
  if (!node) return null;
  switch (node.type) {
    case "heading":            return headingToDocx(node);
    case "paragraph":          return new Paragraph({ children: inlineRuns(node.children || []) });
    case "list":               return listToDocx(node);
    case "code":               return codeBlockToDocx(node);
    case "blockquote":         return blockquoteToDocx(node);
    case "thematicBreak":      return new Paragraph({ thematicBreak: true });
    case "table":              return [tableNodeToDocx(node, ctx), spacerParagraph()];
    case "containerDirective":
    case "leafDirective":
    case "textDirective":
      return directiveToDocx(node, ctx);
    case "html":
      /* HTML in markdown — render as plain text */
      return new Paragraph({ children: [new TextRun({ text: String(node.value || ""), italics: true, color: "888888" })] });
    default:
      return null;
  }
}

/* ─── Inline walker ─────────────────────────────────────────── */

interface InlineFormat {
  bold?:      boolean;
  italics?:   boolean;
  color?:     string;
  underline?: boolean;
  font?:      string;
  size?:      number;
}

function inlineRuns(nodes: any[], fmt: InlineFormat = {}): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = [];
  for (const n of nodes || []) {
    if (!n) continue;
    switch (n.type) {
      case "text":
        runs.push(new TextRun(applyFormat({ text: String(n.value || "") }, fmt)));
        break;
      case "strong":
        runs.push(...inlineRuns(n.children, { ...fmt, bold: true }));
        break;
      case "emphasis":
        runs.push(...inlineRuns(n.children, { ...fmt, italics: true }));
        break;
      case "inlineCode":
        runs.push(new TextRun(applyFormat({ text: String(n.value || ""), font: "Courier New" }, fmt)));
        break;
      case "link":
        runs.push(new ExternalHyperlink({
          link: String(n.url || ""),
          children: inlineRuns(n.children, { ...fmt, color: "0066CC", underline: true }),
        }));
        break;
      case "break":
        runs.push(new TextRun({ text: "", break: 1 }));
        break;
      case "delete":
        runs.push(...inlineRuns(n.children, { ...fmt, color: "999999" }));
        break;
      default: {
        /* Unknown inline node — recurse if it has children, else skip */
        if (Array.isArray(n.children)) runs.push(...inlineRuns(n.children, fmt));
      }
    }
  }
  return runs;
}

function applyFormat(base: any, fmt: InlineFormat): any {
  const out: any = { ...base };
  if (fmt.bold)      out.bold = true;
  if (fmt.italics)   out.italics = true;
  if (fmt.color)     out.color = hexNoHash(fmt.color);
  if (fmt.underline) out.underline = { type: UnderlineType.SINGLE };
  if (fmt.font)      out.font = fmt.font;
  if (fmt.size)      out.size = fmt.size;
  return out;
}

/* ─── Block builders ────────────────────────────────────────── */

function headingToDocx(node: any): Paragraph {
  const depth = Math.max(1, Math.min(6, Number(node.depth) || 2));
  const heading =
    depth === 1 ? HeadingLevel.HEADING_1 :
    depth === 2 ? HeadingLevel.HEADING_2 :
    depth === 3 ? HeadingLevel.HEADING_3 :
                  HeadingLevel.HEADING_4;
  return new Paragraph({ heading, children: inlineRuns(node.children || []) });
}

function listToDocx(node: any): Paragraph[] {
  const ordered = node.ordered;
  const out: Paragraph[] = [];
  let idx = 1;
  for (const item of (node.children || [])) {
    /* A list item's first child is usually a paragraph */
    const itemChildren = item.children || [];
    for (const child of itemChildren) {
      if (child.type === "paragraph") {
        if (ordered) {
          out.push(new Paragraph({
            children: [
              new TextRun({ text: `${idx}. `, bold: true }),
              ...inlineRuns(child.children || []),
            ],
            indent: { left: 360 },
          }));
        } else {
          out.push(new Paragraph({
            bullet: { level: 0 },
            children: inlineRuns(child.children || []),
          }));
        }
      } else if (child.type === "list") {
        /* nested list — render inline at next indent (simplified) */
        out.push(...listToDocx(child));
      }
    }
    idx++;
  }
  return out;
}

function codeBlockToDocx(node: any): Paragraph {
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: "F5F5F5" },
    border: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" },
      left:   { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" },
      right:  { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" },
    },
    children: [new TextRun({ text: String(node.value || ""), font: "Courier New", size: 18 })],
  });
}

function blockquoteToDocx(node: any): Paragraph[] {
  return (node.children || []).map((child: any) => new Paragraph({
    indent: { left: 480 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: "CCCCCC", space: 8 } },
    children: child.type === "paragraph" ? inlineRuns(child.children || [], { italics: true }) : [new TextRun({ text: "" })],
  }));
}

function tableNodeToDocx(node: any, ctx: ExportContext): Table {
  const rows: TableRow[] = [];
  for (let i = 0; i < (node.children || []).length; i++) {
    const row = node.children[i];
    const isHeader = i === 0;
    const cells: TableCell[] = (row.children || []).map((cell: any) => new TableCell({
      width:   { size: 100 / row.children.length, type: WidthType.PERCENTAGE },
      shading: isHeader ? { type: ShadingType.CLEAR, fill: hexNoHash(ctx.brandColor) + "15" } : undefined,
      children: [new Paragraph({
        children: inlineRuns(cell.children || [], isHeader ? { bold: true, color: ctx.brandColor } : {}),
      })],
    }));
    rows.push(new TableRow({ children: cells, tableHeader: isHeader }));
  }
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function spacerParagraph(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 120 } });
}

/* ─── Directive renderers ───────────────────────────────────── */

function directiveToDocx(node: any, ctx: ExportContext): any[] {
  const name  = String(node.name || "");
  const attrs = node.attributes || {};

  switch (name) {
    case "cover-page":     return renderCoverPage(attrs, ctx);
    case "kpi":            return [renderKpi(attrs, ctx)];
    case "callout":        return [renderCallout(attrs, node.children || [], ctx), spacerParagraph()];
    case "quote":          return renderQuote(attrs, node.children || [], ctx);
    case "image":          return [renderImage(attrs, ctx)];
    case "chart":          return renderChart(attrs, node.children || [], ctx);
    case "data-table":     return renderDataTablePlaceholder(attrs, ctx);
    case "page-break":     return [new Paragraph({ children: [new PageBreak()] })];
    case "signature":      return renderSignature(attrs);
    case "footer-meta":    return [];  /* footers are document-level — skipped in v1 */
    default:               return [];
  }
}

function renderCoverPage(attrs: any, ctx: ExportContext): any[] {
  const out: any[] = [];
  /* Logo at top */
  if (ctx.brandLogo) {
    try {
      out.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({
          data: ctx.brandLogo,
          transformation: { width: 180, height: 60 },
        } as any)],
      }));
      out.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 400 } }));
    } catch { /* skip on logo error */ }
  }
  /* Title */
  if (attrs.title) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 200 },
      children: [new TextRun({ text: String(attrs.title), bold: true, size: 60, color: hexNoHash(ctx.brandColor), font: "Calibri" })],
    }));
  }
  /* Subtitle */
  if (attrs.subtitle) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
      children: [new TextRun({ text: String(attrs.subtitle), size: 28, color: "555555", font: "Calibri" })],
    }));
  }
  /* Meta block (recipient, author, date) — as a 3-column table at bottom */
  const metaCells: TableCell[] = [];
  const metaSpec = [
    { label: "Prepared for", value: attrs.recipient },
    { label: "Prepared by",  value: attrs.author    },
    { label: "Date",         value: attrs.date      },
  ].filter((m) => m.value);

  if (metaSpec.length > 0) {
    out.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 1600 } }));
    for (const m of metaSpec) {
      metaCells.push(new TableCell({
        width: { size: 100 / metaSpec.length, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
        children: [
          new Paragraph({ children: [new TextRun({ text: m.label.toUpperCase(), bold: true, color: "888888", size: 16, font: "Calibri" })] }),
          new Paragraph({ children: [new TextRun({ text: String(m.value), bold: true, size: 22, font: "Calibri" })] }),
        ],
      }));
    }
    out.push(new Table({ rows: [new TableRow({ children: metaCells })], width: { size: 100, type: WidthType.PERCENTAGE } }));
  }
  /* Page break to start the body on a fresh page */
  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

function renderKpi(attrs: any, ctx: ExportContext): Paragraph {
  const value = attrs.value != null ? String(attrs.value) : (attrs.from ? `[${attrs.from}]` : "—");
  const label = attrs.label ? String(attrs.label) : "";
  const trend = attrs.trend ? String(attrs.trend) : "";
  const runs: TextRun[] = [];
  runs.push(new TextRun({ text: label ? `${label}: ` : "", bold: true, color: "666666", size: 18, font: "Calibri" }));
  runs.push(new TextRun({ text: value, bold: true, size: 32, color: hexNoHash(ctx.brandColor), font: "Calibri" }));
  if (trend) runs.push(new TextRun({ text: ` (${trend})`, size: 20, color: "666666", font: "Calibri" }));
  return new Paragraph({ children: runs, spacing: { before: 80, after: 80 } });
}

function renderCallout(attrs: any, children: any[], ctx: ExportContext): Table {
  const tone = String(attrs.tone || "info");
  const colorMap: Record<string, { fill: string; border: string; label: string }> = {
    info:     { fill: "EBF5FF", border: "3B82F6", label: "3B82F6" },
    success:  { fill: "ECFDF5", border: "22C55E", label: "22C55E" },
    warning:  { fill: "FFFBEB", border: "F59E0B", label: "F59E0B" },
    critical: { fill: "FEF2F2", border: "EF4444", label: "EF4444" },
    neutral:  { fill: "F5F3FF", border: hexNoHash(ctx.brandColor), label: hexNoHash(ctx.brandColor) },
  };
  const cfg = colorMap[tone] || colorMap.info;

  const bodyParagraphs: Paragraph[] = [];
  if (attrs.title) {
    bodyParagraphs.push(new Paragraph({
      children: [new TextRun({ text: String(attrs.title).toUpperCase(), bold: true, color: cfg.label, size: 18, font: "Calibri" })],
    }));
  }
  for (const child of children) {
    if (child.type === "paragraph") {
      bodyParagraphs.push(new Paragraph({ children: inlineRuns(child.children || []) }));
    }
  }

  return new Table({
    rows: [new TableRow({
      children: [new TableCell({
        width:   { size: 100, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: cfg.fill },
        borders: {
          left:   { style: BorderStyle.SINGLE, size: 16, color: cfg.border },
          top:    { style: BorderStyle.SINGLE, size: 4,  color: cfg.border },
          right:  { style: BorderStyle.SINGLE, size: 4,  color: cfg.border },
          bottom: { style: BorderStyle.SINGLE, size: 4,  color: cfg.border },
        },
        children: bodyParagraphs.length > 0 ? bodyParagraphs : [new Paragraph({ children: [new TextRun({ text: "" })] })],
      })],
    })],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function renderQuote(attrs: any, children: any[], _ctx: ExportContext): Paragraph[] {
  const quoteParagraphs: Paragraph[] = [];
  for (const child of children) {
    if (child.type === "paragraph") {
      quoteParagraphs.push(new Paragraph({
        indent: { left: 480 },
        spacing: { before: 200, after: 80 },
        children: inlineRuns(child.children || [], { italics: true, size: 24 }),
      }));
    }
  }
  /* Attribution */
  const attribution = [attrs.author, attrs.role, attrs.source].filter(Boolean).join(", ");
  if (attribution) {
    quoteParagraphs.push(new Paragraph({
      indent: { left: 480 },
      spacing: { after: 200 },
      children: [new TextRun({ text: `— ${attribution}`, color: "666666", size: 20, font: "Calibri" })],
    }));
  }
  return quoteParagraphs;
}

function renderImage(attrs: any, ctx: ExportContext): Paragraph {
  const src = String(attrs.src || "");
  let buf: Buffer | null = null;
  let meta = { width: 0, height: 0, alt: String(attrs.alt || ""), caption: String(attrs.caption || "") };

  if (src.startsWith("document://")) {
    const id = src.replace("document://", "");
    buf = ctx.attachmentBuffers[id] || null;
    const am = ctx.attachmentMeta[id];
    if (am) {
      meta = {
        width:   am.width  || 0,
        height:  am.height || 0,
        alt:     meta.alt     || am.alt     || "",
        caption: meta.caption || am.caption || "",
      };
    }
  } else if (src === "brand:logo" || src === "brand:logo_url") {
    buf = ctx.brandLogo;
  }

  if (!buf) {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `[Image: ${meta.alt || src || "missing"}]`, italics: true, color: "999999" })],
    });
  }

  /* Scale to fit 500px width max */
  let w = meta.width  || 500;
  let h = meta.height || Math.round(w * 0.6);
  if (w > 500) {
    const scale = 500 / w;
    w = 500;
    h = Math.round(h * scale);
  }

  const runs: any[] = [];
  try {
    runs.push(new ImageRun({ data: buf, transformation: { width: w, height: h } } as any));
  } catch {
    runs.push(new TextRun({ text: `[Image could not be embedded]`, italics: true, color: "999999" }));
  }
  if (meta.caption) {
    runs.push(new TextRun({ text: "", break: 1 }));
    runs.push(new TextRun({ text: meta.caption, italics: true, size: 18, color: "666666" }));
  }

  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 }, children: runs });
}

function renderChart(attrs: any, children: any[], ctx: ExportContext): any[] {
  /* DOCX has limited native chart support and rendering recharts SVG
     server-side is heavy. v1 approach: emit a titled section that
     shows the chart's underlying data as a real Word table so the
     reader gets the information without losing fidelity. */
  const title = attrs.title ? String(attrs.title) : `${String(attrs.type || "chart")} chart`;
  const out: any[] = [];

  out.push(new Paragraph({
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: title, bold: true, color: hexNoHash(ctx.brandColor), size: 24, font: "Calibri" })],
  }));

  /* Extract data from the first code block inside the directive children */
  let data: any[] | null = null;
  for (const c of children) {
    if (c.type === "code" && typeof c.value === "string") {
      try { const parsed = JSON.parse(c.value); if (Array.isArray(parsed)) data = parsed; } catch {}
      break;
    }
  }
  /* Inline data via attrs.data */
  if (!data && typeof attrs.data === "string") {
    try { const parsed = JSON.parse(attrs.data); if (Array.isArray(parsed)) data = parsed; } catch {}
  }

  if (data && data.length > 0) {
    const columns = Object.keys(data[0]);
    const headerRow = new TableRow({
      tableHeader: true,
      children: columns.map((c) => new TableCell({
        width:   { size: 100 / columns.length, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: hexNoHash(ctx.brandColor) + "15" },
        children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, color: hexNoHash(ctx.brandColor), size: 18, font: "Calibri" })] })],
      })),
    });
    const dataRows = data.slice(0, 50).map((row) => new TableRow({
      children: columns.map((c) => new TableCell({
        width: { size: 100 / columns.length, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: formatCell(row[c]), size: 18 })] })],
      })),
    }));
    out.push(new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE } }));
  } else if (attrs.from) {
    out.push(new Paragraph({
      children: [new TextRun({ text: `[Live data from: ${String(attrs.from)}] — see the web viewer for the rendered chart.`, italics: true, color: "888888", size: 18 })],
    }));
  } else {
    out.push(new Paragraph({
      children: [new TextRun({ text: `[Chart data unavailable in export]`, italics: true, color: "888888", size: 18 })],
    }));
  }

  out.push(spacerParagraph());
  return out;
}

function renderDataTablePlaceholder(attrs: any, _ctx: ExportContext): any[] {
  /* Server-side resolution of `from=` for data-table would require
     replicating the resolver — for v1 we emit a labelled placeholder.
     Future: call bsResolveDataReferences from here and inline the rows. */
  return [
    new Paragraph({
      spacing: { before: 200 },
      children: [new TextRun({
        text: `[Data table: ${attrs.title || attrs.from || "live data"}] — see the web viewer for the rendered table.`,
        italics: true, color: "888888", size: 18,
      })],
    }),
    spacerParagraph(),
  ];
}

function renderSignature(attrs: any): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 400 } }));
  out.push(new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 4 } },
    children: [new TextRun({ text: String(attrs.name || ""), bold: true, size: 22, font: "Calibri" })],
  }));
  if (attrs.title) {
    out.push(new Paragraph({ children: [new TextRun({ text: String(attrs.title), size: 18, color: "666666", font: "Calibri" })] }));
  }
  if (attrs.date) {
    out.push(new Paragraph({ children: [new TextRun({ text: String(attrs.date), size: 18, color: "666666", italics: true, font: "Calibri" })] }));
  }
  return out;
}

/* ─── Utilities ─────────────────────────────────────────────── */

function hexNoHash(c: string): string {
  return String(c || "").replace(/^#/, "").toUpperCase().slice(0, 6).padEnd(6, "0");
}

function formatCell(v: any): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "boolean") return v ? "✓" : "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
