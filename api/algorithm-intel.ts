import Anthropic                              from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient }                       from "@supabase/supabase-js";

function sb() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
  );
}

async function quickSave(projectId: string | null, title: string, content: string, tags: string[]) {
  if (!projectId || !content || content.length < 60) return;
  try {
    await sb().from("brain_learnings").insert({
      project_id: projectId, source: "algorithm_intel",
      card_type: "algorithm", card_title: title.slice(0, 100),
      improvement: content.slice(0, 400), context_summary: "algorithm_intel",
      what_worked: [], what_missed: [], tags: [...new Set(["algorithm", "algorithm_intel", ...tags])],
      applied_count: 0, status: "active", auto_captured: true,
      confidence_score: 85, updated_at: new Date().toISOString(),
    });
  } catch (_) {}
}

export const config = { maxDuration: 180 };

import { TOPIC_CATALOG } from "./lib/algo-catalog.js";
export { TOPIC_CATALOG } from "./lib/algo-catalog.js";
export type { AlgoTopic } from "./lib/algo-catalog.js";

function parseJson(text: string): any | null {
  const c = text.replace(/^```[a-z]*\n?/gm, "").replace(/^```\s*$/gm, "").trim();
  const f = c.indexOf("{"), l = c.lastIndexOf("}");
  if (f < 0 || l < 0) return null;
  try { return JSON.parse(c.slice(f, l + 1)); } catch (_e) {}
  try { return JSON.parse(c.slice(f) + '"}]}'); } catch (_e) {}
  try { return JSON.parse(c.slice(f) + '"}]'); } catch (_e) {}
  try { return JSON.parse(c.slice(f) + "}"); } catch (_e) {}
  return null;
}

function buildTopicPrompt(topic: { label: string; engine: string; category: string; source: string; added?: string }): string {
  return `You are the world's #1 SEO expert and search algorithm specialist with complete knowledge up to 2025.

Provide comprehensive, current knowledge about this SPECIFIC topic:
"${topic.label}"

Engine: ${topic.engine} | Category: ${topic.category} | Source: ${topic.source} | First noted: ${topic.added || ""}

Return ONLY a raw JSON object (no markdown fences, no prose, start immediately with {):
{
  "engine": "${topic.engine}",
  "category": "${topic.category}",
  "title": "exact official name of this update or guideline",
  "summary": "3-4 sentences: what this is, when it launched, current impact in 2025",
  "what_changed": "specifically what changed in ranking behaviour, what is now rewarded, what is penalised",
  "impact_level": "critical or high or medium or low",
  "best_practices": [
    {"practice": "specific action", "description": "exactly what to do and why in 2025", "example": "real implementation example", "how_to_verify": "how to confirm correctly implemented"},
    {"practice": "specific action", "description": "exactly what to do and why in 2025", "example": "real implementation example", "how_to_verify": "how to confirm correctly implemented"},
    {"practice": "specific action", "description": "exactly what to do and why in 2025", "example": "real implementation example", "how_to_verify": "how to confirm correctly implemented"}
  ],
  "ranking_factors": [
    {"factor": "factor name", "signal": "positive", "detail": "how this positively affects rankings with specifics"},
    {"factor": "factor name", "signal": "negative", "detail": "what gets penalised and why"},
    {"factor": "factor name", "signal": "positive", "detail": "another positive signal with specifics"}
  ],
  "checklist_items": [
    {"item": "specific check", "how_to_check": "step-by-step verification", "pass_criteria": "what passing looks like", "tool": "exact tool name"},
    {"item": "specific check", "how_to_check": "step-by-step verification", "pass_criteria": "what passing looks like", "tool": "exact tool name"},
    {"item": "specific check", "how_to_check": "step-by-step verification", "pass_criteria": "what passing looks like", "tool": "exact tool name"}
  ],
  "source_url": "https://exact-official-url.com",
  "source_name": "${topic.source}",
  "published_date": "YYYY-MM",
  "tags": ["specific", "relevant", "tags"]
}`;
}

/* ── Safe export: catches any uncaught crash before Vercel sees it ── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _handler(req, res); }
  catch (e: any) { try { res.status(200).json({ error: "Unexpected: " + (e?.message||"unknown"), healthy: false }); } catch (_) {} }
}

async function _handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed" });
    const { action } = req.body;
    if (!action) return res.status(200).json({ error: "action required" });

    // ══ GET CATALOG ══════════════════════════════════════════════════
    if (action === "get_catalog") {
      const { data } = await sb().from("algorithm_knowledge")
        .select("id,title,updated_at,tags")
        .order("updated_at", { ascending: false });

      const byTopicId = new Map<string, { id: string; updated_at: string }>();
      const byTitle   = new Map<string, { id: string; updated_at: string }>();
      for (const row of (data || [])) {
        byTitle.set(row.title?.toLowerCase().trim(), { id: row.id, updated_at: row.updated_at });
        for (const tag of (row.tags || []) as string[]) {
          if (tag.startsWith("tid:")) byTopicId.set(tag.slice(4), { id: row.id, updated_at: row.updated_at });
        }
      }
      const getMatch = (id: string, label: string) =>
        byTopicId.get(id) || byTitle.get(label.toLowerCase().trim()) || null;
      const STALE_MS = 7 * 24 * 60 * 60 * 1000;
      const catalog = TOPIC_CATALOG.map(t => {
        const m = getMatch(t.id, t.label);
        return { ...t, saved_id: m?.id || null, saved_at: m?.updated_at || null,
          is_stale: m ? Date.now() - new Date(m.updated_at).getTime() > STALE_MS : false, is_custom: false };
      });
      const customRows = (data || []).filter((r: any) => (r.tags || []).includes("custom"));
      for (const row of customRows) {
        if (TOPIC_CATALOG.some(t => t.label.toLowerCase().trim() === row.title?.toLowerCase().trim())) continue;
        catalog.push({ id: `custom_${row.id}`, weight: 8, engine: "google", category: "general", label: row.title,
          source: "User added", group: "Custom Topics", added: row.updated_at?.slice(0, 7) || "2025",
          saved_id: row.id, saved_at: row.updated_at,
          is_stale: Date.now() - new Date(row.updated_at).getTime() > STALE_MS, is_custom: true });
      }
      return res.status(200).json({ success: true, catalog });
    }

    // ══ FETCH SINGLE TOPIC ═══════════════════════════════════════════
    if (action === "fetch_topic") {
      const anthropic = new Anthropic();
      const { topic_id, project_id = null } = req.body;
      const topic = TOPIC_CATALOG.find(t => t.id === topic_id);
      if (!topic) return res.status(200).json({ error: "Unknown topic_id" });

      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 3000,
        system: "You are the world's #1 SEO expert. Return ONLY a raw JSON object. Start with { and end with }. No markdown. No prose.",
        messages: [{ role: "user", content: buildTopicPrompt(topic) }],
      });
      const raw    = msg.content[0].type === "text" ? msg.content[0].text : "";
      const parsed = parseJson(raw);
      if (!parsed?.title) {
        console.error(`[algo] fetch_topic parse failed for ${topic_id}:`, raw.slice(0, 200));
        return res.status(200).json({ success: false, error: "Parse failed. Please try again." });
      }

      /* Auto-capture algorithm knowledge as a brain learning (fire-and-forget) */
      if (project_id && parsed.summary) {
        quickSave(
          project_id,
          parsed.title.slice(0, 80),
          `${parsed.title}: ${parsed.summary} ${parsed.what_changed || ""}`.trim(),
          ["algorithm", topic.engine, topic.category].filter(Boolean),
        );
      }

      return res.status(200).json({ success: true, item: parsed, topic });
    }

    // ══ SCAN FOR NEW UPDATES ═════════════════════════════════════════
    if (action === "scan_for_new") {
      const anthropic    = new Anthropic();
      const existingLabels = TOPIC_CATALOG.map(t => t.label);
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 2000,
        system: "You are the world's #1 SEO expert. Return ONLY valid JSON. No fences.",
        messages: [{ role: "user", content: `You are the world's #1 SEO expert with comprehensive knowledge up to mid-2025.\n\nThe following topics are already in our knowledge catalog:\n${existingLabels.map((l, i) => `${i + 1}. ${l}`).join("\n")}\n\nIdentify 5-8 IMPORTANT algorithm updates, policies, or ranking signal changes that are:\n1. NOT in the list above\n2. Relevant and impactful for SEO practitioners in 2025\n3. From Google, Bing, ChatGPT Search, Perplexity, or Gemini\n4. Official or well-confirmed — no speculation\n\nReturn ONLY this JSON:\n{\n  "suggestions": [\n    {\n      "label": "specific topic name",\n      "engine": "google|bing|chatgpt|perplexity|gemini|general",\n      "category": "core_update|helpful_content|spam|eeat|technical|content|links|geo_ai|core_web_vitals|local|general",\n      "source": "official source name",\n      "group": "Google Core Updates|E-E-A-T & Quality|Core Web Vitals|Technical SEO|Content & AI Visibility|AI Search Engines|Bing & Microsoft",\n      "why_important": "one sentence: why SEO practitioners need to know this right now",\n      "weight": 8\n    }\n  ]\n}` }],
      });
      const raw    = msg.content[0].type === "text" ? msg.content[0].text : "{}";
      const parsed = parseJson(raw);
      if (!parsed?.suggestions?.length) {
        return res.status(200).json({ success: false, error: "No suggestions returned. Try again." });
      }
      return res.status(200).json({ success: true, suggestions: parsed.suggestions });
    }

    // ══ FETCH CUSTOM TOPIC ═══════════════════════════════════════════
    if (action === "fetch_custom_topic") {
      const anthropic = new Anthropic();
      const { label, engine = "google", category = "general", source = "User added", project_id = null } = req.body;
      if (!label) return res.status(200).json({ error: "label required" });

      const customTopic = { label, engine, category, source, added: new Date().toISOString().slice(0, 7) };
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 3000,
        system: "You are the world's #1 SEO expert. Return ONLY a raw JSON object. Start with {. No markdown.",
        messages: [{ role: "user", content: buildTopicPrompt(customTopic) }],
      });
      const raw    = msg.content[0].type === "text" ? msg.content[0].text : "";
      const parsed = parseJson(raw);
      if (!parsed?.title) return res.status(200).json({ success: false, error: "Parse failed. Try again." });
      parsed.tags = [...new Set([...(Array.isArray(parsed.tags) ? parsed.tags : []), "custom"])];

      /* Auto-capture custom algorithm research as a brain learning (fire-and-forget) */
      if (project_id && parsed.summary) {
        quickSave(
          project_id,
          parsed.title.slice(0, 80),
          `${parsed.title}: ${parsed.summary} ${parsed.what_changed || ""}`.trim(),
          ["algorithm", engine, category, "custom"].filter(Boolean),
        );
      }

      return res.status(200).json({ success: true, item: parsed });
    }

    // ══ SAVE ITEM ════════════════════════════════════════════════════
    if (action === "save_item") {
      const { item, topic_id } = req.body;
      if (!item?.title) return res.status(200).json({ error: "item required" });

      const tidTag    = topic_id ? `tid:${topic_id}` : null;
      const baseTags  = Array.isArray(item.tags) ? item.tags : [];
      const cleanTags = [...new Set([
        ...baseTags.filter((t: string) => !t.startsWith("tid:")),
        ...(tidTag ? [tidTag] : []),
      ])];

      if (tidTag) await sb().from("algorithm_knowledge").delete().contains("tags", [tidTag]);
      await sb().from("algorithm_knowledge").delete().eq("title", item.title);

      const { data, error } = await sb().from("algorithm_knowledge").insert({
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

      // After saving algorithm update, scan brain_learnings for related learnings
      // and mark them as potentially stale — async, non-blocking
      if (!error && data) {
        Promise.resolve().then(async () => {
          try {
            const algoTags = cleanTags.filter((t: string) => !t.startsWith("tid:"));
            const category = item.category || "general";
            
            // Map algorithm categories to learning card_types
            const categoryToCardTypes: Record<string, string[]> = {
              "core_update":       ["technical","content","insight"],
              "helpful_content":   ["content","insight"],
              "eeat":              ["content","insight","competitive"],
              "core_web_vitals":   ["technical","quick-win"],
              "technical":         ["technical","quick-win"],
              "geo_ai":            ["geo"],
              "links":             ["competitive","technical"],
              "spam":              ["technical","content"],
            };
            const relatedTypes = categoryToCardTypes[category] || ["technical","content","geo","insight"];
            
            // Find active learnings that match related card types
            const { data: relatedLearnings } = await sb()
              .from("brain_learnings")
              .select("id, card_type, card_title, tags")
              .in("card_type", relatedTypes)
              .eq("status", "active")
              .limit(30);
            
            if (!relatedLearnings?.length) return;
            
            // Tag them as algorithm_stale with which algorithm updated
            const staleTag = "algo_stale:" + (item.title || "").slice(0,30).replace(/\s+/g,"-").toLowerCase();
            for (const l of relatedLearnings as any[]) {
              const currentTags = Array.isArray(l.tags) ? l.tags : [];
              if (!currentTags.includes(staleTag) && !currentTags.includes("freshness-checked")) {
                await sb().from("brain_learnings").update({
                  tags: [...new Set([...currentTags, staleTag, "algo-updated"])],
                  updated_at: new Date().toISOString(),
                }).eq("id", l.id);
              }
            }
          } catch (_e) { /* non-blocking — never fail save */ }
        }).catch(() => {});
      }

      if (error) return res.status(200).json({ error: error.message });
      return res.status(200).json({ success: true, item: data });
    }

    // ══ GET ALL ══════════════════════════════════════════════════════
    if (action === "get_all") {
      const { engine, category, impact_level } = req.body;
      let q: any = sb().from("algorithm_knowledge").select("*").order("updated_at", { ascending: false });
      if (engine)       q = q.eq("engine", engine);
      if (category)     q = q.eq("category", category);
      if (impact_level) q = q.eq("impact_level", impact_level);
      const { data, error } = await q;
      if (error) return res.status(200).json({ error: error.message });
      return res.status(200).json({ success: true, items: data || [] });
    }

    // ══ DELETE ═══════════════════════════════════════════════════════
    if (action === "delete_item") {
      const { id } = req.body;
      if (!id) return res.status(200).json({ error: "id required" });
      const { error } = await sb().from("algorithm_knowledge").delete().eq("id", id);
      if (error) return res.status(200).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    // ══ AUDIT AGAINST LIBRARY ════════════════════════════════════════
    if (action === "audit_against") {
      const anthropic = new Anthropic();
      const { pageData, projectContext = "", targetEngine = "google", project_id = null } = req.body;
      if (!pageData) return res.status(200).json({ error: "pageData required" });

      const { data: knowledge } = await sb().from("algorithm_knowledge")
        .select("*").in("engine", [targetEngine, "general"])
        .order("impact_level", { ascending: true });

      if (!knowledge?.length) {
        return res.status(200).json({ error: "No algorithm knowledge saved yet. Fetch topics from the Catalog tab first." });
      }

      const knowledgeCtx = (knowledge as any[]).slice(0, 15).map(k => {
        const checks  = (k.checklist_items || []).slice(0, 3).map((c: any) => `  • ${c.item} → ${c.pass_criteria}`).join("\n");
        const factors = (k.ranking_factors || []).slice(0, 3).map((f: any) => `  ${f.signal === "positive" ? "+" : "-"} ${f.factor}: ${f.detail}`).join("\n");
        return `[${k.impact_level?.toUpperCase()}] ${k.title}\n${k.what_changed || k.summary}\nChecks:\n${checks}\nFactors:\n${factors}`;
      }).join("\n\n---\n\n");

      const prompt = `You are the world's #1 SEO specialist. Audit this page against the Algorithm Knowledge Library.\n\nPROJECT: ${projectContext}\nPAGE:\nURL: ${pageData.url || "unknown"}\nTitle: "${pageData.title_tag}" (${pageData.title_length}ch) — ${pageData.title_issues}\nH1: "${pageData.h1}" — ${pageData.h1_issues}\nMeta: ${pageData.meta_description !== "Not found" ? `"${pageData.meta_description?.slice(0, 80)}"` : "MISSING"}\nH2s: ${pageData.h2s?.join(", ") || "none"}\nSchema: ${pageData.schema_types?.join(", ") || "none"} (${pageData.structured_data_quality})\nWords: ${pageData.word_count} | Quality: ${pageData.content_quality}\nFAQs: ${pageData.faqs_detected?.length || 0} | GEO: ${pageData.geo_readiness?.answer_format_quality}\nIssues: ${(pageData.issues || []).slice(0, 3).map((i: any) => `[${i.severity}] ${i.detail}`).join("; ") || "none"}\n\nKNOWLEDGE LIBRARY:\n${knowledgeCtx}\n\nReturn ONLY valid JSON (no markdown fences):\n{\n  "overall_score": 0,\n  "grade": "A+|A|B+|B|C+|C|D|F",\n  "verdict": "one sentence overall verdict",\n  "engine_scores": {"google": {"score": 0, "label": "brief"}, "ai_search": {"score": 0, "label": "brief"}},\n  "checks": [{"algorithm": "name", "check": "what was checked", "status": "pass|fail|warning", "evidence": "specific from page data", "fix": "exact fix if failing", "impact": "critical|high|medium|low", "points": 0}],\n  "critical_fails": [{"issue": "what failed", "algorithm": "which algorithm", "fix": "exact step"}],\n  "quick_wins": [{"action": "specific action", "effort": "low|medium|high", "score_impact": "+X pts", "algorithm": "which rewards this"}],\n  "eeat_assessment": {"expertise": "high|medium|low — evidence", "experience": "high|medium|low — evidence", "authoritativeness": "high|medium|low — evidence", "trustworthiness": "high|medium|low — evidence"},\n  "geo_ai_readiness": {"score": 0, "ready_for_ai_citation": false, "gaps": ["gap"], "improvements": ["step"]},\n  "priority_actions": [{"rank": 1, "action": "specific action", "why": "which algorithm requires this", "effort": "low|medium|high", "impact": "critical|high|medium|low"}]\n}`;

      const msg   = await anthropic.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 4000,
        system: "You are the world's #1 SEO specialist. Return ONLY valid JSON. No fences. No prose.",
        messages: [{ role: "user", content: prompt }],
      });
      const raw   = (msg.content[0] as any).text || "{}";
      const audit = parseJson(raw);
      if (!audit || Object.keys(audit).length < 3) {
        return res.status(200).json({ success: false, error: "Audit response could not be parsed. Please try again." });
      }

      /* Auto-capture algorithm audit findings as a brain learning (fire-and-forget) */
      if (project_id && audit.verdict) {
        const failSummary = (audit.critical_fails || []).slice(0, 3)
          .map((f: any) => `${f.algorithm}: ${f.issue} — Fix: ${f.fix}`)
          .join("; ");
        quickSave(
          project_id,
          `Algorithm audit: ${audit.grade} — ${audit.overall_score}/100`,
          `Algorithm audit score ${audit.overall_score}/100 (${audit.grade}). ${audit.verdict}${failSummary ? ". Critical failures: " + failSummary : ""}`,
          ["algorithm", "audit", targetEngine, audit.grade || ""].filter(Boolean),
        );
      }

      return res.status(200).json({ success: true, audit });
    }

    // ══ CHECK CARD OVERLAP ══════════════════════════════════════════
    if (action === "check_card_overlap") {
      const anthropic = new Anthropic();
      const { proposals, existingCards } = req.body;
      if (!Array.isArray(proposals) || !proposals.length) {
        return res.status(200).json({ error: "proposals required" });
      }
      if (!Array.isArray(existingCards) || !existingCards.length) {
        return res.status(200).json({
          success: true,
          overlap: proposals.map((_: any, i: number) => ({ index: i, status: "new" })),
        });
      }
      const proposalList = proposals.map((p: any, i: number) =>
        `[${i}] TYPE:${p.type} PRIORITY:${p.priority} TITLE:"${p.title}" CONTENT:"${(p.content || '').slice(0, 120)}"`
      ).join("\n");
      const existingList = existingCards.map((c: any, i: number) =>
        `[${i}] TYPE:${c.type || '?'} STATUS:${c.status || '?'} TITLE:"${(c.title || '').slice(0, 80)}" CONTENT:"${(c.content || '').slice(0, 100)}"`
      ).join("\n");
      const prompt = `You are an SEO project manager. Cross-check these PROPOSALS against EXISTING CANVAS CARDS to prevent duplicate work.\n\nPROPOSALS (to evaluate):\n${proposalList}\n\nEXISTING CANVAS CARDS:\n${existingList}\n\nFor each proposal, determine:\n- "new": no existing card covers this issue at all\n- "duplicate": an existing card already covers this issue (same problem, same scope)\n- "extend": an existing card partially covers this — recommend expanding the existing card instead\n\nReturn ONLY this JSON (no fences):\n{\n  "overlap": [\n    {\n      "index": 0,\n      "status": "new|duplicate|extend",\n      "matched_card_title": "exact title of matching card, or null if new",\n      "matched_card_index": 0,\n      "reason": "one sentence explaining the decision",\n      "scope_suggestion": "if extend: specific wording to add; otherwise null"\n    }\n  ]\n}`;
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 2000,
        system: "You are a strict SEO project manager preventing duplicate work. Return ONLY valid JSON. No fences.",
        messages: [{ role: "user", content: prompt }],
      });
      const raw    = (msg.content[0] as any).text || "{}";
      const parsed = parseJson(raw);
      if (!parsed?.overlap) {
        const normT = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
        const existingTitles = new Set((existingCards as any[]).map((c: any) => normT(c.title || "")));
        return res.status(200).json({
          success: true,
          overlap: (proposals as any[]).map((p: any, i: number) => ({
            index: i, status: existingTitles.has(normT(p.title)) ? "duplicate" : "new",
            matched_card_title: existingTitles.has(normT(p.title)) ? p.title : null,
          })),
        });
      }
      const result = parsed.overlap as any[];
      const covered = new Set(result.map((r: any) => r.index));
      for (let i = 0; i < proposals.length; i++) {
        if (!covered.has(i)) result.push({ index: i, status: "new", matched_card_title: null });
      }
      result.sort((a: any, b: any) => a.index - b.index);
      return res.status(200).json({ success: true, overlap: result });
    }

    return res.status(200).json({ error: "Unknown action" });

  } catch (fatalErr: any) {
    console.error("[algorithm-intel] Fatal:", fatalErr.message);
    return res.status(200).json({ success: false, error: fatalErr.message || "Internal server error" });
  }
}
