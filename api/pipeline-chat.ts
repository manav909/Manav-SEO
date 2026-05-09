import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

const ROLE_CONTEXTS: Record<string, string> = {
  content_writer: `You are advising a Content Writer working on an SEO campaign. They need practical, actionable guidance on what to write, how to write it, structure, keywords to target, and how their content fits into the broader strategy. Focus on: content briefs, word counts, heading structures, internal linking, tone of voice, and what success looks like for each piece. Never talk about technical SEO unless it directly affects their writing task.`,

  team_lead: `You are advising a Team Lead who oversees the campaign execution. They need to know: who is blocked, what dependencies are at risk, how to prioritise this week's work, how to escalate issues, and how to keep the team on track. Be direct about risks. Flag anything that could delay delivery. Give them the information they need to run a tight standup.`,

  executive: `You are advising a C-level Executive or Business Owner. They want business outcomes, not technical detail. Translate all SEO activity into: revenue impact, competitive position, brand visibility, and ROI. Use plain English. No jargon. Give them the 3 things they need to know and the 1 decision they need to make. If progress is on track, say so clearly. If not, say why and what it costs.`,

  senior_seo: `You are advising a Senior SEO Strategist. They want strategic depth: algorithm signals, competitive gap analysis, topical authority planning, E-E-A-T implications, GEO/AI citation strategy, and long-term compounding effects. Be technically precise. Reference specific search signals, ranking factors, and industry patterns. They can handle complexity — give them the full picture.`,

  project_manager: `You are advising a Project Manager responsible for delivery. They need: clear timelines, dependency maps, risk register items, resource allocation, and milestone tracking. Flag anything off-track immediately. Give them the information needed to update a project plan and report to stakeholders. Format answers as status / risk / action where possible.`,

  biz_dev: `You are advising a Business Development Manager who handles client relationships and growth. They need: how to present progress to clients in compelling terms, how to handle objections ("I'm not seeing results yet"), how to identify upsell opportunities from the current campaign data, talking points for renewals, and how to position the agency's value. Make everything client-facing and commercial. No internal jargon.`,
};

const ROLE_LABELS: Record<string, string> = {
  content_writer: "Content Writer",
  team_lead:      "Team Lead",
  executive:      "Executive",
  senior_seo:     "Senior SEO",
  project_manager:"Project Manager",
  biz_dev:        "Business Dev Manager",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    question,
    role = "team_lead",
    blocks = [],
    projectSummary = "",
    focusBlockId = null,
    checkUrl = null,
    mode = "chat", // chat | pipeline | dependencies
  } = req.body;

  const placed   = (blocks as any[]).filter(b => b.placed);
  const library  = (blocks as any[]).filter(b => !b.placed);
  const roleCtx  = ROLE_CONTEXTS[role] || ROLE_CONTEXTS.team_lead;
  const roleName = ROLE_LABELS[role]  || "Team Lead";

  /* ── Build canvas context ── */
  const weeks = [1,2,3,4,5];
  const byWeek = weeks.map(w => {
    const wBlocks = placed.filter(b => b.week === w);
    if (!wBlocks.length) return '';
    const label = w === 5 ? 'BACKLOG' : `WEEK ${w}`;
    return `${label} (${wBlocks.length} tasks):
${wBlocks.map(b =>
  `  [${b.type.toUpperCase()}] [${b.status.toUpperCase()}] [${b.priority} priority] "${b.title}"
   Detail: ${(b.content||'').slice(0,200)}
   Assigned: ${b.assignee || 'Unassigned'}
   Effort: ${b.effort || 'unknown'} | Impact: ${b.impact || 'unknown'}`
).join('\n')}`;
  }).filter(Boolean).join('\n\n');

  const librarySnippet = library.slice(0, 20)
    .map(b => `  [${b.type}|${b.priority}] "${b.title}"`)
    .join('\n');

  /* ── Fetch live website content if requested ── */
  let liveContent = '';
  if (checkUrl) {
    try {
      const resp = await fetch(`https://r.jina.ai/${checkUrl}`, {
        headers: { "Accept": "text/plain", "X-Return-Format": "markdown", "X-Timeout": "20" },
        signal: AbortSignal.timeout(25000),
      });
      if (resp.ok) {
        const text = await resp.text();
        liveContent = text.slice(0, 4000);
      }
    } catch {
      liveContent = '(Could not fetch URL — answer based on available data)';
    }
  }

  /* ── Build prompt based on mode ── */
  let systemPrompt = `${roleCtx}

You have full visibility into the campaign canvas, all task cards, their statuses, assignments, and project data.
Answer specifically for a ${roleName} — not generically. Reference actual card titles, weeks, and data.
Never invent data. If something is unknown, say so and ask for clarification.
Be direct. No padding. No generic SEO advice that isn't backed by the actual canvas data.`;

  let userPrompt = '';

  if (mode === 'pipeline') {
    userPrompt = `Analyse the complete campaign canvas and produce a full execution pipeline for a ${roleName}.

PROJECT: ${projectSummary}

CANVAS:
${byWeek || 'No cards placed yet'}

UNPLACED LIBRARY (${library.length} cards remaining):
${librarySnippet || 'Empty'}
${liveContent ? `\nLIVE WEBSITE CONTENT:\n${liveContent}` : ''}

Produce a comprehensive pipeline analysis covering:

## Execution Pipeline — Complete Campaign Overview

### Critical Path
[The single sequence of tasks that must not be delayed — explain why each one blocks the next]

### Dependencies Map
For every task that has a prerequisite, list it as:
**"[Task Title]"** depends on **"[Prerequisite Title]"**
- Why: [specific technical/strategic reason]
- If delayed: [exact consequence for downstream tasks]
- How to unblock: [specific action]

### Week-by-Week Execution Sequence
For each week with cards, what must happen in what order, why, and who is responsible.

### Risk Register
| Risk | Likelihood | Impact | Owner | Mitigation |
|------|-----------|--------|-------|-----------|
[Only real risks based on the actual cards and their dependencies]

### Capacity Check
For each person assigned work, is their load realistic this week? Flag overallocation.

### What Needs to Happen Before Work Starts
Checklist of prerequisites that must be in place before the first card in Week 1 can begin.

### Missing Cards That Would Strengthen the Pipeline
[Only if there are clear gaps backed by the existing cards — with specific impact if not addressed]`;

  } else if (mode === 'dependencies') {
    const focusBlock = focusBlockId ? placed.find((b:any) => b.id === focusBlockId) : null;

    userPrompt = `Analyse the dependencies for ${focusBlock ? `"${focusBlock.title}"` : 'all content and technical tasks'} in this campaign.

PROJECT: ${projectSummary}

CANVAS:
${byWeek || 'No cards placed yet'}
${liveContent ? `\nLIVE WEBSITE CONTENT:\n${liveContent}` : ''}

For ${focusBlock ? 'this specific task' : 'every content and technical task'}:

## Dependency Analysis

${focusBlock ? `### Task: "${focusBlock.title}"
Type: ${focusBlock.type} | Status: ${focusBlock.status} | Week: ${focusBlock.week === 5 ? 'Backlog' : `Week ${focusBlock.week}`}
${focusBlock.content}

` : ''}
### What Must Be Done First (Blockers)
[List every task that must be complete before this can start — with specific reason]

### What This Task Enables (Dependents)
[List every task that cannot start until this is done]

### Technical Prerequisites
[Specific technical conditions that must be true — e.g. "sitemap must be submitted", "schema markup must be live"]

### Content Prerequisites  
[What information, access, or approvals must be in place before writing can begin]

### How to Verify Prerequisites Are Met
[Specific checks — not generic advice]

### If This Is Delayed By 1 Week
[Exact cascade effect on other tasks and overall campaign timeline]

### Parallel Work Possible
[What CAN be done in parallel safely, and what cannot be parallelised]`;

  } else {
    // Standard role-based chat
    const focusBlock = focusBlockId ? placed.find((b:any) => b.id === focusBlockId) : null;
    userPrompt = `PROJECT: ${projectSummary}

CANVAS:
${byWeek || 'No cards placed yet — advise based on what you know'}
${focusBlock ? `\nFOCUSED TASK:\n"${focusBlock.title}"\nType: ${focusBlock.type} | Status: ${focusBlock.status}\n${focusBlock.content}` : ''}
${liveContent ? `\nLIVE WEBSITE DATA:\n${liveContent}` : ''}

QUESTION from ${roleName}: ${question}

Answer specifically for a ${roleName}. Reference actual card names and data. No generic advice.`;
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200);

  try {
    const anthropic = new Anthropic();
    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        res.write(chunk.delta.text);
      }
    }
  } catch (err: any) {
    res.write(`\n[Error: ${err.message}]`);
  } finally {
    res.end();
  }
}
