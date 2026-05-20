/* ════════════════════════════════════════════════════════════════
   CardLifecycleDrawer.tsx
   Slide-in drawer for one card's full lifecycle surface:
     • Lifecycle state controls (transition forward/back)
     • Blocker list (greyed transitions if any unmet dependency)
     • Ship dialog: target URL, change summary, evidence, optional force-ship reason
     • Measure button per shipment (takes a post-ship metrics snapshot)
     • Shipment history with baseline vs post-ship metrics & lift
     • Activity log (full timeline)

   Opened from CardBoard on card click.
════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import {
  X, Ship, AlertTriangle, Activity, ExternalLink, Loader2,
  ChevronRight, Gauge, Lock, AlertCircle, Check,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as pmApi from './api';
import type {
  CardDetail, LifecycleState, CardShipment, CardActivity,
} from './types';

/* allowed forward transitions for the lifecycle buttons row */
const NEXT_STATES: Record<string, LifecycleState[]> = {
  planned:     ['in_progress'],
  todo:        ['in_progress'],
  in_progress: ['executed'],
  doing:       ['executed'],
  executed:    ['reviewed'],
  reviewed:    [], // ship via ship dialog
  done:        [], // ship via ship dialog (legacy)
  shipped:     [], // measure via measure button
  measured:    [],
  archived:    [],
};

const STATE_LABELS: Record<string, string> = {
  planned: 'Planned', todo: 'Planned',
  in_progress: 'In progress', doing: 'In progress',
  executed: 'Executed', reviewed: 'Reviewed',
  shipped: 'Shipped', measured: 'Measured',
  done: 'Done (legacy)', archived: 'Archived',
};

const STATE_TONE: Record<string, string> = {
  planned:     'bg-muted text-muted-foreground',
  todo:        'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-500/15 text-blue-400',
  doing:       'bg-blue-500/15 text-blue-400',
  executed:    'bg-amber-500/15 text-amber-400',
  reviewed:    'bg-purple-500/15 text-purple-400',
  shipped:     'bg-green-500/15 text-green-400',
  measured:    'bg-emerald-500/15 text-emerald-400',
  done:        'bg-green-500/15 text-green-400',
  archived:    'bg-muted/60 text-muted-foreground line-through',
};

export default function CardLifecycleDrawer({
  cardId, open, onClose, onChanged,
}: {
  cardId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showShip, setShowShip] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [measuring, setMeasuring] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  /* ship form */
  const [shipUrls, setShipUrls] = useState('');
  const [shipActualUrl, setShipActualUrl] = useState('');
  const [shipSummary, setShipSummary] = useState('');
  const [shipEvidence, setShipEvidence] = useState('');
  const [shipForceReason, setShipForceReason] = useState('');

  const load = useCallback(async () => {
    if (!cardId) return;
    setLoading(true);
    const { detail, error } = await pmApi.cardDetail(cardId);
    setLoading(false);
    if (error) { toast({ title: 'Could not load card', description: error, variant: 'destructive' }); return; }
    if (detail) {
      setDetail(detail);
      /* preseed ship form from card's source_refs (target URL) */
      const refs = Array.isArray(detail.card?.source_refs) ? detail.card.source_refs : [];
      const urlRef = refs.find((r: any) => typeof r?.label === 'string' && r.label.startsWith('Page:'));
      const url = urlRef ? urlRef.label.replace(/^Page:\s*/, '') : '';
      setShipUrls(url); setShipActualUrl(url);
    }
  }, [cardId, toast]);

  useEffect(() => { if (open && cardId) load(); }, [open, cardId, load]);

  /* close handler resets transient state */
  const close = () => {
    setShowShip(false); setShipping(false);
    setShipUrls(''); setShipActualUrl(''); setShipSummary('');
    setShipEvidence(''); setShipForceReason('');
    onClose();
  };

  const transition = async (to: LifecycleState) => {
    if (!cardId) return;
    setTransitioning(to);
    const { success, error } = await pmApi.transitionCard({ cardId, toState: to });
    setTransitioning(null);
    if (!success) { toast({ title: 'Could not change state', description: error, variant: 'destructive' }); return; }
    await load(); onChanged?.();
  };

  const ship = async () => {
    if (!cardId || !shipSummary.trim()) {
      toast({ title: 'Describe what shipped', description: 'A short summary is required.', variant: 'destructive' });
      return;
    }
    setShipping(true);
    const urls = shipUrls.split(',').map((s) => s.trim()).filter(Boolean);
    const { shipment, error, wasBlocked } = await pmApi.shipCard({
      cardId,
      affectedUrls: urls,
      actualShippedUrl: shipActualUrl.trim() || undefined,
      changesSummary: shipSummary,
      evidenceUrl: shipEvidence.trim() || undefined,
      forceShipReason: shipForceReason.trim() || undefined,
    });
    setShipping(false);
    if (error || !shipment) {
      if (wasBlocked && !shipForceReason.trim()) {
        toast({ title: 'Card is blocked', description: `${error} Add a force-ship reason below to override.`, variant: 'destructive' });
        /* keep dialog open so PM can add the reason */
        return;
      }
      toast({ title: 'Ship failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Shipped', description: 'Baseline captured. Take a measurement once results show.' });
    setShowShip(false);
    setShipSummary(''); setShipEvidence(''); setShipForceReason('');
    await load(); onChanged?.();
  };

  const measure = async (shipmentId: string) => {
    if (!cardId) return;
    setMeasuring(shipmentId);
    const { lift, error } = await pmApi.measureCard({ cardId, shipmentId });
    setMeasuring(null);
    if (error) { toast({ title: 'Measure failed', description: error, variant: 'destructive' }); return; }
    const liftLine = lift ? Object.entries(lift)
      .filter(([_, v]) => v != null).map(([k, v]) => `${k}: ${Number(v) > 0 ? '+' : ''}${v}`)
      .join(', ') : '';
    toast({ title: 'Measurement saved', description: liftLine || 'No measurable change yet.' });
    await load(); onChanged?.();
  };

  if (!open || !cardId) return null;

  const status = detail?.card?.status || '';
  const nextStates = NEXT_STATES[status] || [];
  const canShip = !!detail && (status === 'reviewed' || status === 'done' || status === 'executed');

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog">
      {/* backdrop */}
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={close} />

      {/* drawer */}
      <div className="w-full sm:w-[640px] max-w-full bg-card border-l border-border overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : detail ? (
              <>
                <div className="text-base font-semibold text-foreground truncate">{detail.card.title}</div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${STATE_TONE[status] || 'bg-muted text-muted-foreground'}`}>
                    {STATE_LABELS[status] || status}
                  </span>
                  {detail.isBlocked && (
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-semibold">
                      <Lock className="h-3 w-3" /> Blocked
                    </span>
                  )}
                  <span>{detail.card.card_type}</span>
                  <span>· priority {detail.card.priority}</span>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No card.</div>
            )}
          </div>
          <button onClick={close} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {detail && (
          <div className="p-5 space-y-5">
            {/* description */}
            {detail.card.description && (
              <section>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Description</div>
                <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{detail.card.description}</div>
              </section>
            )}

            {/* blockers */}
            {detail.isBlocked && (
              <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-[10px] uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" /> Blocked by
                </div>
                <ul className="space-y-1">
                  {detail.blockers.map((b) => (
                    <li key={b.id} className="text-xs text-foreground/90 flex items-center justify-between gap-2">
                      <span className="truncate">{b.title}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{b.status}</span>
                    </li>
                  ))}
                </ul>
                <div className="text-[10px] text-amber-300/80 mt-2">
                  Card cannot be shipped until blockers ship — or provide a force-ship reason in the ship dialog.
                </div>
              </section>
            )}

            {/* lifecycle action row */}
            <section>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Lifecycle</div>
              <div className="flex gap-2 flex-wrap">
                {nextStates.map((to) => (
                  <button
                    key={to}
                    onClick={() => transition(to)}
                    disabled={transitioning === to}
                    className="text-xs px-3 py-1.5 rounded-lg border border-border bg-background hover:border-primary/40 disabled:opacity-50 flex items-center gap-1"
                  >
                    {transitioning === to ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
                    Move to {STATE_LABELS[to] || to}
                  </button>
                ))}
                {canShip && (
                  <button
                    onClick={() => setShowShip(true)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 flex items-center gap-1 font-semibold"
                  >
                    <Ship className="h-3.5 w-3.5" /> Ship card…
                  </button>
                )}
                {status !== 'archived' && (
                  <button
                    onClick={() => {
                      const reason = prompt('Why are you archiving this card?');
                      if (reason) pmApi.transitionCard({ cardId, toState: 'archived', archiveReason: reason })
                        .then(() => { load(); onChanged?.(); });
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-destructive"
                  >Archive</button>
                )}
              </div>
            </section>

            {/* ship dialog */}
            {showShip && (
              <section className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-green-400 flex items-center gap-1.5">
                  <Ship className="h-4 w-4" /> Ship this card
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Affected URLs (comma-separated)</label>
                    <input type="text" value={shipUrls} onChange={(e) => setShipUrls(e.target.value)}
                      placeholder="https://site.com/pricing, https://site.com/about"
                      className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Primary URL (for attribution)</label>
                    <input type="text" value={shipActualUrl} onChange={(e) => setShipActualUrl(e.target.value)}
                      placeholder="The URL we'll measure"
                      className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">What changed (required)</label>
                  <textarea rows={2} value={shipSummary} onChange={(e) => setShipSummary(e.target.value)}
                    placeholder='e.g. "Added Article schema to /pricing and 4 product pages"'
                    className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Evidence URL (optional — deploy log, PR, screenshot)</label>
                  <input type="text" value={shipEvidence} onChange={(e) => setShipEvidence(e.target.value)}
                    className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                {detail.isBlocked && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-amber-400">Force-ship reason (required — card is blocked)</label>
                    <input type="text" value={shipForceReason} onChange={(e) => setShipForceReason(e.target.value)}
                      placeholder='e.g. "Client approved despite incomplete dependency"'
                      className="w-full mt-1 rounded-lg border border-amber-500/40 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowShip(false)} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancel</button>
                  <button onClick={ship} disabled={shipping}
                    className="text-xs px-4 py-1.5 rounded-lg bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30 disabled:opacity-50 font-semibold flex items-center gap-1.5">
                    {shipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ship className="h-3.5 w-3.5" />}
                    Ship card
                  </button>
                </div>
              </section>
            )}

            {/* shipments */}
            {detail.shipments.length > 0 && (
              <section>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Ship className="h-3.5 w-3.5" /> Shipments ({detail.shipments.length})
                </div>
                <div className="space-y-2">
                  {detail.shipments.map((s) => (
                    <ShipmentRow key={s.id} shipment={s}
                      onMeasure={() => measure(s.id)}
                      measuring={measuring === s.id} />
                  ))}
                </div>
              </section>
            )}

            {/* activity timeline */}
            <section>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" /> Activity
              </div>
              <div className="space-y-1.5 text-xs">
                {detail.activity.length === 0 ? (
                  <div className="text-muted-foreground">No activity yet.</div>
                ) : detail.activity.map((a: CardActivity) => (
                  <div key={a.id} className="flex items-start gap-2 pb-1.5 border-b border-border/40">
                    <div className="text-[10px] text-muted-foreground font-mono shrink-0 w-20">
                      {new Date(a.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-foreground/90">{a.message || a.kind}</div>
                      {a.actor && <div className="text-[10px] text-muted-foreground">by {a.actor}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── one shipment row ─────────────────────────────────────── */
function ShipmentRow({ shipment, onMeasure, measuring }: {
  shipment: CardShipment; onMeasure: () => void; measuring: boolean;
}) {
  const base = shipment.baseline_metrics || {};
  const post = shipment.post_metrics || {};
  const measured = !!shipment.post_captured_at;
  const liftClicks = (base.gsc_clicks != null && post.gsc_clicks != null) ? Number(post.gsc_clicks) - Number(base.gsc_clicks) : null;
  const liftPosition = (base.gsc_avg_position != null && post.gsc_avg_position != null) ? Number(post.gsc_avg_position) - Number(base.gsc_avg_position) : null;

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-foreground/90">{shipment.changes_summary}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Shipped {new Date(shipment.shipped_at).toLocaleString('en-GB')}
            {shipment.actual_shipped_url && <> · {shipment.actual_shipped_url}</>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {shipment.evidence_url && (
            <a href={shipment.evidence_url} target="_blank" rel="noreferrer"
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Open evidence">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button onClick={onMeasure} disabled={measuring}
            className="text-[10px] px-2 py-1 rounded-lg border border-primary/40 text-primary hover:bg-primary/5 disabled:opacity-50 flex items-center gap-1">
            {measuring ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gauge className="h-3 w-3" />}
            {measured ? 'Re-measure' : 'Measure now'}
          </button>
        </div>
      </div>

      {shipment.force_ship_reason && (
        <div className="text-[10px] text-amber-400 mb-1.5 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> Force-shipped: {shipment.force_ship_reason}
        </div>
      )}

      {measured ? (
        <div className="flex gap-3 text-[11px] mt-1 flex-wrap">
          {liftClicks != null && (
            <div className={liftClicks > 0 ? 'text-green-400' : liftClicks < 0 ? 'text-amber-400' : 'text-muted-foreground'}>
              clicks {liftClicks > 0 ? '+' : ''}{liftClicks}
              <span className="text-muted-foreground"> ({base.gsc_clicks} → {post.gsc_clicks})</span>
            </div>
          )}
          {liftPosition != null && (
            <div className={liftPosition < 0 ? 'text-green-400' : liftPosition > 0 ? 'text-amber-400' : 'text-muted-foreground'}>
              position {liftPosition > 0 ? '+' : ''}{liftPosition.toFixed(1)}
              <span className="text-muted-foreground"> ({Number(base.gsc_avg_position).toFixed(1)} → {Number(post.gsc_avg_position).toFixed(1)})</span>
            </div>
          )}
          {liftClicks == null && liftPosition == null && (
            <div className="text-muted-foreground">No comparable metrics yet.</div>
          )}
          <div className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
            <Check className="h-3 w-3" /> measured {new Date(shipment.post_captured_at!).toLocaleDateString('en-GB')}
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground italic">Baseline captured. Run measurement once results show (typically 14-30 days).</div>
      )}
    </div>
  );
}
