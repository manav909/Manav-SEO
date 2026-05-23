/* ════════════════════════════════════════════════════════════════════
   src/components/season/StatusStrip.tsx
   Phase 21 — Block 2.12 — Pro mode status strip

   The cockpit row at the top. Always visible in Pro mode. Shows:
     • GSC freshness
     • GA4 freshness
     • Positioning resolved?
     • Last pillar run
     • This week's activity (campaigns + pillar runs)

   Each cell color-coded fresh/aging/stale/disconnected.
   Click any cell → fires a chat command to drill in.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import {
  Database, BarChart3, Compass, Activity, Zap, RefreshCw, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { cascadeContainerVariants, cascadeItemVariants, DURATION, FEATHER_EASE } from './warRoomAnimations';
import type { WarRoomBriefingV2Client } from '@/components/pm/api';

interface Props {
  briefing:        WarRoomBriefingV2Client | null;
  loading:         boolean;
  onLaunchCommand: (cmd: string) => void;
  onNavigate?:     (path: string) => void;
}

type CellTone = 'fresh' | 'aging' | 'stale' | 'disconnected' | 'unknown';

interface CellSpec {
  key:        string;
  icon:       React.ReactNode;
  label:      string;
  value:      string;
  tone:       CellTone;
  hint?:      string;
  onClick:    () => void;
}

export default function StatusStrip({ briefing, loading, onLaunchCommand, onNavigate }: Props) {
  if (loading && !briefing) {
    return (
      <div className="mt-6 rounded-xl border border-border/30 bg-card/30 p-3 flex items-center gap-3">
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-400/70" />
        <div className="text-[10px] text-muted-foreground/65 italic">Polling vitals…</div>
      </div>
    );
  }
  if (!briefing) return null;

  const tools = briefing.tools_status;
  const cells: CellSpec[] = [
    {
      key:   'gsc',
      icon:  <Database className="h-3 w-3" />,
      label: 'GSC',
      value: tools.gsc_connected
        ? (tools.gsc_last_refresh ? relativeShort(tools.gsc_last_refresh) : 'connected')
        : 'not connected',
      tone:  classifyFreshness(tools.gsc_connected, tools.gsc_last_refresh),
      hint:  tools.gsc_connected ? 'Search Console data feed' : 'connect in Data Room',
      onClick: () => { if (onNavigate) onNavigate('/data-room'); else window.location.assign('/data-room'); },
    },
    {
      key:   'ga4',
      icon:  <BarChart3 className="h-3 w-3" />,
      label: 'GA4',
      value: tools.ga4_connected
        ? (tools.ga4_last_refresh ? relativeShort(tools.ga4_last_refresh) : 'connected')
        : 'not connected',
      tone:  classifyFreshness(tools.ga4_connected, tools.ga4_last_refresh),
      hint:  tools.ga4_connected ? 'Analytics data feed' : 'connect in Data Room',
      onClick: () => { if (onNavigate) onNavigate('/data-room'); else window.location.assign('/data-room'); },
    },
    {
      key:   'positioning',
      icon:  <Compass className="h-3 w-3" />,
      label: 'Positioning',
      value: tools.positioning_resolved
        ? (tools.positioning_last_refresh ? relativeShort(tools.positioning_last_refresh) : 'resolved')
        : 'not resolved',
      tone:  tools.positioning_resolved ? 'fresh' : 'disconnected',
      hint:  tools.positioning_resolved ? 'project context loaded' : 'launches with first campaign',
      onClick: () => onLaunchCommand('show project positioning'),
    },
    ...buildScorecardCells(briefing, onLaunchCommand),
  ];

  return (
    <motion.div
      variants={cascadeContainerVariants}
      initial="hidden"
      animate="visible"
      className="mt-3 rounded-xl border border-border/40 bg-card/30 backdrop-blur-sm p-1.5 flex items-stretch gap-1 overflow-x-auto">
      {cells.map(cell => <StatusCell key={cell.key} spec={cell} />)}
    </motion.div>
  );
}

function StatusCell({ spec }: { spec: CellSpec }) {
  const toneClass: Record<CellTone, string> = {
    fresh:        'border-emerald-500/25 bg-emerald-500/[0.04] text-emerald-400 hover:bg-emerald-500/[0.08]',
    aging:        'border-amber-500/25 bg-amber-500/[0.04] text-amber-400 hover:bg-amber-500/[0.08]',
    stale:        'border-rose-500/25 bg-rose-500/[0.04] text-rose-400 hover:bg-rose-500/[0.08]',
    disconnected: 'border-slate-500/25 bg-slate-500/[0.03] text-muted-foreground/55 hover:bg-slate-500/[0.05]',
    unknown:      'border-border/40 bg-card/20 text-muted-foreground/65 hover:bg-card/40',
  };
  const iconBgClass: Record<CellTone, string> = {
    fresh:        'bg-emerald-500/10',
    aging:        'bg-amber-500/10',
    stale:        'bg-rose-500/10',
    disconnected: 'bg-slate-500/10',
    unknown:      'bg-card/40',
  };
  return (
    <motion.button
      variants={cascadeItemVariants}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: DURATION.hover, ease: FEATHER_EASE }}
      onClick={spec.onClick}
      title={spec.hint || ''}
      className={`flex-1 min-w-[110px] rounded-lg border px-2.5 py-1.5 text-left transition-colors flex items-center gap-2 ${toneClass[spec.tone]}`}>
      <div className={`shrink-0 w-5 h-5 rounded flex items-center justify-center ${iconBgClass[spec.tone]}`}>
        {spec.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[8.5px] uppercase tracking-wider font-bold opacity-80">{spec.label}</div>
        <div className="text-[10.5px] font-bold truncate">{spec.value}</div>
      </div>
    </motion.button>
  );
}

function buildScorecardCells(briefing: WarRoomBriefingV2Client, onLaunchCommand: (cmd: string) => void): CellSpec[] {
  const cells: CellSpec[] = [];
  const health = briefing.scorecard.find(c => c.key === 'health');
  if (health) {
    cells.push({
      key:   'health',
      icon:  <Activity className="h-3 w-3" />,
      label: 'Health',
      value: health.value,
      tone:  pickHealthTone(health.numeric_value),
      hint:  'project health composite',
      onClick: () => onLaunchCommand('diagnose'),
    });
  }
  const velocity = briefing.scorecard.find(c => c.key === 'velocity');
  if (velocity) {
    cells.push({
      key:   'velocity',
      icon:  <Zap className="h-3 w-3" />,
      label: 'Velocity',
      value: `${velocity.value} this week`,
      tone:  velocity.numeric_value >= 3 ? 'fresh' : velocity.numeric_value >= 1 ? 'aging' : 'disconnected',
      hint:  'campaigns + pillar runs',
      onClick: () => onLaunchCommand('summarize this week'),
    });
  }
  const risk = briefing.scorecard.find(c => c.key === 'risk');
  if (risk) {
    cells.push({
      key:   'risk',
      icon:  <AlertCircle className="h-3 w-3" />,
      label: 'Risk',
      value: risk.value,
      tone:  risk.numeric_value >= 8 ? 'stale' : risk.numeric_value >= 4 ? 'aging' : 'fresh',
      hint:  'warnings + stale data + overdue',
      onClick: () => onLaunchCommand('what needs me today?'),
    });
  }
  return cells;
}

function classifyFreshness(connected: boolean, last: string | null): CellTone {
  if (!connected) return 'disconnected';
  if (!last) return 'unknown';
  const days = (Date.now() - new Date(last).getTime()) / 86400000;
  if (days < 2) return 'fresh';
  if (days < 7) return 'aging';
  return 'stale';
}

function pickHealthTone(n: number): CellTone {
  if (n >= 8) return 'fresh';
  if (n >= 5) return 'aging';
  if (n >= 3) return 'aging';
  return 'stale';
}

function relativeShort(iso: string): string {
  try {
    const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60); if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);  if (hr < 24)  return `${hr}h ago`;
    const d = Math.floor(hr / 24);    if (d < 30)   return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}
