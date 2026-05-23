/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/shared.tsx
   Reusable primitives shared across every chapter file.

   Components:
     - ChapterShell    full chapter wrapper (sets season CSS vars)
     - ChapterHeader   season row + chapter no + title
     - Prose           feather-rise paragraph
     - Statement       framed declaration
     - FoundingQuote   large italic quotation block
     - TextReveal      letter-by-letter staggered reveal
     - CounterNumber   IO-triggered animated counter
     - ScrollHint      "Begin / scroll" indicator at hero foot
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import type { ChapterDef, SeasonId, TFn } from './types';
import { FEATHER, SOFT_RISE } from './types';
import { SEASONS } from './seasons';

/* ═══════════════════════════════════════════════════════════════════
   CHAPTER SHELL — wraps any chapter section, injects season CSS vars
═══════════════════════════════════════════════════════════════════ */

export function ChapterShell({
  id, no, season, titleKey, t, children,
}: {
  id:       string;
  no:       string;
  season:   SeasonId;
  titleKey: string;
  t:        TFn;
  children: React.ReactNode;
}) {
  const s = SEASONS[season];
  return (
    <section
      id={id}
      className="act act-chapter"
      data-chapter-season={season}
      style={{
        ['--ch-hue' as any]:   s.hue,
        ['--ch-sat' as any]:   `${s.sat}%`,
        ['--ch-light' as any]: `${s.light}%`,
      } as React.CSSProperties}
    >
      <div className="act-inner">
        <ChapterHeader no={no} season={season} titleKey={titleKey} t={t} />
        {children}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CHAPTER HEADER — season pill + chapter number + reveal title
═══════════════════════════════════════════════════════════════════ */

function ChapterHeader({
  no, season, titleKey, t,
}: {
  no: string; season: SeasonId; titleKey: string; t: TFn;
}) {
  const s = SEASONS[season];
  return (
    <header className="ch-header">
      <motion.div
        className="ch-season-row"
        initial={{ opacity: 0, x: -8 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 1.0, ease: FEATHER }}
      >
        <span className="ch-season-glyph">{s.glyph}</span>
        <span className="ch-season-name">{t(s.labelKey)}</span>
        <span className="ch-season-kicker">— {t(s.kickerKey)}</span>
      </motion.div>

      <motion.div
        className="ch-number"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 0.55 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 1.2, ease: FEATHER, delay: 0.2 }}
      >
        {t('chapter')} {no}
      </motion.div>

      <h2 className="ch-title">
        <TextReveal text={t(titleKey)} delay={0.3} />
      </h2>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PROSE — soft feather-rise paragraph
═══════════════════════════════════════════════════════════════════ */

export function Prose({
  children, delay = 0, className = '',
}: {
  children:  React.ReactNode;
  delay?:    number;
  className?: string;
}) {
  return (
    <motion.p
      className={`prose-block ${className}`}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ ...SOFT_RISE, delay }}
    >
      {children}
    </motion.p>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   STATEMENT — bordered declaration line
═══════════════════════════════════════════════════════════════════ */

export function Statement({
  children, delay = 0,
}: {
  children: React.ReactNode;
  delay?:   number;
}) {
  return (
    <motion.div
      className="statement-block mt-10"
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ duration: 1.6, ease: FEATHER, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   FOUNDING QUOTE — large italic block with corner mark
═══════════════════════════════════════════════════════════════════ */

export function FoundingQuote({
  children, delay = 0,
}: {
  children: React.ReactNode;
  delay?:   number;
}) {
  return (
    <motion.blockquote
      className="founding-quote mt-8"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ duration: 1.6, ease: FEATHER, delay }}
    >
      <div className="founding-mark">&ldquo;</div>
      <div className="founding-text">{children}</div>
    </motion.blockquote>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TEXT REVEAL — character-stagger animation, respects reduced motion
═══════════════════════════════════════════════════════════════════ */

export function TextReveal({
  text, delay = 0, className = '',
}: {
  text:       string;
  delay?:     number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className}>{text}</span>;

  const words = text.split(/(\s+)/);
  let charIdx = 0;

  return (
    <span className={className}>
      {words.map((w, wi) => {
        if (/^\s+$/.test(w)) return <span key={wi}>{w}</span>;
        return (
          <span key={wi} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
            {Array.from(w).map((ch, ci) => {
              const myIdx = charIdx++;
              return (
                <motion.span
                  key={ci}
                  style={{ display: 'inline-block' }}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-15%' }}
                  transition={{ duration: 0.7, ease: FEATHER, delay: delay + myIdx * 0.025 }}
                >
                  {ch}
                </motion.span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   COUNTER NUMBER — eased count-up, fires on IntersectionObserver
═══════════════════════════════════════════════════════════════════ */

export function CounterNumber({
  value, className = '',
}: {
  value:     number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (!ref.current || seen) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setSeen(true);
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen) return;
    if (reduce) { setN(value); return; }
    const state = { cancel: false };
    const start = performance.now();
    const duration = 1600;
    const step = (now: number) => {
      if (state.cancel) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.floor(value * eased));
      if (t < 1) requestAnimationFrame(step);
      else setN(value);
    };
    requestAnimationFrame(step);
    return () => { state.cancel = true; };
  }, [seen, value, reduce]);

  return <div ref={ref} className={className}>{n.toLocaleString()}</div>;
}

/* ═══════════════════════════════════════════════════════════════════
   SCROLL HINT — pulsing label + arrow at end of hero
═══════════════════════════════════════════════════════════════════ */

export function ScrollHint({
  label, delay = 0,
}: {
  label: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <motion.div
      className="scroll-hint"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.7, 0.7, 0] }}
      transition={{ duration: 5, delay, repeat: Infinity, repeatDelay: 1 }}
    >
      <div className="scroll-hint-text">{label}</div>
      <ArrowDown className="scroll-hint-arrow h-3 w-3" />
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Re-export for chapter files
═══════════════════════════════════════════════════════════════════ */

export type { ChapterDef, SeasonId, TFn };
