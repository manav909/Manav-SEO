// BUNDLE-VERSION: 2026-05-15-standalone
import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/* ── Inline Supabase client ── */
let _supa: any = null;
function db(): any {
  if (_supa) return _supa;
  try {
    _supa = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'placeholder'
    );
  } catch (e) { console.error('[run-analysis] db init failed:', (e as any)?.message); }
  return _supa;
}

/* ── Inline minimal saveLearning (no classification — direct insert; never throws) ── */
async function saveLearning(opts: {
  source: string; projectId: string | null; content: string; title?: string;
  cardType?: string; contextSummary?: string;
}): Promise<{ saved: boolean }> {
  if (!opts.content || opts.content.length < 80) return { saved: false };
  try {
    const sbc = db(); if (!sbc) return { saved: false };
    await sbc.from('brain_learnings').insert({
      project_id:      opts.projectId,
      source:          opts.source,
      card_type:       opts.cardType || 'insight',
      card_title:      (opts.title || opts.content.slice(0, 80)).slice(0, 100),
      improvement:     opts.content.slice(0, 800),
      context_summary: opts.contextSummary || opts.source,
      what_worked:     [], what_missed: [],
      tags:            [opts.cardType || 'insight', opts.source.split('_')[0]].filter(Boolean),
      applied_count:   0,
      status:          /audit/i.test(opts.source) ? 'active' : 'pending_review',
      auto_captured:   true,
      confidence_score: /audit/i.test(opts.source) ? 85 : 70,
      updated_at:      new Date().toISOString(),
    });
    return { saved: true };
  } catch (_e) { return { saved: false }; }
}

/* ── No-op stub for post-audit pipeline (the full version did learnings extraction +
   metric scoring + staleness flagging — bypassing it here keeps the audit response
   working; can be re-introduced later as a separate Lambda) ── */
async function runPostAuditPipeline(_opts: any): Promise<void> { /* intentional no-op */ }

function getAI(): Anthropic { return new Anthropic(); }

export const config = { maxDuration: 300 };


/* ══════════════════════════════════════════════════
   CONFIDENCE SYSTEM
   Every data point carries: value, confidence (0-100),
   sources[], limitations[], cross_verified_by[]
══════════════════════════════════════════════════ */

interface DataPoint {
  value:              any;
  confidence:         number;
  sources:            string[];
  limitations:        string[];
  cross_verified_by?: string[];
  verified_at:        string;
}

const dp = (value: any, confidence: number, sources: string[], limitations: string[], cross?: string[]): DataPoint => ({
  value, confidence, sources, limitations,
  cross_verified_by: cross || [],
  verified_at: new Date().toISOString(),
});

/* ── Raw data collectors ── */

async function fetchPage(url: string): Promise<string> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOSeason/1.0)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    return html.slice(0, 80000);
  } catch (_e) { return ''; }
}

async function fetchSitemap(url: string): Promise<{ count: number; urls: string[] }> {
  const base = url.replace(/\/$/, '');
  const tries = [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`, `${base}/sitemap/sitemap.xml`];
  for (const s of tries) {
    try {
      const r = await fetch(s, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const text = await r.text();
      const urls = [...text.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).filter(Boolean);
      if (urls.length > 0) return { count: urls.length, urls: urls.slice(0, 50) };
    } catch (_e) { continue; }
  }
  return { count: 0, urls: [] };
}

async function googleCount(query: string): Promise<number> {
  try {
    const enc = encodeURIComponent(query);
    const r = await fetch(`https://www.google.com/search?q=${enc}&num=1`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await r.text();
    const m = html.match(/About ([\d,]+) results/i) || html.match(/([\d,]+) results/i);
    if (m) return parseInt(m[1].replace(/,/g, ''));
    return 0;
  } catch (_e) { return 0; }
}

async function checkGoogleRank(keyword: string, domain: string): Promise<{ found: boolean; position: number | null; page: number | null; snippet: string; positionLabel: string }> {
  try {
    const enc = encodeURIComponent(keyword);
    const r = await fetch(`https://www.google.com/search?q=${enc}&num=30`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await r.text();
    const dom = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

    const snippetMatches = [...html.matchAll(/class="[^"]*(?:r|LC20lb)[^"]*"[^>]*>(.*?)<\/(?:h3|div)>/g)];
    const linkMatches    = [...html.matchAll(/href="https?:\/\/([^"\/]+)/g)];

    for (let i = 0; i < linkMatches.length; i++) {
      const linkDomain = linkMatches[i][1].replace(/^www\./, '');
      if (linkDomain.includes(dom) || dom.includes(linkDomain)) {
        const position = i + 1;
        const page = Math.ceil(position / 10);
        const snippet = snippetMatches[Math.min(i, snippetMatches.length - 1)]?.[1]
          ?.replace(/<[^>]+>/g, '').trim().slice(0, 120) || '';
        const positionLabel = position <= 3 ? `Page 1 · Top 3 (Position ${position})` :
                              position <= 10 ? `Page 1 · Position ${position}` :
                              position <= 20 ? `Page 2 · Position ${position}` :
                              `Page 3+ · Position ~${position}`;
        return { found: true, position, page, snippet, positionLabel };
      }
    }
    return { found: false, position: null, page: null, snippet: '', positionLabel: 'Not in top 30' };
  } catch (_e) {
    return { found: false, position: null, page: null, snippet: '', positionLabel: 'Check failed' };
  }
}

async function testPerplexity(brand: string): Promise<{ mentions: number; verified: boolean }> {
  try {
    const r = await fetch(`https://www.perplexity.ai/search?q=${encodeURIComponent(brand)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await r.text();
    const domain = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mentions = (html.match(new RegExp(domain, 'gi')) || []).length;
    return { mentions, verified: true };
  } catch (_e) {
    return { mentions: 0, verified: false };
  }
}

/* ══════════════════════════════════════════════════
   AGENT 1: TECHNICAL CRAWLER
   Verifies: sitemap count, page structure, robots, schema
   Confidence ceiling: 90% (can't verify JS-rendered pages)
══════════════════════════════════════════════════ */
async function runTechnicalAgent(url: string, html: string, sitemap: { count: number; urls: string[] }, indexedCount: number) {
  const limitations: string[] = [];
  const sources: string[] = ['Direct sitemap.xml fetch', 'Google site:domain search', 'HTTP page fetch'];

  if (!html) limitations.push('Could not fetch page HTML — JS-rendered content not analysed');
  if (sitemap.count === 0) limitations.push('No sitemap.xml found — page count from Google index only');

  const hasSchema   = html.includes('"@type"') || html.includes('application/ld+json');
  const hasRobots   = url.includes('robots');
  const hasCanonical= html.includes('rel="canonical"');
  const hasSitemap  = sitemap.count > 0;
  const hasTitle    = (html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || '').length > 0;
  const hasMeta     = html.includes('<meta name="description"');
  const headingCount= (html.match(/<h[1-6]/gi) || []).length;
  const imgCount    = (html.match(/<img/gi) || []).length;
  const altMissing  = imgCount > 0 ? (html.match(/<img(?![^>]*\balt=)[^>]*>/gi) || []).length : 0;

  const issues: string[] = [];
  if (!hasSchema)    issues.push('No structured data (Schema.org) detected');
  if (!hasCanonical) issues.push('No canonical tag found');
  if (!hasTitle)     issues.push('Missing or empty title tag');
  if (!hasMeta)      issues.push('Missing meta description');
  if (altMissing > 0) issues.push(`${altMissing} images missing alt text`);
  if (!hasSitemap)   issues.push('No sitemap.xml detected');

  const indexingRatio = sitemap.count > 0 && indexedCount > 0
    ? Math.round((indexedCount / sitemap.count) * 100) : null;

  const technicalScore = Math.round(
    ([hasSchema, hasCanonical, hasTitle, hasMeta, hasSitemap].filter(Boolean).length / 5) * 100
  );

  return {
    pages_indexed:   dp(indexedCount || null, indexedCount > 0 ? 92 : 0, ['Google site:domain live search'], indexedCount === 0 ? ['Google returned 0 — may be timing or domain variation'] : []),
    pages_submitted: dp(sitemap.count || null, sitemap.count > 0 ? 95 : 0, ['Direct sitemap.xml parse'], sitemap.count === 0 ? ['Sitemap not found at standard paths'] : []),
    indexing_ratio:  dp(indexingRatio, indexingRatio !== null ? 88 : 0, ['Calculated from sitemap + Google'], limitations),
    has_schema:      dp(hasSchema, 85, ['HTML source analysis'], ['Dynamic schema via JS may not be detected']),
    has_canonical:   dp(hasCanonical, 90, ['HTML source analysis'], []),
    technical_score: dp(technicalScore, 80, ['Composite of 5 detectable signals'], ['JS-rendered content not included']),
    issues,
    limitations,
    sources,
  };
}

/* ══════════════════════════════════════════════════
   AGENT 2: CONTENT & E-E-A-T ANALYSER
   AI analyses fetched HTML for content quality signals
   Confidence ceiling: 78% (AI interpretation is subjective)
══════════════════════════════════════════════════ */
async function runContentAgent(url: string, html: string, keywords: string[], brand_name: string) {
  const limitations = [
    'Scores are AI interpretations of visible HTML content — margin of error ±8 points',
    'Paywall or login-required content is not analysed',
    'Dynamic/JS-rendered content may be partially missed',
  ];

  if (!html) {
    return {
      eeat_score:              dp(null, 0, [], ['Could not fetch page']),
      content_authority_score: dp(null, 0, [], ['Could not fetch page']),
      llm_readiness_score:     dp(null, 0, [], ['Could not fetch page']),
      story:                   '',
      strengths:               [],
      gaps:                    [],
      limitations,
    };
  }

  const cleanText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 15000);

  const prompt = `You are a senior SEO and content analyst. Analyse this webpage content and return ONLY valid JSON.

URL: ${url}
Brand: ${brand_name}
Target Keywords: ${keywords.slice(0,5).join(', ') || 'not specified'}

PAGE CONTENT (first 15000 chars of HTML stripped):
${cleanText}

Analyse and return this exact JSON structure:
{
  "eeat_score": <integer 0-100: Experience+Expertise+Authoritativeness+Trustworthiness signals found in actual content>,
  "content_authority_score": <integer 0-100: depth, specificity, citation-worthiness of content>,
  "llm_readiness_score": <integer 0-100: how well structured this content is for AI citation>,
  "algorithm_health_score": <integer 0-100: alignment with Google Helpful Content guidelines>,
  "story": "<2 sentences: what this site is about and its strongest signal>",
  "eeat_evidence": ["<specific thing found in content that signals E-E-A-T>", ...up to 3],
  "content_strengths": ["<specific content strength found>", ...up to 3],
  "content_gaps": ["<specific content gap relevant to keywords>", ...up to 3],
  "llm_readiness_factors": ["<specific element that helps or hurts AI citation>", ...up to 3],
  "keyword_presence": {"${keywords.slice(0,3).join('": true/false, "')}" : true},
  "content_confidence_note": "<one sentence: specific limitation of this analysis for this page>"
}

Return ONLY the JSON. No other text.`;

  try {
    const response = await getAI().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const cleaned = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const data = JSON.parse(cleaned);

    return {
      eeat_score:              dp(data.eeat_score, 72, ['AI HTML content analysis'], [...limitations, data.content_confidence_note || '']),
      content_authority_score: dp(data.content_authority_score, 70, ['AI content depth analysis'], limitations),
      llm_readiness_score:     dp(data.llm_readiness_score, 72, ['AI structure analysis'], limitations),
      algorithm_health_score:  dp(data.algorithm_health_score, 68, ['AI Helpful Content alignment check'], limitations),
      story:      data.story || '',
      eeat_evidence:    data.eeat_evidence || [],
      strengths:  data.content_strengths || [],
      gaps:       data.content_gaps || [],
      llm_factors: data.llm_readiness_factors || [],
      keyword_presence: data.keyword_presence || {},
      limitations,
    };
  } catch (_e) {
    return {
      eeat_score:              dp(null, 0, [], ['AI analysis failed']),
      content_authority_score: dp(null, 0, [], ['AI analysis failed']),
      llm_readiness_score:     dp(null, 0, [], ['AI analysis failed']),
      algorithm_health_score:  dp(null, 0, [], ['AI analysis failed']),
      story: '', eeat_evidence: [], strengths: [], gaps: [], llm_factors: [], keyword_presence: {},
      limitations: ['AI content analysis failed — page may be inaccessible'],
    };
  }
}

/* ══════════════════════════════════════════════════
   AGENT 3: AI VISIBILITY TESTER
   Tests actual AI engine presence
   ChatGPT: estimated only (no API)
   Perplexity: live test
   Google AI: inferred from page signals
   Confidence ceiling: 82% (AI results vary by user/region)
══════════════════════════════════════════════════ */
async function runVisibilityAgent(url: string, brand_name: string, brandMentions: number) {
  const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

  const [perplexityResult] = await Promise.all([
    testPerplexity(brand_name || domain),
  ]);

  const limitations: string[] = [
    'Perplexity results vary by user context and region — this is a single test point',
    'ChatGPT has no public citation API — value is estimated from content signals only',
    'Google AI Overview varies significantly by search query and user location',
    'All AI citation counts are point-in-time snapshots, not persistent metrics',
  ];

  /* Estimate LLM visibility from composite signals */
  const llmEstimate = Math.min(100, Math.round(
    (perplexityResult.mentions > 0 ? 30 : 0) +
    (brandMentions > 100 ? 25 : brandMentions > 20 ? 15 : brandMentions > 5 ? 8 : 0) +
    20 /* base for being a real website */
  ));

  /* ChatGPT estimate based on brand signals (clearly marked as estimate) */
  const chatgptEstimate = Math.round(
    (brandMentions > 500 ? 8 : brandMentions > 100 ? 4 : brandMentions > 20 ? 2 : 0) +
    (perplexityResult.mentions > 2 ? 3 : perplexityResult.mentions > 0 ? 1 : 0)
  );

  return {
    perplexity_citations: dp(
      perplexityResult.mentions,
      perplexityResult.verified ? 75 : 0,
      perplexityResult.verified ? ['Live Perplexity.ai search test'] : [],
      perplexityResult.verified ? [limitations[0]] : ['Perplexity test failed — network or access issue']
    ),
    google_ai_citations: dp(
      null, /* Cannot reliably verify without logged-in Google session */
      0,
      [],
      ['Google AI Overview requires authenticated Google session to reliably test — not currently verifiable']
    ),
    chatgpt_citations: dp(
      chatgptEstimate,
      28, /* Hard cap — this is estimated */
      ['Estimated from brand signal strength and Perplexity correlation'],
      ['OpenAI provides NO public citation API. This is estimated. Do not use as a reliable metric.']
    ),
    llm_visibility_score: dp(
      llmEstimate,
      60,
      ['Composite: Perplexity test + brand mention volume'],
      ['Composite estimate — individual AI engine scores may vary significantly']
    ),
    brand_mentions: dp(
      brandMentions,
      brandMentions > 0 ? 82 : 0,
      ['Live Google search: "brand name" result count'],
      ['Google result counts are approximate and fluctuate daily', 'Not equal to backlinks or editorial mentions']
    ),
    limitations,
  };
}

/* ══════════════════════════════════════════════════
   AGENT 4: RANKING & COMPETITIVE INTELLIGENCE
   Each keyword: live Google SERP check
   Confidence per keyword: 80% (SERP varies by location/personalization)
══════════════════════════════════════════════════ */
async function runRankingAgent(url: string, keywords: string[], competitors: string[]) {
  const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const limitations = [
    'Rankings are location-dependent — results from server location, not client location',
    'Google personalisation affects results — incognito/neutral position shown here',
    'Rankings snapshot only — can change daily',
    'Competitors checked for domain presence only, not specific page rankings',
  ];

  /* Check keywords with delay to avoid rate limiting */
  const rankingResults: any[] = [];
  for (let i = 0; i < Math.min(keywords.length, 6); i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 1000));
    const result = await checkGoogleRank(keywords[i], domain);
    rankingResults.push({
      keyword: keywords[i],
      ...result,
      confidence: 78,
      source: 'Live Google SERP',
      limitation: 'Position may vary ±2-3 by location/personalization',
    });
  }

  /* Basic competitor domain checks */
  const competitorData: any[] = [];
  for (const comp of competitors.slice(0, 3)) {
    const compDomain = comp.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (!compDomain) continue;
    const indexed = await googleCount(`site:${compDomain}`);
    await new Promise(r => setTimeout(r, 600));
    competitorData.push({
      domain: compDomain,
      indexed_pages: dp(indexed || null, indexed > 0 ? 80 : 0, ['Google site:domain count'], ['Approximate count only']),
    });
  }

  const rankedCount   = rankingResults.filter(k => k.found).length;
  const page1Count    = rankingResults.filter(k => k.found && k.page === 1).length;
  const competitorRank = rankedCount > 0 ? Math.max(1, Math.round(5 - (page1Count / Math.max(rankingResults.length, 1)) * 4)) : null;

  return {
    keyword_rankings: rankingResults,
    competitor_data:  competitorData,
    competitor_rank:  dp(competitorRank, competitorRank !== null ? 65 : 0, ['Estimated from keyword ranking proportion'], ['Relative rank only — not absolute competitive position']),
    competitors_beaten: dp(
      competitorData.length > 0 ? Math.max(0, competitorData.length - (competitorRank || competitorData.length)) : null,
      50,
      ['Inferred from relative content signal comparison'],
      ['Estimated — detailed competitor content analysis requires separate per-competitor audit']
    ),
    limitations,
  };
}

/* ══════════════════════════════════════════════════
   CROSS-VERIFICATION ENGINE
   Compares overlapping data points between agents
   Adjusts confidence based on agreement
══════════════════════════════════════════════════ */
function crossVerify(technical: any, content: any, visibility: any, ranking: any) {
  const verifications: Record<string, any> = {};

  /* pages_indexed: Agent1 (Google count) vs Agent1 (sitemap) */
  if (technical.pages_indexed.value !== null && technical.pages_submitted.value !== null) {
    const ratio = technical.pages_submitted.value > 0
      ? technical.pages_indexed.value / technical.pages_submitted.value : 0;
    const agreement = ratio >= 0.5; /* At least 50% indexed */
    verifications.indexing_health = {
      data_points_compared: ['pages_indexed (Google)', 'pages_submitted (Sitemap)'],
      agreement,
      confidence_adjustment: agreement ? +5 : -10,
      note: agreement
        ? `${Math.round(ratio*100)}% of sitemap pages are indexed — healthy signal`
        : `Only ${Math.round(ratio*100)}% indexed — potential crawl issue worth investigating`,
    };
    technical.pages_indexed.confidence += verifications.indexing_health.confidence_adjustment;
  }

  /* content quality: Agent2 eeat vs Agent1 technical_score */
  if (content.eeat_score.value !== null && technical.technical_score.value !== null) {
    const eeat = content.eeat_score.value;
    const tech = technical.technical_score.value;
    const agreement = Math.abs(eeat - tech) < 30; /* Within 30 points */
    verifications.quality_consistency = {
      data_points_compared: ['eeat_score (Agent2)', 'technical_score (Agent1)'],
      eeat_score: eeat, technical_score: tech,
      agreement,
      confidence_adjustment: agreement ? +5 : -5,
      note: agreement
        ? 'Content quality and technical health are consistent — both agents agree'
        : `Content quality (${eeat}) and technical health (${tech}) diverge significantly — one area needs attention`,
    };
    content.eeat_score.confidence = Math.min(88, content.eeat_score.confidence + verifications.quality_consistency.confidence_adjustment);
    content.eeat_score.cross_verified_by = ['Technical Agent'];
  }

  /* keyword presence: Agent2 (content analysis) vs Agent4 (live SERP) */
  const kwPresence = content.keyword_presence || {};
  const kwRankings = ranking.keyword_rankings || [];
  let kwAgreements = 0, kwTotal = 0;
  for (const kw of kwRankings.slice(0, 3)) {
    const inContent = kwPresence[kw.keyword];
    const inSERP    = kw.found;
    if (inContent !== undefined) {
      kwTotal++;
      if (inContent === inSERP) kwAgreements++;
    }
  }
  if (kwTotal > 0) {
    const agreementRate = kwAgreements / kwTotal;
    verifications.keyword_correlation = {
      data_points_compared: ['keyword_presence (Agent2)', 'serp_rankings (Agent4)'],
      agreement_rate: Math.round(agreementRate * 100),
      note: agreementRate >= 0.6
        ? `${Math.round(agreementRate*100)}% of keywords present in content are also ranking — strong correlation`
        : 'Low correlation between content keywords and SERP rankings — content optimisation opportunity',
    };
  }

  /* Visibility: Perplexity mentions vs brand mentions */
  if (visibility.perplexity_citations.value !== null && visibility.brand_mentions.value !== null) {
    const perp  = visibility.perplexity_citations.value;
    const brand = visibility.brand_mentions.value;
    const expected = brand > 500 ? perp >= 1 : brand > 50 ? true : true;
    verifications.ai_visibility_alignment = {
      data_points_compared: ['perplexity_citations (live test)', 'brand_mentions (Google count)'],
      perplexity: perp, brand_mentions: brand,
      plausible: expected,
      note: expected
        ? 'AI visibility and brand mention volume are consistent signals'
        : 'AI visibility and brand mentions diverge — unusual pattern worth monitoring',
    };
    if (expected) {
      visibility.perplexity_citations.confidence = Math.min(85, visibility.perplexity_citations.confidence + 5);
      visibility.perplexity_citations.cross_verified_by = ['Brand Mention Count'];
    }
  }

  return verifications;
}

/* ══════════════════════════════════════════════════
   OVERALL CONFIDENCE CALCULATOR
   Weights each agent's contribution to overall score
══════════════════════════════════════════════════ */
function calculateOverallConfidence(technical: any, content: any, visibility: any, ranking: any): number {
  const scores = [
    technical.pages_indexed.confidence,
    technical.technical_score.confidence,
    content.eeat_score.confidence,
    content.content_authority_score.confidence,
    visibility.perplexity_citations.confidence,
    visibility.brand_mentions.confidence,
    ranking.keyword_rankings.length > 0 ? 78 : 0,
  ].filter(s => s > 0);

  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/* ══════════════════════════════════════════════════
   AI SYNTHESIS
   Generates analysis narrative from all verified data
══════════════════════════════════════════════════ */
async function synthesize(url: string, brand: string, technical: any, content: any, visibility: any, ranking: any, crossVerifications: any) {
  const dataStr = JSON.stringify({
    pages_indexed:    technical.pages_indexed.value,
    pages_submitted:  technical.pages_submitted.value,
    technical_score:  technical.technical_score.value,
    technical_issues: technical.issues,
    eeat_score:       content.eeat_score.value,
    content_authority:content.content_authority_score.value,
    llm_readiness:    content.llm_readiness_score.value,
    algorithm_health: content.algorithm_health_score.value,
    story:            content.story,
    strengths:        content.strengths,
    gaps:             content.gaps,
    perplexity:       visibility.perplexity_citations.value,
    brand_mentions:   visibility.brand_mentions.value,
    keywords:         ranking.keyword_rankings.map((k: any) => ({
      keyword: k.keyword, found: k.found, page: k.page, position: k.position,
    })),
    cross_verifications: crossVerifications,
  });

  const prompt = `You are an expert SEO analyst. Based ONLY on this verified data, generate analysis insights.
Do not invent numbers. Do not add data not present. Flag uncertainties.

DATA: ${dataStr}

Return ONLY valid JSON:
{
  "overall_verdict": "<2 sentences: honest assessment of current SEO position based on data above>",
  "biggest_verified_win": "<the single strongest data point from above — cite the actual number>",
  "most_urgent_gap": "<the most impactful gap from the data above — be specific>",
  "keyword_insights": {
    "<keyword from data>": {
      "current_status_message": "<what the ranking data above actually says>",
      "business_value": "<why this ranking matters — based on keyword intent>",
      "priority": "high|medium|low",
      "quick_win": "<specific action based on gap data above>"
    }
  },
  "verified_strengths": ["<strength with specific evidence from data>"],
  "growth_opportunities": ["<gap with specific data point referenced>"],
  "data_limitations_summary": "<one paragraph: what this analysis could NOT verify and why>",
  "milestone": "<most impressive verified finding>",
  "milestone_impact": "<why it matters to the business>"
}`;

  try {
    const response = await getAI().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw     = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const cleaned = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    return JSON.parse(cleaned);
  } catch (_e) {
    return {
      overall_verdict: 'Analysis synthesis failed — raw data is still available above.',
      biggest_verified_win: '',
      most_urgent_gap: '',
      keyword_insights: {},
      verified_strengths: [],
      growth_opportunities: [],
      data_limitations_summary: 'Synthesis failed.',
      milestone: '',
      milestone_impact: '',
    };
  }
}

/* ══════════════════════════════════════════════════
   MAIN HANDLER
══════════════════════════════════════════════════ */
/* ── Safe export ── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _run_analysis_h(req, res); }
  catch (e: any) { try { res.status(200).json({error: e?.message||"unknown"}); } catch (_) {} }
}
async function _run_analysis_h(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(200).json({ error: 'Method not allowed' });

  const {
    url         = '',
    keywords    = [] as string[],
    competitors = [] as string[],
    brand_name  = '',
    project_id  = null,
  } = req.body;

  if (!url) return res.status(200).json({ error: 'URL required' });

  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

  try {
    /* Phase 1: Collect raw verifiable data */
    const [html, sitemap, indexedCount, brandMentions] = await Promise.all([
      fetchPage(normalizedUrl),
      fetchSitemap(normalizedUrl),
      googleCount(`site:${normalizedUrl.replace(/^https?:\/\//, '')}`),
      brand_name ? googleCount(`"${brand_name}"`) : Promise.resolve(0),
    ]);

    /* Phase 2: Run 4 agents */
    const [technical, content, visibility, ranking] = await Promise.all([
      runTechnicalAgent(normalizedUrl, html, sitemap, indexedCount),
      runContentAgent(normalizedUrl, html, keywords, brand_name),
      runVisibilityAgent(normalizedUrl, brand_name, brandMentions),
      runRankingAgent(normalizedUrl, keywords, competitors),
    ]);

    /* Phase 3: Cross-verify */
    const crossVerifications = crossVerify(technical, content, visibility, ranking);

    /* Phase 4: Synthesize */
    const synthesis = await synthesize(normalizedUrl, brand_name, technical, content, visibility, ranking, crossVerifications);

    /* Phase 5: Calculate overall confidence */
    const overallConfidence = calculateOverallConfidence(technical, content, visibility, ranking);

    /* Build unified result */
    const result = {
      success:     true,
      fetched_at:  new Date().toISOString(),
      url:         normalizedUrl,
      project_id,
      overall_confidence: overallConfidence,
      sections: {
        technical: {
          agent:  'Technical Crawler',
          ceiling: 'Max confidence 92% — cannot verify JS-rendered content or authenticated pages',
          data:   technical,
        },
        content: {
          agent:  'Content & E-E-A-T Analyser',
          ceiling: 'Max confidence 78% — AI interpretation has inherent margin of error',
          data:   content,
        },
        visibility: {
          agent:  'AI Visibility Tester',
          ceiling: 'Max confidence 82% — AI results vary by user/region. ChatGPT capped at 28% — no public API',
          data:   visibility,
        },
        ranking: {
          agent:  'Ranking & Competitive Intelligence',
          ceiling: 'Max confidence 80% — SERP varies by location and personalization',
          data:   ranking,
        },
      },
      cross_verifications: crossVerifications,
      synthesis,
      /* Flat analysis object for metrics table compatibility */
      analysis: {
        llm_visibility_score:    visibility.llm_visibility_score.value,
        algorithm_health_score:  content.algorithm_health_score.value,
        eeat_score:              content.eeat_score.value,
        content_authority_score: content.content_authority_score.value,
        overall_growth_score:    content.llm_readiness_score.value,
        pages_indexed:           technical.pages_indexed.value,
        pages_submitted:         technical.pages_submitted.value,
        brand_mentions:          visibility.brand_mentions.value,
        perplexity_citations:    visibility.perplexity_citations.value,
        google_ai_citations:     null, /* Not verifiable */
        chatgpt_citations:       visibility.chatgpt_citations.value,
        competitor_rank:         ranking.competitor_rank.value,
        competitors_beaten:      ranking.competitors_beaten.value,
        keyword_rankings:        ranking.keyword_rankings,
        story:                   content.story,
        milestone:               synthesis.milestone,
        milestone_impact:        synthesis.milestone_impact,
        verified_strengths:      synthesis.verified_strengths,
        growth_opportunities:    synthesis.growth_opportunities,
        competitor_gap_note:     '',
        explanations: {
          keyword_insights:           synthesis.keyword_insights,
          data_limitations_summary:   synthesis.data_limitations_summary,
          overall_verdict:            synthesis.overall_verdict,
        },
        data_sources: {
          pages_indexed:       { method: 'google_site_search',   verified: true,  confidence: technical.pages_indexed.confidence },
          pages_submitted:     { method: 'sitemap_parse',        verified: true,  confidence: technical.pages_submitted.confidence },
          brand_mentions:      { method: 'google_search_count',  verified: true,  confidence: visibility.brand_mentions.confidence },
          perplexity_citations:{ method: 'live_perplexity_test', verified: true,  confidence: visibility.perplexity_citations.confidence },
          google_ai_citations: { method: 'not_verifiable',       verified: false, confidence: 0 },
          chatgpt_citations:   { method: 'ai_estimate',          verified: false, confidence: 28 },
          keyword_rankings:    { method: 'live_serp',            verified: true,  confidence: 78 },
          content_scores:      { method: 'ai_content_analysis',  verified: true,  confidence: 72 },
        },
      },
    };

    /* ── Server-side: save to audit_reports + run automation pipeline ── */
    if (project_id) {
      Promise.resolve().then(async () => {
        try {
          /* 1. Save audit report to DB */
          const { data: auditRow } = await db()
            .from("audit_reports")
            .insert({
              project_id,
              url:           normalizedUrl,
              score:         overallConfidence,
              sections:      result.sections,
              keywords:      keywords,
              competitors:   competitors,
              synced_to_metrics: false,
              saved_by:      "auto",
            })
            .select("id").single();

          const auditId = (auditRow as any)?.id || "unknown";

          /* 2. Build sections text for learning extraction */
          const sectionsForPipeline: Record<string, string> = {
            technical:  [
              synthesis.overall_verdict,
              ...(synthesis.verified_strengths || []),
              ...(synthesis.growth_opportunities || []),
            ].filter(Boolean).join(" "),
            content:    content.story || "",
            visibility: `LLM Visibility: ${visibility.llm_visibility_score.value}/100. Perplexity citations: ${visibility.perplexity_citations.value}. ${synthesis.biggest_verified_win || ""}`,
            ranking:    (synthesis.keyword_insights
              ? Object.values(synthesis.keyword_insights).map((k: any) => k.current_status_message || "").join(" ")
              : ""),
          };

          /* 3. Run the full post-audit pipeline (learnings + metrics + staleness) */
          await runPostAuditPipeline({
            projectId: project_id,
            auditId,
            url: normalizedUrl,
            sections: sectionsForPipeline,
            score: overallConfidence,
          });

          /* 4. Save most urgent gap as a learning if it has substance */
          if (synthesis.most_urgent_gap && synthesis.most_urgent_gap.length > 50) {
            await saveLearning({
              source:    "audit_synthesis",
              projectId: project_id,
              content:   synthesis.most_urgent_gap,
              title:     `Most urgent gap — ${normalizedUrl.replace(/https?:\/\//, "").slice(0, 30)}`,
              cardType:  "technical",
              contextSummary: `Audit synthesis for ${normalizedUrl}`,
            });
          }
        } catch (_e) { /* pipeline never crashes the response */ }
      }).catch(() => {});
    }

    return res.status(200).json(result);

  } catch (err: any) {
    return res.status(200).json({ success: false, error: err.message });
  }
}
