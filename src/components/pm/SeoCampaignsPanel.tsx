/* ════════════════════════════════════════════════════════════════
   SeoCampaignsPanel.tsx — Phase 14
   Lists all SEO campaigns for the current project + drill-in to each.

   Sections:
     • Campaigns list (active / paused / all)
     • Opportunities inbox (badge count, one-click promote)
     • Campaign detail drawer when one is selected
═══════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  seoTechnicalAuditRun, seoTechnicalAuditSetTargetUrl,
  seoClusterMapRun,
  seoInternalLinkingRun,
  seoOffPageRun,
  seoMonitoringRun,
  seasonPipelineRefreshFromAudit,
  seasonPipelineGet,
  type SeoCampaign, type SeoCampaignPanel, type SeoCampaignReport, type SeoOpportunity,
} from './api';
import SeasonPipelineDashboard from '@/components/season/SeasonPipelineDashboard';
import CampaignDocumentsSection from './CampaignDocumentsSection';

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
  const [tab, setTab] = useState<'campaigns' | 'opportunities' | 'objectives'>('campaigns');
  const [showNewObjective, setShowNewObjective] = useState(false);
  /* Active pipeline run being driven/watched in dashboard overlay */
  const [activeDashRun, setActiveDashRun] = useState<{ runId: string; label: string; stepCount: number } | null>(null);

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
    <>
      {/* Pipeline dashboard overlay — mounts when a run needs driving or watching */}
      {activeDashRun && (
        <SeasonPipelineDashboard
          key={activeDashRun.runId}
          runId={activeDashRun.runId}
          expectedSteps={activeDashRun.stepCount}
          pipelineLabel={activeDashRun.label}
          pipelineType="rank_for_keyword"
          onClose={() => { setActiveDashRun(null); refresh(); }}
          onComplete={() => { refresh(); }}
        />
      )}
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
          Campaigns ({campaigns.filter(c => !c.campaign_type || c.campaign_type === 'keyword_ranking').length})
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
        <TabButton active={tab === 'objectives'} onClick={() => setTab('objectives')}>
          🎯 Objectives
        </TabButton>
        {tab === 'objectives' && (
          <button
            type="button"
            onClick={() => setShowNewObjective(true)}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 10, fontSize: 11, fontWeight: 600,
              background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))',
              border: 'none', cursor: 'pointer',
            }}
          >
            + New objective
          </button>
        )}
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
          campaigns={campaigns.filter(c => !c.campaign_type || c.campaign_type === 'keyword_ranking')}
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


      {tab === 'objectives' && (
        <ObjectivesView
          projectId={projectId}
          campaigns={campaigns}
          onRefresh={refresh}
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
    </>
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
  // Site workspace linking
  const [sites,          setSites]          = useState<any[]>([]);
  const [showSitePicker, setShowSitePicker] = useState(false);
  const [linkingSite,    setLinkingSite]    = useState(false);
  /* Active pipeline dashboard for this drawer */
  const [activeDashRun, setActiveDashRun] = useState<{ runId: string; label: string; stepCount: number } | null>(null);
  /* Phase 15 — audit state */
  const [auditBusyPanel, setAuditBusyPanel] = useState<string | null>(null);
  const [urlPromptPanel, setUrlPromptPanel] = useState<SeoCampaignPanel | null>(null);
  /* Phase 16 — cluster map state */
  const [clusterBusyPanel, setClusterBusyPanel] = useState<string | null>(null);
  /* Phase 17 — internal linking state */
  const [linkingBusyPanel, setLinkingBusyPanel] = useState<string | null>(null);
  /* Phase 18 — off-page state */
  const [offPageBusyPanel, setOffPageBusyPanel] = useState<string | null>(null);
  /* Phase 19 — monitoring state */
  const [monitoringBusyPanel, setMonitoringBusyPanel] = useState<string | null>(null);
  /* Phase 17.5.1 — refresh-from-audit per-run progress.
     Tracks the live execution of audit-consuming steps so the user sees what's
     happening in real time, not a vanished toast. Map keyed by runId.
     Phase = current lifecycle stage; progress = "step X of Y running".
     Phase 17.5.3 — extended to capture which step failed + its error_message
     so the inline strip can show the specific cause rather than a generic
     "Run ended with status: failed". */
  type RefreshState = {
    phase: 'resetting' | 'executing' | 'completed' | 'failed';
    stepsReset?: number;
    firstStepIndex?: number;
    firstStepLabel?: string;
    currentStepIndex?: number;
    currentStepLabel?: string;
    totalSteps?: number;
    error?: string;
    failedStepLabel?: string;     /* Phase 17.5.3 */
    failedStepIndex?: number;     /* Phase 17.5.3 */
    failedStepError?: string;     /* Phase 17.5.3 — the actual error_message from the step row */
  };
  const [refreshProgress, setRefreshProgress] = useState<Record<string, RefreshState>>({});
  /* Guard so a single refresh execution loop doesn't double-fire */
  const refreshingRunsRef = useRef<Set<string>>(new Set());
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

  // Load site workspaces for linking
  useEffect(() => {
    if (!data?.campaign?.project_id) return;
    apiCall('site_list', { projectId: data.campaign.project_id }).then(r => setSites(r.sites || []));
  }, [data?.campaign?.project_id]);

  const handleLinkSite = async (siteId: string | null) => {
    setLinkingSite(true);
    await apiCall('bs_campaign_objective_update', { campaignId, updates: { site_id: siteId } });
    setLinkingSite(false);
    setShowSitePicker(false);
    load();
  };

  /* Auto-open dashboard if campaign has a running pipeline with 0 steps completed.
     This handles runs created from PM Module (not SEASON chat) that need driving. */
  useEffect(() => {
    if (!data?.pipeline_runs?.length) return;
    const stalled = data.pipeline_runs.find((r: any) =>
      r.status === 'running' && (r.steps_completed || 0) === 0
    );
    if (stalled && !activeDashRun) {
      setActiveDashRun({
        runId:     stalled.id,
        label:     `${data.campaign?.keyword || 'campaign'} · rank_for_keyword`,
        stepCount: stalled.step_count || 8,
      });
    }
  }, [data]);

  const handleRefreshOverview = async () => {
    setRefreshingOverview(true);
    const r = await seoCampaignOverviewRefresh({ campaignId });
    if (r.error) toast({ title: 'Overview refresh failed', description: r.error, variant: 'destructive' });
    else toast({ title: 'Overview regenerated' });
    await load();
    setRefreshingOverview(false);
  };

  /* Phase 17.5.1 — refresh pipeline run from latest audit + drive execution to completion.
     The 17.5 version only reset steps and asked the user to navigate to the
     dashboard. That was wrong — clicking a button and getting nothing visible
     happen is broken UX. This version owns the full lifecycle:
       1. Show 'resetting' state inline (not just toast)
       2. Call backend to reset audit-consuming steps
       3. Loop seasonPipelineExecuteNext until terminal or error
       4. Update inline progress per step (current step name + count)
       5. Reload campaign state at the end so artifacts refresh in UI
       6. Show final completed/failed state for ~10s so user sees the result
     The double-fire guard prevents the same run being refreshed twice if
     the user clicks fast or React re-renders mid-flight. */
  const handleRefreshPipelineFromAudit = async (
    runId: string,
    pipelineType: string,
    stepCount: number,
    keyword: string,
  ) => {
    if (refreshingRunsRef.current.has(runId)) return;
    if (!confirm('Reset all audit-consuming pipeline steps (competitor snapshot, content brief, forecast, client update, internal handover) so they re-run with the latest technical audit\'s findings?\n\nThis will replace those artifacts with fresh ones. Other steps (keyword research, GSC context, strategy plan) are not affected. Re-execution runs immediately and may take 2-3 minutes.')) return;

    refreshingRunsRef.current.add(runId);
    setRefreshProgress(prev => ({ ...prev, [runId]: { phase: 'resetting' } }));

    try {
      /* Step 1: reset audit-consuming steps.
         Phase 17.5.6 — this MUST happen before dispatching the dashboard-open
         event. The dashboard's polling loop treats status='failed' or
         'cancelled' as terminal and stops. If we dispatch the event first
         (mounting the dashboard) and THEN call the reset, the dashboard's
         first poll fires within ~1s and sees the run's stale 'failed' status
         from before the refresh, then immediately stops polling. After that
         no live updates ever reach the UI — even though execution proceeds
         server-side. Reversing the order so the reset (which flips the run
         to 'retrying') completes first means the dashboard sees a valid
         non-terminal status on its first poll. */
      const reset = await seasonPipelineRefreshFromAudit({ runId });
      if (reset.error || !reset.success) {
        setRefreshProgress(prev => ({ ...prev, [runId]: { phase: 'failed', error: reset.error || 'reset failed' } }));
        toast({ title: 'Refresh failed', description: reset.error || 'reset failed', variant: 'destructive' });
        /* Clear the failed state after 30s so the user has time to read the error */
        setTimeout(() => {
          setRefreshProgress(prev => { const n = { ...prev }; delete n[runId]; return n; });
        }, 30000);
        return;
      }

      const firstIdx = reset.first_step_index ?? 0;
      const firstLabel = reset.first_step_label || reset.first_step_id || `step ${firstIdx + 1}`;
      const stepsReset = reset.steps_reset || 0;

      /* Phase 17.5.4 — open the live SEASON pipeline dashboard so the user
         sees the same 8-block visualization they saw on the original campaign
         launch. The dashboard polls the DB independently. Dispatching AFTER
         the reset succeeded means the dashboard's first poll sees status =
         'retrying', not the stale 'failed'.

         Phase 17.5.7 — the dashboard's `driveExecution` (runs in useEffect on
         mount) handles execution driving natively. Previously the panel ran
         its OWN execute loop in parallel, which raced with the dashboard's
         loop on the same runId — two callers reading "first pending step"
         concurrently produced lost counter increments and partial finalize
         calls (e.g. "7/8 steps completed" while the dashboard showed 8/8).
         Now: panel resets, dispatches the dashboard mount event, then waits
         for the run to settle via passive polling. Single execution driver. */
      window.dispatchEvent(new CustomEvent('season:open-pipeline-dashboard', {
        detail: {
          runId,
          pipelineType,
          stepCount,
          label: keyword ? `Refreshing "${keyword}"` : 'Refreshing pipeline',
        },
      }));

      setRefreshProgress(prev => ({
        ...prev,
        [runId]: {
          phase: 'executing',
          stepsReset,
          firstStepIndex: firstIdx,
          firstStepLabel: firstLabel,
          currentStepIndex: firstIdx,
          totalSteps: firstIdx + stepsReset,
        },
      }));

      /* Phase 17.5.7 — passive poll waiting for run to settle.
         The dashboard owns execution driving (see its driveExecution useEffect).
         The panel just watches the run's status here so it knows when to
         reload campaign artifacts. ~3s interval since we're not in any hurry —
         the user is watching the dashboard, not this panel-local strip. */
      let completed = false;
      let failedReason: string | null = null;
      const POLL_INTERVAL_MS = 3000;
      const MAX_WAIT_MS = 8 * 60 * 1000;  /* 8 min hard cap — pipeline rarely exceeds 4 min */
      const startedWaiting = Date.now();
      while (Date.now() - startedWaiting < MAX_WAIT_MS) {
        await new Promise(res => setTimeout(res, POLL_INTERVAL_MS));
        const detail = await seasonPipelineGet({ runId });
        if (detail.error) {
          failedReason = detail.error;
          break;
        }
        const status = detail.run?.status;
        const pendingSteps = (detail.steps || []).filter(s => s.status === 'pending' || s.status === 'running');
        /* Update inline strip with current step from poll */
        const currentRunningStep = (detail.steps || []).find(s => s.status === 'running');
        if (currentRunningStep) {
          setRefreshProgress(prev => ({
            ...prev,
            [runId]: {
              ...prev[runId],
              currentStepIndex: currentRunningStep.step_index,
              currentStepLabel: currentRunningStep.step_label,
            },
          }));
        }
        /* Settle conditions: terminal status AND no pending/running steps */
        const isTerminal = status === 'completed' || status === 'failed' || status === 'cancelled';
        if (isTerminal && pendingSteps.length === 0) {
          completed = status === 'completed' && (detail.run?.steps_failed || 0) === 0;
          if (!completed && !failedReason) {
            failedReason = status === 'completed'
              ? `Run completed but ${detail.run?.steps_failed || 0} step(s) failed.`
              : `Run ended with status: ${status}`;
          }
          break;
        }
      }

      if (completed) {
        setRefreshProgress(prev => ({
          ...prev,
          [runId]: { ...prev[runId], phase: 'completed' },
        }));
        toast({
          title: 'Pipeline refreshed',
          description: `Re-ran ${stepsReset} step(s) from "${firstLabel}" with latest audit findings. Artifacts are live.`,
        });
        await load();  /* Reload campaign panel so the fresh artifacts surface */
      } else {
        /* Phase 17.5.3 — fetch the run's steps to find WHICH one failed and WHY.
           The execute_next loop only knows "the run is in failed state" — the
           specific cause lives in season_pipeline_steps.error_message. Without
           this lookup, the inline strip just says "Run ended with status: failed"
           which forces the user to navigate to the pipeline dashboard to learn
           anything. */
        let failedStepLabel: string | undefined;
        let failedStepIndex: number | undefined;
        let failedStepError: string | undefined;
        try {
          const detail = await seasonPipelineGet({ runId });
          if (detail.steps) {
            const failedSteps = detail.steps.filter(s => s.status === 'failed');
            if (failedSteps.length > 0) {
              /* Find the EARLIEST failed step — that's typically the root cause.
                 Later steps may have failed because they depend on the earlier
                 one's output. */
              const earliest = failedSteps.sort((a, b) => a.step_index - b.step_index)[0];
              failedStepLabel = earliest.step_label;
              failedStepIndex = earliest.step_index;
              failedStepError = earliest.error_message || undefined;
            }
          }
        } catch (e) {
          /* Diagnostic lookup failed — fall back to the loop's failedReason */
        }
        setRefreshProgress(prev => ({
          ...prev,
          [runId]: {
            ...prev[runId],
            phase: 'failed',
            error: failedReason || 'execution loop ended without completing',
            failedStepLabel,
            failedStepIndex,
            failedStepError,
          },
        }));
        toast({
          title: failedStepLabel ? `Step failed: "${failedStepLabel}"` : 'Refresh paused',
          description: failedStepError
            ? failedStepError.slice(0, 200)
            : (failedReason || 'Execution didn\'t reach a clean completion — check the pipeline dashboard for details.'),
          variant: 'destructive',
        });
      }

      /* Auto-clear inline state after a timeout. Completed states fade fast
         (12s — user just wants confirmation, then it's done). Failed states
         persist much longer (60s) because the user needs time to read the
         step name + error_message before deciding what to do. */
      const clearAfterMs = completed ? 12000 : 60000;
      setTimeout(() => {
        setRefreshProgress(prev => { const n = { ...prev }; delete n[runId]; return n; });
      }, clearAfterMs);

    } catch (e: any) {
      setRefreshProgress(prev => ({ ...prev, [runId]: { phase: 'failed', error: e?.message || 'unknown' } }));
      toast({ title: 'Refresh crashed', description: e?.message || 'unknown', variant: 'destructive' });
      setTimeout(() => {
        setRefreshProgress(prev => { const n = { ...prev }; delete n[runId]; return n; });
      }, 30000);
    } finally {
      refreshingRunsRef.current.delete(runId);
    }
  };

  /* Phase 15 — audit handlers */
  const handleRunAudit = async (panel: SeoCampaignPanel) => {
    setAuditBusyPanel(panel.id);
    try {
      const r = await seoTechnicalAuditRun({ campaignId, panelId: panel.id });
      if (r.error) {
        toast({ title: 'Audit failed', description: r.error, variant: 'destructive' });
        return;
      }
      if (!r.audited_url) {
        toast({ title: 'Audit pending', description: 'No target URL — set one to enable audits.' });
      } else {
        const critical = (r.red_count || 0);
        const warnings = (r.amber_count || 0);
        toast({
          title: critical > 0 ? `🔴 ${critical} critical issue${critical === 1 ? '' : 's'} found` : warnings > 0 ? `🟡 ${warnings} warning${warnings === 1 ? '' : 's'} found` : `🟢 Page passed`,
          description: `${r.findings_count || 0} total findings. Open the report below to review.`,
        });
      }
      await load();
    } finally {
      setAuditBusyPanel(null);
    }
  };

  const handleSetTargetUrl = async (panel: SeoCampaignPanel) => {
    setUrlPromptPanel(panel);
  };

  const handleSubmitTargetUrl = async (url: string) => {
    if (!urlPromptPanel) return;
    const r = await seoTechnicalAuditSetTargetUrl({ panelId: urlPromptPanel.id, url });
    if (r.error) {
      toast({ title: 'Set URL failed', description: r.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Target URL saved' });
    setUrlPromptPanel(null);
    await load();
  };

  /* Phase 16 — cluster map handler */
  const handleRunClusterMap = async (panel: SeoCampaignPanel) => {
    setClusterBusyPanel(panel.id);
    try {
      const r = await seoClusterMapRun({ campaignId, panelId: panel.id });
      if (r.error) {
        toast({ title: 'Cluster map failed', description: r.error, variant: 'destructive' });
        return;
      }
      const clusters = r.cluster_count || 0;
      const gaps = r.gap_count || 0;
      if (clusters === 0) {
        toast({ title: 'Cluster map empty', description: 'Not enough GSC data — see the report for details.' });
      } else {
        toast({
          title: `${clusters} cluster${clusters === 1 ? '' : 's'} mapped`,
          description: gaps > 0
            ? `${gaps} coverage gap${gaps === 1 ? '' : 's'} surfaced as opportunities.`
            : `No gaps detected. Open the report below for the full breakdown.`,
        });
      }
      await load();
    } finally {
      setClusterBusyPanel(null);
    }
  };

  /* Phase 17 — internal linking handler */
  const handleRunInternalLinking = async (panel: SeoCampaignPanel) => {
    setLinkingBusyPanel(panel.id);
    try {
      const r = await seoInternalLinkingRun({ campaignId, panelId: panel.id });
      if (r.error) {
        toast({ title: 'Linking audit failed', description: r.error, variant: 'destructive' });
        return;
      }
      const pages = r.pages_fetched || 0;
      const recs = r.recommendation_count || 0;
      const findings = r.findings_count || 0;
      if (pages === 0) {
        toast({
          title: 'Linking audit pending',
          description: 'No pages could be fetched — see the report for details.',
        });
      } else {
        toast({
          title: `Audited ${pages} page${pages === 1 ? '' : 's'}`,
          description: `${findings} finding${findings === 1 ? '' : 's'}, ${recs} link recommendation${recs === 1 ? '' : 's'} ready. Open the report below.`,
        });
      }
      await load();
    } finally {
      setLinkingBusyPanel(null);
    }
  };

  /* Phase 18 — off-page strategy handler */
  const handleRunOffPage = async (panel: SeoCampaignPanel) => {
    setOffPageBusyPanel(panel.id);
    try {
      const r = await seoOffPageRun({ campaignId, panelId: panel.id });
      if (r.error) {
        toast({ title: 'Off-page strategy failed', description: r.error, variant: 'destructive' });
        return;
      }
      const existing = r.existing_assets || 0;
      const aspirational = r.aspirational_assets || 0;
      const prospects = r.prospect_categories || 0;
      if (existing === 0 && aspirational === 0 && prospects === 0) {
        toast({
          title: 'Off-page strategy pending',
          description: 'Not enough input data — see the report for what to run first.',
        });
      } else {
        toast({
          title: `${existing} existing + ${aspirational} to build`,
          description: `${prospects} prospect categor${prospects === 1 ? 'y' : 'ies'} mapped with outreach angles. Open the report below.`,
        });
      }
      await load();
    } finally {
      setOffPageBusyPanel(null);
    }
  };

  /* Phase 19 — monitoring handler */
  const handleRunMonitoring = async (panel: SeoCampaignPanel) => {
    setMonitoringBusyPanel(panel.id);
    try {
      const r = await seoMonitoringRun({ campaignId, panelId: panel.id });
      if (r.error) {
        toast({ title: 'Monitoring check failed', description: r.error, variant: 'destructive' });
        return;
      }
      if (r.baseline_established) {
        toast({
          title: '🌱 Baseline established',
          description: 'First snapshot captured. Next monitoring check will compare against this baseline.',
        });
      } else {
        const changes = r.changes_detected || 0;
        const red     = r.red_count || 0;
        const amber   = r.amber_count || 0;
        toast({
          title: red > 0 ? `🔴 ${red} critical change${red === 1 ? '' : 's'}` : amber > 0 ? `🟡 ${amber} warning${amber === 1 ? '' : 's'}` : `🟢 ${changes} change${changes === 1 ? '' : 's'}`,
          description: 'Open the monitoring report below for the full delta breakdown.',
        });
      }
      await load();
    } finally {
      setMonitoringBusyPanel(null);
    }
  };

  return (
    <>
      {activeDashRun && (
        <SeasonPipelineDashboard
          key={activeDashRun.runId}
          runId={activeDashRun.runId}
          expectedSteps={activeDashRun.stepCount}
          pipelineLabel={activeDashRun.label}
          pipelineType="rank_for_keyword"
          onClose={() => { setActiveDashRun(null); load(); }}
          onComplete={() => { load(); }}
        />
      )}
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

                {/* Site workspace link */}
                <div style={{ marginTop: 8 }}>
                  {data.campaign.site_id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 4 }}>
                        🌐 {sites.find(s => s.id === data.campaign.site_id)?.label || 'Site linked'}
                      </span>
                      <button type="button" onClick={() => setShowSitePicker(v => !v)}
                        style={{ fontSize: 10, color: 'rgba(150,150,170,0.7)', background: 'none', border: 'none', cursor: 'pointer' }}>
                        change
                      </button>
                      <button type="button" onClick={() => handleLinkSite(null)}
                        style={{ fontSize: 10, color: 'rgba(150,150,170,0.7)', background: 'none', border: 'none', cursor: 'pointer' }}>
                        unlink
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowSitePicker(v => !v)}
                      style={{
                        fontSize: 11, color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', gap: 5,
                        background: 'hsl(var(--primary)/0.08)', border: '1px solid hsl(var(--primary)/0.25)',
                        borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
                      }}>
                      🌐 Link site workspace
                    </button>
                  )}

                  {showSitePicker && (
                    <div style={{
                      marginTop: 8, padding: 12, borderRadius: 10,
                      background: 'hsl(var(--background)/0.9)', border: '1px solid hsl(var(--border))',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(150,150,170,0.7)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Select site workspace
                      </div>
                      {sites.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'rgba(150,150,170,0.7)' }}>
                          No site workspaces yet. Create one in Site Manager first.
                        </div>
                      ) : sites.map((s: any) => (
                        <button key={s.id} type="button" onClick={() => handleLinkSite(s.id)} disabled={linkingSite}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 8, marginBottom: 4, cursor: 'pointer',
                            border: data.campaign.site_id === s.id ? '1px solid hsl(var(--primary)/0.5)' : '1px solid hsl(var(--border))',
                            background: data.campaign.site_id === s.id ? 'hsl(var(--primary)/0.08)' : 'transparent',
                            textAlign: 'left',
                          }}>
                          <span style={{ fontSize: 16 }}>🌐</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
                            {s.domain && <div style={{ fontSize: 10, color: 'rgba(150,150,170,0.7)' }}>{s.domain}</div>}
                          </div>
                          {data.campaign.site_id === s.id && <span style={{ fontSize: 10, color: 'hsl(var(--primary))' }}>✓</span>}
                        </button>
                      ))}
                      <button type="button" onClick={() => setShowSitePicker(false)}
                        style={{ fontSize: 11, color: 'rgba(150,150,170,0.7)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
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
                <PanelCard
                  key={p.id} panel={p}
                  onRunAudit={handleRunAudit}
                  onSetTargetUrl={handleSetTargetUrl}
                  onRunClusterMap={handleRunClusterMap}
                  onRunInternalLinking={handleRunInternalLinking}
                  onRunOffPage={handleRunOffPage}
                  onRunMonitoring={handleRunMonitoring}
                  auditBusy={auditBusyPanel === p.id}
                  clusterBusy={clusterBusyPanel === p.id}
                  linkingBusy={linkingBusyPanel === p.id}
                  offPageBusy={offPageBusyPanel === p.id}
                  monitoringBusy={monitoringBusyPanel === p.id}
                />
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

            {/* Phase D4 — Documents from artifacts table (parallel to legacy
               reports above). Eventually the legacy block can be deprecated
               once artifacts coverage is verified complete. Both render for
               now so PMs see both views and we don't risk regression. */}
            <CampaignDocumentsSection
              campaignId={campaignId}
              projectId={data?.panels?.[0]?.project_id}
              keyword={data?.campaign?.keyword}
            />

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
                  {data.pipeline_runs.map((r: any) => {
                    /* Phase 17.5.5 — allow refresh on any run in a terminal-or-near-terminal
                       state (completed/failed/interrupted/cancelled). Excluding failed runs
                       from refresh was wrong: failed is when you most want to re-trigger from
                       audit. Only block while a step is actively executing. */
                    const isMidFlight = r.status === 'running' || r.status === 'retrying';
                    const canRefresh  = !isMidFlight;
                    const progress = refreshProgress[r.id];
                    const isRefreshing = !!progress && (progress.phase === 'resetting' || progress.phase === 'executing');
                    return (
                      <div key={r.id} style={{ fontSize: 11.5, padding: 8, background: 'rgba(255,255,255,0.02)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span>
                            <code style={{ fontSize: 10 }}>{r.id.slice(0, 8)}</code> · {r.pipeline_type} · {r.status}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: 'rgba(150,150,170,0.7)' }}>
                              {r.steps_completed || 0}/{r.step_count} steps · {new Date(r.started_at).toLocaleDateString()}
                            </span>
                            {/* Run/resume button for runs that exist but haven't executed yet */}
                            {canRefresh && !isRefreshing && r.steps_completed === 0 && r.status === 'running' && (
                              <button
                                onClick={() => setActiveDashRun({
                                  runId: r.id,
                                  label: `${data.campaign.keyword || 'campaign'} · rank_for_keyword`,
                                  stepCount: r.step_count || 8,
                                })}
                                style={{
                                  fontSize: 10,
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  background: 'rgba(110,200,140,0.15)',
                                  border: '1px solid rgba(110,200,140,0.4)',
                                  color: 'rgba(150,230,170,0.95)',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontWeight: 600,
                                }}
                              >
                                <Play size={10} /> Run pipeline
                              </button>
                            )}
                            {/* Watch button for in-flight runs */}
                            {r.status === 'running' && r.steps_completed > 0 && (
                              <button
                                onClick={() => setActiveDashRun({
                                  runId: r.id,
                                  label: `${data.campaign.keyword || 'campaign'} · rank_for_keyword`,
                                  stepCount: r.step_count || 8,
                                })}
                                style={{
                                  fontSize: 10,
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  background: 'rgba(120,160,255,0.12)',
                                  border: '1px solid rgba(120,160,255,0.3)',
                                  color: 'rgba(180,200,255,0.95)',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <Activity size={10} /> Watch
                              </button>
                            )}
                            {/* Phase 17.5 — Refresh from audit button */}
                            {canRefresh && !isRefreshing && (
                              <button
                                onClick={() => handleRefreshPipelineFromAudit(
                                  r.id,
                                  r.pipeline_type,
                                  r.step_count || 8,
                                  data.campaign.keyword || '',
                                )}
                                title="Reset audit-consuming steps (competitor_snapshot, content_brief, forecast, client_update, internal_handover) so they re-run with the latest technical audit's findings. The live 8-block pipeline dashboard will appear over the page so you can watch progress per step."
                                style={{
                                  fontSize: 10,
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  background: 'rgba(120,160,255,0.12)',
                                  border: '1px solid rgba(120,160,255,0.3)',
                                  color: 'rgba(180,200,255,0.95)',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <RefreshCw size={10} />
                                Refresh from audit
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Phase 17.5.1 — inline progress display so user sees what's happening */}
                        {progress && (
                          <div style={{
                            padding: '6px 8px',
                            borderRadius: 4,
                            background:
                              progress.phase === 'failed'    ? 'rgba(220,90,90,0.10)' :
                              progress.phase === 'completed' ? 'rgba(110,200,140,0.10)' :
                                                               'rgba(120,160,255,0.10)',
                            border: '1px solid ' + (
                              progress.phase === 'failed'    ? 'rgba(220,90,90,0.30)' :
                              progress.phase === 'completed' ? 'rgba(110,200,140,0.30)' :
                                                               'rgba(120,160,255,0.30)'
                            ),
                            fontSize: 11,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}>
                            {progress.phase === 'resetting' && (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                <span>Resetting audit-consuming steps… <span style={{ color: 'rgba(150,170,210,0.85)' }}>(live dashboard opening above)</span></span>
                              </>
                            )}
                            {progress.phase === 'executing' && (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                <span>
                                  Re-running step {(progress.currentStepIndex ?? 0) + 1}
                                  {progress.totalSteps ? ` of ${progress.totalSteps}` : ''}
                                  {progress.currentStepLabel ? `: "${progress.currentStepLabel}"` : ''}
                                  {!progress.currentStepLabel && progress.firstStepLabel ? `: "${progress.firstStepLabel}"` : ''}
                                  <span style={{ color: 'rgba(150,170,210,0.85)' }}> · see live dashboard above for per-step view</span>
                                </span>
                              </>
                            )}
                            {progress.phase === 'completed' && (
                              <>
                                <CheckCircle2 size={12} style={{ color: 'rgba(110,200,140,0.95)' }} />
                                <span>
                                  Refreshed {progress.stepsReset || 0} step{(progress.stepsReset === 1) ? '' : 's'} with latest audit data. Artifacts are live.
                                </span>
                              </>
                            )}
                            {progress.phase === 'failed' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                  <AlertCircle size={12} style={{ color: 'rgba(220,90,90,0.95)', marginTop: 1, flexShrink: 0 }} />
                                  <div style={{ flex: 1 }}>
                                    {progress.failedStepLabel ? (
                                      <>
                                        <div style={{ fontWeight: 600 }}>
                                          Step {(progress.failedStepIndex ?? 0) + 1} failed: "{progress.failedStepLabel}"
                                        </div>
                                        {progress.failedStepError && (
                                          <div style={{ marginTop: 3, color: 'rgba(220,180,180,0.95)', fontFamily: 'ui-monospace, monospace', fontSize: 10.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                            {progress.failedStepError}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <span>Refresh failed: {progress.error || 'unknown reason'}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
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

            {/* Phase 15 — Set target URL modal */}
            {urlPromptPanel && (
              <SetTargetUrlModal
                panel={urlPromptPanel}
                onSubmit={handleSubmitTargetUrl}
                onCancel={() => setUrlPromptPanel(null)}
              />
            )}
          </>
        ) : null}
      </div>
    </div>
    </>
  );
}

/* ─── Phase 15 — Set Target URL modal ─────────────────────── */
function SetTargetUrlModal({ panel, onSubmit, onCancel }: {
  panel: SeoCampaignPanel;
  onSubmit: (url: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState<string>(panel.target_url || '');
  const isValid = /^https?:\/\/.+/i.test(url.trim());
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 9200,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 520, width: '100%',
        background: 'linear-gradient(180deg, #1a1b27 0%, #0f1018 100%)',
        border: '1px solid rgba(160,160,180,0.2)', borderRadius: 14, padding: 22,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 6 }}>
          Set target URL for technical audit
        </h3>
        <p style={{ fontSize: 12, color: 'rgba(150,150,170,0.85)', marginBottom: 14, lineHeight: 1.5 }}>
          This is the URL the technical audit will check (HTTP status, on-page elements, Core Web Vitals, schema, etc.). Use the full URL including https://.
        </p>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com/your-page"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && isValid) onSubmit(url.trim()); }}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(160,160,180,0.2)',
            color: 'rgba(220,220,235,0.95)',
            fontSize: 13, outline: 'none',
            marginBottom: 14,
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 14px', borderRadius: 7,
            border: '1px solid rgba(160,160,180,0.2)',
            background: 'transparent', color: 'rgba(150,150,170,0.85)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>Cancel</button>
          <button
            onClick={() => isValid && onSubmit(url.trim())}
            disabled={!isValid}
            style={{
              padding: '8px 14px', borderRadius: 7,
              border: `1px solid rgba(186,200,255,${isValid ? 0.35 : 0.15})`,
              background: `rgba(186,200,255,${isValid ? 0.15 : 0.05})`,
              color: '#a5f3fc', fontSize: 12, fontWeight: 700,
              cursor: isValid ? 'pointer' : 'not-allowed',
            }}>Save URL</button>
        </div>
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

function PanelCard({ panel, onRunAudit, onSetTargetUrl, onRunClusterMap, onRunInternalLinking, onRunOffPage, onRunMonitoring, auditBusy, clusterBusy, linkingBusy, offPageBusy, monitoringBusy }: {
  panel: SeoCampaignPanel;
  onRunAudit?:           (panel: SeoCampaignPanel) => void;
  onSetTargetUrl?:       (panel: SeoCampaignPanel) => void;
  onRunClusterMap?:      (panel: SeoCampaignPanel) => void;
  onRunInternalLinking?: (panel: SeoCampaignPanel) => void;
  onRunOffPage?:         (panel: SeoCampaignPanel) => void;
  onRunMonitoring?:      (panel: SeoCampaignPanel) => void;
  auditBusy?:            boolean;
  clusterBusy?:          boolean;
  linkingBusy?:          boolean;
  offPageBusy?:          boolean;
  monitoringBusy?:       boolean;
}) {
  const Icon = PILLAR_ICON[panel.pillar] || FileText;
  const isActive = panel.status === 'active';
  const isScheduled = panel.status === 'scheduled';
  const statusHue = STATUS_HUE[panel.current_status || panel.status] || STATUS_HUE.scheduled;
  const isTechnicalAudit  = panel.pillar === 'technical_audit';
  const isClusterMap      = panel.pillar === 'cluster_map';
  const isInternalLinking = panel.pillar === 'internal_linking';
  const isOffPage         = panel.pillar === 'off_page';
  const isMonitoring      = panel.pillar === 'monitoring';

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

      {/* Phase 15 — Technical audit affordances */}
      {isTechnicalAudit && isActive && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(160,160,180,0.08)' }}>
          {panel.target_url ? (
            <div style={{ fontSize: 9.5, color: 'rgba(150,150,170,0.85)', marginBottom: 6, wordBreak: 'break-all' }}>
              <span style={{ opacity: 0.6 }}>URL:</span> {panel.target_url}
              {panel.target_url_source && (
                <span style={{ opacity: 0.5, marginLeft: 4 }}>({panel.target_url_source})</span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 9.5, color: 'rgba(251, 146, 60, 0.85)', marginBottom: 6 }}>
              No target URL set — audits will be pending.
            </div>
          )}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onRunAudit?.(panel); }}
              disabled={auditBusy}
              title="Run a technical audit now"
              style={{
                padding: '4px 8px', borderRadius: 5, fontSize: 9.5, fontWeight: 700,
                border: `1px solid hsla(${statusHue} / 0.35)`,
                background: `hsla(${statusHue} / 0.10)`, color: `hsl(${statusHue})`,
                cursor: auditBusy ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
              {auditBusy ? <Loader2 size={9} className="animate-spin" /> : <Activity size={9} />}
              {auditBusy ? 'Running…' : 'Run audit now'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSetTargetUrl?.(panel); }}
              title="Set a target URL manually"
              style={{
                padding: '4px 8px', borderRadius: 5, fontSize: 9.5, fontWeight: 700,
                border: '1px solid rgba(160,160,180,0.25)',
                background: 'transparent', color: 'rgba(180,180,200,0.85)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
              <Target size={9} />
              {panel.target_url ? 'Change URL' : 'Set URL'}
            </button>
          </div>
        </div>
      )}

      {/* Phase 16 — Cluster map affordances */}
      {isClusterMap && isActive && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(160,160,180,0.08)' }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onRunClusterMap?.(panel); }}
              disabled={clusterBusy}
              title="Cluster GSC queries into topical themes and identify coverage gaps"
              style={{
                padding: '4px 8px', borderRadius: 5, fontSize: 9.5, fontWeight: 700,
                border: `1px solid hsla(${statusHue} / 0.35)`,
                background: `hsla(${statusHue} / 0.10)`, color: `hsl(${statusHue})`,
                cursor: clusterBusy ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
              {clusterBusy ? <Loader2 size={9} className="animate-spin" /> : <Layers size={9} />}
              {clusterBusy ? 'Mapping…' : 'Generate cluster map'}
            </button>
          </div>
        </div>
      )}

      {/* Phase 17 — Internal linking affordances */}
      {isInternalLinking && isActive && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(160,160,180,0.08)' }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onRunInternalLinking?.(panel); }}
              disabled={linkingBusy}
              title="Audit the internal link graph: find orphans, generate source→target link recommendations"
              style={{
                padding: '4px 8px', borderRadius: 5, fontSize: 9.5, fontWeight: 700,
                border: `1px solid hsla(${statusHue} / 0.35)`,
                background: `hsla(${statusHue} / 0.10)`, color: `hsl(${statusHue})`,
                cursor: linkingBusy ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
              {linkingBusy ? <Loader2 size={9} className="animate-spin" /> : <Link2 size={9} />}
              {linkingBusy ? 'Auditing…' : 'Run linking audit'}
            </button>
          </div>
        </div>
      )}

      {/* Phase 18 — Off-page strategy affordances */}
      {isOffPage && isActive && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(160,160,180,0.08)' }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onRunOffPage?.(panel); }}
              disabled={offPageBusy}
              title="Generate off-page strategy: linkable assets, asset gaps, prospect categories, outreach angles"
              style={{
                padding: '4px 8px', borderRadius: 5, fontSize: 9.5, fontWeight: 700,
                border: `1px solid hsla(${statusHue} / 0.35)`,
                background: `hsla(${statusHue} / 0.10)`, color: `hsl(${statusHue})`,
                cursor: offPageBusy ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
              {offPageBusy ? <Loader2 size={9} className="animate-spin" /> : <ExternalLink size={9} />}
              {offPageBusy ? 'Generating…' : 'Generate off-page strategy'}
            </button>
          </div>
        </div>
      )}

      {/* Phase 19 — Monitoring affordances */}
      {isMonitoring && isActive && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(160,160,180,0.08)' }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onRunMonitoring?.(panel); }}
              disabled={monitoringBusy}
              title="Capture snapshot + compare against prior snapshot. Surfaces meaningful changes since last check."
              style={{
                padding: '4px 8px', borderRadius: 5, fontSize: 9.5, fontWeight: 700,
                border: `1px solid hsla(${statusHue} / 0.35)`,
                background: `hsla(${statusHue} / 0.10)`, color: `hsl(${statusHue})`,
                cursor: monitoringBusy ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
              {monitoringBusy ? <Loader2 size={9} className="animate-spin" /> : <TrendingUp size={9} />}
              {monitoringBusy ? 'Checking…' : 'Run monitoring check'}
            </button>
          </div>
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
              {report.llm_calls_used !== undefined && report.llm_calls_used > 0 && ` · ${report.llm_calls_used} LLM call${report.llm_calls_used === 1 ? '' : 's'}`}
              {report.web_searches_used !== undefined && report.web_searches_used > 0 && ` · ${report.web_searches_used} web search${report.web_searches_used === 1 ? '' : 'es'}`}
            </div>
            {(report.data_sources?.length || 0) > 0 && (
              <div style={{ fontSize: 10.5, color: 'rgba(150,150,170,0.7)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <span style={{ opacity: 0.6 }}>Sources:</span>
                {(report.data_sources || []).map((src, i) => (
                  <span key={i} style={{
                    padding: '1px 7px', borderRadius: 4, fontSize: 9.5,
                    background: 'rgba(186,200,255,0.08)', color: '#a5f3fc',
                    border: '1px solid rgba(186,200,255,0.15)', fontWeight: 600,
                  }}>{src}</span>
                ))}
              </div>
            )}
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
            {report.llm_calls_used !== undefined && report.llm_calls_used > 0 && ` · ${report.llm_calls_used} LLM call${report.llm_calls_used === 1 ? '' : 's'}`}
            {report.web_searches_used !== undefined && report.web_searches_used > 0 && ` · ${report.web_searches_used} web search${report.web_searches_used === 1 ? '' : 'es'}`}
          </div>
          {(report.data_sources?.length || 0) > 0 && (
            <div style={{ fontSize: 10.5, color: 'rgba(150,150,170,0.7)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ opacity: 0.6 }}>Sources:</span>
              {(report.data_sources || []).map((src, i) => (
                <span key={i} style={{
                  padding: '1px 7px', borderRadius: 4, fontSize: 9.5,
                  background: 'rgba(186,200,255,0.08)', color: '#a5f3fc',
                  border: '1px solid rgba(186,200,255,0.15)', fontWeight: 600,
                }}>{src}</span>
              ))}
            </div>
          )}
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

// ─────────────────────────────────────────────────────────────
// CAMPAIGN OBJECTIVES
// ─────────────────────────────────────────────────────────────

const OBJECTIVE_TYPES = [
  { type: 'keyword_ranking',    label: 'Keyword Ranking',    icon: '🏆', desc: 'Rank on page 1 for a target keyword',              metric: 'position',    unit: 'position' },
  { type: 'traffic_growth',     label: 'Traffic Growth',     icon: '📈', desc: 'Increase organic clicks to target pages',          metric: 'clicks',      unit: 'clicks/mo' },
  { type: 'local_visibility',   label: 'Local Visibility',   icon: '📍', desc: 'Rank in a specific city or region',                metric: 'position',    unit: 'position' },
  { type: 'domain_authority',   label: 'Domain Authority',   icon: '🔗', desc: 'Build site authority through link acquisition',    metric: 'da_score',    unit: 'DA score' },
  { type: 'technical_recovery', label: 'Technical Recovery', icon: '⚙️', desc: 'Resolve critical technical SEO issues site-wide', metric: 'cwv_score',   unit: 'issues' },
  { type: 'content_authority',  label: 'Content Authority',  icon: '✍️', desc: 'Build topical authority in a subject area',       metric: 'coverage',    unit: 'ranking pages' },
  { type: 'eeat',               label: 'E-E-A-T',            icon: '🎓', desc: 'Improve expertise, authority and trust signals',   metric: 'eeat_score',  unit: 'score' },
] as const;

type ObjectiveType = typeof OBJECTIVE_TYPES[number]['type'];

async function createObjective(params: {
  projectId: string;
  campaignType: ObjectiveType;
  title: string;
  keyword?: string;
  goalMetric?: string;
  goalTarget?: number;
  goalBaseline?: number;
  goalDeadline?: string;
  targetLocations?: any[];
  siteId?: string;
}) {
  try {
    const res = await fetch('/api/task-engine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bs_campaign_objective_create', ...params }),
    });
    return await res.json();
  } catch (e: any) { return { error: e?.message }; }
}

async function updateObjective(campaignId: string, updates: Record<string, unknown>) {
  try {
    const res = await fetch('/api/task-engine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bs_campaign_objective_update', campaignId, updates }),
    });
    return await res.json();
  } catch (e: any) { return { error: e?.message }; }
}

async function apiCall(action: string, payload: Record<string, unknown>) {
  try {
    const r = await fetch('/api/task-engine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    return await r.json();
  } catch { return {}; }
}

function ObjectivesView({
  projectId, campaigns, onRefresh,
}: {
  projectId: string;
  campaigns: SeoCampaign[];
  onRefresh: () => void;
}) {
  const [showNew,      setShowNew]      = React.useState(false);
  const [sites,        setSites]        = React.useState<any[]>([]);
  const [linkingId,    setLinkingId]    = React.useState<string | null>(null); // objective being linked
  const [saving,       setSaving]       = React.useState(false);

  // Load site workspaces for the link picker
  React.useEffect(() => {
    apiCall('site_list', { projectId }).then(r => setSites(r.sites || []));
  }, [projectId]);

  const linkSite = async (campaignId: string, siteId: string | null) => {
    setSaving(true);
    await apiCall('bs_campaign_objective_update', { campaignId, updates: { site_id: siteId } });
    setSaving(false);
    setLinkingId(null);
    onRefresh();
  };

  // Group campaigns by type
  const objectives = campaigns.filter(c => c.campaign_type && c.campaign_type !== 'keyword_ranking');
  const keywordCampaigns = campaigns.filter(c => !c.campaign_type || c.campaign_type === 'keyword_ranking');

  const getProgress = (c: SeoCampaign) => {
    if (c.goal_target === null || c.goal_baseline === null) return null;
    const current = c.current_position ?? c.goal_baseline;
    const baseline = c.goal_baseline;
    const target   = c.goal_target;

    // For position-based: lower is better
    const isPositionMetric = c.goal_metric === 'position';
    if (isPositionMetric) {
      const range = baseline - target;
      if (range <= 0) return null;
      const moved = baseline - current;
      return Math.max(0, Math.min(100, Math.round((moved / range) * 100)));
    }
    // For everything else: higher is better
    const range = target - baseline;
    if (range <= 0) return null;
    const moved = current - baseline;
    return Math.max(0, Math.min(100, Math.round((moved / range) * 100)));
  };

  const typeInfo = (type: string) => OBJECTIVE_TYPES.find(t => t.type === type);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
          Campaign objectives track strategic goals — traffic growth, rankings, authority, technical health.
        </p>
        <button type="button" onClick={() => setShowNew(true)} style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 10, fontSize: 11, fontWeight: 600,
          background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))',
          border: 'none', cursor: 'pointer',
        }}>
          + New objective
        </button>
      </div>

      {/* Objective cards */}
      {objectives.length === 0 && keywordCampaigns.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', borderRadius: 16,
          border: '1px solid hsl(var(--border))',
          background: 'hsl(var(--card)/0.3)',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No objectives yet</div>
          <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
            Create your first objective — traffic growth, local ranking, domain authority, or a technical recovery.
          </p>
        </div>
      )}

      {/* Non-keyword objectives */}
      {objectives.map(c => {
        const info  = typeInfo(c.campaign_type || '');
        const pct   = getProgress(c);
        const locs  = Array.isArray(c.target_locations) ? c.target_locations : [];
        const statusColor = c.status === 'active' ? '#34d399' : c.status === 'paused' ? '#f59e0b' : '#94a3b8';
        return (
          <div key={c.id} style={{
            borderRadius: 16, border: '1px solid hsl(var(--border))',
            background: 'hsl(var(--card)/0.4)', overflow: 'hidden',
          }}>
            {/* Card header */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid hsl(var(--border)/0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{info?.icon || '🎯'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.goal || c.keyword}</span>
                    <span style={{
                      fontSize: 9, padding: '2px 8px', borderRadius: 8, fontWeight: 700,
                      background: statusColor + '22', color: statusColor, textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>{c.status}</span>
                    <span style={{
                      fontSize: 9, padding: '2px 8px', borderRadius: 8,
                      background: 'hsl(var(--muted)/0.5)', color: 'hsl(var(--muted-foreground))',
                    }}>{info?.label || c.campaign_type}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                    {c.goal_metric && (
                      <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
                        Metric: {c.goal_metric}
                      </span>
                    )}
                    {c.goal_baseline !== null && c.goal_target !== null && (
                      <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
                        {c.goal_baseline} → {c.goal_target} {info?.unit}
                      </span>
                    )}
                    {c.goal_deadline && (
                      <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
                        Due: {new Date(c.goal_deadline).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {locs.length > 0 && (
                      <span style={{ fontSize: 10, color: '#60a5fa' }}>
                        📍 {locs.map((l: any) => l.city || l.region || l.country).filter(Boolean).join(', ')}
                      </span>
                    )}
                    {c.site_id ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: '#a78bfa' }}>🌐 {sites.find(s => s.id === c.site_id)?.label || 'Site linked'}</span>
                        <button type="button"
                          onClick={() => setLinkingId(linkingId === c.id ? null : c.id)}
                          style={{ fontSize: 9, color: 'hsl(var(--muted-foreground))', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', borderRadius: 4 }}>
                          change
                        </button>
                        <button type="button"
                          onClick={() => linkSite(c.id, null)}
                          style={{ fontSize: 9, color: 'hsl(var(--muted-foreground))', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', borderRadius: 4 }}>
                          unlink
                        </button>
                      </span>
                    ) : (
                      <button type="button"
                        onClick={() => setLinkingId(linkingId === c.id ? null : c.id)}
                        style={{
                          fontSize: 10, color: 'hsl(var(--primary))', background: 'hsl(var(--primary)/0.08)',
                          border: '1px solid hsl(var(--primary)/0.25)', borderRadius: 6,
                          padding: '2px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                        🌐 Link site workspace
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              {pct !== null && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>Progress to goal</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: pct >= 80 ? '#34d399' : pct >= 40 ? '#f59e0b' : '#94a3b8' }}>
                      {pct}%
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 4, background: 'hsl(var(--muted)/0.4)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4, transition: 'width 0.5s',
                      width: pct + '%',
                      background: pct >= 80 ? '#34d399' : pct >= 40 ? '#f59e0b' : 'hsl(var(--primary))',
                    }} />
                  </div>
                </div>
              )}

              {/* Site workspace picker — shown when Link button is clicked */}
              {linkingId === c.id && (
                <div style={{ marginTop: 12, padding: '12px', borderRadius: 10, background: 'hsl(var(--background)/0.8)', border: '1px solid hsl(var(--border))' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'hsl(var(--muted-foreground))', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Select site workspace
                  </div>
                  {sites.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                      No site workspaces yet — create one in Site Manager first.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {sites.map((s: any) => (
                        <button key={s.id} type="button"
                          onClick={() => linkSite(c.id, s.id)}
                          disabled={saving}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                            border: c.site_id === s.id ? '1px solid hsl(var(--primary)/0.5)' : '1px solid hsl(var(--border))',
                            background: c.site_id === s.id ? 'hsl(var(--primary)/0.08)' : 'transparent',
                            textAlign: 'left',
                          }}>
                          <span style={{ fontSize: 14 }}>🌐</span>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
                            {s.domain && <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>{s.domain}</div>}
                          </div>
                          {c.site_id === s.id && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'hsl(var(--primary))' }}>✓ linked</span>}
                        </button>
                      ))}
                      <button type="button" onClick={() => setLinkingId(null)}
                        style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', textAlign: 'left' }}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Keyword campaigns section */}
      {keywordCampaigns.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Keyword Ranking Campaigns ({keywordCampaigns.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {keywordCampaigns.map(c => {
              const pct = c.current_position !== null && c.target_position !== null
                ? Math.max(0, Math.min(100, Math.round(((100 - c.current_position) / (100 - c.target_position)) * 50)))
                : null;
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  borderRadius: 12, border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--card)/0.3)',
                }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>🏆</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      "{c.keyword}"
                    </div>
                    {c.current_position !== null && (
                      <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
                        Position {Math.round(c.current_position)}
                        {c.target_position !== null && ` → target: ${c.target_position}`}
                      </div>
                    )}
                  </div>
                  {pct !== null && (
                    <div style={{ width: 60, height: 3, borderRadius: 3, background: 'hsl(var(--muted)/0.4)', flexShrink: 0 }}>
                      <div style={{ height: '100%', borderRadius: 3, width: pct + '%', background: 'hsl(var(--primary))' }} />
                    </div>
                  )}
                  <span style={{
                    fontSize: 9, padding: '2px 8px', borderRadius: 8, fontWeight: 700, flexShrink: 0,
                    background: c.status === 'active' ? 'rgba(52,211,153,0.12)' : 'rgba(148,163,184,0.1)',
                    color:      c.status === 'active' ? '#34d399' : '#94a3b8',
                  }}>{c.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNew && (
        <NewObjectiveModal
          projectId={projectId}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

function NewObjectiveModal({
  projectId, onClose, onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step,       setStep]       = React.useState<'type' | 'details'>('type');
  const [selType,    setSelType]    = React.useState<ObjectiveType | null>(null);
  const [title,      setTitle]      = React.useState('');
  const [keyword,    setKeyword]    = React.useState('');
  const [goalTarget, setGoalTarget] = React.useState('');
  const [baseline,   setBaseline]   = React.useState('');
  const [deadline,   setDeadline]   = React.useState('');
  const [city,       setCity]       = React.useState('');
  const [country,    setCountry]    = React.useState('');
  const [saving,     setSaving]     = React.useState(false);
  const [err,        setErr]        = React.useState('');

  const typeInfo = selType ? OBJECTIVE_TYPES.find(t => t.type === selType) : null;

  const save = async () => {
    if (!selType) return;
    if (!title.trim() && selType !== 'keyword_ranking') { setErr('Title is required'); return; }
    if (selType === 'keyword_ranking' && !keyword.trim()) { setErr('Keyword is required'); return; }
    setSaving(true); setErr('');
    const locs = city.trim() ? [{ city: city.trim(), country: country.trim() || undefined }] : undefined;
    const r = await createObjective({
      projectId,
      campaignType: selType,
      title:        title.trim() || keyword.trim(),
      keyword:      keyword.trim() || undefined,
      goalTarget:   goalTarget ? Number(goalTarget) : undefined,
      goalBaseline: baseline  ? Number(baseline)   : undefined,
      goalDeadline: deadline  || undefined,
      goalMetric:   typeInfo?.metric,
      targetLocations: locs,
    });
    setSaving(false);
    if (r.error) { setErr(r.error); return; }
    onCreated();
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 50,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
  };
  const panelStyle: React.CSSProperties = {
    width: '100%', maxWidth: 520,
    background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
    borderRadius: 20, boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
    padding: 24, display: 'flex', flexDirection: 'column', gap: 20,
    maxHeight: '90vh', overflowY: 'auto',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 12,
    border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: 'hsl(var(--muted-foreground))', marginBottom: 6,
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {step === 'type' ? 'New Campaign Objective' : `New ${typeInfo?.label} Objective`}
            </div>
            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
              {step === 'type' ? 'Choose the type of objective' : typeInfo?.desc}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'hsl(var(--muted-foreground))', fontSize: 16,
          }}>✕</button>
        </div>

        {step === 'type' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {OBJECTIVE_TYPES.map(t => (
              <button key={t.type} type="button"
                onClick={() => { setSelType(t.type); setStep('details'); }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  gap: 6, padding: '14px 14px', borderRadius: 14, cursor: 'pointer',
                  border: '1px solid hsl(var(--border))', background: 'hsl(var(--card)/0.5)',
                  textAlign: 'left', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as any).style.borderColor = 'hsl(var(--primary)/0.5)'; (e.currentTarget as any).style.background = 'hsl(var(--primary)/0.05)'; }}
                onMouseLeave={e => { (e.currentTarget as any).style.borderColor = 'hsl(var(--border))'; (e.currentTarget as any).style.background = 'hsl(var(--card)/0.5)'; }}
              >
                <span style={{ fontSize: 22 }}>{t.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginTop: 2, lineHeight: 1.4 }}>{t.desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 'details' && selType && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <button type="button" onClick={() => setStep('type')} style={{
              alignSelf: 'flex-start', fontSize: 11, color: 'hsl(var(--muted-foreground))',
              background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}>← Back</button>

            {/* Only ask for what's essential — everything else can be added later */}
            {selType === 'keyword_ranking' ? (
              <div>
                <label style={labelStyle}>Target keyword *</label>
                <input value={keyword} onChange={e => setKeyword(e.target.value)}
                  placeholder="e.g. ottoman bed UK" autoFocus style={inputStyle} />
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Objective name *</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder={typeInfo?.desc} autoFocus style={inputStyle} />
              </div>
            )}

            {(selType === 'local_visibility') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Target city</label>
                  <input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. London" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Country</label>
                  <input value={country} onChange={e => setCountry(e.target.value)} placeholder="GB" maxLength={2} style={inputStyle} />
                </div>
              </div>
            )}

            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', background: 'hsl(var(--muted)/0.3)', padding: '10px 12px', borderRadius: 10 }}>
              Baseline, target, and deadline can be set after creation once you have the data.
            </div>

            {err && <div style={{ fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 8 }}>{err}</div>}

            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              <button type="button" onClick={onClose} style={{
                flex: 1, padding: '10px 0', borderRadius: 12, fontSize: 12,
                border: '1px solid hsl(var(--border))', background: 'transparent',
                color: 'hsl(var(--muted-foreground))', cursor: 'pointer',
              }}>Cancel</button>
              <button type="button" onClick={save} disabled={saving} style={{
                flex: 2, padding: '10px 0', borderRadius: 12, fontSize: 12, fontWeight: 600,
                background: saving ? 'hsl(var(--muted))' : 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))', border: 'none', cursor: saving ? 'default' : 'pointer',
              }}>
                {saving ? 'Creating…' : 'Create objective'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
