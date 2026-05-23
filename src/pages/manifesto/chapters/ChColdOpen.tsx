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

        <motion.div
          className="hero-name-humble mt-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4, delay: 8.9, ease: FEATHER }}
        >
          {t('hero_founder_name')}
        </motion.div>

        <motion.div
          className="hero-close mt-5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 0.82, y: 0 }}
          transition={{ duration: 1.2, delay: 9.8, ease: FEATHER }}
        >
          {t('hero_close')}
        </motion.div>

        <ScrollHint label={t('scroll_hint')} delay={11.0} />
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
      .hero-name-humble {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(2.5rem, 5vw, 4rem);
        line-height: 1.05;
        font-style: italic;
        font-weight: 400;
        letter-spacing: -0.01em;
        color: rgba(255, 255, 255, 0.96);
        text-align: center;
        /* no gradient — humble pure white signature feel */
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
      }
    `}</style>
  );
}
