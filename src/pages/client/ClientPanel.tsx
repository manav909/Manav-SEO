/* ════════════════════════════════════════════════════════════════
   src/pages/client/ClientPanel.tsx
   The client panel: /c/home, /c/talk, /c/goals, /c/reports, /c/settings.

   Clients sign in with an emailed link (no password). The menu only
   shows what their plan switches on; good news comes first; the
   strategist (Manvisha) is on every screen. All data comes from the
   server for the signed-in client's own project.
═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, ArrowUpRight, Lock, Send, Moon, Sun, Heart } from 'lucide-react';
import { clientSessionResolve, getStoredClientSession, clearClientSession, type ClientSessionContext } from '@/components/brand-studio/api';
import { cp, goalProgress, METRIC_LABEL, SessionEndedError, type HomeData, type ChatMessage, type ClientGoal, type PanelInfo, type Win, type Milestone } from '@/lib/clientPanelApi';
import { ImprovementsSection, OrdersSection } from './MoneySections';
import { BookSection, CallsSection } from './CallSections';
import { HealthSection, AiVisibilitySection, FoundationsSummary } from './CheckSections';
import './clientPanel.css';

export type Section = 'home' | 'talk' | 'goals' | 'improvements' | 'orders' | 'book' | 'calls' | 'keywords' | 'health' | 'ai' | 'reports' | 'settings';

const NIGHT_KEY = 'seoseason_client_night';
function readNight(): boolean {
  try {
    const v = localStorage.getItem(NIGHT_KEY);
    if (v !== null) return v === '1';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch { return false; }
}

const fmt = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));
const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

/* ─── Shell ─────────────────────────────────────────────────────── */

export default function ClientPanel({ section }: { section: Section }) {
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<ClientSessionContext | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'signin'>('loading');
  const [night, setNight] = useState(readNight);

  useEffect(() => {
    const s = getStoredClientSession();
    if (!s?.token) { setState('signin'); return; }
    clientSessionResolve(s.token).then((r) => {
      if (r.error || !r.context) { clearClientSession(); setState('signin'); return; }
      setCtx(r.context);
      setState('ready');
    });
  }, []);

  const toggleNight = () => {
    setNight((n) => { try { localStorage.setItem(NIGHT_KEY, n ? '0' : '1'); } catch { /* ignore */ } return !n; });
  };

  const onSessionEnded = useCallback(() => setState('signin'), []);

  if (state === 'loading') {
    return <div className="cp" data-night={night}><div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Loader2 className="animate-spin" /></div></div>;
  }
  if (state === 'signin' || !ctx) {
    return (
      <div className="cp" data-night={night}>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div className="cp-card" style={{ maxWidth: 420, padding: 28, textAlign: 'center', display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 20 }}>Welcome back</div>
            <div className="cp-muted" style={{ fontSize: 14 }}>Sign in with the email your SEO Season team invited — we'll send you a link, no password needed.</div>
            <button className="cp-btn" onClick={() => navigate('/c/login')}>Email me a sign-in link</button>
          </div>
        </div>
      </div>
    );
  }

  const panel = ctx.panel as PanelInfo | undefined;
  const on = (k: string) => panel?.features?.[k] !== false;
  const strategist = 'Manvisha';
  const links: { to: string; label: string; key: Section; show: boolean }[] = [
    { to: '/c/home', label: 'Home', key: 'home', show: on('home') },
    { to: '/c/talk', label: `Talk to ${strategist}`, key: 'talk', show: on('strategist') },
    { to: '/c/goals', label: 'Goals & wins', key: 'goals', show: on('goals') },
    { to: '/c/improvements', label: 'Improvements', key: 'improvements', show: on('improvements') },
    { to: '/c/orders', label: 'Orders', key: 'orders', show: on('improvements') },
    { to: '/c/calls', label: 'Calls & notes', key: 'calls', show: on('calls') },
    { to: '/c/reports', label: 'Reports', key: 'reports', show: on('reports') },
    { to: '/c/health', label: 'Site health', key: 'health', show: on('site_health') },
    { to: '/c/keywords', label: 'Keywords', key: 'keywords', show: panel?.features?.keywords === true },
    { to: '/c/ai-visibility', label: 'AI visibility', key: 'ai', show: panel?.features?.ai_visibility === true },
  ];

  return (
    <div className="cp" data-night={night}>
      <div className="cp-shell" style={{ minHeight: '100vh', display: 'flex' }}>
        <nav aria-label="Main" className="cp-side" style={{ flex: '0 0 248px', maxWidth: 280, background: 'var(--cp-card)', borderRight: '1px solid var(--cp-line)', padding: '24px 16px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px 14px' }}>
            <span style={{ fontWeight: 700, fontSize: 18 }}>SEO Season</span>
            <button onClick={toggleNight} aria-label={night ? 'Switch to day mode' : 'Switch to night mode'} className="cp-btn cp-btn-ghost" style={{ padding: '6px 8px' }}>
              {night ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <div className="cp-side-extra" style={{ padding: '10px 12px', marginBottom: 12, border: '1px solid var(--cp-line)', borderRadius: 10 }}>
            <div className="cp-muted" style={{ fontSize: 12 }}>Project</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{ctx.project?.name || ctx.project?.url}</div>
            {panel && <div className="cp-muted" style={{ fontSize: 12, marginTop: 2 }}>{panel.plan_label} plan</div>}
          </div>
          <div className="cp-side-links" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {links.filter((l) => l.show).map((l) => (
              <Link key={l.key} to={l.to} className="cp-nav-link" aria-current={section === l.key ? 'page' : undefined}>{l.label}</Link>
            ))}
            <Link to="/c/settings" className="cp-nav-link" aria-current={section === 'settings' ? 'page' : undefined}>Settings</Link>
            {panel?.features?.brand_studio && <Link to="/c/workspace" className="cp-nav-link">Brand Studio</Link>}
          </div>
          <div className="cp-side-extra" style={{ marginTop: 'auto', padding: 14, border: '1px solid var(--cp-line)', borderRadius: 12, display: 'grid', gap: 10 }}>
            <StrategistBadge name={strategist} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/c/talk" className="cp-btn cp-btn-ghost" style={{ flex: 1, fontSize: 13, padding: '9px 0' }}>Message</Link>
              {on('calls') && <Link to="/c/book" className="cp-btn" style={{ flex: 1, fontSize: 13, padding: '9px 0' }}>Book a call</Link>}
            </div>
          </div>
        </nav>
        <main className="cp-main" style={{ flex: 1, minWidth: 0, padding: '28px 36px 48px', boxSizing: 'border-box', maxWidth: 1080 }}>
          {section === 'home' && <HomeSection onSessionEnded={onSessionEnded} />}
          {section === 'talk' && on('strategist') && <TalkSection onSessionEnded={onSessionEnded} me={ctx.user.display_name} />}
          {section === 'goals' && on('goals') && <GoalsSection onSessionEnded={onSessionEnded} />}
          {section === 'improvements' && on('improvements') && <ImprovementsSection onSessionEnded={onSessionEnded} onRequested={() => navigate('/c/orders')} />}
          {section === 'orders' && on('improvements') && <OrdersSection onSessionEnded={onSessionEnded} />}
          {section === 'book' && on('calls') && <BookSection onSessionEnded={onSessionEnded} />}
          {section === 'calls' && on('calls') && <CallsSection onSessionEnded={onSessionEnded} />}
          {section === 'health' && on('site_health') && <HealthSection onSessionEnded={onSessionEnded} />}
          {section === 'ai' && panel?.features?.ai_visibility && <AiVisibilitySection onSessionEnded={onSessionEnded} />}
          {section === 'keywords' && panel?.features?.keywords && <KeywordsSection onSessionEnded={onSessionEnded} />}
          {section === 'reports' && on('reports') && <ReportsSection onSessionEnded={onSessionEnded} />}
          {section === 'settings' && <SettingsSection ctx={ctx} panel={panel} night={night} toggleNight={toggleNight} onRenamed={(name) => setCtx({ ...ctx, user: { ...ctx.user, display_name: name } })} />}
        </main>
      </div>
    </div>
  );
}

function StrategistBadge({ name }: { name: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--cp-accent)', color: 'var(--cp-accent-ink)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14, flex: 'none' }}>{initials(name)}</span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
        <span className="cp-muted" style={{ fontSize: 12 }}>Your SEO strategist</span>
      </div>
    </div>
  );
}

/** Loads a cp_* action and handles sign-out / errors the same way everywhere. */
function useCp<T>(action: string, onSessionEnded: () => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setData(await cp<T>(action)); setError(''); }
    catch (e: any) { if (e instanceof SessionEndedError) onSessionEnded(); else setError(e.message); }
  }, [action, onSessionEnded]);
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}

function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: 'grid', gap: 4, marginBottom: 20 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{title}</h1>
      {sub && <span className="cp-muted" style={{ fontSize: 14 }}>{sub}</span>}
    </div>
  );
}

function Loading({ error }: { error?: string }) {
  if (error) return <div className="cp-card" style={{ padding: 20, fontSize: 14 }}>{error}</div>;
  return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><Loader2 className="animate-spin" /></div>;
}

/* ─── Home ──────────────────────────────────────────────────────── */

function goodNews(d: HomeData): string | null {
  const n = d.numbers;
  if (n?.change?.clicks?.direction === 'up' && n.change.clicks.pct > 0.02) {
    return `${fmt(n.clicks)} people found you on Google in the last 30 days — up ${Math.round(n.change.clicks.pct * 100)}% on the month before.`;
  }
  if (n?.change?.conversions?.direction === 'up' && n.conversions) {
    return `${fmt(n.conversions)} enquiries and bookings came in over the last 30 days — more than the month before.`;
  }
  if (n?.change?.impressions?.direction === 'up' && n.change.impressions.pct > 0.02) {
    return `Google showed your business ${fmt(n.impressions)} times in the last 30 days — up ${Math.round(n.change.impressions.pct * 100)}%.`;
  }
  const w = d.wins.find((x) => x.kind === 'page_2_to_1') || d.wins[0];
  if (w) return `“${w.query}” is climbing — you're now around position ${Math.round(w.position)} on Google.`;
  return null;
}

function winText(w: Win): string {
  const pos = Math.round(w.position);
  if (w.kind === 'page_2_to_1') return `Moved onto page 1 for “${w.query}” (position ${pos})`;
  if (w.kind === 'page_3_to_2') return `Climbed to page 2 for “${w.query}” (position ${pos})`;
  if (w.kind === 'first_appearance') return `Now showing on Google for “${w.query}”`;
  return `Climbing for “${w.query}” — now position ${pos}`;
}

function Tile({ label, value, delta, lowerIsBetter }: { label: string; value: string; delta?: { pct: number; direction: string } | null; lowerIsBetter?: boolean }) {
  const good = delta && delta.direction !== 'flat' && ((delta.direction === 'up') !== !!lowerIsBetter);
  return (
    <div className="cp-card" style={{ padding: 16, display: 'grid', gap: 4 }}>
      <span className="cp-muted" style={{ fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 26, fontWeight: 700 }}>{value}</span>
      {delta && delta.direction !== 'flat' && (
        <span style={{ fontSize: 12, fontWeight: 600, color: good ? 'var(--cp-good)' : 'var(--cp-muted)' }}>
          {delta.direction === 'up' ? '▲' : '▼'} {Math.abs(Math.round(delta.pct * 100))}% vs previous 30 days
        </span>
      )}
    </div>
  );
}

function HomeSection({ onSessionEnded }: { onSessionEnded: () => void }) {
  const { data, error } = useCp<HomeData>('cp_home', onSessionEnded);
  if (!data) return <Loading error={error} />;
  const first = (data.user.name || '').split(/\s+/)[0];
  const news = goodNews(data);
  const n = data.numbers;
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageTitle title={`Hello${first ? `, ${first}` : ''}`} sub={[data.project.name, data.project.url].filter(Boolean).join(' · ')} />

      <section className="cp-card" style={{ padding: 22, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <StrategistBadge name={data.strategist.name} />
        <div style={{ flex: '1 1 360px', fontSize: 16, lineHeight: 1.55 }}>
          {news
            ? <><b>Good news:</b> {news}</>
            : <>We're gathering your Google data. Your first numbers appear here within a few days of Search Console being connected — {data.strategist.name} will walk you through them.</>}
        </div>
        <Link to="/c/talk" className="cp-btn">{data.unreadMessages ? `${data.unreadMessages} new message${data.unreadMessages > 1 ? 's' : ''}` : `Message ${data.strategist.name}`}</Link>
      </section>

      {!n && data.panel?.features?.site_health && <FoundationsSummary onSessionEnded={onSessionEnded} />}

      {n && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Tile label="Visits from Google" value={fmt(n.clicks)} delta={n.change.clicks} />
          <Tile label="Times shown on Google" value={fmt(n.impressions)} delta={n.change.impressions} />
          {n.conversions != null && n.conversions > 0 && <Tile label="Enquiries & bookings" value={fmt(n.conversions)} delta={n.change.conversions} />}
          {n.avgPosition != null && n.avgPosition > 0 && <Tile label="Average Google position" value={n.avgPosition.toFixed(1)} delta={n.change.position} lowerIsBetter />}
        </section>
      )}

      {data.milestones?.length > 0
        ? <Milestones wins={data.milestones} onSessionEnded={onSessionEnded} title="Milestones" />
        : data.wins.length > 0 && (
          <section className="cp-card" style={{ padding: 20 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Recent wins</h2>
            {data.wins.map((w) => (
              <div key={w.query} style={{ padding: '10px 0', borderTop: '1px solid var(--cp-line-soft)', fontSize: 14 }}>{winText(w)}</div>
            ))}
          </section>
        )}

      {data.goals.length > 0 && (
        <section className="cp-card" style={{ padding: 20, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Your goals</h2>
            <Link to="/c/goals" style={{ fontSize: 13, fontWeight: 600 }}>See all</Link>
          </div>
          {data.goals.map((g) => <GoalRow key={g.id} g={g} />)}
        </section>
      )}

      {data.latestReport && (
        <section className="cp-card" style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div><div className="cp-muted" style={{ fontSize: 12 }}>Latest report</div><div style={{ fontWeight: 600 }}>{data.latestReport.title}</div></div>
          <a href={data.latestReport.link} target="_blank" rel="noreferrer" className="cp-btn cp-btn-ghost">Open report <ArrowUpRight size={14} /></a>
        </section>
      )}
    </div>
  );
}

/* ─── Goals ─────────────────────────────────────────────────────── */

function GoalRow({ g }: { g: ClientGoal }) {
  const p = goalProgress(g);
  const metric = METRIC_LABEL[g.metric] || g.metric;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</span>
        {g.onTrack === true && <span className="cp-pill" style={{ background: 'var(--cp-good-soft)', color: 'var(--cp-good)' }}>On track</span>}
      </div>
      {p != null && <div className="cp-bar" aria-label={`${Math.round(p * 100)}% of the way`}><span style={{ width: `${Math.max(4, p * 100)}%` }} /></div>}
      <span className="cp-muted" style={{ fontSize: 13 }}>
        {g.current != null ? `${fmt(g.current)} of ${fmt(g.target)} ${metric}` : `Target: ${fmt(g.target)} ${metric}`}
        {g.targetDate ? ` · by ${new Date(g.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
      </span>
    </div>
  );
}

function GoalsSection({ onSessionEnded }: { onSessionEnded: () => void }) {
  const { data, error } = useCp<{ goals: ClientGoal[]; wins: Win[]; limit: number | null }>('cp_goals', onSessionEnded);
  const stored = useCp<{ wins: Milestone[] }>('cp_wins', onSessionEnded);
  if (!data) return <Loading error={error} />;
  if (stored.data?.wins?.length) {
    return (
      <div style={{ display: 'grid', gap: 20 }}>
        <PageTitle title="Goals & wins" sub="What we're working towards together, and what's already gone well." />
        <section className="cp-card" style={{ padding: 20, display: 'grid', gap: 16 }}>
          {data.goals.length ? data.goals.map((g) => <GoalRow key={g.id} g={g} />)
            : <div style={{ fontSize: 14 }}>No goals yet. <Link to="/c/talk">Ask Manvisha</Link> to set your first goal with you.</div>}
        </section>
        <Milestones wins={stored.data.wins} onSessionEnded={onSessionEnded} title="Every win so far" />
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageTitle title="Goals & wins" sub="What we're working towards together, and what's already gone well." />
      <section className="cp-card" style={{ padding: 20, display: 'grid', gap: 16 }}>
        {data.goals.length
          ? data.goals.map((g) => <GoalRow key={g.id} g={g} />)
          : <div style={{ fontSize: 14 }}>No goals yet. <Link to="/c/talk">Ask Manvisha</Link> to set your first goal with you — something you can measure, like more bookings from Google.</div>}
      </section>
      {data.wins.length > 0 && (
        <section className="cp-card" style={{ padding: 20 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Wins so far</h2>
          {data.wins.map((w) => <div key={w.query} style={{ padding: '10px 0', borderTop: '1px solid var(--cp-line-soft)', fontSize: 14 }}>{winText(w)}</div>)}
        </section>
      )}
    </div>
  );
}

/* ─── Milestones (stored wins, with thanks) ─────────────────────── */

function Milestones({ wins, onSessionEnded, title }: { wins: Milestone[]; onSessionEnded: () => void; title: string }) {
  const [thanked, setThanked] = useState<Record<string, boolean>>({});
  const thank = async (id: string) => {
    try { await cp('cp_win_thanks', { winId: id, message: 'Thank you, team!' }); setThanked((t) => ({ ...t, [id]: true })); }
    catch (e: any) { if (e instanceof SessionEndedError) onSessionEnded(); else setThanked((t) => ({ ...t, [id]: true })); }
  };
  return (
    <section className="cp-card" style={{ padding: 20 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{title}</h2>
      {wins.map((w) => {
        const done = !!w.thanked_at || thanked[w.id];
        return (
          <div key={w.id} style={{ padding: '12px 0', borderTop: '1px solid var(--cp-line-soft)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{w.title}</div>
              <div className="cp-muted" style={{ fontSize: 12 }}>{new Date(w.happened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{w.detail ? ` · ${w.detail}` : ''}</div>
            </div>
            {done
              ? <span style={{ fontSize: 12, color: 'var(--cp-good)', display: 'inline-flex', gap: 4, alignItems: 'center' }}><Heart size={13} />Thanked</span>
              : <button className="cp-btn cp-btn-ghost" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => thank(w.id)}><Heart size={13} />Thank the team</button>}
          </div>
        );
      })}
    </section>
  );
}

/* ─── Keywords (daily positions) ────────────────────────────────── */

interface KeywordRow { query: string; position: number; clicks: number; impressions: number; change: number | null; series: { day: string; position: number }[]; since: string }

function Sparkline({ series }: { series: { position: number }[] }) {
  if (series.length < 2) return <span className="cp-muted" style={{ fontSize: 12 }}>Trend starts tomorrow</span>;
  const w = 120, h = 32, max = Math.max(...series.map((p) => p.position)), min = Math.min(...series.map((p) => p.position));
  const span = Math.max(1, max - min);
  // Position 1 is best, so better positions are drawn higher.
  const pts = series.map((p, i) => `${(i / (series.length - 1)) * w},${((p.position - min) / span) * (h - 4) + 2}`).join(' ');
  return <svg width={w} height={h} aria-hidden="true"><polyline points={pts} fill="none" stroke="var(--cp-accent)" strokeWidth="2" strokeLinejoin="round" /></svg>;
}

function KeywordsSection({ onSessionEnded }: { onSessionEnded: () => void }) {
  const { data, error } = useCp<{ keywords: KeywordRow[] }>('cp_keywords', onSessionEnded);
  if (!data) return <Loading error={error} />;
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageTitle title="Keywords" sub="Where you show up on Google for the searches that bring you visitors — saved every day, so you can see the trend." />
      <section className="cp-card" style={{ padding: 8, overflowX: 'auto' }}>
        {data.keywords.length === 0
          ? <div style={{ padding: 14, fontSize: 14 }}>Daily positions start being saved once Search Console is connected. Check back tomorrow.</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr className="cp-muted" style={{ fontSize: 12, textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>Search</th><th style={{ padding: '10px 12px' }}>Position</th><th style={{ padding: '10px 12px' }}>Last 30 days</th><th style={{ padding: '10px 12px' }}>Visits</th><th style={{ padding: '10px 12px' }}>Trend</th>
              </tr></thead>
              <tbody>
                {data.keywords.map((k) => (
                  <tr key={k.query} style={{ borderTop: '1px solid var(--cp-line-soft)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{k.query}</td>
                    <td style={{ padding: '10px 12px' }}>{k.position.toFixed(1)}</td>
                    <td style={{ padding: '10px 12px', color: k.change && k.change > 0 ? 'var(--cp-good)' : 'var(--cp-muted)', fontWeight: 600 }}>
                      {k.change == null || k.change === 0 ? 'Steady' : k.change > 0 ? `▲ up ${k.change}` : `▼ ${Math.abs(k.change)}`}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{fmt(k.clicks)}</td>
                    <td style={{ padding: '10px 12px' }}><Sparkline series={k.series} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>
    </div>
  );
}

/* ─── Reports ───────────────────────────────────────────────────── */

function ReportsSection({ onSessionEnded }: { onSessionEnded: () => void }) {
  const { data, error } = useCp<{ reports: { id: string; title: string; link: string; periodStart?: string; periodEnd?: string; sharedAt?: string }[] }>('cp_reports', onSessionEnded);
  if (!data) return <Loading error={error} />;
  const range = (a?: string, b?: string) => (a && b ? `${new Date(a).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(b).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : '');
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageTitle title="Reports" sub="Every report your team has shared with you." />
      <section className="cp-card" style={{ padding: 8 }}>
        {data.reports.length ? data.reports.map((r) => (
          <a key={r.id} href={r.link} target="_blank" rel="noreferrer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 12px', borderBottom: '1px solid var(--cp-line-soft)', textDecoration: 'none', color: 'var(--cp-text)' }}>
            <span><span style={{ fontWeight: 600, display: 'block' }}>{r.title}</span><span className="cp-muted" style={{ fontSize: 13 }}>{range(r.periodStart, r.periodEnd)}</span></span>
            <ArrowUpRight size={16} />
          </a>
        )) : <div style={{ padding: 14, fontSize: 14 }}>Your first monthly report will appear here once it's ready.</div>}
      </section>
    </div>
  );
}

/* ─── Talk to Manvisha ──────────────────────────────────────────── */

function TalkSection({ onSessionEnded, me }: { onSessionEnded: () => void; me: string }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [name, setName] = useState('Manvisha');
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await cp<{ messages: ChatMessage[]; strategist: { name: string } }>('cp_messages_list');
      setMessages(r.messages); setName(r.strategist.name); setError('');
    } catch (e: any) { if (e instanceof SessionEndedError) onSessionEnded(); else setError(e.message); }
  }, [onSessionEnded]);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setError('');
    try {
      const r = await cp<{ message: ChatMessage }>('cp_message_send', { body });
      setMessages((m) => [...(m || []), { ...r.message, from: 'client', name: me }]);
      setText('');
    } catch (e: any) { if (e instanceof SessionEndedError) onSessionEnded(); else setError(e.message); }
    setSending(false);
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <PageTitle title={`Talk to ${name}`} sub={`Ask anything about your website, your results or what to do next. ${name} usually replies within one working day.`} />
      <section className="cp-card" style={{ padding: 16, display: 'grid', gap: 10, minHeight: 320, alignContent: 'start' }}>
        {!messages && <Loading error={error} />}
        {messages && messages.length === 0 && (
          <div className="cp-muted" style={{ fontSize: 14, padding: 8 }}>
            No messages yet. Try: “What should we focus on this month?” or “Is my website ready for Google?”
          </div>
        )}
        {messages?.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: m.from === 'client' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '78%', padding: '10px 14px', borderRadius: 14, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5,
              background: m.from === 'client' ? 'var(--cp-bubble-me)' : 'var(--cp-bubble-team)',
              color: m.from === 'client' ? 'var(--cp-bubble-me-ink)' : 'var(--cp-text)',
              border: m.from === 'client' ? 'none' : '1px solid var(--cp-line)' }}>
              {m.from === 'team' && <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{m.name || name}</div>}
              {m.body}
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{new Date(m.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </section>
      {error && messages && <div style={{ fontSize: 13, color: 'var(--cp-warm)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <label htmlFor="cp-msg" style={{ position: 'absolute', left: -9999 }}>Message</label>
        <textarea id="cp-msg" className="cp-input" rows={2} value={text} placeholder={`Write to ${name}…`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ resize: 'vertical' }} />
        <button className="cp-btn" onClick={send} disabled={!text.trim() || sending} aria-label="Send">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}

/* ─── Settings ──────────────────────────────────────────────────── */

const LIVE_FEATURES = new Set(['home', 'strategist', 'calls', 'site_health', 'goals', 'improvements', 'keywords', 'ai_visibility', 'reports', 'brand_studio']);

const FEATURE_NAMES: Record<string, string> = {
  home: 'Home & wins', strategist: 'Talk to your strategist', calls: 'Calls & notes', reports: 'Monthly reports',
  connections: 'Google connections', site_health: 'Site health', goals: 'Goals & wins', improvements: 'Improvements & orders',
  keywords: 'Keywords & content', ai_visibility: 'AI visibility', backlinks: 'Backlinks & authority',
  deep_analysis: 'Deep analysis', custom_reports: 'Custom reports', white_label: 'Branded reports', brand_studio: 'Brand Studio',
};

function SettingsSection({ ctx, panel, night, toggleNight, onRenamed }: {
  ctx: ClientSessionContext; panel?: PanelInfo; night: boolean; toggleNight: () => void; onRenamed: (n: string) => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(ctx.user.display_name || '');
  const [saved, setSaved] = useState('');
  // Only list what has a screen today; the rest appear as each one ships.
  const included = useMemo(() => Object.entries(panel?.features || {}).filter(([k, v]) => v && LIVE_FEATURES.has(k)).map(([k]) => k), [panel]);
  const locked = useMemo(() => panel?.upgrade_previews
    ? Object.entries(panel?.availability || {}).filter(([k, a]) => a !== 'mandatory' && !panel.features[k]).map(([k]) => k)
    : [], [panel]);

  const save = async () => {
    try { const r = await cp<{ name: string }>('cp_settings_update', { displayName: name }); onRenamed(r.name); setSaved('Saved'); }
    catch (e: any) { setSaved(e.message); }
  };

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 720 }}>
      <PageTitle title="Settings" />
      <section className="cp-card" style={{ padding: 20, display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>Your name
          <input className="cp-input" value={name} onChange={(e) => { setName(e.target.value); setSaved(''); }} />
        </label>
        <div className="cp-muted" style={{ fontSize: 13 }}>Signed in as {ctx.user.email}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="cp-btn" onClick={save} disabled={!name.trim()}>Save</button>
          {saved && <span style={{ fontSize: 13 }}>{saved}</span>}
        </div>
      </section>
      <section className="cp-card" style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div><div style={{ fontWeight: 600 }}>Night mode</div><div className="cp-muted" style={{ fontSize: 13 }}>Easier on the eyes in the evening.</div></div>
        <button role="switch" aria-checked={night} onClick={toggleNight} className="cp-btn cp-btn-ghost">{night ? 'On' : 'Off'}</button>
      </section>
      {panel && (
        <section className="cp-card" style={{ padding: 20, display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 600 }}>Your plan: {panel.plan_label}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {included.map((k) => <span key={k} className="cp-pill" style={{ background: 'var(--cp-accent-soft)', color: 'var(--cp-accent)' }}>{FEATURE_NAMES[k] || k}</span>)}
          </div>
          {locked.length > 0 && (
            <>
              <div className="cp-muted" style={{ fontSize: 13, marginTop: 6 }}>Available to add — ask Manvisha what they'd do for you:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {locked.map((k) => (
                  <Link key={k} to="/c/talk" className="cp-pill" style={{ border: '1px solid var(--cp-line)', color: 'var(--cp-text-2)', textDecoration: 'none', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <Lock size={11} />{FEATURE_NAMES[k] || k}
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      <div><button className="cp-btn cp-btn-ghost" onClick={() => { clearClientSession(); navigate('/c/login'); }}>Sign out</button></div>
    </div>
  );
}
