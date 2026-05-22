/* ════════════════════════════════════════════════════════════════════
   src/components/season/WarRoomSection.tsx
   Phase 21 — Block 2.7 — Adaptive War Room

   Restructure of Block 2.6:
     • Accepts filterTerm prop — panels narrow to matches as user types
     • Exploratory + Locked tiers become collapsible accordions
     • Grounded panels show 5 by default with "Show N more" expander
     • Density reduced — single-line source badges
     • Bulletproof defensive defaults (carried from Block 2.6 hotfix)
══════════════════════════════════════════════════════════════════════ */

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, Lock, RefreshCw,
  TrendingUp, Award, Briefcase,
  Compass, MapPin, ArrowRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import { seoWarRoomBriefing, type WarRoomBriefingClient } from '@/components/pm/api';

interface Props {
  projectId:        string | null;
  filterTerm?:      string;
  onLaunchCommand?: (command: string) => void;
}

function formatRelative(iso?: string | null): string {
  if (!iso) return '';
  try {
    const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60); if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);  if (hr < 24)  return `${hr}h ago`;
    const d = Math.floor(hr / 24);    if (d < 30)   return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch { return ''; }
}

function matchesFilter(haystack: string, filter: string): boolean {
  if (!filter || filter.length < 2) return true;
  return haystack.toLowerCase().includes(filter.toLowerCase());
}

export default function WarRoomSection({ projectId, filterTerm, onLaunchCommand }: Props) {
  const [briefing, setBriefing] = useState<WarRoomBriefingClient | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [exploratoryOpen, setExploratoryOpen] = useState(false);
  const [lockedOpen, setLockedOpen]           = useState(false);
  const [expandedPanels, setExpandedPanels]   = useState<Set<string>>(new Set());

  async function load() {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await seoWarRoomBriefing({ projectId });
      if (r.error) { setError(r.error); setBriefing(null); }
      else setBriefing(r.briefing || null);
    } catch (err: any) {
      setError(err?.message || 'failed to load war room briefing');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  const g = useMemo(() => ({
    recoverable_opportunities: Array.isArray(briefing?.grounded?.recoverable_opportunities) ? briefing!.grounded.recoverable_opportunities : [],
    top_performers:            Array.isArray(briefing?.grounded?.top_performers)            ? briefing!.grounded.top_performers            : [],
    existing_campaigns:        Array.isArray(briefing?.grounded?.existing_campaigns)        ? briefing!.grounded.existing_campaigns        : [],
    inbox_opportunities:       Array.isArray(briefing?.grounded?.inbox_opportunities)       ? briefing!.grounded.inbox_opportunities       : [],
  }), [briefing]);

  const exp = useMemo(() => ({
    worth_exploring:  Array.isArray(briefing?.exploratory?.worth_exploring)  ? briefing!.exploratory.worth_exploring  : [],
    positioning_gaps: Array.isArray(briefing?.exploratory?.positioning_gaps) ? briefing!.exploratory.positioning_gaps : [],
  }), [briefing]);

  const lockedItems = Array.isArray(briefing?.locked?.items) ? briefing!.locked.items : [];
  const toolsStatus = briefing?.tools_status || {
    gsc_connected: false, gsc_last_refresh: null,
    ga4_connected: false, ga4_last_refresh: null,
    positioning_resolved: false, positioning_last_refresh: null,
  };

  const filter = (filterTerm || '').trim();
  const filteredOpps = g.recoverable_opportunities.filter(o => matchesFilter(o.query, filter));
  const filteredPerf = g.top_performers.filter(o => matchesFilter(o.query, filter));
  const filteredCampaigns = g.existing_campaigns.filter(c =>
    matchesFilter(c.keyword || '', filter) ||
    (Array.isArray(c.keyword_group) && c.keyword_group.some(k => matchesFilter(k, filter)))
  );
  const filteredInbox = g.inbox_opportunities.filter(o =>
    matchesFilter(o.title || '', filter) ||
    matchesFilter(o.suggested_keyword || '', filter)
  );

  if (!projectId) return null;

  if (loading && !briefing) {
    return (
      <div className="mt-8 rounded-2xl border border-border/40 bg-card/30 p-8 text-center">
        <RefreshCw className="h-5 w-5 mx-auto animate-spin text-muted-foreground/60" />
        <div className="text-xs text-muted-foreground mt-3">Pulling live data — GSC, campaigns, opportunities, positioning…</div>
      </div>
    );
  }

  if (error || !briefing) {
    return (
      <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-5">
        <div className="text-xs text-amber-400/90 font-semibold mb-1">War room briefing unavailable</div>
        <div className="text-xs text-muted-foreground">{error || 'No briefing data returned.'}</div>
        <button onClick={load} className="mt-3 text-[10px] px-2 py-1 rounded-md border border-amber-500/40 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 font-bold">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-cyan-400/90">
            Strategic intelligence
          </div>
          {filter.length >= 2 && (
            <div className="text-[10px] text-muted-foreground/65 italic">
              filtered to "{filter}" · clear input to reset
            </div>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-[10px] px-2 py-1 rounded-md border border-border/60 bg-card/40 text-muted-foreground hover:text-foreground hover:border-cyan-500/30 transition-colors flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          {briefing.generated_at && <span>refreshed {formatRelative(briefing.generated_at)}</span>}
        </button>
      </div>

      {/* TIER 1: GROUNDED — primary surface */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          title="Recoverable opportunities"
          subtitle={`${filteredOpps.length} of ${g.recoverable_opportunities.length} on page 2–3 within reach`}
          tone="cyan"
          expanded={expandedPanels.has('recoverable')}
          onToggleExpand={() => toggle(expandedPanels, setExpandedPanels, 'recoverable')}
          showExpander={filteredOpps.length > 5}>
          {filteredOpps.length === 0 && (
            <EmptyState text={
              filter.length >= 2
                ? `No matches for "${filter}".`
                : toolsStatus.gsc_connected
                  ? 'No queries in the recoverable zone (pos 10–30, ≥20 imp/mo).'
                  : 'GSC not connected.'
            } />
          )}
          {(expandedPanels.has('recoverable') ? filteredOpps : filteredOpps.slice(0, 5)).map((o, i) => (
            <Row key={i} onClick={onLaunchCommand ? () => onLaunchCommand(`rank me for "${o.query}"`) : undefined}>
              <div className="text-xs leading-tight">
                <span className="text-foreground">"{o.query}"</span>
                <span className="text-muted-foreground"> — pos {o.position.toFixed(1)}, {o.impressions} imp/mo, {o.clicks} clicks</span>
              </div>
              {o.landing_url && (
                <div className="text-[9px] text-muted-foreground/55 mt-0.5 truncate">{o.landing_url}</div>
              )}
              <SourceBadgeCompact source={o.source} />
            </Row>
          ))}
        </Panel>

        <Panel
          icon={<Award className="h-3.5 w-3.5" />}
          title="Top performers"
          subtitle={`${filteredPerf.length} of ${g.top_performers.length} already ranking strong`}
          tone="emerald"
          expanded={expandedPanels.has('performers')}
          onToggleExpand={() => toggle(expandedPanels, setExpandedPanels, 'performers')}
          showExpander={filteredPerf.length > 5}>
          {filteredPerf.length === 0 && (
            <EmptyState text={
              filter.length >= 2
                ? `No matches for "${filter}".`
                : toolsStatus.gsc_connected ? 'No queries ranking ≤ 10 with ≥ 50 imp/mo yet.' : 'GSC not connected.'
            } />
          )}
          {(expandedPanels.has('performers') ? filteredPerf : filteredPerf.slice(0, 5)).map((o, i) => (
            <Row key={i} onClick={onLaunchCommand ? () => onLaunchCommand(`rank me for "${o.query}"`) : undefined}>
              <div className="text-xs leading-tight">
                <span className="text-foreground">"{o.query}"</span>
                <span className="text-muted-foreground"> — pos {o.position.toFixed(1)}, {o.clicks} clicks/mo</span>
              </div>
              {o.landing_url && (
                <div className="text-[9px] text-muted-foreground/55 mt-0.5 truncate">{o.landing_url}</div>
              )}
              <SourceBadgeCompact source={o.source} />
            </Row>
          ))}
        </Panel>
      </div>

      {/* IN MOTION — campaigns + inbox horizontal strip */}
      <Panel
        icon={<Briefcase className="h-3.5 w-3.5" />}
        title="In motion"
        subtitle={`${filteredCampaigns.length} campaign${filteredCampaigns.length === 1 ? '' : 's'} · ${filteredInbox.length} opportunit${filteredInbox.length === 1 ? 'y' : 'ies'} pending`}
        tone="violet"
        expanded={expandedPanels.has('in-motion')}
        onToggleExpand={() => toggle(expandedPanels, setExpandedPanels, 'in-motion')}
        showExpander={filteredCampaigns.length > 4 || filteredInbox.length > 4}
        flat>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/65 mb-1.5 font-bold">Existing campaigns</div>
            {filteredCampaigns.length === 0 && <EmptyState text={filter.length >= 2 ? `No campaigns match "${filter}".` : 'No active or paused campaigns yet.'} />}
            <div className="space-y-1.5">
              {(expandedPanels.has('in-motion') ? filteredCampaigns : filteredCampaigns.slice(0, 4)).map((c, i) => (
                <Row key={i}>
                  <div className="text-xs leading-tight">
                    <span className="text-foreground">"{c.keyword}"</span>
                    {Array.isArray(c.keyword_group) && c.keyword_group.length > 1 && (
                      <span className="text-muted-foreground"> +{c.keyword_group.length - 1}</span>
                    )}
                    <span className="text-muted-foreground"> · {c.status}{c.current_position ? ` · pos ${Number(c.current_position).toFixed(1)}` : ''}</span>
                  </div>
                  <SourceBadgeCompact source={c.source} />
                </Row>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/65 mb-1.5 font-bold">Pending in inbox</div>
            {filteredInbox.length === 0 && <EmptyState text={filter.length >= 2 ? `No inbox items match "${filter}".` : 'Inbox is empty — pillar runs populate it.'} />}
            <div className="space-y-1.5">
              {(expandedPanels.has('in-motion') ? filteredInbox : filteredInbox.slice(0, 4)).map((o, i) => (
                <Row
                  key={i}
                  onClick={o.suggested_keyword && onLaunchCommand ? () => onLaunchCommand(`rank me for "${o.suggested_keyword}"`) : undefined}>
                  <div className="text-xs leading-tight">
                    <span className="text-foreground">{o.title}</span>
                    {o.estimated_value && <span className="text-muted-foreground"> · {o.estimated_value}</span>}
                  </div>
                  <SourceBadgeCompact source={o.source} />
                </Row>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {/* TIER 2: EXPLORATORY — accordion */}
      <Accordion
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
        tone="amber"
        label="EXPLORATORY"
        sublabel="LLM-grounded, needs validation"
        count={exp.worth_exploring.length + exp.positioning_gaps.length}
        open={exploratoryOpen}
        onToggle={() => setExploratoryOpen(o => !o)}>
        {!toolsStatus.positioning_resolved && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs text-muted-foreground/80">
            Project positioning hasn't been resolved yet — the exploratory tier appears after the first campaign triggers the positioning resolver.
          </div>
        )}
        {toolsStatus.positioning_resolved && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
            <Panel
              icon={<Compass className="h-3.5 w-3.5" />}
              title="Worth exploring"
              subtitle={`${exp.worth_exploring.length} keywords adjacent to positioning`}
              tone="amber-soft">
              {exp.worth_exploring.length === 0 && (
                <EmptyState text="No strong adjacent keywords beyond existing signal." />
              )}
              {exp.worth_exploring.map((x, i) => (
                <Row key={i} onClick={onLaunchCommand ? () => onLaunchCommand(`what about ${x.keyword}?`) : undefined}>
                  <div className="text-xs leading-tight flex items-center gap-2 flex-wrap">
                    <span className="text-foreground">"{x.keyword}"</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded ${
                      x.confidence === 'medium'
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'bg-card/60 text-muted-foreground border border-border/40'
                    }`}>{x.confidence}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">{x.reasoning}</div>
                  {Array.isArray(x.positioning_citations) && x.positioning_citations.length > 0 && (
                    <div className="text-[9px] text-muted-foreground/55 mt-1 italic">
                      From positioning: {x.positioning_citations.map(c => `"${c}"`).join(', ')}
                    </div>
                  )}
                </Row>
              ))}
            </Panel>

            <Panel
              icon={<MapPin className="h-3.5 w-3.5" />}
              title="Positioning gaps"
              subtitle={`${exp.positioning_gaps.length} claimed strengths with no GSC presence`}
              tone="rose">
              {exp.positioning_gaps.length === 0 && (
                <EmptyState text="All positioning claims have at least some GSC signal." />
              )}
              {exp.positioning_gaps.map((gap, i) => (
                <Row key={i}>
                  <div className="text-xs leading-tight text-foreground">{gap.topical_area}</div>
                  <div className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">{gap.reasoning}</div>
                  {gap.gsc_absence_note && (
                    <div className="text-[9px] text-rose-300/70 mt-1">{gap.gsc_absence_note}</div>
                  )}
                </Row>
              ))}
            </Panel>
          </div>
        )}
      </Accordion>

      {/* TIER 3: LOCKED — growth roadmap accordion */}
      <Accordion
        icon={<Lock className="h-3.5 w-3.5" />}
        tone="slate"
        label="GROWTH ROADMAP"
        sublabel="connect integrations to unlock more"
        count={lockedItems.length}
        open={lockedOpen}
        onToggle={() => setLockedOpen(o => !o)}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {lockedItems.map((item, i) => (
            <div key={i} className="rounded-lg border border-border/40 bg-card/30 p-3">
              <div className="text-xs font-semibold text-foreground/90">{item.label}</div>
              <div className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">{item.description}</div>
              <div className="text-[10px] text-muted-foreground/55 mt-2">Unlock via: {item.unlock_via}</div>
              <a
                href={item.unlock_path}
                className="mt-2 inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-cyan-500/30 bg-cyan-500/[0.06] text-cyan-400 hover:bg-cyan-500/15 transition-colors no-underline font-bold">
                Open Data Room <ArrowRight className="h-2.5 w-2.5" />
              </a>
            </div>
          ))}
        </div>
      </Accordion>

      {briefing.honest_note && (
        <div className="rounded-lg border border-border/40 bg-card/20 p-3 text-[11px] text-muted-foreground/80 italic leading-relaxed">
          {briefing.honest_note}
        </div>
      )}
    </div>
  );
}

function toggle(s: Set<string>, setter: (s: Set<string>) => void, k: string) {
  const n = new Set(s);
  if (n.has(k)) n.delete(k); else n.add(k);
  setter(n);
}

function Panel({ icon, title, subtitle, tone, children, expanded, onToggleExpand, showExpander, flat }: {
  icon: React.ReactNode; title: string; subtitle: string;
  tone: 'cyan' | 'emerald' | 'violet' | 'amber' | 'amber-soft' | 'rose';
  expanded?: boolean; onToggleExpand?: () => void; showExpander?: boolean; flat?: boolean;
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
    cyan: 'text-cyan-400', emerald: 'text-emerald-400', violet: 'text-violet-400',
    amber: 'text-amber-400', 'amber-soft': 'text-amber-400/80', rose: 'text-rose-400',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border bg-card/30 transition-colors ${toneClasses[tone]} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
        <span className={iconClasses[tone]}>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-foreground/95">{title}</div>
          <div className="text-[10px] text-muted-foreground/70">{subtitle}</div>
        </div>
        {showExpander && onToggleExpand && (
          <button
            onClick={onToggleExpand}
            className="text-[10px] text-muted-foreground/60 hover:text-foreground flex items-center gap-1 shrink-0">
            {expanded ? <>Less <ChevronUp className="h-3 w-3" /></> : <>More <ChevronDown className="h-3 w-3" /></>}
          </button>
        )}
      </div>
      <div className={`${flat ? 'px-4 py-3' : 'px-4 py-2 space-y-1.5'}`}>
        {children}
      </div>
    </motion.div>
  );
}

function Accordion({ icon, tone, label, sublabel, count, open, onToggle, children }: {
  icon: React.ReactNode; tone: 'amber' | 'slate';
  label: string; sublabel: string; count: number;
  open: boolean; onToggle: () => void;
  children: React.ReactNode;
}) {
  const borderClass = tone === 'amber' ? 'border-amber-500/30' : 'border-slate-500/25';
  const bgClass     = tone === 'amber' ? 'bg-amber-500/[0.04]' : 'bg-slate-500/[0.03]';
  const textClass   = tone === 'amber' ? 'text-amber-400' : 'text-slate-300';

  return (
    <div className={`rounded-lg border ${borderClass} ${bgClass} overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-card/20 transition-colors">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={textClass}>{icon}</span>
          <div className={`text-[10px] uppercase tracking-[0.15em] font-bold ${textClass}`}>{label}</div>
          <div className="text-[11px] text-muted-foreground/70">— {sublabel}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className={`text-[10px] ${textClass} font-bold`}>{count} items</div>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/60" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden">
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  if (onClick) {
    return (
      <button onClick={onClick} className="w-full text-left py-1.5 px-2 -mx-2 rounded-md hover:bg-card/60 transition-colors block">
        {children}
      </button>
    );
  }
  return <div className="py-1.5 px-2 -mx-2 block">{children}</div>;
}

function SourceBadgeCompact({ source }: { source: { kind: string; label: string; last_refresh?: string } }) {
  return (
    <div className="text-[9px] text-muted-foreground/50 mt-1 truncate">
      <span className="uppercase tracking-wider font-semibold">{source.kind === 'gsc' ? 'GSC' : source.kind}</span>
      {source.last_refresh && <> · {formatRelative(source.last_refresh)}</>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-[11px] text-muted-foreground/55 italic py-1">{text}</div>;
}
