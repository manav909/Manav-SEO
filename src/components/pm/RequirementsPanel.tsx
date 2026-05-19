/* ════════════════════════════════════════════════════════════════
   src/components/pm/RequirementsPanel.tsx
   The Requirements tab — gather project intelligence, generate cards.

   Shows the project manager exactly what intelligence the AI will use
   (audits, algorithm intel, brain learnings, competitors) and what data
   is missing — full transparency before any card is created.
════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import type { RequirementContext, SourceRef } from './types';
import * as pmApi from './api';

export default function RequirementsPanel({
  projectId, onCardsGenerated,
}: {
  projectId: string;
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

      {/* Project summary */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Project
        </div>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row label="Name" value={ctx.projectName} />
          <Row label="URL" value={ctx.url || 'Not set'} />
          <Row label="Goal" value={ctx.goal || 'Not set'} />
          <Row label="Scope" value={ctx.scope || 'Not set'} />
        </div>
      </div>

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
                <ul className="space-y-1">
                  {g.refs.slice(0, 4).map((r, i) => (
                    <li key={i} className="text-xs text-foreground/80 truncate">• {r.label}</li>
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
