/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChData.tsx
   Chapter 09 — Authentic Data Doctrine. Autumn (continuing).

   All prose localized: data_intro, data_gaps, data_inferred_html
   (uses <em> tags via dangerouslySetInnerHTML), data_statement,
   data_source_1_name/_role, data_source_2_name/_role,
   data_source_status (shared between the two source cards).
══════════════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import { ChapterShell, Prose, Statement } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

export function ChData({ t }: { t: TFn }) {
  return (
    <ChapterShell id="data" no="09" season="autumn" titleKey="ch09" t={t}>
      <DataStyles />

      <Prose delay={0.4}>{t('data_intro')}</Prose>

      <div className="data-sources mt-14">
        <DataSourceCard
          name={t('data_source_1_name')}
          role={t('data_source_1_role')}
          status={t('data_source_status')}
          delay={0.2}
        />
        <DataSourceCard
          name={t('data_source_2_name')}
          role={t('data_source_2_role')}
          status={t('data_source_status')}
          delay={0.4}
        />
      </div>

      <Prose delay={1.0} className="mt-12">{t('data_gaps')}</Prose>

      <Prose delay={1.2}>
        <span dangerouslySetInnerHTML={{ __html: t('data_inferred_html') }} />
      </Prose>

      <Statement delay={1.4}>{t('data_statement')}</Statement>
    </ChapterShell>
  );
}

function DataSourceCard({
  name, role, status, delay,
}: { name: string; role: string; status: string; delay: number }) {
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
        <span className="data-source-status">{status}</span>
      </div>
      <div className="data-source-name">{name}</div>
      <div className="data-source-role">{role}</div>
    </motion.div>
  );
}

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
