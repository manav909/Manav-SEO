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
  const { projectId, status, limit } = body || {};
  if (!projectId) return { success: false, error: "projectId required" };
  return listOpportunities({ projectId, status, limit });
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
