/* ════════════════════════════════════════════════════════════════
   api/lib/season-orchestrator.ts
   Phase 7 — S.E.A.S.O.N. orchestrator: handles natural-language input.

   v1 intent classes (templated — LLM artifacts come in v2):
     • summarize  — "summarize this week", "what's been going on", "give me a recap"
     • explain    — "why is X slipping?", "what happened to Y", "explain the dip"
     • attention  — "what should i look at", "what's blocking us", "anything urgent"
     • verify     — "is the +18% number real?", "where does this come from"
     • status     — "how's project doing", "where are we"
     • unknown    — graceful fallback with examples

   Each intent returns a structured plan response with streaming-friendly
   chunks the UI can type out character by character.

   Plus activity log read for the behind-the-scenes drawer.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { bsSeasonBriefing } from "./season-attention.js";

export interface ResponseChunk {
  kind:      "plain" | "technical" | "artifact" | "action" | "verify";
  content:   string;
  detail?:   any;
}

export interface CommandResponse {
  intent:        string;
  confidence:    number;
  chunks:        ResponseChunk[];
  artifacts?:    any[];       // structured artifacts (plans, drafts) for v2
  actions?:      Array<{ id: string; label: string; payload?: any }>;
  honest_note?:  string;      // when S.E.A.S.O.N. should disclose uncertainty
}

/* ─── Main endpoint ──────────────────────────────────────────── */

export async function bsSeasonCommand(body: any): Promise<any> {
  const { projectId, input } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!input || typeof input !== "string") return { success: false, error: "input required" };

  const text = input.trim().toLowerCase();
  if (text.length === 0) return { success: false, error: "Empty input" };

  /* Intent detection — keyword routing for v1 */
  const intent = detectIntent(text);

  let response: CommandResponse;
  try {
    if (intent === "summarize") {
      response = await handleSummarize(projectId);
    } else if (intent === "attention") {
      response = await handleAttention(projectId);
    } else if (intent === "status") {
      response = await handleStatus(projectId);
    } else if (intent === "explain") {
      response = await handleExplain(projectId, text);
    } else if (intent === "verify") {
      response = await handleVerify(projectId, text);
    } else {
      /* Unknown intent — hand to the LLM brain instead of the dead-end fallback */
      try {
        const { seasonLlmHandle } = await import("./season-llm.js");
        const llm = await seasonLlmHandle({ projectId, input });
        response = {
          intent:       llm.intent,
          confidence:   llm.confidence,
          chunks:       llm.chunks as any,
          artifacts:    llm.artifacts,
          actions:      llm.actions,
          honest_note:  llm.honest_note,
        };
      } catch (llmErr: any) {
        /* LLM failed entirely — fall back to honest template */
        response = handleUnknown(text);
        response.honest_note = (response.honest_note || "") + ` (LLM brain unavailable: ${llmErr?.message || 'unknown'})`;
      }
    }
  } catch (e: any) {
    response = {
      intent: "error",
      confidence: 0,
      chunks: [{
        kind: "plain",
        content: `I hit a snag handling that. Honest answer: ${e?.message || "unknown error"}. Give me a sec and try rephrasing, or try one of the suggestions below.`,
      }],
      actions: [
        { id: "try_summarize", label: "Summarize this week" },
        { id: "try_attention", label: "What needs me today?" },
      ],
    };
  }

  /* Log the intent — for the behind-the-scenes feed */
  try {
    await db().from("activity_log").insert({
      project_id: projectId,
      event_type: "intent_handled",
      source:     "user",
      headline:   `User asked: "${input.slice(0, 80)}${input.length > 80 ? '…' : ''}"`,
      detail:     `Interpreted as: ${intent}`,
      technical:  { input, intent, confidence: response.confidence },
      severity:   "info",
    });
  } catch { /* non-fatal */ }

  return { success: true, response };
}

/* ─── Intent detection (keyword router) ──────────────────────── */

function detectIntent(text: string): string {
  if (/(summari[sz]e|recap|what.{1,10}(been |going on|happened.{1,15}this week)|wrap.?up|digest)/i.test(text)) return "summarize";
  if (/(why|explain|what.{1,5}happen|root cause|slipping|behind|off.?track|dip)/i.test(text)) return "explain";
  if (/(what should i|what needs|urgent|blocking|today|focus|next)/i.test(text)) return "attention";
  if (/(verify|is.{1,10}real|source|where.{1,10}from|prove|fact.?check|honest)/i.test(text)) return "verify";
  if (/(status|how.{1,5}doing|where are we|overall|health)/i.test(text)) return "status";
  return "unknown";
}

/* ─── Intent handlers ────────────────────────────────────────── */

async function handleSummarize(projectId: string): Promise<CommandResponse> {
  /* Pull last 7 days of activity */
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [cardsRes, strategiesRes, activityRes, integrationsRes] = await Promise.all([
    db().from("kanban_tasks").select("id,title,status,executed_at,updated_at").eq("project_id", projectId).gte("updated_at", sevenDaysAgo).limit(200),
    db().from("strategies").select("id,name,status,finalized_at,started_at,concluded_at,actual_impact").eq("project_id", projectId).gte("updated_at", sevenDaysAgo).limit(50),
    db().from("activity_log").select("event_type,headline,severity,created_at").eq("project_id", projectId).gte("created_at", sevenDaysAgo).limit(200),
    db().from("project_integrations").select("provider,last_pull_at").eq("project_id", projectId),
  ]);

  const cards     = (cardsRes.data || []) as any[];
  const strategies= (strategiesRes.data || []) as any[];
  const activity  = (activityRes.data || []) as any[];
  const integrations = (integrationsRes.data || []) as any[];

  const cardsDone     = cards.filter(c => c.status === "done").length;
  const cardsMoved    = cards.filter(c => c.status === "in_progress").length;
  const strategiesAdv = strategies.filter(s => s.status === "executing" || s.status === "measuring").length;
  const strategiesConcluded = strategies.filter(s => s.concluded_at).length;
  const gsc = integrations.find(i => i.provider === "gsc")?.last_pull_at;
  const ga4 = integrations.find(i => i.provider === "ga4")?.last_pull_at;

  const lines: ResponseChunk[] = [];

  /* Opening */
  lines.push({
    kind: "plain",
    content: `Here's the last 7 days, in plain English:`,
  });

  /* Card movement */
  if (cardsDone > 0 || cardsMoved > 0) {
    lines.push({
      kind: "plain",
      content: `${cardsDone} card${cardsDone === 1 ? '' : 's'} ${cardsDone === 1 ? 'was' : 'were'} completed. ${cardsMoved} ${cardsMoved === 1 ? 'is' : 'are'} actively in progress.`,
    });
  } else {
    lines.push({
      kind: "plain",
      content: `No cards completed this week. ${cardsMoved} card${cardsMoved === 1 ? '' : 's'} in progress.`,
    });
  }

  /* Strategies */
  if (strategiesAdv > 0) {
    lines.push({
      kind: "plain",
      content: `${strategiesAdv} ${strategiesAdv === 1 ? 'strategy is' : 'strategies are'} actively executing or being measured.`,
    });
  }
  if (strategiesConcluded > 0) {
    lines.push({
      kind: "plain",
      content: `${strategiesConcluded} ${strategiesConcluded === 1 ? 'strategy was' : 'strategies were'} concluded this week.`,
    });
  }

  /* Impact */
  const withImpact = strategies.filter(s => s.actual_impact?.summary?.gsc_clicks_lift_pct != null);
  if (withImpact.length > 0) {
    const avgLift = withImpact.reduce((a, s) => a + s.actual_impact.summary.gsc_clicks_lift_pct, 0) / withImpact.length;
    lines.push({
      kind: "plain",
      content: `Average GSC click lift across measuring strategies: ${avgLift > 0 ? '+' : ''}${avgLift.toFixed(1)}%.`,
    });
  }

  /* Activity */
  if (activity.length > 0) {
    const accessEvents = activity.filter(a => a.event_type === "access_granted" || a.event_type === "approval_received").length;
    if (accessEvents > 0) {
      lines.push({ kind: "plain", content: `${accessEvents} blocker${accessEvents === 1 ? '' : 's'} resolved this week (access/approvals coming through).` });
    }
  }

  /* Freshness honest note */
  let honest_note: string | undefined;
  if (gsc) {
    const days = Math.floor((Date.now() - new Date(gsc).getTime()) / 86_400_000);
    if (days > 7) honest_note = `Heads up: GSC data is ${days} days old. The above reflects analytics-pulled-then, not analytics-as-of-now.`;
  } else {
    honest_note = `GSC isn't connected, so this summary is missing search performance changes. Want me to walk you through connecting it?`;
  }

  /* Verification */
  lines.push({
    kind: "verify",
    content: `Sources: kanban_tasks (last 7d updates), strategies table, activity_log.`,
    detail: { gsc_last_pull: gsc, ga4_last_pull: ga4, cards_examined: cards.length, strategies_examined: strategies.length, activity_events: activity.length },
  });

  return {
    intent: "summarize",
    confidence: 0.9,
    chunks: lines,
    actions: [
      { id: "open_pipeline",   label: "Open the pipeline board" },
      { id: "draft_client_recap", label: "Draft a client recap I can send" },
    ],
    honest_note,
  };
}

async function handleAttention(projectId: string): Promise<CommandResponse> {
  const r = await bsSeasonBriefing({ projectId });
  if (!r.success) {
    return {
      intent: "attention",
      confidence: 0.95,
      chunks: [{ kind: "plain", content: `I couldn't gather attention items right now. Reason: ${r.error}` }],
    };
  }
  const b = r.briefing;
  const chunks: ResponseChunk[] = [];

  if (b.attention.length === 0) {
    chunks.push({ kind: "plain", content: "Nothing urgent. Could focus on the next stage of an active strategy, or start a new one." });
  } else {
    chunks.push({ kind: "plain", content: `${b.attention.length} ${b.attention.length === 1 ? 'thing' : 'things'} ranked from most urgent:` });
    b.attention.slice(0, 5).forEach((item: any, i: number) => {
      chunks.push({ kind: "plain", content: `${i + 1}. ${item.headline}` });
    });
  }

  if (b.honest_gaps.length > 0) {
    chunks.push({
      kind: "plain",
      content: `Things I couldn't check: ${b.honest_gaps.join(' · ')}`,
    });
  }

  return {
    intent: "attention",
    confidence: 0.95,
    chunks,
    actions: b.attention.slice(0, 3).map((item: any, i: number) => ({
      id: `handle_attention_${i}`,
      label: item.action_id === "resolve_blocker" ? "Take me to the right store" : `Open this`,
      payload: item,
    })),
  };
}

async function handleStatus(projectId: string): Promise<CommandResponse> {
  const r = await bsSeasonBriefing({ projectId });
  if (!r.success) {
    return { intent: "status", confidence: 0.9, chunks: [{ kind: "plain", content: `Couldn't pull status: ${r.error}` }] };
  }
  const b = r.briefing;
  return {
    intent: "status",
    confidence: 0.9,
    chunks: [
      { kind: "plain", content: b.status_summary },
      { kind: "plain", content: `${b.freshness.strategies_seen} active ${b.freshness.strategies_seen === 1 ? 'strategy' : 'strategies'}, ${b.freshness.goals_seen} ${b.freshness.goals_seen === 1 ? 'goal' : 'goals'} in play.` },
      { kind: "verify", content: "Sources: strategies, analytics_goals, kanban_tasks, integrations, blockers", detail: b.freshness },
    ],
  };
}

async function handleExplain(projectId: string, text: string): Promise<CommandResponse> {
  /* v1: explains the most recently off-track strategy. v2 will parse target entity. */
  const { data: strategies } = await db().from("strategies").select("*").eq("project_id", projectId).order("updated_at",{ ascending: false }).limit(10);
  const offTrack = (strategies || []).find((s: any) => s.on_track === false);

  if (!offTrack) {
    return {
      intent: "explain",
      confidence: 0.7,
      chunks: [
        { kind: "plain", content: "Nothing is off-track right now that I can find. Try naming a specific strategy or page and I'll go deeper." },
      ],
      honest_note: "v1 of S.E.A.S.O.N. — I look at off-track strategies but don't yet parse specific entities you name. If you tell me what to look at exactly, I can dig.",
    };
  }

  const chunks: ResponseChunk[] = [];
  chunks.push({ kind: "plain", content: `"${offTrack.name}" is the one pacing behind. Here's what I see:` });

  /* Read its blockers */
  const blockers = (await import("./pm-blockers.js")).bsGetStrategyBlockers
    ? await (await import("./pm-blockers.js")).bsGetStrategyBlockers({ projectId })
    : { success: false };
  let hardBlocker: any = null;
  if ((blockers as any).success) {
    const strategicBlockers = ((blockers as any).blockers || []).filter((b: any) =>
      b.blocks.some((blk: any) => blk.type === "card" && offTrack.card_ids.includes(blk.id))
    );
    hardBlocker = strategicBlockers.find((b: any) => b.required);
  }

  if (hardBlocker) {
    chunks.push({
      kind: "plain",
      content: `Most likely cause: the strategy is waiting on "${hardBlocker.label}". That's blocking ${hardBlocker.block_summary.cards} card${hardBlocker.block_summary.cards === 1 ? '' : 's'}.`,
    });
  } else if (offTrack.actual_impact?.summary?.gsc_clicks_lift_pct != null) {
    chunks.push({
      kind: "plain",
      content: `Actual GSC lift is ${offTrack.actual_impact.summary.gsc_clicks_lift_pct.toFixed(1)}%. That's below what we projected.`,
    });
    chunks.push({
      kind: "plain",
      content: `Common reason at this stage: search engine re-evaluation takes 14–21 days. We may just be too early. Want me to recompute trajectory?`,
    });
  } else {
    chunks.push({
      kind: "plain",
      content: `Not enough data yet to point at a single cause. Strategy was finalized ${offTrack.finalized_at ? new Date(offTrack.finalized_at).toLocaleDateString() : 'recently'}.`,
    });
  }

  chunks.push({
    kind: "verify",
    content: "Source: strategies table + blockers derivation",
    detail: { strategy: offTrack.id, status: offTrack.status },
  });

  return {
    intent: "explain",
    confidence: 0.75,
    chunks,
    actions: [
      { id: "open_strategy", label: "Open the strategy detail", payload: { strategyId: offTrack.id } },
    ],
    honest_note: "v1 explanation is template-based. Once I get LLM analysis wired (next ship), I'll give you root-cause analysis with reasoning chain.",
  };
}

async function handleVerify(projectId: string, text: string): Promise<CommandResponse> {
  /* v1: returns provenance snapshot for the project. */
  const { bsGetAnalyticsProvenance } = await import("./pm-analytics-provenance.js");
  const r = await bsGetAnalyticsProvenance({ projectId });
  if (!r.success) {
    return { intent: "verify", confidence: 0.8, chunks: [{ kind: "plain", content: "Couldn't pull provenance: " + (r.error || "unknown") }] };
  }
  const p = r.provenance;
  const chunks: ResponseChunk[] = [];
  chunks.push({ kind: "plain", content: "Here's where the numbers come from:" });
  if (p.gsc.connected) {
    chunks.push({
      kind: "plain",
      content: `GSC: ${p.gsc.resource_id} (${p.gsc.property_type === 'domain' ? 'domain property' : 'URL prefix'}), data state ${p.gsc.data_state}, last pulled ${p.gsc.last_pull_at ? new Date(p.gsc.last_pull_at).toLocaleString() : 'never'}.`,
    });
  } else {
    chunks.push({ kind: "plain", content: "GSC: not connected. Any search metric here is null." });
  }
  if (p.ga4.connected) {
    chunks.push({
      kind: "plain",
      content: `GA4: property ${p.ga4.property_id}, filter ${p.ga4.channel_filter}, last pulled ${p.ga4.last_pull_at ? new Date(p.ga4.last_pull_at).toLocaleString() : 'never'}.`,
    });
  } else {
    chunks.push({ kind: "plain", content: "GA4: not connected." });
  }

  chunks.push({
    kind: "verify",
    content: "If you want the full methodology and known caveats, open the Provenance Banner in Data Room → Analytics.",
    detail: p,
  });

  return {
    intent: "verify",
    confidence: 0.95,
    chunks,
    actions: [{ id: "open_provenance", label: "Open Provenance details" }],
  };
}

function handleUnknown(text: string): CommandResponse {
  return {
    intent: "unknown",
    confidence: 0.3,
    chunks: [
      {
        kind: "plain",
        content: `I'm not sure how to handle that yet. Honest answer: v1 of me handles summaries, attention triage, status, simple explanations, and verification. The full natural-language understanding (turning "rank me for X" into a complete plan with content briefs) ships in v2.`,
      },
      {
        kind: "plain",
        content: `Try one of these and I'll do my best:`,
      },
    ],
    actions: [
      { id: "try_summarize", label: "Summarize this week" },
      { id: "try_attention", label: "What needs me today?" },
      { id: "try_status",    label: "How's the project doing?" },
      { id: "try_verify",    label: "Where do the numbers come from?" },
    ],
  };
}

/* ─── Activity log read ──────────────────────────────────────── */

export async function bsSeasonActivity(body: any): Promise<any> {
  const { projectId, limit } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const { data, error } = await db().from("activity_log")
      .select("id,event_type,source,headline,detail,technical,severity,strategy_id,goal_id,card_id,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit || 50, 200));
    if (error) return { success: false, error: error.message };
    return { success: true, events: data || [], count: data?.length || 0 };
  } catch (e: any) {
    return { success: false, error: e?.message || "activity read failed" };
  }
}
