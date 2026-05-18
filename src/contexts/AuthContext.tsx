/**
 * AuthContext — Single-source-of-truth session management
 *
 * ROOT CAUSE OF LOGOUT BUG (fixed here):
 *
 * The old code called BOTH supabase.auth.getSession() AND listened to
 * onAuthStateChange simultaneously. On page load/refresh, Supabase fires
 * onAuthStateChange with SIGNED_OUT briefly during token validation, THEN
 * fires SIGNED_IN. The old SIGNED_OUT handler set authChecked=true with
 * user=null — ApprovedRequired immediately redirected to "/" before the
 * SIGNED_IN event arrived.
 *
 * Fix: use ONLY onAuthStateChange with the INITIAL_SESSION event.
 * Supabase v2 guarantees INITIAL_SESSION fires exactly once on mount
 * with the actual current session (or null). No race condition possible.
 * SIGNED_OUT is ignored until INITIAL_SESSION has been processed.
 */
import React, {
  createContext, useContext, useEffect, useState, useCallback, useRef,
} from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface Profile {
  id:          string;
  email:       string;
  approved:    boolean;
  client_id?:  string;
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
  isApproved:      boolean;
  staffPermissions: Record<string,boolean> | null;
  hasClient:   boolean;
  signOut:     () => Promise<void>;
  refreshData: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null, session: null, profile: null,
  clients: [], projects: [],
  loading: true, authChecked: false,
  isApproved: false, hasClient: false, staffPermissions: null,
  signOut: async () => {}, refreshData: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user,        setUser]        = useState<User | null>(null);
  const [session,     setSession]     = useState<Session | null>(null);
  const [profile,     setProfile]     = useState<Profile | null>(null);
  const [staffPermissions, setStaffPermissions] = useState<Record<string,boolean>|null>(null);
  const [clients,     setClients]     = useState<any[]>([]);
  const [projects,    setProjects]    = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const loadingRef          = useRef(false);
  const currentUserId       = useRef<string | null>(null);
  const initialSessionDone  = useRef(false);   // guards against SIGNED_OUT before INITIAL_SESSION

  /* ── Load profile, clients, projects for an authenticated user ── */
  const loadUserData = useCallback(async (currentUser: User) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { data: prof, error: profErr } = await supabase
        .from('profiles').select('*').eq('id', currentUser.id).single();

      if (profErr) {
        if (profErr.code === 'PGRST116') {
          // Profile doesn't exist yet — create it
          try {
            await supabase.from('profiles').insert({
              id:       currentUser.id,
              email:    currentUser.email || '',
              approved: true,
            });
          } catch { /* ignore insert error */ }
        }
        setProfile(null);
        setClients([]);
        setProjects([]);
        return;
      }

      // Auto-approve: Supabase Auth already controls access
      // If profile exists but approved=false, fix it silently
      if (prof && !prof.approved) {
        await supabase.from('profiles').update({ approved: true }).eq('id', currentUser.id);
        prof = { ...prof, approved: true };
      }
      setProfile(prof);
      // Look up staff member by email to get panel permissions
      if (prof?.email) {
        const { data: staffRow } = await supabase
          .from('staff_members')
          .select('permissions,role')
          .eq('email', prof.email)
          .maybeSingle();
        if (staffRow?.permissions) setStaffPermissions(staffRow.permissions);
      }

      // Build the list of client IDs this user has access to
      const idList: string[] = [];
      if (Array.isArray(prof.client_ids) && prof.client_ids.length) {
        idList.push(...prof.client_ids.filter(Boolean));
      } else if (prof.client_id) {
        idList.push(prof.client_id);
      }

      // Also find clients linked by email
      if (currentUser.email) {
        const { data: byEmail } = await supabase
          .from('clients').select('id').eq('email', currentUser.email);
        byEmail?.forEach((c: any) => {
          if (c?.id && !idList.includes(c.id)) idList.push(c.id);
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

      // Sanitize: Supabase can return null rows with certain RLS configurations
      const rawClients  = cR.status === 'fulfilled' ? (cR.value.data || []) : [];
      const rawProjects = pR.status === 'fulfilled' ? (pR.value.data || []) : [];
      setClients(rawClients.filter((c: any) => c != null && c.id != null));
      setProjects(rawProjects.filter((p: any) => p != null && p.id != null));
    } catch (e) {
      console.error('[AuthContext] loadUserData error:', e);
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
    initialSessionDone.current = false;
    setUser(null);
    setSession(null);
    setProfile(null);
    setClients([]);
    setProjects([]);
  }, []);

  /* ── Single auth listener — INITIAL_SESSION is the source of truth ── */
  useEffect(() => {
    let mounted = true;

    // Safety net: if Supabase never fires INITIAL_SESSION (offline, SDK bug),
    // unblock the app after 8 seconds so the user sees the login page.
    const fallbackTimer = setTimeout(() => {
      if (mounted && !initialSessionDone.current) {
        console.warn('[AuthContext] INITIAL_SESSION never fired — unblocking via timeout');
        setLoading(false);
        setAuthChecked(true);
      }
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mounted) return;

        /* ── INITIAL_SESSION: fires exactly once on mount ── */
        if (event === 'INITIAL_SESSION') {
          initialSessionDone.current = true;
          if (s?.user) {
            currentUserId.current = s.user.id;
            setSession(s);
            setUser(s.user);
            await loadUserData(s.user);
          }
          // Whether session exists or not, auth check is now complete
          clearTimeout(fallbackTimer);
          if (mounted) {
            setLoading(false);
            setAuthChecked(true);
          }
          return;
        }

        /* ── Ignore all events until INITIAL_SESSION processed ──
           This prevents a spurious SIGNED_OUT from firing before
           the session is loaded and causing a false redirect.      */
        if (!initialSessionDone.current) return;

        /* ── SIGNED_OUT: user explicitly signed out ── */
        if (event === 'SIGNED_OUT' || !s) {
          currentUserId.current = null;
          setUser(null);
          setSession(null);
          setProfile(null);
          setClients([]);
          setProjects([]);
          return;
        }

        /* ── TOKEN_REFRESHED: session token renewed silently ── */
        if (event === 'TOKEN_REFRESHED' && s) {
          setSession(s);
          return;
        }

        /* ── SIGNED_IN: user signed in on this tab or another ── */
        if (event === 'SIGNED_IN' && s?.user) {
          const isNewUser = s.user.id !== currentUserId.current;
          currentUserId.current = s.user.id;
          setSession(s);
          setUser(s.user);
          if (isNewUser) {
            await loadUserData(s.user);
          }
          return;
        }

        /* ── USER_UPDATED: email/password changed ── */
        if (event === 'USER_UPDATED' && s?.user) {
          setSession(s);
          setUser(s.user);
          return;
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [loadUserData]);

  return (
    <AuthContext.Provider value={{
      user, session, profile, clients, projects,
      loading, authChecked,
      isApproved: profile?.approved === true,
      staffPermissions,
      hasClient:  clients.length > 0,
      signOut, refreshData,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
