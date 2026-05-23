/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChColdOpen.tsx
   Chapter 00 — Cold Open. Eternal Spring.

   The grand entry, properly staged. Trust is earned by the company
   first, then transferred to the founder via a deliberate reveal.

   Architecture: a five-act journey
     ACT 1  Coordinate mark                  document framing
     ACT 2  S.E.A.S.O.N. (PEAK 1)            the company arrives
              + acronym recital               what it stands for
              + kicker + sub                  agency positioning
              + intel callout                 proof of capability
     ACT 3  Pause + setup line                "infrastructure of this
                                                depth is usually a
                                                team's work."
     ACT 4  Pivot                             "This is one person's."
                                                — cyan italic display,
                                                the dramatic hinge
     ACT 5  MANAV (PEAK 2 — THE REVEAL)        the Iron Man moment
              + role triplet                  architect · engineer · operator
              + close                         "He designed it. He
                                                shipped it. He runs it."

   The audience meets the entity they may already trust, sees what
   it's built, hits the question implicit in "this is one person's,"
   and then meets the architect as the answer. Trust earned, then
   transferred.

   Total pacing: ~11s reveal sequence. A real title-sequence cadence.
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

        {/* ─── ACT 2a. BRAND REVEAL (PEAK 1) ───────────────── */}
        <div className="cold-open-brand mt-12">
          <BrandReveal delay={0.6} />
        </div>

        {/* ─── ACT 2b. RECITAL ────────────────────────────── */}
        <motion.div
          className="recital mt-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 2.2, ease: FEATHER }}
          key={lang}
        >
          <AcronymRecital t={t} delay={2.2} />
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

        {/* ─── ACT 2e. INTEL CALLOUT (proof of capability) ── */}
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

        {/* ─── ACT 4. PIVOT (the dramatic hinge) ───────────── */}
        <motion.div
          className="hero-reveal-pivot mt-6"
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0,  scale: 1     }}
          transition={{ duration: 1.6, delay: 7.0, ease: FEATHER }}
        >
          {t('hero_reveal_pivot')}
        </motion.div>

        {/* ─── ACT 5a. MANAV REVEAL (PEAK 2) ───────────────── */}
        <div className="hero-name-wrap mt-20">
          <NameReveal name={t('hero_founder_name')} delay={8.4} />
        </div>

        {/* ─── ACT 5b. ROLE TRIPLET ────────────────────────── */}
        <motion.div
          className="hero-roles mt-6"
          initial={{ opacity: 0, letterSpacing: '0.45em' }}
          animate={{ opacity: 0.92, letterSpacing: '0.22em' }}
          transition={{ duration: 1.4, delay: 9.6, ease: FEATHER }}
        >
          {t('hero_roles')}
        </motion.div>

        {/* ─── ACT 5c. CLOSE ──────────────────────────────── */}
        <motion.div
          className="hero-close mt-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.85, y: 0 }}
          transition={{ duration: 1.3, delay: 10.2, ease: FEATHER }}
        >
          {t('hero_close')}
        </motion.div>

        <ScrollHint label={t('scroll_hint')} delay={11.0} />
      </motion.div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NAME REVEAL — the Iron Man moment. Each character takes 1.4s
   with a 0.20s stagger, blur-clears from 14px. Dominant typography.
═══════════════════════════════════════════════════════════════ */
function NameReveal({ name, delay = 0 }: { name: string; delay?: number }) {
  return (
    <div className="name-reveal" aria-label={name}>
      {Array.from(name).map((ch, i) => (
        <motion.span
          key={i}
          className="name-letter"
          initial={{ opacity: 0, y: 44, filter: 'blur(14px)' }}
          animate={{ opacity: 1, y: 0,  filter: 'blur(0px)'  }}
          transition={{
            duration: 1.4,
            ease: FEATHER,
            delay: delay + i * 0.2,
          }}
        >
          {ch}
        </motion.span>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BRAND REVEAL — S.E.A.S.O.N. letter-by-letter, peak 1.
═══════════════════════════════════════════════════════════════ */
function BrandReveal({ delay = 0 }: { delay?: number }) {
  const letters = ['S', '.', 'E', '.', 'A', '.', 'S', '.', 'O', '.', 'N', '.'];
  return (
    <div className="brand-reveal" aria-label="S.E.A.S.O.N.">
      {letters.map((ch, i) => (
        <motion.span
          key={i}
          className={ch === '.' ? 'brand-dot' : 'brand-letter'}
          initial={{ opacity: 0, y: 28, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0,  filter: 'blur(0px)' }}
          transition={{
            duration: 1.1,
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

/* ═══════════════════════════════════════════════════════════════
   ACRONYM RECITAL — three weighty declarations.
═══════════════════════════════════════════════════════════════ */
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

      /* ─── BRAND (PEAK 1) ──────────────────────────────────── */
      .cold-open-stage-journey .brand-reveal {
        font-size: clamp(3.5rem, 10vw, 9rem);
      }

      /* ─── RECITAL ─────────────────────────────────────────── */
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

      /* ─── KICKER ──────────────────────────────────────────── */
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

      /* ─── SUB ─────────────────────────────────────────────── */
      .cold-open-sub-xl {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(0.92rem, 1.4vw, 1.05rem);
        color: var(--m-ink-medium);
        letter-spacing: 0.04em;
        max-width: 42ch;
        margin-left: auto;
        margin-right: auto;
      }

      /* ─── INTEL CALLOUT (capability proof) ───────────────── */
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

      /* ─── REVEAL SETUP (the buildup line) ───────────────── */
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

      /* ─── REVEAL PIVOT (the dramatic hinge) ─────────────── */
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

      /* ─── MANAV (PEAK 2 — the reveal) ──────────────────── */
      .hero-name-wrap {
        display: flex;
        justify-content: center;
      }
      .name-reveal {
        display: flex;
        justify-content: center;
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(5rem, 13vw, 12rem);
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

      /* ─── ROLE TRIPLET ────────────────────────────────── */
      .hero-roles {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(0.72rem, 1.05vw, 0.92rem);
        font-weight: 700;
        text-transform: uppercase;
        color: hsla(188, 75%, 72%, 0.95);
        text-align: center;
      }

      /* ─── CLOSE LINE ─────────────────────────────────── */
      .hero-close {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.05rem, 1.5vw, 1.25rem);
        line-height: 1.5;
        font-style: italic;
        color: var(--m-ink-strong);
        letter-spacing: 0.01em;
        max-width: 44ch;
        margin-left: auto;
        margin-right: auto;
      }

      /* ─── RESPONSIVE ───────────────────────────────────── */
      @media (max-width: 880px) {
        .cold-open-stage-journey .brand-reveal { font-size: clamp(2.4rem, 12vw, 4.5rem); }
        .name-reveal     { font-size: clamp(3.4rem, 15vw, 6rem); }
        .recital-phrase  { font-size: 1.1rem; white-space: normal; }
        .recital-line    { grid-template-columns: 3.4rem 18px 1fr; gap: 0.7rem; }
        .hero-reveal-pivot { font-size: clamp(1.4rem, 5vw, 2rem); }
      }
      @media (max-width: 560px) {
        .coord-mark      { font-size: 0.55rem; gap: 0.45rem; letter-spacing: 0.22em; flex-wrap: wrap; }
        .coord-rule      { width: 18px; }
        .recital-line    { grid-template-columns: 1fr; gap: 0.15rem; }
        .recital-prefix  { text-align: center; }
        .recital-rule    { display: none; }
        .recital-phrase  { text-align: center; }
      }
    `}</style>
  );
}
