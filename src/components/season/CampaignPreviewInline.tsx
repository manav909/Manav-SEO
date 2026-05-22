/* ════════════════════════════════════════════════════════════════════
   src/components/season/CampaignPreviewInline.tsx
   Phase 21 — Block 2.7 — Adaptive War Room

   When the user submits a commitment-intent command on /command
   (e.g. "rank me for X"), this renders the campaign structure preview
   inline on the page rather than relying on the modal.

   Same backend, same flow:
     1. seoRecommendCampaignStructure resolves positioning + grouping + duplicates
     2. This component renders the preview with source citations
     3. User confirms → seoCommitCampaignStructure + seasonPipelineCreate
═══════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layers, AlertTriangle, Lightbulb, ExternalLink, CheckCircle2 } from 'lucide-react';
import {
  seoCommitCampaignStructure, seasonPipelineCreate,
  type CampaignStructureRecommendation, type ProjectPositioning,
  type UrlFitAnalysis,
} from '@/components/pm/api';

interface Props {
  structure:        CampaignStructureRecommendation;
  positioning:      ProjectPositioning | null;
  projectId:        string;
  originalInput:    string;
  onClose:          () => void;
  onLaunched?:      () => void;
}

export default function CampaignPreviewInline({
  structure, positioning, projectId, originalInput, onClose, onLaunched
}: Props) {
  const [acceptFollowups, setAcceptFollowups] = useState<Set<number>>(
    new Set(structure.suggested_followup_campaigns.map((_, i) => i))
  );
  const [acceptOpps, setAcceptOpps] = useState<Set<number>>(
    new Set(structure.opportunities_to_create.map((_, i) => i))
  );
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const urlFitAnalysis = (structure as any).url_fit_analysis as Record<string, UrlFitAnalysis> | undefined;
  const hasUrls = urlFitAnalysis && Object.keys(urlFitAnalysis).length > 0;

  async function handleConfirm() {
    setCommitting(true);
    setError(null);
    try {
      const commitRes = await seoCommitCampaignStructure({
        projectId,
        structure,
        positioning: positioning || undefined,
        acceptFollowupCampaigns: Array.from(acceptFollowups),
        acceptOpportunities:     Array.from(acceptOpps),
      });
      if (commitRes.error || !commitRes.primary_campaign_id) {
        setError(`Couldn't commit — ${commitRes.error || 'no campaign id'}.`);
        setCommitting(false);
        return;
      }
      const pipeRes = await seasonPipelineCreate({
        projectId,
        pipelineType: 'rank_for_keyword',
        inputText:    originalInput,
        scope:        { keyword: structure.primary_campaign.keywords[0], campaignId: commitRes.primary_campaign_id },
      });
      setCommitting(false);
      if (pipeRes.error) {
        setError(`Campaign created but pipeline didn't launch — ${pipeRes.error}.`);
        return;
      }
      setCommitted(true);
      if (onLaunched) onLaunched();
    } catch (e: any) {
      setError(`Commit failed — ${e?.message || 'unknown'}.`);
      setCommitting(false);
    }
  }

  if (committed) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-5">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <div className="text-sm font-bold text-emerald-300">Campaign launched</div>
        </div>
        <div className="text-xs text-muted-foreground/85 leading-relaxed">
          Pipeline started for "{structure.primary_campaign.keywords[0]}"
          {structure.primary_campaign.keywords.length > 1 && ` + ${structure.primary_campaign.keywords.length - 1} more`}.
          The four pillars are running now — they'll surface findings as opportunities in the inbox.
        </div>
        <button
          onClick={onClose}
          className="mt-3 text-[11px] px-3 py-1 rounded-md border border-border/40 bg-card/40 text-muted-foreground hover:text-foreground">
          Close
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-6 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/[0.05] to-violet-500/[0.03] p-5 md:p-6">

      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-cyan-400 flex items-center gap-1.5 mb-1">
            <Layers className="h-3 w-3" /> Campaign preview · confirm to launch
          </div>
          <div className="text-[11px] text-muted-foreground/75 leading-relaxed">
            You said: <span className="text-foreground/85 italic">"{originalInput}"</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[11px] px-2 py-1 rounded-md border border-border/50 bg-card/30 text-muted-foreground hover:text-foreground shrink-0">
          Cancel
        </button>
      </div>

      {/* Primary campaign */}
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/[0.04] p-4 mb-3">
        <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold mb-1.5">Primary campaign</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {structure.primary_campaign.keywords.map((kw, i) => (
            <span key={i} className="px-2 py-0.5 rounded-md bg-card/60 border border-border/40 text-xs text-foreground/90">
              "{kw}"
            </span>
          ))}
        </div>
        {structure.primary_campaign.intent_label && (
          <div className="text-[11px] text-muted-foreground/70 italic">
            Intent: {structure.primary_campaign.intent_label}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground/55 mt-1.5">
          Coherence: {structure.primary_campaign.coherence_score.toFixed(2)} · {structure.primary_campaign.keywords.length} keyword(s)
        </div>
      </div>

      {/* URL fit panel */}
      {hasUrls && (
        <div className="rounded-xl border border-border/50 bg-card/30 p-4 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/75 font-bold mb-2 flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> Target URL fit · {Object.keys(urlFitAnalysis!).length}
          </div>
          {Object.entries(urlFitAnalysis!).map(([url, analysis], i) => (
            <div key={i} className={`py-2 ${i > 0 ? 'border-t border-border/30' : ''}`}>
              <div className="text-xs text-foreground/90 font-semibold mb-1">{url}</div>
              <div className="text-[10px] text-muted-foreground/65 mb-1.5 flex flex-wrap gap-2">
                {analysis.status_text === 'ok'
                  ? <span className="text-emerald-400">✓ Fetched live ({analysis.status_code}, {analysis.word_count} words)</span>
                  : <span className="text-rose-400">✗ Fetch failed: {analysis.status_text}</span>}
                {!analysis.is_indexable && <span className="text-rose-400">⚠ Not indexable</span>}
                {analysis.h1 && <span>H1: "{analysis.h1.slice(0, 60)}"</span>}
              </div>
              {Object.entries(analysis.fit_per_keyword).map(([kw, fit], j) => (
                <div key={j} className={`mt-1.5 p-2 rounded-md border text-[11px] ${
                  fit.verdict === 'strong_fit'
                    ? 'border-emerald-500/30 bg-emerald-500/[0.05]'
                    : fit.verdict === 'partial_fit'
                      ? 'border-amber-500/30 bg-amber-500/[0.05]'
                      : fit.verdict === 'poor_fit'
                        ? 'border-rose-500/30 bg-rose-500/[0.05]'
                        : 'border-border/40 bg-card/30'
                }`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <strong className="text-foreground/90">"{kw}"</strong>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                      fit.verdict === 'strong_fit' ? 'text-emerald-400 bg-emerald-500/10'
                      : fit.verdict === 'partial_fit' ? 'text-amber-400 bg-amber-500/10'
                      : fit.verdict === 'poor_fit' ? 'text-rose-400 bg-rose-500/10'
                      : 'text-muted-foreground bg-card/40'
                    } uppercase tracking-wider font-bold`}>
                      {fit.verdict.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-muted-foreground/85 leading-relaxed">{fit.reasoning}</div>
                  {fit.citations.length > 0 && (
                    <div className="text-[9px] text-muted-foreground/55 mt-1 italic">
                      Cited from page: {fit.citations.map(c => `"${c}"`).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Better-target warning */}
      {structure.better_target_detected.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-4 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Existing campaign is a better fit
          </div>
          {structure.better_target_detected.map((bt, i) => (
            <div key={i} className="text-[11px] text-foreground/85 leading-relaxed">
              {bt.reasoning}
            </div>
          ))}
        </div>
      )}

      {/* Duplicates warning */}
      {structure.duplicates_detected.length > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.05] p-4 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-rose-400 font-bold mb-1.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Duplicate prevention
          </div>
          {structure.duplicates_detected.map((d, i) => (
            <div key={i} className="text-[11px] text-foreground/85 leading-relaxed mb-1">
              "{d.keyword}" matches existing campaign for "{d.existing_campaign_keyword}".
            </div>
          ))}
        </div>
      )}

      {/* Followup campaigns */}
      {structure.suggested_followup_campaigns.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/30 p-4 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/75 font-bold mb-2">
            Followup campaigns ({structure.suggested_followup_campaigns.length})
          </div>
          {structure.suggested_followup_campaigns.map((f, i) => (
            <label key={i} className="flex items-start gap-2 py-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptFollowups.has(i)}
                onChange={() => {
                  const next = new Set(acceptFollowups);
                  if (next.has(i)) next.delete(i); else next.add(i);
                  setAcceptFollowups(next);
                }}
                className="mt-1"
              />
              <div className="flex-1 text-[11px]">
                <div className="text-foreground/90">{f.keywords.map(k => `"${k}"`).join(', ')}</div>
                <div className="text-muted-foreground/65 mt-0.5 italic">{f.why_separate}</div>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Opportunities to create */}
      {structure.opportunities_to_create.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/30 p-4 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/75 font-bold mb-2 flex items-center gap-1">
            <Lightbulb className="h-3 w-3" /> Opportunities to create ({structure.opportunities_to_create.length})
          </div>
          {structure.opportunities_to_create.map((o, i) => (
            <label key={i} className="flex items-start gap-2 py-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptOpps.has(i)}
                onChange={() => {
                  const next = new Set(acceptOpps);
                  if (next.has(i)) next.delete(i); else next.add(i);
                  setAcceptOpps(next);
                }}
                className="mt-1"
              />
              <div className="flex-1 text-[11px]">
                <div className="text-foreground/90">"{o.keyword}"</div>
                <div className="text-muted-foreground/65 mt-0.5 italic">{o.reason}</div>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Honest note */}
      <div className="text-[11px] text-muted-foreground/65 leading-relaxed mb-4 italic">
        {structure.honest_note}
      </div>

      {error && (
        <div className="text-[11px] text-rose-400 mb-3 leading-relaxed">{error}</div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleConfirm}
          disabled={committing || structure.primary_campaign.keywords.length === 0}
          className="px-4 py-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {committing ? 'Launching…' : 'Confirm & launch'}
        </button>
        <button
          onClick={onClose}
          disabled={committing}
          className="px-4 py-2 rounded-lg border border-border/50 bg-card/30 text-muted-foreground hover:text-foreground text-xs">
          Cancel
        </button>
      </div>
    </motion.div>
  );
}
