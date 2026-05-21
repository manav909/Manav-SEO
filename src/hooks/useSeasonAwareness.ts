/* ════════════════════════════════════════════════════════════════
   src/hooks/useSeasonAwareness.ts
   Phase 9 — Awareness layer.

   Pages call this hook to tell S.E.A.S.O.N. what's on screen and what
   the user has selected. When the user summons S.E.A.S.O.N. via the
   orb or Cmd+K, the modal sends this context with every query.

   USAGE (in any page):
     useSeasonAwareness({
       page: 'kanban',
       page_label: 'Kanban board',
       visible_filters: { status: 'in_progress', overdue: true },
       selected: card ? {
         type: 'card', id: card.id, title: card.title, status: card.status,
       } : null,
       visible_items: visibleCards.slice(0, 8).map(c => ({
         type: 'card', id: c.id, title: c.title,
       })),
     });

   The hook handles:
     • Pushing to global context
     • Re-pushing when any tracked field changes
     • Cleaning up when the page unmounts (sets awareness back to null)
     • Throttling — same payload within 500ms is ignored

   It uses a stable-stringify comparison so passing fresh-but-equal
   objects every render doesn't cause infinite re-pushes.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useRef } from 'react';
import { useSeason, type SeasonAwareness, type AwarenessSelected } from '@/contexts/SeasonContext';

export interface UseSeasonAwarenessInput {
  page:               string;
  page_label?:        string;
  visible_filters?:   Record<string, any>;
  selected?:          AwarenessSelected | null;
  visible_items?:     Array<{ type: string; id: string; title: string }>;
  recent_actions?:    string[];
}

/* Stable JSON for comparing — order-independent for top-level keys. */
function stableStringify(obj: any): string {
  if (obj === null || obj === undefined) return String(obj);
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj))       return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export function useSeasonAwareness(input: UseSeasonAwarenessInput | null) {
  const { setAwareness } = useSeason();
  const lastPushedRef = useRef<string>('');
  const lastTimeRef   = useRef<number>(0);

  useEffect(() => {
    if (!input) {
      /* Clear when called with null */
      if (lastPushedRef.current !== '') {
        lastPushedRef.current = '';
        setAwareness(null);
      }
      return;
    }

    const payload: SeasonAwareness = {
      page:            input.page,
      page_label:      input.page_label,
      visible_filters: input.visible_filters,
      selected:        input.selected || null,
      visible_items:   (input.visible_items || []).slice(0, 8),
      recent_actions:  (input.recent_actions || []).slice(0, 5),
      updated_at:      Date.now(),
    };

    /* Compare without updated_at — if everything else is the same,
       don't bother re-pushing (avoids feedback loops). */
    const compareKey = stableStringify({
      page: payload.page,
      page_label: payload.page_label,
      visible_filters: payload.visible_filters,
      selected: payload.selected,
      visible_items: payload.visible_items,
      recent_actions: payload.recent_actions,
    });

    /* Throttle — same payload within 500ms gets ignored */
    const now = Date.now();
    if (compareKey === lastPushedRef.current && (now - lastTimeRef.current) < 500) return;

    lastPushedRef.current = compareKey;
    lastTimeRef.current   = now;
    setAwareness(payload);

    /* On unmount, clear */
    return () => {
      /* Only clear if THIS page's payload is still the current one
         (i.e. we haven't been superseded by a navigation already). */
      if (lastPushedRef.current === compareKey) {
        setAwareness(null);
        lastPushedRef.current = '';
      }
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [stableStringify(input || null)]);
}
