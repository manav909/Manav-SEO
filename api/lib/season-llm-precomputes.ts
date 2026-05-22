/* ════════════════════════════════════════════════════════════════════
   api/lib/season-llm-precomputes.ts
   Phase 21 — Block 2.12 — LLM pre-compute passes

   Two passes:
     1. getClientQuestions() — "Things the client might ask"
        2-3 grounded questions a client is likely to ask THIS week
        with answers ready, copy-paste-able. Cached 12h.
     2. getClientRecap()     — Weekly recap auto-draft
        Sections: positions moved · campaigns shipped · decisions
        made · what we're working on next. Cached 6h.

   Both cached in project_knowledge.war_room_cache.
   Falls back to deterministic synthesis if LLM unavailable.
══════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

const QUESTIONS_TTL_HOURS = 12;
const RECAP_TTL_HOURS     = 6;
const QUESTIONS_KEY       = 'client_questions_cache';
const RECAP_KEY           = 'client_recap_cache';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

/* ════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════ */

export interface ClientQuestion {
  id:           string;
  question:     string;       // the question a client might ask
  answer:       string;       // the drafted answer, copy-paste ready
  grounded_in:  string[];     // which data points support the answer
  tone:         'reassuring' | 'transparent' | 'strategic';
}

export interface ClientQuestionsResponse {
  questions:    ClientQuestion[];
  cached_at:    string;
  generated_at: string;
}

export interface ClientRecapSection {
  heading: string;
  bullets: string[];
}

export interface ClientRecapResponse {
  intro:        string;             // 1-2 sentence opener
  sections:     ClientRecapSection[];
  next_week:    string[];           // 2-3 bullets for "what we're working on next"
  email_body:   string;             // assembled email-ready text
  cached_at:    string;
  generated_at: string;
  honest_note?: string;
}

/* ════════════════════════════════════════════════════════════════════
   1. CLIENT QUESTIONS
══════════════════════════════════════════════════════════════════════ */

export async function getClientQuestions(opts: {
  projectId: string;
  force?:    boolean;
}): Promise<{ success: boolean; data?: ClientQuestionsResponse; error?: string }> {
  try {
    const projectId = opts.projectId;
    if (!opts.force) {
      const cached = await readCache(projectId, QUESTIONS_KEY);
      if (cached && isCacheFresh(cached.cached_at, QUESTIONS_TTL_HOURS)) {
        return { success: true, data: cached };
      }
    }
    const context = await readProjectStateBundle(projectId);
    const questions = await callLlmForQuestions(context) || synthesizeQuestionsFallback(context);
    const result: ClientQuestionsResponse = {
      questions,
      cached_at:    new Date().toISOString(),
      generated_at: new Date().toISOString(),
    };
    await writeCache(projectId, QUESTIONS_KEY, result);
    return { success: true, data: result };
  } catch (e: any) {
    return { success: false, error: e?.message || 'client questions failed' };
  }
}

async function callLlmForQuestions(ctx: ProjectStateBundle): Promise<ClientQuestion[] | null> {
  if (!ANTHROPIC_API_KEY) return null;
  const facts = bundleToFacts(ctx);
  if (facts.length === 0) return null;

  const prompt = `You are a senior digital marketing strategist anticipating what a client will ask THIS week, given the current state of their project.

PROJECT STATE:
${facts.map(f => '- ' + f).join('\n')}

Generate 2-3 questions the client is most likely to ask, with answers drafted in their voice (calm, transparent, action-oriented).

Rules:
- Questions must be specific to the data above. No generic "how's SEO going?".
- Answers under 60 words, copy-paste ready into an email.
- Cite the supporting data within the answer.
- If a question implies bad news (regression, missed pacing), answer with honest transparency — don't spin.

Return ONLY JSON:
{
  "questions": [
    {
      "question": "string",
      "answer": "string",
      "grounded_in": ["data point 1", "data point 2"],
      "tone": "reassuring|transparent|strategic"
    }
  ]
}
`;

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
        max_tokens: 2000,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const text = j?.content?.[0]?.text || '';
    if (!text) return null;
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed?.questions)) return null;
    return parsed.questions.slice(0, 3).map((q: any, i: number): ClientQuestion => ({
      id:          `cq-${i}-${Date.now()}`,
      question:    String(q.question || '').slice(0, 200),
      answer:      String(q.answer || '').slice(0, 500),
      grounded_in: Array.isArray(q.grounded_in) ? q.grounded_in.map(String).slice(0, 5) : [],
      tone:        (['reassuring', 'transparent', 'strategic'].includes(q.tone) ? q.tone : 'transparent') as any,
    }));
  } catch { return null; }
}

function synthesizeQuestionsFallback(ctx: ProjectStateBundle): ClientQuestion[] {
  /* Deterministic fallback: build questions from the most striking facts */
  const out: ClientQuestion[] = [];
  if (ctx.falling_top) {
    out.push({
      id:          `cq-fall-${Date.now()}`,
      question:    `Why did "${ctx.falling_top.query}" drop in rankings?`,
      answer:      `It dropped ${Math.abs(ctx.falling_top.delta || 0)} positions this period. We're investigating whether it's content age, a competitor refresh, or an algorithm shift. We'll have a diagnosis and remediation plan in the next briefing.`,
      grounded_in: [`Falling stars from analytics intelligence`],
      tone:        'transparent',
    });
  }
  if (ctx.recoverable_top) {
    out.push({
      id:          `cq-rec-${Date.now()}`,
      question:    `What's the next quick win we can run?`,
      answer:      `"${ctx.recoverable_top.query}" is at position ${Number(ctx.recoverable_top.position).toFixed(1)} with ${ctx.recoverable_top.impressions} impressions/month. It's within reach for page 1 — we can run a focused campaign this week.`,
      grounded_in: [`GSC recoverable opportunities`],
      tone:        'strategic',
    });
  }
  if (ctx.campaign_count > 0) {
    out.push({
      id:          `cq-progress-${Date.now()}`,
      question:    `How are the active campaigns progressing?`,
      answer:      `${ctx.campaign_count} campaign${ctx.campaign_count === 1 ? '' : 's'} active. ${ctx.pillar_runs_week} pillar runs shipped this week with ${ctx.critical_findings} critical findings flagged. Full pillar reports are in the dashboard.`,
      grounded_in: [`seo_campaigns table`, `pillar_reports last 7 days`],
      tone:        'reassuring',
    });
  }
  return out.slice(0, 3);
}

/* ════════════════════════════════════════════════════════════════════
   2. CLIENT RECAP
══════════════════════════════════════════════════════════════════════ */

export async function getClientRecap(opts: {
  projectId: string;
  force?:    boolean;
}): Promise<{ success: boolean; data?: ClientRecapResponse; error?: string }> {
  try {
    const projectId = opts.projectId;
    if (!opts.force) {
      const cached = await readCache(projectId, RECAP_KEY);
      if (cached && isCacheFresh(cached.cached_at, RECAP_TTL_HOURS)) {
        return { success: true, data: cached };
      }
    }
    const context = await readProjectStateBundle(projectId);
    const recap = await callLlmForRecap(context) || synthesizeRecapFallback(context);
    await writeCache(projectId, RECAP_KEY, recap);
    return { success: true, data: recap };
  } catch (e: any) {
    return { success: false, error: e?.message || 'client recap failed' };
  }
}

async function callLlmForRecap(ctx: ProjectStateBundle): Promise<ClientRecapResponse | null> {
  if (!ANTHROPIC_API_KEY) return null;
  const facts = bundleToFacts(ctx);
  if (facts.length === 0) return null;

  const prompt = `You are a senior digital marketing strategist drafting this week's recap email for a client.

PROJECT STATE (this week):
${facts.map(f => '- ' + f).join('\n')}

Draft a weekly recap with:
- 1-2 sentence intro (warm, professional, signals the week's tone)
- 3 sections: "Where positions moved" · "What we shipped" · "Decisions on your behalf"
- Each section: 2-4 bullets, specific to the data, no fluff
- "Next week" — 2-3 bullets of what's planned, grounded in actual pillar cadence or pending opportunities
- Assemble all of it into an "email_body" string formatted for direct paste into an email client (no markdown, plain paragraphs and line breaks)

Tone: honest, calm, no hype. If nothing moved, say so. If something dropped, address it directly.

Return ONLY JSON:
{
  "intro": "string",
  "sections": [
    { "heading": "Where positions moved", "bullets": ["string"] },
    { "heading": "What we shipped", "bullets": ["string"] },
    { "heading": "Decisions on your behalf", "bullets": ["string"] }
  ],
  "next_week": ["string"],
  "email_body": "string"
}
`;

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
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const text = j?.content?.[0]?.text || '';
    if (!text) return null;
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      intro:        String(parsed.intro || '').slice(0, 500),
      sections:     Array.isArray(parsed.sections) ? parsed.sections.slice(0, 4).map((s: any) => ({
        heading: String(s.heading || '').slice(0, 100),
        bullets: Array.isArray(s.bullets) ? s.bullets.map(String).slice(0, 6) : [],
      })) : [],
      next_week:    Array.isArray(parsed.next_week) ? parsed.next_week.map(String).slice(0, 4) : [],
      email_body:   String(parsed.email_body || '').slice(0, 4000),
      cached_at:    new Date().toISOString(),
      generated_at: new Date().toISOString(),
    };
  } catch { return null; }
}

function synthesizeRecapFallback(ctx: ProjectStateBundle): ClientRecapResponse {
  const sections: ClientRecapSection[] = [];

  const positions: string[] = [];
  if (ctx.rising_top) positions.push(`"${ctx.rising_top.query}" climbed ${Math.abs(ctx.rising_top.delta || 0)} positions.`);
  if (ctx.falling_top) positions.push(`"${ctx.falling_top.query}" dropped ${Math.abs(ctx.falling_top.delta || 0)} positions — we're investigating.`);
  if (positions.length === 0) positions.push('No major position shifts this week.');
  sections.push({ heading: 'Where positions moved', bullets: positions });

  const shipped: string[] = [];
  if (ctx.campaigns_updated_week > 0) shipped.push(`${ctx.campaigns_updated_week} campaign update${ctx.campaigns_updated_week === 1 ? '' : 's'} this week.`);
  if (ctx.pillar_runs_week > 0) shipped.push(`${ctx.pillar_runs_week} pillar report${ctx.pillar_runs_week === 1 ? '' : 's'} delivered.`);
  if (ctx.opportunities_week > 0) shipped.push(`${ctx.opportunities_week} new opportunit${ctx.opportunities_week === 1 ? 'y' : 'ies'} surfaced for review.`);
  if (shipped.length === 0) shipped.push('Quiet execution week — see the dashboard for daily activity.');
  sections.push({ heading: 'What we shipped', bullets: shipped });

  const decisions: string[] = [];
  if (ctx.decisions_count > 0) decisions.push(`${ctx.decisions_count} strategic decision${ctx.decisions_count === 1 ? '' : 's'} made on your behalf — see the decisions log for the audit trail.`);
  else decisions.push('No significant strategic decisions required your attention this week.');
  sections.push({ heading: 'Decisions on your behalf', bullets: decisions });

  const nextWeek: string[] = [];
  if (ctx.overdue_pillars > 0) nextWeek.push(`Refresh ${ctx.overdue_pillars} overdue pillar report${ctx.overdue_pillars === 1 ? '' : 's'}.`);
  if (ctx.recoverable_top) nextWeek.push(`Launch a focused push on "${ctx.recoverable_top.query}" (currently pos ${Number(ctx.recoverable_top.position).toFixed(1)}).`);
  if (ctx.opportunities_open > 5) nextWeek.push(`Triage the ${ctx.opportunities_open} opportunities in the inbox.`);
  if (nextWeek.length === 0) nextWeek.push('Continue current campaigns and monitor positions.');

  const intro = ctx.campaign_count > 0
    ? `Here's the recap for this week — ${ctx.campaign_count} campaign${ctx.campaign_count === 1 ? '' : 's'} in motion across the project.`
    : `Here's the recap for this week.`;

  const emailLines: string[] = [intro, ''];
  for (const sec of sections) {
    emailLines.push(sec.heading);
    for (const b of sec.bullets) emailLines.push('  • ' + b);
    emailLines.push('');
  }
  emailLines.push('Next week:');
  for (const b of nextWeek) emailLines.push('  • ' + b);

  return {
    intro,
    sections,
    next_week: nextWeek,
    email_body: emailLines.join('\n'),
    cached_at:    new Date().toISOString(),
    generated_at: new Date().toISOString(),
    honest_note: 'Drafted from project data — review before sending.',
  };
}

/* ════════════════════════════════════════════════════════════════════
   SHARED — project state bundle
══════════════════════════════════════════════════════════════════════ */

interface ProjectStateBundle {
  campaign_count:          number;
  campaigns_updated_week:  number;
  pillar_runs_week:        number;
  opportunities_open:      number;
  opportunities_week:      number;
  critical_findings:       number;
  warning_findings:        number;
  overdue_pillars:         number;
  decisions_count:         number;
  rising_top:              { query: string; delta: number | null; position: number } | null;
  falling_top:             { query: string; delta: number | null; position: number } | null;
  recoverable_top:         { query: string; position: number; impressions: number } | null;
  positioning_summary:     string;
}

async function readProjectStateBundle(projectId: string): Promise<ProjectStateBundle> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86400000).toISOString();
  const [campaigns, reports, opps, intel, gsc, positioning, panels] = await Promise.all([
    db().from('seo_campaigns').select('id, decisions_avoided, updated_at')
      .eq('project_id', projectId).in('status', ['active', 'paused']),
    (async () => {
      const ids = (await db().from('seo_campaigns').select('id').eq('project_id', projectId)).data as any[] || [];
      const idArray = ids.map(r => r.id);
      if (idArray.length === 0) return { data: [] };
      return await db().from('pillar_reports')
        .select('id, findings, generated_at, status')
        .in('campaign_id', idArray)
        .gte('generated_at', weekAgo);
    })(),
    db().from('seo_opportunities').select('id, created_at')
      .eq('project_id', projectId).eq('status', 'open'),
    (async () => {
      const r = await db().from('project_knowledge')
        .select('field_value')
        .eq('project_id', projectId).eq('category', 'analytics').eq('field_key', 'analytics_intel_bundle')
        .maybeSingle();
      return (r.data as any)?.field_value ? JSON.parse((r.data as any).field_value) : null;
    })(),
    (async () => {
      const r = await db().from('project_knowledge')
        .select('field_value')
        .eq('project_id', projectId).eq('category', 'analytics').eq('field_key', 'gsc_top_queries')
        .maybeSingle();
      return (r.data as any)?.field_value ? JSON.parse((r.data as any).field_value) : [];
    })(),
    (async () => {
      const r = await db().from('project_knowledge')
        .select('field_value')
        .eq('project_id', projectId).eq('category', 'strategy').eq('field_key', 'project_positioning')
        .maybeSingle();
      if (!(r.data as any)?.field_value) return '';
      try {
        const p = JSON.parse((r.data as any).field_value);
        return [p.industry_label, p.market_tier, p.primary_positioning].filter(Boolean).join(' · ');
      } catch { return ''; }
    })(),
    db().from('seo_pillar_panels').select('id, next_recheck_at, campaign_id'),
  ]);

  const campaignList = (campaigns.data as any[] || []);
  const projectCampaignIds = new Set(campaignList.map(c => c.id));
  const overduePanels = (panels.data as any[] || [])
    .filter(p => projectCampaignIds.has(p.campaign_id) && p.next_recheck_at && new Date(p.next_recheck_at).getTime() < now);

  const reportsList = (reports.data as any[] || []);
  const critical = reportsList.reduce((s, r) =>
    s + (Array.isArray(r.findings) ? r.findings.filter((f: any) => f?.severity === 'critical').length : 0), 0);
  const warning = reportsList.reduce((s, r) =>
    s + (Array.isArray(r.findings) ? r.findings.filter((f: any) => f?.severity === 'warning').length : 0), 0);

  let decisionsCount = 0;
  for (const c of campaignList) {
    const d = Array.isArray(c.decisions_avoided) ? c.decisions_avoided : [];
    decisionsCount += d.filter((x: any) => x?.timestamp && new Date(x.timestamp).getTime() >= now - 7 * 86400000).length;
  }

  const rising = Array.isArray(intel?.risingStars) && intel.risingStars[0];
  const falling = Array.isArray(intel?.fallingStars) && intel.fallingStars[0];
  const recoverableList = (gsc || []).filter((q: any) =>
    q && (q.impressions || 0) >= 20 && (q.position || 99) >= 10 && (q.position || 0) <= 30);
  const recoverableTop = recoverableList.sort((a: any, b: any) => (b.impressions || 0) - (a.impressions || 0))[0];

  const oppsList = opps.data as any[] || [];
  return {
    campaign_count:         campaignList.length,
    campaigns_updated_week: campaignList.filter(c => new Date(c.updated_at || 0).getTime() >= now - 7 * 86400000).length,
    pillar_runs_week:       reportsList.length,
    opportunities_open:     oppsList.length,
    opportunities_week:     oppsList.filter(o => new Date(o.created_at || 0).getTime() >= now - 7 * 86400000).length,
    critical_findings:      critical,
    warning_findings:       warning,
    overdue_pillars:        overduePanels.length,
    decisions_count:        decisionsCount,
    rising_top:             rising ? { query: (rising as any).query || (rising as any).page || '', delta: (rising as any).delta != null ? Number((rising as any).delta) : null, position: Number((rising as any).position || 0) } : null,
    falling_top:            falling ? { query: (falling as any).query || (falling as any).page || '', delta: (falling as any).delta != null ? Number((falling as any).delta) : null, position: Number((falling as any).position || 0) } : null,
    recoverable_top:        recoverableTop ? { query: recoverableTop.query, position: Number(recoverableTop.position || 0), impressions: Number(recoverableTop.impressions || 0) } : null,
    positioning_summary:    positioning || '',
  };
}

function bundleToFacts(b: ProjectStateBundle): string[] {
  const facts: string[] = [];
  if (b.positioning_summary) facts.push(`Project positioning: ${b.positioning_summary}`);
  facts.push(`${b.campaign_count} active campaign${b.campaign_count === 1 ? '' : 's'}`);
  facts.push(`${b.campaigns_updated_week} campaign update${b.campaigns_updated_week === 1 ? '' : 's'} this week`);
  facts.push(`${b.pillar_runs_week} pillar run${b.pillar_runs_week === 1 ? '' : 's'} this week`);
  facts.push(`${b.critical_findings} critical, ${b.warning_findings} warning findings flagged`);
  if (b.opportunities_open > 0) facts.push(`${b.opportunities_open} opportunities pending in inbox`);
  if (b.opportunities_week > 0) facts.push(`${b.opportunities_week} new opportunities this week`);
  if (b.overdue_pillars > 0) facts.push(`${b.overdue_pillars} pillar recheck${b.overdue_pillars === 1 ? '' : 's'} overdue`);
  if (b.decisions_count > 0) facts.push(`${b.decisions_count} strategic decisions made this week`);
  if (b.rising_top) facts.push(`Rising: "${b.rising_top.query}" ${b.rising_top.delta != null ? `+${b.rising_top.delta} positions` : 'climbing'}`);
  if (b.falling_top) facts.push(`Falling: "${b.falling_top.query}" ${b.falling_top.delta != null ? `${b.falling_top.delta} positions` : 'dropped'}`);
  if (b.recoverable_top) facts.push(`Recoverable: "${b.recoverable_top.query}" at pos ${b.recoverable_top.position.toFixed(1)}, ${b.recoverable_top.impressions} imp/mo`);
  return facts;
}

/* ════════════════════════════════════════════════════════════════════
   CACHE
══════════════════════════════════════════════════════════════════════ */

async function readCache(projectId: string, key: string): Promise<any | null> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_value, updated_at")
      .eq("project_id", projectId)
      .eq("category", "war_room_cache")
      .eq("field_key", key)
      .maybeSingle();
    if (!(data as any)?.field_value) return null;
    const parsed = JSON.parse((data as any).field_value);
    parsed.cached_at = (data as any).updated_at;
    return parsed;
  } catch { return null; }
}

async function writeCache(projectId: string, key: string, value: any): Promise<void> {
  try {
    await db().from("project_knowledge").upsert({
      project_id:  projectId,
      category:    "war_room_cache",
      field_key:   key,
      field_value: JSON.stringify(value),
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'project_id,category,field_key' });
  } catch { /* swallow */ }
}

function isCacheFresh(cachedAt: string | undefined, ttlHours: number): boolean {
  if (!cachedAt) return false;
  const age = Date.now() - new Date(cachedAt).getTime();
  return age < ttlHours * 3600 * 1000;
}
