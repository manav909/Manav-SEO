/* ════════════════════════════════════════════════════════════════
   api/lib/season-attention.ts
   Phase 7 — S.E.A.S.O.N.: status checks + attention triage.

   When the boss opens the app, this endpoint has already run.
   It parallel-pulls everything relevant, ranks what needs attention,
   surfaces quiet wins, and writes activity log entries.

   Returns the structured briefing the UI types out character by
   character. Plain English. Honest about gaps. Source-stamped.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

export interface BriefingItem {
  kind:        "attention" | "win" | "info";
  severity:    "info" | "success" | "warning" | "critical";
  headline:    string;          // plain English, one line
  detail?:     string;          // optional expansion
  source:      string;          // where the data came from (verification)
  technical?:  any;             // raw data for verification trail
  action_id?:  string;          // links to a possible action (e.g. "nudge_client")
  age_days?:   number;
  linked_entity?: { type: "strategy" | "goal" | "card" | "blocker"; id: string };
}

export interface Briefing {
  generated_at:        string;
  project_id:          string;
  project_name:        string;
  greeting_phrase:     string;        // the typed opener
  status_summary:      string;        // 1-sentence overview
  attention:           BriefingItem[];
  quiet_wins:          BriefingItem[];
  honest_gaps:         string[];      // things S.E.A.S.O.N. would have checked but couldn't
  freshness: {                        // when each data source was last touched
    gsc_last_pull:     string | null;
    ga4_last_pull:     string | null;
    intel_generated:   string | null;
    strategies_seen:   number;
    goals_seen:        number;
  };
}

/* ─── Main endpoint ──────────────────────────────────────────── */

export async function bsSeasonBriefing(body: any): Promise<any> {
  const { projectId } = body;
  if (!projectId) return { success: false, error: "projectId required" };

  try {
    /* Parallel-read everything we care about */
    const [
      projectRes, integrationsRes, strategiesRes, goalsRes, blockersRes, intelRes, recentCardsRes,
    ] = await Promise.all([
      db().from("projects").select("id,project_name,status").eq("id", projectId).maybeSingle(),
      db().from("project_integrations").select("provider,last_pull_at,last_pull_status").eq("project_id", projectId),
      db().from("strategies").select("id,name,status,horizon,card_ids,on_track,actual_impact,target_end_date,finalized_at,paused_at,linked_goal_ids").eq("project_id", projectId).neq("status","concluded").limit(50),
      db().from("analytics_goals").select("id,name,metric,target_value,target_date,baseline_value,status").eq("project_id", projectId).eq("status","active").limit(20),
      computeBlockers(projectId),
      db().from("project_knowledge").select("field_value,updated_at").eq("project_id", projectId).eq("category","analytics").eq("field_key","analytics_intelligence").maybeSingle(),
      db().from("kanban_tasks").select("id,title,status,target_completion_date,strategic_link,executed_at,updated_at").eq("project_id", projectId).order("updated_at",{ ascending: false }).limit(30),
    ]);

    const project       = projectRes.data as any;
    const integrations  = (integrationsRes.data || []) as any[];
    const strategies    = (strategiesRes.data || []) as any[];
    const goals         = (goalsRes.data || []) as any[];
    const blockers      = blockersRes.blockers || [];
    const intelRow      = intelRes.data as any;
    const recentCards   = (recentCardsRes.data || []) as any[];

    if (!project) return { success: false, error: "Project not found" };

    /* Build briefing */
    const attention: BriefingItem[] = [];
    const quiet_wins: BriefingItem[] = [];
    const honest_gaps: string[] = [];

    /* — Honest gap checks — */
    const gsc = integrations.find(i => i.provider === "gsc");
    const ga4 = integrations.find(i => i.provider === "ga4");
    if (!gsc?.last_pull_at) honest_gaps.push("GSC isn't connected yet — I can't speak to ranking changes without it.");
    if (!ga4?.last_pull_at) honest_gaps.push("GA4 isn't connected yet — I can't see session/conversion movement.");
    if (gsc?.last_pull_at) {
      const ageH = (Date.now() - new Date(gsc.last_pull_at).getTime()) / 3_600_000;
      if (ageH > 168) honest_gaps.push(`GSC data is ${Math.floor(ageH/24)} days old. Worth a fresh pull.`);
    }
    if (!intelRow) honest_gaps.push("Analytics Intelligence hasn't been computed yet — I'm reading raw data without context.");

    /* — Attention: blockers — */
    const today = new Date().toISOString().slice(0,10);
    for (const b of blockers.slice(0, 6)) {
      if (!b.required) continue;
      const ageStr = b.age_days != null ? `${b.age_days}d old` : "unresolved";
      attention.push({
        kind:     "attention",
        severity: b.age_days != null && b.age_days > 14 ? "critical" : b.age_days != null && b.age_days > 7 ? "warning" : "info",
        headline: `${plainBlocker(b.label, b.store)} · blocking ${b.block_summary.cards} card${b.block_summary.cards === 1 ? '' : 's'} (${ageStr})`,
        detail:   b.notes || undefined,
        source:   `Resolution Store (${b.store})`,
        technical: b,
        action_id: "resolve_blocker",
        age_days: b.age_days,
      });
    }

    /* — Attention: off-track strategies — */
    for (const s of strategies) {
      if (s.on_track === false) {
        const liftPct = s.actual_impact?.summary?.gsc_clicks_lift_pct;
        attention.push({
          kind:     "attention",
          severity: "warning",
          headline: `${s.name} is pacing behind plan${liftPct != null ? ` (actual ${liftPct > 0 ? '+' : ''}${liftPct.toFixed(0)}% vs expected)` : ''}`,
          source:   "Strategy impact tracker",
          technical: s,
          linked_entity: { type: "strategy", id: s.id },
        });
      }
    }

    /* — Attention: overdue cards — */
    const overdue = recentCards.filter(c => c.status !== "done" && c.target_completion_date && c.target_completion_date < today);
    if (overdue.length > 0) {
      attention.push({
        kind:     "attention",
        severity: overdue.length > 3 ? "warning" : "info",
        headline: `${overdue.length} card${overdue.length === 1 ? ' is' : 's are'} overdue${overdue.length <= 3 ? ` (${overdue.map(c => `"${c.title.slice(0,40)}"`).join(', ')})` : ''}`,
        source:   "Kanban (target_completion_date)",
        technical: overdue.map(c => ({ id: c.id, title: c.title, due: c.target_completion_date })),
      });
    }

    /* — Attention: goals nearing deadline without progress — */
    for (const g of goals) {
      const daysToDeadline = Math.floor((new Date(g.target_date).getTime() - Date.now()) / 86_400_000);
      if (daysToDeadline > 0 && daysToDeadline <= 30) {
        attention.push({
          kind:     "attention",
          severity: daysToDeadline <= 7 ? "warning" : "info",
          headline: `Goal "${g.name || g.metric}" deadline in ${daysToDeadline} days`,
          source:   "Goal Engine",
          technical: g,
          linked_entity: { type: "goal", id: g.id },
        });
      }
    }

    /* — Quiet wins: recently-done cards — */
    const recentlyDone = recentCards
      .filter(c => c.status === "done" && c.executed_at && (Date.now() - new Date(c.executed_at).getTime()) < 7 * 86_400_000)
      .slice(0, 4);
    for (const c of recentlyDone) {
      quiet_wins.push({
        kind: "win",
        severity: "success",
        headline: `Completed "${c.title}"`,
        source: "Kanban",
        technical: c,
      });
    }

    /* — Quiet wins: strategies that just got finalized — */
    const justFinalized = strategies
      .filter(s => s.finalized_at && (Date.now() - new Date(s.finalized_at).getTime()) < 7 * 86_400_000 && s.status !== "drafting");
    for (const s of justFinalized.slice(0, 2)) {
      quiet_wins.push({
        kind: "win",
        severity: "success",
        headline: `"${s.name}" is now in ${s.status === "resourcing" ? "Resourcing" : s.status === "executing" ? "Execution" : "Measurement"}`,
        source: "Strategies",
        technical: s,
      });
    }

    /* — Quiet wins: rising stars from intel — */
    if (intelRow) {
      try {
        const intel = JSON.parse(intelRow.field_value);
        if (Array.isArray(intel.risingStars)) {
          for (const r of intel.risingStars.slice(0, 2)) {
            quiet_wins.push({
              kind: "win",
              severity: "success",
              headline: `"${r.label || r.query || r.page}" climbed ${r.delta != null ? r.delta : 'noticeably'}${r.delta != null ? ' positions' : ''}`,
              source: "Analytics Intelligence",
              technical: r,
            });
          }
        }
      } catch { /* skip */ }
    }

    /* — Status summary sentence — */
    const statusSummary = composeStatusSummary({
      attention, quiet_wins,
      strategiesActive: strategies.filter(s => s.status === "executing" || s.status === "resourcing").length,
      goalsActive: goals.length,
    });

    /* — Greeting phrase (varies by time + state) — */
    const greetingPhrase = composeGreeting(attention.length, quiet_wins.length);

    /* — Log this status check — */
    try {
      await db().from("activity_log").insert({
        project_id: projectId,
        event_type: "status_check",
        source:     "system",
        headline:   "Status check on greeting",
        technical:  { attention_count: attention.length, win_count: quiet_wins.length, gap_count: honest_gaps.length },
        severity:   "info",
      });
    } catch { /* non-fatal */ }

    /* Sort attention by severity descending */
    const sevOrder: Record<string,number> = { critical: 0, warning: 1, info: 2, success: 3 };
    attention.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

    const briefing: Briefing = {
      generated_at: new Date().toISOString(),
      project_id:   projectId,
      project_name: project.project_name,
      greeting_phrase: greetingPhrase,
      status_summary: statusSummary,
      attention:    attention.slice(0, 8),
      quiet_wins:   quiet_wins.slice(0, 6),
      honest_gaps,
      freshness: {
        gsc_last_pull:   gsc?.last_pull_at || null,
        ga4_last_pull:   ga4?.last_pull_at || null,
        intel_generated: intelRow?.updated_at || null,
        strategies_seen: strategies.length,
        goals_seen:      goals.length,
      },
    };

    return { success: true, briefing };
  } catch (e: any) {
    return { success: false, error: e?.message || "briefing failed" };
  }
}

/* ─── Helpers ────────────────────────────────────────────────── */

async function computeBlockers(projectId: string): Promise<any> {
  try {
    const { bsGetStrategyBlockers } = await import("./pm-blockers.js");
    const r = await bsGetStrategyBlockers({ projectId });
    if (!r.success) return { blockers: [] };
    /* Enrich with age */
    const enriched = (r.blockers || []).map((b: any) => {
      const cardIds = b.blocks.filter((x: any) => x.type === "card").map((x: any) => x.id);
      return { ...b, age_days: null, _card_ids: cardIds };
    });
    return { blockers: enriched };
  } catch { return { blockers: [] }; }
}

/** Translate a technical blocker label into plain English. */
function plainBlocker(label: string, store: string): string {
  const l = label.toLowerCase();
  if (l.includes("cms"))             return "Client CMS access";
  if (l.includes("dev"))             return "Developer access";
  if (l.includes("search console"))  return "Search Console access";
  if (l.includes("analytics") || l.includes("ga4")) return "Analytics access";
  if (l.includes("outreach"))        return "Outreach tool access";
  if (l.includes("sign-off") || l.includes("approval")) {
    if (l.includes("title"))         return "Title sign-off from client";
    if (l.includes("meta"))          return "Meta description sign-off";
    if (l.includes("redirect"))      return "Redirect approval";
    if (l.includes("content"))       return "Content angle approval";
    return "Client sign-off";
  }
  if (l.includes("brief"))           return "Content brief";
  if (l.includes("copy"))            return "Approved copy";
  if (l.includes("baseline") || l.includes("psi")) return "Baseline metrics";
  if (l.includes("prospect"))        return "Prospect list";
  return label;  // fall back to raw label if no match
}

function composeStatusSummary(s: {
  attention: BriefingItem[]; quiet_wins: BriefingItem[];
  strategiesActive: number; goalsActive: number;
}): string {
  const a = s.attention.length;
  const w = s.quiet_wins.length;
  const crit = s.attention.filter(x => x.severity === "critical").length;
  if (a === 0 && w === 0) return `Things are quiet. ${s.strategiesActive} active ${s.strategiesActive === 1 ? 'strategy' : 'strategies'}, ${s.goalsActive} ${s.goalsActive === 1 ? 'goal' : 'goals'} in play.`;
  if (crit > 0)           return `${crit} thing${crit === 1 ? '' : 's'} need urgent attention. ${w} win${w === 1 ? '' : 's'} since you last checked.`;
  if (a > 0 && w > 0)     return `${a} thing${a === 1 ? '' : 's'} for you to look at. ${w} ${w === 1 ? 'win' : 'wins'} in the last week.`;
  if (a > 0)              return `${a} thing${a === 1 ? '' : 's'} need your eyes.`;
  return `${w} ${w === 1 ? 'win' : 'wins'} since you last checked. No fires.`;
}

function composeGreeting(attentionCount: number, winCount: number): string {
  const hour = new Date().getHours();
  const dayOfWeek = new Date().getDay(); // 0=Sun
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isMonday = dayOfWeek === 1;
  const isFriday = dayOfWeek === 5;
  const timeOfDay =
    hour < 5  ? "Up late" :
    hour < 12 ? "Good morning" :
    hour < 17 ? "Good afternoon" :
    hour < 22 ? "Good evening" : "Burning the midnight oil";

  /* Quiet day */
  if (attentionCount === 0 && winCount === 0) {
    if (isWeekend) return `${timeOfDay}. It's quiet — both because it's the weekend and because nothing's on fire. Take a breath or tell me what to work on.`;
    if (isMonday)  return `${timeOfDay}. Quiet start to the week. A good moment to plan something ambitious.`;
    return `${timeOfDay}. Nothing pressing. Where would you like to start?`;
  }
  /* All wins, no attention */
  if (attentionCount === 0) {
    if (winCount >= 4) return `${timeOfDay}. Good news only — ${winCount} wins to walk you through, nothing on fire.`;
    return `${timeOfDay}. Nothing urgent. ${winCount === 1 ? 'A small win' : 'A few wins'} to report.`;
  }
  /* A few things, mild */
  if (attentionCount <= 2) {
    if (isFriday) return `${timeOfDay}. Couple of loose ends before the weekend — nothing dramatic.`;
    return `${timeOfDay}. Couple of things while you were away — nothing dramatic.`;
  }
  /* Busy */
  if (attentionCount >= 5) return `${timeOfDay}. I've been busy. There's a lot on the desk, but it's all manageable — let's go through it.`;
  return `${timeOfDay}. I've been busy. Here's what landed on my desk.`;
}
