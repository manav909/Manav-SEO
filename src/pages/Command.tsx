/* ════════════════════════════════════════════════════════════════
   src/pages/Command.tsx
   Phase 7 — S.E.A.S.O.N. Command Page (PATCHED v2).

   FIXES IN THIS VERSION:
     1. Mounts SmartSidebar + SmartTopBar — page now has navigation
        chrome instead of being a naked white error.
     2. The input box renders ALWAYS, even when briefing fails.
     3. "Project not found" now shows as a soft inline notice with a
        one-tap project picker (uses projects list from auth context).
     4. Honest copy: explains what went wrong + how to fix it.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState, Component, type ReactNode, type ErrorInfo } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import {
  Sparkles, AlertCircle, CheckCircle2, Activity, ArrowRight,
  X, Send, RefreshCw, Database, Building2, ExternalLink, Lightbulb, Settings,
} from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSeason } from '@/contexts/SeasonContext';
import { subscribeAction } from '@/lib/season-actions/bus';
import { useSeasonAction } from '@/hooks/useSeasonAction';
import SmartSidebar from '@/components/SmartSidebar';
import SmartTopBar from '@/components/SmartTopBar';
import CapabilitiesPanel from '@/components/season/CapabilitiesPanel';
import WarRoomSection from '@/components/season/WarRoomSection';
import WhatNeedsYou from '@/components/season/WhatNeedsYou';
import CampaignPreviewInline from '@/components/season/CampaignPreviewInline';
/* Phase 21 Block 2.11 Phase A — two-mode war room */
import ModeToggle, { readSavedMode, saveMode, type CommandMode } from '@/components/season/ModeToggle';
import ActionDeck from '@/components/season/ActionDeck';
import ProjectPulse from '@/components/season/ProjectPulse';
import CasualDigest from '@/components/season/CasualDigest';
import ManavsPick from '@/components/season/ManavsPick';
import StatusStrip from '@/components/season/StatusStrip';
import { consumeHandoff } from '@/components/season/ChatHandoff';
import { DURATION, FEATHER_EASE, modeSwitchVariants } from '@/components/season/warRoomAnimations';
/* Phase 21 Block 2.14 — widget infrastructure */
import { useUserPrefs } from '@/components/season/widgets/useUserPrefs';
import CommandDrawer from '@/components/season/widgets/CommandDrawer';
import {
  seasonBriefing, seasonCommand, seasonActivity,
  type BriefingClient, type BriefingItemClient,
  type CommandResponseClient, type ActivityEvent,
  /* Phase 21 Block 2.5 — grounded chat */
  seoClassifyIntent, seoChatSuggestions, seoExploreKeyword,
  type ChatSuggestion, type ToolsStatus, type ExplorationResponseClient,
  /* Phase 21 Block 2.7 — commitment-intent inline preview */
  seoRecommendCampaignStructure, seoWarRoomBriefing,
  type CampaignStructureRecommendation, type ProjectPositioning,
  type RecoverableOpportunityClient,
  /* Phase 21 Block 2.11 Phase A — unified war room v2 */
  seoWarRoomBriefingV2,
  type UnifiedPriorityItemClient, type ScorecardCellClient,
  type WarRoomBriefingV2Client,
} from '@/components/pm/api';

/* Phase 21 Block 2.5 — relative time display for source freshness */
/* Phase 21 Block 2.5b — Pro mode multi-turn chat scrollback.
   Each turn captures the user's input + the assistant's CommandResponseClient
   so Pro mode can render a vertical history of past Q&A pairs. Persisted
   per-project in localStorage, capped at MAX_CHAT_HISTORY. */
interface ChatTurn {
  id:         string;
  input:      string;
  response:   CommandResponseClient;
  timestamp:  number;
}
const MAX_CHAT_HISTORY = 30;
const chatStorageKey = (projectId: string) => `season_chat_history_${projectId}`;

function formatRelativeShort(iso?: string | null): string {
  if (!iso) return '';
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    if (isNaN(then)) return '';
    const sec = Math.max(0, Math.floor((now - then) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}

/* Phase 21 Block 2.7 — extract the keyword fragment from rank-related input
   for filter-on-type behavior. Returns "low" from "rank me for low". */
function extractKeywordFragment(text: string): string {
  if (!text) return '';
  const lc = text.trim().toLowerCase();
  if (lc.length < 4) return '';
  if (!/\b(rank|target|campaign|seo)\b/i.test(lc)) return '';
  /* Strip leading intent verbs, then strip trailing quotes/punct */
  const stripped = lc
    .replace(/^(?:rank(?:ing)?\s+(?:me\s+)?for|get\s+(?:me\s+)?ranking\s+for|target\s+(?:keywords?)?|seo\s+for|campaign\s+for|start\s+(?:a\s+)?campaign\s+for|create\s+(?:a\s+)?campaign\s+for)[\s:"']*/i, '')
    .replace(/[?!.]+$/, '')
    .replace(/^["']?|["']?$/g, '')
    .trim();
  return stripped.length >= 2 ? stripped : '';
}

function useTypewriter(text: string, speedMs = 18): string {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    if (!text) { setDisplayed(''); return; }
    setDisplayed('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, speedMs);
    return () => clearInterval(interval);
  }, [text, speedMs]);
  return displayed;
}

/* ────────────────────────────────────────────────────────────
   Local error boundary — page never crashes to global handler.
   If render throws (TDZ, missing data, anything), we show a
   graceful inline state with the input still usable.
──────────────────────────────────────────────────────────── */

class CommandBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    /* Log to console for diagnostic — never to a sink we don't own. */
    // eslint-disable-next-line no-console
    console.error('[S.E.A.S.O.N. caught render error]', error, info?.componentStack);
  }
  reset = () => this.setState({ error: null });
  render() {
    if (this.state.error) {
      return <SoftCommandFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function SoftCommandFallback({ error, reset }: { error: Error; reset: () => void }) {
  const errText = `${error.name}: ${error.message}\n\nStack:\n${error.stack || '(no stack)'}`;
  const copy = () => {
    try { navigator.clipboard?.writeText(errText); } catch { /* ignore */ }
  };
  /* Pure HTML — no SmartSidebar/SmartTopBar/etc. so a TDZ
     in any of those components can't crash the fallback. */
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, hsl(222 47% 4%) 0%, hsl(222 47% 6%) 100%)',
      color: 'hsl(210 40% 96%)',
      padding: '48px 24px',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgb(34, 211, 238)', fontWeight: 'bold', marginBottom: '8px' }}>
          S.E.A.S.O.N.
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, lineHeight: 1.2 }}>
          Something went wrong on this page.
        </h1>
        <p style={{ marginTop: '8px', fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
          Honest answer: my last code change had a runtime error. The rest of the app is unaffected. Below is the exact error so I can fix it.
        </p>
        <div style={{
          marginTop: '20px',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          background: 'rgba(239, 68, 68, 0.05)',
          borderRadius: '12px',
          padding: '12px',
        }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', color: 'rgb(239, 68, 68)', marginBottom: '4px' }}>
            Error signature
          </div>
          <pre style={{ fontSize: '11px', color: 'rgba(255,255,255,0.9)', fontFamily: 'ui-monospace, monospace', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {error.message}
          </pre>
        </div>
        <details style={{ marginTop: '12px' }}>
          <summary style={{ fontSize: '11px', color: 'rgba(34, 211, 238, 0.8)', cursor: 'pointer' }}>
            Show full diagnostic
          </summary>
          <pre style={{
            marginTop: '8px',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.5)',
            fontFamily: 'ui-monospace, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: '256px',
            overflowY: 'auto',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(0,0,0,0.3)',
            padding: '8px',
            borderRadius: '8px',
          }}>{errText}</pre>
        </details>
        <div style={{ marginTop: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={reset} style={{
            fontSize: '12px', padding: '6px 12px', borderRadius: '8px', fontWeight: 'bold',
            background: 'rgba(34, 211, 238, 0.15)', color: 'rgb(34, 211, 238)',
            border: '1px solid rgba(34, 211, 238, 0.3)', cursor: 'pointer',
          }}>Try again</button>
          <button onClick={copy} style={{
            fontSize: '12px', padding: '6px 12px', borderRadius: '8px', fontWeight: 'bold',
            background: 'transparent', color: 'rgba(255,255,255,0.6)',
            border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
          }}>Copy diagnostic</button>
          <a href="/data-room" style={{
            fontSize: '12px', padding: '6px 12px', borderRadius: '8px', fontWeight: 'bold',
            background: 'transparent', color: 'rgba(255,255,255,0.6)',
            border: '1px solid rgba(255,255,255,0.15)', textDecoration: 'none', display: 'inline-block',
          }}>Go to Data Room</a>
        </div>
      </div>
    </div>
  );
}

export default function Command() {
  return (
    <CommandBoundary>
      <CommandInner />
    </CommandBoundary>
  );
}

function CommandInner() {
  const { selectedProjectId, selectedProject, setSelectedProjectId } = useProject() as any;
  const { projects, user } = useAuth() as any;
  const { setMood } = useSeason();
  const safeProjects = (projects || []).filter((p: any) => p && p.id);

  /* Phase 21 Block 2.14 — user preferences (widget layouts, density, default mode) */
  const userId: string | null = user?.id || null;
  const { prefs, setPrefs: setUserPrefs, loading: prefsLoading } = useUserPrefs(userId);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* Phase 21 Block 2.16 — global ⌘. / Ctrl+. opens drawer (floating button removed) */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        setDrawerOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* Phase 21 Block 2.8 — action runner for ResponsePanel buttons */
  const { run: runAction, confirm: confirmAction, cancel: cancelAction, pendingConfirm, running: actionRunning } = useSeasonAction();

  const [briefing, setBriefing] = useState<BriefingClient | null>(null);
  const [loading, setLoading]   = useState(true);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  const [input, setInput]               = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [response, setResponse]         = useState<CommandResponseClient | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const inputRef                        = useRef<HTMLInputElement>(null);

  /* Phase 21 Block 2.5b — Multi-turn chat scrollback (Pro mode only).
     Each successful response is appended as a ChatTurn. History is persisted
     per-project in localStorage and capped at MAX_CHAT_HISTORY turns.
     Casual mode ignores this entirely (stays single-shot). */
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);

  const [activityOpen, setActivityOpen]   = useState(false);
  const [activity, setActivity]            = useState<ActivityEvent[]>([]);

  /* Phase 21 Block 2.5/2.6 — grounded chat state shared with the modal */
  const [chatSuggestions, setChatSuggestions]         = useState<ChatSuggestion[]>([]);
  const [suggestionsNote, setSuggestionsNote]         = useState<string | null>(null);
  const [toolsStatus, setToolsStatus]                 = useState<ToolsStatus | null>(null);
  const [explorationResponse, setExplorationResponse] = useState<ExplorationResponseClient | null>(null);
  const [loadingExploration, setLoadingExploration]   = useState(false);

  /* Phase 21 Block 2.7 — inline commitment-intent preview state */
  const [pendingStructure, setPendingStructure]       = useState<CampaignStructureRecommendation | null>(null);
  const [pendingPositioning, setPendingPositioning]   = useState<ProjectPositioning | null>(null);
  const [pendingOriginalInput, setPendingOriginalInput] = useState<string>('');
  const [loadingStructure, setLoadingStructure]       = useState(false);

  /* Phase 21 Block 2.7 — recoverable opportunities for WhatNeedsYou hero */
  const [recoverableTop, setRecoverableTop]           = useState<RecoverableOpportunityClient[]>([]);

  /* Phase 21 Block 2.11 Phase A — two-mode foundation */
  const [mode, setMode] = useState<CommandMode>(() => readSavedMode());
  const [unifiedFeed, setUnifiedFeed]   = useState<UnifiedPriorityItemClient[]>([]);
  const [scorecard, setScorecard]       = useState<ScorecardCellClient[]>([]);
  const [warRoomBriefing, setWarRoomBriefing] = useState<WarRoomBriefingV2Client | null>(null);
  const [warRoomLoading, setWarRoomLoading] = useState<boolean>(false);
  const [handoffNotice, setHandoffNotice]   = useState<string | null>(null);

  /* Capabilities panel state + ? keyboard shortcut */
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if (isTyping) return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setCapabilitiesOpen(o => !o);
      }
      if (e.key === 'Escape') {
        setCapabilitiesOpen(false);
        setActivityOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* Load briefing — extracted so the action bus can re-trigger it */
  const loadBriefing = async () => {
    if (!selectedProjectId) { setLoading(false); setBriefing(null); setBriefingError(null); return; }
    setLoading(true);
    setBriefingError(null);
    const r = await seasonBriefing(selectedProjectId);
    if (r.error) setBriefingError(r.error);
    if (r.briefing) setBriefing(r.briefing);
    setLoading(false);
  };

  useEffect(() => {
    loadBriefing();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [selectedProjectId]);

  /* Phase 10b — listen for refresh_briefing action */
  useEffect(() => {
    const unsub = subscribeAction('refresh_briefing', () => { loadBriefing(); });
    return unsub;
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [selectedProjectId]);

  /* Phase 21 Block 2.9 — listen for query-refire bus events from try_* actions */
  useEffect(() => {
    const unsub = subscribeAction('season_refire_query', (payload?: any) => {
      const q = payload?.query;
      if (typeof q === 'string' && q.trim().length > 0) {
        runChatCommand(q);
      }
    });
    return unsub;
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [selectedProjectId]);

  /* Derive S.E.A.S.O.N. mood from briefing state — drives orb color globally */
  useEffect(() => {
    if (!briefing) { setMood('quiet'); return; }
    const critCount = briefing.attention.filter((a: any) => a.severity === 'critical').length;
    const warnCount = briefing.attention.filter((a: any) => a.severity === 'warning').length;
    const winCount  = briefing.quiet_wins.length;
    if (critCount > 0)                   setMood('critical');
    else if (warnCount > 0)              setMood('alert');
    else if (winCount >= 3 && briefing.attention.length === 0) setMood('celebrating');
    else if (briefing.attention.length > 0) setMood('focused');
    else                                 setMood('calm');
  }, [briefing, setMood]);

  /* Phase 21 Block 2.5 — debounced grounded suggestions on rank-related typing.
     Same logic as the modal: surfaces GSC opportunities, existing campaigns,
     and inbox opportunities. Source-cited. No fabrication. */
  useEffect(() => {
    if (!selectedProjectId) {
      setChatSuggestions([]);
      setSuggestionsNote(null);
      return;
    }
    const looksRankRelated = /\b(rank|target|campaign)\b/i.test(input);
    if (!looksRankRelated || input.length < 4) {
      setChatSuggestions([]);
      setSuggestionsNote(null);
      return;
    }
    if (explorationResponse || response) return;
    const handle = setTimeout(async () => {
      try {
        const r = await seoChatSuggestions({ projectId: selectedProjectId, partialInput: input });
        if (r.error) return;
        setChatSuggestions(r.suggestions || []);
        setSuggestionsNote(r.honest_note || null);
        if (r.tools_status) setToolsStatus(r.tools_status);
      } catch { /* swallow */ }
    }, 380);
    return () => clearTimeout(handle);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [input, selectedProjectId, explorationResponse, response]);

  const handleSubmit = async (e?: React.FormEvent, override?: string) => {
    e?.preventDefault();
    const text = (override ?? input).trim();
    if (!text || submitting) return;
    if (!selectedProjectId) {
      setCommandError("Pick a project first — see the suggestions below.");
      return;
    }
    setSubmitting(true);
    setResponse(null);
    setCommandError(null);
    setExplorationResponse(null);
    setPendingStructure(null);
    setChatSuggestions([]);

    /* Phase 21 Block 2.5/2.7 — classify intent first.
       Commitment → inline structure preview (Block 2.7)
       Exploration → grounded read (Block 2.5)
       Question → standard chat brain */
    let routedAsCommitment  = false;
    let routedAsExploration = false;
    try {
      const classification = await seoClassifyIntent({ text });
      if (classification.intent === 'commitment')  routedAsCommitment  = true;
      else if (classification.intent === 'exploration') routedAsExploration = true;
    } catch {
      /* Fallback regex if classifier fails */
      if (/(?:^|\s)(rank(?:ing)?\s+(?:me\s+)?for|get\s+(?:me\s+)?ranking\s+for|target\s+keywords?|seo\s+for)\b/i.test(text)) {
        routedAsCommitment = true;
      }
    }

    if (routedAsCommitment) {
      setLoadingStructure(true);
      const r = await seoRecommendCampaignStructure({ projectId: selectedProjectId, rawInput: text });
      setLoadingStructure(false);
      setSubmitting(false);
      if (r.error || !r.structure) {
        setCommandError(`Couldn't read those keywords cleanly — ${r.error || 'no structure returned'}. Try rephrasing.`);
        return;
      }
      setPendingStructure(r.structure);
      setPendingPositioning(r.positioning || null);
      setPendingOriginalInput(text);
      return;
    }

    if (routedAsExploration) {
      setLoadingExploration(true);
      const explKw = text
        .replace(/^(?:what\s+about|should\s+(?:i|we)\s+(?:rank|target|pursue|go\s+after)|(?:can|could)\s+(?:i|we)\s+rank\s+for|is|tell\s+me\s+about|show\s+me\s+about|explore\s+(?:ranking\s+for|the\s+keyword)|worth\s+ranking\s+for)\s+/i, '')
        .replace(/^["']?|["'?.!]+$/g, '')
        .trim()
        .toLowerCase();
      if (!explKw || explKw.length < 2) {
        setCommandError('Tell me which keyword you want to explore (e.g. "what about app maker?").');
        setLoadingExploration(false);
        setSubmitting(false);
        return;
      }
      const r = await seoExploreKeyword({ projectId: selectedProjectId, keyword: explKw });
      setLoadingExploration(false);
      setSubmitting(false);
      if (r.error || !r.response) {
        setCommandError(`Couldn't explore "${explKw}" — ${r.error || 'no response'}.`);
        return;
      }
      setExplorationResponse(r.response);
      return;
    }

    /* Standard chat brain */
    const r = await seasonCommand({ projectId: selectedProjectId, input: text });
    setSubmitting(false);
    if (r.error) { setCommandError(r.error); return; }
    if (r.response) {
      setResponse(r.response);
      /* Phase 21 Block 2.5b — append to chat history for Pro mode scrollback.
         Casual mode ignores this; in Pro mode the latest turn renders as the
         live ResponsePanel and earlier turns render above as past context. */
      const newTurn: ChatTurn = {
        id:        `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        input:     text,
        response:  r.response,
        timestamp: Date.now(),
      };
      setChatHistory(prev => [...prev, newTurn].slice(-MAX_CHAT_HISTORY));
    }
  };

  /* Phase 21 Block 2.7 — fetch top recoverable opportunities for WhatNeedsYou hero */
  useEffect(() => {
    if (!selectedProjectId) { setRecoverableTop([]); return; }
    (async () => {
      try {
        const r = await seoWarRoomBriefing({ projectId: selectedProjectId });
        const recs = r.briefing?.grounded?.recoverable_opportunities;
        if (Array.isArray(recs)) setRecoverableTop(recs);
      } catch { /* swallow — WhatNeedsYou will simply render fewer rows */ }
    })();
  }, [selectedProjectId]);

  /* Phase 21 Block 2.5b — Load persisted chat history when project changes.
     History is per-project; switching projects loads that project's prior
     conversation. Capped at MAX_CHAT_HISTORY turns for storage safety. */
  useEffect(() => {
    if (!selectedProjectId) { setChatHistory([]); return; }
    try {
      const raw = localStorage.getItem(chatStorageKey(selectedProjectId));
      if (!raw) { setChatHistory([]); return; }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setChatHistory(parsed.slice(-MAX_CHAT_HISTORY));
      } else {
        setChatHistory([]);
      }
    } catch { setChatHistory([]); }
  }, [selectedProjectId]);

  /* Persist chat history on every change. localStorage write is cheap enough
     to do on every state change without debouncing — turns are infrequent. */
  useEffect(() => {
    if (!selectedProjectId) return;
    try {
      localStorage.setItem(
        chatStorageKey(selectedProjectId),
        JSON.stringify(chatHistory.slice(-MAX_CHAT_HISTORY)),
      );
    } catch { /* localStorage may be disabled or full — silently skip */ }
  }, [chatHistory, selectedProjectId]);

  /* Phase 21 Block 2.11 Phase A — fetch unified war room briefing v2.
     Mode-aware: casual gets 5 items, pro gets 10. Re-fetches on mode switch. */
  useEffect(() => {
    if (!selectedProjectId) {
      setUnifiedFeed([]);
      setScorecard([]);
      setWarRoomBriefing(null);
      return;
    }
    let cancelled = false;
    setWarRoomLoading(true);
    (async () => {
      try {
        const r = await seoWarRoomBriefingV2({ projectId: selectedProjectId, mode });
        if (cancelled) return;
        if (r.briefing) {
          setUnifiedFeed(r.briefing.unified_feed || []);
          setScorecard(r.briefing.scorecard || []);
          setWarRoomBriefing(r.briefing);
        } else {
          setUnifiedFeed([]);
          setScorecard([]);
          setWarRoomBriefing(null);
        }
      } catch {
        if (!cancelled) {
          setUnifiedFeed([]);
          setScorecard([]);
          setWarRoomBriefing(null);
        }
      } finally {
        if (!cancelled) setWarRoomLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedProjectId, mode]);

  /* Phase 21 Block 2.11 Phase A — persist mode preference */
  useEffect(() => { saveMode(mode); }, [mode]);

  /* Phase 21 Block 2.14 — when prefs first load from DB, apply default_mode
     if the user hasn't manually toggled in this session yet. We use the
     loaded_from_db flag to avoid overriding the user's local choice. */
  const [modeAppliedFromPrefs, setModeAppliedFromPrefs] = useState(false);
  useEffect(() => {
    if (!prefsLoading && prefs.loaded_from_db && !modeAppliedFromPrefs) {
      setMode(prefs.default_mode);
      setModeAppliedFromPrefs(true);
    }
  }, [prefsLoading, prefs.loaded_from_db, prefs.default_mode, modeAppliedFromPrefs]);

  /* Phase 21 Block 2.11 Phase A — restore chat handoff from modal (one-shot on mount).
     If the user was working in the modal and clicked "Full briefing", restore
     their in-flight state and show a subtle "Continuing from quick chat →" badge. */
  useEffect(() => {
    const handoff = consumeHandoff();
    if (!handoff) return;
    if (handoff.input) setInput(handoff.input);
    if (handoff.response) setResponse(handoff.response);
    if (handoff.exploration) setExplorationResponse(handoff.exploration);
    if (handoff.pending_structure) {
      setPendingStructure(handoff.pending_structure);
      setPendingPositioning(handoff.pending_positioning || null);
      setPendingOriginalInput(handoff.pending_original || '');
    }
    if (Array.isArray(handoff.chat_suggestions)) setChatSuggestions(handoff.chat_suggestions);
    if (handoff.suggestions_note) setSuggestionsNote(handoff.suggestions_note);
    setHandoffNotice('Continuing from quick chat');
    /* Fade the notice out after 6 seconds */
    const t = setTimeout(() => setHandoffNotice(null), 6000);
    return () => clearTimeout(t);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  useEffect(() => {
    if (!activityOpen || !selectedProjectId) return;
    (async () => {
      const r = await seasonActivity({ projectId: selectedProjectId, limit: 60 });
      if (r.events) setActivity(r.events);
    })();
  }, [activityOpen, selectedProjectId]);

  /* Auto-recover from stale project ID.
     If the briefing API returned "Project not found" and the account has
     exactly one valid project, silently switch to it. With multiple,
     leave the picker visible so the user chooses deliberately. */
  useEffect(() => {
    if (briefingError === "Project not found" && safeProjects.length === 1) {
      const onlyId = safeProjects[0].id;
      if (onlyId && onlyId !== selectedProjectId) {
        setSelectedProjectId(onlyId);
      }
    }
  }, [briefingError, safeProjects.length, selectedProjectId, setSelectedProjectId]);

  /* Phase 21 Block 2.10 — unified chat command runner.
     ANY button or chip that wants to fire a chat command goes through here.
     Guarantees: all transient state cleared, input set, submit fired. */
  const runChatCommand = (q: string) => {
    /* Clear every transient output panel + every error/loader */
    setResponse(null);
    setExplorationResponse(null);
    setPendingStructure(null);
    setPendingPositioning(null);
    setPendingOriginalInput('');
    setCommandError(null);
    setChatSuggestions([]);
    setSuggestionsNote(null);
    setLoadingExploration(false);
    setLoadingStructure(false);
    cancelAction();   // dismiss any pending confirm
    setInput(q);
    handleSubmit(undefined, q);
  };

  /* Phase 21 Block 2.10 — return to default page state.
     No submission, just clear everything visible. Triggered on:
       • Escape key (unless typing in an input)
       • Outside-click of any open card (handled by individual card X buttons) */
  const resetToDefault = () => {
    setResponse(null);
    setExplorationResponse(null);
    setPendingStructure(null);
    setPendingPositioning(null);
    setPendingOriginalInput('');
    setCommandError(null);
    setChatSuggestions([]);
    setSuggestionsNote(null);
    setLoadingExploration(false);
    setLoadingStructure(false);
    cancelAction();
    setInput('');
  };

  /* Legacy alias — kept so older callsites in the file still work. */
  const handleQuickAction = (q: string) => runChatCommand(q);

  /* Phase 21 Block 2.10 — input-clear watcher.
     When the input drops to empty AND no submitted panel is open, soft-reset
     the transient state. Lets the user "delete the query to start over". */
  useEffect(() => {
    if (input.trim().length === 0 && !response && !explorationResponse && !pendingStructure) {
      if (commandError) setCommandError(null);
      if (suggestionsNote) setSuggestionsNote(null);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [input, response, explorationResponse, pendingStructure]);

  /* Phase 21 Block 2.10 — Escape key returns to default state.
     Skip when typing inside the chat input itself (Esc clears native focus). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA';
      if (isTyping) {
        /* If the chat input is focused and has text, clear text first.
           If already empty, fall through to full reset. */
        if (e.target === inputRef.current && input.trim().length > 0) {
          e.preventDefault();
          setInput('');
          return;
        }
      }
      if (response || explorationResponse || pendingStructure || commandError) {
        e.preventDefault();
        resetToDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [input, response, explorationResponse, pendingStructure, commandError]);

  const showProjectPicker =
    !loading && (!selectedProjectId || briefingError === "Project not found" || (briefingError && !briefing));

  return (
    <MotionConfig reducedMotion={prefs.reduce_motion ? 'always' : 'never'}>
    <div
      className={`min-h-screen bg-gradient-to-b from-background via-background to-card text-foreground ${
        prefs.density === 'compact' ? 'season-density-compact' : 'season-density-comfortable'
      }`}
      data-reduce-motion={prefs.reduce_motion ? 'true' : 'false'}>
      <SmartTopBar />
      <SmartSidebar />

      <div className="relative md:pl-64 pt-10 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.3) 0%, transparent 70%)' }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.15, 0.25, 0.15] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        <div className={`relative transition-all duration-500 ${
          mode === 'pro'
            ? 'px-5 lg:px-8 pb-8'
            : 'mx-auto max-w-3xl lg:max-w-6xl px-4 sm:px-6 lg:px-10 pb-10'
        }`}>

          {/* Phase 21 Block 2.20 — Casual width bumped from 5xl (1024px) to 6xl (1152px).
              Pairs with hiding AIConcierge on this page (it was covering right-side content
              and making the left whitespace feel orphaned). */}
          {!loading && briefing && (
            <div className="flex items-center justify-between gap-3 mb-6 pt-2">
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/75 flex items-center gap-2 min-w-0">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate font-bold">{selectedProject?.project_name || selectedProject?.name || briefing.project_name}</span>
                <span className="text-cyan-400/50 shrink-0">·</span>
                <span className="text-cyan-400 shrink-0">S.E.A.S.O.N.</span>
              </motion.div>
              <div className="flex items-center gap-2 shrink-0">
                <ModeToggle mode={mode} onChange={setMode} />
                <button
                  onClick={() => setDrawerOpen(true)}
                  title="Command Settings (⌘.)"
                  className="w-9 h-9 rounded-full bg-card/40 border border-border/50 flex items-center justify-center text-muted-foreground/75 hover:text-cyan-400 hover:border-cyan-500/40 hover:bg-cyan-500/[0.05] transition-colors">
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          {(!briefing || loading) && (
            <div className="flex items-center justify-end gap-2 mb-6 pt-2">
              <ModeToggle mode={mode} onChange={setMode} />
              <button
                onClick={() => setDrawerOpen(true)}
                title="Command Settings (⌘.)"
                className="w-9 h-9 rounded-full bg-card/40 border border-border/50 flex items-center justify-center text-muted-foreground/75 hover:text-cyan-400 hover:border-cyan-500/40 hover:bg-cyan-500/[0.05] transition-colors">
                <Settings className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Phase 21 Block 2.11 Phase A — handoff notice */}
          <AnimatePresence>
            {handoffNotice && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: DURATION.major, ease: FEATHER_EASE }}
                className="mb-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[10px] text-cyan-300 uppercase tracking-wider font-bold">
                <ArrowRight className="h-3 w-3" /> {handoffNotice} →
              </motion.div>
            )}
          </AnimatePresence>

          {loading && <LoadingHero />}

          {!loading && briefing && (
            <GreetingBlock briefing={briefing} project={selectedProject} />
          )}

          {!loading && !briefing && (
            <FallbackGreeting
              hasProject={!!selectedProjectId}
              projectError={briefingError}
              projectsAvailable={safeProjects.length}
            />
          )}

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="mt-8">
            <form onSubmit={handleSubmit}>
              <div className="relative group">
                <motion.div
                  className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-cyan-500/40 via-violet-500/40 to-cyan-500/40 transition-opacity duration-500 blur-md"
                  animate={submitting
                    ? { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'], opacity: [0.6, 1, 0.6] }
                    : { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }
                  }
                  transition={submitting
                    ? { duration: 1.8, repeat: Infinity, ease: 'linear' }
                    : { duration: 6, repeat: Infinity, ease: 'linear' }
                  }
                  style={{ backgroundSize: '200% 200%', opacity: submitting ? 0.85 : undefined }}
                />
                <div className="relative rounded-2xl border border-border bg-card/80 backdrop-blur-sm">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={selectedProjectId ? "What should we work on?" : "Pick a project below, then ask me anything"}
                    disabled={submitting}
                    autoFocus
                    className="w-full bg-transparent px-5 py-4 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !input.trim()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </form>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
              className="mt-3 flex flex-wrap gap-2">
              {[
                { label: "Diagnose system",          q: "diagnose",                     priority: true },
                { label: "Summarize this week",      q: "Summarize this week" },
                { label: "What needs me today?",     q: "What needs me today?" },
                { label: "How are we doing?",        q: "How are we doing?" },
                { label: "Where do the numbers come from?", q: "Where do the numbers come from?" },
              ].map((item, i) => (
                <motion.button key={item.q} onClick={() => handleQuickAction(item.q)}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.2 + i * 0.08 }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  disabled={!selectedProjectId}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    item.priority
                      ? 'border-amber-500/40 bg-amber-500/[0.08] text-amber-400 hover:bg-amber-500/15 font-bold'
                      : 'border-border bg-card/40 text-muted-foreground hover:text-foreground hover:border-cyan-500/30'
                  }`}>
                  {item.label}
                </motion.button>
              ))}
              {/* Capabilities chip */}
              <motion.button onClick={() => setCapabilitiesOpen(true)}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 + 4 * 0.08 }}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className="text-xs px-3 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/[0.05] text-cyan-400 hover:bg-cyan-500/15 transition-colors flex items-center gap-1">
                <Sparkles className="h-3 w-3" />What can I do?
                <span className="text-[9px] text-muted-foreground/60 ml-0.5">·  ?</span>
              </motion.button>
            </motion.div>

            {commandError && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-400 flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div className="flex-1">{commandError}</div>
                <button onClick={() => setCommandError(null)}><X className="h-3 w-3" /></button>
              </motion.div>
            )}

            {/* Phase 21 Block 2.8 — pending action confirmation prompt */}
            {pendingConfirm && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.08] p-3 flex items-start gap-3">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
                <div className="flex-1 text-xs text-foreground/90 leading-relaxed">
                  Confirm: <strong>{pendingConfirm.action.label}</strong> — {pendingConfirm.action.description}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={async () => {
                      const r = await confirmAction();
                      if (r.ok && (r as any).navigated) setResponse(null);
                    }}
                    disabled={actionRunning}
                    className="text-[11px] px-3 py-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 font-bold flex items-center gap-1.5">
                    {actionRunning && <RefreshCw className="h-3 w-3 animate-spin" />}
                    Confirm
                  </button>
                  <button
                    onClick={cancelAction}
                    disabled={actionRunning}
                    className="text-[11px] px-3 py-1.5 rounded-md border border-border bg-card/40 text-muted-foreground hover:text-foreground disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}

            {/* Phase 21 Block 2.8 — submitting indicator (right after input, before any output) */}
            {submitting && !response && !explorationResponse && !pendingStructure && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/80">
                <motion.span
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <motion.span
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.4, repeat: Infinity, delay: 0.2 }}
                  className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <motion.span
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.4, repeat: Infinity, delay: 0.4 }}
                  className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span className="ml-1">Reading the data — one moment…</span>
              </motion.div>
            )}

            {/* Phase 21 Block 2.5 — grounded suggestions panel (same as modal) */}
            {chatSuggestions.length > 0 && !response && !explorationResponse && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="mt-3">
                <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-cyan-400 mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" /> Grounded suggestions
                </div>
                <div className="space-y-1.5">
                  {chatSuggestions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { runChatCommand(s.command); }}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                        s.kind === 'existing_campaign_match'
                          ? 'border-rose-500/30 bg-rose-500/[0.05] hover:bg-rose-500/[0.08]'
                          : s.kind === 'gsc_opportunity'
                            ? 'border-cyan-500/30 bg-cyan-500/[0.06] hover:bg-cyan-500/[0.10]'
                            : 'border-border/40 bg-card/40 hover:bg-card/60'
                      }`}>
                      <div className="text-xs text-foreground/90 leading-relaxed">{s.text}</div>
                      <div className="text-[9px] text-muted-foreground/60 mt-1 flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-card/60 border border-border/40 uppercase tracking-wider font-semibold">
                          source: {s.source.kind === 'gsc' ? 'GSC' : s.source.kind}
                        </span>
                        <span>·</span>
                        <span>{s.source.label}</span>
                        {s.source.last_refresh && (
                          <>
                            <span>·</span>
                            <span>refreshed {formatRelativeShort(s.source.last_refresh)}</span>
                          </>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                {suggestionsNote && (
                  <div className="text-[10px] text-muted-foreground/55 mt-2 italic">{suggestionsNote}</div>
                )}
              </motion.div>
            )}

            {/* Phase 21 Block 2.5 — tools status banner when GSC/GA4 not connected */}
            {toolsStatus && !chatSuggestions.length && !explorationResponse && !response && (!toolsStatus.gsc_connected || !toolsStatus.ga4_connected) && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs text-muted-foreground/85 leading-relaxed">
                <span className="text-amber-400 font-bold">Connect for richer guidance:</span>{' '}
                {!toolsStatus.gsc_connected && 'GSC '}
                {!toolsStatus.gsc_connected && !toolsStatus.ga4_connected && '+ '}
                {!toolsStatus.ga4_connected && 'GA4 '}
                not connected. Suggestions degrade gracefully — but real data unlocks honest source-cited recommendations.
              </div>
            )}

            {/* Phase 21 Block 2.5 — exploration response */}
            {explorationResponse && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="mt-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/[0.04] p-5">
                <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-cyan-400 mb-3 flex items-center gap-1.5">
                  <Lightbulb className="h-3 w-3" /> Exploring "{explorationResponse.keyword}"
                </div>

                {explorationResponse.gsc_snapshot && (
                  <div className="mb-3 rounded-lg border border-border/40 bg-card/30 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2 font-bold">Current GSC state</div>
                    <div className="flex flex-wrap gap-4 mb-1.5">
                      <div className="text-xs text-foreground/90">
                        Position: <strong className="text-cyan-400">{explorationResponse.gsc_snapshot.position?.toFixed(1) ?? 'n/a'}</strong>
                      </div>
                      <div className="text-xs text-foreground/90">Impressions: <strong>{explorationResponse.gsc_snapshot.impressions ?? 0}</strong></div>
                      <div className="text-xs text-foreground/90">Clicks: <strong>{explorationResponse.gsc_snapshot.clicks ?? 0}</strong></div>
                    </div>
                    <div className="text-[9px] text-muted-foreground/55">
                      Source: {explorationResponse.gsc_snapshot.source.label}
                      {explorationResponse.gsc_snapshot.source.last_refresh && ` · refreshed ${formatRelativeShort(explorationResponse.gsc_snapshot.source.last_refresh)}`}
                    </div>
                  </div>
                )}
                {!explorationResponse.gsc_snapshot && (
                  <div className="mb-3 rounded-lg border border-dashed border-border/40 bg-card/20 p-3 text-xs text-muted-foreground/80 leading-relaxed">
                    {explorationResponse.has_gsc_data
                      ? 'No GSC row matched this exact keyword — your site may not appear for it yet.'
                      : 'No GSC data available — either the query has no impressions yet, or GSC isn\'t connected.'}
                  </div>
                )}

                {explorationResponse.duplicate_check?.is_duplicate && explorationResponse.duplicate_check.existing_campaign && (
                  <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.05] p-3">
                    <div className="text-[10px] uppercase tracking-wider text-rose-400 font-bold mb-1">Already in your campaigns</div>
                    <div className="text-xs text-foreground/90">
                      You have an {explorationResponse.duplicate_check.existing_campaign.status} campaign for "{explorationResponse.duplicate_check.existing_campaign.keyword}".
                    </div>
                  </div>
                )}

                {explorationResponse.positioning_read && (
                  <div className={`mb-3 rounded-lg p-3 border ${
                    explorationResponse.positioning_read.aligned === 'no'
                      ? 'border-rose-500/30 bg-rose-500/[0.05]'
                      : explorationResponse.positioning_read.aligned === 'partial'
                        ? 'border-amber-500/30 bg-amber-500/[0.05]'
                        : 'border-emerald-500/30 bg-emerald-500/[0.05]'
                  }`}>
                    <div className={`text-[10px] uppercase tracking-wider font-bold mb-1.5 ${
                      explorationResponse.positioning_read.aligned === 'no' ? 'text-rose-400'
                      : explorationResponse.positioning_read.aligned === 'partial' ? 'text-amber-400'
                      : 'text-emerald-400'
                    }`}>
                      Positioning alignment: {explorationResponse.positioning_read.aligned}
                    </div>
                    <div className="text-xs text-foreground/85 leading-relaxed">{explorationResponse.positioning_read.reasoning}</div>
                    {explorationResponse.positioning_read.citations.length > 0 && (
                      <div className="text-[9px] text-muted-foreground/55 mt-2 italic">
                        From positioning: {explorationResponse.positioning_read.citations.map(c => `"${c}"`).join(', ')}
                      </div>
                    )}
                  </div>
                )}

                <div className="mb-3 rounded-lg border border-border/40 bg-card/30 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5 font-bold">Strategic read</div>
                  <div className="text-sm text-foreground/90 leading-relaxed">{explorationResponse.strategic_read}</div>
                  {explorationResponse.strategic_read_sources.length > 0 && (
                    <div className="text-[9px] text-muted-foreground/55 mt-2">
                      Built from: {explorationResponse.strategic_read_sources.map(s => s.label).join(' · ')}
                    </div>
                  )}
                </div>

                {explorationResponse.honest_note && (
                  <div className="text-[11px] text-muted-foreground/65 mb-3 italic">{explorationResponse.honest_note}</div>
                )}

                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2 font-bold">Next steps</div>
                <div className="space-y-1.5">
                  {explorationResponse.next_step_options.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        if (opt.id === 'tell_more') {
                          setExplorationResponse(null);
                          setTimeout(() => inputRef.current?.focus(), 100);
                        } else {
                          const cmd = `rank me for "${explorationResponse.keyword}"`;
                          setInput(cmd);
                          setExplorationResponse(null);
                          runChatCommand(cmd);
                        }
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                        opt.id === 'run_feasibility'
                          ? 'border-cyan-500/30 bg-cyan-500/[0.08] hover:bg-cyan-500/[0.12]'
                          : 'border-border/40 bg-card/30 hover:bg-card/50'
                      }`}>
                      <div className="text-xs font-bold text-foreground/95">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground/75 mt-0.5 leading-relaxed">{opt.description}</div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setExplorationResponse(null)}
                  className="mt-3 text-[10px] px-2 py-1 rounded-md border border-border/50 bg-card/30 text-muted-foreground hover:text-foreground">
                  Close exploration
                </button>
              </motion.div>
            )}

            {loadingExploration && !explorationResponse && (
              <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3 text-xs text-muted-foreground/75 flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                Pulling real data — checking GSC, positioning, existing campaigns…
              </div>
            )}
          </motion.div>

          {showProjectPicker && safeProjects.length > 0 && (
            <ProjectPicker
              projects={safeProjects}
              selectedId={selectedProjectId}
              onPick={setSelectedProjectId}
              urgent={briefingError === "Project not found"}
            />
          )}

          {showProjectPicker && safeProjects.length === 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}
              className="mt-8 rounded-xl border border-border bg-card/40 p-4">
              <div className="text-sm text-foreground/90">I don't see any projects in your account yet.</div>
              <div className="text-xs text-muted-foreground mt-1">Once you create a project, S.E.A.S.O.N. will start briefing on it here.</div>
            </motion.div>
          )}

          {/* Phase 21 Block 2.5b — Pro mode chat scrollback.
              Renders past turns above the current ResponsePanel. In Casual
              this whole block is hidden (single-shot UX preserved).
              When response is null (user X'd out), show ALL history including
              the most recent so the just-closed turn isn't lost. */}
          {mode === 'pro' && chatHistory.length > 0 && (response ? chatHistory.length > 1 : true) && (
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between px-1">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">
                  Conversation history · {response ? chatHistory.length - 1 : chatHistory.length} turn{(response ? chatHistory.length - 1 : chatHistory.length) === 1 ? '' : 's'}
                </div>
                <button
                  onClick={() => { setChatHistory([]); }}
                  className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors flex items-center gap-1"
                  title="Clear conversation history for this project"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              </div>
              {(response ? chatHistory.slice(0, -1) : chatHistory).map(turn => (
                <HistoricalTurn key={turn.id} turn={turn} />
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {response && (
              <ResponsePanel
                key={response.intent + Date.now()}
                response={response}
                onClose={() => setResponse(null)}
                onAction={async (actionId, payload, label) => {
                  const r = await runAction(actionId, payload);
                  if (r.ok && !(r as any).awaiting_confirm) {
                    if ((r as any).navigated) setResponse(null);
                    return;
                  }
                  /* Phase 21 Block 2.9 — unknown-action fallback. */
                  if (!r.ok && /unknown action/i.test(r.message || '') && label) {
                    setResponse(null);
                    runChatCommand(label);
                  }
                }}
                actionRunning={actionRunning}
              />
            )}
          </AnimatePresence>

          {/* Phase 21 Block 2.7/2.10 — inline campaign preview wrapped in AnimatePresence */}
          <AnimatePresence>
            {pendingStructure && selectedProjectId && (
              <CampaignPreviewInline
                key="campaign-preview"
                structure={pendingStructure}
                positioning={pendingPositioning}
                projectId={selectedProjectId}
                originalInput={pendingOriginalInput}
                onClose={() => {
                  setPendingStructure(null);
                  setPendingPositioning(null);
                  setPendingOriginalInput('');
                }}
                onLaunched={() => { loadBriefing(); }}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {loadingStructure && !pendingStructure && (
              <motion.div
                key="loading-structure"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3 text-xs text-muted-foreground/75 flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                Reading positioning + grouping keywords + checking for duplicates…
              </motion.div>
            )}
          </AnimatePresence>

          {/* Phase 21 Block 2.10 — "Back to overview" hint shown when ANY output panel is open */}
          {(response || explorationResponse || pendingStructure) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-3 text-center">
              <button
                onClick={resetToDefault}
                className="text-[10px] text-muted-foreground/55 hover:text-cyan-400 transition-colors flex items-center gap-1 mx-auto">
                <X className="h-2.5 w-2.5" />
                Back to overview · Esc
              </button>
            </motion.div>
          )}

          {/* Phase 21 Block 2.12 — mode-aware layout.
              CASUAL: Manav's Pick external reading feed above WhatNeedsYou + WarRoom.
              PRO: StatusStrip + 2-column ActionDeck + ProjectPulse. */}
          <AnimatePresence mode="wait">
            {mode === 'casual' ? (
              <motion.div
                key="casual-layout"
                variants={modeSwitchVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-5">
                {/* Phase 21 Block 2.14 — Casual layout iterates user's widget order */}
                {prefs.layout_casual.map(widgetId => {
                  if (prefs.hidden_widgets.includes(widgetId)) return null;
                  if (response || explorationResponse || pendingStructure) return null;
                  switch (widgetId) {
                    case 'casual_manavs_pick':
                      return (
                        <ManavsPick
                          key={widgetId}
                          projectId={selectedProjectId}
                          onLaunchCommand={runChatCommand}
                        />
                      );
                    case 'casual_what_needs_you':
                      if (loading || !briefing) return null;
                      return (
                        <WhatNeedsYou
                          key={widgetId}
                          attentionItems={briefing.attention}
                          recoverableTop={recoverableTop}
                          onLaunchCommand={runChatCommand}
                        />
                      );
                    case 'casual_strategic_intel':
                      return (
                        <WarRoomSection
                          key={widgetId}
                          projectId={selectedProjectId}
                          filterTerm={extractKeywordFragment(input)}
                          onLaunchCommand={runChatCommand}
                        />
                      );
                    default:
                      return null;
                  }
                })}
              </motion.div>
            ) : (
              <motion.div
                key="pro-layout"
                variants={modeSwitchVariants}
                initial="hidden"
                animate="visible"
                exit="exit">
                {/* Status strip at top of Pro — cockpit row, always visible */}
                <StatusStrip
                  briefing={warRoomBriefing}
                  loading={warRoomLoading}
                  onLaunchCommand={runChatCommand}
                />
                <div className="mt-5 grid grid-cols-1 lg:grid-cols-[58fr_42fr] gap-5">
                  {/* LEFT — Action Deck */}
                  <div className="min-w-0">
                    {!response && !explorationResponse && !pendingStructure && (
                      <ActionDeck
                        projectId={selectedProjectId}
                        unifiedFeed={unifiedFeed}
                        loading={warRoomLoading}
                        filterTerm={extractKeywordFragment(input)}
                        onLaunchCommand={runChatCommand}
                        widgetOrder={prefs.layout_pro_left}
                        hiddenWidgets={prefs.hidden_widgets}
                      />
                    )}
                  </div>
                  {/* RIGHT — Project Pulse with real panels */}
                  <div className="min-w-0">
                    <ProjectPulse
                      projectId={selectedProjectId}
                      scorecard={scorecard}
                      loading={warRoomLoading}
                      onLaunchCommand={runChatCommand}
                      widgetOrder={prefs.layout_pro_right}
                      hiddenWidgets={prefs.hidden_widgets}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!loading && briefing && briefing.honest_gaps.length > 0 && !response && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 2.4 }}
              className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-amber-400/80 mb-1.5 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Honest gaps · things I couldn't check
              </div>
              <ul className="space-y-1 text-[11px] text-foreground/70">
                {briefing.honest_gaps.map((g, i) => {
                  const isIntelGap = /analytics intelligence/i.test(g);
                  const isGscGap   = /gsc.{1,20}(connect|pull|fresh)/i.test(g);
                  const isGa4Gap   = /ga4.{1,20}(connect|pull|fresh)/i.test(g);
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-amber-400/60 mt-0.5">•</span>
                      <div className="flex-1">
                        <div>{g}</div>
                        {isIntelGap && (
                          <motion.button
                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            onClick={() => handleQuickAction("compute analytics intelligence")}
                            className="mt-1 text-[10px] px-2 py-1 rounded-md font-bold border border-amber-500/40 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors">
                            Compute it now
                          </motion.button>
                        )}
                        {(isGscGap || isGa4Gap) && (
                          <a href="/data-room"
                            className="mt-1 inline-block text-[10px] px-2 py-1 rounded-md font-bold border border-amber-500/40 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors no-underline">
                            Open Data Room → Integrations
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          )}
        </div>

        {/* Phase 21 Block 2.16 — Behind the scenes button removed.
            Activity log is now a tab inside the Command drawer (open via top-bar gear or ⌘.). */}

        {/* Help / capabilities — mirror to bottom-left */}
        <motion.button
          onClick={() => setCapabilitiesOpen(true)}
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2.6 }}
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          className="fixed bottom-5 left-5 md:left-[17rem] px-3 py-2 rounded-full border border-violet-500/30 bg-card/80 backdrop-blur-sm text-violet-400 hover:border-violet-500/60 transition-colors text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-violet-500/10 z-30"
          title="Press ? anytime to open this">
          <Sparkles className="h-3 w-3" />
          What can I do?
          <span className="text-[9px] text-muted-foreground/60 ml-0.5 hidden sm:inline">·  ?</span>
        </motion.button>
      </div>

      <AnimatePresence>
        {activityOpen && <ActivityDrawer events={activity} onClose={() => setActivityOpen(false)} briefing={briefing} />}
      </AnimatePresence>

      <AnimatePresence>
        {capabilitiesOpen && <CapabilitiesPanel onClose={() => setCapabilitiesOpen(false)} onTry={handleQuickAction} hasProject={!!selectedProjectId} />}
      </AnimatePresence>

      {/* Phase 21 Block 2.16 — command drawer (no floating button — opens via top-bar gear or ⌘.) */}
      <CommandDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mode={mode}
        prefs={prefs}
        setPrefs={setUserPrefs}
        projectId={selectedProjectId}
        activity={activity}
        briefing={briefing}
      />
    </div>
    </MotionConfig>
  );
}

function LoadingHero() {
  return (
    <div className="space-y-3 pt-2">
      <motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
        className="h-8 w-2/3 rounded-md bg-muted/30" />
      <motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
        className="h-5 w-1/2 rounded-md bg-muted/30" />
      <div className="text-[11px] text-cyan-400/70 flex items-center gap-2 pt-2">
        <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1, repeat: Infinity }} className="w-1 h-1 rounded-full bg-cyan-400" />
        <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1, repeat: Infinity, delay: 0.15 }} className="w-1 h-1 rounded-full bg-cyan-400" />
        <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1, repeat: Infinity, delay: 0.3 }} className="w-1 h-1 rounded-full bg-cyan-400" />
        <span className="ml-1 italic">Checking everything before you arrive…</span>
      </div>
    </div>
  );
}

function GreetingBlock({ briefing }: { briefing: BriefingClient; project?: any }) {
  const greet = useTypewriter(briefing.greeting_phrase, 22);
  const [showStatus, setShowStatus] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowStatus(true), briefing.greeting_phrase.length * 22 + 250);
    return () => clearTimeout(t);
  }, [briefing.greeting_phrase]);
  const status = useTypewriter(showStatus ? briefing.status_summary : '', 12);
  return (
    <div className="pt-2 pb-2">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-tight min-h-[2.5rem]">
        {greet}
        {greet.length < briefing.greeting_phrase.length && (
          <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }}
            className="inline-block w-0.5 h-6 ml-0.5 bg-cyan-400 align-middle" />
        )}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground min-h-[1.25rem]">{status}</p>
    </div>
  );
}

function FallbackGreeting({ hasProject, projectError, projectsAvailable }: {
  hasProject: boolean; projectError: string | null; projectsAvailable: number;
}) {
  const headline = !hasProject
    ? "Hi. Which project should I look at?"
    : projectError === "Project not found"
      ? "That project isn't reachable right now."
      : projectError
        ? "I hit a snag pulling your status."
        : "Hi.";
  const sub = !hasProject
    ? projectsAvailable > 0
      ? "Pick one below — I'll brief you on it the moment you click."
      : "Looks like there are no projects yet. Create one to get started."
    : projectError === "Project not found"
      ? "The selected project ID doesn't match anything in the database. Maybe it was deleted, or your browser remembers an old selection. Pick a working one below."
      : projectError
        ? `Reason given: ${projectError}. Try a different project or refresh.`
        : "Tell me what you need below.";
  return (
    <div className="pt-2 pb-2">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-tight">{headline}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}

function ProjectPicker({ projects, selectedId, onPick, urgent }: {
  projects: any[]; selectedId: string; onPick: (id: string) => void; urgent?: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
      className={`mt-8 rounded-2xl border backdrop-blur-sm p-4 ${
        urgent ? 'border-cyan-500/40 bg-cyan-500/[0.06] shadow-lg shadow-cyan-500/10' : 'border-border bg-card/40'
      }`}>
      <div className="flex items-center gap-2 mb-3">
        <motion.div
          animate={urgent ? { scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] } : {}}
          transition={urgent ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}>
          <Building2 className="h-3.5 w-3.5 text-cyan-400" />
        </motion.div>
        <div className="text-[11px] uppercase tracking-wider font-bold text-foreground">
          {urgent ? "Tap a project to continue" : selectedId ? "Switch project" : "Pick a project"}
        </div>
        <div className="text-[10px] text-muted-foreground">({projects.length})</div>
      </div>
      {urgent && (
        <div className="text-[11px] text-cyan-400/90 mb-3">
          Your previous selection isn't in the database. Pick any one below — I'll brief you the moment you click.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {projects.slice(0, 12).map((p, i) => (
          <motion.button key={p.id} onClick={() => onPick(p.id)}
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + i * 0.04 }}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            className={`text-left rounded-lg border p-3 transition-colors ${
              p.id === selectedId
                ? 'border-cyan-500/40 bg-cyan-500/[0.08]'
                : urgent
                  ? 'border-cyan-500/20 bg-background/40 hover:border-cyan-500/50 hover:bg-cyan-500/[0.08]'
                  : 'border-border bg-background/30 hover:border-cyan-500/30 hover:bg-card/40'
            }`}>
            <div className="text-[12px] font-bold text-foreground truncate">{p.project_name || p.name || 'Untitled project'}</div>
            {p.client_url && <div className="text-[10px] text-muted-foreground truncate mt-0.5">{p.client_url}</div>}
            {p.id === selectedId && <div className="text-[10px] text-cyan-400 mt-1">currently selected</div>}
          </motion.button>
        ))}
      </div>
      {projects.length > 12 && (
        <div className="text-[10px] text-muted-foreground italic mt-2">Showing first 12 · use the project switcher up top for the full list.</div>
      )}
    </motion.div>
  );
}

function AttentionPanel({ items }: { items: BriefingItemClient[] }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 1.8 }}
      className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
        <div className="text-[11px] uppercase tracking-wider font-bold text-foreground">Needs you</div>
        <div className="text-[10px] text-muted-foreground">({items.length})</div>
      </div>
      {items.length === 0 ? (
        <div className="text-[12px] text-muted-foreground italic py-3">Nothing urgent. You can focus on building or just take a breath.</div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 2.0 + i * 0.08 }}
              className="group rounded-lg border border-border bg-background/30 px-3 py-2 hover:border-cyan-500/30 transition-colors cursor-pointer">
              <div className="flex items-start gap-2">
                <SeverityDot severity={item.severity} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-foreground leading-snug">{item.headline}</div>
                  {item.detail && <div className="text-[10px] text-muted-foreground mt-0.5">{item.detail}</div>}
                  <div className="text-[9px] text-muted-foreground/60 mt-0.5">via {item.source}</div>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function QuietWinsPanel({ items }: { items: BriefingItemClient[] }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 1.9 }}
      className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        <div className="text-[11px] uppercase tracking-wider font-bold text-foreground">Quiet wins</div>
        <div className="text-[10px] text-muted-foreground">({items.length})</div>
      </div>
      {items.length === 0 ? (
        <div className="text-[12px] text-muted-foreground italic py-3">No wins to report from the last 7 days yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 2.1 + i * 0.08 }}
              className="rounded-lg border border-border bg-background/30 px-3 py-2">
              <div className="flex items-start gap-2">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 2.2 + i * 0.08 }}>
                  <CheckCircle2 className="h-3 w-3 text-emerald-400/70 shrink-0 mt-0.5" />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-foreground/90 leading-snug">{item.headline}</div>
                  <div className="text-[9px] text-muted-foreground/60 mt-0.5">via {item.source}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const color = severity === 'critical' ? 'bg-red-400' : severity === 'warning' ? 'bg-amber-400' : severity === 'success' ? 'bg-emerald-400' : 'bg-cyan-400';
  return (
    <motion.span className={`w-1.5 h-1.5 rounded-full ${color} mt-1.5 shrink-0`}
      animate={severity === 'critical' ? { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] } : {}}
      transition={severity === 'critical' ? { duration: 1.5, repeat: Infinity } : {}} />
  );
}

function ResponsePanel({ response, onClose, onAction, actionRunning }: {
  response: CommandResponseClient;
  onClose: () => void;
  onAction?: (actionId: string, payload?: any, label?: string) => void | Promise<void>;
  actionRunning?: boolean;
}) {
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  async function handleClick(actionId: string, payload?: any, label?: string) {
    if (!onAction) return;
    setBusyActionId(actionId);
    try {
      await onAction(actionId, payload, label);
    } finally {
      setBusyActionId(null);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.97 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="mt-6 rounded-2xl border border-cyan-500/30 bg-card/60 backdrop-blur-md overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-gradient-to-r from-cyan-500/[0.06] to-transparent flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider font-bold text-cyan-400 flex items-center gap-1.5">
          <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          {response.intent === 'unknown' ? "Not sure yet" : response.intent.replace('_', ' ')} · {(response.confidence * 100).toFixed(0)}% confident
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="p-5 space-y-3.5">
        {response.chunks.map((c, i) => <StreamingChunk key={i} chunk={c} delay={i * 0.15} />)}
        {response.honest_note && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: response.chunks.length * 0.15 + 0.3 }}
            className="mt-4 pt-3 border-t border-amber-500/20 text-[11px] text-amber-400/85 italic flex items-start gap-1.5">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" /><span>{response.honest_note}</span>
          </motion.div>
        )}
      </div>
      {response.artifacts && response.artifacts.length > 0 && (
        <div className="px-4 pb-4 space-y-3">
          {response.artifacts.map((art, i) => (
            <ArtifactPanel key={i} artifact={art} delay={response.chunks.length * 0.15 + 0.6 + i * 0.2} />
          ))}
        </div>
      )}
      {response.actions && response.actions.length > 0 && (
        <div className="px-4 py-3 border-t border-border bg-card/40 flex flex-wrap gap-2">
          {response.actions.map((a) => {
            const isBusy = busyActionId === a.id || (actionRunning && busyActionId === a.id);
            const disabled = !onAction || actionRunning;
            return (
              <motion.button
                key={a.id}
                onClick={() => handleClick(a.id, a.payload, a.label)}
                disabled={disabled}
                whileHover={!disabled ? { scale: 1.03 } : undefined}
                whileTap={!disabled ? { scale: 0.97 } : undefined}
                className="text-[11px] px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                {isBusy && <RefreshCw className="h-3 w-3 animate-spin" />}
                {a.label}
              </motion.button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

/* Phase 21 Block 2.5b — HistoricalTurn
   Compact, read-only rendering of a past chat turn for Pro mode scrollback.
   Shows the user's input above the assistant's response chunks + artifacts.
   No action buttons (stale state), no X (history doesn't get individually
   removed — use "Clear" to wipe). No streaming animation either — past
   turns render fully expanded immediately. */
function HistoricalTurn({ turn }: { turn: ChatTurn }) {
  const { input, response } = turn;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-border/60 bg-card/30 overflow-hidden"
    >
      {/* User input bubble */}
      <div className="px-4 py-2.5 border-b border-border/40 bg-muted/20">
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-1">You asked</div>
        <div className="text-[13px] text-foreground/90 leading-snug">{input}</div>
      </div>
      {/* Response body — compact, no animations */}
      <div className="px-4 py-3 space-y-2.5">
        <div className="text-[10px] uppercase tracking-wider font-bold text-cyan-400/70">
          {response.intent === 'unknown' ? 'Not sure yet' : response.intent.replace('_', ' ')} · {(response.confidence * 100).toFixed(0)}% confident
        </div>
        {response.chunks.map((c, i) => (
          <div key={i} className="text-[13px] text-foreground/85 leading-relaxed whitespace-pre-wrap">
            {typeof c?.content === 'string' ? c.content : ''}
          </div>
        ))}
        {response.honest_note && (
          <div className="mt-2 pt-2 border-t border-amber-500/15 text-[11px] text-amber-400/70 italic flex items-start gap-1.5">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" /><span>{response.honest_note}</span>
          </div>
        )}
      </div>
      {/* Artifacts — collapsed by default in history (just titles) */}
      {response.artifacts && response.artifacts.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {response.artifacts.map((art, i) => (
            <div key={i} className="text-[10px] px-2 py-1 rounded-md border border-violet-500/20 bg-violet-500/[0.05] text-violet-400/80">
              {art.kind === 'brief' ? '📝' : art.kind === 'email' ? '✉' : art.kind === 'table' ? '◫' : art.kind === 'plan' ? '◆' : '◦'} {art.title}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ArtifactPanel({ artifact, delay }: { artifact: { kind: string; title: string; body: string }; delay: number }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const handleCopy = () => {
    try {
      navigator.clipboard?.writeText(artifact.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };
  const kindIcon = artifact.kind === 'brief' ? '📝' : artifact.kind === 'email' ? '✉' : artifact.kind === 'table' ? '◫' : artifact.kind === 'plan' ? '◆' : '◦';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="rounded-xl border border-violet-500/30 bg-violet-500/[0.05] overflow-hidden">
      <div className="px-3 py-2 border-b border-violet-500/20 bg-gradient-to-r from-violet-500/[0.08] to-transparent flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">{kindIcon}</span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-violet-400">{artifact.kind} · drafted</div>
            <div className="text-[12px] font-bold text-foreground truncate">{artifact.title}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <motion.button onClick={handleCopy}
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className={`text-[10px] px-2 py-1 rounded-md border transition-colors flex items-center gap-1 font-bold ${
              copied ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' : 'border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20'
            }`}>
            {copied ? '✓ copied' : 'Copy'}
          </motion.button>
          <button onClick={() => setExpanded(!expanded)}
            className="text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors">
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>
      {expanded && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
          className="p-3">
          <pre className="text-[11.5px] text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed max-h-[420px] overflow-y-auto">
            {artifact.body}
          </pre>
          <div className="mt-2 text-[10px] text-muted-foreground italic">
            Review before sending. This is a starting point — I drafted it from your project data, but you know your client.
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function StreamingChunk({ chunk, delay }: { chunk: any; delay: number }) {
  /* Phase 21 Block 2.19 — strip cite XML tags BEFORE typewriter, so they never appear */
  const cleanContent = stripCitationTags(chunk.content || '');
  const text = useTypewriterWithDelay(cleanContent, delay, 10);
  const isDone = text.length >= cleanContent.length && cleanContent.length > 0;

  if (chunk.kind === 'verify') {
    return (
      <motion.details initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.2 }} className="text-[10px]">
        <summary className="text-cyan-400/70 cursor-pointer hover:text-cyan-400 flex items-center gap-1">
          <Database className="h-2.5 w-2.5" />Verification trail
        </summary>
        <div className="mt-1 pl-3 text-muted-foreground/80">{stripCitationTags(text)}</div>
        {chunk.detail && (
          <pre className="mt-1 pl-3 text-[9px] text-muted-foreground/60 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
            {JSON.stringify(chunk.detail, null, 2)}
          </pre>
        )}
      </motion.details>
    );
  }

  if (!isDone) {
    return (
      <div className="text-[12.5px] text-foreground/85 leading-relaxed min-h-[1.2rem] whitespace-pre-wrap">
        {text}
        {text.length > 0 && text.length < cleanContent.length && (
          <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.6, repeat: Infinity }}
            className="inline-block w-0.5 h-3 ml-0.5 bg-cyan-400 align-middle" />
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0.8 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
      className="space-y-3">
      {renderFormattedChunk(cleanContent)}
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Markdown rendering — Phase 21 Block 2.19
══════════════════════════════════════════════════════════════════════ */

/* Anthropic's web_search tool auto-wraps cited segments in <cite index="...">
   XML tags. Those leak into the chunk content as literal text. Strip them
   entirely — the Verification trail at the bottom already shows sources. */
function stripCitationTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<cite\s+index="[^"]*"\s*>/gi, '')
    .replace(/<\/cite>/gi, '')
    /* Belt-and-suspenders: catch any stray cite-related artifacts */
    .replace(/<cite[^>]*>/gi, '')
    /* Italic stars in markdown like *can't* — preserve them */
    /* But strip stray double-underscore that some LLMs emit for italic */
    .trim();
}

function renderFormattedChunk(raw: string): React.ReactNode[] {
  if (!raw || !raw.trim()) return [];

  let text = raw;
  /* Force paragraph break before each inline "**N." numbered marker. */
  text = text.replace(/\s+(\*\*\d+\.\s)/g, '\n\n$1');
  /* Force paragraph break before "**The short version:**" etc. */
  text = text.replace(/\s+(\*\*The short version[:\s])/gi, '\n\n$1');

  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  return paragraphs.map((para, i) => {
    /* Numbered section header — "**N. Title**" on its own line OR with inline body */
    const numberedFull = para.match(/^\*\*(\d+)\.\s+(.+?)\*\*\s*(.*)$/s);
    if (numberedFull) {
      const [, num, title, body] = numberedFull;
      return (
        <div key={i} className="mt-5 first:mt-0">
          <div className="flex items-baseline gap-2.5 pb-2 border-b border-cyan-500/20">
            <span className="text-[15px] font-bold text-cyan-400 shrink-0 tabular-nums">{num}.</span>
            <h3 className="text-[15px] font-bold text-foreground leading-snug">{renderInline(title.trim())}</h3>
          </div>
          {body.trim() && (
            <div className="mt-2.5 text-[12.5px] text-foreground/90 leading-relaxed">
              {renderBodyContent(body.trim())}
            </div>
          )}
        </div>
      );
    }

    /* "In short" callout — TL;DR / Bottom line / Short version */
    if (/^\*\*(The short version|Short version|Bottom line|TL;DR)[:\s*]/i.test(para)) {
      const cleaned = para.replace(/\*\*/g, '').trim();
      return (
        <div key={i} className="mt-5 rounded-lg border border-amber-500/25 bg-amber-500/[0.04] p-3.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-amber-400 mb-1.5">In short</div>
          <p className="text-[12.5px] text-foreground/90 leading-relaxed">
            {renderInline(cleaned.replace(/^(The short version|Short version|Bottom line|TL;DR)[:\s]+/i, ''))}
          </p>
        </div>
      );
    }

    /* Standalone bold paragraph (just "**Header text**" or "**Header text?**") → sub-header */
    const headerOnly = para.match(/^\*\*([^*]+?)\*\*\s*$/);
    if (headerOnly && headerOnly[1].length <= 90) {
      return (
        <h4 key={i} className="text-[13px] font-bold text-foreground/95 leading-snug mt-4 first:mt-0">
          {headerOnly[1]}
        </h4>
      );
    }

    /* Bullet list paragraph (lines starting with -, •, or *) */
    const lines = para.split(/\n/).map(l => l.trim());
    if (lines.length > 1 && lines.every(l => /^[-•*]\s+/.test(l) || l === '')) {
      const items = lines.filter(l => /^[-•*]\s+/.test(l)).map(l => l.replace(/^[-•*]\s+/, ''));
      return (
        <ul key={i} className="space-y-1.5 text-[12.5px] text-foreground/90 leading-relaxed">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2">
              <span className="text-cyan-400/80 mt-0.5 shrink-0">·</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p key={i} className="text-[12.5px] text-foreground/90 leading-relaxed">
        {renderInline(para)}
      </p>
    );
  });
}

function renderBodyContent(body: string): React.ReactNode {
  const emDashItems = body.split(/\s+—\s+/).map(s => s.trim()).filter(Boolean);
  if (emDashItems.length >= 3) {
    return (
      <ul className="space-y-1.5">
        {emDashItems.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-cyan-400/60 mt-0.5 shrink-0">·</span>
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <span>{renderInline(body)}</span>;
}

function renderInline(text: string): React.ReactNode[] {
  if (!text) return [];
  const out: React.ReactNode[] = [];
  /* Match **bold** OR *italic* (single-star italics for emphasis) */
  const regex = /\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) out.push(text.slice(lastIndex, match.index));
    if (match[1]) {
      out.push(<strong key={`b${key++}`} className="font-bold text-foreground">{match[1]}</strong>);
    } else if (match[2]) {
      out.push(<em key={`i${key++}`} className="italic text-foreground/95">{match[2]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

function useTypewriterWithDelay(text: string, delaySec: number, speedMs = 12): string {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    if (!text) return;
    setDisplayed('');
    const startTimer = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) clearInterval(interval);
      }, speedMs);
      return () => clearInterval(interval);
    }, delaySec * 1000);
    return () => clearTimeout(startTimer);
  }, [text, delaySec, speedMs]);
  return displayed;
}

function ActivityDrawer({ events, briefing, onClose }: { events: ActivityEvent[]; briefing: BriefingClient | null; onClose: () => void }) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
        onClick={onClose} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" />
      <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 250 }}
        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col shadow-2xl">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-gradient-to-r from-cyan-500/[0.06] to-transparent">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <div>
              <div className="text-sm font-bold text-foreground">Behind the scenes</div>
              <div className="text-[10px] text-muted-foreground">Live activity · trust ledger</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted/40 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {briefing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
              className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3 text-[11px]">
              <div className="text-[10px] uppercase tracking-wider font-bold text-cyan-400 mb-1">Data freshness</div>
              <div className="space-y-0.5 text-foreground/80">
                <div>GSC last pull: <span className="text-foreground font-bold">{briefing.freshness.gsc_last_pull ? new Date(briefing.freshness.gsc_last_pull).toLocaleString() : 'never'}</span></div>
                <div>GA4 last pull: <span className="text-foreground font-bold">{briefing.freshness.ga4_last_pull ? new Date(briefing.freshness.ga4_last_pull).toLocaleString() : 'never'}</span></div>
                <div>Active strategies: <span className="text-foreground font-bold">{briefing.freshness.strategies_seen}</span> · goals: <span className="text-foreground font-bold">{briefing.freshness.goals_seen}</span></div>
              </div>
            </motion.div>
          )}
          {events.length === 0 ? (
            <div className="text-center py-12 text-[11px] text-muted-foreground italic">
              No activity logged yet. As S.E.A.S.O.N. runs (pulls, plans, decisions), events appear here. Append-only — your trust ledger.
            </div>
          ) : (
            events.map((e, i) => (
              <motion.div key={e.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                className="rounded-lg border border-border bg-background/30 p-2.5">
                <div className="flex items-start gap-2">
                  <SeverityDot severity={e.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-foreground/90">{e.headline}</div>
                    {e.detail && <div className="text-[10px] text-muted-foreground mt-0.5">{e.detail}</div>}
                    <div className="text-[9px] text-muted-foreground/60 mt-1">{timeAgo(e.created_at)} · {e.source} · {e.event_type}</div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </motion.aside>
    </>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

