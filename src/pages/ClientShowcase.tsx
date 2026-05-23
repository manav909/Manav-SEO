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

      <main className="showcase-stage stage-3d">
        <OpeningTitle meta={data.meta} />
        <HeroMetric hero={data.hero} mood={data.meta.mood_dominant} />
        {data.scenes.map((scene, i) => (
          <Scene key={scene.id} scene={scene} index={i} />
        ))}

        {/* Phase 22.1 — Depth sections (real digital-marketing report substance) */}
        {data.visibility_pulse && <VisibilityPulse pulse={data.visibility_pulse} />}
        {data.keyword_movers && <KeywordMovers movers={data.keyword_movers} />}
        {data.intent_distribution && <IntentDistribution intent={data.intent_distribution} />}
        {data.content_health && <ContentHealth health={data.content_health} />}

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
      /* ════════════════════════════════════════════════════════════════
         PHASE 22.2 — 3D / VOLUMETRIC / CINEMATIC EFFECT LAYER
         CSS-only 3D using perspective + transform-style: preserve-3d.
         No external libraries. GPU-accelerated. Reduced-motion respected.
      ════════════════════════════════════════════════════════════════ */

      /* Page-wide perspective container so children can use translateZ */
      .stage-3d {
        perspective: 1400px;
        perspective-origin: 50% 45%;
        transform-style: preserve-3d;
      }

      /* Volumetric background — multi-layer depth + light cone */
      .vol-bg {
        position: fixed; inset: 0; z-index: 1; pointer-events: none;
        overflow: hidden;
        perspective: 1200px;
      }
      .vol-layer {
        position: absolute; inset: 0;
        transform-style: preserve-3d;
        will-change: transform;
      }
      .vol-light-cone {
        position: absolute; inset: -30%;
        background:
          conic-gradient(from 210deg at 50% 30%,
            transparent 0deg,
            hsla(var(--anchor-h), var(--anchor-s), 65%, 0.06) 50deg,
            hsla(var(--anchor-h), var(--anchor-s), 80%, 0.16) 70deg,
            hsla(var(--anchor-h), var(--anchor-s), 65%, 0.06) 90deg,
            transparent 140deg);
        animation: coneSweep 22s linear infinite;
        filter: blur(60px);
        opacity: 0.85;
      }
      @keyframes coneSweep {
        0%   { transform: rotate(0deg) scale(1); }
        50%  { transform: rotate(20deg) scale(1.08); }
        100% { transform: rotate(0deg) scale(1); }
      }
      .vol-haze {
        position: absolute; inset: -10%;
        background:
          radial-gradient(ellipse 70% 50% at 20% 30%, hsla(var(--anchor-h), var(--anchor-s), 70%, 0.18), transparent 65%),
          radial-gradient(ellipse 50% 70% at 80% 70%, hsla(var(--anchor-h), var(--anchor-s), 60%, 0.13), transparent 65%);
        filter: blur(40px);
        animation: hazeDrift 26s ease-in-out infinite alternate;
      }
      @keyframes hazeDrift {
        0%   { transform: translate(0,0) scale(1); }
        100% { transform: translate(-3%, 2%) scale(1.07); }
      }
      .vol-vignette {
        position: absolute; inset: 0;
        background:
          radial-gradient(ellipse at center, transparent 30%, rgb(var(--bg-deep)) 110%);
        opacity: 0.65;
      }
      .vol-grid {
        position: absolute; inset: 0;
        background-image:
          linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
        background-size: 80px 80px;
        transform: perspective(800px) rotateX(60deg) translateY(20%) translateZ(-200px);
        transform-origin: 50% 100%;
        mask-image: linear-gradient(180deg, transparent 0%, black 30%, black 70%, transparent 100%);
        opacity: 0.5;
      }

      /* 3D Hero number — depth via stacked text shadows simulating extrusion */
      .hero-3d {
        position: relative;
        transform-style: preserve-3d;
        will-change: transform;
      }
      .hero-3d-text {
        font-size: clamp(5rem, 16vw, 14rem);
        line-height: 0.9;
        letter-spacing: -0.06em;
        font-weight: 200;
        color: var(--anchor);
        font-feature-settings: 'tnum' 1;
        text-shadow:
          0 1px 0 hsla(var(--anchor-h), var(--anchor-s), 30%, 0.5),
          0 2px 0 hsla(var(--anchor-h), var(--anchor-s), 28%, 0.4),
          0 3px 0 hsla(var(--anchor-h), var(--anchor-s), 26%, 0.3),
          0 4px 0 hsla(var(--anchor-h), var(--anchor-s), 24%, 0.25),
          0 5px 0 hsla(var(--anchor-h), var(--anchor-s), 22%, 0.2),
          0 6px 0 hsla(var(--anchor-h), var(--anchor-s), 20%, 0.15),
          0 8px 16px hsla(var(--anchor-h), var(--anchor-s), 15%, 0.5),
          0 0 60px var(--anchor-glow),
          0 0 120px hsla(var(--anchor-h), var(--anchor-s), 60%, 0.25);
        transform: translateZ(20px);
      }

      /* 3D card with mouse-tracked tilt */
      .card-3d {
        transform-style: preserve-3d;
        transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s ease, border-color 0.5s ease;
        will-change: transform;
        perspective: 800px;
      }
      .card-3d:hover {
        transform: rotateY(-3deg) rotateX(2.5deg) translateZ(12px) scale(1.015);
        box-shadow:
          0 24px 60px rgba(0,0,0,0.45),
          0 0 40px var(--anchor-glow),
          inset 0 1px 0 hsla(var(--anchor-h), 90%, 85%, 0.18);
        border-color: hsla(var(--anchor-h), 90%, 70%, 0.55) !important;
      }
      .card-3d-inner {
        transform: translateZ(20px);
      }
      /* Sheen layer overlay for cards */
      .card-3d::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(135deg, hsla(var(--anchor-h), 90%, 75%, 0.08) 0%, transparent 40%);
        opacity: 0;
        transition: opacity 0.5s ease;
        pointer-events: none;
      }
      .card-3d:hover::before {
        opacity: 1;
      }

      /* Specular highlight on chart bars / 3D objects */
      .bar-3d-stage {
        perspective: 800px;
        transform-style: preserve-3d;
      }
      .bar-specular {
        background: linear-gradient(180deg,
          hsla(var(--anchor-h), 90%, 85%, 0.5) 0%,
          hsla(var(--anchor-h), 85%, 70%, 0.35) 8%,
          transparent 35%);
        pointer-events: none;
      }

      /* Orbital 3D container */
      .orbital-3d {
        position: relative;
        width: 100%; height: 100%;
        transform-style: preserve-3d;
        perspective: 900px;
      }
      .orbital-stage {
        position: absolute; inset: 0;
        transform-style: preserve-3d;
        animation: orbitalSpin 32s linear infinite;
      }
      @keyframes orbitalSpin {
        0%   { transform: rotateY(0deg) rotateX(15deg); }
        100% { transform: rotateY(360deg) rotateX(15deg); }
      }
      .orbital-node {
        position: absolute;
        top: 50%; left: 50%;
        transform-style: preserve-3d;
      }
      .orbital-dot {
        position: absolute;
        top: 50%; left: 50%;
        width: 14px; height: 14px;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%,
          hsla(var(--anchor-h), 90%, 88%, 1) 0%,
          hsla(var(--anchor-h), 80%, 65%, 1) 50%,
          hsla(var(--anchor-h), 70%, 40%, 0.95) 100%);
        box-shadow:
          0 0 12px var(--anchor-glow),
          0 0 24px hsla(var(--anchor-h), 80%, 60%, 0.4),
          inset 0 0 6px hsla(var(--anchor-h), 90%, 90%, 0.6);
        transform: translate(-50%, -50%);
      }
      .orbital-core {
        position: absolute;
        top: 50%; left: 50%;
        width: 56px; height: 56px;
        margin: -28px 0 0 -28px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 30%,
          hsla(var(--anchor-h), 95%, 92%, 1) 0%,
          var(--anchor) 35%,
          hsla(var(--anchor-h), 70%, 30%, 1) 100%);
        box-shadow:
          0 0 30px var(--anchor-glow),
          0 0 60px hsla(var(--anchor-h), 80%, 60%, 0.5),
          0 0 100px hsla(var(--anchor-h), 80%, 60%, 0.25),
          inset 0 0 20px hsla(var(--anchor-h), 90%, 85%, 0.45);
        animation: corePulse 3s ease-in-out infinite;
      }
      @keyframes corePulse {
        0%, 100% { transform: scale(1); }
        50%      { transform: scale(1.08); }
      }
      .orbital-ring {
        position: absolute;
        top: 50%; left: 50%;
        border: 1px dashed hsla(var(--anchor-h), var(--anchor-s), 65%, 0.18);
        border-radius: 50%;
        transform-style: preserve-3d;
      }

      /* Traveling particle along path */
      .traveler-particle {
        fill: var(--anchor);
        filter: drop-shadow(0 0 6px var(--anchor-glow));
      }

      /* Bloom layer for emphasis on critical elements */
      .bloom {
        position: relative;
      }
      .bloom::after {
        content: '';
        position: absolute; inset: -20%;
        background: radial-gradient(circle at center, var(--anchor-glow), transparent 60%);
        filter: blur(20px);
        pointer-events: none;
        z-index: -1;
      }

      /* Glass surface — for cards that should feel like they're floating */
      .surface-glass {
        background:
          linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01)),
          rgba(0,0,0,0.15);
        border: 0.5px solid rgba(255,255,255,0.12);
        backdrop-filter: blur(14px) saturate(140%);
        box-shadow:
          0 8px 32px rgba(0,0,0,0.3),
          inset 0 1px 0 rgba(255,255,255,0.08),
          inset 0 -1px 0 rgba(0,0,0,0.2);
      }

      /* Tilted donut — gives intent chart depth */
      .donut-3d {
        transform: rotateX(28deg) rotateZ(-2deg);
        transform-origin: center center;
        filter: drop-shadow(0 12px 24px rgba(0,0,0,0.4));
      }

      /* Reduced motion: kill all infinite 3D rotations */
      @media (prefers-reduced-motion: reduce) {
        .vol-light-cone, .vol-haze, .orbital-stage, .orbital-core { animation: none !important; }
        .stage-3d, .hero-3d, .card-3d { transform: none !important; transition: none !important; }
      }


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

  /* Mouse parallax for atmosphere — drives subtle drift on layer transforms */
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const driftX = useTransform(mouseX, [-1, 1], [-12, 12]);
  const driftY = useTransform(mouseY, [-1, 1], [-8, 8]);
  const driftXSlow = useTransform(mouseX, [-1, 1], [-5, 5]);
  const driftYSlow = useTransform(mouseY, [-1, 1], [-3, 3]);

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth)  * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      mouseX.set(x);
      mouseY.set(y);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [reduce, mouseX, mouseY]);

  const particles = useMemo(() => {
    const arr: Array<{ x: number; y: number; size: number; delay: number; duration: number; depth: number }> = [];
    for (let i = 0; i < 32; i++) {
      arr.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 1.5 + Math.random() * 4,
        delay: Math.random() * 24,
        duration: 22 + Math.random() * 26,
        depth: Math.random(), // 0 = far, 1 = near (drives parallax + size)
      });
    }
    return arr;
  }, []);

  return (
    <div className="vol-bg" aria-hidden>
      {/* Subtle 3D floor grid — establishes depth in the lower half */}
      <div className="vol-grid" />

      {/* Drifting volumetric haze (back) */}
      <motion.div className="vol-layer" style={{ x: driftXSlow, y: driftYSlow }}>
        <div className="vol-haze" />
      </motion.div>

      {/* Rotating cone of anchor-colored light (mid) */}
      <motion.div className="vol-layer" style={{ x: driftX, y: driftY }}>
        <div className="vol-light-cone" />
      </motion.div>

      {/* Floating depth particles (foreground) */}
      <motion.div className="vol-layer" style={{ x: useTransform(mouseX, [-1, 1], [-20, 20]) }}>
        {!reduce && particles.map((p, i) => (
          <motion.div
            key={i}
            className="showcase-particle"
            style={{
              width: p.size * (0.6 + p.depth * 0.7),
              height: p.size * (0.6 + p.depth * 0.7),
              left: `${p.x}%`,
              top: `${p.y}%`,
              opacity: 0.3 + p.depth * 0.5,
              filter: `blur(${(1 - p.depth) * 2}px)`,
            }}
            animate={{
              y: [0, -50 - p.depth * 30, 0],
              opacity: [0.2 + p.depth * 0.3, 0.5 + p.depth * 0.5, 0.2 + p.depth * 0.3],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </motion.div>

      {/* Final vignette darkens the edges — keeps focus center */}
      <div className="vol-vignette" />
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

  /* Mouse-tracked 3D tilt on the hero number */
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateY = useTransform(mx, [-1, 1], [-7, 7]);
  const rotateX = useTransform(my, [-1, 1], [4, -4]);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: MouseEvent) => {
      const el = heroRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const x = (e.clientX - cx) / (r.width / 2);
      const y = (e.clientY - cy) / (r.height / 2);
      mx.set(Math.max(-1, Math.min(1, x)));
      my.set(Math.max(-1, Math.min(1, y)));
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [reduce, mx, my]);

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
        className="stage-3d"
      >
        <div className="label-tiny mb-6">{hero.headline_label}</div>
        <motion.div
          ref={heroRef}
          className="hero-3d bloom"
          style={{ rotateY, rotateX }}
          transition={{ type: 'spring', stiffness: 60, damping: 18 }}
        >
          <div className="hero-3d-text">
            <AnimatedNumber value={hero.headline_value} duration={reduce ? 0 : 2.0} />
          </div>
        </motion.div>
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

/* ─── Orbital — true 3D CSS perspective, dots at varying depth ───── */
function OrbitalViz({ params }: { params: any }) {
  const count = Math.max(3, Math.min(12, Number(params.cluster_count || 6)));
  const rings = Math.max(1, Math.min(2, Number(params.ring_count || 1)));
  const items = Array.from({ length: count }, (_, i) => i);
  const reduce = useReducedMotion();

  return (
    <div className="orbital-3d">
      <div
        className="orbital-stage"
        style={reduce ? { animation: 'none', transform: 'rotateY(20deg) rotateX(15deg)' } : undefined}
      >
        {/* Glowing core */}
        <div className="orbital-core" />

        {/* Ring tracks — tilted in 3D */}
        <div className="orbital-ring" style={{
          width: 280, height: 280,
          margin: '-140px 0 0 -140px',
          transform: 'rotateX(70deg)',
        }} />
        {rings === 2 && (
          <div className="orbital-ring" style={{
            width: 180, height: 180,
            margin: '-90px 0 0 -90px',
            transform: 'rotateX(70deg)',
          }} />
        )}

        {/* Cluster nodes — positioned via translate3d, each at its own Z */}
        {items.map(i => {
          const ringIndex = rings === 2 ? (i % 2) : 0;
          const radius = rings === 2 ? (ringIndex === 0 ? 90 : 140) : 130;
          const ringItems = rings === 2 ? items.filter(x => (x % 2) === ringIndex).length : count;
          const ringPosition = rings === 2 ? Math.floor(i / 2) : i;
          const angle = (ringPosition / ringItems) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          return (
            <motion.div
              key={i}
              className="orbital-node"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.4 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              style={{
                transform: `translate3d(${x}px, 0px, ${z}px)`,
              }}
            >
              <div className="orbital-dot" />
            </motion.div>
          );
        })}
      </div>

      {/* Centered label — sits ABOVE the rotation, doesn't spin */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: 'rgba(255,255,255,0.95)',
          textShadow: '0 0 12px var(--anchor-glow)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          {String(params.center_label || '').slice(0, 22)}
        </div>
      </div>
    </div>
  );
}

/* ─── Rank Climb — bar moving from start to current position ───── */
function RankClimbViz({ params }: { params: any }) {
  const start = Number(params.start_position || 10);
  const current = Number(params.current_position || 5);
  const target = Number(params.target_position || 1);
  /* Position 1 = best (top of page). Visualize as height: lower position = taller bar. */
  const maxPos = Math.max(start, target, current, 10);
  const reduce = useReducedMotion();

  const bars = [
    { label: 'Started', pos: start,   state: 'past' as const,    delay: 0.0, x: 110 },
    { label: 'Now',     pos: current, state: 'current' as const, delay: 0.3, x: 260 },
    { label: 'Target',  pos: target,  state: 'future' as const,  delay: 0.6, x: 410 },
  ];
  const W = 560, H = 320;
  const barWidth = 70;
  const baseY = H - 60;

  return (
    <div className="bar-3d-stage" style={{ width: '100%', height: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          {bars.map((b, i) => (
            <linearGradient key={`grad-${i}`} id={`bar-grad-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="hsla(var(--anchor-h), 95%, 90%, 1)" />
              <stop offset="12%"  stopColor={b.state === 'past' ? 'rgba(255,255,255,0.55)' : 'hsla(var(--anchor-h), 90%, 78%, 1)'} />
              <stop offset="100%" stopColor={b.state === 'past' ? 'rgba(255,255,255,0.18)' : 'hsla(var(--anchor-h), 70%, 35%, 0.92)'} />
            </linearGradient>
          ))}
          <linearGradient id="rc-floor-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
          <linearGradient id="rc-sheen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0)" />
            <stop offset="48%"  stopColor="rgba(255,255,255,0)" />
            <stop offset="50%"  stopColor="rgba(255,255,255,0.4)" />
            <stop offset="52%"  stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <filter id="rc-bloom">
            <feGaussianBlur stdDeviation="6" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Ground reflection / floor shadow band */}
        <rect x={0} y={baseY} width={W} height={H - baseY} fill="url(#rc-floor-grad)" opacity={0.6} />
        <line x1={40} y1={baseY} x2={W - 40} y2={baseY} stroke="rgba(255,255,255,0.18)" strokeWidth={0.5} />

        {bars.map((b, i) => {
          const h = ((maxPos - b.pos) / maxPos) * (baseY - 30);
          const y = baseY - h;
          const depth = 18;
          const x = b.x - barWidth / 2;

          return (
            <g key={i}>
              {/* Ground shadow ellipse */}
              <motion.ellipse
                cx={x + barWidth / 2 + depth / 2} cy={baseY + 5}
                rx={barWidth / 2 + 8} ry={4}
                fill="rgba(0,0,0,0.45)"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: b.delay + 0.4 }}
              />

              <motion.g
                initial={{ y: 80, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true, margin: '-15%' }}
                transition={{ type: 'spring', stiffness: 70, damping: 18, delay: b.delay }}
              >
                {/* Right face — isometric side */}
                <path
                  d={`M ${x + barWidth} ${y} L ${x + barWidth + depth} ${y - depth * 0.5} L ${x + barWidth + depth} ${baseY - depth * 0.5} L ${x + barWidth} ${baseY} Z`}
                  fill={b.state === 'past' ? 'rgba(255,255,255,0.16)' : 'hsla(var(--anchor-h), 65%, 25%, 0.95)'}
                  stroke="rgba(0,0,0,0.25)"
                  strokeWidth={0.3}
                />
                {/* Top face — isometric top */}
                <path
                  d={`M ${x} ${y} L ${x + depth} ${y - depth * 0.5} L ${x + barWidth + depth} ${y - depth * 0.5} L ${x + barWidth} ${y} Z`}
                  fill={b.state === 'past' ? 'rgba(255,255,255,0.55)' : 'hsla(var(--anchor-h), 95%, 85%, 0.98)'}
                  stroke="hsla(var(--anchor-h), 95%, 92%, 0.6)"
                  strokeWidth={0.4}
                />
                {/* Front face — gradient + bloom on current */}
                <rect
                  x={x} y={y}
                  width={barWidth}
                  height={h}
                  fill={`url(#bar-grad-${i})`}
                  filter={b.state === 'current' ? 'url(#rc-bloom)' : undefined}
                />
                {/* Vertical edges — left bright, right dark */}
                <line x1={x} y1={y} x2={x} y2={baseY} stroke="rgba(255,255,255,0.42)" strokeWidth={1} />
                <line x1={x + barWidth} y1={y} x2={x + barWidth} y2={baseY} stroke="rgba(0,0,0,0.35)" strokeWidth={1} />

                {/* Specular sweep on current bar */}
                {b.state === 'current' && !reduce && (
                  <motion.rect
                    x={x} y={y}
                    width={barWidth}
                    height={h}
                    fill="url(#rc-sheen)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.8, 0] }}
                    transition={{ duration: 3.5, repeat: Infinity, delay: 1.4, ease: 'easeInOut' }}
                  />
                )}

                {/* Crown bloom on current bar tip */}
                {b.state === 'current' && !reduce && (
                  <motion.circle
                    cx={x + barWidth / 2}
                    cy={y - 4}
                    r={10}
                    fill="hsla(var(--anchor-h), 95%, 88%, 0.9)"
                    filter="url(#rc-bloom)"
                    animate={{ opacity: [0.5, 1, 0.5], r: [10, 14, 10] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}

                {/* Position number floating above */}
                <text
                  x={x + barWidth / 2 + depth / 2}
                  y={y - depth - 12}
                  textAnchor="middle"
                  fontSize={22}
                  fontWeight={300}
                  fill="rgba(245,247,255,0.92)"
                  style={{ fontFeatureSettings: '"tnum" 1' }}
                >
                  #{b.pos.toFixed(b.pos < 10 ? 1 : 0)}
                </text>
                {/* Label below baseline */}
                <text
                  x={x + barWidth / 2}
                  y={baseY + 28}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill={b.state === 'current' ? 'var(--anchor)' : 'rgba(245,247,255,0.65)'}
                  style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                  {b.label}
                </text>
              </motion.g>
            </g>
          );
        })}

        {/* Curved trajectory arc connecting bar tops */}
        {!reduce && (
          <motion.path
            d={`M ${bars[0].x} ${baseY - ((maxPos - start) / maxPos) * (baseY - 30) - 32}
                C ${(bars[0].x + bars[2].x) / 2} ${baseY - ((maxPos - current) / maxPos) * (baseY - 30) - 90},
                  ${(bars[0].x + bars[2].x) / 2} ${baseY - ((maxPos - target) / maxPos) * (baseY - 30) - 90},
                  ${bars[2].x} ${baseY - ((maxPos - target) / maxPos) * (baseY - 30) - 32}`}
            fill="none"
            stroke="hsla(var(--anchor-h), 90%, 75%, 0.45)"
            strokeWidth={1.5}
            strokeDasharray="3,4"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.8, delay: 1.2 }}
          />
        )}
      </svg>
    </div>
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
  const reduce = useReducedMotion();
  const W = 460, H = 280;
  const baseY = H - 50;
  const depth = 14;
  const barW = (W - 80) / count - 6;

  return (
    <div className="bar-3d-stage" style={{ width: '100%', height: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id="ab-front-active" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"  stopColor="hsla(var(--anchor-h), 95%, 88%, 1)" />
            <stop offset="50%" stopColor="hsla(var(--anchor-h), 85%, 65%, 1)" />
            <stop offset="100%" stopColor="hsla(var(--anchor-h), 70%, 35%, 0.92)" />
          </linearGradient>
          <linearGradient id="ab-front-rising" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"  stopColor="hsla(var(--anchor-h), 85%, 78%, 0.95)" />
            <stop offset="100%" stopColor="hsla(var(--anchor-h), 65%, 30%, 0.7)" />
          </linearGradient>
          <linearGradient id="ab-floor" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
          <filter id="ab-bloom">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <rect x={0} y={baseY} width={W} height={H - baseY} fill="url(#ab-floor)" opacity={0.5} />
        <line x1={20} y1={baseY} x2={W - 20} y2={baseY} stroke="rgba(255,255,255,0.18)" strokeWidth={0.5} />

        {heights.map((h, i) => {
          const x = 40 + i * ((W - 80) / count) + 3;
          const height = h * (baseY - 30);
          const y = baseY - height;
          const isPeak = i === count - 1;

          return (
            <motion.g
              key={i}
              initial={{ y: 60, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, margin: '-15%' }}
              transition={{ type: 'spring', stiffness: 80, damping: 18, delay: 0.15 + i * 0.1 }}
            >
              {/* Ground shadow */}
              <ellipse cx={x + barW / 2 + depth / 2} cy={baseY + 4} rx={barW / 2 + 4} ry={3}
                fill="rgba(0,0,0,0.4)" />

              {/* Right face */}
              <path
                d={`M ${x + barW} ${y} L ${x + barW + depth} ${y - depth * 0.45} L ${x + barW + depth} ${baseY - depth * 0.45} L ${x + barW} ${baseY} Z`}
                fill="hsla(var(--anchor-h), 65%, 22%, 0.95)"
                stroke="rgba(0,0,0,0.25)" strokeWidth={0.3}
              />
              {/* Top face */}
              <path
                d={`M ${x} ${y} L ${x + depth} ${y - depth * 0.45} L ${x + barW + depth} ${y - depth * 0.45} L ${x + barW} ${y} Z`}
                fill={isPeak ? 'hsla(var(--anchor-h), 95%, 88%, 1)' : 'hsla(var(--anchor-h), 90%, 72%, 0.9)'}
                stroke="hsla(var(--anchor-h), 95%, 90%, 0.6)" strokeWidth={0.4}
              />
              {/* Front face */}
              <rect
                x={x} y={y} width={barW} height={height}
                fill={isPeak ? 'url(#ab-front-active)' : 'url(#ab-front-rising)'}
                filter={isPeak ? 'url(#ab-bloom)' : undefined}
              />
              {/* Front edges */}
              <line x1={x} y1={y} x2={x} y2={baseY} stroke="rgba(255,255,255,0.4)" strokeWidth={0.8} />
              <line x1={x + barW} y1={y} x2={x + barW} y2={baseY} stroke="rgba(0,0,0,0.3)" strokeWidth={0.8} />

              {/* Crown bloom on peak */}
              {isPeak && !reduce && (
                <motion.circle
                  cx={x + barW / 2} cy={y - 4} r={8}
                  fill="hsla(var(--anchor-h), 95%, 88%, 0.9)"
                  filter="url(#ab-bloom)"
                  animate={{ opacity: [0.5, 1, 0.5], r: [8, 12, 8] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─── Flowing Lines — 3D node network with traveling data particles ── */
function FlowingLinesViz({ params }: { params: any }) {
  const nodeCount = Math.max(4, Math.min(12, Number(params.node_count || 7)));
  const reduce = useReducedMotion();

  const nodes = useMemo(() => {
    return Array.from({ length: nodeCount }, (_, i) => {
      const angle = (i / nodeCount) * Math.PI * 2;
      const radius = 60 + (i % 3) * 12;
      const depth = (i % 4) * 0.2;
      return {
        x:    100 + Math.cos(angle) * radius,
        y:    100 + Math.sin(angle) * radius * 0.85,
        size: 4 + depth * 4, // depth simulated through size
        depth,
      };
    });
  }, [nodeCount]);

  const links = useMemo(() => {
    const arr: Array<[number, number]> = [];
    for (let i = 0; i < nodeCount; i++) {
      arr.push([i, (i + 1) % nodeCount]);
      if (i % 2 === 0) arr.push([i, (i + 3) % nodeCount]);
    }
    return arr;
  }, [nodeCount]);

  return (
    <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
      <defs>
        <radialGradient id="fl-node-active" cx="35%" cy="30%">
          <stop offset="0%"  stopColor="hsla(var(--anchor-h), 95%, 92%, 1)" />
          <stop offset="55%" stopColor="hsla(var(--anchor-h), 90%, 70%, 1)" />
          <stop offset="100%" stopColor="hsla(var(--anchor-h), 70%, 30%, 0.9)" />
        </radialGradient>
        <radialGradient id="fl-node-mid" cx="35%" cy="30%">
          <stop offset="0%"  stopColor="hsla(var(--anchor-h), 90%, 85%, 1)" />
          <stop offset="100%" stopColor="hsla(var(--anchor-h), 70%, 40%, 0.8)" />
        </radialGradient>
        <filter id="fl-glow"><feGaussianBlur stdDeviation="2" /></filter>
      </defs>

      {/* Link paths */}
      {links.map(([a, b], i) => {
        const n1 = nodes[a], n2 = nodes[b];
        return (
          <g key={i}>
            <motion.line
              x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y}
              stroke="hsla(var(--anchor-h), 80%, 65%, 0.28)"
              strokeWidth={0.7}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.3 + i * 0.05 }}
            />
            {/* Traveling data particle */}
            {!reduce && i % 2 === 0 && (
              <motion.circle
                r={1.6}
                className="traveler-particle"
                initial={{ opacity: 0 }}
                animate={{
                  cx: [n1.x, n2.x, n1.x],
                  cy: [n1.y, n2.y, n1.y],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 4 + (i % 3) * 0.8,
                  repeat: Infinity,
                  delay: 1.5 + (i % 5) * 0.4,
                  ease: 'linear',
                }}
              />
            )}
          </g>
        );
      })}

      {/* Nodes — sized by depth, brightest in foreground */}
      {nodes.map((n, i) => (
        <motion.g
          key={i}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 + i * 0.08 }}
        >
          {/* Halo glow for primary node */}
          {i === 0 && (
            <motion.circle
              cx={n.x} cy={n.y} r={n.size * 2.4}
              fill="hsla(var(--anchor-h), 85%, 65%, 0.18)"
              filter="url(#fl-glow)"
              animate={reduce ? {} : { r: [n.size * 2.4, n.size * 3, n.size * 2.4] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <circle
            cx={n.x} cy={n.y} r={n.size}
            fill={i === 0 ? 'url(#fl-node-active)' : 'url(#fl-node-mid)'}
            stroke="hsla(var(--anchor-h), 90%, 85%, 0.5)"
            strokeWidth={0.4}
            style={{ filter: i === 0 ? 'drop-shadow(0 0 12px var(--anchor-glow))' : 'drop-shadow(0 0 6px var(--anchor-glow))' }}
          />
        </motion.g>
      ))}
    </svg>
  );
}

/* ─── Pulse Stack — true 3D layered depth with translateZ separation ─ */
function PulseStackViz({ params }: { params: any }) {
  const layers = Math.max(3, Math.min(6, Number(params.layers || 4)));
  const arr = Array.from({ length: layers }, (_, i) => i);
  const reduce = useReducedMotion();

  return (
    <div style={{
      width: '100%', height: '100%',
      perspective: 800,
      perspectiveOrigin: '50% 40%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        position: 'relative',
        width: 240, height: 180,
        transformStyle: 'preserve-3d',
        transform: 'rotateX(28deg) rotateZ(-3deg)',
      }}>
        {arr.map(i => {
          const isTop = i === layers - 1;
          const z = i * 18;
          const scale = 1 - (layers - 1 - i) * 0.06;
          const opacity = 0.3 + (i / layers) * 0.65;

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity, y: 0 }}
              viewport={{ once: true, margin: '-15%' }}
              transition={{ duration: 0.7, delay: 0.2 + i * 0.15, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: 'absolute',
                inset: 0,
                margin: 'auto',
                width: `${scale * 100}%`,
                height: `${scale * 70}%`,
                background: isTop
                  ? 'linear-gradient(135deg, hsla(var(--anchor-h), 90%, 65%, 0.35), hsla(var(--anchor-h), 80%, 45%, 0.18))'
                  : 'linear-gradient(135deg, hsla(var(--anchor-h), 70%, 55%, 0.12), hsla(var(--anchor-h), 60%, 35%, 0.05))',
                border: isTop
                  ? '1px solid hsla(var(--anchor-h), 90%, 75%, 0.7)'
                  : '0.5px solid hsla(var(--anchor-h), 80%, 65%, 0.35)',
                borderRadius: 12,
                transform: `translateZ(${z}px)`,
                boxShadow: isTop
                  ? '0 0 40px var(--anchor-glow), 0 0 20px hsla(var(--anchor-h), 80%, 60%, 0.4), inset 0 1px 0 hsla(var(--anchor-h), 90%, 85%, 0.4)'
                  : '0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
                backdropFilter: 'blur(2px)',
              }}
            >
              {/* Specular sheen on top layer */}
              {isTop && !reduce && (
                <motion.div
                  style={{
                    position: 'absolute', inset: 0, borderRadius: 12,
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%)',
                    mixBlendMode: 'overlay',
                  }}
                  animate={{ opacity: [0.4, 0.9, 0.4] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              {isTop && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'hsla(var(--anchor-h), 95%, 92%, 0.98)',
                  fontSize: 13, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  textShadow: '0 0 8px var(--anchor-glow), 0 0 16px hsla(var(--anchor-h), 80%, 60%, 0.6)',
                  transform: 'translateZ(8px)',
                }}>
                  {String(params.peak_label || '').slice(0, 24)}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Particle Burst — 3D depth radial spray with bloom core ─────── */
function ParticleBurstViz({ params }: { params: any }) {
  const count = 24;
  const reduce = useReducedMotion();

  /* Pre-compute particle depths */
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + (i * 0.13);
      const depth = 0.3 + Math.random() * 0.7; // 0.3-1.0
      const dist = 60 + (i % 5) * 12 + depth * 25;
      return {
        angle,
        dist,
        depth,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist * 0.85,
        size: 1 + depth * 2.5,
        delay: (i % 8) * 0.05,
      };
    });
  }, []);

  return (
    <svg viewBox="-150 -150 300 300" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
      <defs>
        <radialGradient id="pb-core" cx="35%" cy="30%">
          <stop offset="0%"   stopColor="hsla(var(--anchor-h), 95%, 95%, 1)" />
          <stop offset="35%"  stopColor="hsla(var(--anchor-h), 90%, 75%, 1)" />
          <stop offset="100%" stopColor="hsla(var(--anchor-h), 70%, 35%, 0.95)" />
        </radialGradient>
        <radialGradient id="pb-bloom" cx="50%" cy="50%">
          <stop offset="0%" stopColor="hsla(var(--anchor-h), 85%, 70%, 0.6)" />
          <stop offset="100%" stopColor="hsla(var(--anchor-h), 80%, 50%, 0)" />
        </radialGradient>
        <filter id="pb-blur"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>

      {/* Bloom halo */}
      <motion.circle
        cx={0} cy={0} r={60}
        fill="url(#pb-bloom)"
        animate={reduce ? {} : { r: [60, 75, 60], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Core bright sphere */}
      <motion.circle
        cx={0} cy={0} r={20}
        fill="url(#pb-core)"
        animate={reduce ? {} : { r: [20, 23, 20] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ filter: 'drop-shadow(0 0 20px var(--anchor-glow))' }}
      />

      {/* Light rays — long faint streaks giving radial 3D feel */}
      {!reduce && particles.filter((_, i) => i % 3 === 0).map((p, i) => (
        <motion.line
          key={`ray-${i}`}
          x1={0} y1={0} x2={p.x * 1.3} y2={p.y * 1.3}
          stroke="hsla(var(--anchor-h), 85%, 70%, 0.18)"
          strokeWidth={p.depth * 0.6}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0] }}
          transition={{ duration: 2.4, delay: p.delay + 0.3, repeat: Infinity, repeatDelay: 1.6 }}
        />
      ))}

      {/* Outward burst particles — size+blur communicate depth */}
      {particles.map((p, i) => (
        <motion.circle
          key={i}
          cx={0} cy={0} r={p.size}
          fill={`hsla(var(--anchor-h), ${80 + p.depth * 15}%, ${65 + p.depth * 20}%, ${0.6 + p.depth * 0.4})`}
          filter={p.depth < 0.5 ? 'url(#pb-blur)' : undefined}
          initial={{ opacity: 0 }}
          animate={{ cx: p.x, cy: p.y, opacity: [0, 1, 0.4] }}
          transition={{ duration: 1.6, delay: 0.2 + p.delay, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: p.depth > 0.7 ? 'drop-shadow(0 0 4px var(--anchor-glow))' : undefined }}
        />
      ))}
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

/* ════════════════════════════════════════════════════════════════════
   PHASE 22.1 — DEPTH SECTIONS
   Real digital-marketing report content. Each section is data-driven
   from the new backend depth fields. Honest fallbacks when null.
══════════════════════════════════════════════════════════════════════ */

/* ─── VISIBILITY PULSE — clicks/impressions timeline ────────────── */

function VisibilityPulse({ pulse }: { pulse: NonNullable<ShowcaseDataClient['visibility_pulse']> }) {
  const anchor = COLOR_ANCHORS['gold'];
  const W = 1000, H = 200;
  const points = pulse.points;
  const maxClicks = Math.max(1, ...points.map(p => p.clicks));
  const maxImpr   = Math.max(1, ...points.map(p => p.impressions));
  const stepX = W / Math.max(1, points.length - 1);

  const clicksPath = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${i * stepX} ${H - (p.clicks / maxClicks) * (H - 20) - 10}`
  ).join(' ');
  const imprPath = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${i * stepX} ${H - (p.impressions / maxImpr) * (H - 20) - 10}`
  ).join(' ');

  /* Locate peak index for the marker */
  const peakIdx = pulse.peak_day ? points.findIndex(p => p.date === pulse.peak_day!.date) : -1;
  const peakX = peakIdx >= 0 ? peakIdx * stepX : 0;
  const peakY = peakIdx >= 0 ? H - (points[peakIdx].clicks / maxClicks) * (H - 20) - 10 : 0;

  const goingUp = pulse.period_delta_pct >= 0;

  return (
    <section
      className="scene-section"
      data-section="visibility-pulse"
      style={{
        ['--anchor-h' as any]: anchor.h,
        ['--anchor-s' as any]: `${anchor.s}%`,
        ['--anchor-l' as any]: `${anchor.l}%`,
      } as React.CSSProperties}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.8 }}
      >
        <div className="label-tiny mb-3" style={{ color: 'var(--anchor)' }}>Visibility pulse</div>
        <h2 className="display-lg mb-2">{pulse.window_label}</h2>
        <div className="display-sm mb-6" style={{ color: 'rgba(245,247,255,0.65)', fontWeight: 400 }}>
          {pulse.total_clicks.toLocaleString()} clicks · {pulse.total_impressions.toLocaleString()} impressions
        </div>

        <div className="flex items-center gap-6 mb-6 flex-wrap">
          <div className="delta-badge" style={{
            background: goingUp ? 'hsla(152, 70%, 55%, 0.12)' : 'hsla(320, 78%, 60%, 0.12)',
            borderColor: goingUp ? 'hsla(152, 70%, 55%, 0.4)' : 'hsla(320, 78%, 60%, 0.4)',
            color: goingUp ? 'hsl(152, 70%, 65%)' : 'hsl(320, 78%, 70%)',
          }}>
            <TrendingUp className="h-3.5 w-3.5" style={{ transform: goingUp ? 'none' : 'rotate(180deg)' }} />
            {goingUp ? '+' : ''}{pulse.period_delta_pct.toFixed(1)}% half-over-half
          </div>
          {pulse.peak_day && (
            <div className="label-tiny" style={{ opacity: 0.7 }}>
              Peak: {pulse.peak_day.date} · {pulse.peak_day.clicks.toLocaleString()} clicks
            </div>
          )}
        </div>

        {/* Dual-line chart: impressions (back, soft) + clicks (front, accent) */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.5rem' }}>
          <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: '100%', maxWidth: '100%' }}>
            {/* Gridlines */}
            {[0.25, 0.5, 0.75].map(t => (
              <line key={t} x1={0} y1={H * t + 10} x2={W} y2={H * t + 10}
                stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
            ))}

            {/* Impressions area (back) */}
            <motion.path
              d={`${imprPath} L ${(points.length - 1) * stepX} ${H} L 0 ${H} Z`}
              fill="hsla(var(--anchor-h), var(--anchor-s), 75%, 0.08)"
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
            />
            <motion.path
              d={imprPath}
              stroke="hsla(var(--anchor-h), var(--anchor-s), 75%, 0.35)"
              strokeWidth={1.2}
              fill="none"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
            />

            {/* Clicks line (front) */}
            <motion.path
              d={clicksPath}
              stroke="var(--anchor)"
              strokeWidth={2.2}
              fill="none"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{ filter: 'drop-shadow(0 0 8px var(--anchor-glow))' }}
            />

            {/* Peak marker */}
            {peakIdx >= 0 && (
              <motion.g
                initial={{ opacity: 0, scale: 0 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 1.8 }}
              >
                <circle cx={peakX} cy={peakY} r={6} fill="var(--anchor)"
                  style={{ filter: 'drop-shadow(0 0 10px var(--anchor-glow))' }} />
                <circle cx={peakX} cy={peakY} r={12} fill="none" stroke="var(--anchor)" strokeWidth={0.8} opacity={0.4} />
                <text x={peakX} y={peakY - 16} textAnchor="middle" fontSize={10} fill="var(--anchor)" fontWeight={600}>
                  ★ peak
                </text>
              </motion.g>
            )}
          </svg>

          {/* Legend */}
          <div className="flex items-center gap-6 mt-4 text-[11px]" style={{ color: 'rgba(245,247,255,0.65)' }}>
            <div className="flex items-center gap-2">
              <span style={{ width: 16, height: 2, background: 'var(--anchor)', display: 'inline-block', boxShadow: '0 0 8px var(--anchor-glow)' }} />
              Clicks (organic)
            </div>
            <div className="flex items-center gap-2">
              <span style={{ width: 16, height: 2, background: 'hsla(var(--anchor-h), var(--anchor-s), 75%, 0.35)', display: 'inline-block' }} />
              Impressions
            </div>
          </div>
        </div>

        <p className="prose-soft mt-5" style={{ maxWidth: '60ch' }}>
          The line tells the story Google Search Console saw: every day a user typed something
          you tried to rank for, every click that followed. {goingUp
            ? 'Trajectory is upward across the window.'
            : 'Trajectory has softened — the recommendations below address it.'}
        </p>
      </motion.div>
    </section>
  );
}

/* ─── KEYWORD MOVERS — winners / losers / holding ───────────────── */

function KeywordMovers({ movers }: { movers: NonNullable<ShowcaseDataClient['keyword_movers']> }) {
  const anchor = COLOR_ANCHORS['cyan'];

  return (
    <section
      className="scene-section"
      data-section="keyword-movers"
      style={{
        ['--anchor-h' as any]: anchor.h,
        ['--anchor-s' as any]: `${anchor.s}%`,
        ['--anchor-l' as any]: `${anchor.l}%`,
      } as React.CSSProperties}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.8 }}
      >
        <div className="label-tiny mb-3" style={{ color: 'var(--anchor)' }}>Keyword movement</div>
        <h2 className="display-lg mb-6">What's climbing, what's slipping</h2>

        <div className="movers-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.25rem',
        }}>
          {/* Winners column */}
          {movers.winners.length > 0 && (
            <MoverColumn
              title="Winners"
              subtitle={`${movers.winners.length} climbing`}
              icon={<ArrowUpRight className="h-4 w-4" />}
              accent="emerald"
              rows={movers.winners.map(w => ({
                keyword: w.keyword,
                left:   `${w.from_position.toFixed(0)} → ${w.to_position.toFixed(1)}`,
                delta:  `+${w.delta.toFixed(1)} pos`,
                impressions: w.impressions,
                deltaPositive: true,
              }))}
            />
          )}

          {/* Losers column */}
          {movers.losers.length > 0 && (
            <MoverColumn
              title="Needs attention"
              subtitle={`${movers.losers.length} slipping`}
              icon={<AlertCircle className="h-4 w-4" />}
              accent="magenta"
              rows={movers.losers.map(l => ({
                keyword: l.keyword,
                left:   `${l.from_position.toFixed(0)} → ${l.to_position.toFixed(1)}`,
                delta:  `${l.delta.toFixed(1)} pos`,
                impressions: l.impressions,
                deltaPositive: false,
              }))}
            />
          )}

          {/* Holding column — shown when winners/losers are sparse */}
          {(movers.winners.length === 0 || movers.losers.length === 0) && movers.holding.length > 0 && (
            <MoverColumn
              title="Holding position"
              subtitle={`${movers.holding.length} stable`}
              icon={<Target className="h-4 w-4" />}
              accent="cyan"
              rows={movers.holding.map(h => ({
                keyword: h.keyword,
                left:   `position ${h.position.toFixed(1)}`,
                delta:  `${h.impressions.toLocaleString()} impr`,
                impressions: h.impressions,
                deltaPositive: null,
              }))}
            />
          )}
        </div>

        <p className="prose-soft mt-6" style={{ maxWidth: '60ch', color: 'rgba(245,247,255,0.55)', fontStyle: 'italic' }}>
          {movers.methodology}
        </p>
      </motion.div>
    </section>
  );
}

function MoverColumn({ title, subtitle, icon, accent, rows }: {
  title: string; subtitle: string; icon: React.ReactNode;
  accent: ShowcaseColorAnchorClient;
  rows: Array<{ keyword: string; left: string; delta: string; impressions: number; deltaPositive: boolean | null }>;
}) {
  const a = COLOR_ANCHORS[accent];
  return (
    <div
      className="card-3d"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '0.5px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '1.25rem',
        backdropFilter: 'blur(8px)',
        position: 'relative',
        ['--anchor-h' as any]: a.h,
        ['--anchor-glow' as any]: `hsla(${a.h}, ${a.s}%, 60%, 0.3)`,
      } as React.CSSProperties}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span style={{ color: `hsl(${a.h}, ${a.s}%, ${a.l}%)` }}>{icon}</span>
          <div>
            <div className="display-sm" style={{ fontWeight: 600 }}>{title}</div>
            <div className="label-tiny" style={{ opacity: 0.7 }}>{subtitle}</div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {rows.slice(0, 6).map((r, i) => (
          <motion.div
            key={i}
            className="flex items-baseline justify-between gap-3 py-2 px-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.02)' }}
            initial={{ opacity: 0, x: 12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.06 }}
          >
            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'rgba(245,247,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.keyword}
              </div>
              <div className="label-tiny" style={{ opacity: 0.65, marginTop: '0.1rem' }}>{r.left}</div>
            </div>
            <div style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: r.deltaPositive === true ? 'hsl(152, 70%, 65%)'
                   : r.deltaPositive === false ? 'hsl(320, 78%, 70%)'
                   : 'rgba(245,247,255,0.65)',
              fontFeatureSettings: '"tnum" 1',
              whiteSpace: 'nowrap',
            }}>
              {r.delta}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── INTENT DISTRIBUTION — donut + breakdown ───────────────────── */

function IntentDistribution({ intent }: { intent: NonNullable<ShowcaseDataClient['intent_distribution']> }) {
  const anchor = COLOR_ANCHORS['amethyst'];
  const totalImpressions = intent.branded.impressions + intent.informational.impressions + intent.commercial.impressions + intent.transactional.impressions;
  const totalClicks      = intent.branded.clicks + intent.informational.clicks + intent.commercial.clicks + intent.transactional.clicks;

  const slices = [
    { id: 'branded',       label: 'Branded',       hue: 42,  data: intent.branded,       describe: 'searches with your brand name' },
    { id: 'informational', label: 'Informational', hue: 188, data: intent.informational, describe: 'how-to, what-is, learn' },
    { id: 'commercial',    label: 'Commercial',    hue: 268, data: intent.commercial,    describe: 'best, top, reviews, alternatives' },
    { id: 'transactional', label: 'Transactional', hue: 152, data: intent.transactional, describe: 'buy, price, near me' },
  ].filter(s => s.data.impressions > 0);

  /* Compute donut arcs */
  const cx = 130, cy = 130, rOuter = 110, rInner = 70;
  let accAngle = -Math.PI / 2; // start at top

  return (
    <section
      className="scene-section"
      data-section="intent-distribution"
      style={{
        ['--anchor-h' as any]: anchor.h,
        ['--anchor-s' as any]: `${anchor.s}%`,
        ['--anchor-l' as any]: `${anchor.l}%`,
      } as React.CSSProperties}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.8 }}
      >
        <div className="label-tiny mb-3" style={{ color: 'var(--anchor)' }}>Search intent map</div>
        <h2 className="display-lg mb-2">Where the traffic actually comes from</h2>
        <div className="display-sm mb-8" style={{ color: 'rgba(245,247,255,0.65)', fontWeight: 400 }}>
          {totalClicks.toLocaleString()} clicks across {totalImpressions.toLocaleString()} impressions, classified by intent
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 280px) 1fr',
          gap: '3rem',
          alignItems: 'center',
        }} className="intent-grid">
          {/* Donut chart */}
          <svg viewBox="0 0 260 260" className="donut-3d" style={{ width: '100%', maxWidth: 280 }}>
            <defs>
              {slices.map(s => (
                <radialGradient key={s.id} id={`grad_${s.id}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={`hsl(${s.hue}, 80%, 70%)`} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={`hsl(${s.hue}, 70%, 50%)`} stopOpacity={0.7} />
                </radialGradient>
              ))}
            </defs>
            {slices.map((s, i) => {
              const fraction = s.data.impressions / totalImpressions;
              const sweep = fraction * Math.PI * 2;
              const a1 = accAngle;
              const a2 = accAngle + sweep;
              accAngle = a2;
              const largeArc = sweep > Math.PI ? 1 : 0;
              const x1o = cx + Math.cos(a1) * rOuter, y1o = cy + Math.sin(a1) * rOuter;
              const x2o = cx + Math.cos(a2) * rOuter, y2o = cy + Math.sin(a2) * rOuter;
              const x1i = cx + Math.cos(a2) * rInner, y1i = cy + Math.sin(a2) * rInner;
              const x2i = cx + Math.cos(a1) * rInner, y2i = cy + Math.sin(a1) * rInner;
              const path = `M ${x1o} ${y1o} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x2i} ${y2i} Z`;
              return (
                <motion.path
                  key={s.id}
                  d={path}
                  fill={`url(#grad_${s.id})`}
                  stroke={`hsl(${s.hue}, 70%, 30%)`}
                  strokeWidth={0.5}
                  initial={{ opacity: 0, scale: 0.6 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.3 + i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformOrigin: '130px 130px', filter: `drop-shadow(0 0 8px hsla(${s.hue}, 80%, 60%, 0.4))` }}
                />
              );
            })}
            {/* Center labels */}
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill="rgba(245,247,255,0.6)" fontWeight={600}
              style={{ letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Intent
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize={20} fill="var(--anchor)" fontWeight={300}>
              {slices.length}
            </text>
            <text x={cx} y={cy + 30} textAnchor="middle" fontSize={9} fill="rgba(245,247,255,0.55)">
              buckets active
            </text>
          </svg>

          {/* Breakdown table */}
          <div className="flex flex-col gap-3">
            {slices.sort((a, b) => b.data.impressions - a.data.impressions).map((s, i) => {
              const impPct = totalImpressions > 0 ? (s.data.impressions / totalImpressions) * 100 : 0;
              const ctr = s.data.impressions > 0 ? (s.data.clicks / s.data.impressions) * 100 : 0;
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: 10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.6 + i * 0.1 }}
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '0.5px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    padding: '0.9rem 1.1rem',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Subtle bar overlay showing the % */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: `linear-gradient(90deg, hsla(${s.hue}, 70%, 50%, 0.10) 0%, hsla(${s.hue}, 70%, 50%, 0.10) ${impPct}%, transparent ${impPct}%)`,
                    pointerEvents: 'none',
                  }} />
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: `hsl(${s.hue}, 70%, 75%)` }}>{s.label}</div>
                      <div className="label-tiny" style={{ opacity: 0.6, marginTop: '0.15rem' }}>{s.describe}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 300, color: 'rgba(245,247,255,0.92)', fontFeatureSettings: '"tnum" 1' }}>
                        {impPct.toFixed(1)}%
                      </div>
                      <div className="label-tiny" style={{ opacity: 0.65, marginTop: '0.1rem' }}>
                        {s.data.clicks.toLocaleString()} clicks · {ctr.toFixed(2)}% CTR
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <p className="prose-soft mt-6" style={{ maxWidth: '70ch', color: 'rgba(245,247,255,0.55)', fontStyle: 'italic' }}>
          {intent.classification_note}
        </p>

        <style>{`
          @media (max-width: 768px) {
            .intent-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </motion.div>
    </section>
  );
}

/* ─── CONTENT HEALTH — page tiers with action recommendations ────── */

function ContentHealth({ health }: { health: NonNullable<ShowcaseDataClient['content_health']> }) {
  const anchor = COLOR_ANCHORS['emerald'];

  const tiers = [
    {
      id: 'hero' as const,
      label: 'Heroes',
      sub: 'Page-1, high CTR. Defend.',
      count: health.tier_counts.hero,
      rows: health.tiers.hero,
      action: health.tier_actions.hero,
      hue: 42,
      icon: <Award className="h-4 w-4" />,
    },
    {
      id: 'climbing' as const,
      label: 'Climbing',
      sub: 'Page-2 with momentum. Push.',
      count: health.tier_counts.climbing,
      rows: health.tiers.climbing,
      action: health.tier_actions.climbing,
      hue: 188,
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      id: 'plateau' as const,
      label: 'Plateaued',
      sub: 'Ranking but low CTR. Rewrite.',
      count: health.tier_counts.plateau,
      rows: health.tiers.plateau,
      action: health.tier_actions.plateau,
      hue: 268,
      icon: <Target className="h-4 w-4" />,
    },
    {
      id: 'under' as const,
      label: 'Underperforming',
      sub: 'Buried or low signal. Re-evaluate.',
      count: health.tier_counts.underperforming,
      rows: health.tiers.underperforming,
      action: health.tier_actions.underperforming,
      hue: 320,
      icon: <AlertCircle className="h-4 w-4" />,
    },
  ];

  return (
    <section
      className="scene-section"
      data-section="content-health"
      style={{
        ['--anchor-h' as any]: anchor.h,
        ['--anchor-s' as any]: `${anchor.s}%`,
        ['--anchor-l' as any]: `${anchor.l}%`,
      } as React.CSSProperties}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.8 }}
      >
        <div className="label-tiny mb-3" style={{ color: 'var(--anchor)' }}>Content health matrix</div>
        <h2 className="display-lg mb-2">Every page has a job</h2>
        <div className="display-sm mb-8" style={{ color: 'rgba(245,247,255,0.65)', fontWeight: 400 }}>
          Top {tiers.reduce((s, t) => s + t.count, 0)} pages tiered by performance — each tier has its own action
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
        }}>
          {tiers.map((tier, ti) => (
            <motion.div
              key={tier.id}
              className="card-3d"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.15 + ti * 0.12 }}
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: `0.5px solid hsla(${tier.hue}, 70%, 60%, 0.25)`,
                borderRadius: 16,
                padding: '1.25rem',
                position: 'relative',
                overflow: 'hidden',
                ['--anchor-h' as any]: tier.hue,
                ['--anchor-glow' as any]: `hsla(${tier.hue}, 80%, 60%, 0.35)`,
              } as React.CSSProperties}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2" style={{ color: `hsl(${tier.hue}, 70%, 70%)` }}>
                  {tier.icon}
                  <div>
                    <div className="display-sm" style={{ fontWeight: 600, color: `hsl(${tier.hue}, 70%, 78%)` }}>{tier.label}</div>
                    <div className="label-tiny" style={{ opacity: 0.65 }}>{tier.sub}</div>
                  </div>
                </div>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 300,
                  color: `hsl(${tier.hue}, 70%, 78%)`,
                  fontFeatureSettings: '"tnum" 1',
                }}>
                  {tier.count}
                </div>
              </div>

              {/* Top rows in this tier */}
              {tier.rows.length > 0 ? (
                <div className="flex flex-col gap-1.5 mb-4">
                  {tier.rows.slice(0, 3).map((p, i) => (
                    <div key={i} style={{
                      fontSize: '0.75rem',
                      color: 'rgba(245,247,255,0.7)',
                      padding: '0.4rem 0.6rem',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                        {p.page.replace(/^https?:\/\/[^/]+/, '') || '/'}
                      </span>
                      <span style={{ fontFeatureSettings: '"tnum" 1', opacity: 0.85, whiteSpace: 'nowrap', color: `hsl(${tier.hue}, 65%, 70%)` }}>
                        #{p.position.toFixed(0)} · {p.clicks.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {tier.rows.length > 3 && (
                    <div className="label-tiny" style={{ opacity: 0.5, marginTop: '0.25rem', textAlign: 'center' }}>
                      +{tier.rows.length - 3} more
                    </div>
                  )}
                </div>
              ) : (
                <div className="label-tiny" style={{ opacity: 0.5, padding: '0.5rem 0', textAlign: 'center', fontStyle: 'italic' }}>
                  No pages in this tier
                </div>
              )}

              {/* Action recommendation */}
              <div style={{
                marginTop: 'auto',
                paddingTop: '0.75rem',
                borderTop: `0.5px solid hsla(${tier.hue}, 70%, 60%, 0.2)`,
                fontSize: '0.75rem',
                color: 'rgba(245,247,255,0.7)',
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}>
                {tier.action}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
