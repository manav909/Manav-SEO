/* Team → Offers & orders.
   Offers: confirm what a client asked for, or change prices, dates or
   deliverables first (with a note), then send it to them.
   Orders: payments happen on another platform, so the team moves each
   order through its steps by hand. Moving to "Payment received" needs the
   payment reference.
   Price list: owners edit what clients can pick from. */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Save, Heart } from 'lucide-react';
import PortalNav from '@/components/PortalNav';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

async function engine(body: object) {
  const r = await fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ success: false, error: 'Unexpected server reply' }));
}
const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 })}`;
const STEP_LABEL: Record<string, string> = {
  awaiting_payment: 'Waiting for payment', payment_received: 'Payment received', started: 'Started',
  in_progress: 'In progress', delivered: 'Delivered', cancelled: 'Cancelled',
};
const input = 'h-9 rounded-lg border border-border bg-background/60 px-2 text-sm text-foreground';

type Tab = 'offers' | 'orders' | 'prices';

export default function TeamOffers() {
  const { isOwner } = useAuth();
  const [tab, setTab] = useState<Tab>('offers');
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-xl font-bold">Offers & orders</h1>
        <p className="text-sm text-muted-foreground mb-5">Clients ask for offers from the price list. Confirm or adjust them, then track each order step by step.</p>
        <div className="flex gap-2 mb-5">
          {(['offers', 'orders', 'prices'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border ${tab === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card/60 text-muted-foreground'}`}>
              {t === 'offers' ? 'Offers' : t === 'orders' ? 'Orders' : 'Price list'}
            </button>
          ))}
        </div>
        {tab === 'offers' && <OffersTab />}
        {tab === 'orders' && <OrdersTab />}
        {tab === 'prices' && <PricesTab canEdit={isOwner} />}
      </div>
    </div>
  );
}

/* ─── Offers ────────────────────────────────────────────────────── */

function OffersTab() {
  const [offers, setOffers] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await engine({ action: 'cps_offers_list' });
    if (!r?.success) { toast({ title: 'Offers unavailable', description: r?.error, variant: 'destructive' }); setOffers([]); return; }
    setOffers(r.offers);
  }, []);
  useEffect(() => { load(); }, [load]);

  const startEdit = (o: any) => setEditing({ ...o, items: o.items.map((i: any) => ({ ...i, deliverablesText: (i.deliverables || []).join('\n'), price: (i.price_cents / 100).toString() })), validUntil: o.valid_until || '' });

  const confirm = async () => {
    setBusy(true);
    const r = await engine({
      action: 'cps_offer_confirm', offerId: editing.id, teamNote: editing.team_note, validUntil: editing.validUntil,
      items: editing.items.map((i: any) => ({ ...i, price_cents: Math.round(parseFloat(i.price || '0') * 100), deliverables: String(i.deliverablesText || '').split('\n') })),
    });
    setBusy(false);
    if (!r?.success) { toast({ title: 'Not sent', description: r?.error, variant: 'destructive' }); return; }
    toast({ title: 'Offer sent', description: 'The client can now accept it in their panel.' });
    setEditing(null); load();
  };

  const cancel = async (id: string) => {
    const r = await engine({ action: 'cps_offer_cancel', offerId: id });
    if (!r?.success) toast({ title: 'Not cancelled', description: r?.error, variant: 'destructive' });
    load();
  };

  if (!offers) return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (editing) {
    const total = editing.items.reduce((s: number, i: any) => s + Math.round(parseFloat(i.price || '0') * 100), 0);
    const setItem = (n: number, patch: object) => setEditing({ ...editing, items: editing.items.map((x: any, k: number) => (k === n ? { ...x, ...patch } : x)) });
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
        <div className="font-semibold">{editing.project?.name} — offer requested {new Date(editing.created_at).toLocaleDateString('en-US')}</div>
        {editing.client_note && <div className="text-sm rounded-lg bg-muted/50 p-3"><b>Client note:</b> {editing.client_note}</div>}
        {editing.items.map((i: any, n: number) => (
          <div key={n} className="rounded-xl border border-border p-4 grid gap-2">
            <div className="grid sm:grid-cols-[1fr_120px_120px_150px] gap-2">
              <input className={input} value={i.name} onChange={(e) => setItem(n, { name: e.target.value })} aria-label="Item name" />
              <label className="text-xs text-muted-foreground">Price $<input className={`${input} w-full`} value={i.price} onChange={(e) => setItem(n, { price: e.target.value })} inputMode="decimal" /></label>
              <label className="text-xs text-muted-foreground">Days<input className={`${input} w-full`} value={i.turnaround_days} onChange={(e) => setItem(n, { turnaround_days: e.target.value })} inputMode="numeric" /></label>
              <label className="text-xs text-muted-foreground">Ready by (optional)<input type="date" className={`${input} w-full`} value={i.due_date || ''} onChange={(e) => setItem(n, { due_date: e.target.value })} /></label>
            </div>
            <label className="text-xs text-muted-foreground">Deliverables (one per line — the client sees exactly this)
              <textarea className="w-full rounded-lg border border-border bg-background/60 p-2 text-sm" rows={3} value={i.deliverablesText} onChange={(e) => setItem(n, { deliverablesText: e.target.value })} />
            </label>
            <input className={input} placeholder="Note on this item (e.g. why the date moved)" value={i.team_note || ''} onChange={(e) => setItem(n, { team_note: e.target.value })} />
            {i.client_note && <div className="text-xs text-muted-foreground">Client asked: {i.client_note}</div>}
          </div>
        ))}
        <textarea className="w-full rounded-lg border border-border bg-background/60 p-3 text-sm" rows={3} placeholder="Message to the client with the offer (optional)" value={editing.team_note || ''} onChange={(e) => setEditing({ ...editing, team_note: e.target.value })} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm">Valid until <input type="date" className={input} value={editing.validUntil} onChange={(e) => setEditing({ ...editing, validUntil: e.target.value })} /> <span className="text-xs text-muted-foreground">(default 14 days)</span></label>
          <div className="flex gap-2 items-center">
            <span className="font-semibold">Total {usd(total)}</span>
            <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg border border-border text-sm">Back</button>
            <button onClick={confirm} disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">{busy ? 'Sending…' : 'Send offer to client'}</button>
          </div>
        </div>
      </div>
    );
  }

  const groups: [string, any[]][] = [
    ['Waiting for you', offers.filter((o) => o.status === 'requested')],
    ['Sent — waiting for the client', offers.filter((o) => o.status === 'confirmed')],
    ['Answered', offers.filter((o) => ['accepted', 'declined'].includes(o.status))],
  ];
  return (
    <div className="space-y-6">
      {groups.map(([label, list]) => (
        <div key={label}>
          <div className="text-sm font-semibold mb-2">{label} ({list.length})</div>
          <div className="rounded-2xl border border-border bg-card/60 divide-y divide-border">
            {list.length === 0 && <div className="p-4 text-sm text-muted-foreground">Nothing here.</div>}
            {list.map((o) => (
              <div key={o.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{o.project?.name || 'Client'} · {usd(o.total_cents)}</div>
                  <div className="text-xs text-muted-foreground truncate">{o.items.map((i: any) => i.name).join(', ')}</div>
                </div>
                <div className="flex gap-2">
                  {o.status === 'requested' && <button onClick={() => startEdit(o)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm">Review & send</button>}
                  {o.status === 'confirmed' && <button onClick={() => startEdit(o)} className="px-3 py-1.5 rounded-lg border border-border text-sm">Edit</button>}
                  {['requested', 'confirmed'].includes(o.status) && <button onClick={() => cancel(o.id)} className="px-3 py-1.5 rounded-lg border border-border text-sm">Cancel</button>}
                  {['accepted', 'declined'].includes(o.status) && <span className="text-xs font-semibold capitalize">{o.status}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Orders ────────────────────────────────────────────────────── */

function OrdersTab() {
  const [orders, setOrders] = useState<any[] | null>(null);
  const [edits, setEdits] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    const r = await engine({ action: 'cps_orders_list' });
    if (!r?.success) { toast({ title: 'Orders unavailable', description: r?.error, variant: 'destructive' }); setOrders([]); return; }
    setOrders(r.orders);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (o: any) => {
    const e = edits[o.id] || {};
    const r = await engine({ action: 'cps_order_update', orderId: o.id, ...e });
    if (!r?.success) { toast({ title: 'Not saved', description: r?.error, variant: 'destructive' }); return; }
    toast({ title: 'Order updated', description: e.status && e.status !== o.status ? 'The client has been told.' : undefined });
    setEdits((x) => ({ ...x, [o.id]: undefined })); load();
  };

  if (!orders) return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!orders.length) return <div className="rounded-2xl border border-border bg-card/60 p-5 text-sm text-muted-foreground">No orders yet — they appear when a client accepts an offer.</div>;
  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const e = edits[o.id] || {};
        const set = (patch: object) => setEdits((x) => ({ ...x, [o.id]: { ...(x[o.id] || {}), ...patch } }));
        return (
          <div key={o.id} className="rounded-2xl border border-border bg-card/60 p-4 grid gap-3">
            <div className="flex flex-wrap justify-between gap-2">
              <div><div className="font-semibold text-sm">{o.name}</div><div className="text-xs text-muted-foreground">{o.project?.name} · {usd(o.price_cents)}{o.due_date ? ` · due ${o.due_date}` : ''}</div></div>
              <span className="text-xs font-semibold">{STEP_LABEL[o.status]}</span>
            </div>
            {o.thanks && <div className="text-sm rounded-lg bg-emerald-500/10 p-2 flex gap-2 items-center"><Heart className="h-4 w-4 text-emerald-500" />Client said: “{o.thanks}”</div>}
            <div className="grid sm:grid-cols-4 gap-2">
              <select className={input} value={e.status ?? o.status} onChange={(ev) => set({ status: ev.target.value })} aria-label="Status">
                {Object.entries(STEP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input className={input} placeholder="Payment reference" value={e.paymentRef ?? o.payment_ref ?? ''} onChange={(ev) => set({ paymentRef: ev.target.value })} />
              <input className={input} placeholder="Who's doing it" value={e.assignee ?? o.assignee ?? ''} onChange={(ev) => set({ assignee: ev.target.value })} />
              <input type="date" className={input} value={e.dueDate ?? o.due_date ?? ''} onChange={(ev) => set({ dueDate: ev.target.value })} aria-label="Due date" />
            </div>
            {(e.status ?? o.status) === 'delivered' && (
              <div className="grid sm:grid-cols-2 gap-2">
                <input className={input} placeholder="Link to what was delivered" value={e.deliveredLink ?? o.delivered_link ?? ''} onChange={(ev) => set({ deliveredLink: ev.target.value })} />
                <input className={input} placeholder="Short note for the client" value={e.deliveredNote ?? o.delivered_note ?? ''} onChange={(ev) => set({ deliveredNote: ev.target.value })} />
              </div>
            )}
            <div className="flex justify-between items-center gap-2">
              <div className="text-[11px] text-muted-foreground truncate">{(o.history || []).slice(-3).map((h: any) => `${STEP_LABEL[h.status] || h.status} ${new Date(h.at).toLocaleDateString('en-US')}`).join(' → ')}</div>
              <button onClick={() => save(o)} disabled={!edits[o.id]} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-40 inline-flex items-center gap-1"><Save className="h-3.5 w-3.5" />Save</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Price list ────────────────────────────────────────────────── */

function PricesTab({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [draft, setDraft] = useState<any | null>(null);

  const load = useCallback(async () => {
    const r = await engine({ action: 'cps_catalog_list' });
    if (!r?.success) { toast({ title: 'Price list unavailable', description: r?.error, variant: 'destructive' }); setItems([]); return; }
    setItems(r.items);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const r = await engine({
      action: 'cps_catalog_save',
      item: { ...draft, price_cents: Math.round(parseFloat(draft.price || '0') * 100), deliverables: String(draft.deliverablesText || '').split('\n') },
    });
    if (!r?.success) { toast({ title: 'Not saved', description: r?.error, variant: 'destructive' }); return; }
    toast({ title: 'Saved' }); setDraft(null); load();
  };

  const edit = (i: any) => setDraft({ ...i, price: (i.price_cents / 100).toString(), deliverablesText: (i.deliverables || []).join('\n') });

  if (!items) return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  return (
    <div className="space-y-4">
      {!canEdit && <div className="text-sm text-muted-foreground">Only owners can change prices.</div>}
      {draft && (
        <div className="rounded-2xl border border-primary/40 bg-card/60 p-4 grid gap-2">
          <div className="grid sm:grid-cols-[1fr_120px_100px_140px] gap-2">
            <input className={input} placeholder="Name" value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <label className="text-xs text-muted-foreground">Price $<input className={`${input} w-full`} value={draft.price || ''} onChange={(e) => setDraft({ ...draft, price: e.target.value })} inputMode="decimal" /></label>
            <label className="text-xs text-muted-foreground">Days<input className={`${input} w-full`} value={draft.turnaround_days || ''} onChange={(e) => setDraft({ ...draft, turnaround_days: e.target.value })} inputMode="numeric" /></label>
            <label className="text-xs text-muted-foreground flex items-center gap-2 mt-4"><input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />Clients can see it</label>
          </div>
          <input className={input} placeholder="One-line summary for the client" value={draft.summary || ''} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
          <textarea className="w-full rounded-lg border border-border bg-background/60 p-2 text-sm" rows={4} placeholder="Deliverables, one per line" value={draft.deliverablesText || ''} onChange={(e) => setDraft({ ...draft, deliverablesText: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className="px-3 py-1.5 rounded-lg border border-border text-sm">Cancel</button>
            <button onClick={save} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm">Save</button>
          </div>
        </div>
      )}
      {canEdit && !draft && <button onClick={() => setDraft({ active: true, turnaround_days: 7 })} className="px-3 py-2 rounded-lg border border-border text-sm inline-flex items-center gap-1.5"><Plus className="h-4 w-4" />Add an item</button>}
      <div className="rounded-2xl border border-border bg-card/60 divide-y divide-border">
        {items.length === 0 && <div className="p-4 text-sm text-muted-foreground">No items yet.</div>}
        {items.map((i) => (
          <div key={i.id} className="p-4 flex flex-wrap justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-sm">{i.name} {!i.active && <span className="text-xs text-muted-foreground">(hidden)</span>}</div>
              <div className="text-xs text-muted-foreground">{(i.deliverables || []).join(' · ')}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-sm">{usd(i.price_cents)} · {i.turnaround_days}d</span>
              {canEdit && <button onClick={() => edit(i)} className="px-3 py-1.5 rounded-lg border border-border text-sm">Edit</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
