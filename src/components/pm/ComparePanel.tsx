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
import { Loader2, FileText, Upload, ArrowRight, Search, Download, X, Sparkles, AlertCircle } from 'lucide-react';
import {
  compareListDocs, compareRun, fileToAdHocRef,
  type CompareItem, type CompareSourceRef,
} from '@/components/pm/api';
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

  // Reset everything when project changes
  useEffect(() => {
    setItems([]); setSideA({ mode: 'pick', picked: null }); setSideB({ mode: 'pick', picked: null });
    setResult(null); setError(''); setContext('');
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

      const r = await compareRun({ projectId, docA, docB, context: context.trim() || undefined });
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

  const downloadAsDocx = () => {
    if (!result?.body_md) return;
    const fileName = (result.title || 'comparison').replace(/[^\w-]+/g, '_').slice(0, 60) + '.md';
    const blob = new Blob([result.body_md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
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
            <div className="flex gap-2">
              <button onClick={copyToClipboard} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted">Copy</button>
              <button onClick={downloadAsDocx} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1.5">
                <Download className="h-3 w-3" /> Download .md
              </button>
            </div>
          </div>
          <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-foreground/90 leading-relaxed font-mono text-[12px]">
            {result.body_md}
          </div>
          {result.comparison_id && (
            <div className="mt-3 text-[10px] text-muted-foreground">
              Saved as workspace artifact · id <span className="font-mono">{result.comparison_id.slice(0, 8)}…</span> · also available in the Documents tab.
            </div>
          )}
        </div>
      )}
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
