/* ════════════════════════════════════════════════════════════════
   src/components/pm/TaskRunner.tsx
   The card executor — the heart of the module.

   Flow:  setup → running → result
   - setup:   choose mode (AI executes / writes a human guide), pick a
              role, fill inputs. The honest time comparison is shown
              up front: human time vs AI time + verify time.
   - running: streams the AI output live.
   - result:  output shown; the PM marks which claims they've checked.
              A "Re-check" pass re-grounds the output on harder prompts.

   Transparency standard: the output is presented for the PM to audit,
   the time saving shown is the true NET saving, and the AI is prompted
   to flag every [ASSUMPTION].
════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from 'react';
import type { TaskCard, ExecutionMode, ExecRole } from './types';
import { TYPE_LABEL } from './engine';
import { getCapability, fmtMinutes, netSaving } from './caps';
import * as pmApi from './api';

const ROLES: { id: ExecRole; label: string }[] = [
  { id: 'senior_seo',      label: 'Senior SEO Strategist' },
  { id: 'content_writer',  label: 'Content Writer' },
  { id: 'team_lead',       label: 'Team Lead' },
  { id: 'project_manager', label: 'Project Manager' },
  { id: 'executive',       label: 'Executive' },
  { id: 'biz_dev',         label: 'Biz Dev Manager' },
];

type Phase = 'setup' | 'running' | 'result';

export default function TaskRunner({
  card, projectId, project, onClose, onDone,
}: {
  card: TaskCard;
  projectId: string;
  project: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const cap = useMemo(() => getCapability(card.type), [card.type]);
  const saving = useMemo(() => netSaving(cap), [cap]);

  const [phase, setPhase]   = useState<Phase>('setup');
  const [mode, setMode]     = useState<ExecutionMode>('ai_execute');
  const [role, setRole]     = useState<ExecRole>('senior_seo');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [context, setContext]   = useState<any>(null);
  const [learnings, setLearn]   = useState<any[]>([]);
  const [output, setOutput]     = useState(card.output || '');
  const [err, setErr]           = useState('');
  const [checked, setChecked]   = useState<Set<number>>(new Set());

  /* Load project context + relevant brain learnings for pre-fill. */
  useEffect(() => {
    (async () => {
      const [ctx, lrn] = await Promise.all([
        pmApi.getProjectContext(projectId),
        pmApi.getRelevantLearnings(projectId, card.type),
      ]);
      setContext(ctx);
      setLearn(lrn);
      /* pre-fill obvious inputs from Data Room context */
      const pre: Record<string, string> = {};
      const kw = ctx?.goals?.keywords || (ctx?.project?.keywords || [])[0];
      if (kw) pre.target_keyword = kw;
      if (ctx?.project?.url) pre.target_urls = ctx.project.url;
      if (ctx?.competitors?.c1) pre.competitor_url = ctx.competitors.c1;
      setInputs(pre);
    })();
  }, [projectId, card.type]);

  /* Run the card — streams the result. */
  const run = async () => {
    setPhase('running');
    setOutput('');
    setErr('');
    try {
      const res = await pmApi.executeCard({
        card, projectId, mode, role, userInputs: inputs,
        context: context || {}, brainLearnings: learnings,
      });
      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setOutput(acc);
      }
      setPhase('result');
    } catch (e: any) {
      setErr(e?.message || 'Execution failed');
      setPhase('setup');
    }
  };

  /* Re-check: re-run with a harder fact-check framing to re-ground claims. */
  const recheck = async () => {
    setPhase('running');
    const recheckInputs = { ...inputs, _recheck: 'true' };
    try {
      const res = await pmApi.executeCard({
        card, projectId, mode, role, userInputs: recheckInputs,
        context: context || {}, brainLearnings: learnings,
      });
      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setOutput(acc);
      }
      setChecked(new Set());
      setPhase('result');
    } catch (e: any) {
      setErr(e?.message || 'Re-check failed');
      setPhase('result');
    }
  };

  /* Lines the AI flagged as assumptions — the PM must check these. */
  const assumptionLines = useMemo(
    () => output.split('\n').filter(l => /\[ASSUMPTION\]/i.test(l)),
    [output],
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border sticky top-0 bg-card">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {TYPE_LABEL[card.type]} task
            </div>
            <h2 className="text-lg font-bold leading-tight">{card.title}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-5">

          {/* ── SETUP ── */}
          {phase === 'setup' && (
            <>
              {/* Honest time comparison */}
              <div className="rounded-xl border border-border bg-background/50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Time comparison
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <TimeBox label="A person, manually" value={fmtMinutes(cap.timeHuman)} tone="muted" />
                  <TimeBox label="AI produces it" value={fmtMinutes(cap.timeAI)} tone="primary" />
                  <TimeBox label="You verify it" value={fmtMinutes(cap.timeVerify)} tone="muted" />
                </div>
                <div className="mt-3 text-center text-sm">
                  <span className="text-green-400 font-semibold">
                    Net saving: {fmtMinutes(saving.saved)} ({saving.pct}%)
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    — honest figure: AI time + your verify time subtracted
                  </span>
                </div>
              </div>

              {/* Mode choice */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  How should this be done?
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <ModeCard
                    active={mode === 'ai_execute'}
                    onClick={() => setMode('ai_execute')}
                    title="AI executes it"
                    desc="The AI produces the finished work — code, draft, analysis. You review and approve."
                    time={`~${fmtMinutes(cap.timeAI + cap.timeVerify)} total`}
                  />
                  <ModeCard
                    active={mode === 'human_guide'}
                    onClick={() => setMode('human_guide')}
                    title="AI writes a how-to guide"
                    desc="A complete step-by-step guide so a non-technical team member can do it themselves."
                    time={`~${fmtMinutes(cap.timeHuman)} for the person`}
                  />
                </div>
              </div>

              {/* What AI produces / cannot do — honest expectations */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <div className="text-xs font-semibold text-green-400 mb-1.5">Produces</div>
                  <ul className="space-y-1">
                    {cap.produces.map((p, i) => (
                      <li key={i} className="text-xs text-foreground/80">• {p}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <div className="text-xs font-semibold text-amber-400 mb-1.5">Cannot do</div>
                  <ul className="space-y-1">
                    {cap.cannotDo.map((p, i) => (
                      <li key={i} className="text-xs text-foreground/80">• {p}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  AI expert voice
                </label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as ExecRole)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
                >
                  {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>

              {/* Inputs */}
              {cap.inputs.length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    What the AI needs from you
                  </div>
                  {cap.inputs.map(f => (
                    <div key={f.key}>
                      <label className="text-xs font-medium">{f.label}</label>
                      <p className="text-[10px] text-muted-foreground mb-1">{f.why}</p>
                      <input
                        value={inputs[f.key] || ''}
                        onChange={e => setInputs(p => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
                      />
                    </div>
                  ))}
                </div>
              )}

              {err && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">{err}</div>
              )}

              <button
                onClick={run}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                {mode === 'ai_execute' ? 'Run — AI executes this task' : 'Generate the how-to guide'}
              </button>
            </>
          )}

          {/* ── RUNNING ── */}
          {phase === 'running' && (
            <div>
              <div className="text-xs text-muted-foreground mb-2">
                {mode === 'ai_execute' ? 'AI is executing the task…' : 'Writing the guide…'}
              </div>
              <pre className="text-xs whitespace-pre-wrap leading-relaxed bg-background/50 border border-border rounded-lg p-4 max-h-[50vh] overflow-y-auto">
                {output || '…'}
              </pre>
            </div>
          )}

          {/* ── RESULT ── */}
          {phase === 'result' && (
            <>
              {/* Assumptions the AI flagged — the PM must check these */}
              {assumptionLines.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="text-xs font-semibold text-amber-400 mb-2 uppercase tracking-wider">
                    Needs your check — {assumptionLines.length} assumption{assumptionLines.length === 1 ? '' : 's'} flagged
                  </div>
                  <ul className="space-y-1.5">
                    {assumptionLines.map((line, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={checked.has(i)}
                          onChange={() => setChecked(s => {
                            const n = new Set(s);
                            n.has(i) ? n.delete(i) : n.add(i);
                            return n;
                          })}
                          className="mt-0.5"
                        />
                        <span className="text-xs text-amber-200/90">{line.replace(/\[ASSUMPTION\]/i, '').trim()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {assumptionLines.length === 0 && (
                <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3 text-xs text-green-400">
                  ✓ The AI flagged no assumptions — output is grounded in provided data. Still review before acting.
                </div>
              )}

              {/* The output */}
              <pre className="text-xs whitespace-pre-wrap leading-relaxed bg-background/50 border border-border rounded-lg p-4 max-h-[45vh] overflow-y-auto">
                {output}
              </pre>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={recheck}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary/40 text-muted-foreground hover:text-foreground transition-colors"
                >
                  Re-check (re-ground on a harder fact-check pass)
                </button>
                <button
                  onClick={() => { navigator.clipboard?.writeText(output).catch(() => {}); }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary/40 text-muted-foreground hover:text-foreground transition-colors"
                >
                  Copy output
                </button>
                <button
                  onClick={onDone}
                  className="text-xs px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 ml-auto transition-opacity"
                >
                  Done — back to board
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TimeBox({ label, value, tone }: { label: string; value: string; tone: 'muted' | 'primary' }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className={`text-lg font-bold font-mono ${tone === 'primary' ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function ModeCard({ active, onClick, title, desc, time }: {
  active: boolean; onClick: () => void; title: string; desc: string; time: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border p-3 transition-colors ${
        active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-3 h-3 rounded-full border-2 ${active ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
      <div className="text-[10px] text-primary mt-1.5 font-medium">{time}</div>
    </button>
  );
}
