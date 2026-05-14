/**
 * MISSION CONTROL — SEO Season Presidential Command Center
 *
 * The president doesn't operate tools. He monitors, decides, directs.
 * Everything visible. Nothing escapes. One glance tells the story.
 * One click takes action.
 *
 * Architecture:
 *  VITAL STRIP    — 8 live system stats pinned at top
 *  PROJECTS GRID  — every project as a signal card, health ring, flags, live status
 *  SELECTED PANEL — click a project → right pane shows its complete intelligence
 *  OPERATIONS COL — tasks running, approvals waiting, system events
 *  COMMAND STRIP  — quick directives at bottom
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '@/contexts/AuthContext';
import { useProject }  from '@/contexts/ProjectContext';
import {
  Rocket, Brain, Zap, Activity, Clock, CheckCircle2,
  AlertTriangle, RefreshCw, ChevronRight, Shield,
  X, Check, BarChart3, Cpu, FileText, Eye, EyeOff,
  Terminal, Radio, Globe, Database, Target, BookOpen,
  TrendingUp, Layers, Send, Sparkles, Info, Lightbulb,
  Archive, Trash2, Edit3, Save, Plus,
} from 'lucide-react';

/* ── API helper ── */
async function callEngine(action: string, body: Record<string,unknown> = {}) {
  const r = await fetch('/api/task-engine', {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  return r.json();
}

/* ── Helpers ── */
const ago = (iso?: string) => {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms/60000), h = Math.floor(m/60), d = Math.floor(h/24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
};

const scoreColor  = (s:number) => s>=80?'text-emerald-400':s>=60?'text-sky-400':s>=40?'text-amber-400':'text-red-400';
const scoreBg     = (s:number) => s>=80?'bg-emerald-500':s>=60?'bg-sky-500':s>=40?'bg-amber-500':'bg-red-500';
const scoreBorder = (s:number) => s>=80?'border-emerald-500/25':s>=60?'border-sky-500/25':s>=40?'border-amber-500/25':'border-red-500/25';
const scoreLabel  = (s:number) => s>=80?'OPTIMAL':s>=60?'GOOD':s>=40?'FAIR':'CRITICAL';

/* ── Brain quality score ── */
function brainScore(p: any, learnings: any[]): number {
  let s = 0;
  if (p?.cms)                    s += 25;
  if (p?.keywords?.length >= 3)  s += 20;
  if (p?.goals)                  s += 15;
  if (p?.url)                    s += 10;
  const active = learnings.filter((l:any) => l.project_id === p.id && l.status === 'active').length;
  if (active >= 20)       s += 20;
  else if (active >= 10)  s += 12;
  else if (active >= 5)   s += 6;
  if (p?.competitors?.length >= 1) s += 10;
  return s;
}

/* ── Pulsing status dot ── */
function Dot({ color='bg-emerald-400', pulse=false }: { color?:string; pulse?:boolean }) {
  return (
    <span className="relative flex shrink-0 h-2 w-2">
      {pulse && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-50`}/>}
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`}/>
    </span>
  );
}

/* ── Top vital tile ── */
function Vital({ icon:Icon, label, value, sub, color, alert, onClick }: any) {
  return (
    <button onClick={onClick} className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-lg border transition-all text-left ${
      alert ? 'border-amber-500/40 bg-amber-500/8 hover:bg-amber-500/12'
            : 'border-border/50 bg-card/40 hover:border-primary/30 hover:bg-card/70'
    } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}>
      <div className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${color||'text-muted-foreground/60'}`}/>
        <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-widest leading-none">{label}</span>
      </div>
      <div className={`text-lg font-bold leading-none mt-0.5 ${color||'text-foreground'}`}>{value ?? '—'}</div>
      {sub && <div className="text-[9px] text-muted-foreground/40 leading-none mt-0.5">{sub}</div>}
    </button>
  );
}

/* ── Project signal card ── */
function SignalCard({ p, selected, onClick, onApprove, approving }: {
  p:any; selected:boolean; onClick:()=>void; onApprove:()=>void; approving:boolean;
}) {
  const isStale = p.lastActivity && (Date.now()-new Date(p.lastActivity).getTime()) > 7*86400000;
  const sc = p.brainScore ?? 0;
  const circumference = 2*Math.PI*18;
  return (
    <button onClick={onClick} className={`w-full rounded-xl border p-3.5 text-left transition-all ${
      selected
        ? `${scoreBorder(sc)} bg-card/90 shadow-md`
        : `${scoreBorder(sc)} bg-card/50 hover:bg-card/80`
    }`}>
      {/* Top row */}
      <div className="flex items-start gap-2 mb-2.5">
        {/* Brain score ring */}
        <div className="relative w-11 h-11 shrink-0">
          <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5"/>
            <circle cx="22" cy="22" r="18" fill="none"
              className={`transition-all duration-1000 ${scoreBg(sc).replace('bg-','stroke-')}`}
              strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference*(1-sc/100)}/>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-[10px] font-bold ${scoreColor(sc)}`}>{sc}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="text-sm font-semibold truncate leading-tight">{p.name}</div>
          <div className="text-[10px] text-muted-foreground/50 truncate">{p.clientName||'—'}</div>
        </div>
        {/* Live indicator */}
        {!isStale && <Dot color="bg-emerald-400" pulse={true}/>}
        {isStale && <Dot color="bg-amber-400/60"/>}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {[
          { v:p.activeLearnings, l:'learnings', warn: p.activeLearnings<10 },
          { v:p.pendingLearnings, l:'pending',   warn: p.pendingLearnings>0  },
          { v:p.taskCount,        l:'tasks',     warn: false                 },
        ].map(({v,l,warn}) => (
          <div key={l} className={`rounded-md px-2 py-1 text-center ${warn?'bg-amber-500/8':'bg-secondary/25'}`}>
            <div className={`text-sm font-bold leading-none ${warn?'text-amber-400':''}`}>{v}</div>
            <div className="text-[8px] text-muted-foreground/40 mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      {/* Flag chips */}
      <div className="flex flex-wrap gap-1 min-h-[18px]">
        {!p.cms       && <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/12 text-red-400 border border-red-500/20 font-mono">NO CMS</span>}
        {!p.goals     && <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/12 text-amber-400 border border-amber-500/20 font-mono">NO GOALS</span>}
        {!(p.keywords?.length) && <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/12 text-amber-400 border border-amber-500/20 font-mono">NO KW</span>}
        {isStale      && <span className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-500/12 text-zinc-400 border border-zinc-500/20 font-mono">STALE</span>}
        {sc>=80       && <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-400 border border-emerald-500/20 font-mono">OPTIMAL</span>}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
        <span className="text-[9px] text-muted-foreground/35">{ago(p.lastActivity)}</span>
        {p.pendingLearnings > 0 && (
          <button onClick={e=>{e.stopPropagation();onApprove();}} disabled={approving}
            className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-amber-500/12 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20 font-mono disabled:opacity-50 transition-colors">
            {approving ? <RefreshCw className="h-2.5 w-2.5 animate-spin"/> : <Clock className="h-2.5 w-2.5"/>}
            {p.pendingLearnings} pending
          </button>
        )}
      </div>
    </button>
  );
}

/* ── Selected project detail panel ── */
function ProjectDetail({ p, intel, navigate, onSave, saving, onApproveAll, approving }: any) {
  const learnings    = intel?.learnings  || [];
  const deskItems    = intel?.deskItems  || [];
  const tasks        = intel?.tasks      || [];
  const active       = learnings.filter((l:any)=>l.status==='active').length;
  const pending      = learnings.filter((l:any)=>l.status==='pending_review').length;

  /* Brain ask inline */
  const [q,setQ]       = useState('');
  const [answer,setAns]= useState('');
  const [asking,setAsk]= useState(false);
  const askBrain = async (query:string) => {
    if (!query.trim()||asking) return;
    setAsk(true); setAns(''); setQ('');
    try {
      const res = await fetch('/api/intelligence', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          mode:'chat', question:query,
          projectSummary:`Project: ${p.name} | CMS: ${p.cms||'Not set'} | Keywords: ${(p.keywords||[]).slice(0,5).join(', ')||'Not set'}`,
          brainAssistantContext:{projectContext:{projectId:p.id,...p},learnings:[],algoItems:[],canvasBlocks:[],history:[]},
        }),
      });
      if (!res.ok||!res.body) throw new Error();
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let full='';
      while(true){const{done,value}=await reader.read();if(done)break;full+=dec.decode(value);setAns(full);}
    } catch { setAns('Brain unavailable.'); }
    setAsk(false);
  };

  const sc = p.brainScore ?? 0;
  const gaps: string[] = [];
  if (!p.cms)                   gaps.push('CMS not set');
  if (!p.keywords?.length)      gaps.push('No keywords');
  if (!p.goals)                 gaps.push('No goals');
  if (active < 10)              gaps.push(`Only ${active} learnings (target 20+)`);
  if (!p.competitors?.length)   gaps.push('No competitors');

  return (
    <div className="flex flex-col h-full overflow-y-auto gap-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 ${scoreBorder(sc)}`}>
          <span className={`text-sm font-bold ${scoreColor(sc)}`}>{sc}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-base leading-tight">{p.name}</h2>
          <p className="text-xs text-muted-foreground">{p.clientName||'—'} · Brain: <span className={scoreColor(sc)}>{scoreLabel(sc)}</span></p>
        </div>
      </div>

      {/* Brain quality bar */}
      <div>
        <div className="flex justify-between text-[10px] text-muted-foreground/60 mb-1">
          <span>Brain quality</span><span>{sc}/100</span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className={`h-full rounded-full ${scoreBg(sc)} transition-all duration-1000`} style={{width:`${sc}%`}}/>
        </div>
        {gaps.length>0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {gaps.map(g=>(
              <button key={g} onClick={()=>navigate(`/mission-control-edit`)}
                className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono hover:bg-amber-500/20 transition-colors">
                ⚠ {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          {v:active,  l:'Active Learnings', c:active>=20?'text-emerald-400':'text-amber-400'},
          {v:pending, l:'Pending Review',   c:pending>0?'text-amber-400':'text-muted-foreground'},
          {v:deskItems.length, l:'Desk Items', c:'text-sky-400'},
          {v:tasks.length,     l:'Tasks',       c:'text-violet-400'},
        ].map(({v,l,c})=>(
          <div key={l} className="rounded-lg bg-secondary/30 border border-border/50 p-2.5 text-center">
            <div className={`text-xl font-bold ${c}`}>{v}</div>
            <div className="text-[9px] text-muted-foreground/50 mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      {/* Intelligence profile */}
      <div className="rounded-xl border border-border/50 bg-card/40 p-3.5 space-y-2">
        <div className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider mb-2">Intelligence Profile</div>
        {[
          {k:'CMS',      v:p.cms,            critical:!p.cms},
          {k:'Industry', v:p.industry},
          {k:'URL',      v:p.url},
          {k:'Goals',    v:p.goals ? p.goals.slice(0,60)+'…' : null},
        ].map(({k,v,critical})=>(
          <div key={k} className="flex gap-2 text-xs">
            <span className="text-muted-foreground/40 font-mono w-16 shrink-0">{k}</span>
            {v ? <span className="text-foreground/80 truncate">{v}</span>
               : <span className={`italic ${critical?'text-red-400/60':'text-muted-foreground/30'}`}>{critical?'CRITICAL — set this':'not set'}</span>}
          </div>
        ))}
        {p.keywords?.length>0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {(p.keywords||[]).slice(0,6).map((kw:string,i:number)=>(
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/70 border border-primary/20">{kw}</span>
            ))}
          </div>
        )}
      </div>

      {/* Brain Ask */}
      <div className="rounded-xl border border-primary/20 bg-card/50 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-primary/5">
          <Brain className="h-3.5 w-3.5 text-primary"/>
          <span className="text-xs font-semibold">Ask Brain</span>
        </div>
        {answer && (
          <div className="px-3 py-2.5 max-h-40 overflow-y-auto">
            <pre className="text-xs text-foreground/75 whitespace-pre-wrap font-sans leading-relaxed">{answer}</pre>
          </div>
        )}
        {asking && !answer && (
          <div className="flex gap-1.5 px-3 py-3">
            {[0,1,2].map(i=><div key={i} className="h-1.5 w-1.5 rounded-full bg-primary/50" style={{animation:`bounce 1.2s ease-in-out ${i*.2}s infinite`}}/>)}
          </div>
        )}
        <div className="flex gap-2 items-center px-2.5 py-2">
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&askBrain(q)}
            placeholder="Ask anything about this project…"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/35"/>
          <button onClick={()=>askBrain(q)} disabled={asking||!q.trim()}
            className="h-6 w-6 rounded-md bg-primary flex items-center justify-center text-primary-foreground hover:opacity-80 disabled:opacity-30 shrink-0 transition-opacity">
            <Send className="h-3 w-3"/>
          </button>
        </div>
      </div>

      {/* Quick prompts */}
      <div className="flex flex-wrap gap-1.5">
        {['What should I fix first?','Give me this week\'s priorities','Brain quality gaps?'].map(q2=>(
          <button key={q2} onClick={()=>askBrain(q2)}
            className="text-[10px] px-2.5 py-1 rounded-full border border-border bg-secondary/30 hover:border-primary/30 hover:bg-primary/10 hover:text-primary transition-all text-muted-foreground">
            {q2}
          </button>
        ))}
      </div>

      {/* Bulk approve */}
      {pending > 0 && (
        <button onClick={onApproveAll} disabled={approving}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-sm font-medium hover:bg-amber-500/18 disabled:opacity-50 transition-colors">
          {approving ? <RefreshCw className="h-3.5 w-3.5 animate-spin"/> : <Check className="h-3.5 w-3.5"/>}
          Approve {pending} pending learnings
        </button>
      )}

      {/* Jump to tools */}
      <div className="grid grid-cols-2 gap-1.5">
        {[
          {l:'Canvas',         href:'/playground',     icon:Layers},
          {l:'Brain Learning', href:'/brain-learning',  icon:Brain},
          {l:'Data Room',      href:'/data-room',       icon:Database},
          {l:'Run Audit',      href:'/audit',           icon:Activity},
          {l:'Brain Command',  href:'/brain-command',   icon:Zap},
          {l:'Full Detail',    href:'/project-detail',  icon:Target},
        ].map(({l,href,icon:Icon})=>(
          <button key={l} onClick={()=>navigate(href)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 text-xs text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all">
            <Icon className="h-3.5 w-3.5 shrink-0"/>{l}<ChevronRight className="h-3 w-3 ml-auto opacity-30"/>
          </button>
        ))}
      </div>

      <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

/* ── Feed item ── */
function FeedItem({ item, type }: { item:any; type:'task'|'log' }) {
  const col = type==='task'
    ? (item.status==='completed'?'bg-emerald-400':item.status==='failed'?'bg-red-400':'bg-amber-400')
    : 'bg-violet-400';
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-border/20 last:border-0">
      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${col}`}/>
      <p className="flex-1 text-xs text-foreground/70 truncate min-w-0">
        {type==='task' ? (item.task_type||'task') : (item.description?.slice(0,55)||item.change_type)}
      </p>
      <span className="text-[9px] text-muted-foreground/35 shrink-0">{ago(item.created_at)}</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MISSION CONTROL — PRESIDENTIAL COMMAND CENTER
════════════════════════════════════════════════════════ */
export default function MissionControl() {
  const navigate = useNavigate();
  const { projects: authProjects } = useAuth();
  const { selectedProjectId, setSelectedProjectId } = useProject();

  const [data,         setData]         = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [selectedId,   setSelectedId]   = useState<string>('');
  const [selectedIntel,setSelectedIntel]= useState<any>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [liveMode,     setLiveMode]     = useState(true);
  const [approving,    setApproving]    = useState<Set<string>>(new Set());
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState('');
  const [showApprovals,setShowApprovals]= useState(false);
  const autoRef = useRef<ReturnType<typeof setInterval>>();

  const showToast = (msg:string) => { setToast(msg); setTimeout(()=>setToast(''),3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await callEngine('get_launchpad_intel');
      if (d.success) setData(d);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    autoRef.current = setInterval(() => { if (liveMode) load(); }, 90000);
    return () => clearInterval(autoRef.current);
  }, [load, liveMode]);

  /* Auto-select first project */
  useEffect(() => {
    if (!data?.projectStats?.length || selectedId) return;
    const active = data.projectStats.find((p:any) => p.status !== 'archived');
    if (active) setSelectedId(active.id);
  }, [data]);

  /* Load project intel when selection changes */
  useEffect(() => {
    if (!selectedId) return;
    setIntelLoading(true);
    callEngine('get_project_intel', { project_id: selectedId })
      .then(d => { setSelectedIntel(d); setIntelLoading(false); })
      .catch(() => setIntelLoading(false));
  }, [selectedId]);

  const approveAll = async (projectId: string, projectName: string) => {
    const pending = data?.pendingLearnings?.filter((l:any) => l.project_id === projectId) || [];
    if (!pending.length) return;
    setApproving(prev => new Set([...prev, projectId]));
    let n = 0;
    for (const l of pending) { const r = await callEngine('approve_learning',{id:l.id}); if(r.updated) n++; }
    showToast(`✓ ${n} learnings approved for ${projectName}`);
    await load();
    setApproving(prev => { const s=new Set(prev); s.delete(projectId); return s; });
  };

  const approveSingle = async (id:string) => {
    await callEngine('approve_learning',{id});
    setData((prev:any) => ({
      ...prev,
      pendingLearnings: prev.pendingLearnings.filter((l:any)=>l.id!==id),
      totals: {...prev.totals, pendingApprovals: (prev.totals.pendingApprovals||1)-1},
    }));
  };
  const rejectSingle = async (id:string) => {
    await callEngine('reject_learning',{id});
    setData((prev:any) => ({
      ...prev,
      pendingLearnings: prev.pendingLearnings.filter((l:any)=>l.id!==id),
      totals: {...prev.totals, pendingApprovals: (prev.totals.pendingApprovals||1)-1},
    }));
  };

  const t = data?.totals || {};
  const allProjects: any[] = data?.projectStats || [];
  const activeProjects = allProjects.filter(p => p.status !== 'archived');
  const selectedProject = allProjects.find(p => p.id === selectedId);
  const avgBrain = activeProjects.length
    ? Math.round(activeProjects.reduce((s,p) => s+p.brainScore,0)/activeProjects.length) : 0;

  return (
    <div className="min-h-screen bg-[#030810] text-foreground" style={{fontFamily:'system-ui,sans-serif'}}>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-card border border-border shadow-xl text-sm text-foreground max-w-md text-center">
          {toast}
        </div>
      )}

      {/* ═══ VITAL STRIP ═══ */}
      <div className="sticky top-0 z-30 border-b border-border/50 bg-[#030810]/95 backdrop-blur-md">
        <div className="flex items-center gap-0.5 px-3 sm:px-5 py-2 max-w-[1800px] mx-auto overflow-x-auto">
          {/* Brand */}
          <div className="flex items-center gap-2 mr-4 shrink-0">
            <div className="h-7 w-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Rocket className="h-3.5 w-3.5 text-amber-400"/>
            </div>
            <div className="hidden sm:block">
              <div className="text-xs font-bold leading-tight">Mission Control</div>
              <div className="text-[9px] text-muted-foreground/40 font-mono leading-tight">SEO SEASON</div>
            </div>
          </div>

          {/* Vitals */}
          <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
            <Vital icon={Globe}       label="Projects"        value={t.activeProjects}           sub={`${t.projects||0} total`}                color="text-sky-400"/>
            <Vital icon={Brain}       label="Brain Avg"       value={loading?'…':avgBrain}       sub="quality score"                           color={scoreColor(avgBrain)}/>
            <Vital icon={CheckCircle2} label="Learnings"      value={t.activeLearnings}          sub={`${t.totalLearnings||0} total`}          color="text-emerald-400"/>
            <Vital icon={Clock}       label="Pending"         value={t.pendingApprovals}         sub="need review"                             color={t.pendingApprovals>0?'text-amber-400':'text-muted-foreground'} alert={t.pendingApprovals>0} onClick={()=>setShowApprovals(true)}/>
            <Vital icon={Cpu}         label="Algo Topics"     value={t.algoTopics}               sub="loaded"                                  color="text-violet-400" onClick={()=>navigate('/algorithm-intel')}/>
            <Vital icon={Activity}    label="Tasks Today"     value={t.todayTasks}               sub={`${t.taskCount||0} total`}               color="text-primary"    onClick={()=>navigate('/brain-command')}/>
            <Vital icon={Sparkles}    label="Inst. Memory"    value={t.institutionalKnowledge}   sub="global brain"                            color="text-indigo-400"/>
            <Vital icon={Target}      label="API Today"       value={t.todayCost?`$${Number(t.todayCost).toFixed(4)}`:'$0'} sub={`$${(t.totalCost||0).toFixed(2)} total`} color="text-rose-400"/>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5 ml-3 shrink-0">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-mono border ${liveMode?'border-emerald-500/30 bg-emerald-500/8 text-emerald-400':'border-border/50 text-muted-foreground/50'}`}>
              {liveMode && <Dot color="bg-emerald-400" pulse/>}
              {liveMode?'LIVE':'PAUSED'}
            </div>
            <button onClick={()=>setLiveMode(m=>!m)} className="h-7 w-7 rounded border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
              {liveMode?<EyeOff className="h-3 w-3"/>:<Eye className="h-3 w-3"/>}
            </button>
            <button onClick={load} disabled={loading} className="h-7 w-7 rounded border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
              <RefreshCw className={`h-3 w-3 ${loading?'animate-spin':''}`}/>
            </button>
          </div>
        </div>
      </div>

      {/* ═══ MAIN GRID ═══ */}
      <div className="max-w-[1800px] mx-auto px-3 sm:px-5 py-4">
        <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_280px] gap-4 h-[calc(100vh-140px)]">

          {/* COL 1 — Project signals */}
          <div className="flex flex-col gap-3 overflow-y-auto pr-1">
            <div className="flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-muted-foreground/70">PROJECTS ({activeProjects.length})</span>
              <button onClick={()=>navigate('/admin')} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                <Plus className="h-2.5 w-2.5"/>New
              </button>
            </div>

            {loading && !data && [1,2,3].map(i=>(
              <div key={i} className="h-36 rounded-xl border border-border/30 bg-card/20 animate-pulse"/>
            ))}

            {activeProjects.map(p => (
              <SignalCard key={p.id} p={p}
                selected={p.id===selectedId}
                onClick={()=>{setSelectedId(p.id);setSelectedProjectId(p.id);}}
                onApprove={()=>approveAll(p.id,p.name)}
                approving={approving.has(p.id)}/>
            ))}

            {!loading && activeProjects.length===0 && (
              <div className="text-center py-8 text-muted-foreground/40">
                <Rocket className="h-8 w-8 mx-auto mb-2 opacity-20"/>
                <p className="text-xs">No active projects</p>
                <button onClick={()=>navigate('/admin')} className="mt-2 text-xs text-primary hover:underline">Create one →</button>
              </div>
            )}

            {/* Archived projects */}
            {allProjects.some(p=>p.status==='archived') && (
              <div className="mt-1 pt-3 border-t border-border/30">
                <div className="text-[9px] font-mono text-muted-foreground/30 mb-2">ARCHIVED ({allProjects.filter(p=>p.status==='archived').length})</div>
                {allProjects.filter(p=>p.status==='archived').map(p=>(
                  <button key={p.id} onClick={()=>{setSelectedId(p.id);setSelectedProjectId(p.id);}}
                    className="w-full text-left px-3 py-2 rounded-lg border border-border/20 bg-card/20 text-xs text-muted-foreground/50 hover:text-foreground/70 hover:bg-card/40 transition-all mb-1.5 flex items-center gap-2">
                    <Archive className="h-3 w-3 shrink-0"/>
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* COL 2 — Selected project detail */}
          <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden flex flex-col">
            {!selectedProject && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/30 gap-2">
                <Rocket className="h-12 w-12 opacity-20"/>
                <p className="text-sm">Select a project</p>
              </div>
            )}
            {intelLoading && (
              <div className="flex flex-col items-center justify-center h-full">
                <RefreshCw className="h-6 w-6 text-muted-foreground/30 animate-spin"/>
              </div>
            )}
            {selectedProject && !intelLoading && (
              <div className="p-4 h-full overflow-y-auto">
                <ProjectDetail
                  p={selectedProject}
                  intel={selectedIntel}
                  navigate={navigate}
                  onSave={()=>{}}
                  saving={saving}
                  onApproveAll={()=>approveAll(selectedProject.id, selectedProject.name)}
                  approving={approving.has(selectedProject.id)}/>
              </div>
            )}
          </div>

          {/* COL 3 — Operations + Approvals + Algo */}
          <div className="flex flex-col gap-3 overflow-y-auto">

            {/* Pending approvals summary */}
            {t.pendingApprovals > 0 && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Dot color="bg-amber-400" pulse/>
                    <span className="text-xs font-semibold text-amber-400">{t.pendingApprovals} Pending</span>
                  </div>
                  <button onClick={()=>setShowApprovals(true)} className="text-[10px] text-amber-400 hover:underline">Review all →</button>
                </div>
                <div className="space-y-1">
                  {(data?.pendingLearnings||[]).slice(0,3).map((l:any)=>{
                    const proj = activeProjects.find(p=>p.id===l.project_id);
                    return (
                      <div key={l.id} className="flex items-center gap-2 py-1 border-b border-amber-500/10 last:border-0">
                        <span className="text-[9px] text-foreground/70 truncate flex-1">{l.card_title||'Untitled'}</span>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={()=>approveSingle(l.id)} className="h-5 w-5 rounded flex items-center justify-center bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"><Check className="h-2.5 w-2.5"/></button>
                          <button onClick={()=>rejectSingle(l.id)}  className="h-5 w-5 rounded flex items-center justify-center bg-red-500/15 text-red-400 hover:bg-red-500/25"><X className="h-2.5 w-2.5"/></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Operations feed */}
            <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30">
                <Terminal className="h-3 w-3 text-primary/60"/>
                <span className="text-[10px] font-semibold text-muted-foreground/70">OPERATIONS</span>
                {liveMode && <Dot color="bg-primary/50" pulse/>}
              </div>
              <div className="px-3 py-1.5 max-h-44 overflow-y-auto">
                {(data?.recentTasks||[]).length===0 && <p className="text-xs text-muted-foreground/30 py-3 text-center">No recent operations</p>}
                {(data?.recentTasks||[]).map((t:any)=><FeedItem key={t.id} item={t} type="task"/>)}
              </div>
            </div>

            {/* Algorithm watch */}
            <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <Cpu className="h-3 w-3 text-violet-400/60"/>
                  <span className="text-[10px] font-semibold text-muted-foreground/70">ALGO INTEL</span>
                </div>
                <button onClick={()=>navigate('/algorithm-intel')} className="text-[9px] text-primary hover:underline">manage →</button>
              </div>
              <div className="px-3 py-1.5 max-h-36 overflow-y-auto">
                {(data?.algoTopics||[]).length===0 && <p className="text-xs text-muted-foreground/30 py-2 text-center">No topics loaded</p>}
                {(data?.algoTopics||[]).map((a:any)=>(
                  <div key={a.id} className="flex items-center gap-2 py-1.5 border-b border-border/20 last:border-0">
                    <Radio className="h-2.5 w-2.5 text-violet-400/50 shrink-0"/>
                    <span className="text-[10px] text-foreground/65 truncate flex-1">{a.topic}</span>
                    <span className="text-[9px] text-muted-foreground/30 shrink-0">{ago(a.updated_at)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* System log */}
            <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30">
                <Shield className="h-3 w-3 text-muted-foreground/40"/>
                <span className="text-[10px] font-semibold text-muted-foreground/70">SYSTEM LOG</span>
              </div>
              <div className="px-3 py-1.5 max-h-36 overflow-y-auto">
                {(data?.recentLogs||[]).length===0 && <p className="text-xs text-muted-foreground/30 py-2 text-center">No events</p>}
                {(data?.recentLogs||[]).map((l:any)=><FeedItem key={l.id} item={l} type="log"/>)}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ COMMAND STRIP ═══ */}
        <div className="mt-4 flex items-center gap-2 flex-wrap pb-2">
          <span className="text-[9px] font-mono text-muted-foreground/30 mr-1">DIRECT →</span>
          {[
            {l:'Canvas',         href:'/playground',     icon:Layers,   col:'hover:border-primary/40 hover:text-primary'},
            {l:'Brain Command',  href:'/brain-command',  icon:Zap,      col:'hover:border-emerald-500/40 hover:text-emerald-400'},
            {l:'Run Audit',      href:'/audit',          icon:Activity, col:'hover:border-violet-500/40 hover:text-violet-400'},
            {l:'Brain Learning', href:'/brain-learning', icon:Brain,    col:'hover:border-sky-500/40 hover:text-sky-400'},
            {l:'Data Room',      href:'/data-room',      icon:Database, col:'hover:border-cyan-500/40 hover:text-cyan-400'},
            {l:'Algorithm Intel',href:'/algorithm-intel',icon:Cpu,      col:'hover:border-rose-500/40 hover:text-rose-400'},
            {l:'Review Pending', href:'',                icon:Clock,    col:'hover:border-amber-500/40 hover:text-amber-400', action:()=>setShowApprovals(true)},
            {l:'Admin',          href:'/admin',          icon:Shield,   col:'hover:border-zinc-500/40 hover:text-zinc-400'},
          ].map(({l,href,icon:Icon,col,action})=>(
            <button key={l} onClick={()=>action?action():navigate(href)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 text-[11px] text-muted-foreground/60 transition-all ${col}`}>
              <Icon className="h-3 w-3"/>{l}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ APPROVALS DRAWER ═══ */}
      {showApprovals && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={()=>setShowApprovals(false)}/>
          <div className="fixed right-0 top-0 bottom-0 z-50 w-[420px] max-w-full bg-card border-l border-border flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400"/>
                <span className="text-sm font-semibold">Pending Approvals</span>
                <span className="text-xs text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5">
                  {data?.pendingLearnings?.length||0}
                </span>
              </div>
              <button onClick={()=>setShowApprovals(false)}><X className="h-4 w-4 text-muted-foreground"/></button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border/40">
              {(data?.pendingLearnings||[]).length===0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <CheckCircle2 className="h-10 w-10 opacity-20"/>
                  <p>All clear — no pending approvals</p>
                </div>
              ) : (data?.pendingLearnings||[]).map((l:any)=>{
                const proj = activeProjects.find(p=>p.id===l.project_id);
                return (
                  <div key={l.id} className="px-5 py-3 hover:bg-secondary/15 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{l.card_title||'Untitled'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {proj && <span className="text-[10px] text-muted-foreground/50">{proj.name}</span>}
                          <span className="text-[9px] font-mono text-muted-foreground/35 bg-secondary/40 px-1 py-0.5 rounded">{l.card_type}</span>
                          {l.auto_captured && <span className="text-[9px] text-violet-400/55">auto</span>}
                          {l.confidence_score && <span className="text-[9px] text-muted-foreground/35">{l.confidence_score}%</span>}
                        </div>
                        {l.improvement && <p className="text-xs text-muted-foreground/55 line-clamp-2 mt-1">{l.improvement}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={()=>approveSingle(l.id)} className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center transition-colors"><Check className="h-3.5 w-3.5"/></button>
                        <button onClick={()=>rejectSingle(l.id)}  className="h-7 w-7 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-colors"><X className="h-3.5 w-3.5"/></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {(data?.pendingLearnings||[]).length>0 && (
              <div className="px-5 py-4 border-t border-border bg-card/80 flex gap-2">
                <button onClick={async()=>{
                  const all=data?.pendingLearnings||[];
                  let n=0;
                  for(const l of all){await callEngine('approve_learning',{id:l.id});n++;}
                  showToast(`✓ ${n} learnings approved`);
                  await load();
                  setShowApprovals(false);
                }} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm font-medium hover:bg-emerald-500/18 transition-colors">
                  <Check className="h-3.5 w-3.5"/>Approve All ({data?.pendingLearnings?.length})
                </button>
                <button onClick={()=>navigate('/brain-learning')} className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary/40 transition-colors">
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
