/* ════════════════════════════════════════════════════════════════════
   src/components/season/WarRoomSection.tsx
   Phase 21 — Block 2.6 — Strategic War Room UI

   GOAL
     Render the three-tier intelligence panel on the Full Briefing page:

       ✓ GROUNDED       — sourced from live data (GSC, campaigns, inbox)
       ⚠ EXPLORATORY    — LLM analysis grounded in positioning + GSC absence
       🔒 LOCKED        — requires external integrations

   Every claim shows a source badge + refresh timestamp.
   Every panel is one-click into the campaign-creation flow.
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, AlertTriangle, Lock, RefreshCw,
  TrendingUp, Award, Briefcase, Inbox,
  Compass, MapPin, ArrowRight, ExternalLink,
} from 'lucide-react';
import { seoWarRoomBriefing, type WarRoomBriefingClient } from '@/components/pm/api';

interface Props {
  projectId: string | null;
  /** Called when the user clicks a suggestion-like row that should fire a
      campaign-creation command in the chat above. */
  onLaunchCommand?: (command: string) => void;
}

function formatRelative(iso?: string | null): string {
  if (!iso) return '';
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    if (isNaN(then)) return '';
    const sec = Math.max(0, Math.floor((now - then) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}

export default function WarRoomSection({ projectId, onLaunchCommand }: Props) {
  const [briefing, setBriefing] = useState<WarRoomBriefingClient | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function load() {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await seoWarRoomBriefing({ projectId });
      if (r.error) { setError(r.error); setBriefing(null); }
      else setBriefing(r.briefing || null);
    } catch (e: any) {
      setError(e?.message || 'failed to load war room briefing');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  if (!projectId) return null;

  if (loading && !briefing) {
    return (
      <div className="mt-10 rounded-2xl border border-border/40 bg-card/30 p-8 text-center">
        <RefreshCw className="h-5 w-5 mx-auto animate-spin text-muted-foreground/60" />
        <div className="text-xs text-muted-foreground mt-3">Pulling live data — GSC, campaigns, opportunities, positioning…</div>
      </div>
    );
  }

  if (error || !briefing) {
    return (
      <div className="mt-10 rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-5">
        <div className="text-xs text-amber-400/90 font-semibold mb-1">War room briefing unavailable</div>
        <div className="text-xs text-muted-foreground">{error || 'No briefing data returned.'}</div>
        <button
          onClick={load}
          className="mt-3 text-[10px] px-2 py-1 rounded-md border border-amber-500/40 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 font-bold">
          Retry
        </button>
      </div>
    );
  }

  /* Defensive defaults — backend always returns these, but guard against
     payload-shape surprises so the page never crashes the whole UI. */
  const g = {
    recoverable_opportunities: Array.isArray(briefing.grounded?.recoverable_opportunities) ? briefing.grounded.recoverable_opportunities : [],
    top_performers:            Array.isArray(briefing.grounded?.top_performers)            ? briefing.grounded.top_performers            : [],
    existing_campaigns:        Array.isArray(briefing.grounded?.existing_campaigns)        ? briefing.grounded.existing_campaigns        : [],
    inbox_opportunities:       Array.isArray(briefing.grounded?.inbox_opportunities)       ? briefing.grounded.inbox_opportunities       : [],
  };
  const exp = {
    worth_exploring:           Array.isArray(briefing.exploratory?.worth_exploring)        ? briefing.exploratory.worth_exploring        : [],
    positioning_gaps:          Array.isArray(briefing.exploratory?.positioning_gaps)       ? briefing.exploratory.positioning_gaps       : [],
  };
  const lockedItems = Array.isArray(briefing.locked?.items) ? briefing.locked.items : [];
  const toolsStatus = briefing.tools_status || {
    gsc_connected: false, gsc_last_refresh: null,
    ga4_connected: false, ga4_last_refresh: null,
    positioning_resolved: false, positioning_last_refresh: null,
  };
  const groundedCount = g.recoverable_opportunities.length + g.top_performers.length + g.existing_campaigns.length + g.inbox_opportunities.length;
  const exploratoryCount = exp.worth_exploring.length + exp.positioning_gaps.length;

  return (
    <div className="mt-10 space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-cyan-400/90">
            Strategic intelligence
          </div>
          <div className="text-sm text-muted-foreground/80 mt-0.5">
            Every claim cites its source. Locked items show what integration unlocks them.
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-[10px] px-2 py-1 rounded-md border border-border/60 bg-card/40 text-muted-foreground hover:text-foreground hover:border-cyan-500/30 transition-colors flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          {briefing.generated_at && <span>refreshed {formatRelative(briefing.generated_at)}</span>}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TIER 1 — GROUNDED
      ═══════════════════════════════════════════════════════════════ */}
      <TierHeader
        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
        kind="grounded"
        label="GROUNDED"
        sublabel="sourced from your live data"
        count={groundedCount}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recoverable opportunities */}
        <Panel
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          title="Recoverable opportunities"
          subtitle={`${g.recoverable_opportunities.length} queries on page 2–3 within reach`}
          tone="cyan">
          {g.recoverable_opportunities.length === 0 && (
            <EmptyState
              text={toolsStatus.gsc_connected
                ? 'No queries in the recoverable zone (pos 10–30, ≥20 imp/mo) right now.'
                : 'GSC not connected.'}
            />
          )}
          {g.recoverable_opportunities.map((o, i) => (
            <Row
              key={i}
              onClick={onLaunchCommand ? () => onLaunchCommand(`rank me for "${o.query}"`) : undefined}>
              <RowLine main={
                <>
                  <span className="text-foreground">"{o.query}"</span>
                  <span className="text-muted-foreground"> — pos {o.position.toFixed(1)}, {o.impressions} imp/mo, {o.clicks} clicks</span>
                </>
              } />
              {o.landing_url && (
                <div className="text-[9px] text-muted-foreground/60 mt-0.5 truncate">landing: {o.landing_url}</div>
              )}
              <SourceBadge source={o.source} />
            </Row>
          ))}
        </Panel>

        {/* Top performers */}
        <Panel
          icon={<Award className="h-3.5 w-3.5" />}
          title="Top performers"
          subtitle={`${g.top_performers.length} queries already ranking strong`}
          tone="emerald">
          {g.top_performers.length === 0 && (
            <EmptyState text={toolsStatus.gsc_connected ? 'No queries ranking ≤ 10 with ≥ 50 imp/mo yet.' : 'GSC not connected.'} />
          )}
          {g.top_performers.map((o, i) => (
            <Row
              key={i}
              onClick={onLaunchCommand ? () => onLaunchCommand(`rank me for "${o.query}"`) : undefined}>
              <RowLine main={
                <>
                  <span className="text-foreground">"{o.query}"</span>
                  <span className="text-muted-foreground"> — pos {o.position.toFixed(1)}, {o.clicks} clicks/mo</span>
                </>
              } />
              {o.landing_url && (
                <div className="text-[9px] text-muted-foreground/60 mt-0.5 truncate">landing: {o.landing_url}</div>
              )}
              <SourceBadge source={o.source} />
            </Row>
          ))}
        </Panel>

        {/* Existing campaigns */}
        <Panel
          icon={<Briefcase className="h-3.5 w-3.5" />}
          title="Existing campaigns"
          subtitle={`${g.existing_campaigns.length} in flight`}
          tone="violet">
          {g.existing_campaigns.length === 0 && (
            <EmptyState text="No active or paused campaigns in this project yet." />
          )}
          {g.existing_campaigns.map((c, i) => (
            <Row key={i}>
              <RowLine main={
                <>
                  <span className="text-foreground">"{c.keyword}"</span>
                  {Array.isArray(c.keyword_group) && c.keyword_group.length > 1 && (
                    <span className="text-muted-foreground"> + {c.keyword_group.length - 1} more</span>
                  )}
                  <span className="text-muted-foreground"> · {c.status}{c.current_position ? ` · pos ${Number(c.current_position).toFixed(1)}` : ''}</span>
                </>
              } />
              <SourceBadge source={c.source} />
            </Row>
          ))}
        </Panel>

        {/* Inbox opportunities */}
        <Panel
          icon={<Inbox className="h-3.5 w-3.5" />}
          title="Pending in inbox"
          subtitle={`${g.inbox_opportunities.length} opportunities waiting`}
          tone="amber">
          {g.inbox_opportunities.length === 0 && (
            <EmptyState text="Inbox is empty — pillar runs will populate it." />
          )}
          {g.inbox_opportunities.map((o, i) => (
            <Row
              key={i}
              onClick={o.suggested_keyword && onLaunchCommand
                ? () => onLaunchCommand(`rank me for "${o.suggested_keyword}"`)
                : undefined}>
              <RowLine main={
                <>
                  <span className="text-foreground">{o.title}</span>
                  {o.estimated_value && (
                    <span className="text-muted-foreground"> · {o.estimated_value}</span>
                  )}
                </>
              } />
              {o.suggested_action && (
                <div className="text-[9px] text-muted-foreground/60 mt-0.5">action: {o.suggested_action}</div>
              )}
              <SourceBadge source={o.source} />
            </Row>
          ))}
        </Panel>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TIER 2 — EXPLORATORY
      ═══════════════════════════════════════════════════════════════ */}
      <TierHeader
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
        kind="exploratory"
        label="EXPLORATORY"
        sublabel="LLM analysis grounded in positioning + GSC absence — needs validation"
        count={exploratoryCount}
      />

      {!toolsStatus.positioning_resolved && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs text-muted-foreground/80">
          Project positioning hasn't been resolved yet — the exploratory tier appears after the first campaign triggers the positioning resolver.
        </div>
      )}

      {toolsStatus.positioning_resolved && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Worth exploring */}
          <Panel
            icon={<Compass className="h-3.5 w-3.5" />}
            title="Worth exploring"
            subtitle={`${exp.worth_exploring.length} keywords adjacent to your positioning (not yet in GSC)`}
            tone="amber-soft">
            {exp.worth_exploring.length === 0 && (
              <EmptyState text="LLM didn't find strong adjacent keywords beyond what you already have signal for." />
            )}
            {exp.worth_exploring.map((x, i) => (
              <Row
                key={i}
                onClick={onLaunchCommand ? () => onLaunchCommand(`what about ${x.keyword}?`) : undefined}>
                <RowLine main={
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-foreground">"{x.keyword}"</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded ${
                      x.confidence === 'medium'
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'bg-card/60 text-muted-foreground border border-border/40'
                    }`}>
                      confidence: {x.confidence}
                    </span>
                  </div>
                } />
                <div className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">
                  {x.reasoning}
                </div>
                {Array.isArray(x.positioning_citations) && x.positioning_citations.length > 0 && (
                  <div className="text-[9px] text-muted-foreground/55 mt-1 italic">
                    From positioning: {x.positioning_citations.map(c => `"${c}"`).join(', ')}
                  </div>
                )}
                <SourceBadge source={x.source} />
              </Row>
            ))}
          </Panel>

          {/* Positioning gaps */}
          <Panel
            icon={<MapPin className="h-3.5 w-3.5" />}
            title="Positioning gaps"
            subtitle={`${exp.positioning_gaps.length} claimed strengths with no GSC presence`}
            tone="rose">
            {exp.positioning_gaps.length === 0 && (
              <EmptyState text="Your positioning claims are all backed by at least some GSC signal — no blind spots flagged." />
            )}
            {exp.positioning_gaps.map((gap, i) => (
              <Row key={i}>
                <RowLine main={
                  <span className="text-foreground">{gap.topical_area}</span>
                } />
                <div className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">
                  {gap.reasoning}
                </div>
                {gap.gsc_absence_note && (
                  <div className="text-[9px] text-rose-300/70 mt-1">
                    Absence check: {gap.gsc_absence_note}
                  </div>
                )}
                {Array.isArray(gap.positioning_citations) && gap.positioning_citations.length > 0 && (
                  <div className="text-[9px] text-muted-foreground/55 mt-1 italic">
                    Claimed in positioning: {gap.positioning_citations.map(c => `"${c}"`).join(', ')}
                  </div>
                )}
                <SourceBadge source={gap.source} />
              </Row>
            ))}
          </Panel>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TIER 3 — LOCKED
      ═══════════════════════════════════════════════════════════════ */}
      <TierHeader
        icon={<Lock className="h-3.5 w-3.5" />}
        kind="locked"
        label="LOCKED"
        sublabel="requires external integrations"
        count={lockedItems.length}
      />

      <div className="rounded-xl border border-border/50 bg-card/30 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {lockedItems.map((item, i) => (
            <div key={i} className="rounded-lg border border-border/40 bg-card/40 p-3">
              <div className="text-xs font-semibold text-foreground/90">{item.label}</div>
              <div className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">{item.description}</div>
              <div className="text-[10px] text-muted-foreground/60 mt-2">
                Unlocked via: {item.unlock_via}
              </div>
              <a
                href={item.unlock_path}
                className="mt-2 inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-cyan-500/30 bg-cyan-500/[0.06] text-cyan-400 hover:bg-cyan-500/15 transition-colors no-underline font-bold">
                Open Data Room <ArrowRight className="h-2.5 w-2.5" />
              </a>
            </div>
          ))}
        </div>
      </div>

      {briefing.honest_note && (
        <div className="rounded-xl border border-border/40 bg-card/20 p-3 text-[11px] text-muted-foreground/80 italic leading-relaxed">
          {briefing.honest_note}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PRESENTATIONAL HELPERS
══════════════════════════════════════════════════════════════════════ */

function TierHeader({ icon, kind, label, sublabel, count }: {
  icon: React.ReactNode; kind: 'grounded' | 'exploratory' | 'locked';
  label: string; sublabel: string; count: number;
}) {
  const color = kind === 'grounded' ? 'emerald'
              : kind === 'exploratory' ? 'amber'
              : 'slate';
  const borderClass = kind === 'grounded' ? 'border-emerald-500/30'
                    : kind === 'exploratory' ? 'border-amber-500/30'
                    : 'border-slate-500/30';
  const bgClass = kind === 'grounded' ? 'bg-emerald-500/[0.04]'
                : kind === 'exploratory' ? 'bg-amber-500/[0.04]'
                : 'bg-slate-500/[0.04]';
  const textClass = kind === 'grounded' ? 'text-emerald-400'
                  : kind === 'exploratory' ? 'text-amber-400'
                  : 'text-slate-400';

  return (
    <div className={`rounded-lg border ${borderClass} ${bgClass} px-3 py-2 flex items-center justify-between`}>
      <div className="flex items-center gap-2">
        <span className={textClass}>{icon}</span>
        <div className={`text-[10px] uppercase tracking-[0.15em] font-bold ${textClass}`}>{label}</div>
        <div className="text-[11px] text-muted-foreground/70">— {sublabel}</div>
      </div>
      <div className={`text-[10px] ${textClass} font-bold`}>{count} items</div>
    </div>
  );
}

function Panel({ icon, title, subtitle, tone, children }: {
  icon: React.ReactNode; title: string; subtitle: string;
  tone: 'cyan' | 'emerald' | 'violet' | 'amber' | 'amber-soft' | 'rose';
  children: React.ReactNode;
}) {
  const toneClasses: Record<string, string> = {
    cyan:        'border-cyan-500/20 hover:border-cyan-500/40',
    emerald:     'border-emerald-500/20 hover:border-emerald-500/40',
    violet:      'border-violet-500/20 hover:border-violet-500/40',
    amber:       'border-amber-500/20 hover:border-amber-500/40',
    'amber-soft':'border-amber-500/15 hover:border-amber-500/30',
    rose:        'border-rose-500/20 hover:border-rose-500/40',
  };
  const iconClasses: Record<string, string> = {
    cyan:        'text-cyan-400',
    emerald:     'text-emerald-400',
    violet:      'text-violet-400',
    amber:       'text-amber-400',
    'amber-soft':'text-amber-400/80',
    rose:        'text-rose-400',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border bg-card/30 transition-colors ${toneClasses[tone]} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
        <span className={iconClasses[tone]}>{icon}</span>
        <div className="flex-1">
          <div className="text-xs font-bold text-foreground/95">{title}</div>
          <div className="text-[10px] text-muted-foreground/70">{subtitle}</div>
        </div>
      </div>
      <div className="px-4 py-2 space-y-2 max-h-[420px] overflow-y-auto">
        {children}
      </div>
    </motion.div>
  );
}

function Row({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left py-2 px-2 -mx-2 rounded-md hover:bg-card/60 transition-colors block">
        {children}
      </button>
    );
  }
  return (
    <div className="py-2 px-2 -mx-2 block">
      {children}
    </div>
  );
}

function RowLine({ main }: { main: React.ReactNode }) {
  return <div className="text-xs leading-tight">{main}</div>;
}

function SourceBadge({ source }: { source: { kind: string; label: string; last_refresh?: string; table?: string } }) {
  return (
    <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/55 mt-1.5">
      <span className="px-1.5 py-0.5 rounded bg-card/60 border border-border/40 uppercase tracking-wider font-semibold">
        source: {source.kind === 'gsc' ? 'GSC' : source.kind}
      </span>
      <span>·</span>
      <span className="truncate">{source.label}</span>
      {source.last_refresh && (
        <>
          <span>·</span>
          <span>refreshed {formatRelative(source.last_refresh)}</span>
        </>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-[11px] text-muted-foreground/55 italic py-2">{text}</div>
  );
}
