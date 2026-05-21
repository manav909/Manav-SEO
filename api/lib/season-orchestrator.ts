/* ════════════════════════════════════════════════════════════════
   api/lib/season-orchestrator.ts
   Phase 7c+ — S.E.A.S.O.N. orchestrator with RICH keyword responses.

   Each handler now returns SPECIFIC information — strategy names, card
   titles, blocker labels, real numbers — not generic counts. When real
   data is thin, the handler says what's needed to give a better answer
   instead of returning a useless empty response.

   Intents:
     • diagnose   — full system health check (NEW). User can type this.
     • summarize  — rich recap with named items
     • attention  — ranked attention list with names
     • status     — per-strategy state with names + impact
     • explain    — investigates the most relevant off-track item
     • verify     — provenance trail
     • help       — shows what S.E.A.S.O.N. can do
     • unknown    — falls through to the LLM brain
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
  artifacts?:    Array<{ kind: string; title: string; body: string }>;
  actions?:      Array<{ id: string; label: string; payload?: any }>;
  honest_note?:  string;
}

/* ─── Main endpoint ──────────────────────────────────────────── */

export async function bsSeasonCommand(body: any): Promise<any> {
  const { projectId, input } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  if (!input || typeof input !== "string") return { success: false, error: "input required" };

  const text = input.trim().toLowerCase();
  if (text.length === 0) return { success: false, error: "Empty input" };

  const intent = detectIntent(text);

  let response: CommandResponse;
  try {
    if (intent === "diagnose")        response = await handleDiagnose(projectId);
    else if (intent === "help")        response = handleHelp();
    else if (intent === "summarize")  response = await handleSummarize(projectId);
    else if (intent === "attention")  response = await handleAttention(projectId);
    else if (intent === "status")     response = await handleStatus(projectId);
    else if (intent === "explain")    response = await handleExplain(projectId, text);
    else if (intent === "verify")     response = await handleVerify(projectId);
    else {
      /* Hand to the LLM brain */
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
        response = handleUnknown(text);
        response.honest_note = (response.honest_note || "") +
          ` (LLM brain unavailable: ${llmErr?.message || 'unknown'}). Try "diagnose" to see what's broken.`;
      }
    }
  } catch (e: any) {
    response = {
      intent: "error",
      confidence: 0,
      chunks: [{
        kind: "plain",
        content: `I hit a snag handling that. Honest answer: ${e?.message || "unknown error"}. Try "diagnose" or rephrase.`,
      }],
      actions: [
        { id: "try_diagnose",  label: "Run diagnostic" },
        { id: "try_summarize", label: "Summarize this week" },
      ],
    };
  }

  try {
    await db().from("activity_log").insert({
      project_id: projectId,
      event_type: "intent_handled",
      source:     intent === "unknown" ? "llm" : "user",
      headline:   `Asked: "${input.slice(0, 80)}${input.length > 80 ? '…' : ''}"`,
      detail:     `Interpreted as: ${intent}`,
      technical:  { input, intent, confidence: response.confidence },
      severity:   "info",
    });
  } catch { /* non-fatal */ }

  return { success: true, response };
}

/* ─── Intent detection ──────────────────────────────────────── */

function detectIntent(text: string): string {
  if (/(diagn|health.?check|what.{1,5}working|self.?test|test the (brain|system|llm))/i.test(text))            return "diagnose";
  if (/^(help|what can you do|capabilities|what.{1,8}help)/i.test(text))                                         return "help";
  if (/(summari[sz]e|recap|what.{1,10}(been |going on|happened.{1,15}this week)|wrap.?up|digest)/i.test(text)) return "summarize";
  if (/(why|explain|what.{1,5}happen|root cause|slipping|behind|off.?track|dip)/i.test(text))                  return "explain";
  if (/(what should i|what needs|urgent|blocking|today|focus|next)/i.test(text))                                 return "attention";
  if (/(verify|is.{1,10}real|source|where.{1,10}from|prove|fact.?check|honest)/i.test(text))                    return "verify";
  if (/(status|how.{1,5}doing|where are we|overall|health)/i.test(text))                                         return "status";
  return "unknown";
}

/* ════════════════════════════════════════════════════════════
   HANDLER 1 — DIAGNOSE (new). Shows exactly what's working.
═══════════════════════════════════════════════════════════ */

async function handleDiagnose(projectId: string): Promise<CommandResponse> {
  const chunks: ResponseChunk[] = [];
  chunks.push({ kind: "plain", content: "Running a full self-check. Here's what I find:" });

  /* Check 1: project + freshness */
  const [projectRes, integRes, intelRes] = await Promise.all([
    db().from("projects").select("project_name,client_url,status").eq("id", projectId).maybeSingle(),
    db().from("project_integrations").select("provider,last_pull_at,last_pull_status").eq("project_id", projectId),
    db().from("project_knowledge").select("updated_at").eq("project_id", projectId).eq("category","analytics").eq("field_key","analytics_intelligence").maybeSingle(),
  ]);
  const project = projectRes.data as any;
  const integrations = (integRes.data || []) as any[];
  const gsc = integrations.find(i => i.provider === "gsc");
  const ga4 = integrations.find(i => i.provider === "ga4");

  const projectLine = project
    ? `Project: ${project.project_name}${project.client_url ? ` (${project.client_url})` : ''} · status ${project.status || 'unknown'}`
    : `Project: NOT FOUND in database — that's why nothing else can work`;
  chunks.push({ kind: "plain", content: `1. ${projectLine}` });

  const gscLine = gsc?.last_pull_at
    ? `GSC: connected · last pulled ${humanAge(gsc.last_pull_at)} ago${gsc.last_pull_status === 'error' ? ' (last pull errored)' : ''}`
    : `GSC: NOT CONNECTED — I can't speak to ranking changes without it`;
  chunks.push({ kind: "plain", content: `2. ${gscLine}` });

  const ga4Line = ga4?.last_pull_at
    ? `GA4: connected · last pulled ${humanAge(ga4.last_pull_at)} ago`
    : `GA4: NOT CONNECTED — no session or conversion data`;
  chunks.push({ kind: "plain", content: `3. ${ga4Line}` });

  const intelLine = intelRes.data?.updated_at
    ? `Analytics intelligence: computed ${humanAge(intelRes.data.updated_at as string)} ago`
    : `Analytics intelligence: NOT COMPUTED — go to Data Room → Analytics → "Refresh intelligence"`;
  chunks.push({ kind: "plain", content: `4. ${intelLine}` });

  /* Check 2: data volume */
  const [strategiesRes, goalsRes, cardsRes, blockersRes] = await Promise.all([
    db().from("strategies").select("id,name,status", { count: "exact" }).eq("project_id", projectId).neq("status","concluded"),
    db().from("analytics_goals").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status","active"),
    db().from("kanban_tasks").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    (async () => { try { const { bsGetStrategyBlockers } = await import("./pm-blockers.js"); return await bsGetStrategyBlockers({ projectId }); } catch { return { success: false, blockers: [] } as any; } })(),
  ]);
  const strategies = (strategiesRes.data || []) as any[];
  const blockers = (blockersRes as any).blockers || [];

  chunks.push({
    kind: "plain",
    content: `5. Project data: ${strategies.length} active strategy${strategies.length === 1 ? '' : 'ies'} · ${goalsRes.count || 0} active goal${goalsRes.count === 1 ? '' : 's'} · ${cardsRes.count || 0} card${cardsRes.count === 1 ? '' : 's'} · ${blockers.length} blocker${blockers.length === 1 ? '' : 's'}`,
  });

  /* Check 3: LLM brain readiness */
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  let llmLine: string;
  let llmReachable = false;
  if (!hasKey) {
    llmLine = `LLM brain: NOT CONFIGURED — ANTHROPIC_API_KEY missing from Vercel env. Add it: Vercel → your project → Settings → Environment Variables → key: ANTHROPIC_API_KEY, value: sk-ant-... (get from console.anthropic.com). Then redeploy.`;
  } else {
    /* Live ping with tiny call */
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 20,
          messages: [{ role: "user", content: "Reply with exactly: PING_OK" }],
        }),
      });
      if (res.ok) {
        const body = await res.json();
        const text = (body?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
        if (text.includes("PING_OK")) {
          llmReachable = true;
          llmLine = `LLM brain: REACHABLE and responsive · model claude-sonnet-4-20250514 · ready to handle natural-language queries`;
        } else {
          llmLine = `LLM brain: REACHED but returned unexpected output (${text.slice(0, 60)}). Strange but not blocking.`;
          llmReachable = true;
        }
      } else {
        const errBody = await res.text();
        llmLine = `LLM brain: REACHED Anthropic but got HTTP ${res.status}. Body: ${errBody.slice(0, 150)}. Check that ANTHROPIC_API_KEY is valid.`;
      }
    } catch (e: any) {
      llmLine = `LLM brain: COULD NOT REACH Anthropic — ${e?.message || 'network error'}. If you're on Vercel, this shouldn't happen. Check Vercel logs.`;
    }
  }
  chunks.push({ kind: "plain", content: `6. ${llmLine}` });

  /* Recent LLM usage */
  try {
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { count } = await db().from("activity_log")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("source", "llm")
      .gte("created_at", since);
    chunks.push({ kind: "plain", content: `7. LLM usage last 24h: ${count || 0} calls (daily cap ${process.env.SEASON_LLM_DAILY_CAP || 50})` });
  } catch { /* skip */ }

  /* Summary verdict */
  const issues: string[] = [];
  if (!project) issues.push("project not found");
  if (!gsc?.last_pull_at) issues.push("GSC not connected");
  if (!intelRes.data) issues.push("intelligence not computed");
  if (!hasKey) issues.push("LLM key missing");

  if (issues.length === 0) {
    chunks.push({ kind: "plain", content: "Verdict: everything is working. You can ask me anything." });
  } else {
    chunks.push({ kind: "plain", content: `Verdict: ${issues.length} thing${issues.length === 1 ? '' : 's'} to fix — ${issues.join(', ')}. The LLM brain ${llmReachable ? 'works but its answers will be thin because the underlying data is missing' : 'is unreachable'}.` });
  }

  chunks.push({
    kind: "verify",
    content: "Sources: projects, project_integrations, project_knowledge, strategies, analytics_goals, kanban_tasks, activity_log, live ping to api.anthropic.com",
    detail: { hasKey, llmReachable, integrations, strategies_count: strategies.length, blockers_count: blockers.length },
  });

  return {
    intent: "diagnose",
    confidence: 1,
    chunks,
    actions: [
      { id: "try_summarize", label: "Summarize this week" },
      { id: "try_help",      label: "Show me what I can ask" },
    ],
  };
}

/* ════════════════════════════════════════════════════════════
   HANDLER 2 — HELP. Plain-language directory.
═══════════════════════════════════════════════════════════ */

function handleHelp(): CommandResponse {
  return {
    intent: "help",
    confidence: 1,
    chunks: [
      { kind: "plain", content: "Here are the things I handle today, with example phrasings that work:" },
      { kind: "plain", content: `• "summarize this week" / "recap" / "what's been going on"` },
      { kind: "plain", content: `• "what should I look at today" / "anything urgent" / "what's blocking us"` },
      { kind: "plain", content: `• "how are we doing" / "overall status" / "where are we"` },
      { kind: "plain", content: `• "why is X slipping" / "explain the dip" / "what happened"` },
      { kind: "plain", content: `• "where do these numbers come from" / "verify"` },
      { kind: "plain", content: `• "diagnose" / "self-test" — shows you exactly what's working` },
      { kind: "plain", content: "For anything else (drafts, briefs, emails, custom questions) I route to my deeper LLM brain. Try things like: \"draft a content brief for /pricing\", \"write me a status email for the client\", \"what's the most interesting pattern in our data?\"" },
      { kind: "plain", content: "Press ? for the visual capabilities panel." },
    ],
    actions: [
      { id: "try_diagnose",  label: "Run diagnostic" },
      { id: "try_summarize", label: "Try a summary" },
    ],
  };
}

/* ════════════════════════════════════════════════════════════
   HANDLER 3 — SUMMARIZE (rich version).
═══════════════════════════════════════════════════════════ */

async function handleSummarize(projectId: string): Promise<CommandResponse> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [cardsRes, strategiesRes, activityRes, integrationsRes, allCardsRes] = await Promise.all([
    db().from("kanban_tasks").select("id,title,status,executed_at,updated_at,strategic_link,target_completion_date").eq("project_id", projectId).gte("updated_at", sevenDaysAgo).limit(200),
    db().from("strategies").select("id,name,status,finalized_at,started_at,concluded_at,actual_impact,target_end_date,on_track").eq("project_id", projectId).neq("status","drafting").limit(50),
    db().from("activity_log").select("event_type,headline,severity,created_at").eq("project_id", projectId).gte("created_at", sevenDaysAgo).limit(200),
    db().from("project_integrations").select("provider,last_pull_at").eq("project_id", projectId),
    db().from("kanban_tasks").select("id,title,status,target_completion_date").eq("project_id", projectId).neq("status","done").limit(40),
  ]);

  const cards     = (cardsRes.data || []) as any[];
  const strategies = (strategiesRes.data || []) as any[];
  const activity   = (activityRes.data || []) as any[];
  const integrations = (integrationsRes.data || []) as any[];
  const openCards  = (allCardsRes.data || []) as any[];

  const cardsDone  = cards.filter(c => c.status === "done");
  const cardsMoved = cards.filter(c => c.status === "in_progress");
  const gsc = integrations.find(i => i.provider === "gsc")?.last_pull_at;
  const ga4 = integrations.find(i => i.provider === "ga4")?.last_pull_at;

  const chunks: ResponseChunk[] = [];
  chunks.push({ kind: "plain", content: "Here's the last 7 days, in plain English:" });

  /* Cards completed — by NAME */
  if (cardsDone.length > 0) {
    const topDone = cardsDone.slice(0, 5).map(c => `"${c.title}"`).join(", ");
    chunks.push({
      kind: "plain",
      content: `${cardsDone.length} card${cardsDone.length === 1 ? '' : 's'} crossed the finish line: ${topDone}${cardsDone.length > 5 ? `, plus ${cardsDone.length - 5} more` : ''}.`,
    });
  } else if (cardsMoved.length > 0) {
    chunks.push({ kind: "plain", content: `Nothing closed out this week, but ${cardsMoved.length} ${cardsMoved.length === 1 ? 'card is' : 'cards are'} in flight.` });
  } else {
    chunks.push({ kind: "plain", content: "No card movement this week. Either everything's blocked, or there's nothing in motion — either way, worth a look." });
  }

  /* Strategy movement */
  const strategiesMoved = strategies.filter(s => (s.finalized_at && s.finalized_at >= sevenDaysAgo) || (s.started_at && s.started_at >= sevenDaysAgo) || (s.concluded_at && s.concluded_at >= sevenDaysAgo));
  if (strategiesMoved.length > 0) {
    const moveLines = strategiesMoved.map(s => {
      const event = s.concluded_at && s.concluded_at >= sevenDaysAgo ? `concluded` :
                    s.started_at && s.started_at >= sevenDaysAgo ? `started executing` :
                    `was finalized`;
      return `"${s.name}" ${event}`;
    });
    chunks.push({ kind: "plain", content: `Strategy changes: ${moveLines.join('; ')}.` });
  }

  /* Real impact lift — by strategy NAME */
  const withImpact = strategies.filter(s => s.actual_impact?.summary?.gsc_clicks_lift_pct != null);
  if (withImpact.length > 0) {
    const impactLines = withImpact.slice(0, 3).map((s: any) => {
      const lift = s.actual_impact.summary.gsc_clicks_lift_pct;
      const onTrack = s.on_track === true ? '✓ on track' : s.on_track === false ? '⚠ behind plan' : '';
      return `"${s.name}": ${lift > 0 ? '+' : ''}${Number(lift).toFixed(1)}% GSC clicks ${onTrack}`;
    });
    chunks.push({ kind: "plain", content: `Real impact: ${impactLines.join(' · ')}.` });
  }

  /* What's still open + ageing */
  const today = new Date().toISOString().slice(0, 10);
  const overdueCards = openCards.filter(c => c.target_completion_date && c.target_completion_date < today);
  const dueThisWeek = openCards.filter(c => {
    if (!c.target_completion_date) return false;
    const diff = (new Date(c.target_completion_date).getTime() - Date.now()) / 86_400_000;
    return diff >= 0 && diff <= 7;
  });
  if (overdueCards.length > 0 || dueThisWeek.length > 0) {
    const parts: string[] = [];
    if (overdueCards.length > 0) parts.push(`${overdueCards.length} overdue ("${overdueCards[0].title}"${overdueCards.length > 1 ? ` + ${overdueCards.length - 1} more` : ''})`);
    if (dueThisWeek.length > 0) parts.push(`${dueThisWeek.length} due in the next 7 days`);
    chunks.push({ kind: "plain", content: `On the radar: ${parts.join(', ')}.` });
  }

  /* Honest note about freshness */
  let honest_note: string | undefined;
  if (gsc) {
    const days = Math.floor((Date.now() - new Date(gsc).getTime()) / 86_400_000);
    if (days > 7) honest_note = `GSC data is ${days} days old — fresh pull would sharpen these numbers.`;
  } else {
    honest_note = `GSC isn't connected so search-performance changes aren't in this recap. Connecting GSC would add a lot.`;
  }

  /* If everything was empty */
  if (cardsDone.length === 0 && cardsMoved.length === 0 && strategiesMoved.length === 0 && withImpact.length === 0) {
    chunks.push({ kind: "plain", content: "Honestly, the system has no record of meaningful change this week. If that's wrong, the data sources may not be pulling. Try \"diagnose\" to check what's connected." });
  }

  chunks.push({
    kind: "verify",
    content: `Sources: kanban_tasks, strategies, activity_log, project_integrations`,
    detail: { cards_examined: cards.length, strategies_examined: strategies.length, activity_events: activity.length, gsc_last_pull: gsc, ga4_last_pull: ga4 },
  });

  return {
    intent: "summarize",
    confidence: 0.9,
    chunks,
    actions: [
      { id: "open_pipeline",       label: "Open the pipeline board" },
      { id: "draft_client_recap",  label: "Draft a client recap I can send" },
    ],
    honest_note,
  };
}

/* ════════════════════════════════════════════════════════════
   HANDLER 4 — ATTENTION
═══════════════════════════════════════════════════════════ */

async function handleAttention(projectId: string): Promise<CommandResponse> {
  const r = await bsSeasonBriefing({ projectId });
  if (!r.success) {
    return { intent: "attention", confidence: 0.9, chunks: [{ kind: "plain", content: `I couldn't gather attention items right now. Reason: ${r.error}. Try "diagnose".` }] };
  }
  const b = r.briefing;
  const chunks: ResponseChunk[] = [];

  if (b.attention.length === 0) {
    chunks.push({ kind: "plain", content: "Nothing urgent. Either everything is on track, or there's nothing in flight that has a deadline." });
    chunks.push({ kind: "plain", content: "Good day to start something new, or do strategic thinking. Try \"how are we doing?\" for the overall picture." });
  } else {
    chunks.push({ kind: "plain", content: `${b.attention.length} ${b.attention.length === 1 ? 'thing' : 'things'} need your attention, ranked by urgency:` });
    b.attention.slice(0, 6).forEach((item: any, i: number) => {
      const sevPrefix = item.severity === 'critical' ? '🔴 ' : item.severity === 'warning' ? '🟡 ' : '🔵 ';
      chunks.push({ kind: "plain", content: `${i + 1}. ${sevPrefix}${item.headline}` });
    });
  }

  if (b.honest_gaps.length > 0) {
    chunks.push({
      kind: "plain",
      content: `Heads up — what I couldn't check: ${b.honest_gaps.join(' · ')}`,
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

/* ════════════════════════════════════════════════════════════
   HANDLER 5 — STATUS (per-strategy details)
═══════════════════════════════════════════════════════════ */

async function handleStatus(projectId: string): Promise<CommandResponse> {
  const [briefingRes, strategiesRes] = await Promise.all([
    bsSeasonBriefing({ projectId }),
    db().from("strategies").select("name,status,horizon,target_end_date,on_track,actual_impact,card_ids").eq("project_id", projectId).neq("status","concluded").limit(10),
  ]);
  if (!briefingRes.success) {
    return { intent: "status", confidence: 0.8, chunks: [{ kind: "plain", content: `Couldn't pull status: ${briefingRes.error}. Try "diagnose".` }] };
  }
  const b = briefingRes.briefing;
  const strategies = (strategiesRes.data || []) as any[];

  const chunks: ResponseChunk[] = [];
  chunks.push({ kind: "plain", content: b.status_summary });

  if (strategies.length === 0) {
    chunks.push({ kind: "plain", content: "No active strategies in the system right now. Strategies are where we plan what to do — open the Planning page and start one if you want me to track impact." });
  } else {
    chunks.push({ kind: "plain", content: `${strategies.length} ${strategies.length === 1 ? 'strategy' : 'strategies'} in flight:` });
    strategies.forEach((s: any) => {
      const cards = (s.card_ids || []).length;
      const lift = s.actual_impact?.summary?.gsc_clicks_lift_pct;
      const trackMark = s.on_track === true ? ' ✓' : s.on_track === false ? ' ⚠' : '';
      const liftStr = lift != null ? ` · ${lift > 0 ? '+' : ''}${Number(lift).toFixed(1)}% GSC clicks so far` : '';
      chunks.push({ kind: "plain", content: `  • "${s.name}" — ${s.status}${trackMark} · ${s.horizon} · ${cards} card${cards === 1 ? '' : 's'}${liftStr}` });
    });
  }

  chunks.push({
    kind: "verify",
    content: "Sources: strategies, kanban_tasks, analytics_goals, project_integrations, blockers",
    detail: b.freshness,
  });

  return {
    intent: "status",
    confidence: 0.9,
    chunks,
    actions: [
      { id: "open_planning",  label: "Open the planning board" },
      { id: "try_attention", label: "What needs me today?" },
    ],
  };
}

/* ════════════════════════════════════════════════════════════
   HANDLER 6 — EXPLAIN
═══════════════════════════════════════════════════════════ */

async function handleExplain(projectId: string, _text: string): Promise<CommandResponse> {
  const { data: strategies } = await db().from("strategies").select("*").eq("project_id", projectId).order("updated_at",{ ascending: false }).limit(10);
  const offTrack = (strategies || []).find((s: any) => s.on_track === false);

  if (!offTrack) {
    return {
      intent: "explain",
      confidence: 0.7,
      chunks: [
        { kind: "plain", content: "Nothing is officially marked off-track right now. If something feels wrong but isn't flagged, name the strategy or page and I'll dig deeper." },
        { kind: "plain", content: "Or try: \"why is /pricing slipping\", \"what happened to Q4 push\", \"explain the recent dip\"." },
      ],
      honest_note: "v1 keyword router looks at off-track flags only. For targeted analysis of a specific item, the LLM brain handles it — try a more specific question.",
    };
  }

  const chunks: ResponseChunk[] = [];
  chunks.push({ kind: "plain", content: `"${offTrack.name}" is the one pacing behind. Here's what the data shows:` });

  /* Read its blockers */
  let hardBlocker: any = null;
  try {
    const { bsGetStrategyBlockers } = await import("./pm-blockers.js");
    const blockers = await bsGetStrategyBlockers({ projectId });
    if (blockers.success) {
      const strategicBlockers = (blockers.blockers || []).filter((b: any) =>
        b.blocks.some((blk: any) => blk.type === "card" && offTrack.card_ids?.includes(blk.id))
      );
      hardBlocker = strategicBlockers.find((b: any) => b.required);
    }
  } catch { /* skip */ }

  if (hardBlocker) {
    chunks.push({
      kind: "plain",
      content: `Most likely cause: blocked on "${hardBlocker.label}" — that's holding up ${hardBlocker.block_summary?.cards || 0} card${hardBlocker.block_summary?.cards === 1 ? '' : 's'}.`,
    });
  } else if (offTrack.actual_impact?.summary?.gsc_clicks_lift_pct != null) {
    const lift = offTrack.actual_impact.summary.gsc_clicks_lift_pct;
    chunks.push({
      kind: "plain",
      content: `Real GSC clicks lift sits at ${lift > 0 ? '+' : ''}${Number(lift).toFixed(1)}% — below the projection.`,
    });
    chunks.push({
      kind: "plain",
      content: `Common explanation at this stage: search engines need 14-21 days to re-evaluate after content changes. If we're earlier than that, we may just be too early to see the lift land.`,
    });
  } else {
    chunks.push({
      kind: "plain",
      content: `Not enough impact data yet to point at a single cause. Strategy was finalized ${offTrack.finalized_at ? humanAge(offTrack.finalized_at) + ' ago' : 'recently'}.`,
    });
  }

  chunks.push({
    kind: "verify",
    content: "Source: strategies table + derived blockers",
    detail: { strategy_id: offTrack.id, status: offTrack.status, on_track: offTrack.on_track },
  });

  return {
    intent: "explain",
    confidence: 0.8,
    chunks,
    actions: [
      { id: "open_strategy", label: "Open the strategy detail", payload: { strategyId: offTrack.id } },
    ],
  };
}

/* ════════════════════════════════════════════════════════════
   HANDLER 7 — VERIFY
═══════════════════════════════════════════════════════════ */

async function handleVerify(projectId: string): Promise<CommandResponse> {
  try {
    const { bsGetAnalyticsProvenance } = await import("./pm-analytics-provenance.js");
    const r = await bsGetAnalyticsProvenance({ projectId });
    if (!r.success) {
      return { intent: "verify", confidence: 0.7, chunks: [{ kind: "plain", content: "Couldn't pull provenance: " + (r.error || "unknown") + ". Try \"diagnose\"." }] };
    }
    const p = r.provenance;
    const chunks: ResponseChunk[] = [{ kind: "plain", content: "Here's where the numbers come from:" }];
    if (p.gsc.connected) {
      chunks.push({ kind: "plain", content: `GSC: property ${p.gsc.resource_id} (${p.gsc.property_type === 'domain' ? 'domain property' : 'URL prefix'}), data state ${p.gsc.data_state}, last pulled ${p.gsc.last_pull_at ? new Date(p.gsc.last_pull_at).toLocaleString() : 'never'}.` });
    } else {
      chunks.push({ kind: "plain", content: "GSC: not connected. Any search metric in S.E.A.S.O.N. will be null until you connect it." });
    }
    if (p.ga4.connected) {
      chunks.push({ kind: "plain", content: `GA4: property ${p.ga4.property_id}, filter ${p.ga4.channel_filter}, last pulled ${p.ga4.last_pull_at ? new Date(p.ga4.last_pull_at).toLocaleString() : 'never'}.` });
    } else {
      chunks.push({ kind: "plain", content: "GA4: not connected." });
    }
    chunks.push({ kind: "verify", content: "Open the Provenance details in Data Room → Analytics for full caveats and methodology notes.", detail: p });

    return { intent: "verify", confidence: 0.95, chunks, actions: [{ id: "open_provenance", label: "Open Provenance details" }] };
  } catch (e: any) {
    return { intent: "verify", confidence: 0.5, chunks: [{ kind: "plain", content: `Verification system errored: ${e?.message}. Try "diagnose".` }] };
  }
}

/* ════════════════════════════════════════════════════════════
   HANDLER 8 — UNKNOWN (fallback when LLM also fails)
═══════════════════════════════════════════════════════════ */

function handleUnknown(_text: string): CommandResponse {
  return {
    intent: "unknown",
    confidence: 0.3,
    chunks: [
      {
        kind: "plain",
        content: `I'm not sure how to handle that with my keyword router, and my LLM brain is unreachable right now. Try "diagnose" to see what's broken, or pick from the suggestions.`,
      },
    ],
    actions: [
      { id: "try_diagnose",  label: "Run diagnostic" },
      { id: "try_summarize", label: "Summarize this week" },
      { id: "try_attention", label: "What needs me today?" },
      { id: "try_help",      label: "Show me what I can ask" },
    ],
  };
}

/* ─── Activity log read ─────────────────────────────────────── */

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

/* ─── helpers ───────────────────────────────────────────────── */

function humanAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
