import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';
import { SeoEngine } from '@/components/SeoEngine';
import {
  Sparkles, Star, TrendingUp, Brain, ShieldCheck,
  CheckCircle, Globe, BarChart3, Zap, ArrowRight,
  Lock, LogOut, Quote
} from 'lucide-react';

const gText: React.CSSProperties = {
  background: 'linear-gradient(135deg,#6366f1 0%,#a78bfa 50%,#67e8f9 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
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

      {/* ══ HERO — pure spatial, no background image ══ */}
      <section style={{ position: 'relative', overflow: 'hidden', minHeight: '95vh', display: 'flex', alignItems: 'center' }}>

        {/* Ambient light orbs */}
        <div className="spa-nebula" style={{ position: 'absolute', top: '-20%', left: '-15%', width: '70vw', height: '80vh', borderRadius: '50%', background: 'radial-gradient(ellipse,rgba(99,102,241,0.22) 0%,transparent 65%)', pointerEvents: 'none' }} />
        <div className="spa-nebula" style={{ position: 'absolute', top: '30%', right: '-20%', width: '60vw', height: '70vh', borderRadius: '50%', background: 'radial-gradient(ellipse,rgba(139,92,246,0.16) 0%,transparent 65%)', pointerEvents: 'none', animationDelay: '-3s' }} />
        <div className="spa-nebula" style={{ position: 'absolute', bottom: '-10%', left: '30%', width: '50vw', height: '60vh', borderRadius: '50%', background: 'radial-gradient(ellipse,rgba(6,182,212,0.10) 0%,transparent 65%)', pointerEvents: 'none', animationDelay: '-6s' }} />

        {/* Grid mesh subtle */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(99,102,241,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.03) 1px,transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 5, maxWidth: 1280, margin: '0 auto', padding: '60px 24px', width: '100%' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48, alignItems: 'center', justifyContent: 'space-between' }}>

            {/* LEFT — text */}
            <div style={{ flex: '1 1 460px', maxWidth: 600 }}>

              <div className="glass" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '7px 16px', marginBottom: 28 }}>
                <div className="spa-nebula" style={{ height: 6, width: 6, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 10px #6366f1', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.05em' }}>
                  AI-NATIVE SEO · FIVERR TOP RATED · 500+ BRANDS
                </span>
              </div>

              <h1 style={{ fontSize: 'clamp(2.4rem,5.5vw,4rem)', fontWeight: 900, lineHeight: 1.06, letterSpacing: '-0.025em', marginBottom: 22, color: '#fff' }}>
                I'm Manav.<br />
                I architect the<br />
                <span style={gText}>end-to-end<br />digital growth</span><br />
                for brands that<br className="block-mobile" /> can't afford to fail.
              </h1>

              <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.45)', marginBottom: 36, lineHeight: 1.7, maxWidth: 440 }}>
                Strategy is expensive.<br />Guessing is even costlier.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginBottom: 40 }}>
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { icon: Star,        text: 'Fiverr Top Rated' },
                  { icon: Globe,       text: '30+ Countries' },
                  { icon: ShieldCheck, text: 'Validation-First' },
                  { icon: Brain,       text: 'AI-Native' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="glass"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '5px 12px', fontSize: 11, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>
                    <Icon size={11} style={{ color: 'rgba(99,102,241,0.7)' }} />{text}
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT — contained photo card + floating stats */}
            <div style={{ flex: '0 0 auto', position: 'relative', alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>

              {/* Main photo frame — completely self-contained */}
              <div className="spa-float-b" style={{ position: 'relative', width: 'clamp(260px,28vw,360px)', flexShrink: 0 }}>
                {/* Glow behind card */}
                <div className="spa-nebula" style={{ position: 'absolute', inset: -32, borderRadius: '50%', background: 'radial-gradient(ellipse,rgba(99,102,241,0.3) 0%,transparent 65%)', filter: 'blur(24px)', zIndex: 0 }} />
                {/* Photo card */}
                <div style={{ position: 'relative', zIndex: 1, borderRadius: 28, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)', aspectRatio: '3/4', background: 'rgba(99,102,241,0.08)' }}>
                  <img src="/manavseo.jpg" alt="Manav"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  {/* Bottom glass info strip */}
                  <div className="glass-strong" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 18px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>Manav</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Founder, SEO Season</div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[1,2,3,4,5].map(i => <Star key={i} size={10} style={{ fill: '#facc15', color: '#facc15' }} />)}
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginLeft: 5 }}>500+ reviews</span>
                    </div>
                  </div>
                </div>

                {/* Floating badge — top left of card */}
                <div className="spa-float-a" style={{ position: 'absolute', top: -14, left: -24, zIndex: 3 }}>
                  <div className="glass-strong spa-shimmer" style={{ borderRadius: 14, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
                    <div style={{ height: 7, width: 7, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>500+ Brands</span>
                  </div>
                </div>

                {/* Floating badge — right of card */}
                <div className="spa-float-c" style={{ position: 'absolute', top: '30%', right: -28, zIndex: 3 }}>
                  <div className="glass" style={{ borderRadius: 16, padding: '14px 16px', textAlign: 'center', minWidth: 90 }}>
                    <div style={{ fontSize: 24, fontWeight: 900, ...gText, lineHeight: 1 }}>↑40%</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>Rankings</div>
                  </div>
                </div>

                {/* Floating badge — bottom right */}
                <div className="spa-float-a" style={{ position: 'absolute', bottom: 80, right: -22, zIndex: 3, animationDelay: '-2s' }}>
                  <div className="glass-strong" style={{ borderRadius: 12, padding: '8px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#a5b4fc' }}>AI-Native SEO</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quote — below the split, full width */}
          <div style={{ marginTop: 52 }}>
            <div className="glass spa-shimmer" style={{ borderRadius: 22, padding: '24px 28px', maxWidth: 640, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <Quote size={20} style={{ color: 'rgba(99,102,241,0.6)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, margin: '0 0 10px', fontStyle: 'italic' }}>
                  "I don't do vanity SEO. I build search authority that compounds — and I do it with AI as the engine, human strategy as the driver."
                </p>
                <div style={{ display: 'flex', items: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>— Manav, Founder SEO Season</span>
                  <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 6px' }}>·</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1,2,3,4,5].map(i => <Star key={i} size={11} style={{ fill: '#facc15', color: '#facc15' }} />)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ TRUST STRIP ══ */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)', padding: '14px 24px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 28px' }}>
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
        <div className="spa-nebula" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '55vw', height: '50vh', background: 'radial-gradient(ellipse,rgba(99,102,241,0.08) 0%,transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(99,102,241,0.65)', marginBottom: 10 }}>BY THE NUMBERS</div>
            <h2 style={{ fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 800, color: '#fff', margin: 0 }}>Results that speak for themselves</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            {[
              { value: '500+',  label: 'Brands Grown',    color: '#6366f1', sub: 'across 30+ countries' },
              { value: '↑ 40%', label: 'Ranking Lift',    color: '#4ade80', sub: 'within 90 days' },
              { value: '10x',   label: 'AI Citations',     color: '#a78bfa', sub: 'ChatGPT · Perplexity' },
              { value: '94%',   label: 'Client Retention', color: '#facc15', sub: '12+ month average' },
            ].map(({ value, label, color, sub }) => (
              <div key={label} className="glass spa-card spa-float-b" style={{ borderRadius: 20, padding: '28px 20px', textAlign: 'center' }}>
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
            <h2 style={{ fontSize: 'clamp(1.8rem,3vw,2.4rem)', fontWeight: 800, color: '#fff', marginBottom: 10 }}>See Where You Stand in 60 Seconds</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, maxWidth: 460, margin: '0 auto' }}>
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
        <div className="spa-nebula" style={{ position: 'absolute', top: 0, right: 0, width: '40vw', height: '100%', background: 'radial-gradient(ellipse at top right,rgba(139,92,246,0.08) 0%,transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 52, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(99,102,241,0.65)', marginBottom: 14 }}>WHY SEO SEASON</div>
              <h2 style={{ fontSize: 'clamp(1.8rem,3vw,2.4rem)', fontWeight: 800, color: '#fff', marginBottom: 18, lineHeight: 1.12 }}>
                Most agencies sell you reports.<br />I sell you results.
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.42)', lineHeight: 1.75, fontSize: 15, marginBottom: 28 }}>
                The SEO industry is broken. Agencies charge thousands for vanity metrics while your competitors steal your market share. Every strategy I run is validated before we scale it, every dollar protected before we invest it.
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
                { title: 'AI Search Visibility',         desc: 'Get found in ChatGPT, Perplexity, and Google AI Overviews — the new search frontier.',     icon: Brain,       color: '#6366f1' },
                { title: 'Live Keyword Rankings',        desc: 'Real SERP positions verified live — not 3-month-old cached estimates.',                     icon: BarChart3,   color: '#06b6d4' },
                { title: 'Validation-First Strategy',   desc: 'Every tactic is tested in a controlled sprint before we scale it. Zero wasted budget.',      icon: ShieldCheck, color: '#4ade80' },
                { title: 'Executive Strategy Launchpad',desc: 'Premium dashboard showing your campaign phase, value realised, and growth accelerators.',    icon: Sparkles,    color: '#a78bfa' },
              ].map(({ title, desc, icon: Icon, color }) => (
                <div key={title} className="glass spa-card" style={{ borderRadius: 18, padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
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

      {/* ══ CTA ══ */}
      <section style={{ padding: '100px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
        <div className="spa-nebula" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '65vw', height: '65vh', background: 'radial-gradient(ellipse,rgba(99,102,241,0.13) 0%,transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <div className="glass" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '7px 16px', marginBottom: 26 }}>
            <div className="spa-nebula" style={{ height: 6, width: 6, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em' }}>LIMITED CLIENT SPOTS</span>
          </div>
          <h2 style={{ fontSize: 'clamp(2rem,4vw,3.2rem)', fontWeight: 900, color: '#fff', marginBottom: 14, lineHeight: 1.1 }}>
            Ready to stop guessing<br />and start growing?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, marginBottom: 34, lineHeight: 1.65 }}>
            Join brands winning in AI-native search.<br />Your personalised growth dashboard is waiting.
          </p>
          <button onClick={handlePortal} className="spa-btn"
            style={{ padding: '16px 40px', borderRadius: 18, fontSize: 16, display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            {user && isApproved ? 'Go to My Dashboard' : 'Request Client Portal Access'}
            <ArrowRight size={17} />
          </button>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
            Approved clients only · Managed personally by Manav
          </p>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '24px', background: 'rgba(255,255,255,0.01)' }}>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
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
