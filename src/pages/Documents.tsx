/* ════════════════════════════════════════════════════════════════════════════
   src/pages/Documents.tsx — Phase D3 (2026-05-25)

   The senior PM's working surface for artifacts portfolio management.

   What this is:
     Three-pane layout — Filters sidebar | Artifact list (with KPIs + search) |
     Detail pane. Built for managing 30+ projects at once: scan portfolio
     activity, drill into "what needs me right now", retrieve any historical
     artifact via full-text search.

   What this is NOT:
     - Not a report builder. Artifacts are produced by pipelines/audits;
       this page surfaces them. No manual authoring.
     - Not a folder hierarchy. Filters + search + smart defaults scale better
       at portfolio size than folders.
     - Not a rich editor. Editing happens via refresh-from-audit; this page
       shows what was generated.
     - Not a replacement for ClientPortal/ClientCampaignReport — those are
       client-facing curated views. This is the PM's internal surface.

   Architecture:
     - Bound to 8 endpoints in api/lib/artifacts-routes.ts (Phase D2)
     - State: filters → list, selection → detail. Both fetch independently.
     - URL synced: ?artifact=<id> deep-links to a specific artifact
     - Default view "what needs me right now": unreviewed, current, oldest-first
     - Search and filter combine (search box adds a q param; filters always apply)
═════════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PortalNav from '@/components/PortalNav';
import AnimatedBg from '@/components/AnimatedBg';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import {
  artifactsList,
  artifactsGet,
  artifactsSearch,
  artifactsMarkReviewed,
  artifactsMarkSent,
  artifactsPortfolioKpis,
  type ArtifactSummary,
  type ArtifactDetail,
  type ArtifactListFilters,
  type PortfolioKpis,
} from '@/components/pm/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import ArtifactMarkdown from '@/components/pm/ArtifactMarkdown';
import {
  FileText, Search, Filter, ChevronDown, ChevronRight, X,
  CheckCircle2, Send, Clock, RefreshCw, AlertTriangle, History,
  ExternalLink, Calendar, DollarSign, Eye, Sparkles, Loader2,
  Inbox, Archive, Zap, Target, Layers, Copy,
} from 'lucide-react';

/* ─── Shared types ────────────────────────────────────────────────────────── */

type SortMode = 'newest' | 'oldest' | 'most_expensive';
type StatusMode = 'current' | 'superseded' | 'archived';

const ARTIFACT_KIND_LABELS: Record<string, { label: string; color: string }> = {
  brief:                  { label: 'Content Brief',       color: '#a78bfa' },
  content_brief:          { label: 'Content Brief',       color: '#a78bfa' },
  forecast:               { label: 'Forecast',            color: '#34d399' },
  client_update:          { label: 'Client Update',       color: '#60a5fa' },
  internal_handover:      { label: 'Internal Handover',   color: '#fbbf24' },
  internal_doc:           { label: 'Internal Doc',        color: '#fbbf24' },
  handover:               { label: 'Handover',            color: '#fbbf24' },
  strategy_plan:          { label: 'Strategy Plan',       color: '#f472b6' },
  strategy:               { label: 'Strategy',            color: '#f472b6' },
  competitor_snapshot:    { label: 'Competitor Snapshot', color: '#fb923c' },
  competitor_intel:       { label: 'Competitor Intel',    color: '#fb923c' },
  keyword_research:       { label: 'Keyword Research',    color: '#22d3ee' },
  gsc_baseline:           { label: 'GSC Baseline',        color: '#22d3ee' },
  gsc_context:            { label: 'GSC Context',         color: '#22d3ee' },
  audit_report:           { label: 'Audit Report',        color: '#ef4444' },
  forecast_emission:      { label: 'Forecast',            color: '#34d399' },
  unknown:                { label: 'Unknown',             color: '#94a3b8' },
};

function kindMeta(kind: string): { label: string; color: string } {
  return ARTIFACT_KIND_LABELS[kind] || { label: kind.replace(/_/g, ' '), color: '#94a3b8' };
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

/* ─── KPI strip ──────────────────────────────────────────────────────────── */

function KpiStrip({ kpis, loading }: { kpis: PortfolioKpis | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex gap-3 px-4 py-3 border-b border-border/40 bg-background/40">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="flex-1 min-w-0 animate-pulse">
            <div className="h-3 bg-muted/40 rounded w-20 mb-2"></div>
            <div className="h-6 bg-muted/40 rounded w-16"></div>
          </div>
        ))}
      </div>
    );
  }
  if (!kpis) return null;

  const items = [
    { label: 'This week',     value: kpis.artifacts_this_week.toString(),     icon: Calendar,    color: '#a78bfa' },
    { label: 'This month',    value: kpis.artifacts_this_month.toString(),    icon: Layers,      color: '#60a5fa' },
    { label: 'LLM spend MTD', value: fmtUsd(kpis.llm_spend_mtd_usd),          icon: DollarSign,  color: '#34d399' },
    {
      label: 'Awaiting review',
      value: kpis.awaiting_review_count.toString(),
      icon: Eye,
      color: kpis.awaiting_review_count > 0 ? '#fbbf24' : '#94a3b8',
    },
    {
      label: 'Oldest unreviewed',
      value: kpis.awaiting_review_oldest_days === null ? '—' : `${kpis.awaiting_review_oldest_days}d`,
      icon: Clock,
      color: kpis.awaiting_review_oldest_days && kpis.awaiting_review_oldest_days > 7 ? '#ef4444' : '#94a3b8',
    },
    {
      label: 'Red audits 7d',
      value: kpis.red_severity_audits.toString(),
      icon: AlertTriangle,
      color: kpis.red_severity_audits > 0 ? '#ef4444' : '#94a3b8',
    },
  ];

  return (
    <div className="flex gap-1 px-4 py-2 border-b border-border/40 bg-background/40">
      {items.map(item => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="flex-1 min-w-0 px-3 py-1.5 rounded-md hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
              <Icon className="h-3 w-3" style={{ color: item.color }} />
              <span className="truncate">{item.label}</span>
            </div>
            <div className="text-lg font-bold tabular-nums" style={{ color: item.color }}>
              {item.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Filters sidebar ────────────────────────────────────────────────────── */

interface FiltersState {
  projectIds:     string[];
  campaignIds:    string[];   /* Phase D4 — URL-driven only; not surfaced in sidebar yet */
  artifactKinds:  string[];
  status:         StatusMode;
  pmReviewed:     boolean | null;   // null = any
  clientSent:     boolean | null;
  generatedAfter: string;
  generatedBefore: string;
  quickFilter:    'all' | 'needs_me' | 'recent_sent' | 'red_audits';
}

const DEFAULT_FILTERS: FiltersState = {
  projectIds:    [],
  campaignIds:   [],
  artifactKinds: [],
  status:        'current',
  pmReviewed:    null,
  clientSent:    null,
  generatedAfter: '',
  generatedBefore: '',
  quickFilter:   'all',
};

const ALL_KINDS = [
  'content_brief', 'brief', 'forecast', 'forecast_emission',
  'client_update', 'internal_handover', 'handover', 'internal_doc',
  'strategy_plan', 'strategy', 'competitor_snapshot', 'competitor_intel',
  'keyword_research', 'gsc_context', 'gsc_baseline', 'audit_report',
];

function FiltersSidebar({
  filters, setFilters, projects, campaigns, onReset,
}: {
  filters: FiltersState;
  setFilters: (f: FiltersState) => void;
  projects: Array<{ id: string; client_name?: string; brand_name?: string; company_name?: string }>;
  campaigns: Array<{ id: string; keyword: string; project_id?: string }>;
  onReset: () => void;
}) {
  const [openSections, setOpenSections] = useState({
    quick: true, projects: true, campaigns: true, kinds: true, status: true, workflow: true, date: false,
  });
  const toggle = (k: keyof typeof openSections) =>
    setOpenSections(s => ({ ...s, [k]: !s[k] }));

  const toggleArray = (arr: string[], value: string): string[] =>
    arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value];

  /* projects from useAuth() are rows from the `projects` table, NOT `clients`.
     The projects schema has `.name` (primary display field) and `.url`.
     Earlier versions used client-shaped fallbacks (brand_name/client_name/
     company_name) which never matched anything on project rows — producing
     the ugly "Project 4c4e49" id-slice labels.  Fix: prefer p.name, then
     extract URL host as a usable secondary, then id-slice as last resort. */
  const projectLabel = (p: any) => {
    if (p.name && String(p.name).trim()) return String(p.name).trim();
    if (p.url && typeof p.url === 'string') {
      try { return new URL(p.url).hostname.replace(/^www\./, ''); } catch { /* fall through */ }
    }
    /* Client-shaped fallbacks — kept in case projects ever gets joined with clients */
    if (p.brand_name)   return p.brand_name;
    if (p.client_name)  return p.client_name;
    if (p.company_name) return p.company_name;
    return `Project ${String(p.id).slice(0, 6)}`;
  };

  return (
    <aside className="w-64 shrink-0 border-r border-border/40 bg-background/30 overflow-y-auto">
      <div className="p-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Filters</span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onReset}>
          Reset
        </Button>
      </div>

      {/* Quick filters */}
      <Section title="Quick view" open={openSections.quick} onToggle={() => toggle('quick')}>
        <div className="space-y-1">
          {[
            { id: 'needs_me',    label: 'What needs me',    icon: Inbox },
            { id: 'all',         label: 'All current',      icon: Layers },
            { id: 'recent_sent', label: 'Recently sent',    icon: Send },
            { id: 'red_audits',  label: 'Red audits 7d',    icon: AlertTriangle },
          ].map(opt => {
            const Icon = opt.icon as any;
            const active = filters.quickFilter === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setFilters({ ...filters, quickFilter: opt.id as any })}
                className={`w-full text-left text-xs px-2 py-1.5 rounded-md flex items-center gap-2 transition-colors ${
                  active ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-muted/30 text-foreground/80'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Projects */}
      <Section title={`Projects${filters.projectIds.length ? ` (${filters.projectIds.length})` : ''}`}
               open={openSections.projects} onToggle={() => toggle('projects')}>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {projects.length === 0 && (
            <div className="text-xs text-muted-foreground italic px-2">No projects</div>
          )}
          {projects.map(p => {
            const checked = filters.projectIds.includes(p.id);
            return (
              <label key={p.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setFilters({ ...filters, projectIds: toggleArray(filters.projectIds, p.id) })}
                  className="h-3 w-3"
                />
                <span className="truncate flex-1">{projectLabel(p)}</span>
              </label>
            );
          })}
        </div>
      </Section>

      {/* Campaigns */}
      <Section title={`Campaigns${filters.campaignIds.length ? ` (${filters.campaignIds.length})` : ''}`}
               open={openSections.campaigns} onToggle={() => toggle('campaigns')}>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {campaigns.length === 0 && (
            <div className="text-xs text-muted-foreground italic px-2">No campaigns</div>
          )}
          {campaigns.map(c => {
            const checked = filters.campaignIds.includes(c.id);
            return (
              <label key={c.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setFilters({ ...filters, campaignIds: toggleArray(filters.campaignIds, c.id), quickFilter: 'all' })}
                  className="h-3 w-3"
                />
                <span className="truncate flex-1">{c.keyword}</span>
              </label>
            );
          })}
        </div>
      </Section>

      {/* Kinds */}
      <Section title={`Document type${filters.artifactKinds.length ? ` (${filters.artifactKinds.length})` : ''}`}
               open={openSections.kinds} onToggle={() => toggle('kinds')}>
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {ALL_KINDS.map(k => {
            const meta = kindMeta(k);
            const checked = filters.artifactKinds.includes(k);
            return (
              <label key={k} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setFilters({ ...filters, artifactKinds: toggleArray(filters.artifactKinds, k) })}
                  className="h-3 w-3"
                />
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }}></span>
                <span className="truncate flex-1">{meta.label}</span>
              </label>
            );
          })}
        </div>
      </Section>

      {/* Status */}
      <Section title="Status" open={openSections.status} onToggle={() => toggle('status')}>
        <div className="space-y-1">
          {(['current', 'superseded', 'archived'] as StatusMode[]).map(s => (
            <label key={s} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted/30 cursor-pointer">
              <input
                type="radio"
                name="status"
                checked={filters.status === s}
                onChange={() => setFilters({ ...filters, status: s })}
                className="h-3 w-3"
              />
              <span className="capitalize">{s}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* Workflow */}
      <Section title="Workflow" open={openSections.workflow} onToggle={() => toggle('workflow')}>
        <div className="space-y-2">
          <TriState
            label="PM reviewed"
            value={filters.pmReviewed}
            onChange={v => setFilters({ ...filters, pmReviewed: v })}
          />
          <TriState
            label="Sent to client"
            value={filters.clientSent}
            onChange={v => setFilters({ ...filters, clientSent: v })}
          />
        </div>
      </Section>

      {/* Date range */}
      <Section title="Date range" open={openSections.date} onToggle={() => toggle('date')}>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">After</label>
            <Input
              type="date"
              value={filters.generatedAfter}
              onChange={e => setFilters({ ...filters, generatedAfter: e.target.value })}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Before</label>
            <Input
              type="date"
              value={filters.generatedBefore}
              onChange={e => setFilters({ ...filters, generatedBefore: e.target.value })}
              className="h-7 text-xs"
            />
          </div>
        </div>
      </Section>
    </aside>
  );
}

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border-b border-border/40">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground hover:bg-muted/20 transition-colors"
      >
        <span>{title}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && <div className="p-2">{children}</div>}
    </div>
  );
}

function TriState({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div className="text-xs">
      <div className="text-foreground/80 mb-1">{label}</div>
      <div className="flex gap-1">
        {[
          { id: null,  label: 'Any' },
          { id: true,  label: 'Yes' },
          { id: false, label: 'No'  },
        ].map(opt => (
          <button
            key={String(opt.id)}
            onClick={() => onChange(opt.id as any)}
            className={`flex-1 px-2 py-1 rounded text-xs border transition-colors ${
              value === opt.id
                ? 'bg-primary/15 border-primary/40 text-primary font-medium'
                : 'border-border/40 hover:bg-muted/30'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Artifact list ──────────────────────────────────────────────────────── */

function ArtifactRow({
  artifact, selected, onClick, projectLabel,
}: {
  artifact: ArtifactSummary;
  selected: boolean;
  onClick: () => void;
  projectLabel: (id: string) => string;
}) {
  const meta = kindMeta(artifact.artifact_kind);
  const needsReview = !artifact.pm_reviewed && artifact.status === 'current';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b border-border/30 transition-colors block ${
        selected ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/20 border-l-2 border-l-transparent'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="shrink-0 mt-0.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} title={meta.label}></div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-xs font-semibold truncate flex-1">{artifact.title}</span>
            {needsReview && (
              <span className="text-[9px] uppercase tracking-wider text-amber-500 font-medium shrink-0">Review</span>
            )}
            {artifact.client_sent && (
              <Send className="h-3 w-3 text-emerald-500 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span style={{ color: meta.color }}>{meta.label}</span>
            <span>•</span>
            <span className="truncate">{projectLabel(artifact.project_id)}</span>
            {artifact.keyword && (
              <>
                <span>•</span>
                <span className="truncate">{artifact.keyword}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground/80">
            <span>{timeAgo(artifact.generated_at)}</span>
            {artifact.generation_cost_usd !== null && artifact.generation_cost_usd > 0 && (
              <>
                <span>•</span>
                <span>{fmtUsd(artifact.generation_cost_usd)}</span>
              </>
            )}
            {artifact.status !== 'current' && (
              <>
                <span>•</span>
                <span className="italic">{artifact.status}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ─── Detail pane ────────────────────────────────────────────────────────── */

function DetailPane({
  artifact, chain, loading, onMarkReviewed, onMarkSent, onClose, projectLabel,
}: {
  artifact: ArtifactDetail | null;
  chain: ArtifactSummary[];
  loading: boolean;
  onMarkReviewed: (reviewed: boolean) => void;
  onMarkSent: (sent: boolean) => void;
  onClose: () => void;
  projectLabel: (id: string) => string;
}) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground min-h-0 min-w-0">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading artifact…
      </div>
    );
  }
  if (!artifact) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 min-h-0 min-w-0">
        <FileText className="h-12 w-12 mb-3 opacity-30" />
        <div className="text-sm">Select an artifact to view its content</div>
        <div className="text-xs mt-1 opacity-70">Or use the search box to find something specific</div>
      </div>
    );
  }

  const meta = kindMeta(artifact.artifact_kind);
  const copyBody = () => {
    navigator.clipboard.writeText(artifact.body || '');
    toast({ title: 'Copied', description: 'Artifact body copied to clipboard' });
  };

  const chainHasOthers = chain && chain.length > 1;
  const myIndex = chain.findIndex(c => c.id === artifact.id);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/40 bg-background/30">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium"
                style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
              >
                {meta.label}
              </span>
              {artifact.status !== 'current' && (
                <Badge variant="outline" className="text-[10px] capitalize">{artifact.status}</Badge>
              )}
            </div>
            <h2 className="text-lg font-bold leading-tight mb-1" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{artifact.title}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{projectLabel(artifact.project_id)}</span>
              {artifact.keyword && (
                <>
                  <span>•</span>
                  <span className="font-medium">{artifact.keyword}</span>
                </>
              )}
              {artifact.target_url && (
                <>
                  <span>•</span>
                  <a href={artifact.target_url} target="_blank" rel="noopener noreferrer" className="hover:text-primary inline-flex items-center gap-1">
                    {(() => { try { return new URL(artifact.target_url!).pathname || artifact.target_url; } catch { return artifact.target_url; } })()}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
              <span>•</span>
              <span>{timeAgo(artifact.generated_at)}</span>
              {artifact.generation_cost_usd !== null && artifact.generation_cost_usd > 0 && (
                <>
                  <span>•</span>
                  <span>{fmtUsd(artifact.generation_cost_usd)}</span>
                </>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Workflow actions */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button
            variant={artifact.pm_reviewed ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onMarkReviewed(!artifact.pm_reviewed)}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            {artifact.pm_reviewed ? 'Reviewed' : 'Mark reviewed'}
            {artifact.pm_reviewed && artifact.pm_reviewed_at && (
              <span className="ml-1.5 opacity-70">({timeAgo(artifact.pm_reviewed_at)})</span>
            )}
          </Button>
          <Button
            variant={artifact.client_sent ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onMarkSent(!artifact.client_sent)}
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {artifact.client_sent ? 'Sent' : 'Mark sent'}
            {artifact.client_sent && artifact.client_sent_at && (
              <span className="ml-1.5 opacity-70">({timeAgo(artifact.client_sent_at)})</span>
            )}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={copyBody}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy body
          </Button>
          {chainHasOthers && (
            <Badge variant="outline" className="text-[10px]">
              <History className="h-3 w-3 mr-1" />
              Version {myIndex + 1} of {chain.length}
            </Badge>
          )}
        </div>
      </div>

      {/* Body — plain overflow-y-auto div, NOT Radix ScrollArea.
          ScrollArea wraps content in display:table which expands to content
          width, defeating word-break. A plain div with overflow-y:auto +
          overflow-x:hidden gives us full control. */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={{ minWidth: 0 }}>
        <div className="px-5 py-4" style={{ width: '100%', minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
          <ArtifactMarkdown body={artifact.body || '_No content_'} accent={meta.color} size="md" />

          {/* Supersession chain */}
          {chainHasOthers && (
            <>
              <Separator className="my-6" />
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                  <History className="h-3.5 w-3.5" />
                  Version history
                </div>
                <div className="space-y-1">
                  {chain.map((c, i) => {
                    const isMe = c.id === artifact.id;
                    return (
                      <div
                        key={c.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                          isMe ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/30'
                        }`}
                      >
                        <span className="text-muted-foreground tabular-nums w-12">v{i + 1}</span>
                        <span className="flex-1 truncate">{c.title}</span>
                        <span className="text-muted-foreground">{timeAgo(c.generated_at)}</span>
                        <Badge variant="outline" className="text-[9px] capitalize">{c.status}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Metadata */}
          {artifact.metadata && Object.keys(artifact.metadata).length > 0 && (
            <>
              <Separator className="my-6" />
              <details className="text-xs">
                <summary className="text-xs uppercase tracking-wider text-muted-foreground mb-2 cursor-pointer flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5" />
                  Metadata
                </summary>
                <pre className="mt-2 p-2 rounded bg-muted/30 text-[10px] overflow-x-auto">
                  {JSON.stringify(artifact.metadata, null, 2)}
                </pre>
              </details>
            </>
          )}

          {/* PM notes */}
          {artifact.pm_notes && (
            <>
              <Separator className="my-6" />
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">PM notes</div>
                <div className="text-xs whitespace-pre-wrap p-3 rounded bg-muted/30">{artifact.pm_notes}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function Documents({ embedded = false }: { embedded?: boolean }) {
  const { projects } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');

  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const PAGE_SIZE = 50;

  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactDetail | null>(null);
  const [selectedChain, setSelectedChain] = useState<ArtifactSummary[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [kpis, setKpis] = useState<PortfolioKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);

  const safeProjects = useMemo(() => (projects || []).filter((p: any) => p?.id), [projects]);

  /* Load all active campaigns across all projects for the sidebar filter */
  const [allCampaigns, setAllCampaigns] = useState<Array<{ id: string; keyword: string }>>([]);
  useEffect(() => {
    if (!safeProjects.length) return;
    let cancelled = false;
    (async () => {
      const { seoCampaignList } = await import('@/components/pm/api');
      const results = await Promise.all(
        safeProjects.map((p: any) => seoCampaignList({ projectId: p.id, statusFilter: 'active' }))
      );
      if (cancelled) return;
      const merged = results.flatMap((r: any) =>
        (r.campaigns || []).map((c: any) => ({ id: c.id, keyword: c.keyword }))
      );
      setAllCampaigns(merged);
    })();
    return () => { cancelled = true; };
  }, [safeProjects]);
  const projectLabel = useCallback((id: string) => {
    const p: any = safeProjects.find((p: any) => p.id === id);
    if (!p) return `Project ${String(id).slice(0, 6)}`;
    if (p.name && String(p.name).trim()) return String(p.name).trim();
    if (p.url && typeof p.url === 'string') {
      try { return new URL(p.url).hostname.replace(/^www\./, ''); } catch { /* fall through */ }
    }
    if (p.brand_name)   return p.brand_name;
    if (p.client_name)  return p.client_name;
    if (p.company_name) return p.company_name;
    return `Project ${String(id).slice(0, 6)}`;
  }, [safeProjects]);

  /* Convert filters → API filter shape, applying quick-filter presets */
  const buildApiFilters = useCallback((): ArtifactListFilters => {
    const base: ArtifactListFilters = {
      projectIds:      filters.projectIds.length    ? filters.projectIds    : undefined,
      campaignIds:     filters.campaignIds.length   ? filters.campaignIds   : undefined,
      artifactKinds:   filters.artifactKinds.length ? filters.artifactKinds : undefined,
      status:          filters.status,
      pmReviewed:      filters.pmReviewed === null ? undefined : filters.pmReviewed,
      clientSent:      filters.clientSent === null ? undefined : filters.clientSent,
      generatedAfter:  filters.generatedAfter || undefined,
      generatedBefore: filters.generatedBefore || undefined,
      sort,
      limit:           PAGE_SIZE,
      offset,
    };
    /* Apply quick-filter overrides */
    if (filters.quickFilter === 'needs_me') {
      base.pmReviewed = false;
      base.status     = 'current';
      base.sort       = 'oldest';
    } else if (filters.quickFilter === 'recent_sent') {
      base.clientSent = true;
      base.sort       = 'newest';
    } else if (filters.quickFilter === 'red_audits') {
      base.artifactKinds = ['audit_report'];
      base.generatedAfter = new Date(Date.now() - 7 * 86400000).toISOString();
      base.sort = 'newest';
    }
    return base;
  }, [filters, sort, offset]);

  /* Fetch list */
  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const apiFilters = buildApiFilters();
      const result = searchQuery.trim()
        ? await artifactsSearch({ q: searchQuery.trim(), ...apiFilters })
        : await artifactsList(apiFilters);
      if (result.error) {
        setListError(result.error);
        setArtifacts([]);
        setTotal(0);
      } else {
        setArtifacts(result.artifacts || []);
        setTotal(result.total || 0);
      }
    } catch (e: any) {
      setListError(e?.message || 'Failed to load');
      setArtifacts([]);
    } finally {
      setListLoading(false);
    }
  }, [buildApiFilters, searchQuery]);

  /* Fetch KPIs */
  const fetchKpis = useCallback(async () => {
    setKpisLoading(true);
    try {
      const result = await artifactsPortfolioKpis(
        filters.projectIds.length ? { projectIds: filters.projectIds } : {}
      );
      if (!result.error && result.kpis) setKpis(result.kpis);
    } finally {
      setKpisLoading(false);
    }
  }, [filters.projectIds]);

  /* Fetch detail when selectedId changes */
  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const result = await artifactsGet({ artifactId: id, includeChain: true });
      if (result.error) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
        setSelectedArtifact(null);
        setSelectedChain([]);
      } else {
        setSelectedArtifact(result.artifact || null);
        setSelectedChain(result.chain || []);
      }
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /* Effects */
  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchKpis(); }, [fetchKpis]);

  /* URL sync — read deep-link params on mount, write on selection.
     Supports three deep-link patterns (Phase D4):
       1. ?artifact=<uuid>                                        — direct artifact
       2. ?source_kind=pipeline_run&source_id=<uuid>&source_step_id=<id>
          → resolves to the artifact and selects it. Used by SEASON dashboard
          "Open in Documents" link where source coordinates are known but
          artifact_id is not.
       3. ?projectIds=<csv>                                       — preset project filter
          Used by ClientLens "View all documents" link to scope the page to
          one project on entry. */
  useEffect(() => {
    const urlId = searchParams.get('artifact');
    if (urlId && urlId !== selectedId) {
      setSelectedId(urlId);
      fetchDetail(urlId);
      return;
    }

    /* Pattern 2 — resolve by source coordinates (Phase D4).
       Documents page accepts ?source_kind=pipeline_run&source_id=X&source_step_id=Y
       and looks up the matching artifact via the source filter on bs_artifacts_list.
       The unique index on (source_kind, source_id, source_step_id) makes this
       a single-row lookup. Used by SEASON dashboard "Open in Documents" link
       where the step's run_id + step_id are known but artifact_id is not. */
    const sourceKind   = searchParams.get('source_kind');
    const sourceId     = searchParams.get('source_id');
    const sourceStepId = searchParams.get('source_step_id');
    if (sourceKind && sourceId) {
      (async () => {
        const r = await artifactsList({
          sourceKind,
          sourceId,
          sourceStepId: sourceStepId || undefined,
          status: 'current',
          limit: 1,
        });
        const found = (r.artifacts || [])[0];
        if (found) {
          setSelectedId(found.id);
          fetchDetail(found.id);
          /* Replace source_* params with the resolved artifact id for a clean URL */
          setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.delete('source_kind');
            next.delete('source_id');
            next.delete('source_step_id');
            next.set('artifact', found.id);
            return next;
          });
        } else {
          /* If no current artifact found, try a broader query without status filter
             (in case the artifact is superseded but the link's still being followed) */
          const r2 = await artifactsList({
            sourceKind, sourceId,
            sourceStepId: sourceStepId || undefined,
            limit: 1,
          } as any);
          const fallback = (r2.artifacts || [])[0];
          if (fallback) {
            setSelectedId(fallback.id);
            fetchDetail(fallback.id);
            setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.delete('source_kind');
              next.delete('source_id');
              next.delete('source_step_id');
              next.set('artifact', fallback.id);
              return next;
            });
          }
        }
      })();
    }

    /* Pattern 3 — preset projectIds filter */
    const projIdsParam = searchParams.get('projectIds');
    if (projIdsParam) {
      const ids = projIdsParam.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        setFilters(prev => ({ ...prev, projectIds: ids, quickFilter: 'all' }));
      }
    }

    /* Pattern 4 — preset campaignIds filter (Phase D4 — CampaignDocumentsSection link) */
    const campIdsParam = searchParams.get('campaignIds');
    if (campIdsParam) {
      const ids = campIdsParam.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        setFilters(prev => ({ ...prev, campaignIds: ids, quickFilter: 'all' }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('artifact', id);
      return next;
    });
    fetchDetail(id);
  };

  const handleCloseDetail = () => {
    setSelectedId(null);
    setSelectedArtifact(null);
    setSelectedChain([]);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('artifact');
      return next;
    });
  };

  /* Workflow actions — optimistic update + refetch list */
  const handleMarkReviewed = async (reviewed: boolean) => {
    if (!selectedArtifact) return;
    const result = await artifactsMarkReviewed({ artifactId: selectedArtifact.id, reviewed });
    if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    } else if (result.artifact) {
      setSelectedArtifact({ ...selectedArtifact, ...result.artifact });
      setArtifacts(prev => prev.map(a => a.id === selectedArtifact.id ? { ...a, ...result.artifact! } : a));
      fetchKpis(); // counts may have changed
      toast({ title: reviewed ? 'Marked reviewed' : 'Marked unreviewed' });
    }
  };

  const handleMarkSent = async (sent: boolean) => {
    if (!selectedArtifact) return;
    const result = await artifactsMarkSent({ artifactId: selectedArtifact.id, sent });
    if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    } else if (result.artifact) {
      setSelectedArtifact({ ...selectedArtifact, ...result.artifact });
      setArtifacts(prev => prev.map(a => a.id === selectedArtifact.id ? { ...a, ...result.artifact! } : a));
      toast({ title: sent ? 'Marked sent' : 'Marked unsent' });
    }
  };

  /* Reset filters (preserve quickFilter) */
  const handleReset = () => {
    setFilters({ ...DEFAULT_FILTERS, quickFilter: filters.quickFilter });
    setSearchQuery('');
    setOffset(0);
  };

  /* Pagination */
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;
  const onPrev = () => { if (canPrev) setOffset(Math.max(0, offset - PAGE_SIZE)); };
  const onNext = () => { if (canNext) setOffset(offset + PAGE_SIZE); };
  useEffect(() => { setOffset(0); }, [filters, searchQuery, sort]);

  return (
    <div className={embedded ? "h-full flex flex-col bg-background relative overflow-hidden" : "h-screen flex flex-col bg-background relative overflow-hidden"}>
      {!embedded && <AnimatedBg />}
      {!embedded && <PortalNav />}

      <div className="flex-1 flex flex-col relative z-10 overflow-hidden min-h-0">
        {/* Page header */}
        <div className="px-4 py-3 border-b border-border/40 bg-background/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-base font-bold">Documents</h1>
              <p className="text-[10px] text-muted-foreground">
                Portfolio-wide artifact management — search, filter, review, send
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { fetchList(); fetchKpis(); }}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
            <ThemeToggle />
          </div>
        </div>

        {/* KPI strip */}
        <KpiStrip kpis={kpis} loading={kpisLoading} />

        {/* Phase D4 — Active campaign filter banner. The sidebar doesn't surface
           campaignIds (would need per-project campaign list); URL-driven only.
           Show a clear chip when active so the operator knows what's filtered. */}
        {filters.campaignIds.length > 0 && (
          <div className="px-4 py-2 border-b border-border/40 bg-primary/5 flex items-center gap-2 text-xs">
            <Filter className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">Filtered to {filters.campaignIds.length} campaign{filters.campaignIds.length === 1 ? '' : 's'}.</span>
            <button
              onClick={() => setFilters(prev => ({ ...prev, campaignIds: [] }))}
              className="text-primary underline hover:no-underline"
            >
              Clear
            </button>
          </div>
        )}

        {/* Main three-pane layout */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          <FiltersSidebar
            filters={filters}
            setFilters={setFilters}
            projects={safeProjects}
            campaigns={allCampaigns}
            onReset={handleReset}
          />

          {/* List + search */}
          <div className="w-[420px] shrink-0 border-r border-border/40 flex flex-col overflow-hidden min-h-0">
            {/* Search bar + sort */}
            <div className="px-3 py-2 border-b border-border/40 bg-background/30">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search artifacts (full-text)…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mt-2 text-[10px]">
                <span className="text-muted-foreground">
                  {listLoading ? 'Loading…' : `${artifacts.length} of ${total}`}
                </span>
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value as SortMode)}
                  className="text-[10px] bg-transparent border border-border/40 rounded px-1.5 py-0.5"
                  disabled={filters.quickFilter === 'needs_me'}
                  title={filters.quickFilter === 'needs_me' ? 'Sort fixed to oldest-first in this view' : ''}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="most_expensive">Most expensive</option>
                </select>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              {listError && (
                <div className="p-4 text-xs text-destructive">
                  <AlertTriangle className="h-4 w-4 inline mr-2" />
                  {listError}
                </div>
              )}
              {!listLoading && !listError && artifacts.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  <Inbox className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <div className="text-sm">No artifacts match these filters</div>
                  <div className="text-xs mt-1 opacity-70">Try resetting filters or expanding the date range</div>
                </div>
              )}
              {listLoading && (
                <div className="p-4 space-y-2">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="h-16 bg-muted/20 rounded animate-pulse"></div>
                  ))}
                </div>
              )}
              {!listLoading && artifacts.map(a => (
                <ArtifactRow
                  key={a.id}
                  artifact={a}
                  selected={a.id === selectedId}
                  onClick={() => handleSelect(a.id)}
                  projectLabel={projectLabel}
                />
              ))}
            </div>

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="px-3 py-2 border-t border-border/40 flex items-center justify-between bg-background/30">
                <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!canPrev} onClick={onPrev}>
                  ← Prev
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
                </span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!canNext} onClick={onNext}>
                  Next →
                </Button>
              </div>
            )}
          </div>

          {/* Detail pane */}
          <DetailPane
            artifact={selectedArtifact}
            chain={selectedChain}
            loading={detailLoading}
            onMarkReviewed={handleMarkReviewed}
            onMarkSent={handleMarkSent}
            onClose={handleCloseDetail}
            projectLabel={projectLabel}
          />
        </div>
      </div>
    </div>
  );
}
