/* ════════════════════════════════════════════════════════════════════
   src/components/season/ActionDeck.tsx
   Phase 21 — Block 2.11 Phase A — Pro mode LEFT column

   The "things to do" stack. Top-to-bottom:
     1. ⚡ Unified priority feed (the v2 feed from season-war-room.ts)
     2. 🧭 Strategic intelligence — handoff to the existing WarRoomSection
        (grounded/exploratory/locked tiers) for now

   Sections 2-4 (recoverable opps, campaigns in motion, inbox) are already
   represented inside the WarRoomSection — Phase A doesn't duplicate them.
   Phase B will split them out as dedicated dense panels.

   Every row click either fires a chat command, navigates, opens the inbox,
   or reruns a pillar — via onLaunchCommand / onAction props.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import {
  Zap, ArrowRight, TrendingUp, AlertTriangle, Inbox,
  Briefcase, RotateCcw, Activity, Sparkles, Award,
} from 'lucide-react';
import WarRoomSection from './WarRoomSection';
import type { UnifiedPriorityItemClient } from '@/components/pm/api';
import { cascadeContainerVariants, cascadeItemVariants, DURATION, FEATHER_EASE } from './warRoomAnimations';

interface Props {
  projectId:        string | null;
  unifiedFeed:      UnifiedPriorityItemClient[];
  loading:          boolean;
  filterTerm?:      string;
  onLaunchCommand:  (cmd: string) => void;
  onNavigate?:      (path: string) => void;
  onRerunPillar?:   (payload: any) => void;
  onOpenInbox?:     (payload: any) => void;
  /* Phase 21 Block 2.14 — widget ordering for LEFT column */
  widgetOrder?:     string[];
  hiddenWidgets?:   string[];
}

export default function ActionDeck({
  projectId, unifiedFeed, loading, filterTerm,
  onLaunchCommand, onNavigate, onRerunPillar, onOpenInbox,
  widgetOrder, hiddenWidgets,
}: Props) {
  if (!projectId) return null;

  function handleAction(item: UnifiedPriorityItemClient) {
    switch (item.action.kind) {
      case 'chat_command':
        onLaunchCommand(item.action.payload as string);
        break;
      case 'navigate':
        if (onNavigate) onNavigate(item.action.payload as string);
        else window.location.assign(item.action.payload as string);
        break;
      case 'rerun_pillar':
        if (onRerunPillar) onRerunPillar(item.action.payload);
        break;
      case 'open_inbox':
        if (onOpenInbox) onOpenInbox(item.action.payload);
        else window.location.assign('/launchpad');
        break;
    }
  }

  /* Phase 21 Block 2.14 — define widget render map; iterate in user's order */
  const widgetNodes: Record<string, React.ReactNode> = {
    pro_priority_feed: (
      <section>
        <SectionHeader
          icon={<Zap className="h-3.5 w-3.5" />}
          tone="cyan"
          label="What needs you this week"
          sublabel={loading
            ? 'computing priorities…'
            : `${unifiedFeed.length} priorit${unifiedFeed.length === 1 ? 'y' : 'ies'} · synthesized from blockers, pillars, GSC, GA4, inbox`} />

        {loading && unifiedFeed.length === 0 && (
          <div className="mt-3 rounded-xl border border-border/40 bg-card/30 p-6 text-center text-xs text-muted-foreground/60">
            <Activity className="h-4 w-4 mx-auto mb-2 animate-pulse text-cyan-400" />
            Aggregating from 9 sources…
          </div>
        )}

        {!loading && unifiedFeed.length === 0 && (
          <div className="mt-2 text-[11px] text-muted-foreground/55 italic px-1">
            Nothing urgent surfaced — calm day. See strategic intelligence below.
          </div>
        )}

        {unifiedFeed.length > 0 && (
          <motion.div
            variants={cascadeContainerVariants}
            initial="hidden"
            animate="visible"
            className="mt-3 space-y-2">
            {unifiedFeed.map((item, i) => (
              <PriorityRow
                key={item.id}
                item={item}
                index={i + 1}
                onAction={() => handleAction(item)}
              />
            ))}
          </motion.div>
        )}
      </section>
    ),
    pro_strategic_intel: (
      <WarRoomSection
        projectId={projectId}
        filterTerm={filterTerm}
        onLaunchCommand={onLaunchCommand}
      />
    ),
  };

  const defaultOrder = ['pro_priority_feed', 'pro_strategic_intel'];
  const order = Array.isArray(widgetOrder) && widgetOrder.length > 0 ? widgetOrder : defaultOrder;
  const hidden = new Set(hiddenWidgets || []);

  return (
    <div className="space-y-5">
      {order.map(id => {
        if (hidden.has(id)) return null;
        const node = widgetNodes[id];
        if (!node) return null;
        return <div key={id}>{node}</div>;
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PRESENTATIONAL
══════════════════════════════════════════════════════════════════════ */

function SectionHeader({ icon, tone, label, sublabel }: {
  icon:     React.ReactNode;
  tone:     'cyan' | 'violet' | 'amber' | 'emerald';
  label:    string;
  sublabel: string;
}) {
  const colorClass: Record<string, string> = {
    cyan:    'text-cyan-400',
    violet:  'text-violet-400',
    amber:   'text-amber-400',
    emerald: 'text-emerald-400',
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

function PriorityRow({ item, index, onAction }: {
  item:     UnifiedPriorityItemClient;
  index:    number;
  onAction: () => void;
}) {
  const sevClass: Record<string, string> = {
    critical:  'border-rose-500/40 bg-rose-500/[0.05] hover:bg-rose-500/[0.08]',
    warning:   'border-amber-500/30 bg-amber-500/[0.04] hover:bg-amber-500/[0.07]',
    info:      'border-border/60 bg-card/30 hover:bg-card/50',
    celebrate: 'border-emerald-500/30 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.07]',
  };
  const indexClass: Record<string, string> = {
    critical:  'text-rose-400 bg-rose-500/15',
    warning:   'text-amber-400 bg-amber-500/15',
    info:      'text-cyan-400 bg-cyan-500/15',
    celebrate: 'text-emerald-400 bg-emerald-500/15',
  };
  const buttonClass: Record<string, string> = {
    critical:  'border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25',
    warning:   'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25',
    info:      'border-cyan-500/30 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25',
    celebrate: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25',
  };
  const categoryIcon = pickCategoryIcon(item.category);

  return (
    <motion.div
      variants={cascadeItemVariants}
      whileHover={{ scale: 1.005 }}
      transition={{ duration: DURATION.hover, ease: FEATHER_EASE }}
      className={`rounded-xl border px-4 py-3 transition-colors ${sevClass[item.severity]}`}>
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${indexClass[item.severity]}`}>
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <span className={`shrink-0 mt-0.5 ${indexClass[item.severity]} px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold flex items-center gap-1`}>
              {categoryIcon}
              {humanCategory(item.category)}
            </span>
            <div className="text-sm font-semibold text-foreground/95 leading-tight">
              {item.title}
            </div>
          </div>
          {item.detail && (
            <div className="text-[12px] text-muted-foreground/85 mt-1 leading-relaxed">
              {item.detail}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground/55 mt-1.5 truncate">
            Source: {item.source.label}{item.source.last_refresh ? ` · refreshed ${formatShort(item.source.last_refresh)}` : ''}
          </div>
        </div>
        <button
          onClick={onAction}
          className={`shrink-0 text-[11px] px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1 transition-colors ${buttonClass[item.severity]}`}>
          {item.action.label} <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </motion.div>
  );
}

function pickCategoryIcon(c: string): React.ReactNode {
  switch (c) {
    case 'pm':          return <Briefcase className="h-2.5 w-2.5" />;
    case 'pillar':      return <RotateCcw className="h-2.5 w-2.5" />;
    case 'gsc':         return <TrendingUp className="h-2.5 w-2.5" />;
    case 'ga4':         return <Activity className="h-2.5 w-2.5" />;
    case 'inbox':       return <Inbox className="h-2.5 w-2.5" />;
    case 'integration': return <AlertTriangle className="h-2.5 w-2.5" />;
    case 'campaign':    return <Award className="h-2.5 w-2.5" />;
    default:            return null;
  }
}

function humanCategory(c: string): string {
  const map: Record<string, string> = {
    pm:          'PM',
    pillar:      'PILLAR',
    gsc:         'GSC',
    ga4:         'GA4',
    inbox:       'INBOX',
    integration: 'INTEGRATION',
    campaign:    'CAMPAIGN',
  };
  return map[c] || c.toUpperCase();
}

function formatShort(iso?: string | null): string {
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
