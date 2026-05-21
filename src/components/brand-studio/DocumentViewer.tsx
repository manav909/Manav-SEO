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

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import { Printer, Download, Copy, CheckCircle2, FileText, ExternalLink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { remarkDirectiveRender } from './document-directives';
import DirectiveDispatcher from './DirectiveRenderer';
import DocumentPrintBody from './DocumentPrintBody';

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
  const [isPrinting, setIsPrinting] = useState(false);

  /* When isPrinting flips on, render the portal then trigger window.print().
     Listen for afterprint to clean up. */
  useEffect(() => {
    if (!isPrinting) return;
    /* Wait one frame for the portal to be in the DOM */
    const raf = requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
      }, 80);
    });
    const onAfter = () => setIsPrinting(false);
    window.addEventListener('afterprint', onAfter);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('afterprint', onAfter);
    };
  }, [isPrinting]);

  const handlePrint = () => setIsPrinting(true);

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

      {/* The rendered document — on-screen view only.
          (Printing renders through the portal at body root — see below.) */}
      <div ref={printRef} className="ds-document">
        {/* Screen header (compact metadata) */}
        <div className="mb-4 pb-3 border-b border-border">
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
      </div>

      {/* Portal-based print: when isPrinting is on, render a clean
          copy of the document at body root with explicit light theme.
          The print stylesheet hides everything else in print media. */}
      {isPrinting && createPortal(
        <div className="ds-print-portal">
          <DocumentPrintBody
            content={content}
            documentName={documentName}
            meta={meta}
            brandColor={accent}
            summary={summary}
            keyFindings={keyFindings}
            dataContext={dataContext}
          />
        </div>,
        document.body
      )}

      {/* Print stylesheet — portal-based. The .ds-print-portal element
          is rendered at body root with isolated light-theme CSS variables.
          In print media we hide everything except the portal. */}
      <style>{`
        /* Hide the portal on screen — it's only for print */
        .ds-print-portal {
          display: none;
        }

        @media print {
          /* ── 1. Hide every sibling of the print portal at body level ── */
          body > *:not(.ds-print-portal) {
            display: none !important;
          }

          /* ── 2. Reset html/body chrome ───────────────────────────── */
          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* ── 3. Make the portal the page. Force light-theme CSS
                  variables locally so any directive component that
                  uses bg-card / bg-background / etc. renders white.
                  These variable values match the project's light
                  theme block in src/index.css. */
          .ds-print-portal {
            display: block !important;
            position: static !important;
            background: white !important;
            color: black !important;
            font-family: Georgia, 'Times New Roman', serif !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            /* Light-theme variable overrides — apply only inside portal */
            --background:        0 0% 100%;
            --foreground:        240 13% 8%;
            --card:              0 0% 100%;
            --card-foreground:   240 13% 8%;
            --muted:             0 0% 95%;
            --muted-foreground:  240 5% 35%;
            --border:            0 0% 85%;
            --primary:           234 89% 50%;
            --primary-foreground:0 0% 100%;
          }
          .ds-print-portal * {
            background-image: none !important;
            box-shadow: none !important;
            text-shadow: none !important;
          }

          /* ── 4. Print body typography ───────────────────────────── */
          .ds-print-portal-content {
            padding: 0 !important;
            max-width: none !important;
          }
          .ds-print-header {
            padding-bottom: 12px;
            margin-bottom: 24px;
            border-bottom: 2px solid #333;
            page-break-after: avoid;
          }
          .ds-print-title {
            font-size: 22pt !important;
            font-weight: 700;
            font-family: 'Helvetica Neue', Arial, sans-serif !important;
            color: black !important;
            margin: 0 !important;
            line-height: 1.2;
          }
          .ds-print-meta {
            font-size: 10pt;
            color: #666 !important;
            margin-top: 4px;
            font-family: 'Helvetica Neue', Arial, sans-serif !important;
          }

          .ds-print-summary {
            border: 1px solid #ccc;
            background: #fafafa !important;
            padding: 12px;
            margin-bottom: 20px;
            page-break-inside: avoid;
          }
          .ds-print-summary-label {
            font-size: 9pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #555 !important;
            margin-bottom: 6px;
          }
          .ds-print-summary-body {
            font-size: 11pt;
            font-style: italic;
            color: #222 !important;
            line-height: 1.5;
          }

          .ds-print-findings {
            margin-bottom: 20px;
            page-break-inside: avoid;
          }
          .ds-print-findings-label {
            font-size: 9pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #555 !important;
            margin-bottom: 6px;
            font-family: 'Helvetica Neue', Arial, sans-serif !important;
          }
          .ds-print-findings ul {
            padding-left: 18px;
            margin: 0;
          }
          .ds-print-findings li {
            font-size: 11pt;
            color: #222 !important;
            line-height: 1.5;
            margin-bottom: 4px;
          }

          .ds-print-prose {
            font-size: 11pt;
            line-height: 1.6;
          }
          .ds-h1 {
            font-size: 18pt;
            font-weight: 700;
            font-family: 'Helvetica Neue', Arial, sans-serif !important;
            color: black !important;
            margin: 18pt 0 8pt;
            padding-bottom: 4pt;
            border-bottom: 1px solid;
            page-break-after: avoid;
          }
          .ds-h2 {
            font-size: 14pt;
            font-weight: 700;
            font-family: 'Helvetica Neue', Arial, sans-serif !important;
            margin: 14pt 0 6pt;
            page-break-after: avoid;
          }
          .ds-h3 {
            font-size: 12pt;
            font-weight: 700;
            font-family: 'Helvetica Neue', Arial, sans-serif !important;
            color: black !important;
            margin: 12pt 0 4pt;
            page-break-after: avoid;
          }
          .ds-h4 {
            font-size: 11pt;
            font-weight: 700;
            font-family: 'Helvetica Neue', Arial, sans-serif !important;
            color: black !important;
            margin: 10pt 0 4pt;
            page-break-after: avoid;
          }
          .ds-p {
            font-family: Georgia, 'Times New Roman', serif !important;
            font-size: 11pt;
            line-height: 1.6;
            margin: 0 0 8pt;
            color: black !important;
            orphans: 3;
            widows: 3;
          }
          .ds-ul, .ds-ol {
            margin: 6pt 0 8pt 18pt;
            padding: 0;
          }
          .ds-li {
            font-family: Georgia, 'Times New Roman', serif !important;
            font-size: 11pt;
            line-height: 1.6;
            color: black !important;
            margin-bottom: 3pt;
          }
          .ds-blockquote {
            margin: 8pt 0;
            padding: 4pt 0 4pt 12pt;
            border-left: 3px solid;
            font-style: italic;
            color: #444 !important;
            page-break-inside: avoid;
          }
          .ds-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10pt 0;
            font-size: 10pt;
            page-break-inside: avoid;
          }
          .ds-th {
            text-align: left;
            font-weight: 700;
            font-size: 9pt;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            padding: 6pt 8pt;
            border-bottom: 2px solid #333;
            font-family: 'Helvetica Neue', Arial, sans-serif !important;
          }
          .ds-td {
            padding: 5pt 8pt;
            border-bottom: 1px solid #ddd;
            font-family: Georgia, 'Times New Roman', serif !important;
            color: black !important;
            vertical-align: top;
          }
          .ds-hr {
            border: none;
            border-top: 1px solid #ccc !important;
            margin: 14pt 0;
            background: none !important;
            height: 0;
          }
          .ds-code {
            font-family: 'Courier New', monospace !important;
            font-size: 10pt;
            padding: 1pt 3pt;
            background: #f5f5f5 !important;
            border-radius: 2pt;
          }
          .ds-pre {
            font-family: 'Courier New', monospace !important;
            font-size: 9pt;
            background: #f5f5f5 !important;
            border: 1px solid #ddd;
            padding: 8pt;
            border-radius: 3pt;
            overflow: hidden;
            margin: 8pt 0;
            page-break-inside: avoid;
          }
          .ds-a {
            text-decoration: underline;
          }

          /* ── 5. Directive containers — keep chart/KPI/callout borders
                  but force white-friendly backgrounds. Charts keep their
                  SVG colors via print-color-adjust exact above. ──── */
          .ds-print-portal .ds-cover-page {
            background: white !important;
            border: 1px solid #ddd !important;
            page-break-after: always;
            min-height: 0 !important;
          }
          .ds-print-portal .ds-kpi,
          .ds-print-portal .ds-callout,
          .ds-print-portal .ds-quote,
          .ds-print-portal .ds-chart > div,
          .ds-print-portal .ds-image,
          .ds-print-portal .ds-data-table-placeholder,
          .ds-print-portal .ds-chart-placeholder {
            background: white !important;
            border: 1px solid #ccc !important;
            box-shadow: none !important;
            page-break-inside: avoid;
          }

          /* Page-break directive */
          .ds-print-portal .ds-page-break {
            page-break-after: always;
            height: 0;
            visibility: hidden;
          }

          /* ── 6. Recharts SVG color preservation ─────────────────── */
          .ds-print-portal .recharts-wrapper *,
          .ds-print-portal .ds-chart svg,
          .ds-print-portal .ds-chart svg * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
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
