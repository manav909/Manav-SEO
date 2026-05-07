import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';
import { SeoEngine } from '@/components/SeoEngine';
import { Button } from '@/components/ui/button';
import {
  Sparkles, Star, TrendingUp, Brain, ShieldCheck,
  CheckCircle, Globe, BarChart3, Zap, ArrowRight,
  Lock, LogOut, Quote
} from 'lucide-react';

export default function Index() {
  const navigate  = useNavigate();
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
    <div className="min-h-screen bg-background text-foreground">
      {showModal && <AuthModal onClose={() => setShowModal(false)} />}

      {/* ══ NAV ══ */}
      <nav className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/manav.jpg" alt="Manav"
              className="h-9 w-9 rounded-full object-cover ring-2 ring-primary shrink-0"
              style={{ objectPosition: 'center 15%' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div className="leading-tight">
              <div className="font-bold text-sm">SEO Season</div>
              <div className="text-xs text-muted-foreground">by Manav</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user && isApproved ? (
              <>
                <Button size="sm" onClick={() => navigate('/dashboard')}
                  className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-xs h-8 px-4">
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" />Dashboard
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate('/launchpad')}
                  className="border-border text-xs h-8 px-3">
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />Launchpad
                </Button>
                <Button size="sm" variant="ghost"
                  onClick={async () => { await signOut(); }}
                  className="h-8 w-8 p-0 text-muted-foreground">
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={handlePortal}
                className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-xs h-8 px-4">
                Client Portal
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* ══ HERO — split layout ══ */}
      <section className="relative overflow-hidden bg-background">
        {/* Subtle background glows */}
        <div className="absolute top-0 left-0 h-[500px] w-[500px] rounded-full bg-primary/6 blur-[120px] pointer-events-none -translate-x-1/2 -translate-y-1/4" />
        <div className="absolute top-0 right-0 h-[400px] w-[400px] rounded-full bg-purple-500/6 blur-[100px] pointer-events-none translate-x-1/3 -translate-y-1/4" />

        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-2 gap-0 items-stretch min-h-[560px]">

            {/* LEFT — copy */}
            <div className="flex flex-col justify-center py-16 pr-0 lg:pr-10">
              {/* Badge */}
              <div className="inline-flex w-fit items-center gap-2 text-xs font-mono text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5 mb-7">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                AI-Native SEO · Fiverr Top Rated · 500+ Brands
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl xl:text-[56px] font-bold leading-[1.08] tracking-tight mb-5">
                I'm Manav.{' '}
                <br className="hidden sm:block" />
                I architect the{' '}
                <span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  end-to-end digital growth
                </span>{' '}
                for brands that can't afford to fail.
              </h1>

              {/* Sub */}
              <p className="text-lg text-muted-foreground mb-8 max-w-md leading-relaxed">
                Strategy is expensive. Guessing is even costlier.
              </p>

              {/* CTA row */}
              <div className="flex flex-wrap items-center gap-4 mb-10">
                <Button size="lg" onClick={handlePortal}
                  className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold h-12 px-8 text-base shadow-[0_0_30px_hsl(var(--primary)/0.25)]">
                  {user && isApproved ? 'Go to Dashboard' : 'Access Client Portal'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                  <span>No commitment required</span>
                </div>
              </div>

              {/* Social proof strip */}
              <div className="flex flex-wrap items-center gap-5">
                <div className="flex items-center gap-1.5">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">500+ reviews</span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-primary" />30+ countries
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 text-primary" />AI-Native SEO
                </div>
              </div>
            </div>

            {/* RIGHT — photo with quote card */}
            <div className="relative hidden lg:flex items-end justify-center pt-8">
              {/* Glow behind photo */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

              {/* Photo — full height, face always visible */}
              <img
                src="/manavseo.jpg"
                alt="Manav"
                className="relative z-10 h-[500px] w-auto object-cover object-top rounded-t-2xl"
                style={{ objectPosition: 'center top' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />

              {/* Floating quote card */}
              <div className="absolute bottom-8 left-0 z-20 bg-card/90 backdrop-blur border border-border rounded-2xl p-4 shadow-xl max-w-[260px]">
                <Quote className="h-4 w-4 text-primary mb-2" />
                <p className="text-sm font-semibold leading-snug mb-2">
                  "I don't do vanity SEO. I build search authority that compounds."
                </p>
                <div className="flex items-center gap-2">
                  <img src="/manav.jpg" alt="Manav"
                    className="h-7 w-7 rounded-full object-cover ring-1 ring-primary shrink-0"
                    style={{ objectPosition: 'center 15%' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div>
                    <div className="text-xs font-semibold">Manav</div>
                    <div className="text-xs text-muted-foreground">Founder, SEO Season</div>
                  </div>
                </div>
              </div>

              {/* Floating stat badge */}
              <div className="absolute top-12 right-4 z-20 bg-card/90 backdrop-blur border border-green-400/20 rounded-xl p-3 shadow-xl">
                <div className="text-green-400 font-bold text-xl">500+</div>
                <div className="text-xs text-muted-foreground">Brands Grown</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ TRUST STRIP ══ */}
      <section className="border-y border-border bg-card/40 py-4">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs sm:text-sm text-muted-foreground">
            {[
              { icon: Star,        text: 'Fiverr Top Rated Seller' },
              { icon: CheckCircle, text: '500+ Audits Delivered' },
              { icon: Brain,       text: 'AI-Native SEO Methodology' },
              { icon: Globe,       text: 'Clients in 30+ Countries' },
              { icon: ShieldCheck, text: 'Validation-First Approach' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ STATS ══ */}
      <section className="py-10 border-b border-border">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { value: '500+',  label: 'Brands Grown',     color: 'text-primary',    sub: 'across 30+ countries' },
              { value: '↑ 40%', label: 'Avg Ranking Lift', color: 'text-green-400',  sub: 'within 90 days' },
              { value: '10x',   label: 'AI Citations',      color: 'text-purple-400', sub: 'ChatGPT · Perplexity · Google AI' },
              { value: '94%',   label: 'Retention Rate',    color: 'text-yellow-400', sub: 'clients stay 12+ months' },
            ].map(({ value, label, color, sub }) => (
              <div key={label} className="rounded-2xl border border-border bg-card/60 p-5 text-center">
                <div className={`text-3xl font-bold mb-1 ${color}`}>{value}</div>
                <div className="text-sm font-semibold mb-0.5">{label}</div>
                <div className="text-xs text-muted-foreground">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SEO TOOL ══ */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5 mb-4">
              <Zap className="h-3 w-3" />Free SEO Audit Tool
            </div>
            <h2 className="text-3xl font-bold mb-3">See Where You Stand in 60 Seconds</h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
              Get a professional SEO audit powered by the same AI framework I use for every client.
              No fluff — just the truth about your search visibility.
            </p>
          </div>
          <div className="relative">
            <SeoEngine />
            {(!user || !isApproved) && (
              <div className="absolute inset-0 bg-background/85 backdrop-blur-sm rounded-2xl flex items-center justify-center z-10">
                <div className="text-center p-8 max-w-sm">
                  <div className="h-14 w-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                    <Lock className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">Client Portal Access Required</h3>
                  <p className="text-muted-foreground text-sm mb-5 leading-relaxed">
                    The full audit tool is available to active clients. Sign in or request portal access to continue.
                  </p>
                  <Button onClick={handlePortal}
                    className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
                    <ArrowRight className="h-4 w-4 mr-2" />Access Portal
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══ WHY MANAV ══ */}
      <section className="py-16 border-t border-border">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <div className="text-xs font-mono text-primary uppercase tracking-wider mb-3">Why SEO Season</div>
              <h2 className="text-3xl font-bold mb-4 leading-tight">
                Most SEO agencies sell you reports.<br />
                I sell you results.
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6 text-sm sm:text-base">
                The SEO industry is broken. Agencies charge thousands for dashboards full of
                vanity metrics while your competitors quietly steal your market share.
                I built SEO Season to be different — every strategy is validated before we
                scale it, every dollar is protected before we invest it.
              </p>
              <div className="space-y-3">
                {[
                  { icon: Brain,       text: 'AI-first methodology built for ChatGPT, Perplexity, and Google AI Overviews' },
                  { icon: ShieldCheck, text: 'Validation before execution — we test before we spend' },
                  { icon: TrendingUp,  text: 'Transparent dashboards showing real data, not agency spin' },
                  { icon: Star,        text: 'Fiverr Top Rated with 500+ five-star audits delivered' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {[
                { title: 'AI Search Visibility',         desc: 'Get found in ChatGPT, Perplexity, and Google AI Overviews — the new search frontier.',               icon: Brain,       color: 'text-primary',    bg: 'bg-primary/10' },
                { title: 'Live Keyword Rankings',        desc: 'Real Google SERP positions verified live — not cached estimates from 3 months ago.',                  icon: BarChart3,   color: 'text-cyan-400',   bg: 'bg-cyan-400/10' },
                { title: 'Validation-First Strategy',   desc: 'Every tactic is tested in a controlled sprint before we scale it. No wasted budget.',                 icon: ShieldCheck, color: 'text-green-400',  bg: 'bg-green-400/10' },
                { title: 'Executive Strategy Launchpad',desc: 'Premium client dashboard showing your campaign phase, value realised, and growth opportunities.',      icon: Sparkles,    color: 'text-purple-400', bg: 'bg-purple-400/10' },
              ].map(({ title, desc, icon: Icon, color, bg }) => (
                <div key={title} className="rounded-xl border border-border bg-card/60 p-4 flex items-start gap-4">
                  <div className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm mb-0.5">{title}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ CTA ══ */}
      <section className="py-16 border-t border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/3 to-transparent pointer-events-none" />
        <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center relative">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Limited Client Spots Available
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 leading-tight">
            Ready to Stop Guessing<br />and Start Growing?
          </h2>
          <p className="text-muted-foreground mb-8 text-base max-w-xl mx-auto">
            Join brands that are winning in AI-native search. Your personalised growth dashboard is waiting.
          </p>
          <Button size="lg" onClick={handlePortal}
            className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold h-12 px-10 text-base shadow-[0_0_30px_hsl(var(--primary)/0.3)]">
            {user && isApproved ? 'Go to My Dashboard' : 'Request Client Portal Access'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            Approved clients only · Managed by Manav · No cold traffic
          </p>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="border-t border-border py-8 bg-card/40">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/manav.jpg" alt="Manav"
              className="h-8 w-8 rounded-full object-cover ring-2 ring-primary shrink-0"
              style={{ objectPosition: 'center 15%' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div>
              <div className="font-bold text-sm">SEO Season by Manav</div>
              <div className="text-xs text-muted-foreground">I Don't Do Vanity SEO</div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap justify-center">
            <span className="flex items-center gap-1.5"><Star className="h-3 w-3 text-primary" />Fiverr Top Rated</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-primary" />All data private</span>
            <span className="flex items-center gap-1.5"><Globe className="h-3 w-3 text-primary" />AI-Native SEO</span>
            <span className="flex items-center gap-1.5"><Brain className="h-3 w-3 text-primary" />GEO + SEO</span>
          </div>
          <div className="text-xs text-muted-foreground">© 2026 SEO Season</div>
        </div>
      </footer>

    </div>
  );
}
