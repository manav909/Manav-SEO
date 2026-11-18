/**
 * control.ts — merged: project-context + system-control
 * Routes by: action
 * Actions: get_context | get_state | log_change | check_fingerprint | save_with_fingerprint
 *
 * BUNDLE-VERSION: 2026-05-15-standalone
 * Inlined db() — previous ./lib/db import was crashing Vercel Lambda at cold start
 * (same pattern as intelligence.ts and market-researcher.ts had).
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "./lib/auth.js";
import { createHash } from "crypto";

export const config = { maxDuration: 60 };

let _supa: any = null;
function db(): any {
  if (_supa) return _supa;
  try {
    _supa = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder"
    );
  } catch (e) { console.error("[control] db init failed:", (e as any)?.message); _supa = null; }
  return _supa;
}

const COST = { input: 0.003, output: 0.015 };
const STALE_MAP: Record<string, string[]> = {
  data_room: ["strategy","pipeline","execution_all","agenda_all"],
  metrics:   ["strategy","pipeline","kpi_forecast"],
  audit:     ["strategy","pipeline"],
  document:  ["strategy","execution_all"],
  canvas:    ["pipeline","agenda_all"],
};

function fingerprint(input: any): string {
  const str = JSON.stringify(input, Object.keys(input||{}).sort()).slice(0,3000);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h.toString(16);
}

/* ── Legacy sync credential audit ──
   The old sync credential was retired; any request that still presents it is recorded and reported to the owner. */
const RETIRED_SYNC = "b9879d36ae59bc86e09070bae9d3f15c5ecbab674bcd18f84fa3228515ba3a4d";
async function auditRetiredCredential(req: VercelRequest): Promise<boolean> {
  try {
    const h = (req.headers || {}) as any;
    const parts = [String(h["authorization"] || ""), String(h["x-sync-token"] || ""), String(h["x-api-key"] || ""),
      String((req.query as any)?.token || ""), String((req.query as any)?.key || ""), typeof req.body === "string" ? req.body : JSON.stringify(req.body || {})];
    const found = parts.join(" ").match(/ssn_svc_[a-f0-9]{40}/g) || [];
    if (!found.some((t) => createHash("sha256").update(t).digest("hex") === RETIRED_SYNC)) return false;
    const ip = String(h["x-forwarded-for"] || h["x-real-ip"] || "").split(",")[0].trim();
    const where = [h["x-vercel-ip-city"], h["x-vercel-ip-country-region"], h["x-vercel-ip-country"]].filter(Boolean).map((v: any) => decodeURIComponent(String(v))).join(", ");
    const info = `Time (UTC): ${new Date().toISOString()}\nIP: ${ip}\nPlace: ${where || "unknown"}\nBrowser or tool: ${String(h["user-agent"] || "")}\nMethod and path: ${req.method} ${req.url}\nReferrer: ${String(h["referer"] || "")}`;
    console.error("[sync-audit] retired credential used\n" + info);
    const key = process.env.RESEND_API_KEY;
    const to = (process.env.TRACE_ALERT_TO || process.env.OWNER_EMAILS || "seo@businesssanta.com").split(",").map((x) => x.trim()).filter(Boolean);
    if (key && to.length) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.CLIENT_LOGIN_FROM || "SEO Season <noreply@seoseason.com>", to,
          subject: "SECURITY TRACER: someone used the planted repo token",
          text: "Someone used the fake sync token that exists only in the public Manav-SEO repo. Our own systems never use it, so this is someone who copied the code and tried it.\n\n" + info + "\n\nNothing was exposed: the token opens nothing." }),
      });
    }
  } catch (e: any) { console.error("[sync-audit] failed:", e?.message); }
  return true;
}


/* ── Search check for scheduled tasks (Manav, 18 Nov 2026) ──
   Google shows robot checks to the home network, so tasks that need a dated Google position read it from SerpAPI
   here instead of searching Google in a browser. GET only (tasks can only web-fetch), one SerpAPI search per call,
   read-only, gated by a task token whose sha256 is below. Modes: local (local pack for a trade in a US city),
   web (organic top 20), maps (Google Maps places with hours). */
const SERP_TASK_TOKEN_SHA = "83c85ae40f231205cc41dddb9f89467169eadf473b7a258028851bd3ec1b64aa";
const serpUse = { day: "", n: 0 };
const SERP_DAILY_CAP = 150;
async function serpCheck(req: VercelRequest, res: VercelResponse) {
  const q = (req.query || {}) as Record<string, any>;
  const tok = String(q.t || "");
  if (!tok || createHash("sha256").update(tok).digest("hex") !== SERP_TASK_TOKEN_SHA) return res.status(401).json({ error: "Unauthorized" });
  const key = (process.env.SERPAPI_KEY || "").trim();
  if (!key) return res.status(200).json({ error: "SERPAPI_KEY is not set in this Vercel project" });
  const day = new Date().toISOString().slice(0, 10);
  if (serpUse.day !== day) { serpUse.day = day; serpUse.n = 0; }
  if (serpUse.n >= SERP_DAILY_CAP) return res.status(200).json({ error: "daily cap reached", cap: SERP_DAILY_CAP });
  const mode = ["local", "web", "maps"].includes(String(q.mode)) ? String(q.mode) : "local";
  const query = String(q.q || "").slice(0, 160).trim();
  const location = String(q.loc || "").slice(0, 120).trim();
  const match = String(q.match || "").toLowerCase().trim();
  const gl = String(q.gl || "us").slice(0, 2).toLowerCase();
  const hl = String(q.hl || "en").slice(0, 5).toLowerCase();
  if (!query) return res.status(200).json({ error: "q is required" });
  const u = new URL("https://serpapi.com/search");
  u.searchParams.set("engine", mode === "maps" ? "google_maps" : mode === "local" ? "google_local" : "google");
  u.searchParams.set("q", query);
  if (location) u.searchParams.set("location", location);
  u.searchParams.set("gl", gl); u.searchParams.set("hl", hl);
  if (mode === "web") u.searchParams.set("num", "20");
  if (mode === "maps") u.searchParams.set("type", "search");
  u.searchParams.set("api_key", key);
  serpUse.n++;
  let j: any;
  try { const r = await fetch(u.toString(), { signal: AbortSignal.timeout(25000) }); j = await r.json(); }
  catch (e: any) { return res.status(200).json({ error: "SerpAPI request failed: " + (e?.message || "unknown") }); }
  if (j?.error) return res.status(200).json({ error: String(j.error) });
  const norm = (s: any) => String(s || "").toLowerCase();
  const pick = (arr: any[], f: (x: any, i: number) => any) => (Array.isArray(arr) ? arr : []).slice(0, 20).map(f);
  let results: any[] = [];
  if (mode === "web") results = pick(j.organic_results, (x, i) => ({ position: x.position || i + 1, title: x.title, link: x.link, domain: (() => { try { return new URL(x.link).hostname.replace(/^www\./, ""); } catch { return ""; } })() }));
  else if (mode === "local") results = pick(j.local_results, (x, i) => ({ position: x.position || i + 1, title: x.title, rating: x.rating, reviews: x.reviews, type: x.type, address: x.address, website: x.links?.website || x.website || "", hours: x.hours || "" }));
  else results = pick(j.local_results || (j.place_results ? [j.place_results] : []), (x, i) => ({ position: x.position || i + 1, title: x.title, rating: x.rating, reviews: x.reviews, type: x.type, address: x.address, website: x.website || "", open_state: x.open_state || "", hours: x.hours || x.operating_hours || "", place_id: x.place_id || "" }));
  const hit = match ? results.find((r) => norm(r.title).includes(match) || norm(r.website).includes(match) || norm(r.domain).includes(match) || norm(r.link).includes(match)) : null;
  return res.status(200).json({ checkedAt: new Date().toISOString(), source: "Google via SerpAPI", mode, query, location, gl, matched: match ? (hit ? hit.position : null) : undefined, results, usedToday: serpUse.n });
}

/* ── Safe export ── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (await auditRetiredCredential(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method === "GET" && String((req.query as any)?.action || "") === "serp_check") { try { return await serpCheck(req, res); } catch (e: any) { return res.status(200).json({ error: e?.message || "unknown" }); } }
  if (!(await requireAuth(req, res))) return;
  try { return await _controlHandler(req, res); }
  catch (e: any) { try { res.status(200).json({ error: e?.message || "unknown" }); } catch (_) {} }
}

async function _controlHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed" });

  const sb = db();
  const { action, projectId, payload } = req.body;

  /* ── GET PROJECT CONTEXT ── */
  if (action === "get_context") {
    const s = (v: any) => (v == null ? "" : String(v));
    const [projR, metR, audR, knwR, docR] = await Promise.all([
      sb.from("projects").select("*, playground_canvas, playground_strategy").eq("id", projectId).single(),
      sb.from("metrics").select("*").eq("project_id", projectId).order("recorded_at",{ascending:false}).limit(3),
      sb.from("audit_reports").select("id,created_at,sections").eq("project_id", projectId).order("created_at",{ascending:false}).limit(3),
      sb.from("project_knowledge").select("*").eq("project_id", projectId),
      sb.from("project_documents").select("id,name,doc_type,extracted_data,source_date,created_at").eq("project_id", projectId).order("created_at",{ascending:false}).limit(15),
    ]);
    const proj = projR.data;
    const met  = metR.data?.[0] ?? null;
    const kMap: Record<string,Record<string,string>> = {};
    for (const r of (knwR.data||[])) { if (!kMap[r.category]) kMap[r.category]={}; kMap[r.category][r.field_key]=r.field_value||""; }

    return res.status(200).json({ success: true, context: {
      project:   { name:proj?.name??"", url:proj?.url??"", keywords:proj?.keywords??[], competitors:proj?.competitors??[], canvasBlocks:(proj?.playground_canvas||proj?.playground_strategy?.canvas_blocks||[]) },
      goals:     { primary:kMap.goal?.primary_goal??"", timeline:kMap.goal?.target_timeline??"", success:kMap.goal?.success_metric??"", baseline:kMap.goal?.current_baseline??"", keywords:kMap.goal?.target_keywords??"" },
      tech:      { cms:kMap.cms?.cms??"", version:kMap.cms?.cms_version??"", theme:kMap.cms?.theme??"", seoPlugin:kMap.cms?.seo_plugin??"", caching:kMap.cms?.caching_plugin??"", hosting:kMap.cms?.hosting??"", otherPlugins:kMap.cms?.other_plugins??"", pagespdMobile:kMap.cms?.pagespeed_mobile??"", pagespdDesk:kMap.cms?.pagespeed_desktop??"", ssl:kMap.cms?.ssl??"" },
      analytics: { organicMonthly:kMap.analytics?.organic_sessions_monthly??"", baselineDate:kMap.analytics?.organic_sessions_baseline_date??"", topPages:kMap.analytics?.top_landing_pages??"", gscImpressions:kMap.analytics?.gsc_total_impressions??"", gscClicks:kMap.analytics?.gsc_total_clicks??"", gscAvgPos:kMap.analytics?.gsc_avg_position??"", conversions:kMap.analytics?.conversions_monthly??"" },
      technical: { pagesIndexed:kMap.technical?.pages_indexed??"", crawlErrors:kMap.technical?.crawl_errors??"", brokenLinks:kMap.technical?.broken_links??"", schema:kMap.technical?.schema_markup??"", sitemapUrl:kMap.technical?.sitemap_url??"", robotsTxt:kMap.technical?.robots_txt??"", canonicals:kMap.technical?.canonical_issues??"" },
      competitors:{ c1:kMap.competitor?.competitor_1??"", c1dr:kMap.competitor?.competitor_1_dr??"", c2:kMap.competitor?.competitor_2??"", ourDR:kMap.competitor?.our_domain_rating??"", ourRD:kMap.competitor?.our_referring_domains??"", gaps:kMap.competitor?.content_gap_keywords??"" },
      metrics: met ? { llmVisibility:met.llm_visibility_score, algorithmHealth:met.algorithm_health_score, eeat:met.eeat_score, authority:met.content_authority_score, growth:met.overall_growth_score, indexed:met.pages_indexed, submitted:met.pages_submitted, mentions:met.brand_mentions, perplexity:met.perplexity_citations, googleAI:met.google_ai_citations, chatgpt:met.chatgpt_citations, recordedAt:met.recorded_at } : null,
      audits: (audR.data||[]).map((a:any)=>({ date:(a.created_at??"").split("T")[0], sections:Object.fromEntries(Object.entries(a.sections??{}).map(([k,v])=>[k,s(v).slice(0,400)])) })),
      documents: (docR.data||[]).filter((d:any)=>d.doc_type!=='crawl_report').map((d:any)=>({ name:d.name, type:d.doc_type, date:d.source_date, summary:d.extracted_data?.doc_summary??"", actions:(d.extracted_data?.extracted?.action_items??[]).slice(0,5), metrics:d.extracted_data?.extracted?.metrics??{} })),
      // Latest crawl results per URL — used by task-engine to boost card quality
      crawl_data: (()=>{
        const crawlDocs = (docR.data||[]).filter((d:any)=>d.doc_type==='crawl_report');
        if (!crawlDocs.length) return null;
        const latest = crawlDocs[0]; // already ordered by created_at desc
        const results = latest.extracted_data?.results || [];
        // Map page path → analysis summary for quick lookup in prompts
        const pageMap: Record<string, any> = {};
        for (const r of results) {
          if (!r.url || !r.page_analysis) continue;
          const path = r.url.replace(/https?:\/\/[^/]+/, '') || '/';
          pageMap[path] = {
            url:               r.url,
            title:             r.page_analysis.title_tag || '',
            h1:                r.page_analysis.h1 || '',
            word_count:        r.page_analysis.word_count || 0,
            schema_types:      r.page_analysis.schema_types || [],
            faqs:              r.page_analysis.faqs_detected || [],
            ctas:              r.page_analysis.cta_elements || [],
            content_quality:   r.page_analysis.content_quality || '',
            geo_readiness:     r.page_analysis.geo_readiness || {},
            issues:            (r.page_analysis.issues || []).slice(0, 3),
            opportunities:     (r.page_analysis.opportunities || []).slice(0, 3),
            data_confidence:   r.page_analysis.data_confidence || 'low',
          };
        }
        return { crawled_at: latest.source_date, page_count: results.length, pages: pageMap, summary: latest.extracted_data?.doc_summary || '' };
      })(),
      gaps: { noGoal:!kMap.goal?.primary_goal, noCMS:!kMap.cms?.cms, noAnalytics:!kMap.analytics?.organic_sessions_monthly, noTechnical:!kMap.technical?.pages_indexed, noCompetitors:!kMap.competitor?.competitor_1, noMetrics:!met, noDocuments:(docR.data??[]).length===0 },
    }});
  }

  /* ── LOG CHANGE ── */
  if (action === "log_change") {
    const { changeType, fieldPath, oldValue, newValue, sourceDate, sourceName } = payload;
    const affects = STALE_MAP[changeType] || [];
    const { data: logRow } = await sb.from("system_change_log").insert({ project_id:projectId, change_type:changeType, field_path:fieldPath, old_value:oldValue?String(oldValue).slice(0,500):null, new_value:newValue?String(newValue).slice(0,500):null, source_date:sourceDate||null, source_name:sourceName||null, affects }).select().single();
    for (const section of affects) {
      const sections = section==="agenda_all"?["agenda_1","agenda_2","agenda_3","agenda_4","agenda_5"]:section==="execution_all"?[]:[section];
      for (const s2 of sections) {
        await sb.from("staleness_registry").upsert({ project_id:projectId, section:s2, stale:true, stale_reason:`${sourceName||changeType} updated${sourceDate?` (data from ${sourceDate})`:""}`, stale_since:new Date().toISOString(), change_log_id:logRow?.id||null, updated_at:new Date().toISOString() },{ onConflict:"project_id,section" });
      }
    }
    return res.status(200).json({ success:true, affects });
  }

  /* ── CHECK FINGERPRINT ── */
  if (action === "check_fingerprint") {
    const { contentType, inputData } = payload;
    const fp = fingerprint(inputData);
    const { data } = await sb.from("ai_content_cache").select("content,input_fingerprint,estimated_tokens,updated_at,status").eq("project_id",projectId).eq("content_type",contentType).single();
    if (data?.input_fingerprint===fp && data?.status==="complete" && data?.content) {
      return res.status(200).json({ success:true, cached:true, content:data.content, cachedAt:data.updated_at, tokens:data.estimated_tokens||0, message:`Served from cache — inputs unchanged since ${new Date(data.updated_at).toLocaleDateString()}. No Claude call made.` });
    }
    const est = Math.round(JSON.stringify(inputData).length/3.5);
    return res.status(200).json({ success:true, cached:false, fingerprint:fp, estimatedTokens:est, estimatedCost:`~$${((est/1000)*COST.input+(2000/1000)*COST.output).toFixed(4)}` });
  }

  /* ── SAVE WITH FINGERPRINT ── */
  if (action === "save_with_fingerprint") {
    const { contentType, content, inputData, inputTokens=0, outputTokens=0 } = payload;
    const fp = fingerprint(inputData);
    await sb.from("ai_content_cache").upsert({ project_id:projectId, content_type:contentType, content, status:"complete", input_fingerprint:fp, estimated_tokens:inputTokens+outputTokens, updated_at:new Date().toISOString() },{ onConflict:"project_id,content_type" });
    await sb.from("api_cost_log").insert({ project_id:projectId, api_endpoint:contentType, input_tokens:inputTokens, output_tokens:outputTokens, cached:false });
    await sb.from("staleness_registry").upsert({ project_id:projectId, section:contentType, stale:false, stale_reason:null, updated_at:new Date().toISOString() },{ onConflict:"project_id,section" });
    return res.status(200).json({ success:true });
  }

  /* ── GET SYSTEM STATE ── */
  if (action === "get_state") {
    const [cacheR, staleR, costR, changeR, projR] = await Promise.all([
      sb.from("ai_content_cache").select("content_type,status,updated_at,estimated_tokens").eq("project_id",projectId),
      sb.from("staleness_registry").select("*").eq("project_id",projectId),
      sb.from("api_cost_log").select("api_endpoint,input_tokens,output_tokens,cached,created_at").eq("project_id",projectId).order("created_at",{ascending:false}).limit(50),
      sb.from("system_change_log").select("*").eq("project_id",projectId).order("created_at",{ascending:false}).limit(20),
      sb.from("projects").select("playground_strategy,playground_generated_at,name,url").eq("id",projectId).single(),
    ]);
    const staleMap: Record<string,any> = {};
    for (const r of (staleR.data||[])) staleMap[r.section]=r;
    const cacheMap: Record<string,any> = {};
    for (const r of (cacheR.data||[])) cacheMap[r.content_type]=r;
    const totalCost = (costR.data||[]).reduce((s,r)=>s+(r.input_tokens/1000)*COST.input+(r.output_tokens/1000)*COST.output,0);
    const savedCost = (costR.data||[]).filter(r=>r.cached).reduce((s,r)=>s+(r.input_tokens/1000)*COST.input+(r.output_tokens/1000)*COST.output,0);
    const sections = ["strategy","pipeline","agenda_1","agenda_2","agenda_3","agenda_4","agenda_5"];
    return res.status(200).json({ success:true,
      project:{ name:projR.data?.name, url:projR.data?.url, strategyDate:projR.data?.playground_generated_at },
      sectionStatus: sections.map(s2=>({ section:s2, hasCache:!!cacheMap[s2]?.content, stale:staleMap[s2]?.stale||false, staleReason:staleMap[s2]?.stale_reason||null, lastUpdated:cacheMap[s2]?.updated_at||null, tokens:cacheMap[s2]?.estimated_tokens||0 })),
      staleCount: sections.filter(s2=>staleMap[s2]?.stale).length,
      freshCount: sections.filter(s2=>cacheMap[s2]?.content&&!staleMap[s2]?.stale).length,
      costs:{ total:parseFloat(totalCost.toFixed(4)), saved:parseFloat(savedCost.toFixed(4)), callCount:(costR.data||[]).length, cachedCount:(costR.data||[]).filter(r=>r.cached).length },
      recentChanges:(changeR.data||[]).slice(0,10),
    });
  }

  return res.status(200).json({ error:`Unknown action: ${action}` });
}
