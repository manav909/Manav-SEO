import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

const SYSTEM = "You are Manav Brain, the senior SEO strategist embedded in SEO Season. Speak as a knowledgeable senior colleague who genuinely cares about this project. Use I throughout. Be direct, specific, and honest. Never invent data. Flag every assumption. Reference actual card titles and data from the canvas — never make things up.";

const ROLE_VOICE: Record<string, string> = {
  content_writer:  "You are talking directly to a Content Writer. Tell them exactly what to write this week, why each piece matters, what keywords to hit, and what great looks like. Flag anything from the technical side that affects their writing.",
  team_lead:       "You are giving a Team Lead a real update. Show who is blocked, what the exact blockers are, what to escalate, and what the standup should focus on today. Reference actual card titles. Be honest when something is going wrong.",
  executive:       "You are advising a business owner. Give them 3 things to know and 1 decision to make. No jargon. Everything in terms of revenue, competitive position, and what is being built toward. Tell them when something needs their attention.",
  senior_seo:      "You are a senior SEO strategist sharing your real thinking. Go deep on algorithm signals, topical authority gaps, E-E-A-T, and GEO opportunities. Cite specific factors. Tell them what the real leverage points are right now.",
  project_manager: "You are a PM giving a status update. Format: Status, Risk, Action. Cover milestones, dependency blockers, resource gaps. Be direct when something is going to slip and say exactly what to do about it.",
  biz_dev:         "You are helping a business development manager tell the story. Give them what is working, what the numbers show, how to handle objections, and what the upsell angle is. Everything framed for client conversations.",
};

async function fetchUrl(url: string): Promise<string> {
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    const r = await fetch(`https://r.jina.ai/${u}`, {
      headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "15" },
      signal: AbortSignal.timeout(18000),
    });
    return r.ok ? (await r.text()).slice(0, 3000) : "";
  } catch { return ""; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    mode = "chat",
    blocks = [],
    question = "",
    role = "team_lead",
    projectSummary = "",
    focusBlockId = null,
    checkUrl = null,
    week,
    weekLabel,
    weekCards = [],
    allPlacedCards = [],
    projectContext = {},
  } = req.body;

  const placed  = (blocks as any[]).filter(b => b.placed);
  const library = (blocks as any[]).filter(b => !b.placed);

  const byWeek = [1, 2, 3, 4, 5].map(w => {
    const wb = placed.filter((b: any) => b.week === w);
    if (!wb.length) return "";
    return [
      `${w === 5 ? "BACKLOG" : `WEEK ${w}`} (${wb.length} cards):`,
      ...wb.map((b: any) =>
        `  [${(b.type || "").toUpperCase()}|${b.status}|${b.priority}] "${b.title}"${b.assignee ? ` — ${b.assignee}` : ""}\n   ${(b.content || "").slice(0, 120)}`
      ),
    ].join("\n");
  }).filter(Boolean).join("\n\n");

  let liveContent = "";
  if (checkUrl) liveContent = await fetchUrl(checkUrl);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200);

  const anthropic = new Anthropic();
  let systemPrompt = SYSTEM;
  let userPrompt   = "";

  if (mode === "agenda") {
    const todo  = (weekCards as any[]).filter(c => c.status === "todo");
    const doing = (weekCards as any[]).filter(c => c.status === "doing");
    const done  = (weekCards as any[]).filter(c => ["done", "verified"].includes(c.status));
    const proj  = [projectContext.company, projectContext.industry, projectContext.url].filter(Boolean).join(" | ");
    const cardDetail = (c: any) => [
      `[${(c.type || "").toUpperCase()}|${c.priority}|${c.effort || "?"}]`,
      `Title: ${c.title}`,
      `Detail: ${(c.content || "").slice(0, 250)}`,
      `Assigned: ${c.assignee || "Unassigned"}`,
      `Status: ${c.status}`,
    ].join("\n");

    systemPrompt = SYSTEM + " Write precise, fact-based weekly agendas. Every verification step must name a specific tool and metric.";
    userPrompt = [
      `Write the ${weekLabel} agenda based only on the cards provided. Zero assumptions.`,
      "",
      `PROJECT: ${proj || "Not provided"}`,
      "",
      `CARDS (${(weekCards as any[]).length} total):`,
      (weekCards as any[]).length === 0 ? "No cards placed here yet." : (weekCards as any[]).map(cardDetail).join("\n\n---\n\n"),
      "",
      `STATUS: To Do: ${todo.length} | In Progress: ${doing.length} | Done: ${done.length}`,
      "",
      `OTHER WEEKS (context): ${(allPlacedCards as any[]).filter((c: any) => c.week !== week).slice(0, 20).map((c: any) => `W${c.week}: [${c.type}] ${c.title}`).join(", ") || "None"}`,
      "",
      `## ${weekLabel} — What Is Happening`,
      "[2-3 sentences based only on the cards]",
      "",
      "## What Each Task Means",
      "[For every card: what, why, who, status, how to verify it is done]",
      "",
      "## Verification Checklist",
      "| Task | Tool | What to Check | Pass Condition |",
      "",
      "## Gaps and Suggestions",
      '[Only if there is a clear gap from the existing cards. Otherwise write: "Week plan is complete."]',
      "",
      "## End-of-Week Report",
      "[What data to pull, what to compare it to, acceptable range, what is a red flag]",
    ].join("\n");

  } else if (mode === "pipeline") {
    systemPrompt = (ROLE_VOICE[role] || ROLE_VOICE.team_lead) + " " + SYSTEM;
    userPrompt = [
      `PROJECT: ${projectSummary}`,
      "",
      "CANVAS:",
      byWeek || "No cards placed yet.",
      "",
      `LIBRARY: ${library.slice(0, 12).map((b: any) => `[${b.type}|${b.priority}] "${b.title}"`).join(", ") || "Empty"}`,
      liveContent ? `\nLIVE SITE:\n${liveContent}` : "",
      "",
      "Produce a full execution pipeline:",
      "## Critical Path",
      "## Dependency Map",
      "## Week-by-Week Sequence",
      "## Risk Register — table with: Risk | Likelihood | Impact | Owner | Mitigation",
      "## Capacity Check",
      "## Before Week 1 Checklist",
    ].join("\n");

  } else if (mode === "dependencies") {
    const fb = focusBlockId ? placed.find((b: any) => b.id === focusBlockId) : null;
    systemPrompt = (ROLE_VOICE[role] || ROLE_VOICE.senior_seo) + " " + SYSTEM;
    userPrompt = [
      `PROJECT: ${projectSummary}`,
      "CANVAS:",
      byWeek,
      fb ? `FOCUS CARD: "${fb.title}" [${fb.type}|${fb.status}]\n${(fb.content || "").slice(0, 350)}` : "",
      liveContent ? `LIVE SITE:\n${liveContent}` : "",
      "",
      `Analyse dependencies for ${fb ? `"${fb.title}"` : "ALL tasks"}:`,
      "## Blockers",
      "## What This Enables",
      "## Parallel vs Sequential",
      "## If Delayed 1 Week",
      "## Verification Before Starting",
    ].filter(l => l !== "").join("\n");

  } else if (mode === "deep_dive") {
    const fb = focusBlockId
      ? placed.find((b: any) => b.id === focusBlockId) || library.find((b: any) => b.id === focusBlockId)
      : null;
    systemPrompt = SYSTEM;
    userPrompt = [
      `PROJECT: ${projectSummary}`,
      "",
      fb ? [
        "CARD TO ANALYSE:",
        `"${fb.title}" [${fb.type}|${fb.priority}|${fb.status}]`,
        fb.content,
        `Assigned: ${fb.assignee || "Unassigned"} | Effort: ${fb.effort || "unknown"} | Impact: ${fb.impact || "unknown"}`,
        "",
        "CANVAS CONTEXT:",
        byWeek,
      ].join("\n") : question,
    ].join("\n");

  } else {
    // chat or canvas_chat
    const fb = focusBlockId ? placed.find((b: any) => b.id === focusBlockId) : null;
    systemPrompt = (ROLE_VOICE[role] || ROLE_VOICE.senior_seo) + " " + SYSTEM;
    userPrompt = [
      `PROJECT: ${projectSummary}`,
      "CANVAS:",
      byWeek || "No cards placed yet.",
      fb ? `FOCUS: "${fb.title}" [${fb.type}|${fb.status}]\n${(fb.content || "").slice(0, 300)}` : "",
      liveContent ? `LIVE SITE:\n${liveContent}` : "",
      "",
      `QUESTION: ${question || "Provide a strategic overview of where this project stands."}`,
    ].filter(l => l !== "").join("\n");
  }

  try {
    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-5", max_tokens: 3500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        res.write(chunk.delta.text);
      }
    }
  } catch (err: any) {
    res.write(`\nError: ${err.message}`);
  } finally {
    res.end();
  }
}
