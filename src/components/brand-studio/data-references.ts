/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/data-references.ts
   Brand Studio Phase 1D + scope — Extract + fetch live data references.

   Workflow:
   1. extractDataReferences(content) — scans markdown for directive
      attrs `from=...` (plus `field`, `range`, `limit`, `columns`).
   2. fetchDataReferences(projectId, references, scope?) — single
      round-trip to the bs_resolve_data_references endpoint with
      optional time scope. Returns a dict keyed by reference id.

   The dict is passed into DocumentViewer's dataContext.dataReferences
   so directive renderers can look up resolved values inline. When the
   user picks a different scope, Library re-calls fetchDataReferences
   and refreshes the dataContext.
═══════════════════════════════════════════════════════════════ */

const ENGINE = '/api/task-engine';

export type TimeScopePreset =
  | 'monthly' | 'last_month'
  | 'quarterly' | 'last_quarter'
  | 'ytd'
  | 'last_30d' | 'last_90d' | 'last_365d'
  | 'since_baseline';

export type TimeScope =
  | { kind: 'preset'; presetKey: TimeScopePreset }
  | { kind: 'custom'; from?: string; to?: string };

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
 *  resolutions keyed by reference id. Optionally passes a TimeScope
 *  that the resolver applies to metric queries. */
export async function fetchDataReferences(
  projectId: string,
  references: DataReference[],
  scope?: TimeScope,
): Promise<{ resolutions: Record<string, any>; scope?: { from: string; to: string } }> {
  if (!projectId || references.length === 0) return { resolutions: {} };
  try {
    const res = await fetch(ENGINE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'bs_resolve_data_references',
        projectId,
        references,
        scope,
      }),
    });
    if (!res.ok) return { resolutions: {} };
    const j = await res.json();
    if (!j?.success) return { resolutions: {} };
    return { resolutions: j.resolutions || {}, scope: j.scope };
  } catch {
    return { resolutions: {} };
  }
}

/** Default scope used when nothing else is selected: prefer "since baseline"
 *  if the project has a baseline date set, otherwise last 90 days. The
 *  picker UI sets this based on probe data. */
export function defaultScope(hasBaseline: boolean): TimeScope {
  return hasBaseline
    ? { kind: 'preset', presetKey: 'since_baseline' }
    : { kind: 'preset', presetKey: 'last_90d' };
}

/** Human-readable label for a scope (used in picker button + meta) */
export function describeScope(s: TimeScope, baselineDate?: string | null): string {
  if (s.kind === 'custom') {
    const from = s.from ? new Date(s.from).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const to   = s.to   ? new Date(s.to).toLocaleDateString('en-GB',   { day: '2-digit', month: 'short', year: 'numeric' }) : 'today';
    return `${from} → ${to}`;
  }
  switch (s.presetKey) {
    case 'last_30d':       return 'Last 30 days';
    case 'last_90d':       return 'Last 90 days';
    case 'last_365d':      return 'Last 365 days';
    case 'monthly':        return 'This month';
    case 'last_month':     return 'Last month';
    case 'quarterly':      return 'This quarter';
    case 'last_quarter':   return 'Last quarter';
    case 'ytd':            return 'Year to date';
    case 'since_baseline': return baselineDate
                                    ? `Since baseline (${new Date(baselineDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})`
                                    : 'Since baseline';
    default:               return 'Custom';
  }
}
