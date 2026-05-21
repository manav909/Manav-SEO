/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/ShareGrantsPanel.tsx
   Brand Studio H.6a — Per-document share grants management.

   Shows who has access (and at what level) to a specific document.
   PM can grant any level to any active client user. Client users
   can grant only at-or-below their own access level. Investor-grade
   docs (client_resharable=false) are PM-only-shareable.
═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from 'react';
import { Share2, UserPlus, Trash2, X, Loader2, Lock, ShieldAlert } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  listShareGrants, createShareGrant, revokeShareGrant,
  clientSessionListShareGrants, clientSessionShareDoc, clientSessionRevokeShare,
  listClientUsers,
  type ShareGrant, type ClientUser,
} from './api';

interface PropsStaff {
  mode: 'staff';
  documentId:       string;
  projectId:        string;
  documentResharable: boolean;
  pmStaffId:        string;
  pmStaffLabel:     string;
}

interface PropsClient {
  mode: 'client_session';
  documentId:       string;
  documentResharable: boolean;
  sessionToken:     string;
  /* The client user's own access on this doc — limits what they can grant */
  myAccessLevel:    'view' | 'comment' | 'approve';
  /* The user's own id and label so we can mark their own grant + sharer attribution */
  myUserId:         string;
  myUserLabel:      string;
  /* Optional: other client users (for the share form). Client-side, the workspace
     will resolve these from /api earlier; pass empty array if not pre-loaded. */
  availableUsers?:  ClientUser[];
}

type Props = PropsStaff | PropsClient;

const ACCESS_LEVELS: Array<{ key: 'view' | 'comment' | 'approve'; label: string; desc: string }> = [
  { key: 'view',    label: 'View',    desc: 'Read-only access' },
  { key: 'comment', label: 'Comment', desc: 'Can view + post comments' },
  { key: 'approve', label: 'Approve', desc: 'Can view, comment, and approve' },
];

const ACCESS_ORDER = ['view', 'comment', 'approve'];

export default function ShareGrantsPanel(props: Props) {
  const [grants, setGrants]       = useState<ShareGrant[]>([]);
  const [loading, setLoading]     = useState(false);
  const [showAdd, setShowAdd]     = useState(false);
  const [availableUsers, setAvailableUsers] = useState<ClientUser[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    if (props.mode === 'staff') {
      const r = await listShareGrants({ documentId: props.documentId, projectId: props.projectId });
      setGrants(r.grants);
      const u = await listClientUsers({ projectId: props.projectId });
      setAvailableUsers(u.client_users.filter((x) => x.active));
    } else {
      const r = await clientSessionListShareGrants({ sessionToken: props.sessionToken, documentId: props.documentId });
      setGrants(r.grants);
      setAvailableUsers(props.availableUsers || []);
    }
    setLoading(false);
  }, [props]);

  useEffect(() => { load(); }, [load]);

  const canShare =
    props.mode === 'staff' ||
    (props.mode === 'client_session' && props.documentResharable);

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Revoke this access? The user will no longer see this document.')) return;
    if (props.mode === 'staff') {
      const { success, error } = await revokeShareGrant({
        id, projectId: props.projectId,
        revokedByType: 'staff', revokedById: props.pmStaffId, revokedByLabel: props.pmStaffLabel,
      });
      if (!success) {
        toast({ title: 'Revoke failed', description: error, variant: 'destructive' });
        return;
      }
    } else {
      const { success, error } = await clientSessionRevokeShare({ sessionToken: props.sessionToken, id });
      if (!success) {
        toast({ title: 'Revoke failed', description: error, variant: 'destructive' });
        return;
      }
    }
    toast({ title: 'Access revoked' });
    load();
  };

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Share2 className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-bold">Shared with</div>
        <span className="text-[10px] text-muted-foreground">— {grants.filter((g) => !g.revoked).length}</span>
        {!props.documentResharable && (
          <span className="ml-1 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-bold flex items-center gap-0.5">
            <Lock className="h-2.5 w-2.5" /> PM-only-shareable
          </span>
        )}
        {canShare && (
          <button onClick={() => setShowAdd(true)} className="ml-auto text-[10px] px-2 py-1 rounded-lg bg-purple-500 text-white font-semibold hover:bg-purple-500/90 flex items-center gap-1">
            <UserPlus className="h-2.5 w-2.5" /> Share
          </button>
        )}
      </div>

      {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}

      {!loading && grants.filter((g) => !g.revoked).length === 0 && (
        <div className="text-[11px] text-muted-foreground italic">No one has been granted access yet.</div>
      )}

      <div className="space-y-1.5">
        {grants.filter((g) => !g.revoked).map((g) => (
          <GrantRow
            key={g.id}
            grant={g}
            canRevoke={
              props.mode === 'staff' ||
              (props.mode === 'client_session' &&
                (g.granted_by_type === 'client' && g.granted_by_id === props.myUserId))
            }
            onRevoke={() => handleRevoke(g.id)}
          />
        ))}
      </div>

      {showAdd && (
        <AddShareDialog
          existingGrants={grants.filter((g) => !g.revoked)}
          availableUsers={availableUsers}
          allowedMaxLevel={props.mode === 'staff' ? 'approve' : props.myAccessLevel}
          onClose={() => setShowAdd(false)}
          onSubmit={async (userId, level) => {
            if (props.mode === 'staff') {
              const { error } = await createShareGrant({
                documentId: props.documentId, projectId: props.projectId,
                grantedToUserId: userId, accessLevel: level,
                grantedByType: 'staff', grantedById: props.pmStaffId, grantedByLabel: props.pmStaffLabel,
              });
              if (error) {
                toast({ title: 'Share failed', description: error, variant: 'destructive' });
                return false;
              }
            } else {
              const { error } = await clientSessionShareDoc({
                sessionToken: props.sessionToken, documentId: props.documentId,
                grantedToUserId: userId, accessLevel: level,
              });
              if (error) {
                toast({ title: 'Share failed', description: error, variant: 'destructive' });
                return false;
              }
            }
            toast({ title: 'Access granted' });
            setShowAdd(false);
            load();
            return true;
          }}
        />
      )}
    </div>
  );
}

function GrantRow({ grant, canRevoke, onRevoke }: { grant: ShareGrant; canRevoke: boolean; onRevoke: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-2.5 py-2 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold">{grant.granted_to_label || grant.granted_to_email}</span>
          {grant.granted_to_role && (
            <span className="text-[9px] uppercase tracking-wider px-1 py-0 rounded bg-muted text-muted-foreground font-bold">
              {grant.granted_to_role.replace('client_', '')}
            </span>
          )}
          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
            grant.access_level === 'approve' ? 'bg-green-500/15 text-green-400' :
            grant.access_level === 'comment' ? 'bg-cyan-500/15 text-cyan-400' :
            'bg-muted text-muted-foreground'
          }`}>{grant.access_level}</span>
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Granted by {grant.granted_by_label} · {new Date(grant.granted_at).toLocaleDateString('en-GB')}
        </div>
      </div>
      {canRevoke && (
        <button onClick={onRevoke} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function AddShareDialog({
  existingGrants, availableUsers, allowedMaxLevel, onClose, onSubmit,
}: {
  existingGrants: ShareGrant[];
  availableUsers: ClientUser[];
  allowedMaxLevel: 'view' | 'comment' | 'approve';
  onClose: () => void;
  onSubmit: (userId: string, level: 'view' | 'comment' | 'approve') => Promise<boolean>;
}) {
  const [userId, setUserId] = useState('');
  const [level, setLevel]   = useState<'view' | 'comment' | 'approve'>('view');
  const [submitting, setSubmitting] = useState(false);

  /* Filter out users already granted */
  const grantedIds = new Set(existingGrants.map((g) => g.granted_to_user_id));
  const eligibleUsers = availableUsers.filter((u) => u.id && !grantedIds.has(u.id));

  /* Filter access levels by allowedMax */
  const maxIdx = ACCESS_ORDER.indexOf(allowedMaxLevel);
  const eligibleLevels = ACCESS_LEVELS.filter((_, i) => i <= maxIdx);

  const submit = async () => {
    if (!userId) return;
    setSubmitting(true);
    await onSubmit(userId, level);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-md w-full">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-bold">Share document</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Share with</label>
            {eligibleUsers.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">No eligible users to share with. All active client users already have access.</div>
            ) : (
              <select value={userId} onChange={(e) => setUserId(e.target.value)}
                className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400">
                <option value="">— Select user —</option>
                {eligibleUsers.map((u) => (
                  <option key={u.id} value={u.id!}>{u.display_name || u.email} ({u.role.replace('client_', '')})</option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Access level</label>
            <div className="space-y-1.5">
              {eligibleLevels.map((l) => (
                <label key={l.key} className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border ${
                  level === l.key ? 'border-purple-500/40 bg-purple-500/[0.04]' : 'border-border bg-background/20'
                }`}>
                  <input type="radio" checked={level === l.key} onChange={() => setLevel(l.key)} className="mt-1 accent-purple-500" />
                  <div>
                    <div className="text-xs font-semibold">{l.label}</div>
                    <div className="text-[10px] text-muted-foreground">{l.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            {allowedMaxLevel !== 'approve' && (
              <div className="text-[10px] text-amber-400 italic flex items-start gap-1 mt-1">
                <ShieldAlert className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                You can only grant access at or below your own ({allowedMaxLevel}).
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={submit} disabled={!userId || submitting}
            className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-500/90 disabled:opacity-50 flex items-center gap-1.5">
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
            Grant access
          </button>
        </div>
      </div>
    </div>
  );
}
