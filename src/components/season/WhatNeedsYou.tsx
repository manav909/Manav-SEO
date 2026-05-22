/* ════════════════════════════════════════════════════════════════════
   src/components/season/WhatNeedsYou.tsx
   Phase 21 — Block 2.7 — Adaptive War Room

   The single hero card at the top of /command that answers the operator's
   morning question: "what should I work on?"

   Synthesizes:
     - Urgent attention items (from briefing.attention)
     - Top 1-2 recoverable opportunities (from war_room.grounded)

   Visual hierarchy: ONE prominent card, primary visual weight on the page.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { Zap, ArrowRight, TrendingUp } from 'lucide-react';
import type { BriefingItemClient, RecoverableOpportunityClient } from '@/components/pm/api';

interface Props {
  attentionItems:    BriefingItemClient[];
  recoverableTop:    RecoverableOpportunityClient[];
  onLaunchCommand?:  (cmd: string) => void;
}

interface UnifiedPriority {
  id:           string;
  kind:         'attention' | 'opportunity';
  severity:     'critical' | 'warning' | 'info';
  title:        string;
  detail?:      string;
  source_label: string;
  action_label: string;
  action_cmd?:  string;          // chat command to fire
  action_url?:  string;          // or URL to navigate
}

function buildPriorities(
  attention: BriefingItemClient[],
  recoverable: RecoverableOpportunityClient[]
): UnifiedPriority[] {
  const out: UnifiedPriority[] = [];

  /* Urgent attention first (sorted by severity) */
  const severityRank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const sortedAttention = [...attention].sort((a: any, b: any) =>
    (severityRank[a.severity || 'info'] ?? 3) - (severityRank[b.severity || 'info'] ?? 3)
  );
  for (const a of sortedAttention.slice(0, 4)) {
    out.push({
      id:           `att-${(a as any).action_id || a.headline}`,
      kind:         'attention',
      severity:     (a.severity === 'success' ? 'info' : a.severity) as any,
      title:        a.headline,
      detail:       a.detail || undefined,
      source_label: a.source || 'System briefing',
      action_label: 'Open',
      action_url:   (a as any).url || undefined,
    });
  }

  /* Top recoverable opportunities — highest-impression first */
  const topOpps = [...recoverable]
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
    .slice(0, 2);
  for (const o of topOpps) {
    out.push({
      id:           `opp-${o.query}`,
      kind:         'opportunity',
      severity:     'warning',
      title:        `Easy win — push "${o.query}" to page 1`,
      detail:       `Currently position ${o.position.toFixed(1)}, ${o.impressions} imp/mo, ${o.clicks} clicks/mo. Recoverable.`,
      source_label: o.source.label + (o.source.last_refresh ? ` · refreshed ${formatShort(o.source.last_refresh)}` : ''),
      action_label: 'Start campaign',
      action_cmd:   `rank me for "${o.query}"`,
    });
  }

  return out;
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

export default function WhatNeedsYou({ attentionItems, recoverableTop, onLaunchCommand }: Props) {
  const priorities = buildPriorities(attentionItems || [], recoverableTop || []);
  if (priorities.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-8 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/[0.06] via-card/40 to-violet-500/[0.04] p-5 md:p-6 shadow-lg shadow-cyan-500/[0.05]">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-cyan-400" />
          <div className="text-xs uppercase tracking-[0.18em] font-bold text-cyan-400">
            What needs you this week
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground/70">
          {priorities.length} priorit{priorities.length === 1 ? 'y' : 'ies'} · synthesized from blockers + opportunities
        </div>
      </div>

      <div className="space-y-2">
        {priorities.map((p, i) => (
          <PriorityRow
            key={p.id}
            priority={p}
            index={i + 1}
            onLaunchCommand={onLaunchCommand}
          />
        ))}
      </div>
    </motion.div>
  );
}

function PriorityRow({ priority, index, onLaunchCommand }: {
  priority: UnifiedPriority;
  index:    number;
  onLaunchCommand?: (cmd: string) => void;
}) {
  const borderClass = priority.severity === 'critical'
    ? 'border-rose-500/40 bg-rose-500/[0.05]'
    : priority.severity === 'warning'
      ? 'border-amber-500/30 bg-amber-500/[0.04]'
      : 'border-border/60 bg-card/30';
  const indexColor = priority.severity === 'critical'
    ? 'text-rose-400 bg-rose-500/15'
    : priority.severity === 'warning'
      ? 'text-amber-400 bg-amber-500/15'
      : 'text-cyan-400 bg-cyan-500/15';
  const actionDisabled = !priority.action_cmd && !priority.action_url;

  const onAction = () => {
    if (priority.action_cmd && onLaunchCommand) onLaunchCommand(priority.action_cmd);
    else if (priority.action_url) window.location.assign(priority.action_url);
  };

  return (
    <div className={`rounded-xl border px-4 py-3 ${borderClass} transition-colors`}>
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${indexColor}`}>
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            {priority.kind === 'opportunity' && (
              <TrendingUp className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
            )}
            <div className="text-sm font-semibold text-foreground/95 leading-tight">
              {priority.title}
            </div>
          </div>
          {priority.detail && (
            <div className="text-[12px] text-muted-foreground/85 mt-1 leading-relaxed">
              {priority.detail}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground/55 mt-1.5">
            Source: {priority.source_label}
          </div>
        </div>
        <button
          onClick={onAction}
          disabled={actionDisabled}
          className={`shrink-0 text-[11px] px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1 transition-colors ${
            priority.severity === 'critical'
              ? 'border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
              : priority.severity === 'warning'
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25'
          } disabled:opacity-40 disabled:cursor-not-allowed`}>
          {priority.action_label} <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
