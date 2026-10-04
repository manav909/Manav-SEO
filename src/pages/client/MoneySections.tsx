/* Client panel: Improvements (price list + basket → ask for an offer) and
   Orders (offers to accept, then a parcel-style tracker per order). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Check, X, ArrowUpRight, Heart } from 'lucide-react';
import { cp, SessionEndedError } from '@/lib/clientPanelApi';

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
const day = (iso?: string | null) => (iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

interface CatalogItem { id: string; name: string; summary?: string; deliverables: string[]; price_cents: number; turnaround_days: number; category: string; proof_links?: { title: string; url: string }[] }
interface OfferItem { name: string; deliverables: string[]; price_cents: number; turnaround_days: number; due_date?: string | null; client_note?: string | null; team_note?: string | null }
interface Offer { id: string; status: 'requested' | 'confirmed' | 'accepted' | 'declined'; items: OfferItem[]; client_note?: string; team_note?: string; total_cents: number; valid_until?: string; created_at: string }
interface Order { id: string; name: string; deliverables: string[]; price_cents: number; due_date?: string; status: string; assignee?: string; delivered_note?: string; delivered_link?: string; history: { status: string; at: string; note?: string }[]; thanks?: string | null; paid: boolean }

const BASKET_KEY = 'seoseason_basket';
function readBasket(): string[] {
  try { const v = JSON.parse(localStorage.getItem(BASKET_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
function writeBasket(ids: string[]) { try { localStorage.setItem(BASKET_KEY, JSON.stringify(ids)); } catch { /* ignore */ } }

function Title({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: 'grid', gap: 4, marginBottom: 20 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{title}</h1>
      {sub && <span className="cp-muted" style={{ fontSize: 14 }}>{sub}</span>}
    </div>
  );
}

/* ─── Improvements ──────────────────────────────────────────────── */

export function ImprovementsSection({ onSessionEnded, onRequested }: { onSessionEnded: () => void; onRequested: () => void }) {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState('');
  const [basket, setBasket] = useState<string[]>(readBasket);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    cp<{ items: CatalogItem[] }>('cp_catalog')
      .then((r) => setItems(r.items))
      .catch((e) => { if (e instanceof SessionEndedError) onSessionEnded(); else setError(e.message); });
  }, [onSessionEnded]);

  const toggle = (id: string) => setBasket((b) => { const next = b.includes(id) ? b.filter((x) => x !== id) : [...b, id]; writeBasket(next); return next; });
  const chosen = useMemo(() => (items || []).filter((i) => basket.includes(i.id)), [items, basket]);
  const total = chosen.reduce((s, i) => s + i.price_cents, 0);

  const request = async () => {
    setSending(true); setError('');
    try {
      await cp('cp_offer_request', { items: chosen.map((i) => ({ id: i.id })), note });
      writeBasket([]); setBasket([]); setNote('');
      onRequested();
    } catch (e: any) { if (e instanceof SessionEndedError) onSessionEnded(); else setError(e.message); }
    setSending(false);
  };

  if (!items) return error ? <div className="cp-card" style={{ padding: 20 }}>{error}</div> : <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><Loader2 className="animate-spin" /></div>;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Title title="Improvements" sub="Small, clear pieces of work with fixed prices. Add what you like to your basket and ask for an offer — your team confirms every detail before you pay anything." />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 480px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {items.length === 0 && <div className="cp-card" style={{ padding: 20, fontSize: 14 }}>Your team is preparing the price list. Meanwhile, <Link to="/c/talk">ask Manav S</Link> about anything you'd like done.</div>}
          {items.map((i) => {
            const inBasket = basket.includes(i.id);
            return (
              <article key={i.id} className="cp-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, borderColor: inBasket ? 'var(--cp-accent)' : undefined }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{i.name}</div>
                  {i.summary && <div className="cp-muted" style={{ fontSize: 13, marginTop: 4 }}>{i.summary}</div>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }} className="cp-muted">WHAT YOU GET</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, listStyle: 'disc' }}>
                  {i.deliverables.map((d) => <li key={d}>{d}</li>)}
                </ul>
                {i.proof_links && i.proof_links.length > 0 && (
                  <div style={{ fontSize: 13 }}>
                    <span className="cp-muted">Why it works: </span>
                    {i.proof_links.map((l, n) => <span key={l.url}>{n > 0 && ' · '}<a href={l.url} target="_blank" rel="noreferrer">{l.title}</a></span>)}
                  </div>
                )}
                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div><div style={{ fontWeight: 700, fontSize: 18 }}>{usd(i.price_cents)}</div><div className="cp-muted" style={{ fontSize: 12 }}>Ready in about {i.turnaround_days} day{i.turnaround_days > 1 ? 's' : ''}</div></div>
                  <button className={`cp-btn${inBasket ? ' cp-btn-ghost' : ''}`} onClick={() => toggle(i.id)} aria-pressed={inBasket}>
                    {inBasket ? <><Check size={14} />In basket</> : 'Add to basket'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="cp-card" style={{ flex: '1 1 260px', padding: 18, display: 'grid', gap: 10, position: 'sticky', top: 16 }}>
          <div style={{ fontWeight: 700 }}>Your basket</div>
          {chosen.length === 0
            ? <div className="cp-muted" style={{ fontSize: 13 }}>Nothing yet. Add an improvement to ask for an offer.</div>
            : chosen.map((i) => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14 }}>
                <span>{i.name}</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{usd(i.price_cents)}
                  <button onClick={() => toggle(i.id)} aria-label={`Remove ${i.name}`} className="cp-btn cp-btn-ghost" style={{ padding: 2, border: 'none' }}><X size={14} /></button>
                </span>
              </div>
            ))}
          {chosen.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--cp-line-soft)', paddingTop: 10 }}><span>Total</span><span>{usd(total)}</span></div>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>Anything we should know? (optional)
                <textarea className="cp-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. please start after the 15th" />
              </label>
              <button className="cp-btn" onClick={request} disabled={sending}>{sending && <Loader2 size={14} className="animate-spin" />}Ask for an offer</button>
              <div className="cp-muted" style={{ fontSize: 12 }}>No payment now. Your team confirms the offer, then you decide.</div>
            </>
          )}
          {error && <div style={{ fontSize: 13, color: 'var(--cp-warm)' }}>{error}</div>}
        </aside>
      </div>
    </div>
  );
}

/* ─── Orders ────────────────────────────────────────────────────── */

const OFFER_PILL: Record<string, { text: string; bg: string; fg: string }> = {
  requested: { text: 'Being checked by your team', bg: 'var(--cp-warm-soft)', fg: 'var(--cp-warm)' },
  confirmed: { text: 'Ready for you', bg: 'var(--cp-accent-soft)', fg: 'var(--cp-accent)' },
  accepted:  { text: 'Accepted', bg: 'var(--cp-good-soft)', fg: 'var(--cp-good)' },
  declined:  { text: 'Not now', bg: 'var(--cp-line-soft)', fg: 'var(--cp-muted)' },
};

function Tracker({ steps, status }: { steps: { key: string; label: string }[]; status: string }) {
  const idx = steps.findIndex((s) => s.key === status);
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 4 }} aria-label="Order progress">
      {steps.map((s, n) => {
        const done = idx >= n;
        return (
          <li key={s.key} style={{ display: 'grid', gap: 6, justifyItems: 'center', textAlign: 'center' }} aria-current={n === idx ? 'step' : undefined}>
            <span style={{ width: '100%', height: 6, borderRadius: 999, background: done ? 'var(--cp-accent)' : 'var(--cp-line-soft)' }} />
            <span style={{ fontSize: 11, fontWeight: n === idx ? 700 : 500, color: done ? 'var(--cp-text)' : 'var(--cp-muted)' }}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrdersSection({ onSessionEnded }: { onSessionEnded: () => void }) {
  const [data, setData] = useState<{ offers: Offer[]; orders: Order[]; steps: { key: string; label: string }[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [thanks, setThanks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try { setData(await cp('cp_offers_orders')); setError(''); }
    catch (e: any) { if (e instanceof SessionEndedError) onSessionEnded(); else setError(e.message); }
  }, [onSessionEnded]);
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, action: string, extra: object) => {
    setBusy(key); setError('');
    try { await cp(action, extra); await load(); }
    catch (e: any) { if (e instanceof SessionEndedError) onSessionEnded(); else setError(e.message); }
    setBusy('');
  };

  if (!data) return error ? <div className="cp-card" style={{ padding: 20 }}>{error}</div> : <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><Loader2 className="animate-spin" /></div>;
  const openOffers = data.offers.filter((o) => o.status === 'requested' || o.status === 'confirmed');

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Title title="Orders" sub="Offers waiting for you, and every piece of work in progress." />
      {error && <div className="cp-card" style={{ padding: 14, fontSize: 14, color: 'var(--cp-warm)' }}>{error}</div>}

      {openOffers.map((o) => {
        const pill = OFFER_PILL[o.status];
        return (
          <section key={o.id} className="cp-card" style={{ padding: 20, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Offer from {day(o.created_at)}</div>
              <span className="cp-pill" style={{ background: pill.bg, color: pill.fg }}>{pill.text}</span>
            </div>
            {o.items.map((i, n) => (
              <div key={n} style={{ borderTop: '1px solid var(--cp-line-soft)', paddingTop: 10, display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontWeight: 600 }}>{i.name}</span><span style={{ fontWeight: 700 }}>{usd(i.price_cents)}</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, listStyle: 'disc' }}>{i.deliverables.map((d) => <li key={d}>{d}</li>)}</ul>
                <div className="cp-muted" style={{ fontSize: 12 }}>
                  {i.due_date ? `Ready by ${day(i.due_date)}` : `Ready about ${i.turnaround_days} days after payment`}
                  {i.team_note ? ` · Note from your team: ${i.team_note}` : ''}
                </div>
              </div>
            ))}
            {o.team_note && <div style={{ fontSize: 14, background: 'var(--cp-accent-soft)', borderRadius: 10, padding: 12 }}><b>From your team:</b> {o.team_note}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderTop: '1px solid var(--cp-line-soft)', paddingTop: 12 }}>
              <div><div style={{ fontWeight: 700, fontSize: 18 }}>Total {usd(o.total_cents)}</div>{o.valid_until && <div className="cp-muted" style={{ fontSize: 12 }}>Offer valid until {day(o.valid_until)}</div>}</div>
              {o.status === 'confirmed' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to="/c/talk" className="cp-btn cp-btn-ghost">Ask a question</Link>
                  <button className="cp-btn cp-btn-ghost" disabled={!!busy} onClick={() => act(o.id, 'cp_offer_decide', { offerId: o.id, decision: 'decline' })}>Not now</button>
                  <button className="cp-btn" disabled={!!busy} onClick={() => act(o.id, 'cp_offer_decide', { offerId: o.id, decision: 'accept' })}>
                    {busy === o.id && <Loader2 size={14} className="animate-spin" />}Accept offer
                  </button>
                </div>
              ) : <div className="cp-muted" style={{ fontSize: 13 }}>Manav S will confirm prices and dates — usually within one working day.</div>}
            </div>
          </section>
        );
      })}

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Your orders</h2>
        {data.orders.length === 0 && <div className="cp-card" style={{ padding: 20, fontSize: 14 }}>No orders yet. Pick something from <Link to="/c/improvements">Improvements</Link> when you're ready.</div>}
        {data.orders.map((o) => (
          <article key={o.id} className="cp-card" style={{ padding: 20, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{o.name}</div>
                <div className="cp-muted" style={{ fontSize: 13 }}>{usd(o.price_cents)}{o.due_date && o.status !== 'delivered' ? ` · due ${day(o.due_date)}` : ''}{o.assignee ? ` · ${o.assignee} is on it` : ''}</div>
              </div>
              {o.status === 'cancelled' && <span className="cp-pill" style={{ background: 'var(--cp-line-soft)', color: 'var(--cp-muted)' }}>Cancelled</span>}
            </div>
            {o.status !== 'cancelled' && <Tracker steps={data.steps} status={o.status} />}
            {o.status === 'awaiting_payment' && <div className="cp-muted" style={{ fontSize: 13 }}>Your team will send payment details. Work starts as soon as payment is received.</div>}
            {o.status === 'delivered' && (
              <div style={{ display: 'grid', gap: 10 }}>
                {o.delivered_note && <div style={{ fontSize: 14 }}>{o.delivered_note}</div>}
                {o.delivered_link && <a href={o.delivered_link} target="_blank" rel="noreferrer" className="cp-btn cp-btn-ghost" style={{ justifySelf: 'start' }}>See what was delivered <ArrowUpRight size={14} /></a>}
                {o.thanks
                  ? <div style={{ fontSize: 13, color: 'var(--cp-good)', display: 'flex', gap: 6, alignItems: 'center' }}><Heart size={14} />You said: “{o.thanks}”</div>
                  : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input className="cp-input" style={{ flex: '1 1 220px' }} placeholder="Say thanks to the team (optional message)" value={thanks[o.id] || ''} onChange={(e) => setThanks((t) => ({ ...t, [o.id]: e.target.value }))} aria-label="Thank-you message" />
                      <button className="cp-btn" disabled={!!busy} onClick={() => act(o.id, 'cp_order_thanks', { orderId: o.id, message: thanks[o.id] || 'Thank you!' })}><Heart size={14} />Say thanks</button>
                    </div>
                  )}
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
