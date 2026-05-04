import { Sparkles, Zap, Star, TrendingUp, Brain, ShieldCheck, ArrowRight, ChevronDown } from 'lucide-react';
import { SeoEngine } from '@/components/SeoEngine';

const Index = () => {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* ── AMBIENT GLOW BLOBS ── */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-[600px] w-[600px] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-20 right-0 h-[500px] w-[500px] rounded-full bg-primary/8 blur-[100px]" />

      {/* ── NAV ── */}
      <nav className="relative z-20 flex items-center justify-between px-6 sm:px-10 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src="/manavseo.png"
              alt="Manav"
              className="h-10 w-10 rounded-full object-cover object-[center_15%] ring-2 ring-primary shadow-[0_0_20px_hsl(var(--primary)/0.6)]"
              style={{ mixBlendMode: 'normal' }}
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-400 border-2 border-background" />
          </div>
          <span className="font-bold text-lg tracking-tight">
            SEO<span className="text-primary"> Seasons</span>
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-muted-foreground border border-border rounded-full px-3 py-1.5 bg-card/60 backdrop-blur">
          <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
          Fiverr Top Rated Seller
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 pt-4 pb-8 min-h-[82vh] flex items-center">
        <div className="grid lg:grid-cols-[1fr_480px] gap-0 items-center w-full">

          {/* LEFT — Copy */}
          <div className="text-left relative z-10 lg:pr-8">

            {/* Pill badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/60 backdrop-blur text-xs font-mono text-muted-foreground mb-6 animate-fade-up">
              <Zap className="h-3 w-3 text-primary" />
              Strategy is expensive. Guessing is even costlier.
            </div>

            {/* Headline */}
            <h1
              className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-5 animate-fade-up"
              style={{ animationDelay: '0.05s' }}
            >
              I'm <span className="text-gradient-primary">Manav.</span><br />
              I Don't Do<br />
              <span className="relative inline-block">
                Vanity SEO.
                <span className="absolute -bottom-1 left-0 h-1 w-full rounded-full bg-gradient-to-r from-primary to-primary-glow opacity-60" />
              </span>
            </h1>

            {/* Sub */}
            <p
              className="text-lg text-muted-foreground leading-relaxed mb-7 max-w-md animate-fade-up"
              style={{ animationDelay: '0.1s' }}
            >
              I architect end-to-end digital growth for brands that
              can't afford to fail — powered by real data, deep strategy,
              and AI that actually knows what it's doing.
            </p>

            {/* Stats */}
            <div
              className="flex flex-wrap gap-4 mb-7 animate-fade-up"
              style={{ animationDelay: '0.15s' }}
            >
              {[
                { value: '500+', label: 'Brands Scaled', icon: TrendingUp },
                { value: '4.9★', label: 'Fiverr Rating', icon: Star },
                { value: '90 Days', label: 'Avg. Results', icon: Sparkles },
              ].map(({ value, label, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-2.5 rounded-2xl border border-border bg-card/60 backdrop-blur px-4 py-2.5"
                >
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <div className="text-base font-bold text-foreground leading-none">{value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Trust pills */}
            <div
              className="flex flex-wrap gap-2 animate-fade-up"
              style={{ animationDelay: '0.2s' }}
            >
              {[
                { icon: Brain, text: 'Google + AI Engine SEO' },
                { icon: ShieldCheck, text: 'No Fluff. Just Results.' },
                { icon: TrendingUp, text: 'Technical · On-Page · GEO' },
              ].map(({ icon: Icon, text }) => (
                <span
                  key={text}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border bg-secondary/30 text-muted-foreground"
                >
                  <Icon className="h-3 w-3 text-primary" />
                  {text}
                </span>
              ))}
            </div>
          </div>

          {/* RIGHT — Creative Image Panel */}
          <div
            className="relative flex justify-center lg:justify-end animate-fade-up"
            style={{ animationDelay: '0.1s' }}
          >
            {/* Large purple glow behind Manav */}
            <div className="absolute bottom-0 right-0 h-[500px] w-[400px] rounded-full bg-primary/20 blur-[80px] pointer-events-none" />
            <div className="absolute bottom-0 right-10 h-[300px] w-[300px] rounded-full bg-primary/15 blur-[60px] pointer-events-none" />

            {/* Manav + AI Robot image — black bg disappears via screen blend */}
            <div className="relative">
              <img
                src="/manavai.png"
                alt="Manav — SEO Strategist"
                className="relative z-10 w-full max-w-[440px] lg:max-w-[480px] object-contain drop-shadow-2xl"
                style={{
                  mixBlendMode: 'screen',
                  filter: 'brightness(1.05) contrast(1.05)',
                }}
              />

              {/* Floating credential card — bottom left */}
              <div className="absolute bottom-12 -left-4 z-20 rounded-2xl border border-border bg-background/90 backdrop-blur-xl p-3 flex items-center gap-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)] min-w-[200px]">
                <img
                  src="/manavseo.png"
                  alt="Manav"
                  className="h-11 w-11 rounded-full object-cover object-[center_15%] ring-2 ring-primary shrink-0"
                />
                <div>
                  <div className="font-semibold text-sm text-foreground">Manav</div>
                  <div className="text-xs text-muted-foreground">SEO Strategist · AI Search</div>
                  <div className="flex items-center gap-1 mt-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-2.5 w-2.5 text-yellow-400 fill-yellow-400" />
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">4.9</span>
                  </div>
                </div>
              </div>

              {/* Floating stat — top right */}
              <div className="absolute top-8 -right-4 z-20 rounded-2xl border border-border bg-background/90 backdrop-blur-xl px-4 py-3 text-center shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                <div className="text-2xl font-bold text-gradient-primary">500+</div>
                <div className="text-xs text-muted-foreground">Brands Scaled</div>
              </div>

              {/* Floating live badge — middle right */}
              <div className="absolute top-1/2 -right-6 z-20 rounded-full border border-green-400/30 bg-background/90 backdrop-blur-xl px-3 py-1.5 flex items-center gap-2 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
                <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-mono text-green-400">Live Audits</span>
              </div>
            </div>
          </div>

        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-xs text-muted-foreground animate-bounce">
          <span className="font-mono">Run your audit</span>
          <ChevronDown className="h-4 w-4 text-primary" />
        </div>
      </section>

      {/* ── TOOL ── */}
      <SeoEngine />

      {/* ── FOOTER ── */}
      <footer className="relative z-10 mt-20 py-6 text-center text-xs text-muted-foreground border-t border-border">
        <p className="mb-1">
          Built by <span className="text-primary font-semibold">Manav</span> — Fiverr Top Rated SEO Strategist
        </p>
        <p>© 2026 SEO Seasons — Digital Marketing Operating System</p>
      </footer>

    </main>
  );
};

export default Index;
