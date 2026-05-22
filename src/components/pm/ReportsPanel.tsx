/* ════════════════════════════════════════════════════════════════
   ReportsPanel.tsx
   The PM Reports tab — full report builder.
   Three modes: list, builder, editor. Composable block-based reports
   with slider-tuned narrative and real data charts/tables.
════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, FileText, Share2, Save, Download, Trash2, Camera,
  ChevronLeft, Loader2, Sliders as SlidersIcon, ListChecks, Check,
  Target, X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as pmApi from './api';
import { BlockRenderer } from './BlockRenderer';
import type {
  ReportBlock, Sliders, PmContext, ReportSummary, FullReport,
} from './types';

type Mode = 'list' | 'builder' | 'editor';

const SLIDER_DEFINITIONS: { key: keyof Sliders; label: string; left: string; right: string }[] = [
  { key: 'tone',           label: 'Tone',            left: 'Casual',          right: 'Formal' },
  { key: 'technicalDepth', label: 'Technical depth', left: 'Plain-English',   right: 'Technical' },
  { key: 'confidence',     label: 'Confidence',      left: 'Cautious',        right: 'Confident' },
  { key: 'emotion',        label: 'Emotion',         left: 'Reserved',        right: 'Warm' },
  { key: 'length',         label: 'Length',          left: 'Brief',           right: 'Comprehensive' },
];

const MOOD_OPTIONS: { value: string; label: string }[] = [
  { value: '',                label: 'Not set' },
  { value: 'steady',          label: 'Steady — routine update' },
  { value: 'launching',       label: 'Launching — new push' },
  { value: 'under_pressure',  label: 'Under pressure — concerns' },
  { value: 'celebrating',     label: 'Celebrating — big win' },
];

const CATEGORY_LABELS: Record<string, string> = {
  summary: 'Summary', delivery: 'Delivery', performance: 'Performance',
  competitive: 'Competitive', next: "What's next",
};

const defaultSliders = (): Sliders => ({
  tone: 50, technicalDepth: 35, confidence: 60, emotion: 55, length: 60,
});

const today    = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); };

export default function ReportsPanel({ projectId, projectName }: {
  projectId: string; projectName: string;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('list');
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  /* builder state */
  const [periodStart, setPeriodStart] = useState(monthAgo());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [catalog, setCatalog] = useState<ReportBlock[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sliders, setSliders] = useState<Sliders>(defaultSliders());
  const [pmCtx, setPmCtx] = useState<PmContext>({ emphasize: '', downplay: '', mood: '', customNote: '' });
  const [title, setTitle] = useState('Client Report');
  const [generating, setGenerating] = useState(false);

  /* editor state */
  const [report, setReport] = useState<FullReport | null>(null);
  const [savingEdits, setSavingEdits] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [snapping, setSnapping] = useState(false);

  /* Phase 14.1 — save-to-campaign modal state */
  const [saveToCampaignFor, setSaveToCampaignFor] = useState<ReportSummary | null>(null);
  const [campaignsForLink, setCampaignsForLink] = useState<any[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [linking, setLinking] = useState(false);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    const { reports, error } = await pmApi.listReports(projectId);
    setLoadingList(false);
    if (error) toast({ title: 'Could not load reports', description: error, variant: 'destructive' });
    setReports(reports);
  }, [projectId, toast]);

  useEffect(() => { loadList(); }, [loadList]);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    const { catalog, error } = await pmApi.reportCatalog(projectId, periodStart, periodEnd);
    setLoadingCatalog(false);
    if (error) { toast({ title: 'Could not load catalog', description: error, variant: 'destructive' }); return; }
    setCatalog(catalog);
    const defaults = catalog
      .filter((b) => b.available && (
        (b.type === 'narrative' && b.id !== 'narr:pm_note') ||
        b.id === 'matrix:audit_findings' || b.id === 'matrix:competitive' ||
        b.id === 'kpi:gsc_clicks' || b.id === 'kpi:audit_score' ||
        b.id === 'kpi:organic_sessions' || b.id === 'table:cards_delivered'
      ))
      .map((b) => b.id);
    setSelected(new Set(defaults));
  }, [projectId, periodStart, periodEnd, toast]);

  const startBuilder = () => {
    setMode('builder');
    setTitle(`${projectName} — ${new Date(periodEnd).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`);
    loadCatalog();
  };

  const openReport = async (id: string) => {
    const { report, error } = await pmApi.getReport(id);
    if (error || !report) { toast({ title: 'Could not open', description: error, variant: 'destructive' }); return; }
    setReport(report); setMode('editor');
  };

  const grouped = useMemo(() => {
    const g: Record<string, ReportBlock[]> = {};
    for (const b of catalog) (g[b.category] ||= []).push(b);
    return g;
  }, [catalog]);

  const toggleBlock = (id: string) => setSelected((cur) => {
    const next = new Set(cur); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const selectAllInCategory = (cat: string, on: boolean) => setSelected((cur) => {
    const next = new Set(cur);
    for (const b of grouped[cat] || []) if (b.available) on ? next.add(b.id) : next.delete(b.id);
    return next;
  });

  const generate = async () => {
    if (!selected.size) { toast({ title: 'No blocks selected', variant: 'destructive' }); return; }
    setGenerating(true);
    const { report, error } = await pmApi.generateReport({
      projectId, periodStart, periodEnd,
      selectedBlocks: Array.from(selected), sliders, pmContext: pmCtx, title,
    });
    setGenerating(false);
    if (error || !report) { toast({ title: 'Generation failed', description: error, variant: 'destructive' }); return; }
    setReport(report); setMode('editor'); loadList();
  };

  const updateBlockText = (id: string, text: string) => {
    if (!report) return;
    setReport({ ...report, blocks: report.blocks.map((b) => b.id === id ? { ...b, content: text } : b) });
  };
  const regenerateBlock = async (id: string) => {
    if (!report) return;
    setRegeneratingId(id);
    const { report: u, error } = await pmApi.regenerateBlock({
      reportId: report.id, blockId: id, sliders: report.sliders, pmContext: report.pm_context,
    });
    setRegeneratingId(null);
    if (error || !u) { toast({ title: 'Regenerate failed', description: error, variant: 'destructive' }); return; }
    setReport(u);
  };
  const removeBlock = (id: string) => {
    if (!report) return;
    setReport({ ...report, blocks: report.blocks.filter((b) => b.id !== id) });
  };
  const moveBlock = (id: string, dir: -1 | 1) => {
    if (!report) return;
    const blocks = [...report.blocks];
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const j = i + dir; if (j < 0 || j >= blocks.length) return;
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    setReport({ ...report, blocks });
  };

  const saveAll = async (status?: 'draft' | 'finalized') => {
    if (!report) return;
    setSavingEdits(true);
    const { report: u, error } = await pmApi.saveReport({
      reportId: report.id, blocks: report.blocks, title: report.title, status,
    });
    setSavingEdits(false);
    if (error || !u) { toast({ title: 'Save failed', description: error, variant: 'destructive' }); return; }
    setReport(u);
    toast({ title: status === 'finalized' ? 'Finalized' : 'Saved' });
    loadList();
  };

  const share = async (revoke = false) => {
    if (!report) return;
    setSharing(true);
    const { shareToken, error } = await pmApi.shareReport(report.id, revoke);
    setSharing(false);
    if (error) { toast({ title: 'Share failed', description: error, variant: 'destructive' }); return; }
    setReport({ ...report, share_token: shareToken, status: shareToken ? 'shared' : 'finalized' });
    if (shareToken) {
      const url = `${window.location.origin}/r/${shareToken}`;
      try { await navigator.clipboard.writeText(url); } catch { /* nf */ }
      toast({ title: 'Share link copied', description: url });
    } else toast({ title: 'Share revoked' });
    loadList();
  };

  /* Phase 14.1 — open the save-to-campaign modal for a given report.
     Loads the project's active campaigns so user can pick one. */
  const openSaveToCampaign = async (r: ReportSummary) => {
    setSaveToCampaignFor(r);
    setLoadingCampaigns(true);
    const result = await pmApi.seoCampaignList({ projectId, statusFilter: 'active' });
    setCampaignsForLink(result.campaigns || []);
    setLoadingCampaigns(false);
    if (result.error) {
      toast({ title: 'Could not load campaigns', description: result.error, variant: 'destructive' });
    }
  };

  /* Phase 14.1 — execute the link */
  const confirmSaveToCampaign = async (campaignId: string) => {
    if (!saveToCampaignFor) return;
    setLinking(true);
    /* Fetch the full report so we have body to copy */
    const full = await pmApi.getReport(saveToCampaignFor.id);
    const bodyMd = full?.report ? buildMarkdownFromReport(full.report) : '';
    const result = await pmApi.seoCampaignLinkReport({
      projectId,
      campaignId,
      sourceTable:   'report_generations',
      sourceId:      saveToCampaignFor.id,
      sourceTitle:   saveToCampaignFor.title,
      sourceBodyMd:  bodyMd,
      sourceSummary: `Client report covering ${saveToCampaignFor.period_start || ''} → ${saveToCampaignFor.period_end || ''}.`,
      pillar:        'content',
      reportKind:    'manual_refresh',
      tags:          ['client_report', `period:${saveToCampaignFor.period_start || ''}_to_${saveToCampaignFor.period_end || ''}`],
    });
    setLinking(false);
    if (result.error) {
      toast({ title: 'Link failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Linked to campaign', description: 'Report is now visible in the campaign drawer.' });
    setSaveToCampaignFor(null);
    setCampaignsForLink([]);
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this report?')) return;
    const { error } = await pmApi.deleteReport(id);
    if (error) { toast({ title: 'Delete failed', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Deleted' });
    loadList();
    if (report?.id === id) { setReport(null); setMode('list'); }
  };

  const takeSnapshot = async () => {
    setSnapping(true);
    const { success, error } = await pmApi.takeMetricsSnapshot(projectId);
    setSnapping(false);
    if (!success) toast({ title: 'Snapshot failed', description: error, variant: 'destructive' });
    else toast({ title: 'Snapshot saved' });
  };

  const copyMarkdown = async () => {
    if (!report) return;
    const lines: string[] = [`# ${report.title}`, ''];
    if (report.period_start || report.period_end) lines.push(`*${report.period_start || ''} → ${report.period_end || ''}*`, '');
    for (const b of report.blocks) {
      lines.push(`## ${b.title}`, '');
      if (b.type === 'narrative') lines.push(b.content || '_(no content)_', '');
      else if (b.type === 'kpi') { const d = b.data || {}; lines.push(`**${d.current ?? '—'}**${d.delta != null ? ` (${d.delta > 0 ? '+' : ''}${d.delta} vs prior)` : ''}`, ''); }
      else if (b.type === 'table' && Array.isArray(b.data?.rows)) {
        const cols = b.data.columns || [];
        lines.push('| ' + cols.join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|');
        for (const row of b.data.rows) lines.push('| ' + Object.values(row).filter((_, j) => j < cols.length).map(String).join(' | ') + ' |');
        lines.push('');
      } else lines.push(`_(${b.type} block — view in full report)_`, '');
    }
    try { await navigator.clipboard.writeText(lines.join('\n')); toast({ title: 'Markdown copied' }); }
    catch { toast({ title: 'Copy failed', variant: 'destructive' }); }
  };

  /* ── LIST MODE ── */
  if (mode === 'list') return (
    <>
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-base font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Client reports</div>
          <div className="text-xs text-muted-foreground mt-0.5">Build composable, client-shareable reports — pick blocks, set the tone, generate, share.</div>
        </div>
        <div className="flex gap-2">
          <button onClick={takeSnapshot} disabled={snapping}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Capture a metric snapshot so trend charts have a point at this moment">
            {snapping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />} Take snapshot
          </button>
          <button onClick={startBuilder}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90">
            <Plus className="h-3.5 w-3.5" /> New report
          </button>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {loadingList ? (
          <div className="p-8 text-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No reports yet. Click <strong>New report</strong> to build one.</div>
        ) : reports.map((r) => (
          <div key={r.id} className="p-4 flex items-center justify-between gap-3 flex-wrap hover:bg-muted/30 transition-colors">
            <button onClick={() => openReport(r.id)} className="flex-1 min-w-0 text-left">
              <div className="text-sm font-semibold text-foreground/90 truncate">{r.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {r.period_start || ''} → {r.period_end || ''} · {new Date(r.created_at).toLocaleDateString('en-GB')}
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                  r.status === 'shared' ? 'bg-green-500/15 text-green-400' :
                  r.status === 'finalized' ? 'bg-blue-500/15 text-blue-400' :
                  'bg-muted text-muted-foreground'
                }`}>{r.status}</span>
              </div>
            </button>
            <div className="flex items-center gap-2">
              {r.share_token && (
                <a href={`/r/${r.share_token}`} target="_blank" rel="noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Share2 className="h-3 w-3" /> Open share
                </a>
              )}
              <button onClick={() => openSaveToCampaign(r)}
                className="p-1.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary" title="Save to campaign">
                <Target className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => remove(r.id)}
                className="p-1.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive" title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
    {saveToCampaignFor && (
      <SaveToCampaignModal
        report={saveToCampaignFor}
        campaigns={campaignsForLink}
        loading={loadingCampaigns}
        linking={linking}
        onConfirm={confirmSaveToCampaign}
        onCancel={() => { setSaveToCampaignFor(null); setCampaignsForLink([]); }}
      />
    )}
    </>
  );

  /* ── BUILDER MODE ── */
  if (mode === 'builder') return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between flex-wrap gap-3">
        <button onClick={() => setMode('list')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to reports
        </button>
        <button onClick={generate} disabled={generating || loadingCatalog || !selected.size}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50">
          {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <>Generate report ({selected.size})</>}
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Report basics</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Period start</label>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} onBlur={loadCatalog}
              className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Period end</label>
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} onBlur={loadCatalog}
              className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5" /> Pick what to include
          </div>
          {loadingCatalog && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {loadingCatalog ? (
          <div className="text-xs text-muted-foreground">Loading available blocks…</div>
        ) : (
          <div className="space-y-4">
            {Object.keys(grouped).sort((a, b) => {
              const order = ['summary', 'delivery', 'performance', 'competitive', 'next'];
              return order.indexOf(a) - order.indexOf(b);
            }).map((cat) => (
              <div key={cat}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">{CATEGORY_LABELS[cat] || cat}</div>
                  <div className="flex gap-2">
                    <button onClick={() => selectAllInCategory(cat, true)} className="text-[10px] text-muted-foreground hover:text-foreground">Select all</button>
                    <button onClick={() => selectAllInCategory(cat, false)} className="text-[10px] text-muted-foreground hover:text-foreground">Clear</button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {grouped[cat].map((b) => (
                    <label key={b.id}
                      className={`flex items-start gap-2 p-2.5 rounded-lg border transition-colors cursor-pointer ${
                        !b.available ? 'border-border/40 bg-muted/20 opacity-50 cursor-not-allowed' :
                        selected.has(b.id) ? 'border-primary/50 bg-primary/5' :
                        'border-border hover:border-border/70'
                      }`}>
                      <input type="checkbox" disabled={!b.available} checked={selected.has(b.id)} onChange={() => toggleBlock(b.id)} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-foreground/90 flex items-center gap-1.5 flex-wrap">
                          {b.title}
                          <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted text-muted-foreground/70">{b.type}</span>
                        </div>
                        {b.hint && <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{b.hint}</div>}
                        {!b.available && <div className="text-[10px] text-amber-400 mt-0.5">Data not yet available.</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
          <SlidersIcon className="h-3.5 w-3.5" /> Tone & style — shapes every AI-written block
        </div>
        <div className="space-y-3">
          {SLIDER_DEFINITIONS.map((s) => (
            <div key={s.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-foreground/90">{s.label}</span>
                <span className="text-muted-foreground font-mono text-[10px]">
                  {s.left} ◄ {sliders[s.key]} ► {s.right}
                </span>
              </div>
              <input type="range" min={0} max={100} step={5} value={sliders[s.key] ?? 50}
                onChange={(e) => setSliders({ ...sliders, [s.key]: Number(e.target.value) })}
                className="w-full accent-primary" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          PM context — what should the AI emphasize?
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Emphasize</label>
            <input type="text" placeholder="e.g. recovery from algo update"
              value={pmCtx.emphasize || ''} onChange={(e) => setPmCtx({ ...pmCtx, emphasize: e.target.value })}
              className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Downplay</label>
            <input type="text" placeholder="e.g. soften the position dip"
              value={pmCtx.downplay || ''} onChange={(e) => setPmCtx({ ...pmCtx, downplay: e.target.value })}
              className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Client situation</label>
            <select value={pmCtx.mood || ''} onChange={(e) => setPmCtx({ ...pmCtx, mood: e.target.value as any })}
              className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              {MOOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Custom PM note (optional — used as the PM Note block)
          </label>
          <textarea rows={3} placeholder="A personal opener or closer from you to the client."
            value={pmCtx.customNote || ''} onChange={(e) => setPmCtx({ ...pmCtx, customNote: e.target.value })}
            className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
      </div>
    </div>
  );

  /* ── EDITOR MODE ── */
  if (mode === 'editor' && report) return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between flex-wrap gap-3">
        <button onClick={() => setMode('list')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to reports
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => saveAll('draft')} disabled={savingEdits}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
            {savingEdits ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </button>
          <button onClick={() => saveAll('finalized')}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10">
            <Check className="h-3.5 w-3.5" /> Finalize
          </button>
          <button onClick={copyMarkdown}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground">
            <Download className="h-3.5 w-3.5" /> Copy markdown
          </button>
          {report.share_token ? (
            <>
              <a href={`/r/${report.share_token}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/5 text-green-400 hover:bg-green-500/10">
                <Share2 className="h-3.5 w-3.5" /> Open share
              </a>
              <button onClick={() => share(true)} disabled={sharing}
                className="text-xs px-2 py-2 rounded-lg text-muted-foreground hover:text-destructive" title="Revoke share link">
                Revoke
              </button>
            </>
          ) : (
            <button onClick={() => share(false)} disabled={sharing}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50">
              {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />} Generate share link
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Title</label>
        <input type="text" value={report.title} onChange={(e) => setReport({ ...report, title: e.target.value })}
          className="w-full mt-1 text-xl font-bold rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40" />
      </div>

      <div className="space-y-3">
        {report.blocks.map((b, i) => (
          <div key={b.id} className="relative pl-6">
            <div className="absolute left-0 top-4 flex flex-col gap-0.5">
              <button onClick={() => moveBlock(b.id, -1)} disabled={i === 0}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground text-xs" title="Move up">▲</button>
              <button onClick={() => moveBlock(b.id, 1)} disabled={i === report.blocks.length - 1}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground text-xs" title="Move down">▼</button>
            </div>
            <BlockRenderer
              block={b} editable
              onEdit={(t) => updateBlockText(b.id, t)}
              onRegen={b.type === 'narrative' ? () => regenerateBlock(b.id) : undefined}
              onRemove={() => removeBlock(b.id)}
              regenerating={regeneratingId === b.id}
            />
          </div>
        ))}
        {!report.blocks.length && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            All blocks removed. Create a new report to start fresh.
          </div>
        )}
      </div>
    </div>
  );

  return null;
}

/* ─── Phase 14.1 helpers ─────────────────────────────────── */

/** Convert a block-based FullReport into a single markdown body for storage
 *  in seo_campaign_reports. Narrative blocks keep their content, structured
 *  blocks (charts/tables/kpis) become brief textual placeholders. */
function buildMarkdownFromReport(r: FullReport): string {
  const lines: string[] = [];
  lines.push(`# ${r.title}`);
  lines.push('');
  lines.push(`**Period:** ${r.period_start || ''} → ${r.period_end || ''}  `);
  lines.push(`**Status:** ${r.status}  `);
  lines.push(`**Created:** ${new Date(r.created_at).toLocaleDateString()}`);
  lines.push('');

  /* Group blocks by category */
  const cats: Record<string, ReportBlock[]> = {};
  for (const id of r.selected_blocks || []) {
    const b = r.blocks.find(x => x.id === id);
    if (!b) continue;
    if (!cats[b.category]) cats[b.category] = [];
    cats[b.category].push(b);
  }
  const order = ['summary', 'performance', 'delivery', 'competitive', 'next'];
  for (const cat of order) {
    if (!cats[cat] || cats[cat].length === 0) continue;
    const label = ({ summary: 'Summary', performance: 'Performance', delivery: 'Delivery',
                     competitive: 'Competitive', next: "What's Next" } as Record<string, string>)[cat] || cat;
    lines.push('');
    lines.push(`## ${label}`);
    lines.push('');
    for (const b of cats[cat]) {
      lines.push(`### ${b.title}`);
      if (b.content) {
        lines.push(b.content);
      } else if (b.data) {
        lines.push(`_(Structured block — ${b.type}. See original report at ${window.location.origin}/pm for visualization.)_`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

/* ─── Phase 14.1 Save-to-Campaign modal ──────────────────── */

function SaveToCampaignModal({
  report, campaigns, loading, linking, onConfirm, onCancel,
}: {
  report: ReportSummary;
  campaigns: any[];
  loading: boolean;
  linking: boolean;
  onConfirm: (campaignId: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 480, width: '100%',
        background: 'linear-gradient(180deg, #1a1b27 0%, #0f1018 100%)',
        border: '1px solid rgba(160,160,180,0.2)', borderRadius: 14,
        padding: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Save report to a campaign</h3>
          <button onClick={onCancel} style={{
            width: 28, height: 28, borderRadius: 14, border: '1px solid rgba(160,160,180,0.2)',
            background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><X size={13} /></button>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(150,150,170,0.85)', marginBottom: 14, lineHeight: 1.5 }}>
          <strong>"{report.title}"</strong> will be linked to the chosen campaign's content panel. The original report stays untouched.
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'rgba(120,120,140,0.7)' }}>
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading campaigns…
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{
            padding: 20, textAlign: 'center', fontSize: 12, color: 'rgba(150,150,170,0.7)',
            border: '1px dashed rgba(160,160,180,0.2)', borderRadius: 10,
          }}>
            No active campaigns yet. Create one first by typing <code>rank me for "..."</code> in S.E.A.S.O.N.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {campaigns.map(c => (
              <button key={c.id} onClick={() => setSelected(c.id)} style={{
                padding: 10, borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                background: selected === c.id ? 'rgba(186,200,255,0.1)' : 'rgba(255,255,255,0.03)',
                border: selected === c.id ? '1px solid rgba(186,200,255,0.3)' : '1px solid rgba(160,160,180,0.15)',
                color: 'inherit',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>"{c.keyword}"</div>
                <div style={{ fontSize: 11, color: 'rgba(150,150,170,0.7)', marginTop: 2 }}>
                  {c.goal} · Started {new Date(c.started_at).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onCancel} style={{
            padding: '8px 14px', borderRadius: 7, border: '1px solid rgba(160,160,180,0.2)',
            background: 'transparent', color: 'rgba(150,150,170,0.85)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={() => selected && onConfirm(selected)} disabled={!selected || linking} style={{
            padding: '8px 14px', borderRadius: 7, border: '1px solid rgba(186,200,255,0.3)',
            background: selected ? 'rgba(186,200,255,0.15)' : 'rgba(186,200,255,0.05)',
            color: '#a5f3fc', fontSize: 12, fontWeight: 700,
            cursor: selected && !linking ? 'pointer' : 'not-allowed',
            opacity: linking ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {linking ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Save to this campaign
          </button>
        </div>
      </div>
    </div>
  );
}
