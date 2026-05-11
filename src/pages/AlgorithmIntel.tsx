import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  Brain, Globe, RefreshCw, Loader2, Plus, Trash2, ChevronDown, ChevronRight,
  CheckCircle, XCircle, AlertTriangle, Zap, BookOpen, Search, Filter,
  Download, Star, TrendingUp, Shield, FileText, Target, Eye, ArrowRight,
  ExternalLink, Database, CheckCircle2, X, BarChart3, Award, Sparkles,
} from 'lucide-react';
import PortalNav from '@/components/PortalNav';
import { toast } from '@/hooks/use-toast';

// ── Types ─────────────────────────────────────────────────────────────
interface BestPractice  { practice: string; description: string; example: string; how_to_verify: string; }
interface RankingFactor { factor: string; signal: 'positive'|'negative'|'neutral'; detail: string; }
interface ChecklistItem { item: string; how_to_check: string; pass_criteria: string; tool: string; }

interface AlgoItem {
  id?:             string;
  engine:          string;
  category:        string;
  title:           string;
  summary:         string;
  what_changed?:   string;
  impact_level:    string;
  best_practices:  BestPractice[];
  ranking_factors: RankingFactor[];
  checklist_items: ChecklistItem[];
  source_url?:     string;
  source_name?:    string;
  published_date?: string;
  tags:            string[];
  created_at?:     string;
}

type Tab = 'feed' | 'library' | 'practices' | 'audit';

// ── Constants ─────────────────────────────────────────────────────────
const ENGINE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  google:     { label: 'Google',     color: '#4285F4', bg: 'bg-blue-500/10 border-blue-500/25 text-blue-400' },
  bing:       { label: 'Bing',       color: '#00A4EF', bg: 'bg-cyan-500/10 border-cyan-500/25 text-cyan-400' },
  perplexity: { label: 'Perplexity', color: '#9b59b6', bg: 'bg-purple-500/10 border-purple-500/25 text-purple-400' },
  chatgpt:    { label: 'ChatGPT',    color: '#10a37f', bg: 'bg-green-500/10 border-green-500/25 text-green-400' },
  gemini:     { label: 'Gemini',     color: '#EA4335', bg: 'bg-red-500/10 border-red-500/25 text-red-400' },
  general:    { label: 'General',    color: '#6b7280', bg: 'bg-secondary border-border text-muted-foreground' },
};

const CATEGORY_LABELS: Record<string, string> = {
  core_update:      'Core Update', helpful_content: 'Helpful Content',
  spam:             'Spam / Manual', eeat: 'E-E-A-T',
  technical:        'Technical', content: 'Content Quality',
  links:            'Links', geo_ai: 'GEO / AI Search',
  core_web_vitals:  'Core Web Vitals', local: 'Local SEO',
  general:          'General',
};

const IMPACT_STYLES: Record<string, string> = {
  critical: 'border-red-400/40 bg-red-400/8 text-red-400',
  high:     'border-orange-400/35 bg-orange-400/8 text-orange-400',
  medium:   'border-yellow-400/35 bg-yellow-400/8 text-yellow-400',
  low:      'border-border bg-secondary/50 text-muted-foreground',
};

const FETCH_TOPICS = [
  { label: 'Latest Google Core Updates',         engine: 'google',  topic: 'Google Core Algorithm Updates 2024 2025' },
  { label: 'Helpful Content System',             engine: 'google',  topic: 'Google Helpful Content System HCU ranking guidance' },
  { label: 'E-E-A-T Guidelines',                 engine: 'google',  topic: 'Google E-E-A-T Experience Expertise Authoritativeness Trust ranking factors' },
  { label: 'AI Overviews & SGE',                 engine: 'google',  topic: 'Google AI Overviews Search Generative Experience optimisation' },
  { label: 'Core Web Vitals 2025',               engine: 'google',  topic: 'Core Web Vitals LCP FID CLS INP 2025 ranking factor' },
  { label: 'Google Spam Policies',               engine: 'google',  topic: 'Google spam policies manual actions site quality guidelines 2025' },
  { label: 'ChatGPT Search Optimisation',        engine: 'ai',      topic: 'ChatGPT search ranking factors optimisation best practices' },
  { label: 'Perplexity AI Citation Factors',     engine: 'ai',      topic: 'Perplexity AI search citation ranking signals best practices' },
  { label: 'Gemini in Search',                   engine: 'ai',      topic: 'Google Gemini search integration ranking citation factors' },
  { label: 'Bing Webmaster Updates',             engine: 'bing',    topic: 'Bing search algorithm updates ranking guidance 2025' },
  { label: 'Technical SEO Best Practices 2025',  engine: 'general', topic: 'technical SEO best practices structured data schema 2025' },
  { label: 'Link Building Guidelines',           engine: 'google',  topic: 'Google link building guidelines quality backlinks 2025' },
];

// ─────────────────────────────────────────────────────────────────────
export default function AlgorithmIntel() {
  const { clients, projects } = useAuth();
  const [tab, setTab]         = useState<Tab>('feed');
  const [selProjId, setSelProjId] = useState('');

  // Library state
  const [library,     setLibrary]     = useState<AlgoItem[]>([]);
  const [libLoading,  setLibLoading]  = useState(false);
  const [filterEngine, setFilterEngine] = useState('');
  const [filterCat,    setFilterCat]    = useState('');
  const [search,       setSearch]       = useState('');
  const [expanded,     setExpanded]     = useState<Record<string, boolean>>({});

  // Feed state
  const [fetchTopic,   setFetchTopic]   = useState(FETCH_TOPICS[0]);
  const [fetching,     setFetching]     = useState(false);
  const [fetchResult,  setFetchResult]  = useState<AlgoItem[]>([]);
  const [fetchSummary, setFetchSummary] = useState('');
  const [saving,       setSaving]       = useState(false);
  const [savedIds,     setSavedIds]     = useState<Record<number,boolean>>({});

  // Audit state
  const [auditUrl,    setAuditUrl]    = useState('');
  const [auditEngine, setAuditEngine] = useState('google');
  const [auditing,    setAuditing]    = useState(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditFetching, setAuditFetching] = useState(false);

  const selProj = projects.find(p => p.id === selProjId);
  const client  = clients.find(c => c.id === selProj?.client_id);

  // ── Load library ──────────────────────────────────────────────────
  const loadLibrary = useCallback(async () => {
    setLibLoading(true);
    try {
      const { data } = await supabase.from('algorithm_knowledge').select('*').order('created_at', { ascending: false });
      setLibrary((data as AlgoItem[]) || []);
    } catch { /* silent */ }
    setLibLoading(false);
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  // ── Fetch updates from trusted sources ───────────────────────────
  const fetchUpdates = async () => {
    setFetching(true);
    setFetchResult([]);
    setFetchSummary('');
    setSavedIds({});
    try {
      const res  = await fetch('/api/algorithm-intel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch_updates', engine: fetchTopic.engine, topic: fetchTopic.topic }),
      });
      const data = await res.json();
      if (data.success) {
        setFetchResult(data.items || []);
        setFetchSummary(data.fetch_summary || '');
        toast({ title: `${data.items?.length || 0} knowledge items fetched`, description: "Review and save items relevant to your library." });
      } else {
        toast({ title: 'Fetch failed', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setFetching(false);
  };

  // ── Save item(s) to library ───────────────────────────────────────
  const saveItem = async (item: AlgoItem, idx: number) => {
    setSaving(true);
    try {
      const res  = await fetch('/api/algorithm-intel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_item', item }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedIds(prev => ({ ...prev, [idx]: true }));
        setLibrary(prev => [data.item, ...prev]);
        toast({ title: 'Saved to library', description: item.title });
      } else {
        toast({ title: 'Save failed', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const saveAll = async () => {
    const unsaved = fetchResult.filter((_, i) => !savedIds[i]);
    if (!unsaved.length) return;
    setSaving(true);
    try {
      const res  = await fetch('/api/algorithm-intel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_many', items: unsaved }),
      });
      const data = await res.json();
      if (data.success) {
        const newIds: Record<number,boolean> = {};
        fetchResult.forEach((_, i) => { newIds[i] = true; });
        setSavedIds(newIds);
        setLibrary(prev => [...(data.items || []), ...prev]);
        toast({ title: `${data.saved} items saved to library` });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const deleteItem = async (id: string) => {
    try {
      const res = await fetch('/api/algorithm-intel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_item', id }),
      });
      const data = await res.json();
      if (data.success) {
        setLibrary(prev => prev.filter(i => i.id !== id));
        toast({ title: 'Deleted' });
      }
    } catch { /* silent */ }
  };

  // ── Site audit ────────────────────────────────────────────────────
  const runAudit = async () => {
    if (!auditUrl.trim()) return;
    setAuditing(true);
    setAuditResult(null);
    setAuditFetching(true);

    try {
      // First crawl the URL to get page data
      const crawlRes = await fetch('/api/crawl', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'crawl_urls',
          urls: [auditUrl.trim().startsWith('http') ? auditUrl.trim() : `https://${auditUrl.trim()}`],
          projectContext: `${client?.company || ''} | ${selProj?.url || ''}`,
          projectId: selProjId || null,
          forceRefresh: true,
        }),
      });

      // Read NDJSON stream
      const reader = crawlRes.body?.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let pageData: any = null;

      if (reader) {
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
            } catch { /* skip */ }
          }
          if (done) { if (buf.trim()) try { const m = JSON.parse(buf); if (m.type === 'complete') pageData = m.results?.[0]?.page_analysis; } catch {} break; }
        }
      }
      setAuditFetching(false);

      if (!pageData) {
        toast({ title: 'Could not fetch page', description: 'Page crawl failed. Check the URL is accessible.', variant: 'destructive' });
        setAuditing(false);
        return;
      }

      // Now audit against algorithm library
      const auditRes = await fetch('/api/algorithm-intel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'audit_against',
          pageData,
          projectContext: `${client?.company || ''} | ${selProj?.url || ''}`,
          targetEngine: auditEngine,
        }),
      });
      const auditData = await auditRes.json();
      if (auditData.success) {
        setAuditResult(auditData.audit);
        toast({ title: `Audit complete — ${auditData.audit.grade} (${auditData.audit.overall_score}/100)` });
      } else {
        toast({ title: 'Audit failed', description: auditData.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setAuditing(false);
    setAuditFetching(false);
  };

  // ── Filtered library ──────────────────────────────────────────────
  const filteredLib = library.filter(item => {
    if (filterEngine && item.engine !== filterEngine) return false;
    if (filterCat    && item.category !== filterCat)   return false;
    if (search) {
      const q = search.toLowerCase();
      if (!item.title.toLowerCase().includes(q) && !item.summary.toLowerCase().includes(q) && !item.tags.some(t => t.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  // ── Stats ─────────────────────────────────────────────────────────
  const stats = {
    total:    library.length,
    critical: library.filter(i => i.impact_level === 'critical').length,
    high:     library.filter(i => i.impact_level === 'high').length,
    engines:  [...new Set(library.map(i => i.engine))].length,
  };

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav
        companyName="Algorithm Intelligence"
        projects={projects}
        selectedProjectId={selProjId}
        onProjectChange={setSelProjId}
      />

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 mb-1">
              <Brain className="h-5 w-5 text-primary"/>Algorithm Intelligence
            </h1>
            <p className="text-sm text-muted-foreground">
              Train your tool with the latest search algorithms. Pull from official sources, build your knowledge library, and audit every page against it.
            </p>
          </div>
          {/* Quick stats */}
          {stats.total > 0 && (
            <div className="flex gap-3">
              {[
                { label: 'Knowledge items',  val: stats.total,    color: 'text-foreground' },
                { label: 'Critical',         val: stats.critical, color: 'text-red-400' },
                { label: 'High impact',      val: stats.high,     color: 'text-orange-400' },
                { label: 'Engines covered',  val: stats.engines,  color: 'text-primary' },
              ].map(s => (
                <div key={s.label} className="text-center px-3 py-2 rounded-xl border border-border bg-card/60">
                  <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {[
            { id: 'feed',      icon: TrendingUp, label: 'Intelligence Feed',   desc: 'Fetch latest updates' },
            { id: 'library',   icon: Database,   label: 'Knowledge Library',   desc: `${library.length} items` },
            { id: 'practices', icon: CheckCircle2,label: 'Best Practices',     desc: 'Checklist by category' },
            { id: 'audit',     icon: Target,     label: 'Site Audit',          desc: 'Score against library' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as Tab)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${tab===t.id?'border-primary text-foreground':'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <t.icon size={13}/>
              {t.label}
              <span className="text-muted-foreground/50">{t.desc}</span>
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════
            FEED TAB
        ════════════════════════════════════════════════════════════ */}
        {tab === 'feed' && (
          <div className="space-y-5">
            {/* Source selector */}
            <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
              <div className="font-semibold text-sm flex items-center gap-2">
                <Globe size={14} className="text-primary"/>Fetch from Official Sources
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Pulls directly from Google Search Central, Bing Webmaster Blog, OpenAI, Perplexity, and Google AI blogs — official tier-1 sources only.
              </p>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">Topic</div>
                  <div className="grid grid-cols-1 gap-1 max-h-52 overflow-y-auto pr-1">
                    {FETCH_TOPICS.map(t => (
                      <button key={t.topic} onClick={() => setFetchTopic(t)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors ${fetchTopic===t?'bg-primary/10 border border-primary/25 text-primary':'border border-transparent hover:bg-secondary/40 text-muted-foreground'}`}>
                        <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-md border ${ENGINE_LABELS[t.engine]?.bg||''}`}>{ENGINE_LABELS[t.engine]?.label||t.engine}</span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1.5">
                    <div className="font-semibold text-foreground text-sm">Selected: {fetchTopic.label}</div>
                    <div className="text-muted-foreground/70">{fetchTopic.topic}</div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className={`px-1.5 py-0.5 rounded-md border text-xs ${ENGINE_LABELS[fetchTopic.engine]?.bg||''}`}>{ENGINE_LABELS[fetchTopic.engine]?.label||fetchTopic.engine}</span>
                      <span className="text-muted-foreground/50">· Official sources only</span>
                    </div>
                  </div>
                  <button onClick={fetchUpdates} disabled={fetching}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-primary text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
                    {fetching
                      ? <><Loader2 size={14} className="animate-spin"/>Searching official sources…</>
                      : <><TrendingUp size={14}/>Fetch {fetchTopic.label}</>}
                  </button>
                  {fetching && (
                    <p className="text-xs text-muted-foreground text-center">
                      Claude is searching Google Search Central, official blogs, and documentation…
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Fetch results */}
            {fetchResult.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm">{fetchResult.length} items found</div>
                    {fetchSummary && <p className="text-xs text-muted-foreground mt-0.5">{fetchSummary}</p>}
                  </div>
                  <button onClick={saveAll} disabled={saving || fetchResult.every((_,i) => savedIds[i])}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-primary/30 bg-primary/8 text-primary text-sm font-semibold hover:bg-primary/15 disabled:opacity-50">
                    {saving ? <Loader2 size={12} className="animate-spin"/> : <Download size={12}/>}
                    Save all to library
                  </button>
                </div>

                {fetchResult.map((item, idx) => (
                  <FeedItemCard key={idx} item={item} saved={!!savedIds[idx]} saving={saving}
                    onSave={() => saveItem(item, idx)}
                    expanded={!!expanded[`feed_${idx}`]}
                    onToggle={() => setExpanded(e => ({ ...e, [`feed_${idx}`]: !e[`feed_${idx}`] }))}/>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            LIBRARY TAB
        ════════════════════════════════════════════════════════════ */}
        {tab === 'library' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search library…"
                  className="w-full h-9 pl-8 pr-3 text-sm rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50"/>
              </div>
              <select value={filterEngine} onChange={e=>setFilterEngine(e.target.value)}
                className="h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none">
                <option value="">All engines</option>
                {Object.entries(ENGINE_LABELS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={filterCat} onChange={e=>setFilterCat(e.target.value)}
                className="h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none">
                <option value="">All categories</option>
                {Object.entries(CATEGORY_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button onClick={loadLibrary} disabled={libLoading}
                className="h-9 px-3 rounded-xl border border-border text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm disabled:opacity-50">
                <RefreshCw size={13} className={libLoading?'animate-spin':''}/>Refresh
              </button>
            </div>

            {libLoading && <div className="text-center py-8 text-muted-foreground text-sm flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin"/>Loading…</div>}

            {!libLoading && filteredLib.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <Database size={32} className="text-muted-foreground/20 mx-auto mb-3"/>
                <p className="font-semibold mb-1">{library.length === 0 ? 'Library is empty' : 'No matching items'}</p>
                <p className="text-sm text-muted-foreground">
                  {library.length === 0 ? 'Go to Intelligence Feed and fetch some updates to build your library.' : 'Adjust filters to see items.'}
                </p>
              </div>
            )}

            <div className="space-y-3">
              {filteredLib.map(item => (
                <LibraryItemCard key={item.id} item={item}
                  expanded={!!expanded[item.id!]}
                  onToggle={() => setExpanded(e => ({ ...e, [item.id!]: !e[item.id!] }))}
                  onDelete={() => deleteItem(item.id!)}/>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            BEST PRACTICES TAB
        ════════════════════════════════════════════════════════════ */}
        {tab === 'practices' && (
          <div className="space-y-5">
            {library.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <BookOpen size={32} className="text-muted-foreground/20 mx-auto mb-3"/>
                <p className="font-semibold mb-1">No practices yet</p>
                <p className="text-sm text-muted-foreground">Fetch algorithm updates in the Intelligence Feed to build your best practices library.</p>
              </div>
            ) : (
              (() => {
                const cats = [...new Set(library.map(i => i.category))];
                return cats.map(cat => {
                  const items = library.filter(i => i.category === cat);
                  const allPractices = items.flatMap(i => (i.best_practices || []).map((p: BestPractice) => ({ ...p, source: i.title, engine: i.engine, impact: i.impact_level })));
                  const allChecks    = items.flatMap(i => (i.checklist_items || []).map((c: ChecklistItem) => ({ ...c, source: i.title, impact: i.impact_level })));
                  if (!allPractices.length && !allChecks.length) return null;
                  return (
                    <div key={cat} className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                      <div className="px-5 py-3 bg-card/80 border-b border-border flex items-center justify-between">
                        <div className="font-semibold text-sm flex items-center gap-2">
                          <Shield size={13} className="text-primary"/>{CATEGORY_LABELS[cat as string]||cat}
                        </div>
                        <span className="text-xs text-muted-foreground">{allChecks.length} checks · {allPractices.length} practices</span>
                      </div>
                      <div className="p-5 space-y-5">
                        {allPractices.length > 0 && (
                          <div>
                            <div className="text-xs font-mono text-muted-foreground uppercase mb-2">Best Practices</div>
                            <div className="space-y-2">
                              {allPractices.map((p, i) => (
                                <div key={i} className={`rounded-xl border p-3 ${IMPACT_STYLES[p.impact]||IMPACT_STYLES.low}`}>
                                  <div className="flex items-start gap-2">
                                    <CheckCircle size={12} className="mt-0.5 shrink-0"/>
                                    <div className="flex-1">
                                      <div className="font-semibold text-xs">{p.practice}</div>
                                      <p className="text-xs opacity-80 mt-0.5">{p.description}</p>
                                      {p.example && <p className="text-xs opacity-60 mt-1 italic">e.g. {p.example}</p>}
                                      {p.how_to_verify && (
                                        <div className="flex items-center gap-1 mt-1.5">
                                          <Eye size={9} className="opacity-50"/>
                                          <span className="text-xs opacity-60">{p.how_to_verify}</span>
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-xs opacity-50 shrink-0">{ENGINE_LABELS[p.engine]?.label||p.engine}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {allChecks.length > 0 && (
                          <div>
                            <div className="text-xs font-mono text-muted-foreground uppercase mb-2">Checklist</div>
                            <div className="space-y-1.5">
                              {allChecks.map((c, i) => (
                                <div key={i} className="flex items-start gap-2.5 px-3 py-2 rounded-lg border border-border/50 bg-background/40 text-xs">
                                  <div className="h-4 w-4 rounded border border-border shrink-0 mt-0.5"/>
                                  <div className="flex-1">
                                    <span className="font-medium">{c.item}</span>
                                    {c.how_to_check && <span className="text-muted-foreground ml-2">→ {c.how_to_check}</span>}
                                  </div>
                                  {c.tool && <span className="text-muted-foreground/50 shrink-0">{c.tool}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            SITE AUDIT TAB
        ════════════════════════════════════════════════════════════ */}
        {tab === 'audit' && (
          <div className="space-y-5">
            {library.length === 0 && (
              <div className="rounded-xl border border-orange-400/25 bg-orange-400/5 px-4 py-3 text-xs text-orange-400 flex items-center gap-2">
                <AlertTriangle size={13}/>
                Your library is empty. Fetch algorithm updates first — the audit scores your page against your stored knowledge.
              </div>
            )}

            <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
              <div className="font-semibold text-sm flex items-center gap-2">
                <Target size={14} className="text-primary"/>Audit Page Against Algorithm Library
                <span className="text-xs font-normal text-muted-foreground ml-1">— crawls the page live, then scores it against every item in your library</span>
              </div>
              <div className="flex gap-3">
                <input value={auditUrl} onChange={e=>setAuditUrl(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&!auditing&&library.length>0&&runAudit()}
                  placeholder="https://yoursite.com/page-to-audit"
                  className="flex-1 h-10 px-3 text-sm rounded-xl border border-border bg-background/60 outline-none focus:border-primary/50 font-mono"/>
                <select value={auditEngine} onChange={e=>setAuditEngine(e.target.value)}
                  className="h-10 px-3 text-sm rounded-xl border border-border bg-background/60 outline-none">
                  {Object.entries(ENGINE_LABELS).filter(([k]) => k !== 'general').map(([k,v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <button onClick={runAudit} disabled={auditing||!auditUrl.trim()||library.length===0}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-primary text-white font-bold text-sm hover:opacity-90 disabled:opacity-50">
                  {auditing ? <><Loader2 size={13} className="animate-spin"/>
                    {auditFetching ? 'Crawling…' : 'Auditing…'}</>
                    : <><Sparkles size={13}/>Audit Now</>}
                </button>
              </div>
              {auditing && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 size={11} className="animate-spin text-primary"/>
                  {auditFetching ? 'Step 1/2: Crawling page to extract SEO signals…' : 'Step 2/2: Scoring against your algorithm library…'}
                </div>
              )}
            </div>

            {auditResult && <AuditResultPanel result={auditResult} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function FeedItemCard({ item, saved, saving, onSave, expanded, onToggle }: any) {
  const eng = ENGINE_LABELS[item.engine] || ENGINE_LABELS.general;
  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${saved ? 'border-green-400/30 bg-green-400/5' : 'border-border bg-card/60'}`}>
      <div className="flex items-start gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${eng.bg}`}>{eng.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${IMPACT_STYLES[item.impact_level]||IMPACT_STYLES.low}`}>{item.impact_level}</span>
            {item.published_date && <span className="text-xs text-muted-foreground/60">{item.published_date}</span>}
          </div>
          <div className="font-semibold text-sm mt-1.5">{item.title}</div>
          <p className="text-xs text-muted-foreground mt-1">{item.summary}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saved ? (
            <span className="flex items-center gap-1 text-xs text-green-400 font-medium"><CheckCircle size={12}/>Saved</span>
          ) : (
            <button onClick={e=>{e.stopPropagation();onSave();}} disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/8 text-primary hover:bg-primary/15 disabled:opacity-50 font-medium">
              {saving ? <Loader2 size={11} className="animate-spin"/> : <Plus size={11}/>}Save
            </button>
          )}
          {expanded ? <ChevronDown size={14} className="text-muted-foreground"/> : <ChevronRight size={14} className="text-muted-foreground"/>}
        </div>
      </div>
      {expanded && <AlgoItemDetail item={item}/>}
    </div>
  );
}

function LibraryItemCard({ item, expanded, onToggle, onDelete }: any) {
  const eng = ENGINE_LABELS[item.engine] || ENGINE_LABELS.general;
  return (
    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${eng.bg}`}>{eng.label}</span>
            <span className="text-xs text-muted-foreground border border-border rounded-md px-2 py-0.5">{CATEGORY_LABELS[item.category]||item.category}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${IMPACT_STYLES[item.impact_level]||IMPACT_STYLES.low}`}>{item.impact_level}</span>
          </div>
          <div className="font-semibold text-sm mt-1.5">{item.title}</div>
          <p className="text-xs text-muted-foreground mt-0.5">{item.summary}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {item.source_url && (
            <a href={item.source_url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
              className="h-7 w-7 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-primary hover:border-primary/30">
              <ExternalLink size={12}/>
            </a>
          )}
          <button onClick={e=>{e.stopPropagation();onDelete();}}
            className="h-7 w-7 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/30">
            <Trash2 size={12}/>
          </button>
          {expanded ? <ChevronDown size={14} className="text-muted-foreground"/> : <ChevronRight size={14} className="text-muted-foreground"/>}
        </div>
      </div>
      {expanded && <AlgoItemDetail item={item}/>}
    </div>
  );
}

function AlgoItemDetail({ item }: { item: AlgoItem }) {
  return (
    <div className="border-t border-border px-4 py-4 space-y-4 bg-background/20">
      {item.what_changed && (
        <div>
          <div className="text-xs font-mono text-primary uppercase mb-1.5">What Changed</div>
          <p className="text-sm text-muted-foreground">{item.what_changed}</p>
        </div>
      )}
      {item.ranking_factors?.length > 0 && (
        <div>
          <div className="text-xs font-mono text-primary uppercase mb-1.5">Ranking Factors</div>
          <div className="space-y-1">
            {item.ranking_factors.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={f.signal==='positive'?'text-green-400':f.signal==='negative'?'text-red-400':'text-muted-foreground'}>
                  {f.signal==='positive'?'▲':f.signal==='negative'?'▼':'●'}
                </span>
                <div><span className="font-medium">{f.factor}:</span> <span className="text-muted-foreground">{f.detail}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {item.best_practices?.length > 0 && (
        <div>
          <div className="text-xs font-mono text-primary uppercase mb-1.5">Best Practices</div>
          <div className="space-y-2">
            {item.best_practices.map((p, i) => (
              <div key={i} className="rounded-lg border border-border bg-card/40 p-3">
                <div className="font-semibold text-xs mb-1">{p.practice}</div>
                <p className="text-xs text-muted-foreground">{p.description}</p>
                {p.example && <p className="text-xs text-muted-foreground/60 mt-1 italic">Example: {p.example}</p>}
                {p.how_to_verify && <p className="text-xs text-primary/70 mt-1">✓ Verify: {p.how_to_verify}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {item.checklist_items?.length > 0 && (
        <div>
          <div className="text-xs font-mono text-primary uppercase mb-1.5">Implementation Checklist</div>
          <div className="space-y-1">
            {item.checklist_items.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg border border-border/50 bg-background/30">
                <div className="h-4 w-4 rounded border border-border shrink-0 mt-0.5"/>
                <div className="flex-1">
                  <span className="font-medium">{c.item}</span>
                  <span className="text-muted-foreground ml-2">→ {c.how_to_check}</span>
                  {c.pass_criteria && <span className="text-green-400/70 ml-2">✓ {c.pass_criteria}</span>}
                </div>
                {c.tool && <span className="text-muted-foreground/50 shrink-0">{c.tool}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {item.source_url && (
        <a href={item.source_url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-primary hover:underline">
          <ExternalLink size={11}/>{item.source_name || item.source_url}
        </a>
      )}
    </div>
  );
}

function AuditResultPanel({ result }: { result: any }) {
  const scoreColor = result.overall_score >= 80 ? 'text-green-400' : result.overall_score >= 60 ? 'text-yellow-400' : result.overall_score >= 40 ? 'text-orange-400' : 'text-red-400';
  const gradeBg    = result.overall_score >= 80 ? 'border-green-400/30 bg-green-400/8' : result.overall_score >= 60 ? 'border-yellow-400/30 bg-yellow-400/8' : 'border-orange-400/30 bg-orange-400/8';

  return (
    <div className="space-y-5">
      {/* Score header */}
      <div className={`rounded-2xl border p-5 flex items-center gap-5 ${gradeBg}`}>
        <div className="text-center">
          <div className={`text-5xl font-black ${scoreColor}`}>{result.overall_score}</div>
          <div className="text-sm text-muted-foreground">/100</div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-3xl font-black ${scoreColor}`}>{result.grade}</span>
            <span className="font-semibold text-sm">{result.verdict}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {result.engine_scores && Object.entries(result.engine_scores as Record<string,any>).map(([eng, val]: [string, any]) => (
              <div key={eng} className="flex items-center justify-between text-xs px-2 py-1 rounded-lg bg-background/30 border border-border/50">
                <span className="text-muted-foreground capitalize">{eng.replace('_',' ')}</span>
                <span className="font-bold">{val.score}/100 <span className="font-normal text-muted-foreground">— {val.label}</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Critical fails */}
      {result.critical_fails?.length > 0 && (
        <div className="rounded-2xl border border-red-400/30 bg-red-400/5 p-4 space-y-2">
          <div className="font-semibold text-sm text-red-400 flex items-center gap-2"><XCircle size={13}/>Critical Fails — Fix These First</div>
          {result.critical_fails.map((f: any, i: number) => (
            <div key={i} className="text-xs space-y-0.5">
              <div className="font-medium text-foreground">{f.issue}</div>
              <div className="text-muted-foreground">Algorithm: {f.algorithm}</div>
              <div className="text-red-400/80 flex gap-1.5"><ArrowRight size={10} className="mt-0.5 shrink-0"/>{f.fix}</div>
            </div>
          ))}
        </div>
      )}

      {/* Quick wins */}
      {result.quick_wins?.length > 0 && (
        <div className="rounded-2xl border border-green-400/25 bg-green-400/5 p-4 space-y-2">
          <div className="font-semibold text-sm text-green-400 flex items-center gap-2"><Zap size={13}/>Quick Wins</div>
          {result.quick_wins.map((w: any, i: number) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-green-400/70 font-bold shrink-0">{w.score_impact}</span>
              <div><span className="font-medium">{w.action}</span> <span className="text-muted-foreground">· {w.effort} effort · {w.algorithm}</span></div>
            </div>
          ))}
        </div>
      )}

      {/* All checks */}
      {result.checks?.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-card/80 font-semibold text-sm">Algorithm Checks ({result.checks.length})</div>
          <div className="divide-y divide-border/40">
            {result.checks.map((c: any, i: number) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <span className={`shrink-0 mt-0.5 ${c.status==='pass'?'text-green-400':c.status==='fail'?'text-red-400':c.status==='warning'?'text-yellow-400':'text-muted-foreground'}`}>
                  {c.status==='pass'?<CheckCircle size={13}/>:c.status==='fail'?<XCircle size={13}/>:c.status==='warning'?<AlertTriangle size={13}/>:<Eye size={13}/>}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">{c.check}</span>
                    <span className="text-xs text-muted-foreground/60">{c.algorithm}</span>
                  </div>
                  {c.evidence && <p className="text-xs text-muted-foreground mt-0.5">{c.evidence}</p>}
                  {c.fix && c.status !== 'pass' && (
                    <p className="text-xs text-primary/80 mt-0.5 flex items-center gap-1"><ArrowRight size={9}/>{c.fix}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full border ${IMPACT_STYLES[c.impact]||IMPACT_STYLES.low}`}>{c.impact}</span>
                  {c.points > 0 && <span className="text-xs text-green-400 font-bold">+{c.points}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* E-E-A-T */}
      {result.eeat_assessment && (
        <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
          <div className="font-semibold text-sm flex items-center gap-2"><Award size={13} className="text-primary"/>E-E-A-T Assessment</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(result.eeat_assessment).map(([k, v]: any) => {
              const parts = v.split(' — ');
              const level = parts[0]?.toLowerCase();
              const note  = parts[1] || '';
              const col = level?.includes('high') ? 'border-green-400/25 text-green-400' : level?.includes('medium') ? 'border-yellow-400/25 text-yellow-400' : 'border-border text-muted-foreground';
              return (
                <div key={k} className={`rounded-xl border p-2.5 text-center ${col}`}>
                  <div className="text-xs font-bold capitalize">{k}</div>
                  <div className="text-xs font-semibold mt-0.5">{parts[0]}</div>
                  {note && <div className="text-xs opacity-60 mt-0.5 leading-tight">{note.slice(0,40)}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GEO/AI readiness */}
      {result.geo_ai_readiness && (
        <div className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Brain size={13} className="text-violet-400"/>
            <span className="font-semibold text-sm">GEO / AI Search Readiness</span>
            <span className={`text-lg font-black ${result.geo_ai_readiness.score>=70?'text-green-400':result.geo_ai_readiness.score>=40?'text-yellow-400':'text-red-400'}`}>{result.geo_ai_readiness.score}/100</span>
            {result.geo_ai_readiness.ready_for_ai_citation && <span className="text-xs px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 border border-green-400/20">Ready for AI citation</span>}
          </div>
          {result.geo_ai_readiness.improvements?.length > 0 && (
            <div className="space-y-1">
              {result.geo_ai_readiness.improvements.map((imp: string, i: number) => (
                <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                  <ArrowRight size={10} className="text-violet-400 mt-0.5 shrink-0"/>
                  {imp}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Priority actions */}
      {result.priority_actions?.length > 0 && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
          <div className="font-semibold text-sm flex items-center gap-2"><Star size={13} className="text-primary"/>Priority Actions</div>
          {result.priority_actions.map((a: any, i: number) => (
            <div key={i} className={`flex items-start gap-3 rounded-xl border p-3 bg-background/40 ${IMPACT_STYLES[a.impact]||IMPACT_STYLES.low}`}>
              <span className="text-sm font-black shrink-0">#{a.rank}</span>
              <div className="flex-1">
                <div className="font-semibold text-xs">{a.action}</div>
                <div className="text-xs opacity-70 mt-0.5">{a.why} · {a.effort} effort</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
