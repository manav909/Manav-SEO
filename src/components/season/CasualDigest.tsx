/* ════════════════════════════════════════════════════════════════════
   src/components/season/CasualDigest.tsx
   Phase 21 — Block 2.11 Pass 1 — Casual mode reading surface

   The pre-coffee read. One editorial "Pick of the day" card prominent,
   followed by a compact grid of "In your world this week" items.

   Pass 1 sources items from internal project state only — pillar findings
   reframed as editorial observations, GSC movements as "your trends",
   inbox opportunities as "worth exploring".

   Pass 2 (Block 2.12) will add the external feed: RSS whitelist sources,
   trust-tiered, with snippet + "Continue at source" external links.
   This component's structure is already shaped to receive those later
   without a rewrite.
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles, ArrowRight, ExternalLink, Lightbulb, TrendingUp, TrendingDown, FileCheck,
} from 'lucide-react';
import {
  seoCasualDigest,
  type CasualDigestClient, type CasualDigestItemClient,
} from '@/components/pm/api';
import { cascadeContainerVariants, cascadeItemVariants, DURATION, FEATHER_EASE } from './warRoomAnimations';

interface Props {
  projectId:        string | null;
  onLaunchCommand:  (cmd: string) => void;
  onNavigate?:      (path: string) => void;
}

export default function CasualDigest({ projectId, onLaunchCommand, onNavigate }: Props) {
  const [digest, setDigest]   = useState<CasualDigestClient | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) { setDigest(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const r = await seoCasualDigest({ projectId });
      if (cancelled) return;
      setDigest(r.digest || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  function handleAction(item: CasualDigestItemClient) {
    if (!item.suggested_action) return;
    if (item.suggested_action.kind === 'chat_command') {
      onLaunchCommand(item.suggested_action.payload as string);
    } else if (item.suggested_action.kind === 'navigate') {
      if (onNavigate) onNavigate(item.suggested_action.payload as string);
      else window.location.assign(item.suggested_action.payload as string);
    }
  }

  if (!projectId) return null;
  if (loading && !digest) return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: DURATION.major, ease: FEATHER_EASE }}
      className="mt-10 text-center text-xs text-muted-foreground/55">
      <Sparkles className="h-4 w-4 mx-auto mb-2 animate-pulse text-amber-400/60" />
      Pulling together your reading…
    </motion.div>
  );
  if (!digest || (!digest.pick_of_the_day && digest.in_your_world.length === 0)) return null;

  return (
    <div className="mt-10 space-y-8">
      {/* PICK OF THE DAY — editorial hero card */}
      {digest.pick_of_the_day && (
        <PickOfTheDayCard item={digest.pick_of_the_day} onAction={() => handleAction(digest.pick_of_the_day!)} />
      )}

      {/* IN YOUR WORLD — compact 2-col grid */}
      {digest.in_your_world.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-border/30" />
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-400/80">
              In your world this week
            </div>
            <div className="h-px flex-1 bg-border/30" />
          </div>
          <motion.div
            variants={cascadeContainerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {digest.in_your_world.map(item => (
              <DigestItemCard key={item.id} item={item} onAction={() => handleAction(item)} />
            ))}
          </motion.div>
        </section>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PICK OF THE DAY — large editorial card
══════════════════════════════════════════════════════════════════════ */

function PickOfTheDayCard({ item, onAction }: {
  item:     CasualDigestItemClient;
  onAction: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.major_long, ease: FEATHER_EASE, delay: 0.1 }}
      className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.04] via-card/40 to-violet-500/[0.03] p-6 md:p-7 shadow-xl shadow-amber-500/[0.04]">
      <div className="flex items-baseline gap-2 mb-4">
        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-400">
          The pick of the day
        </div>
        <div className="text-[9px] text-muted-foreground/55 italic ml-auto">
          curated for your project
        </div>
      </div>
      <div className="flex items-start gap-3 mb-3">
        <KindIcon kind={item.kind} large />
        <h2 className="text-xl md:text-2xl font-bold text-foreground/95 leading-tight">
          {item.headline}
        </h2>
      </div>
      <p className="text-sm text-muted-foreground/85 leading-relaxed mb-4">
        {item.body}
      </p>
      <div className="text-[10px] text-muted-foreground/55 italic mb-5">
        Source: {item.source_label}{item.source_refreshed ? ` · ${relTime(item.source_refreshed)}` : ''}
      </div>
      {item.suggested_action && (
        <button
          onClick={onAction}
          className="text-[11px] px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-colors font-bold flex items-center gap-2">
          {item.suggested_action.label}
          {item.suggested_action.kind === 'navigate'
            ? <ExternalLink className="h-3 w-3" />
            : <ArrowRight className="h-3 w-3" />}
        </button>
      )}
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   COMPACT DIGEST CARD — for "In your world this week" grid
══════════════════════════════════════════════════════════════════════ */

function DigestItemCard({ item, onAction }: {
  item:     CasualDigestItemClient;
  onAction: () => void;
}) {
  return (
    <motion.div
      variants={cascadeItemVariants}
      whileHover={{ scale: 1.005 }}
      transition={{ duration: DURATION.hover, ease: FEATHER_EASE }}
      className="rounded-xl border border-border/40 bg-card/30 p-4 hover:bg-card/50 hover:border-border/70 transition-colors">
      <div className="flex items-start gap-2 mb-2">
        <KindIcon kind={item.kind} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-bold text-foreground/95 leading-tight">{item.headline}</h3>
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground/80 leading-relaxed line-clamp-3">{item.body}</p>
      <div className="text-[9.5px] text-muted-foreground/50 mt-2 italic truncate">
        {item.source_label}{item.source_refreshed ? ` · ${relTime(item.source_refreshed)}` : ''}
      </div>
      {item.suggested_action && (
        <button
          onClick={onAction}
          className="mt-3 text-[10px] px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-500/[0.05] text-amber-300 hover:bg-amber-500/15 transition-colors font-bold flex items-center gap-1 w-fit">
          {item.suggested_action.label} <ArrowRight className="h-2.5 w-2.5" />
        </button>
      )}
    </motion.div>
  );
}

function KindIcon({ kind, large }: { kind: string; large?: boolean }) {
  const size = large ? 'h-5 w-5' : 'h-3.5 w-3.5';
  switch (kind) {
    case 'pillar_finding':
      return <FileCheck className={`${size} text-violet-400 shrink-0 mt-1`} />;
    case 'trend':
      return <TrendingUp className={`${size} text-emerald-400 shrink-0 mt-1`} />;
    case 'opportunity':
      return <Lightbulb className={`${size} text-cyan-400 shrink-0 mt-1`} />;
    default:
      return <Sparkles className={`${size} text-amber-400 shrink-0 mt-1`} />;
  }
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
