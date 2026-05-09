import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    week, weekLabel,
    weekCards = [],
    allPlacedCards = [],
    libraryCards = [],
    projectContext = {},
  } = req.body;

  if (!week || !weekCards) return res.status(400).json({ error: "Missing week or weekCards" });

  const todo  = (weekCards as any[]).filter(c => c.status === "todo");
  const doing = (weekCards as any[]).filter(c => c.status === "doing");
  const done  = (weekCards as any[]).filter(c => c.status === "done");

  const cardDetail = (c: any) =>
    `[${(c.type||'').toUpperCase()} | Priority:${c.priority} | Effort:${c.effort||'?'}]
Title: ${c.title}
Detail: ${(c.content||'').slice(0,250)}
Assigned to: ${c.assignee||'Unassigned'}
Status: ${c.status}`;

  const allDetails = (weekCards as any[]).map(cardDetail).join("\n\n---\n\n");
  const otherCtx   = (allPlacedCards as any[])
    .filter(c => c.week !== week)
    .slice(0, 20)
    .map(c => `Week ${c.week}: [${c.type}] ${c.title}`)
    .join("\n");
  const libSample  = (libraryCards as any[])
    .slice(0, 15)
    .map(c => `[${c.type}|${c.priority}] ${c.title}`)
    .join("\n");

  const proj = [projectContext.company, projectContext.industry, projectContext.url]
    .filter(Boolean).join(" | ");

  const prompt = `You are an expert SEO campaign manager writing a ${weekLabel} agenda.

RULES:
- Base every statement ONLY on the actual card content below. Zero assumptions.
- If a card's content is vague, say so and ask for clarification.
- Write in plain English for a non-technical business owner.
- Every outcome must be verifiable with a specific tool and specific metric.
- This is serious client-facing work. No filler.

PROJECT: ${proj || 'Not provided'}

CARDS IN ${(weekLabel||'').toUpperCase()} (${(weekCards as any[]).length} cards):
${(weekCards as any[]).length === 0 ? 'No cards placed here yet.' : allDetails}

STATUS: To Do: ${todo.length} | In Progress: ${doing.length} | Done: ${done.length}

OTHER WEEKS (context): ${otherCtx || 'None planned yet'}
LIBRARY (gap suggestions only): ${libSample || 'Empty'}

Write the agenda:

## ${weekLabel} — What Is Happening

[2-3 sentences based ONLY on the cards. What this week collectively achieves.]

---

## What Each Task Means For Your Business

${(weekCards as any[]).map((c: any) => `### ${c.title}
**What we are doing:** [plain English — exact action from card content]
**Why it matters:** [direct business reason from card — no generic claims]
**Assigned to:** ${c.assignee || '⚠ Unassigned — assign before starting'}
**Status:** ${c.status === 'done' ? 'Done ✓' : c.status === 'doing' ? 'In Progress' : 'To Do'}
${c.status === 'done' ? `**Verify it worked:**
- Check: [specific tool + what to look for + pass condition]` : ''}
${c.status === 'doing' ? '**Currently:** [what should actively be happening right now]' : ''}`).join('\n\n')}

---

## What You Should See By End of This Week

[Concrete measurable outcomes only. If a metric cannot move within 1 week, state the leading indicator instead.]

---

## Verification Checklist

| Task | Tool | What to Check | Pass Condition |
|---|---|---|---|
${(weekCards as any[]).map((c: any) => `| ${c.title.slice(0,30)} | [specific tool] | [specific metric] | [pass/fail condition] |`).join('\n')}

---

## Where Things Stand

${done.length  > 0 ? `**Done (${done.length}):** ${done.map((c: any) => c.title).join(', ')} — [observable result]` : ''}
${doing.length > 0 ? `**In Progress (${doing.length}):** ${doing.map((c: any) => c.title).join(', ')} — [completion signal]` : ''}
${todo.length  > 0 ? `**Not Started (${todo.length}):** ${todo.map((c: any) => c.title).join(', ')}${todo.some((c: any) => !c.assignee) ? ' — ⚠ Some unassigned' : ''}` : ''}

---

## Gaps and Suggestions

${(weekCards as any[]).length === 0 ? '[No cards placed — drag cards from the library first]' : '[Only include if a clear gap exists backed by existing cards. If none: write "Week plan is complete based on placed cards."]'}

---

## End-of-Week Report

- Data to pull: [exact report from exact tool]
- Compare to: [baseline or last week]
- Acceptable range: [based on card content only]
- Red flags: [specific conditions that mean something went wrong]`;

  res.setHeader("Content-Type",      "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control",     "no-cache");
  res.status(200);

  try {
    const anthropic = new Anthropic();
    const stream = await anthropic.messages.stream({
      model:      "claude-sonnet-4-5",
      max_tokens: 3500,
      system:     "You are an elite SEO campaign manager. Write precise, fact-based weekly agendas. Never invent data. Every verification step must name a specific tool and metric.",
      messages:   [{ role: "user", content: prompt }],
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
