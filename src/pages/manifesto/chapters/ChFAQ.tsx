/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChFAQ.tsx
   Chapter 12 — Doubts, Resolved. Harvest.

   All copy localized: faq_intro_1, faq_intro_2, faq_close, the
   3-state affordance hints (faq_tap_resolve / faq_resolving /
   faq_tap_replay), and 6 doubts × 2 (faq_N_doubt + faq_N_answer).
══════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

const DOUBT_INDICES = [1, 2, 3, 4, 5, 6] as const;

type Phase = 'idle' | 'resolving' | 'answering' | 'done';

export function ChFAQ({ t }: { t: TFn }) {
  return (
    <ChapterShell id="faq" no="12" season="harvest" titleKey="ch12" t={t}>
      <FAQStyles />

      <Prose delay={0.4}>{t('faq_intro_1')}</Prose>
      <Prose delay={0.55}>{t('faq_intro_2')}</Prose>

      <div className="faq-stack mt-16">
        {DOUBT_INDICES.map((n, i) => (
          <FAQPair
            key={n}
            doubt={t(`faq_${n}_doubt`)}
            answer={t(`faq_${n}_answer`)}
            index={i}
            qPrefix={t('faq_q_prefix')}
            labels={{
              idle:       t('faq_tap_resolve'),
              resolving:  t('faq_resolving'),
              done:       t('faq_tap_replay'),
            }}
          />
        ))}
      </div>

      <Prose delay={0.4} className="mt-24">{t('faq_close')}</Prose>
    </ChapterShell>
  );
}

function FAQPair({
  doubt, answer, index, qPrefix, labels,
}: {
  doubt:   string;
  answer:  string;
  index:   number;
  qPrefix: string;
  labels:  { idle: string; resolving: string; done: string };
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [resolveKey, setResolveKey] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const runResolution = useCallback(() => {
    clearTimers();
    setPhase('resolving');
    const strikeMs     = 780;
    const postStrikeMs = 380;
    const answerMs     = 1200;
    timersRef.current.push(setTimeout(() => setPhase('answering'), strikeMs + postStrikeMs));
    timersRef.current.push(setTimeout(() => setPhase('done'),      strikeMs + postStrikeMs + answerMs));
  }, [clearTimers]);

  const handleClick = useCallback(() => {
    clearTimers();
    setResolveKey((k) => k + 1);
    setPhase('idle');
    timersRef.current.push(setTimeout(() => runResolution(), 60));
  }, [clearTimers, runResolution]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const isResolved = phase === 'resolving' || phase === 'answering' || phase === 'done';
  const showAnswer = phase === 'answering' || phase === 'done';
  const inProgress = phase === 'resolving' || phase === 'answering';

  return (
    <div className="faq-pair">
      <div className="faq-number">
        <span className="faq-number-q">{qPrefix}</span>
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
        aria-label={`${doubt} — ${phase === 'done' ? labels.done : labels.idle}`}
      >
        <span className="faq-doubt-line">{doubt}</span>
        <span
          key={`strike-${resolveKey}`}
          className="faq-strike"
          data-resolved={isResolved}
          aria-hidden
        />
      </div>

      <div className="faq-affordance" aria-hidden>
        {phase === 'idle' && <span className="faq-affordance-text">{labels.idle}</span>}
        {inProgress       && <span className="faq-affordance-text faq-affordance-active">{labels.resolving}</span>}
        {phase === 'done' && <span className="faq-affordance-text">{labels.done}</span>}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {showAnswer && (
          <motion.div
            key={`answer-${resolveKey}`}
            className="faq-answer-wrap"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{    opacity: 0, height: 0 }}
            transition={{
              height:  { duration: 0.7, ease: FEATHER },
              opacity: { duration: 0.9, ease: FEATHER, delay: 0.15 },
            }}
            style={{ overflow: 'hidden' }}
          >
            <div className="faq-answer">{answer}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="faq-divider" aria-hidden />
    </div>
  );
}

function FAQStyles() {
  return (
    <style>{`
      .faq-stack { display: flex; flex-direction: column; gap: 2.4rem; }
      .faq-pair  { position: relative; max-width: 64ch; margin: 0 auto; width: 100%; }
      .faq-number {
        display: flex; align-items: baseline; gap: 0.4rem;
        font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.65rem; font-weight: 700; letter-spacing: 0.32em;
        text-transform: uppercase;
        color: hsla(var(--ch-hue), 45%, 70%, 0.85);
        margin-bottom: 1.4rem;
      }
      .faq-number-q   { opacity: 0.7; }
      .faq-number-dot { opacity: 0.5; }
      .faq-number-no  { color: hsla(var(--ch-hue), 65%, 80%, 1); font-weight: 800; }
      .faq-doubt {
        position: relative; display: inline-block;
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.32rem, 2.25vw, 1.75rem);
        line-height: 1.45; font-style: italic;
        color: var(--m-ink-strong);
        letter-spacing: -0.005em;
        cursor: pointer; padding: 0.4rem 0.25rem;
        transition: color 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        outline: none; max-width: 100%;
        -webkit-tap-highlight-color: transparent;
      }
      .faq-doubt:focus-visible {
        outline: 1px dashed hsla(var(--ch-hue), 60%, 70%, 0.6);
        outline-offset: 6px; border-radius: 4px;
      }
      .faq-doubt:hover .faq-doubt-line {
        text-shadow: 0 0 22px hsla(var(--ch-hue), 80%, 70%, 0.28);
        color: rgba(255, 255, 255, 1);
      }
      .faq-doubt-line {
        position: relative; display: inline;
        transition: color 0.4s ease, text-shadow 0.4s ease;
      }
      .faq-doubt-resolved { color: var(--m-ink-medium); }
      .faq-strike {
        position: absolute; top: 50%; left: 0; right: 0;
        height: 0; pointer-events: none;
      }
      .faq-strike::before {
        content: '';
        position: absolute; top: 50%; left: 0;
        height: 1.75px; width: 0;
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
      .faq-strike[data-resolved="true"]::before { width: 100%; }
      .faq-strike::after {
        content: '';
        position: absolute; top: 50%; left: 0;
        width: 4px; height: 4px;
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
        left: 100%; opacity: 1;
        transition: opacity 0.2s ease, left 0.78s cubic-bezier(0.16, 1, 0.3, 1),
                    opacity 0.4s ease 0.7s;
      }
      .faq-affordance {
        margin-top: 1rem;
        font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.58rem; font-weight: 800; letter-spacing: 0.32em;
        text-transform: uppercase; height: 1em;
        pointer-events: none; user-select: none;
      }
      .faq-affordance-text {
        color: hsla(var(--ch-hue), 45%, 72%, 0.6);
        transition: color 0.4s ease, opacity 0.4s ease;
      }
      .faq-pair:hover .faq-affordance-text { color: hsla(var(--ch-hue), 60%, 80%, 0.95); }
      .faq-affordance-active {
        color: hsla(188, 80%, 78%, 1) !important;
        animation: faqAffordancePulse 1.6s ease-in-out infinite;
      }
      @keyframes faqAffordancePulse {
        0%, 100% { opacity: 0.55; }
        50%      { opacity: 1;    }
      }
      .faq-answer-wrap { width: 100%; }
      .faq-answer {
        margin-top: 1.4rem;
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.0rem, 1.4vw, 1.12rem);
        line-height: 1.7;
        color: var(--m-ink-medium);
        max-width: 60ch;
        letter-spacing: 0.002em;
      }
      .faq-divider {
        margin-top: 2rem;
        height: 1px; width: 80px;
        background: linear-gradient(90deg, transparent, var(--m-hairline-s), transparent);
        opacity: 0.6;
      }
      .faq-pair:last-of-type .faq-divider { display: none; }
      @media (max-width: 720px) {
        .faq-stack      { gap: 1.8rem; }
        .faq-doubt      { font-size: 1.18rem; }
        .faq-number     { font-size: 0.58rem; margin-bottom: 1rem; }
        .faq-answer     { font-size: 0.98rem; margin-top: 1.2rem; }
        .faq-divider    { margin-top: 1.5rem; }
        .faq-affordance { font-size: 0.52rem; letter-spacing: 0.28em; }
      }
    `}</style>
  );
}
