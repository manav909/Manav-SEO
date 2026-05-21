/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/DocumentViewer.tsx
   Brand Studio — Polished document reader.

   Renders the generated / ingested markdown as a properly formatted
   document (headings, paragraphs, lists, tables, blockquotes, code).
   Includes:
   - Download as PDF (uses window.print() with a print stylesheet
     — the user picks "Save as PDF" in the dialog; works in every
     browser, no server round-trip, beautiful results)
   - Download as Markdown (.md file)
   - Copy to clipboard

   Used by both:
   - PM-side Library doc detail
   - Client-side workspace doc detail
═══════════════════════════════════════════════════════════════ */

import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import { Printer, Download, Copy, CheckCircle2, FileText, ExternalLink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { remarkDirectiveRender } from './document-directives';
import DirectiveDispatcher from './DirectiveRenderer';

interface Props {
  /** The markdown / text content of the document */
  content:        string;
  /** Document name used as the file title for downloads */
  documentName:   string;
  /** Optional metadata to render above the body */
  meta?: {
    docType?:        string;
    audienceRole?:   string;
    confidence?:     string;
    version?:        number;
    publishedAt?:    string;
    providedBy?:     string;
    sourceUrl?:      string;
  };
  /** Optional brand color for accents (defaults to platform purple) */
  brandColor?:    string;
  /** Optional summary + key findings (typically from extracted_data) */
  summary?:       string;
  keyFindings?:   string[];
  /** Optional data context for live directive references (Data Room fields, attachments).
   *  Phase 1A: types defined, populated by Phase 1B/1C/1D. */
  dataContext?: {
    fields?:      Record<string, any>;
    attachments?: Array<{ id: string; signedUrl: string; alt?: string; caption?: string }>;
  };
}

export default function DocumentViewer({
  content, documentName, meta, brandColor, summary, keyFindings, dataContext,
}: Props) {
  const accent = brandColor || '#8b5cf6';
  const printRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const handlePrint = () => {
    /* window.print() with our print stylesheet — user picks "Save as PDF" */
    window.print();
  };

  const handleDownloadMd = () => {
    const blob = new Blob([content || ''], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${documentName.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Downloaded', description: 'Markdown file saved.' });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      {/* Action bar — hidden when printing */}
      <div className="print:hidden flex items-center gap-2 flex-wrap">
        <button
          onClick={handlePrint}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white flex items-center gap-1.5"
          style={{ backgroundColor: accent }}
        >
          <Printer className="h-3 w-3" /> Download as PDF
        </button>
        <button
          onClick={handleDownloadMd}
          className="text-xs px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted/40 flex items-center gap-1.5"
        >
          <Download className="h-3 w-3" /> Download .md
        </button>
        <button
          onClick={handleCopy}
          className="text-xs px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted/40 flex items-center gap-1.5"
        >
          {copied ? <><CheckCircle2 className="h-3 w-3 text-green-400" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
        {meta?.sourceUrl && (
          <a
            href={meta.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          >
            <ExternalLink className="h-3 w-3" /> Original source
          </a>
        )}
      </div>

      {/* The rendered document — also the print target */}
      <div ref={printRef} className="ds-document">
        {/* Print header — only visible when printing */}
        <div className="ds-print-header hidden print:block">
          <div className="ds-print-title">{documentName}</div>
          {meta?.publishedAt && (
            <div className="ds-print-meta">
              {new Date(meta.publishedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
              {meta.version && meta.version > 1 ? ` · Version ${meta.version}` : ''}
            </div>
          )}
        </div>

        {/* Screen header (compact metadata) — hidden when printing */}
        <div className="print:hidden mb-4 pb-3 border-b border-border">
          <div className="text-base font-bold text-foreground">{documentName}</div>
          <div className="flex items-center gap-2 flex-wrap mt-1 text-[10px] text-muted-foreground">
            {meta?.docType && (
              <span className="font-mono px-1.5 py-0.5 rounded bg-muted">{meta.docType}</span>
            )}
            {meta?.audienceRole && <span>For: {meta.audienceRole}</span>}
            {meta?.confidence && (
              <span className={`font-semibold ${
                meta.confidence === 'high' ? 'text-green-400' :
                meta.confidence === 'medium' ? 'text-amber-400' :
                'text-orange-400'
              }`}>{meta.confidence} confidence</span>
            )}
            {meta?.version && meta.version > 1 && <span>v{meta.version}</span>}
            {meta?.publishedAt && <span>Shared {new Date(meta.publishedAt).toLocaleDateString('en-GB')}</span>}
            {meta?.providedBy && <span>Provided by {meta.providedBy}</span>}
          </div>
        </div>

        {/* Summary card */}
        {summary && (
          <div
            className="ds-summary rounded-xl border p-3 mb-4 print:mb-2 print:rounded-none"
            style={{
              borderColor:     `${accent}40`,
              backgroundColor: `${accent}08`,
            }}
          >
            <div className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: accent }}>
              Summary
            </div>
            <div className="text-sm text-foreground/90 italic">{summary}</div>
          </div>
        )}

        {/* Key findings list */}
        {keyFindings && keyFindings.length > 0 && (
          <div className="mb-4 print:mb-3">
            <div className="text-[10px] uppercase tracking-wider font-bold mb-1.5 text-muted-foreground">
              Key findings
            </div>
            <ul className="space-y-1">
              {keyFindings.map((f, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="mt-1 shrink-0" style={{ color: accent }}>●</span>
                  <span className="text-foreground/90">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* The actual document body — markdown rendered */}
        <article className="ds-prose">
          {content ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkDirective, remarkDirectiveRender]}
              components={{
                /* H1 styling — bigger and accent-colored */
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold mt-6 mb-3 pb-2 border-b" style={{ borderColor: `${accent}30` }}>
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-bold mt-5 mb-2" style={{ color: accent }}>
                    {children}
                  </h2>
                ),
                h3: ({ children }) => <h3 className="text-base font-bold mt-4 mb-1.5">{children}</h3>,
                h4: ({ children }) => <h4 className="text-sm font-bold mt-3 mb-1">{children}</h4>,
                p:  ({ children }) => <p className="text-sm leading-relaxed mb-3 text-foreground/90">{children}</p>,
                ul: ({ children }) => <ul className="my-3 ml-5 space-y-1 list-disc text-sm text-foreground/90 marker:text-muted-foreground">{children}</ul>,
                ol: ({ children }) => <ol className="my-3 ml-5 space-y-1 list-decimal text-sm text-foreground/90 marker:text-muted-foreground">{children}</ol>,
                li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
                blockquote: ({ children }) => (
                  <blockquote
                    className="my-3 pl-4 py-1 border-l-4 italic text-foreground/80"
                    style={{ borderColor: accent }}
                  >
                    {children}
                  </blockquote>
                ),
                table: ({ children }) => (
                  <div className="my-4 overflow-x-auto print:overflow-visible">
                    <table className="w-full text-sm border-collapse">{children}</table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead style={{ backgroundColor: `${accent}10` }}>{children}</thead>
                ),
                th: ({ children }) => (
                  <th className="text-left text-xs font-bold uppercase tracking-wider px-3 py-2 border-b border-border" style={{ color: accent }}>
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-3 py-2 border-b border-border/40 align-top text-foreground/90">{children}</td>
                ),
                code: ({ children, ...props }) => {
                  /* Inline vs block code — react-markdown 9 passes className for fenced */
                  const isBlock = (props as any).className?.includes('language-');
                  if (isBlock) {
                    return (
                      <pre className="my-3 rounded-lg border border-border bg-muted/40 p-3 overflow-x-auto text-xs font-mono">
                        <code>{children}</code>
                      </pre>
                    );
                  }
                  return (
                    <code className="px-1 py-0.5 rounded bg-muted/40 text-xs font-mono" style={{ color: accent }}>
                      {children}
                    </code>
                  );
                },
                hr: () => <hr className="my-5 border-border" />,
                a: ({ children, href }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    className="underline hover:no-underline" style={{ color: accent }}>
                    {children}
                  </a>
                ),
                strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
                em:     ({ children }) => <em className="italic">{children}</em>,
                /* Custom directive renderer — react-markdown 9 supports unknown tags
                   when passed in components map. The remarkDirectiveRender plugin
                   rewrites directive nodes to hName='ds-directive' + data-* attrs,
                   and stashes the first code-block body into data-raw-body. */
                'ds-directive': ({ node, children }: any) => {
                  const props      = node?.properties || {};
                  const name       = String(props.dataName  || 'unknown');
                  const attrsJSON  = String(props.dataAttrs || '{}');
                  const rawBody    = String(props.dataRawBody || '');
                  let attrs: any = {};
                  try { attrs = JSON.parse(attrsJSON); } catch {}
                  return (
                    <DirectiveDispatcher
                      name={name}
                      attrs={attrs}
                      body={children}
                      rawBody={rawBody}
                      brandColor={accent}
                      dataContext={dataContext}
                    />
                  );
                },
                /* Suppressed code blocks — chart data that's been extracted into
                   the directive's rawBody shouldn't double-render. */
                'ds-suppressed': () => null,
              } as any}
            >
              {content}
            </ReactMarkdown>
          ) : (
            <div className="text-sm text-muted-foreground italic flex items-center gap-2 py-6">
              <FileText className="h-4 w-4 text-muted-foreground/40" />
              No content available — this document may still be processing.
            </div>
          )}
        </article>

        {/* Print footer */}
        <div className="ds-print-footer hidden print:block">
          <div>{documentName}</div>
        </div>
      </div>

      {/* Print stylesheet — scoped to ds-document.
          Strategy: force light-theme CSS variables in print so every
          element using `bg-card` / `bg-background` / etc. renders white
          instead of dark navy. Then hide UI chrome and position the
          document to fill the page cleanly. */}
      <style>{`
        @media print {
          /* ── 1. Force light-theme CSS variables in print ─────────────
             This makes EVERY element using design-system tokens
             (bg-card, bg-background, text-foreground, border-border)
             render in light mode automatically. */
          :root,
          .dark,
          html,
          body {
            --background:        0 0% 100% !important;
            --foreground:        0 0% 8% !important;
            --card:              0 0% 100% !important;
            --card-foreground:   0 0% 8% !important;
            --muted:             0 0% 95% !important;
            --muted-foreground:  0 0% 35% !important;
            --border:            0 0% 85% !important;
            --primary:           240 13% 8% !important;
            --primary-foreground:0 0% 100% !important;
          }

          /* ── 2. Hard reset all backgrounds + text to print-safe ──── */
          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            min-height: 0 !important;
          }

          /* ── 3. Allow background graphics that matter (charts,
                  callouts, KPI tiles) to keep their color while
                  forcing chrome backgrounds to white. We target
                  the modal/backdrop classes explicitly. */
          .fixed.inset-0,
          [class*="bg-black/"],
          [class*="bg-card"]:not(.ds-kpi):not(.ds-callout):not(.ds-quote):not(.ds-chart),
          [class*="backdrop-blur"] {
            background: white !important;
            background-color: white !important;
            background-image: none !important;
            backdrop-filter: none !important;
            box-shadow: none !important;
            border: none !important;
          }

          /* ── 4. Hide all UI chrome — show only ds-document ──────── */
          body * { visibility: hidden; }
          .ds-document, .ds-document * { visibility: visible; }

          /* ── 5. Position ds-document to fill the page ───────────── */
          .ds-document {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            right: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 24px 32px 48px 32px !important;
            background: white !important;
            color: black !important;
            font-family: Georgia, 'Times New Roman', serif !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* ── 6. Ensure document descendants use clean print colors,
                  but PRESERVE chart colors, callout tints, and brand
                  accents (those use inline styles with !important
                  bypasses or distinct ds-* classes). ───────────────── */
          .ds-document p,
          .ds-document li,
          .ds-document h1,
          .ds-document h2,
          .ds-document h3,
          .ds-document h4,
          .ds-document h5,
          .ds-document h6,
          .ds-document td,
          .ds-document th,
          .ds-document figcaption,
          .ds-document .ds-prose * {
            color: black !important;
          }

          /* Headings use sans-serif, body uses serif */
          .ds-document .ds-prose h1,
          .ds-document .ds-prose h2,
          .ds-document .ds-prose h3,
          .ds-document .ds-prose h4 {
            page-break-after: avoid;
            font-family: 'Helvetica Neue', Arial, sans-serif !important;
          }
          .ds-document .ds-prose p,
          .ds-document .ds-prose li {
            font-family: Georgia, 'Times New Roman', serif !important;
            line-height: 1.6 !important;
            orphans: 3;
            widows: 3;
          }
          .ds-document .ds-prose table {
            page-break-inside: avoid;
          }
          .ds-document .ds-prose blockquote {
            border-left: 3px solid #999 !important;
            font-style: italic !important;
          }

          /* ── 7. Preserve chart SVG colors — Recharts uses inline
                  fill/stroke which would otherwise be wiped by the
                  blanket overrides above. ──────────────────────────── */
          .ds-chart svg,
          .ds-chart svg *,
          .recharts-wrapper * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── 8. Preserve KPI tile, callout, and quote backgrounds
                  by re-enabling backgrounds via inline-style passthrough.
                  These directives use inline style attributes; we
                  re-allow background on the directive containers. */
          .ds-kpi,
          .ds-callout,
          .ds-quote,
          .ds-chart > div {
            background: white !important;
            border: 1px solid #ccc !important;
          }

          /* ── 9. Print header + footer ───────────────────────────── */
          .ds-print-header {
            border-bottom: 2px solid #333 !important;
            padding-bottom: 12px;
            margin-bottom: 24px;
          }
          .ds-print-title {
            font-size: 22pt !important;
            font-weight: bold;
            font-family: 'Helvetica Neue', Arial, sans-serif !important;
            color: black !important;
          }
          .ds-print-meta {
            font-size: 10pt !important;
            color: #666 !important;
            margin-top: 4px;
          }
          .ds-summary {
            border: 1px solid #ccc !important;
            background: #f8f8f8 !important;
            padding: 12px !important;
          }
          .ds-print-footer {
            position: fixed;
            bottom: 12mm;
            left: 32px;
            right: 32px;
            font-size: 8pt !important;
            color: #999 !important;
            border-top: 1px solid #ccc !important;
            padding-top: 6px;
            font-family: 'Helvetica Neue', Arial, sans-serif !important;
          }

          /* ── 10. Cover page — light-theme accent only ──────────── */
          .ds-cover-page {
            background: white !important;
            border: 1px solid #ddd !important;
          }

          @page {
            margin: 18mm;
            size: A4;
          }
        }
      `}</style>
    </div>
  );
}
