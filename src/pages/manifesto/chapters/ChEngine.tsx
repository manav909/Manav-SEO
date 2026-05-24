/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChEngine.tsx
   Chapter 06 — The Engine Room. Monsoon.

   The premium spec sheet. Reframed entirely from internal architecture
   to client-facing capability — the way a corporate marketing director
   reads an aircraft cockpit, not a developer's package.json.

   Six capability cards arranged like an instrument cluster:
     12           Intelligence engines firing in sequence
     MIN          Refresh cadence — minutes, not weeks
     5+           Search surfaces monitored (Google + LLMs)
     UNLIMITED    Pillar campaigns concurrent per project
     100%         Action retention — every decision queryable forever
     24/7         Always-on monitoring, year-round

   Engine metaphor extends: V12 power, continuous fire, telemetry over
   slide decks. No internals exposed (no "API functions", no "tables",
   no "React contexts"). What the engine DOES, not how it's built.
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Cpu, Gauge, Radar, Layers, Archive, Clock,
} from 'lucide-react';
import { ChapterShell, Prose, Statement } from '../shared';
import type { TFn } from '../types';
import { FEATHER } from '../types';

interface Spec {
  value:      string;
  unit:       string;
  label:      string;
  descriptor: string;
  icon:       React.ReactNode;
}

const SPECS: Spec[] = [
  {
    value:      '12',
    unit:       '',
    label:      'Intelligence Engines',
    descriptor: "Twelve specialized engines fire in sequence — query analysis, content gap detection, backlink intelligence, cluster mapping, internal link orchestration, off-page authority tracking, technical drift detection, conversion attribution, AI-surface monitoring, SERP volatility scanning, audit logging, and real-time alerting. Each independent. None pausing.",
    icon:       <Cpu className="h-4 w-4" />,
  },
  {
    value:      'MIN',
    unit:       'cadence',
    label:      'Continuous Refresh',
    descriptor: "Our pull cadence is minutes — every query movement, every traffic shift, every backlink change registers as soon as the source publishes it. The publishing latency at Google's end (~48 hours for most query data in Search Console) is theirs, not ours; we name it openly on every chart and tell you exactly when the source last updated. Nothing in between is hidden behind a monthly meeting.",
    icon:       <Gauge className="h-4 w-4" />,
  },
  {
    value:      '5+',
    unit:       'surfaces',
    label:      'Multi-Engine Reach',
    descriptor: "Google. ChatGPT. Claude. Perplexity. Gemini. Visibility tracked across every modern search surface as a first-class signal. The era of 'rank in Google alone' ended around 2024. The engine room treats it that way.",
    icon:       <Radar className="h-4 w-4" />,
  },
  {
    value:      '∞',
    unit:       'concurrent',
    label:      'Campaign Concurrency',
    descriptor: "Run as many pillar campaigns as the brand can support — five, fifty, five hundred. Each campaign carries its own baseline, its own cadence, its own scoreboard. No artificial caps. No 'enterprise tier required.' The architecture scales because it was designed to.",
    icon:       <Layers className="h-4 w-4" />,
  },
  {
    value:      '100%',
    unit:       'retention',
    label:      'Total Audit Depth',
    descriptor: "Every decision logged. Every action timestamped. Every metric source-cited. Day one is always queryable. Year three audits the same way as week three. The complete decision trail is part of the deliverable.",
    icon:       <Archive className="h-4 w-4" />,
  },
  {
    value:      '24/7',
    unit:       'live',
    label:      'Always-On Operation',
    descriptor: "No quiet weekends. No monthly cadence drift. The engine runs continuously — the same way your billing system runs continuously, because enterprise marketing operations stopped being a monthly-meeting discipline somewhere around 2018.",
    icon:       <Clock className="h-4 w-4" />,
  },
];

export function ChEngine({ t }: { t: TFn }) {
  return (
    <ChapterShell id="engine" no="06" season="monsoon" titleKey="ch06" t={t}>
      <EngineStyles />

      <Prose delay={0.4}>
        Behind every campaign we run for a client, twelve specialized
        intelligence engines fire continuously — like cylinders firing in
        sequence inside a precision powerplant. Each handles one class of
        decision; together they carry the full operating load of an
        enterprise SEO program.
      </Prose>

      <Prose delay={0.55}>
        They never sleep. They never drift. They never forget what they have
        seen. The system was designed that way from the first commit — an
        always-on intelligence layer the agency runs on, not a dashboard the
        agency sells.
      </Prose>

      <Prose delay={0.7}>
        This is the infrastructure our agency runs on. You don't license it.
        You hire us, and we run it on your behalf. The spec sheet below
        describes what that buys you — not what we sell.
      </Prose>

      <div className="engine-spec-grid mt-14">
        {SPECS.map((s, i) => (
          <SpecCard key={i} spec={s} index={i} />
        ))}
      </div>

      <LiveOpsPanel />

      <Prose delay={0.4} className="mt-14">
        Every engine above was designed, coded, and integrated by the
        founder personally. The agency runs on a system that has exactly one
        architect — and an architect who answers when called.
      </Prose>

      <Statement delay={0.4}>
        This is what enterprise-grade actually means. A marketing operations
        engine that runs the way your finance system runs — continuously,
        accurately, auditably, every minute of every day.
      </Statement>

      <Prose delay={0.6} className="mt-10">
        The agency next door still operates on slide decks and rank-tracker
        screenshots. We operate on telemetry. The AI-only platforms operate
        on a single prompt and a confident tone. We operate on a team, on
        evidence, on a system that won't lie even if we wanted it to.
      </Prose>
    </ChapterShell>
  );
}

function SpecCard({ spec, index }: { spec: Spec; index: number }) {
  return (
    <motion.div
      className="spec-card"
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12%' }}
      transition={{ duration: 1.1, ease: FEATHER, delay: 0.1 + index * 0.08 }}
    >
      <div className="spec-top">
        <div className="spec-icon">{spec.icon}</div>
        <div className="spec-no">SPEC · {String(index + 1).padStart(2, '0')}</div>
      </div>

      <div className="spec-value-row">
        <div className="spec-value">{spec.value}</div>
        {spec.unit && <div className="spec-unit">{spec.unit}</div>}
      </div>

      <div className="spec-label">{spec.label}</div>
      <div className="spec-descriptor">{spec.descriptor}</div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   LIVE OPERATIONS PANEL — current operating status

   Inserted between the capability spec-grid (above) and the
   architect-attribution prose (below). The spec cards describe what
   the engines CAN do; this panel describes what they ARE doing right
   now. Different visual register — monospaced terminal aesthetic,
   pulsing live indicator, animated counters — so it reads as
   "current operation" rather than "catalog of features."

   Some values are architectural truths (engines=12, surfaces=5,
   refresh<4min, audit retention 100%). Others are operational
   placeholders Manav fills in with current state — they're flagged
   below with ◆ TBD comments so they're easy to find and update.
═══════════════════════════════════════════════════════════════════ */

interface LiveStat {
  label:    string;
  value:    number | string;
  display?: string;          // override the rendered value
  prefix?:  string;          // e.g. "<" or "~"
  unit:     string;
  /* When animate=true, value is treated as a number and counter-animates
     from 0 to target on scroll-in. When false, the display string renders
     as-is. */
  animate:  boolean;
}

const LIVE_STATS: LiveStat[] = [
  { label: 'Engines',           value: 12,    unit: 'Active',    animate: true  },
  { label: 'Search Surfaces',   value: 5,     unit: 'Indexed',   animate: true  },
  { label: 'Refresh Cadence',   value: 4,     prefix: '<',       unit: 'Minutes',         animate: true  },
  /* ◆ TBD: Manav fills — month/quarter operations went live */
  { label: 'Continuous Since',  value: 'Q4',  display: 'Q4',     unit: '2025',            animate: false },
  /* ◆ TBD: Manav fills — average daily event count from the live system */
  { label: 'Data Points / Day', value: 184,   display: '~184K', unit: 'Events',          animate: false },
  { label: 'Audit Retention',   value: 100,   unit: 'Percent',   animate: true  },
];

function LiveOpsPanel() {
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
        <span className="live-ops-title">CURRENT OPERATION</span>
        <span className="live-ops-separator" />
        <span className="live-ops-status">LIVE</span>
      </div>

      <div className="live-ops-grid">
        {LIVE_STATS.map((s, i) => (
          <LiveOpsRow key={s.label} stat={s} index={i} />
        ))}
      </div>

      <div className="live-ops-footer">
        <span className="live-ops-footer-label">VERTICALS</span>
        <span className="live-ops-footer-sep">·</span>
        {['SaaS', 'DTC', 'Legal', 'Local', 'B2B'].map((v) => (
          <span key={v} className="live-ops-chip">{v}</span>
        ))}
      </div>
    </motion.div>
  );
}

function LiveOpsRow({ stat, index }: { stat: LiveStat; index: number }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [displayValue, setDisplayValue] = useState<string>(
    stat.animate ? '0' : (stat.display ?? String(stat.value))
  );

  useEffect(() => {
    if (!stat.animate) return;
    const el = rowRef.current;
    if (!el) return;
    let cancelled = false;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !cancelled) {
            cancelled = true;
            const target = Number(stat.value);
            const durationMs = 1200 + index * 80;
            const startTime = performance.now();

            const tick = (now: number) => {
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / durationMs, 1);
              /* Ease-out cubic for natural counter deceleration */
              const eased = 1 - Math.pow(1 - progress, 3);
              const current = Math.round(target * eased);
              const prefix = stat.prefix ?? '';
              setDisplayValue(prefix + current.toString());
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
  }, [stat, index]);

  return (
    <motion.div
      ref={rowRef}
      className="live-ops-row"
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-12%' }}
      transition={{ duration: 0.8, ease: FEATHER, delay: 0.2 + index * 0.07 }}
    >
      <span className="live-ops-row-label">{stat.label.toUpperCase()}</span>
      <span className="live-ops-row-dotline" />
      <span className="live-ops-row-value">{displayValue}</span>
      <span className="live-ops-row-unit">{stat.unit.toUpperCase()}</span>
    </motion.div>
  );
}

/* ─── Inline styles for this chapter ─────────────────────────────── */

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

      /* ═══════════════════════════════════════════════════════════
         LIVE OPERATIONS PANEL
         A system-status console, distinct visual register from the
         spec cards above. Monospaced row labels, large display
         values, pulsing live indicator at top.
      ═══════════════════════════════════════════════════════════ */
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

      /* HEADER */
      .live-ops-header {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        padding-bottom: 1.2rem;
        margin-bottom: 1.4rem;
        border-bottom: 0.5px dashed hsla(var(--ch-hue), 40%, 60%, 0.22);
      }
      .live-ops-pulse-wrap {
        position: relative;
        width: 10px; height: 10px;
        flex-shrink: 0;
      }
      .live-ops-pulse {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: hsla(142, 75%, 60%, 1);
        box-shadow: 0 0 14px hsla(142, 75%, 55%, 0.85);
        animation: lopsPulse 2.2s ease-in-out infinite;
      }
      .live-ops-pulse-ring {
        position: absolute;
        inset: -3px;
        border-radius: 50%;
        border: 1px solid hsla(142, 70%, 55%, 0.5);
        animation: lopsRing 2.2s ease-out infinite;
      }
      @keyframes lopsPulse {
        0%, 100% { transform: scale(1);   opacity: 1;   }
        50%      { transform: scale(0.8); opacity: 0.65;}
      }
      @keyframes lopsRing {
        0%   { transform: scale(0.6); opacity: 0.9; }
        100% { transform: scale(2.2); opacity: 0;   }
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
        flex: 1;
        height: 1px;
        background: linear-gradient(90deg,
          hsla(var(--ch-hue), 60%, 60%, 0.18),
          transparent 80%);
      }
      .live-ops-status {
        font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.62rem;
        font-weight: 800;
        letter-spacing: 0.32em;
        color: hsla(142, 80%, 75%, 1);
        padding: 0.2rem 0.6rem;
        border: 0.5px solid hsla(142, 70%, 55%, 0.35);
        border-radius: 4px;
        background: hsla(142, 70%, 40%, 0.08);
      }

      /* STATS GRID */
      .live-ops-grid {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .live-ops-row {
        display: grid;
        grid-template-columns: 12rem 1fr auto 4rem;
        align-items: baseline;
        gap: 0.6rem;
        padding: 0.55rem 0;
        border-bottom: 0.5px dashed hsla(var(--ch-hue), 30%, 50%, 0.12);
      }
      .live-ops-row:last-child {
        border-bottom: none;
      }
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

      /* FOOTER */
      .live-ops-footer {
        display: flex;
        align-items: center;
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
        color: var(--m-ink-soft);
      }
      .live-ops-footer-sep {
        color: var(--m-ink-soft);
        opacity: 0.4;
      }
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
        .live-ops-row   { grid-template-columns: 7rem 1fr auto 3rem; gap: 0.4rem; }
        .live-ops-row-label { font-size: 0.6rem; letter-spacing: 0.14em; }
        .live-ops-row-value { font-size: 1.4rem; }
        .live-ops-row-unit  { font-size: 0.52rem; }
      }
    `}</style>
  );
}
