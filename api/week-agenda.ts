import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { saveToCache, hashInput } from "./ai-cache";

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { week, weekLabel, weekCards = [], allPlacedCards = [], libraryCards = [], projectContext = {}, projectId } = req.body;

  if (!week || !weekCards) return res.status(400).json({ error: "Missing week or weekCards" });

  const todo  = weekCards.filter((c: any) => c.status === "todo");
  const doing = weekCards.filter((c: any) => c.status === "doing");
  const done  = weekCards.filter((c: any) => c.status === "done");

  const cardDetail = (c: any) =>
    `[${(c.type||'').toUpperCase()} | Priority:${c.priority} | Effort:${c.effort||'?'}]\nTitle: ${c.title}\nDetail: ${(c.content||'').slice(0,300)}\nAssigned: ${c.assignee||'Unassigned'}\nStatus: ${c.status}`;

  const allDetails      = weekCards.map(cardDetail).join("\n\n---\n\n");
  const otherContext    = allPlacedCards.filter((c: any) => c.week !== week).map((c: any) => `Week ${c.week}: [${c.type}] ${c.title}`).join("\n");
  const libSample       = libraryCards.slice(0, 20).map((c: any) => `[${c.type}|${c.priority}] ${c.title}`).join("\n");
  const projectSummary  = [projectContext.company, projectContext.industry, projectContext.url, projectContext.scores].filter(Boolean).join(" | ");

  const inputHash = hashInput({ week, weekCards: weekCards.map((c: any) => c.id + c.status + c.assignee) });

  const prompt = `You are an expert SEO campaign manager. Write the ${weekLabel} agenda based ONLY on the cards provided.

CRITICAL: Zero assumptions. Base every statement on actual card content. If card content is vague, say so.
Write in plain English for a non-technical business owner.
Every outcome must be measurable and verifiable with a specific tool.

PROJECT: ${projectSummary||'Not provided'}

═══════════════════════════════════════════
CARDS IN ${weekLabel.toUpperCase()} (${weekCards.length} total)
═══════════════════════════════════════════

${weekCards.length === 0 ? "No cards placed in this week yet." : allDetails}

STATUS: To Do: ${todo.length} | In Progress: ${doing.length} | Done: ${done.length}

OTHER WEEKS (context only): ${otherContext||'None planned yet'}

AVAILABLE LIBRARY CARDS (for gap suggestions only):
${libSample||'None'}

═══════════════════════════════════════════

Write the agenda using this structure:

## ${weekLabel} — What Is Happening This Week

[2-3 sentences. What this week collectively achieves based ONLY on the cards. No filler.]

---

## What Each Task Means For Your Business

[For every single card in this week:]

### [Card Title]
**What we are doing:** [1-2 plain English sentences — exact action being taken]
**Why this matters:** [Direct business reason from card content — no generic claims]
**Assigned to:** [Name or "⚠ Unassigned — assign before starting"]
**Status:** ${doing.length > 0 ? "In Progress — **Current progress note:** [What should be happening right now]" : "To Do|Done"}
${done.length > 0 ? `**How to verify it worked:**
- Check 1: [Exact tool + what to look for + what number means success]
- Check 2: [Another specific check]` : ""}

---

## What You Should See By End of This Week

[Only concrete, measurable outcomes. If a metric cannot move within 1 week, state the leading indicator instead and when the full result will show.]

---

## Verification Checklist

| Task | Tool | What to Check | Pass Condition |
|------|------|--------------|----------------|
[One row per card — specific tool, specific metric, specific pass/fail condition]

---

## Where Things Stand

${done.length > 0 ? `**Completed (${done.length}):** [What was done and first observable result]` : ""}
${doing.length > 0 ? `**In Progress (${doing.length}):** [What is being worked on and what signals completion]` : ""}
${todo.length > 0 ? `**Not Started (${todo.length}):** [What has not begun — flag any blocking others]` : ""}

---

## Gaps and Suggestions

[Only include if there is a clear gap backed by existing cards. For each:]
- **Missing:** [Type of card absent]
- **Why it matters here:** [Tied to existing cards]
- **Impact if not added:** [Specific metric or outcome]
- **Suggested card from library:** [Name if it exists in library above]

If no gaps: write "This week is complete based on the placed cards."

---

## End-of-Week Report

What to pull and compare to close out this week formally:
- Data source: [Exact report from exact tool]
- Compare to: [Baseline or previous week]
- Acceptable range: [Based only on card content — no invented targets]
- Red flags to escalate: [Specific conditions that mean something went wrong]`;

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
      system:     "You are an elite SEO campaign manager writing precise, fact-based weekly agendas. Never invent data. Every verification step must name a specific tool and a specific metric.",
      messages:   [{ role: "user", content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        accumulated += chunk.delta.text;
        res.write(chunk.delta.text);
        // Save partial every ~500 chars so we never lose work
        if (accumulated.length % 500 < 10 && projectId) {
          saveToCache(projectId, `agenda_${week}`, accumulated, "partial", inputHash);
        }
      }
    }
  } catch (err: any) {
    res.write(`\n\n[Generation error: ${err.message}]`);
  } finally {
    // Save complete version
    if (projectId && accumulated.length > 100) {
      await saveToCache(projectId, `agenda_${week}`, accumulated, "complete", inputHash);
    }
    res.end();
  }
}
