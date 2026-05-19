/* ════════════════════════════════════════════════════════════════
   api/lib/algo-catalog.ts
   The built-in algorithm topic catalog — pure data, no logic.
   Shared by api/algorithm-intel.ts and api/lib/pm-engine.ts so the
   PM module sources algorithm intelligence the same way the
   Algorithm page does (catalog + saved Library rows).
════════════════════════════════════════════════════════════════ */

export interface AlgoTopic {
  id: string; weight: number; engine: string; category: string;
  label: string; source: string; group: string; added: string;
}

export const TOPIC_CATALOG: AlgoTopic[] = [
  // Google Core Updates
  { id: "g_march_2025_core",       weight: 10, engine: "google",     category: "core_update",     label: "March 2025 Core Update",                   source: "Google Search Central",              group: "Google Core Updates",    added: "2025-03" },
  { id: "g_march_2024_core",       weight:  9, engine: "google",     category: "core_update",     label: "March 2024 Core Update",                   source: "Google Search Central",              group: "Google Core Updates",    added: "2024-03" },
  { id: "g_helpful_content",       weight:  9, engine: "google",     category: "helpful_content", label: "Helpful Content System (HCU)",             source: "Google Search Central",              group: "Google Core Updates",    added: "2023-08" },
  { id: "g_hcu_recovery",          weight:  9, engine: "google",     category: "helpful_content", label: "HCU Recovery Path & Signals",              source: "Google Search Central",              group: "Google Core Updates",    added: "2024-09" },
  { id: "g_site_rep_abuse",        weight:  9, engine: "google",     category: "spam",            label: "Site Reputation Abuse (Parasite SEO)",     source: "Google Search Central",              group: "Google Core Updates",    added: "2024-05" },
  { id: "g_scaled_content_abuse",  weight:  9, engine: "google",     category: "spam",            label: "Scaled Content Abuse Policy",              source: "Google Search Central",              group: "Google Core Updates",    added: "2024-03" },
  { id: "g_expired_domain_abuse",  weight:  8, engine: "google",     category: "spam",            label: "Expired Domain Abuse Policy",              source: "Google Search Central",              group: "Google Core Updates",    added: "2024-03" },
  { id: "g_aug_2023_core",         weight:  7, engine: "google",     category: "core_update",     label: "August 2023 Core Update",                  source: "Google Search Central",              group: "Google Core Updates",    added: "2023-08" },
  { id: "g_product_reviews",       weight:  6, engine: "google",     category: "content",         label: "Product Reviews Update",                   source: "Google Search Central",              group: "Google Core Updates",    added: "2023-11" },
  { id: "g_link_spam",             weight:  6, engine: "google",     category: "links",           label: "Link Spam Update",                         source: "Google Search Central",              group: "Google Core Updates",    added: "2022-12" },
  // E-E-A-T & Quality
  { id: "g_eeat",                  weight: 10, engine: "google",     category: "eeat",            label: "E-E-A-T: Experience, Expertise, Trust",    source: "Google Quality Evaluator Guidelines", group: "E-E-A-T & Quality",      added: "2022-12" },
  { id: "g_ymyl",                  weight:  9, engine: "google",     category: "eeat",            label: "YMYL: Your Money Your Life Pages",         source: "Google Quality Evaluator Guidelines", group: "E-E-A-T & Quality",      added: "2019-07" },
  { id: "g_spam_policies",         weight:  8, engine: "google",     category: "spam",            label: "Google Spam Policies 2024",                source: "Google Search Central",              group: "E-E-A-T & Quality",      added: "2024-05" },
  { id: "g_sqrg",                  weight:  7, engine: "google",     category: "eeat",            label: "Search Quality Evaluator Guidelines",      source: "Google Quality Evaluator Guidelines", group: "E-E-A-T & Quality",      added: "2024-07" },
  // Core Web Vitals
  { id: "g_cwv_inp",               weight:  9, engine: "google",     category: "core_web_vitals", label: "INP: Interaction to Next Paint (2024)",    source: "web.dev / Google Search Central",    group: "Core Web Vitals",        added: "2024-03" },
  { id: "g_cwv_lcp",               weight:  8, engine: "google",     category: "core_web_vitals", label: "Largest Contentful Paint (LCP)",           source: "web.dev",                            group: "Core Web Vitals",        added: "2020-05" },
  { id: "g_cwv_cls",               weight:  7, engine: "google",     category: "core_web_vitals", label: "Cumulative Layout Shift (CLS)",            source: "web.dev",                            group: "Core Web Vitals",        added: "2020-05" },
  { id: "g_page_experience",       weight:  7, engine: "google",     category: "core_web_vitals", label: "Page Experience Signals",                  source: "Google Search Central",              group: "Core Web Vitals",        added: "2021-06" },
  // Technical SEO
  { id: "g_schema_2024",           weight:  9, engine: "google",     category: "technical",       label: "Schema Markup & Structured Data 2024",    source: "Google Search Central",              group: "Technical SEO",          added: "2024-01" },
  { id: "g_crawl_indexing",        weight:  8, engine: "google",     category: "technical",       label: "Crawlability & Indexation Best Practices", source: "Google Search Central",              group: "Technical SEO",          added: "2024-01" },
  { id: "g_mobile_first",          weight:  7, engine: "google",     category: "technical",       label: "Mobile-First Indexing (Complete)",         source: "Google Search Central",              group: "Technical SEO",          added: "2023-10" },
  { id: "g_canonical_dupes",       weight:  7, engine: "google",     category: "technical",       label: "Canonical Tags & Duplicate Content",       source: "Google Search Central",              group: "Technical SEO",          added: "2024-01" },
  { id: "g_passage_ranking",       weight:  6, engine: "google",     category: "content",         label: "Passage Ranking",                          source: "Google Search Central",              group: "Technical SEO",          added: "2021-02" },
  // Content & AI Visibility
  { id: "g_ai_overviews",          weight: 10, engine: "google",     category: "geo_ai",          label: "AI Overviews Optimisation (2025)",         source: "Google Search Central",              group: "Content & AI Visibility", added: "2024-05" },
  { id: "g_ai_mode",               weight: 10, engine: "google",     category: "geo_ai",          label: "Google AI Mode Search (2025)",             source: "Google Search Central",              group: "Content & AI Visibility", added: "2025-05" },
  { id: "g_faq_schema_ai",         weight: 10, engine: "google",     category: "geo_ai",          label: "FAQ & HowTo Schema for AI Answers",        source: "Google Search Central",              group: "Content & AI Visibility", added: "2024-01" },
  { id: "g_topical_authority",     weight:  9, engine: "google",     category: "content",         label: "Topical Authority & Content Depth",        source: "Google Search Central",              group: "Content & AI Visibility", added: "2023-01" },
  { id: "g_entity_seo",            weight:  9, engine: "google",     category: "content",         label: "Entity SEO & Knowledge Graph",             source: "Google Search Central",              group: "Content & AI Visibility", added: "2023-01" },
  { id: "g_discover_opt",          weight:  7, engine: "google",     category: "content",         label: "Google Discover Optimisation",             source: "Google Search Central",              group: "Content & AI Visibility", added: "2024-01" },
  // AI Search Engines
  { id: "ai_geo_fundamentals",     weight: 10, engine: "general",    category: "geo_ai",          label: "GEO: Generative Engine Optimisation",      source: "Academic Research / Industry",       group: "AI Search Engines",      added: "2024-01" },
  { id: "ai_chatgpt_search",       weight: 10, engine: "chatgpt",    category: "geo_ai",          label: "ChatGPT Search Ranking Factors",           source: "OpenAI",                             group: "AI Search Engines",      added: "2024-10" },
  { id: "ai_perplexity_citations", weight: 10, engine: "perplexity", category: "geo_ai",          label: "Perplexity AI Citation Signals",           source: "Perplexity AI",                      group: "AI Search Engines",      added: "2024-01" },
  { id: "ai_gemini_search",        weight:  9, engine: "gemini",     category: "geo_ai",          label: "Gemini in Google Search",                  source: "Google AI Blog",                     group: "AI Search Engines",      added: "2024-05" },
  { id: "ai_answer_engine_opt",    weight:  9, engine: "general",    category: "geo_ai",          label: "Answer Engine Optimisation (AEO)",         source: "Industry Research",                  group: "AI Search Engines",      added: "2025-01" },
  // Bing & Microsoft
  { id: "b_bing_copilot",          weight:  8, engine: "bing",       category: "geo_ai",          label: "Bing Copilot Search Ranking Factors",      source: "Bing Webmaster",                     group: "Bing & Microsoft",       added: "2024-01" },
  { id: "b_bing_ranking",          weight:  6, engine: "bing",       category: "general",         label: "Bing Organic Ranking Factors",             source: "Bing Webmaster",                     group: "Bing & Microsoft",       added: "2024-01" },
  { id: "b_bing_webmaster_tools",  weight:  5, engine: "bing",       category: "technical",       label: "Bing Webmaster Tools Best Practices",      source: "Bing Webmaster",                     group: "Bing & Microsoft",       added: "2024-01" },
];
