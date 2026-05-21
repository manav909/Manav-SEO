/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/IntakeForms.tsx
   Brand Studio H.6a — Intake form builder (PM) + completion (client)
   + response review (PM). All in one file because they share types
   and the surfaces are tightly coupled.
═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList, Plus, Trash2, Edit3, X, Save, Loader2, GripVertical,
  Send, CheckCircle2, AlertTriangle, FileCheck2, RefreshCw,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  listIntakeForms, upsertIntakeForm, deleteIntakeForm,
  listIntakeResponses, reviewIntakeResponse,
  clientSessionListIntakeForms, clientSessionSubmitIntake,
  RESPONSE_TYPES, CLIENT_ROLES,
  type IntakeForm, type IntakeQuestion, type IntakeResponse,
} from './api';

/* ═════════════════════════════════════════════════════════════
   PM-side: IntakeFormsManager (list + builder + responses)
═════════════════════════════════════════════════════════════ */

export function IntakeFormsManager({ projectId }: { projectId: string }) {
  const [forms, setForms]         = useState<IntakeForm[]>([]);
  const [responses, setResponses] = useState<IntakeResponse[]>([]);
  const [loading, setLoading]     = useState(false);
  const [editing, setEditing]     = useState<IntakeForm | null>(null);
  const [reviewing, setReviewing] = useState<IntakeResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [fr, rr] = await Promise.all([
      listIntakeForms({ projectId }),
      listIntakeResponses({ projectId, pendingReviewOnly: true }),
    ]);
    setForms(fr.forms);
    setResponses(rr.responses);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const startNew = () => setEditing({
    title: '',
    description: '',
    status: 'draft',
    questions: [],
    visible_to_roles: ['client_executive','client_marketing'],
  });

  const handleSave = async (form: IntakeForm) => {
    const { form: saved, error } = await upsertIntakeForm({ projectId, ...form });
    if (error || !saved) {
      toast({ title: 'Save failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: form.id ? 'Form updated' : 'Form created' });
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this form? Responses are kept for the historical record.')) return;
    const { success } = await deleteIntakeForm({ id, projectId });
    if (success) {
      toast({ title: 'Deleted' });
      load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-pink-500/30 bg-gradient-to-br from-pink-500/[0.05] to-purple-500/[0.03] p-5">
        <div className="flex items-start gap-3">
          <ClipboardList className="h-5 w-5 text-pink-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Intake forms</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Structured questionnaires for clients. Each question can map to a Data Room field (responses populate as drafts requiring your review) or be free text (responses become a document). NEVER_OVERWRITE discipline preserved.
            </div>
          </div>
          <button onClick={startNew}
            className="px-3 py-1.5 rounded-xl bg-pink-500 text-white text-xs font-semibold hover:bg-pink-500/90 flex items-center gap-1 shrink-0">
            <Plus className="h-3 w-3" /> New form
          </button>
        </div>
      </div>

      {responses.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-3 space-y-2">
          <div className="text-xs font-bold flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            {responses.length} submission{responses.length === 1 ? '' : 's'} awaiting your review
          </div>
          <div className="space-y-1.5">
            {responses.map((r) => {
              const form = forms.find((f) => f.id === r.form_id);
              return (
                <button
                  key={r.id}
                  onClick={() => setReviewing(r)}
                  className="w-full text-left rounded-lg border border-border bg-background/40 px-3 py-2 hover:bg-background/60 flex items-center gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{form?.title || 'Unknown form'}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Submitted {r.submitted_at ? new Date(r.submitted_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : 'recently'}
                    </div>
                  </div>
                  <FileCheck2 className="h-3 w-3 text-amber-400 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading && <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>}

      {!loading && forms.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-xs text-muted-foreground">
          No intake forms yet. Click <strong>New form</strong> to define your first questionnaire.
        </div>
      )}

      <div className="space-y-2">
        {forms.map((f) => (
          <FormRow key={f.id} form={f} onEdit={() => setEditing(f)} onDelete={() => f.id && handleDelete(f.id)} />
        ))}
      </div>

      {editing && (
        <IntakeFormEditor
          form={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {reviewing && (
        <ReviewResponseDialog
          response={reviewing}
          form={forms.find((f) => f.id === reviewing.form_id)}
          projectId={projectId}
          onClose={() => setReviewing(null)}
          onApplied={() => { setReviewing(null); load(); }}
        />
      )}
    </div>
  );
}

function FormRow({ form, onEdit, onDelete }: { form: IntakeForm; onEdit: () => void; onDelete: () => void }) {
  const statusTone =
    form.status === 'open'   ? 'bg-green-500/15 text-green-400' :
    form.status === 'closed' ? 'bg-muted text-muted-foreground' :
    'bg-amber-500/15 text-amber-400';
  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold">{form.title}</span>
          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${statusTone}`}>{form.status}</span>
          <span className="text-[10px] text-muted-foreground">{form.questions.length} question{form.questions.length === 1 ? '' : 's'}</span>
        </div>
        {form.description && <div className="text-[11px] text-muted-foreground mt-0.5">{form.description}</div>}
        <div className="text-[10px] text-muted-foreground mt-1">
          Visible to: {form.visible_to_roles.map((r) => r.replace('client_', '')).join(', ')}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground"><Edit3 className="h-3 w-3" /></button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
      </div>
    </div>
  );
}

function IntakeFormEditor({
  form, onCancel, onSave,
}: {
  form: IntakeForm; onCancel: () => void; onSave: (f: IntakeForm) => void;
}) {
  const [draft, setDraft] = useState<IntakeForm>(form);
  const update = (patch: Partial<IntakeForm>) => setDraft({ ...draft, ...patch });

  const addQuestion = () => {
    const newQ: IntakeQuestion = {
      key:             `q${draft.questions.length + 1}`,
      question_text:   '',
      response_type:   'short_text',
      required:        false,
    };
    update({ questions: [...draft.questions, newQ] });
  };

  const updateQuestion = (i: number, patch: Partial<IntakeQuestion>) => {
    const updated = [...draft.questions];
    updated[i] = { ...updated[i], ...patch };
    update({ questions: updated });
  };

  const removeQuestion = (i: number) => {
    update({ questions: draft.questions.filter((_, idx) => idx !== i) });
  };

  const moveQuestion = (i: number, dir: -1 | 1) => {
    const updated = [...draft.questions];
    const j = i + dir;
    if (j < 0 || j >= updated.length) return;
    [updated[i], updated[j]] = [updated[j], updated[i]];
    update({ questions: updated });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-bold">{form.id ? 'Edit' : 'New'} intake form</div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Title *</label>
              <input value={draft.title} onChange={(e) => update({ title: e.target.value })}
                placeholder='"Brand Discovery Questionnaire"'
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Status</label>
              <select value={draft.status} onChange={(e) => update({ status: e.target.value as any })}
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400">
                <option value="draft">Draft (hidden from client)</option>
                <option value="open">Open (accepting responses)</option>
                <option value="closed">Closed (visible but no new responses)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Description</label>
            <textarea value={draft.description || ''} onChange={(e) => update({ description: e.target.value })}
              rows={2} maxLength={2000}
              placeholder="Intro text the client sees when they open this form."
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400 resize-y" />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Visible to roles</label>
            <div className="flex flex-wrap gap-2">
              {CLIENT_ROLES.map((r) => {
                const checked = draft.visible_to_roles.includes(r.key);
                return (
                  <label key={r.key} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs cursor-pointer ${
                    checked ? 'border-pink-500/40 bg-pink-500/10' : 'border-border'
                  }`}>
                    <input type="checkbox" checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...draft.visible_to_roles, r.key]
                          : draft.visible_to_roles.filter((x) => x !== r.key);
                        update({ visible_to_roles: next });
                      }}
                      className="accent-pink-500" />
                    {r.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Questions ({draft.questions.length})</label>
              <button onClick={addQuestion} className="text-[10px] px-2 py-1 rounded-lg bg-pink-500 text-white font-semibold hover:bg-pink-500/90 flex items-center gap-1">
                <Plus className="h-2.5 w-2.5" /> Add question
              </button>
            </div>

            {draft.questions.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                Add at least one question before saving.
              </div>
            )}

            <div className="space-y-2">
              {draft.questions.map((q, i) => (
                <QuestionEditor
                  key={i}
                  question={q}
                  index={i}
                  onChange={(patch) => updateQuestion(i, patch)}
                  onRemove={() => removeQuestion(i)}
                  onMoveUp={i > 0 ? () => moveQuestion(i, -1) : undefined}
                  onMoveDown={i < draft.questions.length - 1 ? () => moveQuestion(i, 1) : undefined}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={() => onSave(draft)} disabled={!draft.title.trim() || draft.questions.length === 0}
            className="px-4 py-2 rounded-xl bg-pink-500 text-white text-sm font-semibold hover:bg-pink-500/90 disabled:opacity-50 flex items-center gap-1.5">
            <Save className="h-3 w-3" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionEditor({
  question, index, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  question: IntakeQuestion; index: number;
  onChange: (patch: Partial<IntakeQuestion>) => void;
  onRemove: () => void;
  onMoveUp?: () => void; onMoveDown?: () => void;
}) {
  const needsOptions = question.response_type === 'single_choice' || question.response_type === 'multi_choice';
  const optionsStr = (question.options || []).join('\n');

  return (
    <div className="rounded-xl border border-border bg-background/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <GripVertical className="h-3 w-3 text-muted-foreground/40" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Q{index + 1}</span>
        <div className="ml-auto flex items-center gap-1">
          {onMoveUp && <button onClick={onMoveUp} className="text-[10px] text-muted-foreground hover:text-foreground px-1">↑</button>}
          {onMoveDown && <button onClick={onMoveDown} className="text-[10px] text-muted-foreground hover:text-foreground px-1">↓</button>}
          <button onClick={onRemove} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      <input value={question.question_text} onChange={(e) => onChange({ question_text: e.target.value })}
        placeholder="Question text"
        className="w-full h-8 text-sm px-2 rounded-lg border border-border bg-background/60 outline-none focus:border-pink-400" />

      <div className="grid grid-cols-2 gap-2">
        <select value={question.response_type} onChange={(e) => onChange({ response_type: e.target.value as any, options: needsOptions ? question.options : null })}
          className="h-8 text-xs px-2 rounded-lg border border-border bg-background/60 outline-none focus:border-pink-400">
          {RESPONSE_TYPES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <input value={question.key} onChange={(e) => onChange({ key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })}
          placeholder="Key (unique per form)"
          className="h-8 text-xs px-2 rounded-lg border border-border bg-background/60 outline-none focus:border-pink-400 font-mono" />
      </div>

      {needsOptions && (
        <textarea value={optionsStr}
          onChange={(e) => onChange({ options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
          rows={3} placeholder="One option per line"
          className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background/60 outline-none focus:border-pink-400 resize-y" />
      )}

      <div className="grid grid-cols-2 gap-2">
        <input value={question.target_category || ''} onChange={(e) => onChange({ target_category: e.target.value || null })}
          placeholder="Maps to Data Room category (optional)"
          className="h-7 text-[11px] px-2 rounded-lg border border-border bg-background/60 outline-none focus:border-pink-400 font-mono" />
        <input value={question.target_field_key || ''} onChange={(e) => onChange({ target_field_key: e.target.value || null })}
          placeholder="Field key (if mapped)"
          className="h-7 text-[11px] px-2 rounded-lg border border-border bg-background/60 outline-none focus:border-pink-400 font-mono" />
      </div>
      <div className="text-[10px] text-muted-foreground">
        If mapped to a Data Room field, the response populates as a draft (PM review required). If unmapped, the response becomes a free-text document.
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 text-[11px] cursor-pointer">
          <input type="checkbox" checked={!!question.required} onChange={(e) => onChange({ required: e.target.checked })} className="accent-pink-500" />
          Required
        </label>
        <input value={question.help_text || ''} onChange={(e) => onChange({ help_text: e.target.value || null })}
          placeholder="Help text shown to client (optional)"
          className="flex-1 h-7 text-[11px] px-2 rounded-lg border border-border bg-background/60 outline-none focus:border-pink-400" />
      </div>
    </div>
  );
}

function ReviewResponseDialog({
  response, form, projectId, onClose, onApplied,
}: {
  response: IntakeResponse;
  form?: IntakeForm;
  projectId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [applyMap, setApplyMap] = useState<Record<string, { skip?: boolean }>>({});
  const [notes, setNotes]       = useState('');
  const [applying, setApplying] = useState(false);

  if (!form) return null;

  const apply = async () => {
    setApplying(true);
    const { written, skipped, error } = await reviewIntakeResponse({
      id: response.id, projectId, applyMap, reviewNotes: notes || undefined,
    });
    setApplying(false);
    if (error) {
      toast({ title: 'Apply failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: `Reviewed`, description: `${written ?? 0} field${(written ?? 0) === 1 ? '' : 's'} written · ${skipped ?? 0} skipped` });
    onApplied();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">Review submission: {form.title}</div>
            <div className="text-[10px] text-muted-foreground">Submitted {response.submitted_at ? new Date(response.submitted_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : ''}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {form.questions.map((q) => {
            const ans = response.responses[q.key];
            const skip = applyMap[q.key]?.skip;
            const hasAns = ans !== undefined && ans !== null && String(ans).trim() !== '';
            return (
              <div key={q.key} className={`rounded-xl border p-3 ${
                !hasAns ? 'border-border opacity-50' :
                skip    ? 'border-orange-500/30 bg-orange-500/[0.04]' :
                'border-green-500/30 bg-green-500/[0.03]'
              }`}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={!skip && hasAns} disabled={!hasAns}
                    onChange={(e) => setApplyMap({ ...applyMap, [q.key]: { skip: !e.target.checked } })}
                    className="mt-1 accent-green-500" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{q.question_text}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {q.target_category && q.target_field_key
                        ? <>Maps to <code className="font-mono">{q.target_category}.{q.target_field_key}</code></>
                        : <>Free text — will become an intake_response document</>
                      }
                    </div>
                    {hasAns ? (
                      <div className="text-sm text-foreground mt-1 whitespace-pre-wrap">{String(ans)}</div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground italic mt-1">No response</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="space-y-1 pt-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Review notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000}
              placeholder="Internal notes about this review"
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-pink-400 resize-y" />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <span className="text-[10px] text-muted-foreground mr-auto">
            Protected fields (manual / GSC / GA4 / seed) are never overwritten.
          </span>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={apply} disabled={applying}
            className="px-4 py-2 rounded-xl bg-pink-500 text-white text-sm font-semibold hover:bg-pink-500/90 disabled:opacity-50 flex items-center gap-1.5">
            {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Apply selected
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   Client-side: ClientIntakeList + form completion
═════════════════════════════════════════════════════════════ */

export function ClientIntakeList({
  sessionToken, brandColor,
}: {
  sessionToken: string; brandColor?: string;
}) {
  const [forms, setForms]     = useState<(IntakeForm & { response_status?: string | null; submitted_at?: string | null })[]>([]);
  const [loading, setLoading] = useState(false);
  const [filling, setFilling] = useState<IntakeForm | null>(null);
  const accent = brandColor || '#ec4899';

  const load = useCallback(async () => {
    setLoading(true);
    const r = await clientSessionListIntakeForms(sessionToken);
    setForms(r.forms);
    setLoading(false);
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>;

  if (forms.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
        No forms to fill out right now.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-bold mb-2">Forms for you to complete</div>
      {forms.map((f) => (
        <button
          key={f.id}
          onClick={() => setFilling(f)}
          className="w-full text-left rounded-xl border border-border bg-card/60 p-3 hover:bg-card/80 flex items-center gap-3"
        >
          <ClipboardList className="h-4 w-4 shrink-0" style={{ color: accent }} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{f.title}</div>
            {f.description && <div className="text-[11px] text-muted-foreground">{f.description}</div>}
          </div>
          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
            f.response_status === 'pm_reviewed' ? 'bg-green-500/15 text-green-400' :
            f.response_status === 'submitted'   ? 'bg-amber-500/15 text-amber-400' :
            f.response_status === 'in_progress' ? 'bg-cyan-500/15 text-cyan-400' :
            'bg-purple-500/15 text-purple-400'
          }`}>
            {f.response_status === 'pm_reviewed' ? 'Reviewed' :
             f.response_status === 'submitted'   ? 'Submitted' :
             f.response_status === 'in_progress' ? 'In progress' : 'Start'}
          </span>
        </button>
      ))}

      {filling && (
        <ClientIntakeForm
          form={filling}
          sessionToken={sessionToken}
          brandColor={accent}
          onClose={() => { setFilling(null); load(); }}
        />
      )}
    </div>
  );
}

function ClientIntakeForm({
  form, sessionToken, brandColor, onClose,
}: {
  form: IntakeForm & { response_status?: string | null };
  sessionToken: string;
  brandColor: string;
  onClose: () => void;
}) {
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const isLocked = form.response_status === 'pm_reviewed';

  const save = async (final: boolean) => {
    setSubmitting(true);
    const { error } = await clientSessionSubmitIntake({
      sessionToken, formId: form.id!, responses, isFinalSubmit: final,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: final ? 'Submit failed' : 'Save failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: final ? 'Submitted' : 'Saved' });
    if (final) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">{form.title}</div>
            {form.description && <div className="text-[11px] text-muted-foreground mt-0.5">{form.description}</div>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLocked && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/[0.04] p-3 text-xs">
              <CheckCircle2 className="h-3 w-3 text-green-400 inline mr-1" />
              Your previous submission has been reviewed by your account manager.
            </div>
          )}
          {form.questions.map((q) => (
            <QuestionField
              key={q.key}
              question={q}
              value={responses[q.key]}
              onChange={(v) => setResponses({ ...responses, [q.key]: v })}
              brandColor={brandColor}
              disabled={isLocked}
            />
          ))}
        </div>

        {!isLocked && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
            <button onClick={() => save(false)} disabled={submitting}
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save progress'}
            </button>
            <button onClick={() => save(true)} disabled={submitting}
              className="px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
              style={{ backgroundColor: brandColor }}>
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Submit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionField({
  question, value, onChange, brandColor, disabled,
}: {
  question: IntakeQuestion;
  value: any;
  onChange: (v: any) => void;
  brandColor: string;
  disabled?: boolean;
}) {
  const label = (
    <label className="text-xs font-semibold">
      {question.question_text}
      {question.required && <span style={{ color: brandColor }}> *</span>}
    </label>
  );
  const help = question.help_text && (
    <div className="text-[10px] text-muted-foreground mt-0.5">{question.help_text}</div>
  );

  switch (question.response_type) {
    case 'short_text':
      return (
        <div className="space-y-1">{label}{help}
          <input value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}
            className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none disabled:opacity-50"
            style={{ borderColor: value ? `${brandColor}55` : undefined }} />
        </div>
      );
    case 'long_text':
      return (
        <div className="space-y-1">{label}{help}
          <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} rows={4} disabled={disabled}
            className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none resize-y disabled:opacity-50" />
        </div>
      );
    case 'number':
      return (
        <div className="space-y-1">{label}{help}
          <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}
            className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none disabled:opacity-50" />
        </div>
      );
    case 'date':
      return (
        <div className="space-y-1">{label}{help}
          <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}
            className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none disabled:opacity-50" />
        </div>
      );
    case 'single_choice':
      return (
        <div className="space-y-1">{label}{help}
          <div className="space-y-1">
            {(question.options || []).map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" checked={value === opt} onChange={() => onChange(opt)} disabled={disabled}
                  style={{ accentColor: brandColor }} />
                {opt}
              </label>
            ))}
          </div>
        </div>
      );
    case 'multi_choice': {
      const arr: string[] = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1">{label}{help}
          <div className="space-y-1">
            {(question.options || []).map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={arr.includes(opt)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...arr, opt] : arr.filter((x) => x !== opt);
                    onChange(next);
                  }}
                  disabled={disabled}
                  style={{ accentColor: brandColor }} />
                {opt}
              </label>
            ))}
          </div>
        </div>
      );
    }
    default: return null;
  }
}
