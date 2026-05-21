/* ════════════════════════════════════════════════════════════════
   src/contexts/SeasonContext.tsx
   Phase 8b — Global S.E.A.S.O.N. presence layer.

   Provides:
     • Modal open/close state (summoned from anywhere)
     • Mood state (derived from briefing data, drives orb color/pulse)
     • Last query/response (so re-opening preserves context)
     • Cmd/Ctrl+K keyboard shortcut handler

   Phase 9 will extend this with useSeasonContext({ page, selected, ... })
   so the orb knows where you are. For now: presence only, awareness later.
═══════════════════════════════════════════════════════════════ */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

export type SeasonMood =
  | 'calm'         // cyan — nothing pressing
  | 'focused'      // violet — work in flight
  | 'alert'        // amber — warnings
  | 'critical'     // red — fires
  | 'celebrating'  // emerald — wins
  | 'thinking'     // gradient flow — actively processing
  | 'quiet';       // muted — not enough data to derive a mood

interface SeasonContextValue {
  /* Modal */
  isOpen:        boolean;
  open:          (initialQuery?: string) => void;
  close:         () => void;
  initialQuery:  string | null;

  /* Mood */
  mood:          SeasonMood;
  setMood:       (m: SeasonMood) => void;

  /* Settings */
  orbVisible:    boolean;
  setOrbVisible: (v: boolean) => void;
  orbPosition:   'br' | 'bl' | 'tr' | 'tl';
  setOrbPosition: (p: 'br' | 'bl' | 'tr' | 'tl') => void;
  paused:        boolean;  // master kill switch
  setPaused:     (v: boolean) => void;
}

const SeasonContext = createContext<SeasonContextValue | null>(null);

/* ─── localStorage keys ─── */
const LS_VISIBLE   = 'season_orb_visible';
const LS_POSITION  = 'season_orb_position';
const LS_PAUSED    = 'season_paused';

export function SeasonProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen]               = useState(false);
  const [initialQuery, setInitialQuery]   = useState<string | null>(null);
  const [mood, setMood]                   = useState<SeasonMood>('quiet');

  /* Settings — hydrate from localStorage, persist on change */
  const [orbVisible, setOrbVisibleState]   = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(LS_VISIBLE);
    return stored === null ? true : stored === 'true';
  });
  const [orbPosition, setOrbPositionState] = useState<'br' | 'bl' | 'tr' | 'tl'>(() => {
    if (typeof window === 'undefined') return 'br';
    const stored = localStorage.getItem(LS_POSITION) as any;
    return ['br', 'bl', 'tr', 'tl'].includes(stored) ? stored : 'br';
  });
  const [paused, setPausedState]           = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(LS_PAUSED) === 'true';
  });

  const setOrbVisible  = useCallback((v: boolean) => {
    setOrbVisibleState(v);
    try { localStorage.setItem(LS_VISIBLE, String(v)); } catch { /* ignore */ }
  }, []);
  const setOrbPosition = useCallback((p: 'br' | 'bl' | 'tr' | 'tl') => {
    setOrbPositionState(p);
    try { localStorage.setItem(LS_POSITION, p); } catch { /* ignore */ }
  }, []);
  const setPaused      = useCallback((v: boolean) => {
    setPausedState(v);
    try { localStorage.setItem(LS_PAUSED, String(v)); } catch { /* ignore */ }
  }, []);

  /* Modal control */
  const open  = useCallback((q?: string) => {
    if (paused) return;
    setInitialQuery(q || null);
    setIsOpen(true);
  }, [paused]);
  const close = useCallback(() => {
    setIsOpen(false);
    setInitialQuery(null);
  }, []);

  /* Cmd+K / Ctrl+K global shortcut */
  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      /* Cmd+K (mac) or Ctrl+K (everyone else) */
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      /* Esc closes */
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setInitialQuery(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, isOpen]);

  return (
    <SeasonContext.Provider value={{
      isOpen, open, close, initialQuery,
      mood, setMood,
      orbVisible, setOrbVisible,
      orbPosition, setOrbPosition,
      paused, setPaused,
    }}>
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason() {
  const ctx = useContext(SeasonContext);
  if (!ctx) throw new Error('useSeason must be used within SeasonProvider');
  return ctx;
}
