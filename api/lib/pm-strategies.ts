/* ════════════════════════════════════════════════════════════════
   api/lib/pm-strategies.ts
   Phase 6 — Project Planning Workspace backend.

   First-class Strategy entity. Handles:
     • CRUD (list, get, save, delete)
     • Lifecycle transitions (advance through 5 stages with gates)
     • Finalize (convert a Drafting strategy to Resourcing by pushing
       its source-scenario actions to kanban as cards)
     • Impact tracking (weekly trace from GSC/GA4 vs expected)
     • Planning context aggregator (one endpoint surfaces everything
       a PM needs while building a strategy)

   GATES enforced:
     • drafting → resourcing  : requires source_scenario_id + ≥1 action
     • resourcing → executing : requires zero HARD blockers + ≥1 card
     • executing → measuring  : requires ≥50% cards done (warning only)
     • measuring → concluded  : free
     • paused : reversible from any stage
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { bsPushScenarioToPm, bsPrepareScenarioPush } from "./pm-strategy-bridge.js";
import { bsGetStrategyBlockers } from "./pm-blockers.js";

/* ─── Types ──────────────────────────────────────────────────── */

export type StrategyHorizon = "short_term" | "medium_term" | "long_term";
export type StrategyStatus  = "drafting" | "resourcing" | "executing" | "measuring" | "concluded" | "paused";

export interface StrategyRecord {
  id:                    string;
  project_id:            string;
  name:                  string;
  description:           string | null;
  horizon:               StrategyHorizon;
  status:                StrategyStatus;
  target_start_date:     string | null;
  target_end_date:       string | null;
  source_scenario_id:    string | null;
  linked_goal_ids:       string[];
  expected_impact:       any | null;
  actions:               any[] | null;
  card_ids:              string[];
  actual_impact:         any | null;
  last_impact_pulled_at: string | null;
  on_track:              boolean | null;
  drafted_at:            string | null;
  finalized_at:          string | null;
  started_at:            string | null;
  paused_at:             string | null;
  concluded_at:          string | null;
  conclusion_summary:    string | null;
  created_by:            string | null;
  created_at:            string;
  updated_at:            string;
}

const HORIZON_DEFAULT_DAYS: Record<StrategyHorizon, number> = {
  short_term:  30,
  medium_term: 90,
  long_term:   180,
};

const VALID_HORIZONS  = ["short_term","medium_term","long_term"] as const;
const VALID_STATUSES  = ["drafting","resourcing","executing","measuring","concluded","paused"] as const;

/* ─── List strategies in a project (with computed health) ───── */

export async function bsListStrategies(body: any): Promise<any> {
  const { projectId, status, horizon } = body;
  if (!projectId) return { success: false, error: "projectId required" };

  try {
    let q = db().from("strategies").select("*")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (status)  q = q.eq("status", status);
    if (horizon) q = q.eq("horizon", horizon);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const strategies = (data || []) as StrategyRecord[];

    /* Bulk-compute health rollups */
    const out: any[] = [];
    for (const s of strategies) {
      const health = await computeStrategyHealth(s);
      out.push({ ...s, health });
    }

    return { success: true, strategies: out, total: out.length };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

/* ─── Get a single strategy with full details ────────────────── */

export async function bsGetStrategy(body: any): Promise<any> {
  const { strategyId } = body;
  if (!strategyId) return { success: false, error: "strategyId required" };

  try {
    const { data, error } = await db().from("strategies")
      .select("*").eq("id", strategyId).maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Strategy not found" };
    const strategy = data as StrategyRecord;

    /* Fetch linked cards */
    let cards: any[] = [];
    if (strategy.card_ids && strategy.card_ids.length > 0) {
      const { data: cardRows } = await db().from("kanban_tasks")
        .select("id,title,status,priority,target_start_date,target_completion_date,assigned_to,requirements,estimated_hours")
        .in("id", strategy.card_ids);
      cards = (cardRows || []) as any[];
    }

    /* Fetch linked goals */
    let goals: any[] = [];
    if (strategy.linked_goal_ids && strategy.linked_goal_ids.length > 0) {
      const { data: goalRows } = await db().from("analytics_goals")
        .select("id,name,metric,target_value,target_date,baseline_value,status")
        .in("id", strategy.linked_goal_ids);
      goals = (goalRows || []) as any[];
    }

    /* Health rollup */
    const health = await computeStrategyHealth(strategy);

    /* Blockers filtered to this strategy's cards */
    let blockers: any[] = [];
    try {
      const allBlockers = await bsGetStrategyBlockers({ projectId: strategy.project_id });
      if (allBlockers.success) {
        blockers = (allBlockers.blockers || []).filter((b: any) =>
          b.blocks.some((blk: any) => blk.type === "card" && strategy.card_ids.includes(blk.id))
        );
      }
    } catch { /* non-fatal */ }

    return { success: true, strategy, cards, goals, health, blockers };
  } catch (e: any) {
    return { success: false, error: e?.message || "get failed" };
  }
}

/* ─── Save (create or update) ────────────────────────────────── */

export async function bsSaveStrategy(body: any): Promise<any> {
  const { projectId, strategy } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!strategy || !strategy.name) return { success: false, error: "strategy.name required" };

  const horizon = VALID_HORIZONS.includes(strategy.horizon) ? strategy.horizon : "medium_term";
  const today   = new Date();
  const defaultStart = today.toISOString().slice(0, 10);
  const defaultEnd   = new Date(today.getTime() + HORIZON_DEFAULT_DAYS[horizon] * 86_400_000).toISOString().slice(0, 10);

  const row: any = {
    project_id:          projectId,
    name:                String(strategy.name).slice(0, 200),
    description:         strategy.description ? String(strategy.description).slice(0, 2000) : null,
    horizon,
    status:              VALID_STATUSES.includes(strategy.status) ? strategy.status : "drafting",
    target_start_date:   strategy.target_start_date || defaultStart,
    target_end_date:     strategy.target_end_date   || defaultEnd,
    source_scenario_id:  strategy.source_scenario_id || null,
    linked_goal_ids:     Array.isArray(strategy.linked_goal_ids) ? strategy.linked_goal_ids : [],
    expected_impact:     strategy.expected_impact || null,
    actions:             strategy.actions || null,
    created_by:          strategy.created_by || null,
    updated_at:          new Date().toISOString(),
  };

  try {
    let saved;
    if (strategy.id) {
      const { data, error } = await db().from("strategies")
        .update(row).eq("id", strategy.id).select().single();
      if (error) return { success: false, error: error.message };
      saved = data;
    } else {
      row.drafted_at = new Date().toISOString();
      const { data, error } = await db().from("strategies")
        .insert(row).select().single();
      if (error) return { success: false, error: error.message };
      saved = data;
    }
    return { success: true, strategy: saved };
  } catch (e: any) {
    return { success: false, error: e?.message || "save failed" };
  }
}

/* ─── Delete ─────────────────────────────────────────────────── */

export async function bsDeleteStrategy(body: any): Promise<any> {
  const { strategyId } = body;
  if (!strategyId) return { success: false, error: "strategyId required" };
  try {
    const { error } = await db().from("strategies").delete().eq("id", strategyId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "delete failed" };
  }
}

/* ─── Finalize: drafting → resourcing (push cards) ─────────── */

export async function bsFinalizeStrategy(body: any): Promise<any> {
  const { strategyId, sequential } = body;
  if (!strategyId) return { success: false, error: "strategyId required" };

  try {
    const { data: strategy } = await db().from("strategies")
      .select("*").eq("id", strategyId).maybeSingle();
    if (!strategy) return { success: false, error: "Strategy not found" };
    const s = strategy as StrategyRecord;

    if (s.status !== "drafting") {
      return { success: false, error: `Cannot finalize a strategy in '${s.status}' status` };
    }
    if (!s.source_scenario_id) {
      return { success: false, error: "Strategy has no source scenario. Pick a scenario in Builder first." };
    }

    /* Prepare drafts from the scenario */
    const prep = await bsPrepareScenarioPush({ scenarioId: s.source_scenario_id });
    if (!prep.success) return { success: false, error: prep.error || "Could not prepare drafts" };
    const drafts = (prep.drafts || []) as any[];
    if (drafts.length === 0) return { success: false, error: "Source scenario has no actions to push" };

    /* Override strategic_link on each draft to point to THIS strategy
       (instead of the underlying scenario) so blockers / health roll
       up to the strategy. */
    const enrichedDrafts = drafts.map((d: any) => ({
      ...d,
      strategic_link: {
        type: "strategy",
        id:   s.id,
        name: s.name,
      },
    }));

    /* Push the cards */
    const push = await bsPushScenarioToPm({
      projectId: s.project_id,
      scenarioId: s.source_scenario_id,
      drafts: enrichedDrafts,
      sequential: !!sequential,
    });
    if (!push.success) return { success: false, error: push.error || "Push failed" };

    /* Update strategy: resourcing status + card_ids + finalized_at */
    const cardIds = (push.cardIds || []) as string[];
    await db().from("strategies")
      .update({
        status:        "resourcing",
        finalized_at:  new Date().toISOString(),
        card_ids:      cardIds,
        actions:       prep.scenario_summary ? null : null, /* keep null — actions live in the scenario */
        expected_impact: s.expected_impact || (prep as any).scenario_summary?.projected_impact || null,
        updated_at:    new Date().toISOString(),
      })
      .eq("id", s.id);

    return {
      success: true,
      strategyId: s.id,
      cards_created: cardIds.length,
      next_status:   "resourcing",
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "finalize failed" };
  }
}

/* ─── Advance stage with gates ───────────────────────────────── */

export async function bsAdvanceStrategy(body: any): Promise<any> {
  const { strategyId, toStatus, override } = body;
  if (!strategyId) return { success: false, error: "strategyId required" };
  if (!toStatus || !VALID_STATUSES.includes(toStatus)) return { success: false, error: "Invalid toStatus" };

  try {
    const { data: strategy } = await db().from("strategies")
      .select("*").eq("id", strategyId).maybeSingle();
    if (!strategy) return { success: false, error: "Strategy not found" };
    const s = strategy as StrategyRecord;

    /* Gate enforcement (unless override) */
    if (!override) {
      const gateCheck = await checkStageGate(s, toStatus);
      if (!gateCheck.allowed) {
        return {
          success: false,
          error: gateCheck.reason,
          gate_blocked: true,
          can_override: gateCheck.can_override,
        };
      }
    }

    /* Update timestamps based on transition */
    const patch: any = { status: toStatus, updated_at: new Date().toISOString() };
    if (toStatus === "executing"  && !s.started_at)   patch.started_at   = new Date().toISOString();
    if (toStatus === "paused")                          patch.paused_at    = new Date().toISOString();
    if (toStatus === "concluded" && !s.concluded_at)  patch.concluded_at = new Date().toISOString();

    const { error } = await db().from("strategies").update(patch).eq("id", s.id);
    if (error) return { success: false, error: error.message };

    return { success: true, status: toStatus };
  } catch (e: any) {
    return { success: false, error: e?.message || "advance failed" };
  }
}

/* ─── Gate logic ─────────────────────────────────────────────── */

async function checkStageGate(s: StrategyRecord, toStatus: StrategyStatus): Promise<{
  allowed: boolean; reason?: string; can_override?: boolean;
}> {
  /* Pause is always allowed from any active state */
  if (toStatus === "paused") return { allowed: true };

  /* drafting → resourcing requires source scenario + actions
     (in practice this happens via bsFinalizeStrategy) */
  if (s.status === "drafting" && toStatus === "resourcing") {
    if (!s.source_scenario_id) return { allowed: false, reason: "No source scenario linked. Use Strategy Builder to pick a scenario." };
    return { allowed: true };
  }

  /* resourcing → executing : zero HARD blockers + ≥1 card */
  if (s.status === "resourcing" && toStatus === "executing") {
    if (!s.card_ids || s.card_ids.length === 0) {
      return { allowed: false, reason: "Strategy has no cards. Finalize it first." };
    }
    try {
      const b = await bsGetStrategyBlockers({ projectId: s.project_id });
      if (b.success) {
        const hardBlockers = (b.blockers || []).filter((bl: any) =>
          bl.required && bl.blocks.some((blk: any) => blk.type === "card" && s.card_ids.includes(blk.id))
        );
        if (hardBlockers.length > 0) {
          return {
            allowed: false,
            reason: `${hardBlockers.length} HARD blocker${hardBlockers.length === 1 ? '' : 's'} unresolved (${hardBlockers.slice(0,3).map((h: any) => h.label).join(', ')}${hardBlockers.length > 3 ? '…' : ''}). Resolve in the Stores or override.`,
            can_override: true,
          };
        }
      }
    } catch { /* non-fatal */ }
    return { allowed: true };
  }

  /* executing → measuring : warn if cards not mostly done */
  if (s.status === "executing" && toStatus === "measuring") {
    try {
      const health = await computeStrategyHealth(s);
      if (health.completion_pct < 50) {
        return {
          allowed: false,
          reason: `Only ${health.completion_pct.toFixed(0)}% of cards are done. Moving to Measuring suggests execution is complete. Override if intentional.`,
          can_override: true,
        };
      }
    } catch { /* non-fatal */ }
    return { allowed: true };
  }

  /* measuring → concluded : free */
  if (s.status === "measuring" && toStatus === "concluded") return { allowed: true };

  /* From paused, can return to any prior state */
  if (s.status === "paused") return { allowed: true };

  /* Any other transition allowed but unusual — caller should know */
  return { allowed: true };
}

/* ─── Conclude strategy (with summary) ───────────────────────── */

export async function bsConcludeStrategy(body: any): Promise<any> {
  const { strategyId, conclusion_summary } = body;
  if (!strategyId) return { success: false, error: "strategyId required" };
  try {
    const { error } = await db().from("strategies").update({
      status:             "concluded",
      conclusion_summary: conclusion_summary ? String(conclusion_summary).slice(0, 2000) : null,
      concluded_at:       new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    }).eq("id", strategyId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "conclude failed" };
  }
}

/* ─── Computed health (cards %, blocker count, on_track) ────── */

async function computeStrategyHealth(s: StrategyRecord): Promise<any> {
  /* Default empty health */
  const empty = {
    total_cards: 0, cards_done: 0, cards_in_progress: 0, cards_todo: 0,
    completion_pct: 0, hard_blockers: 0, soft_blockers: 0, on_track: null as boolean | null,
  };
  if (!s.card_ids || s.card_ids.length === 0) return empty;

  try {
    const { data: cards } = await db().from("kanban_tasks")
      .select("id,status")
      .in("id", s.card_ids);
    const list = (cards || []) as any[];
    const total = list.length;
    const done  = list.filter(c => c.status === "done").length;
    const inP   = list.filter(c => c.status === "in_progress").length;
    const todo  = total - done - inP;
    const pct   = total > 0 ? (done / total) * 100 : 0;

    /* Blockers */
    let hard = 0, soft = 0;
    try {
      const b = await bsGetStrategyBlockers({ projectId: s.project_id });
      if (b.success) {
        for (const blocker of (b.blockers || [])) {
          const touchesUs = blocker.blocks.some((blk: any) => blk.type === "card" && s.card_ids.includes(blk.id));
          if (!touchesUs) continue;
          if (blocker.required) hard++; else soft++;
        }
      }
    } catch { /* non-fatal */ }

    return {
      total_cards:        total,
      cards_done:         done,
      cards_in_progress:  inP,
      cards_todo:         todo,
      completion_pct:     Number(pct.toFixed(1)),
      hard_blockers:      hard,
      soft_blockers:      soft,
      on_track:           s.on_track,
    };
  } catch {
    return empty;
  }
}

/* ─── Strategy impact tracker (weekly trace from GSC/GA4) ───── */

export async function bsGetStrategyImpact(body: any): Promise<any> {
  const { strategyId } = body;
  if (!strategyId) return { success: false, error: "strategyId required" };

  try {
    const { data: strategy } = await db().from("strategies").select("*").eq("id", strategyId).maybeSingle();
    if (!strategy) return { success: false, error: "Strategy not found" };
    const s = strategy as StrategyRecord;
    if (!s.finalized_at) return { success: true, trace: [], summary: { message: "Strategy not finalized — no impact to measure yet." } };

    /* Pull GSC + GA4 daily trends */
    const { data: rows } = await db().from("project_knowledge")
      .select("field_key,field_value")
      .eq("project_id", s.project_id).eq("category", "analytics")
      .in("field_key", ["gsc_daily_trend_365d", "ga4_daily_trend_365d"]);
    const map: any = {};
    for (const r of (rows || []) as any[]) {
      try { map[r.field_key] = JSON.parse(r.field_value); } catch { /* skip */ }
    }
    const gscDaily: any[] = map.gsc_daily_trend_365d || [];
    const ga4Daily: any[] = map.ga4_daily_trend_365d || [];

    const finalizedDate = s.finalized_at.slice(0, 10);
    const today         = new Date().toISOString().slice(0, 10);

    /* Aggregate to weekly buckets between finalize date and today */
    const weekly: any[] = [];
    let cursor = new Date(finalizedDate);
    const end  = new Date(today);
    while (cursor <= end) {
      const weekStart = cursor.toISOString().slice(0, 10);
      const weekEnd   = new Date(cursor.getTime() + 6 * 86_400_000).toISOString().slice(0, 10);

      const gscBucket = gscDaily.filter((d: any) => d.date >= weekStart && d.date <= weekEnd);
      const ga4Bucket = ga4Daily.filter((d: any) => d.date >= weekStart && d.date <= weekEnd);

      const gscClicks    = sumField(gscBucket, "clicks");
      const ga4Sessions  = sumField(ga4Bucket, "sessions");

      weekly.push({
        week_start: weekStart,
        week_end:   weekEnd,
        gsc_clicks: gscClicks,
        ga4_sessions: ga4Sessions,
        sample_days: { gsc: gscBucket.length, ga4: ga4Bucket.length },
      });
      cursor = new Date(cursor.getTime() + 7 * 86_400_000);
    }

    /* Compute deltas */
    if (weekly.length > 1) {
      const baseline = weekly[0];
      for (let i = 1; i < weekly.length; i++) {
        const w = weekly[i];
        w.gsc_clicks_delta_pct  = baseline.gsc_clicks  > 0 ? ((w.gsc_clicks  - baseline.gsc_clicks)  / baseline.gsc_clicks)  * 100 : null;
        w.ga4_sessions_delta_pct = baseline.ga4_sessions > 0 ? ((w.ga4_sessions - baseline.ga4_sessions) / baseline.ga4_sessions) * 100 : null;
      }
    }

    /* Persist actual_impact summary */
    const current = weekly[weekly.length - 1];
    const baseline = weekly[0];
    const summary = {
      baseline_week:    baseline?.week_start || null,
      current_week:     current?.week_start || null,
      gsc_clicks_lift_pct:  current?.gsc_clicks_delta_pct ?? null,
      ga4_sessions_lift_pct: current?.ga4_sessions_delta_pct ?? null,
      weeks_observed:   weekly.length,
      last_pulled_at:   new Date().toISOString(),
    };

    await db().from("strategies").update({
      actual_impact:         { weekly, summary },
      last_impact_pulled_at: new Date().toISOString(),
      updated_at:            new Date().toISOString(),
    }).eq("id", s.id);

    return { success: true, trace: weekly, summary };
  } catch (e: any) {
    return { success: false, error: e?.message || "impact computation failed" };
  }
}

function sumField(arr: any[], field: string): number {
  return arr.reduce((sum, r) => sum + (Number(r[field]) || 0), 0);
}

/* ─── Planning context aggregator ────────────────────────────── */
/* One endpoint that surfaces everything a PM needs in the Builder's
   left rail. Cheap reads from existing tables. */

export async function bsGetPlanningContext(body: any): Promise<any> {
  const { projectId } = body;
  if (!projectId) return { success: false, error: "projectId required" };

  try {
    const [project, goals, scenarios, intel, datarooom, blockers, audits] = await Promise.all([
      db().from("projects").select("id,project_name,client_url,status").eq("id", projectId).maybeSingle(),
      db().from("analytics_goals").select("id,name,metric,target_value,target_date,baseline_value,status")
        .eq("project_id", projectId).eq("status", "active").order("target_date", { ascending: true }).limit(10),
      db().from("analytics_scenarios").select("id,name,description,projected_impact,actions,created_at")
        .eq("project_id", projectId).order("updated_at", { ascending: false }).limit(20),
      db().from("project_knowledge").select("field_key,field_value")
        .eq("project_id", projectId).eq("category", "analytics")
        .in("field_key", ["analytics_intelligence", "analytics_period_summary"]),
      db().from("project_knowledge").select("category,field_key,field_value")
        .eq("project_id", projectId).in("category", ["audience","competitor","identity","brand_narrative","goal"]).limit(50),
      bsGetStrategyBlockers({ projectId }),
      db().from("audit_reports").select("id,created_at,overall_score,top_findings").eq("project_id", projectId).order("created_at", { ascending: false }).limit(3),
    ]);

    /* Surface a compact intel summary */
    const intelRow = ((intel.data || []) as any[]).find(r => r.field_key === "analytics_intelligence");
    let topKpis: any[] = [];
    let risingStars: any[] = [];
    let fallingStars: any[] = [];
    if (intelRow) {
      try {
        const parsed = JSON.parse(intelRow.field_value);
        topKpis      = (parsed.kpis || []).slice(0, 6);
        risingStars  = (parsed.risingStars  || []).slice(0, 5);
        fallingStars = (parsed.fallingStars || []).slice(0, 5);
      } catch { /* skip */ }
    }

    return {
      success: true,
      context: {
        project:       project.data,
        active_goals:  goals.data || [],
        saved_scenarios: scenarios.data || [],
        top_kpis:      topKpis,
        rising_stars:  risingStars,
        falling_stars: fallingStars,
        dataroom_categories: (datarooom.data || []).reduce((acc: any, r: any) => {
          acc[r.category] = (acc[r.category] || 0) + 1;
          return acc;
        }, {}),
        blockers_count:   ((blockers as any).blockers || []).length,
        hard_blockers:    ((blockers as any).stats?.hard_blockers) || 0,
        recent_audits:    audits.data || [],
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "context aggregation failed" };
  }
}
