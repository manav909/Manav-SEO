import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import PortalNav from '@/components/PortalNav';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Sparkles, BarChart3, FileText, Download, Copy,
  Plus, Trash2, Save, RefreshCw, ChevronDown, ChevronUp,
  Zap, Target, Brain, Globe, Shield, Trophy, TrendingUp,
  Calendar, Layers, X, Tag, CheckCircle2, AlertTriangle,
  ArrowRight, Maximize2, Star, Send, MessageSquare,
  Clock, Flame, Minus, ChevronRight, RotateCcw
} from 'lucide-react';

/* ──────────────────────── types ──────────────────────── */
type BlockType = 'quick-win'|'weekly'|'monthly'|'technical'|'content'|'geo'|'competitive'|'insight'|'kpi'|'custom';
type Priority  = 'high'|'medium'|'low';
type Status    = 'todo'|'doing'|'done';
type Tab       = 'reports'|'strategy'|'canvas';
type Layout    = 'timeline'|'priority';

interface CanvasBlock {
  id:       string;
  type:     BlockType;
  title:    string;
  content:  string;
  color:    string;
  priority: Priority;
  status:   Status;
  week:     number; // 1–4 = weeks, 5 = backlog
  effort?:  string;
  impact?:  string;
  tags?:    string[];
  source?:  string;
}

/* ──────────────────────── constants ──────────────────────── */
const TYPE_META: Record<BlockType,{label:string;icon:any;color:string;bg:string;border:string}> = {
  'quick-win':   {label:'Quick Win',   icon:Zap,        color:'#4ade80',bg:'bg-green-400/10', border:'border-green-400/25' },
  'weekly':      {label:'Weekly',      icon:Calendar,   color:'#60a5fa',bg:'bg-blue-400/10',  border:'border-blue-400/25'  },
  'monthly':     {label:'Monthly',     icon:Layers,     color:'#a78bfa',bg:'bg-purple-400/10',border:'border-purple-400/25'},
  'technical':   {label:'Technical',   icon:Shield,     color:'#06b6d4',bg:'bg-cyan-400/10',  border:'border-cyan-400/25'  },
  'content':     {label:'Content',     icon:FileText,   color:'#facc15',bg:'bg-yellow-400/10',border:'border-yellow-400/25'},
  'geo':         {label:'GEO',         icon:Globe,      color:'#6366f1',bg:'bg-indigo-400/10',border:'border-indigo-400/25'},
  'competitive': {label:'Competitive', icon:Trophy,     color:'#fb923c',bg:'bg-orange-400/10',border:'border-orange-400/25'},
  'insight':     {label:'Insight',     icon:Brain,      color:'#f472b6',bg:'bg-pink-400/10',  border:'border-pink-400/25'  },
  'kpi':         {label:'KPI',         icon:TrendingUp, color:'#34d399',bg:'bg-emerald-400/10',border:'border-emerald-400/25'},
  'custom':      {label:'Custom',      icon:Star,       color:'#94a3b8',bg:'bg-slate-400/10', border:'border-slate-400/25' },
};

const PRIORITY_META: Record<Priority,{dot:string;badge:string}> = {
  high:   {dot:'bg-red-400',   badge:'text-red-400 bg-red-400/10 border-red-400/20'   },
  medium: {dot:'bg-yellow-400',badge:'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'},
  low:    {dot:'bg-green-400', badge:'text-green-400 bg-green-400/10 border-green-400/20'},
};

const STATUS_CYCLE: Record<Status, Status> = { todo:'doing', doing:'done', done:'todo' };
const STATUS_META: Record<Status,{label:string;color:string;icon:any}> = {
  todo:  {label:'To Do',       color:'text-muted-foreground', icon:Clock       },
  doing: {label:'In Progress', color:'text-blue-400',         icon:RefreshCw   },
  done:  {label:'Done',        color:'text-green-400',        icon:CheckCircle2},
};

const COLUMNS = [
  {week:1, label:'Week 1',  sub:'Foundation'},
  {week:2, label:'Week 2',  sub:'Build'},
  {week:3, label:'Week 3',  sub:'Accelerate'},
  {week:4, label:'Week 4',  sub:'Compound'},
  {week:5, label:'Backlog', sub:'Long-term'},
];

const PRIORITY_COLS = [
  {key:'high' as Priority,   label:'High Priority',   color:'#ef4444'},
  {key:'medium' as Priority, label:'Medium Priority', color:'#eab308'},
  {key:'low' as Priority,    label:'Low Priority',    color:'#22c55e'},
];

/* ──────────────────────── helpers ──────────────────────── */
const uid     = () => Math.random().toString(36).slice(2, 9);
const safeStr = (v: any) => typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);
const fmtDate = (raw: string) => raw ? new Date(raw).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '';

/* Maps a strategy block's type/data to a timeline week */
function assignWeek(b: any): number {
  if (b.type === 'quick-win')   return 1;
  if (b.type === 'technical')   return (b.urgency === 'immediate' || b.urgency === 'this_week') ? 1 : 2;
  if (b.type === 'content')     return Math.min(b.week || 2, 4);
  if (b.type === 'geo')         return 2;
  if (b.type === 'weekly')      return 1;
  if (b.type === 'competitive') return 3;
  if (b.type === 'insight')     return 3;
  if (b.type === 'kpi')         return 5;
  if (b.type === 'monthly')     return 5;
  return 5;
}

/* Convert raw strategy canvas_blocks to CanvasBlock[] */
function seedBlocks(canvasBlocks: any[]): CanvasBlock[] {
  return canvasBlocks.map(b => ({
    id:       b.id || uid(),
    type:     (b.type || 'custom') as BlockType,
    title:    b.title || 'Untitled',
    content:  safeStr(b.content),
    color:    b.color || '#94a3b8',
    priority: (b.priority || 'medium') as Priority,
    status:   'todo' as Status,
    week:     assignWeek(b),
    effort:   b.effort,
    impact:   b.impact,
    tags:     b.tags || [],
    source:   b.source || '',
  }));
}

/* ──────────────────────── sub-components ──────────────────────── */

/** Compact block card used inside columns */
const BlockCard = ({
  block, onStatusToggle, onExpand, onDeepDive, onRemove, dragging, onDragStart,
}: {
  block: CanvasBlock;
  onStatusToggle: (id: string) => void;
  onExpand:       (b: CanvasBlock) => void;
  onDeepDive:     (b: CanvasBlock) => void;
  onRemove:       (id: string) => void;
  dragging:       boolean;
  onDragStart:    (e: React.DragEvent, id: string) => void;
}) => {
  const meta   = TYPE_META[block.type] || TYPE_META.custom;
  const pMeta  = PRIORITY_META[block.priority];
  const sMeta  = STATUS_META[block.status];
  const SIcon  = sMeta.icon;

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, block.id)}
      className={`rounded-xl border ${meta.border} ${meta.bg} p-3 group cursor-grab transition-all ${
        dragging ? 'opacity-40 scale-95' : 'hover:shadow-md hover:shadow-black/20'
      } ${block.status === 'done' ? 'opacity-60' : ''}`}
    >
      {/* Top row */}
      <div className="flex items-start gap-2 mb-2">
        <meta.icon size={11} style={{color: meta.color}} className="shrink-0 mt-0.5" />
        <p className={`text-xs font-semibold flex-1 leading-tight ${block.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
          {block.title}
        </p>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onDeepDive(block)} title="Deep Dive with AI"
            className="h-5 w-5 rounded flex items-center justify-center bg-background/60 hover:bg-primary/20 text-muted-foreground hover:text-primary">
            <Brain size={9} />
          </button>
          <button onClick={() => onExpand(block)} title="Expand"
            className="h-5 w-5 rounded flex items-center justify-center bg-background/60 hover:bg-background text-muted-foreground hover:text-foreground">
            <Maximize2 size={9} />
          </button>
          <button onClick={() => onRemove(block.id)} title="Remove"
            className="h-5 w-5 rounded flex items-center justify-center bg-background/60 hover:bg-red-400/20 text-muted-foreground hover:text-red-400">
            <X size={9} />
          </button>
        </div>
      </div>

      {/* Content snippet */}
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-2.5">
        {block.content}
      </p>

      {/* Bottom row */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${pMeta.dot}`} />
          <span className="text-xs text-muted-foreground font-mono">{block.priority}</span>
        </div>
        <button
          onClick={() => onStatusToggle(block.id)}
          className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border transition-colors ${
            block.status === 'done'  ? 'text-green-400 bg-green-400/10 border-green-400/20' :
            block.status === 'doing' ? 'text-blue-400 bg-blue-400/10 border-blue-400/20' :
            'text-muted-foreground border-border/50 hover:border-primary/30'
          }`}
        >
          <SIcon size={8} className={block.status === 'doing' ? 'animate-spin' : ''} />
          <span>{sMeta.label}</span>
        </button>
      </div>
    </div>
  );
};

/** Streaming markdown renderer for chat */
const ChatResponse = ({ text }: { text: string }) => (
  <div className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">
    {text.split('\n').map((line, i) => {
      if (line.startsWith('# '))  return <div key={i} className="font-bold text-base mt-3 mb-1">{line.slice(2)}</div>;
      if (line.startsWith('## ')) return <div key={i} className="font-semibold text-sm mt-2 mb-1 text-primary">{line.slice(3)}</div>;
      if (/^[-*]\s/.test(line))   return <div key={i} className="flex gap-2 my-0.5"><span className="text-primary shrink-0 mt-1">•</span><span dangerouslySetInnerHTML={{__html: line.slice(2).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}} /></div>;
      if (line.trim() === '')     return <div key={i} className="h-2" />;
      return <p key={i} className="my-0.5" dangerouslySetInnerHTML={{__html: line.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}} />;
    })}
  </div>
);

/* ════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════ */
export default function Playground() {
  const { clients, projects } = useAuth();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [tab,               setTab]               = useState<Tab>('reports');
  const [reports,           setReports]           = useState<any[]>([]);
  const [strategy,          setStrategy]          = useState<any>(null);
  const [generating,        setGenerating]        = useState(false);
  const [generatedAt,       setGeneratedAt]       = useState('');
  const [expandedReport,    setExpandedReport]    = useState<string|null>(null);

  /* Canvas state */
  const [blocks,        setBlocks]        = useState<CanvasBlock[]>([]);
  const [layout,        setLayout]        = useState<Layout>('timeline');
  const [filterStatus,  setFilterStatus]  = useState<Status|'all'>('all');
  const [filterType,    setFilterType]    = useState<BlockType|'all'>('all');
  const [expandedBlock, setExpandedBlock] = useState<CanvasBlock|null>(null);
  const [draggingId,    setDraggingId]    = useState<string|null>(null);
  const [dragOver,      setDragOver]      = useState<number|string|null>(null);

  /* AI chat state */
  const [chatQ,         setChatQ]         = useState('');
  const [chatResp,      setChatResp]      = useState('');
  const [chatLoading,   setChatLoading]   = useState(false);
  const [deepDiveBlock, setDeepDiveBlock] = useState<CanvasBlock|null>(null);
  const [deepDiveText,  setDeepDiveText]  = useState('');
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);

  /* Custom block */
  const [customTitle,   setCustomTitle]   = useState('');
  const [customContent, setCustomContent] = useState('');
  const [showAddBlock,  setShowAddBlock]  = useState(false);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const chatEndRef    = useRef<HTMLDivElement>(null);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const client          = clients.find(c => c.id === selectedProject?.client_id);

  /* ── visible blocks after filter ── */
  const visibleBlocks = blocks.filter(b =>
    (filterStatus === 'all' || b.status === filterStatus) &&
    (filterType   === 'all' || b.type   === filterType)
  );

  /* ── stats ── */
  const totalBlocks = blocks.length;
  const doneBlocks  = blocks.filter(b => b.status === 'done').length;
  const doingBlocks = blocks.filter(b => b.status === 'doing').length;
  const progress    = totalBlocks > 0 ? Math.round((doneBlocks / totalBlocks) * 100) : 0;

  /* ── column stats ── */
  const colStats = COLUMNS.map(col => {
    const inCol  = blocks.filter(b => b.week === col.week);
    const done   = inCol.filter(b => b.status === 'done').length;
    return { ...col, total: inCol.length, done };
  });

  /* ── Load project ── */
  useEffect(() => {
    if (!selectedProjectId) { setReports([]); setStrategy(null); setBlocks([]); return; }
    loadProject();
  }, [selectedProjectId]);

  const loadProject = async () => {
    const [repRes, projRes] = await Promise.all([
      supabase.from('audit_reports').select('*').eq('project_id', selectedProjectId).order('created_at', { ascending: false }).limit(20),
      supabase.from('projects').select('playground_strategy,playground_canvas,playground_generated_at').eq('id', selectedProjectId).single(),
    ]);
    setReports(repRes.data || []);
    if (projRes.data?.playground_strategy) {
      setStrategy(projRes.data.playground_strategy);
      setGeneratedAt(projRes.data.playground_generated_at || '');
    }
    if (projRes.data?.playground_canvas?.length) {
      setBlocks(projRes.data.playground_canvas);
    } else if (projRes.data?.playground_strategy?.canvas_blocks?.length) {
      setBlocks(seedBlocks(projRes.data.playground_strategy.canvas_blocks));
    }
  };

  /* ── Generate strategy ── */
  const generateStrategy = async () => {
    if (!selectedProject) return toast({ title: 'Select a project first', variant: 'destructive' });
    setGenerating(true);
    try {
      const clientData = clients.find(c => c.id === selectedProject.client_id);
      const [metricsRes, rankingsRes] = await Promise.all([
        supabase.from('metrics').select('*').eq('project_id', selectedProjectId).order('recorded_at', { ascending: false }).limit(4),
        supabase.from('metrics').select('keyword_rankings').eq('project_id', selectedProjectId).order('recorded_at', { ascending: false }).limit(1),
      ]);
      const auditContent = reports.map(r => ({
        created_at: r.created_at,
        sections: Object.fromEntries(Object.entries(r.sections || {}).map(([k, v]) => [k, safeStr(v).slice(0, 300)])),
      }));
      const res = await fetch('/api/playground-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: selectedProject, client: clientData,
          metrics: metricsRes.data || [],
          keywordRankings: rankingsRes.data?.[0]?.keyword_rankings || [],
          auditReports: auditContent,
          competitors: selectedProject.competitors || [],
          allKeywords: selectedProject.keywords || [],
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setStrategy(data.strategy);
      setGeneratedAt(data.generated_at);
      const newBlocks = seedBlocks(data.strategy.canvas_blocks || []);
      setBlocks(newBlocks);
      await supabase.from('projects').update({
        playground_strategy: data.strategy,
        playground_canvas: newBlocks,
        playground_generated_at: data.generated_at,
      }).eq('id', selectedProjectId);
      toast({ title: '🧠 Strategy ready!', description: `${newBlocks.length} blocks loaded on canvas.` });
      setTab('canvas');
    } catch (err: any) {
      toast({ title: 'Generation failed', description: err.message, variant: 'destructive' });
    }
    setGenerating(false);
  };

  /* ── Canvas actions ── */
  const toggleStatus = (id: string) => {
    setBlocks(bs => bs.map(b => b.id === id ? { ...b, status: STATUS_CYCLE[b.status] } : b));
    scheduleAutoSave();
  };

  const removeBlock = (id: string) => {
    setBlocks(bs => bs.filter(b => b.id !== id));
    scheduleAutoSave();
  };

  const resetCanvas = () => {
    if (!strategy?.canvas_blocks) return;
    const fresh = seedBlocks(strategy.canvas_blocks);
    setBlocks(fresh);
    scheduleAutoSave();
    toast({ title: 'Canvas reset to original strategy' });
  };

  const addCustomBlock = () => {
    if (!customTitle.trim()) return;
    const nb: CanvasBlock = {
      id: uid(), type: 'custom', title: customTitle, content: customContent || 'Custom planning block.',
      color: '#94a3b8', priority: 'medium', status: 'todo', week: 5,
      tags: ['custom'], source: 'Manual',
    };
    setBlocks(bs => [...bs, nb]);
    setCustomTitle(''); setCustomContent(''); setShowAddBlock(false);
    scheduleAutoSave();
  };

  /* ── Drag & drop between columns ── */
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('blockId', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  };

  const handleDragOver = (e: React.DragEvent, colKey: number | string) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(colKey);
  };

  const handleDrop = (e: React.DragEvent, colKey: number | string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('blockId');
    if (!id) return;
    if (layout === 'timeline') {
      setBlocks(bs => bs.map(b => b.id === id ? { ...b, week: colKey as number } : b));
    } else {
      setBlocks(bs => bs.map(b => b.id === id ? { ...b, priority: colKey as Priority } : b));
    }
    setDraggingId(null); setDragOver(null); scheduleAutoSave();
  };

  const handleDragEnd = () => { setDraggingId(null); setDragOver(null); };

  /* ── AI: Ask the Canvas ── */
  const askCanvas = async () => {
    if (!chatQ.trim() || chatLoading) return;
    setChatLoading(true); setChatResp('');
    const projectSummary = `${client?.company || 'Client'} | ${selectedProject?.url || ''} | ${client?.industry || ''}`;
    try {
      const res = await fetch('/api/canvas-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: chatQ, blocks: visibleBlocks, projectSummary }),
      });
      if (!res.ok || !res.body) throw new Error('Request failed');
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let acc = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        acc += decoder.decode(value, { stream: true }); setChatResp(acc);
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err: any) { setChatResp(`Error: ${err.message}`); }
    setChatLoading(false);
  };

  /* ── AI: Deep Dive on block ── */
  const deepDive = async (block: CanvasBlock) => {
    setDeepDiveBlock(block); setDeepDiveText(''); setDeepDiveLoading(true);
    const projectSummary = `${client?.company || 'Client'} | ${selectedProject?.url || ''} | ${client?.industry || ''}`;
    try {
      const res = await fetch('/api/canvas-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focusBlockId: block.id, blocks, projectSummary }),
      });
      if (!res.ok || !res.body) throw new Error('Request failed');
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let acc = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        acc += decoder.decode(value, { stream: true }); setDeepDiveText(acc);
      }
    } catch (err: any) { setDeepDiveText(`Error: ${err.message}`); }
    setDeepDiveLoading(false);
  };

  /* ── Auto-save ── */
  const scheduleAutoSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      if (!selectedProjectId) return;
      await supabase.from('projects').update({ playground_canvas: blocks }).eq('id', selectedProjectId);
    }, 1500);
  };

  useEffect(() => { if (blocks.length && selectedProjectId) scheduleAutoSave(); }, [blocks]);

  /* ── Report helpers ── */
  const downloadReport = (r: any, type: string) => {
    const blob = new Blob([safeStr(r.sections?.[type])], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${type}-audit-${r.created_at?.split('T')[0]}.md`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  const copyReport = async (r: any, type: string) => {
    await navigator.clipboard.writeText(safeStr(r.sections?.[type]));
    toast({ title: 'Copied!' });
  };

  /* ── Section wrapper ── */
  const Section = ({ title, icon: Icon, color, children, open: defaultOpen = false }: any) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
      <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-secondary/20 transition-colors">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{background:`${color}18`,border:`1px solid ${color}28`}}>
            <Icon size={14} style={{color}} />
          </div>
          <span className="font-semibold text-sm flex-1">{title}</span>
          {open ? <ChevronUp size={14} className="text-muted-foreground"/> : <ChevronDown size={14} className="text-muted-foreground"/>}
        </button>
        {open && <div className="px-5 pb-5 border-t border-border/50">{children}</div>}
      </div>
    );
  };

  const s = strategy;

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav
        companyName={client?.company ? `${client.company} — Playground` : 'Intelligence Playground'}
        projects={projects} selectedProjectId={selectedProjectId} onProjectChange={setSelectedProjectId}
      />

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold mb-1 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary"/>Intelligence Playground
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              All your audits, metrics, and rankings analysed by AI into a living strategy canvas.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {generatedAt && <span className="text-xs font-mono text-muted-foreground">Updated {fmtDate(generatedAt)}</span>}
            <Button onClick={generateStrategy} disabled={generating || !selectedProjectId}
              className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
              {generating
                ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin"/>Analysing…</>
                : <><Brain className="h-4 w-4 mr-2"/>{strategy ? 'Regenerate' : 'Generate Strategy'}</>}
            </Button>
          </div>
        </div>

        {/* Project picker if none selected */}
        {!selectedProjectId && (
          <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
            <Brain className="h-12 w-12 text-primary/30 mx-auto mb-4"/>
            <h3 className="font-bold text-lg mb-2">Select a project</h3>
            <p className="text-sm text-muted-foreground mb-4">Choose a project to load its intelligence playground</p>
            <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background/60 text-sm px-4">
              <option value="">— Choose project —</option>
              {clients.map(c => {
                const cp = projects.filter(p => p.client_id === c.id);
                if (!cp.length) return null;
                return (
                  <optgroup key={c.id} label={`${c.name} — ${c.company}`}>
                    {cp.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </div>
        )}

        {/* Tabs */}
        {selectedProjectId && (
          <>
            <div className="flex gap-1 border-b border-border">
              {([
                {id:'reports',  label:'Reports Library',      icon:FileText },
                {id:'strategy', label:'Strategy Intelligence', icon:Brain   },
                {id:'canvas',   label:'Strategy Canvas',       icon:Layers  },
              ] as const).map(({id,label,icon:Icon}) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    tab===id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}>
                  <Icon size={14}/>{label}
                  {id==='canvas' && blocks.length > 0 && (
                    <span className="text-xs bg-primary/10 text-primary rounded-full px-1.5">{blocks.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* ══ REPORTS ══ */}
            {tab === 'reports' && (
              <div className="space-y-4">
                {reports.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3"/>
                    <h3 className="font-semibold mb-1">No reports saved yet</h3>
                    <p className="text-sm text-muted-foreground">Run audits from the Audit Tool — they auto-save here.</p>
                  </div>
                ) : reports.map(report => {
                  const types = Object.keys(report.sections || {});
                  const expanded = expandedReport === report.id;
                  return (
                    <div key={report.id} className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                      <button onClick={() => setExpandedReport(expanded ? null : report.id)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-colors">
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-semibold">{fmtDate(report.created_at)}</span>
                          <div className="flex gap-1.5">
                            {types.map(t => (
                              <span key={t} className="text-xs px-2 py-0.5 rounded-full border border-border bg-secondary/40 text-muted-foreground font-mono">{t}</span>
                            ))}
                          </div>
                          {report.synced_to_metrics && (
                            <span className="text-xs text-green-400 font-mono flex items-center gap-1">
                              <CheckCircle2 size={10}/>Synced
                            </span>
                          )}
                        </div>
                        {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                      </button>
                      {expanded && (
                        <div className="border-t border-border px-5 py-4 space-y-4">
                          {types.map(type => (
                            <div key={type} className="rounded-xl border border-border bg-background/40 overflow-hidden">
                              <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/30 border-b border-border">
                                <span className="text-xs font-semibold font-mono">{type} Audit</span>
                                <div className="flex gap-2">
                                  <button onClick={() => copyReport(report, type)}
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border bg-background/60">
                                    <Copy size={10}/>Copy
                                  </button>
                                  <button onClick={() => downloadReport(report, type)}
                                    className="flex items-center gap-1 text-xs text-primary px-2 py-1 rounded border border-primary/30 bg-primary/5">
                                    <Download size={10}/>Download .md
                                  </button>
                                </div>
                              </div>
                              <div className="p-4 max-h-72 overflow-y-auto">
                                <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono">
                                  {safeStr(report.sections[type]).slice(0, 3000)}
                                  {safeStr(report.sections[type]).length > 3000 ? '\n\n[truncated — download for full report]' : ''}
                                </pre>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ══ STRATEGY ══ */}
            {tab === 'strategy' && (
              <div className="space-y-4">
                {!strategy ? (
                  <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
                    <Brain className="h-12 w-12 text-primary/30 mx-auto mb-4"/>
                    <h3 className="font-bold text-lg mb-2">Generate Your Deep Strategy</h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                      Claude analyses every audit, metric, keyword ranking, and competitor gap — then builds a full strategic brief with weekly plans, monthly roadmap, content calendar, and canvas blocks.
                    </p>
                    <Button onClick={generateStrategy} disabled={generating}
                      className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                      <Brain className="h-4 w-4 mr-2"/>Generate Strategy
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <Star className="h-4 w-4 text-primary"/>
                        <span className="font-semibold">Executive Summary</span>
                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border font-mono ${
                          s.overall_health==='Strong'||s.overall_health==='Excellent' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                          s.overall_health==='Building' ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' :
                          'text-orange-400 bg-orange-400/10 border-orange-400/20'
                        }`}>{s.overall_health}</span>
                      </div>
                      <p className="text-sm leading-relaxed mb-4">{s.executive_summary}</p>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {s.biggest_opportunity && (
                          <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-3">
                            <div className="text-xs font-mono text-green-400 uppercase mb-1">Biggest Opportunity</div>
                            <p className="text-xs">{s.biggest_opportunity}</p>
                          </div>
                        )}
                        {s.biggest_risk && (
                          <div className="rounded-xl border border-orange-400/20 bg-orange-400/5 p-3">
                            <div className="text-xs font-mono text-orange-400 uppercase mb-1">Biggest Risk</div>
                            <p className="text-xs">{s.biggest_risk}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {s.quick_wins?.length > 0 && (
                      <Section title={`Quick Wins (${s.quick_wins.length})`} icon={Zap} color="#4ade80" open>
                        <div className="mt-4 grid sm:grid-cols-2 gap-3">
                          {s.quick_wins.map((w:any,i:number) => (
                            <div key={i} className="rounded-xl border border-green-400/20 bg-green-400/5 p-3">
                              <div className="font-semibold text-sm mb-1">{w.title}</div>
                              <p className="text-xs text-muted-foreground mb-2">{w.description}</p>
                              <div className="flex gap-1.5 flex-wrap">
                                <span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">{w.timeframe}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">effort:{w.effort}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">impact:{w.impact}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {s.weekly_plans?.length > 0 && (
                      <Section title="4-Week Action Plan" icon={Calendar} color="#60a5fa">
                        <div className="mt-4 space-y-3">
                          {s.weekly_plans.map((w:any) => (
                            <div key={w.week} className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-4">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="h-7 w-7 rounded-full bg-blue-400/10 border border-blue-400/30 flex items-center justify-center text-xs font-bold text-blue-400">{w.week}</div>
                                <div><div className="font-semibold text-sm">{w.theme}</div><div className="text-xs text-muted-foreground">{w.focus}</div></div>
                              </div>
                              <div className="space-y-1 mb-2">
                                {(w.tasks||[]).map((t:string,i:number) => (
                                  <div key={i} className="flex items-start gap-2 text-xs">
                                    <ChevronRight size={10} className="text-blue-400 shrink-0 mt-0.5"/>
                                    <span>{t}</span>
                                  </div>
                                ))}
                              </div>
                              {w.expected_outcome && <p className="text-xs text-blue-400/70 border-t border-blue-400/20 pt-2">→ {w.expected_outcome}</p>}
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {s.monthly_roadmap?.length > 0 && (
                      <Section title="3-Month Roadmap" icon={Layers} color="#a78bfa">
                        <div className="mt-4 grid sm:grid-cols-3 gap-4">
                          {s.monthly_roadmap.map((m:any) => (
                            <div key={m.month} className="rounded-xl border border-purple-400/20 bg-purple-400/5 p-4">
                              <div className="text-xs font-mono text-purple-400 uppercase mb-2">Month {m.month}</div>
                              <div className="font-semibold text-sm mb-1">{m.title}</div>
                              <p className="text-xs text-muted-foreground mb-3">{m.goal}</p>
                              {(m.deliverables||[]).map((d:string,i:number) => (
                                <div key={i} className="flex items-start gap-1.5 text-xs mb-1">
                                  <ChevronRight size={9} className="text-purple-400 shrink-0 mt-0.5"/>
                                  <span>{d}</span>
                                </div>
                              ))}
                              {m.score_targets && <p className="text-xs text-purple-400/70 mt-2 border-t border-purple-400/20 pt-2">{m.score_targets}</p>}
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {s.kpi_forecast?.length > 0 && (
                      <Section title="KPI Forecast" icon={TrendingUp} color="#34d399">
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="border-b border-border">
                              <th className="text-left py-2 pr-4 text-muted-foreground">Metric</th>
                              <th className="text-center py-2 px-3 text-muted-foreground">Now</th>
                              <th className="text-center py-2 px-3 text-emerald-400">30d</th>
                              <th className="text-center py-2 px-3 text-emerald-400/70">60d</th>
                              <th className="text-center py-2 px-3 text-emerald-400/50">90d</th>
                            </tr></thead>
                            <tbody>
                              {s.kpi_forecast.map((k:any,i:number) => (
                                <tr key={i} className="border-b border-border/40">
                                  <td className="py-2 pr-4 font-medium">{k.metric}</td>
                                  <td className="text-center py-2 px-3 text-muted-foreground">{k.now ?? k.current}</td>
                                  <td className="text-center py-2 px-3 text-emerald-400 font-semibold">{k.d30 ?? k.target_30d}</td>
                                  <td className="text-center py-2 px-3 text-emerald-400/70">{k.d60 ?? k.target_60d}</td>
                                  <td className="text-center py-2 px-3 text-emerald-400/50">{k.d90 ?? k.target_90d}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Section>
                    )}

                    {s.retainer_value_summary && (
                      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                        <div className="flex items-center gap-2 mb-3"><Trophy className="h-4 w-4 text-primary"/><span className="font-semibold text-sm">Retainer Value</span></div>
                        <p className="text-sm mb-4">{s.retainer_value_summary.narrative || s.retainer_value_summary.roi_narrative}</p>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="rounded-xl border border-border bg-background/40 p-3 text-center">
                            <div className="text-lg font-bold text-primary">{s.retainer_value_summary.projection || s.retainer_value_summary.score_gain_projection}</div>
                            <div className="text-xs text-muted-foreground">Score Growth</div>
                          </div>
                          <div className="rounded-xl border border-border bg-background/40 p-3 text-center">
                            <div className="text-lg font-bold text-green-400">{s.retainer_value_summary.ranking_win || s.retainer_value_summary.ranking_improvements}</div>
                            <div className="text-xs text-muted-foreground">Ranking Improvements</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <Button onClick={() => setTab('canvas')}
                      className="w-full h-12 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
                      <Layers className="h-4 w-4 mr-2"/>Open Strategy Canvas →
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* ══ CANVAS ══ */}
            {tab === 'canvas' && (
              <div className="space-y-4">

                {!blocks.length && !strategy ? (
                  <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
                    <Layers size={48} className="text-muted-foreground/20 mx-auto mb-4"/>
                    <h3 className="font-bold text-lg mb-2">Canvas is empty</h3>
                    <p className="text-sm text-muted-foreground mb-5">Generate a strategy first — Claude will analyse all your data and populate the canvas automatically.</p>
                    <Button onClick={generateStrategy} disabled={generating}
                      className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                      <Brain className="h-4 w-4 mr-2"/>Generate Strategy & Populate Canvas
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* ── Overall progress bar ── */}
                    <div className="rounded-2xl border border-border bg-card/60 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">Overall Progress</span>
                          <span className="text-xs font-mono text-primary">{doneBlocks}/{totalBlocks} done</span>
                          {doingBlocks > 0 && <span className="text-xs font-mono text-blue-400">{doingBlocks} in progress</span>}
                        </div>
                        <span className="text-2xl font-black text-primary">{progress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden mb-3">
                        <div className="h-full bg-gradient-to-r from-primary to-primary-glow transition-all duration-500 rounded-full"
                          style={{width:`${progress}%`}}/>
                      </div>
                      {/* Per-column progress */}
                      <div className="grid grid-cols-5 gap-2">
                        {colStats.map(col => (
                          <div key={col.week} className="text-center">
                            <div className="text-xs text-muted-foreground mb-1">{col.label}</div>
                            <div className="h-1 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full bg-primary/60 transition-all duration-500"
                                style={{width: col.total > 0 ? `${Math.round((col.done/col.total)*100)}%` : '0%'}}/>
                            </div>
                            <div className="text-xs font-mono text-muted-foreground mt-1">{col.done}/{col.total}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Toolbar ── */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Layout toggle */}
                      <div className="flex rounded-xl border border-border overflow-hidden">
                        {([{id:'timeline',label:'Timeline'},{id:'priority',label:'Priority'}] as const).map(l => (
                          <button key={l.id} onClick={() => setLayout(l.id)}
                            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                              layout===l.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground bg-card/60'
                            }`}>{l.label}</button>
                        ))}
                      </div>

                      {/* Filters */}
                      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
                        className="h-8 text-xs px-2 rounded-xl border border-border bg-background/60 text-muted-foreground">
                        <option value="all">All status</option>
                        <option value="todo">To Do</option>
                        <option value="doing">In Progress</option>
                        <option value="done">Done</option>
                      </select>

                      <select value={filterType} onChange={e => setFilterType(e.target.value as any)}
                        className="h-8 text-xs px-2 rounded-xl border border-border bg-background/60 text-muted-foreground">
                        <option value="all">All types</option>
                        {Object.entries(TYPE_META).map(([k,v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>

                      <div className="flex-1"/>

                      <button onClick={() => setShowAddBlock(o => !o)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-border bg-card/60 text-muted-foreground hover:text-foreground">
                        <Plus size={12}/>Add block
                      </button>
                      <button onClick={resetCanvas}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-border bg-card/60 text-muted-foreground hover:text-foreground">
                        <RotateCcw size={12}/>Reset
                      </button>
                    </div>

                    {/* ── Add custom block panel ── */}
                    {showAddBlock && (
                      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-wrap gap-3 items-end">
                        <div className="flex-1 min-w-40 space-y-1">
                          <div className="text-xs text-muted-foreground font-mono uppercase">Title</div>
                          <input value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="Block title…"
                            className="w-full h-8 text-xs px-3 rounded-lg border border-border bg-background/60"/>
                        </div>
                        <div className="flex-[2] min-w-48 space-y-1">
                          <div className="text-xs text-muted-foreground font-mono uppercase">Content / notes</div>
                          <input value={customContent} onChange={e => setCustomContent(e.target.value)} placeholder="What needs doing…"
                            className="w-full h-8 text-xs px-3 rounded-lg border border-border bg-background/60"/>
                        </div>
                        <Button size="sm" onClick={addCustomBlock} disabled={!customTitle.trim()}
                          className="bg-primary text-primary-foreground"><Plus size={12} className="mr-1"/>Add</Button>
                        <button onClick={() => setShowAddBlock(false)} className="text-muted-foreground hover:text-foreground"><X size={14}/></button>
                      </div>
                    )}

                    {/* ── Kanban columns ── */}
                    <div className="flex gap-3 overflow-x-auto pb-2" style={{minHeight: 420}}>
                      {(layout === 'timeline' ? COLUMNS : PRIORITY_COLS.map(p => ({week: p.key as any, label: p.label, sub: ''}))).map(col => {
                        const colKey   = layout === 'timeline' ? col.week : col.week;
                        const colBlocks = visibleBlocks.filter(b =>
                          layout === 'timeline' ? b.week === col.week : b.priority === col.week
                        );
                        const isDragTarget = dragOver === colKey;
                        const colDone  = colBlocks.filter(b => b.status === 'done').length;

                        return (
                          <div key={String(colKey)}
                            onDragOver={e => handleDragOver(e, colKey)}
                            onDrop={e => handleDrop(e, colKey)}
                            onDragLeave={() => setDragOver(null)}
                            className={`flex-1 min-w-[200px] max-w-[260px] rounded-2xl border transition-all ${
                              isDragTarget ? 'border-primary bg-primary/5 shadow-[0_0_20px_hsl(var(--primary)/0.2)]' : 'border-border bg-card/40'
                            }`}
                          >
                            {/* Column header */}
                            <div className="px-3 py-3 border-b border-border/50">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-xs font-bold text-foreground">
                                    {typeof col.week === 'number' && col.week <= 4
                                      ? col.label
                                      : layout === 'priority'
                                      ? col.label
                                      : col.label}
                                  </div>
                                  {layout === 'timeline' && (col as any).sub && (
                                    <div className="text-xs text-muted-foreground">{(col as any).sub}</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-mono text-muted-foreground">{colDone}/{colBlocks.length}</span>
                                  {colBlocks.length > 0 && (
                                    <div className="h-5 w-5 rounded-full border border-border flex items-center justify-center">
                                      <div className="h-3 w-3 rounded-full bg-secondary overflow-hidden">
                                        <div className="h-full bg-primary transition-all"
                                          style={{width:`${colBlocks.length > 0 ? (colDone/colBlocks.length)*100 : 0}%`}}/>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Cards */}
                            <div className="p-2 space-y-2 min-h-[320px]">
                              {colBlocks.length === 0 && (
                                <div className={`h-24 rounded-xl border-2 border-dashed flex items-center justify-center ${isDragTarget ? 'border-primary/50 bg-primary/5' : 'border-border/30'}`}>
                                  <p className="text-xs text-muted-foreground/40">Drop here</p>
                                </div>
                              )}
                              {colBlocks.map(block => (
                                <BlockCard key={block.id} block={block}
                                  onStatusToggle={toggleStatus}
                                  onExpand={setExpandedBlock}
                                  onDeepDive={b => { deepDive(b); }}
                                  onRemove={removeBlock}
                                  dragging={draggingId === block.id}
                                  onDragStart={handleDragStart}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* ── Ask the Canvas ── */}
                    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-secondary/20">
                        <MessageSquare className="h-4 w-4 text-primary"/>
                        <span className="font-semibold text-sm">Ask the Canvas</span>
                        <span className="text-xs text-muted-foreground">Claude analyses your entire strategy and answers in context</span>
                      </div>

                      {/* Suggested questions */}
                      <div className="px-5 pt-3 pb-2 flex flex-wrap gap-2">
                        {[
                          'What should I focus on today?',
                          'Which items give the best ROI?',
                          'What are the dependencies between Week 1 tasks?',
                          'What\'s at risk if I skip the backlog?',
                        ].map(q => (
                          <button key={q} onClick={() => { setChatQ(q); }}
                            className="text-xs px-2.5 py-1 rounded-full border border-border bg-secondary/30 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors">
                            {q}
                          </button>
                        ))}
                      </div>

                      {/* Input */}
                      <div className="px-5 pb-3 flex gap-2">
                        <input
                          value={chatQ}
                          onChange={e => setChatQ(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && askCanvas()}
                          placeholder="Ask anything about this strategy…"
                          className="flex-1 h-10 text-sm px-4 rounded-xl border border-border bg-background/60 focus:border-primary/50 outline-none"
                        />
                        <Button onClick={askCanvas} disabled={chatLoading || !chatQ.trim()}
                          className="h-10 bg-primary text-primary-foreground px-4">
                          {chatLoading ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14}/>}
                        </Button>
                      </div>

                      {/* Response */}
                      {(chatResp || chatLoading) && (
                        <div className="mx-5 mb-4 rounded-xl border border-border bg-background/60 p-4">
                          {chatLoading && !chatResp && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <RefreshCw size={12} className="animate-spin text-primary"/>Thinking…
                            </div>
                          )}
                          {chatResp && <ChatResponse text={chatResp}/>}
                          <div ref={chatEndRef}/>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Block expand modal ── */}
      {expandedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setExpandedBlock(null)}/>
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card/95 shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent"/>
            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border sticky top-0 bg-card/95 backdrop-blur z-10">
              {(() => { const m = TYPE_META[expandedBlock.type]||TYPE_META.custom; const I = m.icon;
                return (<><div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{background:`${m.color}18`,border:`1px solid ${m.color}28`}}><I size={13} style={{color:m.color}}/></div><div className="flex-1"><div className="font-bold text-sm">{expandedBlock.title}</div><div className="text-xs font-mono" style={{color:m.color}}>{m.label}</div></div></>);
              })()}
              <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${PRIORITY_META[expandedBlock.priority].badge}`}>{expandedBlock.priority}</span>
              <button onClick={() => { deepDive(expandedBlock); setExpandedBlock(null); }}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20">
                <Brain size={11}/>Deep Dive
              </button>
              <button onClick={() => setExpandedBlock(null)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50"><X size={13}/></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="rounded-xl border border-border bg-background/60 p-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{expandedBlock.content}</p>
              </div>
              {expandedBlock.tags?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {expandedBlock.tags.map((t,i) => <span key={i} className="text-xs px-2 py-0.5 rounded-full border border-border bg-secondary/30 text-muted-foreground flex items-center gap-1"><Tag size={8}/>{t}</span>)}
                </div>
              ) : null}
              <div className="flex gap-2 flex-wrap">
                {expandedBlock.effort && <span className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground">effort: {expandedBlock.effort}</span>}
                {expandedBlock.impact && <span className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground">impact: {expandedBlock.impact}</span>}
                {expandedBlock.source && <span className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground">from: {expandedBlock.source}</span>}
              </div>
              <button onClick={async () => { await navigator.clipboard.writeText(expandedBlock.content); toast({title:'Copied!'}); }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground">
                <Copy size={11}/>Copy content
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deep Dive modal ── */}
      {deepDiveBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => { if (!deepDiveLoading) setDeepDiveBlock(null); }}/>
          <div className="relative w-full max-w-2xl rounded-2xl border border-primary/30 bg-card/95 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent"/>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
              <Brain className="h-4 w-4 text-primary"/>
              <div className="flex-1">
                <div className="font-semibold text-sm">Deep Dive</div>
                <div className="text-xs text-muted-foreground truncate">{deepDiveBlock.title}</div>
              </div>
              {deepDiveLoading && <RefreshCw size={14} className="animate-spin text-primary"/>}
              {!deepDiveLoading && <button onClick={() => setDeepDiveBlock(null)} className="h-7 w-7 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50"><X size={12}/></button>}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {deepDiveLoading && !deepDiveText && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
                  <RefreshCw size={14} className="animate-spin text-primary"/>Claude is analysing this block in depth…
                </div>
              )}
              {deepDiveText && (
                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <ChatResponse text={deepDiveText}/>
                </div>
              )}
            </div>
            {deepDiveText && !deepDiveLoading && (
              <div className="px-5 py-3 border-t border-border shrink-0 flex gap-2">
                <button onClick={async () => { await navigator.clipboard.writeText(deepDiveText); toast({title:'Copied!'}); }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground">
                  <Copy size={11}/>Copy analysis
                </button>
                <button onClick={() => setDeepDiveBlock(null)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground ml-auto">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
