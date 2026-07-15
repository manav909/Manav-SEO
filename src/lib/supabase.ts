import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* A missing build-time env var makes the client non-functional: every auth call
   silently fails, the session never restores, the user appears logged out, and
   the whole staff portal / BDE panels vanish from the home page. Vite bakes
   these in at BUILD time, so a rebuild without them set is a common, invisible
   cause. Surface it loudly (console + a visible banner) instead of failing
   silently, so the real problem is obvious at a glance. */
if (!supabaseUrl || !supabaseAnonKey) {
  const msg = '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY at build time — authentication cannot work and staff panels will be hidden. Set these in the deploy environment and rebuild.';
  console.error(msg);
  if (typeof document !== 'undefined') {
    try {
      const b = document.createElement('div');
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b91c1c;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:10px 16px;text-align:center';
      b.textContent = 'Configuration error: Supabase keys are missing from this build, so sign-in is disabled. Rebuild with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set.';
      document.addEventListener('DOMContentLoaded', () => document.body.prepend(b));
    } catch { /* noop */ }
  }
}

/* Explicit session persistence. These are the SDK defaults, set explicitly so a
   session survives refresh and auto-refreshes its token. The storage key is left
   at its default on purpose, so any session a user already has stays valid. */
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Profile = {
  id: string;
  email: string;
  phone: string | null;
  approved: boolean;
  created_at: string;
};
