/* ════════════════════════════════════════════════════════════════════
   src/components/season/ProjectPulse.tsx
   Phase 21 — Block 2.11 Phase A — Pro mode RIGHT column

   "Things to know" column. At-a-glance project state.

   Phase A surfaces:
     1. 🎯 Health scorecard — LIVE (5 cells with deltas + contributing)
     2. 📈 Performance pulse  — placeholder (Phase B)
     3. 📊 Pillar health matrix — placeholder (Phase B)
     4. 🧾 Decisions log — placeholder (Phase B)
     5. 🔍 Things the client might ask — placeholder (Phase B LLM pre-compute)
     6. 👁️ I noticed — placeholder (Phase B LLM pre-compute)
     7. ⏱️ Velocity — derived from scorecard for now, dedicated panel in B
     8. 📨 Client recap — placeholder (Phase C)

   Each placeholder shows the planned visual structure so the operator
   sees what's coming next.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import {
  Activity, BarChart3, FileCheck, MessageCircleQuestion,
  Eye, Timer, FileText, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import type { ScorecardCellClient } from '@/components/pm/api';
import { cascadeContainerVariants, cascadeItemVariants, DURATION, FEATHER_EASE } from './warRoomAnimations';
import { useState } from 'react';

interface Props {
  scorecard:  ScorecardCellClient[];
  loading:    boolean;
}

export default function ProjectPulse({ scorecard, loading }: Props) {
  return (
    <div className="space-y-5">
      {/* SECTION 1 — Scorecard (LIVE) */}
      <Scorecard cells={scorecard} loading={loading} />

      {/* Phase B placeholders — show planned structure so operator sees what's coming */}
      <ComingSection
        icon={<BarChart3 className="h-3.5 w-3.5" />}
        tone="emerald"
        label="Performance pulse"
        sublabel="28-day position trajectories · top performers + falling stars"
        when="Phase B" />

      <ComingSection
        icon={<FileCheck className="h-3.5 w-3.5" />}
        tone="violet"
        label="Pillar health matrix"
        sublabel="6 pillars · last run · findings · next recheck · click-to-rerun"
        when="Phase B" />

      <ComingSection
        icon={<MessageCircleQuestion className="h-3.5 w-3.5" />}
        tone="amber"
        label="Things the client might ask"
        sublabel="LLM-pre-computed · 3 grounded questions with answers ready"
        when="Phase B"
        countHint="3 questions ready" />

      <ComingSection
        icon={<Eye className="h-3.5 w-3.5" />}
        tone="rose"
        label="I noticed"
        sublabel="LLM-pre-computed · senior strategist's quiet observations"
        when="Phase B"
        countHint="2 observations" />

      <ComingSection
        icon={<Activity className="h-3.5 w-3.5" />}
        tone="cyan"
        label="Decisions log"
        sublabel="cross-campaign decisions_avoided · credibility scorecard"
        when="Phase B" />

      <ComingSection
        icon={<Timer className="h-3.5 w-3.5" />}
        tone="slate"
        label="Velocity stats"
        sublabel="this week vs last · campaigns · pillar runs · LLM spend"
        when="Phase B" />

      <ComingSection
        icon={<FileText className="h-3.5 w-3.5" />}
        tone="emerald"
        label="Client recap"
        sublabel="auto-drafted weekly summary · copy as email · export PDF"
        when="Phase C" />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SCORECARD
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
        <div className="mt-3 rounded-xl border border-border/40 bg-card/30 p-6 text-center text-xs text-muted-foreground/60">
          <Activity className="h-4 w-4 mx-auto mb-2 animate-pulse text-cyan-400" />
          Computing project vitals…
        </div>
      ) : (
        <motion.div
          variants={cascadeContainerVariants}
          initial="hidden"
          animate="visible"
          className="mt-3 grid grid-cols-2 gap-2">
          {cells.map(cell => (
            <ScorecardCell
              key={cell.key}
              cell={cell}
              expanded={expandedKey === cell.key}
              onToggle={() => setExpandedKey(expandedKey === cell.key ? null : cell.key)}
            />
          ))}
        </motion.div>
      )}
    </section>
  );
}

function ScorecardCell({ cell, expanded, onToggle }: {
  cell:     ScorecardCellClient;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tone = pickToneForCell(cell);
  const toneClass: Record<string, string> = {
    cyan:    'border-cyan-500/25 bg-cyan-500/[0.04] hover:border-cyan-500/45',
    emerald: 'border-emerald-500/25 bg-emerald-500/[0.04] hover:border-emerald-500/45',
    amber:   'border-amber-500/25 bg-amber-500/[0.04] hover:border-amber-500/45',
    rose:    'border-rose-500/25 bg-rose-500/[0.04] hover:border-rose-500/45',
    slate:   'border-slate-500/25 bg-slate-500/[0.04] hover:border-slate-500/45',
  };
  const valueColor: Record<string, string> = {
    cyan:    'text-cyan-300',
    emerald: 'text-emerald-300',
    amber:   'text-amber-300',
    rose:    'text-rose-300',
    slate:   'text-slate-200',
  };
  return (
    <motion.button
      variants={cascadeItemVariants}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: DURATION.hover, ease: FEATHER_EASE }}
      onClick={onToggle}
      className={`rounded-xl border p-3 text-left transition-colors ${toneClass[tone]} ${expanded ? 'col-span-2' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/75 font-bold">{cell.label}</div>
        {cell.delta_this_week != null && <DeltaArrow delta={cell.delta_this_week} />}
      </div>
      <div className={`text-2xl font-bold mt-0.5 ${valueColor[tone]}`}>{cell.value}</div>
      {cell.delta_label && (
        <div className="text-[10px] text-muted-foreground/65 mt-0.5">{cell.delta_label}</div>
      )}
      {expanded && cell.contributing.length > 0 && (
        <motion.ul
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: DURATION.short, ease: FEATHER_EASE }}
          className="mt-3 space-y-1 pt-2 border-t border-border/30">
          {cell.contributing.map((c, i) => (
            <li key={i} className="text-[10.5px] text-muted-foreground/80 flex items-start gap-1.5">
              <span className="text-cyan-400/60 mt-0.5">·</span>
              <span>{c}</span>
            </li>
          ))}
        </motion.ul>
      )}
    </motion.button>
  );
}

function DeltaArrow({ delta }: { delta: number }) {
  if (delta > 0)  return <span className="text-[10px] text-emerald-400 flex items-center gap-0.5"><TrendingUp className="h-2.5 w-2.5" />+{delta.toFixed(1)}</span>;
  if (delta < 0)  return <span className="text-[10px] text-rose-400 flex items-center gap-0.5"><TrendingDown className="h-2.5 w-2.5" />{delta.toFixed(1)}</span>;
  return <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5"><Minus className="h-2.5 w-2.5" />0</span>;
}

function pickToneForCell(cell: ScorecardCellClient): 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate' {
  if (cell.key === 'health') {
    if (cell.numeric_value >= 8)   return 'emerald';
    if (cell.numeric_value >= 5)   return 'cyan';
    if (cell.numeric_value >= 3)   return 'amber';
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
   COMING SECTION (Phase B/C placeholder)
══════════════════════════════════════════════════════════════════════ */

function ComingSection({ icon, tone, label, sublabel, when, countHint }: {
  icon:      React.ReactNode;
  tone:      'cyan' | 'violet' | 'amber' | 'rose' | 'emerald' | 'slate';
  label:     string;
  sublabel:  string;
  when:      string;
  countHint?: string;
}) {
  const colorClass: Record<string, string> = {
    cyan:    'text-cyan-400',
    violet:  'text-violet-400',
    amber:   'text-amber-400',
    rose:    'text-rose-400',
    emerald: 'text-emerald-400',
    slate:   'text-slate-300',
  };
  return (
    <section>
      <SectionHeader icon={icon} tone={tone} label={label} sublabel={sublabel} />
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.major, ease: FEATHER_EASE }}
        className="mt-3 rounded-xl border border-dashed border-border/50 bg-card/20 p-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground/70 italic">
            {countHint || 'Coming in ' + when}
          </div>
          <span className={`text-[9px] uppercase tracking-wider font-bold ${colorClass[tone]} px-2 py-0.5 rounded-full bg-card/60 border border-border/40`}>
            {when}
          </span>
        </div>
      </motion.div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SHARED
══════════════════════════════════════════════════════════════════════ */

function SectionHeader({ icon, tone, label, sublabel }: {
  icon:     React.ReactNode;
  tone:     'cyan' | 'violet' | 'amber' | 'rose' | 'emerald' | 'slate';
  label:    string;
  sublabel: string;
}) {
  const colorClass: Record<string, string> = {
    cyan:    'text-cyan-400',
    violet:  'text-violet-400',
    amber:   'text-amber-400',
    rose:    'text-rose-400',
    emerald: 'text-emerald-400',
    slate:   'text-slate-300',
  };
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <div className={`text-[10px] uppercase tracking-[0.18em] font-bold ${colorClass[tone]} flex items-center gap-1.5`}>
        {icon}
        {label}
      </div>
      <div className="text-[10px] text-muted-foreground/65">{sublabel}</div>
    </div>
  );
}
