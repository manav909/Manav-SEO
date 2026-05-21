/* ════════════════════════════════════════════════════════════════
   api/lib/season-knowledge-cache.ts
   Phase 12 — Local knowledge cache.

   This is what makes S.E.A.S.O.N. mature in operations: instead of
   web-searching for "what is the helpful content update" every time,
   we cache the answer the first time we learn it, then refer to
   the cache as ready-to-use context.

   What gets cached:
     • Algorithm patterns (helpful_content_2024, EEAT_signals, etc.)
     • Keyword research results (per project, per keyword)
     • Competitor snapshots (their structure, top pages, content angles)
     • SERP feature signatures (what kind of SERP a query gets)
     • Industry benchmarks (CTR by position, conversion rates)
     • Writing patterns Manav has approved (his voice signature)

   Each entry has freshness — algorithms stay valid 90 days, keyword
   research 30 days, competitor snapshots 14 days, industry benchmarks
   180 days.

   Usage tracking lets us see which knowledge is actually being used
   so we know what to refresh first.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

export type KnowledgeType =
  | 'algorithm_pattern'
  | 'keyword_research'
  | 'competitor_snapshot'
  | 'content_structure'
  | 'serp_features'
  | 'industry_benchmark'
  | 'writing_pattern'
  | 'other';

const DEFAULT_FRESHNESS_DAYS: Record<KnowledgeType, number> = {
  algorithm_pattern:   90,
  keyword_research:    30,
  competitor_snapshot: 14,
  content_structure:   60,
  serp_features:       30,
  industry_benchmark:  180,
  writing_pattern:     365,  // Manav's voice signature is long-lived
  other:               30,
};

export interface KnowledgeEntry {
  id:           string;
  projectId:    string | null;
  knowledgeType: KnowledgeType;
  key:          string;
  value:        any;
  summary?:     string;
  source?:      string;
  sourceUrls?:  string[];
  confidence:   number;
  usageCount:   number;
  freshUntil?:  string;
  staleAt?:     string;
  createdAt:    string;
  updatedAt:    string;
}

/* ─── Write ───────────────────────────────────────────────── */

export async function cacheKnowledge(opts: {
  projectId?:    string | null;
  knowledgeType: KnowledgeType;
  key:           string;
  value:         any;
  summary?:      string;
  source?:       string;
  sourceUrls?:   string[];
  confidence?:   number;
  freshnessDays?: number;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const freshnessDays = opts.freshnessDays ?? DEFAULT_FRESHNESS_DAYS[opts.knowledgeType];
  const freshUntil = new Date(Date.now() + freshnessDays * 86_400_000).toISOString();
  const staleAt    = new Date(Date.now() + freshnessDays * 2 * 86_400_000).toISOString();

  try {
    /* Upsert pattern — same key gets updated */
    const existingQ = db().from("season_knowledge_cache")
      .select("id, usage_count")
      .eq("knowledge_type", opts.knowledgeType)
      .eq("key", opts.key);
    if (opts.projectId) existingQ.eq("project_id", opts.projectId);
    else                 existingQ.is("project_id", null);
    const { data: existing } = await existingQ.maybeSingle();

    if (existing) {
      const { error } = await db().from("season_knowledge_cache")
        .update({
          value:        opts.value,
          summary:      opts.summary ? String(opts.summary).slice(0, 500) : null,
          source:       opts.source || null,
          source_urls:  opts.sourceUrls || null,
          confidence:   opts.confidence ?? 0.7,
          fresh_until:  freshUntil,
          stale_at:     staleAt,
        })
        .eq("id", (existing as any).id);
      if (error) return { success: false, error: error.message };
      return { success: true, id: (existing as any).id };
    } else {
      const { data: inserted, error } = await db().from("season_knowledge_cache")
        .insert({
          project_id:      opts.projectId || null,
          knowledge_type:  opts.knowledgeType,
          key:             opts.key,
          value:           opts.value,
          summary:         opts.summary ? String(opts.summary).slice(0, 500) : null,
          source:          opts.source || null,
          source_urls:     opts.sourceUrls || null,
          confidence:      opts.confidence ?? 0.7,
          fresh_until:     freshUntil,
          stale_at:        staleAt,
        })
        .select("id")
        .maybeSingle();
      if (error) return { success: false, error: error.message };
      return { success: true, id: (inserted as any)?.id };
    }
  } catch (e: any) {
    return { success: false, error: e?.message || "cache write failed" };
  }
}

/* ─── Read ────────────────────────────────────────────────── */

export async function getKnowledge(opts: {
  projectId?:    string | null;
  knowledgeType: KnowledgeType;
  key:           string;
  allowStale?:   boolean;
}): Promise<KnowledgeEntry | null> {
  try {
    const q = db().from("season_knowledge_cache")
      .select("*")
      .eq("knowledge_type", opts.knowledgeType)
      .eq("key", opts.key);
    if (opts.projectId) q.eq("project_id", opts.projectId);
    else                 q.is("project_id", null);

    const { data } = await q.maybeSingle();
    if (!data) return null;
    const row = data as any;

    /* Freshness check */
    if (!opts.allowStale && row.stale_at) {
      const stale = new Date(row.stale_at).getTime();
      if (Date.now() > stale) return null;
    }

    /* Bump usage */
    await db().from("season_knowledge_cache").update({
      usage_count: (row.usage_count || 0) + 1,
      last_used_at: new Date().toISOString(),
    }).eq("id", row.id);

    return {
      id:            row.id,
      projectId:     row.project_id,
      knowledgeType: row.knowledge_type,
      key:           row.key,
      value:         row.value,
      summary:       row.summary,
      source:        row.source,
      sourceUrls:    row.source_urls,
      confidence:    Number(row.confidence ?? 0.7),
      usageCount:    Number(row.usage_count ?? 0) + 1,
      freshUntil:    row.fresh_until,
      staleAt:       row.stale_at,
      createdAt:     row.created_at,
      updatedAt:     row.updated_at,
    };
  } catch {
    return null;
  }
}

/* List knowledge for a type — useful when synthesizing across cached items */
export async function listKnowledge(opts: {
  projectId?:    string | null;
  knowledgeType: KnowledgeType;
  prefix?:       string;
  limit?:        number;
}): Promise<KnowledgeEntry[]> {
  try {
    const q = db().from("season_knowledge_cache")
      .select("*")
      .eq("knowledge_type", opts.knowledgeType)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .limit(Math.min(opts.limit || 20, 100));
    if (opts.projectId !== undefined) {
      if (opts.projectId) q.eq("project_id", opts.projectId);
      else                q.is("project_id", null);
    }
    if (opts.prefix) q.ilike("key", `${opts.prefix}%`);

    const { data } = await q;
    return ((data || []) as any[]).map(r => ({
      id:            r.id,
      projectId:     r.project_id,
      knowledgeType: r.knowledge_type,
      key:           r.key,
      value:         r.value,
      summary:       r.summary,
      source:        r.source,
      sourceUrls:    r.source_urls,
      confidence:    Number(r.confidence ?? 0.7),
      usageCount:    Number(r.usage_count ?? 0),
      freshUntil:    r.fresh_until,
      staleAt:       r.stale_at,
      createdAt:     r.created_at,
      updatedAt:     r.updated_at,
    }));
  } catch {
    return [];
  }
}
