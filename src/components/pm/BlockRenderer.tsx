/* ════════════════════════════════════════════════════════════════
   BlockRenderer.tsx
   Renders one ReportBlock — narrative / kpi / chart / table / matrix.
   Used by ReportsPanel (editor) and ClientReportView (public read view).
   Editable variant supports inline text editing and regenerate.
════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Pencil, RotateCcw, Trash2, GripVertical, Check, X } from 'lucide-react';
import type { ReportBlock } from './types';

const fmt = (v: any, format: string = 'int'): string => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (format === 'pct') return `${n.toFixed(1)}%`;
  if (format === 'dec') return n.toFixed(1);
  return n >= 1000 ? n.toLocaleString() : String(Math.round(n));
};

const dateShort = (iso: string): string => {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); }
  catch { return iso; }
};

const PIE_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#60a5fa', '#fb923c'];

export interface BlockRendererProps {
  block:      ReportBlock;
  editable?:  boolean;
  onEdit?:    (newContent: string) => void;
  onRegen?:   () => void;
  onRemove?:  () => void;
  regenerating?: boolean;
}

export function BlockRenderer({
  block, editable = false, onEdit, onRegen, onRemove, regenerating,
}: BlockRendererProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.content || '');

  const actions = editable && (
    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {block.type === 'narrative' && !editing && onEdit && (
        <button
          onClick={() => { setDraft(block.content || ''); setEditing(true); }}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Edit text"
        ><Pencil className="h-3.5 w-3.5" /></button>
      )}
      {block.type === 'narrative' && onRegen && !editing && (
        <button
          onClick={onRegen}
          disabled={regenerating}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
          title="Regenerate with current sliders"
        ><RotateCcw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} /></button>
      )}
      {onRemove && !editing && (
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive"
          title="Remove block"
        ><Trash2 className="h-3.5 w-3.5" /></button>
      )}
    </div>
  );

  return (
    <div className="group rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {editable && (
            <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 cursor-grab" />
          )}
          <div className="text-sm font-semibold text-foreground/90 truncate">{block.title}</div>
        </div>
        {actions}
      </div>

      {/* ── narrative ── */}
      {block.type === 'narrative' && (
        editing ? (
          <div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.max(4, draft.split('\n').length + 1)}
              className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex gap-2 mt-2 justify-end">
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"
              ><X className="h-3 w-3" /> Cancel</button>
              <button
                onClick={() => { onEdit?.(draft); setEditing(false); }}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90"
              ><Check className="h-3 w-3" /> Save text</button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
            {block.content || <span className="text-muted-foreground italic">No content yet — regenerate this block.</span>}
          </div>
        )
      )}

      {/* ── KPI tile ── */}
      {block.type === 'kpi' && block.data && (
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="text-3xl font-bold text-foreground">
            {fmt(block.data.current, block.data.format)}
          </div>
          {block.data.delta != null && (
            <div className={`text-sm font-mono ${
              block.data.delta > 0 ? 'text-green-400' :
              block.data.delta < 0 ? 'text-amber-400' :
              'text-muted-foreground'
            }`}>
              {block.data.delta > 0 ? '+' : ''}{Number(block.data.delta).toFixed(1)} vs prior
            </div>
          )}
          {block.data.previous != null && (
            <div className="text-xs text-muted-foreground">
              was {fmt(block.data.previous, block.data.format)}
            </div>
          )}
        </div>
      )}

      {/* ── chart: time-series line, bar, or pie ── */}
      {block.type === 'chart' && block.data && (() => {
        if (block.data.pieChart && Array.isArray(block.data.categories)) {
          return (
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={block.data.categories}
                    dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={80} label
                  >
                    {block.data.categories.map((_: any, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          );
        }
        const series = Array.isArray(block.data.series)
          ? block.data.series.map((p: any) => ({ ...p, t: typeof p.t === 'string' ? dateShort(p.t) : p.t }))
          : [];
        if (!series.length) return <div className="text-xs text-muted-foreground">No data for this chart.</div>;
        const Chart: any = block.data.barChart ? BarChart : LineChart;
        const Series: any = block.data.barChart ? Bar : Line;
        return (
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <Chart data={series} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="t" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis
                  stroke="hsl(var(--muted-foreground))" fontSize={11}
                  reversed={!!block.data.invertY}
                />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Series
                  type="monotone" dataKey="v" name={block.data.key || 'Value'}
                  stroke="#818cf8" fill="#818cf8" strokeWidth={2} dot={!block.data.barChart}
                />
              </Chart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* ── table ── */}
      {block.type === 'table' && block.data && Array.isArray(block.data.rows) && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {(block.data.columns || []).map((c: string, i: number) => (
                  <th key={i} className="text-left py-2 px-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.data.rows.map((row: any, i: number) => (
                <tr key={i} className="border-b border-border/40">
                  {Object.keys(row).filter(k => k !== 'output_excerpt').map((k, j) => (
                    <td key={j} className="py-2 px-2 text-foreground/90 align-top">{String(row[k] ?? '—')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── matrix: audit synthesis or competitive comparison ── */}
      {block.type === 'matrix' && block.data && (
        <div className="space-y-3 text-sm">
          {/* audit findings shape */}
          {block.data.synthesis && (
            <>
              {block.data.synthesis.overall_verdict && (
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Verdict</div>
                  <div className="text-foreground/90 leading-relaxed">{block.data.synthesis.overall_verdict}</div>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                {block.data.synthesis.biggest_verified_win && (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                    <div className="text-[10px] font-semibold text-green-400 uppercase mb-1">Biggest win</div>
                    <div className="text-foreground/90 text-xs leading-relaxed">{block.data.synthesis.biggest_verified_win}</div>
                  </div>
                )}
                {block.data.synthesis.most_urgent_gap && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <div className="text-[10px] font-semibold text-amber-400 uppercase mb-1">Urgent gap</div>
                    <div className="text-foreground/90 text-xs leading-relaxed">{block.data.synthesis.most_urgent_gap}</div>
                  </div>
                )}
              </div>
              {block.data.score != null && (
                <div className="text-xs text-muted-foreground">
                  Audit score: <span className="font-mono text-foreground">{block.data.score}</span>
                  {block.data.previous_score != null && (
                    <> · prior: {block.data.previous_score}</>
                  )}
                </div>
              )}
            </>
          )}
          {/* competitive comparison shape (from projects.crawl_comparison) */}
          {block.data.comparison_matrix && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {(block.data.comparison_matrix.headers || []).map((h: string, i: number) => (
                      <th key={i} className="text-left py-2 px-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(block.data.comparison_matrix.rows || []).map((row: any, i: number) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="py-2 px-2 font-medium text-foreground/90">{row.signal}</td>
                      {(row.values || []).map((v: any, j: number) => (
                        <td key={j} className="py-2 px-2 text-foreground/75">{String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {block.data.executive_summary && (
            <div className="text-xs text-muted-foreground leading-relaxed italic mt-2">
              {block.data.executive_summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
