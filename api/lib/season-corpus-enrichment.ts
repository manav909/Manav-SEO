/* ════════════════════════════════════════════════════════════════════
   api/lib/season-corpus-enrichment.ts
   Phase 21 — Block 2.13 — Enrichment pass for the permanent corpus

   When a new article lands in global_feed_items, this pass runs to extract:
     • topic_tags       — domain topics ['technical_seo', 'core_update', ...]
     • entities         — proper-noun entities ['Google', 'MUM', 'Mendix', ...]
     • key_claims       — structured factual claims the article makes
     • content_summary  — ≤200 char neutral factual summary

   The output becomes the matchable surface for the Pick engine's
   candidate filter. Without enrichment, an article sits dormant in
   the corpus until either backfill or new ingestion enriches it.

   Cost: ~$0.005 per article. ~30 new articles per day across the
   whitelist = ~$0.15/day shared across all projects.
══════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";
const ENRICH_BATCH_SIZE = 5;   // process N items per backfill pass
const MAX_TAGS  = 8;
const MAX_ENTITIES = 10;
const MAX_CLAIMS = 5;

/* ════════════════════════════════════════════════════════════════════
   PUBLIC ENTRY
══════════════════════════════════════════════════════════════════════ */

/* Enrich a single feed item by ID. Called inline after ingestion.
   Idempotent — if processed_at is set, no-ops. */
export async function enrichFeedItem(feedItemId: string): Promise<{
  success: boolean; enriched?: boolean; error?: string;
}> {
  try {
    const { data } = await db().from('global_feed_items')
      .select('id, title, excerpt, processed_at')
      .eq('id', feedItemId)
      .maybeSingle();
    if (!data) return { success: false, error: 'feed item not found' };
    if ((data as any).processed_at) return { success: true, enriched: false };

    const enrichment = await callEnrichmentLLM((data as any).title, (data as any).excerpt || '');
    if (!enrichment) {
      /* Mark as processed even on failure so we don't retry forever */
      await db().from('global_feed_items').update({ processed_at: new Date().toISOString() }).eq('id', feedItemId);
      return { success: true, enriched: false };
    }

    await db().from('global_feed_items').update({
      topic_tags:      enrichment.topic_tags,
      entities:        enrichment.entities,
      key_claims:      enrichment.key_claims,
      content_summary: enrichment.content_summary,
      processed_at:    new Date().toISOString(),
    }).eq('id', feedItemId);

    return { success: true, enriched: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'enrichment failed' };
  }
}

/* Backfill — enrich up to N unprocessed items. For initial corpus
   population and catch-up after a long downtime. Safe to call repeatedly. */
export async function enrichCorpusBatch(opts?: { limit?: number }): Promise<{
  success: boolean; enriched: number; failed: number; remaining: number;
}> {
  const limit = Math.min(opts?.limit || ENRICH_BATCH_SIZE, 20);
  let enriched = 0, failed = 0, remaining = 0;
  try {
    const { data } = await db().from('global_feed_items')
      .select('id, title, excerpt')
      .is('processed_at', null)
      .order('ingested_at', { ascending: false })
      .limit(limit);

    const items = (data as any[] || []);
    for (const it of items) {
      const r = await enrichFeedItem(it.id);
      if (r.success && r.enriched) enriched++;
      else if (!r.success) failed++;
    }

    /* Count how many are still unprocessed */
    const { count } = await db().from('global_feed_items')
      .select('id', { count: 'exact', head: true })
      .is('processed_at', null);
    remaining = count || 0;

    return { success: true, enriched, failed, remaining };
  } catch (e: any) {
    return { success: false, enriched, failed, remaining };
  }
}

/* ════════════════════════════════════════════════════════════════════
   LLM CALL
══════════════════════════════════════════════════════════════════════ */

interface EnrichmentResult {
  topic_tags:      string[];
  entities:        string[];
  key_claims:      Array<{ claim: string; subject: string }>;
  content_summary: string;
}

async function callEnrichmentLLM(title: string, excerpt: string): Promise<EnrichmentResult | null> {
  if (!ANTHROPIC_API_KEY) return null;
  if (!title.trim()) return null;

  const prompt = `Analyze this article excerpt and extract structured metadata. Be factual, neutral, no opinion.

TITLE: ${title}
EXCERPT: ${excerpt || '(no excerpt available — work from title only)'}

Extract:
1. topic_tags: 3-${MAX_TAGS} lowercase snake_case topics this article covers
   Examples: technical_seo, core_update, enterprise_sales, ai_content, ecommerce, schema_markup, link_building, ux_signals, mobile_first, page_experience, e_e_a_t, local_seo, b2b_marketing, content_strategy
   Be specific. Avoid generic tags like "marketing" or "google".

2. entities: 0-${MAX_ENTITIES} proper-noun entities (companies, products, technologies, people)
   Examples: Google, Bing, ChatGPT, Mendix, Webflow, John Mueller, Search Console, Core Web Vitals

3. key_claims: 0-${MAX_CLAIMS} structured factual claims the article makes
   Shape: { claim: "what is claimed", subject: "what/who the claim is about" }
   Only include claims explicitly in the excerpt. Don't infer.

4. content_summary: ≤200 char neutral factual one-line summary

Return JSON only, no markdown fences:
{
  "topic_tags": ["string"],
  "entities": ["string"],
  "key_claims": [{ "claim": "string", "subject": "string" }],
  "content_summary": "string"
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 1000,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const text = j?.content?.[0]?.text || '';
    if (!text) return null;
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      topic_tags:      Array.isArray(parsed.topic_tags) ? parsed.topic_tags.map((t: any) => String(t).toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40)).filter(Boolean).slice(0, MAX_TAGS) : [],
      entities:        Array.isArray(parsed.entities) ? parsed.entities.map((e: any) => String(e).slice(0, 60)).filter(Boolean).slice(0, MAX_ENTITIES) : [],
      key_claims:      Array.isArray(parsed.key_claims) ? parsed.key_claims.slice(0, MAX_CLAIMS).map((c: any) => ({
        claim:   String(c?.claim || '').slice(0, 240),
        subject: String(c?.subject || '').slice(0, 80),
      })).filter((c: any) => c.claim) : [],
      content_summary: String(parsed.content_summary || '').slice(0, 200),
    };
  } catch {
    return null;
  }
}
