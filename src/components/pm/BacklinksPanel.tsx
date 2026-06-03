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

import { useState, useEffect, useCallback } from 'react';
import {
  Link2, Loader2, AlertCircle, FileDown, ExternalLink, Download, Users, Search, Plus, X, ChevronDown, ChevronRight,
} from 'lucide-react';
import {
  backlinkLenses, backlinkList, backlinkLoad, backlinkRun,
  type BacklinkInputs, type BacklinkListItem, type CompareLens, type CompareSelectedLens,
} from '@/components/pm/api';
import { downloadStakeholderReport, downloadStakeholderAsWord, openStakeholderReport, mdToHtml } from '@/lib/reportExport';
import { useToast } from '@/hooks/use-toast';

interface Props { projectId: string }

export default function BacklinksPanel({ projectId }: Props) {
  const { toast } = useToast();

  // Inputs
  const [clientUrl, setClientUrl] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [budgetTier, setBudgetTier] = useState<'low' | 'medium' | 'high' | 'enterprise' | ''>('');
  const [competitorsText, setCompetitorsText] = useState('');
  const [geography, setGeography] = useState('');
  const [context, setContext] = useState('');
  const [deepAudit, setDeepAudit] = useState(false);

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
    loadHistory();
  }, [projectId, loadHistory]);

  // Elapsed timer during run
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [running]);

  const run = async () => {
    setError('');
    if (!clientUrl.trim()) { setError('Client website URL is required.'); return; }
    setRunning(true);
    setResult(null);
    setElapsed(0);
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

      const r = await backlinkRun({ projectId, inputs });
      if (!r.success) { setError(r.error || 'Brief generation failed.'); return; }
      setResult({ title: r.title, brief_md: r.brief_md, brief_id: r.brief_id });
      setShowInputs(false);
      toast({ title: 'Brief ready', description: r.brief_id ? 'Saved to project history.' : 'Returned in-memory only.' });
      loadHistory();
    } catch (e: any) {
      setError(e?.message || 'Brief generation failed.');
    } finally { setRunning(false); }
  };

  const loadPrior = async (id: string) => {
    setError('');
    const r = await backlinkLoad({ projectId, briefId: id });
    if (!r.success || !r.brief) { setError(r.error || 'Could not load brief.'); return; }
    setResult({ title: r.brief.inputs_json?.client_url ? `Backlink Strategy Brief · ${r.brief.client_url}` : 'Backlink Strategy Brief', brief_md: r.brief.brief_md, brief_id: r.brief.id });
    setShowInputs(false);
  };

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
          <h2 className="text-base font-semibold">Backlink Strategy Brief</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Senior-DMS-grade backlink intelligence from just a website URL. Audits the site, derives industry and audience, runs research across six categories (digital PR, resource pages, broken-link reclamation, expert quotes, AI-Overview citation, partnerships), and produces a client-ready strategic brief. Designed for 2026 SEO and AI-search dynamics — topic relevance, AI Overview citation, and entity association matter as much as DA.
        </p>
      </div>

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
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">Client website URL <span className="text-red-400">*</span></label>
                <input
                  value={clientUrl}
                  onChange={e => setClientUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                />
              </div>

              {/* Target keywords */}
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">Target keywords <span className="text-muted-foreground/60 text-[10px] normal-case font-normal">· optional · comma or newline separated · max 20</span></label>
                <textarea
                  value={keywordsText}
                  onChange={e => setKeywordsText(e.target.value)}
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
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">Geography <span className="text-muted-foreground/60 text-[10px] normal-case font-normal">· optional</span></label>
                  <input
                    value={geography}
                    onChange={e => setGeography(e.target.value)}
                    placeholder="UK / US-east / global"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                  />
                </div>
              </div>

              {/* Competitor URLs */}
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">Competitor URLs <span className="text-muted-foreground/60 text-[10px] normal-case font-normal">· optional · max 10</span></label>
                <textarea
                  value={competitorsText}
                  onChange={e => setCompetitorsText(e.target.value)}
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

              {/* Run */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={run}
                  disabled={running || !clientUrl.trim()}
                  className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  {running ? `Generating brief… ${elapsed}s` : 'Generate brief'}
                </button>
                {running && (
                  <div className="text-[10px] text-muted-foreground">Audit → 6 research lanes → synthesis · expect 60-180s</div>
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
