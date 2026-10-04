/* Client panel: Book a call, and Calls & notes (summaries + tracked actions). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, CalendarPlus, Video, Check } from 'lucide-react';
import { cp, SessionEndedError } from '@/lib/clientPanelApi';

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const fullLabel = (iso: string) => `${dayLabel(iso)} at ${timeLabel(iso)}`;

function Title({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: 'grid', gap: 4, marginBottom: 20 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{title}</h1>
      {sub && <span className="cp-muted" style={{ fontSize: 14 }}>{sub}</span>}
    </div>
  );
}
const Spin = () => <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><Loader2 className="animate-spin" /></div>;

function downloadIcs(ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'seo-season-call.ics'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const TOPICS = ['Is it worth the money?', 'Review my results', 'My new website', 'Questions about an offer'];

/* ─── Book a call ───────────────────────────────────────────────── */

export function BookSection({ onSessionEnded }: { onSessionEnded: () => void }) {
  const [data, setData] = useState<{ slots: string[]; minutes: number; host: string } | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [booked, setBooked] = useState<{ startsAt: string; meetingLink?: string; ics: string } | null>(null);

  const load = useCallback(async () => {
    try { setData(await cp('cp_call_slots')); setError(''); }
    catch (e: any) { if (e instanceof SessionEndedError) onSessionEnded(); else setError(e.message); }
  }, [onSessionEnded]);
  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const s of data?.slots || []) (out[dayLabel(s)] ||= []).push(s);
    return Object.entries(out);
  }, [data]);

  const book = async () => {
    setBusy(true); setError('');
    try { const r = await cp<{ call: any }>('cp_call_book', { startsAt: picked, topic }); setBooked(r.call); }
    catch (e: any) { if (e instanceof SessionEndedError) onSessionEnded(); else { setError(e.message); setPicked(''); load(); } }
    setBusy(false);
  };

  if (booked) {
    return (
      <div style={{ display: 'grid', gap: 20, maxWidth: 640 }}>
        <Title title="You're booked" />
        <section className="cp-card" style={{ padding: 22, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{fullLabel(booked.startsAt)}</div>
          <div className="cp-muted" style={{ fontSize: 14 }}>{data?.host || 'Manvisha'} will be there. We've emailed you a calendar invite too.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="cp-btn" onClick={() => downloadIcs(booked.ics)}><CalendarPlus size={15} />Add to my calendar</button>
            {booked.meetingLink && <a className="cp-btn cp-btn-ghost" href={booked.meetingLink} target="_blank" rel="noreferrer"><Video size={15} />Meeting link</a>}
            <Link className="cp-btn cp-btn-ghost" to="/c/calls">See my calls</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Title title="Book a call" sub={`A short call with ${data?.host || 'Manvisha'} — about ${data?.minutes || 20} minutes. Times are shown in your time zone.`} />
      {!data && (error ? <div className="cp-card" style={{ padding: 20 }}>{error}</div> : <Spin />)}
      {data && (
        <>
          <section className="cp-card" style={{ padding: 20, display: 'grid', gap: 10 }}>
            <label htmlFor="cp-topic" style={{ fontWeight: 600, fontSize: 14 }}>What would you like to talk about?</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TOPICS.map((t) => (
                <button key={t} className="cp-btn cp-btn-ghost" style={{ padding: '6px 10px', fontSize: 13, borderColor: topic === t ? 'var(--cp-accent)' : undefined }} onClick={() => setTopic(t)}>{t}</button>
              ))}
            </div>
            <input id="cp-topic" className="cp-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Or write your own" />
          </section>
          <section className="cp-card" style={{ padding: 20, display: 'grid', gap: 14 }}>
            {byDay.length === 0 && <div style={{ fontSize: 14 }}>No free times in the next two weeks. <Link to="/c/talk">Message Manvisha</Link> and we'll find one.</div>}
            {byDay.map(([day, slots]) => (
              <div key={day} style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{day}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {slots.map((s) => (
                    <button key={s} onClick={() => setPicked(s)} aria-pressed={picked === s}
                      className={`cp-btn${picked === s ? '' : ' cp-btn-ghost'}`} style={{ padding: '7px 12px', fontSize: 13 }}>{timeLabel(s)}</button>
                  ))}
                </div>
              </div>
            ))}
          </section>
          {error && <div style={{ fontSize: 13, color: 'var(--cp-warm)' }}>{error}</div>}
          <div><button className="cp-btn" disabled={!picked || busy} onClick={book}>{busy && <Loader2 size={14} className="animate-spin" />}{picked ? `Book ${fullLabel(picked)}` : 'Pick a time'}</button></div>
        </>
      )}
    </div>
  );
}

/* ─── Calls & notes ─────────────────────────────────────────────── */

interface Action { id: string; call_id: string; what: string; owner: 'team' | 'client'; due_date?: string; status: 'open' | 'done' }
interface CallRow { id: string; starts_at: string; minutes: number; topic?: string; meeting_link?: string; summary?: string; actions?: Action[] }

export function CallsSection({ onSessionEnded }: { onSessionEnded: () => void }) {
  const [data, setData] = useState<{ upcoming: CallRow[]; past: CallRow[]; openActions: Action[] } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await cp('cp_calls')); setError(''); }
    catch (e: any) { if (e instanceof SessionEndedError) onSessionEnded(); else setError(e.message); }
  }, [onSessionEnded]);
  useEffect(() => { load(); }, [load]);

  const act = async (action: string, extra: object) => {
    try { await cp(action, extra); await load(); }
    catch (e: any) { if (e instanceof SessionEndedError) onSessionEnded(); else setError(e.message); }
  };

  if (!data) return error ? <div className="cp-card" style={{ padding: 20 }}>{error}</div> : <Spin />;
  const ActionRow = ({ a }: { a: Action }) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--cp-line-soft)', fontSize: 14 }}>
      {a.owner === 'client'
        ? <input type="checkbox" checked={a.status === 'done'} onChange={(e) => act('cp_action_done', { actionId: a.id, done: e.target.checked })} aria-label={a.what} style={{ width: 16, height: 16 }} />
        : <span style={{ width: 16, display: 'inline-grid', placeItems: 'center' }}>{a.status === 'done' ? <Check size={15} color="var(--cp-good)" /> : '•'}</span>}
      <span style={{ flex: 1, textDecoration: a.status === 'done' ? 'line-through' : 'none', color: a.status === 'done' ? 'var(--cp-muted)' : undefined }}>{a.what}</span>
      <span className="cp-muted" style={{ fontSize: 12 }}>{a.owner === 'client' ? 'You' : 'Your team'}{a.due_date ? ` · ${new Date(a.due_date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</span>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Title title="Calls & notes" sub="Your upcoming calls, what we agreed, and who's doing what." />
      {error && <div style={{ fontSize: 13, color: 'var(--cp-warm)' }}>{error}</div>}
      <section className="cp-card" style={{ padding: 20, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Coming up</h2>
          <Link to="/c/book" className="cp-btn" style={{ padding: '7px 12px', fontSize: 13 }}>Book a call</Link>
        </div>
        {data.upcoming.length === 0 && <div className="cp-muted" style={{ fontSize: 14 }}>No calls booked.</div>}
        {data.upcoming.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--cp-line-soft)', paddingTop: 10 }}>
            <div><div style={{ fontWeight: 600 }}>{fullLabel(c.starts_at)}</div><div className="cp-muted" style={{ fontSize: 13 }}>{c.topic}</div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              {c.meeting_link && <a className="cp-btn cp-btn-ghost" href={c.meeting_link} target="_blank" rel="noreferrer" style={{ padding: '6px 10px', fontSize: 13 }}><Video size={14} />Join</a>}
              <button className="cp-btn cp-btn-ghost" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => act('cp_call_cancel', { callId: c.id })}>Cancel</button>
            </div>
          </div>
        ))}
      </section>
      {data.openActions.length > 0 && (
        <section className="cp-card" style={{ padding: 20 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Next steps</h2>
          {data.openActions.map((a) => <ActionRow key={a.id} a={a} />)}
        </section>
      )}
      {data.past.map((c) => (
        <section key={c.id} className="cp-card" style={{ padding: 20, display: 'grid', gap: 8 }}>
          <div className="cp-muted" style={{ fontSize: 12 }}>{fullLabel(c.starts_at)}{c.topic ? ` · ${c.topic}` : ''}</div>
          <div style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.summary}</div>
          {c.actions && c.actions.length > 0 && <div>{c.actions.map((a) => <ActionRow key={a.id} a={a} />)}</div>}
        </section>
      ))}
      {data.past.length === 0 && <div className="cp-muted" style={{ fontSize: 14 }}>Notes from your calls appear here after each call.</div>}
    </div>
  );
}
