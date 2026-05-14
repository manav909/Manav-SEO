/**
 * Mission Control — Project Intelligence Cockpit
 *
 * The permanent dossier for every project. Everything in one place:
 * health overview, learnings management, edit metadata, archive/delete.
 *
 * Design principle: Archiving a project NEVER destroys learnings.
 * Active learnings migrate to institutional knowledge (project_id=null)
 * so Brain benefits from all past experience forever.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate }  from 'react-router-dom';
import { useAuth }      from '@/contexts/AuthContext';
import { useProject }   from '@/contexts/ProjectContext';
import { supabase }     from '@/lib/supabase';
import PortalNav        from '@/components/PortalNav';
import {
  Rocket, Brain, Database, FileText, Activity, Settings,
  AlertTriangle, CheckCircle2, Clock, Trash2, Archive,
  Edit3, Save, X, ChevronRight, Zap, BarChart3, Globe,
  Plus, RefreshCw, BookOpen, Shield,
} from 'lucide-react';

/* ── helper: call task-engine ── */
async function callEngine(action: string, body: Record<string, unknown>) {
  const r = await fetch('/api/task-engine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  return r.json();
}

/* ── Status badge ── */
function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:          'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    pending_review:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    rejected:        'bg-red-500/10 text-red-400 border-red-500/20',
    archived:        'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border ${map[status] || map.active}`}>
      {status?.replace('_', ' ').toUpperCase()}
    </span>
  );
}

/* ── Stat card ── */
function StatCard({ icon: Icon, label, value, sub, color = 'text-primary' }: any) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className={`h-4 w-4 ${color}`}/>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ── Learning row ── */
function LearningRow({ l, onDelete, onEdit }: { l: any; onDelete:(id:string)=>void; onEdit:(l:any)=>void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border/50 hover:bg-secondary/20 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-medium truncate">{l.card_title || 'Untitled'}</span>
          <Badge status={l.status}/>
          <span className="text-[10px] font-mono text-muted-foreground/40 bg-secondary/40 px-1.5 py-0.5 rounded">
            {l.card_type}
          </span>
          {l.confidence_score && (
            <span className="text-[10px] font-mono text-muted-foreground/40">{l.confidence_score}%</span>
          )}
          {/* NULL project_id = institutional knowledge */}
          {!l.project_id && (
            <span className="text-[10px] font-mono text-violet-400/70 bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20">
              INSTITUTIONAL
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {l.improvement || l.context_summary || (l.what_worked?.[0]) || '—'}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] text-muted-foreground/40">
            {new Date(l.created_at).toLocaleDateString()}
          </span>
          {l.applied_count > 0 && (
            <span className="text-[10px] text-emerald-400/60">
              Applied {l.applied_count}×
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => onEdit(l)} title="Edit"
          className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <Edit3 className="h-3 w-3"/>
        </button>
        <button onClick={() => onDelete(l.id)} title="Delete"
          className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors">
          <Trash2 className="h-3 w-3"/>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════ */
export default function MissionControl() {
  const navigate = useNavigate();
  const { projects, clients, refreshData } = useAuth();
  const { selectedProjectId, setSelectedProjectId, selectedProject, selectedClient, refreshBrainContext } = useProject();

  const [tab,           setTab]           = useState<'overview'|'learnings'|'documents'|'edit'|'danger'>('overview');
  const [intel,         setIntel]         = useState<any>(null);
  const [loading,       setLoading]       = useState(false);
  const [editDraft,     setEditDraft]     = useState<any>(null);
  const [saving,        setSaving]        = useState(false);
  const [editingL,      setEditingL]      = useState<any>(null);
  const [confirmAction, setConfirmAction] = useState<'archive'|'delete'|null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast,         setToast]         = useState('');

  const safeProjects = (projects || []).filter((p: any) => p?.id);
  const safeClients  = (clients  || []).filter((c: any) => c?.id);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  /* Load project intel */
  const loadIntel = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const data = await callEngine('get_project_intel', { project_id: selectedProjectId });
      setIntel(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [selectedProjectId]);

  useEffect(() => {
    loadIntel();
    if (selectedProject) setEditDraft({ ...selectedProject });
  }, [selectedProjectId]);

  /* ── Save project edits ── */
  const saveProject = async () => {
    if (!editDraft?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('projects').update({
        name:            editDraft.name,
        url:             editDraft.url,
        cms:             editDraft.cms,
        seo_plugin:      editDraft.seo_plugin,
        industry:        editDraft.industry,
        goals:           editDraft.goals,
        country:         editDraft.country,
        keywords:        editDraft.keywords,
        competitors:     editDraft.competitors,
        organic_monthly: editDraft.organic_monthly,
      }).eq('id', editDraft.id);

      if (error) throw error;
      await refreshData();
      await refreshBrainContext();
      showToast('Project updated — Brain context refreshed');
    } catch (e: any) {
      showToast('Error saving: ' + e.message);
    }
    setSaving(false);
  };

  /* ── Delete/archive learning ── */
  const deleteLearning = async (id: string) => {
    const r = await callEngine('delete_learning', { id });
    if (r.success) {
      setIntel((prev: any) => ({
        ...prev,
        learnings: prev.learnings.filter((l: any) => l.id !== id),
      }));
      showToast('Learning deleted');
    }
  };

  /* ── Save edited learning ── */
  const saveLearning = async () => {
    if (!editingL) return;
    const r = await callEngine('update_learning', {
      id: editingL.id,
      card_title:  editingL.card_title,
      improvement: editingL.improvement,
      context_summary: editingL.context_summary,
    });
    if (r.updated) {
      setIntel((prev: any) => ({
        ...prev,
        learnings: prev.learnings.map((l: any) => l.id === editingL.id ? { ...l, ...editingL } : l),
      }));
      showToast('Learning updated');
    }
    setEditingL(null);
  };

  /* ── Archive / Delete project ── */
  const executeProjectAction = async (type: 'archive' | 'delete') => {
    setActionLoading(true);
    try {
      const r = await callEngine('archive_project', {
        project_id: selectedProjectId,
        hard_delete: type === 'delete',
      });
      if (r.success) {
        showToast(
          type === 'delete'
            ? `Project deleted. ${r.migratedLearnings} learnings preserved as institutional knowledge.`
            : `Project archived. ${r.migratedLearnings} learnings promoted to global Brain intelligence.`
        );
        await refreshData();
        if (safeProjects.length > 1) {
          const next = safeProjects.find((p: any) => p.id !== selectedProjectId);
          if (next) setSelectedProjectId(next.id);
        }
        setConfirmAction(null);
        navigate('/dashboard');
      } else {
        showToast('Error: ' + (r.error || 'Unknown'));
      }
    } catch (e: any) {
      showToast('Error: ' + e.message);
    }
    setActionLoading(false);
  };

  /* ── Stats from intel ── */
  const learnings     = intel?.learnings     || [];
  const deskItems     = intel?.deskItems     || [];
  const tasks         = intel?.tasks         || [];
  const activeLearnings  = learnings.filter((l: any) => l.status === 'active').length;
  const pendingLearnings = learnings.filter((l: any) => l.status === 'pending_review').length;

  /* ── Edit field helper ── */
  const setField = (k: string, v: any) => setEditDraft((d: any) => ({ ...d, [k]: v }));
  const setArray = (k: string, v: string) => setField(k, v.split(',').map((x: string) => x.trim()).filter(Boolean));

  if (!selectedProject) {
    return (
      <div className="min-h-screen bg-background">
        <PortalNav/>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <Rocket className="h-12 w-12 text-muted-foreground/30"/>
          <p className="text-muted-foreground">Select a project to open Mission Control</p>
          {safeProjects.length === 0 && (
            <button onClick={() => navigate('/admin')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm">
              <Plus className="h-4 w-4"/> Create First Project
            </button>
          )}
        </div>
      </div>
    );
  }

  const TABS = [
    { key: 'overview',   label: 'Overview',   icon: BarChart3  },
    { key: 'learnings',  label: 'Learnings',  icon: Brain      },
    { key: 'documents',  label: 'Desk',       icon: BookOpen   },
    { key: 'edit',       label: 'Edit',       icon: Edit3      },
    { key: 'danger',     label: 'Danger Zone',icon: Shield     },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <PortalNav/>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-card border border-border shadow-xl text-sm text-foreground max-w-md text-center">
          {toast}
        </div>
      )}

      {/* Confirm modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                confirmAction === 'delete' ? 'bg-red-500/10' : 'bg-amber-500/10'
              }`}>
                <AlertTriangle className={`h-5 w-5 ${
                  confirmAction === 'delete' ? 'text-red-400' : 'text-amber-400'
                }`}/>
              </div>
              <div>
                <h3 className="font-semibold">
                  {confirmAction === 'delete' ? 'Delete project permanently?' : 'Archive this project?'}
                </h3>
                <p className="text-sm text-muted-foreground">{selectedProject.name}</p>
              </div>
            </div>

            {/* Key promise: learnings are NEVER destroyed */}
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3 mb-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0"/>
                <div className="text-xs text-emerald-400/90 leading-relaxed">
                  <strong>Your intelligence is preserved.</strong> All {activeLearnings} active learnings
                  from this project are promoted to global Brain knowledge — they continue to improve
                  every future project you run. Nothing is ever truly deleted from Brain.
                </div>
              </div>
            </div>

            {confirmAction === 'delete' && (
              <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3 mb-4">
                <p className="text-xs text-red-400/90">
                  This permanently removes the project record, canvas, audit history and desk items.
                  It cannot be undone. Learnings are still preserved.
                </p>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmAction(null)} disabled={actionLoading}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => executeProjectAction(confirmAction)}
                disabled={actionLoading}
                className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${
                  confirmAction === 'delete'
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-amber-500 text-black hover:bg-amber-600'
                } disabled:opacity-50 transition-colors`}>
                {actionLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin"/> : null}
                {confirmAction === 'delete' ? 'Delete project' : 'Archive project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit learning modal */}
      {editingL && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Edit Learning</h3>
              <button onClick={() => setEditingL(null)}><X className="h-4 w-4 text-muted-foreground"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Title</label>
                <input value={editingL.card_title || ''} onChange={e => setEditingL((l: any) => ({...l, card_title: e.target.value}))}
                  className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/50"/>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Improvement / Insight</label>
                <textarea value={editingL.improvement || ''} onChange={e => setEditingL((l: any) => ({...l, improvement: e.target.value}))}
                  rows={3} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/50 resize-none"/>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Context Summary</label>
                <textarea value={editingL.context_summary || ''} onChange={e => setEditingL((l: any) => ({...l, context_summary: e.target.value}))}
                  rows={2} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/50 resize-none"/>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setEditingL(null)} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition-colors">Cancel</button>
              <button onClick={saveLearning} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Rocket className="h-6 w-6 text-amber-500"/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{selectedProject.name}</h1>
                {selectedProject.status === 'archived' && (
                  <Badge status="archived"/>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedClient?.name || selectedClient?.company || '—'} · Mission Control
              </p>
            </div>
          </div>

          {/* Project switcher */}
          {safeProjects.length > 1 && (
            <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background/60 text-sm px-3 outline-none focus:border-primary/50 cursor-pointer">
              {safeProjects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 border-b border-border mb-6 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                tab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              } ${key === 'danger' ? '!text-red-400/70 hover:!text-red-400' : ''}`}>
              <Icon className="h-3.5 w-3.5"/>
              {label}
              {key === 'learnings' && pendingLearnings > 0 && (
                <span className="ml-1 h-4 px-1 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-mono flex items-center">
                  {pendingLearnings}
                </span>
              )}
            </button>
          ))}
          <button onClick={loadIntel} title="Refresh" disabled={loading}
            className="ml-auto px-2 py-2 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}/>
          </button>
        </div>

        {/* ══ OVERVIEW ══ */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={Brain}       label="Active Learnings"  value={activeLearnings}          sub="in Brain context"       color="text-emerald-400"/>
              <StatCard icon={Clock}       label="Pending Review"    value={pendingLearnings}         sub="awaiting approval"      color="text-amber-400"/>
              <StatCard icon={FileText}    label="Desk Items"        value={deskItems.length}         sub="saved outputs"          color="text-sky-400"/>
              <StatCard icon={Activity}    label="Tasks Executed"    value={tasks.length}             sub="via Brain Command"      color="text-violet-400"/>
            </div>

            {/* CMS / Tech stack quick view */}
            <div className="rounded-xl border border-border bg-card/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground"/>
                  Project Intelligence Profile
                </h3>
                <button onClick={() => setTab('edit')}
                  className="text-xs text-primary hover:underline flex items-center gap-1">
                  Edit <ChevronRight className="h-3 w-3"/>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                {[
                  { label: 'CMS',         value: selectedProject.cms             || '—' },
                  { label: 'SEO Plugin',  value: selectedProject.seo_plugin      || '—' },
                  { label: 'Industry',    value: selectedProject.industry        || '—' },
                  { label: 'Country',     value: selectedProject.country         || '—' },
                  { label: 'Organic/mo',  value: selectedProject.organic_monthly ? selectedProject.organic_monthly.toLocaleString() : '—' },
                  { label: 'URL',         value: selectedProject.url             || '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground/60 font-mono">{label}</span>
                    <span className={`text-sm ${value === '—' ? 'text-muted-foreground/40 italic' : 'text-foreground'}`}>{value}</span>
                  </div>
                ))}
              </div>
              {/* Keywords */}
              {selectedProject.keywords?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <div className="text-xs text-muted-foreground/60 font-mono mb-2">KEYWORDS</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedProject.keywords || []).slice(0, 12).map((kw: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary/80 border border-primary/20">{kw}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* Goals */}
              {selectedProject.goals && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <div className="text-xs text-muted-foreground/60 font-mono mb-1">GOALS</div>
                  <p className="text-sm text-muted-foreground">{selectedProject.goals}</p>
                </div>
              )}
            </div>

            {/* Warning if CMS not set — Brain will hallucinate */}
            {!selectedProject.cms && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0"/>
                <div>
                  <p className="text-sm font-medium text-amber-400">CMS not set — Brain is giving generic advice</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Set your CMS (HubSpot, WordPress, Webflow, Shopify…) in the Edit tab so Brain can give
                    platform-specific recommendations and code instead of generic guidance.
                  </p>
                  <button onClick={() => setTab('edit')}
                    className="mt-2 text-xs text-amber-400 hover:underline flex items-center gap-1">
                    Fix now <ChevronRight className="h-3 w-3"/>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ LEARNINGS ══ */}
        {tab === 'learnings' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {learnings.length} learnings · {activeLearnings} active · {pendingLearnings} pending
              </div>
              <button onClick={() => navigate('/brain-learning')}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                Open Brain Learning <ChevronRight className="h-3 w-3"/>
              </button>
            </div>

            {['active','pending_review','rejected'].map(status => {
              const group = learnings.filter((l: any) => l.status === status);
              if (!group.length) return null;
              return (
                <div key={status} className="rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-2.5 bg-secondary/30 border-b border-border flex items-center gap-2">
                    <Badge status={status}/>
                    <span className="text-xs text-muted-foreground">{group.length} learnings</span>
                  </div>
                  {group.map((l: any) => (
                    <LearningRow key={l.id} l={l} onDelete={deleteLearning} onEdit={setEditingL}/>
                  ))}
                </div>
              );
            })}

            {learnings.length === 0 && !loading && (
              <div className="text-center py-16 text-muted-foreground">
                <Brain className="h-10 w-10 mx-auto mb-3 opacity-20"/>
                <p>No learnings yet for this project.</p>
                <button onClick={() => navigate('/brain-learning')}
                  className="mt-3 text-sm text-primary hover:underline">
                  Go to Brain Learning →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ DESK ══ */}
        {tab === 'documents' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{deskItems.length} items saved to desk</p>
              <button onClick={() => navigate('/desk')} className="text-xs text-primary hover:underline flex items-center gap-1">
                Open Brain Desk <ChevronRight className="h-3 w-3"/>
              </button>
            </div>
            {deskItems.map((item: any) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card/40 hover:bg-secondary/20 transition-colors">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground/60">
                    {item.content_type} · {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>
                {item.tags?.length > 0 && (
                  <div className="flex gap-1">
                    {item.tags.slice(0,2).map((t: string) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/60 text-muted-foreground/60">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {deskItems.length === 0 && !loading && (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-20"/>
                <p>No desk items yet. Run tasks in Brain Command to generate outputs.</p>
              </div>
            )}
          </div>
        )}

        {/* ══ EDIT ══ */}
        {tab === 'edit' && editDraft && (
          <div className="max-w-2xl space-y-5">
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs text-primary/80 flex items-center gap-2">
                <Zap className="h-3.5 w-3.5"/>
                Editing this refreshes Brain's context immediately. CMS and Keywords have the highest impact.
              </p>
            </div>

            {[
              { key: 'name',    label: 'Project Name', type: 'input', help: '' },
              { key: 'url',     label: 'Site URL',      type: 'input', help: 'e.g. https://yourbrand.com' },
              { key: 'cms',     label: 'CMS Platform',  type: 'input', help: 'HubSpot / WordPress / Webflow / Shopify / custom' },
              { key: 'seo_plugin', label: 'SEO Plugin', type: 'input', help: 'Yoast / RankMath / HubSpot SEO / none' },
              { key: 'industry',  label: 'Industry',    type: 'input', help: 'e.g. SaaS, E-commerce, Healthcare' },
              { key: 'country',   label: 'Target Country', type: 'input', help: 'e.g. United Kingdom' },
            ].map(({ key, label, help }) => (
              <div key={key}>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
                <input value={editDraft[key] || ''} onChange={e => setField(key, e.target.value)}
                  placeholder={help}
                  className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors"/>
              </div>
            ))}

            {/* Organic traffic */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Monthly Organic Sessions</label>
              <input type="number" value={editDraft.organic_monthly || ''}
                onChange={e => setField('organic_monthly', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="e.g. 12000"
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors"/>
            </div>

            {/* Keywords */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Target Keywords (comma separated)</label>
              <textarea
                value={(editDraft.keywords || []).join(', ')}
                onChange={e => setArray('keywords', e.target.value)}
                rows={3} placeholder="best seo agency, local seo services, ..."
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50 resize-none transition-colors"/>
            </div>

            {/* Competitors */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Competitors (comma separated URLs)</label>
              <textarea
                value={(editDraft.competitors || []).join(', ')}
                onChange={e => setArray('competitors', e.target.value)}
                rows={2} placeholder="competitor.com, another-brand.io, ..."
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50 resize-none transition-colors"/>
            </div>

            {/* Goals */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Project Goals</label>
              <textarea
                value={editDraft.goals || ''}
                onChange={e => setField('goals', e.target.value)}
                rows={3} placeholder="Rank #1 for 'best seo agency uk' by Q3 2026. Increase organic sessions from 4,000 to 20,000/mo..."
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50 resize-none transition-colors"/>
            </div>

            <button onClick={saveProject} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin"/> : <Save className="h-3.5 w-3.5"/>}
              Save & Refresh Brain Context
            </button>
          </div>
        )}

        {/* ══ DANGER ZONE ══ */}
        {tab === 'danger' && (
          <div className="max-w-2xl space-y-4">
            {/* What happens to learnings — always show this first */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0"/>
                <div>
                  <h3 className="text-sm font-semibold text-emerald-400 mb-1">Your intelligence is always preserved</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    This project currently has <strong className="text-foreground">{activeLearnings} active learnings</strong> in
                    Manav Brain. Whether you archive or delete this project, all active learnings are
                    promoted to <strong className="text-foreground">global institutional knowledge</strong> — they continue
                    improving Brain's responses for every future project you run.
                    Nothing learned is ever truly deleted from Brain.
                  </p>
                </div>
              </div>
            </div>

            {/* Archive */}
            <div className="rounded-xl border border-amber-500/20 bg-card/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Archive className="h-5 w-5 text-amber-400 mt-0.5 shrink-0"/>
                  <div>
                    <h3 className="text-sm font-semibold">Archive project</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      Hides this project from active lists. Canvas, desk, audits and task history are
                      preserved and browsable from Admin. Learnings migrate to global Brain knowledge.
                      Can be restored.
                    </p>
                  </div>
                </div>
                <button onClick={() => setConfirmAction('archive')}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors">
                  <Archive className="h-3.5 w-3.5"/>Archive
                </button>
              </div>
            </div>

            {/* Delete */}
            <div className="rounded-xl border border-red-500/20 bg-card/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Trash2 className="h-5 w-5 text-red-400 mt-0.5 shrink-0"/>
                  <div>
                    <h3 className="text-sm font-semibold">Delete project permanently</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      Removes the project record, canvas cards, audit reports and desk items.
                      Cannot be undone. Learnings are still promoted to global Brain knowledge before deletion.
                    </p>
                  </div>
                </div>
                <button onClick={() => setConfirmAction('delete')}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors">
                  <Trash2 className="h-3.5 w-3.5"/>Delete
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
