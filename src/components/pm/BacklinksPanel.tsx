/* ════════════════════════════════════════════════════════════════
   src/components/pm/BacklinksPanel.tsx

   BDE → Backlink Strategy module.

   Inputs: URL (required), target keywords, budget tier, competitor
   URLs, geography, free-text context, lens picker (Senior DMS + BDE
   extensions + custom), deep-audit toggle.

   Output: rendered Senior-DMS-grade brief (executive summary,
   current state, opportunity sections by category, 90-day plan,
   what-not-to-do, caveats). Downloadable as Word / PDF via the
   shared stakeholder-export path. Saved as workspace artifact.

   Prior briefs for this project listed in the sidebar for re-load.
════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Link2, Loader2, AlertCircle, FileDown, ExternalLink, Download, Users, Search, Plus, X, ChevronDown, ChevronRight, Database, Target, ListFilter,
} from 'lucide-react';
import {
  backlinkLenses, backlinkList, backlinkLoad, backlinkRun, backlinkStatus,
  backlinkAssetsList, backlinkAssetUpdate, backlinkCompetitorMap, backlinkCompetitorBatch, backlinkCompetitorList,
  type BacklinkInputs, type BacklinkListItem, type CompareLens, type CompareSelectedLens, type BacklinkAsset, type CompetitorMapItem,
} from '@/components/pm/api';
import { downloadStakeholderReport, downloadStakeholderAsWord, openStakeholderReport, mdToHtml } from '@/lib/reportExport';
import { useToast } from '@/hooks/use-toast';
import { useProject } from '@/contexts/ProjectContext';

type SubTab = 'brief' | 'assets' | 'competitor';

interface Props {
  projectId: string;
  /** Build 12.1: when set, this panel runs in BDE scope. Asset library
      defaults to cross-project + bde_standalone; new briefs inherit the
      scope. When omitted, panel runs in project scope. */
  bdeMode?: boolean;
  /** When provided in BDE mode, the new brief is linked to this lead.
      Without it, the brief is BDE-standalone. */
  leadId?: string | null;
}

export default function BacklinksPanel({ projectId, bdeMode = false, leadId = null }: Props) {
  const { toast } = useToast();

  // Build 12.2 — read the project's rich derived context so we can
  // auto-populate inputs in PM mode. Skipped in BDE mode where the
  // operator is researching prospects, not working with a saved project.
  const { brainContext } = useProject();

  // Inputs
  const [clientUrl, setClientUrl] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [budgetTier, setBudgetTier] = useState<'low' | 'medium' | 'high' | 'enterprise' | ''>('');
  const [competitorsText, setCompetitorsText] = useState('');
  const [geography, setGeography] = useState('');
  const [context, setContext] = useState('');
  const [deepAudit, setDeepAudit] = useState(false);
  // Build 12.1 — optional path filter narrows audit to a section like /products/*
  const [pathFilter, setPathFilter] = useState('');

  // Build 12.2 — track which fields were auto-populated from the project,
  // so we can: (a) show a "from project" badge next to those fields,
  // (b) re-populate when the project changes WITHOUT clobbering operator
  // edits. If the operator types something new in a field, we mark it
  // dirty and stop overwriting on subsequent project changes.
  const [autofilled, setAutofilled] = useState<{ [k: string]: boolean }>({});
  const [dirty, setDirty] = useState<{ [k: string]: boolean }>({});

  // Mark a field dirty when the operator edits it manually. This wraps
  // each setter so the autofill effect knows what NOT to overwrite.
  const editClientUrl = (v: string) => { setClientUrl(v); setDirty(d => ({ ...d, clientUrl: true })); setAutofilled(a => ({ ...a, clientUrl: false })); };
  const editKeywords = (v: string) => { setKeywordsText(v); setDirty(d => ({ ...d, keywordsText: true })); setAutofilled(a => ({ ...a, keywordsText: false })); };
  const editCompetitors = (v: string) => { setCompetitorsText(v); setDirty(d => ({ ...d, competitorsText: true })); setAutofilled(a => ({ ...a, competitorsText: false })); };
  const editGeography = (v: string) => { setGeography(v); setDirty(d => ({ ...d, geography: true })); setAutofilled(a => ({ ...a, geography: false })); };

  // Lens picker — defaults to Senior DMS
  const [lensCatalog, setLensCatalog] = useState<CompareLens[]>([]);
  const [pickedLensIds, setPickedLensIds] = useState<Set<string>>(new Set(['senior_dm']));
  const [customLens, setCustomLens] = useState('');

  // Prior briefs
  const [history, setHistory] = useState<BacklinkListItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showInputs, setShowInputs] = useState(true);

  // Run / result
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ title?: string; brief_md?: string; brief_id?: string } | null>(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);

  /* ─── Build 12.1: sub-tab state ────────────────────────────────
     'brief'      — the original generate-brief flow
     'assets'     — the backlink asset library (filterable across scopes)
     'competitor' — single competitor map + batch comparative matrix */
  const [subTab, setSubTab] = useState<SubTab>('brief');

  // Asset library state
  const [assets, setAssets] = useState<BacklinkAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetScope, setAssetScope] = useState<'project' | 'cross_project' | 'bde_standalone' | 'all'>(bdeMode ? 'all' : 'project');
  const [assetSearch, setAssetSearch] = useState('');
  const [assetCategory, setAssetCategory] = useState('');
  const [assetIndustry, setAssetIndustry] = useState('');

  // Competitor mapping state
  const [competitorMode, setCompetitorMode] = useState<'single' | 'batch'>('single');
  const [competitorUrl, setCompetitorUrl] = useState('');
  const [competitorBatchText, setCompetitorBatchText] = useState('');
  const [competitorForClient, setCompetitorForClient] = useState('');
  const [competitorContext, setCompetitorContext] = useState('');
  const [competitorRunning, setCompetitorRunning] = useState(false);
  const [competitorResult, setCompetitorResult] = useState<{ kind: 'single' | 'batch'; summary?: string; goods?: string[]; bads?: string[]; estimated_top_referrers?: string[]; comparison_md?: string } | null>(null);
  const [competitorHistory, setCompetitorHistory] = useState<CompetitorMapItem[]>([]);

  // Load lens catalog once
  useEffect(() => {
    backlinkLenses().then(r => { if (r.success && Array.isArray(r.lenses)) setLensCatalog(r.lenses); });
  }, []);

  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    setLoadingHistory(true);
    try {
      const r = await backlinkList(projectId);
      if (r.success && Array.isArray(r.items)) setHistory(r.items);
    } finally { setLoadingHistory(false); }
  }, [projectId]);

  // Reset on project switch
  useEffect(() => {
    setClientUrl(''); setKeywordsText(''); setBudgetTier(''); setCompetitorsText('');
    setGeography(''); setContext(''); setDeepAudit(false);
    setPickedLensIds(new Set(['senior_dm'])); setCustomLens('');
    setResult(null); setError(''); setHistory([]); setElapsed(0); setShowInputs(true);
    // Reset autofill tracking too — new project, fresh slate
    setAutofilled({}); setDirty({});
    loadHistory();
  }, [projectId, loadHistory]);

  // Build 12.2 — auto-populate inputs from the project's brainContext.
  // Runs after the project-switch reset above (because brainContext
  // changes shortly after projectId does). Only fills fields the operator
  // has NOT manually edited. Skipped entirely in BDE mode.
  useEffect(() => {
    if (bdeMode) return;
    if (!brainContext) return;

    // URL — primary auto-fill. If the project has a URL and operator hasn't typed one, use it.
    if (brainContext.url && !dirty.clientUrl) {
      setClientUrl(brainContext.url);
      setAutofilled(a => ({ ...a, clientUrl: true }));
    }

    // Keywords — array → newline-joined for the textarea
    if (Array.isArray(brainContext.keywords) && brainContext.keywords.length && !dirty.keywordsText) {
      setKeywordsText(brainContext.keywords.slice(0, 20).join('\n'));
      setAutofilled(a => ({ ...a, keywordsText: true }));
    }

    // Competitors — array → newline-joined
    if (Array.isArray(brainContext.competitors) && brainContext.competitors.length && !dirty.competitorsText) {
      setCompetitorsText(brainContext.competitors.slice(0, 10).join('\n'));
      setAutofilled(a => ({ ...a, competitorsText: true }));
    }

    // Geography — from project.country
    if (brainContext.country && !dirty.geography) {
      setGeography(brainContext.country);
      setAutofilled(a => ({ ...a, geography: true }));
    }
    // Note: industry from brainContext flows naturally to the engine via the
    // on-site audit (the audit DERIVES industry). We could pre-feed it but the
    // engine's own inference is more honest — uses what the site actually says.
  }, [bdeMode, brainContext, dirty.clientUrl, dirty.keywordsText, dirty.competitorsText, dirty.geography]);

  // Elapsed timer during run
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [running]);

  // Build 12.3 — live progress state
  const [progress, setProgress] = useState<{ stage: string; lanes_done: number; lanes_total: number; elapsed_seconds: number | null; error_message?: string | null } | null>(null);

  const run = async () => {
    setError('');
    if (!clientUrl.trim()) { setError('Client website URL is required.'); return; }
    setRunning(true);
    setResult(null);
    setElapsed(0);
    setProgress({ stage: 'starting', lanes_done: 0, lanes_total: 6, elapsed_seconds: 0 });

    // Build 12.3 — client-generated request id lets the polling endpoint
    // find this run's row even if we never get the brief_id back (e.g. if
    // the long-running fetch is killed by the browser).
    const clientReqId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Start polling status every 3s in parallel with the long-running fetch
    let pollHandle: any = null;
    let pollFailures = 0;
    const startPolling = () => {
      pollHandle = setInterval(async () => {
        try {
          const s = await backlinkStatus({ client_request_id: clientReqId });
          if (s.success) {
            pollFailures = 0;
            setProgress({
              stage: s.stage || s.status || 'running',
              lanes_done: typeof s.lanes_done === 'number' ? s.lanes_done : 0,
              lanes_total: typeof s.lanes_total === 'number' ? s.lanes_total : 6,
              elapsed_seconds: typeof s.elapsed_seconds === 'number' ? s.elapsed_seconds : null,
              error_message: s.error_message,
            });
            if (s.status === 'failed' || s.status === 'timed_out') {
              // Server marked it failed — stop polling, surface message
              clearInterval(pollHandle);
              setError(s.error_message || `Brief ${s.status}.`);
            }
          } else {
            pollFailures += 1;
            // Up to 3 missed polls before we just stop the polling
            // without breaking the foreground fetch
            if (pollFailures >= 3) clearInterval(pollHandle);
          }
        } catch { /* tolerate transient poll errors */ }
      }, 3000);
    };
    // Wait 4s before starting polls so the server has time to insert the row
    const pollStartTimer = setTimeout(startPolling, 4000);

    try {
      const lenses: CompareSelectedLens[] = [];
      pickedLensIds.forEach(id => lenses.push({ kind: 'preset', id }));
      const customTrim = customLens.trim();
      if (customTrim.length >= 5) lenses.push({ kind: 'custom', description: customTrim });

      const inputs: BacklinkInputs = {
        client_url: clientUrl.trim(),
        target_keywords: keywordsText.trim() ? keywordsText.split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 20) : undefined,
        budget_tier: budgetTier || undefined,
        competitor_urls: competitorsText.trim() ? competitorsText.split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 10) : undefined,
        geography: geography.trim() || undefined,
        context: context.trim() || undefined,
        lenses: lenses.length ? lenses : undefined,
        deep_audit: deepAudit,
      };
      // Build 12.1 — scope inference + path filter
      const extras: any = {};
      if (pathFilter.trim()) extras.path_filter = pathFilter.trim();
      if (bdeMode) {
        extras.scope = leadId ? 'bde_lead' : 'bde_standalone';
        if (leadId) extras.lead_id = leadId;
      }
      // Merge extras into inputs (path_filter, scope, lead_id are server-side recognised)
      const fullInputs: any = { ...inputs, ...extras };

      const r = await backlinkRun({
        projectId: bdeMode && !leadId ? undefined as any : projectId,
        inputs: fullInputs,
        client_request_id: clientReqId,
      });
      clearTimeout(pollStartTimer);
      if (pollHandle) clearInterval(pollHandle);
      if (!r.success) { setError(r.error || 'Brief generation failed.'); return; }
      setResult({ title: r.title, brief_md: r.brief_md, brief_id: r.brief_id });
      setProgress(null);
      setShowInputs(false);
      toast({ title: 'Brief ready', description: r.brief_id ? 'Saved to project history.' : 'Returned in-memory only.' });
      loadHistory();
    } catch (e: any) {
      clearTimeout(pollStartTimer);
      if (pollHandle) clearInterval(pollHandle);
      // If the foreground fetch died (browser timeout, network error) but
      // the server is still running, attempt one final status check before
      // giving up — the brief may have actually completed.
      try {
        const final = await backlinkStatus({ client_request_id: clientReqId });
        if (final.success && final.complete && final.brief_md) {
          setResult({ title: final.title, brief_md: final.brief_md, brief_id: final.brief_id });
          setProgress(null);
          setShowInputs(false);
          toast({ title: 'Brief recovered', description: 'Foreground request lost but server completed the brief.' });
          loadHistory();
          return;
        }
        if (final.success && final.error_message) {
          setError(final.error_message);
          setProgress(null);
          return;
        }
      } catch { /* fall through to original error */ }
      setError(e?.message || 'Brief generation failed.');
    } finally {
      setRunning(false);
    }
  };

  const loadPrior = async (id: string) => {
    setError('');
    const r = await backlinkLoad({ projectId, briefId: id });
    if (!r.success || !r.brief) { setError(r.error || 'Could not load brief.'); return; }
    setResult({ title: r.brief.inputs_json?.client_url ? `Backlink Strategy Brief · ${r.brief.client_url}` : 'Backlink Strategy Brief', brief_md: r.brief.brief_md, brief_id: r.brief.id });
    setShowInputs(false);
  };

  /* ─── Build 12.1: asset library loader ─────────────────────── */
  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const r = await backlinkAssetsList({
        projectId: bdeMode ? null : projectId,
        leadId: leadId || undefined,
        scope: assetScope,
        search: assetSearch.trim() || undefined,
        category: assetCategory || undefined,
        industry: assetIndustry.trim() || undefined,
        limit: 200,
      });
      if (r.success && Array.isArray(r.items)) setAssets(r.items);
    } finally { setAssetsLoading(false); }
  }, [projectId, leadId, bdeMode, assetScope, assetSearch, assetCategory, assetIndustry]);

  useEffect(() => { if (subTab === 'assets') loadAssets(); }, [subTab, loadAssets]);

  const onAssetStatusChange = async (assetId: string, status: string) => {
    const r = await backlinkAssetUpdate({ assetId, status });
    if (r.success) {
      setAssets(prev => prev.map(a => a.id === assetId ? { ...a, status } : a));
      toast({ title: 'Status updated' });
    } else {
      toast({ title: 'Update failed', description: r.error, variant: 'destructive' });
    }
  };

  /* ─── Build 12.1: competitor mapping handlers ───────────────── */
  const loadCompetitorHistory = useCallback(async () => {
    const r = await backlinkCompetitorList({
      projectId: bdeMode ? null : projectId,
      leadId: leadId || undefined,
      scope: bdeMode ? (leadId ? 'bde_lead' : 'bde_standalone') : 'project',
      limit: 50,
    });
    if (r.success && Array.isArray(r.items)) setCompetitorHistory(r.items);
  }, [projectId, leadId, bdeMode]);

  useEffect(() => { if (subTab === 'competitor') loadCompetitorHistory(); }, [subTab, loadCompetitorHistory]);

  const runCompetitorSingle = async () => {
    setError('');
    if (!competitorUrl.trim()) { setError('Competitor URL is required.'); return; }
    setCompetitorRunning(true);
    setCompetitorResult(null);
    try {
      const r = await backlinkCompetitorMap({
        projectId: bdeMode ? null : projectId,
        leadId: leadId || undefined,
        scope: bdeMode ? (leadId ? 'bde_lead' : 'bde_standalone') : 'project',
        competitor_url: competitorUrl.trim(),
        for_client_url: competitorForClient.trim() || undefined,
        context: competitorContext.trim() || undefined,
      });
      if (!r.success) { setError(r.error || 'Competitor map failed.'); return; }
      setCompetitorResult({ kind: 'single', summary: r.summary, goods: r.goods, bads: r.bads, estimated_top_referrers: r.estimated_top_referrers });
      loadCompetitorHistory();
    } catch (e: any) { setError(e?.message || 'Failed.'); }
    finally { setCompetitorRunning(false); }
  };

  const runCompetitorBatchHandler = async () => {
    setError('');
    const urls = competitorBatchText.split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, 5);
    if (urls.length < 2) { setError('Batch mode needs at least 2 competitor URLs (max 5).'); return; }
    setCompetitorRunning(true);
    setCompetitorResult(null);
    try {
      const r = await backlinkCompetitorBatch({
        projectId: bdeMode ? null : projectId,
        leadId: leadId || undefined,
        scope: bdeMode ? (leadId ? 'bde_lead' : 'bde_standalone') : 'project',
        competitor_urls: urls,
        for_client_url: competitorForClient.trim() || undefined,
        context: competitorContext.trim() || undefined,
      });
      if (!r.success) { setError(r.error || 'Batch competitor mapping failed.'); return; }
      setCompetitorResult({ kind: 'batch', comparison_md: r.comparison_md });
      loadCompetitorHistory();
    } catch (e: any) { setError(e?.message || 'Failed.'); }
    finally { setCompetitorRunning(false); }
  };

  // Derived: unique categories + industries from current assets, for the filter chips
  const assetCategories = useMemo(() => Array.from(new Set(assets.map(a => a.category))).sort(), [assets]);
  const assetIndustries = useMemo(() => Array.from(new Set(assets.flatMap(a => a.industries_fit || []))).sort(), [assets]);

  // Export
  const meta = () => ({ title: result?.title || 'Backlink Strategy Brief', kind: 'Backlink Strategy', generatedAt: new Date().toISOString() });
  const downloadAsWord = () => { if (!result?.brief_md) return; downloadStakeholderAsWord(result.brief_md, meta()); toast({ title: 'Word document downloaded' }); };
  const downloadAsHtml = () => { if (!result?.brief_md) return; downloadStakeholderReport(result.brief_md, meta()); toast({ title: 'HTML downloaded' }); };
  const openAsPdf = () => { if (!result?.brief_md) return; openStakeholderReport(result.brief_md, meta()); toast({ title: 'Opened in new tab', description: 'Use Cmd/Ctrl-P → Save as PDF.' }); };
  const copy = async () => { if (!result?.brief_md) return; try { await navigator.clipboard.writeText(result.brief_md); toast({ title: 'Copied to clipboard' }); } catch { /* noop */ } };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <Link2 className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Backlink Strategy {bdeMode ? '(BDE)' : 'Brief'}</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Senior-DMS-grade backlink intelligence from just a website URL. Audits the site, derives industry and audience, runs research across six categories (digital PR, resource pages, broken-link reclamation, expert quotes, AI-Overview citation, partnerships), and produces a client-ready strategic brief. Designed for 2026 SEO and AI-search dynamics — topic relevance, AI Overview citation, and entity association matter as much as DA.
        </p>
      </div>

      {/* Sub-tabs: Brief generation / Asset library / Competitor mapping */}
      <div className="flex gap-1 border-b border-border">
        {([
          ['brief', 'Generate Brief', Link2],
          ['assets', 'Asset Library', Database],
          ['competitor', 'Competitor Map', Target],
        ] as [SubTab, string, any][]).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              subTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {subTab === 'brief' && (
      <div className="grid lg:grid-cols-[1fr_240px] gap-4">
        <div className="space-y-4 min-w-0">
          {/* Inputs */}
          {showInputs && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Inputs</h3>
                {result && (
                  <button onClick={() => setShowInputs(false)} className="text-xs text-muted-foreground hover:text-foreground">Hide ▲</button>
                )}
              </div>

              {/* URL */}
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">
                  Client website URL <span className="text-red-400">*</span>
                  {autofilled.clientUrl && (
                    <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 normal-case font-normal tracking-normal">from project</span>
                  )}
                </label>
                <input
                  value={clientUrl}
                  onChange={e => editClientUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                />
              </div>

              {/* Target keywords */}
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">
                  Target keywords <span className="text-muted-foreground/60 text-[10px] normal-case font-normal">· optional · comma or newline separated · max 20</span>
                  {autofilled.keywordsText && (
                    <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 normal-case font-normal tracking-normal">from project</span>
                  )}
                </label>
                <textarea
                  value={keywordsText}
                  onChange={e => editKeywords(e.target.value)}
                  rows={2}
                  placeholder="What does the client want to rank for? One per line or comma-separated."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground resize-y"
                />
              </div>

              {/* Budget + geography row */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">Budget tier <span className="text-muted-foreground/60 text-[10px] normal-case font-normal">· optional</span></label>
                  <select
                    value={budgetTier}
                    onChange={e => setBudgetTier(e.target.value as any)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                  >
                    <option value="">— not set —</option>
                    <option value="low">Low (under £1k/mo)</option>
                    <option value="medium">Medium (£1k–£5k/mo)</option>
                    <option value="high">High (£5k–£20k/mo)</option>
                    <option value="enterprise">Enterprise (£20k+/mo)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">
                    Geography <span className="text-muted-foreground/60 text-[10px] normal-case font-normal">· optional</span>
                    {autofilled.geography && (
                      <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 normal-case font-normal tracking-normal">from project</span>
                    )}
                  </label>
                  <input
                    value={geography}
                    onChange={e => editGeography(e.target.value)}
                    placeholder="UK / US-east / global"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                  />
                </div>
              </div>

              {/* Competitor URLs */}
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">
                  Competitor URLs <span className="text-muted-foreground/60 text-[10px] normal-case font-normal">· optional · max 10</span>
                  {autofilled.competitorsText && (
                    <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 normal-case font-normal tracking-normal">from project</span>
                  )}
                </label>
                <textarea
                  value={competitorsText}
                  onChange={e => editCompetitors(e.target.value)}
                  rows={2}
                  placeholder="competitor1.com&#10;competitor2.com"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground resize-y"
                />
              </div>

              {/* Operator context */}
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">Operator context <span className="text-muted-foreground/60 text-[10px] normal-case font-normal">· optional · be specific</span></label>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  rows={3}
                  placeholder="Anything specific about this client's situation — past link issues, current PR coverage, why they're asking now, what they tried before. The more concrete, the better the brief."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground resize-y"
                />
              </div>

              {/* Lens picker */}
              {lensCatalog.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users className="h-3 w-3 text-primary" />
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Stakeholder lenses <span className="text-muted-foreground/60 normal-case font-normal">· Senior DMS recommended by default</span></label>
                  </div>
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-1.5">
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
                          className={`text-left text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-2 ${picked ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
                        >
                          <span className={`inline-block w-3 h-3 rounded border ${picked ? 'border-primary bg-primary/30' : 'border-border'} flex items-center justify-center text-[9px] leading-none`}>
                            {picked ? '✓' : ''}
                          </span>
                          <span className="truncate">{lens.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={customLens}
                    onChange={e => setCustomLens(e.target.value)}
                    placeholder="Custom reader description (optional) — describe a reader not in the preset list"
                    className="w-full mt-2 text-[11px] px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground"
                  />
                </div>
              )}

              {/* Deep audit toggle */}
              <label className="flex items-start gap-2 cursor-pointer group">
                <input type="checkbox" checked={deepAudit} onChange={e => setDeepAudit(e.target.checked)} className="mt-0.5 cursor-pointer" />
                <div>
                  <div className="text-xs font-medium text-foreground/90">Deep audit (fetch /about, /press, /blog, etc.)</div>
                  <div className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">Adds 1-2 minutes and richer audit signals. Useful when the homepage alone does not describe the business well.</div>
                </div>
              </label>

              {/* Build 12.1 — path filter for page-scoped analysis */}
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">
                  Path filter <span className="text-muted-foreground/60 normal-case font-normal text-[10px]">· optional · narrow audit to a section</span>
                </label>
                <input
                  value={pathFilter}
                  onChange={e => setPathFilter(e.target.value)}
                  placeholder="/products/* — leave empty for whole domain"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                />
              </div>

              {/* Run */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={run}
                    disabled={running || !clientUrl.trim()}
                    className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                  >
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    {running ? `Generating brief… ${elapsed}s` : 'Generate brief'}
                  </button>
                  {!running && (
                    <div className="text-[10px] text-muted-foreground">Typically 90-240 seconds; may run up to ~5 minutes in heavy load.</div>
                  )}
                </div>

                {/* Build 12.3 — live progress with per-stage label */}
                {running && progress && (
                  <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-foreground/90">
                        {progress.stage === 'starting' && 'Starting up…'}
                        {progress.stage === 'audit_running' && '1/3 · Auditing the website'}
                        {progress.stage === 'lanes_running' && `2/3 · Running 6 parallel research lanes`}
                        {progress.stage === 'synthesizing' && '3/3 · Synthesizing the brief (the long one)'}
                        {progress.stage === 'extracting_assets' && '3/3 · Saving assets to the registry'}
                        {progress.stage === 'complete' && 'Wrapping up…'}
                        {(progress.stage === 'failed' || progress.stage === 'timed_out') && 'Stopped'}
                        {!['starting','audit_running','lanes_running','synthesizing','extracting_assets','complete','failed','timed_out'].includes(progress.stage) && progress.stage}
                      </span>
                      <span className="text-muted-foreground">
                        {progress.elapsed_seconds !== null && `server elapsed: ${progress.elapsed_seconds}s`}
                      </span>
                    </div>
                    {/* Step pips */}
                    <div className="flex items-center gap-1">
                      {(['audit_running','lanes_running','synthesizing','extracting_assets','complete'] as const).map((stage, i, arr) => {
                        const currentIdx = arr.indexOf(progress.stage as any);
                        const stageIdx = i;
                        const active = stageIdx === currentIdx;
                        const done = currentIdx >= 0 && stageIdx < currentIdx;
                        return (
                          <div
                            key={stage}
                            className={`h-1 flex-1 rounded ${
                              done ? 'bg-primary' : active ? 'bg-primary/50 animate-pulse' : 'bg-muted'
                            }`}
                          />
                        );
                      })}
                    </div>
                    {progress.stage === 'synthesizing' && (
                      <div className="text-[10px] text-muted-foreground italic">
                        This step is the slowest — one big LLM call producing the full brief. 30-90 seconds typical, up to 2 minutes in load.
                      </div>
                    )}
                    {progress.error_message && (
                      <div className="text-[10px] text-amber-400">{progress.error_message}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {!showInputs && (
            <button onClick={() => setShowInputs(true)} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground">
              Show inputs ▼
            </button>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1">{error}</div>
              <button onClick={() => setError('')} className="text-red-400/60 hover:text-red-400">✕</button>
            </div>
          )}

          {/* Result */}
          {result?.brief_md && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-semibold">{result.title || 'Backlink Strategy Brief'}</h3>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={downloadAsWord} className="text-xs px-3 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 flex items-center gap-1.5 font-medium">
                    <FileDown className="h-3 w-3" /> Word
                  </button>
                  <button onClick={openAsPdf} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1.5">
                    <ExternalLink className="h-3 w-3" /> Open as PDF
                  </button>
                  <button onClick={downloadAsHtml} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1.5">
                    <Download className="h-3 w-3" /> HTML
                  </button>
                  <button onClick={copy} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted">Copy raw</button>
                </div>
              </div>
              <div
                className="backlink-preview prose prose-sm prose-invert max-w-none text-foreground/90"
                dangerouslySetInnerHTML={{ __html: mdToHtml(result.brief_md || '') }}
              />
              {result.brief_id && (
                <div className="mt-3 text-[10px] text-muted-foreground">
                  Saved · id <span className="font-mono">{result.brief_id.slice(0, 8)}…</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* History sidebar */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Search className="h-3 w-3" /> Prior briefs
            </h3>
            {loadingHistory ? (
              <div className="text-[11px] text-muted-foreground">Loading…</div>
            ) : history.length === 0 ? (
              <div className="text-[11px] text-muted-foreground">No briefs yet for this project.</div>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                {history.map(h => (
                  <button
                    key={h.id}
                    onClick={() => loadPrior(h.id)}
                    className="w-full text-left rounded p-2 hover:bg-muted transition-colors"
                  >
                    <div className="text-[11px] font-medium truncate">{h.client_url}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(h.created_at).toLocaleDateString('en-GB')}</div>
                    {h.keywords.length > 0 && (
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5 italic">{h.keywords.join(', ')}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ─── Sub-tab: Asset Library ─────────────────────────── */}
      {subTab === 'assets' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Backlink Asset Library</h3>
              <span className="text-[10px] text-muted-foreground">{assets.length} asset{assets.length === 1 ? '' : 's'} loaded</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
              Every backlink target found in any brief lives here. Reuse across clients with similar industries; filter by scope, category, industry, or status.
            </p>
            {/* Filters */}
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">Scope</label>
                <select value={assetScope} onChange={e => setAssetScope(e.target.value as any)} className="w-full text-[11px] px-2 py-1.5 rounded border border-border bg-background">
                  <option value="all">All scopes</option>
                  <option value="project">This project only</option>
                  <option value="cross_project">Cross-project (shared)</option>
                  <option value="bde_standalone">BDE standalone</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">Category</label>
                <input value={assetCategory} onChange={e => setAssetCategory(e.target.value)} placeholder="e.g. resource_page" className="w-full text-[11px] px-2 py-1.5 rounded border border-border bg-background" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">Industry</label>
                <input value={assetIndustry} onChange={e => setAssetIndustry(e.target.value)} placeholder="exact industry tag" className="w-full text-[11px] px-2 py-1.5 rounded border border-border bg-background" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">Search</label>
                <input value={assetSearch} onChange={e => setAssetSearch(e.target.value)} placeholder="domain or text" className="w-full text-[11px] px-2 py-1.5 rounded border border-border bg-background" />
              </div>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <button onClick={loadAssets} disabled={assetsLoading} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50 flex items-center gap-1.5">
                {assetsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListFilter className="h-3 w-3" />}
                Apply filters
              </button>
              {assetCategories.length > 0 && (
                <div className="text-[10px] text-muted-foreground">Found categories: {assetCategories.join(', ')}</div>
              )}
            </div>
            {/* Asset list */}
            {assetsLoading ? (
              <div className="text-xs text-muted-foreground p-4 text-center">Loading…</div>
            ) : assets.length === 0 ? (
              <div className="text-xs text-muted-foreground p-4 text-center">
                No assets yet. Generate a brief; targets surfaced there will appear here.
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {assets.map(a => (
                  <div key={a.id} className="rounded-lg border border-border p-3 bg-background/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold truncate">{a.domain}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">{a.category}</span>
                          {a.attainability && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wide">{a.attainability}</span>}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide ${a.scope === 'project' ? 'bg-blue-500/15 text-blue-400' : a.scope === 'cross_project' ? 'bg-purple-500/15 text-purple-400' : 'bg-amber-500/15 text-amber-400'}`}>{a.scope}</span>
                        </div>
                        {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-foreground truncate block">{a.url}</a>}
                        {a.why_valuable && <div className="text-[11px] text-foreground/80 mt-1.5"><span className="text-muted-foreground">Why:</span> {a.why_valuable}</div>}
                        {a.asset_to_pitch && <div className="text-[11px] text-foreground/80 mt-1"><span className="text-muted-foreground">Pitch:</span> {a.asset_to_pitch}</div>}
                        {a.industries_fit && a.industries_fit.length > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-1">Fits: {a.industries_fit.join(' · ')}</div>
                        )}
                      </div>
                      <select
                        value={a.status}
                        onChange={e => onAssetStatusChange(a.id, e.target.value)}
                        className="text-[10px] px-2 py-1 rounded border border-border bg-background"
                      >
                        <option value="new">new</option>
                        <option value="pursuing">pursuing</option>
                        <option value="won">won</option>
                        <option value="dead">dead</option>
                        <option value="declined">declined</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Sub-tab: Competitor Mapping ──────────────────── */}
      {subTab === 'competitor' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Competitor Backlink Strategy Map</h3>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
              Audit a competitor's site and infer their backlink approach — what they do well, where they have weaknesses, and what your client could realistically copy. Run one competitor at a time (single) or up to 5 for a comparative matrix (batch).
            </p>

            <div className="flex gap-1 mb-3">
              {(['single', 'batch'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setCompetitorMode(mode)}
                  className={`text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${competitorMode === mode ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
                >
                  {mode === 'single' ? 'Single competitor' : 'Batch comparison (2-5)'}
                </button>
              ))}
            </div>

            {competitorMode === 'single' ? (
              <div className="space-y-2">
                <input value={competitorUrl} onChange={e => setCompetitorUrl(e.target.value)} placeholder="https://competitor.com" className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background" />
              </div>
            ) : (
              <textarea value={competitorBatchText} onChange={e => setCompetitorBatchText(e.target.value)} rows={4} placeholder={'competitor-1.com\ncompetitor-2.com\ncompetitor-3.com\n(min 2, max 5)'} className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background resize-y" />
            )}

            <input value={competitorForClient} onChange={e => setCompetitorForClient(e.target.value)} placeholder="For client (optional): https://asking-client.com — frames recommendations" className="w-full mt-2 text-xs px-3 py-2 rounded-lg border border-border bg-background" />
            <textarea value={competitorContext} onChange={e => setCompetitorContext(e.target.value)} rows={2} placeholder="Optional context: anything you want emphasised in this analysis." className="w-full mt-2 text-xs px-3 py-2 rounded-lg border border-border bg-background resize-y" />

            <button
              onClick={() => competitorMode === 'single' ? runCompetitorSingle() : runCompetitorBatchHandler()}
              disabled={competitorRunning || (competitorMode === 'single' ? !competitorUrl.trim() : competitorBatchText.split(/[,\n]/).filter(s => s.trim()).length < 2)}
              className="mt-3 text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {competitorRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
              {competitorRunning ? 'Mapping…' : (competitorMode === 'single' ? 'Map competitor' : 'Run batch comparison')}
            </button>
          </div>

          {competitorResult && (
            <div className="rounded-xl border border-border bg-card p-4">
              {competitorResult.kind === 'single' ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Competitor map</h3>
                  {competitorResult.summary && <p className="text-xs text-foreground/85">{competitorResult.summary}</p>}
                  {competitorResult.goods && competitorResult.goods.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-emerald-400 font-medium mb-1">What they do well</div>
                      <ul className="text-xs space-y-1 pl-4 list-disc">
                        {competitorResult.goods.map((g, i) => <li key={i}>{g}</li>)}
                      </ul>
                    </div>
                  )}
                  {competitorResult.bads && competitorResult.bads.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-amber-400 font-medium mb-1">Where they have weaknesses</div>
                      <ul className="text-xs space-y-1 pl-4 list-disc">
                        {competitorResult.bads.map((b, i) => <li key={i}>{b}</li>)}
                      </ul>
                    </div>
                  )}
                  {competitorResult.estimated_top_referrers && competitorResult.estimated_top_referrers.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Estimated referrer types</div>
                      <ul className="text-xs space-y-1 pl-4 list-disc">
                        {competitorResult.estimated_top_referrers.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Comparative matrix</h3>
                    <div className="flex gap-1.5">
                      <button onClick={() => { if (competitorResult.comparison_md) { downloadStakeholderAsWord(competitorResult.comparison_md, { title: 'Competitor Backlink Comparison', kind: 'Backlink Competitor Matrix', generatedAt: new Date().toISOString() }); toast({ title: 'Downloaded' }); } }} className="text-xs px-3 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 flex items-center gap-1.5 font-medium">
                        <FileDown className="h-3 w-3" /> Word
                      </button>
                      <button onClick={() => { if (competitorResult.comparison_md) { openStakeholderReport(competitorResult.comparison_md, { title: 'Competitor Backlink Comparison', kind: 'Backlink Competitor Matrix', generatedAt: new Date().toISOString() }); } }} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1.5">
                        <ExternalLink className="h-3 w-3" /> PDF
                      </button>
                    </div>
                  </div>
                  <div className="backlink-preview prose prose-sm prose-invert max-w-none text-foreground/90" dangerouslySetInnerHTML={{ __html: mdToHtml(competitorResult.comparison_md || '') }} />
                </div>
              )}
            </div>
          )}

          {/* History */}
          {competitorHistory.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-2">Prior competitor maps</h3>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {competitorHistory.map(c => (
                  <div key={c.id} className="text-[11px] py-1.5 border-b border-border/40 last:border-0">
                    <span className="font-medium">{c.competitor_domain}</span>
                    {c.for_client_url && <span className="text-muted-foreground"> · for {c.for_client_url}</span>}
                    <span className="text-muted-foreground"> · {new Date(c.created_at).toLocaleDateString('en-GB')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .backlink-preview h1 { font-size: 18px; font-weight: 700; margin: 0 0 12px; color: hsl(var(--foreground)); border-bottom: 1px solid hsl(var(--border)); padding-bottom: 8px; }
        .backlink-preview h2 { font-size: 15px; font-weight: 600; margin: 20px 0 10px; color: hsl(var(--foreground)); }
        .backlink-preview h3 { font-size: 13px; font-weight: 600; margin: 16px 0 8px; color: hsl(var(--foreground)); }
        .backlink-preview p { margin: 0 0 10px; line-height: 1.6; }
        .backlink-preview ul, .backlink-preview ol { margin: 0 0 12px; padding-left: 20px; }
        .backlink-preview li { margin: 4px 0; line-height: 1.55; }
        .backlink-preview strong { color: hsl(var(--foreground)); font-weight: 600; }
        .backlink-preview em { color: hsl(var(--muted-foreground)); font-style: italic; }
        .backlink-preview blockquote { border-left: 3px solid hsl(var(--primary) / 0.4); padding: 4px 0 4px 12px; margin: 12px 0; color: hsl(var(--muted-foreground)); }
        .backlink-preview hr { border: none; border-top: 1px solid hsl(var(--border)); margin: 16px 0; }
        .backlink-preview code { background: hsl(var(--muted) / 0.5); padding: 1px 4px; border-radius: 3px; font-size: 11px; }
      `}</style>
    </div>
  );
}
