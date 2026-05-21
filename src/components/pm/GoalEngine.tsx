/* ════════════════════════════════════════════════════════════════
   src/components/pm/GoalEngine.tsx
   Phase 1M — Goal Engine UI.

   Renders below WhatIfSimulator in the Data Room. Flow:

   1. List of active goals with progress bars + on-track indicators
   2. Add new goal: pick metric, target, deadline → system snapshots
      baseline + computes trajectory
   3. Expand a goal: see trajectory chart, gap analysis, suggested
      scenarios that close the gap (one-click to populate simulator)
   4. Update / delete / pause / mark-achieved
   5. Record progress (snapshot current value vs expected)

   Like a financial planner: "to hit your goal, here are 3 paths."
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import {
  Target, Plus, ChevronDown, ChevronRight, X, Trash2, RefreshCw,
  TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Zap, Calendar,
  Sparkles, Activity, Beaker, ArrowUpRight, ArrowDownRight, Minus, Save,
} from 'lucide-react';
import {
  listGoals, createGoal, getGoal, updateGoal, deleteGoal,
  recordGoalProgress, suggestGoalScenarios,
  type GoalRecord, type GoalMetricClient,
  type TrajectoryProjectionClient, type CandidateScenarioClient,
  type GoalProgressSnapshot,
  saveScenario,
} from './api';

interface Props {
  projectId: string;
  defaultCollapsed?: boolean;
}

const METRIC_LABELS: Record<GoalMetricClient, string> = {
  clicks:        'Organic Clicks',
  impressions:   'Search Impressions',
  sessions:      'Organic Sessions',
  conversions:   'Conversions',
  avg_position:  'Avg Position',
  ctr:           'CTR',
  health_score:  'Health Score',
};

const METRIC_UNITS: Record<GoalMetricClient, string> = {
  clicks:        'clicks/mo',
  impressions:   'impr/mo',
  sessions:      'sessions/mo',
  conversions:   'conv/mo',
  avg_position:  'rank',
  ctr:           '%',
  health_score:  '/100',
};

const METRIC_LOWER_IS_BETTER: Record<GoalMetricClient, boolean> = {
  clicks: false, impressions: false, sessions: false, conversions: false,
  avg_position: true, ctr: false, health_score: false,
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:      { label: 'Active',      color: 'text-blue-400 bg-blue-500/15' },
  achieved:    { label: 'Achieved',    color: 'text-emerald-400 bg-emerald-500/15' },
  missed:      { label: 'Missed',      color: 'text-red-400 bg-red-500/15' },
  paused:      { label: 'Paused',      color: 'text-amber-400 bg-amber-500/15' },
  cancelled:   { label: 'Cancelled',   color: 'text-muted-foreground bg-muted/40' },
};

export default function GoalEngine({ projectId, defaultCollapsed }: Props) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const [goals, setGoals]       = useState<GoalRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [info, setInfo]         = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      const r = await listGoals(projectId);
      if (r.error) setError(r.error);
      setGoals(r.goals);
      setLoading(false);
    })();
  }, [projectId]);

  const refreshGoals = async () => {
    const r = await listGoals(projectId);
    if (r.error) setError(r.error);
    setGoals(r.goals);
  };

  const activeGoals    = goals.filter(g => g.status === 'active');
  const completedGoals = goals.filter(g => g.status === 'achieved' || g.status === 'missed');

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-card/40 to-emerald-500/[0.04] mb-4 overflow-hidden">
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-amber-500/[0.04] border-b border-amber-500/10"
      >
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-amber-400" />
          <div>
            <div className="text-sm font-bold text-foreground">Goal Engine</div>
            <div className="text-[10px] text-muted-foreground">Set targets · trajectory + gap analysis · auto-suggested scenarios</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          {activeGoals.length > 0 && <span className="font-bold text-amber-400">{activeGoals.length} active</span>}
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-3">
          {error && (
            <div className="px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-xs text-red-400 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
              <button onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
            </div>
          )}
          {info && (
            <div className="px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {info}
            </div>
          )}

          {/* New goal button */}
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-muted-foreground">
              {loading ? 'Loading…' : (
                goals.length === 0
                  ? 'No goals yet — set one to chart a course.'
                  : `${activeGoals.length} active · ${completedGoals.length} completed`
              )}
            </div>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="text-[11px] px-2.5 py-1.5 rounded-lg font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 flex items-center gap-1.5"
            >
              <Plus className="h-3 w-3" />
              New goal
            </button>
          </div>

          {/* Create form */}
          {showCreate && (
            <CreateGoalForm
              projectId={projectId}
              onCancel={() => setShowCreate(false)}
              onCreated={async (goal) => {
                setShowCreate(false);
                setInfo(`Goal "${goal.name || METRIC_LABELS[goal.metric]}" created.`);
                setTimeout(() => setInfo(null), 3000);
                await refreshGoals();
                setExpandedGoalId(goal.id);
              }}
              onError={setError}
            />
          )}

          {/* Goal list */}
          {!loading && goals.length > 0 && (
            <div className="space-y-2">
              {[...activeGoals, ...completedGoals].map((g) => (
                <GoalRow
                  key={g.id}
                  goal={g}
                  expanded={expandedGoalId === g.id}
                  onToggle={() => setExpandedGoalId(expandedGoalId === g.id ? null : g.id)}
                  onRefresh={refreshGoals}
                  onError={setError}
                  onInfo={(msg) => { setInfo(msg); setTimeout(() => setInfo(null), 3000); }}
                  projectId={projectId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Create Goal Form ────────────────────────────────────────── */

function CreateGoalForm({
  projectId, onCancel, onCreated, onError,
}: {
  projectId: string;
  onCancel: () => void;
  onCreated: (g: GoalRecord) => void;
  onError: (e: string) => void;
}) {
  const [metric, setMetric]         = useState<GoalMetricClient>('clicks');
  const [targetValue, setTargetValue] = useState('');
  const [targetDate, setTargetDate]   = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [sharedWithClient, setShared] = useState(false);
  const [saving, setSaving]           = useState(false);

  const handleCreate = async () => {
    if (!targetValue || isNaN(Number(targetValue))) {
      onError('Set a numeric target value.'); return;
    }
    if (Number(targetValue) <= 0) {
      onError('Target value must be greater than zero.'); return;
    }
    setSaving(true);
    const r = await createGoal({
      projectId, metric,
      targetValue: Number(targetValue),
      targetDate,
      name: name.trim() || undefined,
      description: description.trim() || undefined,
      sharedWithClient,
    });
    setSaving(false);
    if (r.error) { onError(r.error); return; }
    if (r.goal) onCreated(r.goal);
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3">
      <div className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5" /> Define your goal
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Metric</label>
          <select value={metric} onChange={(e) => setMetric(e.target.value as GoalMetricClient)}
            className="w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background/60 focus:outline-none focus:border-amber-500/40 mt-0.5">
            {(Object.keys(METRIC_LABELS) as GoalMetricClient[]).map((m) => (
              <option key={m} value={m}>{METRIC_LABELS[m]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Target ({METRIC_UNITS[metric]})
          </label>
          <input type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)}
            placeholder={METRIC_LOWER_IS_BETTER[metric] ? "e.g. 5" : "e.g. 10000"}
            className="w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background/60 focus:outline-none focus:border-amber-500/40 mt-0.5"/>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">By date</label>
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)}
            className="w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background/60 focus:outline-none focus:border-amber-500/40 mt-0.5"/>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Name (optional)</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Q4 traffic push"
            className="w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background/60 focus:outline-none focus:border-amber-500/40 mt-0.5"/>
        </div>
        <div className="sm:col-span-2">
          <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Description (optional)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Context for the team / client"
            className="w-full text-[11px] px-2 py-1.5 rounded-md border border-border bg-background/60 focus:outline-none focus:border-amber-500/40 mt-0.5"/>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <label className="text-[10px] text-muted-foreground flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={sharedWithClient} onChange={(e) => setShared(e.target.checked)}
            className="rounded border-border"/>
          Share with client
        </label>
        <div className="flex-1" />
        <button onClick={onCancel} className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground">Cancel</button>
        <button onClick={handleCreate} disabled={saving}
          className="text-[11px] px-3 py-1.5 rounded-lg font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 disabled:opacity-50 flex items-center gap-1.5">
          <Save className="h-3 w-3" />{saving ? 'Creating…' : 'Create goal'}
        </button>
      </div>
    </div>
  );
}

/* ─── Goal Row ────────────────────────────────────────────────── */

function GoalRow({
  goal, expanded, onToggle, onRefresh, onError, onInfo, projectId,
}: {
  goal: GoalRecord;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => Promise<void>;
  onError: (e: string) => void;
  onInfo: (m: string) => void;
  projectId: string;
}) {
  const metric = goal.metric;
  const lowerIsBetter = METRIC_LOWER_IS_BETTER[metric];
  const status = STATUS_LABELS[goal.status] || STATUS_LABELS.active;

  const [trajectory, setTrajectory] = useState<TrajectoryProjectionClient | null>(goal.projection_snapshot);
  const [scenarios, setScenarios]   = useState<CandidateScenarioClient[]>([]);
  const [progress, setProgress]     = useState<GoalProgressSnapshot[]>([]);
  const [loading, setLoading]       = useState(false);
  const [scenariosLoaded, setScenariosLoaded] = useState(false);

  useEffect(() => {
    if (!expanded || trajectory) return;
    (async () => {
      setLoading(true);
      const r = await getGoal(goal.id);
      if (r.error) onError(r.error);
      else {
        setTrajectory(r.trajectory || null);
        setProgress(r.progress || []);
      }
      setLoading(false);
    })();
  }, [expanded, goal.id]);

  const loadScenarios = async () => {
    setLoading(true);
    const r = await suggestGoalScenarios(goal.id);
    if (r.error) onError(r.error);
    setTrajectory(r.trajectory || trajectory);
    setScenarios(r.scenarios || []);
    setScenariosLoaded(true);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete goal "${goal.name || METRIC_LABELS[metric]}"?`)) return;
    const r = await deleteGoal(goal.id);
    if (r.error) onError(r.error);
    else {
      onInfo('Goal deleted.');
      await onRefresh();
    }
  };

  const handleRecord = async () => {
    const r = await recordGoalProgress(goal.id);
    if (r.error) onError(r.error);
    else {
      onInfo('Progress snapshot recorded.');
      const f = await getGoal(goal.id);
      setProgress(f.progress || []);
    }
  };

  const handleMarkAchieved = async () => {
    const r = await updateGoal({ goalId: goal.id, status: 'achieved' });
    if (r.error) onError(r.error);
    else { onInfo('Marked as achieved.'); await onRefresh(); }
  };

  const handleSaveScenarioToSimulator = async (candidate: CandidateScenarioClient) => {
    /* Save as a draft scenario in the simulator's storage */
    const r = await saveScenario({
      projectId,
      name: `${candidate.label} — for "${goal.name || METRIC_LABELS[metric]}"`,
      description: `Auto-generated to close gap on ${METRIC_LABELS[metric]} goal. ${candidate.rationale}`,
      actions: candidate.actions,
      status: 'planned',
      sharedWithClient: false,
    });
    if (r.error) onError(r.error);
    else onInfo(`Scenario saved — load it in the What-If Simulator to refine.`);
  };

  /* Display values */
  const currentValue = trajectory?.currentValue ?? goal.baseline_value;
  const progressPct = computeProgressPct(goal.baseline_value, currentValue, goal.target_value, lowerIsBetter);
  const isOnTrack = trajectory?.isOnTrack ?? false;
  const daysRemaining = Math.max(0, Math.floor((new Date(goal.target_date).getTime() - Date.now()) / 86_400_000));

  return (
    <div className={`rounded-xl border bg-card/30 overflow-hidden ${
      isOnTrack ? 'border-emerald-500/20' : trajectory ? 'border-amber-500/30' : 'border-border'
    }`}>
      {/* Goal header */}
      <div onClick={onToggle} className="px-3 py-2.5 cursor-pointer hover:bg-muted/20">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold ${status.color}`}>{status.label}</span>
            <div className="text-[12px] font-bold text-foreground truncate">
              {goal.name || `${METRIC_LABELS[metric]} target`}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground shrink-0">
            <Calendar className="h-2.5 w-2.5 inline mr-0.5" />
            {daysRemaining}d left
          </div>
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        {/* Progress bar */}
        <div className="flex items-baseline justify-between text-[10px] mb-1">
          <span className="text-muted-foreground">
            <span className="text-foreground font-bold">{formatMetricValue(currentValue, metric)}</span>
            {' '}/ {formatMetricValue(goal.target_value, metric)} {METRIC_UNITS[metric]}
          </span>
          {trajectory && (
            <div className={`flex items-center gap-1 font-bold ${isOnTrack ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isOnTrack ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
              {isOnTrack ? 'On track' : 'Off track'}
            </div>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-background/60 overflow-hidden">
          <div className={`h-full transition-all ${
            progressPct >= 100 ? 'bg-emerald-400' : progressPct >= 70 ? 'bg-amber-400' : 'bg-blue-400'
          }`} style={{ width: `${Math.max(2, Math.min(100, progressPct))}%` }} />
        </div>
      </div>

      {/* Expanded view */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/40 space-y-3">
          {loading && (
            <div className="text-center py-4 text-xs text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="h-3 w-3 animate-spin" /> Computing trajectory…
            </div>
          )}

          {/* Trajectory details */}
          {trajectory && (
            <div className="rounded-lg border border-border bg-background/30 p-2.5">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Trajectory analysis</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <TrajectoryStat label="Baseline" value={formatMetricValue(trajectory.baselineValue, metric)} sub={trajectory.baselineDate} />
                <TrajectoryStat label="Current" value={formatMetricValue(trajectory.currentValue, metric)} sub="today" />
                <TrajectoryStat
                  label="Natural projection"
                  value={formatMetricValue(trajectory.projectedNaturalValue, metric)}
                  sub={`@ ${new Date(trajectory.targetDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}`}
                  emphasize={!isOnTrack}
                />
                <TrajectoryStat
                  label="Target"
                  value={formatMetricValue(trajectory.targetValue, metric)}
                  sub={`gap ${lowerIsBetter ? '' : '+'}${formatMetricValue(trajectory.gap, metric)}`}
                  emphasize
                />
              </div>
              <div className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                Trend: <span className={
                  trajectory.trendDirection === 'growing' ? 'text-emerald-400 font-bold' :
                  trajectory.trendDirection === 'declining' ? 'text-red-400 font-bold' : 'text-muted-foreground font-bold'
                }>{trajectory.trendDirection}</span>
                {' '}at <span className="text-foreground font-bold">{trajectory.monthlyGrowthRate > 0 ? '+' : ''}{trajectory.monthlyGrowthRate}%/mo</span>
                {' '}· confidence <span className={
                  trajectory.confidence === 'high' ? 'text-emerald-400' : trajectory.confidence === 'medium' ? 'text-amber-400' : 'text-muted-foreground'
                }>{trajectory.confidence}</span>
              </div>
            </div>
          )}

          {/* Suggested scenarios */}
          {trajectory && !isOnTrack && (
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-2.5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-wider font-bold text-cyan-400 flex items-center gap-1.5">
                  <Beaker className="h-3 w-3" /> Suggested scenarios to close the gap
                </div>
                {!scenariosLoaded && (
                  <button onClick={loadScenarios}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 font-bold flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5" />Compute paths
                  </button>
                )}
              </div>
              {scenariosLoaded && scenarios.length === 0 && (
                <div className="text-[10px] text-muted-foreground italic py-2">
                  No suitable scenarios found for this metric — try editing the action library or extending the deadline.
                </div>
              )}
              {scenarios.length > 0 && (
                <div className="space-y-1.5">
                  {scenarios.map((s, i) => (
                    <CandidateScenarioRow key={i} scenario={s} metric={metric}
                      onUseInSimulator={() => handleSaveScenarioToSimulator(s)}/>
                  ))}
                </div>
              )}
            </div>
          )}

          {trajectory && isOnTrack && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5 text-[11px] text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Trajectory projects you'll hit this target naturally — no intervention required.</span>
            </div>
          )}

          {/* Progress history */}
          {progress.length > 0 && (
            <div className="rounded-lg border border-border bg-background/30 p-2.5">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">Progress snapshots</div>
              <div className="space-y-1">
                {progress.slice(-6).map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-[10px]">
                    <span className="text-muted-foreground w-20">{new Date(p.recorded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                    <span className="font-bold text-foreground">{formatMetricValue(p.actual_value, metric)}</span>
                    {p.expected_value != null && (
                      <span className="text-muted-foreground">vs expected {formatMetricValue(p.expected_value, metric)}</span>
                    )}
                    {p.on_track != null && (
                      <span className={p.on_track ? 'text-emerald-400' : 'text-amber-400'}>
                        {p.on_track ? '✓ on track' : '⚠ off track'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-border/30">
            <button onClick={handleRecord}
              className="text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground flex items-center gap-1">
              <Activity className="h-2.5 w-2.5" />Record progress
            </button>
            {goal.status === 'active' && (
              <button onClick={handleMarkAchieved}
                className="text-[10px] px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 flex items-center gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" />Mark achieved
              </button>
            )}
            <button onClick={handleDelete}
              className="text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-red-400 flex items-center gap-1">
              <Trash2 className="h-2.5 w-2.5" />Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────── */

function TrajectoryStat({ label, value, sub, emphasize }: { label: string; value: string; sub: string; emphasize?: boolean }) {
  return (
    <div className={`rounded-md p-1.5 ${emphasize ? 'bg-amber-500/[0.08] border border-amber-500/20' : 'bg-card/40'}`}>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">{label}</div>
      <div className={`text-[12px] font-bold ${emphasize ? 'text-amber-400' : 'text-foreground'}`}>{value}</div>
      <div className="text-[9px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function CandidateScenarioRow({
  scenario, metric, onUseInSimulator,
}: {
  scenario: CandidateScenarioClient; metric: GoalMetricClient;
  onUseInSimulator: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const strategyColor = {
    min_effort: 'text-emerald-400 bg-emerald-500/15',
    balanced:   'text-blue-400 bg-blue-500/15',
    aggressive: 'text-violet-400 bg-violet-500/15',
  }[scenario.strategy];

  return (
    <div className="rounded-md border border-border bg-background/30">
      <div className="px-2.5 py-1.5 flex items-center gap-2">
        <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${strategyColor}`}>{scenario.label}</span>
        <div className="flex-1 min-w-0 text-[11px]">
          <span className="text-foreground font-bold">{formatMetricValue(scenario.projectedFinalValue, metric)}</span>
          <span className="text-muted-foreground"> projected · {scenario.effortHours}h effort</span>
          {scenario.meetsTarget && <span className="ml-1.5 text-emerald-400">✓ meets target</span>}
        </div>
        <button onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-muted-foreground hover:text-foreground">
          {expanded ? 'less' : 'more'}
        </button>
        <button onClick={onUseInSimulator}
          className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 font-bold">
          → Simulator
        </button>
      </div>
      {expanded && (
        <div className="px-2.5 pb-2 pt-1 border-t border-border/40 space-y-1.5">
          <div className="text-[10px] text-muted-foreground leading-relaxed">{scenario.rationale}</div>
          <div className="space-y-0.5">
            {scenario.actionSummary.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                <span className="text-cyan-400/60 w-4">{i+1}.</span>
                <span className="flex-1 text-foreground">{a.action_name}</span>
                <span className="text-muted-foreground">+{a.impact_score} impact</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ───────────────────────────────────────────────── */

function formatMetricValue(v: number, metric: GoalMetricClient): string {
  if (metric === 'avg_position')  return v.toFixed(1);
  if (metric === 'ctr')           return v.toFixed(2) + '%';
  if (metric === 'health_score')  return v.toFixed(0);
  if (Math.abs(v) >= 1_000_000)   return (v / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(v) >= 10_000)      return (v / 1000).toFixed(0) + 'k';
  if (Math.abs(v) >= 1000)        return (v / 1000).toFixed(1) + 'k';
  return Math.round(v).toLocaleString();
}

function computeProgressPct(baseline: number, current: number, target: number, lowerIsBetter: boolean): number {
  const span = lowerIsBetter ? (baseline - target) : (target - baseline);
  if (span === 0) return current === target ? 100 : 0;
  const made = lowerIsBetter ? (baseline - current) : (current - baseline);
  return Math.max(0, (made / span) * 100);
}
