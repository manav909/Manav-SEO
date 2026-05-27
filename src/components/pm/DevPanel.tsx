/* ════════════════════════════════════════════════════════════════
   src/components/pm/DevPanel.tsx
   Developer Workspace — by Manav
   
   Upload audit → Manav detects CMS → snapshots live page → generates
   exact fix code with CMS-specific step-by-step instructions →
   user applies → Manav verifies on live page → done.

   No patches. Complete file. Every function is self-contained.
   Every API call handles non-JSON and network errors explicitly.
════════════════════════════════════════════════════════════════ */

import { useState, useRef, useCallback, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface DevTask {
  id: string;
  phase: 'phase_0' | 'phase_2' | 'phase_3';
  category: 'performance' | 'schema' | 'on_page' | 'content' | 'indexing';
  task_type: string;
  title: string;
  description?: string;
  finding_title?: string;
  severity: 'critical' | 'warning' | 'info';
  target_url?: string;
  priority: number;
  status: TaskStatus;
  // Set after execution
  analysis?: string;
  fix_code?: string;
  fix_language?: string;
  apply_instructions?: string;
  verification_method?: string;
  rollback_code?: string;
  rollback_instructions?: string;
  snapshot_id?: string;
  backup_confirmed?: boolean;
  // Set after verification
  verification_result?: 'pass' | 'fail' | 'partial';
  verification_evidence?: Record<string, unknown>;
  cms_platform?: string;
}

type TaskStatus =
  | 'pending'
  | 'running'
  | 'fix_ready'
  | 'applied'
  | 'verifying'
  | 'done'
  | 'skipped'
  | 'failed';

interface CmsInfo {
  platform: string;
  seoPlugin: string;
  confidence: number;
  adminPath: string;
  notes?: string;
}

interface AuditFinding {
  audit_kind: string;
  severity: 'red' | 'amber' | 'green' | 'info';
  finding_title: string;
  finding_detail: string;
  evidence: Record<string, unknown>;
}

interface ApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  rawBody?: string; // included when JSON parsing fails — helps diagnosis
}

// ─────────────────────────────────────────────────────────────
// API LAYER
// Every call goes through callApi. It checks r.ok before r.json().
// If the response is not JSON it captures the raw text and returns
// a structured error — the UI never crashes on "Unexpected token".
// ─────────────────────────────────────────────────────────────

async function callApi<T = unknown>(action: string, payload: Record<string, unknown>): Promise<ApiResult<T>> {
  let rawBody = '';
  try {
    const response = await fetch('/api/task-engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });

    rawBody = await response.text();

    if (!rawBody.trim()) {
      return { ok: false, error: `Empty response from server (HTTP ${response.status})` };
    }

    // Only parse JSON if the response looks like JSON
    const firstChar = rawBody.trimStart()[0];
    if (firstChar !== '{' && firstChar !== '[') {
      return {
        ok: false,
        error: `Server returned non-JSON response (HTTP ${response.status}). Check Supabase table permissions.`,
        rawBody: rawBody.slice(0, 300),
      };
    }

    const json = JSON.parse(rawBody) as Record<string, unknown>;

    if (!response.ok) {
      return { ok: false, error: String(json.error || json.message || `HTTP ${response.status}`), data: json as T };
    }

    if (json.error) {
      return { ok: false, error: String(json.error), data: json as T };
    }

    return { ok: true, data: json as T };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      ok: false,
      error: `Network or parse error: ${message}`,
      rawBody: rawBody.slice(0, 300),
    };
  }
}

// ─────────────────────────────────────────────────────────────
// AUDIT PARSER
// Extracts findings from the audit markdown file.
// Uses line-by-line heading detection — no emoji character classes.
// ─────────────────────────────────────────────────────────────

function parseAuditMarkdown(markdown: string): { findings: AuditFinding[]; runId: string; url: string } {
  // Split into finding blocks by anchor tags
  const blocks = markdown.split(/\n<a id="finding-\d+-\d+"><\/a>\n/);

  const findings: AuditFinding[] = [];

  for (const block of blocks) {
    // Find the ### §N.N heading line — search line by line
    const lines = block.split('\n');
    const headingLine = lines.find(line => /^### §[\d.]+/.test(line));
    if (!headingLine) continue;

    // Determine severity from the emoji on the heading line
    // Test each emoji individually — avoid character classes with multi-codepoint emoji
    let severity: AuditFinding['severity'] = 'info';
    if (headingLine.includes('🔴')) severity = 'red';
    else if (headingLine.includes('🟡')) severity = 'amber';
    else if (headingLine.includes('🟢')) severity = 'green';

    // Extract title: remove ### §N.N — prefix, then remove all badge characters
    // We do NOT use a regex character class containing emoji — we strip them one by one
    const titleRaw = headingLine
      .replace(/^###\s+§[\d.]+\s*(?:—\s*)?/, '')  // strip ### §3.1 —
      .replace(/🎯/gu, '')
      .replace(/🔴/gu, '')
      .replace(/🟡/gu, '')
      .replace(/🟢/gu, '')
      .replace(/ℹ️/gu, '')
      .replace(/^\s+/, '')  // leading whitespace
      .trim();

    if (!titleRaw || titleRaw.length < 4) continue;

    // Audit kind
    const kindMatch = block.match(/\*\*Audit kind:\*\*\s*`([^`]+)`/);
    const audit_kind = kindMatch?.[1] ?? 'on_page_fundamentals';

    // Finding detail (text between **Detail:** and **Recommendation:** or end)
    const detailMatch = block.match(/\*\*Detail:\*\*\n\n([\s\S]+?)(?=\n\n\*\*Recommendation:|$)/);
    const finding_detail = (detailMatch?.[1] ?? '').trim().slice(0, 600);

    // Evidence JSON — extract from first ```json block in this finding
    let evidence: Record<string, unknown> = {};
    const jsonBlocks = block.match(/```json\n([\s\S]+?)\n```/g);
    if (jsonBlocks) {
      for (const jsonBlock of jsonBlocks) {
        const jsonContent = jsonBlock.replace(/^```json\n/, '').replace(/\n```$/, '');
        try {
          const parsed = JSON.parse(jsonContent);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            evidence = parsed as Record<string, unknown>;
            break;
          }
        } catch {
          // Try next block
        }
      }
    }

    findings.push({ audit_kind, severity, finding_title: titleRaw, finding_detail, evidence });
  }

  // Extract run ID and URL from the header
  const runIdMatch = markdown.match(/\*\*Audit run id:\*\*\s*`([^`]+)`/);
  const urlMatch = markdown.match(/\*\*Audited URL:\*\*\s*\[([^\]]+)\]/);

  return {
    findings,
    runId: runIdMatch?.[1] ?? `manual-${Date.now()}`,
    url: urlMatch?.[1] ?? '',
  };
}

// ─────────────────────────────────────────────────────────────
// DISPLAY CONSTANTS
// ─────────────────────────────────────────────────────────────

const PHASE_CONFIG: Record<string, { label: string; borderClass: string; dotClass: string }> = {
  phase_0: { label: 'Phase 0 — Fix First (Critical)', borderClass: 'border-red-500/40 bg-red-500/5', dotClass: 'bg-red-500' },
  phase_2: { label: 'Phase 2 — Content & On-page',    borderClass: 'border-amber-500/40 bg-amber-500/5', dotClass: 'bg-amber-500' },
  phase_3: { label: 'Phase 3 — Parallel (Any Time)',  borderClass: 'border-blue-500/40 bg-blue-500/5', dotClass: 'bg-blue-400' },
};

const CATEGORY_ICON: Record<string, string> = {
  performance: '⚡', schema: '📋', on_page: '📝', content: '✍️', indexing: '🔍', analytics: '📊',
};

const STATUS_CLASS: Record<TaskStatus, string> = {
  pending:   'bg-muted/60 text-muted-foreground border-transparent',
  running:   'bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse',
  fix_ready: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  applied:   'bg-purple-500/15 text-purple-300 border-purple-500/30',
  verifying: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 animate-pulse',
  done:      'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  skipped:   'bg-muted/20 text-muted-foreground/40 border-transparent',
  failed:    'bg-red-500/15 text-red-400 border-red-500/30',
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending:   'Pending',
  running:   'Analyzing…',
  fix_ready: 'Fix Ready',
  applied:   'Applied',
  verifying: 'Verifying…',
  done:      'Done ✓',
  skipped:   'Skipped',
  failed:    'Failed',
};

const CMS_EMOJI: Record<string, string> = {
  wordpress: '🔵', webflow: '💎', squarespace: '⬛', wix: '🟣',
  shopify: '🟢', hubspot: '🟠', drupal: '💧', ghost: '👻', framer: '⚡',
  custom: '🔧', unknown: '❓',
};

// ─────────────────────────────────────────────────────────────
// SAFETY CHECKLIST MODAL
// ─────────────────────────────────────────────────────────────

function SafetyModal({
  task,
  cms,
  onConfirm,
  onCancel,
}: {
  task: DevTask;
  cms: CmsInfo | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [backupChecked,   setBackupChecked]   = useState(false);
  const [stagingChecked,  setStagingChecked]  = useState(false);
  const [rollbackChecked, setRollbackChecked] = useState(false);
  const allChecked = backupChecked && rollbackChecked;

  const platform = cms?.platform ?? task.cms_platform ?? 'unknown';

  const backupDetail =
    platform === 'wordpress'    ? 'Go to Plugins → UpdraftPlus → Backup Now before making this change.' :
    platform === 'shopify'      ? 'Go to Themes → Actions → Download theme backup first.' :
    platform === 'webflow'      ? 'Webflow keeps automatic history — you can restore any publish. No action needed.' :
    platform === 'squarespace'  ? 'Export your content: Settings → Advanced → Export first.' :
                                  'Ask your hosting provider how to take a full backup before proceeding.';

  const stagingDetail =
    platform === 'wordpress'  ? 'WP Engine / Kinsta / Flywheel have one-click staging. If unavailable, skip this step.' :
    platform === 'webflow'    ? 'Webflow lets you preview changes before publishing — use that as your staging.' :
                                'If no staging environment is available, skip and verify immediately after applying.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">

        <div className="flex items-center gap-3">
          <span className="text-3xl">🛡️</span>
          <div>
            <h3 className="text-base font-bold">Pre-apply Safety Check</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Live client site — confirm before applying.</p>
          </div>
        </div>

        {/* Manav's backup */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex gap-3 items-start">
          <span className="text-xl flex-shrink-0">✅</span>
          <div>
            <div className="text-xs font-semibold text-emerald-400">Manav has saved a page snapshot</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              The relevant HTML was captured before generating this fix. The Rollback tab shows exactly how to undo every change.
            </div>
            {task.snapshot_id && (
              <div className="text-[10px] font-mono text-emerald-400/60 mt-1">Snapshot: {task.snapshot_id.slice(0, 8)}…</div>
            )}
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-3">
          <ChecklistItem
            checked={backupChecked}
            onToggle={() => setBackupChecked(v => !v)}
            label="I have a full site backup ready"
            detail={backupDetail}
          />
          <ChecklistItem
            checked={stagingChecked}
            onToggle={() => setStagingChecked(v => !v)}
            label="Tested on staging first (if available)"
            detail={stagingDetail}
            optional
          />
          <ChecklistItem
            checked={rollbackChecked}
            onToggle={() => setRollbackChecked(v => !v)}
            label="I have read the Rollback tab and know how to undo this"
            detail="The Rollback tab shows the original code and CMS-specific steps to revert."
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Not yet
          </button>
          <button
            onClick={onConfirm}
            disabled={!allChecked}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              allChecked
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_16px_hsl(var(--primary)/0.25)]'
                : 'bg-muted/50 text-muted-foreground cursor-not-allowed'
            }`}
          >
            Confirm & Mark Applied
          </button>
        </div>
      </div>
    </div>
  );
}

function ChecklistItem({
  checked,
  onToggle,
  label,
  detail,
  optional,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  detail: string;
  optional?: boolean;
}) {
  return (
    <label
      className={`flex gap-3 items-start p-3 rounded-xl border cursor-pointer transition-all select-none ${
        checked ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card/40 hover:border-border/70'
      }`}
      onClick={onToggle}
    >
      <div
        className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center transition-all ${
          checked ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground/40'
        }`}
      >
        {checked && <span className="text-white text-[11px] font-bold leading-none">✓</span>}
      </div>
      <div>
        <div className="text-xs font-medium">
          {label}
          {optional && <span className="ml-1 text-muted-foreground/60 font-normal">(optional)</span>}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{detail}</div>
      </div>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PANEL
// ─────────────────────────────────────────────────────────────

export default function DevPanel({ projectId }: { projectId: string }) {
  const [tasks,       setTasks]       = useState<DevTask[]>([]);
  const [cms,         setCms]         = useState<CmsInfo | null>(null);
  const [selected,    setSelected]    = useState<DevTask | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [parsing,     setParsing]     = useState(false);
  const [error,       setError]       = useState('');
  const [targetUrl,   setTargetUrl]   = useState('');
  const [showUpload,  setShowUpload]  = useState(false);
  const [showSafety,  setShowSafety]  = useState(false);
  const [elapsedSec,  setElapsedSec]  = useState(0);
  const [runStarted,  setRunStarted]  = useState<number | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef    = useRef<HTMLInputElement>(null);

  // Load tasks from DB — also auto-resets stale 'running' tasks on load
  const loadTasks = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const result = await callApi<{ tasks: DevTask[] }>('dev_get_tasks', { projectId });
      if (result.ok && result.data?.tasks) {
        const loadedTasks = result.data.tasks;

        // Auto-reset stale 'running' tasks — anything stuck running for > 2 min
        // was almost certainly a timeout. Reset to failed so the user can retry.
        for (const task of loadedTasks) {
          if (task.status === 'running' && task.executed_at) {
            const ageMs = Date.now() - new Date(task.executed_at).getTime();
            if (ageMs > 120_000) {
              await callApi('dev_update_task', {
                taskId: task.id,
                updates: {
                  status: 'failed',
                  analysis: 'Analysis timed out. Click "Retry Analysis" to try again.',
                },
              });
              task.status = 'failed';
              task.analysis = 'Analysis timed out. Click "Retry Analysis" to try again.';
            }
          }
        }

        setTasks(loadedTasks);
        // Infer CMS from task metadata if not yet set
        if (!cms) {
          const taskWithCms = loadedTasks.find(t => t.cms_platform);
          if (taskWithCms?.cms_platform) {
            setCms({ platform: taskWithCms.cms_platform, seoPlugin: '', confidence: 0, adminPath: '' });
          }
        }
      } else if (!result.ok && result.error) {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, cms]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (pollRef.current)    clearInterval(pollRef.current);
    };
  }, []);

  // Reload a single task and update the list + selected
  const reloadTask = useCallback(async (taskId: string) => {
    const result = await callApi<{ tasks: DevTask[] }>('dev_get_tasks', { projectId });
    if (result.ok && result.data?.tasks) {
      const updated = result.data.tasks;
      setTasks(updated);
      const refreshed = updated.find(t => t.id === taskId);
      if (refreshed) setSelected(refreshed);
    }
  }, [projectId]);

  // Upload handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') uploadAudit(content);
    };
    reader.onerror = () => setError('Could not read the file. Try again.');
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const uploadAudit = async (markdown: string) => {
    setParsing(true);
    setError('');
    try {
      // Parse the audit markdown
      const { findings, runId, url: auditUrl } = parseAuditMarkdown(markdown);

      if (findings.length === 0) {
        setError('No findings found in this file. Make sure you uploaded the full technical audit .md file.');
        return;
      }

      const resolvedUrl = auditUrl || targetUrl;

      // Send to API — only send non-green findings (green = passing, no fix needed)
      const actionableFindings = findings.filter(f => f.severity !== 'green');
      const result = await callApi<{ tasks_created: number }>('dev_parse_audit_tasks', {
        projectId,
        auditRunId: runId,
        targetUrl: resolvedUrl,
        findings: actionableFindings,
      });

      if (!result.ok) {
        setError(result.error ?? 'Could not create tasks.');
        if (result.rawBody) {
          console.error('[DevPanel] Raw server response:', result.rawBody);
        }
        return;
      }

      // Detect CMS in background — does not block the flow
      callApi<{ cms: CmsInfo }>('dev_detect_cms', { projectId, url: resolvedUrl })
        .then(cmsResult => {
          if (cmsResult.ok && cmsResult.data?.cms) {
            setCms(cmsResult.data.cms);
          }
        })
        .catch(() => { /* CMS detection is optional */ });

      setShowUpload(false);
      await loadTasks();
    } finally {
      setParsing(false);
    }
  };

  const executeTask = async (task: DevTask) => {
    setSelected({ ...task, status: 'running' });
    setError('');
    setElapsedSec(0);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);

    // Synchronous — server does the work and returns the completed task.
    // PATH A tasks (faq, h1, gsc, etc.): ~5-10s.
    // PATH B/C tasks (page fetch + AI): up to 45s.
    const result = await callApi<{ task: DevTask }>('dev_execute_task', { taskId: task.id });

    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }

    if (!result.ok) {
      setError(result.error ?? 'Execution failed.');
      await reloadTask(task.id);
      return;
    }

    if (result.data?.task?.cms_platform && !cms) {
      setCms({ platform: result.data.task.cms_platform, seoPlugin: '', confidence: 0, adminPath: '' });
    }

    await reloadTask(task.id);
  };

  const startPolling = useCallback((_taskId: string) => {
    // Polling no longer used — execution is synchronous.
    // Kept as stub so nothing breaks if called elsewhere.
  }, []);

  const verifyTask = async (task: DevTask) => {
    setSelected({ ...task, status: 'verifying' });
    setElapsedSec(0);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);

    const result = await callApi<{ task: DevTask }>('dev_verify_task', { taskId: task.id });

    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }

    if (!result.ok) {
      setError(result.error ?? 'Verification failed.');
    }
    await reloadTask(task.id);
  };

  const confirmApplied = async (task: DevTask) => {
    setShowSafety(false);
    await callApi('dev_confirm_backup', { taskId: task.id });
    await callApi('dev_update_task', { taskId: task.id, updates: { status: 'applied', backup_confirmed: true } });
    await reloadTask(task.id);
  };

  const setTaskStatus = async (task: DevTask, status: TaskStatus) => {
    await callApi('dev_update_task', { taskId: task.id, updates: { status } });
    await reloadTask(task.id);
  };

  // Derived stats
  const totalTasks    = tasks.length;
  const doneTasks     = tasks.filter(t => t.status === 'done').length;
  const openCritical  = tasks.filter(t => t.severity === 'critical' && t.status !== 'done' && t.status !== 'skipped').length;
  const byPhase       = (phase: string) => tasks.filter(t => t.phase === phase);

  // ─────────────────────────────────────────────────────────
  // UPLOAD SCREEN
  // ─────────────────────────────────────────────────────────

  if (showUpload || totalTasks === 0) {
    return (
      <div className="max-w-lg mx-auto py-10 space-y-6">
        <div className="text-center">
          <div className="text-5xl mb-3">🛠️</div>
          <h2 className="text-xl font-bold">Developer Workspace</h2>
          <p className="text-xs text-muted-foreground/50 font-mono mb-3">by Manav</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Upload your technical audit. Manav detects your CMS, takes a snapshot of the live page,
            and generates exact code fixes with step-by-step instructions — before touching anything.
          </p>
        </div>

        {/* URL input */}
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Target page URL
          </label>
          <input
            type="url"
            value={targetUrl}
            onChange={e => setTargetUrl(e.target.value)}
            placeholder="https://www.example.com/page"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary/60 transition-colors"
          />
          <p className="text-[11px] text-muted-foreground">
            Manav fetches this URL to detect your CMS and snapshot the current state.
          </p>
        </div>

        {/* File drop zone */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={parsing}
          className="w-full rounded-2xl border-2 border-dashed border-border hover:border-primary/40 bg-card/30 p-10 text-center cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="text-4xl mb-3">{parsing ? '⟳' : '📋'}</div>
          <p className="text-sm font-medium">{parsing ? 'Parsing audit file…' : 'Click to upload audit file'}</p>
          <p className="text-xs text-muted-foreground mt-1">The .md file exported from the SEO Audit tab</p>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.txt,text/plain,text/markdown"
          className="hidden"
          onChange={handleFileSelect}
        />

        {totalTasks > 0 && (
          <button
            type="button"
            onClick={() => setShowUpload(false)}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            ← Back to existing {totalTasks} tasks
          </button>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // MAIN TWO-COLUMN LAYOUT
  // ─────────────────────────────────────────────────────────

  return (
    <>
      {showSafety && selected && (
        <SafetyModal
          task={selected}
          cms={cms}
          onConfirm={() => confirmApplied(selected)}
          onCancel={() => setShowSafety(false)}
        />
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400 mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-3 text-red-400/60 hover:text-red-400 transition-colors">✕</button>
        </div>
      )}

      <div className="flex gap-5" style={{ minHeight: 560 }}>

        {/* ── LEFT: task list ── */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-3">

          {/* Brand + CMS badge */}
          <div className="rounded-xl border border-border bg-card/50 px-3 py-2 flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-primary">Manav</span>
              <span className="text-[10px] text-muted-foreground ml-1.5">Dev Workspace</span>
            </div>
            {cms && (cms.platform === 'unknown' || cms.platform === 'custom') ? (
              <select
                className="text-[10px] bg-transparent border border-amber-500/40 rounded px-1.5 py-0.5 text-amber-400 cursor-pointer"
                defaultValue=""
                onChange={async e => {
                  const platform = e.target.value;
                  if (!platform) return;
                  setCms({ platform, seoPlugin: '', confidence: 80, adminPath: '' });
                  // Save to project so future tasks use it
                  await callApi('update_project_cms', { projectId, cms: platform });
                  // Also update all pending tasks in this project
                  for (const t of tasks.filter(t2 => t2.status === 'pending')) {
                    await callApi('dev_update_task', { taskId: t.id, updates: { cms_platform: platform } });
                  }
                  await loadTasks();
                }}
              >
                <option value="">⚠️ Set CMS</option>
                <option value="hubspot">🟠 HubSpot</option>
                <option value="wordpress">🔵 WordPress</option>
                <option value="webflow">💎 Webflow</option>
                <option value="squarespace">⬛ Squarespace</option>
                <option value="wix">🟣 Wix</option>
                <option value="shopify">🟢 Shopify</option>
                <option value="drupal">💧 Drupal</option>
                <option value="custom">🔧 Custom/Other</option>
              </select>
            ) : cms ? (
              <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setCms({ ...cms, platform: 'unknown' })} title="Click to change CMS">
                <span>{CMS_EMOJI[cms.platform] ?? '🔧'}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{cms.platform}</span>
              </div>
            ) : null}
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{doneTasks}</span>/{totalTasks} done
              {openCritical > 0 && (
                <span className="ml-2 text-red-400 font-medium">{openCritical} critical open</span>
              )}
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={loadTasks}
                disabled={loading}
                className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                ↻
              </button>
              <button
                type="button"
                onClick={() => setShowUpload(true)}
                className="text-xs px-2 py-1 rounded-lg border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                + New
              </button>
            </div>
          </div>

          {/* Progress bar */}
          {totalTasks > 0 && (
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.round((doneTasks / totalTasks) * 100)}%` }}
              />
            </div>
          )}

          {/* Task list by phase */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
            {(['phase_0', 'phase_2', 'phase_3'] as const).map(phase => {
              const phaseTasks = byPhase(phase);
              if (phaseTasks.length === 0) return null;

              const phaseConfig = PHASE_CONFIG[phase];
              const phaseDone = phaseTasks.filter(t => t.status === 'done' || t.status === 'skipped').length;

              return (
                <div key={phase}>
                  <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold mb-1.5 ${phaseConfig.borderClass}`}>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${phaseConfig.dotClass}`} />
                      {phaseConfig.label}
                    </div>
                    <span className="font-mono opacity-60">{phaseDone}/{phaseTasks.length}</span>
                  </div>

                  {phaseTasks.map(task => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelected(task)}
                      className={`w-full text-left p-2.5 rounded-xl border mb-1 transition-all ${
                        selected?.id === task.id
                          ? 'border-primary/60 bg-primary/8'
                          : 'border-border bg-card/40 hover:bg-card/70'
                      } ${task.status === 'done' || task.status === 'skipped' ? 'opacity-40' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm flex-shrink-0">{CATEGORY_ICON[task.category] ?? '🔧'}</span>
                          <span className="text-[12px] font-medium leading-snug line-clamp-2">{task.title}</span>
                        </div>
                        <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded border font-medium ${STATUS_CLASS[task.status]}`}>
                          {STATUS_LABEL[task.status]}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        {task.severity === 'critical' && task.status === 'pending' && (
                          <span className="text-[10px] text-red-400 font-medium">⛔ Fix first</span>
                        )}
                        {task.snapshot_id && (
                          <span className="text-[10px] text-emerald-400/70">🛡️ backed up</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: task detail ── */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {selected == null ? (
            <div className="h-full flex items-center justify-center text-center p-12">
              <div>
                <div className="text-5xl mb-4">👈</div>
                <p className="text-sm font-medium mb-1">Select a task to begin</p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Phase 0 tasks must be completed before anything else will have a ranking effect.
                </p>
              </div>
            </div>
          ) : (
            <TaskDetail
              task={selected}
              cms={cms}
              elapsedSec={elapsedSec}
              onExecute={() => executeTask(selected)}
              onVerify={() => verifyTask(selected)}
              onMarkApplied={() => setShowSafety(true)}
              onSkip={() => setTaskStatus(selected, 'skipped')}
              onReopen={() => setTaskStatus(selected, 'pending')}
              onCancelRunning={async () => {
                if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
                await callApi('dev_update_task', { taskId: selected.id, updates: { status: 'pending' } });
                await reloadTask(selected.id);
              }}
            />
          )}
        </div>

      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// TASK DETAIL PANEL
// ─────────────────────────────────────────────────────────────

type DetailTab = 'instructions' | 'code' | 'rollback' | 'verify' | 'client';

function TaskDetail({
  task,
  cms,
  elapsedSec,
  onExecute,
  onVerify,
  onMarkApplied,
  onSkip,
  onReopen,
  onCancelRunning,
}: {
  task: DevTask;
  cms: CmsInfo | null;
  elapsedSec?: number;
  onExecute: () => void;
  onVerify: () => void;
  onMarkApplied: () => void;
  onSkip: () => void;
  onReopen: () => void;
  onCancelRunning?: () => void;
}) {
  const [activeTab,    setActiveTab]    = useState<DetailTab>('instructions');
  const [snapshot,     setSnapshot]     = useState<{ snapshot: string; captured_at: string } | null>(null);
  const [copiedCode,   setCopiedCode]   = useState(false);
  const [copiedRoll,   setCopiedRoll]   = useState(false);
  const [chatOpen,     setChatOpen]     = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user'|'assistant'; content: string }[]>([]);
  const [chatInput,    setChatInput]    = useState('');
  const [chatLoading,  setChatLoading]  = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [briefOpen,    setBriefOpen]    = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [brief,        setBrief]        = useState<{ subject: string; body: string; summary: string } | null>(null);
  const [briefCopied,  setBriefCopied]  = useState(false);
  // Client thread
  const [thread,       setThread]       = useState<{ role: 'pm'|'client'; content: string; timestamp: string }[]>([]);
  const [clientInput,  setClientInput]  = useState('');
  const [threadSaving, setThreadSaving] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [draftReply,   setDraftReply]   = useState('');
  const [replyCopied,  setReplyCopied]  = useState(false);

  // Reset to instructions tab when a different task is selected
  useEffect(() => {
    setActiveTab('instructions');
    setSnapshot(null);
    setChatOpen(false);
    setChatMessages([]);
    setBriefOpen(false);
    setBrief(null);
    setThread(Array.isArray(task.client_thread) ? task.client_thread : []);
    setDraftReply('');
  }, [task.id]);

  const generateBrief = async () => {
    setBriefLoading(true);
    setBriefOpen(true);
    setBrief(null);
    const result = await callApi<{ subject: string; body: string; summary: string }>('dev_client_brief', {
      taskId: task.id,
      projectId,
    });
    setBriefLoading(false);
    if (result.ok && (result as any).data?.body) {
      setBrief({
        subject: (result as any).data.subject || 'Website Change Approval Required',
        body:    (result as any).data.body    || '',
        summary: (result as any).data.summary || '',
      });
    } else {
      setBrief({ subject: 'Error', body: result.error || 'Could not generate brief. Try again.', summary: '' });
    }
  };

  const addClientMessage = async (role: 'pm'|'client', content: string) => {
    if (!content.trim()) return;
    const newMsg = { role, content: content.trim(), timestamp: new Date().toISOString() };
    const newThread = [...thread, newMsg];
    setThread(newThread);
    if (role === 'client') setClientInput('');
    setThreadSaving(true);
    await callApi('dev_save_thread', { taskId: task.id, thread: newThread });
    setThreadSaving(false);
  };

  const generateReply = async () => {
    setReplyLoading(true);
    const result = await callApi<{ reply: string }>('dev_thread_reply', {
      taskId: task.id, projectId, thread,
    });
    setReplyLoading(false);
    if (result.ok && (result as any).data?.reply) setDraftReply((result as any).data.reply);
  };

  const markApproved = async (approved: boolean) => {
    await callApi('dev_approve_task', { taskId: task.id, approved });
    await reloadTask(task.id);
    // Add a PM note to thread
    await addClientMessage('pm', approved ? '✓ Client approval received and recorded.' : '✗ Client approval withdrawn.');
  };

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    const newMessages: { role: 'user'|'assistant'; content: string }[] = [...chatMessages, { role: 'user', content: msg }];
    setChatMessages(newMessages);
    setChatLoading(true);
    // Scroll to bottom
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    const result = await callApi<{ reply: string }>('dev_chat', {
      message: msg,
      projectId,
      taskContext: {
        title:        task.title,
        task_type:    task.task_type,
        cms_platform: task.cms_platform || '',
        target_url:   task.target_url   || '',
        analysis:     task.analysis     || '',
        fix_code:     task.fix_code     || '',
      },
      // Last 8 messages for conversation continuity
      history: newMessages.slice(-8).slice(0, -1).map(m => ({ role: m.role, content: m.content })),
    });

    const reply = result.ok && result.data?.reply
      ? result.data.reply
      : 'Sorry, I could not get a response. Try again.';

    setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    setChatLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  // Load snapshot when rollback tab is opened
  useEffect(() => {
    if (activeTab === 'rollback' && task.snapshot_id && !snapshot) {
      callApi<{ snapshot: { snapshot: string; captured_at: string } }>('dev_get_snapshot', { taskId: task.id })
        .then(result => {
          if (result.ok && result.data?.snapshot) {
            setSnapshot(result.data.snapshot);
          }
        })
        .catch(() => { /* snapshot loading is non-critical */ });
    }
  }, [activeTab, task.snapshot_id, task.id, snapshot]);

  const copyToClipboard = (text: string, setFlag: (v: boolean) => void) => {
    navigator.clipboard.writeText(text).then(() => {
      setFlag(true);
      setTimeout(() => setFlag(false), 2000);
    });
  };

  const severityColor =
    task.severity === 'critical' ? 'text-red-400' :
    task.severity === 'warning'  ? 'text-amber-400' :
                                   'text-sky-400';

  const hasContent = !!(task.analysis || task.fix_code || task.apply_instructions);

  return (
    <div className="space-y-4">

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl mt-0.5 flex-shrink-0">
            {CATEGORY_ICON[task.category] ?? '🔧'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className={`text-[11px] font-bold uppercase tracking-widest ${severityColor}`}>
                {task.severity}
              </span>
              <span className="text-[11px] text-muted-foreground capitalize">· {task.category}</span>
              {task.cms_platform && (
                <span className="text-[11px] text-muted-foreground">
                  · {CMS_EMOJI[task.cms_platform] ?? '🔧'} {task.cms_platform}
                </span>
              )}
              {task.snapshot_id && (
                <span className="text-[11px] text-emerald-400">· 🛡️ snapshot saved</span>
              )}
            </div>
            <h3 className="text-sm font-semibold leading-snug">{task.title}</h3>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
            )}
          </div>
          <span className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-lg border font-medium ${STATUS_CLASS[task.status]}`}>
            {STATUS_LABEL[task.status]}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {(task.status === 'pending' || task.status === 'failed') && (
          <button
            type="button"
            onClick={onExecute}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary)/0.2)] transition-all"
          >
            ▶ Analyze & Generate Fix
          </button>
        )}

        {task.status === 'running' && (
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm">
              <div className="flex items-center gap-2">
                <span className="animate-spin inline-block">⟳</span>
                <span>Manav is analyzing the live page…</span>
                {elapsedSec !== undefined && elapsedSec > 0 && (
                  <span className="font-mono text-blue-300/70 text-xs">{elapsedSec}s / 28s</span>
                )}
              </div>
              {onCancelRunning && (
                <button
                  type="button"
                  onClick={onCancelRunning}
                  className="text-xs px-2.5 py-1 rounded-lg border border-blue-500/30 text-blue-400/70 hover:text-blue-300 hover:border-blue-400 transition-colors ml-3"
                >
                  Cancel
                </button>
              )}
            </div>
            {/* Progress bar showing elapsed vs timeout */}
            {elapsedSec !== undefined && (
              <div className="h-1 rounded-full bg-blue-500/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-1000"
                  style={{ width: Math.min((elapsedSec / 28) * 100, 100) + '%' }}
                />
              </div>
            )}
            {elapsedSec !== undefined && elapsedSec >= 20 && (
              <p className="text-xs text-amber-400/80 px-1">
                ⚠️ Taking longer than usual. If this doesn't complete in the next few seconds, click Cancel and Retry.
              </p>
            )}
          </div>
        )}

        {task.status === 'fix_ready' && (
          <>
            <button
              type="button"
              onClick={onMarkApplied}
              className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-all"
            >
              ✓ I Applied the Fix
            </button>
            <button
              type="button"
              onClick={onExecute}
              className="px-3 py-2.5 rounded-xl border border-border text-muted-foreground text-sm hover:text-foreground transition-all"
            >
              ↺ Re-generate
            </button>
          </>
        )}

        {task.status === 'applied' && (
          <button
            type="button"
            onClick={onVerify}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-sm font-semibold hover:bg-indigo-500/20 transition-all"
          >
            🔍 Verify on Live Page
          </button>
        )}

        {task.status === 'verifying' && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-sm">
            <span className="animate-spin inline-block">⟳</span>
            Checking live page…
          </div>
        )}

        {task.status === 'done' && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium">
            ✅ Done — verified on live page
          </div>
        )}

        {task.status === 'failed' && (
          <button
            type="button"
            onClick={onExecute}
            className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20"
          >
            ↺ Retry Analysis
          </button>
        )}

        {task.status !== 'done' && task.status !== 'skipped' && task.status !== 'running' && task.status !== 'verifying' && (
          <button
            type="button"
            onClick={onSkip}
            className="px-3 py-2 rounded-xl border border-border text-muted-foreground text-xs hover:text-foreground transition-colors"
          >
            Skip
          </button>
        )}

        {(task.status === 'done' || task.status === 'skipped') && (
          <button
            type="button"
            onClick={onReopen}
            className="px-3 py-2 rounded-xl border border-border text-muted-foreground text-xs hover:text-foreground transition-colors"
          >
            ↺ Reopen
          </button>
        )}
        {/* Ask Manav + Client Brief — right end of action strip */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={generateBrief}
            disabled={briefLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border border-border text-muted-foreground hover:border-amber-500/40 hover:text-amber-400 hover:bg-amber-500/5 disabled:opacity-40"
          >
            <span>📋</span>
            <span>{briefLoading ? 'Generating…' : 'Client Brief'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setChatOpen(v => !v);
              if (!chatOpen && chatMessages.length === 0) {
                setChatMessages([{
                  role: 'assistant',
                  content: 'Hi! I\'m here to help you apply this fix. What questions do you have — about what to click, what something means, or whether it\'s safe to do?'
                }]);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
              chatOpen
                ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                : 'border-border text-muted-foreground hover:border-violet-500/30 hover:text-violet-400 hover:bg-violet-500/5'
            }`}
          >
            <span>💬</span>
            <span>{chatOpen ? 'Close' : 'Ask Manav'}</span>
          </button>
        </div>
      </div>

      {/* Verification result */}
      {task.verification_result && (
        <div className={`rounded-xl border p-3.5 ${
          task.verification_result === 'pass'    ? 'bg-emerald-500/5 border-emerald-500/30' :
          task.verification_result === 'partial' ? 'bg-amber-500/5 border-amber-500/30' :
                                                   'bg-red-500/5 border-red-500/30'
        }`}>
          <div className={`font-semibold text-sm mb-1 ${
            task.verification_result === 'pass'    ? 'text-emerald-400' :
            task.verification_result === 'partial' ? 'text-amber-400' :
                                                     'text-red-400'
          }`}>
            {task.verification_result === 'pass'    ? '✅ Verification PASSED' :
             task.verification_result === 'partial' ? '⚠️ Partially verified — check details below' :
                                                      '❌ Fix not detected yet — confirm changes are published'}
          </div>
          {task.verification_evidence?.message && (
            <p className="text-xs text-muted-foreground">{String(task.verification_evidence.message)}</p>
          )}
        </div>
      )}

      {/* Client Brief Modal */}
      {briefOpen && (
        <div className="rounded-2xl border border-amber-500/20 bg-card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/15 bg-amber-500/5">
            <div className="flex items-center gap-2.5">
              <span className="text-base">📋</span>
              <div>
                <div className="text-sm font-semibold">Client Approval Request</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Ready to send — copy and paste into email</div>
              </div>
            </div>
            <button type="button" onClick={() => setBriefOpen(false)}
              className="w-7 h-7 rounded-lg hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground text-sm"
            >✕</button>
          </div>

          {briefLoading ? (
            <div className="p-8 text-center">
              <div className="animate-pulse text-sm text-muted-foreground">Drafting client brief…</div>
              <div className="text-xs text-muted-foreground/60 mt-1">Writing a professional explanation for your client</div>
            </div>
          ) : brief ? (
            <div className="p-4 space-y-4">
              {/* Summary pill */}
              {brief.summary && (
                <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 px-3.5 py-2.5">
                  <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">TL;DR — </span>
                  <span className="text-xs text-muted-foreground">{brief.summary}</span>
                </div>
              )}

              {/* Subject line */}
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Email Subject</div>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5">
                  <span className="text-sm flex-1 font-medium">{brief.subject}</span>
                  <button type="button"
                    onClick={() => navigator.clipboard.writeText(brief.subject)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-border/80"
                  >Copy</button>
                </div>
              </div>

              {/* Email body */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Email Body</div>
                  <button type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(brief.body);
                      setBriefCopied(true);
                      setTimeout(() => setBriefCopied(false), 2500);
                    }}
                    className={`text-xs px-3 py-1 rounded-lg border font-medium transition-all ${
                      briefCopied
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
                    }`}
                  >{briefCopied ? '✓ Copied!' : 'Copy Email'}</button>
                </div>
                <div className="rounded-xl border border-border bg-background/60 p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 max-h-72 overflow-y-auto">
                  {brief.body}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`Subject: ${brief.subject}\n\n${brief.body}`);
                    setBriefCopied(true);
                    setTimeout(() => setBriefCopied(false), 2500);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-[0_0_16px_hsl(var(--primary)/0.2)]"
                >
                  {briefCopied ? '✓ Copied to clipboard' : 'Copy full email (subject + body)'}
                </button>
                <button type="button"
                  onClick={generateBrief}
                  className="px-4 py-2.5 rounded-xl border border-border text-muted-foreground text-sm hover:text-foreground transition-all"
                  title="Generate a new version"
                >↺ Regenerate</button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Chat panel — shown instead of (or alongside) tab content when open */}
      {chatOpen && (
        <div className="rounded-2xl border border-violet-500/20 bg-card overflow-hidden flex flex-col">
          {/* Chat messages */}
          <div className="overflow-y-auto p-4 space-y-3" style={{ minHeight: 200, maxHeight: 300 }}>
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-xs font-bold text-violet-300">
                    M
                  </div>
                )}
                <div className={`max-w-[82%] px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm'
                    : 'bg-muted/40 border border-border text-foreground rounded-2xl rounded-tl-sm'
                }`}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted/60 border border-border flex items-center justify-center text-[10px] text-muted-foreground font-medium">
                    You
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-xs font-bold text-violet-300">M</div>
                <div className="px-3.5 py-2.5 rounded-2xl bg-muted/40 border border-border text-muted-foreground text-sm">
                  <span className="animate-pulse">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggested questions */}
          {chatMessages.filter(m => m.role === 'user').length === 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-1.5 border-t border-border pt-2.5">
              {[
                'Where exactly do I click?',
                'Will this break my site?',
                task.cms_platform && task.cms_platform !== 'unknown' ? 'How do I do this in ' + task.cms_platform + '?' : 'What if I make a mistake?',
                'How long will this take?',
              ].map(q => (
                <button key={q} type="button"
                  onClick={() => { setChatInput(q); }}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-violet-500/25 text-violet-400/80 hover:bg-violet-500/10 hover:text-violet-300 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2 p-3 border-t border-border bg-muted/20">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              placeholder="Ask anything about this fix…"
              disabled={chatLoading}
              autoFocus
              className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-500/40 transition-colors disabled:opacity-50 placeholder:text-muted-foreground/50"
            />
            <button type="button" onClick={sendChat}
              disabled={chatLoading || !chatInput.trim()}
              className="px-3 py-2 rounded-xl bg-violet-500 text-white text-sm font-semibold hover:bg-violet-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {/* Content tabs */}
      {hasContent && (
        <>
          <div className="flex gap-0.5 border-b border-border">
            {(['instructions', 'code', 'rollback', 'verify', 'client'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'instructions' ? '📋 How to Apply' :
                 tab === 'code'         ? '⚡ Fix Code' :
                 tab === 'rollback'     ? `🔄 Rollback${task.snapshot_id ? ' 🛡️' : ''}` :
                                         '🔍 Verify'}
              </button>
            ))}
          </div>

          {/* Instructions tab */}
          {activeTab === 'instructions' && (
            <div className="space-y-4">
              {task.analysis && (
                <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    What Manav found on your live page
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.analysis}</p>
                </div>
              )}
              {task.apply_instructions && (
                <FormattedInstructions content={task.apply_instructions} />
              )}
            </div>
          )}

          {/* Code tab */}
          {activeTab === 'code' && (
            task.fix_code ? (
              <div className="rounded-xl border border-amber-500/20 bg-[#110f00] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold text-xs tracking-widest">EXACT FIX CODE</span>
                    {task.fix_language && (
                      <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400/60 border border-amber-500/20 px-1.5 py-0.5 rounded">
                        {task.fix_language}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(task.fix_code!, setCopiedCode)}
                    className={`text-xs px-3 py-1 rounded-lg border transition-all font-medium ${
                      copiedCode
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
                    }`}
                  >
                    {copiedCode ? '✓ Copied!' : 'Copy All'}
                  </button>
                </div>
                <pre className="p-4 text-xs font-mono text-amber-100/80 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed max-h-96">
                  {task.fix_code}
                </pre>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground rounded-xl border border-dashed border-border">
                No code block for this task — follow the How to Apply tab.
              </div>
            )
          )}

          {/* Rollback tab */}
          {activeTab === 'rollback' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex gap-3 items-start">
                <span className="text-2xl flex-shrink-0">🛡️</span>
                <div>
                  <p className="text-xs font-semibold text-emerald-400 mb-0.5">
                    Manav backed up this page before generating the fix
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {task.snapshot_id
                      ? `The relevant HTML was captured before any fix was generated.${snapshot ? ' Captured: ' + new Date(snapshot.captured_at).toLocaleString() : ''} If anything goes wrong, use the instructions below to restore the original state.`
                      : 'Click "Analyze & Generate Fix" first — Manav will snapshot the live page before generating anything.'}
                  </p>
                </div>
              </div>

              {task.rollback_instructions && (
                <FormattedInstructions content={task.rollback_instructions} />
              )}

              {task.rollback_code && (
                <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Original Code (before fix)
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(task.rollback_code!, setCopiedRoll)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                        copiedRoll
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {copiedRoll ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="p-4 text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-words leading-relaxed max-h-64">
                    {task.rollback_code}
                  </pre>
                </div>
              )}

              {snapshot?.snapshot && (
                <div className="rounded-xl border border-border bg-card/20 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Live Snapshot — Before Fix
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(snapshot.captured_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="p-4 text-[11px] font-mono text-muted-foreground/70 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed max-h-60">
                    {snapshot.snapshot.slice(0, 2000)}
                    {snapshot.snapshot.length > 2000 ? '\n…(truncated for display — full snapshot stored in database)' : ''}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Verify tab */}
          {activeTab === 'verify' && (
            <div className="space-y-4">
              {task.verification_method && (
                <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    How to verify manually
                  </p>
                  <p className="text-sm leading-relaxed">{task.verification_method}</p>
                </div>
              )}
              {task.status === 'fix_ready' && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-300 leading-relaxed">
                  ⚠️ Mark the fix as applied first (button above), then use "Verify on Live Page" for automatic checking.
                </div>
              )}
            </div>
          )}

          {activeTab === 'client' && (
            <div className="space-y-4 p-1">

              {/* Approval status banner */}
              {task.client_approved ? (
                <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
                  <span className="text-emerald-400 text-lg">✓</span>
                  <div>
                    <div className="text-sm font-semibold text-emerald-400">Client approved</div>
                    {task.client_approved_at && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(task.client_approved_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => markApproved(false)}
                    className="ml-auto text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1">
                    Withdraw
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => markApproved(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/25 transition-all">
                    ✓ Mark as Approved
                  </button>
                  <span className="text-xs text-muted-foreground">Did client reply YES? Mark it here.</span>
                </div>
              )}

              {/* Thread timeline */}
              {thread.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Thread</div>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {thread.map((msg, i) => (
                      <div key={i} className={`flex gap-2.5 ${msg.role === 'pm' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'client' && (
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[9px] font-bold text-amber-400 mt-0.5">C</div>
                        )}
                        <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                          msg.role === 'pm'
                            ? 'bg-primary/15 border border-primary/20 text-foreground rounded-tr-sm'
                            : 'bg-amber-500/8 border border-amber-500/20 text-foreground rounded-tl-sm'
                        }`}>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {msg.role === 'pm' ? 'PM' : 'Client'}
                            </span>
                            <span className="text-[9px] text-muted-foreground/60">
                              {new Date(msg.timestamp).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                            </span>
                          </div>
                          {msg.content}
                        </div>
                        {msg.role === 'pm' && (
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[9px] font-bold text-primary mt-0.5">M</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Paste client message */}
              <div className="space-y-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Paste client reply
                </div>
                <textarea
                  value={clientInput}
                  onChange={e => setClientInput(e.target.value)}
                  placeholder="Paste what the client said — approval, concern, question, or modification request…"
                  rows={4}
                  className="w-full px-3.5 py-3 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:border-amber-500/40 transition-colors placeholder:text-muted-foreground/40 leading-relaxed"
                />
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => addClientMessage('client', clientInput)}
                    disabled={!clientInput.trim() || threadSaving}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-500/25 transition-all disabled:opacity-40"
                  >
                    {threadSaving ? 'Saving…' : '+ Add to thread'}
                  </button>
                </div>
              </div>

              {/* Actions when thread has client messages */}
              {thread.some(m => m.role === 'client') && (
                <div className="space-y-3 pt-1 border-t border-border">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Next steps
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button"
                      onClick={onExecute}
                      className="flex flex-col items-start gap-0.5 px-3.5 py-3 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-all text-left"
                    >
                      <span className="text-xs font-semibold text-primary">↺ Regenerate fix</span>
                      <span className="text-[10px] text-muted-foreground">Using client feedback as context</span>
                    </button>
                    <button type="button"
                      onClick={generateReply}
                      disabled={replyLoading}
                      className="flex flex-col items-start gap-0.5 px-3.5 py-3 rounded-xl bg-muted/40 border border-border hover:bg-muted/60 transition-all text-left disabled:opacity-40"
                    >
                      <span className="text-xs font-semibold">✉ Draft PM reply</span>
                      <span className="text-[10px] text-muted-foreground">{replyLoading ? 'Writing…' : 'Respond to their concern'}</span>
                    </button>
                  </div>

                  {/* Draft reply */}
                  {draftReply && (
                    <div className="rounded-xl border border-border bg-background/60 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Draft reply</span>
                        <button type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(draftReply);
                            setReplyCopied(true);
                            setTimeout(() => setReplyCopied(false), 2000);
                          }}
                          className={`text-[10px] px-2.5 py-1 rounded border font-medium transition-all ${
                            replyCopied ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >{replyCopied ? '✓ Copied' : 'Copy'}</button>
                      </div>
                      <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{draftReply}</p>
                      <button type="button"
                        onClick={() => addClientMessage('pm', draftReply)}
                        className="text-[10px] text-primary hover:underline"
                      >+ Add to thread as PM message</button>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </>
      )}

      {/* Empty pending state */}
      {!hasContent && task.status === 'pending' && (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <div className="text-5xl mb-4">🔬</div>
          <p className="text-sm font-semibold mb-2">Ready to execute</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Click "Analyze & Generate Fix" above. Manav will fetch{' '}
            <span className="font-medium text-foreground">{task.target_url ?? 'the live page'}</span>,
            take a snapshot, identify the exact issue, and generate step-by-step instructions
            for your specific CMS.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FORMATTED INSTRUCTIONS RENDERER
// Converts the CMS-specific markdown instructions into clean UI.
// Each ## section becomes a card. Numbered steps get circle indicators.
// ─────────────────────────────────────────────────────────────

function FormattedInstructions({ content }: { content: string }) {
  // Split on ## section headers
  const rawSections = content.split(/\n(?=## )/);

  return (
    <div className="space-y-4">
      {rawSections.map((section, index) => {
        const lines = section.split('\n');
        const headerLine = lines[0].startsWith('## ') ? lines[0] : null;
        const heading = headerLine ? headerLine.replace(/^##\s+/, '') : null;
        const body = (heading ? lines.slice(1) : lines).join('\n').trim();

        if (!body && !heading) return null;

        return (
          <div key={index} className="rounded-xl border border-border bg-card/30 overflow-hidden">
            {heading && (
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider">{heading}</h4>
              </div>
            )}
            <div className="p-4">
              <RenderLines lines={body.split('\n')} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RenderLines({ lines }: { lines: string[] }) {
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === '---') continue;

    // Blockquote
    if (line.startsWith('>')) {
      const text = line.replace(/^>\s*/, '');
      elements.push(
        <div key={i} className="rounded-lg bg-primary/5 border border-primary/15 px-3.5 py-2.5 text-xs text-muted-foreground leading-relaxed my-1">
          <InlineFormatted text={text} />
        </div>
      );
      continue;
    }

    // Warning line
    if (line.startsWith('⚠️')) {
      elements.push(
        <div key={i} className="rounded-lg bg-amber-500/8 border border-amber-500/20 px-3.5 py-2.5 text-xs text-amber-300 leading-relaxed my-1">
          {line}
        </div>
      );
      continue;
    }

    // Numbered step
    const stepMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (stepMatch) {
      elements.push(
        <div key={i} className="flex gap-3 items-start my-1.5">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/30 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">
            {stepMatch[1]}
          </div>
          <p className="flex-1 text-sm leading-relaxed pt-0.5">
            <InlineFormatted text={stepMatch[2]} />
          </p>
        </div>
      );
      continue;
    }

    // Bullet point
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const text = line.replace(/^[-*]\s+/, '');
      elements.push(
        <div key={i} className="flex gap-2 items-start pl-9 my-1">
          <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-2" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <InlineFormatted text={text} />
          </p>
        </div>
      );
      continue;
    }

    // Bold-only line (section sub-header)
    if (/^\*\*[^*]+\*\*$/.test(line)) {
      elements.push(
        <p key={i} className="text-xs font-bold mt-3 mb-1">{line.replace(/\*\*/g, '')}</p>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-sm text-muted-foreground leading-relaxed my-1">
        <InlineFormatted text={line} />
      </p>
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
}

function InlineFormatted({ text }: { text: string }) {
  // Handle **bold** and `code` inline — split on these patterns
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="text-[11px] font-mono bg-muted/60 px-1 py-0.5 rounded text-amber-300/90">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
