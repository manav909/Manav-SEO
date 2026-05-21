/* ════════════════════════════════════════════════════════════════
   src/pages/InviteRedeem.tsx
   Brand Studio H.6a — Public magic-link landing page.

   Route: /c/invite/:token
   Flow: user clicks email link → lands here → sees the project they're
   being invited to → enters display name → session is minted → redirected
   to /c/workspace (session-based client workspace).
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Sparkles, Mail, CheckCircle2, AlertTriangle } from 'lucide-react';
import { redeemInvite, storeClientSession, CLIENT_ROLES } from '@/components/brand-studio/api';

export default function InviteRedeem() {
  const { token } = useParams<{ token: string }>();
  const navigate  = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');

  /* No upfront fetch — we don't expose invite details without the user
     completing signup. Backend validates token + name + mints session. */

  const submit = async () => {
    if (!token) return;
    if (!displayName.trim()) {
      setError('Please enter your name to continue.');
      return;
    }
    setSubmitting(true);
    setError('');
    const r = await redeemInvite({ inviteToken: token, displayName: displayName.trim() });
    setSubmitting(false);
    if (r.error || !r.session_token) {
      setError(r.error || 'Could not redeem invite');
      return;
    }
    storeClientSession(r.session_token, r.session_expires_at || '');
    navigate('/c/workspace');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="rounded-3xl border border-border bg-card shadow-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-purple-500/10 to-cyan-500/10">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" />
              <div>
                <div className="text-sm font-bold">You've been invited</div>
                <div className="text-[11px] text-muted-foreground">to collaborate on a Brand Studio project</div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="text-sm text-foreground/90">
              Welcome. Your account manager has invited you to a private workspace where you can review documents, comment, approve, and contribute to the project.
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                Your name *
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="e.g. John Smith"
                autoFocus
                className="w-full h-10 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400"
              />
              <div className="text-[10px] text-muted-foreground">
                This is how you'll appear on comments and approvals. You can include your title if you like (e.g. "John Smith, CMO").
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/[0.04] p-3 text-xs text-red-400 flex items-start gap-2">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={submit}
              disabled={!displayName.trim() || submitting}
              className="w-full px-4 py-3 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-500/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Continue to workspace
            </button>

            <div className="text-[10px] text-muted-foreground text-center pt-2 border-t border-border">
              No password needed — your access persists in this browser. Your session is private to you and expires in 90 days of inactivity.
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-[10px] text-muted-foreground flex items-center justify-center gap-1">
          <Mail className="h-2.5 w-2.5" />
          Powered by Brand Studio
        </div>
      </div>
    </div>
  );
}
