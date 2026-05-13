import Anthropic                              from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractAndSaveLearning }             from "./ai-cache";

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
    ? ctx.learnings.slice(0, 10).map((l: any, i: number) =>
        `[${i+1}] ${l.card_type?.toUpperCase()} — "${l.card_title}"\n    Improvement: ${l.improvement || "—"}`
      ).join("\n")
    : "No active learnings yet.";

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

RULES:
1. ONLY state facts from the data provided. Never invent metrics.
2. Use ACTION tags to execute operations (format below).
3. End every response with the single highest-value next action.
4. If data is missing, tell the user exactly which page has it.

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
Search brain: ⟦ACTION⟧{"type":"search_brain","query":"technical","label":"Search Brain Learnings"}⟦/ACTION⟧`;

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
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200);

  let systemPrompt = "";
  let userPrompt   = "";
  let fullOutput   = "";

  try {
    /* ── Build prompt based on mode ── */
    if (mode === "brain_assistant") {
      const bac = brainAssistantContext || {};
      const { system, user } = buildBrainPrompt({
        question,
        projectContext: bac.projectContext || projectContext,
        learnings:      bac.learnings      || [],
        algoItems:      bac.algoItems      || [],
        canvasBlocks:   bac.canvasBlocks   || placed,
        history:        bac.history        || [],
        projectSummary,
      });
      systemPrompt = system;
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
  /* Using Promise to defer — setImmediate is unreliable in Vercel */
  if (projectId && fullOutput.length > 200 &&
      (mode === "brain_assistant" || mode === "pipeline" || mode === "deep_dive")) {
    Promise.resolve().then(() => {
      void extractAndSaveLearning(
        mode === "brain_assistant" ? "brain_assistant_log"
          : mode === "pipeline"   ? "pipeline_intelligence"
          : "deep_dive_analysis",
        projectId,
        fullOutput,
        {
          card_type:       "strategy",
          card_title:      mode === "brain_assistant" ? `Brain: ${question.slice(0, 50)}` : `Deep Dive: ${question.slice(0, 50)}`,
          context_summary: `${mode} — ${projectSummary?.slice(0, 80)}`,
        }
      );
    }).catch(() => { /* non-fatal */ });
  }
}
