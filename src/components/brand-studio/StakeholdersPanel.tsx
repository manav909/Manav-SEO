/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/StakeholdersPanel.tsx
   Brand Studio H.5 — Stakeholder profiles + persona synthesis.

   Two stacked sections:
   1. Stakeholder Profiles — named individuals per project with rich
      attributes (communication preference, decision style, focus areas,
      etc). Drives per-stakeholder document targeting later.
   2. Persona Synthesis — multi-document AI synthesis flow. PM picks
      2-12 sales_call_notes / customer_feedback / persona_research /
      case_study documents. AI synthesizes a unified persona view with
      explicit contradictions. PM reviews and approves write-back to
      project_knowledge.audience.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback } from 'react';
import {
  Users, Plus, Edit3, Trash2, X, Save, UserPlus, ChevronDown, ChevronRight,
  Sparkles, AlertTriangle, CheckCircle2, Loader2, FileText, Quote, Layers,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  listStakeholders, upsertStakeholder, deleteStakeholder,
  listSynthesisCandidates, synthesizePersona, applySynthesis,
  type StakeholderProfile, type SynthesisCandidate,
  type SynthesisResult, type SynthesisField,
} from './api';
import type { BrandStudioCatalogs } from './types';

interface Props {
  projectId: string;
  catalogs:  BrandStudioCatalogs | null;
}

export default function StakeholdersPanel({ projectId, catalogs }: Props) {
  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-pink-500/30 bg-gradient-to-br from-pink-500/[0.05] to-purple-500/[0.03] p-5">
        <div className="flex items-start gap-3">
          <Users className="h-5 w-5 text-pink-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-sm font-bold">Stakeholders & Synthesis</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Two layers of audience understanding. <strong>Stakeholder Profiles</strong> capture named individuals (the John who hates fluff, the Sarah who wants narrative) — used for per-person document calibration. <strong>Persona Synthesis</strong> takes multiple sales calls or customer interviews and produces a unified persona view, with contradictions surfaced honestly rather than averaged away.
            </div>
          </div>
        </div>
      </div>

      <StakeholdersSection projectId={projectId} catalogs={catalogs} />
      <SynthesisSection    projectId={projectId} />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Stakeholder Profiles
═════════════════════════════════════════════════════════════ */

function StakeholdersSection({ projectId, catalogs }: { projectId: string; catalogs: BrandStudioCatalogs | null }) {
  const [rows, setRows]       = useState<StakeholderProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<StakeholderProfile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { stakeholders } = await listStakeholders({ projectId, includeInactive: true });
    setRows(stakeholders);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const startNew = () => setEditing({
    display_name:     '',
    stakeholder_role: 'client_executive',
    active:           true,
  });

  const handleSave = async (s: StakeholderProfile) => {
    const { stakeholder, error } = await upsertStakeholder({ projectId, ...s });
    if (error || !stakeholder) {
      toast({ title: 'Save failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: s.id ? 'Stakeholder updated' : 'Stakeholder added' });
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this stakeholder profile? This cannot be undone.')) return;
    const { success } = await deleteStakeholder({ id, projectId });
    if (success) {
      toast({ title: 'Deleted' });
      load();
    }
  };

  /* Group by stakeholder_role for compact display */
  const grouped = rows.reduce((acc, r) => {
    const role = r.stakeholder_role;
    (acc[role] ||= []).push(r);
    return acc;
  }, {} as Record<string, StakeholderProfile[]>);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-bold">Stakeholder Profiles</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Named individuals with communication preferences and decision style. Drives per-stakeholder calibration.
          </div>
        </div>
        <button onClick={startNew}
          className="px-3 py-1.5 rounded-xl bg-pink-500 text-white text-xs font-semibold hover:bg-pink-500/90 flex items-center gap-1">
          <UserPlus className="h-3 w-3" /> Add stakeholder
        </button>
      </div>

      {loading && <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>}

      {!loading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          No stakeholder profiles yet. Add the 2-5 people whose perspective shapes documents on this engagement — the decision-makers, key influencers, and primary readers.
        </div>
      )}

      <div className="space-y-3">
        {Object.entries(grouped).map(([role, items]) => (
          <div key={role}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">
              {catalogs?.stakeholder_roles.find((r) => r.key === role)?.label || role} · {items.length}
            </div>
            <div className="space-y-2">
              {items.map((s) => (
                <StakeholderRow
                  key={s.id}
                  row={s}
                  onEdit={() => setEditing(s)}
                  onDelete={() => s.id && handleDelete(s.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <StakeholderEditor
          row={editing}
          catalogs={catalogs}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </section>
  );
}

function StakeholderRow({ row, onEdit, onDelete }: { row: StakeholderProfile; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border bg-card/60 ${row.active ? 'border-border' : 'border-border opacity-60'}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-start gap-3 px-3 py-2.5 text-left">
        {open ? <ChevronDown className="h-3 w-3 mt-1 shrink-0" /> : <ChevronRight className="h-3 w-3 mt-1 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold">{row.display_name}</span>
            {row.role_title && <span className="text-[11px] text-muted-foreground">{row.role_title}</span>}
            {row.org && <span className="text-[10px] text-muted-foreground/70 italic">— {row.org}</span>}
            {!row.active && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold">inactive</span>}
          </div>
          {row.what_they_care_about && (
            <div className="text-[11px] text-foreground/80 italic mt-0.5 truncate">"{row.what_they_care_about}"</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground">
            <Edit3 className="h-3 w-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 border-t border-border space-y-2 text-xs">
          {row.communication_preference && <Detail label="Communication preference" value={row.communication_preference} />}
          {row.decision_style && <Detail label="Decision style" value={row.decision_style} />}
          {row.focus_areas && <Detail label="Focus areas" value={row.focus_areas} />}
          {row.language_patterns && <Detail label="Language patterns" value={row.language_patterns} />}
          {row.interaction_history && <Detail label="Interaction history" value={row.interaction_history} />}
          {row.watch_outs && <Detail label="Watch-outs" value={row.watch_outs} />}
          {row.preferred_format && <Detail label="Preferred format" value={row.preferred_format} />}
          {row.notes && <Detail label="Notes" value={row.notes} />}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="pt-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className="text-foreground/90 whitespace-pre-wrap mt-0.5">{value}</div>
    </div>
  );
}

function StakeholderEditor({
  row, catalogs, onCancel, onSave,
}: {
  row: StakeholderProfile;
  catalogs: BrandStudioCatalogs | null;
  onCancel: () => void;
  onSave: (s: StakeholderProfile) => void;
}) {
  const [draft, setDraft] = useState<StakeholderProfile>(row);
  const update = (patch: Partial<StakeholderProfile>) => setDraft({ ...draft, ...patch });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-bold">{row.id ? 'Edit' : 'Add'} Stakeholder Profile</div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Display name *">
              <input value={draft.display_name} onChange={(e) => update({ display_name: e.target.value })}
                placeholder="John Smith"
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400" />
            </Field>
            <Field label="Role title">
              <input value={draft.role_title || ''} onChange={(e) => update({ role_title: e.target.value })}
                placeholder="CMO, VP Marketing, etc."
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Stakeholder role *">
              <select value={draft.stakeholder_role} onChange={(e) => update({ stakeholder_role: e.target.value })}
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400">
                {catalogs?.stakeholder_roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Organization">
              <input value={draft.org || ''} onChange={(e) => update({ org: e.target.value })}
                placeholder="If external — company name"
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400" />
            </Field>
          </div>

          <Field label="Communication preference">
            <textarea value={draft.communication_preference || ''} onChange={(e) => update({ communication_preference: e.target.value })}
              rows={2} maxLength={500}
              placeholder='"Data-driven, no fluff" or "narrative + emotion" or "visual / chart-first"'
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400 resize-y" />
          </Field>

          <Field label="Decision style">
            <input value={draft.decision_style || ''} onChange={(e) => update({ decision_style: e.target.value })}
              placeholder='"Consensus-builder" / "decisive" / "data-driven" / "intuition-led"'
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400" />
          </Field>

          <Field label="Focus areas">
            <input value={draft.focus_areas || ''} onChange={(e) => update({ focus_areas: e.target.value })}
              placeholder='What they fixate on — "retention metrics", "brand consistency", "speed to market"'
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400" />
          </Field>

          <Field label="What they care about most">
            <textarea value={draft.what_they_care_about || ''} onChange={(e) => update({ what_they_care_about: e.target.value })}
              rows={2} maxLength={1000}
              placeholder="The specific phrase from interactions or research that captures what matters to them."
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400 resize-y" />
          </Field>

          <Field label="Language patterns">
            <textarea value={draft.language_patterns || ''} onChange={(e) => update({ language_patterns: e.target.value })}
              rows={2} maxLength={1000}
              placeholder="Their specific vocabulary, metaphors, or phrases. Useful for writers calibrating to them."
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400 resize-y" />
          </Field>

          <Field label="Interaction history">
            <textarea value={draft.interaction_history || ''} onChange={(e) => update({ interaction_history: e.target.value })}
              rows={2} maxLength={2000}
              placeholder='Key prior interactions — "Pushed back hard on X in March meeting", "Loved the persona work in Q2"'
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400 resize-y" />
          </Field>

          <Field label="Watch-outs">
            <textarea value={draft.watch_outs || ''} onChange={(e) => update({ watch_outs: e.target.value })}
              rows={2} maxLength={1000}
              placeholder='Specific things to avoid — "Never lead with anything financial without TAM context first"'
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400 resize-y" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Preferred format">
              <input value={draft.preferred_format || ''} onChange={(e) => update({ preferred_format: e.target.value })}
                placeholder='"one-pager" / "deck" / "memo" / "verbal walkthrough"'
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400" />
            </Field>
            <Field label="Email (optional, context only)">
              <input value={draft.email || ''} onChange={(e) => update({ email: e.target.value })}
                placeholder='john@example.com'
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400" />
            </Field>
          </div>

          <Field label="Notes">
            <textarea value={draft.notes || ''} onChange={(e) => update({ notes: e.target.value })}
              rows={2} maxLength={2000}
              placeholder="Anything else worth recording."
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400 resize-y" />
          </Field>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={draft.active} onChange={(e) => update({ active: e.target.checked })}
              className="accent-pink-500" />
            <span className="text-xs font-semibold">Active</span>
            <span className="text-[10px] text-muted-foreground">Inactive profiles are hidden by default but kept for history.</span>
          </label>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button onClick={() => onSave(draft)} disabled={!draft.display_name.trim()}
            className="px-4 py-2 rounded-xl bg-pink-500 text-white text-sm font-semibold hover:bg-pink-500/90 disabled:opacity-50 flex items-center gap-1.5">
            <Save className="h-3 w-3" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</label>
      {children}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Persona Synthesis
═════════════════════════════════════════════════════════════ */

type SynthesisStage = 'idle' | 'picking' | 'running' | 'preview' | 'applying' | 'done';

function SynthesisSection({ projectId }: { projectId: string }) {
  const [candidates,   setCandidates]   = useState<SynthesisCandidate[]>([]);
  const [loadingCand,  setLoadingCand]  = useState(false);
  const [stage,        setStage]        = useState<SynthesisStage>('idle');
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set());
  const [pmGuidance,   setPmGuidance]   = useState('');
  const [synthesis,    setSynthesis]    = useState<SynthesisResult | null>(null);
  const [sourceDocIds, setSourceDocIds] = useState<string[]>([]);
  const [approvedKeys, setApprovedKeys] = useState<Set<string>>(new Set());
  const [error,        setError]        = useState('');

  const loadCandidates = useCallback(async () => {
    setLoadingCand(true);
    const { candidates } = await listSynthesisCandidates(projectId);
    setCandidates(candidates);
    setLoadingCand(false);
  }, [projectId]);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  const startPicking = () => {
    setStage('picking');
    setSelectedIds(new Set());
    setPmGuidance('');
    setSynthesis(null);
    setError('');
  };

  const runSynthesis = async () => {
    if (selectedIds.size < 2) {
      toast({ title: 'Pick at least 2 documents', variant: 'destructive' });
      return;
    }
    setStage('running');
    setError('');
    const ids = Array.from(selectedIds);
    const { synthesis: s, source_doc_ids, error: e } = await synthesizePersona({
      projectId, documentIds: ids, pmGuidance: pmGuidance || undefined,
    });
    if (e || !s) {
      setError(e || 'Synthesis failed');
      setStage('picking');
      return;
    }
    setSynthesis(s);
    setSourceDocIds(source_doc_ids || ids);
    /* Default: approve all non-protected, non-empty fields */
    const initialApproved = new Set<string>();
    for (const f of s.synthesized_fields) {
      if (!f.would_overwrite_protected) initialApproved.add(f.field_key);
    }
    setApprovedKeys(initialApproved);
    setStage('preview');
  };

  const applyApproved = async () => {
    if (!synthesis) return;
    setStage('applying');
    const approved = synthesis.synthesized_fields.filter((f) => approvedKeys.has(f.field_key));
    const { written, skipped, error: e } = await applySynthesis({
      projectId, approvedFields: approved, sourceDocIds,
    });
    if (e) {
      toast({ title: 'Apply failed', description: e, variant: 'destructive' });
      setStage('preview');
      return;
    }
    toast({
      title: 'Synthesis applied',
      description: `${written} field${written === 1 ? '' : 's'} written to Data Room${skipped ? ` · ${skipped} skipped (protected)` : ''}`,
    });
    setStage('done');
  };

  const reset = () => {
    setStage('idle');
    setSelectedIds(new Set());
    setSynthesis(null);
    setApprovedKeys(new Set());
    setError('');
    setPmGuidance('');
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-bold">Persona Synthesis</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Pick 2-12 source documents (sales calls, customer feedback, persona research). AI synthesizes a unified persona view, contradictions surfaced explicitly.
          </div>
        </div>
        {stage === 'idle' && (
          <button onClick={startPicking}
            disabled={candidates.length < 2}
            className="px-3 py-1.5 rounded-xl bg-purple-500 text-white text-xs font-semibold hover:bg-purple-500/90 disabled:opacity-50 flex items-center gap-1">
            <Layers className="h-3 w-3" /> Start synthesis
          </button>
        )}
        {stage !== 'idle' && (
          <button onClick={reset} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">
            Cancel / Start over
          </button>
        )}
      </div>

      {loadingCand && <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>}

      {!loadingCand && candidates.length < 2 && stage === 'idle' && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          Need at least 2 source documents (sales call notes, customer feedback, persona research, or case studies). Ingest more documents via the Ingest tab to enable synthesis.
        </div>
      )}

      {stage === 'idle' && candidates.length >= 2 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <Layers className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <div className="text-sm font-semibold">{candidates.length} document{candidates.length === 1 ? '' : 's'} available for synthesis</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Click "Start synthesis" to begin selecting which documents to synthesize.
          </div>
        </div>
      )}

      {/* PICKING stage */}
      {stage === 'picking' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <div className="text-xs font-bold mb-2">Pick source documents ({selectedIds.size} selected)</div>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {candidates.map((c) => {
                const checked = selectedIds.has(c.id);
                return (
                  <label key={c.id} className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border ${
                    checked ? 'border-purple-500/40 bg-purple-500/[0.04]' : 'border-border bg-background/20 hover:bg-background/40'
                  }`}>
                    <input type="checkbox" checked={checked}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(c.id); else next.delete(c.id);
                        setSelectedIds(next);
                      }}
                      className="mt-1 accent-purple-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-xs font-semibold truncate">{c.name}</span>
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold">
                          {c.doc_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {c.summary && <div className="text-[11px] text-muted-foreground italic mt-0.5">{c.summary}</div>}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/60 p-4">
            <Field label="PM guidance (optional)">
              <textarea value={pmGuidance} onChange={(e) => setPmGuidance(e.target.value)}
                rows={3} maxLength={1500}
                placeholder='e.g. "Focus on enterprise buyers — ignore SMB calls from Q1. Pay attention to objections around integration risk."'
                className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400 resize-y" />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={runSynthesis} disabled={selectedIds.size < 2 || selectedIds.size > 12}
              className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-500/90 disabled:opacity-50 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> Synthesize {selectedIds.size} document{selectedIds.size === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {/* RUNNING stage */}
      {stage === 'running' && (
        <div className="rounded-2xl border border-purple-500/30 bg-purple-500/[0.04] p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-purple-400 mb-3" />
          <div className="text-sm font-bold">Synthesizing across {selectedIds.size} documents…</div>
          <div className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            AI is reading every source, finding the strongest signal, and explicitly surfacing contradictions. 30-60 seconds.
          </div>
        </div>
      )}

      {/* PREVIEW stage */}
      {stage === 'preview' && synthesis && (
        <div className="space-y-4">
          {/* Overall summary */}
          <div className="rounded-2xl border border-purple-500/30 bg-purple-500/[0.04] p-4">
            <div className="text-[10px] uppercase tracking-wider text-purple-400 font-bold mb-1">Synthesis summary</div>
            <div className="text-sm text-foreground/90">{synthesis.overall_summary}</div>
          </div>

          {/* Contradictions — surfaced FIRST because they're the most important */}
          {synthesis.contradictions.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <div className="text-sm font-bold">Contradictions across sources</div>
                <span className="text-[10px] text-muted-foreground">— {synthesis.contradictions.length}</span>
              </div>
              <div className="text-[11px] text-muted-foreground mb-3 italic">
                These are conflicts the synthesis surfaced rather than silently averaging. Resolve with the client where possible.
              </div>
              <div className="space-y-3">
                {synthesis.contradictions.map((c, i) => (
                  <div key={i} className="rounded-xl border border-amber-500/20 bg-background/40 p-3">
                    <div className="text-xs font-bold">{c.topic}</div>
                    <ul className="mt-1 space-y-0.5">
                      {c.views.map((v, j) => (
                        <li key={j} className="text-xs text-foreground/90 flex items-start gap-1.5">
                          <span className="text-amber-400 mt-0.5">·</span>
                          <span>{v}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="text-[11px] text-foreground/80 italic mt-1.5 flex items-start gap-1">
                      <Quote className="h-2.5 w-2.5 text-amber-400 mt-0.5 shrink-0" />
                      <span>{c.recommendation}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Synthesized fields with approve checkboxes */}
          {synthesis.synthesized_fields.length > 0 && (
            <div className="rounded-2xl border border-border bg-card/60 p-4">
              <div className="text-sm font-bold mb-3">Synthesized field values (review + approve)</div>
              <div className="space-y-3">
                {synthesis.synthesized_fields.map((f) => {
                  const approved = approvedKeys.has(f.field_key);
                  const protectedField = !!f.would_overwrite_protected;
                  return (
                    <div key={f.field_key} className={`rounded-xl border p-3 ${
                      protectedField ? 'border-orange-500/30 bg-orange-500/[0.02] opacity-70' :
                      approved ? 'border-green-500/30 bg-green-500/[0.03]' :
                      'border-border bg-background/40'
                    }`}>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={approved} disabled={protectedField}
                          onChange={(e) => {
                            const next = new Set(approvedKeys);
                            if (e.target.checked) next.add(f.field_key); else next.delete(f.field_key);
                            setApprovedKeys(next);
                          }}
                          className="mt-1 accent-green-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] text-foreground/80">audience.{f.field_key}</span>
                            <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
                              f.confidence === 'high' ? 'bg-green-500/15 text-green-400' :
                              f.confidence === 'medium' ? 'bg-amber-500/15 text-amber-400' :
                              'bg-orange-500/15 text-orange-400'
                            }`}>{f.confidence}</span>
                            {protectedField && (
                              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-bold">
                                protected — existing {f.existing_source}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-foreground mt-1">{f.value}</div>
                          {f.reasoning && (
                            <div className="text-[11px] text-muted-foreground italic mt-1">
                              Reasoning: {f.reasoning}
                            </div>
                          )}
                          {f.evidence.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {f.evidence.map((src, i) => (
                                <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                  {src}
                                </span>
                              ))}
                            </div>
                          )}
                          {protectedField && f.existing_value && (
                            <div className="text-[10px] text-orange-400/90 italic mt-1">
                              Existing value will be kept: "{f.existing_value.slice(0, 100)}"
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Open questions */}
          {synthesis.open_questions.length > 0 && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-3">
              <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold mb-1">Open questions for follow-up</div>
              <ul className="space-y-0.5">
                {synthesis.open_questions.map((q, i) => (
                  <li key={i} className="text-xs text-foreground/90 flex items-start gap-1.5">
                    <span className="text-cyan-400 mt-0.5">?</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Apply */}
          <div className="sticky bottom-4 flex items-center justify-end gap-2 bg-background/60 backdrop-blur rounded-2xl border border-border p-3">
            <span className="text-[11px] text-muted-foreground mr-auto">
              Writes to Data Room → audience category with source='synthesis'. Protected (manual/auto-synced) values are never overwritten.
            </span>
            <button onClick={applyApproved} disabled={approvedKeys.size === 0}
              className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-500/90 disabled:opacity-50 flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" /> Apply {approvedKeys.size} field{approvedKeys.size === 1 ? '' : 's'} to Data Room
            </button>
          </div>
        </div>
      )}

      {/* APPLYING stage */}
      {stage === 'applying' && (
        <div className="text-center py-4">
          <Loader2 className="h-4 w-4 animate-spin mx-auto text-purple-400" />
          <div className="text-xs text-muted-foreground mt-1">Writing to Data Room…</div>
        </div>
      )}

      {/* DONE stage */}
      {stage === 'done' && (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/[0.04] p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold">Synthesis applied to Data Room</span>
          </div>
          <button onClick={reset}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-500 text-white font-semibold hover:bg-purple-500/90">
            Run another
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.04] p-3 text-xs text-red-400 mt-3">{error}</div>
      )}
    </section>
  );
}
