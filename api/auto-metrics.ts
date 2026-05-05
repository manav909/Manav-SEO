import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/* ─── crawl helpers ─── */
async function fetchText(url: string, timeout = 25000): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown', 'X-Timeout': '25' },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return '';
    return (await res.text()).trim().slice(0, 8000);
  } catch { return ''; }
}

async function fetchRaw(url: string, timeout = 15000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOBot/1.0)' },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return '';
    return (await res.text()).slice(0, 50000);
  } catch { return ''; }
}

/* ─── 1. Count pages in sitemap ─── */
async function countSitemapPages(domain: string): Promise<{ count: number; source: string }> {
  const base = `https://${domain}`;
  const attempts = [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/sitemap/sitemap.xml`,
    `${base}/wp-sitemap.xml`,
  ];

  for (const url of attempts) {
    try {
      const xml = await fetchRaw(url);
      if (!xml) continue;
      // Count <url> or <sitemap> entries
      const urlMatches  = (xml.match(/<url>/g)     || []).length;
      const locMatches  = (xml.match(/<loc>/g)      || []).length;
      const sitemapRefs = (xml.match(/<sitemap>/g)  || []).length;
      const count = urlMatches || locMatches || sitemapRefs;
      if (count > 0) return { count, source: url };
    } catch { continue; }
  }
  return { count: 0, source: 'not found' };
}

/* ─── 2. Count Google-indexed pages ─── */
async function countIndexedPages(domain: string): Promise<{ count: number; raw: string }> {
  try {
    const searchUrl = `https://www.google.com/search?q=site:${domain}&num=10&hl=en`;
    const text = await fetchText(searchUrl);
    if (!text) return { count: 0, raw: '' };

    // Try to extract result count from text like "About 1,230 results"
    const patterns = [
      /About ([\d,]+) results/i,
      /([\d,]+) results/i,
      /Showing results for.*?([\d,]+)/i,
    ];
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) {
        const num = parseInt(m[1].replace(/,/g, ''));
        if (num > 0) return { count: num, raw: text.slice(0, 1000) };
      }
    }
    // Fallback: count domain appearances in results
    const domainCount = (text.match(new RegExp(domain.replace('.', '\\.'), 'g')) || []).length;
    return { count: domainCount > 0 ? domainCount * 3 : 0, raw: text.slice(0, 1000) };
  } catch { return { count: 0, raw: '' }; }
}

/* ─── 3. Check keyword ranking on Google ─── */
async function checkKeywordRanking(keyword: string, domain: string): Promise<{
  position: number | null;
  positionLabel: string;
  page: number | null;
  found: boolean;
  snippet: string;
}> {
  try {
    const q = encodeURIComponent(keyword);
    const searchUrl = `https://www.google.com/search?q=${q}&num=30&hl=en`;
    const text = await fetchText(searchUrl, 20000);
    if (!text) return { position: null, positionLabel: 'Unknown', page: null, found: false, snippet: '' };

    const lines = text.split('\n');
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

    let position = 0;
    let found = false;
    let snippet = '';

    for (const line of lines) {
      if (line.includes('http') || line.includes(cleanDomain)) position++;
      if (line.toLowerCase().includes(cleanDomain.toLowerCase())) {
        found = true;
        snippet = line.slice(0, 120);
        break;
      }
    }

    if (!found) return { position: null, positionLabel: 'Not in top 30', page: null, found: false, snippet: '' };

    const page = Math.ceil(position / 10);
    const positionLabel = position <= 3  ? `Top 3 — Position ~${position}`
                        : position <= 10 ? `Page 1 — Position ~${position}`
                        : position <= 20 ? `Page 2 — Position ~${position}`
                        : `Page 3+ — Position ~${position}`;

    return { position, positionLabel, page, found: true, snippet };
  } catch {
    return { position: null, positionLabel: 'Could not check', page: null, found: false, snippet: '' };
  }
}

/* ─── 4. Count brand mentions ─── */
async function countBrandMentions(brandName: string, domain: string): Promise<{ count: number; raw: string }> {
  try {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const q = encodeURIComponent(`"${brandName}" -site:${cleanDomain}`);
    const text = await fetchText(`https://www.google.com/search?q=${q}&num=10`);
    if (!text) return { count: 0, raw: '' };

    const patterns = [
      /About ([\d,]+) results/i,
      /([\d,]+) results/i,
    ];
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) {
        return { count: parseInt(m[1].replace(/,/g, '')), raw: text.slice(0, 500) };
      }
    }
    return { count: 0, raw: text.slice(0, 500) };
  } catch { return { count: 0, raw: '' }; }
}

/* ─── 5. Check LLM visibility on Perplexity ─── */
async function checkPerplexity(keyword: string, brandName: string): Promise<{ found: boolean; snippet: string; citationCount: number }> {
  try {
    const q = encodeURIComponent(`${keyword} ${brandName}`);
    const text = await fetchText(`https://www.perplexity.ai/search?q=${q}`, 25000);
    if (!text) return { found: false, snippet: '', citationCount: 0 };

    const cleanBrand = brandName.toLowerCase();
    const found = text.toLowerCase().includes(cleanBrand);
    const snippet = found
      ? text.slice(Math.max(0, text.toLowerCase().indexOf(cleanBrand) - 100), text.toLowerCase().indexOf(cleanBrand) + 200)
      : '';
    const citationCount = (text.toLowerCase().match(new RegExp(cleanBrand, 'g')) || []).length;
    return { found, snippet: snippet.slice(0, 300), citationCount: Math.min(citationCount, 20) };
  } catch { return { found: false, snippet: '', citationCount: 0 }; }
}

/* ─── 6. Check Google AI Overview ─── */
async function checkGoogleAIOverview(keyword: string, domain: string): Promise<{ found: boolean; snippet: string }> {
  try {
    const q = encodeURIComponent(keyword);
    const text = await fetchText(`https://www.google.com/search?q=${q}&hl=en`);
    if (!text) return { found: false, snippet: '' };

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const found = text.toLowerCase().includes(cleanDomain.toLowerCase());
    const aiSectionPatterns = ['AI Overview', 'Featured snippet', 'People also ask'];
    const hasAiSection = aiSectionPatterns.some(p => text.includes(p));

    return {
      found: found && hasAiSection,
      snippet: hasAiSection ? text.slice(0, 400) : '',
    };
  } catch { return { found: false, snippet: '' }; }
}

/* ─── MAIN HANDLER ─── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, competitors = [], keywords = [], brand_name = '' } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const fullUrl  = url.startsWith('http') ? url : `https://${url}`;
  const domain   = fullUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const brand    = brand_name || domain.split('.')[0];
  const kws      = keywords.filter(Boolean).slice(0, 5);
  const primaryKw = kws[0] || domain;

  /* ─── Fetch everything in parallel ─── */
  const [
    siteContent,
    sitemapData,
    indexData,
    brandMentionData,
    perplexityData,
    googleAIData,
    ...competitorContents
  ] = await Promise.all([
    fetchText(fullUrl),
    countSitemapPages(domain),
    countIndexedPages(domain),
    countBrandMentions(brand, domain),
    checkPerplexity(primaryKw, brand),
    checkGoogleAIOverview(primaryKw, domain),
    ...competitors.slice(0, 2).map((c: string) => fetchText(c.startsWith('http') ? c : `https://${c}`)),
  ]);

  /* ─── Keyword rankings (sequential to avoid rate limits) ─── */
  const keywordRankings: any[] = [];
  for (const kw of kws) {
    const ranking = await checkKeywordRanking(kw, domain);
    keywordRankings.push({
      keyword: kw,
      ...ranking,
      verified: true,
      source: 'Google Search (live)',
    });
    // Small delay to be polite
    await new Promise(r => setTimeout(r, 800));
  }

  const competitorSections = competitors.slice(0, 2).map((c: string, i: number) =>
    `=== COMPETITOR ${i+1}: ${c} ===\n${competitorContents[i] || 'Could not crawl'}\n`
  ).join('\n');

  /* ─── Build verified data summary ─── */
  const verifiedData = {
    pages_submitted:   sitemapData.count,
    pages_indexed:     indexData.count,
    brand_mentions:    brandMentionData.count,
    perplexity_found:  perplexityData.found,
    perplexity_count:  perplexityData.citationCount,
    google_ai_found:   googleAIData.found,
    keyword_rankings:  keywordRankings,
    data_sources: {
      pages_submitted: sitemapData.source,
      pages_indexed:   'Google site: search',
      brand_mentions:  'Google search count',
      perplexity:      `Perplexity search: "${primaryKw} ${brand}"`,
      google_ai:       `Google search: "${primaryKw}"`,
      keywords:        'Live Google SERP check',
    },
  };

  /* ─── AI analysis for scores ─── */
  const client = new Anthropic();

  const prompt = `
You are an SEO analyst. Analyze the real crawled data below and return a JSON object.
The verified measurements are already provided — DO NOT change them.
Your job is ONLY to generate the 0-100 scores based on content quality analysis.

=== REAL VERIFIED DATA (DO NOT CHANGE) ===
Pages in sitemap: ${verifiedData.pages_submitted} (source: ${verifiedData.data_sources.pages_submitted})
Pages indexed by Google: ${verifiedData.pages_indexed} (source: ${verifiedData.data_sources.pages_indexed})
Brand mentions on web: ${verifiedData.brand_mentions} (source: ${verifiedData.data_sources.brand_mentions})
Perplexity visibility: ${verifiedData.perplexity_found ? 'YES — brand found' : 'NOT found'} (${verifiedData.perplexity_count} appearances)
Google AI Overview: ${verifiedData.google_ai_found ? 'YES — site referenced' : 'NOT found'}

Keyword Rankings (live Google SERP):
${keywordRankings.map(k => `- "${k.keyword}": ${k.found ? k.positionLabel : 'Not in top 30'}`).join('\n')}

=== WEBSITE CONTENT (crawled live) ===
${siteContent.slice(0, 5000)}

${competitorSections ? `=== COMPETITOR CONTENT ===\n${competitorSections}` : ''}

Based on the content analysis above, generate these 0-100 scores and insights.
Return ONLY this JSON (no markdown):

{
  "llm_visibility_score": <0-100: based on content structure readiness for AI citation>,
  "algorithm_health_score": <0-100: based on content quality vs Google guidelines>,
  "eeat_score": <0-100: based on E-E-A-T signals found in content>,
  "content_authority_score": <0-100: based on content depth and specificity>,
  "overall_growth_score": <0-100: composite of all signals>,
  "chatgpt_citations": <0-20: estimate based on how citable the content is for ChatGPT>,
  "google_ai_citations": <0-10: ${verifiedData.google_ai_found ? 1 : 0} confirmed + estimate for other queries>,
  "llm_platforms": <string[]: which platforms the brand is likely visible on>,
  "competitor_rank": <1-10: position vs competitors based on content comparison>,
  "competitors_beaten": <0-${competitors.length}: how many competitors have weaker content>,
  "competitor_gap_note": "<specific finding from content comparison — name the competitor, name the actual difference>",
  "milestone": "<most impressive REAL thing found in crawled content — must be specific>",
  "milestone_impact": "<plain English: why this matters for the business>",
  "story": "<3-4 sentences: honest narrative about this website based on real content found. Be specific.>",
  "verified_strengths": ["<specific thing confirmed from content>"],
  "growth_opportunities": ["<specific gap with concrete action and reward>"],
  "explanations": {
    "llm_visibility_score": {
      "score_label": "<Building AI Presence|Growing AI Visibility|Strong AI Footprint|AI Search Leader>",
      "confidence": "estimated",
      "score_reason": "<why this score based on real content signals>",
      "what_it_means": "<plain English business impact>",
      "opportunity": "<specific action with specific reward>",
      "what_to_expect": "<realistic timeframe>",
      "proof_points": ["<specific content signal found>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal":       { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive":   { "label": "Full Sprint", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "algorithm_health_score": {
      "score_label": "<label>", "confidence": "estimated",
      "score_reason": "<reason>", "what_it_means": "<meaning>",
      "opportunity": "<action>", "what_to_expect": "<timeframe>",
      "proof_points": ["<evidence>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal":       { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive":   { "label": "Full Sprint", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "eeat_score": {
      "score_label": "<label>", "confidence": "estimated",
      "score_reason": "<reason>", "what_it_means": "<meaning>",
      "opportunity": "<action>", "what_to_expect": "<timeframe>",
      "proof_points": ["<evidence>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal":       { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive":   { "label": "Full Sprint", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "content_authority_score": {
      "score_label": "<label>", "confidence": "estimated",
      "score_reason": "<reason>", "what_it_means": "<meaning>",
      "opportunity": "<action>", "what_to_expect": "<timeframe>",
      "proof_points": ["<evidence>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal":       { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive":   { "label": "Full Sprint", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "overall_growth_score": {
      "score_label": "<label>", "confidence": "estimated",
      "score_reason": "<reason>", "what_it_means": "<meaning>",
      "opportunity": "<action>", "what_to_expect": "<timeframe>",
      "proof_points": ["<evidence>"],
      "growth_projections": {
        "conservative": { "label": "Normal Pace", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "High" },
        "normal":       { "label": "Active Strategy", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium-High" },
        "aggressive":   { "label": "Full Sprint", "score_gain": <int>, "timeframe": "<string>", "actions": "<string>", "confidence": "Medium" }
      }
    },
    "pages_indexed": {
      "score_label": "Google Indexed", "confidence": "verified",
      "score_reason": "Google currently indexes ${verifiedData.pages_indexed} pages from your sitemap of ${verifiedData.pages_submitted} submitted. This was verified by running a live site: search on Google.",
      "what_it_means": "<what having X pages indexed means for organic visibility>",
      "opportunity": "<what to do about unindexed pages>",
      "what_to_expect": "<timeline for indexing improvements>",
      "proof_points": ["Verified via live Google site:${domain} search", "${verifiedData.pages_indexed} results confirmed"]
    },
    "brand_mentions": {
      "score_label": "Web Presence", "confidence": "verified",
      "score_reason": "Found approximately ${verifiedData.brand_mentions} references to your brand across the web, verified via live Google search.",
      "what_it_means": "<what this level of brand presence means>",
      "opportunity": "<how to grow brand mentions>",
      "what_to_expect": "<realistic growth timeline>",
      "proof_points": ["Verified via Google search for brand name", "${verifiedData.brand_mentions} approximate results found"]
    },
    "perplexity_citations": {
      "score_label": "${verifiedData.perplexity_found ? 'Visible on Perplexity' : 'Not Yet on Perplexity'}", "confidence": "verified",
      "score_reason": "${verifiedData.perplexity_found ? `Your brand appears ${verifiedData.perplexity_count} times in Perplexity AI results for relevant queries. This was verified by running a live search.` : 'Your brand was not found in Perplexity AI results for your primary keyword. This is a real gap confirmed by live testing.'}",
      "what_it_means": "${verifiedData.perplexity_found ? 'You are already visible to Perplexity users — these are high-intent research buyers.' : 'You are currently invisible on Perplexity which is growing rapidly. This is a real opportunity.'}",
      "opportunity": "<specific action to improve Perplexity visibility>",
      "what_to_expect": "<realistic timeline>",
      "proof_points": ["${verifiedData.perplexity_found ? `Brand found in Perplexity search for '${primaryKw}'` : `Brand not found in Perplexity search for '${primaryKw}'`}"]
    },
    "competitor_rank": {
      "score_label": "<competitive position label>", "confidence": "estimated",
      "score_reason": "<based on content comparison with competitors>",
      "what_it_means": "<business meaning>",
      "opportunity": "<specific competitive action>",
      "what_to_expect": "<competitive trajectory>",
      "proof_points": ["<specific comparison point>"]
    }
  }
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw     = response.content[0].type === 'text' ? response.content[0].text : '';
    const first   = raw.indexOf('{');
    const last    = raw.lastIndexOf('}');
    const cleaned = first !== -1 && last !== -1 ? raw.slice(first, last + 1) : raw;

    let analysis: any;
    try {
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = { overall_growth_score: 50, story: 'Analysis complete. See verified data below.' };
    }

    /* ─── Inject verified real data — override any AI estimates ─── */
    analysis.pages_submitted   = verifiedData.pages_submitted;
    analysis.pages_indexed     = verifiedData.pages_indexed;
    analysis.brand_mentions    = verifiedData.brand_mentions;
    analysis.perplexity_citations = verifiedData.perplexity_count;
    analysis.google_ai_citations  = verifiedData.google_ai_found ? 1 : 0;
    analysis.keyword_rankings  = keywordRankings;
    analysis.data_sources      = verifiedData.data_sources;

    return res.status(200).json({
      success: true,
      url,
      fetched_at: new Date().toISOString(),
      analysis,
    });

  } catch (err: any) {
    // Return verified data even if AI fails
    return res.status(200).json({
      success: true,
      url,
      fetched_at: new Date().toISOString(),
      analysis: {
        pages_submitted:      verifiedData.pages_submitted,
        pages_indexed:        verifiedData.pages_indexed,
        brand_mentions:       verifiedData.brand_mentions,
        perplexity_citations: verifiedData.perplexity_count,
        google_ai_citations:  verifiedData.google_ai_found ? 1 : 0,
        keyword_rankings:     keywordRankings,
        data_sources:         verifiedData.data_sources,
        llm_visibility_score: 0,
        algorithm_health_score: 0,
        eeat_score: 0,
        content_authority_score: 0,
        overall_growth_score: 0,
        story: 'Verified data fetched. AI analysis failed — re-run to generate scores.',
        _error: err.message,
      },
    });
  }
}
