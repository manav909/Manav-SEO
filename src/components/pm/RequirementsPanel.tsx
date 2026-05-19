/* ════════════════════════════════════════════════════════════════
   src/components/pm/RequirementsPanel.tsx
   The Requirements tab — gather project intelligence, generate cards.

   Shows the project manager exactly what intelligence the AI will use
   (audits, algorithm intel, brain learnings, competitors) and what data
   is missing — full transparency before any card is created.
════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import type {
  RequirementContext, SourceRef, DataRoomContext, KeywordPageMapping,
  CrawlComparison, CrawlPage,
} from './types';
import * as pmApi from './api';

export default function RequirementsPanel({
  projectId, project, onCardsGenerated,
}: {
  projectId: string;
  project: any;
  onCardsGenerated: () => void;
}) {
  const [ctx, setCtx]           = useState<RequirementContext | null>(null);
  const [loading, setLoading]   = useState(false);
  const [generating, setGen]    = useState(false);
  const [result, setResult]     = useState('');
  const [gatheredAt, setGatheredAt] = useState<string>('');

  /* Re-gather the project's intelligence — re-runs every backend query.
     This is the truth-source refresh: it re-reads the Data Room,
     audits, learnings, crawl and documents live. */
  const gather = useCallback(async () => {
    setLoading(true);
    setResult('');
    const gathered = await pmApi.gatherRequirements(projectId);
    setCtx(gathered);
    setGatheredAt(new Date().toISOString());
    setLoading(false);
  }, [projectId]);

  /* Gather on mount and whenever the project changes. */
  useEffect(() => { gather(); }, [gather]);

  const generate = async () => {
    setGen(true);
    setResult('');
    const cards = await pmApi.generateCards(projectId);
    setGen(false);
    if (cards.length) {
      setResult(`✓ ${cards.length} task card${cards.length === 1 ? '' : 's'} generated. Open the Board tab to place them.`);
      onCardsGenerated();
    } else {
      setResult('No cards were generated — check the data sources below have enough to work with.');
    }
  };

  if (loading) {
    return <div className="text-center py-16 text-sm text-muted-foreground">Gathering project intelligence…</div>;
  }

  if (!ctx) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Could not gather project intelligence. Try Refresh, or confirm the project exists.
      </div>
    );
  }

  /* Group every source for display. */
  /* Only sources backed by a real table. Placeholder sources (sales,
     client notes) are deliberately not shown — an empty box for a
     feature with no data source is noise, not information. */
  const sourceGroups: {
    title: string; icon: string; refs: SourceRef[]; note: string;
    source: string; emptyAction: string;
  }[] = [
    { title: 'Brain Learnings', icon: '🧠', refs: ctx.brain, note: 'Lessons from past work',
      source: 'brain_learnings',
      emptyAction: 'No learnings captured yet — these build up as work is verified.' },
    { title: 'Competitors', icon: '🎯', refs: ctx.competitors, note: 'Competitive context',
      source: 'Data Room',
      emptyAction: 'No competitors set — add them in the Data Room for competitive cards.' },
    { title: 'Documents', icon: '📄', refs: ctx.documents || [], note: 'Uploaded project documents',
      source: 'project_documents',
      emptyAction: 'No documents uploaded — add briefs or reports in the Data Room.' },
  ];

  /* Only render groups that have data OR a meaningful action. */
  const visibleGroups = sourceGroups;

  const totalSources = visibleGroups.reduce((n, g) => n + g.refs.length, 0);

  return (
    <div className="space-y-6">

      {/* Refresh bar — re-gathers from all live sources, shows freshness */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          {gatheredAt
            ? `Gathered from live sources at ${new Date(gatheredAt).toLocaleString('en-GB')}`
            : 'Gathering…'}
          <span className="text-muted-foreground/60">
            {' '}— edit the Data Room or run an audit, then Refresh to pull the latest.
          </span>
        </div>
        <button
          onClick={gather}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-50 transition-colors shrink-0"
        >
          {loading ? 'Refreshing…' : 'Refresh from sources'}
        </button>
      </div>

      {/* Project summary — uses the project record the app already loaded,
          falling back to the gathered context. */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Project
        </div>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row label="Name"  value={project?.name || ctx.projectName || 'Unnamed'} />
          <Row label="URL"   value={project?.url || ctx.url || 'Not set'} />
          <Row label="Goal"  value={ctx.goal || ctx.dataRoom?.goal?.primaryGoal || 'Not set'} />
          <Row label="Scope" value={ctx.scope || 'Not set'} />
        </div>
        {ctx.projError && (
          <div className="mt-3 text-xs text-amber-400">
            Note: the project record could not be fully read on the server ({ctx.projError}).
            Showing what the app has loaded.
          </div>
        )}
      </div>

      {/* Data Room — the project's structured definition */}
      {ctx.dataRoom && <DataRoomSection dr={ctx.dataRoom} />}

      {/* Audit findings — the real detail, not just a score */}
      {ctx.audits && ctx.audits.length > 0 && <AuditSection audits={ctx.audits} />}

      {/* Algorithm intelligence — practices & checklists, not just names */}
      {ctx.algorithm && ctx.algorithm.length > 0 && <AlgorithmSection topics={ctx.algorithm} />}

      {/* Crawl & competitive pages — keyword -> landing page + AI comparison */}
      <CrawlSection
        projectId={projectId}
        keywordMap={ctx.keywordMap || []}
        unmatchedPages={ctx.unmatchedPages || []}
        crawlPages={ctx.crawlPages || []}
        summary={ctx.crawlSummary}
        comparison={ctx.crawlComparison || null}
        comparisonAt={ctx.crawlComparisonAt || ''}
        onLinkChanged={gather}
      />

      {/* Intelligence sources — full transparency */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Intelligence the AI will use
          </div>
          <span className="text-xs text-muted-foreground font-mono">{totalSources} sources</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleGroups.map(g => (
            <div key={g.title} className="rounded-xl border border-border bg-background/50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span>{g.icon}</span>
                <span className="text-sm font-semibold">{g.title}</span>
                <span className="text-xs text-muted-foreground ml-auto font-mono">{g.refs.length}</span>
              </div>
              <div className="text-xs text-muted-foreground mb-1">{g.note}</div>
              <div className="text-[10px] text-muted-foreground/60 mb-2 font-mono">
                source: {g.source}
              </div>
              {g.refs.length > 0 ? (
                <ul className="space-y-2">
                  {g.refs.slice(0, 4).map((r, i) => (
                    <li key={i} className="text-xs">
                      <div className="font-medium text-foreground/90">{r.label}</div>
                      {r.overview && (
                        <div className="text-muted-foreground mt-0.5 leading-snug">{r.overview}</div>
                      )}
                      {r.highlights && r.highlights.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {r.highlights.map((h, j) => (
                            <li key={j} className="text-foreground/70 pl-2">– {h}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                  {g.refs.length > 4 && (
                    <li className="text-xs text-muted-foreground">+{g.refs.length - 4} more</li>
                  )}
                </ul>
              ) : (
                <div className="text-xs text-amber-400/70 leading-snug">{g.emptyAction}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Data gaps — honest about what's missing */}
      {ctx.gaps.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="text-xs font-semibold text-amber-400 mb-2 uppercase tracking-wider">
            Data gaps — fill these for higher-quality cards
          </div>
          <ul className="space-y-1">
            {ctx.gaps.map((g, i) => (
              <li key={i} className="text-xs text-amber-200/80">• {g}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Generate */}
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm font-semibold">Generate task cards</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            The AI turns the intelligence above into concrete, sequenced task cards.
            Every card traces back to its source.
          </div>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
        >
          {generating ? 'Generating…' : 'Generate Cards'}
        </button>
      </div>

      {result && (
        <div className={`rounded-xl border p-4 text-sm ${
          result.startsWith('✓')
            ? 'border-green-500/30 bg-green-500/5 text-green-400'
            : 'border-amber-500/30 bg-amber-500/5 text-amber-300'
        }`}>
          {result}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="text-foreground/90 truncate">{value}</span>
    </div>
  );
}

/* ── Data Room — the project's structured definition ── */
function DataRoomSection({ dr }: { dr: DataRoomContext }) {
  const groups: { title: string; icon: string; rows: [string, string][] }[] = [
    { title: 'Goal & Scope', icon: '🎯', rows: [
      ['Primary goal', dr.goal.primaryGoal], ['Timeline', dr.goal.timeline],
      ['Success metric', dr.goal.successMetric], ['Budget', dr.goal.budget],
      ['Reporting', dr.goal.reportingCadence],
    ]},
    { title: 'Tech Stack', icon: '⚙️', rows: [
      ['CMS', `${dr.tech.cms} ${dr.tech.cmsVersion}`.trim()], ['SEO plugin', dr.tech.seoPlugin],
      ['Hosting', dr.tech.hosting], ['SSL', dr.tech.ssl],
      ['PageSpeed', `${dr.tech.pagespeedMobile || '?'} mob / ${dr.tech.pagespeedDesktop || '?'} desk`],
    ]},
    { title: 'Tool Access', icon: '🔑', rows: [
      ['GSC', dr.access.gsc], ['GA4', dr.access.ga4], ['Ahrefs', dr.access.ahrefs],
      ['CMS admin', dr.access.cmsAdmin], ['Hosting', dr.access.hosting],
    ]},
    { title: 'Analytics Baseline', icon: '📊', rows: [
      ['Organic sessions', dr.analytics.organicSessions], ['GSC clicks', dr.analytics.gscClicks],
      ['GSC impressions', dr.analytics.gscImpressions], ['Avg position', dr.analytics.gscPosition],
      ['Conversions', dr.analytics.conversions], ['Bounce rate', dr.analytics.bounceRate],
    ]},
    { title: 'Technical Baseline', icon: '🔧', rows: [
      ['Pages indexed', dr.technical.pagesIndexed], ['Crawl errors', dr.technical.crawlErrors],
      ['Broken links', dr.technical.brokenLinks], ['Duplicate content', dr.technical.duplicateContent],
      ['Schema', dr.technical.schemaMarkup], ['Robots.txt', dr.technical.robotsTxt],
      ['Canonical issues', dr.technical.canonicalIssues],
    ]},
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Data Room — project definition
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map(g => (
          <div key={g.title} className="rounded-xl border border-border bg-background/50 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span>{g.icon}</span>
              <span className="text-sm font-semibold">{g.title}</span>
            </div>
            <div className="space-y-1">
              {g.rows.map(([k, v]) => (
                <div key={k} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">{k}:</span>
                  <span className={v ? 'text-foreground/90 truncate' : 'text-muted-foreground/50 italic'}>
                    {v || 'not set'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Crawl & competitive pages — keyword -> landing page + AI comparison ── */
function CrawlSection({
  projectId, keywordMap, unmatchedPages, crawlPages, summary,
  comparison, comparisonAt, onLinkChanged,
}: {
  projectId: string;
  keywordMap: KeywordPageMapping[];
  unmatchedPages: CrawlPage[];
  crawlPages: CrawlPage[];
  summary?: { total: number; ours: number; competitor: number; lastCrawled: string };
  comparison: CrawlComparison | null;
  comparisonAt: string;
  onLinkChanged: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState('');
  const [cmp, setCmp]         = useState<CrawlComparison | null>(comparison);
  const [linking, setLinking] = useState('');

  const runCrawl = async () => {
    setRunning(true);
    setResult('');
    const r = await pmApi.runCrawl(projectId);
    setRunning(false);
    if (r.success) {
      setCmp(r.comparison || null);
      if (r.saveError) {
        setResult(`Crawl ran (${r.crawledCount || 0} pages compared) but ${r.saveError}. Pages may not appear until this is resolved.`);
      } else {
        setResult(`Crawl complete — ${r.savedCount ?? r.crawledCount ?? 0} pages saved and compared.`);
      }
      onLinkChanged();
    } else {
      setResult(r.error || 'Crawl failed.');
    }
  };

  const linkPage = async (keyword: string, url: string) => {
    setLinking(keyword);
    await pmApi.linkKeywordPage(projectId, keyword, url);
    setLinking('');
    onLinkChanged();
  };

  /* our crawled pages — the options for manual keyword linking */
  const ourPages = crawlPages.filter(p => p.owner === 'ours');

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Crawl & competitive comparison
        </div>
        <div className="flex items-center gap-2">
          {summary && summary.total > 0 && (
            <span className="text-xs text-muted-foreground font-mono">
              {summary.total} pages · {summary.ours} ours · {summary.competitor} competitor
            </span>
          )}
          <button
            onClick={runCrawl}
            disabled={running}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {running ? 'Crawling live pages…' : 'Run fresh crawl'}
          </button>
        </div>
      </div>

      {result && (
        <div className={`rounded-lg border p-3 text-xs mb-3 ${
          result.startsWith('Crawl complete')
            ? 'border-green-500/30 bg-green-500/5 text-green-400'
            : 'border-amber-500/30 bg-amber-500/5 text-amber-300'
        }`}>
          {result}
        </div>
      )}

      {/* keyword -> landing page mapping, with a manual link control */}
      {keywordMap.length > 0 && (
        <div className="space-y-2 mb-4">
          {keywordMap.map((k, i) => (
            <div key={i} className="rounded-xl border border-border bg-background/50 p-3">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-sm font-semibold">{k.keyword}</span>
                {k.manuallyLinked && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">
                    manually linked
                  </span>
                )}
                {k.anyInferred && !k.manuallyLinked && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                    keyword match inferred
                  </span>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-2 text-xs mb-2">
                <div>
                  <span className="text-muted-foreground">Our page: </span>
                  {k.ourPage ? (
                    <span className="text-foreground/90">
                      {k.ourPage.url} <span className="text-muted-foreground">
                        ({k.ourPage.contentType}{k.ourPage.titleIssues ? `, ${k.ourPage.titleIssues}` : ''})
                      </span>
                    </span>
                  ) : (
                    <span className="text-amber-400">no page targeting this keyword</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Competitor: </span>
                  {k.competitorPages.length ? (
                    <span className="text-foreground/90">
                      {k.competitorPages.map(p => p.url).join(', ')}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60 italic">none crawled</span>
                  )}
                </div>
              </div>
              {/* manual link control — assign a crawled page to this keyword */}
              {ourPages.length > 0 && (
                <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">Link a page:</span>
                  <select
                    value={k.ourPage?.url || ''}
                    disabled={linking === k.keyword}
                    onChange={(e) => linkPage(k.keyword, e.target.value)}
                    className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 text-foreground/80 max-w-[60%]"
                  >
                    <option value="">— inferred / none —</option>
                    {ourPages.map((p, j) => (
                      <option key={j} value={p.url}>{p.url}</option>
                    ))}
                  </select>
                  {linking === k.keyword && (
                    <span className="text-[10px] text-muted-foreground">saving…</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* crawled pages not matched to any keyword — never hidden */}
      {unmatchedPages.length > 0 && (
        <div className="rounded-xl border border-border bg-background/30 p-3 mb-4">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Other crawled pages — not matched to a keyword
          </div>
          <ul className="space-y-1">
            {unmatchedPages.map((p, i) => (
              <li key={i} className="text-xs text-foreground/75">
                <span className={p.owner === 'ours' ? 'text-primary' : 'text-muted-foreground'}>
                  [{p.owner}]
                </span>{' '}
                {p.url}
                <span className="text-muted-foreground/60"> ({p.contentType})</span>
              </li>
            ))}
          </ul>
          <div className="text-[10px] text-muted-foreground/60 mt-2">
            Use the dropdowns above to link any of your pages to a keyword.
          </div>
        </div>
      )}

      {/* AI competitive comparison — the cross-verification */}
      {cmp ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-primary uppercase tracking-wider">
              AI competitive comparison
            </div>
            {comparisonAt && (
              <span className="text-[10px] text-muted-foreground">
                {new Date(comparisonAt).toLocaleString('en-GB')}
              </span>
            )}
          </div>

          {cmp.executive_summary && (
            <p className="text-xs text-foreground/90 leading-relaxed">{cmp.executive_summary}</p>
          )}

          {cmp.comparison_matrix?.rows?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-muted-foreground">
                    {(cmp.comparison_matrix.headers || []).map((h, i) => (
                      <th key={i} className="text-left font-medium py-1 pr-3">{h}</th>
                    ))}
                    <th className="text-left font-medium py-1">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {cmp.comparison_matrix.rows.map((row, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="py-1 pr-3 font-medium">{row.signal}</td>
                      {(row.values || []).map((v, j) => (
                        <td key={j} className="py-1 pr-3 text-foreground/80">{v}</td>
                      ))}
                      <td className="py-1 text-muted-foreground">{row.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {cmp.competitive_gaps?.length ? (
            <div>
              <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">
                Competitive gaps
              </div>
              <ul className="space-y-1">
                {cmp.competitive_gaps.map((g, i) => (
                  <li key={i} className="text-xs text-foreground/85">
                    • {g.gap}{g.action ? <span className="text-muted-foreground"> — {g.action}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {cmp.opportunities?.length ? (
            <div>
              <div className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-1">
                Opportunities
              </div>
              <ul className="space-y-1">
                {cmp.opportunities.slice(0, 5).map((o, i) => (
                  <li key={i} className="text-xs text-foreground/85">
                    • {o.title}{o.impact ? <span className="text-muted-foreground"> ({o.impact} impact)</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background/50 p-4 text-xs text-muted-foreground text-center">
          No competitive comparison yet. Run a fresh crawl to compare your pages
          against competitors and cross-verify the gathered intelligence against live data.
        </div>
      )}
    </div>
  );
}

function AuditSection({ audits }: { audits: SourceRef[] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Audit findings
        </div>
        <span className="text-[10px] text-muted-foreground/60 font-mono">
          source: audit_reports
        </span>
      </div>

      {/* audit selector when there's more than one */}
      {audits.length > 1 && (
        <div className="flex gap-1 mb-3 flex-wrap">
          {audits.map((a, i) => (
            <button
              key={i}
              onClick={() => setOpen(i)}
              className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                i === open
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {(() => {
        const a = audits[open] || audits[0];
        const d = a.detail;
        return (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-foreground/90">{a.label}</div>
            {a.url && <div className="text-xs text-muted-foreground font-mono">{a.url}</div>}

            {a.keywords && a.keywords.length > 0 && (
              <div className="text-xs">
                <span className="text-muted-foreground">Keywords audited: </span>
                <span className="text-foreground/85">{a.keywords.join(', ')}</span>
              </div>
            )}
            {a.competitors && a.competitors.length > 0 && (
              <div className="text-xs">
                <span className="text-muted-foreground">Competitors analysed: </span>
                <span className="text-foreground/85">{a.competitors.join(', ')}</span>
              </div>
            )}

            {d?.verdict && (
              <div className="rounded-lg border border-border bg-background/50 p-3">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Verdict</div>
                <div className="text-xs text-foreground/90 leading-relaxed">{d.verdict}</div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-2">
              {d?.biggestWin && (
                <AuditBox label="Biggest verified win" tone="green" text={d.biggestWin} />
              )}
              {d?.urgentGap && (
                <AuditBox label="Most urgent gap" tone="amber" text={d.urgentGap} />
              )}
            </div>

            {d?.competitive && (
              <AuditBox label="Competitive intelligence" tone="blue" text={d.competitive} />
            )}

            {/* the four audit agents' findings */}
            <div className="grid sm:grid-cols-2 gap-2">
              {d?.technical  && <AuditBox label="Technical findings"   tone="plain" text={d.technical} />}
              {d?.content    && <AuditBox label="Content & E-E-A-T"     tone="plain" text={d.content} />}
              {d?.visibility && <AuditBox label="AI visibility"         tone="plain" text={d.visibility} />}
            </div>

            {d && d.opportunities.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-1">
                  Growth opportunities
                </div>
                <ul className="space-y-0.5">
                  {d.opportunities.map((o, i) => (
                    <li key={i} className="text-xs text-foreground/85">• {o}</li>
                  ))}
                </ul>
              </div>
            )}

            {(!d || (!d.verdict && !d.technical && !d.competitive)) && (
              <div className="text-xs text-amber-400/70">
                This audit recorded a score but no detailed sections — re-run the audit
                to capture full findings for card generation.
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function AuditBox({ label, text, tone }: { label: string; text: string; tone: string }) {
  const tones: Record<string, string> = {
    green: 'border-green-500/30 bg-green-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
    blue:  'border-primary/30 bg-primary/5',
    plain: 'border-border bg-background/50',
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone] || tones.plain}`}>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-xs text-foreground/85 leading-relaxed">{text}</div>
    </div>
  );
}

/* ── Algorithm intelligence — real practices & checklists ── */
function AlgorithmSection({ topics }: { topics: SourceRef[] }) {
  const [open, setOpen] = useState<number | null>(null);
  /* topics with real saved depth first — they carry practices/checklists */
  const ordered = [...topics].sort((a, b) =>
    (b.saved ? 1 : 0) - (a.saved ? 1 : 0));
  const enrichedCount = topics.filter(t => t.saved).length;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Algorithm intelligence
        </div>
        <span className="text-[10px] text-muted-foreground/60 font-mono">
          {enrichedCount}/{topics.length} enriched
        </span>
      </div>
      <div className="text-xs text-muted-foreground mb-3">
        Practices and checklists from these topics are applied during card generation.
        {enrichedCount < topics.length && (
          <span className="text-muted-foreground/70">
            {' '}Topics without depth are generated automatically when cards are created.
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {ordered.map((t, i) => {
          const isOpen = open === i;
          const hasDepth = (t.practices?.length || 0) + (t.checklist?.length || 0) > 0;
          return (
            <div key={i} className="rounded-xl border border-border bg-background/50">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-center gap-2 p-3 text-left"
              >
                <span className="text-sm font-semibold text-foreground/90">{t.label}</span>
                {t.impact && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    t.impact === 'critical' ? 'bg-red-500/15 text-red-400'
                    : t.impact === 'high' ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-muted text-muted-foreground'
                  }`}>
                    {t.impact}
                  </span>
                )}
                {t.saved
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">enriched</span>
                  : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground/70">on-demand</span>}
                <span className="ml-auto text-muted-foreground text-xs">{isOpen ? '−' : '+'}</span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-border/50 pt-2">
                  {t.overview && (
                    <div className="text-xs text-foreground/80 leading-relaxed">{t.overview}</div>
                  )}
                  {!hasDepth && (
                    <div className="text-xs text-muted-foreground/70">
                      Full practices and checklist are generated automatically the first time
                      a card draws on this topic.
                    </div>
                  )}
                  {t.practices && t.practices.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">
                        Best practices
                      </div>
                      <ul className="space-y-0.5">
                        {t.practices.map((p, j) => (
                          <li key={j} className="text-xs text-foreground/80">• {p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {t.checklist && t.checklist.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-1">
                        Checklist
                      </div>
                      <ul className="space-y-0.5">
                        {t.checklist.map((c, j) => (
                          <li key={j} className="text-xs text-foreground/80">☐ {c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {t.rankingFactors && t.rankingFactors.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">
                        Ranking factors
                      </div>
                      <ul className="space-y-0.5">
                        {t.rankingFactors.map((f, j) => (
                          <li key={j} className="text-xs text-foreground/80">→ {f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
