/* ════════════════════════════════════════════════════════════════════
   src/components/season/ObjectivePreviewInline.tsx

   Preview card for objective-type commands — mirrors CampaignPreviewInline
   visually. Shows goal type, detected pages, keywords before launching.

   Flow:
     1. User types "grow traffic for /page1, /page2" in SEASON
     2. parseObjectiveCommand extracts goalType + urls + keywords
     3. This preview renders — user can edit pages/keywords before launch
     4. Confirm → objective_full_setup → everything wired automatically
════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layers, AlertTriangle } from 'lucide-react';

export interface ObjectivePreviewData {
  goalType:   string;
  title:      string;
  keywords:   string[];
  targetUrls: string[];
  location?:  string;
  pageSource?: string; // 'command' | 'workspace' | 'gsc' | ''
  pageCount?:  number;
}

interface Props {
  preview:      ObjectivePreviewData;
  projectId:    string;
  originalInput: string;
  onClose:      () => void;
  onLaunched?:  (result: any) => void;
}

const GOAL_META: Record<string, { icon: string; label: string; desc: string }> = {
  traffic_growth:     { icon: '📈', label: 'Traffic Growth',     desc: 'Increase organic clicks to target pages' },
  technical_recovery: { icon: '⚙️', label: 'Technical Recovery', desc: 'Resolve critical technical SEO issues' },
  domain_authority:   { icon: '🔗', label: 'Domain Authority',   desc: 'Build authority through links and content' },
  local_visibility:   { icon: '📍', label: 'Local Visibility',   desc: 'Rank in target location searches' },
  eeat:               { icon: '🎓', label: 'E-E-A-T',            desc: 'Improve expertise, authority, and trust signals' },
  content_authority:  { icon: '✍️', label: 'Content Authority',  desc: 'Build topical authority through content' },
  keyword_ranking:    { icon: '🏆', label: 'Keyword Ranking',    desc: 'Rank on page 1 for target keyword' },
};

export default function ObjectivePreviewInline({
  preview, projectId, originalInput, onClose, onLaunched,
}: Props) {
  const [urlText,  setUrlText]  = useState(preview.targetUrls.join('\n'));
  const [kwText,   setKwText]   = useState(preview.keywords.join(', '));
  const [editUrls, setEditUrls] = useState(false);
  const [editKws,  setEditKws]  = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launched,  setLaunched]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const meta = GOAL_META[preview.goalType] || { icon: '🎯', label: preview.goalType, desc: '' };

  const parsedUrls = urlText.split('\n').map(l => l.trim()).filter(l => /^https?:\/\//.test(l) || l.startsWith('/'));
  const parsedKws  = kwText.split(',').map(k => k.trim()).filter(Boolean);

  async function handleLaunch() {
    setLaunching(true);
    setError(null);
    try {
      const { supabase: sb } = await import('@/lib/supabase');
      const { data: { user } } = await sb.auth.getUser();

      // Step 1: wire up everything (objective + workspace + pages + data room)
      const setupR = await fetch('/api/task-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:          'objective_full_setup',
          projectId,
          campaignType:    preview.goalType,
          title:           preview.title,
          keyword:         parsedKws[0] || undefined,
          targetUrls:      parsedUrls.length > 0 ? parsedUrls : undefined,
          targetLocations: preview.location ? [{ city: preview.location }] : undefined,
          userId:          user?.id,
        }),
      }).then(r => r.json());

      if (!setupR.success) {
        setError(setupR.error || 'Setup failed');
        setLaunching(false);
        return;
      }

      // Step 2: launch the matching pipeline if one exists for this goal type
      const PIPELINE_MAP: Record<string, string> = {
        traffic_growth: 'traffic_growth',
        // more goal types will get pipelines as they're built
      };
      const pipelineType = PIPELINE_MAP[preview.goalType];
      if (pipelineType) {
        try {
          await fetch('/api/task-engine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action:       'bs_season_pipeline_launch',
              projectId,
              pipelineType,
              inputText:    preview.title,
              scope: {
                keyword:    parsedKws[0] || undefined,
                targetUrls: parsedUrls.length > 0 ? parsedUrls : undefined,
                goalType:   preview.goalType,
                campaignId: setupR.campaign_id,
                siteId:     setupR.site_id,
              },
            }),
          });
          // Pipeline launched async — user sees it in SEO Campaigns → Campaigns tab
        } catch { /* non-blocking — objective still created */ }
      }

      setLaunched(true);
      setLaunching(false);
      onLaunched?.(setupR);
    } catch (e: any) {
      setError(e?.message || 'Launch failed');
      setLaunching(false);
    }
  }

  if (launched) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-2">
        <div className="text-sm font-bold text-emerald-400">✓ Objective launched</div>
        <div className="text-xs text-muted-foreground space-y-1.5">
          <div>Pipeline launched — go to <strong>SEO Campaigns → Campaigns</strong> to watch it run.</div>
          <div>Once complete, open <strong>Site Manager</strong> to run baseline + audit on your target pages.</div>
        </div>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground mt-2">Dismiss</button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      className="rounded-2xl border border-cyan-500/20 bg-card/60 backdrop-blur-sm p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
            Objective Preview · Confirm to Launch
          </span>
        </div>
        <button onClick={onClose} className="text-xs text-muted-foreground/60 hover:text-muted-foreground px-2 py-1 rounded border border-border/40">
          Cancel
        </button>
      </div>

      <div className="text-[11px] text-muted-foreground/70 italic">
        You said: <span className="text-foreground/80">"{originalInput}"</span>
      </div>

      {/* Goal type card */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4 space-y-3">
        <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold">Primary objective</div>

        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta.icon}</span>
          <div>
            <div className="text-sm font-bold">{meta.label}</div>
            <div className="text-[11px] text-muted-foreground">{meta.desc}</div>
          </div>
        </div>

        {/* Keywords */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Keywords {parsedKws.length > 0 ? `(${parsedKws.length})` : ''}
            </span>
            <button type="button" onClick={() => setEditKws(v => !v)}
              className="text-[10px] text-cyan-400/70 hover:text-cyan-400">
              {editKws ? 'done' : 'edit'}
            </button>
          </div>
          {editKws ? (
            <input value={kwText} onChange={e => setKwText(e.target.value)}
              placeholder="keyword1, keyword2"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-cyan-500/40" />
          ) : parsedKws.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {parsedKws.map(k => (
                <span key={k} className="px-2 py-0.5 rounded-full border border-cyan-500/25 text-[11px] text-cyan-300 bg-cyan-500/[0.06]">
                  "{k}"
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground/50 italic">
              No keywords specified — add them above or set later
            </div>
          )}
        </div>

        {/* Target pages */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Target pages {parsedUrls.length > 0 ? `(${parsedUrls.length})` : ''}
            </span>
            <button type="button" onClick={() => setEditUrls(v => !v)}
              className="text-[10px] text-cyan-400/70 hover:text-cyan-400">
              {editUrls ? 'done' : 'edit'}
            </button>
          </div>
          {editUrls ? (
            <textarea value={urlText} onChange={e => setUrlText(e.target.value)}
              rows={4} placeholder={'https://example.com/page-1\nhttps://example.com/page-2'}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:border-cyan-500/40 resize-none" />
          ) : parsedUrls.length > 0 ? (
            <div className="space-y-1">
              {parsedUrls.slice(0, 5).map(u => (
                <div key={u} className="text-[11px] font-mono text-foreground/80 truncate">
                  {u.replace(/^https?:\/\/[^/]+/, '') || '/'}
                </div>
              ))}
              {parsedUrls.length > 5 && (
                <div className="text-[11px] text-muted-foreground/50">+{parsedUrls.length - 5} more</div>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground/50 italic">
              {preview.pageSource
                ? `Will pick up ${preview.pageCount} pages from your ${preview.pageSource}`
                : 'No URLs in command — will use existing workspace pages or GSC top pages'}
            </div>
          )}
        </div>

        {preview.location && (
          <div>
            <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Location: </span>
            <span className="text-[11px] text-foreground/80">{preview.location}</span>
          </div>
        )}
      </div>

      {/* What happens on confirm */}
      <div className="text-[11px] text-muted-foreground/65 leading-relaxed italic">
        On launch: creates the objective, links your site workspace, imports target pages, and seeds your Data Room. You'll then run baseline + audit from Site Manager.
      </div>

      {error && (
        <div className="text-[11px] text-rose-400 leading-relaxed">{error}</div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleLaunch} disabled={launching}
          className="px-4 py-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 text-xs font-bold transition-colors disabled:opacity-50">
          {launching ? 'Launching…' : 'Confirm & launch'}
        </button>
        <button onClick={onClose} disabled={launching}
          className="px-4 py-2 rounded-lg border border-border/50 bg-card/30 text-muted-foreground hover:text-foreground text-xs">
          Cancel
        </button>
      </div>
    </motion.div>
  );
}
