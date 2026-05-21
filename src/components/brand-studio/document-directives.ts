/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/document-directives.ts
   Brand Studio — Document directive system.

   Defines the directive DSL embedded in document raw_content for rich
   data visualization. Used by:
   - DocumentViewer.tsx (web rendering)
   - DocumentExporter.ts (DOCX export — Phase 1F)
   - Generator templates (Phase 1E — emit these directives)

   Directive syntax (via remark-directive):
   - Container (block):  :::name{key=val key2=val2}\ncontent\n:::
   - Leaf (block):       ::name{key=val}
   - Inline:             :name{key=val}

   Directive types (10):

   1. :::cover-page{title="..." subtitle="..." date="..." author="..." recipient="..." logo=auto|<url>}
      Hero/cover page for investor docs. Always first content block.

   2. :::kpi{value="..." label="..." trend="..." from="<category.field>"}
      Big-number tile. Either inline value or pulled from Data Room.

   3. :::callout{tone="info|warning|success|critical|neutral" title="..."}\nbody\n:::
      Highlighted box for key insights, risks, or call-outs.

   4. :::quote{author="..." role="..." source="..."}\nquoted text\n:::
      Pull-quote / testimonial card.

   5. ::image{src="..." alt="..." caption="..." width="full|half|third"}
      Embedded image with optional caption. src can be a URL or document://<attachment-id>.

   6. :::chart{type="line|bar|pie|area|stackedBar|scatter|milestone" title="..." from="<source>" field="..." range="..." data="[...]"}
      Inline chart. Either references Data Room or accepts inline JSON data array.

   7. :::data-table{from="<category>" columns="..." sort="..." limit="..." title="..."}
      Live Data Room table — auto-updates when underlying fields change.

   8. ::page-break
      Forces a page break in print/PDF output.

   9. :::signature{name="..." title="..." date="..."}
      Signature block — name + title + date with signature line.

   10. ::footer-meta{text="..." showPageNumber=true}
       Sets the document's print footer text. Inline element, no body.

   Forward-compat: directives unknown to the renderer fall back to
   rendering their attributes as a metadata card so authors can preview
   what data they intend to embed.
═══════════════════════════════════════════════════════════════ */

import type { Plugin } from 'unified';
import type { Root, Parent } from 'mdast';
import { visit } from 'unist-util-visit';

/* The 10 supported directive names — kept here as canonical truth */
export const DIRECTIVE_NAMES = [
  'cover-page', 'kpi', 'callout', 'quote', 'image',
  'chart', 'data-table', 'page-break', 'signature', 'footer-meta',
] as const;

export type DirectiveName = typeof DIRECTIVE_NAMES[number];

/** Whether a directive renders as a block, leaf, or inline element. */
export const DIRECTIVE_KINDS: Record<DirectiveName, 'container' | 'leaf' | 'textInline'> = {
  'cover-page': 'container',
  'kpi':        'leaf',
  'callout':    'container',
  'quote':      'container',
  'image':      'leaf',
  'chart':      'container',  /* container so inline data JSON can be in body */
  'data-table': 'leaf',
  'page-break': 'leaf',
  'signature':  'leaf',
  'footer-meta':'leaf',
};

/** Common shape for parsed directive attributes. */
export interface DirectiveAttrs {
  [key: string]: string | number | boolean | undefined;
}

/** What a directive node carries after parsing — passed to renderers. */
export interface ParsedDirective {
  name:    DirectiveName | string;  /* string for forward-compat with unknown directives */
  attrs:   DirectiveAttrs;
  /** Inner markdown content for container directives — empty for leaf/inline */
  body:    string;
  /** Raw mdast children — exposed for renderers that need to walk content (e.g. callout containers preserving paragraph spacing) */
  children?: any[];
}

/* ─── Helpers ────────────────────────────────────────────────────── */

/** Normalize attribute values — convert "true"/"false" strings, numeric strings */
export function normalizeAttrs(raw: Record<string, string | null | undefined>): DirectiveAttrs {
  const out: DirectiveAttrs = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (v == null) continue;
    const s = String(v);
    if (s === 'true')  { out[k] = true; continue; }
    if (s === 'false') { out[k] = false; continue; }
    /* Numeric? Only if pure number — don't convert "123abc" or color hex */
    if (/^-?\d+(\.\d+)?$/.test(s)) { out[k] = Number(s); continue; }
    out[k] = s;
  }
  return out;
}

/* ─── remark-directive plugin: transform directive nodes ─────────── */

/**
 * Plugin to convert remark-directive's containerDirective / leafDirective /
 * textDirective nodes into a custom `directive` node so we can render them
 * via react-markdown's `components` map.
 *
 * Mechanism: react-markdown lets us register handlers for custom hName
 * tags. We rewrite each directive node to have a hName + hProperties so
 * it renders as `<ds-directive name=... attrs=...>body</ds-directive>`,
 * and the DocumentViewer registers `ds-directive` in its components map.
 *
 * For containerDirective nodes, we also extract the FIRST fenced code block
 * found in the children and stash its raw text in `data-raw-body` — this
 * is how chart/data-table directives receive their JSON payload without
 * losing markdown semantics elsewhere in the body.
 */
export const remarkDirectiveRender: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, (node: any) => {
      if (
        node.type === 'containerDirective' ||
        node.type === 'leafDirective'      ||
        node.type === 'textDirective'
      ) {
        const data = node.data || (node.data = {});
        const attrs = normalizeAttrs(node.attributes || {});

        /* Extract the first code-block body for data-carrying directives */
        let rawBody = '';
        if (node.type === 'containerDirective' && Array.isArray(node.children)) {
          for (const child of node.children) {
            if (child && child.type === 'code' && typeof child.value === 'string') {
              rawBody = child.value;
              break;
            }
          }
          /* Mark the code-block child so the renderer can suppress it
             (chart data shouldn't double-render as a code block) */
          if (rawBody) {
            for (const child of node.children) {
              if (child && child.type === 'code') {
                child.data = child.data || {};
                child.data.hName = 'ds-suppressed';  /* unknown tag — renders nothing */
                child.data.hProperties = {};
                break;
              }
            }
          }
        }

        /* Serialize attrs + raw body as data-* attributes so react-markdown
           passes them through. Keep raw children intact so the body content
           still renders inside container directives. */
        data.hName = 'ds-directive';
        data.hProperties = {
          'data-name':     String(node.name || 'unknown'),
          'data-attrs':    JSON.stringify(attrs),
          'data-kind':     node.type === 'containerDirective' ? 'container'
                          : node.type === 'leafDirective'      ? 'leaf'
                          : 'textInline',
          'data-raw-body': rawBody,
        };
      }
    });
  };
};

/* ─── Validation helpers used by templates + exporters ────────────── */

/** Render a directive as a plain-text representation — used by DOCX export + fallback paths. */
export function directiveToPlainText(name: string, attrs: DirectiveAttrs, body: string): string {
  switch (name) {
    case 'cover-page': {
      const t = attrs.title || '';
      const s = attrs.subtitle || '';
      return [t, s].filter(Boolean).join('\n');
    }
    case 'kpi': {
      const v = attrs.value ?? '';
      const l = attrs.label ?? '';
      return `${v} — ${l}`;
    }
    case 'callout': {
      const t = attrs.title ? `${attrs.title}\n` : '';
      return `${t}${body}`.trim();
    }
    case 'quote': {
      const att = [attrs.author, attrs.role, attrs.source].filter(Boolean).join(', ');
      return `"${body.trim()}"${att ? ` — ${att}` : ''}`;
    }
    case 'image':
      return `[Image: ${attrs.alt || attrs.caption || attrs.src || 'embedded'}]`;
    case 'chart':
      return `[Chart: ${attrs.title || attrs.type || 'visualization'}]`;
    case 'data-table':
      return `[Data table: ${attrs.title || attrs.from || 'data'}]`;
    case 'page-break':
      return '\n\n---\n\n';
    case 'signature':
      return `\n\nSigned: ${attrs.name || ''}${attrs.title ? ` (${attrs.title})` : ''}${attrs.date ? ` — ${attrs.date}` : ''}`;
    case 'footer-meta':
      return '';  /* footer is print-only */
    default:
      return body || `[${name}]`;
  }
}

/** Validate that an attrs object has the required keys for a given directive. */
export function validateDirective(name: string, attrs: DirectiveAttrs): { valid: boolean; missing?: string[] } {
  const required: Record<string, string[]> = {
    'kpi':        ['label'],          /* needs at least a label; value OR from is required (validated below) */
    'image':      ['src'],
    'chart':      ['type'],
    'data-table': ['from'],
    'signature':  ['name'],
  };
  const req = required[name];
  if (!req) return { valid: true };
  const missing = req.filter((k) => attrs[k] == null || attrs[k] === '');
  /* kpi: value OR from */
  if (name === 'kpi' && attrs.value == null && attrs.from == null) {
    missing.push('value|from');
  }
  /* chart: data OR from */
  if (name === 'chart' && attrs.data == null && attrs.from == null) {
    missing.push('data|from');
  }
  return missing.length ? { valid: false, missing } : { valid: true };
}
