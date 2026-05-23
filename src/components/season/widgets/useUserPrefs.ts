/* ════════════════════════════════════════════════════════════════════
   src/components/season/widgets/useUserPrefs.ts
   Phase 21 — Block 2.14 — User prefs hook

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

export function useUserPrefs(userId: string | null) {
  const [prefs, setPrefs] = useState<UserPrefsClient>(buildDefaults());
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<number | null>(null);

  /* Load on mount / userId change */
  useEffect(() => {
    if (!userId) {
      setPrefs(buildDefaults());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const r = await seoUserPrefsGet({ userId });
      if (cancelled) return;
      if (r.prefs) setPrefs(r.prefs);
      else setPrefs(buildDefaults());
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  /* Debounced persist */
  const persist = useCallback((next: UserPrefsClient) => {
    if (!userId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      seoUserPrefsSet({ userId, partial: next }).catch(() => { /* swallow */ });
    }, SAVE_DEBOUNCE_MS);
  }, [userId]);

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
