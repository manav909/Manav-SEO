import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/hooks/useProject';
import PortalNav from '@/components/PortalNav';

interface Section {
  section: string;
  hasCache: boolean;
  stale: boolean;
  lastUpdated: string;
  count: number;
}

export default function SystemControl() {
  const { user } = useAuth();
  const { selectedProject } = useProject();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const loadSections = async () => {
    setLoading(true);
    const tables = ['projects','clients','metrics','brain_learnings','task_executions',
      'staff_members','prospects','alerts','kanban_tasks','algorithm_knowledge'];
    const results: Section[] = [];
    for (const table of tables) {
      try {
        const { count } = await supabase.from(table).select('id', { count: 'exact', head: true });
        results.push({ section: table, hasCache: (count || 0) > 0, stale: false, lastUpdated: 'live', count: count || 0 });
      } catch {
        results.push({ section: table, hasCache: false, stale: true, lastUpdated: 'error', count: 0 });
      }
    }
    setSections(results);
    setLoading(false);
  };

  useEffect(() => { loadSections(); }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">System Control</h1>
            <p className="text-sm text-muted-foreground mt-1">Database health and system status</p>
          </div>
          <button onClick={loadSections} disabled={loading}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90">
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {loading ? (
          <div className="text-center py-16 text-sm text-muted-foreground">Loading system status...</div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
            {sections.map(s => (
              <div key={s.section} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold capitalize">{s.section.replace(/_/g, ' ')}</div>
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${s.hasCache ? 'bg-green-400' : 'bg-muted'}`}></span>
                </div>
                <div className="text-2xl font-bold font-mono text-primary mb-1">{s.count}</div>
                <div className="text-xs text-muted-foreground">records</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
