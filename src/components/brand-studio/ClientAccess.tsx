/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/ClientAccess.tsx
   Brand Studio H.1.5 — PM-side client access management.

   Two responsibilities:
   1. Enable/disable the client portal for this project + configure
      which features the client sees on login.
   2. Create, list, copy, and revoke client portal tokens (the links
      that let clients into their workspace).
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Copy, Loader2, AlertTriangle, ExternalLink, Trash2,
  CheckCircle2, Lock, Eye, EyeOff,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  listClientTokens, createClientToken, getTokenById, revokeClientToken,
  setClientPortalEnabled, updateEntitlements,
  type ClientPortalToken,
} from './api';
import type { EntitlementResolution } from './types';

interface Props {
  projectId:    string;
  entitlements: EntitlementResolution | null;
  onEntitlementsChange: (e: EntitlementResolution) => void;
}

/* The client-visible features we expose in the toggle UI.
   Subset of entitlement keys, mapped to friendly labels. */
const CLIENT_FEATURE_TOGGLES = [
  { key: 'library',  label: 'Documents Library',  desc: 'Lets the client see documents you publish to them.' },
  { key: 'brand',    label: 'Brand',              desc: 'Read-only single source of truth for their brand identity.' },
  { key: 'investor', label: 'Investor View',      desc: 'Traction proof, market sizing, investor docs (H.3+).' },
  { key: 'market',   label: 'Market & Competitive', desc: 'Share-of-voice, competitor intelligence (H.4+).' },
] as const;

export default function ClientAccess({ projectId, entitlements, onEntitlementsChange }: Props) {
  const [tokens,        setTokens]        = useState<ClientPortalToken[]>([]);
  const [loading,       setLoading]       = useState(false);

  /* create-token form */
  const [newLabel,      setNewLabel]      = useState('');
  const [newExpiryDays, setNewExpiryDays] = useState<number | ''>('');
  const [creating,      setCreating]      = useState(false);

  /* freshly-created token (one-time display) */
  const [freshToken,    setFreshToken]    = useState<string | null>(null);
  const [freshUrl,      setFreshUrl]      = useState<string | null>(null);

  /* revoke confirmation */
  const [revoking,      setRevoking]      = useState<string | null>(null);

  /* portal-enabled + features dirty state */
  const [savingFeatures, setSavingFeatures] = useState(false);

  const loadTokens = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { tokens } = await listClientTokens(projectId);
    setTokens(tokens);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  /* ── enable/disable client portal ── */
  const togglePortal = async (enabled: boolean) => {
    setSavingFeatures(true);
    const { success, error } = await setClientPortalEnabled({ projectId, enabled });
    setSavingFeatures(false);
    if (!success) {
      toast({ title: 'Update failed', description: error, variant: 'destructive' });
      return;
    }
    if (entitlements) {
      onEntitlementsChange({ ...entitlements, client_portal_enabled: enabled });
    }
    toast({ title: enabled ? 'Client portal enabled' : 'Client portal disabled' });
  };

  /* ── toggle a single client-visible feature ── */
  const toggleFeature = async (key: string, enabled: boolean) => {
    if (!entitlements) return;
    const next = { ...entitlements.client_visible_features, [key]: enabled };
    setSavingFeatures(true);
    const r = await updateEntitlements({ projectId, clientVisibleFeatures: next });
    setSavingFeatures(false);
    if (r.error) {
      toast({ title: 'Update failed', description: r.error, variant: 'destructive' });
      return;
    }
    if (r.entitlements) onEntitlementsChange(r.entitlements);
  };

  /* ── create new token ── */
  const handleCreate = async () => {
    if (!newLabel.trim()) {
      toast({ title: 'Label required', description: 'Add a short label (e.g. "John (CMO)") so you remember who this link is for.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    const { token, error } = await createClientToken({
      projectId,
      label: newLabel.trim(),
      expiresInDays: typeof newExpiryDays === 'number' ? newExpiryDays : undefined,
    });
    setCreating(false);
    if (error || !token?.token) {
      toast({ title: 'Could not create link', description: error, variant: 'destructive' });
      return;
    }
    setFreshToken(token.token);
    setFreshUrl(`${window.location.origin}/c/${token.token}`);
    setNewLabel('');
    setNewExpiryDays('');
    loadTokens();
  };

  /* ── show full link again (for non-revoked tokens) ── */
  const showLink = async (tokenId: string) => {
    const { token, error } = await getTokenById(tokenId);
    if (error || !token) {
      toast({ title: 'Cannot retrieve link', description: error, variant: 'destructive' });
      return;
    }
    setFreshToken(token);
    setFreshUrl(`${window.location.origin}/c/${token}`);
  };

  /* ── revoke ── */
  const handleRevoke = async (tokenId: string) => {
    const reason = window.prompt('Optional reason for revoking this link?') || undefined;
    const { success, error } = await revokeClientToken({ tokenId, reason });
    setRevoking(null);
    if (!success) {
      toast({ title: 'Revoke failed', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Link revoked', description: 'This link will no longer work.' });
    loadTokens();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy manually.', variant: 'destructive' });
    }
  };

  const portalEnabled = !!entitlements?.client_portal_enabled;

  /* ── render ── */
  return (
    <div className="space-y-5">

      {/* Portal master switch */}
      <div className="rounded-2xl border border-border bg-card/60 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold flex items-center gap-2">
              {portalEnabled ? <Eye className="h-4 w-4 text-green-400" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
              Client portal
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 max-w-md">
              Master switch — when disabled, all access links return "portal not enabled" even if the link is valid. Use this as a quick kill-switch.
            </div>
          </div>
          <button
            onClick={() => togglePortal(!portalEnabled)}
            disabled={savingFeatures}
            className={`px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 ${
              portalEnabled
                ? 'bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/20'
                : 'bg-muted text-muted-foreground border border-border hover:bg-muted/80'
            }`}
          >
            {portalEnabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
          </button>
        </div>
      </div>

      {/* Client-visible feature toggles */}
      <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-3">
        <div>
          <div className="text-sm font-bold">What the client sees</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Each toggle controls a tab in the client's workspace. The tab is hidden completely if disabled.
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CLIENT_FEATURE_TOGGLES.map((f) => {
            const enabled = !!entitlements?.client_visible_features?.[f.key];
            /* Disable the toggle if the tier doesn't include this feature internally */
            const internalKey = `brand_studio.${f.key}`;
            const internallyEnabled = entitlements?.features?.[internalKey] !== false;
            return (
              <div
                key={f.key}
                className={`rounded-xl border p-3 ${
                  !internallyEnabled ? 'border-border bg-card/40 opacity-50' :
                  enabled ? 'border-green-500/30 bg-green-500/[0.03]' :
                  'border-border bg-card/40'
                }`}
              >
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={!internallyEnabled || savingFeatures}
                    onChange={(e) => toggleFeature(f.key, e.target.checked)}
                    className="mt-1 accent-green-500"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      {f.label}
                      {!internallyEnabled && <span className="text-[9px] text-muted-foreground uppercase tracking-wider">tier locked</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{f.desc}</div>
                  </div>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Generate new access link */}
      <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-3">
        <div>
          <div className="text-sm font-bold">Generate access link</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Each link is unique and revocable. Share it with the client via email or your preferred channel.
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Label *</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder='e.g. "John Smith (CMO)" or "Q4 leadership review"'
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Expires in (days)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={newExpiryDays}
              onChange={(e) => setNewExpiryDays(e.target.value ? parseInt(e.target.value, 10) : '')}
              placeholder="Never"
              className="w-full h-9 text-sm px-3 rounded-xl border border-border bg-background/60 outline-none focus:border-purple-400"
            />
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || !newLabel.trim()}
          className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-500/90 disabled:opacity-50 flex items-center gap-1.5"
        >
          {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Generate link
        </button>
      </div>

      {/* Fresh token banner (one-time display) */}
      {freshToken && freshUrl && (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/[0.05] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
            <div className="text-sm font-bold">Link generated</div>
          </div>
          <div className="rounded-xl border border-border bg-background/60 p-3 break-all font-mono text-xs">
            {freshUrl}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => copyToClipboard(freshUrl)}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 font-semibold flex items-center gap-1.5"
            >
              <Copy className="h-3 w-3" />
              Copy link
            </button>
            <a
              href={freshUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            >
              <ExternalLink className="h-3 w-3" />
              Preview as client
            </a>
            <button
              onClick={() => { setFreshToken(null); setFreshUrl(null); }}
              className="text-xs text-muted-foreground hover:text-foreground ml-auto"
            >
              Dismiss
            </button>
          </div>
          <div className="text-[10px] text-amber-400/80 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            <span>
              Treat this link like a password. Anyone with the link can view this workspace until you revoke it. The link won't be shown again — copy it now.
            </span>
          </div>
        </div>
      )}

      {/* Active tokens */}
      <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-card/80 flex items-center justify-between">
          <div className="text-sm font-bold">Active access links</div>
          <div className="text-[10px] text-muted-foreground">{tokens.filter((t) => !t.revoked).length} active · {tokens.filter((t) => t.revoked).length} revoked</div>
        </div>

        {loading && (
          <div className="px-5 py-6 text-center text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
            Loading…
          </div>
        )}

        {!loading && tokens.length === 0 && (
          <div className="px-5 py-8 text-center">
            <Lock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <div className="text-xs text-muted-foreground">No access links yet. Generate one above.</div>
          </div>
        )}

        {tokens.map((t) => {
          const expired = t.expires_at && new Date(t.expires_at) < new Date();
          const status = t.revoked ? 'revoked' : expired ? 'expired' : 'active';
          return (
            <div key={t.id} className="px-5 py-3 border-b border-border last:border-b-0 flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{t.label || '(no label)'}</span>
                  <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
                    status === 'active'  ? 'bg-green-500/15 text-green-400' :
                    status === 'expired' ? 'bg-amber-500/15 text-amber-400' :
                    'bg-red-500/15 text-red-400'
                  }`}>{status}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>Created {new Date(t.created_at).toLocaleDateString('en-GB')}</span>
                  {t.expires_at && <span>· Expires {new Date(t.expires_at).toLocaleDateString('en-GB')}</span>}
                  {t.last_accessed_at ? (
                    <span>· Last accessed {new Date(t.last_accessed_at).toLocaleDateString('en-GB')} ({t.access_count} visits)</span>
                  ) : (
                    <span>· Never accessed</span>
                  )}
                  {t.revoked_at && <span>· Revoked {new Date(t.revoked_at).toLocaleDateString('en-GB')}{t.revoked_reason ? ` — ${t.revoked_reason}` : ''}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {status === 'active' && (
                  <>
                    <button
                      onClick={() => showLink(t.id)}
                      className="text-[10px] px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <Copy className="h-2.5 w-2.5" />
                      Show link
                    </button>
                    {revoking === t.id ? (
                      <button
                        onClick={() => handleRevoke(t.id)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-red-500 text-white font-bold hover:bg-red-500/90"
                      >
                        Confirm revoke
                      </button>
                    ) : (
                      <button
                        onClick={() => setRevoking(t.id)}
                        className="text-[10px] px-2 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 flex items-center gap-1"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                        Revoke
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
