/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/MonitorsPanel.tsx
   Brand Studio H.4 — PM-side monitor configuration.

   Lives in the Market tab. Lists all configured monitors for the
   project, shows their last-check status, lets PM trigger an
   immediate check, edit, or delete.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback } from 'react';
import {
  Globe, Plus, Edit3, Trash2, X, Save, ExternalLink, AlertTriangle,
  CheckCircle2, Loader2, Play, Clock, EyeOff,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  listMonitors, upsertMonitor, deleteMonitor, checkMonitorNow,
  MONITOR_TYPES, MONITOR_FREQUENCY_PRESETS,
  type InternetMonitor,
} from './api';

interface Props { projectId: string }

export default function MonitorsPanel({ projectId }: Props) {
  const [rows, setRows]         = useState<InternetMonitor[]>([]);
  const [loading, setLoading]   = useState(false);
  const [editing, setEditing]   = useState<InternetMonitor | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { monitors } = await listMonitors(projectId);
    setRows(monitors);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const startNew = () => setEditing({
    monitor_type:          'competitor_page',
    url:                   '',
    label:                 '',
    why:                   '',
    enabled:               true,
    check_frequency_hours: 24,
  });

  const handleSave = async (m: InternetMonitor) => {
    const { monitor, error } = await upsertMonitor({ projectId, ...m });
    if (error || !monitor) {
      toast({ title: 'Save failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: m.id ? 'Monitor updated' : 'Monitor added',
      description: !m.id ? 'It will be checked on the next cron run (within 24h) or you can check now.' : undefined });
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this monitor? Its observation history will also be removed.')) return;
    const { success } = await deleteMonitor({ id, projectId });
    if (success) {
      toast({ title: 'Deleted' });
      load();
    }
  };

  const handleCheckNow = async (id: string) => {
    setChecking(id);
    const r = await checkMonitorNow({ id, projectId });
    setChecking(null);
    if (!r.success) {
      toast({ title: 'Check failed', description: r.error, variant: 'destructive' });
      return;
    }
    toast({
      title: `Classified: ${r.classification}`,
      description: r.summary_of_change || r.ai_assessment,
    });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/[0.05] to-purple-500/[0.03] p-5">
        <div className="flex items-start gap-3">
          <Globe className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Market Monitors</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Watch specific URLs for meaningful change. Cron checks each monitor at its configured frequency, classifies any change via AI ("would a senior brand strategist care?"), and surfaces only the meaningful ones as triggers. Default: 50 fetches + 100 classifications per cron run.
            </div>
          </div>
          <button onClick={startNew}
            className="px-3 py-1.5 rounded-xl bg-cyan-500 text-white text-xs font-semibold hover:bg-cyan-500/90 flex items-center gap-1 shrink-0">
            <Plus className="h-3 w-3" /> Add monitor
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
      )}

      {!loading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Globe className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <div className="text-sm font-semibold">No monitors yet</div>
          <div className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Start with one or two important URLs — your top competitor's pricing page, a regulatory body, or an industry publication. Quality over quantity.
          </div>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((m) => (
          <MonitorRow
            key={m.id}
            monitor={m}
            onEdit={() => setEditing(m)}
            onDelete={() => m.id && handleDelete(m.id)}
            onCheckNow={() => m.id && handleCheckNow(m.id)}
            checking={checking === m.id}
          />
        ))}
      </div>

      {editing && (
        <MonitorEditor
          monitor={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function MonitorRow({ monitor, onEdit, onDelete, onCheckNow, checking }: {
  monitor: InternetMonitor;
  onEdit: () => void;
  onDelete: () => void;
  onCheckNow: () => void;
  checking: boolean;
}) {
  const typeLabel = MONITOR_TYPES.find((t) => t.key === monitor.monitor_type)?.label || monitor.monitor_type;
  const hasErrors = (monitor.consecutive_errors || 0) > 0;

  return (
    <div className={`rounded-xl border bg-card/60 p-3 ${hasErrors ? 'border-red-500/30' : 'border-border'}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-foreground">{monitor.label}</span>
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-bold">
              {typeLabel}
            </span>
            {!monitor.enabled && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold flex items-center gap-0.5">
                <EyeOff className="h-2.5 w-2.5" /> Disabled
              </span>
            )}
            {hasErrors && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-bold flex items-center gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" /> {monitor.consecutive_errors} errors
              </span>
            )}
          </div>
          <a href={monitor.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:underline inline-flex items-center gap-0.5 mt-0.5 break-all">
            {monitor.url} <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          </a>
          <div className="text-[11px] text-muted-foreground italic mt-1">
            Why: {monitor.why}
          </div>
          {monitor.watch_focus && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Watching for: {monitor.watch_focus}
            </div>
          )}
          {monitor.last_ai_summary && (
            <div className="text-[11px] text-foreground/70 mt-1.5 border-l-2 border-cyan-500/30 pl-2 italic">
              Last summary: {monitor.last_ai_summary}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            <span>Every {monitor.check_frequency_hours}h</span>
            {monitor.last_check_at ? (
              <span>· Last checked {new Date(monitor.last_check_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
            ) : (
              <span>· Never checked</span>
            )}
            {hasErrors && monitor.last_error && (
              <span className="text-red-400">· {monitor.last_error}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onCheckNow} disabled={checking}
            title="Check this monitor now"
            className="px-2 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50 flex items-center gap-1 text-[10px]">
            {checking ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5" />}
            Check now
          </button>
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground">
            <Edit3 className="h-3 w-3" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MonitorEditor({ monitor, onCancel, onSave }: {
  monitor: InternetMonitor;
  onCancel: () => void;
  onSave: (m: InternetMonitor) => void;
}) {
  const [draft, setDraft] = useState<InternetMonitor>(monitor);
  const update = (patch: Partial<InternetMonitor>) => setDraft({ ...draft, ...patch });
  const typeSpec = MONITOR_TYPES.find((t) => t.key === draft.monitor_type);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-bold">{monitor.id ? 'Edit' : 'Add'} Monitor</div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Monitor type *</label>
            <select value={draft.monitor_type} onChange={(e) => update({ monitor_type: e.target.value })}
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-cyan-400">
              {MONITOR_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            {typeSpec && <div className="text-[10px] text-muted-foreground mt-1">{typeSpec.desc}</div>}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Label *</label>
            <input value={draft.label} onChange={(e) => update({ label: e.target.value })}
              placeholder='e.g. "Acme Corp — pricing page"'
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-cyan-400" />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">URL *</label>
            <input value={draft.url} onChange={(e) => update({ url: e.target.value })}
              placeholder="https://…"
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-cyan-400" />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Why are we watching this? *
            </label>
            <textarea value={draft.why} onChange={(e) => update({ why: e.target.value })}
              rows={2} maxLength={1000}
              placeholder='e.g. "Acme is our top competitor. If they change pricing tiers or repositioning, we need to refresh our positioning memo."'
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-cyan-400 resize-y" />
            <div className="text-[10px] text-muted-foreground">
              Required. Forces intentional monitoring — vague reasons produce noisy alerts.
            </div>
          </div>

          {draft.monitor_type === 'competitor_page' && (
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Competitor name</label>
              <input value={draft.competitor_name || ''} onChange={(e) => update({ competitor_name: e.target.value })}
                placeholder='e.g. "Acme Corp"'
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-cyan-400" />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Specific focus (optional)
            </label>
            <input value={draft.watch_focus || ''} onChange={(e) => update({ watch_focus: e.target.value })}
              placeholder='e.g. "pricing changes" or "new feature announcements"'
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-cyan-400" />
            <div className="text-[10px] text-muted-foreground">
              Tells the AI what KIND of change to flag as meaningful for this monitor.
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Check frequency *</label>
            <select value={draft.check_frequency_hours}
              onChange={(e) => update({ check_frequency_hours: Number(e.target.value) })}
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-cyan-400">
              {MONITOR_FREQUENCY_PRESETS.map((f) => <option key={f.hours} value={f.hours}>{f.label}</option>)}
            </select>
            <div className="text-[10px] text-muted-foreground">
              Daily is fine for most monitors. Use higher frequency only for fast-moving pages where same-day awareness matters.
            </div>
          </div>

          <div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => update({ enabled: e.target.checked })}
                className="mt-1 accent-cyan-500" />
              <div className="text-xs">
                <div className="font-semibold">Enabled</div>
                <div className="text-[10px] text-muted-foreground">When disabled, cron skips this monitor. Useful for temporary pauses without deleting history.</div>
              </div>
            </label>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button onClick={() => onSave(draft)}
            disabled={!draft.url.trim() || !draft.label.trim() || !draft.why.trim()}
            className="px-4 py-2 rounded-xl bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-500/90 disabled:opacity-50 flex items-center gap-1.5">
            <Save className="h-3 w-3" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
