/* ════════════════════════════════════════════════════════════════
   src/components/pm/DevPanel.tsx — Developer Workspace by Manav
   CMS-aware · backup-before-touch · rollback on every fix
════════════════════════════════════════════════════════════════ */

import { useState, useRef, useCallback, useEffect } from 'react';

/* ── Types ────────────────────────────────────────────────── */
interface DevTask {
  id: string;
  phase: string; category: string; task_type: string;
  title: string; description?: string;
  finding_ref?: string; finding_title?: string;
  severity: 'critical'|'warning'|'info';
  target_url?: string; priority: number;
  status: 'pending'|'running'|'fix_ready'|'applied'|'verifying'|'done'|'skipped'|'failed';
  analysis?: string; fix_code?: string; fix_language?: string;
  apply_instructions?: string; verification_method?: string;
  rollback_code?: string; rollback_instructions?: string;
  snapshot_id?: string; backup_confirmed?: boolean;
  verification_result?: 'pass'|'fail'|'partial';
  verification_evidence?: any;
  cms_platform?: string;
}
interface CmsInfo { platform:string; seoPlugin:string; confidence:number; signals:string[]; adminPath:string; notes?:string; }
interface Snapshot { snapshot:string; captured_at:string; }

/* ── API ──────────────────────────────────────────────────── */
async function te(action: string, body: any) {
  const r = await fetch('/api/task-engine', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action,...body}) });
  return r.json();
}

/* ── Static maps ──────────────────────────────────────────── */
const PHASE_META: Record<string,{label:string;accent:string;dot:string}> = {
  phase_0:{ label:'Phase 0 — Fix First (Critical)',  accent:'border-red-500/40 bg-red-500/5', dot:'bg-red-500' },
  phase_2:{ label:'Phase 2 — Content & On-page',     accent:'border-amber-500/40 bg-amber-500/5', dot:'bg-amber-500' },
  phase_3:{ label:'Phase 3 — Parallel (Any Time)',   accent:'border-blue-500/40 bg-blue-500/5', dot:'bg-blue-400' },
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
const STATUS_LABEL: Record<string,string> = { pending:'Pending', running:'Analyzing…', fix_ready:'Fix Ready', applied:'Applied', verifying:'Verifying…', done:'Done ✓', skipped:'Skipped', failed:'Failed' };
const CMS_LOGOS: Record<string,string> = { wordpress:'🔵', webflow:'💎', squarespace:'⬛', wix:'🟣', shopify:'🟢', hubspot:'🟠', drupal:'💧', ghost:'👻', framer:'⚡', custom:'🔧', unknown:'❓' };

/* ═══════════════════════════════════════════════════════════
   SAFETY CHECKLIST MODAL
   Shown before "I Applied the Fix" — user must acknowledge risks
═══════════════════════════════════════════════════════════ */
function SafetyModal({ task, cms, onConfirm, onCancel }: { task:DevTask; cms:CmsInfo|null; onConfirm:()=>void; onCancel:()=>void }) {
  const [checks, setChecks] = useState({ backup:false, staging:false, understand:false });
  const allChecked = Object.values(checks).every(Boolean);
  const platform = cms?.platform || task.cms_platform || 'unknown';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🛡️</span>
            <h3 className="text-base font-bold">Pre-apply Safety Check</h3>
          </div>
          <p className="text-xs text-muted-foreground">Before you apply this fix to a live client site, confirm the following. This protects you and your client.</p>
        </div>

        {/* Backup status from Manav */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">✅</span>
          <div>
            <div className="text-xs font-semibold text-emerald-400">Manav has saved a backup</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">The exact HTML of this page was captured before generating this fix. If anything goes wrong, the "Rollback" tab shows exactly how to undo it — including CMS-specific undo steps.</div>
            {task.snapshot_id && <div className="text-[10px] font-mono text-emerald-400/70 mt-1">Snapshot ID: {task.snapshot_id.slice(0,8)}…</div>}
          </div>
        </div>

        {/* User-confirmed checklist */}
        <div className="space-y-3">
          <CheckItem
            checked={checks.backup}
            onChange={v => setChecks(p=>({...p,backup:v}))}
            label="I have a site backup before making this change"
            detail={platform === 'wordpress' ? 'Recommended: UpdraftPlus or your host\'s built-in backup. WordPress → Plugins → UpdraftPlus → Backup Now.' : platform === 'shopify' ? 'Recommended: Rewind app (free tier). Or download theme: Themes → Actions → Download.' : 'Download your theme files or ask your host for a backup before proceeding.'}
          />
          <CheckItem
            checked={checks.staging}
            onChange={v => setChecks(p=>({...p,staging:v}))}
            label="I have tested this on a staging/preview environment first (if available)"
            detail={platform === 'wordpress' ? 'Many hosts offer a staging site. WP Engine, Kinsta, and Flywheel all have one-click staging. If not available, skip this step.' : platform === 'webflow' ? 'Webflow lets you preview before publishing — use that.' : 'If no staging environment, proceed carefully and verify immediately after applying.'}
            optional
          />
          <CheckItem
            checked={checks.understand}
            onChange={v => setChecks(p=>({...p,understand:v}))}
            label="I understand how to undo this change using the Rollback tab"
            detail="The Rollback tab shows the exact steps and original code to restore if anything looks wrong after applying."
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
            Not yet — go back
          </button>
          <button
            onClick={onConfirm}
            disabled={!allChecked}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${allChecked ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_16px_hsl(var(--primary)/0.3)]' : 'bg-muted/50 text-muted-foreground cursor-not-allowed'}`}
          >
            Confirm & Mark Applied
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckItem({ checked, onChange, label, detail, optional }: { checked:boolean; onChange:(v:boolean)=>void; label:string; detail:string; optional?:boolean }) {
  return (
    <label className={`flex gap-3 items-start p-3 rounded-xl border cursor-pointer transition-all ${checked ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card/40 hover:border-border/80'}`}>
      <div className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center transition-all ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-border'}`}
        onClick={() => onChange(!checked)}
      >
        {checked && <span className="text-white text-xs font-bold">✓</span>}
      </div>
      <div>
        <div className="text-xs font-medium">{label}{optional && <span className="ml-1 text-muted-foreground font-normal">(optional)</span>}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{detail}</div>
      </div>
    </label>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PANEL
═══════════════════════════════════════════════════════════ */
export default function DevPanel({ projectId }: { projectId:string }) {
  const [tasks, setTasks]           = useState<DevTask[]>([]);
  const [cms, setCms]               = useState<CmsInfo|null>(null);
  const [selected, setSelected]     = useState<DevTask|null>(null);
  const [loading, setLoading]       = useState(false);
  const [parsing, setParsing]       = useState(false);
  const [error, setError]           = useState('');
  const [targetUrl, setTargetUrl]   = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadTasks = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await te('dev_get_tasks', { projectId });
      if (r.tasks) {
        setTasks(r.tasks);
        const withCms = r.tasks.find((t:DevTask) => t.cms_platform);
        if (withCms && !cms) setCms({ platform:withCms.cms_platform, seoPlugin:'', confidence:0, signals:[], adminPath:'' });
      }
    } finally { setLoading(false); }
  }, [projectId, cms]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const refreshSelected = useCallback(async (id:string) => {
    const r = await te('dev_get_tasks', { projectId });
    if (r.tasks) {
      setTasks(r.tasks);
      setSelected(r.tasks.find((t:DevTask) => t.id === id) || null);
    }
  }, [projectId]);

  const parseAudit = useCallback(async (md:string) => {
    setParsing(true); setError('');
    try {
      const findings:any[] = [];
      const blocks = md.split(/\n<a id="finding-\d+-\d+"><\/a>\n/);
      for (const block of blocks) {
        const titleMatch = block.match(/### §\d+\.\d+ — [🎯🔴🟡🟢ℹ️ ]+([^\n]+)/);
        if (!titleMatch) continue;
        const title = titleMatch[1].trim();
        const sev = /🔴/.test(block) ? 'red' : /🟡/.test(block) ? 'amber' : 'green';
        const kindMatch = block.match(/\*\*Audit kind:\*\* `([^`]+)`/);
        const detailMatch = block.match(/\*\*Detail:\*\*\n\n([\s\S]+?)(?:\n\n\*\*Rec|$)/);
        let evidence:any = {};
        const evMatch = block.match(/```json\n([\s\S]+?)\n```/);
        if (evMatch) { try { evidence = JSON.parse(evMatch[1]); } catch {} }
        findings.push({ audit_kind:kindMatch?.[1]||'on_page', severity:sev, finding_title:title, finding_detail:detailMatch?.[1]?.trim().slice(0,600)||'', evidence });
      }
      const runIdMatch = md.match(/\*\*Audit run id:\*\* `([^`]+)`/);
      const urlMatch   = md.match(/\*\*Audited URL:\*\* \[([^\]]+)\]/);
      const runId = runIdMatch?.[1] || `manual-${Date.now()}`;
      const url   = urlMatch?.[1] || targetUrl;
      if (!findings.length) { setError('No findings found. Upload the full audit .md file.'); return; }
      const r = await te('dev_parse_audit_tasks', { projectId, auditRunId:runId, targetUrl:url||targetUrl, findings });
      if (r.error) { setError(r.error); return; }
      const cmsR = await te('dev_detect_cms', { projectId, url:url||targetUrl });
      if (cmsR.cms) setCms(cmsR.cms);
      setShowUpload(false);
      await loadTasks();
    } catch (e:any) { setError(e?.message||'Parse failed'); }
    finally { setParsing(false); }
  }, [projectId, targetUrl, loadTasks]);

  const handleFile = (e:React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => parseAudit(ev.target?.result as string);
    reader.readAsText(f);
  };

  const execute = async (task:DevTask) => {
    setSelected({ ...task, status:'running' });
    const r = await te('dev_execute_task', { taskId:task.id });
    if (r.error) { setError(r.error); return; }
    if (r.cms) setCms(r.cms);
    await refreshSelected(task.id);
  };

  const verify = async (task:DevTask) => {
    setSelected({ ...task, status:'verifying' });
    const r = await te('dev_verify_task', { taskId:task.id });
    if (r.error) { setError(r.error); return; }
    await refreshSelected(task.id);
  };

  const confirmApplied = async (task:DevTask) => {
    await te('dev_confirm_backup', { taskId:task.id });
    await te('dev_update_task', { taskId:task.id, updates:{ status:'applied', backup_confirmed:true } });
    setShowSafety(false);
    await refreshSelected(task.id);
  };

  const updateStatus = async (task:DevTask, status:DevTask['status']) => {
    await te('dev_update_task', { taskId:task.id, updates:{ status } });
    await refreshSelected(task.id);
  };

  /* Stats */
  const total    = tasks.length;
  const done     = tasks.filter(t => t.status === 'done').length;
  const critical = tasks.filter(t => t.severity === 'critical' && !['done','skipped'].includes(t.status)).length;
  const byPhase  = (ph:string) => tasks.filter(t => t.phase === ph);

  /* ── Upload screen ─────────────────────────────────────── */
  if (showUpload || tasks.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-8 space-y-5">
        <div className="text-center">
          <div className="text-5xl mb-3">🛠️</div>
          <h2 className="text-xl font-bold mb-1">Developer Workspace</h2>
          <p className="text-xs text-muted-foreground/60 font-mono mb-2">by Manav</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Upload your audit. Manav detects your CMS, snapshots the live page, generates exact code fixes, and prepares rollback steps — before touching anything.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target page URL</label>
          <input
            value={targetUrl}
            onChange={e => setTargetUrl(e.target.value)}
            placeholder="https://www.alphasoftware.com/mobile-forms"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary/60 transition-colors"
          />
          <p className="text-[11px] text-muted-foreground">Manav fetches this page to detect your CMS and take a before-snapshot before generating any fix.</p>
        </div>

        <div
          className="rounded-2xl border-2 border-dashed border-border hover:border-primary/40 bg-card/30 p-8 text-center cursor-pointer transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <div className="text-3xl mb-3">{parsing ? '⟳' : '📋'}</div>
          <p className="text-sm font-medium mb-1">{parsing ? 'Parsing audit…' : 'Click to upload audit file'}</p>
          <p className="text-xs text-muted-foreground">The audit .md file from the SEO Audit tab</p>
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

  /* ── Main layout ─────────────────────────────────────────── */
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

      <div className="flex gap-5" style={{ minHeight:600 }}>

        {/* LEFT: task list */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-3">

          {/* Manav badge */}
          <div className="rounded-xl border border-border bg-card/50 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-primary">Manav</span>
              <span className="text-[10px] text-muted-foreground">Developer Workspace</span>
            </div>
            {cms && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{CMS_LOGOS[cms.platform]||'🔧'}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{cms.platform}</span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{done}</span>/{total} done
              {critical > 0 && <span className="ml-2 text-red-400 font-medium">{critical} critical open</span>}
            </div>
            <div className="flex gap-1.5">
              <button onClick={loadTasks} className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">↻</button>
              <button onClick={() => setShowUpload(true)} className="text-xs px-2 py-1 rounded-lg border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 transition-colors">+ New Audit</button>
            </div>
          </div>

          {total > 0 && (
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width:`${(done/total)*100}%` }} />
            </div>
          )}

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
                        selected?.id === task.id ? 'border-primary/60 bg-primary/8' : 'border-border bg-card/40 hover:bg-card/70'
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

        {/* RIGHT: detail */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-center p-12">
              <div>
                <div className="text-5xl mb-4">👈</div>
                <p className="text-sm font-medium mb-1">Select a task to begin</p>
                <p className="text-xs text-muted-foreground">Phase 0 tasks block everything else — start there.</p>
              </div>
            </div>
          ) : (
            <TaskDetail
              task={selected}
              cms={cms}
              onExecute={() => execute(selected)}
              onVerify={() => verify(selected)}
              onMarkApplied={() => setShowSafety(true)}
              onSkip={() => updateStatus(selected, 'skipped')}
              onReopen={() => updateStatus(selected, 'pending')}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   TASK DETAIL
═══════════════════════════════════════════════════════════ */
function TaskDetail({ task, cms, onExecute, onVerify, onMarkApplied, onSkip, onReopen }: {
  task:DevTask; cms:CmsInfo|null;
  onExecute:()=>void; onVerify:()=>void; onMarkApplied:()=>void; onSkip:()=>void; onReopen:()=>void;
}) {
  const [copiedFix,  setCopiedFix]  = useState(false);
  const [copiedRoll, setCopiedRoll] = useState(false);
  const [snapshot, setSnapshot]     = useState<Snapshot|null>(null);
  const [activeTab, setActiveTab]   = useState<'instructions'|'code'|'rollback'|'verify'>('instructions');

  const copy = (text:string, set:(v:boolean)=>void) => { navigator.clipboard.writeText(text); set(true); setTimeout(()=>set(false),2000); };

  // Load snapshot when task has one
  useEffect(() => {
    if (task.snapshot_id && !snapshot) {
      te('dev_get_snapshot', { taskId:task.id }).then(r => { if (r.snapshot) setSnapshot(r.snapshot); });
    }
  }, [task.snapshot_id, task.id, snapshot]);

  // Switch to instructions tab when a new task is selected
  useEffect(() => { setActiveTab('instructions'); }, [task.id]);

  const sevColor = task.severity === 'critical' ? 'text-red-400' : task.severity === 'warning' ? 'text-amber-400' : 'text-sky-400';
  const hasTabs  = !!(task.analysis || task.fix_code || task.apply_instructions);

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
              {task.snapshot_id && <span className="text-[11px] text-emerald-400">· 🛡️ snapshot saved</span>}
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
          <button onClick={onExecute}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary)/0.25)] transition-all"
          >
            ▶ Analyze & Generate Fix
          </button>
        )}
        {task.status === 'running' && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm">
            <span className="animate-spin inline-block">⟳</span> Manav is analyzing the live page…
          </div>
        )}
        {task.status === 'fix_ready' && (
          <>
            <button onClick={onMarkApplied}
              className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-all"
            >
              ✓ I Applied the Fix
            </button>
            <button onClick={onExecute} className="px-3 py-2.5 rounded-xl border border-border text-muted-foreground text-sm hover:text-foreground transition-all">↺ Re-generate</button>
          </>
        )}
        {task.status === 'applied' && (
          <button onClick={onVerify}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-sm font-semibold hover:bg-indigo-500/20 transition-all"
          >
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
          <button onClick={onExecute} className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20">↺ Retry</button>
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
        <div className={`rounded-xl border p-3.5 ${task.verification_result==='pass'?'bg-emerald-500/5 border-emerald-500/30':task.verification_result==='partial'?'bg-amber-500/5 border-amber-500/30':'bg-red-500/5 border-red-500/30'}`}>
          <div className={`font-semibold text-sm mb-1 ${task.verification_result==='pass'?'text-emerald-400':task.verification_result==='partial'?'text-amber-400':'text-red-400'}`}>
            {task.verification_result==='pass'?'✅ Verification PASSED':task.verification_result==='partial'?'⚠️ Partially verified — see details':'❌ Not detected yet — check if changes are published'}
          </div>
          {task.verification_evidence?.message && <p className="text-xs text-muted-foreground">{task.verification_evidence.message}</p>}
        </div>
      )}

      {/* Tabs */}
      {hasTabs && (
        <>
          <div className="flex gap-0.5 border-b border-border">
            {(['instructions','code','rollback','verify'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-3.5 py-2 text-xs font-medium border-b-2 -mb-px transition-colors relative ${activeTab===t?'border-primary text-primary':'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                {t==='instructions'?'📋 How to Apply':t==='code'?'⚡ Fix Code':t==='rollback'?'🔄 Rollback':'🔍 Verify'}
                {t==='rollback' && task.snapshot_id && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" title="Snapshot saved" />}
              </button>
            ))}
          </div>

          {/* INSTRUCTIONS TAB */}
          {activeTab==='instructions' && (
            <div className="space-y-4">
              {task.analysis && (
                <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">What Manav found on your live page</div>
                  <p className="text-sm leading-relaxed">{task.analysis}</p>
                </div>
              )}
              {task.apply_instructions && <MarkdownBlocks content={task.apply_instructions} />}
            </div>
          )}

          {/* CODE TAB */}
          {activeTab==='code' && (
            task.fix_code ? (
              <div className="rounded-xl border border-amber-500/20 bg-[#1a1500] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold text-xs tracking-wider">EXACT FIX CODE</span>
                    {task.fix_language && <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400/60 border border-amber-500/20 px-1.5 py-0.5 rounded">{task.fix_language}</span>}
                  </div>
                  <button onClick={() => copy(task.fix_code!, setCopiedFix)}
                    className={`text-xs px-3 py-1 rounded-lg border transition-all font-medium ${copiedFix?'bg-emerald-500/20 border-emerald-500/40 text-emerald-400':'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'}`}
                  >{copiedFix?'✓ Copied!':'Copy All'}</button>
                </div>
                <pre className="p-4 text-xs font-mono text-amber-100/80 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed" style={{maxHeight:420}}>
                  {task.fix_code}
                </pre>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground rounded-xl border border-dashed border-border">No code block — follow the How to Apply tab.</div>
            )
          )}

          {/* ROLLBACK TAB */}
          {activeTab==='rollback' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex gap-3">
                <span className="text-2xl flex-shrink-0">🛡️</span>
                <div>
                  <div className="text-xs font-semibold text-emerald-400 mb-0.5">Manav backed up this page before generating the fix</div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    {task.snapshot_id
                      ? `A snapshot of the relevant HTML was captured before any fix was generated. The rollback code and instructions below are based on that snapshot.${snapshot ? ' Captured: ' + new Date(snapshot.captured_at).toLocaleString() : ''}`
                      : 'Run "Analyze & Generate Fix" first — Manav will snapshot the live page before generating anything.'}
                  </div>
                </div>
              </div>

              {task.rollback_instructions && <MarkdownBlocks content={task.rollback_instructions} />}

              {task.rollback_code && (
                <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Original Code (before fix)</span>
                    <button onClick={() => copy(task.rollback_code!, setCopiedRoll)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${copiedRoll?'bg-emerald-500/20 border-emerald-500/40 text-emerald-400':'border-border text-muted-foreground hover:text-foreground'}`}
                    >{copiedRoll?'✓ Copied!':'Copy'}</button>
                  </div>
                  <pre className="p-4 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all leading-relaxed" style={{maxHeight:320}}>
                    {task.rollback_code}
                  </pre>
                </div>
              )}

              {snapshot?.snapshot && (
                <div className="rounded-xl border border-border bg-card/20 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Snapshot — Taken Before Fix</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(snapshot.captured_at).toLocaleTimeString()}</span>
                  </div>
                  <pre className="p-4 text-[11px] font-mono text-muted-foreground/70 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed" style={{maxHeight:280}}>
                    {snapshot.snapshot.slice(0, 2000)}{snapshot.snapshot.length > 2000 ? '\n…(truncated)' : ''}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* VERIFY TAB */}
          {activeTab==='verify' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">How to verify manually</div>
                <p className="text-sm leading-relaxed">{task.verification_method || 'Visit the live page and confirm the change is visible.'}</p>
              </div>
              {task.status==='fix_ready' && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-300">
                  ⚠️ Click "I Applied the Fix" first, then use "Verify on Live Page" for auto-checking.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!hasTabs && task.status==='pending' && (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <div className="text-5xl mb-4">🔬</div>
          <p className="text-sm font-semibold mb-2">Ready to execute</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Click "Analyze & Generate Fix". Manav fetches <strong>{task.target_url || 'the live page'}</strong>, snapshots the current state, identifies the exact issue, and generates step-by-step instructions specific to your CMS — before generating the fix code.
          </p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MARKDOWN RENDERER
═══════════════════════════════════════════════════════════ */
function MarkdownBlocks({ content }:{ content:string }) {
  const sections = content.split(/\n(?=## )/);
  return (
    <div className="space-y-4">
      {sections.map((section, si) => {
        const headingMatch = section.match(/^##\s+(.+)/);
        const heading = headingMatch?.[1]?.trim();
        const body = section.replace(/^##[^\n]+\n/, '').trim();
        if (!body && !heading) return null;
        return (
          <div key={si} className="rounded-xl border border-border bg-card/30 overflow-hidden">
            {heading && (
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider">{heading}</h4>
              </div>
            )}
            <div className="p-4 space-y-2.5">
              <InstructionLines text={body} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InstructionLines({ text }:{ text:string }) {
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t || t==='---') return null;
        if (t.startsWith('>')) {
          const inner = t.replace(/^>\s*/, '');
          return <div key={i} className="rounded-lg bg-primary/5 border border-primary/15 px-3.5 py-2.5 text-xs text-muted-foreground leading-relaxed"><InlineText text={inner}/></div>;
        }
        if (/^⚠️/.test(t)) return <div key={i} className="rounded-lg bg-amber-500/8 border border-amber-500/20 px-3.5 py-2.5 text-xs text-amber-300">{t}</div>;
        const stepM = t.match(/^(\d+)\.\s+(.+)/);
        if (stepM) return (
          <div key={i} className="flex gap-3 items-start">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/30 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">{stepM[1]}</div>
            <p className="flex-1 text-sm leading-relaxed"><InlineText text={stepM[2]}/></p>
          </div>
        );
        if (/^[-*]\s/.test(t)) return (
          <div key={i} className="flex gap-2 items-start pl-9">
            <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-2"/>
            <p className="text-xs text-muted-foreground"><InlineText text={t.replace(/^[-*]\s/,'')}/></p>
          </div>
        );
        if (t.startsWith('**') && t.endsWith('**')) return <p key={i} className="text-xs font-bold mt-1">{t.replace(/\*\*/g,'')}</p>;
        return <p key={i} className="text-sm text-muted-foreground leading-relaxed"><InlineText text={t}/></p>;
      })}
    </div>
  );
}

function InlineText({ text }:{ text:string }) {
  return <>{text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p,i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i} className="font-semibold text-foreground">{p.slice(2,-2)}</strong> :
    p.startsWith('`')  && p.endsWith('`')  ? <code key={i} className="text-[11px] font-mono bg-muted/60 px-1 py-0.5 rounded text-amber-300">{p.slice(1,-1)}</code> :
    <span key={i}>{p}</span>
  )}</>;
}
