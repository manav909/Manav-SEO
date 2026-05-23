/* ════════════════════════════════════════════════════════════════════
   api/lib/season-user-prefs.ts
   Phase 21 — Block 2.14 — User preferences engine

   Reads / writes the season_user_preferences row for a user.
   Falls back to defaults if no row exists.
   Defaults are returned but NOT persisted until the user makes
   their first edit (avoids creating empty rows on every read).
══════════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

export type CommandMode = 'casual' | 'pro';
export type Density = 'comfortable' | 'compact';

/* Widget registry — backend-aware list of all known widget ids.
   Kept in sync with the frontend registry. If they drift, validation
   on save will catch unknown ids and reject them. */
export const KNOWN_WIDGET_IDS: string[] = [
  /* Casual mode widgets */
  'casual_manavs_pick',
  'casual_what_needs_you',
  'casual_strategic_intel',

  /* Pro mode left column */
  'pro_priority_feed',
  'pro_strategic_intel',

  /* Pro mode right column */
  'pro_scorecard',
  'pro_performance_pulse',
  'pro_pillar_health',
  'pro_i_noticed',
  'pro_client_questions',
  'pro_decisions_log',
  'pro_velocity',
  'pro_client_recap',
];

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

export interface UserPrefs {
  layout_casual:       string[];
  layout_pro_left:     string[];
  layout_pro_right:    string[];
  hidden_widgets:      string[];
  saved_at_user_level: string[];
  reduce_motion:       boolean;
  density:             Density;
  default_mode:        CommandMode;
  loaded_from_db:      boolean;
}

/* ════════════════════════════════════════════════════════════════════
   PUBLIC ENTRIES
══════════════════════════════════════════════════════════════════════ */

export async function getUserPrefs(opts: { userId: string }): Promise<{
  success: boolean; prefs?: UserPrefs; error?: string;
}> {
  try {
    const { data } = await db().from('season_user_preferences')
      .select('*')
      .eq('user_id', opts.userId)
      .is('project_id', null)
      .maybeSingle();

    if (!data) return { success: true, prefs: buildDefaultPrefs() };
    return { success: true, prefs: rowToPrefs(data as any) };
  } catch (e: any) {
    return { success: false, error: e?.message || 'user prefs read failed' };
  }
}

export async function setUserPrefs(opts: {
  userId:     string;
  partial:    Partial<UserPrefs>;
}): Promise<{ success: boolean; prefs?: UserPrefs; error?: string }> {
  try {
    /* Read current */
    const cur = await getUserPrefs({ userId: opts.userId });
    const base = cur.prefs || buildDefaultPrefs();

    /* Merge */
    const merged: UserPrefs = {
      layout_casual:       validateLayout(opts.partial.layout_casual,       base.layout_casual),
      layout_pro_left:     validateLayout(opts.partial.layout_pro_left,     base.layout_pro_left),
      layout_pro_right:    validateLayout(opts.partial.layout_pro_right,    base.layout_pro_right),
      hidden_widgets:      validateLayout(opts.partial.hidden_widgets,      base.hidden_widgets),
      saved_at_user_level: Array.isArray(opts.partial.saved_at_user_level) ? opts.partial.saved_at_user_level.slice(0, 500) : base.saved_at_user_level,
      reduce_motion:       opts.partial.reduce_motion ?? base.reduce_motion,
      density:             (opts.partial.density === 'compact' || opts.partial.density === 'comfortable')
                             ? opts.partial.density : base.density,
      default_mode:        (opts.partial.default_mode === 'casual' || opts.partial.default_mode === 'pro')
                             ? opts.partial.default_mode : base.default_mode,
      loaded_from_db:      true,
    };

    /* Upsert */
    const { data } = await db().from('season_user_preferences').upsert({
      user_id:             opts.userId,
      project_id:          null,
      layout_casual:       merged.layout_casual,
      layout_pro_left:     merged.layout_pro_left,
      layout_pro_right:    merged.layout_pro_right,
      hidden_widgets:      merged.hidden_widgets,
      saved_at_user_level: merged.saved_at_user_level,
      reduce_motion:       merged.reduce_motion,
      density:             merged.density,
      default_mode:        merged.default_mode,
      updated_at:          new Date().toISOString(),
    }, { onConflict: 'user_id,project_id' }).select('*').maybeSingle();

    if (!data) return { success: true, prefs: merged };
    return { success: true, prefs: rowToPrefs(data as any) };
  } catch (e: any) {
    return { success: false, error: e?.message || 'user prefs write failed' };
  }
}

export async function resetUserPrefs(opts: { userId: string }): Promise<{ success: boolean; prefs?: UserPrefs; error?: string }> {
  try {
    await db().from('season_user_preferences')
      .delete()
      .eq('user_id', opts.userId)
      .is('project_id', null);
    return { success: true, prefs: buildDefaultPrefs() };
  } catch (e: any) {
    return { success: false, error: e?.message || 'user prefs reset failed' };
  }
}

/* ════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════ */

function buildDefaultPrefs(): UserPrefs {
  return {
    layout_casual:       [...DEFAULT_LAYOUT_CASUAL],
    layout_pro_left:     [...DEFAULT_LAYOUT_PRO_LEFT],
    layout_pro_right:    [...DEFAULT_LAYOUT_PRO_RIGHT],
    hidden_widgets:      [],
    saved_at_user_level: [],
    reduce_motion:       false,
    density:             'comfortable',
    default_mode:        'casual',
    loaded_from_db:      false,
  };
}

function rowToPrefs(row: any): UserPrefs {
  return {
    layout_casual:       sanitizeLayout(row.layout_casual,       DEFAULT_LAYOUT_CASUAL),
    layout_pro_left:     sanitizeLayout(row.layout_pro_left,     DEFAULT_LAYOUT_PRO_LEFT),
    layout_pro_right:    sanitizeLayout(row.layout_pro_right,    DEFAULT_LAYOUT_PRO_RIGHT),
    hidden_widgets:      sanitizeLayout(row.hidden_widgets,      []),
    saved_at_user_level: Array.isArray(row.saved_at_user_level) ? row.saved_at_user_level.slice(0, 500) : [],
    reduce_motion:       !!row.reduce_motion,
    density:             (row.density === 'compact' ? 'compact' : 'comfortable'),
    default_mode:        (row.default_mode === 'pro' ? 'pro' : 'casual'),
    loaded_from_db:      true,
  };
}

function sanitizeLayout(arr: any, fallback: string[]): string[] {
  if (!Array.isArray(arr)) return [...fallback];
  /* Keep only known widget ids and preserve order */
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of arr) {
    if (typeof id !== 'string') continue;
    if (!KNOWN_WIDGET_IDS.includes(id)) continue;
    if (seen.has(id)) continue;
    out.push(id);
    seen.add(id);
  }
  return out;
}

function validateLayout(provided: string[] | undefined, fallback: string[]): string[] {
  if (!Array.isArray(provided)) return fallback;
  return sanitizeLayout(provided, fallback);
}
