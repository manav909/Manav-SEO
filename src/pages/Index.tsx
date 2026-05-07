import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';
import { SeoEngine } from '@/components/SeoEngine';
import {
  Sparkles, Star, TrendingUp, Brain, ShieldCheck,
  CheckCircle, Globe, BarChart3, Zap, ArrowRight,
  Lock, LogOut
} from 'lucide-react';

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

  const gradientText: React.CSSProperties = {
    background: 'linear-gradient(135deg,#6366f1 0%,#a78bfa 45%,#67e8f9 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };

  return (
    <div style={{ background: '#04040d', minHeight: '100vh', color: '#fff' }}>
      {showModal && <AuthModal onClose={() => setShowModal(false)} />}

      {/* ══ NAV ══ */}
      <nav className="glass-nav" style={{ position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                <button onClick={() => navigate('/dashboard')}
                  className="glass spa-card"
                  style={{ padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#a5b4fc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BarChart3 size={13} />Dashboard
                </button>
                <button onClick={() => navigate('/launchpad')}
                  className="glass spa-card"
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

      {/* ══ HERO ══ */}
      <section style={{ position: 'relative', overflow: 'hidden', minHeight: '92vh', display: 'flex', alignItems: 'center' }}>

        {/* Nebula orbs */}
        <div className="spa-nebula" style={{ position: 'absolute', top: '-15%', left: '-10%', width: '60vw', height: '80vh', borderRadius: '50%', background: 'radial-gradient(ellipse,rgba(99,102,241,0.18) 0%,transparent 68%)', pointerEvents: 'none' }} />
        <div className="spa-nebula" style={{ position: 'absolute', top: '10%', right: '-12%', width: '55vw', height: '70vh', borderRadius: '50%', background: 'radial-gradient(ellipse,rgba(139,92,246,0.14) 0%,transparent 68%)', pointerEvents: 'none', animationDelay: '-3s' }} />
        <div className="spa-nebula" style={{ position: 'absolute', bottom: 0, right: '15%', width: '40vw', height: '50vh', borderRadius: '50%', background: 'radial-gradient(ellipse,rgba(6,182,212,0.09) 0%,transparent 68%)', pointerEvents: 'none', animationDelay: '-5s' }} />

        {/* Photo panel */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {/* Atmosphere glow behind photo */}
          <div style={{ position: 'absolute', right: '2%', top: '5%', width: '50%', height: '85%', background: 'radial-gradient(ellipse at 60% 30%,rgba(99,102,241,0.22) 0%,rgba(139,92,246,0.1) 45%,transparent 70%)', zIndex: 1 }} />
          {/* Photo */}
          <img src="/manavseo.jpg" alt=""
            style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '58%', objectFit: 'cover', objectPosition: '30% 8%', zIndex: 2 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          {/* Left fade */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right,#04040d 32%,rgba(4,4,13,0.88) 48%,rgba(4,4,13,0.42) 68%,rgba(4,4,13,0.05) 100%)', zIndex: 3 }} />
          {/* Bottom fade */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(to top,#04040d,transparent)', zIndex: 4 }} />
        </div>

        {/* Floating depth badges */}
        <div className="spa-float-a spa-badge" style={{ position: 'absolute', top: '14%', right: '44%', zIndex: 10, animationDelay: '0.2s' }}>
          <div className="glass-strong spa-shimmer" style={{ borderRadius: 14, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ height: 8, width: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 10px #4ade80' }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>500+ Brands Grown</span>
          </div>
        </div>

        <div className="spa-float-b spa-badge" style={{ position: 'absolute', top: '28%', right: '7%', zIndex: 10, animationDelay: '0.4s' }}>
          <div className="glass" style={{ borderRadius: 18, padding: '16px 20px', textAlign: 'center', minWidth: 110 }}>
            <div style={{ fontSize: 28, fontWeight: 900, ...gradientText }}>↑40%</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>Avg Ranking Lift</div>
          </div>
        </div>

        <div className="spa-float-c spa-badge" style={{ position: 'absolute', bottom: '26%', right: '40%', zIndex: 10, animationDelay: '0.6s' }}>
          <div className="glass-strong" style={{ borderRadius: 14, padding: '9px 15px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={13} style={{ color: '#a5b4fc' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>AI-Native SEO</span>
          </div>
        </div>

        <div className="spa-float-a spa-badge" style={{ position: 'absolute', top: '52%', right: '5%', zIndex: 10, animationDelay: '0.8s' }}>
          <div className="glass" style={{ borderRadius: 16, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginBottom: 4 }}>
              {[1,2,3,4,5].map(i => <Star key={i} size={11} style={{ fill: '#facc15', color: '#facc15' }} />)}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>500+ Fiverr Reviews</div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 1280, margin: '0 auto', padding: '80px 28px', width: '100%' }}>
          <div style={{ maxWidth: 580 }}>

            <div className="glass spa-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '7px 16px', marginBottom: 28, animationDelay: '0s' }}>
              <div className="spa-nebula" style={{ height: 6, width: 6, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.05em' }}>
                AI-NATIVE SEO · FIVERR TOP RATED · 500+ BRANDS
              </span>
            </div>

            <h1 style={{ fontSize: 'clamp(2.3rem,4.5vw,3.7rem)', fontWeight: 800, lineHeight: 1.07, letterSpacing: '-0.02em', marginBottom: 20 }}>
              I'm Manav.<br />
              I architect the{' '}
              <span style={gradientText}>end-to-end digital growth</span>{' '}
              for brands that can't afford to fail.
            </h1>

            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.48)', marginBottom: 36, lineHeight: 1.65, maxWidth: 440 }}>
              Strategy is expensive. Guessing is even costlier.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginBottom: 36 }}>
              <button onClick={handlePortal} className="spa-btn"
                style={{ padding: '14px 32px', borderRadius: 16, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                {user && isApproved ? 'Go to Dashboard' : 'Access Client Portal'}
                <ArrowRight size={16} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.42)' }}>
                <CheckCircle size={15} style={{ color: '#4ade80' }} />
                No commitment required
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              {[
                { icon: Globe,       text: '30+ Countries' },
                { icon: ShieldCheck, text: 'Validation-First' },
                { icon: Zap,         text: 'AI-Native' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.36)' }}>
                  <Icon size={13} style={{ color: 'rgba(99,102,241,0.65)' }} />
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Floating quote card */}
        <div className="spa-float-b" style={{ position: 'absolute', bottom: '7%', left: 28, zIndex: 15, maxWidth: 310 }}>
          <div className="glass-strong spa-shimmer" style={{ borderRadius: 20, padding: '18px 22px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(99,102,241,0.8)', letterSpacing: '0.1em', marginBottom: 10 }}>
              MANAV · SEO SEASON
            </div>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.82)', lineHeight: 1.55, margin: '0 0 12px' }}>
              "I don't do vanity SEO. I build search authority that compounds."
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[1,2,3,4,5].map(i => <Star key={i} size={11} style={{ fill: '#facc15', color: '#facc15' }} />)}
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>500+ reviews on Fiverr</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══ TRUST STRIP ══ */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)', padding: '15px 28px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 32px' }}>
          {[
            { icon: Star,        text: 'Fiverr Top Rated Seller' },
            { icon: CheckCircle, text: '500+ Audits Delivered' },
            { icon: Brain,       text: 'AI-Native SEO Methodology' },
            { icon: Globe,       text: 'Clients in 30+ Countries' },
            { icon: ShieldCheck, text: 'Validation-First Approach' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.42)' }}>
              <Icon size={13} style={{ color: 'rgba(99,102,241,0.58)' }} />
              {text}
            </div>
          ))}
        </div>
      </div>

      {/* ══ STATS ══ */}
      <section style={{ padding: '80px 28px', position: 'relative', overflow: 'hidden' }}>
        <div className="spa-nebula" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '60vw', height: '50vh', background: 'radial-gradient(ellipse,rgba(99,102,241,0.07) 0%,transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(99,102,241,0.65)', marginBottom: 12 }}>THE NUMBERS</div>
            <h2 style={{ fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 800, margin: 0 }}>Results that speak for themselves</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            {[
              { value: '500+',  label: 'Brands Grown',     color: '#6366f1', sub: 'across 30+ countries' },
              { value: '↑ 40%', label: 'Avg Ranking Lift', color: '#4ade80', sub: 'within 90 days' },
              { value: '10x',   label: 'AI Citations',      color: '#a78bfa', sub: 'ChatGPT · Perplexity · Google AI' },
              { value: '94%',   label: 'Client Retention',  color: '#facc15', sub: 'clients stay 12+ months' },
            ].map(({ value, label, color, sub }) => (
              <div key={label} className="glass spa-float-b spa-card" style={{ borderRadius: 20, padding: '28px 22px', textAlign: 'center' }}>
                <div style={{ fontSize: 38, fontWeight: 900, color, marginBottom: 6, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SEO TOOL ══ */}
      <section style={{ padding: '0 28px 80px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div className="glass" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '7px 16px', marginBottom: 20 }}>
              <Zap size={12} style={{ color: '#6366f1' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em' }}>FREE SEO AUDIT TOOL</span>
            </div>
            <h2 style={{ fontSize: 'clamp(1.8rem,3vw,2.4rem)', fontWeight: 800, marginBottom: 12 }}>See Where You Stand in 60 Seconds</h2>
            <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 15, maxWidth: 500, margin: '0 auto' }}>
              Powered by the same AI framework used for every client. No fluff — just the truth.
            </p>
          </div>
          <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden' }}>
            <SeoEngine />
            {(!user || !isApproved) && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,13,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 24 }}>
                <div style={{ textAlign: 'center', maxWidth: 340, padding: 32 }}>
                  <div className="glass" style={{ height: 60, width: 60, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <Lock size={22} style={{ color: '#6366f1' }} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Client Portal Access Required</h3>
                  <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 13, marginBottom: 24, lineHeight: 1.65 }}>
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
      <section style={{ padding: '80px 28px', borderTop: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
        <div className="spa-nebula" style={{ position: 'absolute', top: 0, right: '5%', width: '45vw', height: '100%', background: 'radial-gradient(ellipse at top right,rgba(139,92,246,0.07) 0%,transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 52, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(99,102,241,0.65)', marginBottom: 16 }}>WHY SEO SEASON</div>
              <h2 style={{ fontSize: 'clamp(1.8rem,3vw,2.4rem)', fontWeight: 800, marginBottom: 20, lineHeight: 1.12 }}>
                Most agencies sell you reports.<br />I sell you results.
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.42)', lineHeight: 1.75, fontSize: 15, marginBottom: 30 }}>
                The SEO industry is broken. Agencies charge thousands for vanity metrics while your competitors steal your market share. Every strategy I run is validated before we scale it.
              </p>
              {[
                { icon: Brain,       text: 'AI-first methodology built for ChatGPT, Perplexity, and Google AI Overviews' },
                { icon: ShieldCheck, text: 'Validation before execution — we test before we spend' },
                { icon: TrendingUp,  text: 'Transparent dashboards showing real data, not agency spin' },
                { icon: Star,        text: 'Fiverr Top Rated with 500+ five-star audits delivered' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
                  <div className="glass" style={{ height: 32, width: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={14} style={{ color: '#6366f1' }} />
                  </div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.47)', lineHeight: 1.65, margin: 0, paddingTop: 6 }}>{text}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { title: 'AI Search Visibility',          desc: 'Get found in ChatGPT, Perplexity, and Google AI Overviews.', icon: Brain,       color: '#6366f1' },
                { title: 'Live Keyword Rankings',         desc: 'Real Google SERP positions verified live — not 3-month-old estimates.', icon: BarChart3,   color: '#06b6d4' },
                { title: 'Validation-First Strategy',    desc: 'Every tactic tested in a controlled sprint before scaling.', icon: ShieldCheck, color: '#4ade80' },
                { title: 'Executive Strategy Launchpad', desc: 'Premium dashboard showing your campaign phase and growth accelerators.', icon: Sparkles,    color: '#a78bfa' },
              ].map(({ title, desc, icon: Icon, color }) => (
                <div key={title} className="glass spa-card" style={{ borderRadius: 18, padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ height: 40, width: 40, borderRadius: 14, background: `${color}18`, border: `1px solid ${color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{title}</div>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', lineHeight: 1.65, margin: 0 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ CTA ══ */}
      <section style={{ padding: '100px 28px', borderTop: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
        <div className="spa-nebula" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '65vw', height: '65vh', background: 'radial-gradient(ellipse,rgba(99,102,241,0.13) 0%,transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 620, margin: '0 auto', textAlign: 'center' }}>
          <div className="glass" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '7px 16px', marginBottom: 28 }}>
            <div className="spa-nebula" style={{ height: 6, width: 6, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em' }}>LIMITED CLIENT SPOTS</span>
          </div>
          <h2 style={{ fontSize: 'clamp(2rem,4vw,3.2rem)', fontWeight: 900, marginBottom: 16, lineHeight: 1.1 }}>
            Ready to stop guessing<br />and start growing?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 16, marginBottom: 36, lineHeight: 1.65 }}>
            Join brands winning in AI-native search. Your personalised growth dashboard is waiting.
          </p>
          <button onClick={handlePortal} className="spa-btn"
            style={{ padding: '16px 40px', borderRadius: 18, fontSize: 16, display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            {user && isApproved ? 'Go to My Dashboard' : 'Request Client Portal Access'}
            <ArrowRight size={17} />
          </button>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>Approved clients only · Managed personally by Manav</p>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '26px 28px', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/manav.jpg" alt="Manav"
              style={{ height: 32, width: 32, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center 15%', border: '2px solid rgba(99,102,241,0.4)' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>SEO Season by Manav</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>I Don't Do Vanity SEO</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
            {[
              { icon: Star,        t: 'Fiverr Top Rated' },
              { icon: ShieldCheck, t: 'Data Private' },
              { icon: Globe,       t: 'AI-Native SEO' },
              { icon: Brain,       t: 'GEO + SEO' },
            ].map(({ icon: Icon, t }) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>
                <Icon size={11} style={{ color: 'rgba(99,102,241,0.45)' }} />{t}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>© 2026 SEO Season</div>
        </div>
      </footer>
    </div>
  );
}
