/* ════════════════════════════════════════════════════════════════════
   src/components/season/ManavsPick.tsx
   Phase 21 — Block 2.12 — Casual mode reading surface (external feed)

   Renders the curated SEO/marketing news feed scored against the
   project's positioning. Two surfaces:
     1. Pick of the Day — editorial hero card
     2. In Your World — compact grid of 5-6 secondary items

   Every item shows: title, snippet (≤40 words, fair use), publisher,
   trust tier badge, published-time, "why this matters for YOU"
   line (LLM-generated, grounded in project context).

   Actions per item: Continue at source (external) · Ask chat · Save · Skip.
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, ExternalLink, MessageSquare, Bookmark, XCircle,
  Newspaper, CheckCircle2, RefreshCw,
} from 'lucide-react';
import {
  seoManavsPick, seoManavsPickAction,
  type ProjectFeedClient, type ManavsPickItemClient,
} from '@/components/pm/api';
import { cascadeContainerVariants, cascadeItemVariants, DURATION, FEATHER_EASE } from './warRoomAnimations';

interface Props {
  projectId:        string | null;
  onLaunchCommand:  (cmd: string) => void;
}

export default function ManavsPick({ projectId, onLaunchCommand }: Props) {
  const [feed, setFeed]               = useState<ProjectFeedClient | null>(null);
  const [loading, setLoading]         = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [actedIds, setActedIds]       = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId) { setFeed(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const r = await seoManavsPick({ projectId });
      if (cancelled) return;
      setFeed(r.feed || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  async function handleRefresh() {
    if (!projectId || refreshing) return;
    setRefreshing(true);
    const r = await seoManavsPick({ projectId, force: true });
    setFeed(r.feed || null);
    setActedIds(new Set());
    setRefreshing(false);
  }

  async function handleAction(item: ManavsPickItemClient, action: 'saved' | 'dismissed' | 'skipped' | 'asked_chat') {
    if (!projectId) return;
    setActedIds(prev => new Set(prev).add(item.id + ':' + action));
    if (action === 'asked_chat') {
      onLaunchCommand(`I read "${item.title}" from ${item.publisher}. Summarize how this affects our project.`);
    }
    seoManavsPickAction({ projectId, feedItemId: item.id, action }).catch(() => { /* swallow */ });
  }

  if (!projectId) return null;

  if (loading && !feed) {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: DURATION.major, ease: FEATHER_EASE }}
        className="mt-10 text-center text-xs text-muted-foreground/55">
        <Newspaper className="h-4 w-4 mx-auto mb-2 animate-pulse text-amber-400/60" />
        Gathering what's worth reading…
      </motion.div>
    );
  }

  if (!feed || (!feed.pick_of_the_day && feed.in_your_world.length === 0)) {
    return (
      <div className="mt-10 rounded-2xl border border-border/30 bg-card/20 p-8 text-center">
        <Newspaper className="h-5 w-5 mx-auto mb-2 text-muted-foreground/40" />
        <div className="text-sm text-muted-foreground/70 italic mb-2">
          No fresh items from the publishers right now.
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-[11px] px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] text-amber-300 hover:bg-amber-500/15 transition-colors font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Pulling…' : 'Try again'}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-8">
      {/* Section header w/ refresh */}
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-400">
            From your world this morning
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh the feed"
          className="text-[10px] text-muted-foreground/55 hover:text-amber-400 flex items-center gap-1 transition-colors disabled:opacity-40">
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'refreshing' : 'refresh'}
        </button>
      </div>

      {/* Pick of the Day */}
      {feed.pick_of_the_day && !actedIds.has(feed.pick_of_the_day.id + ':dismissed') && !actedIds.has(feed.pick_of_the_day.id + ':skipped') && (
        <PickOfTheDayCard
          item={feed.pick_of_the_day}
          actedIds={actedIds}
          onAction={(act) => handleAction(feed.pick_of_the_day!, act)}
        />
      )}

      {/* In Your World grid */}
      {feed.in_your_world.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border/30" />
            <div className="text-[9px] uppercase tracking-[0.18em] font-bold text-muted-foreground/55">
              Also worth a moment
            </div>
            <div className="h-px flex-1 bg-border/30" />
          </div>
          <motion.div
            variants={cascadeContainerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {feed.in_your_world
              .filter(item => !actedIds.has(item.id + ':dismissed') && !actedIds.has(item.id + ':skipped'))
              .map(item => (
                <SecondaryCard
                  key={item.id}
                  item={item}
                  actedIds={actedIds}
                  onAction={(act) => handleAction(item, act)}
                />
              ))}
          </motion.div>
        </section>
      )}

      {feed.honest_note && (
        <div className="text-[10px] text-muted-foreground/55 italic text-center">
          {feed.honest_note}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PICK OF THE DAY — large editorial card
══════════════════════════════════════════════════════════════════════ */

function PickOfTheDayCard({ item, actedIds, onAction }: {
  item: ManavsPickItemClient;
  actedIds: Set<string>;
  onAction: (a: 'saved' | 'dismissed' | 'skipped' | 'asked_chat') => void;
}) {
  const saved = actedIds.has(item.id + ':saved');
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.major_long, ease: FEATHER_EASE, delay: 0.1 }}
      className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.05] via-card/40 to-violet-500/[0.03] p-6 md:p-7 shadow-xl shadow-amber-500/[0.04]">
      <div className="flex items-baseline gap-2 mb-4">
        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-400">
          The pick of the day
        </div>
        <TrustBadge tier={item.trust_tier} />
        <div className="text-[9px] text-muted-foreground/55 italic ml-auto">
          {item.publisher} · {item.published_relative}
        </div>
      </div>
      <h2 className="text-xl md:text-2xl font-bold text-foreground/95 leading-tight mb-3">
        {item.title}
      </h2>
      {item.excerpt && (
        <p className="text-sm text-muted-foreground/85 leading-relaxed mb-3 italic">
          "{item.excerpt}"
        </p>
      )}
      {item.why_this_matters && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2.5 mb-4">
          <div className="text-[9px] uppercase tracking-wider font-bold text-amber-400/85 mb-1">
            Why this matters for you
          </div>
          <div className="text-[12.5px] text-foreground/90 leading-relaxed">
            {item.why_this_matters}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-colors font-bold inline-flex items-center gap-1.5 no-underline">
          Continue at source <ExternalLink className="h-3 w-3" />
        </a>
        <button
          onClick={() => onAction('asked_chat')}
          className="text-[11px] px-3 py-2 rounded-lg border border-border/50 bg-card/40 text-foreground/85 hover:bg-card/60 transition-colors inline-flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3" /> Ask chat
        </button>
        <button
          onClick={() => onAction('saved')}
          disabled={saved}
          className={`text-[11px] px-3 py-2 rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
            saved
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300 cursor-default'
              : 'border-border/50 bg-card/40 text-foreground/85 hover:bg-card/60'
          }`}>
          {saved ? <CheckCircle2 className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
          {saved ? 'Saved' : 'Save'}
        </button>
        <button
          onClick={() => onAction('skipped')}
          className="text-[11px] px-3 py-2 rounded-lg text-muted-foreground/55 hover:text-foreground/85 transition-colors inline-flex items-center gap-1.5">
          <XCircle className="h-3 w-3" /> Skip today
        </button>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SECONDARY CARD — compact item in the grid
══════════════════════════════════════════════════════════════════════ */

function SecondaryCard({ item, actedIds, onAction }: {
  item: ManavsPickItemClient;
  actedIds: Set<string>;
  onAction: (a: 'saved' | 'dismissed' | 'skipped' | 'asked_chat') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const saved = actedIds.has(item.id + ':saved');
  return (
    <motion.div
      variants={cascadeItemVariants}
      whileHover={{ scale: 1.005 }}
      transition={{ duration: DURATION.hover, ease: FEATHER_EASE }}
      className="rounded-xl border border-border/40 bg-card/30 p-4 hover:bg-card/50 hover:border-border/70 transition-colors flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <TrustBadge tier={item.trust_tier} small />
          <div className="text-[9px] text-muted-foreground/55">{item.publisher}</div>
        </div>
        <div className="text-[9px] text-muted-foreground/45">{item.published_relative}</div>
      </div>
      <h3 className="text-[13.5px] font-bold text-foreground/95 leading-snug mb-2">{item.title}</h3>
      {item.why_this_matters && (
        <div className="text-[11.5px] text-muted-foreground/85 leading-relaxed mb-2 italic line-clamp-2">
          {item.why_this_matters}
        </div>
      )}
      {item.excerpt && expanded && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: DURATION.short, ease: FEATHER_EASE }}
          className="text-[11px] text-muted-foreground/75 leading-relaxed italic mb-2">
          "{item.excerpt}"
        </motion.p>
      )}
      {item.excerpt && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[9px] text-muted-foreground/55 hover:text-amber-400 transition-colors text-left mb-2">
          {expanded ? '· hide snippet' : '· read snippet'}
        </button>
      )}
      <div className="mt-auto pt-2 flex items-center gap-1.5 flex-wrap">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-500/[0.05] text-amber-300 hover:bg-amber-500/15 transition-colors font-bold inline-flex items-center gap-1 no-underline">
          Continue <ExternalLink className="h-2.5 w-2.5" />
        </a>
        <button
          onClick={() => onAction('asked_chat')}
          title="Ask chat about this"
          className="text-[10px] p-1.5 rounded-md border border-border/40 text-muted-foreground/70 hover:text-foreground hover:bg-card/60 transition-colors">
          <MessageSquare className="h-2.5 w-2.5" />
        </button>
        <button
          onClick={() => onAction('saved')}
          disabled={saved}
          title={saved ? 'Saved' : 'Save for later'}
          className={`text-[10px] p-1.5 rounded-md border transition-colors ${
            saved
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300 cursor-default'
              : 'border-border/40 text-muted-foreground/70 hover:text-foreground hover:bg-card/60'
          }`}>
          {saved ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Bookmark className="h-2.5 w-2.5" />}
        </button>
        <button
          onClick={() => onAction('skipped')}
          title="Skip today"
          className="text-[10px] p-1.5 rounded-md text-muted-foreground/45 hover:text-muted-foreground transition-colors ml-auto">
          <XCircle className="h-2.5 w-2.5" />
        </button>
      </div>
    </motion.div>
  );
}

function TrustBadge({ tier, small }: { tier: string; small?: boolean }) {
  const colorClass: Record<string, string> = {
    T1: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    T2: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    T3: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    T4: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  };
  return (
    <span className={`${colorClass[tier] || 'bg-card/40 text-muted-foreground border-border/40'} border px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${small ? 'text-[8px]' : 'text-[9px]'}`}>
      {tier}
    </span>
  );
}
