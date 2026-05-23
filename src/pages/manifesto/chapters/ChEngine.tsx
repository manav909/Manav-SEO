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
    descriptor: "Twelve specialized engines fire in sequence — query analysis, content gap detection, backlink intelligence, cluster mapping, internal link orchestration, off-page authority tracking, technical drift, conversion attribution, audit logging, real-time alerting, and two more. Each independent. None pausing.",
    icon:       <Cpu className="h-4 w-4" />,
  },
  {
    value:      'MIN',
    unit:       'cadence',
    label:      'Continuous Refresh',
    descriptor: "Data refreshes in minutes, not the monthly cadence agencies invented to hide latency. Every query movement, every traffic shift, every backlink change registers before your competitor's monthly meeting agenda is written.",
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
    `}</style>
  );
}
