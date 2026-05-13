/**
 * control.ts — merged: project-context + system-control
 * Routes by: action
 * Actions: get_context | get_state | log_change | check_fingerprint | save_with_fingerprint
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 60 };

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

/* ── Safe export ── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _controlHandler(req, res); }
  catch (e: any) { try { res.status(200).json({ error: e?.message || "unknown" }); } catch (_) {} }
}

async function _controlHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed" });

  const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co", process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder");
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
