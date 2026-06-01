/* ════════════════════════════════════════════════════════════════
   src/pages/Workspace.tsx

   Quantum Intelligence Workspace — one connected surface for the full
   flow: Deep Steps → Panel (with Manav's gate + rounds) → Pillars
   (scientists) → Documents. Project-agnostic; works for any project.
═══════════════════════════════════════════════════════════════ */

import React, { useCallback, useEffect, useState } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { useToast } from '@/hooks/use-toast';
import { SimpleMarkdown } from '@/components/pm/SeoCampaignsPanel';
import { downloadStakeholderReport, openStakeholderReport } from '@/lib/reportExport';
import {
  wsCreateRun, wsRunDeepSteps, wsRunPanel, wsReleaseToPillars, wsSolvePillar, wsGetRun,
  wsGoalCatalog, wsComposeConfig, wsCancelRun, wsPollStatus, wsTakeEscalationsToPanel,
  wsSolveClientReport, wsCrUploadAttachment, wsCrListAttachments, wsCrRemoveAttachment,
} from '@/components/pm/api';
import {
  Activity, Users, FlaskConical, FileText, Play, ChevronRight, Loader2,
  Send, Download, Copy, Check, ArrowRight, Sparkles, ExternalLink, X, Upload, Paperclip,
} from 'lucide-react';

const PILLARS = ['visibility', 'query_opportunity', 'on_page_health', 'technical_performance', 'internal_links', 'engagement', 'monitoring'];
const PILLAR_LABEL: Record<string, string> = {
  visibility: 'Visibility', query_opportunity: 'Query Opportunity', on_page_health: 'On-Page Health',
  technical_performance: 'Technical Performance', internal_links: 'Internal Links', engagement: 'Engagement', monitoring: 'Monitoring',
  client_report: 'Client Report',
};
const ROLE_LABEL: Record<string, string> = {
  client: 'Client', dms: 'Senior SEO', writer: 'Content Writer', brand: 'Brand', pm: 'PM', investor: 'Investor',
};

type Section = 'pipeline' | 'panel' | 'pillars' | 'documents';

const CYAN = 'hsl(186 80% 55%)';
const card: React.CSSProperties = { background: 'linear-gradient(180deg, rgba(26,27,39,0.9), rgba(15,16,24,0.7))', border: '1px solid rgba(160,160,180,0.15)', borderRadius: 12, padding: 16 };

function humanTitle(s: string): string {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function Workspace() {
  const { selectedProjectId, selectedProject } = useProject();
  const { toast } = useToast();
  const [section, setSection] = useState<Section>('pipeline');
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [manavInput, setManavInput] = useState('');
  const [pillarBusy, setPillarBusy] = useState('');
  // Goal selection + config
  const [catalog, setCatalog] = useState<any>(null);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [customLabel, setCustomLabel] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [showPicker, setShowPicker] = useState(false);
  // Solve-all queue state — surfaces which pillars are queued, running, done
  const [queue, setQueue] = useState<{ done: string[]; running: string | null; pending: string[] } | null>(null);
  const [liveStatus, setLiveStatus] = useState<string>('');
  // Sticky error surface — toasts can be missed. Any operation that fails sets
  // this, rendered as a dismissible banner near the top of the page.
  const [lastError, setLastError] = useState<{ where: string; message: string } | null>(null);
  const reportError = (where: string, message: string) => {
    setLastError({ where, message });
    toast({ title: where, description: message, variant: 'destructive' });
  };

  // Client Report state — context + optional reference paste + mode.
  // Persists in component state across re-solves so the operator can iterate
  // without retyping the brief every time.
  const [crOpen, setCrOpen] = useState(false);
  const [crContext, setCrContext] = useState('');
  const [crReferenceText, setCrReferenceText] = useState('');
  const [crReferenceMode, setCrReferenceMode] = useState<'template' | 'data' | 'both'>('both');
  // Report scoping mode — strict keeps the report bounded to context +
  // attachments only; comprehensive lets it draw freely on the full
  // workspace analysis to fulfil what the context asks for.
  const [crMode, setCrMode] = useState<'strict' | 'comprehensive'>('strict');
  const [crBusy, setCrBusy] = useState(false);
  // Uploaded reference attachments for the Client Report. Loaded from server,
  // refreshed after each upload/remove.
  const [crAttachments, setCrAttachments] = useState<Array<{ id: string; file_name: string; size_bytes: number; parse_status: string; parse_note?: string; created_at: string }>>([]);
  const [crUploading, setCrUploading] = useState(false);
  const cancelRef = React.useRef(false);

  useEffect(() => { wsGoalCatalog().then((r) => { if (r.success) setCatalog(r); }); }, []);

  // Recompute the config preview whenever goal selection changes
  useEffect(() => {
    if (!selectedGoals.length && !customLabel) { setConfig(null); return; }
    wsComposeConfig({ goalIds: selectedGoals, customLabel: customLabel || undefined }).then((r) => { if (r.success) setConfig(r.config); });
  }, [selectedGoals, customLabel]);

  const toggleGoal = (id: string) => setSelectedGoals((g) => g.includes(id) ? g.filter((x) => x !== id) : [...g, id]);
  const toggleStep = (key: string) => setConfig((c: any) => c ? { ...c, steps: c.steps.map((s: any) => s.key === key ? { ...s, enabled: !s.enabled } : s) } : c);

  const load = useCallback(async () => {
    if (!selectedProjectId) return;
    const r = await wsGetRun({ projectId: selectedProjectId });
    if (r.success) setState(r);
  }, [selectedProjectId]);

  useEffect(() => { load(); }, [load]);

  const run = state?.run;
  const steps: any[] = state?.steps || [];
  const panel = state?.panel;
  const reports: any[] = state?.reports || [];
  // Total escalations across all current pillar reports — used to enable the
  // "Take to panel" button on the Pillars section.
  const totalEscalations: number = reports.reduce((n, r) => n + (Array.isArray(r.escalations_json) ? r.escalations_json.length : 0), 0);

  /* ── lifecycle actions ── */
  const startRun = async () => {
    if (!selectedProjectId) return;
    if (!selectedGoals.length && !customLabel) { toast({ title: 'Pick a goal first', description: 'Select one or more goals (or name a custom goal) to configure the run.' }); setShowPicker(true); return; }
    const stepOverrides = (config?.steps || []).map((s: any) => ({ key: s.key, enabled: s.enabled, depth: s.depth }));
    setBusy('Creating run');
    const cr = await wsCreateRun({ projectId: selectedProjectId, goalIds: selectedGoals, customLabel: customLabel || undefined, stepOverrides });
    if (!cr.success || !cr.run_id) { reportError('Could not start run', cr.error || 'unknown error'); setBusy(''); return; }
    setShowPicker(false);
    setBusy('Deep steps gathering verified evidence — full GSC + live-crawl + SerpAPI pass');
    const ds = await wsRunDeepSteps({ runId: cr.run_id, projectId: selectedProjectId });
    setBusy('');
    if (!ds.success) { reportError('Deep steps failed', ds.error || 'unknown error'); }
    else { toast({ title: 'Evidence gathered', description: 'Step reports ready. Review, then run the panel.' }); }
    await load();
  };

  const runPanel = async (round: number) => {
    if (!run) return;
    // Use operator input on every round if the textarea has content. Earlier
    // version gated this to round>=2 which silently dropped input on round 1.
    const input = manavInput && manavInput.trim() ? manavInput : undefined;
    const busyLabel = input
      ? `Panel discussing with your input (round ${round})`
      : round === 1
        ? 'Panel discussing the evidence (round 1)'
        : `Panel re-discussing with your input (round ${round})`;
    setBusy(busyLabel);
    const r = await wsRunPanel({ runId: run.id, projectId: selectedProjectId!, round, manavInput: input });
    setBusy('');
    if (!r.success) reportError('Panel failed', r.error || 'unknown error');
    else { toast({ title: `Panel round ${round} complete`, description: input ? 'Your input was incorporated. Review the discussion, then add more input or release to pillars.' : 'Review each role\'s questions, then add input or release to pillars.' }); setManavInput(''); }
    await load();
    setSection('panel');
  };

  const release = async () => {
    if (!run) return;
    setBusy('Releasing to pillars');
    await wsReleaseToPillars({ runId: run.id });
    setBusy('');
    toast({ title: 'Released to pillars', description: 'The scientists can now solve each pillar.' });
    await load();
    setSection('pillars');
  };

  const solve = async (pillar: string) => {
    if (!selectedProjectId) return;
    setPillarBusy(pillar);
    const r = await wsSolvePillar({ runId: run?.id, projectId: selectedProjectId, campaignId: run?.campaign_id, pillar });
    setPillarBusy('');
    if (!r.success) reportError(`${PILLAR_LABEL[pillar]} failed`, r.error || 'unknown error');
    else toast({ title: `${PILLAR_LABEL[pillar]} solved`, description: 'Report ready in Documents.' });
    await load();
  };

  const solveAll = async () => {
    if (!selectedProjectId) return;
    // Build the queue: pillars from run config (or all 7), excluding already-solved
    const target: string[] = (run?.run_config?.pillars && run.run_config.pillars.length) ? run.run_config.pillars : PILLARS;
    const todo = target.filter(p => !reports.find((r) => r.pillar === p));
    if (!todo.length) { toast({ title: 'All pillars already solved' }); return; }

    cancelRef.current = false;
    setQueue({ done: [], running: null, pending: todo });

    // Live polling — every 2s we read pillar_status off the run row and surface it
    let pollHandle: any = null;
    const startPolling = () => {
      if (!run?.id) return;
      pollHandle = setInterval(async () => {
        if (cancelRef.current) return;
        const r = await wsPollStatus({ runId: run.id });
        if (r.pillar_status) setLiveStatus(r.pillar_status);
      }, 2000);
    };
    startPolling();

    try {
      for (let i = 0; i < todo.length; i++) {
        if (cancelRef.current) { toast({ title: 'Stopped', description: `Cancelled before ${PILLAR_LABEL[todo[i]] || todo[i]}.` }); break; }
        const p = todo[i];
        setQueue({ done: todo.slice(0, i), running: p, pending: todo.slice(i + 1) });
        setPillarBusy(p);
        setLiveStatus(`${p}: starting`);
        const r = await wsSolvePillar({ runId: run?.id, projectId: selectedProjectId, campaignId: run?.campaign_id, pillar: p });
        if (!r.success) reportError(`${PILLAR_LABEL[p]} failed`, r.error || 'unknown error');
        await load();
      }
      if (!cancelRef.current) toast({ title: 'All pillars solved' });
    } finally {
      if (pollHandle) clearInterval(pollHandle);
      setPillarBusy('');
      setQueue(null);
      setLiveStatus('');
      cancelRef.current = false;
    }
  };

  const cancelAll = async () => {
    cancelRef.current = true;
    if (run?.id) { try { await wsCancelRun({ runId: run.id }); } catch { /* non-fatal */ } }
    toast({ title: 'Cancelling', description: 'The currently-running pillar will finish; no more will start.' });
  };

  const takeEscalationsToPanel = async () => {
    if (!run?.id || !selectedProjectId) return;
    setBusy('Taking pillar questions to the panel for a fresh round');
    const r = await wsTakeEscalationsToPanel({ runId: run.id, projectId: selectedProjectId });
    setBusy('');
    if (!r.success) reportError('Could not run panel', r.error || 'unknown error');
    else { toast({ title: 'Panel round started', description: 'Review the new round in the Panel tab.' }); setSection('panel'); }
    await load();
  };

  const solveClientReport = async () => {
    if (!run?.id || !selectedProjectId) { reportError('Client Report', 'No active run. Start a workspace run first.'); return; }
    if (!crContext.trim()) { reportError('Client Report', 'Add your context — at minimum, the client name and what they want.'); return; }
    setCrBusy(true);
    setLiveStatus('client_report: starting');
    // Live status poll while the call runs
    let poll: any = null;
    if (run?.id) {
      poll = setInterval(async () => {
        const r = await wsPollStatus({ runId: run.id });
        if (r.pillar_status) setLiveStatus(r.pillar_status);
      }, 2000);
    }
    try {
      const r = await wsSolveClientReport({
        runId: run.id, projectId: selectedProjectId, campaignId: run.campaign_id,
        manavContext: crContext,
        referenceText: crReferenceText.trim() ? crReferenceText : undefined,
        referenceMode: (crReferenceText.trim() || crAttachments.length) ? crReferenceMode : undefined,
        attachmentIds: crAttachments.length ? crAttachments.map(a => a.id) : undefined,
        mode: crMode,
      });
      if (!r.success) reportError('Client Report failed', r.error || 'unknown error');
      else { toast({ title: 'Client Report generated', description: 'Available in Documents.' }); setSection('documents'); }
      await load();
    } finally {
      if (poll) clearInterval(poll);
      setLiveStatus('');
      setCrBusy(false);
    }
  };

  const refreshCrAttachments = React.useCallback(async () => {
    if (!selectedProjectId) return;
    const r = await wsCrListAttachments({ projectId: selectedProjectId, runId: run?.id });
    if (r.success && Array.isArray(r.attachments)) setCrAttachments(r.attachments as any);
  }, [selectedProjectId, run?.id]);

  const uploadCrFile = async (file: File) => {
    if (!selectedProjectId) { reportError('Upload', 'No active project.'); return; }
    if (file.size > 10 * 1024 * 1024) { reportError('Upload', `${file.name} is ${Math.round(file.size / 1024 / 1024)}MB — limit is 10MB.`); return; }
    setCrUploading(true);
    setLiveStatus(`uploading ${file.name}`);
    try {
      const r = await wsCrUploadAttachment({ projectId: selectedProjectId, runId: run?.id, file });
      if (!r.success) {
        reportError('Upload failed', r.error || 'unknown error');
      } else if (r.parse_status && r.parse_status !== 'ok') {
        toast({ title: 'Uploaded with a parse warning', description: `${file.name}: ${r.parse_status}${r.parse_note ? ` — ${r.parse_note}` : ''}` });
      } else {
        toast({ title: 'Attachment uploaded', description: file.name });
      }
      await refreshCrAttachments();
    } finally {
      setCrUploading(false);
      setLiveStatus('');
    }
  };

  const removeCrAttachment = async (attachmentId: string) => {
    if (!selectedProjectId) return;
    const r = await wsCrRemoveAttachment({ projectId: selectedProjectId, attachmentId });
    if (!r.success) reportError('Could not remove attachment', r.error || 'unknown error');
    await refreshCrAttachments();
  };

  // Load attachments when the run loads or changes
  React.useEffect(() => { refreshCrAttachments(); }, [refreshCrAttachments]);

  if (!selectedProjectId) {
    return <div style={{ padding: 40, color: 'rgba(180,190,205,0.7)' }}>Select a project to open its workspace.</div>;
  }

  const navItems: Array<{ id: Section; label: string; icon: any; count?: number }> = [
    { id: 'pipeline', label: 'Deep Steps', icon: Activity, count: steps.length },
    { id: 'panel', label: 'Panel', icon: Users, count: panel ? 1 : 0 },
    { id: 'pillars', label: 'Pillars', icon: FlaskConical, count: reports.length },
    { id: 'documents', label: 'Documents', icon: FileText, count: steps.length + (panel ? 1 : 0) + reports.length },
  ];

  // Cover-page metadata shared by every export from this run.
  const exportMetaBase = {
    project: selectedProject?.name || undefined,
    goal: run?.goal || undefined,
  };
  const exportReport = (title: string, kind: string, body: string, generatedAt?: string) =>
    downloadStakeholderReport(body || '', { title: humanTitle(title), kind, ...exportMetaBase, generatedAt });
  const openReport = (title: string, kind: string, body: string, generatedAt?: string) =>
    openStakeholderReport(body || '', { title: humanTitle(title), kind, ...exportMetaBase, generatedAt });

  return (
    <div style={{ minHeight: '100vh', background: '#0a0b12', color: 'rgba(225,228,238,0.95)', padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(150,160,180,0.6)', fontWeight: 700 }}>S.E.A.S.O.N · Quantum Intelligence</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 2px' }}>Workspace</h1>
        <div style={{ fontSize: 12, color: 'rgba(150,160,180,0.7)' }}>
          {run ? <>Run status: <span style={{ color: CYAN }}>{run.status}</span>{run.goal ? ` · goal: ${run.goal}` : ''}</> : 'No run yet — start one to gather verified evidence.'}
        </div>
      </div>

      {/* Flow ribbon — shows the connected pipeline → panel → pillars → docs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {navItems.map((n, i) => {
          const Icon = n.icon;
          const active = section === n.id;
          return (
            <React.Fragment key={n.id}>
              <button onClick={() => setSection(n.id)} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${active ? 'hsla(186 80% 55% / 0.5)' : 'rgba(160,160,180,0.18)'}`,
                background: active ? 'hsla(186 80% 55% / 0.12)' : 'transparent',
                color: active ? CYAN : 'rgba(190,200,215,0.85)', fontWeight: 700, fontSize: 12.5,
              }}>
                <Icon size={14} /> {n.label}
                {n.count !== undefined && n.count > 0 && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'rgba(160,160,180,0.18)' }}>{n.count}</span>}
              </button>
              {i < navItems.length - 1 && <ArrowRight size={13} style={{ color: 'rgba(120,130,150,0.5)' }} />}
            </React.Fragment>
          );
        })}
      </div>

      {busy && (
        <div style={{ ...card, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, borderColor: 'hsla(186 80% 55% / 0.3)' }}>
          <Loader2 size={15} className="animate-spin" style={{ color: CYAN }} />
          <span style={{ fontSize: 12.5 }}>{busy}…</span>
        </div>
      )}

      {lastError && (
        <div style={{ ...card, marginBottom: 16, borderColor: 'hsla(0 70% 55% / 0.45)', background: 'linear-gradient(180deg, hsla(0 70% 55% / 0.08), rgba(15,16,24,0.7))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'hsl(0 70% 70%)', marginBottom: 4 }}>{lastError.where}</div>
              <div style={{ fontSize: 12, color: 'rgba(225,228,238,0.85)', lineHeight: 1.5 }}>{lastError.message}</div>
            </div>
            <button onClick={() => setLastError(null)} style={{ ...iconBtn(), borderColor: 'hsla(0 70% 55% / 0.3)' }} title="Dismiss"><X size={12} /></button>
          </div>
        </div>
      )}

      {/* ── SECTION: DEEP STEPS ── */}
      {section === 'pipeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...card }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Configure the run</div>
                <div style={{ fontSize: 11.5, color: 'rgba(150,160,180,0.7)', marginTop: 2 }}>Pick one or more goals (or a custom goal). The goal configures which deep steps run and at what depth — and what the panel discusses.</div>
              </div>
              <button onClick={() => setShowPicker((v) => !v)} style={{ ...iconBtn(), width: 'auto', padding: '6px 12px', gap: 5, display: 'flex' }}>
                {showPicker ? 'Hide' : (selectedGoals.length || customLabel ? 'Edit goals' : 'Pick goals')}
              </button>
            </div>

            {/* selected-goal summary chips */}
            {(selectedGoals.length > 0 || customLabel) && !showPicker && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {selectedGoals.map((g) => <span key={g} style={chip(true)}>{catalog?.goals?.find((x: any) => x.id === g)?.label || g}</span>)}
                {customLabel && <span style={chip(true)}>{customLabel}</span>}
              </div>
            )}

            {/* the picker */}
            {showPicker && catalog && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(150,160,180,0.6)', marginBottom: 8 }}>Goals (select one or more)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                  {catalog.goals.map((g: any) => {
                    const on = selectedGoals.includes(g.id);
                    const needCount = Array.isArray(g.needs) ? g.needs.length : 0;
                    // Resolve step labels from the catalog's step_defs for tooltip
                    const stepDefs: any[] = catalog.steps || [];
                    const needLabels: string[] = (g.needs || []).map((k: string) => {
                      const def = stepDefs.find((s: any) => s.key === k);
                      return def?.label || k;
                    });
                    return (
                      <button key={g.id} onClick={() => toggleGoal(g.id)}
                        title={needLabels.length ? `Steps: ${needLabels.join(', ')}` : ''}
                        style={{
                          textAlign: 'left', padding: 10, borderRadius: 9, cursor: 'pointer',
                          border: `1px solid ${on ? 'hsla(186 80% 55% / 0.5)' : 'rgba(160,160,180,0.18)'}`,
                          background: on ? 'hsla(186 80% 55% / 0.1)' : 'transparent', color: 'inherit',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: on ? CYAN : 'inherit' }}>{on ? '✓ ' : ''}{g.label}</div>
                          {needCount > 0 && (
                            <span style={{
                              fontSize: 9.5, padding: '2px 6px', borderRadius: 4,
                              background: on ? 'hsla(186 80% 55% / 0.2)' : 'rgba(160,160,180,0.15)',
                              color: on ? CYAN : 'rgba(170,180,195,0.8)', fontWeight: 700, flexShrink: 0,
                            }}>{needCount} steps</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'rgba(160,170,185,0.7)', marginTop: 3 }}>{g.description}</div>
                        {needLabels.length > 0 && (
                          <div style={{ fontSize: 9.5, color: 'rgba(140,150,165,0.65)', marginTop: 4, lineHeight: 1.45 }}>
                            {needLabels.slice(0, 4).join(' · ')}{needLabels.length > 4 ? ` · +${needLabels.length - 4} more` : ''}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: 10 }}>
                  <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="…or name a custom goal"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(160,160,180,0.2)', color: 'inherit', fontSize: 12 }} />
                </div>

                {/* computed config: steps + dependencies */}
                {config && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(150,160,180,0.6)', marginBottom: 8 }}>Computed run — steps</div>
                    {/* Scope summary: how many of total steps the selected goals pull in */}
                    {(() => {
                      const enabled = config.steps.filter((s: any) => s.enabled).length;
                      const total = config.steps.length;
                      return (
                        <div style={{ fontSize: 11.5, color: 'rgba(180,190,205,0.85)', marginBottom: 10, padding: '8px 10px', background: 'rgba(186, 230, 240, 0.04)', borderRadius: 5, border: '1px solid hsla(186 80% 55% / 0.15)' }}>
                          {enabled} of {total} steps will run based on the selected goal{selectedGoals.length === 1 ? '' : 's'}. Click any step to toggle it — useful if you want to force a step the goal didn't pull in (e.g. add trajectory to a ranking run), or skip a step you don't need this time.
                        </div>
                      );
                    })()}
                    {config.steps.map((s: any) => (
                      <div key={s.key} onClick={() => toggleStep(s.key)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${s.enabled ? CYAN : 'rgba(160,160,180,0.35)'}`, background: s.enabled ? 'hsla(186 80% 55% / 0.25)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: CYAN, flexShrink: 0 }}>{s.enabled ? '✓' : ''}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: s.enabled ? 'rgba(225,228,238,0.95)' : 'rgba(150,160,180,0.55)', textDecoration: s.enabled ? 'none' : 'line-through' }}>{s.label}</span>
                        <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: 'rgba(160,160,180,0.15)', color: 'rgba(170,180,195,0.8)', opacity: s.enabled ? 1 : 0.5 }}>{s.depth}</span>
                        {!s.enabled && (
                          <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: 'rgba(160,160,180,0.08)', color: 'rgba(150,160,180,0.55)', fontStyle: 'italic' }}>not in goal scope — click to add</span>
                        )}
                      </div>
                    ))}
                    {/* dependency surfacing */}
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(150,160,180,0.6)', margin: '12px 0 6px' }}>Data sources</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {config.dependencies.map((d: any) => (
                        <span key={d.source} title={d.activation_note || ''} style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                          background: d.satisfied ? 'hsla(152 70% 50% / 0.12)' : 'hsla(38 90% 55% / 0.12)',
                          color: d.satisfied ? 'hsl(152 70% 62%)' : 'hsl(38 90% 62%)',
                          border: `1px solid ${d.satisfied ? 'hsla(152 70% 50% / 0.3)' : 'hsla(38 90% 55% / 0.35)'}`,
                        }}>{d.satisfied ? '✓' : '⚠'} {d.label}</span>
                      ))}
                    </div>
                    {config.dependencies.some((d: any) => !d.satisfied) && (
                      <div style={{ fontSize: 10.5, color: 'hsl(38 90% 65%)', marginTop: 8, lineHeight: 1.5 }}>
                        ⚠ Some sources need activation. The run still works on existing tools — questions needing the missing source will be flagged as unverified rather than answered. {config.dependencies.filter((d: any) => !d.satisfied).map((d: any) => d.activation_note).filter(Boolean).join(' ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button onClick={startRun} disabled={!!busy} style={primaryBtn(!!busy)}>
                <Play size={13} /> {run ? 'New run' : 'Start run'}
              </button>
            </div>
          </div>

          {steps.length === 0 ? (
            <div style={{ ...card, color: 'rgba(150,160,180,0.7)', fontSize: 12.5 }}>No evidence yet. Configure goals above and click <strong style={{ color: CYAN }}>Start run</strong>.</div>
          ) : steps.map((s) => (
            <StepCard key={s.id} step={s} onExport={exportReport} onOpen={openReport} />
          ))}
          {steps.length > 0 && (
            <div style={{ ...card, borderColor: 'hsla(38 90% 55% / 0.35)', background: 'linear-gradient(180deg, hsla(38 90% 55% / 0.05), rgba(15,16,24,0.7))', marginTop: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={13} style={{ color: 'hsl(38 90% 60%)' }} /> Your input for the panel (optional)
              </div>
              <div style={{ fontSize: 11, color: 'rgba(170,180,195,0.7)', marginBottom: 8 }}>
                Add target keywords, scenarios, context, or your own data BEFORE convening the panel. Your input goes into the panel's prompt — they react to it, build scenarios around it, and assign investigation questions accordingly. Leave blank if the verified evidence above is enough.
              </div>
              <textarea
                value={manavInput} onChange={(e) => setManavInput(e.target.value)}
                placeholder="e.g. Target keywords: 'kids bunk beds', 'wooden bunk beds for adults'. Client cares most about the bunk-bed range. Scenarios to test: pushing for featured snippets vs. building topic clusters. Competitor data I have…"
                style={{ width: '100%', minHeight: 90, padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(160,160,180,0.2)', color: 'inherit', fontSize: 12, resize: 'vertical' }}
              />
              <button onClick={() => runPanel(1)} disabled={!!busy} style={{ ...primaryBtn(!!busy), alignSelf: 'flex-start', marginTop: 10 }}>
                <Users size={13} /> Convene panel (round 1) {manavInput.trim() ? 'with my input' : ''} <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── SECTION: PANEL (the gate) ── */}
      {section === 'panel' && (
        <PanelSection
          panel={panel} busy={busy}
          onRunRound1={() => runPanel(1)} onRunRound2={() => runPanel(2)}
          onRelease={release}
          manavInput={manavInput} setManavInput={setManavInput}
          onExport={exportReport} onOpen={openReport}
        />
      )}

      {/* ── SECTION: PILLARS (scientists) ── */}
      {section === 'pillars' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...card }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Pillar findings</div>
                <div style={{ fontSize: 11.5, color: 'rgba(150,160,180,0.7)', marginTop: 2 }}>
                  Each pillar answers its assigned panel questions with deep, fully-sourced data. {run?.status !== 'pillars' && panel ? 'Release the panel (Panel tab) to feed them questions — or solve directly.' : 'You can also run any pillar directly (Path B).'}
                </div>
              </div>
              {queue ? (
                <button onClick={cancelAll} style={{ ...primaryBtn(false), background: 'hsla(0 70% 55% / 0.12)', borderColor: 'hsla(0 70% 55% / 0.4)', color: 'hsl(0 70% 65%)' }}>
                  <X size={13} /> Stop
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  {totalEscalations > 0 && (
                    <button onClick={takeEscalationsToPanel} disabled={!!busy} style={{ ...primaryBtn(!!busy), background: 'hsla(38 90% 55% / 0.12)', borderColor: 'hsla(38 90% 55% / 0.4)', color: 'hsl(38 90% 65%)' }} title={`${totalEscalations} question(s) flagged for the panel across solved pillars`}>
                      <Users size={13} /> Take {totalEscalations} to panel
                    </button>
                  )}
                  <button onClick={solveAll} disabled={!!pillarBusy} style={primaryBtn(!!pillarBusy)}>
                    <FlaskConical size={13} /> {pillarBusy ? 'Solving…' : 'Solve all'}
                  </button>
                </div>
              )}
            </div>
            {queue && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: 'rgba(150,160,180,0.7)', marginBottom: 8 }}>
                  {queue.done.length} done · {queue.running ? '1 running' : 'idle'} · {queue.pending.length} pending
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {queue.done.map((p) => (
                    <span key={p} style={{ ...chip(false), color: 'hsl(152 70% 65%)', borderColor: 'hsla(152 70% 50% / 0.35)', background: 'hsla(152 70% 50% / 0.12)' }}>✓ {PILLAR_LABEL[p]}</span>
                  ))}
                  {queue.running && (
                    <span style={{ ...chip(true), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Loader2 size={11} className="animate-spin" /> {PILLAR_LABEL[queue.running]}
                    </span>
                  )}
                  {queue.pending.map((p) => (
                    <span key={p} style={chip(false)}>{PILLAR_LABEL[p]}</span>
                  ))}
                </div>
                {liveStatus && (
                  <div style={{ fontSize: 11, color: CYAN, marginTop: 10, fontFamily: 'SF Mono, Menlo, monospace' }}>{liveStatus}</div>
                )}
              </div>
            )}
            {!queue && run?.pillar_status && run.pillar_status !== 'CANCEL_REQUESTED' && (
              <div style={{ fontSize: 11, color: CYAN, marginTop: 8 }}>Last: {run.pillar_status}</div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
            {PILLARS.map((p) => {
              const rep = reports.find((r) => r.pillar === p);
              return (
                <div key={p} style={{ ...card, padding: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{PILLAR_LABEL[p]}</div>
                  {rep ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'hsla(152 70% 50% / 0.18)', color: 'hsl(152 70% 60%)' }}>✓ SOLVED</span>
                        {Array.isArray(rep.escalations_json) && rep.escalations_json.length > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'hsla(38 90% 55% / 0.15)', color: 'hsl(38 90% 65%)' }} title="Questions for the panel">
                            {rep.escalations_json.length} for panel
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'rgba(170,180,195,0.85)', margin: '8px 0' }}>{rep.title}</div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <button onClick={() => setSection('documents')} style={linkBtn()}>Read in Documents →</button>
                        <button onClick={() => solve(p)} disabled={pillarBusy === p} style={{ ...linkBtn(), color: 'rgba(180,190,205,0.7)' }} title="Run this pillar again (replaces the existing report)">
                          {pillarBusy === p ? 'Re-solving…' : 'Re-solve'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <button onClick={() => solve(p)} disabled={pillarBusy === p} style={{ ...primaryBtn(pillarBusy === p), width: '100%', justifyContent: 'center', marginTop: 4 }}>
                      {pillarBusy === p ? <><Loader2 size={12} className="animate-spin" /> Solving…</> : <><FlaskConical size={12} /> Solve</>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Client Report — specialist communication pillar, separate card */}
          <div style={{ ...card, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Send size={14} style={{ color: CYAN }} /> Client Report
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 4, background: 'hsla(186 80% 55% / 0.12)', color: CYAN, letterSpacing: '0.05em' }}>SPECIALIST</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'rgba(150,160,180,0.7)', marginTop: 4 }}>
                  Turns the workspace's verified evidence into a client-ready report shaped to what THIS client wants. Source-traced, no invention.
                </div>
              </div>
              <button onClick={() => setCrOpen(!crOpen)} style={iconBtn()} title={crOpen ? 'Hide form' : 'Show form'}>
                <ChevronRight size={14} style={{ transform: crOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
              </button>
            </div>

            {crOpen && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Report scoping mode — strict vs comprehensive */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(170,180,195,0.85)', display: 'block', marginBottom: 6 }}>
                    Report mode
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { v: 'strict' as const, title: 'Strict', desc: 'Context + attachments only. Workspace is locked away. Use when the client asked for something specific and you do not want scope creep.' },
                      { v: 'comprehensive' as const, title: 'Comprehensive', desc: 'Context + attachments + full workspace analysis used freely to fulfil what your context asks for. Use for analytical reports, monthly reviews, audit recaps.' },
                    ].map(opt => {
                      const active = crMode === opt.v;
                      return (
                        <button
                          key={opt.v}
                          onClick={() => setCrMode(opt.v)}
                          style={{
                            flex: '1 1 240px', textAlign: 'left', padding: '10px 12px', borderRadius: 6,
                            border: active ? `1px solid ${CYAN}` : '1px solid hsla(220 14% 30% / 0.5)',
                            background: active ? 'hsla(186 80% 55% / 0.10)' : 'rgba(15,16,24,0.4)',
                            color: 'rgba(225,228,238,0.95)', cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: active ? CYAN : 'rgba(225,228,238,0.95)', marginBottom: 3 }}>
                            {opt.title}
                          </div>
                          <div style={{ fontSize: 11, lineHeight: 1.45, color: 'rgba(160,170,185,0.85)' }}>
                            {opt.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(170,180,195,0.85)', display: 'block', marginBottom: 6 }}>
                    Your context for this report <span style={{ color: 'hsl(0 70% 65%)', textTransform: 'none', letterSpacing: 0, fontWeight: 400, marginLeft: 4 }}>required</span>
                  </label>
                  <textarea
                    value={crContext}
                    onChange={(e) => setCrContext(e.target.value)}
                    placeholder={`Write what THIS client wants in THIS report. Examples:
- Client name and main contact.
- Send-by date.
- Tone (e.g. practical, non-technical; or technical and detailed).
- Format (e.g. executive summary + 3 priorities + next month's plan).
- Emphasis (specific topics the client has been asking about).
- Leave out (things already covered elsewhere; sensitive topics; etc.).`}
                    rows={8}
                    style={{
                      width: '100%', padding: 10, fontSize: 12, lineHeight: 1.5,
                      background: 'rgba(15,16,24,0.6)', border: '1px solid hsla(220 14% 30% / 0.5)',
                      borderRadius: 6, color: 'rgba(225,228,238,0.95)', fontFamily: 'inherit', resize: 'vertical',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(170,180,195,0.85)', display: 'block', marginBottom: 6 }}>
                    Reference material (optional)
                  </label>

                  {/* File upload — drag/drop or click to pick. Multiple files supported. */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const files = Array.from(e.dataTransfer.files || []);
                      for (const f of files) await uploadCrFile(f);
                    }}
                    style={{
                      padding: '14px 12px', border: '1px dashed hsla(186 80% 55% / 0.35)',
                      borderRadius: 6, background: 'rgba(186, 230, 240, 0.02)', marginBottom: 10,
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <Upload size={16} style={{ color: CYAN, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 11.5, color: 'rgba(180,190,205,0.85)', lineHeight: 1.45 }}>
                      Drop files here, or pick — PDF, DOCX, XLSX, CSV. Max 10MB each.
                      <div style={{ fontSize: 10.5, color: 'rgba(150,160,180,0.6)', marginTop: 2 }}>
                        PDFs are passed to the model natively; DOCX/XLSX/CSV are parsed server-side into readable text.
                      </div>
                    </div>
                    <label style={{
                      fontSize: 11, padding: '6px 12px', borderRadius: 5,
                      border: '1px solid hsla(186 80% 55% / 0.4)', color: CYAN, cursor: 'pointer',
                      background: crUploading ? 'rgba(150,150,150,0.1)' : 'transparent', opacity: crUploading ? 0.6 : 1,
                    }}>
                      {crUploading ? 'Uploading…' : 'Pick file'}
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.docx,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                        disabled={crUploading}
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          for (const f of files) await uploadCrFile(f);
                          e.target.value = '';  // reset so re-picking same file fires onChange
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>

                  {/* Attached files list */}
                  {crAttachments.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                      {crAttachments.map(a => {
                        const sizeKb = Math.round(a.size_bytes / 1024);
                        const sizeLabel = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)}MB` : `${sizeKb}KB`;
                        const ok = a.parse_status === 'ok';
                        return (
                          <div key={a.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 5,
                            border: ok ? '1px solid hsla(152 70% 50% / 0.18)' : '1px solid hsla(38 90% 55% / 0.25)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, flex: 1, minWidth: 0 }}>
                              <Paperclip size={11} style={{ color: ok ? 'hsl(152 70% 60%)' : 'hsl(38 90% 65%)', flexShrink: 0 }} />
                              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.file_name}</span>
                              <span style={{ color: 'rgba(150,160,180,0.55)', fontSize: 10.5 }}>{sizeLabel}</span>
                              {!ok && <span style={{ color: 'hsl(38 90% 65%)', fontSize: 10.5 }} title={a.parse_note || ''}>· {a.parse_status}</span>}
                            </div>
                            <button onClick={() => removeCrAttachment(a.id)} style={{ ...iconBtn(), padding: 4 }} title="Remove">
                              <X size={11} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Paste textarea — alternative or supplement to file upload */}
                  <textarea
                    value={crReferenceText}
                    onChange={(e) => setCrReferenceText(e.target.value)}
                    placeholder={`...or paste reference content directly here (plain text or markdown). Leave blank if uploading files only.`}
                    rows={5}
                    style={{
                      width: '100%', padding: 10, fontSize: 12, lineHeight: 1.5,
                      background: 'rgba(15,16,24,0.6)', border: '1px solid hsla(220 14% 30% / 0.5)',
                      borderRadius: 6, color: 'rgba(225,228,238,0.95)', fontFamily: 'inherit', resize: 'vertical',
                    }}
                  />

                  {/* Mode selector — applies to ALL reference material (uploaded + pasted) */}
                  {(crReferenceText.trim().length > 0 || crAttachments.length > 0) && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10.5, color: 'rgba(150,160,180,0.7)' }}>Use reference material as:</span>
                      {[
                        { v: 'template' as const, label: 'Structural template' },
                        { v: 'data' as const, label: 'Additional data' },
                        { v: 'both' as const, label: 'Both' },
                      ].map(opt => (
                        <button
                          key={opt.v}
                          onClick={() => setCrReferenceMode(opt.v)}
                          style={{
                            fontSize: 10.5, padding: '4px 10px', borderRadius: 4,
                            border: crReferenceMode === opt.v ? `1px solid ${CYAN}` : '1px solid hsla(220 14% 30% / 0.5)',
                            background: crReferenceMode === opt.v ? 'hsla(186 80% 55% / 0.15)' : 'transparent',
                            color: crReferenceMode === opt.v ? CYAN : 'rgba(180,190,205,0.8)',
                            cursor: 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 10.5, color: 'rgba(150,160,180,0.6)', flex: 1 }}>
                    Re-solving creates a new report each time — earlier versions stay in Documents so you can compare drafts.
                  </div>
                  <button onClick={solveClientReport} disabled={crBusy || !crContext.trim()} style={primaryBtn(crBusy || !crContext.trim())}>
                    {crBusy ? <><Loader2 size={13} className="animate-spin" /> Generating…</> : <><Send size={13} /> Generate report</>}
                  </button>
                </div>
                {crBusy && liveStatus && (
                  <div style={{ fontSize: 11, color: CYAN, fontFamily: 'SF Mono, Menlo, monospace' }}>{liveStatus}</div>
                )}
              </div>
            )}

            {/* Show existing client reports inline so the operator can see what's been generated */}
            {reports.filter(r => r.pillar === 'client_report').length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid hsla(220 14% 30% / 0.3)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(150,160,180,0.6)', marginBottom: 8 }}>
                  Generated client reports in this run ({reports.filter(r => r.pillar === 'client_report').length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {reports.filter(r => r.pillar === 'client_report').map((r) => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 5 }}>
                      <div style={{ fontSize: 11.5 }}>
                        <span style={{ fontWeight: 700 }}>{r.title}</span>
                        <span style={{ color: 'rgba(150,160,180,0.5)', marginLeft: 8 }}>{new Date(r.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <button onClick={() => setSection('documents')} style={linkBtn()}>Open →</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SECTION: DOCUMENTS ── */}
      {section === 'documents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...card, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(150,160,180,0.6)' }}>Run folder</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>{run?.goal || 'No run'}</div>
            {run?.created_at && <div style={{ fontSize: 10.5, color: 'rgba(150,160,180,0.6)', marginTop: 2 }}>{new Date(run.created_at).toLocaleString()} · {steps.length} evidence · {panel ? '1 panel' : '0 panel'} · {reports.length} solutions</div>}
          </div>
          <SectionHeading title="Step evidence reports" />
          {steps.length === 0 && <Empty />}
          {steps.map((s) => {
            const stepName: Record<string, string> = {
              gsc_visibility: "GSC Visibility & Indexation", competitor_intel: "Competitor Intelligence",
              query_landscape: "Query Landscape & Untapped", onpage_audit: "On-Page Audit",
              core_web_vitals: "Core Web Vitals (field)", internal_link_graph: "Internal Link Graph",
              engagement_value: "Engagement & Conversion Value", trajectory: "Trajectory",
            };
            const dateStr = new Date(s.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
            const label = `${stepName[s.step_key] || s.step_key} — Evidence · ${dateStr}`;
            return <DocCard key={s.id} title={label} body={s.report_md} kind="Evidence Report" onExport={exportReport} onOpen={openReport} />;
          })}
          <SectionHeading title="Panel discussion" />
          {!panel && <Empty />}
          {panel && <DocCard
            title={`Panel Discussion — Round ${panel.round} · ${new Date(panel.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
            body={panel.document_md} kind="Panel Discussion" onExport={exportReport} onOpen={openReport} />}
          <SectionHeading title="Pillar findings" />
          {reports.length === 0 && <Empty />}
          {reports.map((r) => {
            const label = r.title || `${PILLAR_LABEL[r.pillar] || r.pillar} — Findings · ${new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
            return <DocCard key={r.id} title={label} body={r.body_md} kind="Findings & Recommendations" onExport={exportReport} onOpen={openReport} />;
          })}
        </div>
      )}
    </div>
  );
}

/* ─── sub-components ─── */
function StepCard({ step, onExport, onOpen }: { step: any; onExport: (title: string, kind: string, body: string, generatedAt?: string) => void; onOpen: (title: string, kind: string, body: string, generatedAt?: string) => void }) {
  const [open, setOpen] = useState(false);
  const rawStatus = (step.status || 'done').toLowerCase();
  const isFailed = rawStatus.startsWith('failed');
  const isSkipped = rawStatus === 'skipped';
  const badge = isFailed ? 'FAILED' : isSkipped ? 'SKIPPED' : 'DONE';
  const badgeColor = isFailed
    ? { bg: 'hsla(0 70% 55% / 0.18)', fg: 'hsl(0 70% 65%)' }
    : isSkipped
    ? { bg: 'rgba(160,160,180,0.18)', fg: 'rgba(180,190,205,0.85)' }
    : { bg: 'hsla(152 70% 50% / 0.18)', fg: 'hsl(152 70% 60%)' };
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={14} style={{ color: isFailed ? 'hsl(0 70% 65%)' : CYAN }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{step.step_key.replace(/_/g, ' ')}</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 4, background: badgeColor.bg, color: badgeColor.fg }}>{badge}</span>
          {(step.version || 1) > 1 && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 4, background: 'hsla(186 80% 55% / 0.15)', color: CYAN }} title={`Extended by ${step.triggered_by || 'panel'}`}>v{step.version}</span>
          )}
          {isFailed && <span style={{ fontSize: 10, color: 'rgba(190,200,215,0.7)', marginLeft: 4 }} title={step.status}>{step.status.replace(/^failed:\s*/, '').slice(0, 80)}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={(e) => { e.stopPropagation(); onOpen(step.step_key, 'Deep Step Evidence', step.report_md, step.created_at); }} style={iconBtn()} title="Open as branded report"><ExternalLink size={12} /></button>
          <button onClick={(e) => { e.stopPropagation(); onExport(step.step_key, 'Deep Step Evidence', step.report_md, step.created_at); }} style={iconBtn()} title="Download branded report"><Download size={12} /></button>
          <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s', color: 'rgba(150,160,180,0.7)' }} />
        </div>
      </div>
      {(step.worth_deeper_json || []).length > 0 && !open && (
        <div style={{ fontSize: 10.5, color: 'rgba(150,160,180,0.65)', marginTop: 6 }}>{(step.worth_deeper_json || []).length} item(s) flagged for the panel.</div>
      )}
      {open && (
        <div style={{ marginTop: 12 }}>
          {Array.isArray(step.all_versions) && step.all_versions.length > 1 && (
            <div style={{ fontSize: 10.5, color: 'rgba(150,160,180,0.7)', marginBottom: 10, padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
              <span style={{ fontWeight: 700, color: CYAN }}>Evidence history:</span>{' '}
              {step.all_versions.map((v: any, i: number) => (
                <span key={v.id} style={{ marginLeft: i === 0 ? 6 : 4 }}>
                  v{v.version}{v.triggered_by && v.triggered_by !== 'initial' ? ` · ${v.triggered_by}` : ''} · {new Date(v.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  {i < step.all_versions.length - 1 && <span style={{ color: 'rgba(150,160,180,0.4)', margin: '0 6px' }}>·</span>}
                </span>
              ))}
            </div>
          )}
          <div style={{ maxHeight: 500, overflowY: 'auto', paddingRight: 4 }}><SimpleMarkdown text={step.report_md || ''} /></div>
        </div>
      )}
    </div>
  );
}

function PanelSection({ panel, busy, onRunRound1, onRunRound2, onRelease, manavInput, setManavInput, onExport, onOpen }: any) {
  if (!panel) {
    return (
      <div style={{ ...card, color: 'rgba(150,160,180,0.75)', fontSize: 12.5 }}>
        No panel discussion yet. Gather evidence in <strong style={{ color: CYAN }}>Deep Steps</strong> first, then{' '}
        <button onClick={onRunRound1} disabled={!!busy} style={{ ...linkBtn(), fontWeight: 700 }}>convene the panel</button>.
      </div>
    );
  }
  const questions: any[] = panel.role_questions_json || [];
  const byRole: Record<string, any[]> = {};
  questions.forEach((q) => { (byRole[q.role] = byRole[q.role] || []).push(q); });
  const scenarios: any[] = panel.scenarios_json || [];
  const released = panel.status === 'released';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...card, borderColor: 'hsla(186 80% 55% / 0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Panel discussion — round {panel.round}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onOpen(`Panel Discussion — Round ${panel.round}`, 'Panel Discussion', panel.document_md, panel.created_at)} style={iconBtn()} title="Open as branded report"><ExternalLink size={12} /></button>
            <button onClick={() => onExport(`Panel Discussion — Round ${panel.round}`, 'Panel Discussion', panel.document_md, panel.created_at)} style={iconBtn()} title="Download branded report"><Download size={12} /></button>
          </div>
        </div>
        {panel.headline && <div style={{ fontSize: 12.5, color: 'rgba(190,200,215,0.9)', marginTop: 8, fontStyle: 'italic' }}>{panel.headline}</div>}
      </div>

      {/* Scenarios */}
      <div style={card}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Scenarios the panel built ({scenarios.length})</div>
        {scenarios.map((s, i) => (
          <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid rgba(160,160,180,0.1)' : 'none' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: CYAN }}>{i + 1}. {s.title}</div>
            <div style={{ fontSize: 11.5, color: 'rgba(180,190,205,0.85)', marginTop: 3 }}>{s.description}</div>
            {s.traffic_lever && <div style={{ fontSize: 10.5, color: 'rgba(150,160,180,0.7)', marginTop: 3 }}>Lever: {s.traffic_lever}</div>}
          </div>
        ))}
      </div>

      {/* Per-role questions — what each role wants from the scientists */}
      <div style={card}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>What each role is asking the scientists</div>
        {Object.keys(byRole).map((role) => (
          <div key={role} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: CYAN, marginBottom: 4 }}>{ROLE_LABEL[role] || role}</div>
            {byRole[role].map((q, i) => (
              <div key={i} style={{ fontSize: 11.5, color: 'rgba(185,195,210,0.9)', marginBottom: 4, lineHeight: 1.5 }}>
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(160,160,180,0.15)', marginRight: 6 }}>{PILLAR_LABEL[q.pillar] || q.pillar}</span>
                {q.question}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Manav's gate */}
      <div style={{ ...card, borderColor: 'hsla(38 90% 55% / 0.35)', background: 'linear-gradient(180deg, hsla(38 90% 55% / 0.05), rgba(15,16,24,0.7))' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={13} style={{ color: 'hsl(38 90% 60%)' }} /> Your input (Manav)
        </div>
        <div style={{ fontSize: 11, color: 'rgba(170,180,195,0.7)', marginBottom: 8 }}>
          Add scenarios, target keywords, context, corrections, or your own data. Your input becomes part of the panel's prompt for the next round it runs — so the panel can react to it, build scenarios around it, and ask the pillars to investigate it. Then either re-run the panel with your input (round {(panel.round || 1) + 1}), or release directly to the pillars.
        </div>
        <textarea
          value={manavInput} onChange={(e) => setManavInput(e.target.value)}
          placeholder="e.g. Target keywords for this run: 'kids bunk beds', 'wooden bunk beds for adults'. We just launched 5 new product pages not in this set. The client cares most about the bunk-bed range. Here's competitor data I have…"
          style={{ width: '100%', minHeight: 90, padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(160,160,180,0.2)', color: 'inherit', fontSize: 12, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={onRunRound2} disabled={!!busy || !manavInput.trim()} style={primaryBtn(!!busy || !manavInput.trim())}>
            <Users size={13} /> Re-run panel with my input (round {(panel.round || 1) + 1})
          </button>
          <button onClick={onRelease} disabled={!!busy} style={{ ...primaryBtn(!!busy), background: 'hsla(152 70% 45% / 0.15)', borderColor: 'hsla(152 70% 50% / 0.4)', color: 'hsl(152 70% 65%)' }}>
            <Send size={13} /> {released ? 'Released ✓ — re-send' : 'Release to pillars'} <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function DocCard({ title, body, kind, onExport, onOpen }: { title: string; body: string; kind: string; onExport: (t: string, k: string, b: string) => void; onOpen: (t: string, k: string, b: string) => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{(title || '').replace(/_/g, ' ')}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(body || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }} style={iconBtn()} title="Copy markdown">{copied ? <Check size={12} color="#34d399" /> : <Copy size={12} />}</button>
          <button onClick={(e) => { e.stopPropagation(); onOpen(title, kind, body); }} style={iconBtn()} title="Open as branded report"><ExternalLink size={12} /></button>
          <button onClick={(e) => { e.stopPropagation(); onExport(title, kind, body); }} style={iconBtn()} title="Download branded report"><Download size={12} /></button>
          <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s', color: 'rgba(150,160,180,0.7)' }} />
        </div>
      </div>
      {open && <div style={{ marginTop: 12, maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}><SimpleMarkdown text={body || '_No content_'} /></div>}
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(150,160,180,0.6)', marginTop: 6 }}>{title}</div>;
}
function Empty() { return <div style={{ fontSize: 11.5, color: 'rgba(120,130,150,0.6)' }}>Nothing here yet.</div>; }

function primaryBtn(disabled: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, border: '1px solid hsla(186 80% 55% / 0.4)', background: 'hsla(186 80% 55% / 0.12)', color: CYAN };
}
function iconBtn(): React.CSSProperties {
  return { width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid rgba(160,160,180,0.2)', background: 'transparent', color: 'rgba(200,210,225,0.8)' };
}
function linkBtn(): React.CSSProperties {
  return { background: 'none', border: 'none', color: CYAN, cursor: 'pointer', fontSize: 11, padding: 0 };
}
function chip(on: boolean): React.CSSProperties {
  return { fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 7, background: on ? 'hsla(186 80% 55% / 0.14)' : 'rgba(160,160,180,0.12)', color: on ? CYAN : 'rgba(180,190,205,0.8)', border: `1px solid ${on ? 'hsla(186 80% 55% / 0.35)' : 'rgba(160,160,180,0.2)'}` };
}
