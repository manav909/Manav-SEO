/* ════════════════════════════════════════════════════════════════
   src/pages/ClientLogin.tsx
   Route: /c/login — a returning client types their email and we send a
   one-time sign-in link (valid 30 minutes). No passwords to remember.
═══════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { Loader2, Mail, CheckCircle2, AlertTriangle } from 'lucide-react';
import { requestClientLogin } from '@/components/brand-studio/api';

export default function ClientLogin() {
  const [email, setEmail]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [sent, setSent]     = useState('');
  const [error, setError]   = useState('');

  const submit = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError('');
    const r = await requestClientLogin(email.trim());
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setSent(r.message || 'Check your inbox for a sign-in link.');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-3xl border border-border bg-card shadow-2xl p-6 space-y-4">
        <div>
          <div className="text-lg font-bold">Sign in to SEO Season</div>
          <div className="text-sm text-muted-foreground mt-1">
            Enter the email your SEO Season team invited. We'll email you a link — no password needed.
          </div>
        </div>

        {sent ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-sm flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
            <span>{sent}</span>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label htmlFor="client-email" className="text-xs font-semibold text-muted-foreground">Email</label>
              <input
                id="client-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="you@yourbusiness.com"
                autoFocus
                className="w-full h-11 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-primary"
              />
            </div>
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/[0.04] p-3 text-xs text-red-500 flex items-start gap-2">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              onClick={submit}
              disabled={!email.trim() || busy}
              className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Email me a sign-in link
            </button>
          </>
        )}
      </div>
    </div>
  );
}
