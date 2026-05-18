import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectSync } from '@/hooks/useProjectSync';
import PortalNav from '@/components/PortalNav';
import { SeoEngine } from '@/components/SeoEngine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  Zap, Brain, ShieldCheck, AlertTriangle, CheckCircle2,
  ChevronRight, RefreshCw, Save, BarChart3, Globe,
  ArrowUpRight, Info, Shield, Target, Sparkles, Eye,
  FileText, Layers, CircleDot, XCircle, Loader2, TrendingUp
} from 'lucide-react';

/* ─── Confidence badge ─── */
const ConfBadge = ({ confidence }: { confidence: number }) => {
  const cfg = confidence >= 80
    ? { color: 'text-green-400',       bg: 'bg-green-400/10 border-green-400/20',   label: `${confidence}% verified`   }
    : confidence >= 50
    ? { color: 'text-yellow-400',      bg: 'bg-yellow-400/10 border-yellow-400/20', label: `${confidence}% confidence` }
    : confidence > 0
    ? { color: 'text-orange-400',      bg: 'bg-orange-400/10 border-orange-400/20', label: `${confidence}% — estimated` }
    : { color: 'text-muted-foreground',bg: 'bg-secondary/30 border-border',         label: 'Not verifiable' };
  const Icon = confidence >= 80 ? CheckCircle2 : confidence >= 50 ? Info : AlertTriangle;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-mono ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-2.5 w-2.5" />{cfg.label}
    </span>
  );
};

/* ─── Section card ─── */
const SectionCard = ({ title, agent, ceiling, icon: Icon, color, data, children }: any) => (
  <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
    <div className="border-b border-border bg-background/40 px-5 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div style={{ background: `${color}18`, border: `1px solid ${color}28` }}
          className="h-8 w-8 rounded-lg flex items-center justify-center">
          <Icon size={14} style={{ color }} />
        </div>
        <div>
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-muted-foreground font-mono">{agent}</div>
        </div>
      </div>
    </div>
    <div className="px-5 py-4 text-xs text-yellow-400/80 border-b border-border/50 flex items-start gap-2 bg-yellow-400/3">
      <AlertTriangle size={12} className="shrink-0 mt-0.5" />
      <span><span className="font-semibold">Confidence ceiling:</span> {ceiling}</span>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

/* ─── Data row ─── */
const DataRow = ({ label, value, confidence, limitations }: {
  label: string; value: any; confidence: number; limitations?: string[];
}) => {
  const [showLimits, setShowLimits] = useState(false);
  const display = value === null || value === undefined ? '—' : String(value);
  return (
    <div className="py-2.5 border-b border-border/40 last:border-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-sm font-bold ${display === '—' ? 'text-muted-foreground' : ''}`}>{display}</span>
          <ConfBadge confidence={confidence} />
          {limitations?.length ? (
            <button onClick={() => setShowLimits(s => !s)}
              className="text-muted-foreground hover:text-foreground transition-colors">
              <Info size={11} />
            </button>
          ) : null}
        </div>
      </div>
      {showLimits && limitations?.length && (
        <div className="rounded-lg bg-yellow-400/5 border border-yellow-400/15 p-2 mt-1.5">
          {limitations.map((l, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-yellow-400/80 mb-1 last:mb-0">
              <AlertTriangle size={9} className="shrink-0 mt-0.5" />{l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════ */
export default function Audit() {
  const { clients, projects, user } = useAuth();

  /* ── Shared state ── */
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const handleProjectChange = useProjectSync(selectedProjectId, setSelectedProjectId);
  const [mode, setMode] = useState<'metrics' | 'strategy' | 'orchestrator'>('metrics');

  /* ── 4-Agent analysis state ── */
  const [url,         setUrl]         = useState('');
  const [keywords,    setKeywords]    = useState('');
  const [competitors, setCompetitors] = useState('');
  const [brandName,   setBrandName]   = useState('');
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [result,      setResult]      = useState<any>(null);
  const [savedId,     setSavedId]     = useState<string | null>(null);
  const [pastReports, setPastReports] = useState<any[]>([]);

  /* ── Orchestrator state ── */
  const [orchUrls,        setOrchUrls]        = useState('');
  const [orchMode,        setOrchMode]        = useState<'quick'|'standard'|'deep'>('standard');
  const [orchLoading,     setOrchLoading]     = useState(false);
  const [orchEvents,      setOrchEvents]      = useState<any[]>([]);
  const [orchPageResults, setOrchPageResults] = useState<Record<string, any>>({});
  const [orchSynthesis,   setOrchSynthesis]   = useState('');
  const [orchComplete,    setOrchComplete]    = useState(false);
  const [orchExpanded,    setOrchExpanded]    = useState<Record<string, boolean>>({});

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const client          = clients.find(c => c.id === selectedProject?.client_id);

  /* Pre-fill from selected project */
  useEffect(() => {
    if (!selectedProject) return;
    setUrl(selectedProject.url || '');
    setKeywords((selectedProject.keywords  || []).join(', '));
    setCompetitors((selectedProject.competitors || []).join(', '));
    const c = clients.find(x => x.id === selectedProject.client_id);
    setBrandName(c?.company || '');
    if (selectedProject.url) setOrchUrls(selectedProject.url);
    loadPastReports(selectedProject.id);
  }, [selectedProjectId]);

  const loadPastReports = async (pid: string) => {
    const { data } = await supabase
      .from('audit_reports')
      .select('id,created_at,overall_score,synced_to_metrics,url,sections,saved_by')
      .eq('project_id', pid)
      .order('created_at', { ascending: false })
      .limit(8);
    setPastReports(data || []);
  };

  /* ── 4-Agent run ── */
  const runAnalysis = async () => {
    if (!url) return toast({ title: 'URL required', variant: 'destructive' });
    setLoading(true);
    setResult(null);
    setSavedId(null);
    try {
      const kwArr   = keywords.split(',').map(k => k.trim()).filter(Boolean);
      const compArr = competitors.split(',').map(c => c.trim()).filter(Boolean);
      const res = await fetch('/api/run-analysis', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url, keywords: kwArr, competitors: compArr,
          brand_name: brandName, project_id: selectedProjectId || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Analysis failed');
      setResult(data);
      toast({ title: 'Analysis complete!', description: `Overall confidence: ${data.overall_confidence}%` });
    } catch (err: any) {
      toast({ title: 'Analysis failed', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const saveReport = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const kwArr   = keywords.split(',').map(k => k.trim()).filter(Boolean);
      const compArr = competitors.split(',').map(c => c.trim()).filter(Boolean);
      const { data, error } = await supabase.from('audit_reports').insert({
        project_id:     selectedProjectId || null,
        url,
        keywords:       kwArr,
        competitors:    compArr,
        sections:       result.sections,
        confidence:     result.cross_verifications,
        data_sources:   result.analysis?.data_sources,
        limitations:    result.sections?.content?.data?.limitations,
        cross_verified: result.cross_verifications,
        overall_score:  result.overall_confidence,
        saved_by:       user?.email || 'unknown',
      }).select('id').single();
      if (error) throw error;
      if (selectedProjectId) {
        await supabase.from('projects').update({
          last_analysis:    result,
          last_analysis_at: new Date().toISOString(),
        }).eq('id', selectedProjectId);
      }
      setSavedId(data.id);
      if (selectedProjectId) loadPastReports(selectedProjectId);
      toast({ title: 'Report saved!', description: 'Available in project history and Admin panel.' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const syncToMetrics = async () => {
    if (!result || !selectedProjectId) return;
    setSyncing(true);
    try {
      const a = result.analysis;
      const { error } = await supabase.from('metrics').insert({
        project_id:              selectedProjectId,
        recorded_at:             new Date().toISOString().split('T')[0],
        llm_visibility_score:    a.llm_visibility_score,
        algorithm_health_score:  a.algorithm_health_score,
        eeat_score:              a.eeat_score,
        content_authority_score: a.content_authority_score,
        overall_growth_score:    a.overall_growth_score,
        pages_indexed:           a.pages_indexed,
        pages_submitted:         a.pages_submitted,
        brand_mentions:          a.brand_mentions,
        perplexity_citations:    a.perplexity_citations,
        google_ai_citations:     a.google_ai_citations,
        chatgpt_citations:       a.chatgpt_citations,
        competitor_rank:         a.competitor_rank,
        competitors_beaten:      a.competitors_beaten,
        keyword_rankings:        a.keyword_rankings,
        milestone:               a.milestone,
        milestone_impact:        a.milestone_impact,
        explanations:            a.explanations,
        data_sources:            a.data_sources,
      });
      if (error) throw error;
      if (savedId) {
        await supabase.from('audit_reports')
          .update({ synced_to_metrics: true, synced_at: new Date().toISOString() })
          .eq('id', savedId);
      }
      toast({ title: 'Synced to Dashboard!', description: 'All verified data now live in the client dashboard.' });
    } catch (err: any) {
      toast({ title: 'Sync failed', description: err.message, variant: 'destructive' });
    }
    setSyncing(false);
  };

  /* ── Orchestrator run ── */
  const runOrchestrator = async () => {
    if (!selectedProjectId) return toast({ title: 'Project required', description: 'Select a project — the orchestrator needs project context and algorithm data.', variant: 'destructive' });
    const urlList = orchUrls.split(/[\n,]+/).map((u: string) => u.trim()).filter(Boolean);
    if (!urlList.length) return toast({ title: 'Add at least one URL', variant: 'destructive' });

    setOrchLoading(true);
    setOrchEvents([]);
    setOrchPageResults({});
    setOrchSynthesis('');
    setOrchComplete(false);
    setOrchExpanded({});

    try {
      const res = await fetch('/api/audit-orchestrator', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId, urls: urlList, mode: orchMode }),
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            setOrchEvents(prev => [...prev, event]);
            if (event.type === 'page_done' && event.result) {
              setOrchPageResults(prev => ({ ...prev, [event.result.url]: event.result }));
              setOrchExpanded(prev => ({ ...prev, [event.result.url]: true }));
            }
            if ((event.type === 'synthesizing' || event.type === 'complete') && event.summary) {
              setOrchSynthesis(event.summary);
            }
            if (event.type === 'complete') setOrchComplete(true);
          } catch (_) {}
        }
      }
    } catch (err: any) {
      toast({ title: 'Orchestrator failed', description: err.message, variant: 'destructive' });
    }
    setOrchLoading(false);
  };

  const s   = result?.sections;
  const syn = result?.synthesis;

  /* ── Strategy reports from SeoEngine (saved_by: 'seo-engine') ── */
  const strategyReports = pastReports.filter(r => r.saved_by === 'seo-engine');
  const metricsReports  = pastReports.filter(r => r.saved_by !== 'seo-engine');

  return (
    <div className="min-h-screen bg-background text-foreground">
      
      <PortalNav
        companyName={client?.company ? `${client.company} — SEO Audit` : 'SEO Audit Tool'}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onProjectChange={handleProjectChange}
      />

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold mb-1 flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />SEO Audit Centre
          </h1>
          <p className="text-sm text-muted-foreground">
            Two tools in one. Run a quick 4-agent metrics analysis, or generate deep written strategy reports.
            Link to a project to cross-verify findings against live data.
          </p>
        </div>

        {/* ── MODE SWITCHER ── */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('metrics')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              mode === 'metrics'
                ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_20px_hsl(var(--primary)/0.3)]'
                : 'border-border bg-card/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            4-Agent Metrics Analysis
          </button>
          <button
            onClick={() => setMode('strategy')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              mode === 'strategy'
                ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_20px_hsl(var(--primary)/0.3)]'
                : 'border-border bg-card/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="h-4 w-4" />
            Deep Strategy Reports
          </button>
          <button
            onClick={() => setMode('orchestrator')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              mode === 'orchestrator'
                ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_20px_hsl(var(--primary)/0.3)]'
                : 'border-border bg-card/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="h-4 w-4" />
            Showroom Audit
          </button>
        </div>

        {/* ── MODE DESCRIPTIONS ── */}
        <div className="rounded-xl border border-border bg-card/40 px-5 py-3">
          {mode === 'metrics' ? (
            <div className="flex items-start gap-3">
              <BarChart3 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-foreground font-semibold">4-Agent Metrics Analysis</span> — Four independent agents crawl your site in parallel.
                Each data point shows its source and confidence level. Only verified data (80%+) syncs to the client dashboard.
                Fast, quantitative, cross-verified.
              </p>
            </div>
          ) : mode === 'strategy' ? (
            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-foreground font-semibold">Deep Strategy Reports</span> — Four specialist agents write comprehensive
                Technical, On-Page, Off-Page, and GEO strategy reports. When linked to a project, each audit is enriched with your
                live keyword rankings, competitor data, health scores, and previous findings for cross-verification.
                Reports auto-save to the project.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <Layers className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-foreground font-semibold">Showroom Audit</span> — Page-by-page audit where every URL is its own showroom.
                Each page is crawled and checked against its own target keywords and the latest algorithm updates in your knowledge base.
                Findings are automatically classified and saved to Brain Learnings. Requires a linked project.
              </p>
            </div>
          )}
        </div>

        {/* ════════════════════════
            MODE 1: 4-AGENT METRICS
        ════════════════════════ */}
        {mode === 'metrics' && (
          <>
            {/* Confidence explainer */}
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">How Confidence Works</div>
              <div className="grid sm:grid-cols-4 gap-3">
                {[
                  { range: '80–100%', label: 'Verified',   desc: 'Two+ independent sources agree. Shows in dashboard as verified.',         color: 'text-green-400',       bg: 'bg-green-400/10 border-green-400/20'   },
                  { range: '50–79%',  label: 'Likely',     desc: 'Single live source with plausible result. Dashboard shows with note.',     color: 'text-yellow-400',      bg: 'bg-yellow-400/10 border-yellow-400/20' },
                  { range: '1–49%',   label: 'Estimated',  desc: 'AI inference or single signal. Shown with estimate warning.',             color: 'text-orange-400',      bg: 'bg-orange-400/10 border-orange-400/20' },
                  { range: '0%',      label: 'N/A',        desc: 'Cannot be verified with available methods. Not shown in dashboard.',       color: 'text-muted-foreground', bg: 'bg-secondary/30 border-border'         },
                ].map(({ range, label, desc, color, bg }) => (
                  <div key={range} className={`rounded-xl border ${bg} p-3`}>
                    <div className={`text-xs font-bold font-mono ${color} mb-1`}>{range} — {label}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Setup form */}
            <div className="rounded-2xl border border-border bg-card/60 p-6">
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Link to Project (optional)</Label>
                  <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
                    className="w-full h-10 rounded-lg border border-border bg-background/60 text-sm px-3">
                    <option value="">— Standalone audit (not linked) —</option>
                    {(clients||[]).filter((c:any)=>c?.id).map(c => {
                      const cp = projects.filter(p => p.client_id === c.id);
                      if (!cp.length) return null;
                      return (
                        <optgroup key={c.id} label={`${c.name} — ${c.company}`}>
                          {cp.map(p => <option key={p.id} value={p.id}>{p.name} ({p.url})</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Website URL *</Label>
                  <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com"
                    className="h-10 bg-background/60 border-border" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Brand Name</Label>
                  <Input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Acme Corp"
                    className="h-10 bg-background/60 border-border" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Target Keywords (comma separated — each checked live on Google)
                  </Label>
                  <Input value={keywords} onChange={e => setKeywords(e.target.value)}
                    placeholder="event rental dubai, av equipment hire, ..."
                    className="h-10 bg-background/60 border-border" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Competitor Domains (comma separated — checked for page count)
                  </Label>
                  <Input value={competitors} onChange={e => setCompetitors(e.target.value)}
                    placeholder="competitor1.com, competitor2.com"
                    className="h-10 bg-background/60 border-border" />
                </div>
              </div>

              <Button onClick={runAnalysis} disabled={loading || !url}
                className="w-full h-12 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold text-base">
                {loading ? (
                  <span className="flex items-center gap-3">
                    <RefreshCw className="h-4 w-4 animate-spin" />Running 4-agent cross-verified analysis...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />Run Full Metrics Analysis
                  </span>
                )}
              </Button>

              {loading && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['Technical Crawler', 'Content Analyser', 'AI Visibility', 'Ranking Agent'].map((a, i) => (
                    <div key={a} className="rounded-lg border border-border bg-background/40 p-2 text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                        <span className="text-xs font-mono text-primary">Running</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{a}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Past metrics reports */}
            {metricsReports.length > 0 && (
              <div className="rounded-xl border border-border bg-card/40 p-4">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">
                  Past Metrics Analysis Reports
                </div>
                <div className="space-y-2">
                  {metricsReports.map(r => (
                    <div key={r.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                      <span className="text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex items-center gap-3">
                        <ConfBadge confidence={r.overall_score || 0} />
                        {r.synced_to_metrics && (
                          <span className="text-green-400 font-mono flex items-center gap-1">
                            <CheckCircle2 size={10} />Synced to Dashboard
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-5">
                {/* Overall header */}
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div>
                      <div className="text-xs font-mono text-primary uppercase tracking-wider mb-1">Analysis Complete</div>
                      <div className="font-bold text-lg">{result.url}</div>
                      <div className="text-xs text-muted-foreground">{new Date(result.fetched_at).toLocaleString()}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-black text-primary">{result.overall_confidence}%</div>
                      <div className="text-xs text-muted-foreground font-mono">overall confidence</div>
                    </div>
                  </div>

                  {syn?.overall_verdict && (
                    <div className="rounded-xl border border-border bg-background/60 p-3 mb-4">
                      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Verdict</div>
                      <p className="text-sm">{syn.overall_verdict}</p>
                    </div>
                  )}

                  {syn?.data_limitations_summary && (
                    <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3 mb-4 flex items-start gap-2">
                      <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-mono text-yellow-400 uppercase tracking-wider mb-1">What This Analysis Could NOT Verify</div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{syn.data_limitations_summary}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button onClick={saveReport} disabled={saving}
                      className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                      <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Audit Report'}
                    </Button>
                    {selectedProjectId && savedId && (
                      <Button onClick={syncToMetrics} disabled={syncing} variant="outline"
                        className="border-green-400/30 text-green-400 hover:bg-green-400/10">
                        <ArrowUpRight className="h-4 w-4 mr-2" />{syncing ? 'Syncing...' : 'Sync to Client Dashboard'}
                      </Button>
                    )}
                    {selectedProjectId && !savedId && (
                      <p className="text-xs text-muted-foreground self-center">Save first, then sync to dashboard.</p>
                    )}
                  </div>
                </div>

                {/* Cross-verification */}
                {Object.keys(result.cross_verifications || {}).length > 0 && (
                  <div className="rounded-2xl border border-border bg-card/60 p-5">
                    <div className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />Cross-Verification Results
                    </div>
                    <div className="space-y-3">
                      {Object.entries(result.cross_verifications).map(([key, v]: [string, any]) => (
                        <div key={key} className={`rounded-xl border p-3 ${v.agreement ? 'border-green-400/20 bg-green-400/5' : 'border-yellow-400/20 bg-yellow-400/5'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            {v.agreement
                              ? <CheckCircle2 size={13} className="text-green-400" />
                              : <AlertTriangle size={13} className="text-yellow-400" />}
                            <span className={`text-xs font-semibold ${v.agreement ? 'text-green-400' : 'text-yellow-400'}`}>
                              {v.agreement ? 'Agents agree' : 'Agents diverge'}
                            </span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {(v.data_points_compared || []).join(' ↔ ')}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{v.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agent 1: Technical */}
                {s?.technical && (
                  <SectionCard title="Technical Crawler" agent="Agent 1 — Sitemap, indexing, schema, canonical"
                    ceiling={s.technical.ceiling} icon={Shield} color="#06b6d4" data={s.technical.data}>
                    <DataRow label="Pages Indexed by Google"  value={s.technical.data.pages_indexed?.value}      confidence={s.technical.data.pages_indexed?.confidence}    limitations={s.technical.data.pages_indexed?.limitations} />
                    <DataRow label="Pages in Sitemap"          value={s.technical.data.pages_submitted?.value}    confidence={s.technical.data.pages_submitted?.confidence}  limitations={s.technical.data.pages_submitted?.limitations} />
                    <DataRow label="Indexing Ratio"            value={s.technical.data.indexing_ratio?.value !== null ? `${s.technical.data.indexing_ratio?.value}%` : null} confidence={s.technical.data.indexing_ratio?.confidence || 0}  limitations={s.technical.data.indexing_ratio?.limitations} />
                    <DataRow label="Schema Markup Present"     value={s.technical.data.has_schema?.value ? 'Yes' : s.technical.data.has_schema?.value === false ? 'No' : null} confidence={s.technical.data.has_schema?.confidence || 0} limitations={s.technical.data.has_schema?.limitations} />
                    <DataRow label="Technical Health Score"    value={s.technical.data.technical_score?.value}    confidence={s.technical.data.technical_score?.confidence || 0} limitations={s.technical.data.technical_score?.limitations} />
                    {s.technical.data.issues?.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <div className="text-xs font-mono text-orange-400 uppercase tracking-wider mb-2">Issues Found</div>
                        {s.technical.data.issues.map((issue: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <AlertTriangle size={10} className="text-orange-400 shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                )}

                {/* Agent 2: Content */}
                {s?.content && (
                  <SectionCard title="Content & E-E-A-T Analyser" agent="Agent 2 — Fetches live HTML, AI analyses for quality signals"
                    ceiling={s.content.ceiling} icon={Brain} color="#8b5cf6" data={s.content.data}>
                    <DataRow label="E-E-A-T Score"             value={s.content.data.eeat_score?.value}               confidence={s.content.data.eeat_score?.confidence}               limitations={s.content.data.eeat_score?.limitations} />
                    <DataRow label="Content Authority Score"    value={s.content.data.content_authority_score?.value}  confidence={s.content.data.content_authority_score?.confidence}  limitations={s.content.data.content_authority_score?.limitations} />
                    <DataRow label="LLM Citation Readiness"     value={s.content.data.llm_readiness_score?.value}      confidence={s.content.data.llm_readiness_score?.confidence}      limitations={s.content.data.llm_readiness_score?.limitations} />
                    <DataRow label="Algorithm Health Score"     value={s.content.data.algorithm_health_score?.value}   confidence={s.content.data.algorithm_health_score?.confidence}   limitations={s.content.data.algorithm_health_score?.limitations} />
                    {s.content.data.eeat_evidence?.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-mono text-green-400 uppercase tracking-wider mb-2">E-E-A-T Evidence Found in Content</div>
                        {s.content.data.eeat_evidence.map((e: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs mb-1.5">
                            <CheckCircle2 size={10} className="text-green-400 shrink-0 mt-0.5" /><span>{e}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {s.content.data.gaps?.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-mono text-orange-400 uppercase tracking-wider mb-2">Content Gaps</div>
                        {s.content.data.gaps.map((g: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs mb-1.5">
                            <ChevronRight size={10} className="text-orange-400 shrink-0 mt-0.5" /><span className="text-muted-foreground">{g}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                )}

                {/* Agent 3: AI Visibility */}
                {s?.visibility && (
                  <SectionCard title="AI Visibility Tester" agent="Agent 3 — Live Perplexity test, brand mention count, LLM readiness estimate"
                    ceiling={s.visibility.ceiling} icon={Sparkles} color="hsl(var(--primary))" data={s.visibility.data}>
                    <DataRow label="Perplexity AI Mentions"  value={s.visibility.data.perplexity_citations?.value}  confidence={s.visibility.data.perplexity_citations?.confidence}  limitations={s.visibility.data.perplexity_citations?.limitations} />
                    <DataRow label="Google AI Overview"      value={null} confidence={0} limitations={['Requires authenticated Google session — not verifiable in automated analysis']} />
                    <DataRow label="ChatGPT Citations"       value={s.visibility.data.chatgpt_citations?.value}     confidence={s.visibility.data.chatgpt_citations?.confidence}     limitations={s.visibility.data.chatgpt_citations?.limitations} />
                    <DataRow label="Brand Mentions (Google)" value={s.visibility.data.brand_mentions?.value}        confidence={s.visibility.data.brand_mentions?.confidence}        limitations={s.visibility.data.brand_mentions?.limitations} />
                    <DataRow label="LLM Visibility Score"    value={s.visibility.data.llm_visibility_score?.value}  confidence={s.visibility.data.llm_visibility_score?.confidence}  limitations={s.visibility.data.llm_visibility_score?.limitations} />
                  </SectionCard>
                )}

                {/* Agent 4: Rankings */}
                {s?.ranking && (
                  <SectionCard title="Ranking & Competitive Intelligence" agent="Agent 4 — Live Google SERP per keyword, competitor domain checks"
                    ceiling={s.ranking.ceiling} icon={BarChart3} color="#4ade80" data={s.ranking.data}>
                    <DataRow label="Competitive Content Rank" value={s.ranking.data.competitor_rank?.value ? `#${s.ranking.data.competitor_rank.value}` : null} confidence={s.ranking.data.competitor_rank?.confidence || 0} limitations={s.ranking.data.competitor_rank?.limitations} />
                    {s.ranking.data.keyword_rankings?.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <CheckCircle2 size={10} className="text-cyan-400" />Live SERP Rankings — Verified Per Keyword
                        </div>
                        {s.ranking.data.keyword_rankings.map((k: any, i: number) => {
                          const col = k.found && k.page===1?'text-green-400':k.found&&k.page===2?'text-yellow-400':k.found?'text-orange-400':'text-muted-foreground';
                          return (
                            <div key={i} className="py-2 border-b border-border/40 last:border-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium">"{k.keyword}"</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`text-xs font-mono font-bold ${col}`}>{k.positionLabel}</span>
                                  <ConfBadge confidence={k.confidence || 78} />
                                </div>
                              </div>
                              {k.snippet && <p className="text-xs text-muted-foreground italic truncate">"{k.snippet}"</p>}
                              <p className="text-xs text-muted-foreground/60 mt-0.5">{k.limitation}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {s.ranking.data.competitor_data?.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Competitor Page Counts</div>
                        {s.ranking.data.competitor_data.map((c: any, i: number) => (
                          <DataRow key={i} label={c.domain} value={c.indexed_pages?.value} confidence={c.indexed_pages?.confidence || 0} limitations={c.indexed_pages?.limitations} />
                        ))}
                      </div>
                    )}
                  </SectionCard>
                )}

                {/* Synthesis */}
                {syn && (
                  <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />AI Synthesis — Built from Verified Data Above
                    </div>
                    {syn.biggest_verified_win && (
                      <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3 flex items-start gap-2">
                        <Globe size={14} className="text-yellow-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-mono text-yellow-400 uppercase tracking-wider mb-1">Biggest Verified Win</div>
                          <p className="text-sm">{syn.biggest_verified_win}</p>
                        </div>
                      </div>
                    )}
                    {syn.most_urgent_gap && (
                      <div className="rounded-xl border border-orange-400/20 bg-orange-400/5 p-3 flex items-start gap-2">
                        <AlertTriangle size={14} className="text-orange-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-mono text-orange-400 uppercase tracking-wider mb-1">Most Urgent Gap</div>
                          <p className="text-sm">{syn.most_urgent_gap}</p>
                        </div>
                      </div>
                    )}
                    {syn.verified_strengths?.length > 0 && (
                      <div>
                        <div className="text-xs font-mono text-green-400 uppercase tracking-wider mb-2">Verified Strengths</div>
                        {syn.verified_strengths.map((str: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm mb-1.5">
                            <CheckCircle2 size={13} className="text-green-400 shrink-0 mt-0.5" />{str}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Save / Sync row (bottom) */}
                <div className="rounded-2xl border border-border bg-card/60 p-5 flex flex-wrap gap-3">
                  <Button onClick={saveReport} disabled={saving}
                    className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
                    <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : savedId ? 'Saved ✓' : 'Save Audit Report'}
                  </Button>
                  {selectedProjectId && savedId && (
                    <Button onClick={syncToMetrics} disabled={syncing}
                      className="bg-green-500 hover:bg-green-600 text-white font-semibold">
                      <ArrowUpRight className="h-4 w-4 mr-2" />{syncing ? 'Syncing...' : 'Push to Client Dashboard'}
                    </Button>
                  )}
                  <div className="self-center text-xs text-muted-foreground">
                    {savedId ? '✓ Saved to project history' : 'Save to preserve and sync to dashboard'}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════
            MODE 2: STRATEGY REPORTS (SeoEngine)
        ════════════════════════ */}
        {mode === 'strategy' && (
          <>
            {/* Project selector for strategy mode */}
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <div className="space-y-1.5 mb-4">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Link to Project (recommended — enables deep context &amp; auto-save)
                </Label>
                <select
                  value={selectedProjectId}
                  onChange={e => setSelectedProjectId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-border bg-background/60 text-sm px-3"
                >
                  <option value="">— Run without project context —</option>
                  {(clients||[]).filter((c:any)=>c?.id).map(c => {
                    const cp = projects.filter(p => p.client_id === c.id);
                    if (!cp.length) return null;
                    return (
                      <optgroup key={c.id} label={`${c.name} — ${c.company}`}>
                        {cp.map(p => <option key={p.id} value={p.id}>{p.name} ({p.url})</option>)}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              {/* Show what context will be injected */}
              {selectedProject && (
                <div className="grid sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-xl border border-border bg-background/40 p-3">
                    <div className="font-mono text-primary uppercase tracking-wider mb-1">Keywords</div>
                    <div className="text-muted-foreground">
                      {selectedProject.keywords?.length
                        ? `${selectedProject.keywords.length} tracked keywords will be injected`
                        : 'None set — add in Admin'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/40 p-3">
                    <div className="font-mono text-primary uppercase tracking-wider mb-1">Competitors</div>
                    <div className="text-muted-foreground">
                      {selectedProject.competitors?.length
                        ? `${selectedProject.competitors.length} competitors will be referenced`
                        : 'None set — add in Admin'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/40 p-3">
                    <div className="font-mono text-primary uppercase tracking-wider mb-1">Previous Reports</div>
                    <div className="text-muted-foreground">
                      {strategyReports.length > 0
                        ? `${strategyReports.length} past reports will be cross-referenced`
                        : 'First audit for this project'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SeoEngine — the streaming report generator */}
            <SeoEngine
  key={selectedProjectId || 'standalone'}
  projectId={selectedProjectId || undefined}
  defaultUrl={selectedProject?.url || ''}
  defaultKeyword={selectedProject?.keywords?.[0] || ''}
  allKeywords={selectedProject?.keywords || []}
/>

            {/* Past strategy reports history */}
            {strategyReports.length > 0 && (
              <div className="rounded-xl border border-border bg-card/40 p-4 mt-8">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">
                  Past Strategy Reports for This Project
                </div>
                <div className="space-y-2">
                  {strategyReports.map(r => {
                    const sectionTypes = Object.keys(r.sections || {});
                    return (
                      <div key={r.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                        <div>
                          <span className="text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {sectionTypes.length > 0 && (
                            <span className="ml-3 text-primary font-mono">{sectionTypes.join(' · ')}</span>
                          )}
                        </div>
                        <span className="text-green-400 font-mono flex items-center gap-1">
                          <CheckCircle2 size={10} />Saved to project
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════
            MODE 3: SHOWROOM AUDIT (orchestrator)
        ════════════════════════ */}
        {mode === 'orchestrator' && (
          <>
            {/* Project + URL form */}
            <div className="rounded-2xl border border-border bg-card/60 p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Project <span className="text-orange-400">(required)</span>
                  </label>
                  <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
                    className="w-full h-10 rounded-lg border border-border bg-background/60 text-sm px-3">
                    <option value="">— Select a project —</option>
                    {(clients||[]).filter((c:any)=>c?.id).map(c => {
                      const cp = projects.filter(p => p.client_id === c.id);
                      if (!cp.length) return null;
                      return (
                        <optgroup key={c.id} label={`${c.name} — ${c.company}`}>
                          {cp.map(p => <option key={p.id} value={p.id}>{p.name} ({p.url})</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Audit Depth</label>
                  <div className="flex gap-2 h-10">
                    {(['quick','standard','deep'] as const).map(m => (
                      <button key={m} onClick={() => setOrchMode(m)}
                        className={`flex-1 rounded-lg border text-xs font-semibold capitalize transition-all ${
                          orchMode === m
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border bg-background/40 text-muted-foreground hover:text-foreground'
                        }`}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  URLs to audit — one per line or comma separated
                </label>
                <textarea
                  value={orchUrls}
                  onChange={e => setOrchUrls(e.target.value)}
                  placeholder={`https://example.com\nhttps://example.com/services\nhttps://example.com/about`}
                  rows={4}
                  className="w-full rounded-lg border border-border bg-background/60 text-sm px-3 py-2 resize-none font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Max 10 pages. Each page is audited against the project's keywords and your latest algorithm knowledge.
                </p>
              </div>

              <Button onClick={runOrchestrator} disabled={orchLoading || !selectedProjectId}
                className="w-full h-12 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold text-base">
                {orchLoading ? (
                  <span className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin" />Auditing pages...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />Run Showroom Audit
                  </span>
                )}
              </Button>
            </div>

            {/* Live progress feed */}
            {orchEvents.length > 0 && (
              <div className="rounded-xl border border-border bg-card/40 p-4">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Live Progress</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {orchEvents.map((ev, i) => {
                    const icon =
                      ev.type === 'page_done'     ? <CheckCircle2 size={11} className="text-green-400 shrink-0" /> :
                      ev.type === 'page_failed'   ? <XCircle      size={11} className="text-red-400 shrink-0"   /> :
                      ev.type === 'complete'      ? <CheckCircle2 size={11} className="text-primary shrink-0"   /> :
                                                    <CircleDot     size={11} className="text-muted-foreground shrink-0 animate-pulse" />;
                    const label =
                      ev.type === 'start'          ? 'Audit started' :
                      ev.type === 'page_crawling'  ? `Crawling ${ev.url}` :
                      ev.type === 'page_analysing' ? `Analysing ${ev.url}` :
                      ev.type === 'page_done'      ? `Done: ${ev.url} — score ${ev.result?.signals?.page_score ?? '?'}/100` :
                      ev.type === 'page_failed'    ? `Failed: ${ev.url}` :
                      ev.type === 'synthesizing'   ? 'Synthesizing cross-page patterns…' :
                      ev.type === 'pipeline_done'  ? 'Pipeline complete — learnings saved' :
                      ev.type === 'complete'       ? `Audit complete` :
                      ev.progress || ev.type;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {icon}
                        <span className={ev.type === 'complete' ? 'text-primary font-semibold' : 'text-muted-foreground'}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Per-page results */}
            {Object.keys(orchPageResults).length > 0 && (
              <div className="space-y-4">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Page Results</div>
                {Object.entries(orchPageResults).map(([pageUrl, res]: [string, any]) => {
                  const sig = res.signals;
                  const score = sig?.page_score ?? 0;
                  const scoreColor = score >= 75 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-orange-400';
                  const isOpen = orchExpanded[pageUrl] !== false;
                  return (
                    <div key={pageUrl} className="rounded-2xl border border-border bg-card/60 overflow-hidden">
                      {/* Page header */}
                      <button
                        onClick={() => setOrchExpanded(prev => ({ ...prev, [pageUrl]: !prev[pageUrl] }))}
                        className="w-full flex items-center justify-between px-5 py-3 border-b border-border bg-background/40 text-left hover:bg-background/60 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          {res.status === 'success'
                            ? <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                            : <XCircle size={14} className="text-red-400 shrink-0" />}
                          <span className="text-sm font-mono truncate">{pageUrl}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          {sig && <span className={`text-lg font-black ${scoreColor}`}>{score}<span className="text-xs font-normal text-muted-foreground">/100</span></span>}
                          {res.learningSaved > 0 && (
                            <span className="text-xs bg-primary/10 border border-primary/20 text-primary rounded-full px-2 py-0.5 font-mono">
                              +{res.learningSaved} learnings
                            </span>
                          )}
                          <ChevronRight size={14} className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                        </div>
                      </button>

                      {isOpen && sig && (
                        <div className="p-5 space-y-5">
                          {/* Keyword Coverage */}
                          {sig.keyword_coverage?.length > 0 && (
                            <div>
                              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Keyword Coverage</div>
                              <div className="space-y-1.5">
                                {sig.keyword_coverage.map((kc: any, i: number) => (
                                  <div key={i} className="flex items-center gap-3 text-xs">
                                    <span className="w-40 truncate text-muted-foreground">"{kc.keyword}"</span>
                                    <div className="flex items-center gap-1">
                                      {(['in_title','in_h1','in_meta','in_h2','in_content'] as const).map(field => (
                                        <span key={field} title={field.replace('in_','')}
                                          className={`h-2 w-2 rounded-full ${(kc as any)[field] ? 'bg-green-400' : 'bg-border'}`} />
                                      ))}
                                    </div>
                                    <span className={`font-mono font-bold ml-auto ${kc.score >= 70 ? 'text-green-400' : kc.score >= 40 ? 'text-yellow-400' : 'text-orange-400'}`}>
                                      {kc.score}/100
                                    </span>
                                  </div>
                                ))}
                                <div className="text-xs text-muted-foreground/60 mt-1">Dots: title · H1 · meta · H2 · content</div>
                              </div>
                            </div>
                          )}

                          {/* Algorithm Compliance */}
                          {sig.algo_compliance?.length > 0 && (
                            <div>
                              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Algorithm Compliance</div>
                              <div className="space-y-2">
                                {sig.algo_compliance.map((ac: any, i: number) => {
                                  const cfg =
                                    ac.status === 'compliant' ? { color: 'text-green-400',  bg: 'bg-green-400/8  border-green-400/20',  icon: <CheckCircle2 size={11} className="text-green-400 shrink-0" /> } :
                                    ac.status === 'partial'   ? { color: 'text-yellow-400', bg: 'bg-yellow-400/8 border-yellow-400/20', icon: <AlertTriangle size={11} className="text-yellow-400 shrink-0" /> } :
                                    ac.status === 'failing'   ? { color: 'text-red-400',    bg: 'bg-red-400/8    border-red-400/20',    icon: <XCircle size={11} className="text-red-400 shrink-0" /> } :
                                                                { color: 'text-muted-foreground', bg: 'bg-secondary/30 border-border',  icon: <CircleDot size={11} className="text-muted-foreground shrink-0" /> };
                                  return (
                                    <div key={i} className={`rounded-lg border p-2.5 ${cfg.bg}`}>
                                      <div className="flex items-center gap-2 mb-1">
                                        {cfg.icon}
                                        <span className={`text-xs font-semibold ${cfg.color}`}>{ac.topic}</span>
                                        <span className={`text-xs ml-auto font-mono capitalize ${cfg.color}`}>{ac.status}</span>
                                      </div>
                                      <p className="text-xs text-muted-foreground">{ac.evidence}</p>
                                      {ac.action && <p className="text-xs text-primary mt-1">{ac.action}</p>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Issues */}
                          {sig.issues?.filter((iss: any) => iss.severity === 'critical' || iss.severity === 'high').length > 0 && (
                            <div>
                              <div className="text-xs font-mono text-orange-400 uppercase tracking-wider mb-2">Critical Issues</div>
                              <div className="space-y-2">
                                {sig.issues.filter((iss: any) => iss.severity === 'critical' || iss.severity === 'high').map((iss: any, i: number) => (
                                  <div key={i} className="rounded-lg border border-orange-400/20 bg-orange-400/5 p-2.5">
                                    <div className="flex items-center gap-2 mb-1">
                                      <AlertTriangle size={11} className="text-orange-400 shrink-0" />
                                      <span className="text-xs font-semibold text-orange-400 capitalize">{iss.severity}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{iss.detail}</p>
                                    {iss.fix && <p className="text-xs text-primary mt-1">Fix: {iss.fix}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Opportunities */}
                          {sig.opportunities?.filter((op: any) => op.effort === 'low').length > 0 && (
                            <div>
                              <div className="text-xs font-mono text-green-400 uppercase tracking-wider mb-2">Quick Wins</div>
                              <div className="space-y-2">
                                {sig.opportunities.filter((op: any) => op.effort === 'low').map((op: any, i: number) => (
                                  <div key={i} className="rounded-lg border border-green-400/20 bg-green-400/5 p-2.5">
                                    <div className="flex items-center gap-2 mb-1">
                                      <TrendingUp size={11} className="text-green-400 shrink-0" />
                                      <span className="text-xs font-semibold text-green-400">{op.action}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{op.evidence}</p>
                                    <p className="text-xs text-primary mt-1">Impact: {op.impact}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Cross-page synthesis */}
            {orchSynthesis && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="h-4 w-4 text-primary" />
                  <div className="text-sm font-semibold">Cross-Page Synthesis</div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{orchSynthesis}</p>
              </div>
            )}

            {orchComplete && (
              <div className="rounded-xl border border-green-400/20 bg-green-400/5 px-5 py-3 flex items-center gap-3">
                <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                <p className="text-sm text-green-400 font-semibold">
                  Audit complete — findings saved to Brain Learnings and will inform future strategy recommendations.
                </p>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}