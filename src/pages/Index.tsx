import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';
import { SeoEngine } from '@/components/SeoEngine';
import { Button } from '@/components/ui/button';
import {
  Sparkles, Star, TrendingUp, Brain, ShieldCheck,
  CheckCircle, Globe, BarChart3, Zap, ArrowRight,
  Lock, LogOut
} from 'lucide-react';

/* ── Spatial glass mixin ── */
const glass = {
  background: 'rgba(255,255,255,0.035)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.07)',
} as React.CSSProperties;

const glassStrong = {
  background: 'rgba(255,255,255,0.055)',
  backdropFilter: 'blur(32px)',
  WebkitBackdropFilter: 'blur(32px)',
  border: '1px solid rgba(255,255,255,0.10)',
} as React.CSSProperties;

export default function Index() {
  const navigate = useNavigate();
  const { user, isApproved, authChecked, loading, signOut } = useAuth();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (authChecked && !loading && user && isApproved) navigate('/dashboard');
  }, [authChecked, loading, user, isApproved, navigate]);

  const handlePortal = () => {
    if (user && isApproved) { navigate('/dashboard'); return; }
    setShowModal(true);
  };

  return (
    <div style={{ background: '#04040d', minHeight: '100vh', color: '#fff', fontFamily: 'inherit' }}>

      {/* ── Global spatial keyframes ── */}
      <style>{`
        @keyframes float-a { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-14px)} }
        @keyframes float-b { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-9px)} }
        @keyframes float-c { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-18px)} }
        @keyframes nebula  { 0%,100%{opacity:0.35} 50%{opacity:0.65} }
        @keyframes shimmer { 0%{border-color:rgba(255,255,255,0.05)} 50%{border-color:rgba(99,102,241,0.25)} 100%{border-color:rgba(255,255,255,0.05)} }
        @keyframes badge-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .float-a { animation: float-a 6s ease-in-out infinite; }
        .float-b { animation: float-b 8s ease-in-out infinite; animation-delay: -2s; }
        .float-c { animation: float-c 5s ease-in-out infinite; animation-delay: -3.5s; }
        .nebula   { animation: nebula 7s ease-in-out infinite; }
        .shimmer  { animation: shimmer 4s ease-in-out infinite; }
        .spatial-badge { animation: badge-in 0.6s ease forwards; }
        .portal-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 40px rgba(99,102,241,0.45) !important; }
        .portal-btn { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .feat-card:hover { background: rgba(255,255,255,0.065) !important; border-color: rgba(99,102,241,0.2) !important; transform: translateY(-2px); }
        .feat-card { transition: background 0.2s, border-color 0.2s, transform 0.2s; }
      `}</style>

      {showModal && <AuthModal onClose={() => setShowModal(false)} />}

      {/* ══ NAV — glass bar floating above space ══ */}
      <nav style={{ ...glass, position: 'sticky', top: 0, zIndex: 30, borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/manav.jpg" alt="Manav"
              style={{ height: 36, width: 36, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center 15%', border: '2px solid rgba(99,102,241,0.6)', flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>SEO Season</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>by Manav</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {user && isApproved ? (
              <>
                <button onClick={() => navigate('/dashboard')}
                  style={{ ...glass, padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#a5b4fc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  className="feat-card">
                  <BarChart3 size={13} />Dashboard
                </button>
                <button onClick={() => navigate('/launchpad')}
                  style={{ ...glass, padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  className="feat-card">
                  <Sparkles size={13} />Launchpad
                </button>
                <button onClick={async () => { await signOut(); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: '8px' }}>
                  <LogOut size={15} />
                </button>
              </>
            ) : (
              <button onClick={handlePortal}
                className="portal-btn"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', padding: '9px 22px', borderRadius: 12, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', border: 'none', boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}>
                Client Portal
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ══ HERO — spatial scene ══ */}
      <section style={{ position: 'relative', overflow: 'hidden', minHeight: '92vh', display: 'flex', alignItems: 'center' }}>

        {/* Ambient nebula orbs — depth layer 0 */}
        <div className="nebula" style={{ position: 'absolute', top: '-10%', left: '-5%', width: '55vw', height: '70vh', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,102,241,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div className="nebula" style={{ position: 'absolute', top: '20%', right: '-10%', width: '50vw', height: '65vh', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(139,92,246,0.15) 0%, transparent 70%)', pointerEvents: 'none', animationDelay: '-3s' }} />
        <div className="nebula" style={{ position: 'absolute', bottom: '-5%', right: '20%', width: '40vw', height: '50vh', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(6,182,212,0.10) 0%, transparent 70%)', pointerEvents: 'none', animationDelay: '-5s' }} />

        {/* Manav image — depth layer 1, right side with atmospheric glow */}
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '52%', overflow: 'hidden', pointerEvents: 'none' }}>
          {/* Glow halo behind image */}
          <div style={{ position: 'absolute', top: '5%', left: '15%', right: '5%', bottom: '10%', background: 'radial-gradient(ellipse at 55% 35%, rgba(99,102,241,0.25) 0%, rgba(139,92,246,0.12) 40%, transparent 70%)', zIndex: 1 }} />
          <img src="/manavseo.jpg" alt="Manav"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 12%', zIndex: 2 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          {/* Left gradient blend */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #04040d 0%, rgba(4,4,13,0.7) 30%, rgba(4,4,13,0.15) 65%, transparent 100%)', zIndex: 3 }} />
          {/* Bottom fade */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%', background: 'linear-gradient(to top, #04040d, transparent)', zIndex: 4 }} />
        </div>

        {/* Floating spatial badges — depth layer 2 */}
        <div className="float-a spatial-badge" style={{ position: 'absolute', top: '12%', right: '46%', animationDelay: '0s' }}>
          <div style={{ ...glassStrong, borderRadius: 14, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }} className="shimmer">
            <div style={{ height: 8, width: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>500+ Brands Grown</span>
          </div>
        </div>

        <div className="float-b spatial-badge" style={{ position: 'absolute', top: '32%', right: '8%', animationDelay: '-1s' }}>
          <div style={{ ...glass, borderRadius: 16, padding: '14px 18px', textAlign: 'center', minWidth: 110 }}>
            <div style={{ fontSize: 26, fontWeight: 800, background: 'linear-gradient(135deg,#6366f1,#a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>↑40%</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Avg Ranking Lift</div>
          </div>
        </div>

        <div className="float-c spatial-badge" style={{ position: 'absolute', bottom: '22%', right: '38%', animationDelay: '-2s' }}>
          <div style={{ ...glassStrong, borderRadius: 14, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={14} style={{ color: '#a5b4fc' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>AI-Native SEO</span>
          </div>
        </div>

        <div className="float-a spatial-badge" style={{ position: 'absolute', top: '55%', right: '5%', animationDelay: '-4s' }}>
          <div style={{ ...glass, borderRadius: 16, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginBottom: 4 }}>
              {[1,2,3,4,5].map(i => <Star key={i} size={11} style={{ fill: '#facc15', color: '#facc15' }} />)}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>500+ Reviews</div>
          </div>
        </div>

        {/* Content — depth layer 3, foreground */}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 1280, margin: '0 auto', padding: '80px 28px', width: '100%' }}>
          <div style={{ maxWidth: 560 }}>

            {/* Badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...glass, borderRadius: 999, padding: '7px 16px', marginBottom: 28 }}>
              <div style={{ height: 6, width: 6, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1' }} className="nebula" />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.05em' }}>
                AI-NATIVE SEO · FIVERR TOP RATED · 500+ BRANDS
              </span>
            </div>

            {/* Headline */}
            <h1 style={{ fontSize: 'clamp(2.4rem, 4.8vw, 3.8rem)', fontWeight: 800, lineHeight: 1.06, letterSpacing: '-0.02em', marginBottom: 20, color: '#fff' }}>
              I'm Manav.{' '}
              <br />
              I architect the{' '}
              <span style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a78bfa 45%, #67e8f9 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                end-to-end digital growth
              </span>{' '}
              for brands that can't afford to fail.
            </h1>

            {/* Sub */}
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', marginBottom: 36, lineHeight: 1.6, maxWidth: 460 }}>
              Strategy is expensive. Guessing is even costlier.
            </p>

            {/* CTA */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginBottom: 40 }}>
              <button onClick={handlePortal} className="portal-btn"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', padding: '14px 32px', borderRadius: 16, fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', border: 'none', boxShadow: '0 4px 24px rgba(99,102,241,0.4)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {user && isApproved ? 'Go to Dashboard' : 'Access Client Portal'}
                <ArrowRight size={16} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                <CheckCircle size={15} style={{ color: '#4ade80' }} />
                No commitment required
              </div>
            </div>

            {/* Trust row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
              {[
                { icon: Globe,       text: '30+ Countries' },
                { icon: ShieldCheck, text: 'Validation-First' },
                { icon: Zap,         text: 'AI-Native' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  <Icon size={13} style={{ color: 'rgba(99,102,241,0.7)' }} />
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Floating quote card — depth layer 4 */}
        <div className="float-b" style={{ position: 'absolute', bottom: '8%', left: 28, zIndex: 15, maxWidth: 320 }}>
          <div style={{ ...glassStrong, borderRadius: 20, padding: '18px 22px' }} className="shimmer">
            <div style={{ fontSize: 11, color: 'rgba(99,102,241,0.8)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10 }}>MANAV · SEO SEASON</div>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.55, margin: 0, marginBottom: 12 }}>
              "I don't do vanity SEO. I build search authority that compounds."
            </p>
            <div style={{ display: 'flex', gap: 3 }}>
              {[1,2,3,4,5].map(i => <Star key={i} size={11} style={{ fill: '#facc15', color: '#facc15' }} />)}
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 6 }}>500+ reviews on Fiverr</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══ TRUST STRIP ══ */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', padding: '16px 28px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px 36px' }}>
          {[
            { icon: Star,        text: 'Fiverr Top Rated Seller' },
            { icon: CheckCircle, text: '500+ Audits Delivered' },
            { icon: Brain,       text: 'AI-Native SEO Methodology' },
            { icon: Globe,       text: 'Clients in 30+ Countries' },
            { icon: ShieldCheck, text: 'Validation-First Approach' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              <Icon size={13} style={{ color: 'rgba(99,102,241,0.6)' }} />
              {text}
            </div>
          ))}
        </div>
      </div>

      {/* ══ STATS FLOATING GRID ══ */}
      <section style={{ padding: '80px 28px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '60vw', height: '40vh', background: 'radial-gradient(ellipse, rgba(99,102,241,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(99,102,241,0.7)', marginBottom: 12 }}>THE NUMBERS</div>
            <h2 style={{ fontSize: 'clamp(1.8rem,3vw,2.6rem)', fontWeight: 800, color: '#fff', margin: 0 }}>Results that speak for themselves</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
            {[
              { value: '500+',  label: 'Brands Grown',     color: '#6366f1',  sub: 'across 30+ countries' },
              { value: '↑ 40%', label: 'Avg Ranking Lift', color: '#4ade80',  sub: 'within 90 days' },
              { value: '10x',   label: 'AI Citations',      color: '#a78bfa',  sub: 'ChatGPT · Perplexity · Google AI' },
              { value: '94%',   label: 'Client Retention',  color: '#facc15',  sub: 'clients stay 12+ months' },
            ].map(({ value, label, color, sub }) => (
              <div key={label} className="float-b feat-card" style={{ ...glass, borderRadius: 20, padding: '28px 24px', textAlign: 'center', cursor: 'default' }}>
                <div style={{ fontSize: 40, fontWeight: 900, color, marginBottom: 6, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SEO TOOL ══ */}
      <section style={{ padding: '0 28px 80px', position: 'relative' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...glass, borderRadius: 999, padding: '7px 16px', marginBottom: 20 }}>
              <Zap size={12} style={{ color: '#6366f1' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em' }}>FREE SEO AUDIT TOOL</span>
            </div>
            <h2 style={{ fontSize: 'clamp(1.8rem,3vw,2.4rem)', fontWeight: 800, color: '#fff', marginBottom: 12 }}>See Where You Stand in 60 Seconds</h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, maxWidth: 520, margin: '0 auto' }}>
              Powered by the same AI framework I use for every client. No fluff — just the truth.
            </p>
          </div>
          <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden' }}>
            <SeoEngine />
            {(!user || !isApproved) && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,13,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 24 }}>
                <div style={{ textAlign: 'center', maxWidth: 360 }}>
                  <div style={{ ...glass, height: 64, width: 64, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <Lock size={24} style={{ color: '#6366f1' }} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 10 }}>Client Portal Access Required</h3>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
                    The full audit tool is available to active clients. Sign in or request access to continue.
                  </p>
                  <button onClick={handlePortal} className="portal-btn"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', padding: '12px 28px', borderRadius: 14, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', border: 'none', boxShadow: '0 4px 20px rgba(99,102,241,0.4)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <ArrowRight size={15} />Access Portal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══ WHY MANAV ══ */}
      <section style={{ padding: '80px 28px', borderTop: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, right: '10%', width: '40vw', height: '100%', background: 'radial-gradient(ellipse at top, rgba(139,92,246,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 48, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(99,102,241,0.7)', marginBottom: 16 }}>WHY SEO SEASON</div>
              <h2 style={{ fontSize: 'clamp(1.8rem,3vw,2.4rem)', fontWeight: 800, color: '#fff', marginBottom: 20, lineHeight: 1.15 }}>
                Most agencies sell you reports.<br />I sell you results.
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.45)', lineHeight: 1.75, fontSize: 15, marginBottom: 32 }}>
                The SEO industry is broken. Agencies charge thousands for dashboards full of vanity metrics while your competitors quietly steal your market share. I built SEO Season to be different — every strategy is validated before we scale it.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { icon: Brain,       text: 'AI-first methodology built for ChatGPT, Perplexity, and Google AI Overviews' },
                  { icon: ShieldCheck, text: 'Validation before execution — we test before we spend' },
                  { icon: TrendingUp,  text: 'Transparent dashboards showing real data, not agency spin' },
                  { icon: Star,        text: 'Fiverr Top Rated with 500+ five-star audits delivered' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ ...glass, height: 32, width: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={14} style={{ color: '#6366f1' }} />
                    </div>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0, paddingTop: 6 }}>{text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { title: 'AI Search Visibility',          desc: 'Get found in ChatGPT, Perplexity, and Google AI Overviews — the new search frontier.',          icon: Brain,       color: '#6366f1' },
                { title: 'Live Keyword Rankings',         desc: 'Real Google SERP positions verified live — not cached estimates from 3 months ago.',             icon: BarChart3,   color: '#06b6d4' },
                { title: 'Validation-First Strategy',    desc: 'Every tactic tested in a controlled sprint before we scale it. No wasted budget.',               icon: ShieldCheck, color: '#4ade80' },
                { title: 'Executive Strategy Launchpad', desc: 'Premium client dashboard showing campaign phase, value realised, and growth accelerators.',        icon: Sparkles,    color: '#a78bfa' },
              ].map(({ title, desc, icon: Icon, color }) => (
                <div key={title} className="feat-card"
                  style={{ ...glass, borderRadius: 18, padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 16, cursor: 'default' }}>
                  <div style={{ height: 40, width: 40, borderRadius: 14, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', marginBottom: 4 }}>{title}</div>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ══ */}
      <section style={{ padding: '100px 28px', position: 'relative', overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Central glow */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '60vw', height: '60vh', background: 'radial-gradient(ellipse, rgba(99,102,241,0.12) 0%, transparent 65%)', pointerEvents: 'none' }} className="nebula" />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...glass, borderRadius: 999, padding: '7px 16px', marginBottom: 28 }}>
            <div style={{ height: 6, width: 6, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1' }} className="nebula" />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em' }}>LIMITED CLIENT SPOTS</span>
          </div>
          <h2 style={{ fontSize: 'clamp(2rem,4vw,3.2rem)', fontWeight: 900, color: '#fff', marginBottom: 16, lineHeight: 1.1 }}>
            Ready to stop guessing<br />and start growing?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 16, marginBottom: 36, lineHeight: 1.65 }}>
            Join brands winning in AI-native search. Your personalised growth dashboard is waiting.
          </p>
          <button onClick={handlePortal} className="portal-btn"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', padding: '16px 40px', borderRadius: 18, fontSize: 16, fontWeight: 700, color: '#fff', cursor: 'pointer', border: 'none', boxShadow: '0 4px 30px rgba(99,102,241,0.45)', display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            {user && isApproved ? 'Go to My Dashboard' : 'Request Client Portal Access'}
            <ArrowRight size={18} />
          </button>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
            Approved clients only · Managed personally by Manav
          </p>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '28px', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/manav.jpg" alt="Manav"
              style={{ height: 32, width: 32, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center 15%', border: '2px solid rgba(99,102,241,0.4)' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>SEO Season by Manav</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>I Don't Do Vanity SEO</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
            {[
              { icon: Star,        text: 'Fiverr Top Rated' },
              { icon: ShieldCheck, text: 'Data Private' },
              { icon: Globe,       text: 'AI-Native SEO' },
              { icon: Brain,       text: 'GEO + SEO' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                <Icon size={11} style={{ color: 'rgba(99,102,241,0.5)' }} />{text}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>© 2026 SEO Season</div>
        </div>
      </footer>

    </div>
  );
}
