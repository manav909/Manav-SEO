/* ════════════════════════════════════════════════════════════════
   src/pages/PMModule.tsx
   Project Management Module — the page a project manager logs into.

   Three tabs:  Requirements  ·  Board  ·  Reports
   - Requirements: gathered project intelligence → AI generates task cards
   - Board:        the 5-week canvas; place, execute, verify cards
   - Reports:      task/progress reports for client dashboards & invoicing

   Integrates natively: useProject() for project selection, PortalNav,
   the existing design system. No isolated state.
════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import type { TaskCard } from '@/components/pm/types';
import * as pmApi from '@/components/pm/api';
import RequirementsPanel from '@/components/pm/RequirementsPanel';
import CardBoard from '@/components/pm/CardBoard';
import ReportsPanel from '@/components/pm/ReportsPanel';

type Tab = 'requirements' | 'board' | 'reports';

export default function PMModule() {
  const { selectedProject, selectedProjectId } = useProject();
  const [tab, setTab]       = useState<Tab>('board');
  const [cards, setCards]   = useState<TaskCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  /* Load all cards for the selected project. */
  const loadCards = useCallback(async () => {
    if (!selectedProjectId) { setCards([]); return; }
    setLoading(true);
    setError('');
    try {
      const loaded = await pmApi.loadCards(selectedProjectId);
      setCards(loaded);
    } catch (e: any) {
      setError(e?.message || 'Failed to load cards');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => { loadCards(); }, [loadCards]);

  /* Counts for the tab badges. */
  const placedCount = cards.filter(c => c.placed).length;
  const doneCount   = cards.filter(c => ['done', 'verified'].includes(c.status)).length;

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'requirements', label: 'Requirements' },
    { id: 'board',        label: 'Board', badge: cards.length || undefined },
    { id: 'reports',      label: 'Reports', badge: doneCount || undefined },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Project Management</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedProject
                ? `${selectedProject.name} — ${cards.length} task${cards.length === 1 ? '' : 's'}, ${placedCount} on the board`
                : 'Select a project to begin'}
            </p>
          </div>
          {selectedProjectId && (
            <button
              onClick={loadCards}
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              Refresh
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {t.badge != null && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* No project */}
        {!selectedProjectId && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <div className="text-3xl mb-3">📁</div>
            <p className="text-sm text-muted-foreground">
              Select a project from the navigation to manage its tasks.
            </p>
          </div>
        )}

        {/* Error */}
        {error && selectedProjectId && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        {/* Tab content */}
        {selectedProjectId && (
          <>
            {tab === 'requirements' && (
              <RequirementsPanel
                projectId={selectedProjectId}
                project={selectedProject}
                onCardsGenerated={loadCards}
              />
            )}
            {tab === 'board' && (
              <CardBoard
                projectId={selectedProjectId}
                project={selectedProject}
                cards={cards}
                loading={loading}
                onChange={loadCards}
              />
            )}
            {tab === 'reports' && (
              <ReportsPanel projectId={selectedProjectId} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
