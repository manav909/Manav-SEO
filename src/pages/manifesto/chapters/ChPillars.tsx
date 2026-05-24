/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChPillars.tsx
   Chapter 04 — The Five Pillars. Summer.

   All prose localized: pillars_intro, pillars_equilibrium,
   pillars_objection, pillars_close, plus pillar_N_name and
   pillar_N_body for N=1..5.

   Icons + hues stay hardcoded (visual identity).
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import {
  Network, Activity, Telescope, Layers, Eye,
} from 'lucide-react';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

interface PillarMeta {
  n:    1 | 2 | 3 | 4 | 5;
  icon: React.ReactNode;
  hue:  number;
}

const PILLAR_META: PillarMeta[] = [
  { n: 1, icon: <Network className="h-5 w-5" />,   hue: 188 },
  { n: 2, icon: <Activity className="h-5 w-5" />,  hue: 142 },
  { n: 3, icon: <Telescope className="h-5 w-5" />, hue:  38 },
  { n: 4, icon: <Layers className="h-5 w-5" />,    hue: 268 },
  { n: 5, icon: <Eye className="h-5 w-5" />,       hue:  22 },
];

export function ChPillars({ t }: { t: TFn }) {
  return (
    <ChapterShell id="pillars" no="04" season="summer" titleKey="ch04" t={t}>
      <PillarsStyles />

      <Prose delay={0.4}>{t('pillars_intro')}</Prose>

      <div className="pillars-stage mt-16">
        {PILLAR_META.map((p, i) => (
          <PillarColumn
            key={p.n}
            n={p.n}
            icon={p.icon}
            hue={p.hue}
            name={t(`pillar_${p.n}_name`)}
            body={t(`pillar_${p.n}_body`)}
            index={i}
          />
        ))}
      </div>

      <Prose delay={1.4} className="mt-16">{t('pillars_equilibrium')}</Prose>
      <Prose delay={1.55}>{t('pillars_objection')}</Prose>
      <Prose delay={1.75}>{t('pillars_close')}</Prose>
    </ChapterShell>
  );
}

function PillarColumn({
  n, icon, hue, name, body, index,
}: {
  n:     number;
  icon:  React.ReactNode;
  hue:   number;
  name:  string;
  body:  string;
  index: number;
}) {
  return (
    <motion.div
      className="pillar-column"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12%' }}
      transition={{ duration: 1.2, ease: FEATHER, delay: 0.15 + index * 0.1 }}
      style={{ ['--pillar-hue' as any]: hue } as React.CSSProperties}
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
      <div className="pillar-icon">{icon}</div>
      <div className="pillar-name">{name}</div>
      <div className="pillar-body">{body}</div>
      <div className="pillar-no">{String(n).padStart(2, '0')}</div>
    </motion.div>
  );
}

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
