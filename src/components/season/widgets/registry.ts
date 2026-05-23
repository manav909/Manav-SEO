/* ════════════════════════════════════════════════════════════════════
   src/components/season/widgets/registry.ts
   Phase 21 — Block 2.14 — Widget registry

   Every widget on the Command page is registered here with its metadata.
   The registry powers:
     • Page rendering — Casual/Pro layouts iterate registry-listed widgets
     • Gallery — drawer shows available widgets to add
     • Layout config — saved layouts reference widgets by id
     • Skeleton sizing — min height for lazy-load placeholders

   Adding a new widget to the page = add an entry here + a render function.
══════════════════════════════════════════════════════════════════════ */

export type WidgetMode = 'casual' | 'pro';
export type WidgetColumn = 'left' | 'right' | 'full';
export type WidgetCategory = 'overview' | 'analysis' | 'editorial' | 'planning' | 'communication';

export interface WidgetSpec {
  id:                string;
  title:             string;
  description:       string;
  category:          WidgetCategory;
  modes:             WidgetMode[];           // which modes can host this widget
  default_mode:      WidgetMode | null;      // primary mode (null = both)
  default_column:    WidgetColumn;
  min_height_px:     number;                 // skeleton sizing
  lazy_load:         boolean;                // if true, IntersectionObserver gates fetch
  pulse_hint?:       string;                 // optional one-line pitch in gallery
}

/* ════════════════════════════════════════════════════════════════════
   THE REGISTRY
══════════════════════════════════════════════════════════════════════ */

export const WIDGET_REGISTRY: Record<string, WidgetSpec> = {
  /* ── CASUAL MODE WIDGETS ── */
  casual_manavs_pick: {
    id:                'casual_manavs_pick',
    title:             "Manav's Pick",
    description:       'The daily intelligence engine — cross-connects external publishing signal with your project state. Includes 5 role frames.',
    category:          'editorial',
    modes:             ['casual'],
    default_mode:      'casual',
    default_column:    'full',
    min_height_px:     420,
    lazy_load:         false,                // above the fold
    pulse_hint:        'The reading hero',
  },
  casual_what_needs_you: {
    id:                'casual_what_needs_you',
    title:             'What needs you',
    description:       'Compact priority view — blockers, recoverable opportunities, things waiting on your decision.',
    category:          'overview',
    modes:             ['casual'],
    default_mode:      'casual',
    default_column:    'full',
    min_height_px:     180,
    lazy_load:         true,
    pulse_hint:        'Quiet priorities',
  },
  casual_strategic_intel: {
    id:                'casual_strategic_intel',
    title:             'Strategic intelligence',
    description:       'Three-tier intelligence — grounded · exploratory · growth roadmap.',
    category:          'analysis',
    modes:             ['casual', 'pro'],
    default_mode:      null,
    default_column:    'full',
    min_height_px:     280,
    lazy_load:         true,
  },

  /* ── PRO MODE LEFT COLUMN ── */
  pro_priority_feed: {
    id:                'pro_priority_feed',
    title:             'Priority feed',
    description:       'Unified what-needs-you-this-week feed synthesized from 9 sources — blockers, pillars, GSC, GA4, inbox.',
    category:          'overview',
    modes:             ['pro'],
    default_mode:      'pro',
    default_column:    'left',
    min_height_px:     320,
    lazy_load:         false,
    pulse_hint:        'The action deck',
  },
  pro_strategic_intel: {
    id:                'pro_strategic_intel',
    title:             'Strategic intelligence',
    description:       'Three-tier intelligence — grounded · exploratory · growth roadmap. Filters as you type in chat.',
    category:          'analysis',
    modes:             ['pro'],
    default_mode:      'pro',
    default_column:    'left',
    min_height_px:     360,
    lazy_load:         true,
  },

  /* ── PRO MODE RIGHT COLUMN ── */
  pro_scorecard: {
    id:                'pro_scorecard',
    title:             'Health scorecard',
    description:       'Five vital signs — health, velocity, quality, risk, ROI hint — click any cell for contributing factors.',
    category:          'overview',
    modes:             ['pro'],
    default_mode:      'pro',
    default_column:    'right',
    min_height_px:     160,
    lazy_load:         false,
  },
  pro_performance_pulse: {
    id:                'pro_performance_pulse',
    title:             'Performance pulse',
    description:       'Top GSC performers + rising stars + falling stars with delta arrows.',
    category:          'analysis',
    modes:             ['pro'],
    default_mode:      'pro',
    default_column:    'right',
    min_height_px:     220,
    lazy_load:         true,
  },
  pro_pillar_health: {
    id:                'pro_pillar_health',
    title:             'Pillar health',
    description:       'Six pillar status cards — last run, finding counts, next recheck, click to open.',
    category:          'analysis',
    modes:             ['pro'],
    default_mode:      'pro',
    default_column:    'right',
    min_height_px:     240,
    lazy_load:         true,
  },
  pro_i_noticed: {
    id:                'pro_i_noticed',
    title:             'I noticed',
    description:       'LLM-pre-computed quiet observations grounded in your project data.',
    category:          'analysis',
    modes:             ['pro'],
    default_mode:      'pro',
    default_column:    'right',
    min_height_px:     180,
    lazy_load:         true,
  },
  pro_client_questions: {
    id:                'pro_client_questions',
    title:             'Things the client might ask',
    description:       'Anticipated questions with copy-paste-ready answers, grounded in current project state.',
    category:          'communication',
    modes:             ['pro'],
    default_mode:      'pro',
    default_column:    'right',
    min_height_px:     180,
    lazy_load:         true,
  },
  pro_decisions_log: {
    id:                'pro_decisions_log',
    title:             'Decisions log',
    description:       'Cross-campaign decisions_avoided — credibility scorecard, most recent first.',
    category:          'overview',
    modes:             ['pro'],
    default_mode:      'pro',
    default_column:    'right',
    min_height_px:     200,
    lazy_load:         true,
  },
  pro_velocity: {
    id:                'pro_velocity',
    title:             'Velocity',
    description:       'Week-over-week deltas — campaigns updated, pillar runs, new opportunities, decisions protected.',
    category:          'overview',
    modes:             ['pro'],
    default_mode:      'pro',
    default_column:    'right',
    min_height_px:     180,
    lazy_load:         true,
  },
  pro_client_recap: {
    id:                'pro_client_recap',
    title:             'Client recap',
    description:       'Auto-drafted weekly summary — copy as email or open in mail.',
    category:          'communication',
    modes:             ['pro'],
    default_mode:      'pro',
    default_column:    'right',
    min_height_px:     220,
    lazy_load:         true,
  },
};

export const ALL_WIDGET_IDS = Object.keys(WIDGET_REGISTRY);

/* ════════════════════════════════════════════════════════════════════
   DEFAULTS — must match the backend constants
══════════════════════════════════════════════════════════════════════ */

export const DEFAULT_LAYOUT_CASUAL = [
  'casual_manavs_pick',
  'casual_what_needs_you',
  'casual_strategic_intel',
];
export const DEFAULT_LAYOUT_PRO_LEFT = [
  'pro_priority_feed',
  'pro_strategic_intel',
];
export const DEFAULT_LAYOUT_PRO_RIGHT = [
  'pro_scorecard',
  'pro_performance_pulse',
  'pro_pillar_health',
  'pro_i_noticed',
  'pro_client_questions',
  'pro_decisions_log',
  'pro_velocity',
  'pro_client_recap',
];

/* ════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════ */

export function getWidget(id: string): WidgetSpec | null {
  return WIDGET_REGISTRY[id] || null;
}

/* List widgets eligible for a given mode (used by the gallery). */
export function widgetsForMode(mode: WidgetMode): WidgetSpec[] {
  return ALL_WIDGET_IDS
    .map(id => WIDGET_REGISTRY[id])
    .filter(w => w.modes.includes(mode));
}

/* Group widgets by category — used for the gallery's section headers. */
export function widgetsByCategory(mode: WidgetMode): Record<WidgetCategory, WidgetSpec[]> {
  const out: Record<WidgetCategory, WidgetSpec[]> = {
    overview:      [],
    analysis:      [],
    editorial:     [],
    planning:      [],
    communication: [],
  };
  for (const w of widgetsForMode(mode)) out[w.category].push(w);
  return out;
}
