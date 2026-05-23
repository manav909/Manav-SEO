/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChPillars.tsx
   Chapter 04 — The Five Pillars. Summer.

   The structural heart of every SEO SEASON campaign. Five pillars,
   each a distinct phase of work, each with its own color. Rendered
   as five columns side by side; each column has a vertical bar that
   grows from bottom on scroll-in.

   Order matters — the pillars run in roughly the sequence they
   execute on a campaign:
     1 Cluster Map        the architecture (cyan)
     2 Internal Linking   the wiring         (green)
     3 Off-Page Authority outward signal     (amber)
     4 Content            the surface itself (amethyst)
     5 Monitoring         the feedback loop  (rose-orange)
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import {
  Network, Activity, Telescope, Layers, Eye,
} from 'lucide-react';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

interface Pillar {
  name:  string;
  icon:  React.ReactNode;
  hue:   number;
  body:  string;
}

const PILLARS: Pillar[] = [
  {
    name: 'Cluster Map',
    icon: <Network className="h-5 w-5" />,
    hue:  188,
    body: 'The topic and its sub-topics, mapped as a graph. Head terms, supporting terms, intent gaps named explicitly. The map exists before the writing.',
  },
  {
    name: 'Internal Linking',
    icon: <Activity className="h-5 w-5" />,
    hue:  142,
    body: 'Existing pages get refreshed link patterns to the new content. New content gets contextual links from authority pages. Every decision recorded.',
  },
  {
    name: 'Off-Page Authority',
    icon: <Telescope className="h-5 w-5" />,
    hue:  38,
    body: 'Outreach, citations, brand mentions tracked as actions with timestamps. No purchased links. Ever.',
  },
  {
    name: 'Content',
    icon: <Layers className="h-5 w-5" />,
    hue:  268,
    body: 'Pages written to fill the gaps the cluster map identifies. Each page knows which cluster term it serves. No orphan content.',
  },
  {
    name: 'Monitoring',
    icon: <Eye className="h-5 w-5" />,
    hue:  22,
    body: 'Every campaign carries a baseline snapshot taken at launch. Every movement reports against that baseline. No retroactive comparisons.',
  },
];

export function ChPillars({ t }: { t: TFn }) {
  return (
    <ChapterShell id="pillars" no="04" season="summer" titleKey="ch04" t={t}>
      <PillarsStyles />

      <Prose delay={0.4}>
        Every campaign in SEO SEASON has exactly five pillars. Not four. Not six.
        Five. The number is structural, not stylistic — fewer pillars leaves
        gaps, more pillars dilute attention.
      </Prose>

      <div className="pillars-stage mt-16">
        {PILLARS.map((p, i) => (
          <PillarColumn key={p.name} pillar={p} index={i} />
        ))}
      </div>

      <Prose delay={1.4} className="mt-16">
        A campaign with four pillars is incomplete; a missing pillar shows up
        three months later as an unexplained plateau. A campaign with six is
        over-engineered and harder to defend in year three. Five is the
        equilibrium SEO SEASON enforces by construction.
      </Prose>

      <Prose delay={1.6}>
        Every pillar produces its own audit trail. Every action a pillar takes
        writes to a row the client can inspect. The pillar structure is what
        makes the work compounding instead of episodic.
      </Prose>
    </ChapterShell>
  );
}

function PillarColumn({ pillar, index }: { pillar: Pillar; index: number }) {
  return (
    <motion.div
      className="pillar-column"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12%' }}
      transition={{ duration: 1.2, ease: FEATHER, delay: 0.15 + index * 0.1 }}
      style={{ ['--pillar-hue' as any]: pillar.hue } as React.CSSProperties}
    >
      <div className="pillar-bar">
        <motion.div
          className="pillar-bar-fill"
          initial={{ height: '0%' }}
          whileInView={{ height: '100%' }}
          viewport={{ once: true, margin: '-12%' }}
          transition={{ duration: 1.8, ease: FEATHER, delay: 0.35 + index * 0.12 }}
        />
      </div>
      <div className="pillar-icon">{pillar.icon}</div>
      <div className="pillar-name">{pillar.name}</div>
      <div className="pillar-body">{pillar.body}</div>
      <div className="pillar-no">{String(index + 1).padStart(2, '0')}</div>
    </motion.div>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

function PillarsStyles() {
  return (
    <style>{`
      .pillars-stage {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 0.85rem;
        align-items: stretch;
      }
      .pillar-column {
        position: relative;
        padding: 1.4rem 1rem 1.4rem 1.4rem;
        border-radius: 14px;
        background: linear-gradient(180deg, hsla(var(--pillar-hue), 60%, 30%, 0.1), rgba(255,255,255,0.012));
        border: 0.5px solid hsla(var(--pillar-hue), 55%, 50%, 0.22);
        display: flex; flex-direction: column;
        min-height: 320px;
        overflow: hidden;
      }
      .pillar-bar {
        position: absolute;
        top: 0; left: 0;
        width: 3px; height: 100%;
        background: rgba(255,255,255,0.04);
        overflow: hidden;
      }
      .pillar-bar-fill {
        width: 100%;
        background: linear-gradient(180deg,
          hsla(var(--pillar-hue), 80%, 70%, 0.95),
          hsla(var(--pillar-hue), 60%, 50%, 0.4));
        transform-origin: top;
        box-shadow: 0 0 8px hsla(var(--pillar-hue), 80%, 65%, 0.4);
      }
      .pillar-icon {
        color: hsla(var(--pillar-hue), 70%, 78%, 0.95);
        margin-bottom: 1rem;
      }
      .pillar-name {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.2rem;
        line-height: 1.3;
        color: var(--m-ink-strong);
        font-weight: 500;
        letter-spacing: -0.01em;
        margin-bottom: 0.8rem;
      }
      .pillar-body {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.82rem;
        line-height: 1.55;
        color: var(--m-ink-medium);
        flex: 1;
      }
      .pillar-no {
        margin-top: 1rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.16em;
        color: var(--m-ink-soft);
      }
      @media (max-width: 920px) {
        .pillars-stage { grid-template-columns: 1fr 1fr; }
      }
      @media (max-width: 560px) {
        .pillars-stage { grid-template-columns: 1fr; }
        .pillar-column { min-height: auto; }
      }
    `}</style>
  );
}
