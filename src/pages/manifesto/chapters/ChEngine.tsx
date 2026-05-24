/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChEngine.tsx
   Chapter 06 — The Engine Room. Monsoon.

   All prose, spec labels/descriptors, live-ops stat labels/units, and
   panel headers localized via copy.ts.
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Cpu, Gauge, Radar, Layers, Archive, Clock,
} from 'lucide-react';
import { ChapterShell, Prose, Statement } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

interface SpecMeta {
  n:     1 | 2 | 3 | 4 | 5 | 6;
  value: string;
  icon:  React.ReactNode;
}

const SPEC_META: SpecMeta[] = [
  { n: 1, value: '12',    icon: <Cpu className="h-4 w-4" />     },
  { n: 2, value: 'MIN',   icon: <Gauge className="h-4 w-4" />   },
  { n: 3, value: '5+',    icon: <Radar className="h-4 w-4" />   },
  { n: 4, value: '∞',     icon: <Layers className="h-4 w-4" />  },
  { n: 5, value: '100%',  icon: <Archive className="h-4 w-4" /> },
  { n: 6, value: '24/7',  icon: <Clock className="h-4 w-4" />   },
];

export function ChEngine({ t }: { t: TFn }) {
  return (
    <ChapterShell id="engine" no="06" season="monsoon" titleKey="ch06" t={t}>
      <EngineStyles />

      <Prose delay={0.4}>{t('engine_intro_1')}</Prose>
      <Prose delay={0.55}>{t('engine_intro_2')}</Prose>
      <Prose delay={0.7}>{t('engine_intro_3')}</Prose>

      <div className="engine-spec-grid mt-14">
        {SPEC_META.map((s, i) => (
          <SpecCard
            key={s.n}
            n={s.n}
            value={s.value}
            icon={s.icon}
            label={t(`spec_${s.n}_label`)}
            unit={s.n === 1 ? '' : t(`spec_${s.n}_unit`)}
            descriptor={t(`spec_${s.n}_descriptor`)}
            label_spec={t('engine_spec_word')}
            index={i}
          />
        ))}
      </div>

      <LiveOpsPanel t={t} />

      <Prose delay={0.4} className="mt-14">{t('engine_architect_line')}</Prose>

      <Statement delay={0.4}>{t('engine_statement')}</Statement>

      <Prose delay={0.6} className="mt-10">{t('engine_close')}</Prose>
    </ChapterShell>
  );
}

function SpecCard({
  n, value, icon, label, unit, descriptor, label_spec, index,
}: {
  n:          number;
  value:      string;
  icon:       React.ReactNode;
  label:      string;
  unit:       string;
  descriptor: string;
  label_spec: string;
  index:      number;
}) {
  return (
    <motion.div
      className="spec-card"
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12%' }}
      transition={{ duration: 1.1, ease: FEATHER, delay: 0.1 + index * 0.08 }}
    >
      <div className="spec-top">
        <div className="spec-icon">{icon}</div>
        <div className="spec-no">{label_spec} · {String(n).padStart(2, '0')}</div>
      </div>

      <div className="spec-value-row">
        <div className="spec-value">{value}</div>
        {unit && <div className="spec-unit">{unit}</div>}
      </div>

      <div className="spec-label">{label}</div>
      <div className="spec-descriptor">{descriptor}</div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   LIVE OPERATIONS PANEL — current operating status

   All labels + units localized. ◆ TBD placeholders for Manav:
   - liveops_unit_since:  Q4 2025 (Continuous Since)
   - liveops_unit_datapoints display: ~184K Events
═══════════════════════════════════════════════════════════════════ */

interface LiveStatMeta {
  labelKey:    string;
  unitKey:     string;
  value:       number | string;
  display?:    string;
  displayKey?: string;
  prefix?:     string;
  animate:     boolean;
}

const LIVE_STATS_META: LiveStatMeta[] = [
  { labelKey: 'liveops_stat_engines',    unitKey: 'liveops_unit_engines',    value: 12,    animate: true  },
  { labelKey: 'liveops_stat_surfaces',   unitKey: 'liveops_unit_surfaces',   value: 5,     animate: true  },
  { labelKey: 'liveops_stat_refresh',    unitKey: 'liveops_unit_refresh',    value: 4,     prefix: '<',   animate: true  },
  /* ◆ TBD: month/quarter ops went live — display localized via liveops_since_display */
  { labelKey: 'liveops_stat_since',      unitKey: '_skip',                   value: 'Q4',  displayKey: 'liveops_since_display', animate: false },
  /* ◆ TBD: avg daily event count */
  { labelKey: 'liveops_stat_datapoints', unitKey: 'liveops_unit_datapoints', value: 184,   display: '~184K',   animate: false },
  { labelKey: 'liveops_stat_retention',  unitKey: 'liveops_unit_retention',  value: 100,   animate: true  },
];

const VERTICAL_KEYS = ['vertical_saas', 'vertical_dtc', 'vertical_legal', 'vertical_local', 'vertical_b2b'];

function LiveOpsPanel({ t }: { t: TFn }) {
  return (
    <motion.div
      className="live-ops-panel mt-14"
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12%' }}
      transition={{ duration: 1.3, ease: FEATHER }}
    >
      <div className="live-ops-header">
        <div className="live-ops-pulse-wrap">
          <span className="live-ops-pulse" />
          <span className="live-ops-pulse-ring" />
        </div>
        <span className="live-ops-title">{t('liveops_title')}</span>
        <span className="live-ops-separator" />
        <span className="live-ops-status">{t('liveops_status')}</span>
      </div>

      <div className="live-ops-grid">
        {LIVE_STATS_META.map((s, i) => (
          <LiveOpsRow
            key={s.labelKey}
            label={t(s.labelKey)}
            unit={s.unitKey === '_skip' ? '' : t(s.unitKey)}
            value={s.value}
            display={s.displayKey ? t(s.displayKey) : s.display}
            prefix={s.prefix}
            animate={s.animate}
            index={i}
          />
        ))}
      </div>

      <div className="live-ops-footer">
        <span className="live-ops-footer-label">{t('liveops_verticals')}</span>
        <span className="live-ops-footer-sep">·</span>
        {VERTICAL_KEYS.map((vk) => (
          <span key={vk} className="live-ops-chip">{t(vk)}</span>
        ))}
      </div>
    </motion.div>
  );
}

function LiveOpsRow({
  label, unit, value, display, prefix, animate, index,
}: {
  label:    string;
  unit:     string;
  value:    number | string;
  display?: string;
  prefix?:  string;
  animate:  boolean;
  index:    number;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [displayValue, setDisplayValue] = useState<string>(
    animate ? '0' : (display ?? String(value))
  );

  useEffect(() => {
    if (!animate) return;
    const el = rowRef.current;
    if (!el) return;
    let cancelled = false;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !cancelled) {
            cancelled = true;
            const target = Number(value);
            const durationMs = 1200 + index * 80;
            const startTime = performance.now();
            const tick = (now: number) => {
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / durationMs, 1);
              const eased = 1 - Math.pow(1 - progress, 3);
              const current = Math.round(target * eased);
              setDisplayValue((prefix ?? '') + current.toString());
              if (progress < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            obs.disconnect();
          }
        });
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => { cancelled = true; obs.disconnect(); };
  }, [animate, value, prefix, index]);

  return (
    <motion.div
      ref={rowRef}
      className="live-ops-row"
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-12%' }}
      transition={{ duration: 0.8, ease: FEATHER, delay: 0.2 + index * 0.07 }}
    >
      <span className="live-ops-row-label">{label.toUpperCase()}</span>
      <span className="live-ops-row-dotline" />
      <span className="live-ops-row-value">{displayValue}</span>
      <span className="live-ops-row-unit">{unit.toUpperCase()}</span>
    </motion.div>
  );
}

function EngineStyles() {
  return (
    <style>{`
      .engine-spec-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.2rem;
      }
      .spec-card {
        position: relative;
        padding: 1.5rem 1.6rem 1.7rem 1.6rem;
        border-radius: 14px;
        background: linear-gradient(180deg,
          hsla(var(--ch-hue), 50%, 28%, 0.12),
          rgba(255,255,255,0.012));
        border: 0.5px solid var(--m-hairline-s);
        overflow: hidden;
        display: flex; flex-direction: column;
        min-height: 240px;
      }
      .spec-card::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg,
          transparent,
          hsla(var(--ch-hue), 70%, 65%, 0.7) 30%,
          hsla(var(--ch-hue), 80%, 75%, 0.9) 50%,
          hsla(var(--ch-hue), 70%, 65%, 0.7) 70%,
          transparent);
      }
      .spec-card::after {
        content: '';
        position: absolute;
        top: 0; bottom: 0; left: 0;
        width: 2px;
        background: linear-gradient(180deg,
          hsla(var(--ch-hue), 80%, 70%, 0.65),
          hsla(var(--ch-hue), 50%, 50%, 0.1));
      }
      .spec-top {
        display: flex; align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }
      .spec-icon {
        display: flex; align-items: center; justify-content: center;
        width: 28px; height: 28px;
        border-radius: 6px;
        background: hsla(var(--ch-hue), 60%, 50%, 0.12);
        border: 0.5px solid hsla(var(--ch-hue), 60%, 50%, 0.3);
        color: hsla(var(--ch-hue), 70%, 78%, 0.95);
      }
      .spec-no {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.6rem;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--m-ink-soft);
      }
      .spec-value-row {
        display: flex; align-items: baseline;
        gap: 0.5rem;
        margin-bottom: 0.6rem;
      }
      .spec-value {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(2.6rem, 5vw, 3.6rem);
        font-weight: 300;
        line-height: 0.95;
        letter-spacing: -0.04em;
        color: var(--m-ink-strong);
        font-feature-settings: 'tnum' 1;
        background: linear-gradient(180deg,
          rgba(255, 255, 255, 1),
          hsla(var(--ch-hue), 70%, 80%, 0.85));
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .spec-unit {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: hsla(var(--ch-hue), 50%, 78%, 0.75);
      }
      .spec-label {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: hsla(var(--ch-hue), 60%, 80%, 0.95);
        margin-bottom: 0.85rem;
        padding-bottom: 0.85rem;
        border-bottom: 0.5px dashed hsla(var(--ch-hue), 40%, 50%, 0.25);
      }
      .spec-descriptor {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.85rem;
        line-height: 1.6;
        color: var(--m-ink-medium);
        flex: 1;
      }
      @media (max-width: 560px) {
        .engine-spec-grid { grid-template-columns: 1fr; }
        .spec-card { min-height: auto; }
      }

      /* LIVE OPS PANEL — unchanged */
      .live-ops-panel {
        position: relative;
        padding: 1.6rem 1.8rem 1.8rem 1.8rem;
        border-radius: 12px;
        background:
          linear-gradient(180deg,
            hsla(var(--ch-hue), 50%, 22%, 0.18),
            rgba(0, 0, 0, 0.25)),
          radial-gradient(circle at 20% 0%,
            hsla(var(--ch-hue), 60%, 50%, 0.06),
            transparent 60%);
        border: 0.5px solid hsla(var(--ch-hue), 55%, 50%, 0.32);
        box-shadow:
          inset 0 1px 0 0 hsla(var(--ch-hue), 60%, 60%, 0.12),
          0 18px 50px -20px hsla(var(--ch-hue), 70%, 30%, 0.45);
        overflow: hidden;
      }
      .live-ops-panel::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg,
          transparent,
          hsla(var(--ch-hue), 80%, 70%, 0.55) 30%,
          hsla(var(--ch-hue), 90%, 80%, 0.85) 50%,
          hsla(var(--ch-hue), 80%, 70%, 0.55) 70%,
          transparent);
      }
      .live-ops-header {
        display: flex; align-items: center;
        gap: 0.7rem;
        padding-bottom: 1.2rem;
        margin-bottom: 1.4rem;
        border-bottom: 0.5px dashed hsla(var(--ch-hue), 40%, 60%, 0.22);
      }
      .live-ops-pulse-wrap { position: relative; width: 10px; height: 10px; flex-shrink: 0; }
      .live-ops-pulse {
        position: absolute; inset: 0; border-radius: 50%;
        background: hsla(142, 75%, 60%, 1);
        box-shadow: 0 0 14px hsla(142, 75%, 55%, 0.85);
        animation: lopsPulse 2.2s ease-in-out infinite;
      }
      .live-ops-pulse-ring {
        position: absolute; inset: -3px; border-radius: 50%;
        border: 1px solid hsla(142, 70%, 55%, 0.5);
        animation: lopsRing 2.2s ease-out infinite;
      }
      @keyframes lopsPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(0.8); opacity: 0.65; }
      }
      @keyframes lopsRing {
        0% { transform: scale(0.6); opacity: 0.9; }
        100% { transform: scale(2.2); opacity: 0; }
      }
      .live-ops-title {
        font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.7rem;
        font-weight: 800;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: hsla(var(--ch-hue), 65%, 82%, 0.97);
      }
      .live-ops-separator {
        flex: 1; height: 1px;
        background: linear-gradient(90deg,
          hsla(var(--ch-hue), 60%, 60%, 0.18),
          transparent 80%);
      }
      .live-ops-status {
        font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.62rem;
        font-weight: 800;
        letter-spacing: 0.32em;
        text-transform: uppercase;
        color: hsla(142, 80%, 75%, 1);
        padding: 0.2rem 0.6rem;
        border: 0.5px solid hsla(142, 70%, 55%, 0.35);
        border-radius: 4px;
        background: hsla(142, 70%, 40%, 0.08);
      }
      .live-ops-grid { display: flex; flex-direction: column; gap: 0.4rem; }
      .live-ops-row {
        display: grid;
        grid-template-columns: 12rem 1fr auto 4rem;
        align-items: baseline;
        gap: 0.6rem;
        padding: 0.55rem 0;
        border-bottom: 0.5px dashed hsla(var(--ch-hue), 30%, 50%, 0.12);
      }
      .live-ops-row:last-child { border-bottom: none; }
      .live-ops-row-label {
        font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        color: var(--m-ink-soft);
      }
      .live-ops-row-dotline {
        height: 1px;
        background-image: radial-gradient(circle, hsla(var(--ch-hue), 30%, 60%, 0.35) 0.7px, transparent 1.2px);
        background-size: 5px 1px;
        background-repeat: repeat-x;
        align-self: center;
        opacity: 0.7;
      }
      .live-ops-row-value {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.6rem, 3vw, 2rem);
        font-weight: 300;
        letter-spacing: -0.025em;
        line-height: 1;
        font-feature-settings: 'tnum' 1;
        background: linear-gradient(180deg,
          rgba(255, 255, 255, 1),
          hsla(var(--ch-hue), 70%, 80%, 0.85));
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        text-align: right;
        min-width: 3.5rem;
      }
      .live-ops-row-unit {
        font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.6rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        color: hsla(var(--ch-hue), 50%, 75%, 0.7);
        text-align: left;
      }
      .live-ops-footer {
        display: flex; align-items: center;
        gap: 0.5rem;
        margin-top: 1.4rem;
        padding-top: 1.2rem;
        border-top: 0.5px dashed hsla(var(--ch-hue), 30%, 50%, 0.18);
        flex-wrap: wrap;
      }
      .live-ops-footer-label {
        font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.6rem;
        font-weight: 700;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: var(--m-ink-soft);
      }
      .live-ops-footer-sep { color: var(--m-ink-soft); opacity: 0.4; }
      .live-ops-chip {
        font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        color: hsla(var(--ch-hue), 60%, 78%, 0.85);
        padding: 0.18rem 0.55rem;
        border: 0.5px solid hsla(var(--ch-hue), 50%, 55%, 0.28);
        border-radius: 3px;
        background: hsla(var(--ch-hue), 50%, 30%, 0.15);
      }
      @media (max-width: 720px) {
        .live-ops-panel { padding: 1.2rem 1.2rem 1.4rem 1.2rem; }
        .live-ops-row { grid-template-columns: 7rem 1fr auto 3rem; gap: 0.4rem; }
        .live-ops-row-label { font-size: 0.6rem; letter-spacing: 0.14em; }
        .live-ops-row-value { font-size: 1.4rem; }
        .live-ops-row-unit { font-size: 0.52rem; }
      }
    `}</style>
  );
}
