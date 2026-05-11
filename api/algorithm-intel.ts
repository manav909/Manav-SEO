import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

// ─────────────────────────────────────────────────────────────────────
// Curated topic catalog — 28 specific topics, each fetched individually
// One topic = one API call = one deep knowledge item = always succeeds
// ─────────────────────────────────────────────────────────────────────
export const TOPIC_CATALOG = [
  // Google Core Updates
  { id: "g_march_2024_core",       engine: "google",     category: "core_update",      label: "March 2024 Core Update",                   source: "Google Search Central",             group: "Google Core Updates" },
  { id: "g_aug_2023_core",         engine: "google",     category: "core_update",      label: "August 2023 Core Update",                  source: "Google Search Central",             group: "Google Core Updates" },
  { id: "g_helpful_content",       engine: "google",     category: "helpful_content",  label: "Helpful Content System (HCU)",             source: "Google Search Central",             group: "Google Core Updates" },
  { id: "g_product_reviews",       engine: "google",     category: "content",          label: "Product Reviews Update",                   source: "Google Search Central",             group: "Google Core Updates" },
  { id: "g_link_spam",             engine: "google",     category: "links",            label: "Link Spam Update",                         source: "Google Search Central",             group: "Google Core Updates" },
  // E-E-A-T & Quality
  { id: "g_eeat",                  engine: "google",     category: "eeat",             label: "E-E-A-T: Experience, Expertise, Trust",    source: "Google Quality Evaluator Guidelines", group: "E-E-A-T & Quality" },
  { id: "g_ymyl",                  engine: "google",     category: "eeat",             label: "YMYL: Your Money Your Life Pages",         source: "Google Quality Evaluator Guidelines", group: "E-E-A-T & Quality" },
  { id: "g_sqrg",                  engine: "google",     category: "eeat",             label: "Search Quality Evaluator Guidelines",      source: "Google Quality Evaluator Guidelines", group: "E-E-A-T & Quality" },
  { id: "g_spam_policies",         engine: "google",     category: "spam",             label: "Google Spam Policies 2024",                source: "Google Search Central",             group: "E-E-A-T & Quality" },
  // Core Web Vitals
  { id: "g_cwv_inp",               engine: "google",     category: "core_web_vitals",  label: "INP Replaced FID — CWV March 2024",        source: "web.dev / Google Search Central",   group: "Core Web Vitals" },
  { id: "g_cwv_lcp",               engine: "google",     category: "core_web_vitals",  label: "Largest Contentful Paint (LCP)",           source: "web.dev",                           group: "Core Web Vitals" },
  { id: "g_cwv_cls",               engine: "google",     category: "core_web_vitals",  label: "Cumulative Layout Shift (CLS)",            source: "web.dev",                           group: "Core Web Vitals" },
  { id: "g_page_experience",       engine: "google",     category: "core_web_vitals",  label: "Page Experience Signals",                  source: "Google Search Central",             group: "Core Web Vitals" },
  // Technical SEO
  { id: "g_schema_2024",           engine: "google",     category: "technical",        label: "Schema Markup & Structured Data 2024",     source: "Google Search Central",             group: "Technical SEO" },
  { id: "g_mobile_first",          engine: "google",     category: "technical",        label: "Mobile-First Indexing",                    source: "Google Search Central",             group: "Technical SEO" },
  { id: "g_crawl_indexing",        engine: "google",     category: "technical",        label: "Crawlability & Indexation Best Practices", source: "Google Search Central",             group: "Technical SEO" },
  { id: "g_canonical_dupes",       engine: "google",     category: "technical",        label: "Canonical Tags & Duplicate Content",       source: "Google Search Central",             group: "Technical SEO" },
  { id: "g_passage_ranking",       engine: "google",     category: "content",          label: "Passage Ranking",                          source: "Google Search Central",             group: "Technical SEO" },
  // Content & AI Visibility
  { id: "g_topical_authority",     engine: "google",     category: "content",          label: "Topical Authority & Content Depth",        source: "Google Search Central",             group: "Content & AI Visibility" },
  { id: "g_entity_seo",            engine: "google",     category: "content",          label: "Entity SEO & Knowledge Graph",             source: "Google Search Central",             group: "Content & AI Visibility" },
  { id: "g_ai_overviews",          engine: "google",     category: "geo_ai",           label: "AI Overviews / SGE Optimisation",          source: "Google Search Central",             group: "Content & AI Visibility" },
  { id: "g_faq_schema_ai",         engine: "google",     category: "geo_ai",           label: "FAQ & HowTo Schema for AI Answers",        source: "Google Search Central",             group: "Content & AI Visibility" },
  // AI Search Engines
  { id: "ai_chatgpt_search",       engine: "chatgpt",    category: "geo_ai",           label: "ChatGPT Search Ranking Factors",           source: "OpenAI",                            group: "AI Search Engines" },
  { id: "ai_perplexity_citations", engine: "perplexity", category: "geo_ai",           label: "Perplexity AI Citation Signals",           source: "Perplexity AI",                     group: "AI Search Engines" },
  { id: "ai_gemini_search",        engine: "gemini",     category: "geo_ai",           label: "Gemini in Google Search",                  source: "Google AI Blog",                    group: "AI Search Engines" },
  { id: "ai_geo_fundamentals",     engine: "general",    category: "geo_ai",           label: "GEO: Generative Engine Optimisation",      source: "Academic Research / Industry",      group: "AI Search Engines" },
  // Bing
  { id: "b_bing_ranking",          engine: "bing",       category: "general",          label: "Bing Ranking Factors & Copilot Search",    source: "Bing Webmaster",                    group: "Bing & Microsoft" },
  { id: "b_bing_webmaster_tools",  engine: "bing",       category: "technical",        label: "Bing Webmaster Tools Best Practices",      source: "Bing Webmaster",                    group: "Bing & Microsoft" },
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
// Build a focused prompt for ONE specific topic
// Each topic fetches ONE deep item — guaranteed to fit in 3000 tokens
// ─────────────────────────────────────────────────────────────────────
function buildTopicPrompt(topic: typeof TOPIC_CATALOG[0]): string {
  return `You are the world's #1 SEO expert and search algorithm specialist.

Provide comprehensive knowledge about this SPECIFIC topic:
"${topic.label}"

Engine: ${topic.engine} | Category: ${topic.category} | Source: ${topic.source}

Return ONLY a raw JSON object (no markdown fences, no prose, start with {):
{
  "engine": "${topic.engine}",
  "category": "${topic.category}",
  "title": "exact official name of this update/guideline",
  "summary": "3-4 sentences: what this is, when it launched, why it matters to SEO practitioners",
  "what_changed": "specifically what changed in ranking behaviour, what is now rewarded, what is penalised",
  "impact_level": "critical or high or medium or low",
  "best_practices": [
    {"practice": "specific action", "description": "exactly what to do and why", "example": "real implementation example", "how_to_verify": "how to confirm it is done correctly"},
    {"practice": "specific action", "description": "exactly what to do and why", "example": "real implementation example", "how_to_verify": "how to confirm it is done correctly"},
    {"practice": "specific action", "description": "exactly what to do and why", "example": "real implementation example", "how_to_verify": "how to confirm it is done correctly"}
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
    const anthropic = new Anthropic();

    // ══ GET TOPIC CATALOG ════════════════════════════════════════════
    // Returns the full topic list with saved-status for each item
    if (action === "get_catalog") {
      const { data } = await sb
        .from("algorithm_knowledge")
        .select("id,title,updated_at")
        .order("updated_at", { ascending: false });

      // Match saved items to catalog by title (fuzzy) or by stored topic_id
      const saved = new Map<string, { id: string; updated_at: string }>();
      for (const row of (data || [])) {
        saved.set(row.title?.toLowerCase().trim(), { id: row.id, updated_at: row.updated_at });
      }

      const catalog = TOPIC_CATALOG.map(t => ({
        ...t,
        saved_id:   saved.get(t.label.toLowerCase().trim())?.id || null,
        saved_at:   saved.get(t.label.toLowerCase().trim())?.updated_at || null,
        is_stale:   (() => {
          const at = saved.get(t.label.toLowerCase().trim())?.updated_at;
          if (!at) return false;
          return Date.now() - new Date(at).getTime() > 7 * 24 * 60 * 60 * 1000;
        })(),
      }));

      return res.status(200).json({ success: true, catalog });
    }

    // ══ FETCH SINGLE TOPIC ═══════════════════════════════════════════
    // One topic → one focused API call → one deep knowledge item
    // max_tokens: 3000 is more than enough for one item
    if (action === "fetch_topic") {
      const { topic_id } = req.body;
      const topic = TOPIC_CATALOG.find(t => t.id === topic_id);
      if (!topic) return res.status(400).json({ error: "Unknown topic_id" });

      try {
        const msg = await anthropic.messages.create({
          model:      "claude-sonnet-4-5",
          max_tokens: 3000,
          system:     "You are the world's #1 SEO expert with complete knowledge of all search algorithm documentation. Return ONLY a raw JSON object. Start with { and end with }. No markdown. No prose.",
          messages:   [{ role: "user", content: buildTopicPrompt(topic) }],
        });

        if (msg.stop_reason === "max_tokens") {
          console.warn(`[algo] max_tokens hit for topic: ${topic_id}`);
        }

        const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
        if (!raw.trim()) return res.status(500).json({ success: false, error: "Empty response. Please try again." });

        const parsed = parseJson(raw);
        if (!parsed || !parsed.title) {
          console.error(`[algo] parse failed for ${topic_id}:`, raw.slice(0, 300));
          return res.status(500).json({ success: false, error: "Parse failed. Please try again." });
        }

        return res.status(200).json({ success: true, item: parsed, topic });

      } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // ══ SAVE ITEM ════════════════════════════════════════════════════
    if (action === "save_item") {
      const { item, topic_id } = req.body;
      if (!item?.title) return res.status(400).json({ error: "item required" });

      // Delete existing entry for this topic (upsert by title)
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
        tags:            item.tags            || [],
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
      const { pageData, projectContext = "", targetEngine = "google" } = req.body;
      if (!pageData) return res.status(400).json({ error: "pageData required" });

      const { data: knowledge } = await sb.from("algorithm_knowledge")
        .select("*")
        .in("engine", [targetEngine, "general"])
        .order("impact_level", { ascending: true });

      if (!knowledge?.length) {
        return res.status(400).json({ error: "No algorithm knowledge saved yet. Use the Catalog tab to fetch topics first." });
      }

      const knowledgeCtx = (knowledge as any[]).map(k => {
        const checks = (k.checklist_items || []).slice(0, 3).map((c: any) => `  • ${c.item} → ${c.pass_criteria}`).join("\n");
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

      try {
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-5", max_tokens: 4000,
          system: "You are the world's #1 SEO specialist. Return ONLY valid JSON. No fences.",
          messages: [{ role: "user", content: prompt }],
        });
        const raw = (msg.content[0] as any).text || "{}";
        const audit = parseJson(raw);
        if (!audit || Object.keys(audit).length < 3) {
          return res.status(500).json({ success: false, error: "Audit parse failed. Try again." });
        }
        return res.status(200).json({ success: true, audit });
      } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    return res.status(400).json({ error: "Unknown action" });

  } catch (fatalErr: any) {
    console.error("[algorithm-intel] Fatal:", fatalErr.message);
    return res.status(500).json({ success: false, error: fatalErr.message || "Internal server error" });
  }
}
