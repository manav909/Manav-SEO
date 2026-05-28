/* ════════════════════════════════════════════════════════════════════
   api/lib/seo-url-targeting.ts
   Phase 21 — Block 2.5 — URL targeting + intent classification

   GOAL
     Turn input like "rank /products/alpha-anywhere/ for 'enterprise
     low-code platform'" into a validated, fit-analyzed campaign target
     mapping that pillars can rely on without re-fetching.

   PUBLIC SURFACE
     • classifyCampaignIntent(text)        — commitment | exploration | question
     • extractCampaignIntent(text)         — superset of extractKeywords
                                             returns { keywords[], target_urls[],
                                             keyword_url_mapping{} }
     • validateAndAnalyzeTargetUrls(...)   — fetches each URL, extracts real
                                             content, runs grounded fit analysis

   CORE PRINCIPLES
     • Every URL claim is grounded in a real fetch — never assert about an
       unfetched URL.
     • If a fetch fails, the report says so; the LLM never speculates.
     • Fit analysis sees real H1, first 500 chars of body, schema markers —
       not just URL strings.
     • All output is traceable: every claim cites its source (page fetch,
       LLM analysis with grounding, GSC data with refresh timestamp).
══════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

const FETCH_TIMEOUT_MS  = 12_000;
const FETCH_MAX_BYTES   = 2_500_000;
const PAGE_BODY_FOR_LLM = 500;          // chars of body text passed to fit LLM

const USER_AGENT = 'SEOSeason-Bot/1.0 (+https://seoseason.com; URL targeting fit analysis)';

/* ════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════ */

export type CampaignIntent = 'commitment' | 'exploration' | 'question' | 'objective';

/* ── Goal type patterns for objective commands ─────────────────
   User types things like:
   "grow traffic for /page1, /page2"
   "increase organic traffic to /beds"
   "fix technical issues on sleeplandbeds.co.uk"
   "improve DA"
   "rank for ottoman beds AND memory foam on /beds, /mattresses"
   "local visibility for London beds"
── */
export const OBJECTIVE_PATTERNS: Array<{
  re: RegExp;
  goalType: string;
}> = [
  { re: /^(?:grow|increase|boost|improve)\s+(?:organic\s+)?traffic\b/i,         goalType: 'traffic_growth' },
  { re: /^(?:get\s+)?more\s+(?:organic\s+)?(?:traffic|clicks|visitors)\b/i,     goalType: 'traffic_growth' },
  { re: /^(?:fix|resolve|recover|improve)\s+(?:technical|tech|core\s+web)\b/i,  goalType: 'technical_recovery' },
  { re: /^(?:technical\s+recovery|fix\s+(?:all\s+)?(?:technical|site))\b/i,     goalType: 'technical_recovery' },
  { re: /^(?:improve|build|grow|increase)\s+(?:domain\s+authority|da|dr|authority)\b/i, goalType: 'domain_authority' },
  { re: /^(?:local\s+(?:seo|visibility|rankings?)|rank(?:ing)?\s+(?:in|for)\s+(?:a\s+)?(?:city|location|area))\b/i, goalType: 'local_visibility' },
  { re: /^(?:rank\s+(?:in|for)\s+[a-z]+(?:,\s*[a-z]+)*|target\s+(?:local|city|location))\b/i, goalType: 'local_visibility' },
  { re: /^(?:improve|build|boost)\s+e[\-–]?e[\-–]?a[\-–]?t\b/i,               goalType: 'eeat' },
  { re: /^(?:improve|build)\s+(?:expertise|authority|trust|credibility)\b/i,    goalType: 'eeat' },
  { re: /^(?:build|grow|establish)\s+(?:topical\s+)?(?:content\s+)?authority\b/i, goalType: 'content_authority' },
  { re: /^rank\s+for\s+.+\s+(?:and|,)\s+.+\s+(?:on|for)\s+\//i,               goalType: 'keyword_ranking' }, // multi-keyword
];

export function parseObjectiveCommand(text: string): {
  goalType: string;
  keywords: string[];
  targetUrls: string[];
  location?: string;
} | null {
  const lc = text.trim();

  let goalType: string | null = null;
  for (const { re, goalType: gt } of OBJECTIVE_PATTERNS) {
    if (re.test(lc)) { goalType = gt; break; }
  }
  if (!goalType) return null;

  // Extract URLs — /path or https://...
  const urlMatches = lc.match(/(?:https?:\/\/[^\s,]+|\/[a-zA-Z0-9\-_/]+)/g) || [];
  const targetUrls = urlMatches.filter(u => u.length > 1);

  // Extract keywords — text in quotes
  const kwMatches = lc.match(/["']([^"']+)["']/g) || [];
  const keywords = kwMatches.map(k => k.replace(/["']/g, '').trim()).filter(Boolean);

  // Extract location for local_visibility
  let location: string | undefined;
  if (goalType === 'local_visibility') {
    const locMatch = lc.match(/(?:in|for)\s+([a-zA-Z\s]+?)(?:\s+(?:for|with|on|$))/i);
    if (locMatch) location = locMatch[1].trim();
  }

  return { goalType, keywords, targetUrls, location };
}

export interface CampaignIntentExtraction {
  keywords:             string[];
  target_urls:          string[];
  keyword_url_mapping:  Record<string, string>;     // keyword → URL
  intent_phrase:        string;
  used_llm_fallback:    boolean;
}

export interface UrlFitAnalysis {
  url:               string;
  fetched_at:        string;
  status_code:       number | null;
  status_text:       string;             // 'ok' | '404' | 'timeout' | 'noindex' | ...
  is_indexable:      boolean;
  h1:                string;
  title:             string;
  word_count:        number;
  body_snippet:      string;             // first ~500 chars for LLM grounding
  schema_types:      string[];
  fit_per_keyword:   Record<string, {
    verdict:         'strong_fit' | 'partial_fit' | 'poor_fit' | 'cannot_analyze';
    reasoning:       string;
    citations:       string[];           // citations from real page content
  }>;
  honest_note?:      string;
}

/* ════════════════════════════════════════════════════════════════════
   INTENT CLASSIFICATION

   Distinguishes:
     - commitment ("rank me for X" / "start a campaign for X") — run orchestrator
     - exploration ("what about X?" / "should I rank for X?") — run exploration
     - question ("how do I X?" / general) — pass to LLM brain
══════════════════════════════════════════════════════════════════════ */

export async function classifyCampaignIntent(text: string): Promise<{
  intent: CampaignIntent;
  confidence: 'high' | 'medium' | 'low';
  used_llm: boolean;
  matched_pattern?: string;
}> {
  const lc = (text || '').trim().toLowerCase();
  if (!lc) return { intent: 'question', confidence: 'low', used_llm: false };

  /* Fast regex path — high-confidence patterns */
  /* Objective patterns checked FIRST — they must win over commit patterns.
     "grow traffic", "fix technical issues" etc. must never become keyword campaigns. */
  for (const { re } of OBJECTIVE_PATTERNS) {
    if (re.test(lc)) {
      return { intent: 'objective', confidence: 'high', used_llm: false, matched_pattern: re.source };
    }
  }

  const COMMIT_PATTERNS = [
    /^rank\s+(?:me\s+)?for\b/,
    /^rank\s+(?:\/[^\s]+|https?:\/\/)/,                       // "rank /url/ for X"
    /^get\s+(?:me\s+)?ranking\s+for\b/,
    /^start\s+(?:a\s+)?campaign\s+for\b/,
    /^create\s+(?:a\s+)?campaign\s+for\b/,
    /^target\s+keywords?:?\s+/,
    /^seo\s+for\s+/,
    /^set\s+up\s+(?:a\s+)?campaign\b/,
  ];
  for (const re of COMMIT_PATTERNS) {
    if (re.test(lc)) {
      return { intent: 'commitment', confidence: 'high', used_llm: false, matched_pattern: re.source };
    }
  }

  const EXPLORE_PATTERNS = [
    /^what\s+about\s+/,
    /^should\s+i\s+(?:rank|target|pursue|go\s+after)\s+/,
    /^should\s+we\s+(?:rank|target|pursue|go\s+after)\s+/,
    /^(?:can|could)\s+(?:i|we)\s+rank\s+for\s+/,
    /^is\s+["'].*["']\s+worth\s+(?:going\s+after|pursuing|targeting)/,
    /^(?:tell|show)\s+me\s+about\s+(?:ranking|targeting)\s+/,
    /^explore\s+(?:ranking\s+for|the\s+keyword)/,
    /^worth\s+ranking\s+for\b/,
  ];
  for (const re of EXPLORE_PATTERNS) {
    if (re.test(lc)) {
      return { intent: 'exploration', confidence: 'high', used_llm: false, matched_pattern: re.source };
    }
  }

  /* Heuristic question patterns — let the existing LLM brain handle */
  if (/^(how|what|why|when|where|which)\s+/.test(lc) ||
      /\?\s*$/.test(lc) ||
      /^(explain|tell\s+me|help\s+me\s+understand|diagnose|summari[sz]e|verify)/.test(lc)) {
    return { intent: 'question', confidence: 'high', used_llm: false };
  }

  /* Ambiguous — fall through to LLM classifier */
  try {
    const classified = await classifyViaLlm(text);
    return { intent: classified, confidence: 'medium', used_llm: true };
  } catch {
    /* If LLM unavailable, default to 'question' so the existing brain handles it */
    return { intent: 'question', confidence: 'low', used_llm: false };
  }
}

async function classifyViaLlm(text: string): Promise<CampaignIntent> {
  const sys = `Classify the user's chat input into ONE of four intents:

- "objective": The user wants to set a strategic SEO objective (not a single keyword campaign).
  Examples: "grow traffic", "increase organic traffic", "fix technical issues", "improve DA",
  "boost domain authority", "local visibility for London", "improve E-E-A-T", "build content authority",
  "grow traffic for all pages", "increase organic clicks", "fix technical SEO", "recover traffic"

- "commitment": The user wants to start a keyword ranking campaign for a specific keyword.
  Examples: "rank me for X", "let's go after Y", "we're targeting Z", "set up SEO for X",
  "rank for ottoman beds", "get me ranking for best mattress"

- "exploration": The user is curious and wants to evaluate before committing.
  Examples: "what about X?", "is Y worth pursuing?", "should we go after Z?"

- "question": The user is asking a question or making a general statement.
  Examples: "how does SEO work?", "explain this audit", "what's our current ranking?"

Reply with ONLY one word: objective | commitment | exploration | question`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 20,
      system:     sys,
      messages:   [{ role: "user", content: text.slice(0, 500) }],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  const out = (data?.content?.[0]?.text || '').trim().toLowerCase();
  if (out.startsWith('objective'))  return 'objective';
  if (out.startsWith('commitment')) return 'commitment';
  if (out.startsWith('exploration')) return 'exploration';
  return 'question';
}

/* ════════════════════════════════════════════════════════════════════
   EXTRACTION — keywords + target URLs + per-keyword URL mapping

   Recognizes:
     - "rank /url/ for 'kw'"                        → 1 keyword, 1 URL, mapping
     - "rank /url/ for 'kw1' and 'kw2'"             → 2 keywords, 1 URL, both mapped
     - "rank for: /url-a/ — kw1, /url-b/ — kw2"     → 2 keywords, 2 URLs, mapping
     - "rank for kw1, kw2, kw3"                     → 3 keywords, no URLs (uses GSC default)
     - Newline-separated mapping pastes
══════════════════════════════════════════════════════════════════════ */

export async function extractCampaignIntent(rawInput: string): Promise<CampaignIntentExtraction> {
  const text = (rawInput || '').trim();
  if (!text) {
    return { keywords: [], target_urls: [], keyword_url_mapping: {}, intent_phrase: '', used_llm_fallback: false };
  }

  /* Detect intent phrase */
  const intentMatch = text.match(
    /^(rank\s+(?:me\s+)?for|ranking\s+(?:me\s+)?for|get\s+(?:me\s+)?ranking\s+for|target\s+keywords?|seo\s+for|start\s+(?:a\s+)?campaign\s+for|create\s+(?:a\s+)?campaign\s+for)[\s:]*/i
  );
  const intentPhrase = intentMatch ? intentMatch[0].trim().replace(/[\s:]+$/, '') : '';

  /* Special case: "rank /url/ for X" puts the URL between the verb and "for" */
  const rankUrlMatch = text.match(/^rank\s+(\/[^\s]+|https?:\/\/\S+)\s+for\s+(.+)$/i);
  if (rankUrlMatch) {
    const url = normalizeUrl(rankUrlMatch[1]);
    const keywordPart = rankUrlMatch[2].trim();
    const keywordsExtracted = await extractKeywordsDelegate(keywordPart);
    const mapping: Record<string, string> = {};
    if (url) {
      for (const kw of keywordsExtracted.keywords) mapping[kw] = url;
    }
    return {
      keywords:             keywordsExtracted.keywords,
      target_urls:          url ? [url] : [],
      keyword_url_mapping:  mapping,
      intent_phrase:        'rank for',
      used_llm_fallback:    keywordsExtracted.used_llm_fallback,
    };
  }

  /* Special case: "rank for X on https://url" — keyword comes before the URL */
  const rankForOnMatch = text.match(/^(?:rank\s+(?:me\s+)?for\s+|ranking\s+for\s+)(.+?)\s+on\s+(https?:\/\/\S+|\S+\.\S+\/\S*)$/i);
  if (rankForOnMatch) {
    const keywordPart = rankForOnMatch[1].trim();
    const urlPart     = rankForOnMatch[2].trim();
    const url = normalizeUrl(urlPart.startsWith('http') ? urlPart : `https://${urlPart}`);
    const keywordsExtracted = await extractKeywordsDelegate(keywordPart);
    const mapping: Record<string, string> = {};
    if (url) {
      for (const kw of keywordsExtracted.keywords) mapping[kw] = url;
    }
    return {
      keywords:            keywordsExtracted.keywords,
      target_urls:         url ? [url] : [],
      keyword_url_mapping: mapping,
      intent_phrase:       'rank for',
      used_llm_fallback:   keywordsExtracted.used_llm_fallback,
    };
  }

  /* Check for hub-and-spoke pattern: "/url — keyword" or "/url - keyword" or "/url : keyword" lines */
  const remainder = intentMatch ? text.slice(intentMatch[0].length).trim() : text;
  const hubSpokeLines = parseHubSpokeMapping(remainder);
  if (hubSpokeLines.length > 0) {
    const keywords = hubSpokeLines.map(l => l.keyword);
    const target_urls = Array.from(new Set(hubSpokeLines.map(l => l.url)));
    const mapping: Record<string, string> = {};
    for (const line of hubSpokeLines) mapping[line.keyword] = line.url;
    return {
      keywords,
      target_urls,
      keyword_url_mapping: mapping,
      intent_phrase:        intentPhrase,
      used_llm_fallback:    false,
    };
  }

  /* No URL targeting — delegate to the existing keyword extractor */
  const fallback = await extractKeywordsDelegate(remainder);
  return {
    keywords:             fallback.keywords,
    target_urls:          [],
    keyword_url_mapping:  {},
    intent_phrase:        intentPhrase,
    used_llm_fallback:    fallback.used_llm_fallback,
  };
}

async function extractKeywordsDelegate(text: string): Promise<{ keywords: string[]; used_llm_fallback: boolean }> {
  /* Delegate to seo-campaign-grouping's existing extractor */
  const { extractKeywordsFromText } = await import("./seo-campaign-grouping.js");
  const r = await extractKeywordsFromText(text);
  return { keywords: r.keywords, used_llm_fallback: r.used_llm_fallback };
}

function parseHubSpokeMapping(text: string): Array<{ url: string; keyword: string }> {
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];

  /* Strip a leading "for:" label if present */
  let working = lines;
  if (/^(?:for|targets?|keywords?)[\s:]*$/i.test(working[0])) {
    working = working.slice(1);
  }

  const out: Array<{ url: string; keyword: string }> = [];
  for (const line of working) {
    /* Patterns: "/url — keyword" or "/url - keyword" or "/url : keyword" */
    const m = line.match(/^(\/[^\s—\-:]+|https?:\/\/\S+)\s*[—\-:]\s*(.+)$/);
    if (m) {
      const url = normalizeUrl(m[1]);
      const keyword = cleanKeyword(m[2]);
      if (url && keyword) {
        out.push({ url, keyword });
        continue;
      }
    }
    /* Reverse pattern: "keyword → /url" */
    const m2 = line.match(/^(.+?)\s*(?:—|->|→|\u2192)\s*(\/\S+|https?:\/\/\S+)$/);
    if (m2) {
      const keyword = cleanKeyword(m2[1]);
      const url = normalizeUrl(m2[2]);
      if (url && keyword) {
        out.push({ url, keyword });
        continue;
      }
    }
  }
  return out;
}

function normalizeUrl(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim().replace(/[,;.]+$/, '');
  /* Path-only URLs (start with /) are kept as-is — caller resolves to full URL using project domain */
  if (trimmed.startsWith('/')) return trimmed;
  /* Absolute URL — keep as-is */
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '';
}

function cleanKeyword(raw: string): string {
  return (raw || '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[?!.]+$/, '')
    .trim()
    .toLowerCase();
}

/* ════════════════════════════════════════════════════════════════════
   URL VALIDATION + FIT ANALYSIS

   For each (URL, keyword) pair:
     1. Fetch the URL — real HTTP request
     2. Extract title, H1, body snippet, word count, schema types
     3. If fetch failed: record honest failure, no fit analysis
     4. If fetched: run grounded fit LLM call passing real content
     5. LLM cites specific content from the page as evidence
══════════════════════════════════════════════════════════════════════ */

export async function validateAndAnalyzeTargetUrls(opts: {
  projectId:           string;
  projectDomain?:      string;
  urlKeywordMapping:   Record<string, string>;     // keyword → URL
  positioning?:        any;
}): Promise<{
  fit_analyses:        Record<string, UrlFitAnalysis>;   // keyed by URL
  any_blocking_issue:  boolean;
  warnings:            string[];
}> {
  const { urlKeywordMapping } = opts;
  const urls = Array.from(new Set(Object.values(urlKeywordMapping)));
  if (urls.length === 0) {
    return { fit_analyses: {}, any_blocking_issue: false, warnings: [] };
  }

  /* Get project domain for path → absolute URL resolution */
  let projectDomain = opts.projectDomain;
  if (!projectDomain) {
    try {
      const { data } = await db().from("projects")
        .select("client_url").eq("id", opts.projectId).maybeSingle();
      projectDomain = (data as any)?.client_url || undefined;
    } catch { /* swallow */ }
  }

  const fitAnalyses: Record<string, UrlFitAnalysis> = {};
  const warnings: string[] = [];
  let anyBlocking = false;

  /* Per-URL grouping: collect all keywords pointing to each URL */
  const keywordsPerUrl: Record<string, string[]> = {};
  for (const [kw, url] of Object.entries(urlKeywordMapping)) {
    if (!keywordsPerUrl[url]) keywordsPerUrl[url] = [];
    keywordsPerUrl[url].push(kw);
  }

  /* Process URLs in parallel — bounded concurrency */
  await Promise.all(urls.map(async (url) => {
    const fullUrl = resolveFullUrl(url, projectDomain);
    const fetchResult = await fetchAndExtract(fullUrl);

    if (!fetchResult.ok) {
      fitAnalyses[url] = {
        url,
        fetched_at:      new Date().toISOString(),
        status_code:     fetchResult.status_code,
        status_text:     fetchResult.status_text,
        is_indexable:    false,
        h1:              '',
        title:           '',
        word_count:      0,
        body_snippet:    '',
        schema_types:    [],
        fit_per_keyword: Object.fromEntries(
          keywordsPerUrl[url].map(kw => [kw, {
            verdict:    'cannot_analyze' as const,
            reasoning:  `Cannot analyze fit — URL fetch failed: ${fetchResult.status_text}`,
            citations:  [],
          }])
        ),
        honest_note: `URL fetch failed (${fetchResult.status_text}). No content available for grounded fit analysis. ${url === '/(unresolvable)' ? 'URL could not be resolved to absolute form — provide project_domain or use absolute URL.' : ''}`,
      };
      anyBlocking = true;
      warnings.push(`URL ${url} could not be fetched: ${fetchResult.status_text}`);
      return;
    }

    /* Run grounded fit analysis for each keyword targeting this URL */
    const fitPerKeyword: UrlFitAnalysis['fit_per_keyword'] = {};
    for (const kw of keywordsPerUrl[url]) {
      try {
        const fit = await analyzeUrlKeywordFit({
          url,
          keyword:     kw,
          title:       fetchResult.title,
          h1:          fetchResult.h1,
          bodySnippet: fetchResult.body_snippet,
          schemaTypes: fetchResult.schema_types,
          positioning: opts.positioning,
        });
        fitPerKeyword[kw] = fit;
        if (fit.verdict === 'poor_fit') {
          warnings.push(`Page "${url}" is a poor fit for "${kw}" — ${fit.reasoning.slice(0, 100)}`);
        }
      } catch (e: any) {
        fitPerKeyword[kw] = {
          verdict:   'cannot_analyze',
          reasoning: `Fit analysis failed: ${e?.message || 'LLM error'}`,
          citations: [],
        };
      }
    }

    fitAnalyses[url] = {
      url,
      fetched_at:      new Date().toISOString(),
      status_code:     fetchResult.status_code,
      status_text:     fetchResult.status_text,
      is_indexable:    fetchResult.is_indexable,
      h1:              fetchResult.h1,
      title:           fetchResult.title,
      word_count:      fetchResult.word_count,
      body_snippet:    fetchResult.body_snippet,
      schema_types:    fetchResult.schema_types,
      fit_per_keyword: fitPerKeyword,
    };

    if (!fetchResult.is_indexable) {
      anyBlocking = true;
      warnings.push(`URL ${url} fetched but is not indexable (meta robots: noindex). Pages cannot rank if noindexed.`);
    }
  }));

  return { fit_analyses: fitAnalyses, any_blocking_issue: anyBlocking, warnings };
}

function resolveFullUrl(url: string, projectDomain?: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (!projectDomain) return '/(unresolvable)';
  const base = projectDomain.replace(/\/$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}

async function fetchAndExtract(url: string): Promise<{
  ok:            boolean;
  status_code:   number | null;
  status_text:   string;
  is_indexable:  boolean;
  title:         string;
  h1:            string;
  body_snippet:  string;
  word_count:    number;
  schema_types:  string[];
}> {
  if (url === '/(unresolvable)') {
    return { ok: false, status_code: null, status_text: 'unresolvable_path', is_indexable: false, title: '', h1: '', body_snippet: '', word_count: 0, schema_types: [] };
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
      signal:  AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok) {
      return { ok: false, status_code: res.status, status_text: `http_${res.status}`, is_indexable: false, title: '', h1: '', body_snippet: '', word_count: 0, schema_types: [] };
    }

    const reader = res.body?.getReader();
    if (!reader) {
      return { ok: false, status_code: res.status, status_text: 'no_body', is_indexable: false, title: '', h1: '', body_snippet: '', word_count: 0, schema_types: [] };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > FETCH_MAX_BYTES) { try { reader.cancel(); } catch {} break; }
      chunks.push(value);
    }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks.map(c => Buffer.from(c.buffer, c.byteOffset, c.byteLength))));

    /* Extract title */
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeHtml(titleMatch[1]).trim().slice(0, 300) : '';

    /* Extract first H1 */
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h1 = h1Match ? decodeHtml(stripTags(h1Match[1])).trim().slice(0, 300) : '';

    /* Check robots meta — is_indexable */
    const robotsMatch = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i);
    const robotsContent = robotsMatch ? robotsMatch[1].toLowerCase() : '';
    const is_indexable = !robotsContent.includes('noindex');

    /* Extract body text — strip tags, scripts, styles */
    let body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    body = stripTags(body);
    body = decodeHtml(body).replace(/\s+/g, ' ').trim();
    const word_count = body.split(/\s+/).filter(w => w.length > 0).length;
    const body_snippet = body.slice(0, PAGE_BODY_FOR_LLM);

    /* Extract schema.org types from JSON-LD */
    const schema_types: string[] = [];
    const ldMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const m of ldMatches) {
      try {
        const jsonText = m.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
        const parsed = JSON.parse(jsonText);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const it of items) {
          const t = it?.['@type'];
          if (typeof t === 'string') schema_types.push(t);
          else if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') schema_types.push(x);
        }
      } catch { /* ignore malformed */ }
    }

    return {
      ok:            true,
      status_code:   res.status,
      status_text:   'ok',
      is_indexable,
      title,
      h1,
      body_snippet,
      word_count,
      schema_types:  Array.from(new Set(schema_types)).slice(0, 10),
    };
  } catch (e: any) {
    const msg = e?.name === 'AbortError' || /timeout/i.test(e?.message || '') ? 'timeout' : (e?.message || 'fetch_error');
    return { ok: false, status_code: null, status_text: msg, is_indexable: false, title: '', h1: '', body_snippet: '', word_count: 0, schema_types: [] };
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ');
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

/* ════════════════════════════════════════════════════════════════════
   FIT ANALYSIS LLM CALL — strictly grounded in real page content
══════════════════════════════════════════════════════════════════════ */

async function analyzeUrlKeywordFit(opts: {
  url:           string;
  keyword:       string;
  title:         string;
  h1:            string;
  bodySnippet:   string;
  schemaTypes:   string[];
  positioning?:  any;
}): Promise<UrlFitAnalysis['fit_per_keyword'][string]> {
  const sys = `You are a senior SEO strategist evaluating whether a page can credibly rank for a specific keyword.

HARD RULES:
- You will see the page's REAL content (title, H1, first 500 chars of body, schema types).
- Base your verdict ONLY on what's actually in the content provided. Do NOT speculate about the rest of the page.
- For "citations": quote specific phrases from the title/H1/body that support your verdict. If you can't cite specific content, the verdict is "cannot_analyze".
- Verdicts:
    "strong_fit"     = page content clearly serves the keyword's intent; user landing here from that search would feel they found the right page
    "partial_fit"    = page has topical overlap but doesn't fully match the keyword's intent
    "poor_fit"       = page content does not serve the keyword's intent; user would bounce
    "cannot_analyze" = insufficient content to judge

OUTPUT — strict JSON only, no preamble:
{
  "verdict": "strong_fit | partial_fit | poor_fit | cannot_analyze",
  "reasoning": "1-2 sentences explaining the verdict",
  "citations": ["specific phrase from the page content", "another phrase"]
}`;

  const positioningContext = opts.positioning
    ? `\n\nProject positioning context:\n  Client segment: ${opts.positioning.client_segment}\n  Competitive tier: ${opts.positioning.competitive_tier}\n  Topical authority: ${(opts.positioning.topical_authority_strengths || []).join(', ')}`
    : '';

  const user = `Keyword: "${opts.keyword}"

Page URL: ${opts.url}
Page title: ${opts.title || '(no title tag)'}
Page H1: ${opts.h1 || '(no H1)'}
Schema types: ${opts.schemaTypes.length > 0 ? opts.schemaTypes.join(', ') : '(none)'}
Page body (first ${PAGE_BODY_FOR_LLM} chars): ${opts.bodySnippet || '(empty body)'}${positioningContext}

Evaluate whether THIS page can credibly rank for THIS keyword. Cite specific content phrases.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 600,
      system:     sys,
      messages:   [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  const text = (data?.content?.[0]?.text || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(cleaned);

  const verdict: any = ['strong_fit', 'partial_fit', 'poor_fit', 'cannot_analyze'].includes(parsed.verdict)
    ? parsed.verdict : 'cannot_analyze';
  return {
    verdict,
    reasoning: String(parsed.reasoning || '').slice(0, 600),
    citations: Array.isArray(parsed.citations)
      ? parsed.citations.filter((c: any) => typeof c === 'string').slice(0, 5)
      : [],
  };
}
