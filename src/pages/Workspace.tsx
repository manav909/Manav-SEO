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
import {
  wsCreateRun, wsRunDeepSteps, wsRunPanel, wsReleaseToPillars, wsSolvePillar, wsGetRun,
  wsGoalCatalog, wsComposeConfig,
} from '@/components/pm/api';
import {
  Activity, Users, FlaskConical, FileText, Play, ChevronRight, Loader2,
  Send, Download, Copy, Check, ArrowRight, Sparkles,
} from 'lucide-react';

const PILLARS = ['visibility', 'query_opportunity', 'on_page_health', 'technical_performance', 'internal_links', 'engagement', 'monitoring'];
const PILLAR_LABEL: Record<string, string> = {
  visibility: 'Visibility', query_opportunity: 'Query Opportunity', on_page_health: 'On-Page Health',
  technical_performance: 'Technical Performance', internal_links: 'Internal Links', engagement: 'Engagement', monitoring: 'Monitoring',
};
const ROLE_LABEL: Record<string, string> = {
  client: 'Client', dms: 'Senior SEO', writer: 'Content Writer', brand: 'Brand', pm: 'PM', investor: 'Investor',
};

type Section = 'pipeline' | 'panel' | 'pillars' | 'documents';

const CYAN = 'hsl(186 80% 55%)';
const card: React.CSSProperties = { background: 'linear-gradient(180deg, rgba(26,27,39,0.9), rgba(15,16,24,0.7))', border: '1px solid rgba(160,160,180,0.15)', borderRadius: 12, padding: 16 };

function downloadMd(title: string, md: string) {
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${(title || 'document').replace(/[^a-z0-9-_]/gi, '_').slice(0, 80)}.md`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Workspace() {
  const { selectedProjectId } = useProject();
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

  /* ── lifecycle actions ── */
  const startRun = async () => {
    if (!selectedProjectId) return;
    if (!selectedGoals.length && !customLabel) { toast({ title: 'Pick a goal first', description: 'Select one or more goals (or name a custom goal) to configure the run.' }); setShowPicker(true); return; }
    const stepOverrides = (config?.steps || []).map((s: any) => ({ key: s.key, enabled: s.enabled, depth: s.depth }));
    setBusy('Creating run');
    const cr = await wsCreateRun({ projectId: selectedProjectId, goalIds: selectedGoals, customLabel: customLabel || undefined, stepOverrides });
    if (!cr.success || !cr.run_id) { toast({ title: 'Could not start run', description: cr.error, variant: 'destructive' }); setBusy(''); return; }
    setShowPicker(false);
    setBusy('Deep steps gathering verified evidence — full GSC + live-crawl + SerpAPI pass');
    const ds = await wsRunDeepSteps({ runId: cr.run_id, projectId: selectedProjectId });
    setBusy('');
    if (!ds.success) { toast({ title: 'Deep steps failed', description: ds.error, variant: 'destructive' }); }
    else { toast({ title: 'Evidence gathered', description: 'Step reports ready. Review, then run the panel.' }); }
    await load();
  };

  const runPanel = async (round: number) => {
    if (!run) return;
    setBusy(round === 1 ? 'Panel discussing the evidence (round 1)' : 'Panel re-discussing with your input (round 2)');
    const r = await wsRunPanel({ runId: run.id, projectId: selectedProjectId!, round, manavInput: round >= 2 ? manavInput : undefined });
    setBusy('');
    if (!r.success) toast({ title: 'Panel failed', description: r.error, variant: 'destructive' });
    else { toast({ title: `Panel round ${round} complete`, description: 'Review each role\'s questions, then add input or release to pillars.' }); setManavInput(''); }
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
    if (!r.success) toast({ title: `${PILLAR_LABEL[pillar]} failed`, description: r.error, variant: 'destructive' });
    else toast({ title: `${PILLAR_LABEL[pillar]} solved`, description: 'Report ready in Documents.' });
    await load();
  };

  if (!selectedProjectId) {
    return <div style={{ padding: 40, color: 'rgba(180,190,205,0.7)' }}>Select a project to open its workspace.</div>;
  }

  const navItems: Array<{ id: Section; label: string; icon: any; count?: number }> = [
    { id: 'pipeline', label: 'Deep Steps', icon: Activity, count: steps.length },
    { id: 'panel', label: 'Panel', icon: Users, count: panel ? 1 : 0 },
    { id: 'pillars', label: 'Pillars', icon: FlaskConical, count: reports.length },
    { id: 'documents', label: 'Documents', icon: FileText, count: steps.length + (panel ? 1 : 0) + reports.length },
  ];

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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                  {catalog.goals.map((g: any) => {
                    const on = selectedGoals.includes(g.id);
                    return (
                      <button key={g.id} onClick={() => toggleGoal(g.id)} style={{
                        textAlign: 'left', padding: 10, borderRadius: 9, cursor: 'pointer',
                        border: `1px solid ${on ? 'hsla(186 80% 55% / 0.5)' : 'rgba(160,160,180,0.18)'}`,
                        background: on ? 'hsla(186 80% 55% / 0.1)' : 'transparent', color: 'inherit',
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: on ? CYAN : 'inherit' }}>{on ? '✓ ' : ''}{g.label}</div>
                        <div style={{ fontSize: 10.5, color: 'rgba(160,170,185,0.7)', marginTop: 3 }}>{g.description}</div>
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
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(150,160,180,0.6)', marginBottom: 8 }}>Computed run — steps (toggle / shown depth)</div>
                    {config.steps.map((s: any) => (
                      <div key={s.key} onClick={() => toggleStep(s.key)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', opacity: s.enabled ? 1 : 0.45 }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${s.enabled ? CYAN : 'rgba(160,160,180,0.35)'}`, background: s.enabled ? 'hsla(186 80% 55% / 0.25)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: CYAN }}>{s.enabled ? '✓' : ''}</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                        <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: 'rgba(160,160,180,0.15)', color: 'rgba(170,180,195,0.8)' }}>{s.depth}</span>
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
            <StepCard key={s.id} step={s} />
          ))}
          {steps.length > 0 && (
            <button onClick={() => runPanel(1)} disabled={!!busy} style={{ ...primaryBtn(!!busy), alignSelf: 'flex-start' }}>
              <Users size={13} /> Convene panel (round 1) <ChevronRight size={13} />
            </button>
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
        />
      )}

      {/* ── SECTION: PILLARS (scientists) ── */}
      {section === 'pillars' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...card }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Pillar scientists</div>
            <div style={{ fontSize: 11.5, color: 'rgba(150,160,180,0.7)', marginTop: 2 }}>
              Each scientist solves its assigned panel questions with deep, fully-sourced data. {run?.status !== 'pillars' && panel ? 'Release the panel first (Panel tab) to feed them the questions — or solve directly below.' : 'You can also run any pillar directly (Path B) without the panel.'}
            </div>
            {run?.pillar_status && <div style={{ fontSize: 11, color: CYAN, marginTop: 8 }}>Working: {run.pillar_status}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
            {PILLARS.map((p) => {
              const rep = reports.find((r) => r.pillar === p);
              const implemented = p === 'visibility';   // proven slice
              return (
                <div key={p} style={{ ...card, padding: 14, opacity: implemented ? 1 : 0.55 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{PILLAR_LABEL[p]}</div>
                  {rep ? (
                    <>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'hsla(152 70% 50% / 0.18)', color: 'hsl(152 70% 60%)' }}>✓ SOLVED</span>
                      <div style={{ fontSize: 10.5, color: 'rgba(170,180,195,0.85)', margin: '8px 0' }}>{rep.title}</div>
                      <button onClick={() => setSection('documents')} style={linkBtn()}>Read in Documents →</button>
                    </>
                  ) : implemented ? (
                    <button onClick={() => solve(p)} disabled={pillarBusy === p} style={{ ...primaryBtn(pillarBusy === p), width: '100%', justifyContent: 'center', marginTop: 4 }}>
                      {pillarBusy === p ? <><Loader2 size={12} className="animate-spin" /> Solving…</> : <><FlaskConical size={12} /> Solve</>}
                    </button>
                  ) : (
                    <div style={{ fontSize: 10.5, color: 'rgba(150,160,180,0.6)', marginTop: 4 }}>Rolls out after Visibility is approved.</div>
                  )}
                </div>
              );
            })}
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
          {steps.map((s) => <DocCard key={s.id} title={s.step_key} body={s.report_md} />)}
          <SectionHeading title="Panel discussion" />
          {!panel && <Empty />}
          {panel && <DocCard title={`Panel — round ${panel.round}`} body={panel.document_md} />}
          <SectionHeading title="Pillar solutions" />
          {reports.length === 0 && <Empty />}
          {reports.map((r) => <DocCard key={r.id} title={r.title || r.pillar} body={r.body_md} />)}
        </div>
      )}
    </div>
  );
}

/* ─── sub-components ─── */
function StepCard({ step }: { step: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={14} style={{ color: CYAN }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{step.step_key.replace(/_/g, ' ')}</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 4, background: 'hsla(152 70% 50% / 0.18)', color: 'hsl(152 70% 60%)' }}>DONE</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={(e) => { e.stopPropagation(); downloadMd(step.step_key, step.report_md); }} style={iconBtn()} title="Download .md"><Download size={12} /></button>
          <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s', color: 'rgba(150,160,180,0.7)' }} />
        </div>
      </div>
      {(step.worth_deeper_json || []).length > 0 && !open && (
        <div style={{ fontSize: 10.5, color: 'rgba(150,160,180,0.65)', marginTop: 6 }}>{(step.worth_deeper_json || []).length} item(s) flagged for the panel.</div>
      )}
      {open && <div style={{ marginTop: 12, maxHeight: 500, overflowY: 'auto', paddingRight: 4 }}><SimpleMarkdown text={step.report_md || ''} /></div>}
    </div>
  );
}

function PanelSection({ panel, busy, onRunRound1, onRunRound2, onRelease, manavInput, setManavInput }: any) {
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
            <button onClick={() => downloadMd(`panel-round-${panel.round}`, panel.document_md)} style={iconBtn()} title="Download"><Download size={12} /></button>
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
          Add scenarios, context, corrections, or your own data. Then either re-run the panel with your input (round 2), or release directly to the pillars.
        </div>
        <textarea
          value={manavInput} onChange={(e) => setManavInput(e.target.value)}
          placeholder="e.g. We just launched 5 new product pages not in this set. The client cares most about the bunk-bed range. Here's competitor data I have…"
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

function DocCard({ title, body }: { title: string; body: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{(title || '').replace(/_/g, ' ')}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(body || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }} style={iconBtn()} title="Copy">{copied ? <Check size={12} color="#34d399" /> : <Copy size={12} />}</button>
          <button onClick={(e) => { e.stopPropagation(); downloadMd(title, body); }} style={iconBtn()} title="Download .md"><Download size={12} /></button>
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
