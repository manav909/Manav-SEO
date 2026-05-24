/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChJourney.tsx
   Chapter 05 — A Client's Journey. Summer (continuing).

   All prose localized: journey_intro + journey_N_when, _title, _body
   for N=1..7.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

const STEP_INDICES = [1, 2, 3, 4, 5, 6, 7] as const;

export function ChJourney({ t }: { t: TFn }) {
  return (
    <ChapterShell id="journey" no="05" season="summer" titleKey="ch05" t={t}>
      <JourneyStyles />

      <Prose delay={0.4}>{t('journey_intro')}</Prose>

      <ol className="journey-stack mt-14">
        {STEP_INDICES.map((n, i) => (
          <JourneyStep
            key={n}
            when={t(`journey_${n}_when`)}
            title={t(`journey_${n}_title`)}
            body={t(`journey_${n}_body`)}
            index={i}
            isLast={i === STEP_INDICES.length - 1}
          />
        ))}
      </ol>
    </ChapterShell>
  );
}

function JourneyStep({
  when, title, body, index, isLast,
}: {
  when:   string;
  title:  string;
  body:   string;
  index:  number;
  isLast: boolean;
}) {
  return (
    <motion.li
      className="journey-step"
      initial={{ opacity: 0, x: -16 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 1.0, ease: FEATHER, delay: 0.1 + index * 0.07 }}
    >
      <div className="journey-spine">
        <div className="journey-node" />
        {!isLast && <div className="journey-line" />}
      </div>
      <div className="journey-content">
        <div className="journey-when">{when}</div>
        <div className="journey-title">{title}</div>
        <div className="journey-body">{body}</div>
      </div>
    </motion.li>
  );
}

function JourneyStyles() {
  return (
    <style>{`
      .journey-stack {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .journey-step {
        display: grid;
        grid-template-columns: 80px 1fr;
        gap: 1.5rem;
      }
      .journey-spine {
        position: relative;
        display: flex; flex-direction: column;
        align-items: center;
        padding-top: 0.4rem;
      }
      .journey-node {
        width: 11px; height: 11px;
        border-radius: 50%;
        background: hsla(var(--ch-hue), var(--ch-sat), 70%, 0.95);
        box-shadow: 0 0 14px hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.6);
        flex-shrink: 0;
      }
      .journey-line {
        width: 1px;
        flex: 1;
        background: linear-gradient(180deg,
          hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.4),
          hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.05));
        margin-top: 0.4rem;
      }
      .journey-content {
        padding: 0 0 2.4rem 0;
      }
      .journey-when {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: hsla(var(--ch-hue), var(--ch-sat), 75%, 0.95);
        margin-bottom: 0.4rem;
      }
      .journey-title {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.4rem;
        line-height: 1.3;
        color: var(--m-ink-strong);
        font-weight: 500;
        letter-spacing: -0.01em;
        margin-bottom: 0.6rem;
      }
      .journey-body {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.92rem;
        line-height: 1.6;
        color: var(--m-ink-medium);
        max-width: 56ch;
      }
      @media (max-width: 720px) {
        .journey-step { grid-template-columns: 56px 1fr; gap: 1rem; }
      }
    `}</style>
  );
}
