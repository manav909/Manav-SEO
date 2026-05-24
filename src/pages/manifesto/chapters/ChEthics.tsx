/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChEthics.tsx
   Chapter 08 — What We Will & Won't Do. Autumn.

   All prose, column labels, and 14 will/wont lines localized.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

const N7 = [1, 2, 3, 4, 5, 6, 7] as const;

export function ChEthics({ t }: { t: TFn }) {
  return (
    <ChapterShell id="ethics" no="08" season="autumn" titleKey="ch08" t={t}>
      <EthicsStyles />

      <Prose delay={0.4}>{t('ethics_intro')}</Prose>

      <div className="ethics-grid mt-14">
        <div className="ethics-col">
          <div className="ethics-col-label ethics-will">{t('ethics_col_will')}</div>
          {N7.map((n, i) => (
            <EthicsLine key={`w-${n}`} text={t(`ethics_will_${n}`)} kind="will" index={i} />
          ))}
        </div>
        <div className="ethics-col">
          <div className="ethics-col-label ethics-wont">{t('ethics_col_wont')}</div>
          {N7.map((n, i) => (
            <EthicsLine key={`x-${n}`} text={t(`ethics_wont_${n}`)} kind="wont" index={i} />
          ))}
        </div>
      </div>

      <Prose delay={1.6} className="mt-14">{t('ethics_close')}</Prose>
    </ChapterShell>
  );
}

function EthicsLine({
  text, kind, index,
}: {
  text:  string;
  kind:  'will' | 'wont';
  index: number;
}) {
  return (
    <motion.div
      className={`ethics-line ethics-line-${kind}`}
      initial={{ opacity: 0, x: kind === 'will' ? -10 : 10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 0.9, ease: FEATHER, delay: 0.1 + index * 0.06 }}
    >
      <span className="ethics-icon">
        {kind === 'will'
          ? <Check className="h-3.5 w-3.5" />
          : <X className="h-3.5 w-3.5" />}
      </span>
      <span className="ethics-text">{text}</span>
    </motion.div>
  );
}

function EthicsStyles() {
  return (
    <style>{`
      .ethics-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2.8rem;
      }
      .ethics-col {
        display: flex; flex-direction: column;
        gap: 0.6rem;
      }
      .ethics-col-label {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        padding-bottom: 1rem;
        border-bottom: 0.5px solid var(--m-hairline-s);
        margin-bottom: 0.4rem;
      }
      .ethics-will { color: hsla(142, 65%, 72%, 0.95); }
      .ethics-wont { color: hsla(0, 65%, 75%, 0.85); }
      .ethics-line {
        display: grid;
        grid-template-columns: 22px 1fr;
        gap: 0.85rem;
        align-items: flex-start;
        padding: 0.5rem 0;
      }
      .ethics-icon {
        display: flex; align-items: center; justify-content: center;
        width: 22px; height: 22px;
        border-radius: 50%;
        margin-top: 0.15rem;
        flex-shrink: 0;
      }
      .ethics-line-will .ethics-icon {
        background: hsla(142, 60%, 50%, 0.18);
        color:      hsla(142, 70%, 78%, 0.95);
      }
      .ethics-line-wont .ethics-icon {
        background: hsla(0, 60%, 50%, 0.15);
        color:      hsla(0, 70%, 78%, 0.85);
      }
      .ethics-text {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.05rem;
        line-height: 1.45;
        color: var(--m-ink-strong);
      }
      @media (max-width: 720px) {
        .ethics-grid { grid-template-columns: 1fr; gap: 3rem; }
      }
    `}</style>
  );
}
