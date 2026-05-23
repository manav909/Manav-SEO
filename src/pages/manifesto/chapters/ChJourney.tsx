/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChJourney.tsx
   Chapter 05 — A Client's Journey. Summer (continuing).

   Vertical timeline. Each step is a row: a node + connecting spine
   on the left, a labeled milestone on the right. Steps reveal in
   sequence as the user scrolls past them.

   Times shown are the actual cadences SEO SEASON operates on. Not
   marketing horizons.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

interface Step {
  when:  string;
  title: string;
  body:  string;
}

const STEPS: Step[] = [
  {
    when:  'Day 0',
    title: 'Onboarding',
    body:  "Connect Google Search Console and Google Analytics 4. Baseline snapshot taken. Project created in the system. The clock starts here — not at agency-promised date.",
  },
  {
    when:  'Week 1',
    title: 'Audit & cluster proposal',
    body:  "Technical audit runs against the live site. First campaign's cluster map proposed with head terms, supporting terms, and intent gaps named. You review and refine. Nothing ships without your sign-off.",
  },
  {
    when:  'Weeks 2-4',
    title: 'First pillar cycle',
    body:  'Content drafted against the cluster map. Internal links inserted. Off-page outreach begins. Monitoring baseline snapshot frozen. Every action logged with a timestamp and a source.',
  },
  {
    when:  'Month 2',
    title: 'First measurable movement',
    body:  'Visibility pulse chart shows what changed. Keyword movers report names winners and losers — both, by name, with deltas. Plateau pages flagged for refinement.',
  },
  {
    when:  'Month 3',
    title: 'Second campaign starts',
    body:  'First campaign continues compounding on its own cadence. Second campaign repeats the five-pillar cycle on a different topic. Portfolio building begins; each campaign at its own stage.',
  },
  {
    when:  'Month 6',
    title: 'Shape becomes visible',
    body:  "Click curve emerges. Hero pages identified by data, not opinion. Conversion attribution where GA4 events exist; gaps named honestly where they don't.",
  },
  {
    when:  'Month 12',
    title: 'Portfolio maturity',
    body:  'Each campaign at a different stage. Some defended. Some climbing. Some retired. The work compounds because the architecture compounds — not because anyone got lucky.',
  },
];

export function ChJourney({ t }: { t: TFn }) {
  return (
    <ChapterShell id="journey" no="05" season="summer" titleKey="ch05" t={t}>
      <JourneyStyles />

      <Prose delay={0.4}>
        What happens when a client signs. Step by step. The journey is
        deterministic — surprises are reported, not hidden, and the milestones
        below describe a cadence that's already running on existing engagements.
      </Prose>

      <ol className="journey-stack mt-14">
        {STEPS.map((s, i) => (
          <JourneyStep
            key={i}
            step={s}
            index={i}
            isLast={i === STEPS.length - 1}
          />
        ))}
      </ol>
    </ChapterShell>
  );
}

function JourneyStep({
  step, index, isLast,
}: {
  step:   Step;
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
        <div className="journey-when">{step.when}</div>
        <div className="journey-title">{step.title}</div>
        <div className="journey-body">{step.body}</div>
      </div>
    </motion.li>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

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
