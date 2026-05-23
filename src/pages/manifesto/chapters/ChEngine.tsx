/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChEngine.tsx
   Chapter 06 — The Engine Room. Monsoon.

   The architecture, named out loud. Five counter cards animate from
   zero to their actual values on scroll-in.

     12  serverless API functions  (hard-capped by design)
     50  database tables
     22  internal engines
     42  frontend pages
      6  shared React contexts

   These numbers aren't decoration. They're the constraint set the
   system was designed under. Showing them tells investors and
   stakeholders that the inside of SEO SEASON is verifiable.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import {
  Network, Database, Activity, Layers,
} from 'lucide-react';
import { ChapterShell, Prose, CounterNumber } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

interface Stat {
  label: string;
  value: number;
  sub:   string;
  icon:  React.ReactNode;
}

const STATS: Stat[] = [
  { label: 'API functions',         value: 12, sub: 'Hard-capped. By design.',         icon: <Network className="h-4 w-4" />  },
  { label: 'Database tables',        value: 50, sub: 'Normalized. Each a clean concept.', icon: <Database className="h-4 w-4" /> },
  { label: 'Internal engines',       value: 22, sub: 'Compose data into views.',         icon: <Activity className="h-4 w-4" /> },
  { label: 'Frontend pages',         value: 42, sub: 'Render every surface.',            icon: <Layers className="h-4 w-4" />   },
  { label: 'Shared React contexts',  value:  6, sub: 'State across pages.',              icon: <Network className="h-4 w-4" />  },
];

export function ChEngine({ t }: { t: TFn }) {
  return (
    <ChapterShell id="engine" no="06" season="monsoon" titleKey="ch06" t={t}>
      <EngineStyles />

      <Prose delay={0.4}>
        Twelve serverless API functions. Fifty database tables. Twenty-two
        internal engines. Forty-two frontend pages. Six shared React contexts.
      </Prose>
      <Prose delay={0.55}>
        These numbers aren't decoration. They're constraints. The twelfth
        function means there is no thirteenth — the system was designed for
        that limit and lives within it. The tables are normalized; each
        represents a clean concept that can be read in isolation. Every page
        renders state derived from one or more engines. Nothing is improvised
        at request time.
      </Prose>

      <div className="engine-grid mt-14">
        {STATS.map((s, i) => (
          <EngineCard key={i} stat={s} index={i} />
        ))}
      </div>

      <Prose delay={1.6} className="mt-14">
        Software that respects its own architecture remains trustworthy over
        years. Software that doesn't gets rewritten every eighteen months while
        the client pays the bill twice.
      </Prose>
    </ChapterShell>
  );
}

function EngineCard({ stat, index }: { stat: Stat; index: number }) {
  return (
    <motion.div
      className="engine-card"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ duration: 1.0, ease: FEATHER, delay: 0.1 + index * 0.1 }}
    >
      <div className="engine-icon">{stat.icon}</div>
      <CounterNumber value={stat.value} className="engine-number" />
      <div className="engine-label">{stat.label}</div>
      <div className="engine-sub">{stat.sub}</div>
    </motion.div>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

function EngineStyles() {
  return (
    <style>{`
      .engine-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1.2rem;
      }
      .engine-card {
        padding: 1.6rem 1.4rem;
        border-radius: 14px;
        background: linear-gradient(180deg,
          hsla(var(--ch-hue), 50%, 30%, 0.12),
          rgba(255,255,255,0.012));
        border: 0.5px solid var(--m-hairline-s);
        position: relative;
        overflow: hidden;
      }
      .engine-card::after {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent,
          hsla(var(--ch-hue), 60%, 65%, 0.55), transparent);
      }
      .engine-icon {
        color: hsla(var(--ch-hue), 70%, 78%, 0.95);
        margin-bottom: 1rem;
      }
      .engine-number {
        font-family: ui-serif, Georgia, serif;
        font-size: 2.8rem;
        font-weight: 300;
        line-height: 1;
        letter-spacing: -0.03em;
        color: var(--m-ink-strong);
        font-feature-settings: 'tnum' 1;
      }
      .engine-label {
        margin-top: 0.7rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.82rem;
        color: var(--m-ink-strong);
        letter-spacing: 0.04em;
      }
      .engine-sub {
        margin-top: 0.3rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.72rem;
        color: var(--m-ink-soft);
        font-style: italic;
        line-height: 1.4;
      }
    `}</style>
  );
}
