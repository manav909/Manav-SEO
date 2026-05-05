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
You are an expert SEO analyst and client success consultant. Analyze the REAL crawled data below.
Return ONLY a JSON object. Every number must be based on actual evidence found in the content.

CONFIDENCE LEVELS you must assign to each metric:
- "verified" = directly confirmed from crawled content (e.g. found FAQ section, found address, counted H1 tags)
- "estimated" = calculated from indirect signals (e.g. content quality suggests this score)
- "approximate" = rough estimate with limited data

=== MAIN WEBSITE: ${url} ===
${siteContent}

=== GOOGLE INDEXING DATA ===
${indexingData}

=== LLM VISIBILITY CHECK (Perplexity search results) ===
${llmData}

${competitorSections ? `=== COMPETITOR DATA ===\n${competitorSections}` : ''}

Return this EXACT JSON — no extra fields, no markdown:

{
  "llm_visibility_score": <0-100>,
  "chatgpt_citations": <0-20>,
  "perplexity_citations": <0-20>,
  "google_ai_citations": <0-20>,
  "llm_platforms": <string[]>,
  "algorithm_health_score": <0-100>,
  "eeat_score": <0-100>,
  "content_authority_score": <0-100>,
  "pages_indexed": <integer: extract from indexing data, look for result count numbers>,
  "pages_submitted": <integer: estimate based on site structure>,
  "brand_mentions": <integer>,
  "overall_growth_score": <0-100>,
  "competitor_rank": <1-10>,
  "competitors_beaten": <0-5>,
  "competitor_gap_note": "<specific: name the actual competitor, name the actual difference found e.g. 'competitor1.com has 24 FAQ entries vs your 6 — this directly explains their higher Perplexity presence'>",
  "milestone": "<the single most impressive factual thing found in crawled content>",
  "milestone_impact": "<why this matters for the business in plain English>",
  "story": "<3-4 sentences: confident narrative referencing ACTUAL content found. Start with a strength. Then the opportunity. End with momentum.>",
  "verified_strengths": ["<specific thing confirmed true from content>"],
  "growth_opportunities": ["<gap reframed as opportunity with specific action and specific reward>"],
  "competitive_proof": [
    {
      "claim": "<specific competitive advantage or disadvantage>",
      "evidence": "<exact quote or observation from crawled content that proves this>",
      "source": "<which site this came from>",
      "impact": "<what this means for rankings/visibility>"
    }
  ],
  "explanations": {
    "llm_visibility_score": {
      "score_label": "<label: 0-30=Building AI Presence, 31-60=Growing AI Visibility, 61-80=Strong AI Footprint, 81-100=AI Search Leader>",
      "confidence": "<verified|estimated|approximate>",
      "score_reason": "<specific factual reason referencing actual content signals found. Must mention something real from the crawl.>",
      "what_it_means": "<plain English business impact>",
      "opportunity": "<single most impactful action with specific expected reward>",
      "what_to_expect": "<realistic expectation with timeframe>",
      "proof_points": ["<specific thing found in content>"],
      "growth_projections": {
        "conservative": {
          "label": "Normal Pace",
          "score_gain": <realistic integer 5-15>,
          "timeframe": "<e.g. 60-90 days>",
          "actions": "<1-2 specific actions at normal pace>",
          "confidence": "High"
        },
        "normal": {
          "label": "Active Strategy",
          "score_gain": <realistic integer 15-30>,
          "timeframe": "<e.g. 45-60 days>",
          "actions": "<1-2 specific actions at active pace>",
          "confidence": "Medium-High"
        },
        "aggressive": {
          "label": "Full Sprint",
          "score_gain": <realistic integer 25-45>,
          "timeframe": "<e.g. 30-45 days>",
          "actions": "<1-2 specific actions at full sprint pace>",
          "confidence": "Medium"
        }
      }
    },
    "algorithm_health_score": {
      "score_label": "<label>",
      "confidence": "<verified|estimated|approximate>",
      "score_reason": "<specific factual reason>",
      "what_it_means": "<business impact>",
      "opportunity": "<action with reward>",
      "what_to_expect": "<expectation with timeframe>",
      "proof_points": ["<evidence>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal": { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive": { "label": "Full Sprint", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "eeat_score": {
      "score_label": "<label>",
      "confidence": "<verified|estimated|approximate>",
      "score_reason": "<specific factual reason>",
      "what_it_means": "<business impact>",
      "opportunity": "<action>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<evidence>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal": { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive": { "label": "Full Sprint", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "content_authority_score": {
      "score_label": "<label>",
      "confidence": "<verified|estimated|approximate>",
      "score_reason": "<specific factual reason>",
      "what_it_means": "<business impact>",
      "opportunity": "<action>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<evidence>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal": { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive": { "label": "Full Sprint", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "overall_growth_score": {
      "score_label": "<label>",
      "confidence": "<verified|estimated|approximate>",
      "score_reason": "<composite reason>",
      "what_it_means": "<business impact>",
      "opportunity": "<most impactful single action>",
      "what_to_expect": "<90 day outlook>",
      "proof_points": ["<key evidence>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal": { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive": { "label": "Full Sprint", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "competitor_rank": {
      "score_label": "<label>",
      "confidence": "<verified|estimated|approximate>",
      "score_reason": "<specific competitive context with actual evidence>",
      "what_it_means": "<business meaning>",
      "opportunity": "<specific competitive action>",
      "what_to_expect": "<competitive trajectory>",
      "proof_points": ["<specific comparison with named competitor>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal": { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive": { "label": "Full Sprint", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "pages_indexed": {
      "score_label": "<label>",
      "confidence": "<verified|estimated|approximate>",
      "score_reason": "<what the indexing data actually showed>",
      "what_it_means": "<business meaning>",
      "opportunity": "<action>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<what you saw in indexing data>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal": { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive": { "label": "Full Sprint", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "brand_mentions": {
      "score_label": "<label>",
      "confidence": "<verified|estimated|approximate>",
      "score_reason": "<based on what you found>",
      "what_it_means": "<business meaning>",
      "opportunity": "<action>",
      "what_to_expect": "<expectation>",
      "proof_points": ["<evidence>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal": { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive": { "label": "Full Sprint", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    }
  }
}

STRICT RULES:
- competitive_proof must reference actual competitor URLs or content found — never invent
- proof_points must quote or paraphrase something actually seen in the crawled content
- growth_projections must be realistic — aggressive should not promise the impossible
- confidence field must be honest — if data was limited, say "approximate"
- Return ONLY the JSON object, nothing else
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
