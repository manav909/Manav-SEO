/* ════════════════════════════════════════════════════════════════
   src/components/pm/AnalyticsIntelPanel.tsx
   Phase 1K — Frontend surface for the Analytics Intelligence layer.

   Renders everything pm-analytics-intel computes:
   - Composite scores (Health, Resilience) with gauge bars
   - 15 strategic KPIs as cards organized by category, with health
     colors and tooltipped formulas
   - Rising Stars table (queries about to break through)
   - Falling Stars table (queries needing investigation)
   - Period comparison view (Last 30d vs Previous 30d, YoY, etc.)
   - Query velocity (new vs lost queries)

   Auto-loads on mount + Refresh button for manual recompute.
   Gracefully degrades when there's no data yet ("Run a GSC/GA4 pull
   first" empty state).
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import DataProvenanceBanner from './DataProvenanceBanner';
import {
  TrendingUp, TrendingDown, Activity, Shield, RefreshCw, AlertCircle, BarChart3,
  ChevronDown, ChevronRight, Info, Sparkles, Zap, Globe, Smartphone, Target,
  ArrowUpRight, ArrowDownRight, Minus, ExternalLink, Lightbulb, Check,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as pmApi from './api';
import {
  getAnalyticsIntel,
  recomputeAnalyticsIntel,
  type AnalyticsIntelClient,
  type StrategicKpiClient,
  type RisingStarClient,
  type FallingStarClient,
  type PeriodSummaryClient,
  type PeriodDeltaClient,
} from './api';

interface Props {
  projectId: string;
  /** Optional: collapsed by default */
  defaultCollapsed?: boolean;
}

export default function AnalyticsIntelPanel({ projectId, defaultCollapsed }: Props) {
  const [intel, setIntel]       = useState<AnalyticsIntelClient | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [emptyMsg, setEmptyMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  /* Sub-section toggles */
  const [showRising, setShowRising]       = useState(true);
  const [showFalling, setShowFalling]     = useState(true);
  const [showVelocity, setShowVelocity]   = useState(true);
  const [showCompare, setShowCompare]     = useState(false);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      setError(null);
      const r = await getAnalyticsIntel(projectId);
      if (r.error) setError(r.error);
      if (r.message) setEmptyMsg(r.message);
      setIntel(r.intel);
      setLoading(false);
    })();
  }, [projectId]);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    setEmptyMsg(null);
    const r = await recomputeAnalyticsIntel(projectId);
    if (r.error) setError(r.error);
    if (r.message) setEmptyMsg(r.message);
    setIntel(r.intel);
    setRefreshing(false);
  };

  /* ─── Loading / empty / error states ──────────────────────────── */
  if (loading) {
    return (
      <PanelShell expanded={true} onToggle={() => {}}>
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          <Activity className="h-5 w-5 mx-auto mb-2 animate-pulse opacity-50" />
          Loading analytics intelligence…
        </div>
      </PanelShell>
    );
  }

  if (error) {
    return (
      <PanelShell expanded={expanded} onToggle={() => setExpanded(!expanded)}>
        {expanded && (
          <div className="px-4 py-6 text-center">
            <AlertCircle className="h-5 w-5 mx-auto mb-2 text-red-400" />
            <div className="text-xs text-red-400 font-semibold">{error}</div>
            <button onClick={refresh} className="mt-3 text-[10px] px-2 py-1 rounded border border-border hover:bg-muted/40">Retry</button>
          </div>
        )}
      </PanelShell>
    );
  }

  if (!intel || intel.kpis.length === 0) {
    return (
      <PanelShell expanded={expanded} onToggle={() => setExpanded(!expanded)}>
        {expanded && (
          <div className="px-4 py-4">
            <DataProvenanceBanner projectId={projectId} />
            <div className="text-center py-2">
              <Sparkles className="h-5 w-5 mx-auto mb-2 text-muted-foreground/40" />
              <div className="text-sm font-semibold text-foreground">Intelligence not yet computed</div>
              <div className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                {emptyMsg || 'Run a GSC + GA4 pull from Integrations first. Strategic intelligence (15 KPIs, rising/falling stars, period comparisons) will compute automatically.'}
              </div>
              <button
                onClick={refresh}
                disabled={refreshing}
                className="mt-3 text-[11px] px-3 py-1.5 rounded-lg font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50 flex items-center gap-1.5 mx-auto"
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Computing…' : 'Compute now'}
              </button>
            </div>
          </div>
        )}
      </PanelShell>
    );
  }

  /* ─── Full panel render ───────────────────────────────────────── */
  return (
    <PanelShell
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      headerExtras={
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {intel.generatedAt && (
            <span title={new Date(intel.generatedAt).toLocaleString()}>
              Updated {timeAgo(intel.generatedAt)}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); refresh(); }}
            disabled={refreshing}
            className="px-2 py-1 rounded border border-border hover:bg-muted/40 flex items-center gap-1 disabled:opacity-50"
            title="Recompute intelligence from current data"
          >
            <RefreshCw className={`h-2.5 w-2.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      }
    >
      {expanded && (
        <div className="p-4 space-y-5">
          {/* Phase 3 — Data Provenance Banner (every number explained) */}
          <DataProvenanceBanner projectId={projectId} />

          {/* Composite scores — hero gauges */}
          <CompositeScores
            health={intel.overallHealthScore}
            resilience={intel.algorithmResilience}
          />

          {/* 15 KPI cards */}
          <KpiGrid kpis={intel.kpis} />

          {/* Rising Stars */}
          {intel.risingStars.length > 0 && (
            <CollapsibleSection
              title="Rising Stars"
              count={intel.risingStars.length}
              icon={TrendingUp}
              accent="emerald"
              open={showRising}
              onToggle={() => setShowRising(!showRising)}
              subtitle="Queries gaining impressions — one push from page 1"
            >
              <RisingStarsTable items={intel.risingStars} projectId={projectId} />
            </CollapsibleSection>
          )}

          {/* Falling Stars */}
          {intel.fallingStars.length > 0 && (
            <CollapsibleSection
              title="Falling Stars"
              count={intel.fallingStars.length}
              icon={TrendingDown}
              accent="red"
              open={showFalling}
              onToggle={() => setShowFalling(!showFalling)}
              subtitle="Queries losing clicks — investigate cause"
            >
              <FallingStarsTable items={intel.fallingStars} projectId={projectId} />
            </CollapsibleSection>
          )}

          {/* Query velocity */}
          {intel.queryVelocity && (
            <CollapsibleSection
              title="Query Velocity"
              icon={Zap}
              accent="violet"
              open={showVelocity}
              onToggle={() => setShowVelocity(!showVelocity)}
              subtitle={`${intel.queryVelocity.newQueriesCount} new vs ${intel.queryVelocity.lostQueriesCount} lost queries period-over-period`}
            >
              <QueryVelocityView velocity={intel.queryVelocity} />
            </CollapsibleSection>
          )}

          {/* Period comparison */}
          {Object.keys(intel.deltas).length > 0 && (
            <CollapsibleSection
              title="Period Comparisons"
              icon={BarChart3}
              accent="blue"
              open={showCompare}
              onToggle={() => setShowCompare(!showCompare)}
              subtitle="Period-over-period & YoY deltas across every key metric"
            >
              <PeriodComparisonView periods={intel.periods} deltas={intel.deltas} />
            </CollapsibleSection>
          )}
        </div>
      )}
    </PanelShell>
  );
}

/* ─── Panel shell ───────────────────────────────────────────────── */

function PanelShell({
  expanded, onToggle, headerExtras, children,
}: {
  expanded: boolean;
  onToggle: () => void;
  headerExtras?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] via-card/40 to-amber-500/[0.04] mb-4 overflow-hidden">
      <div
        onClick={onToggle}
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-violet-500/[0.04] border-b border-violet-500/10"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <div>
            <div className="text-sm font-bold text-foreground">Analytics Intelligence</div>
            <div className="text-[10px] text-muted-foreground">15 strategic KPIs · rising/falling stars · period deltas · YoY</div>
          </div>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {headerExtras}
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" onClick={onToggle} /> : <ChevronRight className="h-4 w-4 text-muted-foreground" onClick={onToggle} />}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ─── Composite scores hero ─────────────────────────────────────── */

function CompositeScores({
  health, resilience,
}: { health: number | null; resilience: number | null }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <ScoreGauge
        label="Overall Health Score"
        value={health}
        icon={Activity}
        accent="violet"
        description="Weighted composite of all 15 KPIs — investor-relevant metrics weighted highest"
      />
      <ScoreGauge
        label="Algorithm Resilience"
        value={resilience}
        icon={Shield}
        accent="amber"
        description="How well your site weathers Google core updates — stability + diversification composite"
      />
    </div>
  );
}

function ScoreGauge({
  label, value, icon: Icon, accent, description,
}: {
  label: string;
  value: number | null;
  icon: any;
  accent: 'violet' | 'amber';
  description: string;
}) {
  const v       = value ?? 0;
  const display = value != null ? value.toFixed(0) : '—';
  const tone =
    v >= 80 ? 'excellent' :
    v >= 65 ? 'good'      :
    v >= 50 ? 'moderate'  :
    v >= 35 ? 'concern'   : 'critical';
  const toneColor = {
    excellent: 'text-emerald-400',
    good:      'text-green-400',
    moderate:  'text-amber-400',
    concern:   'text-orange-400',
    critical:  'text-red-400',
  }[tone];
  const accentBg = accent === 'violet' ? 'bg-violet-500' : 'bg-amber-500';

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <div className={`text-[9px] uppercase tracking-wider font-bold ${toneColor}`}>{tone}</div>
      </div>
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className={`text-3xl font-bold ${toneColor}`}>{display}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-background/60 overflow-hidden mb-2">
        <div className={`h-full ${accentBg} transition-all`} style={{ width: `${Math.max(2, Math.min(100, v))}%` }} />
      </div>
      <div className="text-[10px] text-muted-foreground/80 leading-snug">{description}</div>
    </div>
  );
}

/* ─── 15 KPI grid ───────────────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  growth:           'Growth',
  quality:          'Quality',
  stability:        'Stability',
  diversification:  'Diversification',
  efficiency:       'Efficiency',
};

const CATEGORY_ORDER = ['growth', 'quality', 'stability', 'diversification', 'efficiency'];

function KpiGrid({ kpis }: { kpis: StrategicKpiClient[] }) {
  /* Group by category */
  const grouped: Record<string, StrategicKpiClient[]> = {};
  for (const k of kpis) {
    const cat = k.category || 'efficiency';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(k);
  }

  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.filter((c) => grouped[c]).map((cat) => (
        <div key={cat}>
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2 pl-1">
            {CATEGORY_LABELS[cat]}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {grouped[cat].map((k) => <KpiCard key={k.key} kpi={k} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

const HEALTH_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  excellent: { bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  good:      { bg: 'bg-green-500/[0.06]',   border: 'border-green-500/25',  text: 'text-green-400',   dot: 'bg-green-400'   },
  moderate:  { bg: 'bg-amber-500/[0.06]',   border: 'border-amber-500/25',  text: 'text-amber-400',   dot: 'bg-amber-400'   },
  concern:   { bg: 'bg-orange-500/[0.08]',  border: 'border-orange-500/30', text: 'text-orange-400',  dot: 'bg-orange-400'  },
  critical:  { bg: 'bg-red-500/[0.08]',     border: 'border-red-500/30',    text: 'text-red-400',     dot: 'bg-red-400'     },
  unknown:   { bg: 'bg-muted/20',           border: 'border-border',        text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
};

function KpiCard({ kpi }: { kpi: StrategicKpiClient }) {
  const colors = HEALTH_COLORS[kpi.health] || HEALTH_COLORS.unknown;
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={`relative rounded-xl border ${colors.bg} ${colors.border} p-3 group transition-all hover:scale-[1.02]`}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div className="text-[10px] font-bold text-foreground/90 leading-tight pr-4">{kpi.name}</div>
        <button
          onClick={() => setShowTooltip(!showTooltip)}
          className="opacity-30 hover:opacity-100 transition-opacity shrink-0"
          title="Definition & recommendation"
        >
          <Info className="h-3 w-3" />
        </button>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className={`text-xl font-bold ${colors.text}`}>
          {kpi.value != null ? formatKpiValue(kpi.value) : '—'}
        </span>
        <span className="text-[9px] text-muted-foreground">{kpi.unit}</span>
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
          <span className={`text-[9px] uppercase tracking-wider font-bold ${colors.text}`}>{kpi.health}</span>
        </div>
        <TrendIcon trend={kpi.trend} />
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          onClick={() => setShowTooltip(false)}
          className="absolute z-20 top-full left-0 right-0 mt-1 p-3 rounded-xl border border-border bg-card shadow-2xl text-[11px] space-y-2 cursor-pointer"
        >
          <div>
            <div className="font-bold text-foreground mb-0.5">What it means</div>
            <div className="text-foreground/80 leading-snug">{kpi.definition}</div>
          </div>
          <div>
            <div className="font-bold text-foreground mb-0.5">Formula</div>
            <div className="text-muted-foreground font-mono text-[10px]">{kpi.formula}</div>
          </div>
          <div>
            <div className="font-bold text-foreground mb-0.5">Recommendation</div>
            <div className="text-foreground/80 leading-snug">{kpi.recommendation}</div>
          </div>
          <div className="text-[9px] text-muted-foreground italic pt-1 border-t border-border">Tap to close</div>
        </div>
      )}
    </div>
  );
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'improving') return <ArrowUpRight className="h-3 w-3 text-emerald-400" />;
  if (trend === 'declining') return <ArrowDownRight className="h-3 w-3 text-red-400" />;
  if (trend === 'stable')    return <Minus className="h-3 w-3 text-muted-foreground" />;
  return null;
}

/* ─── Collapsible section helper ────────────────────────────────── */

function CollapsibleSection({
  title, count, icon: Icon, accent, subtitle, open, onToggle, children,
}: {
  title: string;
  count?: number;
  icon: any;
  accent: 'emerald' | 'red' | 'violet' | 'blue';
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const accentClasses = {
    emerald: { ring: 'ring-emerald-500/20', text: 'text-emerald-400' },
    red:     { ring: 'ring-red-500/20',     text: 'text-red-400'     },
    violet:  { ring: 'ring-violet-500/20',  text: 'text-violet-400'  },
    blue:    { ring: 'ring-blue-500/20',    text: 'text-blue-400'    },
  }[accent];

  return (
    <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
      <div
        onClick={onToggle}
        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-muted/20"
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 ${accentClasses.text}`} />
          <div>
            <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
              {title}
              {count != null && <span className={`text-[10px] px-1.5 py-0.5 rounded ${accentClasses.text} bg-muted/40`}>{count}</span>}
            </div>
            {subtitle && <div className="text-[10px] text-muted-foreground">{subtitle}</div>}
          </div>
        </div>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

/* ─── Rising stars table ────────────────────────────────────────── */

const OPPORTUNITY_LABELS: Record<string, { label: string; color: string }> = {
  page_2_to_1:       { label: 'Page 2 → 1',       color: 'text-emerald-400 bg-emerald-500/15' },
  page_3_to_2:       { label: 'Page 3 → 2',       color: 'text-green-400 bg-green-500/15'     },
  first_appearance:  { label: 'New ranking',      color: 'text-violet-400 bg-violet-500/15'   },
  ranking_climber:   { label: 'Climbing',         color: 'text-blue-400 bg-blue-500/15'       },
};

function RisingStarsTable({ items, projectId }: { items: RisingStarClient[]; projectId: string }) {
  const { toast } = useToast();
  const [noted, setNoted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const noteOpportunity = async (r: RisingStarClient) => {
    if (noted.has(r.query)) return;
    setBusy(r.query);
    const result = await pmApi.seoOpportunityFromAnalytics({
      projectId,
      findingKind: 'rising_star',
      query:       r.query,
      position:    r.position,
      impressions: r.currentImpr,
      lift_pct:    r.impressionLift,
      reason:      r.reason,
      raw:         r,
    });
    setBusy(null);
    if (result.error) {
      toast({ title: 'Could not note opportunity', description: result.error, variant: 'destructive' });
      return;
    }
    setNoted(prev => new Set(prev).add(r.query));
    toast({
      title: result.campaign_id ? 'Noted — added to existing campaign' : 'Noted as project opportunity',
      description: `Visible in PM → SEO Campaigns → Opportunities`,
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <th className="text-left py-2 pr-3">Query</th>
            <th className="text-left py-2 px-2">Opportunity</th>
            <th className="text-right py-2 px-2">Position</th>
            <th className="text-right py-2 px-2">Impressions</th>
            <th className="text-right py-2 px-2">Lift</th>
            <th className="text-left py-2 pl-2">Why</th>
            <th className="text-right py-2 pl-2 pr-1">Note</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 15).map((r, i) => {
            const opp = OPPORTUNITY_LABELS[r.opportunity] || OPPORTUNITY_LABELS.ranking_climber;
            const isNoted = noted.has(r.query);
            const isBusy = busy === r.query;
            return (
              <tr key={i} className="border-b border-border/40 hover:bg-muted/10">
                <td className="py-2 pr-3 font-semibold text-foreground">{r.query}</td>
                <td className="py-2 px-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${opp.color}`}>{opp.label}</span>
                </td>
                <td className="py-2 px-2 text-right text-foreground/80">{r.position.toFixed(1)}</td>
                <td className="py-2 px-2 text-right text-foreground/80">
                  {r.previousImpr.toLocaleString()} → <span className="text-foreground font-semibold">{r.currentImpr.toLocaleString()}</span>
                </td>
                <td className="py-2 px-2 text-right text-emerald-400 font-bold">+{r.impressionLift.toFixed(0)}%</td>
                <td className="py-2 pl-2 text-muted-foreground text-[10px] max-w-xs">{r.reason}</td>
                <td className="py-2 pl-2 pr-1 text-right">
                  <button
                    onClick={() => noteOpportunity(r)}
                    disabled={isNoted || isBusy}
                    title={isNoted ? 'Already noted' : 'Note as opportunity'}
                    className={`p-1 rounded ${
                      isNoted
                        ? 'text-emerald-400'
                        : 'text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10'
                    }`}
                  >
                    {isNoted ? <Check className="h-3 w-3" /> : <Lightbulb className="h-3 w-3" />}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Falling stars table ───────────────────────────────────────── */

function FallingStarsTable({ items, projectId }: { items: FallingStarClient[]; projectId: string }) {
  const { toast } = useToast();
  const [noted, setNoted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const noteOpportunity = async (r: FallingStarClient) => {
    if (noted.has(r.query)) return;
    setBusy(r.query);
    const result = await pmApi.seoOpportunityFromAnalytics({
      projectId,
      findingKind: 'falling_star',
      query:       r.query,
      position:    r.position > 0 ? r.position : r.positionPrevious,
      clicks:      r.currentClicks,
      lift_pct:    -r.clickLoss,
      reason:      r.reason,
      raw:         r,
    });
    setBusy(null);
    if (result.error) {
      toast({ title: 'Could not note opportunity', description: result.error, variant: 'destructive' });
      return;
    }
    setNoted(prev => new Set(prev).add(r.query));
    toast({
      title: result.campaign_id ? 'Noted — added to existing campaign' : 'Noted as project opportunity',
      description: `Visible in PM → SEO Campaigns → Opportunities`,
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <th className="text-left py-2 pr-3">Query</th>
            <th className="text-left py-2 px-2">Severity</th>
            <th className="text-right py-2 px-2">Position</th>
            <th className="text-right py-2 px-2">Clicks</th>
            <th className="text-right py-2 px-2">Loss</th>
            <th className="text-left py-2 pl-2">Why</th>
            <th className="text-right py-2 pl-2 pr-1">Note</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 15).map((r, i) => {
            const isNoted = noted.has(r.query);
            const isBusy = busy === r.query;
            return (
              <tr key={i} className="border-b border-border/40 hover:bg-muted/10">
                <td className="py-2 pr-3 font-semibold text-foreground">{r.query}</td>
                <td className="py-2 px-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                    r.severity === 'critical' ? 'text-red-400 bg-red-500/15' : 'text-amber-400 bg-amber-500/15'
                  }`}>{r.severity}</span>
                </td>
                <td className="py-2 px-2 text-right text-foreground/80">
                  {r.positionPrevious.toFixed(1)} → {r.position > 0 ? r.position.toFixed(1) : 'lost'}
                </td>
                <td className="py-2 px-2 text-right text-foreground/80">
                  {r.previousClicks.toLocaleString()} → <span className="text-foreground font-semibold">{r.currentClicks.toLocaleString()}</span>
                </td>
                <td className="py-2 px-2 text-right text-red-400 font-bold">-{r.clickLoss.toFixed(0)}%</td>
                <td className="py-2 pl-2 text-muted-foreground text-[10px] max-w-xs">{r.reason}</td>
                <td className="py-2 pl-2 pr-1 text-right">
                  <button
                    onClick={() => noteOpportunity(r)}
                    disabled={isNoted || isBusy}
                    title={isNoted ? 'Already noted' : 'Note as opportunity'}
                    className={`p-1 rounded ${
                      isNoted
                        ? 'text-emerald-400'
                        : 'text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10'
                    }`}
                  >
                    {isNoted ? <Check className="h-3 w-3" /> : <Lightbulb className="h-3 w-3" />}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Query velocity ────────────────────────────────────────────── */

function QueryVelocityView({ velocity }: { velocity: import('./api').QueryVelocityClient }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
          <div className="text-[9px] uppercase tracking-wider text-emerald-400 font-bold mb-1">New queries</div>
          <div className="text-2xl font-bold text-emerald-400">+{velocity.newQueriesCount}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{velocity.discoveryRatePct.toFixed(1)}% discovery rate</div>
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3">
          <div className="text-[9px] uppercase tracking-wider text-red-400 font-bold mb-1">Lost queries</div>
          <div className="text-2xl font-bold text-red-400">-{velocity.lostQueriesCount}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">No longer ranking</div>
        </div>
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] p-3">
          <div className="text-[9px] uppercase tracking-wider text-blue-400 font-bold mb-1">Retained</div>
          <div className="text-2xl font-bold text-blue-400">{velocity.retainedQueriesCount}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Stable ranking footprint</div>
        </div>
      </div>

      {velocity.newQueriesTopExamples.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Top new queries</div>
          <div className="flex flex-wrap gap-1.5">
            {velocity.newQueriesTopExamples.map((q, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{q}</span>
            ))}
          </div>
        </div>
      )}
      {velocity.lostQueriesTopExamples.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Top lost queries</div>
          <div className="flex flex-wrap gap-1.5">
            {velocity.lostQueriesTopExamples.map((q, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{q}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Period comparison ─────────────────────────────────────────── */

function PeriodComparisonView({
  periods, deltas,
}: {
  periods: Record<string, PeriodSummaryClient>;
  deltas:  Record<string, PeriodDeltaClient>;
}) {
  /* Default to the most useful comparison */
  const availableDeltas = Object.keys(deltas);
  const [selected, setSelected] = useState(availableDeltas[0] || '');
  if (!selected || !deltas[selected]) {
    return <div className="text-xs text-muted-foreground text-center py-4">No comparison data available yet.</div>;
  }
  const d = deltas[selected];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {availableDeltas.map((k) => (
          <button
            key={k}
            onClick={() => setSelected(k)}
            className={`text-[10px] px-2 py-1 rounded-lg font-semibold ${
              selected === k
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                : 'border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {formatDeltaKey(k)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <DeltaCard label="Clicks"      delta={d.clicks}      lowerIsBetter={false} />
        <DeltaCard label="Impressions" delta={d.impressions} lowerIsBetter={false} />
        <DeltaCard label="Position"    delta={d.position}    lowerIsBetter={true}  format="position" />
        <DeltaCard label="CTR"         delta={d.ctr}         lowerIsBetter={false} format="percent" />
        <DeltaCard label="Sessions"    delta={d.sessions}    lowerIsBetter={false} />
        <DeltaCard label="Conversions" delta={d.conversions} lowerIsBetter={false} />
        <DeltaCard label="Bounce rate" delta={d.bounceRate}  lowerIsBetter={true} format="percent" />
      </div>

      <div className="text-[10px] text-muted-foreground italic pt-1">
        Comparing <span className="font-semibold text-foreground">{d.fromLabel}</span> → <span className="font-semibold text-foreground">{d.toLabel}</span>
      </div>
    </div>
  );
}

function DeltaCard({
  label, delta, lowerIsBetter, format,
}: {
  label: string;
  delta: PeriodDeltaClient['clicks'];
  lowerIsBetter: boolean;
  format?: 'position' | 'percent';
}) {
  const isImprovement = lowerIsBetter ? delta.direction === 'down' : delta.direction === 'up';
  const color = delta.direction === 'flat'
    ? 'text-muted-foreground'
    : isImprovement ? 'text-emerald-400' : 'text-red-400';
  const arrow = delta.direction === 'flat'
    ? <Minus className="h-3 w-3" />
    : isImprovement
      ? <ArrowUpRight className="h-3 w-3" />
      : <ArrowDownRight className="h-3 w-3" />;

  const formatVal = (v: number) => {
    if (format === 'position') return v.toFixed(1);
    if (format === 'percent')  return v.toFixed(1) + '%';
    return v.toLocaleString();
  };

  return (
    <div className="rounded-lg border border-border bg-card/40 p-2.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-bold text-foreground">{formatVal(delta.to)}</span>
        <span className="text-[9px] text-muted-foreground">from {formatVal(delta.from)}</span>
      </div>
      <div className={`flex items-center gap-1 mt-0.5 ${color}`}>
        {arrow}
        <span className="text-[10px] font-bold">
          {delta.pctChange >= 0 ? '+' : ''}{(delta.pctChange * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

/* ─── Helpers ───────────────────────────────────────────────────── */

function formatKpiValue(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000)    return `${(v / 1000).toFixed(0)}k`;
  if (Math.abs(v) >= 1000)      return `${(v / 1000).toFixed(1)}k`;
  if (Math.abs(v) < 1)          return v.toFixed(2);
  if (Math.abs(v) < 10)         return v.toFixed(1);
  return v.toFixed(0);
}

function formatDeltaKey(k: string): string {
  const map: Record<string, string> = {
    last_7d_vs_previous:       'Last 7d vs prior',
    last_30d_vs_previous:      'Last 30d vs prior',
    last_90d_vs_previous:      'Last 90d vs prior',
    last_30d_yoy:              '30d YoY',
    last_90d_yoy:              '90d YoY',
  };
  return map[k] || k.replace(/_/g, ' ');
}

function timeAgo(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1)  return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch { return 'recently'; }
}
