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
      const { data: prof, error: profErr } = await supabase
        .from('profiles').select('*').eq('id', currentUser.id).single();

      if (profErr) {
        if (profErr.code === 'PGRST116') {
          /* Profile doesn't exist — create it silently */
          try {
            await supabase.from('profiles').insert({
              id:       currentUser.id,
              email:    currentUser.email || '',
              approved: false,
            });
          } catch { /* ignore insert error */ }
        }
        setProfile(null);
        setClients([]);
        setProjects([]);
        return;
      }

      setProfile(prof);
      if (!prof?.approved) {
        setClients([]);
        setProjects([]);
        return;
      }

      const idList: string[] = [];
      if (Array.isArray(prof.client_ids) && prof.client_ids.length) {
        idList.push(...prof.client_ids.filter(Boolean));
      } else if (prof.client_id) {
        idList.push(prof.client_id);
      }

      if (currentUser.email) {
        try {
          const { data: byEmail } = await supabase
            .from('clients').select('id').eq('email', currentUser.email);
          byEmail?.forEach((c: any) => {
            if (c.id && !idList.includes(c.id)) idList.push(c.id);
          });
        } catch { /* ignore */ }
      }

      if (!idList.length) {
        setClients([]);
        setProjects([]);
        return;
      }

      const [cResult, pResult] = await Promise.allSettled([
        supabase.from('clients').select('*').in('id', idList),
        supabase.from('projects').select('*').in('client_id', idList),
      ]);

      setClients(cResult.status === 'fulfilled' ? (cResult.value.data || []) : []);
      setProjects(pResult.status === 'fulfilled' ? (pResult.value.data || []) : []);
    } catch (err) {
      console.error('loadUserData failed:', err);
      setProfile(null);
      setClients([]);
      setProjects([]);
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
        const { data: { session: s }, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          console.error('getSession error:', error);
          /* Clear potentially corrupted session */
          await supabase.auth.signOut();
        } else if (s?.user) {
          setSession(s);
          setUser(s.user);
          try {
            await loadUserData(s.user);
          } catch (dataErr) {
            console.error('loadUserData error:', dataErr);
          }
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
