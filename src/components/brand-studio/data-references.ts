/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/data-references.ts
   Brand Studio Phase 1D — Extract + fetch live data references.

   Workflow:
   1. extractDataReferences(content) — scans markdown for directive
      attrs `from=...` (plus `field`, `range`, `limit`, `columns`).
      Returns a deduped list of References.
   2. fetchDataReferences(projectId, references) — single round-trip
      to the bs_resolve_data_references endpoint. Returns a dict
      keyed by reference id (which equals the directive's `from`
      attribute when there's no field/range; otherwise a composite key).

   The dict is passed into DocumentViewer's dataContext.dataReferences
   so directive renderers can look up resolved values inline.
═══════════════════════════════════════════════════════════════ */

const ENGINE = '/api/task-engine';

export interface DataReference {
  id:       string;
  from:     string;
  field?:   string;
  range?:   string;
  limit?:   number;
  columns?: string;
}

/** Build a stable lookup key from a directive's attrs. Used to key the
 *  resolutions dict so a chart with field+range gets its own slot. */
export function refKey(from: string, attrs?: { field?: string; range?: string; limit?: number }): string {
  const parts = [from];
  if (attrs?.field)  parts.push(`field=${attrs.field}`);
  if (attrs?.range)  parts.push(`range=${attrs.range}`);
  if (attrs?.limit != null) parts.push(`limit=${attrs.limit}`);
  return parts.join('|');
}

/** Scan content for directive blocks with `from=...` attrs.
 *  Returns deduped references.
 *
 *  The directive syntax we care about:
 *    :::name{key="val" ...}    container
 *    ::name{key="val" ...}     leaf
 *  Both are 2+ colons followed by a known directive name and an attr
 *  block in braces. We scan for these specifically (text directives
 *  `:name` aren't used for data refs).
 */
const DATA_DIRECTIVE_NAMES = new Set(['chart','kpi','data-table']);

export function extractDataReferences(content: string): DataReference[] {
  if (!content) return [];
  const refs: DataReference[] = [];
  const seen = new Set<string>();

  /* Match ::name{...} or :::name{...} where name is one of our data directives.
     Greedy non-newline match for the attrs block. */
  const re = /:{2,3}(chart|kpi|data-table)\{([^}\n]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (!DATA_DIRECTIVE_NAMES.has(m[1])) continue;
    const attrs = parseAttrs(m[2]);
    if (!attrs.from) continue;
    const id = refKey(attrs.from, attrs);
    if (seen.has(id)) continue;
    seen.add(id);
    refs.push({
      id,
      from:    attrs.from,
      field:   attrs.field,
      range:   attrs.range,
      limit:   attrs.limit != null ? Number(attrs.limit) : undefined,
      columns: attrs.columns,
    });
  }
  return refs;
}

/** Light-weight attrs parser — matches what remark-directive accepts.
 *  Supports key="val", key='val', and bare key=val (no quotes).
 *  Not bulletproof; close enough for our extraction pass. */
function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w[\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s}]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const key = m[1];
    const val = m[2] ?? m[3] ?? m[4] ?? '';
    out[key] = val;
  }
  return out;
}

/** Round-trip to the backend resolver. Returns the dict of
 *  resolutions keyed by reference id. */
export async function fetchDataReferences(
  projectId: string,
  references: DataReference[],
): Promise<Record<string, any>> {
  if (!projectId || references.length === 0) return {};
  try {
    const res = await fetch(ENGINE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'bs_resolve_data_references',
        projectId,
        references,
      }),
    });
    if (!res.ok) return {};
    const j = await res.json();
    if (!j?.success) return {};
    return j.resolutions || {};
  } catch {
    return {};
  }
}
