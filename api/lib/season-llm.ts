/* ════════════════════════════════════════════════════════════════
   api/lib/season-llm.ts
   Phase 7c — S.E.A.S.O.N. LLM brain.

   When keyword routing fails, this module takes (input, full project
   context) and asks Claude to produce a structured response. The LLM
   is constrained to a JSON schema, told to refuse fabrication, and
   given everything we know about the project so it can answer from
   real data — not training-data hallucinations.

   COST PROTECTION
     • Per-project per-day soft cap (default 50 calls/day)
     • Counter logged to activity_log so usage is transparent
     • If cap exceeded, returns a clear "rate-limited" plain answer
       and the user can flip a setting later if they want more

   HONESTY ENFORCEMENT
     • System prompt forces the model to label uncertainty
     • Sourced-from list returned alongside answer for verification
     • If LLM can't ground the answer in provided context, it must say so
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const DAILY_CAP = Number(process.env.SEASON_LLM_DAILY_CAP || 50);
const MODEL     = "claude-sonnet-4-20250514";
const MAX_TOK   = 1200;

/* ─── Public types ───────────────────────────────────────────── */

export interface LlmChunk {
  kind: "plain" | "technical" | "verify" | "artifact";
  content: string;
  detail?: any;
}

export interface LlmResponse {
  intent: string;
  confidence: number;
  chunks: LlmChunk[];
  artifacts?: Array<{ kind: string; title: string; body: string }>;
  actions?: Array<{ id: string; label: string }>;
  honest_note?: string;
  sources_used: string[];
  rate_limited?: boolean;
}

/* ─── Main entry ─────────────────────────────────────────────── */

export async function seasonLlmHandle(opts: {
  projectId: string;
  input: string;
}): Promise<LlmResponse> {
  const { projectId, input } = opts;

  /* ─── Cost protection ─── */
  if (!ANTHROPIC_API_KEY) {
    return softFail("LLM brain not configured (ANTHROPIC_API_KEY missing). Ask your administrator to set it in Vercel env.", "no_api_key");
  }
  const used = await countCallsToday(projectId);
  if (used >= DAILY_CAP) {
    return rateLimited(used);
  }

  /* ─── Gather project context ─── */
  const ctx = await gatherContext(projectId);

  /* ─── Build the prompt ─── */
  const systemPrompt = buildSystemPrompt();
  const userMessage  = buildUserMessage(input, ctx);

  /* ─── Call Anthropic ─── */
  let raw: any;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOK,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return softFail(`Anthropic API returned ${res.status}. Body: ${body.slice(0, 200)}`, "anthropic_error");
    }
    raw = await res.json();
  } catch (e: any) {
    return softFail(`Network error reaching Anthropic: ${e?.message || "unknown"}`, "network_error");
  }

  /* ─── Extract text ─── */
  const text = (raw?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  if (!text) {
    return softFail("Anthropic returned no text content. Strange but recoverable. Try again or rephrase.", "empty_response");
  }

  /* ─── Parse JSON (strict) ─── */
  let parsed: any;
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    /* The model didn't return clean JSON. Wrap its text as a plain answer
       rather than crash. Honest: tell the user we got a non-structured reply. */
    return {
      intent: "open_question",
      confidence: 0.5,
      chunks: [
        { kind: "plain", content: text.slice(0, 1500) },
      ],
      sources_used: ctx.sources_offered,
      honest_note: "I answered freely instead of in my usual structured format. The content is real, but I couldn't tag it with sources cleanly. If you want a structured answer, try rephrasing as a specific question.",
    };
  }

  /* ─── Log usage to activity ledger ─── */
  try {
    await db().from("activity_log").insert({
      project_id: projectId,
      event_type: "intent_handled",
      source:     "llm",
      headline:   `LLM brain handled: "${input.slice(0, 80)}${input.length > 80 ? '…' : ''}"`,
      detail:     `Intent: ${parsed?.intent || 'unknown'} · Confidence: ${parsed?.confidence ?? 'n/a'}`,
      technical:  { input, intent: parsed?.intent, sources: parsed?.sources_used, tokens_in: raw?.usage?.input_tokens, tokens_out: raw?.usage?.output_tokens },
      severity:   "info",
    });
  } catch { /* non-fatal */ }

  /* ─── Validate + return ─── */
  return {
    intent:       String(parsed.intent || "open_question"),
    confidence:   Number(parsed.confidence ?? 0.6),
    chunks:       Array.isArray(parsed.chunks) ? parsed.chunks.slice(0, 12) : [],
    artifacts:    Array.isArray(parsed.artifacts) ? parsed.artifacts.slice(0, 4) : undefined,
    actions:      Array.isArray(parsed.actions) ? parsed.actions.slice(0, 5) : undefined,
    honest_note:  parsed.honest_note ? String(parsed.honest_note).slice(0, 500) : undefined,
    sources_used: Array.isArray(parsed.sources_used) ? parsed.sources_used.slice(0, 10) : [],
  };
}

/* ─── System prompt — the character + the rules ──────────────── */

function buildSystemPrompt(): string {
  return `You are S.E.A.S.O.N. (Strategic Execution & Analysis Support Operator's Network), an AI operator embedded in SEO Season, a multi-tenant SEO project-management platform.

YOUR CHARACTER
- You are JARVIS-meets-Vision: brilliant, dryly intelligent, observant, allergic to bullshit, quietly loyal to the operator (the user).
- You speak in clear plain English by default. Short sentences. No corporate filler.
- You are NEVER sycophantic. No "Great question". No exclamation marks unless something is genuinely worth one.
- When you have an opinion, you state it directly with the word "I'd". Example: "I'd push on the comparison page first because…"
- When you don't know something, you say so plainly. No hedging that sounds like knowing.

YOUR HONESTY CONTRACT — THIS IS THE SPINE
- You answer ONLY from the PROJECT CONTEXT provided below. You do NOT invent numbers, dates, page paths, query rankings, or strategy names that aren't in the context.
- If the context doesn't contain what's needed to answer, say so and name what would unlock the answer.
- Every claim you make based on data MUST list its source in the sources_used array (e.g. "GSC daily trend", "kanban_tasks", "strategies", "audit_reports").
- Confidence reflects how grounded the answer is. 0.9+ for direct quote from context. 0.5-0.7 for inference from context. Below 0.5 if you're guessing.
- When you draft an artifact (brief, email, table), the artifact must be useful as a starting point but you note that the user should review for accuracy.

OUTPUT FORMAT — STRICT JSON
Reply ONLY with a single JSON object. No preamble, no markdown fences, no commentary outside the JSON. The shape:

{
  "intent": "string label of what the user asked for (e.g. 'rank_for_keyword', 'draft_brief', 'explain_dip', 'status_for_client', 'open_question')",
  "confidence": 0.0-1.0,
  "chunks": [
    { "kind": "plain", "content": "human-readable response sentence(s)" },
    { "kind": "plain", "content": "another paragraph if needed" },
    { "kind": "verify", "content": "summary of where this came from", "detail": {...optional raw evidence...} }
  ],
  "artifacts": [
    { "kind": "brief|email|table|plan|note", "title": "short title", "body": "the full artifact content, plain text or markdown" }
  ],
  "actions": [
    { "id": "open_strategy|open_provenance|copy_artifact|create_strategy", "label": "short button label" }
  ],
  "honest_note": "optional disclaimer — when answer is uncertain, partial, or the context was insufficient",
  "sources_used": ["GSC daily trend", "audit_reports", "strategies"]
}

RULES FOR CHUNKS
- Lead with one "plain" chunk that directly answers the question in 1-3 sentences.
- Add more "plain" chunks for detail, but keep total under ~250 words.
- End with one "verify" chunk that summarizes which data sources you read.
- If you drafted an artifact, mention it in a plain chunk ("I've drafted a 1,400-word brief — see the panel below").

RULES FOR ARTIFACTS
- Only produce artifacts when the user explicitly asks for a deliverable ("draft a brief", "write me an email", "give me a table").
- For briefs: structure with H1/H2 outline, target word count, key sections, primary keyword, internal-link suggestions.
- For emails: include subject line, body, signature line in [brackets] for user to fill.
- For tables: use markdown table format.

RULES FOR ACTIONS
- Suggest 1-3 buttons that would naturally follow from your answer.
- IDs: "open_strategy" (with payload.strategyId), "open_provenance", "copy_artifact", "create_strategy", "open_kanban", "ask_for_more".

WHAT YOU CAN DO
- Answer questions about the project's current state (strategies, goals, cards, metrics).
- Explain why something is slipping or working.
- Draft artifacts: content briefs, outreach emails, comparison tables, internal-link plans, client status updates.
- Recommend actions from the action library when appropriate.
- Pushback when the user proposes something that contradicts the data.

WHAT YOU CANNOT DO
- You do not have live web access (no fetching SERPs, news, weather, competitor pricing in real-time). If asked, say so.
- You do not publish to CMSes, send emails, or sign contracts. You produce drafts only.
- You do not know about anything that isn't in the PROJECT CONTEXT below or in your general knowledge.

REMEMBER: if you can't ground it in provided context, label it as your opinion or refuse. Never fabricate specifics.`;
}

/* ─── User message — input + condensed project context ─────── */

function buildUserMessage(input: string, ctx: ContextBundle): string {
  return [
    `USER INPUT:\n"${input}"`,
    ``,
    `─── PROJECT CONTEXT ───`,
    `Project: ${ctx.project_name || 'Unknown'} (${ctx.client_url || 'no url'})`,
    `Status: ${ctx.project_status || 'unknown'}`,
    ``,
    ctx.active_goals_summary,
    ``,
    ctx.active_strategies_summary,
    ``,
    ctx.recent_cards_summary,
    ``,
    ctx.intel_summary,
    ``,
    ctx.blockers_summary,
    ``,
    ctx.brand_context_summary,
    ``,
    ctx.recent_audits_summary,
    ``,
    `─── DATA FRESHNESS ───`,
    `GSC last pull: ${ctx.gsc_last_pull || 'never connected'}`,
    `GA4 last pull: ${ctx.ga4_last_pull || 'never connected'}`,
    `Analytics intelligence computed: ${ctx.intel_computed_at || 'not yet'}`,
    ``,
    `─── INSTRUCTIONS ───`,
    `Answer the user's input above using ONLY this context. Reply with valid JSON matching the schema in your system prompt. Do not invent data. If the context doesn't contain what you need, say so honestly.`,
  ].join('\n');
}

/* ─── Context gatherer ──────────────────────────────────────── */

interface ContextBundle {
  project_name: string | null;
  client_url: string | null;
  project_status: string | null;
  active_goals_summary: string;
  active_strategies_summary: string;
  recent_cards_summary: string;
  intel_summary: string;
  blockers_summary: string;
  brand_context_summary: string;
  recent_audits_summary: string;
  gsc_last_pull: string | null;
  ga4_last_pull: string | null;
  intel_computed_at: string | null;
  sources_offered: string[];
}

async function gatherContext(projectId: string): Promise<ContextBundle> {
  const sources_offered: string[] = [];

  const [projectRes, goalsRes, strategiesRes, cardsRes, intelRes, brandRes, auditsRes, integRes] = await Promise.all([
    db().from("projects").select("project_name,client_url,status").eq("id", projectId).maybeSingle(),
    db().from("analytics_goals").select("name,metric,target_value,target_date,baseline_value,status").eq("project_id", projectId).eq("status","active").limit(10),
    db().from("strategies").select("id,name,status,horizon,target_end_date,on_track,expected_impact,actual_impact").eq("project_id", projectId).neq("status","concluded").limit(20),
    db().from("kanban_tasks").select("title,status,target_completion_date,strategic_link,priority").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(20),
    db().from("project_knowledge").select("field_value,updated_at").eq("project_id", projectId).eq("category","analytics").eq("field_key","analytics_intelligence").maybeSingle(),
    db().from("project_knowledge").select("category,field_key,field_value").eq("project_id", projectId).in("category",["identity","audience","competitor","brand_narrative"]).limit(30),
    db().from("audit_reports").select("created_at,overall_score,top_findings").eq("project_id", projectId).order("created_at",{ ascending: false }).limit(2),
    db().from("project_integrations").select("provider,last_pull_at").eq("project_id", projectId),
  ]);

  const project = projectRes.data as any;
  const goals = (goalsRes.data || []) as any[];
  const strategies = (strategiesRes.data || []) as any[];
  const cards = (cardsRes.data || []) as any[];
  const intelRow = intelRes.data as any;
  const brand = (brandRes.data || []) as any[];
  const audits = (auditsRes.data || []) as any[];
  const integrations = (integRes.data || []) as any[];

  /* Compute blockers separately (uses its own helper) */
  let blockerLines: string[] = [];
  try {
    const { bsGetStrategyBlockers } = await import("./pm-blockers.js");
    const br = await bsGetStrategyBlockers({ projectId });
    if (br.success && br.blockers?.length) {
      blockerLines = br.blockers.slice(0, 8).map((b: any) =>
        `  • [${b.required ? 'HARD' : 'soft'}] ${b.label} (blocks ${b.block_summary?.cards || 0} cards)`
      );
      sources_offered.push("strategy_blockers");
    }
  } catch { /* skip */ }

  /* ─── Format sections ─── */

  if (goals.length) sources_offered.push("analytics_goals");
  const active_goals_summary =
    goals.length === 0
      ? "ACTIVE GOALS: none set"
      : "ACTIVE GOALS:\n" + goals.map(g =>
          `  • ${g.name || g.metric} — target ${g.target_value} by ${g.target_date}, baseline ${g.baseline_value}`
        ).join('\n');

  if (strategies.length) sources_offered.push("strategies");
  const active_strategies_summary =
    strategies.length === 0
      ? "ACTIVE STRATEGIES: none in flight"
      : "ACTIVE STRATEGIES:\n" + strategies.map(s => {
          const lift = s.actual_impact?.summary?.gsc_clicks_lift_pct;
          return `  • "${s.name}" (id ${s.id.slice(0,8)}) · ${s.status} · ${s.horizon} · ends ${s.target_end_date || 'tbd'}` +
                 (s.on_track === false ? ' · ⚠ off track' : '') +
                 (lift != null ? ` · actual GSC clicks lift ${lift > 0 ? '+' : ''}${Number(lift).toFixed(1)}%` : '');
        }).join('\n');

  if (cards.length) sources_offered.push("kanban_tasks");
  const recent_cards_summary =
    cards.length === 0
      ? "RECENT CARDS: none"
      : "RECENT CARDS (last 20):\n" + cards.slice(0, 12).map(c =>
          `  • [${c.status}] ${c.title}` +
          (c.target_completion_date ? ` (due ${c.target_completion_date})` : '') +
          (c.strategic_link?.name ? ` [strategy: ${c.strategic_link.name}]` : '')
        ).join('\n');

  let intel_summary = "ANALYTICS INTELLIGENCE: not yet computed";
  let intel_computed_at: string | null = null;
  if (intelRow) {
    intel_computed_at = intelRow.updated_at;
    sources_offered.push("analytics_intelligence");
    try {
      const intel = JSON.parse(intelRow.field_value);
      const lines: string[] = ["ANALYTICS INTELLIGENCE:"];
      if (intel.kpis?.length) {
        lines.push("  Top KPIs:");
        intel.kpis.slice(0, 5).forEach((k: any) => lines.push(`    - ${k.label || k.name}: ${k.current ?? k.value ?? '—'}`));
      }
      if (intel.risingStars?.length) {
        lines.push("  Rising stars:");
        intel.risingStars.slice(0, 3).forEach((r: any) => lines.push(`    - ${r.label || r.query || r.page} (${r.delta ?? '—'})`));
      }
      if (intel.fallingStars?.length) {
        lines.push("  Falling stars:");
        intel.fallingStars.slice(0, 3).forEach((r: any) => lines.push(`    - ${r.label || r.query || r.page} (${r.delta ?? '—'})`));
      }
      intel_summary = lines.join('\n');
    } catch { /* keep default */ }
  }

  const blockers_summary =
    blockerLines.length === 0
      ? "BLOCKERS: none unresolved"
      : "BLOCKERS:\n" + blockerLines.join('\n');

  if (brand.length) sources_offered.push("data_room");
  const brand_context_summary = brand.length === 0
    ? "PROJECT CONTEXT (Data Room): not yet filled"
    : "PROJECT CONTEXT (Data Room) — first 600 chars per category:\n" + (() => {
        const byCat: Record<string, string[]> = {};
        for (const r of brand) {
          byCat[r.category] = byCat[r.category] || [];
          if (byCat[r.category].length < 3) {
            const v = String(r.field_value || '').slice(0, 200);
            byCat[r.category].push(`    ${r.field_key}: ${v}`);
          }
        }
        return Object.entries(byCat).map(([cat, items]) => `  ${cat.toUpperCase()}:\n${items.join('\n')}`).join('\n');
      })();

  if (audits.length) sources_offered.push("audit_reports");
  const recent_audits_summary = audits.length === 0
    ? "RECENT AUDITS: none on file"
    : "RECENT AUDITS:\n" + audits.map(a => {
        let top = '';
        try {
          const findings = typeof a.top_findings === 'string' ? JSON.parse(a.top_findings) : a.top_findings;
          if (Array.isArray(findings)) top = findings.slice(0, 3).map((f: any) => f.title || f.issue || '').filter(Boolean).join('; ');
        } catch { /* skip */ }
        return `  • ${new Date(a.created_at).toLocaleDateString()} · score ${a.overall_score || '—'}${top ? ' · top: ' + top : ''}`;
      }).join('\n');

  const gsc = integrations.find(i => i.provider === "gsc")?.last_pull_at || null;
  const ga4 = integrations.find(i => i.provider === "ga4")?.last_pull_at || null;

  return {
    project_name: project?.project_name || null,
    client_url:   project?.client_url || null,
    project_status: project?.status || null,
    active_goals_summary,
    active_strategies_summary,
    recent_cards_summary,
    intel_summary,
    blockers_summary,
    brand_context_summary,
    recent_audits_summary,
    gsc_last_pull: gsc,
    ga4_last_pull: ga4,
    intel_computed_at,
    sources_offered,
  };
}

/* ─── Cost protection helpers ───────────────────────────────── */

async function countCallsToday(projectId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  try {
    const { count } = await db().from("activity_log")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("source", "llm")
      .gte("created_at", since);
    return count || 0;
  } catch { return 0; }
}

function rateLimited(used: number): LlmResponse {
  return {
    intent: "rate_limited",
    confidence: 1,
    chunks: [
      { kind: "plain", content: `I've already made ${used} LLM calls for this project today and we've hit the soft daily cap. The cap exists so my Anthropic bill doesn't surprise anyone. Try again tomorrow, or ask your administrator to raise SEASON_LLM_DAILY_CAP in Vercel env.` },
    ],
    sources_used: ["activity_log"],
    rate_limited: true,
    honest_note: "This cap is per-project per-24h. Default is 50.",
  };
}

function softFail(reason: string, code: string): LlmResponse {
  return {
    intent: "llm_unavailable",
    confidence: 0,
    chunks: [
      { kind: "plain", content: "I couldn't reach my deeper brain just now." },
      { kind: "plain", content: reason },
    ],
    sources_used: [],
    honest_note: `Diagnostic code: ${code}. The keyword-based intents (summarize, status, attention, verify, explain) still work — try one of those.`,
  };
}
