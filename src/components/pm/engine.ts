/* ════════════════════════════════════════════════════════════════
   src/components/pm/engine.ts
   PM Module — expert sequencing engine.

   Pure functions, no side effects, no storage dependency. This is the
   SEO domain intelligence: where each task type belongs in a campaign
   timeline, what impact a placement has, what to do next, and how much
   effort a card represents.

   Recovered and adapted from the original Intelligence Playground
   (Playground.tsx @ 8b16e31) — logic preserved, retyped to TaskCard.
════════════════════════════════════════════════════════════════ */

import type {
  TaskCard, CardType, Priority, SuggestionLevel,
  PlacementSuggestion, NextMove,
} from './types';

/* ── Week columns ── */
export const WEEK_COLUMNS = [
  { week: 1, label: 'Week 1', sub: 'Foundation' },
  { week: 2, label: 'Week 2', sub: 'Build' },
  { week: 3, label: 'Week 3', sub: 'Accelerate' },
  { week: 4, label: 'Week 4', sub: 'Compound' },
  { week: 5, label: 'Backlog', sub: 'Long-term' },
];

/* ════════════════════════════════════════════════════
   EXPERT placement rules — per type, per week
════════════════════════════════════════════════════ */
type Rule = {
  level: SuggestionLevel;
  headline: string;
  reason: string;
  impact: string;
  best: number[];
};
type RuleSet = Partial<Record<number, Rule>> & { defaultBest: number[] };

const EXPERT: Record<CardType, RuleSet> = {
  'quick-win': {
    defaultBest: [1],
    1: { level: 'best',    headline: 'Perfect — do this first',      reason: 'Quick wins in Week 1 build early momentum and validate the approach before longer commitments.', impact: 'Early ranking signals within 48-72h. Client confidence rises immediately.', best: [1] },
    2: { level: 'good',    headline: 'Still early enough',           reason: 'Week 2 preserves most momentum value — acceptable if Week 1 is at capacity.',                  impact: 'Slight delay in early signals — still impactful.', best: [1] },
    3: { level: 'ok',      headline: 'Getting late',                 reason: 'Three weeks in, a quick win risks becoming deprioritised.',                                     impact: 'Reduced urgency. Compounding opportunity shrinks.', best: [1, 2] },
    4: { level: 'caution', headline: 'Too late — move earlier',      reason: 'Quick wins that take 4 weeks to schedule become technical debt.',                               impact: 'Missed early momentum and compounding opportunity.', best: [1] },
    5: { level: 'caution', headline: 'Do not backlog quick wins',    reason: 'Quick wins disappear in the backlog indefinitely. Must happen Week 1-2.',                       impact: 'Very high risk of never being actioned.', best: [1] },
  },
  'technical': {
    defaultBest: [1, 2],
    1: { level: 'best',    headline: 'Technical must come first',    reason: 'Google cannot rank what it cannot crawl. Technical fixes unlock all subsequent SEO work.',      impact: 'All Week 2+ work performs better. Full ROI on content investment.', best: [1] },
    2: { level: 'good',    headline: 'Acceptable if Week 1 is full', reason: 'Still early — minor ROI loss on Week 1 content is acceptable.',                                 impact: 'Week 1 content slightly underperforms — recovers quickly.', best: [1] },
    3: { level: 'ok',      headline: 'Risky — 3 weeks of lost ROI',  reason: 'Every week of delay means content and links are less effective.',                              impact: 'Lower ROI on all Weeks 1-2 work. Pages indexed suboptimally.', best: [1, 2] },
    4: { level: 'caution', headline: '4 weeks of technical debt',    reason: 'All prior work on a broken foundation. Fix this immediately.',                                  impact: 'Significant ROI loss. All prior content underperforming.', best: [1] },
    5: { level: 'caution', headline: 'Critical — do not defer',      reason: 'Building authority on broken infrastructure is the number one SEO mistake.',                    impact: 'All existing and future work underperforms until resolved.', best: [1] },
  },
  'content': {
    defaultBest: [2, 3],
    1: { level: 'ok',      headline: 'Possible but premature',       reason: 'Content before technical fixes risks Google indexing it on slow or misconfigured pages.',      impact: 'Content may rank below potential. Technical first gives max impact.', best: [2, 3] },
    2: { level: 'best',    headline: 'Optimal timing',               reason: 'With Week 1 technical foundation in place, content gets indexed cleanly from day one.',         impact: 'Maximum ranking velocity — every piece hits with full technical backing.', best: [2, 3] },
    3: { level: 'best',    headline: 'Data-informed content',        reason: 'By Week 3 you have early signals from Weeks 1-2 to focus on what is already ranking.',           impact: 'Higher quality decisions. Less wasted content effort.', best: [2, 3] },
    4: { level: 'good',    headline: 'Late but still compounds',     reason: 'Week 4 content benefits from the foundation but has less time to rank.',                        impact: 'Good ROI but shorter compounding window.', best: [2, 3] },
    5: { level: 'caution', headline: 'Content in backlog = no content', reason: 'Content is the primary long-term ranking driver. Deferring indefinitely caps growth.',       impact: 'Major organic traffic opportunity cost every month this waits.', best: [2, 3] },
  },
  'geo': {
    defaultBest: [2, 3],
    1: { level: 'ok',      headline: 'Premature without content',    reason: 'GEO needs content for AI engines to cite. Nothing to optimise without it.',                     impact: 'Very low impact until supporting content exists.', best: [2, 3] },
    2: { level: 'best',    headline: 'Right timing for GEO',         reason: 'Alongside new content in Week 2, GEO signals compound as each page goes live.',                 impact: 'AI citation potential builds in real-time with publication.', best: [2, 3] },
    3: { level: 'best',    headline: 'Data-driven GEO timing',       reason: 'Week 3 shows what AI engines are and are not citing — target precisely.',                       impact: 'More targeted actions. Less wasted effort.', best: [2, 3] },
    4: { level: 'good',    headline: 'Still valuable',               reason: 'Perplexity citations can improve quickly even in Week 4.',                                       impact: 'Good compounding window remaining.', best: [2, 3] },
    5: { level: 'caution', headline: 'Do not defer GEO indefinitely', reason: 'AI search is growing fast. Every month absent means competitors get cited instead.',           impact: 'Compounding AI traffic opportunity cost.', best: [2, 3] },
  },
  'competitive': {
    defaultBest: [3, 4],
    1: { level: 'ok',      headline: 'Good for research only',       reason: 'Competitive analysis in Week 1 is useful for planning — hold execution until Week 3.',          impact: 'Use findings to inform Week 1-2 strategy. Hold moves.', best: [3, 4] },
    2: { level: 'good',    headline: 'Slightly early',               reason: 'Week 2 is viable if confident in technical foundation.',                                        impact: 'Competitive moves land but without full authority backing.', best: [3, 4] },
    3: { level: 'best',    headline: 'Optimal competitive window',   reason: '3 weeks of foundation behind you makes competitive moves stick.',                               impact: 'Durable gains with technical and content backing.', best: [3, 4] },
    4: { level: 'best',    headline: 'Strong — timing compounds',    reason: 'Week 4 moves benefit from everything built in Weeks 1-3.',                                       impact: 'Competitors see your moves at your peak authority.', best: [3, 4] },
    5: { level: 'caution', headline: 'Do not defer competitive moves', reason: 'Competitors are not waiting. Backlogging widens the gap every week.',                          impact: 'Increasing difficulty and cost to close gaps.', best: [3, 4] },
  },
  'insight': {
    defaultBest: [1, 5],
    1: { level: 'best', headline: 'Insights inform everything',      reason: 'Strategic insights at the start shape every task — maximum leverage.',                          impact: 'All Week 1-4 tasks are better informed.', best: [1, 5] },
    3: { level: 'ok',   headline: 'Limited leverage at this stage',  reason: 'Week 3 insights can only redirect Week 4 work.',                                                impact: 'Low leverage — most work already underway.', best: [1, 5] },
    5: { level: 'best', headline: 'Backlog suits long-term insights', reason: 'Insights not immediately actionable belong in the backlog as reference.',                      impact: 'Keeps active weeks focused on execution.', best: [1, 5] },
  },
  'kpi': {
    defaultBest: [5],
    1: { level: 'ok',   headline: 'Useful as a baseline',            reason: 'Setting KPI baselines in Week 1 is genuinely useful for tracking.',                             impact: 'Good for measurement — not an execution task.', best: [5] },
    5: { level: 'best', headline: 'Right place for KPI tracking',    reason: 'KPIs are ongoing monitoring — they belong in the backlog as persistent reference.',             impact: 'Keeps active weeks focused on moving metrics.', best: [5] },
  },
  'weekly': {
    defaultBest: [1, 2],
    1: { level: 'best',    headline: 'Week 1 action — start now',    reason: 'Weekly action items are time-bound. Week 1 items go in Week 1.',                                impact: 'On-time delivery of planned work.', best: [1, 2] },
    2: { level: 'best',    headline: 'Week 2 plan — right column',   reason: 'Weekly plans are sequenced — place them in their corresponding week.',                          impact: 'Maintains strategic sequencing integrity.', best: [1, 2] },
    5: { level: 'caution', headline: 'Do not defer weekly tasks',    reason: 'Weekly action items in the backlog lose their time-bound context and rarely get done.',         impact: 'Strategic plan loses sequencing integrity.', best: [1, 2, 3, 4] },
  },
  'monthly': {
    defaultBest: [5, 4],
    1: { level: 'ok',   headline: 'Too early for monthly strategy',  reason: 'Monthly goals are 30-day horizons — not Week 1 actions.',                                       impact: 'Creates confusion between strategic and tactical.', best: [5] },
    5: { level: 'best', headline: 'Backlog is right for monthly',    reason: 'Monthly strategic goals belong in the backlog as long-horizon planning items.',                 impact: 'Keeps weekly columns focused on executable tasks.', best: [5] },
  },
  'custom': {
    defaultBest: [1, 2, 3, 4, 5],
    1: { level: 'good', headline: 'Your call', reason: 'Custom blocks can go anywhere — place where it fits.', impact: 'Depends on what this block represents.', best: [1, 2, 3, 4, 5] },
    2: { level: 'good', headline: 'Your call', reason: 'Custom blocks can go anywhere.', impact: 'Depends on context.', best: [1, 2, 3, 4, 5] },
    3: { level: 'good', headline: 'Your call', reason: 'Custom blocks can go anywhere.', impact: 'Depends on context.', best: [1, 2, 3, 4, 5] },
    4: { level: 'good', headline: 'Your call', reason: 'Custom blocks can go anywhere.', impact: 'Depends on context.', best: [1, 2, 3, 4, 5] },
    5: { level: 'good', headline: 'Backlog for non-urgent items', reason: 'Custom blocks not immediately actionable fit well in the backlog.', impact: 'Good for long-term tracking.', best: [1, 2, 3, 4, 5] },
  },
};

/* Rate the quality of placing a card into a given week. */
export function getSuggestion(card: TaskCard, targetWeek: number, allCards: TaskCard[]): PlacementSuggestion {
  const rules = EXPERT[card.type] || EXPERT.custom;
  const rule  = rules[targetWeek];
  const bestW = rule?.best || rules.defaultBest || [1];
  const bestLabel = bestW.map(w => (w === 5 ? 'Backlog' : `Week ${w}`)).join(' or ');

  const colCards = allCards.filter(c => c.placed && c.week === targetWeek);
  const bwNote = colCards.length >= 5
    ? ` Note: ${targetWeek === 5 ? 'Backlog' : `Week ${targetWeek}`} already has ${colCards.length} items — check bandwidth.`
    : '';

  const techInW1 = allCards.some(c => c.placed && c.week === 1 && c.type === 'technical');
  const depNote = (card.type === 'content' || card.type === 'geo') && targetWeek <= 2 && !techInW1
    ? ' ⚠ No technical tasks in Week 1 yet — add those first for best results.'
    : '';

  if (!rule) {
    return { level: 'good', headline: 'Reasonable placement', reason: `No specific guidance for this type.${bwNote}${depNote}`, impact: 'Depends on surrounding tasks.', best: bestLabel };
  }
  return { level: rule.level, headline: rule.headline, reason: rule.reason + bwNote + depNote, impact: rule.impact, best: bestLabel };
}

/* ════════════════════════════════════════════════════
   IMPACT projections
════════════════════════════════════════════════════ */
const IMPACT_METRICS: Record<CardType, Record<number, string>> = {
  'technical':   { 1: '+5-8 Algorithm Health · +3-5 E-E-A-T in 30d', 2: '+3-5 Algorithm Health in 30d', 3: '+2 Algorithm Health in 30d', 5: 'Minimal until fixed' },
  'quick-win':   { 1: '+2-4 Overall Growth · 48-72h signal', 2: '+1-3 Overall Growth', 3: '+1-2 Overall Growth', 5: 'No impact if backlogged' },
  'content':     { 2: '+4-7 Content Authority · +3-5 LLM Visibility in 30d', 3: '+3-6 Content Authority in 30d', 1: 'Suboptimal ranking potential', 5: 'No impact if backlogged' },
  'geo':         { 2: '+5-9 LLM Visibility · Perplexity citations in 30-45d', 3: '+4-7 LLM Visibility in 30d', 1: 'Low impact without content', 5: 'No impact if backlogged' },
  'competitive': { 3: '+3-5 Competitor Rank improvement · 45-60d', 4: '+2-4 Competitor Rank · 30-45d', 1: 'Premature — no foundation yet', 5: 'No impact if backlogged' },
  'insight':     { 1: 'Improves all subsequent decisions', 5: 'Reference only — no direct metric impact' },
  'kpi':         { 1: 'Tracking only', 5: 'Reference only' },
  'weekly':      { 1: '+2-3 Overall Growth per task completed', 2: '+2-3 Overall Growth per task', 3: '+1-2', 4: '+1', 5: 'No impact' },
  'monthly':     { 5: 'Strategic alignment', 4: 'Milestone tracking' },
  'custom':      { 1: 'Depends on task', 2: 'Depends on task', 3: 'Depends on task', 4: 'Depends on task', 5: 'Depends on task' },
};

export function getDropImpact(card: TaskCard, week: number): string {
  const map = IMPACT_METRICS[card.type];
  return map?.[week] ?? map?.[card.week] ?? 'Contributes to overall strategy progress';
}

/* ════════════════════════════════════════════════════
   NEXT MOVE recommendation
════════════════════════════════════════════════════ */
export function getNextRecommendation(placed: TaskCard[], library: TaskCard[]): NextMove | null {
  if (!library.length) return null;

  const hasW1Tech    = placed.some(c => c.week === 1 && c.type === 'technical');
  const hasW1Quick   = placed.some(c => c.week === 1 && c.type === 'quick-win');
  const hasW2Content = placed.some(c => c.week === 2 && c.type === 'content');
  const hasW2Geo     = placed.some(c => c.week === 2 && c.type === 'geo');
  const hasW3Comp    = placed.some(c => c.week === 3 && c.type === 'competitive');

  // Rule 1 — technical foundation first
  if (!hasW1Tech) {
    const c = library.find(x => x.type === 'technical' && (x.priority === 'high' || x.priority === 'medium'));
    if (c) return { card: c, week: 1, reason: 'Week 1 has no technical foundation yet. This is the most important first move — everything else depends on it.', impact: getDropImpact(c, 1), metric: '+5-8 Algorithm Health score in 30 days' };
  }
  // Rule 2 — high-priority quick wins
  if (!hasW1Quick) {
    const c = library.find(x => x.type === 'quick-win' && x.priority === 'high');
    if (c) return { card: c, week: 1, reason: 'Week 1 should include a high-priority quick win for early momentum. Clients and Google both notice fast results.', impact: getDropImpact(c, 1), metric: 'Early ranking signal within 48-72 hours' };
  }
  // Rule 3 — content in Week 2 after technical
  if (hasW1Tech && !hasW2Content) {
    const c = library.find(x => x.type === 'content');
    if (c) return { card: c, week: 2, reason: 'Technical foundation is in Week 1. Content in Week 2 will be indexed on clean, optimised pages from day one.', impact: getDropImpact(c, 2), metric: '+4-7 Content Authority in 30 days' };
  }
  // Rule 4 — GEO alongside content
  if (hasW2Content && !hasW2Geo) {
    const c = library.find(x => x.type === 'geo');
    if (c) return { card: c, week: 2, reason: 'Content is in Week 2. GEO signals compound in real-time as pages go live — place it here to maximise AI citation potential.', impact: getDropImpact(c, 2), metric: '+5-9 LLM Visibility score in 30-45 days' };
  }
  // Rule 5 — competitive in Week 3
  if (placed.length >= 3 && !hasW3Comp) {
    const c = library.find(x => x.type === 'competitive');
    if (c) return { card: c, week: 3, reason: 'Foundation is solid. Week 3 competitive moves will stick because you now have technical and content backing.', impact: getDropImpact(c, 3), metric: '+3-5 Competitor Rank positions in 45-60 days' };
  }
  // Rule 6 — any remaining high-priority
  const typeOrder: Record<CardType, number> = { technical: 0, 'quick-win': 1, content: 2, geo: 3, competitive: 4, weekly: 5, insight: 6, kpi: 7, monthly: 8, custom: 9 };
  const highPri = library.filter(c => c.priority === 'high').sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9));
  if (highPri[0]) {
    const c = highPri[0];
    const w = assignWeek(c);
    return { card: c, week: w, reason: `This is a high-priority ${TYPE_LABEL[c.type]} task. Placing it in ${w === 5 ? 'Backlog' : `Week ${w}`} maintains the optimal sequence.`, impact: getDropImpact(c, w), metric: 'Progresses overall strategy score' };
  }
  // Rule 7 — anything left
  const next = library[0];
  if (next) {
    const w = assignWeek(next);
    return { card: next, week: w, reason: `Continue building out your strategy — ${TYPE_LABEL[next.type]} tasks belong in ${w === 5 ? 'Backlog' : `Week ${w}`}.`, impact: getDropImpact(next, w), metric: 'Adds to strategy completeness' };
  }
  return null;
}

/* ════════════════════════════════════════════════════
   Week assignment
════════════════════════════════════════════════════ */
export function assignWeek(card: Partial<TaskCard>): number {
  const explicit = !!card.week && typeof card.week === 'number' && card.week >= 1 && card.week <= 5;
  if (card.type === 'quick-win')   return 1;
  if (card.type === 'technical')   return explicit ? card.week! : 2;
  if (card.type === 'content')     return Math.min(explicit ? card.week! : 2, 4);
  if (card.type === 'geo')         return explicit ? card.week! : 2;
  if (card.type === 'competitive') return explicit ? card.week! : 3;
  if (card.type === 'insight')     return explicit ? card.week! : 2;
  if (card.type === 'weekly')      return explicit ? card.week! : 1;
  if (card.type === 'kpi' || card.type === 'monthly') return 5;
  return explicit ? card.week! : 5;
}

/* Keyword-based week suggestion for free-text custom cards. */
export function suggestWeekForCustom(title: string, content: string, allCards: TaskCard[]): { week: number; reason: string } {
  const lower = `${title} ${content}`.toLowerCase();
  if (/fix|bug|error|broken|crawl|index|speed|schema|sitemap|canonical|redirect/.test(lower)) return { week: 1, reason: 'Technical/fix tasks should be tackled first' };
  if (/write|blog|post|article|copy|page|landing|content|faq|pillar/.test(lower))             return { week: 2, reason: 'Content creation works best after technical foundation' };
  if (/perplexity|chatgpt|gpt|llm|geo|citation|generative/.test(lower))                       return { week: 2, reason: 'GEO tasks pair well with content in Week 2' };
  if (/competitor|gap|outrank|rival|versus/.test(lower))                                      return { week: 3, reason: 'Competitive moves are most effective after foundation is solid' };
  if (/report|track|measure|kpi|metric|analytics/.test(lower))                                return { week: 5, reason: 'Tracking and reporting belongs in the ongoing backlog' };
  const counts = [1, 2, 3, 4, 5].map(w => ({ w, n: allCards.filter(c => c.placed && c.week === w).length }));
  const least = counts.sort((a, b) => a.n - b.n)[0];
  return { week: least.w, reason: `${least.w === 5 ? 'Backlog' : `Week ${least.w}`} has the most space (${least.n} items)` };
}

/* ════════════════════════════════════════════════════
   Effort estimation
════════════════════════════════════════════════════ */
const EFFORT_HOURS: Record<CardType, Record<Priority, number>> = {
  'technical':   { high: 8,  medium: 4,   low: 2   },
  'quick-win':   { high: 3,  medium: 1.5, low: 0.5 },
  'content':     { high: 10, medium: 6,   low: 3   },
  'geo':         { high: 5,  medium: 3,   low: 1.5 },
  'competitive': { high: 6,  medium: 3,   low: 1.5 },
  'insight':     { high: 2,  medium: 1,   low: 0.5 },
  'weekly':      { high: 4,  medium: 2,   low: 1   },
  'monthly':     { high: 3,  medium: 1.5, low: 0.5 },
  'kpi':         { high: 1,  medium: 0.5, low: 0.5 },
  'custom':      { high: 4,  medium: 2,   low: 1   },
};

export function estimateHours(card: TaskCard): number {
  const base = EFFORT_HOURS[card.type]?.[card.priority] ?? 2;
  return Math.round(base * 10) / 10;
}

export function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h % 1 === 0) return `${h}h`;
  return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
}

export function columnHours(cards: TaskCard[]): number {
  return Math.round(cards.reduce((sum, c) => sum + estimateHours(c), 0) * 10) / 10;
}

export function workloadLabel(hours: number): { label: string; color: string } {
  if (hours === 0) return { label: 'Empty',      color: 'text-muted-foreground' };
  if (hours <= 4)  return { label: 'Light',      color: 'text-green-400' };
  if (hours <= 10) return { label: 'Moderate',   color: 'text-blue-400' };
  if (hours <= 18) return { label: 'Heavy',      color: 'text-yellow-400' };
  return             { label: 'Overloaded', color: 'text-red-400' };
}

/* ════════════════════════════════════════════════════
   Type display metadata
════════════════════════════════════════════════════ */
export const TYPE_LABEL: Record<CardType, string> = {
  'quick-win': 'Quick Win', 'weekly': 'Weekly', 'monthly': 'Monthly',
  'technical': 'Technical', 'content': 'Content', 'geo': 'GEO',
  'competitive': 'Competitive', 'insight': 'Insight', 'kpi': 'KPI', 'custom': 'Custom',
};

export const TYPE_COLOR: Record<CardType, string> = {
  'quick-win': '#4ade80', 'weekly': '#60a5fa', 'monthly': '#a78bfa',
  'technical': '#06b6d4', 'content': '#facc15', 'geo': '#6366f1',
  'competitive': '#fb923c', 'insight': '#f472b6', 'kpi': '#34d399', 'custom': '#94a3b8',
};

export const SUGGESTION_STYLE: Record<SuggestionLevel, { ring: string; label: string }> = {
  best:    { ring: 'ring-2 ring-green-400/60',  label: 'Best here' },
  good:    { ring: 'ring-2 ring-blue-400/50',   label: 'Good fit' },
  ok:      { ring: 'ring-1 ring-yellow-400/40', label: 'Acceptable' },
  caution: { ring: 'ring-2 ring-red-400/50',    label: 'Caution' },
};

/* Stable id from a title (djb2) — strategy-generated cards keep the same
   id across regenerations so placement state survives. */
export function stableId(title: string): string {
  const norm = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0;
  return 's' + h.toString(36).padStart(7, '0');
}
