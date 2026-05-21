/* ════════════════════════════════════════════════════════════════
   src/components/pm/StrategyPipelineBoard.tsx
   Phase 6 — Visual 5-stage pipeline board for strategies.

   Columns:
     📝 Drafting     → being planned, no cards yet
     ⏳ Resourcing   → cards pushed, waiting on blockers
     🚀 Executing    → blockers cleared, execution in flight
     📊 Measuring    → cards mostly done, watching impact land
     ✅ Concluded    → done with post-mortem

   Interactions:
     • Click "+" → opens Builder
     • Click strategy card → opens Detail view
     • Click "advance →" button on a card → moves to next stage
       (with gate enforcement: warns + offers override)
     • Health badge color = at-a-glance status
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import {
  Plus, AlertCircle, CheckCircle2, Clock, Target, TrendingUp,
  RefreshCw, ChevronRight, Pause, Play, MoreHorizontal,
} from 'lucide-react';
import {
  listStrategies, advanceStrategy,
  type StrategyRecord, type StrategyStatusClient,
} from './api';

interface Props {
  projectId: string;
  onOpenStrategy: (id: string) => void;
  onNewStrategy: () => void;
}

const STAGES: Array<{ id: StrategyStatusClient; label: string; emoji: string; tone: string }> = [
  { id: 'drafting',   label: 'Drafting',    emoji: '📝', tone: 'border-blue-500/30 bg-blue-500/[0.04]' },
  { id: 'resourcing', label: 'Resourcing',  emoji: '⏳', tone: 'border-amber-500/30 bg-amber-500/[0.04]' },
  { id: 'executing',  label: 'Executing',   emoji: '🚀', tone: 'border-cyan-500/30 bg-cyan-500/[0.04]' },
  { id: 'measuring',  label: 'Measuring',   emoji: '📊', tone: 'border-violet-500/30 bg-violet-500/[0.04]' },
  { id: 'concluded',  label: 'Concluded',   emoji: '✅', tone: 'border-emerald-500/30 bg-emerald-500/[0.04]' },
];

const HORIZON_LABEL: Record<string, string> = {
  short_term: 'short', medium_term: 'medium', long_term: 'long',
};

export default function StrategyPipelineBoard({ projectId, onOpenStrategy, onNewStrategy }: Props) {
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [paused, setPaused]         = useState<StrategyRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    const r = await listStrategies({ projectId });
    if (r.error) setError(r.error);
    const all = r.strategies || [];
    setStrategies(all.filter(s => s.status !== 'paused'));
    setPaused(all.filter(s => s.status === 'paused'));
    setLoading(false); setRefreshing(false);
  };

  useEffect(() => { if (projectId) load(); }, [projectId]);

  const handleAdvance = async (s: StrategyRecord, toStatus: StrategyStatusClient, override = false) => {
    setAdvancingId(s.id);
    const r = await advanceStrategy({ strategyId: s.id, toStatus, override });
    setAdvancingId(null);
    if (r.error) {
      if (r.gate_blocked && r.can_override) {
        const ok = confirm(`${r.error}\n\nOverride and move anyway?`);
        if (ok) return handleAdvance(s, toStatus, true);
      } else {
        setError(r.error);
      }
      return;
    }
    await load(true);
  };

  const nextStatus = (current: StrategyStatusClient): StrategyStatusClient | null => {
    const order: StrategyStatusClient[] = ['drafting','resourcing','executing','measuring','concluded'];
    const i = order.indexOf(current);
    return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-foreground">Strategy Pipeline</div>
          <div className="text-[10px] text-muted-foreground">
            {strategies.length} active · {paused.length} paused
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(true)} disabled={refreshing}
            className="text-[10px] px-2 py-1 rounded-md border border-border hover:bg-muted/40 flex items-center gap-1 disabled:opacity-50">
            <RefreshCw className={`h-2.5 w-2.5 ${refreshing ? 'animate-spin' : ''}`} />Refresh
          </button>
          <button onClick={onNewStrategy}
            className="text-[11px] px-3 py-1.5 rounded-lg font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-500/30 flex items-center gap-1.5">
            <Plus className="h-3 w-3" />New Strategy
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-xs text-red-400 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* 5-column board */}
      {loading ? (
        <div className="text-center py-12 text-xs text-muted-foreground">
          <RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin opacity-50" />
          Loading pipeline…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {STAGES.map((stage) => {
            const items = strategies.filter(s => s.status === stage.id);
            return (
              <div key={stage.id} className={`rounded-xl border ${stage.tone} flex flex-col min-h-[300px]`}>
                <div className="px-3 py-2 border-b border-current/10">
                  <div className="text-[11px] font-bold text-foreground">
                    {stage.emoji} {stage.label}
                  </div>
                  <div className="text-[9px] text-muted-foreground">{items.length} {items.length === 1 ? 'strategy' : 'strategies'}</div>
                </div>
                <div className="p-2 space-y-2 flex-1">
                  {items.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground/60 italic text-center py-4">
                      —
                    </div>
                  ) : (
                    items.map(s => (
                      <StrategyCard
                        key={s.id} strategy={s}
                        onOpen={() => onOpenStrategy(s.id)}
                        onAdvance={(to) => handleAdvance(s, to)}
                        advancing={advancingId === s.id}
                        nextStage={nextStatus(stage.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paused tray */}
      {paused.length > 0 && (
        <details className="rounded-lg border border-border bg-card/30">
          <summary className="px-3 py-2 cursor-pointer text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
            <Pause className="h-3 w-3" />
            Paused ({paused.length}) — click to expand
          </summary>
          <div className="p-2 space-y-1.5">
            {paused.map(s => (
              <div key={s.id} onClick={() => onOpenStrategy(s.id)}
                className="rounded-md border border-border bg-background/30 px-2.5 py-1.5 cursor-pointer hover:border-cyan-500/30 flex items-center justify-between">
                <div className="text-[11px] text-foreground">{s.name}</div>
                <Play className="h-3 w-3 text-cyan-400" />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/* ─── Strategy card on the board ─────────────────────────── */

function StrategyCard({
  strategy: s, onOpen, onAdvance, advancing, nextStage,
}: {
  strategy: StrategyRecord;
  onOpen: () => void;
  onAdvance: (to: StrategyStatusClient) => void;
  advancing: boolean;
  nextStage: StrategyStatusClient | null;
}) {
  const h = s.health;
  const healthColor = h && h.hard_blockers > 0 ? 'border-red-500/40 bg-red-500/[0.04]' :
                      h && h.completion_pct >= 100 ? 'border-emerald-500/40 bg-emerald-500/[0.04]' :
                      h && (s.on_track === false) ? 'border-amber-500/40 bg-amber-500/[0.04]' :
                      'border-border bg-card/40';

  return (
    <div className={`rounded-lg border ${healthColor} p-2 cursor-pointer hover:border-cyan-500/40 transition-all`}
         onClick={onOpen}>
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="text-[11px] font-bold text-foreground line-clamp-2 flex-1">{s.name}</div>
        <span className="text-[8px] uppercase tracking-wider text-muted-foreground shrink-0">{HORIZON_LABEL[s.horizon]}</span>
      </div>

      {/* Mini stats */}
      {h && h.total_cards > 0 && (
        <>
          <div className="h-1 rounded-full bg-muted/40 overflow-hidden my-1.5">
            <div className="h-full bg-cyan-500/60" style={{ width: `${h.completion_pct}%` }} />
          </div>
          <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
            <span>{h.cards_done}/{h.total_cards} done</span>
            {h.hard_blockers > 0 && <span className="text-red-400">⛔ {h.hard_blockers}</span>}
            {h.soft_blockers > 0 && <span className="text-amber-400">⚠ {h.soft_blockers}</span>}
          </div>
        </>
      )}

      {/* Expected impact */}
      {s.expected_impact && (
        <div className="text-[9px] text-emerald-400/80 mt-1 truncate">
          <TrendingUp className="h-2.5 w-2.5 inline mr-0.5" />
          {summarizeImpact(s.expected_impact)}
        </div>
      )}

      {/* On-track / actual impact */}
      {s.actual_impact?.summary && (
        <div className="text-[9px] mt-0.5 truncate">
          {s.on_track === true ? <span className="text-emerald-400">✓ on track</span> :
           s.on_track === false ? <span className="text-amber-400">⚠ off track</span> :
           <span className="text-muted-foreground">measuring…</span>}
          {' '}
          {s.actual_impact.summary.gsc_clicks_lift_pct != null && (
            <span className="text-foreground/80">
              {s.actual_impact.summary.gsc_clicks_lift_pct > 0 ? '+' : ''}
              {s.actual_impact.summary.gsc_clicks_lift_pct.toFixed(0)}% clicks
            </span>
          )}
        </div>
      )}

      {/* Advance button */}
      {nextStage && (
        <button onClick={(e) => { e.stopPropagation(); onAdvance(nextStage); }}
          disabled={advancing}
          className="w-full mt-1.5 text-[9px] px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50 flex items-center justify-center gap-0.5">
          {advancing ? '…' : <>→ {STAGES.find(x => x.id === nextStage)!.label}</>}
        </button>
      )}
    </div>
  );
}

function summarizeImpact(impact: any): string {
  if (!impact) return '';
  try {
    if (impact.projected?.clicks) {
      const p = impact.projected.clicks;
      const lift = p.baseline > 0 ? ((p.day_90 - p.baseline) / p.baseline) * 100 : 0;
      return `${lift > 0 ? '+' : ''}${lift.toFixed(0)}% clicks @ 90d`;
    }
  } catch { /* skip */ }
  return 'projected impact';
}
