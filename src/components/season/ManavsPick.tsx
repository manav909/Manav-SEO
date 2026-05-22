/* ════════════════════════════════════════════════════════════════════
   src/components/season/ManavsPick.tsx
   Phase 21 — Block 2.13 — The intelligence engine surface

   This is no longer a feed reader. It renders ONE insight from the
   Pick engine — an LLM-assembled cross-connection between external
   articles and this project's internal state.

   The insight has 5 audience frames (slider tabs):
     Sales · HoD · PM · Content Writer · SEO Executive
   Same connection, different lens.

   Every claim is traceable: external citations show the source articles,
   internal citations show the project data points the connection draws on.

   The "In Your World" grid is now the legacy compact feed (kept) — but
   the hero is the engine output.
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, ExternalLink, MessageSquare, Bookmark, XCircle,
  Newspaper, CheckCircle2, RefreshCw, Briefcase, Crown, Users,
  PenLine, Wrench, Link2, Database, ChevronRight, History,
} from 'lucide-react';
import {
  seoManavsPick, seoManavsPickAction,
  seoPickEngineGet, seoPickEngineRegenerate, seoPickEngineArchive,
  type ProjectFeedClient, type ManavsPickItemClient,
  type ManavsPickRowClient, type ManavsPickFrameClient, type PickRoleKey,
} from '@/components/pm/api';
import { cascadeContainerVariants, cascadeItemVariants, DURATION, FEATHER_EASE } from './warRoomAnimations';

interface Props {
  projectId:        string | null;
  onLaunchCommand:  (cmd: string) => void;
}

const ROLES: { key: PickRoleKey; label: string; icon: React.ReactNode }[] = [
  { key: 'sales',           label: 'Sales',     icon: <Briefcase className="h-3 w-3" /> },
  { key: 'hod',             label: 'HoD',       icon: <Crown className="h-3 w-3" /> },
  { key: 'pm',              label: 'PM',        icon: <Users className="h-3 w-3" /> },
  { key: 'content_writer',  label: 'Content',   icon: <PenLine className="h-3 w-3" /> },
  { key: 'seo_executive',   label: 'SEO Exec',  icon: <Wrench className="h-3 w-3" /> },
];

export default function ManavsPick({ projectId, onLaunchCommand }: Props) {
  const [pick, setPick]               = useState<ManavsPickRowClient | null>(null);
  const [pickNote, setPickNote]       = useState<string | null>(null);
  const [pickLoading, setPickLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [feed, setFeed]               = useState<ProjectFeedClient | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);

  const [archiveOpen, setArchiveOpen]     = useState(false);
  const [archivePicks, setArchivePicks]   = useState<ManavsPickRowClient[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveTotal, setArchiveTotal]   = useState(0);

  const [actedIds, setActedIds]       = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId) { setPick(null); setFeed(null); return; }
    let cancelled = false;
    setPickLoading(true);
    (async () => {
      const r = await seoPickEngineGet({ projectId });
      if (cancelled) return;
      setPick(r.pick || null);
      setPickNote(r.honest_note || null);
      setPickLoading(false);
    })();
    /* The "In Your World" compact feed runs in parallel */
    setFeedLoading(true);
    (async () => {
      const r = await seoManavsPick({ projectId });
      if (cancelled) return;
      setFeed(r.feed || null);
      setFeedLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  async function handleRegenerate() {
    if (!projectId || regenerating) return;
    setRegenerating(true);
    const r = await seoPickEngineRegenerate({ projectId });
    setPick(r.pick || null);
    setPickNote(r.honest_note || null);
    setRegenerating(false);
  }

  async function openArchive() {
    setArchiveOpen(true);
    if (!projectId || archivePicks.length > 0) return;
    setArchiveLoading(true);
    const r = await seoPickEngineArchive({ projectId, limit: 30 });
    if (r.picks) setArchivePicks(r.picks);
    if (typeof r.total === 'number') setArchiveTotal(r.total);
    setArchiveLoading(false);
  }

  async function handleSecondaryAction(item: ManavsPickItemClient, action: 'saved' | 'dismissed' | 'skipped' | 'asked_chat') {
    if (!projectId) return;
    setActedIds(prev => new Set(prev).add(item.id + ':' + action));
    if (action === 'asked_chat') {
      onLaunchCommand(`I read "${item.title}" from ${item.publisher}. Summarize how this affects our project.`);
    }
    seoManavsPickAction({ projectId, feedItemId: item.id, action }).catch(() => { /* swallow */ });
  }

  if (!projectId) return null;

  return (
    <div className="mt-10 space-y-8">
      {/* THE PICK ENGINE HERO */}
      <PickHero
        pick={pick}
        note={pickNote}
        loading={pickLoading}
        regenerating={regenerating}
        onRegenerate={handleRegenerate}
        onOpenArchive={openArchive}
        onAskChat={() => {
          if (!pick) return;
          onLaunchCommand(`Tell me more about today's pick: "${pick.insight_headline}"`);
        }}
      />

      {/* IN YOUR WORLD — the compact secondary feed (kept from Block 2.12) */}
      {feed && feed.in_your_world.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border/30" />
            <div className="text-[9px] uppercase tracking-[0.18em] font-bold text-muted-foreground/55">
              Also from your world today
            </div>
            <div className="h-px flex-1 bg-border/30" />
          </div>
          {feedLoading && feed.in_your_world.length === 0 ? (
            <div className="text-center text-[11px] text-muted-foreground/55 italic py-4">
              <RefreshCw className="h-3 w-3 mx-auto mb-1 animate-spin" />
              Gathering compact feed…
            </div>
          ) : (
            <motion.div
              variants={cascadeContainerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {feed.in_your_world
                .filter(item => !actedIds.has(item.id + ':dismissed') && !actedIds.has(item.id + ':skipped'))
                .slice(0, 6)
                .map(item => (
                  <SecondaryCard
                    key={item.id}
                    item={item}
                    actedIds={actedIds}
                    onAction={(act) => handleSecondaryAction(item, act)}
                  />
                ))}
            </motion.div>
          )}
        </section>
      )}

      {/* ARCHIVE MODAL */}
      <AnimatePresence>
        {archiveOpen && (
          <ArchiveModal
            picks={archivePicks}
            total={archiveTotal}
            loading={archiveLoading}
            onClose={() => setArchiveOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   THE PICK HERO — engine output with 5 role frames
══════════════════════════════════════════════════════════════════════ */

function PickHero({ pick, note, loading, regenerating, onRegenerate, onOpenArchive, onAskChat }: {
  pick:          ManavsPickRowClient | null;
  note:          string | null;
  loading:       boolean;
  regenerating:  boolean;
  onRegenerate:  () => void;
  onOpenArchive: () => void;
  onAskChat:     () => void;
}) {
  const [activeRole, setActiveRole] = useState<PickRoleKey | 'default'>('default');

  if (loading && !pick) {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.03] via-card/30 to-violet-500/[0.02] p-8 md:p-10 text-center">
        <Sparkles className="h-5 w-5 mx-auto mb-3 animate-pulse text-amber-400/70" />
        <div className="text-sm text-muted-foreground/65 italic">
          Engine is cross-connecting world signal with your project state…
        </div>
      </div>
    );
  }

  if (!pick) {
    return (
      <div className="rounded-2xl border border-border/30 bg-card/20 p-8 text-center">
        <Newspaper className="h-5 w-5 mx-auto mb-3 text-muted-foreground/40" />
        <div className="text-sm text-muted-foreground/75 italic mb-2">
          No pick today — the bar wasn't met.
        </div>
        {note && (
          <div className="text-[11px] text-muted-foreground/55 italic mb-4 max-w-md mx-auto">
            {note}
          </div>
        )}
        <button
          onClick={onRegenerate}
          disabled={regenerating}
          className="text-[11px] px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] text-amber-300 hover:bg-amber-500/15 transition-colors font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${regenerating ? 'animate-spin' : ''}`} />
          {regenerating ? 'Running engine…' : 'Run engine now'}
        </button>
      </div>
    );
  }

  /* Pick exists — show the insight with the slider */
  const displayedHeadline = activeRole === 'default'
    ? pick.insight_headline
    : (pick.frames.find(f => f.role === activeRole)?.headline || pick.insight_headline);
  const displayedBody = activeRole === 'default'
    ? pick.insight_body
    : (pick.frames.find(f => f.role === activeRole)?.body || pick.insight_body);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.major_long, ease: FEATHER_EASE, delay: 0.1 }}
      className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.05] via-card/40 to-violet-500/[0.03] p-6 md:p-7 shadow-xl shadow-amber-500/[0.04]">
      {/* Header */}
      <div className="flex items-baseline gap-2 mb-4 flex-wrap">
        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-400">
          Manav's Pick
        </div>
        <div className="text-[9px] text-muted-foreground/55 italic">
          · {new Date(pick.picked_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · connection score {Math.round(pick.connection_score)}/100
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={onOpenArchive}
            title="See all past picks"
            className="text-[10px] text-muted-foreground/55 hover:text-amber-400 flex items-center gap-1 transition-colors">
            <History className="h-3 w-3" />
            archive
          </button>
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            title="Force-regenerate"
            className="text-[10px] text-muted-foreground/55 hover:text-amber-400 flex items-center gap-1 transition-colors disabled:opacity-40">
            <RefreshCw className={`h-3 w-3 ${regenerating ? 'animate-spin' : ''}`} />
            {regenerating ? 'running' : 'refresh'}
          </button>
        </div>
      </div>

      {/* Role slider */}
      <div className="mb-5 inline-flex items-center gap-0.5 rounded-full border border-amber-500/20 bg-card/30 p-0.5">
        <RoleChip
          active={activeRole === 'default'}
          onClick={() => setActiveRole('default')}
          icon={<Sparkles className="h-3 w-3" />}
          label="Insight"
        />
        {ROLES.map(role => (
          <RoleChip
            key={role.key}
            active={activeRole === role.key}
            onClick={() => setActiveRole(role.key)}
            icon={role.icon}
            label={role.label}
          />
        ))}
      </div>

      {/* Insight body */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeRole}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: DURATION.short, ease: FEATHER_EASE }}>
          <h2 className="text-xl md:text-2xl font-bold text-foreground/95 leading-tight mb-3">
            {displayedHeadline}
          </h2>
          <p className="text-sm text-muted-foreground/90 leading-relaxed mb-5 whitespace-pre-line">
            {displayedBody}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Citations — the traceable spine */}
      <CitationsBlock external={pick.external_citations} internal={pick.internal_citations} />

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-amber-500/15">
        <button
          onClick={onAskChat}
          className="text-[11px] px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] text-amber-300 hover:bg-amber-500/15 transition-colors font-bold inline-flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3" /> Ask chat about this
        </button>
        <button
          onClick={onOpenArchive}
          className="text-[11px] px-3 py-2 rounded-lg border border-border/50 bg-card/30 text-muted-foreground/85 hover:text-foreground hover:bg-card/60 transition-colors inline-flex items-center gap-1.5">
          <History className="h-3 w-3" /> Past picks
        </button>
        {note && (
          <div className="text-[10px] text-muted-foreground/55 italic ml-auto">{note}</div>
        )}
      </div>
    </motion.div>
  );
}

function RoleChip({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: DURATION.hover, ease: FEATHER_EASE }}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
        active
          ? 'bg-amber-500/20 text-amber-300'
          : 'text-muted-foreground/60 hover:text-foreground'
      }`}>
      {icon} {label}
    </motion.button>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CITATIONS — every claim is traceable
══════════════════════════════════════════════════════════════════════ */

function CitationsBlock({ external, internal }: {
  external: { feed_item_id: string; url: string; publisher: string; title: string; ingested_at: string }[];
  internal: { source_table: string; source_field: string; value: string; captured_at: string; label: string }[];
}) {
  if (external.length === 0 && internal.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.03] px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider font-bold text-amber-400/85 mb-1.5">
        Drawn from
      </div>
      <div className="space-y-1.5">
        {external.map((c, i) => (
          <div key={`ext-${i}`} className="flex items-start gap-1.5 text-[11px]">
            <Link2 className="h-2.5 w-2.5 text-amber-400/70 shrink-0 mt-0.5" />
            <a href={c.url} target="_blank" rel="noopener noreferrer"
              className="text-foreground/85 hover:text-amber-300 transition-colors no-underline leading-snug">
              <span className="font-bold">{c.publisher}</span>
              <span className="text-muted-foreground/55"> · </span>
              <span>"{c.title}"</span>
              <span className="text-muted-foreground/45 text-[9px] ml-1">{relTime(c.ingested_at)}</span>
              <ExternalLink className="inline h-2 w-2 ml-1 text-muted-foreground/55" />
            </a>
          </div>
        ))}
        {internal.map((c, i) => (
          <div key={`int-${i}`} className="flex items-start gap-1.5 text-[11px]">
            <Database className="h-2.5 w-2.5 text-cyan-400/70 shrink-0 mt-0.5" />
            <div className="text-foreground/85 leading-snug">
              <span className="font-bold">{c.label}</span>
              <span className="text-muted-foreground/55"> · </span>
              <span>{c.value}</span>
              <span className="text-muted-foreground/45 text-[9px] ml-1">{relTime(c.captured_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ARCHIVE MODAL — summary of ALL picks
══════════════════════════════════════════════════════════════════════ */

function ArchiveModal({ picks, total, loading, onClose }: {
  picks: ManavsPickRowClient[];
  total: number;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: DURATION.short, ease: FEATHER_EASE }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: DURATION.major, ease: FEATHER_EASE }}
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-2xl w-full max-h-[80vh] bg-card border border-amber-500/30 rounded-2xl shadow-2xl shadow-amber-500/[0.08] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/40">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-bold text-foreground/95">Manav's Picks Archive</h3>
          <div className="text-[11px] text-muted-foreground/55">· {total} picks total</div>
          <button
            onClick={onClose}
            className="ml-auto text-muted-foreground/60 hover:text-foreground transition-colors">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && picks.length === 0 ? (
            <div className="text-center text-[11px] text-muted-foreground/55 italic py-8">
              <RefreshCw className="h-4 w-4 mx-auto mb-2 animate-spin" />
              Loading archive…
            </div>
          ) : picks.length === 0 ? (
            <div className="text-center text-[12px] text-muted-foreground/65 italic py-8">
              No picks in the archive yet. As the engine runs daily, picks will accumulate here.
            </div>
          ) : (
            <ul className="space-y-3">
              {picks.map(p => (
                <li key={p.id} className={`rounded-xl border p-4 ${p.is_current ? 'border-amber-500/40 bg-amber-500/[0.05]' : 'border-border/40 bg-card/30'}`}>
                  <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                    <div className="text-[9px] uppercase tracking-wider font-bold text-amber-400">
                      {new Date(p.picked_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    {p.is_current && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase tracking-wider">current</span>
                    )}
                    <div className="text-[9px] text-muted-foreground/55 ml-auto">
                      score {Math.round(p.connection_score)}/100
                    </div>
                  </div>
                  <h4 className="text-[13px] font-bold text-foreground/95 leading-snug mb-1.5">
                    {p.insight_headline}
                  </h4>
                  <p className="text-[11.5px] text-muted-foreground/85 leading-relaxed line-clamp-3 mb-2">
                    {p.insight_body}
                  </p>
                  {p.external_citations.length > 0 && (
                    <div className="text-[10px] text-muted-foreground/55 italic">
                      Drew from: {p.external_citations.slice(0, 2).map(c => c.publisher).join(' · ')}
                      {p.external_citations.length > 2 && ` +${p.external_citations.length - 2} more`}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SECONDARY CARD — compact "Also from your world" item (Block 2.12)
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
        <button onClick={() => onAction('asked_chat')} title="Ask chat" className="text-[10px] p-1.5 rounded-md border border-border/40 text-muted-foreground/70 hover:text-foreground hover:bg-card/60 transition-colors">
          <MessageSquare className="h-2.5 w-2.5" />
        </button>
        <button onClick={() => onAction('saved')} disabled={saved} title={saved ? 'Saved' : 'Save for later'}
          className={`text-[10px] p-1.5 rounded-md border transition-colors ${
            saved ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300 cursor-default' : 'border-border/40 text-muted-foreground/70 hover:text-foreground hover:bg-card/60'
          }`}>
          {saved ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Bookmark className="h-2.5 w-2.5" />}
        </button>
        <button onClick={() => onAction('skipped')} title="Skip today"
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

function relTime(iso: string): string {
  try {
    const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60); if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);  if (hr < 24)  return `${hr}h ago`;
    const d = Math.floor(hr / 24);    if (d < 30)   return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}
