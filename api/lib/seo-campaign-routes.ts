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

/* Phase 21 Block 2.14 — user preferences (widget layouts, density, defaults) */

export async function bsSeoUserPrefsGet(body: any): Promise<any> {
  const { userId } = body || {};
  if (!userId) return { success: false, error: "userId required" };
  const { getUserPrefs } = await import("./season-user-prefs.js");
  return getUserPrefs({ userId });
}

export async function bsSeoUserPrefsSet(body: any): Promise<any> {
  const { userId, partial } = body || {};
  if (!userId) return { success: false, error: "userId required" };
  if (!partial || typeof partial !== 'object') return { success: false, error: "partial required" };
  const { setUserPrefs } = await import("./season-user-prefs.js");
  return setUserPrefs({ userId, partial });
}

export async function bsSeoUserPrefsReset(body: any): Promise<any> {
  const { userId } = body || {};
  if (!userId) return { success: false, error: "userId required" };
  const { resetUserPrefs } = await import("./season-user-prefs.js");
  return resetUserPrefs({ userId });
}
