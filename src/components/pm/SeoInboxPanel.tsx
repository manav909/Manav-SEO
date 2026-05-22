/* ════════════════════════════════════════════════════════════════
   src/components/pm/SeoInboxPanel.tsx — Phase 22

   Operator surface that aggregates everything the 7 pillars produce
   across all campaigns. Two sections:

     1. Opportunities Inbox — filter, bulk-select, bulk-dismiss/promote,
        click through to source campaign drawer
     2. Report Search — cross-pillar full-text search with pillar/tag filter

   This is the "what needs my attention RIGHT NOW" view. Without it,
   operators have to walk every campaign drawer one at a time.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Inbox, Search, Filter, CheckSquare, Square, XCircle, ChevronRight,
  Loader2, AlertCircle, ExternalLink, Trash2, Sparkles, FileText,
  Calendar, Tag, Layers, X, RefreshCw, ChevronDown,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  seoOpportunityList, seoOpportunityBulkUpdate, seoOpportunityPromoteToCampaign,
  seoCampaignList, seoReportSearch,
  type SeoOpportunity, type SeoCampaign,
} from './api';

interface Props {
  projectId: string;
}

type ValueFilter = 'all' | 'high' | 'medium' | 'low';
type StatusFilter = 'open' | 'reviewed' | 'dismissed' | 'promoted' | 'all';
type KindFilter   = 'all' | 'keyword' | 'traffic' | 'content_gap' | 'quick_win' | 'technical' | 'competitor_move' | 'backlink' | 'cluster_expansion';
type DateFilter   = 'all' | '24h' | '7d' | '30d';

const KIND_LABEL: Record<string, string> = {
  keyword:            'Keyword',
  traffic:            'Traffic',
  content_gap:        'Content gap',
  quick_win:          'Quick win',
  technical:          'Technical',
  competitor_move:    'Competitor move',
  backlink:           'Backlink',
  cluster_expansion:  'Cluster expansion',
};

const PILLAR_LABEL: Record<string, string> = {
  research:         'Research',
  technical_audit:  'Technical Audit',
  cluster_map:      'Cluster Map',
  content:          'Content',
  internal_linking: 'Internal Linking',
  off_page:         'Off-Page',
  monitoring:       'Monitoring',
};

export default function SeoInboxPanel({ projectId }: Props) {
  /* ─── Section toggle ─── */
  const [section, setSection] = useState<'inbox' | 'search'>('inbox');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(160,160,180,0.15)' }}>
        <SectionTab
          label="Opportunities Inbox" icon={<Inbox size={14} />}
          active={section === 'inbox'} onClick={() => setSection('inbox')}
        />
        <SectionTab
          label="Search Reports" icon={<Search size={14} />}
          active={section === 'search'} onClick={() => setSection('search')}
        />
      </div>

      {section === 'inbox' && <InboxSection projectId={projectId} />}
      {section === 'search' && <SearchSection projectId={projectId} />}
    </div>
  );
}

function SectionTab({ label, icon, active, onClick }: { label: string; icon: any; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6,
        background: 'transparent', border: 'none', borderBottom: active ? '2px solid hsl(186 80% 60%)' : '2px solid transparent',
        marginBottom: -1, color: active ? 'hsl(186 80% 75%)' : 'rgba(170,170,190,0.7)',
        fontWeight: 700, fontSize: 13, cursor: 'pointer',
      }}>
      {icon} {label}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════
   INBOX SECTION
═══════════════════════════════════════════════════════════════ */

function InboxSection({ projectId }: { projectId: string }) {
  const [opportunities, setOpportunities] = useState<SeoOpportunity[]>([]);
  const [campaigns, setCampaigns]         = useState<SeoCampaign[]>([]);
  const [counts, setCounts]               = useState<any>({ open: 0, reviewed: 0, dismissed: 0, promoted: 0 });
  const [countsByKind, setCountsByKind]   = useState<Record<string, number>>({});
  const [countsByValue, setCountsByValue] = useState<Record<string, number>>({});
  const [countsByCampaign, setCountsByCampaign] = useState<Record<string, number>>({});
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());

  /* Filters */
  const [statusFilter, setStatusFilter]     = useState<StatusFilter>('open');
  const [kindFilter, setKindFilter]         = useState<KindFilter>('all');
  const [valueFilter, setValueFilter]       = useState<ValueFilter>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [dateFilter, setDateFilter]         = useState<DateFilter>('all');

  const { toast } = useToast();

  /* Load campaigns once for the filter dropdown */
  useEffect(() => {
    seoCampaignList({ projectId }).then(r => {
      if (r.campaigns) setCampaigns(r.campaigns);
    });
  }, [projectId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const discoveredSince = dateFilter === 'all' ? undefined
                            : dateFilter === '24h' ? new Date(Date.now() - 86_400_000).toISOString()
                            : dateFilter === '7d'  ? new Date(Date.now() - 7 * 86_400_000).toISOString()
                            :                        new Date(Date.now() - 30 * 86_400_000).toISOString();
      const r = await seoOpportunityList({
        projectId,
        status:           statusFilter,
        kind:             kindFilter,
        estimatedValue:   valueFilter,
        sourceCampaignId: campaignFilter !== 'all' ? campaignFilter : undefined,
        discoveredSince,
        limit:            200,
      });
      if (r.error) {
        setError(r.error);
      } else {
        setOpportunities(r.opportunities || []);
        setCounts(r.counts || {});
        setCountsByKind(r.counts_by_kind || {});
        setCountsByValue(r.counts_by_value || {});
        setCountsByCampaign(r.counts_by_campaign || {});
      }
    } catch (e: any) {
      setError(e?.message || 'load failed');
    }
    setLoading(false);
  }, [projectId, statusFilter, kindFilter, valueFilter, campaignFilter, dateFilter]);

  useEffect(() => { load(); }, [load]);

  /* ─── Bulk actions ─── */

  const handleBulkDismiss = async () => {
    if (selectedIds.size === 0) return;
    const reason = prompt(`Dismiss ${selectedIds.size} opportunit${selectedIds.size === 1 ? 'y' : 'ies'}? Reason (optional):`);
    if (reason === null) return;       // user cancelled
    const r = await seoOpportunityBulkUpdate({
      opportunityIds: Array.from(selectedIds),
      status:         'dismissed',
      dismissedReason: reason || undefined,
    });
    if (r.error) {
      toast({ title: 'Bulk dismiss failed', description: r.error, variant: 'destructive' });
      return;
    }
    toast({ title: `Dismissed ${r.updated_count || selectedIds.size} opportunit${selectedIds.size === 1 ? 'y' : 'ies'}` });
    await load();
  };

  const handleBulkMarkReviewed = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Mark ${selectedIds.size} opportunit${selectedIds.size === 1 ? 'y' : 'ies'} as reviewed?`)) return;
    const r = await seoOpportunityBulkUpdate({
      opportunityIds: Array.from(selectedIds),
      status:         'reviewed',
    });
    if (r.error) {
      toast({ title: 'Bulk update failed', description: r.error, variant: 'destructive' });
      return;
    }
    toast({ title: `Marked ${r.updated_count || selectedIds.size} as reviewed` });
    await load();
  };

  const handlePromote = async (oppId: string) => {
    const r = await seoOpportunityPromoteToCampaign({ opportunityId: oppId });
    if (r.error) {
      toast({ title: 'Promote failed', description: r.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Promoted to campaign', description: 'New campaign created.' });
    await load();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === opportunities.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(opportunities.map(o => o.id)));
    }
  };

  /* Campaign lookup for displaying keyword names */
  const campaignByIdMap = useMemo(() => {
    const m: Record<string, SeoCampaign> = {};
    for (const c of campaigns) m[c.id] = c;
    return m;
  }, [campaigns]);

  const activeCampaignsWithOpps = campaigns.filter(c => (countsByCampaign[c.id] || 0) > 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
      {/* Filter sidebar */}
      <aside style={{
        position: 'sticky', top: 16, alignSelf: 'start',
        padding: 14, borderRadius: 10,
        background: 'rgba(15,16,24,0.5)',
        border: '1px solid rgba(160,160,180,0.12)',
        maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 12, fontWeight: 700, color: 'rgba(220,220,235,0.95)' }}>
          <Filter size={12} /> Filters
        </div>

        <FilterGroup label="Status">
          <FilterPill label={`Open (${counts.open || 0})`}        active={statusFilter === 'open'}      onClick={() => setStatusFilter('open')} />
          <FilterPill label={`Reviewed (${counts.reviewed || 0})`} active={statusFilter === 'reviewed'}  onClick={() => setStatusFilter('reviewed')} />
          <FilterPill label={`Promoted (${counts.promoted || 0})`} active={statusFilter === 'promoted'}  onClick={() => setStatusFilter('promoted')} />
          <FilterPill label={`Dismissed (${counts.dismissed || 0})`} active={statusFilter === 'dismissed'} onClick={() => setStatusFilter('dismissed')} />
          <FilterPill label="All"                                  active={statusFilter === 'all'}      onClick={() => setStatusFilter('all')} />
        </FilterGroup>

        <FilterGroup label="Estimated value">
          <FilterPill label={`High (${countsByValue.high || 0})`}     active={valueFilter === 'high'}   onClick={() => setValueFilter('high')} />
          <FilterPill label={`Medium (${countsByValue.medium || 0})`} active={valueFilter === 'medium'} onClick={() => setValueFilter('medium')} />
          <FilterPill label={`Low (${countsByValue.low || 0})`}       active={valueFilter === 'low'}    onClick={() => setValueFilter('low')} />
          <FilterPill label="All"                                     active={valueFilter === 'all'}    onClick={() => setValueFilter('all')} />
        </FilterGroup>

        <FilterGroup label="Kind">
          <FilterPill label="All" active={kindFilter === 'all'} onClick={() => setKindFilter('all')} />
          {Object.entries(KIND_LABEL).map(([k, label]) => {
            const n = countsByKind[k] || 0;
            if (n === 0 && kindFilter !== k) return null;
            return (
              <FilterPill key={k} label={`${label} (${n})`}
                active={kindFilter === k as KindFilter}
                onClick={() => setKindFilter(k as KindFilter)} />
            );
          })}
        </FilterGroup>

        <FilterGroup label="Discovered">
          <FilterPill label="All time" active={dateFilter === 'all'} onClick={() => setDateFilter('all')} />
          <FilterPill label="Last 24h" active={dateFilter === '24h'} onClick={() => setDateFilter('24h')} />
          <FilterPill label="Last 7d"  active={dateFilter === '7d'}  onClick={() => setDateFilter('7d')} />
          <FilterPill label="Last 30d" active={dateFilter === '30d'} onClick={() => setDateFilter('30d')} />
        </FilterGroup>

        {activeCampaignsWithOpps.length > 0 && (
          <FilterGroup label="Campaign">
            <FilterPill label="All"
              active={campaignFilter === 'all'}
              onClick={() => setCampaignFilter('all')} />
            {activeCampaignsWithOpps.map(c => (
              <FilterPill key={c.id}
                label={`"${c.keyword}" (${countsByCampaign[c.id] || 0})`}
                active={campaignFilter === c.id}
                onClick={() => setCampaignFilter(c.id)} />
            ))}
          </FilterGroup>
        )}

        <button onClick={load} disabled={loading} style={{
          marginTop: 12, width: '100%',
          padding: '8px 12px', borderRadius: 7,
          background: 'rgba(160,160,180,0.08)',
          border: '1px solid rgba(160,160,180,0.2)',
          color: 'rgba(200,200,220,0.9)',
          fontSize: 11, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        }}>
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Refresh
        </button>
      </aside>

      {/* Main inbox */}
      <main>
        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
            padding: '10px 14px', borderRadius: 8,
            background: 'hsla(186 80% 55% / 0.10)',
            border: '1px solid hsla(186 80% 55% / 0.30)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'hsl(186 80% 75%)' }}>
              {selectedIds.size} selected
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={handleBulkMarkReviewed} style={bulkBtnStyle('152 70% 55%')}>
              <CheckSquare size={12} /> Mark reviewed
            </button>
            <button onClick={handleBulkDismiss} style={bulkBtnStyle('0 75% 60%')}>
              <Trash2 size={12} /> Dismiss
            </button>
            <button onClick={() => setSelectedIds(new Set())} style={{
              padding: '6px 10px', borderRadius: 6,
              background: 'transparent', border: '1px solid rgba(160,160,180,0.2)',
              color: 'rgba(170,170,190,0.8)', fontSize: 11, cursor: 'pointer',
            }}>
              <X size={11} />
            </button>
          </div>
        )}

        {/* Header with select-all + count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          {opportunities.length > 0 && (
            <button onClick={toggleSelectAll} style={{
              padding: 4, background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'rgba(170,170,190,0.8)', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11,
            }}>
              {selectedIds.size === opportunities.length
                ? <CheckSquare size={14} />
                : <Square size={14} />}
              Select all
            </button>
          )}
          <div style={{ fontSize: 12, color: 'rgba(150,150,170,0.85)' }}>
            Showing {opportunities.length} opportunit{opportunities.length === 1 ? 'y' : 'ies'}
            {statusFilter !== 'all' && ` · ${statusFilter}`}
            {kindFilter !== 'all' && ` · ${KIND_LABEL[kindFilter]}`}
            {valueFilter !== 'all' && ` · ${valueFilter} value`}
          </div>
        </div>

        {error && (
          <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)', color: 'rgba(255,180,180,0.9)', fontSize: 12, marginBottom: 12 }}>
            <AlertCircle size={12} style={{ display: 'inline', marginRight: 5 }} /> {error}
          </div>
        )}

        {loading && opportunities.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(150,150,170,0.7)' }}>
            <Loader2 size={20} className="animate-spin" style={{ display: 'inline' }} />
            <div style={{ marginTop: 8, fontSize: 12 }}>Loading opportunities…</div>
          </div>
        ) : opportunities.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', color: 'rgba(150,150,170,0.7)',
            borderRadius: 10, border: '1px dashed rgba(160,160,180,0.2)',
          }}>
            <Inbox size={28} style={{ display: 'inline', opacity: 0.4 }} />
            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700 }}>No opportunities match these filters.</div>
            <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
              Try widening the filters, or run audits on your campaigns to generate signals.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {opportunities.map(opp => (
              <OpportunityCard
                key={opp.id}
                opp={opp}
                selected={selectedIds.has(opp.id)}
                onToggleSelect={() => toggleSelect(opp.id)}
                onPromote={() => handlePromote(opp.id)}
                campaign={opp.source_campaign_id ? campaignByIdMap[opp.source_campaign_id] : undefined}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: any }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(160,160,180,0.7)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {children}
      </div>
    </div>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'left',
      padding: '5px 9px', borderRadius: 6,
      background: active ? 'hsla(186 80% 55% / 0.15)' : 'transparent',
      border: active ? '1px solid hsla(186 80% 55% / 0.30)' : '1px solid transparent',
      color: active ? 'hsl(186 80% 80%)' : 'rgba(170,170,190,0.75)',
      fontSize: 11, fontWeight: active ? 700 : 500,
      cursor: 'pointer',
    }}>
      {label}
    </button>
  );
}

function bulkBtnStyle(hue: string): React.CSSProperties {
  return {
    padding: '6px 10px', borderRadius: 6,
    background: `hsla(${hue} / 0.12)`,
    border: `1px solid hsla(${hue} / 0.35)`,
    color: `hsl(${hue})`,
    fontSize: 11, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 4,
  };
}

function OpportunityCard({ opp, selected, onToggleSelect, onPromote, campaign }: {
  opp: SeoOpportunity;
  selected: boolean;
  onToggleSelect: () => void;
  onPromote: () => void;
  campaign?: SeoCampaign;
}) {
  const [expanded, setExpanded] = useState(false);
  const valueHue = opp.estimated_value === 'high'   ? '0 75% 60%'
                 : opp.estimated_value === 'medium' ? '38 85% 60%'
                 :                                    '210 25% 55%';
  const ageDays = Math.round((Date.now() - new Date(opp.discovered_at).getTime()) / 86_400_000);
  const ageLabel = ageDays === 0 ? 'today'
                 : ageDays === 1 ? '1d ago'
                 :                 `${ageDays}d ago`;

  return (
    <div style={{
      padding: 12, borderRadius: 9,
      background: selected ? 'hsla(186 80% 55% / 0.06)' : 'rgba(15,16,24,0.45)',
      border: `1px solid ${selected ? 'hsla(186 80% 55% / 0.35)' : 'rgba(160,160,180,0.10)'}`,
      display: 'flex', gap: 10,
    }}>
      {/* Checkbox */}
      <button onClick={onToggleSelect} style={{
        padding: 2, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(170,170,190,0.8)',
        marginTop: 1,
      }}>
        {selected ? <CheckSquare size={15} /> : <Square size={15} />}
      </button>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top row: kind + value badges, age */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: 'rgba(160,160,180,0.10)',
            color: 'rgba(190,190,210,0.85)',
            textTransform: 'uppercase', letterSpacing: 0.4,
          }}>
            {KIND_LABEL[opp.kind] || opp.kind}
          </span>
          {opp.estimated_value && (
            <span style={{
              fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: `hsla(${valueHue} / 0.15)`,
              color: `hsl(${valueHue})`,
              textTransform: 'uppercase', letterSpacing: 0.4,
            }}>
              {opp.estimated_value} value
            </span>
          )}
          {opp.estimated_effort && (
            <span style={{ fontSize: 9.5, color: 'rgba(150,150,170,0.7)' }}>
              {opp.estimated_effort} effort
            </span>
          )}
          {opp.status !== 'open' && (
            <span style={{
              fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: opp.status === 'dismissed' ? 'rgba(120,120,140,0.10)' : 'rgba(152,180,255,0.10)',
              color: opp.status === 'dismissed' ? 'rgba(150,150,170,0.7)' : 'rgba(180,200,255,0.85)',
              textTransform: 'uppercase',
            }}>
              {opp.status}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'rgba(140,140,160,0.6)' }}>
            <Calendar size={9} style={{ display: 'inline', marginRight: 3 }} />
            {ageLabel}
          </span>
        </div>

        {/* Title */}
        <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(230,230,245,0.95)', marginBottom: 4, lineHeight: 1.4 }}>
          {opp.title}
        </div>

        {/* Source campaign */}
        {campaign && (
          <div style={{ fontSize: 10.5, color: 'rgba(160,160,180,0.7)', marginBottom: 4 }}>
            <Sparkles size={9} style={{ display: 'inline', marginRight: 4 }} />
            from campaign: <span style={{ color: 'rgba(200,200,220,0.85)', fontWeight: 600 }}>"{campaign.keyword}"</span>
          </div>
        )}

        {/* Description (collapsed by default) */}
        {opp.description && (
          <div style={{
            fontSize: 11.5, color: 'rgba(170,170,190,0.78)', lineHeight: 1.5,
            marginTop: 6,
            maxHeight: expanded ? 'none' : 50, overflow: 'hidden',
            position: 'relative',
          }}>
            {opp.description}
            {!expanded && opp.description.length > 120 && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 20,
                background: 'linear-gradient(180deg, transparent 0%, rgba(15,16,24,0.95) 100%)',
              }} />
            )}
          </div>
        )}

        {/* Evidence preview (when expanded) */}
        {expanded && opp.evidence && (
          <div style={{
            marginTop: 8, padding: 8, borderRadius: 6,
            background: 'rgba(15,16,24,0.6)',
            border: '1px solid rgba(160,160,180,0.1)',
            fontSize: 10.5, color: 'rgba(160,160,180,0.7)', fontFamily: 'monospace',
            maxHeight: 180, overflow: 'auto',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: 'rgba(200,200,220,0.85)' }}>Evidence:</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(opp.evidence, null, 2)}
            </pre>
          </div>
        )}

        {/* Action row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setExpanded(!expanded)} style={{
            padding: '4px 8px', borderRadius: 5,
            background: 'transparent', border: '1px solid rgba(160,160,180,0.18)',
            color: 'rgba(170,170,190,0.75)', fontSize: 10.5, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <ChevronDown size={9} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            {expanded ? 'Less' : 'More'}
          </button>
          {opp.status === 'open' && opp.suggested_action === 'new_campaign' && (
            <button onClick={onPromote} style={{
              padding: '4px 10px', borderRadius: 5,
              background: 'hsla(186 80% 55% / 0.12)',
              border: '1px solid hsla(186 80% 55% / 0.35)',
              color: 'hsl(186 80% 75%)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <Sparkles size={9} /> Promote to campaign
            </button>
          )}
          {opp.suggested_action && opp.suggested_action !== 'new_campaign' && (
            <span style={{ fontSize: 10, color: 'rgba(150,150,170,0.6)' }}>
              suggested: {opp.suggested_action.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SEARCH SECTION
═══════════════════════════════════════════════════════════════ */

function SearchSection({ projectId }: { projectId: string }) {
  const [query, setQuery]   = useState('');
  const [pillar, setPillar] = useState<string>('all');
  const [tag, setTag]       = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    const r = await seoReportSearch({
      projectId,
      query:  query.trim() || undefined,
      pillar: pillar !== 'all' ? pillar : undefined,
      tag:    tag.trim() || undefined,
      limit:  100,
    });
    if (r.error) setError(r.error);
    else setResults(r.reports || []);
    setLoading(false);
  };

  return (
    <div>
      {/* Search bar */}
      <div style={{
        padding: 14, borderRadius: 10,
        background: 'rgba(15,16,24,0.5)',
        border: '1px solid rgba(160,160,180,0.12)',
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(220,220,235,0.95)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={12} /> Search all pillar reports
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Search title, summary, content…"
            style={inputStyle({ flex: 2, minWidth: 240 })}
          />
          <select
            value={pillar}
            onChange={e => setPillar(e.target.value)}
            style={inputStyle({ flex: 1, minWidth: 140 })}
          >
            <option value="all">All pillars</option>
            {Object.entries(PILLAR_LABEL).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <input
            type="text"
            value={tag}
            onChange={e => setTag(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Tag filter (e.g. has_red)"
            style={inputStyle({ flex: 1, minWidth: 140 })}
          />
          <button onClick={handleSearch} disabled={loading} style={{
            padding: '8px 16px', borderRadius: 7,
            background: 'hsla(186 80% 55% / 0.15)',
            border: '1px solid hsla(186 80% 55% / 0.35)',
            color: 'hsl(186 80% 75%)',
            fontSize: 12, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Search
          </button>
        </div>
        <div style={{ fontSize: 10.5, color: 'rgba(150,150,170,0.7)', marginTop: 10 }}>
          Leave fields empty to see all reports. Use the tag filter for tags like <code style={{ background: 'rgba(160,160,180,0.1)', padding: '1px 4px', borderRadius: 3 }}>has_red</code>, <code style={{ background: 'rgba(160,160,180,0.1)', padding: '1px 4px', borderRadius: 3 }}>aspirational</code>, or specific keyword tags.
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)', color: 'rgba(255,180,180,0.9)', fontSize: 12, marginBottom: 12 }}>
          <AlertCircle size={12} style={{ display: 'inline', marginRight: 5 }} /> {error}
        </div>
      )}

      {!hasSearched && (
        <div style={{
          padding: 40, textAlign: 'center', color: 'rgba(150,150,170,0.7)',
          borderRadius: 10, border: '1px dashed rgba(160,160,180,0.2)',
        }}>
          <Search size={28} style={{ display: 'inline', opacity: 0.4 }} />
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700 }}>Search any pillar report.</div>
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
            Enter a query above or hit Search to see recent reports across all your campaigns.
          </div>
        </div>
      )}

      {hasSearched && !loading && results.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: 'rgba(150,150,170,0.7)',
          borderRadius: 10, border: '1px dashed rgba(160,160,180,0.2)',
        }}>
          <FileText size={28} style={{ display: 'inline', opacity: 0.4 }} />
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700 }}>No reports match these filters.</div>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'rgba(150,150,170,0.85)', marginBottom: 8 }}>
            Found {results.length} report{results.length === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map(r => (
              <ReportResultCard key={r.id} report={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportResultCard({ report }: { report: any }) {
  const ageDays = Math.round((Date.now() - new Date(report.created_at).getTime()) / 86_400_000);
  const ageLabel = ageDays === 0 ? 'today' : `${ageDays}d ago`;
  const confidenceHue = report.confidence_rating === 'high'   ? '152 70% 55%'
                       : report.confidence_rating === 'medium' ? '38 85% 60%'
                       :                                          '210 25% 55%';

  return (
    <div style={{
      padding: 12, borderRadius: 9,
      background: 'rgba(15,16,24,0.45)',
      border: '1px solid rgba(160,160,180,0.10)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
          background: 'hsla(186 80% 55% / 0.10)',
          color: 'hsl(186 80% 75%)',
          textTransform: 'uppercase', letterSpacing: 0.4,
        }}>
          {PILLAR_LABEL[report.pillar] || report.pillar}
        </span>
        {report.confidence_rating && (
          <span style={{
            fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: `hsla(${confidenceHue} / 0.12)`,
            color: `hsl(${confidenceHue})`,
            textTransform: 'uppercase', letterSpacing: 0.4,
          }}>
            {report.confidence_rating} confidence
          </span>
        )}
        <span style={{ fontSize: 9.5, color: 'rgba(150,150,170,0.7)' }}>
          {report.report_kind?.replace(/_/g, ' ')}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'rgba(140,140,160,0.6)' }}>
          <Calendar size={9} style={{ display: 'inline', marginRight: 3 }} />
          {ageLabel}
        </span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(230,230,245,0.95)', marginBottom: 4, lineHeight: 1.4 }}>
        {report.title}
      </div>

      {report.summary && (
        <div style={{ fontSize: 11.5, color: 'rgba(170,170,190,0.78)', lineHeight: 1.5, marginBottom: 6 }}>
          {report.summary}
        </div>
      )}

      {/* Tags */}
      {Array.isArray(report.tags) && report.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {report.tags.slice(0, 8).map((t: string) => (
            <span key={t} style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 3,
              background: 'rgba(160,160,180,0.08)', color: 'rgba(180,180,200,0.7)',
            }}>
              <Tag size={8} style={{ display: 'inline', marginRight: 3 }} />
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function inputStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    padding: '8px 10px',
    background: 'rgba(15,16,24,0.7)',
    border: '1px solid rgba(160,160,180,0.18)',
    borderRadius: 6,
    color: 'rgba(220,220,235,0.95)',
    fontSize: 12,
    outline: 'none',
    ...extra,
  };
}
