/* ════════════════════════════════════════════════════════════════
   SeoCampaignsPanel.tsx — Phase 14
   Lists all SEO campaigns for the current project + drill-in to each.

   Sections:
     • Campaigns list (active / paused / all)
     • Opportunities inbox (badge count, one-click promote)
     • Campaign detail drawer when one is selected
═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Target, Lightbulb, Play, Pause, Archive, RefreshCw, ChevronRight,
  CheckCircle2, AlertCircle, Loader2, X, Sparkles, FileText, TrendingUp,
  Layers, Link2, ExternalLink, Activity, Clock,
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
  technical_audit:  AlertCircle,
  cluster_map:      Layers,
  internal_linking: Link2,
  off_page:         ExternalLink,
  monitoring:       Activity,
};

const PILLAR_LABEL: Record<string, string> = {
  content:          'Content',
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
                padding: 12, borderRadius: 10,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(160,160,180,0.1)',
                fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'rgba(220,220,235,0.85)',
              }}>
                {data.campaign.living_overview_md || '_(no overview yet — click Regenerate)_'}
              </div>
            </div>

            {/* Reports */}
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>Recent reports ({(data.recent_reports || []).length})</h3>
              {(data.recent_reports || []).length === 0 ? (
                <div style={{ fontSize: 11.5, color: 'rgba(120,120,140,0.6)' }}>No reports yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.recent_reports.map((r: SeoCampaignReport) => (
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

/* ─── Report viewer ──────────────────────────────────────── */
function ReportViewer({ report, onClose }: { report: SeoCampaignReport; onClose: () => void }) {
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(150,150,170,0.6)', fontWeight: 700 }}>
              Report · {PILLAR_LABEL[report.pillar] || report.pillar}
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '4px 0' }}>{report.title}</h3>
            <div style={{ fontSize: 10.5, color: 'rgba(150,150,170,0.7)' }}>
              {report.report_kind.replace(/_/g, ' ')} · {new Date(report.created_at).toLocaleString()} · by {report.generated_by}
              {report.confidence_rating && ` · confidence: ${report.confidence_rating}`}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 15,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(160,160,180,0.2)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><X size={14} /></button>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'rgba(220,220,235,0.85)' }}>
          {(report as any).body_md || report.summary || '(no content)'}
        </div>
      </div>
    </div>
  );
}
