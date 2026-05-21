/* ════════════════════════════════════════════════════════════════
   src/components/pm/ResolutionStoreHelpers.tsx
   Phase 5 — Shared patterns across the 4 store panels.

   The 4 store panels (AccessVault, ContentLibrary, InfoRepository,
   ApprovalsLog) share common UX: header with stats, item rows with
   status badge, suggestion chips, delete confirmation. We extract
   them here so the panels themselves stay focused on store-specific
   fields.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import {
  Plus, X, Trash2, CheckCircle2, AlertCircle, Clock, ChevronDown,
  ChevronRight, Sparkles, RefreshCw, Save, ExternalLink, Filter,
} from 'lucide-react';

/* ─── StorePanelShell ───────────────────────────────────────── */

export function StorePanelShell({
  title, icon: Icon, accentClass, stats, onAddNew, isAdding,
  searchValue, onSearchChange, statusFilter, onStatusFilterChange,
  statusOptions, suggestionChips, onSuggestionClick, children, onRefresh, refreshing,
}: {
  title: string;
  icon: any;
  accentClass: string;
  stats: { total: number; resolved: number; unresolved: number };
  onAddNew: () => void;
  isAdding: boolean;
  searchValue: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  statusOptions: Array<{ value: string; label: string }>;
  suggestionChips?: Array<{ label: string; used_by_actions: string[] }>;
  onSuggestionClick?: (label: string) => void;
  children: React.ReactNode;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Total"      value={stats.total}      color="text-foreground" />
        <StatTile label="Resolved"   value={stats.resolved}   color="text-emerald-400" />
        <StatTile label="Unresolved" value={stats.unresolved} color="text-amber-400" />
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)}
            className="text-[10px] px-2 py-1 rounded-md border border-border bg-background/60 focus:outline-none">
            <option value="">All statuses</option>
            {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search label…"
          className="text-[10px] px-2 py-1 rounded-md border border-border bg-background/60 focus:outline-none focus:border-cyan-500/40 w-40"
        />
        <div className="flex-1" />
        <button onClick={onRefresh} disabled={refreshing}
          className="text-[10px] px-2 py-1 rounded-md border border-border hover:bg-muted/40 flex items-center gap-1 disabled:opacity-50">
          <RefreshCw className={`h-2.5 w-2.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button onClick={onAddNew} disabled={isAdding}
          className={`text-[11px] px-2.5 py-1 rounded-md font-bold flex items-center gap-1 ${accentClass}`}>
          <Plus className="h-3 w-3" />
          Add item
        </button>
      </div>

      {/* Suggestions */}
      {suggestionChips && suggestionChips.length > 0 && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.04] p-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-violet-400 mb-1.5">
            <Sparkles className="h-3 w-3" />
            Suggested labels (action library knows these are needed by your strategy cards)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestionChips.map((s, i) => (
              <button key={i} onClick={() => onSuggestionClick?.(s.label)}
                className="text-[10px] px-2 py-0.5 rounded-md border border-violet-500/30 text-violet-400 bg-violet-500/[0.05] hover:bg-violet-500/15"
                title={`Used by: ${s.used_by_actions.join(', ')}`}>
                + {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Body — provided by the specific store panel */}
      {children}
    </div>
  );
}

function StatTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

/* ─── Status badge ──────────────────────────────────────────── */

const STATUS_STYLES: Record<string, string> = {
  /* access */
  held:      'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  requested: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  expired:   'text-red-400 bg-red-500/15 border-red-500/30',
  revoked:   'text-muted-foreground bg-muted/30 border-border',
  /* content */
  drafting:  'text-blue-400 bg-blue-500/15 border-blue-500/30',
  in_review: 'text-violet-400 bg-violet-500/15 border-violet-500/30',
  delivered: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  rejected:  'text-red-400 bg-red-500/15 border-red-500/30',
  /* info */
  needed:    'text-amber-400 bg-amber-500/15 border-amber-500/30',
  gathered:  'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  stale:     'text-orange-400 bg-orange-500/15 border-orange-500/30',
  /* approval */
  pending:   'text-amber-400 bg-amber-500/15 border-amber-500/30',
  approved:  'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] || 'text-muted-foreground bg-muted/30 border-border';
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold border ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/* ─── Resolved-state icon ───────────────────────────────────── */

export function ResolvedIcon({ resolved }: { resolved: boolean }) {
  return resolved
    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
    : <AlertCircle className="h-3.5 w-3.5 text-amber-400" />;
}

/* ─── Form field ────────────────────────────────────────────── */

export function FormField({
  label, type = "text", value, onChange, options, placeholder, required, span = 1,
}: {
  label: string;
  type?: "text" | "date" | "url" | "select" | "textarea" | "email";
  value: any;
  onChange: (v: any) => void;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  required?: boolean;
  span?: 1 | 2;
}) {
  const cls = "w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background/60 focus:outline-none focus:border-cyan-500/40 mt-0.5";
  return (
    <div className={span === 2 ? "sm:col-span-2" : ""}>
      <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {type === "select" ? (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">— select —</option>
          {(options || []).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea value={value || ''} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} rows={3}
          className={cls + " resize-y"}/>
      ) : (
        <input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} className={cls}/>
      )}
    </div>
  );
}
