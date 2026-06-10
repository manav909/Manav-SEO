/* ════════════════════════════════════════════════════════════════
   api/lib/paid-organic.ts

   BUILD 12.28 — Paid-vs-organic substitution engine.

   Closes the "reduce dependency on paid traffic" gap with a REAL engine,
   not an estimate. It requires real paid data — a Google Ads search-term
   export — because the platform ingests no paid data, and guessing paid
   dependency from organic alone would be synthetic (the one thing the
   directive forbids). It cross-references the client's actual Ads spend
   per search term against their GSC organic standings to find where
   organic already covers, or could cover, queries they pay for.

   Source-agnostic by design: the analysis core consumes parsed paid
   terms, so a future Google Ads OAuth connector can feed the same engine
   — CSV ingestion is simply the first real source.

   Senior-DMS honesty, built into the output:
   - Paid and organic clicks are NOT 1:1 substitutable (different SERP
     real estate, brand defence, competitor bidding). Recommendations are
     framed as spend-reduction TESTS, not guarantees.
   - Brand-term spend is separated out — cutting brand defence blindly is
     usually wrong; it is flagged, not lumped into "savings".
   - Without an Ads export the engine does nothing and says so. It never
     invents cost, CPC, or conversion numbers.

   Multi-tenant: projectId + the uploaded Ads export only.
════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { loadGsc } from "./workspace/shared.js";

export type Bucket = "strong_substitution" | "ranking_opportunity" | "organic_gap" | "brand_defense";

export interface PaidTerm { term: string; clicks: number; impressions: number; cost: number; conversions: number; }

export interface SubstitutionRow {
  term:            string;
  bucket:          Bucket;
  paid_clicks:     number;
  paid_cost:       number;
  paid_conversions:number;
  organic_position:number | null;
  rationale:       string;
}

export interface PaidOrganicReport {
  project_domain:   string;
  generated_at:     string;
  terms_analyzed:   number;
  currency_note:    string;
  buckets: Record<Bucket, { terms: number; clicks: number; cost: number; conversions: number }>;
  shiftable_spend:  number;          // strong_substitution + ranking_opportunity cost (excludes brand)
  brand_spend:      number;
  top_opportunities: SubstitutionRow[];
  summary:          string;
  limits:           string[];
  has_data:         boolean;
}

/* ─── minimal RFC-4180 parser (Ads exports are simple CSV) ─────── */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  const s = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) { if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}
const num = (v: string) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
const findCol = (h: string[], re: RegExp) => h.findIndex(x => re.test(String(x || "").toLowerCase().trim()));

/* Parse a Google Ads search-terms export. Ads exports carry preamble
   rows before the header and total rows after — both are skipped. */
export function parseAdsCsv(text: string): { terms: PaidTerm[]; note: string } {
  const rows = parseCsv(text);
  const headerIdx = rows.findIndex(r => r.some(c => /search term|search keyword|keyword/i.test(c)));
  if (headerIdx < 0) return { terms: [], note: "Could not find a 'Search term' column — is this a Google Ads search-terms export?" };
  const h = rows[headerIdx].map(c => String(c || "").trim());
  const ix = {
    term:        findCol(h, /search term|search keyword|^keyword$/),
    clicks:      findCol(h, /click/),
    impressions: findCol(h, /impr/),
    cost:        findCol(h, /cost|spend/),
    conversions: findCol(h, /conv/),
  };
  if (ix.term < 0) return { terms: [], note: "No search-term column resolved." };
  const terms: PaidTerm[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const t = String(r[ix.term] || "").trim();
    if (!t || /^total/i.test(t)) continue;            // skip blank + Ads total rows
    terms.push({
      term: t,
      clicks: Math.round(num(ix.clicks >= 0 ? r[ix.clicks] : "0")),
      impressions: Math.round(num(ix.impressions >= 0 ? r[ix.impressions] : "0")),
      cost: Math.round(num(ix.cost >= 0 ? r[ix.cost] : "0") * 100) / 100,
      conversions: Math.round(num(ix.conversions >= 0 ? r[ix.conversions] : "0") * 100) / 100,
    });
  }
  return { terms, note: `Parsed ${terms.length} paid search terms.` };
}

/* Ingest + store (mirrors the GSC CSV pattern) so analysis can re-run. */
export async function ingestAdsCsv(opts: { projectId: string; csvText: string; filename?: string }): Promise<{ success: boolean; terms: number; note: string; error?: string }> {
  if (!opts.projectId) return { success: false, terms: 0, note: "", error: "projectId required." };
  const { terms, note } = parseAdsCsv(opts.csvText || "");
  if (terms.length === 0) return { success: false, terms: 0, note, error: note };
  try {
    await db().from("project_knowledge").upsert({
      project_id: opts.projectId, category: "ads", field_key: "ads_search_terms",
      field_value: JSON.stringify(terms), source: "ads_csv_upload", source_name: opts.filename || "ads_export.csv",
      data_date: new Date().toISOString().slice(0, 10), notes: "Google Ads search-terms export — paid-vs-organic analysis input.", updated_at: new Date().toISOString(),
    }, { onConflict: "project_id,category,field_key" });
    return { success: true, terms: terms.length, note };
  } catch (e: any) { return { success: false, terms: 0, note, error: e?.message || "store failed" }; }
}

const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

async function loadStoredAds(projectId: string): Promise<PaidTerm[]> {
  const { data } = await db().from("project_knowledge").select("field_value")
    .eq("project_id", projectId).eq("category", "ads").eq("field_key", "ads_search_terms").maybeSingle();
  try { const v = JSON.parse((data as any)?.field_value || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export async function analyzePaidVsOrganic(opts: { projectId: string }): Promise<PaidOrganicReport> {
  const now = new Date().toISOString();
  const ads = await loadStoredAds(opts.projectId);
  const gsc = await loadGsc(opts.projectId);
  const pairs: any[] = Array.isArray(gsc.queryPagePairs) ? gsc.queryPagePairs : [];
  const projectDomain = domainOf(pairs[0]?.page || gsc.topPages?.[0]?.page || "");
  const brandTokens = new Set((projectDomain.split(".")[0] || "").split(/[^a-z0-9]/i).filter(Boolean).map(s => s.toLowerCase()));

  const emptyBuckets = (): PaidOrganicReport["buckets"] => ({
    strong_substitution: { terms: 0, clicks: 0, cost: 0, conversions: 0 },
    ranking_opportunity: { terms: 0, clicks: 0, cost: 0, conversions: 0 },
    organic_gap:         { terms: 0, clicks: 0, cost: 0, conversions: 0 },
    brand_defense:       { terms: 0, clicks: 0, cost: 0, conversions: 0 },
  });

  if (ads.length === 0) {
    return {
      project_domain: projectDomain, generated_at: now, terms_analyzed: 0, currency_note: "",
      buckets: emptyBuckets(), shiftable_spend: 0, brand_spend: 0, top_opportunities: [],
      summary: "No Google Ads data ingested. Upload the client's Ads search-terms export (CSV) — this engine does not estimate paid spend, by design.",
      limits: ["Requires a real Google Ads search-terms export."], has_data: false,
    };
  }

  /* Organic standing per normalised query (best position, clicks). */
  const organic = new Map<string, { position: number; clicks: number }>();
  for (const p of pairs) {
    const q = norm(String(p.query || ""));
    if (!q) continue;
    const pos = Number(p.position || 999);
    const prev = organic.get(q);
    if (!prev || pos < prev.position) organic.set(q, { position: pos, clicks: Number(p.clicks || 0) });
  }
  const lookupOrganic = (term: string): number | null => {
    const n = norm(term);
    if (organic.has(n)) return organic.get(n)!.position;
    /* loose containment match for close variants */
    for (const [q, v] of organic) if (q.includes(n) || n.includes(q)) return v.position;
    return null;
  };

  const buckets = emptyBuckets();
  const rows: SubstitutionRow[] = [];
  for (const t of ads) {
    const isBrand = norm(t.term).split(" ").some(tok => brandTokens.has(tok));
    const pos = lookupOrganic(t.term);
    let bucket: Bucket; let rationale: string;
    if (isBrand) {
      bucket = "brand_defense";
      rationale = "Brand term. Paid here is usually defensive (protecting your own name from competitors). Do not cut without testing — organic rarely fully replaces brand-term paid.";
    } else if (pos != null && pos <= 5) {
      bucket = "strong_substitution";
      rationale = `Already ranking organically at position ${Math.round(pos)}. You may be paying for clicks you would substantially earn organically — test reducing or pausing paid and measure organic pickup.`;
    } else if (pos != null && pos <= 20) {
      bucket = "ranking_opportunity";
      rationale = `Ranking organically at position ${Math.round(pos)} (page 1-2). Improve the organic ranking, then step paid down as organic captures the clicks.`;
    } else {
      bucket = "organic_gap";
      rationale = pos == null ? "No organic presence yet — organic cannot substitute here until you build a ranking page. Keep paid for now; treat as a content/ranking target." : `Weak organic (position ${Math.round(pos)}). Long-term organic target; keep paid meanwhile.`;
    }
    buckets[bucket].terms += 1; buckets[bucket].clicks += t.clicks; buckets[bucket].cost += t.cost; buckets[bucket].conversions += t.conversions;
    rows.push({ term: t.term, bucket, paid_clicks: t.clicks, paid_cost: t.cost, paid_conversions: t.conversions, organic_position: pos == null ? null : Math.round(pos), rationale });
  }
  for (const b of Object.keys(buckets) as Bucket[]) buckets[b].cost = Math.round(buckets[b].cost * 100) / 100;

  const shiftable_spend = Math.round((buckets.strong_substitution.cost + buckets.ranking_opportunity.cost) * 100) / 100;
  const brand_spend = buckets.brand_defense.cost;
  const top_opportunities = rows
    .filter(r => r.bucket === "strong_substitution" || r.bucket === "ranking_opportunity")
    .sort((a, b) => b.paid_cost - a.paid_cost).slice(0, 25);

  const summary = `Analysed ${ads.length} paid search terms against organic standings. Potentially shiftable spend (already/nearly ranking organically): ${shiftable_spend} across ${buckets.strong_substitution.terms + buckets.ranking_opportunity.terms} terms — ${buckets.strong_substitution.terms} where you already rank top-5 (test reducing paid now) and ${buckets.ranking_opportunity.terms} ranking-improvement targets. Brand-defence spend (${brand_spend}, ${buckets.brand_defense.terms} terms) is held separate — do not cut blindly. ${buckets.organic_gap.terms} terms have no organic substitute yet.`;

  const limits = [
    "Requires a real Google Ads search-terms export; the engine never estimates paid spend.",
    "Paid and organic clicks are not 1:1 substitutable — recommendations are spend-reduction TESTS, not guarantees. Reducing paid on a term you rank for may still lose some volume (SERP layout, competitor bidding, intent overlap).",
    "Brand-term paid is usually defensive and is separated, not counted as savings.",
    "Search-term to GSC-query matching is exact + loose-containment; close paraphrases may not match.",
    "Cost figures are in whatever currency the Ads export used — interpret amounts in that currency.",
  ];

  return {
    project_domain: projectDomain, generated_at: now, terms_analyzed: ads.length,
    currency_note: "Amounts are in the Ads export's own currency.",
    buckets, shiftable_spend, brand_spend, top_opportunities, summary, limits, has_data: true,
  };
}
