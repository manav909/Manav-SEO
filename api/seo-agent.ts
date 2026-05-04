import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type DeliverableType = "Technical" | "On-Page" | "Off-Page" | "GEO";

interface RequestBody {
  url: string;
  keyword: string;
  deliverableType: DeliverableType;
}

const SYSTEM_PROMPTS: Record<DeliverableType, string> = {
  Technical: `You are a Senior Technical SEO Specialist with 15 years of experience. Analyze the provided website content and deliver a comprehensive technical SEO audit. Be specific, reference actual content from the site, and provide actionable recommendations.`.trim(),

  "On-Page": `You are a Senior On-Page SEO Content Strategist. Analyze the provided website content and deliver a comprehensive on-page SEO audit. Reference actual page content, identify real gaps, and give specific actionable recommendations.`.trim(),

  "Off-Page": `You are a Senior Off-Page SEO and Digital PR Strategist. Analyze the provided website content to understand the business, then deliver a comprehensive off-page SEO and link building strategy tailored specifically to this business.`.trim(),

  GEO: `You are a Generative Engine Optimization (GEO) Specialist. Analyze the provided website content and deliver a comprehensive GEO audit covering optimization for ChatGPT, Perplexity, and Google AI Overviews. Reference actual content from the site in your findings.`.trim(),
};

async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    const jinaUrl = `https://r.jina.ai/${fullUrl}`;

    const response = await fetch(jinaUrl, {
      headers: {
        "Accept": "text/plain",
        "X-Return-Format": "markdown",
        "X-Timeout": "30",
      },
      signal: AbortSignal.timeout(35000),
    });

    if (!response.ok) {
      return `Could not fetch website. HTTP Status: ${response.status}. Please check the URL is correct and publicly accessible.`;
    }

    const text = await response.text();

    if (!text || text.trim().length < 50) {
      return `Website returned empty or very short content. The site may be blocking crawlers.`;
    }

    return text.trim().slice(0, 15000);

  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return `Website took too long to respond (30s timeout). Try again or check if the site is accessible.`;
    }
    return `Could not fetch website: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  // Safe body parsing
  let url: string;
  let keyword: string;
  let deliverableType: DeliverableType;

  try {
    url = (req.body?.url ?? "").toString().trim();
    keyword = (req.body?.keyword ?? "").toString().trim();
    deliverableType = (req.body?.deliverableType ?? "") as DeliverableType;
  } catch {
    return res.status(400).json({ error: "Could not parse request body." });
  }

  if (!url || !keyword || !deliverableType) {
    return res.status(400).json({ error: "Missing required fields: url, keyword, deliverableType." });
  }

  if (!SYSTEM_PROMPTS[deliverableType]) {
    return res.status(400).json({
      error: `Invalid deliverableType. Must be one of: ${Object.keys(SYSTEM_PROMPTS).join(", ")}.`,
    });
  }

  // Fetch real website content via Jina AI
  const websiteContent = await fetchWebsiteContent(url);

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const client = new Anthropic();

  const userMessage = `
You are analyzing a REAL website. Here is the actual content crawled live from the site:

=== LIVE WEBSITE CONTENT FROM ${url} ===
${websiteContent}
=== END OF WEBSITE CONTENT ===

Now perform a ${deliverableType} SEO analysis with the following details:
- Target URL: ${url}
- Focus Keyword: ${keyword}
- Today's Date: ${today}

Critical instructions:
- Base ALL findings strictly on the actual website content provided above
- Quote or reference specific text from the site where relevant
- Do NOT invent, assume, or hallucinate data not present in the content
- If the site content is limited, say so honestly and advise what you can from what is available
- Use today's date (${today}) for the analysis date — never write a different year
- Format using clear markdown: headings, bullet points, and tables where appropriate
- Be specific, direct, and actionable
- Write a COMPLETE report — never truncate or summarize at the end
- If running long, reduce section depth but always finish all sections
  `.trim();

  // Set streaming headers
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200);

  try {
    const anthropicStream = await client.messages.stream({
  model: "claude-sonnet-4-5",
  max_tokens: 32000,
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
        : "An unexpected error occurred while generating the report.";
    res.write(`\n\n[STREAM_ERROR]: ${message}`);
  } finally {
    res.end();
  }
}
