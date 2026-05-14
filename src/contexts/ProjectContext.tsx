/**
 * ProjectContext — Global project selection state
 *
 * Single source of truth for which project is currently active.
 * Persisted in localStorage so selection survives navigation and refresh.
 *
 * Also computes a rich `projectBrainContext` object fed to every Brain
 * API call — contains CMS, keywords, competitors, goals, url — eliminating
 * hallucination caused by generic project summaries.
 */
import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'seoseason_project_v2';

/* ── Rich context object passed to Brain on every call ── */
export interface ProjectBrainContext {
  projectId:    string;
  projectName:  string;
  clientName:   string;
  url:          string;
  industry:     string;
  cms:          string;
  seoPlugin:    string;
  keywords:     string[];
  competitors:  string[];
  goals:        string;
  orgTraffic:   number | null;
  country:      string;
}

interface ProjectContextValue {
  selectedProjectId:   string;
  setSelectedProjectId:(id: string) => void;
  selectedProject:     any | null;
  selectedClient:      any | null;
  brainContext:         ProjectBrainContext | null;
  refreshBrainContext:  () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue>({
  selectedProjectId:    '',
  setSelectedProjectId: () => {},
  selectedProject:      null,
  selectedClient:       null,
  brainContext:          null,
  refreshBrainContext:   async () => {},
});

export const useProject = () => useContext(ProjectContext);

/* ── Load project_knowledge for the selected project ── */
async function loadProjectKnowledge(projectId: string): Promise<any> {
  if (!projectId) return null;
  try {
    const { data } = await supabase
      .from('project_knowledge')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { projects, clients, isApproved } = useAuth();

  /* ── selectedProjectId — persisted in localStorage ── */
  const [selectedProjectId, setSelectedProjectIdRaw] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [brainContext, setBrainContext] = useState<ProjectBrainContext | null>(null);

  /* Safe setter — writes to localStorage and state */
  const setSelectedProjectId = useCallback((id: string) => {
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
    setSelectedProjectIdRaw(id);
  }, []);

  /* Safe projects/clients arrays */
  const safeProjects = useMemo(() =>
    (projects || []).filter((p: any) => p != null && p.id != null),
    [projects],
  );
  const safeClients = useMemo(() =>
    (clients || []).filter((c: any) => c != null && c.id != null),
    [clients],
  );

  /* Auto-select first project when projects load and nothing is selected */
  useEffect(() => {
    if (!isApproved || !safeProjects.length) return;
    const isValid = safeProjects.some((p: any) => p.id === selectedProjectId);
    if (!isValid) {
      setSelectedProjectId(safeProjects[0].id);
    }
  }, [safeProjects, selectedProjectId, isApproved, setSelectedProjectId]);

  /* Derive selected project and client */
  const selectedProject = useMemo(() =>
    safeProjects.find((p: any) => p.id === selectedProjectId) ?? null,
    [safeProjects, selectedProjectId],
  );
  const selectedClient = useMemo(() =>
    safeClients.find((c: any) => c.id === selectedProject?.client_id) ?? null,
    [safeClients, selectedProject],
  );

  /* Build rich Brain context from project + project_knowledge */
  const buildBrainContext = useCallback(async () => {
    if (!selectedProject) { setBrainContext(null); return; }

    const knowledge = await loadProjectKnowledge(selectedProject.id);
    const pk = knowledge || {};

    const ctx: ProjectBrainContext = {
      projectId:   selectedProject.id,
      projectName: selectedProject.name || '',
      clientName:  selectedClient?.name || selectedClient?.company || '',
      url:         selectedProject.url || pk.url || '',
      industry:    selectedProject.industry || pk.industry || '',
      cms:         selectedProject.cms || pk.tech?.cms || pk.cms || '',
      seoPlugin:   selectedProject.seo_plugin || pk.tech?.seoPlugin || '',
      keywords:    (selectedProject.keywords || pk.keywords || [])
                     .filter(Boolean).slice(0, 20),
      competitors: (selectedProject.competitors || pk.competitors || [])
                     .filter(Boolean).slice(0, 10),
      goals:       selectedProject.goals || pk.goals || '',
      orgTraffic:  selectedProject.organic_monthly ?? pk.analytics?.organic ?? null,
      country:     selectedProject.country || pk.country || '',
    };
    setBrainContext(ctx);
  }, [selectedProject, selectedClient]);

  /* Rebuild brain context whenever selected project changes */
  useEffect(() => {
    if (isApproved) buildBrainContext();
  }, [selectedProject?.id, isApproved, buildBrainContext]);

  const refreshBrainContext = useCallback(() => buildBrainContext(), [buildBrainContext]);

  return (
    <ProjectContext.Provider value={{
      selectedProjectId,
      setSelectedProjectId,
      selectedProject,
      selectedClient,
      brainContext,
      refreshBrainContext,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}
