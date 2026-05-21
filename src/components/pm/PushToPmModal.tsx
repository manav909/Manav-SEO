/* ════════════════════════════════════════════════════════════════
   src/components/pm/PushToPmModal.tsx
   Phase 2 — Strategy-to-PM Bridge: review-and-push modal.

   When PM clicks "Push to PM" on a saved scenario (or on a suggested
   scenario from the Goal Engine), this modal opens. It:

   1. Fetches the draft cards from the backend (one per action,
      pre-populated with auto-suggested target dates + initial
      dependency items based on the action's shape).

   2. Lets the PM edit each card:
        - Target start / completion dates
        - Priority (low/medium/high)
        - Dependencies in 5 categories:
            access · content · info · approval · task_prereq
          Each item is a chip; PM can add/remove/check-off.
        - Estimated hours

   3. Optional sequential mode — chains depends_on so cards execute
      in order.

   4. On Push → creates kanban cards with full strategic context,
      then closes and signals success.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import {
  X, Plus, Save, AlertCircle, CheckCircle2, Trash2, ChevronDown, ChevronRight,
  Calendar, Clock, Target, Key, FileText, Info, Shield, Link2, Loader2, Rocket,
} from 'lucide-react';
import {
  prepareScenarioPush, pushScenarioToPm,
  type CardDraftClient, type DependencyItemClient, type DependencyCategoryClient,
} from './api';

interface Props {
  /** Either scenarioId, or goalId (with first linked scenario), or both. */
  scenarioId?: string;
  goalId?:     string;
  /** Triggered when the user closes the modal (cancel or after push). */
  onClose: () => void;
  /** Triggered after successful push, with card IDs. */
  onPushed?: (cardIds: string[]) => void;
}

const CATEGORY_META: Record<DependencyCategoryClient, { label: string; icon: any; color: string }> = {
  access:      { label: 'Access',         icon: Key,      color: 'text-amber-400 border-amber-500/30 bg-amber-500/[0.06]' },
  content:     { label: 'Content',        icon: FileText, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.06]' },
  info:        { label: 'Info needed',    icon: Info,     color: 'text-blue-400 border-blue-500/30 bg-blue-500/[0.06]' },
  approval:    { label: 'Approval',       icon: Shield,   color: 'text-violet-400 border-violet-500/30 bg-violet-500/[0.06]' },
  task_prereq: { label: 'Task prereq',    icon: Link2,    color: 'text-pink-400 border-pink-500/30 bg-pink-500/[0.06]' },
};

const CATEGORIES: DependencyCategoryClient[] = ['access','content','info','approval','task_prereq'];

export default function PushToPmModal({ scenarioId, goalId, onClose, onPushed }: Props) {
  const [loading, setLoading]   = useState(true);
  const [pushing, setPushing]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [drafts, setDrafts]     = useState<CardDraftClient[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [scenarioSummary, setScenarioSummary] = useState<any>(null);
  const [goalSummary, setGoalSummary]         = useState<any>(null);
  const [sequential, setSequential]           = useState(false);
  const [expandedIdx, setExpandedIdx]         = useState<number | null>(0);

  /* Load drafts on mount */
  useEffect(() => {
    if (!scenarioId && !goalId) return;
    (async () => {
      setLoading(true); setError(null);
      const r = await prepareScenarioPush({ scenarioId, goalId });
      if (r.error) {
        setError(r.error);
      } else {
        setDrafts(r.drafts || []);
        setProjectId(r.projectId || null);
        setScenarioSummary(r.scenario_summary);
        setGoalSummary(r.goal_summary || null);
      }
      setLoading(false);
    })();
  }, [scenarioId, goalId]);

  /* Mutators */
  const updateDraft = (idx: number, patch: Partial<CardDraftClient>) => {
    setDrafts((d) => d.map((x, i) => i === idx ? { ...x, ...patch } : x));
  };

  const addDependency = (idx: number, category: DependencyCategoryClient) => {
    const label = prompt(`Add ${CATEGORY_META[category].label.toLowerCase()}:`)?.trim();
    if (!label) return;
    setDrafts((d) => d.map((draft, i) => {
      if (i !== idx) return draft;
      const newItem: DependencyItemClient = {
        id: `d${Date.now()}`, label, category, met: false,
      };
      return { ...draft, requirements: [...draft.requirements, newItem] };
    }));
  };

  const removeDependency = (idx: number, depId: string) => {
    setDrafts((d) => d.map((draft, i) => {
      if (i !== idx) return draft;
      return { ...draft, requirements: draft.requirements.filter(r => r.id !== depId) };
    }));
  };

  const toggleDepMet = (idx: number, depId: string) => {
    setDrafts((d) => d.map((draft, i) => {
      if (i !== idx) return draft;
      return {
        ...draft,
        requirements: draft.requirements.map(r => r.id === depId ? { ...r, met: !r.met } : r),
      };
    }));
  };

  const updateDepLabel = (idx: number, depId: string, label: string) => {
    setDrafts((d) => d.map((draft, i) => {
      if (i !== idx) return draft;
      return {
        ...draft,
        requirements: draft.requirements.map(r => r.id === depId ? { ...r, label } : r),
      };
    }));
  };

  const handlePush = async () => {
    if (!projectId || drafts.length === 0) return;
    if (drafts.some(d => !d.target_start_date || !d.target_completion_date)) {
      setError('Every card needs a start and completion date.');
      return;
    }
    setPushing(true); setError(null);
    const r = await pushScenarioToPm({
      projectId, scenarioId, goalId, drafts, sequential,
    });
    setPushing(false);
    if (r.error) { setError(r.error); return; }
    if (onPushed && r.cardIds) onPushed(r.cardIds);
    onClose();
  };

  const totalHours = drafts.reduce((a, d) => a + d.estimated_hours, 0);
  const totalDeps  = drafts.reduce((a, d) => a + d.requirements.length, 0);
  const unmetDeps  = drafts.reduce((a, d) => a + d.requirements.filter(r => !r.met).length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-cyan-500/30 bg-card shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-gradient-to-r from-cyan-500/[0.08] to-violet-500/[0.04]">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-cyan-400" />
            <div>
              <div className="text-sm font-bold text-foreground">Push strategy to project management</div>
              <div className="text-[10px] text-muted-foreground">
                {loading ? 'Loading…' : (
                  goalSummary
                    ? `For goal: ${goalSummary.name || goalSummary.metric}`
                    : scenarioSummary ? `From scenario: ${scenarioSummary.name}` : 'Review and commit'
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/40 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && (
            <div className="text-center py-12 text-xs text-muted-foreground">
              <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin opacity-60" />
              Building draft cards from your scenario…
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-xs text-red-400 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {!loading && drafts.length === 0 && !error && (
            <div className="text-center py-12 text-xs text-muted-foreground">
              No draft cards generated — verify the scenario has actions.
            </div>
          )}

          {!loading && drafts.length > 0 && (
            <>
              {/* Summary bar */}
              <div className="rounded-xl border border-border bg-muted/10 p-3 flex flex-wrap items-center gap-4 text-[11px]">
                <span><span className="font-bold text-foreground">{drafts.length}</span> {drafts.length === 1 ? 'card' : 'cards'}</span>
                <span><Clock className="h-3 w-3 inline mr-1 text-muted-foreground" /><span className="font-bold text-foreground">{totalHours}h</span> total effort</span>
                <span className="text-muted-foreground"><span className="font-bold text-foreground">{totalDeps}</span> dependencies <span className={unmetDeps > 0 ? 'text-amber-400' : 'text-emerald-400'}>({unmetDeps} unmet)</span></span>
                <div className="flex-1" />
                <label className="text-[10px] text-muted-foreground flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={sequential} onChange={(e) => setSequential(e.target.checked)} className="rounded border-border"/>
                  Execute sequentially (each card waits for prior)
                </label>
              </div>

              {/* Draft cards */}
              {drafts.map((d, idx) => (
                <DraftCardRow
                  key={idx}
                  index={idx + 1}
                  draft={d}
                  expanded={expandedIdx === idx}
                  onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                  onUpdate={(patch) => updateDraft(idx, patch)}
                  onAddDep={(cat) => addDependency(idx, cat)}
                  onRemoveDep={(depId) => removeDependency(idx, depId)}
                  onToggleDep={(depId) => toggleDepMet(idx, depId)}
                  onUpdateDepLabel={(depId, label) => updateDepLabel(idx, depId, label)}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center gap-3 bg-muted/10">
          {goalSummary && (
            <div className="text-[10px] text-muted-foreground">
              <Target className="h-3 w-3 inline mr-1" />
              Targeting {goalSummary.metric} = {goalSummary.target_value} by {new Date(goalSummary.target_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={handlePush}
            disabled={pushing || loading || drafts.length === 0}
            className="text-[11px] px-3 py-1.5 rounded-lg font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-500/30 disabled:opacity-50 flex items-center gap-1.5"
          >
            {pushing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
            {pushing ? 'Pushing…' : `Push ${drafts.length} ${drafts.length === 1 ? 'card' : 'cards'} →`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── DraftCardRow ──────────────────────────────────────────── */

function DraftCardRow({
  index, draft, expanded, onToggle, onUpdate,
  onAddDep, onRemoveDep, onToggleDep, onUpdateDepLabel,
}: {
  index: number;
  draft: CardDraftClient;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<CardDraftClient>) => void;
  onAddDep: (cat: DependencyCategoryClient) => void;
  onRemoveDep: (depId: string) => void;
  onToggleDep: (depId: string) => void;
  onUpdateDepLabel: (depId: string, label: string) => void;
}) {
  const priorityColors = {
    high: 'text-red-400 bg-red-500/15 border-red-500/30',
    medium: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
    low: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
  };

  /* Group dependencies by category for display */
  const grouped: Record<DependencyCategoryClient, DependencyItemClient[]> = {
    access: [], content: [], info: [], approval: [], task_prereq: [],
  };
  for (const r of draft.requirements) {
    if (grouped[r.category]) grouped[r.category].push(r);
  }

  /* Impact summary */
  const impactSummary = summarizeImpactClient(draft.expected_impact);

  return (
    <div className={`rounded-xl border bg-card/40 overflow-hidden ${
      expanded ? 'border-cyan-500/30' : 'border-border hover:border-cyan-500/20'
    }`}>
      {/* Row header */}
      <div onClick={onToggle} className="px-3 py-2.5 cursor-pointer flex items-center gap-2">
        <span className="text-[10px] font-bold text-cyan-400/60 w-5">{index}.</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold border ${priorityColors[draft.priority]}`}>
              {draft.priority}
            </span>
            <div className="text-[12px] font-bold text-foreground truncate">{draft.title}</div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span><Clock className="h-2.5 w-2.5 inline mr-0.5" />{draft.estimated_hours}h</span>
            <span><Calendar className="h-2.5 w-2.5 inline mr-0.5" />
              {new Date(draft.target_start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} → {new Date(draft.target_completion_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
            </span>
            <span>{draft.requirements.length} {draft.requirements.length === 1 ? 'dep' : 'deps'}</span>
            {impactSummary && <span className="text-emerald-400/80">{impactSummary}</span>}
          </div>
        </div>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/40 space-y-3">
          {/* Title + dates + priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Title</label>
              <input
                value={draft.title}
                onChange={(e) => onUpdate({ title: e.target.value })}
                className="w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background/60 focus:outline-none focus:border-cyan-500/40 mt-0.5"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Start date</label>
              <input type="date"
                value={draft.target_start_date}
                onChange={(e) => onUpdate({ target_start_date: e.target.value })}
                className="w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background/60 focus:outline-none focus:border-cyan-500/40 mt-0.5"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Completion date</label>
              <input type="date"
                value={draft.target_completion_date}
                onChange={(e) => onUpdate({ target_completion_date: e.target.value })}
                className="w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background/60 focus:outline-none focus:border-cyan-500/40 mt-0.5"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Priority</label>
              <select
                value={draft.priority}
                onChange={(e) => onUpdate({ priority: e.target.value as any })}
                className="w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background/60 focus:outline-none focus:border-cyan-500/40 mt-0.5"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Estimated hours</label>
              <input type="number" min={0.5} step={0.5}
                value={draft.estimated_hours}
                onChange={(e) => onUpdate({ estimated_hours: Number(e.target.value) })}
                className="w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background/60 focus:outline-none focus:border-cyan-500/40 mt-0.5"
              />
            </div>
          </div>

          {/* Dependencies — driven by action library templates + auto-resolved
              from project resolution stores. PM cannot edit per-card; they
              resolve via the store panels (Data Room → Access Vault, etc.) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Dependencies (auto-resolved from project stores)</div>
              <div className="text-[10px] text-muted-foreground italic">
                {draft.requirements.filter(r => r.met).length}/{draft.requirements.length} resolved
              </div>
            </div>
            <div className="space-y-2">
              {CATEGORIES.map((cat) => {
                const meta = CATEGORY_META[cat];
                const items = grouped[cat];
                if (items.length === 0) return null;
                const resolvedCount = items.filter(i => i.met).length;
                return (
                  <div key={cat} className={`rounded-lg border p-2 ${meta.color}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <meta.icon className="h-3 w-3" />
                      <span className="text-[10px] uppercase tracking-wider font-bold">{meta.label}</span>
                      <span className="text-[9px] opacity-70">{resolvedCount}/{items.length} resolved</span>
                    </div>
                    <div className="space-y-1">
                      {items.map((r) => {
                        const anyR = r as any;
                        const required = anyR.required !== false;
                        const resolved = r.met;
                        const resolvedVia = anyR.resolved_via;
                        const unresolvedPtr = anyR.unresolved_pointer;
                        return (
                          <div key={r.id} className={`flex items-start gap-2 text-[11px] ${resolved ? '' : 'opacity-95'}`}>
                            {resolved
                              ? <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
                              : <AlertCircle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                            }
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`font-semibold ${resolved ? 'text-foreground' : 'text-foreground'}`}>{r.label}</span>
                                {!required && (
                                  <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted/30 text-muted-foreground border border-border">soft</span>
                                )}
                                {required && (
                                  <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30">required</span>
                                )}
                              </div>
                              {resolved && resolvedVia && (
                                <div className="text-[10px] text-emerald-400/80 mt-0.5">
                                  ✓ from {resolvedVia.store === 'access' ? 'Access Vault' : resolvedVia.store === 'content' ? 'Content Library' : resolvedVia.store === 'info' ? 'Info Repository' : 'Approvals Log'}: <span className="italic">{resolvedVia.item_label}</span>
                                </div>
                              )}
                              {!resolved && unresolvedPtr && (
                                <div className="text-[10px] text-amber-400/80 mt-0.5">
                                  ✗ Not yet in {unresolvedPtr.store === 'access' ? 'Access Vault' : unresolvedPtr.store === 'content' ? 'Content Library' : unresolvedPtr.store === 'info' ? 'Info Repository' : 'Approvals Log'} — populate it there to auto-resolve.
                                  {unresolvedPtr.notes && <span className="block italic opacity-80 mt-0.5">{unresolvedPtr.notes}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {draft.requirements.length === 0 && (
                <div className="rounded-lg border border-border bg-background/30 p-2 text-[10px] text-muted-foreground italic">
                  No dependencies declared for this action. (Action library has no templates — card will push with no blockers.)
                </div>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground italic mt-1.5">
              💡 Resolve unmet items by adding them to the relevant store in Data Room. All cards needing them will auto-unblock.
            </div>
          </div>

          {/* Description preview */}
          <details className="text-[10px]">
            <summary className="text-muted-foreground cursor-pointer hover:text-foreground">View card description</summary>
            <div className="mt-1.5 p-2 rounded-md border border-border bg-background/30 text-[10px] text-foreground/80 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
              {draft.description}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function summarizeImpactClient(impact: any): string {
  if (!impact) return '';
  const parts: string[] = [];
  for (const [k, range] of Object.entries(impact)) {
    if (!range || typeof range !== 'object') continue;
    const r = range as any;
    if (r.min == null || r.max == null) continue;
    const mid = (r.min + r.max) / 2;
    if (r.unit === 'position_delta') {
      parts.push(`${mid > 0 ? '+' : ''}${mid.toFixed(1)} pos`);
    } else {
      parts.push(`${mid > 0 ? '+' : ''}${mid.toFixed(0)}% ${k}`);
    }
  }
  return parts.slice(0, 2).join(' · ');
}
