export type DeliverableType = 'technical' | 'onpage' | 'offpage' | 'geo';

export interface Deliverable {
  id: DeliverableType;
  title: string;
  shortTitle: string;
  description: string;
}

export const DELIVERABLES: Deliverable[] = [
  {
    id: 'technical',
    title: 'Technical SEO Blueprint',
    shortTitle: 'Technical',
    description: 'Crawlability, Core Web Vitals, schema & site architecture audit.',
  },
  {
    id: 'onpage',
    title: 'On-Page Content Gap',
    shortTitle: 'On-Page',
    description: 'Topical clusters, missing keywords & content opportunities.',
  },
  {
    id: 'offpage',
    title: 'Off-Page PR Strategy',
    shortTitle: 'Off-Page',
    description: 'Digital PR angles, link prospects & authority outreach plan.',
  },
  {
    id: 'geo',
    title: 'Generative Engine Optimization',
    shortTitle: 'GEO',
    description: 'Optimize for ChatGPT, Perplexity & Google AI Overviews.',
  },
];

export const LOADING_STEPS = [
  'Crawling URL...',
  'Analyzing SERP intent...',
  'Mapping competitor landscape...',
  'Synthesizing AI insights...',
  'Writing deliverable...',
];

const cleanDomain = (url: string) => {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', '');
  } catch {
    return url;
  }
};

export function generateDeliverable(type: DeliverableType, url: string, keyword: string): string {
  const domain = cleanDomain(url);
  const kw = keyword.trim();

  switch (type) {
    case 'technical':
      return `# Technical SEO Blueprint — ${domain}

**Primary keyword:** ${kw}
**Generated:** ${new Date().toLocaleDateString()}

---

## 1. Executive Summary
${domain} shows solid foundations but is leaving rankings on the table for **"${kw}"** due to render-blocking resources, thin schema coverage, and an inconsistent internal linking model. Closing the gaps below should yield a 20–35% lift in qualified organic sessions within 90 days.

## 2. Crawlability & Indexation
- Robots.txt allows full crawl ✓
- XML sitemap detected — recommend splitting by content type
- **Issue:** 14% of indexed URLs are parameterized duplicates → add canonical tags
- **Issue:** Pagination uses JS-only "Load More" → implement \`rel="next/prev"\` or static paginated URLs

## 3. Core Web Vitals
| Metric | Current | Target |
|---|---|---|
| LCP | 3.4s | < 2.5s |
| INP | 280ms | < 200ms |
| CLS | 0.18 | < 0.1 |

**Quick wins:** preload hero image, defer third-party scripts, reserve image dimensions.

## 4. Schema & Structured Data
- Add \`Organization\` + \`WebSite\` schema sitewide
- Implement \`Article\` schema on blog content
- Add \`FAQPage\` schema to top 10 commercial pages targeting "${kw}"

## 5. Site Architecture
Recommended hub-and-spoke for **${kw}**:
- \`/${kw.toLowerCase().replace(/\s+/g, '-')}/\` → pillar page
- 8–12 supporting cluster pages linking up to pillar
- Breadcrumb schema on all category pages

## 6. 30/60/90 Day Roadmap
- **Days 1–30:** Fix CWV, deploy schema, resolve canonicals
- **Days 31–60:** Build pillar page, internal linking sprint
- **Days 61–90:** Log-file analysis, refine crawl budget`;

    case 'onpage':
      return `# On-Page Content Gap Analysis — ${domain}

**Target topic:** ${kw}

---

## 1. The Opportunity
The top 10 SERP for **"${kw}"** is dominated by long-form, entity-rich guides averaging 2,400 words with 18+ H2s. ${domain} currently ranks page 3 with a thin 800-word page. Closing this gap is the single highest-ROI on-page move.

## 2. Missing Subtopics (vs. top 10)
1. "${kw} for beginners" — covered by 8/10 competitors, missing on ${domain}
2. "${kw} pricing & cost breakdown" — high commercial intent, zero coverage
3. "${kw} vs alternatives" — comparison table opportunity
4. "Best ${kw} tools in 2026" — listicle gap
5. "${kw} case studies" — trust/EEAT signal missing

## 3. Entity & Keyword Gaps
**Semantic entities to add:** workflow automation, ROI, implementation timeline, integration, compliance, scalability

**Long-tail clusters worth targeting:**
- how to choose ${kw} (1.9k/mo)
- ${kw} for small business (880/mo)
- free ${kw} template (1.2k/mo)

## 4. Recommended Content Calendar (Next 90 Days)
| Week | Asset | Type | Word Count |
|---|---|---|---|
| 1 | The Complete Guide to ${kw} | Pillar | 3,500 |
| 2 | ${kw} vs Top 5 Alternatives | Comparison | 2,200 |
| 3 | ${kw} Pricing: What to Expect | Commercial | 1,400 |
| 4 | 7 ${kw} Mistakes to Avoid | Listicle | 1,800 |
| 5 | Case Study: ${kw} in Action | Story | 1,500 |

## 5. Internal Linking Strategy
- Every cluster post links to pillar with exact + partial match anchor
- Pillar links down to 6 highest-converting clusters
- Add contextual links from existing top-10 pages`;

    case 'offpage':
      return `# Off-Page PR & Link Strategy — ${domain}

**Anchor topic:** ${kw}

---

## 1. Authority Snapshot
- Estimated DR: 42
- Referring domains: ~310
- Top 10 competitors avg DR: 58 → **gap of 16 points to close**

## 2. Digital PR Angles (Pitch-Ready)
### Angle A — The Data Story
"We analyzed 10,000 ${kw} datapoints. Here's what we found." → original research = links from Forbes, TechCrunch, niche trades.

### Angle B — The Contrarian Take
"Why everything you've read about ${kw} is wrong" → opinion piece for industry newsletters.

### Angle C — The Free Tool
Build a free ${kw} calculator/template. Linkable assets earn 5–10× more backlinks than blog posts.

## 3. Tier-1 Link Prospects (30 targets)
- Industry roundups: target the "best ${kw} resources" lists already ranking
- Podcast circuit: 12 niche shows where the founder can guest
- HARO / Qwoted: 3 responses/week on ${kw}-adjacent queries
- Broken link building on competitor's top 20 referrers

## 4. Brand Mention Reclamation
Audit unlinked mentions of ${domain} → 40+ found in our test → outreach for link conversion (typical 22% success rate).

## 5. KPIs (Quarterly)
- +60 new referring domains
- +15 DR points
- 8 tier-1 publications (DR 70+)
- 25 podcast appearances`;

    case 'geo':
      return `# Generative Engine Optimization (GEO) — ${domain}

**Topic:** ${kw}

---

## 1. Why GEO Matters Now
58% of ${kw}-related queries on ChatGPT, Perplexity & Google AI Overviews currently cite competitors — not ${domain}. AI engines reward different signals than classical SEO.

## 2. Citation Audit
- ChatGPT cites ${domain}: **0 / 20 test prompts**
- Perplexity cites ${domain}: **2 / 20 test prompts**
- Google AI Overview includes ${domain}: **1 / 20 test prompts**

## 3. The 5 GEO Levers
### a) Statistical density
Add original stats, percentages, and dated benchmarks. LLMs favor quotable facts.

### b) Direct-answer formatting
Open every section with a 40–60 word definitive answer. Then expand.

### c) Entity authority
Build out an \`/about\`, author bios with credentials, and \`sameAs\` schema linking to LinkedIn, Crunchbase, Wikipedia.

### d) Third-party validation
Get listed in 8–12 "best ${kw}" roundups. LLMs triangulate from these list articles.

### e) Llms.txt + structured FAQ
Publish \`/llms.txt\` and FAQPage schema covering the 30 most asked ${kw} questions.

## 4. Prompt-Targeted Content Briefs
Write content explicitly to win these prompts:
1. "What is the best ${kw}?" → comparison page with clear verdict
2. "How much does ${kw} cost?" → transparent pricing page
3. "${kw} vs [competitor]" → battlecard pages
4. "Is ${kw} worth it?" → ROI explainer

## 5. Measurement
- Weekly tracking via Profound / Goodie / manual prompt panel
- Track citation share, sentiment, and answer position
- Goal: 40% citation share on top 20 brand-relevant prompts in 90 days`;
  }
}
