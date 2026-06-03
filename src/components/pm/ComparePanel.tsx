/* ════════════════════════════════════════════════════════════════
   src/components/pm/ComparePanel.tsx

   PM "Compare" tab. Operator picks two source documents from a
   unified list (saved reports + uploaded attachments + workspace
   step reports), or drops in an ad-hoc file for either side, adds
   optional context, and runs the comparison. Result is rendered
   in-page (markdown), saved as a workspace artifact, and downloadable
   as a Word doc (via the existing /api/export-md-as-docx path).
════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, FileText, Upload, ArrowRight, Search, Download, X, Sparkles, AlertCircle, Users, FileDown, ExternalLink } from 'lucide-react';
import {
  compareListDocs, compareRun, compareLenses, fileToAdHocRef,
  type CompareItem, type CompareSourceRef, type CompareLens, type CompareSelectedLens,
} from '@/components/pm/api';
import { downloadStakeholderReport, downloadStakeholderAsWord, openStakeholderReport, mdToHtml } from '@/lib/reportExport';
import { useToast } from '@/hooks/use-toast';

type SideState =
  | { mode: 'pick'; picked: CompareItem | null }
  | { mode: 'upload'; file: File | null };

function isComplete(s: SideState): boolean {
  return s.mode === 'pick' ? !!s.picked : !!s.file;
}

function describe(s: SideState): string {
  if (s.mode === 'pick' && s.picked) return s.picked.label;
  if (s.mode === 'upload' && s.file) return s.file.name + ' (just uploaded)';
  return '— not selected —';
}

interface Props { projectId: string }

export default function ComparePanel({ projectId }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<CompareItem[]>([]);
  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [context, setContext] = useState('');

  // Lens picker state (Build 11.1)
  const [lensCatalog, setLensCatalog] = useState<CompareLens[]>([]);
  const [pickedLensIds, setPickedLensIds] = useState<Set<string>>(new Set());
  const [customLens, setCustomLens] = useState('');
  const totalLensesPicked = pickedLensIds.size + (customLens.trim().length >= 5 ? 1 : 0);

  const [sideA, setSideA] = useState<SideState>({ mode: 'pick', picked: null });
  const [sideB, setSideB] = useState<SideState>({ mode: 'pick', picked: null });

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ title?: string; body_md?: string; comparison_id?: string } | null>(null);
  const [error, setError] = useState('');

  const loadList = useCallback(async () => {
    if (!projectId) return;
    setLoadingList(true);
    try {
      const r = await compareListDocs(projectId);
      if (r.success && Array.isArray(r.items)) setItems(r.items);
    } finally { setLoadingList(false); }
  }, [projectId]);

  // Lens catalog loads once and is reused across projects.
  useEffect(() => {
    compareLenses().then(r => { if (r.success && Array.isArray(r.lenses)) setLensCatalog(r.lenses); });
  }, []);

  // Reset everything when project changes (including lens selection so
  // the previous project's reader framing does not leak into the next).
  useEffect(() => {
    setItems([]); setSideA({ mode: 'pick', picked: null }); setSideB({ mode: 'pick', picked: null });
    setResult(null); setError(''); setContext('');
    setPickedLensIds(new Set()); setCustomLens('');
    loadList();
  }, [projectId, loadList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      it.label.toLowerCase().includes(q) ||
      it.sublabel.toLowerCase().includes(q) ||
      it.kind.toLowerCase().includes(q)
    );
  }, [items, search]);

  const refToSource = (s: SideState): CompareSourceRef | null => {
    if (s.mode === 'pick' && s.picked) {
      const k = s.picked.kind;
      if (k === 'attachment') return { kind: 'attachment', attachment_id: s.picked.id };
      if (k === 'step_report') return { kind: 'step_report', step_report_id: s.picked.id };
      return { kind: k as 'client_report' | 'workspace_report', report_id: s.picked.id };
    }
    return null;
  };

  const runCompare = async () => {
    setError('');
    if (!isComplete(sideA) || !isComplete(sideB)) { setError('Pick both documents before comparing.'); return; }
    setRunning(true);
    setResult(null);
    try {
      const docA: CompareSourceRef = sideA.mode === 'upload' && sideA.file
        ? await fileToAdHocRef(sideA.file)
        : refToSource(sideA)!;
      const docB: CompareSourceRef = sideB.mode === 'upload' && sideB.file
        ? await fileToAdHocRef(sideB.file)
        : refToSource(sideB)!;

      // Assemble lenses payload: preset ids + optional custom free-text.
      const lenses: CompareSelectedLens[] = [];
      pickedLensIds.forEach(id => lenses.push({ kind: 'preset', id }));
      const customTrimmed = customLens.trim();
      if (customTrimmed.length >= 5) lenses.push({ kind: 'custom', description: customTrimmed });
      if (lenses.length > 5) {
        setError('At most 5 lenses can be selected at once. Trim the selection and re-run.');
        setRunning(false);
        return;
      }

      const r = await compareRun({ projectId, docA, docB, context: context.trim() || undefined, lenses: lenses.length ? lenses : undefined });
      if (!r.success) { setError(r.error || 'Comparison failed.'); return; }
      setResult({ title: r.title, body_md: r.body_md, comparison_id: r.comparison_id });
      if (r.error) toast({ title: 'Comparison ready', description: r.error });
      else toast({ title: 'Comparison saved', description: r.comparison_id ? 'Available in Documents.' : 'Returned in-memory only.' });
      // Refresh list so the new comparison appears for future picks
      loadList();
    } catch (e: any) {
      setError(e?.message || 'Comparison failed.');
    } finally { setRunning(false); }
  };

  // Export metadata shared by every download/open from this comparison.
  // ComparePanel does not have project name in props; we keep meta minimal
  // but informative — the title carries the doc-vs-doc context already.
  const exportMeta = (): { title: string; kind: string; generatedAt: string } => ({
    title: result?.title || 'Comparison',
    kind: 'Document Comparison',
    generatedAt: new Date().toISOString(),
  });

  const downloadAsWord = () => {
    if (!result?.body_md) return;
    downloadStakeholderAsWord(result.body_md, exportMeta());
    toast({ title: 'Word document downloaded', description: 'Open with Microsoft Word, Pages, or Google Docs.' });
  };

  const downloadAsHtml = () => {
    if (!result?.body_md) return;
    downloadStakeholderReport(result.body_md, exportMeta());
    toast({ title: 'HTML document downloaded' });
  };

  const openAsPdfPrintable = () => {
    if (!result?.body_md) return;
    openStakeholderReport(result.body_md, exportMeta());
    // The browser opens the formatted HTML in a new tab; operator uses
    // File → Print → Save as PDF (Cmd-P / Ctrl-P) for a polished PDF.
    toast({ title: 'Opened in new tab', description: 'Use File → Print → Save as PDF for a polished PDF.' });
  };

  const copyToClipboard = async () => {
    if (!result?.body_md) return;
    try { await navigator.clipboard.writeText(result.body_md); toast({ title: 'Copied to clipboard' }); }
    catch { toast({ title: 'Could not copy', description: 'Browser denied clipboard access.', variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Compare two documents</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Pick two documents from this project — saved reports, uploaded attachments, workspace evidence, or drop in a file you have right now — and get a layered comparison: stakeholder action list, semantic summary, key deltas, and a mechanical text diff for receipts. Saved automatically as a workspace artifact and downloadable.
        </p>
      </div>

      {/* Two-side picker */}
      <div className="grid md:grid-cols-2 gap-4">
        <SidePicker label="Document A" side="A" state={sideA} setState={setSideA} items={filtered} loading={loadingList} search={search} setSearch={setSearch} />
        <SidePicker label="Document B" side="B" state={sideB} setState={setSideB} items={filtered} loading={loadingList} search={search} setSearch={setSearch} />
      </div>

      {/* Stakeholder lens picker (Build 11.1) — multi-select checklist
          of preset readers, plus a free-text "custom reader" input. The
          model produces ONE merged action list with each item tagged by
          which lens(es) demanded it. Up to 5 lenses; soft-warn over 3. */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Stakeholder lenses <span className="font-normal text-muted-foreground text-xs">· optional</span></h3>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
          Pick the readers this comparison is for. The action list will be tailored to their concerns and each action tagged with which lens(es) demanded it. Leave empty for a neutral comparison. Up to 5 at once.
        </p>
        {lensCatalog.length === 0 ? (
          <div className="text-xs text-muted-foreground">Loading lenses…</div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-1.5 mb-3">
            {lensCatalog.map(lens => {
              const picked = pickedLensIds.has(lens.id);
              return (
                <button
                  key={lens.id}
                  type="button"
                  onClick={() => {
                    const next = new Set(pickedLensIds);
                    if (picked) next.delete(lens.id);
                    else next.add(lens.id);
                    setPickedLensIds(next);
                  }}
                  className={`text-left text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-2 ${
                    picked
                      ? 'border-primary/50 bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <span className={`inline-block w-3 h-3 rounded border ${picked ? 'border-primary bg-primary/30' : 'border-border'} flex items-center justify-center text-[9px] leading-none`}>
                    {picked ? '✓' : ''}
                  </span>
                  <span className="truncate">{lens.label}</span>
                </button>
              );
            })}
          </div>
        )}
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Custom reader (free-text)</label>
          <input
            value={customLens}
            onChange={e => setCustomLens(e.target.value)}
            placeholder='e.g. "a regulatory compliance officer who needs to verify GDPR claims" — describe a reader not in the preset list'
            className="w-full mt-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/60"
          />
        </div>
        {totalLensesPicked > 0 && (
          <div className={`text-[10px] mt-2 ${totalLensesPicked > 3 ? 'text-amber-400' : 'text-muted-foreground'}`}>
            {totalLensesPicked} lens{totalLensesPicked === 1 ? '' : 'es'} selected
            {totalLensesPicked > 3 && ' — that is a lot of concerns to balance in one comparison; consider running multiple comparisons instead'}
            {totalLensesPicked > 5 && ' (only the first 5 will be used)'}
          </div>
        )}
      </div>

      {/* Optional context */}
      <div className="rounded-xl border border-border bg-card p-4">
        <label className="text-xs font-semibold text-foreground/85 mb-1.5 block">
          Operator context <span className="font-normal text-muted-foreground">· optional</span>
        </label>
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
          What's this comparison for? Who's reading it? What should be emphasised? Example: "Comparing this month's report to last month's for the board meeting. Focus on revenue-impact changes." Leave blank for a neutral comparison.
        </p>
        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          rows={3}
          placeholder="Add context to shape the comparison's tone, emphasis, and audience…"
          className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground resize-y"
        />
      </div>

      {/* Action row */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={runCompare}
          disabled={running || !isComplete(sideA) || !isComplete(sideB)}
          className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {running ? 'Comparing…' : 'Run comparison'}
        </button>
        <div className="text-xs text-muted-foreground">
          {describe(sideA)} <span className="opacity-50 mx-1.5">vs</span> {describe(sideB)}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError('')} className="text-red-400/60 hover:text-red-400">✕</button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-semibold">{result.title || 'Comparison result'}</h3>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={downloadAsWord}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 flex items-center gap-1.5 font-medium"
                title="Download a .doc file that opens cleanly in Microsoft Word, Pages, or Google Docs"
              >
                <FileDown className="h-3 w-3" /> Word
              </button>
              <button
                onClick={openAsPdfPrintable}
                className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1.5"
                title="Open the formatted document in a new tab; use Cmd/Ctrl-P → Save as PDF for a polished PDF"
              >
                <ExternalLink className="h-3 w-3" /> Open as PDF
              </button>
              <button
                onClick={downloadAsHtml}
                className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1.5"
                title="Download as a self-contained HTML file"
              >
                <Download className="h-3 w-3" /> HTML
              </button>
              <button onClick={copyToClipboard} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted">Copy raw</button>
            </div>
          </div>
          {/* Properly rendered preview — markdown converted to HTML.
              The 'compare-preview' classes style headings, tables, lists,
              and blockquotes so the in-app preview reads like the final
              document, not like raw markdown source. */}
          <div
            className="compare-preview prose prose-sm prose-invert max-w-none text-foreground/90"
            dangerouslySetInnerHTML={{ __html: mdToHtml(result.body_md || '') }}
          />
          {result.comparison_id && (
            <div className="mt-3 text-[10px] text-muted-foreground">
              Saved as workspace artifact · id <span className="font-mono">{result.comparison_id.slice(0, 8)}…</span> · also available in the Documents tab.
            </div>
          )}
        </div>
      )}

      {/* In-app preview styling — overrides Tailwind defaults so tables
          look like tables, headings stack with visible hierarchy, and
          lens tags stay readable. Scoped to .compare-preview only so it
          does not affect the rest of the app. */}
      <style>{`
        .compare-preview h1 { font-size: 18px; font-weight: 700; margin: 0 0 12px; color: hsl(var(--foreground)); border-bottom: 1px solid hsl(var(--border)); padding-bottom: 8px; }
        .compare-preview h2 { font-size: 15px; font-weight: 600; margin: 20px 0 10px; color: hsl(var(--foreground)); }
        .compare-preview h3 { font-size: 13px; font-weight: 600; margin: 16px 0 8px; color: hsl(var(--foreground)); }
        .compare-preview p { margin: 0 0 10px; line-height: 1.6; }
        .compare-preview ul, .compare-preview ol { margin: 0 0 12px; padding-left: 20px; }
        .compare-preview li { margin: 4px 0; line-height: 1.55; }
        .compare-preview strong { color: hsl(var(--foreground)); font-weight: 600; }
        .compare-preview em { color: hsl(var(--muted-foreground)); font-style: italic; }
        .compare-preview table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 11.5px; }
        .compare-preview th, .compare-preview td { border: 1px solid hsl(var(--border)); padding: 6px 10px; text-align: left; vertical-align: top; }
        .compare-preview th { background: hsl(var(--muted) / 0.5); font-weight: 600; }
        .compare-preview tr:nth-child(even) td { background: hsl(var(--muted) / 0.15); }
        .compare-preview blockquote { border-left: 3px solid hsl(var(--primary) / 0.4); padding: 4px 0 4px 12px; margin: 12px 0; color: hsl(var(--muted-foreground)); }
        .compare-preview hr { border: none; border-top: 1px solid hsl(var(--border)); margin: 16px 0; }
        .compare-preview code { background: hsl(var(--muted) / 0.5); padding: 1px 4px; border-radius: 3px; font-size: 11px; }
        .compare-preview pre { background: hsl(var(--muted) / 0.3); padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 11px; line-height: 1.5; margin: 10px 0; }
        .compare-preview pre code { background: transparent; padding: 0; }
      `}</style>
    </div>
  );
}

/* ─── SidePicker — embedded picker for one side of the comparison ─ */

interface SidePickerProps {
  label: string;
  side: 'A' | 'B';
  state: SideState;
  setState: (s: SideState) => void;
  items: CompareItem[];
  loading: boolean;
  search: string;
  setSearch: (s: string) => void;
}

function SidePicker({ label, state, setState, items, loading, search, setSearch }: SidePickerProps) {
  const onFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) { alert(`${file.name} is larger than 10MB.`); return; }
    setState({ mode: 'upload', file });
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{label}</h3>
        <div className="flex gap-1 text-[10px]">
          <button
            onClick={() => setState({ mode: 'pick', picked: null })}
            className={`px-2 py-1 rounded ${state.mode === 'pick' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
          >Pick existing</button>
          <button
            onClick={() => setState({ mode: 'upload', file: null })}
            className={`px-2 py-1 rounded ${state.mode === 'upload' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
          >Upload new</button>
        </div>
      </div>

      {state.mode === 'pick' && (
        <>
          {state.picked ? (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5 flex items-start gap-2">
              <FileText className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{state.picked.label}</div>
                <div className="text-[10px] text-muted-foreground">{state.picked.sublabel}</div>
              </div>
              <button onClick={() => setState({ mode: 'pick', picked: null })} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
            </div>
          ) : (
            <>
              <div className="relative mb-2">
                <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search reports, attachments, evidence…"
                  className="w-full text-[11px] pl-7 pr-2 py-1.5 rounded border border-border bg-background"
                />
              </div>
              {loading ? (
                <div className="text-xs text-muted-foreground p-4 text-center">
                  <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> Loading documents…
                </div>
              ) : items.length === 0 ? (
                <div className="text-xs text-muted-foreground p-4 text-center">No documents found. Try uploading one instead.</div>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {items.map(it => (
                    <button
                      key={`${it.kind}:${it.id}`}
                      onClick={() => setState({ mode: 'pick', picked: it })}
                      className="w-full text-left rounded p-1.5 hover:bg-muted transition-colors flex items-start gap-2"
                    >
                      <FileText className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium truncate">{it.label}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{it.sublabel}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {state.mode === 'upload' && (
        <>
          {state.file ? (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5 flex items-start gap-2">
              <Upload className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{state.file.name}</div>
                <div className="text-[10px] text-muted-foreground">{Math.round(state.file.size / 1024)} KB · will be parsed for comparison</div>
              </div>
              <button onClick={() => setState({ mode: 'upload', file: null })} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
            </div>
          ) : (
            <label
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
              className="block rounded-lg border border-dashed border-border p-4 text-center cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <Upload className="h-4 w-4 mx-auto mb-1.5 text-muted-foreground" />
              <div className="text-xs text-muted-foreground">Drop a file here, or click to pick</div>
              <div className="text-[10px] text-muted-foreground/70 mt-1">PDF, DOCX, XLSX, CSV, MD, TXT — max 10MB</div>
              <input
                type="file"
                accept=".pdf,.docx,.xlsx,.xls,.csv,.md,.txt,.html,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,text/markdown"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}
