import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { saveToCache, hashInput } from "./ai-cache";

export const config = { maxDuration: 120 };

const ROLE_CONTEXTS: Record<string, string> = {
  content_writer: `You are advising a Content Writer on an SEO campaign. Focus on: what to write, structure, keywords, internal linking, tone, GEO readiness, and deadlines. Never mention technical SEO unless it directly affects their writing task. Be specific about the actual content tasks on the canvas.`,
  team_lead:      `You are advising a Team Lead who runs the campaign. They need: who is blocked, exact blockers, what to escalate, capacity status, and today's standup focus. Be direct about risks. Reference actual card titles and assignees.`,
  executive:      `You are advising an Executive. Translate everything to business outcomes: revenue, competitive position, brand visibility, ROI. Plain English. No jargon. Give them 3 things to know and 1 decision to make. Reference actual progress numbers from the canvas.`,
  senior_seo:     `You are advising a Senior SEO Strategist. They want technical depth: algorithm signals, topical authority, E-E-A-T signals, GEO/AI citation strategy, competitive gaps. Reference specific search signals and ranking factors tied to the actual cards.`,
  project_manager:`You are advising a Project Manager responsible for delivery. Format: Status / Risk / Action. Give them milestone status, risk register items, resource gaps, dependency blockers. Everything must be actionable.`,
  biz_dev:        `You are advising a Business Development Manager handling client relationships. They need: how to present results compellingly, objection handling scripts, upsell angles from campaign data, renewal talking points, proof points for the next client meeting. Make everything commercial and client-facing.`,
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

  const { question, role = "team_lead", blocks = [], projectSummary = "", focusBlockId = null, checkUrl = null, mode = "chat", projectId } = req.body;

  const placed  = (blocks as any[]).filter(b => b.placed);
  const library = (blocks as any[]).filter(b => !b.placed);

  const byWeek = [1,2,3,4,5].map(w => {
    const wb = placed.filter(b => b.week === w);
    if (!wb.length) return '';
    return `${w === 5 ? 'BACKLOG' : `WEEK ${w}`} (${wb.length} tasks):\n${wb.map(b =>
      `  [${(b.type||'').toUpperCase()}|${b.status}|${b.priority}] "${b.title}" → ${b.assignee||'Unassigned'}\n   ${(b.content||'').slice(0,150)}`
    ).join('\n')}`;
  }).filter(Boolean).join('\n\n');

  const libSnippet = library.slice(0,15).map(b => `  [${b.type}|${b.priority}] "${b.title}"`).join('\n');

  let liveContent = '';
  if (checkUrl) {
    try {
      const r = await fetch(`https://r.jina.ai/${checkUrl}`, {
        headers: { "Accept": "text/plain", "X-Return-Format": "markdown", "X-Timeout": "20" },
        signal:  AbortSignal.timeout(25000),
      });
      if (r.ok) liveContent = (await r.text()).slice(0, 3000);
    } catch { liveContent = '(Could not fetch URL)'; }
  }

  const roleCtx  = ROLE_CONTEXTS[role]  || ROLE_CONTEXTS.team_lead;
  const roleName = ROLE_LABELS[role]    || "Team Lead";

  const cacheKey = mode === 'pipeline'     ? 'pipeline'
                 : mode === 'dependencies' ? `deps_${focusBlockId||'all'}`
                 : null; // chat is not cached (conversational)

  const inputHash = cacheKey ? hashInput({ placed: placed.map(b => b.id+b.status), mode, focusBlockId }) : undefined;

  let prompt = '';

  if (mode === 'pipeline') {
    prompt = `${roleCtx}

PROJECT: ${projectSummary}

CANVAS:
${byWeek || 'No cards placed yet'}

LIBRARY (unplaced, ${library.length} cards):
${libSnippet || 'Empty'}
${liveContent ? `\nLIVE SITE DATA:\n${liveContent}` : ''}

Produce a complete execution pipeline for a ${roleName}. Be specific — reference actual card titles, weeks, assignees.

## Execution Pipeline

### Critical Path
[The exact sequence that must not slip — card title → card title → card title. Explain WHY each blocks the next.]

### Dependency Map
For each task with prerequisites:
**"[Card]"** depends on **"[Prerequisite]"**
- Technical reason: [specific]
- If delayed by 1 week: [exact cascade effect]
- How to unblock immediately: [specific action]

### Week-by-Week Sequence
For each occupied week: what to do in what order and why that order matters.

### Risk Register
| Risk | Likelihood | Impact | Owner | Mitigation |
|---|---|---|---|---|
[Real risks only from actual cards]

### Capacity Check
Is each assignee's workload realistic? Flag overallocation with names.

### Prerequisites Checklist
What must be true BEFORE Week 1 work starts:
- [ ] [specific prerequisite]

### Missing Cards That Would Strengthen the Plan
[Only if clear gap exists in the placed cards — with specific impact]`;

  } else if (mode === 'dependencies') {
    const fb = focusBlockId ? placed.find((b:any) => b.id === focusBlockId) : null;
    prompt = `${roleCtx}

PROJECT: ${projectSummary}

CANVAS:
${byWeek || 'No cards placed yet'}
${liveContent ? `\nLIVE SITE DATA:\n${liveContent}` : ''}

Analyse dependencies for ${fb ? `the task: "${fb.title}" (${fb.type} | ${fb.status} | Week ${fb.week === 5 ? 'Backlog' : fb.week})` : 'ALL tasks'}.
${fb ? `\nTask detail: ${(fb.content||'').slice(0,400)}` : ''}

## Dependency Analysis ${fb ? `for "${fb.title}"` : '— All Tasks'}

### What Must Be Done First (Blockers)
[Every task/condition that must be complete before this can start. Include technical and content prerequisites separately.]

### Technical Prerequisites
[Specific technical states that must be true — e.g. "sitemap submitted", "schema deployed", "redirect fixed"]

### Content Prerequisites  
[What information, access, sign-offs, or source material must exist]

### What This Enables (Downstream)
[Tasks that cannot start until this is complete — with specific reason]

### Can Run in Parallel With
[What can safely happen simultaneously — and what CANNOT be parallelised and why]

### If Delayed by 1 Week
[Exact cascade: which tasks slip, by how long, total impact on timeline]

### Verification That Prerequisites Are Met
[Specific checks before starting — not generic advice]`;

  } else {
    const fb = focusBlockId ? placed.find((b:any) => b.id === focusBlockId) : null;
    prompt = `PROJECT: ${projectSummary}

CANVAS:
${byWeek || 'No cards placed yet'}
${fb ? `\nFOCUSED TASK:\n"${fb.title}" [${fb.type}|${fb.status}]\n${(fb.content||'').slice(0,300)}` : ''}
${liveContent ? `\nLIVE SITE DATA:\n${liveContent}` : ''}

QUESTION from ${roleName}: ${question}

Answer specifically for a ${roleName}. Reference actual card titles and data from the canvas. No generic advice.`;
  }

  res.setHeader("Content-Type",      "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control",     "no-cache");
  res.status(200);

  let accumulated = "";

  try {
    const anthropic = new Anthropic();
    const stream = await anthropic.messages.stream({
      model:      "claude-sonnet-4-5",
      max_tokens: 4000,
      system:     `${roleCtx}\n\nYou have full visibility into the campaign canvas. Answer specifically for a ${roleName}. Reference actual card titles and data. Never invent information.`,
      messages:   [{ role: "user", content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        accumulated += chunk.delta.text;
        res.write(chunk.delta.text);
        if (cacheKey && projectId && accumulated.length % 500 < 10) {
          saveToCache(projectId, cacheKey, accumulated, "partial", inputHash);
        }
      }
    }
  } catch (err: any) {
    res.write(`\n[Error: ${err.message}]`);
  } finally {
    if (cacheKey && projectId && accumulated.length > 100) {
      await saveToCache(projectId, cacheKey, accumulated, "complete", inputHash);
    }
    res.end();
  }
}
