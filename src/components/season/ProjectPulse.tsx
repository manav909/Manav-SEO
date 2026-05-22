/* ════════════════════════════════════════════════════════════════════
   src/components/season/ProjectPulse.tsx
   Phase 21 — Block 2.11 Pass 1 — REAL panels (no placeholders)

   Pro mode RIGHT column. All sections wire to live data:
     1. 🎯 Health scorecard — 5 cells
     2. 📈 Performance pulse — top performers + falling stars
     3. 📊 Pillar health matrix — 6 pillars with status
     4. 👁️ I noticed — LLM-pre-computed observations (cached 12h)
     5. 🧾 Decisions log — recent decisions_avoided
     6. ⏱️ Velocity stats — week vs last week

   Future (Pass 2): Things the client might ask, Client recap.
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, BarChart3, FileCheck, Eye, Timer, FileText,
  TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown, ArrowRight,
  CheckCircle2, AlertTriangle, Clock, XCircle, Sparkles, ExternalLink,
} from 'lucide-react';
import {
  seoPillarHealthMatrix, seoPerformancePulse, seoDecisionsLog,
  seoVelocityStats, seoNoticedObservations,
  type ScorecardCellClient, type PillarHealthCardClient,
  type PerformancePulseClient, type DecisionLogEntryClient,
  type VelocityStatsClient, type NoticedObservationClient,
} from '@/components/pm/api';
import { cascadeContainerVariants, cascadeItemVariants, DURATION, FEATHER_EASE } from './warRoomAnimations';

interface Props {
  projectId:        string | null;
  scorecard:        ScorecardCellClient[];
  loading:          boolean;
  onLaunchCommand:  (cmd: string) => void;
  onNavigate?:      (path: string) => void;
}

export default function ProjectPulse({ projectId, scorecard, loading, onLaunchCommand, onNavigate }: Props) {
  const [pillarCards, setPillarCards]     = useState<PillarHealthCardClient[]>([]);
  const [pulse, setPulse]                 = useState<PerformancePulseClient | null>(null);
  const [decisions, setDecisions]         = useState<DecisionLogEntryClient[]>([]);
  const [decisionsTotal, setDecisionsTotal] = useState(0);
  const [velocity, setVelocity]           = useState<VelocityStatsClient | null>(null);
  const [noticed, setNoticed]             = useState<NoticedObservationClient[]>([]);
  const [pillarLoading, setPillarLoading]     = useState(false);
  const [pulseLoading, setPulseLoading]       = useState(false);
  const [decisionsLoading, setDecisionsLoading] = useState(false);
  const [velocityLoading, setVelocityLoading]   = useState(false);
  const [noticedLoading, setNoticedLoading]     = useState(false);

  useEffect(() => {
    if (!projectId) {
      setPillarCards([]); setPulse(null); setDecisions([]); setVelocity(null); setNoticed([]);
      return;
    }
    let cancelled = false;
    setPillarLoading(true); setPulseLoading(true); setDecisionsLoading(true); setVelocityLoading(true); setNoticedLoading(true);
    (async () => {
      const [matrixR, pulseR, decisionsR, velocityR, noticedR] = await Promise.all([
        seoPillarHealthMatrix({ projectId }),
        seoPerformancePulse({ projectId }),
        seoDecisionsLog({ projectId, limit: 5 }),
        seoVelocityStats({ projectId }),
        seoNoticedObservations({ projectId }),
      ]);
      if (cancelled) return;
      if (matrixR.cards) setPillarCards(matrixR.cards);
      if (pulseR.pulse) setPulse(pulseR.pulse);
      if (decisionsR.entries) { setDecisions(decisionsR.entries); setDecisionsTotal(decisionsR.total || 0); }
      if (velocityR.stats) setVelocity(velocityR.stats);
      if (noticedR.observations) setNoticed(noticedR.observations);
      setPillarLoading(false); setPulseLoading(false); setDecisionsLoading(false); setVelocityLoading(false); setNoticedLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <div className="space-y-5">
      <Scorecard cells={scorecard} loading={loading} />
      <PerformancePulsePanel pulse={pulse} loading={pulseLoading} onLaunchCommand={onLaunchCommand} />
      <PillarHealthMatrixPanel cards={pillarCards} loading={pillarLoading} onNavigate={onNavigate} />
      <INoticedPanel observations={noticed} loading={noticedLoading} onLaunchCommand={onLaunchCommand} />
      <DecisionsLogPanel entries={decisions} total={decisionsTotal} loading={decisionsLoading} />
      <VelocityPanel stats={velocity} loading={velocityLoading} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SCORECARD (unchanged from Phase A — kept living here)
══════════════════════════════════════════════════════════════════════ */

function Scorecard({ cells, loading }: { cells: ScorecardCellClient[]; loading: boolean }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  return (
    <section>
      <SectionHeader
        icon={<Activity className="h-3.5 w-3.5" />}
        tone="cyan"
        label="Health"
        sublabel={loading ? 'computing…' : '5 vital signs · click any for contributing factors'} />
      {loading && cells.length === 0 ? (
        <LoadingCard label="Computing project vitals…" />
      ) : (
        <motion.div variants={cascadeContainerVariants} initial="hidden" animate="visible" className="mt-3 grid grid-cols-2 gap-2">
          {cells.map(cell => (
            <ScorecardCell key={cell.key} cell={cell} expanded={expandedKey === cell.key} onToggle={() => setExpandedKey(expandedKey === cell.key ? null : cell.key)} />
          ))}
        </motion.div>
      )}
    </section>
  );
}

function ScorecardCell({ cell, expanded, onToggle }: { cell: ScorecardCellClient; expanded: boolean; onToggle: () => void }) {
  const tone = pickToneForCell(cell);
  const toneClass: Record<string, string> = {
    cyan:    'border-cyan-500/25 bg-cyan-500/[0.04] hover:border-cyan-500/45',
    emerald: 'border-emerald-500/25 bg-emerald-500/[0.04] hover:border-emerald-500/45',
    amber:   'border-amber-500/25 bg-amber-500/[0.04] hover:border-amber-500/45',
    rose:    'border-rose-500/25 bg-rose-500/[0.04] hover:border-rose-500/45',
    slate:   'border-slate-500/25 bg-slate-500/[0.04] hover:border-slate-500/45',
  };
  const valueColor: Record<string, string> = {
    cyan: 'text-cyan-300', emerald: 'text-emerald-300', amber: 'text-amber-300', rose: 'text-rose-300', slate: 'text-slate-200',
  };
  return (
    <motion.button variants={cascadeItemVariants} whileHover={{ scale: 1.01 }} transition={{ duration: DURATION.hover, ease: FEATHER_EASE }} onClick={onToggle}
      className={`rounded-xl border p-3 text-left transition-colors ${toneClass[tone]} ${expanded ? 'col-span-2' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/75 font-bold">{cell.label}</div>
        {cell.delta_this_week != null && <DeltaArrow delta={cell.delta_this_week} />}
      </div>
      <div className={`text-2xl font-bold mt-0.5 ${valueColor[tone]}`}>{cell.value}</div>
      {cell.delta_label && <div className="text-[10px] text-muted-foreground/65 mt-0.5">{cell.delta_label}</div>}
      {expanded && cell.contributing.length > 0 && (
        <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: DURATION.short, ease: FEATHER_EASE }} className="mt-3 space-y-1 pt-2 border-t border-border/30">
          {cell.contributing.map((c, i) => (
            <li key={i} className="text-[10.5px] text-muted-foreground/80 flex items-start gap-1.5">
              <span className="text-cyan-400/60 mt-0.5">·</span><span>{c}</span>
            </li>
          ))}
        </motion.ul>
      )}
    </motion.button>
  );
}

function DeltaArrow({ delta }: { delta: number }) {
  if (delta > 0) return <span className="text-[10px] text-emerald-400 flex items-center gap-0.5"><TrendingUp className="h-2.5 w-2.5" />+{delta.toFixed(1)}</span>;
  if (delta < 0) return <span className="text-[10px] text-rose-400 flex items-center gap-0.5"><TrendingDown className="h-2.5 w-2.5" />{delta.toFixed(1)}</span>;
  return <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5"><Minus className="h-2.5 w-2.5" />0</span>;
}

function pickToneForCell(cell: ScorecardCellClient): 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate' {
  if (cell.key === 'health') {
    if (cell.numeric_value >= 8) return 'emerald';
    if (cell.numeric_value >= 5) return 'cyan';
    if (cell.numeric_value >= 3) return 'amber';
    return 'rose';
  }
  if (cell.key === 'velocity') return cell.numeric_value >= 3 ? 'emerald' : cell.numeric_value >= 1 ? 'cyan' : 'slate';
  if (cell.key === 'quality')  return cell.numeric_value >= 80 ? 'emerald' : cell.numeric_value >= 50 ? 'amber' : 'rose';
  if (cell.key === 'risk') {
    if (cell.numeric_value >= 8) return 'rose';
    if (cell.numeric_value >= 4) return 'amber';
    if (cell.numeric_value >= 1) return 'cyan';
    return 'emerald';
  }
  if (cell.key === 'roi_hint') return cell.numeric_value >= 5 ? 'emerald' : cell.numeric_value >= 1 ? 'cyan' : 'slate';
  return 'slate';
}

/* ════════════════════════════════════════════════════════════════════
   PERFORMANCE PULSE PANEL
══════════════════════════════════════════════════════════════════════ */

function PerformancePulsePanel({ pulse, loading, onLaunchCommand }: {
  pulse: PerformancePulseClient | null;
  loading: boolean;
  onLaunchCommand: (cmd: string) => void;
}) {
  return (
    <section>
      <SectionHeader
        icon={<BarChart3 className="h-3.5 w-3.5" />}
        tone="emerald"
        label="Performance pulse"
        sublabel={pulse ? `${pulse.source_label}${pulse.source_refreshed ? ` · ${relTime(pulse.source_refreshed)}` : ''}` : 'top performers + movers'} />
      {loading && !pulse ? (
        <LoadingCard label="Reading GSC performance…" />
      ) : !pulse || (pulse.top_performers.length + pulse.rising_stars.length + pulse.falling_stars.length === 0) ? (
        <EmptyCard text="No performance data yet. Connect GSC + GA4, then run compute analytics intelligence." />
      ) : (
        <motion.div variants={cascadeContainerVariants} initial="hidden" animate="visible" className="mt-3 space-y-3">
          {pulse.top_performers.length > 0 && (
            <PulseGroup title="Top performers" tone="emerald" items={pulse.top_performers} onClick={(q) => onLaunchCommand(`show the 28-day trajectory for "${q}"`)} />
          )}
          {pulse.rising_stars.length > 0 && (
            <PulseGroup title="Rising stars" tone="emerald-dim" items={pulse.rising_stars} onClick={(q) => onLaunchCommand(`show the 28-day trajectory for "${q}"`)} />
          )}
          {pulse.falling_stars.length > 0 && (
            <PulseGroup title="Falling stars" tone="rose" items={pulse.falling_stars} onClick={(q) => onLaunchCommand(`what happened to "${q}" — diagnose the position drop`)} />
          )}
        </motion.div>
      )}
    </section>
  );
}

function PulseGroup({ title, tone, items, onClick }: {
  title: string;
  tone: 'emerald' | 'emerald-dim' | 'rose';
  items: any[];
  onClick: (query: string) => void;
}) {
  const headerClass = tone === 'rose' ? 'text-rose-400' : tone === 'emerald-dim' ? 'text-emerald-400/80' : 'text-emerald-400';
  return (
    <motion.div variants={cascadeItemVariants} className="rounded-xl border border-border/40 bg-card/30 p-3">
      <div className={`text-[10px] uppercase tracking-wider font-bold ${headerClass} mb-2`}>{title}</div>
      <div className="space-y-1">
        {items.map((it, i) => (
          <button key={i} onClick={() => onClick(it.query)} className="w-full text-left flex items-center justify-between gap-2 py-1 px-1.5 -mx-1.5 rounded-md hover:bg-card/60 transition-colors group">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-foreground/95 truncate">"{it.query}"</div>
              <div className="text-[9px] text-muted-foreground/65">
                pos {Number(it.current_position || 0).toFixed(1)} · {it.impressions} imp · {it.clicks} clicks
              </div>
            </div>
            {it.delta != null && (
              <div className={`text-[10px] font-bold flex items-center gap-0.5 shrink-0 ${
                it.trend === 'rising' ? 'text-emerald-400' : it.trend === 'falling' ? 'text-rose-400' : 'text-muted-foreground/65'
              }`}>
                {it.trend === 'rising' && <ArrowUp className="h-2.5 w-2.5" />}
                {it.trend === 'falling' && <ArrowDown className="h-2.5 w-2.5" />}
                {Math.abs(Number(it.delta)).toFixed(0)}
              </div>
            )}
            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/35 group-hover:text-foreground/60 shrink-0" />
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PILLAR HEALTH MATRIX
══════════════════════════════════════════════════════════════════════ */

function PillarHealthMatrixPanel({ cards, loading, onNavigate }: {
  cards: PillarHealthCardClient[];
  loading: boolean;
  onNavigate?: (path: string) => void;
}) {
  return (
    <section>
      <SectionHeader
        icon={<FileCheck className="h-3.5 w-3.5" />}
        tone="violet"
        label="Pillar health"
        sublabel="6 pillars · last run · findings · click any to open" />
      {loading && cards.length === 0 ? (
        <LoadingCard label="Reading pillar reports…" />
      ) : cards.length === 0 ? (
        <EmptyCard text="No pillar data yet. Launch a campaign and the pillars will run." />
      ) : (
        <motion.div variants={cascadeContainerVariants} initial="hidden" animate="visible" className="mt-3 grid grid-cols-2 gap-2">
          {cards.map(card => (
            <PillarCard key={card.kind} card={card} onClick={() => {
              if (onNavigate) onNavigate(card.action_path);
              else window.location.assign(card.action_path);
            }} />
          ))}
        </motion.div>
      )}
    </section>
  );
}

function PillarCard({ card, onClick }: { card: PillarHealthCardClient; onClick: () => void }) {
  const statusIcon: Record<string, React.ReactNode> = {
    fresh:     <CheckCircle2 className="h-3 w-3 text-emerald-400" />,
    aging:     <Clock className="h-3 w-3 text-amber-400" />,
    overdue:   <AlertTriangle className="h-3 w-3 text-amber-400" />,
    failed:    <XCircle className="h-3 w-3 text-rose-400" />,
    never_run: <Clock className="h-3 w-3 text-muted-foreground/50" />,
  };
  const borderClass: Record<string, string> = {
    fresh:     'border-emerald-500/25 bg-emerald-500/[0.03] hover:border-emerald-500/40',
    aging:     'border-amber-500/25 bg-amber-500/[0.03] hover:border-amber-500/40',
    overdue:   'border-amber-500/35 bg-amber-500/[0.05] hover:border-amber-500/50',
    failed:    'border-rose-500/35 bg-rose-500/[0.05] hover:border-rose-500/50',
    never_run: 'border-border/40 bg-card/30 hover:border-border/70',
  };
  return (
    <motion.button variants={cascadeItemVariants} whileHover={{ scale: 1.01 }} transition={{ duration: DURATION.hover, ease: FEATHER_EASE }} onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-colors ${borderClass[card.status]}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-[11px] font-bold text-foreground/95">{card.label}</div>
        {statusIcon[card.status]}
      </div>
      <div className="text-[9.5px] text-muted-foreground/70">
        {card.last_run_relative ? `Last run ${card.last_run_relative}` : 'Never run'}
        {card.next_recheck_label && card.status === 'overdue' && <span className="text-amber-400"> · overdue {card.next_recheck_label}</span>}
        {card.next_recheck_label && card.status !== 'overdue' && <span> · next {card.next_recheck_label}</span>}
      </div>
      {(card.critical_findings + card.warning_findings + card.info_findings > 0) && (
        <div className="mt-2 flex items-center gap-1.5 text-[9px]">
          {card.critical_findings > 0 && <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 font-bold">{card.critical_findings} critical</span>}
          {card.warning_findings > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">{card.warning_findings} warning</span>}
          {card.info_findings > 0 && <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400/80 font-bold">{card.info_findings} info</span>}
        </div>
      )}
    </motion.button>
  );
}

/* ════════════════════════════════════════════════════════════════════
   I NOTICED
══════════════════════════════════════════════════════════════════════ */

function INoticedPanel({ observations, loading, onLaunchCommand }: {
  observations: NoticedObservationClient[];
  loading: boolean;
  onLaunchCommand: (cmd: string) => void;
}) {
  return (
    <section>
      <SectionHeader
        icon={<Eye className="h-3.5 w-3.5" />}
        tone="amber"
        label="I noticed"
        sublabel={loading ? 'reading the data…' : observations.length > 0 ? 'quiet observations grounded in your project' : 'nothing worth flagging right now'} />
      {loading && observations.length === 0 ? (
        <LoadingCard label="Looking for things to mention…" />
      ) : observations.length === 0 ? (
        <EmptyCard text="Nothing concerning right now. Calm day." />
      ) : (
        <motion.div variants={cascadeContainerVariants} initial="hidden" animate="visible" className="mt-3 space-y-2">
          {observations.map(o => (
            <motion.div key={o.id} variants={cascadeItemVariants} className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-3">
              <div className="text-[12.5px] text-foreground/90 leading-relaxed italic">{o.observation}</div>
              {o.reasoning && <div className="text-[10px] text-muted-foreground/65 mt-1">{o.reasoning}</div>}
              {o.suggested_action && (
                <button onClick={() => onLaunchCommand(o.suggested_action!)} className="mt-2 text-[10px] px-2 py-1 rounded-md border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-colors font-bold flex items-center gap-1">
                  {o.suggested_action} <ArrowRight className="h-2.5 w-2.5" />
                </button>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DECISIONS LOG
══════════════════════════════════════════════════════════════════════ */

function DecisionsLogPanel({ entries, total, loading }: {
  entries: DecisionLogEntryClient[];
  total: number;
  loading: boolean;
}) {
  return (
    <section>
      <SectionHeader
        icon={<Sparkles className="h-3.5 w-3.5" />}
        tone="cyan"
        label="Decisions log"
        sublabel={loading ? 'reading the log…' : total > 0 ? `${total} decision${total === 1 ? '' : 's'} protected across your campaigns` : 'no decisions logged yet'} />
      {loading && entries.length === 0 ? (
        <LoadingCard label="Reading campaigns…" />
      ) : entries.length === 0 ? (
        <EmptyCard text="System hasn't protected against any decisions yet — that surfaces as campaigns are committed." />
      ) : (
        <motion.div variants={cascadeContainerVariants} initial="hidden" animate="visible" className="mt-3 space-y-2">
          {entries.map(e => (
            <motion.div key={e.id} variants={cascadeItemVariants} className="rounded-xl border border-border/40 bg-card/30 p-3">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <div className="text-[10px] uppercase tracking-wider font-bold text-cyan-400">
                  {humanDecisionType(e.decision_type)}
                </div>
                <div className="text-[9px] text-muted-foreground/55">{relTime(e.timestamp)}</div>
              </div>
              <div className="text-[11px] text-foreground/90 leading-relaxed">
                <span className="text-muted-foreground/80">Original intent:</span> {e.original_intent}
              </div>
              {e.redirected_to && (
                <div className="text-[11px] text-foreground/90 leading-relaxed mt-0.5">
                  <span className="text-emerald-400/80">→ Redirected to:</span> {e.redirected_to}
                </div>
              )}
              {e.reasoning && <div className="text-[10px] text-muted-foreground/70 italic mt-1">{e.reasoning}</div>}
              {e.campaign_keyword && (
                <div className="text-[9px] text-muted-foreground/50 mt-1.5">on campaign "{e.campaign_keyword}"</div>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}

function humanDecisionType(t: string): string {
  const map: Record<string, string> = {
    duplicate_prevented:         'Duplicate prevented',
    redirected_to_better_target: 'Redirected to better target',
    bad_keyword_blocked:         'Bad keyword blocked',
    misalignment_warned:         'Misalignment warned',
  };
  return map[t] || t.replace(/_/g, ' ');
}

/* ════════════════════════════════════════════════════════════════════
   VELOCITY
══════════════════════════════════════════════════════════════════════ */

function VelocityPanel({ stats, loading }: { stats: VelocityStatsClient | null; loading: boolean }) {
  return (
    <section>
      <SectionHeader
        icon={<Timer className="h-3.5 w-3.5" />}
        tone="slate"
        label="Velocity"
        sublabel={loading ? 'counting work shipped…' : 'this week vs last'} />
      {loading && !stats ? (
        <LoadingCard label="Counting work shipped…" />
      ) : !stats ? (
        <EmptyCard text="Velocity data unavailable." />
      ) : (
        <motion.div variants={cascadeContainerVariants} initial="hidden" animate="visible" className="mt-3 grid grid-cols-2 gap-2">
          <VelocityCell label="Campaigns updated" thisWeek={stats.this_week.campaigns_updated} delta={stats.deltas.campaigns_updated} />
          <VelocityCell label="Pillar runs" thisWeek={stats.this_week.pillar_runs} delta={stats.deltas.pillar_runs} />
          <VelocityCell label="New opportunities" thisWeek={stats.this_week.opportunities_open} delta={stats.deltas.opportunities_open} />
          <VelocityCell label="Decisions protected" thisWeek={stats.this_week.decisions_avoided} delta={stats.deltas.decisions_avoided} />
        </motion.div>
      )}
    </section>
  );
}

function VelocityCell({ label, thisWeek, delta }: { label: string; thisWeek: number; delta: number }) {
  return (
    <motion.div variants={cascadeItemVariants} className="rounded-xl border border-border/40 bg-card/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/65 font-bold">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <div className="text-xl font-bold text-foreground/95">{thisWeek}</div>
        <DeltaArrow delta={delta} />
      </div>
      <div className="text-[9px] text-muted-foreground/55">last 7 days</div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SHARED
══════════════════════════════════════════════════════════════════════ */

function SectionHeader({ icon, tone, label, sublabel }: {
  icon: React.ReactNode; tone: 'cyan' | 'violet' | 'amber' | 'rose' | 'emerald' | 'slate';
  label: string; sublabel: string;
}) {
  const colorClass: Record<string, string> = {
    cyan: 'text-cyan-400', violet: 'text-violet-400', amber: 'text-amber-400',
    rose: 'text-rose-400', emerald: 'text-emerald-400', slate: 'text-slate-300',
  };
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <div className={`text-[10px] uppercase tracking-[0.18em] font-bold ${colorClass[tone]} flex items-center gap-1.5`}>
        {icon} {label}
      </div>
      <div className="text-[10px] text-muted-foreground/65 truncate">{sublabel}</div>
    </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="mt-3 rounded-xl border border-border/40 bg-card/30 p-5 text-center text-xs text-muted-foreground/60">
      <Activity className="h-4 w-4 mx-auto mb-2 animate-pulse text-cyan-400" />
      {label}
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-xl border border-border/30 bg-card/15 p-4 text-center text-[11px] text-muted-foreground/55 italic">
      {text}
    </div>
  );
}

function relTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60); if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);  if (hr < 24)  return `${hr}h ago`;
    const d = Math.floor(hr / 24);    if (d < 30)   return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}
