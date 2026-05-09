import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { projectId } = req.body;
  if (!projectId) return res.status(400).json({ error: "Missing projectId" });

  const sb = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
  );

  const [projR, metR, audR, knwR, docR, cacheR] = await Promise.all([
    sb.from("projects").select("*").eq("id", projectId).single(),
    sb.from("metrics").select("*").eq("project_id", projectId).order("recorded_at", { ascending: false }).limit(3),
    sb.from("audit_reports").select("id,created_at,sections").eq("project_id", projectId).order("created_at", { ascending: false }).limit(3),
    sb.from("project_knowledge").select("*").eq("project_id", projectId),
    sb.from("project_documents").select("id,name,doc_type,extracted_data,source_date").eq("project_id", projectId).limit(10),
    sb.from("ai_content_cache").select("content_type,content,updated_at").eq("project_id", projectId),
  ]);

  const s = (v: any) => (v == null ? "" : String(v));
  const proj  = projR.data;
  const met   = metR.data?.[0] ?? null;
  const know  = knwR.data ?? [];
  const kMap: Record<string, Record<string, string>> = {};
  for (const r of know) {
    if (!kMap[r.category]) kMap[r.category] = {};
    kMap[r.category][r.field_key] = r.field_value || "";
  }

  const context = {
    /* Project basics */
    project: {
      name:        proj?.name        ?? "",
      url:         proj?.url         ?? "",
      keywords:    proj?.keywords    ?? [],
      competitors: proj?.competitors ?? [],
    },

    /* Goals */
    goals: {
      primary:    kMap.goal?.primary_goal      ?? "",
      timeline:   kMap.goal?.target_timeline   ?? "",
      success:    kMap.goal?.success_metric    ?? "",
      baseline:   kMap.goal?.current_baseline  ?? "",
      keywords:   kMap.goal?.target_keywords   ?? "",
    },

    /* CMS & Tech */
    tech: {
      cms:           kMap.cms?.cms          ?? "",
      version:       kMap.cms?.cms_version  ?? "",
      theme:         kMap.cms?.theme        ?? "",
      seoPlugin:     kMap.cms?.seo_plugin   ?? "",
      caching:       kMap.cms?.caching_plugin ?? "",
      hosting:       kMap.cms?.hosting      ?? "",
      otherPlugins:  kMap.cms?.other_plugins ?? "",
      pagespdMobile: kMap.cms?.pagespeed_mobile  ?? "",
      pagespdDesk:   kMap.cms?.pagespeed_desktop ?? "",
      ssl:           kMap.cms?.ssl          ?? "",
    },

    /* Analytics baseline */
    analytics: {
      organicMonthly:   kMap.analytics?.organic_sessions_monthly ?? "",
      baselineDate:     kMap.analytics?.organic_sessions_baseline_date ?? "",
      topPages:         kMap.analytics?.top_landing_pages ?? "",
      bounceRate:       kMap.analytics?.bounce_rate ?? "",
      gscImpressions:   kMap.analytics?.gsc_total_impressions ?? "",
      gscClicks:        kMap.analytics?.gsc_total_clicks ?? "",
      gscAvgPos:        kMap.analytics?.gsc_avg_position ?? "",
      conversions:      kMap.analytics?.conversions_monthly ?? "",
    },

    /* Technical state */
    technical: {
      pagesIndexed:   kMap.technical?.pages_indexed   ?? "",
      crawlErrors:    kMap.technical?.crawl_errors    ?? "",
      brokenLinks:    kMap.technical?.broken_links    ?? "",
      schema:         kMap.technical?.schema_markup   ?? "",
      sitemapUrl:     kMap.technical?.sitemap_url     ?? "",
      robotsTxt:      kMap.technical?.robots_txt      ?? "",
      canonicals:     kMap.technical?.canonical_issues ?? "",
    },

    /* Competitors */
    competitors: {
      c1:  kMap.competitor?.competitor_1    ?? "",
      c1dr:kMap.competitor?.competitor_1_dr ?? "",
      c2:  kMap.competitor?.competitor_2    ?? "",
      c2dr:kMap.competitor?.competitor_2_dr ?? "",
      ourDR:kMap.competitor?.our_domain_rating ?? "",
      ourRD:kMap.competitor?.our_referring_domains ?? "",
      gaps: kMap.competitor?.content_gap_keywords ?? "",
    },

    /* Live metrics */
    metrics: met ? {
      llmVisibility:    met.llm_visibility_score,
      algorithmHealth:  met.algorithm_health_score,
      eeat:             met.eeat_score,
      authority:        met.content_authority_score,
      growth:           met.overall_growth_score,
      indexed:          met.pages_indexed,
      submitted:        met.pages_submitted,
      mentions:         met.brand_mentions,
      perplexity:       met.perplexity_citations,
      googleAI:         met.google_ai_citations,
      chatgpt:          met.chatgpt_citations,
      recordedAt:       met.recorded_at,
    } : null,

    /* Audit summaries */
    audits: (audR.data ?? []).map((a: any) => ({
      date: (a.created_at ?? "").split("T")[0],
      sections: Object.fromEntries(
        Object.entries(a.sections ?? {}).map(([k, v]) => [k, s(v).slice(0, 400)])
      ),
    })),

    /* Extracted document data */
    documents: (docR.data ?? []).map((d: any) => ({
      name:      d.name,
      type:      d.doc_type,
      date:      d.source_date,
      summary:   d.extracted_data?.doc_summary ?? "",
      actions:   (d.extracted_data?.extracted?.action_items ?? []).slice(0, 5),
      metrics:   d.extracted_data?.extracted?.metrics ?? {},
    })),

    /* What's missing */
    gaps: {
      noGoal:       !kMap.goal?.primary_goal,
      noCMS:        !kMap.cms?.cms,
      noAnalytics:  !kMap.analytics?.organic_sessions_monthly,
      noTechnical:  !kMap.technical?.pages_indexed,
      noCompetitors:!kMap.competitor?.competitor_1,
      noMetrics:    !met,
      noDocuments:  (docR.data ?? []).length === 0,
    },
  };

  return res.status(200).json({ success: true, context });
}
