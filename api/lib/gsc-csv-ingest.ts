/* ════════════════════════════════════════════════════════════════
   api/lib/gsc-csv-ingest.ts
   Ingest a Google Search Console Performance export (CSV) when the
   client hasn't granted OAuth access.

   GSC's "Export → Download CSV" produces one file per tab: Queries,
   Pages, Countries, Devices, Search appearance, Dates. Each is detected
   by its header row, shaped exactly like the OAuth pull in pm-gsc.ts,
   and written to the same places (project_knowledge gsc_* keys, the
   daily `metrics` trend, a metrics_snapshots row) so every engine that
   reads GSC data works the same either way.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { parseCsv } from "./paid-organic.js";

type Kind = "query" | "page" | "country" | "device" | "appearance" | "date";

export interface GscCsvReport {
  success: boolean;
  summary: string;
  error?: string;
  files: { filename: string; kind: Kind | null; rows: number }[];
  totals?: { clicks: number; impressions: number; ctr: number; position: number };
}

const num = (v: string) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };

function detectKind(header: string): Kind | null {
  const h = header.toLowerCase().trim();
  if (/quer/.test(h)) return "query";
  if (/page|url/.test(h)) return "page";
  if (/countr/.test(h)) return "country";
  if (/device/.test(h)) return "device";
  if (/appearance/.test(h)) return "appearance";
  if (/^date/.test(h)) return "date";
  return null;
}

const KEY_FIELD: Record<Kind, string> = {
  query: "query", page: "page", country: "country", device: "device", appearance: "appearance", date: "date",
};

function shape(rows: string[][], kind: Kind): any[] {
  const header = rows[0].map(h => String(h || "").toLowerCase());
  const col = (re: RegExp) => header.findIndex(h => re.test(h));
  const ci = col(/click/), ii = col(/impression/), ti = col(/ctr/), pi = col(/position/);
  return rows.slice(1).map(r => ({
    [KEY_FIELD[kind]]: String(r[0] || "").trim(),
    clicks:      ci >= 0 ? num(r[ci]) : 0,
    impressions: ii >= 0 ? num(r[ii]) : 0,
    ctr:         ti >= 0 ? num(r[ti]) : 0,          // GSC exports CTR as "2.5%" — stored as percent, like the OAuth pull
    position:    pi >= 0 ? Number(num(r[pi]).toFixed(2)) : 0,
  })).filter(x => x[KEY_FIELD[kind]]);
}

export async function ingestGscCsv(opts: {
  projectId: string;
  csvs?: { filename?: string; text?: string }[];
  csvText?: string;
  filename?: string;
}): Promise<GscCsvReport> {
  const inputs = Array.isArray(opts.csvs) && opts.csvs.length
    ? opts.csvs
    : (opts.csvText ? [{ filename: opts.filename, text: opts.csvText }] : []);
  if (!opts.projectId) return { success: false, summary: "projectId required.", error: "projectId required.", files: [] };
  if (inputs.length === 0) return { success: false, summary: "No CSV content supplied.", error: "No CSV content supplied.", files: [] };

  const files: GscCsvReport["files"] = [];
  const byKind: Partial<Record<Kind, any[]>> = {};
  for (const f of inputs) {
    const rows = parseCsv(String(f.text || ""));
    const kind = rows.length > 1 ? detectKind(rows[0][0] || "") : null;
    files.push({ filename: f.filename || "gsc_export.csv", kind, rows: Math.max(0, rows.length - 1) });
    if (kind) byKind[kind] = [...(byKind[kind] || []), ...shape(rows, kind)];
  }

  const recognised = files.filter(f => f.kind && f.rows > 0);
  if (recognised.length === 0) {
    const msg = "This doesn't look like a Search Console Performance export. In Search Console open Performance → Export → Download CSV, then upload Queries.csv, Pages.csv or Dates.csv.";
    return { success: false, summary: msg, error: msg, files };
  }

  const sortByClicks = (a: any[]) => [...a].sort((x, y) => y.clicks - x.clicks || y.impressions - x.impressions);
  const queries = sortByClicks(byKind.query || []);
  const pages   = sortByClicks(byKind.page || []);
  const dates   = (byKind.date || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date)).sort((a, b) => a.date.localeCompare(b.date));

  /* Totals: the Dates tab is the only complete one (top-N tabs are truncated). */
  const basis = dates.length ? dates : (queries.length ? queries : pages);
  const clicks = basis.reduce((s, r) => s + r.clicks, 0);
  const impressions = basis.reduce((s, r) => s + r.impressions, 0);
  const position = impressions > 0
    ? basis.reduce((s, r) => s + r.position * r.impressions, 0) / impressions
    : 0;
  const totals = { clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0, position: Number(position.toFixed(2)) };

  const today = new Date().toISOString().slice(0, 10);
  const sourceName = recognised.map(f => f.filename).join(", ").slice(0, 200);
  const knowledge: { key: string; value: string }[] = [
    { key: "gsc_total_clicks",      value: String(totals.clicks) },
    { key: "gsc_total_impressions", value: String(totals.impressions) },
    { key: "gsc_avg_position",      value: totals.position.toFixed(2) },
    { key: "gsc_ctr",               value: (totals.ctr * 100).toFixed(2) + "%" },
  ];
  if (queries.length)              knowledge.push({ key: "gsc_top_queries",       value: JSON.stringify(queries.slice(0, 250)) });
  if (pages.length)                knowledge.push({ key: "gsc_top_pages",         value: JSON.stringify(pages.slice(0, 250)) });
  if (byKind.country?.length)      knowledge.push({ key: "gsc_top_countries",     value: JSON.stringify(sortByClicks(byKind.country)) });
  if (byKind.device?.length)       knowledge.push({ key: "gsc_top_devices",       value: JSON.stringify(sortByClicks(byKind.device)) });
  if (byKind.appearance?.length)   knowledge.push({ key: "gsc_search_appearance", value: JSON.stringify(byKind.appearance) });

  try {
    for (const k of knowledge) {
      await db().from("project_knowledge").upsert({
        project_id:  opts.projectId,
        category:    "analytics",
        field_key:   k.key,
        field_value: k.value,
        source:      "gsc_csv_upload",
        source_name: sourceName,
        data_date:   today,
        notes:       "Imported from a Google Search Console Performance export (CSV).",
        updated_at:  new Date().toISOString(),
      }, { onConflict: "project_id,category,field_key" });
    }

    if (dates.length) {
      const first = dates[0].date, last = dates[dates.length - 1].date;
      await db().from("metrics").delete()
        .eq("project_id", opts.projectId).eq("source", "gsc_daily")
        .gte("recorded_at", `${first}T00:00:00.000Z`).lte("recorded_at", `${last}T23:59:59.999Z`);
      await db().from("metrics").insert(dates.map(d => ({
        project_id:       opts.projectId,
        recorded_at:      new Date(`${d.date}T12:00:00.000Z`).toISOString(),
        gsc_clicks:       d.clicks,
        gsc_impressions:  d.impressions,
        gsc_avg_position: d.position,
        gsc_ctr:          d.ctr,
        source:           "gsc_daily",
      })) as any);
    }

    await db().from("metrics_snapshots").insert({
      project_id:       opts.projectId,
      gsc_clicks:       totals.clicks,
      gsc_impressions:  totals.impressions,
      gsc_avg_position: totals.position,
      source:           "gsc_csv_upload",
      extras: {
        gsc_window_days: dates.length || null,
        gsc_ctr:         totals.ctr,
        top_queries:     queries.slice(0, 10),
        top_pages:       pages.slice(0, 10),
      },
    });
  } catch (e: any) {
    return { success: false, summary: "Could not save the imported data.", error: e?.message || "store failed", files, totals };
  }

  const parts = [
    queries.length ? `${queries.length} queries` : "",
    pages.length ? `${pages.length} pages` : "",
    dates.length ? `${dates.length} days of trend` : "",
    byKind.country?.length ? `${byKind.country.length} countries` : "",
    byKind.device?.length ? `${byKind.device.length} devices` : "",
  ].filter(Boolean).join(", ");
  return {
    success: true,
    summary: `Imported ${parts} from Search Console — ${totals.clicks.toLocaleString()} clicks, ${totals.impressions.toLocaleString()} impressions, average position ${totals.position}.`,
    files,
    totals,
  };
}
