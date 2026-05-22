/* ════════════════════════════════════════════════════════════════════
   api/lib/season-pick-engine.ts
   Phase 21 — Block 2.13 — The Manav's Pick intelligence engine

   The cross-connection brain. Per project, daily (or on-demand):
     1. CANDIDATE FILTER (cheap, DB)
        Match corpus items where topic_tags or entities overlap with
        the project snapshot. Returns ~30-50 candidates.

     2. CONNECTION SCORING (LLM, single batched call)
        For each candidate, score the strength of the cross-connection
        to the project's current state (0-100). Not "is this article
        good" — "does this article + project state create insight".

     3. PICK ASSEMBLY (LLM)
        If top connection ≥ RELEVANCE_THRESHOLD, generate the insight
        body + 5 role frames + traceable citations.

     4. PERSISTENCE
        - If a new pick is generated, mark the previous current pick
          as superseded.
        - If today's top connection is the same as yesterday's pick
          (same lead citation), KEEP yesterday's pick — no churn.

     5. FALLBACK
        If no candidate clears the bar, return the current pick (if
        still relevant) or no pick at all with an honest note.

   Cost per project per day:
     • Candidate filter: $0
     • Scoring (1 LLM call, batched): ~$0.03
     • Assembly (1 LLM call, only if pick threshold met): ~$0.06
     • Total: ~$0.10/project/day, less if no pick generated
══════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { ensureSnapshotForToday, type ProjectSnapshot } from "./season-project-snapshot.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

const MAX_CANDIDATES_SCORED = 40;      // hard cap on items sent to scorer
const RELEVANCE_THRESHOLD   = 65;      // below this, no pick is shown
const PICK_PERSIST_DAYS_MAX = 3;       // a pick can stay current up to 3 days

export type RoleKey = 'sales' | 'hod' | 'pm' | 'content_writer' | 'seo_executive';

export interface ManavsPickFrame {
  role:     RoleKey;
  headline: string;
  body:     string;
}

export interface ExternalCitation {
  feed_item_id:  string;
  url:           string;
  publisher:     string;
  title:         string;
  ingested_at:   string;
}

export interface InternalCitation {
  source_table: string;
  source_field: string;
  value:        string;
  captured_at:  string;
  label:        string;
}

export interface ManavsPickRow {
  id:                  string;
  project_id:          string;
  picked_at:           string;
  insight_headline:    string;
  insight_body:        string;
  frames:              ManavsPickFrame[];
  external_citations:  ExternalCitation[];
  internal_citations:  InternalCitation[];
  connection_score:    number;
  relevance_score:     number;
  is_current:          boolean;
  superseded_by:       string | null;
  superseded_at:       string | null;
  generated_by_model:  string | null;
  generation_cost:     number | null;
  created_at:          string;
}

/* ════════════════════════════════════════════════════════════════════
   PUBLIC ENTRIES
══════════════════════════════════════════════════════════════════════ */

/* Get the current pick for a project. Generates a new one if:
   - No current pick exists, OR
   - The current pick is older than PICK_PERSIST_DAYS_MAX, OR
   - opts.force is true
   Otherwise returns the existing current pick (preserving continuity). */
export async function getCurrentPick(opts: {
  projectId: string; force?: boolean;
}): Promise<{ success: boolean; pick: ManavsPickRow | null; honest_note?: string; error?: string }> {
  try {
    const projectId = opts.projectId;
    const current = await readCurrentPick(projectId);

    /* Decide whether to regenerate */
    let shouldRegenerate = opts.force === true;
    if (!current) shouldRegenerate = true;
    else {
      const ageMs = Date.now() - new Date(current.picked_at).getTime();
      if (ageMs > PICK_PERSIST_DAYS_MAX * 86400000) shouldRegenerate = true;
      else if (ageMs > 86400000) {
        /* Once per day, check if there's a higher-relevance candidate now */
        const fresher = await checkForFresherPick(projectId, current);
        if (fresher) shouldRegenerate = true;
      }
    }

    if (!shouldRegenerate) return { success: true, pick: current };

    const generated = await generatePickForProject(projectId);
    if (generated.pick) {
      /* Demote any existing current pick */
      if (current && current.id !== generated.pick.id) {
        await db().from('manavs_picks').update({
          is_current:    false,
          superseded_by: generated.pick.id,
          superseded_at: new Date().toISOString(),
        }).eq('id', current.id);
      }
      return { success: true, pick: generated.pick, honest_note: generated.honest_note };
    }
    /* No new pick generated — keep current if still acceptable, else null */
    if (current) {
      return {
        success: true,
        pick: current,
        honest_note: 'Nothing crossed the relevance threshold today. Yesterday\'s pick remains.',
      };
    }
    return {
      success: true,
      pick: null,
      honest_note: generated.honest_note || 'Nothing crossed the relevance threshold yet. The engine learns more with each day.',
    };
  } catch (e: any) {
    return { success: false, pick: null, error: e?.message || 'pick engine failed' };
  }
}

/* List historical picks for a project — the archive. */
export async function getPickArchive(opts: {
  projectId: string;
  limit?:    number;
  before?:   string;
}): Promise<{ success: boolean; picks: ManavsPickRow[]; total: number; error?: string }> {
  try {
    const limit = Math.min(opts.limit || 20, 100);
    let q = db().from('manavs_picks')
      .select('*', { count: 'exact' })
      .eq('project_id', opts.projectId)
      .order('picked_at', { ascending: false });
    if (opts.before) q = q.lt('picked_at', opts.before);
    const { data, count } = await q.limit(limit);
    const picks = (data as any[] || []).map(rowToPick);
    return { success: true, picks, total: count || 0 };
  } catch (e: any) {
    return { success: false, picks: [], total: 0, error: e?.message };
  }
}

/* Force-regenerate (admin / testing). */
export async function regeneratePickNow(projectId: string): Promise<{
  success: boolean; pick: ManavsPickRow | null; honest_note?: string; error?: string;
}> {
  return getCurrentPick({ projectId, force: true });
}

/* ════════════════════════════════════════════════════════════════════
   ENGINE — generate a new pick
══════════════════════════════════════════════════════════════════════ */

async function generatePickForProject(projectId: string): Promise<{
  pick: ManavsPickRow | null;
  honest_note?: string;
}> {
  /* Step 1 — ensure snapshot */
  const snapR = await ensureSnapshotForToday(projectId);
  if (!snapR.success || !snapR.snapshot) {
    return { pick: null, honest_note: 'Could not build project knowledge snapshot.' };
  }
  const snapshot = snapR.snapshot;

  /* Step 2 — candidate filter */
  const candidates = await filterCandidates(snapshot);
  if (candidates.length === 0) {
    return { pick: null, honest_note: 'No corpus items match this project\'s topics yet. As articles accumulate, picks will start to surface.' };
  }

  /* Step 3 — score candidates via LLM */
  const scored = await scoreCandidates(candidates, snapshot);
  if (!scored || scored.length === 0) {
    return { pick: null, honest_note: 'Scoring step unavailable right now. Try again shortly.' };
  }

  scored.sort((a, b) => b.connection_score - a.connection_score);
  const top = scored[0];
  if (!top || top.connection_score < RELEVANCE_THRESHOLD) {
    return { pick: null, honest_note: `Highest cross-connection score today was ${top?.connection_score || 0}/100 — below the bar (${RELEVANCE_THRESHOLD}). The engine waits.` };
  }

  /* Step 4 — assembly with 5 role frames */
  /* Use top 1-3 candidates as supporting external citations */
  const supportingItems = scored.slice(0, 3).filter(s => s.connection_score >= 55).map(s => s.item);
  const assembled = await assembleInsight(supportingItems, snapshot);
  if (!assembled) {
    return { pick: null, honest_note: 'Insight assembly unavailable right now. Try again shortly.' };
  }

  /* Step 5 — persist */
  const externalCitations: ExternalCitation[] = supportingItems.map(it => ({
    feed_item_id: it.id,
    url:          it.url,
    publisher:    it.publisher,
    title:        it.title,
    ingested_at:  it.ingested_at,
  }));

  const internalCitations: InternalCitation[] = buildInternalCitations(snapshot);

  const inserted = await db().from('manavs_picks').insert({
    project_id:          projectId,
    picked_at:           new Date().toISOString(),
    insight_headline:    assembled.insight_headline,
    insight_body:        assembled.insight_body,
    frames:              assembled.frames,
    external_citations:  externalCitations,
    internal_citations:  internalCitations,
    connection_score:    top.connection_score,
    relevance_score:     top.connection_score,
    is_current:          true,
    generated_by_model:  MODEL,
    generation_cost:     0.09,
  }).select('*').single();

  if (inserted.error || !inserted.data) {
    return { pick: null, honest_note: 'Persistence failed — engine ran but pick could not be saved.' };
  }

  /* Mark the source articles as having been picked */
  for (const it of supportingItems) {
    try {
      const { data: existing } = await db().from('global_feed_items')
        .select('picked_for_projects')
        .eq('id', it.id)
        .maybeSingle();
      const currentList = Array.isArray((existing as any)?.picked_for_projects) ? (existing as any).picked_for_projects : [];
      if (!currentList.includes(projectId)) currentList.push(projectId);
      await db().from('global_feed_items').update({
        was_pick:            true,
        picked_for_projects: currentList,
      }).eq('id', it.id);
    } catch { /* swallow */ }
  }

  return { pick: rowToPick(inserted.data as any) };
}

/* ════════════════════════════════════════════════════════════════════
   CANDIDATE FILTER
══════════════════════════════════════════════════════════════════════ */

interface CorpusItem {
  id:               string;
  url:              string;
  title:            string;
  excerpt:          string;
  publisher:        string;
  publisher_domain: string;
  trust_tier:       string;
  topic_tags:       string[];
  entities:         string[];
  key_claims:       any[];
  content_summary:  string;
  published_at:     string | null;
  ingested_at:      string;
  category:         string | null;
}

async function filterCandidates(snapshot: ProjectSnapshot): Promise<CorpusItem[]> {
  /* Strategy: query corpus where topic_tags OR entities OR active_keywords overlap.
     If snapshot has no tags yet (cold start), fall back to most recent corpus. */
  try {
    const allItems: any[] = [];
    const seen = new Set<string>();

    const collect = async (items: any[] | null) => {
      if (!Array.isArray(items)) return;
      for (const it of items) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        allItems.push(it);
      }
    };

    /* Match by topic tag overlap */
    if (snapshot.topic_tags.length > 0) {
      const { data } = await db().from('global_feed_items')
        .select('id, url, title, excerpt, trust_tier, topic_tags, entities, key_claims, content_summary, published_at, ingested_at, category, source_id, feed_sources_whitelist!inner(publisher, domain)')
        .not('processed_at', 'is', null)
        .overlaps('topic_tags', snapshot.topic_tags)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(60);
      await collect(data as any[]);
    }

    /* Match by entity overlap */
    if (snapshot.entities.length > 0 && allItems.length < MAX_CANDIDATES_SCORED) {
      const { data } = await db().from('global_feed_items')
        .select('id, url, title, excerpt, trust_tier, topic_tags, entities, key_claims, content_summary, published_at, ingested_at, category, source_id, feed_sources_whitelist!inner(publisher, domain)')
        .not('processed_at', 'is', null)
        .overlaps('entities', snapshot.entities)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(40);
      await collect(data as any[]);
    }

    /* Cold start fallback — most recent processed items */
    if (allItems.length === 0) {
      const { data } = await db().from('global_feed_items')
        .select('id, url, title, excerpt, trust_tier, topic_tags, entities, key_claims, content_summary, published_at, ingested_at, category, source_id, feed_sources_whitelist!inner(publisher, domain)')
        .not('processed_at', 'is', null)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(MAX_CANDIDATES_SCORED);
      await collect(data as any[]);
    }

    return allItems.slice(0, MAX_CANDIDATES_SCORED).map((r: any): CorpusItem => ({
      id:               r.id,
      url:              r.url,
      title:            r.title,
      excerpt:          r.excerpt || '',
      publisher:        r.feed_sources_whitelist?.publisher || 'Publisher',
      publisher_domain: r.feed_sources_whitelist?.domain || '',
      trust_tier:       r.trust_tier || 'T2',
      topic_tags:       Array.isArray(r.topic_tags) ? r.topic_tags : [],
      entities:         Array.isArray(r.entities) ? r.entities : [],
      key_claims:       Array.isArray(r.key_claims) ? r.key_claims : [],
      content_summary:  r.content_summary || '',
      published_at:     r.published_at,
      ingested_at:      r.ingested_at,
      category:         r.category,
    }));
  } catch { return []; }
}

/* ════════════════════════════════════════════════════════════════════
   SCORING (LLM)
══════════════════════════════════════════════════════════════════════ */

interface ScoredCandidate {
  item:              CorpusItem;
  connection_score:  number;
  why:               string;
}

async function scoreCandidates(items: CorpusItem[], snapshot: ProjectSnapshot): Promise<ScoredCandidate[] | null> {
  if (!ANTHROPIC_API_KEY || items.length === 0) return null;

  const projectContext = buildProjectContextBlock(snapshot);
  const itemsForLLM = items.map((it, i) => ({
    i,
    publisher: it.publisher,
    title:     it.title.slice(0, 160),
    summary:   it.content_summary || it.excerpt.slice(0, 160),
    tags:      it.topic_tags.slice(0, 6).join(','),
    entities:  it.entities.slice(0, 6).join(','),
    age_days:  it.published_at ? Math.floor((Date.now() - new Date(it.published_at).getTime()) / 86400000) : null,
  }));

  const prompt = `You are scoring news articles for cross-connection strength to a specific project's current state.

CROSS-CONNECTION means: does this article + the project's current internal state (positioning, findings, movements, campaigns) create a non-obvious insight someone on the team would benefit from knowing?

Higher scores are NOT for "good articles". Higher scores are for articles whose information, when joined with what this project is currently doing, surfaces something useful — a connection, a risk, an opportunity, a pattern, a warning.

PROJECT STATE:
${projectContext}

ARTICLES (some may be old — age does not reduce score if the connection is strong):
${itemsForLLM.map(it => `[${it.i}] ${it.publisher} · ${it.age_days != null ? it.age_days + 'd old' : 'unknown age'} · tags:${it.tags} · entities:${it.entities}
  Title: ${it.title}
  Summary: ${it.summary}`).join('\n\n')}

Scoring rubric:
- 85-100: STRONG cross-connection — article + project state forms an insight the team should know NOW
- 70-84: meaningful connection — relevant overlap but insight is more obvious
- 50-69: tangential overlap — topics match but no clear insight emerges
- 0-49: weak/no connection

For each article, give a score and a concise "why" — name the specific cross-connection (which article fact connects to which project fact).

Return ONLY JSON, no markdown:
{ "scores": [ { "i": number, "score": 0-100, "why": "specific cross-connection in ≤30 words" } ] }`;

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
        max_tokens: 4000,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(45_000),
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
        scoreMap.set(s.i, {
          score: Math.max(0, Math.min(100, s.score)),
          why:   String(s.why || '').slice(0, 200),
        });
      }
    }

    return items.map((it, i): ScoredCandidate => {
      const s = scoreMap.get(i) || { score: 0, why: '' };
      return { item: it, connection_score: s.score, why: s.why };
    });
  } catch { return null; }
}

/* ════════════════════════════════════════════════════════════════════
   INSIGHT ASSEMBLY (LLM)
══════════════════════════════════════════════════════════════════════ */

interface AssembledInsight {
  insight_headline: string;
  insight_body:     string;
  frames:           ManavsPickFrame[];
}

async function assembleInsight(supportingItems: CorpusItem[], snapshot: ProjectSnapshot): Promise<AssembledInsight | null> {
  if (!ANTHROPIC_API_KEY || supportingItems.length === 0) return null;

  const projectContext = buildProjectContextBlock(snapshot);
  const articlesBlock = supportingItems.map((it, i) => `[Source ${i + 1}] ${it.publisher} — "${it.title}"
URL: ${it.url}
Summary: ${it.content_summary || it.excerpt.slice(0, 200)}
Published: ${it.published_at || 'unknown'}`).join('\n\n');

  const prompt = `You are Manav's Pick — the engine that surfaces a daily insight by cross-connecting external publishing signal with this project's internal state.

PROJECT STATE:
${projectContext}

SOURCE ARTICLES (the external signal):
${articlesBlock}

Your task: write ONE insight that connects facts from the article(s) with facts from the project state.

STRICT RULES:
1. NO synthesis. NO invented statistics. NO predicted outcomes that aren't in sources.
2. Every factual claim must come from either (a) the articles above, or (b) the project state above.
3. The "insight" is the CONNECTION between facts, not a new fact.
4. State the connection in plain language. Name what's in the articles. Name what's in the project state. Name how they relate.
5. Length: insight_body ≤ 120 words, traceable to its sources.
6. If the connection is weak, say so plainly — don't dress it up.

Then write the SAME insight in 5 role frames. Same underlying connection, different angle. Each frame: headline (≤80 chars) + body (≤80 words).

Roles:
- "sales"           — what a sales person should know to talk to prospects
- "hod"             — what the Head of Department should know for resource/strategy decisions
- "pm"              — what the Project Manager should know for planning/sequencing
- "content_writer"  — what the content writer should know for upcoming pieces
- "seo_executive"   — what the SEO executive on the ground should action

Return ONLY JSON, no markdown:
{
  "insight_headline": "≤100 char headline naming the connection",
  "insight_body": "≤120 word insight, traceable to sources",
  "frames": [
    { "role": "sales",          "headline": "...", "body": "..." },
    { "role": "hod",            "headline": "...", "body": "..." },
    { "role": "pm",             "headline": "...", "body": "..." },
    { "role": "content_writer", "headline": "...", "body": "..." },
    { "role": "seo_executive",  "headline": "...", "body": "..." }
  ]
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
        max_tokens: 3000,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const text = j?.content?.[0]?.text || '';
    if (!text) return null;
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.insight_headline || !parsed.insight_body || !Array.isArray(parsed.frames)) return null;

    const validRoles: RoleKey[] = ['sales', 'hod', 'pm', 'content_writer', 'seo_executive'];
    const frames: ManavsPickFrame[] = validRoles.map(role => {
      const f = parsed.frames.find((x: any) => x?.role === role);
      return {
        role,
        headline: f ? String(f.headline || '').slice(0, 200) : '',
        body:     f ? String(f.body || '').slice(0, 600) : '',
      };
    }).filter(f => f.headline || f.body);

    return {
      insight_headline: String(parsed.insight_headline).slice(0, 200),
      insight_body:     String(parsed.insight_body).slice(0, 1000),
      frames,
    };
  } catch { return null; }
}

/* ════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════ */

function buildProjectContextBlock(s: ProjectSnapshot): string {
  const lines: string[] = [];
  if (s.context_summary) lines.push(s.context_summary);
  if (s.active_keywords.length) lines.push(`Active keywords: ${s.active_keywords.slice(0, 10).join(', ')}`);
  if (s.entities.length) lines.push(`Tracked entities: ${s.entities.slice(0, 8).join(', ')}`);
  if (s.recent_findings.length > 0) {
    lines.push(`Recent findings (last 14d):`);
    for (const f of s.recent_findings.slice(0, 6)) {
      lines.push(`  - [${f.severity}] ${f.kind}: ${f.title}`);
    }
  }
  if (s.recent_movements.length > 0) {
    lines.push(`Recent movements:`);
    for (const m of s.recent_movements.slice(0, 6)) {
      lines.push(`  - "${m.query}" ${m.direction === 'up' ? '+' : '-'}${Math.abs(m.delta || 0)} positions${m.position != null ? ` (now pos ${m.position.toFixed(1)})` : ''}`);
    }
  }
  return lines.join('\n');
}

function buildInternalCitations(s: ProjectSnapshot): InternalCitation[] {
  const out: InternalCitation[] = [];
  for (const f of s.recent_findings.slice(0, 5)) {
    out.push({
      source_table: 'pillar_reports',
      source_field: 'findings',
      value:        f.title,
      captured_at:  f.timestamp,
      label:        `${f.kind} · ${f.severity} finding`,
    });
  }
  for (const m of s.recent_movements.slice(0, 5)) {
    out.push({
      source_table: 'project_knowledge.analytics_intel_bundle',
      source_field: m.direction === 'up' ? 'risingStars' : 'fallingStars',
      value:        `"${m.query}" ${m.direction === 'up' ? '+' : '-'}${Math.abs(m.delta || 0)} positions`,
      captured_at:  m.captured_at,
      label:        m.direction === 'up' ? 'Rising query' : 'Falling query',
    });
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════
   PERSISTENCE — readers + transformers
══════════════════════════════════════════════════════════════════════ */

async function readCurrentPick(projectId: string): Promise<ManavsPickRow | null> {
  try {
    const { data } = await db().from('manavs_picks')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .maybeSingle();
    if (!data) return null;
    return rowToPick(data as any);
  } catch { return null; }
}

async function checkForFresherPick(_projectId: string, _current: ManavsPickRow): Promise<boolean> {
  /* Stub for now — the daily-age check above already triggers regen.
     Future enhancement: lightweight scoring pass on top 10 unprocessed
     items to see if any score higher than current's score. */
  return false;
}

function rowToPick(row: any): ManavsPickRow {
  return {
    id:                  row.id,
    project_id:          row.project_id,
    picked_at:           row.picked_at,
    insight_headline:    row.insight_headline,
    insight_body:        row.insight_body,
    frames:              Array.isArray(row.frames) ? row.frames : [],
    external_citations:  Array.isArray(row.external_citations) ? row.external_citations : [],
    internal_citations:  Array.isArray(row.internal_citations) ? row.internal_citations : [],
    connection_score:    Number(row.connection_score) || 0,
    relevance_score:     Number(row.relevance_score) || 0,
    is_current:          !!row.is_current,
    superseded_by:       row.superseded_by || null,
    superseded_at:       row.superseded_at || null,
    generated_by_model:  row.generated_by_model || null,
    generation_cost:     row.generation_cost != null ? Number(row.generation_cost) : null,
    created_at:          row.created_at || row.picked_at,
  };
}
