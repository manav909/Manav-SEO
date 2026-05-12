import Anthropic                              from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractAndSaveLearning }            from "./ai-cache";

export const config = { maxDuration: 120 };

const SYSTEM = "You are Manav Brain, the senior SEO strategist embedded in SEO Season. Speak as a knowledgeable senior colleague who genuinely cares about this project. Use I throughout. Be direct, specific, and honest. Never invent data. Flag every assumption. Reference actual card titles and data from the canvas — never make things up.";

const ROLE_VOICE: Record<string, string> = {
  content_writer:  "You are talking directly to a Content Writer. Tell them exactly what to write this week, why each piece matters, what keywords to hit, and what great looks like.",
  team_lead:       "You are giving a Team Lead a real update. Show who is blocked, what the exact blockers are, what to escalate, and what the standup should focus on today.",
  executive:       "You are advising a business owner. Give them 3 things to know and 1 decision to make. No jargon. Everything in terms of revenue, competitive position, and what is being built toward.",
  senior_seo:      "You are a senior SEO strategist sharing your real thinking. Go deep on algorithm signals, topical authority gaps, E-E-A-T, and GEO opportunities. Cite specific factors.",
  project_manager: "You are a PM giving a status update. Format: Status, Risk, Action. Cover milestones, dependency blockers, resource gaps.",
  biz_dev:         "You are helping a business development manager tell the story. Give them what is working, what the numbers show, how to handle objections, and what the upsell angle is.",
};

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

// ─────────────────────────────────────────────────────────────────────
// BRAIN ASSISTANT — The master intelligence system
// Knows everything, can execute everything, never hallucinates.
// Uses ⟦ACTION⟧{...}⟦/ACTION⟧ tags for executable operations.
// ─────────────────────────────────────────────────────────────────────
function buildBrainAssistantPrompt(ctx: {
  question:       string;
  projectContext: any;
  learnings:      any[];
  algoItems:      any[];
  canvasBlocks:   any[];
  history:        { role: string; content: string }[];
  projectSummary: string;
}): { system: string; user: string } {

  const pc  = ctx.projectContext || {};
  const proj = pc.project || {};
  const goals= pc.goals   || {};
  const met  = pc.metrics || {};

  const projectSection = [
    `COMPANY: ${proj.name || "Unknown"} | URL: ${proj.url || "Not set"}`,
    `GOAL: ${goals.primary || "Not set"} | Timeline: ${goals.timeline || "Not set"}`,
    `KEYWORDS: ${goals.keywords || (proj.keywords || []).join(", ") || "Not set"}`,
    met.llmVisibility != null
      ? `SCORES: LLM ${met.llmVisibility}/100 | Health ${met.algorithmHealth}/100 | EEAT ${met.eeat}/100 | Authority ${met.authority}/100`
      : "SCORES: Not yet recorded — go to Metrics Dashboard",
    `ANALYTICS: Organic ${pc.analytics?.organicMonthly || "?"}/mo | GSC ${pc.analytics?.gscClicks || "?"} clicks | Avg pos ${pc.analytics?.gscAvgPos || "?"}`,
    `TECHNICAL: ${pc.technical?.pagesIndexed || "?"} pages indexed | Crawl errors: ${pc.technical?.crawlErrors || "none"}`,
    `CMS: ${pc.tech?.cms || "Not set"} | SEO plugin: ${pc.tech?.seoPlugin || "Not set"} | PageSpeed: ${pc.tech?.pagespdMobile || "?"}`,
    `COMPETITORS: ${[pc.competitors?.c1, pc.competitors?.c2].filter(Boolean).join(", ") || "Not set"} | Our DR: ${pc.competitors?.ourDR || "?"}`,
  ].join("\n");

  const learningsSection = ctx.learnings.length > 0
    ? ctx.learnings.slice(0, 10).map((l: any, i: number) =>
        `[${i+1}] ${l.card_type?.toUpperCase()} — "${l.card_title}"\n    Improvement: ${l.improvement || "—"}\n    Applied: ${l.applied_count || 0}× | Source: ${l.source}`
      ).join("\n")
    : "No active learnings yet. The brain is learning from every AI operation automatically.";

  const algoSection = ctx.algoItems.length > 0
    ? ctx.algoItems.slice(0, 10).map((a: any) =>
        `• [${a.impact_level?.toUpperCase()}] ${a.title} (${a.engine}): ${(a.summary || "").slice(0, 120)}`
      ).join("\n")
    : "No algorithm knowledge saved yet. Use Algorithm Intelligence to research topics.";

  const canvasSection = ctx.canvasBlocks.length > 0
    ? [1,2,3,4,5].map(w => {
        const wb = ctx.canvasBlocks.filter((b: any) => b.placed && b.week === w);
        if (!wb.length) return "";
        return `Week ${w === 5 ? "Backlog" : w} (${wb.length}): ${wb.map((b: any) => `[${b.type}|${b.status}] "${b.title}"`).join(", ")}`;
      }).filter(Boolean).join("\n")
    : "Canvas is empty. No cards placed yet.";

  const historySection = ctx.history.length > 0
    ? ctx.history.slice(-8).map(m => `${m.role === "user" ? "User" : "Manav Brain"}: ${m.content.slice(0, 200)}`).join("\n")
    : "";

  const system = `You are MANAV BRAIN — the most intelligent SEO partner ever built. You are the master intelligence running SEO Season, with complete knowledge of and control over every feature of this software.

You are simultaneously:
• A world-class senior SEO strategist with deep knowledge of Google, ChatGPT Search, Perplexity, and Bing algorithms
• A technical SEO expert who understands every crawl signal, Core Web Vitals issue, and indexation problem
• A GEO (Generative Engine Optimisation) specialist who knows how to get cited by AI search engines
• The operational brain of this software — you know every feature and can direct the user or execute operations

CRITICAL RULES — never break these:
1. ONLY state facts from the data provided. Never invent metrics, rankings, or statistics.
2. When you want to execute an operation, use ACTION tags (format below). Be proactive.
3. Self-optimize: if a task is too large for one response, break it into sequential steps with multiple actions.
4. Write your own optimized prompts — craft the most effective version, not just what the user said.
5. After every response, recommend the single highest-value next action.
6. If data is missing, tell the user EXACTLY which page in the software has it and what to fill in.
7. Detect token limit warnings in responses ("reached the length limit") and automatically continue.

EXECUTABLE ACTIONS — use these tags to control the software:
When you want to navigate somewhere:
⟦ACTION⟧{"type":"navigate","path":"/playground","label":"Open Strategy Canvas"}⟦/ACTION⟧
⟦ACTION⟧{"type":"navigate","path":"/data-room","label":"Open Data Room"}⟦/ACTION⟧
⟦ACTION⟧{"type":"navigate","path":"/brain-learning","label":"Open Brain Learning"}⟦/ACTION⟧
⟦ACTION⟧{"type":"navigate","path":"/algorithm-intel","label":"Open Algorithm Intelligence"}⟦/ACTION⟧
⟦ACTION⟧{"type":"navigate","path":"/audit","label":"Open Audit Tool"}⟦/ACTION⟧
⟦ACTION⟧{"type":"navigate","path":"/dashboard","label":"Open Dashboard"}⟦/ACTION⟧
⟦ACTION⟧{"type":"navigate","path":"/admin","label":"Open Admin Panel"}⟦/ACTION⟧
⟦ACTION⟧{"type":"navigate","path":"/launchpad","label":"Open Launchpad"}⟦/ACTION⟧

When you want to run an SEO audit:
⟦ACTION⟧{"type":"run_audit","url":"https://example.com","mode":"standard","label":"Run SEO Audit for example.com"}⟦/ACTION⟧

When you want to fetch algorithm intelligence:
⟦ACTION⟧{"type":"fetch_algorithm","topicId":"g_march_2025_core","topicLabel":"March 2025 Core Update","label":"Fetch March 2025 Core Update"}⟦/ACTION⟧
⟦ACTION⟧{"type":"fetch_custom_algorithm","topicLabel":"Your custom SEO topic","label":"Research: Your custom topic"}⟦/ACTION⟧

When you want to create a canvas card:
⟦ACTION⟧{"type":"add_card","cardType":"technical","title":"Fix crawl errors","content":"Address the 23 crawl errors found in audit. Focus on 404s and redirect chains first.","priority":"high","week":1,"label":"Add Technical Card: Fix crawl errors"}⟦/ACTION⟧

When you want to search brain learnings:
⟦ACTION⟧{"type":"search_brain","query":"technical","label":"Search brain for technical learnings"}⟦/ACTION⟧

ALWAYS respond with:
1. A direct, specific answer using only the data provided
2. ACTION tags for any operations you want to execute
3. A clear "Next: [specific recommended action]" at the end`;

  const user = [
    `PROJECT INTELLIGENCE:`,
    projectSection,
    ``,
    `ACTIVE BRAIN LEARNINGS (${ctx.learnings.length} neural pathways):`,
    learningsSection,
    ``,
    `ALGORITHM KNOWLEDGE (${ctx.algoItems.length} topics saved):`,
    algoSection,
    ``,
    `CANVAS STATE:`,
    canvasSection,
    historySection ? `\nCONVERSATION HISTORY:\n${historySection}` : "",
    ``,
    `USER REQUEST: ${ctx.question}`,
  ].filter(s => s !== undefined).join("\n");

  return { system, user };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    mode            = "chat",
    blocks          = [],
    question        = "",
    role            = "team_lead",
    projectSummary  = "",
    focusBlockId    = null,
    checkUrl        = null,
    week,
    weekLabel,
    weekCards       = [],
    allPlacedCards  = [],
    projectContext  = {},
    dataRoom        = {},
    cardRequirements= [],
    projectId       = null,
    // Brain assistant specific
    brainAssistantContext = null,
  } = req.body;

  const placed  = (blocks as any[]).filter(b => b.placed);
  const library = (blocks as any[]).filter(b => !b.placed);

  const drContext = (() => {
    const dr = dataRoom as any;
    if (!dr || !Object.keys(dr).length) return "";
    const lines: string[] = ["DATA ROOM KNOWLEDGE:"];
    if (dr.goals?.primary)            lines.push(`  Goal: ${dr.goals.primary} | Timeline: ${dr.goals.timeline || "?"} | Keywords: ${dr.goals.keywords || "?"}`);
    if (dr.analytics?.organicMonthly) lines.push(`  Organic sessions/mo: ${dr.analytics.organicMonthly} | Avg position: ${dr.analytics.gscAvgPos || "?"}`);
    if (dr.technical?.pagesIndexed)   lines.push(`  Pages indexed: ${dr.technical.pagesIndexed} | Crawl errors: ${dr.technical.crawlErrors || "none"}`);
    if (dr.competitors?.c1)           lines.push(`  Competitors: ${[dr.competitors.c1, dr.competitors.c2].filter(Boolean).join(", ")} | Our DR: ${dr.competitors.ourDR || "?"}`);
    if (dr.tech?.cms)                 lines.push(`  CMS: ${dr.tech.cms} | SEO plugin: ${dr.tech.seoPlugin || "?"} | PageSpeed mob: ${dr.tech.pagespdMobile || "?"}`);
    if (dr.metrics)                   lines.push(`  Metrics: LLM ${dr.metrics.llmVisibility ?? "?"}% | Health ${dr.metrics.algorithmHealth ?? "?"}% | EEAT ${dr.metrics.eeat ?? "?"}%`);
    if (dr.audits?.length)            lines.push(`  Latest audit: ${dr.audits[0].date}`);
    if (cardRequirements?.length)     lines.push(`  Saved requirements: ${(cardRequirements as any[]).map((r:any) => `${r.category}: ${r.requirement}`).join(" | ")}`);
    return lines.join("\n");
  })();

  const byWeek = [1, 2, 3, 4, 5].map(w => {
    const wb = placed.filter((b: any) => b.week === w);
    if (!wb.length) return "";
    return [`${w === 5 ? "BACKLOG" : `WEEK ${w}`} (${wb.length} cards):`,
      ...wb.map((b: any) => `  [${(b.type||"").toUpperCase()}|${b.status}|${b.priority}] "${b.title}"${b.assignee ? ` — ${b.assignee}` : ""}\n   ${(b.content||"").slice(0, 120)}`)
    ].join("\n");
  }).filter(Boolean).join("\n\n");

  let liveContent = "";
  if (checkUrl) liveContent = await fetchUrl(checkUrl);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200);

  try {
    const anthropic  = new Anthropic();
    let systemPrompt = SYSTEM;
    let userPrompt   = "";

    // ── BRAIN ASSISTANT MODE — master intelligence with full context ──
    if (mode === "brain_assistant") {
      const bac = brainAssistantContext || {};
      const { system, user } = buildBrainAssistantPrompt({
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
      const todo  = (weekCards as any[]).filter(c => c.status === "todo");
      const doing = (weekCards as any[]).filter(c => c.status === "doing");
      const done  = (weekCards as any[]).filter(c => ["done", "verified"].includes(c.status));
      const proj  = [projectContext.company, projectContext.industry, projectContext.url].filter(Boolean).join(" | ");
      const cardDetail = (c: any) => [`[${(c.type||"").toUpperCase()}|${c.priority}|${c.effort||"?"}]`,`Title: ${c.title}`,`Detail: ${(c.content||"").slice(0,250)}`,`Assigned: ${c.assignee||"Unassigned"}`,`Status: ${c.status}`].join("\n");
      systemPrompt = SYSTEM + " Write precise, fact-based weekly agendas. Every verification step must name a specific tool and metric.";
      userPrompt = [`Write the ${weekLabel} agenda based only on the cards provided. Zero assumptions.`,``,`PROJECT: ${proj||"Not provided"}`,``,`CARDS (${(weekCards as any[]).length} total):`,
        (weekCards as any[]).length === 0 ? "No cards placed here yet." : (weekCards as any[]).map(cardDetail).join("\n\n---\n\n"),
        ``,`STATUS: To Do: ${todo.length} | In Progress: ${doing.length} | Done: ${done.length}`,``,
        `OTHER WEEKS (context): ${(allPlacedCards as any[]).filter((c:any)=>c.week!==week).slice(0,20).map((c:any)=>`W${c.week}: [${c.type}] ${c.title}`).join(", ")||"None"}`,``,
        `## ${weekLabel} — What Is Happening`,`[2-3 sentences based only on the cards]`,``,`## What Each Task Means`,`[For every card: what, why, who, status, how to verify it is done]`,``,
        `## Verification Checklist`,`| Task | Tool | What to Check | Pass Condition |`,``,`## Gaps and Suggestions`,`[Only if there is a clear gap. Otherwise: "Week plan is complete."]`,``,
        `## End-of-Week Report`,`[What data to pull, what to compare it to, acceptable range, red flags]`].join("\n");

    } else if (mode === "pipeline") {
      systemPrompt = (ROLE_VOICE[role] || ROLE_VOICE.team_lead) + " " + SYSTEM;
      userPrompt = [`PROJECT: ${projectSummary}`,``,`CANVAS:`,byWeek||"No cards placed yet.",``,`LIBRARY: ${library.slice(0,12).map((b:any)=>`[${b.type}|${b.priority}] "${b.title}"`).join(", ")||"Empty"}`,liveContent?`\nLIVE SITE:\n${liveContent}`:"",``,`Produce a full execution pipeline:`,`## Critical Path`,`## Dependency Map`,`## Week-by-Week Sequence`,`## Risk Register — table with: Risk | Likelihood | Impact | Owner | Mitigation`,`## Capacity Check`,`## Before Week 1 Checklist`].join("\n");

    } else if (mode === "dependencies") {
      const fb = focusBlockId ? placed.find((b:any)=>b.id===focusBlockId) : null;
      systemPrompt = (ROLE_VOICE[role]||ROLE_VOICE.senior_seo) + " " + SYSTEM;
      userPrompt = [`PROJECT: ${projectSummary}`,`CANVAS:`,byWeek,fb?`FOCUS CARD: "${fb.title}" [${fb.type}|${fb.status}]\n${(fb.content||"").slice(0,350)}`:"",liveContent?`LIVE SITE:\n${liveContent}`:"",``,`Analyse dependencies for ${fb?`"${fb.title}"`:"ALL tasks"}:`,`## Blockers`,`## What This Enables`,`## Parallel vs Sequential`,`## If Delayed 1 Week`,`## Verification Before Starting`].filter(l=>l!=="").join("\n");

    } else if (mode === "deep_dive") {
      const fb = focusBlockId ? placed.find((b:any)=>b.id===focusBlockId)||library.find((b:any)=>b.id===focusBlockId) : null;
      systemPrompt = (ROLE_VOICE[role]||ROLE_VOICE.senior_seo) + " " + SYSTEM;
      userPrompt = [`PROJECT: ${projectSummary}`,``,drContext,``,
        fb?[`CARD TO ANALYSE IN DEPTH:`,`"${fb.title}" [${fb.type}|${fb.priority}|${fb.status}]`,fb.content,`Assigned: ${fb.assignee||"Unassigned"} | Effort: ${fb.effort||"unknown"} | Impact: ${fb.impact||"unknown"}`].join("\n"):`QUESTION: ${question}`,
        ``,`FULL CANVAS CONTEXT:`,byWeek||"No cards placed yet.",liveContent?`\nLIVE SITE:\n${liveContent}`:"",``,
        `Provide a deep strategic analysis covering:`,`## Why This Card Matters`,`## Detailed Execution Plan (step-by-step, citing specific data from Data Room)`,
        `## Canvas Cards to Create`,`List 2-4 canvas cards with: title, type, week (1-4), priority, why to create.`,
        `## What I Need to Execute This`,`## Dependencies and Risks`,`## Expected Outcomes (measurable)`].filter(l=>l!=="").join("\n");

    } else {
      const fb = focusBlockId ? placed.find((b:any)=>b.id===focusBlockId) : null;
      systemPrompt = (ROLE_VOICE[role]||ROLE_VOICE.senior_seo) + " " + SYSTEM;
      userPrompt = [`PROJECT: ${projectSummary}`,drContext,`CANVAS:`,byWeek||"No cards placed yet.",fb?`FOCUS: "${fb.title}" [${fb.type}|${fb.status}]\n${(fb.content||"").slice(0,300)}`:"",liveContent?`LIVE SITE:\n${liveContent}`:"",``,`QUESTION: ${question||"Provide a strategic overview of where this project stands."}`].filter(l=>l!=="").join("\n");
    }

    try {
      const stream = await anthropic.messages.stream({
        model: "claude-sonnet-4-5", max_tokens: 6000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      let stopReason  = "";
      let fullOutput  = "";

      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          res.write(chunk.delta.text);
          fullOutput += chunk.delta.text;
        }
        if (chunk.type === "message_delta" && chunk.delta.stop_reason) {
          stopReason = chunk.delta.stop_reason;
        }
      }

      if (stopReason === "max_tokens") {
        console.warn(`[SEO Season] intelligence.ts hit max_tokens — mode: ${mode}, role: ${role}`);
        const truncMsg = "\n\n---\n⚠️ Response reached the length limit. I am continuing in the next message automatically.";
        res.write(truncMsg);
        fullOutput += truncMsg;
      }

      // Auto-capture brain learnings for strategic modes
      if ((mode === "pipeline" || mode === "deep_dive" || mode === "brain_assistant") && projectId && fullOutput.length > 500) {
        const fb = focusBlockId
          ? placed.find((b:any)=>b.id===focusBlockId)||library.find((b:any)=>b.id===focusBlockId)
          : null;
        void extractAndSaveLearning(
          mode === "pipeline" ? "pipeline_intelligence" : mode === "brain_assistant" ? "brain_assistant_log" : "deep_dive_analysis",
          projectId,
          fullOutput,
          {
            card_type:       fb?.type || "strategy",
            card_title:      fb?.title || (mode === "brain_assistant" ? `Brain: ${question.slice(0, 50)}` : `Deep Dive: ${question.slice(0, 50)}`),
            context_summary: `${mode} — ${projectSummary?.slice(0, 80)}`,
          }
        );
      }

    } catch (streamErr: any) {
      res.write(`\nError: ${streamErr.message}`);
    }

  } catch (outerErr: any) {
    try { res.write(`\nError: ${outerErr.message}`); } catch (_e) { /* already closed */ }
  } finally {
    try { res.end(); } catch (_e) { /* already ended */ }
  }
}
