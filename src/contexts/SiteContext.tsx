/**
 * SiteContext — Independent site workspace context for Site Manager.
 * Completely separate from ProjectContext — sites are not bound to
 * the global project selector. Optionally linked to a project.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'seo_season_site';

export interface DevSite {
  id:              string;
  project_id:      string | null;
  label:           string;
  domain:          string | null;
  cms:             string | null;
  psi_api_key?:    string | null;
  gsc_resource_id?: string | null;
  gsc_connected_at?: string | null;
  created_at:      string;
  updated_at:      string;
}

export interface DevPage {
  id:                       string;
  site_id:                  string;
  project_id:               string | null;
  url:                      string;
  title:                    string | null;
  page_type:                string;
  priority:                 number;
  status:                   string;
  baseline_lcp_ms:          number | null;
  baseline_tbt_ms:          number | null;
  baseline_score:           number | null;
  baseline_gsc_clicks:      number | null;
  baseline_gsc_impressions: number | null;
  baseline_gsc_position:    number | null;
  baseline_captured_at:     string | null;
  current_lcp_ms:           number | null;
  current_tbt_ms:           number | null;
  current_score:            number | null;
  issues_red:               number;
  issues_amber:             number;
  last_audited_at:          string | null;
  notes:                    string | null;
  created_at:               string;
}

interface SiteContextValue {
  sites:            DevSite[];
  selectedSite:     DevSite | null;
  selectedSiteId:   string | null;
  setSelectedSiteId:(id: string | null) => void;
  pages:            DevPage[];
  loadingSites:     boolean;
  loadingPages:     boolean;
  refreshSites:     () => Promise<void>;
  refreshPages:     () => Promise<void>;
  stats:            SiteStats | null;
}

export interface SiteStats {
  total_pages:    number;
  audited_pages:  number;
  baseline_pages: number;
  total_red:      number;
  total_amber:    number;
}

const SiteContext = createContext<SiteContextValue>({
  sites: [], selectedSite: null, selectedSiteId: null,
  setSelectedSiteId: () => {}, pages: [],
  loadingSites: false, loadingPages: false,
  refreshSites: async () => {}, refreshPages: async () => {},
  stats: null,
});

const callApi = async (action: string, payload: Record<string, unknown>) => {
  try {
    const res = await fetch('/api/task-engine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    return await res.json();
  } catch { return {}; }
};

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [sites,          setSites]          = useState<DevSite[]>([]);
  const [selectedSiteId, setSelectedSiteIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY) || null; } catch { return null; }
  });
  const [pages,        setPages]        = useState<DevPage[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [stats,        setStats]        = useState<SiteStats | null>(null);

  const setSelectedSiteId = useCallback((id: string | null) => {
    setSelectedSiteIdState(id);
    try { if (id) localStorage.setItem(STORAGE_KEY, id); else localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const refreshSites = useCallback(async () => {
    setLoadingSites(true);
    const r = await callApi('site_list', {});
    if (r.success) setSites(r.sites || []);
    setLoadingSites(false);
  }, []);

  const refreshPages = useCallback(async () => {
    if (!selectedSiteId) { setPages([]); setStats(null); return; }
    setLoadingPages(true);
    const [pagesRes, statsRes] = await Promise.all([
      callApi('site_get_pages', { siteId: selectedSiteId }),
      callApi('site_get_stats', { siteId: selectedSiteId }),
    ]);
    if (pagesRes.success) setPages(pagesRes.pages || []);
    if (statsRes.success) setStats({ total_pages: statsRes.total_pages, audited_pages: statsRes.audited_pages, baseline_pages: statsRes.baseline_pages, total_red: statsRes.total_red, total_amber: statsRes.total_amber });
    setLoadingPages(false);
  }, [selectedSiteId]);

  // Load sites on mount
  useEffect(() => { refreshSites(); }, []);

  // Load pages when site changes
  useEffect(() => { refreshPages(); }, [selectedSiteId]);

  // If stored siteId no longer exists in sites list, clear it
  useEffect(() => {
    if (sites.length > 0 && selectedSiteId && !sites.find(s => s.id === selectedSiteId)) {
      setSelectedSiteId(sites[0]?.id || null);
    }
  }, [sites]);

  const selectedSite = sites.find(s => s.id === selectedSiteId) || null;

  return (
    <SiteContext.Provider value={{ sites, selectedSite, selectedSiteId, setSelectedSiteId, pages, loadingSites, loadingPages, refreshSites, refreshPages, stats }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() { return useContext(SiteContext); }
