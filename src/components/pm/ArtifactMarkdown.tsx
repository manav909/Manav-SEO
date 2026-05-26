/* ════════════════════════════════════════════════════════════════════════════
   src/components/pm/ArtifactMarkdown.tsx — Phase D4.1 (2026-05-25)

   Shared markdown renderer for artifact bodies. Used by Documents.tsx
   (detail pane) and CampaignDocumentsSection.tsx (inline expand).

   Why a dedicated component:
     The first D3/D4 implementations used `<article className="prose prose-sm
     dark:prose-invert">` and ReactMarkdown without component overrides, but
     the `@tailwindcss/typography` plugin wasn't enabled in tailwind.config.ts
     so `prose-*` classes did nothing — markdown rendered as unstyled raw text.

     Phase D4.1 enables the plugin AND ships this component with explicit
     element overrides so rendering is deterministic regardless of plugin
     theme. Mirrors the working DocumentViewer.tsx pattern (which has been
     in production since the brand-studio phase) but tuned for artifact
     reading rather than branded report viewing.
═════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  body:    string;
  /* Optional accent color for h1 underline + h2 + blockquote borders.
     Defaults to a neutral accent if not provided. */
  accent?: string;
  /* Controls base font size — 'sm' for inline expand contexts (drawer), 'md' for detail panes */
  size?:   'sm' | 'md';
}

export default function ArtifactMarkdown({ body, accent = '#a78bfa', size = 'md' }: Props) {
  const baseFontSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const headingScale = size === 'sm'
    ? { h1: 'text-lg', h2: 'text-base', h3: 'text-sm', h4: 'text-xs' }
    : { h1: 'text-2xl', h2: 'text-xl', h3: 'text-base', h4: 'text-sm' };

  return (
    <div className={`${baseFontSize} leading-relaxed text-foreground/90 overflow-hidden`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word', minWidth: 0 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className={`${headingScale.h1} font-bold mt-6 mb-3 pb-2 border-b text-foreground`} style={{ borderColor: `${accent}30` }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className={`${headingScale.h2} font-bold mt-5 mb-2`} style={{ color: accent }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className={`${headingScale.h3} font-bold mt-4 mb-1.5 text-foreground`}>{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className={`${headingScale.h4} font-bold mt-3 mb-1 text-foreground`}>{children}</h4>
          ),
          p: ({ children }) => (
            <p className="leading-relaxed mb-3 text-foreground/90" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="my-3 ml-5 space-y-1 list-disc marker:text-muted-foreground text-foreground/90">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 ml-5 space-y-1 list-decimal marker:text-muted-foreground text-foreground/90">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="pl-1 leading-relaxed">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className="my-3 pl-4 py-1 border-l-4 italic text-foreground/80"
              style={{ borderColor: accent }}
            >
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-6 border-border/40" />,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:no-underline"
              style={{ color: accent }}
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/90">{children}</em>
          ),
          /* Tables — common in audit reports + competitor snapshots */
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ backgroundColor: `${accent}10` }}>{children}</thead>
          ),
          th: ({ children }) => (
            <th
              className="text-left text-[10px] font-bold uppercase tracking-wider px-3 py-2 border-b border-border"
              style={{ color: accent }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-border/40 align-top text-foreground/90">
              {children}
            </td>
          ),
          /* Inline + block code */
          code: ({ children, ...props }) => {
            const isBlock = (props as any).className?.includes('language-');
            if (isBlock) {
              return (
                <pre className="my-3 rounded-lg border border-border bg-muted/40 p-3 overflow-x-auto text-xs font-mono">
                  <code>{children}</code>
                </pre>
              );
            }
            return (
              <code className="px-1.5 py-0.5 rounded bg-muted/40 text-xs font-mono">{children}</code>
            );
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {body || '_No content_'}
      </ReactMarkdown>
    </div>
  );
}
