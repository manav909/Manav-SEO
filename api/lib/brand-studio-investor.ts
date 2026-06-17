/* ════════════════════════════════════════════════════════════════
   api/lib/brand-studio-investor.ts
   Brand Studio H.3 — Investor View backend.

   Three concerns:
   1. Traction Proof Points CRUD — dated, sourced claims about
      company performance (revenue, customers, growth, awards)
   2. Market Intelligence CRUD — TAM/SAM/SOM, growth rates,
      competitor data with mandatory URL citations
   3. Web Research engine — server-side fetch with citation
      extraction for high-quality market sourcing

   Investor-grade discipline carries through everywhere:
   - High-confidence market_intelligence MUST have source_url
     (enforced at application layer, capped to medium if missing)
   - Web research only returns results that have actual fetched
     supporting text — no "trust me bro" citations
   - URL allowlist defaults strict (gov/industry-research/filings)
     but PM can override per-fetch with explicit reason
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

/* ─── Traction Proof Points ────────────────────────────────────── */

const VALID_TRACTION_CATEGORIES = ["revenue","customers","retention","engagement","organic_growth","awards","partnerships","team","product","other"];
const VALID_EVIDENCE_TYPES      = ["verified_third_party","verified_internal","self_reported","estimate"];
const VALID_CONFIDENCE          = ["high","medium","low"];
const VALID_STATUS              = ["draft","verified","archived"];

export async function bsListTraction(body: any): Promise<any> {
  const { projectId, includeArchived } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  let q = db().from("traction_proof_points").select("*").eq("project_id", projectId);
  if (!includeArchived) q = q.neq("status", "archived");
  q = q.order("evidence_date", { ascending: false });
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, proof_points: data || [] };
}

export async function bsUpsertTraction(body: any): Promise<any> {
  const { id, projectId, ...fields } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!fields.claim || !fields.claim.trim()) return { success: false, error: "claim required" };
  if (!fields.evidence_date) return { success: false, error: "evidence_date required" };
  if (!fields.category || !VALID_TRACTION_CATEGORIES.includes(fields.category)) {
    return { success: false, error: `category must be one of: ${VALID_TRACTION_CATEGORIES.join(", ")}` };
  }
  /* coerce + validate enums */
  const evidenceType = fields.evidence_type || "self_reported";
  if (!VALID_EVIDENCE_TYPES.includes(evidenceType)) return { success: false, error: "invalid evidence_type" };
  const confidence = fields.confidence || "medium";
  if (!VALID_CONFIDENCE.includes(confidence)) return { success: false, error: "invalid confidence" };
  const status = fields.status || "draft";
  if (!VALID_STATUS.includes(status)) return { success: false, error: "invalid status" };

  const payload = {
    project_id:     projectId,
    category:       fields.category,
    claim:          String(fields.claim).slice(0, 500),
    metric_value:   fields.metric_value ? String(fields.metric_value).slice(0, 200) : null,
    metric_period:  fields.metric_period ? String(fields.metric_period).slice(0, 200) : null,
    evidence_date:  fields.evidence_date,
    effective_from: fields.effective_from || null,
    effective_to:   fields.effective_to   || null,
    evidence_type:  evidenceType,
    source:         fields.source ? String(fields.source).slice(0, 100) : null,
    source_name:    fields.source_name ? String(fields.source_name).slice(0, 200) : null,
    source_url:     fields.source_url ? String(fields.source_url).slice(0, 1000) : null,
    source_excerpt: fields.source_excerpt ? String(fields.source_excerpt).slice(0, 2000) : null,
    confidence,
    status,
    notes:          fields.notes ? String(fields.notes).slice(0, 2000) : null,
    created_by:     fields.created_by || null,
  };

  if (id) {
    const { data, error } = await db().from("traction_proof_points")
      .update(payload).eq("id", id).eq("project_id", projectId).select().single();
    if (error || !data) return { success: false, error: error?.message || "update failed" };
    return { success: true, proof_point: data };
  } else {
    const { data, error } = await db().from("traction_proof_points")
      .insert(payload).select().single();
    if (error || !data) return { success: false, error: error?.message || "insert failed" };
    return { success: true, proof_point: data };
  }
}

export async function bsDeleteTraction(body: any): Promise<any> {
  const { id, projectId } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };
  const { error } = await db().from("traction_proof_points")
    .delete().eq("id", id).eq("project_id", projectId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/* ─── Market Intelligence ──────────────────────────────────────── */

const VALID_MI_CATEGORIES = ["tam","sam","som","growth_rate","market_share","competitor_funding","competitor_metric","industry_trend","regulatory","other"];
const VALID_SOURCE_TYPES  = ["gov_statistics","industry_research","company_filing","press_release","third_party_db","analyst_report","other"];

export async function bsListMarketIntel(body: any): Promise<any> {
  const { projectId, includeArchived } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  let q = db().from("market_intelligence").select("*").eq("project_id", projectId);
  if (!includeArchived) q = q.neq("status", "archived");
  q = q.order("source_date", { ascending: false, nullsFirst: false });
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, market_intel: data || [] };
}

export async function bsUpsertMarketIntel(body: any): Promise<any> {
  const { id, projectId, ...fields } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!fields.claim || !fields.claim.trim()) return { success: false, error: "claim required" };
  if (!fields.category || !VALID_MI_CATEGORIES.includes(fields.category)) {
    return { success: false, error: `category must be one of: ${VALID_MI_CATEGORIES.join(", ")}` };
  }

  const sourceType = fields.source_type || null;
  if (sourceType && !VALID_SOURCE_TYPES.includes(sourceType)) return { success: false, error: "invalid source_type" };

  /* HIGH-CONFIDENCE GATE — investor-grade discipline.
     If confidence='high' but source_url is missing, force confidence='medium'.
     The PM can override by manually upgrading after adding a URL. */
  let confidence: string = fields.confidence || "medium";
  if (!VALID_CONFIDENCE.includes(confidence)) confidence = "medium";
  const sourceUrl = fields.source_url ? String(fields.source_url).slice(0, 1000) : null;
  let confidenceCappedReason: string | null = null;
  if (confidence === "high" && !sourceUrl) {
    confidence = "medium";
    confidenceCappedReason = "High confidence requires a source URL — cap to medium until provided.";
  }

  const status = fields.status || "draft";
  if (!VALID_STATUS.includes(status)) return { success: false, error: "invalid status" };

  const payload = {
    project_id:     projectId,
    category:       fields.category,
    claim:          String(fields.claim).slice(0, 500),
    metric_value:   fields.metric_value ? String(fields.metric_value).slice(0, 200) : null,
    source_url:     sourceUrl,
    source_name:    fields.source_name ? String(fields.source_name).slice(0, 200) : null,
    source_date:    fields.source_date || null,
    source_excerpt: fields.source_excerpt ? String(fields.source_excerpt).slice(0, 2000) : null,
    source_type:    sourceType,
    methodology:    fields.methodology ? String(fields.methodology).slice(0, 1000) : null,
    assumptions:    fields.assumptions ? String(fields.assumptions).slice(0, 1000) : null,
    confidence,
    status,
    competitor_name: fields.competitor_name ? String(fields.competitor_name).slice(0, 200) : null,
    notes:          fields.notes ? String(fields.notes).slice(0, 2000) : null,
    created_by:     fields.created_by || null,
  };

  let result: any;
  if (id) {
    const { data, error } = await db().from("market_intelligence")
      .update(payload).eq("id", id).eq("project_id", projectId).select().single();
    if (error || !data) return { success: false, error: error?.message || "update failed" };
    result = data;
  } else {
    const { data, error } = await db().from("market_intelligence")
      .insert(payload).select().single();
    if (error || !data) return { success: false, error: error?.message || "insert failed" };
    result = data;
  }

  return {
    success: true,
    market_intel: result,
    notice: confidenceCappedReason,
  };
}

export async function bsDeleteMarketIntel(body: any): Promise<any> {
  const { id, projectId } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };
  const { error } = await db().from("market_intelligence")
    .delete().eq("id", id).eq("project_id", projectId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/* ─── Web Research ─────────────────────────────────────────────── */

/** Source quality allowlist — domains we trust for investor-grade citations.
 *  PM can override per-fetch by passing allowAnyDomain=true with a reason,
 *  but the default protects investor docs from low-quality sources. */
const TRUSTED_DOMAIN_PATTERNS: RegExp[] = [
  /* Government statistics */
  /\.gov(\.|$)/i,
  /\.gov\.uk$/i,
  /eurostat\.ec\.europa\.eu/i,
  /oecd\.org$/i,
  /worldbank\.org$/i,
  /imf\.org$/i,
  /un\.org$/i,
  /census\.gov$/i,
  /bls\.gov$/i,
  /ons\.gov\.uk$/i,
  /ec\.europa\.eu$/i,
  /data\.gov(\.|$)/i,
  /federalreserve\.gov$/i,
  /sec\.gov$/i,

  /* Industry research firms */
  /statista\.com$/i,
  /gartner\.com$/i,
  /forrester\.com$/i,
  /idc\.com$/i,
  /mckinsey\.com$/i,
  /bcg\.com$/i,
  /bain\.com$/i,
  /deloitte\.com$/i,
  /pwc\.com$/i,
  /ey\.com$/i,
  /kpmg\.com$/i,
  /accenture\.com$/i,
  /grandviewresearch\.com$/i,
  /marketsandmarkets\.com$/i,
  /alliedmarketresearch\.com$/i,
  /mordorintelligence\.com$/i,
  /futuremarketinsights\.com$/i,
  /technavio\.com$/i,
  /emarketer\.com$/i,
  /pewresearch\.org$/i,

  /* Reputable business press for context (but NOT for primary market sizing) */
  /reuters\.com$/i,
  /bloomberg\.com$/i,
  /ft\.com$/i,
  /wsj\.com$/i,
  /economist\.com$/i,
  /forbes\.com$/i,
  /hbr\.org$/i,

  /* SEC/regulatory primary sources */
  /sec\.gov/i,
  /companieshouse\.gov\.uk$/i,
  /crunchbase\.com$/i,    /* funding rounds — primary on this */
  /pitchbook\.com$/i,

  /* Established databases */
  /ahrefs\.com\/blog/i,
  /semrush\.com/i,
  /similarweb\.com$/i,
  /datareportal\.com$/i,

  /* Academic */
  /\.edu(\.|$)/i,
  /\.edu\.[a-z]{2,3}$/i,
  /jstor\.org$/i,
  /scholar\.google/i,
  /arxiv\.org$/i,
];

function isDomainTrusted(url: string): { trusted: boolean; domain: string } {
  try {
    const u = new URL(url);
    const domain = u.hostname.replace(/^www\./, "");
    for (const pat of TRUSTED_DOMAIN_PATTERNS) {
      if (pat.test(domain) || pat.test(u.hostname)) return { trusted: true, domain };
    }
    return { trusted: false, domain };
  } catch {
    return { trusted: false, domain: "" };
  }
}

/** Server-side fetch + light HTML cleanup. Returns cleaned text + the
 *  document title for the citation block. */
async function fetchPageText(url: string): Promise<{
  text:    string;
  title?:  string;
  error?:  string;
  status?: number;
}> {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) {
      return { text: "", error: "Only http(s) URLs allowed" };
    }
  } catch {
    return { text: "", error: "Invalid URL" };
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) return { text: "", error: `HTTP ${res.status}`, status: res.status };
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    return { text: cleaned.slice(0, 30000), title };
  } catch (e: any) {
    return { text: "", error: e?.message || "fetch failed" };
  }
}

/** Find passages in the text that mention the query terms. Returns up to
 *  N short excerpts (~250 chars each, centered on the match) with their
 *  approximate character offset. */
function extractExcerptsForQuery(text: string, query: string, maxExcerpts = 5): Array<{ excerpt: string; offset: number }> {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2).slice(0, 6);
  if (!terms.length || !text) return [];
  const lc = text.toLowerCase();
  const offsets = new Set<number>();
  for (const t of terms) {
    let idx = 0;
    while ((idx = lc.indexOf(t, idx)) >= 0 && offsets.size < maxExcerpts * 4) {
      offsets.add(idx);
      idx += t.length;
    }
  }
  /* sort and dedupe nearby offsets (within 200 chars) */
  const sorted = [...offsets].sort((a, b) => a - b);
  const collapsed: number[] = [];
  for (const off of sorted) {
    if (collapsed.length === 0 || off - collapsed[collapsed.length - 1] > 200) {
      collapsed.push(off);
    }
  }
  /* build excerpts */
  return collapsed.slice(0, maxExcerpts).map((off) => {
    const start = Math.max(0, off - 100);
    const end   = Math.min(text.length, off + 200);
    let excerpt = text.slice(start, end).trim();
    if (start > 0) excerpt = "…" + excerpt;
    if (end < text.length) excerpt = excerpt + "…";
    return { excerpt, offset: off };
  });
}

/** Fetch a URL and extract supporting evidence for a research query. Used
 *  by the PM during traction/market intel data entry AND by the generation
 *  engine during investor document creation. */
export async function bsResearchFetch(body: any): Promise<any> {
  const { url, query, allowUntrusted, untrustedReason } = body;
  if (!url)   return { success: false, error: "url required" };
  if (!query) return { success: false, error: "query required (what are you looking for in this page?)" };

  const { trusted, domain } = isDomainTrusted(url);
  if (!trusted && !allowUntrusted) {
    return {
      success: false,
      error: `Source not on trusted-domain allowlist for investor-grade research: ${domain}. Pass allowUntrusted=true with untrustedReason to override (and document why this source is acceptable).`,
      domain,
      trusted: false,
    };
  }

  const fetched = await fetchPageText(url);
  if (!fetched.text) {
    return { success: false, error: fetched.error || "no text extracted", domain, trusted, status: fetched.status };
  }

  const excerpts = extractExcerptsForQuery(fetched.text, query);

  return {
    success: true,
    url,
    domain,
    trusted,
    untrusted_reason: !trusted ? (untrustedReason || null) : null,
    title:    fetched.title,
    excerpts,
    word_count_extracted: fetched.text.split(/\s+/).length,
    full_text_preview: fetched.text.slice(0, 3000),
  };
}

/** Used during investor template generation — bulk fetch a list of URLs
 *  with the same query. Caps at 5 URLs to keep cost predictable. */
export async function bsResearchBulk(body: any): Promise<any> {
  const { urls, query, allowUntrusted } = body;
  if (!Array.isArray(urls) || !urls.length) return { success: false, error: "urls array required" };
  if (!query) return { success: false, error: "query required" };
  const capped = urls.slice(0, 5);
  const results: any[] = [];
  for (const url of capped) {
    const r = await bsResearchFetch({ url, query, allowUntrusted });
    results.push(r);
  }
  return { success: true, results };
}

/* ─── Dispatcher ──────────────────────────────────────────────── */

export async function handleBrandStudioInvestor(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "bs_list_traction":          return bsListTraction(body);
    case "bs_upsert_traction":        return bsUpsertTraction(body);
    case "bs_delete_traction":        return bsDeleteTraction(body);
    case "bs_list_market_intel":      return bsListMarketIntel(body);
    case "bs_upsert_market_intel":    return bsUpsertMarketIntel(body);
    case "bs_delete_market_intel":    return bsDeleteMarketIntel(body);
    case "bs_research_fetch":         return bsResearchFetch(body);
    case "bs_research_bulk":          return bsResearchBulk(body);
    default: return null;
  }
}
