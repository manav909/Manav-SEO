/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChFounder.tsx
   Chapter 11 — A Letter from the Founder. Harvest (continuing).

   All paragraphs localized: founder_para_1..6 + founder_final_1..2.
   Signoff "— Manav" stays hardcoded (a proper name, not text).
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

const PARA_KEYS = [
  'founder_para_1',
  'founder_para_2',
  'founder_para_3',
  'founder_para_4',
  'founder_para_5',
  'founder_para_6',
] as const;

const FINAL_KEYS = ['founder_final_1', 'founder_final_2'] as const;

export function ChFounder({ t }: { t: TFn }) {
  return (
    <ChapterShell id="founder" no="11" season="harvest" titleKey="ch11" t={t}>
      <FounderStyles />

      <motion.blockquote className="founder-letter mt-10">
        {PARA_KEYS.map((key, i) => (
          <motion.p
            key={key}
            className="founder-para"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 1.2, ease: FEATHER, delay: 0.2 + i * 0.2 }}
          >
            {t(key)}
          </motion.p>
        ))}

        {FINAL_KEYS.map((key, i) => (
          <motion.p
            key={key}
            className="founder-para founder-para-final"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 1.6, ease: FEATHER, delay: 1.2 + i * 0.4 }}
          >
            {t(key)}
          </motion.p>
        ))}

        <motion.p
          className="founder-signoff"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.85 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ duration: 1.6, ease: FEATHER, delay: 2.4 }}
        >
          — Manav
        </motion.p>
      </motion.blockquote>
    </ChapterShell>
  );
}

function FounderStyles() {
  return (
    <style>{`
      .founder-letter {
        max-width: 56ch;
        margin: 3rem 0 0 0;
        position: relative;
        padding: 0 0 0 1.5rem;
        border-left: 0.5px solid hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.35);
      }
      .founder-para {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.25rem;
        line-height: 1.7;
        color: var(--m-ink-medium);
        margin: 0 0 1.6rem 0;
      }
      .founder-para:first-of-type {
        font-size: 1.55rem;
        line-height: 1.45;
        color: var(--m-ink-strong);
        font-style: italic;
        letter-spacing: -0.01em;
      }
      .founder-para-final {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.7rem;
        line-height: 1.4;
        font-style: italic;
        color: var(--m-ink-strong);
        margin-bottom: 0.6rem;
      }
      .founder-para-final + .founder-para-final {
        margin-top: 0;
      }
      .founder-signoff {
        margin-top: 2.5rem;
        font-family: ui-serif, Georgia, serif;
        font-size: 1.1rem;
        color: var(--m-ink-medium);
        letter-spacing: 0.04em;
      }
      @media (max-width: 720px) {
        .founder-letter   { padding-left: 1rem; }
        .founder-para     { font-size: 1.1rem; }
        .founder-para:first-of-type { font-size: 1.3rem; }
        .founder-para-final { font-size: 1.4rem; }
      }
    `}</style>
  );
}
