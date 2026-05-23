/* ════════════════════════════════════════════════════════════════════
   src/components/season/widgets/useUserPrefs.ts
   Phase 21 — Block 2.14 — User prefs hook
   Block 2.6b — Per-project layouts. Pass projectId to scope reads/writes
   to that project. Reads fall back to user-level if no per-project row
   exists, so new projects inherit the user's default layout.

   Reads on mount, caches in state, persists debounced on change.
   Loading state separate so the page can render skeleton-correct layout
   without flicker between "default" and "loaded".
══════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  seoUserPrefsGet, seoUserPrefsSet,
  type UserPrefsClient,
} from '@/components/pm/api';
import {
  DEFAULT_LAYOUT_CASUAL, DEFAULT_LAYOUT_PRO_LEFT, DEFAULT_LAYOUT_PRO_RIGHT,
} from './registry';

const SAVE_DEBOUNCE_MS = 500;

function buildDefaults(): UserPrefsClient {
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

export function useUserPrefs(userId: string | null, projectId: string | null = null) {
  const [prefs, setPrefs] = useState<UserPrefsClient>(buildDefaults());
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<number | null>(null);

  /* Load on mount / userId / projectId change.
     Switching projects re-fetches that project's prefs (or falls back to
     user-level if the project has no override yet). */
  useEffect(() => {
    if (!userId) {
      setPrefs(buildDefaults());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const r = await seoUserPrefsGet({ userId, projectId });
      if (cancelled) return;
      if (r.prefs) setPrefs(r.prefs);
      else setPrefs(buildDefaults());
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, projectId]);

  /* Debounced persist. Writes scope to the current projectId — so editing
     widgets on project A only changes project A's saved layout. */
  const persist = useCallback((next: UserPrefsClient) => {
    if (!userId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      seoUserPrefsSet({ userId, projectId, partial: next }).catch(() => { /* swallow */ });
    }, SAVE_DEBOUNCE_MS);
  }, [userId, projectId]);

  /* Setter that updates local + queues persist */
  const updatePrefs = useCallback((updater: (prev: UserPrefsClient) => UserPrefsClient) => {
    setPrefs(prev => {
      const next = updater(prev);
      persist(next);
      return next;
    });
  }, [persist]);

  return { prefs, setPrefs: updatePrefs, loading };
}
