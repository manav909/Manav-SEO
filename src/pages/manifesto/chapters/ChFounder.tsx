/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChFounder.tsx
   Chapter 11 — A Letter from the Founder. Harvest (continuing).

   Manav's voice. First person. The only chapter in the codex
   written in first person; every other chapter uses operator-grade
   third person. The shift is deliberate — it marks the moment the
   reader meets the person behind the architecture.

   Each paragraph reveals on scroll-in independently, with the two
   closing single-sentence paragraphs landing last. The signoff
   ("— Manav") arrives quietly at the end.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

const PARAS: string[] = [
  "I've spent years inside SEO from every position that exists — as an operator running campaigns, as a consultant advising on architecture, as the client who couldn't get a straight answer from their agency. I learned how the work actually happens by doing it from every angle.",
  "What I saw, across every angle, wasn't a tooling problem. It was a trust problem. Agencies that knew exactly what they were doing — and clients who couldn't verify any of it.",
  "Nobody handed me a foundation to build on top of. No firm to inherit, no playbook to copy. What I have is years of working from inside this industry — long enough that the patterns became visible, and the gap between what agencies sell and what clients actually receive became impossible to ignore.",
  "So I built the answer myself. Every system in SEO SEASON, I designed and shipped — every data engine, every dashboard, every audit trail, every line of code, every database schema, every architectural decision. Hiring engineers wouldn't have produced this. The problem required someone who had lived it, and the system required a single architect who could hold the whole shape in their head while building it.",
  "The depth of what's been built is the proof of the years that went into understanding what was needed. You don't architect this kind of system without having seen, in detail, what the alternatives leave on the floor.",
  "I run this agency the way I built the system underneath it: hands on every part. When you hire SEO SEASON, you hire that. The infrastructure isn't a vendor I plug into. The work isn't outsourced to a team you'll never meet. You get the agency, the system, and the builder — all the same person, all the same standard.",
];

const PARAS_FINAL: string[] = [
  'This is what I wanted to exist.',
  'So I built it — every layer of it — and now I run an agency on it.',
];

export function ChFounder({ t }: { t: TFn }) {
  return (
    <ChapterShell id="founder" no="11" season="harvest" titleKey="ch11" t={t}>
      <FounderStyles />

      <motion.blockquote className="founder-letter mt-10">
        {PARAS.map((p, i) => (
          <motion.p
            key={i}
            className="founder-para"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 1.2, ease: FEATHER, delay: 0.2 + i * 0.2 }}
          >
            {p}
          </motion.p>
        ))}

        {PARAS_FINAL.map((p, i) => (
          <motion.p
            key={`f-${i}`}
            className="founder-para founder-para-final"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 1.6, ease: FEATHER, delay: 1.2 + i * 0.4 }}
          >
            {p}
          </motion.p>
        ))}

        <motion.p
          className="founder-signoff"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.85 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ duration: 1.6, ease: FEATHER, delay: 2.4 }}
        >
          — Manav
        </motion.p>
      </motion.blockquote>
    </ChapterShell>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

function FounderStyles() {
  return (
    <style>{`
      .founder-letter {
        max-width: 56ch;
        margin: 3rem 0 0 0;
        position: relative;
        padding: 0 0 0 1.5rem;
        border-left: 0.5px solid hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.35);
      }
      .founder-para {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.25rem;
        line-height: 1.7;
        color: var(--m-ink-medium);
        margin: 0 0 1.6rem 0;
      }
      .founder-para:first-of-type {
        font-size: 1.55rem;
        line-height: 1.45;
        color: var(--m-ink-strong);
        font-style: italic;
        letter-spacing: -0.01em;
      }
      .founder-para-final {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.7rem;
        line-height: 1.4;
        font-style: italic;
        color: var(--m-ink-strong);
        margin-bottom: 0.6rem;
      }
      .founder-para-final + .founder-para-final {
        margin-top: 0;
      }
      .founder-signoff {
        margin-top: 2.5rem;
        font-family: ui-serif, Georgia, serif;
        font-size: 1.1rem;
        color: var(--m-ink-medium);
        letter-spacing: 0.04em;
      }
      @media (max-width: 720px) {
        .founder-letter   { padding-left: 1rem; }
        .founder-para     { font-size: 1.1rem; }
        .founder-para:first-of-type { font-size: 1.3rem; }
        .founder-para-final { font-size: 1.4rem; }
      }
    `}</style>
  );
}
