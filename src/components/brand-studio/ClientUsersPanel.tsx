/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/ClientUsersPanel.tsx
   Brand Studio H.6a — PM-side client user management.

   Lives in the Client Access tab. Replaces (or sits alongside) the
   legacy bare-token sharing UI. Invite by email, set role,
   show invite link, revoke / deactivate.
═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from 'react';
import {
  Users, UserPlus, Copy, Mail, X, Loader2, RefreshCw, Trash2,
  Eye, EyeOff,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  listClientUsers, inviteClientUser, updateClientUser, revokeClientUser,
  CLIENT_ROLES, type ClientUser,
} from './api';

interface Props {
  projectId: string;
}

export default function ClientUsersPanel({ projectId }: Props) {
  const [users, setUsers]         = useState<ClientUser[]>([]);
  const [loading, setLoading]     = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [recentInvite, setRecentInvite] = useState<{ user: ClientUser; token: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await listClientUsers({ projectId, includeInactive: showInactive });
    setUsers(r.client_users);
    setLoading(false);
  }, [projectId, showInactive]);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Revoke access for this user? They lose access immediately; their history is preserved.')) return;
    const { success, error } = await revokeClientUser({ id, projectId });
    if (!success) {
      toast({ title: 'Revoke failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Access revoked' });
    load();
  };

  const handleReactivate = async (id: string) => {
    const { error } = await updateClientUser({ id, projectId, active: true });
    if (error) {
      toast({ title: 'Reactivate failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Reactivated' });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/[0.05] to-purple-500/[0.03] p-5">
        <div className="flex items-start gap-3">
          <Users className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Client users</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Invite specific named people from the client side. Each gets their own magic-link identity scoped to this project + role. Use this for ongoing collaboration where attribution matters. (Legacy bare-token links still work for one-off shares.)
            </div>
          </div>
          <button onClick={() => setShowInvite(true)}
            className="px-3 py-1.5 rounded-xl bg-cyan-500 text-white text-xs font-semibold hover:bg-cyan-500/90 flex items-center gap-1 shrink-0">
            <UserPlus className="h-3 w-3" /> Invite
          </button>
        </div>
      </div>

      {recentInvite && (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/[0.04] p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-green-400" />
            <div className="text-sm font-bold">Invite ready</div>
            <button onClick={() => setRecentInvite(null)} className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
          </div>
          <div className="text-xs text-foreground/90">
            <strong>{recentInvite.user.email}</strong> ({recentInvite.user.role})
          </div>
          <div className="text-[11px] text-muted-foreground">
            An email has been queued. You can also share the link directly:
          </div>
          <InviteLinkRow token={recentInvite.token} />
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-cyan-500" />
          Show inactive
        </label>
        <button onClick={load} className="ml-auto text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className="h-2.5 w-2.5" /> Refresh
        </button>
      </div>

      {loading && <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>}

      {!loading && users.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-xs text-muted-foreground">
          No client users yet. Click <strong>Invite</strong> to send the first magic link.
        </div>
      )}

      <div className="space-y-2">
        {users.map((u) => (
          <ClientUserRow
            key={u.id}
            user={u}
            onRevoke={() => u.id && handleRevoke(u.id)}
            onReactivate={() => u.id && handleReactivate(u.id)}
          />
        ))}
      </div>

      {showInvite && (
        <InviteDialog
          projectId={projectId}
          onClose={() => setShowInvite(false)}
          onInvited={(user, token) => {
            setShowInvite(false);
            setRecentInvite({ user, token });
            load();
          }}
        />
      )}
    </div>
  );
}

function ClientUserRow({
  user, onRevoke, onReactivate,
}: {
  user: ClientUser; onRevoke: () => void; onReactivate: () => void;
}) {
  const roleLabel = CLIENT_ROLES.find((r) => r.key === user.role)?.label || user.role;
  const inactive = !user.active;
  return (
    <div className={`rounded-xl border bg-card/60 px-4 py-3 flex items-start gap-3 ${
      inactive ? 'opacity-50 border-border' : 'border-border'
    }`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold">{user.display_name || user.email}</span>
          {user.display_name && <span className="text-[10px] text-muted-foreground">{user.email}</span>}
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-bold">{roleLabel}</span>
          {!user.invite_used && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">invite sent</span>
          )}
          {inactive && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold">deactivated</span>
          )}
        </div>
        {user.title && <div className="text-[11px] text-muted-foreground mt-0.5">{user.title}{user.org ? ` at ${user.org}` : ''}</div>}
        <div className="text-[10px] text-muted-foreground mt-1">
          {user.last_seen_at
            ? `Last seen ${new Date(user.last_seen_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}`
            : 'Never signed in'}
          {user.visit_count ? ` · ${user.visit_count} visit${user.visit_count === 1 ? '' : 's'}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!inactive ? (
          <button onClick={onRevoke} title="Deactivate access"
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
            <EyeOff className="h-3 w-3" />
          </button>
        ) : (
          <button onClick={onReactivate} title="Reactivate"
            className="p-1.5 rounded-lg hover:bg-green-500/10 text-muted-foreground hover:text-green-400">
            <Eye className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function InviteLinkRow({ token }: { token: string }) {
  const link = typeof window !== 'undefined' ? `${window.location.origin}/c/invite/${token}` : `/c/invite/${token}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast({ title: 'Link copied' }); } catch {}
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-2 py-1.5">
      <code className="text-[10px] font-mono text-foreground/80 truncate flex-1">{link}</code>
      <button onClick={copy} className="text-[10px] text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/40 flex items-center gap-1">
        <Copy className="h-2.5 w-2.5" /> Copy
      </button>
    </div>
  );
}

function InviteDialog({
  projectId, onClose, onInvited,
}: {
  projectId: string; onClose: () => void;
  onInvited: (user: ClientUser, token: string) => void;
}) {
  const [email, setEmail]   = useState('');
  const [role, setRole]     = useState('client_executive');
  const [title, setTitle]   = useState('');
  const [org, setOrg]       = useState('');
  const [notes, setNotes]   = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    const { client_user, invite_token, was_regenerated, error } = await inviteClientUser({
      projectId, email: email.trim(), role, title: title.trim() || undefined, org: org.trim() || undefined, notes: notes.trim() || undefined,
    });
    setSending(false);
    if (error || !client_user || !invite_token) {
      toast({ title: 'Invite failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: was_regenerated ? 'Invite regenerated' : 'Invite sent', description: was_regenerated ? 'Previous link is now invalid.' : undefined });
    onInvited(client_user, invite_token);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-bold">Invite client user</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-cyan-400" />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Role *</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-cyan-400">
              {CLIENT_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <div className="text-[10px] text-muted-foreground">
              {CLIENT_ROLES.find((r) => r.key === role)?.desc}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Title (optional)</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="CMO, Designer, etc."
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-cyan-400" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Org (optional)</label>
              <input value={org} onChange={(e) => setOrg(e.target.value)}
                placeholder="Company name"
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-cyan-400" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000}
              placeholder="Internal notes about this stakeholder"
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background/60 outline-none focus:border-cyan-400 resize-y" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={submit} disabled={!email.trim() || sending}
            className="px-4 py-2 rounded-xl bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-500/90 disabled:opacity-50 flex items-center gap-1.5">
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
            Send invite
          </button>
        </div>
      </div>
    </div>
  );
}
