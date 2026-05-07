import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface Profile {
  id: string;
  email: string;
  approved: boolean;
  client_id?: string;
  client_ids?: string[];
}

interface AuthState {
  user:        User | null;
  session:     Session | null;
  profile:     Profile | null;
  clients:     any[];
  projects:    any[];
  loading:     boolean;
  authChecked: boolean;
  isApproved:  boolean;
  hasClient:   boolean;
  signOut:     () => Promise<void>;
  refreshData: () => Promise<void>;
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
  const [clients,     setClients]     = useState<any[]>([]);
  const [projects,    setProjects]    = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const loadingRef = useRef(false);
  const currentUserId = useRef<string | null>(null);

  const loadUserData = useCallback(async (currentUser: User) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { data: prof, error: profErr } = await supabase
        .from('profiles').select('*').eq('id', currentUser.id).single();

      if (profErr) {
        if (profErr.code === 'PGRST116') {
          try {
            await supabase.from('profiles').insert({
              id: currentUser.id,
              email: currentUser.email || '',
              approved: false,
            });
          } catch { /* ignore */ }
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

      const [cR, pR] = await Promise.allSettled([
        supabase.from('clients').select('*').in('id', idList),
        supabase.from('projects').select('*').in('client_id', idList),
      ]);
      setClients(cR.status === 'fulfilled' ? (cR.value.data || []) : []);
      setProjects(pR.status === 'fulfilled' ? (pR.value.data || []) : []);
    } catch (e) {
      console.error('loadUserData error:', e);
      setClients([]);
      setProjects([]);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  const refreshData = useCallback(async () => {
    if (user) await loadUserData(user);
  }, [user, loadUserData]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    currentUserId.current = null;
    setUser(null);
    setSession(null);
    setProfile(null);
    setClients([]);
    setProjects([]);
  }, []);

  useEffect(() => {
    let mounted = true;

    const hardTimeout = setTimeout(() => {
      if (mounted) {
        setLoading(false);
        setAuthChecked(true);
      }
    }, 10000);

    const init = async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (s?.user) {
          currentUserId.current = s.user.id;
          setSession(s);
          setUser(s.user);
          await loadUserData(s.user);
        }
      } catch (e) {
        console.error('Auth init error:', e);
      } finally {
        if (mounted) {
          clearTimeout(hardTimeout);
          setLoading(false);
          setAuthChecked(true);
        }
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT' || !s) {
          currentUserId.current = null;
          setUser(null);
          setSession(null);
          setProfile(null);
          setClients([]);
          setProjects([]);
          setLoading(false);
          setAuthChecked(true);
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          setSession(s);
          return;
        }

        if (event === 'SIGNED_IN') {
          const isNewUser = s.user.id !== currentUserId.current;
          currentUserId.current = s.user.id;
          setSession(s);
          setUser(s.user);
          if (isNewUser) {
            setLoading(true);
            await loadUserData(s.user);
            setLoading(false);
            setAuthChecked(true);
          }
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(hardTimeout);
      subscription.unsubscribe();
    };
  }, [loadUserData]);

  return (
    <AuthContext.Provider value={{
      user, session, profile, clients, projects,
      loading, authChecked,
      isApproved: profile?.approved === true,
      hasClient:  clients.length > 0,
      signOut, refreshData,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
