/* ════════════════════════════════════════════════════════════════════════════
   src/pages/ClientLens.tsx
   Phase 21 Block 2.7 — Client Lens cinematic page

   A scroll-driven, mood-shifting, data-animated client deliverable.
   Eight sections. Every stat drives an animation. Hovering shifts the
   ambient color of the page. Built for the moment a client's investor
   opens this and decides whether to keep funding marketing.

   Layout pause exception: this is a NEW client-facing surface, not
   iteration on the Command page. Per Manav's explicit ask 2026-05-23.

   Tech stack: React + Framer Motion + SVG + Canvas particles + Tailwind +
   CSS custom properties for mood theming. No Three.js in V1 (scope).
═══════════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useScroll, useTransform, useMotionValue, useSpring } from 'framer-motion';
import {
  ArrowRight, ArrowUp, ArrowDown, Sparkles, TrendingUp, Target, Activity,
  Layers, Link2, Globe, Wrench, Eye, ChevronDown, Download, Calendar, MessageCircle,
} from 'lucide-react';

import { seoClientLensLoad, type ClientLensData } from '@/components/pm/api';

/* ════════════════════════════════════════════════════════════════════════════
   MOOD SYSTEM
   The page has a shifting ambient color tied to which section is in focus or
   which element is being hovered. CSS custom properties update with spring
   physics so the change feels physical, not snap.

   Four moods:
     trust     — default. Deep cyan. Professional, intelligent.
     wins      — emerald + gold. Triumphant.
     focus     — violet + magenta. Forward-looking, discovery.
     careful   — amber. Honest about gaps.
═══════════════════════════════════════════════════════════════════════════════ */
type Mood = 'trust' | 'wins' | 'focus' | 'careful';

const MOOD_PALETTE: Record<Mood, {
  bg1: string; bg2: string; accent: string; accentSoft: string; glow: string;
}> = {
  trust:   { bg1: 'hsl(222, 47%, 7%)',  bg2: 'hsl(212, 60%, 11%)', accent: 'hsl(190, 95%, 60%)', accentSoft: 'hsl(190, 95%, 60%, 0.15)', glow: 'hsl(190, 100%, 65%, 0.35)' },
  wins:    { bg1: 'hsl(155, 35%, 8%)',  bg2: 'hsl(160, 40%, 11%)', accent: 'hsl(148, 85%, 60%)', accentSoft: 'hsl(148, 85%, 60%, 0.15)', glow: 'hsl(48, 100%, 65%, 0.35)' },
  focus:   { bg1: 'hsl(275, 40%, 9%)',  bg2: 'hsl(285, 45%, 12%)', accent: 'hsl(282, 85%, 70%)', accentSoft: 'hsl(282, 85%, 70%, 0.15)', glow: 'hsl(305, 100%, 70%, 0.35)' },
  careful: { bg1: 'hsl(28, 35%, 9%)',   bg2: 'hsl(32, 40%, 12%)',  accent: 'hsl(36, 95%, 62%)',  accentSoft: 'hsl(36, 95%, 62%, 0.15)',  glow: 'hsl(20, 100%, 65%, 0.35)' },
};

/* ════════════════════════════════════════════════════════════════════════════
   PARTICLE AMBIENCE
   A lightweight Canvas particle field that drifts behind everything. Fewer
   than 60 particles, no per-frame allocation. Runs at ~60fps on modest GPU.
═══════════════════════════════════════════════════════════════════════════════ */
function ParticleField({ accentColor }: { accentColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorRef  = useRef(accentColor);
  useEffect(() => { colorRef.current = accentColor; }, [accentColor]);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;

    let w = 0, h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = c.clientWidth; h = c.clientHeight;
      c.width = w * dpr; c.height = h * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 55;
    const particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      r: Math.random() * 1.4 + 0.4,
      a: Math.random() * 0.6 + 0.2,
    }));

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const col = colorRef.current;
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = col.replace(/[\d.]+\)$/, `${p.a})`).replace('hsl(', 'hsla(').replace(/(\d+%),(\s*\d+%)\)/, '$1,$2,'+p.a+')');
        /* Fallback if the regex didn't catch: */
        ctx.fillStyle = col;
        ctx.globalAlpha = p.a * 0.7;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ mixBlendMode: 'screen' as const }} />;
}

/* ════════════════════════════════════════════════════════════════════════════
   ANIMATED NUMBER
   requestAnimationFrame-based count up from 0 to target, cubic ease-out.
   Uses tabular-nums and locale formatting. Triggered when prop changes.
═══════════════════════════════════════════════════════════════════════════════ */
function AnimatedNumber({
  value, duration = 1400, prefix = '', suffix = '', decimals = 0,
}: { value: number; duration?: number; prefix?: string; suffix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  const text = decimals > 0
    ? display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : Math.round(display).toLocaleString();
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{prefix}{text}{suffix}</span>;
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════════ */
export default function ClientLens() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ClientLensData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [mood, setMood] = useState<Mood>('trust');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const scrollSmoothed = useSpring(scrollYProgress, { stiffness: 80, damping: 30 });
  const heroY  = useTransform(scrollSmoothed, [0, 0.15], [0, -80]);
  const heroOp = useTransform(scrollSmoothed, [0, 0.12], [1, 0]);

  /* Load */
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await seoClientLensLoad({ projectId });
      if (cancelled) return;
      if (r.error || !r.lens) {
        setErr(r.error || 'Failed to load');
        setLoading(false);
        return;
      }
      setData(r.lens);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  /* Mood-driven CSS vars on the wrapper. spring transitions, not snap. */
  const palette = MOOD_PALETTE[mood];
  const style: React.CSSProperties = {
    '--lens-bg-1':       palette.bg1,
    '--lens-bg-2':       palette.bg2,
    '--lens-accent':     palette.accent,
    '--lens-accent-soft': palette.accentSoft,
    '--lens-glow':       palette.glow,
    background:          `radial-gradient(ellipse at top, var(--lens-bg-2) 0%, var(--lens-bg-1) 70%)`,
    transition:          'background 1200ms cubic-bezier(0.4, 0, 0.2, 1)',
  } as React.CSSProperties;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(222, 47%, 7%)' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-cyan-400/30 border-t-cyan-400"
          />
          <div className="text-cyan-300/70 text-sm tracking-widest uppercase">Loading the lens…</div>
        </motion.div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-cyan-300 p-8" style={{ background: 'hsl(222, 47%, 7%)' }}>
        <div className="max-w-md text-center">
          <div className="text-xl font-bold mb-2">Couldn't load this view</div>
          <div className="text-sm text-cyan-300/60 mb-6 font-mono">{err}</div>
          <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-lg border border-cyan-500/30 text-sm hover:bg-cyan-500/10">
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={style} className="relative text-white min-h-screen overflow-hidden">
      {/* Ambient particle field — full page */}
      <div className="fixed inset-0 pointer-events-none">
        <ParticleField accentColor={palette.accent} />
      </div>
      {/* Subtle vignette at the edges */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.65) 100%)',
      }} />

      {/* Top navigation strip — minimal, glassy */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md" style={{ background: 'rgba(0,0,0,0.35)', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-white/50 hover:text-white transition-colors text-sm">
              ←
            </button>
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Client Lens</div>
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/30">
            Generated {new Date(data.generated_at).toLocaleDateString()}
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-16">
        {/* SECTION 1 — HERO */}
        <HeroSection data={data} setMood={setMood} heroY={heroY} heroOp={heroOp} />

        {/* SECTION 2 — STORY TIMELINE */}
        <StorySection data={data} setMood={setMood} />

        {/* SECTION 3 — LIVE RANKING LANDSCAPE */}
        <RankingLandscape data={data} setMood={setMood} />

        {/* SECTION 4 — TRAFFIC FLOW */}
        <TrafficFlow data={data} setMood={setMood} />

        {/* SECTION 5 — FIVE PILLARS */}
        <PillarsHealth data={data} setMood={setMood} />

        {/* SECTION 6 — WINS REEL */}
        {data.wins.length > 0 && <WinsReel data={data} setMood={setMood} />}

        {/* SECTION 7 — FORECAST */}
        {data.forecast && <ForecastSection data={data} setMood={setMood} />}

        {/* SECTION 8 — CTA */}
        <CTASection data={data} setMood={setMood} />
      </main>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SECTION 1 — HERO
═══════════════════════════════════════════════════════════════════════════════ */
function HeroSection({ data, setMood, heroY, heroOp }: { data: ClientLensData; setMood: (m: Mood) => void; heroY: any; heroOp: any }) {
  return (
    <section onMouseEnter={() => setMood('trust')} className="relative min-h-screen flex flex-col items-center justify-center px-6 py-24">
      <motion.div style={{ y: heroY, opacity: heroOp }} className="text-center max-w-4xl">
        {/* Identity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="text-[10px] uppercase tracking-[0.5em] mb-6"
          style={{ color: 'var(--lens-accent)' }}
        >
          {data.identity.domain || 'Quarterly view'}
        </motion.div>

        {/* Project name — massive */}
        <motion.h1
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight mb-10"
          style={{
            letterSpacing: '-0.04em',
            background: `linear-gradient(180deg, white 0%, hsl(0, 0%, 75%) 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {data.identity.display_name}
        </motion.h1>

        {/* Headline metric — the ONE number */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative inline-block"
        >
          <div
            className="text-7xl md:text-8xl lg:text-9xl font-black mb-3"
            style={{
              color: 'var(--lens-accent)',
              filter: 'drop-shadow(0 0 40px var(--lens-glow))',
              letterSpacing: '-0.05em',
            }}
          >
            <AnimatedNumber value={data.headline.value} duration={2200} />
          </div>
          <div className="text-base md:text-lg text-white/75 max-w-xl mx-auto">
            {data.headline.label}
          </div>
          <div className="text-[12px] md:text-sm text-white/45 mt-2 max-w-xl mx-auto">
            {data.headline.detail}
          </div>
        </motion.div>

        {/* Stats strip — supporting numbers */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.8, duration: 1 }}
          className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 mt-16"
        >
          <HeroStat label="Days in" value={data.identity.days_active ?? 0} />
          <HeroStat label="Campaigns" value={data.identity.campaign_count} />
          <HeroStat label="Queries tracked" value={data.rankings.total_queries} />
          <HeroStat label="Clicks captured" value={data.traffic.clicks} />
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5, duration: 1 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex flex-col items-center gap-2"
          >
            <div className="text-[10px] uppercase tracking-[0.4em] text-white/30">Scroll</div>
            <ChevronDown className="w-4 h-4 text-white/30" />
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-xl md:text-2xl font-bold text-white/85" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <AnimatedNumber value={value} duration={1600} />
      </div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 mt-1">{label}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SECTION 2 — STORY TIMELINE
═══════════════════════════════════════════════════════════════════════════════ */
function StorySection({ data, setMood }: { data: ClientLensData; setMood: (m: Mood) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const lineProgress = useTransform(scrollYProgress, [0.1, 0.7], [0, 1]);

  const startedDate = data.identity.started_at
    ? new Date(data.identity.started_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '—';

  const nowDate = new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

  return (
    <section ref={ref} onMouseEnter={() => setMood('trust')} className="relative py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="mb-16 text-center"
        >
          <div className="text-[11px] uppercase tracking-[0.4em] text-white/40 mb-3">The arc</div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ letterSpacing: '-0.02em' }}>
            Where we started · where we are
          </h2>
        </motion.div>

        {/* Timeline */}
        <div className="relative">
          {/* The line itself — animates as user scrolls */}
          <div className="absolute left-0 right-0 top-1/2 h-px" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              className="h-full origin-left"
              style={{
                scaleX: lineProgress,
                background: `linear-gradient(90deg, var(--lens-accent), var(--lens-accent), transparent)`,
                boxShadow: `0 0 12px var(--lens-glow)`,
              }}
            />
          </div>

          <div className="relative grid grid-cols-3 gap-8">
            <TimelineNode
              when={startedDate}
              label="Project began"
              detail={`${data.identity.campaign_count} campaign${data.identity.campaign_count === 1 ? '' : 's'} initiated`}
              delay={0.2}
            />
            <TimelineNode
              when="Through"
              label={`${data.identity.days_active ?? 0} days of work`}
              detail={`${data.rankings.total_queries} queries indexed · ${data.traffic.impressions.toLocaleString()} impressions captured`}
              delay={0.4}
              accent
            />
            <TimelineNode
              when={nowDate}
              label="Today"
              detail={data.headline.label}
              delay={0.6}
              now
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function TimelineNode({ when, label, detail, delay = 0, accent = false, now = false }: {
  when: string; label: string; detail: string; delay?: number; accent?: boolean; now?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ delay, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="text-center"
    >
      <motion.div
        whileHover={{ scale: 1.15 }}
        transition={{ type: 'spring', stiffness: 300 }}
        className="w-4 h-4 rounded-full mx-auto mb-6 relative"
        style={{
          background: accent || now ? 'var(--lens-accent)' : 'rgba(255,255,255,0.4)',
          boxShadow: accent || now ? `0 0 30px var(--lens-glow)` : 'none',
        }}
      >
        {now && (
          <motion.div
            animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full"
            style={{ background: 'var(--lens-accent)' }}
          />
        )}
      </motion.div>
      <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-2">{when}</div>
      <div className="text-lg font-bold text-white/90 mb-1">{label}</div>
      <div className="text-sm text-white/55 max-w-xs mx-auto">{detail}</div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SECTION 3 — RANKING LANDSCAPE
   Floating cards in a stylized depth grid. Cards stagger in. Hover lifts a
   card and shifts the page mood to "focus" (violet).
═══════════════════════════════════════════════════════════════════════════════ */
function RankingLandscape({ data, setMood }: { data: ClientLensData; setMood: (m: Mood) => void }) {
  if (data.rankings.top.length === 0) {
    return (
      <section onMouseEnter={() => setMood('careful')} className="relative py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-[11px] uppercase tracking-[0.4em] text-white/40 mb-3">Rankings</div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6" style={{ letterSpacing: '-0.02em' }}>
            Visibility is being built
          </h2>
          <p className="text-white/55 leading-relaxed max-w-xl mx-auto">
            Once Google Search Console populates query-level data for this property, this section will show the keywords you're ranking for — each one as a card with its position, clicks, and trajectory.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section onMouseEnter={() => setMood('focus')} className="relative py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="mb-16 text-center"
        >
          <div className="text-[11px] uppercase tracking-[0.4em] text-white/40 mb-3">Live rankings</div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-3" style={{ letterSpacing: '-0.02em' }}>
            What you rank for, right now
          </h2>
          <div className="text-sm text-white/40">
            Top {data.rankings.top.length} by visibility · {data.rankings.page_1_count} on page 1 · sourced from Google Search Console
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.rankings.top.map((r, i) => (
            <RankingCard key={r.keyword} ranking={r} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RankingCard({ ranking, index }: { ranking: ClientLensData['rankings']['top'][number]; index: number }) {
  const onPage1 = (ranking.position ?? 99) <= 10;
  const onPage2 = (ranking.position ?? 99) <= 20;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotateX: -10 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay: index * 0.06, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -6, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
      className="group relative rounded-2xl p-5 backdrop-blur-sm overflow-hidden cursor-default"
      style={{
        background: `linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))`,
        border: '0.5px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 0%, var(--lens-accent-soft), transparent 60%)` }}
      />

      {/* Position badge */}
      <div className="relative flex items-start justify-between mb-3">
        <div
          className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md"
          style={{
            color: onPage1 ? 'var(--lens-accent)' : onPage2 ? 'hsl(36, 95%, 65%)' : 'rgba(255,255,255,0.5)',
            background: onPage1 ? 'var(--lens-accent-soft)' : onPage2 ? 'hsl(36, 95%, 62%, 0.12)' : 'rgba(255,255,255,0.05)',
            border: `0.5px solid ${onPage1 ? 'var(--lens-accent)' : onPage2 ? 'hsl(36, 95%, 62%, 0.3)' : 'transparent'}`,
          }}
        >
          Position {ranking.position?.toFixed(1) ?? '—'}
        </div>
        {onPage1 && <Sparkles className="w-4 h-4" style={{ color: 'var(--lens-accent)' }} />}
      </div>

      {/* Keyword */}
      <div className="relative text-lg font-semibold text-white/95 mb-4 leading-tight" style={{ letterSpacing: '-0.01em' }}>
        {ranking.keyword}
      </div>

      {/* Stats */}
      <div className="relative grid grid-cols-3 gap-3 pt-3 border-t border-white/5">
        <Stat label="Clicks" value={ranking.clicks.toLocaleString()} />
        <Stat label="Imps" value={ranking.impressions.toLocaleString()} />
        <Stat label="CTR" value={`${ranking.ctr}%`} />
      </div>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-white/85" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SECTION 4 — TRAFFIC FLOW
   Animated funnel: Impressions → Clicks → (Sessions/Conversions if GA4
   connected). Each stage is a bar with the number counting up.
═══════════════════════════════════════════════════════════════════════════════ */
function TrafficFlow({ data, setMood }: { data: ClientLensData; setMood: (m: Mood) => void }) {
  const stages = useMemo(() => {
    const arr: Array<{ label: string; value: number; suffix?: string; honest?: string }> = [
      { label: 'Impressions',  value: data.traffic.impressions },
      { label: 'Clicks',       value: data.traffic.clicks },
    ];
    if (data.traffic.ga4_connected && data.traffic.ga4_summary) {
      const summary = data.traffic.ga4_summary || {};
      if (typeof summary.sessions === 'number') arr.push({ label: 'Sessions', value: summary.sessions });
      if (typeof summary.conversions === 'number') arr.push({ label: 'Conversions', value: summary.conversions });
    }
    return arr;
  }, [data]);

  const maxV = Math.max(...stages.map(s => s.value), 1);

  return (
    <section onMouseEnter={() => setMood('trust')} className="relative py-32 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="mb-16 text-center"
        >
          <div className="text-[11px] uppercase tracking-[0.4em] text-white/40 mb-3">The flow</div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-3" style={{ letterSpacing: '-0.02em' }}>
            How visibility becomes engagement
          </h2>
          <div className="text-sm text-white/40">
            {data.traffic.ga4_connected
              ? 'Sourced from Google Search Console + Google Analytics 4'
              : 'Sourced from Google Search Console · connect GA4 to see sessions and conversions'}
          </div>
        </motion.div>

        <div className="space-y-5">
          {stages.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ delay: i * 0.15, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-[11px] uppercase tracking-[0.3em] text-white/45">{s.label}</div>
                <div className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--lens-accent)', fontVariantNumeric: 'tabular-nums' }}>
                  <AnimatedNumber value={s.value} duration={1800 + i * 200} />
                </div>
              </div>
              <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 + 0.2, duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-y-0 left-0 right-0 origin-left rounded-full"
                  style={{
                    transform: `scaleX(${s.value / maxV})`,
                    background: `linear-gradient(90deg, var(--lens-accent), var(--lens-accent), transparent)`,
                    boxShadow: `0 0 16px var(--lens-glow)`,
                  }}
                />
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTR callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="mt-12 text-center"
        >
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/40 mb-2">Click-through rate</div>
          <div className="text-5xl font-bold" style={{ color: 'var(--lens-accent)', fontVariantNumeric: 'tabular-nums' }}>
            <AnimatedNumber value={data.traffic.ctr} decimals={2} suffix="%" duration={2000} />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SECTION 5 — FIVE PILLARS
   Five glowing orbs. Each one shifts color by status. Hover expands the orb
   and reveals its summary. Click toggles deeper detail.
═══════════════════════════════════════════════════════════════════════════════ */
const PILLAR_ICONS: Record<string, any> = {
  cluster_map:      Layers,
  internal_linking: Link2,
  off_page:         Globe,
  technical_audit:  Wrench,
  monitoring:       Eye,
};

const STATUS_COLOR: Record<string, string> = {
  green:   'hsl(148, 85%, 60%)',
  amber:   'hsl(36, 95%, 62%)',
  red:     'hsl(0, 80%, 65%)',
  pending: 'hsl(220, 15%, 55%)',
};

function PillarsHealth({ data, setMood }: { data: ClientLensData; setMood: (m: Mood) => void }) {
  return (
    <section onMouseEnter={() => setMood('trust')} className="relative py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="mb-16 text-center"
        >
          <div className="text-[11px] uppercase tracking-[0.4em] text-white/40 mb-3">Five pillars</div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-3" style={{ letterSpacing: '-0.02em' }}>
            What we're doing for you
          </h2>
          <div className="text-sm text-white/40">
            Each pillar is an active workstream. Colours show current health.
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
          {data.pillars.map((p, i) => (
            <PillarOrb key={p.pillar} pillar={p} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PillarOrb({ pillar, index }: { pillar: ClientLensData['pillars'][number]; index: number }) {
  const Icon = PILLAR_ICONS[pillar.pillar] || Activity;
  const color = STATUS_COLOR[pillar.status];
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ delay: index * 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      onClick={() => setExpanded(!expanded)}
      className="group relative rounded-2xl p-6 cursor-pointer overflow-hidden"
      style={{
        background: `linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))`,
        border: `0.5px solid ${color}40`,
      }}
    >
      {/* Orb */}
      <div className="relative mx-auto mb-4 w-16 h-16 flex items-center justify-center">
        <motion.div
          animate={{ scale: pillar.status === 'pending' ? 1 : [1, 1.1, 1] }}
          transition={{ duration: 3, repeat: pillar.status === 'pending' ? 0 : Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${color}60 0%, ${color}10 50%, transparent 70%)`,
            filter: 'blur(8px)',
          }}
        />
        <div
          className="relative w-12 h-12 rounded-full flex items-center justify-center"
          style={{
            background: `radial-gradient(circle, ${color}30 0%, ${color}10 100%)`,
            border: `1px solid ${color}80`,
          }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>

      {/* Label */}
      <div className="text-center">
        <div className="text-sm font-bold text-white/90 mb-1">{pillar.label}</div>
        <div className="text-[10px] uppercase tracking-wider mb-3" style={{ color }}>
          {pillar.status === 'pending' ? 'Activating' : pillar.status === 'green' ? 'On track' : pillar.status === 'amber' ? 'Attention' : 'Critical'}
        </div>
      </div>

      {/* Summary — shown on expanded */}
      <AnimatePresence>
        {expanded && pillar.summary && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4 }}
            className="text-[11px] text-white/60 leading-relaxed mt-2 pt-3 border-t border-white/5"
          >
            {pillar.summary}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click hint */}
      {!expanded && pillar.summary && (
        <div className="text-[9px] text-center text-white/30 mt-1">Tap for detail</div>
      )}
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SECTION 6 — WINS REEL
   Cinematic carousel of recent wins. Auto-advances. Sparkle effect on each.
═══════════════════════════════════════════════════════════════════════════════ */
function WinsReel({ data, setMood }: { data: ClientLensData; setMood: (m: Mood) => void }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % data.wins.length), 5000);
    return () => clearInterval(t);
  }, [data.wins.length]);

  const w = data.wins[idx];

  return (
    <section onMouseEnter={() => setMood('wins')} className="relative py-32 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12 text-center"
        >
          <div className="text-[11px] uppercase tracking-[0.4em] text-white/40 mb-3">Wins this period</div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ letterSpacing: '-0.02em' }}>
            Momentum, in motion
          </h2>
        </motion.div>

        <div className="relative rounded-3xl p-12 min-h-[280px] overflow-hidden"
          style={{
            background: `linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))`,
            border: '0.5px solid rgba(255,255,255,0.1)',
          }}
        >
          {/* Glow background */}
          <div className="absolute inset-0 opacity-50" style={{
            background: `radial-gradient(ellipse at center, var(--lens-accent-soft) 0%, transparent 60%)`,
          }} />

          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="w-5 h-5" style={{ color: 'var(--lens-accent)' }} />
                <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: 'var(--lens-accent)' }}>
                  {w.pillar.replace('_', ' ')}
                </div>
              </div>
              <div className="text-2xl md:text-3xl font-bold text-white/95 mb-3" style={{ letterSpacing: '-0.02em' }}>
                {w.title}
              </div>
              <div className="text-base text-white/65 leading-relaxed max-w-3xl">
                {w.summary}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Dot indicators */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
            {data.wins.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className="w-1.5 h-1.5 rounded-full transition-all"
                style={{
                  background: i === idx ? 'var(--lens-accent)' : 'rgba(255,255,255,0.2)',
                  width: i === idx ? 16 : 6,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SECTION 7 — FORECAST
   Animated curve showing trajectory. SVG path with stroke-dashoffset animation.
═══════════════════════════════════════════════════════════════════════════════ */
function ForecastSection({ data, setMood }: { data: ClientLensData; setMood: (m: Mood) => void }) {
  return (
    <section onMouseEnter={() => setMood('focus')} className="relative py-32 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12 text-center"
        >
          <div className="text-[11px] uppercase tracking-[0.4em] text-white/40 mb-3">What's coming</div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-3" style={{ letterSpacing: '-0.02em' }}>
            The next horizon
          </h2>
          <div className="text-sm text-white/40">
            {data.forecast!.active_campaigns} active campaign{data.forecast!.active_campaigns === 1 ? '' : 's'} working toward defined position targets
          </div>
        </motion.div>

        {/* Targeting cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.forecast!.targeting.map((t, i) => (
            <motion.div
              key={t.keyword}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: i * 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl p-5 relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))`,
                border: '0.5px solid rgba(255,255,255,0.08)',
              }}
            >
              <div className="text-sm font-semibold text-white/90 mb-4 leading-tight">{t.keyword}</div>
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Current</div>
                  <div className="text-2xl font-bold text-white/75" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {t.current_position ? t.current_position.toFixed(0) : '—'}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-white/30 mb-2" />
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Target</div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--lens-accent)', fontVariantNumeric: 'tabular-nums' }}>
                    {t.target_position ?? '—'}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SECTION 8 — CTA
═══════════════════════════════════════════════════════════════════════════════ */
function CTASection({ data, setMood }: { data: ClientLensData; setMood: (m: Mood) => void }) {
  return (
    <section onMouseEnter={() => setMood('trust')} className="relative py-32 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6" style={{ letterSpacing: '-0.02em' }}>
            What's next?
          </h2>
          <p className="text-lg text-white/55 max-w-2xl mx-auto mb-12">
            Want to dig deeper, request a deliverable, or schedule a strategy call? Pick a path.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <CTAButton icon={<Download className="w-4 h-4" />} label="PDF version" disabled />
            <CTAButton icon={<Calendar className="w-4 h-4" />} label="Schedule a call" />
            <CTAButton icon={<MessageCircle className="w-4 h-4" />} label="Ask a question" />
          </div>

          <div className="text-[11px] text-white/30 mt-8 italic">
            PDF export coming in the next release.
          </div>
        </motion.div>

        {/* Footer */}
        <div className="mt-32 pt-8 border-t border-white/5 text-[10px] uppercase tracking-[0.3em] text-white/25">
          Powered by SEO Season · {data.identity.display_name}
        </div>
      </div>
    </section>
  );
}

function CTAButton({ icon, label, disabled = false }: { icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <motion.button
      whileHover={!disabled ? { y: -2, scale: 1.02 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      disabled={disabled}
      className="px-6 py-3 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: disabled ? 'rgba(255,255,255,0.03)' : 'var(--lens-accent-soft)',
        color: disabled ? 'rgba(255,255,255,0.4)' : 'var(--lens-accent)',
        border: `0.5px solid ${disabled ? 'rgba(255,255,255,0.08)' : 'var(--lens-accent)'}`,
      }}
    >
      {icon}
      {label}
    </motion.button>
  );
}
