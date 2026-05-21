/* ════════════════════════════════════════════════════════════════
   api/lib/pm-scenario-storage.ts
   Phase 1L — What-If Simulator: CRUD on saved scenarios.

   All endpoints exposed via the brand-studio dispatcher:
     - bs_list_actions(filter?)            → action library catalog
     - bs_get_action_suggestions(projectId) → smart suggestions from intel
     - bs_project_scenario({projectId, actions}) → impact projection
     - bs_save_scenario(...)               → persist to DB
     - bs_list_scenarios(projectId)        → list saved
     - bs_get_scenario(scenarioId)         → load one
     - bs_update_scenario(...)             → edit (rename, change actions)
     - bs_delete_scenario(scenarioId)
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import {
  SEO_ACTION_LIBRARY,
  getActionById,
  getActionsByCategory,
  type ActionCategory,
} from "./pm-action-library.js";
import {
  getSmartSuggestions, projectScenario, getBaselineSnapshot,
  type ActionInstance,
} from "./pm-scenario-engine.js";

/* ─── Catalog endpoints ───────────────────────────────────────── */

export async function bsListActions(body: any): Promise<any> {
  const category = body?.category as ActionCategory | undefined;
  const actions = category ? getActionsByCategory(category) : SEO_ACTION_LIBRARY;
  return {
    success: true,
    actions,
    total: actions.length,
    categories: ["content","onpage","technical","links","ux","strategy"] as ActionCategory[],
  };
}

export async function bsGetActionSuggestions(body: any): Promise<any> {
  const { projectId, maxResults } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const suggestions = await getSmartSuggestions(projectId, Number(maxResults) || 12);
    return { success: true, suggestions };
  } catch (e: any) {
    return { success: false, error: e?.message || "suggestion failed" };
  }
}

export async function bsProjectScenario(body: any): Promise<any> {
  const { projectId, actions } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!Array.isArray(actions)) return { success: false, error: "actions must be an array" };

  const cleaned: ActionInstance[] = [];
  for (const a of actions) {
    if (!a?.action_id) continue;
    if (!getActionById(a.action_id)) continue;
    cleaned.push({
      action_id:    String(a.action_id),
      inputs:       (a.inputs && typeof a.inputs === "object") ? a.inputs : {},
      target_label: a.target_label ? String(a.target_label) : undefined,
    });
  }

  if (cleaned.length === 0) {
    return { success: false, error: "No valid actions in scenario" };
  }
  if (cleaned.length > 30) {
    return { success: false, error: "Too many actions (max 30 per scenario)" };
  }

  return projectScenario({ projectId, actions: cleaned });
}

/* ─── Save / list / get / update / delete ─────────────────────── */

export async function bsSaveScenario(body: any): Promise<any> {
  const { projectId, name, description, actions, status, tags, sharedWithClient, createdByEmail } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!name || String(name).trim().length === 0) return { success: false, error: "name required" };
  if (!Array.isArray(actions) || actions.length === 0) return { success: false, error: "scenario must have actions" };

  /* Project + snapshot baseline at save time */
  const baseline = await getBaselineSnapshot(projectId);

  /* Pre-compute projection so it's frozen with the scenario */
  const proj = await projectScenario({ projectId, actions });
  if (!proj.success) return proj;

  try {
    const { data, error } = await db().from("analytics_scenarios").insert({
      project_id:         projectId,
      name:               String(name).slice(0, 200),
      description:        description ? String(description).slice(0, 2000) : null,
      actions:            actions,
      baseline_snapshot:  baseline,
      projected_impact:   proj.projection,
      status:             status   || "draft",
      tags:               Array.isArray(tags) ? tags : [],
      shared_with_client: !!sharedWithClient,
      created_by_email:   createdByEmail || null,
    }).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, scenario: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "save failed" };
  }
}

export async function bsListScenarios(body: any): Promise<any> {
  const { projectId, status } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    let q = db().from("analytics_scenarios")
      .select("id,name,description,status,actions,baseline_snapshot,projected_impact,tags,shared_with_client,created_at,updated_at,created_by_email")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, scenarios: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

export async function bsGetScenario(body: any): Promise<any> {
  const { scenarioId } = body;
  if (!scenarioId) return { success: false, error: "scenarioId required" };
  try {
    const { data, error } = await db().from("analytics_scenarios")
      .select("*")
      .eq("id", scenarioId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Scenario not found" };
    return { success: true, scenario: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "get failed" };
  }
}

export async function bsUpdateScenario(body: any): Promise<any> {
  const { scenarioId, name, description, actions, status, tags, sharedWithClient } = body;
  if (!scenarioId) return { success: false, error: "scenarioId required" };

  const updates: any = { updated_at: new Date().toISOString() };
  if (name !== undefined)        updates.name = String(name).slice(0, 200);
  if (description !== undefined) updates.description = description ? String(description).slice(0, 2000) : null;
  if (status !== undefined)      updates.status = status;
  if (tags !== undefined)        updates.tags = Array.isArray(tags) ? tags : [];
  if (sharedWithClient !== undefined) updates.shared_with_client = !!sharedWithClient;

  /* If actions changed, recompute projection */
  if (Array.isArray(actions)) {
    updates.actions = actions;
    const { data: existing } = await db().from("analytics_scenarios").select("project_id").eq("id", scenarioId).maybeSingle();
    if (existing?.project_id) {
      const proj = await projectScenario({ projectId: (existing as any).project_id, actions });
      if (proj.success) updates.projected_impact = proj.projection;
    }
  }

  try {
    const { data, error } = await db().from("analytics_scenarios").update(updates).eq("id", scenarioId).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, scenario: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "update failed" };
  }
}

export async function bsDeleteScenario(body: any): Promise<any> {
  const { scenarioId } = body;
  if (!scenarioId) return { success: false, error: "scenarioId required" };
  try {
    const { error } = await db().from("analytics_scenarios").delete().eq("id", scenarioId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "delete failed" };
  }
}
