/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChFounder.tsx
   Chapter 11 — A Letter from the Founder. Harvest (continuing).

   Manav's voice. First person. The only chapter in the codex
   written in first person; every other chapter uses operator-grade
   third person. The shift is deliberate — it marks the moment the
   reader meets the person behind the architecture.

   Each paragraph reveals on scroll-in independently, with the two
   closing single-sentence paragraphs landing last. The signoff
   ("— Manav") arrives quietly at the end.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

const PARAS: string[] = [
  'I built SEO SEASON because I lived the problem from every side.',
  "As a client who couldn't tell what had been done. As an operator who couldn't prove what I'd done. As an observer of an industry that had quietly accepted opacity as a price of doing business.",
  "The fix wasn't more reports. More dashboards. More charts. The fix was a different shape of business — one where the work is verifiable as it happens. Where the data and the narrative are the same artifact. Where the client and the operator look at the same screen at the same hour.",
  'Two years of architecting. Twelve API functions. Fifty tables. Forty-two pages. Hundreds of decisions. One commitment.',
];

const PARAS_FINAL: string[] = [
  'This is what I wanted to exist.',
  'So I built it.',
];

export function ChFounder({ t }: { t: TFn }) {
  return (
    <ChapterShell id="founder" no="11" season="harvest" titleKey="ch11" t={t}>
      <FounderStyles />

      <motion.blockquote className="founder-letter mt-10">
        {PARAS.map((p, i) => (
          <motion.p
            key={i}
            className="founder-para"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 1.2, ease: FEATHER, delay: 0.2 + i * 0.2 }}
          >
            {p}
          </motion.p>
        ))}

        {PARAS_FINAL.map((p, i) => (
          <motion.p
            key={`f-${i}`}
            className="founder-para founder-para-final"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 1.6, ease: FEATHER, delay: 1.2 + i * 0.4 }}
          >
            {p}
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

/* ─── Inline styles for this chapter ─────────────────────────────── */

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
