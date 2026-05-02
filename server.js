import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

// Load environment variables
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// SYSTEM PROMPTS — paste your heavy prompts here
// ─────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  Technical: `
    You are a Senior Technical SEO Specialist.
    <!-- ✏️  PASTE YOUR TECHNICAL SEO SYSTEM PROMPT HERE -->
  `.trim(),

  "On-Page": `
    You are a Senior On-Page SEO Content Strategist.
    <!-- ✏️  PASTE YOUR ON-PAGE SEO SYSTEM PROMPT HERE -->
  `.trim(),

  "Off-Page": `
    You are a Senior Off-Page SEO & Link Building Strategist.
    <!-- ✏️  PASTE YOUR OFF-PAGE SEO SYSTEM PROMPT HERE -->
  `.trim(),

  GEO: `
    You are a Generative Engine Optimization (GEO) Specialist.
    <!-- ✏️  PASTE YOUR GEO SYSTEM PROMPT HERE -->
  `.trim(),
};

// ─────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────

app.post('/api/seo-agent', async (req, res) => {
  // 1. Parse & validate the request body
  const body = req.body;

  const { url, keyword, deliverableType } = body;

  if (!url || !keyword || !deliverableType) {
    return res.status(400).json({ error: "Missing required fields: url, keyword, deliverableType." });
  }

  if (!SYSTEM_PROMPTS[deliverableType]) {
    return res.status(400).json({
      error: `Invalid deliverableType. Must be one of: ${Object.keys(SYSTEM_PROMPTS).join(", ")}.`,
    });
  }

  // 2. Initialise the Anthropic client
  //    It auto-reads process.env.ANTHROPIC_API_KEY — no need to pass it explicitly
  const client = new Anthropic();

  // 3. Build the user message
  const userMessage = `
    Please perform a ${deliverableType} SEO analysis for the following:

    - Target URL: ${url}
    - Focus Keyword: ${keyword}

    Provide a comprehensive, actionable report based on your specialisation.
  `.trim();

  // 4. Set headers for streaming
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache');

  try {
    const anthropicStream = await client.messages.stream({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 8096,
      system: SYSTEM_PROMPTS[deliverableType],
      messages: [{ role: "user", content: userMessage }],
    });

    // Forward each text delta to the client
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

    // Send error as a final chunk
    res.write(`\n\n[STREAM_ERROR]: ${message}`);
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});