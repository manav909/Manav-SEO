/* ════════════════════════════════════════════════════════════════
   src/components/pm/StrategyDependenciesHub.tsx
   Phase 4 — Project-wide dependencies command center.

   Answers the question: "What is blocking my strategy execution
   RIGHT NOW, across every card I've pushed to PM?"

   Features:
   - Stats header: total / resolved / unresolved / aging / very-aged
   - Filter by: category, status (all / unresolved / resolved), strategy
   - Group by: category (default) | strategy | card
   - Per-row actions: toggle resolved (instant), jump to card details
   - Aging warnings: red >14d, amber 7-14d
   - Bulk compose: "Send client an email with all open APPROVAL items"
     opens mailto: with subject + body filled in
   - Refresh button + live stats
═══════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from 'react';
import {
  Link2, RefreshCw, AlertCircle, CheckCircle2, ChevronDown, ChevronRight,
  X, Filter, Mail, Key, FileText, Info, Shield, Clock, Layers, Send,
  ExternalLink, Sparkles,
} from 'lucide-react';
import {
  listStrategyDependencies, toggleDependency,
  type DependencyFlatRowClient, type DependenciesHubStats,
  type DependencyCategoryClient,
} from './api';

interface Props {
  projectId: string;
  /** Project name shown in client emails. Optional — fallback "this project". */
  projectName?: string;
  defaultCollapsed?: boolean;
}

const CATEGORY_META: Record<DependencyCategoryClient, { label: string; icon: any; color: string; tone: string }> = {
  access:      { label: 'Access',         icon: Key,      color: 'text-amber-400',   tone: 'border-amber-500/30 bg-amber-500/[0.04]'   },
  content:     { label: 'Content',        icon: FileText, color: 'text-emerald-400', tone: 'border-emerald-500/30 bg-emerald-500/[0.04]' },
  info:        { label: 'Info needed',    icon: Info,     color: 'text-blue-400',    tone: 'border-blue-500/30 bg-blue-500/[0.04]'   },
  approval:    { label: 'Approval',       icon: Shield,   color: 'text-violet-400',  tone: 'border-violet-500/30 bg-violet-500/[0.04]' },
  task_prereq: { label: 'Task prereq',    icon: Link2,    color: 'text-pink-400',    tone: 'border-pink-500/30 bg-pink-500/[0.04]'   },
};

const AGE_META = {
  fresh:     { label: 'fresh',     color: 'text-muted-foreground', icon: Clock },
  aging:     { label: 'aging',     color: 'text-blue-400',         icon: Clock },
  slow:      { label: 'slow',      color: 'text-amber-400',        icon: AlertCircle },
  very_slow: { label: 'very slow', color: 'text-red-400',          icon: AlertCircle },
};

export default function StrategyDependenciesHub({ projectId, projectName, defaultCollapsed }: Props) {
  const [expanded, setExpanded]       = useState(!defaultCollapsed);
  const [deps, setDeps]               = useState<DependencyFlatRowClient[]>([]);
  const [stats, setStats]             = useState<DependenciesHubStats | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [refreshing, setRefreshing]   = useState(false);

  /* Filters */
  const [filterStatus, setFilterStatus]     = useState<"all" | "unresolved" | "resolved">("unresolved");
  const [filterCategory, setFilterCategory] = useState<DependencyCategoryClient | "all">("all");
  const [groupBy, setGroupBy]               = useState<"category" | "strategy" | "card">("category");

  /* Loaders */
  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    const r = await listStrategyDependencies({
      projectId,
      category: filterCategory === "all" ? undefined : filterCategory,
      status:   filterStatus,
    });
    if (r.error) setError(r.error);
    setDeps(r.dependencies || []);
    setStats(r.stats || null);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { if (projectId && expanded) load(); }, [projectId, expanded, filterCategory, filterStatus]);

  /* Toggle a single dep — optimistic update + sync */
  const handleToggle = async (row: DependencyFlatRowClient) => {
    const newMet = !row.req_met;
    setDeps((curr) => curr.map((d) => (d.card_id === row.card_id && d.req_id === row.req_id) ? { ...d, req_met: newMet } : d));
    const r = await toggleDependency({ cardId: row.card_id, reqId: row.req_id, met: newMet });
    if (!r.success) {
      /* revert on error */
      setDeps((curr) => curr.map((d) => (d.card_id === row.card_id && d.req_id === row.req_id) ? { ...d, req_met: row.req_met } : d));
      setError(r.error || 'Failed to update dependency.');
    } else {
      /* refresh stats */
      const r2 = await listStrategyDependencies({ projectId, status: filterStatus, category: filterCategory === "all" ? undefined : filterCategory });
      if (r2.stats) setStats(r2.stats);
    }
  };

  /* Group rows */
  const grouped = useMemo(() => {
    const map = new Map<string, DependencyFlatRowClient[]>();
    for (const d of deps) {
      const key = groupBy === "category" ? d.req_category
                : groupBy === "strategy" ? d.strategy_label
                : `${d.card_id}::${d.card_title}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return [...map.entries()];
  }, [deps, groupBy]);

  /* Bulk compose mailto for a category */
  const composeClientEmail = (category: DependencyCategoryClient | "all_unresolved") => {
    const items = category === "all_unresolved"
      ? deps.filter(d => !d.req_met)
      : deps.filter(d => !d.req_met && d.req_category === category);
    if (items.length === 0) return;
    const catLabel = category === "all_unresolved" ? "outstanding strategy items" : `pending ${CATEGORY_META[category as DependencyCategoryClient].label.toLowerCase()} items`;
    const subject  = `Action needed: ${items.length} ${catLabel}${projectName ? ` for ${projectName}` : ''}`;
    const bodyLines: string[] = [];
    bodyLines.push(`Hi,`);
    bodyLines.push(``);
    bodyLines.push(`We have ${items.length} outstanding ${catLabel} blocking strategy execution${projectName ? ` for ${projectName}` : ''}. Could you help us resolve these:`);
    bodyLines.push(``);
    items.forEach((item, i) => {
      bodyLines.push(`${i + 1}. [${CATEGORY_META[item.req_category].label}] ${item.req_label}`);
      bodyLines.push(`   For: ${item.card_title}`);
      if (item.strategy_label) bodyLines.push(`   Strategy: ${item.strategy_label}`);
      if (item.age_days > 0)   bodyLines.push(`   Open ${item.age_days} day${item.age_days === 1 ? '' : 's'}`);
      bodyLines.push(``);
    });
    bodyLines.push(`Thanks!`);
    const body = encodeURIComponent(bodyLines.join('\n'));
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${body}`;
  };

  return (
    <div className="rounded-2xl border border-pink-500/20 bg-gradient-to-br from-pink-500/[0.06] via-card/40 to-cyan-500/[0.04] mb-4 overflow-hidden">
      {/* Header */}
      <div onClick={() => setExpanded(!expanded)}
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-pink-500/[0.04] border-b border-pink-500/10">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-pink-400" />
          <div>
            <div className="text-sm font-bold text-foreground">Strategy Dependencies Hub</div>
            <div className="text-[10px] text-muted-foreground">Every dep blocking execution · check off · request from client · age-aware</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          {stats && stats.unresolved > 0 && (
            <span className="font-bold text-amber-400">{stats.unresolved} unresolved</span>
          )}
          {stats && stats.very_aged > 0 && (
            <span className="font-bold text-red-400">{stats.very_aged} 🔥</span>
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
              <button onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Stats strip */}
          {stats && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <StatTile label="Total"        value={stats.total_dependencies} sub={`${stats.unique_cards} cards`} color="text-foreground" />
              <StatTile label="Resolved"     value={stats.resolved}           sub={stats.total_dependencies > 0 ? `${Math.round((stats.resolved / stats.total_dependencies) * 100)}% done` : '—'} color="text-emerald-400" />
              <StatTile label="Unresolved"   value={stats.unresolved}         sub="awaiting action" color="text-amber-400" />
              <StatTile label="Aging > 7d"   value={stats.aging_warnings}     sub="check in" color="text-amber-400" />
              <StatTile label="Aging > 14d"  value={stats.very_aged}          sub="escalate" color="text-red-400" />
            </div>
          )}

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Filter className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Status:</span>
            </div>
            {(["unresolved","resolved","all"] as const).map((s) => (
              <button key={s}
                onClick={() => setFilterStatus(s)}
                className={`text-[10px] px-2 py-1 rounded-md border ${
                  filterStatus === s ? 'bg-pink-500/15 text-pink-400 border-pink-500/40' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >{s}</button>
            ))}
            <span className="mx-1.5 text-muted-foreground/30">|</span>
            <button onClick={() => setFilterCategory("all")}
              className={`text-[10px] px-2 py-1 rounded-md border ${
                filterCategory === "all" ? 'bg-pink-500/15 text-pink-400 border-pink-500/40' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >All categories</button>
            {(Object.keys(CATEGORY_META) as DependencyCategoryClient[]).map((c) => (
              <button key={c}
                onClick={() => setFilterCategory(c)}
                className={`text-[10px] px-2 py-1 rounded-md border flex items-center gap-1 ${
                  filterCategory === c ? `${CATEGORY_META[c].tone} ${CATEGORY_META[c].color}` : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >{CATEGORY_META[c].label}</button>
            ))}
            <div className="flex-1" />
            <div className="text-[10px] text-muted-foreground">Group:</div>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}
              className="text-[10px] px-2 py-1 rounded-md border border-border bg-background/60 focus:outline-none focus:border-pink-500/40">
              <option value="category">Category</option>
              <option value="strategy">Strategy</option>
              <option value="card">Card</option>
            </select>
            <button onClick={() => load(true)} disabled={refreshing}
              className="text-[10px] px-2 py-1 rounded-md border border-border hover:bg-muted/40 flex items-center gap-1 disabled:opacity-50">
              <RefreshCw className={`h-2.5 w-2.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Bulk compose buttons */}
          {stats && stats.unresolved > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-pink-500/20 bg-pink-500/[0.04]">
              <span className="text-[10px] uppercase tracking-wider font-bold text-pink-400 mr-2">
                <Send className="h-2.5 w-2.5 inline mr-1" /> Bulk client email:
              </span>
              {stats.by_category.access.unresolved > 0 && (
                <button onClick={() => composeClientEmail("access")}
                  className="text-[10px] px-2 py-1 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 flex items-center gap-1">
                  <Mail className="h-2.5 w-2.5" />Request {stats.by_category.access.unresolved} access items
                </button>
              )}
              {stats.by_category.content.unresolved > 0 && (
                <button onClick={() => composeClientEmail("content")}
                  className="text-[10px] px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 flex items-center gap-1">
                  <Mail className="h-2.5 w-2.5" />Request {stats.by_category.content.unresolved} content items
                </button>
              )}
              {stats.by_category.info.unresolved > 0 && (
                <button onClick={() => composeClientEmail("info")}
                  className="text-[10px] px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 flex items-center gap-1">
                  <Mail className="h-2.5 w-2.5" />Request {stats.by_category.info.unresolved} info items
                </button>
              )}
              {stats.by_category.approval.unresolved > 0 && (
                <button onClick={() => composeClientEmail("approval")}
                  className="text-[10px] px-2 py-1 rounded-md bg-violet-500/15 text-violet-400 border border-violet-500/30 hover:bg-violet-500/25 flex items-center gap-1">
                  <Mail className="h-2.5 w-2.5" />Get {stats.by_category.approval.unresolved} approvals
                </button>
              )}
              <button onClick={() => composeClientEmail("all_unresolved")}
                className="text-[10px] px-2 py-1 rounded-md bg-pink-500/20 text-pink-400 border border-pink-500/40 hover:bg-pink-500/30 flex items-center gap-1 font-bold ml-auto">
                <Mail className="h-2.5 w-2.5" />Email ALL {stats.unresolved} items
              </button>
            </div>
          )}

          {/* Body */}
          {loading ? (
            <div className="text-center py-8 text-xs text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="h-3 w-3 animate-spin" /> Loading dependencies…
            </div>
          ) : deps.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles className="h-5 w-5 mx-auto mb-2 text-emerald-400/60" />
              <div className="text-sm font-semibold text-foreground">
                {filterStatus === "unresolved" ? "No unresolved dependencies — execution unblocked." : "No dependencies match this filter."}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {filterStatus === "unresolved" && stats && stats.resolved > 0
                  ? `${stats.resolved} dependencies have been resolved.`
                  : 'Push a scenario to PM (with deps) to populate this hub.'}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {grouped.map(([key, items]) => (
                <DepGroup key={key} groupKey={key} groupBy={groupBy} items={items} onToggle={handleToggle} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Stat tile ─────────────────────────────────────────────── */

function StatTile({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-2.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-[9px] text-muted-foreground">{sub}</div>
    </div>
  );
}

/* ─── Group container ───────────────────────────────────────── */

function DepGroup({ groupKey, groupBy, items, onToggle }: {
  groupKey: string;
  groupBy: "category" | "strategy" | "card";
  items: DependencyFlatRowClient[];
  onToggle: (row: DependencyFlatRowClient) => void;
}) {
  const [open, setOpen] = useState(true);
  const unresolvedCount = items.filter(i => !i.req_met).length;

  let headerLabel: string;
  let headerIcon: any = Layers;
  let toneClass = 'border-border';

  if (groupBy === "category") {
    const meta = CATEGORY_META[groupKey as DependencyCategoryClient];
    headerLabel = meta?.label || groupKey;
    headerIcon  = meta?.icon || Layers;
    toneClass   = meta?.tone || 'border-border';
  } else if (groupBy === "card") {
    headerLabel = (groupKey.split('::')[1] || groupKey).slice(0, 80);
  } else {
    headerLabel = groupKey;
  }

  return (
    <div className={`rounded-xl border ${toneClass} overflow-hidden`}>
      <div onClick={() => setOpen(!open)} className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-muted/10">
        <div className="flex items-center gap-2">
          {(() => { const Icon = headerIcon; return <Icon className="h-3.5 w-3.5" />; })()}
          <span className="text-[12px] font-bold text-foreground">{headerLabel}</span>
          <span className="text-[10px] text-muted-foreground">
            {unresolvedCount > 0 ? `${unresolvedCount} unresolved` : 'all resolved'} · {items.length} total
          </span>
        </div>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      {open && (
        <div className="px-3 pb-2 pt-1 space-y-1">
          {items.map((row) => <DepRow key={`${row.card_id}-${row.req_id}`} row={row} groupBy={groupBy} onToggle={onToggle} />)}
        </div>
      )}
    </div>
  );
}

/* ─── Single dependency row ─────────────────────────────────── */

function DepRow({
  row, groupBy, onToggle,
}: { row: DependencyFlatRowClient; groupBy: string; onToggle: (row: DependencyFlatRowClient) => void }) {
  const catMeta = CATEGORY_META[row.req_category];
  const ageMeta = AGE_META[row.age_bucket];

  return (
    <div className={`rounded-md border border-border bg-background/40 px-2.5 py-1.5 flex items-center gap-2 ${row.req_met ? 'opacity-60' : ''}`}>
      <input
        type="checkbox"
        checked={row.req_met}
        onChange={() => onToggle(row)}
        className="rounded border-border shrink-0"
        title={row.req_met ? "Mark unresolved" : "Mark resolved"}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {groupBy !== "category" && (
            <span className={`text-[9px] px-1 py-0.5 rounded ${catMeta.tone} ${catMeta.color}`}>
              <catMeta.icon className="h-2.5 w-2.5 inline mr-0.5" />
              {catMeta.label}
            </span>
          )}
          <span className={`text-[11px] font-semibold text-foreground ${row.req_met ? 'line-through' : ''}`}>{row.req_label}</span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5 flex-wrap">
          {groupBy !== "card" && (
            <span className="truncate max-w-xs">on: <span className="text-foreground/80">{row.card_title}</span></span>
          )}
          {groupBy !== "strategy" && row.strategic_link && (
            <span className="truncate max-w-xs">· {row.strategy_label}</span>
          )}
          {row.card_assigned_to && (
            <span>· assignee: {row.card_assigned_to}</span>
          )}
        </div>
      </div>
      <div className={`text-[9px] flex items-center gap-1 ${ageMeta.color}`} title={`Card created ${new Date(row.card_created_at).toLocaleDateString()}`}>
        <ageMeta.icon className="h-2.5 w-2.5" />
        {row.age_days}d
      </div>
      <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
        row.card_status === 'done' ? 'text-emerald-400 bg-emerald-500/15' :
        row.card_status === 'in_progress' ? 'text-blue-400 bg-blue-500/15' :
        'text-muted-foreground bg-muted/30'
      }`}>{row.card_status.replace('_',' ')}</span>
    </div>
  );
}
