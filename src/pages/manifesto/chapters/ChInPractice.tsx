/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChInPractice.tsx
   Chapter 13 — In Practice. Harvest.

   The scene that makes the principles tangible. An anonymized
   representative scenario — patterned on the class of incident
   SEASON catches in active engagements, told in three beats:

     1. The alert  — 4:47 AM. The drift engine fires. By the time
                     the operator is awake, the audit trail already
                     contains the diagnosis. The system did the
                     hardest work overnight.
     2. The call   — 11 AM. Three response paths drafted with
                     reasoning attached. Not "we'll look into it"
                     — three named options with trade-offs.
     3. The proof  — Client got the diagnosis before they noticed
                     the problem. The audit trail arrived before
                     the panic email could.

   The scenario is composite, drawn from the kind of incident any
   active SEO operation faces — labelled honestly as illustrative
   rather than dressed as a specific named case study. This is
   how SEASON describes the work; this is what the work feels like.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell, Prose, Statement } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

export function ChInPractice({ t }: { t: TFn }) {
  return (
    <ChapterShell id="in-practice" no="13" season="harvest" titleKey="ch13" t={t}>
      <PracticeStyles />

      <Prose delay={0.4}>{t('practice_lead')}</Prose>

      {/* Three scene beats, each in its own framed block.
          Light hairline borders + monospaced timestamps give the
          chapter the feel of an operations log rather than narrative
          prose, which suits the JARVIS voice of the manifesto. */}
      <div className="practice-stack mt-14">
        <PracticeBeat
          time={t('practice_time1')}
          body={t('practice_block1')}
          index={0}
        />
        <PracticeBeat
          time={t('practice_time2')}
          body={t('practice_block2')}
          index={1}
        />
        <PracticeBeat
          time={t('practice_time3')}
          body={t('practice_block3')}
          index={2}
        />
      </div>

      <Statement delay={0.5}>{t('practice_statement')}</Statement>

      <Prose delay={0.7} className="mt-10">{t('practice_close')}</Prose>
    </ChapterShell>
  );
}

function PracticeBeat({
  time, body, index,
}: { time: string; body: string; index: number }) {
  return (
    <motion.div
      className="practice-beat"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 1.1, ease: FEATHER, delay: 0.15 + index * 0.12 }}
    >
      <div className="practice-time">{time}</div>
      <div className="practice-rule" aria-hidden />
      <div className="practice-body">{body}</div>
    </motion.div>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

function PracticeStyles() {
  return (
    <style>{`
      .practice-stack {
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .practice-beat {
        display: grid;
        grid-template-columns: 110px 18px 1fr;
        gap: 1.2rem;
        align-items: flex-start;
        padding: 2.2rem 0;
        border-top: 0.5px dashed hsla(var(--ch-hue), 30%, 50%, 0.22);
      }
      .practice-beat:first-of-type {
        border-top: 0.5px solid hsla(var(--ch-hue), 40%, 55%, 0.32);
      }
      .practice-beat:last-of-type {
        border-bottom: 0.5px solid hsla(var(--ch-hue), 40%, 55%, 0.32);
      }
      .practice-time {
        font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: hsla(var(--ch-hue), 60%, 78%, 0.95);
        padding-top: 0.5rem;
        white-space: nowrap;
      }
      .practice-rule {
        position: relative;
        width: 1px;
        height: 100%;
        background: linear-gradient(180deg,
          transparent,
          hsla(var(--ch-hue), 50%, 65%, 0.45) 20%,
          hsla(var(--ch-hue), 60%, 70%, 0.55) 50%,
          hsla(var(--ch-hue), 50%, 65%, 0.45) 80%,
          transparent);
        justify-self: center;
      }
      .practice-rule::before {
        content: '';
        position: absolute;
        top: 0.85rem;
        left: 50%;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: hsla(var(--ch-hue), 70%, 75%, 1);
        box-shadow: 0 0 12px hsla(var(--ch-hue), 70%, 65%, 0.6);
        transform: translateX(-50%);
      }
      .practice-body {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.0rem, 1.4vw, 1.12rem);
        line-height: 1.7;
        color: var(--m-ink-medium);
        max-width: 60ch;
        letter-spacing: 0.002em;
      }
      @media (max-width: 720px) {
        .practice-beat {
          grid-template-columns: 1fr;
          gap: 0.7rem;
          padding: 1.6rem 0;
        }
        .practice-rule { display: none; }
        .practice-time {
          padding-top: 0;
          font-size: 0.62rem;
        }
        .practice-body { font-size: 0.98rem; }
      }
    `}</style>
  );
}
