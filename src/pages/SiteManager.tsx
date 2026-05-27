/* ════════════════════════════════════════════════════════════════
   src/pages/SiteManager.tsx
   Site Manager — bulk page management tool.
   Independent of global project selector.
   Own context (SiteContext), own site selector.
   Reuses dev-engine execution backend via task-engine actions.
════════════════════════════════════════════════════════════════ */
import { useState, useRef, useCallback, useEffect } from 'react';
import PortalNav from '@/components/PortalNav';
import { SiteProvider, useSite, type DevPage, type DevSite } from '@/contexts/SiteContext';
import {
  Globe, Plus, ChevronDown, X, Upload, Link2, BarChart3,
  Zap, AlertTriangle, CheckCircle, Clock, ArrowUpDown,
  Filter, RefreshCw, ExternalLink, Settings, Layers,
  TrendingUp, Target, FileText, Search, MoreHorizontal,
  ChevronRight, Loader2, Copy, Check
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// SHARED UTIL
// ─────────────────────────────────────────────────────────────

async function callApi<T = any>(action: string, payload: Record<string, unknown>, timeoutMs = 30000): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch('/api/task-engine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }), signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }
    const json = await res.json();
    if (json.error) return { ok: false, error: json.error };
    return { ok: true, data: json as T };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Request failed' };
  }
}

const PAGE_TYPES = ['all','product','blog','landing','home','category','other'] as const;
type PageType = typeof PAGE_TYPES[number];

// ─────────────────────────────────────────────────────────────
// STATUS CONFIG
// ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:       { label: 'Pending',       color: 'text-muted-foreground',  bg: 'bg-muted/40' },
  baseline_done: { label: 'Baseline ✓',    color: 'text-blue-400',          bg: 'bg-blue-500/10' },
  auditing:      { label: 'Auditing…',     color: 'text-amber-400',         bg: 'bg-amber-500/10' },
  audited:       { label: 'Audited',       color: 'text-violet-400',        bg: 'bg-violet-500/10' },
  done:          { label: 'Done',          color: 'text-emerald-400',       bg: 'bg-emerald-500/10' },
};

// ─────────────────────────────────────────────────────────────
// NEW SITE MODAL
// ─────────────────────────────────────────────────────────────
function NewSiteModal({ onClose, onCreated }: { onClose: () => void; onCreated: (site: DevSite) => void }) {
  const [label, setLabel]   = useState('');
  const [domain, setDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const create = async () => {
    if (!label.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    const r = await callApi('site_create', { label: label.trim(), domain: domain.trim() || undefined });
    setSaving(false);
    if (!r.ok) { setErr(r.error || 'Failed'); return; }
    onCreated((r.data as any).site);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-semibold">New Site Workspace</div>
            <div className="text-xs text-muted-foreground mt-0.5">Independent of any project — link to one later if needed</div>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted/60 flex items-center justify-center text-muted-foreground">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Workspace name *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. AlphaSoftware.com" autoFocus
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary/60 transition-colors" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Domain</label>
            <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="https://www.alphasoftware.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary/60 transition-colors" />
          </div>
        </div>
        {err && <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <button type="button" onClick={create} disabled={saving || !label.trim()}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-all">
            {saving ? 'Creating…' : 'Create workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// IMPORT PAGES MODAL
// ─────────────────────────────────────────────────────────────
function ImportPagesModal({ siteId, onClose, onImported }: { siteId: string; onClose: () => void; onImported: () => void }) {
  const [mode, setMode]         = useState<'paste'|'sitemap'|'file'>('paste');
  const [urlText, setUrlText]   = useState('');
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState<{ imported: number; skipped: number } | null>(null);
  const [err, setErr]           = useState('');
  const fileRef                 = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = ev => setFileContent(ev.target?.result as string || '');
    reader.readAsText(f);
    e.target.value = '';
  };

  const doImport = async () => {
    setImporting(true); setErr('');
    let payload: any = { siteId };
    if (mode === 'paste') {
      const urls = urlText.split('\n').map(l => l.trim()).filter(l => /^https?:\/\//.test(l));
      if (!urls.length) { setErr('No valid URLs found. Each line should start with http/https'); setImporting(false); return; }
      payload.urls = urls;
    } else {
      if (!fileContent) { setErr('No file loaded'); setImporting(false); return; }
      payload.fileContent = fileContent;
      payload.fileName    = fileName;
    }
    const r = await callApi('site_import_pages', payload, 60000);
    setImporting(false);
    if (!r.ok) { setErr(r.error || 'Import failed'); return; }
    setResult({ imported: (r.data as any).imported, skipped: (r.data as any).skipped });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-semibold">Import Pages</div>
            <div className="text-xs text-muted-foreground mt-0.5">Sitemap, crawl export, or paste URLs</div>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted/60 flex items-center justify-center text-muted-foreground">✕</button>
        </div>

        {!result ? (
          <>
            {/* Mode tabs */}
            <div className="flex gap-1 p-1 bg-muted/30 rounded-xl">
              {[['paste','📋 Paste URLs'],['sitemap','🗺️ Sitemap / CSV'],['file','📂 Any file']] .map(([m,l]) => (
                <button key={m} type="button" onClick={() => setMode(m as any)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
              ))}
            </div>

            {mode === 'paste' && (
              <textarea value={urlText} onChange={e => setUrlText(e.target.value)} rows={8}
                placeholder={'One URL per line:\nhttps://www.example.com/page-1\nhttps://www.example.com/page-2'}
                className="w-full px-3.5 py-3 rounded-xl border border-border bg-background text-sm font-mono resize-none focus:outline-none focus:border-primary/60" />
            )}

            {(mode === 'sitemap' || mode === 'file') && (
              <div className="space-y-3">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/40 p-8 text-center transition-colors">
                  <div className="text-3xl mb-2">📂</div>
                  {fileContent ? (
                    <p className="text-sm font-medium text-emerald-400">✓ {fileName}</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium">{mode === 'sitemap' ? 'Upload sitemap.xml or crawl CSV' : 'Upload any audit file'}</p>
                      <p className="text-xs text-muted-foreground mt-1">{mode === 'sitemap' ? 'sitemap.xml, Screaming Frog CSV, Ahrefs export' : 'JSON, CSV, markdown, plain text'}</p>
                    </>
                  )}
                </button>
                <input ref={fileRef} type="file" accept=".xml,.csv,.json,.txt,.md" className="hidden" onChange={handleFile} />
              </div>
            )}

            {err && <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{err}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground">Cancel</button>
              <button type="button" onClick={doImport} disabled={importing}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 transition-all">
                {importing ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Importing…</span> : 'Import pages'}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-4 space-y-3">
            <div className="text-4xl">✓</div>
            <div className="text-base font-semibold">{result.imported} pages imported</div>
            {result.skipped > 0 && <div className="text-xs text-muted-foreground">{result.skipped} already existed — skipped</div>}
            <button type="button" onClick={() => { onImported(); onClose(); }}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BASELINE CAPTURE PANEL
// ─────────────────────────────────────────────────────────────
function BaselinePanel({ pages, siteId, projectId, onDone }: { pages: DevPage[]; siteId: string; projectId: string | null; onDone: () => void }) {
  const pending  = pages.filter(p => !p.baseline_captured_at);
  const done     = pages.filter(p =>  p.baseline_captured_at);
  const [running,  setRunning]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [current,  setCurrent]  = useState('');
  const abortRef = useRef(false);

  const runBaseline = async () => {
    setRunning(true); abortRef.current = false;
    const batch = pending.slice(0, 50).map(p => p.id);
    let done2 = 0;
    for (let i = 0; i < batch.length; i += 3) {
      if (abortRef.current) break;
      const ids = batch.slice(i, i + 3);
      setCurrent(pending[i]?.url || '');
      await callApi('site_take_baseline', { siteId, pageIds: ids, projectId }, 90000);
      done2 += ids.length;
      setProgress(Math.round((done2 / batch.length) * 100));
    }
    setRunning(false);
    onDone();
  };

  if (pending.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
        <div>
          <div className="text-sm font-semibold text-emerald-400">Baseline captured for all {done.length} pages</div>
          <div className="text-xs text-muted-foreground">PageSpeed scores and GSC metrics locked in as starting point</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-semibold">Capture baseline before any fixes</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Records current PageSpeed scores and GSC traffic for {pending.length} pages. Required for before/after comparison.
            {done.length > 0 && ` (${done.length} already captured)`}
          </div>
        </div>
      </div>

      {running ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate max-w-xs">{current}</span>
            <span className="text-amber-400 font-medium tabular-nums">{progress}%</span>
          </div>
          <div className="w-full bg-muted/30 rounded-full h-1.5">
            <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: progress + '%' }} />
          </div>
          <button type="button" onClick={() => abortRef.current = true}
            className="text-xs text-muted-foreground hover:text-foreground">Stop</button>
        </div>
      ) : (
        <button type="button" onClick={runBaseline}
          className="w-full py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-500/30 transition-all">
          Capture baseline for {Math.min(pending.length, 50)} pages
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGES TABLE
// ─────────────────────────────────────────────────────────────
function PagesTable({ pages, onPageClick, onRefresh }: { pages: DevPage[]; onPageClick: (p: DevPage) => void; onRefresh: () => void }) {
  const [search,   setSearch]   = useState('');
  const [typeFilter, setTypeFilter] = useState<PageType>('all');
  const [sortCol,  setSortCol]  = useState<'priority'|'issues_red'|'gsc'|'score'>('issues_red');
  const [sortDir,  setSortDir]  = useState<'asc'|'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = pages
    .filter(p => (!search || p.url.toLowerCase().includes(search.toLowerCase()) || (p.title || '').toLowerCase().includes(search.toLowerCase())))
    .filter(p => typeFilter === 'all' || p.page_type === typeFilter)
    .sort((a, b) => {
      let av = 0, bv = 0;
      if (sortCol === 'issues_red')  { av = a.issues_red;  bv = b.issues_red; }
      if (sortCol === 'gsc')         { av = a.baseline_gsc_clicks || 0; bv = b.baseline_gsc_clicks || 0; }
      if (sortCol === 'score')       { av = a.baseline_score || 0;       bv = b.baseline_score || 0; }
      if (sortCol === 'priority')    { av = a.priority;     bv = b.priority; }
      return sortDir === 'desc' ? bv - av : av - bv;
    });

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const impactScore = (p: DevPage) => {
    const clicks = p.baseline_gsc_clicks || 0;
    const red    = p.issues_red || 0;
    const amber  = p.issues_amber || 0;
    return (clicks > 0 ? clicks * 0.1 : 1) * (red * 3 + amber);
  };

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search URLs…"
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary/40" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as PageType)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          {PAGE_TYPES.map(t => <option key={t} value={t}>{t === 'all' ? 'All types' : t}</option>)}
        </select>
        <button type="button" onClick={onRefresh} className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <div className="text-xs text-muted-foreground">{filtered.length} pages</div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-0 bg-muted/20 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          <div className="w-8 px-3 py-2.5 flex items-center">
            <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
              onChange={e => setSelected(e.target.checked ? new Set(filtered.map(p => p.id)) : new Set())}
              className="w-3 h-3 rounded" />
          </div>
          <div className="px-3 py-2.5">Page</div>
          <button type="button" onClick={() => toggleSort('issues_red')} className="px-3 py-2.5 flex items-center gap-1 hover:text-foreground transition-colors">
            Issues {sortCol === 'issues_red' && <ArrowUpDown className="w-3 h-3" />}
          </button>
          <button type="button" onClick={() => toggleSort('gsc')} className="px-3 py-2.5 flex items-center gap-1 hover:text-foreground transition-colors">
            Clicks {sortCol === 'gsc' && <ArrowUpDown className="w-3 h-3" />}
          </button>
          <button type="button" onClick={() => toggleSort('score')} className="px-3 py-2.5 flex items-center gap-1 hover:text-foreground transition-colors">
            Score {sortCol === 'score' && <ArrowUpDown className="w-3 h-3" />}
          </button>
          <div className="px-3 py-2.5">Status</div>
          <div className="px-3 py-2.5 w-8" />
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {pages.length === 0 ? 'No pages yet — import pages to get started' : 'No pages match this filter'}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map(page => {
              const status = STATUS_CONFIG[page.status] || STATUS_CONFIG.pending;
              const impact = Math.round(impactScore(page));
              return (
                <div key={page.id}
                  className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-0 items-center hover:bg-muted/20 transition-colors cursor-pointer group"
                  onClick={() => onPageClick(page)}>
                  <div className="w-8 px-3 py-3 flex items-center" onClick={e => { e.stopPropagation(); toggleSelect(page.id); }}>
                    <input type="checkbox" checked={selected.has(page.id)} onChange={() => {}} className="w-3 h-3 rounded" />
                  </div>
                  <div className="px-3 py-3 min-w-0">
                    <div className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                      {page.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {page.url.replace(/^https?:\/\//, '').split('/')[0]}
                      {page.title && ` · ${page.title}`}
                    </div>
                  </div>
                  <div className="px-3 py-3 text-right">
                    {(page.issues_red > 0 || page.issues_amber > 0) ? (
                      <div className="flex items-center gap-1 justify-end">
                        {page.issues_red   > 0 && <span className="text-xs font-bold text-red-400">{page.issues_red}🔴</span>}
                        {page.issues_amber > 0 && <span className="text-xs font-medium text-amber-400">{page.issues_amber}🟡</span>}
                      </div>
                    ) : <span className="text-xs text-muted-foreground/40">—</span>}
                  </div>
                  <div className="px-3 py-3 text-right text-xs tabular-nums">
                    {page.baseline_gsc_clicks !== null ? (
                      <span className="font-medium">{page.baseline_gsc_clicks.toLocaleString()}</span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </div>
                  <div className="px-3 py-3 text-right">
                    {page.baseline_score !== null ? (
                      <span className={`text-xs font-bold tabular-nums ${page.baseline_score >= 70 ? 'text-emerald-400' : page.baseline_score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                        {page.baseline_score}
                      </span>
                    ) : <span className="text-xs text-muted-foreground/40">—</span>}
                  </div>
                  <div className="px-3 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${status.bg} ${status.color}`}>{status.label}</span>
                  </div>
                  <div className="px-3 py-3 w-8">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20">
          <span className="text-xs font-semibold text-primary">{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <button type="button" className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
              Take baseline
            </button>
            <button type="button" className="text-xs px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary font-medium hover:bg-primary/30 transition-colors">
              Run audit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SITE SELECTOR
// ─────────────────────────────────────────────────────────────
function SiteSelector() {
  const { sites, selectedSite, setSelectedSiteId, loadingSites, refreshSites } = useSite();
  const [open, setOpen]     = useState(false);
  const [showNew, setShowNew] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all text-sm font-medium ${
          open ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card/60 hover:border-primary/30 hover:bg-primary/5'
        }`}>
        <Globe className="w-4 h-4 shrink-0" />
        <span className="max-w-48 truncate">{selectedSite?.label || 'Select site…'}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="p-2 space-y-0.5 max-h-64 overflow-y-auto">
            {loadingSites ? (
              <div className="py-4 text-center text-xs text-muted-foreground">Loading…</div>
            ) : sites.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No workspaces yet</div>
            ) : (
              sites.map(s => (
                <button key={s.id} type="button"
                  onClick={() => { setSelectedSiteId(s.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${selectedSite?.id === s.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60'}`}>
                  <div className="text-sm font-medium">{s.label}</div>
                  {s.domain && <div className="text-[10px] text-muted-foreground mt-0.5">{s.domain}</div>}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border p-2">
            <button type="button" onClick={() => { setShowNew(true); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-muted/60 text-sm text-muted-foreground hover:text-foreground transition-all">
              <Plus className="w-3.5 h-3.5" />New workspace
            </button>
          </div>
        </div>
      )}

      {showNew && (
        <NewSiteModal
          onClose={() => setShowNew(false)}
          onCreated={site => { refreshSites(); setSelectedSiteId(site.id); setShowNew(false); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STATS BAR
// ─────────────────────────────────────────────────────────────
function StatsBar() {
  const { stats, pages, selectedSite } = useSite();
  if (!selectedSite) return null;
  const s = stats;
  const cards = [
    { label: 'Total pages',    value: s?.total_pages || pages.length || 0,   color: 'text-foreground' },
    { label: 'Baseline done',  value: s?.baseline_pages || 0,                color: 'text-blue-400' },
    { label: 'Audited',        value: s?.audited_pages  || 0,                color: 'text-violet-400' },
    { label: 'Critical issues',value: s?.total_red      || 0,                color: s?.total_red ? 'text-red-400' : 'text-muted-foreground' },
    { label: 'Warnings',       value: s?.total_amber    || 0,                color: s?.total_amber ? 'text-amber-400' : 'text-muted-foreground' },
  ];
  return (
    <div className="grid grid-cols-5 gap-3">
      {cards.map(c => (
        <div key={c.label} className="rounded-2xl border border-border bg-card/40 px-4 py-3">
          <div className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN VIEW
// ─────────────────────────────────────────────────────────────
function SiteManagerView() {
  const { selectedSite, selectedSiteId, pages, loadingPages, refreshPages, sites } = useSite();
  const [showImport,    setShowImport]    = useState(false);
  const [activeTab,     setActiveTab]     = useState<'pages'|'baseline'|'issues'>('pages');
  const [selectedPage,  setSelectedPage]  = useState<DevPage | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <PortalNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Layers className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Site Manager</h1>
              <p className="text-xs text-muted-foreground">Bulk page management · independent of project selector</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SiteSelector />
            {selectedSiteId && (
              <button type="button" onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-[0_0_16px_hsl(var(--primary)/0.25)]">
                <Plus className="w-3.5 h-3.5" />Import pages
              </button>
            )}
          </div>
        </div>

        {/* No site selected */}
        {!selectedSiteId && (
          <div className="rounded-2xl border-2 border-dashed border-border bg-card/20 py-20 text-center space-y-4">
            <div className="text-5xl">🌐</div>
            <div className="text-lg font-semibold">Select or create a site workspace</div>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Site Manager works independently of the project selector above.
              Create a workspace for any site — link it to a project later if needed.
            </p>
            <NewSiteModal
              onClose={() => {}}
              onCreated={() => {}}
            />
          </div>
        )}

        {selectedSite && (
          <>
            {/* Stats */}
            <StatsBar />

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border pb-0">
              {[
                { id: 'pages',    label: '📋 Pages',         badge: pages.length },
                { id: 'baseline', label: '📊 Baseline',      badge: pages.filter(p => !p.baseline_captured_at).length || undefined },
                { id: 'issues',   label: '⚡ Issue Clusters', badge: undefined },
              ].map(tab => (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}>
                  {tab.label}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${activeTab === tab.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'pages' && (
              loadingPages ? (
                <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
              ) : (
                <PagesTable pages={pages} onPageClick={setSelectedPage} onRefresh={refreshPages} />
              )
            )}

            {activeTab === 'baseline' && (
              <BaselinePanel pages={pages} siteId={selectedSiteId!} projectId={selectedSite.project_id} onDone={refreshPages} />
            )}

            {activeTab === 'issues' && (
              <IssueClusters siteId={selectedSiteId!} />
            )}
          </>
        )}
      </div>

      {showImport && selectedSiteId && (
        <ImportPagesModal siteId={selectedSiteId} onClose={() => setShowImport(false)} onImported={refreshPages} />
      )}

      {selectedPage && (
        <PageDrawer page={selectedPage} onClose={() => setSelectedPage(null)} onUpdated={refreshPages} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ISSUE CLUSTERS
// ─────────────────────────────────────────────────────────────
function IssueClusters({ siteId }: { siteId: string }) {
  const [clusters, setClusters] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    setLoading(true);
    callApi('site_cluster_issues', { siteId }).then(r => {
      if (r.ok) setClusters((r.data as any).clusters || []);
      setLoading(false);
    });
  }, [siteId]);

  if (loading) return <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>;

  if (!clusters.length) {
    return (
      <div className="rounded-2xl border border-border bg-card/30 py-12 text-center space-y-2">
        <div className="text-3xl">✓</div>
        <div className="text-sm font-medium">No clusters yet</div>
        <div className="text-xs text-muted-foreground">Run audits on pages first, then come back here to see issue patterns</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Issues grouped by type across all pages. Template-fixable issues can be resolved once and applied to all affected pages.
      </div>
      {clusters.map((c, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card/30 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">{c.label}</span>
                {c.is_template && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-400 font-medium">Template fix available</span>}
                {c.is_page_specific && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 font-medium">Page-specific</span>}
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>{c.page_count} page{c.page_count !== 1 ? 's' : ''}</span>
                {c.red_count > 0 && <span className="text-red-400">{c.red_count} critical</span>}
              </div>
              {c.page_urls.length > 0 && (
                <div className="mt-2 text-[10px] text-muted-foreground/60 truncate">
                  {c.page_urls.slice(0,3).map((u: string) => u.replace(/^https?:\/\/[^/]+/,'')).join(' · ')}
                  {c.page_urls.length > 3 && ` +${c.page_urls.length - 3} more`}
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {c.is_template && (
                <button type="button" className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/25 text-blue-400 font-medium hover:bg-blue-500/25 transition-colors">
                  Create template fix
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE DRAWER
// ─────────────────────────────────────────────────────────────
function PageDrawer({ page, onClose, onUpdated }: { page: DevPage; onClose: () => void; onUpdated: () => void }) {
  const [tasks,   setTasks]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'overview'|'tasks'>('overview');

  useEffect(() => {
    setLoading(true);
    callApi('dev_get_tasks', { projectId: page.project_id || page.site_id, pageId: page.id }).then(r => {
      if (r.ok) setTasks((r.data as any).tasks || []);
      setLoading(false);
    });
  }, [page.id]);

  const domain = page.url.replace(/^https?:\/\//, '').split('/')[0];
  const path   = page.url.replace(/^https?:\/\/[^/]+/, '') || '/';

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-card border-l border-border h-full flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">{domain}</div>
            <div className="text-sm font-semibold mt-0.5 break-all">{path}</div>
            {page.title && <div className="text-xs text-muted-foreground mt-0.5">{page.title}</div>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a href={page.url} target="_blank" rel="noreferrer"
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 border-b border-border">
          {[['overview','Overview'],['tasks','Tasks']].map(([id,label]) => (
            <button key={id} type="button" onClick={() => setTab(id as any)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {label} {id === 'tasks' && tasks.length > 0 && `(${tasks.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'overview' && (
            <>
              {/* Baseline metrics */}
              {page.baseline_captured_at ? (
                <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-3">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Baseline · {new Date(page.baseline_captured_at).toLocaleDateString()}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'PageSpeed',   value: page.baseline_score !== null ? `${page.baseline_score}` : '—', color: page.baseline_score !== null ? (page.baseline_score >= 70 ? 'text-emerald-400' : page.baseline_score >= 50 ? 'text-amber-400' : 'text-red-400') : 'text-muted-foreground' },
                      { label: 'Mobile LCP',  value: page.baseline_lcp_ms ? `${(page.baseline_lcp_ms/1000).toFixed(1)}s` : '—', color: page.baseline_lcp_ms ? (page.baseline_lcp_ms <= 2500 ? 'text-emerald-400' : page.baseline_lcp_ms <= 4000 ? 'text-amber-400' : 'text-red-400') : 'text-muted-foreground' },
                      { label: 'GSC Clicks',  value: page.baseline_gsc_clicks !== null ? page.baseline_gsc_clicks.toLocaleString() : '—', color: 'text-foreground' },
                    ].map(m => (
                      <div key={m.label} className="rounded-xl border border-border bg-background/60 px-3 py-2.5 text-center">
                        <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-400">
                  Baseline not captured yet. Go to the Baseline tab to capture PageSpeed and GSC metrics before making any changes.
                </div>
              )}

              {/* Page info */}
              <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-2.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Page info</div>
                {[
                  { label: 'Status',    value: STATUS_CONFIG[page.status]?.label || page.status },
                  { label: 'Type',      value: page.page_type },
                  { label: 'Priority',  value: String(page.priority) },
                  { label: 'Imported',  value: new Date(page.created_at).toLocaleDateString() },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className="text-xs font-medium">{row.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'tasks' && (
            loading ? (
              <div className="py-8 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>
            ) : tasks.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <div className="text-sm text-muted-foreground">No tasks for this page yet</div>
                <div className="text-xs text-muted-foreground/60">Run an audit on this page to generate tasks</div>
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((t: any) => (
                  <div key={t.id} className="rounded-xl border border-border bg-card/40 p-3.5">
                    <div className="flex items-start gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold mt-0.5 shrink-0 ${t.severity === 'critical' || t.severity === 'red' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                        {t.severity?.toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">{t.title}</div>
                        {t.analysis && <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{t.analysis}</div>}
                      </div>
                      <span className={`ml-auto shrink-0 text-[9px] px-2 py-0.5 rounded-full ${STATUS_CONFIG[t.status]?.bg || 'bg-muted/40'} ${STATUS_CONFIG[t.status]?.color || 'text-muted-foreground'}`}>
                        {STATUS_CONFIG[t.status]?.label || t.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOT EXPORT
// ─────────────────────────────────────────────────────────────
export default function SiteManager() {
  return (
    <SiteProvider>
      <SiteManagerView />
    </SiteProvider>
  );
}
