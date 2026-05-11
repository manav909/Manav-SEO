import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Brain, TrendingUp, Zap, RefreshCw, Loader2, Search,
  X, ChevronDown, ChevronRight, CheckCircle, AlertTriangle,
  RotateCcw, Sparkles, BookOpen, Star, Filter, Trash2, Edit2,
} from 'lucide-react';
import PortalNav from '@/components/PortalNav';
import { toast } from '@/hooks/use-toast';

interface Learning {
  id:              string;
  project_id:      string | null;
  card_type:       string;
  card_title:      string;
  what_worked:     string[];
  what_missed:     string[];
  redo_reason:     string | null;
  improvement:     string | null;
  context_summary: string | null;
  tags:            string[];
  source:          string;
  applied_count:   number;
  created_at:      string;
}

const CARD_TYPE_LABEL: Record<string,string> = {
  content:    'Content', technical: 'Technical', geo: 'GEO / AI',
  'quick-win': 'Quick Win', competitive: 'Competitive', weekly: 'Strategy',
  general:    'General',
};

const CARD_TYPE_COLOR: Record<string,string> = {
  content:    'bg-blue-400/10 border-blue-400/25 text-blue-400',
  technical:  'bg-orange-400/10 border-orange-400/25 text-orange-400',
  geo:        'bg-violet-400/10 border-violet-400/25 text-violet-400',
  'quick-win':'bg-green-400/10 border-green-400/25 text-green-400',
  competitive:'bg-red-400/10 border-red-400/25 text-red-400',
  weekly:     'bg-cyan-400/10 border-cyan-400/25 text-cyan-400',
  general:    'bg-secondary border-border text-muted-foreground',
};

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
}

export default function BrainLearning() {
  const { clients, projects } = useAuth();
  const [selProjId, setSelProjId] = useState('');
  const selProj = projects.find(p => p.id === selProjId);
  const client  = clients.find(c => c.id === selProj?.client_id);

  const [learnings,  setLearnings]  = useState<Learning[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [filterType, setFilterType] = useState('');
  const [expanded,   setExpanded]   = useState<Record<string,boolean>>({});
  const [editing,    setEditing]    = useState<Record<string,{improvement:string;tags:string}>>({});
  const [saving,     setSaving]     = useState<Record<string,boolean>>({});
  const [deleting,   setDeleting]   = useState<Record<string,boolean>>({});

  // ── Load all learnings ─────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/brain-learning', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_all', project_id: selProjId || null }),
      });
      const data = await res.json().catch(() => ({ learnings: [] }));
      setLearnings(data.learnings || []);
    } catch {
      toast({ title: 'Load failed', variant: 'destructive' });
    }
    setLoading(false);
  }, [selProjId]);

  useEffect(() => { load(); }, [load]);

  // ── Delete ─────────────────────────────────────────────────────────
  const deleteLearning = async (id: string) => {
    setDeleting(d => ({ ...d, [id]: true }));
    try {
      await fetch('/api/brain-learning', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      setLearnings(l => l.filter(x => x.id !== id));
      toast({ title: 'Learning removed' });
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
    setDeleting(d => ({ ...d, [id]: false }));
  };

  // ── Save edit ──────────────────────────────────────────────────────
  const saveEdit = async (id: string) => {
    const e = editing[id];
    if (!e) return;
    setSaving(s => ({ ...s, [id]: true }));
    try {
      const res  = await fetch('/api/brain-learning', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:      'update',
          id,
          improvement: e.improvement,
          tags:        e.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        setLearnings(l => l.map(x => x.id === id ? data.learning : x));
        setEditing(ed => { const n = { ...ed }; delete n[id]; return n; });
        toast({ title: 'Learning updated' });
      }
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    }
    setSaving(s => ({ ...s, [id]: false }));
  };

  // ── Filtered list ──────────────────────────────────────────────────
  const filtered = learnings.filter(l => {
    if (filterType && l.card_type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.card_title.toLowerCase().includes(q)  ||
        l.what_missed.some(w => w.toLowerCase().includes(q)) ||
        l.improvement?.toLowerCase().includes(q) ||
        l.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const cardTypes     = [...new Set(learnings.map(l => l.card_type))] as string[];
  const totalApplied  = learnings.reduce((s, l) => s + (l.applied_count || 0), 0);
  const topLearning   = [...learnings].sort((a, b) => (b.applied_count || 0) - (a.applied_count || 0))[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav
        companyName={client?.company ? `${client.company} — Brain Learning` : 'Manav Brain Learning'}
        projects={projects} selectedProjectId={selProjId} onProjectChange={setSelProjId}
      />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 mb-1">
              <Brain className="h-5 w-5 text-primary"/>Manav Brain Learning
            </h1>
            <p className="text-sm text-muted-foreground">
              Every completed task review adds a learning. These are permanently injected into future task executions so quality compounds over time.
            </p>
          </div>

          {/* Stats */}
          <div className="flex gap-2.5">
            {[
              { val: learnings.length,   label: 'Learnings',    color: 'text-primary' },
              { val: totalApplied,        label: 'Times applied', color: 'text-green-400' },
              { val: cardTypes.length,    label: 'Card types',   color: 'text-violet-400' },
            ].map(s => (
              <div key={s.label} className="text-center px-3 py-2 rounded-xl border border-border bg-card/60">
                <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── How it works ── */}
        <div className="rounded-2xl border border-primary/15 bg-primary/5 px-5 py-4">
          <div className="font-semibold text-sm flex items-center gap-2 mb-2">
            <Sparkles size={13} className="text-primary"/>How Manav Brain learns
          </div>
          <div className="grid sm:grid-cols-3 gap-4 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold shrink-0">1.</span>
              <span>Complete a task via "Ask Manav Brain". Manav evaluates the output and shows what worked and what was missed.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold shrink-0">2.</span>
              <span>Click <strong className="text-foreground">Save to Manav Brain Learning</strong> in the evaluation panel. The observation is stored here permanently.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold shrink-0">3.</span>
              <span>Every future task of the same type automatically applies all relevant learnings — Manav gets better with every task you complete.</span>
            </div>
          </div>
        </div>

        {/* ── Top learning ── */}
        {topLearning && topLearning.applied_count > 0 && (
          <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/5 px-5 py-4 flex items-start gap-3">
            <Star size={16} className="text-yellow-400 shrink-0 mt-0.5"/>
            <div>
              <div className="font-semibold text-sm text-yellow-400">Most applied learning</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                "{topLearning.card_title}" — applied {topLearning.applied_count} time{topLearning.applied_count !== 1 ? 's' : ''}
              </div>
              {topLearning.improvement && (
                <div className="text-xs text-foreground mt-1">{topLearning.improvement}</div>
              )}
            </div>
          </div>
        )}

        {/* ── Search + filter ── */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search learnings…"
              className="w-full h-9 pl-8 pr-3 text-sm rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"/>
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="h-9 px-3 text-sm rounded-xl border border-border bg-background/60 outline-none">
            <option value="">All types ({learnings.length})</option>
            {cardTypes.map((t: string) => (
              <option key={t} value={t}>
                {CARD_TYPE_LABEL[t] || t} ({learnings.filter(l => l.card_type === t).length})
              </option>
            ))}
          </select>
          <button onClick={load} disabled={loading}
            className="h-9 px-3 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''}/>Refresh
          </button>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-sm">
            <Loader2 size={16} className="animate-spin"/>Loading learnings…
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && learnings.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-14 text-center">
            <Brain size={36} className="text-muted-foreground/15 mx-auto mb-4"/>
            <div className="font-semibold mb-2">No learnings yet</div>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Complete a task via "Ask Manav Brain" in the Canvas, then click
              "Save to Manav Brain Learning" in the evaluation panel.
            </p>
          </div>
        )}

        {/* ── Learning cards ── */}
        {!loading && filtered.length === 0 && learnings.length > 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No learnings match your filters.
          </div>
        )}

        <div className="space-y-3">
          {filtered.map(l => {
            const isExpanded = !!expanded[l.id];
            const isEditing  = !!editing[l.id];
            return (
              <div key={l.id} className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                {/* Card header */}
                <div className="flex items-start gap-3 px-5 py-4 cursor-pointer"
                  onClick={() => setExpanded(e => ({ ...e, [l.id]: !e[l.id] }))}>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Badges row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${CARD_TYPE_COLOR[l.card_type] || CARD_TYPE_COLOR.general}`}>
                        {CARD_TYPE_LABEL[l.card_type] || l.card_type}
                      </span>
                      {l.applied_count > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-md border border-green-400/25 bg-green-400/8 text-green-400 font-medium flex items-center gap-1">
                          <Zap size={9}/>Applied {l.applied_count}×
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground/50">{daysAgo(l.created_at)}</span>
                    </div>

                    {/* Task title */}
                    <div className="font-semibold text-sm">{l.card_title}</div>

                    {/* Improvement summary */}
                    {l.improvement && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{l.improvement}</p>
                    )}

                    {/* Tags */}
                    {l.tags?.filter(t => !['general'].includes(t)).length > 0 && (
                      <div className="flex gap-1.5 flex-wrap">
                        {l.tags.filter(t => !['general'].includes(t)).slice(0, 5).map((t, i) => (
                          <span key={i} className="text-xs px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border/50">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={e => { e.stopPropagation(); setEditing(ed => ({ ...ed, [l.id]: { improvement: l.improvement || '', tags: l.tags?.join(', ') || '' } })); }}
                      className="h-7 w-7 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-primary hover:border-primary/30">
                      <Edit2 size={11}/>
                    </button>
                    <button onClick={e => { e.stopPropagation(); deleteLearning(l.id); }}
                      disabled={!!deleting[l.id]}
                      className="h-7 w-7 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/30 disabled:opacity-40">
                      {deleting[l.id] ? <Loader2 size={11} className="animate-spin"/> : <Trash2 size={11}/>}
                    </button>
                    {isExpanded ? <ChevronDown size={14} className="text-muted-foreground"/> : <ChevronRight size={14} className="text-muted-foreground"/>}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-border px-5 py-4 space-y-4 bg-background/20">

                    <div className="grid sm:grid-cols-2 gap-4">
                      {/* What worked */}
                      {l.what_worked?.length > 0 && (
                        <div>
                          <div className="text-xs font-mono text-green-400 uppercase mb-2">What worked</div>
                          <div className="space-y-1">
                            {l.what_worked.map((w, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <CheckCircle size={10} className="text-green-400 mt-0.5 shrink-0"/>
                                <span className="text-muted-foreground">{w}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* What was missed */}
                      {l.what_missed?.length > 0 && (
                        <div>
                          <div className="text-xs font-mono text-orange-400 uppercase mb-2">What was missed</div>
                          <div className="space-y-1">
                            {l.what_missed.map((w, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <AlertTriangle size={10} className="text-orange-400 mt-0.5 shrink-0"/>
                                <span className="text-muted-foreground">{w}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Redo reason */}
                    {l.redo_reason && (
                      <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 px-3 py-2.5">
                        <div className="text-xs font-semibold text-yellow-400 flex items-center gap-1.5 mb-1">
                          <RotateCcw size={10}/>If I could redo this
                        </div>
                        <p className="text-xs text-muted-foreground">{l.redo_reason}</p>
                      </div>
                    )}

                    {/* Improvement / action */}
                    {!isEditing && l.improvement && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
                        <div className="text-xs font-semibold text-primary flex items-center gap-1.5 mb-1">
                          <Brain size={10}/>Improvement applied in future runs
                        </div>
                        <p className="text-xs text-muted-foreground">{l.improvement}</p>
                      </div>
                    )}

                    {/* Edit form */}
                    {isEditing && (
                      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                        <div className="text-xs font-semibold text-primary">Edit Learning</div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Improvement statement</label>
                          <textarea
                            value={editing[l.id].improvement}
                            onChange={e => setEditing(ed => ({ ...ed, [l.id]: { ...ed[l.id], improvement: e.target.value } }))}
                            rows={3}
                            className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50 resize-none"/>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Tags (comma-separated)</label>
                          <input
                            value={editing[l.id].tags}
                            onChange={e => setEditing(ed => ({ ...ed, [l.id]: { ...ed[l.id], tags: e.target.value } }))}
                            className="w-full text-xs h-8 px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"/>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(l.id)} disabled={!!saving[l.id]}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50">
                            {saving[l.id] ? <><Loader2 size={11} className="animate-spin"/>Saving…</> : 'Save'}
                          </button>
                          <button onClick={() => setEditing(ed => { const n = { ...ed }; delete n[l.id]; return n; })}
                            className="text-xs px-3 py-1.5 rounded-xl border border-border text-muted-foreground hover:text-foreground">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {l.context_summary && (
                      <p className="text-xs text-muted-foreground/50">Context: {l.context_summary}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
