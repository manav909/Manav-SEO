import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

// ─────────────────────────────────────────────────────────────────────
// TOPIC CATALOG
// weight 1-10: how critically important this is RIGHT NOW in 2025
// 10 = every SEO must know this today
//  7 = important but can follow next week
//  4 = foundational / historical reference
// Topics are sorted high-weight first within each group.
// Custom topics (user-added) live here too with is_custom: true.
// ─────────────────────────────────────────────────────────────────────
export const TOPIC_CATALOG = [

  // ── Google Core Updates ───────────────────────────────────────────
  { id: "g_march_2025_core",       weight: 10, engine: "google",     category: "core_update",      label: "March 2025 Core Update",                     source: "Google Search Central",              group: "Google Core Updates",       added: "2025-03" },
  { id: "g_march_2024_core",       weight:  9, engine: "google",     category: "core_update",      label: "March 2024 Core Update",                     source: "Google Search Central",              group: "Google Core Updates",       added: "2024-03" },
  { id: "g_helpful_content",       weight:  9, engine: "google",     category: "helpful_content",  label: "Helpful Content System (HCU)",               source: "Google Search Central",              group: "Google Core Updates",       added: "2023-08" },
  { id: "g_hcu_recovery",          weight:  9, engine: "google",     category: "helpful_content",  label: "HCU Recovery Path & Signals",                source: "Google Search Central",              group: "Google Core Updates",       added: "2024-09" },
  { id: "g_site_rep_abuse",        weight:  9, engine: "google",     category: "spam",             label: "Site Reputation Abuse (Parasite SEO)",       source: "Google Search Central",              group: "Google Core Updates",       added: "2024-05" },
  { id: "g_scaled_content_abuse",  weight:  9, engine: "google",     category: "spam",             label: "Scaled Content Abuse Policy",                source: "Google Search Central",              group: "Google Core Updates",       added: "2024-03" },
  { id: "g_expired_domain_abuse",  weight:  8, engine: "google",     category: "spam",             label: "Expired Domain Abuse Policy",                source: "Google Search Central",              group: "Google Core Updates",       added: "2024-03" },
  { id: "g_aug_2023_core",         weight:  7, engine: "google",     category: "core_update",      label: "August 2023 Core Update",                    source: "Google Search Central",              group: "Google Core Updates",       added: "2023-08" },
  { id: "g_product_reviews",       weight:  6, engine: "google",     category: "content",          label: "Product Reviews Update",                     source: "Google Search Central",              group: "Google Core Updates",       added: "2023-11" },
  { id: "g_link_spam",             weight:  6, engine: "google",     category: "links",            label: "Link Spam Update",                           source: "Google Search Central",              group: "Google Core Updates",       added: "2022-12" },

  // ── E-E-A-T & Quality ─────────────────────────────────────────────
  { id: "g_eeat",                  weight: 10, engine: "google",     category: "eeat",             label: "E-E-A-T: Experience, Expertise, Trust",      source: "Google Quality Evaluator Guidelines", group: "E-E-A-T & Quality",         added: "2022-12" },
  { id: "g_ymyl",                  weight:  9, engine: "google",     category: "eeat",             label: "YMYL: Your Money Your Life Pages",           source: "Google Quality Evaluator Guidelines", group: "E-E-A-T & Quality",         added: "2019-07" },
  { id: "g_spam_policies",         weight:  8, engine: "google",     category: "spam",             label: "Google Spam Policies 2024",                  source: "Google Search Central",              group: "E-E-A-T & Quality",         added: "2024-05" },
  { id: "g_sqrg",                  weight:  7, engine: "google",     category: "eeat",             label: "Search Quality Evaluator Guidelines",        source: "Google Quality Evaluator Guidelines", group: "E-E-A-T & Quality",         added: "2024-07" },

  // ── Core Web Vitals ───────────────────────────────────────────────
  { id: "g_cwv_inp",               weight:  9, engine: "google",     category: "core_web_vitals",  label: "INP: Interaction to Next Paint (2024)",      source: "web.dev / Google Search Central",    group: "Core Web Vitals",           added: "2024-03" },
  { id: "g_cwv_lcp",               weight:  8, engine: "google",     category: "core_web_vitals",  label: "Largest Contentful Paint (LCP)",             source: "web.dev",                            group: "Core Web Vitals",           added: "2020-05" },
  { id: "g_cwv_cls",               weight:  7, engine: "google",     category: "core_web_vitals",  label: "Cumulative Layout Shift (CLS)",              source: "web.dev",                            group: "Core Web Vitals",           added: "2020-05" },
  { id: "g_page_experience",       weight:  7, engine: "google",     category: "core_web_vitals",  label: "Page Experience Signals",                    source: "Google Search Central",              group: "Core Web Vitals",           added: "2021-06" },

  // ── Technical SEO ─────────────────────────────────────────────────
  { id: "g_schema_2024",           weight:  9, engine: "google",     category: "technical",        label: "Schema Markup & Structured Data 2024",       source: "Google Search Central",              group: "Technical SEO",             added: "2024-01" },
  { id: "g_crawl_indexing",        weight:  8, engine: "google",     category: "technical",        label: "Crawlability & Indexation Best Practices",   source: "Google Search Central",              group: "Technical SEO",             added: "2024-01" },
  { id: "g_mobile_first",          weight:  7, engine: "google",     category: "technical",        label: "Mobile-First Indexing (Complete)",           source: "Google Search Central",              group: "Technical SEO",             added: "2023-10" },
  { id: "g_canonical_dupes",       weight:  7, engine: "google",     category: "technical",        label: "Canonical Tags & Duplicate Content",         source: "Google Search Central",              group: "Technical SEO",             added: "2024-01" },
  { id: "g_passage_ranking",       weight:  6, engine: "google",     category: "content",          label: "Passage Ranking",                            source: "Google Search Central",              group: "Technical SEO",             added: "2021-02" },

  // ── Content & AI Visibility ───────────────────────────────────────
  { id: "g_ai_overviews",          weight: 10, engine: "google",     category: "geo_ai",           label: "AI Overviews Optimisation (2025)",           source: "Google Search Central",              group: "Content & AI Visibility",   added: "2024-05" },
  { id: "g_ai_mode",               weight: 10, engine: "google",     category: "geo_ai",           label: "Google AI Mode Search (2025)",               source: "Google Search Central",              group: "Content & AI Visibility",   added: "2025-05" },
  { id: "g_faq_schema_ai",         weight: 10, engine: "google",     category: "geo_ai",           label: "FAQ & HowTo Schema for AI Answers",          source: "Google Search Central",              group: "Content & AI Visibility",   added: "2024-01" },
  { id: "g_topical_authority",     weight:  9, engine: "google",     category: "content",          label: "Topical Authority & Content Depth",          source: "Google Search Central",              group: "Content & AI Visibility",   added: "2023-01" },
  { id: "g_entity_seo",            weight:  9, engine: "google",     category: "content",          label: "Entity SEO & Knowledge Graph",               source: "Google Search Central",              group: "Content & AI Visibility",   added: "2023-01" },
  { id: "g_discover_opt",          weight:  7, engine: "google",     category: "content",          label: "Google Discover Optimisation",               source: "Google Search Central",              group: "Content & AI Visibility",   added: "2024-01" },

  // ── AI Search Engines ─────────────────────────────────────────────
  { id: "ai_geo_fundamentals",     weight: 10, engine: "general",    category: "geo_ai",           label: "GEO: Generative Engine Optimisation",        source: "Academic Research / Industry",       group: "AI Search Engines",         added: "2024-01" },
  { id: "ai_chatgpt_search",       weight: 10, engine: "chatgpt",    category: "geo_ai",           label: "ChatGPT Search Ranking Factors",             source: "OpenAI",                             group: "AI Search Engines",         added: "2024-10" },
  { id: "ai_perplexity_citations", weight: 10, engine: "perplexity", category: "geo_ai",           label: "Perplexity AI Citation Signals",             source: "Perplexity AI",                      group: "AI Search Engines",         added: "2024-01" },
  { id: "ai_gemini_search",        weight:  9, engine: "gemini",     category: "geo_ai",           label: "Gemini in Google Search",                    source: "Google AI Blog",                     group: "AI Search Engines",         added: "2024-05" },
  { id: "ai_answer_engine_opt",    weight:  9, engine: "general",    category: "geo_ai",           label: "Answer Engine Optimisation (AEO)",           source: "Industry Research",                  group: "AI Search Engines",         added: "2025-01" },

  // ── Bing & Microsoft ──────────────────────────────────────────────
  { id: "b_bing_copilot",          weight:  8, engine: "bing",       category: "geo_ai",           label: "Bing Copilot Search Ranking Factors",        source: "Bing Webmaster",                     group: "Bing & Microsoft",          added: "2024-01" },
  { id: "b_bing_ranking",          weight:  6, engine: "bing",       category: "general",          label: "Bing Organic Ranking Factors",               source: "Bing Webmaster",                     group: "Bing & Microsoft",          added: "2024-01" },
  { id: "b_bing_webmaster_tools",  weight:  5, engine: "bing",       category: "technical",        label: "Bing Webmaster Tools Best Practices",        source: "Bing Webmaster",                     group: "Bing & Microsoft",          added: "2024-01" },
];

// ─────────────────────────────────────────────────────────────────────
// Safe JSON parser
// ─────────────────────────────────────────────────────────────────────
function parseJson(text: string): any | null {
  const c = text.replace(/^```[a-z]*\n?/gm, "").replace(/^```\s*$/gm, "").trim();
  const f = c.indexOf("{"), l = c.lastIndexOf("}");
  if (f < 0 || l < 0) return null;
  try { return JSON.parse(c.slice(f, l + 1)); } catch {}
  try { return JSON.parse(c.slice(f) + '"}]}'); } catch {}
  try { return JSON.parse(c.slice(f) + '"}]'); } catch {}
  try { return JSON.parse(c.slice(f) + "}"); } catch {}
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Build focused prompt for ONE topic → ONE deep item
// ─────────────────────────────────────────────────────────────────────
function buildTopicPrompt(topic: typeof TOPIC_CATALOG[0]): string {
  return `You are the world's #1 SEO expert and search algorithm specialist with complete knowledge up to 2025.

Provide comprehensive, current knowledge about this SPECIFIC topic:
"${topic.label}"

Engine: ${topic.engine} | Category: ${topic.category} | Source: ${topic.source} | First noted: ${(topic as any).added || ""}

Return ONLY a raw JSON object (no markdown fences, no prose, start with {):
{
  "engine": "${topic.engine}",
  "category": "${topic.category}",
  "title": "exact official name of this update/guideline",
  "summary": "3-4 sentences: what this is, when it launched/changed, current impact on SEO in 2025",
  "what_changed": "specifically what changed in ranking behaviour, what is now rewarded, what is penalised",
  "impact_level": "critical or high or medium or low",
  "best_practices": [
    {"practice": "specific action", "description": "exactly what to do and why in 2025", "example": "real implementation example", "how_to_verify": "how to confirm it is done correctly"},
    {"practice": "specific action", "description": "exactly what to do and why in 2025", "example": "real implementation example", "how_to_verify": "how to confirm it is done correctly"},
    {"practice": "specific action", "description": "exactly what to do and why in 2025", "example": "real implementation example", "how_to_verify": "how to confirm it is done correctly"}
  ],
  "ranking_factors": [
    {"factor": "factor name", "signal": "positive", "detail": "how this positively affects rankings with specifics"},
    {"factor": "factor name", "signal": "negative", "detail": "what gets penalised and why"},
    {"factor": "factor name", "signal": "positive", "detail": "another positive signal"}
  ],
  "checklist_items": [
    {"item": "specific check", "how_to_check": "step-by-step verification method", "pass_criteria": "what passing looks like", "tool": "exact tool name"},
    {"item": "specific check", "how_to_check": "step-by-step verification method", "pass_criteria": "what passing looks like", "tool": "exact tool name"},
    {"item": "specific check", "how_to_check": "step-by-step verification method", "pass_criteria": "what passing looks like", "tool": "exact tool name"}
  ],
  "source_url": "https://exact-official-url.com",
  "source_name": "${topic.source}",
  "published_date": "YYYY-MM",
  "tags": ["specific", "tags", "for", "this", "topic"]
}`;
}

// ─────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { action } = req.body;
    if (!action) return res.status(400).json({ error: "action required" });
    // Note: Anthropic client is created only inside actions that call Claude.
    // get_catalog, save_item, get_all, delete_item are DB-only and never need it.

    // ══ GET CATALOG ══════════════════════════════════════════════════
    if (action === "get_catalog") {
      const { data } = await sb.from("algorithm_knowledge")
        .select("id,title,updated_at,tags")
        .order("updated_at", { ascending: false });

      // Build two lookup maps:
      //   byTopicId  — keyed by "tid:{topic_id}" tag (most reliable, title-independent)
      //   byTitle    — keyed by lowercase title (fallback for items saved before this fix)
      const byTopicId = new Map<string, { id: string; updated_at: string }>();
      const byTitle   = new Map<string, { id: string; updated_at: string }>();

      for (const row of (data || [])) {
        byTitle.set(row.title?.toLowerCase().trim(), { id: row.id, updated_at: row.updated_at });
        for (const tag of (row.tags || []) as string[]) {
          if (tag.startsWith("tid:")) {
            byTopicId.set(tag.slice(4), { id: row.id, updated_at: row.updated_at });
          }
        }
      }

      const getMatch = (topicId: string, label: string) =>
        byTopicId.get(topicId) || byTitle.get(label.toLowerCase().trim()) || null;

      const STALE_MS = 7 * 24 * 60 * 60 * 1000;

      const catalog = TOPIC_CATALOG.map(t => {
        const match = getMatch(t.id, t.label);
        return {
          ...t,
          saved_id:  match?.id || null,
          saved_at:  match?.updated_at || null,
          is_stale:  match ? Date.now() - new Date(match.updated_at).getTime() > STALE_MS : false,
          is_custom: false,
        };
      });

      // Append custom topics (tagged "custom") as extra catalog rows
      const customRows = (data || []).filter((r: any) => (r.tags || []).includes("custom"));
      for (const row of customRows) {
        // Skip if title already matches a built-in catalog entry
        if (TOPIC_CATALOG.some(t => t.label.toLowerCase().trim() === row.title?.toLowerCase().trim())) continue;
        catalog.push({
          id:        `custom_${row.id}`,
          weight:    8,
          engine:    "google",
          category:  "general",
          label:     row.title,
          source:    "User added",
          group:     "Custom Topics",
          added:     row.updated_at?.slice(0, 7) || "2025",
          saved_id:  row.id,
          saved_at:  row.updated_at,
          is_stale:  Date.now() - new Date(row.updated_at).getTime() > STALE_MS,
          is_custom: true,
        });
      }

      return res.status(200).json({ success: true, catalog });
    }

    // ══ FETCH SINGLE TOPIC ═══════════════════════════════════════════
    if (action === "fetch_topic") {
      const anthropic = new Anthropic();
      const { topic_id } = req.body;
      const topic = TOPIC_CATALOG.find(t => t.id === topic_id);
      if (!topic) return res.status(400).json({ error: "Unknown topic_id" });

      const msg = await anthropic.messages.create({
        model:      "claude-sonnet-4-5",
        max_tokens: 3000,
        system:     "You are the world's #1 SEO expert with complete knowledge up to 2025. Return ONLY a raw JSON object. Start with { and end with }. No markdown. No prose.",
        messages:   [{ role: "user", content: buildTopicPrompt(topic) }],
      });

      const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
      if (!raw.trim()) return res.status(500).json({ success: false, error: "Empty response. Try again." });

      const parsed = parseJson(raw);
      if (!parsed?.title) {
        console.error(`[algo] parse failed for ${topic_id}:`, raw.slice(0, 300));
        return res.status(500).json({ success: false, error: "Parse failed. Try again." });
      }
      return res.status(200).json({ success: true, item: parsed, topic });
    }

    // ══ SCAN FOR NEW UPDATES ══════════════════════════════════════════
    // Asks Claude to identify important algorithm updates NOT in the catalog.
    if (action === "scan_for_new") {
      const anthropic = new Anthropic();
      const existingLabels = TOPIC_CATALOG.map(t => t.label);

      const prompt = `You are the world's #1 SEO expert with comprehensive knowledge up to mid-2025.

The following algorithm topics are already in our knowledge catalog:
${existingLabels.map((l, i) => `${i + 1}. ${l}`).join("\n")}

Identify 5-8 IMPORTANT algorithm updates, policies, or ranking signal changes that are:
1. NOT already in the list above
2. Relevant and impactful for SEO practitioners in 2025
3. From Google, Bing, ChatGPT Search, Perplexity, or Gemini
4. Official or well-confirmed — no speculation

Return ONLY this JSON:
{
  "suggestions": [
    {
      "label": "specific topic name",
      "engine": "google|bing|chatgpt|perplexity|gemini|general",
      "category": "core_update|helpful_content|spam|eeat|technical|content|links|geo_ai|core_web_vitals|local|general",
      "source": "official source name",
      "group": "Google Core Updates|E-E-A-T & Quality|Core Web Vitals|Technical SEO|Content & AI Visibility|AI Search Engines|Bing & Microsoft",
      "why_important": "one sentence: why SEO practitioners need to know this right now",
      "weight": 8
    }
  ]
}`;

      const msg = await anthropic.messages.create({
        model:      "claude-sonnet-4-5",
        max_tokens: 2000,
        system:     "You are the world's #1 SEO expert. Return ONLY valid JSON. No fences.",
        messages:   [{ role: "user", content: prompt }],
      });

      const raw    = msg.content[0].type === "text" ? msg.content[0].text : "{}";
      const parsed = parseJson(raw);

      if (!parsed?.suggestions?.length) {
        return res.status(500).json({ success: false, error: "No suggestions returned. Try again." });
      }
      return res.status(200).json({ success: true, suggestions: parsed.suggestions });
    }

    // ══ ADD CUSTOM TOPIC ═════════════════════════════════════════════
    // User-discovered topic — fetch + save with "custom" tag
    if (action === "fetch_custom_topic") {
      const anthropic = new Anthropic();
      const { label, engine = "google", category = "general", source = "User added" } = req.body;
      if (!label) return res.status(400).json({ error: "label required" });

      const customTopic = { id: "custom", weight: 8, engine, category, label, source, group: "Custom Topics", added: new Date().toISOString().slice(0, 7) };

      const msg = await anthropic.messages.create({
        model:      "claude-sonnet-4-5",
        max_tokens: 3000,
        system:     "You are the world's #1 SEO expert. Return ONLY a raw JSON object. Start with {. No markdown.",
        messages:   [{ role: "user", content: buildTopicPrompt(customTopic as any) }],
      });

      const raw    = msg.content[0].type === "text" ? msg.content[0].text : "";
      const parsed = parseJson(raw);
      if (!parsed?.title) return res.status(500).json({ success: false, error: "Parse failed. Try again." });

      // Tag as custom so it persists in the catalog
      parsed.tags = [...(parsed.tags || []), "custom"];
      return res.status(200).json({ success: true, item: parsed });
    }

    // ══ SAVE ITEM ════════════════════════════════════════════════════
    if (action === "save_item") {
      const { item, topic_id } = req.body;
      if (!item?.title) return res.status(400).json({ error: "item required" });

      // Build tags — include topic_id as "tid:{topic_id}" for reliable catalog matching.
      // Claude generates titles that differ from catalog labels, so we can't match by title alone.
      const tidTag  = topic_id ? `tid:${topic_id}` : null;
      const baseTags: string[] = Array.isArray(item.tags) ? item.tags : [];
      const cleanTags = [...new Set([...baseTags.filter((t: string) => !t.startsWith("tid:")), ...(tidTag ? [tidTag] : [])])];

      // Delete any existing row for this topic_id OR this title (handles re-fetches)
      if (topic_id) {
        await sb.from("algorithm_knowledge").delete().contains("tags", [tidTag!]);
      }
      await sb.from("algorithm_knowledge").delete().eq("title", item.title);

      const { data, error } = await sb.from("algorithm_knowledge").insert({
        engine:          item.engine          || "google",
        category:        item.category        || "general",
        title:           item.title,
        summary:         item.summary         || "",
        what_changed:    item.what_changed    || null,
        impact_level:    item.impact_level    || "medium",
        best_practices:  item.best_practices  || [],
        ranking_factors: item.ranking_factors || [],
        checklist_items: item.checklist_items || [],
        source_url:      item.source_url      || null,
        source_name:     item.source_name     || null,
        published_date:  item.published_date  || null,
        tags:            cleanTags,
        updated_at:      new Date().toISOString(),
      }).select().single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, item: data });
    }

    // ══ GET ALL ══════════════════════════════════════════════════════
    if (action === "get_all") {
      const { engine, category, impact_level } = req.body;
      let q = sb.from("algorithm_knowledge").select("*").order("updated_at", { ascending: false });
      if (engine)       q = q.eq("engine", engine);
      if (category)     q = q.eq("category", category);
      if (impact_level) q = q.eq("impact_level", impact_level);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, items: data || [] });
    }

    // ══ DELETE ═══════════════════════════════════════════════════════
    if (action === "delete_item") {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });
      const { error } = await sb.from("algorithm_knowledge").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    // ══ AUDIT AGAINST LIBRARY ════════════════════════════════════════
    if (action === "audit_against") {
      const anthropic = new Anthropic();
      const { pageData, projectContext = "", targetEngine = "google" } = req.body;
      if (!pageData) return res.status(400).json({ error: "pageData required" });

      const { data: knowledge } = await sb.from("algorithm_knowledge")
        .select("*").in("engine", [targetEngine, "general"])
        .order("impact_level", { ascending: true });

      if (!knowledge?.length) {
        return res.status(400).json({ error: "No algorithm knowledge saved yet. Fetch topics from the Catalog first." });
      }

      const knowledgeCtx = (knowledge as any[]).slice(0, 15).map(k => {
        const checks  = (k.checklist_items || []).slice(0, 3).map((c: any) => `  • ${c.item} → ${c.pass_criteria}`).join("\n");
        const factors = (k.ranking_factors || []).slice(0, 3).map((f: any) => `  ${f.signal === "positive" ? "+" : "-"} ${f.factor}: ${f.detail}`).join("\n");
        return `[${k.impact_level?.toUpperCase()}] ${k.title}\n${k.what_changed || k.summary}\nChecks:\n${checks}\nFactors:\n${factors}`;
      }).join("\n\n---\n\n");

      const prompt = `You are the world's #1 SEO specialist. Audit this page against the Algorithm Knowledge Library.

PROJECT: ${projectContext}
PAGE:
URL: ${pageData.url || "unknown"}
Title: "${pageData.title_tag}" (${pageData.title_length}ch) — ${pageData.title_issues}
H1: "${pageData.h1}" — ${pageData.h1_issues}
Meta: ${pageData.meta_description !== "Not found" ? `"${pageData.meta_description?.slice(0,80)}"` : "MISSING"}
H2s: ${pageData.h2s?.join(", ") || "none"}
Schema: ${pageData.schema_types?.join(", ") || "none"} (${pageData.structured_data_quality})
Words: ${pageData.word_count} | Quality: ${pageData.content_quality}
FAQs: ${pageData.faqs_detected?.length || 0} | GEO: ${pageData.geo_readiness?.answer_format_quality}
Issues: ${(pageData.issues || []).slice(0,3).map((i: any) => `[${i.severity}] ${i.detail}`).join("; ") || "none"}

KNOWLEDGE LIBRARY:
${knowledgeCtx}

Return ONLY valid JSON:
{
  "overall_score": 0,
  "grade": "A+|A|B+|B|C+|C|D|F",
  "verdict": "one sentence",
  "engine_scores": {"google": {"score": 0, "label": "brief"}, "ai_search": {"score": 0, "label": "brief"}},
  "checks": [{"algorithm": "name", "check": "what checked", "status": "pass|fail|warning", "evidence": "from page data", "fix": "exact fix if failing", "impact": "critical|high|medium|low", "points": 0}],
  "critical_fails": [{"issue": "what", "algorithm": "which", "fix": "exact step"}],
  "quick_wins": [{"action": "specific", "effort": "low|medium|high", "score_impact": "+X pts", "algorithm": "which rewards this"}],
  "eeat_assessment": {"expertise": "high|medium|low — evidence", "experience": "high|medium|low — evidence", "authoritativeness": "high|medium|low — evidence", "trustworthiness": "high|medium|low — evidence"},
  "geo_ai_readiness": {"score": 0, "ready_for_ai_citation": false, "gaps": ["gap"], "improvements": ["step"]},
  "priority_actions": [{"rank": 1, "action": "specific", "why": "which algorithm", "effort": "low|medium|high", "impact": "critical|high|medium|low"}]
}`;

      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-5", max_tokens: 4000,
        system: "You are the world's #1 SEO specialist. Return ONLY valid JSON. No fences.",
        messages: [{ role: "user", content: prompt }],
      });
      const raw   = (msg.content[0] as any).text || "{}";
      const audit = parseJson(raw);
      if (!audit || Object.keys(audit).length < 3) {
        return res.status(500).json({ success: false, error: "Audit parse failed. Try again." });
      }
      return res.status(200).json({ success: true, audit });
    }

    return res.status(400).json({ error: "Unknown action" });

  } catch (fatalErr: any) {
    console.error("[algorithm-intel] Fatal:", fatalErr.message);
    return res.status(500).json({ success: false, error: fatalErr.message || "Internal server error" });
  }
}
