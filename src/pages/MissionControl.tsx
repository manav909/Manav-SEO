/**
 * MISSION CONTROL — Operational command. Projects. Brain. Operations.
 * Fixed viewport — no scrolling. Everything the president delegated here.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject }  from '@/contexts/ProjectContext';
import { useAuth }     from '@/contexts/AuthContext';
import {
  Rocket, Brain, Activity, Clock, CheckCircle2, AlertTriangle,
  RefreshCw, ChevronRight, Shield, X, Check,
  Cpu, Eye, EyeOff, Terminal, Radio, Globe, Database,
  Zap, Layers, BookOpen, Plus, Target, Send,
} from 'lucide-react';

async function callEngine(action: string, body: Record<string,unknown> = {}) {
  const r = await fetch('/api/task-engine', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action, ...body }),
  });
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
const sbd = (s:number) => s>=80?'border-emerald-500/25':s>=60?'border-sky-500/25':s>=40?'border-amber-500/25':'border-red-500/30';

function Dot({color='bg-emerald-400',pulse=false}:{color?:string;pulse?:boolean}) {
  return (
    <span className="relative flex shrink-0 h-1.5 w-1.5">
      {pulse&&<span className={`animate-ping absolute h-full w-full rounded-full ${color} opacity-50`}/>}
      <span className={`relative rounded-full h-1.5 w-1.5 ${color}`}/>
    </span>
  );
}

function Vital({icon:Icon,label,value,sub,color,alert,onClick}:any) {
  return (
    <button onClick={onClick} className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-lg border transition-all text-left ${
      alert?'border-amber-500/40 bg-amber-500/8 hover:bg-amber-500/12'
           :'border-border/40 bg-card/30 hover:border-primary/30'
    } ${onClick?'cursor-pointer':'cursor-default'}`}>
      <div className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${color||'text-muted-foreground/50'}`}/>
        <span className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest">{label}</span>
      </div>
      <div className={`text-lg font-bold leading-none mt-0.5 ${color||'text-foreground'}`}>{value??'—'}</div>
      {sub&&<div className="text-[9px] text-muted-foreground/35 leading-none mt-0.5">{sub}</div>}
    </button>
  );
}

function ProjectCard({p,selected,onClick,onApprove,approving}:any) {
  const score=p.brainScore??0, C=2*Math.PI*18;
  const stale=p.lastActivity&&(Date.now()-new Date(p.lastActivity).getTime())>7*86400000;
  return (
    <button onClick={onClick} className={`w-full rounded-xl border p-3.5 text-left transition-all ${selected?`${sbd(score)} bg-card/90 shadow-md`:`${sbd(score)} bg-card/40 hover:bg-card/70`}`}>
      <div className="flex items-start gap-2 mb-2.5">
        <div className="relative w-11 h-11 shrink-0">
          <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5"/>
            <circle cx="22" cy="22" r="18" fill="none" className={`${sbg(score).replace('bg-','stroke-')}`} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C*(1-score/100)} style={{transition:'stroke-dashoffset 1s ease'}}/>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-[10px] font-bold ${sc(score)}`}>{score}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="text-sm font-semibold truncate">{p.name}</div>
          <div className="text-[10px] text-muted-foreground/45 truncate">{p.clientName||'—'}</div>
        </div>
        {!stale&&<Dot color="bg-emerald-400" pulse/>}
        {stale&&<Dot color="bg-amber-400/50"/>}
      </div>
      <div className="grid grid-cols-3 gap-1 mb-2">
        {[{v:p.activeLearnings,l:'learn',w:p.activeLearnings<10},{v:p.pendingLearnings,l:'pend',w:p.pendingLearnings>0},{v:p.taskCount,l:'tasks',w:false}].map(({v,l,w})=>(
          <div key={l} className={`rounded py-1 text-center ${w?'bg-amber-500/8':''}`}>
            <div className={`text-sm font-bold leading-none ${w?'text-amber-400':''}`}>{v}</div>
            <div className="text-[8px] text-muted-foreground/35 mt-0.5">{l}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 min-h-[16px]">
        {!p.cms&&<span className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-mono">NO CMS</span>}
        {!p.goals&&<span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">NO GOALS</span>}
        {!p.keywords?.length&&<span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">NO KW</span>}
        {stale&&<span className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 font-mono">STALE</span>}
        {score>=80&&<span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">OPTIMAL</span>}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/25">
        <span className="text-[9px] text-muted-foreground/30">{ago(p.lastActivity)}</span>
        {p.pendingLearnings>0&&(
          <button onClick={e=>{e.stopPropagation();onApprove();}} disabled={approving}
            className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/18 font-mono disabled:opacity-50">
            {approving?<RefreshCw className="h-2.5 w-2.5 animate-spin"/>:<Clock className="h-2.5 w-2.5"/>}
            {p.pendingLearnings}▲
          </button>
        )}
      </div>
    </button>
  );
}

function ProjectDetail({p,intel,navigate,onApproveAll,approving}:any) {
  const learnings=intel?.learnings||[], active=learnings.filter((l:any)=>l.status==='active').length, pending=learnings.filter((l:any)=>l.status==='pending_review').length;
  const [q,setQ]=useState(''), [ans,setAns]=useState(''), [asking,setAsking]=useState(false);
  const score=p.brainScore??0;
  const gaps:string[]=[];
  if(!p.cms)               gaps.push('CMS not set');
  if(!p.keywords?.length)  gaps.push('No keywords');
  if(!p.goals)             gaps.push('No goals');
  if(active<10)            gaps.push(`${active} learnings (target 20)`);

  const ask=async(query:string)=>{
    if(!query.trim()||asking) return;
    setAsking(true); setAns(''); setQ('');
    try {
      const res=await fetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({mode:'chat',question:query,projectSummary:`Project: ${p.name} | CMS: ${p.cms||'Not set'} | Keywords: ${(p.keywords||[]).slice(0,5).join(', ')||'Not set'}`,brainAssistantContext:{projectContext:{projectId:p.id,...p},learnings:[],algoItems:[],canvasBlocks:[],history:[]}})});
      if(!res.ok||!res.body) throw new Error();
      const r=res.body.getReader(), d=new TextDecoder(); let f='';
      while(true){const{done,value}=await r.read();if(done)break;f+=d.decode(value);setAns(f);}
    } catch{setAns('Brain unavailable.');}
    setAsking(false);
  };

  return (
    <div className="flex flex-col h-full gap-3 overflow-hidden">
      <div className="flex items-center gap-3 shrink-0">
        <div className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${sbd(score)}`}>
          <span className={`text-sm font-bold ${sc(score)}`}>{score}</span>
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-sm truncate">{p.name}</h2>
          <p className="text-xs text-muted-foreground/50">{p.clientName||'—'}</p>
        </div>
      </div>

      <div className="shrink-0">
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className={`h-full rounded-full ${sbg(score)} transition-all duration-1000`} style={{width:`${score}%`}}/>
        </div>
        {gaps.length>0&&(
          <div className="flex flex-wrap gap-1 mt-1.5">
            {gaps.map(g=>(
              <span key={g} className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono">⚠ {g}</span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5 shrink-0">
        {[{v:active,l:'Active Learnings',c:active>=20?'text-emerald-400':'text-amber-400'},{v:pending,l:'Pending Review',c:pending>0?'text-amber-400':'text-muted-foreground'},{v:intel?.deskItems?.length||0,l:'Desk Items',c:'text-sky-400'},{v:intel?.tasks?.length||0,l:'Tasks Run',c:'text-violet-400'}].map(({v,l,c})=>(
          <div key={l} className="rounded-lg bg-secondary/25 border border-border/40 p-2 text-center">
            <div className={`text-lg font-bold ${c}`}>{v}</div>
            <div className="text-[9px] text-muted-foreground/45 mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/40 bg-card/30 p-3 shrink-0 space-y-1.5">
        {[{k:'CMS',v:p.cms},{k:'Industry',v:p.industry},{k:'URL',v:p.url}].map(({k,v})=>(
          <div key={k} className="flex gap-2 text-xs">
            <span className="text-muted-foreground/35 font-mono w-14 shrink-0">{k}</span>
            {v?<span className="text-foreground/70 truncate">{v}</span>:<span className="italic text-muted-foreground/25">not set</span>}
          </div>
        ))}
        {p.keywords?.length>0&&(
          <div className="flex flex-wrap gap-1 pt-1">
            {(p.keywords||[]).slice(0,5).map((kw:string,i:number)=>(
              <span key={i} className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/65 border border-primary/20">{kw}</span>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 rounded-xl border border-primary/15 bg-card/40 flex flex-col overflow-hidden min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-primary/5 shrink-0">
          <Brain className="h-3 w-3 text-primary"/>
          <span className="text-xs font-semibold">Ask Brain</span>
        </div>
        {ans&&<div className="flex-1 px-3 py-2 overflow-y-auto"><pre className="text-xs text-foreground/70 whitespace-pre-wrap font-sans leading-relaxed">{ans}</pre></div>}
        {asking&&!ans&&<div className="flex gap-1.5 px-3 py-3 shrink-0">{[0,1,2].map(i=><div key={i} className="h-1.5 w-1.5 rounded-full bg-primary/40" style={{animation:`bounce 1.2s ease ${i*.2}s infinite`}}/>)}</div>}
        {!ans&&!asking&&(
          <div className="flex flex-wrap gap-1.5 px-3 py-2 flex-1">
            {['Fix first?','Top 3 priorities','Brain gaps?'].map(q2=>(
              <button key={q2} onClick={()=>ask(q2)} className="text-[10px] px-2 py-1 rounded-full border border-border bg-secondary/30 hover:border-primary/30 hover:text-primary transition-all text-muted-foreground">{q2}</button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 px-2.5 py-2 border-t border-border/25 shrink-0">
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask(q)} placeholder="Ask anything…" className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/30"/>
          <button onClick={()=>ask(q)} disabled={asking||!q.trim()} className="h-6 w-6 rounded bg-primary flex items-center justify-center text-primary-foreground hover:opacity-80 disabled:opacity-30 shrink-0 transition-opacity"><Send className="h-2.5 w-2.5"/></button>
        </div>
      </div>

      {pending>0&&(
        <button onClick={onApproveAll} disabled={approving} className="shrink-0 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/18 disabled:opacity-50 transition-colors">
          {approving?<RefreshCw className="h-3 w-3 animate-spin"/>:<Check className="h-3 w-3"/>}Approve {pending} pending
        </button>
      )}

      <div className="grid grid-cols-3 gap-1 shrink-0">
        {[{l:'Canvas',href:'/playground',icon:Layers},{l:'Learning',href:'/brain-learning',icon:Brain},{l:'Data Room',href:'/data-room',icon:Database},{l:'Audit',href:'/audit',icon:Activity},{l:'Brain Cmd',href:'/brain-command',icon:Zap},{l:'Algo Intel',href:'/algorithm-intel',icon:Cpu}].map(({l,href,icon:Icon})=>(
          <button key={l} onClick={()=>navigate(href)} className="flex flex-col items-center gap-1 py-2 rounded-lg border border-border/30 text-muted-foreground/50 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all">
            <Icon className="h-3.5 w-3.5"/><span className="text-[9px]">{l}</span>
          </button>
        ))}
      </div>
      <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

function FeedRow({item,type}:{item:any;type:'task'|'log'}) {
  const col=type==='task'?(item.status==='completed'?'bg-emerald-400':item.status==='failed'?'bg-red-400':'bg-amber-400'):'bg-violet-400';
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/15 last:border-0">
      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${col}`}/>
      <p className="flex-1 text-[10px] text-foreground/60 truncate">{type==='task'?(item.task_type||'task'):(item.description?.slice(0,55)||item.change_type)}</p>
      <span className="text-[9px] text-muted-foreground/30 shrink-0">{ago(item.created_at)}</span>
    </div>
  );
}

export default function MissionControl() {
  const navigate=useNavigate();
  const {selectedProjectId,setSelectedProjectId}=useProject();
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selectedId,setSelectedId]=useState('');
  const [selectedIntel,setSelectedIntel]=useState<any>(null);
  const [intelLoading,setIntelLoading]=useState(false);
  const [liveMode,setLiveMode]=useState(true);
  const [approving,setApproving]=useState(new Set<string>());
  const [toast,setToast]=useState('');
  const [showApprovals,setShowApprovals]=useState(false);
  const autoRef=useRef<ReturnType<typeof setInterval>>();

  const showToast=(msg:string)=>{setToast(msg);setTimeout(()=>setToast(''),3000);};

  const load=useCallback(async()=>{
    setLoading(true); setError('');
    try {
      const d=await callEngine('get_launchpad_intel');
      // Accept response whether or not it has explicit success flag
      if (d && (d.success || d.projectStats || d.totals)) {
        setData(d);
      } else if (d?.error) {
        setError(d.error);
      }
    } catch(e:any) {
      setError(e.message||'Failed to load');
    }
    setLoading(false);
  },[]);

  useEffect(()=>{
    load();
    autoRef.current=setInterval(()=>{if(liveMode)load();},90000);
    return()=>clearInterval(autoRef.current);
  },[load,liveMode]);

  useEffect(()=>{
    if(!data?.projectStats?.length||selectedId) return;
    const first=data.projectStats.find((p:any)=>p.status!=='archived');
    if(first) setSelectedId(first.id);
  },[data]);

  useEffect(()=>{
    if(!selectedId) return;
    setIntelLoading(true);
    callEngine('get_project_intel',{project_id:selectedId})
      .then(d=>{setSelectedIntel(d);setIntelLoading(false);})
      .catch(()=>setIntelLoading(false));
  },[selectedId]);

  const approveAll=async(projectId:string,name:string)=>{
    const pending=(data?.pendingLearnings||[]).filter((l:any)=>l.project_id===projectId);
    if(!pending.length) return;
    setApproving(prev=>new Set([...prev,projectId]));
    let n=0;
    for(const l of pending){const r=await callEngine('approve_learning',{id:l.id});if(r.updated)n++;}
    showToast(`✓ ${n} learnings approved for ${name}`);
    await load();
    setApproving(prev=>{const s=new Set(prev);s.delete(projectId);return s;});
  };

  const approveSingle=async(id:string)=>{
    await callEngine('approve_learning',{id});
    setData((prev:any)=>({...prev,pendingLearnings:prev.pendingLearnings.filter((l:any)=>l.id!==id),totals:{...prev.totals,pendingApprovals:Math.max(0,(prev.totals?.pendingApprovals||1)-1)}}));
  };
  const rejectSingle=async(id:string)=>{
    await callEngine('reject_learning',{id});
    setData((prev:any)=>({...prev,pendingLearnings:prev.pendingLearnings.filter((l:any)=>l.id!==id),totals:{...prev.totals,pendingApprovals:Math.max(0,(prev.totals?.pendingApprovals||1)-1)}}));
  };

  const t=data?.totals||{};
  const allProjs:any[]=data?.projectStats||[];
  const activeProjs=allProjs.filter(p=>p.status!=='archived');
  const selProj=allProjs.find(p=>p.id===selectedId);
  const avgBrain=activeProjs.length?Math.round(activeProjs.reduce((s,p)=>s+p.brainScore,0)/activeProjs.length):0;

  return (
    <div className="fixed inset-0 bg-[#030810] text-foreground overflow-hidden flex flex-col" style={{fontFamily:'system-ui,sans-serif'}}>
      {toast&&<div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-card border border-border shadow-xl text-sm max-w-md text-center">{toast}</div>}

      {/* ═══ VITAL STRIP ═══ */}
      <div className="border-b border-border/30 bg-[#030810]/95 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto">
          <div className="flex items-center gap-2 mr-4 shrink-0">
            <div className="h-7 w-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
              <Rocket className="h-3.5 w-3.5 text-amber-400"/>
            </div>
            <span className="text-xs font-bold hidden sm:block">Mission Control</span>
          </div>
          <Vital icon={Globe}       label="Projects"    value={t.activeProjects}       sub={`${t.projects||0} total`}         color="text-sky-400"/>
          <Vital icon={Brain}       label="Brain Avg"   value={loading?'…':avgBrain}   sub="quality"                          color={sc(avgBrain)}/>
          <Vital icon={CheckCircle2} label="Learnings"  value={t.activeLearnings}      sub={`${t.totalLearnings||0} total`}   color="text-emerald-400"/>
          <Vital icon={Clock}       label="Pending"     value={t.pendingApprovals}     sub="need review"                      color={t.pendingApprovals>0?'text-amber-400':'text-muted-foreground'} alert={t.pendingApprovals>0} onClick={()=>setShowApprovals(true)}/>
          <Vital icon={Cpu}         label="Algo"        value={t.algoTopics}           sub="topics"                           color="text-violet-400" onClick={()=>navigate('/algorithm-intel')}/>
          <Vital icon={Activity}    label="Today"       value={t.todayTasks}           sub="tasks"                            color="text-primary"/>
          <Vital icon={Target}      label="Cost Today"  value={t.todayCost?`$${Number(t.todayCost).toFixed(4)}`:'$0'} sub={`$${(t.totalCost||0).toFixed(2)} lifetime`} color="text-rose-400"/>
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-mono border ${liveMode?'border-emerald-500/25 bg-emerald-500/8 text-emerald-400':'border-border/40 text-muted-foreground/40'}`}>
              {liveMode&&<Dot color="bg-emerald-400" pulse/>}{liveMode?'LIVE':'PAUSED'}
            </div>
            <button onClick={()=>setLiveMode(m=>!m)} className="h-7 w-7 rounded border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              {liveMode?<EyeOff className="h-3 w-3"/>:<Eye className="h-3 w-3"/>}
            </button>
            <button onClick={load} disabled={loading} className="h-7 w-7 rounded border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className={`h-3 w-3 ${loading?'animate-spin':''}`}/>
            </button>
          </div>
        </div>
      </div>

      {/* ═══ ERROR STATE ═══ */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/8 border-b border-red-500/20 shrink-0">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0"/>
          <span className="text-xs text-red-400">{error}</span>
          <button onClick={load} className="ml-auto text-xs text-red-400 underline">Retry</button>
        </div>
      )}

      {/* ═══ 3-COLUMN GRID ═══ */}
      <div className="flex-1 grid grid-cols-[260px_1fr_260px] gap-px bg-border/15 min-h-0">

        {/* COL 1 — projects */}
        <div className="bg-[#030810] flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground/60">PROJECTS ({activeProjs.length})</span>
            <button onClick={()=>navigate('/admin')} className="text-[9px] text-primary hover:underline flex items-center gap-0.5"><Plus className="h-2.5 w-2.5"/>New</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {loading&&!data&&[1,2,3].map(i=><div key={i} className="h-36 rounded-xl border border-border/20 bg-card/15 animate-pulse"/>)}
            {activeProjs.map(p=>(
              <ProjectCard key={p.id} p={p} selected={p.id===selectedId}
                onClick={()=>{setSelectedId(p.id);setSelectedProjectId(p.id);}}
                onApprove={()=>approveAll(p.id,p.name)}
                approving={approving.has(p.id)}/>
            ))}
            {!loading&&activeProjs.length===0&&!error&&(
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/30">
                <Rocket className="h-8 w-8 mb-2 opacity-20"/>
                <p className="text-xs">No active projects</p>
              </div>
            )}
            {allProjs.filter(p=>p.status==='archived').map(p=>(
              <button key={p.id} onClick={()=>{setSelectedId(p.id);setSelectedProjectId(p.id);}}
                className="w-full text-left px-3 py-2 rounded-lg border border-border/15 bg-card/15 text-xs text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-card/30 transition-all flex items-center gap-2">
                <span className="text-[8px] text-zinc-500 font-mono">ARCH</span><span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* COL 2 — selected project */}
        <div className="bg-[#030810] flex flex-col min-h-0">
          {loading&&!data&&<div className="flex items-center justify-center h-full"><RefreshCw className="h-5 w-5 text-muted-foreground/30 animate-spin"/></div>}
          {!loading&&!selProj&&!error&&(
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/25 gap-2">
              <Rocket className="h-10 w-10 opacity-15"/>
              <p className="text-sm">Select a project</p>
            </div>
          )}
          {intelLoading&&<div className="flex items-center justify-center h-full"><RefreshCw className="h-5 w-5 text-muted-foreground/30 animate-spin"/></div>}
          {selProj&&!intelLoading&&(
            <div className="p-4 h-full overflow-hidden flex flex-col">
              <ProjectDetail p={selProj} intel={selectedIntel} navigate={navigate}
                onApproveAll={()=>approveAll(selProj.id,selProj.name)}
                approving={approving.has(selProj.id)}/>
            </div>
          )}
        </div>

        {/* COL 3 — ops + algo + log */}
        <div className="bg-[#030810] flex flex-col min-h-0">
          {/* Pending summary */}
          {t.pendingApprovals>0&&(
            <div className="px-3 py-2 border-b border-amber-500/15 bg-amber-500/5 shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5"><Dot color="bg-amber-400" pulse/><span className="text-[10px] font-semibold text-amber-400">{t.pendingApprovals} Pending</span></div>
                <button onClick={()=>setShowApprovals(true)} className="text-[9px] text-amber-400 hover:underline">all →</button>
              </div>
              {(data?.pendingLearnings||[]).slice(0,2).map((l:any)=>(
                <div key={l.id} className="flex items-center gap-1.5 py-1 border-b border-amber-500/10 last:border-0">
                  <span className="text-[9px] text-foreground/65 truncate flex-1">{l.card_title||'Untitled'}</span>
                  <button onClick={()=>approveSingle(l.id)} className="h-5 w-5 rounded flex items-center justify-center bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"><Check className="h-2.5 w-2.5"/></button>
                  <button onClick={()=>rejectSingle(l.id)}  className="h-5 w-5 rounded flex items-center justify-center bg-red-500/15 text-red-400 hover:bg-red-500/25"><X className="h-2.5 w-2.5"/></button>
                </div>
              ))}
            </div>
          )}

          {/* Ops */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/15 shrink-0">
            <Terminal className="h-3 w-3 text-primary/40"/><span className="text-[9px] font-semibold text-muted-foreground/55">OPERATIONS</span>
            {liveMode&&<Dot color="bg-primary/40" pulse/>}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-1.5 min-h-0">
            {(data?.recentTasks||[]).length===0&&!loading&&<p className="text-[10px] text-muted-foreground/25 py-3 text-center">No operations</p>}
            {(data?.recentTasks||[]).map((t:any)=><FeedRow key={t.id} item={t} type="task"/>)}
          </div>

          {/* Algo */}
          <div className="border-t border-border/15 shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/10">
              <div className="flex items-center gap-1.5"><Cpu className="h-3 w-3 text-violet-400/50"/><span className="text-[9px] font-semibold text-muted-foreground/50">ALGO INTEL</span></div>
              <button onClick={()=>navigate('/algorithm-intel')} className="text-[9px] text-primary hover:underline">→</button>
            </div>
            <div className="px-3 py-1.5 max-h-24 overflow-y-auto">
              {(data?.algoTopics||[]).slice(0,5).map((a:any)=>(
                <div key={a.id} className="flex items-center gap-2 py-1.5 border-b border-border/10 last:border-0">
                  <Radio className="h-2.5 w-2.5 text-violet-400/40 shrink-0"/>
                  <span className="text-[9px] text-foreground/55 truncate flex-1">{a.topic}</span>
                  <span className="text-[8px] text-muted-foreground/25">{ago(a.updated_at)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Log */}
          <div className="border-t border-border/15 shrink-0">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/10">
              <Shield className="h-3 w-3 text-muted-foreground/35"/><span className="text-[9px] font-semibold text-muted-foreground/50">SYSTEM LOG</span>
            </div>
            <div className="px-3 py-1.5 max-h-20 overflow-y-auto">
              {(data?.recentLogs||[]).slice(0,4).map((l:any)=><FeedRow key={l.id} item={l} type="log"/>)}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ COMMAND STRIP ═══ */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border/20 bg-[#030810] shrink-0 overflow-x-auto">
        <span className="text-[8px] font-mono text-muted-foreground/25 mr-1 shrink-0">DIRECT</span>
        {[
          {l:'Canvas',icon:Layers,   href:'/playground',     c:'hover:text-primary hover:border-primary/30'},
          {l:'Brain Cmd',icon:Zap,   href:'/brain-command',  c:'hover:text-emerald-400 hover:border-emerald-500/30'},
          {l:'Audit',  icon:Activity,href:'/audit',           c:'hover:text-violet-400 hover:border-violet-500/30'},
          {l:'Learning',icon:BookOpen,href:'/brain-learning',  c:'hover:text-sky-400 hover:border-sky-500/30'},
          {l:'Data Room',icon:Database,href:'/data-room',     c:'hover:text-cyan-400 hover:border-cyan-500/30'},
          {l:'Algo',   icon:Cpu,     href:'/algorithm-intel', c:'hover:text-rose-400 hover:border-rose-500/30'},
        ].map(({l,icon:Icon,href,c})=>(
          <button key={l} onClick={()=>navigate(href)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/30 text-[10px] text-muted-foreground/50 transition-all shrink-0 ${c}`}>
            <Icon className="h-3 w-3"/>{l}
          </button>
        ))}
      </div>

      {/* ═══ APPROVALS DRAWER ═══ */}
      {showApprovals&&(
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={()=>setShowApprovals(false)}/>
          <div className="fixed right-0 top-0 bottom-0 z-50 w-96 max-w-full bg-card border-l border-border flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400"/>
                <span className="text-sm font-semibold">Pending Approvals</span>
                <span className="text-xs text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5">{data?.pendingLearnings?.length||0}</span>
              </div>
              <button onClick={()=>setShowApprovals(false)}><X className="h-4 w-4 text-muted-foreground"/></button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border/30">
              {(data?.pendingLearnings||[]).length===0?(
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <CheckCircle2 className="h-10 w-10 opacity-20"/><p>All clear</p>
                </div>
              ):(data?.pendingLearnings||[]).map((l:any)=>{
                const proj=activeProjs.find(p=>p.id===l.project_id);
                return(
                  <div key={l.id} className="px-5 py-3 hover:bg-secondary/15 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{l.card_title||'Untitled'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {proj&&<span className="text-[9px] text-muted-foreground/45">{proj.name}</span>}
                          <span className="text-[9px] font-mono text-muted-foreground/30 bg-secondary/40 px-1 rounded">{l.card_type}</span>
                          {l.auto_captured&&<span className="text-[9px] text-violet-400/50">auto</span>}
                        </div>
                        {l.improvement&&<p className="text-xs text-muted-foreground/50 line-clamp-1 mt-1">{l.improvement}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={()=>approveSingle(l.id)} className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center"><Check className="h-3.5 w-3.5"/></button>
                        <button onClick={()=>rejectSingle(l.id)}  className="h-7 w-7 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 flex items-center justify-center"><X className="h-3.5 w-3.5"/></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {(data?.pendingLearnings||[]).length>0&&(
              <div className="px-5 py-4 border-t border-border bg-card/80 flex gap-2">
                <button onClick={async()=>{
                  const all=data?.pendingLearnings||[];let n=0;
                  for(const l of all){await callEngine('approve_learning',{id:l.id});n++;}
                  showToast(`✓ ${n} approved`);await load();setShowApprovals(false);
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
