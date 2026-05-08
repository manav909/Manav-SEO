import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { question, blocks = [], projectSummary = '', focusBlockId = null } = req.body;

  const placed = (blocks as any[]).filter(b => b.status !== 'removed');

  const byWeek = [1, 2, 3, 4, 5].map(w => {
    const items = placed.filter(b => b.week === w);
    if (!items.length) return '';
    const label = w <= 4 ? `WEEK ${w}` : 'BACKLOG';
    return `${label}:\n${items.map(b =>
      `  [${b.status?.toUpperCase() || 'TODO'}] [${b.type}] ${b.title} (priority:${b.priority}) — ${b.content.slice(0, 120)}`
    ).join('\n')}`;
  }).filter(Boolean).join('\n\n');

  const focusBlock = focusBlockId ? placed.find(b => b.id === focusBlockId) : null;

  const systemPrompt = `You are an expert SEO strategist and project advisor. You have full visibility into a client's strategic plan on their canvas. Give specific, actionable answers that directly reference items on the canvas by name. Be concise but thorough. Use bullet points for lists. Avoid generic advice.`;

  const userPrompt = focusBlock
    ? `PROJECT: ${projectSummary}

CANVAS OVERVIEW:
${byWeek}

FOCUSED BLOCK — Deep Analysis Requested:
Type: ${focusBlock.type}
Title: ${focusBlock.title}
Content: ${focusBlock.content}
Priority: ${focusBlock.priority} | Effort: ${focusBlock.effort || '?'} | Impact: ${focusBlock.impact || '?'}
Source: ${focusBlock.source || 'strategy'}

Provide a deep tactical breakdown of this specific item:
1. Exact step-by-step implementation instructions
2. What success looks like (measurable outcome)
3. Dependencies — what must be done first or in parallel
4. Potential obstacles and how to handle them
5. How this connects to other items on the canvas`
    : `PROJECT: ${projectSummary}

CANVAS (${placed.length} items, ${placed.filter(b => b.status === 'done').length} done):
${byWeek}

QUESTION: ${question}

Answer specifically using the canvas items. Reference block titles and weeks directly.`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200);

  try {
    const anthropic = new Anthropic();
    const stream = await anthropic.messages.stream({
      model:      "claude-sonnet-4-5",
      max_tokens: 1200,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
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
