/* ════════════════════════════════════════════════════════════════
   src/components/pm/ReportsPanel.tsx
   The Reports tab — task & progress reports for client dashboards
   and invoicing.

   Generates a report of what was completed, what's in progress, and
   what counts as billable — for one-time tasks or retainers.
════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import * as pmApi from './api';

export default function ReportsPanel({ projectId }: { projectId: string }) {
  const [report, setReport]   = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange]     = useState<'daily' | 'on_demand'>('on_demand');
  const [err, setErr]         = useState('');

  const generate = async () => {
    setLoading(true);
    setErr('');
    setReport(null);
    const r = await pmApi.generateTaskReport(projectId, range);
    setLoading(false);
    if (r) setReport(r);
    else setErr('Could not generate the report — try again.');
  };

  return (
    <div className="space-y-5">

      {/* Controls */}
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm font-semibold">Task & progress report</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            A client-ready summary of completed work — for dashboards and invoicing.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={e => setRange(e.target.value as 'daily' | 'on_demand')}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
          >
            <option value="daily">Last 24 hours</option>
            <option value="on_demand">Last 30 days</option>
          </select>
          <button
            onClick={generate}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Generating…' : 'Generate Report'}
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">{err}</div>
      )}

      {/* The report */}
      {report && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {report.range === 'daily' ? 'Last 24 hours' : 'Last 30 days'}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {report.generated_at ? new Date(report.generated_at).toLocaleString('en-GB') : ''}
            </div>
          </div>

          {/* Summary numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Total tasks"  value={report.summary?.total ?? 0}       color="#94a3b8" />
            <Stat label="Completed"    value={report.summary?.completed ?? 0}   color="#10b981" />
            <Stat label="In progress"  value={report.summary?.in_progress ?? 0} color="#f59e0b" />
            <Stat label="Billable"     value={report.summary?.billable ?? 0}    color="hsl(var(--primary))" />
          </div>

          {/* Completed */}
          <ReportList
            title="Completed"
            empty="No tasks completed in this period."
            items={report.completed_tasks || []}
          />

          {/* In progress */}
          <ReportList
            title="In progress"
            empty="No tasks in progress."
            items={report.in_progress_tasks || []}
          />
        </div>
      )}

      {!report && !loading && !err && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Generate a report to see completed work and billable tasks.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <div className="text-2xl font-bold font-mono" style={{ color }}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function ReportList({ title, items, empty }: {
  title: string; items: { title: string; type: string }[]; empty: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title} — {items.length}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground/60 italic">{empty}</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((t, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                {t.type}
              </span>
              <span className="text-foreground/90">{t.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
