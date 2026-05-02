import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type DeliverableType = "Technical" | "On-Page" | "Off-Page" | "GEO";

interface RequestBody {
  url: string;
  keyword: string;
  deliverableType: DeliverableType;
}

const SYSTEM_PROMPTS: Record<DeliverableType, string> = {
  Technical: `
    You are a Senior Technical SEO Specialist.
    PASTE YOUR TECHNICAL SEO SYSTEM PROMPT HERE
  `.trim(),

  "On-Page": `
    You are a Senior On-Page SEO Content Strategist.
    PASTE YOUR ON-PAGE SEO SYSTEM PROMPT HERE
  `.trim(),

  "Off-Page": `
    You are a Senior Off-Page SEO & Link Building Strategist.
    PASTE YOUR OFF-PAGE SEO SYSTEM PROMPT HERE
  `.trim(),

  GEO: `
    You are a Generative Engine Optimization (GEO) Specialist.
    PASTE YOUR GEO SYSTEM PROMPT HERE
  `.trim(),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { url, keyword, deliverableType } = req.body as RequestBody;

  if (!url || !keyword || !deliverableType) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  if (!SYSTEM_PROMPTS[deliverableType]) {
    return res.status(400).json({ error: "Invalid deliverableType." });
  }

  const client = new Anthropic();

  const userMessage = `
    Please perform a ${deliverableType} SEO analysis for the following:
    - Target URL: ${url}
    - Focus Keyword: ${keyword}
    Provide a comprehensive, actionable report.
  `.trim();

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200);

  try {
    const anthropicStream = await client.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 8096,
      system: SYSTEM_PROMPTS[deliverableType],
      messages: [{ role: "user", content: userMessage }],
    });

    for await (const chunk of anthropicStream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        res.write(chunk.delta.text);
      }
    }
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `Anthropic API error ${err.status}: ${err.message}`
        : "An unexpected error occurred.";
    res.write(`\n\n[STREAM_ERROR]: ${message}`);
  } finally {
    res.end();
  }
}
