/* ════════════════════════════════════════════════════════════════
   api/lib/semrush-intel.ts

   BUILD 12.33 — Semrush intelligence (authority / backlinks / keywords).

   Wires the one data source the crawler cannot replicate: the bought
   Semrush data behind Manav's manual reports — Authority Score, total
   backlinks, referring domains, organic keywords and traffic — for the
   client domain and the curated competitors, with a domain-vs-domain
   comparison (the authority/backlink/keyword gap).

   Honest by construction:
   - Real API data only. If no Semrush API key is configured, or the API
     returns an error (including out-of-units), it says so plainly and
     returns nothing fabricated — it never invents DA, backlinks, or
     keyword numbers.
   - It states that the Semrush API consumes API units (a paid metered
     resource), so the operator knows each run has a cost.
   - Keyword-GAP detail (the "missing keywords" list) is a heavier
     endpoint; v1 delivers the domain + backlink overview comparison
     (the headline metrics) and flags the missing-keywords list as a
     follow-up rather than half-doing it.

   Multi-tenant: projectId + the domain/competitors only. Key stored per
   project (project_integrations provider 'semrush') or platform env.
════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { llm, parseJsonResponse } from "./workspace/llm.js";

const cleanDomain = (d: string) => String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

export async function loadSemrushKey(projectId: string): Promise<string> {
  try {
    const { data } = await db().from("project_integrations").select("api_key, status").eq("project_id", projectId).eq("provider", "semrush").maybeSingle();
    const d = data as any;
    if (d?.status === "connected" && d?.api_key) return d.api_key;
    if (d?.api_key) return d.api_key;
  } catch { /* ignore */ }
  return (process.env.SEMRUSH_API_KEY || "").trim();
}

export async function saveSemrushKey(projectId: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
  const key = String(apiKey || "").trim();
  if (!projectId || !key) return { success: false, error: "projectId and apiKey required." };
  try {
    await db().from("project_integrations").upsert({
      project_id: projectId, provider: "semrush", api_key: key, status: "connected",
      last_pull_at: new Date().toISOString(), last_pull_status: "ok", updated_at: new Date().toISOString(),
    }, { onConflict: "project_id,provider" });
    return { success: true };
  } catch (e: any) { return { success: false, error: e?.message || "save failed" }; }
}

/* Semrush API returns ';'-separated text: header line then data lines.
   Error responses begin with "ERROR". */
function parseSemrush(text: string): { rows: Record<string, string>[]; error?: string } {
  const t = String(text || "").trim();
  if (!t || /^ERROR\b/i.test(t)) return { rows: [], error: t || "empty response" };
  const lines = t.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows: [] };
  const headers = lines[0].split(";").map(h => h.trim());
  const rows = lines.slice(1).map(l => { const cells = l.split(";"); const o: Record<string, string> = {}; headers.forEach((h, i) => o[h] = (cells[i] || "").trim()); return o; });
  return { rows };
}

async function domainOverview(key: string, domain: string, database: string): Promise<Record<string, string> | { error: string }> {
  try {
    const u = new URL("https://api.semrush.com/");
    u.searchParams.set("type", "domain_ranks"); u.searchParams.set("key", key);
    u.searchParams.set("domain", domain); u.searchParams.set("database", database);
    u.searchParams.set("export_columns", "Dn,Rk,Or,Ot,Oc,Ad,At");
    const r = await fetch(u.toString()); const text = await r.text();
    const { rows, error } = parseSemrush(text);
    if (error) return { error }; return rows[0] || {};
  } catch (e: any) { return { error: e?.message || "request failed" }; }
}

async function backlinksOverview(key: string, domain: string): Promise<Record<string, string> | { error: string }> {
  try {
    const u = new URL("https://api.semrush.com/analytics/v1/");
    u.searchParams.set("key", key); u.searchParams.set("type", "backlinks_overview");
    u.searchParams.set("target", domain); u.searchParams.set("target_type", "root_domain");
    u.searchParams.set("export_columns", "ascore,total,domains_num,urls_num,follows_num,nofollows_num");
    const r = await fetch(u.toString()); const text = await r.text();
    const { rows, error } = parseSemrush(text);
    if (error) return { error }; return rows[0] || {};
  } catch (e: any) { return { error: e?.message || "request failed" }; }
}

const numOr = (v: any, d = 0) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : d; };

export interface DomainMetrics { domain: string; authority_score: number | null; organic_keywords: number | null; organic_traffic: number | null; total_backlinks: number | null; referring_domains: number | null; error?: string; }

export interface ClientAudit { health_score: number | null; errors: number | null; warnings: number | null; notices: number | null; issues: Record<string, number> }

export interface SemrushReport {
  generated_at: string; database: string; has_key: boolean; has_data: boolean; source: string;
  client: DomainMetrics | null;
  competitors: DomainMetrics[];
  audit: ClientAudit | null;
  gaps: string[];
  summary: string; limits: string[];
}

function computeGaps(client: DomainMetrics, competitors: DomainMetrics[]): string[] {
  const gaps: string[] = [];
  for (const c of competitors) {
    if (c.error) { gaps.push(`Could not read ${c.domain} (${c.error}).`); continue; }
    if (client.referring_domains != null && c.referring_domains != null && c.referring_domains > client.referring_domains)
      gaps.push(`${c.domain} has ${c.referring_domains} referring domains vs your ${client.referring_domains} — a link-authority gap of ${c.referring_domains - client.referring_domains}.`);
    if (client.organic_keywords != null && c.organic_keywords != null && c.organic_keywords > client.organic_keywords)
      gaps.push(`${c.domain} ranks for ${c.organic_keywords} organic keywords vs your ${client.organic_keywords} — a visibility gap of ${c.organic_keywords - client.organic_keywords}.`);
    if (client.authority_score != null && c.authority_score != null && c.authority_score > client.authority_score)
      gaps.push(`${c.domain} Authority Score ${c.authority_score} vs your ${client.authority_score}.`);
  }
  return gaps;
}

async function metricsFor(key: string, domain: string, database: string): Promise<DomainMetrics> {
  const [ov, bl] = await Promise.all([domainOverview(key, domain, database), backlinksOverview(key, domain)]);
  const ovErr = (ov as any).error; const blErr = (bl as any).error;
  const o = ovErr ? {} : ov as Record<string, string>;
  const b = blErr ? {} : bl as Record<string, string>;
  return {
    domain,
    authority_score: blErr ? null : numOr(b.ascore, 0),
    organic_keywords: ovErr ? null : numOr(o.Or, 0),
    organic_traffic: ovErr ? null : numOr(o.Ot, 0),
    total_backlinks: blErr ? null : numOr(b.total, 0),
    referring_domains: blErr ? null : numOr(b.domains_num, 0),
    error: ovErr || blErr || undefined,
  };
}

/* ─── Sheet ingestion: treat the operator's Semrush export sheet as the
   data layer (extract the NUMBERS, not the prose) so the engine can run
   its own analysis as if the API had returned them. ─── */
const SHEET_SYSTEM = [
  `You are given a spreadsheet (CSV) the operator compiled from Semrush for an SEO audit, plus the client domain and any competitor domains.`,
  `Extract the NUMBERS into structured per-domain metrics and the client's site-audit totals. This is data extraction, not interpretation.`,
  `HARD RULES: use ONLY values present in the sheet. If a metric is absent for a domain, use null. NEVER invent, estimate, or carry a number across domains. Numbers only (strip units/commas).`,
  `Return ONLY JSON, no prose, no fences:`,
  `{"client":{"domain":"...","authority_score":null,"organic_keywords":null,"organic_traffic":null,"total_backlinks":null,"referring_domains":null,"health_score":null,"errors":null,"warnings":null,"notices":null,"issues":{"missing_meta_descriptions":null,"duplicate_titles":null,"duplicate_h1_and_title":null,"missing_alt":null}},"competitors":[{"domain":"...","authority_score":null,"organic_keywords":null,"organic_traffic":null,"total_backlinks":null,"referring_domains":null}]}`,
].join("\n");

const cleanIssues = (o: any): Record<string, number> => { const r: Record<string, number> = {}; if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { const n = numOr(v as any, NaN); if (Number.isFinite(n)) r[k] = n; } return r; };
const dm = (o: any, domain: string): DomainMetrics => ({ domain: cleanDomain(o?.domain || domain), authority_score: o?.authority_score == null ? null : numOr(o.authority_score), organic_keywords: o?.organic_keywords == null ? null : numOr(o.organic_keywords), organic_traffic: o?.organic_traffic == null ? null : numOr(o.organic_traffic), total_backlinks: o?.total_backlinks == null ? null : numOr(o.total_backlinks), referring_domains: o?.referring_domains == null ? null : numOr(o.referring_domains) });

export async function ingestSemrushSheet(opts: { projectId: string; csvText: string; clientDomain?: string; competitors?: string[] }): Promise<{ success: boolean; client?: string; competitors?: number; error?: string }> {
  if (!opts.projectId) return { success: false, error: "projectId required." };
  const text = String(opts.csvText || "").trim();
  if (!text) return { success: false, error: "Empty sheet." };
  const user = [`Client domain: ${cleanDomain(opts.clientDomain || "")}.`, `Competitor domains: ${(opts.competitors || []).map(cleanDomain).join(", ") || "(none named)"}.`, ``, `Sheet (CSV):`, text.slice(0, 130000)].join("\n");
  let parsed: any = null;
  try { const raw = await llm({ system: SHEET_SYSTEM, user, maxTokens: 2500, timeoutMs: 70000, label: "semrush-sheet-ingest" }); parsed = parseJsonResponse<any>(raw); } catch (e: any) { return { success: false, error: e?.message || "extraction failed" }; }
  if (!parsed || !parsed.client) return { success: false, error: "Could not extract metrics from the sheet. Check that it contains the Semrush numbers." };

  const clientDomain = cleanDomain(parsed.client.domain || opts.clientDomain || "");
  const sheet = {
    client: { ...dm(parsed.client, clientDomain), health_score: parsed.client.health_score == null ? null : numOr(parsed.client.health_score), errors: parsed.client.errors == null ? null : numOr(parsed.client.errors), warnings: parsed.client.warnings == null ? null : numOr(parsed.client.warnings), notices: parsed.client.notices == null ? null : numOr(parsed.client.notices), issues: cleanIssues(parsed.client.issues) },
    competitors: (Array.isArray(parsed.competitors) ? parsed.competitors : []).map((c: any) => dm(c, "")).filter((c: DomainMetrics) => c.domain),
    ingested_at: new Date().toISOString(),
  };
  try {
    await db().from("project_knowledge").upsert({ project_id: opts.projectId, category: "external_seo_data", field_key: "semrush_sheet", field_value: JSON.stringify(sheet), source: "operator_semrush_sheet", source_name: "Semrush data sheet", data_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }, { onConflict: "project_id,category,field_key" });
    return { success: true, client: clientDomain, competitors: sheet.competitors.length };
  } catch (e: any) { return { success: false, error: e?.message || "store failed" }; }
}

async function loadSemrushSheet(projectId: string): Promise<any | null> {
  try { const { data } = await db().from("project_knowledge").select("field_value").eq("project_id", projectId).eq("category", "external_seo_data").eq("field_key", "semrush_sheet").maybeSingle(); const v = JSON.parse((data as any)?.field_value || "null"); return v && v.client ? v : null; } catch { return null; }
}

export async function semrushIntelligence(opts: { projectId: string; domain?: string; competitors?: string[]; database?: string }): Promise<SemrushReport> {
  const now = new Date().toISOString();
  const database = (opts.database || "us").trim();
  const clientDomain = cleanDomain(opts.domain || "");
  const comps = Array.from(new Set((opts.competitors || []).map(cleanDomain).filter(Boolean)));
  const base = { generated_at: now, database, has_key: false, has_data: false, source: "", client: null as DomainMetrics | null, competitors: [] as DomainMetrics[], audit: null as ClientAudit | null, gaps: [] as string[] };

  /* 1. Operator-provided Semrush sheet data takes priority — treat it as the data layer. */
  const sheet = await loadSemrushSheet(opts.projectId);
  if (sheet && sheet.client) {
    const client: DomainMetrics = sheet.client;
    const competitors: DomainMetrics[] = sheet.competitors || [];
    const audit: ClientAudit = { health_score: sheet.client.health_score ?? null, errors: sheet.client.errors ?? null, warnings: sheet.client.warnings ?? null, notices: sheet.client.notices ?? null, issues: sheet.client.issues || {} };
    const gaps = computeGaps(client, competitors);
    const summary = `From your Semrush data: ${client.domain} Authority Score ${client.authority_score ?? "—"}, ${client.organic_keywords ?? "—"} organic keywords, ${client.organic_traffic ?? "—"} est. organic traffic, ${client.total_backlinks ?? "—"} backlinks from ${client.referring_domains ?? "—"} referring domains${audit.health_score != null ? `, site health ${audit.health_score}` : ""}. Compared against ${competitors.length} competitor(s); ${gaps.length} gap(s).`;
    const limits = ["These figures are your provided Semrush numbers, used as the data layer; the comparison and gaps are computed here. Verify against your sheet.", "Keyword-gap detail (specific missing keywords) is only as available in your sheet."];
    return { ...base, has_key: true, has_data: true, source: "operator-provided Semrush data (sheet)", client, competitors, audit, gaps, summary, limits };
  }

  /* 2. Live Semrush API if a key is configured. */
  const key = await loadSemrushKey(opts.projectId);
  if (!key) return { ...base, summary: "No Semrush data yet. Upload your Semrush data sheet (numbers), or add a Semrush API key, to populate Authority Score, backlinks, referring domains, and keywords.", limits: ["Provide Semrush data via a sheet upload or an API key."] };
  if (!clientDomain) return { ...base, has_key: true, summary: "No client domain to analyse. Supply the site URL.", limits: ["Requires the client domain."] };

  const client = await metricsFor(key, clientDomain, database);
  const competitors: DomainMetrics[] = [];
  for (const c of comps) competitors.push(await metricsFor(key, c, database));
  const gaps = computeGaps(client, competitors);
  const clientErr = client.error;
  const summary = clientErr
    ? `Semrush returned an error for ${clientDomain}: ${clientErr}. Check the API key, the database (${database}), and remaining API units.`
    : `Semrush API data for ${clientDomain}: Authority Score ${client.authority_score}, ${client.organic_keywords} organic keywords, ${client.organic_traffic} est. monthly organic traffic, ${client.total_backlinks} backlinks from ${client.referring_domains} referring domains. Compared against ${competitors.filter(c => !c.error).length} competitor(s); ${gaps.length} gap(s).`;
  const limits = ["Live Semrush API data (database: " + database + "); consumes Semrush API units per run.", "Keyword-gap detail (specific missing keywords) is a heavier endpoint flagged as a follow-up.", "Authority Score, backlinks, and referring domains are Semrush's metrics — interpret alongside on-page and content findings."];
  return { ...base, has_key: true, has_data: !clientErr, source: "Semrush API", client, competitors, audit: null, gaps, summary, limits };
}
