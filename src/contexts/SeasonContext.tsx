/* ════════════════════════════════════════════════════════════════
   src/contexts/SeasonContext.tsx
   Phase 8b/8c — Global S.E.A.S.O.N. presence + settings layer.

   Provides:
     • Modal open/close state (summoned from anywhere)
     • Mood state (derived from briefing data, drives orb color/pulse)
     • Cmd/Ctrl+K keyboard shortcut handler
     • Full settings tree (8c): capabilities, tone, daily cap, per-page,
       orb appearance — all persisted to localStorage

   Phase 9 will extend with useSeasonContext({ page, selected, ... })
   so the orb knows where you are.
═══════════════════════════════════════════════════════════════ */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

export type SeasonMood =
  | 'calm' | 'focused' | 'alert' | 'critical' | 'celebrating' | 'thinking' | 'quiet';

/* ─── Awareness types (Phase 9) ─────────────────────────────── */

export interface AwarenessSelected {
  type:     'card' | 'strategy' | 'goal' | 'audit' | 'store_item' | 'metric' | 'query' | 'page' | 'project' | 'other';
  id?:      string;
  title?:   string;
  status?:  string;
  meta?:    Record<string, any>;
}

export interface SeasonAwareness {
  page:               string;        // 'kanban' | 'data-room' | 'planning' | etc.
  page_label?:        string;        // human-readable page name
  visible_filters?:   Record<string, any>;  // what filter state the user has applied
  selected?:          AwarenessSelected | null;
  visible_items?:     Array<{ type: string; id: string; title: string }>;  // up to 8 things visible on screen
  recent_actions?:    string[];      // last few things user did (e.g. ["filtered overdue", "opened card X"])
  updated_at:         number;        // Date.now() when this was last pushed
}

/* ─── Settings types ─────────────────────────────────────────── */

export type SeasonTone     = 'passive' | 'balanced' | 'active';
export type SeasonVerbose  = 'terse' | 'balanced' | 'detailed';
export type OrbPosition    = 'br' | 'bl' | 'tr' | 'tl';

export interface CapabilitySettings {
  read_data:           boolean;  // can read project data
  draft_artifacts:     boolean;  // can draft briefs/emails/tables
  navigate:            boolean;  // can suggest/perform navigation
  filter_sort:         boolean;  // can suggest/perform UI filtering
  compute_intel:       boolean;  // can run analytics intelligence pipeline
  modify_with_confirm: boolean;  // can modify data WITH confirmation
  modify_no_confirm:   boolean;  // auto-modify (advanced; default false)
  /* Destructive actions can NEVER be auto-allowed — hardcoded boundary. */
}

export interface PerPageRules {
  kanban_can_filter:        boolean;
  kanban_can_create:        boolean;
  data_room_can_write:      boolean;
  planning_can_advance:     boolean;
}

export interface SeasonSettings {
  /* Capabilities */
  capabilities:        CapabilitySettings;
  per_page_rules:      PerPageRules;

  /* Voice */
  tone:                SeasonTone;       // passive/balanced/active
  verbosity:           SeasonVerbose;    // terse/balanced/detailed
  mood_animations:     boolean;          // orb pulse + color flows
  sound_feedback:      'off' | 'subtle' | 'present';

  /* Knowledge */
  use_general_seo:     boolean;
  remember_sessions:   boolean;
  web_access:          boolean;  // Phase 11 — gate live web search

  /* Cost */
  daily_llm_cap:       number;           // 10..500
}

const DEFAULT_SETTINGS: SeasonSettings = {
  capabilities: {
    read_data:           true,
    draft_artifacts:     true,
    navigate:            true,
    filter_sort:         true,
    compute_intel:       true,
    modify_with_confirm: true,
    modify_no_confirm:   false,
  },
  per_page_rules: {
    kanban_can_filter:    true,
    kanban_can_create:    false,
    data_room_can_write:  false,
    planning_can_advance: false,
  },
  tone:              'balanced',
  verbosity:         'balanced',
  mood_animations:   true,
  sound_feedback:    'off',
  use_general_seo:   true,
  remember_sessions: true,
  web_access:        true,
  daily_llm_cap:     50,
};

/* ─── Context ───────────────────────────────────────────────── */

interface SeasonContextValue {
  /* Modal */
  isOpen:        boolean;
  open:          (initialQuery?: string) => void;
  close:         () => void;
  initialQuery:  string | null;

  /* Mood */
  mood:          SeasonMood;
  setMood:       (m: SeasonMood) => void;

  /* Presence */
  orbVisible:    boolean;
  setOrbVisible: (v: boolean) => void;
  orbPosition:   OrbPosition;
  setOrbPosition: (p: OrbPosition) => void;
  paused:        boolean;
  setPaused:     (v: boolean) => void;

  /* Settings */
  settings:      SeasonSettings;
  updateSettings: (patch: Partial<SeasonSettings>) => void;
  resetSettings:  () => void;

  /* Awareness (Phase 9) */
  awareness:        SeasonAwareness | null;
  setAwareness:     (a: SeasonAwareness | null) => void;
}

const SeasonContext = createContext<SeasonContextValue | null>(null);

/* ─── localStorage keys ─── */
const LS_VISIBLE   = 'season_orb_visible';
const LS_POSITION  = 'season_orb_position';
const LS_PAUSED    = 'season_paused';
const LS_SETTINGS  = 'season_settings_v1';

function loadSettings(): SeasonSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    /* Merge so newly-added settings get their defaults */
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      capabilities:   { ...DEFAULT_SETTINGS.capabilities, ...(parsed.capabilities || {}) },
      per_page_rules: { ...DEFAULT_SETTINGS.per_page_rules, ...(parsed.per_page_rules || {}) },
    };
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s: SeasonSettings) {
  try { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); } catch { /* ignore */ }
}

export function SeasonProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen]               = useState(false);
  const [initialQuery, setInitialQuery]   = useState<string | null>(null);
  const [mood, setMood]                   = useState<SeasonMood>('quiet');

  const [orbVisible, setOrbVisibleState]   = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(LS_VISIBLE);
    return stored === null ? true : stored === 'true';
  });
  const [orbPosition, setOrbPositionState] = useState<OrbPosition>(() => {
    if (typeof window === 'undefined') return 'br';
    const stored = localStorage.getItem(LS_POSITION) as OrbPosition;
    return ['br', 'bl', 'tr', 'tl'].includes(stored) ? stored : 'br';
  });
  const [paused, setPausedState]           = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(LS_PAUSED) === 'true';
  });
  const [settings, setSettings]            = useState<SeasonSettings>(() => loadSettings());
  const [awareness, setAwareness]          = useState<SeasonAwareness | null>(null);

  const setOrbVisible  = useCallback((v: boolean) => {
    setOrbVisibleState(v);
    try { localStorage.setItem(LS_VISIBLE, String(v)); } catch { /* ignore */ }
  }, []);
  const setOrbPosition = useCallback((p: OrbPosition) => {
    setOrbPositionState(p);
    try { localStorage.setItem(LS_POSITION, p); } catch { /* ignore */ }
  }, []);
  const setPaused      = useCallback((v: boolean) => {
    setPausedState(v);
    try { localStorage.setItem(LS_PAUSED, String(v)); } catch { /* ignore */ }
  }, []);
  const updateSettings = useCallback((patch: Partial<SeasonSettings>) => {
    setSettings(prev => {
      /* Deep-merge nested objects so a top-level patch doesn't wipe out
         capabilities or per_page_rules. */
      const next: SeasonSettings = {
        ...prev,
        ...patch,
        capabilities:   { ...prev.capabilities,   ...(patch.capabilities   || {}) },
        per_page_rules: { ...prev.per_page_rules, ...(patch.per_page_rules || {}) },
      };
      /* HARD BOUNDARY: destructive actions can never be auto-allowed.
         Even via settings. This is the unbreakable rule. */
      /* (Reserved for future capability flags. Today this is enforced at
         the action layer in Phase 10.) */
      saveSettings(next);
      return next;
    });
  }, []);
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
  }, []);

  const open  = useCallback((q?: string) => {
    if (paused) return;
    setInitialQuery(q || null);
    setIsOpen(true);
  }, [paused]);
  const close = useCallback(() => {
    setIsOpen(false);
    setInitialQuery(null);
  }, []);

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
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
      settings, updateSettings, resetSettings,
      awareness, setAwareness,
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
