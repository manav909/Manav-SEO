import { Sparkles, Zap, Globe, Brain } from 'lucide-react';
import { SeoEngine } from '@/components/SeoEngine';

const Index = () => {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-[0_0_20px_hsl(var(--primary)/0.5)]">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">Manav<span className="text-primary"> SEO</span></span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
          AI agents online
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pt-12 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/60 backdrop-blur text-xs font-mono text-muted-foreground mb-6 animate-fade-up">
          <Zap className="h-3 w-3 text-primary" />
          Powered by multi-agent SEO automation
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          AI-Powered SEO<br />
          <span className="text-gradient-primary">Deliverables in Seconds.</span>
        </h1>

        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-fade-up" style={{ animationDelay: '0.15s' }}>
          Drop your URL, pick your goal, and let our AI agents do the rest. No spreadsheets. No jargon. Just deliverables your team can ship today.
        </p>

        <div className="flex flex-wrap justify-center gap-6 mt-8 text-sm text-muted-foreground animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> 1-click site audit</div>
          <div className="flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /> GPT-class reasoning</div>
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Agency-grade output</div>
        </div>
      </section>

      <SeoEngine />

      <footer className="relative z-10 mt-24 py-8 text-center text-xs text-muted-foreground border-t border-border">
        © 2026 Manav SEO — Built for marketers, not engineers.
      </footer>
    </main>
  );
};

export default Index;
