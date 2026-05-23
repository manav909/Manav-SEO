/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChColdOpen.tsx
   Chapter 00 — Cold Open. Eternal Spring.

   Grand entry. The founder arrives as the protagonist of the document
   — not as a footnote on the brand.

   Two visual peaks, in order:
     PEAK 1 — MANAV (the human, the architect, the operator)
     PEAK 2 — S.E.A.S.O.N. (his work, the artifact)

   Between them, a theatrical "— presents —" transition that makes the
   relationship explicit. The eye lands on the founder before the brand,
   every time the page loads.

   Composition top-to-bottom:
     1. Coordinate mark      SEO SEASON · VOL. I · 2026
     2. Epigraph             "Every system. Every line. One architect."
     3. M A N A V            Letter-by-letter, the dominant typography
     4. Role triplet         ARCHITECT · OPERATOR · FOUNDER
     5. Transition           — presents —
     6. S.E.A.S.O.N.         Letter-by-letter, scaled down from prior
     7. Acronym recital      Three weighty manifesto declarations
     8. Agency positioning   An SEO agency that operates on its own...
     9. Sub                  Thinks in seasons. Verified in minutes.
    10. Scroll cue           BEGIN ↓

   Total reveal pacing: ~8.5s. A real title-sequence cadence.
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
  const ref    = useRef<HTMLElement>(null);

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
        className="cold-open-stage cold-open-stage-grand"
        style={{ rotateX: tiltX, rotateY: tiltY, transformPerspective: 1400 }}
      >
        {/* ─── 1. COORDINATE MARK ────────────────────────────── */}
        <motion.div
          className="coord-mark"
          initial={{ opacity: 0, letterSpacing: '0.55em' }}
          animate={{ opacity: 0.7, letterSpacing: '0.34em' }}
          transition={{ duration: 1.6, ease: FEATHER }}
        >
          <span className="coord-rule" />
          <span className="coord-segment">SEO SEASON</span>
          <span className="coord-dot">·</span>
          <span className="coord-segment">VOL. I</span>
          <span className="coord-dot">·</span>
          <span className="coord-segment">2026</span>
          <span className="coord-rule" />
        </motion.div>

        {/* ─── 2. EPIGRAPH ───────────────────────────────────── */}
        <motion.div
          className="hero-epigraph mt-10"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 0.82, y: 0 }}
          transition={{ duration: 1.5, delay: 0.8, ease: FEATHER }}
        >
          {t('hero_epigraph')}
        </motion.div>

        {/* ─── 3. MANAV NAME — PEAK 1 ────────────────────────── */}
        <div className="hero-name-wrap mt-10">
          <NameReveal name={t('hero_founder_name')} delay={1.7} />
        </div>

        {/* ─── 4. ROLE TRIPLET ───────────────────────────────── */}
        <motion.div
          className="hero-roles mt-6"
          initial={{ opacity: 0, letterSpacing: '0.45em' }}
          animate={{ opacity: 0.9, letterSpacing: '0.22em' }}
          transition={{ duration: 1.6, delay: 3.6, ease: FEATHER }}
        >
          {t('hero_roles')}
        </motion.div>

        {/* ─── 5. PRESENTS TRANSITION ────────────────────────── */}
        <motion.div
          className="hero-presents mt-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ duration: 1.2, delay: 4.4, ease: FEATHER }}
        >
          <span className="presents-rule" />
          <span className="presents-word">{t('hero_transition')}</span>
          <span className="presents-rule" />
        </motion.div>

        {/* ─── 6. BRAND REVEAL — PEAK 2 ──────────────────────── */}
        <div className="cold-open-brand mt-8">
          <BrandReveal delay={5.0} />
        </div>

        {/* ─── 7. ACRONYM RECITAL ────────────────────────────── */}
        <motion.div
          className="recital mt-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 6.4, ease: FEATHER }}
          key={lang}
        >
          <AcronymRecital t={t} delay={6.4} />
        </motion.div>

        {/* ─── 8. KICKER (AGENCY POSITIONING) ────────────────── */}
        <motion.div
          className="cold-open-kicker-xl mt-16"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4, delay: 7.6, ease: FEATHER }}
        >
          {t('hero_kicker')}
        </motion.div>

        {/* ─── 9. SUB ────────────────────────────────────────── */}
        <motion.div
          className="cold-open-sub-xl mt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.78, y: 0 }}
          transition={{ duration: 1.2, delay: 8.1, ease: FEATHER }}
        >
          {t('hero_sub')}
        </motion.div>

        <ScrollHint label={t('scroll_hint')} delay={9.0} />
      </motion.div>
    </section>
  );
}

/* ─── NAME REVEAL — slower & weightier than the brand letters ────
   Each character takes 1.4s with a 0.18s stagger, blur-clears from
   10px. Visual peak of the entire document. */
function NameReveal({ name, delay = 0 }: { name: string; delay?: number }) {
  return (
    <div className="name-reveal" aria-label={name}>
      {Array.from(name).map((ch, i) => (
        <motion.span
          key={i}
          className="name-letter"
          initial={{ opacity: 0, y: 40, filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: 0,  filter: 'blur(0px)'  }}
          transition={{
            duration: 1.4,
            ease: FEATHER,
            delay: delay + i * 0.18,
          }}
        >
          {ch}
        </motion.span>
      ))}
    </div>
  );
}

/* ─── BRAND REVEAL — slightly faster and smaller now that MANAV
   is the primary peak. */
function BrandReveal({ delay = 0 }: { delay?: number }) {
  const letters = ['S', '.', 'E', '.', 'A', '.', 'S', '.', 'O', '.', 'N', '.'];
  return (
    <div className="brand-reveal" aria-label="S.E.A.S.O.N.">
      {letters.map((ch, i) => (
        <motion.span
          key={i}
          className={ch === '.' ? 'brand-dot' : 'brand-letter'}
          initial={{ opacity: 0, y: 26, filter: 'blur(7px)' }}
          animate={{ opacity: 1, y: 0,  filter: 'blur(0px)' }}
          transition={{
            duration: 1.0,
            ease: FEATHER,
            delay: delay + i * 0.1,
          }}
        >
          {ch}
        </motion.span>
      ))}
    </div>
  );
}

/* ─── ACRONYM RECITAL ─────────────────────────────────────────── */
function AcronymRecital({ t, delay = 0 }: { t: TFn; delay?: number }) {
  const lines: Array<{ prefix: string; phrase: string }> = [
    { prefix: 'S.E.', phrase: t('phrase_strat_exec') },
    { prefix: 'A.S.', phrase: t('phrase_anal_supp')  },
    { prefix: 'O.N.', phrase: t('phrase_op_net')     },
  ];
  return (
    <div className="recital-stack">
      {lines.map((l, i) => (
        <motion.div
          key={i}
          className="recital-line"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, ease: FEATHER, delay: delay + i * 0.22 }}
        >
          <span className="recital-prefix">{l.prefix}</span>
          <span className="recital-rule" />
          <span className="recital-phrase">{l.phrase}</span>
        </motion.div>
      ))}
    </div>
  );
}

/* ─── STYLES ──────────────────────────────────────────────────── */

function ColdOpenStyles() {
  return (
    <style>{`
      /* ─── STAGE ────────────────────────────────────────────── */
      .cold-open-stage-grand {
        padding: 4rem 0 2rem 0;
      }

      /* ─── 1. COORDINATE MARK ───────────────────────────────── */
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

      /* ─── 2. EPIGRAPH ──────────────────────────────────────── */
      .hero-epigraph {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.1rem, 1.7vw, 1.5rem);
        line-height: 1.5;
        font-style: italic;
        letter-spacing: -0.005em;
        color: var(--m-ink-medium);
        max-width: 36ch;
        margin-left: auto;
        margin-right: auto;
      }

      /* ─── 3. MANAV NAME — PEAK 1 ───────────────────────────── */
      .hero-name-wrap {
        display: flex;
        justify-content: center;
      }
      .name-reveal {
        display: flex;
        justify-content: center;
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(4.8rem, 12vw, 11.5rem);
        line-height: 0.94;
        letter-spacing: -0.045em;
        font-weight: 400;
      }
      .name-letter {
        display: inline-block;
        background: linear-gradient(180deg,
          rgba(255, 255, 255, 1) 0%,
          rgba(255, 255, 255, 0.95) 35%,
          hsla(188, 80%, 78%, 0.85) 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        text-transform: uppercase;
      }

      /* ─── 4. ROLE TRIPLET ─────────────────────────────────── */
      .hero-roles {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(0.72rem, 1.05vw, 0.92rem);
        font-weight: 700;
        text-transform: uppercase;
        color: hsla(188, 75%, 72%, 0.95);
        text-align: center;
      }

      /* ─── 5. PRESENTS TRANSITION ──────────────────────────── */
      .hero-presents {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1.2rem;
      }
      .presents-word {
        font-family: ui-serif, Georgia, serif;
        font-size: 0.92rem;
        font-style: italic;
        color: var(--m-ink-soft);
        letter-spacing: 0.06em;
      }
      .presents-rule {
        display: inline-block;
        width: 48px;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--m-hairline-s), transparent);
      }

      /* ─── 6. BRAND — PEAK 2 (scaled down from prior version) ── */
      .cold-open-stage-grand .brand-reveal {
        font-size: clamp(2.8rem, 7.5vw, 7rem);
      }

      /* ─── 7. RECITAL ──────────────────────────────────────── */
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
        background: linear-gradient(90deg, transparent, hsla(188, 60%, 70%, 0.35), transparent);
        align-self: center;
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
      }

      /* ─── 8. KICKER ───────────────────────────────────────── */
      .cold-open-kicker-xl {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.55rem, 2.8vw, 2.1rem);
        line-height: 1.35;
        color: var(--m-ink-strong);
        font-style: italic;
        letter-spacing: -0.01em;
        max-width: 44ch;
        margin-left: auto;
        margin-right: auto;
      }

      /* ─── 9. SUB ──────────────────────────────────────────── */
      .cold-open-sub-xl {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(0.92rem, 1.4vw, 1.05rem);
        color: var(--m-ink-medium);
        letter-spacing: 0.04em;
        max-width: 42ch;
        margin-left: auto;
        margin-right: auto;
      }

      /* ─── RESPONSIVE ──────────────────────────────────────── */
      @media (max-width: 880px) {
        .name-reveal     { font-size: clamp(3.2rem, 14vw, 5.5rem); }
        .cold-open-stage-grand .brand-reveal { font-size: clamp(2.2rem, 9vw, 4rem); }
        .recital-phrase  { font-size: 1.15rem; white-space: normal; }
        .recital-line    { grid-template-columns: 3.4rem 18px 1fr; gap: 0.7rem; }
      }
      @media (max-width: 560px) {
        .coord-mark      { font-size: 0.55rem; gap: 0.45rem; letter-spacing: 0.22em; flex-wrap: wrap; }
        .coord-rule      { width: 18px; }
        .recital-line    { grid-template-columns: 1fr; gap: 0.15rem; }
        .recital-prefix  { text-align: center; }
        .recital-rule    { display: none; }
        .recital-phrase  { text-align: center; }
        .hero-presents   { gap: 0.8rem; }
        .presents-rule   { width: 28px; }
      }
    `}</style>
  );
}
