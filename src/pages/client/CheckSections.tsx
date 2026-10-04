/* Client panel: Site health (foundations checklist) and AI visibility. */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, CheckCircle2, Circle, CircleDot, HelpCircle } from 'lucide-react';
import { cp, SessionEndedError } from '@/lib/clientPanelApi';

function Title({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: 'grid', gap: 4, marginBottom: 20 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{title}</h1>
      {sub && <span className="cp-muted" style={{ fontSize: 14 }}>{sub}</span>}
    </div>
  );
}
const Spin = () => <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><Loader2 className="animate-spin" /></div>;

function useLoad<T>(action: string, onSessionEnded: () => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setData(await cp<T>(action)); setError(''); }
    catch (e: any) { if (e instanceof SessionEndedError) onSessionEnded(); else setError(e.message); }
  }, [action, onSessionEnded]);
  useEffect(() => { load(); }, [load]);
  return { data, error };
}

/* ─── Site health ───────────────────────────────────────────────── */

interface CheckItem { key: string; label: string; status: 'good' | 'todo' | 'in_progress' | 'unknown'; detail?: string; source: 'auto' | 'team'; why?: string }
export interface HealthData { items: CheckItem[]; score: number | null; done: number; total: number; lastChecked?: string | null }

const STATUS: Record<string, { icon: any; color: string; text: string }> = {
  good:        { icon: CheckCircle2, color: 'var(--cp-good)', text: 'Done' },
  in_progress: { icon: CircleDot,    color: 'var(--cp-accent)', text: 'Nearly there' },
  todo:        { icon: Circle,       color: 'var(--cp-warm)', text: 'To do' },
  unknown:     { icon: HelpCircle,   color: 'var(--cp-muted)', text: 'Checking' },
};

export function HealthSection({ onSessionEnded }: { onSessionEnded: () => void }) {
  const { data, error } = useLoad<HealthData>('cp_site_health', onSessionEnded);
  if (!data) return error ? <div className="cp-card" style={{ padding: 20 }}>{error}</div> : <Spin />;
  const good = data.items.filter((i) => i.status === 'good');
  const rest = data.items.filter((i) => i.status !== 'good');
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Title title="Site health" sub="The foundations every website needs. We check your live site every week; a few things your team confirms with you." />
      {data.items.length === 0 && <div className="cp-card" style={{ padding: 20, fontSize: 14 }}>Your first check runs this week — results will appear here.</div>}
      {data.items.length > 0 && (
        <section className="cp-card" style={{ padding: 22, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {data.score != null && <div style={{ fontSize: 40, fontWeight: 700 }}>{data.score}<span className="cp-muted" style={{ fontSize: 16 }}> / 100</span></div>}
          <div style={{ fontSize: 15, lineHeight: 1.5, flex: '1 1 300px' }}>
            <b>{good.length} of {data.total}</b> foundations are in place{good.length ? ' — nice.' : '.'} {rest.length ? 'Everything left is listed below, most useful first.' : 'Everything is in place.'}
            {data.lastChecked && <div className="cp-muted" style={{ fontSize: 12, marginTop: 4 }}>Last checked {new Date(data.lastChecked).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
          </div>
        </section>
      )}
      {[['Still to do', rest], ['Done', good]].map(([label, list]: any) => list.length > 0 && (
        <section key={label} className="cp-card" style={{ padding: 8 }}>
          <div style={{ padding: '10px 12px', fontWeight: 700 }}>{label}</div>
          {list.map((i: CheckItem) => {
            const s = STATUS[i.status];
            const Icon = s.icon;
            return (
              <div key={i.key} style={{ display: 'flex', gap: 12, padding: '12px', borderTop: '1px solid var(--cp-line-soft)', alignItems: 'flex-start' }}>
                <Icon size={18} color={s.color} style={{ flex: 'none', marginTop: 2 }} aria-label={s.text} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{i.label}</div>
                  <div style={{ fontSize: 13 }}>{i.detail}</div>
                  {i.status !== 'good' && i.why && <div className="cp-muted" style={{ fontSize: 12, marginTop: 2 }}>Why it matters: {i.why}</div>}
                </div>
                <span className="cp-muted" style={{ fontSize: 11, flex: 'none' }}>{i.source === 'team' ? 'Checked by your team' : 'Checked automatically'}</span>
              </div>
            );
          })}
        </section>
      ))}
      {rest.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/c/improvements" className="cp-btn">See fixed-price fixes</Link>
          <Link to="/c/talk" className="cp-btn cp-btn-ghost">Ask Manvisha what to do first</Link>
        </div>
      )}
    </div>
  );
}

/** Compact version for Home when there are no Google numbers yet. */
export function FoundationsSummary({ onSessionEnded }: { onSessionEnded: () => void }) {
  const { data } = useLoad<HealthData>('cp_site_health', onSessionEnded);
  if (!data || !data.items.length) return null;
  const next = data.items.filter((i) => i.status !== 'good').slice(0, 3);
  return (
    <section className="cp-card" style={{ padding: 20, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Your website's foundations</h2>
        <Link to="/c/health" style={{ fontSize: 13, fontWeight: 600 }}>See all</Link>
      </div>
      <div style={{ fontSize: 14 }}><b>{data.done} of {data.total}</b> done. {next.length ? 'Next up:' : 'All in place — great start.'}</div>
      {next.map((i) => <div key={i.key} style={{ fontSize: 14, display: 'flex', gap: 8 }}><Circle size={14} color="var(--cp-warm)" style={{ marginTop: 3 }} />{i.label}</div>)}
    </section>
  );
}

/* ─── AI visibility ─────────────────────────────────────────────── */

interface Visibility {
  runs: { id: string; at: string; total: number; mentioned: number; linked: number }[];
  latest: null | {
    at: string;
    engines: { key: string; label: string; web: boolean }[];
    notChecked: string[];
    questions: { question: string; answers: { engine: string; mentioned: boolean; linked: boolean; excerpt: string }[] }[];
  };
}

export function AiVisibilitySection({ onSessionEnded }: { onSessionEnded: () => void }) {
  const { data, error } = useLoad<Visibility>('cp_ai_visibility', onSessionEnded);
  const [open, setOpen] = useState<string>('');
  if (!data) return error ? <div className="cp-card" style={{ padding: 20 }}>{error}</div> : <Spin />;
  const l = data.latest;
  const last = data.runs[data.runs.length - 1];
  const prev = data.runs[data.runs.length - 2];
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Title title="AI visibility" sub="When people ask AI assistants for a business like yours, do they mention you? We ask the questions your customers really search for, every week." />
      {!l && <div className="cp-card" style={{ padding: 20, fontSize: 14 }}>Your first check runs this week. Results will appear here.</div>}
      {l && last && (
        <>
          <section className="cp-card" style={{ padding: 22, display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 17 }}>
              Mentioned in <b>{last.mentioned} of {last.total}</b> answers across {l.engines.map((e) => e.label).join(', ')}.
              {prev && last.mentioned > prev.mentioned && <> That's <b style={{ color: 'var(--cp-good)' }}>up from {prev.mentioned}</b> last time.</>}
            </div>
            <div className="cp-muted" style={{ fontSize: 13 }}>
              Checked {new Date(l.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. AI answers change from day to day, so we look at the trend.
              {l.notChecked.length > 0 && ` Not checked: ${l.notChecked.join(', ')}.`}
            </div>
          </section>
          <section className="cp-card" style={{ padding: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr className="cp-muted" style={{ fontSize: 12, textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>Question people ask</th>
                {l.engines.map((e) => <th key={e.key} style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{e.label}{e.web ? ' (web)' : ''}</th>)}
              </tr></thead>
              <tbody>
                {l.questions.map((q) => (
                  <tr key={q.question} style={{ borderTop: '1px solid var(--cp-line-soft)', verticalAlign: 'top' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <button onClick={() => setOpen(open === q.question ? '' : q.question)} style={{ font: 'inherit', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--cp-text)', textAlign: 'left' }} aria-expanded={open === q.question}>{q.question}</button>
                      {open === q.question && q.answers.map((a) => a.excerpt && (
                        <div key={a.engine} className="cp-muted" style={{ fontSize: 12, marginTop: 6, whiteSpace: 'pre-wrap' }}><b>{l.engines.find((e) => e.key === a.engine)?.label}:</b> {a.excerpt.slice(0, 400)}{a.excerpt.length > 400 ? '…' : ''}</div>
                      ))}
                    </td>
                    {q.answers.map((a) => (
                      <td key={a.engine} style={{ padding: '10px 12px', fontWeight: 600, color: a.mentioned ? 'var(--cp-good)' : 'var(--cp-muted)' }}>
                        {a.mentioned ? (a.linked ? 'Mentioned + linked' : 'Mentioned') : 'Not yet'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className="cp-muted" style={{ fontSize: 13 }}>Tap a question to read what each assistant said. Want to show up more? <Link to="/c/talk">Ask Manvisha</Link> — or see the AI visibility fix in <Link to="/c/improvements">Improvements</Link>.</div>
        </>
      )}
    </div>
  );
}
