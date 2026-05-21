/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/DocumentPrintBody.tsx
   Brand Studio — Print-only document body.

   Extracted from DocumentViewer so the print portal can render the
   same markdown + directive content in a clean DOM tree at document.body
   level, completely outside the modal hierarchy and dark-theme provider
   chain.

   The portal carries explicit light-theme CSS variables so every
   element styled with bg-card, bg-background, etc. renders white,
   regardless of the app's global dark theme.
═══════════════════════════════════════════════════════════════ */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import { remarkDirectiveRender } from './document-directives';
import DirectiveDispatcher from './DirectiveRenderer';

interface Props {
  content:      string;
  documentName: string;
  meta?: {
    docType?:     string;
    audienceRole?:string;
    confidence?:  string;
    version?:     number;
    publishedAt?: string;
    providedBy?:  string;
    sourceUrl?:   string;
  };
  brandColor:   string;
  summary?:     string;
  keyFindings?: string[];
  dataContext?: {
    fields?:         Record<string, any>;
    attachments?:    Array<{ id: string; signedUrl: string; alt?: string; caption?: string }>;
    dataReferences?: Record<string, any>;
  };
}

export default function DocumentPrintBody({
  content, documentName, meta, brandColor, summary, keyFindings, dataContext,
}: Props) {
  /* The whole tree is scoped under .ds-print-portal which carries
     light-theme CSS vars (set in the print stylesheet) and explicit
     white background + black foreground. */
  return (
    <div className="ds-print-portal-content">
      {/* Print header */}
      <header className="ds-print-header">
        <h1 className="ds-print-title">{documentName}</h1>
        {meta?.publishedAt && (
          <div className="ds-print-meta">
            {new Date(meta.publishedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
            {meta.version && meta.version > 1 ? ` · Version ${meta.version}` : ''}
            {meta.providedBy ? ` · Provided by ${meta.providedBy}` : ''}
          </div>
        )}
      </header>

      {/* Summary card */}
      {summary && (
        <section className="ds-print-summary">
          <div className="ds-print-summary-label">Summary</div>
          <div className="ds-print-summary-body">{summary}</div>
        </section>
      )}

      {/* Key findings */}
      {keyFindings && keyFindings.length > 0 && (
        <section className="ds-print-findings">
          <div className="ds-print-findings-label">Key findings</div>
          <ul>
            {keyFindings.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </section>
      )}

      {/* Document body — same markdown + directive pipeline */}
      <article className="ds-print-prose">
        {content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkDirective, remarkDirectiveRender]}
            components={{
              h1: ({ children }) => <h1 className="ds-h1" style={{ borderColor: `${brandColor}50` }}>{children}</h1>,
              h2: ({ children }) => <h2 className="ds-h2" style={{ color: brandColor }}>{children}</h2>,
              h3: ({ children }) => <h3 className="ds-h3">{children}</h3>,
              h4: ({ children }) => <h4 className="ds-h4">{children}</h4>,
              p:  ({ children }) => <p className="ds-p">{children}</p>,
              ul: ({ children }) => <ul className="ds-ul">{children}</ul>,
              ol: ({ children }) => <ol className="ds-ol">{children}</ol>,
              li: ({ children }) => <li className="ds-li">{children}</li>,
              blockquote: ({ children }) => (
                <blockquote className="ds-blockquote" style={{ borderColor: brandColor }}>{children}</blockquote>
              ),
              table: ({ children }) => (
                <table className="ds-table">{children}</table>
              ),
              thead: ({ children }) => (
                <thead style={{ backgroundColor: `${brandColor}15` }}>{children}</thead>
              ),
              th: ({ children }) => (
                <th className="ds-th" style={{ color: brandColor }}>{children}</th>
              ),
              td: ({ children }) => <td className="ds-td">{children}</td>,
              code: ({ children, ...props }) => {
                const isBlock = (props as any).className?.includes('language-');
                if (isBlock) {
                  return <pre className="ds-pre"><code>{children}</code></pre>;
                }
                return <code className="ds-code" style={{ color: brandColor }}>{children}</code>;
              },
              hr: () => <hr className="ds-hr" />,
              a: ({ children, href }) => (
                <a href={href} style={{ color: brandColor }} className="ds-a">{children}</a>
              ),
              strong: ({ children }) => <strong>{children}</strong>,
              em:     ({ children }) => <em>{children}</em>,
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
                    brandColor={brandColor}
                    dataContext={dataContext}
                  />
                );
              },
              'ds-suppressed': () => null,
            } as any}
          >
            {content}
          </ReactMarkdown>
        ) : (
          <p className="ds-p" style={{ fontStyle: 'italic', color: '#999' }}>
            No content available.
          </p>
        )}
      </article>
    </div>
  );
}
