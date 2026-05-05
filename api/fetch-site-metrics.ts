import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

async function fetchPageSpeed(url: string) {
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(fullUrl)}&strategy=mobile&category=performance&category=seo&category=accessibility&category=best-practices`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchPageSpeedDesktop(url: string) {
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(fullUrl)}&strategy=desktop&category=performance&category=seo`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchSiteContent(url: string) {
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const jinaUrl = `https://r.jina.ai/${fullUrl}`;
    const res = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim().slice(0, 12000);
  } catch { return null; }
}

function extractCWV(psiData: any) {
  if (!psiData) return null;
  const labs = psiData?.lighthouseResult?.audits;
  const field = psiData?.loadingExperience?.metrics;

  return {
    // Lab data (always available)
    lcp_lab: labs?.['largest-contentful-paint']?.displayValue || null,
    fcp_lab: labs?.['first-contentful-paint']?.displayValue || null,
    tbt: labs?.['total-blocking-time']?.displayValue || null,
    cls_lab: labs?.['cumulative-layout-shift']?.displayValue || null,
    speed_index: labs?.['speed-index']?.displayValue || null,
    tti: labs?.['interactive']?.displayValue || null,
    // Field data (real user data — only available for popular sites)
    lcp_field: field?.LARGEST_CONTENTFUL_PAINT_MS?.category || null,
    fid_field: field?.FIRST_INPUT_DELAY_MS?.category || null,
    cls_field: field?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.category || null,
    // Scores (0-100)
    performance_score: Math.round((psiData?.lighthouseResult?.categories?.performance?.score || 0) * 100),
    seo_score: Math.round((psiData?.lighthouseResult?.categories?.seo?.score || 0) * 100),
    accessibility_score: Math.round((psiData?.lighthouseResult?.categories?.accessibility?.score || 0) * 100),
    best_practices_score: Math.round((psiData?.lighthouseResult?.categories?.['best-practices']?.score || 0) * 100),
    // Key audits
    has_meta_description: labs?.['meta-description']?.score === 1,
    has_valid_lang: labs?.['html-has-lang']?.score === 1,
    has_canonical: labs?.['canonical']?.score === 1,
    image_alt_issues: labs?.['image-alt']?.score !== 1,
    tap_targets_ok: labs?.['tap-targets']?.score === 1,
    font_size_ok: labs?.['font-size']?.score === 1,
    render_blocking: labs?.['render-blocking-resources']?.details?.items?.length || 0,
    unused_css: labs?.['unused-css-rules']?.details?.items?.length || 0,
    unused_js: labs?.['unused-javascript']?.details?.items?.length || 0,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  // Fetch all data in parallel
  const [mobileData, desktopData, siteContent] = await Promise.all([
    fetchPageSpeed(url),
    fetchPageSpeedDesktop(url),
    fetchSiteContent(url),
  ]);

  const mobileCWV = extractCWV(mobileData);
  const desktopCWV = extractCWV(desktopData);

  if (!mobileCWV && !siteContent) {
    return res.status(400).json({ error: 'Could not fetch data for this URL. Make sure it is publicly accessible.' });
  }

  // Use Claude to analyze the real crawled content
  const client = new Anthropic();

  const analysisPrompt = `
You are an SEO analyst. Based on the REAL data below, provide a factual SEO analysis.
Only state what you can directly verify from the data. Never guess or assume.

=== REAL PAGESPEED DATA (MOBILE) ===
Performance Score: ${mobileCWV?.performance_score}/100
SEO Score: ${mobileCWV?.seo_score}/100
Accessibility Score: ${mobileCWV?.accessibility_score}/100
Best Practices Score: ${mobileCWV?.best_practices_score}/100
LCP: ${mobileCWV?.lcp_lab}
FCP: ${mobileCWV?.fcp_lab}
CLS: ${mobileCWV?.cls_lab}
TBT: ${mobileCWV?.tbt}
Speed Index: ${mobileCWV?.speed_index}
TTI: ${mobileCWV?.tti}
Has Meta Description: ${mobileCWV?.has_meta_description}
Has HTML Lang: ${mobileCWV?.has_valid_lang}
Has Canonical Tag: ${mobileCWV?.has_canonical}
Image Alt Issues: ${mobileCWV?.image_alt_issues}
Render Blocking Resources: ${mobileCWV?.render_blocking}
Unused CSS Rules: ${mobileCWV?.unused_css}
Unused JavaScript: ${mobileCWV?.unused_js}

=== REAL PAGESPEED DATA (DESKTOP) ===
Performance Score: ${desktopCWV?.performance_score}/100
SEO Score: ${desktopCWV?.seo_score}/100

=== REAL WEBSITE CONTENT (CRAWLED LIVE) ===
${siteContent || 'Could not crawl content'}

Based strictly on the above real data, provide a JSON response with this exact structure:
{
  "overall_seo_health": number (0-100, based on real scores above),
  "mobile_performance": number (exact score from PageSpeed),
  "desktop_performance": number (exact score from PageSpeed),
  "seo_score": number (exact score from PageSpeed),
  "accessibility_score": number (exact score from PageSpeed),
  "best_practices_score": number (exact score from PageSpeed),
  "core_web_vitals": {
    "lcp": "exact value from data",
    "cls": "exact value from data",
    "fcp": "exact value from data",
    "tbt": "exact value from data",
    "tti": "exact value from data",
    "speed_index": "exact value from data"
  },
  "technical_issues": [
    "list only issues that are CONFIRMED TRUE from the data above"
  ],
  "confirmed_positives": [
    "list only things that are CONFIRMED GOOD from the data above"
  ],
  "top_3_priorities": [
    "most impactful fixes based on real data only"
  ],
  "page_title": "exact title found in crawled content or null",
  "has_meta_description": boolean (exact from data),
  "has_canonical": boolean (exact from data),
  "has_schema": boolean (check crawled content for schema.org or JSON-LD),
  "has_faq": boolean (check crawled content for FAQ section),
  "word_count": number (approximate from crawled content),
  "h1_count": number (count H1 tags in crawled content),
  "ai_summary": "2-3 sentence honest assessment based only on real data"
}

Return ONLY the JSON. No markdown, no explanation.
  `.trim();

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: analysisPrompt }],
    });

    const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const analysis = JSON.parse(cleaned);

    return res.status(200).json({
      success: true,
      url,
      fetched_at: new Date().toISOString(),
      source: 'Google PageSpeed Insights + Live Crawl',
      raw_scores: {
        mobile_performance: mobileCWV?.performance_score,
        desktop_performance: desktopCWV?.performance_score,
        seo: mobileCWV?.seo_score,
        accessibility: mobileCWV?.accessibility_score,
        best_practices: mobileCWV?.best_practices_score,
      },
      cwv: {
        lcp: mobileCWV?.lcp_lab,
        cls: mobileCWV?.cls_lab,
        fcp: mobileCWV?.fcp_lab,
        tbt: mobileCWV?.tbt,
        tti: mobileCWV?.tti,
        speed_index: mobileCWV?.speed_index,
        lcp_field_status: mobileCWV?.lcp_field,
        fid_field_status: mobileCWV?.fid_field,
        cls_field_status: mobileCWV?.cls_field,
      },
      analysis,
    });

  } catch (err) {
    // Return raw data even if AI analysis fails
    return res.status(200).json({
      success: true,
      url,
      fetched_at: new Date().toISOString(),
      source: 'Google PageSpeed Insights + Live Crawl',
      raw_scores: {
        mobile_performance: mobileCWV?.performance_score,
        desktop_performance: desktopCWV?.performance_score,
        seo: mobileCWV?.seo_score,
        accessibility: mobileCWV?.accessibility_score,
        best_practices: mobileCWV?.best_practices_score,
      },
      cwv: {
        lcp: mobileCWV?.lcp_lab,
        cls: mobileCWV?.cls_lab,
        fcp: mobileCWV?.fcp_lab,
      },
      analysis: null,
      error: 'AI analysis failed but raw scores are real',
    });
  }
}
