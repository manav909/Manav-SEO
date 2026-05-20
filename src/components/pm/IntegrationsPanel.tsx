/* ════════════════════════════════════════════════════════════════
   IntegrationsPanel.tsx
   Per-project integrations surface — currently Google Search Console
   (Phase D), GA4 next (Phase E), more later.

   Each integration shows:
     - connection state (not connected | connected, no property | live)
     - actions: connect / pick property / pull now / disconnect
     - last pull info (when, status, error if any)

   Rendered at the top of the PM Requirements page so the PM can see
   data-source health alongside the rest of the project brief.
═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import {
  Plug, Check, AlertCircle, ExternalLink, Loader2, RefreshCw, Unplug,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as pmApi from './api';

interface GscStatus {
  connected:     boolean;
  resourceId?:   string;
  resourceLabel?: string;
  lastPullAt?:   string;
  lastPullStatus?: string;
  lastPullError?: string;
  connectedAt?:  string;
}

interface Site { url: string; perm: string; }

export default function IntegrationsPanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<GscStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [selecting, setSelecting] = useState('');

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { status, error } = await pmApi.gscStatus(projectId);
    setLoading(false);
    if (error) { toast({ title: 'Could not load GSC status', description: error, variant: 'destructive' }); return; }
    setStatus(status);
  }, [projectId, toast]);

  useEffect(() => { load(); }, [load]);

  /* listen for the OAuth popup's postMessage so we refresh status when
     the connect flow completes in the popup window */
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e?.data?.type === 'gsc_connected') { load(); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [load]);

  const connect = async () => {
    setConnecting(true);
    const { url, error } = await pmApi.gscOauthStart(projectId);
    setConnecting(false);
    if (error || !url) { toast({ title: 'Could not start OAuth', description: error, variant: 'destructive' }); return; }
    /* open the consent screen in a popup so the user stays on the page */
    const w = 520, h = 700;
    const left = (window.screen.width  - w) / 2;
    const top  = (window.screen.height - h) / 2;
    window.open(url, 'gsc_oauth', `width=${w},height=${h},left=${left},top=${top}`);
  };

  const openPicker = async () => {
    setShowPicker(true);
    setLoadingSites(true);
    const { sites, error } = await pmApi.gscListProperties(projectId);
    setLoadingSites(false);
    if (error) { toast({ title: 'Could not load properties', description: error, variant: 'destructive' }); return; }
    setSites(sites);
  };

  const selectProperty = async (s: Site) => {
    setSelecting(s.url);
    const { success, error } = await pmApi.gscSelectProperty({
      projectId, siteUrl: s.url, label: s.url,
    });
    setSelecting('');
    if (!success) { toast({ title: 'Could not select property', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Property selected', description: s.url });
    setShowPicker(false);
    /* immediately do a first pull so the PM sees data right away */
    await pull(true);
    await load();
  };

  const pull = async (silent = false) => {
    setPulling(true);
    const { totals, error } = await pmApi.gscPull({ projectId });
    setPulling(false);
    if (error) {
      if (!silent) toast({ title: 'Pull failed', description: error, variant: 'destructive' });
      await load();
      return;
    }
    if (totals && !silent) {
      toast({
        title: 'GSC data pulled',
        description: `Last 7 days: ${totals.clicks} clicks · ${totals.impressions} impressions · pos ${totals.position.toFixed(1)}`,
      });
    }
    await load();
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Google Search Console for this project? You can reconnect any time.')) return;
    setDisconnecting(true);
    const { success, error } = await pmApi.gscDisconnect(projectId);
    setDisconnecting(false);
    if (!success) { toast({ title: 'Disconnect failed', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Disconnected' });
    await load();
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading integrations…
        </div>
      </div>
    );
  }

  const lastPullDate = status?.lastPullAt ? new Date(status.lastPullAt) : null;
  const lastPullAgo = lastPullDate ? Math.floor((Date.now() - lastPullDate.getTime()) / 86_400_000) : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Plug className="h-3.5 w-3.5" /> Integrations
        </div>
      </div>

      {/* ── GSC row ── */}
      <div className="rounded-xl border border-border bg-background/40 p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold">Google Search Console</span>
              {status?.connected && status.resourceId && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-semibold">
                  <Check className="h-3 w-3" /> Live
                </span>
              )}
              {status?.connected && !status.resourceId && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-semibold">
                  Pick a property
                </span>
              )}
              {!status?.connected && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground/80">
                  Not connected
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {status?.connected
                ? (status.resourceId
                    ? <>Property: <span className="font-mono text-foreground/85">{status.resourceLabel || status.resourceId}</span></>
                    : 'Connected but no property selected — click "Pick property" to choose which site to track.')
                : 'Pull clicks, impressions, and average position directly from Search Console — feeds the trend charts and report attribution automatically.'}
            </div>
            {status?.connected && lastPullDate && (
              <div className="text-[10px] text-muted-foreground mt-1">
                Last pull: {lastPullDate.toLocaleString('en-GB')}
                {lastPullAgo != null && lastPullAgo > 0 && ` (${lastPullAgo} day${lastPullAgo === 1 ? '' : 's'} ago)`}
                {status.lastPullStatus === 'error' && status.lastPullError && (
                  <span className="text-amber-400 ml-2 inline-flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {status.lastPullError.slice(0, 80)}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {!status?.connected ? (
              <button
                onClick={connect}
                disabled={connecting}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                Connect
              </button>
            ) : (
              <>
                <button
                  onClick={openPicker}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted"
                >
                  {status.resourceId ? 'Change property' : 'Pick property'}
                </button>
                {status.resourceId && (
                  <button
                    onClick={() => pull(false)}
                    disabled={pulling}
                    className="text-xs px-3 py-1.5 rounded-lg bg-primary/15 text-primary font-semibold hover:bg-primary/25 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {pulling ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Pull now
                  </button>
                )}
                <button
                  onClick={disconnect}
                  disabled={disconnecting}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-destructive disabled:opacity-50 flex items-center gap-1.5"
                  title="Disconnect Search Console"
                >
                  <Unplug className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Property picker (inline) ── */}
        {showPicker && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Select the Search Console property for this project
            </div>
            {loadingSites ? (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading properties from Google…
              </div>
            ) : sites.length === 0 ? (
              <div className="text-xs text-amber-400">
                No properties found — the Google account you connected has no Search Console access. Add this email to the Search Console property as a user, then click Connect again.
              </div>
            ) : (
              <div className="space-y-1">
                {sites.map((s) => (
                  <button
                    key={s.url}
                    onClick={() => selectProperty(s)}
                    disabled={!!selecting}
                    className={`w-full text-left p-2 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                      selecting === s.url
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border hover:border-primary/40 hover:bg-muted/40'
                    } disabled:opacity-50`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-mono text-foreground/90 truncate">{s.url}</div>
                      <div className="text-[10px] text-muted-foreground">Permission: {s.perm}</div>
                    </div>
                    {selecting === s.url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                      status?.resourceId === s.url ? <Check className="h-3.5 w-3.5 text-green-400" /> : null}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowPicker(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground mt-2"
            >Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
