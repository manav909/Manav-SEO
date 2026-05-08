import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import PortalNav from '@/components/PortalNav';
import {
  ChevronRight, Zap, Shield, TrendingUp,
  CheckCircle, Clock, BarChart3, Globe, Star,
  ArrowRight, Sparkles, Target, Trophy, Brain,
  ShieldCheck, RefreshCw, AlertTriangle,
  CheckCircle2, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

const fmt$ = (n: number) => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n}`;

const phaseColors: Record<number,{ring:string;glow:string;text:string;bg:string}> = {
  1: { ring:'#6366f1', glow:'shadow-[0_0_40px_rgba(99,102,241,0.3)]',  text:'text-primary',     bg:'bg-primary/10' },
  2: { ring:'#06b6d4', glow:'shadow-[0_0_40px_rgba(6,182,212,0.3)]',   text:'text-cyan-400',   bg:'bg-cyan-400/10' },
  3: { ring:'#8b5cf6', glow:'shadow-[0_0_40px_rgba(139,92,246,0.3)]',  text:'text-purple-400', bg:'bg-purple-400/10' },
  4: { ring:'#f59e0b', glow:'shadow-[0_0_40px_rgba(245,158,11,0.3)]',  text:'text-yellow-400', bg:'bg-yellow-400/10' },
  5: { ring:'#4ade80', glow:'shadow-[0_0_40px_rgba(74,222,128,0.3)]',  text:'text-green-400',  bg:'bg-green-400/10' },
};

const PhaseRing = ({ pct, phase }: { pct:number; phase:number }) => {
  const r=54, circ=2*Math.PI*r;
  const cfg = phaseColors[phase]||phaseColors[1];
  return (
    <div className="relative flex items-center justify-center">
      <svg className="h-40 w-40 -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="6"/>
        <circle cx="64" cy="64" r={r} fill="none" stroke={cfg.ring} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ*(1-pct/100)}
          style={{transition:'stroke-dashoffset 2s ease',filter:`drop-shadow(0 0 8px ${cfg.ring})`}}/>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{pct}%</span>
        <span className={`text-xs font-mono ${cfg.text} mt-0.5`}>complete</span>
      </div>
    </div>
  );
};

const PhaseTimeline = ({ current }: { current:number }) => {
  const phases = [
    {n:1,label:'Foundation'},{n:2,label:'Architecture'},
    {n:3,label:'Authority'},{n:4,label:'Validation'},{n:5,label:'Dominance'},
  ];
  return (
    <div className="flex items-center gap-0 w-full">
      {phases.map(({n,label},i) => {
        const done=n<current, active=n===current, cfg=phaseColors[n];
        return (
          <div key={n} className="flex items-center flex-1">
            <div className={`flex flex-col items-center gap-1.5 ${active?'scale-110':''} transition-transform`}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${done?'bg-green-400/20 border-green-400 text-green-400':active?`${cfg.bg} border-current ${cfg.text}`:'bg-background/40 border-border text-muted-foreground'}`}>
                {done?<CheckCircle className="h-4 w-4"/>:<span className="text-xs font-bold">{n}</span>}
              </div>
              <span className={`text-xs font-mono hidden sm:block ${active?cfg.text:done?'text-green-400':'text-muted-foreground'}`}>{label}</span>
            </div>
            {i<phases.length-1 && <div className={`flex-1 h-0.5 mx-1 ${n<current?'bg-green-400/40':'bg-border'}`}/>}
          </div>
        );
      })}
    </div>
  );
};

/* Value card — marks estimated values clearly */
const ValueCard = ({ icon:Icon, label, value, sub, color, estimated=false }: any) => (
  <div className="rounded-2xl border border-border bg-card/60 p-5">
    <div className="flex items-center gap-2 mb-3">
      <div className={`h-8 w-8 rounded-lg ${color} flex items-center justify-center shrink-0`}>
        <Icon className="h-4 w-4"/>
      </div>
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
      {estimated && (
        <span className="ml-auto text-xs text-yellow-400 font-mono bg-yellow-400/10 border border-yellow-400/20 rounded-full px-1.5 py-0.5 flex items-center gap-1">
          <AlertTriangle className="h-2.5 w-2.5"/>~est
        </span>
      )}
    </div>
    <div className="text-3xl font-bold mb-1">{value ?? '—'}</div>
    {sub && <p className="text-xs text-muted-foreground leading-relaxed">{sub}</p>}
  </div>
);

const AcceleratorCard = ({upsell,onApprove,approving}:{upsell:any;onApprove:()=>void;approving:boolean}) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden hover:border-primary/30 transition-all duration-300">
      <div className="h-0.5 w-full bg-gradient-to-r from-primary via-purple-400 to-cyan-400"/>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-mono text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                {upsell.opportunity_category}
              </span>
              <span className="text-xs text-muted-foreground font-mono bg-secondary/30 border border-border rounded-full px-2 py-0.5">
                AI-generated from real audit data
              </span>
            </div>
            <h3 className="font-bold text-lg">{upsell.opportunity_name}</h3>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold">{fmt$(upsell.investment_price)}</div>
            <div className="text-xs text-muted-foreground">{upsell.timeline}</div>
          </div>
        </div>

        <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-3.5 w-3.5 text-yellow-400 shrink-0"/>
            <span className="text-xs font-mono text-yellow-400 uppercase tracking-wider">Gap Identified From Your Audit</span>
          </div>
          <p className="text-sm">{upsell.ai_insight}</p>
        </div>

        <div className="rounded-xl border border-orange-400/20 bg-orange-400/5 p-3 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-3.5 w-3.5 text-orange-400 shrink-0"/>
            <span className="text-xs font-mono text-orange-400 uppercase tracking-wider">Cost of Inaction</span>
          </div>
          <p className="text-sm">{upsell.business_impact}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border border-border bg-background/40 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3 w-3 text-muted-foreground"/>
              <span className="text-xs text-muted-foreground font-mono">Standard Pace</span>
            </div>
            <p className="text-xs text-muted-foreground">{upsell.retainer_trajectory}</p>
          </div>
          <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="h-3 w-3 text-green-400"/>
              <span className="text-xs text-green-400 font-mono">Sprint Solution</span>
            </div>
            <p className="text-xs">{upsell.accelerator_solution}</p>
          </div>
        </div>

        {upsell.deliverables?.length > 0 && (
          <>
            <button onClick={() => setExpanded(e => !e)}
              className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors">
              <span className="font-mono uppercase tracking-wider">Deliverables ({upsell.deliverables.length})</span>
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded?'rotate-90':''}`}/>
            </button>
            {expanded && (
              <div className="space-y-1.5 mb-4">
                {upsell.deliverables.map((d:string,i:number) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5"/>
                    <span className="text-xs">{d}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <Button onClick={onApprove} disabled={approving}
          className="w-full h-11 bg-gradient-to-r from-primary to-purple-500 text-white font-semibold hover:opacity-90">
          {approving
            ? <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin"/>
            : <><Zap className="h-4 w-4 mr-2"/>{upsell.button_text||'Approve Accelerator Sprint'}</>}
        </Button>
      </div>
    </div>
  );
};

export default function Launchpad() {
  const navigate = useNavigate();
  const { clients:authClients, projects:authProjects, loading:authLoading, authChecked } = useAuth();

  const [client,       setClient]       = useState<any>(null);
  const [project,      setProject]      = useState<any>(null);
  const [projects,     setProjects]     = useState<any[]>([]);
  const [allClients,   setAllClients]   = useState<any[]>([]);
  const [dashboard,    setDashboard]    = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [approvingIdx, setApprovingIdx] = useState<number|null>(null);
  const [generatedAt,  setGeneratedAt]  = useState('');
  const [sourceAnalysis, setSourceAnalysis] = useState<string>('');

  useEffect(() => {
    if (!authChecked) return;
    try {
      const cList = authClients||[];
      const pList = authProjects||[];
      setAllClients(cList);
      setProjects(pList);
      setClient(cList[0]||null);
      if (pList.length) setProject(pList[0]);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [authChecked, authClients, authProjects]);

  useEffect(() => {
    if (!project) return;
    if (project.launchpad_data) {
      setDashboard(project.launchpad_data.dashboard?.executive_dashboard||null);
      setGeneratedAt(project.launchpad_generated_at||'');
    } else {
      setDashboard(null);
      setGeneratedAt('');
    }
    /* Show which analysis the launchpad was built from */
    if (project.last_analysis_at) {
      const d = new Date(project.last_analysis_at);
      setSourceAnalysis(d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}));
    }
  }, [project]);

  const handleProjectChange = (id: string) => {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    setProject(p);
    const c = allClients.find(x => x.id === p.client_id);
    if (c) setClient(c);
  };

  const approveAccelerator = async (idx: number, upsell: any) => {
    if (!project) return;
    setApprovingIdx(idx);
    const { error } = await supabase.from('upsells').insert({
      project_id:       project.id,
      title:            upsell.opportunity_name,
      description:      `${upsell.accelerator_solution}\n\nGap identified: ${upsell.ai_insight}`,
      price:            upsell.investment_price,
      potential_impact: upsell.business_impact,
      status:           'approved',
    });
    if (!error) toast({ title:'Sprint Approved!', description:'Manav will be in touch within 24 hours.' });
    else toast({ title:'Error', description:error.message, variant:'destructive' });
    setApprovingIdx(null);
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin"/>
        <p className="text-sm text-muted-foreground font-mono">Loading your strategy launchpad...</p>
      </div>
    </div>
  );

  if (!client) return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav/>
      <div className="flex items-center justify-center min-h-[80vh] p-6">
        <div className="max-w-md text-center rounded-2xl border border-border bg-card/60 p-10">
          <Clock className="h-10 w-10 text-primary/40 mx-auto mb-4"/>
          <h2 className="text-xl font-bold mb-2">Launchpad Being Prepared</h2>
          <p className="text-muted-foreground text-sm mb-6">Manav is setting up your strategy launchpad.</p>
          <Button variant="outline" onClick={() => navigate('/dashboard')} className="border-border">
            <BarChart3 className="h-4 w-4 mr-2"/>Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );

  const phaseNum = project?.current_phase||1;
  const phaseCfg = phaseColors[phaseNum]||phaseColors[1];
  const timeline = dashboard?.strategic_timeline;
  const value    = dashboard?.value_realized;
  const narrative= dashboard?.metrics_narrative;
  const upsells  = dashboard?.accelerator_upsells||[];

  const genAt = generatedAt
    ? new Date(generatedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
    : '';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav
        clientName={client.name}
        companyName={`${client.company} — Strategy Launchpad`}
        projects={projects}
        selectedProjectId={project?.id}
        onProjectChange={handleProjectChange}
      />

      {!dashboard ? (
        <div className="min-h-[80vh] flex items-center justify-center p-6">
          <div className="max-w-lg text-center">
            <div className="h-20 w-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
              <Sparkles className="h-10 w-10 text-primary"/>
            </div>
            <h2 className="text-2xl font-bold mb-3">Executive Strategy Launchpad</h2>
            <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
              Your launchpad is generated from real audit data — keyword rankings, competitor positions, and AI visibility scores — not templates or estimates.
            </p>
            {sourceAnalysis ? (
              <div className="rounded-xl border border-border bg-card/60 p-4 text-left mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-green-400"/>
                  <span className="text-sm font-semibold">Audit data available</span>
                </div>
                <p className="text-xs text-muted-foreground">Last analysis: {sourceAnalysis}. Ask Manav to generate the launchpad from this data.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-4 text-left mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-yellow-400"/>
                  <span className="text-sm font-semibold text-yellow-400">No audit data yet</span>
                </div>
                <p className="text-xs text-muted-foreground">The launchpad requires a website analysis first. Ask Manav to run the audit in the admin panel.</p>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5"/>
              Will appear automatically once Manav generates it
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

         {/* Data provenance banner */}
          <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-green-400 mb-1">Data Source Transparency</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This launchpad was generated from verified audit data{sourceAnalysis ? ` (analysis: ${sourceAnalysis})` : ''}. Strategic phase, metrics narrative, and accelerator opportunities are all derived from real keyword rankings, indexing counts, and live AI visibility tests — not templates.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-yellow-400 mb-1">Estimated Values</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Capital saved, risks neutralised, and completion percentage are AI estimates based on real data patterns. Marked with ~ where applicable.
                </p>
              </div>
            </div>
            {genAt && (
              <div className="text-xs text-muted-foreground font-mono pt-1 border-t border-border">
                Launchpad generated: {genAt}
              </div>
            )}
          </div>
          
          {/* ─ Strategic Phase ─ */}
          <div className={`rounded-3xl border border-border bg-card/60 p-6 sm:p-8 ${phaseCfg.glow} overflow-hidden relative`}>
            <div className="absolute top-0 right-0 h-64 w-64 rounded-full opacity-10 blur-3xl pointer-events-none" style={{background:phaseCfg.ring}}/>
            <div className="relative grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <div className={`inline-flex items-center gap-2 text-xs font-mono ${phaseCfg.text} ${phaseCfg.bg} border border-current/20 rounded-full px-3 py-1.5 mb-4`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current"/>
                  {timeline?.status_label||'In Progress'}
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold mb-3 leading-tight">{timeline?.current_phase_name}</h1>
                {timeline?.phase_description && (
                  <p className="text-muted-foreground text-base mb-6 leading-relaxed">{timeline.phase_description}</p>
                )}
                <div className="space-y-3">
                  {timeline?.recent_completion && (
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 text-green-400 shrink-0"/>
                      <div>
                        <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Recently Completed</div>
                        <div className="text-sm font-semibold">{timeline.recent_completion}</div>
                      </div>
                    </div>
                  )}
                  {timeline?.active_focus && (
                    <div className="flex items-center gap-3">
                      <div className="h-4 w-4 rounded-full border-2 border-primary flex items-center justify-center shrink-0">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"/>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Active Focus</div>
                        <div className="text-sm font-semibold">{timeline.active_focus}</div>
                      </div>
                    </div>
                  )}
                  {timeline?.next_milestone && (
                    <div className="flex items-center gap-3">
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0"/>
                      <div>
                        <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Next Milestone</div>
                        <div className="text-sm font-semibold">{timeline.next_milestone}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center gap-6">
                <div>
                  <PhaseRing pct={timeline?.completion_percentage||0} phase={phaseNum}/>
                  <div className="text-xs text-center text-yellow-400/80 font-mono mt-2 flex items-center justify-center gap-1">
                    <AlertTriangle className="h-2.5 w-2.5"/>~ completion % is AI-estimated
                  </div>
                </div>
                <PhaseTimeline current={phaseNum}/>
              </div>
            </div>
          </div>

          {/* ─ Metrics Narrative ─ */}
          {narrative && (
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <div className="flex items-center gap-2 mb-1">
                <div className={`h-2 w-2 rounded-full ${narrative.momentum_indicator==='Accelerating'?'bg-green-400':narrative.momentum_indicator==='Gaining Traction'?'bg-yellow-400':'bg-primary'} animate-pulse`}/>
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Momentum: {narrative.momentum_indicator}
                </span>
                <span className="ml-auto text-xs text-muted-foreground font-mono flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-400"/>From verified audit data
                </span>
              </div>
              <h2 className="text-xl font-bold mb-2">{narrative.headline}</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-3">{narrative.context}</p>
              {narrative.biggest_win && (
                <div className="flex items-center gap-2 text-sm">
                  <Trophy className="h-4 w-4 text-yellow-400 shrink-0"/>
                  <span className="font-medium">{narrative.biggest_win}</span>
                </div>
              )}
            </div>
          )}

          {/* ─ Value Realized ─ */}
          {value && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border"/>
                <div className="flex items-center gap-2 text-xs font-mono bg-card/60 border border-border rounded-full px-3 py-1.5">
                  <Shield className="h-3.5 w-3.5 text-primary"/>
                  Value Realised This Engagement
                </div>
                <div className="h-px flex-1 bg-border"/>
              </div>
              <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5"/>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Numbers marked <span className="text-yellow-400 font-mono">~ est.</span> are AI-calculated from engagement patterns and real audit findings — not externally verifiable counts. Treat them as directional. Unmarked values come directly from your audit data.
                </p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <ValueCard icon={Shield} label="Risks Neutralised"
                  color="bg-green-400/10 text-green-400"
                  value={value.technical_risks_neutralized}
                  sub={value.risk_summary}
                  estimated={true}/>
                <ValueCard icon={CheckCircle} label="Concepts Validated"
                  color="bg-primary/10 text-primary"
                  value={value.prototypes_validated}
                  sub="Strategies tested before investment"
                  estimated={true}/>
                <ValueCard icon={TrendingUp} label="Capital Protected"
                  color="bg-yellow-400/10 text-yellow-400"
                  value={value.estimated_capital_saved ? fmt$(value.estimated_capital_saved) : '—'}
                  sub={value.capital_saved_explanation}
                  estimated={true}/>
                <ValueCard icon={Star} label="Months Active"
                  color="bg-purple-400/10 text-purple-400"
                  value={value.months_active}
                  sub={value.retainer_roi_note}
                  estimated={false}/>
              </div>
            </div>
          )}

          {/* ─ Accelerator Sprints ─ */}
          {upsells.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border"/>
                <div className="flex items-center gap-2 text-xs font-mono bg-card/60 border border-border rounded-full px-3 py-1.5">
                  <Zap className="h-3.5 w-3.5 text-yellow-400"/>
                  AI-Identified Accelerators — From Your Audit Data
                </div>
                <div className="h-px flex-1 bg-border"/>
              </div>

              <div className="rounded-2xl border border-border bg-card/40 p-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5"/>
                <div>
                  <div className="text-sm font-semibold mb-1">How These Were Identified</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Each opportunity was identified from your live audit data — specifically from keyword ranking gaps, competitor positions, and AI visibility scores verified at analysis time. These are not generic recommendations.
                  </p>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                {upsells.map((upsell:any,i:number) => (
                  <AcceleratorCard key={i} upsell={upsell}
                    onApprove={() => approveAccelerator(i,upsell)}
                    approving={approvingIdx===i}/>
                ))}
              </div>
            </div>
          )}

          {/* ─ Footer ─ */}
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <div className="flex items-center gap-4 flex-wrap justify-between">
              <div className="flex items-center gap-3">
                <img src="/manav.jpg" alt="Manav"
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-primary shrink-0"
                  style={{objectPosition:'center 20%'}}
                  onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
                <div>
                  <div className="font-semibold text-sm">Managed by Manav</div>
                  <div className="text-xs text-muted-foreground">SEO Season — Premium Growth Agency</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {[
                  {icon:ShieldCheck,label:'Validation-First'},
                  {icon:Star,       label:'Fiverr Top Rated'},
                  {icon:Globe,      label:'AI-Native SEO'},
                ].map(({icon:Icon,label}) => (
                  <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-full px-3 py-1.5">
                    <Icon className="h-3 w-3 text-primary"/>{label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-center text-xs text-muted-foreground py-2">
            © 2026 SEO Season · All strategy data derived from verified audit analysis · Confidential
          </div>
        </div>
      )}
    </div>
  );
}
