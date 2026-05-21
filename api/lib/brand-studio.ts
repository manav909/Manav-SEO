/* ════════════════════════════════════════════════════════════════
   api/lib/brand-studio.ts
   Brand Studio backend — Phase H.0 foundation.

   This file holds the entitlement model, brand asset CRUD, document
   library read endpoints, and the dispatcher chain for bs_* actions.

   Sub-phases that will plug into this dispatcher:
     H.1   bs_ingest_*          (multi-format upload, URL ingestion)
     H.1.5 bs_client_*          (client portal endpoints)
     H.2   bs_generate_*        (template-based AI generation)
     H.3   bs_traction_*        (traction proof points, IR)
     H.4   bs_monitor_*         (internet monitoring + triggers)
     H.5   bs_stakeholder_*     (stakeholder profile config)

   Design discipline carried from prior phases:
   - tool_use for any AI calls (no fragile JSON text parsing)
   - never overwrites existing data
   - full provenance: every change carries a clear source identifier
   - entitlement gating: clients only see what they're paying for
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

/* ── entitlement model ────────────────────────────────────── */

/* Default feature set per tier. Frontend gates sub-tabs against this.
   `custom_features` on the entitlements row can override individual
   feature keys for a specific project without changing the tier. */
const TIER_FEATURES: Record<string, Record<string, boolean>> = {
  basic: {
    "brand_studio.access":   false,
    "brand_studio.library":  false,
    "brand_studio.ingest":   false,
    "brand_studio.generate": false,
    "brand_studio.brand":    false,
    "brand_studio.investor": false,
    "brand_studio.market":   false,
    "brand_studio.triggers": false,
  },
  studio: {
    "brand_studio.access":   true,
    "brand_studio.library":  true,
    "brand_studio.ingest":   true,
    "brand_studio.generate": true,
    "brand_studio.brand":    true,
    "brand_studio.investor": false,
    "brand_studio.market":   false,
    "brand_studio.triggers": false,
  },
  studio_pro: {
    "brand_studio.access":   true,
    "brand_studio.library":  true,
    "brand_studio.ingest":   true,
    "brand_studio.generate": true,
    "brand_studio.brand":    true,
    "brand_studio.investor": false,
    "brand_studio.market":   true,
    "brand_studio.triggers": true,
  },
  studio_ir: {
    "brand_studio.access":   true,
    "brand_studio.library":  true,
    "brand_studio.ingest":   true,
    "brand_studio.generate": true,
    "brand_studio.brand":    true,
    "brand_studio.investor": true,
    "brand_studio.market":   true,
    "brand_studio.triggers": true,
  },
  enterprise: {
    "brand_studio.access":   true,
    "brand_studio.library":  true,
    "brand_studio.ingest":   true,
    "brand_studio.generate": true,
    "brand_studio.brand":    true,
    "brand_studio.investor": true,
    "brand_studio.market":   true,
    "brand_studio.triggers": true,
  },
};

/* Default client-visible subset per tier. Internal team always sees
   what the tier enables; clients see only what's enabled here AND in
   client_visible_features. Conservative defaults: clients see Library
   + Brand by default once the project is on a Studio tier. */
const TIER_CLIENT_DEFAULTS: Record<string, Record<string, boolean>> = {
  basic:       {},
  studio:      { library: true, brand: true, generate: false, investor: false, market: false, triggers: false },
  studio_pro:  { library: true, brand: true, generate: false, investor: false, market: true,  triggers: false },
  studio_ir:   { library: true, brand: true, generate: false, investor: true,  market: true,  triggers: false },
  enterprise:  { library: true, brand: true, generate: false, investor: true,  market: true,  triggers: true  },
};

interface EntitlementResolution {
  project_id:               string;
  tier:                     string;
  features:                 Record<string, boolean>;   /* internal — what the team sees */
  client_visible_features:  Record<string, boolean>;   /* subset — what the client sees */
  client_portal_enabled:    boolean;
  plan_notes?:              string;
  is_default:               boolean;                    /* true = no row exists, defaults applied */
}

/** Resolve the effective entitlements for a project.
 *  If no row exists in project_entitlements, returns the basic tier
 *  defaults (no Brand Studio access) — this keeps every existing
 *  project safe by default. */
export async function bsGetEntitlements(projectId: string): Promise<{
  success: boolean; entitlements?: EntitlementResolution; error?: string;
}> {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const { data } = await db().from("project_entitlements")
      .select("*").eq("project_id", projectId).maybeSingle();

    const tier = (data as any)?.tier || "basic";
    const tierFeatures   = TIER_FEATURES[tier]        || TIER_FEATURES.basic;
    const tierClientDefs = TIER_CLIENT_DEFAULTS[tier] || {};
    const customFeatures = ((data as any)?.custom_features as Record<string, boolean>) || {};
    const clientCustom   = ((data as any)?.client_visible_features as Record<string, boolean>) || {};

    /* tier defaults → tier overrides via custom_features */
    const features = { ...tierFeatures, ...customFeatures };

    /* tier client defaults → overrides via client_visible_features
       but ALWAYS clamped to what's enabled internally — a client
       can never see something the tier doesn't include */
    const clientFeatures: Record<string, boolean> = {};
    for (const [key, defaultOn] of Object.entries(tierClientDefs)) {
      const internalKey = `brand_studio.${key}`;
      const internalEnabled = features[internalKey] !== false;
      const clientWants     = clientCustom[key] !== undefined ? !!clientCustom[key] : !!defaultOn;
      clientFeatures[key] = internalEnabled && clientWants;
    }

    return {
      success: true,
      entitlements: {
        project_id:              projectId,
        tier,
        features,
        client_visible_features: clientFeatures,
        client_portal_enabled:   !!(data as any)?.client_portal_enabled,
        plan_notes:              (data as any)?.plan_notes || undefined,
        is_default:              !data,
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "entitlements read failed" };
  }
}

/** Upsert entitlements for a project (admin-only operation).
 *  Validates tier name; rejects unknown tiers. */
export async function bsUpdateEntitlements(opts: {
  projectId: string;
  tier?: string;
  customFeatures?: Record<string, boolean>;
  clientVisibleFeatures?: Record<string, boolean>;
  clientPortalEnabled?: boolean;
  planNotes?: string;
}): Promise<{ success: boolean; error?: string; entitlements?: EntitlementResolution }> {
  if (!opts.projectId) return { success: false, error: "projectId required" };
  if (opts.tier && !TIER_FEATURES[opts.tier]) {
    return { success: false, error: `unknown tier: ${opts.tier}` };
  }

  try {
    const payload: any = { project_id: opts.projectId };
    if (opts.tier !== undefined)                    payload.tier = opts.tier;
    if (opts.customFeatures !== undefined)          payload.custom_features = opts.customFeatures;
    if (opts.clientVisibleFeatures !== undefined)   payload.client_visible_features = opts.clientVisibleFeatures;
    if (opts.clientPortalEnabled !== undefined)     payload.client_portal_enabled = opts.clientPortalEnabled;
    if (opts.planNotes !== undefined)               payload.plan_notes = opts.planNotes;

    const { error } = await db().from("project_entitlements")
      .upsert(payload, { onConflict: "project_id" });
    if (error) return { success: false, error: error.message };

    /* return the freshly-resolved entitlements */
    return bsGetEntitlements(opts.projectId);
  } catch (e: any) {
    return { success: false, error: e?.message || "entitlements update failed" };
  }
}

/* ── brand assets ─────────────────────────────────────────── */

interface BrandAssets {
  project_id:               string;
  primary_logo_url?:        string;
  logo_variants:            any[];
  favicon_url?:             string;
  color_palette:            any[];
  font_families:            any[];
  image_library:            any[];
  primary_tagline?:         string;
  tagline_rationale?:       string;
  secondary_taglines:       string[];
  brand_archetype?:         string;
  brand_application_notes?: string;
  source:                   string;
  created_at?:              string;
  updated_at?:              string;
}

const EMPTY_BRAND_ASSETS = (projectId: string): BrandAssets => ({
  project_id:         projectId,
  logo_variants:      [],
  color_palette:      [],
  font_families:      [],
  image_library:      [],
  secondary_taglines: [],
  source:             "manual",
});

export async function bsGetBrandAssets(projectId: string): Promise<{
  success: boolean; assets?: BrandAssets; error?: string;
}> {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const { data } = await db().from("brand_assets")
      .select("*").eq("project_id", projectId).maybeSingle();
    if (!data) {
      /* no row yet → return an empty shell so the frontend can render
         the Brand Bar without a separate "create row" step */
      return { success: true, assets: EMPTY_BRAND_ASSETS(projectId) };
    }
    return { success: true, assets: data as BrandAssets };
  } catch (e: any) {
    return { success: false, error: e?.message || "brand assets read failed" };
  }
}

export async function bsUpdateBrandAssets(opts: {
  projectId: string;
  patch: Partial<BrandAssets>;
}): Promise<{ success: boolean; assets?: BrandAssets; error?: string }> {
  if (!opts.projectId) return { success: false, error: "projectId required" };
  try {
    /* whitelist what fields can be updated to avoid arbitrary column writes */
    const allowed: (keyof BrandAssets)[] = [
      "primary_logo_url", "logo_variants", "favicon_url",
      "color_palette", "font_families", "image_library",
      "primary_tagline", "tagline_rationale", "secondary_taglines",
      "brand_archetype", "brand_application_notes", "source",
    ];
    const payload: any = { project_id: opts.projectId };
    for (const k of allowed) {
      if ((opts.patch as any)[k] !== undefined) payload[k] = (opts.patch as any)[k];
    }
    const { error } = await db().from("brand_assets")
      .upsert(payload, { onConflict: "project_id" });
    if (error) return { success: false, error: error.message };
    return bsGetBrandAssets(opts.projectId);
  } catch (e: any) {
    return { success: false, error: e?.message || "brand assets update failed" };
  }
}

/* ── document library ─────────────────────────────────────── */

/** List documents for a project with the new Brand Studio filters.
 *  Reads project_documents directly; respects audience/visibility filters
 *  if the caller is operating in client mode. */
export async function bsListDocuments(opts: {
  projectId: string;
  kind?: "ingested" | "generated";
  stakeholderRole?: string;
  audienceRole?: string;
  publishedOnly?: boolean;     /* for client portal mode */
  limit?: number;
}): Promise<{ success: boolean; documents?: any[]; error?: string }> {
  if (!opts.projectId) return { success: false, error: "projectId required" };
  try {
    let q = db().from("project_documents").select(
      /* explicit column list — keep payload tight, omit raw_content
         (can be huge) unless individually fetched */
      "id, project_id, name, doc_type, kind, stakeholder_role, provided_by, " +
      "audience_role, template_id, confidence, source_url, version, " +
      "parent_document_id, published_to_client, published_at, doc_status, " +
      "file_size_kb, source_date, created_at, extracted_data, " +
      "source_documents, web_sources, share_in_investor_pack"
    ).eq("project_id", opts.projectId);

    if (opts.kind)             q = q.eq("kind", opts.kind);
    if (opts.stakeholderRole)  q = q.eq("stakeholder_role", opts.stakeholderRole);
    if (opts.audienceRole)     q = q.eq("audience_role", opts.audienceRole);
    if (opts.publishedOnly)    q = q.eq("published_to_client", true);

    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(Math.min(opts.limit || 200, 500));
    if (error) return { success: false, error: error.message };
    return { success: true, documents: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

/* ── stakeholder + audience role catalog ──────────────────── */

/** The standard list of stakeholder roles. Used by the frontend
 *  upload UI as a dropdown; kept in the backend so it's the single
 *  source of truth and gets enforced server-side later. */
export const STAKEHOLDER_ROLES = [
  { key: "client_executive",   label: "Client — Executive (CEO / Founder / CMO)" },
  { key: "client_marketing",   label: "Client — Marketing Lead" },
  { key: "client_product",     label: "Client — Product Lead" },
  { key: "client_legal",       label: "Client — Legal / Compliance" },
  { key: "pm_internal",        label: "PM — Internal Strategy" },
  { key: "sales_lead",         label: "Sales — Lead / SDR" },
  { key: "team_writer",        label: "Team — Writer / Content" },
  { key: "team_designer",      label: "Team — Designer" },
  { key: "team_developer",     label: "Team — Developer" },
  { key: "researcher_external",label: "Researcher — External / Analyst" },
  { key: "researcher_internal",label: "Researcher — Internal / Insights" },
  { key: "customer",           label: "Customer / End User" },
  { key: "customer_advocate",  label: "Customer Advocate / CS Lead" },
  { key: "investor",           label: "Investor / Board Member" },
  { key: "advertiser",         label: "Advertiser / Media Buyer" },
  { key: "partner",            label: "Partner / Vendor" },
  { key: "press",              label: "Press / PR" },
  { key: "other",              label: "Other" },
] as const;

/** Audience roles — who a generated document is FOR. */
export const AUDIENCE_ROLES = [
  { key: "client_executive",   label: "Client Executive (for the C-suite)" },
  { key: "client_marketing",   label: "Client Marketing Team" },
  { key: "client_internal",    label: "Client Internal (all roles)" },
  { key: "sales_team",         label: "Sales Team" },
  { key: "investor",           label: "Investor / Board" },
  { key: "press",              label: "Press / Public" },
  { key: "internal_only",      label: "Internal Use Only (not for client)" },
  { key: "partner",            label: "Partner / Vendor" },
  { key: "team_creative",      label: "Creative Team (writers / designers)" },
] as const;

export function bsGetCatalogs() {
  return {
    success: true,
    stakeholder_roles: STAKEHOLDER_ROLES,
    audience_roles:    AUDIENCE_ROLES,
    tiers: Object.keys(TIER_FEATURES),
  };
}

/* ── dispatcher ───────────────────────────────────────────── */

export async function handleBrandStudio(action: string, body: any): Promise<any | null> {
  switch (action) {
    /* ── entitlements ── */
    case "bs_get_entitlements":
      return bsGetEntitlements(body.projectId);
    case "bs_update_entitlements":
      return bsUpdateEntitlements({
        projectId:              body.projectId,
        tier:                   body.tier,
        customFeatures:         body.customFeatures,
        clientVisibleFeatures:  body.clientVisibleFeatures,
        clientPortalEnabled:    body.clientPortalEnabled,
        planNotes:              body.planNotes,
      });

    /* ── brand assets ── */
    case "bs_get_brand_assets":
      return bsGetBrandAssets(body.projectId);
    case "bs_update_brand_assets":
      return bsUpdateBrandAssets({ projectId: body.projectId, patch: body.patch || {} });

    /* ── library ── */
    case "bs_list_documents":
      return bsListDocuments({
        projectId:        body.projectId,
        kind:             body.kind,
        stakeholderRole:  body.stakeholderRole,
        audienceRole:     body.audienceRole,
        publishedOnly:    body.publishedOnly,
        limit:            body.limit,
      });

    /* ── catalogs (stakeholder/audience role lists, tier names) ── */
    case "bs_get_catalogs":
      return bsGetCatalogs();

    /* H.1 — Ingest V2 handlers ── */
    case "bs_get_doc_types":
    case "bs_detect_doc_type":
    case "bs_ingest_file":
    case "bs_ingest_url":
    case "bs_ingest_extract":
    case "bs_get_document":
    case "bs_delete_document":
    case "bs_get_field_provenance":
    /* Phase 1C — Image attachments */
    case "bs_attach_image":
    case "bs_list_attachments":
    case "bs_delete_attachment":
    case "bs_refresh_attachment_url": {
      const { handleBrandStudioIngest } = await import("./brand-studio-ingest.js");
      return handleBrandStudioIngest(action, body);
    }

    /* H.1.5 — Client portal handlers ── */
    case "bs_create_client_token":
    case "bs_list_client_tokens":
    case "bs_get_token_by_id":
    case "bs_revoke_client_token":
    case "bs_publish_document":
    case "bs_publish_bulk":
    case "bs_client_resolve":
    case "bs_client_list_documents":
    case "bs_client_get_document":
    case "bs_client_get_investor_data":
    /* H.6a session-token client endpoints */
    case "bs_client_session_resolve":
    case "bs_client_session_list_documents":
    case "bs_client_session_post_comment":
    case "bs_client_session_list_comments":
    case "bs_client_session_respond_approval":
    case "bs_client_session_list_approvals":
    case "bs_client_session_share_doc":
    case "bs_client_session_revoke_share":
    case "bs_client_session_list_share_grants":
    case "bs_client_session_upload_file":
    case "bs_client_session_list_intake_forms":
    case "bs_client_session_submit_intake":
    case "bs_client_session_list_notifications":
    case "bs_client_session_mark_notification_read":
    case "bs_client_session_get_document": {
      const { handleBrandStudioClient } = await import("./brand-studio-client.js");
      return handleBrandStudioClient(action, body);
    }

    /* H.2 — Generation engine handlers ── */
    case "bs_get_templates":
    case "bs_check_readiness":
    case "bs_generate_preview":
    case "bs_generate_apply":
    case "bs_list_generated": {
      const { handleBrandStudioGenerate } = await import("./brand-studio-generate.js");
      return handleBrandStudioGenerate(action, body);
    }

    /* H.3 — Investor backend (traction, market intel, research) ── */
    case "bs_list_traction":
    case "bs_upsert_traction":
    case "bs_delete_traction":
    case "bs_list_market_intel":
    case "bs_upsert_market_intel":
    case "bs_delete_market_intel":
    case "bs_research_fetch":
    case "bs_research_bulk": {
      const { handleBrandStudioInvestor } = await import("./brand-studio-investor.js");
      return handleBrandStudioInvestor(action, body);
    }

    /* H.4 — Monitors + observations + subscriptions ── */
    case "bs_list_monitors":
    case "bs_upsert_monitor":
    case "bs_delete_monitor":
    case "bs_check_monitor_now":
    case "bs_list_observations":
    case "bs_update_observation_status":
    case "bs_list_stale_docs":
    case "bs_dismiss_stale": {
      const { handleBrandStudioMonitors } = await import("./brand-studio-monitors.js");
      return handleBrandStudioMonitors(action, body);
    }

    /* H.5 — Stakeholders + synthesis + diff + re-extract + deps ── */
    case "bs_list_stakeholders":
    case "bs_upsert_stakeholder":
    case "bs_delete_stakeholder":
    case "bs_list_synthesis_candidates":
    case "bs_synthesize_persona":
    case "bs_apply_synthesis":
    case "bs_reextract_document":
    case "bs_get_version_diff":
    case "bs_get_document_dependencies":
    case "bs_get_field_dependents": {
      const { handleBrandStudioH5 } = await import("./brand-studio-h5.js");
      return handleBrandStudioH5(action, body);
    }

    /* H.6a — Client collaboration (users + sharing + comments +
       approvals + intake + uploads + notifications + audit) ── */
    case "bs_invite_client_user":
    case "bs_list_client_users":
    case "bs_update_client_user":
    case "bs_revoke_client_user":
    case "bs_redeem_invite":
    case "bs_list_share_grants":
    case "bs_create_share_grant":
    case "bs_revoke_share_grant":
    case "bs_list_comments":
    case "bs_post_comment":
    case "bs_resolve_comment":
    case "bs_delete_comment":
    case "bs_list_approvals":
    case "bs_request_approval":
    case "bs_respond_approval":
    case "bs_cancel_approval":
    case "bs_list_intake_forms":
    case "bs_upsert_intake_form":
    case "bs_delete_intake_form":
    case "bs_list_intake_responses":
    case "bs_submit_intake_response":
    case "bs_review_intake_response":
    case "bs_client_list_intake_forms":
    case "bs_client_upload_file":
    case "bs_list_notifications":
    case "bs_mark_notification_read":
    case "bs_list_audit_log": {
      const { handleBrandStudioCollab } = await import("./brand-studio-collab.js");
      return handleBrandStudioCollab(action, body);
    }

    /* Phase 1D — Live data reference resolution */
    case "bs_resolve_data_references": {
      const { bsResolveDataReferences } = await import("./brand-studio-resolve.js");
      return bsResolveDataReferences(body);
    }

    /* Phase 1J — Analytics intelligence layer */
    case "bs_get_analytics_intel": {
      const { bsGetAnalyticsIntel } = await import("./pm-analytics-intel-orchestrator.js");
      return bsGetAnalyticsIntel(body);
    }
    case "bs_recompute_analytics_intel": {
      const { bsRecomputeAnalyticsIntel } = await import("./pm-analytics-intel-orchestrator.js");
      return bsRecomputeAnalyticsIntel(body);
    }

    /* Phase 1L — What-If Simulator */
    case "bs_list_actions": {
      const { bsListActions } = await import("./pm-scenario-storage.js");
      return bsListActions(body);
    }
    case "bs_get_action_suggestions": {
      const { bsGetActionSuggestions } = await import("./pm-scenario-storage.js");
      return bsGetActionSuggestions(body);
    }
    case "bs_project_scenario": {
      const { bsProjectScenario } = await import("./pm-scenario-storage.js");
      return bsProjectScenario(body);
    }
    case "bs_save_scenario": {
      const { bsSaveScenario } = await import("./pm-scenario-storage.js");
      return bsSaveScenario(body);
    }
    case "bs_list_scenarios": {
      const { bsListScenarios } = await import("./pm-scenario-storage.js");
      return bsListScenarios(body);
    }
    case "bs_get_scenario": {
      const { bsGetScenario } = await import("./pm-scenario-storage.js");
      return bsGetScenario(body);
    }
    case "bs_update_scenario": {
      const { bsUpdateScenario } = await import("./pm-scenario-storage.js");
      return bsUpdateScenario(body);
    }
    case "bs_delete_scenario": {
      const { bsDeleteScenario } = await import("./pm-scenario-storage.js");
      return bsDeleteScenario(body);
    }

    /* Phase 1M — Goal Engine */
    case "bs_create_goal": {
      const { bsCreateGoal } = await import("./pm-goal-storage.js");
      return bsCreateGoal(body);
    }
    case "bs_list_goals": {
      const { bsListGoals } = await import("./pm-goal-storage.js");
      return bsListGoals(body);
    }
    case "bs_get_goal": {
      const { bsGetGoal } = await import("./pm-goal-storage.js");
      return bsGetGoal(body);
    }
    case "bs_update_goal": {
      const { bsUpdateGoal } = await import("./pm-goal-storage.js");
      return bsUpdateGoal(body);
    }
    case "bs_delete_goal": {
      const { bsDeleteGoal } = await import("./pm-goal-storage.js");
      return bsDeleteGoal(body);
    }
    case "bs_record_goal_progress": {
      const { bsRecordGoalProgress } = await import("./pm-goal-storage.js");
      return bsRecordGoalProgress(body);
    }
    case "bs_suggest_goal_scenarios": {
      const { bsSuggestGoalScenarios } = await import("./pm-goal-storage.js");
      return bsSuggestGoalScenarios(body);
    }
    case "bs_link_scenario_to_goal": {
      const { bsLinkScenarioToGoal } = await import("./pm-goal-storage.js");
      return bsLinkScenarioToGoal(body);
    }
    case "bs_unlink_scenario_from_goal": {
      const { bsUnlinkScenarioFromGoal } = await import("./pm-goal-storage.js");
      return bsUnlinkScenarioFromGoal(body);
    }

    /* Phase 2 — Strategy-to-PM Bridge */
    case "bs_prepare_scenario_push": {
      const { bsPrepareScenarioPush } = await import("./pm-strategy-bridge.js");
      return bsPrepareScenarioPush(body);
    }
    case "bs_push_scenario_to_pm": {
      const { bsPushScenarioToPm } = await import("./pm-strategy-bridge.js");
      return bsPushScenarioToPm(body);
    }
    case "bs_get_strategy_cards": {
      const { bsGetStrategyCards } = await import("./pm-strategy-bridge.js");
      return bsGetStrategyCards(body);
    }
    case "bs_get_strategy_health": {
      const { bsGetStrategyHealth } = await import("./pm-strategy-bridge.js");
      return bsGetStrategyHealth(body);
    }
    case "bs_update_card_dependencies": {
      const { bsUpdateCardDependencies } = await import("./pm-strategy-bridge.js");
      return bsUpdateCardDependencies(body);
    }

    /* Phase 5 — Resolution Stores + Blockers + Matcher */
    case "bs_list_store_items": {
      const { bsListStoreItems } = await import("./pm-resolution-stores.js");
      return bsListStoreItems(body);
    }
    case "bs_save_store_item": {
      const { bsSaveStoreItem } = await import("./pm-resolution-stores.js");
      return bsSaveStoreItem(body);
    }
    case "bs_delete_store_item": {
      const { bsDeleteStoreItem } = await import("./pm-resolution-stores.js");
      return bsDeleteStoreItem(body);
    }
    case "bs_suggest_store_labels": {
      const { bsSuggestStoreLabels } = await import("./pm-resolution-stores.js");
      return bsSuggestStoreLabels(body);
    }
    case "bs_get_strategy_blockers": {
      const { bsGetStrategyBlockers } = await import("./pm-blockers.js");
      return bsGetStrategyBlockers(body);
    }
    case "bs_rematch_project_cards": {
      const { bsRematchProjectCards } = await import("./pm-resolution-matcher.js");
      return bsRematchProjectCards(body);
    }

    /* Phase 6 — Project Planning Workspace (strategies as first-class) */
    case "bs_list_strategies": {
      const { bsListStrategies } = await import("./pm-strategies.js");
      return bsListStrategies(body);
    }
    case "bs_get_strategy": {
      const { bsGetStrategy } = await import("./pm-strategies.js");
      return bsGetStrategy(body);
    }
    case "bs_save_strategy": {
      const { bsSaveStrategy } = await import("./pm-strategies.js");
      return bsSaveStrategy(body);
    }
    case "bs_delete_strategy": {
      const { bsDeleteStrategy } = await import("./pm-strategies.js");
      return bsDeleteStrategy(body);
    }
    case "bs_finalize_strategy": {
      const { bsFinalizeStrategy } = await import("./pm-strategies.js");
      return bsFinalizeStrategy(body);
    }
    case "bs_advance_strategy": {
      const { bsAdvanceStrategy } = await import("./pm-strategies.js");
      return bsAdvanceStrategy(body);
    }
    case "bs_conclude_strategy": {
      const { bsConcludeStrategy } = await import("./pm-strategies.js");
      return bsConcludeStrategy(body);
    }
    case "bs_get_strategy_impact": {
      const { bsGetStrategyImpact } = await import("./pm-strategies.js");
      return bsGetStrategyImpact(body);
    }
    case "bs_get_planning_context": {
      const { bsGetPlanningContext } = await import("./pm-strategies.js");
      return bsGetPlanningContext(body);
    }

    /* Phase 7 — S.E.A.S.O.N. */
    case "bs_season_briefing": {
      const { bsSeasonBriefing } = await import("./season-attention.js");
      return bsSeasonBriefing(body);
    }
    case "bs_season_command": {
      const { bsSeasonCommand } = await import("./season-orchestrator.js");
      return bsSeasonCommand(body);
    }
    case "bs_season_activity": {
      const { bsSeasonActivity } = await import("./season-orchestrator.js");
      return bsSeasonActivity(body);
    }

    /* Phase 8a — wishes */
    case "bs_season_emit_wish": {
      const { bsSeasonEmitWish } = await import("./season-wishes.js");
      return bsSeasonEmitWish(body);
    }
    case "bs_season_list_wishes": {
      const { bsSeasonListWishes } = await import("./season-wishes.js");
      return bsSeasonListWishes(body);
    }
    case "bs_season_triage_wish": {
      const { bsSeasonTriageWish } = await import("./season-wishes.js");
      return bsSeasonTriageWish(body);
    }
    case "bs_season_wish_stats": {
      const { bsSeasonWishStats } = await import("./season-wishes.js");
      return bsSeasonWishStats(body);
    }

    /* Phase 3 — Analytics Provenance & Diagnostics */
    case "bs_get_analytics_provenance": {
      const { bsGetAnalyticsProvenance } = await import("./pm-analytics-provenance.js");
      return bsGetAnalyticsProvenance(body);
    }
    case "bs_diagnose_analytics_mismatch": {
      const { bsDiagnoseAnalyticsMismatch } = await import("./pm-analytics-provenance.js");
      return bsDiagnoseAnalyticsMismatch(body);
    }
    case "bs_get_external_dashboard_links": {
      const { bsGetExternalDashboardLinks } = await import("./pm-analytics-provenance.js");
      return bsGetExternalDashboardLinks(body);
    }

    /* Phase 1F — DOCX export */
    case "bs_export_docx": {
      const { bsExportDocx } = await import("./brand-studio-export.js");
      return bsExportDocx(body);
    }

    /* Phase 1G — Investor data room bundle */
    case "bs_export_investor_bundle": {
      const { bsExportInvestorBundle } = await import("./brand-studio-investor-bundle.js");
      return bsExportInvestorBundle(body);
    }
    case "bs_toggle_investor_pack": {
      const { bsToggleInvestorPack } = await import("./brand-studio-investor-bundle.js");
      return bsToggleInvestorPack(body);
    }

    /* H.2+ handlers will plug in here:
       case "bs_generate_preview": return bsGeneratePreview(body);
       case "bs_generate_apply": return bsGenerateApply(body);
       ... */

    default: return null;
  }
}
