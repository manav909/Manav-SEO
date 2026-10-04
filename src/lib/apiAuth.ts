import { supabase } from '@/lib/supabase';

/* Every backend route checks who is calling (api/lib/auth.ts). Rather than
   threading the login token through ~60 call sites, this wraps window.fetch
   once: any same-origin request to /api/ gets the current Supabase access
   token attached. Visitors who are not logged in send no token, and only the
   public actions accept them. */

function isOwnApi(input: RequestInfo | URL): boolean {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export function installApiAuth(): void {
  if (typeof window === 'undefined' || (window as any).__apiAuthInstalled) return;
  (window as any).__apiAuthInstalled = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isOwnApi(input)) return nativeFetch(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has('Authorization')) {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) headers.set('Authorization', `Bearer ${token}`);
      } catch { /* no session — send the request without a token */ }
    }
    return nativeFetch(input, { ...init, headers });
  };
}
