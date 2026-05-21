/* ════════════════════════════════════════════════════════════════
   src/pages/ClientWorkspace.tsx
   Brand Studio H.1.5 + H.6a — Client portal.

   Routes:
   - /c/:token    — legacy bare-token (anonymous link share, read-only)
   - /c/workspace — session-token identity (magic-link invited user,
                    can comment / approve / share / upload / fill intake)

   Detects which mode based on URL params + localStorage session.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Lock, FileText, Palette as PaletteIcon, TrendingUp, Globe, ExternalLink, ArrowLeft, Sparkles, Upload, ClipboardList, LogOut, Users } from 'lucide-react';
import {
  clientResolve, clientListDocuments, clientGetDocument, clientGetInvestorData,
  clientSessionResolve, clientSessionListDocuments, clientSessionGetDocument,
  getStoredClientSession, clearClientSession,
} from '@/components/brand-studio/api';
import type {
  ClientPortalContext, TractionProofPoint, MarketIntelEntry,
  ClientSessionContext,
} from '@/components/brand-studio/api';
import type { BrandStudioDocument } from '@/components/brand-studio/types';
import NotificationInbox from '@/components/brand-studio/NotificationInbox';
import CommentsPanel    from '@/components/brand-studio/CommentsPanel';
import ApprovalsPanel   from '@/components/brand-studio/ApprovalsPanel';
import ShareGrantsPanel from '@/components/brand-studio/ShareGrantsPanel';
import ClientUploadPanel from '@/components/brand-studio/ClientUploadPanel';
import DocumentViewer   from '@/components/brand-studio/DocumentViewer';
import { ClientIntakeList } from '@/components/brand-studio/IntakeForms';

type Tab = 'library' | 'brand' | 'investor' | 'market' | 'intake' | 'upload';

export default function ClientWorkspace() {
  const { token } = useParams<{ token: string }>();
  const navigate  = useNavigate();

  /* Mode: 'bare_token' for /c/:token legacy, 'session' for /c/workspace */
  const [mode, setMode] = useState<'bare_token' | 'session' | null>(null);
  const [sessionToken, setSessionToken] = useState<string>('');

  const [context,   setContext]   = useState<ClientPortalContext | null>(null);
  const [sessionContext, setSessionContext] = useState<ClientSessionContext | null>(null);

  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [tab,       setTab]       = useState<Tab>('library');
  const [documents, setDocuments] = useState<BrandStudioDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [openDoc,   setOpenDoc]   = useState<(BrandStudioDocument & { raw_content?: string; access_level?: string; client_resharable?: boolean }) | null>(null);
  const [openDocLoading, setOpenDocLoading] = useState(false);

  /* H.3 — investor data */
  const [tractionRows, setTractionRows] = useState<TractionProofPoint[]>([]);
  const [marketRows,   setMarketRows]   = useState<MarketIntelEntry[]>([]);
  const [investorLoading, setInvestorLoading] = useState(false);
  const [investorLoaded,  setInvestorLoaded]  = useState(false);

  /* ── resolve identity on mount ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      /* Decide which mode */
      if (token) {
        /* /c/:token — legacy bare-token */
        setMode('bare_token');
        const r = await clientResolve(token);
        if (cancelled) return;
        if (r.error || !r.context) {
          setError(r.error || 'Invalid or expired access link');
          setLoading(false);
          return;
        }
        setContext(r.context);
        const visible = r.context.client_visible_features || {};
        const order: Tab[] = ['library', 'brand', 'investor', 'market'];
        const first = order.find((t) => visible[t]);
        if (first) setTab(first);
        setLoading(false);
        return;
      }

      /* /c/workspace — session mode */
      const stored = getStoredClientSession();
      if (!stored?.token) {
        setError('Please use the invite link your account manager sent you.');
        setLoading(false);
        return;
      }
      setMode('session');
      setSessionToken(stored.token);
      const r = await clientSessionResolve(stored.token);
      if (cancelled) return;
      if (r.error || !r.context) {
        clearClientSession();
        setError(r.error || 'Session expired — please use a fresh invite link');
        setLoading(false);
        return;
      }
      setSessionContext(r.context);
      const visible = r.context.visible_features || {};
      const order: Tab[] = ['library', 'brand', 'investor', 'market', 'intake', 'upload'];
      const first = order.find((t) => visible[t] || t === 'intake' || t === 'upload');
      if (first) setTab(first);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token]);

  /* ── load library when tab opens ── */
  useEffect(() => {
    if (!context && !sessionContext) return;
    if (tab !== 'library') return;
    if (documents.length > 0) return;
    let cancelled = false;
    setDocsLoading(true);
    (async () => {
      if (mode === 'bare_token' && token) {
        const r = await clientListDocuments(token);
        if (!cancelled) {
          setDocuments(r.documents);
          setDocsLoading(false);
        }
      } else if (mode === 'session' && sessionToken) {
        const r = await clientSessionListDocuments(sessionToken);
        if (!cancelled) {
          setDocuments(r.documents as any[]);
          setDocsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [tab, mode, token, sessionToken, context, sessionContext, documents.length]);

  /* ── load investor data when investor tab opens ── */
  useEffect(() => {
    if (!context && !sessionContext) return;
    if (tab !== 'investor') return;
    if (investorLoaded) return;
    if (mode !== 'bare_token' || !token) {
      /* Session-mode investor data not yet wired — show empty for now */
      setInvestorLoaded(true);
      return;
    }
    let cancelled = false;
    setInvestorLoading(true);
    (async () => {
      const r = await clientGetInvestorData(token);
      if (cancelled) return;
      setTractionRows(r.traction_proof_points);
      setMarketRows(r.market_intelligence);
      setInvestorLoading(false);
      setInvestorLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [tab, mode, token, context, sessionContext, investorLoaded]);

  /* ── open a document detail ── */
  const openDocument = async (doc: BrandStudioDocument) => {
    setOpenDocLoading(true);
    setOpenDoc({ ...doc });
    if (mode === 'bare_token' && token) {
      const r = await clientGetDocument({ token, documentId: doc.id });
      if (r.document) setOpenDoc({ ...r.document, ...((doc as any).access_level ? { access_level: (doc as any).access_level } : {}) });
    } else if (mode === 'session' && sessionToken) {
      const r = await clientSessionGetDocument({ sessionToken, documentId: doc.id });
      if (r.document) {
        setOpenDoc({
          ...r.document,
          access_level:       r.access_level || (doc as any).access_level || 'view',
          client_resharable:  (doc as any).client_resharable,
        });
      }
    }
    setOpenDocLoading(false);
  };

  const handleLogout = () => {
    clearClientSession();
    navigate('/');
  };

  /* ── derive brand styling from brand_assets ── */
  const brand = (mode === 'session' ? sessionContext?.brand : context?.brand_assets);
  const primaryColor = brand?.color_palette?.[0]?.hex || '#a78bfa';
  const projectName  = mode === 'session'
    ? sessionContext?.project.name || 'Workspace'
    : context?.project.name || 'Workspace';
  const tagline      = brand?.primary_tagline;
  const sessionUser  = mode === 'session' ? sessionContext?.user : null;

  /* ── early returns ── */

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground mb-3" />
          <div className="text-sm text-muted-foreground">Opening your workspace…</div>
        </div>
      </div>
    );
  }

  if (error || (!context && !sessionContext)) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card/60 p-8 text-center">
          <Lock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <div className="text-base font-bold">Access not available</div>
          <div className="text-sm text-muted-foreground mt-2">{error || 'This workspace is not accessible.'}</div>
          <div className="text-xs text-muted-foreground/70 mt-4">
            If you believe this is an error, contact your account manager for a fresh invite link.
          </div>
        </div>
      </div>
    );
  }

  const visible = mode === 'session'
    ? (sessionContext?.visible_features || { library: true, brand: true })
    : (context?.client_visible_features || {});
  const TABS: { id: Tab; label: string; icon: any; enabled: boolean }[] = [
    { id: 'library',  label: 'Documents',     icon: FileText,      enabled: !!visible.library  },
    { id: 'brand',    label: 'Brand',         icon: PaletteIcon,   enabled: !!visible.brand    },
    { id: 'investor', label: 'Investor View', icon: TrendingUp,    enabled: !!visible.investor },
    { id: 'market',   label: 'Market',        icon: Globe,         enabled: !!visible.market   },
    /* Session-only tabs — always shown in session mode */
    { id: 'intake',   label: 'Forms',         icon: ClipboardList, enabled: mode === 'session' },
    { id: 'upload',   label: 'Share files',   icon: Upload,        enabled: mode === 'session' },
  ];
  const visibleTabs = TABS.filter((t) => t.enabled);

  if (visibleTabs.length === 0) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card/60 p-8 text-center">
          <Lock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <div className="text-base font-bold">Workspace not yet configured</div>
          <div className="text-sm text-muted-foreground mt-2">
            Your account manager hasn't enabled any modules in this workspace yet. They should appear soon.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Branded header — uses the CLIENT's own brand colors ── */}
      <div
        className="border-b"
        style={{
          borderColor:  `${primaryColor}33`,
          background:   `linear-gradient(135deg, ${primaryColor}0a 0%, transparent 100%)`,
        }}
      >
        <div className="max-w-[1200px] mx-auto px-6 py-5 flex items-center gap-4 flex-wrap">
          {brand?.primary_logo_url ? (
            <img
              src={brand.primary_logo_url}
              alt={`${projectName} logo`}
              className="h-12 w-12 rounded-lg object-contain bg-background/80 border border-border shrink-0"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="h-12 w-12 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${primaryColor}15` }}>
              <Sparkles className="h-6 w-6" style={{ color: primaryColor }} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold">{projectName}</div>
            {tagline && (
              <div className="text-sm text-muted-foreground italic">"{tagline}"</div>
            )}
          </div>

          {/* Session mode: notifications + user badge + logout */}
          {mode === 'session' && sessionUser && (
            <div className="flex items-center gap-2 shrink-0">
              <NotificationInbox
                mode="client_session"
                sessionToken={sessionToken}
                brandColor={primaryColor}
              />
              <div className="text-right hidden sm:block">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Signed in as</div>
                <div className="text-sm font-semibold">{sessionUser.display_name || sessionUser.email}</div>
                {sessionUser.title && <div className="text-[10px] text-muted-foreground">{sessionUser.title}</div>}
              </div>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="p-2 rounded-xl border border-border bg-card/60 text-muted-foreground hover:text-foreground hover:bg-muted/40"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Bare-token mode: show client name */}
          {mode === 'bare_token' && context?.client?.name && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Workspace for</div>
              <div className="text-sm font-semibold">{context.client.name}</div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-5">

        {/* ── Tabs ── */}
        <div className="border-b border-border flex items-center gap-1 overflow-x-auto">
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px"
                style={{
                  borderColor: active ? primaryColor : 'transparent',
                  color:       active ? primaryColor : undefined,
                }}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Library tab ── */}
        {tab === 'library' && (
          <div className="space-y-3">
            {docsLoading && (
              <div className="text-center py-12">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground mb-2" />
                <div className="text-xs text-muted-foreground">Loading documents…</div>
              </div>
            )}
            {!docsLoading && documents.length === 0 && (
              <div className="rounded-2xl border border-border bg-card/40 p-10 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <div className="text-sm font-semibold">No documents shared yet</div>
                <div className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
                  Your account manager hasn't published any documents to this workspace yet. Check back soon.
                </div>
              </div>
            )}
            <div className="space-y-2">
              {documents.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => openDocument(doc)}
                  className="w-full text-left rounded-xl border border-border bg-card/60 px-4 py-3 hover:bg-card/80 transition-colors flex items-start gap-3"
                >
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}>
                    {doc.kind === 'generated' ? <Sparkles className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground truncate">{doc.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      {doc.doc_type && <span className="font-mono">{doc.doc_type}</span>}
                      {doc.published_at && <span>· Shared {new Date(doc.published_at).toLocaleDateString('en-GB')}</span>}
                      {doc.version && doc.version > 1 && <span>· v{doc.version}</span>}
                    </div>
                  </div>
                  {doc.source_url && (
                    <span className="text-[10px] text-muted-foreground/70 mt-1">
                      <ExternalLink className="h-2.5 w-2.5 inline" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Brand tab — read-only single source of truth ── */}
        {tab === 'brand' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
              <div className="text-sm font-bold">Visual Identity</div>
              {brand?.primary_logo_url && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5">Primary logo</div>
                  <img src={brand.primary_logo_url} alt="Logo"
                    className="h-16 max-w-xs object-contain bg-background/60 border border-border rounded-lg p-2" />
                </div>
              )}
              {(brand?.color_palette?.length ?? 0) > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5">Color palette</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {brand?.color_palette?.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-lg border-2 border-background shadow-sm" style={{ backgroundColor: c.hex }} />
                        <div className="text-xs">
                          {c.name && <div className="font-semibold">{c.name}</div>}
                          <div className="font-mono text-[10px] text-muted-foreground">{c.hex}</div>
                          {c.role && <div className="text-[10px] text-muted-foreground">{c.role}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(brand?.font_families?.length ?? 0) > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5">Typography</div>
                  <div className="space-y-1">
                    {brand?.font_families?.map((f, i) => (
                      <div key={i} className="text-xs flex items-center gap-2">
                        <span className="font-semibold">{f.name}</span>
                        {f.role && <span className="text-muted-foreground">— {f.role}</span>}
                        {f.source && <span className="text-muted-foreground/70 text-[10px]">({f.source})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!brand?.primary_logo_url && (brand?.color_palette?.length ?? 0) === 0 && (
                <div className="text-xs text-muted-foreground italic">Visual identity assets haven't been added yet.</div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-3">
              <div className="text-sm font-bold">Verbal Identity</div>
              {brand?.primary_tagline && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Primary tagline</div>
                  <div className="text-base italic mt-0.5">"{brand.primary_tagline}"</div>
                  {brand?.tagline_rationale && (
                    <div className="text-xs text-muted-foreground mt-1">{brand.tagline_rationale}</div>
                  )}
                </div>
              )}
              {brand?.brand_archetype && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Brand archetype</div>
                  <div className="text-sm mt-0.5">{brand.brand_archetype}</div>
                </div>
              )}
              {brand?.brand_application_notes && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Application notes</div>
                  <div className="text-xs mt-0.5 text-foreground/90 whitespace-pre-wrap">{brand.brand_application_notes}</div>
                </div>
              )}
              {!brand?.primary_tagline && !brand?.brand_archetype && !brand?.brand_application_notes && (
                <div className="text-xs text-muted-foreground italic">Verbal identity hasn't been added yet.</div>
              )}
            </div>
          </div>
        )}

        {/* ── Investor tab — H.3 ── */}
        {tab === 'investor' && (
          <div className="space-y-5">
            {investorLoading && (
              <div className="text-center py-12">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground mb-2" />
                <div className="text-xs text-muted-foreground">Loading investor data…</div>
              </div>
            )}

            {!investorLoading && tractionRows.length === 0 && marketRows.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
                <TrendingUp className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <div className="text-sm font-semibold">Investor data being prepared</div>
                <div className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
                  Your account manager hasn't published verified traction proof points or market intelligence yet. Once they do, this view becomes your one-stop reference for investor conversations.
                </div>
              </div>
            )}

            {/* Traction Proof Points */}
            {!investorLoading && tractionRows.length > 0 && (
              <div className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4" style={{ color: primaryColor }} />
                  <div className="text-sm font-bold">Traction Proof Points</div>
                  <span className="text-[10px] text-muted-foreground">— {tractionRows.length} verified</span>
                </div>
                <div className="space-y-2">
                  {tractionRows.map((t) => (
                    <div key={t.id} className="rounded-xl border border-border bg-background/40 p-3">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                        {t.category}
                      </div>
                      <div className="text-sm font-semibold mt-0.5">{t.claim}</div>
                      <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px]">
                        {t.metric_value && <span className="font-mono text-foreground/90">{t.metric_value}</span>}
                        {t.metric_period && <span className="text-muted-foreground">· {t.metric_period}</span>}
                        <span className="text-muted-foreground">· {new Date(t.evidence_date).toLocaleDateString('en-GB')}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[10px]">
                        <span className={`uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
                          t.evidence_type === 'verified_third_party' ? 'bg-green-500/15 text-green-400' :
                          t.evidence_type === 'verified_internal' ? 'bg-blue-500/15 text-blue-400' :
                          'bg-amber-500/15 text-amber-400'
                        }`}>{t.evidence_type.replace(/_/g, ' ')}</span>
                        {t.source_name && <span className="text-muted-foreground">{t.source_name}</span>}
                        {t.source_url && (
                          <a href={t.source_url} target="_blank" rel="noopener noreferrer"
                            className="hover:underline inline-flex items-center gap-0.5" style={{ color: primaryColor }}>
                            <ExternalLink className="h-2.5 w-2.5" /> Source
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Market Intelligence */}
            {!investorLoading && marketRows.length > 0 && (
              <div className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="h-4 w-4" style={{ color: primaryColor }} />
                  <div className="text-sm font-bold">Market Intelligence</div>
                  <span className="text-[10px] text-muted-foreground">— {marketRows.length} verified</span>
                </div>
                <div className="space-y-2">
                  {marketRows.map((m) => (
                    <div key={m.id} className="rounded-xl border border-border bg-background/40 p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: primaryColor }}>
                          {m.category}
                        </span>
                        {m.competitor_name && (
                          <span className="text-[10px] text-muted-foreground">re: {m.competitor_name}</span>
                        )}
                      </div>
                      <div className="text-sm font-semibold mt-0.5">{m.claim}</div>
                      {m.metric_value && <div className="text-xs font-mono mt-0.5">{m.metric_value}</div>}
                      {m.methodology && (
                        <div className="text-[11px] text-muted-foreground italic mt-1">
                          Methodology: {m.methodology}
                        </div>
                      )}
                      {m.source_excerpt && (
                        <div className="text-[11px] text-foreground/80 mt-1.5 border-l-2 pl-2 italic"
                          style={{ borderColor: `${primaryColor}55` }}>
                          "{m.source_excerpt}"
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[10px]">
                        {m.source_name && <span className="text-muted-foreground">{m.source_name}</span>}
                        {m.source_date && <span className="text-muted-foreground">· {new Date(m.source_date).toLocaleDateString('en-GB')}</span>}
                        {m.source_url && (
                          <a href={m.source_url} target="_blank" rel="noopener noreferrer"
                            className="hover:underline inline-flex items-center gap-0.5" style={{ color: primaryColor }}>
                            <ExternalLink className="h-2.5 w-2.5" /> Source
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Market placeholder — H.4 ── */}
        {tab === 'market' && (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
            <Globe className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <div className="text-sm font-semibold">Market & Competitive — coming soon</div>
            <div className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Share-of-voice tracking, competitor monitoring, and market intelligence reports will appear here.
            </div>
          </div>
        )}

        {/* ── H.6a: Forms (intake) ── session-only */}
        {tab === 'intake' && mode === 'session' && sessionToken && (
          <ClientIntakeList sessionToken={sessionToken} brandColor={primaryColor} />
        )}

        {/* ── H.6a: Share files (upload) ── session-only */}
        {tab === 'upload' && mode === 'session' && sessionToken && (
          <ClientUploadPanel sessionToken={sessionToken} brandColor={primaryColor} />
        )}
      </div>

      {/* ── Document detail modal ── */}
      {openDoc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{openDoc.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {openDoc.doc_type && <span className="font-mono">{openDoc.doc_type}</span>}
                  {openDoc.published_at && <span> · Shared {new Date(openDoc.published_at).toLocaleDateString('en-GB')}</span>}
                </div>
              </div>
              <button onClick={() => setOpenDoc(null)} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 print:overflow-visible print:p-0">
              {openDocLoading && !openDoc.raw_content && (
                <div className="text-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  <div className="text-xs text-muted-foreground mt-2">Loading document…</div>
                </div>
              )}

              {!openDocLoading && (
                <DocumentViewer
                  content={openDoc.raw_content || ''}
                  documentName={openDoc.name}
                  meta={{
                    docType:      openDoc.doc_type,
                    audienceRole: openDoc.audience_role,
                    confidence:   openDoc.confidence,
                    version:      openDoc.version,
                    publishedAt:  openDoc.published_at,
                    providedBy:   (openDoc as any).provided_by,
                    sourceUrl:    openDoc.source_url,
                  }}
                  brandColor={primaryColor}
                  summary={(openDoc as any).extracted_data?.doc_summary}
                  keyFindings={(openDoc as any).extracted_data?.key_findings}
                />
              )}

              {/* ── H.6a: Collaboration panels — session mode only ── */}
              {mode === 'session' && sessionUser && sessionContext && (
                <div className="space-y-3 pt-3 mt-3 border-t border-border print:hidden">
                  <ApprovalsPanel
                    mode="client_session"
                    documentId={openDoc.id}
                    sessionToken={sessionToken}
                  />
                  <CommentsPanel
                    mode="client_session"
                    documentId={openDoc.id}
                    projectId={sessionContext.project.id}
                    sessionToken={sessionToken}
                    authorId={sessionUser.id}
                    authorLabel={`${sessionUser.display_name}${sessionUser.title ? ` (${sessionUser.title})` : ''}`}
                  />
                  <ShareGrantsPanel
                    mode="client_session"
                    documentId={openDoc.id}
                    documentResharable={openDoc.client_resharable !== false}
                    sessionToken={sessionToken}
                    myAccessLevel={(openDoc.access_level as any) || 'view'}
                    myUserId={sessionUser.id}
                    myUserLabel={`${sessionUser.display_name}${sessionUser.title ? ` (${sessionUser.title})` : ''}`}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
