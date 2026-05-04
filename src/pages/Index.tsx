import { useEffect, useState, useRef } from 'react';
import { Sparkles, Zap, Star, TrendingUp, Brain, ShieldCheck, ChevronDown, Quote, CheckCircle, Globe, BarChart3, Search, Cpu, Lock } from 'lucide-react';
import { SeoEngine } from '@/components/SeoEngine';

/* ── ANIMATED TRUST PANEL ── */
const TrustPanel = () => {
  const [auditStep, setAuditStep] = useState(0);
  const [score, setScore] = useState(0);
  const [clients, setClients] = useState(487);
  const [activity, setActivity] = useState([
    { id: 1, flag: '🇺🇸', text: 'TechStartup.io', action: 'audit complete', score: 94, time: '2m ago' },
    { id: 2, flag: '🇬🇧', text: 'GrowthLabs.co', action: 'GEO report', score: 87, time: '5m ago' },
    { id: 3, flag: '🇦🇪', text: 'DubaiRetail.ae', action: 'on-page fix', score: 91, time: '9m ago' },
  ]);
  const [typing, setTyping] = useState('');
  const [pulseIdx, setPulseIdx] = useState(0);
  const typingRef = useRef(0);

  const auditSteps = [
    { icon: Search,    label: 'Crawling URL...',            color: 'text-blue-400' },
    { icon: BarChart3, label: 'Analyzing SERP intent...',   color: 'text-purple-400' },
    { icon: Globe,     label: 'Mapping competitors...',     color: 'text-cyan-400' },
    { icon: Cpu,       label: 'Synthesizing AI insights...', color: 'text-yellow-400' },
    { icon: Lock,      label: 'Checking technical SEO...',  color: 'text-orange-400' },
    { icon: CheckCircle, label: 'Report ready ✓',           color: 'text-green-400' },
  ];

  const domains = ['ecommerce-brand.com', 'saas-startup.io', 'localservice.ae', 'b2b-agency.co'];

  // Cycle audit steps
  useEffect(() => {
    const t = setInterval(() => {
      setAuditStep(s => (s + 1) % auditSteps.length);
    }, 1800);
    return () => clearInterval(t);
  }, []);

  // Animate score to 96
  useEffect(() => {
    let v = 0;
    const t = setInterval(() => {
      v += 2;
      setScore(v);
      if (v >= 96) clearInterval(t);
    }, 30);
    return () => clearInterval(t);
  }, []);

  // Pulse client counter up occasionally
  useEffect(() => {
    const t = setInterval(() => {
      setClients(c => c + 1);
    }, 8000);
    return () => clearInterval(t);
  }, []);

  // Typing domain animation
  useEffect(() => {
    let domainIdx = 0;
    let charIdx = 0;
    let deleting = false;

    const tick = () => {
      const domain = domains[domainIdx];
      if (!deleting) {
        charIdx++;
        setTyping(domain.slice(0, charIdx));
        if (charIdx === domain.length) {
          deleting = true;
          setTimeout(tick, 1200);
          return;
        }
      } else {
        charIdx--;
        setTyping(domain.slice(0, charIdx));
        if (charIdx === 0) {
          deleting = false;
          domainIdx = (domainIdx + 1) % domains.length;
        }
      }
      typingRef.current = window.setTimeout(tick, deleting ? 40 : 80);
    };
    typingRef.current = window.setTimeout(tick, 600);
    return () => clearTimeout(typingRef.current);
  }, []);

  // Rotate activity feed
  useEffect(() => {
    const newEntries = [
      { flag: '🇮🇳', text: 'IndiaFintech.in',   action: 'technical audit', score: 89 },
      { flag: '🇸🇬', text: 'SGrowth.sg',        action: 'GEO report',      score: 93 },
      { flag: '🇺🇸', text: 'HealthApp.com',     action: 'on-page fix',     score: 88 },
      { flag: '🇩🇪', text: 'EuroSaaS.de',       action: 'off-page plan',   score: 91 },
      { flag: '🇦🇺', text: 'AussieStore.au',    action: 'audit complete',  score: 95 },
    ];
    let i = 0;
    const t = setInterval(() => {
      const entry = newEntries[i % newEntries.length];
      setActivity(prev => [
        { ...entry, id: Date.now(), time: 'just now' },
        { ...prev[0], time: '2m ago' },
        { ...prev[1], time: '5m ago' },
      ]);
      i++;
    }, 4000);
    return () => clearInterval(t);
  }, []);

  // Pulse rows
  useEffect(() => {
    const t = setInterval(() => setPulseIdx(i => (i + 1) % 3), 1400);
    return () => clearInterval(t);
  }, []);

  const StepIcon = auditSteps[auditStep].icon;

  return (
    <div className="relative w-full max-w-[440px] lg:max-w-[480px] mx-auto lg:ml-auto">

      {/* Glow */}
      <div className="absolute -inset-4 rounded-3xl bg-primary/10 blur-2xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-primary/15 blur-3xl pointer-events-none" />

      {/* Main card */}
      <div className="relative rounded-2xl border border-border bg-card/80 backdrop-blur-xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.5)]">

        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/30">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
          <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
          <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
          <span className="ml-2 text-xs font-mono text-muted-foreground">manav-seo-engine.live</span>
          <span className="ml-auto flex items-center gap-1 text-xs text-green-400 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            LIVE
          </span>
        </div>

        <div className="p-5 space-y-4">

          {/* Live audit running */}
          <div className="rounded-xl border border-border bg-background/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Running Audit</span>
              <span className="text-xs font-mono text-primary animate-pulse">● processing</span>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-muted-foreground">URL:</span>
              <span className="text-xs font-mono text-foreground">
                {typing}<span className="animate-ping inline-block w-0.5 h-3 bg-primary ml-0.5 relative -top-0.5" />
              </span>
            </div>
            {/* Progress steps */}
            <div className="space-y-1.5">
              {auditSteps.map((step, i) => {
                const Icon = step.icon;
                const done = i < auditStep;
                const active = i === auditStep;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 text-xs transition-all duration-500 ${
                      done ? 'opacity-40' : active ? 'opacity-100' : 'opacity-20'
                    }`}
                  >
                    <Icon className={`h-3 w-3 shrink-0 ${active ? step.color : done ? 'text-green-400' : 'text-muted-foreground'}`} />
                    <span className={active ? step.color : done ? 'text-green-400' : 'text-muted-foreground'}>
                      {step.label}
                    </span>
                    {done && <CheckCircle className="h-2.5 w-2.5 text-green-400 ml-auto" />}
                    {active && (
                      <span className="ml-auto flex gap-0.5">
                        {[0,1,2].map(d => (
                          <span
                            key={d}
                            className="h-1 w-1 rounded-full bg-primary animate-bounce"
                            style={{ animationDelay: `${d * 0.15}s` }}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Score + stats row */}
          <div className="grid grid-cols-3 gap-3">
            {/* SEO Score */}
            <div className="col-span-1 rounded-xl border border-border bg-background/60 p-3 flex flex-col items-center justify-center">
              <div className="relative h-14 w-14 mb-1">
                <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="22" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
                  <circle
                    cx="28" cy="28" r="22" fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 22}`}
                    strokeDashoffset={`${2 * Math.PI * 22 * (1 - score / 100)}`}
                    style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-primary">
                  {score}
                </span>
              </div>
              <span className="text-xs text-muted-foreground text-center leading-tight">SEO Score</span>
            </div>

            {/* Stats */}
            <div className="col-span-2 space-y-2">
              {[
                { label: 'Clients Served', value: clients.toString(), color: 'text-primary' },
                { label: 'Avg. Score Lift', value: '+34pts', color: 'text-green-400' },
                { label: 'Reports Today', value: '12', color: 'text-yellow-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-1.5">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className={`text-xs font-bold font-mono ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live activity feed */}
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Recent Audits</span>
              <span className="text-xs text-green-400 font-mono">live feed</span>
            </div>
            <div className="space-y-2">
              {activity.map((item, i) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-all duration-700 ${
                    i === 0 ? 'bg-primary/8 border border-primary/20' : 'bg-transparent'
                  } ${pulseIdx === i ? 'opacity-100' : 'opacity-70'}`}
                >
                  <span className="text-base shrink-0">{item.flag}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-mono text-foreground truncate">{item.text}</div>
                    <div className="text-xs text-muted-foreground truncate">{item.action}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-bold text-green-400">{item.score}</div>
                    <div className="text-xs text-muted-foreground">{item.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Trust footer */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-3 w-3 text-yellow-400 fill-yellow-400" />
              ))}
              <span className="text-xs text-muted-foreground ml-1">4.9 · Fiverr</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3 w-3 text-primary" />
              Trusted by 500+ brands
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

/* ── MAIN PAGE ── */
const Index = () => {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-[600px] w-[600px] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-20 right-0 h-[500px] w-[500px] rounded-full bg-primary/8 blur-[100px]" />

      {/* NAV */}
      <nav className="relative z-20 flex items-center justify-between px-6 sm:px-10 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-[0_0_20px_hsl(var(--primary)/0.5)] shrink-0">
            <span className="text-primary-foreground font-bold text-base">M</span>
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

      {/* HERO */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 pt-4 pb-6">
        <div className="grid lg:grid-cols-[1fr_480px] gap-8 items-center">

          {/* LEFT — Copy */}
          <div className="text-left relative z-10">
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
            <div className="flex flex-wrap gap-3 mb-7 animate-fade-up" style={{ animationDelay: '0.15s' }}>
              {[
                { value: '500+', label: 'Brands Scaled',  icon: TrendingUp },
                { value: '4.9★', label: 'Fiverr Rating',  icon: Star },
                { value: '90 Days', label: 'Avg. Results', icon: Sparkles },
              ].map(({ value, label, icon: Icon }) => (
                <div key={label} className="flex items-center gap-2.5 rounded-2xl border border-border bg-card/60 backdrop-blur px-4 py-2.5">
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <div className="text-base font-bold text-foreground leading-none">{value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Trust pills */}
            <div className="flex flex-wrap gap-2 animate-fade-up" style={{ animationDelay: '0.2s' }}>
              {[
                { icon: Brain,       text: 'Google + AI Engine SEO' },
                { icon: ShieldCheck, text: 'No Fluff. Just Results.' },
                { icon: TrendingUp,  text: 'Technical · On-Page · GEO' },
              ].map(({ icon: Icon, text }) => (
                <span key={text} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border bg-secondary/30 text-muted-foreground">
                  <Icon className="h-3 w-3 text-primary" />
                  {text}
                </span>
              ))}
            </div>
          </div>

          {/* RIGHT — Animated Trust Panel */}
          <div className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <TrustPanel />
          </div>

        </div>
      </section>

      {/* BRAND STRIP */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 mb-10">
        <div className="relative rounded-3xl overflow-hidden border border-border shadow-card min-h-[300px]">
          <img
            src="/manavseo.jpg"
            alt="Manav"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: '75% 15%' }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background from-40% via-background/85 via-60% to-transparent" />
          <div className="relative z-10 p-8 sm:p-10 max-w-lg">
            <Quote className="h-6 w-6 text-primary mb-3 opacity-80" />
            <p className="text-xl sm:text-2xl font-semibold text-foreground leading-snug mb-4">
              "Most SEO agencies sell you reports.<br />
              <span className="text-gradient-primary">I sell you rankings."</span>
            </p>
            <div className="flex items-center gap-3">
              <div>
                <div className="font-bold text-sm text-foreground">Manav</div>
                <div className="text-xs text-muted-foreground">SEO Strategist · Fiverr Top Rated · 500+ Clients</div>
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
          Built by <span className="text-primary font-semibold">Manav</span> — Fiverr Top Rated SEO Strategist
        </p>
        <p>© 2026 SEO Seasons — Digital Marketing Operating System</p>
      </footer>

    </main>
  );
};

export default Index;
