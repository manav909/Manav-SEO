import { supabase } from '@/lib/supabase';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import DeepEnrichModal from '@/components/DeepEnrichModal';
import { useAuth } from '@/contexts/AuthContext';
import {
  Brain, Zap, RefreshCw, Search, X, ChevronDown, ChevronRight,
  CheckCircle, AlertTriangle, RotateCcw, Star, Trash2, Edit2,
  Shield, Activity, Database, Eye, EyeOff, Filter,
  TrendingUp, Target, Globe, FileText, Cpu,
} from 'lucide-react';
import PortalNav from '@/components/PortalNav';
import { toast } from '@/hooks/use-toast';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts';

/* ─── Types ─── */
interface Learning {
  id:               string;
  project_id:       string | null;
  card_type:        string;
  card_title:       string;
  what_worked:      string[];
  what_missed:      string[];
  redo_reason:      string | null;
  improvement:      string | null;
  context_summary:  string | null;
  tags:             string[];
  source:           string;
  applied_count:    number;
  status:           'pending_review' | 'active' | 'rejected';
  auto_captured:    boolean;
  confidence_score: number;
  created_at:       string;
  updated_at:       string;
}

/* ─── Config maps ─── */
const SOURCE_META: Record<string, { label: string; color: string; icon: any; dim: string }> = {
  task_execution:       { label: 'Task Execution',   color: '#6366f1', icon: Zap,      dim: 'strategy'     },
  task_execution_auto:  { label: 'Task Auto-Eval',   color: '#8b5cf6', icon: Brain,    dim: 'strategy'     },
  verify_outcome:       { label: 'Verification',     color: '#10b981', icon: Shield,   dim: 'strategy'     },
  strategy_generation:  { label: 'Strategy Gen',     color: '#f59e0b', icon: Target,   dim: 'strategy'     },
  pipeline_intelligence:{ label: 'Pipeline Intel',   color: '#3b82f6', icon: Activity, dim: 'strategy'     },
  deep_dive_analysis:   { label: 'Deep Dive',        color: '#a78bfa', icon: Database, dim: 'strategy'     },
  audit_streaming:      { label: 'Audit Analysis',   color: '#06b6d4', icon: FileText, dim: 'technical'    },
  document_extraction:  { label: 'Doc Extraction',   color: '#14b8a6', icon: FileText, dim: 'technical'    },
  seo_agent_audit:      { label: 'SEO Agent',        color: '#f97316', icon: Globe,    dim: 'technical'    },
  algorithm_intel:      { label: 'Algorithm Intel',  color: '#ec4899', icon: Cpu,      dim: 'general'      },
  crawl_analysis:       { label: 'Crawl Analysis',   color: '#84cc16', icon: Globe,    dim: 'technical'    },
};

const CARD_TYPE_DIM: Record<string, string> = {
  technical:   'technical', 'quick-win': 'technical',
  content:     'content',   geo: 'geo',
  competitive: 'competitive', insight: 'strategy',
  weekly:      'strategy',  strategy: 'strategy', general: 'strategy',
  audit:       'technical',
};

const DIM_CONFIG = [
  { key: 'technical',    label: 'Technical',    color: '#06b6d4', glow: 'rgba(6,182,212,0.3)' },
  { key: 'content',      label: 'Content',      color: '#facc15', glow: 'rgba(250,204,21,0.3)' },
  { key: 'geo',          label: 'GEO / AI',     color: '#6366f1', glow: 'rgba(99,102,241,0.3)' },
  { key: 'competitive',  label: 'Competitive',  color: '#f97316', glow: 'rgba(249,115,22,0.3)' },
  { key: 'strategy',     label: 'Strategy',     color: '#10b981', glow: 'rgba(16,185,129,0.3)' },
];

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? 'today' : d === 1 ? '1d ago' : `${d}d ago`;
}

function getLearningDim(l: Learning): string {
  return CARD_TYPE_DIM[l.card_type] || SOURCE_META[l.source]?.dim || 'strategy';
}

function calcIntelligenceLevel(learnings: Learning[]): number {
  const active = learnings.filter(l => l.status === 'active');
  if (active.length === 0) return 0;
  const score = active.reduce((s, l) => s + (l.confidence_score || 75) * (1 + (l.applied_count || 0) * 0.1), 0);
  return Math.min(100, Math.round(score / 15));
}

function calcDimScores(learnings: Learning[]): Record<string, number> {
  const active = learnings.filter(l => l.status === 'active');
  const scores: Record<string, { total: number; count: number }> = {};
  DIM_CONFIG.forEach(d => { scores[d.key] = { total: 0, count: 0 }; });
  for (const l of active) {
    const dim = getLearningDim(l);
    if (scores[dim]) {
      scores[dim].total += (l.confidence_score || 75) * (1 + (l.applied_count || 0) * 0.05);
      scores[dim].count++;
    }
  }
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(scores)) {
    result[key] = val.count === 0 ? 0 : Math.min(100, Math.round(val.total / val.count));
  }
  return result;
}

/* ─── Animated background grid ─── */
function NeuralBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{zIndex:0}}>
      {/* Dark base */}
      <div style={{position:'absolute',inset:0,background:'#030712'}}/>
      {/* Grid lines */}
      <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0.08}}>
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#00d4ff" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)"/>
      </svg>
      {/* Radial glow at center */}
      <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse 60% 40% at 50% 20%, rgba(99,102,241,0.08) 0%, transparent 70%)'}}/>
    </div>
  );
}

/* ─── Circular score gauge ─── */
function CircleGauge({ value, max = 100, color, size = 80, label, sublabel }: {
  value: number; max?: number; color: string; size?: number; label: string; sublabel?: string;
}) {
  const pct = Math.min(1, value / max);
  const r   = (size - 10) / 2;
  const circ= 2 * Math.PI * r;
  const dash= circ * pct;
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
      <div style={{position:'relative',width:size,height:size}}>
        <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
            style={{filter:`drop-shadow(0 0 6px ${color})`, transition:'stroke-dasharray 0.8s ease'}}/>
        </svg>
        <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
          <span style={{fontSize:size>70?18:13,fontWeight:900,color,fontFamily:'monospace',lineHeight:1}}>{value}</span>
          {size > 70 && <span style={{fontSize:9,color:'rgba(255,255,255,0.4)',marginTop:1}}>/ {max}</span>}
        </div>
      </div>
      <span style={{fontSize:10,color:'rgba(255,255,255,0.5)',fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.05em',textAlign:'center'}}>{label}</span>
      {sublabel && <span style={{fontSize:9,color:'rgba(255,255,255,0.3)',textAlign:'center'}}>{sublabel}</span>}
    </div>
  );
}

/* ─── Status badge ─── */
function StatusBadge({ status }: { status: string }) {
  const cfg = {
    active:         { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', color: '#10b981', label: '● ACTIVE' },
    pending_review: { bg: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.4)', color: '#fbbf24', label: '◌ PENDING' },
    rejected:       { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)', color: '#ef4444', label: '✕ REJECTED' },
  }[status] || { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', color: '#fff', label: status.toUpperCase() };
  return (
    <span style={{background:cfg.bg,border:`1px solid ${cfg.border}`,color:cfg.color,fontSize:9,fontFamily:'monospace',padding:'2px 6px',borderRadius:3,letterSpacing:'0.08em',fontWeight:700}}>
      {cfg.label}
    </span>
  );
}

/* ─── Source badge ─── */
function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_META[source] || { label: source, color: '#94a3b8', icon: Brain };
  const Icon = meta.icon;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:4,background:`${meta.color}18`,border:`1px solid ${meta.color}30`,color:meta.color,fontSize:9,fontFamily:'monospace',padding:'2px 6px',borderRadius:3,letterSpacing:'0.06em',fontWeight:600}}>
      <Icon size={8}/>{meta.label.toUpperCase()}
    </span>
  );
}

/* ─── Individual learning card ─── */
function LearningCard({ l, onApprove, onReject, onDelete, onEdit, onDeactivate, onEnrich }: {
  l: Learning;
  onApprove:    (id: string) => void;
  onReject:     (id: string) => void;
  onDelete:     (id: string) => void;
  onEdit:       (l: Learning) => void;
  onDeactivate: (id: string) => void;
  onEnrich?:    (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const dim    = getLearningDim(l);
  const dimCfg = DIM_CONFIG.find(d => d.key === dim) || DIM_CONFIG[4];

  return (
    <div
      style={{
        background: l.status === 'pending_review'
          ? 'rgba(251,191,36,0.04)'
          : l.status === 'rejected'
          ? 'rgba(239,68,68,0.03)'
          : 'rgba(255,255,255,0.03)',
        border: l.status === 'pending_review'
          ? '1px solid rgba(251,191,36,0.2)'
          : l.status === 'rejected'
          ? '1px solid rgba(239,68,68,0.15)'
          : `1px solid ${dimCfg.color}22`,
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'all 0.2s',
      }}
    >
      {/* Card header */}
      <div
        style={{padding:'12px 16px',cursor:'pointer',display:'flex',alignItems:'flex-start',gap:12}}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Confidence ring */}
        <CircleGauge value={l.confidence_score || 75} color={dimCfg.color} size={48} label="" />

        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:6,marginBottom:6}}>
            <StatusBadge status={l.status}/>
        {l.tags?.includes('contradiction-flagged') && (
          <span style={{fontSize:8,fontFamily:'monospace',color:'#f59e0b',background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.3)',borderRadius:4,padding:'2px 6px'}}>
            ⚠ CONTRADICTION
          </span>
        )}
        {l.auto_captured && l.status === 'pending_review' && (
          <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(99,102,241,0.7)',background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:4,padding:'2px 6px'}}>
            AUTO
          </span>
        )}
        {l.tags?.includes('needs-algo-review') && (
          <span style={{fontSize:8,fontFamily:'monospace',color:'#38bdf8',background:'rgba(56,189,248,0.08)',border:'1px solid rgba(56,189,248,0.25)',borderRadius:4,padding:'2px 6px'}}>
            🔄 ALGO UPDATE
          </span>
        )}
            <SourceBadge source={l.source}/>
            {l.applied_count > 0 && (
              <span style={{background:'rgba(16,185,129,0.12)',border:'1px solid rgba(16,185,129,0.25)',color:'#10b981',fontSize:9,padding:'2px 6px',borderRadius:3,fontFamily:'monospace',fontWeight:700}}>
                ⚡ ×{l.applied_count} DEPLOYED
              </span>
            )}
            {l.auto_captured && (
              <span style={{background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.2)',color:'#a5b4fc',fontSize:9,padding:'2px 5px',borderRadius:3,fontFamily:'monospace'}}>
                AUTO
              </span>
            )}
            <span style={{fontSize:9,color:'rgba(255,255,255,0.2)',fontFamily:'monospace',marginLeft:'auto'}}>{daysAgo(l.created_at)}</span>
          </div>
          <div style={{fontSize:13,fontWeight:700,color:'#f1f5f9',marginBottom:4,lineHeight:1.3}}>{l.card_title}</div>
          {l.improvement && (
            <p style={{fontSize:11,color:'rgba(255,255,255,0.45)',lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
              {l.improvement}
            </p>
          )}
        </div>

        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}} onClick={e => e.stopPropagation()}>
          {l.status === 'active' && (
            <>
              <button onClick={() => onEdit(l)} style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'rgba(255,255,255,0.4)'}}>
                <Edit2 size={10}/>
              </button>
              <button onClick={() => onDeactivate(l.id)} style={{background:'rgba(251,191,36,0.08)',border:'1px solid rgba(251,191,36,0.2)',borderRadius:6,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#fbbf24'}} title="Move to review">
                <Eye size={10}/>
              </button>
              <button onClick={() => onDelete(l.id)} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#ef4444'}}>
                <Trash2 size={10}/>
              </button>
            </>
          )}
          {l.status === 'rejected' && (
            <>
              <button onClick={() => onApprove(l.id)} style={{background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.3)',borderRadius:6,padding:'4px 10px',cursor:'pointer',color:'#10b981',fontSize:10,fontFamily:'monospace',fontWeight:700}}>
                RESTORE
              </button>
              <button onClick={() => onDelete(l.id)} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#ef4444'}}>
                <Trash2 size={10}/>
              </button>
            </>
          )}
          <div style={{color:'rgba(255,255,255,0.2)',marginLeft:4}}>
            {expanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
          </div>
        </div>
      </div>

      {/* Pending review action strip */}
      {l.status === 'pending_review' && (
        <div style={{borderTop:'1px solid rgba(251,191,36,0.15)',background:'rgba(251,191,36,0.04)',padding:'10px 16px',display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:10,color:'rgba(255,255,255,0.4)',fontFamily:'monospace',flex:1}}>
            AUTO-CAPTURED INTELLIGENCE — REVIEW BEFORE ACTIVATING
          </span>
          <button
            onClick={() => onReject(l.id)}
            style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:6,padding:'5px 12px',cursor:'pointer',color:'#ef4444',fontSize:10,fontFamily:'monospace',fontWeight:700,display:'flex',alignItems:'center',gap:5}}
          >
            <X size={9}/>DISMISS
          </button>
          {/* Deepen: Brain resolves gaps and enriches this learning before approval */}
          {onEnrich && (
            <button
              onClick={async () => {
                setEnriching(true);
                await onEnrich(l.id);
                setEnriching(false);
              }}
              disabled={enriching}
              style={{background:enriching?'rgba(99,102,241,0.08)':'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.15))',border:'1px solid rgba(99,102,241,0.4)',borderRadius:6,padding:'5px 14px',cursor:enriching?'default':'pointer',color:'#a5b4fc',fontSize:10,fontFamily:'monospace',fontWeight:700,display:'flex',alignItems:'center',gap:5,boxShadow:enriching?'none':'0 0 10px rgba(99,102,241,0.2)',opacity:enriching?0.7:1}}
            >
              <Brain size={9} style={{animation:enriching?'spin 1s linear infinite':undefined}}/>{enriching?'DEEPENING...':'DEEPEN WITH BRAIN'}
            </button>
          )}
          <button
            onClick={() => onApprove(l.id)}
            style={{background:'linear-gradient(135deg,rgba(16,185,129,0.2),rgba(6,182,212,0.2))',border:'1px solid rgba(16,185,129,0.4)',borderRadius:6,padding:'5px 14px',cursor:'pointer',color:'#10b981',fontSize:10,fontFamily:'monospace',fontWeight:700,display:'flex',alignItems:'center',gap:5,boxShadow:'0 0 12px rgba(16,185,129,0.2)'}}
          >
            <Zap size={9}/>INTEGRATE INTO BRAIN
          </button>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div style={{borderTop:`1px solid ${dimCfg.color}15`,padding:'14px 16px',background:'rgba(0,0,0,0.2)'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:12}}>
            {l.what_worked?.length > 0 && (
              <div>
                <div style={{fontSize:9,fontFamily:'monospace',color:'#10b981',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>WHAT WORKED</div>
                {l.what_worked.map((w, i) => (
                  <div key={i} style={{display:'flex',gap:6,alignItems:'flex-start',marginBottom:4}}>
                    <CheckCircle size={9} style={{color:'#10b981',marginTop:2,flexShrink:0}}/>
                    <span style={{fontSize:11,color:'rgba(255,255,255,0.5)',lineHeight:1.4}}>{w}</span>
                  </div>
                ))}
              </div>
            )}
            {l.what_missed?.length > 0 && (
              <div>
                <div style={{fontSize:9,fontFamily:'monospace',color:'#f97316',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>GAPS DETECTED</div>
                {l.what_missed.map((w, i) => (
                  <div key={i} style={{display:'flex',gap:6,alignItems:'flex-start',marginBottom:4}}>
                    <AlertTriangle size={9} style={{color:'#f97316',marginTop:2,flexShrink:0}}/>
                    <span style={{fontSize:11,color:'rgba(255,255,255,0.5)',lineHeight:1.4}}>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {l.improvement && (
            <div style={{background:`${dimCfg.color}0e`,border:`1px solid ${dimCfg.color}20`,borderRadius:8,padding:'10px 12px',marginBottom:10}}>
              <div style={{fontSize:9,fontFamily:'monospace',color:dimCfg.color,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.1em'}}>NEURAL IMPROVEMENT DIRECTIVE</div>
              <p style={{fontSize:11,color:'rgba(255,255,255,0.6)',lineHeight:1.5,margin:0}}>{l.improvement}</p>
            </div>
          )}

          {l.tags?.length > 0 && (
            <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
              {l.tags.filter(t => t).slice(0, 6).map((t, i) => (
                <span key={i} style={{fontSize:9,padding:'2px 6px',borderRadius:3,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.35)',fontFamily:'monospace'}}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════
   MAIN PAGE
═════════════════════════════════════════════════════ */
export default function BrainLearning() {
  const { clients, projects } = useAuth();
  const [selProjId, setSelProjId] = useState('');
  const selProj = projects.find(p => p.id === selProjId);
  const client  = clients.find(c => c.id === selProj?.client_id);

  const [learnings,  setLearnings]  = useState<Learning[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState<'pending' | 'active' | 'rejected'>('pending');
  const [enrichTarget, setEnrichTarget] = useState<string | null>(null);
  const [dimFilter,  setDimFilter]  = useState('all');
  const [search,     setSearch]     = useState('');
  const [editingL,   setEditingL]   = useState<Learning | null>(null);
  const [editText,   setEditText]   = useState('');
  const [saving,     setSaving]     = useState(false);
  const [approving,  setApproving]  = useState<string | null>(null);
  const [lastLevel,  setLastLevel]  = useState(0);

  /* ── Load ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { action: 'get_all_learnings' };
      if (selProjId && selProjId.trim()) body.project_id = selProjId;
      const res  = await fetch('/api/task-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'brain-learning-page' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (data && data.learnings) {
        setLearnings((data.learnings || []).filter((l: any) => l && l.id));
      } else if (data?.error) {
        // Show toast but don't crash - Brain Learning page still renders
        toast({ title: 'Could not load learnings', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Connection issue', description: 'Could not reach task-engine. Check Vercel logs.', variant: 'destructive' });
    }
    setLoading(false);
  }, [selProjId]);

  useEffect(() => { load(); }, [load]);

  /* Level-up animation trigger */
  const level = calcIntelligenceLevel(learnings);
  useEffect(() => {
    if (level > lastLevel && lastLevel > 0) {
      toast({ title: `🧠 INTELLIGENCE UPGRADED — LEVEL ${level}`, description: 'A new neural pathway has been activated.' });
    }
    setLastLevel(level);
  }, [level]);

  /* ── API actions ── */
  async function callBrain(action: string, id: string): Promise<Learning | null> {
    const res  = await fetch('/api/task-engine', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
      body: JSON.stringify({ action, id }),
    });
    const data = await res.json().catch(() => null);
    if (!data || data.error) throw new Error(data?.error || 'Action failed');
    return data.learning || null;
  }

  const handleApprove = async (id: string) => {
    setApproving(id);
    try {
      const updated = await callBrain('approve_learning', id);
      if (updated?.id) setLearnings(ls => ls.map(l => l.id === id ? { ...l, ...updated } : l));
      toast({ title: '⚡ NEURAL PATHWAY ACTIVATED', description: 'Learning integrated into Manav Brain.' });
    } catch (err: any) {
      toast({ title: 'Activation failed', description: err?.message, variant: 'destructive' });
    }
    setApproving(null);
  };

  /* ─── Batch approve: auto-approve technical facts and audit findings ─── */
  const handleBatchApproveSystem = async () => {
    const systemLearnings = pending.filter(l =>
      ['technical','quick-win'].includes(l.card_type) ||
      ['audit_streaming','seo_agent_audit','crawl_analysis'].includes(l.source) ||
      (l.confidence_score || 75) >= 85
    );
    if (!systemLearnings.length) {
      toast({ title: 'No system learnings to auto-approve', description: 'Technical facts and audit findings with confidence ≥85 are auto-approved.' });
      return;
    }
    let approved = 0;
    for (const l of systemLearnings) {
      try {
        const updated = await callBrain('approve_learning', l.id);
        if (updated) {
          if (updated?.id) setLearnings(ls => ls.map(x => x.id === l.id ? { ...x, ...updated } : x));
          approved++;
        }
      } catch (_e) {}
    }
    toast({ title: `⚡ ${approved} system learnings activated`, description: 'Technical facts and audit findings integrated into Brain.' });
  };

  const handleReject = async (id: string) => {
    try {
      const updated = await callBrain('reject_learning', id);
      if (updated?.id) setLearnings(ls => ls.map(l => l.id === id ? { ...l, ...updated } : l));
    } catch (err: any) {
      toast({ title: 'Dismiss failed', description: err?.message, variant: 'destructive' });
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      const updated = await callBrain('deactivate_learning', id);
      if (updated?.id) setLearnings(ls => ls.map(l => l.id === id ? { ...l, ...updated } : l));
      toast({ title: 'Moved to review queue' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
  };

  /* ── DEEPEN: opens DeepEnrichModal ── */
  const handleEnrich = (id: string) => { setEnrichTarget(id); };
  const handleDelete = async (id: string) => {
    try {
      const res  = await fetch('/api/task-engine', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
        body: JSON.stringify({ action: 'delete_learning', id }),
      });
      const data = await res.json().catch(() => null);
      if (!data || data.error) throw new Error(data?.error || 'Delete failed');
      setLearnings(ls => ls.filter(l => l.id !== id));
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingL || !editText.trim()) return;
    setSaving(true);
    try {
      const res  = await fetch('/api/task-engine', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
        body: JSON.stringify({ action: 'update_learning', id: editingL.id, improvement: editText }),
      });
      const data = await res.json().catch(() => null);
      if (!data || data.error) throw new Error(data?.error || 'Update failed');
      setLearnings(ls => ls.map(l => l.id === editingL.id ? (data.learning || l) : l));
      setEditingL(null);
      toast({ title: 'Neural pathway updated' });
    } catch (err: any) {
      toast({ title: 'Update failed', description: err?.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  /* ── Derived data ── */
  const pending  = learnings.filter(l => l.status === 'pending_review');
  const systemPendingCount = pending.filter(l =>
    ['technical','quick-win'].includes(l.card_type) ||
    ['audit_streaming','seo_agent_audit','crawl_analysis'].includes(l.source) ||
    (l.confidence_score || 75) >= 85
  ).length;
  const active   = learnings.filter(l => l.status === 'active');
  const rejected = learnings.filter(l => l.status === 'rejected');
  const dimScores= calcDimScores(learnings);
  const totalApplied = active.reduce((s, l) => s + (l.applied_count || 0), 0);

  /* ── Stale learnings (algorithm updated since they were created) ── */
  const staleLearnings = active.filter(l =>
    Array.isArray(l.tags) && l.tags.some((t: string) => t.startsWith('algo_stale:'))
  );
  const [staleDismissed, setStaleDismissed] = React.useState(false);

  const handleMarkFresh = async (ids: string[]) => {
    for (const id of ids) {
      try {
        const l = learnings.find(x => x.id === id);
        if (!l) continue;
        const cleanTags = (l.tags || []).filter((t: string) => !t.startsWith('algo_stale:') && t !== 'algo-updated');
        cleanTags.push('freshness-checked');
        await fetch('/api/task-engine', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'app-page' },
          body: JSON.stringify({ action: 'update_learning', id, tags: cleanTags }),
        });
        if (id) setLearnings(ls => ls.map(x => x.id === id ? { ...x, tags: cleanTags } : x));
      } catch (_e) {}
    }
    toast({ title: `✓ ${ids.length} learnings marked fresh` });
  };

  const radarData = DIM_CONFIG.map(d => ({
    dimension: d.label,
    score:     dimScores[d.key] || 0,
    fullMark:  100,
  }));

  // Growth timeline (learnings captured per day, last 14 days)
  const timelineData = (() => {
    const days: Record<string, { pending: number; active: number }> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      days[key] = { pending: 0, active: 0 };
    }
    for (const l of learnings) {
      const d   = new Date(l.created_at);
      const key = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      if (days[key]) days[key][l.status === 'active' ? 'active' : 'pending']++;
    }
    return Object.entries(days).map(([date, v]) => ({ date, ...v }));
  })();

  // Filtered list for current tab
  const filtered = learnings
    .filter(l => l.status === tab.replace('pending', 'pending_review') as any || (tab === 'pending' && l.status === 'pending_review') || (tab === 'active' && l.status === 'active') || (tab === 'rejected' && l.status === 'rejected'))
    .filter(l => dimFilter === 'all' || getLearningDim(l) === dimFilter)
    .filter(l => {
      if (!search) return true;
      const q = search.toLowerCase();
      return l.card_title.toLowerCase().includes(q) ||
             l.improvement?.toLowerCase().includes(q) ||
             l.source.toLowerCase().includes(q) ||
             l.tags.some(t => t.toLowerCase().includes(q));
    });

  /* ── Inline editor modal ── */
  const EditModal = () => !editingL ? null : (
    <div style={{position:'fixed',inset:0,zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={() => setEditingL(null)}>
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.8)',backdropFilter:'blur(8px)'}}/>
      <div style={{position:'relative',width:'100%',maxWidth:560,background:'#0a0f1e',border:'1px solid rgba(99,102,241,0.3)',borderRadius:16,padding:24,boxShadow:'0 0 40px rgba(99,102,241,0.2)'}} onClick={e => e.stopPropagation()}>
        <div style={{fontSize:10,fontFamily:'monospace',color:'#a5b4fc',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.1em'}}>EDIT NEURAL DIRECTIVE</div>
        <div style={{fontSize:14,fontWeight:700,color:'#f1f5f9',marginBottom:16}}>{editingL.card_title}</div>
        <textarea
          value={editText}
          onChange={e => setEditText(e.target.value)}
          rows={4}
          style={{width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(99,102,241,0.3)',borderRadius:8,padding:'10px 12px',fontSize:12,color:'rgba(255,255,255,0.8)',outline:'none',resize:'none',fontFamily:'inherit',lineHeight:1.6,boxSizing:'border-box'}}
        />
        <div style={{display:'flex',gap:8,marginTop:12}}>
          <button onClick={handleSaveEdit} disabled={saving} style={{background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:8,padding:'8px 18px',color:'white',fontSize:11,fontFamily:'monospace',fontWeight:700,cursor:'pointer',opacity:saving?0.5:1}}>
            {saving ? 'SAVING...' : 'SAVE DIRECTIVE'}
          </button>
          <button onClick={() => setEditingL(null)} style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px 14px',color:'rgba(255,255,255,0.5)',fontSize:11,fontFamily:'monospace',cursor:'pointer'}}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );

  /* ── Render ── */
  return (
    <div style={{minHeight:'100vh',background:'#030712',color:'#f1f5f9',position:'relative'}}>
      <NeuralBackground/>
      <div style={{position:'relative',zIndex:1}}>
        <PortalNav
          companyName={client?.company ? `${client.company} — Manav Brain` : 'Manav Brain Intelligence'}
          projects={projects} selectedProjectId={selProjId} onProjectChange={setSelProjId}
        />

        <div style={{maxWidth:1200,margin:'0 auto',padding:'32px 24px',display:'flex',flexDirection:'column',gap:28}}>

          {/* ── HERO HEADER ── */}
          <div style={{textAlign:'center',padding:'20px 0 8px'}}>
            <div style={{fontSize:10,fontFamily:'monospace',color:'#6366f1',letterSpacing:'0.3em',marginBottom:8,textTransform:'uppercase'}}>
              ◈ NEURAL INTELLIGENCE SYSTEM ◈
            </div>
            <h1 style={{fontSize:48,fontWeight:900,margin:'0 0 6px',background:'linear-gradient(135deg,#00d4ff,#a78bfa,#10b981)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',fontFamily:'monospace',letterSpacing:'-0.02em',lineHeight:1}}>
              MANAV BRAIN
            </h1>
            <p style={{fontSize:12,color:'rgba(255,255,255,0.3)',fontFamily:'monospace',letterSpacing:'0.15em',margin:0}}>
              ADAPTIVE SEO INTELLIGENCE · LEARNS FROM EVERY AI GENERATION
            </p>
          </div>

          {/* ── INTELLIGENCE DASHBOARD ── */}
          <div style={{display:'grid',gridTemplateColumns:'auto 1fr auto',gap:24,alignItems:'center',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:20,padding:24}}>

            {/* Brain level */}
            <CircleGauge value={level} color="#6366f1" size={100} label="INTELLIGENCE" sublabel={`LEVEL ${level}`}/>

            {/* Stats row */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
              {[
                { val: active.length,    label: 'ACTIVE PATHWAYS',  color: '#10b981', sub: 'approved learnings' },
                { val: pending.length,   label: 'PENDING REVIEW',   color: '#fbbf24', sub: 'awaiting your decision' },
                { val: totalApplied,     label: 'TIMES DEPLOYED',   color: '#6366f1', sub: 'injected into AI prompts' },
                { val: [...new Set(active.map(l => l.source))].length, label: 'DATA SOURCES', color: '#06b6d4', sub: 'learning channels active' },
              ].map(s => (
                <div key={s.label} style={{textAlign:'center',background:'rgba(255,255,255,0.03)',borderRadius:12,padding:'14px 10px',border:`1px solid ${s.color}18`}}>
                  <div style={{fontSize:30,fontWeight:900,color:s.color,fontFamily:'monospace',lineHeight:1,textShadow:`0 0 20px ${s.color}60`}}>
                    {s.val}
                  </div>
                  <div style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.4)',marginTop:4,letterSpacing:'0.1em',textTransform:'uppercase'}}>{s.label}</div>
                  <div style={{fontSize:9,color:'rgba(255,255,255,0.2)',marginTop:2}}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Refresh */}
            <button onClick={load} disabled={loading} style={{background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.3)',borderRadius:10,padding:'10px 14px',color:'#a5b4fc',cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontSize:10,fontFamily:'monospace'}}>
              <RefreshCw size={12} style={loading ? {animation:'spin 1s linear infinite'} : {}}/>
              SYNC
            </button>
          </div>

          {/* ── DIMENSION RADAR + TIMELINE ── */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>

            {/* Radar */}
            <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:20,padding:24}}>
              <div style={{fontSize:10,fontFamily:'monospace',color:'rgba(255,255,255,0.3)',letterSpacing:'0.15em',marginBottom:16,textTransform:'uppercase'}}>◈ DOMAIN INTELLIGENCE MAP</div>
              <div style={{display:'flex',gap:16,alignItems:'center'}}>
                <div style={{width:200,height:200,flexShrink:0}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="rgba(255,255,255,0.07)" />
                      <PolarAngleAxis dataKey="dimension" tick={{fontSize:9,fill:'rgba(255,255,255,0.4)',fontFamily:'monospace'}} />
                      <Radar name="Intelligence" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{flex:1,display:'flex',flexDirection:'column',gap:10}}>
                  {DIM_CONFIG.map(d => (
                    <div key={d.key}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                        <span style={{fontSize:10,fontFamily:'monospace',color:'rgba(255,255,255,0.45)',letterSpacing:'0.05em'}}>{d.label.toUpperCase()}</span>
                        <span style={{fontSize:10,fontFamily:'monospace',color:d.color,fontWeight:700}}>{dimScores[d.key] || 0}</span>
                      </div>
                      <div style={{height:4,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${dimScores[d.key] || 0}%`,background:d.color,borderRadius:2,boxShadow:`0 0 8px ${d.glow}`,transition:'width 0.8s ease'}}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Growth timeline */}
            <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:20,padding:24}}>
              <div style={{fontSize:10,fontFamily:'monospace',color:'rgba(255,255,255,0.3)',letterSpacing:'0.15em',marginBottom:4,textTransform:'uppercase'}}>◈ NEURAL GROWTH TIMELINE</div>
              <div style={{fontSize:9,color:'rgba(255,255,255,0.2)',marginBottom:16,fontFamily:'monospace'}}>LEARNINGS CAPTURED OVER LAST 14 DAYS</div>
              <div style={{height:160}}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineData} margin={{top:5,right:5,bottom:0,left:-20}}>
                    <defs>
                      <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="pendingGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{fontSize:8,fill:'rgba(255,255,255,0.2)',fontFamily:'monospace'}} axisLine={false} tickLine={false} interval={3}/>
                    <Tooltip
                      contentStyle={{background:'#0a0f1e',border:'1px solid rgba(99,102,241,0.3)',borderRadius:8,fontSize:10,fontFamily:'monospace'}}
                      labelStyle={{color:'rgba(255,255,255,0.6)'}}
                    />
                    <Area type="monotone" dataKey="active"  stroke="#10b981" fill="url(#activeGrad)"  strokeWidth={1.5} name="Active"/>
                    <Area type="monotone" dataKey="pending" stroke="#fbbf24" fill="url(#pendingGrad)" strokeWidth={1.5} name="Pending"/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── PENDING BANNER (if any) ── */}
          {pending.length > 0 && (
            <div style={{background:'linear-gradient(135deg,rgba(251,191,36,0.06),rgba(251,191,36,0.02))',border:'1px solid rgba(251,191,36,0.25)',borderRadius:16,padding:'14px 20px',display:'flex',alignItems:'center',gap:12,cursor:'pointer'}} onClick={() => setTab('pending')}>
              <div style={{width:8,height:8,borderRadius:'50%',background:'#fbbf24',boxShadow:'0 0 12px #fbbf24',animation:'pulse 2s infinite'}}/>
              <div style={{flex:1}}>
                <span style={{fontSize:12,fontWeight:700,color:'#fbbf24',fontFamily:'monospace'}}>
                  {pending.length} INTELLIGENCE BRIEFING{pending.length !== 1 ? 'S' : ''} AWAITING YOUR REVIEW
                </span>
                <span style={{fontSize:11,color:'rgba(255,255,255,0.35)',marginLeft:10}}>
                  Auto-captured from AI outputs — approve to integrate into the brain
                </span>
              </div>
              <span style={{fontSize:10,color:'#fbbf24',fontFamily:'monospace',fontWeight:700}}>REVIEW →</span>
            </div>
          )}

          {/* ── MAIN LEARNING PANEL ── */}
          <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:20,overflow:'hidden'}}>

            {/* Tab bar */}
            <div style={{display:'flex',borderBottom:'1px solid rgba(255,255,255,0.06)',background:'rgba(0,0,0,0.2)'}}>
              {([
                { id: 'pending',  label: `PENDING REVIEW (${pending.length})`,   color: '#fbbf24' },
                { id: 'active',   label: `ACTIVE PATHWAYS (${active.length})`,   color: '#10b981' },
                { id: 'rejected', label: `DISMISSED (${rejected.length})`,       color: '#ef4444' },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{flex:1,padding:'14px 16px',background:'none',border:'none',cursor:'pointer',fontSize:9,fontFamily:'monospace',letterSpacing:'0.12em',fontWeight:700,color:tab===t.id ? t.color : 'rgba(255,255,255,0.25)',borderBottom:tab===t.id ? `2px solid ${t.color}` : '2px solid transparent',transition:'all 0.2s'}}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div style={{display:'flex',gap:10,padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,0.04)',flexWrap:'wrap',alignItems:'center'}}>
              <div style={{position:'relative',flex:1,minWidth:180}}>
                <Search size={11} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'rgba(255,255,255,0.2)'}}/>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search intelligence..."
                  style={{width:'100%',paddingLeft:30,paddingRight:12,height:32,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,fontSize:11,color:'rgba(255,255,255,0.7)',outline:'none',fontFamily:'monospace',boxSizing:'border-box'}}/>
              </div>
              <select value={dimFilter} onChange={e => setDimFilter(e.target.value)}
                style={{height:32,padding:'0 10px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,fontSize:10,color:'rgba(255,255,255,0.5)',outline:'none',fontFamily:'monospace',cursor:'pointer'}}>
                <option value="all">ALL DOMAINS</option>
                {DIM_CONFIG.map(d => <option key={d.key} value={d.key}>{d.label.toUpperCase()}</option>)}
              </select>
              {tab === 'pending' && pending.length > 0 && (
                <div style={{display:'flex',gap:6,marginLeft:'auto'}}>
                  <button
                    onClick={async () => { for (const l of pending.slice(0,5)) await handleApprove(l.id); }}
                    style={{background:'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(6,182,212,0.15))',border:'1px solid rgba(16,185,129,0.3)',borderRadius:8,padding:'6px 14px',color:'#10b981',fontSize:9,fontFamily:'monospace',fontWeight:700,cursor:'pointer',letterSpacing:'0.08em'}}>
                    ⚡ APPROVE ALL
                  </button>
                  <button
                    onClick={async () => { for (const l of pending) await handleReject(l.id); }}
                    style={{background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,padding:'6px 14px',color:'#ef4444',fontSize:9,fontFamily:'monospace',fontWeight:700,cursor:'pointer',letterSpacing:'0.08em'}}>
                    DISMISS ALL
                  </button>
                </div>
              )}
            </div>

            {/* List */}
            <div style={{padding:16,display:'flex',flexDirection:'column',gap:10,minHeight:200}}>
              {loading && (
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:48,gap:10,color:'rgba(255,255,255,0.3)'}}>
                  <RefreshCw size={16} style={{animation:'spin 1s linear infinite', color:'#6366f1'}}/>
                  <span style={{fontFamily:'monospace',fontSize:12}}>LOADING INTELLIGENCE DATA...</span>
                </div>
              )}

              {/* Algorithm freshness notification */}
            {tab === 'active' && !staleDismissed && staleLearnings.length > 0 && (
              <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 14px',background:'rgba(251,191,36,0.05)',border:'1px solid rgba(251,191,36,0.25)',borderRadius:10,marginBottom:12}}>
                <span style={{fontSize:16,flexShrink:0}}>⚡</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#fbbf24'}}>
                    Algorithm Update — {staleLearnings.length} active learning{staleLearnings.length !== 1 ? 's' : ''} may be outdated
                  </div>
                  <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginTop:2,marginBottom:8}}>
                    A new algorithm topic was saved to your library. These learnings were created before the update and may reference outdated signals. Review them using DEEPEN WITH BRAIN or mark as current.
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {staleLearnings.slice(0,4).map(l => (
                      <span key={l.id} style={{fontSize:9,fontFamily:'monospace',color:'rgba(251,191,36,0.8)',background:'rgba(251,191,36,0.08)',border:'1px solid rgba(251,191,36,0.2)',borderRadius:4,padding:'2px 7px'}}>
                        {l.card_title.slice(0,40)}
                      </span>
                    ))}
                    {staleLearnings.length > 4 && <span style={{fontSize:9,color:'rgba(255,255,255,0.3)',fontFamily:'monospace'}}>+{staleLearnings.length-4} more</span>}
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0}}>
                  <button onClick={() => { setTab('active'); setDimFilter('all'); }} style={{background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.3)',borderRadius:6,padding:'5px 10px',cursor:'pointer',color:'#fbbf24',fontSize:9,fontFamily:'monospace',fontWeight:700}}>
                    REVIEW
                  </button>
                  <button onClick={() => { handleMarkFresh(staleLearnings.map(l=>l.id)); setStaleDismissed(true); }} style={{background:'none',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,padding:'5px 10px',cursor:'pointer',color:'rgba(255,255,255,0.3)',fontSize:9,fontFamily:'monospace'}}>
                    MARK ALL FRESH
                  </button>
                </div>
              </div>
            )}
            {/* Auto-approve banner for system learnings */}
              {tab === 'pending' && !loading && systemPendingCount > 0 && (
                <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:10,marginBottom:12}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#10b981'}}>⚡ {systemPendingCount} system learnings ready for instant activation</div>
                    <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginTop:2}}>Technical facts, audit findings &amp; high-confidence (≥85) learnings — objective data, no approval needed.</div>
                  </div>
                  <button onClick={handleBatchApproveSystem} style={{background:'linear-gradient(135deg,rgba(16,185,129,0.2),rgba(6,182,212,0.15))',border:'1px solid rgba(16,185,129,0.4)',borderRadius:8,padding:'7px 14px',cursor:'pointer',color:'#10b981',fontSize:10,fontFamily:'monospace',fontWeight:700,whiteSpace:'nowrap'}}>
                    ACTIVATE ALL
                  </button>
                </div>
              )}
              {!loading && filtered.length === 0 && (
                <div style={{textAlign:'center',padding:'48px 16px'}}>
                  <Brain size={40} style={{color:'rgba(255,255,255,0.05)',margin:'0 auto 16px'}}/>
                  <div style={{fontSize:12,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',marginBottom:6}}>
                    {tab === 'pending'
                      ? 'NO PENDING INTELLIGENCE — BRAIN IS FULLY REVIEWED'
                      : tab === 'active'
                      ? 'NO ACTIVE PATHWAYS — APPROVE SOME LEARNINGS FIRST'
                      : 'NO DISMISSED INTELLIGENCE'}
                  </div>
                  {tab === 'pending' && (
                    <p style={{fontSize:11,color:'rgba(255,255,255,0.15)',maxWidth:400,margin:'0 auto',lineHeight:1.6}}>
                      Manav Brain automatically captures learnings from every AI generation in the app.
                      They appear here for your review before being integrated.
                    </p>
                  )}
                </div>
              )}

              {!loading && filtered.filter(l => l?.id).map(l => (
                <LearningCard
                  key={l.id}
                  l={l}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onEnrich={handleEnrich}
                  onDelete={handleDelete}
                  onDeactivate={handleDeactivate}
                  onEdit={(learning) => { setEditingL(learning); setEditText(learning.improvement || ''); }}
                />
              ))}
            </div>
          </div>

          {/* ── HOW IT WORKS ── */}
          <div style={{background:'rgba(99,102,241,0.04)',border:'1px solid rgba(99,102,241,0.12)',borderRadius:16,padding:'18px 22px'}}>
            <div style={{fontSize:10,fontFamily:'monospace',color:'#a5b4fc',letterSpacing:'0.15em',marginBottom:12,textTransform:'uppercase'}}>◈ HOW MANAV BRAIN LEARNS</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20}}>
              {[
                { step:'01', title:'AUTO-CAPTURE', desc:'Every AI output across the app — audits, strategy, task execution, deep dives — is automatically analysed and distilled into a learning.' },
                { step:'02', title:'YOUR REVIEW', desc:'You decide what enters the brain. Pending learnings wait for your approval. Approve what resonates, dismiss what doesn\'t.' },
                { step:'03', title:'COMPOUNDING INTELLIGENCE', desc:'Active learnings are injected into every future AI prompt of the matching type. The brain gets smarter with every task completed.' },
              ].map(s => (
                <div key={s.step} style={{display:'flex',gap:12}}>
                  <div style={{fontFamily:'monospace',fontSize:20,fontWeight:900,color:'rgba(99,102,241,0.3)',lineHeight:1,flexShrink:0}}>{s.step}</div>
                  <div>
                    <div style={{fontSize:10,fontFamily:'monospace',color:'#a5b4fc',fontWeight:700,marginBottom:5,letterSpacing:'0.08em'}}>{s.title}</div>
                    <p style={{fontSize:11,color:'rgba(255,255,255,0.3)',lineHeight:1.6,margin:0}}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      <EditModal/>

      <style>{`
        @keyframes spin   { from { transform: rotate(0deg);   } to { transform: rotate(360deg); } }
        @keyframes pulse  { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
      {enrichTarget && (() => {
        // Only render if we found the exact learning — never pass empty object
        const enrichLearning = learnings.find(x => x.id === enrichTarget);
        if (!enrichLearning) return null;
        return (
          <DeepEnrichModal
            learning={enrichLearning as any}
            projectUrl={''}
            onClose={() => setEnrichTarget(null)}
            onSaved={(updates) => {
              setLearnings(ls => ls.map(x => x.id === enrichTarget ? { ...x, ...updates } as any : x));
              setEnrichTarget(null);
            }}
          />
        );
      })()}
    </div>
  );
}
