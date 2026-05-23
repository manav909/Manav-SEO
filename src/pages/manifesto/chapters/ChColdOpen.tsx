/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChColdOpen.tsx
   Chapter 00 — Cold Open. Eternal Spring.

   The grand entry, properly staged. Trust earned by the company first,
   then transferred to the founder via a deliberate, *quiet* reveal.

   INTERACTIVITY
   Each letter of S.E.A.S.O.N. is a hover target. The three recital
   rows below remain visible as the persistent structure; hovering any
   letter brightens its pair and expands its row with the SEO-context
   paragraph. The other two pairs dim. Touch devices toggle on tap.

   Letter → pair mapping:
     S₁, E  →  se   (Strategic Execution)
     A,  S₂ →  as   (Analysis Support)
     O,  N  →  on   (Operator's Network)

   Rows themselves are also hoverable for users who don't think to
   touch the letters.

   ARCHITECTURE — five-act journey
     ACT 1  Coordinate mark           document framing
     ACT 2  S.E.A.S.O.N. (PEAK 1)     the company arrives
              + interactive recital    explore the meaning
              + kicker + sub           agency positioning
              + intel callout          proof of capability
     ACT 3  Pause + setup line         "infrastructure of this depth
                                         is usually a team's work."
     ACT 4  Pivot                      "This is one person's."
                                         the dramatic hinge
     ACT 5  Humble Manav reveal        smaller, italic, no peacock
              + "── by ──" mark        signature attribution
              + close                  "Architect of the system above.
                                         He answers when called."

   The reveal is *quiet*. Tony Stark says "I am Iron Man" into a
   microphone, not into a megaphone. Confidence is calm.

   Total reveal pacing: ~11s. Title-sequence cadence.
══════════════════════════════════════════════════════════════════════ */

import { useRef, useState } from 'react';
import {
  motion, useMotionValue, useSpring, useReducedMotion, AnimatePresence,
} from 'framer-motion';
import type { Lang, TFn } from '../types';
import { FEATHER } from '../types';
import { ScrollHint } from '../shared';

type Pair = 'se' | 'as' | 'on' | null;

export function ChColdOpen({ t, lang }: { t: TFn; lang: Lang }) {
  const reduce = useReducedMotion();
  const ref    = useRef<HTMLElement>(null);

  /* hover state — debounce clears by 150ms to avoid flicker when
     moving between letters of the same pair */
  const [hoveredPair, setHoveredPairRaw] = useState<Pair>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setHoveredPair = (p: Pair) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (p === null) {
      timerRef.current = setTimeout(() => setHoveredPairRaw(null), 150);
    } else {
      setHoveredPairRaw(p);
    }
  };

  /* 3D mouse tilt on the whole stage */
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const tiltX  = useSpring(mouseY, { stiffness: 60, damping: 18, mass: 1.1 });
  const tiltY  = useSpring(mouseX, { stiffness: 60, damping: 18, mass: 1.1 });

  const handleMouse = (e: React.MouseEvent) => {
    if (reduce) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
    mouseX.set(x * 5);
    mouseY.set(-y * 5);
  };
  const handleLeave = () => { mouseX.set(0); mouseY.set(0); };

  return (
    <section
      id="cold-open"
      className="act act-cold-open"
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
    >
      <ColdOpenStyles />

      <motion.div
        className="cold-open-stage cold-open-stage-journey"
        style={{ rotateX: tiltX, rotateY: tiltY, transformPerspective: 1400 }}
      >
        {/* ─── ACT 1. COORDINATE MARK ──────────────────────── */}
        <motion.div
          className="coord-mark"
          initial={{ opacity: 0, letterSpacing: '0.55em' }}
          animate={{ opacity: 0.7, letterSpacing: '0.34em' }}
          transition={{ duration: 1.4, ease: FEATHER }}
        >
          <span className="coord-rule" />
          <span className="coord-segment">SEO SEASON</span>
          <span className="coord-dot">·</span>
          <span className="coord-segment">VOL. I</span>
          <span className="coord-dot">·</span>
          <span className="coord-segment">2026</span>
          <span className="coord-rule" />
        </motion.div>

        {/* ─── ACT 2a. BRAND REVEAL (PEAK 1) — interactive ─── */}
        <div className="cold-open-brand mt-12">
          <BrandReveal
            delay={0.6}
            hoveredPair={hoveredPair}
            setHoveredPair={setHoveredPair}
          />
        </div>

        {/* ─── ACT 2b. INTERACTIVE RECITAL ─────────────────── */}
        <motion.div
          className="recital mt-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 2.2, ease: FEATHER }}
          key={lang}
        >
          <InteractiveRecital
            t={t}
            delay={2.2}
            hoveredPair={hoveredPair}
            setHoveredPair={setHoveredPair}
          />
        </motion.div>

        {/* ─── ACT 2c. KICKER (agency positioning) ─────────── */}
        <motion.div
          className="cold-open-kicker-xl mt-14"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.3, delay: 3.4, ease: FEATHER }}
        >
          {t('hero_kicker')}
        </motion.div>

        {/* ─── ACT 2d. SUB ─────────────────────────────────── */}
        <motion.div
          className="cold-open-sub-xl mt-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.78, y: 0 }}
          transition={{ duration: 1.1, delay: 3.9, ease: FEATHER }}
        >
          {t('hero_sub')}
        </motion.div>

        {/* ─── ACT 2e. INTEL CALLOUT ───────────────────────── */}
        <motion.div
          className="hero-intel-callout mt-10"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.7, y: 0 }}
          transition={{ duration: 1.1, delay: 4.5, ease: FEATHER }}
        >
          {t('hero_intel_callout')}
        </motion.div>

        {/* ─── ACT 3. SETUP LINE ───────────────────────────── */}
        <motion.div
          className="hero-reveal-setup mt-24"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 0.7, y: 0 }}
          transition={{ duration: 1.4, delay: 6.0, ease: FEATHER }}
        >
          {t('hero_reveal_setup')}
        </motion.div>

        {/* ─── ACT 4. PIVOT (dramatic hinge) ──────────────── */}
        <motion.div
          className="hero-reveal-pivot mt-6"
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0,  scale: 1     }}
          transition={{ duration: 1.6, delay: 7.0, ease: FEATHER }}
        >
          {t('hero_reveal_pivot')}
        </motion.div>

        {/* ─── ACT 5. HUMBLE MANAV REVEAL ─────────────────── */}
        <motion.div
          className="hero-by-mark mt-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.55 }}
          transition={{ duration: 1.0, delay: 8.4, ease: FEATHER }}
        >
          <span className="by-rule" />
          <span className="by-word">{t('hero_by_mark')}</span>
          <span className="by-rule" />
        </motion.div>

        <AnimatedSignature delay={8.9} />

        <motion.div
          className="hero-close mt-5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 0.82, y: 0 }}
          transition={{ duration: 1.2, delay: 12.2, ease: FEATHER }}
        >
          {t('hero_close')}
        </motion.div>

        <ScrollHint label={t('scroll_hint')} delay={13.5} />
      </motion.div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BRAND REVEAL — S.E.A.S.O.N. letter-by-letter, with each non-dot
   letter encoded as a member of one of three pairs (se/as/on).
═══════════════════════════════════════════════════════════════ */
function BrandReveal({
  delay = 0,
  hoveredPair,
  setHoveredPair,
}: {
  delay?: number;
  hoveredPair: Pair;
  setHoveredPair: (p: Pair) => void;
}) {
  const letters: Array<{ ch: string; pair: Pair }> = [
    { ch: 'S', pair: 'se' },
    { ch: '.', pair: null },
    { ch: 'E', pair: 'se' },
    { ch: '.', pair: null },
    { ch: 'A', pair: 'as' },
    { ch: '.', pair: null },
    { ch: 'S', pair: 'as' },
    { ch: '.', pair: null },
    { ch: 'O', pair: 'on' },
    { ch: '.', pair: null },
    { ch: 'N', pair: 'on' },
    { ch: '.', pair: null },
  ];

  return (
    <div className="brand-reveal" aria-label="S.E.A.S.O.N.">
      {letters.map((l, i) => {
        const isDot     = l.ch === '.';
        const isActive  = !!l.pair && l.pair === hoveredPair;
        const isDimmed  = !isDot && hoveredPair !== null && l.pair !== hoveredPair;
        const className = [
          isDot ? 'brand-dot' : 'brand-letter',
          isActive ? 'brand-active' : '',
          isDimmed ? 'brand-dimmed' : '',
        ].filter(Boolean).join(' ');

        return (
          <motion.span
            key={i}
            className={className}
            initial={{ opacity: 0, y: 28, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0,  filter: 'blur(0px)' }}
            transition={{
              duration: 1.1,
              ease: FEATHER,
              delay: delay + i * 0.1,
            }}
            onMouseEnter={() => l.pair && setHoveredPair(l.pair)}
            onMouseLeave={() => l.pair && setHoveredPair(null)}
            onClick={() => {
              if (!l.pair) return;
              setHoveredPair(hoveredPair === l.pair ? null : l.pair);
            }}
          >
            {l.ch}
          </motion.span>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   INTERACTIVE RECITAL — three rows persistent.
   Hovered row brightens + expands its SEO-context paragraph.
   Inactive rows dim. Rows themselves are hoverable.
═══════════════════════════════════════════════════════════════ */
function InteractiveRecital({
  t,
  delay = 0,
  hoveredPair,
  setHoveredPair,
}: {
  t: TFn;
  delay?: number;
  hoveredPair: Pair;
  setHoveredPair: (p: Pair) => void;
}) {
  const rows: Array<{
    pair: Pair; prefix: string; phrase: string; context: string;
  }> = [
    { pair: 'se', prefix: 'S.E.', phrase: t('phrase_strat_exec'), context: t('hero_se_context') },
    { pair: 'as', prefix: 'A.S.', phrase: t('phrase_anal_supp'),  context: t('hero_as_context') },
    { pair: 'on', prefix: 'O.N.', phrase: t('phrase_op_net'),     context: t('hero_on_context') },
  ];

  return (
    <div className="recital-stack">
      {rows.map((r, i) => {
        const isActive = r.pair === hoveredPair;
        const isDimmed = hoveredPair !== null && !isActive;
        return (
          <motion.div
            key={r.pair}
            className={`recital-line ${isActive ? 'recital-active' : ''} ${isDimmed ? 'recital-dimmed' : ''}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.0, ease: FEATHER, delay: delay + i * 0.22 }}
            onMouseEnter={() => setHoveredPair(r.pair)}
            onMouseLeave={() => setHoveredPair(null)}
            onClick={() => setHoveredPair(hoveredPair === r.pair ? null : r.pair)}
          >
            <div className="recital-row-main">
              <span className="recital-prefix">{r.prefix}</span>
              <span className="recital-rule" />
              <span className="recital-phrase">{r.phrase}</span>
            </div>
            <AnimatePresence initial={false}>
              {isActive && (
                <motion.div
                  className="recital-context"
                  initial={{ opacity: 0, height: 0, y: -4 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -4 }}
                  transition={{ duration: 0.45, ease: FEATHER }}
                >
                  <div className="recital-context-inner">{r.context}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ANIMATED SIGNATURE — "Manav Sharma"

   A signature that is actually DRAWN, not unmasked. The cinematic
   spec:

     · "Manav Sharma" rendered in Pinyon Script — a formal
       calligraphic font with thin, elegant, authoritative
       letterforms. (Mr Dafoe / Allura / Allison as fallbacks
       in case the primary font fails to load.) Sized small and
       refined — this is a signature, not a header.

     · The text is rendered with `fill: none` and a thin white
       stroke. SVG's `stroke-dasharray` and `stroke-dashoffset`
       are then animated, which traces each glyph outline
       progressively from left to right — as if a pen is actually
       moving across the page. This is the same technique used
       for hand-drawn animations in motion-graphics; applied to
       text, it produces an authentic writing reveal.

     · A subtle slant transform (-2.5deg) is applied to the SVG so
       the signature sits naturally angled — the way a real
       signature lands on paper, not perfectly horizontal.

     · After the strokes finish drawing (~2.7s), the fill fades
       in over 0.7s and the stroke softens — "the ink soaks
       into the paper." The final state is a filled, slightly
       slanted, signed name with a thin residual outline glow.

     · A soft white drop-shadow filter provides a subtle ink-glow
       throughout — the visual signature of pen on premium paper.

   No pen-tip dot needed. The stroke is the pen now.

   Respects prefers-reduced-motion. If active, the signature
   renders fully visible immediately with no draw animation.
═══════════════════════════════════════════════════════════════ */

function AnimatedSignature({ delay }: { delay: number }) {
  const reducedMotion = useReducedMotion();

  /* Total stroke-dasharray value. Must be larger than the rendered
     total path length of "Manav Sharma" in Pinyon Script at the
     fontSize we use. For an SVG viewBox of 500x130 and fontSize
     around 92px, total path length is approximately 1800-2400
     user units across all glyph outlines. 3200 gives safe headroom. */
  const DASH = 3200;

  /* Animation timing */
  const writeS     = 2.7;   // stroke draws letterforms
  const inkSoakS   = 0.7;   // fill fades in after strokes complete
  const writeCurve = [0.18, 0.35, 0.78, 1] as const;  // steady-paced writing
  const startDelay = delay + 0.45;

  return (
    <>
      {/* Pinyon Script + Mr Dafoe — formal calligraphic / signature fonts.
          font-display: swap shows a cursive fallback if not yet loaded. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Pinyon+Script&family=Mr+Dafoe&display=swap"
      />

      <motion.div
        className="hero-signature-wrap mt-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay, ease: FEATHER }}
        role="img"
        aria-label="Manav Sharma, founder signature"
      >
        <svg
          viewBox="0 0 500 130"
          className="hero-signature-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {reducedMotion ? (
            <text
              x="250"
              y="85"
              textAnchor="middle"
              className="hero-signature-text-static"
            >
              Manav Sharma
            </text>
          ) : (
            <motion.text
              x="250"
              y="85"
              textAnchor="middle"
              className="hero-signature-text-draw"
              strokeDasharray={DASH}
              initial={{ strokeDashoffset: DASH, fillOpacity: 0, strokeOpacity: 1 }}
              animate={{ strokeDashoffset: 0,    fillOpacity: 0.96, strokeOpacity: 0.35 }}
              transition={{
                strokeDashoffset: { duration: writeS,   ease: writeCurve, delay: startDelay },
                fillOpacity:      { duration: inkSoakS, ease: 'easeOut',  delay: startDelay + writeS - 0.15 },
                strokeOpacity:    { duration: inkSoakS, ease: 'easeOut',  delay: startDelay + writeS - 0.15 },
              }}
            >
              Manav Sharma
            </motion.text>
          )}
        </svg>
      </motion.div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STYLES
═══════════════════════════════════════════════════════════════ */
function ColdOpenStyles() {
  return (
    <style>{`
      .cold-open-stage-journey {
        padding: 3rem 0 4rem 0;
      }

      /* ─── COORDINATE MARK ─────────────────────────────────── */
      .coord-mark {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.85rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.32em;
        text-transform: uppercase;
        color: var(--m-ink-soft);
      }
      .coord-segment { white-space: nowrap; }
      .coord-dot     { color: hsla(188, 70%, 65%, 0.75); font-weight: 400; letter-spacing: 0; }
      .coord-rule    {
        display: inline-block;
        width: 30px;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--m-hairline-s), transparent);
      }

      /* ─── BRAND (PEAK 1) — interactive ────────────────────── */
      .cold-open-stage-journey .brand-reveal {
        font-size: clamp(3.5rem, 10vw, 9rem);
      }
      .cold-open-stage-journey .brand-letter,
      .cold-open-stage-journey .brand-dot {
        cursor: pointer;
        transition: opacity 0.35s ease, filter 0.35s ease, text-shadow 0.35s ease;
      }
      .cold-open-stage-journey .brand-active {
        text-shadow: 0 0 32px hsla(188, 80%, 65%, 0.55);
        filter: brightness(1.18);
      }
      .cold-open-stage-journey .brand-dimmed {
        opacity: 0.38;
      }

      /* ─── INTERACTIVE RECITAL ─────────────────────────────── */
      .recital-stack {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0.6rem;
        max-width: 680px;
        margin: 0 auto;
      }
      .recital-line {
        cursor: pointer;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        transition: opacity 0.35s ease, background 0.35s ease;
      }
      .recital-line:hover { background: hsla(188, 50%, 50%, 0.03); }
      .recital-active     { background: hsla(188, 50%, 50%, 0.05); }
      .recital-dimmed     { opacity: 0.38; }

      .recital-row-main {
        display: grid;
        grid-template-columns: 5rem 32px 1fr;
        gap: 1.1rem;
        align-items: baseline;
      }
      .recital-prefix {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.22em;
        color: hsla(188, 75%, 70%, 0.85);
        text-align: right;
        transition: color 0.35s ease;
      }
      .recital-active .recital-prefix { color: hsla(188, 90%, 80%, 1); }
      .recital-rule {
        height: 1px;
        background: linear-gradient(90deg, transparent, hsla(188, 60%, 70%, 0.35), transparent);
        align-self: center;
        transition: background 0.35s ease;
      }
      .recital-active .recital-rule {
        background: linear-gradient(90deg, transparent, hsla(188, 80%, 70%, 0.7), transparent);
      }
      .recital-phrase {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.4rem, 2.5vw, 1.9rem);
        font-weight: 400;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        line-height: 1;
        color: var(--m-ink-strong);
        background: linear-gradient(180deg, rgba(255, 255, 255, 1), hsla(188, 65%, 78%, 0.72));
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        text-align: left;
        white-space: nowrap;
        transition: filter 0.35s ease;
      }
      .recital-active .recital-phrase { filter: brightness(1.18); }

      .recital-context {
        overflow: hidden;
      }
      .recital-context-inner {
        margin-top: 0.7rem;
        padding-left: 6.1rem;  /* aligns under the phrase column */
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(0.92rem, 1.3vw, 1.05rem);
        line-height: 1.65;
        font-style: italic;
        color: var(--m-ink-medium);
        max-width: 56ch;
        letter-spacing: 0.005em;
      }

      /* ─── KICKER + SUB + INTEL ─────────────────────────────── */
      .cold-open-kicker-xl {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.5rem, 2.7vw, 2.05rem);
        line-height: 1.35;
        color: var(--m-ink-strong);
        font-style: italic;
        letter-spacing: -0.01em;
        max-width: 42ch;
        margin-left: auto;
        margin-right: auto;
      }
      .cold-open-sub-xl {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(0.92rem, 1.4vw, 1.05rem);
        color: var(--m-ink-medium);
        letter-spacing: 0.04em;
        max-width: 42ch;
        margin-left: auto;
        margin-right: auto;
      }
      .hero-intel-callout {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(0.78rem, 1.1vw, 0.9rem);
        line-height: 1.55;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: hsla(188, 60%, 75%, 0.95);
        max-width: 56ch;
        margin-left: auto;
        margin-right: auto;
        font-weight: 600;
      }

      /* ─── REVEAL SETUP + PIVOT ─────────────────────────────── */
      .hero-reveal-setup {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.05rem, 1.6vw, 1.3rem);
        line-height: 1.5;
        font-style: italic;
        color: var(--m-ink-medium);
        max-width: 38ch;
        margin-left: auto;
        margin-right: auto;
      }
      .hero-reveal-pivot {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.7rem, 3.4vw, 2.55rem);
        line-height: 1.25;
        font-style: italic;
        letter-spacing: -0.015em;
        color: hsla(188, 80%, 78%, 0.97);
        text-shadow: 0 0 28px hsla(188, 75%, 60%, 0.25);
        max-width: 30ch;
        margin-left: auto;
        margin-right: auto;
      }

      /* ─── HUMBLE MANAV REVEAL ──────────────────────────────── */
      .hero-by-mark {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
      }
      .by-word {
        font-family: ui-serif, Georgia, serif;
        font-size: 0.78rem;
        font-style: italic;
        color: var(--m-ink-soft);
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      .by-rule {
        display: inline-block;
        width: 56px;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--m-hairline-s), transparent);
      }
      /* ─── ANIMATED SIGNATURE ──────────────────────────────────
         Signature draws stroke-first, then fill soaks in. The SVG
         is slightly rotated (-2.5deg) to land naturally — the way
         a real signature sits on paper, not perfectly horizontal.
      */
      .hero-signature-wrap {
        width: 100%;
        max-width: 340px;
        margin: 0.5rem auto 0 auto;
        display: flex;
        justify-content: center;
        align-items: center;
        transform: rotate(-2.5deg);
        transform-origin: center center;
      }
      .hero-signature-svg {
        width: 100%;
        height: auto;
        display: block;
        overflow: visible;
      }

      /* Static fallback (used when prefers-reduced-motion is set) */
      .hero-signature-text-static {
        font-family: 'Pinyon Script', 'Mr Dafoe', 'Allura', 'Allison', 'Sacramento', cursive;
        font-size: 92px;
        font-weight: 400;
        letter-spacing: 0.005em;
        fill: rgba(255, 255, 255, 0.96);
        filter:
          drop-shadow(0 0 4px hsla(0, 0%, 100%, 0.35))
          drop-shadow(0 0 14px hsla(0, 0%, 100%, 0.15));
      }

      /* Animated: starts stroke-only with no fill, then ink soaks in */
      .hero-signature-text-draw {
        font-family: 'Pinyon Script', 'Mr Dafoe', 'Allura', 'Allison', 'Sacramento', cursive;
        font-size: 92px;
        font-weight: 400;
        letter-spacing: 0.005em;
        fill: rgba(255, 255, 255, 1);
        stroke: rgba(255, 255, 255, 0.96);
        stroke-width: 0.85;
        stroke-linecap: round;
        stroke-linejoin: round;
        paint-order: stroke fill;
        filter:
          drop-shadow(0 0 4px hsla(0, 0%, 100%, 0.4))
          drop-shadow(0 0 14px hsla(0, 0%, 100%, 0.18));
      }

      /* Legacy classes — kept in case anything else references them */
      .hero-name-humble {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(2.5rem, 5vw, 4rem);
        line-height: 1.05;
        font-style: italic;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.96);
        text-align: center;
      }
      .hero-signature-text,
      .hero-signature-pen {
        /* legacy from prior animation iteration — no longer rendered */
        display: none;
      }
      .hero-close {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.0rem, 1.45vw, 1.2rem);
        line-height: 1.55;
        font-style: italic;
        color: var(--m-ink-medium);
        letter-spacing: 0.005em;
        max-width: 44ch;
        margin-left: auto;
        margin-right: auto;
      }

      /* ─── RESPONSIVE ───────────────────────────────────────── */
      @media (max-width: 880px) {
        .cold-open-stage-journey .brand-reveal { font-size: clamp(2.4rem, 12vw, 4.5rem); }
        .hero-name-humble { font-size: clamp(2rem, 7vw, 3rem); }
        .hero-signature-wrap { max-width: 280px; }
        .recital-phrase   { font-size: 1.1rem; white-space: normal; }
        .recital-row-main { grid-template-columns: 3.4rem 18px 1fr; gap: 0.7rem; }
        .recital-context-inner { padding-left: 4.1rem; font-size: 0.92rem; }
        .hero-reveal-pivot { font-size: clamp(1.4rem, 5vw, 2rem); }
      }
      @media (max-width: 560px) {
        .coord-mark      { font-size: 0.55rem; gap: 0.45rem; letter-spacing: 0.22em; flex-wrap: wrap; }
        .coord-rule      { width: 18px; }
        .recital-row-main { grid-template-columns: 1fr; gap: 0.15rem; }
        .recital-prefix   { text-align: center; }
        .recital-rule     { display: none; }
        .recital-phrase   { text-align: center; }
        .recital-context-inner { padding-left: 0; text-align: center; }
        .by-rule { width: 36px; }
        .hero-signature-wrap { max-width: 230px; }
      }
    `}</style>
  );
}
