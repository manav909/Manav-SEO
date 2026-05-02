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

// ─────────────────────────────────────────────
// Fetches the real website content
// ─────────────────────────────────────────────
async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;

    const response = await fetch(fullUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SEOAnalyzer/1.0; +https://indiit.com)",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      return `Could not fetch website. Status: ${response.status}`;
    }

    const html = await response.text();

    // Strip HTML tags and clean up the text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")   // remove scripts
      .replace(/<style[\s\S]*?<\/style>/gi, " ")      // remove styles
      .replace(/<[^>]+>/g, " ")                        // remove all tags
      .replace(/&nbsp;/g, " ")                         // fix entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s{2,}/g, " ")                         // collapse whitespace
      .trim()
      .slice(0, 15000);                                // limit to 15k chars

    return text || "Website content could not be extracted.";
  } catch (err) {
    return `Could not fetch website: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

// ─────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────
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

  // Fetch the REAL website content first
  const websiteContent = await fetchWebsiteContent(url);

  const client = new Anthropic();

  const userMessage = `
You are analyzing a REAL website. Here is the actual content crawled from the site:

=== WEBSITE CONTENT FROM ${url} ===
${websiteContent}
=== END OF WEBSITE CONTENT ===

Based on this REAL content above, perform a ${deliverableType} SEO analysis:
- Target URL: ${url}
- Focus Keyword: ${keyword}

Important instructions:
- Base ALL your findings on the actual website content provided above
- Point out SPECIFIC issues you can see in the real content
- Quote actual text from the site where relevant
- Do NOT make up or assume data you cannot see
- Format your response using proper markdown with clear headers, bullet points and tables
- Be specific, actionable, and direct
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
