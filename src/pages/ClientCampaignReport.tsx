/* ════════════════════════════════════════════════════════════════════
   src/pages/ClientCampaignReport.tsx
   Phase 22.3 — Deep cinematic campaign report (third client surface).

   A 10-act narrative experience. Designed to convey trust, depth of
   research, and emotional weight. Built for the moment a client opens
   this in front of their board or investor and decides whether to
   continue funding marketing.

   Animation philosophy: feather-light. Soft springs. Long durations.
   Small offsets. Nothing snaps. Nothing bounces. Everything settles.

   Reuses ClientShowcase types + the bs_client_showcase_data backend.
═══════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  motion, AnimatePresence, useScroll, useTransform,
  useMotionValue, useSpring, useReducedMotion, MotionConfig,
} from 'framer-motion';
import {
  X, ChevronRight, ArrowRight, TrendingUp, Target, BookOpen,
  Compass, Microscope, Layers, Activity, Eye, Award, Sparkles,
  CircleAlert, ShieldCheck, Telescope, Hammer,
} from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { getClientShowcase, type ShowcaseDataClient } from '@/components/pm/api';

/* ════════════════════════════════════════════════════════════════════
   DESIGN TOKENS — narrower, more editorial than v2
══════════════════════════════════════════════════════════════════════ */

const COLOR_TOKENS = {
  cyan:     { h: 188, s: 75, l: 60 },
  emerald:  { h: 152, s: 70, l: 55 },
  amethyst: { h: 268, s: 70, l: 65 },
  amber:    { h: 38,  s: 90, l: 60 },
  rose:     { h: 340, s: 75, l: 65 },
  steel:    { h: 220, s: 22, l: 70 },
};

const FEATHER = [0.16, 1, 0.3, 1] as const;       // primary "feather lands" curve
const SOFT_SPRING = { type: 'spring', stiffness: 50, damping: 18, mass: 1.1 } as const;
const LONG_FADE = { duration: 1.4, ease: FEATHER } as const;
const SUBTLE_RISE = { duration: 1.0, ease: FEATHER } as const;

/* ════════════════════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════════════════════ */

export default function ClientCampaignReport() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const { selectedProjectId } = useProject() as any;
  const navigate = useNavigate();
  const projectId = routeProjectId || selectedProjectId;

  const [data, setData] = useState<ShowcaseDataClient | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) { setError('No project selected'); return; }
    (async () => {
      const result = await getClientShowcase({ projectId });
      if (cancelled) return;
      if (result.error) {
        setError(result.error || 'Could not load report data');
        return;
      }
      setData(result.showcase || null);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (error) {
    return (
      <div className="report-root">
        <ReportStyles />
        <div className="report-error">
          <CircleAlert className="h-5 w-5 mb-3 opacity-60" />
          <div className="display-md">Couldn't compose this report</div>
          <div className="prose-soft mt-2">{error}</div>
          <button onClick={() => navigate(-1)} className="report-exit-link mt-6">← Return</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="report-root">
        <ReportStyles />
        <div className="report-loading">
          <motion.div
            className="report-loading-dot"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="label-tiny mt-6">Composing report</div>
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="report-root">
        <ReportStyles />
        <AmbientField />
        <button
          onClick={() => navigate(-1)}
          className="report-exit"
          aria-label="Close report"
        >
          <X className="h-4 w-4" />
        </button>

        <main className="report-stage">
          <Act1ColdOpen data={data} />
          <Act2Brief data={data} />
          <Act3Discovery data={data} />
          <Act4Strategy data={data} />
          <Act5Execution data={data} />
          <Act6Journey data={data} />
          <Act7Findings data={data} />
          <Act8Wins data={data} />
          <Act9Opportunity data={data} />
          <Act10Commitment data={data} />
        </main>
      </div>
    </MotionConfig>
  );
}

/* ════════════════════════════════════════════════════════════════════
   AMBIENT FIELD — subtle background atmosphere
   Slower, gentler than v2. Feels like air, not lighting.
══════════════════════════════════════════════════════════════════════ */

function AmbientField() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const hueShift = useTransform(scrollYProgress, [0, 0.5, 1], [188, 268, 38]);
  const driftY = useTransform(scrollYProgress, [0, 1], [0, -40]);

  const motes = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 0.6 + Math.random() * 2.2,
      depth: Math.random(),
      duration: 30 + Math.random() * 40,
      delay: Math.random() * 30,
    }));
  }, []);

  return (
    <motion.div className="ambient-field" aria-hidden style={{ y: driftY }}>
      <motion.div
        className="ambient-glow ambient-glow-a"
        style={{ ['--ambient-hue' as any]: hueShift }}
      />
      <motion.div
        className="ambient-glow ambient-glow-b"
        style={{ ['--ambient-hue' as any]: hueShift }}
      />
      <div className="ambient-grain" />
      <div className="ambient-vignette" />
      {!reduce && motes.map((m, i) => (
        <motion.div
          key={i}
          className="ambient-mote"
          style={{
            left: `${m.x}%`,
            top: `${m.y}%`,
            width: m.size,
            height: m.size,
            opacity: 0.2 + m.depth * 0.4,
            filter: `blur(${(1 - m.depth) * 1.4}px)`,
          }}
          animate={{ y: [0, -30, 0], opacity: [0.15, 0.45, 0.15] }}
          transition={{
            duration: m.duration,
            delay: m.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ACT 1 — COLD OPEN
   Project name + domain + period. Minimal. Lets you breathe.
══════════════════════════════════════════════════════════════════════ */

function Act1ColdOpen({ data }: { data: ShowcaseDataClient }) {
  const startedDate = data.meta.started_at
    ? new Date(data.meta.started_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <section className="act act-cold-open">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2.0, ease: FEATHER }}
        className="text-center"
      >
        <div className="overline mb-8">Campaign Report</div>
        <TextReveal
          text={data.meta.project_name}
          className="title-xl"
          delay={0.4}
        />
        {data.meta.project_domain && (
          <motion.div
            className="domain-line mt-6"
            initial={{ opacity: 0, letterSpacing: '0.4em' }}
            animate={{ opacity: 0.6, letterSpacing: '0.18em' }}
            transition={{ duration: 1.6, delay: 1.2, ease: FEATHER }}
          >
            {data.meta.project_domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </motion.div>
        )}
        <motion.div
          className="period-line mt-10"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 0.5, y: 0 }}
          transition={{ duration: 1.2, delay: 1.8, ease: FEATHER }}
        >
          {startedDate ? `Engagement begun ${startedDate}` : 'Engagement in progress'}
          {' · '}
          Day {data.meta.days_active}
        </motion.div>

        <ScrollHint />
      </motion.div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ACT 2 — THE BRIEF
   What the work is about, framed simply.
══════════════════════════════════════════════════════════════════════ */

function Act2Brief({ data }: { data: ShowcaseDataClient }) {
  return (
    <section className="act act-brief">
      <div className="act-inner">
        <Overline icon={<BookOpen className="h-3 w-3" />} label="Chapter one · The brief" delay={0} />
        <PrincipleStatement
          quote="Make this brand discoverable to the people already searching."
          attribution="The mandate, distilled"
          delay={0.3}
        />
        <motion.p
          className="prose-large mt-12"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ ...SUBTLE_RISE, delay: 0.6 }}
        >
          Every SEO engagement begins with a question that sounds simple and isn't:
          <em> who is searching for what we offer, and why aren't they finding us yet?</em>
          {' '}
          The pages that follow are how we answered it for {data.meta.project_name} —
          what we discovered, what we built, what's changed, and what comes next.
        </motion.p>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ACT 3 — DISCOVERY
   Research findings, presented as cards that reveal in sequence.
══════════════════════════════════════════════════════════════════════ */

function Act3Discovery({ data }: { data: ShowcaseDataClient }) {
  if (!data.research_findings || data.research_findings.discoveries.length === 0) return null;
  const findings = data.research_findings;

  return (
    <section className="act act-discovery">
      <div className="act-inner">
        <Overline icon={<Microscope className="h-3 w-3" />} label="Chapter two · What we found" delay={0} />
        <SectionTitle
          line1="The research"
          line2="we did first"
          delay={0.2}
        />

        <motion.p
          className="prose-large mt-6"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ ...SUBTLE_RISE, delay: 0.5 }}
        >
          Before writing a single line of strategy, we looked. {findings.discoveries.length} insights came back from{' '}
          {findings.sources_consulted.join(', ').replace(/, ([^,]+)$/, ', and $1')}.
          Each one shaped a decision below.
        </motion.p>

        <div className="discovery-grid mt-16">
          {findings.discoveries.map((d, i) => (
            <DiscoveryCard key={i} discovery={d} index={i} />
          ))}
        </div>

        <SourcesNote sources={findings.sources_consulted} period={findings.research_period} />
      </div>
    </section>
  );
}

function DiscoveryCard({ discovery, index }: {
  discovery: NonNullable<ShowcaseDataClient['research_findings']>['discoveries'][number];
  index: number;
}) {
  const kindMeta: Record<string, { hue: number; label: string; icon: React.ReactNode }> = {
    market:       { hue: 188, label: 'Market signal',    icon: <Compass className="h-3 w-3" /> },
    audience:     { hue: 268, label: 'Audience signal',  icon: <Eye className="h-3 w-3" /> },
    content:      { hue: 38,  label: 'Content signal',   icon: <Layers className="h-3 w-3" /> },
    technical:    { hue: 152, label: 'Technical signal', icon: <ShieldCheck className="h-3 w-3" /> },
    opportunity:  { hue: 340, label: 'Opportunity',      icon: <Telescope className="h-3 w-3" /> },
  };
  const meta = kindMeta[discovery.kind] || kindMeta.market;

  return (
    <motion.div
      className="discovery-card"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12%' }}
      transition={{ duration: 1.0, ease: FEATHER, delay: 0.1 + (index % 3) * 0.12 }}
      style={{
        ['--card-hue' as any]: meta.hue,
      } as React.CSSProperties}
    >
      <div className="discovery-tag">
        <span style={{ color: `hsl(${meta.hue}, 65%, 70%)` }}>{meta.icon}</span>
        <span>{meta.label}</span>
        <ConfidencePip confidence={discovery.confidence} hue={meta.hue} />
      </div>
      <div className="discovery-headline">{discovery.headline}</div>
      <div className="discovery-narrative">{discovery.narrative}</div>
      {discovery.data_point && (
        <div className="discovery-data" style={{ color: `hsl(${meta.hue}, 65%, 75%)` }}>
          {discovery.data_point}
        </div>
      )}
    </motion.div>
  );
}

function ConfidencePip({ confidence, hue }: { confidence: 'high' | 'medium' | 'observational'; hue: number }) {
  const dots = confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;
  return (
    <span className="confidence-pip" aria-label={`Confidence: ${confidence}`}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="confidence-dot"
          style={{
            background: i < dots ? `hsl(${hue}, 65%, 65%)` : 'rgba(255,255,255,0.15)',
          }}
        />
      ))}
    </span>
  );
}

function SourcesNote({ sources, period }: { sources: string[]; period: string }) {
  return (
    <motion.div
      className="sources-note mt-16"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 0.55 }}
      viewport={{ once: true }}
      transition={{ duration: 1.4, ease: FEATHER, delay: 0.4 }}
    >
      <span className="label-tiny">Sourced from</span>
      <span className="sources-list">{sources.join(' · ')}</span>
      <span className="sources-period">{period}</span>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ACT 4 — STRATEGY
   The bet we placed. Visualized as connected principles.
══════════════════════════════════════════════════════════════════════ */

function Act4Strategy({ data }: { data: ShowcaseDataClient }) {
  return (
    <section className="act act-strategy">
      <div className="act-inner">
        <Overline icon={<Compass className="h-3 w-3" />} label="Chapter three · The bet" delay={0} />
        <SectionTitle line1="Strategy as" line2="a few decisions" delay={0.2} />

        <motion.p
          className="prose-large mt-6"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ ...SUBTLE_RISE, delay: 0.5 }}
        >
          Strategy lives in the few decisions you commit to early — the ones that compound or
          break later. Here are the four that shape this engagement.
        </motion.p>

        <div className="strategy-stack mt-14">
          <StrategyPrinciple
            number="01"
            principle="Pillar architecture, not scattered posts."
            elaboration="Each topic becomes a campaign with five pillars — cluster mapping, internal linking, off-page authority, content, and continuous monitoring. The structure exists to compound over time, not perform once."
            delay={0.1}
          />
          <StrategyPrinciple
            number="02"
            principle="Defend what's ranking. Push what's climbing."
            elaboration="Most agencies obsess over new keywords. Half of every cycle here goes to lifting page-2 pages onto page one and rewriting under-converting page-1 metadata — work nobody talks about because it doesn't sound new."
            delay={0.2}
          />
          <StrategyPrinciple
            number="03"
            principle="Baseline everything. Measure honestly."
            elaboration="Every active campaign carries a monitoring snapshot taken at start. Every movement reports against that baseline. No retroactive comparisons. No 'compared to before we knew you' math."
            delay={0.3}
          />
          <StrategyPrinciple
            number="04"
            principle="Slow trust beats fast spike."
            elaboration="Compounding visibility doesn't look like a hockey stick. It looks like a curve you only see at three-month intervals. The cadence below is what makes the curve possible."
            delay={0.4}
          />
        </div>
      </div>
    </section>
  );
}

function StrategyPrinciple({ number, principle, elaboration, delay }: {
  number: string; principle: string; elaboration: string; delay: number;
}) {
  return (
    <motion.div
      className="strategy-principle"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ duration: 1.2, ease: FEATHER, delay }}
    >
      <div className="strategy-number">{number}</div>
      <div className="strategy-body">
        <div className="strategy-principle-text">{principle}</div>
        <div className="strategy-elaboration">{elaboration}</div>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ACT 5 — EXECUTION
   What we shipped. Counters animating up. Honest about what was done.
══════════════════════════════════════════════════════════════════════ */

function Act5Execution({ data }: { data: ShowcaseDataClient }) {
  if (!data.execution_stats) return null;
  const stats = data.execution_stats;

  const cards = [
    { label: 'Content pieces',      value: stats.content_pieces,    icon: <Layers className="h-4 w-4" />,      hue: 188 },
    { label: 'Internal links',      value: stats.internal_links,    icon: <Activity className="h-4 w-4" />,    hue: 268 },
    { label: 'Off-page actions',    value: stats.off_page_actions,  icon: <Telescope className="h-4 w-4" />,   hue: 38  },
    { label: 'Technical fixes',     value: stats.technical_fixes,   icon: <Hammer className="h-4 w-4" />,      hue: 340 },
    { label: 'Monitoring checks',   value: stats.monitoring_checks, icon: <ShieldCheck className="h-4 w-4" />, hue: 152 },
    { label: 'Pillar runs',         value: stats.pillar_runs,       icon: <Award className="h-4 w-4" />,       hue: 220 },
  ];

  return (
    <section className="act act-execution">
      <div className="act-inner">
        <Overline icon={<Hammer className="h-3 w-3" />} label="Chapter four · What was built" delay={0} />
        <SectionTitle line1="The work itself" line2={`${stats.total_actions.toLocaleString()} actions across ${stats.days_active} days`} delay={0.2} />

        <motion.p
          className="prose-large mt-6"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ ...SUBTLE_RISE, delay: 0.5 }}
        >
          Not estimates. Not projections. The actual count of moves made on your behalf —
          drawn directly from the activity log and pillar reports. The cadence works out
          to roughly <strong>{stats.cadence_per_week} actions per week</strong>, sustained.
        </motion.p>

        <div className="execution-grid mt-14">
          {cards.map((c, i) => (
            <ExecutionStatCard key={i} {...c} index={i} />
          ))}
        </div>

        <motion.div
          className="execution-cadence-note mt-14"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.7 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: FEATHER, delay: 0.6 }}
        >
          Every action above produced a record. Nothing here is rounded up.
        </motion.div>
      </div>
    </section>
  );
}

function ExecutionStatCard({ label, value, icon, hue, index }: {
  label: string; value: number; icon: React.ReactNode; hue: number; index: number;
}) {
  return (
    <motion.div
      className="exec-card"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ duration: 1.0, ease: FEATHER, delay: 0.1 + (index % 3) * 0.1 }}
      style={{ ['--card-hue' as any]: hue } as React.CSSProperties}
    >
      <div className="exec-icon" style={{ color: `hsl(${hue}, 65%, 70%)` }}>{icon}</div>
      <CounterNumber value={value} className="exec-number" hue={hue} />
      <div className="exec-label">{label}</div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ACT 6 — THE JOURNEY
   Weekly activity heartbeat. Spine chart showing rhythm.
══════════════════════════════════════════════════════════════════════ */

function Act6Journey({ data }: { data: ShowcaseDataClient }) {
  if (!data.weekly_journey || data.weekly_journey.weeks.length === 0) return null;
  const journey = data.weekly_journey;
  const maxCount = Math.max(1, ...journey.weeks.map(w => w.action_count));

  return (
    <section className="act act-journey">
      <div className="act-inner">
        <Overline icon={<Activity className="h-3 w-3" />} label="Chapter five · The rhythm" delay={0} />
        <SectionTitle line1="What" line2={journey.streak_label.toLowerCase()} delay={0.2} />

        <motion.p
          className="prose-large mt-6"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ ...SUBTLE_RISE, delay: 0.5 }}
        >
          The pulse of work across the engagement. Each bar is a week. Each color marks
          what kind of action filled it — green for wins, gray for routine work, amber for
          things that needed attention.
        </motion.p>

        <div className="journey-chart mt-16">
          {journey.weeks.map((w, i) => (
            <JourneyWeek
              key={w.week_start}
              week={w}
              maxCount={maxCount}
              index={i}
              total={journey.weeks.length}
            />
          ))}
        </div>

        {journey.weeks.some(w => w.milestone) && (
          <div className="journey-milestones mt-16">
            <div className="overline mb-6" style={{ opacity: 0.6 }}>Notable moments</div>
            <div className="milestone-list">
              {journey.weeks.filter(w => w.milestone).reverse().slice(0, 5).map((w, i) => (
                <motion.div
                  key={w.week_start}
                  className="milestone-row"
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-10%' }}
                  transition={{ duration: 0.9, ease: FEATHER, delay: 0.1 + i * 0.08 }}
                >
                  <div className="milestone-date">{w.week_label}</div>
                  <div className="milestone-text">{w.milestone}</div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function JourneyWeek({ week, maxCount, index, total }: {
  week: NonNullable<ShowcaseDataClient['weekly_journey']>['weeks'][number];
  maxCount: number; index: number; total: number;
}) {
  const totalCount = week.severity_mix.success + week.severity_mix.info + week.severity_mix.warning + week.severity_mix.alert;
  const height = (week.action_count / maxCount) * 100;
  const has = totalCount > 0;
  const successPct = has ? (week.severity_mix.success / totalCount) * 100 : 0;
  const warningPct = has ? (week.severity_mix.warning / totalCount) * 100 : 0;
  const alertPct = has ? (week.severity_mix.alert / totalCount) * 100 : 0;
  const infoPct = has ? (week.severity_mix.info / totalCount) * 100 : 0;

  return (
    <motion.div
      className="journey-week"
      initial={{ opacity: 0, scaleY: 0 }}
      whileInView={{ opacity: 1, scaleY: 1 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 0.9, ease: FEATHER, delay: 0.05 + (index / total) * 0.6 }}
      style={{ transformOrigin: 'bottom' }}
    >
      <div className="journey-week-bar" style={{ height: `${height}%` }}>
        {successPct > 0 && <div style={{ height: `${successPct}%`, background: 'hsla(152, 65%, 55%, 0.85)' }} />}
        {alertPct > 0 && <div style={{ height: `${alertPct}%`, background: 'hsla(0, 75%, 60%, 0.75)' }} />}
        {warningPct > 0 && <div style={{ height: `${warningPct}%`, background: 'hsla(38, 90%, 60%, 0.75)' }} />}
        {infoPct > 0 && <div style={{ height: `${infoPct}%`, background: 'hsla(220, 18%, 55%, 0.5)' }} />}
      </div>
      {(index === 0 || index === total - 1 || index % Math.max(1, Math.floor(total / 4)) === 0) && (
        <div className="journey-week-label">{week.week_label.replace('Week of ', '')}</div>
      )}
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ACT 7 — FINDINGS (what the data showed)
══════════════════════════════════════════════════════════════════════ */

function Act7Findings({ data }: { data: ShowcaseDataClient }) {
  if (!data.visibility_pulse && !data.keyword_movers && !data.content_health) return null;

  return (
    <section className="act act-findings">
      <div className="act-inner">
        <Overline icon={<Eye className="h-3 w-3" />} label="Chapter six · What the data said" delay={0} />
        <SectionTitle line1="What the work" line2="actually surfaced" delay={0.2} />

        {data.visibility_pulse && (
          <FindingBlock
            label="Visibility"
            headline={data.visibility_pulse.period_delta_pct >= 0
              ? `Click volume trended up ${data.visibility_pulse.period_delta_pct.toFixed(0)}% half-over-half.`
              : `Click volume softened ${Math.abs(data.visibility_pulse.period_delta_pct).toFixed(0)}% half-over-half — addressed in opportunities below.`}
            data={[
              { k: 'Total clicks',       v: data.visibility_pulse.total_clicks.toLocaleString() },
              { k: 'Total impressions', v: data.visibility_pulse.total_impressions.toLocaleString() },
              { k: 'Window',             v: data.visibility_pulse.window_label },
            ]}
            interpretation="A 90-day window smooths over single-day algorithm noise. The half-over-half comparison gives a clean directional read."
            delay={0.4}
          />
        )}

        {data.keyword_movers && (
          <FindingBlock
            label="Keyword movement"
            headline={`${data.keyword_movers.winners.length} keywords climbed. ${data.keyword_movers.losers.length} slipped.`}
            data={[
              { k: 'Winners',  v: data.keyword_movers.winners.length.toString() },
              { k: 'Slipping', v: data.keyword_movers.losers.length.toString() },
              { k: 'Holding',  v: data.keyword_movers.holding.length.toString() },
            ]}
            interpretation={data.keyword_movers.methodology}
            delay={0.5}
          />
        )}

        {data.content_health && (
          <FindingBlock
            label="Content health"
            headline={`${data.content_health.tier_counts.hero} hero pages, ${data.content_health.tier_counts.climbing} climbing toward page one, ${data.content_health.tier_counts.plateau} plateaued, ${data.content_health.tier_counts.underperforming} need re-evaluation.`}
            data={[
              { k: 'Heroes',           v: data.content_health.tier_counts.hero.toString() },
              { k: 'Climbing',         v: data.content_health.tier_counts.climbing.toString() },
              { k: 'Plateaued',        v: data.content_health.tier_counts.plateau.toString() },
              { k: 'Underperforming',  v: data.content_health.tier_counts.underperforming.toString() },
            ]}
            interpretation="Every page lives in one of four tiers. Each tier has its own action — defending heroes, lifting climbers, rewriting plateaus, re-evaluating underperformers."
            delay={0.6}
          />
        )}

        {data.intent_distribution && (
          <FindingBlock
            label="Intent profile"
            headline="The audience arriving from search has a measurable shape."
            data={[
              { k: 'Branded',       v: `${data.intent_distribution.branded.clicks.toLocaleString()} clicks` },
              { k: 'Informational', v: `${data.intent_distribution.informational.clicks.toLocaleString()} clicks` },
              { k: 'Commercial',    v: `${data.intent_distribution.commercial.clicks.toLocaleString()} clicks` },
              { k: 'Transactional', v: `${data.intent_distribution.transactional.clicks.toLocaleString()} clicks` },
            ]}
            interpretation={data.intent_distribution.classification_note}
            delay={0.7}
          />
        )}
      </div>
    </section>
  );
}

function FindingBlock({ label, headline, data, interpretation, delay }: {
  label: string; headline: string;
  data: Array<{ k: string; v: string }>;
  interpretation: string; delay: number;
}) {
  return (
    <motion.div
      className="finding-block"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12%' }}
      transition={{ duration: 1.2, ease: FEATHER, delay }}
    >
      <div className="finding-label">{label}</div>
      <div className="finding-headline">{headline}</div>
      <div className="finding-data">
        {data.map((d, i) => (
          <div key={i} className="finding-data-cell">
            <div className="finding-data-key">{d.k}</div>
            <div className="finding-data-value">{d.v}</div>
          </div>
        ))}
      </div>
      <div className="finding-interpretation">
        <span className="overline" style={{ opacity: 0.5 }}>Interpretation</span>
        {interpretation}
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ACT 8 — WINS (specific, attributed)
══════════════════════════════════════════════════════════════════════ */

function Act8Wins({ data }: { data: ShowcaseDataClient }) {
  if (!data.wins || data.wins.length === 0) return null;

  return (
    <section className="act act-wins">
      <div className="act-inner">
        <Overline icon={<Award className="h-3 w-3" />} label="Chapter seven · Wins worth showing" delay={0} />
        <SectionTitle line1="The moments" line2="that earned attention" delay={0.2} />

        <motion.p
          className="prose-large mt-6"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ ...SUBTLE_RISE, delay: 0.5 }}
        >
          Selected from the activity stream. Each entry is verifiable in the underlying
          system — no synthesized wins. Listed in order of weight.
        </motion.p>

        <div className="wins-list mt-14">
          {data.wins.slice(0, 10).map((w, i) => (
            <WinRow key={i} win={w} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function WinRow({ win, index }: { win: ShowcaseDataClient['wins'][number]; index: number }) {
  const intensityHue = win.intensity === 'dramatic' ? 152 : win.intensity === 'moderate' ? 188 : 220;
  return (
    <motion.div
      className="win-row"
      initial={{ opacity: 0, x: -16 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 1.0, ease: FEATHER, delay: 0.05 + index * 0.05 }}
      style={{ ['--win-hue' as any]: intensityHue } as React.CSSProperties}
    >
      <div className="win-mark" style={{ background: `hsl(${intensityHue}, 70%, 60%)` }} />
      <div className="win-content">
        <div className="win-title">{win.title}</div>
        {win.metric_text && <div className="win-metric">{win.metric_text}</div>}
      </div>
      <div className="win-when">{win.when_relative}</div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ACT 9 — OPPORTUNITY (forward-looking)
══════════════════════════════════════════════════════════════════════ */

function Act9Opportunity({ data }: { data: ShowcaseDataClient }) {
  if (!data.opportunities_detailed || data.opportunities_detailed.items.length === 0) return null;
  const opp = data.opportunities_detailed;

  return (
    <section className="act act-opportunity">
      <div className="act-inner">
        <Overline icon={<Telescope className="h-3 w-3" />} label="Chapter eight · What comes next" delay={0} />
        <SectionTitle line1="The opportunity" line2="ahead, ranked" delay={0.2} />

        <motion.p
          className="prose-large mt-6"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ ...SUBTLE_RISE, delay: 0.5 }}
        >
          Not generic SEO advice. Each opportunity below is anchored to a specific data
          column in this report and ranked by the ratio of data-confirmed potential to
          implementation effort.
        </motion.p>

        <div className="opp-grid mt-14">
          {opp.items.map((item, i) => (
            <OpportunityCard key={i} opp={item} index={i} />
          ))}
        </div>

        <motion.div
          className="opp-methodology mt-14"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.6 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: FEATHER, delay: 0.6 }}
        >
          {opp.methodology}
        </motion.div>
      </div>
    </section>
  );
}

function OpportunityCard({ opp, index }: {
  opp: NonNullable<ShowcaseDataClient['opportunities_detailed']>['items'][number];
  index: number;
}) {
  const impactHue = opp.impact === 'transformational' ? 268 : opp.impact === 'meaningful' ? 152 : 188;
  const effortLabel = opp.effort === 'small' ? 'Small effort' : opp.effort === 'medium' ? 'Medium effort' : 'Large effort';
  const impactLabel = opp.impact === 'transformational' ? 'Transformational' : opp.impact === 'meaningful' ? 'Meaningful' : 'Incremental';

  return (
    <motion.div
      className="opp-card"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12%' }}
      transition={{ duration: 1.2, ease: FEATHER, delay: 0.1 + (index % 2) * 0.12 }}
      style={{ ['--card-hue' as any]: impactHue } as React.CSSProperties}
    >
      <div className="opp-rank">{String(index + 1).padStart(2, '0')}</div>
      <div className="opp-body">
        <div className="opp-title">{opp.title}</div>
        <div className="opp-rationale">{opp.rationale}</div>
        <div className="opp-meta">
          <span className="opp-meta-cell">
            <span className="opp-meta-label">Impact</span>
            <span className="opp-meta-value" style={{ color: `hsl(${impactHue}, 65%, 75%)` }}>{impactLabel}</span>
          </span>
          <span className="opp-meta-cell">
            <span className="opp-meta-label">Effort</span>
            <span className="opp-meta-value">{effortLabel}</span>
          </span>
          <span className="opp-meta-cell">
            <span className="opp-meta-label">Horizon</span>
            <span className="opp-meta-value">{opp.time_horizon}</span>
          </span>
        </div>
        <div className="opp-basis">
          <span className="overline" style={{ opacity: 0.5 }}>Data basis</span>
          {opp.data_basis}
        </div>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ACT 10 — COMMITMENT (closing)
══════════════════════════════════════════════════════════════════════ */

function Act10Commitment({ data }: { data: ShowcaseDataClient }) {
  return (
    <section className="act act-commitment">
      <div className="act-inner text-center">
        <Overline icon={<ShieldCheck className="h-3 w-3" />} label="Closing · What we're accountable for" delay={0} center />

        <motion.div
          className="commitment-statement mt-12"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ duration: 1.4, ease: FEATHER, delay: 0.2 }}
        >
          <div className="commitment-line">
            Honest data, sourced. Decisions, named. Numbers, traceable.
          </div>
          <div className="commitment-line">
            Cadence we can sustain. Outcomes we'll own.
          </div>
        </motion.div>

        {data.transparency && (
          <motion.div
            className="transparency-block mt-16"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: FEATHER, delay: 0.4 }}
          >
            <div className="overline" style={{ opacity: 0.55 }}>Methodology</div>
            <div className="transparency-sources mt-4">
              {data.transparency.data_sources.map((s, i) => (
                <span key={i} className="transparency-source">
                  {s.name}
                  {s.last_synced && <span className="transparency-sync">· synced {relativeDate(s.last_synced)}</span>}
                </span>
              ))}
            </div>
            <div className="transparency-period mt-3">
              {data.transparency.audit_run_count} audit runs over {data.transparency.audit_period}
            </div>
            {data.transparency.honest_gaps.length > 0 && (
              <div className="transparency-gaps mt-6">
                <span className="overline" style={{ opacity: 0.5 }}>Known gaps</span>
                <ul className="transparency-gaps-list">
                  {data.transparency.honest_gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}

        <motion.div
          className="signature mt-20"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.5 }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, ease: FEATHER, delay: 0.7 }}
        >
          <div className="signature-mark">SEO Season</div>
          <div className="signature-line">A report generated from live data. Updated continuously.</div>
          <div className="signature-stamp">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </motion.div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SHARED COMPONENTS — text reveal, overline, counter, scroll hint
══════════════════════════════════════════════════════════════════════ */

function TextReveal({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{text}</div>;
  }
  /* Split into words, then characters within words — words wrap, characters reveal */
  const words = text.split(/\s+/);
  let charIdx = 0;
  return (
    <div className={className}>
      {words.map((w, wi) => (
        <span key={wi} style={{ display: 'inline-block', whiteSpace: 'nowrap', marginRight: '0.25em' }}>
          {Array.from(w).map((ch, ci) => {
            const myIdx = charIdx++;
            return (
              <motion.span
                key={ci}
                style={{ display: 'inline-block' }}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: FEATHER, delay: delay + myIdx * 0.03 }}
              >
                {ch}
              </motion.span>
            );
          })}
        </span>
      ))}
    </div>
  );
}

function Overline({ icon, label, delay = 0, center = false }: {
  icon: React.ReactNode; label: string; delay?: number; center?: boolean;
}) {
  return (
    <motion.div
      className="overline-row"
      style={{ justifyContent: center ? 'center' : 'flex-start' }}
      initial={{ opacity: 0, x: center ? 0 : -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ duration: 1.0, ease: FEATHER, delay }}
    >
      <span className="overline-icon">{icon}</span>
      <span className="overline">{label}</span>
    </motion.div>
  );
}

function SectionTitle({ line1, line2, delay = 0 }: { line1: string; line2: string; delay?: number }) {
  return (
    <h2 className="section-title">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 1.2, ease: FEATHER, delay }}
      >
        {line1}
      </motion.div>
      <motion.div
        className="section-title-2"
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 1.2, ease: FEATHER, delay: delay + 0.15 }}
      >
        {line2}
      </motion.div>
    </h2>
  );
}

function PrincipleStatement({ quote, attribution, delay = 0 }: {
  quote: string; attribution: string; delay: number;
}) {
  return (
    <motion.blockquote
      className="principle-statement mt-12"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ duration: 1.6, ease: FEATHER, delay }}
    >
      <div className="principle-mark">"</div>
      <div className="principle-quote">{quote}</div>
      <div className="principle-attribution">— {attribution}</div>
    </motion.blockquote>
  );
}

function CounterNumber({ value, className, hue }: { value: number; className?: string; hue?: number }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) { setN(value); return; }
    const ref = { cancelled: false };
    const start = performance.now();
    const duration = 1600;
    const step = (now: number) => {
      if (ref.cancelled) return;
      const t = Math.min(1, (now - start) / duration);
      // ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.floor(value * eased));
      if (t < 1) requestAnimationFrame(step);
      else setN(value);
    };
    requestAnimationFrame(step);
    return () => { ref.cancelled = true; };
  }, [value, reduce]);

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ duration: 1.0, ease: FEATHER }}
      style={hue ? { color: `hsl(${hue}, 65%, 78%)` } : undefined}
    >
      {n.toLocaleString()}
    </motion.div>
  );
}

function ScrollHint() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <motion.div
      className="scroll-hint"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.7, 0.7, 0] }}
      transition={{ duration: 5, delay: 3, repeat: Infinity, repeatDelay: 1 }}
    >
      <div className="scroll-hint-text">Scroll</div>
      <motion.div
        className="scroll-hint-line"
        animate={{ scaleY: [0, 1, 1, 0], originY: [0, 0, 1, 1] }}
        transition={{ duration: 5, delay: 3, repeat: Infinity, repeatDelay: 1 }}
      />
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════ */

function relativeDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/* ════════════════════════════════════════════════════════════════════
   STYLES — editorial, restrained, expressive at hinge points
══════════════════════════════════════════════════════════════════════ */

function ReportStyles() {
  return (
    <style>{`
      :root {
        --bg-deep:        12 14 22;        /* near-black with blue cast */
        --bg-surface:     22 26 38;
        --ink-soft:       rgba(245, 247, 255, 0.55);
        --ink-medium:     rgba(245, 247, 255, 0.78);
        --ink-strong:     rgba(245, 247, 255, 0.95);
        --hairline:       rgba(255, 255, 255, 0.08);
        --hairline-strong: rgba(255, 255, 255, 0.14);
      }

      .report-root {
        min-height: 100vh;
        background: rgb(var(--bg-deep));
        color: rgb(var(--ink-strong));
        font-family: ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif;
        position: relative;
        overflow-x: hidden;
        -webkit-font-smoothing: antialiased;
      }

      .report-stage {
        position: relative;
        z-index: 2;
        max-width: 980px;
        margin: 0 auto;
        padding: 0 2rem;
      }

      .report-exit {
        position: fixed;
        top: 1.5rem; right: 1.5rem;
        z-index: 10;
        width: 44px; height: 44px;
        border-radius: 50%;
        background: rgba(20, 22, 32, 0.7);
        border: 0.5px solid var(--hairline-strong);
        color: rgba(245, 247, 255, 0.7);
        backdrop-filter: blur(12px) saturate(140%);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: all 0.4s ${`cubic-bezier(0.16, 1, 0.3, 1)`};
      }
      .report-exit:hover {
        color: rgba(245, 247, 255, 1);
        border-color: rgba(255,255,255,0.3);
        transform: scale(1.06);
      }
      .report-exit-link {
        color: var(--ink-medium);
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.85rem;
        background: transparent;
        border: none;
        cursor: pointer;
        letter-spacing: 0.05em;
      }

      .report-error, .report-loading {
        min-height: 60vh;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        text-align: center;
        padding: 4rem 2rem;
      }
      .report-loading-dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: rgba(245, 247, 255, 0.6);
        box-shadow: 0 0 24px rgba(245, 247, 255, 0.4);
      }

      /* AMBIENT FIELD */
      .ambient-field {
        position: fixed; inset: 0;
        z-index: 1;
        pointer-events: none;
        overflow: hidden;
      }
      .ambient-glow {
        position: absolute;
        border-radius: 50%;
        filter: blur(120px);
      }
      .ambient-glow-a {
        top: -10%; left: -10%;
        width: 60vw; height: 60vw;
        background: radial-gradient(circle, hsla(var(--ambient-hue, 188), 65%, 55%, 0.18), transparent 70%);
      }
      .ambient-glow-b {
        bottom: -15%; right: -10%;
        width: 70vw; height: 70vw;
        background: radial-gradient(circle, hsla(var(--ambient-hue, 188), 70%, 65%, 0.13), transparent 70%);
      }
      .ambient-grain {
        position: absolute; inset: 0;
        background-image: radial-gradient(rgba(255,255,255,0.04) 0.5px, transparent 0.5px);
        background-size: 4px 4px;
        opacity: 0.5;
        mix-blend-mode: overlay;
      }
      .ambient-vignette {
        position: absolute; inset: 0;
        background: radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 110%);
      }
      .ambient-mote {
        position: absolute;
        border-radius: 50%;
        background: rgba(245, 247, 255, 0.55);
        pointer-events: none;
      }

      /* TYPOGRAPHY */
      .title-xl {
        font-size: clamp(3rem, 8vw, 6.5rem);
        line-height: 0.96;
        letter-spacing: -0.04em;
        font-weight: 400;
        color: var(--ink-strong);
      }
      .section-title {
        font-size: clamp(2.2rem, 5vw, 3.6rem);
        line-height: 1.04;
        letter-spacing: -0.025em;
        font-weight: 400;
        color: var(--ink-strong);
        margin: 0.5rem 0 0 0;
      }
      .section-title-2 {
        color: var(--ink-medium);
        font-style: italic;
      }
      .display-md {
        font-size: 1.6rem;
        font-weight: 400;
        letter-spacing: -0.01em;
      }
      .overline {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--ink-soft);
      }
      .overline-row {
        display: flex; align-items: center;
        gap: 0.7rem;
      }
      .overline-icon {
        display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px;
        border-radius: 50%;
        border: 0.5px solid var(--hairline-strong);
        background: rgba(255, 255, 255, 0.03);
        color: var(--ink-medium);
      }
      .label-tiny {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.6875rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--ink-soft);
      }
      .prose-large {
        font-size: 1.25rem;
        line-height: 1.65;
        color: var(--ink-medium);
        max-width: 64ch;
        font-weight: 400;
      }
      .prose-large em {
        color: var(--ink-strong);
        font-style: italic;
      }
      .prose-large strong {
        color: var(--ink-strong);
        font-weight: 500;
      }
      .prose-soft {
        font-size: 0.95rem;
        line-height: 1.6;
        color: var(--ink-soft);
        max-width: 56ch;
      }

      .domain-line {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--ink-soft);
        text-transform: uppercase;
      }
      .period-line {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.8125rem;
        color: var(--ink-soft);
        letter-spacing: 0.04em;
      }

      /* ACTS — generous vertical rhythm */
      .act {
        min-height: 92vh;
        padding: 8rem 0;
        display: flex;
        align-items: center;
        position: relative;
      }
      .act-cold-open {
        min-height: 100vh;
        padding-top: 12vh;
      }
      .act-commitment {
        min-height: 96vh;
        padding-bottom: 12vh;
      }
      .act-inner {
        width: 100%;
      }

      /* SCROLL HINT */
      .scroll-hint {
        position: absolute;
        bottom: 8vh; left: 50%;
        transform: translateX(-50%);
        display: flex; flex-direction: column;
        align-items: center;
        gap: 0.75rem;
      }
      .scroll-hint-text {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.625rem;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: var(--ink-soft);
      }
      .scroll-hint-line {
        width: 1px; height: 60px;
        background: linear-gradient(180deg, var(--ink-soft), transparent);
      }

      /* PRINCIPLE STATEMENT */
      .principle-statement {
        text-align: center;
        max-width: 36ch;
        margin: 0 auto;
        padding: 2.5rem 0;
        position: relative;
      }
      .principle-mark {
        position: absolute;
        top: -1rem; left: 50%;
        transform: translateX(-50%);
        font-size: 4rem;
        line-height: 1;
        color: rgba(255, 255, 255, 0.12);
        font-style: italic;
      }
      .principle-quote {
        font-size: 1.7rem;
        line-height: 1.4;
        font-weight: 400;
        font-style: italic;
        color: var(--ink-strong);
      }
      .principle-attribution {
        margin-top: 1.25rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.75rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--ink-soft);
      }

      /* DISCOVERY GRID */
      .discovery-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.5rem;
      }
      .discovery-card {
        padding: 1.6rem;
        border-radius: 14px;
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
        border: 0.5px solid var(--hairline);
        position: relative;
        overflow: hidden;
        transition: transform 0.6s ${`cubic-bezier(0.16, 1, 0.3, 1)`}, border-color 0.6s ease;
      }
      .discovery-card::before {
        content: '';
        position: absolute;
        top: 0; left: 0;
        width: 3px; height: 100%;
        background: hsla(var(--card-hue), 65%, 60%, 0.55);
        transition: width 0.6s ${`cubic-bezier(0.16, 1, 0.3, 1)`};
      }
      .discovery-card:hover {
        border-color: hsla(var(--card-hue), 60%, 50%, 0.4);
        transform: translateY(-2px);
      }
      .discovery-card:hover::before {
        width: 5px;
      }
      .discovery-tag {
        display: flex; align-items: center;
        gap: 0.5rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.625rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--ink-soft);
        margin-bottom: 1rem;
      }
      .discovery-headline {
        font-size: 1.25rem;
        line-height: 1.35;
        font-weight: 500;
        color: var(--ink-strong);
        font-family: ui-serif, Georgia, serif;
        letter-spacing: -0.01em;
      }
      .discovery-narrative {
        margin-top: 0.85rem;
        font-size: 0.95rem;
        line-height: 1.55;
        color: var(--ink-medium);
      }
      .discovery-data {
        margin-top: 1rem;
        padding-top: 0.85rem;
        border-top: 0.5px dashed var(--hairline-strong);
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.8125rem;
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      .confidence-pip {
        display: inline-flex;
        gap: 2px;
        margin-left: auto;
      }
      .confidence-dot {
        width: 5px; height: 5px;
        border-radius: 50%;
        display: inline-block;
      }
      .sources-note {
        display: flex; align-items: center;
        gap: 1.25rem;
        flex-wrap: wrap;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.75rem;
      }
      .sources-list {
        color: var(--ink-medium);
        letter-spacing: 0.02em;
      }
      .sources-period {
        color: var(--ink-soft);
        font-style: italic;
        margin-left: auto;
      }

      /* STRATEGY */
      .strategy-stack {
        display: flex;
        flex-direction: column;
        gap: 2.5rem;
      }
      .strategy-principle {
        display: grid;
        grid-template-columns: 80px 1fr;
        gap: 2rem;
        align-items: start;
      }
      .strategy-number {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.875rem;
        font-weight: 700;
        letter-spacing: 0.16em;
        color: var(--ink-soft);
        padding-top: 0.4rem;
      }
      .strategy-principle-text {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.5rem;
        line-height: 1.35;
        font-weight: 400;
        color: var(--ink-strong);
        letter-spacing: -0.015em;
      }
      .strategy-elaboration {
        margin-top: 0.75rem;
        font-size: 1rem;
        line-height: 1.65;
        color: var(--ink-medium);
        max-width: 56ch;
      }

      /* EXECUTION */
      .execution-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1.25rem;
      }
      .exec-card {
        padding: 1.6rem;
        border-radius: 14px;
        background: linear-gradient(180deg, hsla(var(--card-hue), 40%, 28%, 0.12), rgba(255,255,255,0.015));
        border: 0.5px solid var(--hairline);
        position: relative;
        overflow: hidden;
      }
      .exec-card::after {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, hsla(var(--card-hue), 60%, 65%, 0.55), transparent);
      }
      .exec-icon {
        margin-bottom: 1.25rem;
      }
      .exec-number {
        font-family: ui-serif, Georgia, serif;
        font-size: 2.6rem;
        font-weight: 300;
        line-height: 1;
        letter-spacing: -0.025em;
        font-feature-settings: 'tnum' 1;
      }
      .exec-label {
        margin-top: 0.75rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.8125rem;
        color: var(--ink-soft);
        letter-spacing: 0.05em;
      }
      .execution-cadence-note {
        font-style: italic;
        font-size: 0.95rem;
        color: var(--ink-soft);
        text-align: center;
      }

      /* JOURNEY */
      .journey-chart {
        height: 200px;
        display: flex;
        align-items: flex-end;
        gap: 4px;
        position: relative;
        padding-bottom: 2rem;
        border-bottom: 0.5px solid var(--hairline);
      }
      .journey-week {
        flex: 1;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        position: relative;
        min-width: 8px;
      }
      .journey-week-bar {
        display: flex; flex-direction: column-reverse;
        width: 100%;
        min-height: 4px;
        border-radius: 2px 2px 0 0;
        overflow: hidden;
      }
      .journey-week-label {
        position: absolute;
        bottom: -1.6rem;
        left: 50%;
        transform: translateX(-50%);
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.625rem;
        color: var(--ink-soft);
        white-space: nowrap;
      }
      .journey-milestones {
        margin-top: 4rem;
      }
      .milestone-list {
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
      }
      .milestone-row {
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 1.5rem;
        align-items: baseline;
        padding: 0.4rem 0;
        border-top: 0.5px solid var(--hairline);
      }
      .milestone-date {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.75rem;
        letter-spacing: 0.06em;
        color: var(--ink-soft);
      }
      .milestone-text {
        font-size: 1rem;
        line-height: 1.5;
        color: var(--ink-medium);
      }

      /* FINDINGS */
      .finding-block {
        padding: 2rem 0;
        border-top: 0.5px solid var(--hairline);
        margin-top: 2.5rem;
      }
      .finding-block:first-of-type {
        border-top: none;
      }
      .finding-label {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--ink-soft);
        margin-bottom: 1rem;
      }
      .finding-headline {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.75rem;
        line-height: 1.3;
        font-weight: 400;
        color: var(--ink-strong);
        letter-spacing: -0.015em;
        max-width: 28ch;
      }
      .finding-data {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1rem;
        margin-top: 1.75rem;
        padding: 1.5rem 0;
        border-top: 0.5px dashed var(--hairline);
        border-bottom: 0.5px dashed var(--hairline);
      }
      .finding-data-cell {
        text-align: left;
      }
      .finding-data-key {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.625rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--ink-soft);
        margin-bottom: 0.4rem;
      }
      .finding-data-value {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.4rem;
        font-weight: 300;
        color: var(--ink-strong);
        font-feature-settings: 'tnum' 1;
        letter-spacing: -0.015em;
      }
      .finding-interpretation {
        margin-top: 1.5rem;
        font-size: 0.95rem;
        line-height: 1.6;
        color: var(--ink-medium);
        max-width: 60ch;
        font-style: italic;
      }
      .finding-interpretation .overline {
        display: block;
        margin-bottom: 0.5rem;
        font-style: normal;
      }

      /* WINS */
      .wins-list {
        display: flex; flex-direction: column;
        gap: 0.6rem;
      }
      .win-row {
        display: grid;
        grid-template-columns: 16px 1fr 140px;
        gap: 1rem;
        align-items: center;
        padding: 1.1rem 0;
        border-bottom: 0.5px solid var(--hairline);
        transition: background 0.5s ease;
      }
      .win-row:hover {
        background: linear-gradient(90deg, hsla(var(--win-hue), 65%, 50%, 0.05), transparent);
      }
      .win-mark {
        width: 8px; height: 8px;
        border-radius: 50%;
        box-shadow: 0 0 12px hsla(var(--win-hue), 65%, 60%, 0.55);
      }
      .win-content {
        min-width: 0;
      }
      .win-title {
        font-size: 1.1rem;
        font-weight: 400;
        color: var(--ink-strong);
        line-height: 1.35;
      }
      .win-metric {
        margin-top: 0.3rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.8125rem;
        color: var(--ink-soft);
      }
      .win-when {
        text-align: right;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.75rem;
        color: var(--ink-soft);
        letter-spacing: 0.03em;
      }

      /* OPPORTUNITY */
      .opp-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
        gap: 1.5rem;
      }
      .opp-card {
        padding: 2rem;
        border-radius: 16px;
        background: linear-gradient(180deg, hsla(var(--card-hue), 50%, 30%, 0.12), rgba(255,255,255,0.018));
        border: 0.5px solid hsla(var(--card-hue), 55%, 50%, 0.22);
        position: relative;
        overflow: hidden;
        display: grid;
        grid-template-columns: 60px 1fr;
        gap: 1.5rem;
        transition: transform 0.6s ${`cubic-bezier(0.16, 1, 0.3, 1)`}, border-color 0.6s ease, box-shadow 0.6s ease;
      }
      .opp-card:hover {
        transform: translateY(-2px);
        border-color: hsla(var(--card-hue), 65%, 60%, 0.5);
        box-shadow: 0 20px 50px hsla(var(--card-hue), 60%, 40%, 0.18);
      }
      .opp-rank {
        font-family: ui-serif, Georgia, serif;
        font-size: 2.2rem;
        font-weight: 300;
        color: hsla(var(--card-hue), 60%, 70%, 0.95);
        letter-spacing: -0.02em;
        line-height: 1;
        font-feature-settings: 'tnum' 1;
      }
      .opp-title {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.35rem;
        line-height: 1.4;
        font-weight: 400;
        color: var(--ink-strong);
        letter-spacing: -0.015em;
      }
      .opp-rationale {
        margin-top: 0.85rem;
        font-size: 0.95rem;
        line-height: 1.6;
        color: var(--ink-medium);
      }
      .opp-meta {
        margin-top: 1.5rem;
        padding-top: 1.25rem;
        border-top: 0.5px dashed var(--hairline-strong);
        display: flex;
        gap: 1.5rem;
        flex-wrap: wrap;
      }
      .opp-meta-cell {
        display: flex; flex-direction: column;
        gap: 0.25rem;
      }
      .opp-meta-label {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.625rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--ink-soft);
      }
      .opp-meta-value {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--ink-medium);
      }
      .opp-basis {
        margin-top: 1.25rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.8125rem;
        color: var(--ink-soft);
        font-style: italic;
      }
      .opp-basis .overline {
        display: block;
        margin-bottom: 0.35rem;
        font-style: normal;
      }
      .opp-methodology {
        font-style: italic;
        font-size: 0.875rem;
        color: var(--ink-soft);
        line-height: 1.65;
        max-width: 64ch;
        margin: 0 auto;
        text-align: center;
      }

      /* COMMITMENT */
      .commitment-statement {
        max-width: 32ch;
        margin: 0 auto;
        text-align: center;
      }
      .commitment-line {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.6rem;
        line-height: 1.4;
        font-weight: 400;
        color: var(--ink-strong);
        font-style: italic;
        letter-spacing: -0.01em;
      }
      .commitment-line + .commitment-line {
        margin-top: 0.6rem;
      }
      .transparency-block {
        padding: 2rem 0;
        max-width: 50ch;
        margin: 0 auto;
      }
      .transparency-sources {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        align-items: center;
      }
      .transparency-source {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.875rem;
        color: var(--ink-medium);
      }
      .transparency-sync {
        color: var(--ink-soft);
        font-style: italic;
        margin-left: 0.5rem;
      }
      .transparency-period {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.8125rem;
        color: var(--ink-soft);
      }
      .transparency-gaps {
        text-align: left;
      }
      .transparency-gaps-list {
        list-style: none;
        padding: 0;
        margin-top: 0.5rem;
      }
      .transparency-gaps-list li {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.875rem;
        color: var(--ink-medium);
        padding-left: 1rem;
        position: relative;
        line-height: 1.5;
        margin-bottom: 0.4rem;
      }
      .transparency-gaps-list li::before {
        content: '·';
        position: absolute;
        left: 0;
        color: var(--ink-soft);
      }
      .signature {
        padding-top: 3rem;
        border-top: 0.5px solid var(--hairline);
      }
      .signature-mark {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.4rem;
        font-weight: 400;
        letter-spacing: -0.015em;
        color: var(--ink-medium);
      }
      .signature-line {
        margin-top: 0.5rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.8125rem;
        color: var(--ink-soft);
        font-style: italic;
      }
      .signature-stamp {
        margin-top: 0.85rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.6875rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--ink-soft);
      }

      /* RESPONSIVE */
      @media (max-width: 720px) {
        .report-stage { padding: 0 1.25rem; }
        .strategy-principle { grid-template-columns: 48px 1fr; gap: 1rem; }
        .strategy-principle-text { font-size: 1.2rem; }
        .opp-card { grid-template-columns: 1fr; padding: 1.5rem; }
        .milestone-row { grid-template-columns: 1fr; gap: 0.4rem; }
        .win-row { grid-template-columns: 12px 1fr; }
        .win-when { display: none; }
        .act { padding: 5rem 0; min-height: auto; }
      }

      /* REDUCED MOTION */
      @media (prefers-reduced-motion: reduce) {
        .ambient-mote, .ambient-glow { animation: none !important; }
      }
    `}</style>
  );
}
