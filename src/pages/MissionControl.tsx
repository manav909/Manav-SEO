/**
 * MISSION CONTROL — Operational Command Center
 * Fixed viewport. Collapsible sections. Advisor on the right.
 * What the president monitors and controls — not where he thinks.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject }  from '@/contexts/ProjectContext';
import { ProjectDataBanner } from '@/components/ProjectDataBanner';
import { useAuth }     from '@/contexts/AuthContext';
import { useLaunchpadData } from '@/hooks/useLaunchpadData';
import { supabase }         from '@/lib/supabase';
import PresidentialAdvisor from '@/components/PresidentialAdvisor';
import {
  Rocket, Brain, Activity, Clock, CheckCircle2, AlertTriangle,
  RefreshCw, ChevronRight, Shield, X, Check, Cpu,
  Eye, EyeOff, Terminal, Radio, Globe, Database, Zap,
  Layers, BookOpen, Plus, Target, ChevronDown, ChevronUp,
} from 'lucide-react';

async function callEngine(a: string, b: Record<string,unknown> = {}) {
  const r = await fetch('/api/task-engine', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({action:a,...b}) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const ago = (iso?: string) => {
  if (!iso) return 'never';
  const ms = Date.now()-new Date(iso).getTime();
  const m=Math.floor(ms/60000), h=Math.floor(m/60), d=Math.floor(h/24);
  return d>0?`${d}d`:h>0?`${h}h`:m>0?`${m}m`:'now';
};
const sc  = (s:number) => s>=80?'text-emerald-400':s>=60?'text-sky-400':s>=40?'text-amber-400':'text-red-400';
const sbg = (s:number) => s>=80?'bg-emerald-500':s>=60?'bg-sky-500':s>=40?'bg-amber-500':'bg-red-500';
const sbd = (s:number) => s>=80?'border-emerald-500/25':s>=60?'border-sky-500/25':s>=40?'border-amber-500/25':'border-red-500/25';

function Dot({color='bg-emerald-400',pulse=false}:{color?:string;pulse?:boolean}) {
  return (
    <span className="relative flex shrink-0 h-1.5 w-1.5">
      {pulse&&<span className={`animate-ping absolute h-full w-full rounded-full ${color} opacity-50`}/>}
      <span className={`relative rounded-full h-1.5 w-1.5 ${color}`}/>
    </span>
  );
}

/* Collapsible section wrapper */
function Section({ title, icon: Icon, color='text-muted-foreground/60', badge, defaultOpen=true, children, action }: any) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/20 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-card/30 hover:bg-card/50 transition-colors">
        <div className="flex items-center gap-2">
          <Icon className={`h-3 w-3 ${color}`}/>
          <span className="text-[10px] font-semibold text-muted-foreground/65">{title}</span>
          {badge != null && badge > 0 && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono border border-amber-500/20">{badge}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {action}
          {open ? <ChevronUp className="h-3 w-3 text-muted-foreground/30"/> : <ChevronDown className="h-3 w-3 text-muted-foreground/30"/>}
        </div>
      </button>
      {open && <div className="border-t border-border/15">{children}</div>}
    </div>
  );
}

function ProjectRow({ p, selected, onClick, onApprove, approving }: any) {
  const score = p.brainScore ?? 0;
  const C = 2*Math.PI*10;
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2.5 transition-all text-left border-b border-border/10 last:border-0 ${selected?'bg-primary/5':'hover:bg-card/50'}`}>
      {/* Mini ring */}
      <div className="relative w-8 h-8 shrink-0">
        <svg className="w-8 h-8 -rotate-90" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5"/>
          <circle cx="12" cy="12" r="10" fill="none" className={`${sbg(score).replace('bg-','stroke-')}`} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C*(1-score/100)}/>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-[8px] font-bold ${sc(score)}`}>{score}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{p.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] text-muted-foreground/40">{p.activeLearnings} learn</span>
          {p.pendingLearnings > 0 && <span className="text-[9px] text-amber-400">{p.pendingLearnings}▲</span>}
          {!p.cms && <span className="text-[8px] text-red-400/60 font-mono">CMS!</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {p.pendingLearnings > 0 && (
          <button onClick={e => { e.stopPropagation(); onApprove(); }} disabled={approving}
            className="h-5 w-5 rounded flex items-center justify-center bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-40">
            {approving ? <RefreshCw className="h-2.5 w-2.5 animate-spin"/> : <Clock className="h-2.5 w-2.5"/>}
          </button>
        )}
        <ChevronRight className="h-3 w-3 text-muted-foreground/25"/>
      </div>
    </button>
  );
}

export default function MissionControl() {
  const navigate = useNavigate();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const { projects } = useAuth();

  const { data, loading, error, reload: load } = useLaunchpadData();
  const [selectedId,    setSelectedId]    = useState('');
  const [liveMode,      setLiveMode]      = useState(true);
  const [approving,     setApproving]     = useState(new Set<string>());
  const [toast,         setToast]         = useState('');
  const [showApprovals, setShowApprovals] = useState(false);
  const [activeLearnings, setActiveLearnings] = useState<any[]>([]);
  const autoRef = useRef<ReturnType<typeof setInterval>>();

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  // Auto-refresh when live
  useEffect(() => {
    autoRef.current = setInterval(() => { if (liveMode) load(); }, 90000);
    return () => clearInterval(autoRef.current);
  }, [liveMode, load]);

  useEffect(() => {
    if (!data?.projectStats?.length || selectedId) return;
    const first = data.projectStats.find((p: any) => p.status !== 'archived');
    if (first) setSelectedId(first.id);
  }, [data]);

  useEffect(() => {
    if (selectedId) setSelectedProjectId(selectedId);
  }, [selectedId]);

  /* Active learnings for selected project — feeds advisor context */
  useEffect(() => {
    if (!selectedId) return;
    supabase
      .from('brain_learnings')
      .select('id,card_type,card_title,improvement,tags,confidence_score,applied_count,what_worked,what_missed')
      .eq('project_id', selectedId)
      .eq('status', 'active')
      .order('applied_count', { ascending: false })
      .limit(15)
      .then(({ data: d }) => setActiveLearnings(d || []));
  }, [selectedId]);

  const approveAll = async (projectId: string, name: string) => {
    const pending = (data?.pendingLearnings || []).filter((l: any) => l.project_id === projectId);
    if (!pending.length) return;
    setApproving(prev => new Set([...prev, projectId]));
    let n = 0;
    for (const l of pending) { const r = await callEngine('approve_learning', { id: l.id }); if (r.updated) n++; }
    showToast(`✓ ${n} approved for ${name}`);
    await load();
    setApproving(prev => { const s = new Set(prev); s.delete(projectId); return s; });
  };

  const approveSingle = async (id: string) => {
    await callEngine('approve_learning', { id });
    await load();
  };
  const rejectSingle = async (id: string) => {
    await callEngine('reject_learning', { id });
    await load();
  };

  const t = data?.totals || {};
  const allProjs: any[] = data?.projectStats || [];
  const activeProjs = allProjs.filter(p => p.status !== 'archived');
  const selProj = allProjs.find(p => p.id === selectedId);
  const avgBrain = activeProjs.length ? Math.round(activeProjs.reduce((s, p) => s+p.brainScore, 0)/activeProjs.length) : 0;

  const algoForAdvisor = (data?.algoTopics || []).map((a: any) => ({
    title:        a.topic,
    summary:      a.summary || '',
    impact_level: a.freshness_score >= 7 ? 'high' : a.freshness_score >= 4 ? 'medium' : 'low',
    engine:       'google',
  }));

  const projCtx = selProj
    ? `Project: ${selProj.name} | Brain: ${selProj.brainScore}/100 | Learnings: ${selProj.activeLearnings} active | Pending: ${selProj.pendingLearnings} | CMS: ${selProj.cms||'not set'} | Tasks: ${selProj.taskCount}`
    : `Empire: ${activeProjs.length} projects | Brain avg: ${avgBrain} | Pending: ${t.pendingApprovals || 0}`;

  return (
    <div className="fixed inset-0 bg-[#030810] text-foreground overflow-hidden flex flex-col"
         style={{ fontFamily: 'system-ui, sans-serif' }}>
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-card border border-border shadow-xl text-sm max-w-md text-center">{toast}</div>}

      {/* ═══ VITAL STRIP ═══ */}
      <div className="border-b border-border/25 bg-[#030810]/95 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto">
          <div className="flex items-center gap-2 mr-3 shrink-0">
            <div className="h-7 w-7 rounded-lg bg-amber-500/12 border border-amber-500/25 flex items-center justify-center">
              <Rocket className="h-3.5 w-3.5 text-amber-400"/>
            </div>
            <span className="text-xs font-bold hidden sm:block text-foreground/80">Mission Control</span>
          </div>
          {[
            { icon: Globe,       label: 'Projects', value: t.activeProjects, sub: `${t.projects||0} total`,   color: 'text-sky-400' },
            { icon: Brain,       label: 'Brain Avg', value: loading?'…':avgBrain, sub: 'quality',              color: sc(avgBrain) },
            { icon: CheckCircle2,label: 'Learnings', value: t.activeLearnings, sub: 'active',                  color: 'text-emerald-400' },
            { icon: Clock,       label: 'Pending',   value: t.pendingApprovals, sub: 'approvals',              color: t.pendingApprovals>0?'text-amber-400':'text-muted-foreground/40', alert: t.pendingApprovals>0 },
            { icon: Cpu,         label: 'Algo',      value: t.algoTopics, sub: 'topics',                       color: 'text-violet-400' },
            { icon: Activity,    label: 'Today',     value: t.todayTasks, sub: 'tasks',                        color: 'text-primary' },
            { icon: Target,      label: 'Cost',      value: t.todayCost?`$${Number(t.todayCost).toFixed(4)}`:'$0', sub: 'today', color: 'text-rose-400' },
          ].map(({ icon: Icon, label, value, sub, color, alert }) => (
            <button key={label}
              onClick={() => label === 'Pending' && t.pendingApprovals > 0 ? setShowApprovals(true) : undefined}
              className={`flex flex-col gap-0 px-2.5 py-2 rounded-lg border transition-all text-left shrink-0 ${
                alert ? 'border-amber-500/35 bg-amber-500/6 cursor-pointer' : 'border-border/35 bg-card/25'
              }`}>
              <div className="flex items-center gap-1">
                <Icon className={`h-2.5 w-2.5 ${color}`}/>
                <span className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-widest">{label}</span>
              </div>
              <div className={`text-base font-bold leading-none mt-0.5 ${color}`}>{value ?? '—'}</div>
              <div className="text-[8px] text-muted-foreground/30 leading-none">{sub}</div>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <div className={`flex items-center gap-1 px-2 py-1 rounded text-[8px] font-mono border ${liveMode?'border-emerald-500/25 bg-emerald-500/6 text-emerald-400':'border-border/35 text-muted-foreground/35'}`}>
              {liveMode && <Dot color="bg-emerald-400" pulse/>}{liveMode?'LIVE':'PAUSED'}
            </div>
            <button onClick={() => setLiveMode(m => !m)} className="h-7 w-7 rounded border border-border/35 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              {liveMode ? <EyeOff className="h-3 w-3"/> : <Eye className="h-3 w-3"/>}
            </button>
            <button onClick={load} disabled={loading} className="h-7 w-7 rounded border border-border/35 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className={`h-3 w-3 ${loading?'animate-spin':''}`}/>
            </button>
            <button onClick={() => navigate('/oval')} className="h-7 px-2 rounded border border-amber-500/25 bg-amber-500/8 text-amber-400 text-[9px] hover:bg-amber-500/15 transition-colors flex items-center gap-1">
              ◈ The Oval
            </button>
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500/8 border-t border-red-500/20 text-xs text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0"/>
            <span>{error}</span>
            <button onClick={load} className="ml-auto underline">Retry</button>
          </div>
        )}
      </div>


      <ProjectDataBanner project={selProj} onSave={load}/>
      {/* ═══ MAIN GRID — 2 cols: left=operations, right=advisor ═══ */}
      <div className="flex-1 grid grid-cols-[1fr_280px] gap-px bg-border/15 min-h-0">

        {/* LEFT: Collapsible operational panels */}
        <div className="bg-[#030810] overflow-y-auto p-3 space-y-2">

          {/* PROJECTS */}
          <Section title="ACTIVE PROJECTS" icon={Rocket} color="text-amber-400/70"
            badge={t.pendingApprovals}
            defaultOpen={true}
            action={
              <button onClick={e => { e.stopPropagation(); navigate('/admin'); }} className="text-[9px] text-primary hover:underline flex items-center gap-0.5">
                <Plus className="h-2.5 w-2.5"/>New
              </button>
            }>
            {loading && !data && [1,2,3].map(i => <div key={i} className="h-10 mx-3 my-1 rounded bg-secondary/10 animate-pulse"/>)}
            {activeProjs.map(p => (
              <ProjectRow key={p.id} p={p} selected={p.id === selectedId}
                onClick={() => setSelectedId(p.id)}
                onApprove={() => approveAll(p.id, p.name)}
                approving={approving.has(p.id)}/>
            ))}
            {!loading && activeProjs.length === 0 && !error && (
              <p className="text-xs text-muted-foreground/30 text-center py-4">No active projects</p>
            )}
            {/* Brain health bars */}
            {activeProjs.length > 0 && (
              <div className="px-3 py-2.5 border-t border-border/15">
                <div className="text-[9px] font-mono text-muted-foreground/30 mb-2">BRAIN QUALITY</div>
                {activeProjs.map(p => (
                  <div key={p.id} className="flex items-center gap-2 mb-1.5">
                    <span className="text-[9px] text-foreground/50 w-20 truncate">{p.name}</span>
                    <div className="flex-1 h-1 rounded-full bg-secondary/30 overflow-hidden">
                      <div className={`h-full rounded-full ${sbg(p.brainScore??0)}`} style={{ width: `${p.brainScore??0}%`, transition: 'width 0.7s ease' }}/>
                    </div>
                    <span className={`text-[8px] font-mono w-5 text-right ${sc(p.brainScore??0)}`}>{p.brainScore??0}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* PENDING APPROVALS */}
          {t.pendingApprovals > 0 && (
            <Section title="PENDING APPROVALS" icon={Clock} color="text-amber-400/70" badge={t.pendingApprovals} defaultOpen={true}>
              {(data?.pendingLearnings || []).slice(0, 6).map((l: any) => {
                const proj = activeProjs.find(p => p.id === l.project_id);
                return (
                  <div key={l.id} className="flex items-center gap-2.5 px-3 py-2 border-b border-border/10 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground/70 truncate">{l.card_title || 'Untitled'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {proj && <span className="text-[9px] text-muted-foreground/35">{proj.name}</span>}
                        <span className="text-[8px] font-mono text-muted-foreground/25 bg-secondary/30 px-1 rounded">{l.card_type}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => approveSingle(l.id)} className="h-6 w-6 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center"><Check className="h-3 w-3"/></button>
                      <button onClick={() => rejectSingle(l.id)}  className="h-6 w-6 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 flex items-center justify-center"><X className="h-3 w-3"/></button>
                    </div>
                  </div>
                );
              })}
              {(data?.pendingLearnings || []).length > 6 && (
                <button onClick={() => setShowApprovals(true)} className="w-full text-center py-2 text-xs text-primary hover:underline border-t border-border/10">
                  See all {data?.pendingLearnings?.length} →
                </button>
              )}
            </Section>
          )}

          {/* OPERATIONS */}
          <Section title="OPERATIONS FEED" icon={Terminal} color="text-primary/60" defaultOpen={true}>
            <div className="divide-y divide-border/10">
              {(data?.recentTasks || []).length === 0 && <p className="text-xs text-muted-foreground/25 text-center py-4">No recent operations</p>}
              {(data?.recentTasks || []).map((t: any) => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-1.5">
                  <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${t.status==='completed'?'bg-emerald-400':t.status==='failed'?'bg-red-400':'bg-amber-400'}`}/>
                  <p className="flex-1 text-xs text-foreground/60 truncate">{t.task_type || 'task'}</p>
                  <span className="text-[9px] text-muted-foreground/30">{ago(t.created_at)}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ALGO INTEL */}
          <Section title="ALGORITHM INTELLIGENCE" icon={Cpu} color="text-violet-400/60" defaultOpen={false}
            action={<button onClick={e => { e.stopPropagation(); navigate('/algorithm-intel'); }} className="text-[9px] text-primary hover:underline">manage</button>}>
            <div className="divide-y divide-border/10">
              {(data?.algoTopics || []).slice(0, 8).map((a: any) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-1.5">
                  <Radio className="h-2.5 w-2.5 text-violet-400/40 shrink-0"/>
                  <span className="flex-1 text-xs text-foreground/55 truncate">{a.topic}</span>
                  <span className="text-[9px] text-muted-foreground/25">{ago(a.updated_at)}</span>
                </div>
              ))}
              {(data?.algoTopics || []).length === 0 && <p className="text-xs text-muted-foreground/25 text-center py-3">No topics loaded</p>}
            </div>
          </Section>

          {/* SYSTEM LOG */}
          <Section title="SYSTEM LOG" icon={Shield} color="text-muted-foreground/50" defaultOpen={false}>
            <div className="divide-y divide-border/10">
              {(data?.recentLogs || []).slice(0, 6).map((l: any) => (
                <div key={l.id} className="flex items-start gap-2 px-3 py-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-violet-400/40 shrink-0 mt-1"/>
                  <p className="flex-1 text-xs text-foreground/50 leading-snug">{l.description?.slice(0, 80) || l.change_type}</p>
                  <span className="text-[9px] text-muted-foreground/25 shrink-0">{ago(l.created_at)}</span>
                </div>
              ))}
              {(data?.recentLogs || []).length === 0 && <p className="text-xs text-muted-foreground/25 text-center py-3">No events</p>}
            </div>
          </Section>

          {/* COMMAND STRIP */}
          <div className="pt-1 pb-2">
            <div className="text-[8px] font-mono text-muted-foreground/25 mb-1.5">DIRECT</div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { l:'Canvas',    icon: Layers,    href: '/playground',     c: 'hover:text-primary hover:border-primary/30' },
                { l:'Brain Cmd', icon: Zap,       href: '/brain-command',  c: 'hover:text-emerald-400 hover:border-emerald-500/30' },
                { l:'Audit',     icon: Activity,  href: '/audit',          c: 'hover:text-violet-400 hover:border-violet-500/30' },
                { l:'Learning',  icon: BookOpen,  href: '/brain-learning', c: 'hover:text-sky-400 hover:border-sky-500/30' },
                { l:'Data Room', icon: Database,  href: '/data-room',      c: 'hover:text-cyan-400 hover:border-cyan-500/30' },
                { l:'Algo',      icon: Cpu,       href: '/algorithm-intel',c: 'hover:text-rose-400 hover:border-rose-500/30' },
              ].map(({ l, icon: Icon, href, c }) => (
                <button key={l} onClick={() => navigate(href)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/30 text-[10px] text-muted-foreground/45 transition-all ${c}`}>
                  <Icon className="h-3 w-3"/>{l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Operational advisor */}
        <div className="bg-[#030810] p-3 flex flex-col min-h-0">
          <PresidentialAdvisor
            mode="operational"
            projectName={selProj?.name}
            projectContext={projCtx}
            learnings={activeLearnings}
            algoItems={algoForAdvisor}/>
        </div>
      </div>

      {/* Full approvals drawer */}
      {showApprovals && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowApprovals(false)}/>
          <div className="fixed right-0 top-0 bottom-0 z-50 w-96 max-w-full bg-card border-l border-border flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400"/>
                <span className="text-sm font-semibold">All Pending</span>
                <span className="text-xs text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5">{data?.pendingLearnings?.length||0}</span>
              </div>
              <button onClick={() => setShowApprovals(false)}><X className="h-4 w-4 text-muted-foreground"/></button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border/30">
              {(data?.pendingLearnings||[]).map((l: any) => {
                const proj = activeProjs.find(p => p.id === l.project_id);
                return (
                  <div key={l.id} className="px-5 py-3 hover:bg-secondary/15 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{l.card_title||'Untitled'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {proj && <span className="text-[9px] text-muted-foreground/45">{proj.name}</span>}
                          <span className="text-[8px] font-mono text-muted-foreground/30 bg-secondary/40 px-1 rounded">{l.card_type}</span>
                        </div>
                        {l.improvement && <p className="text-xs text-muted-foreground/50 line-clamp-1 mt-1">{l.improvement}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => approveSingle(l.id)} className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center"><Check className="h-3.5 w-3.5"/></button>
                        <button onClick={() => rejectSingle(l.id)}  className="h-7 w-7 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 flex items-center justify-center"><X className="h-3.5 w-3.5"/></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {(data?.pendingLearnings||[]).length > 0 && (
              <div className="px-5 py-4 border-t border-border bg-card/80 flex gap-2">
                <button onClick={async () => {
                  const all = data?.pendingLearnings || []; let n = 0;
                  for (const l of all) { await callEngine('approve_learning', { id: l.id }); n++; }
                  showToast(`✓ ${n} approved`); await load(); setShowApprovals(false);
                }} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500/18">
                  <Check className="h-3.5 w-3.5"/>Approve All ({data?.pendingLearnings?.length})
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
