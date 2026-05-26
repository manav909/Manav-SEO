/* ════════════════════════════════════════════════════════════════════════════
   src/components/pm/CampaignDocumentsSection.tsx — Phase D4 (2026-05-25)

   Embedded artifact viewer scoped to a single campaign. Renders inline
   inside CampaignDetailDrawer below the legacy "Documents & reports" block.

   Shows artifacts from the new artifacts table (D1) filtered by campaign_id.
   This is parallel coverage to the legacy seo_campaign_reports — the two
   stores overlap but aren't identical. Eventually the legacy block can be
   deprecated once artifacts coverage is verified complete. Until then, both
   render side-by-side; PMs see both views and we don't risk regression.

   Design constraints:
     - Compact list view — drawer is already content-dense, don't bloat it
     - Each row expands inline to show body markdown (no separate modal)
     - Kind filter chips at the top — drawer-scale, not a full sidebar
     - "Open in Documents" deep-link per row → escape to full /documents page
     - Workflow shortcuts (mark reviewed / mark sent) inline — drawer is
       the PM's working surface; reviewing here should not require navigation
═════════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ArtifactMarkdown from './ArtifactMarkdown';
import {
  FileText, ChevronDown, ChevronRight, CheckCircle2, Send,
  ExternalLink, Eye, Loader2, AlertTriangle, RefreshCw, Filter,
} from 'lucide-react';
import {
  artifactsList, artifactsGet, artifactsMarkReviewed, artifactsMarkSent,
  type ArtifactSummary, type ArtifactDetail,
} from '@/components/pm/api';
import { toast } from '@/hooks/use-toast';

/* ─── Shared formatting helpers (mirrors Documents.tsx) ──────────────────── */

const KIND_LABELS: Record<string, { label: string; color: string }> = {
  brief:                  { label: 'Content Brief',       color: '#a78bfa' },
  content_brief:          { label: 'Content Brief',       color: '#a78bfa' },
  forecast:               { label: 'Forecast',            color: '#34d399' },
  forecast_emission:      { label: 'Forecast',            color: '#34d399' },
  client_update:          { label: 'Client Update',       color: '#60a5fa' },
  internal_handover:      { label: 'Internal Handover',   color: '#fbbf24' },
  internal_doc:           { label: 'Internal Doc',        color: '#fbbf24' },
  handover:               { label: 'Handover',            color: '#fbbf24' },
  strategy_plan:          { label: 'Strategy Plan',       color: '#f472b6' },
  strategy:               { label: 'Strategy',            color: '#f472b6' },
  competitor_snapshot:    { label: 'Competitor Snapshot', color: '#fb923c' },
  competitor_intel:       { label: 'Competitor Intel',    color: '#fb923c' },
  keyword_research:       { label: 'Keyword Research',    color: '#22d3ee' },
  gsc_baseline:           { label: 'GSC Baseline',        color: '#22d3ee' },
  gsc_context:            { label: 'GSC Context',         color: '#22d3ee' },
  audit_report:           { label: 'Audit Report',        color: '#ef4444' },
};
function kindMeta(k: string) { return KIND_LABELS[k] || { label: k.replace(/_/g, ' '), color: '#94a3b8' }; }

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/* ─── Main component ─────────────────────────────────────────────────────── */

interface Props {
  campaignId: string;
  projectId?: string;   /* fallback — used when campaign_id is null on artifact rows */
  keyword?:   string;   /* fallback — narrows project-scoped query to the right keyword */
}

type KindFilter = 'all' | string;     // 'all' or specific artifact_kind
type StatusFilter = 'current' | 'all';

export default function CampaignDocumentsSection({ campaignId, projectId, keyword }: Props) {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('current');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<ArtifactDetail | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);

  /* Fetch artifacts scoped to campaign */
  const fetchArtifacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      /* Primary query: by campaign_id */
      const result = await artifactsList({
        campaignIds: [campaignId],
        status:      statusFilter === 'current' ? 'current' : undefined as any,
        sort:        'newest',
        limit:       100,
      });
      if (result.error) {
        setError(result.error);
        setArtifacts([]);
        setTotal(0);
        return;
      }

      let arts = result.artifacts || [];

      /* Fallback: if campaign_id query returned nothing but we have projectId,
         also query by projectId (+ keyword if available). This handles runs
         where campaign_id wasn't stamped on the artifact rows due to a
         campaign-linkage failure during pipeline creation. Merge + deduplicate. */
      if (arts.length === 0 && projectId) {
        const fallback = await artifactsList({
          projectIds:  [projectId],
          ...(keyword ? { keyword } : {}),
          status:      statusFilter === 'current' ? 'current' : undefined as any,
          sort:        'newest',
          limit:       100,
        });
        if (!fallback.error && (fallback.artifacts?.length || 0) > 0) {
          arts = fallback.artifacts || [];
        }
      }

      setArtifacts(arts);
      setTotal(arts.length);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [campaignId, statusFilter, projectId, keyword]);

  useEffect(() => { fetchArtifacts(); }, [fetchArtifacts]);

  /* Distinct kinds present in the result set — drives the filter chip row */
  const availableKinds = useMemo(() => {
    const set = new Set<string>();
    artifacts.forEach(a => set.add(a.artifact_kind));
    return Array.from(set).sort();
  }, [artifacts]);

  const filtered = useMemo(() => {
    if (kindFilter === 'all') return artifacts;
    return artifacts.filter(a => a.artifact_kind === kindFilter);
  }, [artifacts, kindFilter]);

  /* Expand/collapse one row — fetches detail lazily */
  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(id);
    setExpandedLoading(true);
    setExpandedDetail(null);
    const r = await artifactsGet({ artifactId: id, includeChain: false });
    setExpandedLoading(false);
    if (r.error) {
      toast({ title: 'Error', description: r.error, variant: 'destructive' });
      setExpandedId(null);
    } else {
      setExpandedDetail(r.artifact || null);
    }
  };

  /* Workflow ops — optimistic update + refetch */
  const onMarkReviewed = async (id: string, reviewed: boolean) => {
    const r = await artifactsMarkReviewed({ artifactId: id, reviewed });
    if (r.error) {
      toast({ title: 'Error', description: r.error, variant: 'destructive' });
      return;
    }
    if (r.artifact) {
      setArtifacts(prev => prev.map(a => a.id === id ? { ...a, ...r.artifact! } : a));
      if (expandedDetail?.id === id) setExpandedDetail({ ...expandedDetail, ...r.artifact });
      toast({ title: reviewed ? 'Marked reviewed' : 'Marked unreviewed' });
    }
  };

  const onMarkSent = async (id: string, sent: boolean) => {
    const r = await artifactsMarkSent({ artifactId: id, sent });
    if (r.error) {
      toast({ title: 'Error', description: r.error, variant: 'destructive' });
      return;
    }
    if (r.artifact) {
      setArtifacts(prev => prev.map(a => a.id === id ? { ...a, ...r.artifact! } : a));
      if (expandedDetail?.id === id) setExpandedDetail({ ...expandedDetail, ...r.artifact });
      toast({ title: sent ? 'Marked sent' : 'Marked unsent' });
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={14} />
          Documents <span style={{ color: 'rgba(150,150,170,0.6)', fontWeight: 500 }}>({total})</span>
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={fetchArtifacts}
            disabled={loading}
            style={{
              padding: '5px 10px', borderRadius: 6,
              border: '1px solid rgba(160,160,180,0.2)',
              background: 'transparent', cursor: 'pointer', fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 4,
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link
            to={`/documents?campaignIds=${campaignId}`}
            style={{
              padding: '5px 10px', borderRadius: 6,
              border: '1px solid rgba(160,160,180,0.2)',
              background: 'transparent', fontSize: 11, textDecoration: 'none', color: 'inherit',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <ExternalLink size={11} />
            Open in Documents
          </Link>
        </div>
      </div>

      {/* Filter chips */}
      {(availableKinds.length > 1 || true) && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10,
          padding: '8px 10px', borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(160,160,180,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'rgba(150,150,170,0.7)', marginRight: 4 }}>
            <Filter size={11} />
            Type:
          </div>
          <FilterChip
            active={kindFilter === 'all'}
            onClick={() => setKindFilter('all')}
            label="All"
            count={artifacts.length}
          />
          {availableKinds.map(k => {
            const meta = kindMeta(k);
            const count = artifacts.filter(a => a.artifact_kind === k).length;
            return (
              <FilterChip
                key={k}
                active={kindFilter === k}
                onClick={() => setKindFilter(k)}
                label={meta.label}
                count={count}
                color={meta.color}
              />
            );
          })}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'rgba(150,150,170,0.7)' }}>
            Status:
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              style={{
                fontSize: 10.5,
                background: 'transparent',
                border: '1px solid rgba(160,160,180,0.2)',
                borderRadius: 4,
                padding: '2px 6px',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <option value="current">Current only</option>
              <option value="all">All versions</option>
            </select>
          </div>
        </div>
      )}

      {/* Body */}
      {loading && (
        <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12, color: 'rgba(150,150,170,0.7)' }}>
          <Loader2 size={14} className="animate-spin" style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          Loading documents…
        </div>
      )}

      {!loading && error && (
        <div style={{
          padding: '12px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          color: '#ef4444', fontSize: 12,
        }}>
          <AlertTriangle size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{
          padding: '24px 12px', textAlign: 'center', fontSize: 12,
          color: 'rgba(150,150,170,0.7)',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(160,160,180,0.15)',
          borderRadius: 8,
        }}>
          {kindFilter !== 'all' ? (
            <>No {kindMeta(kindFilter).label} artifacts for this campaign.</>
          ) : statusFilter === 'current' ? (
            <>No current documents for this campaign yet. Run a pipeline or refresh from audit to generate them.</>
          ) : (
            <>No documents for this campaign.</>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(a => (
            <ArtifactCard
              key={a.id}
              artifact={a}
              expanded={expandedId === a.id}
              detail={expandedId === a.id ? expandedDetail : null}
              detailLoading={expandedId === a.id && expandedLoading}
              onToggle={() => toggleExpand(a.id)}
              onMarkReviewed={r => onMarkReviewed(a.id, r)}
              onMarkSent={s => onMarkSent(a.id, s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Filter chip ────────────────────────────────────────────────────────── */

function FilterChip({
  active, onClick, label, count, color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 8px', borderRadius: 6,
        border: '1px solid',
        borderColor: active ? (color || 'rgba(167,139,250,0.5)') : 'rgba(160,160,180,0.15)',
        background: active ? (color ? `${color}22` : 'rgba(167,139,250,0.15)') : 'transparent',
        color: active ? (color || '#a78bfa') : 'inherit',
        fontSize: 10.5, fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}
    >
      {color && <span style={{ width: 6, height: 6, borderRadius: 3, background: color, display: 'inline-block' }} />}
      {label}
      <span style={{
        opacity: 0.6,
        background: 'rgba(160,160,180,0.1)',
        padding: '1px 5px',
        borderRadius: 4,
        fontSize: 9.5,
      }}>{count}</span>
    </button>
  );
}

/* ─── One artifact row card ──────────────────────────────────────────────── */

function ArtifactCard({
  artifact, expanded, detail, detailLoading, onToggle, onMarkReviewed, onMarkSent,
}: {
  artifact: ArtifactSummary;
  expanded: boolean;
  detail: ArtifactDetail | null;
  detailLoading: boolean;
  onToggle: () => void;
  onMarkReviewed: (reviewed: boolean) => void;
  onMarkSent: (sent: boolean) => void;
}) {
  const meta = kindMeta(artifact.artifact_kind);
  const needsReview = !artifact.pm_reviewed && artifact.status === 'current';

  return (
    <div style={{
      borderRadius: 8,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(160,160,180,0.1)',
      overflow: 'hidden',
    }}>
      {/* Row header — always visible, click to expand */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '10px 12px', textAlign: 'left',
          background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span style={{
          width: 8, height: 8, borderRadius: 4,
          background: meta.color, display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{
          fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.04em', color: meta.color,
          flexShrink: 0,
        }}>
          {meta.label}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, flex: 1, minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {artifact.title}
        </span>
        {artifact.keyword && (
          <span style={{ fontSize: 10.5, color: 'rgba(150,150,170,0.7)', flexShrink: 0, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {artifact.keyword}
          </span>
        )}
        {needsReview && (
          <span style={{ fontSize: 9.5, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, flexShrink: 0 }}>
            Review
          </span>
        )}
        {artifact.client_sent && <Send size={12} color="#34d399" style={{ flexShrink: 0 }} />}
        {artifact.status !== 'current' && (
          <span style={{ fontSize: 9.5, color: 'rgba(150,150,170,0.6)', fontStyle: 'italic', flexShrink: 0 }}>
            {artifact.status}
          </span>
        )}
        <span style={{ fontSize: 10.5, color: 'rgba(150,150,170,0.6)', flexShrink: 0 }}>
          {timeAgo(artifact.generated_at)}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div style={{
          padding: '0 12px 12px',
          borderTop: '1px solid rgba(160,160,180,0.08)',
          paddingTop: 10,
        }}>
          {/* Workflow bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <button
              onClick={() => onMarkReviewed(!artifact.pm_reviewed)}
              style={workflowBtn(artifact.pm_reviewed, '#34d399')}
            >
              <CheckCircle2 size={11} />
              {artifact.pm_reviewed ? 'Reviewed' : 'Mark reviewed'}
              {artifact.pm_reviewed && artifact.pm_reviewed_at && (
                <span style={{ opacity: 0.7, fontWeight: 400 }}>({timeAgo(artifact.pm_reviewed_at)})</span>
              )}
            </button>
            <button
              onClick={() => onMarkSent(!artifact.client_sent)}
              style={workflowBtn(artifact.client_sent, '#60a5fa')}
            >
              <Send size={11} />
              {artifact.client_sent ? 'Sent' : 'Mark sent'}
              {artifact.client_sent && artifact.client_sent_at && (
                <span style={{ opacity: 0.7, fontWeight: 400 }}>({timeAgo(artifact.client_sent_at)})</span>
              )}
            </button>
            <Link
              to={`/documents?artifact=${artifact.id}`}
              style={{
                padding: '4px 8px', borderRadius: 6,
                border: '1px solid rgba(160,160,180,0.2)',
                background: 'transparent',
                color: 'inherit', textDecoration: 'none',
                fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <ExternalLink size={11} />
              Open in Documents
            </Link>
            {artifact.generation_cost_usd !== null && artifact.generation_cost_usd > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'rgba(150,150,170,0.6)', alignSelf: 'center' }}>
                ${artifact.generation_cost_usd.toFixed(2)} · {artifact.llm_calls} LLM calls
              </span>
            )}
          </div>

          {/* Body */}
          {detailLoading && (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 11.5, color: 'rgba(150,150,170,0.7)' }}>
              <Loader2 size={12} className="animate-spin" style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              Loading body…
            </div>
          )}
          {!detailLoading && detail && (
            <ArtifactMarkdown body={detail.body || '_No content_'} size="sm" />
          )}
        </div>
      )}
    </div>
  );
}

function workflowBtn(active: boolean, color: string): React.CSSProperties {
  return {
    padding: '4px 8px', borderRadius: 6,
    border: '1px solid',
    borderColor: active ? `${color}66` : 'rgba(160,160,180,0.2)',
    background: active ? `${color}22` : 'transparent',
    color: active ? color : 'inherit',
    cursor: 'pointer',
    fontSize: 10.5, fontWeight: 500,
    display: 'flex', alignItems: 'center', gap: 4,
  };
}
