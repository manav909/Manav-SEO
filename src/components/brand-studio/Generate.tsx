/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/Generate.tsx
   The Generate sub-tab — H.2 document generation.

   Flow:
   1. Template picker — pick which type of document to generate
   2. Configuration — audience role + PM vision text
   3. Readiness check — does the project have enough context?
   4. Generate (calls AI) — preview returned for review
   5. Edit + Save (apply) — committed as a new project_documents row
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState, useMemo } from 'react';
import {
  Sparkles, Loader2, AlertTriangle, CheckCircle2, FileText, X, Save,
  Edit3, ChevronDown, ChevronRight, ShieldCheck,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  getTemplates, checkReadiness, generatePreview, generateApply,
  type PublicTemplate, type GenerationPreview, type ReadinessReport,
  type GeneratedSection, type TemplateCategory,
} from './api';
import type { BrandStudioCatalogs } from './types';

interface Props {
  projectId: string;
  catalogs:  BrandStudioCatalogs | null;
  onSaved?: () => void;
}

type Stage = 'pick' | 'configure' | 'generating' | 'preview' | 'saving' | 'done';

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  strategic:        'Strategic',
  performance:      'Performance',
  competitive:      'Competitive',
  forward_looking:  'Forward-looking',
};

const CATEGORY_TONE: Record<TemplateCategory, string> = {
  strategic:        'bg-purple-500/10 text-purple-400 border-purple-500/30',
  performance:      'bg-green-500/10  text-green-400  border-green-500/30',
  competitive:      'bg-orange-500/10 text-orange-400 border-orange-500/30',
  forward_looking:  'bg-cyan-500/10   text-cyan-400   border-cyan-500/30',
};

export default function Generate({ projectId, catalogs, onSaved }: Props) {
  /* ── state ── */
  const [templates,  setTemplates]  = useState<PublicTemplate[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(true);

  const [stage,      setStage]      = useState<Stage>('pick');
  const [selected,   setSelected]   = useState<PublicTemplate | null>(null);

  const [audienceRole, setAudienceRole] = useState('');
  const [pmVision,     setPmVision]     = useState('');

  const [readiness,    setReadiness]    = useState<ReadinessReport | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);

  const [preview,    setPreview]      = useState<GenerationPreview | null>(null);
  const [editedSections, setEditedSections] = useState<GeneratedSection[]>([]);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [error,      setError]        = useState('');

  /* ── load templates once ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { templates } = await getTemplates();
      if (cancelled) return;
      setTemplates(templates);
      setLoadingTpl(false);
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── on template select: prefill audience, check readiness ── */
  useEffect(() => {
    if (!selected || !projectId) return;
    setAudienceRole(selected.default_audience_role);
    setReadiness(null);
    setCheckingReadiness(true);
    (async () => {
      const r = await checkReadiness({ projectId, templateId: selected.id });
      setReadiness(r.readiness || null);
      setCheckingReadiness(false);
    })();
  }, [selected, projectId]);

  /* ── group templates by category for the picker grid ── */
  const grouped = useMemo(() => {
    const out: Record<string, PublicTemplate[]> = {};
    for (const t of templates) (out[t.category] ||= []).push(t);
    return out;
  }, [templates]);

  /* ── handlers ── */

  const startGenerate = async () => {
    if (!selected || !readiness?.ready) return;
    setError('');
    setStage('generating');
    const { preview: p, error: e } = await generatePreview({
      projectId, templateId: selected.id,
      audienceRole: audienceRole || selected.default_audience_role,
      pmVision: pmVision || undefined,
    });
    if (e || !p) {
      setError(e || 'Generation failed');
      setStage('configure');
      return;
    }
    setPreview(p);
    setEditedSections(p.sections);
    setOpenSection(p.sections[0]?.key || null);
    setStage('preview');
  };

  const updateSection = (key: string, patch: Partial<GeneratedSection>) => {
    setEditedSections((prev) => prev.map((s) => s.key === key ? { ...s, ...patch } : s));
  };

  const savePreview = async () => {
    if (!preview || !selected) return;
    setStage('saving');
    const { documentId, version, error: e } = await generateApply({
      projectId,
      templateId:   selected.id,
      audienceRole: preview.audience_role,
      pmVision:     preview.pm_vision || undefined,
      sections:     editedSections,
      overallSummary:    preview.overall_summary,
      overallConfidence: preview.overall_confidence,
      openQuestions:     preview.open_questions,
    });
    if (e || !documentId) {
      setError(e || 'Save failed');
      setStage('preview');
      return;
    }
    setStage('done');
    toast({
      title: 'Document saved as draft',
      description: `${selected.label}${version && version > 1 ? ` (v${version})` : ''} added to the Library. Publish from Library when ready to share with the client.`,
    });
    if (onSaved) onSaved();
  };

  const reset = () => {
    setSelected(null);
    setReadiness(null);
    setPreview(null);
    setEditedSections([]);
    setOpenSection(null);
    setError('');
    setAudienceRole('');
    setPmVision('');
    setStage('pick');
  };

  /* ── render ── */

  if (loadingTpl) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground mb-2" />
        <div className="text-xs text-muted-foreground">Loading template library…</div>
      </div>
    );
  }

  /* ── Stage: template picker ── */
  if (stage === 'pick') {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card/40 p-5">
          <div className="text-sm font-bold">Template library</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Each template generates a specific kind of document from your Data Room + ingested documents. Every generation requires source citation — nothing is fabricated, every claim is traceable.
          </div>
        </div>

        {(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((cat) => {
          const items = grouped[cat] || [];
          if (!items.length) return null;
          return (
            <div key={cat}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">{CATEGORY_LABELS[cat]}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setSelected(t); setStage('configure'); }}
                    className={`text-left rounded-xl border p-4 hover:bg-card/80 transition-colors ${CATEGORY_TONE[cat]}`}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-foreground">{t.label}</span>
                          {t.verification_strictness === 'investor_grade' && (
                            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-foreground/10 text-foreground/90 font-bold flex items-center gap-0.5">
                              <ShieldCheck className="h-2.5 w-2.5" />
                              Investor-grade
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          {t.description}
                        </div>
                        <div className="text-[10px] text-muted-foreground/80 mt-2">
                          {t.section_count} sections · default audience: <span className="font-mono">{t.default_audience_role}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ── Stage: configure ── */
  if (stage === 'configure' && selected) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-purple-500/30 bg-purple-500/[0.04] p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold">{selected.label}</span>
                {selected.verification_strictness === 'investor_grade' && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-foreground/10 font-bold flex items-center gap-0.5">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    Investor-grade
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{selected.description}</div>
            </div>
            <button onClick={reset} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Readiness panel */}
        {checkingReadiness && (
          <div className="rounded-xl border border-border bg-card/40 p-4 text-center">
            <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
            <div className="text-xs text-muted-foreground mt-1">Checking project readiness…</div>
          </div>
        )}
        {!checkingReadiness && readiness && (
          <div className={`rounded-xl border p-4 ${
            readiness.ready ? 'border-green-500/30 bg-green-500/[0.04]' : 'border-red-500/30 bg-red-500/[0.04]'
          }`}>
            <div className="flex items-start gap-2">
              {readiness.ready
                ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                : <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {readiness.ready ? 'Project ready' : 'Project not ready for this template'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {readiness.ready
                    ? `${readiness.populated_field_count} populated Data Room fields · ${readiness.document_count} relevant documents`
                    : `Missing required categories: ${readiness.missing_categories.join(', ')}. Populate at least one field in each category from the Data Room, then come back.`}
                </div>
                {readiness.warning && (
                  <div className="text-xs text-amber-400 mt-1.5 italic">⚠ {readiness.warning}</div>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Required categories</div>
                <div className="flex flex-wrap gap-1">
                  {selected.required_categories.map((c) => {
                    const ok = readiness.populated_categories.includes(c);
                    return (
                      <span key={c} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        ok ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                      }`}>
                        {ok ? '✓' : '✗'} {c}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Optional (nice-to-have)</div>
                <div className="flex flex-wrap gap-1">
                  {selected.optional_categories.map((c) => {
                    const ok = readiness.populated_categories.includes(c);
                    return (
                      <span key={c} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        ok ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground'
                      }`}>
                        {ok ? '✓' : '○'} {c}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Configuration */}
        <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-3">
          <div className="text-sm font-bold">Configuration</div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Audience</label>
            <select
              value={audienceRole}
              onChange={(e) => setAudienceRole(e.target.value)}
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400"
            >
              {catalogs?.audience_roles.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <div className="text-[10px] text-muted-foreground">
              The AI calibrates voice, depth, and emphasis to this audience. Default for this template: <span className="font-mono">{selected.default_audience_role}</span>.
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Your vision for this generation (optional)</label>
            <textarea
              value={pmVision}
              onChange={(e) => setPmVision(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder='e.g. "Lead with the recent migration recovery — we want this doc to highlight resilience. Soft-pedal the lost-traffic narrative. Investor audience reads this on Monday."'
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400 resize-y"
            />
            <div className="text-[10px] text-muted-foreground">
              Tell the AI what to emphasize, what to downplay, what tone to lean into. This goes into the generation prompt verbatim.
            </div>
          </div>
        </div>

        {/* Section outline preview */}
        <details className="rounded-xl border border-border bg-card/40 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
            What sections will be generated ({selected.section_count})
          </summary>
          <div className="mt-2 space-y-2">
            {selected.section_outline.map((s) => (
              <div key={s.key} className="border-l-2 border-purple-500/30 pl-3">
                <div className="text-xs font-semibold text-foreground">{s.title}</div>
                <div className="text-[10px] text-muted-foreground italic">{s.description}</div>
              </div>
            ))}
          </div>
        </details>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button onClick={reset} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={startGenerate}
            disabled={!readiness?.ready}
            className="px-4 py-2 rounded-xl bg-purple-500 text-white font-semibold text-sm hover:bg-purple-500/90 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Sparkles className="h-3 w-3" />
            Generate
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/[0.04] p-3 text-xs text-red-400">
            {error}
          </div>
        )}
      </div>
    );
  }

  /* ── Stage: generating ── */
  if (stage === 'generating') {
    return (
      <div className="rounded-2xl border border-purple-500/30 bg-purple-500/[0.04] p-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-purple-400 mb-3" />
        <div className="text-sm font-bold">Generating {selected?.label}…</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          AI is reading your Data Room, ingested documents, and brand assets. Drafting {selected?.section_count} sections with source citation. This usually takes 30-60 seconds.
        </div>
      </div>
    );
  }

  /* ── Stage: preview (review + edit + save) ── */
  if ((stage === 'preview' || stage === 'saving' || stage === 'done') && preview) {
    return (
      <div className="space-y-4">
        {/* Preview header */}
        <div className="rounded-2xl border border-purple-500/30 bg-purple-500/[0.04] p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold">{preview.template_label}</span>
                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
                  preview.overall_confidence === 'high' ? 'bg-green-500/15 text-green-400' :
                  preview.overall_confidence === 'medium' ? 'bg-amber-500/15 text-amber-400' :
                  'bg-orange-500/15 text-orange-400'
                }`}>
                  {preview.overall_confidence} confidence
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1 italic">{preview.overall_summary}</div>
              <div className="text-[10px] text-muted-foreground mt-1">
                For audience: <span className="font-mono">{preview.audience_role}</span>
              </div>
            </div>
            {stage !== 'done' && (
              <button onClick={reset} className="text-muted-foreground hover:text-foreground" disabled={stage === 'saving'}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Sections — editable */}
        <div className="space-y-2">
          {editedSections.map((s) => (
            <SectionEditor
              key={s.key}
              section={s}
              open={openSection === s.key}
              onToggle={() => setOpenSection(openSection === s.key ? null : s.key)}
              onUpdate={(patch) => updateSection(s.key, patch)}
              readOnly={stage !== 'preview'}
            />
          ))}
        </div>

        {/* Open questions */}
        {preview.open_questions.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3">
            <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1.5">
              Open questions the writer flagged
            </div>
            <ul className="space-y-1">
              {preview.open_questions.map((q, i) => (
                <li key={i} className="text-xs text-foreground/90 flex items-start gap-1.5">
                  <span className="text-amber-400 mt-0.5">?</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action bar */}
        {stage === 'preview' && (
          <div className="sticky bottom-4 flex items-center justify-end gap-2 bg-background/60 backdrop-blur rounded-2xl border border-border p-3">
            <span className="text-[11px] text-muted-foreground mr-auto">
              Saves as draft — won't be visible to client until you publish from Library.
            </span>
            <button onClick={reset} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">
              Discard
            </button>
            <button
              onClick={savePreview}
              className="px-4 py-2 rounded-xl bg-purple-500 text-white font-semibold text-sm hover:bg-purple-500/90 flex items-center gap-1.5"
            >
              <Save className="h-3 w-3" />
              Save to Library
            </button>
          </div>
        )}

        {stage === 'saving' && (
          <div className="text-center py-4">
            <Loader2 className="h-4 w-4 animate-spin mx-auto text-purple-400" />
            <div className="text-xs text-muted-foreground mt-1">Saving…</div>
          </div>
        )}

        {stage === 'done' && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/[0.04] p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <span className="text-sm font-semibold">Saved as draft in Library</span>
            </div>
            <button onClick={reset} className="text-xs px-3 py-1.5 rounded-lg bg-purple-500 text-white font-semibold hover:bg-purple-500/90">
              Generate another
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/[0.04] p-3 text-xs text-red-400">
            {error}
          </div>
        )}
      </div>
    );
  }

  return null;
}

/* ─── Per-section editor ─────────────────────────────────────── */

function SectionEditor({
  section, open, onToggle, onUpdate, readOnly,
}: {
  section: GeneratedSection;
  open:    boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<GeneratedSection>) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const confTone =
    section.confidence === 'high'   ? 'bg-green-500/15 text-green-400' :
    section.confidence === 'medium' ? 'bg-amber-500/15 text-amber-400' :
                                       'bg-orange-500/15 text-orange-400';

  return (
    <div className={`rounded-xl border ${section.flagged === 'uncited_strict' ? 'border-amber-500/30 bg-amber-500/[0.02]' : 'border-border bg-card/60'}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-card/80"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="text-sm font-semibold text-foreground">{section.title}</span>
        <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${confTone}`}>
          {section.confidence}
        </span>
        {section.flagged === 'uncited_strict' && (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">
            Uncited
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {section.sources_cited.length} source{section.sources_cited.length === 1 ? '' : 's'}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border">
          {/* Content view / edit */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Content</div>
              {!readOnly && (
                <button
                  onClick={() => setEditing(!editing)}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Edit3 className="h-2.5 w-2.5" />
                  {editing ? 'Done' : 'Edit'}
                </button>
              )}
            </div>
            {editing ? (
              <textarea
                value={section.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
                rows={12}
                className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400 font-mono resize-y"
              />
            ) : (
              <div className="rounded-xl border border-border bg-background/40 p-3 text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {section.content}
              </div>
            )}
          </div>

          {/* Sources */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Sources cited</div>
            {section.sources_cited.length === 0 ? (
              <div className="text-[11px] text-amber-400 italic">No sources cited — verify before publishing</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {section.sources_cited.map((src, i) => {
                  const isAssumption = src.toLowerCase().startsWith('assumption');
                  const isDataroom = src.startsWith('dataroom:');
                  const isDoc = src.startsWith('doc:');
                  const isBrand = src.startsWith('brand:');
                  return (
                    <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      isAssumption ? 'bg-amber-500/15 text-amber-400' :
                      isDataroom ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      isDoc ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                      isBrand ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' :
                      'bg-muted text-muted-foreground'
                    }`}>{src}</span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Confidence override */}
          {!readOnly && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Adjust confidence</div>
              <div className="flex items-center gap-1">
                {(['high', 'medium', 'low'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => onUpdate({ confidence: c })}
                    className={`text-[10px] px-2 py-1 rounded-lg font-bold ${
                      section.confidence === c
                        ? (c === 'high' ? 'bg-green-500/20 text-green-400' :
                           c === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                           'bg-orange-500/20 text-orange-400')
                        : 'border border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
