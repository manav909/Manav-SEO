/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChHowSearch.tsx
   Chapter 03 — How Search Actually Works Now. Spring (continuing).

   All prose localized: howsearch_1..3, howsearch_close,
   howsearch_living_label, howsearch_dead_label, plus 4 living and
   4 dead trends each with _label and _note keys.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { Check, Minus } from 'lucide-react';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

const LIVING_INDICES = [1, 2, 3, 4] as const;
const DEAD_INDICES   = [1, 2, 3, 4] as const;

export function ChHowSearch({ t }: { t: TFn }) {
  return (
    <ChapterShell id="how-search" no="03" season="spring" titleKey="ch03" t={t}>
      <HowSearchStyles />

      <Prose delay={0.4}>{t('howsearch_1')}</Prose>
      <Prose delay={0.55}>{t('howsearch_2')}</Prose>
      <Prose delay={0.7}>{t('howsearch_3')}</Prose>

      <div className="how-grid mt-14">
        <div className="how-col">
          <div className="how-col-label how-col-living">{t('howsearch_living_label')}</div>
          {LIVING_INDICES.map((n, i) => (
            <HowItem
              key={`l-${n}`}
              kind="living"
              label={t(`howsearch_living_${n}_label`)}
              note={t(`howsearch_living_${n}_note`)}
              index={i}
            />
          ))}
        </div>
        <div className="how-col">
          <div className="how-col-label how-col-dead">{t('howsearch_dead_label')}</div>
          {DEAD_INDICES.map((n, i) => (
            <HowItem
              key={`d-${n}`}
              kind="dead"
              label={t(`howsearch_dead_${n}_label`)}
              note={t(`howsearch_dead_${n}_note`)}
              index={i}
            />
          ))}
        </div>
      </div>

      <Prose delay={1.4} className="mt-14">{t('howsearch_close')}</Prose>
    </ChapterShell>
  );
}

function HowItem({
  kind, label, note, index,
}: {
  kind:  'living' | 'dead';
  label: string;
  note:  string;
  index: number;
}) {
  return (
    <motion.div
      className={`how-item how-item-${kind}`}
      initial={{ opacity: 0, x: kind === 'living' ? -12 : 12 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-12%' }}
      transition={{ duration: 1.0, ease: FEATHER, delay: 0.2 + index * 0.1 }}
    >
      <span className="how-icon">
        {kind === 'living'
          ? <Check className="h-3.5 w-3.5" />
          : <Minus className="h-3.5 w-3.5" />}
      </span>
      <div className="how-body">
        <div className="how-label">{label}</div>
        <div className="how-note">{note}</div>
      </div>
    </motion.div>
  );
}

function HowSearchStyles() {
  return (
    <style>{`
      .how-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2.5rem;
      }
      .how-col {
        display: flex; flex-direction: column;
        gap: 0.85rem;
      }
      .how-col-label {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        padding-bottom: 1rem;
        border-bottom: 0.5px solid var(--m-hairline-s);
        margin-bottom: 0.5rem;
      }
      .how-col-living { color: hsla(142, 60%, 72%, 0.95); }
      .how-col-dead   { color: hsla(0, 65%, 75%, 0.85); }
      .how-item {
        display: grid;
        grid-template-columns: 24px 1fr;
        gap: 0.85rem;
        align-items: flex-start;
        padding: 0.55rem 0;
      }
      .how-icon {
        display: flex; align-items: center; justify-content: center;
        width: 22px; height: 22px;
        border-radius: 50%;
        margin-top: 0.2rem;
        flex-shrink: 0;
      }
      .how-item-living .how-icon {
        background: hsla(142, 60%, 50%, 0.18);
        color:      hsla(142, 70%, 78%, 0.95);
      }
      .how-item-dead .how-icon {
        background: hsla(0, 60%, 50%, 0.15);
        color:      hsla(0, 70%, 78%, 0.85);
      }
      .how-label {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.12rem;
        line-height: 1.35;
        color: var(--m-ink-strong);
        font-weight: 500;
      }
      .how-note {
        margin-top: 0.3rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.85rem;
        line-height: 1.55;
        color: var(--m-ink-medium);
      }
      @media (max-width: 720px) {
        .how-grid { grid-template-columns: 1fr; gap: 3rem; }
      }
    `}</style>
  );
}
