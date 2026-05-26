/* ════════════════════════════════════════════════════════════════
   src/components/pm/DevPanel.tsx — Developer Workspace
   Non-technical, CMS-aware, step-by-step developer panel.
   Claude IS the developer. Upload audit → get exact steps → apply → verify.
════════════════════════════════════════════════════════════════ */

import { useState, useRef, useCallback, useEffect } from 'react';

/* ── Types ─────────────────────────────────────────────────────── */
interface DevTask {
  id: string;
  phase: string; category: string; task_type: string;
  title: string; description?: string;
  finding_ref?: string; finding_title?: string;
  severity: 'critical' | 'warning' | 'info';
  target_url?: string; priority: number;
  status: 'pending'|'running'|'fix_ready'|'applied'|'verifying'|'done'|'skipped'|'failed';
  analysis?: string; fix_code?: string; fix_language?: string;
  apply_instructions?: string; verification_method?: string;
  verification_result?: 'pass'|'fail'|'partial';
  verification_evidence?: any;
  cms_platform?: string;
  llm_calls_used?: number;
}

interface CmsInfo { platform: string; seoPlugin: string; confidence: number; signals: string[]; adminPath: string; notes?: string; }

/* ── API ────────────────────────────────────────────────────────── */
async function te(action: string, body: any) {
  const r = await fetch('/api/task-engine', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action,...body}) });
  return r.json();
}

/* ── Static maps ────────────────────────────────────────────────── */
const PHASE_META: Record<string,{label:string;accent:string;dot:string}> = {
  phase_0:{ label:'Phase 0 — Fix First (Critical)', accent:'border-red-500/40 bg-red-500/5', dot:'bg-red-500' },
  phase_2:{ label:'Phase 2 — Content & On-page',    accent:'border-amber-500/40 bg-amber-500/5', dot:'bg-amber-500' },
  phase_3:{ label:'Phase 3 — Parallel (Any Time)',  accent:'border-blue-500/40 bg-blue-500/5', dot:'bg-blue-400' },
};
const CAT_ICON: Record<string,string> = { performance:'⚡', schema:'📋', on_page:'📝', content:'✍️', indexing:'🔍', analytics:'📊' };
const STATUS_PILL: Record<string,string> = {
  pending:  'bg-muted/60 text-muted-foreground border-transparent',
  running:  'bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse',
  fix_ready:'bg-amber-500/15 text-amber-300 border-amber-500/30',
  applied:  'bg-purple-500/15 text-purple-300 border-purple-500/30',
  verifying:'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 animate-pulse',
  done:     'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  skipped:  'bg-muted/20 text-muted-foreground/40 border-transparent',
  failed:   'bg-red-500/15 text-red-400 border-red-500/30',
};
const STATUS_LABEL: Record<string,string> = {
  pending:'Pending', running:'Analyzing…', fix_ready:'Fix Ready', applied:'Applied',
  verifying:'Verifying…', done:'Done ✓', skipped:'Skipped', failed:'Failed',
};
const CMS_LOGOS: Record<string,string> = {
  wordpress:'🔵', webflow:'💎', squarespace:'⬛', wix:'🟣', shopify:'🟢',
  hubspot:'🟠', drupal:'💧', ghost:'👻', framer:'⚡', custom:'🔧', unknown:'❓',
};

/* ════════════════════════════════════════════════════════════════
   MAIN PANEL
════════════════════════════════════════════════════════════════ */
export default function DevPanel({ projectId }: { projectId: string }) {
  const [tasks, setTasks]         = useState<DevTask[]>([]);
  const [cms, setCms]             = useState<CmsInfo | null>(null);
  const [selected, setSelected]   = useState<DevTask | null>(null);
  const [loading, setLoading]     = useState(false);
  const [parsing, setParsing]     = useState(false);
  const [error, setError]         = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadTasks = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await te('dev_get_tasks', { projectId });
      if (r.tasks) {
        setTasks(r.tasks);
        // infer CMS from first task that has it
        const cmsTask = r.tasks.find((t: DevTask) => t.cms_platform);
        if (cmsTask && !cms) setCms({ platform: cmsTask.cms_platform, seoPlugin:'', confidence:0, signals:[], adminPath:'' });
      }
    } finally { setLoading(false); }
  }, [projectId, cms]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const refreshSelected = useCallback(async (id: string) => {
    const r = await te('dev_get_tasks', { projectId });
    if (r.tasks) {
      setTasks(r.tasks);
      setSelected(r.tasks.find((t: DevTask) => t.id === id) || null);
    }
  }, [projectId]);

  /* Parse uploaded audit markdown */
  const parseAudit = useCallback(async (md: string) => {
    setParsing(true); setError('');
    try {
      const findings: any[] = [];
      const blocks = md.split(/\n<a id="finding-\d+-\d+"><\/a>\n/);
      for (const block of blocks) {
        const titleMatch = block.match(/### §\d+\.\d+ — [🎯🔴🟡🟢ℹ️ ]+([^\n]+)/);
        if (!titleMatch) continue;
        const title = titleMatch[1].trim();
        const sev = /🔴/.test(block) ? 'red' : /🟡/.test(block) ? 'amber' : 'green';
        const kindMatch = block.match(/\*\*Audit kind:\*\* `([^`]+)`/);
        const detailMatch = block.match(/\*\*Detail:\*\*\n\n([\s\S]+?)(?:\n\n\*\*Rec|$)/);
        let evidence: any = {};
        const evMatch = block.match(/```json\n([\s\S]+?)\n```/);
        if (evMatch) { try { evidence = JSON.parse(evMatch[1]); } catch {} }
        findings.push({ audit_kind: kindMatch?.[1] || 'on_page', severity: sev, finding_title: title, finding_detail: detailMatch?.[1]?.trim().slice(0,600) || '', evidence });
      }

      const runIdMatch = md.match(/\*\*Audit run id:\*\* `([^`]+)`/);
      const urlMatch   = md.match(/\*\*Audited URL:\*\* \[([^\]]+)\]/);
      const runId = runIdMatch?.[1] || `manual-${Date.now()}`;
      const url   = urlMatch?.[1] || targetUrl;

      if (!findings.length) { setError('No findings detected. Make sure you uploaded the full audit .md file.'); return; }

      const r = await te('dev_parse_audit_tasks', { projectId, auditRunId: runId, targetUrl: url || targetUrl, findings });
      if (r.error) { setError(r.error); return; }

      /* Detect CMS */
      const cmsR = await te('dev_detect_cms', { projectId, url: url || targetUrl });
      if (cmsR.cms) setCms(cmsR.cms);

      setShowUpload(false);
      await loadTasks();
    } catch (e: any) { setError(e?.message || 'Parse failed'); }
    finally { setParsing(false); }
  }, [projectId, targetUrl, loadTasks]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => parseAudit(ev.target?.result as string);
    reader.readAsText(f);
  };

  const execute = async (task: DevTask) => {
    setSelected({ ...task, status: 'running' });
    const r = await te('dev_execute_task', { taskId: task.id });
    if (r.error) { setError(r.error); return; }
    await refreshSelected(task.id);
  };

  const verify = async (task: DevTask) => {
    setSelected({ ...task, status: 'verifying' });
    const r = await te('dev_verify_task', { taskId: task.id });
    if (r.error) { setError(r.error); return; }
    await refreshSelected(task.id);
  };

  const updateStatus = async (task: DevTask, status: DevTask['status']) => {
    await te('dev_update_task', { taskId: task.id, updates: { status } });
    await refreshSelected(task.id);
  };

  /* Stats */
  const total  = tasks.length;
  const done   = tasks.filter(t => t.status === 'done').length;
  const critical = tasks.filter(t => t.severity === 'critical' && !['done','skipped'].includes(t.status)).length;
  const byPhase = (ph: string) => tasks.filter(t => t.phase === ph);

  /* ── Upload screen ─────────────────────────────────────────── */
  if (showUpload || tasks.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-8 space-y-5">
        <div className="text-center">
          <div className="text-5xl mb-3">🛠️</div>
          <h2 className="text-xl font-bold mb-1">Developer Workspace</h2>
          <p className="text-sm text-muted-foreground">
            Upload your audit report. Claude detects your CMS, generates exact code fixes, and guides you step-by-step through every change — no developer required.
          </p>
        </div>

        {/* URL input */}
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target page URL</label>
          <input
            value={targetUrl}
            onChange={e => setTargetUrl(e.target.value)}
            placeholder="https://www.alphasoftware.com/mobile-forms"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary/60 transition-colors"
          />
          <p className="text-[11px] text-muted-foreground">Claude will fetch this page to detect your CMS and read the live HTML before generating fixes.</p>
        </div>

        {/* File drop */}
        <div
          className="rounded-2xl border-2 border-dashed border-border hover:border-primary/40 bg-card/30 p-8 text-center cursor-pointer transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <div className="text-3xl mb-3">{parsing ? '⟳' : '📋'}</div>
          <p className="text-sm font-medium mb-1">{parsing ? 'Parsing audit…' : 'Click to upload audit file'}</p>
          <p className="text-xs text-muted-foreground">Accepts the audit .md file exported from the SEO Audit tab</p>
          <input ref={fileRef} type="file" accept=".md,.txt" className="hidden" onChange={handleFile} />
        </div>

        {tasks.length > 0 && (
          <button onClick={() => setShowUpload(false)} className="w-full py-2 text-xs text-muted-foreground hover:text-foreground underline">
            ← Back to existing tasks ({tasks.length})
          </button>
        )}

        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">{error}</div>}
      </div>
    );
  }

  /* ── Main layout ────────────────────────────────────────────── */
  return (
    <div className="flex gap-5" style={{ minHeight: 600 }}>

      {/* LEFT: task list */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-3">

        {/* CMS badge */}
        {cms && (
          <div className="rounded-xl border border-border bg-card/50 px-3 py-2.5 flex items-center gap-2">
            <span className="text-xl">{CMS_LOGOS[cms.platform] || '🔧'}</span>
            <div className="min-w-0">
              <div className="text-xs font-semibold capitalize">{cms.platform === 'unknown' ? 'CMS Unknown' : cms.platform}{cms.seoPlugin && cms.seoPlugin !== 'unknown' && cms.seoPlugin !== 'none' ? ` + ${cms.seoPlugin}` : ''}</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {cms.confidence > 70 ? `Detected (${cms.confidence}% confident)` : 'Unknown — instructions show all options'}
              </div>
            </div>
            {cms.adminPath && (
              <a href={cms.adminPath.startsWith('http') ? cms.adminPath : '#'} target="_blank" rel="noopener" className="ml-auto text-[10px] text-primary hover:underline flex-shrink-0">Admin →</a>
            )}
          </div>
        )}

        {/* Stats bar */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{done}</span>/{total} done
            {critical > 0 && <span className="ml-2 text-red-400 font-medium">{critical} critical</span>}
          </div>
          <div className="flex gap-1.5">
            <button onClick={loadTasks} className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">↻</button>
            <button onClick={() => setShowUpload(true)} className="text-xs px-2 py-1 rounded-lg border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 transition-colors">+ New</button>
          </div>
        </div>

        {/* Progress */}
        {total > 0 && (
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width:`${(done/total)*100}%` }} />
          </div>
        )}

        {/* Tasks by phase */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
          {(['phase_0','phase_2','phase_3'] as const).map(ph => {
            const pt = byPhase(ph);
            if (!pt.length) return null;
            const meta = PHASE_META[ph];
            const phDone = pt.filter(t => ['done','skipped'].includes(t.status)).length;
            return (
              <div key={ph}>
                <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold mb-1.5 ${meta.accent}`}>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </div>
                  <span className="font-mono opacity-60">{phDone}/{pt.length}</span>
                </div>
                {pt.map(task => (
                  <button key={task.id} onClick={() => setSelected(task)}
                    className={`w-full text-left p-2.5 rounded-xl border mb-1 transition-all ${
                      selected?.id === task.id ? 'border-primary/60 bg-primary/8 shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]' : 'border-border bg-card/40 hover:bg-card/70'
                    } ${['done','skipped'].includes(task.status) ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm flex-shrink-0">{CAT_ICON[task.category]||'🔧'}</span>
                        <span className="text-[12px] font-medium leading-snug line-clamp-2">{task.title}</span>
                      </div>
                      <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded border font-medium ${STATUS_PILL[task.status]}`}>
                        {STATUS_LABEL[task.status]}
                      </span>
                    </div>
                    {task.severity === 'critical' && task.status === 'pending' && (
                      <div className="mt-1 text-[10px] text-red-400 font-medium">⛔ Do this first</div>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: task detail */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-center p-12">
            <div>
              <div className="text-5xl mb-4">👈</div>
              <p className="text-sm font-medium mb-1">Select a task to begin</p>
              <p className="text-xs text-muted-foreground">Start with Phase 0 tasks — they must be completed before anything else will make a difference.</p>
            </div>
          </div>
        ) : (
          <TaskDetail
            task={selected}
            cms={cms}
            onExecute={() => execute(selected)}
            onVerify={() => verify(selected)}
            onMarkApplied={() => updateStatus(selected, 'applied')}
            onSkip={() => updateStatus(selected, 'skipped')}
            onReopen={() => updateStatus(selected, 'pending')}
          />
        )}
      </div>

    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TASK DETAIL
════════════════════════════════════════════════════════════════ */
function TaskDetail({ task, cms, onExecute, onVerify, onMarkApplied, onSkip, onReopen }: {
  task: DevTask; cms: CmsInfo | null;
  onExecute:()=>void; onVerify:()=>void; onMarkApplied:()=>void; onSkip:()=>void; onReopen:()=>void;
}) {
  const [copiedCode, setCopiedCode]   = useState(false);
  const [activeTab, setActiveTab]     = useState<'instructions'|'code'|'verify'>('instructions');

  const copy = (text: string, setCopied: (v:boolean)=>void) => {
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const sevColor = task.severity === 'critical' ? 'text-red-400' : task.severity === 'warning' ? 'text-amber-400' : 'text-sky-400';

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl mt-0.5 flex-shrink-0">{CAT_ICON[task.category]||'🔧'}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className={`text-[11px] font-bold uppercase tracking-widest ${sevColor}`}>{task.severity}</span>
              <span className="text-[11px] text-muted-foreground capitalize">· {task.category}</span>
              {task.cms_platform && <span className="text-[11px] text-muted-foreground">· {CMS_LOGOS[task.cms_platform]||'🔧'} {task.cms_platform}</span>}
            </div>
            <h3 className="text-sm font-semibold leading-snug">{task.title}</h3>
            {task.description && <p className="text-xs text-muted-foreground mt-1">{task.description}</p>}
          </div>
          <span className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-lg border font-medium ${STATUS_PILL[task.status]}`}>
            {STATUS_LABEL[task.status]}
          </span>
        </div>
      </div>

      {/* Action strip */}
      <div className="flex gap-2 flex-wrap">
        {task.status === 'pending' && (
          <button onClick={onExecute} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary)/0.25)] transition-all">
            ▶ Analyze & Generate Fix
          </button>
        )}
        {task.status === 'running' && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm">
            <span className="animate-spin inline-block">⟳</span> Claude is fetching live page and generating fix…
          </div>
        )}
        {task.status === 'fix_ready' && (
          <>
            <button onClick={onMarkApplied} className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-all">
              ✓ I Applied the Fix
            </button>
            <button onClick={onExecute} className="px-3 py-2.5 rounded-xl border border-border text-muted-foreground text-sm hover:text-foreground transition-all">
              ↺ Re-generate
            </button>
          </>
        )}
        {task.status === 'applied' && (
          <button onClick={onVerify} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-sm font-semibold hover:bg-indigo-500/20 transition-all">
            🔍 Verify on Live Page
          </button>
        )}
        {task.status === 'verifying' && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-sm">
            <span className="animate-spin inline-block">⟳</span> Checking live page…
          </div>
        )}
        {task.status === 'done' && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium">
            ✅ Done — verified on live page
          </div>
        )}
        {task.status === 'failed' && (
          <button onClick={onExecute} className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20">
            ↺ Retry Analysis
          </button>
        )}
        {!['done','skipped','running','verifying'].includes(task.status) && (
          <button onClick={onSkip} className="px-3 py-2 rounded-xl border border-border text-muted-foreground text-xs hover:text-foreground transition-colors">Skip</button>
        )}
        {['done','skipped'].includes(task.status) && (
          <button onClick={onReopen} className="px-3 py-2 rounded-xl border border-border text-muted-foreground text-xs hover:text-foreground transition-colors">↺ Reopen</button>
        )}
      </div>

      {/* Verification result banner */}
      {task.verification_result && (
        <div className={`rounded-xl border p-3.5 ${
          task.verification_result === 'pass' ? 'bg-emerald-500/5 border-emerald-500/30' :
          task.verification_result === 'partial' ? 'bg-amber-500/5 border-amber-500/30' :
          'bg-red-500/5 border-red-500/30'}`}
        >
          <div className={`font-semibold text-sm mb-1 ${task.verification_result === 'pass' ? 'text-emerald-400' : task.verification_result === 'partial' ? 'text-amber-400' : 'text-red-400'}`}>
            {task.verification_result === 'pass' ? '✅ Verification PASSED' :
             task.verification_result === 'partial' ? '⚠️ Partially verified — see details' :
             '❌ Not detected yet — check if changes are published'}
          </div>
          {task.verification_evidence?.message && (
            <p className="text-xs text-muted-foreground">{task.verification_evidence.message}</p>
          )}
        </div>
      )}

      {/* Tabs — only show when content is ready */}
      {(task.analysis || task.fix_code || task.apply_instructions) && (
        <>
          <div className="flex gap-1 border-b border-border">
            {(['instructions','code','verify'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${activeTab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                {t === 'instructions' ? '📋 How to Apply' : t === 'code' ? '⚡ Fix Code' : '🔍 Verify'}
              </button>
            ))}
          </div>

          {/* Instructions tab */}
          {activeTab === 'instructions' && (
            <div className="space-y-4">
              {task.analysis && (
                <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">What Claude found on your live page</div>
                  <p className="text-sm leading-relaxed">{task.analysis}</p>
                </div>
              )}
              {task.apply_instructions && (
                <MarkdownInstructions content={task.apply_instructions} />
              )}
            </div>
          )}

          {/* Code tab */}
          {activeTab === 'code' && task.fix_code && (
            <div className="rounded-xl border border-amber-500/20 bg-[#1a1500] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-500/20">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-bold text-xs tracking-wider">EXACT FIX CODE</span>
                  {task.fix_language && (
                    <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400/70 border border-amber-500/20 px-1.5 py-0.5 rounded">{task.fix_language}</span>
                  )}
                </div>
                <button onClick={() => copy(task.fix_code!, setCopiedCode)}
                  className={`text-xs px-3 py-1 rounded-lg border transition-all font-medium ${copiedCode ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'}`}
                >
                  {copiedCode ? '✓ Copied!' : 'Copy All'}
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-amber-100/80 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed" style={{ maxHeight: 400 }}>
                {task.fix_code}
              </pre>
            </div>
          )}
          {activeTab === 'code' && !task.fix_code && (
            <div className="p-6 text-center text-sm text-muted-foreground rounded-xl border border-dashed border-border">
              No code generated for this task — follow the instructions tab.
            </div>
          )}

          {/* Verify tab */}
          {activeTab === 'verify' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">How to verify manually</div>
                <p className="text-sm leading-relaxed">{task.verification_method || 'Visit the live page and confirm the change is visible.'}</p>
              </div>
              {task.status === 'fix_ready' && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
                  ⚠️ Mark the fix as applied first (button above) — then use "Verify on Live Page" for auto-checking.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!task.analysis && !task.fix_code && task.status === 'pending' && (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <div className="text-5xl mb-4">🔬</div>
          <p className="text-sm font-semibold mb-2">Ready to execute</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Click "Analyze & Generate Fix" above. Claude will fetch <strong>{task.target_url || 'the live page'}</strong>, identify the exact issue in the HTML, and generate step-by-step instructions for your CMS.
          </p>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MARKDOWN INSTRUCTIONS RENDERER
   Turns the CMS instructions markdown into clean readable HTML.
════════════════════════════════════════════════════════════════ */
function MarkdownInstructions({ content }: { content: string }) {
  const sections = content.split(/\n## /);
  return (
    <div className="space-y-5">
      {sections.map((section, si) => {
        if (!section.trim()) return null;
        const [headingLine, ...rest] = section.split('\n');
        const heading = si === 0 && !section.startsWith('#') ? null : headingLine.replace(/^##?\s*/, '');
        const body = (si === 0 && !section.startsWith('#') ? section : rest.join('\n')).trim();
        return (
          <div key={si} className="rounded-xl border border-border bg-card/30 overflow-hidden">
            {heading && (
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">{heading}</h4>
              </div>
            )}
            <div className="p-4 space-y-2">
              <InstructionBody text={body} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InstructionBody({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let step = 0;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Blockquote
    if (trimmed.startsWith('>')) {
      const bqText = trimmed.replace(/^>\s*\*\*([^*]+)\*\*\s*/, '').replace(/^>\s*/, '');
      const bqBold = (trimmed.match(/^>\s*\*\*([^*]+)\*\*/) || [])[1];
      elements.push(
        <div key={i} className="rounded-lg bg-primary/5 border border-primary/20 px-3.5 py-2.5 text-xs text-muted-foreground leading-relaxed">
          {bqBold && <span className="font-semibold text-foreground">{bqBold}: </span>}
          {bqText.replace(/^>\s*/, '')}
        </div>
      );
      return;
    }

    // Numbered step
    const stepMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (stepMatch) {
      step++;
      const stepNum = parseInt(stepMatch[1]);
      const stepText = stepMatch[2];
      elements.push(
        <div key={i} className="flex gap-3 items-start">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/30 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">
            {stepNum}
          </div>
          <div className="flex-1 text-sm leading-relaxed">
            <InlineText text={stepText} />
          </div>
        </div>
      );
      return;
    }

    // Sub-point
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletText = trimmed.replace(/^[-*]\s+/, '');
      elements.push(
        <div key={i} className="flex gap-2 items-start pl-9">
          <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-2" />
          <p className="text-xs text-muted-foreground leading-relaxed"><InlineText text={bulletText} /></p>
        </div>
      );
      return;
    }

    // Code block marker
    if (trimmed === '```html' || trimmed === '```javascript' || trimmed === '```bash' || trimmed === '```') return;

    // Code line (inside block)
    if (lines[i-1]?.trim().match(/^```/) || (i > 0 && !lines[i-1]?.trim() === false && elements.length > 0)) {
      // Plain paragraph
    }

    // Warning line
    if (trimmed.startsWith('⚠️') || trimmed.startsWith('⚠')) {
      elements.push(
        <div key={i} className="rounded-lg bg-amber-500/8 border border-amber-500/20 px-3.5 py-2.5 text-xs text-amber-300 leading-relaxed">
          {trimmed}
        </div>
      );
      return;
    }

    // Plain paragraph / bold header
    if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      elements.push(<p key={i} className="text-xs font-bold text-foreground mt-2">{trimmed.replace(/\*\*/g,'')}</p>);
      return;
    }

    // Normal text
    if (trimmed && trimmed !== '---') {
      elements.push(
        <p key={i} className="text-sm text-muted-foreground leading-relaxed"><InlineText text={trimmed} /></p>
      );
    }
  });

  return <>{elements}</>;
}

function InlineText({ text }: { text: string }) {
  // Render **bold**, `code`, and plain text inline
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-foreground">{part.slice(2,-2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={i} className="text-[11px] font-mono bg-muted/60 px-1 py-0.5 rounded text-amber-300">{part.slice(1,-1)}</code>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
