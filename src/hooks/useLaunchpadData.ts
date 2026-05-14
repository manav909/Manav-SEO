/**
 * useLaunchpadData — loads all empire data directly from Supabase.
 *
 * Uses the authenticated frontend Supabase client (user JWT, RLS-aware).
 * Bypasses the API layer entirely to eliminate auth/RLS failure points.
 * Both Oval and MissionControl import this hook.
 */
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ProjectStat {
  id: string; name: string; url: string; cms: string; status: string;
  keywords: string[]; goals: string; competitors: string[];
  organic_monthly: number | null; created_at: string; client_id: string;
  clientName: string;
  activeLearnings: number; pendingLearnings: number; totalLearnings: number;
  taskCount: number; brainScore: number; lastActivity: string;
  lastAuditScore: number | null; lastAuditDate: string | null;
}

export interface LaunchpadData {
  projectStats: ProjectStat[];
  totals: {
    projects: number; activeProjects: number; clients: number;
    totalLearnings: number; activeLearnings: number; pendingApprovals: number;
    institutionalKnowledge: number; algoTopics: number; totalDeskItems: number;
    taskCount: number; todayTasks: number; todayCost: number; totalCost: number;
  };
  algoTopics: any[];
  recentLogs: any[];
  recentTasks: any[];
  pendingLearnings: any[];
}

function brainScore(p: any, activeLearnings: number): number {
  let s = 0;
  if (p?.cms)                   s += 25;
  if (p?.keywords?.length >= 3) s += 20;
  if (p?.goals)                 s += 15;
  if (p?.url)                   s += 10;
  if (p?.competitors?.length >= 1) s += 10;
  if (activeLearnings >= 20)    s += 20;
  else if (activeLearnings >= 10) s += 12;
  else if (activeLearnings >= 5)  s += 6;
  return s;
}

export function useLaunchpadData() {
  const { projects, clients } = useAuth();
  const [data,    setData]    = useState<LaunchpadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const safeProjects = (projects || []).filter((p: any) => p?.id);
      const safeClients  = (clients  || []).filter((c: any) => c?.id);

      if (safeProjects.length === 0) {
        // Projects not loaded yet from AuthContext — wait
        setLoading(false);
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      // Run all queries in parallel — authenticated via Supabase session
      const [
        learningsR, tasksR, deskR, algoR, logsR, auditsR, costR,
      ] = await Promise.allSettled([
        supabase.from('brain_learnings')
          .select('id,project_id,status,card_type,confidence_score,created_at,applied_count,auto_captured,card_title,improvement')
          .order('created_at', { ascending: false }),
        supabase.from('task_executions')
          .select('id,project_id,task_type,status,created_at')
          .order('created_at', { ascending: false }).limit(60),
        supabase.from('brain_desk')
          .select('id,project_id,content_type,created_at')
          .order('created_at', { ascending: false }).limit(40),
        supabase.from('algorithm_knowledge')
          .select('id,topic,freshness_score,updated_at,summary')
          .order('updated_at', { ascending: false }).limit(20),
        supabase.from('system_change_log')
          .select('id,change_type,description,created_at')
          .order('created_at', { ascending: false }).limit(20),
        supabase.from('audit_reports')
          .select('id,project_id,created_at,score')
          .order('created_at', { ascending: false }).limit(20),
        supabase.from('api_cost_log')
          .select('id,cost,project_id,created_at')
          .order('created_at', { ascending: false }).limit(100),
      ]);

      const get = (r: any) => r.status === 'fulfilled' ? (r.value.data || []) : [];
      const learnings  = get(learningsR);
      const tasks      = get(tasksR);
      const deskItems  = get(deskR);
      const algoTopics = get(algoR);
      const logs       = get(logsR);
      const audits     = get(auditsR);
      const costs      = get(costR);

      // Build per-project stats
      const projectStats: ProjectStat[] = safeProjects.map((p: any) => {
        const pL = learnings.filter((l: any) => l.project_id === p.id);
        const pT = tasks.filter((t: any) => t.project_id === p.id);
        const pA = audits.filter((a: any) => a.project_id === p.id);
        const pC = costs.filter((c: any) => c.project_id === p.id);
        const active  = pL.filter((l: any) => l.status === 'active').length;
        const pending = pL.filter((l: any) => l.status === 'pending_review').length;
        const totalCost = pC.reduce((s: number, c: any) => s + (c.cost || 0), 0);
        const client = safeClients.find((c: any) => c.id === p.client_id);
        const lastActivity = [
          pT[0]?.created_at, pA[0]?.created_at, pL[0]?.created_at,
        ].filter(Boolean).sort().reverse()[0] || p.created_at;

        return {
          ...p,
          clientName: client?.name || client?.company || '',
          activeLearnings: active,
          pendingLearnings: pending,
          totalLearnings: pL.length,
          taskCount: pT.length,
          lastAuditScore: pA[0]?.score || null,
          lastAuditDate: pA[0]?.created_at || null,
          brainScore: brainScore(p, active),
          totalCost: Math.round(totalCost * 100) / 100,
          lastActivity,
        };
      });

      const todayCost  = costs.filter((c: any) => c.created_at?.startsWith(today))
                               .reduce((s: number, c: any) => s + (c.cost || 0), 0);
      const totalCostAll = costs.reduce((s: number, c: any) => s + (c.cost || 0), 0);
      const allActive  = learnings.filter((l: any) => l.status === 'active').length;
      const allPending = learnings.filter((l: any) => l.status === 'pending_review').length;
      const institutional = learnings.filter((l: any) => !l.project_id && l.status === 'active').length;
      const todayTasks = tasks.filter((t: any) => t.created_at?.startsWith(today)).length;

      setData({
        projectStats,
        totals: {
          projects:             safeProjects.length,
          activeProjects:       safeProjects.filter((p: any) => p.status !== 'archived').length,
          clients:              safeClients.length,
          totalLearnings:       learnings.length,
          activeLearnings:      allActive,
          pendingApprovals:     allPending,
          institutionalKnowledge: institutional,
          algoTopics:           algoTopics.length,
          totalDeskItems:       deskItems.length,
          taskCount:            tasks.length,
          todayTasks,
          todayCost:            Math.round(todayCost * 10000) / 10000,
          totalCost:            Math.round(totalCostAll * 100) / 100,
        },
        algoTopics:       algoTopics.slice(0, 10),
        recentLogs:       logs.slice(0, 10),
        recentTasks:      tasks.slice(0, 15),
        pendingLearnings: learnings.filter((l: any) => l.status === 'pending_review').slice(0, 30),
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load empire data');
    }
    setLoading(false);
  }, [projects, clients]);

  // Auto-load when projects become available
  useEffect(() => {
    if ((projects || []).length > 0) load();
  }, [(projects || []).length]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, reload: load };
}
