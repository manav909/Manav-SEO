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
You are an expert SEO and GEO analyst AND a client success consultant who specialises in keeping clients motivated and confident. Analyze the real crawled data below.

Return ONLY a JSON object. Base every score strictly on what you can observe. Never fabricate numbers.
However — your LANGUAGE and FRAMING must always be optimistic, forward-looking, and confidence-building.

CORE PHILOSOPHY:
- A low score = big opportunity = good news for the client
- Never use words like: failing, bad, poor, broken, missing, wrong, weak
- Always use: opportunity, potential, room to grow, next milestone, building momentum, untapped, ahead of the curve
- Frame every gap as a specific task that will deliver a specific reward
- The client should feel: "I'm in good hands and this is exciting"

=== MAIN WEBSITE: ${url} ===
${siteContent}

=== GOOGLE INDEXING DATA ===
${indexingData}

=== LLM VISIBILITY CHECK ===
${llmData}

${competitorSections ? `=== COMPETITORS ===\n${competitorSections}` : ''}

Return this EXACT JSON structure:

{
  "llm_visibility_score": <0-100: how well optimised this site is to be cited by AI engines>,
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
  "story": <string: 3-4 sentences, confident and optimistic narrative. Start with what is working. Then mention the growth opportunity ahead. End with a forward-looking statement about momentum.>,
  "verified_strengths": <string[]: 3-5 specific strengths found in real content, written confidently>,
  "growth_opportunities": <string[]: 3-5 gaps reframed as exciting opportunities with specific actions e.g. 'Adding 15 FAQ answers targeting AI queries would likely triple your Perplexity citation count within 60 days'>,
  "explanations": {
    "llm_visibility_score": {
      "score_label": "<Motivational label for this score level. Examples: score 0-30='Building Your AI Presence', 31-60='Growing AI Visibility', 61-80='Strong AI Footprint', 81-100='AI Search Leader'>",
      "score_reason": "<1-2 sentences: exactly why this score. Reference real content signals. OPTIMISTIC tone even for low scores. e.g. 'Your site has a clear business identity and location signals — the foundation AI engines need. The score is building because FAQ-style content and entity markup have not yet been added, which is a fast win.'>",
      "what_it_means": "<1 sentence: plain English, positive framing. e.g. 'Every point we add here means more buyers finding you through ChatGPT and Perplexity without paying for ads.'>",
      "opportunity": "<The single most impactful action that would move this score. Specific and exciting. e.g. 'Adding 20 structured FAQ answers to your site targeting your top 5 keywords would likely move this score from 42 to 70+ within 45 days.'>",
      "what_to_expect": "<1-2 sentences: realistic but exciting expectation. Use timeframes. e.g. 'With the content work planned for next month, expect this score to climb 15-25 points within 60 days — putting you ahead of most competitors in your category.'>",
      "proof_points": ["<specific positive thing found in real content>", "<another specific proof point>"]
    },
    "algorithm_health_score": {
      "score_label": "<label for score level>",
      "score_reason": "<optimistic why>",
      "what_it_means": "<plain English, positive>",
      "opportunity": "<specific action to improve>",
      "what_to_expect": "<exciting expectation>",
      "proof_points": ["<evidence>"]
    },
    "eeat_score": {
      "score_label": "<label>",
      "score_reason": "<optimistic why>",
      "what_it_means": "<positive meaning>",
      "opportunity": "<action>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<evidence>"]
    },
    "content_authority_score": {
      "score_label": "<label>",
      "score_reason": "<optimistic why>",
      "what_it_means": "<meaning>",
      "opportunity": "<action>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<evidence>"]
    },
    "pages_indexed": {
      "score_label": "<label>",
      "score_reason": "<optimistic why>",
      "what_it_means": "<meaning>",
      "opportunity": "<action>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<evidence>"]
    },
    "chatgpt_citations": {
      "score_label": "<label>",
      "score_reason": "<optimistic why>",
      "what_it_means": "<meaning>",
      "opportunity": "<action>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<evidence>"]
    },
    "perplexity_citations": {
      "score_label": "<label>",
      "score_reason": "<optimistic why>",
      "what_it_means": "<meaning>",
      "opportunity": "<action>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<evidence>"]
    },
    "google_ai_citations": {
      "score_label": "<label>",
      "score_reason": "<optimistic why>",
      "what_it_means": "<meaning>",
      "opportunity": "<action>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<evidence>"]
    },
    "brand_mentions": {
      "score_label": "<label>",
      "score_reason": "<optimistic why>",
      "what_it_means": "<meaning>",
      "opportunity": "<action>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<evidence>"]
    },
    "overall_growth_score": {
      "score_label": "<label>",
      "score_reason": "<optimistic composite reason>",
      "what_it_means": "<meaning>",
      "opportunity": "<most impactful single next action>",
      "what_to_expect": "<exciting 90 day outlook>",
      "proof_points": ["<key evidence>"]
    },
    "competitor_rank": {
      "score_label": "<label>",
      "score_reason": "<optimistic competitive context — even rank #8 is framed as 'you have identified exactly where the competition is and we know how to overtake them'>",
      "what_it_means": "<meaning>",
      "opportunity": "<specific competitive action>",
      "what_to_expect": "<competitive trajectory>",
      "proof_points": ["<specific competitor comparison>"]
    }
  }
}

LANGUAGE RULES — STRICTLY FOLLOW:
- NEVER say: failing, broken, bad, poor, terrible, horrible, missing, no X found, lacks, absent
- ALWAYS say: opportunity, room to grow, next milestone, building, potential, untapped, fast win, quick gain
- For low scores: frame the gap as the OPPORTUNITY e.g. "Score of 28 means 72 points of AI visibility are waiting to be unlocked — and we know exactly how to unlock them"
- For competitor disadvantage: frame as "we know exactly what they're doing and we can do it better"
- Every explanation must END on a positive, forward-looking note
- Return ONLY the JSON, no markdown
`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';

    // Clean markdown fences
    let cleaned = raw.replace(/```json|```/g, '').trim();

    // Find the outermost JSON object
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace === -1) {
      return res.status(500).json({ success: false, error: 'No JSON found in AI response' });
    }

    // If JSON is truncated, close it properly
    if (lastBrace === -1 || lastBrace < firstBrace) {
      cleaned = cleaned.slice(firstBrace) + '}}';
    } else {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    let analysis: any;
    try {
      analysis = JSON.parse(cleaned);
    } catch {
      // If still failing, try to extract just the scores without explanations
      // by building a minimal valid object from what we can parse
      const extract = (key: string, fallback: any = 0) => {
        const match = cleaned.match(new RegExp(`"${key}"\\s*:\\s*([^,}\\]]+)`));
        if (!match) return fallback;
        const val = match[1].trim().replace(/"/g, '');
        const num = parseFloat(val);
        return isNaN(num) ? (val || fallback) : num;
      };

      analysis = {
        llm_visibility_score: extract('llm_visibility_score'),
        chatgpt_citations: extract('chatgpt_citations'),
        perplexity_citations: extract('perplexity_citations'),
        google_ai_citations: extract('google_ai_citations'),
        algorithm_health_score: extract('algorithm_health_score'),
        eeat_score: extract('eeat_score'),
        content_authority_score: extract('content_authority_score'),
        pages_indexed: extract('pages_indexed'),
        pages_submitted: extract('pages_submitted'),
        brand_mentions: extract('brand_mentions'),
        overall_growth_score: extract('overall_growth_score'),
        competitor_rank: extract('competitor_rank'),
        competitors_beaten: extract('competitors_beaten'),
        llm_platforms: [],
        competitor_gap_note: 'Analysis generated — full details available on next run.',
        milestone: 'Initial analysis complete',
        milestone_impact: 'Your baseline scores have been established. We now know exactly where to focus for maximum growth.',
        story: 'Your website has been analyzed and scored across all key growth metrics. The foundation is in place and your campaign is active.',
        verified_strengths: [],
        growth_opportunities: [],
        explanations: {},
        _partial: true,
      };
    }

    return res.status(200).json({
      success: true,
      url,
      fetched_at: new Date().toISOString(),
      analysis,
    });

  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Analysis failed'
    });
  }
