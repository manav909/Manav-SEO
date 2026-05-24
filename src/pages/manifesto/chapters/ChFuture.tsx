/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChFuture.tsx
   Chapter 14 — The Future Belongs to Builders. Eternal Spring.

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
    <ChapterShell id="future" no="14" season="eternal-spring" titleKey="ch14" t={t}>
      <FutureStyles />

      <Prose delay={0.4}>{t('future_1')}</Prose>

      <Prose delay={0.6}>{t('future_2')}</Prose>

      <Prose delay={0.8}>{t('future_3')}</Prose>

      <Prose delay={1.0}>{t('future_4')}</Prose>

      <Prose delay={1.2}>{t('future_5')}</Prose>

      <motion.div
        className="closing-cta mt-20"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 1.8, ease: FEATHER, delay: 0.4 }}
      >
        <div className="closing-line">{t('closing_cta')}</div>

        <div className="closing-actions mt-8">
          {/* Primary — high-intent capture */}
          <motion.a
            href="mailto:hello@seoseason.com?subject=Becoming%20a%20client"
            className="closing-button closing-button-primary"
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.4, ease: FEATHER }}
          >
            {t('join_cta')}
          </motion.a>

          {/* Secondary — lower-commitment, warm lead capture */}
          <motion.a
            href="mailto:hello@seoseason.com?subject=Free%20audit%20request&body=Site%20URL%3A%20%0AKey%20questions%20I%20want%20answered%3A%20"
            className="closing-button closing-button-ghost"
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.4, ease: FEATHER }}
          >
            {t('audit_cta')}
          </motion.a>
        </div>
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
        max-width: 56ch;
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
      .closing-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 0.9rem 1.1rem;
      }
      .closing-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.95rem 2.2rem;
        border-radius: 999px;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        text-decoration: none;
        cursor: pointer;
        transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        border: none;
      }
      /* Primary — high-intent capture, full visual weight */
      .closing-button-primary {
        background: linear-gradient(180deg,
          hsla(var(--ch-hue), 80%, 60%, 0.95),
          hsla(var(--ch-hue), 70%, 50%, 0.85));
        color: rgb(15, 20, 26);
        box-shadow:
          0 18px 40px hsla(var(--ch-hue), 70%, 50%, 0.35),
          0 0 0 0.5px hsla(var(--ch-hue), 80%, 70%, 0.6) inset;
      }
      .closing-button-primary:hover {
        box-shadow:
          0 24px 50px hsla(var(--ch-hue), 70%, 50%, 0.5),
          0 0 0 0.5px hsla(var(--ch-hue), 90%, 80%, 0.8) inset;
      }
      /* Ghost — secondary + tertiary, lighter weight so they don't
         compete with the primary call to action */
      .closing-button-ghost {
        background: transparent;
        color: var(--m-ink-strong);
        border: 0.5px solid hsla(var(--ch-hue), 50%, 65%, 0.45);
        box-shadow: inset 0 0 0 0.5px hsla(var(--ch-hue), 50%, 65%, 0.08);
      }
      .closing-button-ghost:hover {
        border-color: hsla(var(--ch-hue), 70%, 75%, 0.85);
        background: hsla(var(--ch-hue), 50%, 50%, 0.06);
        box-shadow: inset 0 0 0 0.5px hsla(var(--ch-hue), 70%, 75%, 0.4);
      }

      @media (max-width: 560px) {
        .closing-actions { flex-direction: column; gap: 0.7rem; }
        .closing-button { width: 100%; max-width: 280px; }
      }
    `}</style>
  );
}
