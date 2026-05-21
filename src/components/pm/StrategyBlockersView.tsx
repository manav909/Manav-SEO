/* ════════════════════════════════════════════════════════════════
   src/components/pm/StrategyBlockersView.tsx
   Phase 5 — Strategy Blockers (replaces StrategyDependenciesHub).

   Shows ACTUAL BLOCKERS — missing store items with what each one is
   blocking (cards, scenarios, goals, reports). One-click jumps to
   the right Resolution Store panel.

   No bulk email. No per-card checkbox toggling. The only way to
   resolve a blocker is to populate the relevant store — when that
   happens, retroactive rematch flips dependent cards to resolved.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, X, RefreshCw,
  Key, FileText, Info, Shield, Sparkles, Link2, ArrowRight, Target,
  Layers, FileText as ReportIcon,
} from 'lucide-react';
import {
  getStrategyBlockers, rematchProjectCards,
  type BlockerClient, type BlockersStatsClient, type ResolutionStoreClient,
} from './api';

interface Props {
  projectId: string;
  /** Tells parent which Data Room tab to switch to when user clicks "Resolve in …" */
  onJumpToStore?: (store: ResolutionStoreClient) => void;
  defaultCollapsed?: boolean;
}

const STORE_META: Record<ResolutionStoreClient, { label: string; icon: any; tone: string; accent: string; tab: string }> = {
  access:   { label: 'Access Vault',     icon: Key,      tone: 'border-amber-500/30 bg-amber-500/[0.04]',   accent: 'text-amber-400',   tab: 'access_vault' },
  content:  { label: 'Content Library',  icon: FileText, tone: 'border-emerald-500/30 bg-emerald-500/[0.04]', accent: 'text-emerald-400', tab: 'content_library' },
  info:     { label: 'Info Repository',  icon: Info,     tone: 'border-blue-500/30 bg-blue-500/[0.04]',     accent: 'text-blue-400',    tab: 'info_repository' },
  approval: { label: 'Approvals Log',    icon: Shield,   tone: 'border-violet-500/30 bg-violet-500/[0.04]', accent: 'text-violet-400',  tab: 'approvals_log' },
};

const BLOCKED_ITEM_ICON = {
  card:     Layers,
  scenario: Sparkles,
  goal:     Target,
  report:   ReportIcon,
};

export default function StrategyBlockersView({ projectId, onJumpToStore, defaultCollapsed }: Props) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const [blockers, setBlockers] = useState<BlockerClient[]>([]);
  const [stats, setStats]       = useState<BlockersStatsClient | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [filterStore, setFilterStore] = useState<ResolutionStoreClient | "all">("all");
  const [rematching, setRematching] = useState(false);
  const [rematchMsg, setRematchMsg] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    const r = await getStrategyBlockers(projectId);
    if (r.error) setError(r.error);
    setBlockers(r.blockers || []);
    setStats(r.stats || null);
    setLoading(false); setRefreshing(false);
  };

  useEffect(() => { if (projectId && expanded) load(); }, [projectId, expanded]);

  const handleRematch = async () => {
    setRematching(true);
    const r = await rematchProjectCards(projectId);
    setRematching(false);
    if (r.error) { setError(r.error); return; }
    setRematchMsg(`Rematched ${r.cardsUpdated} cards (${r.errors || 0} errors).`);
    setTimeout(() => setRematchMsg(null), 4000);
    await load(true);
  };

  const filtered = filterStore === "all" ? blockers : blockers.filter(b => b.store === filterStore);

  return (
    <div className="rounded-2xl border border-pink-500/20 bg-gradient-to-br from-pink-500/[0.06] via-card/40 to-cyan-500/[0.04] mb-4 overflow-hidden">
      <div onClick={() => setExpanded(!expanded)}
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-pink-500/[0.04] border-b border-pink-500/10">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-pink-400" />
          <div>
            <div className="text-sm font-bold text-foreground">Strategy Blockers</div>
            <div className="text-[10px] text-muted-foreground">
              Missing store items + what each blocks · resolve once, every card unblocks
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          {stats && stats.hard_blockers > 0 && (
            <span className="font-bold text-red-400">{stats.hard_blockers} hard</span>
          )}
          {stats && stats.soft_blockers > 0 && (
            <span className="font-bold text-amber-400">{stats.soft_blockers} soft</span>
          )}
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-3">
          {error && (
            <div className="px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-xs text-red-400 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
              <button onClick={() => setError(null)}><X className="h-3 w-3" /></button>
            </div>
          )}
          {rematchMsg && (
            <div className="px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {rematchMsg}
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <StatTile label="Total blockers" value={stats.total_blockers} sub={`${stats.hard_blockers} hard · ${stats.soft_blockers} soft`} color="text-foreground" />
              <StatTile label="Cards blocked"  value={stats.total_cards_blocked} sub="across strategy" color="text-amber-400" />
              <StatTile label="Scenarios"      value={stats.total_scenarios_blocked} sub="impacted" color="text-violet-400" />
              <StatTile label="Goals"          value={stats.total_goals_blocked} sub="impacted" color="text-cyan-400" />
              <StatTile label="By store"
                value={stats.total_blockers}
                sub={`A${stats.by_store.access}·C${stats.by_store.content}·I${stats.by_store.info}·Ap${stats.by_store.approval}`}
                color="text-foreground" />
            </div>
          )}

          {/* Filter + rematch */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setFilterStore("all")}
              className={`text-[10px] px-2 py-1 rounded-md border ${filterStore === "all" ? 'bg-pink-500/15 text-pink-400 border-pink-500/40' : 'border-border text-muted-foreground'}`}>
              All stores
            </button>
            {(Object.keys(STORE_META) as ResolutionStoreClient[]).map(s => {
              const m = STORE_META[s];
              return (
                <button key={s} onClick={() => setFilterStore(s)}
                  className={`text-[10px] px-2 py-1 rounded-md border flex items-center gap-1 ${
                    filterStore === s ? `${m.tone} ${m.accent}` : 'border-border text-muted-foreground'
                  }`}>
                  <m.icon className="h-2.5 w-2.5" />{m.label}
                </button>
              );
            })}
            <div className="flex-1" />
            <button onClick={handleRematch} disabled={rematching}
              className="text-[10px] px-2 py-1 rounded-md border border-cyan-500/30 text-cyan-400 bg-cyan-500/[0.06] hover:bg-cyan-500/15 disabled:opacity-50 flex items-center gap-1"
              title="Force re-check every strategy card against current store state">
              <RefreshCw className={`h-2.5 w-2.5 ${rematching ? 'animate-spin' : ''}`} />
              {rematching ? 'Rematching…' : 'Rematch all'}
            </button>
            <button onClick={() => load(true)} disabled={refreshing}
              className="text-[10px] px-2 py-1 rounded-md border border-border hover:bg-muted/40 flex items-center gap-1 disabled:opacity-50">
              <RefreshCw className={`h-2.5 w-2.5 ${refreshing ? 'animate-spin' : ''}`} />Refresh
            </button>
          </div>

          {/* Body */}
          {loading ? (
            <div className="text-center py-8 text-xs text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="h-3 w-3 animate-spin" />Computing blockers…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-5 w-5 mx-auto mb-2 text-emerald-400" />
              <div className="text-sm font-semibold text-foreground">
                {filterStore === "all"
                  ? "No blockers — strategy execution unblocked."
                  : `No blockers in ${STORE_META[filterStore as ResolutionStoreClient].label}.`}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Either no strategy cards exist, or all templates are resolved in their stores.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((b, i) => (
                <BlockerRow key={`${b.store}-${b.label}-${i}`} blocker={b} onJumpToStore={onJumpToStore} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-2.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-[9px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function BlockerRow({
  blocker, onJumpToStore,
}: { blocker: BlockerClient; onJumpToStore?: (store: ResolutionStoreClient) => void }) {
  const [open, setOpen] = useState(false);
  const meta = STORE_META[blocker.store];
  return (
    <div className={`rounded-xl border ${meta.tone} overflow-hidden`}>
      <div onClick={() => setOpen(!open)} className="px-3 py-2 cursor-pointer hover:bg-muted/10 flex items-center gap-2">
        <meta.icon className={`h-3.5 w-3.5 ${meta.accent}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-bold text-foreground">{blocker.label}</span>
            <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
              blocker.required ? 'text-red-400 bg-red-500/15' : 'text-amber-400 bg-amber-500/15'
            }`}>{blocker.required ? 'HARD' : 'soft'}</span>
            <span className={`text-[9px] uppercase tracking-wider ${meta.accent}`}>{meta.label}</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Blocks: <span className="text-foreground/85">
              {blocker.block_summary.cards > 0   && `${blocker.block_summary.cards} card${blocker.block_summary.cards === 1 ? '' : 's'}`}
              {blocker.block_summary.scenarios > 0 && ` · ${blocker.block_summary.scenarios} scenario${blocker.block_summary.scenarios === 1 ? '' : 's'}`}
              {blocker.block_summary.goals > 0   && ` · ${blocker.block_summary.goals} goal${blocker.block_summary.goals === 1 ? '' : 's'}`}
              {blocker.block_summary.reports > 0 && ` · ${blocker.block_summary.reports} report${blocker.block_summary.reports === 1 ? '' : 's'}`}
            </span>
          </div>
          {blocker.notes && (
            <div className="text-[10px] italic text-muted-foreground/80 mt-0.5">{blocker.notes}</div>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onJumpToStore?.(blocker.store); }}
          className={`text-[10px] px-2 py-1 rounded-md font-bold ${meta.accent} ${meta.tone} hover:bg-current/15 flex items-center gap-1`}
          title={`Open ${meta.label} and add this item`}>
          Resolve in {meta.label}<ArrowRight className="h-2.5 w-2.5" />
        </button>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      {open && (
        <div className="px-3 pb-2 pt-1 border-t border-current/10 space-y-1">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">What this blocks</div>
          {blocker.blocks.map((b, i) => {
            const Icon = BLOCKED_ITEM_ICON[b.type];
            return (
              <div key={`${b.type}-${b.id}-${i}`} className="flex items-center gap-2 text-[10px]">
                <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground w-16">{b.type}</span>
                <span className="text-foreground/85 truncate flex-1">{b.title}</span>
                {b.status && <span className="text-[9px] uppercase text-muted-foreground">{b.status.replace('_',' ')}</span>}
                {b.due_date && <span className="text-[9px] text-amber-400">due {b.due_date}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
