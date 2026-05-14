/**
 * THE OVAL — President Manav's Strategic Intelligence Suite
 *
 * Left:    Strategy board + What-IF scenario simulator
 * Centre:  Competitive radar + Live intelligence signals
 * Right:   Chief Strategist (Brain advisor, strategic mode)
 *
 * This is where you think. Mission Control is where you watch.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '@/contexts/AuthContext';
import { useProject }  from '@/contexts/ProjectContext';
import { supabase }    from '@/lib/supabase';
import PresidentialAdvisor from '@/components/PresidentialAdvisor';
import {
  Crown, Globe, Brain, Target, Zap, Activity,
  ChevronRight, RefreshCw, Rocket, TrendingUp,
  Shield, Sparkles, Radio, AlertTriangle,
  Check, Clock, Cpu, ArrowUp, ArrowDown, Minus,
  Eye, Layers, BookOpen, Database,
} from 'lucide-react';

async function callEngine(a: string, b: Record<string,unknown> = {}) {
  const r = await fetch('/api/task-engine', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({action:a,...b}) });
  return r.json();
}

const greet = () => {
  const h = new Date().getHours();
  return h < 5  ? 'Still at it, President Manav.' :
         h < 12 ? 'Good morning, President Manav.' :
         h < 17 ? 'Good afternoon, President Manav.' :
         h < 21 ? 'Good evening, President Manav.' :
                  'Good night, President Manav.';
};

const scColor = (s: number) => s>=80?'text-emerald-400':s>=60?'text-sky-400':s>=40?'text-amber-400':'text-red-400';
const scBg    = (s: number) => s>=80?'bg-emerald-500':s>=60?'bg-sky-500':s>=40?'bg-amber-500':'bg-red-500';

/* ── Competitive Radar SVG ── */
function CompetitiveRadar({ competitors, keywords }: { competitors: string[]; keywords: string[] }) {
  const cx = 120, cy = 120, r = 90;
  const rings = [0.25, 0.5, 0.75, 1];
  const axes = ['Content', 'Authority', 'Technical', 'Local', 'AI Visibility'];

  // Position each competitor deterministically based on domain name hash
  const compDots = competitors.slice(0, 6).map((c, i) => {
    const angle = (i / Math.max(competitors.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const seed = c.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
    const dist = (0.45 + (seed % 45) / 100) * r;
    return { name: c.replace(/https?:\/\//, '').replace(/^www\./, '').split('/')[0], x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle), threat: seed % 3 };
  });

  // "You" dot — always in a strong position
  const youX = cx + r * 0.3 * Math.cos(-Math.PI / 3);
  const youY = cy + r * 0.3 * Math.sin(-Math.PI / 3);

  return (
    <svg viewBox="0 0 240 240" className="w-full h-full">
      {/* Rings */}
      {rings.map((rf, i) => (
        <circle key={i} cx={cx} cy={cy} r={rf * r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.8"/>
      ))}
      {/* Axes */}
      {axes.map((ax, i) => {
        const a = (i / axes.length) * Math.PI * 2 - Math.PI / 2;
        return (
          <g key={ax}>
            <line x1={cx} y1={cy} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} stroke="rgba(255,255,255,0.04)" strokeWidth="0.7"/>
            <text x={cx + (r + 12) * Math.cos(a)} y={cy + (r + 12) * Math.sin(a)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="7" fill="rgba(255,255,255,0.25)" fontFamily="monospace">{ax}</text>
          </g>
        );
      })}
      {/* Competitor dots */}
      {compDots.map((c, i) => {
        const col = c.threat === 0 ? '#ef4444' : c.threat === 1 ? '#f59e0b' : '#6366f1';
        return (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r="5" fill={col} fillOpacity="0.7" stroke={col} strokeWidth="1"/>
            <circle cx={c.x} cy={c.y} r="9" fill="none" stroke={col} strokeOpacity="0.3" strokeWidth="0.8">
              <animate attributeName="r" values="5;11;5" dur="3s" begin={`${i * 0.8}s`} repeatCount="indefinite"/>
              <animate attributeName="stroke-opacity" values="0.3;0;0.3" dur="3s" begin={`${i * 0.8}s`} repeatCount="indefinite"/>
            </circle>
            <text x={c.x} y={c.y + 14} textAnchor="middle" fontSize="6" fill={col} fillOpacity="0.7" fontFamily="monospace">
              {c.name.slice(0, 12)}
            </text>
          </g>
        );
      })}
      {/* You */}
      <circle cx={youX} cy={youY} r="7" fill="#FFB800" fillOpacity="0.9">
        <animate attributeName="r" values="7;10;7" dur="2s" repeatCount="indefinite"/>
      </circle>
      <circle cx={youX} cy={youY} r="12" fill="none" stroke="#FFB800" strokeOpacity="0.4" strokeWidth="1"/>
      <text x={youX} y={youY + 16} textAnchor="middle" fontSize="7" fill="#FFB800" fontFamily="monospace" fontWeight="bold">YOU</text>
      {/* Centre label */}
      <text x={cx} y={cy - 96} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.2)" fontFamily="monospace">COMPETITIVE RADAR</text>
      {/* Legend */}
      {[{c:'#ef4444',l:'HIGH THREAT'},{c:'#f59e0b',l:'MEDIUM'},{c:'#6366f1',l:'WATCH'}].map(({c,l},i)=>(
        <g key={l}>
          <circle cx={10} cy={218 + i * 8} r="2.5" fill={c} fillOpacity="0.7"/>
          <text x={16} y={218 + i * 8} dominantBaseline="middle" fontSize="6" fill="rgba(255,255,255,0.3)" fontFamily="monospace">{l}</text>
        </g>
      ))}
    </svg>
  );
}

/* ── What-IF Simulator ── */
function WhatIfSimulator({ project, projectContext }: { project: any; projectContext: string }) {
  const [scenario, setScenario] = useState('');
  const [result,   setResult]   = useState('');
  const [running,  setRunning]  = useState(false);

  const SCENARIOS = [
    'If I publish 3× more content this month',
    'If I fix all technical SEO issues this week',
    'If a major competitor loses rankings suddenly',
    'If Google rolls out a new core update tomorrow',
    'If I launch a dedicated topical cluster for my top keyword',
    'If I optimise all existing content for AI Overviews',
  ];

  const simulate = async (s: string) => {
    if (!s || running) return;
    setRunning(true); setResult('');
    try {
      const r = await fetch('/api/intelligence', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          mode: 'chat',
          question: `WHAT-IF SCENARIO: "${s}"
Based on: ${projectContext}
Run a strategic simulation. Predict: traffic impact, timeline, risks, and the one thing that must happen for this scenario to succeed. Be specific with numbers. Format: IMPACT | TIMELINE | RISK | KEY CONDITION`,
          projectSummary: projectContext,
          brainAssistantContext: {
            systemOverride: 'You are a strategic simulation engine for SEO Season. Give precise, data-driven scenario predictions. Always include estimated numbers.',
            projectContext: {}, learnings: [], algoItems: [], canvasBlocks: [], history: [],
          },
        }),
      });
      if (!r.ok || !r.body) throw new Error();
      const reader = r.body.getReader(); const dec = new TextDecoder(); let full = '';
      while (true) { const {done,value} = await reader.read(); if(done)break; full+=dec.decode(value); setResult(full); }
    } catch { setResult('Simulation unavailable.'); }
    setRunning(false);
  };

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center gap-2 shrink-0">
        <Sparkles className="h-3.5 w-3.5 text-violet-400"/>
        <span className="text-[10px] font-semibold text-muted-foreground/60">WHAT-IF SIMULATOR</span>
      </div>
      {/* Preset scenarios */}
      {!result && (
        <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto">
          {SCENARIOS.map((s, i) => (
            <button key={i} onClick={() => simulate(s)}
              className="text-left text-xs px-2.5 py-2 rounded-lg border border-violet-500/15 bg-violet-500/5 text-violet-300/70 hover:bg-violet-500/12 hover:text-violet-200 transition-all leading-snug">
              {s}
            </button>
          ))}
        </div>
      )}
      {/* Custom scenario */}
      <div className="flex gap-2 shrink-0">
        <input value={scenario} onChange={e => setScenario(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && simulate(scenario)}
          placeholder="Type your own scenario…"
          className="flex-1 h-7 rounded-lg border border-violet-500/20 bg-background/60 px-2.5 text-xs outline-none focus:border-violet-500/40"/>
        <button onClick={() => simulate(scenario)} disabled={running || !scenario.trim()}
          className="h-7 px-2.5 rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-400 text-xs hover:bg-violet-500/25 disabled:opacity-40 transition-colors">
          {running ? <RefreshCw className="h-3 w-3 animate-spin"/> : 'Run'}
        </button>
      </div>
      {/* Result */}
      {(result || running) && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2.5 flex-1 overflow-y-auto">
          {running && !result && (
            <div className="flex gap-1.5 items-center py-1">
              {[0,1,2].map(i => <div key={i} className="h-1 w-1 rounded-full bg-violet-400" style={{animation:`bounce 1.2s ease ${i*.2}s infinite`}}/>)}
              <span className="text-[10px] text-violet-400/60 ml-1">Simulating…</span>
            </div>
          )}
          {result && <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">{result}</pre>}
          {result && (
            <button onClick={() => { setResult(''); setScenario(''); }} className="mt-2 text-[10px] text-violet-400/60 hover:text-violet-400 underline">
              New scenario
            </button>
          )}
        </div>
      )}
      <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   THE OVAL
════════════════════════════════════════════════════════ */
export default function Oval() {
  const navigate  = useNavigate();
  const { user, clients, projects, refreshData } = useAuth();
  const { selectedProjectId, setSelectedProjectId, selectedProject } = useProject();

  const [data,       setData]       = useState<any>(null);
  const [algoTopics, setAlgoTopics] = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [toast,      setToast]      = useState('');

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, { data: algo }] = await Promise.all([
        callEngine('get_launchpad_intel'),
        supabase.from('algorithm_knowledge').select('id,topic,updated_at,freshness_score,summary').order('updated_at', { ascending: false }).limit(20),
      ]);
      if (d?.projectStats || d?.totals) setData(d);
      if (algo) setAlgoTopics(algo);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const safeClients  = (clients  || []).filter((c: any) => c?.id);
  const safeProjects = (projects || []).filter((p: any) => p?.id);
  const allProjs     = data?.projectStats || [];
  const activeProjs  = allProjs.filter((p: any) => p.status !== 'archived');
  const t            = data?.totals || {};

  /* Canvas cards from selected project — from projects table playground_canvas */
  const [canvasCards, setCanvasCards] = useState<any[]>([]);
  useEffect(() => {
    if (!selectedProjectId) return;
    supabase.from('projects').select('playground_canvas').eq('id', selectedProjectId).single()
      .then(({ data }) => {
        if (data?.playground_canvas) {
          try { setCanvasCards(JSON.parse(data.playground_canvas) || []); } catch { setCanvasCards([]); }
        } else { setCanvasCards([]); }
      });
  }, [selectedProjectId]);

  /* Build project context string for advisor */
  const selProj    = allProjs.find((p: any) => p.id === selectedProjectId) || selectedProject;
  const projCtx    = selProj
    ? `Project: ${selProj.name} | CMS: ${selProj.cms || 'not set'} | Keywords: ${(selProj.keywords || []).slice(0, 5).join(', ') || 'not set'} | Competitors: ${(selProj.competitors || []).join(', ') || 'none'} | Brain score: ${selProj.brainScore || 0}/100 | Goals: ${selProj.goals || 'not set'}`
    : `Empire overview: ${activeProjs.length} active projects across ${safeClients.length} clients`;

  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  /* Live signals — combine algo topics with freshness */
  const freshSignals  = algoTopics.filter(a => a.freshness_score >= 7).slice(0, 5);
  const staleWarnings = algoTopics.filter(a => a.freshness_score < 4).slice(0, 3);

  /* Strategy status from canvas cards */
  const strategyStatus = {
    todo:   canvasCards.filter((c: any) => c.status === 'todo').length,
    doing:  canvasCards.filter((c: any) => c.status === 'doing').length,
    done:   canvasCards.filter((c: any) => c.status === 'done').length,
  };

  return (
    <div className="fixed inset-0 bg-[#030810] text-foreground overflow-hidden flex flex-col"
         style={{ fontFamily: 'system-ui, sans-serif' }}>
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-card border border-border shadow-xl text-sm max-w-md text-center">{toast}</div>
      )}

      {/* ═══ HEADER ═══ */}
      <div className="shrink-0 border-b border-amber-500/10 bg-gradient-to-r from-amber-500/6 via-transparent to-transparent">
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <img src="/manav.jpg" alt="Manav"
                className="h-11 w-11 rounded-full object-cover ring-2 ring-amber-500/55 shrink-0"
                style={{ objectPosition: 'center 20%' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}/>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-[#030810] flex items-center justify-center ring-1 ring-amber-500/40">
                <Crown className="h-3 w-3 text-amber-400"/>
              </div>
            </div>
            <div>
              <div className="text-amber-300 font-bold text-sm">{greet()}</div>
              <div className="text-[10px] text-muted-foreground/35 font-mono">{dateStr}</div>
            </div>
          </div>

          {/* Empire summary */}
          <div className="hidden md:flex items-center gap-4">
            {[
              { v: safeClients.length,  l: 'clients',    c: 'text-violet-400'  },
              { v: safeProjects.length, l: 'projects',   c: 'text-sky-400'     },
              { v: t.activeLearnings,   l: 'learnings',  c: 'text-emerald-400' },
              { v: t.pendingApprovals,  l: 'pending',    c: t.pendingApprovals > 0 ? 'text-amber-400' : 'text-muted-foreground/40' },
            ].map(({ v, l, c }) => (
              <div key={l} className="text-center">
                <div className={`text-lg font-bold leading-none ${c}`}>{v ?? '—'}</div>
                <div className="text-[9px] text-muted-foreground/35 font-mono mt-0.5">{l}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Project selector */}
            {safeProjects.length > 0 && (
              <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
                className="h-8 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs px-2.5 text-amber-300 outline-none focus:border-amber-500/40 cursor-pointer">
                {safeProjects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <button onClick={() => navigate('/mission-control')}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-border/40 text-xs text-muted-foreground/60 hover:text-primary hover:border-primary/30 transition-all">
              <Rocket className="h-3 w-3"/>Mission Control
            </button>
            <button onClick={load} disabled={loading} className="h-8 w-8 rounded-xl border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}/>
            </button>
          </div>
        </div>
      </div>

      {/* ═══ 3-COLUMN STRATEGIC GRID ═══ */}
      <div className="flex-1 grid grid-cols-3 gap-px bg-border/15 min-h-0">

        {/* ── COL 1: Strategy Board + What-IF ── */}
        <div className="bg-[#030810] flex flex-col min-h-0">
          {/* Strategy board */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 shrink-0">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-primary/60"/>
              <span className="text-[10px] font-semibold text-muted-foreground/60">STRATEGY BOARD</span>
              {selProj && <span className="text-[9px] text-muted-foreground/30 truncate max-w-[80px]">{selProj.name}</span>}
            </div>
            <button onClick={() => navigate('/playground')} className="text-[9px] text-primary hover:underline">canvas →</button>
          </div>

          {/* Canvas status */}
          <div className="px-3 py-2.5 border-b border-border/15 shrink-0">
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              {[
                { k: 'todo',   label: 'To Do',  color: 'text-muted-foreground', v: strategyStatus.todo  },
                { k: 'doing',  label: 'Active', color: 'text-blue-400',         v: strategyStatus.doing },
                { k: 'done',   label: 'Done',   color: 'text-emerald-400',       v: strategyStatus.done  },
              ].map(({ k, label, color, v }) => (
                <div key={k} className="rounded-lg bg-secondary/20 border border-border/30 p-2 text-center">
                  <div className={`text-base font-bold ${color}`}>{v}</div>
                  <div className="text-[9px] text-muted-foreground/40">{label}</div>
                </div>
              ))}
            </div>
            {/* Top active cards */}
            {canvasCards.filter((c: any) => c.status === 'doing').slice(0, 3).map((card: any, i: number) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/15 last:border-0">
                <div className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0"/>
                <span className="text-xs text-foreground/65 truncate flex-1">{card.title || card.type}</span>
                <span className="text-[9px] text-blue-400/60 font-mono shrink-0">ACTIVE</span>
              </div>
            ))}
            {canvasCards.filter((c: any) => c.status === 'doing').length === 0 && (
              <p className="text-[10px] text-muted-foreground/25 text-center py-1">No active cards — start executing</p>
            )}
          </div>

          {/* What-IF simulator */}
          <div className="flex-1 px-3 py-2.5 min-h-0 overflow-hidden flex flex-col">
            <WhatIfSimulator
              project={selProj}
              projectContext={projCtx}/>
          </div>
        </div>

        {/* ── COL 2: Competitive Radar + Live Signals ── */}
        <div className="bg-[#030810] flex flex-col min-h-0">
          {/* Radar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 shrink-0">
            <div className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-rose-400/60"/>
              <span className="text-[10px] font-semibold text-muted-foreground/60">COMPETITIVE RADAR</span>
            </div>
            <span className="text-[9px] text-muted-foreground/30 font-mono">{(selProj?.competitors||[]).length} targets tracked</span>
          </div>
          <div className="h-56 shrink-0 px-2">
            {(selProj?.competitors || []).length > 0 ? (
              <CompetitiveRadar competitors={selProj.competitors} keywords={selProj.keywords || []}/>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground/20">
                <Radio className="h-8 w-8 mb-2 opacity-20"/>
                <p className="text-xs">No competitors tracked</p>
                <button onClick={() => navigate('/mission-control')} className="mt-1 text-[10px] text-rose-400/50 hover:text-rose-400 underline">Add competitors →</button>
              </div>
            )}
          </div>

          {/* Live intelligence signals */}
          <div className="flex items-center justify-between px-4 py-2 border-y border-border/20 shrink-0">
            <div className="flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5 text-violet-400/60"/>
              <span className="text-[10px] font-semibold text-muted-foreground/60">LIVE INTELLIGENCE</span>
            </div>
            <button onClick={() => navigate('/algorithm-intel')} className="text-[9px] text-primary hover:underline">intel →</button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
            {freshSignals.length > 0 && (
              <>
                <div className="text-[9px] font-mono text-emerald-400/50 mb-1.5 flex items-center gap-1">
                  <div className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse"/> FRESH SIGNALS
                </div>
                {freshSignals.map(s => (
                  <div key={s.id} className="flex items-start gap-2 py-2 border-b border-border/15 last:border-0">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0 mt-1"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground/70 leading-snug">{s.topic}</p>
                      {s.summary && <p className="text-[9px] text-muted-foreground/40 mt-0.5 line-clamp-1">{s.summary}</p>}
                    </div>
                    <span className="text-[9px] text-emerald-400/50 font-mono shrink-0">{s.freshness_score}/10</span>
                  </div>
                ))}
              </>
            )}
            {staleWarnings.length > 0 && (
              <>
                <div className="text-[9px] font-mono text-amber-400/50 mb-1.5 mt-3 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5"/> NEEDS REFRESH
                </div>
                {staleWarnings.map(s => (
                  <div key={s.id} className="flex items-center gap-2 py-1.5 border-b border-border/15 last:border-0">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-400/50 shrink-0"/>
                    <p className="flex-1 text-xs text-foreground/50 truncate">{s.topic}</p>
                    <span className="text-[9px] text-amber-400/40 font-mono">{s.freshness_score}/10</span>
                  </div>
                ))}
              </>
            )}
            {algoTopics.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-24 text-muted-foreground/20">
                <Cpu className="h-6 w-6 mb-1 opacity-20"/>
                <p className="text-xs">No algo intel loaded</p>
                <button onClick={() => navigate('/algorithm-intel')} className="mt-1 text-[9px] text-primary hover:underline">Load signals →</button>
              </div>
            )}

            {/* All projects brain health */}
            {activeProjs.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/15">
                <div className="text-[9px] font-mono text-muted-foreground/30 mb-2">EMPIRE BRAIN QUALITY</div>
                {activeProjs.slice(0, 5).map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2 mb-1.5">
                    <button onClick={() => { setSelectedProjectId(p.id); }} className="text-[10px] text-foreground/55 truncate w-20 text-left hover:text-primary transition-colors shrink-0">{p.name}</button>
                    <div className="flex-1 h-1 rounded-full bg-secondary/30 overflow-hidden">
                      <div className={`h-full rounded-full ${scBg(p.brainScore??0)} transition-all duration-700`} style={{ width: `${p.brainScore ?? 0}%` }}/>
                    </div>
                    <span className={`text-[9px] font-mono w-5 text-right shrink-0 ${scColor(p.brainScore??0)}`}>{p.brainScore ?? 0}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── COL 3: Chief Strategist + Navigation ── */}
        <div className="bg-[#030810] flex flex-col min-h-0">
          {/* Strategic advisor */}
          <div className="flex-1 p-3 min-h-0 overflow-hidden flex flex-col">
            <PresidentialAdvisor
              mode="strategic"
              projectName={selProj?.name}
              projectContext={projCtx}/>
          </div>

          {/* Quick navigation */}
          <div className="px-3 py-3 border-t border-border/20 shrink-0">
            <div className="text-[9px] font-mono text-muted-foreground/30 mb-2">NAVIGATE</div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { l: 'Mission Control', icon: Rocket,   href: '/mission-control', c: 'hover:text-amber-400 hover:border-amber-500/30' },
                { l: 'Strategy Canvas', icon: Layers,   href: '/playground',      c: 'hover:text-primary hover:border-primary/30'  },
                { l: 'Brain Learning',  icon: Brain,    href: '/brain-learning',  c: 'hover:text-emerald-400 hover:border-emerald-500/30' },
                { l: 'Data Room',       icon: Database, href: '/data-room',       c: 'hover:text-sky-400 hover:border-sky-500/30'  },
                { l: 'Algorithm Intel', icon: Cpu,      href: '/algorithm-intel', c: 'hover:text-violet-400 hover:border-violet-500/30' },
                { l: 'Brain Command',   icon: Zap,      href: '/brain-command',   c: 'hover:text-rose-400 hover:border-rose-500/30' },
              ].map(({ l, icon: Icon, href, c }) => (
                <button key={l} onClick={() => navigate(href)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border/25 text-[10px] text-muted-foreground/45 transition-all ${c}`}>
                  <Icon className="h-3 w-3 shrink-0"/>{l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
