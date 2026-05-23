/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChFAQ.tsx
   Chapter 12 — Doubts, Resolved. Harvest.

   The chapter where the document meets the reader's unspoken doubts.
   Each FAQ is staged as a moment of cinematic resolution:

     1. The doubt appears, word by word, as if forming in thought
        (blur-clear, 110ms per word stagger)
     2. A brief held breath (400ms)
     3. A brand-cyan line traces left-to-right across the doubt —
        the resolution gesture (700ms ease-out)
     4. The doubt softens to medium ink (it has been addressed)
     5. The answer fades in below in upright serif (1.2s)

   Each pair triggers on scroll-into-view via IntersectionObserver.
   Click any doubt to replay the entire resolution sequence.

   Six doubts cover the questions a serious prospect carries but
   doesn't ask in the first call:
     01  Why one person? Doesn't this scale poorly?
     02  What happens if you get sick or take a holiday?
     03  What's the minimum engagement?
     04  Can you guarantee rankings?
     05  How is this different from hiring a senior SEO consultant?
     06  Why no monthly retainer?
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
    answer: "A person doesn't scale. Infrastructure does. The systems beneath SEO SEASON run continuously without daily input — monitoring, audit, refresh, alerts. What I handle personally is judgment: strategy calls, edge cases, the client conversations that need the architect on the line. I cap the agency before quality slips, and the cap is non-negotiable. Honest beats stretched.",
  },
  {
    doubt:  "What happens if you get sick or take a holiday?",
    answer: "Campaigns proceed on their cadence. Monitoring runs continuously. Clients see the same dashboard whether I'm at my desk or not. For a week-long absence, the engagement is invisible to the client. For anything longer, I'd flag it explicitly before signing. The infrastructure doesn't break because the operator takes a weekend.",
  },
  {
    doubt:  "What's the minimum engagement?",
    answer: "Three months. SEO is a compounding game; one month produces nothing defensible. Three months gets you through one full pillar cycle, the first measurable movement, and enough audit trail to know whether to continue. If you leave at month three, you leave with everything we built — pages, cluster maps, recommendations. All yours.",
  },
  {
    doubt:  "Can you guarantee rankings?",
    answer: "No. Anyone who guarantees rankings is either lying or about to lose them. Rankings are commitments search engines make; nobody on this side of the screen controls them. What's guaranteed: every action timestamped, every metric source-cited, every gap named honestly. The verifiability is the commitment. The rankings follow when the work is right.",
  },
  {
    doubt:  "How is this different from hiring a senior SEO consultant?",
    answer: "A consultant gives you opinion, a slide, and a hand-off. SEO SEASON gives you opinion, the implementation, the data layer, the monitoring, the audit trail, and the accountability — all from one operator. The consultant goes home at the end of the engagement. The infrastructure stays, the campaigns keep running, and the operator is still available when called.",
  },
  {
    doubt:  "Why no monthly retainer?",
    answer: "A retainer charges for time I might spend, not work I did. The model rewards busywork, and the audit trail makes that visible. SEO SEASON charges per campaign cycle — five pillars completed, baseline frozen, results measured. More cycles mean more authorization, not silent invoicing. Less work means a smaller invoice. Defensible line by line, because the work was line by line.",
  },
];

type Phase = 'idle' | 'typing' | 'resolving' | 'answering' | 'done';

export function ChFAQ({ t }: { t: TFn }) {
  return (
    <ChapterShell id="faq" no="12" season="harvest" titleKey="ch12" t={t}>
      <FAQStyles />

      <Prose delay={0.4}>
        Six doubts that don't get spoken in the first call but should. Each one
        resolved before you have to ask it aloud.
      </Prose>

      <Prose delay={0.55}>
        Click any doubt to watch it resolve again.
      </Prose>

      <div className="faq-stack mt-16">
        {DOUBTS.map((d, i) => (
          <FAQPair key={i} doubt={d} index={i} />
        ))}
      </div>

      <Prose delay={0.4} className="mt-24">
        If your doubt isn't on this page, send it. The answer will come back
        in the same register — quiet, considered, audit-trail attached.
      </Prose>
    </ChapterShell>
  );
}

function FAQPair({ doubt, index }: { doubt: Doubt; index: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [revealKey, setRevealKey] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const words = doubt.doubt.split(/(\s+)/).filter((w) => w.length > 0);

  /* Cancel any pending phase transitions */
  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  /* Schedule the full Q→strike→A reveal sequence */
  const runReveal = useCallback(() => {
    clearTimers();
    setPhase('typing');

    const wordRevealMs = words.length * 110 + 250;   // word-by-word fade-in
    const heldBreathMs = 400;
    const strikeMs     = 750;
    const postStrikeMs = 350;

    const toResolving = wordRevealMs + heldBreathMs;
    const toAnswering = toResolving + strikeMs;
    const toDone      = toAnswering + 1200;

    timersRef.current.push(setTimeout(() => setPhase('resolving'), toResolving));
    timersRef.current.push(setTimeout(() => setPhase('answering'), toAnswering + postStrikeMs));
    timersRef.current.push(setTimeout(() => setPhase('done'),      toDone      + postStrikeMs));
  }, [words.length, clearTimers]);

  /* IntersectionObserver — fire once when pair scrolls into view */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let triggered = false;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.3 && !triggered) {
            triggered = true;
            runReveal();
            obs.disconnect();
          }
        });
      },
      { threshold: [0.3, 0.5] }
    );

    obs.observe(el);
    return () => { obs.disconnect(); clearTimers(); };
  }, [runReveal, clearTimers]);

  /* Click handler — replay the resolution */
  const handleReplay = () => {
    setRevealKey((k) => k + 1);  // forces motion components to re-mount
    setPhase('idle');
    /* setTimeout 30ms lets React commit the idle state before re-running */
    setTimeout(() => runReveal(), 30);
  };

  const isResolved = phase === 'resolving' || phase === 'answering' || phase === 'done';
  const showAnswer = phase === 'answering' || phase === 'done';

  return (
    <div ref={containerRef} className="faq-pair">
      <div className="faq-number">
        <span className="faq-number-q">Q</span>
        <span className="faq-number-dot">·</span>
        <span className="faq-number-no">{String(index + 1).padStart(2, '0')}</span>
      </div>

      <div
        className={`faq-doubt ${isResolved ? 'faq-doubt-resolved' : ''}`}
        onClick={handleReplay}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleReplay(); }}
        aria-label={`Doubt ${index + 1}: ${doubt.doubt}. Click to replay.`}
      >
        <span className="faq-doubt-line">
          {phase !== 'idle' && words.map((word, i) => {
            const isSpace = /\s+/.test(word);
            return (
              <motion.span
                key={`${revealKey}-${i}`}
                className={`faq-word ${isSpace ? 'faq-word-space' : ''}`}
                initial={{ opacity: 0, filter: 'blur(7px)', y: 5 }}
                animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                transition={{
                  duration: 0.45,
                  ease: FEATHER,
                  delay: i * 0.075,
                }}
              >
                {word}
              </motion.span>
            );
          })}
        </span>
        <span className="faq-strike" data-resolved={isResolved} />
      </div>

      <motion.div
        key={`answer-${revealKey}`}
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

      /* ── DOUBT (the italic question) ── */
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
        min-height: 2.4em;
        transition: color 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        outline: none;
        max-width: 100%;
      }
      .faq-doubt:focus-visible {
        outline: 1px dashed hsla(var(--ch-hue), 60%, 70%, 0.6);
        outline-offset: 6px;
        border-radius: 4px;
      }
      .faq-doubt:hover .faq-doubt-line {
        text-shadow: 0 0 18px hsla(var(--ch-hue), 70%, 65%, 0.18);
      }
      .faq-doubt-line {
        position: relative;
        display: inline;
      }
      .faq-doubt-resolved {
        color: var(--m-ink-medium);
      }
      .faq-word {
        display: inline-block;
        white-space: pre;
      }
      .faq-word-space { display: inline; }

      /* ── THE STRIKE LINE — the cinematic resolution gesture ── */
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

      /* The "spark" at the leading edge of the strike — a tiny glowing dot
         that briefly appears as the line draws */
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

      /* ── ANSWER (upright serif, calm) ── */
      .faq-answer {
        margin-top: 2.2rem;
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.0rem, 1.4vw, 1.12rem);
        line-height: 1.7;
        color: var(--m-ink-medium);
        max-width: 60ch;
        letter-spacing: 0.002em;
      }

      /* ── HAIRLINE DIVIDER BETWEEN PAIRS ── */
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
      }
    `}</style>
  );
}
