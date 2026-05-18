import { useState } from 'react';
import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';

export default function Playground() {
  const { selectedProject, selectedProjectId } = useProject();
  const [tab, setTab] = useState<'strategy' | 'pipeline' | 'reports'>('strategy');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Canvas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedProject
              ? `Strategy & execution for ${selectedProject.name}`
              : 'Select a project to begin'}
          </p>
        </div>
        <div className="flex gap-1 border-b border-border mb-6">
          {(['strategy', 'pipeline', 'reports'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'strategy' && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold mb-2">SEO Strategy Canvas</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {selectedProject
                ? `Working on ${selectedProject.name} — ${(selectedProject as any).goals || 'Building organic visibility'}.`
                : 'Select a project from the navigation to load your strategy canvas.'}
            </p>
          </div>
        )}
        {tab === 'pipeline' && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold mb-2">AI Pipeline</h2>
            <p className="text-sm text-muted-foreground">
              The AI pipeline analyses your project and generates strategic recommendations.
              {!selectedProject && ' Select a project to begin.'}
            </p>
          </div>
        )}
        {tab === 'reports' && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold mb-2">Reports</h2>
            <p className="text-sm text-muted-foreground mb-3">
              View auto-generated performance reports for your project.
            </p>
            <a href="/reports" className="text-sm text-primary hover:underline font-medium">
              Open full Reports page →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
