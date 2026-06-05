/* ════════════════════════════════════════════════════════════════
   api/lib/geo-citation-gap.ts

   BUILD 12.20 — AI Overview citation gap analysis utilities.

   When AI Overview cites competitors but not your site for a target
   query, the question is: WHY? This module fetches the cited pages,
   extracts their structural patterns (schema, headings, summary
   blocks, author signals, dated content), and compares against the
   project's own page to produce a specific gap report.

   The senior-DMS lens: structural patterns aren't the only thing
   driving citation, but they ARE the things a site can change. This
   module focuses on actionable patterns — what you can implement on
   your page in the next 4 weeks to start earning citation.

   Honest about limitations:
   - Pattern extraction is heuristic. Schema markup detection looks
     for ld+json blocks; FAQ detection looks for accordion-style HTML
     OR FAQPage schema. False negatives possible on SPAs that render
     content client-side.
   - "Citation correlation" is causally weaker than the language
     suggests — observed correlation, not proven mechanism. Reports
     should phrase recommendations as "patterns observed in cited
     pages" rather than "do this to get cited."
   - Sample sizes are small per query (typically 3-6 cited domains).
     A single query's patterns are anecdote; a project's aggregate
     across many queries is signal.
════════════════════════════════════════════════════════════════ */

import { fetchHtml } from "./workspace/shared.js";

export interface PagePattern {
  url:                   string;
  domain:                string;
  loaded:                boolean;
  /* Structural patterns the AI search models appear to weight */
  has_faq_schema:        boolean;   // FAQPage in ld+json
  has_article_schema:    boolean;   // Article / NewsArticle / TechArticle in ld+json
  has_howto_schema:      boolean;   // HowTo in ld+json
  has_author_byline:     boolean;   // rel=author OR Author schema OR visible "by [name]" attribution
  author_name:           string | null;
  has_credentials:       boolean;   // detected credentials/title text adjacent to author name
  has_last_updated:      boolean;   // visible date OR Article.dateModified in ld+json
  last_updated_date:     string | null;
  has_summary_top:       boolean;   // first paragraph 50-200 words, declarative
  summary_word_count:    number;
  has_qa_structure:      boolean;   // multiple H2/H3 headings phrased as questions
  qa_block_count:        number;
  has_tldr_block:        boolean;   // explicit "TL;DR" / "Summary" / "Key takeaways" block
  total_word_count:      number;
  schema_types:          string[];  // all ld+json @type values found
}

export interface CitationGapReport {
  query:                 string;
  project_domain:        string;
  project_url:           string | null;     // the project's page that would target this query
  cited_pages:           PagePattern[];
  project_page:          PagePattern | null;
  /* Patterns present in ALL cited pages (high-confidence signals) */
  universal_patterns:    string[];          // e.g. ["has_summary_top", "has_last_updated"]
  /* Patterns present in MAJORITY of cited pages (medium-confidence signals) */
  majority_patterns:     string[];
  /* Patterns present in cited pages but missing on the project page (the gaps) */
  gaps:                  Array<{ pattern: string; severity: "critical" | "important" | "suggested"; description: string; }>;
  /* 1-3 sentences a senior DMS would say about the gap */
  narrative:             string;
  /* Specific actions ranked by likely impact */
  recommended_actions:   string[];
  generated_at:          string;
}

/* ─── Pattern extraction from raw HTML ─────────────────────────── */

export function extractPagePattern(url: string, html: string | null): PagePattern {
  const domain = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  if (!html) {
    return {
      url, domain, loaded: false,
      has_faq_schema: false, has_article_schema: false, has_howto_schema: false,
      has_author_byline: false, author_name: null, has_credentials: false,
      has_last_updated: false, last_updated_date: null,
      has_summary_top: false, summary_word_count: 0,
      has_qa_structure: false, qa_block_count: 0,
      has_tldr_block: false,
      total_word_count: 0,
      schema_types: [],
    };
  }

  /* Schema markup extraction — find all ld+json blocks and parse @type */
  const schemaTypes = new Set<string>();
  let articleDateModified: string | null = null;
  const schemaBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of schemaBlocks) {
    try {
      const parsed = JSON.parse(m[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item) continue;
        const t = item["@type"];
        if (typeof t === "string") schemaTypes.add(t);
        else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") schemaTypes.add(x);
        /* Graph form */
        if (Array.isArray(item["@graph"])) {
          for (const g of item["@graph"]) {
            const gt = g?.["@type"];
            if (typeof gt === "string") schemaTypes.add(gt);
            else if (Array.isArray(gt)) for (const x of gt) if (typeof x === "string") schemaTypes.add(x);
            if (typeof g?.dateModified === "string") articleDateModified = g.dateModified;
          }
        }
        if (typeof item.dateModified === "string") articleDateModified = item.dateModified;
      }
    } catch { /* malformed JSON, skip */ }
  }
  const hasFaq    = schemaTypes.has("FAQPage");
  const hasArticle = schemaTypes.has("Article") || schemaTypes.has("NewsArticle") || schemaTypes.has("TechArticle") || schemaTypes.has("BlogPosting");
  const hasHowto  = schemaTypes.has("HowTo");

  /* Strip tags for textual analysis */
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = text ? text.split(/\s+/).length : 0;

  /* Author byline detection — multiple signals */
  const bylineMatches = html.match(/\b(by|written by|author[:\s]+|posted by)\s+([A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+){0,3})/i);
  const relAuthorMatch = /<a[^>]*rel=["'][^"']*author[^"']*["']/i.test(html);
  const authorSchema = schemaTypes.has("Person") || /"@type"\s*:\s*"Person"/.test(html);
  const hasAuthorByline = !!(bylineMatches || relAuthorMatch || authorSchema);
  const authorName = bylineMatches ? bylineMatches[2] : null;

  /* Credentials detection — look for credential markers near author area */
  const credentialMarkers = /\b(MD|PhD|DDS|FACS|JD|MBA|CFA|CPA|MS|MA|BS|BA|RN|LPC|LCSW|LMFT|Dr\.|Prof\.|Director|Manager|Lead|Senior|Specialist|Strategist|Consultant|Editor|Founder|CEO|CTO|VP)\b/;
  const hasCredentials = hasAuthorByline && credentialMarkers.test(html);

  /* Date detection — both visible dates and schema dateModified */
  const visibleDate = /\b(updated|last\s*(?:updated|modified|reviewed)|published)[^<]{0,40}?\b(20\d{2})\b/i.test(html);
  const hasLastUpdated = !!articleDateModified || visibleDate;

  /* Summary block detection — first paragraph 50-200 words, after H1 */
  let summaryWords = 0;
  const h1Match = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i);
  if (h1Match && h1Match.index != null) {
    const afterH1 = html.slice(h1Match.index + h1Match[0].length, h1Match.index + h1Match[0].length + 3000);
    const pMatch = afterH1.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch) {
      const pText = pMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      summaryWords = pText ? pText.split(/\s+/).length : 0;
    }
  }
  const hasSummaryTop = summaryWords >= 30 && summaryWords <= 250;

  /* Q-and-A structure detection — H2/H3 headings phrased as questions */
  const headingMatches = [...html.matchAll(/<h[2-3][^>]*>([\s\S]*?)<\/h[2-3]>/gi)];
  const questionHeadings = headingMatches.filter(m => {
    const t = m[1].replace(/<[^>]+>/g, "").trim();
    return /\?$/.test(t) || /^(how|what|when|where|why|who|which|can|do|does|should|is|are|will)\b/i.test(t);
  });
  const qaBlockCount = questionHeadings.length;
  const hasQaStructure = qaBlockCount >= 2 || hasFaq;

  /* TL;DR / Key takeaways block */
  const hasTldr = /\b(TL;DR|TLDR|Key takeaways|Summary|At a glance|Quick answer|In short)\b/i.test(html.slice(0, 5000));

  return {
    url, domain, loaded: true,
    has_faq_schema:     hasFaq,
    has_article_schema: hasArticle,
    has_howto_schema:   hasHowto,
    has_author_byline:  hasAuthorByline,
    author_name:        authorName,
    has_credentials:    hasCredentials,
    has_last_updated:   hasLastUpdated,
    last_updated_date:  articleDateModified,
    has_summary_top:    hasSummaryTop,
    summary_word_count: summaryWords,
    has_qa_structure:   hasQaStructure,
    qa_block_count:     qaBlockCount,
    has_tldr_block:     hasTldr,
    total_word_count:   wordCount,
    schema_types:       Array.from(schemaTypes),
  };
}

/* ─── Gap analysis across cited pages + project page ─────────── */

/* The patterns we evaluate. Each is a boolean field on PagePattern. */
const TRACKED_PATTERNS: Array<{ key: keyof PagePattern; label: string }> = [
  { key: "has_faq_schema",     label: "FAQPage schema markup" },
  { key: "has_article_schema", label: "Article schema markup" },
  { key: "has_howto_schema",   label: "HowTo schema markup" },
  { key: "has_author_byline",  label: "Named author byline" },
  { key: "has_credentials",    label: "Author credentials visible" },
  { key: "has_last_updated",   label: "Visible last-updated date" },
  { key: "has_summary_top",    label: "Summary paragraph at top (30-250 words)" },
  { key: "has_qa_structure",   label: "Q-and-A heading structure" },
  { key: "has_tldr_block",     label: "TL;DR / key takeaways block" },
];

export function computeCitationGap(opts: {
  query:           string;
  projectDomain:   string;
  projectPage:     PagePattern | null;
  citedPages:      PagePattern[];
}): CitationGapReport {
  const { query, projectDomain, projectPage, citedPages } = opts;
  const loaded = citedPages.filter(p => p.loaded);

  /* Determine which patterns are universal (all cited pages have it) vs.
     majority (≥50% of cited pages). Both are signal; universal is stronger. */
  const universal: string[] = [];
  const majority: string[] = [];
  if (loaded.length > 0) {
    for (const p of TRACKED_PATTERNS) {
      const presentCount = loaded.filter(page => Boolean(page[p.key])).length;
      if (presentCount === loaded.length) universal.push(p.key as string);
      else if (presentCount >= Math.ceil(loaded.length / 2)) majority.push(p.key as string);
    }
  }

  /* Identify gaps — patterns present in cited pages but missing on project page */
  const gaps: CitationGapReport["gaps"] = [];
  if (projectPage && projectPage.loaded) {
    for (const p of TRACKED_PATTERNS) {
      const isUniversal = universal.includes(p.key as string);
      const isMajority  = majority.includes(p.key as string);
      const presentOnProject = Boolean(projectPage[p.key]);
      if (!presentOnProject && (isUniversal || isMajority)) {
        gaps.push({
          pattern:     p.key as string,
          severity:    isUniversal ? "critical" : "important",
          description: `${p.label} — present on ${isUniversal ? "all" : "majority of"} cited pages, missing on your page.`,
        });
      }
    }
  }

  /* Senior-DMS narrative + actions */
  let narrative: string;
  const recommended_actions: string[] = [];
  if (loaded.length === 0) {
    narrative = `Could not fetch the cited pages for "${query}". Citation gap analysis requires successful fetches — try re-running, or check whether the cited domains block automated requests.`;
  } else if (!projectPage || !projectPage.loaded) {
    narrative = `Cited pages for "${query}" share ${universal.length} universal patterns and ${majority.length} majority patterns. Could not fetch your target page to compare directly — provide a target URL or check page reachability.`;
    for (const u of universal.slice(0, 5)) {
      const label = TRACKED_PATTERNS.find(t => t.key === u)?.label || u;
      recommended_actions.push(`Implement ${label} on your target page (universal in cited pages).`);
    }
  } else if (gaps.length === 0) {
    narrative = `Your page for "${query}" already matches all detected patterns from the cited competitors (${loaded.length} cited pages analyzed). The structural foundation is in place — citation gap is likely about topical authority, content depth, or entity association strength rather than page structure.`;
    recommended_actions.push(`Investigate non-structural factors: backlink profile of cited domains vs. yours, topical cluster depth, brand entity signals (Knowledge Graph presence, Wikipedia, mainstream press citations).`);
    recommended_actions.push(`Consider running the citation gap analysis on 5-10 additional related queries to see if the pattern recurs — single-query gaps can be noise; multi-query gaps are signal.`);
  } else {
    const critGaps = gaps.filter(g => g.severity === "critical");
    const impGaps  = gaps.filter(g => g.severity === "important");
    narrative = `For "${query}", AI Overview cites ${loaded.length} competitor pages that share ${universal.length} universal structural patterns. Your page has ${gaps.length} gaps (${critGaps.length} critical, ${impGaps.length} important). Closing the critical gaps is the highest-leverage move — these patterns are present in EVERY cited page in this sample.`;
    for (const g of critGaps) {
      const label = TRACKED_PATTERNS.find(t => t.key === g.pattern)?.label || g.pattern;
      recommended_actions.push(`CRITICAL: Add ${label} to your page. Present on all ${loaded.length} cited pages.`);
    }
    for (const g of impGaps) {
      const label = TRACKED_PATTERNS.find(t => t.key === g.pattern)?.label || g.pattern;
      recommended_actions.push(`Important: Consider adding ${label} to your page. Present on majority of cited pages.`);
    }
    if (recommended_actions.length > 0) {
      recommended_actions.push(`After implementation, allow 4-8 weeks for AI Overview to re-evaluate citation. Track citation status in subsequent workspace runs.`);
    }
  }

  return {
    query,
    project_domain: projectDomain,
    project_url:    projectPage?.url || null,
    cited_pages:    citedPages,
    project_page:   projectPage,
    universal_patterns: universal,
    majority_patterns:  majority,
    gaps,
    narrative,
    recommended_actions,
    generated_at: new Date().toISOString(),
  };
}

/* ─── Top-level orchestration: query → gap report ────────────── */

/* Fetch a page and extract its pattern. Handles errors as PagePattern
   with loaded:false. */
export async function fetchAndExtractPattern(url: string): Promise<PagePattern> {
  try {
    const html = await fetchHtml(url).catch(() => null);
    return extractPagePattern(url, html);
  } catch {
    return extractPagePattern(url, null);
  }
}

/* Run a full gap analysis: given the cited URLs and the project's target
   URL, fetch all in parallel and compose the report. */
export async function runCitationGapAnalysis(opts: {
  query:           string;
  projectDomain:   string;
  projectUrl:      string | null;
  citedUrls:       string[];
}): Promise<CitationGapReport> {
  const { query, projectDomain, projectUrl, citedUrls } = opts;

  /* Parallel fetches with overall 60s budget */
  const fetchPromises = [
    ...(projectUrl ? [fetchAndExtractPattern(projectUrl)] : []),
    ...citedUrls.slice(0, 8).map(u => fetchAndExtractPattern(u)),
  ];
  const results = await Promise.race([
    Promise.all(fetchPromises),
    new Promise<PagePattern[]>((res) => setTimeout(() => res([]), 60000)),
  ]) as PagePattern[];

  const projectPage = projectUrl ? results[0] || null : null;
  const citedPages  = (projectUrl ? results.slice(1) : results).filter(Boolean);

  return computeCitationGap({ query, projectDomain, projectPage, citedPages });
}
