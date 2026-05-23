/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChEthics.tsx
   Chapter 08 — What We Will & Won't Do. Autumn.

   Two columns. Hard operating constraints, not stated preferences.
   The software is built so we couldn't quietly break these even if
   we wanted to.

     LEFT  We will       (emerald checks)
     RIGHT We will not   (rose x marks)

   These are the lines a client can hold us to. If we cross any of
   them, the client has grounds to terminate immediately. Stating
   them publicly is the only honest commitment.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

const WILL: string[] = [
  'Show you the raw data alongside the interpreted version.',
  "Tell you when something didn't work — and why.",
  "Recommend you do less work, not more, when more wouldn't help.",
  "Decline campaigns that don't make commercial sense for you.",
  "Cite our sources, even when it would be easier not to.",
  'Document the methodology behind every metric we display.',
  'Acknowledge the gaps in our own data, honestly and by name.',
];

const WONT: string[] = [
  'Buy links.',
  'Purchase reviews or astroturf social signals.',
  'Generate AI content farms.',
  "Make claims we can't verify in the data layer.",
  'Use psychological pressure tactics — fake urgency, contrived scarcity.',
  'Promise rankings. Rankings are commitments search engines make, not us.',
  'Retroactively recompute baselines to make our work look better.',
];

export function ChEthics({ t }: { t: TFn }) {
  return (
    <ChapterShell id="ethics" no="08" season="autumn" titleKey="ch08" t={t}>
      <EthicsStyles />

      <Prose delay={0.4}>
        These aren't preferences. They are operating constraints. The software
        is built so we couldn't break them quietly even if we wanted to —
        every action writes to an audit trail the client can read.
      </Prose>

      <div className="ethics-grid mt-14">
        <div className="ethics-col">
          <div className="ethics-col-label ethics-will">We will</div>
          {WILL.map((line, i) => (
            <EthicsLine key={i} text={line} kind="will" index={i} />
          ))}
        </div>
        <div className="ethics-col">
          <div className="ethics-col-label ethics-wont">We will not</div>
          {WONT.map((line, i) => (
            <EthicsLine key={i} text={line} kind="wont" index={i} />
          ))}
        </div>
      </div>

      <Prose delay={1.6} className="mt-14">
        The list isn't aspirational. It's enforceable. Every commitment on the
        left side has a corresponding mechanism in the system that makes it
        observable; every prohibition on the right has a corresponding absence
        of capability — there is no UI for buying links in this software.
      </Prose>
    </ChapterShell>
  );
}

function EthicsLine({
  text, kind, index,
}: {
  text: string;
  kind: 'will' | 'wont';
  index: number;
}) {
  return (
    <motion.div
      className={`ethics-line ethics-line-${kind}`}
      initial={{ opacity: 0, x: kind === 'will' ? -10 : 10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 0.9, ease: FEATHER, delay: 0.1 + index * 0.06 }}
    >
      <span className="ethics-icon">
        {kind === 'will'
          ? <Check className="h-3.5 w-3.5" />
          : <X className="h-3.5 w-3.5" />}
      </span>
      <span className="ethics-text">{text}</span>
    </motion.div>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

function EthicsStyles() {
  return (
    <style>{`
      .ethics-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2.8rem;
      }
      .ethics-col {
        display: flex; flex-direction: column;
        gap: 0.6rem;
      }
      .ethics-col-label {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        padding-bottom: 1rem;
        border-bottom: 0.5px solid var(--m-hairline-s);
        margin-bottom: 0.4rem;
      }
      .ethics-will { color: hsla(142, 65%, 72%, 0.95); }
      .ethics-wont { color: hsla(0, 65%, 75%, 0.85); }
      .ethics-line {
        display: grid;
        grid-template-columns: 22px 1fr;
        gap: 0.85rem;
        align-items: flex-start;
        padding: 0.5rem 0;
      }
      .ethics-icon {
        display: flex; align-items: center; justify-content: center;
        width: 22px; height: 22px;
        border-radius: 50%;
        margin-top: 0.15rem;
        flex-shrink: 0;
      }
      .ethics-line-will .ethics-icon {
        background: hsla(142, 60%, 50%, 0.18);
        color:      hsla(142, 70%, 78%, 0.95);
      }
      .ethics-line-wont .ethics-icon {
        background: hsla(0, 60%, 50%, 0.15);
        color:      hsla(0, 70%, 78%, 0.85);
      }
      .ethics-text {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.05rem;
        line-height: 1.45;
        color: var(--m-ink-strong);
      }
      @media (max-width: 720px) {
        .ethics-grid { grid-template-columns: 1fr; gap: 3rem; }
      }
    `}</style>
  );
}
