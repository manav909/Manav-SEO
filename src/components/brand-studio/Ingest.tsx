/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/Ingest.tsx
   The Ingest sub-tab — H.1 multi-format document ingestion.

   Two ingest paths:
     1. File upload (PDF, DOCX, XLSX, CSV, TXT, HTML, MD, JSON)
     2. URL paste (fetched server-side, treated as a document)

   Three-step flow per document:
     STEP 1 — Tag: PM picks stakeholder role + (optional) audience + provided-by
     STEP 2 — Parse: file uploads → backend → parsed text + auto-detected doc type
     STEP 3 — Extract: PM confirms doc type + runs extraction; AI writes Data
              Room fields with full provenance.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import {
  Upload, Link2, FileText, Sparkles, AlertTriangle, CheckCircle2,
  Loader2, X, ChevronRight,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  getDocTypes, ingestFile, ingestUrl, ingestExtract,
  type DocTypeOption, type DocTypeDetection, type ExtractResult,
} from './api';
import type { BrandStudioCatalogs } from './types';

interface Props {
  projectId: string;
  catalogs:  BrandStudioCatalogs | null;
  onIngested?: () => void;       /* parent refresh (e.g. Library) */
}

type Stage =
  | 'idle'                       /* picking a file or URL */
  | 'reading_file'
  | 'uploading'
  | 'parsed'                     /* waiting for PM to confirm doc type */
  | 'extracting'
  | 'done'
  | 'error';

interface PendingIngest {
  documentId:        string;
  documentName:      string;
  detection:         DocTypeDetection;
  preview:           string;
  pdfBase64?:        string;     /* held in memory if PDF — passed to extract step */
}

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx,.xls,.csv,.txt,.html,.htm,.md,.json';

export default function Ingest({ projectId, catalogs, onIngested }: Props) {
  /* ── State ── */
  const [docTypes, setDocTypes] = useState<DocTypeOption[]>([]);

  /* Pre-upload tagging */
  const [stakeholderRole, setStakeholderRole] = useState('');
  const [providedBy,      setProvidedBy]      = useState('');
  const [audienceRole,    setAudienceRole]    = useState('');

  /* URL mode */
  const [urlInput, setUrlInput] = useState('');

  /* Flow state */
  const [stage,   setStage]   = useState<Stage>('idle');
  const [error,   setError]   = useState('');
  const [pending, setPending] = useState<PendingIngest | null>(null);
  const [docTypeOverride, setDocTypeOverride] = useState('');
  const [extractResult,   setExtractResult]   = useState<ExtractResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── load doc type catalog once ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { doc_types } = await getDocTypes();
      if (!cancelled) setDocTypes(doc_types);
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── readers ── */

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => {
        const result = reader.result as string;
        const i = result.indexOf(',');
        resolve(i >= 0 ? result.slice(i + 1) : result);
      };
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });

  const fileToText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsText(file);
    });

  /* ── handle file upload ── */
  const handleFile = async (file: File) => {
    if (!stakeholderRole) {
      toast({ title: 'Pick a stakeholder first', description: 'Who provided this document? Required.', variant: 'destructive' });
      return;
    }
    setError('');
    setExtractResult(null);
    setPending(null);
    setStage('reading_file');

    const ext = file.name.toLowerCase().split('.').pop() || '';
    const mt  = file.type || '';
    const useBase64 = ['pdf', 'docx', 'xlsx', 'xls'].includes(ext) || mt.includes('pdf') || mt.includes('wordprocessingml') || mt.includes('spreadsheetml');

    try {
      let base64: string | undefined;
      let text:   string | undefined;
      if (useBase64) {
        base64 = await fileToBase64(file);
      } else {
        /* Read as text directly; backend still accepts base64 for these but text is faster */
        text = await fileToText(file);
      }

      setStage('uploading');
      const r = await ingestFile({
        projectId,
        fileName: file.name,
        mimeType: mt,
        base64,
        text,
        stakeholderRole,
        providedBy: providedBy || undefined,
        audienceRole: audienceRole || undefined,
      });
      if (r.error || !r.document_id) {
        setError(r.error || 'Upload failed');
        setStage('error');
        return;
      }
      setPending({
        documentId:   r.document_id,
        documentName: r.document?.name || file.name,
        detection:    r.detection || { detected: 'other', confidence: 'low', reason: '' },
        preview:      r.parsed_text_preview || '',
        pdfBase64:    r.pdf_in_memory ? base64 : undefined,
      });
      setDocTypeOverride(r.detection?.detected || 'other');
      setStage('parsed');
    } catch (e: any) {
      setError(e?.message || 'Read failed');
      setStage('error');
    }
  };

  /* ── handle URL ingest ── */
  const handleUrl = async () => {
    if (!urlInput.trim()) return;
    if (!stakeholderRole) {
      toast({ title: 'Pick a stakeholder first', description: 'Who provided this URL? Required.', variant: 'destructive' });
      return;
    }
    setError('');
    setExtractResult(null);
    setPending(null);
    setStage('uploading');

    const r = await ingestUrl({
      projectId,
      url: urlInput.trim(),
      stakeholderRole,
      providedBy: providedBy || undefined,
      audienceRole: audienceRole || undefined,
    });
    if (r.error || !r.document_id) {
      setError(r.error || 'URL ingest failed');
      setStage('error');
      return;
    }
    setPending({
      documentId:   r.document_id,
      documentName: r.document?.name || urlInput.trim(),
      detection:    r.detection || { detected: 'other', confidence: 'low', reason: '' },
      preview:      r.parsed_text_preview || '',
    });
    setDocTypeOverride(r.detection?.detected || 'other');
    setStage('parsed');
  };

  /* ── trigger extraction ── */
  const runExtract = async () => {
    if (!pending) return;
    setStage('extracting');
    const result = await ingestExtract({
      documentId: pending.documentId,
      docTypeOverride,
      pdfBase64: pending.pdfBase64,
    });
    if (result.error) {
      setError(result.error);
      setStage('error');
      return;
    }
    setExtractResult(result);
    setStage('done');
    if (onIngested) onIngested();
    toast({
      title: 'Document ingested',
      description: `${result.fields_written || 0} field${(result.fields_written || 0) === 1 ? '' : 's'} written${(result.fields_skipped || 0) > 0 ? ` · ${result.fields_skipped} skipped (manual override)` : ''}`,
    });
  };

  const reset = () => {
    setStage('idle');
    setPending(null);
    setExtractResult(null);
    setError('');
    setUrlInput('');
    setDocTypeOverride('');
  };

  /* ── render ── */

  return (
    <div className="space-y-5">
      {/* Stakeholder tagging — required before any ingest */}
      <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-3">
        <div>
          <div className="text-sm font-bold text-foreground">Who is providing this document?</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Required. Every ingested document is tagged with its source stakeholder for context and routing.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Stakeholder role *</label>
            <select
              value={stakeholderRole}
              onChange={(e) => setStakeholderRole(e.target.value)}
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400"
            >
              <option value="">— Pick a role —</option>
              {catalogs?.stakeholder_roles.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Provided by</label>
            <input
              value={providedBy}
              onChange={(e) => setProvidedBy(e.target.value)}
              placeholder="Name or title — optional"
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Audience role</label>
            <select
              value={audienceRole}
              onChange={(e) => setAudienceRole(e.target.value)}
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400"
            >
              <option value="">— Optional —</option>
              {catalogs?.audience_roles.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Upload + URL inputs, side-by-side */}
      {stage === 'idle' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* File upload */}
          <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/3 p-6 text-center">
            <Upload className="h-9 w-9 text-primary/40 mx-auto mb-3" />
            <div className="text-sm font-semibold mb-1">Upload a file</div>
            <div className="text-xs text-muted-foreground mb-3">
              PDF, DOCX, XLSX, CSV, TXT, HTML, Markdown, JSON
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!stakeholderRole}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Choose file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
              className="hidden"
            />
            <div className="text-[10px] text-muted-foreground/70 mt-3">
              PDFs are sent natively to Claude (best for visual docs). DOCX/XLSX are parsed server-side. Text files are read directly.
            </div>
          </div>

          {/* URL ingest */}
          <div className="rounded-2xl border-2 border-dashed border-cyan-400/30 bg-cyan-400/3 p-6">
            <Link2 className="h-9 w-9 text-cyan-400/40 mx-auto mb-3" />
            <div className="text-sm font-semibold mb-1 text-center">Paste a URL</div>
            <div className="text-xs text-muted-foreground mb-3 text-center">
              Public Google Doc, Notion page, press release, blog post, About page
            </div>
            <div className="flex items-center gap-2">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://…"
                className="flex-1 h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-cyan-400"
                onKeyDown={(e) => { if (e.key === 'Enter') handleUrl(); }}
              />
              <button
                onClick={handleUrl}
                disabled={!stakeholderRole || !urlInput.trim()}
                className="px-4 py-2 rounded-xl bg-cyan-500 text-white font-semibold text-sm hover:bg-cyan-500/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Fetch
              </button>
            </div>
            <div className="text-[10px] text-muted-foreground/70 mt-3 text-center">
              We fetch + clean the page server-side. Public URLs only — no auth-walled pages.
            </div>
          </div>
        </div>
      )}

      {/* Reading / uploading state */}
      {(stage === 'reading_file' || stage === 'uploading') && (
        <StageCard icon={<Loader2 className="h-5 w-5 animate-spin text-primary" />}
          title={stage === 'reading_file' ? 'Reading file…' : 'Uploading and parsing…'}
          description={stage === 'reading_file' ? 'Encoding file for upload.' : 'Backend is parsing content and detecting doc type.'} />
      )}

      {/* Parsed — waiting for PM to confirm doc type */}
      {stage === 'parsed' && pending && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-purple-500/30 bg-purple-500/[0.04] p-5 space-y-4">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-foreground">{pending.documentName}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Parsed successfully. Confirm doc type, then extract.</div>
              </div>
              <button onClick={reset} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Detection */}
            <div className="rounded-xl border border-border bg-background/40 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-3 w-3 text-purple-400" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Auto-detected
                </span>
                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
                  pending.detection.confidence === 'high' ? 'bg-green-500/15 text-green-400' :
                  pending.detection.confidence === 'medium' ? 'bg-amber-500/15 text-amber-400' :
                  'bg-orange-500/15 text-orange-400'
                }`}>
                  {pending.detection.confidence}
                </span>
              </div>
              <div className="text-xs text-foreground/90">{docTypes.find((d) => d.key === pending.detection.detected)?.label || pending.detection.detected}</div>
              {pending.detection.reason && <div className="text-[10px] text-muted-foreground italic mt-0.5">{pending.detection.reason}</div>}
            </div>

            {/* Doc type override */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Confirm or override doc type</label>
              <select
                value={docTypeOverride}
                onChange={(e) => setDocTypeOverride(e.target.value)}
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400"
              >
                {docTypes.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              {(() => {
                const dt = docTypes.find((d) => d.key === docTypeOverride);
                if (!dt) return null;
                return (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {dt.description}
                    {dt.target_categories.length > 0 && (
                      <span className="ml-1">
                        — Will write to: <span className="font-mono text-foreground/80">{dt.target_categories.join(', ')}</span>
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Preview */}
            {pending.preview && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Preview parsed content</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-border bg-background/40 p-2 text-[10px] text-foreground/80 whitespace-pre-wrap">{pending.preview}{pending.preview.length >= 2000 ? '\n\n…(truncated)…' : ''}</pre>
              </details>
            )}

            {/* Extract action */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={reset} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                onClick={runExtract}
                className="px-4 py-1.5 rounded-xl bg-purple-500 text-white font-semibold text-sm hover:bg-purple-500/90 flex items-center gap-1.5"
              >
                <Sparkles className="h-3 w-3" />
                Extract Data Room fields
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extracting */}
      {stage === 'extracting' && (
        <StageCard icon={<Loader2 className="h-5 w-5 animate-spin text-purple-400" />}
          title="Extracting…"
          description="AI is reading the document and extracting Data Room fields with provenance. This usually takes 15-30 seconds." />
      )}

      {/* Done */}
      {stage === 'done' && extractResult && (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/[0.04] p-5 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-foreground">Ingestion complete</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {extractResult.fields_written ?? 0} field{(extractResult.fields_written ?? 0) === 1 ? '' : 's'} written to the Data Room
                {(extractResult.fields_skipped ?? 0) > 0 && ` · ${extractResult.fields_skipped} skipped (manual or auto-synced value already exists)`}
                {extractResult.data_quality && ` · ${extractResult.data_quality} data quality`}
              </div>
            </div>
            <button onClick={reset} className="text-xs px-3 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground">
              Ingest another
            </button>
          </div>

          {extractResult.summary && (
            <div className="text-xs text-foreground/90 italic border-l-2 border-green-500/40 pl-3">
              {extractResult.summary}
            </div>
          )}

          {extractResult.key_findings && extractResult.key_findings.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Key findings</div>
              <ul className="space-y-1">
                {extractResult.key_findings.map((f, i) => (
                  <li key={i} className="text-xs text-foreground/90 flex items-start gap-1.5">
                    <span className="text-green-400 mt-0.5">→</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {extractResult.open_questions && extractResult.open_questions.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Open questions</div>
              <ul className="space-y-1">
                {extractResult.open_questions.map((q, i) => (
                  <li key={i} className="text-xs text-foreground/90 flex items-start gap-1.5">
                    <span className="text-amber-400 mt-0.5">?</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {extractResult.write_details && extractResult.write_details.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-semibold">
                Field write details ({extractResult.write_details.length})
              </summary>
              <div className="mt-2 space-y-1.5">
                {extractResult.write_details.map((d, i) => (
                  <div key={i} className={`rounded-lg border p-2 ${
                    d.action === 'written' ? 'border-green-500/20 bg-green-500/[0.03]' :
                    d.action === 'skipped_existing' ? 'border-muted-foreground/20 bg-card/40 opacity-60' :
                    'border-red-500/20 bg-red-500/[0.03]'
                  }`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-foreground/80">{d.category}.{d.field_key}</span>
                      <span className={`text-[9px] uppercase tracking-wider px-1 py-0.5 rounded font-bold ${
                        d.confidence === 'high' ? 'bg-green-500/15 text-green-400' :
                        d.confidence === 'medium' ? 'bg-amber-500/15 text-amber-400' :
                        'bg-orange-500/15 text-orange-400'
                      }`}>{d.confidence}</span>
                      {d.action === 'skipped_existing' && (
                        <span className="text-[9px] text-muted-foreground">skipped — existing {d.existing_source}</span>
                      )}
                    </div>
                    <div className="text-xs text-foreground mt-1">{d.value}</div>
                    {d.evidence && <div className="text-[10px] italic text-muted-foreground mt-0.5">{d.evidence}</div>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Error */}
      {stage === 'error' && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-foreground">Ingestion failed</div>
              <div className="text-xs text-muted-foreground mt-0.5">{error || 'Unknown error'}</div>
            </div>
            <button onClick={reset} className="text-xs px-3 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground">
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StageCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-8 text-center">
      <div className="flex justify-center mb-3">{icon}</div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{description}</div>
    </div>
  );
}
