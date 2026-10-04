/* Team → Calls. Prep is ready before every call (latest messages, wins,
   open orders and actions). Afterwards, paste the transcript or your notes:
   AI drafts the summary and the agreed actions, you check and send them.
   Owners also set the weekly hours clients can book. */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Sparkles, Send, Plus, Trash2, Settings2 } from 'lucide-react';
import PortalNav from '@/components/PortalNav';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

async function engine(body: object) {
  const r = await fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ success: false, error: 'Unexpected server reply' }));
}
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const input = 'h-9 rounded-lg border border-border bg-background/60 px-2 text-sm text-foreground';
const when = (iso: string, tz?: string) => new Date(iso).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

export default function TeamCalls() {
  const { isOwner } = useAuth();
  const [data, setData] = useState<any | null>(null);
  const [active, setActive] = useState<any | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    const r = await engine({ action: 'cps_calls_list' });
    if (!r?.success) { toast({ title: 'Calls unavailable', description: r?.error, variant: 'destructive' }); setData({ calls: [], settings: null }); return; }
    setData(r);
  }, []);
  useEffect(() => { load(); }, [load]);

  const now = Date.now();
  const upcoming = (data?.calls || []).filter((c: any) => c.status === 'booked' && new Date(c.starts_at).getTime() + c.minutes * 60_000 > now);
  const needsNotes = (data?.calls || []).filter((c: any) => c.status === 'booked' && new Date(c.starts_at).getTime() + c.minutes * 60_000 <= now);
  const done = (data?.calls || []).filter((c: any) => c.status === 'done').reverse();
  const tz = data?.settings?.timezone;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold">Calls</h1>
            <p className="text-sm text-muted-foreground">Prep is ready before every call. Afterwards, paste the transcript — the summary and actions are drafted for you.</p>
          </div>
          <button onClick={() => setShowSettings((v) => !v)} className="px-3 py-2 rounded-lg border border-border text-sm inline-flex items-center gap-1.5"><Settings2 className="h-4 w-4" />Booking hours</button>
        </div>
        {showSettings && data?.settings && <SettingsCard settings={data.settings} canEdit={isOwner} onSaved={load} />}
        {!data && <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {data && (
          <div className="grid md:grid-cols-[320px_1fr] gap-4">
            <div className="space-y-4">
              <List title="Needs notes" items={needsNotes} tz={tz} active={active} onPick={setActive} empty="All caught up." />
              <List title="Coming up" items={upcoming} tz={tz} active={active} onPick={setActive} empty="No calls booked." />
              <List title="Done (last 30 days)" items={done} tz={tz} active={active} onPick={setActive} empty="—" />
            </div>
            <div className="rounded-2xl border border-border bg-card/60 p-5 min-h-[360px]">
              {!active ? <div className="text-sm text-muted-foreground">Pick a call.</div> : <CallDetail key={active.id} call={active} tz={tz} onSent={() => { setActive(null); load(); }} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function List({ title, items, tz, active, onPick, empty }: any) {
  return (
    <div>
      <div className="text-sm font-semibold mb-2">{title} ({items.length})</div>
      <div className="rounded-2xl border border-border bg-card/60 divide-y divide-border overflow-hidden">
        {items.length === 0 && <div className="p-3 text-sm text-muted-foreground">{empty}</div>}
        {items.map((c: any) => (
          <button key={c.id} onClick={() => onPick(c)} className={`w-full text-left p-3 hover:bg-muted/40 ${active?.id === c.id ? 'bg-muted/60' : ''}`}>
            <div className="text-sm font-medium">{c.project?.name || 'Client'}</div>
            <div className="text-xs text-muted-foreground">{when(c.starts_at, tz)} · {c.topic}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CallDetail({ call, tz, onSent }: { call: any; tz?: string; onSent: () => void }) {
  const [prep, setPrep] = useState<any | null>(null);
  const [transcript, setTranscript] = useState(call.transcript || '');
  const [summary, setSummary] = useState(call.summary || call.summary_draft || '');
  const [actions, setActions] = useState<any[]>([]);
  const [busy, setBusy] = useState<'' | 'draft' | 'send'>('');
  const isPast = new Date(call.starts_at).getTime() <= Date.now();

  useEffect(() => { engine({ action: 'cps_call_prep', projectId: call.project_id }).then((r) => r?.success && setPrep(r)); }, [call.project_id]);

  const draft = async () => {
    setBusy('draft');
    const r = await engine({ action: 'cps_call_transcript', callId: call.id, transcript });
    setBusy('');
    if (!r?.success) { toast({ title: 'No draft', description: r?.error, variant: 'destructive' }); return; }
    setSummary(r.summary); setActions(r.actions || []);
  };
  const send = async () => {
    setBusy('send');
    const r = await engine({ action: 'cps_call_send_summary', callId: call.id, summary, actions });
    setBusy('');
    if (!r?.success) { toast({ title: 'Not sent', description: r?.error, variant: 'destructive' }); return; }
    toast({ title: 'Notes sent', description: 'The client sees them in Calls & notes.' });
    onSent();
  };
  const setAction = (i: number, patch: object) => setActions((a) => a.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-4">
      <div>
        <div className="font-semibold">{call.project?.name} <span className="text-xs text-muted-foreground font-normal">{call.project?.url}</span></div>
        <div className="text-sm text-muted-foreground">{when(call.starts_at, tz)} · {call.minutes} min · {call.topic}</div>
        {call.meeting_link && <a href={call.meeting_link} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">{call.meeting_link}</a>}
      </div>

      {prep && (
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <Prep title="Good news to open with" rows={prep.wins.map((w: any) => w.title)} empty="No wins recorded yet." />
          <Prep title="Open orders" rows={prep.orders.map((o: any) => `${o.name} — ${String(o.status).replace(/_/g, ' ')}`)} empty="None." />
          <Prep title="Open actions" rows={prep.actions.map((a: any) => `${a.what} (${a.owner})`)} empty="None." />
          <Prep title="Latest messages" rows={prep.messages.map((m: any) => `${m.author_type === 'client' ? 'Client' : 'Us'}: ${String(m.body).slice(0, 90)}`)} empty="None." />
        </div>
      )}

      {isPast && call.status !== 'done' && (
        <div className="space-y-3 border-t border-border pt-4">
          <label className="text-sm font-semibold block">Transcript or your notes
            <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={6} placeholder="Paste the Zoom/Meet transcript, or type quick notes"
              className="mt-1 w-full rounded-xl border border-border bg-background/60 p-3 text-sm font-normal" />
          </label>
          <button onClick={draft} disabled={!!busy || transcript.trim().length < 20} className="px-3 py-2 rounded-lg border border-border text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
            {busy === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Draft summary & actions
          </button>
          <label className="text-sm font-semibold block">Summary for the client (edit freely)
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-border bg-background/60 p-3 text-sm font-normal" />
          </label>
          <div className="space-y-2">
            <div className="text-sm font-semibold">What we agreed → actions</div>
            {actions.map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_150px_36px] gap-2">
                <input className={input} value={a.what} onChange={(e) => setAction(i, { what: e.target.value })} aria-label="Action" />
                <select className={input} value={a.owner} onChange={(e) => setAction(i, { owner: e.target.value })} aria-label="Who"><option value="team">Our team</option><option value="client">Client</option></select>
                <input type="date" className={input} value={a.due_date || ''} onChange={(e) => setAction(i, { due_date: e.target.value })} aria-label="Due" />
                <button onClick={() => setActions((x) => x.filter((_, k) => k !== i))} className="rounded-lg border border-border grid place-items-center" aria-label="Remove action"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button onClick={() => setActions((x) => [...x, { what: '', owner: 'team', due_date: '' }])} className="text-sm text-primary inline-flex items-center gap-1"><Plus className="h-4 w-4" />Add action</button>
          </div>
          <button onClick={send} disabled={!!busy || !summary.trim()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
            {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send notes & create actions
          </button>
        </div>
      )}
      {call.status === 'done' && <div className="border-t border-border pt-4 text-sm whitespace-pre-wrap"><div className="font-semibold mb-1">Sent to the client</div>{call.summary}</div>}
      {!isPast && <div className="text-sm text-muted-foreground border-t border-border pt-4">After the call, come back here to send the notes.</div>}
    </div>
  );
}

function Prep({ title, rows, empty }: { title: string; rows: string[]; empty: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-xs font-semibold text-muted-foreground mb-1">{title.toUpperCase()}</div>
      {rows.length ? rows.map((r, i) => <div key={i} className="truncate">· {r}</div>) : <div className="text-muted-foreground">{empty}</div>}
    </div>
  );
}

function SettingsCard({ settings, canEdit, onSaved }: { settings: any; canEdit: boolean; onSaved: () => void }) {
  const [s, setS] = useState<any>({ ...settings, weekly_hours: settings.weekly_hours || [] });
  const save = async () => {
    const r = await engine({ action: 'cps_call_settings_save', settings: s });
    if (!r?.success) { toast({ title: 'Not saved', description: r?.error, variant: 'destructive' }); return; }
    toast({ title: 'Booking hours saved' }); onSaved();
  };
  const setHour = (i: number, patch: object) => setS({ ...s, weekly_hours: s.weekly_hours.map((h: any, k: number) => (k === i ? { ...h, ...patch } : h)) });
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5 mb-5 space-y-3">
      {settings.missing && <div className="text-sm rounded-lg bg-amber-500/10 border border-amber-500/30 p-2">Run supabase-migrations/calls.sql in Supabase to turn booking on.</div>}
      {!canEdit && <div className="text-xs text-muted-foreground">Only owners can change booking hours.</div>}
      <div className="grid sm:grid-cols-3 gap-2">
        <label className="text-xs text-muted-foreground">Name clients see<input className={`${input} w-full`} disabled={!canEdit} value={s.host_name || ''} onChange={(e) => setS({ ...s, host_name: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">Email for booking alerts<input className={`${input} w-full`} disabled={!canEdit} value={s.host_email || ''} onChange={(e) => setS({ ...s, host_email: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">Meeting link (Meet/Zoom)<input className={`${input} w-full`} disabled={!canEdit} value={s.meeting_link || ''} onChange={(e) => setS({ ...s, meeting_link: e.target.value })} placeholder="https://meet.google.com/…" /></label>
        <label className="text-xs text-muted-foreground">Time zone<input className={`${input} w-full`} disabled={!canEdit} value={s.timezone || ''} onChange={(e) => setS({ ...s, timezone: e.target.value })} placeholder="America/Chicago" /></label>
        <label className="text-xs text-muted-foreground">Call length (minutes)<input className={`${input} w-full`} disabled={!canEdit} value={s.slot_minutes} onChange={(e) => setS({ ...s, slot_minutes: e.target.value })} inputMode="numeric" /></label>
        <label className="text-xs text-muted-foreground">Minimum notice (hours)<input className={`${input} w-full`} disabled={!canEdit} value={s.notice_hours} onChange={(e) => setS({ ...s, notice_hours: e.target.value })} inputMode="numeric" /></label>
      </div>
      <div className="text-sm font-semibold">Weekly hours</div>
      {s.weekly_hours.map((h: any, i: number) => (
        <div key={i} className="flex flex-wrap gap-2 items-center">
          <select className={input} disabled={!canEdit} value={h.weekday} onChange={(e) => setHour(i, { weekday: Number(e.target.value) })} aria-label="Day">{DAYS.map((d, k) => <option key={d} value={k}>{d}</option>)}</select>
          <input type="time" className={input} disabled={!canEdit} value={h.start} onChange={(e) => setHour(i, { start: e.target.value })} aria-label="From" />
          <span className="text-sm">to</span>
          <input type="time" className={input} disabled={!canEdit} value={h.end} onChange={(e) => setHour(i, { end: e.target.value })} aria-label="Until" />
          {canEdit && <button onClick={() => setS({ ...s, weekly_hours: s.weekly_hours.filter((_: any, k: number) => k !== i) })} className="text-sm text-muted-foreground" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ))}
      {canEdit && (
        <div className="flex gap-2">
          <button onClick={() => setS({ ...s, weekly_hours: [...s.weekly_hours, { weekday: 1, start: '10:00', end: '12:00' }] })} className="px-3 py-1.5 rounded-lg border border-border text-sm inline-flex items-center gap-1"><Plus className="h-4 w-4" />Add hours</button>
          <button onClick={save} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm">Save</button>
        </div>
      )}
    </div>
  );
}
