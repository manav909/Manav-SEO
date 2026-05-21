/* ════════════════════════════════════════════════════════════════
   src/components/pm/DataProvenanceBanner.tsx
   Phase 3 — Every analytics number gets context.

   Sits at the top of the AnalyticsIntelPanel showing:
     - GSC: which property, property type, search type, date range
            covered by the latest pull, freshness, caveats button
     - GA4: which property, channel filter, date range, freshness,
            caveats button
     - "Numbers not matching GSC/GA4?" diagnostic button
     - "Open in GSC" / "Open in GA4" deep-link buttons

   Designed to be skimmable — most PMs glance at it once per session.
   Heavy detail is behind the "View methodology" toggle and the
   diagnostic modal.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import {
  Database, ExternalLink, Info, AlertCircle, CheckCircle2, Clock,
  ChevronDown, ChevronRight, Search, BarChart3, Calendar, Filter, X,
  HelpCircle, RefreshCw, Globe, Shield, Layers,
} from 'lucide-react';
import {
  getAnalyticsProvenance, diagnoseAnalyticsMismatch, getExternalDashboardLinks,
  type AnalyticsProvenanceClient, type MismatchCauseClient,
  type ExternalDashboardLinksClient,
} from './api';

interface Props {
  projectId: string;
}

const FRESHNESS_META: Record<string, { label: string; color: string; icon: any }> = {
  fresh:      { label: 'Fresh (< 36h old)',      color: 'text-emerald-400', icon: CheckCircle2 },
  stale:      { label: 'Stale (1.5–7 days old)', color: 'text-amber-400',   icon: Clock },
  very_stale: { label: 'Very stale (> 7 days)',  color: 'text-red-400',     icon: AlertCircle },
  never:      { label: 'Never pulled',            color: 'text-muted-foreground', icon: AlertCircle },
};

export default function DataProvenanceBanner({ projectId }: Props) {
  const [prov, setProv]                 = useState<AnalyticsProvenanceClient | null>(null);
  const [loading, setLoading]           = useState(true);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [diagnosticOpen, setDiagnosticOpen]   = useState(false);
  const [externalOpen, setExternalOpen]       = useState(false);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      const r = await getAnalyticsProvenance(projectId);
      if (r.provenance) setProv(r.provenance);
      setLoading(false);
    })();
  }, [projectId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card/30 p-3 mb-4 text-[10px] text-muted-foreground">
        <RefreshCw className="h-3 w-3 inline mr-1 animate-spin" />
        Loading data provenance…
      </div>
    );
  }
  if (!prov) return null;

  return (
    <>
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.03] mb-4 overflow-hidden">
        {/* Top: dual-source summary row */}
        <div className="grid grid-cols-1 md:grid-cols-2">
          <SourceSummary
            label="Google Search Console"
            icon={Search}
            connected={prov.gsc.connected}
            primary={prov.gsc.resource_label || prov.gsc.resource_id}
            secondary={prov.gsc.property_type_label}
            coverage={
              prov.gsc.coverage_from && prov.gsc.coverage_to
                ? `${formatDate(prov.gsc.coverage_from)} → ${formatDate(prov.gsc.coverage_to)} · ${prov.gsc.coverage_day_count} days`
                : null
            }
            freshness={prov.gsc.freshness}
            lastPull={prov.gsc.last_pull_at}
          />
          <SourceSummary
            label="Google Analytics 4"
            icon={BarChart3}
            connected={prov.ga4.connected}
            primary={prov.ga4.property_label || prov.ga4.property_id}
            secondary={prov.ga4.channel_filter_label}
            coverage={
              prov.ga4.coverage_from && prov.ga4.coverage_to
                ? `${formatDate(prov.ga4.coverage_from)} → ${formatDate(prov.ga4.coverage_to)} · ${prov.ga4.coverage_day_count} days`
                : null
            }
            freshness={prov.ga4.freshness}
            lastPull={prov.ga4.last_pull_at}
          />
        </div>

        {/* Bottom action bar */}
        <div className="px-3 py-2 border-t border-blue-500/10 bg-card/20 flex flex-wrap items-center gap-2 text-[11px]">
          {prov.display.current_window_from && prov.display.current_window_to && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>Current window:</span>
              <span className="font-bold text-foreground">
                {formatDate(prov.display.current_window_from)} → {formatDate(prov.display.current_window_to)}
              </span>
            </div>
          )}
          <div className="flex-1" />
          <button
            onClick={() => setMethodologyOpen(!methodologyOpen)}
            className="px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/20 flex items-center gap-1 text-[10px]"
            title="See exactly how each metric is calculated"
          >
            <Info className="h-3 w-3" />
            Methodology
          </button>
          <button
            onClick={() => setDiagnosticOpen(true)}
            className="px-2 py-1 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 flex items-center gap-1 text-[10px] font-semibold"
            title="See the structured reasons why numbers may legitimately differ from your GSC/GA4 view"
          >
            <HelpCircle className="h-3 w-3" />
            Numbers not matching GSC/GA4?
          </button>
          <button
            onClick={() => setExternalOpen(true)}
            className="px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 flex items-center gap-1 text-[10px] font-semibold"
            title="Verify the same window side-by-side in the source dashboard"
          >
            <ExternalLink className="h-3 w-3" />
            Open in GSC / GA4
          </button>
        </div>

        {/* Methodology drawer (inline) */}
        {methodologyOpen && (
          <div className="px-3 py-3 border-t border-blue-500/10 bg-background/40 space-y-3 text-[11px]">
            <MethodologySection
              icon={Search}
              title="Search Console — what we pull"
              connected={prov.gsc.connected}
              items={prov.gsc.connected ? [
                { label: "Property",     value: prov.gsc.resource_id! },
                { label: "Type",         value: prov.gsc.property_type === "domain" ? "Domain (aggregates all subdomains + protocols)" : "URL prefix (one variant only)" },
                { label: "Search type",  value: "Web only (Image/Video/News/Discover NOT included)" },
                { label: "Data state",   value: prov.gsc.data_state_label },
                { label: "Aggregation",  value: "By property — clicks/impressions summed across all pages" },
                { label: "Top-N",        value: `${prov.gsc.top_n_queries} queries, ${prov.gsc.top_n_pages} pages — sum of visible rows < property total` },
                { label: "Country/device", value: "Not filtered — all countries, all devices summed" },
              ] : []}
              caveats={prov.gsc.caveats}
            />
            <MethodologySection
              icon={BarChart3}
              title="GA4 — what we pull"
              connected={prov.ga4.connected}
              items={prov.ga4.connected ? [
                { label: "Property",        value: prov.ga4.property_id! },
                { label: "Channel filter",  value: prov.ga4.channel_filter },
                { label: "Conversions",     value: prov.ga4.conversion_definition },
                { label: "Bounce rate",     value: prov.ga4.bounce_rate_definition },
                { label: "Timezone",        value: "Property timezone (set in GA4 Admin → Property settings → Reporting time zone)" },
              ] : []}
              metrics={prov.ga4.metric_definitions}
              caveats={prov.ga4.caveats}
            />
          </div>
        )}
      </div>

      {/* Diagnostic modal */}
      {diagnosticOpen && (
        <MismatchDiagnosticModal projectId={projectId} onClose={() => setDiagnosticOpen(false)} />
      )}

      {/* External-links modal */}
      {externalOpen && (
        <ExternalLinksModal
          projectId={projectId}
          defaultFrom={prov.display.current_window_from || undefined}
          defaultTo={prov.display.current_window_to || undefined}
          onClose={() => setExternalOpen(false)}
        />
      )}
    </>
  );
}

/* ─── Source summary tile (GSC or GA4) ─────────────────────────── */

function SourceSummary({
  label, icon: Icon, connected, primary, secondary, coverage, freshness, lastPull,
}: {
  label: string;
  icon: any;
  connected: boolean;
  primary: string | null;
  secondary: string;
  coverage: string | null;
  freshness: string;
  lastPull: string | null;
}) {
  const meta = FRESHNESS_META[freshness] || FRESHNESS_META.never;
  return (
    <div className="p-3 border-r border-blue-500/10 last:border-r-0">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-bold ${meta.color}`}>
          <meta.icon className="h-2.5 w-2.5" />
          {meta.label}
        </div>
      </div>
      {!connected ? (
        <div className="text-[11px] text-muted-foreground italic mt-1">
          Not connected — connect via Integrations to enable this data source.
        </div>
      ) : (
        <>
          <div className="text-[12px] font-bold text-foreground truncate mb-0.5" title={primary || ""}>{primary}</div>
          <div className="text-[10px] text-muted-foreground leading-snug">{secondary}</div>
          {coverage && (
            <div className="mt-1.5 text-[10px] text-foreground/80 flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5 text-blue-400" />
              <span>{coverage}</span>
            </div>
          )}
          {lastPull && (
            <div className="text-[9px] text-muted-foreground/70 mt-0.5">
              Last pulled {timeAgo(lastPull)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Methodology section ──────────────────────────────────────── */

function MethodologySection({
  icon: Icon, title, connected, items, metrics, caveats,
}: {
  icon: any; title: string; connected: boolean;
  items: Array<{ label: string; value: string }>;
  metrics?: Array<{ metric: string; definition: string }>;
  caveats: string[];
}) {
  if (!connected) {
    return (
      <div className="rounded-md border border-border bg-card/20 p-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
          <Icon className="h-3 w-3" />
          {title}
        </div>
        <div className="text-[10px] text-muted-foreground italic">Not connected.</div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-card/20 p-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-foreground mb-1.5">
        <Icon className="h-3 w-3 text-blue-400" />
        {title}
      </div>
      <div className="space-y-0.5 mb-2">
        {items.map((it) => (
          <div key={it.label} className="flex items-start gap-2 text-[10px]">
            <span className="text-muted-foreground w-24 shrink-0">{it.label}:</span>
            <span className="text-foreground/90 flex-1">{it.value}</span>
          </div>
        ))}
      </div>
      {metrics && metrics.length > 0 && (
        <details className="text-[10px] mb-2">
          <summary className="text-blue-400 cursor-pointer hover:underline">Show GA4 metric definitions</summary>
          <div className="mt-1 space-y-0.5 pl-2">
            {metrics.map((m) => (
              <div key={m.metric} className="flex items-start gap-2">
                <span className="text-foreground w-28 shrink-0 font-bold">{m.metric}:</span>
                <span className="text-muted-foreground flex-1">{m.definition}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      <details className="text-[10px]">
        <summary className="text-amber-400 cursor-pointer hover:underline">Caveats ({caveats.length})</summary>
        <ul className="mt-1 space-y-0.5 pl-2 list-disc list-inside text-amber-400/80">
          {caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </details>
    </div>
  );
}

/* ─── Mismatch diagnostic modal ────────────────────────────────── */

function MismatchDiagnosticModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [loading, setLoading]   = useState(true);
  const [causes, setCauses]     = useState<MismatchCauseClient[]>([]);
  const [filter, setFilter]     = useState<"all" | "common" | "gsc" | "ga4">("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await diagnoseAnalyticsMismatch(projectId);
      setCauses(r.causes || []);
      setLoading(false);
    })();
  }, [projectId]);

  const visible = causes.filter((c) => {
    if (filter === "common") return c.severity === "common";
    if (filter === "gsc")    return c.source === "gsc";
    if (filter === "ga4")    return c.source === "ga4";
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] rounded-2xl border border-amber-500/30 bg-card shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-gradient-to-r from-amber-500/[0.08] to-card">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-amber-400" />
            <div>
              <div className="text-sm font-bold text-foreground">Why might these numbers differ from GSC/GA4?</div>
              <div className="text-[10px] text-muted-foreground">The 12 known causes. Read them once, recognize them forever.</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/40 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-2 border-b border-border bg-muted/10 flex items-center gap-2 text-[10px]">
          <span className="text-muted-foreground">Filter:</span>
          {(["all","common","gsc","ga4"] as const).map((f) => (
            <button key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded border ${
                filter === f ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >{f.toUpperCase()}</button>
          ))}
          <div className="flex-1" />
          <span className="text-muted-foreground">{visible.length} of {causes.length} shown</span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {loading ? (
            <div className="text-center py-12 text-xs text-muted-foreground">
              <RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin opacity-50" />
              Analyzing your setup…
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground">No causes in this filter.</div>
          ) : (
            visible.map((c, i) => <CauseRow key={i} cause={c} />)
          )}
        </div>

        <div className="px-5 py-3 border-t border-border text-[10px] text-muted-foreground bg-muted/10">
          <strong className="text-foreground">Rule of thumb:</strong> if numbers differ by less than 5%, it's almost always one of these methodology causes — not a bug. For larger gaps, check property type + channel filter first.
        </div>
      </div>
    </div>
  );
}

function CauseRow({ cause }: { cause: MismatchCauseClient }) {
  const [open, setOpen] = useState(false);
  const sourceMeta = cause.source === "gsc"
    ? { label: "GSC", color: "text-blue-400 bg-blue-500/15", icon: Search }
    : cause.source === "ga4"
    ? { label: "GA4", color: "text-emerald-400 bg-emerald-500/15", icon: BarChart3 }
    : { label: "Both", color: "text-violet-400 bg-violet-500/15", icon: Layers };
  const sevColor = cause.severity === "common" ? "text-red-400" : cause.severity === "occasional" ? "text-amber-400" : "text-muted-foreground";

  const catLabels = {
    date_range: "Date range", property: "Property", filter: "Filter",
    methodology: "Methodology", freshness: "Freshness", sampling: "Sampling", privacy: "Privacy",
  };

  return (
    <div className="rounded-lg border border-border bg-background/40 overflow-hidden">
      <div onClick={() => setOpen(!open)} className="px-3 py-2 cursor-pointer flex items-start gap-2 hover:bg-muted/10">
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold ${sourceMeta.color}`}>{sourceMeta.label}</span>
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold border border-border text-muted-foreground">{catLabels[cause.category]}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-foreground">{cause.title}</div>
          <div className={`text-[9px] uppercase tracking-wider font-bold ${sevColor}`}>{cause.severity.replace("_"," ")}</div>
        </div>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-border/40 space-y-2 text-[11px]">
          <div className="text-foreground/85 leading-relaxed">{cause.explanation}</div>
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-2">
            <div className="text-[9px] uppercase tracking-wider font-bold text-emerald-400 mb-1">How to verify</div>
            <div className="text-foreground/85 leading-relaxed">{cause.verify}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── External links modal ─────────────────────────────────────── */

function ExternalLinksModal({
  projectId, defaultFrom, defaultTo, onClose,
}: { projectId: string; defaultFrom?: string; defaultTo?: string; onClose: () => void; }) {
  const [from, setFrom] = useState(defaultFrom || isoNDaysAgo(30));
  const [to,   setTo]   = useState(defaultTo   || isoNDaysAgo(3));
  const [loading, setLoading] = useState(false);
  const [links, setLinks]     = useState<ExternalDashboardLinksClient | null>(null);

  const loadLinks = async () => {
    setLoading(true);
    const r = await getExternalDashboardLinks({ projectId, fromDate: from, toDate: to });
    if (r.links) setLinks(r.links);
    setLoading(false);
  };

  useEffect(() => { loadLinks(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-blue-500/30 bg-card shadow-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-gradient-to-r from-blue-500/[0.08] to-card">
          <div className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5 text-blue-400" />
            <div className="text-sm font-bold text-foreground">Open the source dashboards at the same range</div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/40 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background/60 focus:outline-none focus:border-blue-500/40 mt-0.5"/>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background/60 focus:outline-none focus:border-blue-500/40 mt-0.5"/>
            </div>
          </div>
          <button onClick={loadLinks} disabled={loading}
            className="text-[11px] px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
            {loading ? 'Updating links…' : 'Update links'}
          </button>

          {links && (
            <div className="space-y-2">
              {links.gsc && (
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground mb-1">
                    <Search className="h-3.5 w-3.5 text-blue-400" />
                    Search Console
                  </div>
                  <div className="text-[10px] text-muted-foreground mb-2">{links.gsc.instructions}</div>
                  <a href={links.gsc.url} target="_blank" rel="noreferrer"
                    className="text-[10px] px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 inline-flex items-center gap-1 font-semibold">
                    <ExternalLink className="h-3 w-3" />
                    Open GSC Performance report
                  </a>
                </div>
              )}
              {links.ga4 && (
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground mb-1">
                    <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
                    Google Analytics 4
                  </div>
                  <div className="text-[10px] text-muted-foreground mb-2">{links.ga4.instructions}</div>
                  <a href={links.ga4.url} target="_blank" rel="noreferrer"
                    className="text-[10px] px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 inline-flex items-center gap-1 font-semibold">
                    <ExternalLink className="h-3 w-3" />
                    Open GA4 Traffic acquisition
                  </a>
                </div>
              )}
              {!links.gsc && !links.ga4 && (
                <div className="text-[11px] text-muted-foreground italic text-center py-4">
                  Neither GSC nor GA4 is connected. Connect via Integrations to enable verification links.
                </div>
              )}
            </div>
          )}

          <div className="text-[10px] text-muted-foreground italic">
            For an apples-to-apples comparison, set the exact same date range in the source dashboard, apply the documented filters, and compare row-by-row.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ───────────────────────────────────────────────── */

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch { return iso; }
}

function timeAgo(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60_000);
    if (m < 1)   return 'just now';
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30)  return `${d}d ago`;
    return formatDate(iso);
  } catch { return 'recently'; }
}

function isoNDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
