/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChHowSearch.tsx
   Chapter 03 — How Search Actually Works Now. Spring (continuing).

   The hard-truth chapter. Two columns side by side:
     LEFT  "What still compounds"  — emerald check marks
     RIGHT "What quietly died"     — rose minus marks
   Each item has a one-line label + a short hard-fact note.

   No diplomacy. Each note is grounded in observable behavior of
   search engines in 2025-2026. If a future Manav wants to update
   the items, this is the only file to touch.
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { Check, Minus } from 'lucide-react';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

interface Trend {
  kind:  'living' | 'dead';
  label: string;
  note:  string;
}

const TRENDS: Trend[] = [
  { kind: 'living', label: 'Topical authority',         note: 'Built through structured content clusters. Compounds across years; ranking models read it.' },
  { kind: 'living', label: 'Internal architecture',     note: 'Links between pages signal depth. Schema markup matters more than ever as LLMs parse it.' },
  { kind: 'living', label: 'Off-page signals',          note: 'Backlinks from real publications. Brand mentions. Presence in LLM training corpora is the new dark social.' },
  { kind: 'living', label: 'Continuous monitoring',     note: "Drift caught early is cheap. Drift caught late is a quarter lost. Most agencies notice neither." },
  { kind: 'dead',   label: 'Keyword density',           note: 'Modern ranking models read meaning, not occurrence counts. Stuffing is detectable in seconds.' },
  { kind: 'dead',   label: 'Link buying',               note: 'Algorithmic devaluation plus manual penalty risk. The math has been negative since 2017.' },
  { kind: 'dead',   label: 'AI content farms',          note: 'Generative content with no original research or expertise gets quietly suppressed. The signal exists.' },
  { kind: 'dead',   label: '"Quick wins" listicles',    note: 'The 2014 playbook. Search has moved twelve years past it and the click-through curves prove it.' },
];

export function ChHowSearch({ t }: { t: TFn }) {
  return (
    <ChapterShell id="how-search" no="03" season="spring" titleKey="ch03" t={t}>
      <HowSearchStyles />

      <Prose delay={0.4}>
        Search is not what it was three years ago.
      </Prose>
      <Prose delay={0.55}>
        Google now answers many queries with AI summaries above the blue links.
        ChatGPT, Claude, Perplexity, and Gemini absorb the queries that used to
        start in a browser. Click-through rate from position one is dropping.
        Zero-click outcomes are climbing. Brand presence in LLM training data is
        the new dark social — invisible to most dashboards, decisive in practice.
      </Prose>
      <Prose delay={0.7}>
        Two columns below. What still compounds. What quietly died.
      </Prose>

      <div className="how-grid mt-14">
        <div className="how-col">
          <div className="how-col-label how-col-living">What still compounds</div>
          {TRENDS.filter((x) => x.kind === 'living').map((x, i) => (
            <HowItem key={i} item={x} index={i} />
          ))}
        </div>
        <div className="how-col">
          <div className="how-col-label how-col-dead">What quietly died</div>
          {TRENDS.filter((x) => x.kind === 'dead').map((x, i) => (
            <HowItem key={i} item={x} index={i} />
          ))}
        </div>
      </div>

      <Prose delay={1.4} className="mt-14">
        SEO SEASON is built for what's next, not what was. Every product surface,
        every report, every dashboard assumes the 2026-onward search landscape.
        The agencies still selling 2019 tactics will not be here in 2028.
      </Prose>
    </ChapterShell>
  );
}

function HowItem({ item, index }: { item: Trend; index: number }) {
  return (
    <motion.div
      className={`how-item how-item-${item.kind}`}
      initial={{ opacity: 0, x: item.kind === 'living' ? -12 : 12 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-12%' }}
      transition={{ duration: 1.0, ease: FEATHER, delay: 0.2 + index * 0.1 }}
    >
      <span className="how-icon">
        {item.kind === 'living'
          ? <Check className="h-3.5 w-3.5" />
          : <Minus className="h-3.5 w-3.5" />}
      </span>
      <div className="how-body">
        <div className="how-label">{item.label}</div>
        <div className="how-note">{item.note}</div>
      </div>
    </motion.div>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

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
