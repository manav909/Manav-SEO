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
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, AlertCircle, CheckCircle2, Activity, ArrowRight,
  X, Send, RefreshCw, Database, Building2,
} from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import SmartSidebar from '@/components/SmartSidebar';
import SmartTopBar from '@/components/SmartTopBar';
import CapabilitiesPanel from '@/components/season/CapabilitiesPanel';
import {
  seasonBriefing, seasonCommand, seasonActivity,
  type BriefingClient, type BriefingItemClient,
  type CommandResponseClient, type ActivityEvent,
} from '@/components/pm/api';

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
  const { projects } = useAuth() as any;
  const safeProjects = (projects || []).filter((p: any) => p && p.id);

  const [briefing, setBriefing] = useState<BriefingClient | null>(null);
  const [loading, setLoading]   = useState(true);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  const [input, setInput]               = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [response, setResponse]         = useState<CommandResponseClient | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const inputRef                        = useRef<HTMLInputElement>(null);

  const [activityOpen, setActivityOpen]   = useState(false);
  const [activity, setActivity]            = useState<ActivityEvent[]>([]);

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

  useEffect(() => {
    if (!selectedProjectId) { setLoading(false); setBriefing(null); setBriefingError(null); return; }
    (async () => {
      setLoading(true);
      setBriefingError(null);
      const r = await seasonBriefing(selectedProjectId);
      if (r.error) setBriefingError(r.error);
      if (r.briefing) setBriefing(r.briefing);
      setLoading(false);
    })();
  }, [selectedProjectId]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || submitting) return;
    if (!selectedProjectId) {
      setCommandError("Pick a project first — see the suggestions below.");
      return;
    }
    setSubmitting(true);
    setResponse(null);
    setCommandError(null);
    const r = await seasonCommand({ projectId: selectedProjectId, input: text });
    setSubmitting(false);
    if (r.error) { setCommandError(r.error); return; }
    if (r.response) setResponse(r.response);
  };

  useEffect(() => {
    if (!activityOpen || !selectedProjectId) return;
    (async () => {
      const r = await seasonActivity({ projectId: selectedProjectId, limit: 60 });
      if (r.events) setActivity(r.events);
    })();
  }, [activityOpen, selectedProjectId]);

  const handleQuickAction = (q: string) => {
    setInput(q);
    setTimeout(() => handleSubmit(), 50);
  };

  const showProjectPicker =
    !loading && (!selectedProjectId || briefingError === "Project not found" || (briefingError && !briefing));

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-card text-foreground">
      <SmartTopBar />
      <SmartSidebar />

      <div className="relative md:pl-64 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.3) 0%, transparent 70%)' }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.15, 0.25, 0.15] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        <div className="relative max-w-3xl mx-auto px-6 py-12">

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
                  className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-cyan-500/40 via-violet-500/40 to-cyan-500/40 opacity-50 group-focus-within:opacity-100 transition-opacity duration-500 blur-md"
                  animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                  style={{ backgroundSize: '200% 200%' }}
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
                "Summarize this week",
                "What needs me today?",
                "How are we doing?",
                "Where do the numbers come from?",
              ].map((q, i) => (
                <motion.button key={q} onClick={() => handleQuickAction(q)}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.2 + i * 0.08 }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  disabled={!selectedProjectId}
                  className="text-xs px-3 py-1.5 rounded-full border border-border bg-card/40 text-muted-foreground hover:text-foreground hover:border-cyan-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {q}
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
          </motion.div>

          {showProjectPicker && safeProjects.length > 0 && (
            <ProjectPicker
              projects={safeProjects}
              selectedId={selectedProjectId}
              onPick={setSelectedProjectId}
            />
          )}

          {showProjectPicker && safeProjects.length === 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}
              className="mt-8 rounded-xl border border-border bg-card/40 p-4">
              <div className="text-sm text-foreground/90">I don't see any projects in your account yet.</div>
              <div className="text-xs text-muted-foreground mt-1">Once you create a project, S.E.A.S.O.N. will start briefing on it here.</div>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {response && (
              <ResponsePanel key={response.intent + Date.now()} response={response} onClose={() => setResponse(null)} />
            )}
          </AnimatePresence>

          {!loading && briefing && !response && (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <AttentionPanel items={briefing.attention} />
              <QuietWinsPanel items={briefing.quiet_wins} />
            </div>
          )}

          {!loading && briefing && briefing.honest_gaps.length > 0 && !response && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 2.4 }}
              className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-amber-400/80 mb-1.5 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Honest gaps · things I couldn't check
              </div>
              <ul className="space-y-0.5 text-[11px] text-foreground/70">
                {briefing.honest_gaps.map((g, i) => <li key={i}>• {g}</li>)}
              </ul>
            </motion.div>
          )}
        </div>

        <motion.button
          onClick={() => setActivityOpen(true)}
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2.6 }}
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          className="fixed bottom-5 right-5 px-3 py-2 rounded-full border border-cyan-500/30 bg-card/80 backdrop-blur-sm text-cyan-400 hover:border-cyan-500/60 transition-colors text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-500/10 z-30">
          <motion.span animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          Behind the scenes
        </motion.button>

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
    </div>
  );
}

function LoadingHero() {
  return (
    <div className="space-y-3 pt-8">
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

function GreetingBlock({ briefing, project }: { briefing: BriefingClient; project: any }) {
  const greet = useTypewriter(briefing.greeting_phrase, 22);
  const [showStatus, setShowStatus] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowStatus(true), briefing.greeting_phrase.length * 22 + 250);
    return () => clearTimeout(t);
  }, [briefing.greeting_phrase]);
  const status = useTypewriter(showStatus ? briefing.status_summary : '', 12);
  return (
    <div className="pt-8 pb-2">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 flex items-center gap-2">
        <Building2 className="h-3 w-3" />{project?.project_name || briefing.project_name}
        <span className="text-cyan-400/60">·</span><span className="text-cyan-400">S.E.A.S.O.N.</span>
      </motion.div>
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
    <div className="pt-8 pb-2">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 flex items-center gap-2">
        <Sparkles className="h-3 w-3 text-cyan-400" />
        <span className="text-cyan-400">S.E.A.S.O.N.</span>
      </motion.div>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-tight">{headline}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}

function ProjectPicker({ projects, selectedId, onPick }: {
  projects: any[]; selectedId: string; onPick: (id: string) => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
      className="mt-8 rounded-2xl border border-border bg-card/40 backdrop-blur-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Building2 className="h-3.5 w-3.5 text-cyan-400" />
        <div className="text-[11px] uppercase tracking-wider font-bold text-foreground">
          {selectedId ? "Switch project" : "Pick a project"}
        </div>
        <div className="text-[10px] text-muted-foreground">({projects.length})</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {projects.slice(0, 12).map((p, i) => (
          <motion.button key={p.id} onClick={() => onPick(p.id)}
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7 + i * 0.04 }}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
            className={`text-left rounded-lg border p-3 transition-colors ${
              p.id === selectedId ? 'border-cyan-500/40 bg-cyan-500/[0.08]' : 'border-border bg-background/30 hover:border-cyan-500/30 hover:bg-card/40'
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

function ResponsePanel({ response, onClose }: { response: CommandResponseClient; onClose: () => void }) {
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
      <div className="p-4 space-y-2">
        {response.chunks.map((c, i) => <StreamingChunk key={i} chunk={c} delay={i * 0.15} />)}
        {response.honest_note && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: response.chunks.length * 0.15 + 0.3 }}
            className="mt-3 pt-3 border-t border-amber-500/20 text-[11px] text-amber-400/80 italic flex items-start gap-1.5">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" /><span>{response.honest_note}</span>
          </motion.div>
        )}
      </div>
      {response.actions && response.actions.length > 0 && (
        <div className="px-4 py-3 border-t border-border bg-card/40 flex flex-wrap gap-2">
          {response.actions.map((a) => (
            <motion.button key={a.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors">
              {a.label}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function StreamingChunk({ chunk, delay }: { chunk: any; delay: number }) {
  const text = useTypewriterWithDelay(chunk.content, delay, 10);
  if (chunk.kind === 'verify') {
    return (
      <motion.details initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.2 }} className="text-[10px]">
        <summary className="text-cyan-400/70 cursor-pointer hover:text-cyan-400 flex items-center gap-1">
          <Database className="h-2.5 w-2.5" />Verification trail
        </summary>
        <div className="mt-1 pl-3 text-muted-foreground/80">{text}</div>
        {chunk.detail && (
          <pre className="mt-1 pl-3 text-[9px] text-muted-foreground/60 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
            {JSON.stringify(chunk.detail, null, 2)}
          </pre>
        )}
      </motion.details>
    );
  }
  return (
    <div className="text-[12.5px] text-foreground/90 leading-relaxed min-h-[1.2rem]">
      {text}
      {text.length < chunk.content.length && text.length > 0 && (
        <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.6, repeat: Infinity }}
          className="inline-block w-0.5 h-3 ml-0.5 bg-cyan-400 align-middle" />
      )}
    </div>
  );
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

