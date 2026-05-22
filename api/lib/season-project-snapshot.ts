/* ════════════════════════════════════════════════════════════════════
   api/lib/season-project-snapshot.ts
   Phase 21 — Block 2.13 — Per-project knowledge snapshot

   Materializes everything we know about a project into a single
   matchable row, refreshed daily. The Pick engine joins corpus items
   against this snapshot.

   Sources:
     • project_positioning      → topic_tags, entities, market context
     • seo_campaigns            → active_keywords
     • pillar_reports (14d)     → recent_findings
     • project_knowledge.gsc    → recent_movements
     • analytics_intel_bundle   → entities (competitor mentions), movements

   Cost: zero LLM. DB reads + structured transforms.
══════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

const RECENT_DAYS = 14;
const MAX_TAGS    = 25;
const MAX_ENTITIES = 30;
const MAX_KEYWORDS = 30;
const MAX_FINDINGS = 20;
const MAX_MOVEMENTS = 15;

export interface ProjectSnapshot {
  project_id:         string;
  taken_at:           string;
  snapshot_date:      string;
  topic_tags:         string[];
  entities:           string[];
  active_keywords:    string[];
  recent_findings:    Array<{ kind: string; title: string; severity: string; timestamp: string }>;
  recent_movements:   Array<{ query: string; direction: 'up' | 'down'; delta: number | null; position: number | null; captured_at: string }>;
  context_summary:    string;
  positioning_loaded: boolean;
}

/* ════════════════════════════════════════════════════════════════════
   PUBLIC ENTRY
══════════════════════════════════════════════════════════════════════ */

export async function ensureSnapshotForToday(projectId: string): Promise<{
  success: boolean; snapshot?: ProjectSnapshot; error?: string;
}> {
  try {
    const today = isoDate(new Date());
    const { data: existing } = await db().from('project_knowledge_snapshot')
      .select('*')
      .eq('project_id', projectId)
      .eq('snapshot_date', today)
      .maybeSingle();
    if (existing) return { success: true, snapshot: rowToSnapshot(existing as any) };

    const snapshot = await buildSnapshot(projectId);
    /* Upsert (also handles the race where two requests build the same day) */
    await db().from('project_knowledge_snapshot').upsert({
      project_id:         snapshot.project_id,
      taken_at:           snapshot.taken_at,
      snapshot_date:      snapshot.snapshot_date,
      topic_tags:         snapshot.topic_tags,
      entities:           snapshot.entities,
      active_keywords:    snapshot.active_keywords,
      recent_findings:    snapshot.recent_findings,
      recent_movements:   snapshot.recent_movements,
      context_summary:    snapshot.context_summary,
      positioning_loaded: snapshot.positioning_loaded,
    }, { onConflict: 'project_id,snapshot_date' });
    return { success: true, snapshot };
  } catch (e: any) {
    return { success: false, error: e?.message || 'snapshot failed' };
  }
}

/* Force-refresh a snapshot mid-day (e.g. after a campaign is launched) */
export async function refreshSnapshotNow(projectId: string): Promise<{
  success: boolean; snapshot?: ProjectSnapshot; error?: string;
}> {
  try {
    const snapshot = await buildSnapshot(projectId);
    await db().from('project_knowledge_snapshot').upsert({
      project_id:         snapshot.project_id,
      taken_at:           snapshot.taken_at,
      snapshot_date:      snapshot.snapshot_date,
      topic_tags:         snapshot.topic_tags,
      entities:           snapshot.entities,
      active_keywords:    snapshot.active_keywords,
      recent_findings:    snapshot.recent_findings,
      recent_movements:   snapshot.recent_movements,
      context_summary:    snapshot.context_summary,
      positioning_loaded: snapshot.positioning_loaded,
    }, { onConflict: 'project_id,snapshot_date' });
    return { success: true, snapshot };
  } catch (e: any) {
    return { success: false, error: e?.message || 'refresh failed' };
  }
}

/* ════════════════════════════════════════════════════════════════════
   BUILDER
══════════════════════════════════════════════════════════════════════ */

async function buildSnapshot(projectId: string): Promise<ProjectSnapshot> {
  const now = new Date();
  const cutoffIso = new Date(now.getTime() - RECENT_DAYS * 86400000).toISOString();

  const [positioningRow, campaigns, pillarReports, intelBundle, gscQueries] = await Promise.all([
    readProjectPositioning(projectId),
    readActiveCampaigns(projectId),
    readRecentPillarReports(projectId, cutoffIso),
    readAnalyticsIntelBundle(projectId),
    readGscTopQueries(projectId),
  ]);

  /* Derive topic tags from positioning + campaigns + pillar findings */
  const topicTags = new Set<string>();
  if (positioningRow) {
    if (positioningRow.industry_label) topicTags.add(slugify(positioningRow.industry_label));
    if (positioningRow.market_tier) topicTags.add(slugify(positioningRow.market_tier));
    if (positioningRow.business_model) topicTags.add(slugify(positioningRow.business_model));
    if (Array.isArray(positioningRow.target_personas)) {
      for (const p of positioningRow.target_personas.slice(0, 5)) topicTags.add(slugify(p));
    }
  }
  /* Heuristic: scan campaign keywords for SEO subtopics */
  for (const c of campaigns) {
    if (c.keyword) {
      const kwTags = inferTopicsFromKeyword(c.keyword);
      for (const t of kwTags) topicTags.add(t);
    }
  }
  /* Pillar finding tags */
  for (const r of pillarReports) {
    const kindTag = slugify(r.kind || '');
    if (kindTag) topicTags.add(kindTag);
  }

  /* Derive entities */
  const entities = new Set<string>();
  if (positioningRow) {
    if (Array.isArray(positioningRow.competitor_examples)) {
      for (const e of positioningRow.competitor_examples.slice(0, 10)) entities.add(String(e).slice(0, 60));
    }
    if (positioningRow.industry_label) entities.add(positioningRow.industry_label.slice(0, 60));
  }

  /* Active keywords */
  const activeKeywords = new Set<string>();
  for (const c of campaigns) {
    if (c.keyword) activeKeywords.add(c.keyword.toLowerCase().slice(0, 100));
    if (Array.isArray(c.keyword_group)) {
      for (const k of c.keyword_group.slice(0, 3)) activeKeywords.add(String(k).toLowerCase().slice(0, 100));
    }
  }

  /* Recent findings (compact) */
  const findings: ProjectSnapshot['recent_findings'] = [];
  for (const r of pillarReports) {
    if (!Array.isArray(r.findings)) continue;
    for (const f of r.findings.slice(0, 4)) {
      if (!f || (f.severity !== 'critical' && f.severity !== 'warning')) continue;
      findings.push({
        kind:      r.kind || 'unknown',
        title:     String(f.title || f.description || '').slice(0, 200),
        severity:  String(f.severity || 'info'),
        timestamp: r.generated_at || new Date().toISOString(),
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }

  /* Recent movements — combine rising + falling stars */
  const movements: ProjectSnapshot['recent_movements'] = [];
  if (intelBundle) {
    for (const r of (intelBundle.risingStars || []).slice(0, 5)) {
      movements.push({
        query:       String(r.query || r.page || '').slice(0, 150),
        direction:   'up',
        delta:       r.delta != null ? Number(r.delta) : null,
        position:    r.position != null ? Number(r.position) : null,
        captured_at: intelBundle._refresh || new Date().toISOString(),
      });
    }
    for (const f of (intelBundle.fallingStars || []).slice(0, 5)) {
      movements.push({
        query:       String(f.query || f.page || '').slice(0, 150),
        direction:   'down',
        delta:       f.delta != null ? Number(f.delta) : null,
        position:    f.position != null ? Number(f.position) : null,
        captured_at: intelBundle._refresh || new Date().toISOString(),
      });
    }
  }

  /* Build a compact context summary */
  const contextLines: string[] = [];
  if (positioningRow?.industry_label) contextLines.push(`Industry: ${positioningRow.industry_label}`);
  if (positioningRow?.market_tier) contextLines.push(`Market tier: ${positioningRow.market_tier}`);
  if (positioningRow?.primary_positioning) contextLines.push(`Positioning: ${positioningRow.primary_positioning.slice(0, 150)}`);
  contextLines.push(`${campaigns.length} active campaigns`);
  if (findings.length > 0) contextLines.push(`${findings.length} recent critical/warning findings`);
  if (movements.length > 0) contextLines.push(`${movements.length} notable position movements last ${RECENT_DAYS}d`);

  return {
    project_id:         projectId,
    taken_at:           now.toISOString(),
    snapshot_date:      isoDate(now),
    topic_tags:         Array.from(topicTags).filter(Boolean).slice(0, MAX_TAGS),
    entities:           Array.from(entities).filter(Boolean).slice(0, MAX_ENTITIES),
    active_keywords:    Array.from(activeKeywords).filter(Boolean).slice(0, MAX_KEYWORDS),
    recent_findings:    findings,
    recent_movements:   movements.slice(0, MAX_MOVEMENTS),
    context_summary:    contextLines.join(' · ').slice(0, 600),
    positioning_loaded: !!positioningRow,
  };
}

/* ════════════════════════════════════════════════════════════════════
   READERS
══════════════════════════════════════════════════════════════════════ */

async function readProjectPositioning(projectId: string): Promise<any | null> {
  try {
    const { data } = await db().from('project_knowledge')
      .select('field_value')
      .eq('project_id', projectId)
      .eq('category', 'strategy')
      .eq('field_key', 'project_positioning')
      .maybeSingle();
    if (!(data as any)?.field_value) return null;
    return JSON.parse((data as any).field_value);
  } catch { return null; }
}

async function readActiveCampaigns(projectId: string): Promise<any[]> {
  try {
    const { data } = await db().from('seo_campaigns')
      .select('id, keyword, keyword_group, current_position, updated_at, status')
      .eq('project_id', projectId)
      .in('status', ['active', 'paused'])
      .limit(30);
    return data as any[] || [];
  } catch { return []; }
}

async function readRecentPillarReports(projectId: string, sinceIso: string): Promise<any[]> {
  try {
    const { data: campaignRows } = await db().from('seo_campaigns').select('id').eq('project_id', projectId);
    const ids = (campaignRows as any[] || []).map(r => r.id);
    if (ids.length === 0) return [];
    const { data } = await db().from('pillar_reports')
      .select('id, kind, findings, generated_at, status')
      .in('campaign_id', ids)
      .gte('generated_at', sinceIso)
      .order('generated_at', { ascending: false })
      .limit(40);
    return data as any[] || [];
  } catch { return []; }
}

async function readAnalyticsIntelBundle(projectId: string): Promise<any | null> {
  try {
    const { data } = await db().from('project_knowledge')
      .select('field_value, updated_at')
      .eq('project_id', projectId)
      .eq('category', 'analytics')
      .eq('field_key', 'analytics_intel_bundle')
      .maybeSingle();
    if (!(data as any)?.field_value) return null;
    const intel = JSON.parse((data as any).field_value);
    intel._refresh = (data as any).updated_at;
    return intel;
  } catch { return null; }
}

async function readGscTopQueries(projectId: string): Promise<any[]> {
  try {
    const { data } = await db().from('project_knowledge')
      .select('field_value')
      .eq('project_id', projectId)
      .eq('category', 'analytics')
      .eq('field_key', 'gsc_top_queries')
      .maybeSingle();
    if (!(data as any)?.field_value) return [];
    return JSON.parse((data as any).field_value) || [];
  } catch { return []; }
}

/* ════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════ */

function rowToSnapshot(row: any): ProjectSnapshot {
  return {
    project_id:         row.project_id,
    taken_at:           row.taken_at,
    snapshot_date:      row.snapshot_date,
    topic_tags:         Array.isArray(row.topic_tags) ? row.topic_tags : [],
    entities:           Array.isArray(row.entities) ? row.entities : [],
    active_keywords:    Array.isArray(row.active_keywords) ? row.active_keywords : [],
    recent_findings:    Array.isArray(row.recent_findings) ? row.recent_findings : [],
    recent_movements:   Array.isArray(row.recent_movements) ? row.recent_movements : [],
    context_summary:    row.context_summary || '',
    positioning_loaded: !!row.positioning_loaded,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function slugify(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function inferTopicsFromKeyword(kw: string): string[] {
  const k = kw.toLowerCase();
  const out: string[] = [];
  if (/\b(low.?code|no.?code)\b/.test(k)) out.push('low_code');
  if (/\benterprise\b/.test(k)) out.push('enterprise_seo');
  if (/\b(b2b|saas)\b/.test(k)) out.push('b2b_marketing');
  if (/\b(ecommerce|shop|store)\b/.test(k)) out.push('ecommerce');
  if (/\b(local|near.me)\b/.test(k)) out.push('local_seo');
  if (/\b(content|blog|article)\b/.test(k)) out.push('content_strategy');
  if (/\b(link|backlink)\b/.test(k)) out.push('link_building');
  if (/\b(technical|core.web.vitals|crawl|index|schema)\b/.test(k)) out.push('technical_seo');
  if (/\b(ai|llm|gpt|chatgpt)\b/.test(k)) out.push('ai_content');
  return out;
}
