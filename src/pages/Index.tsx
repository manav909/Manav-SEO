import { Sparkles, Zap, Star, TrendingUp, Brain, ShieldCheck, ArrowRight } from 'lucide-react';
import { SeoEngine } from '@/components/SeoEngine';

const Index = () => {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* ── NAV ── */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <img
            src="/manavseo.jpg"
            alt="Manav"
            className="h-9 w-9 rounded-full object-cover object-top ring-2 ring-primary shadow-[0_0_14px_hsl(var(--primary)/0.5)]"
          />
          <span className="font-bold text-lg tracking-tight">
            SEO<span className="text-primary"> Seasons</span>
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-muted-foreground border border-border rounded-full px-3 py-1.5 bg-card/60 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          Fiverr Top Rated Seller
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 pt-6 pb-10">
        <div className="grid lg:grid-cols-2 gap-8 items-center">

          {/* LEFT — Copy */}
          <div className="text-left">

            {/* Top pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/60 backdrop-blur text-xs font-mono text-muted-foreground mb-5 animate-fade-up">
              <Zap className="h-3 w-3 text-primary" />
              Strategy is expensive. Guessing is even costlier.
            </div>

            {/* Headline */}
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] mb-5 animate-fade-up"
              style={{ animationDelay: '0.1s' }}
            >
              I'm Manav.<br />
              <span className="text-gradient-primary">I Don't Do</span><br />
              Vanity SEO.
            </h1>

            {/* Sub */}
            <p
              className="text-base sm:text-lg text-muted-foreground leading-relaxed mb-6 max-w-lg animate-fade-up"
              style={{ animationDelay: '0.15s' }}
            >
              I architect end-to-end digital growth for brands that can't afford to fail.
              Real data. Deep strategy. AI that actually knows what it's doing.
            </p>

            {/* Stats row */}
            <div
              className="grid grid-cols-3 gap-3 mb-6 animate-fade-up"
              style={{ animationDelay: '0.2s' }}
            >
              {[
                { value: '500+', label: 'Brands Scaled' },
                { value: '4.9★', label: 'Fiverr Rating' },
                { value: '90d', label: 'Avg. Results' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-border bg-card/60 backdrop-blur p-3 text-center"
                >
                  <div className="text-xl font-bold text-primary">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Trust badges */}
            <div
              className="flex flex-wrap gap-2 animate-fade-up"
              style={{ animationDelay: '0.25s' }}
            >
              {[
                { icon: Star, text: 'Top Rated on Fiverr' },
                { icon: Brain, text: 'Google + AI Engine SEO' },
                { icon: ShieldCheck, text: 'No Fluff. Just Results.' },
                { icon: TrendingUp, text: 'Technical + On-Page + GEO' },
              ].map(({ icon: Icon, text }) => (
                <span
                  key={text}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-border bg-secondary/40 text-muted-foreground"
                >
                  <Icon className="h-3 w-3 text-primary" />
                  {text}
                </span>
              ))}
            </div>
          </div>

          {/* RIGHT — Photo */}
          <div
            className="relative flex justify-center lg:justify-end animate-fade-up"
            style={{ animationDelay: '0.15s' }}
          >
            {/* Glow behind image */}
            <div className="absolute inset-0 rounded-3xl bg-primary/10 blur-3xl scale-90 pointer-events-none" />

            <div className="relative rounded-3xl overflow-hidden border border-border shadow-card max-w-sm lg:max-w-full w-full">
              <img
                src="/manavai.jpg"
                alt="Manav — SEO Strategist"
                className="w-full object-cover object-top"
                style={{ maxHeight: '420px' }}
              />

              {/* Floating credential card */}
              <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-border bg-background/80 backdrop-blur-md p-3 flex items-center gap-3">
                <img
                  src="/manavseo.png"
                  alt="Manav"
                  className="h-10 w-10 rounded-full object-cover object-top ring-2 ring-primary shrink-0"
                />
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-foreground">Manav</div>
                  <div className="text-xs text-muted-foreground truncate">
                    SEO Strategist · AI Search Expert
                  </div>
                </div>
                <div className="ml-auto shrink-0 flex items-center gap-1 text-xs font-mono text-green-400 border border-green-400/30 rounded-full px-2 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ── DIVIDER with CTA ── */}
        <div
          className="mt-10 text-center animate-fade-up"
          style={{ animationDelay: '0.3s' }}
        >
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground font-mono">
            <ArrowRight className="h-4 w-4 text-primary" />
            Drop your URL below — get a professional-grade SEO audit in seconds, not weeks.
            <ArrowRight className="h-4 w-4 text-primary" />
          </div>
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
