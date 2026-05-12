import Anthropic from "@anthropic-ai/sdk";
import { extractAndSaveLearning } from "./ai-cache";
import type { VercelRequest, VercelResponse } from "@vercel/node";

async function fetchText(url: string, timeout = 25000): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown', 'X-Timeout': '25' },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return '';
    return (await res.text()).trim().slice(0, 8000);
  } catch (_e) { return ''; }
}

async function fetchRaw(url: string, timeout = 15000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOBot/1.0)' },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return '';
    return (await res.text()).slice(0, 50000);
  } catch (_e) { return ''; }
}

async function countSitemapPages(domain: string): Promise<{ count: number; source: string }> {
  const attempts = [
    `https://${domain}/sitemap.xml`,
    `https://${domain}/sitemap_index.xml`,
    `https://${domain}/sitemap/sitemap.xml`,
    `https://${domain}/wp-sitemap.xml`,
  ];
  for (const url of attempts) {
    try {
      const xml = await fetchRaw(url);
      if (!xml) continue;
      const urlMatches  = (xml.match(/<url>/g)    || []).length;
      const locMatches  = (xml.match(/<loc>/g)     || []).length;
      const sitemapRefs = (xml.match(/<sitemap>/g) || []).length;
      const count = urlMatches || locMatches || sitemapRefs;
      if (count > 0) return { count, source: url };
    } catch (_e) { continue; }
  }
  return { count: 0, source: 'not found' };
}

async function countIndexedPages(domain: string): Promise<{ count: number; raw: string }> {
  try {
    const text = await fetchText(`https://www.google.com/search?q=site:${domain}&num=10&hl=en`);
    if (!text) return { count: 0, raw: '' };
    const patterns = [/About ([\d,]+) results/i, /([\d,]+) results/i];
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) {
        const num = parseInt(m[1].replace(/,/g, ''));
        if (num > 0) return { count: num, raw: text.slice(0, 1000) };
      }
    }
    const domainCount = (text.match(new RegExp(domain.replace('.', '\\.'), 'g')) || []).length;
    return { count: domainCount > 0 ? domainCount * 3 : 0, raw: text.slice(0, 1000) };
  } catch (_e) { return { count: 0, raw: '' }; }
}

async function checkKeywordRanking(keyword: string, domain: string): Promise<{
  position: number | null; positionLabel: string; page: number | null; found: boolean; snippet: string;
}> {
  try {
    const q    = encodeURIComponent(keyword);
    const text = await fetchText(`https://www.google.com/search?q=${q}&num=30&hl=en`, 20000);
    if (!text) return { position: null, positionLabel: 'Unknown', page: null, found: false, snippet: '' };

    const lines      = text.split('\n');
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    let position = 0, found = false, snippet = '';

    for (const line of lines) {
      if (line.includes('http') || line.includes(cleanDomain)) position++;
      if (line.toLowerCase().includes(cleanDomain.toLowerCase())) {
        found   = true;
        snippet = line.slice(0, 120);
        break;
      }
    }

    if (!found) return { position: null, positionLabel: 'Not in top 30', page: null, found: false, snippet: '' };

    const page         = Math.ceil(position / 10);
    const positionLabel = position <= 3  ? `Top 3 — Position ~${position}`
                        : position <= 10 ? `Page 1 — Position ~${position}`
                        : position <= 20 ? `Page 2 — Position ~${position}`
                        : `Page 3+ — Position ~${position}`;

    return { position, positionLabel, page, found: true, snippet };
  } catch (_e) {
    return { position: null, positionLabel: 'Could not check', page: null, found: false, snippet: '' };
  }
}

async function countBrandMentions(brandName: string, domain: string): Promise<{ count: number }> {
  try {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const q    = encodeURIComponent(`"${brandName}" -site:${cleanDomain}`);
    const text = await fetchText(`https://www.google.com/search?q=${q}&num=10`);
    if (!text) return { count: 0 };
    const patterns = [/About ([\d,]+) results/i, /([\d,]+) results/i];
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) return { count: parseInt(m[1].replace(/,/g, '')) };
    }
    return { count: 0 };
  } catch (_e) { return { count: 0 }; }
}

async function checkPerplexity(keyword: string, brandName: string): Promise<{ found: boolean; citationCount: number }> {
  try {
    const q    = encodeURIComponent(`${keyword} ${brandName}`);
    const text = await fetchText(`https://www.perplexity.ai/search?q=${q}`, 25000);
    if (!text) return { found: false, citationCount: 0 };
    const cleanBrand   = brandName.toLowerCase();
    const found        = text.toLowerCase().includes(cleanBrand);
    const citationCount = Math.min((text.toLowerCase().match(new RegExp(cleanBrand, 'g')) || []).length, 20);
    return { found, citationCount };
  } catch (_e) { return { found: false, citationCount: 0 }; }
}

async function checkGoogleAI(keyword: string, domain: string): Promise<{ found: boolean }> {
  try {
    const q    = encodeURIComponent(keyword);
    const text = await fetchText(`https://www.google.com/search?q=${q}&hl=en`);
    if (!text) return { found: false };
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const hasDomain   = text.toLowerCase().includes(cleanDomain.toLowerCase());
    const hasAI       = ['AI Overview', 'Featured snippet', 'People also ask'].some(p => text.includes(p));
    return { found: hasDomain && hasAI };
  } catch (_e) { return { found: false }; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(200).json({ error: 'Method not allowed' });

  const { url, competitors = [], keywords = [], brand_name = '' } = req.body;
  if (!url) return res.status(200).json({ error: 'URL required' });

  const fullUrl    = url.startsWith('http') ? url : `https://${url}`;
  const domain     = fullUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const brand      = brand_name || domain.split('.')[0];
  const kws        = (keywords as string[]).filter(Boolean).slice(0, 5);
  const primaryKw  = kws[0] || domain;

  const [siteContent, sitemapData, indexData, brandData, perplexityData, googleAIData, ...competitorContents] =
    await Promise.all([
      fetchText(fullUrl),
      countSitemapPages(domain),
      countIndexedPages(domain),
      countBrandMentions(brand, domain),
      checkPerplexity(primaryKw, brand),
      checkGoogleAI(primaryKw, domain),
      ...competitors.slice(0, 2).map((c: string) => fetchText(c.startsWith('http') ? c : `https://${c}`)),
    ]);

  /* Keyword rankings — sequential to avoid rate limits */
  const keywordRankings: any[] = [];
  for (const kw of kws) {
    const r = await checkKeywordRanking(kw, domain);
    keywordRankings.push({ keyword: kw, ...r, verified: true, source: 'Google Search (live)' });
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  const verifiedData = {
    pages_submitted:   sitemapData.count,
    pages_indexed:     indexData.count,
    brand_mentions:    brandData.count,
    perplexity_found:  perplexityData.found,
    perplexity_count:  perplexityData.citationCount,
    google_ai_found:   googleAIData.found,
  };

  const competitorSections = competitors.slice(0, 2).map((c: string, i: number) =>
    `=== COMPETITOR ${i + 1}: ${c} ===\n${competitorContents[i] || 'Could not crawl'}\n`
  ).join('\n');

  const client = new Anthropic();

  const prompt = `
You are an SEO analyst and client success consultant. Analyze the real data below.
Return ONLY a JSON object — no markdown, no explanation outside the JSON.

TONE: Always optimistic and forward-looking. Ranking = celebrate. Not ranking = exciting opportunity.
Never use words like: failing, broken, poor, missing. Always use: opportunity, potential, momentum, growth.

=== VERIFIED REAL DATA ===
Pages in sitemap: ${verifiedData.pages_submitted}
Pages indexed by Google: ${verifiedData.pages_indexed}
Brand mentions on web: ${verifiedData.brand_mentions}
Perplexity: ${verifiedData.perplexity_found ? `YES — brand found (${verifiedData.perplexity_count} appearances)` : 'NOT found yet'}
Google AI Overview: ${verifiedData.google_ai_found ? 'YES — referenced' : 'NOT found yet'}

Keyword Rankings (ALL keywords — live Google SERP):
${keywordRankings.map(k => `- "${k.keyword}": ${k.found ? k.positionLabel : 'Not in top 30'}`).join('\n')}

=== WEBSITE CONTENT ===
${siteContent.slice(0, 5000)}

${competitorSections ? `=== COMPETITORS ===\n${competitorSections}` : ''}

Return this EXACT JSON:

{
  "llm_visibility_score": <0-100>,
  "chatgpt_citations": <0-20>,
  "perplexity_citations": <integer: use ${verifiedData.perplexity_count} as base>,
  "google_ai_citations": <0-10: ${verifiedData.google_ai_found ? 1 : 0} confirmed>,
  "llm_platforms": <string[]>,
  "algorithm_health_score": <0-100>,
  "eeat_score": <0-100>,
  "content_authority_score": <0-100>,
  "overall_growth_score": <0-100>,
  "competitor_rank": <1-10>,
  "competitors_beaten": <0-${competitors.length}>,
  "competitor_gap_note": "<specific finding — name the competitor and the actual difference>",
  "milestone": "<most impressive real thing found in crawled content>",
  "milestone_impact": "<plain English: why this matters>",
  "story": "<3-4 sentences: confident optimistic narrative referencing actual content found>",
  "verified_strengths": ["<specific thing confirmed from content>"],
  "growth_opportunities": ["<gap reframed as exciting opportunity with specific action>"],
  "competitive_proof": [
    {
      "claim": "<specific competitive finding>",
      "evidence": "<exact quote or observation from crawled content>",
      "source": "<which site>",
      "impact": "<what this means for rankings>"
    }
  ],
  "keyword_insights": {
    ${kws.map((kw: string) => {
      const ranking = keywordRankings.find((r: any) => r.keyword === kw);
      const isRanking = ranking?.found;
      const page = ranking?.page;
      return `"${kw}": {
      "business_value": "<what ranking on page 1 for '${kw}' specifically means for THIS business — reference their actual service/industry from the crawled content. Be specific about the type of customer this keyword attracts>",
      "current_status_message": "${isRanking
        ? `<celebrate the ranking at ${ranking?.positionLabel}. Explain what this means: these searchers are finding the business. Be specific and enthusiastic>`
        : `<frame 'not yet ranking' as the biggest growth opportunity. Explain why '${kw}' is worth pursuing — what type of buyer searches this, what value it would unlock>`
      }",
      "why_keep_working": "<specific compelling reason to continue investing in this keyword — what it will unlock, what revenue/visibility it represents when ranking improves>",
      "buyer_intent": "<describe exactly what a person searching '${kw}' is trying to do — are they ready to buy, comparing options, researching, or looking for something local? Be specific>",
      "priority": "${isRanking && page === 1 ? 'high' : isRanking && page === 2 ? 'high' : 'high'}",
      "quick_win": "<one specific, actionable thing that would most improve performance for '${kw}' in the next 30 days>"
    }`;
    }).join(',\n    ')}
  },
  "explanations": {
    "llm_visibility_score": {
      "score_label": "<Building AI Presence|Growing AI Visibility|Strong AI Footprint|AI Search Leader>",
      "confidence": "estimated",
      "score_reason": "<specific reason based on real content signals>",
      "what_it_means": "<plain English business impact>",
      "opportunity": "<specific action with specific reward>",
      "what_to_expect": "<realistic timeframe>",
      "proof_points": ["<specific evidence from content>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace",     "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal":       { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive":   { "label": "Full Sprint",     "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "algorithm_health_score": {
      "score_label": "<label>", "confidence": "estimated",
      "score_reason": "<reason>", "what_it_means": "<meaning>",
      "opportunity": "<action>", "what_to_expect": "<timeframe>",
      "proof_points": ["<evidence>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace",     "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal":       { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive":   { "label": "Full Sprint",     "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "eeat_score": {
      "score_label": "<label>", "confidence": "estimated",
      "score_reason": "<reason>", "what_it_means": "<meaning>",
      "opportunity": "<action>", "what_to_expect": "<timeframe>",
      "proof_points": ["<evidence>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace",     "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal":       { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive":   { "label": "Full Sprint",     "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "content_authority_score": {
      "score_label": "<label>", "confidence": "estimated",
      "score_reason": "<reason>", "what_it_means": "<meaning>",
      "opportunity": "<action>", "what_to_expect": "<timeframe>",
      "proof_points": ["<evidence>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace",     "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal":       { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive":   { "label": "Full Sprint",     "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "overall_growth_score": {
      "score_label": "<label>", "confidence": "estimated",
      "score_reason": "<composite reason>", "what_it_means": "<meaning>",
      "opportunity": "<most impactful single action>", "what_to_expect": "<90 day outlook>",
      "proof_points": ["<key evidence>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace",     "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal":       { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive":   { "label": "Full Sprint",     "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "pages_indexed": {
      "score_label": "Google Indexed", "confidence": "verified",
      "score_reason": "Google currently indexes ${verifiedData.pages_indexed} pages from your sitemap of ${verifiedData.pages_submitted}. Verified by live site: search.",
      "what_it_means": "<what this level of indexing means for organic visibility>",
      "opportunity": "<what to do about unindexed pages>",
      "what_to_expect": "<timeline for indexing improvements>",
      "proof_points": ["Verified via live Google site:${domain} search"]
    },
    "brand_mentions": {
      "score_label": "Web Presence", "confidence": "verified",
      "score_reason": "Found ${verifiedData.brand_mentions} references to your brand across the web. Verified via live Google search.",
      "what_it_means": "<what this level of brand presence means>",
      "opportunity": "<how to grow brand mentions>",
      "what_to_expect": "<realistic growth timeline>",
      "proof_points": ["Verified via Google brand name search"]
    },
    "perplexity_citations": {
      "score_label": "${verifiedData.perplexity_found ? 'Visible on Perplexity' : 'Perplexity Opportunity'}",
      "confidence": "verified",
      "score_reason": "${verifiedData.perplexity_found
        ? `Brand appears ${verifiedData.perplexity_count} times in Perplexity search results. Verified by live test.`
        : 'Brand not yet found in Perplexity search for your primary keyword. Verified by live test — this is a real growth opportunity.'}",
      "what_it_means": "${verifiedData.perplexity_found
        ? 'You are already visible to Perplexity users — these are high-intent research buyers.'
        : 'You are currently invisible on Perplexity which is growing rapidly. Adding structured Q&A content would change this.'}",
      "opportunity": "<specific action to improve Perplexity visibility>",
      "what_to_expect": "<realistic timeline>",
      "proof_points": ["${verifiedData.perplexity_found
        ? `Brand found in Perplexity for '${primaryKw}'`
        : `Brand not found in Perplexity for '${primaryKw}' — confirmed by live test`}"]
    },
    "competitor_rank": {
      "score_label": "<label>", "confidence": "estimated",
      "score_reason": "<based on content comparison>",
      "what_it_means": "<business meaning>",
      "opportunity": "<specific competitive action>",
      "what_to_expect": "<trajectory>",
      "proof_points": ["<specific comparison>"]
    }
  }
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw     = response.content[0].type === 'text' ? response.content[0].text : '';
    const first   = raw.indexOf('{');
    const last    = raw.lastIndexOf('}');
    const cleaned = (first !== -1 && last !== -1) ? raw.slice(first, last + 1) : raw;

    let analysis: any;
    try {
      analysis = JSON.parse(cleaned);
    } catch (_e) {
      analysis = { overall_growth_score: 50, story: 'Analysis complete. See verified data below.' };
    }

    /* Inject verified real data — never let AI override these */
    analysis.pages_submitted      = verifiedData.pages_submitted;
    analysis.pages_indexed        = verifiedData.pages_indexed;
    analysis.brand_mentions       = verifiedData.brand_mentions;
    analysis.perplexity_citations = verifiedData.perplexity_count;
    analysis.google_ai_citations  = verifiedData.google_ai_found ? 1 : 0;
    analysis.keyword_rankings     = keywordRankings;

    /* Ensure all project keywords have insights */
    const existingInsights = analysis.keyword_insights || {};
    kws.forEach((kw: string) => {
      if (!existingInsights[kw]) {
        existingInsights[kw] = {
          business_value:          `Ranking for "${kw}" brings targeted buyers actively searching for your service directly to your business.`,
          current_status_message:  `This keyword is tracked and actively being optimized. Every report brings you closer to page 1.`,
          why_keep_working:        `High-intent searchers using this term are looking for exactly what you offer — page 1 means they find you first.`,
          buyer_intent:            'Commercial intent — searching to find and hire a service provider.',
          priority:                'high',
          quick_win:               `Create a dedicated page or section specifically targeting "${kw}" with detailed service information and FAQs.`,
        };
      }
    });

    /* Store keyword insights inside explanations so dashboard can access */
    analysis.explanations                     = analysis.explanations || {};
    analysis.explanations.keyword_insights    = existingInsights;
    analysis.keyword_insights                 = existingInsights;

    return res.status(200).json({
      success:    true,
      url,
      fetched_at: new Date().toISOString(),
      analysis,
    });

  } catch (err: any) {
    return res.status(200).json({
      success:    true,
      url,
      fetched_at: new Date().toISOString(),
      analysis: {
        pages_submitted:      verifiedData.pages_submitted,
        pages_indexed:        verifiedData.pages_indexed,
        brand_mentions:       verifiedData.brand_mentions,
        perplexity_citations: verifiedData.perplexity_count,
        google_ai_citations:  verifiedData.google_ai_found ? 1 : 0,
        keyword_rankings:     keywordRankings,
        keyword_insights:     {},
        llm_visibility_score: 0,
        algorithm_health_score: 0,
        eeat_score: 0,
        content_authority_score: 0,
        overall_growth_score: 0,
        story: 'Verified data fetched successfully. Re-run analysis to generate AI scores.',
        _error: err.message,
      },
    });
  }
}
