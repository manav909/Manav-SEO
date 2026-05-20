/* ════════════════════════════════════════════════════════════════
   src/components/pm/CardBoard.tsx
   The Board tab — 5-week strategy canvas + library.

   - Library:  generated/unplaced cards waiting to be scheduled
   - Weeks 1-4 + Backlog: drag a card to a week; the expert engine
     rates the placement (best/good/ok/caution) with a real reason
   - Next-move recommendation guides what to place next
   - Click a card → open TaskRunner (execute) or VerifyPanel (verify)
════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from 'react';
import { Lock, Ship } from 'lucide-react';
import type { TaskCard, LifecycleMap } from './types';
import {
  WEEK_COLUMNS, getSuggestion, getNextRecommendation,
  estimateHours, formatHours, columnHours, workloadLabel,
  TYPE_LABEL, TYPE_COLOR, SUGGESTION_STYLE,
} from './engine';
import * as pmApi from './api';
import TaskRunner from './TaskRunner';
import VerifyPanel from './VerifyPanel';
import CardLifecycleDrawer from './CardLifecycleDrawer';

export default function CardBoard({
  projectId, project, cards, loading, onChange,
}: {
  projectId: string;
  project: any;
  cards: TaskCard[];
  loading: boolean;
  onChange: () => void;
}) {
  const [dragId, setDragId]       = useState<string | null>(null);
  const [dragOverWeek, setOverWk] = useState<number | null>(null);
  const [runnerCard, setRunner]   = useState<TaskCard | null>(null);
  const [verifyCard, setVerify]   = useState<TaskCard | null>(null);
  const [lifecycleCardId, setLifecycleCardId] = useState<string | null>(null);
  const [lcMap, setLcMap] = useState<LifecycleMap>({ blockedByCard: {}, shipmentCountsByCard: {} });

  /* load lifecycle map (blockers + shipment counts) — refresh on card changes */
  const loadLifecycle = async () => {
    const { map } = await pmApi.lifecycleMap(projectId);
    if (map) setLcMap(map);
  };
  useEffect(() => {
    if (projectId) loadLifecycle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, cards.length]);

  const library = useMemo(() => cards.filter(c => !c.placed), [cards]);
  const placed  = useMemo(() => cards.filter(c => c.placed),  [cards]);
  const nextMove = useMemo(() => getNextRecommendation(placed, library), [placed, library]);

  /* Move a card to a week (or back to library if week is null). */
  const place = async (card: TaskCard, week: number | null) => {
    const patch = week == null
      ? { placed: false }
      : { placed: true, week };
    /* optimistic — server confirms via onChange */
    await pmApi.updateCard(card.id, patch);
    onChange();
  };

  const onDrop = async (week: number) => {
    setOverWk(null);
    const card = cards.find(c => c.id === dragId);
    setDragId(null);
    if (card) await place(card, week);
  };

  if (loading) {
    return <div className="text-center py-16 text-sm text-muted-foreground">Loading board…</div>;
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <div className="text-3xl mb-3">🗂</div>
        <p className="text-sm font-semibold mb-1">No task cards yet</p>
        <p className="text-xs text-muted-foreground">
          Go to the Requirements tab and generate cards from your project intelligence.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Next-move recommendation */}
      {nextMove && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
            Recommended next move
          </div>
          <div className="text-sm font-semibold">{nextMove.card.title}</div>
          <div className="text-xs text-muted-foreground mt-1">{nextMove.reason}</div>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-primary font-medium">{nextMove.metric}</span>
            <button
              onClick={() => place(nextMove.card, nextMove.week)}
              className="text-xs px-2.5 py-1 rounded-lg bg-primary/15 border border-primary/30 text-primary font-semibold hover:bg-primary/25 transition-colors ml-auto"
            >
              Place in {nextMove.week === 5 ? 'Backlog' : `Week ${nextMove.week}`}
            </button>
          </div>
        </div>
      )}

      {/* Library — unplaced cards */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Library — {library.length} unplaced
        </div>
        {library.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 italic py-2">
            All cards placed on the board.
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {library.map(card => (
              <LibraryCard
                key={card.id}
                card={card}
                onDragStart={() => setDragId(card.id)}
                onClick={() => setRunner(card)}
              />
            ))}
          </div>
        )}
      </div>

      {/* The 5-week board */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {WEEK_COLUMNS.map(col => {
          const colCards = placed.filter(c => c.week === col.week);
          const hrs = columnHours(colCards);
          const wl  = workloadLabel(hrs);
          return (
            <div
              key={col.week}
              onDragOver={e => { e.preventDefault(); setOverWk(col.week); }}
              onDragLeave={() => setOverWk(w => w === col.week ? null : w)}
              onDrop={() => onDrop(col.week)}
              className={`rounded-xl border bg-card p-3 min-h-[200px] transition-colors ${
                dragOverWeek === col.week ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <div className="mb-2">
                <div className="text-sm font-bold">{col.label}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{col.sub}</div>
              </div>
              <div className="flex items-center justify-between mb-3 text-[10px]">
                <span className="text-muted-foreground">{colCards.length} cards</span>
                <span className={wl.color}>{wl.label} · {formatHours(hrs)}</span>
              </div>

              {/* Placement hint while dragging */}
              {dragOverWeek === col.week && dragId && (() => {
                const card = cards.find(c => c.id === dragId);
                if (!card) return null;
                const s = getSuggestion(card, col.week, cards);
                return (
                  <div className={`rounded-lg border p-2 mb-2 text-[10px] ${SUGGESTION_STYLE[s.level].ring}`}>
                    <div className="font-semibold">{SUGGESTION_STYLE[s.level].label} — {s.headline}</div>
                    <div className="text-muted-foreground mt-0.5">{s.reason}</div>
                  </div>
                );
              })()}

              <div className="space-y-2">
                {colCards.map(card => (
                  <BoardCard
                    key={card.id}
                    card={card}
                    blockers={lcMap.blockedByCard[card.id]?.blockers || []}
                    shipmentCount={lcMap.shipmentCountsByCard[card.id] || 0}
                    onDragStart={() => setDragId(card.id)}
                    onOpen={() => setRunner(card)}
                    onVerify={() => setVerify(card)}
                    onUnplace={() => place(card, null)}
                    onLifecycle={() => setLifecycleCardId(card.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task runner modal */}
      {runnerCard && (
        <TaskRunner
          card={runnerCard}
          projectId={projectId}
          project={project}
          onClose={() => setRunner(null)}
          onDone={() => { setRunner(null); onChange(); }}
        />
      )}

      {/* Verify modal */}
      {verifyCard && (
        <VerifyPanel
          card={verifyCard}
          onClose={() => setVerify(null)}
          onVerified={() => { setVerify(null); onChange(); }}
        />
      )}

      {/* Lifecycle drawer — ship, measure, transition, activity */}
      <CardLifecycleDrawer
        cardId={lifecycleCardId}
        open={!!lifecycleCardId}
        onClose={() => setLifecycleCardId(null)}
        onChanged={() => { loadLifecycle(); onChange(); }}
      />
    </div>
  );
}

/* ── A card in the library ── */
function LibraryCard({ card, onDragStart, onClick }: {
  card: TaskCard; onDragStart: () => void; onClick: () => void;
}) {
  const color = TYPE_COLOR[card.type];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="rounded-lg border border-border bg-background/60 p-2.5 w-52 cursor-pointer hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: `${color}22`, color }}>
          {TYPE_LABEL[card.type]}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">{formatHours(estimateHours(card))}</span>
      </div>
      <div className="text-xs font-semibold leading-snug line-clamp-2">{card.title}</div>
    </div>
  );
}

/* ── A card placed on the board ── */
function BoardCard({ card, blockers, shipmentCount, onDragStart, onOpen, onVerify, onUnplace, onLifecycle }: {
  card: TaskCard;
  blockers: { id: string; title: string; status: string }[];
  shipmentCount: number;
  onDragStart: () => void;
  onOpen: () => void; onVerify: () => void; onUnplace: () => void;
  onLifecycle: () => void;
}) {
  const color = TYPE_COLOR[card.type];
  const statusColor: Record<string, string> = {
    todo: '#6366f1', doing: '#f59e0b', review: '#a78bfa',
    waiting: '#fb923c', verified: '#10b981', done: '#10b981',
    planned: '#6366f1', in_progress: '#f59e0b', executed: '#a78bfa',
    reviewed: '#a78bfa', shipped: '#10b981', measured: '#34d399',
    archived: '#64748b',
  };
  const isBlocked = blockers.length > 0;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`rounded-lg border bg-background/60 p-2.5 transition-colors ${
        isBlocked ? 'border-amber-500/40 bg-amber-500/5' : 'border-border hover:border-primary/40'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <span className="text-[10px] text-muted-foreground">{TYPE_LABEL[card.type]}</span>
        {isBlocked && (
          <span title={`Blocked by: ${blockers.map(b => b.title).join(', ')}`}
            className="flex items-center gap-0.5 text-[10px] text-amber-400">
            <Lock className="h-2.5 w-2.5" /> blocked
          </span>
        )}
        {shipmentCount > 0 && (
          <span title={`${shipmentCount} shipment${shipmentCount === 1 ? '' : 's'}`}
            className="flex items-center gap-0.5 text-[10px] text-green-400">
            <Ship className="h-2.5 w-2.5" /> {shipmentCount}
          </span>
        )}
        <span className="text-[10px] ml-auto" style={{ color: statusColor[card.status] || '#94a3b8' }}>
          {card.status}
        </span>
      </div>
      <div className="text-xs font-semibold leading-snug line-clamp-2 mb-2 cursor-pointer" onClick={onOpen}>
        {card.title}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onOpen}
          className="text-[10px] px-2 py-0.5 rounded bg-primary/15 text-primary font-semibold hover:bg-primary/25 transition-colors">
          {card.output ? 'Re-run' : 'Run'}
        </button>
        {(card.status === 'review' || card.status === 'done' || card.status === 'executed') && (
          <button onClick={onVerify}
            className="text-[10px] px-2 py-0.5 rounded bg-green-500/15 text-green-400 font-semibold hover:bg-green-500/25 transition-colors">
            Verify
          </button>
        )}
        <button onClick={onLifecycle}
          className="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 font-semibold hover:bg-blue-500/25 transition-colors"
          title="Open card lifecycle — ship, measure, view activity"
        >
          Lifecycle
        </button>
        <button onClick={onUnplace}
          className="text-[10px] text-muted-foreground hover:text-foreground ml-auto transition-colors">
          ↩ Library
        </button>
      </div>
    </div>
  );
}
