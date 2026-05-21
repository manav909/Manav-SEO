/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/TimeScopePicker.tsx
   Phase 1H — Time scope picker for chart / KPI / data-table data.

   Two modes:
   - compact: small dropdown button → opens preset list + custom dates
              (used in DocumentViewer action bar and dialogs)
   - inline:  full panel with preset buttons + custom date inputs
              (used in Generate dialog where there's room)

   The Custom mode pre-fills the "from" date with the project's baseline
   date when one exists — that's the one explicit request in the user
   feedback for this feature.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { describeScope, type TimeScope, type TimeScopePreset } from './data-references';

interface Props {
  scope:         TimeScope;
  onChange:      (s: TimeScope) => void;
  baselineDate?: string | null;
  compact?:      boolean;
  brandColor?:   string;
  label?:        string;
}

const PRESETS: Array<{ key: TimeScopePreset; label: string; group: 'recent' | 'period' | 'baseline' }> = [
  { key: 'last_30d',       label: 'Last 30 days',  group: 'recent' },
  { key: 'last_90d',       label: 'Last 90 days',  group: 'recent' },
  { key: 'last_365d',      label: 'Last 365 days', group: 'recent' },
  { key: 'monthly',        label: 'This month',    group: 'period' },
  { key: 'last_month',     label: 'Last month',    group: 'period' },
  { key: 'quarterly',      label: 'This quarter',  group: 'period' },
  { key: 'last_quarter',   label: 'Last quarter',  group: 'period' },
  { key: 'ytd',            label: 'Year to date',  group: 'period' },
  { key: 'since_baseline', label: 'Since baseline',group: 'baseline' },
];

export default function TimeScopePicker({
  scope, onChange, baselineDate, compact, brandColor, label,
}: Props) {
  const accent = brandColor || '#8b5cf6';
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /* Custom date inputs — pre-fill with baseline date as start */
  const [customFrom, setCustomFrom] = useState<string>(() => {
    if (scope.kind === 'custom' && scope.from) return scope.from.slice(0, 10);
    if (baselineDate) return baselineDate.slice(0, 10);
    return '';
  });
  const [customTo, setCustomTo] = useState<string>(() => {
    if (scope.kind === 'custom' && scope.to) return scope.to.slice(0, 10);
    return '';
  });

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const pickPreset = (key: TimeScopePreset) => {
    onChange({ kind: 'preset', presetKey: key });
    setOpen(false);
  };

  const applyCustom = () => {
    if (!customFrom && !customTo) return;
    /* Date inputs return YYYY-MM-DD. Treat "from" as start-of-day and
       "to" as end-of-day so a custom range INCLUDES records on the
       endpoint dates rather than excluding any after midnight UTC. */
    const fromIso = customFrom
      ? new Date(`${customFrom}T00:00:00.000Z`).toISOString()
      : undefined;
    const toIso = customTo
      ? new Date(`${customTo}T23:59:59.999Z`).toISOString()
      : undefined;
    onChange({ kind: 'custom', from: fromIso, to: toIso });
    setOpen(false);
  };

  const isCustomActive = scope.kind === 'custom';
  const activePresetKey = scope.kind === 'preset' ? scope.presetKey : null;

  /* ─── Compact dropdown ──────────────────────────────────────── */
  if (compact !== false) {
    return (
      <div ref={rootRef} className="relative inline-block">
        <button
          onClick={() => setOpen(!open)}
          className="text-xs px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted/40 flex items-center gap-1.5 font-semibold"
          title="Choose the time range for live data in this document"
        >
          <Calendar className="h-3 w-3" style={{ color: accent }} />
          {label && <span className="text-muted-foreground font-normal">{label}:</span>}
          <span>{describeScope(scope, baselineDate)}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>

        {open && (
          <div className="absolute z-50 top-full right-0 mt-1.5 w-72 rounded-xl border border-border bg-card shadow-2xl p-2">
            {/* Recent */}
            <PresetGroup
              title="Recent"
              presets={PRESETS.filter((p) => p.group === 'recent')}
              activeKey={activePresetKey}
              onPick={pickPreset}
              accent={accent}
            />
            {/* Periods */}
            <div className="my-1.5 border-t border-border" />
            <PresetGroup
              title="Period"
              presets={PRESETS.filter((p) => p.group === 'period')}
              activeKey={activePresetKey}
              onPick={pickPreset}
              accent={accent}
            />
            {/* Baseline */}
            {baselineDate && (
              <>
                <div className="my-1.5 border-t border-border" />
                <PresetGroup
                  title="Baseline"
                  presets={PRESETS.filter((p) => p.group === 'baseline')}
                  activeKey={activePresetKey}
                  onPick={pickPreset}
                  accent={accent}
                  hint={baselineDate ? `From ${new Date(baselineDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : undefined}
                />
              </>
            )}
            {/* Custom */}
            <div className="my-1.5 border-t border-border" />
            <div className="px-1.5 py-1">
              <div className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Custom</div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-[10px]">
                  <div className="text-muted-foreground mb-0.5">From</div>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full px-1.5 py-1 text-[11px] bg-background border border-border rounded"
                  />
                </label>
                <label className="text-[10px]">
                  <div className="text-muted-foreground mb-0.5">To</div>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full px-1.5 py-1 text-[11px] bg-background border border-border rounded"
                  />
                </label>
              </div>
              {baselineDate && !customFrom && (
                <button
                  onClick={() => setCustomFrom(baselineDate.slice(0, 10))}
                  className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Use baseline date ({new Date(baselineDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})
                </button>
              )}
              <button
                onClick={applyCustom}
                disabled={!customFrom && !customTo}
                className="mt-2 w-full text-[11px] font-semibold text-white px-2 py-1 rounded disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                {isCustomActive && (customFrom || customTo) ? '✓ Apply custom range' : 'Apply custom range'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── Inline panel (full mode) ──────────────────────────────── */
  return (
    <div ref={rootRef} className="rounded-xl border border-border bg-background/40 p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1.5">
        <Calendar className="h-3 w-3" style={{ color: accent }} />
        {label || 'Time scope'}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          /* Skip baseline preset if no baseline date set */
          if (p.key === 'since_baseline' && !baselineDate) return null;
          const isActive = activePresetKey === p.key;
          return (
            <button
              key={p.key}
              onClick={() => pickPreset(p.key)}
              className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 ${
                isActive
                  ? 'text-white'
                  : 'border border-border text-foreground hover:bg-muted/40'
              }`}
              style={isActive ? { backgroundColor: accent } : {}}
            >
              {isActive && <Check className="h-2.5 w-2.5" />}
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="pt-1 border-t border-border">
        <div className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Custom range</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px]">
            <div className="text-muted-foreground mb-0.5">
              From {baselineDate && !customFrom && <span className="opacity-60">(baseline)</span>}
            </div>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-full px-2 py-1 text-[11px] bg-background border border-border rounded"
            />
          </label>
          <label className="text-[10px]">
            <div className="text-muted-foreground mb-0.5">To</div>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-full px-2 py-1 text-[11px] bg-background border border-border rounded"
            />
          </label>
        </div>
        <button
          onClick={applyCustom}
          disabled={!customFrom && !customTo}
          className={`mt-2 text-[11px] font-semibold px-2.5 py-1 rounded flex items-center gap-1 disabled:opacity-50 ${
            isCustomActive ? 'text-white' : 'border border-border'
          }`}
          style={isCustomActive ? { backgroundColor: accent } : {}}
        >
          {isCustomActive && <Check className="h-2.5 w-2.5" />}
          Apply custom range
        </button>
      </div>
    </div>
  );
}

function PresetGroup({
  title, presets, activeKey, onPick, accent, hint,
}: {
  title:    string;
  presets:  Array<{ key: TimeScopePreset; label: string }>;
  activeKey: TimeScopePreset | null;
  onPick:   (k: TimeScopePreset) => void;
  accent:   string;
  hint?:    string;
}) {
  return (
    <div className="px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground mb-1 flex items-center justify-between">
        <span>{title}</span>
        {hint && <span className="font-normal text-[9px] normal-case opacity-70">{hint}</span>}
      </div>
      <div className="space-y-0.5">
        {presets.map((p) => {
          const isActive = activeKey === p.key;
          return (
            <button
              key={p.key}
              onClick={() => onPick(p.key)}
              className={`w-full flex items-center justify-between text-[11px] px-2 py-1.5 rounded text-left ${
                isActive ? 'text-white' : 'hover:bg-muted/40 text-foreground'
              }`}
              style={isActive ? { backgroundColor: accent } : {}}
            >
              <span>{p.label}</span>
              {isActive && <Check className="h-2.5 w-2.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
