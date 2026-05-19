/* ════════════════════════════════════════════════════════════════
   api/lib/algo-depth.ts
   Shared algorithm-intelligence helper. Given a catalog topic, returns
   its full depth — summary, what_changed, impact_level, best_practices,
   ranking_factors, checklist_items — by either reading a saved
   algorithm_knowledge row (fast path) or generating it via AI and
   saving it for next time.

   Used by the PM module so generated cards carry real, actionable
   algorithm practices and checklists — not just topic names.
════════════════════════════════════════════════════════════════ */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db.js";
import type { AlgoTopic } from "./algo-catalog.js";

export interface AlgoDepth {
  topicId:        string;
  title:          string;
  engine:         string;
  category:       string;
  summary:        string;
  what_changed:   string;
  impact_level:   string;
  best_practices: { practice: string; description: string; example?: string; how_to_verify?: string }[];
  ranking_factors:{ factor: string; signal: string; detail: string }[];
  checklist_items:{ item: string; how_to_check?: string; pass_criteria?: string; tool?: string }[];
  source:         "library" | "generated";
}

function parseJson(raw: string): any {
  try {
    const clean = raw.replace(/^```[a-z]*\n?/gm, "").replace(/^```\s*$/gm, "").trim();
    const f = clean.indexOf("{");
    const l = clean.lastIndexOf("}");
    if (f < 0 || l < 0) return null;
    return JSON.parse(clean.slice(f, l + 1));
  } catch { return null; }
}

function topicPrompt(topic: AlgoTopic): string {
  return `You are the world's #1 SEO expert and search algorithm specialist with complete knowledge up to 2025.

Provide comprehensive, current knowledge about this SPECIFIC topic:
"${topic.label}"

Engine: ${topic.engine} | Category: ${topic.category} | Source: ${topic.source} | First noted: ${topic.added || ""}

Return ONLY a raw JSON object (no markdown fences, no prose, start immediately with {):
{
  "title": "exact official name of this update or guideline",
  "summary": "3-4 sentences: what this is, when it launched, current impact in 2025",
  "what_changed": "specifically what changed in ranking behaviour, what is now rewarded, what is penalised",
  "impact_level": "critical or high or medium or low",
  "best_practices": [
    {"practice": "specific action", "description": "exactly what to do and why in 2025", "example": "real implementation example", "how_to_verify": "how to confirm correctly implemented"}
  ],
  "ranking_factors": [
    {"factor": "factor name", "signal": "positive or negative", "detail": "how this affects rankings with specifics"}
  ],
  "checklist_items": [
    {"item": "specific check", "how_to_check": "step-by-step verification", "pass_criteria": "what passing looks like", "tool": "exact tool name"}
  ],
  "source_url": "https://exact-official-url.com",
  "source_name": "${topic.source}",
  "published_date": "YYYY-MM",
  "tags": ["specific", "relevant", "tags"]
}
Give 4-6 best_practices, 4-6 ranking_factors, and 5-8 checklist_items — all specific and actionable.`;
}

const arr = (v: any): any[] => (Array.isArray(v) ? v : []);

/* Shape a saved algorithm_knowledge row or a freshly generated object
   into the common AlgoDepth structure. */
function toDepth(topic: AlgoTopic, row: any, source: "library" | "generated"): AlgoDepth {
  return {
    topicId:        topic.id,
    title:          row?.title || topic.label,
    engine:         row?.engine || topic.engine,
    category:       row?.category || topic.category,
    summary:        row?.summary || "",
    what_changed:   row?.what_changed || "",
    impact_level:   row?.impact_level || "medium",
    best_practices: arr(row?.best_practices),
    ranking_factors:arr(row?.ranking_factors),
    checklist_items:arr(row?.checklist_items),
    source,
  };
}

/* Read a topic's depth from algorithm_knowledge, matching by the
   tid:<id> tag first, then by title. Returns null if not saved. */
async function readLibrary(topic: AlgoTopic): Promise<any | null> {
  try {
    const { data } = await db().from("algorithm_knowledge").select("*");
    if (!Array.isArray(data)) return null;
    const byTag = data.find((r: any) =>
      arr(r?.tags).includes(`tid:${topic.id}`));
    if (byTag) return byTag;
    const byTitle = data.find((r: any) =>
      (r?.title || "").toLowerCase().trim() === topic.label.toLowerCase().trim());
    return byTitle || null;
  } catch { return null; }
}

/* Generate a topic's depth via AI and save it to algorithm_knowledge
   so it becomes part of the Library for next time. */
async function generateAndSave(topic: AlgoTopic): Promise<AlgoDepth | null> {
  try {
    const ai = new Anthropic();
    const resp = await ai.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 3000,
      system: "You are the world's #1 SEO expert. Return ONLY a raw JSON object. Start with { and end with }. No markdown. No prose.",
      messages: [{ role: "user", content: topicPrompt(topic) }],
    });
    const raw = (resp.content[0] as any)?.type === "text"
      ? (resp.content[0] as any).text : "";
    const parsed = parseJson(raw);
    if (!parsed?.title) return null;

    /* persist into the Library so it is not regenerated next time */
    try {
      const tidTag = `tid:${topic.id}`;
      await db().from("algorithm_knowledge").delete().contains("tags", [tidTag]);
      await db().from("algorithm_knowledge").insert({
        engine:          parsed.engine || topic.engine,
        category:        parsed.category || topic.category,
        title:           parsed.title,
        summary:         parsed.summary || "",
        what_changed:    parsed.what_changed || null,
        impact_level:    parsed.impact_level || "medium",
        best_practices:  arr(parsed.best_practices),
        ranking_factors: arr(parsed.ranking_factors),
        checklist_items: arr(parsed.checklist_items),
        source_url:      parsed.source_url || null,
        source_name:     parsed.source_name || topic.source,
        published_date:  parsed.published_date || null,
        topic:           topic.label,
        tags:            [...new Set([...arr(parsed.tags), tidTag, "pm_generated"])],
        updated_at:      new Date().toISOString(),
      });
    } catch (e: any) {
      console.error("[algo-depth] save failed:", e?.message || e);
      /* generation still usable even if the save failed */
    }
    return toDepth(topic, parsed, "generated");
  } catch (e: any) {
    console.error("[algo-depth] generate failed:", e?.message || e);
    return null;
  }
}

/* Get full depth for one topic — Library row if saved, else generate. */
export async function getTopicDepth(topic: AlgoTopic): Promise<AlgoDepth | null> {
  const saved = await readLibrary(topic);
  if (saved && (arr(saved.checklist_items).length || arr(saved.best_practices).length)) {
    return toDepth(topic, saved, "library");
  }
  return generateAndSave(topic);
}

/* Get depth for several topics in parallel. Bounded — caller should
   pass a sensible slice (≤8) to keep latency and cost in check. */
export async function getTopicsDepth(topics: AlgoTopic[]): Promise<AlgoDepth[]> {
  const results = await Promise.allSettled(topics.map(getTopicDepth));
  return results
    .filter((r): r is PromiseFulfilledResult<AlgoDepth | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((d): d is AlgoDepth => !!d);
}
