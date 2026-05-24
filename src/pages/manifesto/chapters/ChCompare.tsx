/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChCompare.tsx
   Chapter 07 — Why This, Not That. Monsoon (continuing).

   All prose, headers, row labels, and text-value cells localized.
══════════════════════════════════════════════════════════════════════ */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, Minus, X } from 'lucide-react';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

/* Row schema: each row's text cells are either symbol codes ('yes',
   'partial', 'no') OR free-form values which are themselves localized
   via dedicated keys (compare_val_adhoc, compare_val_rare, etc). */
type CellValue = 'yes' | 'partial' | 'no' | 'rare' | 'adhoc' | 'monthly';

const ROWS: { n: number; season: CellValue; agency: CellValue; diy: CellValue }[] = [
  { n: 1,  season: 'yes', agency: 'no',     diy: 'partial' },
  { n: 2,  season: 'yes', agency: 'no',     diy: 'no'      },
  { n: 3,  season: 'yes', agency: 'no',     diy: 'no'      },
  { n: 4,  season: 'yes', agency: 'no',     diy: 'no'      },
  { n: 5,  season: 'yes', agency: 'rare',   diy: 'yes'     },
  { n: 6,  season: 'yes', agency: 'no',     diy: 'partial' },
  { n: 7,  season: 'yes', agency: 'adhoc',  diy: 'no'      },
  { n: 8,  season: 'yes', agency: 'rare',   diy: 'no'      },
  { n: 9,  season: 'yes', agency: 'yes',    diy: 'no'      },
  { n: 10, season: 'yes', agency: 'yes',    diy: 'no'      },
  { n: 11, season: 'yes', agency: 'no',     diy: 'no'      },
  { n: 12, season: 'yes', agency: 'no',     diy: 'monthly' },
];

export function ChCompare({ t }: { t: TFn }) {
  return (
    <ChapterShell id="compare" no="07" season="monsoon" titleKey="ch07" t={t}>
      <CompareStyles />

      <Prose delay={0.4}>{t('compare_1')}</Prose>
      <Prose delay={0.6}>{t('compare_2')}</Prose>

      <motion.div
        className="compare-table mt-12"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-8%' }}
        transition={{ duration: 1.2, ease: FEATHER, delay: 0.2 }}
      >
        <div className="compare-row compare-row-head">
          <div className="compare-cell compare-cell-cap">{t('compare_header_cap')}</div>
          <div className="compare-cell compare-cell-season">{t('compare_header_season')}</div>
          <div className="compare-cell">{t('compare_header_agency')}</div>
          <div className="compare-cell">{t('compare_header_diy')}</div>
        </div>

        {ROWS.map((r, i) => (
          <motion.div
            key={r.n}
            className="compare-row"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-8%' }}
            transition={{ duration: 0.8, ease: FEATHER, delay: 0.05 + i * 0.04 }}
          >
            <div className="compare-cell compare-cell-cap">{t(`compare_row_${r.n}`)}</div>
            <CompareCell value={r.season} t={t} highlight />
            <CompareCell value={r.agency} t={t} />
            <CompareCell value={r.diy}    t={t} />
          </motion.div>
        ))}
      </motion.div>

      <Prose delay={1.4} className="mt-12">{t('compare_close')}</Prose>
    </ChapterShell>
  );
}

function CompareCell({
  value, t, highlight = false,
}: { value: CellValue; t: TFn; highlight?: boolean }) {
  const rendered = useMemo(() => {
    if (value === 'yes')     return { node: <Check className="h-3.5 w-3.5" />, cls: 'cv-yes'     };
    if (value === 'partial') return { node: <Minus className="h-3.5 w-3.5" />, cls: 'cv-partial' };
    if (value === 'no')      return { node: <X className="h-3.5 w-3.5" />,     cls: 'cv-no'      };
    /* Text values are localized via compare_val_* keys */
    const textKey =
      value === 'rare'    ? 'compare_val_rare' :
      value === 'adhoc'   ? 'compare_val_adhoc' :
      value === 'monthly' ? 'compare_val_monthly' : '';
    return { node: <span className="cv-text-label">{t(textKey)}</span>, cls: 'cv-text' };
  }, [value, t]);

  return (
    <div className={`compare-cell compare-value ${rendered.cls} ${highlight ? 'compare-value-highlight' : ''}`}>
      {rendered.node}
    </div>
  );
}

function CompareStyles() {
  return (
    <style>{`
      .compare-table {
        border-top: 0.5px solid var(--m-hairline-s);
      }
      .compare-row {
        display: grid;
        grid-template-columns: 2.2fr 1fr 1fr 1fr;
        gap: 0.5rem;
        align-items: center;
        padding: 0.85rem 0;
        border-bottom: 0.5px solid var(--m-hairline);
      }
      .compare-row-head {
        border-bottom: 0.5px solid var(--m-hairline-s);
      }
      .compare-row-head .compare-cell {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--m-ink-soft);
      }
      .compare-row-head .compare-cell-season {
        color: hsla(var(--ch-hue), 60%, 78%, 0.95);
      }
      .compare-cell {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.88rem;
        color: var(--m-ink-medium);
      }
      .compare-cell-cap {
        font-family: ui-serif, Georgia, serif;
        font-size: 1rem;
        color: var(--m-ink-strong);
        line-height: 1.35;
      }
      .compare-value {
        display: flex; align-items: center;
        justify-content: center;
        height: 24px;
      }
      .cv-yes     { color: hsla(142, 65%, 72%, 0.95); }
      .cv-partial { color: hsla(38, 70%, 75%, 0.85); }
      .cv-no      { color: hsla(0, 60%, 70%, 0.7); }
      .cv-text    {
        color: var(--m-ink-medium);
        font-size: 0.78rem;
        font-style: italic;
      }
      .compare-value-highlight.cv-yes {
        color: hsla(142, 75%, 78%, 1);
        text-shadow: 0 0 12px hsla(142, 75%, 60%, 0.4);
      }
      @media (max-width: 720px) {
        .compare-row {
          grid-template-columns: 1.6fr 1fr 1fr 1fr;
          font-size: 0.85rem;
          gap: 0.3rem;
        }
        .compare-cell-cap { font-size: 0.85rem; }
      }
    `}</style>
  );
}
