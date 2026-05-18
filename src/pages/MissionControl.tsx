import { useState, useEffect } from 'react';
import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import { supabase } from '@/lib/supabase';

export default function MissionControl() {
  const { selectedProject } = useProject();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('task_executions').select('*').order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => { setTasks(data || []); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Mission Control</h1>
          <p className="text-sm text-muted-foreground mt-1">Operational command centre</p>
        </div>
        {loading ? (
          <div className="text-center py-16 text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-2">
            {tasks.map((t: any, i: number) => (
              <div key={t.id || i} className="rounded-xl border border-border bg-card p-4 flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium">{t.task_type || 'Task'}</div>
                  <div className="text-xs text-muted-foreground">{t.created_at?.slice(0, 16)}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  t.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                  t.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                  'bg-primary/10 text-primary'}`}>
                  {t.status}
                </span>
              </div>
            ))}
            {!tasks.length && (
              <div className="text-center py-16 text-sm text-muted-foreground">No tasks yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
