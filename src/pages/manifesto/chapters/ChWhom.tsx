/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChWhom.tsx
   Chapter 10 — For Whom This Was Built. Harvest.

   Five client archetypes. Different scales, different business
   models, different goals. The infrastructure underneath is the
   same; what shifts is the lens the client brings to it.

   All titles and bodies are now localized via copy.ts under
   keys whom_intro, whom_N_title, whom_N_body for N = 1..5.
   Supported languages: EN, HI, ES, FR, DE.

   Ordered by recognition speed — most readers find themselves in
   1 or 2 before continuing:
     1. The founder building organic on limited runway
     2. The marketing leader who reports to a board
     3. The local business that has to be the obvious choice
     4. The ecommerce operator competing in the AI-search era
     5. The agency or consultancy that needs operating infrastructure
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell, Prose } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

const ARCHETYPE_KEYS = [1, 2, 3, 4, 5] as const;

export function ChWhom({ t }: { t: TFn }) {
  return (
    <ChapterShell id="whom" no="10" season="harvest" titleKey="ch10" t={t}>
      <WhomStyles />

      <Prose delay={0.4}>{t('whom_intro')}</Prose>

      <div className="whom-stack mt-14">
        {ARCHETYPE_KEYS.map((n, i) => (
          <WhomBlock
            key={n}
            title={t(`whom_${n}_title`)}
            body={t(`whom_${n}_body`)}
            index={i}
          />
        ))}
      </div>
    </ChapterShell>
  );
}

function WhomBlock({
  title, body, index,
}: { title: string; body: string; index: number }) {
  return (
    <motion.div
      className="whom-block"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 1.1, ease: FEATHER, delay: 0.1 + index * 0.08 }}
    >
      <div className="whom-marker" />
      <div className="whom-body">
        <div className="whom-title">{title}</div>
        <div className="whom-text">{body}</div>
      </div>
    </motion.div>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

function WhomStyles() {
  return (
    <style>{`
      .whom-stack {
        display: flex;
        flex-direction: column;
        gap: 1.8rem;
      }
      .whom-block {
        display: grid;
        grid-template-columns: 28px 1fr;
        gap: 1.4rem;
        align-items: flex-start;
        padding: 1.4rem 0;
        border-top: 0.5px solid var(--m-hairline);
      }
      .whom-block:first-of-type {
        border-top: none;
      }
      .whom-marker {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.95);
        box-shadow: 0 0 14px hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.5);
        margin-top: 0.7rem;
        margin-left: 8px;
      }
      .whom-title {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.4rem;
        line-height: 1.3;
        color: var(--m-ink-strong);
        font-weight: 500;
        letter-spacing: -0.015em;
        margin-bottom: 0.7rem;
        max-width: 52ch;
      }
      .whom-text {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.08rem;
        line-height: 1.65;
        color: var(--m-ink-medium);
        max-width: 64ch;
      }
      @media (max-width: 720px) {
        .whom-block { grid-template-columns: 20px 1fr; gap: 1rem; }
        .whom-title { font-size: 1.18rem; }
        .whom-text  { font-size: 1rem; }
      }
    `}</style>
  );
}
