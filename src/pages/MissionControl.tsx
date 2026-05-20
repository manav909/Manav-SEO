/* ════════════════════════════════════════════════════════════════
   src/pages/MissionControl.tsx
   Portfolio dashboard for a senior PM running 5-20 client projects.

   Triage-first design — surfaces what needs attention today before
   anything else. Two questions, every morning:
     1. What's on fire?
     2. What's healthy?

   Three sections:
     • Portfolio totals (capacity / workload at a glance)
     • Attention required (projects sorted by severity)
     • Full portfolio table (all projects, sortable, drill-in)

   Drill-in: clicking a project sets it as the selected project (via
   ProjectContext) and navigates to /pm so the PM lands on the board.
═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import * as pmApi from '@/components/pm/api';
import type { McSummary, McProjectRow } from '@/components/pm/api';
import {
  AlertTriangle, AlertCircle, Bell, Inbox, Loader2, RefreshCw, ArrowRight,
  Activity, Ship, Clock, CheckCircle2, XCircle, Sparkles, ArrowUpDown, Filter,
} from 'lucide-react';

type SortKey = 'attention' | 'name' | 'in_progress' | 'shipped' | 'alerts' | 'audit_score' | 'last_activity';
type SortDir = 'asc' | 'desc';

export default function MissionControl() {
  const navigate = useNavigate();
  const { setSelectedProjectId } = useProject();
  const [summary, setSummary] = useState<McSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('attention');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter]   = useState<'all' | 'attention' | 'healthy'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { summary, error } = await pmApi.missionControlSummary();
    setLoading(false);
    if (error) { setError(error); return; }
    if (summary) setSummary(summary);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* drill into a project's PM page */
  const open = (row: McProjectRow) => {
    setSelectedProjectId(row.id);
    navigate('/pm');
  };

  /* sorting + filtering */
  const sortedProjects = useMemo(() => {
    if (!summary) return [];
    let rows = [...summary.projects];

    if (filter === 'attention') rows = rows.filter((r) => r.attention.severity !== 'calm');
    if (filter === 'healthy')   rows = rows.filter((r) => r.attention.severity === 'calm');

    const cmp = (a: McProjectRow, b: McProjectRow): number => {
      switch (sortKey) {
        case 'attention':    return a.attention.score - b.attention.score;
        case 'name':         return (a.client_name || a.name).localeCompare(b.client_name || b.name);
        case 'in_progress':  return a.counts.in_progress - b.counts.in_progress;
        case 'shipped':      return a.counts.shipped_this_month - b.counts.shipped_this_month;
        case 'alerts':       return a.counts.open_alerts - b.counts.open_alerts;
        case 'audit_score':  return (a.audit_score ?? -1) - (b.audit_score ?? -1);
        case 'last_activity': {
          const ta = a.last_activity ? new Date(a.last_activity).getTime() : 0;
          const tb = b.last_activity ? new Date(b.last_activity).getTime() : 0;
          return ta - tb;
        }
        default: return 0;
      }
    };
    rows.sort(cmp);
    if (sortDir === 'desc') rows.reverse();
    return rows;
  }, [summary, sortKey, sortDir, filter]);

  const setSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">

        {/* ── header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Mission Control
              {summary?.totals?.critical_alerts ? (
                <span className="text-xs px-2 py-1 rounded-full bg-red-500/15 text-red-400 font-semibold animate-pulse">
                  {summary.totals.critical_alerts} CRITICAL
                </span>
              ) : null}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Portfolio view of every active project. Triage-first — what needs eyes today.
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted flex items-center gap-1.5 disabled:opacity-50">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && !summary && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Aggregating portfolio…</p>
          </div>
        )}

        {summary && summary.totals.projects === 0 && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">No active projects yet.</p>
          </div>
        )}

        {summary && summary.totals.projects > 0 && (
          <>
            {/* ── PORTFOLIO TOTALS ── */}
            <PortfolioTotals totals={summary.totals} />

            {/* ── ATTENTION REQUIRED ── */}
            {summary.attention.length > 0 && (
              <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.03] p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    Attention required
                    <span className="text-xs text-muted-foreground">({summary.attention.length})</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {summary.attention.map((row) => (
                    <AttentionCard key={row.id} row={row} onOpen={() => open(row)} />
                  ))}
                </div>
              </section>
            )}

            {/* ── PORTFOLIO TABLE ── */}
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="text-sm font-semibold">Portfolio</div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <Filter className="h-3 w-3 text-muted-foreground" />
                  {(['all', 'attention', 'healthy'] as const).map((f) => (
                    <button key={f} onClick={() => setFilter(f)}
                      className={`px-2 py-1 rounded font-semibold uppercase tracking-wider ${
                        filter === f ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                      }`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <PortfolioTable rows={sortedProjects} onOpen={open}
                sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
            </section>

            <div className="text-[10px] text-muted-foreground/60 text-right">
              Generated {summary.generated_at ? new Date(summary.generated_at).toLocaleString('en-GB') : ''}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── totals strip ─────────────────────────────────────────── */

function PortfolioTotals({ totals }: { totals: McSummary['totals'] }) {
  const tiles = [
    { label: 'Active projects',        value: totals.projects,                  icon: Sparkles, tone: 'neutral' },
    { label: 'Need attention',         value: totals.projects_needing_attention, icon: AlertCircle, tone: totals.projects_needing_attention > 0 ? 'warn' : 'calm' },
    { label: 'Cards in progress',      value: totals.cards_in_progress,         icon: Activity, tone: 'neutral' },
    { label: 'Blocked cards',          value: totals.cards_blocked,             icon: XCircle, tone: totals.cards_blocked > 0 ? 'warn' : 'calm' },
    { label: 'Shipped this month',     value: totals.shipped_this_month,        icon: Ship,    tone: 'good' },
    { label: 'Ripe for measurement',   value: totals.ripe_unmeasured,           icon: Clock,   tone: totals.ripe_unmeasured > 0 ? 'info' : 'calm' },
    { label: 'Open alerts',            value: totals.open_alerts,               icon: Bell,    tone: totals.open_alerts > 0 ? (totals.critical_alerts > 0 ? 'critical' : 'warn') : 'calm' },
    { label: 'Pending suggestions',    value: totals.pending_suggestions,       icon: Inbox,   tone: totals.pending_suggestions > 0 ? 'info' : 'calm' },
  ];
  const toneClass = (tone: string) => {
    switch (tone) {
      case 'critical': return 'border-red-500/40 bg-red-500/5';
      case 'warn':     return 'border-amber-500/40 bg-amber-500/5';
      case 'info':     return 'border-blue-500/30 bg-blue-500/5';
      case 'good':     return 'border-green-500/30 bg-green-500/5';
      default:         return 'border-border bg-background/40';
    }
  };
  const valueTone = (tone: string) => {
    switch (tone) {
      case 'critical': return 'text-red-400';
      case 'warn':     return 'text-amber-400';
      case 'info':     return 'text-blue-400';
      case 'good':     return 'text-green-400';
      default:         return 'text-foreground';
    }
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className={`rounded-xl border ${toneClass(t.tone)} p-3`}>
          <div className="flex items-center gap-1.5 mb-1">
            <t.icon className="h-3 w-3 text-muted-foreground" />
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.label}</div>
          </div>
          <div className={`text-xl font-bold font-mono ${valueTone(t.tone)}`}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ── attention card ──────────────────────────────────────── */

function AttentionCard({ row, onOpen }: { row: McProjectRow; onOpen: () => void }) {
  const sevTone = row.attention.severity === 'critical' ? 'border-red-500/40 bg-red-500/[0.04]'
                : row.attention.severity === 'warn'     ? 'border-amber-500/40 bg-amber-500/[0.04]'
                :                                          'border-blue-500/30 bg-blue-500/[0.03]';
  const sevIcon = row.attention.severity === 'critical' ? <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                : row.attention.severity === 'warn'     ? <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                :                                          <Bell className="h-3.5 w-3.5 text-blue-400" />;
  return (
    <div className={`rounded-xl border ${sevTone} p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {sevIcon}
            <div className="text-sm font-semibold">{row.client_name || row.name}</div>
            {row.industry && <span className="text-[10px] text-muted-foreground">· {row.industry}</span>}
          </div>
          {row.primary_goal && (
            <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{row.primary_goal}</div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {row.attention.flags.map((f, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-background/60 border border-border text-foreground/85">
                {f}
              </span>
            ))}
          </div>
        </div>
        <button onClick={onOpen}
          className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 flex items-center gap-1 shrink-0">
          Open
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/* ── portfolio table ─────────────────────────────────────── */

function PortfolioTable({ rows, onOpen, sortKey, sortDir, onSort }: {
  rows: McProjectRow[]; onOpen: (row: McProjectRow) => void;
  sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  if (!rows.length) {
    return <div className="text-sm text-muted-foreground py-6 text-center">No projects in this filter.</div>;
  }
  const Header = ({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'right' | 'center' }) => (
    <button onClick={() => onSort(k)}
      className={`px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 ${
        align === 'right' ? 'ml-auto' : align === 'center' ? 'mx-auto' : ''
      }`}>
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? 'text-primary' : 'opacity-30'}`} />
    </button>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left"><Header k="name" label="Project" /></th>
            <th className="text-left">
              <span className="px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Goal</span>
            </th>
            <th className="text-center"><Header k="in_progress" label="In Progress" align="center" /></th>
            <th className="text-center"><Header k="shipped" label="Shipped (mo)" align="center" /></th>
            <th className="text-center"><Header k="audit_score" label="Audit" align="center" /></th>
            <th className="text-center">
              <span className="px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">GSC · GA4</span>
            </th>
            <th className="text-center"><Header k="alerts" label="Alerts" align="center" /></th>
            <th className="text-center">
              <span className="px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Suggest</span>
            </th>
            <th className="text-right"><Header k="last_activity" label="Last Activity" align="right" /></th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/40 hover:bg-muted/30 group">
              <td className="px-2 py-2">
                <button onClick={() => onOpen(row)} className="text-left">
                  <div className="text-sm font-semibold group-hover:text-primary">{row.client_name || row.name}</div>
                  {row.industry && <div className="text-[10px] text-muted-foreground">{row.industry}</div>}
                </button>
              </td>
              <td className="px-2 py-2">
                <div className="text-xs text-foreground/85 line-clamp-1 max-w-md">{row.primary_goal || '—'}</div>
              </td>
              <td className="px-2 py-2 text-center font-mono text-sm">
                {row.counts.in_progress}
                {row.counts.blocked > 0 && (
                  <span className="ml-1 text-[10px] text-amber-400">({row.counts.blocked} blocked)</span>
                )}
              </td>
              <td className="px-2 py-2 text-center font-mono text-sm">
                {row.counts.shipped_this_month}
                {row.counts.ripe_unmeasured > 0 && (
                  <span className="ml-1 text-[10px] text-blue-400">({row.counts.ripe_unmeasured} ripe)</span>
                )}
              </td>
              <td className="px-2 py-2 text-center">
                {row.audit_score != null ? (
                  <span className={`text-sm font-mono font-semibold ${
                    row.audit_score >= 80 ? 'text-green-400' :
                    row.audit_score >= 60 ? 'text-amber-400' :
                                            'text-red-400'
                  }`}>{row.audit_score}</span>
                ) : <span className="text-[10px] text-muted-foreground">—</span>}
              </td>
              <td className="px-2 py-2 text-center">
                <IntegrationDot label="G" state={row.integrations.gsc.state} />
                <span className="mx-1 text-[10px] text-muted-foreground">·</span>
                <IntegrationDot label="A" state={row.integrations.ga4.state} />
              </td>
              <td className="px-2 py-2 text-center">
                {row.counts.open_alerts > 0 ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    row.counts.critical_alerts > 0
                      ? 'bg-red-500/15 text-red-400'
                      : 'bg-amber-500/15 text-amber-400'
                  }`}>
                    {row.counts.open_alerts}{row.counts.critical_alerts > 0 ? ' · ' + row.counts.critical_alerts + 'C' : ''}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground/60">—</span>
                )}
              </td>
              <td className="px-2 py-2 text-center font-mono text-sm">
                {row.counts.pending_suggestions > 0 ? (
                  <span className="text-blue-400 font-semibold">{row.counts.pending_suggestions}</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground/60">—</span>
                )}
              </td>
              <td className="px-2 py-2 text-right text-[11px] text-muted-foreground">
                {row.last_activity ? new Date(row.last_activity).toLocaleDateString('en-GB') : '—'}
              </td>
              <td className="px-2 py-2 text-right">
                <button onClick={() => onOpen(row)}
                  className="text-[10px] px-2 py-1 rounded-lg text-primary hover:bg-primary/5 font-semibold flex items-center gap-1 ml-auto">
                  Open
                  <ArrowRight className="h-3 w-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IntegrationDot({ label, state }: { label: string; state: 'live' | 'stale' | 'not_connected' }) {
  const tone = state === 'live'  ? 'bg-green-500/20 text-green-400 border-green-500/30' :
               state === 'stale' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                    'bg-muted text-muted-foreground/60 border-border';
  const title = state === 'live' ? `${label === 'G' ? 'GSC' : 'GA4'} live (pulled within 3 days)`
              : state === 'stale' ? `${label === 'G' ? 'GSC' : 'GA4'} stale (refresh recommended)`
              : `${label === 'G' ? 'GSC' : 'GA4'} not connected`;
  return (
    <span title={title}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border ${tone}`}>
      {label}
    </span>
  );
}
