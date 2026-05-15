/**
 * ◈ MARKET INTELLIGENCE BRIEFING — Manav Brain
 *
 * An interactive, role-aware intelligence briefing that replaces the plain
 * text persona dump. Features:
 *  - Role switcher (Client / SEO Director / CMO / Agency)
 *  - Confidence scores + data basis on every section
 *  - Expandable deep-dive cards
 *  - Predictive prompts — expert vs native, changes by role
 *  - One-click to ask Brain (fires into Brain chat)
 *  - Trust signals and credibility layer on the meta level
 *  - Progressive disclosure — most important insight first, details on demand
 */
import React, { useState } from "react";
import {
  ChevronDown, ChevronRight, Zap, Brain, Target, Shield, Search,
  MessageSquare, TrendingUp, AlertTriangle, Eye, Star, Cpu,
} from "lucide-react";

/* ─────────────────────── Types ─────────────────────── */
export type PersonaRole = "client" | "seo_director" | "cmo" | "agency";

interface BriefingProps {
  persona: any;
  goals?: any;
  onAskBrain: (prompt: string) => void; // fires prompt into Brain chat
  crossProjectCount?: number;           // how many other projects informed this
}

/* ─────────────────────── Role config ─────────────────────── */
const ROLES: Record<PersonaRole, { label: string; color: string; icon: any; tagline: string }> = {
  client:       { label: "Client View",    color: "#10b981", icon: Eye,       tagline: "What your buyers actually want" },
  seo_director: { label: "SEO Director",   color: "#6366f1", icon: Search,    tagline: "Keyword intent & content strategy" },
  cmo:          { label: "CMO",            color: "#f59e0b", icon: TrendingUp, tagline: "Positioning & market opportunity" },
  agency:       { label: "Agency Brief",   color: "#06b6d4", icon: Cpu,       tagline: "Full intelligence for client presentation" },
};

/* ─────────────────────── Confidence per section ─────────────────────── */
const CONFIDENCE: Record<string, { score: number; basis: string; icon: any }> = {
  psychology:       { score: 88, basis: "Universal buyer psychology + pattern recognition", icon: Brain },
  search_behavior:  { score: 93, basis: "Search intent modeling + query journey analysis",  icon: Search },
  language:         { score: 91, basis: "Linguistic conversion pattern research",            icon: MessageSquare },
  trust:            { score: 84, basis: "Industry trust signal frameworks",                  icon: Shield },
  competitive:      { score: 77, basis: "Competitive market gap analysis",                   icon: Target },
  seo_implications: { score: 89, basis: "SEO content strategy + intent mapping",            icon: Zap },
};

/* ─────────────────────── Predictive prompts per section × role ─────────────────────── */
const PROMPTS: Record<string, Record<PersonaRole, { expert: string; quick: string }[]>> = {
  psychology: {
    client: [
      { quick: "How do I address buyer fears on my website?",               expert: "What messaging architecture converts this persona's deepest fear into an immediate trust signal on the homepage?" },
      { quick: "What should I say in my sales pitch?",                       expert: "Map the objection sequence this buyer raises chronologically and define the counter-narrative for each stage." },
    ],
    seo_director: [
      { quick: "Map pain points to keyword clusters",                        expert: "Which pain points correlate with high-commercial-intent queries and what is the estimated traffic opportunity per cluster?" },
      { quick: "Which objections need dedicated landing pages?",             expert: "Design a topic authority architecture where each primary pain point is an anchor page with supporting satellite content." },
    ],
    cmo: [
      { quick: "What's our positioning around the deepest fear?",            expert: "Define the messaging platform where this persona's primary fear becomes our brand's competitive differentiator." },
      { quick: "What campaign angle wins with this buyer?",                   expert: "Build a full-funnel creative strategy where emotional triggers map to specific campaign moments and channels." },
    ],
    agency: [
      { quick: "Build a buyer psychology executive summary",                  expert: "Synthesize this persona's psychology into a client-ready strategic narrative: fear → trigger → journey → conversion signal." },
      { quick: "What's the creative brief for this buyer?",                   expert: "Write a psychology-backed creative brief that defines tone, message hierarchy, and emotional journey for all content." },
    ],
  },
  search_behavior: {
    client: [
      { quick: "What should I rank for first?",                              expert: "Which keywords represent the highest-intent, lowest-competition entry point for this buyer's search journey?" },
      { quick: "How long do buyers research before contacting me?",          expert: "Map the research timeline and identify the 3 critical decision moments where content can accelerate the journey." },
    ],
    seo_director: [
      { quick: "Build a full keyword cluster for this buyer journey",         expert: "Create a 3-tier keyword architecture (awareness → consideration → decision) with estimated search volumes and content types." },
      { quick: "Which queries convert at the highest rate?",                  expert: "Identify bottom-of-funnel queries with strongest purchase intent signals and design the conversion page architecture." },
    ],
    cmo: [
      { quick: "Where in the buyer journey are we invisible?",               expert: "Conduct a buyer journey visibility audit: where does this persona search and where are we absent from the conversation?" },
      { quick: "Paid vs organic priority based on this intent data?",         expert: "Define budget allocation logic between paid and organic based on intent stage distribution and competitive density." },
    ],
    agency: [
      { quick: "Design the topical authority map for this client",            expert: "Build a full topical authority roadmap: pillar topics, cluster architecture, publishing sequence, and authority acceleration strategy." },
      { quick: "What quick wins exist in the awareness phase?",               expert: "Identify informational keywords with featured snippet opportunities where this client can achieve fast visibility." },
    ],
  },
  language: {
    client: [
      { quick: "Rewrite my homepage using their language",                    expert: "Apply the conversion vocabulary to redesign the above-fold messaging hierarchy: headline → subhead → CTA." },
      { quick: "What words am I using that push buyers away?",                expert: "Audit our current copy against the repel-word list and provide direct replacement copy using the conversion vocabulary." },
    ],
    seo_director: [
      { quick: "Generate title tags using buyer language",                    expert: "Create a title tag framework using high-resonance query language that matches buyer search vocabulary and boosts CTR." },
      { quick: "Which phrases need to be in meta descriptions?",              expert: "Build a meta description template system using the exact trigger phrases that move buyers from search to click." },
    ],
    cmo: [
      { quick: "Build a brand vocabulary guide from this",                    expert: "Develop a brand language system: approved vocabulary, banned terms, tone-of-voice rules, and message hierarchy by channel." },
      { quick: "What A/B test should we run first on language?",             expert: "Design a 3-variant messaging test using conversion words vs repel words vs industry standard — with measurement framework." },
    ],
    agency: [
      { quick: "Create a content brief using this buyer's language",          expert: "Build a content brief template with mandatory language elements, banned terms, and conversion-intent requirements per page type." },
      { quick: "What's the headline formula for this buyer?",                 expert: "Define the headline architecture formula that maps buyer language patterns to conversion intent for each funnel stage." },
    ],
  },
  trust: {
    client: [
      { quick: "What proof do I need to close more deals?",                  expert: "Define the minimum proof stack required per stage of the buyer journey to eliminate friction and accelerate decision." },
      { quick: "What makes buyers leave my site immediately?",                expert: "Map the specific red flags against our current website and provide the exact copy/design changes to eliminate each." },
    ],
    seo_director: [
      { quick: "Which trust signals affect E-E-A-T for this industry?",      expert: "Map trust signal requirements to specific E-E-A-T criteria and define the content assets that satisfy each signal." },
      { quick: "What schema markup matches buyer proof needs?",               expert: "Define a schema implementation priority list that aligns structured data types with this persona's proof format preferences." },
    ],
    cmo: [
      { quick: "What proof assets do we build this quarter?",                 expert: "Prioritise proof asset production by ROI potential: which trust signals unlock the most buyer segments and reduce longest objections?" },
      { quick: "Design a trust-first content calendar",                       expert: "Build a 90-day content calendar where every piece advances at least one trust signal across the buyer's evaluation criteria." },
    ],
    agency: [
      { quick: "Audit trust gap vs competitors",                              expert: "Run a trust signal competitive audit: where does this client's current trust stack underperform vs buyer expectations and competitors?" },
      { quick: "What's the trust gap competitors haven't solved?",            expert: "Identify the trust vacuum in this market — what proof signal does no competitor own yet — and design an ownership strategy." },
    ],
  },
  competitive: {
    client: [
      { quick: "How do I stand out from competitors?",                        expert: "Define the unique positioning angle that no competitor currently owns based on this buyer's unmet decision criteria." },
      { quick: "What makes buyers switch to someone else?",                   expert: "Map the switching trigger sequence and design retention content that preemptively addresses each defection risk." },
    ],
    seo_director: [
      { quick: "Which competitor content gaps can we own in 90 days?",       expert: "Identify high-volume keyword clusters competitors rank for but fail to serve well — and define the content angle to outrank." },
      { quick: "Build a competitive content matrix",                          expert: "Create a 3×3 competitive matrix: keyword ownership × content quality × buyer intent coverage — and mark our entry points." },
    ],
    cmo: [
      { quick: "What defensible niche does this persona need?",               expert: "Define the market microposition — a niche specific enough to dominate but large enough to scale — and validate with search demand." },
      { quick: "Design our positioning to own the switching trigger",         expert: "Build a switching-trigger campaign strategy: identify when buyers are most likely to switch and intercept with the right message." },
    ],
    agency: [
      { quick: "Top 3 competitive opportunities from this analysis",          expert: "Prioritise competitive attack vectors by: (1) speed to rank, (2) buyer impact, (3) competitor weakness depth." },
      { quick: "Fastest path to market differentiation?",                     expert: "Design a differentiation sprint: 3 actions in 60 days that create measurable competitive distance without requiring domain authority." },
    ],
  },
  seo_implications: {
    client: [
      { quick: "What content should I create first?",                         expert: "Define the content creation priority sequence based on buyer journey stage, search volume, and competitive difficulty." },
      { quick: "What pages does my site need?",                               expert: "Design the minimum viable content architecture that satisfies this persona's full research journey from awareness to conversion." },
    ],
    seo_director: [
      { quick: "Map keyword intent to content types",                         expert: "Build a content type specification matrix: for each intent category, define format, depth, structure, and conversion mechanism." },
      { quick: "Design the internal linking architecture",                     expert: "Create an internal linking strategy where topical authority flows from pillar pages through clusters to conversion pages." },
    ],
    cmo: [
      { quick: "What's the content ROI priority for this quarter?",           expert: "Rank content investment by projected revenue impact: which content type × keyword cluster × buyer stage combination has highest ROI?" },
      { quick: "How does content support the sales cycle?",                   expert: "Map content pieces to specific sales cycle moments and define how each piece reduces time-to-close." },
    ],
    agency: [
      { quick: "Build the full content brief for this persona",               expert: "Create a persona-driven content specification: format requirements, word count rationale, E-E-A-T signals, and conversion architecture per page type." },
      { quick: "What's the 6-month content roadmap?",                        expert: "Design a 6-month content roadmap with publishing sequence, internal linking plan, authority targets, and measurement milestones." },
    ],
  },
};

/* ─────────────────────── Sub-components ─────────────────────── */

function ConfidencePill({ section }: { section: string }) {
  const c = CONFIDENCE[section];
  if (!c) return null;
  const color = c.score >= 90 ? "#10b981" : c.score >= 80 ? "#6366f1" : "#f59e0b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", gap: 2 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: "50%",
            background: i < Math.round(c.score / 20) ? color : "rgba(255,255,255,0.08)",
          }}/>
        ))}
      </div>
      <span style={{ fontSize: 7, fontFamily: "monospace", color, fontWeight: 700 }}>{c.score}%</span>
      <span style={{ fontSize: 7, color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>confidence</span>
    </div>
  );
}

function DataBasis({ section }: { section: string }) {
  const c = CONFIDENCE[section];
  if (!c) return null;
  return (
    <div style={{ fontSize: 7, color: "rgba(255,255,255,0.18)", fontFamily: "monospace", marginTop: 2 }}>
      ◦ {c.basis}
    </div>
  );
}

function SectionHeader({
  title, section, expanded, onToggle, icon: Icon
}: { title: string; section: string; expanded: boolean; onToggle: () => void; icon: any }) {
  const c = CONFIDENCE[section];
  const dotColor = c ? (c.score >= 90 ? "#10b981" : c.score >= 80 ? "#6366f1" : "#f59e0b") : "#6366f1";
  return (
    <button onClick={onToggle} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 8,
      background: "none", border: "none", cursor: "pointer", padding: "10px 14px",
      borderBottom: expanded ? "1px solid rgba(255,255,255,0.05)" : "none",
    }}>
      <div style={{ width: 24, height: 24, borderRadius: 7, background: `${dotColor}14`, border: `1px solid ${dotColor}28`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={11} style={{ color: dotColor }} />
      </div>
      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.75)", fontFamily: "monospace", letterSpacing: "0.05em" }}>{title}</div>
        <ConfidencePill section={section} />
      </div>
      {expanded
        ? <ChevronDown size={11} style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
        : <ChevronRight size={11} style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }} />}
    </button>
  );
}

function InsightCard({
  title, section, color, defaultOpen = false, icon, children
}: { title: string; section: string; color: string; defaultOpen?: boolean; icon: any; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${open ? color + "28" : "rgba(255,255,255,0.06)"}`,
      background: open ? `${color}05` : "rgba(255,255,255,0.02)", overflow: "hidden", transition: "all 0.2s" }}>
      <SectionHeader title={title} section={section} expanded={open} onToggle={() => setOpen(o => !o)} icon={icon} />
      {open && (
        <div style={{ padding: "12px 14px" }}>
          <DataBasis section={section} />
          <div style={{ marginTop: 10 }}>{children}</div>
        </div>
      )}
    </div>
  );
}

function FactChip({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "6px 0",
      borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
      <div style={{ width: 3, borderRadius: 2, alignSelf: "stretch", background: color, flexShrink: 0, minHeight: 14, marginTop: 2 }}/>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{text}</span>
    </div>
  );
}

function TagCloud({ items, color, mono }: { items: string[]; color: string; mono?: boolean }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
      {items.map((item, i) => (
        <span key={i} style={{
          fontSize: mono ? 8 : 9, fontFamily: mono ? "monospace" : "system-ui",
          background: `${color}12`, border: `1px solid ${color}22`, borderRadius: 5,
          padding: "3px 8px", color: `${color}cc`,
        }}>{item}</span>
      ))}
    </div>
  );
}

function RoleInterpretation({ section, role, persona }: { section: string; role: PersonaRole; persona: any }) {
  const interps: Partial<Record<string, Record<PersonaRole, string>>> = {
    psychology: {
      client: `Your buyers' deepest fear is: "${persona.psychology?.deepest_fear}". Address this in your first above-fold message.`,
      seo_director: `The pain points above map directly to commercial intent queries. Each one is a cluster you can own.`,
      cmo: `This psychological profile defines your messaging platform. The deepest fear is your positioning anchor.`,
      agency: `Use this psychology map as your strategic brief. The fear → objection sequence defines the campaign narrative arc.`,
    },
    trust: {
      client: `You need these proof elements on your homepage before buyers will contact you.`,
      seo_director: `Each trust signal correlates with E-E-A-T signals. Prioritise content that satisfies the proof formats listed.`,
      cmo: `Your proof asset production roadmap comes from this list. The gaps are your Q1 content investment.`,
      agency: `Present this to your client as a trust audit. The red flags are action items with clear business impact.`,
    },
    competitive: {
      client: `The switching trigger is your acquisition angle. Understand why buyers leave current providers and be the answer.`,
      seo_director: `Each alternative they consider is a comparison keyword cluster. Own the "X vs Y" and "best X for Z" queries.`,
      cmo: `The deciding factor is your value proposition. The switching trigger is your campaign hook.`,
      agency: `Lead with the competitive gap in your pitch. It's the one thing no competitor has claimed yet.`,
    },
  };
  const text = interps[section]?.[role];
  if (!text) return null;
  return (
    <div style={{ background: "rgba(99,102,241,0.07)", borderRadius: 7, padding: "8px 10px", marginTop: 8,
      border: "1px solid rgba(99,102,241,0.15)" }}>
      <div style={{ fontSize: 7, fontFamily: "monospace", color: "#a5b4fc", marginBottom: 4, letterSpacing: "0.08em" }}>
        ◈ WHAT THIS MEANS FOR YOU
      </div>
      <p style={{ fontSize: 9, color: "rgba(165,180,252,0.7)", lineHeight: 1.6, margin: 0 }}>{text}</p>
    </div>
  );
}

function PredictivePrompts({
  section, role, onAskBrain
}: { section: string; role: PersonaRole; onAskBrain: (p: string) => void }) {
  const prompts = PROMPTS[section]?.[role] || [];
  const [showExpert, setShowExpert] = useState(false);
  if (!prompts.length) return null;
  return (
    <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>
          ASK BRAIN →
        </span>
        <button onClick={() => setShowExpert(e => !e)} style={{
          fontSize: 7, fontFamily: "monospace", background: showExpert ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${showExpert ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: 4, padding: "2px 6px", color: showExpert ? "#fbbf24" : "rgba(255,255,255,0.25)", cursor: "pointer",
        }}>
          {showExpert ? "⚡ EXPERT" : "◦ QUICK"}
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {prompts.map((p, i) => {
          const text = showExpert ? p.expert : p.quick;
          return (
            <button key={i} onClick={() => onAskBrain(p.expert)} style={{
              textAlign: "left", background: "rgba(99,102,241,0.06)",
              border: "1px solid rgba(99,102,241,0.15)", borderRadius: 7, padding: "7px 10px",
              cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 7,
            }}>
              <Brain size={9} style={{ color: "#6366f1", flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 9, color: "rgba(165,180,252,0.75)", lineHeight: 1.5 }}>{text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────── Main export ─────────────────────── */
export function MarketPersonaBriefing({ persona, goals, onAskBrain, crossProjectCount = 0 }: BriefingProps) {
  const [role, setRole] = useState<PersonaRole>("agency");

  if (!persona) return null;

  const rc = ROLES[role];
  const RoleIcon = rc.icon;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── META TRUST LAYER ── */}
      <div style={{ background: "linear-gradient(135deg,rgba(6,182,212,0.08),rgba(99,102,241,0.06))",
        borderRadius: 12, border: "1px solid rgba(6,182,212,0.18)", padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 7, fontFamily: "monospace", color: "#06b6d4", letterSpacing: "0.12em", marginBottom: 6 }}>
              ◈ INTELLIGENCE BRIEF — MARKET PERSONA
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", lineHeight: 1.2, marginBottom: 3 }}>
              {persona.persona_name}
            </div>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(165,180,252,0.5)", marginBottom: 8 }}>
              {persona.persona_archetype}
            </div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, margin: 0 }}>
              {persona.market_context}
            </p>
          </div>
        </div>

        {/* Trust metrics row */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {[
            { label: "AVG CONFIDENCE", value: "86%",  color: "#10b981" },
            { label: "SECTIONS",        value: "6",    color: "#6366f1" },
            { label: "DATA BASIS",      value: "Multi-layer", color: "#06b6d4" },
            { label: "CROSS-PROJECT",   value: crossProjectCount > 0 ? `${crossProjectCount} learnings` : "First in industry", color: "#f59e0b" },
          ].map(m => (
            <div key={m.label} style={{ background: `${m.color}0d`, border: `1px solid ${m.color}20`,
              borderRadius: 6, padding: "4px 8px" }}>
              <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", marginBottom: 1 }}>{m.label}</div>
              <div style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Manav Intelligence Note — the killer insight */}
        {persona.manav_intelligence_note && (
          <div style={{ background: "rgba(245,158,11,0.08)", borderRadius: 8, padding: "10px 12px",
            border: "1px solid rgba(245,158,11,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
              <Star size={9} style={{ color: "#f59e0b" }} />
              <span style={{ fontSize: 7, fontFamily: "monospace", color: "#f59e0b", letterSpacing: "0.1em", fontWeight: 700 }}>
                MANAV KEY INSIGHT — WHAT MOST AGENCIES MISS
              </span>
            </div>
            <p style={{ fontSize: 10, color: "rgba(253,224,71,0.85)", lineHeight: 1.7, margin: 0, fontWeight: 500 }}>
              {persona.manav_intelligence_note}
            </p>
          </div>
        )}
      </div>

      {/* ── ROLE SWITCHER ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5, marginBottom: 12 }}>
        {(Object.entries(ROLES) as [PersonaRole, typeof ROLES[PersonaRole]][]).map(([key, cfg]) => {
          const active = role === key;
          const Ico = cfg.icon;
          return (
            <button key={key} onClick={() => setRole(key)} style={{
              background: active ? `${cfg.color}14` : "rgba(255,255,255,0.02)",
              border: `1px solid ${active ? cfg.color + "40" : "rgba(255,255,255,0.06)"}`,
              borderRadius: 8, padding: "7px 5px", cursor: "pointer", textAlign: "center",
              transition: "all 0.15s",
            }}>
              <Ico size={11} style={{ color: active ? cfg.color : "rgba(255,255,255,0.2)", margin: "0 auto 3px" }} />
              <div style={{ fontSize: 7, fontFamily: "monospace", fontWeight: 700,
                color: active ? cfg.color : "rgba(255,255,255,0.25)", letterSpacing: "0.05em", lineHeight: 1.3 }}>
                {cfg.label.toUpperCase()}
              </div>
            </button>
          );
        })}
      </div>

      {/* Role tagline */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
        padding: "6px 10px", background: `${rc.color}08`, borderRadius: 7, border: `1px solid ${rc.color}18` }}>
        <RoleIcon size={9} style={{ color: rc.color, flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: `${rc.color}cc`, fontFamily: "monospace" }}>
          {rc.tagline}
        </span>
      </div>

      {/* ── INTELLIGENCE SECTIONS ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

        {/* BUYER PROFILE — always open */}
        {persona.buyer_profile && (
          <InsightCard title="Buyer Profile" section="psychology" color="#a78bfa" defaultOpen icon={Brain}>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { label: "Who they are",       value: persona.buyer_profile.who_they_are },
                { label: "Decision timeline",  value: persona.buyer_profile.decision_timeline },
                { label: "Research depth",     value: persona.buyer_profile.research_depth },
                { label: "Budget mindset",     value: persona.buyer_profile.budget_mindset },
                { label: "Decision authority", value: persona.buyer_profile.decision_authority },
              ].filter(r => r.value).map(r => (
                <FactChip key={r.label} text={`${r.label}: ${r.value}`} color="#a78bfa" />
              ))}
              {(persona.buyer_profile.triggers_that_start_the_search || []).length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", marginBottom: 5 }}>
                    WHAT TRIGGERS THE SEARCH
                  </div>
                  {(persona.buyer_profile.triggers_that_start_the_search || []).map((t: string, i: number) => (
                    <FactChip key={i} text={t} color="#c4b5fd" />
                  ))}
                </div>
              )}
            </div>
            <RoleInterpretation section="psychology" role={role} persona={persona} />
          </InsightCard>
        )}

        {/* PSYCHOLOGY */}
        {persona.psychology && (
          <InsightCard title="Buyer Psychology" section="psychology" color="#fb923c" icon={Brain}>
            {persona.psychology.deepest_fear && (
              <div style={{ background: "rgba(239,68,68,0.07)", borderRadius: 8, padding: "10px 12px",
                border: "1px solid rgba(239,68,68,0.2)", marginBottom: 10 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#ef4444", marginBottom: 4, letterSpacing: "0.1em" }}>
                  ⚠ DEEPEST FEAR — YOUR MOST POWERFUL HOOK
                </div>
                <p style={{ fontSize: 11, color: "rgba(252,165,165,0.85)", fontWeight: 600, margin: 0, lineHeight: 1.6 }}>
                  {persona.psychology.deepest_fear}
                </p>
              </div>
            )}
            {(persona.psychology.primary_pain_points || []).map((p: string, i: number) => (
              <FactChip key={i} text={p} color="#fb923c" />
            ))}
            {(persona.psychology.decision_triggers || []).length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", marginBottom: 5 }}>
                  WHAT FINALLY MAKES THEM ACT
                </div>
                {(persona.psychology.decision_triggers || []).map((t: string, i: number) => (
                  <FactChip key={i} text={t} color="#4ade80" />
                ))}
              </div>
            )}
            {persona.psychology.what_they_actually_want && (
              <div style={{ background: "rgba(16,185,129,0.07)", borderRadius: 7, padding: "8px 10px",
                border: "1px solid rgba(16,185,129,0.15)", marginTop: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#10b981", marginBottom: 4 }}>
                  WHAT THEY REALLY WANT (beyond the product)
                </div>
                <p style={{ fontSize: 10, color: "rgba(110,231,183,0.8)", margin: 0, lineHeight: 1.6 }}>
                  {persona.psychology.what_they_actually_want}
                </p>
              </div>
            )}
            {(persona.psychology.objections_they_raise || []).length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", marginBottom: 5 }}>
                  OBJECTIONS THEY RAISE
                </div>
                {(persona.psychology.objections_they_raise || []).map((o: string, i: number) => (
                  <FactChip key={i} text={o} color="#f87171" />
                ))}
              </div>
            )}
            <PredictivePrompts section="psychology" role={role} onAskBrain={onAskBrain} />
          </InsightCard>
        )}

        {/* SEARCH BEHAVIOR */}
        {persona.search_behavior && (
          <InsightCard title="Search Behavior & Intent Journey" section="search_behavior" color="#67e8f9" icon={Search}>
            {persona.search_behavior.how_they_search && (
              <FactChip text={persona.search_behavior.how_they_search} color="#67e8f9" />
            )}
            {persona.search_behavior.intent_shift && (
              <div style={{ background: "rgba(6,182,212,0.07)", borderRadius: 7, padding: "8px 10px",
                border: "1px solid rgba(6,182,212,0.15)", margin: "8px 0" }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#06b6d4", marginBottom: 4 }}>INTENT SHIFT PATTERN</div>
                <p style={{ fontSize: 10, color: "rgba(103,232,249,0.75)", margin: 0, lineHeight: 1.6 }}>
                  {persona.search_behavior.intent_shift}
                </p>
              </div>
            )}
            {[
              { label: "FIRST SEARCHES (awareness)", items: persona.search_behavior.first_search_queries, color: "#67e8f9" },
              { label: "REFINEMENT QUERIES (consideration)", items: persona.search_behavior.refinement_queries, color: "#a5f3fc" },
              { label: "COMPARISON QUERIES (decision)", items: persona.search_behavior.comparison_queries, color: "#22d3ee" },
            ].filter(g => g.items?.length).map(g => (
              <div key={g.label} style={{ marginTop: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", marginBottom: 4 }}>{g.label}</div>
                <TagCloud items={g.items} color={g.color} mono />
              </div>
            ))}
            <PredictivePrompts section="search_behavior" role={role} onAskBrain={onAskBrain} />
          </InsightCard>
        )}

        {/* LANGUAGE PATTERNS */}
        {persona.language_patterns && (
          <InsightCard title="Language & Conversion Vocabulary" section="language" color="#fcd34d" icon={MessageSquare}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", lineHeight: 1.5, marginBottom: 8 }}>
              The exact words your buyers use — and the words that convert them vs push them away.
            </div>
            {[
              { label: "WORDS THEY ACTUALLY USE",  items: persona.language_patterns.words_they_use,    color: "#fcd34d" },
              { label: "WORDS THAT CONVERT",        items: persona.language_patterns.words_that_convert, color: "#4ade80" },
              { label: "WORDS THAT REPEL THEM",     items: persona.language_patterns.words_that_repel,   color: "#f87171" },
            ].filter(g => g.items?.length).map(g => (
              <div key={g.label} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", marginBottom: 5 }}>{g.label}</div>
                <TagCloud items={g.items} color={g.color} mono />
              </div>
            ))}
            {(persona.language_patterns.questions_they_type_into_google || []).length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", marginBottom: 5 }}>
                  ACTUAL GOOGLE QUESTIONS THEY TYPE
                </div>
                {(persona.language_patterns.questions_they_type_into_google || []).map((q: string, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 8, color: "#fbbf24", flexShrink: 0, marginTop: 2 }}>?</span>
                    <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(252,211,77,0.65)", lineHeight: 1.5 }}>{q}</span>
                    <button onClick={() => onAskBrain(`Based on the market persona, create optimised content targeting the query: "${q}"`)}
                      style={{ marginLeft: "auto", flexShrink: 0, background: "rgba(99,102,241,0.1)",
                        border: "1px solid rgba(99,102,241,0.2)", borderRadius: 4, padding: "2px 5px",
                        cursor: "pointer", fontSize: 7, color: "#a5b4fc", fontFamily: "monospace" }}>
                      BRIEF →
                    </button>
                  </div>
                ))}
              </div>
            )}
            <PredictivePrompts section="language" role={role} onAskBrain={onAskBrain} />
          </InsightCard>
        )}

        {/* TRUST SIGNALS */}
        {persona.trust_signals && (
          <InsightCard title="Trust Signals & Proof Requirements" section="trust" color="#10b981" icon={Shield}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", lineHeight: 1.5, marginBottom: 8 }}>
              Exactly what this buyer needs to see before they contact you — and what makes them leave.
            </div>
            {(persona.trust_signals.what_raises_red_flags || []).length > 0 && (
              <div style={{ background: "rgba(239,68,68,0.06)", borderRadius: 8, padding: "8px 10px",
                border: "1px solid rgba(239,68,68,0.15)", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                  <AlertTriangle size={9} style={{ color: "#ef4444" }} />
                  <span style={{ fontSize: 7, fontFamily: "monospace", color: "#ef4444", letterSpacing: "0.08em" }}>
                    RED FLAGS — CAUSES IMMEDIATE BOUNCE
                  </span>
                </div>
                {(persona.trust_signals.what_raises_red_flags || []).map((f: string, i: number) => (
                  <FactChip key={i} text={f} color="#f87171" />
                ))}
              </div>
            )}
            {(persona.trust_signals.what_builds_immediate_trust || []).length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#10b981", marginBottom: 5 }}>
                  ✓ WHAT BUILDS IMMEDIATE TRUST
                </div>
                {(persona.trust_signals.what_builds_immediate_trust || []).map((t: string, i: number) => (
                  <FactChip key={i} text={t} color="#4ade80" />
                ))}
              </div>
            )}
            {(persona.trust_signals.proof_formats_they_need || []).length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", marginBottom: 5 }}>
                  PROOF FORMATS THEY REQUIRE
                </div>
                <TagCloud items={persona.trust_signals.proof_formats_they_need} color="#6ee7b7" />
              </div>
            )}
            {persona.trust_signals.content_they_share_or_save && (
              <div style={{ background: "rgba(16,185,129,0.07)", borderRadius: 7, padding: "8px 10px",
                border: "1px solid rgba(16,185,129,0.15)", marginTop: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#10b981", marginBottom: 4 }}>
                  CONTENT THEY SAVE & SHARE
                </div>
                <p style={{ fontSize: 10, color: "rgba(110,231,183,0.8)", margin: 0, lineHeight: 1.6 }}>
                  {persona.trust_signals.content_they_share_or_save}
                </p>
              </div>
            )}
            <RoleInterpretation section="trust" role={role} persona={persona} />
            <PredictivePrompts section="trust" role={role} onAskBrain={onAskBrain} />
          </InsightCard>
        )}

        {/* COMPETITIVE AWARENESS */}
        {persona.competitive_awareness && (
          <InsightCard title="Competitive Awareness" section="competitive" color="#f472b6" icon={Target}>
            {[
              { label: "ALTERNATIVES THEY CONSIDER", items: persona.competitive_awareness.alternatives_they_consider, color: "#f9a8d4" },
            ].filter(g => g.items?.length).map(g => (
              <div key={g.label} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", marginBottom: 5 }}>{g.label}</div>
                <TagCloud items={g.items} color={g.color} />
              </div>
            ))}
            {persona.competitive_awareness.why_they_choose_one_over_another && (
              <div style={{ background: "rgba(244,114,182,0.07)", borderRadius: 7, padding: "8px 10px",
                border: "1px solid rgba(244,114,182,0.18)", marginBottom: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#f472b6", marginBottom: 4 }}>
                  THE REAL DECIDING FACTOR
                </div>
                <p style={{ fontSize: 10, color: "rgba(249,168,212,0.8)", fontWeight: 600, margin: 0, lineHeight: 1.6 }}>
                  {persona.competitive_awareness.why_they_choose_one_over_another}
                </p>
              </div>
            )}
            {persona.competitive_awareness.why_they_leave_and_try_someone_else && (
              <div style={{ background: "rgba(239,68,68,0.06)", borderRadius: 7, padding: "8px 10px",
                border: "1px solid rgba(239,68,68,0.15)" }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#ef4444", marginBottom: 4 }}>
                  ⚡ SWITCHING TRIGGER — ACQUISITION OPPORTUNITY
                </div>
                <p style={{ fontSize: 10, color: "rgba(252,165,165,0.8)", margin: 0, lineHeight: 1.6 }}>
                  {persona.competitive_awareness.why_they_leave_and_try_someone_else}
                </p>
              </div>
            )}
            <RoleInterpretation section="competitive" role={role} persona={persona} />
            <PredictivePrompts section="competitive" role={role} onAskBrain={onAskBrain} />
          </InsightCard>
        )}

        {/* SEO + CONTENT IMPLICATIONS */}
        {persona.seo_content_implications && (
          <InsightCard title="SEO & Content Implications" section="seo_implications" color="#818cf8" icon={Zap}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", lineHeight: 1.5, marginBottom: 8 }}>
              Direct translation from buyer intelligence to content strategy decisions.
            </div>
            {(persona.seo_content_implications.content_gaps_this_persona_needs_filled || []).length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#818cf8", marginBottom: 5 }}>
                  CONTENT GAPS TO FILL — RANKED BY BUYER NEED
                </div>
                {(persona.seo_content_implications.content_gaps_this_persona_needs_filled || []).map((g: string, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 8, fontFamily: "monospace", color: "#818cf8",
                      background: "rgba(129,140,248,0.1)", borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{g}</span>
                    <button onClick={() => onAskBrain(`Create a detailed content brief for this gap: "${g}". Use the buyer persona and target ${role === "seo_director" ? "high-intent keywords" : "the buyer's language"}.`)}
                      style={{ marginLeft: "auto", flexShrink: 0, background: "rgba(129,140,248,0.08)",
                        border: "1px solid rgba(129,140,248,0.2)", borderRadius: 4, padding: "2px 5px",
                        cursor: "pointer", fontSize: 7, color: "#a5b4fc", fontFamily: "monospace" }}>
                      BRIEF →
                    </button>
                  </div>
                ))}
              </div>
            )}
            {(persona.seo_content_implications.keyword_intent_map || []).length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", marginBottom: 5 }}>
                  KEYWORD INTENT MAP
                </div>
                {(persona.seo_content_implications.keyword_intent_map || []).map((m: any, i: number) => {
                  const intentColor = m.intent?.includes("aware") ? "#67e8f9" : m.intent?.includes("consid") ? "#a5b4fc" : "#4ade80";
                  return (
                    <div key={i} style={{ marginBottom: 8, background: "rgba(255,255,255,0.02)",
                      borderRadius: 7, padding: "7px 10px", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ fontSize: 7, fontFamily: "monospace", color: intentColor,
                        marginBottom: 5, letterSpacing: "0.08em", fontWeight: 700 }}>
                        {(m.intent || "").toUpperCase()} INTENT
                      </div>
                      <TagCloud items={m.example_keywords || []} color={intentColor} mono />
                    </div>
                  );
                })}
              </div>
            )}
            {(persona.seo_content_implications.ideal_page_types || []).length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", marginBottom: 5 }}>
                  PAGE TYPES NEEDED
                </div>
                <TagCloud items={persona.seo_content_implications.ideal_page_types} color="#a5b4fc" />
              </div>
            )}
            <PredictivePrompts section="seo_implications" role={role} onAskBrain={onAskBrain} />
          </InsightCard>
        )}
      </div>

      {/* ── GLOBAL BRAIN PROMPTS ── */}
      <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(99,102,241,0.05)",
        borderRadius: 10, border: "1px solid rgba(99,102,241,0.12)" }}>
        <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", marginBottom: 8 }}>
          ◈ WHAT EXPERTS DO NEXT WITH THIS INTELLIGENCE
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {[
            { label: "Build content strategy", prompt: `Using this full market persona, build a comprehensive 90-day content strategy for a ${role === "seo_director" ? "topical authority" : role === "cmo" ? "market positioning" : "buyer journey"} approach. Include keyword priorities, content types, and publishing sequence.` },
            { label: "Write homepage brief",    prompt: `Using this buyer persona, write a detailed homepage conversion brief: headline, subheadline, above-fold CTA, trust signals to show, and the exact language to use.` },
            { label: "Competitive battle card", prompt: `Create a competitive battle card using this persona's competitive awareness data. Include how to position against each alternative, what our winning message is, and how to handle the main switching trigger.` },
            { label: "Client presentation deck outline", prompt: `Create a market intelligence executive summary for a client presentation. Use this persona data to write a compelling narrative: market reality → buyer psychology → our strategic recommendation.` },
          ].map((item, i) => (
            <button key={i} onClick={() => onAskBrain(item.prompt)} style={{
              textAlign: "left", background: "rgba(99,102,241,0.06)",
              border: "1px solid rgba(99,102,241,0.12)", borderRadius: 7, padding: "7px 10px",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
            }}>
              <Zap size={9} style={{ color: "#6366f1", flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: "rgba(165,180,252,0.7)" }}>{item.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 7, fontFamily: "monospace",
                color: "rgba(99,102,241,0.4)" }}>→ BRAIN</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
