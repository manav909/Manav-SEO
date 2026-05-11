import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  Brain, Globe, RefreshCw, Loader2, CheckCircle, XCircle, AlertTriangle,
  Zap, BookOpen, Search, Download, Star, TrendingUp, Shield, Target,
  Eye, ArrowRight, ExternalLink, Database, CheckCircle2, X, Award,
  Sparkles, Clock, ChevronDown, ChevronRight, RotateCw, Play,
  Plus, Flame, Lightbulb,
} from 'lucide-react';
import PortalNav from '@/components/PortalNav';
import { toast } from '@/hooks/use-toast';

type Tab = 'catalog' | 'library' | 'practices' | 'audit';

interface SavedItem {
  id:              string;
  engine:          string;
  category:        string;
  title:           string;
  summary:         string;
  what_changed?:   string;
  impact_level:    string;
  best_practices:  any[];
  ranking_factors: any[];
  checklist_items: any[];
  source_url?:     string;
  source_name?:    string;
  published_date?: string;
  tags:            string[];
  updated_at?:     string;
}

interface CatalogTopic {
  id:        string;
  engine:    string;
  category:  string;
  label:     string;
  source:    string;
  group:     string;
  added?:    string;
  weight:    number;
  saved_id:  string | null;
  saved_at:  string | null;
  is_stale:  boolean;
  is_custom: boolean;
}

const ENGINE_BADGE: Record<string, string> = {
  google:     "bg-blue-500/10 border-blue-500/25 text-blue-400",
  bing:       "bg-cyan-500/10 border-cyan-500/25 text-cyan-400",
  perplexity: "bg-purple-500/10 border-purple-500/25 text-purple-400",
  chatgpt:    "bg-green-500/10 border-green-500/25 text-green-400",
  gemini:     "bg-red-500/10 border-red-500/25 text-red-400",
  general:    "bg-secondary border-border text-muted-foreground",
};

const ENGINE_LABEL: Record<string, string> = {
  google: "Google", bing: "Bing", perplexity: "Perplexity",
  chatgpt: "ChatGPT", gemini: "Gemini", general: "General",
};

const IMPACT_STYLE: Record<string, string> = {
  critical: "border-red-400/40 bg-red-400/8 text-red-400",
  high:     "border-orange-400/35 bg-orange-400/8 text-orange-400",
  medium:   "border-yellow-400/35 bg-yellow-400/8 text-yellow-400",
  low:      "border-border bg-secondary/40 text-muted-foreground",
};

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function AlgorithmIntel() {
  const { clients, projects } = useAuth();
  const [tab, setTab]         = useState<Tab>('catalog');
  const [selProjId, setSelProjId] = useState('');

  const selProj = projects.find(p => p.id === selProjId);
  const client  = clients.find(c => c.id === selProj?.client_id);

  // Catalog state
  const [catalog,      setCatalog]      = useState<CatalogTopic[]>([]);
  const [catLoading,   setCatLoading]   = useState(false);
  const [fetching,     setFetching]     = useState<Record<string, boolean>>({});
  const [preview,      setPreview]      = useState<Record<string, any>>({});
  const [expanded,     setExpanded]     = useState<Record<string, boolean>>({});

  // Library state
  const [library,      setLibrary]      = useState<SavedItem[]>([]);
  const [libLoading,   setLibLoading]   = useState(false);
  const [search,       setSearch]       = useState('');
  const [filterEngine, setFilterEngine] = useState('');

  // Best Practices tab state
  const [practicesCat,  setPracticesCat]  = useState('');
  const [checkedItems,  setCheckedItems]  = useState<Record<string,boolean>>({});

  // Scan / custom topic state
  const [scanning,      setScanning]      = useState(false);
  const [scanResults,   setScanResults]   = useState<any[]>([]);
  const [showScan,      setShowScan]      = useState(false);
  const [addingRow,     setAddingRow]     = useState(-1);   // index of scan row being added
  const [customLabel,   setCustomLabel]   = useState('');
  const [customEngine,  setCustomEngine]  = useState('google');
  const [addingCustom,  setAddingCustom]  = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);
  // Per-topic saving state (prevents double-save)
  const [saving,        setSaving]        = useState<Record<string, boolean>>({});

  // Audit state
  const [auditUrl,     setAuditUrl]     = useState('');
  const [auditEngine,  setAuditEngine]  = useState('google');
  const [auditing,     setAuditing]     = useState(false);
  const [auditStep,    setAuditStep]    = useState('');
  const [auditResult,  setAuditResult]  = useState<any>(null);

  // ─────────────────────────────────────────────────────────────────
  // API helper — reads text, parses JSON, throws with readable message
  // ─────────────────────────────────────────────────────────────────
  const apiFetch = async (body: object): Promise<any> => {
    const res  = await fetch('/api/algorithm-intel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { throw new Error(text.slice(0, 150) || `HTTP ${res.status}`); }
  };

  // ─────────────────────────────────────────────────────────────────
  // Load catalog (DB-only, no Claude call)
  // ─────────────────────────────────────────────────────────────────
  const loadCatalog = useCallback(async () => {
    setCatLoading(true);
    try {
      const data = await apiFetch({ action: 'get_catalog' });
      if (data.success) setCatalog(data.catalog);
      else toast({ title: 'Catalog load failed', description: data.error, variant: 'destructive' });
    } catch (e: any) {
      toast({ title: 'Catalog load error', description: e.message, variant: 'destructive' });
    }
    setCatLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────
  // Load library (direct Supabase read)
  // ─────────────────────────────────────────────────────────────────
  const loadLibrary = useCallback(async () => {
    setLibLoading(true);
    try {
      const { data, error } = await supabase
        .from('algorithm_knowledge').select('*').order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      setLibrary((data as SavedItem[]) || []);
    } catch (e: any) {
      toast({ title: 'Library load error', description: e.message, variant: 'destructive' });
    }
    setLibLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadCatalog(); loadLibrary(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────
  // Fetch a single topic from the catalog
  // Returns the item directly so callers don't depend on async state.
  // Sets preview state for the manual Review → Save flow.
  // ─────────────────────────────────────────────────────────────────
  const fetchTopic = async (topicId: string): Promise<any | null> => {
    setFetching(f => ({ ...f, [topicId]: true }));
    let item: any = null;
    try {
      const data = await apiFetch({ action: 'fetch_topic', topic_id: topicId });
      if (data.success && data.item) {
        item = data.item;
        // Store in preview state for the manual Review → Save flow
        setPreview(p => ({ ...p, [topicId]: item }));
        setExpanded(e => ({ ...e, [topicId]: true }));
        toast({ title: `Fetched: ${data.topic?.label || topicId}`, description: 'Review below and save to your library.' });
      } else {
        toast({ title: 'Fetch failed', description: data.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Fetch error', description: e.message, variant: 'destructive' });
    }
    setFetching(f => ({ ...f, [topicId]: false }));
    return item; // caller gets item directly — no state closure trap
  };

  // ─────────────────────────────────────────────────────────────────
  // Save a single item to the database
  // Accepts the item directly — no state dependency.
  // ─────────────────────────────────────────────────────────────────
  const saveItem = async (item: any, topicId: string): Promise<boolean> => {
    setSaving(s => ({ ...s, [topicId]: true }));
    let success = false;
    try {
      const data = await apiFetch({ action: 'save_item', item, topic_id: topicId });
      if (data.success) {
        success = true;
        toast({ title: 'Saved', description: item.title });
        // Remove from preview — no longer needs review
        setPreview(p => { const n = { ...p }; delete n[topicId]; return n; });
        setExpanded(e => { const n = { ...e }; delete n[topicId]; return n; });
        await Promise.all([loadCatalog(), loadLibrary()]);
      } else {
        toast({ title: 'Save failed', description: data.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Save error', description: e.message, variant: 'destructive' });
    }
    setSaving(s => ({ ...s, [topicId]: false }));
    return success;
  };

  // ─────────────────────────────────────────────────────────────────
  // Fetch all unsaved / stale topics sequentially and auto-save each.
  // Uses the return value of fetchTopic() — never reads stale state.
  // ─────────────────────────────────────────────────────────────────
  const fetchAllNew = async () => {
    const toFetch = catalog.filter(t => !t.saved_id || t.is_stale);
    if (!toFetch.length) {
      toast({ title: 'All topics up to date' });
      return;
    }
    toast({ title: `Fetching ${toFetch.length} topic${toFetch.length !== 1 ? 's' : ''} sequentially…` });
    let done = 0;
    for (const topic of toFetch) {
      toast({ title: `(${done + 1}/${toFetch.length}) Fetching: ${topic.label}` });
      const item = await fetchTopic(topic.id); // returns item directly, no state lag
      if (item) {
        await saveItem(item, topic.id);
        done++;
      }
    }
    toast({ title: `Done — ${done} of ${toFetch.length} topic${toFetch.length !== 1 ? 's' : ''} fetched and saved` });
  };

  // ─────────────────────────────────────────────────────────────────
  // Delete an item from the library
  // ─────────────────────────────────────────────────────────────────
  const deleteItem = async (id: string) => {
    try {
      const data = await apiFetch({ action: 'delete_item', id });
      if (data.success) {
        setLibrary(l => l.filter(i => i.id !== id));
        await loadCatalog(); // refresh saved_id states
      } else {
        toast({ title: 'Delete failed', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Delete error', description: e.message, variant: 'destructive' });
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // Scan for algorithm updates not in the catalog
  // ─────────────────────────────────────────────────────────────────
  const scanForNew = async () => {
    setScanning(true);
    setScanResults([]);
    try {
      const data = await apiFetch({ action: 'scan_for_new' });
      if (data.success) {
        setScanResults(data.suggestions || []);
        setShowScan(true);
        toast({ title: `${data.suggestions?.length || 0} new updates discovered` });
      } else {
        toast({ title: 'Scan failed', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Scan error', description: e.message, variant: 'destructive' });
    }
    setScanning(false);
  };

  // ─────────────────────────────────────────────────────────────────
  // Add a scanned or custom topic: fetch → tag → save → refresh
  // Per-row loading via addingRow (index), not shared boolean.
  // ─────────────────────────────────────────────────────────────────
  const addDiscoveredTopic = async (
    label: string, engine: string, category: string, source: string, rowIndex?: number,
  ) => {
    if (rowIndex !== undefined) setAddingRow(rowIndex);
    else setAddingCustom(true);
    try {
      const fetchData = await apiFetch({
        action: 'fetch_custom_topic', label, engine, category, source,
      });
      if (!fetchData.success || !fetchData.item) {
        toast({ title: 'Fetch failed', description: fetchData.error, variant: 'destructive' });
        return;
      }
      const item = fetchData.item;
      // Ensure 'custom' tag, deduplicated
      item.tags = [...new Set([...(Array.isArray(item.tags) ? item.tags : []), 'custom'])];

      const saveData = await apiFetch({ action: 'save_item', item });
      if (saveData.success) {
        if (rowIndex !== undefined) {
          setScanResults(r => r.filter((_, i) => i !== rowIndex));
        } else {
          setCustomLabel('');
          setShowAddCustom(false);
        }
        toast({ title: 'Added to library', description: label });
        await Promise.all([loadCatalog(), loadLibrary()]);
      } else {
        toast({ title: 'Save failed', description: saveData.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    if (rowIndex !== undefined) setAddingRow(-1);
    else setAddingCustom(false);
  };

  // ─────────────────────────────────────────────────────────────────
  // Audit a live page against the saved knowledge library
  // Step 1: crawl the URL (NDJSON stream via /api/crawl)
  // Step 2: score the page against the library via /api/algorithm-intel
  // ─────────────────────────────────────────────────────────────────
  const runAudit = async () => {
    if (!auditUrl.trim()) return;
    setAuditing(true);
    setAuditResult(null);
    setAuditStep('Crawling page…');
    try {
      const url = auditUrl.trim().startsWith('http') ? auditUrl.trim() : `https://${auditUrl.trim()}`;

      // ── Step 1: crawl ──────────────────────────────────────────────
      const crawlRes = await fetch('/api/crawl', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'crawl_urls',
          urls: [url],
          projectContext: `${client?.company || ''} | ${selProj?.url || ''}`,
          projectId: selProjId || null,
          forceRefresh: true,
        }),
      });

      if (!crawlRes.ok || !crawlRes.body) {
        toast({ title: 'Crawl failed', description: 'Could not reach the crawl API.', variant: 'destructive' });
        setAuditing(false);
        return;
      }

      // Read NDJSON stream
      const reader = crawlRes.body.getReader();
      const dec    = new TextDecoder();
      let buf      = '';
      let pageData: any = null;

      while (true) {
        const { done, value } = await reader.read();
        buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
        const parts = buf.split('\n'); buf = parts.pop() ?? '';
        for (const line of parts) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'complete' && msg.results?.[0]?.page_analysis) {
              pageData = { ...msg.results[0].page_analysis, url: msg.results[0].url };
            }
          } catch { /* skip malformed NDJSON lines */ }
        }
        if (done) break;
      }

      if (!pageData) {
        toast({ title: 'Crawl failed', description: 'Page could not be fetched. Check the URL is publicly accessible.', variant: 'destructive' });
        setAuditing(false);
        setAuditStep('');
        return;
      }

      // ── Step 2: audit ──────────────────────────────────────────────
      setAuditStep('Scoring against algorithm library…');
      const data = await apiFetch({
        action: 'audit_against',
        pageData,
        projectContext: `${client?.company || ''} | ${selProj?.url || ''}`,
        targetEngine: auditEngine,
      });

      if (data.success) {
        setAuditResult(data.audit);
        toast({ title: `Audit complete — ${data.audit.grade} (${data.audit.overall_score}/100)` });
      } else {
        toast({ title: 'Audit failed', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Audit error', description: e.message, variant: 'destructive' });
    }
    setAuditing(false);
    setAuditStep('');
  };

  // ── Derived data ───────────────────────────────────────────────────
  // Weight colour: 9-10 = red (critical now), 7-8 = orange, 4-6 = yellow, 1-3 = muted
  const weightStyle = (w: number) =>
    w >= 9 ? 'text-red-400'    :
    w >= 7 ? 'text-orange-400' :
    w >= 4 ? 'text-yellow-400' : 'text-muted-foreground/40';

  const weightLabel = (w: number) =>
    w >= 9 ? 'Critical now' :
    w >= 7 ? 'High impact'  :
    w >= 4 ? 'Medium'       : 'Historical';

  // Group order — most important groups first
  const GROUP_ORDER = ['Content & AI Visibility','AI Search Engines','Google Core Updates','E-E-A-T & Quality','Core Web Vitals','Technical SEO','Bing & Microsoft','Custom Topics'];
  const groups = [...new Set([...GROUP_ORDER, ...catalog.map(t => t.group)])].filter(g => catalog.some(t => t.group === g));
  const saved        = catalog.filter(t => t.saved_id).length;
  const stale        = catalog.filter(t => t.is_stale).length;
  const notFetched   = catalog.filter(t => !t.saved_id).length;
  const filteredLib  = library.filter(item => {
    if (filterEngine && item.engine !== filterEngine) return false;
    if (search) {
      const q = search.toLowerCase();
      return item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q) || item.tags?.some(t => t.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav companyName={client?.company ? `${client.company} — Algorithms` : 'Algorithm Intelligence'}
        projects={projects} selectedProjectId={selProjId} onProjectChange={setSelProjId}/>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 mb-1">
              <Brain className="h-5 w-5 text-primary"/>Algorithm Intelligence
            </h1>
            <p className="text-sm text-muted-foreground">
              28 specific algorithm topics. Each fetches one deep knowledge item. Build your library and audit any page against it.
            </p>
          </div>
          {/* Stats */}
          <div className="flex gap-2.5">
            {[
              { val: saved,      label: 'Saved',       color: 'text-green-400',   bg: 'border-green-400/20' },
              { val: stale,      label: 'Stale (7d+)', color: 'text-yellow-400',  bg: 'border-yellow-400/20' },
              { val: notFetched, label: 'Not fetched', color: 'text-muted-foreground', bg: 'border-border' },
            ].map(s => (
              <div key={s.label} className={`text-center px-3 py-2 rounded-xl border bg-card/60 ${s.bg}`}>
                <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-border overflow-x-auto">
          {[
            { id: 'catalog',   icon: TrendingUp,  label: 'Topic Catalog', badge: `${catalog.length}` },
            { id: 'library',   icon: Database,    label: 'Knowledge Library', badge: library.length > 0 ? `${library.length}` : null },
            { id: 'practices', icon: CheckCircle2, label: 'Best Practices', badge: null },
            { id: 'audit',     icon: Target,      label: 'Site Audit', badge: null },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as Tab)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <t.icon size={13}/>{t.label}
              {t.badge && <span className={`px-1.5 py-0.5 rounded-full text-xs font-mono ${tab === t.id ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* ══════════ CATALOG TAB ══════════ */}
        {tab === 'catalog' && (
          <div className="space-y-4">
            {/* Action bar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  <span className="text-red-400 font-medium">Red flame = critical now.</span> Topics sorted by current impact weight.
                  Older than 7 days shows a refresh badge.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={loadCatalog} disabled={catLoading}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
                    <RefreshCw size={11} className={catLoading ? 'animate-spin' : ''}/>Status
                  </button>
                  <button onClick={scanForNew} disabled={scanning}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-violet-400/30 bg-violet-400/8 text-violet-400 hover:bg-violet-400/15 font-medium disabled:opacity-50">
                    {scanning ? <Loader2 size={11} className="animate-spin"/> : <Lightbulb size={11}/>}
                    {scanning ? 'Scanning…' : 'Scan for new updates'}
                  </button>
                  <button onClick={() => setShowAddCustom(v => !v)}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-border text-muted-foreground hover:text-foreground">
                    <Plus size={11}/>Add custom topic
                  </button>
                  {(notFetched > 0 || stale > 0) && (
                    <button onClick={fetchAllNew}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-primary/30 bg-primary/8 text-primary hover:bg-primary/15 font-medium">
                      <Download size={11}/>Fetch all new ({notFetched + stale})
                    </button>
                  )}
                </div>
              </div>

              {/* Add custom topic panel */}
              {showAddCustom && (
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
                  <div className="font-semibold text-sm flex items-center gap-2"><Plus size={13} className="text-primary"/>Add Custom Topic</div>
                  <p className="text-xs text-muted-foreground">Type any algorithm update, guideline, or SEO signal — Manav will research it and add it to your library.</p>
                  <div className="flex gap-2">
                    <input value={customLabel} onChange={e => setCustomLabel(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !addingCustom && customLabel.trim() && addDiscoveredTopic(customLabel.trim(), customEngine, 'general', 'User added')}
                      placeholder="e.g. Google March 2025 Spam Update, ChatGPT Memory + Search..."
                      className="flex-1 h-9 px-3 text-sm rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"/>
                    <select value={customEngine} onChange={e => setCustomEngine(e.target.value)}
                      className="h-9 px-2 text-sm rounded-xl border border-border bg-background/60 outline-none">
                      {Object.entries(ENGINE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button onClick={() => addDiscoveredTopic(customLabel.trim(), customEngine, 'general', 'User added')} disabled={addingCustom || !customLabel.trim()}
                      className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
                      {addingCustom ? <><Loader2 size={11} className="animate-spin"/>Adding…</> : <><Sparkles size={11}/>Add</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Scan results panel */}
              {showScan && scanResults.length > 0 && (
                <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm flex items-center gap-2"><Lightbulb size={13} className="text-violet-400"/>{scanResults.length} new updates discovered</div>
                    <button onClick={() => setShowScan(false)} className="text-muted-foreground hover:text-foreground"><X size={13}/></button>
                  </div>
                  <p className="text-xs text-muted-foreground">These topics are not in your catalog. Click Add to fetch and save each one.</p>
                  <div className="space-y-2">
                    {scanResults.map((s, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{s.label}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-md border font-medium ${ENGINE_BADGE[s.engine] || ENGINE_BADGE.general}`}>{ENGINE_LABEL[s.engine] || s.engine}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.why_important}</p>
                        </div>
                        <button
                          onClick={() => addDiscoveredTopic(s.label, s.engine, s.category, s.source, i)}
                          disabled={addingRow === i}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-violet-400/30 bg-violet-400/8 text-violet-400 hover:bg-violet-400/15 font-medium shrink-0 disabled:opacity-50">
                          {addingRow === i ? <Loader2 size={10} className="animate-spin"/> : <Plus size={10}/>}Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {catLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-sm">
                <Loader2 size={16} className="animate-spin"/>Loading catalog…
              </div>
            )}

            {/* Topic groups */}
            {groups.map(group => (
              <div key={group} className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                <div className="px-4 py-3 bg-card/80 border-b border-border flex items-center gap-2">
                  <Shield size={12} className="text-primary"/>
                  <span className="font-semibold text-sm">{group}</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    {catalog.filter(t => t.group === group && t.saved_id).length}/{catalog.filter(t => t.group === group).length} saved
                  </span>
                  {/* Show if any critical-weight topics in this group */}
                  {catalog.filter(t => t.group === group && t.weight >= 9).length > 0 && (
                    <span className="ml-auto text-xs text-red-400 flex items-center gap-1">
                      <Flame size={10}/>{catalog.filter(t => t.group === group && t.weight >= 9).length} critical
                    </span>
                  )}
                </div>
                <div className="divide-y divide-border/40">
                  {catalog.filter(t => t.group === group).sort((a,b) => b.weight - a.weight).map(topic => {
                    const isFetching = fetching[topic.id];
                    const hasFetched = !!preview[topic.id];
                    const isExpanded = expanded[topic.id];
                    const age = topic.saved_at ? daysAgo(topic.saved_at) : null;
                    return (
                      <div key={topic.id}>
                        {/* Topic row */}
                        <div className="flex items-center gap-3 px-4 py-3">
                          {/* Status dot */}
                          <div className={`h-2 w-2 rounded-full shrink-0 ${
                            topic.saved_id && !topic.is_stale ? 'bg-green-400' :
                            topic.is_stale ? 'bg-yellow-400' : 'bg-border'
                          }`}/>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Weight flame indicator */}
                              <span className={`flex items-center gap-0.5 text-xs font-bold ${weightStyle(topic.weight)}`} title={weightLabel(topic.weight)}>
                                <Flame size={11}/>{topic.weight}
                              </span>
                              <span className="text-sm font-medium">{topic.label}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-md border font-medium ${ENGINE_BADGE[topic.engine] || ENGINE_BADGE.general}`}>
                                {ENGINE_LABEL[topic.engine] || topic.engine}
                              </span>
                              {topic.is_custom && <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-400/10 text-violet-400 border border-violet-400/20">Custom</span>}
                              {topic.is_stale && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 flex items-center gap-1">
                                  <Clock size={9}/>Refresh available
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground/60 mt-0.5">
                              {topic.source}
                              {(topic as any).added && <span className="ml-2">· added {(topic as any).added}</span>}
                              {age !== null && <span className="ml-2">· saved {age === 0 ? 'today' : `${age}d ago`}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {/* If fetched but not saved yet */}
                            {hasFetched && (
                              <>
                                <button onClick={() => setExpanded(e => ({ ...e, [topic.id]: !e[topic.id] }))}
                                  className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground flex items-center gap-1">
                                  {isExpanded ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
                                  Review
                                </button>
                                <button
                                  onClick={() => saveItem(preview[topic.id], topic.id)}
                                  disabled={!!saving[topic.id]}
                                  className="text-xs px-2.5 py-1.5 rounded-lg border border-green-400/30 bg-green-400/8 text-green-400 hover:bg-green-400/15 font-medium flex items-center gap-1 disabled:opacity-50">
                                  {saving[topic.id] ? <Loader2 size={10} className="animate-spin"/> : <CheckCircle2 size={10}/>}
                                  {saving[topic.id] ? 'Saving…' : 'Save'}
                                </button>
                              </>
                            )}
                            {/* Fetch / refresh button */}
                            {!hasFetched && (
                              <button onClick={() => fetchTopic(topic.id)} disabled={isFetching}
                                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                                  topic.saved_id && !topic.is_stale
                                    ? 'border border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
                                    : topic.is_stale
                                    ? 'border border-yellow-400/30 bg-yellow-400/8 text-yellow-400 hover:bg-yellow-400/15'
                                    : 'border border-primary/30 bg-primary/8 text-primary hover:bg-primary/15'
                                }`}>
                                {isFetching
                                  ? <><Loader2 size={10} className="animate-spin"/>Fetching…</>
                                  : topic.saved_id && !topic.is_stale
                                  ? <><RotateCw size={10}/>Re-fetch</>
                                  : topic.is_stale
                                  ? <><RefreshCw size={10}/>Refresh</>
                                  : <><Play size={10}/>Fetch</>}
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Expanded preview */}
                        {isExpanded && hasFetched && (
                          <div className="border-t border-border/50 bg-background/30 px-4 py-4">
                            <KnowledgeItemDetail item={preview[topic.id]}/>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══════════ LIBRARY TAB ══════════ */}
        {tab === 'library' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search library…"
                  className="w-full h-9 pl-8 pr-3 text-sm rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"/>
              </div>
              <select value={filterEngine} onChange={e => setFilterEngine(e.target.value)}
                className="h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none">
                <option value="">All engines</option>
                {Object.entries(ENGINE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button onClick={loadLibrary} disabled={libLoading}
                className="h-9 px-3 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 disabled:opacity-50">
                <RefreshCw size={13} className={libLoading ? 'animate-spin' : ''}/>Refresh
              </button>
            </div>

            {libLoading && <div className="text-center py-8 text-muted-foreground flex items-center justify-center gap-2 text-sm"><Loader2 size={14} className="animate-spin"/>Loading…</div>}

            {!libLoading && filteredLib.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <Database size={32} className="text-muted-foreground/20 mx-auto mb-3"/>
                <p className="font-semibold mb-1">{library.length === 0 ? 'Library empty' : 'No matches'}</p>
                <p className="text-sm text-muted-foreground">
                  {library.length === 0 ? 'Go to Topic Catalog and fetch some topics.' : 'Adjust filters.'}
                </p>
              </div>
            )}

            <div className="space-y-3">
              {filteredLib.map(item => (
                <LibraryCard key={item.id} item={item}
                  expanded={!!expanded[item.id]}
                  onToggle={() => setExpanded(e => ({ ...e, [item.id]: !e[item.id] }))}
                  onDelete={() => { deleteItem(item.id); }}/>
              ))}
            </div>
          </div>
        )}

        {/* ══════════ BEST PRACTICES TAB ══════════ */}
        {tab === 'practices' && (() => {
          const CAT_LABEL: Record<string,string> = {
            core_update:'Core Updates', helpful_content:'Helpful Content',
            spam:'Spam & Penalties', eeat:'E-E-A-T', technical:'Technical SEO',
            content:'Content Quality', links:'Links', geo_ai:'GEO / AI Search',
            core_web_vitals:'Core Web Vitals', local:'Local SEO', general:'General',
          };
          const CAT_ICON: Record<string,string> = {
            core_update:'🔄', helpful_content:'✍️', spam:'🚫', eeat:'⭐',
            technical:'⚙️', content:'📝', links:'🔗', geo_ai:'🤖',
            core_web_vitals:'⚡', local:'📍', general:'📚',
          };
          const IMPORTANCE_CONFIG: Record<string,{label:string;dot:string;card:string;badge:string}> = {
            critical: { label:'Critical',  dot:'bg-red-400',    card:'border-red-400/30 bg-red-400/5',    badge:'bg-red-400/15 text-red-400 border-red-400/30' },
            high:     { label:'High',      dot:'bg-orange-400', card:'border-orange-400/25 bg-orange-400/5', badge:'bg-orange-400/15 text-orange-400 border-orange-400/30' },
            medium:   { label:'Medium',    dot:'bg-yellow-400', card:'border-yellow-400/25 bg-yellow-400/5', badge:'bg-yellow-400/15 text-yellow-400 border-yellow-400/30' },
            low:      { label:'Low',       dot:'bg-border',     card:'border-border bg-card/40',           badge:'bg-secondary text-muted-foreground border-border' },
          };

          // Build per-category data
          const cats = [...new Set(library.map(i => i.category as string))];
          const activeCat = practicesCat || cats[0] || '';
          const catItems  = library.filter(i => i.category === activeCat);
          const practices = catItems.flatMap(i =>
            (i.best_practices || []).map((p: any) => ({ ...p, source: i.title, engine: i.engine, impact: i.impact_level }))
          );
          const checks = catItems.flatMap(i =>
            (i.checklist_items || []).map((c: any, ci: number) => ({ ...c, source: i.title, uid: `${i.id}_${ci}` }))
          );

          // Global stats
          const totalPractices = library.reduce((s,i) => s + (i.best_practices?.length||0), 0);
          const totalChecks    = library.reduce((s,i) => s + (i.checklist_items?.length||0), 0);
          const checkedCount   = Object.values(checkedItems).filter(Boolean).length;

          if (library.length === 0) return (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center">
              <BookOpen size={32} className="text-muted-foreground/20 mx-auto mb-3"/>
              <p className="font-semibold mb-1">No knowledge saved yet</p>
              <p className="text-sm text-muted-foreground">Fetch topics from the Catalog tab to build your library.</p>
            </div>
          );

          return (
            <div className="space-y-5">

              {/* ── Stats bar ─────────────────────────────── */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { val: library.length,  label: 'Topics saved',     color: 'text-primary'   },
                  { val: totalPractices,  label: 'Best practices',    color: 'text-green-400' },
                  { val: `${checkedCount}/${totalChecks}`, label: 'Checks done', color: 'text-yellow-400' },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-center">
                    <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Category tab pills ────────────────────── */}
              <div className="flex flex-wrap gap-2">
                {cats.map(cat => {
                  const count = library.filter(i => i.category === cat).reduce((s,i) => s+(i.best_practices?.length||0), 0);
                  const isActive = activeCat === cat;
                  return (
                    <button key={cat} onClick={() => setPracticesCat(cat)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-secondary/40'
                      }`}>
                      <span>{CAT_ICON[cat as string] || '📌'}</span>
                      {CAT_LABEL[cat as string] || (cat as string)}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* ── Active category header ────────────────── */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-base flex items-center gap-2">
                    <span>{CAT_ICON[activeCat] || '📌'}</span>
                    {CAT_LABEL[activeCat] || activeCat}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {practices.length} practice{practices.length !== 1 ? 's' : ''} · {checks.length} checklist item{checks.length !== 1 ? 's' : ''} from {catItems.length} topic{catItems.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* ── Practice cards grid ───────────────────── */}
              {practices.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-4">
                  {practices.map((p, i) => {
                    const cfg = IMPORTANCE_CONFIG[p.impact] || IMPORTANCE_CONFIG.low;
                    return (
                      <div key={i} className={`rounded-2xl border p-4 space-y-3 ${cfg.card}`}>
                        {/* Card header */}
                        <div className="flex items-start gap-2.5">
                          <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${cfg.dot}`}/>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-sm leading-tight">{p.practice}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${cfg.badge}`}>
                                {cfg.label}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground/70 mt-0.5 leading-tight">{p.source}</p>
                          </div>
                        </div>

                        {/* What to do */}
                        <p className="text-xs text-foreground/80 leading-relaxed">{p.description}</p>

                        {/* Example callout */}
                        {p.example && (
                          <div className="rounded-xl bg-background/50 border border-border/60 px-3 py-2.5 space-y-1">
                            <div className="text-xs font-semibold text-primary/70 flex items-center gap-1.5">
                              <span className="text-sm">💡</span> Real Example
                            </div>
                            <p className="text-xs text-muted-foreground italic leading-relaxed">{p.example}</p>
                          </div>
                        )}

                        {/* How to verify */}
                        {p.how_to_verify && (
                          <div className="flex items-start gap-2 text-xs">
                            <CheckCircle size={12} className="text-green-400 mt-0.5 shrink-0"/>
                            <span className="text-muted-foreground"><span className="font-medium text-foreground">Verify: </span>{p.how_to_verify}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Interactive checklist table ───────────── */}
              {checks.length > 0 && (
                <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card/80">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      <CheckCircle2 size={13} className="text-primary"/>
                      Implementation Checklist
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {checks.filter(c => checkedItems[c.uid]).length}/{checks.length} done
                      </span>
                      {/* Progress bar */}
                      <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full bg-green-400 transition-all"
                          style={{ width: `${checks.length ? (checks.filter(c => checkedItems[c.uid]).length / checks.length) * 100 : 0}%` }}/>
                      </div>
                      <button onClick={() => {
                        const allDone = checks.every(c => checkedItems[c.uid]);
                        const next: Record<string,boolean> = { ...checkedItems };
                        checks.forEach(c => { next[c.uid] = !allDone; });
                        setCheckedItems(next);
                      }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        {checks.every(c => checkedItems[c.uid]) ? 'Uncheck all' : 'Check all'}
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-border/40">
                    {checks.map((c, i) => {
                      const done = !!checkedItems[c.uid];
                      return (
                        <label key={i} className={`flex items-start gap-3 px-5 py-3 cursor-pointer transition-colors ${done ? 'bg-green-400/4' : 'hover:bg-secondary/20'}`}>
                          <input type="checkbox" checked={done}
                            onChange={() => setCheckedItems(prev => ({ ...prev, [c.uid]: !done }))}
                            className="accent-green-400 mt-0.5 h-4 w-4 shrink-0 cursor-pointer"/>
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-medium leading-tight ${done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                              {c.item}
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-xs text-muted-foreground/60">→ {c.how_to_check}</span>
                              {c.pass_criteria && (
                                <span className="text-xs text-green-400/70 flex items-center gap-1">
                                  <CheckCircle size={9}/>Pass: {c.pass_criteria}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {c.tool && (
                              <span className="text-xs px-2 py-0.5 rounded-lg border border-border bg-background/40 text-muted-foreground/60">
                                {c.tool}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {practices.length === 0 && checks.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No practices for this category yet — go to Catalog and fetch some topics.
                </div>
              )}
            </div>
          );
        })()}

        {/* ══════════ AUDIT TAB ══════════ */}
        {tab === 'audit' && (
          <div className="space-y-5">
            {library.length === 0 && (
              <div className="rounded-xl border border-orange-400/25 bg-orange-400/5 px-4 py-3 text-xs text-orange-400 flex items-center gap-2">
                <AlertTriangle size={13}/>Library is empty. Fetch topics from the Catalog first — audit scores your page against saved knowledge.
              </div>
            )}
            <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
              <div className="font-semibold text-sm flex items-center gap-2"><Target size={14} className="text-primary"/>Audit Page Against Your Library</div>
              <div className="flex gap-3">
                <input value={auditUrl} onChange={e => setAuditUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !auditing && library.length > 0 && runAudit()}
                  placeholder="https://yoursite.com/page-to-audit"
                  className="flex-1 h-10 px-3 text-sm rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50 font-mono"/>
                <select value={auditEngine} onChange={e => setAuditEngine(e.target.value)}
                  className="h-10 px-3 text-sm rounded-xl border border-border bg-background/60 outline-none">
                  {Object.entries(ENGINE_LABEL).filter(([k]) => k !== 'general').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button onClick={runAudit} disabled={auditing || !auditUrl.trim() || library.length === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-primary text-white font-bold text-sm hover:opacity-90 disabled:opacity-50">
                  {auditing ? <><Loader2 size={13} className="animate-spin"/>{auditStep || 'Auditing…'}</> : <><Sparkles size={13}/>Audit</>}
                </button>
              </div>
              {auditing && <p className="text-xs text-muted-foreground">{auditStep}</p>}
            </div>
            {auditResult && <AuditPanel result={auditResult}/>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function KnowledgeItemDetail({ item }: { item: any }) {
  return (
    <div className="space-y-4">
      {item.what_changed && (<div><div className="text-xs font-mono text-primary uppercase mb-1">What Changed</div><p className="text-sm text-muted-foreground">{item.what_changed}</p></div>)}
      {item.ranking_factors?.length > 0 && (<div><div className="text-xs font-mono text-primary uppercase mb-1.5">Ranking Factors</div><div className="space-y-1">{item.ranking_factors.map((f: any, i: number) => (<div key={i} className="flex items-start gap-2 text-xs"><span className={f.signal === 'positive' ? 'text-green-400' : f.signal === 'negative' ? 'text-red-400' : 'text-muted-foreground'}>{f.signal === 'positive' ? '▲' : f.signal === 'negative' ? '▼' : '●'}</span><div><span className="font-medium">{f.factor}:</span> <span className="text-muted-foreground">{f.detail}</span></div></div>))}</div></div>)}
      {item.best_practices?.length > 0 && (<div><div className="text-xs font-mono text-primary uppercase mb-1.5">Best Practices</div><div className="space-y-2">{item.best_practices.map((p: any, i: number) => (<div key={i} className="rounded-lg border border-border bg-card/40 p-3"><div className="font-semibold text-xs mb-1">{p.practice}</div><p className="text-xs text-muted-foreground">{p.description}</p>{p.example && <p className="text-xs text-muted-foreground/60 mt-1 italic">Example: {p.example}</p>}{p.how_to_verify && <p className="text-xs text-primary/70 mt-1">✓ {p.how_to_verify}</p>}</div>))}</div></div>)}
      {item.checklist_items?.length > 0 && (<div><div className="text-xs font-mono text-primary uppercase mb-1.5">Checklist</div><div className="space-y-1">{item.checklist_items.map((c: any, i: number) => (<div key={i} className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg border border-border/50 bg-background/30"><div className="h-4 w-4 rounded border border-border shrink-0 mt-0.5"/><div className="flex-1"><span className="font-medium">{c.item}</span><span className="text-muted-foreground ml-2">→ {c.how_to_check}</span>{c.pass_criteria && <span className="text-green-400/70 ml-2">✓ {c.pass_criteria}</span>}</div>{c.tool && <span className="text-muted-foreground/40 shrink-0">{c.tool}</span>}</div>))}</div></div>)}
      {item.source_url && (<a href={item.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline"><ExternalLink size={11}/>{item.source_name || item.source_url}</a>)}
    </div>
  );
}

function LibraryCard({ item, expanded, onToggle, onDelete }: { item: any; expanded: boolean; onToggle: any; onDelete: any; [k: string]: any }) {
  const age = item.updated_at ? daysAgo(item.updated_at) : null;
  return (
    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${ENGINE_BADGE[item.engine] || ENGINE_BADGE.general}`}>{ENGINE_LABEL[item.engine] || item.engine}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${IMPACT_STYLE[item.impact_level] || IMPACT_STYLE.low}`}>{item.impact_level}</span>
            {age !== null && <span className="text-xs text-muted-foreground/50">{age === 0 ? 'today' : `${age}d ago`}</span>}
          </div>
          <div className="font-semibold text-sm mt-1.5">{item.title}</div>
          <p className="text-xs text-muted-foreground mt-0.5">{item.summary}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {item.source_url && <a href={item.source_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="h-7 w-7 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-primary"><ExternalLink size={12}/></a>}
          <button onClick={e => { e.stopPropagation(); onDelete(); }} className="h-7 w-7 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/30">
            <X size={12}/>
          </button>
          {expanded ? <ChevronDown size={14} className="text-muted-foreground"/> : <ChevronRight size={14} className="text-muted-foreground"/>}
        </div>
      </div>
      {expanded && <div className="border-t border-border px-4 py-4 bg-background/20"><KnowledgeItemDetail item={item}/></div>}
    </div>
  );
}

function AuditPanel({ result }: { result: any }) {
  const col = result.overall_score >= 80 ? 'text-green-400' : result.overall_score >= 60 ? 'text-yellow-400' : result.overall_score >= 40 ? 'text-orange-400' : 'text-red-400';
  const bg  = result.overall_score >= 80 ? 'border-green-400/30 bg-green-400/8' : result.overall_score >= 60 ? 'border-yellow-400/30 bg-yellow-400/8' : 'border-orange-400/30 bg-orange-400/8';
  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-5 flex items-center gap-5 ${bg}`}>
        <div className="text-center"><div className={`text-5xl font-black ${col}`}>{result.overall_score}</div><div className="text-sm text-muted-foreground">/100</div></div>
        <div className="flex-1"><div className={`text-3xl font-black ${col} mb-1`}>{result.grade}</div><p className="text-sm">{result.verdict}</p>
          {result.engine_scores && <div className="flex gap-2 mt-2">{Object.entries(result.engine_scores as Record<string,any>).map(([eng, val]: [string, any]) => (<div key={eng} className="text-xs px-2 py-1 rounded-lg bg-background/30 border border-border/50"><span className="text-muted-foreground capitalize">{eng.replace('_',' ')}</span> <span className="font-bold">{val.score}/100</span> <span className="text-muted-foreground">— {val.label}</span></div>))}</div>}
        </div>
      </div>
      {result.critical_fails?.length > 0 && (<div className="rounded-2xl border border-red-400/30 bg-red-400/5 p-4 space-y-2"><div className="font-semibold text-sm text-red-400 flex items-center gap-2"><XCircle size={13}/>Critical Fails</div>{result.critical_fails.map((f: any, i: number) => (<div key={i} className="text-xs space-y-0.5"><div className="font-medium">{f.issue}</div><div className="text-muted-foreground">{f.algorithm}</div><div className="text-red-400/80 flex gap-1.5"><ArrowRight size={10} className="mt-0.5 shrink-0"/>{f.fix}</div></div>))}</div>)}
      {result.quick_wins?.length > 0 && (<div className="rounded-2xl border border-green-400/25 bg-green-400/5 p-4 space-y-2"><div className="font-semibold text-sm text-green-400 flex items-center gap-2"><Zap size={13}/>Quick Wins</div>{result.quick_wins.map((w: any, i: number) => (<div key={i} className="flex items-start gap-2 text-xs"><span className="text-green-400/70 font-bold shrink-0">{w.score_impact}</span><div><span className="font-medium">{w.action}</span><span className="text-muted-foreground"> · {w.effort} effort · {w.algorithm}</span></div></div>))}</div>)}
      {result.checks?.length > 0 && (<div className="rounded-2xl border border-border bg-card/60 overflow-hidden"><div className="px-4 py-3 border-b border-border bg-card/80 font-semibold text-sm">All Checks ({result.checks.length})</div><div className="divide-y divide-border/40">{result.checks.map((c: any, i: number) => (<div key={i} className="flex items-start gap-3 px-4 py-3"><span className={`shrink-0 mt-0.5 ${c.status === 'pass' ? 'text-green-400' : c.status === 'fail' ? 'text-red-400' : 'text-yellow-400'}`}>{c.status === 'pass' ? <CheckCircle size={13}/> : c.status === 'fail' ? <XCircle size={13}/> : <AlertTriangle size={13}/>}</span><div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-medium">{c.check}</span><span className="text-xs text-muted-foreground/50">{c.algorithm}</span></div>{c.evidence && <p className="text-xs text-muted-foreground mt-0.5">{c.evidence}</p>}{c.fix && c.status !== 'pass' && <p className="text-xs text-primary/80 mt-0.5 flex items-center gap-1"><ArrowRight size={9}/>{c.fix}</p>}</div><span className={`text-xs px-1.5 py-0.5 rounded-full border shrink-0 ${IMPACT_STYLE[c.impact] || IMPACT_STYLE.low}`}>{c.impact}</span></div>))}</div></div>)}
      {result.priority_actions?.length > 0 && (<div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2"><div className="font-semibold text-sm flex items-center gap-2"><Star size={13} className="text-primary"/>Priority Actions</div>{result.priority_actions.map((a: any, i: number) => (<div key={i} className={`flex items-start gap-3 rounded-xl border p-3 bg-background/40 ${IMPACT_STYLE[a.impact] || IMPACT_STYLE.low}`}><span className="text-sm font-black shrink-0">#{a.rank}</span><div className="flex-1"><div className="font-semibold text-xs">{a.action}</div><div className="text-xs opacity-70 mt-0.5">{a.why} · {a.effort} effort</div></div></div>))}</div>)}
    </div>
  );
}
