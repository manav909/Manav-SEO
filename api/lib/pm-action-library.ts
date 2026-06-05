/* ════════════════════════════════════════════════════════════════
   api/lib/pm-action-library.ts
   Phase 1L — What-If Simulator: catalog of SEO/Content actions.

   Each action is a structured object with:
   - Identity (id, name, category)
   - User-facing description + evidence basis
   - Inputs the action needs (page URL, query, count, etc.)
   - Impact model: ranges for clicks/impressions/position/CTR/conversions
   - Timeline curve: when impact is realized (immediate / 30d / 60d / 90d)
   - Effort estimate and confidence

   The library is static — versioned in code rather than the DB so
   updates ship via deploy and stay consistent across projects.

   Smart suggestions in pm-scenario-engine.ts use `applicableWhen` to
   filter actions to those relevant to the project's current state.
═══════════════════════════════════════════════════════════════ */

export type ActionCategory = "content" | "onpage" | "technical" | "links" | "ux" | "strategy" | "geo";

export type ActionConfidence = "high" | "medium" | "low";

export type InputType = "page_url" | "query" | "number" | "text" | "select" | "page_list";

export interface ActionInputDef {
  key:          string;
  label:        string;
  type:         InputType;
  required:     boolean;
  helperText?:  string;
  options?:     string[];
  defaultValue?:string;
  min?:         number;
  max?:         number;
}

/* Impact range — percent or absolute. `basis` documents what we
   assumed for the projection (so the PM understands the math). */
export interface ImpactRange {
  min:    number;        /* worst-realistic-case */
  max:    number;        /* best-realistic-case */
  basis:  string;        /* short justification ("Sistrix 2023 CTR study, position 4-10 segment") */
  unit:   "percent" | "absolute" | "position_delta";
}

export interface ImpactModel {
  clicks?:      ImpactRange;
  impressions?: ImpactRange;
  position?:    ImpactRange;     /* negative = improvement (lower position) */
  ctr?:         ImpactRange;
  conversions?: ImpactRange;
  visibility?:  ImpactRange;     /* impression-share weighted */
}

export interface TimelineCurve {
  immediate:    number;  /* 0..1 — share of full impact realized immediately */
  day_30:       number;
  day_60:       number;
  day_90:       number;
  notes:        string;
}

export interface SeoAction {
  id:               string;
  category:         ActionCategory;
  name:             string;
  shortDescription: string;
  fullDescription:  string;
  inputs:           ActionInputDef[];
  impact:           ImpactModel;
  timeline:         TimelineCurve;
  effortHours:      number;
  confidence:       ActionConfidence;
  costSummary:      string;
  evidence:         string;
  /** Trigger conditions — each entry is a "selector" the smart-suggest engine
   *  parses to decide whether to surface this action. See pm-scenario-engine.ts. */
  applicableWhen:   string[];
  /** Prerequisites the PM should verify before applying */
  prerequisites?:   string[];
}

/* ─── The catalog ───────────────────────────────────────────── */

export const SEO_ACTION_LIBRARY: SeoAction[] = [

  /* ───────── ON-PAGE OPTIMIZATION ──────────────────────────── */
  {
    id:    "optimize_title_tag",
    category: "onpage",
    name: "Optimize title tag",
    shortDescription: "Rewrite a page's <title> to better match search intent and earn more clicks at the same ranking position.",
    fullDescription: "A well-crafted title tag is the single biggest CTR lever available without changing rankings. Include the primary keyword in the first 60 characters, lead with the benefit, and use power words sparingly. Targets pages ranking #4-#15 with high impressions but low CTR vs. position benchmark.",
    inputs: [
      { key: "target_page", label: "Page URL", type: "page_url", required: true, helperText: "The page whose title you're rewriting" },
      { key: "current_title", label: "Current title", type: "text", required: false },
      { key: "proposed_title", label: "Proposed new title", type: "text", required: false },
    ],
    impact: {
      clicks: { min: 5, max: 25, basis: "When CTR is materially below position benchmark, title rewrites lift clicks 5-25% in 7-14 days. Sistrix 2023 data on CTR-by-position gap.", unit: "percent" },
      ctr:    { min: 10, max: 35, basis: "CTR lift is directly proportional to the gap between current CTR and position benchmark.", unit: "percent" },
    },
    timeline: { immediate: 0.2, day_30: 0.85, day_60: 1.0, day_90: 1.0, notes: "Google must recrawl + reindex (typically 1-14 days) then CTR data accumulates." },
    effortHours: 1,
    confidence: "high",
    costSummary: "1 hour, no spend",
    evidence: "Sistrix CTR-by-position study (2023): position 4-10 has wide CTR variance (3.5%–18%) driven primarily by title quality.",
    applicableWhen: ["kpi:ctr_vs_benchmark:concern", "kpi:ctr_vs_benchmark:critical", "rising_stars:page_2_to_1"],
    prerequisites: ["Verify the proposed title matches search intent for the primary query"],
  },

  {
    id:    "rewrite_meta_description",
    category: "onpage",
    name: "Rewrite meta description",
    shortDescription: "Refresh the snippet that appears below the title in SERPs. Pure CTR play.",
    fullDescription: "Meta descriptions don't influence rankings but they substantially influence CTR when Google chooses to use them (~30% of the time for most pages, higher for branded/informational queries). A compelling description with a clear benefit and CTA can lift CTR 5-15%.",
    inputs: [
      { key: "target_page", label: "Page URL", type: "page_url", required: true },
      { key: "proposed_description", label: "Proposed description (max 155 chars)", type: "text", required: false },
    ],
    impact: {
      clicks: { min: 3, max: 12, basis: "Industry CTR lift when meta description quality improves on pages where Google uses it (~30%).", unit: "percent" },
      ctr:    { min: 5, max: 18, basis: "Conditional on Google using it. Compelling CTAs (e.g. 'Learn more', '...in 2 minutes') consistently outperform passive descriptions.", unit: "percent" },
    },
    timeline: { immediate: 0.1, day_30: 0.7, day_60: 1.0, day_90: 1.0, notes: "Recrawl 1-14 days, then CTR data accumulates." },
    effortHours: 0.5,
    confidence: "medium",
    costSummary: "30 min, no spend",
    evidence: "Studies vary — Backlinko reports 5.8% CTR lift; Ahrefs reports negligible. Best evidence: high-impression queries where current description is generic.",
    applicableWhen: ["kpi:ctr_vs_benchmark:concern"],
  },

  {
    id:    "add_faq_section",
    category: "content",
    name: "Add FAQ section with schema",
    shortDescription: "Append a structured FAQ block to a page targeting question queries. Targets PAA + featured snippets.",
    fullDescription: "Adds 5-10 frequently-asked questions to a page with FAQPage schema markup. Two effects: (1) eligibility for People Also Ask boxes and FAQ-rich-results in SERPs, (2) signals topical depth to algorithms. Most effective on pages already ranking page 1-2 for informational queries.",
    inputs: [
      { key: "target_page", label: "Page URL", type: "page_url", required: true },
      { key: "question_count", label: "Number of FAQs", type: "number", required: true, min: 3, max: 15, defaultValue: "8" },
    ],
    impact: {
      clicks: { min: 8, max: 30, basis: "When FAQ rich result is granted (~25% chance for question-style queries), CTR lifts dramatically. Conservative because grant is conditional.", unit: "percent" },
      visibility: { min: 5, max: 20, basis: "Schema markup increases SERP real estate even when not fully featured.", unit: "percent" },
    },
    timeline: { immediate: 0.05, day_30: 0.6, day_60: 0.9, day_90: 1.0, notes: "Schema must be discovered + validated. PAA/featured-snippet eligibility evaluated over weeks." },
    effortHours: 3,
    confidence: "medium",
    costSummary: "3 hours (content + dev), no spend",
    evidence: "Google announced FAQ rich results in 2019; saw 30-100% CTR increase for granted pages. Conservative because the grant is not guaranteed.",
    applicableWhen: ["kpi:serp_feature_opportunity:good", "kpi:serp_feature_opportunity:excellent", "rising_stars:any"],
  },

  {
    id:    "add_internal_links",
    category: "links",
    name: "Add internal links to target page",
    shortDescription: "Pass authority from high-traffic pages to a specific target page via contextual links.",
    fullDescription: "Add 5-15 contextual internal links from relevant high-authority pages (your top 10 by impressions/clicks) pointing to the target page. Anchor text should be descriptive and varied. Most effective when the target page ranks position 4-20 — typical lift is 1-3 positions over 30-60 days.",
    inputs: [
      { key: "target_page", label: "Target page (to receive links)", type: "page_url", required: true },
      { key: "link_count", label: "Number of new internal links", type: "number", required: true, min: 3, max: 30, defaultValue: "8" },
      { key: "anchor_strategy", label: "Anchor text strategy", type: "select", required: true,
        options: ["Primary keyword exact", "Keyword variants", "Branded + keyword", "Natural language phrases"], defaultValue: "Keyword variants" },
    ],
    impact: {
      position: { min: -3, max: -1, basis: "Mid-page rankings respond most. Empirically 1-3 position lift for pages currently #4-#20.", unit: "position_delta" },
      clicks:   { min: 15, max: 80, basis: "Position improvements compound with rank-based CTR. Bigger improvement when current position is page 2.", unit: "percent" },
    },
    timeline: { immediate: 0.1, day_30: 0.5, day_60: 0.85, day_90: 1.0, notes: "Recrawl + reweight. PageRank propagation takes weeks." },
    effortHours: 2,
    confidence: "high",
    costSummary: "2 hours, no spend",
    evidence: "Ahrefs internal link studies (2020, 2022): pages receiving 10+ new contextual internal links see 14% average CTR lift via position improvements.",
    applicableWhen: ["rising_stars:any", "rising_stars:page_2_to_1", "rising_stars:page_3_to_2", "kpi:click_concentration:concern", "kpi:click_concentration:critical"],
    prerequisites: ["Source pages must be topically relevant — random links from off-topic pages don't help"],
  },

  {
    id:    "refresh_content",
    category: "content",
    name: "Refresh existing content",
    shortDescription: "Update an existing page with current data, expanded coverage, and better structure.",
    fullDescription: "A 'content refresh' updates a stale page: latest stats, current screenshots, expanded sections, better H2 structure, current internal/external links. Most effective on falling stars (queries that lost clicks/positions) and pages ranking #5-#20 where content depth is the gap. Google rewards 'freshness' signals.",
    inputs: [
      { key: "target_page", label: "Page URL", type: "page_url", required: true },
      { key: "refresh_depth", label: "Refresh depth", type: "select", required: true,
        options: ["Light (stats + dates)", "Medium (sections + structure)", "Major (rewrite + expand 30%+)"], defaultValue: "Medium (sections + structure)" },
    ],
    impact: {
      position: { min: -8, max: -1, basis: "Pages position #11-20 see largest lift (avg 3-8 positions). Position 4-10 see 1-3. Top 3 rarely move.", unit: "position_delta" },
      clicks:   { min: 25, max: 200, basis: "Wide range because position 11→5 is bigger than 5→3 in CTR terms.", unit: "percent" },
      impressions: { min: 10, max: 50, basis: "Refresh expands query coverage as new sub-topics added.", unit: "percent" },
    },
    timeline: { immediate: 0.1, day_30: 0.6, day_60: 0.9, day_90: 1.0, notes: "Crawl + reindex + ranking re-evaluation cycle typically 2-6 weeks." },
    effortHours: 4,
    confidence: "high",
    costSummary: "4-8 hours (content writer + editor), no spend",
    evidence: "Backlinko's 2020 content refresh study: refreshed posts saw +260% traffic. Animalz: 51% of analyzed sites saw measurable traffic gains within 60 days.",
    applicableWhen: ["falling_stars:any", "falling_stars:warning", "falling_stars:critical", "rising_stars:page_2_to_1", "rising_stars:page_3_to_2", "kpi:position_volatility:concern", "kpi:position_volatility:critical"],
  },

  {
    id:    "consolidate_cannibalized_pages",
    category: "content",
    name: "Consolidate cannibalized pages",
    shortDescription: "Merge two competing pages targeting the same query into one canonical asset.",
    fullDescription: "When two pages both rank for the same query, neither gets full authority — Google splits ranking signals. Consolidate: pick the stronger page, redirect (301) the weaker, merge unique content, and update internal links. Typical result: 1-3 position improvement for the consolidated page.",
    inputs: [
      { key: "winner_page", label: "Keep (winner)", type: "page_url", required: true },
      { key: "loser_page", label: "Redirect (loser)", type: "page_url", required: true },
      { key: "target_query", label: "Shared query", type: "query", required: true },
    ],
    impact: {
      position: { min: -3, max: -1, basis: "Authority consolidation typically yields 1-3 position lift over 30-60d.", unit: "position_delta" },
      clicks:   { min: 20, max: 100, basis: "Combines previous splits. Position improvement amplifies.", unit: "percent" },
    },
    timeline: { immediate: 0.0, day_30: 0.6, day_60: 1.0, day_90: 1.0, notes: "Recrawl required for 301 + reweight. 30-60 days." },
    effortHours: 3,
    confidence: "high",
    costSummary: "3 hours (dev + content), no spend",
    evidence: "Moz, Ahrefs, and SEMrush all document significant lift from consolidation. Most material when both pages have meaningful clicks.",
    applicableWhen: ["cannibalization:any"],
    prerequisites: ["Confirm both pages target the SAME search intent. If different intents, keep both."],
  },

  /* ───────── TECHNICAL SEO ─────────────────────────────────── */
  {
    id:    "improve_core_web_vitals",
    category: "technical",
    name: "Fix Core Web Vitals",
    shortDescription: "Address LCP, CLS, INP failures on pages flagged 'needs improvement' or 'poor'.",
    fullDescription: "Core Web Vitals is a confirmed ranking factor since 2021. Pages failing CWV face a small but real algorithmic penalty (~3% position drag on average). Fix: optimize hero images (LCP), reserve image dimensions (CLS), reduce main-thread blocking JS (INP). PageSpeed Insights gives a per-page checklist.",
    inputs: [
      { key: "scope", label: "Scope", type: "select", required: true,
        options: ["All failing pages", "Top 10 by traffic", "Top 50 by traffic", "Specific pages"], defaultValue: "Top 10 by traffic" },
      { key: "target_pages", label: "Specific pages (if applicable)", type: "page_list", required: false },
    ],
    impact: {
      position: { min: -1, max: -0.3, basis: "CWV is a tiebreaker ranking factor. Small but consistent lift.", unit: "position_delta" },
      visibility: { min: 2, max: 8, basis: "Mostly via position improvement on the affected pages.", unit: "percent" },
    },
    timeline: { immediate: 0.0, day_30: 0.4, day_60: 0.8, day_90: 1.0, notes: "Field CWV data accumulates over 28 days, then signals propagate." },
    effortHours: 16,
    confidence: "medium",
    costSummary: "16-40 hours (dev work) depending on scope. Significant.",
    evidence: "Google's CWV ranking factor confirmation (2021). Sistrix and Searchmetrics post-CWV studies show small but persistent uplift for pages moving from 'poor' to 'good'.",
    applicableWhen: ["kpi:position_volatility:concern", "kpi:position_volatility:critical", "kpi:algorithm_resilience:concern"],
  },

  {
    id:    "fix_indexation_issues",
    category: "technical",
    name: "Fix indexation issues",
    shortDescription: "Get blocked / orphaned / duplicate pages crawled and indexed properly.",
    fullDescription: "Audit GSC Coverage report. Common issues: pages excluded via 'noindex', pages blocked by robots.txt that shouldn't be, pages with no internal links (orphaned), pages canonicalized to wrong URL. Fixing these unlocks impression-earning pages that were invisible.",
    inputs: [
      { key: "expected_pages_added", label: "Expected pages to add to index", type: "number", required: true, min: 5, max: 5000, defaultValue: "50" },
    ],
    impact: {
      impressions: { min: 5, max: 30, basis: "Proportional to how many newly-indexed pages match queries.", unit: "percent" },
      clicks: { min: 3, max: 20, basis: "Long-tail traffic from newly-indexed pages.", unit: "percent" },
    },
    timeline: { immediate: 0.0, day_30: 0.6, day_60: 0.9, day_90: 1.0, notes: "Crawl + index cycle. Larger sites take longer." },
    effortHours: 8,
    confidence: "medium",
    costSummary: "8-16 hours (audit + dev fixes)",
    evidence: "GSC Coverage report fixes are well-documented to recover lost traffic. Magnitude depends on how many genuinely-useful pages were blocked.",
    applicableWhen: ["kpi:indexation_efficiency:concern", "kpi:indexation_efficiency:critical"],
  },

  {
    id:    "add_xml_sitemap",
    category: "technical",
    name: "Submit XML sitemap to GSC",
    shortDescription: "Ensure all relevant pages are listed in an XML sitemap submitted via GSC.",
    fullDescription: "An XML sitemap helps Google discover and prioritize pages. Particularly impactful for sites with deep architecture or pages without strong internal-link paths. Submit via GSC Sitemaps report.",
    inputs: [
      { key: "sitemap_url", label: "Sitemap URL", type: "text", required: true, defaultValue: "https://yoursite.com/sitemap.xml" },
    ],
    impact: {
      impressions: { min: 2, max: 10, basis: "Most useful when previously-undiscovered pages exist. Smaller effect on well-linked sites.", unit: "percent" },
    },
    timeline: { immediate: 0.0, day_30: 0.7, day_60: 1.0, day_90: 1.0, notes: "Discovery + crawl cycle." },
    effortHours: 1,
    confidence: "low",
    costSummary: "1 hour",
    evidence: "GSC discovery boost varies widely. Most material for new/large sites.",
    applicableWhen: ["kpi:indexation_efficiency:concern"],
  },

  /* ───────── CONTENT / TOPIC EXPANSION ─────────────────────── */
  {
    id:    "build_topic_cluster",
    category: "content",
    name: "Build supporting content cluster",
    shortDescription: "Create 5-10 supporting articles around a top-performing 'pillar' page.",
    fullDescription: "Topic clusters establish topical authority. Identify your best-performing money page, then create 5-10 articles answering related sub-questions, all linking back to the pillar. Builds search visibility for the entire cluster + reinforces the pillar's authority.",
    inputs: [
      { key: "pillar_page", label: "Pillar page", type: "page_url", required: true },
      { key: "cluster_size", label: "Number of supporting articles", type: "number", required: true, min: 3, max: 20, defaultValue: "8" },
    ],
    impact: {
      impressions: { min: 30, max: 150, basis: "New pages add new query coverage. Scale with cluster size.", unit: "percent" },
      clicks:      { min: 20, max: 120, basis: "Combined: new page traffic + pillar lift from internal links.", unit: "percent" },
      visibility:  { min: 15, max: 60, basis: "Topical depth signal reinforces all cluster pages.", unit: "percent" },
    },
    timeline: { immediate: 0.0, day_30: 0.25, day_60: 0.6, day_90: 0.85, notes: "Content publishing + ranking ramp typically 60-120 days." },
    effortHours: 40,
    confidence: "high",
    costSummary: "40-80 hours (writer + editor + design)",
    evidence: "HubSpot's topic cluster model (2017) — original adopters saw 50%+ traffic lift to pillar pages within 6 months.",
    applicableWhen: ["kpi:click_concentration:concern", "kpi:click_concentration:critical", "kpi:topic_depth:concern", "kpi:query_breadth:concern"],
  },

  {
    id:    "create_comparison_page",
    category: "content",
    name: "Create comparison / vs page",
    shortDescription: "Build 'X vs Y' or 'Best X for Y' page targeting commercial-investigation queries.",
    fullDescription: "Comparison pages target high-intent, late-funnel queries with strong conversion potential. 'BrandA vs BrandB', 'Best [product] for [use case]', 'Top alternatives to X'. Often easier to rank than head terms because competition is more fragmented.",
    inputs: [
      { key: "primary_subject", label: "Primary subject", type: "text", required: true, helperText: "Your brand or product" },
      { key: "comparison_target", label: "Compared to (competitor or category)", type: "text", required: true },
    ],
    impact: {
      conversions: { min: 30, max: 200, basis: "Commercial-investigation queries convert 5-15× better than informational.", unit: "percent" },
      clicks:      { min: 5, max: 30, basis: "Lower volume than head terms but higher quality.", unit: "percent" },
    },
    timeline: { immediate: 0.0, day_30: 0.35, day_60: 0.7, day_90: 0.9, notes: "Indexation + ranking ramp + accumulation of click data." },
    effortHours: 6,
    confidence: "high",
    costSummary: "6-12 hours (writer + design)",
    evidence: "Ahrefs commercial-keyword studies: comparison queries have 30-100% higher conversion rates than top-funnel queries at similar volume.",
    applicableWhen: ["kpi:conversion_velocity:concern", "kpi:brand_vs_nonbrand:concern"],
  },

  {
    id:    "answer_paa_questions",
    category: "content",
    name: "Answer People Also Ask questions",
    shortDescription: "Add explicit Q&A sections to pages, targeting visible PAA boxes.",
    fullDescription: "For each top-ranking page, identify the People Also Ask questions Google shows for the primary query, then explicitly answer them on the page with H3 headings and concise answers (40-60 words each). High chance of capturing PAA placements.",
    inputs: [
      { key: "target_page", label: "Page URL", type: "page_url", required: true },
      { key: "question_count", label: "PAA questions to answer", type: "number", required: true, min: 3, max: 10, defaultValue: "5" },
    ],
    impact: {
      visibility: { min: 10, max: 35, basis: "Each captured PAA placement = additional SERP visibility.", unit: "percent" },
      clicks:     { min: 5, max: 25, basis: "PAA expansions earn clicks even when not the primary result.", unit: "percent" },
    },
    timeline: { immediate: 0.05, day_30: 0.5, day_60: 0.85, day_90: 1.0, notes: "Recrawl + PAA eligibility review." },
    effortHours: 2,
    confidence: "medium",
    costSummary: "2-3 hours (research + writing)",
    evidence: "Search Engine Journal PAA studies (2023): pages answering PAA questions in identical phrasing capture PAA placements ~40% of the time.",
    applicableWhen: ["kpi:serp_feature_opportunity:good", "kpi:serp_feature_opportunity:excellent"],
  },

  /* ───────── BACKLINKS / OFF-PAGE ───────────────────────────── */
  {
    id:    "build_quality_backlinks",
    category: "links",
    name: "Build N quality backlinks",
    shortDescription: "Earn or build authoritative inbound links to a target page.",
    fullDescription: "Quality > quantity. Target sites with DR/DA 50+, topical relevance, and editorial standards. Methods: digital PR, guest posts on relevant publications, broken-link building, HARO. Each quality link can lift a target page's primary keyword by 0.5-2 positions.",
    inputs: [
      { key: "target_page", label: "Target page (to receive links)", type: "page_url", required: true },
      { key: "link_count", label: "Number of new backlinks", type: "number", required: true, min: 1, max: 50, defaultValue: "5" },
      { key: "quality_tier", label: "Quality tier", type: "select", required: true,
        options: ["Tier 1 (DR 70+)", "Tier 2 (DR 50-70)", "Tier 3 (DR 30-50)"], defaultValue: "Tier 2 (DR 50-70)" },
    ],
    impact: {
      position: { min: -5, max: -1, basis: "Per quality link. Diminishing returns past 10 links for same target.", unit: "position_delta" },
      clicks:   { min: 30, max: 250, basis: "Position improvements compound. Effect plateaus.", unit: "percent" },
    },
    timeline: { immediate: 0.0, day_30: 0.3, day_60: 0.7, day_90: 1.0, notes: "Discovery + reweight cycle. Big sites can lag 60-90 days." },
    effortHours: 20,
    confidence: "medium",
    costSummary: "20-100 hours OR £/$ 500-5000 if outsourced",
    evidence: "Ahrefs studies consistently show strong correlation between referring domains and rankings. Tier-1 links have material impact.",
    applicableWhen: ["rising_stars:page_2_to_1", "kpi:algorithm_resilience:concern"],
    prerequisites: ["Avoid spammy networks — Google's link-quality classifiers detect them"],
  },

  {
    id:    "reclaim_unlinked_mentions",
    category: "links",
    name: "Reclaim unlinked brand mentions",
    shortDescription: "Find sites mentioning your brand without linking and request a link.",
    fullDescription: "Use Ahrefs/Mention/Google Alerts to find places where your brand is mentioned without a hyperlink. Outreach to add a link. Conversion rate is high (~30-50%) because the relationship is already friendly.",
    inputs: [
      { key: "monthly_outreach", label: "Outreach volume per month", type: "number", required: true, min: 5, max: 100, defaultValue: "20" },
    ],
    impact: {
      position: { min: -1, max: -0.3, basis: "Steady stream of medium-authority links lifts overall domain authority.", unit: "position_delta" },
      visibility: { min: 3, max: 12, basis: "Cumulative DA effect across all pages.", unit: "percent" },
    },
    timeline: { immediate: 0.0, day_30: 0.4, day_60: 0.7, day_90: 0.95, notes: "Outreach + acceptance cycle 2-6 weeks per batch." },
    effortHours: 8,
    confidence: "medium",
    costSummary: "8-12 hours/month",
    evidence: "Backlinko's link-reclamation playbook reports 30-50% success rate — highest of any backlink-acquisition method.",
    applicableWhen: ["kpi:brand_vs_nonbrand:good", "kpi:brand_vs_nonbrand:excellent"],
  },

  /* ───────── UX / CONVERSION ────────────────────────────────── */
  {
    id:    "reduce_bounce_landing_pages",
    category: "ux",
    name: "Optimize top landing pages for engagement",
    shortDescription: "Improve scannability, page speed, and above-the-fold relevance on top landing pages.",
    fullDescription: "High bounce rate signals poor query-intent match. Fixes: clearer H1 matching the query, lift the answer above the fold, faster perceived load (skeleton states, no LCP image jank), reduce CLS, add 'is this what you're looking for?' content cues.",
    inputs: [
      { key: "target_pages", label: "Top landing pages (top 10)", type: "page_list", required: false },
    ],
    impact: {
      conversions: { min: 15, max: 80, basis: "Lowering bounce 10-30% on top pages typically lifts conversions 15-80%.", unit: "percent" },
      ctr:         { min: 0, max: 5, basis: "Indirect: engagement signals influence CTR for branded follow-up searches.", unit: "percent" },
    },
    timeline: { immediate: 0.2, day_30: 0.7, day_60: 0.95, day_90: 1.0, notes: "Bounce/conversion data accumulates 30-60 days for statistical confidence." },
    effortHours: 12,
    confidence: "medium",
    costSummary: "12-24 hours (UX + dev)",
    evidence: "ConversionXL bounce-rate studies: 10-point reduction in bounce typically correlates with 30%+ conversion lift.",
    applicableWhen: ["kpi:engagement_quality:concern", "kpi:engagement_quality:critical", "kpi:conversion_velocity:concern"],
  },

  {
    id:    "add_clear_cta",
    category: "ux",
    name: "Add clear CTAs to top content pages",
    shortDescription: "Add prominent, intent-matched CTAs to top-traffic informational pages.",
    fullDescription: "Many high-traffic content pages have weak or hidden CTAs. Add prominent, contextually-relevant CTAs (not generic 'Sign up!' — specific 'Book your audit', 'Get the template'). Track via conversions or events.",
    inputs: [
      { key: "target_pages", label: "Pages (top traffic, low conversion)", type: "page_list", required: false },
      { key: "cta_text", label: "Proposed CTA text", type: "text", required: false },
    ],
    impact: {
      conversions: { min: 25, max: 150, basis: "Adding a strong CTA where there was none typically doubles conversion on that page.", unit: "percent" },
    },
    timeline: { immediate: 0.3, day_30: 0.85, day_60: 1.0, day_90: 1.0, notes: "Immediate effect once published." },
    effortHours: 4,
    confidence: "high",
    costSummary: "4-8 hours (design + dev)",
    evidence: "HubSpot CTA studies: pages without CTAs have ~0% conversion; pages with strong CTAs have 2-10% conversion. Adding = doubling at minimum.",
    applicableWhen: ["kpi:conversion_velocity:concern", "kpi:conversion_velocity:critical"],
  },

  /* ───────── BRAND / STRATEGY ──────────────────────────────── */
  {
    id:    "launch_brand_content_series",
    category: "strategy",
    name: "Launch brand-building content series",
    shortDescription: "Multi-month content series targeting branded + thought-leadership queries.",
    fullDescription: "When brand vs non-brand split is too skewed to algorithm-driven traffic, invest in brand. Series of 6-12 hero pieces: data studies, opinion content, original research. Build defensible authority that survives algorithm changes.",
    inputs: [
      { key: "series_count", label: "Number of pieces", type: "number", required: true, min: 4, max: 24, defaultValue: "8" },
      { key: "cadence_weeks", label: "Cadence (weeks between pieces)", type: "number", required: true, min: 1, max: 8, defaultValue: "2" },
    ],
    impact: {
      visibility: { min: 10, max: 40, basis: "Compound effect over 6-12 months.", unit: "percent" },
      conversions: { min: 5, max: 30, basis: "Brand-aware traffic converts 2-3× better.", unit: "percent" },
    },
    timeline: { immediate: 0.0, day_30: 0.1, day_60: 0.3, day_90: 0.55, notes: "Long-tail compounding effect. Plateaus at 6-12 months." },
    effortHours: 80,
    confidence: "medium",
    costSummary: "80-160 hours over the series",
    evidence: "First Round Review-style content builds defensible audience. Effective but slow.",
    applicableWhen: ["kpi:brand_vs_nonbrand:concern", "kpi:algorithm_resilience:concern"],
  },

  {
    id:    "diversify_traffic_channels",
    category: "strategy",
    name: "Diversify traffic channels",
    shortDescription: "Build email, social, or community channels to reduce single-channel risk.",
    fullDescription: "When channel diversification score is low, invest in second-channel growth: email newsletter (capture from top pages), LinkedIn/Twitter audience, community/Discord, podcast. Pulls some traffic dependence away from Google.",
    inputs: [
      { key: "channel", label: "Secondary channel", type: "select", required: true,
        options: ["Email newsletter", "LinkedIn", "Twitter / X", "Community / Discord", "Podcast", "YouTube"], defaultValue: "Email newsletter" },
    ],
    impact: {
      visibility: { min: 5, max: 25, basis: "Indirect — diversifies traffic sources. Doesn't directly lift organic.", unit: "percent" },
    },
    timeline: { immediate: 0.0, day_30: 0.1, day_60: 0.25, day_90: 0.5, notes: "Audience-building is a multi-quarter exercise." },
    effortHours: 100,
    confidence: "low",
    costSummary: "100+ hours over months. Significant investment.",
    evidence: "First Round, Stratechery, Lenny's: examples of strong second-channel businesses with low Google dependence.",
    applicableWhen: ["kpi:channel_diversification:concern", "kpi:channel_diversification:critical"],
  },

  /* ───────── QUERY-SPECIFIC TACTICAL ──────────────────────── */
  {
    id:    "target_rising_star_query",
    category: "onpage",
    name: "Push rising-star query to page 1",
    shortDescription: "Targeted action set on a single query trending up in impressions but not yet ranking strong.",
    fullDescription: "Bundle of micro-actions on the page ranking for a rising-star query: tighten H2s to include query phrasing, add a 60-word direct answer above the fold, add 2-3 internal links from related top pages, ensure schema markup. Designed to convert ranking momentum into clicks.",
    inputs: [
      { key: "target_query", label: "Rising-star query", type: "query", required: true },
      { key: "target_page", label: "Page ranking for it", type: "page_url", required: true },
    ],
    impact: {
      position: { min: -8, max: -2, basis: "Most effective when query is already moving up. Compounds existing momentum.", unit: "position_delta" },
      clicks:   { min: 80, max: 400, basis: "Page 2→1 moves are dramatic. Position 11→5 typically 3-5× click lift.", unit: "percent" },
    },
    timeline: { immediate: 0.1, day_30: 0.6, day_60: 0.95, day_90: 1.0, notes: "Recrawl + ranking adjustment 14-30 days." },
    effortHours: 3,
    confidence: "high",
    costSummary: "3-5 hours (content + dev)",
    evidence: "Rising-star queries already have Google's interest. Marginal effort yields disproportionate result.",
    applicableWhen: ["rising_stars:any"],
  },

  {
    id:    "recover_falling_query",
    category: "content",
    name: "Recover falling query",
    shortDescription: "Diagnose + fix a query losing clicks or position.",
    fullDescription: "For a query that dropped >30%, investigate cause: SERP feature change, competitor outranked, content staleness, intent shift. Then apply targeted fix: refresh content, regain backlinks if lost, address SERP feature if applicable.",
    inputs: [
      { key: "target_query", label: "Falling query", type: "query", required: true },
      { key: "target_page", label: "Affected page", type: "page_url", required: true },
      { key: "suspected_cause", label: "Suspected cause", type: "select", required: false,
        options: ["Competitor outranked", "SERP feature consuming clicks", "Content stale", "Intent shifted", "Unknown"] },
    ],
    impact: {
      clicks:   { min: 30, max: 150, basis: "Recovery rate depends on cause. Full recovery possible for content/link issues.", unit: "percent" },
      position: { min: -5, max: -1, basis: "Conditional on cause being addressable.", unit: "position_delta" },
    },
    timeline: { immediate: 0.0, day_30: 0.4, day_60: 0.8, day_90: 1.0, notes: "Investigation + fix + recrawl cycle." },
    effortHours: 5,
    confidence: "medium",
    costSummary: "5-10 hours (investigation + fix)",
    evidence: "Falling-query playbook is well-documented. Success rate ~70% when cause is content/link related.",
    applicableWhen: ["falling_stars:any", "falling_stars:warning", "falling_stars:critical"],
  },

  /* ───────── BULK / SYSTEMATIC ─────────────────────────────── */
  {
    id:    "title_audit_bulk",
    category: "onpage",
    name: "Bulk title-tag audit & rewrite",
    shortDescription: "Systematic rewrite of titles for 20-50 top pages with poor CTR vs benchmark.",
    fullDescription: "Audit top 50 pages by impressions, compare each CTR to position benchmark, identify the 20-30 with biggest gaps, rewrite titles. Compounds the optimize_title_tag action across the site's top traffic-earning pages.",
    inputs: [
      { key: "page_count", label: "Pages to rewrite", type: "number", required: true, min: 10, max: 100, defaultValue: "30" },
    ],
    impact: {
      clicks: { min: 12, max: 35, basis: "Site-wide CTR lift when poor performers are addressed in bulk.", unit: "percent" },
      ctr:    { min: 15, max: 40, basis: "Averaged across affected pages.", unit: "percent" },
    },
    timeline: { immediate: 0.1, day_30: 0.7, day_60: 0.95, day_90: 1.0, notes: "Crawl + index of all changes over 2-4 weeks." },
    effortHours: 20,
    confidence: "high",
    costSummary: "20-40 hours (audit + writer + QA)",
    evidence: "Same CTR study basis as single-title optimization, applied at scale.",
    applicableWhen: ["kpi:ctr_vs_benchmark:concern", "kpi:ctr_vs_benchmark:critical"],
  },

  {
    id:    "prune_low_quality_pages",
    category: "content",
    name: "Prune low-quality pages",
    shortDescription: "Delete or noindex pages that earn no clicks and dilute site authority.",
    fullDescription: "Thin or zero-traffic pages dilute crawl budget and overall site authority. Identify pages that have <5 clicks in 90 days AND <100 impressions. Decide per page: delete (redirect to relevant page), noindex (keep for users but not search), or improve.",
    inputs: [
      { key: "prune_count", label: "Pages to prune", type: "number", required: true, min: 10, max: 1000, defaultValue: "50" },
    ],
    impact: {
      position: { min: -1, max: -0.2, basis: "Removing low-quality lift the overall topical signal — modest position lift on retained pages.", unit: "position_delta" },
      visibility: { min: 2, max: 10, basis: "Crawl efficiency + topical focus signal.", unit: "percent" },
    },
    timeline: { immediate: 0.0, day_30: 0.4, day_60: 0.7, day_90: 0.9, notes: "Recrawl + reweight." },
    effortHours: 10,
    confidence: "medium",
    costSummary: "10-20 hours (audit + execution)",
    evidence: "Backlinko, SEMrush content audits: pruning thin content typically lifts site-wide traffic 5-15% over 60 days.",
    applicableWhen: ["kpi:indexation_efficiency:concern", "kpi:indexation_efficiency:critical"],
  },

  /* ───────── GEO / AI-ERA ACTIONS (Build 12.20) ─────────────────
     Each action wired to geo:* triggers scaffolded in Build 12.19.
     These earn AI Overview citations + AI platform referrals by
     restructuring content to match the patterns the AI search models
     recognize as citation-worthy. Honest about confidence: AI search
     citation is genuinely newer territory than classic SEO, so most
     actions sit at "medium" confidence with explicit caveats. */
  {
    id:    "add_faq_schema_for_geo",
    category: "geo",
    name: "Add FAQ schema to citation-target pages",
    shortDescription: "Structure page content as Q-and-A with FAQPage schema markup — the format AI Overview models preferentially cite.",
    fullDescription: "AI Overview citation analysis across the niche shows cited pages share three structural patterns at very high rates: explicit Q-and-A formatting, FAQPage schema markup, and concise answer paragraphs. Adding FAQPage schema to pages targeting informational queries makes them substantially more legible to the AI Overview model and to AI platforms (Perplexity, ChatGPT, Gemini) that increasingly cite from structured data.",
    inputs: [
      { key: "target_page", label: "Page URL to add FAQ schema to", type: "page_url", required: true },
      { key: "target_queries", label: "Queries the page targets (comma-separated)", type: "text", required: false, helperText: "Used to suggest Q-and-A pairs based on People-Also-Ask data" },
    ],
    impact: {
      visibility: { min: 5, max: 25, basis: "Cited pages in AI Overview show FAQPage schema at 60-80% rates in observed samples. Adding it to a page without is foundational. Effect compounds with topical authority.", unit: "percent" },
      clicks:     { min: 2, max: 15, basis: "When AI Overview begins citing the page, traffic from AI surfaces appears (ChatGPT, Perplexity referrals) in addition to classic organic clicks.", unit: "percent" },
    },
    timeline: { immediate: 0.05, day_30: 0.3, day_60: 0.5, day_90: 0.7, notes: "Citation patterns shift over weeks-to-months — AI search models are slower to re-evaluate than classic ranking signals." },
    effortHours: 2,
    confidence: "medium",
    costSummary: "1-3 hours (content restructuring + schema implementation)",
    evidence: "GEO research 2025 (Princeton, Allen Institute): structured Q-and-A content earns AI citation at 2-5x the rate of unstructured prose. Aleph Alpha, SearchGPT citation analyses show FAQPage schema correlates with citation rate.",
    applicableWhen: ["geo:ai_overview_absent", "geo:ai_platform_zero"],
    prerequisites: ["Page targets informational queries (not purely navigational/transactional)", "Page has at least one query showing in GSC with AI Overview SERP feature"],
  },

  {
    id:    "add_summary_paragraph_for_geo",
    category: "geo",
    name: "Add summary paragraph at top of citation-target pages",
    shortDescription: "Lead each citation-target page with a 60-100 word summary paragraph that directly answers the primary query.",
    fullDescription: "AI Overview models extract their citation snippet from the first 100-300 words of cited pages roughly 70% of the time (observed across SerpAPI samples). A clear, declarative summary paragraph at the top of the page — answering the primary query in 2-3 sentences — substantially increases citation likelihood. The paragraph should: (1) restate the query in declarative form, (2) give the concise answer, (3) reference the supporting detail to follow.",
    inputs: [
      { key: "target_page",  label: "Page URL", type: "page_url", required: true },
      { key: "primary_query", label: "Primary query the page targets", type: "text", required: true },
      { key: "proposed_summary", label: "Proposed 60-100 word summary paragraph", type: "text", required: false },
    ],
    impact: {
      visibility: { min: 8, max: 30, basis: "Summary-first structure observed in 65-85% of AI Overview cited pages. Adding it is a structural foundation for citation eligibility.", unit: "percent" },
      ctr:        { min: 3, max: 12, basis: "Even when not cited, summary-first pages perform better on classic SERP CTR because the meta description gets a stronger source paragraph.", unit: "percent" },
    },
    timeline: { immediate: 0.1, day_30: 0.4, day_60: 0.7, day_90: 0.85, notes: "Recrawl 1-14 days, then citation patterns shift over weeks." },
    effortHours: 1,
    confidence: "medium",
    costSummary: "30-60 min per page (writing) + recrawl",
    evidence: "AI citation pattern studies 2024-2025 (multiple): cited paragraphs cluster in first 100-300 words at 70%+ frequency. Princeton GEO study confirms position weighting in extraction.",
    applicableWhen: ["geo:ai_overview_absent"],
    prerequisites: ["Page has a primary query identified"],
  },

  {
    id:    "displace_geo_citation_competitor",
    category: "geo",
    name: "Plan AI Overview citation displacement push",
    shortDescription: "Identify which competitor domains take your AI Overview citation slots for target queries, audit their content patterns, and replicate the strongest patterns on your pages.",
    fullDescription: "When AI Overview cites competitors but not you for a query, the displacement path is structural: the cited pages share patterns the AI model recognizes. The displacement workflow: (1) run citation gap analysis on the query → get cited URLs, (2) fetch and analyze each cited page for structural patterns (schema, headings, author bios, dated content, FAQ blocks, summary paragraphs), (3) identify the 2-3 patterns present in all cited pages but missing from yours, (4) implement those patterns on your target page, (5) wait 4-8 weeks for AI Overview to re-evaluate. Citation displacement is slower than ranking displacement but more stable once earned.",
    inputs: [
      { key: "target_query", label: "Query where citation displacement is needed", type: "text", required: true },
      { key: "target_page",  label: "Your page to optimize", type: "page_url", required: true },
    ],
    impact: {
      visibility: { min: 15, max: 50, basis: "When citation displacement succeeds, the site enters the citation list (typically 3-6 cited domains per query) — substantial AI surface presence.", unit: "percent" },
      clicks:     { min: 5, max: 25, basis: "AI surface presence drives both AI platform referral traffic AND classic CTR uplift because the cited link gains prominence.", unit: "percent" },
    },
    timeline: { immediate: 0.0, day_30: 0.1, day_60: 0.4, day_90: 0.65, notes: "Citation re-evaluation is slow. Allow 8-16 weeks for full effect. Time to first citation observed in 4-6 weeks typical." },
    effortHours: 8,
    confidence: "medium",
    costSummary: "4-12 hours (analysis + content restructuring)",
    evidence: "Citation displacement field observations (Build 12.20 citation gap analysis): pages adopting all observed structural patterns earn citation within 8-16 weeks at ~40% success rate in measured samples.",
    applicableWhen: ["geo:ai_overview_absent"],
    prerequisites: ["SerpAPI configured for citation gap analysis", "Target query shows AI Overview that cites competitors but not the site"],
  },

  {
    id:    "expand_geo_authority_clustering",
    category: "geo",
    name: "Build topical cluster around AI-cited query",
    shortDescription: "When AI Overview already cites one of your pages for a query, expand topical authority around that cluster to earn citation for adjacent queries.",
    fullDescription: "AI Overview citation is correlated with topical authority signals — cited domains rarely earn one-off citations. When a site earns citation for one query in a topic, the surrounding query cluster becomes more reachable. The action: identify 5-15 adjacent queries (PAA + autocomplete + GSC near-ranking queries), create or strengthen pages targeting each, interlink them with the originally-cited page as the hub. AI Overview tends to cite the page that anchors a strong cluster, then spread citation to satellite pages within the cluster over 2-4 months.",
    inputs: [
      { key: "anchor_query", label: "Query where AI Overview already cites you", type: "text", required: true },
      { key: "anchor_page",  label: "Your already-cited page", type: "page_url", required: true },
    ],
    impact: {
      visibility: { min: 20, max: 80, basis: "Cluster expansion around an already-cited anchor compounds: cited pages defend their slot, satellite pages enter citation at adjacent queries. Total surface area grows.", unit: "percent" },
      clicks:     { min: 10, max: 40, basis: "AI surface citation drives AI platform referrals across the cluster. Compounds with classic organic for cluster queries.", unit: "percent" },
    },
    timeline: { immediate: 0.05, day_30: 0.2, day_60: 0.45, day_90: 0.7, notes: "Cluster effects compound over 60-180 days. Cited anchor defends quickly; satellites take longer." },
    effortHours: 16,
    confidence: "medium",
    costSummary: "12-24 hours (cluster mapping + content creation)",
    evidence: "Topic-cluster citation observations: domains earning AI Overview citation on 3+ queries in a cluster typically defend all citations over 90+ day windows at high rates. Single-citation domains show higher churn.",
    applicableWhen: ["geo:ai_overview_present"],
  },

  {
    id:    "add_author_credentials_for_geo",
    category: "geo",
    name: "Add named author with credentials to citation-target pages",
    shortDescription: "Add a visible named author with credentials (and last-updated date) to pages targeting AI citation. E-E-A-T signal for the AI search models.",
    fullDescription: "AI Overview models weight E-E-A-T (Experience, Expertise, Authoritativeness, Trust) signals heavily when selecting citation sources. Cited pages show named authors with visible credentials at very high rates (~85% in observed samples) and dated last-updated stamps at ~90%. Adding both — with the author also having an Author schema markup and ideally an author page with bio + credentials — substantially increases citation likelihood for informational and how-to content.",
    inputs: [
      { key: "target_page",     label: "Page URL", type: "page_url", required: true },
      { key: "author_name",     label: "Author full name", type: "text", required: true },
      { key: "author_credentials", label: "Credentials/title (e.g. 'MD, FACS' or 'Senior SEO Strategist, 12 years')", type: "text", required: true },
    ],
    impact: {
      visibility: { min: 5, max: 20, basis: "Author credentials is one of three foundational E-E-A-T signals (alongside dated content + schema). Strong correlate of citation eligibility but rarely sufficient alone.", unit: "percent" },
    },
    timeline: { immediate: 0.1, day_30: 0.3, day_60: 0.5, day_90: 0.7, notes: "Recrawl + AI search re-evaluation over 30-90 days." },
    effortHours: 2,
    confidence: "medium",
    costSummary: "1-3 hours (author profile + schema + page bylines)",
    evidence: "Google E-E-A-T guidelines + AI Overview citation pattern studies: cited pages show named authors at high rates. Stronger correlation for YMYL niches (health, finance, legal) where credentials matter most.",
    applicableWhen: ["geo:ai_overview_absent"],
    prerequisites: ["A real, named subject matter expert is available to attribute the content to (do not fabricate authors)"],
  },

  {
    id:    "monitor_future_ai_overview_emergence",
    category: "geo",
    name: "Set up future-AI-Overview detection for tracked queries",
    shortDescription: "Configure ongoing tracking to detect when a tracked query starts showing AI Overview for the first time — earlier signal than CTR collapse.",
    fullDescription: "AI Overview is rolled out incrementally across query types. For any given tracked query, there is typically a 2-6 week window between when AI Overview first appears for that query and when classic CTR materially declines. Setting up detection at the first-appearance signal gives a substantial response window — pages can be restructured for citation eligibility before the CTR damage hits. The detection mechanism: monitor gsc_search_appearance per-keyword over time + scheduled SerpAPI samples; alert when ai_overview goes from absent → present for any tracked query.",
    inputs: [
      { key: "tracked_queries", label: "Queries to monitor (comma-separated)", type: "text", required: true },
      { key: "alert_channel",   label: "Where to send alerts (email/slack/in-app)", type: "text", required: false },
    ],
    impact: {
      visibility: { min: 0, max: 15, basis: "Detection is a leading indicator, not direct lift. Acting on the signal (restructure for citation) drives the visibility — without action this gives information only.", unit: "percent" },
    },
    timeline: { immediate: 0.0, day_30: 0.0, day_60: 0.0, day_90: 0.0, notes: "This is a monitoring setup, not a direct intervention. Impact accrues over months as detection triggers and downstream actions are taken." },
    effortHours: 2,
    confidence: "high",
    costSummary: "1-3 hours setup, then monitoring cost (SerpAPI usage if scheduled)",
    evidence: "First-appearance-to-CTR-collapse lag observed at 2-6 weeks in field data. Acting in this window has materially higher ROI than reacting post-collapse.",
    applicableWhen: ["geo:ai_overview_absent"],
  },
];

/* ─── Filtering helpers ──────────────────────────────────────── */

export function getActionById(id: string): SeoAction | undefined {
  return SEO_ACTION_LIBRARY.find((a) => a.id === id);
}

export function getActionsByCategory(category: ActionCategory): SeoAction[] {
  return SEO_ACTION_LIBRARY.filter((a) => a.category === category);
}

export function getAllActions(): SeoAction[] {
  return SEO_ACTION_LIBRARY;
}
