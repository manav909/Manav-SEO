/* ════════════════════════════════════════════════════════════════
   api/lib/brand-studio-resolve.ts
   Brand Studio Phase 1D — Live data reference resolution.

   Resolves the `from=` attribute on chart / kpi / data-table directives
   to live values from the platform's data tables.

   Reference syntaxes supported:

   - `dataroom.<category>.<field_key>`
     Returns the project_knowledge field_value for that category+field.
     Scalar OR JSON (whatever was stored).
       e.g. `dataroom.analytics.gsc_total_clicks` → 12500
            `dataroom.growth.mrr_monthly`        → [{month:..., mrr:...}]
            `dataroom.market.competitors`        → [{name:..., positioning:...}]

   - `brand.<field>`
     Returns the brand_assets field directly.
       e.g. `brand.primary_logo_url` → "https://..."

   - `metrics.<column>`
     Returns the metrics table time-series for that column.
       e.g. `metrics.llm_visibility_score` → [{date, value}, ...]
            `metrics.algorithm_health_score` → [{date, value}, ...]
            `metrics.brand_mentions` → [{date, value}, ...]
     Range options via ref.range:
       - "last_30d" (default), "last_90d", "last_365d", "all"

   - `revenue.records`
     Returns revenue_records rows for the project, most recent first.
       Limit via ref.limit (default 12, max 100).

   Endpoint: bs_resolve_data_references
   Input:  { projectId, references: [{ id, from, field?, range?, columns?, limit? }] }
   Output: { success: true, resolutions: { [id]: value } }
     `id` is the caller's local key — usually the directive's `from`
     attribute. Resolutions are keyed by id so the caller can use the
     same key when looking up values.
═══════════════════════════════════════════════════════════════ */

import { db, logError } from "./db.js";

interface Reference {
  id:      string;        /* caller's key for this lookup */
  from:    string;        /* the `from=` value from the directive */
  field?:  string;        /* used by metrics.* + chart yKey */
  range?:  string;        /* "last_30d" | "last_90d" | "last_365d" | "all" */
  limit?:  number;        /* used by revenue.records + data-table */
  columns?:string;        /* used by data-table — passed back for renderer use */
}

const METRICS_COLUMNS = new Set([
  "llm_visibility_score","algorithm_health_score","eeat_score",
  "content_authority_score","overall_growth_score",
  "pages_indexed","pages_submitted","brand_mentions",
]);

function rangeToLimit(range?: string): number {
  switch (range) {
    case "last_365d": return 365;
    case "last_90d":  return 90;
    case "last_30d":  return 30;
    case "all":       return 1000;
    default:          return 30;
  }
}

async function resolveOne(projectId: string, ref: Reference): Promise<any> {
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
    const limit = rangeToLimit(ref.range);
    const { data, error } = await db().from("metrics")
      .select(`recorded_at,${col}`)
      .eq("project_id", projectId)
      .order("recorded_at", { ascending: false })
      .limit(limit);
    if (error || !data) return null;
    /* Reverse to chronological order for charts */
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

  /* Unknown source — return null so renderer can show placeholder */
  return null;
}

export async function bsResolveDataReferences(body: any): Promise<any> {
  const { projectId, references } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!Array.isArray(references)) return { success: false, error: "references must be an array" };
  if (references.length === 0) return { success: true, resolutions: {} };
  if (references.length > 50) return { success: false, error: "Too many references (max 50 per call)" };

  /* De-dupe by id while preserving order */
  const seen = new Set<string>();
  const unique: Reference[] = [];
  for (const r of references) {
    const id = String(r?.id || r?.from || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push({ ...r, id });
  }

  /* Resolve in parallel — each is at most one DB query */
  const out: Record<string, any> = {};
  await Promise.all(unique.map(async (ref) => {
    try {
      out[ref.id] = await resolveOne(projectId, ref);
    } catch (e: any) {
      logError({ source: "brand-studio-resolve", action: "resolveOne", error: e, projectId, metadata: { ref } }).catch(() => {});
      out[ref.id] = null;
    }
  }));

  return { success: true, resolutions: out };
}
