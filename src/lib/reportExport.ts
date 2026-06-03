/* ════════════════════════════════════════════════════════════════
   src/lib/reportExport.ts

   Stakeholder-ready document export for the Workspace. Converts a markdown
   report into a self-contained, branded HTML file with a cover page and
   polished print stylesheet — opens cleanly in any browser, prints to PDF
   beautifully via the browser's File → Print → Save as PDF.

   Used by all three document types: step evidence, panel discussion,
   pillar solution.
═══════════════════════════════════════════════════════════════ */

interface ReportMeta {
  title: string;          // e.g. "GSC Visibility & Indexation"
  kind: string;           // "Deep Step Evidence" / "Panel Discussion" / "Pillar Solution"
  project?: string;       // project name if known
  goal?: string;          // composed run goal
  generatedAt?: string;   // ISO date string
}

/* ─── Tiny, dependency-free Markdown → HTML converter ────────────
   Handles the subset our reports actually use: headings, paragraphs,
   bold/italic, inline code, lists, tables, blockquotes, horizontal rules.
   Tables are first-class because every step report uses them. */
export function mdToHtml(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\b_([^_]+)_\b/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // table — starts with | and the next line is the separator
    if (/^\|.*\|/.test(line) && i + 1 < lines.length && /^\|[\s\-:|]+\|/.test(lines[i + 1])) {
      const header = line.split('|').slice(1, -1).map(c => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map(c => c.trim()));
        i++;
      }
      out.push('<table><thead><tr>' + header.map(h => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>');
      for (const r of rows) out.push('<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>');
      out.push('</tbody></table>');
      continue;
    }
    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    // horizontal rule
    if (/^---+$/.test(line.trim())) { out.push('<hr/>'); i++; continue; }
    // blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }
    // unordered list
    if (/^[-*]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^[-*]\s+/, '')); i++; }
      out.push('<ul>' + buf.map(b => `<li>${inline(b)}</li>`).join('') + '</ul>');
      continue;
    }
    // ordered list
    if (/^\d+\.\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
      out.push('<ol>' + buf.map(b => `<li>${inline(b)}</li>`).join('') + '</ol>');
      continue;
    }
    // blank line — paragraph break
    if (!line.trim()) { i++; continue; }
    // paragraph (consume contiguous non-special lines)
    const buf: string[] = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^#{1,6}\s/.test(lines[i]) && !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) && !/^---+$/.test(lines[i].trim()) && !/^\|.*\|/.test(lines[i])
    ) { buf.push(lines[i]); i++; }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

/* ─── Build the full branded HTML document ─────────────────────── */
export function buildStakeholderHtml(markdown: string, meta: ReportMeta): string {
  const now = meta.generatedAt ? new Date(meta.generatedAt) : new Date();
  const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const body = mdToHtml(markdown || '');
  const title = (meta.title || 'Report').replace(/&/g, '&amp;').replace(/</g, '&lt;');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title} — SEO Season</title>
<style>
  :root {
    --ink: #1a1d2a;
    --ink-soft: #555a6e;
    --line: #e3e6ee;
    --accent: #0e7c8a;
    --accent-soft: #e8f4f6;
    --warn: #b75d18;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: var(--ink);
    line-height: 1.55;
    font-size: 13.5px;
    background: #f5f6fa;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    max-width: 820px;
    margin: 28px auto;
    background: #fff;
    padding: 56px 60px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06);
  }
  /* — Cover page — */
  .cover {
    padding: 80px 60px 60px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 0;
  }
  .cover .brand {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 28px;
  }
  .cover .kind {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-soft);
    margin-bottom: 14px;
  }
  .cover h1.title {
    font-size: 34px;
    font-weight: 700;
    line-height: 1.2;
    margin: 0 0 12px;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .cover .meta-grid {
    margin-top: 44px;
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 8px 24px;
    font-size: 12.5px;
  }
  .cover .meta-grid dt {
    color: var(--ink-soft);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 10.5px;
    align-self: center;
  }
  .cover .meta-grid dd { margin: 0; color: var(--ink); font-weight: 500; }
  .cover .prepared {
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid var(--line);
    font-size: 11.5px;
    color: var(--ink-soft);
  }
  .cover .prepared strong { color: var(--ink); font-weight: 700; }
  /* — Body — */
  .content { padding: 48px 0 0; }
  .content h1 {
    font-size: 22px;
    font-weight: 700;
    margin: 36px 0 14px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--accent);
    color: var(--ink);
  }
  .content h1:first-child { margin-top: 0; }
  .content h2 { font-size: 16.5px; font-weight: 700; margin: 28px 0 10px; color: var(--ink); }
  .content h3 { font-size: 14px; font-weight: 700; margin: 22px 0 8px; color: var(--accent); }
  .content p { margin: 8px 0 12px; }
  .content ul, .content ol { padding-left: 22px; margin: 8px 0 14px; }
  .content li { margin: 4px 0; }
  .content blockquote {
    margin: 14px 0;
    padding: 12px 18px;
    border-left: 3px solid var(--accent);
    background: var(--accent-soft);
    color: var(--ink);
    font-style: italic;
    font-size: 13.5px;
  }
  .content hr { border: 0; border-top: 1px solid var(--line); margin: 24px 0; }
  .content code {
    background: #f1f3f7;
    padding: 1px 6px;
    border-radius: 3px;
    font-family: 'SF Mono', 'Menlo', Consolas, monospace;
    font-size: 12px;
  }
  .content a { color: var(--accent); text-decoration: none; border-bottom: 1px dotted var(--accent); }
  /* — Tables (critical: every report has them) — */
  .content table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0 20px;
    font-size: 12px;
    background: #fff;
  }
  .content thead th {
    background: #f7f8fb;
    text-align: left;
    padding: 8px 10px;
    font-weight: 700;
    color: var(--ink);
    border-bottom: 2px solid var(--accent);
    font-size: 11px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .content tbody td {
    padding: 7px 10px;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  .content tbody tr:nth-child(even) td { background: #fafbfd; }
  /* — Footer printed on every page — */
  .doc-footer {
    margin-top: 48px;
    padding-top: 18px;
    border-top: 1px solid var(--line);
    font-size: 10.5px;
    color: var(--ink-soft);
    display: flex;
    justify-content: space-between;
  }
  /* — Print stylesheet: clean PDF output — */
  @page { size: A4; margin: 20mm 18mm; }
  @media print {
    body { background: #fff; font-size: 11.5px; }
    .page { box-shadow: none; margin: 0; padding: 0; max-width: 100%; }
    .cover { padding: 0 0 36px; page-break-after: always; }
    .content { padding-top: 0; }
    .content h1 { page-break-after: avoid; }
    .content table, .content blockquote, .content ul, .content ol { page-break-inside: avoid; }
    .no-print { display: none !important; }
  }
  /* — Action bar (screen only) — */
  .actions {
    position: sticky;
    top: 0;
    background: rgba(245,246,250,0.94);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line);
    padding: 12px 60px;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    z-index: 10;
  }
  .actions button {
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 6px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: #fff;
    cursor: pointer;
  }
  .actions button.ghost { background: #fff; color: var(--accent); }
</style>
</head>
<body>
  <div class="actions no-print">
    <button class="ghost" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="page">
    <section class="cover">
      <div class="brand">SEO Season · Quantum Intelligence</div>
      <div class="kind">${escapeAttr(meta.kind || 'Report')}</div>
      <h1 class="title">${title}</h1>
      <dl class="meta-grid">
        ${meta.project ? `<dt>Project</dt><dd>${escapeAttr(meta.project)}</dd>` : ''}
        ${meta.goal ? `<dt>Run goal</dt><dd>${escapeAttr(meta.goal)}</dd>` : ''}
        <dt>Generated</dt><dd>${dateStr}</dd>
      </dl>
      <div class="prepared">Prepared by <strong>Manav</strong></div>
    </section>
    <section class="content">
      ${body}
    </section>
    <div class="doc-footer">
      <span>SEO Season by Manav</span>
      <span>${dateStr}</span>
    </div>
  </div>
</body>
</html>`;
}

function escapeAttr(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ─── Download a stakeholder-ready HTML file ───────────────────── */
export function downloadStakeholderReport(markdown: string, meta: ReportMeta) {
  const html = buildStakeholderHtml(markdown, meta);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = (meta.title || 'report').toLowerCase().replace(/[^a-z0-9-_]/gi, '-').replace(/-+/g, '-').slice(0, 80);
  a.href = url;
  a.download = `${safe}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Download as Word document (.doc) ─────────────────────────────
   Serves the same self-contained HTML with Word-compatible MIME + .doc
   extension. Word, Pages, Google Docs, and LibreOffice all open this
   cleanly and render the headings, tables, lists, bold/italic, and
   blockquotes correctly. This is what every "Export to Word" feature
   on the web actually does — true .docx requires a heavyweight binary
   library which is overkill for what the operator needs.
   The .doc files can be saved as .docx from inside Word with one click. */
export function downloadStakeholderAsWord(markdown: string, meta: ReportMeta) {
  const html = buildStakeholderHtml(markdown, meta);
  // Word respects a special HTML preamble that tags the file as a Word document.
  // The xmlns:w gives Word a hint to use Word rendering pipeline rather than IE.
  const wordWrapped = html.replace(
    '<html',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"'
  );
  const blob = new Blob(['\ufeff', wordWrapped], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = (meta.title || 'report').toLowerCase().replace(/[^a-z0-9-_]/gi, '-').replace(/-+/g, '-').slice(0, 80);
  a.href = url;
  a.download = `${safe}.doc`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Open in a new tab (read mode — for stakeholder share-link flow) ── */
export function openStakeholderReport(markdown: string, meta: ReportMeta) {
  const html = buildStakeholderHtml(markdown, meta);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  // We deliberately do NOT revoke the URL — the new tab needs it to live.
  // The browser will release the blob when that tab closes.
}
