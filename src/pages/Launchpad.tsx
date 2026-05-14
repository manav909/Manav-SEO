/**
 * SEO SEASON — COMMAND CENTER
 * The presidential view. Everything. One screen.
 *
 * Design: high-tech dark, signal-based UI. No tables. No walls of text.
 * The president scans, decides, acts. Not reads, not navigates.
 *
 * Sections:
 *  PULSE BAR   — 7 live system stats across the top
 *  PROJECT GRID — every project as a signal card with health, pending, last activity
 *  BRAIN STATUS  — intelligence quality across all projects
 *  OPS FEED     — last 15 tasks + recent system events
 *  APPROVALS    — all pending learnings in one place, approve/reject in bulk
 *  ALGO WATCH   — loaded algorithm topics and freshness
 *  COST MONITOR — API spend today and total
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '@/contexts/AuthContext';
import { useProject }  from '@/contexts/ProjectContext';
import {
  Rocket, Brain, Zap, Globe, Activity, Clock,
  CheckCircle2, AlertTriangle, RefreshCw, ChevronRight,
  Shield, TrendingUp, Database, BookOpen, Target,
  Sparkles, X, Check, BarChart3, Cpu, FileText,
  Eye, EyeOff, Terminal, Radio,
} from 'lucide-react';

async function callEngine(action: string, body: Record<string,unknown> = {}) {
  const r = await fetch('/api/task-engine', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  return r.json();
}

/* ── helpers ── */
const ago = (iso: string) => {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
};

const healthColor = (score: number) =>
  score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-sky-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';
const healthBg = (score: number) =>
  score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-sky-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
const healthBorder = (score: number) =>
  score >= 80 ? 'border-emerald-500/25' : score >= 60 ? 'border-sky-500/25' : score >= 40 ? 'border-amber-500/25' : 'border-red-500/25';

/* ── Pulse dot ── */
function Pulse({ color = 'bg-emerald-400', size = 'h-2 w-2' }: { color?: string; size?: string }) {
  return (
    <span className="relative flex shrink-0">
      <span className={`animate-ping absolute inline-flex rounded-full ${color} opacity-60 ${size}`}/>
      <span className={`relative inline-flex rounded-full ${color} ${size}`}/>
    </span>
  );
}

/* ── Top stat tile ── */
function PulseTile({ icon: Icon, label, value, sub, color, alert, onClick }: any) {
  return (
    <button onClick={onClick}
      className={`flex flex-col gap-1 px-4 py-3 rounded-xl border transition-all text-left ${
        alert ? 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
              : 'border-border bg-card/50 hover:border-primary/30 hover:bg-card/80'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${color || 'text-muted-foreground'}`}/>
        <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold leading-none ${color || 'text-foreground'}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/50">{sub}</div>}
    </button>
  );
}

/* ── Project signal card ── */
function ProjectCard({ p, onOpen, onApprove }: { p: any; onOpen: () => void; onApprove: () => void }) {
  const isStale = p.lastActivity && (Date.now() - new Date(p.lastActivity).getTime()) > 7 * 86400000;
  return (
    <div className={`rounded-xl border ${healthBorder(p.brainScore)} bg-card/60 p-4 flex flex-col gap-3 hover:bg-card/80 transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold truncate">{p.name}</span>
            {p.status === 'archived' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 font-mono shrink-0">ARCHIVED</span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/50">{p.clientName || '—'}</span>
        </div>
        {/* Brain score ring */}
        <div className="relative shrink-0 w-12 h-12">
          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="hsl(var(--border))" strokeWidth="3"/>
            <circle cx="20" cy="20" r="16" fill="none"
              className={healthBg(p.brainScore).replace('bg-','stroke-')}
              strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${2*Math.PI*16}`}
              strokeDashoffset={`${2*Math.PI*16*(1-p.brainScore/100)}`}
              style={{ transition: 'stroke-dashoffset 1s ease' }}/>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-[10px] font-bold ${healthColor(p.brainScore)}`}>{p.brainScore}</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { v: p.activeLearnings,  l: 'learnings', ok: p.activeLearnings >= 20 },
          { v: p.pendingLearnings, l: 'pending',    ok: p.pendingLearnings === 0, warn: p.pendingLearnings > 0 },
          { v: p.taskCount,        l: 'tasks',      ok: true },
        ].map(({ v, l, ok, warn }) => (
          <div key={l} className={`rounded-lg px-2 py-1.5 ${warn ? 'bg-amber-500/8' : 'bg-secondary/30'}`}>
            <div className={`text-base font-bold leading-none ${warn ? 'text-amber-400' : 'text-foreground'}`}>{v}</div>
            <div className="text-[9px] text-muted-foreground/50 mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-1">
        {!p.cms && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-mono">NO CMS</span>}
        {!p.goals && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">NO GOALS</span>}
        {!p.keywords?.length && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">NO KW</span>}
        {isStale && <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 font-mono">STALE 7d+</span>}
        {p.activeLearnings >= 20 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">BRAIN READY</span>}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        <span className="text-[10px] text-muted-foreground/40">
          {isStale ? <span className="text-amber-400/60">⚠ {ago(p.lastActivity)}</span> : ago(p.lastActivity)}
        </span>
        <div className="flex gap-1">
          {p.pendingLearnings > 0 && (
            <button onClick={onApprove}
              className="h-6 px-2 rounded text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors font-mono">
              {p.pendingLearnings} pending
            </button>
          )}
          <button onClick={onOpen}
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
            <ChevronRight className="h-3.5 w-3.5"/>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Operation feed item ── */
function OpsItem({ item, type }: { item: any; type: 'task'|'log' }) {
  const statusColor = item.status === 'completed' ? 'text-emerald-400' : item.status === 'failed' ? 'text-red-400' : 'text-amber-400';
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${type === 'task' ? (item.status === 'completed' ? 'bg-emerald-400' : item.status === 'failed' ? 'bg-red-400' : 'bg-amber-400') : 'bg-violet-400'}`}/>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground/80 truncate">
          {type === 'task' ? `${item.task_type || 'task'}` : item.description?.slice(0, 60) || item.change_type}
        </p>
      </div>
      <span className="text-[10px] text-muted-foreground/40 shrink-0">{ago(item.created_at)}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMMAND CENTER
═══════════════════════════════════════════════════════ */
export default function Launchpad() {
  const navigate  = useNavigate();
  const { projects } = useAuth();
  const { setSelectedProjectId } = useProject();

  const [data,         setData]         = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [lastRefresh,  setLastRefresh]  = useState<Date>(new Date());
  const [approving,    setApproving]    = useState<string[]>([]);
  const [toast,        setToast]        = useState('');
  const [showPending,  setShowPending]  = useState(false);
  const [systemMode,   setSystemMode]   = useState<'live'|'paused'>('live');
  const autoRef = useRef<ReturnType<typeof setInterval>>();

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await callEngine('get_launchpad_intel');
      setData(d);
      setLastRefresh(new Date());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 90s when live
    autoRef.current = setInterval(() => {
      if (systemMode === 'live') load();
    }, 90000);
    return () => clearInterval(autoRef.current);
  }, [load, systemMode]);

  /* Bulk approve all pending for a project */
  const approvePending = async (projectId: string, projectName: string) => {
    const pending = data?.pendingLearnings?.filter((l: any) => l.project_id === projectId) || [];
    if (!pending.length) return;
    setApproving(prev => [...prev, projectId]);
    let approved = 0;
    for (const l of pending) {
      const r = await callEngine('approve_learning', { id: l.id });
      if (r.updated) approved++;
    }
    showToast(`✓ ${approved} learnings approved for ${projectName}`);
    await load();
    setApproving(prev => prev.filter(id => id !== projectId));
  };

  /* Approve single learning */
  const approveSingle = async (id: string) => {
    const r = await callEngine('approve_learning', { id });
    if (r.updated) {
      setData((prev: any) => ({
        ...prev,
        pendingLearnings: prev.pendingLearnings.filter((l: any) => l.id !== id),
        totals: { ...prev.totals, pendingApprovals: prev.totals.pendingApprovals - 1 },
      }));
    }
  };

  const rejectSingle = async (id: string) => {
    await callEngine('reject_learning', { id });
    setData((prev: any) => ({
      ...prev,
      pendingLearnings: prev.pendingLearnings.filter((l: any) => l.id !== id),
      totals: { ...prev.totals, pendingApprovals: prev.totals.pendingApprovals - 1 },
    }));
  };

  const openProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    navigate('/mission-control');
  };

  const t = data?.totals || {};
  const projectStats: any[] = data?.projectStats || [];
  const activeProjects = projectStats.filter(p => p.status !== 'archived');
  const healthAvg = activeProjects.length
    ? Math.round(activeProjects.reduce((s, p) => s + p.brainScore, 0) / activeProjects.length)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Custom dark header */}
      <div className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="flex items-center justify-between h-14 px-4 sm:px-6 max-w-[1600px] mx-auto">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Rocket className="h-4 w-4 text-amber-400"/>
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">Command Center</div>
              <div className="text-[10px] text-muted-foreground/50 font-mono">SEO SEASON</div>
            </div>
          </div>

          {/* System mode + controls */}
          <div className="flex items-center gap-2">
            {/* Live indicator */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono transition-all ${
              systemMode === 'live'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-border bg-secondary/40 text-muted-foreground'
            }`}>
              {systemMode === 'live' ? <Pulse color="bg-emerald-400" size="h-1.5 w-1.5"/> : <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground"/>}
              {systemMode === 'live' ? 'LIVE' : 'PAUSED'}
            </div>
            <button onClick={() => setSystemMode(m => m === 'live' ? 'paused' : 'live')}
              className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
              {systemMode === 'live' ? <EyeOff className="h-3.5 w-3.5"/> : <Eye className="h-3.5 w-3.5"/>}
            </button>
            <button onClick={load} disabled={loading}
              className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}/>
            </button>
            <button onClick={() => navigate('/dashboard')}
              className="h-8 px-3 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
              Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-card border border-border shadow-xl text-sm text-foreground max-w-md text-center">
          {toast}
        </div>
      )}

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* ══ PULSE BAR ══ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <PulseTile icon={Globe}       label="Active Projects"  value={t.activeProjects ?? '—'}  sub={`${t.projects ?? 0} total`}            color="text-sky-400"    onClick={() => {}}/>
          <PulseTile icon={Brain}       label="Brain Quality"    value={loading ? '…' : healthAvg}   sub="avg across projects"                  color={healthColor(healthAvg)} onClick={() => {}}/>
          <PulseTile icon={CheckCircle2} label="Active Learnings" value={t.activeLearnings ?? '—'} sub={`${t.institutionalKnowledge ?? 0} institutional`} color="text-emerald-400" onClick={() => {}}/>
          <PulseTile icon={Clock}       label="Pending Approvals" value={t.pendingApprovals ?? '—'} sub="need your review"                      color={t.pendingApprovals > 0 ? 'text-amber-400' : 'text-muted-foreground'} alert={t.pendingApprovals > 0} onClick={() => setShowPending(true)}/>
          <PulseTile icon={Cpu}         label="Algo Topics"      value={t.algoTopics ?? '—'}      sub="loaded in Brain"                        color="text-violet-400" onClick={() => navigate('/algorithm-intel')}/>
          <PulseTile icon={Activity}    label="Tasks Today"      value={t.todayTasks ?? '—'}      sub={`${t.taskCount ?? 0} total`}           color="text-primary"    onClick={() => navigate('/brain-command')}/>
          <PulseTile icon={Target}      label="API Cost Today"   value={t.todayCost ? `$${t.todayCost.toFixed(4)}` : '$0'} sub={`$${(t.totalCost ?? 0).toFixed(2)} lifetime`} color="text-rose-400" onClick={() => {}}/>
        </div>

        {/* ══ MAIN GRID ══ */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">

          {/* LEFT: Projects + Brain Summary */}
          <div className="space-y-5">

            {/* Projects command grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-amber-400"/>
                  <span className="text-sm font-semibold">Active Projects</span>
                  <span className="text-xs text-muted-foreground">({activeProjects.length})</span>
                </div>
                <button onClick={() => navigate('/admin')}
                  className="text-xs text-primary hover:underline flex items-center gap-1">
                  New project <ChevronRight className="h-3 w-3"/>
                </button>
              </div>
              {loading && !data && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[1,2,3].map(i => <div key={i} className="h-44 rounded-xl border border-border bg-card/30 animate-pulse"/>)}
                </div>
              )}
              {activeProjects.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeProjects.map(p => (
                    <ProjectCard key={p.id} p={p}
                      onOpen={() => openProject(p.id)}
                      onApprove={() => approvePending(p.id, p.name)}/>
                  ))}
                </div>
              )}
              {!loading && activeProjects.length === 0 && (
                <div className="rounded-xl border border-border bg-card/40 p-10 text-center text-muted-foreground">
                  <Rocket className="h-10 w-10 mx-auto mb-3 opacity-20"/>
                  <p>No active projects.</p>
                  <button onClick={() => navigate('/admin')} className="mt-3 text-sm text-primary hover:underline">Create first project →</button>
                </div>
              )}
            </div>

            {/* Brain Intelligence Overview */}
            <div className="rounded-xl border border-border bg-card/60 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="h-4 w-4 text-primary"/>
                <span className="text-sm font-semibold">Brain Intelligence Overview</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Learnings',       value: t.totalLearnings ?? 0,        color: 'text-foreground'   },
                  { label: 'Active',                 value: t.activeLearnings ?? 0,       color: 'text-emerald-400'  },
                  { label: 'Pending Review',         value: t.pendingApprovals ?? 0,      color: t.pendingApprovals > 0 ? 'text-amber-400' : 'text-muted-foreground' },
                  { label: 'Institutional Memory',   value: t.institutionalKnowledge ?? 0,color: 'text-violet-400'   },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-xl bg-secondary/30 border border-border/50 p-3 text-center">
                    <div className={`text-2xl font-bold ${color}`}>{value}</div>
                    <div className="text-[10px] text-muted-foreground/60 mt-1">{label}</div>
                  </div>
                ))}
              </div>

              {/* Per-project brain quality bar list */}
              {activeProjects.length > 0 && (
                <div className="mt-4 space-y-2">
                  {activeProjects.sort((a, b) => b.brainScore - a.brainScore).map(p => (
                    <div key={p.id} className="flex items-center gap-3">
                      <button onClick={() => openProject(p.id)} className="text-xs text-foreground/80 truncate w-32 text-left hover:text-primary transition-colors shrink-0">
                        {p.name}
                      </button>
                      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className={`h-full rounded-full ${healthBg(p.brainScore)} transition-all duration-700`} style={{ width: `${p.brainScore}%` }}/>
                      </div>
                      <span className={`text-xs font-mono w-8 text-right shrink-0 ${healthColor(p.brainScore)}`}>{p.brainScore}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT: Operations feed + Algo watch */}
          <div className="space-y-5">

            {/* Operations feed */}
            <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-card/40">
                <Terminal className="h-3.5 w-3.5 text-primary"/>
                <span className="text-xs font-semibold">Operations Feed</span>
                {systemMode === 'live' && <Pulse color="bg-primary/60" size="h-1.5 w-1.5"/>}
              </div>
              <div className="px-4 py-2 max-h-64 overflow-y-auto">
                {(data?.recentTasks || []).length === 0 && !loading && (
                  <p className="text-xs text-muted-foreground/50 py-4 text-center">No recent operations</p>
                )}
                {(data?.recentTasks || []).map((t: any) => <OpsItem key={t.id} item={t} type="task"/>)}
              </div>
            </div>

            {/* Algorithm watch */}
            <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/40">
                <div className="flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5 text-violet-400"/>
                  <span className="text-xs font-semibold">Algorithm Intelligence</span>
                </div>
                <button onClick={() => navigate('/algorithm-intel')} className="text-[10px] text-primary hover:underline">manage →</button>
              </div>
              <div className="px-4 py-2 space-y-1.5 max-h-52 overflow-y-auto">
                {(data?.algoTopics || []).length === 0 && (
                  <p className="text-xs text-muted-foreground/50 py-3 text-center">No algo topics loaded</p>
                )}
                {(data?.algoTopics || []).map((a: any) => (
                  <div key={a.id} className="flex items-center gap-2 py-1.5">
                    <Radio className="h-3 w-3 text-violet-400 shrink-0"/>
                    <span className="text-xs text-foreground/80 truncate flex-1">{a.topic}</span>
                    <span className="text-[10px] text-muted-foreground/40 shrink-0">{ago(a.updated_at)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* System events */}
            <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-card/40">
                <Shield className="h-3.5 w-3.5 text-muted-foreground"/>
                <span className="text-xs font-semibold">System Log</span>
              </div>
              <div className="px-4 py-2 max-h-44 overflow-y-auto">
                {(data?.recentLogs || []).length === 0 && (
                  <p className="text-xs text-muted-foreground/50 py-3 text-center">No system events</p>
                )}
                {(data?.recentLogs || []).map((l: any) => <OpsItem key={l.id} item={l} type="log"/>)}
              </div>
            </div>

          </div>
        </div>

        {/* ══ QUICK COMMANDS ══ */}
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-amber-400"/>
            <span className="text-sm font-semibold">Quick Commands</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Strategy Canvas',    icon: Target,    href: '/playground',      color: 'hover:border-primary/40 hover:text-primary'          },
              { label: 'Run Brain Command',  icon: Brain,     href: '/brain-command',   color: 'hover:border-emerald-500/40 hover:text-emerald-400'   },
              { label: 'Run Audit',          icon: Activity,  href: '/audit',           color: 'hover:border-violet-500/40 hover:text-violet-400'     },
              { label: 'Brain Learning',     icon: BookOpen,  href: '/brain-learning',  color: 'hover:border-sky-500/40 hover:text-sky-400'           },
              { label: 'Data Room',          icon: Database,  href: '/data-room',       color: 'hover:border-cyan-500/40 hover:text-cyan-400'         },
              { label: 'Algorithm Intel',    icon: Cpu,       href: '/algorithm-intel', color: 'hover:border-rose-500/40 hover:text-rose-400'         },
              { label: 'Review Pending',     icon: Clock,     href: '',                 color: 'hover:border-amber-500/40 hover:text-amber-400', action: () => setShowPending(true) },
              { label: 'Admin',              icon: Shield,    href: '/admin',           color: 'hover:border-zinc-500/40 hover:text-zinc-400'         },
            ].map(({ label, icon: Icon, href, color, action }) => (
              <button key={label}
                onClick={() => action ? action() : navigate(href)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground transition-all ${color}`}>
                <Icon className="h-3.5 w-3.5"/>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Last refresh */}
        <div className="text-[10px] text-muted-foreground/30 font-mono text-center pb-2">
          Last refreshed {lastRefresh.toLocaleTimeString()} · {systemMode === 'live' ? 'Auto-refresh every 90s' : 'Auto-refresh paused'}
        </div>

      </div>

      {/* ══ PENDING APPROVALS DRAWER ══ */}
      {showPending && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowPending(false)}/>
          <div className="fixed right-0 top-0 bottom-0 z-50 w-[440px] max-w-full bg-card border-l border-border flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400"/>
                <span className="text-sm font-semibold">Pending Approvals</span>
                <span className="text-xs text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5">
                  {data?.pendingLearnings?.length || 0}
                </span>
              </div>
              <button onClick={() => setShowPending(false)}><X className="h-4 w-4 text-muted-foreground"/></button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {(data?.pendingLearnings || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <CheckCircle2 className="h-10 w-10 opacity-20"/>
                  <p>All clear — no pending approvals</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {(data?.pendingLearnings || []).map((l: any) => {
                    const proj = activeProjects.find(p => p.id === l.project_id);
                    return (
                      <div key={l.id} className="px-5 py-3.5 hover:bg-secondary/20 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{l.card_title || 'Untitled'}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {proj && <span className="text-[10px] text-muted-foreground/50">{proj.name}</span>}
                              <span className="text-[10px] font-mono text-muted-foreground/40 bg-secondary/40 px-1 py-0.5 rounded">{l.card_type}</span>
                              {l.confidence_score && <span className="text-[10px] text-muted-foreground/40">{l.confidence_score}%</span>}
                              {l.auto_captured && <span className="text-[10px] text-violet-400/60">auto</span>}
                            </div>
                          </div>
                          {/* Approve / Reject */}
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => approveSingle(l.id)}
                              className="h-7 w-7 rounded-lg flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/25 transition-colors">
                              <Check className="h-3.5 w-3.5"/>
                            </button>
                            <button onClick={() => rejectSingle(l.id)}
                              className="h-7 w-7 rounded-lg flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/25 transition-colors">
                              <X className="h-3.5 w-3.5"/>
                            </button>
                          </div>
                        </div>
                        {l.improvement && (
                          <p className="text-xs text-muted-foreground/60 line-clamp-2 mt-1">{l.improvement}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bulk actions */}
            {(data?.pendingLearnings || []).length > 0 && (
              <div className="px-5 py-4 border-t border-border bg-card/80 flex gap-2">
                <button
                  onClick={async () => {
                    const all = data?.pendingLearnings || [];
                    let n = 0;
                    for (const l of all) { await callEngine('approve_learning', { id: l.id }); n++; }
                    showToast(`✓ ${n} learnings approved`);
                    await load();
                    setShowPending(false);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors">
                  <Check className="h-3.5 w-3.5"/>
                  Approve All ({data?.pendingLearnings?.length})
                </button>
                <button onClick={() => navigate('/brain-learning')}
                  className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                  Full Review
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
