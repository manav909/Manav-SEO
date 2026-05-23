/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChCompare.tsx
   Chapter 07 — Why This, Not That. Monsoon (continuing).

   Four-column comparison table. Each row is a capability;
   each column is a class of provider (SEO SEASON / Traditional
   Agency / DIY Tool). Cell values render as glyphs:
     check  yes
     minus  partial / sometimes
     x      no
     text   for free-form values

   The SEO SEASON column is highlighted via accent border. No false
   modesty — these comparisons reflect what the software actually
   does versus what is observable in the market.
══════════════════════════════════════════════════════════════════════ */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, Minus, X } from 'lucide-react';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

interface Row {
  capability: string;
  season:     string;
  agency:     string;
  diy:        string;
}

const ROWS: Row[] = [
  { capability: 'Live data, not retrospective',          season: 'yes', agency: 'no',     diy: 'partial' },
  { capability: 'Per-campaign baselines',                season: 'yes', agency: 'no',     diy: 'no'      },
  { capability: 'Honest gap acknowledgment',             season: 'yes', agency: 'no',     diy: 'no'      },
  { capability: 'Client audits every action',            season: 'yes', agency: 'no',     diy: 'no'      },
  { capability: 'AI-era ready (LLM visibility)',         season: 'yes', agency: 'rare',   diy: 'yes'     },
  { capability: 'No black-box reports',                  season: 'yes', agency: 'no',     diy: 'partial' },
  { capability: 'Pillar-based architecture',             season: 'yes', agency: 'ad hoc', diy: 'no'      },
  { capability: 'Source-cited recommendations',          season: 'yes', agency: 'rare',   diy: 'no'      },
  { capability: 'Human accountability',                  season: 'yes', agency: 'yes',    diy: 'no'      },
  { capability: 'Years of operator experience',          season: 'yes', agency: 'yes',    diy: 'no'      },
  { capability: 'Charges for work done, not retainer',   season: 'yes', agency: 'no',     diy: 'monthly' },
];

export function ChCompare({ t }: { t: TFn }) {
  return (
    <ChapterShell id="compare" no="07" season="monsoon" titleKey="ch07" t={t}>
      <CompareStyles />

      <Prose delay={0.4}>
        Three ways a serious brand can do SEO today. Pick a traditional agency
        and accept the opacity. Pick an AI-only platform and accept that
        nobody is accountable. Or hire an agency that runs on its own
        verifiable infrastructure.
      </Prose>

      <Prose delay={0.6}>
        Direct comparison below. No softening. The question isn't whether
        SEO SEASON is "good" — it's whether the alternatives can do what a
        serious brand needs in 2026.
      </Prose>

      <motion.div
        className="compare-table mt-12"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-8%' }}
        transition={{ duration: 1.2, ease: FEATHER, delay: 0.2 }}
      >
        <div className="compare-row compare-row-head">
          <div className="compare-cell compare-cell-cap">Capability</div>
          <div className="compare-cell compare-cell-season">SEO SEASON</div>
          <div className="compare-cell">Traditional Agency</div>
          <div className="compare-cell">AI-Only Platform</div>
        </div>

        {ROWS.map((r, i) => (
          <motion.div
            key={i}
            className="compare-row"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-8%' }}
            transition={{ duration: 0.8, ease: FEATHER, delay: 0.05 + i * 0.04 }}
          >
            <div className="compare-cell compare-cell-cap">{r.capability}</div>
            <CompareCell value={r.season} highlight />
            <CompareCell value={r.agency} />
            <CompareCell value={r.diy} />
          </motion.div>
        ))}
      </motion.div>

      <Prose delay={1.4} className="mt-12">
        Pricing note: traditional agencies charge a retainer regardless of
        work shipped. AI-only platforms charge a subscription regardless of
        work shipped. SEO SEASON charges for actual work — every action
        timestamped, every line item counted, every invoice defensible.
      </Prose>
    </ChapterShell>
  );
}

function CompareCell({ value, highlight = false }: { value: string; highlight?: boolean }) {
  const rendered = useMemo(() => {
    if (value === 'yes')     return { node: <Check className="h-3.5 w-3.5" />, cls: 'cv-yes'   };
    if (value === 'partial') return { node: <Minus className="h-3.5 w-3.5" />, cls: 'cv-partial' };
    if (value === 'no')      return { node: <X className="h-3.5 w-3.5" />,     cls: 'cv-no'    };
    return { node: <span className="cv-text-label">{value}</span>, cls: 'cv-text' };
  }, [value]);

  return (
    <div className={`compare-cell compare-value ${rendered.cls} ${highlight ? 'compare-value-highlight' : ''}`}>
      {rendered.node}
    </div>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

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
      .cv-partial { color: hsla(48, 70%, 70%, 0.85); }
      .cv-no      { color: rgba(255,255,255,0.28); }
      .cv-text-label {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.75rem;
        letter-spacing: 0.06em;
        color: var(--m-ink-soft);
        text-transform: lowercase;
      }
      .compare-value-highlight {
        position: relative;
      }
      .compare-value-highlight::before {
        content: '';
        position: absolute;
        inset: -4px -8px;
        border-radius: 8px;
        background: hsla(var(--ch-hue), 60%, 50%, 0.08);
        border: 0.5px solid hsla(var(--ch-hue), 60%, 55%, 0.25);
        z-index: -1;
      }
      @media (max-width: 720px) {
        .compare-row { grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 0.3rem; font-size: 0.78rem; }
        .compare-cell-cap { font-size: 0.85rem; }
      }
    `}</style>
  );
}
