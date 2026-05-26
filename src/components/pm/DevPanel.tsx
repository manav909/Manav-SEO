/* ════════════════════════════════════════════════════════════════
   src/components/pm/DevPanel.tsx
   Developer Panel — Claude IS the developer.

   Loop: Upload audit → Parse tasks → Execute → Fix generated →
         User applies fix → Verify → Done → Next task.

   This turns every audit finding into an executable dev workorder
   with Claude generating the exact code patch, step-by-step
   instructions, and post-apply verification.
════════════════════════════════════════════════════════════════ */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import * as pmApi from './api';

/* ── Types ─────────────────────────────────────────────────────── */
interface DevTask {
  id: string;
  phase: string;
  category: string;
  task_type: string;
  title: string;
  description?: string;
  finding_ref?: string;
  finding_title?: string;
  severity: 'critical' | 'warning' | 'info';
  target_url?: string;
  priority: number;
  status: 'pending' | 'running' | 'fix_ready' | 'applied' | 'verifying' | 'done' | 'skipped' | 'failed';
  analysis?: string;
  fix_code?: string;
  fix_language?: string;
  apply_instructions?: string;
  verification_method?: string;
  verification_result?: 'pass' | 'fail' | 'partial';
  verification_evidence?: any;
  executed_at?: string;
  verified_at?: string;
  llm_calls_used?: number;
  audit_run_id?: string;
}

/* ── API helpers ────────────────────────────────────────────────── */
const ENGINE = '/api/task-engine';
async function post(action: string, body: any) {
  const r = await fetch(ENGINE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  return r.json();
}

/* ── Constants ─────────────────────────────────────────────────── */
const PHASE_LABELS: Record<string, { label: string; color: string }> = {
  phase_0: { label: 'Phase 0 — Foundational (Critical)', color: 'text-red-400 border-red-500/30 bg-red-500/5' },
  phase_2: { label: 'Phase 2 — Content & On-page', color: 'text-amber-400 border-amber-500/30 bg-amber-500/5' },
  phase_3: { label: 'Phase 3 — Parallel (Start Anytime)', color: 'text-blue-400 border-blue-500/30 bg-blue-500/5' },
};

const CATEGORY_ICONS: Record<string, string> = {
  performance: '⚡',
  schema: '📋',
  on_page: '📝',
  content: '✍️',
  indexing: '🔍',
  analytics: '📊',
};

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-muted/50 text-muted-foreground border-border',
  running:   'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse',
  fix_ready: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  applied:   'bg-purple-500/10 text-purple-400 border-purple-500/30',
  verifying: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 animate-pulse',
  done:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  skipped:   'bg-muted/30 text-muted-foreground/50 border-border/30',
  failed:    'bg-red-500/10 text-red-400 border-red-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  pending:   'Pending',
  running:   'Analyzing…',
  fix_ready: 'Fix Ready',
  applied:   'Applied',
  verifying: 'Verifying…',
  done:      'Done ✓',
  skipped:   'Skipped',
  failed:    'Failed',
};

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════════ */
export default function DevPanel({ projectId }: { projectId: string }) {
  const [tasks, setTasks]           = useState<DevTask[]>([]);
  const [loading, setLoading]       = useState(false);
  const [parsing, setParsing]       = useState(false);
  const [error, setError]           = useState('');
  const [selectedTask, setSelected] = useState<DevTask | null>(null);
  const [uploadMode, setUploadMode] = useState(false);
  const [targetUrl, setTargetUrl]   = useState('');
  const [auditRunId, setAuditRunId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { selectedProject } = useProject();

  /* Load existing tasks */
  const loadTasks = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await post('dev_get_tasks', { projectId });
      if (r.tasks) setTasks(r.tasks);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  /* Refresh selected task */
  const refreshSelected = useCallback(async (taskId: string) => {
    const r = await post('dev_get_tasks', { projectId });
    if (r.tasks) {
      setTasks(r.tasks);
      const updated = r.tasks.find((t: DevTask) => t.id === taskId);
      if (updated) setSelected(updated);
    }
  }, [projectId]);

  /* Parse uploaded audit */
  const parseAudit = useCallback(async (markdown: string) => {
    setParsing(true);
    setError('');
    try {
      /* Extract findings from markdown — look for finding blocks */
      const findings: any[] = [];
      const findingBlocks = markdown.split(/\n<a id="finding-\d+-\d+"><\/a>\n/);

      for (const block of findingBlocks) {
        const severityMatch = block.match(/### §\d+\.\d+ — [🔴🟡🟢ℹ️]+ (MOBILE LCP|DESKTOP LCP|MOBILE TBT|DESKTOP TBT|[^\n]+)/);
        if (!severityMatch) continue;

        const isCritical = /🔴/.test(block);
        const isWarning  = /🟡/.test(block);
        const severity   = isCritical ? 'red' : isWarning ? 'amber' : 'green';

        const titleMatch = block.match(/### §\d+\.\d+ — [🎯🔴🟡🟢ℹ️ ]+ ([^\n]+)/);
        const title = titleMatch ? titleMatch[1].trim() : '';
        if (!title) continue;

        /* Extract audit kind from **Audit kind** line */
        const kindMatch = block.match(/\*\*Audit kind:\*\* `([^`]+)`/);
        const audit_kind = kindMatch ? kindMatch[1] : 'on_page_fundamentals';

        /* Extract detail */
        const detailMatch = block.match(/\*\*Detail:\*\*\n\n([\s\S]+?)(?:\n\n\*\*Recommendation:|$)/);
        const finding_detail = detailMatch ? detailMatch[1].trim().slice(0, 600) : '';

        /* Extract evidence JSON */
        let evidence: any = {};
        const evMatch = block.match(/```json\n([\s\S]+?)\n```/);
        if (evMatch) {
          try { evidence = JSON.parse(evMatch[1]); } catch {}
        }

        findings.push({ audit_kind, severity, finding_title: title, finding_detail, evidence });
      }

      /* Also detect audit_run_id from header */
      const runIdMatch = markdown.match(/\*\*Audit run id:\*\* `([^`]+)`/);
      const runId = runIdMatch ? runIdMatch[1] : `manual-${Date.now()}`;

      /* Extract audited URL */
      const urlMatch = markdown.match(/\*\*Audited URL:\*\* \[([^\]]+)\]/);
      const url = urlMatch ? urlMatch[1] : targetUrl;

      if (findings.length === 0) {
        setError('No findings found in audit. Make sure you uploaded the full audit markdown.');
        setParsing(false);
        return;
      }

      const r = await post('dev_parse_audit_tasks', {
        projectId,
        auditRunId: runId,
        targetUrl: url || targetUrl,
        findings,
      });

      if (r.error) { setError(r.error); return; }

      setAuditRunId(runId);
      setUploadMode(false);
      await loadTasks();
    } catch (e: any) {
      setError(e?.message || 'Parse failed');
    } finally {
      setParsing(false);
    }
  }, [projectId, targetUrl, loadTasks]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => parseAudit(ev.target?.result as string);
    reader.readAsText(file);
  };

  /* Execute a task */
  const executeTask = async (task: DevTask) => {
    setSelected({ ...task, status: 'running' });
    try {
      const r = await post('dev_execute_task', { taskId: task.id });
      if (r.error) { setError(r.error); return; }
      await refreshSelected(task.id);
    } catch (e: any) {
      setError(e?.message);
    }
  };

  /* Verify a task */
  const verifyTask = async (task: DevTask) => {
    setSelected({ ...task, status: 'verifying' });
    try {
      const r = await post('dev_verify_task', { taskId: task.id });
      if (r.error) { setError(r.error); return; }
      await refreshSelected(task.id);
    } catch (e: any) {
      setError(e?.message);
    }
  };

  /* Update status manually */
  const setStatus = async (task: DevTask, status: DevTask['status']) => {
    await post('dev_update_task', { taskId: task.id, updates: { status } });
    await refreshSelected(task.id);
  };

  /* Derived stats */
  const total  = tasks.length;
  const done   = tasks.filter(t => t.status === 'done').length;
  const critical = tasks.filter(t => t.severity === 'critical' && t.status !== 'done' && t.status !== 'skipped').length;

  /* Group tasks by phase */
  const phases = ['phase_0', 'phase_2', 'phase_3'] as const;
  const byPhase: Record<string, DevTask[]> = {};
  for (const p of phases) byPhase[p] = tasks.filter(t => t.phase === p);

  /* ── Upload UI ─────────────────────────────────────────────── */
  if (uploadMode || tasks.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="text-xl">🛠️</span> Developer Workspace
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Upload an audit report. Claude analyzes every finding, generates exact code fixes, and verifies they worked.
            </p>
          </div>
          {tasks.length > 0 && (
            <button onClick={() => setUploadMode(false)} className="text-xs text-muted-foreground hover:text-foreground underline">
              ← Back to tasks
            </button>
          )}
        </div>

        {/* Upload card */}
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/40 p-10 text-center">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="text-base font-semibold mb-2">Upload Technical Audit</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Drop the audit markdown file here. Claude will extract every developer-executable task — performance fixes, schema, on-page changes — and prepare exact code patches.
          </p>

          <input ref={fileRef} type="file" accept=".md,.txt" className="hidden" onChange={handleFileUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {parsing ? 'Parsing audit…' : 'Choose audit file (.md)'}
          </button>

          <div className="mt-6 border-t border-border pt-6">
            <p className="text-xs text-muted-foreground mb-3">Or enter the target URL manually:</p>
            <div className="flex gap-2 max-w-sm mx-auto">
              <input
                value={targetUrl}
                onChange={e => setTargetUrl(e.target.value)}
                placeholder="https://example.com/page"
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">{error}</div>
        )}
      </div>
    );
  }

  /* ── Main two-column layout ────────────────────────────────── */
  return (
    <div className="flex gap-6 min-h-[600px]">

      {/* LEFT: Task list */}
      <div className="w-[360px] flex-shrink-0 flex flex-col gap-3">

        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              🛠️ Developer Tasks
              <span className="text-xs font-mono text-muted-foreground">{done}/{total} done</span>
            </h2>
            {critical > 0 && (
              <p className="text-xs text-red-400 mt-0.5">{critical} critical unresolved</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadTasks}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              ↻
            </button>
            <button
              onClick={() => setUploadMode(true)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 transition-colors"
            >
              + New Audit
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        )}

        {/* Task list by phase */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {phases.map(phase => {
            const phaseTasks = byPhase[phase];
            if (!phaseTasks.length) return null;
            const phaseInfo = PHASE_LABELS[phase];
            const phaseDone = phaseTasks.filter(t => t.status === 'done' || t.status === 'skipped').length;
            return (
              <div key={phase}>
                <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-semibold mb-2 ${phaseInfo.color}`}>
                  <span>{phaseInfo.label}</span>
                  <span className="font-mono opacity-70">{phaseDone}/{phaseTasks.length}</span>
                </div>
                <div className="space-y-1.5">
                  {phaseTasks.map(task => (
                    <button
                      key={task.id}
                      onClick={() => setSelected(task)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        selectedTask?.id === task.id
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-border bg-card/50 hover:border-border/80 hover:bg-card/80'
                      } ${task.status === 'done' || task.status === 'skipped' ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm flex-shrink-0">{CATEGORY_ICONS[task.category] || '🔧'}</span>
                          <span className="text-xs font-medium leading-tight line-clamp-2">{task.title}</span>
                        </div>
                        <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${STATUS_STYLES[task.status]}`}>
                          {STATUS_LABELS[task.status]}
                        </span>
                      </div>
                      {task.finding_ref && (
                        <div className="mt-1 text-[10px] text-muted-foreground font-mono">{task.finding_ref}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: Task detail / execution area */}
      <div className="flex-1 min-w-0">
        {!selectedTask ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">⬅️</div>
              <p className="text-sm text-muted-foreground">Select a task to see the fix</p>
            </div>
          </div>
        ) : (
          <TaskDetail
            task={selectedTask}
            onExecute={() => executeTask(selectedTask)}
            onVerify={() => verifyTask(selectedTask)}
            onSetApplied={() => setStatus(selectedTask, 'applied')}
            onSkip={() => setStatus(selectedTask, 'skipped')}
            onReopen={() => setStatus(selectedTask, 'pending')}
          />
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TASK DETAIL PANEL
════════════════════════════════════════════════════════════════ */
function TaskDetail({
  task,
  onExecute,
  onVerify,
  onSetApplied,
  onSkip,
  onReopen,
}: {
  task: DevTask;
  onExecute: () => void;
  onVerify: () => void;
  onSetApplied: () => void;
  onSkip: () => void;
  onReopen: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyFix = () => {
    if (!task.fix_code) return;
    navigator.clipboard.writeText(task.fix_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sevColor = task.severity === 'critical' ? 'text-red-400' : task.severity === 'warning' ? 'text-amber-400' : 'text-blue-400';

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Task header */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{CATEGORY_ICONS[task.category] || '🔧'}</span>
              <span className={`text-xs font-semibold uppercase tracking-wider ${sevColor}`}>
                {task.severity} · {task.category}
              </span>
              {task.finding_ref && (
                <span className="text-xs font-mono text-muted-foreground">{task.finding_ref}</span>
              )}
            </div>
            <h3 className="text-sm font-semibold leading-snug">{task.title}</h3>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
            )}
          </div>
          <span className={`flex-shrink-0 text-xs px-2 py-1 rounded-lg border font-medium ${STATUS_STYLES[task.status]}`}>
            {STATUS_LABELS[task.status]}
          </span>
        </div>

        {task.finding_title && (
          <div className="mt-3 p-2.5 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
              Finding: {task.finding_title}
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {(task.status === 'pending' || task.status === 'failed') && (
          <button
            onClick={onExecute}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-[0_0_16px_hsl(var(--primary)/0.3)]"
          >
            ▶ Analyze & Generate Fix
          </button>
        )}
        {task.status === 'running' && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm">
            <span className="animate-spin">⟳</span> Claude is analyzing the live page…
          </div>
        )}
        {task.status === 'fix_ready' && (
          <>
            <button
              onClick={onSetApplied}
              className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-all"
            >
              ✓ I Applied the Fix
            </button>
            <button
              onClick={onExecute}
              className="px-3 py-2 rounded-xl border border-border text-muted-foreground text-sm hover:text-foreground hover:border-border/80 transition-all"
            >
              ↺ Re-analyze
            </button>
          </>
        )}
        {task.status === 'applied' && (
          <button
            onClick={onVerify}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-sm font-semibold hover:bg-indigo-500/20 transition-all"
          >
            🔍 Verify Fix on Live Page
          </button>
        )}
        {task.status === 'verifying' && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-sm">
            <span className="animate-spin">⟳</span> Checking live page…
          </div>
        )}
        {task.status === 'done' && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium">
            ✅ Complete — fix verified on live page
          </div>
        )}
        {task.status !== 'done' && task.status !== 'skipped' && task.status !== 'running' && task.status !== 'verifying' && (
          <button
            onClick={onSkip}
            className="px-3 py-2 rounded-xl border border-border text-muted-foreground text-xs hover:text-foreground transition-all"
          >
            Skip
          </button>
        )}
        {(task.status === 'done' || task.status === 'skipped') && (
          <button
            onClick={onReopen}
            className="px-3 py-2 rounded-xl border border-border text-muted-foreground text-xs hover:text-foreground transition-all"
          >
            ↺ Reopen
          </button>
        )}
      </div>

      {/* Verification result */}
      {task.verification_result && (
        <div className={`rounded-xl border p-3 text-sm ${
          task.verification_result === 'pass' ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-400' :
          task.verification_result === 'partial' ? 'bg-amber-500/5 border-amber-500/30 text-amber-400' :
          'bg-red-500/5 border-red-500/30 text-red-400'
        }`}>
          <div className="font-semibold mb-1">
            {task.verification_result === 'pass' ? '✅ Verification PASSED' :
             task.verification_result === 'partial' ? '⚠️ Verification PARTIAL' :
             '❌ Verification FAILED — fix not detected on live page'}
          </div>
          {task.verification_evidence && (
            <pre className="text-[11px] opacity-80 mt-1 whitespace-pre-wrap">
              {JSON.stringify(task.verification_evidence, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Analysis */}
      {task.analysis && (
        <div className="rounded-xl border border-border bg-card/30 p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Analysis — What Claude Found on the Live Page
          </h4>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.analysis}</p>
        </div>
      )}

      {/* Fix code */}
      {task.fix_code && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/3 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-500/20">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-semibold text-xs">⚡ EXACT FIX CODE</span>
              {task.fix_language && (
                <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                  {task.fix_language}
                </span>
              )}
            </div>
            <button
              onClick={copyFix}
              className={`text-xs px-3 py-1 rounded-lg border transition-all font-medium ${
                copied
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
              }`}
            >
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all text-foreground/90 max-h-72">
            {task.fix_code}
          </pre>
        </div>
      )}

      {/* Application instructions */}
      {task.apply_instructions && (
        <div className="rounded-xl border border-border bg-card/30 p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            📋 How to Apply This Fix
          </h4>
          <div className="text-sm leading-relaxed whitespace-pre-wrap space-y-1">
            {task.apply_instructions.split('\n').map((line, i) => (
              <p key={i} className={line.match(/^\d+\./) ? 'font-medium' : 'text-muted-foreground pl-4'}>
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Verification method */}
      {task.verification_method && task.status !== 'done' && (
        <div className="rounded-xl border border-border/50 bg-card/20 p-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            🔍 After Applying — How to Verify
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">{task.verification_method}</p>
          {task.status === 'applied' && (
            <button
              onClick={() => {}}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              → Click "Verify Fix on Live Page" above to auto-check
            </button>
          )}
        </div>
      )}

      {/* Empty state — not yet executed */}
      {!task.analysis && !task.fix_code && task.status === 'pending' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8 rounded-xl border border-dashed border-border">
            <div className="text-4xl mb-3">🔬</div>
            <p className="text-sm font-medium mb-1">Ready to execute</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Click "Analyze & Generate Fix" — Claude will fetch the live page, identify the exact problem, and generate the code patch with step-by-step application instructions.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
