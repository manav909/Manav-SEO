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
import { Maximize2, ArrowLeft, Plus } from 'lucide-react';
import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import type { TaskCard } from '@/components/pm/types';
import * as pmApi from '@/components/pm/api';
import RequirementsPanel from '@/components/pm/RequirementsPanel';
import CardBoard from '@/components/pm/CardBoard';
import ReportsPanel from '@/components/pm/ReportsPanel';
import AutopilotPanel from '@/components/pm/AutopilotPanel';
import SeoCampaignsPanel from '@/components/pm/SeoCampaignsPanel';
import SeoInboxPanel from '@/components/pm/SeoInboxPanel';
import Documents from '@/pages/Documents';
import PMOnboardingWizard from '@/components/pm/PMOnboardingWizard';
import DevPanel from '@/components/pm/DevPanel';
import ComparePanel from '@/components/pm/ComparePanel';
import BacklinksPanel from '@/components/pm/BacklinksPanel';
import PMChatPanel from '@/components/pm/PMChatPanel';

type Tab = 'requirements' | 'board' | 'reports' | 'autopilot' | 'seo_campaigns' | 'seo_inbox' | 'documents' | 'compare' | 'backlinks' | 'developer';

export default function PMModule() {
  const { selectedProject, selectedProjectId, setSelectedProjectId } = useProject();
  const { projects, refreshData } = useAuth();
  const [showWizard, setShowWizard] = useState(false);
  const [tab, setTab]             = useState<Tab>('board');
  const [docsFullscreen, setDocsFullscreen] = useState(false);
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
    { id: 'requirements',   label: 'Requirements' },
    { id: 'board',          label: 'Board', badge: cards.length || undefined },
    { id: 'reports',        label: 'Reports', badge: doneCount || undefined },
    { id: 'autopilot',      label: 'Auto-pilot' },
    { id: 'seo_campaigns',  label: 'SEO Campaigns' },
    { id: 'seo_inbox',      label: 'SEO Inbox' },
    { id: 'documents',      label: 'Documents' },
    { id: 'compare',        label: 'Compare' },
    { id: 'backlinks',      label: '🔗 Backlinks (BDE)' },
    { id: 'developer',      label: '🛠️ Developer' },
  ];

  return (
    <>
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
                : 'Set up a project to begin'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedProjectId && (
              <button
                onClick={loadCards}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                Refresh
              </button>
            )}
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
            >
              <Plus className="h-3.5 w-3.5" />New Project
            </button>
          </div>
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

        {/* No project — show onboarding CTA */}
        {!selectedProjectId && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
              <div className="mx-auto mb-5 h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Plus className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No project selected</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto leading-relaxed">
                {(projects || []).length === 0
                  ? "No projects yet. The setup wizard walks you through creating a client, project, connecting GSC/GA4, and launching your first campaign."
                  : "Select a project from the navigation bar, or create a new one."}
              </p>
              <button
                onClick={() => setShowWizard(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-[0_0_24px_hsl(var(--primary)/0.3)] hover:bg-primary/90 transition-all"
              >
                <Plus className="h-4 w-4" />
                {(projects || []).length === 0 ? 'Set Up First Project' : 'Add New Project'}
              </button>
            </div>

            {/* Admin shortcut — clearly labelled */}
            <div className="rounded-xl border border-border bg-card/40 p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Need to add a team member or PM login?</div>
                <div className="text-xs text-muted-foreground mt-0.5">Create staff accounts, set permissions, and send magic-link invites from the Admin panel.</div>
              </div>
              <a
                href="/admin?tab=staff"
                className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border bg-background/60 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors font-mono ml-4"
              >
                Staff &amp; PM →
              </a>
            </div>
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
              <ReportsPanel
                projectId={selectedProjectId}
                projectName={selectedProject?.name || ''}
              />
            )}
            {tab === 'autopilot' && (
              <AutopilotPanel projectId={selectedProjectId} />
            )}
            {tab === 'seo_campaigns' && (
              <SeoCampaignsPanel projectId={selectedProjectId} />
            )}
            {tab === 'seo_inbox' && (
              <SeoInboxPanel projectId={selectedProjectId} />
            )}
            {tab === 'documents' && (
              <>
                {/* Fullscreen overlay */}
                {docsFullscreen && (
                  <div className="fixed inset-0 z-50 flex flex-col bg-background">
                    <div className="shrink-0 h-10 flex items-center gap-3 px-4 border-b border-border/40 bg-card/80 backdrop-blur-md">
                      <button
                        onClick={() => setDocsFullscreen(false)}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to Project Management
                      </button>
                    </div>
                    <div className="flex-1 min-h-0">
                      <Documents embedded />
                    </div>
                  </div>
                )}
                {/* Embedded view with fullscreen button */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-end">
                    <button
                      onClick={() => setDocsFullscreen(true)}
                      title="Full screen"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40 transition-colors"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      Full screen
                    </button>
                  </div>
                  <div className="h-[calc(100vh-220px)] rounded-xl overflow-hidden border border-border/40">
                    <Documents embedded />
                  </div>
                </div>
              </>
            )}
          {tab === 'compare' && (
              <ComparePanel projectId={selectedProjectId} />
            )}
          {tab === 'backlinks' && (
              <BacklinksPanel projectId={selectedProjectId} />
            )}
          {tab === 'developer' && (
              <DevPanel projectId={selectedProjectId} />
            )}
          </>
        )}
      </div>
    </div>

    {/* Onboarding wizard — full screen overlay */}
    {showWizard && (
      <PMOnboardingWizard
        onComplete={async (projectId) => {
          await refreshData();
          setSelectedProjectId(projectId);
          setShowWizard(false);
        }}
        onDismiss={() => setShowWizard(false)}
      />
    )}

    {/* PM Chat — always visible on every tab when a project is selected */}
    {selectedProjectId && (
      <PMChatPanel projectId={selectedProjectId} activeTab={tab} />
    )}
    </>
  );
}
