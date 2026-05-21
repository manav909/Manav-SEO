/* ════════════════════════════════════════════════════════════════
   src/pages/SeasonSettings.tsx
   Phase 8c — S.E.A.S.O.N. control panel.

   The trust contract made tangible. From this page:
     • Set capabilities (read/draft/navigate/filter/modify)
     • Triage wishes (plan/decline/build)
     • Tune tone + verbosity + orb appearance
     • Adjust daily LLM cost cap
     • View per-page rules
     • View recent activity (audit log)
     • Pause / resume S.E.A.S.O.N. entirely

   The HARD BOUNDARY: destructive actions (delete, finalize-without-
   approval, send-without-approval) can NEVER be auto-allowed. The UI
   doesn't even offer a toggle for them.
═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Settings, Lightbulb, Shield, Activity, Volume2,
  AlertCircle, Pause, Play, RotateCcw, ChevronRight, X,
  CheckCircle2, Clock, Tag, MessageSquare, Lock,
} from 'lucide-react';
import SmartSidebar from '@/components/SmartSidebar';
import SmartTopBar from '@/components/SmartTopBar';
import { useSeason } from '@/contexts/SeasonContext';
import { useProject } from '@/contexts/ProjectContext';
import {
  seasonListWishes, seasonTriageWish, seasonWishStats, seasonActivity,
  type SeasonWish, type WishStats, type ActivityEvent,
} from '@/components/pm/api';

const TABS = [
  { id: 'capabilities', label: 'Capabilities',  icon: Shield },
  { id: 'wishes',       label: 'Wishes',         icon: Lightbulb },
  { id: 'voice',        label: 'Voice & Tone',   icon: MessageSquare },
  { id: 'presence',     label: 'Presence',       icon: Sparkles },
  { id: 'cost',         label: 'Cost & Limits',  icon: Activity },
  { id: 'activity',     label: 'Audit Log',      icon: Clock },
  { id: 'control',      label: 'Master Control', icon: Lock },
] as const;
type TabId = typeof TABS[number]['id'];

export default function SeasonSettings() {
  const [tab, setTab] = useState<TabId>('capabilities');
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-card text-foreground">
      <SmartTopBar />
      <SmartSidebar />
      <div className="md:pl-64">
        <div className="max-w-5xl mx-auto px-6 py-8">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-cyan-400">
              S.E.A.S.O.N. · Control panel
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
              Settings — what S.E.A.S.O.N. can and cannot do.
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              The trust contract. Everything S.E.A.S.O.N. is allowed to do for you, and the things it cannot do regardless of any setting. You're the only authority.
            </p>
          </motion.div>

          {/* Tab bar */}
          <div className="mt-6 flex gap-1 border-b border-border overflow-x-auto">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
                    active
                      ? 'border-cyan-400 text-cyan-400 font-bold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}>
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="mt-6">
            <AnimatePresence mode="wait">
              <motion.div key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}>
                {tab === 'capabilities' && <CapabilitiesTab />}
                {tab === 'wishes'       && <WishesTab />}
                {tab === 'voice'        && <VoiceTab />}
                {tab === 'presence'     && <PresenceTab />}
                {tab === 'cost'         && <CostTab />}
                {tab === 'activity'     && <ActivityTab />}
                {tab === 'control'      && <ControlTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   CAPABILITIES
═══════════════════════════════════════════════════════════ */

function CapabilitiesTab() {
  const { settings, updateSettings } = useSeason();
  const c = settings.capabilities;
  const p = settings.per_page_rules;

  const toggle = (key: keyof typeof c) => updateSettings({ capabilities: { ...c, [key]: !c[key] } });
  const togglePage = (key: keyof typeof p) => updateSettings({ per_page_rules: { ...p, [key]: !p[key] } });

  return (
    <div className="space-y-6">
      <Section title="What S.E.A.S.O.N. is allowed to do" subtitle="Each capability can be granted or revoked. Changes take effect immediately.">
        <ToggleRow
          label="Read project data"
          desc="GSC, GA4, strategies, goals, cards, audits, Data Room context."
          checked={c.read_data}
          onChange={() => toggle('read_data')}
          impact="Without this: every answer becomes 'I can't see your project'."
        />
        <ToggleRow
          label="Draft artifacts"
          desc="Content briefs, outreach emails, comparison tables, plans."
          checked={c.draft_artifacts}
          onChange={() => toggle('draft_artifacts')}
          impact="Without this: you only get analysis, never deliverables."
        />
        <ToggleRow
          label="Navigate the platform"
          desc='Suggest "Open Planning" buttons, take you to a specific page when asked.'
          checked={c.navigate}
          onChange={() => toggle('navigate')}
        />
        <ToggleRow
          label="Filter & sort UI"
          desc='"Filter Kanban to overdue" — S.E.A.S.O.N. can drive the view.'
          checked={c.filter_sort}
          onChange={() => toggle('filter_sort')}
          comingSoon="Phase 10"
        />
        <ToggleRow
          label="Compute analytics intelligence"
          desc="Run the GSC+GA4 90-day analysis pipeline on demand."
          checked={c.compute_intel}
          onChange={() => toggle('compute_intel')}
        />
        <ToggleRow
          label="Modify data (with confirmation)"
          desc="Save a card, update a strategy status. Always asks first."
          checked={c.modify_with_confirm}
          onChange={() => toggle('modify_with_confirm')}
          comingSoon="Phase 10"
        />
        <ToggleRow
          label="Modify data without asking"
          desc="Auto-apply changes. Advanced — use with caution."
          checked={c.modify_no_confirm}
          onChange={() => toggle('modify_no_confirm')}
          warning="Off by default. Only enable if you trust the audit log."
          comingSoon="Phase 10"
        />
      </Section>

      <Section title="What S.E.A.S.O.N. can NEVER do" subtitle="Hardcoded boundaries. Not configurable.">
        <BoundaryRow
          icon="🛡"
          label="Delete project data"
          desc="No card, strategy, goal, audit, or store item can be deleted by S.E.A.S.O.N. without an explicit confirmation click from you."
        />
        <BoundaryRow
          icon="🛡"
          label="Send anything to a client"
          desc="No email, no Slack, no SMS, no DocuSign. Drafts only — you press send."
        />
        <BoundaryRow
          icon="🛡"
          label="Modify its own settings"
          desc="S.E.A.S.O.N. cannot disable itself, raise its own cap, or unlock its own permissions."
        />
        <BoundaryRow
          icon="🛡"
          label="Act on another user's account"
          desc="Even in a multi-tenant deployment, S.E.A.S.O.N. is scoped to the project owner — never crosses operator boundaries."
        />
      </Section>

      <Section title="Per-page rules" subtitle="Granular control over what S.E.A.S.O.N. can do where.">
        <ToggleRow label="Kanban — allow filter/sort"     desc="" checked={p.kanban_can_filter}    onChange={() => togglePage('kanban_can_filter')} compact />
        <ToggleRow label="Kanban — allow create cards"    desc="" checked={p.kanban_can_create}    onChange={() => togglePage('kanban_can_create')} compact comingSoon="Phase 10" />
        <ToggleRow label="Data Room — allow write"         desc="" checked={p.data_room_can_write}  onChange={() => togglePage('data_room_can_write')} compact comingSoon="Phase 10" />
        <ToggleRow label="Planning — allow advance stage" desc="" checked={p.planning_can_advance} onChange={() => togglePage('planning_can_advance')} compact comingSoon="Phase 10" />
      </Section>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   WISHES
═══════════════════════════════════════════════════════════ */

function WishesTab() {
  const { selectedProjectId } = useProject() as any;
  const [stats, setStats]       = useState<WishStats | null>(null);
  const [wishes, setWishes]     = useState<SeasonWish[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<'open' | 'all' | 'planned' | 'shipped' | 'declined'>('open');
  const [scope, setScope]       = useState<'project' | 'platform'>('project');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const projectArg = scope === 'platform' ? 'platform' : selectedProjectId;
      if (!projectArg) {
        setWishes([]);
        setStats(null);
        setLoading(false);
        return;
      }
      const [w, s] = await Promise.all([
        seasonListWishes({ projectId: projectArg, status: filter === 'all' ? undefined : filter as any, limit: 100 }),
        seasonWishStats({ projectId: projectArg as any }),
      ]);
      if (w.error) setError(w.error);
      else setWishes(w.wishes || []);
      if (s.stats) setStats(s.stats);
    } catch (e: any) {
      setError(e?.message || 'load failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedProjectId, filter, scope]);

  const triage = async (wishId: string, status: SeasonWish['status'], priority?: 'high' | 'medium' | 'low') => {
    setUpdatingId(wishId);
    try {
      await seasonTriageWish({ wishId, status, priority });
      await load();
    } catch { /* noop */ }
    setUpdatingId(null);
  };

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard label="Open"          value={stats.open_count}        accent="cyan" />
          <StatCard label="High priority"  value={stats.high_priority_open} accent="amber" />
          <StatCard label="Planned"        value={stats.by_status?.planned || 0} accent="violet" />
          <StatCard label="Shipped"        value={stats.by_status?.shipped || 0} accent="emerald" />
        </div>
      )}

      {/* Scope toggle + filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[11px] text-muted-foreground mr-2">Scope:</div>
        <Pill active={scope === 'project'} onClick={() => setScope('project')}>This project</Pill>
        <Pill active={scope === 'platform'} onClick={() => setScope('platform')}>Platform-wide</Pill>
        <div className="text-[11px] text-muted-foreground ml-4 mr-2">Filter:</div>
        {(['open','planned','shipped','declined','all'] as const).map(f => (
          <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</Pill>
        ))}
      </div>

      {/* Intro */}
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3">
        <div className="flex items-start gap-2">
          <Lightbulb className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-[12px] font-bold text-foreground">What you're looking at</div>
            <div className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">
              These are gaps S.E.A.S.O.N. noticed while working — missing data sources, integrations, features, permissions. You decide what to build, defer, or decline. Triage moves a wish into the roadmap (or out of it).
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-[12px] text-muted-foreground italic p-4">Loading…</div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.05] p-3 text-[12px] text-red-400">{error}</div>
      ) : wishes.length === 0 ? (
        <div className="rounded-lg border border-border bg-card/40 p-6 text-center">
          <div className="text-[12px] text-foreground/70 mb-1">No wishes here yet.</div>
          <div className="text-[11px] text-muted-foreground">
            When S.E.A.S.O.N. notices a gap during a conversation, it logs it here. Ask it complex questions and see what it wishes it could do.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {wishes.map(w => (
            <WishCard key={w.id} wish={w} onTriage={triage} updating={updatingId === w.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function WishCard({ wish, onTriage, updating }: { wish: SeasonWish; onTriage: (id: string, status: SeasonWish['status'], priority?: 'high' | 'medium' | 'low') => void; updating: boolean }) {
  const [showActions, setShowActions] = useState(false);
  const catColor =
    wish.category === 'data_source'  ? 'text-blue-400 border-blue-500/30' :
    wish.category === 'feature'      ? 'text-violet-400 border-violet-500/30' :
    wish.category === 'integration'  ? 'text-emerald-400 border-emerald-500/30' :
    wish.category === 'ui_action'    ? 'text-amber-400 border-amber-500/30' :
    wish.category === 'knowledge'    ? 'text-cyan-400 border-cyan-500/30' :
    wish.category === 'permission'   ? 'text-red-400 border-red-500/30' :
                                       'text-muted-foreground border-border';
  const statusBadge =
    wish.status === 'planned'  ? 'bg-violet-500/15 text-violet-400 border-violet-500/40' :
    wish.status === 'building' ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40' :
    wish.status === 'shipped'  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' :
    wish.status === 'declined' ? 'bg-red-500/15 text-red-400 border-red-500/40' :
                                  'bg-amber-500/15 text-amber-400 border-amber-500/40';

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border bg-card/40 p-3 hover:border-cyan-500/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <span className={`text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${catColor} font-bold`}>
              {wish.category.replace(/_/g, ' ')}
            </span>
            <span className={`text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusBadge} font-bold`}>
              {wish.status}
            </span>
            {wish.priority && (
              <span className="text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-foreground/20 text-foreground/70 font-bold">
                {wish.priority} priority
              </span>
            )}
            {wish.emitted_count > 1 && (
              <span className="text-[9.5px] text-muted-foreground italic">
                requested {wish.emitted_count}×
              </span>
            )}
          </div>
          <div className="text-[12.5px] text-foreground leading-relaxed">{wish.wish_text}</div>
          {wish.triggered_by && (
            <div className="text-[10.5px] text-muted-foreground mt-1 italic">
              triggered by: {wish.triggered_by}
            </div>
          )}
          {wish.operator_note && (
            <div className="text-[10.5px] text-cyan-400/80 mt-1.5">
              ↳ your note: {wish.operator_note}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowActions(!showActions)}
          className="text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors shrink-0">
          {showActions ? 'Hide' : 'Triage'}
        </button>
      </div>

      <AnimatePresence>
        {showActions && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="mt-3 pt-3 border-t border-border flex flex-wrap gap-1.5">
            <TriageBtn onClick={() => onTriage(wish.id, 'planned', 'high')}   color="violet"  loading={updating}>Plan · high</TriageBtn>
            <TriageBtn onClick={() => onTriage(wish.id, 'planned', 'medium')} color="violet"  loading={updating}>Plan · medium</TriageBtn>
            <TriageBtn onClick={() => onTriage(wish.id, 'planned', 'low')}    color="violet"  loading={updating}>Plan · low</TriageBtn>
            <TriageBtn onClick={() => onTriage(wish.id, 'building')}           color="cyan"    loading={updating}>Building</TriageBtn>
            <TriageBtn onClick={() => onTriage(wish.id, 'shipped')}            color="emerald" loading={updating}>Shipped</TriageBtn>
            <TriageBtn onClick={() => onTriage(wish.id, 'declined')}           color="red"     loading={updating}>Decline</TriageBtn>
            <TriageBtn onClick={() => onTriage(wish.id, 'stale')}              color="muted"   loading={updating}>Stale</TriageBtn>
            <TriageBtn onClick={() => onTriage(wish.id, 'open')}               color="amber"   loading={updating}>Re-open</TriageBtn>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════
   VOICE
═══════════════════════════════════════════════════════════ */

function VoiceTab() {
  const { settings, updateSettings } = useSeason();
  return (
    <div className="space-y-6">
      <Section title="Tone" subtitle="How forward S.E.A.S.O.N. is with opinions and observations.">
        <RadioGroup
          value={settings.tone}
          onChange={(v) => updateSettings({ tone: v as any })}
          options={[
            { value: 'passive',  label: 'Passive',  desc: 'Quiet until spoken to. Gives exactly what was asked, nothing more.' },
            { value: 'balanced', label: 'Balanced', desc: 'Default. Answers questions plus volunteers what matters.' },
            { value: 'active',   label: 'Active',   desc: 'Brings opinions, pushes back, says "I\'d…" without being asked.' },
          ]}
        />
      </Section>

      <Section title="Verbosity" subtitle="How long answers run.">
        <RadioGroup
          value={settings.verbosity}
          onChange={(v) => updateSettings({ verbosity: v as any })}
          options={[
            { value: 'terse',    label: 'Terse',    desc: 'Shortest accurate answer. No padding.' },
            { value: 'balanced', label: 'Balanced', desc: 'Default. Answer plus context plus source.' },
            { value: 'detailed', label: 'Detailed', desc: 'Full reasoning, all caveats, deeper explanation.' },
          ]}
        />
      </Section>

      <Section title="Knowledge" subtitle="What S.E.A.S.O.N. can draw on.">
        <ToggleRow
          label="Use general SEO knowledge when project data is thin"
          desc="When your data doesn't have the answer, fall back on industry best practices. Always labeled as general knowledge."
          checked={settings.use_general_seo}
          onChange={() => updateSettings({ use_general_seo: !settings.use_general_seo })}
        />
        <ToggleRow
          label="Remember context across sessions"
          desc="What you asked yesterday informs how it interprets you today."
          checked={settings.remember_sessions}
          onChange={() => updateSettings({ remember_sessions: !settings.remember_sessions })}
        />
        <ToggleRow
          label="Live web access"
          desc="Lets S.E.A.S.O.N. search the open web for current info (algorithm updates, competitor moves, news). Sources are cited."
          checked={settings.web_access}
          onChange={() => updateSettings({ web_access: !settings.web_access })}
          impact="Counts toward your daily LLM cap. Costs more per call."
        />
      </Section>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   PRESENCE — orb appearance + position
═══════════════════════════════════════════════════════════ */

function PresenceTab() {
  const { orbVisible, setOrbVisible, orbPosition, setOrbPosition, settings, updateSettings } = useSeason();
  return (
    <div className="space-y-6">
      <Section title="The Orb" subtitle="The floating presence in the corner of every page.">
        <ToggleRow
          label="Orb visible"
          desc="The glowing sphere appears in your corner. Cmd+K still works either way."
          checked={orbVisible}
          onChange={() => setOrbVisible(!orbVisible)}
        />
        <div className="pt-3 border-t border-border">
          <div className="text-[12px] font-bold text-foreground mb-2">Orb position</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['tl', 'tr', 'bl', 'br'] as const).map(p => (
              <button key={p} onClick={() => setOrbPosition(p)}
                className={`p-2 rounded-lg border text-[11px] transition-colors ${
                  orbPosition === p
                    ? 'border-cyan-500/40 bg-cyan-500/[0.08] text-cyan-400 font-bold'
                    : 'border-border bg-background/30 text-muted-foreground hover:text-foreground'
                }`}>
                {p === 'tl' ? '↖ Top left' : p === 'tr' ? 'Top right ↗' : p === 'bl' ? '↙ Bottom left' : 'Bottom right ↘'}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Animations & feedback" subtitle="The room breathes with S.E.A.S.O.N.'s mood.">
        <ToggleRow
          label="Mood animations"
          desc="Orb pulses with current state (calm/focused/alert/critical/celebrating)."
          checked={settings.mood_animations}
          onChange={() => updateSettings({ mood_animations: !settings.mood_animations })}
        />
        <div className="pt-3 border-t border-border">
          <div className="text-[12px] font-bold text-foreground mb-2">Sound feedback</div>
          <RadioGroup
            value={settings.sound_feedback}
            onChange={(v) => updateSettings({ sound_feedback: v as any })}
            options={[
              { value: 'off',     label: 'Off',     desc: 'No sounds.' },
              { value: 'subtle',  label: 'Subtle',  desc: 'Quiet chime on critical state changes only.' },
              { value: 'present', label: 'Present', desc: 'Soft acknowledgements on every interaction.' },
            ]}
          />
        </div>
      </Section>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   COST
═══════════════════════════════════════════════════════════ */

function CostTab() {
  const { settings, updateSettings } = useSeason();
  return (
    <div className="space-y-6">
      <Section title="Daily LLM cost cap" subtitle="How many LLM-brain calls per project per 24 hours.">
        <div className="px-2">
          <div className="flex items-center gap-4 mb-2">
            <div className="text-2xl font-bold text-cyan-400 tabular-nums">{settings.daily_llm_cap}</div>
            <div className="text-[11px] text-muted-foreground">calls / project / day</div>
          </div>
          <input
            type="range"
            min={10} max={500} step={10}
            value={settings.daily_llm_cap}
            onChange={(e) => updateSettings({ daily_llm_cap: Number(e.target.value) })}
            className="w-full accent-cyan-400"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>10 (frugal)</span>
            <span>50 (default)</span>
            <span>500 (heavy)</span>
          </div>
        </div>
        <div className="mt-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04]">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-[11px] text-foreground/80 leading-relaxed">
              The cap applies to the LLM brain (Sonnet 4.6). Keyword-routed intents (summarize, status, diagnose, attention, verify) don't count against it — they're free. The cap is enforced server-side and visible in the audit log.
            </div>
          </div>
        </div>
      </Section>

      <Section title="What counts as a call" subtitle="">
        <div className="text-[11.5px] text-muted-foreground space-y-1.5">
          <div>• Asking "draft a brief", "draft an email", "draft a plan" — 1 call.</div>
          <div>• Open-ended questions outside keyword routes ("what should I do this week") — 1 call.</div>
          <div>• Diagnose's live ping — 1 call.</div>
          <div>• Summarize, attention, status, verify, compute-intel — 0 calls (free, keyword-routed).</div>
        </div>
      </Section>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ACTIVITY LOG
═══════════════════════════════════════════════════════════ */

function ActivityTab() {
  const { selectedProjectId } = useProject() as any;
  const [events, setEvents]   = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<'all' | 'llm' | 'user' | 'system' | 'action'>('all');

  useEffect(() => {
    if (!selectedProjectId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const r = await seasonActivity({ projectId: selectedProjectId, limit: 100 });
      setEvents(r.events || []);
      setLoading(false);
    })();
  }, [selectedProjectId]);

  const filtered = filter === 'all' ? events : events.filter(e => e.source === filter);

  if (!selectedProjectId) {
    return (
      <div className="rounded-lg border border-border bg-card/40 p-6 text-center text-[12px] text-muted-foreground">
        Pick a project to see its activity log.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[11px] text-muted-foreground mr-2">Filter:</div>
        {(['all','user','llm','system','action'] as const).map(f => (
          <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</Pill>
        ))}
      </div>
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3 text-[11.5px] text-foreground/80">
        Every action S.E.A.S.O.N. takes is logged here, append-only. This is the trust ledger — you can always see exactly what happened.
      </div>
      {loading ? (
        <div className="text-[12px] text-muted-foreground italic p-4">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card/40 p-6 text-center text-[12px] text-muted-foreground">
          Nothing here yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(e => (
            <div key={e.id} className="rounded-lg border border-border bg-card/40 p-2.5 hover:border-cyan-500/30 transition-colors">
              <div className="flex items-start gap-2">
                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-bold shrink-0 mt-0.5 ${
                  e.source === 'llm'    ? 'border-violet-500/40 text-violet-400 bg-violet-500/10' :
                  e.source === 'user'   ? 'border-cyan-500/40 text-cyan-400 bg-cyan-500/10' :
                  e.source === 'system' ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' :
                  e.source === 'action' ? 'border-amber-500/40 text-amber-400 bg-amber-500/10' :
                                          'border-border text-muted-foreground'
                }`}>{e.source}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-foreground/90 truncate">{e.headline}</div>
                  {e.detail && <div className="text-[10.5px] text-muted-foreground mt-0.5">{e.detail}</div>}
                  <div className="text-[9.5px] text-muted-foreground/60 mt-0.5">{new Date(e.created_at).toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   CONTROL — pause + reset
═══════════════════════════════════════════════════════════ */

function ControlTab() {
  const { paused, setPaused, resetSettings } = useSeason();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="space-y-6">
      <Section title="Master switch" subtitle="The big red button.">
        <div className={`rounded-xl border p-4 ${
          paused ? 'border-amber-500/40 bg-amber-500/[0.08]' : 'border-emerald-500/40 bg-emerald-500/[0.05]'
        }`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[14px] font-bold text-foreground">
                {paused ? 'S.E.A.S.O.N. is PAUSED' : 'S.E.A.S.O.N. is active'}
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-1">
                {paused
                  ? 'The orb is hidden. Cmd+K does nothing. All LLM calls disabled. Resume when you want it back.'
                  : 'Everything is on. The orb is visible. Cmd+K works. You can use S.E.A.S.O.N.'}
              </div>
            </div>
            <button onClick={() => setPaused(!paused)}
              className={`shrink-0 text-[12px] px-4 py-2 rounded-lg font-bold border transition-colors flex items-center gap-2 ${
                paused
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                  : 'border-amber-500/40 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              }`}>
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {paused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>
      </Section>

      <Section title="Reset settings" subtitle="Wipe all your settings back to defaults. Does not touch wishes or activity log.">
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)}
            className="text-[12px] px-3 py-2 rounded-lg font-bold border border-border text-muted-foreground hover:text-foreground hover:border-amber-500/30 transition-colors flex items-center gap-2">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset all settings
          </button>
        ) : (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.08] p-3">
            <div className="text-[12px] font-bold text-amber-400 mb-2">Are you sure?</div>
            <div className="text-[11.5px] text-muted-foreground mb-3">
              This restores capabilities, tone, verbosity, daily cap, presence, and per-page rules to defaults.
            </div>
            <div className="flex gap-2">
              <button onClick={() => { resetSettings(); setConfirmReset(false); }}
                className="text-[11px] px-3 py-1.5 rounded-md font-bold bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30">
                Yes, reset
              </button>
              <button onClick={() => setConfirmReset(false)}
                className="text-[11px] px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   PRIMITIVES
═══════════════════════════════════════════════════════════ */

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 backdrop-blur-sm">
      <div className="px-4 pt-3 pb-2 border-b border-border">
        <div className="text-[13.5px] font-bold text-foreground">{title}</div>
        {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>}
      </div>
      <div className="p-3 space-y-2">{children}</div>
    </div>
  );
}

function ToggleRow({
  label, desc, checked, onChange, impact, warning, comingSoon, compact,
}: {
  label: string; desc: string; checked: boolean; onChange: () => void;
  impact?: string; warning?: string; comingSoon?: string; compact?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${compact ? 'py-1.5' : 'py-2'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-[12.5px] font-bold text-foreground">{label}</div>
          {comingSoon && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">
              {comingSoon}
            </span>
          )}
        </div>
        {desc && <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>}
        {impact  && <div className="text-[10.5px] text-cyan-400/70 mt-0.5 italic">{impact}</div>}
        {warning && <div className="text-[10.5px] text-amber-400/80 mt-0.5">⚠ {warning}</div>}
      </div>
      <button onClick={onChange}
        className={`shrink-0 relative w-10 h-5 rounded-full transition-colors ${
          checked ? 'bg-cyan-500/60' : 'bg-muted/40'
        }`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-foreground transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`} />
      </button>
    </div>
  );
}

function BoundaryRow({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div className="py-2 flex items-start gap-3">
      <div className="text-base shrink-0">{icon}</div>
      <div className="flex-1">
        <div className="text-[12.5px] font-bold text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

function RadioGroup({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string; desc: string }> }) {
  return (
    <div className="space-y-1.5">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
            value === o.value
              ? 'border-cyan-500/40 bg-cyan-500/[0.08]'
              : 'border-border bg-background/30 hover:border-cyan-500/20'
          }`}>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full border-2 transition-colors ${
              value === o.value ? 'border-cyan-400 bg-cyan-400' : 'border-foreground/30'
            }`} />
            <div className="text-[12.5px] font-bold text-foreground">{o.label}</div>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 ml-5">{o.desc}</div>
        </button>
      ))}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`text-[10.5px] px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? 'border-cyan-500/40 bg-cyan-500/[0.08] text-cyan-400 font-bold'
          : 'border-border text-muted-foreground hover:text-foreground'
      }`}>
      {children}
    </button>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: 'cyan' | 'amber' | 'violet' | 'emerald' }) {
  const colorMap = {
    cyan:    'text-cyan-400 border-cyan-500/30 bg-cyan-500/[0.05]',
    amber:   'text-amber-400 border-amber-500/30 bg-amber-500/[0.05]',
    violet:  'text-violet-400 border-violet-500/30 bg-violet-500/[0.05]',
    emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.05]',
  };
  return (
    <div className={`rounded-lg border p-3 ${colorMap[accent]}`}>
      <div className="text-[10px] uppercase tracking-wider font-bold opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function TriageBtn({ onClick, color, loading, children }: { onClick: () => void; color: 'violet' | 'cyan' | 'emerald' | 'red' | 'amber' | 'muted'; loading?: boolean; children: React.ReactNode }) {
  const m = {
    violet:  'border-violet-500/40 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20',
    cyan:    'border-cyan-500/40 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20',
    emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
    red:     'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20',
    amber:   'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20',
    muted:   'border-border text-muted-foreground hover:text-foreground',
  }[color];
  return (
    <button onClick={onClick} disabled={loading}
      className={`text-[10px] px-2.5 py-1 rounded-md border font-bold transition-colors disabled:opacity-50 ${m}`}>
      {children}
    </button>
  );
}
