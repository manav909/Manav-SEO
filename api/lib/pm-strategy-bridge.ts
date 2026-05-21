/* ════════════════════════════════════════════════════════════════
   api/lib/pm-strategy-bridge.ts
   Phase 2 — Strategy-to-PM Bridge.

   Turns scenarios and goals into kanban cards that carry their full
   strategic context (which goal/scenario, expected impact, target
   dates, dependencies). The PM dashboard can then execute, track,
   and report progress with the strategic intent always one click
   away.

   Key flow:
     1. UI requests a "push draft" — bsPrepareScenarioPush returns
        one card draft per action with auto-suggested target dates +
        suggested dependencies (access/content/info/approvals).
     2. PM reviews and edits the drafts (adds project-specific
        access, content needs, approvals, info needs).
     3. UI calls bsPushScenarioToPm with the enriched drafts.
     4. The bridge writes the cards into kanban_tasks atomically.
     5. Goal/scenario gets back a pointer to the created card IDs.

   Existing fields reused:
     - requirements jsonb  — stores [{id, label, category, met}]; new
                             category values: access, content, info,
                             approval, task_prereq
     - depends_on  uuid[]  — prereq card IDs
     - tags        text[]  — strategy filter labels
     - source      text    — set to "strategy"
     - source_refs jsonb   — array of {kind, label, …}

   New fields used:
     - strategic_link         jsonb
     - target_start_date      date
     - target_completion_date date
     - expected_impact        jsonb
     - source_action_id       text
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { getActionById, type SeoAction, type ImpactRange } from "./pm-action-library.js";
import type { ActionInstance } from "./pm-scenario-engine.js";

/* ─── Types ───────────────────────────────────────────────────── */

export type DependencyCategory =
  | "access"        /* logins, tool permissions, credentials */
  | "content"       /* copy, briefs, assets, illustrations */
  | "info"          /* data, persona, competitor research */
  | "approval"      /* client sign-offs, stakeholder review */
  | "task_prereq";  /* prerequisite kanban card */

export interface DependencyItem {
  id?:        string;     /* generated if absent */
  label:      string;
  category:   DependencyCategory;
  met:        boolean;
  prereq_card_id?: string;   /* if category=task_prereq, link to actual card */
}

export interface StrategicLink {
  type:           "scenario" | "goal";
  id:             string;
  name:           string;
  goal_metric?:   string;
  goal_target?:   number;
  goal_date?:     string;
}

export interface CardDraft {
  /* From the action */
  source_action_id:    string;
  title:               string;
  description:         string;
  estimated_hours:     number;
  /* Strategic context */
  strategic_link:      StrategicLink;
  expected_impact:     Record<string, ImpactRange>;
  /* Editable by PM during review */
  target_start_date:   string;   /* YYYY-MM-DD */
  target_completion_date: string;
  priority:            "low" | "medium" | "high";
  requirements:        DependencyItem[];
  depends_on:          string[];   /* prerequisite card IDs */
  /* The original ActionInstance inputs (page_url, query, etc.) */
  action_inputs:       Record<string, any>;
}

/* ─── Prepare draft from a scenario ──────────────────────────── */

/**
 * Given a saved scenario, build CardDraft objects for the UI review
 * screen. Auto-suggests target dates, default priority, and an
 * initial dependency list based on the action's inputs.
 */
export async function bsPrepareScenarioPush(body: any): Promise<any> {
  const { scenarioId, goalId } = body;
  if (!scenarioId && !goalId) return { success: false, error: "scenarioId or goalId required" };

  let scenario: any = null;
  let goal: any     = null;

  if (scenarioId) {
    const { data } = await db().from("analytics_scenarios").select("*").eq("id", scenarioId).maybeSingle();
    if (!data) return { success: false, error: "Scenario not found" };
    scenario = data;
  }
  if (goalId) {
    const { data } = await db().from("analytics_goals").select("*").eq("id", goalId).maybeSingle();
    if (!data) return { success: false, error: "Goal not found" };
    goal = data;
  }

  /* If goalId only — find a scenario linked to it or fall back to error */
  if (!scenario && goal && Array.isArray(goal.linked_scenario_ids) && goal.linked_scenario_ids.length > 0) {
    const { data } = await db().from("analytics_scenarios")
      .select("*").eq("id", goal.linked_scenario_ids[0]).maybeSingle();
    if (data) scenario = data;
  }

  if (!scenario) {
    return { success: false, error: "No scenario to push (link a scenario to the goal first, or push a saved scenario directly)" };
  }

  const projectId = scenario.project_id;
  const actions: ActionInstance[] = Array.isArray(scenario.actions) ? scenario.actions : [];
  if (actions.length === 0) return { success: false, error: "Scenario has no actions to push" };

  const link: StrategicLink = goal
    ? {
        type:        "goal",
        id:          goal.id,
        name:        goal.name || `${goal.metric} target`,
        goal_metric: goal.metric,
        goal_target: Number(goal.target_value),
        goal_date:   goal.target_date,
      }
    : {
        type: "scenario",
        id:   scenario.id,
        name: scenario.name,
      };

  /* Build drafts */
  const drafts: CardDraft[] = [];
  let startCursor = new Date();
  startCursor.setDate(startCursor.getDate() + 2);  /* 2-day buffer before first action starts */

  for (const inst of actions) {
    const action = getActionById(inst.action_id);
    if (!action) continue;

    /* Estimate duration: assume 6 hrs/day pace, min 1 day */
    const durationDays = Math.max(1, Math.ceil(action.effortHours / 6));
    const startDate = new Date(startCursor);
    const endDate   = new Date(startCursor);
    endDate.setDate(endDate.getDate() + durationDays);

    /* Auto-suggest initial dependency items based on action shape */
    const requirements: DependencyItem[] = buildInitialDependencies(action, inst.inputs);

    /* Compose card title — include the action's target if specified */
    const titleParts: string[] = [action.name];
    if (inst.inputs?.target_page)  titleParts.push(`→ ${shortenUrl(inst.inputs.target_page)}`);
    else if (inst.inputs?.target_query) titleParts.push(`→ "${inst.inputs.target_query}"`);
    const title = titleParts.join(" ").slice(0, 200);

    /* Compose description: action's full description + inputs + evidence */
    const descParts: string[] = [action.fullDescription];
    if (Object.keys(inst.inputs || {}).length > 0) {
      const inputLines = Object.entries(inst.inputs)
        .filter(([_, v]) => v !== "" && v != null)
        .map(([k, v]) => `  • ${k.replace(/_/g, " ")}: ${v}`)
        .join("\n");
      if (inputLines) descParts.push(`\n**Inputs:**\n${inputLines}`);
    }
    descParts.push(`\n**Why this works:** ${action.evidence}`);

    /* Priority heuristic: high if rising-star/falling-star action; medium otherwise */
    const priority: "low" | "medium" | "high" =
      action.applicableWhen.some(t => t.includes("critical")) ? "high" :
      action.applicableWhen.some(t => t.includes("rising_stars") || t.includes("falling_stars")) ? "high" :
      action.confidence === "high" ? "medium" : "low";

    drafts.push({
      source_action_id:       action.id,
      title,
      description:            descParts.join("\n"),
      estimated_hours:        action.effortHours,
      strategic_link:         link,
      expected_impact:        action.impact as any,
      target_start_date:      iso(startDate),
      target_completion_date: iso(endDate),
      priority,
      requirements,
      depends_on:             [],
      action_inputs:          inst.inputs || {},
    });

    /* Default: all actions run in parallel — leave startCursor where it is.
       UI can sequentialize later. */
  }

  return {
    success: true,
    drafts,
    projectId,
    scenario_summary: {
      id:                scenario.id,
      name:              scenario.name,
      total_effort_hours: drafts.reduce((a, d) => a + d.estimated_hours, 0),
      projected_impact:  scenario.projected_impact,
    },
    goal_summary: goal ? {
      id:           goal.id,
      name:         goal.name,
      metric:       goal.metric,
      target_value: goal.target_value,
      target_date:  goal.target_date,
    } : null,
  };
}

function buildInitialDependencies(action: SeoAction, inputs: Record<string, any>): DependencyItem[] {
  const items: DependencyItem[] = [];
  let i = 0;
  const add = (label: string, category: DependencyCategory) => {
    items.push({ id: `d${i++}`, label, category, met: false });
  };

  /* Access: anything technical likely needs CMS/dev access */
  if (["technical","onpage","links","content","ux"].includes(action.category)) {
    add("CMS / publishing access", "access");
  }
  if (action.category === "technical") {
    add("Developer access (code repo, server)", "access");
  }
  if (action.id.startsWith("optimize_title") || action.id.startsWith("rewrite_meta")) {
    add("Search Console access (to verify CTR change)", "access");
  }
  if (action.category === "links") {
    add("Outreach platform access (Ahrefs, HARO, etc.)", "access");
  }

  /* Content: writer-driven actions */
  if (action.id.includes("refresh") || action.id.includes("rewrite") || action.id.includes("create_comparison")) {
    add("Content writer assignment", "content");
    add("Updated copy approved by editor", "content");
  }
  if (action.id === "build_topic_cluster" || action.id === "launch_brand_content_series") {
    add("Content brief per article (writer needs structure)", "content");
    add("Illustrations / graphics", "content");
  }
  if (action.id === "add_faq_section" || action.id === "answer_paa_questions") {
    add("Question list curated from GSC/PAA", "content");
  }

  /* Info: where strategy needs more context */
  if (action.id === "consolidate_cannibalized_pages") {
    add("Confirmation of which page has stronger backlink profile", "info");
  }
  if (action.id === "improve_core_web_vitals") {
    add("PageSpeed Insights baseline per affected page", "info");
  }
  if (action.id === "build_quality_backlinks") {
    add("Target prospect list (DR 50+, topically relevant)", "info");
  }
  if (action.id === "diversify_traffic_channels") {
    add("Existing audience size on chosen channel", "info");
  }

  /* Approval: anything that touches public-facing pages or budget */
  if (action.id.includes("title") || action.id === "rewrite_meta_description") {
    add("Client sign-off on new titles/descriptions", "approval");
  }
  if (action.id === "consolidate_cannibalized_pages" || action.id === "prune_low_quality_pages") {
    add("Client approval for URL redirects / removal", "approval");
  }
  if (action.id === "launch_brand_content_series" || action.id === "create_comparison_page") {
    add("Client approval of content angle / messaging", "approval");
  }
  if (action.id === "build_quality_backlinks") {
    add("Budget approval (if outreach is outsourced)", "approval");
  }

  /* Generic inputs the action specified but PM hasn't filled in yet */
  for (const inputDef of action.inputs) {
    if (inputDef.required && (inputs[inputDef.key] == null || inputs[inputDef.key] === "")) {
      add(`Input still required: ${inputDef.label}`, "info");
    }
  }

  return items;
}

function shortenUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.pathname.length > 1 ? u.pathname : u.host;
  } catch { return url.slice(0, 40); }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/* ─── Push enriched drafts → kanban_tasks ──────────────────── */

export async function bsPushScenarioToPm(body: any): Promise<any> {
  const { projectId, scenarioId, goalId, drafts, sequential, createdByEmail } = body;
  if (!projectId)             return { success: false, error: "projectId required" };
  if (!Array.isArray(drafts) || drafts.length === 0) return { success: false, error: "drafts array required" };

  /* Compose tag for filter view */
  let strategyTag = "strategy";
  if (scenarioId) {
    const { data } = await db().from("analytics_scenarios").select("name").eq("id", scenarioId).maybeSingle();
    if ((data as any)?.name) strategyTag = `strategy:${slugify((data as any).name)}`;
  } else if (goalId) {
    const { data } = await db().from("analytics_goals").select("name,metric").eq("id", goalId).maybeSingle();
    const label = (data as any)?.name || (data as any)?.metric;
    if (label) strategyTag = `strategy:${slugify(label)}`;
  }

  const createdCardIds: string[] = [];
  const createdCards: any[]     = [];
  const errors: string[]        = [];

  /* If sequential is true, chain depends_on through the prior card */
  let priorCardId: string | null = null;

  for (const draftRaw of drafts) {
    const draft = sanitizeDraft(draftRaw);
    if (!draft) { errors.push("Invalid draft — skipped"); continue; }

    /* Build source_refs */
    const sourceRefs: any[] = [{
      kind: draft.strategic_link.type,
      label: `${draft.strategic_link.type === "goal" ? "Goal" : "Scenario"}: ${draft.strategic_link.name}`,
      ref_id: draft.strategic_link.id,
    }];
    if (draft.expected_impact) {
      const impactSummary = summarizeImpact(draft.expected_impact);
      if (impactSummary) sourceRefs.push({ kind: "outcome", label: `Expected: ${impactSummary}` });
    }

    /* Compose row */
    const row: any = {
      project_id:             projectId,
      title:                  draft.title,
      description:            draft.description,
      card_type:              "custom",
      priority:               draft.priority,
      status:                 "todo",
      week:                   5,
      placed:                 false,
      estimated_hours:        draft.estimated_hours,
      requirements:           draft.requirements,
      depends_on:             sequential && priorCardId ? [priorCardId] : draft.depends_on,
      source:                 "strategy",
      source_refs:            sourceRefs,
      tags:                   ["strategy", strategyTag],
      assigned_to:            createdByEmail || null,
      strategic_link:         draft.strategic_link,
      target_start_date:      draft.target_start_date,
      target_completion_date: draft.target_completion_date,
      expected_impact:        draft.expected_impact,
      source_action_id:       draft.source_action_id,
    };

    try {
      const { data, error } = await db().from("kanban_tasks").insert(row).select("id").single();
      if (error) { errors.push(error.message); continue; }
      const newId = (data as any).id;
      createdCardIds.push(newId);
      createdCards.push({ id: newId, title: draft.title, target_completion_date: draft.target_completion_date });
      priorCardId = newId;
    } catch (e: any) {
      errors.push(e?.message || "insert failed");
    }
  }

  /* If pushed from a goal, link the scenario to the goal too (if not already) */
  if (goalId && scenarioId) {
    try {
      const { data: g } = await db().from("analytics_goals")
        .select("linked_scenario_ids").eq("id", goalId).maybeSingle();
      const ids = new Set<string>(((g as any)?.linked_scenario_ids || []) as string[]);
      if (!ids.has(scenarioId)) {
        ids.add(scenarioId);
        await db().from("analytics_goals")
          .update({ linked_scenario_ids: [...ids], updated_at: new Date().toISOString() })
          .eq("id", goalId);
      }
    } catch { /* non-fatal */ }
  }

  return {
    success: createdCardIds.length > 0,
    cardIds: createdCardIds,
    cards:   createdCards,
    errors:  errors.length > 0 ? errors : undefined,
    summary: {
      created: createdCardIds.length,
      failed:  errors.length,
      tag:     strategyTag,
    },
  };
}

function sanitizeDraft(d: any): CardDraft | null {
  if (!d || typeof d !== "object") return null;
  if (!d.title || !d.source_action_id || !d.strategic_link) return null;

  /* Normalize requirements */
  const reqs: DependencyItem[] = Array.isArray(d.requirements)
    ? d.requirements
        .filter((r: any) => r && r.label)
        .map((r: any, i: number) => ({
          id:       r.id || `r${i}`,
          label:    String(r.label).slice(0, 500),
          category: ["access","content","info","approval","task_prereq"].includes(r.category) ? r.category : "info",
          met:      !!r.met,
          prereq_card_id: r.prereq_card_id || undefined,
        }))
    : [];

  return {
    source_action_id:       String(d.source_action_id),
    title:                  String(d.title).slice(0, 200),
    description:            String(d.description || "").slice(0, 8000),
    estimated_hours:        Math.max(0.5, Math.min(500, Number(d.estimated_hours) || 1)),
    strategic_link:         d.strategic_link,
    expected_impact:        d.expected_impact || {},
    target_start_date:      String(d.target_start_date || iso(new Date())),
    target_completion_date: String(d.target_completion_date || iso(new Date())),
    priority:               ["low","medium","high"].includes(d.priority) ? d.priority : "medium",
    requirements:           reqs,
    depends_on:             Array.isArray(d.depends_on) ? d.depends_on.filter((x: any) => typeof x === "string") : [],
    action_inputs:          d.action_inputs || {},
  };
}

function summarizeImpact(impact: Record<string, ImpactRange>): string {
  const parts: string[] = [];
  for (const [k, range] of Object.entries(impact)) {
    if (!range || range.min == null || range.max == null) continue;
    const mid = (range.min + range.max) / 2;
    if (range.unit === "position_delta") {
      parts.push(`${mid > 0 ? "+" : ""}${mid.toFixed(1)} position`);
    } else if (range.unit === "percent") {
      parts.push(`${mid > 0 ? "+" : ""}${mid.toFixed(0)}% ${k}`);
    }
  }
  return parts.slice(0, 3).join(" · ");
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50);
}

/* ─── Query strategy cards ──────────────────────────────────── */

export async function bsGetStrategyCards(body: any): Promise<any> {
  const { projectId, scenarioId, goalId, statusFilter } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    let q = db().from("kanban_tasks")
      .select("id,title,description,status,priority,strategic_link,target_start_date,target_completion_date,expected_impact,source_action_id,requirements,depends_on,estimated_hours,tags,created_at,updated_at,executed_at,verified_at,assigned_to")
      .eq("project_id", projectId)
      .not("strategic_link", "is", null)
      .order("target_completion_date", { ascending: true, nullsFirst: false });

    if (statusFilter) q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    /* In-memory filter for strategic_link.id since it's nested in jsonb */
    let cards = (data || []) as any[];
    if (scenarioId) cards = cards.filter(c => c.strategic_link?.type === "scenario" && c.strategic_link?.id === scenarioId);
    if (goalId)     cards = cards.filter(c => c.strategic_link?.type === "goal"     && c.strategic_link?.id === goalId);

    return { success: true, cards, total: cards.length };
  } catch (e: any) {
    return { success: false, error: e?.message || "query failed" };
  }
}

/* ─── Health rollup ─────────────────────────────────────────── */

export async function bsGetStrategyHealth(body: any): Promise<any> {
  const { projectId, scenarioId, goalId } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  const list = await bsGetStrategyCards({ projectId, scenarioId, goalId });
  if (!list.success) return list;
  const cards = list.cards as any[];

  const total = cards.length;
  const counts = { todo: 0, in_progress: 0, done: 0, blocked: 0, other: 0 };
  let blockerCount = 0;
  let unmetReqs = 0;
  let upcomingDeadline7d = 0;
  let overdue = 0;
  const today = new Date().toISOString().slice(0, 10);
  const inSevenDays = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  for (const c of cards) {
    const status = (c.status || "todo") as keyof typeof counts;
    if (status in counts) counts[status]++;
    else counts.other++;

    /* Count dependency items that aren't met */
    if (Array.isArray(c.requirements)) {
      for (const r of c.requirements) {
        if (!r.met) unmetReqs++;
      }
    }
    /* Blocked = depends_on is non-empty AND upstream not done.
       Cheap proxy: if depends_on populated, count as potentially blocked. */
    if (Array.isArray(c.depends_on) && c.depends_on.length > 0 && c.status !== "done") {
      blockerCount++;
    }
    /* Deadlines */
    if (c.target_completion_date && c.status !== "done") {
      if (c.target_completion_date < today) overdue++;
      else if (c.target_completion_date <= inSevenDays) upcomingDeadline7d++;
    }
  }

  const completionPct = total > 0 ? (counts.done / total) * 100 : 0;

  return {
    success: true,
    health: {
      total,
      counts,
      completion_pct:    Number(completionPct.toFixed(1)),
      unmet_dependencies: unmetReqs,
      blocked_or_dependent: blockerCount,
      upcoming_deadline_7d: upcomingDeadline7d,
      overdue,
    },
  };
}

/* ─── Update card dependencies (post-push refinement) ────────── */

export async function bsUpdateCardDependencies(body: any): Promise<any> {
  const { cardId, requirements } = body;
  if (!cardId) return { success: false, error: "cardId required" };
  if (!Array.isArray(requirements)) return { success: false, error: "requirements array required" };

  /* Normalize using same logic as sanitizeDraft */
  const cleaned: DependencyItem[] = requirements
    .filter((r: any) => r && r.label)
    .map((r: any, i: number) => ({
      id:       r.id || `r${i}`,
      label:    String(r.label).slice(0, 500),
      category: ["access","content","info","approval","task_prereq"].includes(r.category) ? r.category : "info",
      met:      !!r.met,
      prereq_card_id: r.prereq_card_id || undefined,
    }));

  try {
    const { data, error } = await db().from("kanban_tasks")
      .update({ requirements: cleaned, updated_at: new Date().toISOString() })
      .eq("id", cardId).select("id,requirements").single();
    if (error) return { success: false, error: error.message };
    return { success: true, card: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "update failed" };
  }
}
