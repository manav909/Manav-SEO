/**
 * THE OVAL — President Manav's Personal Command Suite
 *
 * This is not Mission Control. This is your office.
 * You see the empire. You direct people. You grant power. You take it back.
 * No pilot controls — presidential decisions only.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '@/contexts/AuthContext';
import { useProject }  from '@/contexts/ProjectContext';
import { supabase }    from '@/lib/supabase';
import {
  Crown, Shield, Users, Brain, Globe, ChevronRight,
  Plus, Check, RefreshCw, Activity, Clock,
  Rocket, Database, Cpu, Zap, Layers, BookOpen,
  Mail, Unlock, Lock, AlertTriangle, Sparkles,
} from 'lucide-react';

async function callEngine(a:string,b:Record<string,unknown>={}) {
  const r=await fetch('/api/task-engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:a,...b})});
  return r.json();
}

const greet=()=>{const h=new Date().getHours();return h<5?'Still at it, President Manav.':h<12?'Good morning, President Manav.':h<17?'Good afternoon, President Manav.':h<21?'Good evening, President Manav.':'Good night, President Manav.';};
const sc=(s:number)=>s>=80?'text-emerald-400':s>=60?'text-sky-400':s>=40?'text-amber-400':'text-red-400';
const sbg=(s:number)=>s>=80?'bg-emerald-500':s>=60?'bg-sky-500':s>=40?'bg-amber-500':'bg-red-500';

export default function Oval() {
  const navigate=useNavigate();
  const {user,clients,projects,refreshData}=useAuth();
  const {setSelectedProjectId}=useProject();

  const [data,       setData]       = useState<any>(null);
  const [profiles,   setProfiles]   = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [toast,      setToast]      = useState('');
  const [inviteEmail,setInvite]     = useState('');
  const [inviting,   setInviting]   = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [toggling,   setToggling]   = useState('');

  const showToast=(m:string)=>{setToast(m);setTimeout(()=>setToast(''),3000);};

  const load=useCallback(async()=>{
    setLoading(true);
    try {
      const [d,{data:profs}]=await Promise.all([
        callEngine('get_launchpad_intel'),
        supabase.from('profiles').select('*').order('created_at',{ascending:false}),
      ]);
      if(d&&(d.success||d.projectStats)) setData(d);
      if(profs) setProfiles(profs.filter((p:any)=>p?.id));
    } catch{}
    setLoading(false);
  },[]);

  useEffect(()=>{load();},[load]);

  const toggleAccess=async(profileId:string,approve:boolean)=>{
    setToggling(profileId);
    await supabase.from('profiles').update({approved:approve}).eq('id',profileId);
    setProfiles(prev=>prev.map(p=>p.id===profileId?{...p,approved:approve}:p));
    await refreshData();
    showToast(approve?'Access granted — they can now enter the empire.':'Access revoked.');
    setToggling('');
  };

  const doInvite=async()=>{
    if(!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const{data:ex}=await supabase.from('profiles').select('id,approved').eq('email',inviteEmail.trim()).maybeSingle();
      if(ex){
        if(!ex.approved){await supabase.from('profiles').update({approved:true}).eq('email',inviteEmail.trim());showToast(`Access granted to ${inviteEmail}`);}
        else showToast(`${inviteEmail} already has access.`);
      } else {
        await supabase.from('profiles').insert({id:crypto.randomUUID(),email:inviteEmail.trim(),approved:false});
        showToast(`${inviteEmail} will get access when they sign up.`);
      }
      setInvite(''); setShowInvite(false); await load();
    } catch(e:any){showToast('Error: '+e.message);}
    setInviting(false);
  };

  const t           = data?.totals||{};
  const allProjs    = data?.projectStats||[];
  const activeProjs = allProjs.filter((p:any)=>p.status!=='archived');
  const safeClients = (clients||[]).filter((c:any)=>c?.id);
  const safeProjs   = (projects||[]).filter((p:any)=>p?.id);
  const subs        = profiles.filter(p=>p.email!==user?.email);
  const active      = subs.filter(p=>p.approved).length;
  const avgBrain    = activeProjs.length?Math.round(activeProjs.reduce((s:any,p:any)=>s+p.brainScore,0)/activeProjs.length):0;
  const dateStr     = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  return (
    <div className="fixed inset-0 bg-[#030810] text-foreground overflow-hidden flex flex-col" style={{fontFamily:'system-ui,sans-serif'}}>
      {toast&&<div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-card border border-border shadow-xl text-sm max-w-md text-center">{toast}</div>}

      {/* ═══ HEADER — THE OVAL ═══ */}
      <div className="shrink-0 px-6 py-4 border-b border-amber-500/10 bg-gradient-to-r from-amber-500/8 via-transparent to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img src="/manav.jpg" alt="Manav"
                className="h-12 w-12 rounded-full object-cover ring-2 ring-amber-500/60 shrink-0"
                style={{objectPosition:'center 20%'}}
                onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-[#030810] flex items-center justify-center ring-1 ring-amber-500/40">
                <Crown className="h-3 w-3 text-amber-400"/>
              </div>
            </div>
            <div>
              <div className="text-amber-300 font-bold text-base tracking-wide">{greet()}</div>
              <div className="text-xs text-muted-foreground/40 font-mono mt-0.5">{dateStr}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={()=>navigate('/mission-control')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-500/25 bg-amber-500/8 text-amber-400 text-xs hover:bg-amber-500/15 transition-colors">
              <Rocket className="h-3.5 w-3.5"/>Mission Control
            </button>
            <button onClick={load} disabled={loading} className="h-9 w-9 rounded-xl border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>
            </button>
          </div>
        </div>
      </div>

      {/* ═══ EMPIRE VITALS ═══ */}
      <div className="shrink-0 grid grid-cols-4 sm:grid-cols-8 gap-px bg-border/15">
        {[
          {l:'CLIENTS',    v:safeClients.length,    c:'text-violet-400', icon:Users},
          {l:'PROJECTS',   v:safeProjs.length,      c:'text-sky-400',    icon:Globe},
          {l:'BRAIN AVG',  v:loading?'…':avgBrain,  c:sc(avgBrain),      icon:Brain},
          {l:'LEARNINGS',  v:t.activeLearnings??'—',c:'text-emerald-400',icon:BookOpen},
          {l:'PENDING',    v:t.pendingApprovals??'—',c:t.pendingApprovals>0?'text-amber-400':'text-muted-foreground',icon:Clock},
          {l:'TASKS TODAY',v:t.todayTasks??'—',     c:'text-primary',    icon:Activity},
          {l:'STAFF',      v:active,                c:'text-indigo-400', icon:Shield},
          {l:'ALGO TOPICS',v:t.algoTopics??'—',     c:'text-rose-400',   icon:Cpu},
        ].map(({l,v,c,icon:Icon})=>(
          <div key={l} className="bg-[#030810] px-3 py-3">
            <div className="flex items-center gap-1 mb-1">
              <Icon className={`h-2.5 w-2.5 ${c}`}/>
              <span className="text-[8px] font-mono text-muted-foreground/35 uppercase tracking-widest">{l}</span>
            </div>
            <div className={`text-xl font-bold leading-none ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      {/* ═══ 3-COLUMN GRID ═══ */}
      <div className="flex-1 grid grid-cols-3 gap-px bg-border/15 min-h-0">

        {/* COL 1 — Project Empire */}
        <div className="bg-[#030810] flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 shrink-0">
            <div className="flex items-center gap-2">
              <Rocket className="h-3 w-3 text-amber-400/60"/>
              <span className="text-[10px] font-semibold text-muted-foreground/60">PROJECT EMPIRE</span>
            </div>
            <button onClick={()=>navigate('/admin')} className="text-[9px] text-amber-400 hover:underline flex items-center gap-0.5"><Plus className="h-2.5 w-2.5"/>New</button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
            {activeProjs.map((p:any)=>{
              const s=p.brainScore??0, C=2*Math.PI*10;
              return (
                <button key={p.id}
                  onClick={()=>{setSelectedProjectId(p.id);navigate('/mission-control');}}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/20 bg-card/25 hover:bg-card/55 hover:border-amber-500/20 transition-all text-left">
                  <div className="relative w-8 h-8 shrink-0">
                    <svg className="w-8 h-8 -rotate-90" viewBox="0 0 28 28">
                      <circle cx="14" cy="14" r="10" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3"/>
                      <circle cx="14" cy="14" r="10" fill="none" className={`${sbg(s).replace('bg-','stroke-')}`} strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C*(1-s/100)}/>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-[9px] font-bold ${sc(s)}`}>{s}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{p.name}</p>
                    <p className="text-[9px] text-muted-foreground/40 truncate">{p.clientName||'—'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {p.pendingLearnings>0&&<span className="text-[8px] text-amber-400 font-mono">{p.pendingLearnings}▲</span>}
                    <ChevronRight className="h-3 w-3 text-muted-foreground/25"/>
                  </div>
                </button>
              );
            })}
            {!loading&&activeProjs.length===0&&(
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/25">
                <Globe className="h-8 w-8 mb-2 opacity-15"/><p className="text-xs">No projects yet</p>
                <button onClick={()=>navigate('/admin')} className="mt-1.5 text-xs text-amber-400 hover:underline">Create first →</button>
              </div>
            )}
          </div>
        </div>

        {/* COL 2 — Intelligence + Quick Directives */}
        <div className="bg-[#030810] flex flex-col min-h-0">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 shrink-0">
            <Brain className="h-3 w-3 text-primary/50"/>
            <span className="text-[10px] font-semibold text-muted-foreground/60">INTELLIGENCE & DIRECTIVES</span>
          </div>

          {/* Brain health bars — all projects at a glance */}
          <div className="px-3 py-3 border-b border-border/15 shrink-0">
            <div className="text-[9px] font-mono text-muted-foreground/30 mb-2">BRAIN QUALITY</div>
            <div className="space-y-2">
              {activeProjs.slice(0,5).map((p:any)=>(
                <div key={p.id} className="flex items-center gap-2">
                  <button onClick={()=>{setSelectedProjectId(p.id);navigate('/mission-control');}}
                    className="text-[10px] text-foreground/60 truncate w-24 text-left hover:text-primary transition-colors shrink-0">{p.name}</button>
                  <div className="flex-1 h-1 rounded-full bg-secondary/30 overflow-hidden">
                    <div className={`h-full rounded-full ${sbg(p.brainScore??0)} transition-all duration-700`} style={{width:`${p.brainScore??0}%`}}/>
                  </div>
                  <span className={`text-[9px] font-mono w-6 text-right shrink-0 ${sc(p.brainScore??0)}`}>{p.brainScore??0}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick directives */}
          <div className="px-3 py-3 border-b border-border/15 shrink-0">
            <div className="text-[9px] font-mono text-muted-foreground/30 mb-2">QUICK DIRECTIVES</div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                {l:'Strategy Canvas',  icon:Layers,    href:'/playground',     c:'hover:text-primary hover:border-primary/30'},
                {l:'Brain Command',    icon:Zap,       href:'/brain-command',  c:'hover:text-emerald-400 hover:border-emerald-500/30'},
                {l:'Run Audit',        icon:Activity,  href:'/audit',          c:'hover:text-violet-400 hover:border-violet-500/30'},
                {l:'Brain Learning',   icon:Brain,     href:'/brain-learning', c:'hover:text-sky-400 hover:border-sky-500/30'},
                {l:'Data Room',        icon:Database,  href:'/data-room',      c:'hover:text-cyan-400 hover:border-cyan-500/30'},
                {l:'Algorithm Intel',  icon:Cpu,       href:'/algorithm-intel',c:'hover:text-rose-400 hover:border-rose-500/30'},
              ].map(({l,icon:Icon,href,c})=>(
                <button key={l} onClick={()=>navigate(href)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border/30 text-[10px] text-muted-foreground/50 transition-all ${c}`}>
                  <Icon className="h-3 w-3 shrink-0"/>{l}
                </button>
              ))}
            </div>
          </div>

          {/* Recent ops */}
          <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
            <div className="text-[9px] font-mono text-muted-foreground/30 mb-2">RECENT OPERATIONS</div>
            {(data?.recentTasks||[]).slice(0,8).map((t:any)=>(
              <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-border/10 last:border-0">
                <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${t.status==='completed'?'bg-emerald-400':t.status==='failed'?'bg-red-400':'bg-amber-400'}`}/>
                <p className="flex-1 text-[10px] text-foreground/55 truncate">{t.task_type||'task'}</p>
                <span className="text-[9px] text-muted-foreground/25">
                  {t.created_at?new Date(t.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'—'}
                </span>
              </div>
            ))}
            {(data?.recentTasks||[]).length===0&&!loading&&(
              <p className="text-[10px] text-muted-foreground/25 text-center py-4">No operations yet</p>
            )}
          </div>
        </div>

        {/* COL 3 — Empire Access / Subordinates */}
        <div className="bg-[#030810] flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 shrink-0">
            <div className="flex items-center gap-2">
              <Shield className="h-3 w-3 text-indigo-400/60"/>
              <span className="text-[10px] font-semibold text-muted-foreground/60">EMPIRE ACCESS</span>
            </div>
            <button onClick={()=>setShowInvite(v=>!v)}
              className={`text-[9px] flex items-center gap-1 px-2 py-1 rounded border transition-colors ${showInvite?'border-indigo-500/40 bg-indigo-500/10 text-indigo-400':'border-border/30 text-muted-foreground/50 hover:text-indigo-400'}`}>
              <Plus className="h-2.5 w-2.5"/>Grant Access
            </button>
          </div>

          {/* Invite form */}
          {showInvite&&(
            <div className="px-3 py-3 border-b border-indigo-500/15 bg-indigo-500/5 shrink-0">
              <div className="text-[9px] text-indigo-400/60 font-mono mb-2">GRANT EMPIRE ACCESS</div>
              <div className="flex gap-2">
                <input value={inviteEmail} onChange={e=>setInvite(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doInvite()}
                  placeholder="email@domain.com"
                  className="flex-1 h-8 rounded-lg border border-border/40 bg-background/60 px-2.5 text-xs outline-none focus:border-indigo-400/50"/>
                <button onClick={doInvite} disabled={inviting||!inviteEmail.trim()}
                  className="h-8 px-3 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-xs hover:bg-indigo-500/30 disabled:opacity-40 transition-colors">
                  {inviting?<RefreshCw className="h-3 w-3 animate-spin"/>:'Grant'}
                </button>
              </div>
            </div>
          )}

          {/* President */}
          <div className="px-3 py-2.5 border-b border-border/15 shrink-0">
            <div className="text-[9px] font-mono text-amber-400/40 mb-2">PRESIDENT</div>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-amber-500/20 border-2 border-amber-500/50 flex items-center justify-center text-sm font-bold text-amber-300 shrink-0">M</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-amber-300">Manav</p>
                <p className="text-[9px] text-muted-foreground/35 truncate">{user?.email}</p>
              </div>
              <Crown className="h-4 w-4 text-amber-400 shrink-0"/>
            </div>
          </div>

          {/* Subordinates */}
          <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
            {subs.length===0?(
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/20 gap-2">
                <Users className="h-8 w-8 opacity-20"/>
                <p className="text-xs">No subordinates yet</p>
                <button onClick={()=>setShowInvite(true)} className="text-[10px] text-indigo-400 hover:underline">Grant first access →</button>
              </div>
            ):(
              <>
                <div className="text-[9px] font-mono text-muted-foreground/30 mb-2">STAFF ({active} active · {subs.length-active} pending)</div>
                {subs.map(sub=>(
                  <div key={sub.id} className="flex items-center gap-2.5 py-2.5 border-b border-border/15 last:border-0">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${sub.approved?'bg-primary/20 text-primary':'bg-secondary/40 text-muted-foreground/40'}`}>
                      {(sub.email||'?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{sub.email}</p>
                      <p className={`text-[9px] font-mono ${sub.approved?'text-emerald-400':'text-muted-foreground/35'}`}>
                        {sub.approved?'ACTIVE':'PENDING'}
                      </p>
                    </div>
                    <button
                      onClick={()=>toggleAccess(sub.id,!sub.approved)}
                      disabled={toggling===sub.id}
                      className={`h-6 px-2 rounded text-[9px] font-mono transition-colors disabled:opacity-50 ${
                        sub.approved
                          ?'bg-red-500/8 border border-red-500/20 text-red-400 hover:bg-red-500/18'
                          :'bg-emerald-500/8 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/18'
                      }`}>
                      {toggling===sub.id?<RefreshCw className="h-2.5 w-2.5 animate-spin"/>:sub.approved?<Lock className="h-2.5 w-2.5"/>:<Unlock className="h-2.5 w-2.5"/>}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Access summary */}
          <div className="px-3 py-2.5 border-t border-border/15 shrink-0">
            <div className="grid grid-cols-2 gap-2">
              {[{l:'Active Staff',v:active,c:'text-emerald-400'},{l:'Pending',v:subs.length-active,c:subs.length-active>0?'text-amber-400':'text-muted-foreground/35'}].map(({l,v,c})=>(
                <div key={l} className="rounded-lg bg-secondary/20 border border-border/30 p-2 text-center">
                  <div className={`text-base font-bold ${c}`}>{v}</div>
                  <div className="text-[9px] text-muted-foreground/35 mt-0.5">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
