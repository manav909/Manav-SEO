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
    return (await res.text()).trim().slice(0, 8000);
  } catch { return `Could not crawl ${url}`; }
}

async function checkIndexing(url: string): Promise<string> {
  try {
    const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const res = await fetch(`https://r.jina.ai/https://www.google.com/search?q=site:${domain}&num=10`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return 'Could not check indexing';
    return (await res.text()).slice(0, 3000);
  } catch { return 'Could not check indexing'; }
}

async function checkLLMVisibility(brandName: string, keyword: string): Promise<string> {
  try {
    const query = `${keyword} ${brandName}`;
    const res = await fetch(`https://r.jina.ai/https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return 'Could not check LLM visibility';
    return (await res.text()).slice(0, 3000);
  } catch { return 'Could not check LLM visibility'; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, competitors = [], keywords = [], brand_name = '' } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const brandForSearch = brand_name || domain.split('.')[0];
  const primaryKeyword = keywords[0] || domain.split('.')[0];

  const [siteContent, indexingData, llmData, ...competitorContents] = await Promise.all([
    crawl(url),
    checkIndexing(url),
    checkLLMVisibility(brandForSearch, primaryKeyword),
    ...competitors.slice(0, 3).map((c: string) => crawl(c)),
  ]);

  const competitorSections = competitors.slice(0, 3).map((c: string, i: number) => `
=== COMPETITOR ${i + 1}: ${c} ===
${competitorContents[i]}
`).join('\n');

  const client = new Anthropic();

  const prompt = `
You are an expert SEO and GEO analyst AND a client success consultant. Analyze the real crawled data below.
Return ONLY a JSON object. Base every score strictly on what you can observe. Never fabricate.

=== MAIN WEBSITE: ${url} ===
${siteContent}

=== GOOGLE INDEXING DATA ===
${indexingData}

=== LLM VISIBILITY CHECK ===
${llmData}

${competitorSections ? `=== COMPETITORS ===\n${competitorSections}` : ''}

Return this EXACT JSON structure:

{
  "llm_visibility_score": <0-100>,
  "chatgpt_citations": <0-20>,
  "perplexity_citations": <0-20>,
  "google_ai_citations": <0-20>,
  "llm_platforms": <string[]>,
  "algorithm_health_score": <0-100>,
  "eeat_score": <0-100>,
  "content_authority_score": <0-100>,
  "pages_indexed": <integer>,
  "pages_submitted": <integer>,
  "brand_mentions": <integer>,
  "overall_growth_score": <0-100>,
  "competitor_rank": <1-10>,
  "competitors_beaten": <0-5>,
  "competitor_gap_note": <string>,
  "milestone": <string>,
  "milestone_impact": <string>,
  "story": <string: 3-4 sentences, honest narrative about this website today>,
  "verified_strengths": <string[]>,
  "verified_gaps": <string[]>,
  "explanations": {
    "llm_visibility_score": {
      "score_reason": "<1-2 sentences: exactly why this score. Reference real content signals found. e.g. 'Your FAQ section has 6 direct questions that match how people ask AI engines, and your business address is clearly structured — both strong signals for AI citation'>",
      "what_it_means": "<1 sentence: plain English what this score means for the business>",
      "what_was_done": "<1-2 sentences: what SEO work directly contributed to this score. If score is low, say what is missing>",
      "what_to_expect": "<1-2 sentences: realistic expectation of where this goes next with continued work>",
      "proof_points": ["<specific thing found in content that justifies score>", "<another specific proof point>"]
    },
    "algorithm_health_score": {
      "score_reason": "<why this score based on real content>",
      "what_it_means": "<plain English meaning>",
      "what_was_done": "<work done or missing>",
      "what_to_expect": "<next 30-90 days expectation>",
      "proof_points": ["<specific evidence from content>"]
    },
    "eeat_score": {
      "score_reason": "<why this score — reference actual E-E-A-T signals found or missing>",
      "what_it_means": "<plain English meaning>",
      "what_was_done": "<work done or missing>",
      "what_to_expect": "<realistic expectation>",
      "proof_points": ["<specific evidence>"]
    },
    "content_authority_score": {
      "score_reason": "<why this score based on content depth and specificity found>",
      "what_it_means": "<plain English meaning>",
      "what_was_done": "<what contributed or is missing>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<specific evidence>"]
    },
    "pages_indexed": {
      "score_reason": "<why this indexing count based on real indexing data found>",
      "what_it_means": "<what this means for the business>",
      "what_was_done": "<what was done to help indexing>",
      "what_to_expect": "<what should happen next>",
      "proof_points": ["<specific evidence from indexing data>"]
    },
    "chatgpt_citations": {
      "score_reason": "<why this many ChatGPT citations estimated>",
      "what_it_means": "<what this means in real terms>",
      "what_was_done": "<what contributed>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<evidence>"]
    },
    "perplexity_citations": {
      "score_reason": "<why this count based on actual Perplexity search results crawled>",
      "what_it_means": "<plain English>",
      "what_was_done": "<work done>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<what you actually saw in Perplexity results>"]
    },
    "google_ai_citations": {
      "score_reason": "<why this score>",
      "what_it_means": "<meaning>",
      "what_was_done": "<work>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<evidence>"]
    },
    "brand_mentions": {
      "score_reason": "<why this brand mention count>",
      "what_it_means": "<meaning>",
      "what_was_done": "<work>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<evidence>"]
    },
    "overall_growth_score": {
      "score_reason": "<composite reason for overall score>",
      "what_it_means": "<plain English meaning>",
      "what_was_done": "<what is working>",
      "what_to_expect": "<30-90 day outlook>",
      "proof_points": ["<key evidence>"]
    },
    "competitor_rank": {
      "score_reason": "<why this market position based on competitor content comparison>",
      "what_it_means": "<what rank #X means for the business>",
      "what_was_done": "<what moved the needle>",
      "what_to_expect": "<path to improving rank>",
      "proof_points": ["<specific comparison with competitor content>"]
    }
  }
}

CRITICAL RULES:
- proof_points must reference SPECIFIC things found in the crawled content
- score_reason must be factual not generic
- what_to_expect must be realistic (30-90 day timeframes)
- Write explanations AS IF talking directly to the business owner
- Keep language simple — no jargon
- Return ONLY the JSON
`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const analysis = JSON.parse(cleaned);

    return res.status(200).json({ success: true, url, fetched_at: new Date().toISOString(), analysis });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Analysis failed' });
  }
}
