import { Sparkles, Zap, Globe, Brain, Star, TrendingUp } from 'lucide-react';
import { SeoEngine } from '@/components/SeoEngine';

const Index = () => {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <img
            src="/manav.jpg"
            alt="Manav"
            className="h-9 w-9 rounded-full object-cover ring-2 ring-primary shadow-[0_0_12px_hsl(var(--primary)/0.5)]"
          />
          <span className="font-bold text-lg tracking-tight">SEO<span className="text-primary"> Seasons</span></span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
          Fiverr Vetted Pro and Top Rated Seller
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pt-12 pb-16 text-center">

        {/* Top badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/60 backdrop-blur text-xs font-mono text-muted-foreground mb-6 animate-fade-up">
          <Zap className="h-3 w-3 text-primary" />
          Strategy is expensive. Guessing is even costlier.
        </div>

        {/* Main headline */}
        <h1
          className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6 animate-fade-up"
          style={{ animationDelay: '0.1s' }}
        >
          I'm Manav.<br />
          <span className="text-gradient-primary">I Don't Do Vanity SEO.</span>
        </h1>

        {/* Subheadline */}
        <p
          className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-fade-up"
          style={{ animationDelay: '0.15s' }}
        >
          I architect end-to-end digital growth for brands that can't afford to fail —
          powered by real data, deep strategy, and AI that actually knows what it's doing.
        </p>

        {/* Social proof bar */}
        <div
          className="flex flex-wrap justify-center gap-6 mt-8 text-sm text-muted-foreground animate-fade-up"
          style={{ animationDelay: '0.2s' }}
        >
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" />
            500+ Brands Scaled
          </div>
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Rank on Google + AI Engines
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Results in 90 Days or Less
          </div>
        </div>

        {/* Secondary trust line */}
        <p
          className="mt-5 text-xs font-mono text-muted-foreground animate-fade-up"
          style={{ animationDelay: '0.25s' }}
        >
          Drop your URL below. Get a professional-grade SEO audit in seconds — not weeks.
        </p>

      </section>

      <SeoEngine />

      {/* Footer */}
      <footer className="relative z-10 mt-24 py-8 text-center text-xs text-muted-foreground border-t border-border">
        <p className="mb-1">Built by <span className="text-primary font-semibold">Manav</span> — Fiverr Vetted Pro and Top Rated SEO Strategist</p>
        <p>© 2026 SEO Seasons — Digital Marketing Operating System</p>
      </footer>

    </main>
  );
};

export default Index;
