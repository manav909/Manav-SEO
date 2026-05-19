/* ════════════════════════════════════════════════════════════════
   src/components/pm/RequirementsPanel.tsx
   The Requirements tab — gather project intelligence, generate cards.

   Shows the project manager exactly what intelligence the AI will use
   (audits, algorithm intel, brain learnings, competitors) and what data
   is missing — full transparency before any card is created.
════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import type {
  RequirementContext, SourceRef, DataRoomContext, KeywordPageMapping,
  CrawlComparison,
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

  /* Gather the project's intelligence on mount / project change. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setResult('');
      const gathered = await pmApi.gatherRequirements(projectId);
      if (!cancelled) { setCtx(gathered); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

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
  const sourceGroups: { title: string; icon: string; refs: SourceRef[]; note: string }[] = [
    { title: 'Audits',           icon: '🔍', refs: ctx.audits,      note: 'Technical & on-page findings' },
    { title: 'Algorithm Intel',  icon: '📡', refs: ctx.algorithm,   note: 'Recent algorithm signals' },
    { title: 'Brain Learnings',  icon: '🧠', refs: ctx.brain,       note: 'Lessons from past work' },
    { title: 'Competitors',      icon: '🎯', refs: ctx.competitors, note: 'Competitive context' },
    { title: 'Sales Findings',   icon: '💬', refs: ctx.sales,       note: 'From client conversations' },
    { title: 'Client Notes',     icon: '📝', refs: ctx.clientNotes, note: 'Scope & requirements' },
  ];

  const totalSources = sourceGroups.reduce((n, g) => n + g.refs.length, 0);

  return (
    <div className="space-y-6">

      {/* Project summary — uses the project record the app already loaded,
          falling back to the gathered context. */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Project
        </div>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row label="Name"  value={project?.name || ctx.projectName || 'Unnamed'} />
          <Row label="URL"   value={project?.url || project?.website || ctx.url || 'Not set'} />
          <Row label="Goal"  value={project?.goals || project?.goal || ctx.goal || 'Not set'} />
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

      {/* Crawl & competitive pages — keyword -> landing page + AI comparison */}
      <CrawlSection
        projectId={projectId}
        keywordMap={ctx.keywordMap || []}
        summary={ctx.crawlSummary}
        comparison={ctx.crawlComparison || null}
        comparisonAt={ctx.crawlComparisonAt || ''}
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
          {sourceGroups.map(g => (
            <div key={g.title} className="rounded-xl border border-border bg-background/50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span>{g.icon}</span>
                <span className="text-sm font-semibold">{g.title}</span>
                <span className="text-xs text-muted-foreground ml-auto font-mono">{g.refs.length}</span>
              </div>
              <div className="text-xs text-muted-foreground mb-2">{g.note}</div>
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
                <div className="text-xs text-muted-foreground/60 italic">None available</div>
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
function CrawlSection({ projectId, keywordMap, summary, comparison, comparisonAt }: {
  projectId: string;
  keywordMap: KeywordPageMapping[];
  summary?: { total: number; ours: number; competitor: number; lastCrawled: string };
  comparison: CrawlComparison | null;
  comparisonAt: string;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState('');
  const [cmp, setCmp]         = useState<CrawlComparison | null>(comparison);

  const runCrawl = async () => {
    setRunning(true);
    setResult('');
    const r = await pmApi.runCrawl(projectId);
    setRunning(false);
    if (r.success) {
      setCmp(r.comparison || null);
      setResult(`Crawl complete — ${r.crawledCount || 0} pages analysed and compared.`);
    } else {
      setResult(r.error || 'Crawl failed.');
    }
  };

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

      {/* keyword -> landing page mapping */}
      {keywordMap.length > 0 && (
        <div className="space-y-2 mb-4">
          {keywordMap.map((k, i) => (
            <div key={i} className="rounded-xl border border-border bg-background/50 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold">{k.keyword}</span>
                {k.anyInferred && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                    keyword match inferred
                  </span>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-2 text-xs">
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
            </div>
          ))}
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

          {/* comparison matrix */}
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

          {/* competitive gaps */}
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

          {/* opportunities */}
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
