/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChColdOpen.tsx
   Chapter 00 — the opening. Eternal Spring.

   Visual moments:
     1. "Meet" overline drifts in with letter-spacing easing.
     2. S.E.A.S.O.N. letters reveal one-by-one, each fading in
        from below with a slight upward translate + blur clear.
     3. The acronym expand grid appears, mapping each letter to
        its localized word (re-keys on language change).
     4. Hero kicker (one sentence) + sub (second sentence).
     5. Scroll hint pulses at the foot of the viewport.

   3D interaction: the entire stage receives a soft mouse-tracked
   tilt (rotateX/rotateY via spring) on devices with a pointer.
   Reduced-motion users get a static, fully-rendered version.
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
    mouseX.set(x * 7);
    mouseY.set(-y * 7);
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
      <motion.div
        className="cold-open-stage"
        style={{ rotateX: tiltX, rotateY: tiltY, transformPerspective: 1400 }}
      >
        <motion.div
          className="overline mb-8 cold-open-meet"
          initial={{ opacity: 0, letterSpacing: '0.5em' }}
          animate={{ opacity: 0.7, letterSpacing: '0.32em' }}
          transition={{ duration: 1.8, ease: FEATHER }}
        >
          {t('meet')}
        </motion.div>

        <div className="cold-open-brand">
          <BrandReveal delay={0.4} />
        </div>

        <motion.div
          className="cold-open-expand mt-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.8, delay: 2.4, ease: FEATHER }}
          key={lang} // re-trigger AcronymExpand stagger on lang switch
        >
          <AcronymExpand t={t} />
        </motion.div>

        <motion.div
          className="cold-open-kicker mt-14"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.6, delay: 3.4, ease: FEATHER }}
        >
          {t('hero_kicker')}
        </motion.div>

        <motion.div
          className="cold-open-sub mt-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 0.7, y: 0 }}
          transition={{ duration: 1.4, delay: 3.9, ease: FEATHER }}
        >
          {t('hero_sub')}
        </motion.div>

        <ScrollHint label={t('scroll_hint')} delay={4.6} />
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

/* ─── Acronym expand grid (3-column) ──────────────────────────── */

function AcronymExpand({ t }: { t: TFn }) {
  const pairs: Array<{ letter: string; word: string }> = [
    { letter: 'S', word: t('s_letter')  },
    { letter: 'E', word: t('e_letter')  },
    { letter: 'A', word: t('a_letter')  },
    { letter: 'S', word: t('s2_letter') },
    { letter: 'O', word: t('o_letter')  },
    { letter: 'N', word: t('n_letter')  },
  ];
  return (
    <div className="acronym-expand">
      {pairs.map((p, i) => (
        <motion.div
          key={i}
          className="acronym-pair"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.9, ease: FEATHER, delay: i * 0.1 }}
        >
          <span className="acronym-letter">{p.letter}</span>
          <span className="acronym-word">{p.word}</span>
        </motion.div>
      ))}
    </div>
  );
}
