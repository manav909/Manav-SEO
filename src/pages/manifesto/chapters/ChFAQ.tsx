/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChFAQ.tsx
   Chapter 12 — Doubts, Resolved. Harvest.

   Each doubt sits in its initial state — italic serif, plain, fully
   visible from the moment the chapter renders. The cinematic moment
   is INVITED, not forced: the reader taps a doubt, and the brand-cyan
   strike line traces across it as the resolution gesture; then the
   answer fades in below in upright serif.

   Six doubts cover the questions a serious prospect carries but
   doesn't ask in the first call:
     01  Why one person? Doesn't this scale poorly?
     02  What happens if you get sick or take a holiday?
     03  What's the minimum engagement?
     04  Can you guarantee rankings?
     05  How is this different from hiring a senior SEO consultant?
     06  Why no monthly retainer?

   Every answer centers the operator (Manav) and frames the system as
   his designed instrument — not an autonomous SaaS, not an automated
   agent. The leverage is the system; the judgment is his. Authentic
   data sources (GSC + GA4 only) are named explicitly where relevant.
══════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

interface Doubt {
  doubt:  string;
  answer: string;
}

const DOUBTS: Doubt[] = [
  {
    doubt:  "Why one person? Doesn't this scale poorly?",
    answer: "I built a system that gives one operator the visibility of fifteen. Every signal across every campaign lands on a single screen — the screen I designed for exactly this purpose. The leverage is the system; the judgment is mine. A team of fifteen splits work across fifteen heads and loses information at every handoff; I lose less because every decision routes through one operator looking at the whole picture. I cap the client list before that leverage breaks. The cap is non-negotiable.",
  },
  {
    doubt:  "What happens if you get sick or take a holiday?",
    answer: "The system I built keeps the data pulling, the campaigns running, and the alerts firing whether I am at my desk or not. What pauses is the next strategy decision — and strategy decisions do not need to happen every day. For a week-long absence the engagement looks identical to the client. For anything longer I tell them before they sign. Honest disclosure before the contract beats a surprise email after one.",
  },
  {
    doubt:  "What's the minimum engagement?",
    answer: "Three months. SEO compounds; one month produces nothing I would defend. Three months gives you one full pillar cycle, the first real movement against your verified baseline, and enough decision trail that you can audit my judgment before extending. If you leave at month three you leave with everything I built for you — pages, cluster maps, recommendations, the lot. All yours.",
  },
  {
    doubt:  "Can you guarantee rankings?",
    answer: "No. Anyone guaranteeing rankings is either lying or about to break the promise. Rankings are commitments search engines make, not agencies. What I guarantee is the inputs: every decision documented in the moment it was made, every metric I show you sourced from Google Search Console and Google Analytics 4 only — no synthesis, no third-party rank databases, no estimates dressed as data — and every gap in what I can verify named to you before you ask. The inputs are the work. The rankings follow.",
  },
  {
    doubt:  "How is this different from hiring a senior SEO consultant?",
    answer: "A consultant gives you opinion and a slide, then hands the implementation to a team that may or may not get it right. I give you the opinion, the implementation, and the operating system I built to make every step of it verifiable — all from one operator who stays accountable to every decision logged in your audit trail. The consultant goes home when the engagement ends. I keep running the campaigns I started, on the system I built, against the baselines I set with you at signing.",
  },
  {
    doubt:  "Why no monthly retainer?",
    answer: "A retainer charges for time I might spend, not work I shipped. That model rewards busywork; mine doesn't allow it. I charge per campaign cycle — five pillars completed, baseline frozen, results measured against the baseline you saw on day one. More cycles mean an explicit authorization from you. Less work means a smaller invoice. Every line item defensible because every line item is a thing I did, on a date I logged, against a baseline neither of us can quietly rewrite.",
  },
];

type Phase = 'idle' | 'resolving' | 'answering' | 'done';

export function ChFAQ({ t }: { t: TFn }) {
  return (
    <ChapterShell id="faq" no="12" season="harvest" titleKey="ch12" t={t}>
      <FAQStyles />

      <Prose delay={0.4}>
        Six doubts a serious prospect carries but does not say in the first
        call. I have answered each in advance.
      </Prose>

      <Prose delay={0.55}>
        Tap any doubt to see how I resolve it.
      </Prose>

      <div className="faq-stack mt-16">
        {DOUBTS.map((d, i) => (
          <FAQPair key={i} doubt={d} index={i} />
        ))}
      </div>

      <Prose delay={0.4} className="mt-24">
        If your doubt is not on this page, send it. The answer comes back from
        me directly — in the same register, quiet and considered, attached to
        the audit trail it was earned from.
      </Prose>
    </ChapterShell>
  );
}

function FAQPair({ doubt, index }: { doubt: Doubt; index: number }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [resolveKey, setResolveKey] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  /* The resolution sequence: strike line draws → pause → answer fades in */
  const runResolution = useCallback(() => {
    clearTimers();
    setPhase('resolving');

    const strikeMs     = 780;
    const postStrikeMs = 380;
    const answerMs     = 1200;

    timersRef.current.push(setTimeout(() => setPhase('answering'), strikeMs + postStrikeMs));
    timersRef.current.push(setTimeout(() => setPhase('done'),      strikeMs + postStrikeMs + answerMs));
  }, [clearTimers]);

  /* Tap handler. Force re-mount of the strike and answer elements via a
     bumped key so the new sequence starts from a clean DOM state — no
     awkward "retract then redraw" of the cyan line, no faded-answer
     blink. Brief 60ms beat lets React commit the remount before the
     transition fires. */
  const handleClick = useCallback(() => {
    clearTimers();
    setResolveKey((k) => k + 1);
    setPhase('idle');
    timersRef.current.push(setTimeout(() => runResolution(), 60));
  }, [clearTimers, runResolution]);

  /* Clean up pending timers on unmount */
  useEffect(() => () => clearTimers(), [clearTimers]);

  const isResolved = phase === 'resolving' || phase === 'answering' || phase === 'done';
  const showAnswer = phase === 'answering' || phase === 'done';
  const inProgress = phase === 'resolving' || phase === 'answering';

  return (
    <div className="faq-pair">
      <div className="faq-number">
        <span className="faq-number-q">Q</span>
        <span className="faq-number-dot">·</span>
        <span className="faq-number-no">{String(index + 1).padStart(2, '0')}</span>
      </div>

      <div
        className={`faq-doubt ${isResolved ? 'faq-doubt-resolved' : ''}`}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        aria-label={`Doubt ${index + 1}: ${doubt.doubt}. ${phase === 'done' ? 'Tap to replay resolution.' : 'Tap to resolve.'}`}
      >
        <span className="faq-doubt-line">{doubt.doubt}</span>
        <span
          key={`strike-${resolveKey}`}
          className="faq-strike"
          data-resolved={isResolved}
          aria-hidden
        />
      </div>

      {/* Affordance hint — small monospaced caption below the doubt that
          states the tap action. Three states: idle (TAP TO RESOLVE),
          in-progress (RESOLVING…), done (TAP TO REPLAY). */}
      <div className="faq-affordance" aria-hidden>
        {phase === 'idle' && <span className="faq-affordance-text">↳ TAP TO RESOLVE</span>}
        {inProgress       && <span className="faq-affordance-text faq-affordance-active">RESOLVING…</span>}
        {phase === 'done' && <span className="faq-affordance-text">↻ TAP TO REPLAY</span>}
      </div>

      <motion.div
        key={`answer-${resolveKey}`}
        className="faq-answer"
        initial={{ opacity: 0, y: 14 }}
        animate={showAnswer ? { opacity: 0.92, y: 0 } : { opacity: 0, y: 14 }}
        transition={{ duration: 1.2, ease: FEATHER }}
      >
        {doubt.answer}
      </motion.div>

      <div className="faq-divider" aria-hidden />
    </div>
  );
}

function FAQStyles() {
  return (
    <style>{`
      .faq-stack {
        display: flex;
        flex-direction: column;
        gap: 5.5rem;
      }

      /* ── PAIR CONTAINER ── */
      .faq-pair {
        position: relative;
        max-width: 64ch;
        margin: 0 auto;
        width: 100%;
      }

      /* ── NUMBER MARKER ── */
      .faq-number {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.32em;
        text-transform: uppercase;
        color: hsla(var(--ch-hue), 45%, 70%, 0.85);
        margin-bottom: 1.4rem;
      }
      .faq-number-q   { opacity: 0.7; }
      .faq-number-dot { opacity: 0.5; }
      .faq-number-no  {
        color: hsla(var(--ch-hue), 65%, 80%, 1);
        font-weight: 800;
      }

      /* ── DOUBT (italic, clickable) ── */
      .faq-doubt {
        position: relative;
        display: inline-block;
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.32rem, 2.25vw, 1.75rem);
        line-height: 1.45;
        font-style: italic;
        color: var(--m-ink-strong);
        letter-spacing: -0.005em;
        cursor: pointer;
        padding: 0.4rem 0.25rem;
        transition: color 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        outline: none;
        max-width: 100%;
        -webkit-tap-highlight-color: transparent;
      }
      .faq-doubt:focus-visible {
        outline: 1px dashed hsla(var(--ch-hue), 60%, 70%, 0.6);
        outline-offset: 6px;
        border-radius: 4px;
      }
      .faq-doubt:hover .faq-doubt-line {
        text-shadow: 0 0 22px hsla(var(--ch-hue), 80%, 70%, 0.28);
        color: rgba(255, 255, 255, 1);
      }
      .faq-doubt-line {
        position: relative;
        display: inline;
        transition: color 0.4s ease, text-shadow 0.4s ease;
      }
      .faq-doubt-resolved {
        color: var(--m-ink-medium);
      }

      /* ── STRIKE LINE — the cinematic resolution gesture ── */
      .faq-strike {
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        height: 0;
        pointer-events: none;
      }
      .faq-strike::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 0;
        height: 1.75px;
        width: 0;
        background: linear-gradient(90deg,
          transparent 0%,
          hsla(188, 80%, 70%, 0.35) 8%,
          hsla(188, 90%, 75%, 0.95) 35%,
          hsla(188, 95%, 82%, 1) 50%,
          hsla(188, 90%, 75%, 0.95) 65%,
          hsla(188, 80%, 70%, 0.35) 92%,
          transparent 100%);
        box-shadow:
          0 0 8px hsla(188, 90%, 70%, 0.55),
          0 0 22px hsla(188, 80%, 65%, 0.35);
        transition: width 0.78s cubic-bezier(0.16, 1, 0.3, 1);
        transform: translateY(-50%);
        border-radius: 1px;
      }
      .faq-strike[data-resolved="true"]::before {
        width: 100%;
      }

      /* The glowing leading-edge spark that briefly appears at the end
         of the strike line as it draws */
      .faq-strike::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 0;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: hsla(188, 100%, 90%, 1);
        box-shadow:
          0 0 6px hsla(188, 100%, 80%, 0.95),
          0 0 16px hsla(188, 90%, 70%, 0.7);
        opacity: 0;
        transform: translate(-50%, -50%);
        transition: opacity 0.2s ease, left 0.78s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .faq-strike[data-resolved="true"]::after {
        left: 100%;
        opacity: 1;
        transition: opacity 0.2s ease, left 0.78s cubic-bezier(0.16, 1, 0.3, 1),
                    opacity 0.4s ease 0.7s;
      }

      /* ── AFFORDANCE HINT ── */
      .faq-affordance {
        margin-top: 1rem;
        font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.58rem;
        font-weight: 800;
        letter-spacing: 0.32em;
        text-transform: uppercase;
        height: 1em;
        pointer-events: none;
        user-select: none;
      }
      .faq-affordance-text {
        color: hsla(var(--ch-hue), 45%, 72%, 0.6);
        transition: color 0.4s ease, opacity 0.4s ease;
      }
      .faq-pair:hover .faq-affordance-text {
        color: hsla(var(--ch-hue), 60%, 80%, 0.95);
      }
      .faq-affordance-active {
        color: hsla(188, 80%, 78%, 1) !important;
        animation: faqAffordancePulse 1.6s ease-in-out infinite;
      }
      @keyframes faqAffordancePulse {
        0%, 100% { opacity: 0.55; }
        50%      { opacity: 1;    }
      }

      /* ── ANSWER ── */
      .faq-answer {
        margin-top: 1.8rem;
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.0rem, 1.4vw, 1.12rem);
        line-height: 1.7;
        color: var(--m-ink-medium);
        max-width: 60ch;
        letter-spacing: 0.002em;
      }

      /* ── DIVIDER ── */
      .faq-divider {
        margin-top: 3rem;
        height: 1px;
        width: 80px;
        background: linear-gradient(90deg, transparent, var(--m-hairline-s), transparent);
        opacity: 0.6;
      }
      .faq-pair:last-of-type .faq-divider { display: none; }

      /* ── RESPONSIVE ── */
      @media (max-width: 720px) {
        .faq-stack          { gap: 4rem; }
        .faq-doubt          { font-size: 1.18rem; }
        .faq-number         { font-size: 0.58rem; margin-bottom: 1rem; }
        .faq-answer         { font-size: 0.98rem; margin-top: 1.6rem; }
        .faq-divider        { margin-top: 2.2rem; }
        .faq-affordance     { font-size: 0.52rem; letter-spacing: 0.28em; }
      }
    `}</style>
  );
}
