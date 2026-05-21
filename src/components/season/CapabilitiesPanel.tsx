/* ════════════════════════════════════════════════════════════════
   src/components/season/CapabilitiesPanel.tsx
   Standalone capabilities modal for S.E.A.S.O.N.

   Self-contained: all data + JSX lives here. Constants are defined
   INSIDE the component to eliminate any module-level TDZ risk
   when bundled for production.
═══════════════════════════════════════════════════════════════ */

import { motion } from 'framer-motion';
import {
  Sparkles, Activity, Search, Database, Wand2, Lock,
  CheckCircle2, Heart, X, ArrowRight,
} from 'lucide-react';

interface CapabilityItem {
  title: string;
  description: string;
  try?: string;
  ready: boolean;
}

interface CapabilityGroup {
  title: string;
  subtitle: string;
  icon: any;
  toneText: string;
  toneBorder: string;
  capabilities: CapabilityItem[];
}

export default function CapabilitiesPanel({ onClose, onTry, hasProject }: {
  onClose: () => void;
  onTry: (s: string) => void;
  hasProject: boolean;
}) {
  /* Constants inside the function — guaranteed to be initialized
     by the time we reach the JSX return. Zero TDZ risk. */
  const groups: CapabilityGroup[] = [
    {
      title: "Reading the room",
      subtitle: "What's happening right now",
      icon: Activity,
      toneText: "text-cyan-400",
      toneBorder: "border-cyan-500/20",
      capabilities: [
        { title: "Summarize this week",     description: "Plain-English recap of card movement, strategy progress, and real impact.", try: "Summarize this week", ready: true },
        { title: "How are we doing?",        description: "Overall status across every active strategy, with honest gaps named.", try: "How are we doing?", ready: true },
        { title: "What needs my attention?", description: "Ranked list of blockers, off-track strategies, overdue cards, looming deadlines.", try: "What needs me today?", ready: true },
        { title: "Quiet wins",                description: "What worked in the last 7 days. Worth noticing without celebrating loudly.", try: "What needs me today?", ready: true },
      ],
    },
    {
      title: "Investigating",
      subtitle: "Why something is happening",
      icon: Search,
      toneText: "text-violet-400",
      toneBorder: "border-violet-500/20",
      capabilities: [
        { title: "Why is X slipping?",                 description: "Finds off-track strategies, identifies the most-likely cause, suggests recovery moves.", try: "Why is this strategy slipping?", ready: true },
        { title: "Where do these numbers come from?",   description: "Full source trail: which property, which date range, which data state, when it was pulled.", try: "Where do these numbers come from?", ready: true },
        { title: "What's blocking us?",                 description: "Every dependency across every store — what it's blocking, where to resolve it.", try: "What needs me today?", ready: true },
      ],
    },
    {
      title: "Knowing your data",
      subtitle: "The trust layer",
      icon: Database,
      toneText: "text-emerald-400",
      toneBorder: "border-emerald-500/20",
      capabilities: [
        { title: "Data freshness",        description: "When GSC and GA4 last pulled, how stale they are, which intel has been computed.", ready: true },
        { title: "Strategy health rollup", description: "Cards done, cards blocked, real impact vs projected for every strategy.", ready: true },
        { title: "Activity ledger",        description: "Every status check, every system action, append-only, in the Behind-the-scenes drawer.", ready: true },
      ],
    },
    {
      title: "Coming next",
      subtitle: "Honest about scope — these are the next builds",
      icon: Wand2,
      toneText: "text-amber-400",
      toneBorder: "border-amber-500/20",
      capabilities: [
        { title: "Take a goal and build the full plan", description: "\"Rank me #1 for [keyword]\" → I read your data, pick the right actions, draft a content brief, create the strategy and cards. End to end.", ready: false },
        { title: "Draft a content brief",                description: "1,500+ word outline targeting any query, sourced from your top 10 competitors and audit findings.", ready: false },
        { title: "Draft an outreach email",              description: "Matched to your brand voice, personalized to the prospect type, ready to copy.", ready: false },
        { title: "Weekly client status report",          description: "Plain-language summary in your house style, with cited numbers, ready to send.", ready: false },
        { title: "Competitor comparison table",          description: "Pulled from competitor data and your identity, ready to drop into a page.", ready: false },
        { title: "Internal link plan with anchor texts", description: "From topic clusters and audit, with exact source pages and anchor copy.", ready: false },
      ],
    },
    {
      title: "What I genuinely don't have yet",
      subtitle: "No pretending — these need separate integrations",
      icon: Lock,
      toneText: "text-muted-foreground",
      toneBorder: "border-border",
      capabilities: [
        { title: "Live web search",                  description: "Industry news, weather, geopolitical context, competitor pricing — anything outside your database. Wiring the Anthropic web-search tool would unlock this.", ready: false },
        { title: "Publishing to your CMS",            description: "I draft content; humans paste. CMS API integration would unlock direct publish.", ready: false },
        { title: "Sending emails, calls, sign-offs",   description: "Drafts only for now. Resend, Twilio, DocuSign integrations would unlock direct send.", ready: false },
        { title: "Sub-minute fresh GSC and GA4",     description: "Pulls run on schedule. True streaming would need an ingestion pipeline.", ready: false },
      ],
    },
  ];

  const principles = [
    { icon: CheckCircle2, text: "Honesty over confidence — if I don't know, I tell you." },
    { icon: Database,      text: "Every number is sourced — one click to the verification trail." },
    { icon: Heart,         text: "Plain English by default, technical version on tap." },
    { icon: Sparkles,      text: "I won't make things up. Ever. Not even a 'helpful guess' without labelling it." },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-md z-40" />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-x-4 top-8 bottom-8 sm:inset-x-8 lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2 lg:w-[800px] lg:max-h-[calc(100vh-4rem)] z-50 rounded-3xl border border-cyan-500/30 bg-card shadow-2xl shadow-cyan-500/10 overflow-hidden flex flex-col">

        {/* Header */}
        <div className="relative px-6 py-5 border-b border-border bg-gradient-to-br from-cyan-500/[0.08] via-violet-500/[0.04] to-transparent">
          <motion.div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] rounded-full opacity-30 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse, rgba(34,211,238,0.25) 0%, transparent 70%)' }}
            animate={{ scale: [1, 1.05, 1], opacity: [0.2, 0.35, 0.2] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-400 font-bold mb-1">S.E.A.S.O.N.</div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">What I can do today.</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Here's everything I'm capable of, what's coming next, and what I'm honest enough to admit I can't do yet.
              </p>
            </div>
            <button onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {groups.map((group, gi) => {
            const Icon = group.icon;
            return (
              <motion.section
                key={group.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + gi * 0.08 }}>
                <div className={`flex items-center gap-2 mb-2 pb-2 border-b ${group.toneBorder}`}>
                  <Icon className={`h-4 w-4 ${group.toneText}`} />
                  <div className="flex-1">
                    <div className="text-[12px] font-bold text-foreground">{group.title}</div>
                    <div className="text-[10px] text-muted-foreground italic">{group.subtitle}</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {group.capabilities.map((cap, ci) => (
                    <motion.div
                      key={cap.title}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + gi * 0.08 + ci * 0.04 }}
                      className="rounded-lg border border-border bg-background/30 p-3 hover:border-cyan-500/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-[12.5px] font-bold text-foreground">{cap.title}</div>
                            {!cap.ready && (
                              <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                {group.title.startsWith("What I genuinely") ? "needs integration" : "coming next"}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{cap.description}</div>
                        </div>
                        {cap.ready && cap.try && hasProject && (
                          <motion.button
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={() => { onTry(cap.try!); onClose(); }}
                            className="text-[10px] px-2 py-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors whitespace-nowrap font-bold flex items-center gap-1">
                            Try it<ArrowRight className="h-2.5 w-2.5" />
                          </motion.button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            );
          })}

          {/* Spine principles */}
          <motion.section
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.05] via-violet-500/[0.03] to-transparent p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-400 font-bold mb-3">The spine</div>
            <div className="space-y-2">
              {principles.map((p, i) => {
                const PIcon = p.icon;
                return (
                  <motion.div key={i}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.06 }}
                    className="flex items-start gap-2.5">
                    <PIcon className="h-3.5 w-3.5 text-cyan-400/80 shrink-0 mt-0.5" />
                    <div className="text-[12px] text-foreground/85 leading-relaxed">{p.text}</div>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
            className="text-center text-[11px] text-muted-foreground italic py-2">
            Press <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-card font-mono">?</kbd> anytime to reopen this. Press <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-card font-mono">esc</kbd> to close.
          </motion.div>
        </div>
      </motion.div>
    </>
  );
}
