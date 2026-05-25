/* ════════════════════════════════════════════════════════════════
   src/components/season/SeasonModal.tsx
   Phase 8b — The global S.E.A.S.O.N. modal.

   Opens over any page when:
     • Orb is clicked
     • Cmd+K / Ctrl+K is pressed
     • open(query) is called programmatically from anywhere

   Has:
     • Backdrop blur (dim the underlying page)
     • Cinematic entrance (scale + fade, easeInOutCubic)
     • Glowing input matching current mood
     • Response panel with streaming chunks
     • Artifact panels
     • Quick-action chips
     • Esc to close
     • "Go to full briefing" link to /command

   It does NOT navigate the user away. The current page stays
   visible underneath. When you close the modal, you're back
   where you were. That's the contract.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Send, Sparkles, X, ExternalLink, AlertCircle, CheckCircle2, Layers, Lightbulb, AlertTriangle, Edit3 } from 'lucide-react';
import { useSeason, SeasonMood } from '@/contexts/SeasonContext';
import { useSeasonAction } from '@/hooks/useSeasonAction';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  seasonCommand, type CommandResponseClient, type PipelineType,
  /* Phase 21 Block 2 — quality foundation chat integration */
  seoRecommendCampaignStructure, seoCommitCampaignStructure,
  type CampaignStructureRecommendation, type ProjectPositioning,
  /* Phase 21 Block 2.5 — URL targeting + grounded chat */
  seoClassifyIntent, seoChatSuggestions, seoExploreKeyword,
  type ChatSuggestion, type ToolsStatus, type ExplorationResponseClient,
  type UrlFitAnalysis,
} from '@/components/pm/api';
import SeasonPipelineDashboard from './SeasonPipelineDashboard';
import { writeHandoff } from './ChatHandoff';

/* Mood → color (matches the Orb's profile) */
const MOOD_HSL: Record<SeasonMood, string> = {
  calm:        '186 80% 55%',
  focused:     '262 75% 60%',
  alert:       '38 92% 55%',
  critical:    '0 75% 55%',
  celebrating: '152 70% 50%',
  thinking:    '210 80% 60%',
  quiet:       '210 50% 55%',  // a touch warmer than orb-quiet for legibility
};

const DEFAULT_CHIPS = [
  { label: 'Diagnose',                q: 'diagnose',                      urgent: true  },
  { label: 'Summarize this week',     q: 'Summarize this week',           urgent: false },
  { label: 'What needs me today?',    q: 'What needs me today?',          urgent: false },
  { label: 'Compute intelligence',    q: 'compute analytics intelligence',urgent: false },
  { label: 'Where do these numbers come from?', q: 'verify',              urgent: false },
];

/* Awareness-aware chips: when we know what page you're on,
   suggest questions that fit. Always keep Diagnose at the top. */
function chipsForAwareness(awareness: any): Array<{ label: string; q: string; urgent?: boolean }> {
  if (!awareness?.page) return DEFAULT_CHIPS;
  const page = awareness.page;
  const sel  = awareness.selected;

  if (page === 'audit') {
    return [
      { label: 'Diagnose', q: 'diagnose', urgent: true },
      ...(sel?.type === 'audit'
        ? [{ label: 'Explain this audit score', q: `explain this audit and what the score means` }]
        : []),
      { label: 'What should I fix first?',          q: 'What top issues should I prioritize from this audit?' },
      { label: 'Draft a remediation plan',          q: 'Draft a remediation plan based on the latest audit' },
      { label: 'Compare audits over time',          q: 'How have audit scores changed for this project?' },
    ];
  }
  if (page === 'planning') {
    return [
      { label: 'Diagnose', q: 'diagnose', urgent: true },
      ...(sel?.type === 'strategy'
        ? [
            { label: 'Explain this strategy', q: 'explain this strategy and why it might be slipping' },
            { label: 'What\'s blocking it?',  q: 'what is blocking this strategy?' },
          ]
        : []),
      { label: 'Which strategy needs attention?',  q: 'which active strategy needs my attention most?' },
      { label: 'Draft a new strategy',              q: 'Draft a strategy plan I could finalize next' },
    ];
  }
  if (page === 'data-room') {
    const tab = awareness.visible_filters?.tab || 'this tab';
    return [
      { label: 'Diagnose', q: 'diagnose', urgent: true },
      { label: `What does ${tab} mean?`,       q: `What does the ${tab} tab in Data Room hold and how do I use it?` },
      { label: 'What needs filling in here?',  q: `What fields on the ${tab} tab are empty or stale?` },
      { label: 'Summarize this week',          q: 'Summarize this week' },
      { label: 'Verify these numbers',          q: 'Where do these numbers come from?' },
    ];
  }
  if (page === 'dashboard') {
    return [
      { label: 'Diagnose', q: 'diagnose', urgent: true },
      { label: 'How is this project doing?', q: 'How is this project doing overall?' },
      { label: 'What needs me today?',       q: 'What needs me today?' },
      { label: 'Summarize this week',         q: 'Summarize this week' },
      { label: 'Compute intelligence',        q: 'compute analytics intelligence' },
    ];
  }
  if (page === 'launchpad') {
    return [
      { label: 'Diagnose', q: 'diagnose', urgent: true },
      { label: 'What does Launchpad show me?', q: 'Explain what Launchpad data tells me and how to act on it' },
      { label: 'What should I prioritize?',     q: 'Based on Launchpad, what should I prioritize?' },
    ];
  }
  if (page === 'algorithm-intel') {
    return [
      { label: 'Diagnose', q: 'diagnose', urgent: true },
      { label: 'Anything I should learn?',       q: 'Are there fresh algorithm learnings I should know about?' },
      { label: 'Apply to my project',             q: 'How do recent algorithm signals affect my current strategies?' },
    ];
  }
  /* Fallback */
  return DEFAULT_CHIPS;
}

export default function SeasonModal() {
  const { isOpen, close, initialQuery, mood, setMood, awareness, settings } = useSeason();
  const { run: runAction, confirm: confirmAction, cancel: cancelAction, pendingConfirm, running: actionRunning } = useSeasonAction();
  const { selectedProjectId } = useProject() as any;
  const { projects } = useAuth() as any;
  const navigate = useNavigate();

  const [input, setInput]               = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [response, setResponse]         = useState<CommandResponseClient | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const inputRef                        = useRef<HTMLInputElement | null>(null);

  /* Phase 13a — live pipeline dashboard state.
     When a pipeline launches, we get a run_id and switch from the modal
     into the full-screen live dashboard. Once the run completes (or fails),
     the dashboard surfaces final artifacts and the user can close back to
     the modal or to a fresh state. */
  const [activeRunId, setActiveRunId]                 = useState<string | null>(null);
  const [activeRunStepCount, setActiveRunStepCount]   = useState<number>(0);
  const [activeRunLabel, setActiveRunLabel]           = useState<string>('');
  const [activeRunType, setActiveRunType]             = useState<PipelineType>('rank_for_keyword');

  /* Phase 21 Block 2 — campaign structure preview state.
     When user types multi-keyword input, we don't launch immediately —
     we run the orchestrator first, show a conversational preview, and
     let the user confirm before committing. */
  const [pendingStructure, setPendingStructure]           = useState<CampaignStructureRecommendation | null>(null);
  const [pendingPositioning, setPendingPositioning]       = useState<ProjectPositioning | null>(null);
  const [pendingOriginalInput, setPendingOriginalInput]   = useState<string>('');
  const [committingStructure, setCommittingStructure]     = useState(false);
  const [structureAcceptFollowups, setStructureAcceptFollowups] = useState<Set<number>>(new Set());
  const [structureAcceptOpps, setStructureAcceptOpps]     = useState<Set<number>>(new Set());

  /* Phase 21 Block 2.5 — grounded chat state */
  const [chatSuggestions, setChatSuggestions]             = useState<ChatSuggestion[]>([]);
  const [suggestionsNote, setSuggestionsNote]             = useState<string | null>(null);
  const [toolsStatus, setToolsStatus]                     = useState<ToolsStatus | null>(null);
  const [explorationResponse, setExplorationResponse]     = useState<ExplorationResponseClient | null>(null);
  const [loadingExploration, setLoadingExploration]       = useState(false);

  const moodHsl       = MOOD_HSL[mood] || MOOD_HSL.quiet;
  const isMac         = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  /* Resolve project name for the header */
  const projectName = (() => {
    if (!selectedProjectId) return 'no project selected';
    const p = (projects || []).find((x: any) => x?.id === selectedProjectId);
    return (p as any)?.project_name || (p as any)?.name || 'project ' + selectedProjectId.slice(0, 8);
  })();

  /* Auto-fill initial query if provided */
  useEffect(() => {
    if (isOpen && initialQuery) {
      setInput(initialQuery);
      /* Auto-submit if it came pre-filled */
      const t = setTimeout(() => submit(initialQuery), 80);
      return () => clearTimeout(t);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [isOpen, initialQuery]);

  /* Reset when closed */
  useEffect(() => {
    if (!isOpen) {
      setInput('');
      setResponse(null);
      setError(null);
      setSubmitting(false);
      setMood('quiet');
      /* Phase 21 Block 2 — clear pending structure preview too */
      setPendingStructure(null);
      setPendingPositioning(null);
      setPendingOriginalInput('');
      setStructureAcceptFollowups(new Set());
      setStructureAcceptOpps(new Set());
      setCommittingStructure(false);
      /* Phase 21 Block 2.5 — clear suggestions + exploration */
      setChatSuggestions([]);
      setSuggestionsNote(null);
      setExplorationResponse(null);
      setLoadingExploration(false);
    } else {
      /* Focus input shortly after open */
      const t = setTimeout(() => inputRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [isOpen]);

  /* Phase 21 Block 2.5 — debounced suggestions when typing rank intent.
     Surfaces GSC opportunities, existing campaigns, and inbox opportunities.
     Every suggestion carries a source citation. No fabrication. */
  useEffect(() => {
    if (!isOpen || !selectedProjectId) {
      setChatSuggestions([]);
      setSuggestionsNote(null);
      return;
    }
    /* Only query when input looks rank-related AND has at least a few chars */
    const looksRankRelated = /\b(rank|target|campaign)\b/i.test(input);
    if (!looksRankRelated || input.length < 4) {
      setChatSuggestions([]);
      setSuggestionsNote(null);
      return;
    }
    /* Skip if a structure preview or exploration response is open */
    if (pendingStructure || explorationResponse) return;

    const handle = setTimeout(async () => {
      try {
        const r = await seoChatSuggestions({ projectId: selectedProjectId, partialInput: input });
        if (r.error) return;
        setChatSuggestions(r.suggestions || []);
        setSuggestionsNote(r.honest_note || null);
        if (r.tools_status) setToolsStatus(r.tools_status);
      } catch { /* swallow — UX-only feature */ }
    }, 380);   // debounce so we don't query every keystroke
    return () => clearTimeout(handle);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [input, isOpen, selectedProjectId, pendingStructure, explorationResponse]);

  /* Phase 17.5.4 — listen for external requests to open the live pipeline dashboard.
     Used by the campaign panel's "Refresh from audit" button: when the panel
     triggers a refresh, it dispatches `season:open-pipeline-dashboard` so the
     same 8-block visualization the user saw on first campaign launch reappears.
     Without this, the panel's tiny inline progress strip is all the user sees,
     which is what prompted Manav to ask "why am I not seeing the visual campaign?".

     The dashboard component renders OUTSIDE the modal's open/close gate (see
     <AnimatePresence> below) — it appears whenever activeRunId is set,
     independent of whether the SEASON modal panel itself is open. So we
     just set the run state; the dashboard mounts on its own.

     Event detail shape: { runId, pipelineType, stepCount, label } */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        runId?: string;
        pipelineType?: PipelineType;
        stepCount?: number;
        label?: string;
      } | undefined;
      if (!detail?.runId) return;
      setActiveRunId(detail.runId);
      setActiveRunStepCount(detail.stepCount || 8);
      setActiveRunLabel(detail.label || 'Pipeline run');
      setActiveRunType(detail.pipelineType || 'rank_for_keyword');
    };
    window.addEventListener('season:open-pipeline-dashboard', handler);
    return () => window.removeEventListener('season:open-pipeline-dashboard', handler);
  }, []);

  /* Phase 21 Block 2 — commit the campaign structure and launch the pipeline.
     This is what fires when the user clicks "Yes, set it up" in the preview
     panel. Two steps:
       1. seoCommitCampaignStructure — creates primary campaign with full
          metadata, plus opportunities for excluded keywords + suggested
          followup campaigns.
       2. seasonPipelineCreate — launches the actual pipeline against the
          primary keyword + group, with scope.campaignId so the runner
          doesn't try to re-create the campaign. */
  const commitStructureAndLaunch = async () => {
    if (!pendingStructure || !selectedProjectId || committingStructure) return;
    setCommittingStructure(true);
    setError(null);
    setMood('thinking');

    try {
      /* Step 1 — commit the structure (creates primary campaign + opportunities) */
      const commitResult = await seoCommitCampaignStructure({
        projectId:               selectedProjectId,
        structure:               pendingStructure,
        positioning:             pendingPositioning || undefined,
        acceptFollowupCampaigns: Array.from(structureAcceptFollowups),
        acceptOpportunities:     Array.from(structureAcceptOpps),
      });
      if (commitResult.error || !commitResult.primary_campaign_id) {
        setError(`Setup failed: ${commitResult.error || 'no campaign id returned'}`);
        setMood('alert');
        setCommittingStructure(false);
        return;
      }

      /* Step 2 — launch the pipeline against the new campaign */
      const primaryKws = pendingStructure.primary_campaign.keywords;
      const { seasonPipelineCreate } = await import('@/components/pm/api');
      const runResult = await seasonPipelineCreate({
        projectId:    selectedProjectId,
        pipelineType: 'rank_for_keyword',
        inputText:    pendingOriginalInput,
        scope: {
          campaignId:    commitResult.primary_campaign_id,
          keyword:       primaryKws[0],
          keywordGroup:  primaryKws,
          goal:          `Rank for ${primaryKws.map(k => `"${k}"`).join(', ')}`,
        },
      });
      if (runResult.error || !runResult.run_id) {
        setError(`Pipeline launch failed: ${runResult.error || 'no run id returned'} (campaign was created — check campaigns list)`);
        setMood('alert');
        setCommittingStructure(false);
        return;
      }

      /* Success — open the live dashboard */
      setActiveRunId(runResult.run_id);
      setActiveRunStepCount(runResult.step_count || 7);
      setActiveRunLabel(
        primaryKws.length === 1
          ? `Ranking for "${primaryKws[0]}"`
          : `Ranking for "${primaryKws[0]}" + ${primaryKws.length - 1} more`
      );
      setActiveRunType('rank_for_keyword');
      setMood('focused');

      /* Clear pending state */
      setPendingStructure(null);
      setPendingPositioning(null);
      setPendingOriginalInput('');
      setStructureAcceptFollowups(new Set());
      setStructureAcceptOpps(new Set());
      setInput('');
      setResponse(null);
      setCommittingStructure(false);
      close();
    } catch (e: any) {
      setError(`Setup error: ${e?.message || 'unknown'}`);
      setMood('alert');
      setCommittingStructure(false);
    }
  };

  /* Cancel the pending structure preview — return to input */
  const cancelStructure = () => {
    setPendingStructure(null);
    setPendingPositioning(null);
    setPendingOriginalInput('');
    setStructureAcceptFollowups(new Set());
    setStructureAcceptOpps(new Set());
    setMood('quiet');
  };

  /* Edit — return to input with the original text restored for adjustment */
  const editStructureInput = () => {
    setInput(pendingOriginalInput);
    cancelStructure();
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  /* Submit handler */
  const submit = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || submitting) return;
    if (!selectedProjectId) {
      setError('Pick a project first — I need to know which one to think about.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setMood('thinking');

    /* Phase 12 → Phase 13a → Phase 21 Block 2 → Block 2.5 pipeline intent.
       Block 2.5 changes:
         - Classify intent first (commitment | exploration | question)
         - Commitment → run orchestrator → preview → confirm → launch
         - Exploration → produce grounded read with sources → next-step options
         - Question → falls through to the existing LLM brain */
    let routedAsCommitment = false;
    let routedAsExploration = false;
    try {
      const classification = await seoClassifyIntent({ text: q });
      if (classification.intent === 'commitment') routedAsCommitment = true;
      else if (classification.intent === 'exploration') routedAsExploration = true;
    } catch {
      /* Fallback to a fast regex if classification API fails */
      if (/(?:^|\s)(rank(?:ing)?\s+(?:me\s+)?for|get\s+(?:me\s+)?ranking\s+for|target\s+keywords?|seo\s+for)\b/i.test(q)) {
        routedAsCommitment = true;
      }
    }

    if (routedAsCommitment) {
      try {
        setMood('thinking');
        const recResult = await seoRecommendCampaignStructure({
          projectId: selectedProjectId,
          rawInput:  q,
        });
        if (recResult.error || !recResult.structure) {
          setError(`Couldn't read those keywords cleanly — ${recResult.error || 'no structure returned'}. Try rephrasing, or just give me one keyword to start.`);
          setMood('alert');
          setSubmitting(false);
          return;
        }
        /* Show the structure preview — user confirms before commit */
        setPendingStructure(recResult.structure);
        setPendingPositioning(recResult.positioning || null);
        setPendingOriginalInput(q);
        /* By default, accept all suggested followups + opportunities (user can deselect) */
        setStructureAcceptFollowups(new Set(recResult.structure.suggested_followup_campaigns.map((_, i) => i)));
        setStructureAcceptOpps(new Set(recResult.structure.opportunities_to_create.map((_, i) => i)));
        setChatSuggestions([]);   // clear suggestions while preview is shown
        setMood('focused');
        setSubmitting(false);
        return;
      } catch (e: any) {
        setError(`Couldn't analyze that — ${e?.message || 'unknown error'}. Try with simpler input.`);
        setMood('alert');
        setSubmitting(false);
        return;
      }
    }

    if (routedAsExploration) {
      try {
        setMood('thinking');
        setLoadingExploration(true);
        /* Extract keyword from exploration input — strip leading "what about" / "should I rank for" etc. */
        const explKw = q
          .replace(/^(?:what\s+about|should\s+(?:i|we)\s+(?:rank|target|pursue|go\s+after)|(?:can|could)\s+(?:i|we)\s+rank\s+for|is|tell\s+me\s+about|show\s+me\s+about|explore\s+(?:ranking\s+for|the\s+keyword)|worth\s+ranking\s+for)\s+/i, '')
          .replace(/^["']?|["'?.!]+$/g, '')
          .trim()
          .toLowerCase();
        if (!explKw || explKw.length < 2) {
          setError('Tell me which keyword you want to explore (e.g. "what about app maker?").');
          setMood('alert');
          setLoadingExploration(false);
          setSubmitting(false);
          return;
        }
        const r = await seoExploreKeyword({ projectId: selectedProjectId, keyword: explKw });
        setLoadingExploration(false);
        if (r.error || !r.response) {
          setError(`Couldn't explore "${explKw}" — ${r.error || 'no response'}.`);
          setMood('alert');
          setSubmitting(false);
          return;
        }
        setExplorationResponse(r.response);
        setChatSuggestions([]);
        setMood('focused');
        setSubmitting(false);
        return;
      } catch (e: any) {
        setError(`Exploration failed — ${e?.message || 'unknown'}.`);
        setMood('alert');
        setLoadingExploration(false);
        setSubmitting(false);
        return;
      }
    }

    /* Phase 10b — try the action registry first for direct UI commands.
       If the input looks like "open X tab", "switch to Y", "back to board",
       etc., we can dispatch immediately without round-tripping to the LLM. */
    try {
      const lc = q.toLowerCase();
      /* Tab name extraction for Data Room — looks for the tab token */
      const tabMatch = lc.match(/(?:open|show|switch to|go to|jump to)\s+(?:the\s+)?(overview|goals|cms|access|analytics|technical|competitors|documents|crawl|identity|audience|content|backlinks|commercial|history|brand[\s_-]?narrative|access[\s_-]?vault|content[\s_-]?library|info[\s_-]?repository|approvals[\s_-]?log)(?:\s+tab)?/i);
      if (tabMatch) {
        const tab = tabMatch[1].toLowerCase().replace(/[\s-]+/g, '_');
        const r = await runAction('data_room_set_tab', { tab });
        if (r.ok && !r.awaiting_confirm) {
          setSubmitting(false); setMood('calm');
          if (r.navigated) close();
          return;
        }
      }
      /* Direct keyword: pipeline / board */
      if (/back to (board|planning)|pipeline board|strategy board/i.test(lc)) {
        const r = await runAction('planning_open_board', {});
        if (r.ok && !r.awaiting_confirm) {
          setSubmitting(false); setMood('calm');
          if (r.navigated) close();
          return;
        }
      }
      /* refresh briefing */
      if (/refresh briefing|reload briefing|re[\s-]?pull/i.test(lc)) {
        const r = await runAction('refresh_briefing', {});
        if (r.ok && !r.awaiting_confirm) {
          setSubmitting(false); setMood('calm');
          if (r.navigated) close();
          return;
        }
      }
      /* explicit "open settings" */
      if (/^(open\s+)?(season\s+)?settings$/i.test(q)) {
        const r = await runAction('navigate_season_settings', {});
        if (r.ok && r.navigated) { close(); return; }
      }
    } catch { /* registry path failed; fall through to backend */ }

    /* Backend orchestrator (keyword router → LLM brain) */
    try {
      const r = await seasonCommand({
        projectId: selectedProjectId,
        input: q,
        awareness: awareness || undefined,
        web_access: settings.web_access,
      });
      if (r.error) {
        setError(r.error);
        setMood('alert');
      } else if (r.response) {
        setResponse(r.response);
        /* Derive mood from confidence + intent */
        if (r.response.intent === 'diagnose') setMood('focused');
        else if (r.response.confidence < 0.4) setMood('alert');
        else if (r.response.intent === 'compute_intel') setMood('celebrating');
        else setMood('calm');
      }
    } catch (e: any) {
      setError(e?.message || 'something went wrong');
      setMood('alert');
    } finally {
      setSubmitting(false);
    }
  };

  /* Clicking a chip */
  const useChip = (q: string) => {
    setInput(q);
    submit(q);
  };

  /* Render */
  return (
    <>
      {/* Phase 13a — live pipeline dashboard. Stays mounted while a run is active,
          independent of the modal's open/closed state. */}
      <AnimatePresence>
        {activeRunId && (
          <SeasonPipelineDashboard
            key={activeRunId}
            runId={activeRunId}
            expectedSteps={activeRunStepCount}
            pipelineLabel={activeRunLabel}
            pipelineType={activeRunType}
            onClose={() => {
              setActiveRunId(null);
              setActiveRunStepCount(0);
              setActiveRunLabel('');
            }}
            onComplete={(run) => {
              /* When the run completes, drop a synthesized response into the modal
                 so reopening Cmd+K shows the final summary. The dashboard itself
                 stays visible (with the completion state) until the user closes it. */
              setResponse({
                intent: 'pipeline_run',
                confidence: run.status === 'completed' ? 0.9 : 0.6,
                chunks: [
                  { kind: 'plain', content: `Pipeline ${run.status}. ${run.steps_completed}/${run.step_count} steps.` },
                  { kind: 'plain', content: run.honest_summary || '' },
                  { kind: 'verify', content: `Run id: ${run.id}` },
                ] as any,
                artifacts: (run.final_artifacts || []).map((a: any) => ({
                  kind: a.kind, title: a.title, body: a.body,
                })),
                honest_note: run.status !== 'completed' ? 'Pipeline did not complete fully — see honest summary.' : undefined,
              } as any);
              setMood(run.status === 'completed' ? 'celebrating' : 'alert');
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="season-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={close}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 9999,
            }}
          />

          {/* Centering container — uses flex so it doesn't conflict with the inner modal's
              animated transform (Framer Motion's animated y/scale clobbers any
              transform set via inline style). Pointer-events none so backdrop clicks
              still reach the backdrop layer underneath. */}
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}>
            {/* Modal */}
            <motion.div
              key="season-modal"
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                width: 'min(720px, 100%)',
                maxHeight: 'min(720px, calc(100vh - 32px))',
                borderRadius: 20,
                border: `1px solid hsla(${moodHsl} / 0.3)`,
                background: 'rgba(15, 16, 24, 0.96)',
                boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 60px hsla(${moodHsl} / 0.15)`,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                pointerEvents: 'auto',
              }}
            >
            {/* Top aura glow */}
            <motion.div
              animate={{ opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                top: -120,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 480,
                height: 200,
                background: `radial-gradient(ellipse, hsla(${moodHsl} / 0.35) 0%, transparent 70%)`,
                pointerEvents: 'none',
                filter: 'blur(20px)',
              }}
            />

            {/* Header */}
            <div style={{
              position: 'relative',
              padding: '14px 20px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Sparkles size={14} style={{ color: `hsl(${moodHsl})` }} />
                <div>
                  <div style={{
                    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em',
                    fontWeight: 700, color: `hsl(${moodHsl})`,
                  }}>
                    S.E.A.S.O.N.
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
                    {projectName}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => {
                    /* Phase 21 Block 2.11 Phase A — chat-as-bridge.
                       Capture in-flight state so /command can restore it. */
                    writeHandoff({
                      source:               'modal_orb',
                      source_project_id:    selectedProjectId || undefined,
                      input:                input,
                      response:             response,
                      exploration:          explorationResponse,
                      pending_structure:    pendingStructure,
                      pending_positioning:  pendingPositioning,
                      pending_original:     pendingOriginalInput,
                      chat_suggestions:     chatSuggestions,
                      suggestions_note:     suggestionsNote,
                    });
                    close();
                    setTimeout(() => navigate('/command'), 100);
                  }}
                  title="Open the full briefing page — your chat state will follow"
                  style={{
                    fontSize: 10, padding: '5px 9px', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'transparent', color: 'rgba(255,255,255,0.55)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  <ExternalLink size={10} /> Full briefing
                </button>
                <button
                  onClick={close}
                  title="Close (Esc)"
                  style={{
                    padding: 6, borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'transparent', color: 'rgba(255,255,255,0.6)',
                    cursor: 'pointer', display: 'flex',
                  }}>
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Body — scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, position: 'relative' }}>

              {/* Awareness chip — shows what S.E.A.S.O.N. knows is on screen */}
              {awareness && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginBottom: 12,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: `1px solid hsla(${moodHsl} / 0.18)`,
                    background: `hsla(${moodHsl} / 0.04)`,
                    fontSize: 10.5,
                    color: 'rgba(255,255,255,0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}>
                  <span style={{ color: `hsl(${moodHsl})`, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 9 }}>
                    aware
                  </span>
                  <span>you're on</span>
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
                    {awareness.page_label || awareness.page}
                  </span>
                  {awareness.selected && (
                    <>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span>looking at</span>
                      <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
                        {awareness.selected.type}: {awareness.selected.title || awareness.selected.id?.slice(0, 8) || 'item'}
                      </span>
                    </>
                  )}
                  {awareness.visible_filters && Object.keys(awareness.visible_filters).length > 0 && (
                    <>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span style={{ opacity: 0.7 }}>filters active</span>
                    </>
                  )}
                </motion.div>
              )}

              {/* Input */}
              <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <div style={{ position: 'relative' }}>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask S.E.A.S.O.N. anything…"
                    disabled={submitting}
                    style={{
                      width: '100%',
                      padding: '14px 56px 14px 18px',
                      borderRadius: 14,
                      border: `1px solid hsla(${moodHsl} / 0.3)`,
                      background: 'rgba(0,0,0,0.4)',
                      color: 'rgba(255,255,255,0.95)',
                      fontSize: 15,
                      outline: 'none',
                      boxShadow: `0 0 0 0 transparent, 0 0 24px hsla(${moodHsl} / 0.1) inset`,
                      transition: 'box-shadow 0.2s, border-color 0.2s',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.boxShadow = `0 0 0 2px hsla(${moodHsl} / 0.25), 0 0 24px hsla(${moodHsl} / 0.2) inset`;
                      e.currentTarget.style.borderColor = `hsla(${moodHsl} / 0.6)`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.boxShadow = `0 0 0 0 transparent, 0 0 24px hsla(${moodHsl} / 0.1) inset`;
                      e.currentTarget.style.borderColor = `hsla(${moodHsl} / 0.3)`;
                    }}
                  />
                  <button
                    type="submit"
                    disabled={submitting || !input.trim()}
                    style={{
                      position: 'absolute',
                      right: 8, top: '50%', transform: 'translateY(-50%)',
                      padding: 8, borderRadius: 10,
                      border: 'none',
                      background: input.trim() && !submitting ? `hsla(${moodHsl} / 0.2)` : 'transparent',
                      color: input.trim() && !submitting ? `hsl(${moodHsl})` : 'rgba(255,255,255,0.25)',
                      cursor: input.trim() && !submitting ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}>
                    <Send size={16} />
                  </button>
                </div>
              </form>

              {/* Pending confirmation — when an action awaits "tap to confirm" */}
              <AnimatePresence>
                {pendingConfirm && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      marginTop: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: `1px solid hsla(${
                        pendingConfirm.action.permission === 'destructive' ? '0 75% 55%' : moodHsl
                      } / 0.35)`,
                      background: `hsla(${
                        pendingConfirm.action.permission === 'destructive' ? '0 75% 55%' : moodHsl
                      } / 0.06)`,
                    }}>
                    <div style={{
                      fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em',
                      fontWeight: 700, color: `hsl(${
                        pendingConfirm.action.permission === 'destructive' ? '0 75% 60%' : moodHsl
                      })`, marginBottom: 4,
                    }}>
                      {pendingConfirm.action.permission === 'destructive'
                        ? '⚠ Confirm destructive action'
                        : 'Confirm this action'}
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)', fontWeight: 600 }}>
                      {pendingConfirm.action.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 3, lineHeight: 1.5 }}>
                      {pendingConfirm.action.description}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <button
                        disabled={actionRunning}
                        onClick={async () => {
                          const r = await confirmAction();
                          if (r.ok && r.navigated) close();
                        }}
                        style={{
                          fontSize: 11, padding: '5px 12px', borderRadius: 8,
                          border: `1px solid hsla(${
                            pendingConfirm.action.permission === 'destructive' ? '0 75% 55%' : moodHsl
                          } / 0.4)`,
                          background: `hsla(${
                            pendingConfirm.action.permission === 'destructive' ? '0 75% 55%' : moodHsl
                          } / 0.18)`,
                          color: `hsl(${
                            pendingConfirm.action.permission === 'destructive' ? '0 75% 60%' : moodHsl
                          })`,
                          cursor: actionRunning ? 'wait' : 'pointer',
                          fontWeight: 700,
                          opacity: actionRunning ? 0.5 : 1,
                        }}>
                        {actionRunning ? 'Running…' : 'Yes, do it'}
                      </button>
                      <button
                        disabled={actionRunning}
                        onClick={cancelAction}
                        style={{
                          fontSize: 11, padding: '5px 12px', borderRadius: 8,
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: 'transparent',
                          color: 'rgba(255,255,255,0.65)',
                          cursor: 'pointer',
                        }}>
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ════════════════════════════════════════════════════════════
                    Phase 21 Block 2 — Campaign structure preview
                    Renders after user types "rank me for X, Y, Z" — shows the
                    smart-grouped structure with personality, then user confirms.
                ════════════════════════════════════════════════════════════ */}
                {pendingStructure && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.25 }}
                    style={{
                      marginTop: 12,
                      padding: '14px 16px',
                      borderRadius: 14,
                      border: `1px solid hsla(${moodHsl} / 0.35)`,
                      background: `hsla(${moodHsl} / 0.06)`,
                      maxHeight: '60vh',
                      overflowY: 'auto',
                    }}>

                    {/* Header — what I understood */}
                    <div style={{
                      fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em',
                      fontWeight: 700, color: `hsl(${moodHsl})`, marginBottom: 6,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Sparkles size={11} />
                      Reading these
                    </div>

                    {/* Conversational intro — personality. Adjusts to the structure. */}
                    {(() => {
                      const primaryKws    = pendingStructure.primary_campaign.keywords;
                      const followupCount = pendingStructure.suggested_followup_campaigns.length;
                      const oppCount      = pendingStructure.opportunities_to_create.length;
                      const dupeCount     = pendingStructure.duplicates_detected.length;
                      const btCount       = pendingStructure.better_target_detected.length;
                      const coherence     = pendingStructure.primary_campaign.coherence_score;

                      let opener = '';
                      if (primaryKws.length === 1 && followupCount === 0 && oppCount === 0) {
                        opener = `Single keyword campaign — clean and focused. Setting up for "${primaryKws[0]}".`;
                      } else if (coherence >= 0.8) {
                        opener = `These cluster tightly — same intent, same audience. Solid keyword group.`;
                      } else if (coherence >= 0.5) {
                        opener = `Mostly coherent, with some natural splits. I've grouped the tightest ${primaryKws.length} into the primary campaign.`;
                      } else if (primaryKws.length > 1) {
                        opener = `Mixed signals here — different intents in one ask. Picked the ${primaryKws.length} that cohere best and parked the rest.`;
                      } else {
                        opener = `Working with what fits. ${primaryKws.length} keyword in primary, the rest routed elsewhere.`;
                      }

                      return (
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)', lineHeight: 1.5, marginBottom: 10 }}>
                          {opener}
                        </div>
                      );
                    })()}

                    {/* Primary campaign block */}
                    <div style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.03)',
                      marginBottom: 10,
                    }}>
                      <div style={{
                        fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
                        color: 'rgba(255,255,255,0.55)', marginBottom: 6,
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        <Layers size={11} /> Primary campaign · {pendingStructure.primary_campaign.keywords.length} keyword{pendingStructure.primary_campaign.keywords.length === 1 ? '' : 's'}
                        <span style={{
                          marginLeft: 'auto', fontSize: 9,
                          padding: '1px 6px', borderRadius: 999,
                          background: pendingStructure.primary_campaign.coherence_score >= 0.7
                            ? 'hsla(152 70% 50% / 0.18)'
                            : pendingStructure.primary_campaign.coherence_score >= 0.5
                              ? 'hsla(38 92% 55% / 0.18)'
                              : 'hsla(0 75% 55% / 0.18)',
                          color: pendingStructure.primary_campaign.coherence_score >= 0.7
                            ? 'hsl(152 70% 60%)'
                            : pendingStructure.primary_campaign.coherence_score >= 0.5
                              ? 'hsl(38 92% 60%)'
                              : 'hsl(0 75% 65%)',
                        }}>
                          coherence {pendingStructure.primary_campaign.coherence_score.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                        {pendingStructure.primary_campaign.keywords.map((kw, i) => (
                          <span key={i} style={{
                            fontSize: 12,
                            padding: '3px 9px', borderRadius: 999,
                            background: i === 0 ? `hsla(${moodHsl} / 0.18)` : 'rgba(255,255,255,0.06)',
                            color: i === 0 ? `hsl(${moodHsl})` : 'rgba(255,255,255,0.85)',
                            fontWeight: i === 0 ? 600 : 400,
                            border: i === 0 ? `1px solid hsla(${moodHsl} / 0.3)` : '1px solid rgba(255,255,255,0.08)',
                          }}>
                            {i === 0 && '★ '}{kw}
                          </span>
                        ))}
                      </div>
                      {pendingStructure.primary_campaign.intent_label && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 4, fontStyle: 'italic' }}>
                          Intent: {pendingStructure.primary_campaign.intent_label}
                        </div>
                      )}
                    </div>

                    {/* ──────────────────────────────────────────────────
                        Phase 21 Block 2.5 — URL fit analysis
                        Renders when user provided per-keyword URL mapping.
                        Each URL shows real fetch result + grounded fit verdict
                        per keyword, with citations from real page content.
                    ────────────────────────────────────────────────── */}
                    {(pendingStructure as any).url_fit_analysis && Object.keys((pendingStructure as any).url_fit_analysis).length > 0 && (
                      <div style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.02)',
                        marginBottom: 10,
                      }}>
                        <div style={{
                          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
                          color: 'rgba(255,255,255,0.55)', marginBottom: 6,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                          <ExternalLink size={11} /> Target URL fit · {Object.keys((pendingStructure as any).url_fit_analysis).length}
                        </div>
                        {Object.entries((pendingStructure as any).url_fit_analysis as Record<string, UrlFitAnalysis>).map(([url, analysis], i) => (
                          <div key={i} style={{
                            padding: '8px 0',
                            borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                          }}>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: 600, marginBottom: 3 }}>
                              {url}
                            </div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 5, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {analysis.status_text === 'ok'
                                ? <span style={{ color: 'hsl(152 70% 60%)' }}>✓ Fetched live ({analysis.status_code}, {analysis.word_count} words)</span>
                                : <span style={{ color: 'hsl(0 75% 65%)' }}>✗ Fetch failed: {analysis.status_text}</span>}
                              {!analysis.is_indexable && <span style={{ color: 'hsl(0 75% 65%)' }}>⚠ Not indexable</span>}
                              {analysis.h1 && <span>H1: "{analysis.h1.slice(0, 60)}"</span>}
                            </div>
                            {Object.entries(analysis.fit_per_keyword).map(([kw, fit], j) => (
                              <div key={j} style={{
                                padding: '6px 9px',
                                borderRadius: 6,
                                marginTop: 4,
                                background: fit.verdict === 'strong_fit'
                                  ? 'hsla(152 70% 50% / 0.08)'
                                  : fit.verdict === 'partial_fit'
                                    ? 'hsla(38 92% 55% / 0.08)'
                                    : fit.verdict === 'poor_fit'
                                      ? 'hsla(0 75% 55% / 0.08)'
                                      : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${
                                  fit.verdict === 'strong_fit'
                                    ? 'hsla(152 70% 50% / 0.2)'
                                    : fit.verdict === 'partial_fit'
                                      ? 'hsla(38 92% 55% / 0.2)'
                                      : fit.verdict === 'poor_fit'
                                        ? 'hsla(0 75% 55% / 0.2)'
                                        : 'rgba(255,255,255,0.08)'
                                }`,
                              }}>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginBottom: 2 }}>
                                  <strong>"{kw}"</strong>
                                  <span style={{
                                    marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                                    background: 'rgba(255,255,255,0.06)',
                                    color: fit.verdict === 'strong_fit'
                                      ? 'hsl(152 70% 60%)'
                                      : fit.verdict === 'partial_fit'
                                        ? 'hsl(38 92% 60%)'
                                        : fit.verdict === 'poor_fit'
                                          ? 'hsl(0 75% 65%)'
                                          : 'rgba(255,255,255,0.55)',
                                  }}>
                                    {fit.verdict.replace(/_/g, ' ')}
                                  </span>
                                </div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>
                                  {fit.reasoning}
                                </div>
                                {fit.citations.length > 0 && (
                                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', marginTop: 3, lineHeight: 1.3, fontStyle: 'italic' }}>
                                    Cited from page: {fit.citations.map(c => `"${c}"`).join(', ')}
                                  </div>
                                )}
                              </div>
                            ))}
                            {analysis.honest_note && (
                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 4, fontStyle: 'italic' }}>
                                {analysis.honest_note}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Warnings — better-target redirect */}
                    {pendingStructure.better_target_detected.length > 0 && (
                      <div style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid hsla(38 92% 55% / 0.3)',
                        background: 'hsla(38 92% 55% / 0.06)',
                        marginBottom: 10,
                      }}>
                        <div style={{
                          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
                          color: 'hsl(38 92% 65%)', marginBottom: 5,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                          <AlertTriangle size={11} /> Heads up — existing campaign is a better fit
                        </div>
                        {pendingStructure.better_target_detected.map((bt, i) => (
                          <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4, lineHeight: 1.5 }}>
                            For <strong>{bt.keywords.join(', ')}</strong>: {bt.reasoning} <span style={{ color: 'rgba(255,255,255,0.5)' }}>(existing campaign: "{bt.existing_campaign_keyword}")</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Warnings — duplicate */}
                    {pendingStructure.duplicates_detected.length > 0 && (
                      <div style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid hsla(0 75% 55% / 0.3)',
                        background: 'hsla(0 75% 55% / 0.06)',
                        marginBottom: 10,
                      }}>
                        <div style={{
                          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
                          color: 'hsl(0 75% 65%)', marginBottom: 5,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                          <AlertCircle size={11} /> Duplicate work prevented
                        </div>
                        {pendingStructure.duplicates_detected.map((d, i) => (
                          <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4, lineHeight: 1.5 }}>
                            <strong>"{d.keyword}"</strong> {d.suggestion === 'skip' ? 'is already an active campaign' : 'overlaps with an existing campaign'} ("{d.existing_campaign_keyword}").
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Suggested follow-up campaigns — checkable */}
                    {pendingStructure.suggested_followup_campaigns.length > 0 && (
                      <div style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.02)',
                        marginBottom: 10,
                      }}>
                        <div style={{
                          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
                          color: 'rgba(255,255,255,0.55)', marginBottom: 6,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                          <Lightbulb size={11} /> Suggested follow-up campaign{pendingStructure.suggested_followup_campaigns.length === 1 ? '' : 's'}
                        </div>
                        {pendingStructure.suggested_followup_campaigns.map((f, i) => (
                          <label key={i} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 8,
                            padding: '6px 0', cursor: 'pointer',
                            borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                          }}>
                            <input
                              type="checkbox"
                              checked={structureAcceptFollowups.has(i)}
                              onChange={(e) => {
                                const next = new Set(structureAcceptFollowups);
                                if (e.target.checked) next.add(i); else next.delete(i);
                                setStructureAcceptFollowups(next);
                              }}
                              style={{ marginTop: 3, cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                                {f.keywords.join(', ')}
                              </div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2, lineHeight: 1.4 }}>
                                {f.why_separate}
                              </div>
                            </div>
                          </label>
                        ))}
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontStyle: 'italic' }}>
                          Checked items are saved as opportunities — start them as campaigns when ready.
                        </div>
                      </div>
                    )}

                    {/* Opportunities — checkable */}
                    {pendingStructure.opportunities_to_create.length > 0 && (
                      <div style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.02)',
                        marginBottom: 10,
                      }}>
                        <div style={{
                          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
                          color: 'rgba(255,255,255,0.55)', marginBottom: 6,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                          <Lightbulb size={11} /> Worth exploring later · {pendingStructure.opportunities_to_create.length}
                        </div>
                        {pendingStructure.opportunities_to_create.map((o, i) => (
                          <label key={i} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 8,
                            padding: '6px 0', cursor: 'pointer',
                            borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                          }}>
                            <input
                              type="checkbox"
                              checked={structureAcceptOpps.has(i)}
                              onChange={(e) => {
                                const next = new Set(structureAcceptOpps);
                                if (e.target.checked) next.add(i); else next.delete(i);
                                setStructureAcceptOpps(next);
                              }}
                              style={{ marginTop: 3, cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                                "{o.keyword}" <span style={{
                                  fontSize: 9, padding: '1px 5px', borderRadius: 4, marginLeft: 4,
                                  background: o.feasibility === 'worth_exploring'
                                    ? 'hsla(152 70% 50% / 0.18)'
                                    : o.feasibility === 'weak_signal'
                                      ? 'rgba(255,255,255,0.08)'
                                      : 'hsla(38 92% 55% / 0.15)',
                                  color: o.feasibility === 'worth_exploring'
                                    ? 'hsl(152 70% 60%)'
                                    : o.feasibility === 'weak_signal'
                                      ? 'rgba(255,255,255,0.5)'
                                      : 'hsl(38 92% 60%)',
                                }}>
                                  {o.feasibility.replace(/_/g, ' ')}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2, lineHeight: 1.4 }}>
                                {o.reason}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Decisions avoided — credibility surface */}
                    {pendingStructure.decisions_avoided.length > 0 && (
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'hsla(152 70% 50% / 0.05)',
                        border: '1px solid hsla(152 70% 50% / 0.2)',
                        marginBottom: 10,
                      }}>
                        <div style={{
                          fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em',
                          color: 'hsl(152 70% 60%)', marginBottom: 4,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                          <CheckCircle2 size={10} /> Decisions saved · {pendingStructure.decisions_avoided.length}
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                          {pendingStructure.decisions_avoided.map(d => d.decision_type.replace(/_/g, ' ')).join(' · ')}
                        </div>
                      </div>
                    )}

                    {/* Honest note */}
                    {pendingStructure.honest_note && (
                      <div style={{
                        fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5,
                        marginBottom: 12, fontStyle: 'italic',
                      }}>
                        {pendingStructure.honest_note}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        disabled={committingStructure || pendingStructure.primary_campaign.keywords.length === 0}
                        onClick={commitStructureAndLaunch}
                        style={{
                          fontSize: 12, padding: '7px 14px', borderRadius: 8,
                          border: `1px solid hsla(${moodHsl} / 0.4)`,
                          background: `hsla(${moodHsl} / 0.2)`,
                          color: `hsl(${moodHsl})`,
                          cursor: committingStructure ? 'wait' : 'pointer',
                          fontWeight: 700,
                          opacity: committingStructure ? 0.5 : 1,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                        <Sparkles size={11} />
                        {committingStructure ? 'Setting up…' : 'Yes, set it up'}
                      </button>
                      <button
                        disabled={committingStructure}
                        onClick={editStructureInput}
                        style={{
                          fontSize: 12, padding: '7px 12px', borderRadius: 8,
                          border: '1px solid rgba(255,255,255,0.15)',
                          background: 'transparent',
                          color: 'rgba(255,255,255,0.75)',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                        <Edit3 size={11} />
                        Edit input
                      </button>
                      <button
                        disabled={committingStructure}
                        onClick={cancelStructure}
                        style={{
                          fontSize: 12, padding: '7px 12px', borderRadius: 8,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'transparent',
                          color: 'rgba(255,255,255,0.55)',
                          cursor: 'pointer',
                        }}>
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Quick chips — only show when no response yet AND no pending structure AND no exploration AND no suggestions */}
              {!response && !submitting && !pendingConfirm && !pendingStructure && !explorationResponse && chatSuggestions.length === 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {chipsForAwareness(awareness).map((c, i) => (
                    <motion.button
                      key={c.q}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.05 }}
                      onClick={() => useChip(c.q)}
                      disabled={!selectedProjectId}
                      style={{
                        fontSize: 11, padding: '5px 11px', borderRadius: 999,
                        border: c.urgent
                          ? '1px solid hsla(38 92% 55% / 0.4)'
                          : '1px solid rgba(255,255,255,0.1)',
                        background: c.urgent
                          ? 'hsla(38 92% 55% / 0.08)'
                          : 'transparent',
                        color: c.urgent
                          ? 'hsl(38 92% 60%)'
                          : 'rgba(255,255,255,0.6)',
                        cursor: 'pointer',
                        fontWeight: c.urgent ? 700 : 500,
                        opacity: selectedProjectId ? 1 : 0.4,
                      }}>
                      {c.label}
                    </motion.button>
                  ))}
                </div>
              )}

              {/* ════════════════════════════════════════════════════════════
                  Phase 21 Block 2.5 — GSC-grounded chat suggestions
                  Renders when user types rank-related input. Every suggestion
                  cites its source (GSC, existing campaign, opportunities inbox).
              ════════════════════════════════════════════════════════════ */}
              {!response && !submitting && !pendingConfirm && !pendingStructure && !explorationResponse && chatSuggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ marginTop: 12 }}>
                  <div style={{
                    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em',
                    fontWeight: 700, color: `hsl(${moodHsl})`, marginBottom: 6,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <Sparkles size={11} /> Grounded suggestions
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {chatSuggestions.map(s => (
                      <button
                        key={s.id}
                        onClick={() => { setInput(s.command); setTimeout(() => submit(s.command), 50); }}
                        style={{
                          textAlign: 'left',
                          padding: '8px 11px',
                          borderRadius: 8,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: s.kind === 'existing_campaign_match'
                            ? 'hsla(0 75% 55% / 0.05)'
                            : s.kind === 'gsc_opportunity'
                              ? `hsla(${moodHsl} / 0.06)`
                              : 'rgba(255,255,255,0.02)',
                          color: 'rgba(255,255,255,0.85)',
                          cursor: 'pointer',
                        }}>
                        <div style={{ fontSize: 12, lineHeight: 1.4, marginBottom: 3 }}>
                          {s.text}
                        </div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            padding: '1px 5px', borderRadius: 4,
                            background: 'rgba(255,255,255,0.06)',
                            textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
                          }}>
                            source: {s.source.kind === 'gsc' ? 'GSC' : s.source.kind}
                          </span>
                          <span>·</span>
                          <span>{s.source.label}</span>
                          {s.source.last_refresh && (
                            <>
                              <span>·</span>
                              <span>refreshed {formatRelative(s.source.last_refresh)}</span>
                            </>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  {suggestionsNote && (
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 6, fontStyle: 'italic' }}>
                      {suggestionsNote}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Tools status banner — when GSC/GA4 not connected */}
              {!response && !submitting && !pendingConfirm && !pendingStructure && !explorationResponse && toolsStatus && (!toolsStatus.gsc_connected || !toolsStatus.ga4_connected) && chatSuggestions.length === 0 && (
                <div style={{
                  marginTop: 10,
                  padding: '8px 11px',
                  borderRadius: 8,
                  background: 'hsla(38 92% 55% / 0.05)',
                  border: '1px solid hsla(38 92% 55% / 0.2)',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.7)',
                  lineHeight: 1.4,
                }}>
                  <strong style={{ color: 'hsl(38 92% 60%)' }}>Connect for richer guidance:</strong>{' '}
                  {!toolsStatus.gsc_connected && 'GSC '}
                  {!toolsStatus.gsc_connected && !toolsStatus.ga4_connected && '+ '}
                  {!toolsStatus.ga4_connected && 'GA4 '}
                  not connected. Suggestions degrade gracefully — but real data unlocks honest source-cited recommendations.
                </div>
              )}

              {/* ════════════════════════════════════════════════════════════
                  Phase 21 Block 2.5 — Exploration response panel
                  Shows GSC snapshot + positioning read + strategic narrative
                  with source citations + next-step options.
              ════════════════════════════════════════════════════════════ */}
              {explorationResponse && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    marginTop: 12,
                    padding: '14px 16px',
                    borderRadius: 14,
                    border: `1px solid hsla(${moodHsl} / 0.3)`,
                    background: `hsla(${moodHsl} / 0.04)`,
                    maxHeight: '65vh',
                    overflowY: 'auto',
                  }}>
                  <div style={{
                    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em',
                    fontWeight: 700, color: `hsl(${moodHsl})`, marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <Lightbulb size={11} /> Exploring "{explorationResponse.keyword}"
                  </div>

                  {/* GSC snapshot — real data */}
                  {explorationResponse.gsc_snapshot && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 10, marginBottom: 10,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.55)', marginBottom: 5 }}>
                        Current GSC state
                      </div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 5 }}>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>
                          Position: <strong style={{ color: `hsl(${moodHsl})` }}>{explorationResponse.gsc_snapshot.position?.toFixed(1) ?? 'n/a'}</strong>
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>
                          Impressions: <strong>{explorationResponse.gsc_snapshot.impressions ?? 0}</strong>
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>
                          Clicks: <strong>{explorationResponse.gsc_snapshot.clicks ?? 0}</strong>
                        </div>
                      </div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>
                        Source: {explorationResponse.gsc_snapshot.source.label}
                        {explorationResponse.gsc_snapshot.source.last_refresh && ` · refreshed ${formatRelative(explorationResponse.gsc_snapshot.source.last_refresh)}`}
                      </div>
                    </div>
                  )}
                  {!explorationResponse.gsc_snapshot && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 10, marginBottom: 10,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px dashed rgba(255,255,255,0.1)',
                      fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5,
                    }}>
                      {explorationResponse.has_gsc_data
                        ? 'No GSC row matched this exact keyword — your site may not appear for it yet.'
                        : 'No GSC data available — either the query has no impressions in your account yet, or GSC isn\'t connected.'}
                    </div>
                  )}

                  {/* Duplicate check */}
                  {explorationResponse.duplicate_check?.is_duplicate && explorationResponse.duplicate_check.existing_campaign && (
                    <div style={{
                      padding: '8px 11px', borderRadius: 8, marginBottom: 10,
                      background: 'hsla(0 75% 55% / 0.05)',
                      border: '1px solid hsla(0 75% 55% / 0.25)',
                      fontSize: 12, color: 'rgba(255,255,255,0.9)', lineHeight: 1.4,
                    }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'hsl(0 75% 65%)', marginBottom: 3, fontWeight: 700 }}>
                        Already in your campaigns
                      </div>
                      You have an {explorationResponse.duplicate_check.existing_campaign.status} campaign for "{explorationResponse.duplicate_check.existing_campaign.keyword}".
                    </div>
                  )}

                  {/* Positioning alignment */}
                  {explorationResponse.positioning_read && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 10, marginBottom: 10,
                      background: explorationResponse.positioning_read.aligned === 'no'
                        ? 'hsla(0 75% 55% / 0.05)'
                        : explorationResponse.positioning_read.aligned === 'partial'
                          ? 'hsla(38 92% 55% / 0.05)'
                          : 'hsla(152 70% 50% / 0.05)',
                      border: `1px solid ${
                        explorationResponse.positioning_read.aligned === 'no'
                          ? 'hsla(0 75% 55% / 0.25)'
                          : explorationResponse.positioning_read.aligned === 'partial'
                            ? 'hsla(38 92% 55% / 0.25)'
                            : 'hsla(152 70% 50% / 0.25)'
                      }`,
                    }}>
                      <div style={{
                        fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
                        marginBottom: 4, fontWeight: 700,
                        color: explorationResponse.positioning_read.aligned === 'no'
                          ? 'hsl(0 75% 65%)'
                          : explorationResponse.positioning_read.aligned === 'partial'
                            ? 'hsl(38 92% 60%)'
                            : 'hsl(152 70% 60%)',
                      }}>
                        Positioning alignment: {explorationResponse.positioning_read.aligned}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
                        {explorationResponse.positioning_read.reasoning}
                      </div>
                      {explorationResponse.positioning_read.citations.length > 0 && (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 5, lineHeight: 1.4 }}>
                          From positioning: {explorationResponse.positioning_read.citations.map(c => `"${c}"`).join(', ')}
                        </div>
                      )}
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 5 }}>
                        Source: {explorationResponse.positioning_read.source.label}
                      </div>
                    </div>
                  )}

                  {/* Strategic read */}
                  <div style={{
                    padding: '10px 12px', borderRadius: 10, marginBottom: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.55)', marginBottom: 5, fontWeight: 700 }}>
                      Strategic read
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 1.55 }}>
                      {explorationResponse.strategic_read}
                    </div>
                    {explorationResponse.strategic_read_sources.length > 0 && (
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 6, lineHeight: 1.4 }}>
                        Built from: {explorationResponse.strategic_read_sources.map(s => s.label).join(' · ')}
                      </div>
                    )}
                  </div>

                  {/* Honest note about tool gaps */}
                  {explorationResponse.honest_note && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, marginBottom: 10, fontStyle: 'italic' }}>
                      {explorationResponse.honest_note}
                    </div>
                  )}

                  {/* Next-step options */}
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.6)', marginBottom: 6, fontWeight: 700 }}>
                    Next steps
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {explorationResponse.next_step_options.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => {
                          if (opt.id === 'run_full_campaign') {
                            /* Convert exploration into a commit flow — fire the rank command */
                            const cmd = `rank me for "${explorationResponse.keyword}"`;
                            setInput(cmd);
                            setExplorationResponse(null);
                            setTimeout(() => submit(cmd), 50);
                          } else if (opt.id === 'tell_more') {
                            setExplorationResponse(null);
                            setMood('quiet');
                            setTimeout(() => inputRef.current?.focus(), 100);
                          } else if (opt.id === 'run_feasibility') {
                            /* For now treat feasibility same as full campaign — Block 5 builds the
                               feasibility-exploration campaign_type fully */
                            const cmd = `rank me for "${explorationResponse.keyword}"`;
                            setInput(cmd);
                            setExplorationResponse(null);
                            setTimeout(() => submit(cmd), 50);
                          }
                        }}
                        style={{
                          textAlign: 'left',
                          padding: '8px 11px',
                          borderRadius: 8,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: opt.id === 'run_feasibility' ? `hsla(${moodHsl} / 0.08)` : 'rgba(255,255,255,0.02)',
                          color: 'rgba(255,255,255,0.85)',
                          cursor: 'pointer',
                        }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>{opt.description}</div>
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button
                      onClick={() => { setExplorationResponse(null); setMood('quiet'); }}
                      style={{
                        fontSize: 11, padding: '5px 10px', borderRadius: 7,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'transparent',
                        color: 'rgba(255,255,255,0.55)',
                        cursor: 'pointer',
                      }}>
                      Close exploration
                    </button>
                  </div>
                </motion.div>
              )}

              {loadingExploration && !explorationResponse && (
                <div style={{
                  marginTop: 12, padding: '14px 16px', borderRadius: 12,
                  border: `1px solid hsla(${moodHsl} / 0.2)`,
                  background: `hsla(${moodHsl} / 0.05)`,
                  fontSize: 12, color: 'rgba(255,255,255,0.7)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                    style={{
                      width: 12, height: 12, borderRadius: '50%',
                      border: `2px solid hsla(${moodHsl} / 0.2)`,
                      borderTopColor: `hsl(${moodHsl})`,
                    }}
                  />
                  Pulling real data — checking GSC, positioning, existing campaigns…
                </div>
              )}

              {/* Thinking state */}
              {submitting && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{
                    marginTop: 18, padding: '14px 16px',
                    borderRadius: 12,
                    border: `1px solid hsla(${moodHsl} / 0.2)`,
                    background: `hsla(${moodHsl} / 0.05)`,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                    style={{
                      width: 14, height: 14, borderRadius: '50%',
                      border: `2px solid hsla(${moodHsl} / 0.2)`,
                      borderTopColor: `hsl(${moodHsl})`,
                    }}
                  />
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                    Thinking through your project data…
                  </span>
                </motion.div>
              )}

              {/* Error */}
              {error && !submitting && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginTop: 18, padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid hsla(0 75% 55% / 0.3)',
                    background: 'hsla(0 75% 55% / 0.06)',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                  <AlertCircle size={14} style={{ color: 'hsl(0 75% 60%)', marginTop: 1, flexShrink: 0 }} />
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)' }}>{error}</div>
                </motion.div>
              )}

              {/* Response */}
              {response && !submitting && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  style={{ marginTop: 18 }}>
                  {/* Confidence pill */}
                  <div style={{
                    fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700,
                    color: `hsl(${moodHsl})`, marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  }}>
                    <CheckCircle2 size={10} />
                    <span>{response.intent.replace(/_/g,' ')}</span>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <span>{Math.round(response.confidence * 100)}% confident</span>
                    {response.web_used && (
                      <span style={{
                        marginLeft: 4,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: 'hsla(210 80% 60% / 0.15)',
                        border: '1px solid hsla(210 80% 60% / 0.4)',
                        color: 'hsl(210 80% 70%)',
                        fontSize: 9,
                      }}>🌐 web</span>
                    )}
                  </div>

                  {/* Chunks */}
                  {response.chunks.map((c, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      style={{
                        lineHeight: 1.55,
                        color: c.kind === 'verify'
                          ? 'rgba(255,255,255,0.55)'
                          : 'rgba(255,255,255,0.92)',
                        marginBottom: 8,
                        whiteSpace: 'pre-wrap',
                        fontStyle: c.kind === 'verify' ? 'italic' : 'normal',
                        fontSize: c.kind === 'verify' ? 11.5 : 13.5,
                      } as any}>
                      {c.kind === 'verify' && <span style={{ marginRight: 6, opacity: 0.5 }}>↳</span>}
                      {c.content}
                    </motion.div>
                  ))}

                  {/* Artifacts */}
                  {response.artifacts && response.artifacts.length > 0 && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {response.artifacts.map((art, i) => (
                        <ArtifactBox key={i} artifact={art} moodHsl={moodHsl} />
                      ))}
                    </div>
                  )}

                  {/* Citations (Phase 11) — clickable web sources */}
                  {response.citations && response.citations.length > 0 && (
                    <div style={{
                      marginTop: 12,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid hsla(210 80% 60% / 0.2)',
                      background: 'hsla(210 80% 60% / 0.05)',
                    }}>
                      <div style={{
                        fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700,
                        color: 'hsl(210 80% 70%)', marginBottom: 8,
                      }}>
                        Sources · {response.citations.length}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {response.citations.map((c, i) => {
                          let host = '';
                          try { host = new URL(c.url).hostname.replace(/^www\./, ''); } catch { host = c.url.slice(0, 24); }
                          return (
                            <a
                              key={i}
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={c.title || c.url}
                              style={{
                                fontSize: 10.5,
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid hsla(210 80% 60% / 0.3)',
                                background: 'hsla(210 80% 60% / 0.08)',
                                color: 'hsl(210 80% 75%)',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                maxWidth: 220,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontWeight: 600,
                              }}>
                              <span style={{ opacity: 0.7 }}>[{i + 1}]</span>
                              <span>{host}</span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Honest note */}
                  {response.honest_note && (
                    <div style={{
                      marginTop: 12, padding: '10px 12px',
                      borderTop: '1px solid hsla(38 92% 55% / 0.18)',
                      fontSize: 11, color: 'hsla(38 92% 60% / 0.85)',
                      fontStyle: 'italic',
                      display: 'flex', alignItems: 'flex-start', gap: 6,
                    }}>
                      <AlertCircle size={11} style={{ marginTop: 1, flexShrink: 0 }} />
                      <span>{response.honest_note}</span>
                    </div>
                  )}

                  {/* Actions */}
                  {response.actions && response.actions.length > 0 && (
                    <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {response.actions.map((a, i) => (
                        <button
                          key={i}
                          disabled={actionRunning}
                          onClick={async () => {
                            /* try_xxx — refire as a query */
                            if (a.id.startsWith('try_')) {
                              const map: Record<string, string> = {
                                try_diagnose:  'diagnose',
                                try_summarize: 'Summarize this week',
                                try_attention: 'What needs me today?',
                                try_help:      'help',
                              };
                              const q = map[a.id] || a.label;
                              setInput(q); submit(q);
                              return;
                            }
                            /* Try the registry first — maps suggested action IDs to real handlers */
                            const idMap: Record<string, string> = {
                              open_planning:        'navigate_planning',
                              open_pipeline:        'planning_open_board',
                              open_strategy:        'planning_open_strategy',
                              open_data_room:       'navigate_data_room',
                              open_analytics:       'data_room_set_tab',
                              open_provenance:      'open_provenance_detail',
                              open_kanban:          'navigate_command',  /* desk doesn't exist as a clean route; fallback */
                              open_dashboard:       'navigate_dashboard',
                              open_audit:           'navigate_audit',
                              open_command:         'navigate_command',
                              open_settings:        'navigate_season_settings',
                              compute_intelligence: 'compute_intelligence',
                              refresh_briefing:     'refresh_briefing',
                              data_room_set_tab:    'data_room_set_tab',
                              planning_open_strategy: 'planning_open_strategy',
                              planning_open_board:  'planning_open_board',
                              open_provenance_detail: 'open_provenance_detail',
                            };
                            const registryId = idMap[a.id] || a.id;
                            /* For open_analytics, force the tab payload */
                            const payload = a.id === 'open_analytics'
                              ? { ...(a.payload || {}), tab: 'analytics' }
                              : a.payload;
                            const result = await runAction(registryId, payload);
                            if (result.ok && result.navigated) {
                              close();
                            }
                          }}
                          style={{
                            fontSize: 11, padding: '6px 12px', borderRadius: 8,
                            border: `1px solid hsla(${moodHsl} / 0.3)`,
                            background: `hsla(${moodHsl} / 0.08)`,
                            color: `hsl(${moodHsl})`,
                            cursor: actionRunning ? 'wait' : 'pointer',
                            fontWeight: 600,
                            opacity: actionRunning ? 0.6 : 1,
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                          {a.label} <ArrowRight size={10} />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* New question affordance */}
                  <button
                    onClick={() => { setResponse(null); setError(null); inputRef.current?.focus(); }}
                    style={{
                      marginTop: 16, fontSize: 11,
                      background: 'transparent', border: 'none',
                      color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
                    }}>
                    ↑ ask something else
                  </button>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '8px 16px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              fontSize: 10, color: 'rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>{isMac ? '⌘K' : 'Ctrl+K'} to toggle · Esc to close</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => { close(); setTimeout(() => navigate('/season-settings'), 100); }}
                  title="Open S.E.A.S.O.N. settings"
                  style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'transparent', color: 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                  }}>
                  ⚙ Settings
                </button>
                <span>S.E.A.S.O.N. v1</span>
              </div>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
    </>
  );
}

/* ─── Artifact box (lightweight, no external deps) ─── */

/* ─── Block 2.5 helper: relative time display for source freshness ─── */

function formatRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    if (isNaN(then)) return '';
    const sec = Math.max(0, Math.floor((now - then) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}

function ArtifactBox({ artifact, moodHsl }: { artifact: { kind: string; title: string; body: string }; moodHsl: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const handleCopy = () => {
    try {
      navigator.clipboard?.writeText(artifact.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };
  const icon =
    artifact.kind === 'brief' ? '📝' :
    artifact.kind === 'email' ? '✉' :
    artifact.kind === 'table' ? '◫' :
    artifact.kind === 'plan'  ? '◆' : '◦';

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid hsla(${moodHsl} / 0.25)`,
      background: `hsla(${moodHsl} / 0.04)`,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 12px',
        borderBottom: expanded ? `1px solid hsla(${moodHsl} / 0.15)` : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: `hsl(${moodHsl})` }}>
              {artifact.kind} · drafted
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {artifact.title}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={handleCopy} style={{
            fontSize: 10, padding: '4px 8px', borderRadius: 6,
            border: copied ? '1px solid hsla(152 70% 50% / 0.4)' : `1px solid hsla(${moodHsl} / 0.3)`,
            background: copied ? 'hsla(152 70% 50% / 0.15)' : `hsla(${moodHsl} / 0.1)`,
            color: copied ? 'hsl(152 70% 60%)' : `hsl(${moodHsl})`,
            cursor: 'pointer', fontWeight: 700,
          }}>{copied ? '✓ copied' : 'Copy'}</button>
          <button onClick={() => setExpanded(!expanded)} style={{
            fontSize: 10, padding: '4px 8px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
          }}>{expanded ? 'Collapse' : 'Expand'}</button>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: 12 }}>
          <pre style={{
            margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.85)',
            whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace',
            lineHeight: 1.5,
            maxHeight: 320, overflow: 'auto',
          }}>{artifact.body}</pre>
        </div>
      )}
    </div>
  );
}
