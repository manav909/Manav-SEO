/* ════════════════════════════════════════════════════════════════
   src/components/season/SeasonPipelineDashboard.tsx
   Phase 13a + recovery — Live pipeline dashboard.

   • Big mood-colored timer at top
   • Step grid color-coded by status
   • Click any step → full-screen artifact viewer (markdown-aware)
   • Stuck-run detection — interrupt button when a step hangs >130s
   • Persistence: state lives in season_pipeline_runs/_steps tables,
     not browser memory. Close = run continues; reopen by run_id.
═══════════════════════════════════════════════════════════════ */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, XCircle, Loader2, Circle, AlertCircle, X,
  AlertTriangle, Copy, Check, FileText, RefreshCw, SkipForward, PlayCircle, ExternalLink,
} from 'lucide-react';
import { useSeason } from '@/contexts/SeasonContext';
import { useToast } from '@/hooks/use-toast';
import {
  seasonPipelineGet, seasonPipelineInterrupt, seasonPipelineExecuteNext,
  seasonPipelineRetryStep, seasonPipelineRetryFromStep, seasonPipelineSkipStep,
  type PipelineStepDetail, type PipelineRunDetail, type PipelineType,
} from '@/components/pm/api';

interface SeasonPipelineDashboardProps {
  runId:          string;
  expectedSteps:  number;
  pipelineLabel:  string;
  pipelineType:   PipelineType;     // needed for execute_next calls
  onClose:        () => void;
  onComplete?:    (run: PipelineRunDetail) => void;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 15 * 60 * 1000;
const STUCK_THRESHOLD_MS = 130_000;

const MOOD_HSL_STATUS: Record<string, string> = {
  pending:   '210 30% 50%',
  running:   '186 80% 55%',
  retrying:  '186 80% 55%',          // Phase 14.2 — same as running for visual continuity
  completed: '152 70% 50%',
  failed:    '0 75% 55%',
  skipped:   '38 60% 55%',
  awaiting_review: '262 75% 60%',
};

export default function SeasonPipelineDashboard({
  runId, expectedSteps, pipelineLabel, pipelineType, onClose, onComplete,
}: SeasonPipelineDashboardProps) {
  const { mood } = useSeason();
  const [run, setRun]       = useState<PipelineRunDetail | null>(null);
  const [steps, setSteps]   = useState<PipelineStepDetail[]>([]);
  const [polling, setPolling] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError]   = useState<string | null>(null);
  const [viewerStep, setViewerStep] = useState<PipelineStepDetail | null>(null);
  const [interruptInProgress, setInterruptInProgress] = useState(false);
  const pollStartedAt = useRef(Date.now());
  const completedRef = useRef(false);
  const executingRef = useRef(false);     // guards the execute loop so we don't overlap calls
  const stopExecRef  = useRef(false);     // set true on unmount or interrupt to halt the chain
  const { toast } = useToast();

  /* Phase 14.2 — resilience handlers. After any retry/skip op succeeds, we
     restart the execution loop so it picks up the now-pending steps. */
  const handleRetryStep = async (stepIndex: number) => {
    const r = await seasonPipelineRetryStep({ runId, stepIndex });
    if (r.error) {
      toast({ title: 'Retry failed', description: r.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Retrying step', description: `Attempt ${r.new_retry_count || '?'} of 3` });
    /* Restart the execute loop. It checks the executingRef guard. */
    setTimeout(() => driveExecution(), 200);
  };

  const handleRetryFromStep = async (stepIndex: number) => {
    if (!confirm(`Re-run from step ${stepIndex + 1} onward? All later steps will be re-executed.`)) return;
    const r = await seasonPipelineRetryFromStep({ runId, stepIndex });
    if (r.error) {
      toast({ title: 'Resume failed', description: r.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Resuming from this step', description: `${r.steps_reset} step${r.steps_reset === 1 ? '' : 's'} reset` });
    setTimeout(() => driveExecution(), 200);
  };

  const handleSkipStep = async (stepIndex: number) => {
    const reason = prompt('Why are you skipping this step? (optional)');
    if (reason === null) return;  // user cancelled
    const r = await seasonPipelineSkipStep({ runId, stepIndex, reason: reason || undefined });
    if (r.error) {
      toast({ title: 'Skip failed', description: r.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Step skipped', description: 'Downstream steps may have less complete data' });
    setTimeout(() => driveExecution(), 200);
  };

  /* ── Step-by-step execution loop ─────────────────────────────
     The frontend is now the conductor. We call execute_next, wait for the
     server to finish ONE step, then call again. Each request has its own
     5-min Vercel function budget — no more background-freeze issues.

     Runs alongside the polling loop. Polling updates UI state from the DB;
     this loop drives execution forward. They're decoupled. */

  /* Phase 14.2 — extracted into a callable function so retry/skip handlers
     can restart the loop after a step is reset. */
  const driveExecution = useCallback(async () => {
    if (executingRef.current) return;
    executingRef.current = true;
    stopExecRef.current = false;
    try {
      while (!stopExecRef.current) {
        const r = await seasonPipelineExecuteNext({ runId, pipelineType });
        if (stopExecRef.current) break;
        if (r.error) {
          setError(`Execution failed: ${r.error}`);
          break;
        }
        if (r.no_more_steps || r.run_status === 'completed' || r.run_status === 'failed' || r.run_status === 'cancelled') {
          /* Terminal state — polling loop will pick up the final summary. */
          break;
        }
        /* Tiny pause between step kicks so the polling loop can update UI */
        await new Promise(res => setTimeout(res, 200));
      }
    } catch (e: any) {
      setError(`Execution loop crashed: ${e?.message || 'unknown'}`);
    } finally {
      executingRef.current = false;
    }
  }, [runId, pipelineType]);

  useEffect(() => {
    driveExecution();
    return () => { stopExecRef.current = true; };
  }, [driveExecution]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await seasonPipelineGet({ runId });
        if (cancelled) return;
        if (r.error) {
          setError(r.error);
          setPolling(false);
          return;
        }
        if (r.run)   setRun(r.run);
        if (r.steps) setSteps(r.steps);

        const runStatus = r.run?.status;
        const isTerminal = runStatus && ['completed', 'failed', 'cancelled'].includes(runStatus);
        const hitMax = Date.now() - pollStartedAt.current > MAX_POLL_DURATION_MS;

        /* Phase 17.5.6 — refresh-from-audit recovery support.
           A run can briefly appear in a terminal state (typically 'failed')
           during the moment between the user clicking refresh and the
           backend's retryFromStep flipping status to 'retrying'. If we stop
           polling on that transient terminal state, we never see the
           subsequent re-execution. Same applies to pending step rows
           existing on a 'failed' run — that signals a retry is in flight.
           So: don't stop on terminal if there are still pending or running
           steps. Those steps will execute and the run status will flip back
           to running/retrying within a few seconds. */
        const hasPendingOrRunning = (r.steps || []).some(
          s => s.status === 'pending' || s.status === 'running'
        );
        const reallyTerminal = isTerminal && !hasPendingOrRunning;

        if (reallyTerminal || hitMax) {
          setPolling(false);
          if (reallyTerminal && !completedRef.current && r.run) {
            completedRef.current = true;
            onComplete?.(r.run);
          }
        }
      } catch (e: any) {
        setError(e?.message || 'poll failed');
        setPolling(false);
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [runId, onComplete]);

  /* True pipeline runtime — anchored to the run's own started_at (server time).
     Freezes only when the run is GENUINELY done: status terminal AND no step is
     still pending/running. A run can be briefly mis-marked finished while later
     steps are still executing (a known race in the step-by-step executor); in
     that case finished_at is wrong, so we keep ticking off started_at until the
     steps actually finish. This stops the clock freezing at 00:01. */
  useEffect(() => {
    const stepsStillActive = steps.some(s => s.status === 'running' || s.status === 'pending');
    const trulyDone = !!run?.finished_at && !stepsStillActive;

    const computeElapsed = () => {
      if (run?.started_at) {
        const start = new Date(run.started_at).getTime();
        // Use finished_at only when truly done; otherwise tick to now.
        const end = trulyDone ? new Date(run.finished_at as string).getTime() : Date.now();
        const secs = Math.floor((end - start) / 1000);
        // Guard against bad/missing started_at producing a tiny or negative value
        // while work is clearly ongoing: fall back to dashboard-open time.
        if (secs < 1 && stepsStillActive) {
          return Math.floor((Date.now() - pollStartedAt.current) / 1000);
        }
        return Math.max(0, secs);
      }
      return Math.floor((Date.now() - pollStartedAt.current) / 1000);
    };
    setElapsed(computeElapsed());
    if (trulyDone) return;  // freeze only when genuinely complete
    const id = setInterval(() => setElapsed(computeElapsed()), 250);
    return () => clearInterval(id);
  }, [polling, run?.started_at, run?.finished_at, steps]);

  const stuckStep = useMemo(() => {
    if (!polling) return null;
    const running = steps.find(s => s.status === 'running' && s.started_at);
    if (!running || !running.started_at) return null;
    const runningMs = Date.now() - new Date(running.started_at).getTime();
    return runningMs > STUCK_THRESHOLD_MS ? { step: running, runningMs } : null;
  }, [steps, polling, elapsed]);

  const moodHsl = mood === 'critical'      ? '0 75% 55%' :
                  mood === 'alert'         ? '38 92% 55%' :
                  mood === 'celebrating'   ? '152 70% 50%' :
                                             '186 80% 55%';

  /* A run is only DONE when its status is terminal AND no step is still
     pending/running. Guards against the executor briefly mis-marking the run
     finished while later steps execute (which showed "Complete" at step 2). */
  const anyStepActive = steps.some(s => s.status === 'running' || s.status === 'pending');
  const isDone = !!run && ['completed', 'failed', 'cancelled'].includes(run.status || '') && !anyStepActive;

  const displaySteps: PipelineStepDetail[] = steps.length > 0
    ? steps
    : Array.from({ length: expectedSteps }, (_, i) => ({
        id: `ghost_${i}`,
        run_id: runId,
        step_index: i,
        step_id: 'pending',
        step_label: `Step ${i + 1}`,
        status: 'pending',
        llm_calls: 0,
        web_searches: 0,
      } as PipelineStepDetail));

  const handleInterrupt = async () => {
    setInterruptInProgress(true);
    try {
      await seasonPipelineInterrupt({
        runId,
        reason: `Marked from dashboard at ${formatElapsed(elapsed)} elapsed. Step "${stuckStep?.step.step_label}" appeared stuck.`,
      });
      const r = await seasonPipelineGet({ runId });
      if (r.run)   setRun(r.run);
      if (r.steps) setSteps(r.steps);
      setPolling(false);
    } catch (e: any) {
      setError(e?.message || 'interrupt failed');
    } finally {
      setInterruptInProgress(false);
    }
  };

  return (
    <motion.div
      key="pipeline-dashboard-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse at center, #0f1018 0%, #08090f 70%)',
        zIndex: 10010,
        overflow: 'auto',
      }}>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10011,
        display: 'flex', flexDirection: 'column',
        padding: '24px',
        pointerEvents: 'none',
      }}>
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, pointerEvents: 'auto' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>
              S.E.A.S.O.N. · Pipeline
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 2 }}>
              {pipelineLabel}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
              run_id: {runId.slice(0, 8)}…{runId.slice(-4)}
            </div>
          </div>
          <button onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <X size={16} />
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24, pointerEvents: 'auto' }}>
          <motion.div
            animate={polling ? {
              textShadow: [
                `0 0 20px hsla(${moodHsl} / 0.35)`,
                `0 0 36px hsla(${moodHsl} / 0.55)`,
                `0 0 20px hsla(${moodHsl} / 0.35)`,
              ],
            } : {}}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              fontSize: 72, lineHeight: 1, fontWeight: 700,
              letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
              color: `hsl(${moodHsl})`,
            }}>
            {formatElapsed(elapsed)}
          </motion.div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {polling ? (
              <>
                <div>Step {run?.step_current || 0} / {expectedSteps}</div>
                {run?.llm_calls_used !== undefined && (
                  <div style={{ marginTop: 4 }}>
                    {run.llm_calls_used} LLM call{run.llm_calls_used === 1 ? '' : 's'} · ${run.estimated_cost_usd?.toFixed(2) || '0.00'}
                  </div>
                )}
              </>
            ) : isDone ? (
              <>
                <div style={{ color: run?.status === 'completed' ? '#34d399' : '#fb7185' }}>
                  {run?.status === 'completed' ? 'Complete' : run?.status === 'failed' ? 'Failed' : 'Stopped'}
                </div>
                <div style={{ marginTop: 4 }}>
                  {run?.steps_completed || 0} of {expectedSteps} steps completed
                </div>
              </>
            ) : (
              <div style={{ color: '#fb923c' }}>Polling stopped</div>
            )}
          </div>
        </motion.div>

        {stuckStep && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            style={{
              marginBottom: 16, pointerEvents: 'auto',
              padding: 14, borderRadius: 12,
              border: '1px solid rgba(251, 146, 60, 0.4)',
              background: 'rgba(251, 146, 60, 0.08)',
              display: 'flex', alignItems: 'flex-start', gap: 12,
            }}>
            <AlertTriangle size={18} color="#fb923c" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fb923c', marginBottom: 4 }}>
                Step "{stuckStep.step.step_label}" looks stuck
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                Running for {Math.round(stuckStep.runningMs / 1000)}s without progress.
                The background process may have hit Vercel's 5-minute function timeout.
                Steps 1-{stuckStep.step.step_index} are saved — mark interrupted and start fresh.
              </div>
            </div>
            <button onClick={handleInterrupt} disabled={interruptInProgress}
              style={{
                padding: '7px 14px', borderRadius: 8,
                border: '1px solid rgba(251, 146, 60, 0.5)',
                background: 'rgba(251, 146, 60, 0.15)',
                color: '#fb923c', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                opacity: interruptInProgress ? 0.5 : 1, whiteSpace: 'nowrap',
              }}>
              {interruptInProgress ? 'Working…' : 'Mark interrupted'}
            </button>
          </motion.div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12, alignContent: 'start', flex: 1, pointerEvents: 'auto',
        }}>
          <AnimatePresence>
            {displaySteps.map((step, idx) => (
              <StepCard
                key={step.id}
                step={step}
                index={idx}
                isActive={polling && (run?.step_current || 0) === step.step_index + 1 && step.status === 'running'}
                onOpenViewer={() => setViewerStep(step)}
                onRetryStep={handleRetryStep}
                onRetryFromStep={handleRetryFromStep}
                onSkipStep={handleSkipStep}
              />
            ))}
          </AnimatePresence>
        </div>

        {isDone && run?.honest_summary && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            style={{
              marginTop: 16, padding: 14, borderRadius: 14,
              border: `1px solid hsla(${moodHsl} / 0.3)`,
              background: 'rgba(15,16,24,0.7)', pointerEvents: 'auto',
            }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginBottom: 6 }}>
              Honest summary
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {run.honest_summary}
            </div>
          </motion.div>
        )}

        {error && (
          <div style={{
            marginTop: 16, padding: 12, borderRadius: 10,
            border: '1px solid rgba(239, 68, 68, 0.4)',
            background: 'rgba(239, 68, 68, 0.08)',
            color: '#fca5a5', fontSize: 12, pointerEvents: 'auto',
          }}>
            <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {error}
          </div>
        )}
      </div>

      <AnimatePresence>
        {viewerStep && (
          <ArtifactViewer step={viewerStep} onClose={() => setViewerStep(null)} moodHsl={moodHsl} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StepCard({ step, index, isActive, onOpenViewer, onRetryStep, onRetryFromStep, onSkipStep }: {
  step: PipelineStepDetail;
  index: number;
  isActive: boolean;
  onOpenViewer: () => void;
  onRetryStep?:     (stepIndex: number) => void;
  onRetryFromStep?: (stepIndex: number) => void;
  onSkipStep?:      (stepIndex: number) => void;
}) {
  const status = step.status || 'pending';
  const sevHsl = MOOD_HSL_STATUS[status] || MOOD_HSL_STATUS.pending;
  const hasViewable = step.output || step.error_message;
  const retryCount = step.retry_count || 0;
  const maxRetries = Math.min(step.max_retries || 3, 3);
  const canRetry   = (status === 'failed' || status === 'skipped') && retryCount < maxRetries;
  const canSkip    = status === 'failed';

  const Icon = status === 'completed' ? CheckCircle2 :
               status === 'failed'    ? XCircle :
               status === 'running'   ? Loader2 :
               status === 'skipped'   ? AlertCircle :
                                        Circle;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      style={{
        borderRadius: 14,
        border: `1px solid hsla(${sevHsl} / ${isActive ? 0.5 : 0.25})`,
        background: `linear-gradient(180deg, hsla(${sevHsl} / 0.07) 0%, rgba(15,16,24,0.85) 100%)`,
        padding: 14, position: 'relative', overflow: 'hidden',
      }}>
      {isActive && (
        <motion.div
          animate={{ opacity: [0.18, 0.42, 0.18] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse at top left, hsla(${sevHsl} / 0.3) 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, position: 'relative' }}>
        <motion.div
          animate={status === 'running' ? { rotate: 360 } : {}}
          transition={status === 'running' ? { duration: 1.5, repeat: Infinity, ease: 'linear' } : {}}
          style={{ marginTop: 2 }}>
          <Icon size={16} style={{ color: `hsl(${sevHsl})` }} />
        </motion.div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
              {String(step.step_index + 1).padStart(2, '0')}
            </span>
            <span style={{
              fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: `hsl(${sevHsl})`, fontWeight: 700,
            }}>
              {status}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)', fontWeight: 600, marginTop: 4, lineHeight: 1.35 }}>
            {step.step_label}
          </div>

          {(step.llm_calls > 0 || step.web_searches > 0 || step.duration_ms) && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 6, display: 'flex', gap: 8 }}>
              {step.llm_calls > 0 && <span>{step.llm_calls} LLM</span>}
              {step.web_searches > 0 && <span>{step.web_searches} web</span>}
              {step.duration_ms && <span>{(step.duration_ms / 1000).toFixed(1)}s</span>}
            </div>
          )}

          {step.honest_note && status === 'completed' && (
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.65)',
              marginTop: 8, padding: 8, borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              lineHeight: 1.5,
            }}>
              {step.honest_note}
            </div>
          )}

          {step.error_message && (
            <div style={{
              fontSize: 11, color: '#fca5a5',
              marginTop: 8, padding: 8, borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.06)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              lineHeight: 1.5,
            }}>
              {step.error_message}
            </div>
          )}

          {hasViewable && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={onOpenViewer}
                style={{
                  padding: '6px 10px', borderRadius: 7,
                  border: `1px solid hsla(${sevHsl} / 0.3)`,
                  background: `hsla(${sevHsl} / 0.10)`,
                  color: `hsl(${sevHsl})`,
                  fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                <FileText size={11} />
                Open full artifact
              </button>
              {/* Phase D4 — Open in Documents (only for completed steps where
                 an artifact row exists in the artifacts table). The link
                 resolves via source coordinates — Documents page does the
                 lookup and selects the right row. */}
              {status === 'completed' && step.run_id && step.step_id && (
                <Link
                  to={`/documents?source_kind=pipeline_run&source_id=${step.run_id}&source_step_id=${step.step_id}`}
                  style={{
                    padding: '6px 10px', borderRadius: 7,
                    border: '1px solid rgba(160,160,180,0.25)',
                    background: 'transparent',
                    color: 'inherit', textDecoration: 'none',
                    fontSize: 10.5, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                  title="Open this artifact in the Documents page (with full workflow, version history, supersession chain)"
                >
                  <ExternalLink size={11} />
                  Open in Documents
                </Link>
              )}
            </div>
          )}

          {/* Phase 14.2 — resilience action buttons */}
          {(status === 'failed' || status === 'skipped') && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {canRetry && onRetryStep && (
                <button onClick={() => onRetryStep(step.step_index)}
                  title={`Retry this step (${retryCount}/${maxRetries} attempts used)`}
                  style={resilienceBtnStyle('186 80% 55%')}>
                  <RefreshCw size={11} />
                  Retry step {retryCount > 0 ? `(${retryCount}/${maxRetries})` : ''}
                </button>
              )}
              {canSkip && onSkipStep && (
                <button onClick={() => onSkipStep(step.step_index)}
                  title="Skip this step and continue pipeline"
                  style={resilienceBtnStyle('38 92% 55%')}>
                  <SkipForward size={11} />
                  Skip & continue
                </button>
              )}
              {canRetry && onRetryFromStep && (
                <button onClick={() => onRetryFromStep(step.step_index)}
                  title="Reset this step and all later steps to pending"
                  style={resilienceBtnStyle('210 30% 60%')}>
                  <PlayCircle size={11} />
                  Retry from here
                </button>
              )}
              {!canRetry && (status === 'failed' || status === 'skipped') && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', padding: '6px 0' }}>
                  Retry limit reached ({maxRetries}). Skip to continue, or investigate the root cause.
                </span>
              )}
            </div>
          )}

          {/* Phase 14.2 — show skip reason inline if applicable */}
          {status === 'skipped' && step.skipped_reason && (
            <div style={{
              fontSize: 10.5, color: 'rgba(255,255,255,0.55)',
              marginTop: 8, padding: 7, borderRadius: 6,
              background: 'rgba(251, 146, 60, 0.05)',
              border: '1px dashed rgba(251, 146, 60, 0.25)',
              fontStyle: 'italic',
            }}>
              Skipped: {step.skipped_reason}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function resilienceBtnStyle(hue: string): React.CSSProperties {
  return {
    padding: '5px 10px', borderRadius: 6,
    border: `1px solid hsla(${hue} / 0.35)`,
    background: `hsla(${hue} / 0.10)`,
    color: `hsl(${hue})`,
    fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 4,
  };
}

function ArtifactViewer({ step, onClose, moodHsl }: {
  step: PipelineStepDetail;
  onClose: () => void;
  moodHsl: string;
}) {
  const [copied, setCopied] = useState(false);

  const { renderable, isMarkdownLike } = useMemo(() => {
    if (step.error_message) {
      return { renderable: step.error_message, isMarkdownLike: false };
    }
    if (typeof step.output === 'string') {
      return { renderable: step.output, isMarkdownLike: true };
    }
    if (step.output && typeof step.output === 'object') {
      const obj: any = step.output;
      /* Phase 13a-v3: the runner now nests the artifact's rendered markdown
         body into output as _artifact_body. Prefer it over raw fields. */
      if (typeof obj._artifact_body === 'string' && obj._artifact_body.length > 0) {
        return { renderable: obj._artifact_body, isMarkdownLike: true };
      }
      if (typeof obj.body === 'string')    return { renderable: obj.body, isMarkdownLike: true };
      if (typeof obj.content === 'string') return { renderable: obj.content, isMarkdownLike: true };
      if (typeof obj.text === 'string')    return { renderable: obj.text, isMarkdownLike: true };
      /* Strip internal fields before JSON-dumping fallback */
      const cleaned = { ...obj };
      delete cleaned._artifact_body;
      return { renderable: JSON.stringify(cleaned, null, 2), isMarkdownLike: false };
    }
    return { renderable: '(no output)', isMarkdownLike: false };
  }, [step]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(renderable);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10020,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.25 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 900, maxHeight: '90vh',
          background: 'linear-gradient(180deg, #1a1b27 0%, #0f1018 100%)',
          border: `1px solid hsla(${moodHsl} / 0.3)`,
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 60px hsla(${moodHsl} / 0.12)`,
        }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>
              Artifact · {step.output_artifact_kind || step.step_id}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 2 }}>
              {step.step_label}
            </div>
          </div>
          <button onClick={handleCopy}
            style={{
              padding: '7px 11px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.04)',
              color: copied ? '#34d399' : 'rgba(255,255,255,0.75)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {isMarkdownLike ? (
            <SimpleMarkdown text={renderable} />
          ) : (
            <pre style={{
              margin: 0,
              fontSize: 11.5,
              fontFamily: 'ui-monospace, "SF Mono", monospace',
              color: 'rgba(255,255,255,0.88)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{renderable}</pre>
          )}
        </div>

        {(step.llm_calls > 0 || step.web_searches > 0 || step.duration_ms || step.honest_note) && (
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', display: 'flex', gap: 12 }}>
              {step.llm_calls > 0      && <span>{step.llm_calls} LLM calls</span>}
              {step.web_searches > 0   && <span>{step.web_searches} web searches</span>}
              {step.duration_ms        && <span>Ran in {(step.duration_ms / 1000).toFixed(1)}s</span>}
              {step.finished_at        && <span>Finished {new Date(step.finished_at).toLocaleTimeString()}</span>}
            </div>
            {step.honest_note && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>Honest note: </span>
                {step.honest_note}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: any[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      blocks.push({ type: 'ul', items: [...listBuffer] });
      listBuffer = [];
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
        flushList();
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) { codeBuffer.push(line); continue; }
    if (line.startsWith('### ')) { flushList(); blocks.push({ type: 'h3', text: line.slice(4) }); continue; }
    if (line.startsWith('## '))  { flushList(); blocks.push({ type: 'h2', text: line.slice(3) }); continue; }
    if (line.startsWith('# '))   { flushList(); blocks.push({ type: 'h1', text: line.slice(2) }); continue; }
    if (line.startsWith('> '))   { flushList(); blocks.push({ type: 'quote', text: line.slice(2) }); continue; }
    if (/^[-*]\s+/.test(line))   { listBuffer.push(line.replace(/^[-*]\s+/, '')); continue; }
    if (line.trim() === '')      { flushList(); blocks.push({ type: 'br' }); continue; }
    flushList();
    blocks.push({ type: 'p', text: line });
  }
  flushList();
  if (codeBuffer.length > 0) blocks.push({ type: 'code', text: codeBuffer.join('\n') });

  return (
    <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: 13.5, lineHeight: 1.7 }}>
      {blocks.map((b, i) => {
        if (b.type === 'h1') return <h1 key={i} style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginTop: i === 0 ? 0 : 20, marginBottom: 12 }}>{renderInline(b.text)}</h1>;
        if (b.type === 'h2') return <h2 key={i} style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginTop: 18, marginBottom: 10 }}>{renderInline(b.text)}</h2>;
        if (b.type === 'h3') return <h3 key={i} style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginTop: 14, marginBottom: 8 }}>{renderInline(b.text)}</h3>;
        if (b.type === 'p')  return <p key={i} style={{ margin: '0 0 10px' }}>{renderInline(b.text)}</p>;
        if (b.type === 'br') return <div key={i} style={{ height: 8 }} />;
        if (b.type === 'quote') return (
          <blockquote key={i} style={{
            margin: '8px 0', paddingLeft: 12,
            borderLeft: '3px solid rgba(255,255,255,0.2)',
            color: 'rgba(255,255,255,0.7)', fontStyle: 'italic',
          }}>{renderInline(b.text)}</blockquote>
        );
        if (b.type === 'ul') return (
          <ul key={i} style={{ margin: '8px 0 12px', paddingLeft: 20 }}>
            {b.items.map((it: string, j: number) => (
              <li key={j} style={{ marginBottom: 4 }}>{renderInline(it)}</li>
            ))}
          </ul>
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
        return null;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
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

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
