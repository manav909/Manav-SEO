/* ════════════════════════════════════════════════════════════════
   src/pages/Planning.tsx
   Phase 6 — Project Planning Workspace.

   Top-level page that hosts the strategy lifecycle:
     • Board view (default)    — 5-stage pipeline of all strategies
     • Builder view             — create or edit a strategy
     • Detail view              — monitor a strategy + impact

   Uses ProjectContext for current project. Sticky top bar shows
   project name + cross-links to Data Room. Designed for someone
   with zero experience to drive the daily workflow.
═══════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Layers, Database, FileText, Settings, ArrowLeft, RefreshCw,
  Building2, ChevronRight,
} from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useSeasonAwareness } from '@/hooks/useSeasonAwareness';
import { subscribeAction } from '@/lib/season-actions/bus';
import StrategyPipelineBoard from '@/components/pm/StrategyPipelineBoard';
import StrategyBuilder from '@/components/pm/StrategyBuilder';
import StrategyDetailView from '@/components/pm/StrategyDetailView';

type View =
  | { kind: 'board' }
  | { kind: 'builder'; strategyId?: string }
  | { kind: 'detail';  strategyId: string };

export default function Planning() {
  const { selectedProjectId, selectedProject } = useProject() as any;
  const [view, setView] = useState<View>({ kind: 'board' });

  /* Phase 9 — declare awareness so S.E.A.S.O.N. knows what's on screen */
  useSeasonAwareness(selectedProjectId ? {
    page: 'planning',
    page_label: `Planning · ${view.kind}`,
    selected: view.kind === 'detail' && (view as any).strategyId ? {
      type: 'strategy',
      id: (view as any).strategyId,
      title: 'strategy in detail view',
    } : view.kind === 'builder' ? {
      type: 'strategy',
      title: 'new strategy being drafted',
      status: 'drafting',
    } : null,
    visible_filters: { view: view.kind },
  } : null);

  /* Phase 10b — listen for S.E.A.S.O.N. planning actions */
  useEffect(() => {
    const unsubOpen = subscribeAction('planning_open_strategy', (payload: any) => {
      if (payload?.strategyId) setView({ kind: 'detail', strategyId: payload.strategyId });
    });
    const unsubBoard = subscribeAction('planning_open_board', () => {
      setView({ kind: 'board' });
    });
    return () => { unsubOpen(); unsubBoard(); };
  }, []);

  if (!selectedProjectId) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <TopBar />
        <div className="max-w-5xl mx-auto px-6 py-12 text-center">
          <Building2 className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
          <div className="text-sm font-bold text-foreground">No project selected</div>
          <div className="text-[11px] text-muted-foreground mt-1">Open a project from the Data Room or project switcher to start planning.</div>
          <Link to="/data-room" className="inline-block mt-4 text-[11px] px-3 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25 font-bold">
            Open Data Room →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopBar projectName={selectedProject?.project_name} viewKind={view.kind} onBackToBoard={() => setView({ kind: 'board' })} />

      <div className="flex-1 overflow-hidden">
        {view.kind === 'board' && (
          <div className="max-w-7xl mx-auto px-4 py-4 w-full">
            <StrategyPipelineBoard
              projectId={selectedProjectId}
              onOpenStrategy={(id) => setView({ kind: 'detail', strategyId: id })}
              onNewStrategy={() => setView({ kind: 'builder' })}
            />
          </div>
        )}
        {view.kind === 'builder' && (
          <div className="max-w-[1600px] mx-auto w-full h-full">
            <StrategyBuilder
              projectId={selectedProjectId}
              strategyId={view.strategyId}
              onBack={() => setView({ kind: 'board' })}
              onSaved={(id) => setView({ kind: 'builder', strategyId: id })}
              onFinalized={(id) => setView({ kind: 'detail', strategyId: id })}
            />
          </div>
        )}
        {view.kind === 'detail' && (
          <div className="max-w-5xl mx-auto w-full h-full">
            <StrategyDetailView
              strategyId={view.strategyId}
              onBack={() => setView({ kind: 'board' })}
              onEdit={(id) => setView({ kind: 'builder', strategyId: id })}
              onDeleted={() => setView({ kind: 'board' })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Top bar ──────────────────────────────────────────────── */

function TopBar({ projectName, viewKind, onBackToBoard }: { projectName?: string; viewKind?: string; onBackToBoard?: () => void }) {
  return (
    <div className="border-b border-border bg-card/40 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3">
        <Layers className="h-4 w-4 text-cyan-400" />
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {projectName && <><Building2 className="h-2.5 w-2.5" /><span>{projectName}</span><ChevronRight className="h-2.5 w-2.5" /></>}
            <span className="text-foreground font-bold">Planning</span>
            {viewKind && viewKind !== 'board' && <><ChevronRight className="h-2.5 w-2.5" /><span className="text-foreground capitalize">{viewKind}</span></>}
          </div>
          <div className="text-sm font-bold text-foreground">Project Planning Workspace</div>
        </div>
        {viewKind && viewKind !== 'board' && onBackToBoard && (
          <button onClick={onBackToBoard}
            className="text-[11px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" />Pipeline
          </button>
        )}
        <div className="flex items-center gap-1">
          <Link to="/data-room" className="text-[11px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Database className="h-3 w-3" />Data Room
          </Link>
          <Link to="/" className="text-[11px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Settings className="h-3 w-3" />Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
