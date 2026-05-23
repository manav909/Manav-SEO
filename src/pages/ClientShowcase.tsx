/* ════════════════════════════════════════════════════════════════════
   src/pages/ClientShowcase.tsx
   Phase 22 — Cinematic client showcase

   A boardroom-grade experience that turns marketing data into a story.
   Every visual element flows from the data contract assembled by
   client-showcase-engine.ts. Change one server-side signal, the
   entire page mood and motion shifts.

   Architecture:
     • One fetch on mount → full ShowcaseDataClient
     • Scenes render based on visualization.kind from each scene
     • CSS custom properties on the page root drive color psychology
     • Scroll triggers the cinema — each section is its own act
     • Reduced-motion users get a calm, static read

   No new npm dependencies. Built on framer-motion (already present).
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform, AnimatePresence, useReducedMotion, useMotionValue, animate } from 'framer-motion';
import {
  Sparkles, TrendingUp, Target, Compass, Award, ArrowUpRight,
  CheckCircle2, AlertCircle, Database, Clock, X, Link2,
} from 'lucide-react';
import {
  getClientShowcase,
  type ShowcaseDataClient, type ShowcaseSceneClient,
  type ShowcaseColorAnchorClient, type ShowcaseMoodClient,
  type ShowcaseSceneMoodClient,
} from '@/components/pm/api';
import { useProject } from '@/contexts/ProjectContext';

/* ════════════════════════════════════════════════════════════════════
   COLOR PSYCHOLOGY — anchor → hsl triple
   These feed CSS custom properties at the page root. Hover and scroll
   transitions reweight which accent dominates.
══════════════════════════════════════════════════════════════════════ */

const COLOR_ANCHORS: Record<ShowcaseColorAnchorClient, { h: number; s: number; l: number; name: string }> = {
  gold:     { h:  42, s: 92, l: 60, name: 'gold' },     // wins, ascent
  cyan:     { h: 188, s: 85, l: 58, name: 'cyan' },     // calm, reliable
  magenta:  { h: 320, s: 78, l: 60, name: 'magenta' },  // attention, pivot
  emerald:  { h: 152, s: 70, l: 55, name: 'emerald' },  // growth, breakthrough
  amethyst: { h: 268, s: 70, l: 65, name: 'amethyst' }, // foundation, possibility
};

const SCENE_MOOD_TO_ANCHOR: Record<ShowcaseSceneMoodClient, ShowcaseColorAnchorClient> = {
  win:        'gold',
  progress:   'cyan',
  pivot:      'magenta',
  foundation: 'amethyst',
};

const DOMINANT_MOOD_TO_ANCHOR: Record<ShowcaseMoodClient, ShowcaseColorAnchorClient> = {
  ascending:    'gold',
  steady:       'cyan',
  turbulent:    'magenta',
  breakthrough: 'emerald',
  foundation:   'amethyst',
};

/* ════════════════════════════════════════════════════════════════════
   PAGE ROOT
══════════════════════════════════════════════════════════════════════ */

export default function ClientShowcase() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { selectedProjectId } = useProject() as any;
  const projectId = routeProjectId || selectedProjectId;

  const [data, setData] = useState<ShowcaseDataClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) { setLoading(false); setError('No project selected.'); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const r = await getClientShowcase({ projectId });
      if (cancelled) return;
      if (r.error) { setError(r.error); setLoading(false); return; }
      if (r.showcase) setData(r.showcase);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  /* Page-level CSS variables driven by the dominant mood. Children read these
     to render their accents. As scenes scroll into view, they override the
     active anchor temporarily via their own root style. */
  const dominantAnchor: ShowcaseColorAnchorClient = data
    ? DOMINANT_MOOD_TO_ANCHOR[data.meta.mood_dominant]
    : 'cyan';
  const dominant = COLOR_ANCHORS[dominantAnchor];

  if (loading) return <ShowcaseLoading />;
  if (error)   return <ShowcaseError message={error} onBack={() => navigate('/')} />;
  if (!data)   return <ShowcaseError message="No data available." onBack={() => navigate('/')} />;

  return (
    <div
      className="showcase-root"
      data-mood={data.meta.mood_dominant}
      style={{
        ['--anchor-h' as any]: dominant.h,
        ['--anchor-s' as any]: `${dominant.s}%`,
        ['--anchor-l' as any]: `${dominant.l}%`,
        ['--bg-deep' as any]: '4 6 18',
        ['--bg-mid' as any]: '10 14 32',
        ['--bg-soft' as any]: '20 26 56',
      } as React.CSSProperties}
    >
      <ShowcaseStyles />
      <CinematicBackground />

      {/* Top-right close affordance — return to operator view */}
      <button
        onClick={() => navigate(-1)}
        className="showcase-exit"
        title="Return to operator view"
        aria-label="Close showcase"
      >
        <X className="h-4 w-4" />
      </button>

      <main className="showcase-stage">
        <OpeningTitle meta={data.meta} />
        <HeroMetric hero={data.hero} mood={data.meta.mood_dominant} />
        {data.scenes.map((scene, i) => (
          <Scene key={scene.id} scene={scene} index={i} />
        ))}
        {data.wins.length > 0 && <WinsTimeline wins={data.wins} />}
        {data.forecast && <ForecastBlock forecast={data.forecast} />}
        {data.next_chapter.length > 0 && <NextChapter items={data.next_chapter} />}
        <TransparencyCredits transparency={data.transparency} meta={data.meta} />
      </main>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   STYLES — page-scoped CSS via <style> for self-containment
══════════════════════════════════════════════════════════════════════ */

function ShowcaseStyles() {
  return (
    <style>{`
      .showcase-root {
        position: relative;
        min-height: 100vh;
        background: rgb(var(--bg-deep));
        color: rgb(245 247 255);
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        overflow-x: hidden;
        font-feature-settings: 'tnum' 1, 'ss01' 1;
        --anchor: hsl(var(--anchor-h), var(--anchor-s), var(--anchor-l));
        --anchor-glow: hsla(var(--anchor-h), var(--anchor-s), var(--anchor-l), 0.35);
        --anchor-soft: hsla(var(--anchor-h), var(--anchor-s), calc(var(--anchor-l) + 12%), 0.15);
      }
      .showcase-root, .showcase-root * {
        transition: color 0.6s ease, background-color 0.6s ease, border-color 0.6s ease;
      }
      .showcase-exit {
        position: fixed; top: 1.25rem; right: 1.25rem; z-index: 100;
        width: 36px; height: 36px; border-radius: 18px;
        display: flex; align-items: center; justify-content: center;
        background: rgba(255,255,255,0.04);
        border: 0.5px solid rgba(255,255,255,0.10);
        color: rgba(255,255,255,0.55);
        cursor: pointer;
        backdrop-filter: blur(12px);
        transition: all 0.25s ease;
      }
      .showcase-exit:hover {
        background: rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.95);
        transform: scale(1.05);
      }
      .showcase-stage {
        position: relative; z-index: 2;
        max-width: 1280px;
        margin: 0 auto;
        padding: 0 1.5rem;
      }
      .showcase-bg {
        position: fixed; inset: 0; z-index: 1; pointer-events: none;
        overflow: hidden;
      }
      .showcase-bg::before {
        content: '';
        position: absolute; inset: -20%;
        background:
          radial-gradient(ellipse 80% 60% at 30% 20%, var(--anchor-glow), transparent 60%),
          radial-gradient(ellipse 60% 80% at 70% 70%, hsla(var(--anchor-h), var(--anchor-s), 70%, 0.18), transparent 60%);
        animation: bgDrift 28s ease-in-out infinite alternate;
        filter: blur(60px);
      }
      .showcase-bg::after {
        content: '';
        position: absolute; inset: 0;
        background:
          linear-gradient(180deg, transparent 0%, rgba(var(--bg-deep), 0.6) 100%);
      }
      @keyframes bgDrift {
        0%   { transform: translate(0, 0) scale(1); }
        100% { transform: translate(-4%, 3%) scale(1.05); }
      }
      .showcase-particle {
        position: absolute; border-radius: 50%;
        background: hsla(var(--anchor-h), var(--anchor-s), 80%, 0.5);
        box-shadow: 0 0 12px var(--anchor-glow);
        pointer-events: none;
      }

      /* Section base — full-bleed vertical rhythm */
      .scene-section {
        min-height: 100vh;
        display: flex; flex-direction: column; justify-content: center;
        padding: 6rem 0 4rem 0;
        position: relative;
      }
      .scene-section[data-tight="1"] {
        min-height: auto;
        padding: 4rem 0 2rem 0;
      }

      /* Typography scale */
      .display-xl { font-size: clamp(3.5rem, 9vw, 8rem); line-height: 0.95; letter-spacing: -0.04em; font-weight: 300; }
      .display-lg { font-size: clamp(2.5rem, 6vw, 5rem); line-height: 1.0; letter-spacing: -0.035em; font-weight: 500; }
      .display-md { font-size: clamp(1.75rem, 3.5vw, 3rem); line-height: 1.1; letter-spacing: -0.02em; font-weight: 500; }
      .display-sm { font-size: clamp(1.25rem, 2vw, 1.75rem); line-height: 1.3; letter-spacing: -0.01em; font-weight: 500; }
      .label-tiny { font-size: 0.6875rem; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; color: rgba(245,247,255,0.55); }
      .prose-soft { font-size: clamp(1rem, 1.2vw, 1.125rem); line-height: 1.65; color: rgba(245,247,255,0.78); font-weight: 400; }

      /* Hero metric number */
      .hero-number {
        font-size: clamp(5rem, 16vw, 14rem);
        line-height: 0.9;
        letter-spacing: -0.06em;
        font-weight: 200;
        color: var(--anchor);
        text-shadow: 0 0 80px var(--anchor-glow);
        font-feature-settings: 'tnum' 1;
      }
      .delta-badge {
        display: inline-flex; align-items: center; gap: 0.35rem;
        padding: 0.4rem 0.85rem; border-radius: 99px;
        background: var(--anchor-soft);
        border: 0.5px solid hsla(var(--anchor-h), var(--anchor-s), 70%, 0.35);
        color: var(--anchor);
        font-size: 0.8125rem; font-weight: 600;
        font-feature-settings: 'tnum' 1;
      }

      /* Scene grid */
      .scene-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: clamp(2rem, 5vw, 5rem);
        align-items: center;
      }
      .scene-grid[data-flip="1"] .scene-viz { order: 2; }
      .scene-grid[data-flip="1"] .scene-text { order: 1; }
      @media (max-width: 768px) {
        .scene-grid { grid-template-columns: 1fr; }
        .scene-grid[data-flip="1"] .scene-viz { order: 0; }
        .scene-grid[data-flip="1"] .scene-text { order: 1; }
      }

      .scene-viz {
        position: relative;
        aspect-ratio: 1 / 1;
        max-width: 480px;
        margin: 0 auto;
        width: 100%;
        display: flex; align-items: center; justify-content: center;
      }
      .scene-card-glow {
        position: absolute; inset: -10%;
        background: radial-gradient(circle, var(--scene-anchor-glow, var(--anchor-glow)), transparent 70%);
        filter: blur(40px);
        z-index: 0;
        opacity: 0.7;
      }

      /* Proof bullets */
      .proof-list { display: flex; flex-direction: column; gap: 0.6rem; }
      .proof-list li {
        font-size: 0.875rem;
        color: rgba(245,247,255,0.65);
        line-height: 1.55;
        display: flex; align-items: flex-start; gap: 0.6rem;
      }
      .proof-bullet {
        width: 4px; height: 4px; border-radius: 50%;
        background: var(--anchor);
        flex-shrink: 0; margin-top: 0.55rem;
        box-shadow: 0 0 8px var(--anchor-glow);
      }

      /* Wins timeline */
      .wins-track {
        display: flex; gap: 1rem; overflow-x: auto;
        padding: 1rem 0;
        scrollbar-width: thin;
      }
      .wins-track::-webkit-scrollbar { height: 6px; }
      .wins-track::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
      .win-card {
        flex-shrink: 0; min-width: 280px; max-width: 320px;
        padding: 1.25rem;
        background: rgba(255,255,255,0.03);
        border: 0.5px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        backdrop-filter: blur(12px);
        position: relative; overflow: hidden;
        cursor: default;
      }
      .win-card[data-intensity="dramatic"]::before {
        content: ''; position: absolute; inset: 0;
        background: linear-gradient(135deg, var(--anchor-soft), transparent 70%);
        pointer-events: none;
      }
      .win-card[data-intensity="dramatic"] {
        border-color: hsla(var(--anchor-h), var(--anchor-s), 70%, 0.3);
        box-shadow: 0 0 32px hsla(var(--anchor-h), var(--anchor-s), 60%, 0.2);
      }

      /* Next chapter cards */
      .chapter-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 1rem;
      }
      .chapter-card {
        position: relative;
        padding: 1.5rem;
        background: rgba(255,255,255,0.025);
        border: 0.5px solid rgba(255,255,255,0.08);
        border-radius: 18px;
        backdrop-filter: blur(8px);
        overflow: hidden;
        transition: transform 0.35s ease, border-color 0.35s ease, background 0.35s ease;
      }
      .chapter-card:hover {
        transform: translateY(-4px);
        border-color: hsla(var(--anchor-h), var(--anchor-s), 70%, 0.4);
        background: rgba(255,255,255,0.04);
      }
      .chapter-card::after {
        content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
        background: linear-gradient(90deg, transparent, var(--anchor), transparent);
        opacity: 0.5;
      }

      /* Transparency footer */
      .credits {
        padding: 4rem 0 6rem 0;
        border-top: 0.5px solid rgba(255,255,255,0.08);
        margin-top: 4rem;
      }
      .source-pill {
        display: inline-flex; align-items: center; gap: 0.5rem;
        padding: 0.4rem 0.85rem; border-radius: 99px;
        font-size: 0.75rem;
        background: rgba(255,255,255,0.03);
        border: 0.5px solid rgba(255,255,255,0.08);
      }
      .source-dot {
        width: 6px; height: 6px; border-radius: 50%;
      }
      .source-dot[data-status="fresh"]   { background: hsl(152 70% 55%); box-shadow: 0 0 8px hsla(152, 70%, 55%, 0.5); }
      .source-dot[data-status="stale"]   { background: hsl(42 92% 60%); }
      .source-dot[data-status="missing"] { background: rgba(255,255,255,0.25); }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .showcase-bg::before { animation: none; }
        .showcase-root, .showcase-root * { transition: none !important; }
      }
    `}</style>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CINEMATIC BACKGROUND — animated gradient mesh + drifting particles
══════════════════════════════════════════════════════════════════════ */

function CinematicBackground() {
  const reduce = useReducedMotion();
  const particles = useMemo(() => {
    const arr: Array<{ x: number; y: number; size: number; delay: number; duration: number }> = [];
    for (let i = 0; i < 18; i++) {
      arr.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 2 + Math.random() * 4,
        delay: Math.random() * 20,
        duration: 18 + Math.random() * 22,
      });
    }
    return arr;
  }, []);

  return (
    <div className="showcase-bg" aria-hidden>
      {!reduce && particles.map((p, i) => (
        <motion.div
          key={i}
          className="showcase-particle"
          style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%` }}
          animate={{
            y: [0, -40, 0],
            opacity: [0.2, 0.6, 0.2],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   OPENING TITLE — first viewport
══════════════════════════════════════════════════════════════════════ */

function OpeningTitle({ meta }: { meta: ShowcaseDataClient['meta'] }) {
  return (
    <section className="scene-section" data-section="opening">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="label-tiny mb-4">A story in motion</div>
        <h1 className="display-xl mb-6">{meta.project_name}</h1>
        {meta.project_domain && (
          <div className="display-sm mb-3" style={{ color: 'rgba(245,247,255,0.55)' }}>
            {meta.project_domain}
          </div>
        )}
        <div className="prose-soft mt-6" style={{ maxWidth: '32ch' }}>
          {meta.days_active} day{meta.days_active === 1 ? '' : 's'} into the work. Below is what's
          happened, in real signals from real sources.
        </div>
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        className="absolute"
        style={{ bottom: '2.5rem', left: '50%', transform: 'translateX(-50%)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 0.6 }}
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="label-tiny flex flex-col items-center gap-1"
        >
          <span>Scroll</span>
          <span style={{ fontSize: '1rem', lineHeight: 1 }}>↓</span>
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   HERO METRIC — the headline number
══════════════════════════════════════════════════════════════════════ */

function HeroMetric({ hero, mood }: { hero: ShowcaseDataClient['hero']; mood: ShowcaseMoodClient }) {
  const reduce = useReducedMotion();
  const anchor = COLOR_ANCHORS[hero.color_anchor];

  /* Apply this hero's anchor as override while in view */
  return (
    <section
      className="scene-section"
      data-section="hero"
      style={{
        ['--anchor-h' as any]: anchor.h,
        ['--anchor-s' as any]: `${anchor.s}%`,
        ['--anchor-l' as any]: `${anchor.l}%`,
      } as React.CSSProperties}
    >
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-20%' }}
        transition={{ duration: 0.9 }}
      >
        <div className="label-tiny mb-6">{hero.headline_label}</div>
        <div className="hero-number">
          <AnimatedNumber value={hero.headline_value} duration={reduce ? 0 : 2.0} />
        </div>
        <div className="display-md mt-6" style={{ color: 'rgba(245,247,255,0.7)', fontWeight: 300 }}>
          {hero.headline_unit}
        </div>
        <div className="prose-soft mt-8" style={{ maxWidth: '52ch' }}>
          {hero.narrative}
        </div>
        <div className="mt-6 flex items-center gap-3 flex-wrap">
          {hero.headline_delta_pct !== 0 && (
            <div className="delta-badge">
              <TrendingUp className="h-3.5 w-3.5" />
              {hero.headline_delta_pct > 0 ? '+' : ''}{hero.headline_delta_pct.toFixed(0)}%
            </div>
          )}
          <div className="label-tiny" style={{ opacity: 0.6 }}>
            {hero.headline_horizon}
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SCENE — alternating layout, viz-driven
══════════════════════════════════════════════════════════════════════ */

function Scene({ scene, index }: { scene: ShowcaseSceneClient; index: number }) {
  const flip = index % 2 === 1;
  const anchor = COLOR_ANCHORS[SCENE_MOOD_TO_ANCHOR[scene.mood]];

  return (
    <section
      className="scene-section"
      data-section={`scene-${scene.pillar}`}
      style={{
        ['--anchor-h' as any]: anchor.h,
        ['--anchor-s' as any]: `${anchor.s}%`,
        ['--anchor-l' as any]: `${anchor.l}%`,
      } as React.CSSProperties}
    >
      <div className="scene-grid" data-flip={flip ? '1' : '0'}>
        {/* Visualization side */}
        <motion.div
          className="scene-viz"
          initial={{ opacity: 0, scale: 0.92 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="scene-card-glow" />
          <Visualization kind={scene.visualization.kind} params={scene.visualization.params} />
        </motion.div>

        {/* Text side */}
        <motion.div
          className="scene-text"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="label-tiny mb-3" style={{ color: 'var(--anchor)' }}>
            {pillarLabel(scene.pillar)} · {sceneMoodLabel(scene.mood)}
          </div>
          <h2 className="display-lg mb-3">{scene.title}</h2>
          <div className="display-sm mb-5" style={{ color: 'rgba(245,247,255,0.65)', fontWeight: 400 }}>
            {scene.subtitle}
          </div>

          <div className="flex items-baseline gap-6 mb-5 flex-wrap">
            <div>
              <div className="label-tiny mb-1">{scene.primary_metric.label}</div>
              <div className="display-md" style={{ color: 'var(--anchor)' }}>
                <MetricValue metric={scene.primary_metric} />
                {scene.primary_metric.unit && (
                  <span style={{ fontSize: '0.5em', marginLeft: '0.4em', color: 'rgba(245,247,255,0.55)' }}>
                    {scene.primary_metric.unit}
                  </span>
                )}
              </div>
            </div>
            {(scene.secondary_metrics || []).map((m, i) => (
              <div key={i}>
                <div className="label-tiny mb-1">{m.label}</div>
                <div className="display-sm" style={{ color: 'rgba(245,247,255,0.7)' }}>{m.value}</div>
              </div>
            ))}
          </div>

          <p className="prose-soft mb-5">{scene.narrative_short}</p>

          {scene.proof.length > 0 && (
            <ul className="proof-list">
              {scene.proof.map((p, i) => (
                <li key={i}>
                  <span className="proof-bullet" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>
    </section>
  );
}

function MetricValue({ metric }: { metric: ShowcaseSceneClient['primary_metric'] }) {
  if (metric.transform === 'count_up' && typeof metric.value === 'number') {
    return <AnimatedNumber value={metric.value} />;
  }
  if (metric.transform === 'rank_climb' && typeof metric.value === 'number') {
    return <span>{metric.value.toFixed(1)}</span>;
  }
  if (metric.transform === 'percent' && typeof metric.value === 'number') {
    return <span>{metric.value.toFixed(1)}%</span>;
  }
  return <span>{metric.value}</span>;
}

/* ════════════════════════════════════════════════════════════════════
   VISUALIZATIONS — one per scene kind
══════════════════════════════════════════════════════════════════════ */

function Visualization({ kind, params }: { kind: ShowcaseSceneClient['visualization']['kind']; params: any }) {
  switch (kind) {
    case 'orbital':         return <OrbitalViz   params={params} />;
    case 'rank_climb':      return <RankClimbViz params={params} />;
    case 'ascending_bars':  return <AscendingBarsViz params={params} />;
    case 'flowing_lines':   return <FlowingLinesViz params={params} />;
    case 'pulse_stack':     return <PulseStackViz params={params} />;
    case 'particle_burst':  return <ParticleBurstViz params={params} />;
    default:                return <OrbitalViz   params={params} />;
  }
}

/* ─── Orbital — center label, dots in rings ──────────────────────── */
function OrbitalViz({ params }: { params: any }) {
  const count = Math.max(3, Math.min(12, Number(params.cluster_count || 6)));
  const rings = Math.max(1, Math.min(2, Number(params.ring_count || 1)));
  const items = Array.from({ length: count }, (_, i) => i);
  const reduce = useReducedMotion();

  return (
    <svg viewBox="-100 -100 200 200" style={{ width: '100%', height: '100%' }}>
      {/* Background ring */}
      <circle cx={0} cy={0} r={70} fill="none" stroke="hsla(var(--anchor-h), var(--anchor-s), 70%, 0.15)" strokeWidth={0.5} strokeDasharray="2,4" />
      {rings === 2 && (
        <circle cx={0} cy={0} r={45} fill="none" stroke="hsla(var(--anchor-h), var(--anchor-s), 70%, 0.18)" strokeWidth={0.5} strokeDasharray="2,4" />
      )}
      {/* Glowing center node */}
      <motion.circle
        cx={0} cy={0} r={10}
        fill="var(--anchor)"
        animate={reduce ? {} : { r: [10, 12, 10], opacity: [0.9, 1, 0.9] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{ filter: 'drop-shadow(0 0 12px var(--anchor-glow))' }}
      />
      <text x={0} y={4} textAnchor="middle" fontSize={5} fill="rgba(255,255,255,0.85)" fontWeight={600} style={{ pointerEvents: 'none' }}>
        {String(params.center_label || '').slice(0, 18)}
      </text>
      {/* Orbiting cluster nodes */}
      {items.map(i => {
        const ringIndex = rings === 2 ? (i % 2) : 0;
        const radius = rings === 2 ? (ringIndex === 0 ? 45 : 70) : 60;
        const ringItems = rings === 2 ? items.filter(x => (x % 2) === ringIndex).length : count;
        const ringPosition = rings === 2 ? Math.floor(i / 2) : i;
        const angle = (ringPosition / ringItems) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        return (
          <motion.g key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.5 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            <line x1={0} y1={0} x2={x} y2={y} stroke="hsla(var(--anchor-h), var(--anchor-s), 70%, 0.18)" strokeWidth={0.3} />
            <motion.circle
              cx={x} cy={y} r={4}
              fill="hsla(var(--anchor-h), var(--anchor-s), 75%, 0.9)"
              animate={reduce ? {} : { r: [4, 5, 4] }}
              transition={{ duration: 2.5 + (i % 3) * 0.3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
              style={{ filter: 'drop-shadow(0 0 6px var(--anchor-glow))' }}
            />
          </motion.g>
        );
      })}
    </svg>
  );
}

/* ─── Rank Climb — bar moving from start to current position ───── */
function RankClimbViz({ params }: { params: any }) {
  const start = Number(params.start_position || 10);
  const current = Number(params.current_position || 5);
  const target = Number(params.target_position || 1);
  /* Position 1 = best (top of page). Visualize as height: lower position = taller bar. */
  const maxPos = Math.max(start, target, current, 10);
  const heightFor = (pos: number) => Math.max(20, 100 - (pos / maxPos) * 80);
  const reduce = useReducedMotion();

  return (
    <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%' }}>
      {/* Baseline */}
      <line x1={20} y1={170} x2={180} y2={170} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />

      {[{ pos: start, label: 'started', x: 50 }, { pos: current, label: 'now', x: 100 }, { pos: target, label: 'target', x: 150 }].map((b, i) => {
        const h = heightFor(b.pos);
        const isCurrent = i === 1;
        const isTarget = i === 2;
        return (
          <motion.g key={i}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            style={{ transformOrigin: `${b.x}px 170px` }}
            transition={{ duration: 1.0, delay: 0.3 + i * 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <rect
              x={b.x - 12} y={170 - h} width={24} height={h}
              rx={2}
              fill={isCurrent ? 'var(--anchor)' : isTarget ? 'hsla(var(--anchor-h), var(--anchor-s), 75%, 0.35)' : 'rgba(255,255,255,0.15)'}
              style={isCurrent ? { filter: 'drop-shadow(0 0 16px var(--anchor-glow))' } : undefined}
            />
            <text x={b.x} y={186} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.55)" fontWeight={500}>
              {b.label}
            </text>
            <text x={b.x} y={170 - h - 6} textAnchor="middle" fontSize={9} fill={isCurrent ? 'var(--anchor)' : 'rgba(255,255,255,0.75)'} fontWeight={600}>
              #{b.pos.toFixed(0)}
            </text>
          </motion.g>
        );
      })}

      {/* Progress arc */}
      <motion.path
        d="M 50 80 Q 100 30 150 50"
        fill="none"
        stroke="hsla(var(--anchor-h), var(--anchor-s), 75%, 0.35)"
        strokeWidth={0.8}
        strokeDasharray="2,3"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, delay: 1.0, ease: 'easeInOut' }}
      />
    </svg>
  );
}

/* ─── Ascending Bars — staggered rise ─────────────────────────── */
function AscendingBarsViz({ params }: { params: any }) {
  const count = Math.max(3, Math.min(10, Number(params.bar_count || 5)));
  const peak = Math.max(0.3, Math.min(1.0, Number(params.peak || 0.85)));
  const heights = Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / count;
    return Math.max(0.2, t * peak);
  });

  return (
    <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%' }}>
      <line x1={20} y1={170} x2={180} y2={170} stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} />
      {heights.map((h, i) => {
        const w = 160 / count;
        const x = 20 + i * w + 4;
        const height = h * 130;
        return (
          <motion.rect
            key={i}
            x={x} width={w - 8} height={height} y={170 - height}
            rx={1.5}
            fill={i === count - 1 ? 'var(--anchor)' : 'hsla(var(--anchor-h), var(--anchor-s), 75%, 0.6)'}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            style={{
              transformOrigin: `${x + (w - 8) / 2}px 170px`,
              filter: i === count - 1 ? 'drop-shadow(0 0 14px var(--anchor-glow))' : undefined,
            }}
            transition={{ duration: 0.9, delay: 0.4 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
          />
        );
      })}
    </svg>
  );
}

/* ─── Flowing Lines — link graph nodes connected by flowing paths ─ */
function FlowingLinesViz({ params }: { params: any }) {
  const nodeCount = Math.max(4, Math.min(12, Number(params.node_count || 7)));
  const nodes = useMemo(() => {
    return Array.from({ length: nodeCount }, (_, i) => {
      const angle = (i / nodeCount) * Math.PI * 2;
      return {
        x: 100 + Math.cos(angle) * (40 + Math.random() * 30),
        y: 100 + Math.sin(angle) * (40 + Math.random() * 30),
      };
    });
  }, [nodeCount]);

  /* Create connections — each node links to 2 others */
  const links = useMemo(() => {
    const arr: Array<[number, number]> = [];
    for (let i = 0; i < nodeCount; i++) {
      arr.push([i, (i + 1) % nodeCount]);
      if (i % 2 === 0) arr.push([i, (i + 3) % nodeCount]);
    }
    return arr;
  }, [nodeCount]);

  return (
    <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%' }}>
      {links.map(([a, b], i) => {
        const n1 = nodes[a], n2 = nodes[b];
        return (
          <motion.line
            key={i}
            x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y}
            stroke="hsla(var(--anchor-h), var(--anchor-s), 75%, 0.3)"
            strokeWidth={0.6}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.3 + i * 0.05 }}
          />
        );
      })}
      {nodes.map((n, i) => (
        <motion.circle
          key={i}
          cx={n.x} cy={n.y} r={4}
          fill={i === 0 ? 'var(--anchor)' : 'hsla(var(--anchor-h), var(--anchor-s), 75%, 0.85)'}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 + i * 0.08 }}
          style={{ filter: i === 0 ? 'drop-shadow(0 0 8px var(--anchor-glow))' : undefined }}
        />
      ))}
    </svg>
  );
}

/* ─── Pulse Stack — layered cards pulsing ─────────────────────── */
function PulseStackViz({ params }: { params: any }) {
  const layers = Math.max(3, Math.min(6, Number(params.layers || 4)));
  const arr = Array.from({ length: layers }, (_, i) => i);

  return (
    <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%' }}>
      {arr.map(i => {
        const offset = i * 14;
        const size = 130 - i * 18;
        const opacity = 0.25 + (i / layers) * 0.55;
        return (
          <motion.rect
            key={i}
            x={(200 - size) / 2}
            y={(200 - size) / 2 + (layers - 1 - i) * 4 - 10 + offset / 2}
            width={size} height={size * 0.65}
            rx={8}
            fill="hsla(var(--anchor-h), var(--anchor-s), 75%, 0.05)"
            stroke={i === layers - 1 ? 'var(--anchor)' : 'hsla(var(--anchor-h), var(--anchor-s), 75%, 0.4)'}
            strokeWidth={0.8}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 + i * 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={i === layers - 1 ? { filter: 'drop-shadow(0 0 16px var(--anchor-glow))' } : undefined}
          />
        );
      })}
      <text x={100} y={104} textAnchor="middle" fontSize={9} fontWeight={600} fill="var(--anchor)">
        {String(params.peak_label || '').toUpperCase()}
      </text>
    </svg>
  );
}

/* ─── Particle Burst — celebratory radial spray ───────────────── */
function ParticleBurstViz({ params }: { params: any }) {
  const count = 18;
  const reduce = useReducedMotion();
  return (
    <svg viewBox="-100 -100 200 200" style={{ width: '100%', height: '100%' }}>
      <motion.circle
        cx={0} cy={0} r={14}
        fill="var(--anchor)"
        animate={reduce ? {} : { r: [14, 18, 14] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ filter: 'drop-shadow(0 0 18px var(--anchor-glow))' }}
      />
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const dist = 50 + (i % 3) * 18;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;
        return (
          <motion.circle
            key={i}
            cx={0} cy={0} r={1.6}
            fill="hsla(var(--anchor-h), var(--anchor-s), 80%, 0.8)"
            initial={{ opacity: 0 }}
            animate={{ cx: x, cy: y, opacity: [0, 1, 0.4] }}
            transition={{ duration: 1.4, delay: 0.2 + (i % 6) * 0.06, ease: [0.16, 1, 0.3, 1] }}
          />
        );
      })}
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════
   WINS TIMELINE — horizontal milestone cards
══════════════════════════════════════════════════════════════════════ */

function WinsTimeline({ wins }: { wins: ShowcaseDataClient['wins'] }) {
  return (
    <section className="scene-section" data-section="wins">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.7 }}
      >
        <div className="label-tiny mb-3">What's clicked</div>
        <h2 className="display-lg mb-6">Wins worth marking</h2>

        <div className="wins-track">
          {wins.map((w, i) => (
            <motion.div
              key={i}
              className="win-card"
              data-intensity={w.intensity}
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-5%' }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4, transition: { duration: 0.25 } }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <Award className="h-4 w-4" style={{ color: 'var(--anchor)' }} />
                <span className="label-tiny" style={{ opacity: 0.6 }}>{w.when_relative}</span>
              </div>
              <div className="display-sm mb-2" style={{ fontWeight: 600 }}>{w.title}</div>
              {w.metric_text && (
                <div style={{ fontSize: '0.875rem', color: 'rgba(245,247,255,0.65)', lineHeight: 1.5 }}>
                  {w.metric_text}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   FORECAST BLOCK
══════════════════════════════════════════════════════════════════════ */

function ForecastBlock({ forecast }: { forecast: NonNullable<ShowcaseDataClient['forecast']> }) {
  const reduce = useReducedMotion();

  return (
    <section className="scene-section" data-section="forecast">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.8 }}
      >
        <div className="label-tiny mb-3">Where this points</div>
        <h2 className="display-lg mb-3">{forecast.metric_label}</h2>
        <div className="hero-number" style={{ fontSize: 'clamp(3.5rem, 9vw, 7rem)' }}>
          <AnimatedNumber value={forecast.projected_value} duration={reduce ? 0 : 1.6} />
        </div>
        <div className="display-sm mt-4" style={{ color: 'rgba(245,247,255,0.65)', fontWeight: 400 }}>
          {forecast.projected_horizon}
        </div>
        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <div className="delta-badge">
            <Target className="h-3.5 w-3.5" />
            {forecast.confidence} confidence
          </div>
        </div>
        <p className="prose-soft mt-5" style={{ maxWidth: '50ch' }}>
          {forecast.assumption}. Honest forecast — adjusts as new signal arrives.
        </p>

        {Array.isArray(forecast.curve_points) && forecast.curve_points.length > 1 && (
          <ForecastSparkline points={forecast.curve_points} />
        )}
      </motion.div>
    </section>
  );
}

function ForecastSparkline({ points }: { points: number[] }) {
  const max = Math.max(...points, 1);
  const w = 600, h = 140;
  const stepX = w / Math.max(1, points.length - 1);
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${h - (p / max) * (h - 10)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxWidth: 600, marginTop: '2rem' }}>
      <motion.path
        d={pathD}
        stroke="var(--anchor)"
        strokeWidth={2}
        fill="none"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
        style={{ filter: 'drop-shadow(0 0 8px var(--anchor-glow))' }}
      />
      {points.map((p, i) => (
        <motion.circle
          key={i}
          cx={i * stepX} cy={h - (p / max) * (h - 10)}
          r={3}
          fill="var(--anchor)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.2 + i * 0.05 }}
        />
      ))}
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════
   NEXT CHAPTER
══════════════════════════════════════════════════════════════════════ */

function NextChapter({ items }: { items: ShowcaseDataClient['next_chapter'] }) {
  return (
    <section className="scene-section" data-section="next">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.7 }}
      >
        <div className="label-tiny mb-3">What's next</div>
        <h2 className="display-lg mb-8">The chapter that's writing itself</h2>

        <div className="chapter-grid">
          {items.map((item, i) => (
            <motion.div
              key={i}
              className="chapter-card"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-5%' }}
              transition={{ duration: 0.6, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <Compass className="h-5 w-5" style={{ color: 'var(--anchor)' }} />
                <span className="label-tiny" style={{ opacity: 0.6 }}>{item.timing}</span>
              </div>
              <div className="display-sm mb-2" style={{ fontWeight: 600 }}>{item.title}</div>
              <div style={{ fontSize: '0.875rem', color: 'rgba(245,247,255,0.65)', lineHeight: 1.5 }}>
                {item.impact_estimate}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TRANSPARENCY CREDITS — film credits closing
══════════════════════════════════════════════════════════════════════ */

function TransparencyCredits({ transparency, meta }: {
  transparency: ShowcaseDataClient['transparency'];
  meta: ShowcaseDataClient['meta'];
}) {
  return (
    <section className="credits" data-section="credits">
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.9 }}
      >
        <div className="label-tiny mb-3">Built on</div>
        <h2 className="display-md mb-6">Real signals, named sources</h2>

        <div className="flex flex-wrap gap-2 mb-8">
          {transparency.data_sources.map((s, i) => (
            <div key={i} className="source-pill">
              <span className="source-dot" data-status={s.status} />
              <Database className="h-3 w-3" style={{ opacity: 0.6 }} />
              <span style={{ fontWeight: 500 }}>{s.name}</span>
              {s.last_synced && (
                <span style={{ opacity: 0.55 }}>
                  · {new Date(s.last_synced).toISOString().slice(0, 10)}
                </span>
              )}
              {!s.last_synced && (
                <span style={{ opacity: 0.55 }}>· not connected</span>
              )}
            </div>
          ))}
        </div>

        {transparency.honest_gaps.length > 0 && (
          <div className="mb-8">
            <div className="label-tiny mb-2">Honest gaps</div>
            <ul className="proof-list">
              {transparency.honest_gaps.map((g, i) => (
                <li key={i}>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: 'hsl(42 92% 60%)' }} />
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-6 text-sm" style={{ color: 'rgba(245,247,255,0.55)' }}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {transparency.audit_run_count} pillar audit{transparency.audit_run_count === 1 ? '' : 's'} captured
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />
            {transparency.audit_period}
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Last refreshed {new Date(meta.last_refreshed_at).toISOString().slice(11, 16)} UTC
          </div>
        </div>

        <div className="mt-12 prose-soft" style={{ maxWidth: '50ch', color: 'rgba(245,247,255,0.45)' }}>
          Every number above traces back to an authentic source. Where signal is missing,
          the gap is named — never papered over.
        </div>
      </motion.div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ANIMATED NUMBER — count-up with monospace tabular figures
══════════════════════════════════════════════════════════════════════ */

function AnimatedNumber({ value, duration = 1.6 }: { value: number; duration?: number }) {
  const reduce = useReducedMotion();
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) { setDisplay(value); return; }
    const controls = animate(motionVal, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(latest),
    });
    return controls.stop;
  }, [value, duration, reduce]);

  return <>{formatNumber(display, value)}</>;
}

function formatNumber(displayed: number, target: number): string {
  /* If target is a whole number, render whole numbers throughout the animation */
  if (Number.isInteger(target)) {
    return Math.round(displayed).toLocaleString();
  }
  return displayed.toFixed(1);
}

/* ════════════════════════════════════════════════════════════════════
   LOADING + ERROR STATES
══════════════════════════════════════════════════════════════════════ */

function ShowcaseLoading() {
  return (
    <div className="showcase-root" style={{
      ['--anchor-h' as any]: 188, ['--anchor-s' as any]: '85%', ['--anchor-l' as any]: '58%',
      ['--bg-deep' as any]: '4 6 18',
    } as React.CSSProperties}>
      <ShowcaseStyles />
      <CinematicBackground />
      <div className="showcase-stage flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
          className="text-center"
        >
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: 16, height: 16, borderRadius: 8,
              background: 'var(--anchor)',
              boxShadow: '0 0 24px var(--anchor-glow)',
              margin: '0 auto 1.5rem',
            }}
          />
          <div className="label-tiny">Assembling the story…</div>
        </motion.div>
      </div>
    </div>
  );
}

function ShowcaseError({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="showcase-root" style={{
      ['--anchor-h' as any]: 320, ['--anchor-s' as any]: '78%', ['--anchor-l' as any]: '60%',
      ['--bg-deep' as any]: '4 6 18',
    } as React.CSSProperties}>
      <ShowcaseStyles />
      <div className="showcase-stage flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="text-center max-w-md">
          <AlertCircle className="h-10 w-10 mx-auto mb-4" style={{ color: 'var(--anchor)' }} />
          <h2 className="display-md mb-3">Couldn't assemble the showcase</h2>
          <p className="prose-soft mb-6">{message}</p>
          <button
            onClick={onBack}
            className="source-pill"
            style={{ cursor: 'pointer' }}
          >
            ← Return
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   LABEL HELPERS
══════════════════════════════════════════════════════════════════════ */

function pillarLabel(pillar: string): string {
  switch (pillar) {
    case 'cluster_map':       return 'Topic map';
    case 'monitoring':        return 'Performance';
    case 'off_page':          return 'Authority';
    case 'internal_linking':  return 'Link graph';
    case 'technical_audit':   return 'Technical';
    case 'foundation':        return 'Foundation';
    case 'campaign':          return 'Campaign';
    default:                  return pillar.replace('_', ' ');
  }
}

function sceneMoodLabel(mood: ShowcaseSceneMoodClient): string {
  switch (mood) {
    case 'win':        return 'Win in motion';
    case 'progress':   return 'In progress';
    case 'pivot':      return 'Pivot point';
    case 'foundation': return 'Foundation';
  }
}
