import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';
import { SeoEngine } from '@/components/SeoEngine';
import {
  Sparkles, Star, TrendingUp, Brain, ShieldCheck,
  CheckCircle, Globe, BarChart3, Zap, ArrowRight,
  Lock, LogOut
} from 'lucide-react';

/* ── Twinkling star field ── */
const StarField = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf: number;
    type Star = { x: number; y: number; r: number; phase: number; spd: number };
    let stars: Star[] = [];

    const init = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      stars = Array.from({ length: 110 }, () => ({
        x:     Math.random() * canvas.width,
        y:     Math.random() * canvas.height,
        r:     Math.random() * 1.1 + 0.2,
        phase: Math.random() * 6.283,
        spd:   Math.random() * 0.007 + 0.002,
      }));
    };

    let t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        const a = 0.07 + 0.48 * (0.5 + 0.5 * Math.sin(s.phase + t * s.spd));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.283);
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        ctx.fill();
      }
      t++;
      raf = requestAnimationFrame(draw);
    };

    init();
    draw();
    const onResize = () => init();
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);

  return (
    <canvas ref={ref}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
  );
};

/* ── Gradient text helper ── */
const gText: React.CSSProperties = {
  background: 'linear-gradient(135deg,#6366f1 0%,#a78bfa 50%,#67e8f9 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};

/* ── Portal preview card — the actual product shown in the hero ── */
const PortalPreview = () => {
  const bars = [
    { label: 'LLM Visibility',    val: 68, color: '#6366f1' },
    { label: 'Google Health',     val: 82, color: '#06b6d4' },
    { label: 'Content Authority', val: 74, color: '#a78bfa' },
  ];
  return (
    <div className="glass-strong spa-shimmer"
      style={{ borderRadius: 24, padding: '22px 22px', position: 'relative', zIndex: 1 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div className="spa-nebula"
            style={{ height: 7, width: 7, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 10px #4ade80', flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>
            LIVE · SEO SEASON PORTAL
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>v2.6</span>
      </div>

      {/* Key stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { v: '500+', l: 'Brands',   c: '#6366f1' },
          { v: '↑40%', l: 'Rankings', c: '#4ade80' },
          { v: '94%',  l: 'Retained', c: '#a78bfa' },
        ].map(({ v, l, c }) => (
          <div key={l} style={{
            textAlign: 'center', padding: '12px 6px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: c, lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 5 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Score bars */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
        {bars.map(({ label, val, color }, i) => (
          <div key={label} style={{ marginBottom: i < bars.length - 1 ? 12 : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.44)' }}>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color }}>{val}/100</span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${val}%`, borderRadius: 3,
                background: `linear-gradient(90deg, ${color}66, ${color})`,
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Availability signal */}
      <div style={{
        marginTop: 16, padding: '11px 14px',
        background: 'rgba(99,102,241,0.08)',
        borderRadius: 12,
        border: '1px solid rgba(99,102,241,0.18)',
      }}>
        <div style={{ fontSize: 9, color: 'rgba(99,102,241,0.7)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 3 }}>
          CURRENT AVAILABILITY
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
          1 client spot open in your industry
        </div>
      </div>
    </div>
  );
};

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
    <div style={{ background: '#04040d', minHeight: '100vh', color: '#fff', overflowX: 'hidden' }}>
      {showModal && <AuthModal onClose={() => setShowModal(false)} />}

      {/* ══ NAV ══ */}
      <nav className="glass-nav" style={{ position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '13px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/manav.jpg" alt="Manav"
              style={{ height: 36, width: 36, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center 15%', border: '2px solid rgba(99,102,241,0.55)', flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>SEO Season</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>by Manav</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {user && isApproved ? (
              <>
                <button onClick={() => navigate('/dashboard')} className="glass spa-card"
                  style={{ padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#a5b4fc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BarChart3 size={13} />Dashboard
                </button>
                <button onClick={() => navigate('/launchpad')} className="glass spa-card"
                  style={{ padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={13} />Launchpad
                </button>
                <button onClick={async () => { await signOut(); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 8 }}>
                  <LogOut size={15} />
                </button>
              </>
            ) : (
              <button onClick={handlePortal} className="spa-btn"
                style={{ padding: '9px 22px', borderRadius: 12, fontSize: 13 }}>
                Client Portal
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ══ HERO — spatial world ══ */}
      <section style={{ position: 'relative', overflow: 'hidden', minHeight: '96vh', display: 'flex', alignItems: 'center' }}>

        {/* Layer 0: Star field */}
        <StarField />

        {/* Layer 1: Nebula atmosphere */}
        <div className="spa-nebula" style={{ position: 'absolute', top: '-25%', left: '-15%', width: '70vw', height: '80vh', borderRadius: '50%', background: 'radial-gradient(ellipse,rgba(99,102,241,0.22) 0%,transparent 65%)', pointerEvents: 'none' }} />
        <div className="spa-nebula" style={{ position: 'absolute', top: '15%', right: '-18%', width: '60vw', height: '70vh', borderRadius: '50%', background: 'radial-gradient(ellipse,rgba(139,92,246,0.15) 0%,transparent 65%)', pointerEvents: 'none', animationDelay: '-3.5s' }} />
        <div className="spa-nebula" style={{ position: 'absolute', bottom: '-15%', left: '25%', width: '45vw', height: '55vh', borderRadius: '50%', background: 'radial-gradient(ellipse,rgba(6,182,212,0.09) 0%,transparent 65%)', pointerEvents: 'none', animationDelay: '-6s' }} />

        {/* Layer 2: Precision grid */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.022) 1px,transparent 1px)',
          backgroundSize: '64px 64px',
        }} />

        {/* Layer 3+: Content */}
        <div style={{ position: 'relative', zIndex: 5, maxWidth: 1280, margin: '0 auto', padding: '64px 24px', width: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 56, alignItems: 'center' }}>

            {/* LEFT: The declaration */}
            <div style={{ maxWidth: 600 }}>

              {/* Status badge */}
              <div className="glass" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '7px 16px', marginBottom: 30 }}>
                <div className="spa-nebula" style={{ height: 6, width: 6, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 10px #6366f1', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.055em' }}>
                  AI-NATIVE SEO · FIVERR TOP RATED · 500+ BRANDS
                </span>
              </div>

              {/* Headline — each line carries weight */}
              <h1 style={{ fontWeight: 900, lineHeight: 1.06, letterSpacing: '-0.025em', marginBottom: 22, color: '#fff', fontSize: 'clamp(2.4rem,5.2vw,3.9rem)' }}>
                I'm Manav.<br />
                I architect the<br />
                <span style={gText}>end-to-end<br />digital growth</span><br />
                for brands that<br />
                can't afford to fail.
              </h1>

              {/* Subheading */}
              <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.44)', marginBottom: 36, lineHeight: 1.7, maxWidth: 420 }}>
                Strategy is expensive.<br />Guessing is even costlier.
              </p>

              {/* CTA row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginBottom: 36 }}>
                <button onClick={handlePortal} className="spa-btn"
                  style={{ padding: '15px 34px', borderRadius: 16, fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                  {user && isApproved ? 'Go to Dashboard' : 'Access Client Portal'}
                  <ArrowRight size={16} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>
                  <CheckCircle size={14} style={{ color: '#4ade80', flexShrink: 0 }} />
                  No commitment required
                </div>
              </div>

              {/* Trust pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {[
                  { icon: Star,        text: 'Fiverr Top Rated' },
                  { icon: Globe,       text: '30+ Countries' },
                  { icon: ShieldCheck, text: 'Validation-First' },
                  { icon: Brain,       text: 'AI-Native' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="glass"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '5px 13px', fontSize: 11, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>
                    <Icon size={11} style={{ color: 'rgba(99,102,241,0.7)', flexShrink: 0 }} />{text}
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT: Portal preview — what they're getting */}
            <div className="spa-float-b" style={{ position: 'relative', minWidth: 0 }}>

              {/* Atmospheric glow behind the card */}
              <div className="spa-nebula" style={{
                position: 'absolute', inset: -50, borderRadius: '50%',
                background: 'radial-gradient(ellipse,rgba(99,102,241,0.28) 0%,transparent 68%)',
                filter: 'blur(28px)', pointerEvents: 'none',
              }} />

              {/* Floating badge — top right of card */}
              <div className="spa-float-a" style={{ position: 'absolute', top: -18, right: -12, zIndex: 4 }}>
                <div className="glass-strong" style={{ borderRadius: 12, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <ShieldCheck size={12} style={{ color: '#4ade80', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>Fiverr Top Rated</span>
                </div>
              </div>

              {/* Main portal preview */}
              <PortalPreview />

              {/* Floating badge — bottom left of card */}
              <div className="spa-float-c" style={{ position: 'absolute', bottom: 70, left: -20, zIndex: 4 }}>
                <div className="glass-strong" style={{ borderRadius: 12, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Brain size={12} style={{ color: '#a5b4fc', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>AI-Native SEO</span>
                </div>
              </div>

              {/* Client review card */}
              <div className="glass spa-float-a" style={{ borderRadius: 18, padding: '16px 18px', marginTop: 16, position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 9 }}>
                  {[1,2,3,4,5].map(i => <Star key={i} size={11} style={{ fill: '#facc15', color: '#facc15' }} />)}
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', marginLeft: 7 }}>500+ Fiverr reviews</span>
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', fontStyle: 'italic', lineHeight: 1.55, margin: '0 0 8px' }}>
                  "The most transparent SEO partner I've worked with. Real data, real results."
                </p>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>— Verified Fiverr Client</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ TRUST STRIP ══ */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)', padding: '14px 24px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 30px' }}>
          {[
            { icon: Star,        text: 'Fiverr Top Rated Seller' },
            { icon: CheckCircle, text: '500+ Audits Delivered' },
            { icon: Brain,       text: 'AI-Native SEO Methodology' },
            { icon: Globe,       text: 'Clients in 30+ Countries' },
            { icon: ShieldCheck, text: 'Validation-First Approach' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              <Icon size={12} style={{ color: 'rgba(99,102,241,0.55)', flexShrink: 0 }} />{text}
            </div>
          ))}
        </div>
      </div>

      {/* ══ STATS ══ */}
      <section style={{ padding: '80px 24px', position: 'relative', overflow: 'hidden' }}>
        <div className="spa-nebula" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '55vw', height: '50vh', background: 'radial-gradient(ellipse,rgba(99,102,241,0.07) 0%,transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(99,102,241,0.65)', marginBottom: 10 }}>BY THE NUMBERS</div>
            <h2 style={{ fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 800, color: '#fff', margin: 0 }}>
              Results that speak for themselves
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            {[
              { value: '500+',  label: 'Brands Grown',    color: '#6366f1', sub: 'across 30+ countries' },
              { value: '↑ 40%', label: 'Ranking Lift',    color: '#4ade80', sub: 'within 90 days' },
              { value: '10x',   label: 'AI Citations',     color: '#a78bfa', sub: 'ChatGPT · Perplexity' },
              { value: '94%',   label: 'Client Retention', color: '#facc15', sub: '12+ month average' },
            ].map(({ value, label, color, sub }) => (
              <div key={label} className="glass spa-card spa-float-b"
                style={{ borderRadius: 20, padding: '26px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, fontWeight: 900, color, marginBottom: 6, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)' }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SEO TOOL ══ */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div className="glass" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '7px 16px', marginBottom: 18 }}>
              <Zap size={12} style={{ color: '#6366f1' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em' }}>FREE SEO AUDIT TOOL</span>
            </div>
            <h2 style={{ fontSize: 'clamp(1.8rem,3vw,2.4rem)', fontWeight: 800, color: '#fff', marginBottom: 10 }}>
              See Where You Stand in 60 Seconds
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, maxWidth: 480, margin: '0 auto' }}>
              Powered by the same AI framework used for every client. No fluff — just the truth.
            </p>
          </div>
          <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden' }}>
            <SeoEngine />
            {(!user || !isApproved) && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,13,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 24 }}>
                <div style={{ textAlign: 'center', maxWidth: 340, padding: 28 }}>
                  <div className="glass" style={{ height: 60, width: 60, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                    <Lock size={22} style={{ color: '#6366f1' }} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 10 }}>Client Portal Access Required</h3>
                  <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 13, marginBottom: 22, lineHeight: 1.65 }}>
                    The full audit tool is available to active clients. Sign in or request access to continue.
                  </p>
                  <button onClick={handlePortal} className="spa-btn"
                    style={{ padding: '12px 28px', borderRadius: 14, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <ArrowRight size={15} />Access Portal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══ WHY MANAV ══ */}
      <section style={{ padding: '80px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
        <div className="spa-nebula" style={{ position: 'absolute', top: 0, right: 0, width: '40vw', height: '100%', background: 'radial-gradient(ellipse at top right,rgba(139,92,246,0.07) 0%,transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 52, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(99,102,241,0.65)', marginBottom: 14 }}>
                WHY SEO SEASON
              </div>
              <h2 style={{ fontSize: 'clamp(1.8rem,3vw,2.4rem)', fontWeight: 800, color: '#fff', marginBottom: 18, lineHeight: 1.12 }}>
                Most agencies sell you reports.<br />I sell you results.
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.42)', lineHeight: 1.75, fontSize: 15, marginBottom: 28 }}>
                The SEO industry is broken. Agencies charge thousands for vanity metrics while your
                competitors steal your market share. Every strategy I run is validated before we scale it —
                every dollar protected before we invest it.
              </p>
              {[
                { icon: Brain,       text: 'AI-first methodology built for ChatGPT, Perplexity, and Google AI Overviews' },
                { icon: ShieldCheck, text: 'Validation before execution — we test before we spend' },
                { icon: TrendingUp,  text: 'Transparent dashboards showing real data, not agency spin' },
                { icon: Star,        text: 'Fiverr Top Rated with 500+ five-star audits delivered' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                  <div className="glass" style={{ height: 30, width: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <Icon size={13} style={{ color: '#6366f1' }} />
                  </div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.47)', lineHeight: 1.65, margin: 0 }}>{text}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { title: 'AI Search Visibility',         desc: 'Get found in ChatGPT, Perplexity, and Google AI Overviews — the new search frontier.',    icon: Brain,       color: '#6366f1' },
                { title: 'Live Keyword Rankings',        desc: 'Real SERP positions verified live — not 3-month-old cached estimates.',                    icon: BarChart3,   color: '#06b6d4' },
                { title: 'Validation-First Strategy',   desc: 'Every tactic tested in a controlled sprint before we scale it. Zero wasted budget.',        icon: ShieldCheck, color: '#4ade80' },
                { title: 'Executive Strategy Launchpad',desc: 'Premium dashboard showing campaign phase, value realised, and growth accelerators.',        icon: Sparkles,    color: '#a78bfa' },
              ].map(({ title, desc, icon: Icon, color }) => (
                <div key={title} className="glass spa-card"
                  style={{ borderRadius: 18, padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ height: 38, width: 38, borderRadius: 13, background: `${color}18`, border: `1px solid ${color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', marginBottom: 4 }}>{title}</div>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', lineHeight: 1.65, margin: 0 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ CTA WITH MANAV PRESENCE ══ */}
      <section className="cta-img-section"
        style={{ padding: '100px 24px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>

        {/* manavseo.jpg — right side, face visible */}
        <div className="cta-img-wrap">
          <img
            src="/manavseo.jpg"
            alt=""
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        {/* Gradient overlay — seals the blend */}
        <div className="cta-img-overlay" />

        {/* Content — left side */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 540 }}>

            <div className="glass" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '7px 16px', marginBottom: 26 }}>
              <div className="spa-nebula" style={{ height: 6, width: 6, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em' }}>
                LIMITED CLIENT SPOTS
              </span>
            </div>

            <h2 style={{ fontSize: 'clamp(2rem,4vw,3.2rem)', fontWeight: 900, color: '#fff', marginBottom: 16, lineHeight: 1.1 }}>
              Ready to stop guessing<br />and start growing?
            </h2>

            <p style={{ color: 'rgba(255,255,255,0.44)', fontSize: 16, marginBottom: 32, lineHeight: 1.72, maxWidth: 420 }}>
              I work with a select few clients at a time.
              Your personalised growth portal — with live rankings,
              AI citations, and a strategy built around your brand — is waiting.
            </p>

            {/* Trust signals */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 36 }}>
              {[
                { icon: CheckCircle, text: 'Real-time growth dashboard — live every day',  color: '#4ade80' },
                { icon: Brain,       text: 'AI-verified keyword rankings, no guesswork',   color: '#6366f1' },
                { icon: ShieldCheck, text: 'Personally managed by Manav, not an agency',   color: '#a78bfa' },
                { icon: Star,        text: 'Fiverr Top Rated · 500+ five-star clients',    color: '#facc15' },
              ].map(({ icon: Icon, text, color }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.62)' }}>
                  <Icon size={15} style={{ color, flexShrink: 0 }} />{text}
                </div>
              ))}
            </div>

            <button onClick={handlePortal} className="spa-btn"
              style={{ padding: '16px 42px', borderRadius: 18, fontSize: 16, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              {user && isApproved ? 'Go to My Dashboard' : 'Request Client Portal Access'}
              <ArrowRight size={17} />
            </button>

            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 14 }}>
              Approved clients only · Managed personally by Manav
            </p>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '26px 24px', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/manav.jpg" alt="Manav"
              style={{ height: 32, width: 32, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center 15%', border: '2px solid rgba(99,102,241,0.4)' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>SEO Season by Manav</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>I Don't Do Vanity SEO</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
            {[
              { icon: Star,        t: 'Fiverr Top Rated' },
              { icon: ShieldCheck, t: 'Data Private' },
              { icon: Globe,       t: 'AI-Native SEO' },
              { icon: Brain,       t: 'GEO + SEO' },
            ].map(({ icon: Icon, t }) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.26)' }}>
                <Icon size={11} style={{ color: 'rgba(99,102,241,0.42)' }} />{t}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>© 2026 SEO Season</div>
        </div>
      </footer>
    </div>
  );
}
