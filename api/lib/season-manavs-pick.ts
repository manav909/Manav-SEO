/* ════════════════════════════════════════════════════════════════════
   api/lib/season-manavs-pick.ts
   Phase 21 — Block 2.12 — Manav's Pick external feed engine

   The spend-once architecture:
     1. pullGlobalFeed()       — runs ON-DEMAND when feed is stale
                                 Pulls RSS from whitelist (one set of pulls
                                 serves ALL projects). Dedupes by content_hash.
     2. selectPickForProject() — per-project LLM scoring against project
                                 positioning + active campaigns. Picks the
                                 ONE most relevant + 5-6 secondary items.
                                 Cached 12h in project_knowledge.
     3. getProjectFeed()       — public reader. Reads cache, triggers
                                 pulls if stale, returns shaped feed.

   No synthesis. Every item has its source URL + trust tier + publisher.
   "Why this matters" line is LLM-generated against project context but
   stays under 30 words and is always visually marked as our reasoning.
══════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

const GLOBAL_PULL_TTL_HOURS    = 6;     // refresh global RSS every 6 hours max
const PROJECT_PICK_TTL_HOURS   = 12;    // LLM scoring cached 12h per project
const MAX_ITEMS_PER_SOURCE     = 5;     // cap to keep DB lean
const MAX_FEED_AGE_DAYS        = 14;    // ignore items older than 2 weeks
const MAX_SNIPPET_WORDS        = 40;    // fair-use limit
const PICK_CACHE_KEY           = 'manavs_pick_cache';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

/* ════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════ */

export interface ManavsPickItem {
  id:                string;          // global_feed_items.id
  title:             string;
  excerpt:           string;          // ≤40 words fair-use snippet
  url:               string;          // publisher URL — opens external
  publisher:         string;
  publisher_domain:  string;
  trust_tier:        'T1' | 'T2' | 'T3' | 'T4';
  published_at:      string;
  published_relative: string;
  why_this_matters:  string;          // LLM reasoning, ≤30 words, grounded
  relevance_score:   number;          // 0-100
  category:          string | null;
}

export interface ProjectFeedResponse {
  pick_of_the_day:  ManavsPickItem | null;
  in_your_world:    ManavsPickItem[];     // 5-6 secondary items
  cached_at:        string;
  generated_at:     string;
  source_count:     number;
  honest_note?:     string;
}

/* ════════════════════════════════════════════════════════════════════
   PUBLIC ENTRY — reader
══════════════════════════════════════════════════════════════════════ */

export async function getProjectFeed(opts: {
  projectId: string;
  force?:    boolean;
}): Promise<{ success: boolean; feed?: ProjectFeedResponse; error?: string }> {
  try {
    const projectId = opts.projectId;

    /* Step 1 — serve from cache if fresh */
    if (!opts.force) {
      const cached = await readCache(projectId);
      if (cached && isCacheFresh(cached.cached_at, PROJECT_PICK_TTL_HOURS)) {
        return { success: true, feed: cached };
      }
    }

    /* Step 2 — ensure global feed is fresh enough */
    await ensureGlobalFeedFresh();

    /* Step 3 — select pick for this project (LLM-scored) */
    const feed = await selectPickForProject(projectId);

    /* Step 4 — cache and return */
    await writeCache(projectId, feed);
    return { success: true, feed };
  } catch (e: any) {
    return { success: false, error: e?.message || 'manavs pick read failed' };
  }
}

/* ════════════════════════════════════════════════════════════════════
   GLOBAL FEED PULL (shared across ALL projects)
══════════════════════════════════════════════════════════════════════ */

async function ensureGlobalFeedFresh(): Promise<void> {
  /* Check if ANY source has been pulled in the last GLOBAL_PULL_TTL_HOURS.
     If at least one is fresh, treat global as fresh (don't hammer publishers). */
  try {
    const cutoff = new Date(Date.now() - GLOBAL_PULL_TTL_HOURS * 3600 * 1000).toISOString();
    const { data } = await db().from('feed_sources_whitelist')
      .select('id')
      .eq('active', true)
      .gt('last_pull_at', cutoff)
      .limit(1);
    if (Array.isArray(data) && data.length > 0) return;
  } catch { /* fall through and attempt pull */ }

  await pullGlobalFeed();
}

export async function pullGlobalFeed(): Promise<{ pulled: number; failed: number }> {
  let pulled = 0, failed = 0;
  try {
    const { data: sources } = await db().from('feed_sources_whitelist')
      .select('*')
      .eq('active', true);
    if (!Array.isArray(sources) || sources.length === 0) return { pulled, failed };

    for (const src of sources) {
      try {
        const items = await fetchAndParseRss(src.rss_url);
        if (items.length === 0) {
          await markSourcePull(src.id, 'failed', 'no items parsed');
          failed++;
          continue;
        }
        const newItemIds: string[] = [];
        for (const it of items.slice(0, MAX_ITEMS_PER_SOURCE)) {
          const upsertResult = await upsertGlobalItem({
            source_id:     src.id,
            guid:          it.guid,
            url:           it.url,
            title:         it.title,
            excerpt:       it.excerpt,
            author:        it.author,
            published_at:  it.published_at,
            trust_tier:    src.trust_tier,
            category:      src.category,
            content_hash:  hashContent(it.title + '|' + it.url),
          });
          if (upsertResult?.was_new) newItemIds.push(upsertResult.id);
        }
        await markSourcePull(src.id, 'ok', null);
        pulled++;

        /* Phase 21 Block 2.13 — enrich newly-ingested items.
           Don't block the pull loop on enrichment failures. */
        if (newItemIds.length > 0) {
          try {
            const { enrichFeedItem } = await import('./season-corpus-enrichment.js');
            for (const id of newItemIds) {
              await enrichFeedItem(id);
            }
          } catch { /* swallow — backfill will catch up later */ }
        }
      } catch (e: any) {
        await markSourcePull(src.id, 'failed', String(e?.message || 'unknown').slice(0, 200));
        failed++;
      }
    }

    /* Phase 21 Block 2.13 — TTL removed. Corpus is permanent.
       The pick engine values old articles too if their cross-connection
       to current project state is strong. No garbage collection. */

  } catch { /* swallow */ }
  return { pulled, failed };
}

interface RawRssItem {
  guid:         string;
  url:          string;
  title:        string;
  excerpt:      string;
  author:       string | null;
  published_at: string | null;
}

async function fetchAndParseRss(rssUrl: string): Promise<RawRssItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const r = await fetch(rssUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 SeoSeasonBot/1.0 (+https://seoseason.com)' },
      signal:  controller.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = await r.text();
    return parseRss(xml);
  } finally {
    clearTimeout(timeout);
  }
}

/* Minimal RSS/Atom parser — handles RSS 2.0 + Atom 1.0 without xml lib.
   Robust enough for the major publishers in our whitelist. */
function parseRss(xml: string): RawRssItem[] {
  const items: RawRssItem[] = [];
  /* RSS 2.0 — <item> blocks */
  const rssRe = /<item[\s>][\s\S]*?<\/item>/gi;
  /* Atom 1.0 — <entry> blocks */
  const atomRe = /<entry[\s>][\s\S]*?<\/entry>/gi;
  const blocks = [...xml.matchAll(rssRe), ...xml.matchAll(atomRe)].map(m => m[0]);
  for (const b of blocks) {
    const title       = unescapeXml(extractTag(b, 'title')   || '').trim();
    const link        = (extractAtomLinkHref(b) || extractTag(b, 'link') || extractTag(b, 'guid') || '').trim();
    if (!title || !link) continue;
    const guid        = (extractTag(b, 'guid') || extractTag(b, 'id') || link).trim();
    const description = unescapeXml(stripHtml(extractTag(b, 'description') || extractTag(b, 'summary') || extractTag(b, 'content') || '')).trim();
    const author      = unescapeXml(extractTag(b, 'dc:creator') || extractTag(b, 'author') || '').trim() || null;
    const pubDate     = extractTag(b, 'pubDate') || extractTag(b, 'published') || extractTag(b, 'updated') || '';
    const publishedIso = pubDate ? safeParseDate(pubDate) : null;
    /* Phase 21 Block 2.13 — corpus is permanent. Older articles are kept
       and can still be picked if their cross-connection score is high. */
    const excerptWords = description.split(/\s+/).filter(Boolean);
    const excerpt = excerptWords.slice(0, MAX_SNIPPET_WORDS).join(' ') + (excerptWords.length > MAX_SNIPPET_WORDS ? '…' : '');
    items.push({
      guid,
      url:          link,
      title:        title.slice(0, 300),
      excerpt:      excerpt.slice(0, 400),
      author:       author ? author.slice(0, 150) : null,
      published_at: publishedIso,
    });
  }
  return items;
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag.replace(/[:.]/g, '\\$&')}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag.replace(/[:.]/g, '\\$&')}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function extractAtomLinkHref(xml: string): string {
  /* Atom: <link href="..." rel="alternate" ... /> */
  const m = xml.match(/<link[^>]*\bhref="([^"]+)"[^>]*\/?>/i);
  return m ? m[1] : '';
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

function safeParseDate(s: string): string | null {
  try {
    const t = new Date(s).getTime();
    if (isNaN(t)) return null;
    return new Date(t).toISOString();
  } catch { return null; }
}

function hashContent(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

async function upsertGlobalItem(item: {
  source_id:    string;
  guid:         string;
  url:          string;
  title:        string;
  excerpt:      string;
  author:       string | null;
  published_at: string | null;
  trust_tier:   string;
  category:     string | null;
  content_hash: string;
}): Promise<{ id: string; was_new: boolean } | null> {
  try {
    /* Check if existing — we want to only enrich new items */
    const { data: existing } = await db().from('global_feed_items')
      .select('id, processed_at')
      .eq('source_id', item.source_id)
      .eq('guid', item.guid)
      .maybeSingle();

    const wasNew = !existing;
    /* expires_at is kept far in the future (corpus is now permanent — Block 2.13) */
    const farFuture = new Date(Date.now() + 365 * 86400000 * 10).toISOString();

    const { data: upserted } = await db().from('global_feed_items').upsert({
      source_id:    item.source_id,
      guid:         item.guid,
      url:          item.url,
      title:        item.title,
      excerpt:      item.excerpt,
      author:       item.author,
      published_at: item.published_at,
      trust_tier:   item.trust_tier,
      category:     item.category,
      content_hash: item.content_hash,
      ingested_at:  new Date().toISOString(),
      expires_at:   farFuture,
    }, { onConflict: 'source_id,guid' })
      .select('id, processed_at')
      .single();

    if (!upserted) return null;
    const needsEnrichment = wasNew || !(upserted as any).processed_at;
    return { id: (upserted as any).id, was_new: needsEnrichment };
  } catch {
    return null;
  }
}

async function markSourcePull(sourceId: string, status: 'ok' | 'failed', error: string | null): Promise<void> {
  try {
    await db().from('feed_sources_whitelist').update({
      last_pull_at:    new Date().toISOString(),
      last_pull_status: status,
      last_pull_error:  error,
      updated_at:      new Date().toISOString(),
    }).eq('id', sourceId);
  } catch { /* swallow */ }
}

/* ════════════════════════════════════════════════════════════════════
   PER-PROJECT SELECTION (LLM-scored)
══════════════════════════════════════════════════════════════════════ */

async function selectPickForProject(projectId: string): Promise<ProjectFeedResponse> {
  /* Step 1 — load active items + project context + dismissed set */
  const [items, projectContext, dismissedIds] = await Promise.all([
    readActiveGlobalItems(),
    readProjectContext(projectId),
    readDismissedIds(projectId),
  ]);

  /* Filter dismissed */
  const candidates = items.filter(it => !dismissedIds.has(it.id));

  if (candidates.length === 0) {
    return {
      pick_of_the_day: null,
      in_your_world:   [],
      cached_at:       new Date().toISOString(),
      generated_at:    new Date().toISOString(),
      source_count:    0,
      honest_note:     'No fresh items from the publishers right now. Check back later.',
    };
  }

  /* Step 2 — score with LLM against project context.
     If LLM fails, fall back to chronological top-12. */
  let scored = await scoreItemsWithLLM(candidates, projectContext);
  if (!scored || scored.length === 0) {
    scored = fallbackChronologicalScoring(candidates);
  }

  /* Step 3 — top item = Pick of the Day. Next 5 = In Your World. */
  scored.sort((a, b) => b.relevance_score - a.relevance_score);
  const pick = scored[0] || null;
  const secondary = scored.slice(1, 7);

  return {
    pick_of_the_day: pick,
    in_your_world:   secondary,
    cached_at:       new Date().toISOString(),
    generated_at:    new Date().toISOString(),
    source_count:    items.length,
    honest_note:     projectContext.positioning_loaded
      ? undefined
      : 'Project positioning not resolved yet — picks are based on general SEO relevance until you launch your first campaign.',
  };
}

interface ItemRow {
  id:               string;
  url:              string;
  title:            string;
  excerpt:          string;
  author:           string | null;
  published_at:     string | null;
  trust_tier:       string;
  category:         string | null;
  publisher:        string;
  publisher_domain: string;
}

async function readActiveGlobalItems(): Promise<ItemRow[]> {
  try {
    const { data } = await db().from('global_feed_items')
      .select('id, url, title, excerpt, author, published_at, trust_tier, category, source_id, feed_sources_whitelist!inner(publisher, domain)')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(50);
    return (data as any[] || []).map((r: any) => ({
      id:               r.id,
      url:              r.url,
      title:            r.title,
      excerpt:          r.excerpt || '',
      author:           r.author,
      published_at:     r.published_at,
      trust_tier:       r.trust_tier,
      category:         r.category,
      publisher:        r.feed_sources_whitelist?.publisher || 'Publisher',
      publisher_domain: r.feed_sources_whitelist?.domain || '',
    }));
  } catch { return []; }
}

interface ProjectContext {
  positioning_loaded: boolean;
  positioning_summary: string;
  active_campaigns:    string[];   // primary keywords
  industry_hints:      string[];
}

async function readProjectContext(projectId: string): Promise<ProjectContext> {
  try {
    const [positioningRow, campaignRows] = await Promise.all([
      db().from('project_knowledge')
        .select('field_value')
        .eq('project_id', projectId)
        .eq('category', 'strategy')
        .eq('field_key', 'project_positioning')
        .maybeSingle(),
      db().from('seo_campaigns')
        .select('keyword, keyword_group')
        .eq('project_id', projectId)
        .in('status', ['active', 'paused'])
        .limit(20),
    ]);

    let positioning_loaded = false;
    let positioning_summary = '';
    let industry_hints: string[] = [];
    if ((positioningRow.data as any)?.field_value) {
      try {
        const p = JSON.parse((positioningRow.data as any).field_value);
        positioning_loaded = true;
        positioning_summary = [
          p.industry_label,
          p.market_tier,
          p.business_model,
          p.primary_positioning,
          Array.isArray(p.target_personas) ? p.target_personas.join(', ') : '',
        ].filter(Boolean).join(' · ').slice(0, 400);
        industry_hints = [
          p.industry_label,
          p.market_tier,
          ...(Array.isArray(p.competitor_examples) ? p.competitor_examples.slice(0, 5) : []),
        ].filter(Boolean);
      } catch { /* swallow */ }
    }

    const active_campaigns: string[] = [];
    for (const c of (campaignRows.data as any[] || [])) {
      if (c.keyword) active_campaigns.push(c.keyword);
      if (Array.isArray(c.keyword_group)) active_campaigns.push(...c.keyword_group.slice(0, 3));
    }

    return {
      positioning_loaded,
      positioning_summary,
      active_campaigns: Array.from(new Set(active_campaigns)).slice(0, 15),
      industry_hints:   Array.from(new Set(industry_hints)).slice(0, 8),
    };
  } catch { return { positioning_loaded: false, positioning_summary: '', active_campaigns: [], industry_hints: [] }; }
}

async function readDismissedIds(projectId: string): Promise<Set<string>> {
  try {
    const { data } = await db().from('project_feed_state')
      .select('feed_item_id')
      .eq('project_id', projectId)
      .in('action', ['dismissed', 'skipped']);
    return new Set((data as any[] || []).map(r => r.feed_item_id));
  } catch { return new Set(); }
}

async function scoreItemsWithLLM(items: ItemRow[], context: ProjectContext): Promise<ManavsPickItem[] | null> {
  if (!ANTHROPIC_API_KEY || items.length === 0) return null;

  const itemsForLLM = items.slice(0, 30).map((it, i) => ({
    i,
    title: it.title,
    excerpt: it.excerpt.slice(0, 200),
    publisher: it.publisher,
    trust_tier: it.trust_tier,
    published: it.published_at ? relativeTime(it.published_at) : 'unknown',
  }));

  const contextLines: string[] = [];
  if (context.positioning_summary) contextLines.push(`Positioning: ${context.positioning_summary}`);
  if (context.industry_hints.length) contextLines.push(`Industry hints: ${context.industry_hints.join(', ')}`);
  if (context.active_campaigns.length) contextLines.push(`Active campaign keywords: ${context.active_campaigns.join(', ')}`);
  if (contextLines.length === 0) contextLines.push('No project context — score on general SEO/marketing relevance to a senior strategist.');

  const prompt = `You are a senior digital marketing strategist scoring news items for relevance to a specific client project.

PROJECT CONTEXT:
${contextLines.map(l => '- ' + l).join('\n')}

ITEMS TO SCORE:
${itemsForLLM.map(it => `[${it.i}] ${it.publisher} (${it.trust_tier}) · ${it.published}\nTitle: ${it.title}\nExcerpt: ${it.excerpt}`).join('\n\n')}

For each item, return a relevance score (0-100) and a "why this matters" line specific to THIS project.

Scoring rubric:
- 90-100: directly affects this project's campaigns or industry — strategist would read TODAY
- 70-89: meaningfully relevant to the project's positioning or SEO tactics they use
- 50-69: useful broadly but not urgent for this specific project
- 30-49: tangentially related
- 0-29: off-topic for this project

Rules for "why this matters":
- Maximum 28 words
- Specific to THIS project's context — name the campaign or positioning angle
- No fluff, no "great read" / "must-see"
- If you can't write a specific reason, score it LOW

Return ONLY JSON, no markdown:
{ "scores": [ { "i": 0, "score": 0-100, "why": "string" } ] }
`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 4000,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const text = j?.content?.[0]?.text || '';
    if (!text) return null;
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed?.scores)) return null;

    const scoreMap = new Map<number, { score: number; why: string }>();
    for (const s of parsed.scores) {
      if (typeof s?.i === 'number' && typeof s?.score === 'number') {
        scoreMap.set(s.i, { score: Math.max(0, Math.min(100, s.score)), why: String(s.why || '').slice(0, 200) });
      }
    }

    return items.slice(0, 30).map((it, i): ManavsPickItem => {
      const s = scoreMap.get(i) || { score: 20, why: '' };
      return {
        id:                 it.id,
        title:              it.title,
        excerpt:            it.excerpt,
        url:                it.url,
        publisher:          it.publisher,
        publisher_domain:   it.publisher_domain,
        trust_tier:         (it.trust_tier as any) || 'T2',
        published_at:       it.published_at || new Date().toISOString(),
        published_relative: it.published_at ? relativeTime(it.published_at) : 'unknown',
        why_this_matters:   s.why,
        relevance_score:    s.score,
        category:           it.category,
      };
    }).filter(item => item.relevance_score >= 40);   // drop noise
  } catch {
    return null;
  }
}

function fallbackChronologicalScoring(items: ItemRow[]): ManavsPickItem[] {
  return items.slice(0, 12).map((it, i): ManavsPickItem => ({
    id:                 it.id,
    title:              it.title,
    excerpt:            it.excerpt,
    url:                it.url,
    publisher:          it.publisher,
    publisher_domain:   it.publisher_domain,
    trust_tier:         (it.trust_tier as any) || 'T2',
    published_at:       it.published_at || new Date().toISOString(),
    published_relative: it.published_at ? relativeTime(it.published_at) : 'unknown',
    why_this_matters:   '',
    relevance_score:    60 - i * 4,
    category:           it.category,
  }));
}

/* ════════════════════════════════════════════════════════════════════
   FEEDBACK ACTIONS — save / dismiss / skip
══════════════════════════════════════════════════════════════════════ */

export async function recordFeedAction(opts: {
  projectId:   string;
  feedItemId:  string;
  action:      'saved' | 'dismissed' | 'skipped' | 'asked_chat';
  reason?:     string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await db().from('project_feed_state').upsert({
      project_id:    opts.projectId,
      feed_item_id:  opts.feedItemId,
      action:        opts.action,
      acted_at:      new Date().toISOString(),
      reason:        opts.reason || null,
    }, { onConflict: 'project_id,feed_item_id,action' });

    /* Bust the cache so the next read excludes dismissed items */
    if (opts.action === 'dismissed' || opts.action === 'skipped') {
      await db().from('project_knowledge')
        .delete()
        .eq('project_id', opts.projectId)
        .eq('category', 'war_room_cache')
        .eq('field_key', PICK_CACHE_KEY);
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'feed action failed' };
  }
}

/* ════════════════════════════════════════════════════════════════════
   CACHE — uses project_knowledge category='war_room_cache'
══════════════════════════════════════════════════════════════════════ */

async function readCache(projectId: string): Promise<ProjectFeedResponse | null> {
  try {
    const { data } = await db().from('project_knowledge')
      .select('field_value, updated_at')
      .eq('project_id', projectId)
      .eq('category', 'war_room_cache')
      .eq('field_key', PICK_CACHE_KEY)
      .maybeSingle();
    if (!(data as any)?.field_value) return null;
    const parsed = JSON.parse((data as any).field_value);
    parsed.cached_at = (data as any).updated_at;
    return parsed;
  } catch { return null; }
}

async function writeCache(projectId: string, feed: ProjectFeedResponse): Promise<void> {
  try {
    await db().from('project_knowledge').upsert({
      project_id:  projectId,
      category:    'war_room_cache',
      field_key:   PICK_CACHE_KEY,
      field_value: JSON.stringify(feed),
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'project_id,category,field_key' });
  } catch { /* swallow */ }
}

function isCacheFresh(cachedAt: string | undefined, ttlHours: number): boolean {
  if (!cachedAt) return false;
  const age = Date.now() - new Date(cachedAt).getTime();
  return age < ttlHours * 3600 * 1000;
}

function relativeTime(iso: string): string {
  try {
    const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60); if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);  if (hr < 24)  return `${hr}h ago`;
    const d = Math.floor(hr / 24);    if (d < 30)   return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}
