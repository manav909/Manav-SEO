/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChFuture.tsx
   Chapter 13 — The Future Belongs to Builders. Eternal Spring.

   The closing chapter. Four prose blocks land in sequence, each
   slightly more forward-looking than the last. Then the closing CTA
   button — a single line of italic copy followed by a soft-bordered
   call-to-action that opens a mailto for now.

   The pacing here is the slowest of the entire codex. The reader
   has just finished twelve chapters; they need air at the end.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

export function ChFuture({ t }: { t: TFn }) {
  return (
    <ChapterShell id="future" no="13" season="eternal-spring" titleKey="ch13" t={t}>
      <FutureStyles />

      <Prose delay={0.4}>
        SEO has always rewarded patience and punished shortcuts. The next era —
        generative answers, LLM mentions, conversational queries — rewards the
        same things, just amplified.
      </Prose>

      <Prose delay={0.6}>
        Topical authority compounds. Schema that LLMs can parse matters more.
        Brand presence across training data matters more. Real expertise
        demonstrated through real content matters more. The fundamentals
        didn't change. The amplification did.
      </Prose>

      <Prose delay={0.8}>
        SEO SEASON is positioned for the next decade, not the last one.
        Multi-engine visibility. Schema-first architecture. Cluster authority
        that compounds. Honest reporting clients can take to their board
        without a translator.
      </Prose>

      <Prose delay={1.0}>
        The market will consolidate. Agencies running on PDF decks and
        rank-tracker screenshots will not survive 2027. AI-only platforms
        with no human accountability will be exposed by the first client
        who can't reach anyone when their traffic dips. The agencies that
        survive will look more like SEO SEASON — verifiable, auditable,
        accountable, with operators behind the work.
      </Prose>

      <Prose delay={1.2}>
        Few agencies are positioned for this era. Fewer are operating from
        infrastructure built to last it. Almost none are run by the person
        who designed every part of it. We are taking on new clients while
        the curve is still gentle.
      </Prose>

      <motion.div
        className="closing-cta mt-20"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 1.8, ease: FEATHER, delay: 0.4 }}
      >
        <div className="closing-line">{t('closing_cta')}</div>

        <motion.a
          href="mailto:hello@seoseason.com?subject=Becoming%20a%20client"
          className="closing-button mt-8"
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.4, ease: FEATHER }}
        >
          {t('join_cta')}
        </motion.a>
      </motion.div>
    </ChapterShell>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

function FutureStyles() {
  return (
    <style>{`
      .closing-cta {
        text-align: center;
        max-width: 50ch;
        margin: 5rem auto 0 auto;
      }
      .closing-line {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.55rem;
        line-height: 1.4;
        color: var(--m-ink-strong);
        font-style: italic;
        letter-spacing: -0.01em;
      }
      .closing-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.95rem 2.4rem;
        border-radius: 999px;
        background: linear-gradient(180deg,
          hsla(var(--ch-hue), 80%, 60%, 0.95),
          hsla(var(--ch-hue), 70%, 50%, 0.85));
        color: rgb(15, 20, 26);
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        text-decoration: none;
        box-shadow:
          0 18px 40px hsla(var(--ch-hue), 70%, 50%, 0.35),
          0 0 0 0.5px hsla(var(--ch-hue), 80%, 70%, 0.6) inset;
        transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .closing-button:hover {
        box-shadow:
          0 24px 50px hsla(var(--ch-hue), 70%, 50%, 0.5),
          0 0 0 0.5px hsla(var(--ch-hue), 90%, 80%, 0.8) inset;
      }
    `}</style>
  );
}
