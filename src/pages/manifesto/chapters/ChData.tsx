/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChData.tsx
   Chapter 09 — Authentic Data Doctrine. Autumn (continuing).

   Two source-of-truth cards. No third. No synthesis. No third-party
   rank trackers plugged in to look real. Each card has a slow-
   pulsing live dot that signals "continuous sync" — visual analog
   for the data layer being alive.

   Then a closing statement about gaps: the dashboard that lies
   about its own gaps is the same dashboard that will lie about
   your performance. That sentence is the entire chapter.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell, Prose, Statement } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

interface Source {
  name:   string;
  role:   string;
  status: string;
}

const SOURCES: Source[] = [
  {
    name:   'Google Search Console',
    role:   'What queries surface your site, and how.',
    status: 'Continuous sync',
  },
  {
    name:   'Google Analytics 4',
    role:   'What visitors do once they arrive.',
    status: 'Continuous sync',
  },
];

export function ChData({ t }: { t: TFn }) {
  return (
    <ChapterShell id="data" no="09" season="autumn" titleKey="ch09" t={t}>
      <DataStyles />

      <Prose delay={0.4}>
        Two authoritative sources of truth. No third. No synthesis. No estimates
        dressed as data.
      </Prose>

      <div className="data-sources mt-14">
        {SOURCES.map((s, i) => (
          <DataSourceCard key={i} source={s} delay={0.2 + i * 0.2} />
        ))}
      </div>

      <Prose delay={1.0} className="mt-12">
        When a number is unknown, we mark it unknown. The reports honestly
        enumerate the gaps: revenue attribution without enhanced ecommerce
        events, true backlink count without a dedicated backlink monitor,
        competitor SERP positions without a third-party rank database,
        algorithm update timing — we infer; Google doesn't announce.
      </Prose>

      <Prose delay={1.2}>
        Anything beyond these two sources is labeled honestly: <em>inferred</em>,
        <em> third-party</em>, or <em>unknown</em>. The client always knows the
        provenance of the number they're looking at.
      </Prose>

      <Statement delay={1.4}>
        A dashboard that lies about its own gaps is the same dashboard that
        will lie about your performance. We don't ship that dashboard.
      </Statement>
    </ChapterShell>
  );
}

function DataSourceCard({ source, delay }: { source: Source; delay: number }) {
  return (
    <motion.div
      className="data-source"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ duration: 1.0, ease: FEATHER, delay }}
    >
      <div className="data-source-pulse">
        <motion.div
          className="data-pulse-dot"
          animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.5, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="data-source-status">{source.status}</span>
      </div>
      <div className="data-source-name">{source.name}</div>
      <div className="data-source-role">{source.role}</div>
    </motion.div>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

function DataStyles() {
  return (
    <style>{`
      .data-sources {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.4rem;
      }
      .data-source {
        padding: 1.8rem 1.6rem;
        border-radius: 14px;
        background: linear-gradient(180deg,
          hsla(var(--ch-hue), 50%, 30%, 0.1),
          rgba(255,255,255,0.012));
        border: 0.5px solid hsla(var(--ch-hue), 55%, 50%, 0.25);
        position: relative;
      }
      .data-source-pulse {
        display: flex; align-items: center;
        gap: 0.6rem;
        margin-bottom: 1.4rem;
      }
      .data-pulse-dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: hsla(142, 70%, 60%, 0.95);
        box-shadow: 0 0 12px hsla(142, 70%, 55%, 0.7);
      }
      .data-source-status {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: hsla(142, 60%, 75%, 0.95);
      }
      .data-source-name {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.5rem;
        line-height: 1.3;
        color: var(--m-ink-strong);
        font-weight: 400;
        letter-spacing: -0.015em;
        margin-bottom: 0.6rem;
      }
      .data-source-role {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.95rem;
        line-height: 1.55;
        color: var(--m-ink-medium);
      }
      @media (max-width: 720px) {
        .data-sources { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
