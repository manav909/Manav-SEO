/* ════════════════════════════════════════════════════════════════
   src/components/season/SeasonModal.tsx
   Phase 8b — The global S.E.A.S.O.N. modal.

   Opens over any page when:
     • Orb is clicked
     • Cmd+K / Ctrl+K is pressed
     • open(query) is called programmatically from anywhere

   Has:
     • Backdrop blur (dim the underlying page)
     • Cinematic entrance (scale + fade, easeInOutCubic)
     • Glowing input matching current mood
     • Response panel with streaming chunks
     • Artifact panels
     • Quick-action chips
     • Esc to close
     • "Go to full briefing" link to /command

   It does NOT navigate the user away. The current page stays
   visible underneath. When you close the modal, you're back
   where you were. That's the contract.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Send, Sparkles, X, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSeason, SeasonMood } from '@/contexts/SeasonContext';
import { useSeasonAction } from '@/hooks/useSeasonAction';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { seasonCommand, type CommandResponseClient } from '@/components/pm/api';

/* Mood → color (matches the Orb's profile) */
const MOOD_HSL: Record<SeasonMood, string> = {
  calm:        '186 80% 55%',
  focused:     '262 75% 60%',
  alert:       '38 92% 55%',
  critical:    '0 75% 55%',
  celebrating: '152 70% 50%',
  thinking:    '210 80% 60%',
  quiet:       '210 50% 55%',  // a touch warmer than orb-quiet for legibility
};

const DEFAULT_CHIPS = [
  { label: 'Diagnose',                q: 'diagnose',                      urgent: true  },
  { label: 'Summarize this week',     q: 'Summarize this week',           urgent: false },
  { label: 'What needs me today?',    q: 'What needs me today?',          urgent: false },
  { label: 'Compute intelligence',    q: 'compute analytics intelligence',urgent: false },
  { label: 'Where do these numbers come from?', q: 'verify',              urgent: false },
];

/* Awareness-aware chips: when we know what page you're on,
   suggest questions that fit. Always keep Diagnose at the top. */
function chipsForAwareness(awareness: any): Array<{ label: string; q: string; urgent?: boolean }> {
  if (!awareness?.page) return DEFAULT_CHIPS;
  const page = awareness.page;
  const sel  = awareness.selected;

  if (page === 'audit') {
    return [
      { label: 'Diagnose', q: 'diagnose', urgent: true },
      ...(sel?.type === 'audit'
        ? [{ label: 'Explain this audit score', q: `explain this audit and what the score means` }]
        : []),
      { label: 'What should I fix first?',          q: 'What top issues should I prioritize from this audit?' },
      { label: 'Draft a remediation plan',          q: 'Draft a remediation plan based on the latest audit' },
      { label: 'Compare audits over time',          q: 'How have audit scores changed for this project?' },
    ];
  }
  if (page === 'planning') {
    return [
      { label: 'Diagnose', q: 'diagnose', urgent: true },
      ...(sel?.type === 'strategy'
        ? [
            { label: 'Explain this strategy', q: 'explain this strategy and why it might be slipping' },
            { label: 'What\'s blocking it?',  q: 'what is blocking this strategy?' },
          ]
        : []),
      { label: 'Which strategy needs attention?',  q: 'which active strategy needs my attention most?' },
      { label: 'Draft a new strategy',              q: 'Draft a strategy plan I could finalize next' },
    ];
  }
  if (page === 'data-room') {
    const tab = awareness.visible_filters?.tab || 'this tab';
    return [
      { label: 'Diagnose', q: 'diagnose', urgent: true },
      { label: `What does ${tab} mean?`,       q: `What does the ${tab} tab in Data Room hold and how do I use it?` },
      { label: 'What needs filling in here?',  q: `What fields on the ${tab} tab are empty or stale?` },
      { label: 'Summarize this week',          q: 'Summarize this week' },
      { label: 'Verify these numbers',          q: 'Where do these numbers come from?' },
    ];
  }
  if (page === 'dashboard') {
    return [
      { label: 'Diagnose', q: 'diagnose', urgent: true },
      { label: 'How is this project doing?', q: 'How is this project doing overall?' },
      { label: 'What needs me today?',       q: 'What needs me today?' },
      { label: 'Summarize this week',         q: 'Summarize this week' },
      { label: 'Compute intelligence',        q: 'compute analytics intelligence' },
    ];
  }
  if (page === 'launchpad') {
    return [
      { label: 'Diagnose', q: 'diagnose', urgent: true },
      { label: 'What does Launchpad show me?', q: 'Explain what Launchpad data tells me and how to act on it' },
      { label: 'What should I prioritize?',     q: 'Based on Launchpad, what should I prioritize?' },
    ];
  }
  if (page === 'algorithm-intel') {
    return [
      { label: 'Diagnose', q: 'diagnose', urgent: true },
      { label: 'Anything I should learn?',       q: 'Are there fresh algorithm learnings I should know about?' },
      { label: 'Apply to my project',             q: 'How do recent algorithm signals affect my current strategies?' },
    ];
  }
  /* Fallback */
  return DEFAULT_CHIPS;
}

export default function SeasonModal() {
  const { isOpen, close, initialQuery, mood, setMood, awareness } = useSeason();
  const { run: runAction, confirm: confirmAction, cancel: cancelAction, pendingConfirm, running: actionRunning } = useSeasonAction();
  const { selectedProjectId } = useProject() as any;
  const { projects } = useAuth() as any;
  const navigate = useNavigate();

  const [input, setInput]               = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [response, setResponse]         = useState<CommandResponseClient | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const inputRef                        = useRef<HTMLInputElement | null>(null);

  const moodHsl       = MOOD_HSL[mood] || MOOD_HSL.quiet;
  const isMac         = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  /* Resolve project name for the header */
  const projectName = (() => {
    if (!selectedProjectId) return 'no project selected';
    const p = (projects || []).find((x: any) => x?.id === selectedProjectId);
    return (p as any)?.project_name || (p as any)?.name || 'project ' + selectedProjectId.slice(0, 8);
  })();

  /* Auto-fill initial query if provided */
  useEffect(() => {
    if (isOpen && initialQuery) {
      setInput(initialQuery);
      /* Auto-submit if it came pre-filled */
      const t = setTimeout(() => submit(initialQuery), 80);
      return () => clearTimeout(t);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [isOpen, initialQuery]);

  /* Reset when closed */
  useEffect(() => {
    if (!isOpen) {
      setInput('');
      setResponse(null);
      setError(null);
      setSubmitting(false);
      setMood('quiet');
    } else {
      /* Focus input shortly after open */
      const t = setTimeout(() => inputRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [isOpen]);

  /* Submit handler */
  const submit = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || submitting) return;
    if (!selectedProjectId) {
      setError('Pick a project first — I need to know which one to think about.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setMood('thinking');

    try {
      const r = await seasonCommand({ projectId: selectedProjectId, input: q, awareness: awareness || undefined });
      if (r.error) {
        setError(r.error);
        setMood('alert');
      } else if (r.response) {
        setResponse(r.response);
        /* Derive mood from confidence + intent */
        if (r.response.intent === 'diagnose') setMood('focused');
        else if (r.response.confidence < 0.4) setMood('alert');
        else if (r.response.intent === 'compute_intel') setMood('celebrating');
        else setMood('calm');
      }
    } catch (e: any) {
      setError(e?.message || 'something went wrong');
      setMood('alert');
    } finally {
      setSubmitting(false);
    }
  };

  /* Clicking a chip */
  const useChip = (q: string) => {
    setInput(q);
    submit(q);
  };

  /* Render */
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="season-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={close}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 9999,
            }}
          />

          {/* Modal */}
          <motion.div
            key="season-modal"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(720px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 64px)',
              zIndex: 10000,
              borderRadius: 20,
              border: `1px solid hsla(${moodHsl} / 0.3)`,
              background: 'rgba(15, 16, 24, 0.96)',
              boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 60px hsla(${moodHsl} / 0.15)`,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Top aura glow */}
            <motion.div
              animate={{ opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                top: -120,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 480,
                height: 200,
                background: `radial-gradient(ellipse, hsla(${moodHsl} / 0.35) 0%, transparent 70%)`,
                pointerEvents: 'none',
                filter: 'blur(20px)',
              }}
            />

            {/* Header */}
            <div style={{
              position: 'relative',
              padding: '14px 20px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Sparkles size={14} style={{ color: `hsl(${moodHsl})` }} />
                <div>
                  <div style={{
                    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em',
                    fontWeight: 700, color: `hsl(${moodHsl})`,
                  }}>
                    S.E.A.S.O.N.
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
                    {projectName}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => { close(); setTimeout(() => navigate('/command'), 100); }}
                  title="Open the full briefing page"
                  style={{
                    fontSize: 10, padding: '5px 9px', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'transparent', color: 'rgba(255,255,255,0.55)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  <ExternalLink size={10} /> Full briefing
                </button>
                <button
                  onClick={close}
                  title="Close (Esc)"
                  style={{
                    padding: 6, borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'transparent', color: 'rgba(255,255,255,0.6)',
                    cursor: 'pointer', display: 'flex',
                  }}>
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Body — scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, position: 'relative' }}>

              {/* Awareness chip — shows what S.E.A.S.O.N. knows is on screen */}
              {awareness && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginBottom: 12,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: `1px solid hsla(${moodHsl} / 0.18)`,
                    background: `hsla(${moodHsl} / 0.04)`,
                    fontSize: 10.5,
                    color: 'rgba(255,255,255,0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}>
                  <span style={{ color: `hsl(${moodHsl})`, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 9 }}>
                    aware
                  </span>
                  <span>you're on</span>
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
                    {awareness.page_label || awareness.page}
                  </span>
                  {awareness.selected && (
                    <>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span>looking at</span>
                      <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
                        {awareness.selected.type}: {awareness.selected.title || awareness.selected.id?.slice(0, 8) || 'item'}
                      </span>
                    </>
                  )}
                  {awareness.visible_filters && Object.keys(awareness.visible_filters).length > 0 && (
                    <>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span style={{ opacity: 0.7 }}>filters active</span>
                    </>
                  )}
                </motion.div>
              )}

              {/* Input */}
              <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <div style={{ position: 'relative' }}>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask S.E.A.S.O.N. anything…"
                    disabled={submitting}
                    style={{
                      width: '100%',
                      padding: '14px 56px 14px 18px',
                      borderRadius: 14,
                      border: `1px solid hsla(${moodHsl} / 0.3)`,
                      background: 'rgba(0,0,0,0.4)',
                      color: 'rgba(255,255,255,0.95)',
                      fontSize: 15,
                      outline: 'none',
                      boxShadow: `0 0 0 0 transparent, 0 0 24px hsla(${moodHsl} / 0.1) inset`,
                      transition: 'box-shadow 0.2s, border-color 0.2s',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.boxShadow = `0 0 0 2px hsla(${moodHsl} / 0.25), 0 0 24px hsla(${moodHsl} / 0.2) inset`;
                      e.currentTarget.style.borderColor = `hsla(${moodHsl} / 0.6)`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.boxShadow = `0 0 0 0 transparent, 0 0 24px hsla(${moodHsl} / 0.1) inset`;
                      e.currentTarget.style.borderColor = `hsla(${moodHsl} / 0.3)`;
                    }}
                  />
                  <button
                    type="submit"
                    disabled={submitting || !input.trim()}
                    style={{
                      position: 'absolute',
                      right: 8, top: '50%', transform: 'translateY(-50%)',
                      padding: 8, borderRadius: 10,
                      border: 'none',
                      background: input.trim() && !submitting ? `hsla(${moodHsl} / 0.2)` : 'transparent',
                      color: input.trim() && !submitting ? `hsl(${moodHsl})` : 'rgba(255,255,255,0.25)',
                      cursor: input.trim() && !submitting ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}>
                    <Send size={16} />
                  </button>
                </div>
              </form>

              {/* Pending confirmation — when an action awaits "tap to confirm" */}
              <AnimatePresence>
                {pendingConfirm && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      marginTop: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: `1px solid hsla(${
                        pendingConfirm.action.permission === 'destructive' ? '0 75% 55%' : moodHsl
                      } / 0.35)`,
                      background: `hsla(${
                        pendingConfirm.action.permission === 'destructive' ? '0 75% 55%' : moodHsl
                      } / 0.06)`,
                    }}>
                    <div style={{
                      fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em',
                      fontWeight: 700, color: `hsl(${
                        pendingConfirm.action.permission === 'destructive' ? '0 75% 60%' : moodHsl
                      })`, marginBottom: 4,
                    }}>
                      {pendingConfirm.action.permission === 'destructive'
                        ? '⚠ Confirm destructive action'
                        : 'Confirm this action'}
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)', fontWeight: 600 }}>
                      {pendingConfirm.action.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 3, lineHeight: 1.5 }}>
                      {pendingConfirm.action.description}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <button
                        disabled={actionRunning}
                        onClick={async () => {
                          const r = await confirmAction();
                          if (r.ok && r.navigated) close();
                        }}
                        style={{
                          fontSize: 11, padding: '5px 12px', borderRadius: 8,
                          border: `1px solid hsla(${
                            pendingConfirm.action.permission === 'destructive' ? '0 75% 55%' : moodHsl
                          } / 0.4)`,
                          background: `hsla(${
                            pendingConfirm.action.permission === 'destructive' ? '0 75% 55%' : moodHsl
                          } / 0.18)`,
                          color: `hsl(${
                            pendingConfirm.action.permission === 'destructive' ? '0 75% 60%' : moodHsl
                          })`,
                          cursor: actionRunning ? 'wait' : 'pointer',
                          fontWeight: 700,
                          opacity: actionRunning ? 0.5 : 1,
                        }}>
                        {actionRunning ? 'Running…' : 'Yes, do it'}
                      </button>
                      <button
                        disabled={actionRunning}
                        onClick={cancelAction}
                        style={{
                          fontSize: 11, padding: '5px 12px', borderRadius: 8,
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: 'transparent',
                          color: 'rgba(255,255,255,0.65)',
                          cursor: 'pointer',
                        }}>
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Quick chips — only show when no response yet */}
              {!response && !submitting && !pendingConfirm && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {chipsForAwareness(awareness).map((c, i) => (
                    <motion.button
                      key={c.q}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.05 }}
                      onClick={() => useChip(c.q)}
                      disabled={!selectedProjectId}
                      style={{
                        fontSize: 11, padding: '5px 11px', borderRadius: 999,
                        border: c.urgent
                          ? '1px solid hsla(38 92% 55% / 0.4)'
                          : '1px solid rgba(255,255,255,0.1)',
                        background: c.urgent
                          ? 'hsla(38 92% 55% / 0.08)'
                          : 'transparent',
                        color: c.urgent
                          ? 'hsl(38 92% 60%)'
                          : 'rgba(255,255,255,0.6)',
                        cursor: 'pointer',
                        fontWeight: c.urgent ? 700 : 500,
                        opacity: selectedProjectId ? 1 : 0.4,
                      }}>
                      {c.label}
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Thinking state */}
              {submitting && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{
                    marginTop: 18, padding: '14px 16px',
                    borderRadius: 12,
                    border: `1px solid hsla(${moodHsl} / 0.2)`,
                    background: `hsla(${moodHsl} / 0.05)`,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                    style={{
                      width: 14, height: 14, borderRadius: '50%',
                      border: `2px solid hsla(${moodHsl} / 0.2)`,
                      borderTopColor: `hsl(${moodHsl})`,
                    }}
                  />
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                    Thinking through your project data…
                  </span>
                </motion.div>
              )}

              {/* Error */}
              {error && !submitting && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginTop: 18, padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid hsla(0 75% 55% / 0.3)',
                    background: 'hsla(0 75% 55% / 0.06)',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                  <AlertCircle size={14} style={{ color: 'hsl(0 75% 60%)', marginTop: 1, flexShrink: 0 }} />
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)' }}>{error}</div>
                </motion.div>
              )}

              {/* Response */}
              {response && !submitting && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  style={{ marginTop: 18 }}>
                  {/* Confidence pill */}
                  <div style={{
                    fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700,
                    color: `hsl(${moodHsl})`, marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <CheckCircle2 size={10} />
                    <span>{response.intent.replace(/_/g,' ')}</span>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <span>{Math.round(response.confidence * 100)}% confident</span>
                  </div>

                  {/* Chunks */}
                  {response.chunks.map((c, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      style={{
                        lineHeight: 1.55,
                        color: c.kind === 'verify'
                          ? 'rgba(255,255,255,0.55)'
                          : 'rgba(255,255,255,0.92)',
                        marginBottom: 8,
                        whiteSpace: 'pre-wrap',
                        fontStyle: c.kind === 'verify' ? 'italic' : 'normal',
                        fontSize: c.kind === 'verify' ? 11.5 : 13.5,
                      } as any}>
                      {c.kind === 'verify' && <span style={{ marginRight: 6, opacity: 0.5 }}>↳</span>}
                      {c.content}
                    </motion.div>
                  ))}

                  {/* Artifacts */}
                  {response.artifacts && response.artifacts.length > 0 && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {response.artifacts.map((art, i) => (
                        <ArtifactBox key={i} artifact={art} moodHsl={moodHsl} />
                      ))}
                    </div>
                  )}

                  {/* Honest note */}
                  {response.honest_note && (
                    <div style={{
                      marginTop: 12, padding: '10px 12px',
                      borderTop: '1px solid hsla(38 92% 55% / 0.18)',
                      fontSize: 11, color: 'hsla(38 92% 60% / 0.85)',
                      fontStyle: 'italic',
                      display: 'flex', alignItems: 'flex-start', gap: 6,
                    }}>
                      <AlertCircle size={11} style={{ marginTop: 1, flexShrink: 0 }} />
                      <span>{response.honest_note}</span>
                    </div>
                  )}

                  {/* Actions */}
                  {response.actions && response.actions.length > 0 && (
                    <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {response.actions.map((a, i) => (
                        <button
                          key={i}
                          disabled={actionRunning}
                          onClick={async () => {
                            /* try_xxx — refire as a query */
                            if (a.id.startsWith('try_')) {
                              const map: Record<string, string> = {
                                try_diagnose:  'diagnose',
                                try_summarize: 'Summarize this week',
                                try_attention: 'What needs me today?',
                                try_help:      'help',
                              };
                              const q = map[a.id] || a.label;
                              setInput(q); submit(q);
                              return;
                            }
                            /* Try the registry first — maps suggested action IDs to real handlers */
                            const idMap: Record<string, string> = {
                              open_planning:     'navigate_planning',
                              open_pipeline:     'navigate_planning',
                              open_analytics:    'navigate_data_room',
                              open_provenance:   'navigate_data_room',
                              open_kanban:       'navigate_command',  /* desk doesn't exist as a clean route; fallback */
                              open_dashboard:    'navigate_dashboard',
                              open_audit:        'navigate_audit',
                              open_settings:     'navigate_season_settings',
                              compute_intelligence: 'compute_intelligence',
                            };
                            const registryId = idMap[a.id] || a.id;
                            const result = await runAction(registryId, a.payload);
                            if (result.ok && result.navigated) {
                              close();
                            }
                          }}
                          style={{
                            fontSize: 11, padding: '6px 12px', borderRadius: 8,
                            border: `1px solid hsla(${moodHsl} / 0.3)`,
                            background: `hsla(${moodHsl} / 0.08)`,
                            color: `hsl(${moodHsl})`,
                            cursor: actionRunning ? 'wait' : 'pointer',
                            fontWeight: 600,
                            opacity: actionRunning ? 0.6 : 1,
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                          {a.label} <ArrowRight size={10} />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* New question affordance */}
                  <button
                    onClick={() => { setResponse(null); setError(null); inputRef.current?.focus(); }}
                    style={{
                      marginTop: 16, fontSize: 11,
                      background: 'transparent', border: 'none',
                      color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
                    }}>
                    ↑ ask something else
                  </button>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '8px 16px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              fontSize: 10, color: 'rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>{isMac ? '⌘K' : 'Ctrl+K'} to toggle · Esc to close</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => { close(); setTimeout(() => navigate('/season-settings'), 100); }}
                  title="Open S.E.A.S.O.N. settings"
                  style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'transparent', color: 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                  }}>
                  ⚙ Settings
                </button>
                <span>S.E.A.S.O.N. v1</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─── Artifact box (lightweight, no external deps) ─── */

function ArtifactBox({ artifact, moodHsl }: { artifact: { kind: string; title: string; body: string }; moodHsl: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const handleCopy = () => {
    try {
      navigator.clipboard?.writeText(artifact.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };
  const icon =
    artifact.kind === 'brief' ? '📝' :
    artifact.kind === 'email' ? '✉' :
    artifact.kind === 'table' ? '◫' :
    artifact.kind === 'plan'  ? '◆' : '◦';

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid hsla(${moodHsl} / 0.25)`,
      background: `hsla(${moodHsl} / 0.04)`,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 12px',
        borderBottom: expanded ? `1px solid hsla(${moodHsl} / 0.15)` : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: `hsl(${moodHsl})` }}>
              {artifact.kind} · drafted
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {artifact.title}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={handleCopy} style={{
            fontSize: 10, padding: '4px 8px', borderRadius: 6,
            border: copied ? '1px solid hsla(152 70% 50% / 0.4)' : `1px solid hsla(${moodHsl} / 0.3)`,
            background: copied ? 'hsla(152 70% 50% / 0.15)' : `hsla(${moodHsl} / 0.1)`,
            color: copied ? 'hsl(152 70% 60%)' : `hsl(${moodHsl})`,
            cursor: 'pointer', fontWeight: 700,
          }}>{copied ? '✓ copied' : 'Copy'}</button>
          <button onClick={() => setExpanded(!expanded)} style={{
            fontSize: 10, padding: '4px 8px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
          }}>{expanded ? 'Collapse' : 'Expand'}</button>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: 12 }}>
          <pre style={{
            margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.85)',
            whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace',
            lineHeight: 1.5,
            maxHeight: 320, overflow: 'auto',
          }}>{artifact.body}</pre>
        </div>
      )}
    </div>
  );
}
