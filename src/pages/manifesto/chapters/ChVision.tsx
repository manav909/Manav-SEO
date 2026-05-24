/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChVision.tsx
   Chapter 02 — The Vision. Spring.

   All prose localized via copy.ts: vision_quote, vision_attribution,
   vision_1..4.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell, Prose, FoundingQuote } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

export function ChVision({ t }: { t: TFn }) {
  return (
    <ChapterShell id="vision" no="02" season="spring" titleKey="ch02" t={t}>
      <VisionStyles />

      <FoundingQuote delay={0.4}>{t('vision_quote')}</FoundingQuote>

      <motion.div
        className="founding-attribution"
        initial={{ opacity: 0, x: -8 }}
        whileInView={{ opacity: 0.75, x: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 1.2, ease: FEATHER, delay: 0.9 }}
      >
        {t('vision_attribution')}
      </motion.div>

      <Prose delay={1.1}>{t('vision_1')}</Prose>
      <Prose delay={1.3}>{t('vision_2')}</Prose>
      <Prose delay={1.5}>{t('vision_3')}</Prose>
      <Prose delay={1.7}>{t('vision_4')}</Prose>
    </ChapterShell>
  );
}

function VisionStyles() {
  return (
    <style>{`
      .founding-attribution {
        margin: 1.5rem 0 0 3rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: hsla(var(--ch-hue), 55%, 75%, 0.95);
      }
      @media (max-width: 720px) {
        .founding-attribution { margin-left: 1.5rem; }
      }
    `}</style>
  );
}
