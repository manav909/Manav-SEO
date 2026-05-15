import Anthropic                              from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { saveLearning } from "./lib/save";
import { db } from "./lib/db";

/* ── INLINED Intelligence Fabric (Lambda-safe — no extra lib/ imports) ── */
type SourceType = "manual_user" | "user_comment" | "gsc_live" | "ga_live" | "audit_run" |
  "crawl_jina" | "brain_learning" | "algorithm_intel" | "intelligence_output" |
  "claude_inference" | "industry_pattern" | "unknown";
interface SourceUsage { source: SourceType; confidence: number; weight?: number; label?: string; count?: number; }
const SOURCE_CONFIDENCE: Record<SourceType, number> = {
  manual_user: 98, user_comment: 98, gsc_live: 95, ga_live: 95, audit_run: 88,
  crawl_jina: 85, brain_learning: 80, algorithm_intel: 82, intelligence_output: 80,
  claude_inference: 65, industry_pattern: 45, unknown: 30,
};
function source(type: SourceType, opts: { label?: string; weight?: number; count?: number; overrideConfidence?: number } = {}): SourceUsage {
  return { source: type, confidence: opts.overrideConfidence ?? SOURCE_CONFIDENCE[type], weight: opts.weight ?? 1, label: opts.label, count: opts.count };
}
function computeWeightedConfidence(sources: SourceUsage[]): number {
  if (!sources.length) return 0; let s = 0, w = 0;
  for (const x of sources) { const ww = x.weight ?? 1; s += (x.confidence ?? SOURCE_CONFIDENCE[x.source] ?? 30) * ww; w += ww; }
  return w > 0 ? Math.round(s / w) : 0;
}
async function saveIntelligenceOutput(sbc: any, p: {
  projectId: string; analysisType: string; title?: string; summary?: string;
  output: any; sources: SourceUsage[]; modelUsed?: string; createdBy?: string;
}): Promise<string | null> {
  try {
    const { data } = await sbc.from("intelligence_outputs").insert({
      project_id: p.projectId, analysis_type: p.analysisType,
      title: p.title?.slice(0, 200) || null, summary: p.summary?.slice(0, 500) || null,
      output: p.output, sources_used: p.sources,
      weighted_confidence: computeWeightedConfidence(p.sources),
      model_used: p.modelUsed || null, status: "active",
      created_by: p.createdBy || "system", generated_at: new Date().toISOString(),
    }).select("id").single();
    return data?.id || null;
  } catch (_e) { return null; }
}

export const config = { maxDuration: 300 };

/* ─── Role voices ─── */
const ROLE_VOICE: Record<string, string> = {
  content_writer:  "You are talking directly to a Content Writer. Tell them exactly what to write, which keywords to target, and what great looks like.",
  team_lead:       "You are giving a Team Lead a real update. What is blocked, what to escalate, what today's standup should focus on.",
  executive:       "You are advising a business owner. 3 things to know, 1 decision to make. No jargon. Revenue and competitive position only.",
  senior_seo:      "You are a senior SEO strategist sharing your real thinking. Go deep on algorithm signals, topical authority, E-E-A-T, and GEO.",
  project_manager: "You are a PM. Format: Status → Risk → Action. Milestones, blockers, resource gaps.",
  biz_dev:         "You are helping a biz dev manager. What is working, what the numbers show, how to handle objections, what the upsell angle is.",
};

/* ─── Jina URL fetch ─── */
async function fetchUrl(url: string): Promise<string> {
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    const r = await fetch(`https://r.jina.ai/${u}`, {
      headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "15" },
      signal: AbortSignal.timeout(18000),
    });
    return r.ok ? (await r.text()).slice(0, 3000) : "";
  } catch (_e) { return ""; }
}

/* ─── Brain assistant prompt ─── */
function buildBrainPrompt(ctx: {
  question: string; projectContext: any; learnings: any[]; algoItems: any[];
  canvasBlocks: any[]; history: { role: string; content: string }[]; projectSummary: string;
}): { system: string; user: string } {
  const pc   = ctx.projectContext || {};
  const proj = pc.project || {};
  const goals= pc.goals   || {};
  const met  = pc.metrics || {};

  const projectLines = [
    `COMPANY: ${proj.name || "Unknown"} | URL: ${proj.url || "Not set"}`,
    `GOAL: ${goals.primary || "Not set"} | Timeline: ${goals.timeline || "Not set"}`,
    `KEYWORDS: ${goals.keywords || (proj.keywords || []).join(", ") || "Not set"}`,
    met.llmVisibility != null
      ? `SCORES: LLM ${met.llmVisibility}/100 | Health ${met.algorithmHealth}/100 | EEAT ${met.eeat}/100 | Authority ${met.authority}/100`
      : "SCORES: Not yet recorded",
    `ANALYTICS: Organic ${pc.analytics?.organicMonthly || "?"}/mo | GSC ${pc.analytics?.gscClicks || "?"} clicks`,
    `CMS: ${pc.tech?.cms || "Not set"} | SEO plugin: ${pc.tech?.seoPlugin || "Not set"}`,
    `COMPETITORS: ${[pc.competitors?.c1, pc.competitors?.c2].filter(Boolean).join(", ") || "Not set"}`,
  ].join("\n");

  const learningsLines = ctx.learnings.length > 0
    ? ctx.learnings.slice(0, 15).map((l: any, i: number) => [
        `[${i+1}] ${l.card_type?.toUpperCase()} | Applied: ${l.applied_count || 0}x | Confidence: ${l.confidence_score || 75}/100`,
        `    Title: "${l.card_title}"`,
        l.what_worked?.length ? `    ✓ Works: ${l.what_worked.slice(0, 2).join(" | ")}` : "",
        l.what_missed?.length ? `    ✗ Gaps: ${l.what_missed.slice(0, 2).join(" | ")}` : "",
        `    → Apply: ${l.improvement || "—"}`,
        l.tags?.length ? `    Tags: ${l.tags.slice(0, 4).join(", ")}` : "",
      ].filter(Boolean).join("\n")
    ).join("\n---\n")
    : "No active learnings yet — tell me to learn about this project.";

  const algoLines = ctx.algoItems.length > 0
    ? ctx.algoItems.slice(0, 8).map((a: any) =>
        `• [${a.impact_level?.toUpperCase()}] ${a.title} (${a.engine}): ${(a.summary || "").slice(0, 100)}`
      ).join("\n")
    : "No algorithm knowledge saved yet.";

  const canvasLines = ctx.canvasBlocks.length > 0
    ? [1,2,3,4,5].map(w => {
        const wb = ctx.canvasBlocks.filter((b: any) => b.placed && b.week === w);
        if (!wb.length) return "";
        return `Week ${w === 5 ? "Backlog" : w} (${wb.length}): ${wb.map((b: any) => `[${b.type}|${b.status}] "${b.title}"`).join(", ")}`;
      }).filter(Boolean).join("\n")
    : "Canvas is empty.";

  const historyLines = ctx.history.length > 0
    ? ctx.history.slice(-8).map(m => `${m.role === "user" ? "User" : "Brain"}: ${m.content.slice(0, 200)}`).join("\n")
    : "";

  const system = `You are MANAV BRAIN — the master intelligence of SEO Season.

You are simultaneously a world-class SEO strategist, technical SEO expert, GEO specialist, and the operational brain of this software. You have complete knowledge of every feature and can direct the user or execute operations.

VERIFIED INFRASTRUCTURE FACTS — never contradict these:
• vercel.json has "regions": ["iad1"] globally and on every function. Region is NOT a diagnosis for any error.
• bom1 / sin1 / hnd1 / cdg1 / syd1 in Vercel error IDs = the edge routing node the user's browser hits. NOT where the Lambda runs. Lambda always runs in iad1.
• FUNCTION_INVOCATION_FAILED = Lambda process crashed. Causes: (a) code not yet deployed, (b) module load error, (c) uncaught exception. NEVER caused by region misconfiguration. Fix: push and deploy.
• Vercel Pro plan is active — no Hobby plan limits.
• Supabase v2 PostgrestBuilder does NOT support .catch() chaining — use try/catch.
• claude-sonnet-4-6 does NOT support assistant message prefill.
• All API Lambda files are standalone (no ./lib/ imports) — module resolution is not the issue.

RULES:
1. FACTS ONLY: Never state a metric, ranking, or statistic that is not in the data provided. Flag every assumption explicitly.
2. APPLY LEARNINGS: Every response must reference at minimum 1 Brain Learning (if available). State which learning you are applying and why.
3. USE ACTIONS: Emit ⟦ACTION⟧ tags to execute real operations — navigate, save learning, add canvas card, fetch URL.
4. SAVE INSIGHTS: When you discover something new or when asked to "learn", "remember", or "save" — emit save_learning or save_multiple_learnings ACTION tags immediately. Never just describe a learning in text.
5. ESCALATE MISSING DATA: When data is missing that would change your recommendation, name the exact page to fill it and what specifically to add.
6. END WITH HIGHEST-VALUE NEXT ACTION: Every response ends with a single, specific, executable next action.
7. AUTO-APPROVAL: Label learnings clearly — technical facts, audit findings, and confirmed algorithm signals get confidence_score ≥ 85 (auto-approved). Hypotheses and strategic interpretations get confidence_score 65-79.
8. NO DUPLICATION: Before saving a learning, check if you already referenced a similar one from BRAIN LEARNINGS above. If so, update it instead of creating a duplicate (use update_learning action).

EXECUTABLE ACTIONS:
Navigate: ⟦ACTION⟧{"type":"navigate","path":"/playground","label":"Open Strategy Canvas"}⟦/ACTION⟧
Navigate: ⟦ACTION⟧{"type":"navigate","path":"/data-room","label":"Open Data Room"}⟦/ACTION⟧
Navigate: ⟦ACTION⟧{"type":"navigate","path":"/brain-learning","label":"Open Brain Learning"}⟦/ACTION⟧
Navigate: ⟦ACTION⟧{"type":"navigate","path":"/algorithm-intel","label":"Open Algorithm Intelligence"}⟦/ACTION⟧
Navigate: ⟦ACTION⟧{"type":"navigate","path":"/audit","label":"Open Audit Tool"}⟦/ACTION⟧
Navigate: ⟦ACTION⟧{"type":"navigate","path":"/dashboard","label":"Open Dashboard"}⟦/ACTION⟧
Navigate: ⟦ACTION⟧{"type":"navigate","path":"/brain-command","label":"Open Brain Command"}⟦/ACTION⟧
Navigate: ⟦ACTION⟧{"type":"navigate","path":"/desk","label":"Open Brain Desk"}⟦/ACTION⟧
Run audit: ⟦ACTION⟧{"type":"run_audit","url":"https://example.com","label":"Run SEO Audit"}⟦/ACTION⟧
Add card: ⟦ACTION⟧{"type":"add_card","cardType":"technical","title":"Fix crawl errors","content":"Detail","priority":"high","week":1,"label":"Add Card"}⟦/ACTION⟧
Search brain: ⟦ACTION⟧{"type":"search_brain","query":"technical","label":"Search Brain Learnings"}⟦/ACTION⟧

Save a single brain learning permanently:
⟦ACTION⟧{"type":"save_learning","cardType":"insight","title":"Alpha Software: LLM Score 20/100 — invisible to AI engines","improvement":"Fix GEO: rewrite /mobile-forms intro, add FAQPage schema, target Perplexity citation triggers","whatWorked":["HubSpot CMS structure is clean"],"whatMissed":["No conversational content for AI engines","Zero FAQ schema coverage"],"summary":"LLM visibility crisis — site not cited by ChatGPT or Perplexity","tags":["llm","geo","critical"],"label":"Save Learning: LLM Crisis"}⟦/ACTION⟧

Save multiple brain learnings at once (use this when encoding multiple insights):
⟦ACTION⟧{"type":"save_multiple_learnings","learnings":[{"cardType":"technical","title":"HubSpot SEO plugin not configured","improvement":"Configure HubSpot SEO plugin: canonical tags, meta robots, XML sitemap","whatWorked":[],"whatMissed":["SEO plugin not set — meta tags may be missing"],"summary":"Technical gap","tags":["technical","hubspot"]},{"cardType":"insight","title":"Zero rankings on 5 core keywords","improvement":"Build topical clusters around each keyword before targeting directly","whatWorked":[],"whatMissed":["No content targeting primary keywords"],"summary":"Content gap","tags":["keywords","content"]}],"label":"Save 2 Alpha Software Learnings"}⟦/ACTION⟧

Fetch and analyse a URL:
⟦ACTION⟧{"type":"fetch_url","url":"https://alphasoftware.com/mobile-forms","label":"Fetch /mobile-forms live content"}⟦/ACTION⟧`;

  const user = [
    `PROJECT INTELLIGENCE:`,
    projectLines,
    ``,
    `CANVAS STATE:`,
    canvasLines,
    ``,
    `BRAIN LEARNINGS (${ctx.learnings.length} pathways):`,
    learningsLines,
    ``,
    `ALGORITHM KNOWLEDGE (${ctx.algoItems.length} topics):`,
    algoLines,
    historyLines ? `\nCONVERSATION HISTORY:\n${historyLines}` : "",
    ``,
    `USER REQUEST: ${ctx.question}`,
  ].filter(s => s !== undefined).join("\n");

  return { system, user };
}

/* ─── Handler ─── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* Top-level guard: if anything throws before res.end(), return clean error */
  if (req.method !== "POST") {
    return res.status(200).json({ error: "POST only" });
  }

  const body = req.body || {};
  const {
    mode             = "chat",
    blocks           = [],
    question         = "",
    role             = "team_lead",
    projectSummary   = "",
    focusBlockId     = null,
    checkUrl         = null,
    week,
    weekLabel,
    weekCards        = [],
    allPlacedCards   = [],
    projectContext   = {},
    dataRoom         = {},
    cardRequirements = [],
    projectId        = null,
    brainAssistantContext = null,
  } = body;

  /* ── Load market persona for this project (Manav Eyes → Brain) ── */
  let marketPersonaContext = "";
  if (projectId) {
    try {
      const { data: personaRow } = await db()
        .from("market_personas")
        .select("persona_data,industry")
        .eq("project_id", projectId)
        .single();
      if (personaRow?.persona_data) {
        const p = personaRow.persona_data;
        marketPersonaContext = [
          `MARKET PERSONA: ${p.persona_name} (${p.persona_archetype})`,
          p.market_context ? `Market reality: ${p.market_context}` : "",
          (p.psychology?.primary_pain_points||[]).length
            ? `Buyer pain points: ${p.psychology.primary_pain_points.slice(0,3).join(" | ")}` : "",
          (p.language_patterns?.words_that_convert||[]).length
            ? `Words that convert: ${p.language_patterns.words_that_convert.slice(0,5).join(", ")}` : "",
          (p.trust_signals?.what_builds_immediate_trust||[]).length
            ? `Trust signals: ${p.trust_signals.what_builds_immediate_trust.slice(0,3).join(" | ")}` : "",
          (p.seo_content_implications?.content_gaps_this_persona_needs_filled||[]).length
            ? `Content gaps: ${p.seo_content_implications.content_gaps_this_persona_needs_filled.slice(0,3).join(" | ")}` : "",
          p.manav_intelligence_note ? `Intelligence note: ${p.manav_intelligence_note}` : "",
        ].filter(Boolean).join("\n");
      }
    } catch (_) {}
  }

  const placed  = (blocks as any[]).filter((b: any) => b.placed);
  const library = (blocks as any[]).filter((b: any) => !b.placed);

  const byWeek = [1,2,3,4,5].map(w => {
    const wb = placed.filter((b: any) => b.week === w);
    if (!wb.length) return "";
    return [`${w === 5 ? "BACKLOG" : `WEEK ${w}`} (${wb.length} cards):`,
      ...wb.map((b: any) => `  [${(b.type||"").toUpperCase()}|${b.status}] "${b.title}"`)
    ].join("\n");
  }).filter(Boolean).join("\n\n");

  const drContext = (() => {
    const dr = dataRoom as any;
    if (!dr || !Object.keys(dr).length) return "";
    const lines: string[] = ["DATA ROOM:"];
    if (dr.goals?.primary)            lines.push(`  Goal: ${dr.goals.primary}`);
    if (dr.analytics?.organicMonthly) lines.push(`  Organic: ${dr.analytics.organicMonthly}/mo`);
    if (dr.technical?.pagesIndexed)   lines.push(`  Indexed: ${dr.technical.pagesIndexed}`);
    if (dr.competitors?.c1)           lines.push(`  Competitors: ${[dr.competitors.c1, dr.competitors.c2].filter(Boolean).join(", ")}`);
    return lines.join("\n");
  })();

  let liveContent = "";
  if (checkUrl) liveContent = await fetchUrl(checkUrl);

  /* ── Set streaming headers ── */
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Accel-Buffering": "no",
    "Cache-Control": "no-cache, no-transform",
    "Transfer-Encoding": "chunked",
  });

  let systemPrompt = "";
  let userPrompt   = "";
  let fullOutput   = "";

  try {
    /* ── Build prompt based on mode ── */
    if (mode === "brain_assistant") {
      const bac = brainAssistantContext || {};
      const systemOverride: string | undefined = (bac as any).systemOverride;
      const { system, user } = buildBrainPrompt({
        question,
        projectContext: bac.projectContext || projectContext,
        learnings:      bac.learnings      || [],
        algoItems:      bac.algoItems      || [],
        canvasBlocks:   bac.canvasBlocks   || placed,
        history:        bac.history        || [],
        projectSummary,
      });
      systemPrompt = systemOverride || system;
      if (marketPersonaContext) systemPrompt += `\n\n=== BUYER MARKET PERSONA ===\n${marketPersonaContext}`;
      userPrompt   = user;

    } else if (mode === "agenda") {
      const todo  = (weekCards as any[]).filter((c: any) => c.status === "todo");
      const doing = (weekCards as any[]).filter((c: any) => c.status === "doing");
      const done  = (weekCards as any[]).filter((c: any) => ["done","verified"].includes(c.status));
      const proj  = [projectContext.company, projectContext.industry, projectContext.url].filter(Boolean).join(" | ");
      systemPrompt = "You are Manav Brain, a senior SEO strategist. Write precise, fact-based weekly agendas. Every verification step must name a specific tool and metric.";
      userPrompt = [
        `Write the ${weekLabel} agenda based only on these cards. Zero assumptions.`,
        `PROJECT: ${proj || "Not provided"}`,
        `STATUS: To Do: ${todo.length} | In Progress: ${doing.length} | Done: ${done.length}`,
        `CARDS (${(weekCards as any[]).length}):`,
        (weekCards as any[]).length === 0 ? "No cards placed here." :
          (weekCards as any[]).map((c: any) => `[${(c.type||"").toUpperCase()}|${c.priority}] "${c.title}"\n  ${(c.content||"").slice(0,250)}`).join("\n\n"),
        ``,
        `## ${weekLabel} — What Is Happening`,
        `## What Each Task Means`,
        `## Verification Checklist`,
        `## Gaps and Suggestions`,
        `## End-of-Week Report`,
      ].join("\n");

    } else if (mode === "pipeline") {
      systemPrompt = (ROLE_VOICE[role] || ROLE_VOICE.team_lead) + " You are Manav Brain.";
      userPrompt = [
        `PROJECT: ${projectSummary}`,
        `CANVAS:\n${byWeek || "No cards placed yet."}`,
        `LIBRARY: ${library.slice(0,12).map((b: any) => `[${b.type}|${b.priority}] "${b.title}"`).join(", ") || "Empty"}`,
        liveContent ? `\nLIVE SITE:\n${liveContent}` : "",
        ``,
        `Produce a full execution pipeline:`,
        `## Critical Path`,
        `## Dependency Map`,
        `## Week-by-Week Sequence`,
        `## Risk Register — table: Risk | Likelihood | Impact | Owner | Mitigation`,
        `## Capacity Check`,
        `## Before Week 1 Checklist`,
      ].filter(Boolean).join("\n");

    } else if (mode === "dependencies") {
      const fb = focusBlockId ? placed.find((b: any) => b.id === focusBlockId) : null;
      systemPrompt = (ROLE_VOICE[role] || ROLE_VOICE.senior_seo) + " You are Manav Brain.";
      userPrompt = [
        `PROJECT: ${projectSummary}`,
        `CANVAS:\n${byWeek}`,
        fb ? `FOCUS CARD: "${fb.title}" [${fb.type}|${fb.status}]\n${(fb.content||"").slice(0,350)}` : "",
        liveContent ? `LIVE SITE:\n${liveContent}` : "",
        ``,
        `Analyse dependencies for ${fb ? `"${fb.title}"` : "ALL tasks"}:`,
        `## Blockers`,
        `## What This Enables`,
        `## Parallel vs Sequential`,
        `## If Delayed 1 Week`,
        `## Verification Before Starting`,
      ].filter(Boolean).join("\n");

    } else if (mode === "deep_dive") {
      const fb = focusBlockId
        ? placed.find((b: any) => b.id === focusBlockId) || library.find((b: any) => b.id === focusBlockId)
        : null;
      systemPrompt = (ROLE_VOICE[role] || ROLE_VOICE.senior_seo) + " You are Manav Brain.";
      userPrompt = [
        `PROJECT: ${projectSummary}`,
        drContext,
        fb ? [
          `CARD TO ANALYSE:`,
          `"${fb.title}" [${fb.type}|${fb.priority}|${fb.status}]`,
          fb.content,
          `Effort: ${fb.effort||"unknown"} | Impact: ${fb.impact||"unknown"}`,
        ].join("\n") : `QUESTION: ${question}`,
        `CANVAS:\n${byWeek || "No cards placed yet."}`,
        liveContent ? `LIVE SITE:\n${liveContent}` : "",
        ``,
        `Provide a deep strategic analysis:`,
        `## Why This Card Matters`,
        `## Detailed Execution Plan`,
        `## Canvas Cards to Create`,
        `## What I Need to Execute This`,
        `## Dependencies and Risks`,
        `## Expected Outcomes (measurable)`,
      ].filter(Boolean).join("\n");

    } else {
      /* default chat mode */
      const fb = focusBlockId ? placed.find((b: any) => b.id === focusBlockId) : null;
      systemPrompt = (ROLE_VOICE[role] || ROLE_VOICE.senior_seo) + " You are Manav Brain.";
      userPrompt = [
        `PROJECT: ${projectSummary}`,
        drContext,
        `CANVAS:\n${byWeek || "No cards placed yet."}`,
        fb ? `FOCUS: "${fb.title}" [${fb.type}|${fb.status}]\n${(fb.content||"").slice(0,300)}` : "",
        liveContent ? `LIVE SITE:\n${liveContent}` : "",
        `QUESTION: ${question || "Provide a strategic overview of where this project stands."}`,
      ].filter(Boolean).join("\n");
    }

    /* ── Inject market persona into all non-agenda modes ── */
    if (marketPersonaContext && mode !== "agenda" && mode !== "brain_assistant") {
      systemPrompt += `\n\n=== BUYER MARKET PERSONA (Manav Eyes) ===\n${marketPersonaContext}\nUse this persona to make every recommendation buyer-psychology aware, not just technically correct.`;
    }

    /* ── Stream the response ── */
    const stream = await new Anthropic().messages.stream({
      model:      "claude-sonnet-4-6",
      max_tokens: 16000,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
    });

    let stopReason = "";
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        const text = chunk.delta.text;
        res.write(text);
        fullOutput += text;
      }
      if (chunk.type === "message_delta" && chunk.delta.stop_reason) {
        stopReason = chunk.delta.stop_reason;
      }
    }

    if (stopReason === "max_tokens") {
      const msg = "\n\n---\n⚠️ Response reached the length limit. Continue in next message.";
      res.write(msg);
      fullOutput += msg;
    }

  } catch (err: any) {
    const msg = `\nError: ${err?.message || "Unknown error"}`;
    try { res.write(msg); } catch (_w) { /* already closed */ }
  }

  /* ── Always end the response ── */
  try { res.end(); } catch (_e) { /* already ended */ }

  /* ── Background learning capture (after response is complete) ── */
  if (projectId && fullOutput.length > 200 &&
      (mode === "brain_assistant" || mode === "pipeline" || mode === "deep_dive")) {
    saveLearning({
      source:      mode === "brain_assistant" ? "brain_assistant_log" : mode === "pipeline" ? "pipeline_intelligence" : "deep_dive_analysis",
      projectId,
      content:     fullOutput,
      title:       mode === "brain_assistant" ? `Brain: ${question.slice(0, 50)}` : `Deep Dive: ${question.slice(0, 50)}`,
      cardType:    "strategy",
      contextSummary: `${mode} — ${(projectSummary || "").slice(0, 80)}`,
    }).catch(() => {});

    /* ── Intelligence Fabric: persist EVERY meaningful AI output (global memory) ── */
    try {
      const bac = brainAssistantContext || {};
      const learnCount = (bac.learnings  || []).length;
      const algoCount  = (bac.algoItems  || []).length;
      const canvasCount = ((bac.canvasBlocks || placed) as any[]).length;
      const sources: SourceUsage[] = [
        source("manual_user",       { label: "User question / context",     weight: 2 }),
        source("claude_inference",  { label: "Brain reasoning",             weight: 2 }),
        ...(learnCount  ? [source("brain_learning",      { label: `${learnCount} Brain Learnings`,    weight: 2, count: learnCount  })] : []),
        ...(algoCount   ? [source("algorithm_intel",     { label: `${algoCount} Algorithm Intel items`, weight: 1, count: algoCount  })] : []),
        ...(canvasCount ? [source("intelligence_output", { label: `${canvasCount} canvas cards`,       weight: 1, count: canvasCount })] : []),
        ...(marketPersonaContext ? [source("intelligence_output", { label: "Buyer persona context",   weight: 2 })] : []),
        ...(liveContent           ? [source("crawl_jina",         { label: "Live URL fetched",         weight: 2 })] : []),
      ];
      await saveIntelligenceOutput(db(), {
        projectId,
        analysisType: mode,
        title:        mode === "brain_assistant" ? `Brain Chat: ${question.slice(0, 80)}` :
                      mode === "pipeline"        ? `Pipeline: ${(projectSummary || "").slice(0, 60)}` :
                      mode === "deep_dive"       ? `Deep Dive: ${question.slice(0, 60)}` :
                                                   `${mode}: ${question.slice(0, 60)}`,
        summary:      fullOutput.slice(0, 480),
        output:       { question, response: fullOutput, role, mode, projectSummary },
        sources,
        modelUsed:    "claude-sonnet-4-6",
        createdBy:    "intelligence_api",
      });
    } catch (_e) { /* non-fatal */ }
  }
}
