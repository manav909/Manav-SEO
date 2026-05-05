import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

async function crawl(url: string): Promise<string> {
  try {
    const full = url.startsWith('http') ? url : `https://${url}`;
    const res = await fetch(`https://r.jina.ai/${full}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown', 'X-Timeout': '25' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return `Could not crawl ${url}`;
    const text = await res.text();
    return text.trim().slice(0, 8000);
  } catch {
    return `Could not crawl ${url}`;
  }
}

async function checkIndexing(url: string): Promise<string> {
  try {
    const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const searchUrl = `https://www.google.com/search?q=site:${domain}&num=10`;
    const res = await fetch(`https://r.jina.ai/${searchUrl}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return 'Could not check indexing';
    const text = await res.text();
    return text.slice(0, 3000);
  } catch {
    return 'Could not check indexing';
  }
}

async function checkLLMVisibility(brandName: string, keyword: string): Promise<string> {
  try {
    const query = `${keyword} ${brandName}`;
    const perplexityUrl = `https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(`https://r.jina.ai/${perplexityUrl}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return 'Could not check LLM visibility';
    const text = await res.text();
    return text.slice(0, 3000);
  } catch {
    return 'Could not check LLM visibility';
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, competitors = [], keywords = [], brand_name = '' } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const brandForSearch = brand_name || domain.split('.')[0];
  const primaryKeyword = keywords[0] || domain.split('.')[0];

  // Crawl everything in parallel
  const crawlPromises = [
    crawl(url),
    checkIndexing(url),
    checkLLMVisibility(brandForSearch, primaryKeyword),
    ...competitors.slice(0, 3).map((c: string) => crawl(c)),
  ];

  const results = await Promise.all(crawlPromises);
  const [siteContent, indexingData, llmData, ...competitorContents] = results;

  const competitorSections = competitors.slice(0, 3).map((c: string, i: number) => `
=== COMPETITOR ${i + 1}: ${c} ===
${competitorContents[i]}
`).join('\n');

  const client = new Anthropic();

  const prompt = `
You are an expert SEO and GEO analyst. Analyze the real crawled content below and return ONLY a JSON object with verified scores and insights. Base every score strictly on what you can observe in the content. Never fabricate data.

=== MAIN WEBSITE: ${url} ===
${siteContent}

=== GOOGLE INDEXING DATA ===
${indexingData}

=== LLM VISIBILITY CHECK (Perplexity search results) ===
${llmData}

${competitorSections ? `=== COMPETITOR ANALYSIS ===\n${competitorSections}` : ''}

Based strictly on the above real content, return this exact JSON:

{
  "llm_visibility_score": <0-100: how well optimised this site is to be cited by AI engines, based on content structure, FAQ presence, factual density, entity clarity>,
  "chatgpt_citations": <estimate 0-20: based on how citable this content is for ChatGPT - if you see the brand mentioned in LLM results, score higher>,
  "perplexity_citations": <estimate 0-20: based on perplexity search results above - if brand appears, score higher>,
  "google_ai_citations": <estimate 0-20: based on featured snippet readiness of the content>,
  "llm_platforms": <array of strings: which AI platforms this content is likely visible on based on structure>,
  "algorithm_health_score": <0-100: how well the site follows Google's Helpful Content, E-E-A-T, and spam guidelines based on real content>,
  "eeat_score": <0-100: score for Experience, Expertise, Authoritativeness, Trustworthiness based on actual content signals found>,
  "content_authority_score": <0-100: based on content depth, specificity, citations, expertise signals found in the crawled text>,
  "pages_indexed": <integer: estimate based on indexing data above, look for number of search results shown>,
  "pages_submitted": <integer: estimate slightly higher than indexed as a realistic sitemap estimate>,
  "brand_mentions": <integer: count of brand name appearances across the crawled content and LLM data>,
  "overall_growth_score": <0-100: composite score based on all signals above>,
  "competitor_rank": <1-10: estimated market position based on content quality vs competitors>,
  "competitors_beaten": <0-5: how many of the provided competitors this site clearly outperforms based on content quality>,
  "competitor_gap_note": <string: one specific, factual insight about competitive position based on actual content comparison. Be specific.>,
  "milestone": <string: the single most impressive factual thing you found about this website from the real crawled content>,
  "milestone_impact": <string: why this matters for the business in plain English>,
  "story": <string: 3-4 sentence honest narrative about where this website stands today, what's working, and what opportunity exists. Write as if briefing the business owner. Reference actual content you found.>,
  "verified_strengths": <array of 3-5 strings: specific things confirmed true from the crawled content>,
  "verified_gaps": <array of 3-5 strings: specific gaps confirmed from the crawled content that AI engines would penalise>
}

RULES:
- Every score must be justified by something real in the content
- If you cannot verify something, estimate conservatively
- Never invent statistics
- Be specific — reference actual page titles, content, or features you saw
- Return ONLY the JSON, no markdown, no explanation
`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const analysis = JSON.parse(cleaned);

    return res.status(200).json({
      success: true,
      url,
      fetched_at: new Date().toISOString(),
      analysis,
    });

  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Analysis failed',
    });
  }
}
