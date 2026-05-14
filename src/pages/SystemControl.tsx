import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectSync } from '@/hooks/useProjectSync';
import PortalNav from '@/components/PortalNav';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Layers, RefreshCw, CheckCircle2, AlertTriangle, X,
  Clock, BarChart3, Zap, Brain, Settings, Shield,
  TrendingUp, FileText, ChevronRight, Sparkles, Star,
  Activity, Target, Calendar,
} from 'lucide-react';

interface SectionStatus {
  section: string; hasCache: boolean; stale: boolean;
  staleReason: string|null; lastUpdated: string|null; tokens: number;
}

interface SystemState {
  project:      { name:string; url:string; strategyDate:string };
  sectionStatus: SectionStatus[];
  staleCount:   number; freshCount: number;
  costs:        { total:number; saved:number; callCount:number; cachedCount:number };
  recentChanges: any[];
}

const SECTION_META: Record<string,{label:string;icon:any;color:string;description:string;affects:string[]}> = {
  strategy:  {label:'Strategy & Canvas',icon:Brain,   color:'#a78bfa',description:'Full 3-batch strategy, canvas blocks, KPI forecast',affects:['Playground canvas','All AI features']},
  pipeline:  {label:'Execution Pipeline',icon:Target, color:'#fb923c',description:'Critical path, dependencies, risk register',affects:['Pipeline tab']},
  agenda_1:  {label:'Week 1 Agenda',     icon:Calendar,color:'#60a5fa',description:'Client-facing week 1 plan',affects:['Canvas Week 1']},
  agenda_2:  {label:'Week 2 Agenda',     icon:Calendar,color:'#60a5fa',description:'Client-facing week 2 plan',affects:['Canvas Week 2']},
  agenda_3:  {label:'Week 3 Agenda',     icon:Calendar,color:'#60a5fa',description:'Client-facing week 3 plan',affects:['Canvas Week 3']},
  agenda_4:  {label:'Week 4 Agenda',     icon:Calendar,color:'#60a5fa',description:'Client-facing week 4 plan',affects:['Canvas Week 4']},
  agenda_5:  {label:'Backlog Agenda',    icon:Calendar,color:'#60a5fa',description:'Backlog review agenda',affects:['Canvas Backlog']},
};

const SONNET_COST = { input: 0.003, output: 0.015 };
const EST_TOKENS: Record<string,number> = {
  strategy: 9000, pipeline: 4500, agenda_1: 4000, agenda_2: 4000,
  agenda_3: 4000, agenda_4: 4000, agenda_5: 4000,
};

function estimateCost(section: string): string {
  const t = EST_TOKENS[section] || 3000;
  const c = (t/2/1000)*SONNET_COST.input + (t/2/1000)*SONNET_COST.output;
  return `~$${c.toFixed(3)}`;
}

export default function SystemControl() {
  const { clients, projects } = useAuth();
  const [selProjId, setSelProjId] = useState('');
  const handleProjectChange = useProjectSync(selProjId, setSelProjId);
  const [state,     setState]     = useState<SystemState|null>(null);
  const [loading,   setLoading]   = useState(false);
  const [refreshing,setRefreshing] = useState<string|null>(null);

  const selProj = projects.find(p => p.id === selProjId);
  const client  = clients.find(c => c.id === selProj?.client_id);

  useEffect(() => {
    if (!selProjId) { setState(null); return; }
    loadState();
  }, [selProjId]);

  const loadState = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/control', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'get_state', projectId:selProjId }),
      });
      const data = await res.json();
      if (data.success) setState(data);
    } catch(e:any) { toast({title:'Failed to load system state',description:(e as Error).message,variant:'destructive'}); }
    setLoading(false);
  };

  const clearSection = async (section: string) => {
    if (!selProjId) return;
    await supabase.from('ai_content_cache').delete()
      .eq('project_id', selProjId).eq('content_type', section);
    await supabase.from('staleness_registry').delete()
      .eq('project_id', selProjId).eq('section', section);
    toast({ title: `${SECTION_META[section]?.label || section} cleared — will regenerate fresh` });
    loadState();
  };

  const markFresh = async (section: string) => {
    await supabase.from('staleness_registry').upsert({
      project_id: selProjId, section, stale: false, stale_reason: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,section' });
    loadState();
  };

  const healthScore = state ? Math.round(
    ((state.freshCount / Math.max(state.sectionStatus.length, 1)) * 100)
  ) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav
        companyName={client?.company ? `${client.company} — System Control` : 'System Control'}
        projects={projects} selectedProjectId={selProjId} onProjectChange={handleProjectChange}
      />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold mb-1 flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary"/>
            System Control Centre
          </h1>
          <p className="text-sm text-muted-foreground">
            Complete visibility into what AI knows, what it has generated, what is stale, and every API call made.
            You are in command of the entire system from here.
          </p>
        </div>

        {!selProjId && (
          <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
            <Activity className="h-12 w-12 text-primary/30 mx-auto mb-4"/>
            <h3 className="font-bold text-lg mb-3">Select a project to see its system state</h3>
            <select value={selProjId} onChange={e=>setSelProjId(e.target.value)} className="h-10 rounded-lg border border-border bg-background/60 text-sm px-4">
              <option value="">— Choose project —</option>
              {(clients||[]).filter((c:any)=>c?.id).map(c => {
                const cp = projects.filter(p=>p.client_id===c.id);
                if (!cp.length) return null;
                return <optgroup key={c.id} label={`${c.name} — ${c.company}`}>
                  {cp.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>;
              })}
            </select>
          </div>
        )}

        {selProjId && loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <RefreshCw size={16} className="animate-spin text-primary"/>Loading system state...
          </div>
        )}

        {selProjId && !loading && state && (
          <>
            {/* Health overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {label:'System Health',  val:`${healthScore}%`,           sub:`${state.freshCount} sections fresh`,    color:healthScore>=80?'text-green-400':healthScore>=50?'text-yellow-400':'text-red-400'},
                {label:'Stale Sections', val:String(state.staleCount),    sub:'need regeneration',                     color:state.staleCount>0?'text-yellow-400':'text-green-400'},
                {label:'Total API Cost', val:`$${state.costs.total.toFixed(3)}`,sub:`${state.costs.callCount} calls made`, color:'text-foreground'},
                {label:'Cost Saved',     val:`$${state.costs.saved.toFixed(3)}`,sub:`${state.costs.cachedCount} cache hits`, color:'text-green-400'},
              ].map(stat=>(
                <div key={stat.label} className="rounded-2xl border border-border bg-card/60 p-4 text-center">
                  <div className={`text-2xl font-black ${stat.color}`}>{stat.val}</div>
                  <div className="text-xs font-semibold text-foreground mt-1">{stat.label}</div>
                  <div className="text-xs text-muted-foreground">{stat.sub}</div>
                </div>
              ))}
            </div>

            {/* Section status grid */}
            <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-secondary/10">
                <Layers size={15} className="text-primary"/>
                <span className="font-bold">Generated Sections — Cache Status</span>
                <button onClick={loadState} className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <RefreshCw size={11}/>Refresh
                </button>
              </div>
              <div className="divide-y divide-border/50">
                {state.sectionStatus.map(sec => {
                  const meta = SECTION_META[sec.section];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  const statusColor = sec.stale ? 'text-yellow-400' : sec.hasCache ? 'text-green-400' : 'text-muted-foreground';
                  const statusText  = sec.stale ? 'Stale' : sec.hasCache ? 'Fresh' : 'Not generated';
                  const statusBg    = sec.stale ? 'bg-yellow-400/10 border-yellow-400/20' : sec.hasCache ? 'bg-green-400/10 border-green-400/20' : 'bg-secondary/30 border-border';

                  return (
                    <div key={sec.section} className="flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/10 transition-colors">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{background:`${meta.color}15`,border:`1px solid ${meta.color}25`}}>
                        <Icon size={13} style={{color:meta.color}}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{meta.label}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${statusBg} ${statusColor}`}>
                            {statusText}
                          </span>
                          {sec.stale && (
                            <span className="text-xs text-yellow-400/70 truncate">⚡ {sec.staleReason}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{meta.description}</span>
                          {sec.lastUpdated && <span>· {new Date(sec.lastUpdated).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>}
                          {sec.tokens > 0 && <span>· {sec.tokens.toLocaleString()} tokens used</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground font-mono">{estimateCost(sec.section)}</span>
                        {sec.stale && (
                          <button onClick={()=>markFresh(sec.section)} className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">
                            Dismiss
                          </button>
                        )}
                        {sec.hasCache && (
                          <button onClick={()=>clearSection(sec.section)} className="text-xs px-2 py-1 rounded border border-red-400/20 text-red-400/70 hover:text-red-400 hover:bg-red-400/10">
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Awareness report */}
            <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-secondary/10">
                <Brain size={15} className="text-primary"/>
                <span className="font-bold">What AI Currently Knows About This Project</span>
              </div>
              <div className="p-5">
                <AwarenessReport projectId={selProjId}/>
              </div>
            </div>

            {/* Recent changes */}
            {state.recentChanges.length > 0 && (
              <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-secondary/10">
                  <Clock size={15} className="text-primary"/>
                  <span className="font-bold">Change Log</span>
                  <span className="text-xs text-muted-foreground">Every data change that affects AI output</span>
                </div>
                <div className="divide-y divide-border/50">
                  {state.recentChanges.map(change=>(
                    <div key={change.id} className="flex items-start gap-3 px-5 py-3 hover:bg-secondary/10">
                      <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                        change.change_type==='data_room'?'bg-violet-400':
                        change.change_type==='metrics'?'bg-yellow-400':
                        change.change_type==='audit'?'bg-blue-400':
                        change.change_type==='document'?'bg-green-400':'bg-muted-foreground'
                      }`}/>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-foreground capitalize">{change.change_type?.replace('_',' ')}</span>
                          {change.field_path && <span className="text-muted-foreground font-mono">· {change.field_path}</span>}
                          {change.source_name && <span className="text-primary/70">· from: {change.source_name}</span>}
                          {change.source_date && <span className="text-muted-foreground">· data date: {change.source_date}</span>}
                        </div>
                        {(change.old_value || change.new_value) && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {change.old_value && <span className="line-through mr-1">{String(change.old_value).slice(0,40)}</span>}
                            {change.new_value && <span className="text-green-400">{String(change.new_value).slice(0,40)}</span>}
                          </div>
                        )}
                        {change.affects?.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {change.affects.map((a:string)=>(
                              <span key={a} className="text-xs px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">⚡ {a}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(change.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* API cost breakdown */}
            <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-secondary/10">
                <BarChart3 size={15} className="text-primary"/>
                <span className="font-bold">API Cost Tracker</span>
                <span className="text-xs text-muted-foreground ml-auto">Sonnet 4: $0.003/1k input · $0.015/1k output</span>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-center">
                    <div className="text-xl font-black text-red-400">${state.costs.total.toFixed(3)}</div>
                    <div className="text-xs text-muted-foreground">Total spent this project</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-center">
                    <div className="text-xl font-black text-green-400">${state.costs.saved.toFixed(3)}</div>
                    <div className="text-xs text-muted-foreground">Saved by cache hits</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-center">
                    <div className="text-xl font-black text-foreground">{state.costs.callCount}</div>
                    <div className="text-xs text-muted-foreground">{state.costs.cachedCount} cached · {state.costs.callCount - state.costs.cachedCount} live calls</div>
                  </div>
                </div>
                <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-yellow-400">Cost saving tip: </span>
                  Fill your Data Room completely before generating strategy. More complete data = shorter prompts = lower cost + higher quality output.
                  The input fingerprint system means if you regenerate with the same data, it serves from cache at zero cost.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Awareness Report: what AI actually knows right now ── */
function AwarenessReport({ projectId }: { projectId: string }) {
  const [awareness, setAwareness] = useState<any>(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    fetch('/api/control', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action: 'get_context', projectId }),
    }).then(r=>r.json()).then(d=>{
      setAwareness(d.context);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, [projectId]);

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw size={12} className="animate-spin"/>Loading awareness...</div>;
  if (!awareness) return <p className="text-sm text-muted-foreground">Could not load project context.</p>;

  const checks = [
    {label:'Campaign Goal',     known:!!awareness.goals?.primary,   value:awareness.goals?.primary||'Not set',       impact:'Without this: strategy has no direction'},
    {label:'CMS & Tech Stack',  known:!!awareness.tech?.cms,        value:awareness.tech?.cms||'Not recorded',        impact:'Without this: technical tasks are generic, not CMS-specific'},
    {label:'Analytics Baseline',known:!!awareness.analytics?.organicMonthly, value:awareness.analytics?.organicMonthly ? `${awareness.analytics.organicMonthly} sessions/mo` : 'Not recorded', impact:'Without this: cannot forecast realistic KPIs'},
    {label:'Technical State',   known:!!awareness.technical?.pagesIndexed, value:awareness.technical?.pagesIndexed ? `${awareness.technical.pagesIndexed} pages indexed` : 'Not recorded', impact:'Without this: technical priorities may be wrong'},
    {label:'Competitors',       known:!!awareness.competitors?.c1,  value:awareness.competitors?.c1||'Not recorded',  impact:'Without this: competitive analysis uses assumptions'},
    {label:'Live Metrics',      known:!!awareness.metrics,          value:awareness.metrics ? `Recorded ${new Date(awareness.metrics.recordedAt||'').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}` : 'No metrics entered', impact:'Without this: no score tracking or KPI comparison'},
    {label:'Audit Reports',     known:(awareness.audits?.length||0)>0, value:`${awareness.audits?.length||0} report(s) available`, impact:'Without audits: AI strategy is directional only, not evidence-based'},
    {label:'Uploaded Documents',known:(awareness.documents?.length||0)>0, value:`${awareness.documents?.length||0} document(s) uploaded`, impact:'Without tool exports: rankings and crawl data are estimated'},
  ];

  const score = Math.round((checks.filter(c=>c.known).length / checks.length) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-4">
        <div className={`text-3xl font-black ${score===100?'text-green-400':score>=70?'text-yellow-400':'text-red-400'}`}>{score}%</div>
        <div>
          <div className="font-semibold">AI Awareness Score</div>
          <div className="text-xs text-muted-foreground">{checks.filter(c=>c.known).length} of {checks.length} data points available</div>
        </div>
        <div className="ml-auto">
          <div className="h-2 w-32 rounded-full bg-secondary overflow-hidden">
            <div className={`h-full transition-all ${score===100?'bg-green-500':score>=70?'bg-yellow-500':'bg-red-500'}`} style={{width:`${score}%`}}/>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {checks.map((c,i)=>(
          <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${c.known?'border-green-400/15 bg-green-400/5':'border-red-400/15 bg-red-400/5'}`}>
            <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${c.known?'bg-green-500':'bg-red-500/20 border border-red-500/30'}`}>
              {c.known?<CheckCircle2 size={11} className="text-white"/>:<X size={10} className="text-red-400"/>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{c.label}</span>
                <span className="text-xs text-muted-foreground truncate">{c.value}</span>
              </div>
              {!c.known && <p className="text-xs text-red-400/70 mt-0.5">{c.impact}</p>}
            </div>
            {!c.known && (
              <a href="/data-room" className="text-xs text-primary hover:underline shrink-0">Fill →</a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
