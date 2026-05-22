/* ════════════════════════════════════════════════════════════════
   SeoCampaignsPanel.tsx — Phase 14
   Lists all SEO campaigns for the current project + drill-in to each.

   Sections:
     • Campaigns list (active / paused / all)
     • Opportunities inbox (badge count, one-click promote)
     • Campaign detail drawer when one is selected
═══════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Target, Lightbulb, Play, Pause, Archive, RefreshCw, ChevronRight,
  CheckCircle2, AlertCircle, Loader2, X, Sparkles, FileText, TrendingUp,
  Layers, Link2, ExternalLink, Activity, Clock, Copy, Check, Download,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  seoCampaignList, seoCampaignGet, seoCampaignPause, seoCampaignResume,
  seoCampaignArchive, seoCampaignOverviewRefresh,
  seoOpportunityList, seoOpportunityPromoteToCampaign, seoOpportunityDismiss,
  type SeoCampaign, type SeoCampaignPanel, type SeoCampaignReport, type SeoOpportunity,
} from './api';

interface Props {
  projectId: string;
}

const PILLAR_ICON: Record<string, any> = {
  content:          FileText,
  research:         Sparkles,
  technical_audit:  AlertCircle,
  cluster_map:      Layers,
  internal_linking: Link2,
  off_page:         ExternalLink,
  monitoring:       Activity,
};

const PILLAR_LABEL: Record<string, string> = {
  content:          'Content',
  research:         'Research',
  technical_audit:  'Technical Audit',
  cluster_map:      'Cluster Map',
  internal_linking: 'Internal Linking',
  off_page:         'Off-Page Strategy',
  monitoring:       'Monitoring',
};

const STATUS_HUE: Record<string, string> = {
  green:     '152 70% 50%',
  amber:     '38 92% 55%',
  red:       '0 75% 55%',
  active:    '186 80% 55%',
  scheduled: '210 30% 50%',
  paused:    '38 60% 55%',
  done:      '152 70% 50%',
};

export default function SeoCampaignsPanel({ projectId }: Props) {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<SeoCampaign[]>([]);
  const [opportunities, setOpportunities] = useState<SeoOpportunity[]>([]);
  const [oppCounts, setOppCounts] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'paused' | 'all'>('active');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [promoteConfirm, setPromoteConfirm] = useState<SeoOpportunity | null>(null);
  const [tab, setTab] = useState<'campaigns' | 'opportunities'>('campaigns');

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [c, o] = await Promise.all([
        seoCampaignList({ projectId, statusFilter: statusFilter === 'all' ? undefined : statusFilter }),
        seoOpportunityList({ projectId, status: 'open', limit: 50 }),
      ]);
      if (c.error)   { setError(c.error); }
      else           { setCampaigns(c.campaigns || []); }
      setOpportunities(o.opportunities || []);
      setOppCounts(o.counts || {});
    } catch (e: any) {
      setError(e?.message || 'load failed');
    }
    setLoading(false);
  }, [projectId, statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const handlePause = async (id: string) => {
    const r = await seoCampaignPause({ campaignId: id, reason: 'Paused from PM' });
    if (r.error) { toast({ title: 'Pause failed', description: r.error, variant: 'destructive' }); return; }
    toast({ title: 'Campaign paused' });
    refresh();
  };

  const handleResume = async (id: string) => {
    const r = await seoCampaignResume({ campaignId: id });
    if (r.error) { toast({ title: 'Resume failed', description: r.error, variant: 'destructive' }); return; }
    toast({ title: `Resumed${r.resumed_after_days ? ` after ${r.resumed_after_days} days` : ''}` });
    refresh();
  };

  const handleArchive = async (id: string) => {
    if (!confirm('Archive this campaign? It will be hidden from active lists but data is preserved.')) return;
    const r = await seoCampaignArchive({ campaignId: id });
    if (r.error) { toast({ title: 'Archive failed', description: r.error, variant: 'destructive' }); return; }
    toast({ title: 'Campaign archived' });
    if (selectedCampaignId === id) setSelectedCampaignId(null);
    refresh();
  };

  const handlePromoteOpportunity = async (opp: SeoOpportunity) => {
    setPromoteConfirm(null);
    const r = await seoOpportunityPromoteToCampaign({ opportunityId: opp.id });
    if (r.error) { toast({ title: 'Promote failed', description: r.error, variant: 'destructive' }); return; }
    toast({ title: 'Promoted to campaign', description: `Campaign created. Open from the campaigns list to run the pipeline.` });
    refresh();
  };

  const handleDismissOpportunity = async (opp: SeoOpportunity) => {
    const r = await seoOpportunityDismiss({ opportunityId: opp.id, reason: 'Dismissed from PM' });
    if (r.error) { toast({ title: 'Dismiss failed', description: r.error, variant: 'destructive' }); return; }
    refresh();
  };

  const openOppCount = oppCounts?.open || 0;

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Target size={18} />
            SEO Campaigns
          </h2>
          <p style={{ fontSize: 12, color: 'rgba(120,120,140,0.85)', margin: '4px 0 0' }}>
            Multi-pillar ranking programs. Each campaign tracks 6 pillars: Content, Technical Audit, Cluster Map, Internal Linking, Off-Page, Monitoring.
          </p>
        </div>
        <button onClick={refresh} disabled={loading}
          style={{
            padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(160,160,180,0.2)',
            background: 'transparent', cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 5, opacity: loading ? 0.5 : 1,
          }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid rgba(160,160,180,0.15)' }}>
        <TabButton active={tab === 'campaigns'} onClick={() => setTab('campaigns')}>
          Campaigns ({campaigns.length})
        </TabButton>
        <TabButton active={tab === 'opportunities'} onClick={() => setTab('opportunities')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Lightbulb size={12} />
            Opportunities
            {openOppCount > 0 && (
              <span style={{
                padding: '1px 6px', borderRadius: 8, fontSize: 10,
                background: 'rgba(251, 146, 60, 0.2)', color: '#fb923c', fontWeight: 700,
              }}>{openOppCount}</span>
            )}
          </span>
        </TabButton>
      </div>

      {error && (
        <div style={{
          padding: 10, borderRadius: 8, marginBottom: 12,
          background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#fca5a5', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertCircle size={13} />
          {error}
        </div>
      )}

      {tab === 'campaigns' && (
        <CampaignsList
          campaigns={campaigns}
          loading={loading}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          onSelect={setSelectedCampaignId}
          onPause={handlePause}
          onResume={handleResume}
          onArchive={handleArchive}
        />
      )}

      {tab === 'opportunities' && (
        <OpportunitiesList
          opportunities={opportunities}
          onPromote={(opp) => setPromoteConfirm(opp)}
          onDismiss={handleDismissOpportunity}
        />
      )}

      {/* Campaign detail drawer */}
      {selectedCampaignId && (
        <CampaignDetailDrawer
          campaignId={selectedCampaignId}
          onClose={() => setSelectedCampaignId(null)}
          onPause={handlePause}
          onResume={handleResume}
        />
      )}

      {/* Promote confirmation modal */}
      {promoteConfirm && (
        <PromoteConfirmModal
          opp={promoteConfirm}
          onConfirm={() => handlePromoteOpportunity(promoteConfirm)}
          onCancel={() => setPromoteConfirm(null)}
        />
      )}
    </div>
  );
}

/* ─── Tab button ─────────────────────────────────────────── */
function TabButton({ children, active, onClick }: { children: any; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
      borderBottom: `2px solid ${active ? 'hsl(186 80% 55%)' : 'transparent'}`,
      color: active ? 'hsl(186 80% 55%)' : 'rgba(150,150,170,0.7)',
      fontSize: 12, fontWeight: 700, marginBottom: -1,
    }}>
      {children}
    </button>
  );
}

/* ─── Campaigns list ─────────────────────────────────────── */
function CampaignsList({ campaigns, loading, statusFilter, setStatusFilter, onSelect, onPause, onResume, onArchive }: {
  campaigns: SeoCampaign[];
  loading: boolean;
  statusFilter: 'active' | 'paused' | 'all';
  setStatusFilter: (v: 'active' | 'paused' | 'all') => void;
  onSelect: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['active', 'paused', 'all'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            border: '1px solid', textTransform: 'capitalize',
            borderColor: statusFilter === s ? 'hsl(186 80% 55%)' : 'rgba(160,160,180,0.2)',
            background: statusFilter === s ? 'hsla(186 80% 55% / 0.1)' : 'transparent',
            color: statusFilter === s ? 'hsl(186 80% 55%)' : 'rgba(150,150,170,0.85)',
          }}>{s}</button>
        ))}
      </div>

      {loading && campaigns.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'rgba(120,120,140,0.7)' }}>
          <Loader2 className="animate-spin" style={{ display: 'inline-block', marginRight: 6 }} size={14} />
          Loading…
        </div>
      ) : campaigns.length === 0 ? (
        <div style={{
          padding: 30, textAlign: 'center', color: 'rgba(120,120,140,0.7)',
          border: '1px dashed rgba(160,160,180,0.2)', borderRadius: 10, fontSize: 13,
        }}>
          No {statusFilter !== 'all' && statusFilter} campaigns yet. Try typing <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>rank me for "your keyword"</code> in S.E.A.S.O.N. to create one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {campaigns.map(c => (
            <CampaignRow
              key={c.id} campaign={c}
              onSelect={() => onSelect(c.id)}
              onPause={() => onPause(c.id)}
              onResume={() => onResume(c.id)}
              onArchive={() => onArchive(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignRow({ campaign, onSelect, onPause, onResume, onArchive }: {
  campaign: SeoCampaign;
  onSelect: () => void;
  onPause: () => void;
  onResume: () => void;
  onArchive: () => void;
}) {
  const isPaused = campaign.status === 'paused';
  const isActive = campaign.status === 'active';
  const statusHue = STATUS_HUE[campaign.health || campaign.status] || STATUS_HUE.active;

  return (
    <div style={{
      borderRadius: 10, padding: 14,
      border: `1px solid hsla(${statusHue} / 0.25)`,
      background: `linear-gradient(180deg, hsla(${statusHue} / 0.05) 0%, rgba(15,16,24,0.4) 100%)`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onSelect}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>"{campaign.keyword}"</div>
            <StatusBadge value={campaign.status} hue={statusHue} />
            {campaign.health && <StatusBadge value={campaign.health} hue={STATUS_HUE[campaign.health]} />}
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(150,150,170,0.85)', marginBottom: 6 }}>
            {campaign.goal || `Rank for "${campaign.keyword}"`}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(120,120,140,0.7)', display: 'flex', gap: 12 }}>
            <span>Started {new Date(campaign.started_at).toLocaleDateString()}</span>
            {campaign.current_position && (
              <span>Currently at position {Number(campaign.current_position).toFixed(1)}{campaign.target_position && ` → target ${Number(campaign.target_position).toFixed(1)}`}</span>
            )}
            {campaign.last_assessed_at && (
              <span>Last checked {new Date(campaign.last_assessed_at).toLocaleDateString()}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {isActive && (
            <ActionBtn onClick={onPause} title="Pause"><Pause size={12} /></ActionBtn>
          )}
          {isPaused && (
            <ActionBtn onClick={onResume} title="Resume"><Play size={12} /></ActionBtn>
          )}
          <ActionBtn onClick={onArchive} title="Archive"><Archive size={12} /></ActionBtn>
          <ActionBtn onClick={onSelect} title="Open">
            <ChevronRight size={12} />
          </ActionBtn>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ value, hue }: { value: string; hue: string }) {
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.06em',
      background: `hsla(${hue} / 0.15)`, color: `hsl(${hue})`,
      border: `1px solid hsla(${hue} / 0.3)`,
    }}>{value}</span>
  );
}

function ActionBtn({ children, onClick, title }: { children: any; onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(160,160,180,0.2)',
      background: 'transparent', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(150,150,170,0.85)',
    }}>{children}</button>
  );
}

/* ─── Opportunities list ─────────────────────────────────── */
function OpportunitiesList({ opportunities, onPromote, onDismiss }: {
  opportunities: SeoOpportunity[];
  onPromote: (opp: SeoOpportunity) => void;
  onDismiss: (opp: SeoOpportunity) => void;
}) {
  if (opportunities.length === 0) {
    return (
      <div style={{
        padding: 30, textAlign: 'center', color: 'rgba(120,120,140,0.7)',
        border: '1px dashed rgba(160,160,180,0.2)', borderRadius: 10, fontSize: 13,
      }}>
        <Lightbulb size={20} style={{ marginBottom: 6, opacity: 0.5 }} />
        <div>No open opportunities. They appear when S.E.A.S.O.N. spots related keywords, quick wins, or competitive shifts mid-pipeline.</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {opportunities.map(o => (
        <OpportunityRow key={o.id} opp={o} onPromote={() => onPromote(o)} onDismiss={() => onDismiss(o)} />
      ))}
    </div>
  );
}

function OpportunityRow({ opp, onPromote, onDismiss }: {
  opp: SeoOpportunity; onPromote: () => void; onDismiss: () => void;
}) {
  const valueHue = opp.estimated_value === 'high' ? '152 70% 50%' : opp.estimated_value === 'medium' ? '38 92% 55%' : '210 30% 50%';
  return (
    <div style={{
      borderRadius: 10, padding: 12,
      border: '1px solid rgba(251, 146, 60, 0.25)',
      background: 'rgba(251, 146, 60, 0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Lightbulb size={14} style={{ color: '#fb923c', marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: '#fb923c', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {opp.kind.replace(/_/g, ' ')}
            </span>
            {opp.estimated_value && (
              <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: `hsla(${valueHue} / 0.15)`, color: `hsl(${valueHue})` }}>
                {opp.estimated_value} value
              </span>
            )}
            {opp.estimated_effort && (
              <span style={{ fontSize: 9, color: 'rgba(150,150,170,0.7)' }}>
                · {opp.estimated_effort} effort
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{opp.title}</div>
          {opp.description && (
            <div style={{ fontSize: 11.5, color: 'rgba(150,150,170,0.85)', lineHeight: 1.5, marginBottom: 8 }}>
              {opp.description}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            {(opp.suggested_action === 'new_campaign' || opp.suggested_keyword) && (
              <button onClick={onPromote} style={{
                padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(186,200,255,0.3)',
                background: 'rgba(186,200,255,0.1)', color: '#a5f3fc',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Sparkles size={11} />
                Promote to campaign
              </button>
            )}
            <button onClick={onDismiss} style={{
              padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(160,160,180,0.2)',
              background: 'transparent', color: 'rgba(150,150,170,0.8)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Promote confirmation ───────────────────────────────── */
function PromoteConfirmModal({ opp, onConfirm, onCancel }: {
  opp: SeoOpportunity; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 480, width: '100%',
        background: 'linear-gradient(180deg, #1a1b27 0%, #0f1018 100%)',
        border: '1px solid rgba(160,160,180,0.2)', borderRadius: 14,
        padding: 20,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 8 }}>
          Promote opportunity to campaign?
        </h3>
        <div style={{ fontSize: 12, color: 'rgba(150,150,170,0.85)', marginBottom: 16, lineHeight: 1.5 }}>
          <strong style={{ color: 'rgba(220,220,235,1)' }}>"{opp.title}"</strong>
          <br /><br />
          This will create a new campaign for <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>{opp.suggested_keyword || '(keyword from title)'}</code>.
          The pipeline does <strong>not</strong> run automatically — you'll need to trigger <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>rank me for "{opp.suggested_keyword || ''}"</code> in S.E.A.S.O.N. when ready.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 14px', borderRadius: 7, border: '1px solid rgba(160,160,180,0.2)',
            background: 'transparent', color: 'rgba(150,150,170,0.85)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: '8px 14px', borderRadius: 7, border: '1px solid rgba(186,200,255,0.3)',
            background: 'rgba(186,200,255,0.15)', color: '#a5f3fc',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>Create campaign</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Campaign detail drawer ─────────────────────────────── */
function CampaignDetailDrawer({ campaignId, onClose, onPause, onResume }: {
  campaignId: string;
  onClose: () => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<SeoCampaignReport | null>(null);
  const [refreshingOverview, setRefreshingOverview] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await seoCampaignGet({ campaignId });
      if (r.error) setError(r.error);
      else setData(r);
    } catch (e: any) {
      setError(e?.message || 'load failed');
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { load(); }, [load]);

  const handleRefreshOverview = async () => {
    setRefreshingOverview(true);
    const r = await seoCampaignOverviewRefresh({ campaignId });
    if (r.error) toast({ title: 'Overview refresh failed', description: r.error, variant: 'destructive' });
    else toast({ title: 'Overview regenerated' });
    await load();
    setRefreshingOverview(false);
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9100,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(720px, 100vw)', height: '100vh', overflowY: 'auto',
        background: 'linear-gradient(180deg, #1a1b27 0%, #0f1018 100%)',
        borderLeft: '1px solid rgba(160,160,180,0.2)',
        padding: 24,
      }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'rgba(120,120,140,0.7)' }}>
            <Loader2 className="animate-spin" style={{ display: 'inline-block', marginRight: 6 }} size={14} />
            Loading…
          </div>
        ) : error ? (
          <div style={{ color: '#fca5a5' }}>Error: {error}</div>
        ) : data?.campaign ? (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(150,150,170,0.6)', fontWeight: 700 }}>
                  Campaign
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0' }}>"{data.campaign.keyword}"</h2>
                <div style={{ fontSize: 12, color: 'rgba(150,150,170,0.85)' }}>{data.campaign.goal}</div>
              </div>
              <button onClick={onClose} style={{
                width: 30, height: 30, borderRadius: 15,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(160,160,180,0.2)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><X size={14} /></button>
            </div>

            {/* Pillar panels grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10,
              marginBottom: 20,
            }}>
              {(data.panels || []).map((p: SeoCampaignPanel) => (
                <PanelCard key={p.id} panel={p} />
              ))}
            </div>

            {/* Living overview */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Living overview</h3>
                <button onClick={handleRefreshOverview} disabled={refreshingOverview} style={{
                  padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(160,160,180,0.2)',
                  background: 'transparent', cursor: 'pointer', fontSize: 11,
                  display: 'flex', alignItems: 'center', gap: 4, opacity: refreshingOverview ? 0.5 : 1,
                }}>
                  <RefreshCw size={11} className={refreshingOverview ? 'animate-spin' : ''} />
                  Regenerate
                </button>
              </div>
              <div style={{
                padding: 16, borderRadius: 10,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(160,160,180,0.1)',
              }}>
                {data.campaign.living_overview_md ? (
                  <SimpleMarkdown text={data.campaign.living_overview_md} />
                ) : (
                  <div style={{ fontSize: 12, color: 'rgba(150,150,170,0.6)', fontStyle: 'italic' }}>
                    No overview yet — click Regenerate.
                  </div>
                )}
              </div>
            </div>

            {/* Documents — Phase 14.0.1: latest report fully expanded inline */}
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>
                Documents &amp; reports ({(data.recent_reports || []).length})
              </h3>
              {(data.recent_reports || []).length === 0 ? (
                <div style={{ fontSize: 11.5, color: 'rgba(120,120,140,0.6)' }}>No reports yet.</div>
              ) : (
                <>
                  {/* Latest report — expanded with full content */}
                  <ExpandedReport report={data.recent_reports[0]} isFirst={true} />

                  {/* Older reports — collapsed rows, click to swap into expanded view via modal */}
                  {data.recent_reports.length > 1 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: 'rgba(150,150,170,0.6)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>
                        Earlier reports ({data.recent_reports.length - 1})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {data.recent_reports.slice(1).map((r: SeoCampaignReport) => (
                          <button key={r.id} onClick={() => setSelectedReport(r)} style={{
                            padding: 10, borderRadius: 8, textAlign: 'left',
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(160,160,180,0.1)',
                            cursor: 'pointer', color: 'inherit',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>{r.title}</div>
                                <div style={{ fontSize: 10, color: 'rgba(150,150,170,0.7)', marginTop: 2 }}>
                                  {PILLAR_LABEL[r.pillar] || r.pillar} · {r.report_kind.replace(/_/g, ' ')} · {new Date(r.created_at).toLocaleString()}
                                </div>
                              </div>
                              {r.confidence_rating && <StatusBadge value={r.confidence_rating} hue={r.confidence_rating === 'high' ? '152 70% 50%' : r.confidence_rating === 'medium' ? '38 92% 55%' : '0 75% 55%'} />}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Opportunities tied to this campaign */}
            {(data.open_opportunities || []).length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lightbulb size={13} color="#fb923c" />
                  Opportunities from this campaign ({data.open_opportunities.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.open_opportunities.map((o: SeoOpportunity) => (
                    <div key={o.id} style={{
                      padding: 10, borderRadius: 8, fontSize: 11.5,
                      background: 'rgba(251, 146, 60, 0.05)', border: '1px solid rgba(251, 146, 60, 0.15)',
                    }}>
                      <div style={{ fontWeight: 600 }}>{o.title}</div>
                      {o.description && <div style={{ marginTop: 4, color: 'rgba(150,150,170,0.85)', lineHeight: 1.5 }}>{o.description}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pipeline runs */}
            {(data.pipeline_runs || []).length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>Pipeline runs in this campaign</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {data.pipeline_runs.map((r: any) => (
                    <div key={r.id} style={{ fontSize: 11.5, padding: 8, background: 'rgba(255,255,255,0.02)', borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        <code style={{ fontSize: 10 }}>{r.id.slice(0, 8)}</code> · {r.pipeline_type} · {r.status}
                      </span>
                      <span style={{ color: 'rgba(150,150,170,0.7)' }}>
                        {r.steps_completed || 0}/{r.step_count} steps · {new Date(r.started_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lifecycle actions */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid rgba(160,160,180,0.1)' }}>
              {data.campaign.status === 'active' && (
                <button onClick={() => onPause(campaignId)} style={lifecycleBtnStyle('38 92% 55%')}>
                  <Pause size={12} /> Pause campaign
                </button>
              )}
              {data.campaign.status === 'paused' && (
                <button onClick={() => onResume(campaignId)} style={lifecycleBtnStyle('152 70% 50%')}>
                  <Play size={12} /> Resume campaign
                </button>
              )}
            </div>

            {/* Report viewer modal */}
            {selectedReport && (
              <ReportViewer report={selectedReport} onClose={() => setSelectedReport(null)} />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function lifecycleBtnStyle(hue: string): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 8,
    border: `1px solid hsla(${hue} / 0.3)`,
    background: `hsla(${hue} / 0.1)`,
    color: `hsl(${hue})`,
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 5,
  };
}

function PanelCard({ panel }: { panel: SeoCampaignPanel }) {
  const Icon = PILLAR_ICON[panel.pillar] || FileText;
  const isActive = panel.status === 'active';
  const isScheduled = panel.status === 'scheduled';
  const statusHue = STATUS_HUE[panel.current_status || panel.status] || STATUS_HUE.scheduled;
  return (
    <div style={{
      padding: 12, borderRadius: 10,
      background: `linear-gradient(180deg, hsla(${statusHue} / 0.06) 0%, rgba(15,16,24,0.7) 100%)`,
      border: `1px solid hsla(${statusHue} / 0.2)`,
      opacity: isScheduled ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon size={13} style={{ color: `hsl(${statusHue})` }} />
        <span style={{ fontSize: 11.5, fontWeight: 700 }}>{PILLAR_LABEL[panel.pillar] || panel.pillar}</span>
      </div>
      <StatusBadge value={panel.status} hue={statusHue} />
      <div style={{ fontSize: 10.5, color: 'rgba(150,150,170,0.85)', marginTop: 6, lineHeight: 1.5 }}>
        {panel.current_summary || panel.scheduled_note || panel.goal_summary || ''}
      </div>
      {isActive && panel.next_recheck_at && (
        <div style={{ fontSize: 9.5, color: 'rgba(120,120,140,0.7)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Clock size={9} /> Next: {new Date(panel.next_recheck_at).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

/* ─── Report viewer (modal for older reports) ────────────── */
function ReportViewer({ report, onClose }: { report: SeoCampaignReport; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const body = report.body_md || report.summary || '(no content)';

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const handleDownload = () => {
    const safeTitle = report.title.replace(/[^a-z0-9-_]/gi, '_').slice(0, 80);
    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${safeTitle}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9200,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 900, width: '100%', maxHeight: '90vh', overflow: 'auto',
        background: 'linear-gradient(180deg, #1a1b27 0%, #0f1018 100%)',
        border: '1px solid rgba(160,160,180,0.2)', borderRadius: 14,
        padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(150,150,170,0.6)', fontWeight: 700 }}>
              Report · {PILLAR_LABEL[report.pillar] || report.pillar}
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '4px 0' }}>{report.title}</h3>
            <div style={{ fontSize: 10.5, color: 'rgba(150,150,170,0.7)' }}>
              {report.report_kind.replace(/_/g, ' ')} · {new Date(report.created_at).toLocaleString()} · by {report.generated_by}
              {report.confidence_rating && ` · confidence: ${report.confidence_rating}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleCopy} style={iconActionStyle()} title="Copy markdown">
              {copied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
            </button>
            <button onClick={handleDownload} style={iconActionStyle()} title="Download .md">
              <Download size={13} />
            </button>
            <button onClick={onClose} style={iconActionStyle()} title="Close">
              <X size={14} />
            </button>
          </div>
        </div>
        <SimpleMarkdown text={body} />
      </div>
    </div>
  );
}

function iconActionStyle(): React.CSSProperties {
  return {
    width: 30, height: 30, borderRadius: 15,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(160,160,180,0.2)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'rgba(220,220,235,0.85)',
  };
}

/* ─── Expanded report (used for the latest, rendered inline in drawer) ─── */
function ExpandedReport({ report, isFirst }: { report: SeoCampaignReport; isFirst?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const body = report.body_md || report.summary || '(no content)';
  const confHue = report.confidence_rating === 'high' ? '152 70% 50%' : report.confidence_rating === 'medium' ? '38 92% 55%' : '0 75% 55%';

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const handleDownload = () => {
    const safeTitle = report.title.replace(/[^a-z0-9-_]/gi, '_').slice(0, 80);
    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${safeTitle}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      borderRadius: 12, padding: 16,
      background: `linear-gradient(180deg, hsla(${confHue} / 0.04) 0%, rgba(15,16,24,0.5) 100%)`,
      border: `1px solid hsla(${confHue} / 0.2)`,
      marginBottom: 6,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(160,160,180,0.1)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {isFirst && (
              <span style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                background: `hsla(${confHue} / 0.18)`, color: `hsl(${confHue})`,
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>Latest</span>
            )}
            {report.confidence_rating && (
              <StatusBadge value={report.confidence_rating} hue={confHue} />
            )}
            <span style={{ fontSize: 10, color: 'rgba(150,150,170,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {PILLAR_LABEL[report.pillar] || report.pillar} · {report.report_kind.replace(/_/g, ' ')}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{report.title}</div>
          <div style={{ fontSize: 10.5, color: 'rgba(150,150,170,0.7)', marginTop: 3 }}>
            {new Date(report.created_at).toLocaleString()} · by {report.generated_by}
            {report.llm_calls_used !== undefined && report.llm_calls_used > 0 && ` · ${report.llm_calls_used} LLM calls`}
            {(report.data_sources?.length || 0) > 0 && ` · sources: ${(report.data_sources || []).join(', ')}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button onClick={handleCopy} style={iconActionStyle()} title="Copy markdown">
            {copied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
          </button>
          <button onClick={handleDownload} style={iconActionStyle()} title="Download .md">
            <Download size={13} />
          </button>
          <button onClick={() => setCollapsed(!collapsed)} style={iconActionStyle()} title={collapsed ? 'Expand' : 'Collapse'}>
            <ChevronRight size={13} style={{ transform: collapsed ? 'rotate(90deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
          </button>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
          <SimpleMarkdown text={body} />
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SimpleMarkdown — rich markdown renderer for campaign documents.
   Supports: H1-H3, bold, italic, inline code, code blocks, blockquotes,
   bullet lists, numbered lists, links, tables, checkboxes.

   Same shape as the pipeline dashboard's renderer plus tables + checkboxes
   for the brief artifact's quality checklist.
═══════════════════════════════════════════════════════════════ */
export function SimpleMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split('\n');
  const blocks: any[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let listBuffer: { text: string; checked?: boolean | null }[] = [];
  let numberedBuffer: string[] = [];
  let tableRows: string[][] | null = null;
  let tableHasHeader = false;

  const flushList = () => {
    if (listBuffer.length > 0) { blocks.push({ type: 'ul', items: [...listBuffer] }); listBuffer = []; }
    if (numberedBuffer.length > 0) { blocks.push({ type: 'ol', items: [...numberedBuffer] }); numberedBuffer = []; }
  };
  const flushTable = () => {
    if (tableRows && tableRows.length > 0) {
      blocks.push({ type: 'table', rows: tableRows, hasHeader: tableHasHeader });
      tableRows = null;
      tableHasHeader = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        blocks.push({ type: 'code', text: codeBuffer.join('\n') });
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        flushList(); flushTable();
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) { codeBuffer.push(line); continue; }

    /* Table detection — a line that's `| ... | ... |` is part of a table */
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushList();
      const cells = line.trim().slice(1, -1).split('|').map(c => c.trim());
      /* Separator row like `| --- | --- |` */
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        if (tableRows && tableRows.length > 0) tableHasHeader = true;
        continue;
      }
      if (!tableRows) tableRows = [];
      tableRows.push(cells);
      continue;
    } else if (tableRows) {
      flushTable();
    }

    if (line.startsWith('### ')) { flushList(); flushTable(); blocks.push({ type: 'h3', text: line.slice(4) }); continue; }
    if (line.startsWith('## '))  { flushList(); flushTable(); blocks.push({ type: 'h2', text: line.slice(3) }); continue; }
    if (line.startsWith('# '))   { flushList(); flushTable(); blocks.push({ type: 'h1', text: line.slice(2) }); continue; }
    if (line.startsWith('> '))   { flushList(); flushTable(); blocks.push({ type: 'quote', text: line.slice(2) }); continue; }

    /* Checkbox: `- [ ] item` or `- [x] item` */
    const checkMatch = /^[-*]\s+\[([ xX])\]\s+(.+)$/.exec(line);
    if (checkMatch) {
      listBuffer.push({ text: checkMatch[2], checked: checkMatch[1].toLowerCase() === 'x' });
      continue;
    }
    /* Bullet list */
    if (/^[-*]\s+/.test(line)) {
      listBuffer.push({ text: line.replace(/^[-*]\s+/, ''), checked: null });
      continue;
    }
    /* Numbered list */
    const numMatch = /^\s*(\d+)\.\s+(.+)$/.exec(line);
    if (numMatch) {
      numberedBuffer.push(numMatch[2]);
      continue;
    }

    if (line.trim() === '') { flushList(); flushTable(); blocks.push({ type: 'br' }); continue; }
    flushList(); flushTable();
    blocks.push({ type: 'p', text: line });
  }
  flushList(); flushTable();
  if (codeBuffer.length > 0) blocks.push({ type: 'code', text: codeBuffer.join('\n') });

  return (
    <div style={{ color: 'rgba(220,220,235,0.9)', fontSize: 13, lineHeight: 1.7 }}>
      {blocks.map((b, i) => {
        if (b.type === 'h1') return <h1 key={i} style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginTop: i === 0 ? 0 : 20, marginBottom: 12 }}>{renderInlineMd(b.text)}</h1>;
        if (b.type === 'h2') return <h2 key={i} style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginTop: 18, marginBottom: 10 }}>{renderInlineMd(b.text)}</h2>;
        if (b.type === 'h3') return <h3 key={i} style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginTop: 14, marginBottom: 8 }}>{renderInlineMd(b.text)}</h3>;
        if (b.type === 'p')  return <p key={i} style={{ margin: '0 0 10px' }}>{renderInlineMd(b.text)}</p>;
        if (b.type === 'br') return <div key={i} style={{ height: 6 }} />;
        if (b.type === 'quote') return (
          <blockquote key={i} style={{
            margin: '8px 0', paddingLeft: 12,
            borderLeft: '3px solid rgba(255,255,255,0.2)',
            color: 'rgba(220,220,235,0.7)', fontStyle: 'italic',
          }}>{renderInlineMd(b.text)}</blockquote>
        );
        if (b.type === 'ul') return (
          <ul key={i} style={{ margin: '6px 0 12px', paddingLeft: 4, listStyle: 'none' }}>
            {b.items.map((it: any, j: number) => (
              <li key={j} style={{ marginBottom: 5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {it.checked === null || it.checked === undefined ? (
                  <span style={{ color: 'rgba(160,160,180,0.7)', marginTop: 2, flexShrink: 0 }}>•</span>
                ) : it.checked ? (
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, marginTop: 2, flexShrink: 0,
                    background: 'rgba(52, 211, 153, 0.2)', border: '1px solid rgba(52, 211, 153, 0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#34d399', fontSize: 9, fontWeight: 900,
                  }}>✓</span>
                ) : (
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, marginTop: 2, flexShrink: 0,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(160,160,180,0.3)',
                  }} />
                )}
                <span>{renderInlineMd(it.text)}</span>
              </li>
            ))}
          </ul>
        );
        if (b.type === 'ol') return (
          <ol key={i} style={{ margin: '6px 0 12px', paddingLeft: 22 }}>
            {b.items.map((it: string, j: number) => (
              <li key={j} style={{ marginBottom: 5 }}>{renderInlineMd(it)}</li>
            ))}
          </ol>
        );
        if (b.type === 'code') return (
          <pre key={i} style={{
            margin: '10px 0', padding: 12, borderRadius: 8,
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.06)',
            fontFamily: 'ui-monospace, "SF Mono", monospace',
            fontSize: 12, lineHeight: 1.55,
            overflow: 'auto', whiteSpace: 'pre-wrap',
          }}>{b.text}</pre>
        );
        if (b.type === 'table') return (
          <div key={i} style={{ margin: '10px 0', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {b.rows.map((row: string[], rIdx: number) => {
                  const isHeader = b.hasHeader && rIdx === 0;
                  const Tag = isHeader ? 'th' : 'td';
                  return (
                    <tr key={rIdx} style={{ borderBottom: '1px solid rgba(160,160,180,0.12)' }}>
                      {row.map((cell, cIdx) => (
                        <Tag key={cIdx} style={{
                          padding: '8px 10px', textAlign: 'left' as const,
                          fontWeight: isHeader ? 700 : 400,
                          color: isHeader ? '#fff' : 'rgba(220,220,235,0.85)',
                          background: isHeader ? 'rgba(255,255,255,0.04)' : 'transparent',
                          verticalAlign: 'top',
                        }}>{renderInlineMd(cell)}</Tag>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
        return null;
      })}
    </div>
  );
}

function renderInlineMd(text: string): React.ReactNode {
  if (!text) return text;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    if (match[2])      parts.push(<strong key={key++}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={key++}>{match[3]}</em>);
    else if (match[4]) parts.push(<code key={key++} style={{
      padding: '2px 5px', borderRadius: 4,
      background: 'rgba(186,200,255,0.10)',
      color: '#a5f3fc', fontSize: '0.92em', fontFamily: 'ui-monospace, monospace',
    }}>{match[4]}</code>);
    else if (match[5]) parts.push(
      <a key={key++} href={match[6]} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'underline' }}>{match[5]}</a>
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}
