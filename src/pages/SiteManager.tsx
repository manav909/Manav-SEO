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
  const pending     = pages.filter(p => !p.baseline_captured_at);
  const withBase    = pages.filter(p =>  p.baseline_captured_at);
  const missingGsc  = withBase.filter(p => p.baseline_gsc_clicks === null);
  const [running,   setRunning]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [current,   setCurrent]   = useState('');
  const [mode,      setMode]      = useState<'pending'|'all'|'gsc_only'>('pending');
  const abortRef = useRef(false);

  // Auto-select best mode
  useEffect(() => {
    if (pending.length > 0) setMode('pending');
    else if (missingGsc.length > 0) setMode('gsc_only');
    else setMode('all');
  }, [pages.length]);

  const runBaseline = async () => {
    const targets = mode === 'pending' ? pending
                  : mode === 'gsc_only' ? missingGsc
                  : pages;
    if (!targets.length) return;
    setRunning(true); abortRef.current = false;
    const batch = targets.slice(0, 50).map(p => p.id);
    let done2 = 0;
    for (let i = 0; i < batch.length; i += 3) {
      if (abortRef.current) break;
      const ids = batch.slice(i, i + 3);
      setCurrent(targets[i]?.url || '');
      await callApi('site_take_baseline', { siteId, pageIds: ids, projectId }, 90000);
      done2 += ids.length;
      setProgress(Math.round((done2 / batch.length) * 100));
    }
    setRunning(false);
    onDone();
  };

  // Check GSC connection status for this site
  const [gscConnected, setGscConnected] = useState(false);
  useEffect(() => {
    callApi('site_gsc_status', { siteId }).then(r => {
      setGscConnected(!!(r.data as any)?.connected && !!(r.data as any)?.resourceId);
    });
  }, [siteId]);

  const targets = mode === 'pending' ? pending : mode === 'gsc_only' ? missingGsc : pages;

  return (
    <div className="space-y-4">
      {/* Status cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-card/40 px-4 py-3">
          <div className={`text-xl font-bold ${pending.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{withBase.length}/{pages.length}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Baseline captured</div>
        </div>
        <div className="rounded-2xl border border-border bg-card/40 px-4 py-3">
          <div className={`text-xl font-bold ${missingGsc.length > 0 && gscConnected ? 'text-amber-400' : missingGsc.length === 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>
            {withBase.length - missingGsc.length}/{withBase.length}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">With GSC data</div>
        </div>
        <div className="rounded-2xl border border-border bg-card/40 px-4 py-3">
          <div className={`text-xl font-bold ${gscConnected ? 'text-emerald-400' : 'text-muted-foreground'}`}>
            {gscConnected ? '✓' : '○'}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">GSC connected</div>
        </div>
      </div>

      {/* Mode selector */}
      {!running && (
        <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-3">
          <div className="text-xs font-semibold">What to capture</div>
          <div className="space-y-2">
            {[
              { id: 'pending' as const,  label: `New pages only`,              sub: `${pending.length} pages with no baseline yet`,          disabled: pending.length === 0 },
              { id: 'gsc_only' as const, label: `Fill in missing GSC data`,     sub: `${missingGsc.length} pages have no clicks/impressions`,  disabled: missingGsc.length === 0 || !gscConnected },
              { id: 'all' as const,      label: `Re-run all pages`,             sub: `Overwrites all ${pages.length} baselines with fresh data`, disabled: pages.length === 0 },
            ].map(opt => (
              <button key={opt.id} type="button" onClick={() => !opt.disabled && setMode(opt.id)}
                disabled={opt.disabled}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-all ${
                  mode === opt.id && !opt.disabled
                    ? 'border-primary/50 bg-primary/10'
                    : opt.disabled
                    ? 'border-border/40 opacity-40 cursor-not-allowed'
                    : 'border-border bg-background/40 hover:border-primary/30'
                }`}>
                <div className="text-xs font-medium">{opt.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{opt.sub}</div>
              </button>
            ))}
          </div>

          <button type="button" onClick={runBaseline} disabled={targets.length === 0}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-all shadow-[0_0_14px_hsl(var(--primary)/0.2)]">
            Run baseline for {Math.min(targets.length, 50)} pages
          </button>
        </div>
      )}

      {/* Running state */}
      {running && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate max-w-xs">{current.replace(/^https?:\/\/[^/]+/, '') || 'Starting…'}</span>
            <span className="text-primary font-bold tabular-nums">{progress}%</span>
          </div>
          <div className="w-full bg-muted/30 rounded-full h-1.5">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: progress + '%' }} />
          </div>
          <button type="button" onClick={() => abortRef.current = true}
            className="text-xs text-muted-foreground hover:text-foreground">Stop after current page</button>
        </div>
      )}

      {/* GSC hint */}
      {!gscConnected && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-400">
          GSC not connected — baselines will capture PageSpeed only. Go to <strong>Settings tab</strong> to connect GSC, then use "Fill in missing GSC data".
        </div>
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
  const { selectedSite, selectedSiteId, pages, loadingPages, refreshPages, refreshSites, sites } = useSite();
  const [showImport,    setShowImport]    = useState(false);
  const [showLinkProj,  setShowLinkProj]  = useState(false);
  const [showNewSite,   setShowNewSite]   = useState(false);
  const [activeTab,     setActiveTab]     = useState<'pages'|'baseline'|'audit'|'issues'|'results'|'brief'|'settings'>('pages');
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
              <>
                {!selectedSite?.project_id && (
                  <button type="button" onClick={() => setShowLinkProj(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
                    <Link2 className="w-3.5 h-3.5" />Link project
                  </button>
                )}
                <button type="button" onClick={() => setShowImport(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-[0_0_16px_hsl(var(--primary)/0.25)]">
                  <Plus className="w-3.5 h-3.5" />Import pages
                </button>
              </>
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
            <button
              type="button"
              onClick={() => setShowNewSite(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-[0_0_20px_hsl(var(--primary)/0.25)]"
            >
              <Plus className="w-4 h-4" />
              Create workspace
            </button>
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
                { id: 'audit',    label: '🔍 Audit Queue',   badge: pages.filter(p => p.status === 'pending' || p.status === 'baseline_done').length || undefined },
                { id: 'issues',  label: '⚡ Clusters',      badge: undefined },
                { id: 'results',   label: '📈 Results',    badge: undefined },
                { id: 'brief',    label: '📋 Bulk Brief',   badge: undefined },
                { id: 'settings', label: '⚙️ Settings',     badge: undefined },
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

            {activeTab === 'audit' && (
              <AuditQueue pages={pages} siteId={selectedSiteId!} onDone={refreshPages} />
            )}

            {activeTab === 'issues' && (
              <IssueClusters siteId={selectedSiteId!} />
            )}

            {activeTab === 'results' && (
              <ResultsDashboard pages={pages} siteId={selectedSiteId!} />
            )}

            {activeTab === 'brief' && (
              <BulkBrief pages={pages} site={selectedSite} siteId={selectedSiteId!} />
            )}

            {activeTab === 'settings' && (
              <SiteSettings site={selectedSite!} siteId={selectedSiteId!} onUpdated={refreshSites} />
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

      {showLinkProj && selectedSiteId && (
        <LinkProjectModal siteId={selectedSiteId} onClose={() => setShowLinkProj(false)} onLinked={() => { setShowLinkProj(false); }} />
      )}

      {showNewSite && (
        <NewSiteModal
          onClose={() => setShowNewSite(false)}
          onCreated={site => { refreshSites(); setSelectedSiteId(site.id); setShowNewSite(false); }}
        />
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// AUDIT QUEUE
// ─────────────────────────────────────────────────────────────
function AuditQueue({ pages, siteId, onDone }: { pages: DevPage[]; siteId: string; onDone: () => void }) {
  const ready   = pages.filter(p => p.status === 'pending' || p.status === 'baseline_done');
  const audited = pages.filter(p => p.status === 'audited'  || p.status === 'done');

  const [running,   setRunning]   = useState(false);
  const [current,   setCurrent]   = useState('');
  const [done,      setDone]      = useState(0);
  const [total,     setTotal]     = useState(0);
  const [log,       setLog]       = useState<{ url: string; red: number; amber: number; ok: boolean }[]>([]);
  const [selected,  setSelected]  = useState<Set<string>>(new Set(ready.map(p => p.id)));
  const abortRef = useRef(false);

  // Reset selection when ready pages change
  useEffect(() => {
    setSelected(new Set(ready.map(p => p.id)));
  }, [pages.length]);

  const runAudit = async () => {
    const toAudit = ready.filter(p => selected.has(p.id));
    if (!toAudit.length) return;
    setRunning(true);
    abortRef.current = false;
    setDone(0);
    setTotal(toAudit.length);
    setLog([]);

    for (let i = 0; i < toAudit.length; i++) {
      if (abortRef.current) break;
      const page = toAudit[i];
      setCurrent(page.url);
      const r = await callApi('site_audit_page', { pageId: page.id, siteId }, 90000);
      const entry = {
        url:   page.url.replace(/^https?:\/\/[^/]+/, '') || '/',
        red:   (r.data as any)?.issues_red   || 0,
        amber: (r.data as any)?.issues_amber || 0,
        ok:    r.ok,
      };
      setLog(prev => [entry, ...prev].slice(0, 50));
      setDone(i + 1);
    }

    setRunning(false);
    setCurrent('');
    onDone();
  };

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Ready to audit',  value: ready.length,   color: 'text-amber-400' },
          { label: 'Audited',         value: audited.length, color: 'text-emerald-400' },
          { label: 'Total pages',     value: pages.length,   color: 'text-foreground' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-border bg-card/40 px-4 py-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Page selection */}
      {ready.length > 0 && !running && (
        <div className="rounded-2xl border border-border bg-card/30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <input type="checkbox"
                checked={selected.size === ready.length && ready.length > 0}
                onChange={e => setSelected(e.target.checked ? new Set(ready.map(p => p.id)) : new Set())}
                className="w-3.5 h-3.5 rounded" />
              <span className="text-xs font-semibold">{selected.size} of {ready.length} selected</span>
            </div>
            <button type="button" onClick={runAudit} disabled={selected.size === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-40 transition-all shadow-[0_0_14px_hsl(var(--primary)/0.2)]">
              <Zap className="w-3 h-3" />
              Run audit on {selected.size} page{selected.size !== 1 ? 's' : ''}
            </button>
          </div>
          <div className="divide-y divide-border/50 max-h-64 overflow-y-auto">
            {ready.map(page => (
              <div key={page.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                <input type="checkbox" checked={selected.has(page.id)}
                  onChange={() => setSelected(prev => { const n = new Set(prev); n.has(page.id) ? n.delete(page.id) : n.add(page.id); return n; })}
                  className="w-3.5 h-3.5 rounded flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">{page.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</div>
                  <div className="text-[10px] text-muted-foreground">{page.page_type}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[page.status]?.bg || 'bg-muted/40'} ${STATUS_CONFIG[page.status]?.color || 'text-muted-foreground'}`}>
                  {STATUS_CONFIG[page.status]?.label || page.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Running state */}
      {running && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{done} of {total} pages audited</div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">{current.replace(/^https?:\/\/[^/]+/, '') || 'Starting…'}</div>
            </div>
            <span className="text-sm font-bold text-primary tabular-nums">{pct}%</span>
          </div>
          <div className="w-full bg-muted/30 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: pct + '%' }} />
          </div>
          <button type="button" onClick={() => abortRef.current = true}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Stop after current page
          </button>
        </div>
      )}

      {/* Live audit log */}
      {log.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/30 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Audit results
          </div>
          <div className="divide-y divide-border/40 max-h-64 overflow-y-auto">
            {log.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                {entry.ok
                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                <span className="text-xs flex-1 truncate font-mono text-muted-foreground">{entry.url}</span>
                <div className="flex items-center gap-2 text-xs">
                  {entry.red > 0 && <span className="text-red-400 font-bold">{entry.red}🔴</span>}
                  {entry.amber > 0 && <span className="text-amber-400">{entry.amber}🟡</span>}
                  {entry.red === 0 && entry.amber === 0 && entry.ok && <span className="text-emerald-400">✓ clean</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All done */}
      {ready.length === 0 && audited.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-emerald-400">All {audited.length} pages audited</div>
            <div className="text-xs text-muted-foreground mt-0.5">Check Issue Clusters tab to see patterns across pages</div>
          </div>
        </div>
      )}

      {ready.length === 0 && audited.length === 0 && (
        <div className="rounded-2xl border border-border bg-card/20 py-12 text-center space-y-2">
          <div className="text-3xl">🔍</div>
          <div className="text-sm font-medium">No pages to audit yet</div>
          <div className="text-xs text-muted-foreground">Import pages first, then come back here to run audits</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ISSUE CLUSTERS
// ─────────────────────────────────────────────────────────────
function IssueClusters({ siteId }: { siteId: string }) {
  const { selectedSite } = useSite();
  const [clusters,    setClusters]    = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [generating,  setGenerating]  = useState<string | null>(null);
  const [templateFix, setTemplateFix] = useState<any | null>(null);
  const [copied,      setCopied]      = useState(false);

  const load = () => {
    setLoading(true);
    callApi('site_cluster_issues', { siteId }).then(r => {
      if (r.ok) setClusters((r.data as any).clusters || []);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [siteId]);

  const createTemplateFix = async (cluster: any) => {
    setGenerating(cluster.task_type);
    setTemplateFix(null);
    const r = await callApi('site_execute_template_fix', {
      siteId,
      taskType:  cluster.task_type,
      pageIds:   cluster.task_ids,
      projectId: selectedSite?.project_id,
    }, 60000);
    setGenerating(null);
    if (r.ok) setTemplateFix((r.data as any).template_fix);
  };

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
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Issues grouped across all pages. Template-fixable issues affect many pages but require only one code change.
      </p>

      {/* Template fix result */}
      {templateFix && (
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{templateFix.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{templateFix.affected_count} pages · {templateFix.cms_platform}</div>
            </div>
            <button type="button" onClick={() => setTemplateFix(null)} className="w-6 h-6 rounded-lg hover:bg-muted/60 flex items-center justify-center text-muted-foreground text-xs">✕</button>
          </div>
          {templateFix.analysis && <p className="text-xs text-muted-foreground leading-relaxed">{templateFix.analysis}</p>}
          {templateFix.fix_code && (
            <div className="rounded-xl border border-border bg-background/60 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/20">
                <span className="text-[10px] font-mono text-muted-foreground">{templateFix.fix_language || 'code'}</span>
                <button type="button" onClick={() => { navigator.clipboard.writeText(templateFix.fix_code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className={`text-[10px] transition-colors ${copied ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <pre className="text-[10px] p-3 overflow-x-auto max-h-64 font-mono leading-relaxed text-foreground/80">{templateFix.fix_code}</pre>
            </div>
          )}
          {templateFix.apply_instructions && (
            <div className="rounded-xl bg-muted/20 p-3 text-[10px] leading-relaxed text-muted-foreground">
              <div className="font-semibold text-foreground/70 mb-1">How to apply:</div>
              {templateFix.apply_instructions}
            </div>
          )}
        </div>
      )}

      {clusters.map((c, i) => (
        <div key={i} className={`rounded-2xl border p-4 transition-all ${c.red_count > 0 ? 'border-red-500/20 bg-red-500/3' : 'border-border bg-card/30'}`}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">{c.label}</span>
                {c.is_template && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-400 font-medium">
                    Template fix — {c.page_count} pages at once
                  </span>
                )}
                {c.is_page_specific && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 font-medium">
                    Page-specific
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>{c.page_count} page{c.page_count !== 1 ? 's' : ''}</span>
                {c.red_count > 0 && <span className="text-red-400 font-medium">{c.red_count} critical</span>}
                <span>{c.count} task{c.count !== 1 ? 's' : ''} total</span>
              </div>
              {c.page_urls.length > 0 && (
                <div className="mt-2 text-[10px] text-muted-foreground/60 truncate">
                  {c.page_urls.slice(0,3).map((u: string) => u.replace(/^https?:\/\/[^/]+/,'')).join(' · ')}
                  {c.page_urls.length > 3 && ` +${c.page_urls.length - 3} more`}
                </div>
              )}
            </div>
            {c.is_template && (
              <button type="button"
                onClick={() => createTemplateFix(c)}
                disabled={!!generating}
                className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/25 text-blue-400 font-medium hover:bg-blue-500/25 disabled:opacity-40 transition-colors">
                {generating === c.task_type
                  ? <><Loader2 className="w-3 h-3 animate-spin" />Generating…</>
                  : <><Zap className="w-3 h-3" />Create template fix</>}
              </button>
            )}
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
  const [tasks,      setTasks]      = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<'overview'|'tasks'>('overview');
  const [executing,  setExecuting]  = useState<string | null>(null);
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [brief,      setBrief]      = useState<{ subject: string; body: string } | null>(null);
  const [briefFor,   setBriefFor]   = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);

  const loadTasks = () => {
    setLoading(true);
    callApi('dev_get_tasks', { pageId: page.id }).then(r => {
      if (r.ok) setTasks((r.data as any).tasks || []);
      setLoading(false);
    });
  };

  useEffect(() => { loadTasks(); }, [page.id]);

  const executeTask = async (taskId: string) => {
    setExecuting(taskId);
    await callApi('dev_execute_task', { taskId }, 90000);
    setExecuting(null);
    loadTasks();
  };

  const markApplied = async (taskId: string) => {
    await callApi('dev_update_task', { taskId, updates: { status: 'applied', backup_confirmed: true } });
    loadTasks();
  };

  const markDone = async (taskId: string) => {
    await callApi('dev_update_task', { taskId, updates: { status: 'done' } });
    loadTasks();
  };

  const getBrief = async (task: any) => {
    setBriefFor(task.id);
    setBrief(null);
    const r = await callApi('dev_client_brief', { taskId: task.id, projectId: page.project_id }, 25000);
    if (r.ok && (r.data as any)?.body) {
      setBrief({ subject: (r.data as any).subject, body: (r.data as any).body });
    }
    setBriefFor(null);
  };

  const domain = page.url.replace(/^https?:\/\//, '').split('/')[0];
  const path   = page.url.replace(/^https?:\/\/[^/]+/, '') || '/';
  const pending = tasks.filter(t => t.status === 'pending' || t.status === 'failed').length;
  const ready   = tasks.filter(t => t.status === 'fix_ready').length;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-card border-l border-border h-full flex flex-col overflow-hidden shadow-2xl">

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
          {[
            ['overview', 'Overview', null],
            ['tasks',    'Tasks',    tasks.length > 0 ? tasks.length : null],
          ].map(([id, label, badge]) => (
            <button key={id as string} type="button" onClick={() => setTab(id as any)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {label}
              {badge !== null && <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${tab === id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>{badge}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'overview' && (
            <div className="p-5 space-y-4">
              {page.baseline_captured_at ? (
                <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-3">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Baseline · {new Date(page.baseline_captured_at).toLocaleDateString()}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'PageSpeed',  value: page.baseline_score !== null ? String(page.baseline_score) : '—', color: page.baseline_score !== null ? (page.baseline_score >= 70 ? 'text-emerald-400' : page.baseline_score >= 50 ? 'text-amber-400' : 'text-red-400') : 'text-muted-foreground' },
                      { label: 'Mobile LCP', value: page.baseline_lcp_ms ? (page.baseline_lcp_ms/1000).toFixed(1)+'s' : '—', color: page.baseline_lcp_ms ? (page.baseline_lcp_ms <= 2500 ? 'text-emerald-400' : page.baseline_lcp_ms <= 4000 ? 'text-amber-400' : 'text-red-400') : 'text-muted-foreground' },
                      { label: 'GSC Clicks', value: page.baseline_gsc_clicks !== null ? page.baseline_gsc_clicks.toLocaleString() : '—', color: 'text-foreground' },
                    ].map(m => (
                      <div key={m.label} className="rounded-xl border border-border bg-background/60 px-3 py-2.5 text-center">
                        <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-400">
                  No baseline yet — capture PageSpeed and GSC metrics in the Baseline tab before making any changes.
                </div>
              )}
              <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-2.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Page info</div>
                {[
                  ['Status',   STATUS_CONFIG[page.status]?.label || page.status],
                  ['Type',     page.page_type],
                  ['Priority', String(page.priority)],
                  ['Imported', new Date(page.created_at).toLocaleDateString()],
                ].map(([k,v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{k}</span>
                    <span className="text-xs font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'tasks' && (
            <div className="p-5 space-y-3">
              {loading ? (
                <div className="py-8 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>
              ) : tasks.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <div className="text-sm text-muted-foreground">No tasks yet</div>
                  <div className="text-xs text-muted-foreground/60">Run an audit on this page from the Audit Queue tab</div>
                </div>
              ) : (
                <>
                  {/* Summary action bar */}
                  {(pending > 0 || ready > 0) && (
                    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-muted/30 border border-border text-xs text-muted-foreground">
                      {pending > 0 && <span>{pending} pending</span>}
                      {ready > 0 && <span className="text-violet-400">{ready} fix ready</span>}
                      {executing && <span className="flex items-center gap-1.5 ml-auto text-primary"><Loader2 className="w-3 h-3 animate-spin" />Generating fix…</span>}
                    </div>
                  )}

                  {tasks.map((t: any) => {
                    const isExpanded = expanded === t.id;
                    const isRunning  = executing === t.id;
                    const sev = t.severity === 'critical' || t.severity === 'red';
                    return (
                      <div key={t.id} className={`rounded-2xl border transition-all ${sev ? 'border-red-500/20 bg-red-500/3' : 'border-amber-500/15 bg-card/30'}`}>
                        {/* Task header */}
                        <button type="button" onClick={() => setExpanded(isExpanded ? null : t.id)}
                          className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/10 transition-colors rounded-2xl">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 mt-0.5 ${sev ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                            {t.severity?.toUpperCase()}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold">{t.title}</div>
                            {!isExpanded && t.analysis && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{t.analysis}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[t.status]?.bg || 'bg-muted/40'} ${STATUS_CONFIG[t.status]?.color || 'text-muted-foreground'}`}>
                              {isRunning ? 'Generating…' : STATUS_CONFIG[t.status]?.label || t.status}
                            </span>
                            <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                            {t.analysis && (
                              <p className="text-xs leading-relaxed text-foreground/80">{t.analysis}</p>
                            )}

                            {t.fix_code && (
                              <div className="rounded-xl border border-border bg-background/60 overflow-hidden">
                                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/20">
                                  <span className="text-[10px] font-mono text-muted-foreground">{t.fix_language || 'code'}</span>
                                  <button type="button" onClick={() => { navigator.clipboard.writeText(t.fix_code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                                    {copied ? '✓ Copied' : 'Copy'}
                                  </button>
                                </div>
                                <pre className="text-[10px] p-3 overflow-x-auto max-h-48 font-mono leading-relaxed text-foreground/80">{t.fix_code}</pre>
                              </div>
                            )}

                            {t.apply_instructions && (
                              <div className="text-[10px] leading-relaxed text-muted-foreground bg-muted/20 rounded-xl p-3">
                                {t.apply_instructions.slice(0, 400)}{t.apply_instructions.length > 400 ? '…' : ''}
                              </div>
                            )}

                            {/* Client brief */}
                            {briefFor === t.id && (
                              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                                <div className="flex items-center gap-2 text-xs text-amber-400">
                                  <Loader2 className="w-3 h-3 animate-spin" />Drafting brief…
                                </div>
                              </div>
                            )}
                            {brief && briefFor === null && expanded === t.id && (
                              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                                <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Client Brief</div>
                                <div className="text-[10px] font-medium">{brief.subject}</div>
                                <div className="text-[10px] text-muted-foreground leading-relaxed line-clamp-4">{brief.body}</div>
                                <button type="button"
                                  onClick={() => { navigator.clipboard.writeText('Subject: ' + brief.subject + '\n\n' + brief.body); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                                  className={`text-[10px] px-3 py-1.5 rounded-lg border font-medium transition-all ${copied ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'}`}>
                                  {copied ? '✓ Copied' : 'Copy full email'}
                                </button>
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2">
                              {(t.status === 'pending' || t.status === 'failed') && (
                                <button type="button" onClick={() => executeTask(t.id)} disabled={!!executing}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 hover:bg-primary/90 transition-all">
                                  {isRunning ? <><Loader2 className="w-3 h-3 animate-spin" />Generating…</> : <><Zap className="w-3 h-3" />Generate fix</>}
                                </button>
                              )}
                              {t.status === 'fix_ready' && (
                                <>
                                  <button type="button" onClick={() => markApplied(t.id)}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/30 transition-all">
                                    <CheckCircle className="w-3 h-3" />I applied this
                                  </button>
                                  <button type="button" onClick={() => executeTask(t.id)} disabled={!!executing}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all">
                                    <RefreshCw className="w-3 h-3" />Regenerate
                                  </button>
                                  <button type="button" onClick={() => { setBrief(null); getBrief(t); }}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-500/10 transition-all">
                                    📋 Client brief
                                  </button>
                                </>
                              )}
                              {t.status === 'applied' && (
                                <button type="button" onClick={() => markDone(t.id)}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500/15 border border-violet-500/25 text-violet-400 text-xs font-semibold hover:bg-violet-500/25 transition-all">
                                  <CheckCircle className="w-3 h-3" />Mark done
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// LINK PROJECT MODAL
// ─────────────────────────────────────────────────────────────
function LinkProjectModal({ siteId, onClose, onLinked }: { siteId: string; onClose: () => void; onLinked: () => void }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState('');

  useEffect(() => {
    fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_projects' }) })
      .then(r => r.json()).then(d => setProjects(d.projects || [])).catch(() => {});
  }, []);

  const link = async () => {
    if (!selected) { setErr('Select a project'); return; }
    setSaving(true);
    const r = await callApi('site_update', { siteId, updates: { project_id: selected } });
    setSaving(false);
    if (!r.ok) { setErr(r.error || 'Failed'); return; }
    onLinked();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Link to project</div>
            <div className="text-xs text-muted-foreground mt-0.5">Unlocks GSC data and client name on briefs</div>
          </div>
          <button type="button" onClick={onClose} className="w-6 h-6 rounded-lg hover:bg-muted/60 flex items-center justify-center text-muted-foreground text-xs">✕</button>
        </div>
        <select value={selected} onChange={e => setSelected(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary/60">
          <option value="">Select project…</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {err && <div className="text-xs text-red-400">{err}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground">Cancel</button>
          <button type="button" onClick={link} disabled={saving || !selected}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40">
            {saving ? 'Linking…' : 'Link project'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RESULTS DASHBOARD
// ─────────────────────────────────────────────────────────────
function ResultsDashboard({ pages, siteId }: { pages: DevPage[]; siteId: string }) {
  const withBaseline = pages.filter(p => p.baseline_captured_at);
  const withScore    = pages.filter(p => p.baseline_score !== null && p.current_score !== null);
  const withLcp      = pages.filter(p => p.baseline_lcp_ms  !== null && p.current_lcp_ms  !== null);

  const avgBaseline  = (arr: DevPage[], key: keyof DevPage) => {
    const vals = arr.map(p => p[key] as number).filter(v => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const baselineScore = avgBaseline(pages.filter(p => p.baseline_score !== null), 'baseline_score');
  const currentScore  = avgBaseline(pages.filter(p => p.current_score  !== null), 'current_score');
  const baselineLcp   = avgBaseline(pages.filter(p => p.baseline_lcp_ms !== null), 'baseline_lcp_ms');
  const currentLcp    = avgBaseline(pages.filter(p => p.current_lcp_ms  !== null), 'current_lcp_ms');

  const totalRedBefore  = pages.reduce((s, p) => s + (p.issues_red   || 0), 0);
  const totalGscBefore  = pages.reduce((s, p) => s + (p.baseline_gsc_clicks || 0), 0);

  const donePages = pages.filter(p => p.status === 'done');
  const tasksDone = donePages.length;

  if (withBaseline.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-8 text-center space-y-3">
        <div className="text-4xl">📊</div>
        <div className="text-sm font-semibold">No baseline data yet</div>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Capture baseline metrics before any fixes are applied. This records the starting point so you can prove improvement to your client.
        </p>
      </div>
    );
  }

  const metrics = [
    {
      label:    'Avg PageSpeed Score',
      before:   baselineScore !== null ? Math.round(baselineScore) + '/100' : '—',
      after:    currentScore  !== null ? Math.round(currentScore)  + '/100' : 'Not updated',
      delta:    baselineScore !== null && currentScore !== null ? Math.round(currentScore - baselineScore) : null,
      unit:     'pts',
      positive: true,
    },
    {
      label:    'Avg Mobile LCP',
      before:   baselineLcp !== null ? (baselineLcp/1000).toFixed(1) + 's' : '—',
      after:    currentLcp  !== null ? (currentLcp/1000).toFixed(1)  + 's' : 'Not updated',
      delta:    baselineLcp !== null && currentLcp !== null ? parseFloat(((baselineLcp - currentLcp)/1000).toFixed(1)) : null,
      unit:     's faster',
      positive: true,
    },
    {
      label:    'Total critical issues',
      before:   String(totalRedBefore),
      after:    String(pages.reduce((s, p) => s + (p.issues_red || 0), 0)),
      delta:    null,
      unit:     '',
      positive: true,
    },
    {
      label:    'GSC Clicks (baseline)',
      before:   totalGscBefore > 0 ? totalGscBefore.toLocaleString() + '/mo' : '—',
      after:    'Live in GSC',
      delta:    null,
      unit:     '',
      positive: true,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Results Summary</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Baseline captured for {withBaseline.length} of {pages.length} pages
            {donePages.length > 0 && ` · ${donePages.length} pages with completed fixes`}
          </p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="rounded-2xl border border-border bg-card/40 p-4 space-y-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{m.label}</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-muted/30 px-3 py-2 text-center">
                <div className="text-xs text-muted-foreground mb-1">Before</div>
                <div className="text-base font-bold text-red-400/80">{m.before}</div>
              </div>
              <div className="rounded-xl bg-muted/30 px-3 py-2 text-center">
                <div className="text-xs text-muted-foreground mb-1">After</div>
                <div className={`text-base font-bold ${m.after.includes('Not') || m.after === 'Live in GSC' ? 'text-muted-foreground' : 'text-emerald-400'}`}>{m.after}</div>
              </div>
            </div>
            {m.delta !== null && m.delta !== 0 && (
              <div className={`text-center text-xs font-semibold ${m.delta > 0 === m.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                {m.delta > 0 ? '+' : ''}{m.delta} {m.unit}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Per-page breakdown */}
      <div className="rounded-2xl border border-border bg-card/30 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="text-xs font-semibold">Per-page breakdown</div>
        </div>
        <div className="divide-y divide-border/50">
          {pages.filter(p => p.baseline_captured_at).map(p => {
            const scoreDelta = p.baseline_score !== null && p.current_score !== null
              ? p.current_score - p.baseline_score : null;
            const lcpDelta = p.baseline_lcp_ms !== null && p.current_lcp_ms !== null
              ? (p.baseline_lcp_ms - p.current_lcp_ms) / 1000 : null;
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{STATUS_CONFIG[p.status]?.label || p.status}</div>
                </div>
                <div className="flex items-center gap-4 text-xs tabular-nums shrink-0">
                  {p.baseline_score !== null && (
                    <div className="text-center">
                      <div className="text-[9px] text-muted-foreground">Score</div>
                      <div className={p.current_score !== null ? (scoreDelta! > 0 ? 'text-emerald-400 font-bold' : 'text-muted-foreground') : ''}>
                        {p.baseline_score}{p.current_score !== null ? ` → ${p.current_score}` : ''}
                      </div>
                    </div>
                  )}
                  {p.baseline_lcp_ms !== null && (
                    <div className="text-center">
                      <div className="text-[9px] text-muted-foreground">LCP</div>
                      <div className={p.current_lcp_ms !== null ? (lcpDelta! > 0 ? 'text-emerald-400 font-bold' : 'text-muted-foreground') : ''}>
                        {(p.baseline_lcp_ms/1000).toFixed(1)}s{p.current_lcp_ms !== null ? ` → ${(p.current_lcp_ms/1000).toFixed(1)}s` : ''}
                      </div>
                    </div>
                  )}
                  {p.baseline_gsc_clicks !== null && (
                    <div className="text-center">
                      <div className="text-[9px] text-muted-foreground">Clicks</div>
                      <div>{p.baseline_gsc_clicks.toLocaleString()}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BULK BRIEF
// ─────────────────────────────────────────────────────────────
function BulkBrief({ pages, site, siteId }: { pages: DevPage[]; site: DevSite | null; siteId: string }) {
  const [scope,   setScope]   = useState<'page'|'site'>('site');
  const [pageId,  setPageId]  = useState('');
  const [brief,   setBrief]   = useState<{ subject: string; body: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied,  setCopied]  = useState(false);
  const [err,     setErr]     = useState('');

  const audited = pages.filter(p => p.issues_red > 0 || p.issues_amber > 0);

  const generate = async () => {
    setLoading(true); setBrief(null); setErr('');

    const nl = '\n';
    const domain = site?.domain || site?.label || 'your website';

    if (scope === 'site') {
      // Site-wide brief — executive summary of all issues across all pages
      const totalRed   = pages.reduce((s,p) => s + p.issues_red,   0);
      const totalAmber = pages.reduce((s,p) => s + p.issues_amber, 0);
      const topPages   = [...pages].sort((a,b) => b.issues_red - a.issues_red).slice(0,5);

      const lines = [
        '[APPROVAL REQUIRED] SEO Technical Audit — ' + domain,
        '',
        '━━ AUDIT SUMMARY ━━',
        '',
        'We have completed a technical SEO audit across ' + pages.length + ' pages of ' + domain + '.',
        '',
        'Findings:',
        '  Critical issues: ' + totalRed   + ' (across ' + pages.filter(p => p.issues_red   > 0).length + ' pages)',
        '  Warnings:        ' + totalAmber + ' (across ' + pages.filter(p => p.issues_amber > 0).length + ' pages)',
        '',
        'Top priority pages:',
        ...topPages.map(p => '  · ' + (p.url.replace(/^https?:\/\/[^/]+/,'') || '/') + ' — ' + p.issues_red + ' critical, ' + p.issues_amber + ' warnings'),
        '',
        '━━ WHAT WE ARE REQUESTING APPROVAL TO FIX ━━',
        '',
        'We will address these issues in priority order, starting with the highest-traffic pages.',
        'Each fix will be reviewed and confirmed with you before going live.',
        '',
        'Types of changes:',
        '  • Performance fixes (script defer, lazy loading) — invisible to visitors, improves load speed',
        '  • Structured data (schema markup) — invisible to visitors, improves Google eligibility',
        '  • On-page content (H1, meta descriptions) — we will share exact proposed text for your approval',
        '',
        '━━ WHAT WILL NOT CHANGE ━━',
        '',
        '  • Your page design and visual layout',
        '  • Your existing content and branding',
        '  • Your site will not go offline at any point',
        '',
        '━━ OUR COMMITMENT ━━',
        '',
        '  • We will not make any change without your explicit approval',
        '  • Baseline metrics have been captured — you will see before/after comparison for every fix',
        '  • All changes are reversible',
        '',
        '━━ TO APPROVE ━━',
        '',
        'Please reply YES to authorise us to begin. We will provide a detailed brief for each individual change before we apply it.',
        '',
        'Best regards',
      ];
      setBrief({
        subject: '[Approval Required] SEO Technical Audit — ' + domain + ' · ' + pages.length + ' pages · ' + totalRed + ' critical issues',
        body:    lines.join(nl),
      });
    } else {
      // Per-page brief — use existing dev_client_brief for one page's tasks
      if (!pageId) { setErr('Select a page'); setLoading(false); return; }
      const page = pages.find(p => p.id === pageId);
      if (!page) { setErr('Page not found'); setLoading(false); return; }

      // Build brief from page data directly (instant — no AI call)
      const nl2 = '\n';
      const path = page.url.replace(/^https?:\/\/[^/]+/, '') || '/';
      const lines = [
        'We are requesting your approval to fix ' + page.issues_red + ' critical and ' + page.issues_amber + ' warning issues on:',
        page.url,
        '',
        '━━ CURRENT PAGE HEALTH ━━',
        '',
        page.baseline_score    !== null ? 'PageSpeed score:    ' + page.baseline_score + '/100' : '',
        page.baseline_lcp_ms   !== null ? 'Mobile LCP:         ' + (page.baseline_lcp_ms/1000).toFixed(1) + 's (target: under 2.5s)' : '',
        page.baseline_gsc_clicks !== null ? 'Monthly GSC clicks: ' + page.baseline_gsc_clicks.toLocaleString() : '',
        '',
        '━━ ISSUES TO FIX ━━',
        '',
        page.issues_red   > 0 ? page.issues_red   + ' critical issues are directly harming performance and rankings' : '',
        page.issues_amber > 0 ? page.issues_amber + ' warnings are reducing SEO performance' : '',
        '',
        '━━ APPROVAL ━━',
        '',
        'Please reply YES to approve. We will share the exact code change for each fix before applying.',
        '',
        'Best regards',
      ].filter(s => s !== '');
      setBrief({
        subject: '[Approval Required] ' + page.issues_red + ' critical issues — ' + page.url.replace(/^https?:\/\/[^/]+/, '') + ' · ' + domain,
        body:    lines.join(nl2),
      });
    }

    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Bulk Client Brief</div>
        <div className="text-xs text-muted-foreground mt-0.5">Generate a professional approval request covering multiple fixes at once</div>
      </div>

      {/* Scope selector */}
      <div className="flex gap-2 p-1 bg-muted/30 rounded-xl">
        {([['site','🌐 Whole site'],['page','📄 One page']] as const).map(([s,l]) => (
          <button key={s} type="button" onClick={() => setScope(s)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${scope === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {l}
          </button>
        ))}
      </div>

      {scope === 'page' && (
        <select value={pageId} onChange={e => setPageId(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-primary/60">
          <option value="">Select page…</option>
          {audited.map(p => (
            <option key={p.id} value={p.id}>
              {p.url.replace(/^https?:\/\/[^/]+/, '') || '/'} — {p.issues_red}🔴 {p.issues_amber}🟡
            </option>
          ))}
        </select>
      )}

      {scope === 'site' && (
        <div className="rounded-xl bg-muted/20 border border-border px-4 py-3 text-xs text-muted-foreground">
          Site-wide brief covers all {pages.length} pages · {pages.reduce((s,p) => s+p.issues_red,0)} total critical issues.
          Structured as an executive summary — client approves the engagement, then individual fixes get their own brief.
        </div>
      )}

      {err && <div className="text-xs text-red-400">{err}</div>}

      <button type="button" onClick={generate} disabled={loading}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-all shadow-[0_0_16px_hsl(var(--primary)/0.2)]">
        {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</span> : 'Generate brief'}
      </button>

      {brief && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-background/60 px-4 py-3 flex items-center gap-3">
            <span className="text-xs flex-1 font-medium">{brief.subject}</span>
            <button type="button" onClick={() => navigator.clipboard.writeText(brief.subject)}
              className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border transition-colors shrink-0">
              Copy
            </button>
          </div>
          <div className="rounded-xl border border-border bg-background/60 p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 max-h-80 overflow-y-auto">
            {brief.body}
          </div>
          <button type="button"
            onClick={() => {
              navigator.clipboard.writeText('Subject: ' + brief.subject + '\n\n' + brief.body);
              setCopied(true); setTimeout(() => setCopied(false), 2500);
            }}
            className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${copied ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-primary text-primary-foreground hover:bg-primary/90'} shadow-[0_0_16px_hsl(var(--primary)/0.15)]`}>
            {copied ? '✓ Copied to clipboard' : 'Copy full email (subject + body)'}
          </button>
        </div>
      )}
    </div>
  );
}



// ─────────────────────────────────────────────────────────────
// LINK OBJECTIVE SECTION — connects site workspace to a campaign objective
// ─────────────────────────────────────────────────────────────
function LinkObjectiveSection({ siteId, projectId: initialProjectId, onUpdated }: { siteId: string; projectId: string | null; onUpdated: () => void }) {
  const [objectives,   setObjectives]   = useState<any[]>([]);
  const [projects,     setProjects]     = useState<any[]>([]);
  const [selProjectId, setSelProjectId] = useState<string>(initialProjectId || '');
  const [linked,       setLinked]       = useState<any | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [showPicker,   setShowPicker]   = useState(false);

  // Load projects on mount so user can pick one even without workspace project link
  useEffect(() => {
    fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_projects' }) })
      .then(r => r.json()).then(d => setProjects(d.projects || [])).catch(() => {});
  }, []);

  // Load objectives when project is selected
  useEffect(() => {
    if (!selProjectId) { setObjectives([]); setLinked(null); return; }
    setLoading(true);
    fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bs_seo_campaign_list', projectId: selProjectId }) })
      .then(r => r.json()).then(r => {
        const all = r.campaigns || [];
        const objs = all.filter((c: any) => c.campaign_type && c.campaign_type !== 'keyword_ranking');
        setObjectives(objs);
        setLinked(objs.find((c: any) => c.site_id === siteId) || null);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [siteId, selProjectId]);

  const linkTo = async (campaignId: string) => {
    setSaving(true);
    // Unlink from previous objective if any
    if (linked) {
      await fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bs_campaign_objective_update', campaignId: linked.id, updates: { site_id: null } }) });
    }
    // Link to new objective
    await fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bs_campaign_objective_update', campaignId, updates: { site_id: siteId } }) });
    const newLinked = objectives.find(o => o.id === campaignId) || null;
    setLinked(newLinked);
    setSaving(false);
    setShowPicker(false);
    onUpdated();
  };

  const unlink = async () => {
    if (!linked) return;
    setSaving(true);
    await fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bs_campaign_objective_update', campaignId: linked.id, updates: { site_id: null } }) });
    setLinked(null);
    setSaving(false);
    onUpdated();
  };

  const TYPE_ICONS: Record<string, string> = {
    traffic_growth: '📈', local_visibility: '📍', domain_authority: '🔗',
    technical_recovery: '⚙️', content_authority: '✍️', eeat: '🎓', keyword_ranking: '🏆',
  };

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center text-lg flex-shrink-0">🎯</div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Campaign Objective</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Link this site workspace to an objective so fixes here count toward your campaign goal.
          </p>
        </div>
      </div>

      {/* Project selector — always shown so user doesn't need to link workspace first */}
      {projects.length > 0 && (
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Project</label>
          <select value={selProjectId} onChange={e => setSelProjectId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs focus:outline-none focus:border-primary/50">
            <option value="">Select a project…</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {loading && <div className="text-xs text-muted-foreground">Loading objectives…</div>}

      {linked ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
          <span className="text-lg">{TYPE_ICONS[linked.campaign_type] || '🎯'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold truncate">{linked.goal || linked.keyword}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">{linked.campaign_type?.replace(/_/g,' ')}</div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => setShowPicker(true)}
              className="text-[10px] px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
              Change
            </button>
            <button type="button" onClick={unlink} disabled={saving}
              className="text-[10px] px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-red-400 transition-colors">
              Unlink
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowPicker(true)}
          disabled={objectives.length === 0 || !selProjectId}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40 transition-all">
          <Plus className="w-3.5 h-3.5" />
          {!selProjectId ? 'Select a project above first' : objectives.length === 0 ? 'No objectives yet — create one in SEO Campaigns' : 'Link to an objective'}
        </button>
      )}

      {showPicker && (
        <div className="rounded-xl border border-border bg-background/80 overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Select objective
          </div>
          <div className="divide-y divide-border/50 max-h-48 overflow-y-auto">
            {objectives.map(o => (
              <button key={o.id} type="button" onClick={() => linkTo(o.id)} disabled={saving}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left">
                <span className="text-base">{TYPE_ICONS[o.campaign_type] || '🎯'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{o.goal || o.keyword}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">{o.campaign_type?.replace(/_/g,' ')}</div>
                </div>
                {o.site_id === siteId && <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />}
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-border">
            <button type="button" onClick={() => setShowPicker(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SITE SETTINGS — GSC + PSI direct connection, no project needed
// ─────────────────────────────────────────────────────────────
function SiteSettings({ site, siteId, onUpdated }: { site: DevSite; siteId: string; onUpdated: () => void }) {
  const [gscStatus,     setGscStatus]     = useState<{ connected: boolean; resourceId?: string } | null>(null);
  const [properties,    setProperties]    = useState<{ url: string; perm: string }[]>([]);
  const [loadingProps,  setLoadingProps]  = useState(false);
  const [connecting,    setConnecting]    = useState(false);

  const [err,           setErr]           = useState('');

  // Load GSC status on mount
  useEffect(() => {
    callApi('site_gsc_status', { siteId }).then(r => {
      if (r.ok) setGscStatus({ connected: (r.data as any).connected, resourceId: (r.data as any).resourceId });
    });

    // Listen for OAuth popup completion
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'gsc_connected' && e.data?.siteId === siteId) {
        setGscStatus(s => ({ ...s!, connected: true }));
        loadProperties();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [siteId]);

  const connectGsc = async () => {
    setConnecting(true); setErr('');
    const r = await callApi('site_gsc_oauth_start', { siteId });
    setConnecting(false);
    if (!r.ok || !(r.data as any)?.url) { setErr((r.data as any)?.error || r.error || 'OAuth failed'); return; }
    const popup = window.open((r.data as any).url, '_blank', 'width=500,height=620,left=300,top=100');
    if (!popup) setErr('Pop-up blocked. Allow pop-ups for this site and try again.');
  };

  const loadProperties = async () => {
    setLoadingProps(true);
    const r = await callApi('site_gsc_list_properties', { siteId });
    setLoadingProps(false);
    if (r.ok) setProperties((r.data as any).sites || []);
  };

  const selectProperty = async (url: string) => {
    await callApi('site_gsc_select_property', { siteId, siteUrl: url });
    setGscStatus(s => ({ ...s!, resourceId: url }));
    onUpdated();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold">Site Workspace Settings</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Connect data sources directly to this workspace — no project required.
        </p>
      </div>

      {/* GSC */}
      <div className={`rounded-2xl border p-5 space-y-4 ${gscStatus?.connected ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border bg-card/40'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${gscStatus?.connected ? 'bg-emerald-500/15' : 'bg-muted/30'}`}>
              🔍
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Google Search Console</span>
                {gscStatus?.connected && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">Connected ✓</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Clicks, impressions, and positions per URL. Used for baseline capture and impact scoring.
              </p>
              {gscStatus?.resourceId && (
                <p className="text-[10px] text-emerald-400 mt-1">Property: {gscStatus.resourceId}</p>
              )}
            </div>
          </div>
          {!gscStatus?.connected ? (
            <button type="button" onClick={connectGsc} disabled={connecting}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-40 transition-all">
              {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
              Connect GSC
            </button>
          ) : !gscStatus?.resourceId && (
            <button type="button" onClick={loadProperties} disabled={loadingProps}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/15 disabled:opacity-40 transition-all">
              {loadingProps ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Select property
            </button>
          )}
        </div>

        {/* Property selector */}
        {properties.length > 0 && !gscStatus?.resourceId && (
          <div className="rounded-xl border border-border bg-background/60 overflow-hidden">
            <div className="px-3 py-2 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Select Search Console property
            </div>
            <div className="divide-y divide-border/50 max-h-48 overflow-y-auto">
              {properties.map(p => (
                <button key={p.url} type="button" onClick={() => selectProperty(p.url)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left">
                  <span className="text-xs flex-1 truncate">{p.url}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{p.perm}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>

      {/* PageSpeed uses platform-wide key — no per-site config needed */}
      {/* Link to Campaign Objective */}
      <LinkObjectiveSection siteId={siteId} projectId={site.project_id} onUpdated={onUpdated} />

      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        Once GSC is connected and a property selected, baseline capture will include real organic traffic data per URL.
        Run baseline again on any pages that show null GSC values.
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
