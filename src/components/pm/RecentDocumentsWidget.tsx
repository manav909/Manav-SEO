/* ════════════════════════════════════════════════════════════════════════════
   src/components/pm/RecentDocumentsWidget.tsx — Phase D4 (2026-05-25)

   ClientLens widget showing the 5 most recent artifacts for a project.
   Designed to match ClientLens's narrative aesthetic:
     - Section header with uppercase eyebrow text
     - Framer Motion entry animations
     - Glass-card list items with mood-driven accent
     - "View all" link to /documents pre-filtered by project

   Differs from CampaignDocumentsSection in scope (project not campaign),
   density (5 latest, no filtering UI), and visual treatment (animated,
   accent-driven, no inline workflow buttons — drill into /documents for
   review/send).
═════════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, ChevronRight, CheckCircle2, Send, AlertCircle } from 'lucide-react';
import { artifactsList, type ArtifactSummary } from '@/components/pm/api';

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
  return mo < 12 ? `${mo}mo ago` : `${Math.floor(mo / 12)}y ago`;
}

interface Props {
  projectId: string;
  setMood?: (m: any) => void;
}

export default function RecentDocumentsWidget({ projectId, setMood }: Props) {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [unreviewedCount, setUnreviewedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        /* Fetch top 5 latest current artifacts */
        const r = await artifactsList({
          projectIds: [projectId],
          status: 'current',
          sort: 'newest',
          limit: 5,
        });
        if (cancelled) return;
        if (r.error) {
          setError(r.error);
        } else {
          setArtifacts(r.artifacts || []);
          setTotal(r.total || 0);
        }
        /* Separate query for unreviewed count — small, fast */
        const ur = await artifactsList({
          projectIds: [projectId],
          status: 'current',
          pmReviewed: false,
          limit: 1,
        });
        if (cancelled) return;
        if (!ur.error) setUnreviewedCount(ur.total || 0);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  /* Hide entire section if no artifacts and not loading (avoid empty narrative beat) */
  if (!loading && !error && artifacts.length === 0) {
    return null;
  }

  return (
    <section
      onMouseEnter={() => setMood?.('focus')}
      className="relative py-24 px-6"
    >
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] uppercase tracking-[0.4em] text-white/40">Recent work</div>
            <Link
              to={`/documents?projectIds=${projectId}`}
              className="text-[11px] uppercase tracking-[0.2em] text-white/60 hover:text-white/90 transition-colors flex items-center gap-1.5"
            >
              View all ({total})
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3" style={{ letterSpacing: '-0.02em' }}>
            Latest documents
          </h2>
          {unreviewedCount > 0 && (
            <div className="text-sm text-amber-400/80 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {unreviewedCount} unreviewed across this project
            </div>
          )}
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl p-5 text-sm text-red-400/80"
            style={{
              background: 'rgba(239,68,68,0.05)',
              border: '0.5px solid rgba(239,68,68,0.15)',
            }}
          >
            Could not load recent documents — {error}
          </motion.div>
        )}

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => (
              <div
                key={i}
                className="rounded-2xl p-5 animate-pulse"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
                  border: '0.5px solid rgba(255,255,255,0.08)',
                  height: 110,
                }}
              />
            ))}
          </div>
        )}

        {!loading && !error && artifacts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {artifacts.map((a, i) => {
              const meta = kindMeta(a.artifact_kind);
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ delay: i * 0.07, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Link
                    to={`/documents?artifact=${a.id}`}
                    className="block rounded-2xl p-5 relative overflow-hidden group transition-all hover:scale-[1.01]"
                    style={{
                      background: `linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))`,
                      border: '0.5px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {/* Top: kind + status */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: meta.color }} />
                        <span
                          className="text-[10px] uppercase tracking-wider font-semibold"
                          style={{ color: meta.color }}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!a.pm_reviewed && (
                          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-medium">Review</span>
                        )}
                        {a.client_sent && <Send className="w-3 h-3 text-emerald-400" />}
                      </div>
                    </div>

                    {/* Title */}
                    <div className="text-sm font-semibold text-white/90 mb-2 leading-tight line-clamp-2 min-h-[2.5rem]">
                      {a.title}
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-2 text-[11px] text-white/40">
                      {a.keyword && (
                        <>
                          <span className="truncate">{a.keyword}</span>
                          <span>•</span>
                        </>
                      )}
                      <span>{timeAgo(a.generated_at)}</span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
