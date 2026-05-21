/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/TriggersPanel.tsx
   Brand Studio H.4 — PM-side triggers queue.

   Two stacked queues:
   1. Open observations — meaningful/new_item monitor results that
      need PM attention. Each shows the AI's assessment and suggested
      action. PM can mark reviewed/acted/dismissed.
   2. Stale documents — generated docs whose subscribed inputs have
      changed materially. PM can dismiss (acknowledge without action)
      or jump to Generate to regenerate.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback } from 'react';
import {
  Bell, AlertTriangle, ExternalLink, CheckCircle2, X, Sparkles,
  Loader2, RefreshCw, FileWarning, ChevronRight,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  listObservations, updateObservationStatus,
  listStaleDocs, dismissStale,
  type MonitorObservation, type StaleDoc,
} from './api';

interface Props {
  projectId: string;
  /* Optional callback when PM wants to jump to Generate for a specific template */
  onSuggestGenerate?: (templateId: string) => void;
}

export default function TriggersPanel({ projectId, onSuggestGenerate }: Props) {
  const [observations, setObservations] = useState<MonitorObservation[]>([]);
  const [staleDocs,    setStaleDocs]    = useState<StaleDoc[]>([]);
  const [loading,      setLoading]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [obs, stale] = await Promise.all([
      listObservations({ projectId, status: 'open' }),
      listStaleDocs(projectId),
    ]);
    setObservations(obs.observations);
    setStaleDocs(stale.stale_docs);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleObsAction = async (id: string, status: string) => {
    const { success, error } = await updateObservationStatus({ id, projectId, status });
    if (!success) {
      toast({ title: 'Update failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: `Marked ${status}` });
    load();
  };

  const handleDismissStale = async (documentId: string) => {
    const { success } = await dismissStale({ documentId, projectId });
    if (success) {
      toast({ title: 'Stale flag cleared' });
      load();
    }
  };

  const handleGenerate = (templateId: string) => {
    if (onSuggestGenerate) onSuggestGenerate(templateId);
  };

  const openCount = observations.length;
  const staleCount = staleDocs.length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.05] to-orange-500/[0.03] p-5">
        <div className="flex items-start gap-3">
          <Bell className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Triggers Queue</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Where meaningful monitor observations and stale documents converge. The system suggests; you decide. Nothing here is auto-acted on.
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px]">
              <span className="font-semibold text-amber-400">{openCount}</span>
              <span className="text-muted-foreground">open observation{openCount === 1 ? '' : 's'}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="font-semibold text-orange-400">{staleCount}</span>
              <span className="text-muted-foreground">stale document{staleCount === 1 ? '' : 's'}</span>
            </div>
          </div>
          <button onClick={load} className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
      )}

      {/* Observations queue */}
      {!loading && observations.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">
            Monitor observations needing review
          </div>
          <div className="space-y-2">
            {observations.map((o) => (
              <ObservationCard
                key={o.id}
                obs={o}
                onAct={(status) => handleObsAction(o.id, status)}
                onGenerate={o.suggested_template_id ? () => handleGenerate(o.suggested_template_id!) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Stale documents queue */}
      {!loading && staleDocs.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">
            Documents whose inputs have changed
          </div>
          <div className="space-y-2">
            {staleDocs.map((d) => (
              <StaleDocCard
                key={d.document_id}
                doc={d}
                onDismiss={() => handleDismissStale(d.document_id)}
                onRegenerate={d.template_id ? () => handleGenerate(d.template_id!) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && observations.length === 0 && staleDocs.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500/30 mx-auto mb-3" />
          <div className="text-sm font-semibold">Nothing needs your attention</div>
          <div className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            All monitor observations are quiet, and every generated document is fresh against its inputs. The system will surface meaningful changes here as they happen.
          </div>
        </div>
      )}
    </div>
  );
}

function ObservationCard({
  obs, onAct, onGenerate,
}: {
  obs: MonitorObservation;
  onAct: (status: string) => void;
  onGenerate?: () => void;
}) {
  const isNew = obs.change_classification === 'new_item';
  const tone =
    isNew ? 'border-cyan-500/30 bg-cyan-500/[0.04]' :
    'border-amber-500/30 bg-amber-500/[0.04]';

  return (
    <div className={`rounded-xl border ${tone} p-4`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${isNew ? 'text-cyan-400' : 'text-amber-400'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold">{obs.monitor_label || 'Monitor'}</span>
            <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
              isNew ? 'bg-cyan-500/15 text-cyan-400' : 'bg-amber-500/15 text-amber-400'
            }`}>{obs.change_classification.replace(/_/g, ' ')}</span>
            {obs.competitor_name && (
              <span className="text-[10px] text-muted-foreground">re: {obs.competitor_name}</span>
            )}
            <span className="text-[10px] text-muted-foreground">
              · {new Date(obs.observed_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          </div>

          {obs.monitor_url && (
            <a href={obs.monitor_url} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-cyan-400 hover:underline inline-flex items-center gap-0.5 mt-0.5 break-all">
              {obs.monitor_url} <ExternalLink className="h-2 w-2 shrink-0" />
            </a>
          )}

          {obs.summary_of_change && (
            <div className="text-sm text-foreground/90 mt-2">{obs.summary_of_change}</div>
          )}

          {obs.ai_assessment && (
            <div className="text-[11px] text-muted-foreground italic mt-1.5 border-l-2 border-foreground/15 pl-2">
              {obs.ai_assessment}
            </div>
          )}

          {obs.suggested_action && (
            <div className="text-xs text-foreground/90 mt-2 rounded-lg bg-background/40 border border-border p-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mr-1">Suggestion:</span>
              {obs.suggested_action}
            </div>
          )}

          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {onGenerate && obs.suggested_template_id && (
              <button onClick={onGenerate}
                className="text-[10px] px-3 py-1.5 rounded-lg bg-purple-500 text-white font-bold hover:bg-purple-500/90 flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                Open {obs.suggested_template_id.replace(/_/g, ' ')}
              </button>
            )}
            <button onClick={() => onAct('acted')}
              className="text-[10px] px-2 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 font-bold flex items-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> Mark acted
            </button>
            <button onClick={() => onAct('reviewed')}
              className="text-[10px] px-2 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">
              Just reviewed
            </button>
            <button onClick={() => onAct('dismissed')}
              className="text-[10px] px-2 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-400">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StaleDocCard({
  doc, onDismiss, onRegenerate,
}: {
  doc: StaleDoc;
  onDismiss: () => void;
  onRegenerate?: () => void;
}) {
  return (
    <div className="rounded-xl border border-orange-500/30 bg-orange-500/[0.04] p-4">
      <div className="flex items-start gap-3">
        <FileWarning className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold">{doc.document_name || 'Document'}</span>
            {doc.version && doc.version > 1 && (
              <span className="text-[9px] font-mono text-muted-foreground">v{doc.version}</span>
            )}
            <span className="text-[10px] text-muted-foreground">
              · Stale since {new Date(doc.most_recent_stale).toLocaleDateString('en-GB')}
            </span>
          </div>
          {doc.reasons && doc.reasons.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                Inputs that changed
              </div>
              {doc.reasons.slice(0, 4).map((r, i) => (
                <div key={i} className="text-[11px] text-foreground/90 flex items-start gap-1.5">
                  <ChevronRight className="h-2.5 w-2.5 mt-0.5 shrink-0 text-orange-400" />
                  <span>{r}</span>
                </div>
              ))}
              {doc.reasons.length > 4 && (
                <div className="text-[10px] text-muted-foreground italic">…and {doc.reasons.length - 4} more</div>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {onRegenerate && doc.template_id && (
              <button onClick={onRegenerate}
                className="text-[10px] px-3 py-1.5 rounded-lg bg-purple-500 text-white font-bold hover:bg-purple-500/90 flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                Regenerate
              </button>
            )}
            <button onClick={onDismiss}
              className="text-[10px] px-2 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">
              Dismiss stale flag
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
