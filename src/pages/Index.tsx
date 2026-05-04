import { Sparkles, Zap, Star, TrendingUp, Brain, ShieldCheck, ChevronDown, Quote } from 'lucide-react';
import { SeoEngine } from '@/components/SeoEngine';

const Index = () => {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* AMBIENT GLOW */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-[600px] w-[600px] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-20 right-0 h-[500px] w-[500px] rounded-full bg-primary/8 blur-[100px]" />

      {/* NAV */}
      <nav className="relative z-20 flex items-center justify-between px-6 sm:px-10 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0">
            <img
              src="/manav.jpg"
              alt="Manav"
              className="h-10 w-10 rounded-full object-cover object-top"
              style={{ background: 'hsl(var(--primary)/0.15)' }}
            />
            <div className="absolute inset-0 rounded-full ring-2 ring-primary shadow-[0_0_16px_hsl(var(--primary)/0.5)]" />
          </div>
          <span className="font-bold text-lg tracking-tight">
            SEO<span className="text-primary"> Seasons</span>
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-muted-foreground border border-border rounded-full px-3 py-1.5 bg-card/60 backdrop-blur">
          <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
          Fiverr Vetted PRO and Top Rated Seller
        </div>
      </nav>

      {/* HERO */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 pt-4 pb-6">
        <div className="grid lg:grid-cols-[1fr_460px] gap-0 items-center">

          {/* LEFT — Copy */}
          <div className="text-left relative z-10 lg:pr-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/60 backdrop-blur text-xs font-mono text-muted-foreground mb-6 animate-fade-up">
              <Zap className="h-3 w-3 text-primary" />
              Strategy is expensive. Guessing is even costlier.
            </div>

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

            <p
              className="text-lg text-muted-foreground leading-relaxed mb-7 max-w-md animate-fade-up"
              style={{ animationDelay: '0.1s' }}
            >
              I architect end-to-end digital growth for brands that
              can't afford to fail — powered by real data, deep strategy,
              and AI that actually knows what it's doing.
            </p>

            {/* Stat cards */}
            <div
              className="flex flex-wrap gap-3 mb-7 animate-fade-up"
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

          {/* RIGHT — manavai.png with screen blend */}
          <div
            className="relative flex justify-center lg:justify-end animate-fade-up"
            style={{ animationDelay: '0.1s' }}
          >
            <div className="absolute bottom-0 right-0 h-[500px] w-[400px] rounded-full bg-primary/20 blur-[80px] pointer-events-none" />
            <div className="absolute bottom-0 right-10 h-[300px] w-[300px] rounded-full bg-primary/15 blur-[60px] pointer-events-none" />

            <div className="relative">
              <img
                src="/manavai.jpg"
                alt="Manav — SEO Strategist"
                className="relative z-10 w-full max-w-[440px] lg:max-w-[480px] object-contain"
                style={{
                  mixBlendMode: 'screen',
                  filter: 'brightness(1.05) contrast(1.05)',
                }}
              />

              {/* Floating 500+ stat */}
              <div className="absolute top-8 -right-2 z-20 rounded-2xl border border-border bg-background/90 backdrop-blur-xl px-4 py-3 text-center shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                <div className="text-2xl font-bold text-gradient-primary">500+</div>
                <div className="text-xs text-muted-foreground">Brands Scaled</div>
              </div>

              {/* Live badge */}
              <div className="absolute top-1/2 -right-4 z-20 rounded-full border border-green-400/30 bg-background/90 backdrop-blur-xl px-3 py-1.5 flex items-center gap-2 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
                <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-mono text-green-400">Live Audits</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* BRAND STRIP — manavseo.png full width */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 mb-10">
        <div className="relative rounded-3xl overflow-hidden border border-border shadow-card min-h-[300px]">

          {/* Photo — positioned to show Manav's face */}
          <img
            src="/manavseo.jpg"
            alt="Manav"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: '75% 15%' }}
          />

          {/* Gradient overlay — text on left, face visible on right */}
          <div className="absolute inset-0 bg-gradient-to-r from-background from-40% via-background/85 via-60% to-transparent" />

          {/* Text */}
          <div className="relative z-10 p-8 sm:p-10 max-w-lg">
            <Quote className="h-6 w-6 text-primary mb-3 opacity-80" />
            <p className="text-xl sm:text-2xl font-semibold text-foreground leading-snug mb-4">
              "Most SEO agencies sell you reports.<br />
              <span className="text-gradient-primary">I sell you rankings."</span>
            </p>
            <div className="flex items-center gap-3">
              <div>
                <div className="font-bold text-sm text-foreground">Manav</div>
                <div className="text-xs text-muted-foreground">
                  SEO Strategist · Fiverr Top Rated · 500+ Clients
                </div>
              </div>
              <div className="flex items-center gap-0.5 ml-2">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                ))}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Scroll hint */}
      <div className="relative z-10 flex flex-col items-center gap-1 text-xs text-muted-foreground mb-6 animate-bounce">
        <span className="font-mono">Run your audit below</span>
        <ChevronDown className="h-4 w-4 text-primary" />
      </div>

      {/* TOOL */}
      <SeoEngine />

      {/* FOOTER */}
      <footer className="relative z-10 mt-20 py-6 text-center text-xs text-muted-foreground border-t border-border">
        <p className="mb-1">
          Built by <span className="text-primary font-semibold">Manav</span> — Fiverr PRO and Top Rated SEO Strategist
        </p>
        <p>© 2026 SEO Seasons — Digital Marketing Operating System</p>
      </footer>

    </main>
  );
};

export default Index;
