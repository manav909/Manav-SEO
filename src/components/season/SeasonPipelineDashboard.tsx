/* ════════════════════════════════════════════════════════════════
   src/components/season/SeasonPipelineDashboard.tsx
   Phase 13a — Live pipeline dashboard.

   When S.E.A.S.O.N. kicks off a pipeline ("rank for X"), this
   replaces the basic modal "thinking" state with a live dashboard:
     • Big mood-colored timer at top showing elapsed seconds
     • One window per step in a responsive grid
     • Each window color-coded by status (pending/running/completed/failed/skipped)
     • Active step pulses; completed steps show artifact preview
     • "Ask S.E.A.S.O.N." input bar stays available throughout

   Polls bs_season_pipeline_get every 2 seconds. Stops polling when
   the run's status leaves 'running'. Animations are simple fades and
   pulses — Phase 13b will add the SVG threading and pulse-along-path.

   Visual hierarchy:
     1. Timer (most prominent)
     2. Active step window (pulsing)
     3. Other step windows (static, color-coded)
     4. Ask bar (bottom)
═══════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, Circle, AlertCircle, Clock, X } from 'lucide-react';
import { useSeason } from '@/contexts/SeasonContext';
import { seasonPipelineGet, type PipelineStepDetail, type PipelineRunDetail } from '@/components/pm/api';

interface SeasonPipelineDashboardProps {
  runId:          string;
  expectedSteps:  number;     // from launch response, so we can show ghosts before first poll
  pipelineLabel:  string;     // "Ranking for 'mobile app forms'"
  onClose:        () => void;
  onComplete?:    (run: PipelineRunDetail) => void;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 10 * 60 * 1000;   // 10 min ceiling, after which we stop polling

const MOOD_HSL_STATUS: Record<string, string> = {
  pending:   '210 30% 50%',
  running:   '186 80% 55%',
  completed: '152 70% 50%',
  failed:    '0 75% 55%',
  skipped:   '38 60% 55%',
  awaiting_review: '262 75% 60%',
};

export default function SeasonPipelineDashboard({
  runId, expectedSteps, pipelineLabel, onClose, onComplete,
}: SeasonPipelineDashboardProps) {
  const { mood } = useSeason();
  const [run, setRun]       = useState<PipelineRunDetail | null>(null);
  const [steps, setSteps]   = useState<PipelineStepDetail[]>([]);
  const [polling, setPolling] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError]   = useState<string | null>(null);
  const pollStartedAt = useRef(Date.now());
  const completedRef = useRef(false);

  /* ── Polling loop ─────────────────────────────────────────── */
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
        if (r.run)    setRun(r.run);
        if (r.steps)  setSteps(r.steps);

        const runStatus = r.run?.status;
        const isTerminal = runStatus && ['completed', 'failed', 'cancelled'].includes(runStatus);
        const hitMax = Date.now() - pollStartedAt.current > MAX_POLL_DURATION_MS;

        if (isTerminal || hitMax) {
          setPolling(false);
          if (isTerminal && !completedRef.current && r.run) {
            completedRef.current = true;
            onComplete?.(r.run);
          }
        }
      } catch (e: any) {
        setError(e?.message || 'poll failed');
        setPolling(false);
      }
    };
    /* Poll immediately, then every POLL_INTERVAL_MS */
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [runId, onComplete]);

  /* ── Timer ────────────────────────────────────────────────── */
  useEffect(() => {
    if (!polling) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - pollStartedAt.current) / 1000)), 250);
    return () => clearInterval(id);
  }, [polling]);

  /* ── Mood color for the timer ─────────────────────────────── */
  const moodHsl = mood === 'critical' ? '0 75% 55%' :
                   mood === 'alert'    ? '38 92% 55%' :
                   mood === 'celebrating' ? '152 70% 50%' :
                   '186 80% 55%';

  const isDone = run && ['completed', 'failed', 'cancelled'].includes(run.status || '');

  /* Build display steps — use real steps if we have them, otherwise ghosts */
  const displaySteps = steps.length > 0
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
        {/* Header: pipeline label + close */}
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16, pointerEvents: 'auto',
          }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>
              S.E.A.S.O.N. · Pipeline
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 2 }}>
              {pipelineLabel}
            </div>
          </div>
          <button onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <X size={16} />
          </button>
        </motion.div>

        {/* THE BIG TIMER — second most prominent UI element */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{
            display: 'flex', alignItems: 'baseline', gap: 16,
            marginBottom: 24, pointerEvents: 'auto',
          }}>
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
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
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

        {/* Step grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
          alignContent: 'start',
          flex: 1,
          pointerEvents: 'auto',
        }}>
          <AnimatePresence>
            {displaySteps.map((step, idx) => (
              <StepCard
                key={step.id}
                step={step}
                index={idx}
                isActive={polling && (run?.step_current || 0) === step.step_index + 1 && step.status === 'running'}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Footer: completion summary or stop indicator */}
        {isDone && run?.honest_summary && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              border: `1px solid hsla(${moodHsl} / 0.3)`,
              background: 'rgba(15,16,24,0.7)',
              pointerEvents: 'auto',
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
    </motion.div>
  );
}

/* ─── Per-step card ─────────────────────────────────────────── */

function StepCard({ step, index, isActive }: {
  step: PipelineStepDetail;
  index: number;
  isActive: boolean;
}) {
  const status = step.status || 'pending';
  const sevHsl = MOOD_HSL_STATUS[status] || MOOD_HSL_STATUS.pending;
  const [expanded, setExpanded] = useState(false);

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
      onClick={() => (step.output || step.error_message) && setExpanded(e => !e)}
      style={{
        borderRadius: 14,
        border: `1px solid hsla(${sevHsl} / ${isActive ? 0.5 : 0.25})`,
        background: `linear-gradient(180deg, hsla(${sevHsl} / 0.07) 0%, rgba(15,16,24,0.85) 100%)`,
        padding: 14,
        cursor: (step.output || step.error_message) ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
      }}>
      {/* Pulse aura for active step */}
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

          {/* Inline stats */}
          {(step.llm_calls > 0 || step.web_searches > 0 || step.duration_ms) && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 6, display: 'flex', gap: 8 }}>
              {step.llm_calls > 0 && <span>{step.llm_calls} LLM</span>}
              {step.web_searches > 0 && <span>{step.web_searches} web</span>}
              {step.duration_ms && <span>{(step.duration_ms / 1000).toFixed(1)}s</span>}
            </div>
          )}

          {/* Honest note */}
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

          {/* Error message */}
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
        </div>
      </div>

      {/* Expanded artifact preview */}
      <AnimatePresence>
        {expanded && step.output && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            style={{ overflow: 'hidden' }}>
            <div style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 8,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.05)',
              fontSize: 11, color: 'rgba(255,255,255,0.7)',
              fontFamily: 'ui-monospace, monospace',
              maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
            }}>
              {typeof step.output === 'string'
                ? step.output.slice(0, 1200)
                : JSON.stringify(step.output, null, 2).slice(0, 1200)}
              {(typeof step.output === 'string' ? step.output : JSON.stringify(step.output)).length > 1200 && (
                <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.4)' }}>… (truncated)</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
