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

export interface SemrushReport {
  generated_at: string; database: string; has_key: boolean;
  client: DomainMetrics | null;
  competitors: DomainMetrics[];
  gaps: string[];
  summary: string; limits: string[];
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

export async function semrushIntelligence(opts: { projectId: string; domain?: string; competitors?: string[]; database?: string }): Promise<SemrushReport> {
  const now = new Date().toISOString();
  const database = (opts.database || "us").trim();
  const key = await loadSemrushKey(opts.projectId);
  const clientDomain = cleanDomain(opts.domain || "");
  const comps = Array.from(new Set((opts.competitors || []).map(cleanDomain).filter(Boolean)));

  if (!key) return { generated_at: now, database, has_key: false, client: null, competitors: [], gaps: [], summary: "No Semrush API key is configured. Add your Semrush API key to pull Authority Score, backlinks, referring domains, and organic keywords for the client and competitors. (The Semrush API uses API units.)", limits: ["Requires a Semrush API key with available API units."] };
  if (!clientDomain) return { generated_at: now, database, has_key: true, client: null, competitors: [], gaps: [], summary: "No client domain to analyse. Supply the site URL.", limits: ["Requires the client domain."] };

  const client = await metricsFor(key, clientDomain, database);
  const competitors: DomainMetrics[] = [];
  for (const c of comps) competitors.push(await metricsFor(key, c, database));

  /* Honest gap notes from real numbers. */
  const gaps: string[] = [];
  for (const c of competitors) {
    if (c.error) { gaps.push(`Could not pull ${c.domain} (${c.error}).`); continue; }
    if (client.referring_domains != null && c.referring_domains != null && c.referring_domains > client.referring_domains)
      gaps.push(`${c.domain} has ${c.referring_domains} referring domains vs your ${client.referring_domains} — a link-authority gap of ${c.referring_domains - client.referring_domains}.`);
    if (client.organic_keywords != null && c.organic_keywords != null && c.organic_keywords > client.organic_keywords)
      gaps.push(`${c.domain} ranks for ${c.organic_keywords} organic keywords vs your ${client.organic_keywords} — a visibility gap of ${c.organic_keywords - client.organic_keywords}.`);
    if (client.authority_score != null && c.authority_score != null && c.authority_score > client.authority_score)
      gaps.push(`${c.domain} Authority Score ${c.authority_score} vs your ${client.authority_score}.`);
  }

  const clientErr = client.error;
  const summary = clientErr
    ? `Semrush returned an error for ${clientDomain}: ${clientErr}. Check the API key, the database (${database}), and remaining API units.`
    : `Semrush data for ${clientDomain}: Authority Score ${client.authority_score}, ${client.organic_keywords} organic keywords, ${client.organic_traffic} est. monthly organic traffic, ${client.total_backlinks} backlinks from ${client.referring_domains} referring domains. Compared against ${competitors.filter(c => !c.error).length} competitor(s); ${gaps.length} gap(s) identified.`;

  const limits = [
    "Live Semrush API data (database: " + database + "); consumes Semrush API units per run.",
    "Keyword-gap detail (the specific missing keywords list) is not included in this pass — it is a heavier endpoint flagged as a follow-up; this delivers the domain and backlink overview comparison.",
    "Authority Score, backlinks, and referring domains are Semrush's metrics — interpret alongside, not instead of, on-page and content findings.",
  ];

  return { generated_at: now, database, has_key: true, client, competitors, gaps, summary, limits };
}
