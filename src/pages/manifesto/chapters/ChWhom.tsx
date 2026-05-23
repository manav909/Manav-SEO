/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChWhom.tsx
   Chapter 10 — For Whom This Was Built. Harvest.

   Five audiences, each gets a paragraph naming what they get out
   of SEO SEASON specifically. Rendered as a vertical stack of
   blocks; each block has a small marker (an opening punctuation
   echo) and the audience's title in serif.

   The audiences appear in the order their stake compounds:
     Clients          (pay for it)
     Your customers   (benefit from it)
     Investors        (verify it)
     Stakeholders     (extract value from it)
     The team         (build inside it)
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

interface Audience {
  title: string;
  body:  string;
}

const AUDIENCES: Audience[] = [
  {
    title: 'Clients',
    body:  "See exactly what you're paying for. Every action timestamped. Every metric source-cited. Every gap acknowledged. Open the dashboard your account manager opens — same view, same data, same hour of the day.",
  },
  {
    title: 'Your customers',
    body:  'Find your pages because the pages answer their question, not because we tricked the algorithm. Trust earned upstream becomes conversion downstream. The work is invisible to them; the benefit is not.',
  },
  {
    title: 'Investors',
    body:  'Verify operational rigor through audit logs, monitoring cadence, and methodology that can be reproduced by anyone with read access to the system. No founder story required to interpret the dashboard.',
  },
  {
    title: 'Stakeholders',
    body:  'Request a custom view. Get one in twenty-four hours. Every page in this software is a query away from a shareable, sourced report — for boards, for press, for partners, for compliance.',
  },
  {
    title: 'The team',
    body:  "Work in a system that respects the time it took to build. Architectural rigor isn't a tax. It's the asset that makes everything else cheap. New hires read the codebase and understand the company in a week.",
  },
];

export function ChWhom({ t }: { t: TFn }) {
  return (
    <ChapterShell id="whom" no="10" season="harvest" titleKey="ch10" t={t}>
      <WhomStyles />

      <Prose delay={0.4}>
        Five audiences. Each gets a different surface, but all the same
        underlying truth. The software wasn't built around a buyer persona —
        it was built around the work, and the audiences are downstream of that.
      </Prose>

      <div className="whom-stack mt-14">
        {AUDIENCES.map((a, i) => (
          <WhomBlock key={i} audience={a} index={i} />
        ))}
      </div>
    </ChapterShell>
  );
}

function WhomBlock({ audience, index }: { audience: Audience; index: number }) {
  return (
    <motion.div
      className="whom-block"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 1.1, ease: FEATHER, delay: 0.1 + index * 0.08 }}
    >
      <div className="whom-marker" />
      <div className="whom-body">
        <div className="whom-title">{audience.title}</div>
        <div className="whom-text">{audience.body}</div>
      </div>
    </motion.div>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

function WhomStyles() {
  return (
    <style>{`
      .whom-stack {
        display: flex;
        flex-direction: column;
        gap: 1.8rem;
      }
      .whom-block {
        display: grid;
        grid-template-columns: 28px 1fr;
        gap: 1.4rem;
        align-items: flex-start;
        padding: 1.2rem 0;
        border-top: 0.5px solid var(--m-hairline);
      }
      .whom-block:first-of-type {
        border-top: none;
      }
      .whom-marker {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.95);
        box-shadow: 0 0 14px hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.5);
        margin-top: 0.6rem;
        margin-left: 8px;
      }
      .whom-title {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.4rem;
        line-height: 1.3;
        color: var(--m-ink-strong);
        font-weight: 500;
        letter-spacing: -0.015em;
        margin-bottom: 0.6rem;
      }
      .whom-text {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.08rem;
        line-height: 1.65;
        color: var(--m-ink-medium);
        max-width: 60ch;
      }
      @media (max-width: 720px) {
        .whom-block { grid-template-columns: 20px 1fr; gap: 1rem; }
      }
    `}</style>
  );
}
