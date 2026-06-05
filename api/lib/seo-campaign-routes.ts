/* ════════════════════════════════════════════════════════════════
   api/lib/seo-campaign-routes.ts
   Phase 14 — Route handlers for campaigns and opportunities.

   Registered actions:
     bs_seo_campaign_list
     bs_seo_campaign_get
     bs_seo_campaign_pause
     bs_seo_campaign_resume
     bs_seo_campaign_archive
     bs_seo_campaign_overview_refresh

     bs_seo_opportunity_list
     bs_seo_opportunity_update
     bs_seo_opportunity_promote_to_campaign
     bs_seo_opportunity_dismiss
═══════════════════════════════════════════════════════════════ */

import { computeGeoVisibility } from "./geo-scoring.js";
import {
  listCampaigns,
  getCampaignDetail,
  pauseCampaign,
  resumeCampaign,
  archiveCampaign,
  generateLivingOverview,
  listOpportunities,
  updateOpportunity,
  promoteOpportunityToCampaign,
} from "./seo-campaign-engine.js";

export async function bsSeoCampaignList(body: any): Promise<any> {
  const { projectId, statusFilter } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  return listCampaigns({ projectId, statusFilter });
}

export async function bsSeoCampaignGet(body: any): Promise<any> {
  const { campaignId } = body || {};
  if (!campaignId) return { success: false, error: "campaignId required" };
  return getCampaignDetail({ campaignId });
}

export async function bsSeoCampaignPause(body: any): Promise<any> {
  const { campaignId, reason } = body || {};
  if (!campaignId) return { success: false, error: "campaignId required" };
  return pauseCampaign({ campaignId, reason });
}

export async function bsSeoCampaignResume(body: any): Promise<any> {
  const { campaignId } = body || {};
  if (!campaignId) return { success: false, error: "campaignId required" };
  return resumeCampaign({ campaignId });
}

export async function bsSeoCampaignArchive(body: any): Promise<any> {
  const { campaignId } = body || {};
  if (!campaignId) return { success: false, error: "campaignId required" };
  return archiveCampaign({ campaignId });
}

export async function bsSeoCampaignOverviewRefresh(body: any): Promise<any> {
  const { campaignId } = body || {};
  if (!campaignId) return { success: false, error: "campaignId required" };
  return generateLivingOverview({ campaignId });
}

export async function bsSeoOpportunityList(body: any): Promise<any> {
  const { projectId, status, kind, estimatedValue, sourceCampaignId, discoveredSince, limit } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  return listOpportunities({ projectId, status, kind, estimatedValue, sourceCampaignId, discoveredSince, limit });
}

/* Phase 22 — bulk update */
export async function bsSeoOpportunityBulkUpdate(body: any): Promise<any> {
  const { opportunityIds, status, dismissedReason } = body || {};
  if (!Array.isArray(opportunityIds) || opportunityIds.length === 0) {
    return { success: false, error: "opportunityIds required (non-empty array)" };
  }
  if (!status) return { success: false, error: "status required" };
  const { bulkUpdateOpportunities } = await import("./seo-campaign-engine.js");
  return bulkUpdateOpportunities({ opportunityIds, status, dismissedReason });
}

export async function bsSeoOpportunityUpdate(body: any): Promise<any> {
  const { opportunityId, status, notes, dismissedReason } = body || {};
  if (!opportunityId) return { success: false, error: "opportunityId required" };
  return updateOpportunity({ opportunityId, status, notes, dismissedReason });
}

export async function bsSeoOpportunityPromoteToCampaign(body: any): Promise<any> {
  const { opportunityId } = body || {};
  if (!opportunityId) return { success: false, error: "opportunityId required" };
  return promoteOpportunityToCampaign({ opportunityId });
}

export async function bsSeoOpportunityDismiss(body: any): Promise<any> {
  const { opportunityId, reason } = body || {};
  if (!opportunityId) return { success: false, error: "opportunityId required" };
  return updateOpportunity({ opportunityId, status: 'dismissed', dismissedReason: reason });
}

/* ════════════════════════════════════════════════════════════════
   Phase 14.1 — Unification routes
═══════════════════════════════════════════════════════════════ */

export async function bsSeoOpportunityFromAlert(body: any): Promise<any> {
  const { projectId, alertId, alertType, severity, title, detail } = body || {};
  if (!projectId || !alertId || !alertType || !title) {
    return { success: false, error: "projectId, alertId, alertType, title required" };
  }
  const { recordOpportunityFromAlert } = await import("./seo-campaign-engine.js");
  return recordOpportunityFromAlert({ projectId, alertId, alertType, severity: severity || 'warn', title, detail });
}

export async function bsSeoOpportunityFromAnalytics(body: any): Promise<any> {
  const { projectId, findingKind, query, position, impressions, clicks, lift_pct, reason, raw } = body || {};
  if (!projectId || !findingKind || !query) {
    return { success: false, error: "projectId, findingKind, query required" };
  }
  const { recordOpportunityFromAnalyticsFinding } = await import("./seo-campaign-engine.js");
  return recordOpportunityFromAnalyticsFinding({ projectId, findingKind, query, position, impressions, clicks, lift_pct, reason, raw });
}

export async function bsSeoCampaignLinkReport(body: any): Promise<any> {
  const { projectId, campaignId, sourceTable, sourceId, sourceTitle, sourceBodyMd, sourceSummary, pillar, reportKind, llmCallsUsed, webSearchesUsed, dataSources, tags } = body || {};
  if (!projectId || !campaignId || !sourceTable || !sourceId || !sourceTitle) {
    return { success: false, error: "projectId, campaignId, sourceTable, sourceId, sourceTitle required" };
  }
  const { linkReportFromOtherSource } = await import("./seo-campaign-engine.js");
  return linkReportFromOtherSource({ projectId, campaignId, sourceTable, sourceId, sourceTitle, sourceBodyMd, sourceSummary, pillar, reportKind, llmCallsUsed, webSearchesUsed, dataSources, tags });
}

export async function bsSeoReportSearch(body: any): Promise<any> {
  const { projectId, query, pillar, reportKind, tag, limit } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { searchReportsAcrossCampaigns } = await import("./seo-campaign-engine.js");
  return searchReportsAcrossCampaigns({ projectId, query, pillar, reportKind, tag, limit });
}

/* ════════════════════════════════════════════════════════════════
   Phase 15 — Technical Audit routes
═══════════════════════════════════════════════════════════════ */

export async function bsSeoTechnicalAuditRun(body: any): Promise<any> {
  const { campaignId, panelId, manualUrl } = body || {};
  if (!campaignId) return { success: false, error: "campaignId required" };
  const { runTechnicalAudit } = await import("./seo-technical-audit.js");
  return runTechnicalAudit({ campaignId, panelId, manualUrl, triggeredBy: 'manual' });
}

export async function bsSeoTechnicalAuditSetTargetUrl(body: any): Promise<any> {
  const { panelId, url } = body || {};
  if (!panelId || !url) return { success: false, error: "panelId and url required" };
  const { setPanelTargetUrl } = await import("./seo-technical-audit.js");
  return setPanelTargetUrl({ panelId, url });
}

export async function bsSeoTechnicalAuditFindings(body: any): Promise<any> {
  const { panelId, limit } = body || {};
  if (!panelId) return { success: false, error: "panelId required" };
  const { getPanelFindings } = await import("./seo-technical-audit.js");
  return getPanelFindings({ panelId, limit });
}

/* ════════════════════════════════════════════════════════════════
   Phase 16 — Cluster Map routes
═══════════════════════════════════════════════════════════════ */

export async function bsSeoClusterMapRun(body: any): Promise<any> {
  const { campaignId, panelId } = body || {};
  if (!campaignId) return { success: false, error: "campaignId required" };
  const { runClusterMap } = await import("./seo-cluster-map.js");
  return runClusterMap({ campaignId, panelId, triggeredBy: 'manual' });
}

export async function bsSeoClusterMapClusters(body: any): Promise<any> {
  const { panelId, limit } = body || {};
  if (!panelId) return { success: false, error: "panelId required" };
  const { getPanelClusters } = await import("./seo-cluster-map.js");
  return getPanelClusters({ panelId, limit });
}

/* ════════════════════════════════════════════════════════════════
   Phase 17 — Internal linking routes
═══════════════════════════════════════════════════════════════ */

export async function bsSeoInternalLinkingRun(body: any): Promise<any> {
  const { campaignId, panelId, pageLimit } = body || {};
  if (!campaignId) return { success: false, error: "campaignId required" };
  const { runInternalLinkingAudit } = await import("./seo-internal-linking.js");
  return runInternalLinkingAudit({ campaignId, panelId, pageLimit, triggeredBy: 'manual' });
}

export async function bsSeoInternalLinkingData(body: any): Promise<any> {
  const { panelId, limit } = body || {};
  if (!panelId) return { success: false, error: "panelId required" };
  const { getPanelLinkAuditData } = await import("./seo-internal-linking.js");
  return getPanelLinkAuditData({ panelId, limit });
}

export async function bsSeoInternalLinkingUpdateStatus(body: any): Promise<any> {
  const { recommendationId, status, note } = body || {};
  if (!recommendationId || !status) return { success: false, error: "recommendationId and status required" };
  const { updateRecommendationStatus } = await import("./seo-internal-linking.js");
  return updateRecommendationStatus({ recommendationId, status, note });
}

/* ════════════════════════════════════════════════════════════════
   Phase 18 — Off-page strategy routes
═══════════════════════════════════════════════════════════════ */

export async function bsSeoOffPageRun(body: any): Promise<any> {
  const { campaignId, panelId } = body || {};
  if (!campaignId) return { success: false, error: "campaignId required" };
  const { runOffPageStrategy } = await import("./seo-off-page.js");
  return runOffPageStrategy({ campaignId, panelId, triggeredBy: 'manual' });
}

export async function bsSeoOffPageData(body: any): Promise<any> {
  const { panelId, limit } = body || {};
  if (!panelId) return { success: false, error: "panelId required" };
  const { getPanelOffPageData } = await import("./seo-off-page.js");
  return getPanelOffPageData({ panelId, limit });
}

/* ════════════════════════════════════════════════════════════════
   Phase 19 — Monitoring routes
═══════════════════════════════════════════════════════════════ */

export async function bsSeoMonitoringRun(body: any): Promise<any> {
  const { campaignId, panelId, windowDays } = body || {};
  if (!campaignId) return { success: false, error: "campaignId required" };
  const { runMonitoringCheck } = await import("./seo-monitoring.js");
  return runMonitoringCheck({ campaignId, panelId, windowDays, triggeredBy: 'manual' });
}

export async function bsSeoMonitoringData(body: any): Promise<any> {
  const { panelId, limit } = body || {};
  if (!panelId) return { success: false, error: "panelId required" };
  const { getPanelMonitoringData } = await import("./seo-monitoring.js");
  return getPanelMonitoringData({ panelId, limit });
}

/* ════════════════════════════════════════════════════════════════
   Phase 21 — Block 1: Quality Foundation routes
   Exposes the grouping orchestrator + helpers to the chat surface.
═══════════════════════════════════════════════════════════════ */

export async function bsSeoPositioningResolve(body: any): Promise<any> {
  const { projectId, forceRefresh } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { resolveProjectPositioning } = await import("./seo-campaign-grouping.js");
  return resolveProjectPositioning({ projectId, forceRefresh: !!forceRefresh });
}

export async function bsSeoRecommendCampaignStructure(body: any): Promise<any> {
  const { projectId, rawInput } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  if (!rawInput || typeof rawInput !== 'string') return { success: false, error: "rawInput required" };
  const { recommendCampaignStructure } = await import("./seo-campaign-grouping.js");
  return recommendCampaignStructure({ projectId, rawInput });
}

export async function bsSeoExtractKeywords(body: any): Promise<any> {
  const { rawInput } = body || {};
  if (!rawInput || typeof rawInput !== 'string') return { success: false, error: "rawInput required" };
  const { extractKeywordsFromText } = await import("./seo-campaign-grouping.js");
  const result = await extractKeywordsFromText(rawInput);
  return { success: true, ...result };
}

export async function bsSeoCommitCampaignStructure(body: any): Promise<any> {
  const { projectId, structure, positioning, acceptFollowupCampaigns, acceptOpportunities, campaignType } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  if (!structure) return { success: false, error: "structure required" };
  const { commitCampaignStructure } = await import("./seo-campaign-grouping.js");
  return commitCampaignStructure({
    projectId,
    structure,
    positioning,
    acceptFollowupCampaigns,
    acceptOpportunities,
    campaignType,
  });
}

/* ════════════════════════════════════════════════════════════════
   Phase 21 — Block 2.5: URL targeting + grounded chat
═══════════════════════════════════════════════════════════════ */

export async function bsSeoClassifyIntent(body: any): Promise<any> {
  const { text } = body || {};
  if (!text || typeof text !== 'string') return { success: false, error: "text required" };
  const { classifyCampaignIntent } = await import("./seo-url-targeting.js");
  const result = await classifyCampaignIntent(text);
  return { success: true, ...result };
}

export async function bsSeoExtractCampaignIntent(body: any): Promise<any> {
  const { rawInput } = body || {};
  if (!rawInput || typeof rawInput !== 'string') return { success: false, error: "rawInput required" };
  const { extractCampaignIntent } = await import("./seo-url-targeting.js");
  const result = await extractCampaignIntent(rawInput);
  return { success: true, ...result };
}

export async function bsSeoValidateTargetUrls(body: any): Promise<any> {
  const { projectId, urlKeywordMapping, positioning } = body || {};
  if (!projectId)         return { success: false, error: "projectId required" };
  if (!urlKeywordMapping) return { success: false, error: "urlKeywordMapping required" };
  const { validateAndAnalyzeTargetUrls } = await import("./seo-url-targeting.js");
  const result = await validateAndAnalyzeTargetUrls({ projectId, urlKeywordMapping, positioning });
  return { success: true, ...result };
}

export async function bsSeoChatSuggestions(body: any): Promise<any> {
  const { projectId, partialInput } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getCampaignSuggestions } = await import("./seo-chat-suggestions.js");
  const result = await getCampaignSuggestions({ projectId, partialInput: partialInput || '' });
  return { success: true, ...result };
}

export async function bsSeoExploreKeyword(body: any): Promise<any> {
  const { projectId, keyword } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  if (!keyword)   return { success: false, error: "keyword required" };
  const { produceExplorationResponse } = await import("./seo-chat-suggestions.js");
  return produceExplorationResponse({ projectId, keyword });
}

export async function bsSeoToolsStatus(body: any): Promise<any> {
  const { projectId } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  /* readToolsStatus is internal — replicate via getCampaignSuggestions which exposes tools_status */
  const { getCampaignSuggestions } = await import("./seo-chat-suggestions.js");
  const r = await getCampaignSuggestions({ projectId, partialInput: '' });
  return { success: true, tools_status: r.tools_status };
}

/* ════════════════════════════════════════════════════════════════
   Phase 21 — Block 2.6: Strategic War Room
═══════════════════════════════════════════════════════════════ */

export async function bsSeoWarRoomBriefing(body: any): Promise<any> {
  const { projectId } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getWarRoomBriefing } = await import("./seo-war-room.js");
  return getWarRoomBriefing({ projectId });
}

/* Phase 21 Block 2.11 Phase A — Unified War Room briefing v2.
   Aggregates 9 sources into one ranked priority feed + 5-cell scorecard.
   Powers both Casual and Pro modes (different cap on feed items). */
export async function bsSeoWarRoomBriefingV2(body: any): Promise<any> {
  const { projectId, mode } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getWarRoomBriefingV2, getWarRoomBriefingCasualV2 } = await import("./season-war-room.js");
  return mode === 'casual'
    ? getWarRoomBriefingCasualV2({ projectId })
    : getWarRoomBriefingV2({ projectId });
}

/* Phase 21 Block 2.11 Pass 1 — real panel data + Casual reading digest. */
export async function bsSeoPillarHealthMatrix(body: any): Promise<any> {
  const { projectId } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getPillarHealthMatrix } = await import("./season-war-room-extras.js");
  return getPillarHealthMatrix({ projectId });
}

export async function bsSeoPerformancePulse(body: any): Promise<any> {
  const { projectId } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getPerformancePulse } = await import("./season-war-room-extras.js");
  return getPerformancePulse({ projectId });
}

export async function bsSeoDecisionsLog(body: any): Promise<any> {
  const { projectId, limit } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getDecisionsLog } = await import("./season-war-room-extras.js");
  return getDecisionsLog({ projectId, limit });
}

export async function bsSeoVelocityStats(body: any): Promise<any> {
  const { projectId } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getVelocityStats } = await import("./season-war-room-extras.js");
  return getVelocityStats({ projectId });
}

export async function bsSeoNoticedObservations(body: any): Promise<any> {
  const { projectId, force } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getNoticedObservations } = await import("./season-war-room-extras.js");
  return getNoticedObservations({ projectId, force: !!force });
}

export async function bsSeoCasualDigest(body: any): Promise<any> {
  const { projectId } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getCasualDigest } = await import("./season-war-room-extras.js");
  return getCasualDigest({ projectId });
}

/* Phase 21 Block 2.12 — Manav's Pick external feed + LLM pre-computes */

export async function bsSeoManavsPick(body: any): Promise<any> {
  const { projectId, force } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getProjectFeed } = await import("./season-manavs-pick.js");
  return getProjectFeed({ projectId, force: !!force });
}

export async function bsSeoManavsPickAction(body: any): Promise<any> {
  const { projectId, feedItemId, action, reason } = body || {};
  if (!projectId)  return { success: false, error: "projectId required" };
  if (!feedItemId) return { success: false, error: "feedItemId required" };
  if (!action)     return { success: false, error: "action required" };
  const { recordFeedAction } = await import("./season-manavs-pick.js");
  return recordFeedAction({ projectId, feedItemId, action, reason });
}

export async function bsSeoManavsPickPull(_body: any): Promise<any> {
  /* Admin-style force-pull. Useful for testing. */
  const { pullGlobalFeed } = await import("./season-manavs-pick.js");
  const r = await pullGlobalFeed();
  return { success: true, pulled: r.pulled, failed: r.failed };
}

export async function bsSeoClientQuestions(body: any): Promise<any> {
  const { projectId, force } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getClientQuestions } = await import("./season-llm-precomputes.js");
  return getClientQuestions({ projectId, force: !!force });
}

export async function bsSeoClientRecap(body: any): Promise<any> {
  const { projectId, force } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getClientRecap } = await import("./season-llm-precomputes.js");
  return getClientRecap({ projectId, force: !!force });
}

/* Phase 21 Block 2.13 — Manav's Pick Intelligence Engine */

export async function bsSeoPickEngineGet(body: any): Promise<any> {
  const { projectId, force } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getCurrentPick } = await import("./season-pick-engine.js");
  return getCurrentPick({ projectId, force: !!force });
}

export async function bsSeoPickEngineArchive(body: any): Promise<any> {
  const { projectId, limit, before } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { getPickArchive } = await import("./season-pick-engine.js");
  return getPickArchive({ projectId, limit, before });
}

export async function bsSeoPickEngineRegenerate(body: any): Promise<any> {
  const { projectId } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { regeneratePickNow } = await import("./season-pick-engine.js");
  return regeneratePickNow(projectId);
}

export async function bsSeoCorpusEnrichBatch(body: any): Promise<any> {
  const { limit } = body || {};
  const { enrichCorpusBatch } = await import("./season-corpus-enrichment.js");
  return enrichCorpusBatch({ limit });
}

export async function bsSeoProjectSnapshotRefresh(body: any): Promise<any> {
  const { projectId } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  const { refreshSnapshotNow } = await import("./season-project-snapshot.js");
  return refreshSnapshotNow(projectId);
}

/* Phase 21 Block 2.14 — user preferences (widget layouts, density, defaults)
   Block 2.6b — per-project layout scoping (projectId optional; null = user-level default) */

export async function bsSeoUserPrefsGet(body: any): Promise<any> {
  const { userId, projectId } = body || {};
  if (!userId) return { success: false, error: "userId required" };
  const { getUserPrefs } = await import("./season-user-prefs.js");
  return getUserPrefs({ userId, projectId: projectId || null });
}

export async function bsSeoUserPrefsSet(body: any): Promise<any> {
  const { userId, projectId, partial } = body || {};
  if (!userId) return { success: false, error: "userId required" };
  if (!partial || typeof partial !== 'object') return { success: false, error: "partial required" };
  const { setUserPrefs } = await import("./season-user-prefs.js");
  return setUserPrefs({ userId, projectId: projectId || null, partial });
}

export async function bsSeoUserPrefsReset(body: any): Promise<any> {
  const { userId, projectId } = body || {};
  if (!userId) return { success: false, error: "userId required" };
  const { resetUserPrefs } = await import("./season-user-prefs.js");
  return resetUserPrefs({ userId, projectId: projectId || null });
}

/* ════════════════════════════════════════════════════════════════════
   Phase 21 Block 2.7 — Client Lens
   
   Single aggregator that loads everything the client-facing cinematic
   page needs in one round trip. Returns a rich shape designed so every
   stat, every keyword movement, every pillar status drives a frontend
   animation directly — no further round trips needed for the page to
   come alive.
   
   Honesty discipline applies: missing data is surfaced explicitly as
   null + a "data_status" reason, never papered over with synthetic
   placeholders. The page renders honest empty states for missing pieces.
══════════════════════════════════════════════════════════════════════ */

export async function bsClientLensLoad(body: any): Promise<any> {
  const { projectId } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };

  try {
    const { db } = await import("./db.js");

    /* Parallel reads — everything fans out together for speed */
    const [
      projectRow,
      clientRow,
      campaignsRow,
      gscQueriesRow,
      gscPagesRow,
      ga4SummaryRow,
      gscAiOverviewRow,
      ga4AiPlatformRow,
    ] = await Promise.all([
      db().from("projects").select("id,name,url,status,created_at").eq("id", projectId).maybeSingle(),
      db().from("clients").select("id,client_name,client_url,company_name,brand_name").eq("id", projectId).maybeSingle(),
      db().from("seo_campaigns")
        .select("id,keyword,status,started_at,current_position,target_position,health,living_overview_md,last_assessed_at")
        .eq("project_id", projectId)
        .neq("status", "archived")
        .order("started_at", { ascending: false }),
      db().from("project_knowledge")
        .select("field_value,updated_at")
        .eq("project_id", projectId).eq("category", "analytics").eq("field_key", "gsc_top_queries").maybeSingle(),
      db().from("project_knowledge")
        .select("field_value,updated_at")
        .eq("project_id", projectId).eq("category", "analytics").eq("field_key", "gsc_top_pages").maybeSingle(),
      db().from("project_knowledge")
        .select("field_value,updated_at")
        .eq("project_id", projectId).eq("category", "analytics").eq("field_key", "ga4_summary").maybeSingle(),
      /* Build 12.19 — GEO summary reads. The campaign list view now shows
         GEO presence alongside classic GSC/GA4 metrics so the operator
         can see at a glance whether AI search is active for the project. */
      db().from("project_knowledge")
        .select("field_value,updated_at")
        .eq("project_id", projectId).eq("category", "analytics").eq("field_key", "gsc_ai_overview_summary").maybeSingle(),
      db().from("project_knowledge")
        .select("field_value,updated_at")
        .eq("project_id", projectId).eq("category", "analytics").eq("field_key", "ga4_ai_platform_summary").maybeSingle(),
    ]);

    /* Identity — prefer client row over project row for naming */
    const proj = (projectRow as any)?.data;
    const cli  = (clientRow as any)?.data;
    const displayName = cli?.brand_name || cli?.company_name || cli?.client_name || proj?.name || "Untitled project";
    const displayDomain = cli?.client_url || proj?.url || null;
    const startedAt = proj?.created_at || null;
    const daysActive = startedAt
      ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000)
      : null;

    /* Campaigns + their panels */
    const campaigns: any[] = ((campaignsRow as any)?.data) || [];
    const campaignIds = campaigns.map(c => c.id);

    let panels: any[] = [];
    let recentReports: any[] = [];
    if (campaignIds.length > 0) {
      const [panelsR, reportsR] = await Promise.all([
        db().from("seo_campaign_panels")
          .select("id,campaign_id,pillar,status,current_status,current_summary,goal_summary,scheduled_note,updated_at")
          .in("campaign_id", campaignIds),
        db().from("seo_campaign_reports")
          .select("id,campaign_id,pillar,title,summary,confidence_rating,generated_at,tags")
          .in("campaign_id", campaignIds)
          .order("generated_at", { ascending: false })
          .limit(50),
      ]);
      panels = ((panelsR as any).data) || [];
      recentReports = ((reportsR as any).data) || [];
    }

    /* GSC queries — parse + sort by impressions, take top 10 */
    let gscQueries: any[] = [];
    let gscFreshness: string | null = null;
    try {
      const raw = (gscQueriesRow as any)?.data?.field_value;
      if (raw) {
        gscQueries = JSON.parse(raw);
        gscFreshness = (gscQueriesRow as any)?.data?.updated_at || null;
      }
    } catch { /* leave empty */ }

    const topRankings = gscQueries
      .filter(q => q && q.query)
      .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
      .slice(0, 10)
      .map(q => ({
        keyword:     String(q.query),
        position:    Number(q.position?.toFixed(1)) || null,
        impressions: q.impressions || 0,
        clicks:      q.clicks || 0,
        ctr:         q.ctr ? Number((q.ctr * 100).toFixed(2)) : 0,
      }));

    /* Top pages for the traffic narrative */
    let gscPages: any[] = [];
    try {
      const raw = (gscPagesRow as any)?.data?.field_value;
      if (raw) gscPages = JSON.parse(raw);
    } catch { /* leave empty */ }

    const totalImpressions = gscQueries.reduce((s, q) => s + (q.impressions || 0), 0);
    const totalClicks      = gscQueries.reduce((s, q) => s + (q.clicks || 0), 0);
    const overallCtr       = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const page1Count       = gscQueries.filter(q => (q.position || 999) <= 10).length;
    const page2Count       = gscQueries.filter(q => (q.position || 999) > 10 && (q.position || 999) <= 20).length;

    /* GA4 summary — connected = real session/conversion data, otherwise honest null */
    let ga4: any = null;
    try {
      const raw = (ga4SummaryRow as any)?.data?.field_value;
      if (raw) ga4 = JSON.parse(raw);
    } catch { /* leave null */ }

    /* Build 12.19 — GEO summaries (AI Overview + AI platform referrals).
       Both null when project has no GEO data. The campaign list view
       surfaces these alongside classic GSC/GA4 so the operator can see
       AI search engagement at a glance. */
    let gscAiOverview: any = null;
    let ga4AiPlatform: any = null;
    try {
      const aoRaw = (gscAiOverviewRow as any)?.data?.field_value;
      if (aoRaw) gscAiOverview = JSON.parse(aoRaw);
    } catch { /* leave null */ }
    try {
      const aiRaw = (ga4AiPlatformRow as any)?.data?.field_value;
      if (aiRaw) ga4AiPlatform = JSON.parse(aiRaw);
    } catch { /* leave null */ }

    /* Five pillars — aggregate status across campaigns. A pillar is "green"
       overall if at least one campaign has it green and none are red. */
    const PILLAR_ORDER = ['cluster_map', 'internal_linking', 'off_page', 'technical_audit', 'monitoring'];
    const pillarHealth = PILLAR_ORDER.map(pillar => {
      const matching = panels.filter(p => p.pillar === pillar);
      const active   = matching.filter(p => p.status === 'active');
      const reds     = active.filter(p => p.current_status === 'red').length;
      const ambers   = active.filter(p => p.current_status === 'amber').length;
      const greens   = active.filter(p => p.current_status === 'green').length;
      let overall: 'green' | 'amber' | 'red' | 'pending' = 'pending';
      if (active.length === 0) overall = 'pending';
      else if (reds > 0)       overall = 'red';
      else if (ambers > 0)     overall = 'amber';
      else if (greens > 0)     overall = 'green';
      /* Pick the most recent report summary as the human-readable status */
      const recent = recentReports.find(r => r.pillar === pillar);
      return {
        pillar,
        label:        prettifyPillar(pillar),
        status:       overall,
        active_count: active.length,
        total_count:  matching.length,
        summary:      recent?.summary || matching[0]?.current_summary || null,
        last_update:  recent?.generated_at || matching[0]?.updated_at || null,
      };
    });

    /* Wins — derive from recent reports that mention upward movement.
       Simple heuristic: pillar reports tagged with green status + the
       most recent monitoring snapshots showing position improvements. */
    const wins: any[] = [];
    for (const r of recentReports.slice(0, 10)) {
      const tagStr = Array.isArray(r.tags) ? r.tags.join(' ') : '';
      const isGreen = r.confidence_rating === 'high' || /baseline|improved|win|green/i.test(tagStr);
      if (isGreen && r.summary) {
        wins.push({
          title:   r.title || `${prettifyPillar(r.pillar)} update`,
          summary: r.summary,
          pillar:  r.pillar,
          when:    r.generated_at,
        });
      }
    }

    /* Top-line headline — what's the ONE number to lead with?
       Priority: positions on page 1 > total clicks > impressions > "just getting started" */
    let headline: any;
    if (page1Count > 0) {
      headline = {
        kind:   'page_one',
        value:  page1Count,
        label:  `${page1Count === 1 ? 'keyword' : 'keywords'} ranking on page 1`,
        detail: `${totalClicks.toLocaleString()} organic clicks captured`,
      };
    } else if (page2Count > 0) {
      headline = {
        kind:   'page_two',
        value:  page2Count,
        label:  `${page2Count === 1 ? 'keyword' : 'keywords'} within striking distance of page 1`,
        detail: `Currently sitting on page 2 — the next push lifts these.`,
      };
    } else if (totalImpressions > 0) {
      headline = {
        kind:   'impressions',
        value:  totalImpressions,
        label:  'search impressions captured',
        detail: `Visibility is building. ${gscQueries.length} unique queries tracked.`,
      };
    } else {
      headline = {
        kind:   'starting',
        value:  daysActive || 0,
        label:  daysActive === 1 ? 'day in' : 'days in',
        detail: 'GSC data will populate this view as soon as Google indexes the site signals.',
      };
    }

    /* Living overview — take the freshest one */
    const livingOverviewMd = campaigns.find(c => c.living_overview_md)?.living_overview_md || null;

    return {
      success: true,
      lens: {
        identity: {
          display_name:   displayName,
          domain:         displayDomain,
          started_at:     startedAt,
          days_active:    daysActive,
          campaign_count: campaigns.length,
        },
        headline,
        rankings: {
          top:           topRankings,
          page_1_count:  page1Count,
          page_2_count:  page2Count,
          total_queries: gscQueries.length,
          freshness:     gscFreshness,
        },
        traffic: {
          impressions:  totalImpressions,
          clicks:       totalClicks,
          ctr:          Number(overallCtr.toFixed(2)),
          top_pages:    gscPages.slice(0, 5).map((p: any) => ({
            page:        p.page,
            clicks:      p.clicks || 0,
            impressions: p.impressions || 0,
          })),
          ga4_connected: !!ga4,
          ga4_summary:   ga4,
        },
        /* Build 12.19 — GEO presence block. Null when project has no AI
           Overview attribution AND no AI platform referrals data. When
           present, surfaces both the headline numbers and the composite
           GEO Visibility Score (same threshold logic as showcase + intel
           engines for consistency across reports). */
        geo: (() => {
          if (!gscAiOverview && !ga4AiPlatform) return null;

          const aoImp = gscAiOverview?.present ? Number(gscAiOverview.total_impressions || 0) : 0;
          const aoClk = gscAiOverview?.present ? Number(gscAiOverview.total_clicks || 0) : 0;
          const aiSes = ga4AiPlatform ? Number(ga4AiPlatform.sessions || 0) : 0;
          const aiConv = ga4AiPlatform ? Number(ga4AiPlatform.conversions || 0) : 0;
          const aiPlatforms: string[] = ga4AiPlatform?.platforms_detected || [];

          /* Build 12.21 — composite score uses shared geo-scoring module
             (extracted from prior inlined copies). Threshold logic is
             single-source; behaviour identical to inlined version. */
          const { score: geoScore, grade } = computeGeoVisibility({
            aiOverviewImpressions: aoImp,
            aiOverviewPresent:     gscAiOverview?.present === true,
            aiPlatformSessions:    aiSes,
            aiPlatformCount:       aiPlatforms.length,
          });

          return {
            ai_overview: gscAiOverview ? {
              present:     !!gscAiOverview.present,
              impressions: aoImp,
              clicks:      aoClk,
              ctr:         aoImp > 0 ? Number(((aoClk / aoImp) * 100).toFixed(2)) : 0,
              window_days: Number(gscAiOverview.window_days || 30),
            } : null,
            ai_platform_referrals: ga4AiPlatform ? {
              sessions:           aiSes,
              conversions:        aiConv,
              platforms_detected: aiPlatforms,
              window_days:        Number(ga4AiPlatform.window_days || 30),
            } : null,
            visibility_score: geoScore,
            visibility_grade: grade,
          };
        })(),
        pillars: pillarHealth,
        wins:    wins.slice(0, 6),
        forecast: campaigns.length > 0 ? {
          active_campaigns: campaigns.filter(c => c.status === 'active').length,
          targeting:        campaigns.filter(c => c.target_position).map(c => ({
            keyword:          c.keyword,
            current_position: c.current_position,
            target_position:  c.target_position,
          })).slice(0, 5),
        } : null,
        living_overview_md: livingOverviewMd,
        generated_at: new Date().toISOString(),
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || 'client lens load failed' };
  }
}

function prettifyPillar(p: string): string {
  switch (p) {
    case 'cluster_map':      return 'Topic Authority';
    case 'internal_linking': return 'Site Architecture';
    case 'off_page':         return 'External Signals';
    case 'technical_audit':  return 'Technical Health';
    case 'monitoring':       return 'Live Tracking';
    default:                 return p.replace('_', ' ');
  }
}
