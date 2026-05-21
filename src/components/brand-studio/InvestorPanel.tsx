/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/InvestorPanel.tsx
   Brand Studio H.3 — PM-side investor data management.

   Three concerns in tabs:
   1. Traction Proof Points — dated, sourced claims about company
      performance, designed to fuel investor-facing generated docs
   2. Market Intelligence — TAM/SAM/SOM/competitor data with URL
      citations (mandatory for high-confidence entries)
   3. Research — server-side URL fetcher with citation extraction,
      gated to a trusted-domain allowlist by default
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, Globe, Search, Plus, Trash2, Edit3, ShieldCheck,
  ExternalLink, AlertTriangle, Loader2, Save, X, FileCheck2, Database,
  Link2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  listTraction, upsertTraction, deleteTraction,
  listMarketIntel, upsertMarketIntel, deleteMarketIntel,
  researchFetch,
  TRACTION_CATEGORIES, TRACTION_EVIDENCE_TYPES,
  MARKET_INTEL_CATEGORIES, MARKET_INTEL_SOURCE_TYPES,
  type TractionProofPoint, type MarketIntelEntry, type ResearchResult,
} from './api';

interface Props {
  projectId: string;
}

type SubTab = 'traction' | 'market' | 'research';

export default function InvestorPanel({ projectId }: Props) {
  const [sub, setSub] = useState<SubTab>('traction');

  return (
    <div className="space-y-5">
      {/* Brand-specialist framing — sets the tone */}
      <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/[0.05] to-cyan-500/[0.03] p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-sm font-bold">Investor View</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Three data layers fuel the 5 investor-grade templates: <strong>Traction Proof Points</strong> (dated, sourced
              performance claims), <strong>Market Intelligence</strong> (TAM/SAM/competitor data with URL citations),
              and <strong>Research</strong> (server-side fetch + citation extraction from trusted sources). Every claim
              in the resulting documents traces back to evidence you can defend in a diligence call.
            </div>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {[
          { id: 'traction',  label: 'Traction Proof Points', icon: TrendingUp },
          { id: 'market',    label: 'Market Intelligence',    icon: Database  },
          { id: 'research',  label: 'Research',               icon: Search    },
        ].map((t) => {
          const Icon = t.icon;
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id as SubTab)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                active ? 'border-purple-400 text-purple-400' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3 w-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      {sub === 'traction'  && <TractionTab projectId={projectId} />}
      {sub === 'market'    && <MarketTab   projectId={projectId} />}
      {sub === 'research'  && <ResearchTab projectId={projectId} />}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Traction Tab
═════════════════════════════════════════════════════════════ */

function TractionTab({ projectId }: { projectId: string }) {
  const [rows, setRows]       = useState<TractionProofPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<TractionProofPoint | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { proof_points } = await listTraction({ projectId });
    setRows(proof_points);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const startNew = () => setEditing({
    category:      'revenue',
    claim:         '',
    evidence_date: new Date().toISOString().slice(0, 10),
    evidence_type: 'self_reported',
    confidence:    'medium',
    status:        'draft',
  });

  const handleSave = async (p: TractionProofPoint) => {
    const { proof_point, error } = await upsertTraction({ projectId, ...p });
    if (error || !proof_point) {
      toast({ title: 'Save failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: p.id ? 'Updated' : 'Added' });
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this proof point? This cannot be undone.')) return;
    const { success } = await deleteTraction({ id, projectId });
    if (success) {
      toast({ title: 'Deleted' });
      load();
    }
  };

  /* Group by category for compact display */
  const grouped = rows.reduce((acc, r) => {
    (acc[r.category] ||= []).push(r);
    return acc;
  }, {} as Record<string, TractionProofPoint[]>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold">Traction Proof Points</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Dated, sourced performance claims. Used by the Traction Memo, Investor One-Pager, and Pitch Deck templates.
          </div>
        </div>
        <button
          onClick={startNew}
          className="px-3 py-1.5 rounded-xl bg-purple-500 text-white text-xs font-semibold hover:bg-purple-500/90 flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Add proof point
        </button>
      </div>

      {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

      {!loading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          No proof points yet. Add your first one — investor templates need at least 3-5 dated proof points to produce credible output.
        </div>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            {TRACTION_CATEGORIES.find((c) => c.key === cat)?.label || cat} · {items.length}
          </div>
          {items.map((r) => (
            <TractionRow
              key={r.id}
              row={r}
              onEdit={() => setEditing(r)}
              onDelete={() => r.id && handleDelete(r.id)}
            />
          ))}
        </div>
      ))}

      {editing && (
        <TractionEditor
          row={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function TractionRow({ row, onEdit, onDelete }: { row: TractionProofPoint; onEdit: () => void; onDelete: () => void }) {
  const confTone =
    row.confidence === 'high'   ? 'bg-green-500/15 text-green-400' :
    row.confidence === 'medium' ? 'bg-amber-500/15 text-amber-400' :
    'bg-orange-500/15 text-orange-400';
  const evTypeTone =
    row.evidence_type === 'verified_third_party' ? 'bg-green-500/10 text-green-400' :
    row.evidence_type === 'verified_internal'    ? 'bg-blue-500/10 text-blue-400'   :
    row.evidence_type === 'self_reported'        ? 'bg-amber-500/10 text-amber-400' :
    'bg-orange-500/10 text-orange-400';

  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{row.claim}</div>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {row.metric_value && <span className="text-xs text-foreground/90 font-mono">{row.metric_value}</span>}
          {row.metric_period && <span className="text-[10px] text-muted-foreground">· {row.metric_period}</span>}
          <span className="text-[10px] text-muted-foreground">· anchored {new Date(row.evidence_date).toLocaleDateString('en-GB')}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${confTone}`}>{row.confidence}</span>
          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${evTypeTone}`}>
            {TRACTION_EVIDENCE_TYPES.find((e) => e.key === row.evidence_type)?.label}
          </span>
          {row.source_name && <span className="text-[10px] text-muted-foreground">Source: {row.source_name}</span>}
          {row.source_url && (
            <a href={row.source_url} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-cyan-400 hover:underline inline-flex items-center gap-0.5">
              <ExternalLink className="h-2.5 w-2.5" /> URL
            </a>
          )}
          {row.status === 'verified' && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-bold flex items-center gap-0.5">
              <FileCheck2 className="h-2.5 w-2.5" /> Verified
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground">
          <Edit3 className="h-3 w-3" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function TractionEditor({
  row, onCancel, onSave,
}: {
  row: TractionProofPoint;
  onCancel: () => void;
  onSave: (r: TractionProofPoint) => void;
}) {
  const [draft, setDraft] = useState<TractionProofPoint>(row);
  const update = (patch: Partial<TractionProofPoint>) => setDraft({ ...draft, ...patch });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-bold">{row.id ? 'Edit' : 'Add'} Traction Proof Point</div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Category *">
            <select value={draft.category} onChange={(e) => update({ category: e.target.value })}
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400">
              {TRACTION_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Field>

          <Field label="Claim * (the headline statement)">
            <textarea value={draft.claim} onChange={(e) => update({ claim: e.target.value })}
              rows={2} maxLength={500}
              placeholder='e.g. "Organic sessions grew 4.1× year-over-year, from 12,400 to 50,900 monthly."'
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400 resize-y" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Metric value">
              <input value={draft.metric_value || ''} onChange={(e) => update({ metric_value: e.target.value })}
                placeholder='"$2.4M ARR" or "47k → 196k"'
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400" />
            </Field>
            <Field label="Period covered">
              <input value={draft.metric_period || ''} onChange={(e) => update({ metric_period: e.target.value })}
                placeholder='"Apr 2024 → Apr 2025"'
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400" />
            </Field>
          </div>

          <Field label="Evidence date *">
            <input type="date" value={draft.evidence_date} onChange={(e) => update({ evidence_date: e.target.value })}
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400" />
          </Field>

          <Field label="Evidence type *">
            <select value={draft.evidence_type} onChange={(e) => update({ evidence_type: e.target.value })}
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400">
              {TRACTION_EVIDENCE_TYPES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Source name">
              <input value={draft.source_name || ''} onChange={(e) => update({ source_name: e.target.value })}
                placeholder='"Stripe Dashboard Q1 2025"'
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400" />
            </Field>
            <Field label="Source URL (if public)">
              <input value={draft.source_url || ''} onChange={(e) => update({ source_url: e.target.value })}
                placeholder='https://…'
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400" />
            </Field>
          </div>

          <Field label="Source excerpt (literal quote)">
            <textarea value={draft.source_excerpt || ''} onChange={(e) => update({ source_excerpt: e.target.value })}
              rows={2} maxLength={2000}
              placeholder="The verbatim text from the source that supports this claim."
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400 resize-y" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Confidence">
              <select value={draft.confidence} onChange={(e) => update({ confidence: e.target.value as any })}
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={draft.status} onChange={(e) => update({ status: e.target.value as any })}
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400">
                <option value="draft">Draft</option>
                <option value="verified">Verified</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          </div>

          <Field label="Notes">
            <textarea value={draft.notes || ''} onChange={(e) => update({ notes: e.target.value })}
              rows={2} maxLength={2000}
              placeholder="Anything else worth recording — caveats, methodology, follow-ups."
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400 resize-y" />
          </Field>
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button onClick={() => onSave(draft)}
            disabled={!draft.claim.trim() || !draft.evidence_date}
            className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-500/90 disabled:opacity-50 flex items-center gap-1.5">
            <Save className="h-3 w-3" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Market Intelligence Tab
═════════════════════════════════════════════════════════════ */

function MarketTab({ projectId }: { projectId: string }) {
  const [rows, setRows]       = useState<MarketIntelEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<MarketIntelEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { market_intel } = await listMarketIntel({ projectId });
    setRows(market_intel);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const startNew = () => setEditing({
    category:   'tam',
    claim:      '',
    confidence: 'medium',
    status:     'draft',
  });

  const handleSave = async (m: MarketIntelEntry) => {
    const { market_intel, notice, error } = await upsertMarketIntel({ projectId, ...m });
    if (error || !market_intel) {
      toast({ title: 'Save failed', description: error, variant: 'destructive' });
      return;
    }
    if (notice) {
      toast({ title: 'Saved with notice', description: notice });
    } else {
      toast({ title: m.id ? 'Updated' : 'Added' });
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this market intelligence entry? This cannot be undone.')) return;
    const { success } = await deleteMarketIntel({ id, projectId });
    if (success) {
      toast({ title: 'Deleted' });
      load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold">Market Intelligence</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            TAM/SAM/SOM, growth rates, competitor data. <strong>High-confidence entries require a source URL</strong> — without one, confidence is capped at medium.
          </div>
        </div>
        <button onClick={startNew}
          className="px-3 py-1.5 rounded-xl bg-purple-500 text-white text-xs font-semibold hover:bg-purple-500/90 flex items-center gap-1">
          <Plus className="h-3 w-3" /> Add market data
        </button>
      </div>

      {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

      {!loading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          No market intelligence yet. Required for the Market Opportunity Memo template.
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <MarketRow
            key={r.id}
            row={r}
            onEdit={() => setEditing(r)}
            onDelete={() => r.id && handleDelete(r.id)}
          />
        ))}
      </div>

      {editing && (
        <MarketEditor
          row={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function MarketRow({ row, onEdit, onDelete }: { row: MarketIntelEntry; onEdit: () => void; onDelete: () => void }) {
  const confTone =
    row.confidence === 'high'   ? 'bg-green-500/15 text-green-400' :
    row.confidence === 'medium' ? 'bg-amber-500/15 text-amber-400' :
    'bg-orange-500/15 text-orange-400';
  const catLabel = MARKET_INTEL_CATEGORIES.find((c) => c.key === row.category)?.label || row.category;

  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold">{catLabel}</span>
          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${confTone}`}>{row.confidence}</span>
          {row.competitor_name && (
            <span className="text-[10px] text-muted-foreground">re: {row.competitor_name}</span>
          )}
        </div>
        <div className="text-sm font-semibold text-foreground mt-1">{row.claim}</div>
        {row.metric_value && <div className="text-xs text-foreground/90 font-mono mt-0.5">{row.metric_value}</div>}
        {row.methodology && (
          <div className="text-[11px] text-muted-foreground italic mt-1">Methodology: {row.methodology}</div>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px]">
          {row.source_name && <span className="text-muted-foreground">Source: {row.source_name}</span>}
          {row.source_date && <span className="text-muted-foreground">· {new Date(row.source_date).toLocaleDateString('en-GB')}</span>}
          {row.source_url ? (
            <a href={row.source_url} target="_blank" rel="noopener noreferrer"
              className="text-cyan-400 hover:underline inline-flex items-center gap-0.5">
              <ExternalLink className="h-2.5 w-2.5" /> Source
            </a>
          ) : (
            <span className="text-amber-400 inline-flex items-center gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5" /> No URL
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground">
          <Edit3 className="h-3 w-3" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function MarketEditor({
  row, onCancel, onSave,
}: {
  row: MarketIntelEntry;
  onCancel: () => void;
  onSave: (m: MarketIntelEntry) => void;
}) {
  const [draft, setDraft] = useState<MarketIntelEntry>(row);
  const update = (patch: Partial<MarketIntelEntry>) => setDraft({ ...draft, ...patch });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-bold">{row.id ? 'Edit' : 'Add'} Market Intelligence</div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Category *">
            <select value={draft.category} onChange={(e) => update({ category: e.target.value })}
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400">
              {MARKET_INTEL_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Field>

          <Field label="Claim *">
            <textarea value={draft.claim} onChange={(e) => update({ claim: e.target.value })}
              rows={2} maxLength={500}
              placeholder='e.g. "Global SEO services market size"'
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400 resize-y" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Metric value">
              <input value={draft.metric_value || ''} onChange={(e) => update({ metric_value: e.target.value })}
                placeholder='"$80.2B in 2024" or "8.4% CAGR"'
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400" />
            </Field>
            <Field label="Competitor name (if applicable)">
              <input value={draft.competitor_name || ''} onChange={(e) => update({ competitor_name: e.target.value })}
                placeholder="optional"
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400" />
            </Field>
          </div>

          <Field label="Source URL (REQUIRED for high confidence)">
            <input value={draft.source_url || ''} onChange={(e) => update({ source_url: e.target.value })}
              placeholder='https://…'
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400" />
            {!draft.source_url && draft.confidence === 'high' && (
              <div className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-2.5 w-2.5" />
                Without a URL, confidence will be capped at medium when saved.
              </div>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Source name">
              <input value={draft.source_name || ''} onChange={(e) => update({ source_name: e.target.value })}
                placeholder='"Statista" or "Gartner Q3 2024"'
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400" />
            </Field>
            <Field label="Source date">
              <input type="date" value={draft.source_date || ''} onChange={(e) => update({ source_date: e.target.value })}
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400" />
            </Field>
          </div>

          <Field label="Source type">
            <select value={draft.source_type || ''} onChange={(e) => update({ source_type: e.target.value || null })}
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400">
              <option value="">— Not specified —</option>
              {MARKET_INTEL_SOURCE_TYPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>

          <Field label="Source excerpt (literal quote)">
            <textarea value={draft.source_excerpt || ''} onChange={(e) => update({ source_excerpt: e.target.value })}
              rows={2} maxLength={2000}
              placeholder="The verbatim text from the source supporting this claim."
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400 resize-y" />
          </Field>

          <Field label="Methodology">
            <textarea value={draft.methodology || ''} onChange={(e) => update({ methodology: e.target.value })}
              rows={2} maxLength={1000}
              placeholder='"Bottom-up: 4.2M SMBs × $1,900 avg annual spend"'
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400 resize-y" />
          </Field>

          <Field label="Assumptions">
            <textarea value={draft.assumptions || ''} onChange={(e) => update({ assumptions: e.target.value })}
              rows={2} maxLength={1000}
              placeholder="Explicit assumptions baked into this figure."
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400 resize-y" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Confidence">
              <select value={draft.confidence} onChange={(e) => update({ confidence: e.target.value as any })}
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={draft.status} onChange={(e) => update({ status: e.target.value as any })}
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400">
                <option value="draft">Draft</option>
                <option value="verified">Verified</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button onClick={() => onSave(draft)}
            disabled={!draft.claim.trim()}
            className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-500/90 disabled:opacity-50 flex items-center gap-1.5">
            <Save className="h-3 w-3" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Research Tab — server-side fetch + citation extraction
═════════════════════════════════════════════════════════════ */

function ResearchTab({ projectId: _projectId }: { projectId: string }) {
  const [url, setUrl]             = useState('');
  const [query, setQuery]         = useState('');
  const [allowUntrusted, setAllowUntrusted] = useState(false);
  const [untrustedReason, setUntrustedReason] = useState('');
  const [result, setResult]       = useState<ResearchResult | null>(null);
  const [fetching, setFetching]   = useState(false);

  const run = async () => {
    if (!url.trim() || !query.trim()) return;
    setFetching(true);
    setResult(null);
    const r = await researchFetch({
      url: url.trim(),
      query: query.trim(),
      allowUntrusted: allowUntrusted || undefined,
      untrustedReason: untrustedReason || undefined,
    });
    setFetching(false);
    setResult(r);
    if (!r.success && r.error) {
      toast({ title: 'Research fetch failed', description: r.error, variant: 'destructive' });
    }
  };

  const copyExcerpt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Excerpt copied to clipboard' });
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-bold">Research — server-side citation extraction</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
          Fetches a URL server-side, extracts excerpts that match your query, and returns them ready to paste into a Market Intelligence entry's source_excerpt. Default allowlist: government statistics, top industry research firms, primary company filings, established databases, academic sources, reputable business press.
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-3">
        <Field label="URL to fetch *">
          <input value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.statista.com/…"
            className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400" />
        </Field>

        <Field label="What are you looking for in this page? *">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "global SEO services market size 2024"'
            className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400" />
        </Field>

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={allowUntrusted} onChange={(e) => setAllowUntrusted(e.target.checked)}
            className="mt-1 accent-amber-500" />
          <div className="text-[11px] text-foreground/90 flex-1">
            <div className="font-semibold flex items-center gap-1">
              Allow source outside the trusted-domain allowlist
              <AlertTriangle className="h-3 w-3 text-amber-400" />
            </div>
            <div className="text-muted-foreground mt-0.5">
              Only use for sources you can defend in a diligence call. Reddit, random blogs, and unattributed posts should never be cited in investor-facing material.
            </div>
          </div>
        </label>

        {allowUntrusted && (
          <Field label="Why is this untrusted source acceptable?">
            <input value={untrustedReason} onChange={(e) => setUntrustedReason(e.target.value)}
              placeholder='e.g. "Primary company blog with verified author credentials"'
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400" />
          </Field>
        )}

        <button onClick={run}
          disabled={!url.trim() || !query.trim() || fetching}
          className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-500/90 disabled:opacity-50 flex items-center gap-1.5">
          {fetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
          Fetch + extract
        </button>
      </div>

      {result && (
        <div className={`rounded-2xl border p-5 space-y-3 ${
          result.error ? 'border-red-500/30 bg-red-500/[0.04]' :
          result.trusted ? 'border-green-500/30 bg-green-500/[0.04]' :
          'border-amber-500/30 bg-amber-500/[0.04]'
        }`}>
          <div className="flex items-start gap-2">
            {result.error ? <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" /> :
             result.trusted ? <ShieldCheck className="h-5 w-5 text-green-400 shrink-0 mt-0.5" /> :
             <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              {result.error ? (
                <>
                  <div className="text-sm font-bold">Could not fetch</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{result.error}</div>
                </>
              ) : (
                <>
                  <div className="text-sm font-bold">{result.title || result.url}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="font-mono">{result.domain}</span>
                    {result.trusted
                      ? <span className="text-green-400">· trusted allowlist</span>
                      : <span className="text-amber-400">· OUTSIDE allowlist</span>}
                    <span>· {result.word_count_extracted} words extracted</span>
                    <a href={result.url} target="_blank" rel="noopener noreferrer"
                      className="text-cyan-400 hover:underline inline-flex items-center gap-0.5">
                      <ExternalLink className="h-2.5 w-2.5" /> Open
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>

          {result.excerpts && result.excerpts.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5">
                Excerpts matching your query ({result.excerpts.length})
              </div>
              <div className="space-y-2">
                {result.excerpts.map((ex, i) => (
                  <div key={i} className="rounded-xl border border-border bg-background/40 p-3 flex items-start gap-2">
                    <div className="text-xs text-foreground/90 italic flex-1">{ex.excerpt}</div>
                    <button onClick={() => copyExcerpt(ex.excerpt)}
                      className="text-[10px] px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground shrink-0">
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.excerpts && result.excerpts.length === 0 && !result.error && (
            <div className="text-xs text-muted-foreground italic">
              No excerpts matched your query terms in this page. Try broader query terms, or paste the source_excerpt manually from the page.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Shared
═════════════════════════════════════════════════════════════ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</label>
      {children}
    </div>
  );
}
