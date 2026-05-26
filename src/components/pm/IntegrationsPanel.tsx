/* ════════════════════════════════════════════════════════════════
   IntegrationsPanel.tsx
   Per-project integrations surface. Generic provider row pattern
   so adding new providers later (Bing, Ahrefs, ...) is one entry.

   Each provider row shows:
     - connection state (not connected | connected, no property | live | stale)
     - actions: connect / pick property / pull now / disconnect
     - last pull info (when, status, error if any)
     - 3-day stale threshold flips the badge from green to amber

   Currently active:
     • Google Search Console (Phase D) — clicks, impressions, position
     • Google Analytics 4 (Phase E)     — organic sessions, conversions, bounce
═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plug, Check, AlertCircle, ExternalLink, Loader2, RefreshCw, Unplug, Key, Eye, EyeOff,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as pmApi from './api';

/* ── shared provider status shape ─────────────────────────── */
interface ProviderStatus {
  connected:     boolean;
  resourceId?:   string;
  resourceLabel?: string;
  lastPullAt?:   string;
  lastPullStatus?: string;
  lastPullError?: string;
  connectedAt?:  string;
}

/* ── provider config — wires up the right API per provider ── */
type ProviderKey = 'gsc' | 'ga4';

interface ProviderConfig {
  key:                ProviderKey;
  name:               string;
  description:        string;
  pullDescriptor:     (totals: any) => string;
  messageType:        string;
  fetchStatus:        (projectId: string) => Promise<{ status?: ProviderStatus; error?: string }>;
  startOauth:         (projectId: string) => Promise<{ url?: string; error?: string }>;
  listProperties:     (projectId: string) => Promise<{ properties: { id: string; label: string; detail?: string }[]; error?: string }>;
  selectProperty:     (projectId: string, id: string, label?: string) => Promise<{ success: boolean; error?: string }>;
  pull:               (projectId: string) => Promise<{ totals?: any; error?: string }>;
  disconnect:         (projectId: string) => Promise<{ success: boolean; error?: string }>;
}

/* GSC adapter */
const GSC_PROVIDER: ProviderConfig = {
  key:         'gsc',
  name:        'Google Search Console',
  description: 'Clicks, impressions, and average position — direct from Search Console. Feeds the trend charts and report attribution automatically.',
  pullDescriptor: (t) => `Last 7 days: ${t.clicks} clicks · ${t.impressions} impressions · pos ${t.position.toFixed(1)}`,
  messageType: 'gsc_connected',
  fetchStatus: pmApi.gscStatus,
  startOauth:  pmApi.gscOauthStart,
  listProperties: async (projectId) => {
    const { sites, error } = await pmApi.gscListProperties(projectId);
    return {
      properties: sites.map((s) => ({ id: s.url, label: s.url, detail: `Permission: ${s.perm}` })),
      error,
    };
  },
  selectProperty: async (projectId, siteUrl, label) =>
    pmApi.gscSelectProperty({ projectId, siteUrl, label }),
  pull:        (projectId) => pmApi.gscPull({ projectId }),
  disconnect:  pmApi.gscDisconnect,
};

/* GA4 adapter */
const GA4_PROVIDER: ProviderConfig = {
  key:         'ga4',
  name:        'Google Analytics 4',
  description: 'Organic sessions, conversions, and bounce rate — filtered to organic traffic only. Feeds the analytics fields in the Data Room and the report\'s engagement narrative.',
  pullDescriptor: (t) =>
    `Last 7 days: ${t.sessions} organic sessions · ${t.conversions} conversions · ${(t.bounceRate * 100).toFixed(1)}% bounce`,
  messageType: 'ga4_connected',
  fetchStatus: pmApi.ga4Status,
  startOauth:  pmApi.ga4OauthStart,
  listProperties: async (projectId) => {
    const { properties, error } = await pmApi.ga4ListProperties(projectId);
    return {
      properties: properties.map((p) => ({ id: p.id, label: p.name, detail: `Account: ${p.account} · ${p.id}` })),
      error,
    };
  },
  selectProperty: async (projectId, propertyId, label) =>
    pmApi.ga4SelectProperty({ projectId, propertyId, label }),
  pull:        (projectId) => pmApi.ga4Pull({ projectId }),
  disconnect:  pmApi.ga4Disconnect,
};

const PROVIDERS: ProviderConfig[] = [GSC_PROVIDER, GA4_PROVIDER];

export default function IntegrationsPanel({ projectId }: { projectId: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Plug className="h-3.5 w-3.5" /> Integrations
        </div>
      </div>
      <div className="space-y-3">
        {PROVIDERS.map((p) => (
          <ProviderRow key={p.key} projectId={projectId} provider={p} />
        ))}
        <PsiRow projectId={projectId} />
      </div>
    </div>
  );
}

function ProviderRow({ projectId, provider }: { projectId: string; provider: ProviderConfig }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [properties, setProperties] = useState<{ id: string; label: string; detail?: string }[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [selecting, setSelecting] = useState('');
  const loadRef = useRef<() => Promise<void>>();

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { status, error } = await provider.fetchStatus(projectId);
    setLoading(false);
    if (error) {
      toast({ title: `Could not load ${provider.name} status`, description: error, variant: 'destructive' });
      return;
    }
    setStatus(status ?? null);
  }, [projectId, provider, toast]);
  loadRef.current = load;

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e?.data?.type === provider.messageType) { loadRef.current?.(); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [provider.messageType]);

  const connect = async () => {
    setConnecting(true);
    const { url, error } = await provider.startOauth(projectId);
    setConnecting(false);
    if (error || !url) { toast({ title: 'Could not start OAuth', description: error, variant: 'destructive' }); return; }
    const w = 520, h = 700;
    const left = (window.screen.width  - w) / 2;
    const top  = (window.screen.height - h) / 2;
    window.open(url, `${provider.key}_oauth`, `width=${w},height=${h},left=${left},top=${top}`);
  };

  const openPicker = async () => {
    setShowPicker(true);
    setLoadingProperties(true);
    const { properties, error } = await provider.listProperties(projectId);
    setLoadingProperties(false);
    if (error) { toast({ title: 'Could not load properties', description: error, variant: 'destructive' }); return; }
    setProperties(properties);
  };

  const selectProperty = async (p: { id: string; label: string }) => {
    setSelecting(p.id);
    const { success, error } = await provider.selectProperty(projectId, p.id, p.label);
    setSelecting('');
    if (!success) { toast({ title: 'Could not select property', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Property selected', description: p.label });
    setShowPicker(false);
    await pull(true);
    await load();
  };

  const pull = async (silent = false) => {
    setPulling(true);
    const { totals, error } = await provider.pull(projectId);
    setPulling(false);
    if (error) {
      if (!silent) toast({ title: 'Pull failed', description: error, variant: 'destructive' });
      await load();
      return;
    }
    if (totals && !silent) {
      toast({ title: `${provider.name} data pulled`, description: provider.pullDescriptor(totals) });
    }
    await load();
  };

  const disconnect = async () => {
    if (!confirm(`Disconnect ${provider.name} for this project? You can reconnect any time.`)) return;
    setDisconnecting(true);
    const { success, error } = await provider.disconnect(projectId);
    setDisconnecting(false);
    if (!success) { toast({ title: 'Disconnect failed', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Disconnected' });
    await load();
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-background/40 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading {provider.name}…
        </div>
      </div>
    );
  }

  const lastPullDate = status?.lastPullAt ? new Date(status.lastPullAt) : null;
  const lastPullAgo = lastPullDate ? Math.floor((Date.now() - lastPullDate.getTime()) / 86_400_000) : null;
  const isStale = status?.connected && status.resourceId && (lastPullAgo == null || lastPullAgo > 3);

  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold">{provider.name}</span>
            {status?.connected && status.resourceId && (
              <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-semibold ${
                isStale ? 'bg-amber-500/15 text-amber-400' : 'bg-green-500/15 text-green-400'
              }`}>
                {isStale ? <><AlertCircle className="h-3 w-3" /> Stale</> : <><Check className="h-3 w-3" /> Live</>}
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
                  : `Connected but no property selected — click "Pick property" to choose.`)
              : provider.description}
          </div>
          {status?.connected && lastPullDate && (
            <div className={`text-[10px] mt-1 ${isStale ? 'text-amber-400' : 'text-muted-foreground'}`}>
              {isStale && <AlertCircle className="h-3 w-3 inline mr-1" />}
              Last pull: {lastPullDate.toLocaleString('en-GB')}
              {lastPullAgo != null && lastPullAgo > 0 && ` (${lastPullAgo} day${lastPullAgo === 1 ? '' : 's'} ago)`}
              {isStale && <span className="ml-1 font-semibold">— refresh recommended</span>}
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
                title={`Disconnect ${provider.name}`}
              >
                <Unplug className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {showPicker && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Select the {provider.name} property for this project
          </div>
          {loadingProperties ? (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading properties from Google…
            </div>
          ) : properties.length === 0 ? (
            <div className="text-xs text-amber-400">
              No properties found — the Google account you connected has no {provider.name} access. Add this email as a user on the {provider.name} property, then click Connect again.
            </div>
          ) : (
            <div className="space-y-1">
              {properties.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectProperty(p)}
                  disabled={!!selecting}
                  className={`w-full text-left p-2 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                    selecting === p.id
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border hover:border-primary/40 hover:bg-muted/40'
                  } disabled:opacity-50`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-mono text-foreground/90 truncate">{p.label}</div>
                    {p.detail && <div className="text-[10px] text-muted-foreground">{p.detail}</div>}
                  </div>
                  {selecting === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                    status?.resourceId === p.id ? <Check className="h-3.5 w-3.5 text-green-400" /> : null}
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
  );
}

/* ── PSI API key row ─────────────────────────────────────────── */
function PsiRow({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<pmApi.PsiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { status: s } = await pmApi.psiStatus(projectId);
    setStatus(s ?? null);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    const r = await pmApi.psiSaveKey(projectId, keyInput.trim());
    setSaving(false);
    if (!r.success) {
      toast({ title: 'Failed to save', description: r.error, variant: 'destructive' });
      return;
    }
    if (!r.valid) {
      toast({ title: 'Key saved but validation failed', description: r.error || 'Check the key and try again.', variant: 'destructive' });
    } else {
      toast({ title: '✅ PSI key saved and validated', description: 'Core Web Vitals will now run on every audit.' });
    }
    setKeyInput('');
    setShowInput(false);
    load();
  };

  const remove = async () => {
    if (!confirm('Remove PSI API key? Core Web Vitals will not run on future audits.')) return;
    setRemoving(true);
    await pmApi.psiRemove(projectId);
    setRemoving(false);
    toast({ title: 'PSI key removed' });
    load();
  };

  const connected = status?.connected;

  return (
    <div className="rounded-xl border border-border bg-background/40 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${connected ? 'bg-green-500/15 text-green-400' : 'bg-muted/50 text-muted-foreground'}`}>
            <Key className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">PageSpeed Insights</span>
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : connected ? (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                  Connected {status?.keyHint ? `· key ${status.keyHint}` : ''}
                </span>
              ) : (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Not configured
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Core Web Vitals (LCP, CLS, INP) for every technical audit.{' '}
              <a href="https://developers.google.com/speed/docs/insights/v5/get-started" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                Get free key <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </p>
            {status?.lastTestedStatus === 'error' && status.lastTestedError && (
              <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                {status.lastTestedError}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {connected && (
            <button
              onClick={remove}
              disabled={removing}
              className="h-7 px-2 rounded-lg border border-border bg-background/60 text-xs text-muted-foreground hover:text-red-400 hover:border-red-400/30 transition-colors flex items-center gap-1"
            >
              {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />}
              Remove
            </button>
          )}
          <button
            onClick={() => setShowInput(v => !v)}
            className={`h-7 px-2 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
              showInput
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border bg-background/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            <Key className="h-3 w-3" />
            {connected ? 'Update key' : 'Add key'}
          </button>
        </div>
      </div>

      {showInput && (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              placeholder="Paste your PSI API key here"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              className="w-full h-9 rounded-lg border border-border bg-background text-sm px-3 pr-9 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/60"
              autoFocus
            />
            <button
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || !keyInput.trim()}
              className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <><Loader2 className="h-3 w-3 animate-spin" />Validating…</> : <><Check className="h-3 w-3" />Save & validate</>}
            </button>
            <button
              onClick={() => { setShowInput(false); setKeyInput(''); }}
              className="h-8 px-3 rounded-lg border border-border bg-background/60 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Key is stored per-project and validated immediately against PSI API.
            To use one key for all projects, set <code className="font-mono text-primary">PAGESPEED_API_KEY</code> in Vercel environment variables instead.
          </p>
        </div>
      )}
    </div>
  );
}
