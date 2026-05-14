/**
 * ProjectContext — Global project selection + rich brain context.
 *
 * Single source of truth for:
 *   - Which project is active (persisted in localStorage)
 *   - Full ProjectBrainContext: identity, metrics, learnings, algo topics,
 *     recent tasks, canvas state — everything an AI call needs to know
 *
 * All pages and components read from here. No page builds its own context.
 * When project changes, brainContext is rebuilt automatically.
 */
import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'seo_season_proj';

/* ── Metric scores ── */
export interface ProjectMetrics {
  llmVisibility:   number | null;
  algorithmHealth: number | null;
  eeat:            number | null;
  authority:       number | null;
  growth:          number | null;
  indexed:         number | null;
  submitted:       number | null;
  recordedAt:      string;
}

/* ── Learning summary for AI context ── */
export interface LearningSummary {
  id:               string;
  card_type:        string;
  card_title:       string;
  improvement:      string;
  confidence_score: number;
  applied_count:    number;
  tags:             string[];
  what_worked:      string[];
  what_missed:      string[];
}

/* ── Algorithm topic ── */
export interface AlgoTopic {
  id:              string;
  topic:           string;
  summary:         string;
  freshness_score: number;
  impact_level:    'high' | 'medium' | 'low';
}

/* ── Full brain context ── */
export interface ProjectBrainContext {
  // Identity
  projectId:      string;
  projectName:    string;
  clientName:     string;
  url:            string;
  industry:       string;
  country:        string;

  // Tech + strategy
  cms:            string;
  seoPlugin:      string;
  keywords:       string[];
  competitors:    string[];
  goals:          string;

  // Live signals
  metrics:        ProjectMetrics | null;
  lastAuditDate:  string | null;
  lastAuditScore: number | null;

  // Knowledge base
  activeLearnings: LearningSummary[];
  pendingLearnings: number;
  algoTopics:      AlgoTopic[];
  canvas:          any[];

  // Analytics (for AI prompts)
  organicMonthly:  string;
  gscClicks:       string;
  gscImpressions:  string;

  // Completeness (0-100)
  brainScore:      number;

  // Data gaps
  gaps: {
    noGoal:        boolean;
    noCMS:         boolean;
    noAnalytics:   boolean;
    noCompetitors: boolean;
    noMetrics:     boolean;
    noAudit:       boolean;
    noLearnings:   boolean;
  };
}

interface ProjectContextValue {
  selectedProjectId:    string;
  setSelectedProjectId: (id: string) => void;
  selectedProject:      any | null;
  selectedClient:       any | null;
  brainContext:         ProjectBrainContext | null;
  refreshBrainContext:  () => Promise<void>;
  contextLoading:       boolean;
}

const ProjectContext = createContext<ProjectContextValue>({
  selectedProjectId:    '',
  setSelectedProjectId: () => {},
  selectedProject:      null,
  selectedClient:       null,
  brainContext:          null,
  refreshBrainContext:   async () => {},
  contextLoading:        false,
});

export const useProject = () => useContext(ProjectContext);

function computeBrainScore(ctx: Partial<ProjectBrainContext>): number {
  let s = 0;
  if (ctx.cms)                                s += 15;
  if ((ctx.keywords || []).length >= 3)        s += 15;
  if (ctx.goals)                               s += 10;
  if (ctx.url)                                 s += 10;
  if ((ctx.competitors || []).length >= 1)     s += 10;
  if (ctx.metrics)                             s += 15;
  if (ctx.lastAuditDate)                       s += 10;
  const ln = (ctx.activeLearnings || []).length;
  if (ln >= 20) s += 15;
  else if (ln >= 10) s += 10;
  else if (ln >= 3) s += 5;
  return Math.min(s, 100);
}

async function loadFullContext(project: any, client: any | null): Promise<ProjectBrainContext> {
  const projectId = project.id;

  /* Run all data fetches in parallel */
  const [knR, metricsR, auditR, learningsR, algoR] = await Promise.allSettled([
    supabase.from('project_knowledge').select('category,field_key,field_value').eq('project_id', projectId),
    supabase.from('metrics').select('llm_visibility_score,algorithm_health_score,eeat_score,content_authority_score,overall_growth_score,pages_indexed,pages_submitted,recorded_at').eq('project_id', projectId).order('recorded_at', { ascending: false }).limit(1),
    supabase.from('audit_reports').select('id,created_at,score').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1),
    supabase.from('brain_learnings').select('id,card_type,card_title,improvement,confidence_score,applied_count,tags,what_worked,what_missed,status').eq('project_id', projectId).in('status', ['active', 'pending_review']).order('applied_count', { ascending: false }).order('confidence_score', { ascending: false }).limit(20),
    supabase.from('algorithm_knowledge').select('id,topic,summary,freshness_score').order('freshness_score', { ascending: false }).limit(10),
  ]);

  const get = <T,>(r: PromiseSettledResult<any>, fb: T): T =>
    r.status === 'fulfilled' ? (r.value?.data ?? fb) : fb;

  /* Build project_knowledge map */
  const kMap: Record<string, Record<string, string>> = {};
  for (const row of get<any[]>(knR, [])) {
    if (!kMap[row.category]) kMap[row.category] = {};
    kMap[row.category][row.field_key] = row.field_value || '';
  }
  const km = (cat: string, key: string) => kMap[cat]?.[key] || '';

  /* Metrics */
  const mRow = get<any[]>(metricsR, [])[0] ?? null;
  const metrics: ProjectMetrics | null = mRow ? {
    llmVisibility:   mRow.llm_visibility_score   ?? null,
    algorithmHealth: mRow.algorithm_health_score ?? null,
    eeat:            mRow.eeat_score             ?? null,
    authority:       mRow.content_authority_score ?? null,
    growth:          mRow.overall_growth_score   ?? null,
    indexed:         mRow.pages_indexed          ?? null,
    submitted:       mRow.pages_submitted        ?? null,
    recordedAt:      mRow.recorded_at            || '',
  } : null;

  /* Audit */
  const aRow = get<any[]>(auditR, [])[0] ?? null;

  /* Learnings */
  const allLearnings = get<any[]>(learningsR, []);
  const activeLearnings: LearningSummary[] = allLearnings
    .filter(l => l.status === 'active')
    .map(l => ({
      id:               l.id,
      card_type:        l.card_type        || 'insight',
      card_title:       l.card_title       || '',
      improvement:      l.improvement      || '',
      confidence_score: l.confidence_score ?? 65,
      applied_count:    l.applied_count    ?? 0,
      tags:             Array.isArray(l.tags) ? l.tags : [],
      what_worked:      Array.isArray(l.what_worked) ? l.what_worked : [],
      what_missed:      Array.isArray(l.what_missed) ? l.what_missed : [],
    }));
  const pendingLearnings = allLearnings.filter(l => l.status === 'pending_review').length;

  /* Algo topics */
  const algoTopics: AlgoTopic[] = get<any[]>(algoR, []).map((a: any) => ({
    id:              a.id,
    topic:           a.topic           || '',
    summary:         a.summary         || '',
    freshness_score: a.freshness_score ?? 5,
    impact_level:    a.freshness_score >= 7 ? 'high' : a.freshness_score >= 4 ? 'medium' : 'low',
  }));

  /* Canvas */
  const canvas: any[] = Array.isArray(project.playground_canvas)
    ? project.playground_canvas
    : (project.playground_strategy?.canvas_blocks || []);

  const cms     = project.cms     || km('cms', 'cms')     || '';
  const goals   = project.goals   || km('goal', 'primary_goal') || '';
  const url     = project.url     || km('cms', 'url')     || '';
  const country = project.country || km('analytics', 'country') || '';

  const gaps = {
    noGoal:        !goals,
    noCMS:         !cms,
    noAnalytics:   !km('analytics', 'organic_sessions_monthly'),
    noCompetitors: !(project.competitors?.length) && !km('competitor', 'competitor_1'),
    noMetrics:     !metrics,
    noAudit:       !aRow,
    noLearnings:   activeLearnings.length === 0,
  };

  const ctx: ProjectBrainContext = {
    projectId,
    projectName:     project.name          || '',
    clientName:      client?.name || client?.company || '',
    url,
    industry:        project.industry      || km('goal', 'industry') || '',
    country,
    cms,
    seoPlugin:       project.seo_plugin    || km('cms', 'seo_plugin') || '',
    keywords:        (project.keywords     || []).filter(Boolean).slice(0, 20),
    competitors:     (project.competitors  || []).filter(Boolean).slice(0, 10),
    goals,
    metrics,
    lastAuditDate:   aRow ? (aRow.created_at || '').split('T')[0] : null,
    lastAuditScore:  aRow?.score ?? null,
    activeLearnings,
    pendingLearnings,
    algoTopics,
    canvas,
    organicMonthly:  km('analytics', 'organic_sessions_monthly'),
    gscClicks:       km('analytics', 'gsc_total_clicks'),
    gscImpressions:  km('analytics', 'gsc_total_impressions'),
    gaps,
    brainScore:      0,
  };
  ctx.brainScore = computeBrainScore(ctx);
  return ctx;
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { projects, clients, isApproved } = useAuth();

  const [selectedProjectId, setSelectedProjectIdRaw] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [brainContext,   setBrainContext]   = useState<ProjectBrainContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const setSelectedProjectId = useCallback((id: string) => {
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
    setSelectedProjectIdRaw(id);
  }, []);

  const safeProjects = useMemo(() =>
    (projects || []).filter((p: any) => p != null && p.id != null), [projects]);
  const safeClients  = useMemo(() =>
    (clients  || []).filter((c: any) => c != null && c.id != null), [clients]);

  /* Auto-select first project when list loads and nothing valid is selected */
  useEffect(() => {
    if (!isApproved || !safeProjects.length) return;
    const isValid = safeProjects.some((p: any) => p.id === selectedProjectId);
    if (!isValid) setSelectedProjectId(safeProjects[0].id);
  }, [safeProjects, selectedProjectId, isApproved, setSelectedProjectId]);

  const selectedProject = useMemo(() =>
    safeProjects.find((p: any) => p.id === selectedProjectId) ?? null,
    [safeProjects, selectedProjectId]);

  const selectedClient = useMemo(() =>
    safeClients.find((c: any) => c.id === selectedProject?.client_id) ?? null,
    [safeClients, selectedProject]);

  /* Build rich context whenever selected project changes */
  const buildContext = useCallback(async () => {
    if (!selectedProject) { setBrainContext(null); return; }
    setContextLoading(true);
    try {
      const ctx = await loadFullContext(selectedProject, selectedClient);
      setBrainContext(ctx);
    } catch (_e) {
      setBrainContext(null);
    }
    setContextLoading(false);
  }, [selectedProject, selectedClient]);

  useEffect(() => {
    if (isApproved) buildContext();
  }, [selectedProject?.id, isApproved, buildContext]);

  const refreshBrainContext = useCallback(() => buildContext(), [buildContext]);

  return (
    <ProjectContext.Provider value={{
      selectedProjectId,
      setSelectedProjectId,
      selectedProject,
      selectedClient,
      brainContext,
      refreshBrainContext,
      contextLoading,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}
