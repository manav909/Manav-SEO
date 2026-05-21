/* ════════════════════════════════════════════════════════════════
   src/components/pm/StrategyDetailView.tsx
   Phase 6 — Strategy Detail / monitoring view.

   When PM clicks a strategy on the board, this opens:
     • Header (name, status, horizon, dates, action buttons)
     • Visual progress bars (tasks % + goal %)
     • Real impact chart (weekly from GSC/GA4 vs expected)
     • Cards list (filtered to this strategy)
     • Blockers (filtered to this strategy's cards)
     • Conclude / pause / edit actions
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import {
  ArrowLeft, Target, TrendingUp, Calendar, Clock, AlertCircle,
  CheckCircle2, RefreshCw, Pause, Play, X, Trash2, FileText,
  Rocket, Edit2, ChevronDown, ChevronRight, Shield, Sparkles, BarChart3,
} from 'lucide-react';
import {
  getStrategy, advanceStrategy, concludeStrategy, deleteStrategy, getStrategyImpact,
  type StrategyRecord, type StrategyStatusClient,
} from './api';

interface Props {
  strategyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDeleted: () => void;
}

const STATUS_META: Record<string, { label: string; emoji: string; color: string }> = {
  drafting:   { label: 'Drafting',    emoji: '📝', color: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
  resourcing: { label: 'Resourcing',  emoji: '⏳', color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
  executing:  { label: 'Executing',   emoji: '🚀', color: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30' },
  measuring:  { label: 'Measuring',   emoji: '📊', color: 'text-violet-400 bg-violet-500/15 border-violet-500/30' },
  concluded:  { label: 'Concluded',   emoji: '✅', color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  paused:     { label: 'Paused',      emoji: '⏸',  color: 'text-muted-foreground bg-muted/30 border-border' },
};

export default function StrategyDetailView({ strategyId, onBack, onEdit, onDeleted }: Props) {
  const [strategy, setStrategy] = useState<StrategyRecord | null>(null);
  const [cards, setCards]       = useState<any[]>([]);
  const [goals, setGoals]       = useState<any[]>([]);
  const [health, setHealth]     = useState<any>(null);
  const [blockers, setBlockers] = useState<any[]>([]);
  const [impact, setImpact]     = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshingImpact, setRefreshingImpact] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    const r = await getStrategy(strategyId);
    if (r.error) setError(r.error);
    setStrategy(r.strategy || null);
    setCards(r.cards || []);
    setGoals(r.goals || []);
    setHealth(r.health || null);
    setBlockers(r.blockers || []);
    /* Load impact in parallel — only meaningful after finalize */
    if (r.strategy?.finalized_at) {
      const imp = await getStrategyImpact(strategyId);
      setImpact({ trace: imp.trace || [], summary: imp.summary || null });
    }
    setLoading(false);
  };

  useEffect(() => { if (strategyId) load(); }, [strategyId]);

  const handleAdvance = async (toStatus: StrategyStatusClient, override = false) => {
    setAdvancing(true);
    const r = await advanceStrategy({ strategyId, toStatus, override });
    setAdvancing(false);
    if (r.error) {
      if (r.gate_blocked && r.can_override && confirm(`${r.error}\n\nOverride and move anyway?`)) {
        return handleAdvance(toStatus, true);
      }
      setError(r.error);
      return;
    }
    await load();
  };

  const handleConclude = async () => {
    const summary = prompt('Conclude this strategy. Write a 1-2 sentence post-mortem (what worked, what didn\'t):');
    if (summary == null) return;
    const r = await concludeStrategy({ strategyId, conclusion_summary: summary });
    if (r.error) { setError(r.error); return; }
    await load();
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${strategy?.name}"? This removes the strategy record. Kanban cards stay (you can clean up separately).`)) return;
    const r = await deleteStrategy(strategyId);
    if (r.error) { setError(r.error); return; }
    onDeleted();
  };

  const handleRefreshImpact = async () => {
    setRefreshingImpact(true);
    const r = await getStrategyImpact(strategyId);
    setRefreshingImpact(false);
    setImpact({ trace: r.trace || [], summary: r.summary || null });
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-xs text-muted-foreground">
        <RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin opacity-50" />Loading strategy…
      </div>
    );
  }
  if (!strategy) return <div className="text-center py-12 text-xs text-muted-foreground">Strategy not found.</div>;

  const meta = STATUS_META[strategy.status] || STATUS_META.drafting;
  const nextStage: StrategyStatusClient | null =
    strategy.status === 'drafting'   ? 'resourcing' :
    strategy.status === 'resourcing' ? 'executing'  :
    strategy.status === 'executing'  ? 'measuring'  :
    strategy.status === 'measuring'  ? 'concluded'  : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-card/40 flex items-center gap-2 sticky top-0 z-10">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/40">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold border ${meta.color}`}>
              {meta.emoji} {meta.label}
            </span>
            <div className="text-sm font-bold text-foreground truncate">{strategy.name}</div>
          </div>
          {strategy.description && (
            <div className="text-[10px] text-muted-foreground line-clamp-1">{strategy.description}</div>
          )}
        </div>
        {nextStage && strategy.status !== 'concluded' && strategy.status !== 'paused' && (
          <button onClick={() => handleAdvance(nextStage)} disabled={advancing}
            className="text-[11px] px-3 py-1.5 rounded-lg font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50 flex items-center gap-1">
            → {STATUS_META[nextStage].label}
          </button>
        )}
        {strategy.status !== 'concluded' && strategy.status !== 'paused' && (
          <button onClick={() => handleAdvance('paused')} disabled={advancing}
            className="p-1.5 rounded-md text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10" title="Pause">
            <Pause className="h-3.5 w-3.5" />
          </button>
        )}
        {strategy.status === 'paused' && (
          <button onClick={() => handleAdvance('executing')} disabled={advancing}
            className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10" title="Resume">
            <Play className="h-3.5 w-3.5" />
          </button>
        )}
        <button onClick={() => onEdit(strategy.id)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40" title="Edit in Builder">
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        {strategy.status === 'measuring' && (
          <button onClick={handleConclude}
            className="text-[11px] px-2.5 py-1.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25">
            Conclude
          </button>
        )}
        <button onClick={handleDelete}
          className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10" title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {error && (
        <div className="m-3 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-xs text-red-400 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)}><X className="h-3 w-3" /></button>
        </div>
      )}

      <div className="p-3 space-y-3">
        {/* Meta strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Meta label="Horizon"   value={strategy.horizon.replace('_term','')} />
          <Meta label="Start"     value={strategy.target_start_date ? new Date(strategy.target_start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'} />
          <Meta label="End"       value={strategy.target_end_date ? new Date(strategy.target_end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'} />
          <Meta label="Finalized" value={strategy.finalized_at ? new Date(strategy.finalized_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'Not yet'} />
        </div>

        {/* Health bars */}
        {health && (
          <div className="rounded-xl border border-border bg-card/30 p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Health</div>
            <div className="space-y-2">
              <ProgressBar
                label="Tasks complete"
                pct={health.completion_pct}
                annot={`${health.cards_done}/${health.total_cards} cards · ${health.cards_in_progress} in progress · ${health.cards_todo} todo`}
              />
              {impact?.summary?.gsc_clicks_lift_pct != null && (
                <ProgressBar
                  label="Real impact (GSC clicks)"
                  pct={Math.min(100, Math.max(0, impact.summary.gsc_clicks_lift_pct))}
                  annot={`${impact.summary.gsc_clicks_lift_pct > 0 ? '+' : ''}${impact.summary.gsc_clicks_lift_pct.toFixed(1)}% vs baseline · ${impact.summary.weeks_observed} weeks observed`}
                  color="bg-emerald-500/60"
                />
              )}
              {(health.hard_blockers > 0 || health.soft_blockers > 0) && (
                <div className="text-[10px] text-muted-foreground">
                  Blockers: {health.hard_blockers > 0 && <span className="text-red-400 font-bold">{health.hard_blockers} HARD</span>}{health.hard_blockers > 0 && health.soft_blockers > 0 && ' · '}{health.soft_blockers > 0 && <span className="text-amber-400">{health.soft_blockers} soft</span>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Expected vs actual impact */}
        {strategy.expected_impact && (
          <div className="rounded-xl border border-border bg-card/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Impact (expected vs real)</div>
              {strategy.finalized_at && (
                <button onClick={handleRefreshImpact} disabled={refreshingImpact}
                  className="text-[10px] px-2 py-0.5 rounded-md border border-border hover:bg-muted/40 flex items-center gap-1 disabled:opacity-50">
                  <RefreshCw className={`h-2.5 w-2.5 ${refreshingImpact ? 'animate-spin' : ''}`} />
                  Pull from GSC/GA4
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] p-2">
                <div className="text-[9px] uppercase tracking-wider text-blue-400 font-bold mb-1">Expected (at finalize)</div>
                <div className="text-[11px] text-foreground/85">{summarizeImpact(strategy.expected_impact)}</div>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-2">
                <div className="text-[9px] uppercase tracking-wider text-emerald-400 font-bold mb-1">Actual (current)</div>
                <div className="text-[11px] text-foreground/85">
                  {!strategy.finalized_at ? <span className="italic text-muted-foreground">Strategy not finalized yet</span>
                   : impact?.summary ? <>
                      {impact.summary.gsc_clicks_lift_pct != null && <>GSC clicks: <strong>{impact.summary.gsc_clicks_lift_pct > 0 ? '+' : ''}{impact.summary.gsc_clicks_lift_pct.toFixed(1)}%</strong></>}
                      {impact.summary.gsc_clicks_lift_pct != null && impact.summary.ga4_sessions_lift_pct != null && <br />}
                      {impact.summary.ga4_sessions_lift_pct != null && <>GA4 sessions: <strong>{impact.summary.ga4_sessions_lift_pct > 0 ? '+' : ''}{impact.summary.ga4_sessions_lift_pct.toFixed(1)}%</strong></>}
                      <div className="text-[9px] text-muted-foreground mt-1">{impact.summary.weeks_observed} weeks observed since finalize</div>
                    </> : <span className="italic text-muted-foreground">Click "Pull from GSC/GA4" to compute</span>}
                </div>
              </div>
            </div>

            {/* Weekly trace */}
            {impact?.trace?.length > 1 && (
              <div className="mt-2 rounded-lg border border-border bg-background/30 p-2">
                <div className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Weekly trace</div>
                <div className="space-y-0.5">
                  {impact.trace.map((w: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <span className="text-muted-foreground w-24">{w.week_start} → {w.week_end}</span>
                      <span className="text-foreground/85">GSC: <strong>{w.gsc_clicks}</strong></span>
                      <span className="text-foreground/85">GA4: <strong>{w.ga4_sessions}</strong></span>
                      {w.gsc_clicks_delta_pct != null && (
                        <span className={w.gsc_clicks_delta_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {w.gsc_clicks_delta_pct > 0 ? '+' : ''}{w.gsc_clicks_delta_pct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Linked goals */}
        {goals.length > 0 && (
          <Collapsible title={`Linked goals (${goals.length})`} icon={Target} defaultOpen>
            <div className="space-y-1">
              {goals.map(g => (
                <div key={g.id} className="rounded-md border border-border bg-background/30 px-2.5 py-1.5 text-[11px]">
                  <div className="font-bold text-foreground">{g.name || g.metric}</div>
                  <div className="text-[10px] text-muted-foreground">
                    target {g.target_value} by {new Date(g.target_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · status {g.status}
                  </div>
                </div>
              ))}
            </div>
          </Collapsible>
        )}

        {/* Cards */}
        <Collapsible title={`Cards (${cards.length})`} icon={FileText} defaultOpen>
          {cards.length === 0 ? (
            <div className="text-[10px] text-muted-foreground italic">No cards. Finalize the strategy to push cards to kanban.</div>
          ) : (
            <div className="space-y-1">
              {cards.map(c => (
                <div key={c.id} className="rounded-md border border-border bg-background/30 px-2.5 py-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
                      c.status === 'done' ? 'text-emerald-400 bg-emerald-500/15' :
                      c.status === 'in_progress' ? 'text-blue-400 bg-blue-500/15' :
                      'text-muted-foreground bg-muted/30'
                    }`}>{c.status?.replace('_',' ')}</span>
                    <span className="font-bold text-foreground truncate flex-1">{c.title}</span>
                    {c.estimated_hours && <span className="text-[10px] text-muted-foreground">{c.estimated_hours}h</span>}
                  </div>
                  {c.target_completion_date && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">due {new Date(c.target_completion_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Collapsible>

        {/* Blockers */}
        {blockers.length > 0 && (
          <Collapsible title={`Blockers (${blockers.length})`} icon={Shield} defaultOpen tone="border-amber-500/30 bg-amber-500/[0.04]">
            <div className="space-y-1">
              {blockers.map((b, i) => (
                <div key={i} className="rounded-md border border-amber-500/30 bg-amber-500/[0.04] px-2.5 py-1.5 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${b.required ? 'text-red-400 bg-red-500/15' : 'text-amber-400 bg-amber-500/15'}`}>{b.required ? 'HARD' : 'soft'}</span>
                    <span className="font-bold text-foreground">{b.label}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {b.store === 'access' ? 'Resolve in Access Vault' :
                     b.store === 'content' ? 'Resolve in Content Library' :
                     b.store === 'info' ? 'Resolve in Info Repository' : 'Resolve in Approvals Log'}
                  </div>
                </div>
              ))}
            </div>
          </Collapsible>
        )}

        {/* Conclusion summary */}
        {strategy.conclusion_summary && (
          <Collapsible title="Conclusion / Post-mortem" icon={Sparkles} defaultOpen tone="border-emerald-500/30 bg-emerald-500/[0.04]">
            <div className="text-[11px] text-foreground/85 whitespace-pre-wrap">{strategy.conclusion_summary}</div>
          </Collapsible>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ──────────────────────────────────────────────── */

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/30 p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className="text-[11px] text-foreground font-bold">{value}</div>
    </div>
  );
}

function ProgressBar({ label, pct, annot, color }: { label: string; pct: number; annot: string; color?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-bold">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div className={`h-full ${color || 'bg-cyan-500/60'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <div className="text-[9px] text-muted-foreground italic mt-0.5">{annot}</div>
    </div>
  );
}

function Collapsible({ title, icon: Icon, defaultOpen, tone, children }: {
  title: string; icon: any; defaultOpen?: boolean; tone?: string; children: any;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={`rounded-xl border ${tone || 'border-border bg-card/30'} overflow-hidden`}>
      <div onClick={() => setOpen(!open)} className="px-3 py-2 cursor-pointer hover:bg-muted/10 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-bold text-foreground flex-1">{title}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      {open && <div className="px-3 pb-3 pt-1 border-t border-border/40">{children}</div>}
    </div>
  );
}

function summarizeImpact(impact: any): string {
  if (!impact) return 'No projection';
  try {
    if (impact.projected?.clicks) {
      const c = impact.projected.clicks;
      const lift = c.baseline > 0 ? ((c.day_90 - c.baseline) / c.baseline) * 100 : 0;
      return `${c.baseline} → ${c.day_90} @ 90d (${lift > 0 ? '+' : ''}${lift.toFixed(1)}%)`;
    }
  } catch { /* skip */ }
  return 'projected impact';
}
