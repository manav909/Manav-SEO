import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

// ─────────────────────────────────────────────────────────────────────
// Trusted sources — official only, no aggregators
// ─────────────────────────────────────────────────────────────────────
const SOURCES = {
  google: [
    { name: "Google Search Central Blog",    url: "https://developers.google.com/search/blog" },
    { name: "Google Search Documentation",   url: "https://developers.google.com/search/docs" },
    { name: "Google Search Quality Blog",    url: "https://blog.google/products/search" },
  ],
  bing: [
    { name: "Bing Webmaster Blog",           url: "https://blogs.bing.com/webmaster" },
  ],
  ai: [
    { name: "OpenAI Blog",                   url: "https://openai.com/blog" },
    { name: "Perplexity Documentation",      url: "https://docs.perplexity.ai" },
    { name: "Google Gemini Blog",            url: "https://blog.google/technology/ai" },
    { name: "Anthropic Research",            url: "https://www.anthropic.com/research" },
  ],
};

// ─────────────────────────────────────────────────────────────────────
// Parse JSON safely
// ─────────────────────────────────────────────────────────────────────
function parseJson(text: string): any | null {
  const c = text.replace(/^```[a-z]*\n?/gm, "").replace(/^```\s*$/gm, "").trim();
  const f = c.indexOf("{"), l = c.lastIndexOf("}");
  if (f < 0 || l < 0) return null;
  try { return JSON.parse(c.slice(f, l + 1)); } catch {}
  try { return JSON.parse(c.slice(f) + "}"); } catch {}
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Top-level guard — ensures every crash returns JSON, never HTML
  try {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { action } = req.body;
  if (!action) return res.status(400).json({ error: "action required" });
  const anthropic = new Anthropic();

  // ════════════════════════════════════════════════════════════════════
  // ACTION: fetch_updates
  // Uses Claude + web_search to pull latest algorithm news from trusted
  // sources and return structured knowledge items ready to save.
  // ════════════════════════════════════════════════════════════════════
  if (action === "fetch_updates") {
    const { engine = "google", topic = "" } = req.body;

    const sourceList = engine === "google" ? SOURCES.google
                     : engine === "bing"   ? SOURCES.bing
                     : engine === "ai"     ? SOURCES.ai
                     : [...SOURCES.google, ...SOURCES.bing, ...SOURCES.ai];

    const topicLine = topic ? `Focus specifically on: ${topic}` : "";

    // Build a rich prompt using Claude's training knowledge of official algorithm documentation
    const sourceNames = sourceList.map(s => s.name).join(", ");

    const prompt = `You are the world's #1 digital marketing specialist and search algorithm expert.

Topic: ${topic || "General algorithm updates and best practices"}
Engine focus: ${engine}
Reference sources: ${sourceNames}
${sourceList.map(s => `- ${s.name}: ${s.url}`).join("\n")}
${topicLine}

Search for the most recent and impactful updates. For each significant update or best practice you find, return a structured knowledge item.

Return ONLY valid JSON with this structure:
{
  "items": [
    {
      "engine": "google|bing|perplexity|chatgpt|gemini|general",
      "category": "core_update|helpful_content|spam|eeat|technical|content|links|geo_ai|core_web_vitals|local|general",
      "title": "clear descriptive title",
      "summary": "2-3 sentence plain-English summary of what this means for SEO practitioners",
      "what_changed": "specifically what changed or what the algorithm now rewards/penalises",
      "impact_level": "critical|high|medium|low",
      "best_practices": [
        {
          "practice": "short action title",
          "description": "what to do and why",
          "example": "concrete real-world example",
          "how_to_verify": "how to check if implemented correctly"
        }
      ],
      "ranking_factors": [
        {
          "factor": "factor name",
          "signal": "positive|negative|neutral",
          "detail": "how this factor affects rankings"
        }
      ],
      "checklist_items": [
        {
          "item": "specific checkable action",
          "how_to_check": "how to verify this in practice",
          "pass_criteria": "what success looks like",
          "tool": "which tool to use (GSC, Screaming Frog, manual, etc.)"
        }
      ],
      "source_url": "exact URL where you found this",
      "source_name": "publication name",
      "published_date": "YYYY-MM-DD or approximate",
      "tags": ["relevant", "tags"]
    }
  ],
  "fetch_summary": "brief description of what was found and from which sources"
}

Include 3-6 items. Prioritise: (1) official Google announcements, (2) confirmed algorithm changes, (3) actionable best practices. 
Only include information from the trusted sources listed above — no speculation.`;

    try {
      const msg = await anthropic.messages.create({
        model:      "claude-sonnet-4-5",
        max_tokens: 4000,
        system:     "You are the world's #1 digital marketing specialist and search algorithm expert. You have comprehensive knowledge of all official Google, Bing, and AI search documentation. Return ONLY valid JSON. No markdown fences. No prose.",
        messages: [{ role: "user", content: prompt }],
      });

      const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
      const parsed = parseJson(raw);

      if (!parsed?.items?.length) {
        return res.status(500).json({ success: false, error: "Model returned no structured items. Try a more specific topic." });
      }

      return res.status(200).json({ success: true, items: parsed.items, fetch_summary: parsed.fetch_summary });

    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // ACTION: save_item — persist a knowledge item to the DB
  // ════════════════════════════════════════════════════════════════════
  if (action === "save_item") {
    const { item } = req.body;
    if (!item?.title) return res.status(400).json({ error: "item required" });

    try {
      const { data, error } = await sb.from("algorithm_knowledge").insert({
        engine:          item.engine         || "google",
        category:        item.category       || "general",
        title:           item.title,
        summary:         item.summary        || "",
        what_changed:    item.what_changed   || null,
        impact_level:    item.impact_level   || "medium",
        best_practices:  item.best_practices  || [],
        ranking_factors: item.ranking_factors || [],
        checklist_items: item.checklist_items || [],
        source_url:      item.source_url     || null,
        source_name:     item.source_name    || null,
        published_date:  item.published_date || null,
        tags:            item.tags           || [],
        updated_at:      new Date().toISOString(),
      }).select().single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, item: data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // ACTION: save_many — bulk save fetched items
  // ════════════════════════════════════════════════════════════════════
  if (action === "save_many") {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "items array required" });

    try {
      const rows = items.map((item: any) => ({
        engine:          item.engine         || "google",
        category:        item.category       || "general",
        title:           item.title          || "Untitled",
        summary:         item.summary        || "",
        what_changed:    item.what_changed   || null,
        impact_level:    item.impact_level   || "medium",
        best_practices:  item.best_practices  || [],
        ranking_factors: item.ranking_factors || [],
        checklist_items: item.checklist_items || [],
        source_url:      item.source_url     || null,
        source_name:     item.source_name    || null,
        published_date:  item.published_date || null,
        tags:            item.tags           || [],
        updated_at:      new Date().toISOString(),
      }));

      const { data, error } = await sb.from("algorithm_knowledge").insert(rows).select();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, saved: data?.length || 0, items: data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // ACTION: get_all — load all knowledge items with optional filters
  // ════════════════════════════════════════════════════════════════════
  if (action === "get_all") {
    const { engine, category, impact_level } = req.body;
    try {
      let q = sb.from("algorithm_knowledge")
        .select("*")
        .order("created_at", { ascending: false });
      if (engine)       q = q.eq("engine", engine);
      if (category)     q = q.eq("category", category);
      if (impact_level) q = q.eq("impact_level", impact_level);

      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, items: data || [] });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // ACTION: delete_item
  // ════════════════════════════════════════════════════════════════════
  if (action === "delete_item") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    try {
      const { error } = await sb.from("algorithm_knowledge").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // ACTION: audit_against
  // Cross-references a page's SEO data against ALL stored knowledge items.
  // Returns a scored audit with pass/fail per checklist item + recommendations.
  // ════════════════════════════════════════════════════════════════════
  if (action === "audit_against") {
    const { pageData, projectContext = "", targetEngine = "google" } = req.body;
    if (!pageData) return res.status(400).json({ error: "pageData required" });

    // Load all relevant knowledge from DB
    const { data: knowledge } = await sb.from("algorithm_knowledge")
      .select("*")
      .in("engine", [targetEngine, "general"])
      .order("impact_level", { ascending: true }); // critical first

    if (!knowledge?.length) {
      return res.status(400).json({ error: "No algorithm knowledge in library yet. Fetch some updates first." });
    }

    // Build concise knowledge context (avoid token overflow)
    const knowledgeContext = (knowledge as any[]).map(k => {
      const checks = (k.checklist_items || []).slice(0, 4).map((c: any) => `    • ${c.item} → pass: ${c.pass_criteria}`).join("\n");
      const factors = (k.ranking_factors || []).slice(0, 3).map((f: any) => `    ${f.signal==="positive"?"✓":"✗"} ${f.factor}: ${f.detail}`).join("\n");
      return `[${k.impact_level?.toUpperCase()} IMPACT] ${k.title} (${k.engine}/${k.category})\n${k.what_changed || k.summary}\nChecks:\n${checks}\nFactors:\n${factors}`;
    }).join("\n\n---\n\n");

    const prompt = `You are the world's #1 digital marketing specialist. 
    
Audit this page against our Algorithm Intelligence Library and score it.

PROJECT: ${projectContext}

PAGE DATA:
URL: ${pageData.url || "unknown"}
Title: "${pageData.title_tag}" (${pageData.title_length}ch) — ${pageData.title_issues}
H1: "${pageData.h1}" — ${pageData.h1_issues}
Meta: ${pageData.meta_description ? `"${pageData.meta_description}"` : "MISSING"}
H2s: ${pageData.h2s?.join(", ") || "none"}
Schema: ${pageData.schema_types?.join(", ") || "none"} (${pageData.structured_data_quality})
Word count: ${pageData.word_count} | Quality: ${pageData.content_quality}
FAQs detected: ${pageData.faqs_detected?.length || 0}
GEO readiness: ${pageData.geo_readiness?.answer_format_quality}
Internal links: ${pageData.internal_links} | External: ${pageData.external_links}
OG tags: ${pageData.has_og_tags} | Twitter card: ${pageData.has_twitter_card}
Robots: ${pageData.has_robots_meta}
Issues found: ${(pageData.issues || []).map((i: any) => `[${i.severity}] ${i.detail}`).join("; ") || "none"}

ALGORITHM KNOWLEDGE LIBRARY:
${knowledgeContext}

Return ONLY valid JSON:
{
  "overall_score": 0,
  "grade": "A+|A|B+|B|C+|C|D|F",
  "verdict": "one sentence overall verdict",
  "engine_scores": {
    "google": {"score": 0, "label": "brief label"},
    "ai_search": {"score": 0, "label": "brief label"}
  },
  "checks": [
    {
      "algorithm": "which algorithm/update this comes from",
      "check": "what was checked",
      "status": "pass|fail|warning|unknown",
      "evidence": "what in the page data supports this status",
      "fix": "exact fix if not passing",
      "impact": "critical|high|medium|low",
      "points": 0
    }
  ],
  "critical_fails": [
    {"issue": "what failed", "algorithm": "which algorithm penalises this", "fix": "exact step to fix"}
  ],
  "quick_wins": [
    {"action": "specific action", "effort": "low|medium|high", "score_impact": "+X points estimated", "algorithm": "which algorithm rewards this"}
  ],
  "algorithm_gaps": [
    {"algorithm": "algorithm name", "gap": "what this page is missing", "recommended_action": "what to do"}
  ],
  "eeat_assessment": {
    "expertise": "high|medium|low|unknown — evidence from page",
    "experience": "high|medium|low|unknown — evidence from page",
    "authoritativeness": "high|medium|low|unknown — evidence from page",
    "trustworthiness": "high|medium|low|unknown — evidence from page"
  },
  "geo_ai_readiness": {
    "score": 0,
    "ready_for_ai_citation": true,
    "gaps": ["specific gaps for AI citation"],
    "improvements": ["specific steps to improve AI search visibility"]
  },
  "priority_actions": [
    {"rank": 1, "action": "specific action", "why": "which algorithm requires this", "effort": "low|medium|high", "impact": "critical|high|medium|low"}
  ]
}`;

    try {
      const msg = await anthropic.messages.create({
        model:      "claude-sonnet-4-5",
        max_tokens: 4000,
        system:     "You are the world's #1 digital marketing specialist. Return ONLY valid JSON. No fences.",
        messages:   [{ role: "user", content: prompt }],
      });

      const raw    = (msg.content[0] as any).text || "{}";
      const audit  = parseJson(raw);
      if (!audit || Object.keys(audit).length < 3) {
        return res.status(500).json({ success: false, error: "Audit parse failed", raw: raw.slice(0, 200) });
      }
      return res.status(200).json({ success: true, audit });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(400).json({ error: "Unknown action" });

  } catch (fatalErr: any) {
    // Catch any unhandled crash and return proper JSON (never HTML)
    console.error("[algorithm-intel] Fatal error:", fatalErr.message);
    return res.status(500).json({ success: false, error: fatalErr.message || "Internal server error" });
  }
}
