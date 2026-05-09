import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    week,
    weekLabel,
    weekCards = [],
    allPlacedCards = [],
    libraryCards = [],
    projectContext = {},
  } = req.body;

  if (!week || !weekCards) return res.status(400).json({ error: "Missing week or weekCards" });

  const todo  = weekCards.filter((c: any) => c.status === "todo");
  const doing = weekCards.filter((c: any) => c.status === "doing");
  const done  = weekCards.filter((c: any) => c.status === "done");

  const cardDetail = (c: any) =>
    `[${c.type?.toUpperCase()} | Priority: ${c.priority} | Effort: ${c.effort || "unknown"}]\nTitle: ${c.title}\nDetail: ${c.content}\nAssigned to: ${c.assignee || "Unassigned"}\nStatus: ${c.status}`;

  const allWeekCardDetails = weekCards.map(cardDetail).join("\n\n---\n\n");

  // What cards from library could strengthen this week
  const libSample = libraryCards.slice(0, 30).map((c: any) =>
    `[${c.type} | ${c.priority}] ${c.title} — ${c.content?.slice(0, 120)}`
  ).join("\n");

  // What other weeks contain (context only)
  const otherWeeksContext = allPlacedCards
    .filter((c: any) => c.week !== week)
    .map((c: any) => `Week ${c.week}: [${c.type}] ${c.title}`)
    .join("\n");

  const projectSummary = [
    projectContext.company ? `Company: ${projectContext.company}` : "",
    projectContext.industry ? `Industry: ${projectContext.industry}` : "",
    projectContext.url ? `Website: ${projectContext.url}` : "",
    projectContext.scores ? `Health scores: ${projectContext.scores}` : "",
  ].filter(Boolean).join(" | ");

  const prompt = `You are an expert SEO strategist creating a week-by-week campaign plan for a client. 
Your job is to write the agenda for ${weekLabel} based ONLY on the cards placed in this week.

CRITICAL RULES:
- Base every statement ONLY on the actual card content provided. Zero assumptions.
- If a card's content is vague, say so and ask for clarification rather than inventing detail.
- Write in plain English that a non-technical business owner can understand.
- Every task must have a concrete, verifiable outcome — not vague targets.
- Verification must be specific: exact tool, exact metric, exact number to look for.
- For missing cards: only suggest if there is a clear gap backed by what IS in the week.
- This is serious client-facing work. No filler, no padding, no generic SEO advice.

PROJECT: ${projectSummary || "Not provided"}

═══════════════════════════════════════════
CARDS IN ${weekLabel.toUpperCase()} (${weekCards.length} total)
═══════════════════════════════════════════

${weekCards.length === 0 ? "No cards placed in this week yet." : allWeekCardDetails}

STATUS BREAKDOWN:
- To Do: ${todo.length} cards (${todo.map((c: any) => `"${c.title}"`).join(", ") || "none"})
- In Progress: ${doing.length} cards (${doing.map((c: any) => `"${c.title}"`).join(", ") || "none"})
- Done: ${done.length} cards (${done.map((c: any) => `"${c.title}"`).join(", ") || "none"})

OTHER WEEKS CONTEXT (do not repeat — just for sequencing logic):
${otherWeeksContext || "No other weeks planned yet"}

AVAILABLE UNPLACED CARDS (for gap suggestions only):
${libSample || "Library is empty"}

═══════════════════════════════════════════

Write the agenda in this exact structure using markdown:

## ${weekLabel} — What's Happening This Week

[2-3 sentences. What this week collectively achieves based only on the cards. No fluff.]

---

## What Each Task Means For Your Business

[For every card in this week, one section each:]

### [Card Title]
**What we're doing:** [1-2 sentences in plain English — what action is being taken]
**Why this matters:** [Direct business reason based on card content — no generic SEO claims]
**Assigned to:** [Name or "Unassigned — assign this before starting"]
**Status:** [To Do / In Progress / Done]
${doing.length > 0 ? "**Current progress note:** [What should be happening right now if in progress]" : ""}
${done.length > 0 ? "**✓ Completed. How to verify it worked:**\n- [Specific check 1: exact tool + what to look for + what number means success]\n- [Specific check 2]\n- [If not yet verifiable: when it will be verifiable]" : ""}

---

## What You Should See By End of This Week

[List only concrete, measurable outcomes. If a metric cannot be measured within the week, say when it CAN be measured and what the leading indicator is this week. Do not promise outcomes you cannot support from the card content.]

---

## How to Verify This Week's Work Is Done Correctly

[A step-by-step verification checklist your client or account manager can run. Each step must name a specific tool (Google Search Console, Ahrefs, Semrush, Screaming Frog, browser DevTools, Perplexity, etc.) and exactly what to look for.]

| Check | Tool | What to Look For | Pass Condition |
|-------|------|-----------------|----------------|
[Fill based only on actual card content]

---

## Status Report: Where Things Stand

${done.length > 0 ? `**Completed (${done.length}):** [Summary of what's been done and immediate observable result]` : ""}
${doing.length > 0 ? `**In Progress (${doing.length}):** [What is actively being worked on and expected completion signal]` : ""}
${todo.length > 0 ? `**Not Started (${todo.length}):** [What hasn't begun — flag any that are blocking others]` : ""}

${weekCards.length === 0 ? "" : `---

## Gaps & Suggestions

[ONLY include this section if there are clear gaps based on what IS in this week. For each suggestion:]
- **Missing:** [What type of card is absent]
- **Why it matters here:** [Specific reason tied to the existing cards in this week]
- **Impact if added:** [What metric or outcome would improve — cite the gap from the existing cards]
- **Suggested card:** [Name of unplaced card from library, if one exists]

If no gaps exist, write: "This week's plan is complete based on available cards."

---

## What to Report When This Week Is Complete

[Specific report format for handover or client review:]
- What data to pull (exact report from exact tool)
- What comparison to make (vs last week / vs baseline)
- What the acceptable outcome range is (based only on card content)
- Red flags to escalate immediately`}`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200);

  try {
    const anthropic = new Anthropic();
    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system: "You are an elite SEO campaign manager writing precise, fact-based weekly agendas for business clients. You never invent data, never use generic SEO clichés, and always tie every statement to the specific task cards provided. Your writing is direct, jargon-free, and immediately actionable.",
      messages: [{ role: "user", content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        res.write(chunk.delta.text);
      }
    }
  } catch (err: any) {
    res.write(`\n\n[ERROR]: ${err.message}`);
  } finally {
    res.end();
  }
}
