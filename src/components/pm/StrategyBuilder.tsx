/* ════════════════════════════════════════════════════════════════
   src/components/pm/StrategyBuilder.tsx
   Phase 6 — Strategy Builder.

   3-column planning canvas:
     LEFT   — Context rail. Project goals, top KPIs, rising/falling
              stars, data room categories, recent audits, blockers.
              The PM sees everything relevant for planning at a glance.
     MIDDLE — Planning canvas. Hosts the existing What-If Simulator and
              Goal Engine components (re-used, not rebuilt).
     RIGHT  — Draft strategy panel. Name, horizon, dates, linked goals,
              source scenario, expected impact preview, Save / Finalize.

   Finalize → strategy advances drafting → resourcing, kanban cards
   are created from the source scenario with strategic_link pointing
   to this strategy.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import {
  ArrowLeft, Save, Rocket, AlertCircle, X, Sparkles, Target, BarChart3,
  TrendingUp, TrendingDown, FileText, Layers, ChevronDown, ChevronRight,
  Calendar, RefreshCw, Building2, Database, Shield, BookOpen,
} from 'lucide-react';
import WhatIfSimulator from './WhatIfSimulator';
import GoalEngine from './GoalEngine';
import {
  getPlanningContext, saveStrategy, getStrategy, finalizeStrategy,
  type StrategyRecord, type StrategyHorizonClient, type PlanningContext,
} from './api';

interface Props {
  projectId: string;
  /** If provided, edit existing strategy. Otherwise, start a new draft. */
  strategyId?: string;
  onBack: () => void;
  onSaved?: (id: string) => void;
  onFinalized?: (id: string) => void;
}

const HORIZON_OPTS: Array<{ value: StrategyHorizonClient; label: string; sub: string }> = [
  { value: 'short_term',  label: 'Short-term',  sub: '0–30 days · quick wins' },
  { value: 'medium_term', label: 'Medium-term', sub: '30–90 days · most strategies' },
  { value: 'long_term',   label: 'Long-term',   sub: '90+ days · structural change' },
];

export default function StrategyBuilder({ projectId, strategyId, onBack, onSaved, onFinalized }: Props) {
  const [draft, setDraft] = useState<Partial<StrategyRecord>>({
    name: '', description: '',
    horizon: 'medium_term', status: 'drafting',
    linked_goal_ids: [], source_scenario_id: null,
    target_start_date: new Date().toISOString().slice(0, 10),
    target_end_date:   new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
  });
  const [context, setContext]   = useState<PlanningContext | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [info, setInfo]         = useState<string | null>(null);

  /* Load context + existing strategy */
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      const [ctxRes, sRes] = await Promise.all([
        getPlanningContext(projectId),
        strategyId ? getStrategy(strategyId) : Promise.resolve({ strategy: null } as any),
      ]);
      if (ctxRes.context) setContext(ctxRes.context);
      if ((sRes as any).strategy) setDraft((sRes as any).strategy);
      setLoading(false);
    })();
  }, [projectId, strategyId]);

  /* Auto-update end date when horizon changes (if user hasn't overridden) */
  useEffect(() => {
    if (!draft.horizon) return;
    const days = draft.horizon === 'short_term' ? 30 : draft.horizon === 'medium_term' ? 90 : 180;
    const start = new Date(draft.target_start_date || new Date().toISOString().slice(0, 10));
    const newEnd = new Date(start.getTime() + days * 86_400_000).toISOString().slice(0, 10);
    setDraft(d => ({ ...d, target_end_date: newEnd }));
  }, [draft.horizon, draft.target_start_date]);

  const handleSaveDraft = async () => {
    if (!draft.name || !draft.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    const r = await saveStrategy({ projectId, strategy: draft as any });
    setSaving(false);
    if (r.error) { setError(r.error); return; }
    setInfo('Draft saved.');
    setTimeout(() => setInfo(null), 3000);
    if (r.strategy) {
      setDraft(r.strategy);
      onSaved?.(r.strategy.id);
    }
  };

  const handleFinalize = async () => {
    if (!draft.id) { setError('Save the draft first.'); return; }
    if (!draft.source_scenario_id) { setError('Pick a source scenario in the middle panel first (the simulator).'); return; }
    if (!confirm(`Finalize "${draft.name}"?\n\nThis pushes the scenario's actions to your kanban as cards, locked to this strategy. The strategy moves to Resourcing.`)) return;

    setFinalizing(true);
    const r = await finalizeStrategy({ strategyId: draft.id });
    setFinalizing(false);
    if (r.error) { setError(r.error); return; }
    setInfo(`Finalized — ${r.cards_created} cards created. Strategy is now in Resourcing.`);
    onFinalized?.(draft.id);
  };

  const linkGoal = (goalId: string) => {
    setDraft(d => ({
      ...d,
      linked_goal_ids: (d.linked_goal_ids || []).includes(goalId)
        ? (d.linked_goal_ids || []).filter(g => g !== goalId)
        : [...(d.linked_goal_ids || []), goalId],
    }));
  };

  const linkScenario = (scenarioId: string, expected_impact?: any) => {
    setDraft(d => ({ ...d, source_scenario_id: scenarioId, expected_impact: expected_impact || d.expected_impact }));
    setInfo('Scenario linked. Save the draft to keep this.');
    setTimeout(() => setInfo(null), 3000);
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-xs text-muted-foreground">
        <RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin opacity-50" />
        Loading planning workspace…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Builder header */}
      <div className="px-3 py-2 border-b border-border bg-card/40 flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/40">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <input
            type="text"
            value={draft.name || ''}
            onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="Strategy name (e.g. Q4 Pricing Push)"
            className="w-full text-sm font-bold bg-transparent border-0 focus:outline-none focus:border-b focus:border-cyan-500/40 text-foreground"
          />
        </div>
        <button onClick={handleSaveDraft} disabled={saving}
          className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50 flex items-center gap-1.5">
          <Save className="h-3 w-3" />{saving ? 'Saving…' : 'Save draft'}
        </button>
        <button onClick={handleFinalize} disabled={finalizing || !draft.id}
          className="text-[11px] px-3 py-1.5 rounded-lg font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-500/30 disabled:opacity-50 flex items-center gap-1.5"
          title={!draft.id ? 'Save the draft first' : 'Push cards to kanban and start resourcing'}>
          <Rocket className="h-3 w-3" />{finalizing ? 'Finalizing…' : 'Finalize →'}
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 m-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-xs text-red-400 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)}><X className="h-3 w-3" /></button>
        </div>
      )}
      {info && (
        <div className="px-3 py-2 m-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] text-xs text-emerald-400">
          {info}
        </div>
      )}

      {/* 3-column canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 flex-1 overflow-y-auto">
        {/* LEFT: Context rail */}
        <div className="lg:col-span-3 space-y-3">
          <ContextRail context={context} linkedGoals={draft.linked_goal_ids || []} onLinkGoal={linkGoal} />
        </div>

        {/* MIDDLE: Simulator + Goal engine */}
        <div className="lg:col-span-6 space-y-3">
          <Section title="What-If Simulator" subtitle="Pick actions, project impact. Save scenarios — they become source for this strategy.">
            <WhatIfSimulator projectId={projectId} />
          </Section>
          <Section title="Goal Engine" subtitle="Set targets, see trajectory, get scenario suggestions for closing the gap.">
            <GoalEngine projectId={projectId} defaultCollapsed />
          </Section>
        </div>

        {/* RIGHT: Draft strategy */}
        <div className="lg:col-span-3 space-y-3">
          <DraftPanel
            draft={draft}
            setDraft={setDraft}
            scenarios={context?.saved_scenarios || []}
            goals={context?.active_goals || []}
            onLinkScenario={linkScenario}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Section wrapper ─────────────────────────────────────── */

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: any }) {
  return (
    <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card/40">
        <div className="text-[12px] font-bold text-foreground">{title}</div>
        <div className="text-[9px] text-muted-foreground italic">{subtitle}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

/* ─── Context rail ────────────────────────────────────────── */

function ContextRail({
  context, linkedGoals, onLinkGoal,
}: { context: PlanningContext | null; linkedGoals: string[]; onLinkGoal: (id: string) => void }) {
  if (!context) return <div className="text-[10px] text-muted-foreground italic">Context loading…</div>;
  return (
    <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card/40">
        <div className="text-[11px] font-bold text-foreground">Project context</div>
        <div className="text-[9px] text-muted-foreground italic">All data the PM needs — click goals to link them.</div>
      </div>
      <div className="p-2 space-y-2 text-[10px]">
        {/* Project */}
        {context.project && (
          <ContextBlock icon={Building2} label="Project">
            <div className="text-foreground/85">{context.project.project_name}</div>
            {context.project.client_url && <div className="text-muted-foreground text-[9px] truncate">{context.project.client_url}</div>}
          </ContextBlock>
        )}

        {/* Active goals */}
        <ContextBlock icon={Target} label={`Active goals (${context.active_goals.length})`}>
          {context.active_goals.length === 0 ? (
            <div className="text-muted-foreground italic">No active goals. Set one in the Goal Engine →</div>
          ) : (
            <div className="space-y-1">
              {context.active_goals.map(g => (
                <button key={g.id} onClick={() => onLinkGoal(g.id)}
                  className={`block w-full text-left rounded-md border px-2 py-1 ${
                    linkedGoals.includes(g.id) ? 'border-cyan-500/40 bg-cyan-500/[0.08] text-cyan-400' : 'border-border bg-background/30 text-foreground/85 hover:border-cyan-500/30'
                  }`}>
                  <div className="font-bold truncate">{g.name || g.metric}</div>
                  <div className="text-[9px] text-muted-foreground">
                    target {g.target_value} by {new Date(g.target_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ContextBlock>

        {/* Top KPIs */}
        {context.top_kpis.length > 0 && (
          <ContextBlock icon={BarChart3} label="Top KPIs">
            <div className="space-y-0.5">
              {context.top_kpis.map((k: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-[9px]">
                  <span className="text-muted-foreground truncate">{k.label || k.name}</span>
                  <span className="text-foreground font-bold">{k.current ?? k.value ?? '—'}</span>
                </div>
              ))}
            </div>
          </ContextBlock>
        )}

        {/* Rising stars */}
        {context.rising_stars.length > 0 && (
          <ContextBlock icon={TrendingUp} label="Rising stars" tint="text-emerald-400">
            <div className="space-y-0.5">
              {context.rising_stars.slice(0, 3).map((r: any, i: number) => (
                <div key={i} className="text-[9px] text-foreground/85 truncate">↗ {r.label || r.query || r.page}</div>
              ))}
            </div>
          </ContextBlock>
        )}

        {/* Falling stars */}
        {context.falling_stars.length > 0 && (
          <ContextBlock icon={TrendingDown} label="Falling stars" tint="text-amber-400">
            <div className="space-y-0.5">
              {context.falling_stars.slice(0, 3).map((r: any, i: number) => (
                <div key={i} className="text-[9px] text-foreground/85 truncate">↘ {r.label || r.query || r.page}</div>
              ))}
            </div>
          </ContextBlock>
        )}

        {/* Data room categories summary */}
        {Object.keys(context.dataroom_categories).length > 0 && (
          <ContextBlock icon={Database} label="Data Room">
            <div className="flex flex-wrap gap-1">
              {Object.entries(context.dataroom_categories).map(([cat, n]) => (
                <span key={cat} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                  {cat} <span className="text-foreground/85 font-bold">{n}</span>
                </span>
              ))}
            </div>
          </ContextBlock>
        )}

        {/* Blockers */}
        {context.blockers_count > 0 && (
          <ContextBlock icon={Shield} label="Resolution stores" tint={context.hard_blockers > 0 ? "text-red-400" : "text-amber-400"}>
            <div className="text-foreground/85">
              {context.blockers_count} blocker{context.blockers_count === 1 ? '' : 's'} ·{' '}
              <span className={context.hard_blockers > 0 ? 'text-red-400' : 'text-amber-400'}>{context.hard_blockers} HARD</span>
            </div>
            <div className="text-[9px] text-muted-foreground italic">Resolve in Access Vault / Content / Info / Approvals</div>
          </ContextBlock>
        )}

        {/* Recent audits */}
        {context.recent_audits.length > 0 && (
          <ContextBlock icon={BookOpen} label="Recent audits">
            <div className="space-y-0.5">
              {context.recent_audits.map((a: any) => (
                <div key={a.id} className="text-[9px] text-foreground/85">
                  {new Date(a.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · score {a.overall_score ?? '—'}
                </div>
              ))}
            </div>
          </ContextBlock>
        )}
      </div>
    </div>
  );
}

function ContextBlock({ icon: Icon, label, tint, children }: { icon: any; label: string; tint?: string; children: any }) {
  return (
    <div className="rounded-md border border-border bg-background/30 p-2">
      <div className={`flex items-center gap-1 mb-1 text-[9px] uppercase tracking-wider font-bold ${tint || 'text-muted-foreground'}`}>
        <Icon className="h-2.5 w-2.5" />{label}
      </div>
      {children}
    </div>
  );
}

/* ─── Draft strategy panel (right rail) ───────────────────── */

function DraftPanel({
  draft, setDraft, scenarios, goals, onLinkScenario,
}: {
  draft: Partial<StrategyRecord>;
  setDraft: any;
  scenarios: any[];
  goals: any[];
  onLinkScenario: (id: string, impact?: any) => void;
}) {
  return (
    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/[0.04] overflow-hidden">
      <div className="px-3 py-2 border-b border-cyan-500/20">
        <div className="text-[11px] font-bold text-cyan-400">Draft strategy</div>
        <div className="text-[9px] text-muted-foreground italic">Configure → Save → Finalize</div>
      </div>
      <div className="p-2 space-y-2 text-[10px]">
        {/* Description */}
        <div>
          <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Description</label>
          <textarea
            value={draft.description || ''}
            onChange={(e) => setDraft((d: any) => ({ ...d, description: e.target.value }))}
            placeholder="What this strategy is for (1-2 sentences)"
            rows={2}
            className="w-full text-[10px] px-2 py-1 rounded-md border border-border bg-background/60 focus:outline-none focus:border-cyan-500/40 mt-0.5 resize-y"
          />
        </div>

        {/* Horizon */}
        <div>
          <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Horizon</label>
          <div className="space-y-1 mt-1">
            {HORIZON_OPTS.map(opt => (
              <button key={opt.value}
                onClick={() => setDraft((d: any) => ({ ...d, horizon: opt.value }))}
                className={`block w-full text-left rounded-md border px-2 py-1 ${
                  draft.horizon === opt.value ? 'border-cyan-500/40 bg-cyan-500/[0.08]' : 'border-border bg-background/30 hover:border-cyan-500/20'
                }`}>
                <div className="text-[10px] font-bold text-foreground">{opt.label}</div>
                <div className="text-[9px] text-muted-foreground">{opt.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Start</label>
            <input type="date" value={draft.target_start_date || ''}
              onChange={(e) => setDraft((d: any) => ({ ...d, target_start_date: e.target.value }))}
              className="w-full text-[10px] px-2 py-1 rounded-md border border-border bg-background/60 focus:outline-none focus:border-cyan-500/40 mt-0.5" />
          </div>
          <div>
            <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">End</label>
            <input type="date" value={draft.target_end_date || ''}
              onChange={(e) => setDraft((d: any) => ({ ...d, target_end_date: e.target.value }))}
              className="w-full text-[10px] px-2 py-1 rounded-md border border-border bg-background/60 focus:outline-none focus:border-cyan-500/40 mt-0.5" />
          </div>
        </div>

        {/* Linked goals */}
        <div>
          <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Linked goals ({(draft.linked_goal_ids || []).length})</label>
          {(draft.linked_goal_ids || []).length === 0 ? (
            <div className="text-[10px] text-muted-foreground italic mt-1">Click goals in the left rail to link them.</div>
          ) : (
            <div className="space-y-1 mt-1">
              {(draft.linked_goal_ids || []).map(gid => {
                const g = goals.find(x => x.id === gid);
                return (
                  <div key={gid} className="rounded-md border border-cyan-500/30 bg-cyan-500/[0.08] px-2 py-1 text-[10px] text-foreground/85">
                    {g?.name || g?.metric || gid.slice(0, 8)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Source scenario */}
        <div>
          <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Source scenario *</label>
          {!draft.source_scenario_id ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.05] p-2 text-[10px] text-amber-400 italic mt-1">
              Pick a scenario from the simulator (save scenarios from the middle panel, then choose one here).
            </div>
          ) : (
            <div className="rounded-md border border-cyan-500/30 bg-cyan-500/[0.08] px-2 py-1 text-[10px] text-foreground/85 mt-1">
              {scenarios.find(s => s.id === draft.source_scenario_id)?.name || `scenario ${draft.source_scenario_id.slice(0, 8)}`}
            </div>
          )}
          {scenarios.length > 0 && (
            <select onChange={(e) => {
              if (!e.target.value) return;
              const sc = scenarios.find(s => s.id === e.target.value);
              onLinkScenario(e.target.value, sc?.projected_impact);
              e.target.value = '';
            }}
              value=""
              className="w-full text-[10px] px-2 py-1 rounded-md border border-border bg-background/60 focus:outline-none focus:border-cyan-500/40 mt-1">
              <option value="">— pick a saved scenario —</option>
              {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        {/* Expected impact preview */}
        {draft.expected_impact && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.05] p-2">
            <div className="text-[9px] uppercase tracking-wider font-bold text-emerald-400 mb-1">Expected impact</div>
            <div className="text-[10px] text-foreground/85">
              {summarizeImpactRich(draft.expected_impact)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function summarizeImpactRich(impact: any): string {
  if (!impact) return 'No projection yet.';
  try {
    if (impact.projected?.clicks) {
      const c = impact.projected.clicks;
      const lift = c.baseline > 0 ? ((c.day_90 - c.baseline) / c.baseline) * 100 : 0;
      return `${c.baseline} clicks → ${c.day_90} @ 90d (${lift > 0 ? '+' : ''}${lift.toFixed(0)}%)`;
    }
  } catch { /* skip */ }
  return JSON.stringify(impact).slice(0, 120);
}
