/* ════════════════════════════════════════════════════════════════
   api/lib/brand-studio-resolve.ts
   Brand Studio Phase 1D + scope — Live data reference resolution.

   Resolves the `from=` attribute on chart / kpi / data-table directives
   to live values from the platform's data tables, with an optional
   time scope applied to time-series sources.

   Reference syntaxes supported:

   - `dataroom.<category>.<field_key>`
     Returns the project_knowledge field_value for that category+field.

   - `brand.<field>`
     Returns the brand_assets field directly.

   - `metrics.<column>`
     Returns the metrics table time-series for that column. Honors the
     request's `scope` parameter (or falls back to the directive's
     `range`).

   - `revenue.records`
     Returns revenue_records rows for the project.

   TimeScope:
     - { kind: "preset", presetKey: "monthly" | "last_month" |
                                    "quarterly" | "last_quarter" |
                                    "ytd" | "last_30d" | "last_90d" |
                                    "last_365d" | "since_baseline" }
     - { kind: "custom", from: ISO date, to: ISO date }

   Scope is applied uniformly across ALL references in a single
   resolve call. The directive's own `range=` is honored only if no
   global scope is provided.

   Endpoint: bs_resolve_data_references
   Input:  {
             projectId,
             references: [{ id, from, field?, range?, columns?, limit? }],
             scope?: TimeScope
           }
   Output: { success: true, resolutions: { [id]: value }, scope?: { from, to } }
═══════════════════════════════════════════════════════════════ */

import { db, logError } from "./db.js";

export type TimeScopePreset =
  | "monthly" | "last_month"
  | "quarterly" | "last_quarter"
  | "ytd" | "last_30d" | "last_90d" | "last_365d"
  | "since_baseline";

export type TimeScope =
  | { kind: "preset"; presetKey: TimeScopePreset }
  | { kind: "custom"; from?: string; to?: string };

interface Reference {
  id:      string;
  from:    string;
  field?:  string;
  range?:  string;
  limit?:  number;
  columns?:string;
}

const METRICS_COLUMNS = new Set([
  "llm_visibility_score","algorithm_health_score","eeat_score",
  "content_authority_score","overall_growth_score",
  "pages_indexed","pages_submitted","brand_mentions",
]);

/* ─── Time-scope resolution ──────────────────────────────────── */

/** Resolve a TimeScope into an ISO date pair [from, to]. */
export async function resolveScopeRange(
  projectId: string,
  scope: TimeScope | undefined,
): Promise<{ from: string; to: string } | null> {
  if (!scope) return null;
  const now = new Date();
  const toIso = (d: Date) => d.toISOString();
  const startOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const endOfMonth   = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59));
  const startOfQuarter = (d: Date) => {
    const m = d.getUTCMonth();
    const qStart = m - (m % 3);
    return new Date(Date.UTC(d.getUTCFullYear(), qStart, 1));
  };
  const endOfQuarter = (d: Date) => {
    const m = d.getUTCMonth();
    const qStart = m - (m % 3);
    return new Date(Date.UTC(d.getUTCFullYear(), qStart + 3, 0, 23, 59, 59));
  };
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

  if (scope.kind === "custom") {
    const from = scope.from ? new Date(scope.from).toISOString() : addDays(now, -90).toISOString();
    const to   = scope.to   ? new Date(scope.to).toISOString()   : now.toISOString();
    return { from, to };
  }

  switch (scope.presetKey) {
    case "last_30d":      return { from: addDays(now, -30).toISOString(),  to: toIso(now) };
    case "last_90d":      return { from: addDays(now, -90).toISOString(),  to: toIso(now) };
    case "last_365d":     return { from: addDays(now, -365).toISOString(), to: toIso(now) };
    case "monthly":       return { from: toIso(startOfMonth(now)),         to: toIso(now) };
    case "last_month": {
      const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      return { from: toIso(startOfMonth(lastMonth)), to: toIso(endOfMonth(lastMonth)) };
    }
    case "quarterly":     return { from: toIso(startOfQuarter(now)),       to: toIso(now) };
    case "last_quarter": {
      const lastQ = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
      return { from: toIso(startOfQuarter(lastQ)), to: toIso(endOfQuarter(lastQ)) };
    }
    case "ytd":           return { from: toIso(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))), to: toIso(now) };
    case "since_baseline": {
      /* Pull baseline date from project_knowledge if present */
      const { data: bRow } = await db().from("project_knowledge")
        .select("field_value")
        .eq("project_id", projectId)
        .eq("category",   "analytics")
        .eq("field_key",  "organic_sessions_baseline_date")
        .maybeSingle();
      const raw = (bRow as any)?.field_value;
      const baseline = parseBaselineDate(raw);
      if (baseline) return { from: baseline.toISOString(), to: toIso(now) };
      /* Fall back to last 90 days if no baseline set */
      return { from: addDays(now, -90).toISOString(), to: toIso(now) };
    }
    default:              return null;
  }
}

/** Best-effort parse of a baseline date stored in project_knowledge.
 *  field_value could be a string (ISO/yyyy-mm-dd/etc.) or a number.
 *  Returns null if not parseable. */
function parseBaselineDate(raw: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = typeof raw === "string" ? raw : String(raw);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

/** Legacy fallback for directive-level `range=` (only used when no
 *  global scope is provided). Returns LIMIT for the metrics query. */
function rangeToLimit(range?: string): number {
  switch (range) {
    case "last_365d": return 365;
    case "last_90d":  return 90;
    case "last_30d":  return 30;
    case "all":       return 1000;
    default:          return 30;
  }
}

async function resolveOne(
  projectId: string,
  ref: Reference,
  scopeRange: { from: string; to: string } | null,
): Promise<any> {
  const from = String(ref.from || "").trim();
  if (!from) return null;

  /* dataroom.<category>.<field_key> ───────────────────────────── */
  if (from.startsWith("dataroom.")) {
    const parts = from.split(".");
    if (parts.length < 3) return null;
    const category  = parts[1];
    const fieldKey  = parts.slice(2).join(".");
    const { data, error } = await db().from("project_knowledge")
      .select("field_value,source,notes,updated_at")
      .eq("project_id", projectId)
      .eq("category",   category)
      .eq("field_key",  fieldKey)
      .maybeSingle();
    if (error || !data) return null;
    return (data as any).field_value;
  }

  /* brand.<field> ─────────────────────────────────────────────── */
  if (from.startsWith("brand.")) {
    const field = from.split(".").slice(1).join(".");
    if (!field) return null;
    const { data, error } = await db().from("brand_assets")
      .select("*").eq("project_id", projectId).maybeSingle();
    if (error || !data) return null;
    return (data as any)[field] ?? null;
  }

  /* metrics.<column> — time series ────────────────────────────── */
  if (from.startsWith("metrics.")) {
    const col = from.split(".").slice(1).join(".");
    if (!METRICS_COLUMNS.has(col)) return null;
    let q: any = db().from("metrics")
      .select(`recorded_at,${col}`)
      .eq("project_id", projectId);
    if (scopeRange) {
      /* Global scope wins over per-directive range */
      q = q.gte("recorded_at", scopeRange.from).lte("recorded_at", scopeRange.to);
      const { data, error } = await q.order("recorded_at", { ascending: true }).limit(2000);
      if (error || !data) return null;
      return data.map((r: any) => ({ date: r.recorded_at, value: r[col] }));
    }
    /* Legacy: per-directive `range=` */
    const limit = rangeToLimit(ref.range);
    const { data, error } = await q
      .order("recorded_at", { ascending: false })
      .limit(limit);
    if (error || !data) return null;
    return data.slice().reverse().map((r: any) => ({
      date:  r.recorded_at,
      value: r[col],
    }));
  }

  /* revenue.records — table ───────────────────────────────────── */
  if (from === "revenue.records" || from === "revenue") {
    const limit = Math.min(Number(ref.limit) || 12, 100);
    const { data, error } = await db().from("revenue_records")
      .select("amount,record_type,currency,status,period_month,period_year,notes,invoice_number")
      .eq("project_id", projectId)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(limit);
    if (error || !data) return null;
    return data;
  }

  return null;
}

export async function bsResolveDataReferences(body: any): Promise<any> {
  const { projectId, references, scope } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!Array.isArray(references)) return { success: false, error: "references must be an array" };
  if (references.length === 0) return { success: true, resolutions: {} };
  if (references.length > 50) return { success: false, error: "Too many references (max 50 per call)" };

  /* Resolve the scope once for all references */
  const scopeRange = await resolveScopeRange(projectId, scope as TimeScope | undefined);

  /* De-dupe by id while preserving order */
  const seen = new Set<string>();
  const unique: Reference[] = [];
  for (const r of references) {
    const id = String(r?.id || r?.from || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push({ ...r, id });
  }

  /* Resolve in parallel */
  const out: Record<string, any> = {};
  await Promise.all(unique.map(async (ref) => {
    try {
      out[ref.id] = await resolveOne(projectId, ref, scopeRange);
    } catch (e: any) {
      logError({ source: "brand-studio-resolve", action: "resolveOne", error: e, projectId, metadata: { ref } }).catch(() => {});
      out[ref.id] = null;
    }
  }));

  return { success: true, resolutions: out, scope: scopeRange };
}
