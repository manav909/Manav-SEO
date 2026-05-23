/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChColdOpen.tsx
   Chapter 00 — Cold Open. Eternal Spring.

   Rebuilt for psychological impact. The original version was passive
   — "MEET" as a greeting, six tiny acronym pairs in a 2×3 grid, kicker
   too small to anchor the eye after the brand. This version is a
   typographic crescendo, not a checkbox.

   New composition (top to bottom):
     1. COORDINATE MARK
        SEO SEASON · VOL. I · 2026
        Tiny, tracked wide. Positions this as a document of substance,
        not a marketing page. (Replaces the soft "MEET".)

     2. BRAND REVEAL
        S.E.A.S.O.N. letter-by-letter, same animation as before.
        Hero element. Still the visual peak.

     3. ACRONYM RECITAL (the centerpiece)
        Three weighty manifesto-style declarations, each on its own line:
            S.E.   STRATEGIC EXECUTION
            A.S.   ANALYSIS SUPPORT
            O.N.   OPERATOR'S NETWORK
        Each line reveals sequentially with a 0.18s stagger. The phrases
        are rendered in display caps with a gradient (white → eternal-
        spring cyan), giving them their own visual weight.

     4. KICKER (scaled up 1.6×)
        "An operating system for search that thinks in seasons."
        Italic display serif. Now actually unmissable.

     5. SUB (parallel statement, kept)
        "Built for the moment search itself changed."
        Sans, slightly larger than before. Holds its own weight.

     6. SCROLL HINT
        Pulsing "BEGIN" + arrow at foot. Same.

   Crescendo shape:
     light → PEAK → heavy → medium-heavy → medium → light
   Resolves the eye into the scroll cue. No equal-weight plateau.
══════════════════════════════════════════════════════════════════════ */

import { useRef } from 'react';
import {
  motion, useMotionValue, useSpring, useReducedMotion,
} from 'framer-motion';
import type { Lang, TFn } from '../types';
import { FEATHER } from '../types';
import { ScrollHint } from '../shared';

export function ChColdOpen({ t, lang }: { t: TFn; lang: Lang }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const tiltX = useSpring(mouseY, { stiffness: 60, damping: 18, mass: 1.1 });
  const tiltY = useSpring(mouseX, { stiffness: 60, damping: 18, mass: 1.1 });

  const handleMouse = (e: React.MouseEvent) => {
    if (reduce) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
    mouseX.set(x * 6);
    mouseY.set(-y * 6);
  };

  const handleLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

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
        className="cold-open-stage"
        style={{ rotateX: tiltX, rotateY: tiltY, transformPerspective: 1400 }}
      >
        {/* ─── COORDINATE MARK ─────────────────────────────────── */}
        <motion.div
          className="coord-mark"
          initial={{ opacity: 0, letterSpacing: '0.55em' }}
          animate={{ opacity: 0.7, letterSpacing: '0.34em' }}
          transition={{ duration: 1.8, ease: FEATHER }}
        >
          <span className="coord-rule" />
          <span className="coord-segment">SEO SEASON</span>
          <span className="coord-dot">·</span>
          <span className="coord-segment">VOL. I</span>
          <span className="coord-dot">·</span>
          <span className="coord-segment">2026</span>
          <span className="coord-rule" />
        </motion.div>

        {/* ─── BRAND REVEAL ────────────────────────────────────── */}
        <div className="cold-open-brand mt-12">
          <BrandReveal delay={0.6} />
        </div>

        {/* ─── ACRONYM RECITAL — three manifesto declarations ──── */}
        <motion.div
          className="recital mt-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.4, delay: 2.6, ease: FEATHER }}
          key={lang}
        >
          <AcronymRecital t={t} />
        </motion.div>

        {/* ─── KICKER (scaled up) ──────────────────────────────── */}
        <motion.div
          className="cold-open-kicker-xl mt-20"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.7, delay: 4.0, ease: FEATHER }}
        >
          {t('hero_kicker')}
        </motion.div>

        {/* ─── SUB (parallel statement) ────────────────────────── */}
        <motion.div
          className="cold-open-sub-xl mt-5"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 0.82, y: 0 }}
          transition={{ duration: 1.4, delay: 4.6, ease: FEATHER }}
        >
          {t('hero_sub')}
        </motion.div>

        <ScrollHint label={t('scroll_hint')} delay={5.4} />
      </motion.div>
    </section>
  );
}

/* ─── Brand letter-by-letter reveal ───────────────────────────── */

function BrandReveal({ delay = 0 }: { delay?: number }) {
  const letters = ['S', '.', 'E', '.', 'A', '.', 'S', '.', 'O', '.', 'N', '.'];
  return (
    <div className="brand-reveal" aria-label="S.E.A.S.O.N.">
      {letters.map((ch, i) => (
        <motion.span
          key={i}
          className={ch === '.' ? 'brand-dot' : 'brand-letter'}
          initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{
            duration: 1.2,
            ease: FEATHER,
            delay: delay + i * 0.12,
          }}
        >
          {ch}
        </motion.span>
      ))}
    </div>
  );
}

/* ─── Acronym recital — three weighty declarations ────────────── */

function AcronymRecital({ t }: { t: TFn }) {
  const lines: Array<{ prefix: string; phrase: string }> = [
    { prefix: 'S.E.',  phrase: t('phrase_strat_exec') },
    { prefix: 'A.S.',  phrase: t('phrase_anal_supp')  },
    { prefix: 'O.N.',  phrase: t('phrase_op_net')     },
  ];
  return (
    <div className="recital-stack">
      {lines.map((l, i) => (
        <motion.div
          key={i}
          className="recital-line"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: FEATHER, delay: i * 0.22 }}
        >
          <span className="recital-prefix">{l.prefix}</span>
          <span className="recital-rule" />
          <span className="recital-phrase">{l.phrase}</span>
        </motion.div>
      ))}
    </div>
  );
}

/* ─── Inline styles ──────────────────────────────────────────── */

function ColdOpenStyles() {
  return (
    <style>{`
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
      .coord-segment {
        white-space: nowrap;
      }
      .coord-dot {
        color: hsla(188, 70%, 65%, 0.75);
        font-weight: 400;
        letter-spacing: 0;
      }
      .coord-rule {
        display: inline-block;
        width: 30px;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--m-hairline-s), transparent);
      }

      /* ─── RECITAL ──────────────────────────────────────────── */
      .recital-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.85rem;
      }
      .recital-line {
        display: grid;
        grid-template-columns: 5rem 32px 1fr;
        gap: 1.1rem;
        align-items: baseline;
        max-width: 620px;
        width: 100%;
      }
      .recital-prefix {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.22em;
        color: hsla(188, 75%, 70%, 0.85);
        text-align: right;
      }
      .recital-rule {
        height: 1px;
        background: linear-gradient(90deg,
          transparent,
          hsla(188, 60%, 70%, 0.35),
          transparent);
        align-self: center;
      }
      .recital-phrase {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.45rem, 2.6vw, 2.0rem);
        font-weight: 400;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        line-height: 1;
        color: var(--m-ink-strong);
        background: linear-gradient(180deg,
          rgba(255, 255, 255, 1),
          hsla(188, 65%, 78%, 0.72));
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        text-align: left;
        white-space: nowrap;
      }

      /* ─── KICKER (scaled up from original) ─────────────────── */
      .cold-open-kicker-xl {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.65rem, 3vw, 2.25rem);
        line-height: 1.35;
        color: var(--m-ink-strong);
        font-style: italic;
        letter-spacing: -0.01em;
        max-width: 42ch;
        margin-left: auto;
        margin-right: auto;
      }

      /* ─── SUB (parallel statement) ─────────────────────────── */
      .cold-open-sub-xl {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(0.95rem, 1.5vw, 1.1rem);
        color: var(--m-ink-medium);
        letter-spacing: 0.04em;
        max-width: 42ch;
        margin-left: auto;
        margin-right: auto;
      }

      /* ─── RESPONSIVE ───────────────────────────────────────── */
      @media (max-width: 720px) {
        .coord-mark {
          font-size: 0.55rem;
          gap: 0.45rem;
          letter-spacing: 0.24em;
          flex-wrap: wrap;
        }
        .coord-rule { width: 18px; }

        .recital-line {
          grid-template-columns: 3.4rem 18px 1fr;
          gap: 0.7rem;
        }
        .recital-prefix { font-size: 0.65rem; }
        .recital-phrase { font-size: 1.1rem; white-space: normal; }
      }

      @media (max-width: 480px) {
        .recital-line {
          grid-template-columns: 1fr;
          gap: 0.15rem;
        }
        .recital-prefix { text-align: center; }
        .recital-rule { display: none; }
        .recital-phrase { text-align: center; }
      }
    `}</style>
  );
}
