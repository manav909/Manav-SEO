/* ════════════════════════════════════════════════════════════════
   AutopilotPanel.tsx
   The PM's auto-pilot command center. Three sections:
     1. Suggestions inbox — rule-generated cards awaiting PM approval
     2. Alerts inbox — anomalies detected (rank drops, click drops, audit
        score drops) awaiting acknowledgement
     3. Rules — per-project auto-pilot rule configuration

   Strategic UX principle: the PM is always in the loop. The system
   never creates kanban tasks or sends client reports without explicit
   acceptance. Alerts deduplicate (an already-open alert won't pile up
   identical rows) and resolve cleanly when conditions normalize.
═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import {
  Zap, Inbox, Bell, Settings, Check, X, Loader2,
  AlertCircle, AlertTriangle, RefreshCw, Play, Calendar,
  TrendingDown, FileSearch, Globe2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as pmApi from './api';
import type {
  RuleType, ProjectRule, CardSuggestion, ProjectAlert,
} from './types';

/* ── strategic copy for each rule type ────────────────────── */

interface RuleSpec {
  type:        RuleType;
  label:       string;
  icon:        any;
  description: string;
  defaultSchedule: any;
  defaultConfig:   any;
  scheduleHint:    string;
  category:    'recurring' | 'alert';
}

const RULE_SPECS: RuleSpec[] = [
  {
    type: 'monthly_audit', label: 'Monthly audit', icon: FileSearch,
    description: 'Suggest a full site audit on the 1st of each month. PM reviews findings and accepts cards from the synthesis.',
    defaultSchedule: { day_of_month: 1 },
    defaultConfig:   { max_pages: 5, url_strategy: 'top_pages_by_clicks' },
    scheduleHint:    'Day of month — fires once that day',
    category: 'recurring',
  },
  {
    type: 'quarterly_crawl', label: 'Quarterly crawl', icon: Globe2,
    description: 'Re-crawl top pages every quarter to refresh page-level signals — schema coverage, word count, internal linking.',
    defaultSchedule: { months: [1, 4, 7, 10], day_of_month: 1 },
    defaultConfig:   { max_pages: 10, url_strategy: 'top_pages_by_clicks' },
    scheduleHint:    'Jan / Apr / Jul / Oct 1st',
    category: 'recurring',
  },
  {
    type: 'weekly_report_draft', label: 'Weekly report draft', icon: Calendar,
    description: 'Auto-draft a weekly client report every Monday. Saved as draft — PM tunes and sends.',
    defaultSchedule: { day_of_week: 1 },
    defaultConfig:   {},
    scheduleHint:    '0=Sun, 1=Mon, ...',
    category: 'recurring',
  },
  {
    type: 'monthly_report_draft', label: 'Monthly report draft', icon: Calendar,
    description: 'Auto-draft a monthly client report on the 1st. Saved as draft — PM reviews before sending.',
    defaultSchedule: { day_of_month: 1 },
    defaultConfig:   {},
    scheduleHint:    'Day of month',
    category: 'recurring',
  },
  {
    type: 'rank_drop_alert', label: 'Rank drop alert', icon: TrendingDown,
    description: 'Daily check: alert when average GSC position drops 5+ places over the last 14 days. Requires GSC connection.',
    defaultSchedule: { check_daily: true },
    defaultConfig:   { position_threshold: 5, lookback_days: 14 },
    scheduleHint:    'Daily — fires only when a real drop is detected',
    category: 'alert',
  },
  {
    type: 'click_drop_alert', label: 'Click drop alert', icon: TrendingDown,
    description: 'Weekly check: alert when GSC clicks drop 30%+ week-on-week. Requires GSC connection.',
    defaultSchedule: { check_weekly: true },
    defaultConfig:   { drop_pct_threshold: 30 },
    scheduleHint:    'Weekly — fires only when a real drop is detected',
    category: 'alert',
  },
  {
    type: 'audit_score_drop_alert', label: 'Audit score drop alert', icon: AlertTriangle,
    description: 'Alert when a new audit lands with a score 10+ below the previous audit. Fires once per regressed audit.',
    defaultSchedule: { check_daily: true },
    defaultConfig:   { score_drop_threshold: 10 },
    scheduleHint:    'Fires when new audits land',
    category: 'alert',
  },
];

/* ── main panel ───────────────────────────────────────────── */

export default function AutopilotPanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<'suggestions' | 'alerts' | 'rules'>('suggestions');
  const [rules, setRules] = useState<ProjectRule[]>([]);
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([]);
  const [alerts, setAlerts] = useState<ProjectAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const [{ rules }, { suggestions }, { alerts }] = await Promise.all([
      pmApi.rulesList(projectId),
      pmApi.suggestionsList(projectId),
      pmApi.alertsList(projectId),
    ]);
    setRules(rules);
    setSuggestions(suggestions);
    setAlerts(alerts);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const openAlerts = alerts.filter((a) => a.status === 'open');
  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-semibold">Auto-pilot</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {loading ? 'Loading…' : `${rules.filter((r) => r.enabled).length} rule${rules.filter((r) => r.enabled).length === 1 ? '' : 's'} active`}
        </span>
      </div>

      {/* tab nav */}
      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === 'suggestions'} onClick={() => setTab('suggestions')}
          icon={Inbox} label="Suggestions" count={pendingSuggestions.length} />
        <TabButton active={tab === 'alerts'} onClick={() => setTab('alerts')}
          icon={Bell} label="Alerts" count={openAlerts.length} highlight={openAlerts.length > 0} />
        <TabButton active={tab === 'rules'} onClick={() => setTab('rules')}
          icon={Settings} label="Rules" />
      </div>

      {/* content */}
      {tab === 'suggestions' && (
        <SuggestionsList suggestions={pendingSuggestions} onChanged={load} />
      )}
      {tab === 'alerts' && (
        <AlertsList alerts={openAlerts.concat(alerts.filter((a) => a.status === 'acknowledged'))} onChanged={load} />
      )}
      {tab === 'rules' && (
        <RulesList projectId={projectId} rules={rules} onChanged={load} />
      )}
    </div>
  );
}

/* ── tab button ───────────────────────────────────────────── */
function TabButton({ active, onClick, icon: Icon, label, count, highlight }: {
  active: boolean; onClick: () => void; icon: any; label: string;
  count?: number; highlight?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
        active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count != null && count > 0 && (
        <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-semibold ${
          highlight ? 'bg-amber-500/20 text-amber-400' : 'bg-primary/20 text-primary'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ── suggestions list ─────────────────────────────────────── */
function SuggestionsList({ suggestions, onChanged }: {
  suggestions: CardSuggestion[]; onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const accept = async (s: CardSuggestion) => {
    setBusy(s.id);
    const { success, error } = await pmApi.suggestionAccept(s.id);
    setBusy(null);
    if (!success) { toast({ title: 'Accept failed', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Card created', description: s.title });
    onChanged();
  };

  const dismiss = async (s: CardSuggestion) => {
    const reason = prompt('Why dismiss this suggestion? (optional)');
    if (reason === null) return;   /* PM cancelled */
    setBusy(s.id);
    const { success, error } = await pmApi.suggestionDismiss(s.id, reason || undefined);
    setBusy(null);
    if (!success) { toast({ title: 'Dismiss failed', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Dismissed' });
    onChanged();
  };

  if (!suggestions.length) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        No pending suggestions. Enable a recurring rule below and the system will suggest cards as work comes due.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {suggestions.map((s) => (
        <div key={s.id} className="rounded-xl border border-border bg-background/40 p-3">
          <div className="flex items-start gap-2 mb-1.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground/90">{s.title}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80">{s.card_type || 'general'}</span>
                {s.priority && <span>· {s.priority}</span>}
                <span>· {new Date(s.created_at).toLocaleDateString('en-GB')}</span>
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button onClick={() => accept(s)} disabled={busy === s.id}
                className="text-xs px-2.5 py-1 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 font-semibold flex items-center gap-1 disabled:opacity-50">
                {busy === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Accept
              </button>
              <button onClick={() => dismiss(s)} disabled={busy === s.id}
                className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50">
                <X className="h-3 w-3" /> Dismiss
              </button>
            </div>
          </div>
          {s.description && (
            <div className="text-xs text-foreground/80 leading-relaxed">{s.description}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── alerts list ──────────────────────────────────────────── */
function AlertsList({ alerts, onChanged }: {
  alerts: ProjectAlert[]; onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const ack = async (a: ProjectAlert) => {
    setBusy(a.id);
    const { success, error } = await pmApi.alertAcknowledge(a.id);
    setBusy(null);
    if (!success) { toast({ title: 'Acknowledge failed', description: error, variant: 'destructive' }); return; }
    onChanged();
  };

  const resolve = async (a: ProjectAlert) => {
    const note = prompt('Resolution note (optional — e.g. "fixed by shipment X")');
    if (note === null) return;
    setBusy(a.id);
    const { success, error } = await pmApi.alertResolve(a.id, note || undefined);
    setBusy(null);
    if (!success) { toast({ title: 'Resolve failed', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Resolved' });
    onChanged();
  };

  if (!alerts.length) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        No open alerts. Enable a watch rule below (rank drop, click drop, audit score drop) and you'll see anomalies here.
      </div>
    );
  }

  const severityTone = (s: string) =>
    s === 'critical' ? 'border-red-500/40 bg-red-500/5' :
    s === 'warn'     ? 'border-amber-500/40 bg-amber-500/5' :
                       'border-border bg-background/40';

  const severityIcon = (s: string) =>
    s === 'critical' ? <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> :
    s === 'warn'     ? <AlertCircle className="h-3.5 w-3.5 text-amber-400" /> :
                       <Bell className="h-3.5 w-3.5 text-muted-foreground" />;

  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div key={a.id} className={`rounded-xl border p-3 ${severityTone(a.severity)}`}>
          <div className="flex items-start gap-2 mb-1.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground/90 flex items-center gap-1.5">
                {severityIcon(a.severity)}
                {a.title}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {a.alert_type.replace(/_/g, ' ')} · {new Date(a.created_at).toLocaleString('en-GB')}
                {a.status === 'acknowledged' && <span className="ml-2 text-blue-400">Acknowledged</span>}
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {a.status === 'open' && (
                <button onClick={() => ack(a)} disabled={busy === a.id}
                  className="text-xs px-2.5 py-1 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50">
                  Acknowledge
                </button>
              )}
              <button onClick={() => resolve(a)} disabled={busy === a.id}
                className="text-xs px-2.5 py-1 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 font-semibold flex items-center gap-1 disabled:opacity-50">
                {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Resolve
              </button>
            </div>
          </div>
          {/* compact detail rendering */}
          {a.detail && typeof a.detail === 'object' && (
            <pre className="text-[10px] text-muted-foreground bg-background/40 rounded p-2 overflow-x-auto whitespace-pre-wrap">
              {Object.entries(a.detail).filter(([k]) => k !== 'possible_causes').map(([k, v]) => {
                const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
                return `${k}: ${val.slice(0, 200)}`;
              }).join('\n')}
            </pre>
          )}
          {a.detail?.possible_causes && (
            <details className="text-[11px] text-foreground/85 mt-1.5">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Possible causes & next steps</summary>
              <ul className="mt-1 ml-4 space-y-0.5 list-disc">
                {(a.detail.possible_causes as string[]).map((c: string, i: number) => <li key={i}>{c}</li>)}
              </ul>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── rules list ───────────────────────────────────────────── */
function RulesList({ projectId, rules, onChanged }: {
  projectId: string; rules: ProjectRule[]; onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const byType: Record<string, ProjectRule | undefined> = {};
  for (const r of rules) byType[r.rule_type] = r;

  const ensure = async (spec: RuleSpec, enabled: boolean) => {
    setBusy(spec.type);
    const existing = byType[spec.type];
    const { rule, error } = await pmApi.ruleUpsert({
      projectId,
      ruleType: spec.type,
      enabled,
      schedule: existing?.schedule || spec.defaultSchedule,
      config:   existing?.config   || spec.defaultConfig,
    });
    setBusy(null);
    if (error || !rule) { toast({ title: 'Save failed', description: error, variant: 'destructive' }); return; }
    onChanged();
  };

  const runNow = async (rule: ProjectRule) => {
    setBusy(rule.id);
    const { success, result, error } = await pmApi.ruleRunNow(rule.id);
    setBusy(null);
    if (!success) { toast({ title: 'Run failed', description: error, variant: 'destructive' }); return; }
    toast({
      title: 'Rule fired',
      description: result?.alerted ? 'Alert created' :
                   result?.suggested ? 'Suggestion created' :
                   result?.reportId ? 'Report draft created' :
                   result?.message || 'Completed — no action needed.',
    });
    onChanged();
  };

  return (
    <div className="space-y-4">
      {(['recurring', 'alert'] as const).map((category) => (
        <div key={category}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            {category === 'recurring' ? 'Recurring work' : 'Watch & alert'}
          </div>
          <div className="space-y-2">
            {RULE_SPECS.filter((s) => s.category === category).map((spec) => {
              const rule = byType[spec.type];
              const Icon = spec.icon;
              const isOn = !!rule?.enabled;
              return (
                <div key={spec.type} className="rounded-xl border border-border bg-background/40 p-3">
                  <div className="flex items-start gap-3">
                    <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${isOn ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{spec.label}</span>
                        {isOn && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-semibold">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{spec.description}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Schedule: {spec.scheduleHint}</div>
                      {rule?.last_fired_at && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Last fired: {new Date(rule.last_fired_at).toLocaleString('en-GB')}
                          {rule.last_fire_status === 'error' && (
                            <span className="text-amber-400 ml-1">— {rule.last_fire_error?.slice(0, 80) || 'error'}</span>
                          )}
                          {rule.last_fire_status === 'ok' && rule.last_fire_summary?.message && (
                            <span className="ml-1">— {String(rule.last_fire_summary.message).slice(0, 80)}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={() => ensure(spec, !isOn)}
                        disabled={busy === spec.type}
                        className={`text-xs px-3 py-1 rounded-lg font-semibold disabled:opacity-50 ${
                          isOn
                            ? 'border border-border text-muted-foreground hover:text-destructive'
                            : 'bg-primary text-primary-foreground hover:opacity-90'
                        }`}
                      >
                        {busy === spec.type ? <Loader2 className="h-3 w-3 animate-spin" /> : (isOn ? 'Disable' : 'Enable')}
                      </button>
                      {rule && isOn && (
                        <button
                          onClick={() => runNow(rule)}
                          disabled={busy === rule.id}
                          className="text-[10px] px-2 py-1 rounded-lg border border-primary/40 text-primary hover:bg-primary/5 flex items-center gap-1 disabled:opacity-50"
                          title="Fire this rule right now (skips schedule)"
                        >
                          {busy === rule.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                          Run now
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
