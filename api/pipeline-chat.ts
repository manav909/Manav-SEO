import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

const ROLE_CONTEXTS: Record<string, string> = {
  content_writer:  `You are advising a Content Writer on an SEO campaign. Focus on: what to write, structure, keywords, internal linking, tone, GEO readiness, deadlines. Never discuss technical SEO unless it directly affects their writing task. Be specific about the actual content tasks on the canvas.`,
  team_lead:       `You are advising a Team Lead running the campaign. They need: who is blocked, exact blockers, what to escalate, capacity status, today's standup focus. Be direct about risks. Reference actual card titles and assignees from the canvas.`,
  executive:       `You are advising an Executive. Translate everything to business outcomes: revenue, competitive position, brand visibility, ROI. Plain English only. No jargon. Give them 3 things to know and 1 decision to make. Reference actual progress numbers from the canvas.`,
  senior_seo:      `You are advising a Senior SEO Strategist. They want technical depth: algorithm signals, topical authority, E-E-A-T signals, GEO/AI citation strategy, competitive gaps. Reference specific search signals and ranking factors tied to the actual canvas cards.`,
  project_manager: `You are advising a Project Manager. Format: Status / Risk / Action. Provide milestone status, risk register items, resource gaps, dependency blockers. Everything must be immediately actionable.`,
  biz_dev:         `You are advising a Business Development Manager. They need: how to present results compellingly, objection handling scripts, upsell angles from campaign data, renewal talking points, proof points for the next client meeting. Make everything commercial and client-facing.`,
};

const ROLE_LABELS: Record<string, string> = {
  content_writer:  "Content Writer",
  team_lead:       "Team Lead",
  executive:       "Executive",
  senior_seo:      "Senior SEO Strategist",
  project_manager: "Project Manager",
  biz_dev:         "Business Dev Manager",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    question = "",
    role = "team_lead",
    blocks = [],
    projectSummary = "",
    focusBlockId = null,
    checkUrl = null,
    mode = "chat",
  } = req.body;

  const placed  = (blocks as any[]).filter((b: any) => b.placed);
  const library = (blocks as any[]).filter((b: any) => !b.placed);

  /* ── Canvas summary (compact — trim per card to stay within input limits) ── */
  const byWeek = [1,2,3,4,5].map(w => {
    const wb = placed.filter((b: any) => b.week === w);
    if (!wb.length) return '';
    const label = w === 5 ? 'BACKLOG' : `WEEK ${w}`;
    return `${label} (${wb.length} tasks):\n${wb.map((b: any) =>
      `  [${(b.type||'').toUpperCase()}|${b.status}|${b.priority}] "${b.title}"${b.assignee ? ` → ${b.assignee}` : ''}\n   ${(b.content||'').slice(0,120)}`
    ).join('\n')}`;
  }).filter(Boolean).join('\n\n');

  const libSnippet = library.slice(0, 12)
    .map((b: any) => `  [${b.type}|${b.priority}] "${b.title}"`)
    .join('\n');

  /* ── Optional live site fetch ── */
  let liveContent = '';
  if (checkUrl) {
    try {
      const r = await fetch(`https://r.jina.ai/${checkUrl}`, {
        headers: { "Accept": "text/plain", "X-Return-Format": "markdown", "X-Timeout": "15" },
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) liveContent = (await r.text()).slice(0, 2500);
    } catch { liveContent = ''; }
  }

  const roleCtx  = ROLE_CONTEXTS[role]  || ROLE_CONTEXTS.team_lead;
  const roleName = ROLE_LABELS[role]    || "Team Lead";

  /* ── Build prompt ── */
  let prompt = '';

  if (mode === 'pipeline') {
    prompt = `PROJECT: ${projectSummary}

CANVAS (${placed.length} placed tasks):
${byWeek || 'No cards placed yet — advise on what to set up first'}

LIBRARY (${library.length} unplaced):
${libSnippet || 'Empty'}
${liveContent ? `\nLIVE SITE DATA:\n${liveContent}` : ''}

Produce a full execution pipeline for a ${roleName}. Reference actual card titles. Be specific.

## Critical Path
The exact sequence that must not slip — "[Card A]" → "[Card B]" → "[Card C]". Explain why each blocks the next.

## Dependency Map
For each task with a prerequisite:
**"[Card Title]"** requires **"[Prerequisite]"** first
- Why: [specific technical or strategic reason]
- If delayed 1 week: [exact downstream effect]
- How to unblock: [specific action]

## Week-by-Week Execution Order
For each occupied week: what order to do things in and why that order matters.

## Risk Register
| Risk | Likelihood | Impact | Owner | Mitigation |
|---|---|---|---|---|

## Capacity Check
Per assignee: is their load realistic? Flag overallocation by name.

## Before Week 1 Checklist
What must be true before any card in Week 1 can start:
- [ ] [specific prerequisite]

## Gaps That Would Strengthen the Plan
[Only if a clear gap exists backed by the placed cards]`;

  } else if (mode === 'dependencies') {
    const fb = focusBlockId ? placed.find((b: any) => b.id === focusBlockId) : null;
    prompt = `PROJECT: ${projectSummary}

CANVAS:
${byWeek || 'No cards placed yet'}
${liveContent ? `\nLIVE SITE DATA:\n${liveContent}` : ''}

Analyse dependencies for ${fb ? `"${fb.title}" (${fb.type}|${fb.status}|Week ${fb.week === 5 ? 'Backlog' : fb.week})` : 'ALL placed tasks'}.
${fb ? `\nTask detail: ${(fb.content||'').slice(0,350)}` : ''}

## What Must Be Done First (Blockers)
Every task or condition that must be complete before this can start — technical and content prerequisites listed separately.

## What This Enables (Downstream)
Tasks that cannot start until this is done — with specific reason for each.

## Can Run in Parallel
What can safely happen at the same time — and what absolutely cannot.

## If Delayed by 1 Week
Exact cascade: which tasks slip, by how long, total impact on timeline.

## Verification Before Starting
Specific checks to confirm prerequisites are met — tool + what to look for.`;

  } else {
    const fb = focusBlockId ? placed.find((b: any) => b.id === focusBlockId) : null;
    prompt = `PROJECT: ${projectSummary}

CANVAS:
${byWeek || 'No cards placed yet'}
${fb ? `\nFOCUSED TASK: "${fb.title}" [${fb.type}|${fb.status}]\n${(fb.content||'').slice(0,300)}` : ''}
${liveContent ? `\nLIVE SITE DATA:\n${liveContent}` : ''}

QUESTION from ${roleName}: ${question}

Answer for a ${roleName}. Reference actual card names and data. No generic advice.`;
  }

  res.setHeader("Content-Type",      "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control",     "no-cache");
  res.status(200);

  try {
    const anthropic = new Anthropic();
    const stream = await anthropic.messages.stream({
      model:      "claude-sonnet-4-5",
      max_tokens: 3500,
      system:     `${roleCtx}\n\nYou have full visibility into the campaign canvas. Answer specifically for a ${roleName}. Reference actual card titles and data. Never invent information. Be direct and actionable.`,
      messages:   [{ role: "user", content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        res.write(chunk.delta.text);
      }
    }
  } catch (err: any) {
    res.write(`\n[Generation error: ${err.message}]`);
  } finally {
    res.end();
  }
}
