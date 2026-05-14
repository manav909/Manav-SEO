/**
 * Mission Control — Project Intelligence Cockpit
 *
 * Help strategy:
 * – Every section has a ? button that opens HelpOracle to the relevant section
 * – Overview tab has an embedded Brain insight panel (ask Brain about this project)
 * – Inline contextual guidance on every empty/incomplete field
 * – Quality score drives a visual "Brain Health" indicator
 * – HelpOracle global system handles right-click + floating trigger + bubbles
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '@/contexts/AuthContext';
import { useProject }  from '@/contexts/ProjectContext';
import { supabase }    from '@/lib/supabase';
import PortalNav       from '@/components/PortalNav';
import {
  Rocket, Brain, FileText, Activity, AlertTriangle,
  CheckCircle2, Clock, Trash2, Archive, Edit3, Save, X,
  ChevronRight, Zap, Globe, Plus, RefreshCw, BookOpen,
  Shield, HelpCircle, Send, ChevronDown, Lightbulb,
  Target, BarChart3, Info,
} from 'lucide-react';

/* ── helpers ── */
async function callEngine(action: string, body: Record<string, unknown>) {
  const r = await fetch('/api/task-engine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  return r.json();
}

/* ── Context help trigger — opens HelpOracle to a specific section ── */
function HelpTrigger({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      title={label || 'What is this?'}
      className="inline-flex items-center gap-1 text-muted-foreground/40 hover:text-primary/70 transition-colors"
    >
      <HelpCircle className="h-3.5 w-3.5" />
      {label && <span className="text-[10px]">{label}</span>}
    </button>
  );
}

/* ── Brain quality score for this project ── */
function brainHealthScore(project: any, learnings: any[]): { score: number; label: string; color: string; gaps: string[] } {
  const gaps: string[] = [];
  let score = 0;

  if (project?.cms)            score += 25; else gaps.push('CMS not set');
  if (project?.keywords?.length >= 3) score += 20; else gaps.push('Keywords missing or too few');
  if (project?.goals)          score += 15; else gaps.push('Goals not defined');
  if (project?.url)            score += 10; else gaps.push('Site URL missing');
  if (project?.competitors?.length >= 1) score += 10; else gaps.push('No competitors added');
  const active = learnings.filter(l => l.status === 'active').length;
  if (active >= 20)      score += 20;
  else if (active >= 10) score += 12;
  else if (active >= 5)  score += 6;
  else                   gaps.push(`Only ${active} active learnings (target: 20+)`);

  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs attention';
  const color = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-sky-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';
  return { score, label, color, gaps };
}

/* ── Status badge ── */
function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:         'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    pending_review: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    rejected:       'bg-red-500/10 text-red-400 border-red-500/20',
    archived:       'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border ${map[status] || map.active}`}>
      {status?.replace('_', ' ').toUpperCase()}
    </span>
  );
}

/* ── Stat card ── */
function StatCard({ icon: Icon, label, value, sub, color = 'text-primary', onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border border-border bg-card/60 p-4 flex flex-col gap-1 text-left w-full transition-all ${onClick ? 'hover:border-primary/30 hover:bg-card/80 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </button>
  );
}

/* ── Learning row ── */
function LearningRow({ l, onDelete, onEdit }: { l: any; onDelete: (id: string) => void; onEdit: (l: any) => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border/50 hover:bg-secondary/20 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-medium truncate">{l.card_title || 'Untitled'}</span>
          <Badge status={l.status} />
          <span className="text-[10px] font-mono text-muted-foreground/40 bg-secondary/40 px-1.5 py-0.5 rounded">{l.card_type}</span>
          {l.confidence_score && <span className="text-[10px] font-mono text-muted-foreground/40">{l.confidence_score}%</span>}
          {!l.project_id && (
            <span className="text-[10px] font-mono text-violet-400/70 bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20">INSTITUTIONAL</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {l.improvement || l.context_summary || l.what_worked?.[0] || '—'}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] text-muted-foreground/40">{new Date(l.created_at).toLocaleDateString()}</span>
          {l.applied_count > 0 && <span className="text-[10px] text-emerald-400/60">Applied {l.applied_count}×</span>}
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => onEdit(l)} className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <Edit3 className="h-3 w-3" />
        </button>
        <button onClick={() => onDelete(l.id)} className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/* ── Embedded Brain chat panel ── */
function BrainInsightPanel({ projectId, projectName, cms, keywords, goals }: {
  projectId: string; projectName: string; cms: string; keywords: string[]; goals: string;
}) {
  const [query, setQuery]     = useState('');
  const [answer, setAnswer]   = useState('');
  const [loading, setLoading] = useState(false);
  const [asked, setAsked]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const QUICK = [
    'What should I fix first to improve Brain quality?',
    'Analyse this project and tell me the 3 biggest gaps',
    'What CMS-specific SEO tasks should I prioritise?',
    'How can I improve my ranking velocity this month?',
  ];

  const ask = async (q: string) => {
    if (!q.trim() || loading) return;
    setAsked(true);
    setAnswer('');
    setLoading(true);
    setQuery('');
    try {
      const res = await fetch('/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          question: q,
          projectSummary: `Project: ${projectName} | CMS: ${cms || 'Not set'} | Keywords: ${(keywords || []).slice(0,5).join(', ') || 'Not set'} | Goals: ${goals || 'Not set'}`,
          brainAssistantContext: { projectContext: { projectId, name: projectName, cms, keywords, goals }, learnings: [], algoItems: [], canvasBlocks: [], history: [] },
        }),
      });
      if (!res.ok || !res.body) throw new Error('Brain unavailable');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value);
        setAnswer(full);
      }
    } catch {
      setAnswer('Brain is not available right now — check you are signed in and the API is running.');
    }
    setLoading(false);
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-card/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-primary/5">
        <div className="h-7 w-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <Brain className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <div className="text-sm font-semibold">Ask Brain about this project</div>
          <div className="text-xs text-muted-foreground">Brain knows your CMS, keywords, goals and learnings</div>
        </div>
      </div>

      {/* Quick prompts */}
      {!asked && (
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {QUICK.map((q, i) => (
            <button key={i} onClick={() => ask(q)}
              className="text-xs px-3 py-1.5 rounded-full border border-border bg-secondary/40 hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all text-muted-foreground text-left">
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Answer area */}
      {asked && (
        <div className="px-4 py-3 min-h-[80px]">
          {loading && !answer && (
            <div className="flex gap-1.5 py-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-1.5 w-1.5 rounded-full bg-primary/50" style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
          )}
          {answer && (
            <pre className="text-sm text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">{answer}</pre>
          )}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border/50 bg-background/40">
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ask(query)}
          placeholder="Ask anything about this project…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
        />
        <button onClick={() => ask(query)} disabled={loading || !query.trim()}
          className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground hover:opacity-80 disabled:opacity-30 transition-opacity shrink-0">
          <Send className="h-3 w-3" />
        </button>
      </div>

      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:scale(0);opacity:0.4} 40%{transform:scale(1);opacity:1} }
      `}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════ */
export default function MissionControl() {
  const navigate = useNavigate();
  const { projects, clients, refreshData } = useAuth();
  const { selectedProjectId, setSelectedProjectId, selectedProject, selectedClient, refreshBrainContext } = useProject();

  const [tab,           setTab]           = useState<'overview' | 'learnings' | 'documents' | 'edit' | 'danger'>('overview');
  const [intel,         setIntel]         = useState<any>(null);
  const [loading,       setLoading]       = useState(false);
  const [editDraft,     setEditDraft]     = useState<any>(null);
  const [saving,        setSaving]        = useState(false);
  const [editingL,      setEditingL]      = useState<any>(null);
  const [confirmAction, setConfirmAction] = useState<'archive' | 'delete' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast,         setToast]         = useState('');
  const [helpOpen,      setHelpOpen]      = useState(false);
  const [helpSection,   setHelpSection]   = useState(0);

  const safeProjects = (projects || []).filter((p: any) => p?.id);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3200); };

  const openHelp = (section = 0) => { setHelpSection(section); setHelpOpen(true); };

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
  }, [selectedProjectId]); // eslint-disable-line

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

  const deleteLearning = async (id: string) => {
    const r = await callEngine('delete_learning', { id });
    if (r.success) {
      setIntel((prev: any) => ({ ...prev, learnings: prev.learnings.filter((l: any) => l.id !== id) }));
      showToast('Learning deleted');
    }
  };

  const saveLearning = async () => {
    if (!editingL) return;
    const r = await callEngine('update_learning', { id: editingL.id, card_title: editingL.card_title, improvement: editingL.improvement, context_summary: editingL.context_summary });
    if (r.updated) {
      setIntel((prev: any) => ({ ...prev, learnings: prev.learnings.map((l: any) => l.id === editingL.id ? { ...l, ...editingL } : l) }));
      showToast('Learning updated');
    }
    setEditingL(null);
  };

  const executeProjectAction = async (type: 'archive' | 'delete') => {
    setActionLoading(true);
    try {
      const r = await callEngine('archive_project', { project_id: selectedProjectId, hard_delete: type === 'delete' });
      if (r.success) {
        showToast(type === 'delete'
          ? `Project deleted. ${r.migratedLearnings} learnings preserved as institutional knowledge.`
          : `Project archived. ${r.migratedLearnings} learnings promoted to global Brain intelligence.`);
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

  const learnings         = intel?.learnings  || [];
  const deskItems         = intel?.deskItems  || [];
  const tasks             = intel?.tasks      || [];
  const activeLearnings   = learnings.filter((l: any) => l.status === 'active').length;
  const pendingLearnings  = learnings.filter((l: any) => l.status === 'pending_review').length;

  const health = brainHealthScore(selectedProject, learnings);

  const setField = (k: string, v: any) => setEditDraft((d: any) => ({ ...d, [k]: v }));
  const setArray = (k: string, v: string) => setField(k, v.split(',').map((x: string) => x.trim()).filter(Boolean));

  /* ── Inline help panel (tab-specific) ── */
  const HELP_SECTIONS: Record<string, { title: string; items: string[] }[]> = {
    overview: [
      { title: 'Brain Health Score', items: ['80–100: Brain is calibrated and giving specific, measurable advice.','60–79: Good but some gaps. Fill missing fields for sharper responses.','40–59: Significant gaps. Brain is giving partly generic advice.','Below 40: Brain cannot give project-specific advice. Fill CMS and keywords first.'] },
      { title: 'Stats to watch', items: ['Active learnings: target 20+. Each one is injected into Brain on every response.','Pending review: approve technical findings fast. Review strategy learnings carefully.','Desk items: outputs from Brain Command tasks. Check they\'re being used.'] },
    ],
    learnings: [
      { title: 'What makes a good learning', items: ['Specific beats vague: "LCP is 4.2s on mobile — compress hero image" beats "site is slow".',  'Include the context: what page, what measurement, what change you made.', 'Confidence score 85+: auto-approved. 60–84: manual review recommended.'] },
      { title: 'When to delete', items: ['Outdated data (traffic numbers from 2 years ago).','Wrong findings (something you tested and disproved).','Duplicates — Brain applies each learning separately, so duplicates dilute quality.'] },
    ],
    edit: [
      { title: 'Fields ranked by Brain impact', items: ['1. CMS Platform — most impactful. Brain gives platform-specific code, config, and plugin steps only when this is set.','2. Keywords — Brain aligns every canvas card and recommendation to these. Add 5–10.','3. Goals — Brain frames every recommendation toward your goal if this is specific and measurable.','4. Competitors — unlocks competitive gap analysis and benchmarking.','5. SEO Plugin — Brain gives plugin-specific setup steps (Yoast schema config, RankMath redirects, etc).'] },
    ],
    danger: [
      { title: 'What is never lost', items: ['Active learnings migrate to global institutional knowledge when a project is archived or deleted.','Brain reads institutional learnings for every project — so deleting one project improves all future ones.','The system_change_log records every archive/delete event with a count of migrated learnings.'] },
    ],
  };

  const currentHelpSections = HELP_SECTIONS[tab] || HELP_SECTIONS.overview;

  if (!selectedProject) {
    return (
      <div className="min-h-screen bg-background">
        <PortalNav />
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <Rocket className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">Select a project to open Mission Control</p>
          {safeProjects.length === 0 && (
            <button onClick={() => navigate('/admin')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm">
              <Plus className="h-4 w-4" /> Create First Project
            </button>
          )}
        </div>
      </div>
    );
  }

  const TABS = [
    { key: 'overview',  label: 'Overview',    icon: BarChart3 },
    { key: 'learnings', label: 'Learnings',   icon: Brain     },
    { key: 'documents', label: 'Desk',        icon: BookOpen  },
    { key: 'edit',      label: 'Edit',        icon: Edit3     },
    { key: 'danger',    label: 'Danger Zone', icon: Shield    },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <PortalNav />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-card border border-border shadow-xl text-sm text-foreground max-w-md text-center animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}

      {/* Inline Help Drawer */}
      {helpOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setHelpOpen(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-card border-l border-border flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Mission Control Help</span>
              </div>
              <button onClick={() => setHelpOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
              {/* Section navigation */}
              <div className="flex flex-wrap gap-1.5">
                {currentHelpSections.map((s, i) => (
                  <button key={i} onClick={() => setHelpSection(i)}
                    className={`text-[10px] px-2 py-1 rounded-full border transition-all ${helpSection === i ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}>
                    {s.title}
                  </button>
                ))}
              </div>

              {/* Active section content */}
              {currentHelpSections[helpSection] && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">{currentHelpSections[helpSection].title}</h3>
                  {currentHelpSections[helpSection].items.map((item, i) => (
                    <div key={i} className="flex gap-2 items-start p-2.5 rounded-lg bg-secondary/30 border border-border/50">
                      <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground leading-relaxed">{item}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Brain health gap list */}
              {tab === 'overview' && health.gaps.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-xs font-semibold text-amber-400">Fix these to improve Brain quality</span>
                  </div>
                  <ul className="space-y-1.5">
                    {health.gaps.map((gap, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-amber-400/60 mt-0.5">→</span>{gap}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => { setHelpOpen(false); setTab('edit'); }}
                    className="mt-2 text-xs text-primary hover:underline">
                    Go to Edit tab →
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Confirm modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${confirmAction === 'delete' ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                <AlertTriangle className={`h-5 w-5 ${confirmAction === 'delete' ? 'text-red-400' : 'text-amber-400'}`} />
              </div>
              <div>
                <h3 className="font-semibold">{confirmAction === 'delete' ? 'Delete project permanently?' : 'Archive this project?'}</h3>
                <p className="text-sm text-muted-foreground">{selectedProject.name}</p>
              </div>
            </div>
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3 mb-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-xs text-emerald-400/90 leading-relaxed">
                  <strong>Your intelligence is preserved.</strong> All {activeLearnings} active learnings are promoted to global Brain knowledge — they continue improving every future project. Nothing learned is ever truly deleted.
                </p>
              </div>
            </div>
            {confirmAction === 'delete' && (
              <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3 mb-4">
                <p className="text-xs text-red-400/90">This permanently removes the project record, canvas, audit history and desk items. Cannot be undone.</p>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmAction(null)} disabled={actionLoading} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition-colors">Cancel</button>
              <button onClick={() => executeProjectAction(confirmAction)} disabled={actionLoading}
                className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${confirmAction === 'delete' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-amber-500 text-black hover:bg-amber-600'} disabled:opacity-50 transition-colors`}>
                {actionLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
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
              <button onClick={() => setEditingL(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Title', key: 'card_title', rows: 0 },
                { label: 'Improvement / Insight', key: 'improvement', rows: 3 },
                { label: 'Context Summary', key: 'context_summary', rows: 2 },
              ].map(({ label, key, rows }) => (
                <div key={key}>
                  <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                  {rows === 0
                    ? <input value={editingL[key] || ''} onChange={e => setEditingL((l: any) => ({ ...l, [key]: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/50" />
                    : <textarea value={editingL[key] || ''} onChange={e => setEditingL((l: any) => ({ ...l, [key]: e.target.value }))}
                        rows={rows} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/50 resize-none" />
                  }
                </div>
              ))}
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
              <Rocket className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{selectedProject.name}</h1>
                {selectedProject.status === 'archived' && <Badge status="archived" />}
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedClient?.name || selectedClient?.company || '—'} · Mission Control
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {safeProjects.length > 1 && (
              <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
                className="h-9 rounded-xl border border-border bg-background/60 text-sm px-3 outline-none focus:border-primary/50 cursor-pointer">
                {safeProjects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 border-b border-border mb-6 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              } ${key === 'danger' ? '!text-red-400/70 hover:!text-red-400' : ''}`}>
              <Icon className="h-3.5 w-3.5" />
              {label}
              {key === 'learnings' && pendingLearnings > 0 && (
                <span className="ml-1 h-4 px-1 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-mono flex items-center">{pendingLearnings}</span>
              )}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 px-1">
            <button onClick={() => openHelp(0)} title="Help for this tab"
              className="px-2 py-2 text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
              <HelpCircle className="h-3.5 w-3.5" />
              <span className="text-xs hidden sm:inline">Help</span>
            </button>
            <button onClick={loadIntel} disabled={loading} className="px-2 py-2 text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ══ OVERVIEW ══ */}
        {tab === 'overview' && (
          <div className="space-y-5">
            {/* Brain Health bar */}
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Brain Intelligence Quality</span>
                  <HelpTrigger onClick={() => openHelp(0)} label="What is this?" />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${health.color}`}>{health.score}</span>
                  <span className={`text-xs ${health.color}`}>/ 100 · {health.label}</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    health.score >= 80 ? 'bg-emerald-500' : health.score >= 60 ? 'bg-sky-500' : health.score >= 40 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${health.score}%` }}
                />
              </div>
              {health.gaps.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {health.gaps.slice(0, 3).map((gap, i) => (
                    <button key={i} onClick={() => setTab('edit')}
                      className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center gap-1">
                      <AlertTriangle className="h-2.5 w-2.5" />{gap}
                    </button>
                  ))}
                  {health.gaps.length > 3 && (
                    <button onClick={() => openHelp(0)} className="text-[10px] px-2 py-1 rounded-full bg-secondary/50 border border-border text-muted-foreground">
                      +{health.gaps.length - 3} more gaps
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={Brain}    label="Active Learnings" value={activeLearnings} sub={activeLearnings >= 20 ? 'optimal' : `target: 20`} color={activeLearnings >= 20 ? 'text-emerald-400' : 'text-amber-400'} onClick={() => setTab('learnings')} />
              <StatCard icon={Clock}    label="Pending Review"   value={pendingLearnings} sub="awaiting approval" color="text-amber-400" onClick={() => setTab('learnings')} />
              <StatCard icon={FileText} label="Desk Items"       value={deskItems.length} sub="saved outputs"     color="text-sky-400"    onClick={() => setTab('documents')} />
              <StatCard icon={Activity} label="Tasks Executed"   value={tasks.length}     sub="Brain Command"    color="text-violet-400" />
            </div>

            {/* Intelligence Profile */}
            <div className="rounded-xl border border-border bg-card/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Intelligence Profile
                  <HelpTrigger onClick={() => openHelp(0)} />
                </h3>
                <button onClick={() => setTab('edit')} className="text-xs text-primary hover:underline flex items-center gap-1">
                  Edit <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'CMS',         value: selectedProject.cms,            critical: true  },
                  { label: 'SEO Plugin',  value: selectedProject.seo_plugin                      },
                  { label: 'Industry',    value: selectedProject.industry                        },
                  { label: 'Country',     value: selectedProject.country                         },
                  { label: 'Organic/mo',  value: selectedProject.organic_monthly ? selectedProject.organic_monthly.toLocaleString() : null },
                  { label: 'Site URL',    value: selectedProject.url                             },
                ].map(({ label, value, critical }) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground/60 font-mono">{label}</span>
                      {critical && !value && (
                        <span className="text-[9px] text-red-400/70 bg-red-500/10 px-1 py-0.5 rounded font-mono">CRITICAL</span>
                      )}
                    </div>
                    {value
                      ? <span className="text-sm text-foreground">{value}</span>
                      : <button onClick={() => setTab('edit')} className="text-xs text-muted-foreground/40 italic hover:text-primary transition-colors text-left">
                          Not set — click to add
                        </button>
                    }
                  </div>
                ))}
              </div>
              {/* Keywords */}
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] text-muted-foreground/60 font-mono">KEYWORDS</span>
                  <HelpTrigger onClick={() => openHelp(0)} />
                </div>
                {selectedProject.keywords?.length > 0
                  ? <div className="flex flex-wrap gap-1.5">
                      {(selectedProject.keywords || []).slice(0, 12).map((kw: string, i: number) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary/80 border border-primary/20">{kw}</span>
                      ))}
                    </div>
                  : <button onClick={() => setTab('edit')} className="text-xs text-muted-foreground/40 italic hover:text-primary transition-colors">
                      No keywords set — Brain cannot target specific terms. Add them in Edit.
                    </button>
                }
              </div>
              {/* Goals */}
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] text-muted-foreground/60 font-mono">GOALS</span>
                  <HelpTrigger onClick={() => openHelp(0)} />
                </div>
                {selectedProject.goals
                  ? <p className="text-sm text-muted-foreground leading-relaxed">{selectedProject.goals}</p>
                  : <button onClick={() => setTab('edit')} className="text-xs text-muted-foreground/40 italic hover:text-primary transition-colors">
                      No goals defined — Brain gives generic recommendations without a target. Set goals in Edit.
                    </button>
                }
              </div>
              {/* Competitors */}
              {selectedProject.competitors?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[10px] text-muted-foreground/60 font-mono">COMPETITORS</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedProject.competitors || []).slice(0, 6).map((c: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground border border-border/60">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Brain Ask Panel */}
            <BrainInsightPanel
              projectId={selectedProjectId}
              projectName={selectedProject.name}
              cms={selectedProject.cms || ''}
              keywords={selectedProject.keywords || []}
              goals={selectedProject.goals || ''}
            />

            {/* Quick navigation to other tools */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Quick Navigation</span>
                <span className="text-xs text-muted-foreground">Jump to project-specific tools</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { label: 'Strategy Canvas',  href: '/playground',     icon: Zap,      color: 'hover:border-primary/40 hover:bg-primary/5'    },
                  { label: 'Brain Learning',   href: '/brain-learning', icon: Brain,    color: 'hover:border-emerald-500/40 hover:bg-emerald-500/5' },
                  { label: 'Data Room',        href: '/data-room',      icon: Globe,    color: 'hover:border-sky-500/40 hover:bg-sky-500/5'    },
                  { label: 'Run Audit',        href: '/audit',          icon: Activity, color: 'hover:border-violet-500/40 hover:bg-violet-500/5' },
                  { label: 'Brain Command',    href: '/brain-command',  icon: Rocket,   color: 'hover:border-amber-500/40 hover:bg-amber-500/5' },
                  { label: 'Algorithm Intel',  href: '/algorithm-intel',icon: BookOpen, color: 'hover:border-rose-500/40 hover:bg-rose-500/5'   },
                ].map(({ label, href, icon: Icon, color }) => (
                  <button key={href} onClick={() => navigate(href)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border text-sm text-muted-foreground transition-all ${color}`}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                    <ChevronRight className="h-3 w-3 ml-auto opacity-40" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ LEARNINGS ══ */}
        {tab === 'learnings' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{learnings.length} total · {activeLearnings} active · {pendingLearnings} pending</span>
                <HelpTrigger onClick={() => openHelp(0)} label="How do learnings work?" />
              </div>
              <button onClick={() => navigate('/brain-learning')} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                Full Brain Learning <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            {/* Guidance banner if low learnings */}
            {activeLearnings < 10 && (
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 flex items-start gap-2">
                <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-sky-400 font-medium">Brain needs more learnings to be useful</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Target: 20 active learnings. Go to Brain Learning and run "learn everything about [project]" — Brain generates 8–10 structured learnings in one command.</p>
                  <button onClick={() => navigate('/brain-learning')} className="mt-1.5 text-xs text-sky-400 hover:underline">Go to Brain Learning →</button>
                </div>
              </div>
            )}

            {['active', 'pending_review', 'rejected'].map(status => {
              const group = learnings.filter((l: any) => l.status === status);
              if (!group.length) return null;
              return (
                <div key={status} className="rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-2.5 bg-secondary/30 border-b border-border flex items-center gap-2">
                    <Badge status={status} />
                    <span className="text-xs text-muted-foreground">{group.length} learnings</span>
                    {status === 'pending_review' && (
                      <span className="ml-auto text-[10px] text-amber-400/70">Review before approving — bad data hurts Brain quality</span>
                    )}
                  </div>
                  {group.map((l: any) => (
                    <LearningRow key={l.id} l={l} onDelete={deleteLearning} onEdit={setEditingL} />
                  ))}
                </div>
              );
            })}

            {learnings.length === 0 && !loading && (
              <div className="text-center py-16 text-muted-foreground">
                <Brain className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>No learnings yet for this project.</p>
                <button onClick={() => navigate('/brain-learning')} className="mt-3 text-sm text-primary hover:underline">
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
              <p className="text-sm text-muted-foreground">{deskItems.length} items saved to desk for this project</p>
              <button onClick={() => navigate('/desk')} className="text-xs text-primary hover:underline flex items-center gap-1">
                Open Brain Desk <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            {deskItems.map((item: any) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card/40 hover:bg-secondary/20 transition-colors">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground/60">{item.content_type} · {new Date(item.created_at).toLocaleDateString()}</p>
                </div>
                {item.tags?.length > 0 && (
                  <div className="flex gap-1">{item.tags.slice(0, 2).map((t: string) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/60 text-muted-foreground/60">{t}</span>
                  ))}</div>
                )}
              </div>
            ))}
            {deskItems.length === 0 && !loading && (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>No desk items yet.</p>
                <p className="text-xs mt-1">Run tasks in Brain Command to generate outputs that save here.</p>
                <button onClick={() => navigate('/brain-command')} className="mt-3 text-sm text-primary hover:underline">Open Brain Command →</button>
              </div>
            )}
          </div>
        )}

        {/* ══ EDIT ══ */}
        {tab === 'edit' && editDraft && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
            {/* Form */}
            <div className="space-y-5">
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-2">
                <Zap className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-primary/80">Saving refreshes Brain's context immediately. <strong>CMS and Keywords have the highest impact</strong> — set them first.</p>
              </div>

              {[
                { key: 'name',       label: 'Project Name',   help: '',                                               impact: null      },
                { key: 'url',        label: 'Site URL',       help: 'https://yourbrand.com',                          impact: 'medium'  },
                { key: 'cms',        label: 'CMS Platform',   help: 'HubSpot / WordPress / Webflow / Shopify',        impact: 'high'    },
                { key: 'seo_plugin', label: 'SEO Plugin',     help: 'Yoast / RankMath / HubSpot SEO / none',          impact: 'high'    },
                { key: 'industry',   label: 'Industry',       help: 'SaaS, E-commerce, Healthcare, Finance…',         impact: 'medium'  },
                { key: 'country',    label: 'Target Country', help: 'United Kingdom',                                  impact: 'low'     },
              ].map(({ key, label, help, impact }) => (
                <div key={key}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{label}</label>
                    {impact === 'high'   && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">HIGH IMPACT</span>}
                    {impact === 'medium' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">MED IMPACT</span>}
                  </div>
                  <input value={editDraft[key] || ''} onChange={e => setField(key, e.target.value)}
                    placeholder={help}
                    className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors" />
                </div>
              ))}

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Monthly Organic Sessions</label>
                <input type="number" value={editDraft.organic_monthly || ''}
                  onChange={e => setField('organic_monthly', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="e.g. 12000"
                  className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors" />
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Target Keywords</label>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">HIGH IMPACT</span>
                </div>
                <p className="text-[10px] text-muted-foreground/60 mb-1.5">Comma separated. Brain aligns every recommendation to these terms.</p>
                <textarea value={(editDraft.keywords || []).join(', ')} onChange={e => setArray('keywords', e.target.value)}
                  rows={3} placeholder="best seo agency uk, local seo services london, ..."
                  className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50 resize-none transition-colors" />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Competitors</label>
                <p className="text-[10px] text-muted-foreground/60 mb-1.5">Comma separated URLs. Enables competitive gap analysis.</p>
                <textarea value={(editDraft.competitors || []).join(', ')} onChange={e => setArray('competitors', e.target.value)}
                  rows={2} placeholder="competitor.com, another-brand.io, ..."
                  className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50 resize-none transition-colors" />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Project Goals</label>
                <p className="text-[10px] text-muted-foreground/60 mb-1.5">Be specific and measurable. Brain references this to frame every recommendation.</p>
                <textarea value={editDraft.goals || ''} onChange={e => setField('goals', e.target.value)}
                  rows={3} placeholder="Rank #1 for 'best seo agency uk' by Q3 2026. Increase organic sessions from 4,000 to 20,000/month..."
                  className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50 resize-none transition-colors" />
              </div>

              <button onClick={saveProject} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save & Refresh Brain Context
              </button>
            </div>

            {/* Sidebar: field impact guide */}
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-card/60 p-4 sticky top-20">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-semibold">Brain Impact Guide</span>
                </div>
                <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
                  {[
                    { field: 'CMS Platform', why: 'Brain gives HubSpot-specific, WordPress-specific, or Shopify-specific code and config only when this is set. Without it, advice is generic.' },
                    { field: 'Keywords',     why: 'Brain targets every canvas card, audit interpretation and chat response at these terms.' },
                    { field: 'Goals',        why: 'Specific goals let Brain calculate ROI per recommendation and prioritise by business impact.' },
                    { field: 'Competitors',  why: 'Unlocks gap analysis — Brain finds what competitors rank for that you don\'t.' },
                    { field: 'SEO Plugin',   why: 'Brain gives plugin-specific config steps (Yoast schema setup, RankMath redirect config).' },
                  ].map(({ field, why }) => (
                    <div key={field} className="border-b border-border/40 pb-2.5 last:border-0 last:pb-0">
                      <div className="font-medium text-foreground/80 mb-0.5">{field}</div>
                      <div>{why}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ DANGER ZONE ══ */}
        {tab === 'danger' && (
          <div className="max-w-2xl space-y-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-emerald-400 mb-1">Your intelligence is always preserved</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    This project has <strong className="text-foreground">{activeLearnings} active learnings</strong> in Brain.
                    Whether you archive or delete, all active learnings migrate to <strong className="text-foreground">global institutional knowledge</strong> — they improve Brain's responses for every future project. Nothing learned is ever truly deleted.
                  </p>
                  <button onClick={() => openHelp(0)} className="mt-2 text-xs text-emerald-400 hover:underline flex items-center gap-1">
                    How does this work? <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-card/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Archive className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold">Archive project</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      Hides from active lists. All data preserved and browsable from Admin. Learnings migrate to global Brain knowledge. Can be restored.
                    </p>
                  </div>
                </div>
                <button onClick={() => setConfirmAction('archive')}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors">
                  <Archive className="h-3.5 w-3.5" />Archive
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-red-500/20 bg-card/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Trash2 className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold">Delete project permanently</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      Removes project record, canvas, audit history and desk items. Cannot be undone. Active learnings still migrate to global Brain knowledge before deletion.
                    </p>
                  </div>
                </div>
                <button onClick={() => setConfirmAction('delete')}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />Delete
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
