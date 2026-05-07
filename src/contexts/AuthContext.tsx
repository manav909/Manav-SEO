import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface Profile {
  id: string;
  email: string;
  approved: boolean;
  client_id?: string;
  client_ids?: string[];
  phone?: string;
  name?: string;
}

interface ClientData {
  id: string;
  name: string;
  company: string;
  industry?: string;
  website?: string;
  email?: string;
  retainer_amount?: number;
}

interface ProjectData {
  id: string;
  client_id: string;
  name: string;
  url: string;
  keywords?: string[];
  competitors?: string[];
  baseline_date?: string;
  last_analysis?: any;
  last_analysis_at?: string;
  launchpad_data?: any;
  launchpad_generated_at?: string;
  current_phase?: number;
}

interface AuthState {
  user:          User | null;
  session:       Session | null;
  profile:       Profile | null;
  clients:       ClientData[];
  projects:      ProjectData[];
  loading:       boolean;
  authChecked:   boolean;
  isApproved:    boolean;
  hasClient:     boolean;
  signOut:       () => Promise<void>;
  refreshData:   () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null, session: null, profile: null,
  clients: [], projects: [],
  loading: true, authChecked: false,
  isApproved: false, hasClient: false,
  signOut: async () => {}, refreshData: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user,        setUser]        = useState<User | null>(null);
  const [session,     setSession]     = useState<Session | null>(null);
  const [profile,     setProfile]     = useState<Profile | null>(null);
  const [clients,     setClients]     = useState<ClientData[]>([]);
  const [projects,    setProjects]    = useState<ProjectData[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const loadUserData = useCallback(async (currentUser: User) => {
    try {
      /* ── 1. Load profile ── */
      const { data: prof, error: profErr } = await supabase
        .from('profiles').select('*').eq('id', currentUser.id).single();

      if (profErr || !prof) {
        /* Profile might not exist yet — create it */
        if (profErr?.code === 'PGRST116') {
          await supabase.from('profiles').insert({
            id:       currentUser.id,
            email:    currentUser.email,
            approved: false,
          });
        }
        setProfile(null);
        setClients([]);
        setProjects([]);
        return;
      }

      setProfile(prof);

      if (!prof.approved) {
        setClients([]);
        setProjects([]);
        return;
      }

      /* ── 2. Build client ID list ── */
      const idList: string[] = [];
      if (prof.client_ids?.length)  idList.push(...prof.client_ids.filter(Boolean));
      else if (prof.client_id)      idList.push(prof.client_id);

      /* ── 3. Email fallback ── */
      if (currentUser.email) {
        const { data: byEmail } = await supabase
          .from('clients').select('id').eq('email', currentUser.email);
        byEmail?.forEach((c: any) => {
          if (!idList.includes(c.id)) idList.push(c.id);
        });
      }

      if (!idList.length) {
        setClients([]);
        setProjects([]);
        return;
      }

      /* ── 4. Load clients + projects in parallel ── */
      const [{ data: cList }, { data: pList }] = await Promise.all([
        supabase.from('clients').select('*').in('id', idList),
        supabase.from('projects').select('*').in('client_id', idList),
      ]);

      setClients(cList || []);
      setProjects(pList || []);
    } catch (err) {
      console.error('AuthContext loadUserData error:', err);
    }
  }, []);

  const refreshData = useCallback(async () => {
    if (!user) return;
    await loadUserData(user);
  }, [user, loadUserData]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setClients([]);
    setProjects([]);
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        /* Get current session */
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (s?.user) {
          setSession(s);
          setUser(s.user);
          await loadUserData(s.user);
        }
      } catch (err) {
        console.error('Auth init error:', err);
      } finally {
        if (mounted) {
          setLoading(false);
          setAuthChecked(true);
        }
      }
    };

    init();

    /* Listen for auth changes */
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT' || !s) {
          setUser(null);
          setSession(null);
          setProfile(null);
          setClients([]);
          setProjects([]);
          setLoading(false);
          setAuthChecked(true);
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setSession(s);
          setUser(s.user);
          setLoading(true);
          await loadUserData(s.user);
          setLoading(false);
          setAuthChecked(true);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadUserData]);

  const isApproved = profile?.approved === true;
  const hasClient  = clients.length > 0;

  return (
    <AuthContext.Provider value={{
      user, session, profile, clients, projects,
      loading, authChecked, isApproved, hasClient,
      signOut, refreshData,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
