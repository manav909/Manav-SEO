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
  Calendar, Layers, Eye, X, GripVertical, Tag,
  CheckCircle2, AlertTriangle, ArrowUpRight, Maximize2,
  PanelLeftOpen, PanelLeftClose, RotateCcw, Star
} from 'lucide-react';

/* ─────────────────────────── types ─────────────────────────── */
type BlockType = 'quick-win' | 'weekly' | 'monthly' | 'technical' | 'content' | 'geo' | 'competitive' | 'insight' | 'kpi' | 'metric' | 'custom';
type Priority  = 'high' | 'medium' | 'low';
type Tab       = 'reports' | 'strategy' | 'canvas';

interface CanvasBlock {
  id:       string;
  type:     BlockType;
  title:    string;
  content:  string;
  color:    string;
  priority: Priority;
  effort?:  string;
  impact?:  string;
  tags?:    string[];
  source?:  string;
  x:        number;
  y:        number;
  placed:   boolean;
}

/* ─────────────────────────── constants ─────────────────────────── */
const TYPE_META: Record<BlockType, { label: string; icon: any; color: string; bg: string; border: string }> = {
  'quick-win':   { label: 'Quick Win',    icon: Zap,         color: '#4ade80', bg: 'bg-green-400/10',  border: 'border-green-400/30'  },
  'weekly':      { label: 'Weekly Plan',  icon: Calendar,    color: '#60a5fa', bg: 'bg-blue-400/10',   border: 'border-blue-400/30'   },
  'monthly':     { label: 'Monthly',      icon: Layers,      color: '#a78bfa', bg: 'bg-purple-400/10', border: 'border-purple-400/30' },
  'technical':   { label: 'Technical',    icon: Shield,      color: '#06b6d4', bg: 'bg-cyan-400/10',   border: 'border-cyan-400/30'   },
  'content':     { label: 'Content',      icon: FileText,    color: '#facc15', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30' },
  'geo':         { label: 'GEO',          icon: Globe,       color: '#6366f1', bg: 'bg-indigo-400/10', border: 'border-indigo-400/30' },
  'competitive': { label: 'Competitive',  icon: Trophy,      color: '#fb923c', bg: 'bg-orange-400/10', border: 'border-orange-400/30' },
  'insight':     { label: 'Insight',      icon: Brain,       color: '#f472b6', bg: 'bg-pink-400/10',   border: 'border-pink-400/30'   },
  'kpi':         { label: 'KPI',          icon: TrendingUp,  color: '#34d399', bg: 'bg-emerald-400/10',border: 'border-emerald-400/30'},
  'metric':      { label: 'Metric',       icon: BarChart3,   color: '#818cf8', bg: 'bg-violet-400/10', border: 'border-violet-400/30' },
  'custom':      { label: 'Custom',       icon: Star,        color: '#94a3b8', bg: 'bg-slate-400/10',  border: 'border-slate-400/30'  },
};

const PRIORITY_COLOR: Record<Priority, string> = {
  high:   'text-red-400 bg-red-400/10 border-red-400/20',
  medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  low:    'text-green-400 bg-green-400/10 border-green-400/20',
};

/* ─────────────────────────── helpers ─────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 9);
const snap = (v: number, grid = 16) => Math.max(0, Math.round(v / grid) * grid);

const safeText = (v: any): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return JSON.stringify(v, null, 2);
};

function fmtDate(raw: string) {
  if (!raw) return '';
  const d = new Date(raw);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ─────────────────────────── ConfidenceDot ─────────────────────────── */
const Dot = ({ color }: { color: string }) => (
  <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
);

/* ─────────────────────────── Canvas Block Card ─────────────────────────── */
interface BlockCardProps {
  block:       CanvasBlock;
  onRemove:    (id: string) => void;
  onExpand:    (b: CanvasBlock) => void;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  isDragging:  boolean;
}

const BlockCard = ({ block, onRemove, onExpand, onMouseDown, isDragging }: BlockCardProps) => {
  const meta = TYPE_META[block.type] || TYPE_META.custom;
  const Icon = meta.icon;
  return (
    <div
      onMouseDown={e => onMouseDown(e, block.id)}
      className={`absolute select-none rounded-xl border ${meta.border} ${meta.bg} p-3 w-56 group ${isDragging ? 'cursor-grabbing shadow-2xl scale-105 z-50' : 'cursor-grab hover:shadow-lg z-10'} transition-shadow`}
      style={{ left: block.x, top: block.y }}
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="shrink-0 mt-0.5">
          <Icon size={12} style={{ color: meta.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold leading-tight text-foreground truncate">{block.title}</div>
          <div className="text-xs font-mono mt-0.5" style={{ color: meta.color }}>{meta.label}</div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={e => { e.stopPropagation(); onExpand(block); }}
            className="h-5 w-5 rounded flex items-center justify-center bg-background/60 hover:bg-background text-muted-foreground hover:text-foreground">
            <Maximize2 size={9} />
          </button>
          <button onClick={e => { e.stopPropagation(); onRemove(block.id); }}
            className="h-5 w-5 rounded flex items-center justify-center bg-background/60 hover:bg-red-400/20 text-muted-foreground hover:text-red-400">
            <X size={9} />
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{block.content}</p>
      {block.priority && (
        <div className={`mt-2 inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border font-mono ${PRIORITY_COLOR[block.priority]}`}>
          {block.priority}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════ */
export default function Playground() {
  const { clients, projects, user } = useAuth();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [tab,               setTab]               = useState<Tab>('reports');
  const [reports,           setReports]           = useState<any[]>([]);
  const [strategy,          setStrategy]          = useState<any>(null);
  const [generating,        setGenerating]        = useState(false);
  const [saving,            setSaving]            = useState(false);
  const [generatedAt,       setGeneratedAt]       = useState('');
  const [expandedReport,    setExpandedReport]    = useState<string | null>(null);

  // Canvas state
  const [blocks,      setBlocks]      = useState<CanvasBlock[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [draggingId,  setDraggingId]  = useState<string | null>(null);
  const [dragOffset,  setDragOffset]  = useState({ x: 0, y: 0 });
  const [expandedBlock, setExpandedBlock] = useState<CanvasBlock | null>(null);
  const [customTitle,   setCustomTitle]   = useState('');
  const [customContent, setCustomContent] = useState('');
  const [filterType,    setFilterType]    = useState<BlockType | 'all'>('all');
  const canvasRef = useRef<HTMLDivElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const client          = clients.find(c => c.id === selectedProject?.client_id);
  const placedBlocks    = blocks.filter(b => b.placed);
  const sidebarBlocks   = blocks.filter(b => !b.placed && (filterType === 'all' || b.type === filterType));

  /* ── Load project data ── */
  useEffect(() => {
    if (!selectedProjectId) { setReports([]); setStrategy(null); setBlocks([]); return; }
    loadProjectData();
  }, [selectedProjectId]);

  const loadProjectData = async () => {
    const [repRes, projRes] = await Promise.all([
      supabase.from('audit_reports').select('*').eq('project_id', selectedProjectId).order('created_at', { ascending: false }).limit(20),
      supabase.from('projects').select('playground_strategy, playground_canvas, playground_generated_at').eq('id', selectedProjectId).single(),
    ]);

    setReports(repRes.data || []);

    if (projRes.data?.playground_strategy) {
      setStrategy(projRes.data.playground_strategy);
      setGeneratedAt(projRes.data.playground_generated_at || '');
    }
    if (projRes.data?.playground_canvas) {
      setBlocks(projRes.data.playground_canvas || []);
    } else if (projRes.data?.playground_strategy) {
      // Seed canvas from strategy blocks
      const stratBlocks: CanvasBlock[] = (projRes.data.playground_strategy.canvas_blocks || [])
        .map((b: any) => ({ ...b, placed: false, x: 0, y: 0 }));
      setBlocks(stratBlocks);
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
        sections:   Object.fromEntries(
          Object.entries(r.sections || {}).map(([k, v]) => [k, safeText(v).slice(0, 1200)])
        ),
      }));

      const res = await fetch('/api/playground-analysis', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project:         selectedProject,
          client:          clientData,
          metrics:         metricsRes.data || [],
          keywordRankings: rankingsRes.data?.[0]?.keyword_rankings || [],
          auditReports:    auditContent,
          competitors:     selectedProject.competitors || [],
          allKeywords:     selectedProject.keywords || [],
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setStrategy(data.strategy);
      setGeneratedAt(data.generated_at);

      // Seed canvas blocks from strategy
      const newBlocks: CanvasBlock[] = (data.strategy.canvas_blocks || []).map((b: any) => ({
        ...b,
        id:      b.id || uid(),
        placed:  false,
        x:       0,
        y:       0,
      }));
      setBlocks(newBlocks);

      // Save to project
      await supabase.from('projects').update({
        playground_strategy:      data.strategy,
        playground_canvas:        newBlocks,
        playground_generated_at:  data.generated_at,
      }).eq('id', selectedProjectId);

      toast({ title: 'Strategy generated!', description: `${newBlocks.length} blocks ready for your canvas.` });
      setTab('strategy');
    } catch (err: any) {
      toast({ title: 'Generation failed', description: err.message, variant: 'destructive' });
    }
    setGenerating(false);
  };

  /* ── Canvas: drag ── */
  const handleBlockMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const block = blocks.find(b => b.id === id);
    if (!block || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDraggingId(id);
    setDragOffset({ x: (e.clientX - rect.left) - block.x, y: (e.clientY - rect.top) - block.y });
  };

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = snap(e.clientX - rect.left - dragOffset.x);
    const y = snap(e.clientY - rect.top  - dragOffset.y);
    setBlocks(bs => bs.map(b => b.id === draggingId ? { ...b, x, y } : b));
  }, [draggingId, dragOffset]);

  const handleCanvasMouseUp = useCallback(() => {
    if (draggingId) { setDraggingId(null); scheduleAutoSave(); }
  }, [draggingId]);

  /* ── Canvas: drop from sidebar ── */
  const addToCanvas = (id: string) => {
    const placed = blocks.filter(b => b.placed);
    // Find a free spot — stack in columns of 4
    const col = Math.floor(placed.length / 4);
    const row = placed.length % 4;
    setBlocks(bs => bs.map(b => b.id === id ? { ...b, placed: true, x: col * 240 + 20, y: row * 180 + 20 } : b));
    scheduleAutoSave();
  };

  const handleSidebarDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('blockId', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id   = e.dataTransfer.getData('blockId');
    if (!id || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x    = snap(e.clientX - rect.left - 112); // center on cursor
    const y    = snap(e.clientY - rect.top  - 60);
    setBlocks(bs => bs.map(b => b.id === id ? { ...b, placed: true, x: Math.max(0, x), y: Math.max(0, y) } : b));
    scheduleAutoSave();
  };

  const removeFromCanvas = (id: string) => {
    setBlocks(bs => bs.map(b => b.id === id ? { ...b, placed: false, x: 0, y: 0 } : b));
    scheduleAutoSave();
  };

  const clearCanvas = () => {
    setBlocks(bs => bs.map(b => ({ ...b, placed: false, x: 0, y: 0 })));
    scheduleAutoSave();
  };

  const autoArrange = () => {
    let col = 0, row = 0;
    setBlocks(bs => bs.map(b => {
      if (!b.placed) return b;
      const x = col * 240 + 20;
      const y = row * 200 + 20;
      row++; if (row >= 4) { row = 0; col++; }
      return { ...b, x, y };
    }));
    scheduleAutoSave();
  };

  /* ── Canvas: add custom block ── */
  const addCustomBlock = () => {
    if (!customTitle.trim()) return;
    const newBlock: CanvasBlock = {
      id:       uid(),
      type:     'custom',
      title:    customTitle,
      content:  customContent || 'Custom planning block.',
      color:    '#94a3b8',
      priority: 'medium',
      tags:     ['custom'],
      source:   'Manual',
      placed:   true,
      x:        snap(placedBlocks.length > 0 ? Math.max(...placedBlocks.map(b => b.x)) + 240 : 20),
      y:        20,
    };
    setBlocks(bs => [...bs, newBlock]);
    setCustomTitle('');
    setCustomContent('');
    scheduleAutoSave();
    toast({ title: 'Block added!' });
  };

  /* ── Auto-save canvas ── */
  const scheduleAutoSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveCanvas, 1500);
  };

  const saveCanvas = async () => {
    if (!selectedProjectId) return;
    setSaving(true);
    await supabase.from('projects').update({ playground_canvas: blocks }).eq('id', selectedProjectId);
    setSaving(false);
  };

  /* ── Download report ── */
  const downloadReport = (report: any, type: string) => {
    const content = safeText(report.sections?.[type]);
    const blob = new Blob([content], { type: 'text/markdown' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${type.toLowerCase().replace(/\s+/g, '-')}-audit-${report.created_at?.split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyReport = async (report: any, type: string) => {
    const content = safeText(report.sections?.[type]);
    await navigator.clipboard.writeText(content);
    toast({ title: 'Copied to clipboard!' });
  };

  /* ── Section renderer ── */
  const Section = ({ title, icon: Icon, color, children, defaultOpen = false }: any) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
      <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-secondary/20 transition-colors">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${color}18`, border: `1px solid ${color}28` }}>
            <Icon size={14} style={{ color }} />
          </div>
          <span className="font-semibold text-sm flex-1">{title}</span>
          {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </button>
        {open && <div className="px-5 pb-5 border-t border-border/50">{children}</div>}
      </div>
    );
  };

  /* ── Priority badge ── */
  const PBadge = ({ p }: { p: string }) => (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${PRIORITY_COLOR[p as Priority] || ''}`}>{p}</span>
  );

  const s = strategy;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav
        companyName={client?.company ? `${client.company} — Strategy Playground` : 'Strategy Playground'}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onProjectChange={setSelectedProjectId}
      />

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold mb-1 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Intelligence Playground
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Every audit, metric, ranking, and insight converged into a living strategy canvas.
              Generate deep AI analysis, then drag-and-drop your entire plan.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {generatedAt && (
              <div className="text-xs font-mono text-muted-foreground">
                Strategy: {fmtDate(generatedAt)}
              </div>
            )}
            <Button onClick={generateStrategy} disabled={generating || !selectedProjectId}
              className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
              {generating
                ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Analysing everything…</>
                : <><Brain className="h-4 w-4 mr-2" />{strategy ? 'Regenerate Strategy' : 'Generate Deep Strategy'}</>
              }
            </Button>
          </div>
        </div>

        {/* Project selector if none */}
        {!selectedProjectId && (
          <div className="rounded-2xl border border-border bg-card/60 p-6 text-center">
            <Brain className="h-10 w-10 text-primary/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">Select a project to load its intelligence playground</p>
            <select
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background/60 text-sm px-4 mx-auto"
            >
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
            <div className="flex gap-2 border-b border-border pb-0">
              {([
                { id: 'reports',  label: 'Reports Library',    icon: FileText  },
                { id: 'strategy', label: 'Strategy Intelligence', icon: Brain  },
                { id: 'canvas',   label: 'Strategy Canvas',    icon: Layers    },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    tab === id
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}>
                  <Icon size={14} />{label}
                  {id === 'reports'  && reports.length > 0  && <span className="text-xs bg-primary/10 text-primary rounded-full px-1.5">{reports.length}</span>}
                  {id === 'canvas'   && placedBlocks.length > 0 && <span className="text-xs bg-primary/10 text-primary rounded-full px-1.5">{placedBlocks.length}</span>}
                </button>
              ))}
            </div>

            {/* ═══ TAB: REPORTS LIBRARY ═══ */}
            {tab === 'reports' && (
              <div className="space-y-4">
                {reports.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <h3 className="font-semibold mb-1">No reports saved yet</h3>
                    <p className="text-sm text-muted-foreground">Run audits from the Audit Tool — they save automatically and appear here.</p>
                  </div>
                ) : (
                  reports.map(report => {
                    const types      = Object.keys(report.sections || {});
                    const isExpanded = expandedReport === report.id;
                    return (
                      <div key={report.id} className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                        <button
                          onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                          className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="text-sm font-semibold">{fmtDate(report.created_at)}</div>
                            <div className="flex gap-1.5">
                              {types.map(t => {
                                const meta = TYPE_META[t.toLowerCase().replace('-', '') as BlockType] || null;
                                return (
                                  <span key={t} className="text-xs px-2 py-0.5 rounded-full border border-border bg-secondary/40 text-muted-foreground font-mono">
                                    {t}
                                  </span>
                                );
                              })}
                            </div>
                            {report.synced_to_metrics && (
                              <span className="text-xs text-green-400 font-mono flex items-center gap-1">
                                <CheckCircle2 size={10} />Synced
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-mono">{report.saved_by}</span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-border px-5 py-4 space-y-4">
                            {types.map(type => (
                              <div key={type} className="rounded-xl border border-border bg-background/40 overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/30 border-b border-border">
                                  <span className="text-xs font-semibold font-mono text-foreground">{type} Audit</span>
                                  <div className="flex gap-2">
                                    <button onClick={() => copyReport(report, type)}
                                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border bg-background/60">
                                      <Copy size={10} />Copy
                                    </button>
                                    <button onClick={() => downloadReport(report, type)}
                                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 px-2 py-1 rounded border border-primary/30 bg-primary/5">
                                      <Download size={10} />Download .md
                                    </button>
                                  </div>
                                </div>
                                <div className="p-4 max-h-80 overflow-y-auto">
                                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono">
                                    {safeText(report.sections[type]).slice(0, 3000)}{(report.sections[type] || '').length > 3000 ? '\n\n[... truncated for preview — download for full report]' : ''}
                                  </pre>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ═══ TAB: STRATEGY INTELLIGENCE ═══ */}
            {tab === 'strategy' && (
              <div className="space-y-4">
                {!strategy ? (
                  <div className="rounded-2xl border border-border bg-card/60 p-10 text-center">
                    <Brain className="h-12 w-12 text-primary/30 mx-auto mb-4" />
                    <h3 className="font-bold text-lg mb-2">Generate Your Deep Strategy</h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                      Claude analyses every audit report, live metric, keyword ranking, and competitor gap — then builds a complete strategic brief with weekly plans, monthly roadmap, content calendar, and 20+ canvas blocks.
                    </p>
                    <Button onClick={generateStrategy} disabled={generating}
                      className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                      <Brain className="h-4 w-4 mr-2" />Generate Strategy
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Executive Summary */}
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <Star className="h-4 w-4 text-primary" />
                        <span className="font-semibold">Executive Summary</span>
                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-mono border ${
                          s.overall_health === 'Strong' || s.overall_health === 'Excellent'
                            ? 'text-green-400 bg-green-400/10 border-green-400/20'
                            : s.overall_health === 'Building'
                            ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
                            : 'text-orange-400 bg-orange-400/10 border-orange-400/20'
                        }`}>{s.overall_health}</span>
                      </div>
                      <p className="text-sm leading-relaxed mb-4">{s.executive_summary}</p>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {s.biggest_opportunity && (
                          <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-3">
                            <div className="text-xs font-mono text-green-400 uppercase tracking-wider mb-1">Biggest Opportunity</div>
                            <p className="text-xs text-foreground">{s.biggest_opportunity}</p>
                          </div>
                        )}
                        {s.biggest_risk && (
                          <div className="rounded-xl border border-orange-400/20 bg-orange-400/5 p-3">
                            <div className="text-xs font-mono text-orange-400 uppercase tracking-wider mb-1">Biggest Risk</div>
                            <p className="text-xs text-foreground">{s.biggest_risk}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Wins */}
                    {s.quick_wins?.length > 0 && (
                      <Section title={`Quick Wins (${s.quick_wins.length})`} icon={Zap} color="#4ade80" defaultOpen>
                        <div className="mt-4 grid sm:grid-cols-2 gap-3">
                          {s.quick_wins.map((w: any) => (
                            <div key={w.id} className="rounded-xl border border-green-400/20 bg-green-400/5 p-3">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="font-semibold text-sm">{w.title}</div>
                                <div className="flex gap-1 shrink-0">
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-400/10 text-green-400 font-mono">{w.timeframe}</span>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed mb-2">{w.description}</p>
                              {w.evidence && (
                                <p className="text-xs text-green-400/70 italic">Evidence: {w.evidence}</p>
                              )}
                              <div className="flex gap-1 mt-2">
                                <span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">effort: {w.effort}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">impact: {w.impact}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* 4-Week Plan */}
                    {s.weekly_plans?.length > 0 && (
                      <Section title="4-Week Action Plan" icon={Calendar} color="#60a5fa">
                        <div className="mt-4 space-y-4">
                          {s.weekly_plans.map((w: any) => (
                            <div key={w.week} className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-4">
                              <div className="flex items-center gap-3 mb-3">
                                <div className="h-8 w-8 rounded-full bg-blue-400/10 border border-blue-400/30 flex items-center justify-center text-sm font-bold text-blue-400">{w.week}</div>
                                <div>
                                  <div className="font-semibold text-sm">{w.theme}</div>
                                  <div className="text-xs text-muted-foreground">{w.focus}</div>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                {(w.tasks || []).map((t: any, i: number) => (
                                  <div key={i} className="flex items-start gap-2 text-xs">
                                    <div className={`mt-0.5 shrink-0 h-1.5 w-1.5 rounded-full ${t.priority === 'high' ? 'bg-red-400' : t.priority === 'medium' ? 'bg-yellow-400' : 'bg-green-400'}`} />
                                    <span className="text-foreground">{t.task}</span>
                                    {t.effort_hours && <span className="text-muted-foreground ml-auto shrink-0">{t.effort_hours}h</span>}
                                  </div>
                                ))}
                              </div>
                              {w.expected_outcome && (
                                <div className="mt-3 text-xs text-blue-400/80 border-t border-blue-400/20 pt-2">
                                  → {w.expected_outcome}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* 3-Month Roadmap */}
                    {s.monthly_roadmap?.length > 0 && (
                      <Section title="3-Month Roadmap" icon={Layers} color="#a78bfa">
                        <div className="mt-4 grid sm:grid-cols-3 gap-4">
                          {s.monthly_roadmap.map((m: any) => (
                            <div key={m.month} className="rounded-xl border border-purple-400/20 bg-purple-400/5 p-4">
                              <div className="text-xs font-mono text-purple-400 uppercase tracking-wider mb-2">Month {m.month}</div>
                              <div className="font-semibold text-sm mb-2">{m.title}</div>
                              <p className="text-xs text-muted-foreground mb-3">{m.phase_goal}</p>
                              {m.key_deliverables?.length > 0 && (
                                <div className="space-y-1">
                                  {m.key_deliverables.map((d: string, i: number) => (
                                    <div key={i} className="flex items-start gap-1.5 text-xs">
                                      <ChevronDown size={10} className="text-purple-400 shrink-0 mt-0.5 rotate-[-90deg]" />
                                      <span>{d}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {m.metrics_targets && (
                                <div className="mt-3 pt-2 border-t border-purple-400/20 space-y-1">
                                  {Object.entries(m.metrics_targets).map(([k, v]) => (
                                    <div key={k} className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">{k.replace(/_/g, ' ')}</span>
                                      <span className="text-purple-400 font-mono">{v as string}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* KPI Forecast */}
                    {s.kpi_forecast?.length > 0 && (
                      <Section title="KPI Forecast" icon={TrendingUp} color="#34d399">
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left py-2 pr-4 text-muted-foreground font-mono uppercase tracking-wider">Metric</th>
                                <th className="text-center py-2 px-3 text-muted-foreground font-mono">Now</th>
                                <th className="text-center py-2 px-3 text-emerald-400 font-mono">30d</th>
                                <th className="text-center py-2 px-3 text-emerald-400/70 font-mono">60d</th>
                                <th className="text-center py-2 px-3 text-emerald-400/50 font-mono">90d</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.kpi_forecast.map((k: any, i: number) => (
                                <tr key={i} className="border-b border-border/40">
                                  <td className="py-2 pr-4 font-medium">{k.metric}</td>
                                  <td className="text-center py-2 px-3 text-muted-foreground">{k.current}</td>
                                  <td className="text-center py-2 px-3 text-emerald-400 font-semibold">{k.target_30d}</td>
                                  <td className="text-center py-2 px-3 text-emerald-400/70">{k.target_60d}</td>
                                  <td className="text-center py-2 px-3 text-emerald-400/50">{k.target_90d}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Section>
                    )}

                    {/* Technical Priorities */}
                    {s.technical_priorities?.length > 0 && (
                      <Section title={`Technical Priorities (${s.technical_priorities.length})`} icon={Shield} color="#06b6d4">
                        <div className="mt-4 space-y-2">
                          {s.technical_priorities.map((t: any) => (
                            <div key={t.id} className="rounded-xl border border-border bg-background/40 p-3 flex items-start gap-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-mono shrink-0 mt-0.5 ${
                                t.urgency === 'immediate' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                                t.urgency === 'this_week' ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' :
                                'text-green-400 bg-green-400/10 border-green-400/20'
                              }`}>{t.urgency?.replace('_', ' ')}</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm mb-1">{t.issue}</div>
                                <p className="text-xs text-muted-foreground mb-1">{t.fix}</p>
                                <p className="text-xs text-cyan-400/70">Impact: {t.impact}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* Content Calendar */}
                    {s.content_calendar?.length > 0 && (
                      <Section title={`Content Calendar (${s.content_calendar.length} pieces)`} icon={FileText} color="#facc15">
                        <div className="mt-4 grid sm:grid-cols-2 gap-3">
                          {s.content_calendar.map((c: any) => (
                            <div key={c.id} className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3">
                              <div className="font-semibold text-sm mb-1">{c.title}</div>
                              <div className="flex gap-2 mb-2 flex-wrap">
                                <span className="text-xs font-mono text-yellow-400">{c.type}</span>
                                <span className="text-xs text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground">Week {c.suggested_week}</span>
                                <span className="text-xs text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground">{c.word_count}w</span>
                              </div>
                              <p className="text-xs text-muted-foreground mb-1">Keyword: "{c.target_keyword}"</p>
                              <p className="text-xs text-muted-foreground/70">{c.rationale}</p>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* GEO Strategy */}
                    {s.geo_strategy?.length > 0 && (
                      <Section title="GEO Strategy" icon={Globe} color="#6366f1">
                        <div className="mt-4 space-y-3">
                          {s.geo_strategy.map((g: any, i: number) => (
                            <div key={i} className="rounded-xl border border-indigo-400/20 bg-indigo-400/5 p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-semibold text-sm">{g.platform}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${
                                  g.current_status?.includes('NOT') || g.current_status?.includes('not')
                                    ? 'text-orange-400 bg-orange-400/10 border-orange-400/20'
                                    : 'text-green-400 bg-green-400/10 border-green-400/20'
                                }`}>{g.current_status}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mb-1">{g.action}</p>
                              <p className="text-xs text-indigo-400/70">→ {g.expected_impact}</p>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* Strategic Insights */}
                    {s.strategic_insights?.length > 0 && (
                      <Section title={`Strategic Insights (${s.strategic_insights.length})`} icon={Brain} color="#f472b6">
                        <div className="mt-4 space-y-2">
                          {s.strategic_insights.map((ins: any) => (
                            <div key={ins.id} className="rounded-xl border border-border bg-background/40 p-3">
                              <div className="flex items-start gap-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-mono shrink-0 ${
                                  ins.category === 'opportunity' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                                  ins.category === 'risk'        ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                                  ins.category === 'strength'    ? 'text-blue-400 bg-blue-400/10 border-blue-400/20' :
                                  'text-purple-400 bg-purple-400/10 border-purple-400/20'
                                }`}>{ins.category}</span>
                                <div>
                                  <div className="font-semibold text-sm mb-1">{ins.title}</div>
                                  <p className="text-xs text-muted-foreground">{ins.detail}</p>
                                  {ins.action && <p className="text-xs text-primary mt-1">→ {ins.action}</p>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* Retainer ROI */}
                    {s.retainer_value_summary && (
                      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-transparent p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <Trophy className="h-4 w-4 text-primary" />
                          <span className="font-semibold text-sm">Retainer Value Summary</span>
                        </div>
                        <p className="text-sm leading-relaxed mb-4">{s.retainer_value_summary.roi_narrative}</p>
                        <div className="grid sm:grid-cols-3 gap-3">
                          <div className="rounded-xl border border-border bg-background/40 p-3 text-center">
                            <div className="text-xl font-bold text-primary">{s.retainer_value_summary.score_gain_projection}</div>
                            <div className="text-xs text-muted-foreground">Score Growth</div>
                          </div>
                          <div className="rounded-xl border border-border bg-background/40 p-3 text-center">
                            <div className="text-xl font-bold text-green-400">{s.retainer_value_summary.ranking_improvements}</div>
                            <div className="text-xs text-muted-foreground">Ranking Improvements</div>
                          </div>
                          <div className="rounded-xl border border-border bg-background/40 p-3 text-center">
                            <div className="text-xl font-bold text-yellow-400">{s.retainer_value_summary.months_projected} months</div>
                            <div className="text-xs text-muted-foreground">Projected Timeline</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <Button onClick={() => setTab('canvas')}
                      className="w-full h-12 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
                      <Layers className="h-4 w-4 mr-2" />Open Strategy Canvas →
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* ═══ TAB: CANVAS ═══ */}
            {tab === 'canvas' && (
              <div className="space-y-4">
                {/* Canvas toolbar */}
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => setSidebarOpen(o => !o)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground">
                    {sidebarOpen ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
                    {sidebarOpen ? 'Hide' : 'Show'} Blocks
                  </button>
                  <select value={filterType} onChange={e => setFilterType(e.target.value as any)}
                    className="h-8 text-xs px-2 rounded-lg border border-border bg-background/60 text-muted-foreground">
                    <option value="all">All types</option>
                    {Object.entries(TYPE_META).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  <div className="flex-1" />
                  <button onClick={autoArrange}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground">
                    <RotateCcw size={12} />Auto-arrange
                  </button>
                  <button onClick={clearCanvas}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-red-400 hover:border-red-400/30">
                    <Trash2 size={12} />Clear canvas
                  </button>
                  <button onClick={saveCanvas} disabled={saving}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10">
                    <Save size={12} />{saving ? 'Saving…' : 'Save canvas'}
                  </button>
                </div>

                <div className="flex gap-4 h-[680px]">

                  {/* Sidebar: available blocks */}
                  {sidebarOpen && (
                    <div className="w-64 shrink-0 rounded-2xl border border-border bg-card/60 overflow-hidden flex flex-col">
                      <div className="px-3 py-2.5 border-b border-border bg-secondary/30">
                        <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Available Blocks</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{sidebarBlocks.length} blocks · drag or click +</div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                        {sidebarBlocks.length === 0 && (
                          <div className="text-xs text-muted-foreground text-center py-6">
                            {blocks.length === 0 ? 'Generate a strategy first' : 'All blocks placed on canvas'}
                          </div>
                        )}
                        {sidebarBlocks.map(block => {
                          const meta = TYPE_META[block.type] || TYPE_META.custom;
                          const Icon = meta.icon;
                          return (
                            <div key={block.id}
                              draggable
                              onDragStart={e => handleSidebarDragStart(e, block.id)}
                              className={`rounded-xl border ${meta.border} ${meta.bg} p-2.5 cursor-grab hover:opacity-80 transition-opacity group`}
                            >
                              <div className="flex items-center gap-2">
                                <GripVertical size={10} className="text-muted-foreground/30 shrink-0" />
                                <Icon size={10} style={{ color: meta.color }} className="shrink-0" />
                                <span className="text-xs font-semibold flex-1 truncate">{block.title}</span>
                                <button onClick={() => addToCanvas(block.id)}
                                  className="shrink-0 h-5 w-5 rounded flex items-center justify-center bg-background/60 hover:bg-primary/20 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Plus size={9} />
                                </button>
                              </div>
                              {block.priority && (
                                <div className="mt-1.5 ml-4">
                                  <PBadge p={block.priority} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Add custom block */}
                      <div className="border-t border-border p-2.5 space-y-1.5">
                        <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">Custom Block</div>
                        <input
                          value={customTitle} onChange={e => setCustomTitle(e.target.value)}
                          placeholder="Block title…"
                          className="w-full h-7 text-xs px-2 rounded-lg border border-border bg-background/60 text-foreground placeholder:text-muted-foreground/50"
                        />
                        <textarea
                          value={customContent} onChange={e => setCustomContent(e.target.value)}
                          placeholder="Content / notes…"
                          rows={2}
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background/60 text-foreground placeholder:text-muted-foreground/50 resize-none"
                        />
                        <button onClick={addCustomBlock} disabled={!customTitle.trim()}
                          className="w-full h-7 text-xs rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 disabled:opacity-40 flex items-center justify-center gap-1">
                          <Plus size={10} />Add to canvas
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Canvas area */}
                  <div className="flex-1 min-w-0 rounded-2xl border border-border bg-background/40 overflow-hidden relative">
                    {/* Dot grid background */}
                    <div className="absolute inset-0 pointer-events-none"
                      style={{ backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.12) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

                    {placedBlocks.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center">
                          <Layers size={40} className="text-muted-foreground/15 mx-auto mb-3" />
                          <p className="text-sm text-muted-foreground/40">Drag blocks from the sidebar or click + to place them here</p>
                        </div>
                      </div>
                    )}

                    <div
                      ref={canvasRef}
                      className="absolute inset-0 overflow-auto"
                      style={{ minWidth: 1200, minHeight: 900 }}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={handleCanvasMouseUp}
                      onDragOver={e => e.preventDefault()}
                      onDrop={handleCanvasDrop}
                    >
                      {placedBlocks.map(block => (
                        <BlockCard
                          key={block.id}
                          block={block}
                          onRemove={removeFromCanvas}
                          onExpand={setExpandedBlock}
                          onMouseDown={handleBlockMouseDown}
                          isDragging={draggingId === block.id}
                        />
                      ))}
                    </div>

                    {/* Canvas status */}
                    <div className="absolute bottom-3 right-3 flex items-center gap-2 text-xs font-mono text-muted-foreground/40 pointer-events-none">
                      <span>{placedBlocks.length} blocks placed</span>
                      {saving && <span className="text-primary">· saving…</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Expanded block modal ── */}
      {expandedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setExpandedBlock(null)} />
          <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-[0_32px_80px_rgba(0,0,0,0.6)] overflow-hidden max-h-[80vh] overflow-y-auto">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent" />
            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border sticky top-0 bg-card/95 backdrop-blur z-10">
              {(() => {
                const meta = TYPE_META[expandedBlock.type] || TYPE_META.custom;
                const Icon = meta.icon;
                return (
                  <>
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}28` }}>
                      <Icon size={14} style={{ color: meta.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-sm">{expandedBlock.title}</div>
                      <div className="text-xs font-mono" style={{ color: meta.color }}>{meta.label}</div>
                    </div>
                  </>
                );
              })()}
              <div className="flex items-center gap-2">
                {expandedBlock.priority && <PBadge p={expandedBlock.priority} />}
                <button onClick={() => setExpandedBlock(null)}
                  className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="rounded-xl border border-border bg-background/60 p-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{expandedBlock.content}</p>
              </div>
              {expandedBlock.tags?.length && (
                <div className="flex flex-wrap gap-1.5">
                  {expandedBlock.tags.map((t, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full border border-border bg-secondary/30 text-muted-foreground flex items-center gap-1">
                      <Tag size={9} />{t}
                    </span>
                  ))}
                </div>
              )}
              {expandedBlock.source && (
                <p className="text-xs text-muted-foreground font-mono">Source: {expandedBlock.source}</p>
              )}
              <div className="flex gap-2 flex-wrap">
                {expandedBlock.effort && (
                  <span className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground">effort: {expandedBlock.effort}</span>
                )}
                {expandedBlock.impact && (
                  <span className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground">impact: {expandedBlock.impact}</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  onClick={async () => { await navigator.clipboard.writeText(expandedBlock.content); toast({ title: 'Copied!' }); }}
                  className="border-border">
                  <Copy size={12} className="mr-1.5" />Copy content
                </Button>
                {!expandedBlock.placed && (
                  <Button size="sm" onClick={() => { addToCanvas(expandedBlock.id); setExpandedBlock(null); }}
                    className="bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20">
                    <Plus size={12} className="mr-1.5" />Add to canvas
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
