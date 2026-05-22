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
