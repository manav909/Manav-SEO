/**
 * ◈ MARKET INTELLIGENCE BRIEFING — Manav Brain
 *
 * Design principles (hardcoded into this file — never change):
 *  1. NEVER show a confidence score unless it is derived from real data
 *  2. ALWAYS show what data was provided vs what was assumed
 *  3. ALWAYS show the industry, company, and region being analyzed
 *  4. ALWAYS show when the analysis was generated and what it's based on
 *  5. Every section labels its basis: provided data | industry pattern | AI inference
 *  6. Presentation-ready: a client can see this and trust it immediately
 *  7. Interactive: prompts that fire into Brain chat, expandable sections
 *  8. Role-aware: Client / SEO Director / CMO / Agency each see their angle
 */
import React, { useState } from "react";
import {
  ChevronDown, ChevronRight, Zap, Brain, Target, Shield, Search,
  MessageSquare, TrendingUp, AlertTriangle, Eye, CheckCircle,
  XCircle, AlertCircle, Clock, Database, Cpu, Info,
} from "lucide-react";

/* ─────────────────────── Types ─────────────────────── */
export type PersonaRole = "client" | "seo_director" | "cmo" | "agency";

interface BriefingProps {
  persona: any;
  goals?: any;
  project?: any;                         // raw project record from DB
  projectContext?: any;                  // get_context() payload (analytics, metrics, gaps, etc.)
  learnings?: any[];                     // active Brain Learnings for this project
  algoItems?: any[];                     // current algorithm intel
  canvasBlocks?: any[];                  // current canvas state
  onAskBrain: (prompt: string) => void;
  onSaveLearning?: (insight: any) => Promise<boolean>;   // persist an insight as a Brain Learning
  onAddToCanvas?: (card: any) => Promise<boolean>;        // add a suggested card to the canvas
  crossProjectCount?: number;
}

/* ─────────────────────── Helpers ─────────────────────── */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
}

function completenessColor(level?: string): string {
  if (!level) return "#6366f1";
  if (level === "high")   return "#10b981";
  if (level === "medium") return "#f59e0b";
  return "#ef4444";
}

/* ─────────────────────── Role config ─────────────────────── */
const ROLES: Record<PersonaRole, { label: string; color: string; icon: any; tagline: string }> = {
  client:       { label: "Client View",    color: "#10b981", icon: Eye,       tagline: "What your buyers actually want — plain language" },
  seo_director: { label: "SEO Director",   color: "#6366f1", icon: Search,    tagline: "Keyword intent, content architecture, E-E-A-T" },
  cmo:          { label: "CMO",            color: "#f59e0b", icon: TrendingUp, tagline: "Positioning, market opportunity, campaign strategy" },
  agency:       { label: "Agency Brief",   color: "#06b6d4", icon: Cpu,       tagline: "Full intelligence brief — client presentation ready" },
};

/* ─────────────────────── Predictive prompts per section × role ─────────────────────── */
const PROMPTS: Record<string, Record<PersonaRole, { label: string; prompt: string }[]>> = {
  psychology: {
    client: [
      { label: "How to address buyer fears on my website",       prompt: "Based on the market persona, write specific homepage copy that addresses the buyer's deepest fear and turns it into a trust signal. Be direct — no generic advice." },
      { label: "What to say in sales calls for this buyer",      prompt: "Using the buyer psychology from the market persona, write a sales call script structure that handles the main objections in sequence. What do I say when they raise each one?" },
    ],
    seo_director: [
      { label: "Map pain points to keyword clusters",            prompt: "Using the market persona psychology, build a keyword cluster map where each primary pain point becomes an anchor page. Show the cluster structure, estimated intent, and content type for each." },
      { label: "Which objections need dedicated landing pages",   prompt: "From the persona objections, identify which ones represent high-intent search queries and need dedicated landing pages. What should each page contain and target?" },
    ],
    cmo: [
      { label: "Messaging framework from the deepest fear",      prompt: "Using the persona's deepest fear as the positioning anchor, write a brand messaging platform: headline, value proposition, proof statement, and CTA — all grounded in this specific fear." },
      { label: "Full-funnel campaign strategy for this buyer",   prompt: "Design a full-funnel campaign strategy based on this buyer's emotional journey. What message hits them at awareness? What converts at decision? What retains them?" },
    ],
    agency: [
      { label: "Client-ready strategic narrative from psychology", prompt: "Turn the buyer psychology into a client-presentation narrative: market reality → buyer mindset → strategic implication → our recommendation. Write it as an executive summary slide." },
      { label: "Creative brief based on buyer psychology",        prompt: "Write a creative brief for a campaign targeting this buyer persona. Include: tone of voice, key message, emotional hook, proof requirements, and call to action format." },
    ],
  },
  search_behavior: {
    client: [
      { label: "What should I rank for first",                   prompt: "Based on the buyer's search journey in the persona, tell me exactly which 3-5 keywords to prioritise first. Why those, and what content do I need to rank for them?" },
      { label: "How long until buyers find me organically",      prompt: "Using the buyer search journey from the persona, realistically explain the timeline from 'buyer starts searching' to 'they contact us' — and where SEO can shorten that timeline." },
    ],
    seo_director: [
      { label: "Full keyword architecture for the buyer journey", prompt: "Using the persona's search behavior, build a 3-tier keyword architecture: awareness tier (informational), consideration tier (comparative), decision tier (transactional). Include content format for each tier." },
      { label: "Which queries convert at highest rate",           prompt: "From the persona's comparison and decision-stage queries, identify the top 5 conversion-intent keywords. What landing page structure maximises conversion for each?" },
    ],
    cmo: [
      { label: "Where in the buyer journey are we invisible",    prompt: "Based on the search journey in the persona, run a buyer journey visibility audit: at which stages is a typical business in this industry absent from the conversation? What's the cost of that gap?" },
      { label: "Paid vs organic strategy based on intent data",  prompt: "Using the persona's intent map, recommend a paid vs organic budget split with reasoning. Which stages need paid support and why?" },
    ],
    agency: [
      { label: "Topical authority roadmap for this client",      prompt: "Using the persona's search journey, build a topical authority roadmap: pillar topics, supporting cluster content, publishing sequence, and the authority signal each piece builds." },
      { label: "Quick wins in the awareness phase",              prompt: "From the persona's first-search queries, identify the 3 fastest-to-rank opportunities with featured snippet or PAA potential. What content do we create first?" },
    ],
  },
  language: {
    client: [
      { label: "Rewrite my homepage headline using their words", prompt: "Using the conversion vocabulary from the market persona, write 5 homepage headline options. Each must use the words buyers actually use, address a specific pain point, and avoid the repel words listed." },
      { label: "Audit my current copy against repel words",      prompt: "I want to audit my current website copy. Based on the persona's repel words and buyer language, what questions should I ask to identify copy that's pushing buyers away?" },
    ],
    seo_director: [
      { label: "Title tag framework using buyer language",        prompt: "Using the persona's conversion vocabulary and Google questions, write a title tag framework for each intent stage. Include the exact buyer language patterns and keyword placement rules." },
      { label: "Meta description templates for each intent",     prompt: "Write meta description templates for awareness, consideration, and decision pages — using the persona's conversion vocabulary and addressing the psychological triggers identified." },
    ],
    cmo: [
      { label: "Brand language guide from this persona",         prompt: "Create a brand language guide based on this persona's language patterns: approved vocabulary, banned terms, tone rules, and message hierarchy by channel and audience." },
      { label: "A/B test design for conversion vocabulary",      prompt: "Design a 3-variant A/B test using this persona's language patterns. What's the hypothesis, what are the 3 variants, and how do we measure which converts best?" },
    ],
    agency: [
      { label: "Content brief template using buyer language",    prompt: "Create a content brief template that uses this persona's language patterns as mandatory requirements. Include: required vocabulary, banned terms, tone guide, and conversion intent checklist." },
      { label: "Headline formula for each funnel stage",         prompt: "Write a headline formula for each funnel stage based on the persona's language patterns. What's the structure, what emotional trigger does each formula activate, and show 2 examples each." },
    ],
  },
  trust: {
    client: [
      { label: "Minimum proof I need to close more deals",       prompt: "From the trust signals in the persona, tell me exactly what proof I need on my website to eliminate the top 3 buyer objections. What format, where on the page, and what it should say." },
      { label: "Why buyers are leaving my site immediately",     prompt: "Using the red flags from the trust signals section, which ones are most commonly found on websites in this industry? How do I check if I have them and what do I change?" },
    ],
    seo_director: [
      { label: "Trust signals that affect E-E-A-T ranking",      prompt: "Map the trust signals from this persona to specific E-E-A-T criteria (Experience, Expertise, Authoritativeness, Trustworthiness). Which ones have the most impact on ranking in this industry?" },
      { label: "Schema markup for buyer proof requirements",     prompt: "Based on the proof formats this persona requires, recommend specific schema markup types that signal these trust elements to Google. Prioritise by impact." },
    ],
    cmo: [
      { label: "Proof asset production roadmap for Q1",          prompt: "From the trust signals in the persona, build a Q1 proof asset production plan. What do we create, in what order, and what business impact does each asset unlock?" },
      { label: "Trust-first content calendar for 90 days",       prompt: "Design a 90-day content calendar where every piece advances at least one trust signal from the persona. Include content type, target trust signal, and where it lives on the site." },
    ],
    agency: [
      { label: "Trust audit framework for the client",           prompt: "Using the trust signals from this persona, create a trust audit checklist I can use with any client in this industry. Score each element present/absent and show what the impact of each gap is." },
      { label: "The trust gap no competitor has solved yet",     prompt: "Based on this persona's trust requirements, identify which proof signals are typically missing across competitors in this industry — the trust vacuum we can own and build authority around." },
    ],
  },
  competitive: {
    client: [
      { label: "How to stand out from my competitors",           prompt: "Using the competitive awareness section of the persona, tell me exactly how to position differently. What do I say that no competitor is saying, and why will buyers choose me?" },
      { label: "What makes buyers switch providers",             prompt: "From the switching trigger in the persona, design a retention strategy and an acquisition strategy. How do I stop losing clients and win clients from competitors?" },
    ],
    seo_director: [
      { label: "Competitor content gaps I can own in 90 days",  prompt: "Using the alternatives buyers consider from the persona, identify keyword clusters where competitors rank but fail to serve the buyer well. What content can we create to outrank them in 90 days?" },
      { label: "Competitive content matrix",                     prompt: "Build a competitive content matrix based on the persona: columns are intent stages, rows are competitors. Where are the gaps? Where do we have a realistic path to rank above them?" },
    ],
    cmo: [
      { label: "The defensible niche based on buyer decision",   prompt: "Using the persona's deciding factor and switching trigger, identify a market microposition specific enough to dominate but large enough to scale. Validate with the search demand data from the persona." },
      { label: "Positioning to own the switching trigger",       prompt: "Design a campaign that intercepts buyers at the moment they're most likely to switch providers. What message do we show, on what channel, and what proof do we lead with?" },
    ],
    agency: [
      { label: "Top 3 competitive opportunities ranked by ROI",  prompt: "From the persona's competitive analysis, prioritise the top 3 competitive attack vectors by: speed to execute, buyer impact, and depth of competitor weakness. Give a clear recommendation for each." },
      { label: "Differentiation sprint — 60 days",               prompt: "Design a 60-day differentiation sprint based on this persona's competitive landscape. 3 specific actions that create measurable competitive distance without requiring high domain authority." },
    ],
  },
  seo_implications: {
    client: [
      { label: "What content to create first",                   prompt: "From the content gaps and keyword intent map in the persona, tell me exactly which 3 pieces of content to create first, why, and what each should contain. No generic advice." },
      { label: "What pages my site needs",                       prompt: "Design the minimum viable content architecture for my site based on this buyer's full research journey. What pages, in what structure, covering what topics — and what's the priority order?" },
    ],
    seo_director: [
      { label: "Content type specification by intent",           prompt: "Using the intent map from the persona, specify the exact content type, format, depth, and conversion mechanism for each intent stage. Include internal linking structure between them." },
      { label: "Internal linking architecture for topical depth", prompt: "Design the internal linking structure based on the persona's content gaps and intent map. Which pages link to which, what anchor text patterns use the buyer's language, and what does this achieve?" },
    ],
    cmo: [
      { label: "Content investment ROI priority this quarter",   prompt: "Rank the content gaps from the persona by projected revenue impact. Which content type × keyword cluster × buyer stage combination has the highest short-term ROI? Include reasoning." },
      { label: "How content maps to sales cycle reduction",      prompt: "Map each content gap from the persona to a specific stage of the sales cycle. Which piece, if created, would most reduce time-to-close and why?" },
    ],
    agency: [
      { label: "Full content specification for this persona",    prompt: "Create a persona-driven content specification sheet: for each content gap, write the format, word count rationale, E-E-A-T signals required, conversion architecture, and success metric." },
      { label: "6-month content roadmap with sequence",          prompt: "Design a 6-month content roadmap based on this persona. Include: publishing sequence, internal linking plan, authority targets per phase, and measurement milestones." },
    ],
  },
};

/* ─────────────────────── Sub-components ─────────────────────── */

function BasisTag({ basis }: { basis: "provided" | "inferred" | "industry" }) {
  const cfg = {
    provided: { color: "#10b981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.2)", label: "✓ Project data" },
    inferred: { color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", label: "~ Industry pattern" },
    industry: { color: "#6366f1", bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.2)", label: "◦ AI synthesis" },
  }[basis];
  return (
    <span style={{ fontSize: 7, fontFamily: "monospace", color: cfg.color,
      background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 4, padding: "1px 5px" }}>
      {cfg.label}
    </span>
  );
}

function SectionHeader({ title, icon: Icon, color, expanded, onToggle, basis }: {
  title: string; icon: any; color: string; expanded: boolean;
  onToggle: () => void; basis: "provided" | "inferred" | "industry";
}) {
  return (
    <button onClick={onToggle} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 8,
      background: "none", border: "none", cursor: "pointer",
      padding: "10px 14px", borderBottom: expanded ? "1px solid rgba(255,255,255,0.05)" : "none",
    }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: `${color}12`,
        border: `1px solid ${color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={11} style={{ color }} />
      </div>
      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.78)",
          fontFamily: "monospace", letterSpacing: "0.04em", marginBottom: 3 }}>{title}</div>
        <BasisTag basis={basis} />
      </div>
      {expanded
        ? <ChevronDown size={11} style={{ color: "rgba(255,255,255,0.18)", flexShrink: 0 }} />
        : <ChevronRight size={11} style={{ color: "rgba(255,255,255,0.18)", flexShrink: 0 }} />}
    </button>
  );
}

function InsightCard({ title, icon, color, basis, defaultOpen = false, children }: {
  title: string; icon: any; color: string;
  basis: "provided" | "inferred" | "industry"; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderRadius: 10, overflow: "hidden", transition: "all 0.2s",
      border: `1px solid ${open ? color + "25" : "rgba(255,255,255,0.05)"}`,
      background: open ? `${color}04` : "rgba(255,255,255,0.015)" }}>
      <SectionHeader title={title} icon={icon} color={color} basis={basis}
        expanded={open} onToggle={() => setOpen(o => !o)} />
      {open && <div style={{ padding: "12px 14px" }}>{children}</div>}
    </div>
  );
}

function FactRow({ text, color = "#6366f1" }: { text: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 7,
      padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
      <div style={{ width: 2, borderRadius: 1, background: color, flexShrink: 0,
        alignSelf: "stretch", minHeight: 12, marginTop: 3 }} />
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{text}</span>
    </div>
  );
}

function TagPill({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ fontSize: 9, fontFamily: "monospace", padding: "3px 8px",
      background: `${color}10`, border: `1px solid ${color}22`, borderRadius: 5, color: `${color}cc` }}>
      {text}
    </span>
  );
}

function PromptsPanel({ section, role, onAskBrain }: {
  section: string; role: PersonaRole; onAskBrain: (p: string) => void;
}) {
  const prompts = PROMPTS[section]?.[role] || [];
  if (!prompts.length) return null;
  return (
    <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 10 }}>
      <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.2)",
        letterSpacing: "0.1em", marginBottom: 6 }}>FIRE INTO BRAIN CHAT →</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {prompts.map((p, i) => (
          <button key={i} onClick={() => onAskBrain(p.prompt)} style={{
            textAlign: "left", background: "rgba(99,102,241,0.05)",
            border: "1px solid rgba(99,102,241,0.14)", borderRadius: 7,
            padding: "7px 10px", cursor: "pointer",
            display: "flex", alignItems: "flex-start", gap: 7,
          }}>
            <Brain size={9} style={{ color: "#6366f1", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 9, color: "rgba(165,180,252,0.72)", lineHeight: 1.5 }}>{p.label}</span>
            <span style={{ marginLeft: "auto", fontSize: 7, fontFamily: "monospace",
              color: "rgba(99,102,241,0.35)", flexShrink: 0 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── Data Transparency Panel ─────────────────────── */
/* ─────────────────────── Powered-By panel ───────────────────────
   Shows EXACTLY which Brain Command data sources fed this persona.
   Trust signal: the user can see this isn't generic — it used their real data. */
function PoweredByPanel({ persona, learningsCount, algoCount, canvasCount, projectContext }: {
  persona: any; learningsCount: number; algoCount: number; canvasCount: number; projectContext?: any;
}) {
  const bm = persona?._provenance?.brainMemory || {};
  const sources: { label: string; value: string; ok: boolean }[] = [
    { label: "Project data",       value: projectContext?.project?.name || "—", ok: !!projectContext },
    { label: "Brain Learnings",    value: `${bm.projectLearningsCount ?? learningsCount} active`,   ok: (bm.projectLearningsCount ?? learningsCount) > 0 },
    { label: "Algorithm Intel",    value: `${bm.algoIntelCount ?? algoCount} items`,                ok: (bm.algoIntelCount ?? algoCount) > 0 },
    { label: "Canvas state",       value: `${bm.canvasCardsCount ?? canvasCount} cards`,            ok: true },
    { label: "Analytics / GSC",    value: bm.hasAnalytics ? "loaded" : "missing",                   ok: !!bm.hasAnalytics },
    { label: "LLM/E-E-A-T metrics", value: bm.hasMetrics  ? "loaded" : "missing",                   ok: !!bm.hasMetrics },
    { label: "Audit history",      value: bm.hasAudits   ? "loaded" : "none yet",                   ok: !!bm.hasAudits },
    { label: "Live crawl data",    value: bm.hasCrawl    ? "loaded" : "not run",                    ok: !!bm.hasCrawl },
    { label: "Live URL fetch",     value: bm.siteFetched ? `homepage + ${bm.competitorsFetched || 0} competitor(s)` : "skipped", ok: !!bm.siteFetched },
    { label: "Cross-project wisdom", value: `${bm.industryWisdomCount || 0} industry learnings`,    ok: (bm.industryWisdomCount || 0) > 0 },
    { label: "Prior persona",      value: bm.priorPersonaExists ? "evolved from previous" : "first generation", ok: true },
  ];
  return (
    <div style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 9, color: "#a5b4fc", letterSpacing: "0.12em", marginBottom: 8, fontFamily: "monospace", fontWeight: 700 }}>
        ◉ POWERED BY · BRAIN COMMAND MEMORY
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 6 }}>
        {sources.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, padding: "5px 8px", borderRadius: 6, background: s.ok ? "rgba(16,185,129,0.06)" : "rgba(245,158,11,0.05)", border: `1px solid ${s.ok ? "rgba(16,185,129,0.18)" : "rgba(245,158,11,0.15)"}` }}>
            <span style={{ color: s.ok ? "#10b981" : "#f59e0b", fontFamily: "monospace", flexShrink: 0 }}>{s.ok ? "✓" : "○"}</span>
            <span style={{ color: "rgba(255,255,255,0.55)", flex: 1 }}>{s.label}:</span>
            <span style={{ color: s.ok ? "#10b981" : "rgba(245,158,11,0.9)", fontFamily: "monospace", fontSize: 9 }}>{s.value}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 8, fontStyle: "italic" }}>
        Every insight below is grounded in these sources. Where a source is missing, you'll see a flag inline.
      </div>
    </div>
  );
}

/* ─────────────────────── Actionable Cards & Suggested Learnings ─────────────────────── */
function ActionableSection({ persona, onSaveLearning, onAddToCanvas }: {
  persona: any; onSaveLearning?: (insight: any) => Promise<boolean>; onAddToCanvas?: (card: any) => Promise<boolean>;
}) {
  const cards = persona?.actionable_canvas_cards || [];
  const learnings = persona?.suggested_brain_learnings || [];
  const gaps = persona?.data_room_gaps_to_close || [];
  const [savedCards, setSavedCards] = useState<Record<number, "saving" | "saved" | "error">>({});
  const [savedLearns, setSavedLearns] = useState<Record<number, "saving" | "saved" | "error">>({});

  if (!cards.length && !learnings.length && !gaps.length) return null;

  const doAddCard = async (i: number, c: any) => {
    if (!onAddToCanvas) return;
    setSavedCards(s => ({ ...s, [i]: "saving" }));
    const ok = await onAddToCanvas(c);
    setSavedCards(s => ({ ...s, [i]: ok ? "saved" : "error" }));
  };
  const doSaveLearning = async (i: number, l: any) => {
    if (!onSaveLearning) return;
    setSavedLearns(s => ({ ...s, [i]: "saving" }));
    const ok = await onSaveLearning(l);
    setSavedLearns(s => ({ ...s, [i]: ok ? "saved" : "error" }));
  };

  return (
    <div style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.05), rgba(6,182,212,0.04))", border: "1px solid rgba(16,185,129,0.22)", borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "#10b981", letterSpacing: "0.1em", marginBottom: 10, fontFamily: "monospace", fontWeight: 700 }}>
        ▶ TAKE ACTION — TURN THIS PERSONA INTO EXECUTION
      </div>

      {cards.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 6, fontFamily: "monospace" }}>SUGGESTED CANVAS CARDS · BRAIN-GENERATED FROM PERSONA</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {cards.map((c: any, i: number) => {
              const st = savedCards[i];
              return (
                <div key={i} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#fff", fontWeight: 600, marginBottom: 3 }}>{c.title}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, marginBottom: 4 }}>{c.content}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
                        <span style={{ padding: "2px 6px", background: "rgba(99,102,241,0.12)", borderRadius: 4, color: "#a5b4fc" }}>{c.cardType}</span>
                        <span style={{ padding: "2px 6px", background: "rgba(245,158,11,0.12)", borderRadius: 4, color: "#fbbf24" }}>{c.priority}</span>
                        <span style={{ padding: "2px 6px", background: "rgba(16,185,129,0.12)", borderRadius: 4, color: "#34d399" }}>week {c.week}</span>
                        {c.persona_pain_point_served && <span style={{ fontStyle: "italic" }}>serves: {c.persona_pain_point_served}</span>}
                      </div>
                    </div>
                    <button onClick={() => doAddCard(i, c)} disabled={st === "saving" || st === "saved"} style={{
                      flexShrink: 0, padding: "6px 10px", borderRadius: 6, fontSize: 10, fontFamily: "monospace", cursor: st === "saved" ? "default" : "pointer",
                      background: st === "saved" ? "rgba(16,185,129,0.2)" : st === "error" ? "rgba(239,68,68,0.2)" : "rgba(99,102,241,0.18)",
                      border: `1px solid ${st === "saved" ? "rgba(16,185,129,0.4)" : st === "error" ? "rgba(239,68,68,0.4)" : "rgba(99,102,241,0.35)"}`,
                      color: st === "saved" ? "#10b981" : st === "error" ? "#ef4444" : "#a5b4fc",
                    }}>
                      {st === "saving" ? "Adding…" : st === "saved" ? "✓ On Canvas" : st === "error" ? "Retry" : "+ Add to Canvas"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {learnings.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 6, fontFamily: "monospace" }}>SUGGESTED BRAIN LEARNINGS · PERSISTENT INSIGHTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {learnings.map((l: any, i: number) => {
              const st = savedLearns[i];
              return (
                <div key={i} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#fff", fontWeight: 600, marginBottom: 3 }}>{l.title}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, marginBottom: 4 }}>{l.improvement}</div>
                      {l.summary && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>{l.summary}</div>}
                    </div>
                    <button onClick={() => doSaveLearning(i, l)} disabled={st === "saving" || st === "saved"} style={{
                      flexShrink: 0, padding: "6px 10px", borderRadius: 6, fontSize: 10, fontFamily: "monospace", cursor: st === "saved" ? "default" : "pointer",
                      background: st === "saved" ? "rgba(16,185,129,0.2)" : st === "error" ? "rgba(239,68,68,0.2)" : "rgba(168,85,247,0.18)",
                      border: `1px solid ${st === "saved" ? "rgba(16,185,129,0.4)" : st === "error" ? "rgba(239,68,68,0.4)" : "rgba(168,85,247,0.35)"}`,
                      color: st === "saved" ? "#10b981" : st === "error" ? "#ef4444" : "#c4b5fd",
                    }}>
                      {st === "saving" ? "Saving…" : st === "saved" ? "✓ Learned" : st === "error" ? "Retry" : "+ Save Learning"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {gaps.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 6, fontFamily: "monospace" }}>CLOSE THESE DATA ROOM GAPS · SHARPENS NEXT PERSONA</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {gaps.map((g: any, i: number) => (
              <div key={i} style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.18)", borderRadius: 6, padding: "8px 10px", fontSize: 10 }}>
                <div style={{ color: "#fbbf24", fontFamily: "monospace", marginBottom: 2 }}>⚠ {g.field}</div>
                <div style={{ color: "rgba(255,255,255,0.6)" }}>{g.why_it_matters}</div>
                {g.accuracy_boost && <div style={{ color: "rgba(255,255,255,0.4)", fontStyle: "italic", marginTop: 2 }}>→ {g.accuracy_boost}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DataTransparencyPanel({ persona, project }: { persona: any; project?: any }) {
  const [open, setOpen] = useState(true);
  const di = persona?.data_intelligence;
  const prov = persona?._provenance;

  // Determine what we can show — prefer AI-filled data_intelligence, fallback to server provenance
  const industry        = di?.industry_analyzed || prov?.industry || project?.industry || null;
  const company         = di?.company_analyzed  || prov?.company  || project?.name     || null;
  const region          = di?.market_region     || prov?.region   || null;
  const generated       = di?.analysis_generated ? formatDate(di.analysis_generated) : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const completeness    = di?.data_completeness  || null;
  const completenessReason = di?.data_completeness_reason || null;
  const provided        = di?.what_was_provided  || prov?.dataProvided || [];
  const assumed         = di?.what_was_assumed   || prov?.dataAssumed  || [];
  const basis           = di?.analysis_basis     || null;
  const recency         = di?.recency_note       || null;
  const improvements    = di?.what_would_improve_accuracy || [];
  const crossProject    = di?.cross_project_learnings_used || null;

  const cColor = completenessColor(completeness);

  return (
    <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(0,0,0,0.2)", overflow: "hidden", marginBottom: 12 }}>

      {/* Always-visible header */}
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        background: "rgba(255,255,255,0.02)", border: "none", cursor: "pointer",
        padding: "12px 14px", borderBottom: open ? "1px solid rgba(255,255,255,0.05)" : "none",
      }}>
        <Database size={11} style={{ color: "#06b6d4", flexShrink: 0 }} />
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#06b6d4",
            letterSpacing: "0.1em", fontWeight: 700, marginBottom: 2 }}>
            INTELLIGENCE DATA BASIS
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {industry && (
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>Industry: </span>{industry}
              </span>
            )}
            {company && company !== "Not specified" && (
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>Company: </span>{company}
              </span>
            )}
            {region && region !== "Global English-speaking markets" && (
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>Market: </span>{region}
              </span>
            )}
          </div>
        </div>
        {completeness && (
          <div style={{ padding: "2px 8px", borderRadius: 5,
            background: `${cColor}12`, border: `1px solid ${cColor}28`, flexShrink: 0 }}>
            <span style={{ fontSize: 7, fontFamily: "monospace", color: cColor, fontWeight: 700 }}>
              {completeness.toUpperCase()} DATA
            </span>
          </div>
        )}
        {open
          ? <ChevronDown size={10} style={{ color: "rgba(255,255,255,0.15)", flexShrink: 0 }} />
          : <ChevronRight size={10} style={{ color: "rgba(255,255,255,0.15)", flexShrink: 0 }} />}
      </button>

      {open && (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* No industry warning */}
          {!industry && (
            <div style={{ background: "rgba(239,68,68,0.08)", borderRadius: 8, padding: "10px 12px",
              border: "1px solid rgba(239,68,68,0.25)", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <AlertTriangle size={13} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 9, fontFamily: "monospace", color: "#ef4444", fontWeight: 700, marginBottom: 3 }}>
                  NO INDUSTRY PROVIDED
                </div>
                <p style={{ fontSize: 9, color: "rgba(252,165,165,0.8)", margin: 0, lineHeight: 1.6 }}>
                  This analysis was run without specifying an industry. Add your industry in Project Settings for accurate, specific results. The persona below is based on general digital services market patterns.
                </p>
              </div>
            </div>
          )}

          {/* Generated timestamp + basis */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Clock size={9} style={{ color: "rgba(255,255,255,0.25)" }} />
              <span style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(255,255,255,0.35)" }}>
                Generated: {generated}
              </span>
            </div>
            {crossProject && (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Database size={9} style={{ color: "rgba(255,255,255,0.25)" }} />
                <span style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(255,255,255,0.35)" }}>
                  {crossProject}
                </span>
              </div>
            )}
          </div>

          {/* Analysis basis */}
          {basis && (
            <div style={{ background: "rgba(6,182,212,0.06)", borderRadius: 7, padding: "8px 10px",
              border: "1px solid rgba(6,182,212,0.15)" }}>
              <div style={{ fontSize: 7, fontFamily: "monospace", color: "#06b6d4", marginBottom: 4 }}>
                ANALYSIS BASIS
              </div>
              <p style={{ fontSize: 9, color: "rgba(103,232,249,0.7)", margin: 0, lineHeight: 1.6 }}>{basis}</p>
            </div>
          )}

          {/* Provided vs Assumed */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "rgba(16,185,129,0.05)", borderRadius: 8, padding: "8px 10px",
              border: "1px solid rgba(16,185,129,0.15)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                <CheckCircle size={9} style={{ color: "#10b981" }} />
                <span style={{ fontSize: 7, fontFamily: "monospace", color: "#10b981", fontWeight: 700 }}>
                  PROVIDED ({provided.length})
                </span>
              </div>
              {provided.length === 0 ? (
                <p style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", margin: 0 }}>Nothing provided</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {provided.map((item: string, i: number) => (
                    <div key={i} style={{ fontSize: 8, color: "rgba(110,231,183,0.7)", lineHeight: 1.5 }}>
                      ✓ {item.replace(/^✓\s*/, "")}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ background: "rgba(245,158,11,0.05)", borderRadius: 8, padding: "8px 10px",
              border: "1px solid rgba(245,158,11,0.15)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                <AlertCircle size={9} style={{ color: "#f59e0b" }} />
                <span style={{ fontSize: 7, fontFamily: "monospace", color: "#f59e0b", fontWeight: 700 }}>
                  ASSUMED ({assumed.length})
                </span>
              </div>
              {assumed.length === 0 ? (
                <div style={{ fontSize: 8, color: "rgba(110,231,183,0.7)" }}>All data provided ✓</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {assumed.map((item: string, i: number) => (
                    <div key={i} style={{ fontSize: 8, color: "rgba(253,186,116,0.7)", lineHeight: 1.5 }}>
                      ~ {item.replace(/^⚠\s*/, "").split("—")[0].trim()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Completeness reason */}
          {completenessReason && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <Info size={9} style={{ color: cColor, flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", margin: 0, lineHeight: 1.5 }}>
                {completenessReason}
              </p>
            </div>
          )}

          {/* Recency note */}
          {recency && (
            <div style={{ background: "rgba(239,68,68,0.04)", borderRadius: 7, padding: "7px 10px",
              border: "1px solid rgba(239,68,68,0.1)" }}>
              <div style={{ fontSize: 7, fontFamily: "monospace", color: "#f87171", marginBottom: 3 }}>
                ⚠ RECENCY — VALIDATE BEFORE CLIENT PRESENTATION
              </div>
              <p style={{ fontSize: 8, color: "rgba(252,165,165,0.6)", margin: 0, lineHeight: 1.5 }}>
                {recency}
              </p>
            </div>
          )}

          {/* What would improve accuracy */}
          {improvements.length > 0 && (
            <div>
              <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.2)",
                marginBottom: 5, letterSpacing: "0.08em" }}>ADD THIS DATA FOR BETTER ACCURACY</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {improvements.map((item: string, i: number) => (
                  <span key={i} style={{ fontSize: 8, color: "rgba(255,255,255,0.4)",
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 5, padding: "2px 8px" }}>+ {item}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Main export ─────────────────────── */
export function MarketPersonaBriefing({ persona, goals, project, projectContext, learnings = [], algoItems = [], canvasBlocks = [], onAskBrain, onSaveLearning, onAddToCanvas, crossProjectCount = 0 }: BriefingProps) {
  const [role, setRole] = useState<PersonaRole>("agency");
  if (!persona) return null;

  const rc = ROLES[role];
  const RoleIcon = rc.icon;
  const di = persona.data_intelligence;

  // Determine data basis for each section — honest labelling
  const hasBasisData = (di?.what_was_provided || []).length > 0;
  const hasKeywords  = (persona._provenance?.keywordCount || 0) > 0 || (di?.what_was_provided || []).some((s: string) => s.includes("keyword"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── IDENTITY HEADER ── */}
      <div style={{ background: "linear-gradient(135deg,rgba(6,182,212,0.07),rgba(99,102,241,0.05))",
        borderRadius: 12, border: "1px solid rgba(6,182,212,0.15)",
        padding: "16px 18px", marginBottom: 10 }}>
        <div style={{ fontSize: 7, fontFamily: "monospace", color: "#06b6d4",
          letterSpacing: "0.14em", marginBottom: 8, fontWeight: 700 }}>
          ◈ MARKET INTELLIGENCE BRIEF
          {di?.industry_analyzed && (
            <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>
              {" "}— {di.industry_analyzed.toUpperCase()}
              {di.market_region && di.market_region !== "Global English-speaking markets"
                ? ` · ${di.market_region.toUpperCase()}` : ""}
            </span>
          )}
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#e0e7ff", lineHeight: 1.2, marginBottom: 3 }}>
          {persona.persona_name || "Market Persona"}
        </div>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(165,180,252,0.5)", marginBottom: 10 }}>
          {persona.persona_archetype}
        </div>
        {persona.market_context && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, margin: 0 }}>
            {persona.market_context}
          </p>
        )}

        {/* Manav Key Insight */}
        {persona.manav_intelligence_note && (
          <div style={{ marginTop: 12, background: "rgba(245,158,11,0.08)", borderRadius: 8,
            padding: "10px 12px", border: "1px solid rgba(245,158,11,0.2)" }}>
            <div style={{ fontSize: 7, fontFamily: "monospace", color: "#f59e0b",
              marginBottom: 5, letterSpacing: "0.1em", fontWeight: 700 }}>
              ◈ MANAV KEY INSIGHT — WHAT MOST MISS IN THIS MARKET
            </div>
            <p style={{ fontSize: 10, color: "rgba(253,224,71,0.82)", fontWeight: 500,
              lineHeight: 1.7, margin: 0 }}>
              {persona.manav_intelligence_note}
            </p>
          </div>
        )}
      </div>

      {/* ── DATA TRANSPARENCY PANEL ── */}
      <DataTransparencyPanel persona={persona} project={project} />

      {/* ── POWERED BY · BRAIN COMMAND MEMORY ── */}
      <PoweredByPanel
        persona={persona}
        learningsCount={learnings.length}
        algoCount={algoItems.length}
        canvasCount={canvasBlocks.length}
        projectContext={projectContext}
      />

      {/* ── ACTIONABLE: Canvas cards + Brain Learnings + Data Room gaps ── */}
      <ActionableSection persona={persona} onSaveLearning={onSaveLearning} onAddToCanvas={onAddToCanvas} />

      {/* ── ROLE SWITCHER ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5, marginBottom: 10 }}>
        {(Object.entries(ROLES) as [PersonaRole, typeof ROLES[PersonaRole]][]).map(([key, cfg]) => {
          const active = role === key;
          const Ico = cfg.icon;
          return (
            <button key={key} onClick={() => setRole(key)} style={{
              background: active ? `${cfg.color}12` : "rgba(255,255,255,0.02)",
              border: `1px solid ${active ? cfg.color + "35" : "rgba(255,255,255,0.05)"}`,
              borderRadius: 8, padding: "7px 5px", cursor: "pointer", textAlign: "center", transition: "all 0.15s",
            }}>
              <Ico size={11} style={{ color: active ? cfg.color : "rgba(255,255,255,0.18)", margin: "0 auto 3px" }} />
              <div style={{ fontSize: 7, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.04em",
                color: active ? cfg.color : "rgba(255,255,255,0.22)", lineHeight: 1.3 }}>
                {cfg.label.toUpperCase()}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 8, color: `${rc.color}aa`, fontFamily: "monospace",
        padding: "5px 8px", marginBottom: 10, background: `${rc.color}07`,
        borderRadius: 6, border: `1px solid ${rc.color}15` }}>
        <RoleIcon size={8} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }} />
        {rc.tagline}
      </div>

      {/* ── INTELLIGENCE SECTIONS ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>

        {/* BUYER PROFILE */}
        {persona.buyer_profile && (
          <InsightCard title="Buyer Profile" icon={Brain} color="#a78bfa"
            basis={hasBasisData ? "provided" : "industry"} defaultOpen>
            {[
              { k: "Who they are",         v: persona.buyer_profile.who_they_are },
              { k: "Decision timeline",    v: persona.buyer_profile.decision_timeline },
              { k: "Research depth",       v: persona.buyer_profile.research_depth },
              { k: "Budget mindset",       v: persona.buyer_profile.budget_mindset },
              { k: "Decision authority",   v: persona.buyer_profile.decision_authority },
            ].filter(r => r.v).map(r => <FactRow key={r.k} text={`${r.k}: ${r.v}`} color="#a78bfa" />)}
            {(persona.buyer_profile.triggers_that_start_the_search || []).length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.22)", marginBottom: 5 }}>
                  WHAT TRIGGERS THE SEARCH
                </div>
                {(persona.buyer_profile.triggers_that_start_the_search || []).map((t: string, i: number) => (
                  <FactRow key={i} text={t} color="#c4b5fd" />
                ))}
              </div>
            )}
            <PromptsPanel section="psychology" role={role} onAskBrain={onAskBrain} />
          </InsightCard>
        )}

        {/* PSYCHOLOGY */}
        {persona.psychology && (
          <InsightCard title="Buyer Psychology & Fears" icon={Brain} color="#fb923c" basis="industry">
            {persona.psychology.deepest_fear && (
              <div style={{ background: "rgba(239,68,68,0.07)", borderRadius: 8, padding: "10px 12px",
                border: "1px solid rgba(239,68,68,0.2)", marginBottom: 10 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#ef4444",
                  marginBottom: 4, letterSpacing: "0.08em" }}>
                  ⚠ DEEPEST FEAR — MOST POWERFUL HOOK
                </div>
                <p style={{ fontSize: 11, color: "rgba(252,165,165,0.85)", fontWeight: 600,
                  margin: 0, lineHeight: 1.6 }}>
                  {persona.psychology.deepest_fear}
                </p>
              </div>
            )}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.22)", marginBottom: 5 }}>
                PRIMARY PAIN POINTS
              </div>
              {(persona.psychology.primary_pain_points || []).map((p: string, i: number) => (
                <FactRow key={i} text={p} color="#fb923c" />
              ))}
            </div>
            {persona.psychology.what_they_actually_want && (
              <div style={{ background: "rgba(16,185,129,0.06)", borderRadius: 7, padding: "8px 10px",
                border: "1px solid rgba(16,185,129,0.14)", marginBottom: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#10b981", marginBottom: 3 }}>
                  WHAT THEY REALLY WANT
                </div>
                <p style={{ fontSize: 10, color: "rgba(110,231,183,0.75)", margin: 0, lineHeight: 1.6 }}>
                  {persona.psychology.what_they_actually_want}
                </p>
              </div>
            )}
            {(persona.psychology.decision_triggers || []).length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.22)", marginBottom: 5 }}>
                  WHAT FINALLY MAKES THEM ACT
                </div>
                {(persona.psychology.decision_triggers || []).map((t: string, i: number) => (
                  <FactRow key={i} text={t} color="#4ade80" />
                ))}
              </div>
            )}
            {(persona.psychology.objections_they_raise || []).length > 0 && (
              <div>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.22)", marginBottom: 5 }}>
                  OBJECTIONS THEY RAISE
                </div>
                {(persona.psychology.objections_they_raise || []).map((o: string, i: number) => (
                  <FactRow key={i} text={o} color="#f87171" />
                ))}
              </div>
            )}
            <PromptsPanel section="psychology" role={role} onAskBrain={onAskBrain} />
          </InsightCard>
        )}

        {/* SEARCH BEHAVIOR */}
        {persona.search_behavior && (
          <InsightCard title="Search Behavior & Intent Journey" icon={Search} color="#67e8f9"
            basis={hasKeywords ? "provided" : "inferred"}>
            {!hasKeywords && (
              <div style={{ fontSize: 8, color: "rgba(245,158,11,0.7)", fontFamily: "monospace",
                marginBottom: 8, padding: "4px 8px", background: "rgba(245,158,11,0.06)",
                borderRadius: 5, border: "1px solid rgba(245,158,11,0.15)" }}>
                ~ No keywords provided — queries below are industry pattern inference, not your specific site
              </div>
            )}
            {persona.search_behavior.how_they_search && (
              <FactRow text={persona.search_behavior.how_they_search} color="#67e8f9" />
            )}
            {persona.search_behavior.intent_shift && (
              <div style={{ background: "rgba(6,182,212,0.06)", borderRadius: 7, padding: "7px 10px",
                border: "1px solid rgba(6,182,212,0.14)", margin: "8px 0" }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#06b6d4", marginBottom: 3 }}>
                  INTENT SHIFT
                </div>
                <p style={{ fontSize: 9, color: "rgba(103,232,249,0.7)", margin: 0, lineHeight: 1.6 }}>
                  {persona.search_behavior.intent_shift}
                </p>
              </div>
            )}
            {[
              { label: "FIRST SEARCHES",      items: persona.search_behavior.first_search_queries,  color: "#67e8f9" },
              { label: "REFINEMENT QUERIES",  items: persona.search_behavior.refinement_queries,    color: "#a5f3fc" },
              { label: "COMPARISON QUERIES",  items: persona.search_behavior.comparison_queries,    color: "#22d3ee" },
            ].filter(g => g.items?.length).map(g => (
              <div key={g.label} style={{ marginTop: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.22)", marginBottom: 4 }}>
                  {g.label}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(g.items || []).map((q: string, i: number) => <TagPill key={i} text={q} color={g.color} />)}
                </div>
              </div>
            ))}
            <PromptsPanel section="search_behavior" role={role} onAskBrain={onAskBrain} />
          </InsightCard>
        )}

        {/* LANGUAGE PATTERNS */}
        {persona.language_patterns && (
          <InsightCard title="Language & Conversion Vocabulary" icon={MessageSquare} color="#fcd34d" basis="industry">
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", marginBottom: 8 }}>
              The exact words buyers use — and which convert vs repel.
            </div>
            {[
              { label: "WORDS THEY ACTUALLY USE",  items: persona.language_patterns.words_they_use,    color: "#fcd34d" },
              { label: "WORDS THAT CONVERT",        items: persona.language_patterns.words_that_convert, color: "#4ade80" },
              { label: "WORDS THAT REPEL THEM",     items: persona.language_patterns.words_that_repel,   color: "#f87171" },
            ].filter(g => g.items?.length).map(g => (
              <div key={g.label} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.22)", marginBottom: 5 }}>{g.label}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(g.items || []).map((w: string, i: number) => <TagPill key={i} text={w} color={g.color} />)}
                </div>
              </div>
            ))}
            {(persona.language_patterns.questions_they_type_into_google || []).length > 0 && (
              <div>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.22)", marginBottom: 6 }}>
                  GOOGLE QUESTIONS THEY TYPE
                </div>
                {(persona.language_patterns.questions_they_type_into_google || []).map((q: string, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 8, color: "#fbbf24", flexShrink: 0, marginTop: 2 }}>?</span>
                    <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(252,211,77,0.65)", lineHeight: 1.5, flex: 1 }}>{q}</span>
                    <button onClick={() => onAskBrain(`Create a detailed SEO content brief for the query: "${q}". Use the buyer persona context. Include: title, meta description, content structure, word count, and what conversion action to target.`)}
                      style={{ flexShrink: 0, background: "rgba(99,102,241,0.1)",
                        border: "1px solid rgba(99,102,241,0.2)", borderRadius: 4, padding: "2px 5px",
                        cursor: "pointer", fontSize: 7, color: "#a5b4fc", fontFamily: "monospace" }}>
                      BRIEF →
                    </button>
                  </div>
                ))}
              </div>
            )}
            <PromptsPanel section="language" role={role} onAskBrain={onAskBrain} />
          </InsightCard>
        )}

        {/* TRUST SIGNALS */}
        {persona.trust_signals && (
          <InsightCard title="Trust Signals & Proof Requirements" icon={Shield} color="#10b981" basis="industry">
            {(persona.trust_signals.what_raises_red_flags || []).length > 0 && (
              <div style={{ background: "rgba(239,68,68,0.07)", borderRadius: 8, padding: "10px 12px",
                border: "1px solid rgba(239,68,68,0.2)", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 6 }}>
                  <AlertTriangle size={9} style={{ color: "#ef4444" }} />
                  <span style={{ fontSize: 7, fontFamily: "monospace", color: "#ef4444",
                    letterSpacing: "0.08em", fontWeight: 700 }}>
                    RED FLAGS — CAUSES IMMEDIATE BOUNCE
                  </span>
                </div>
                {(persona.trust_signals.what_raises_red_flags || []).map((f: string, i: number) => (
                  <FactRow key={i} text={f} color="#f87171" />
                ))}
              </div>
            )}
            {(persona.trust_signals.what_builds_immediate_trust || []).length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#10b981", marginBottom: 5 }}>
                  ✓ WHAT BUILDS IMMEDIATE TRUST
                </div>
                {(persona.trust_signals.what_builds_immediate_trust || []).map((t: string, i: number) => (
                  <FactRow key={i} text={t} color="#4ade80" />
                ))}
              </div>
            )}
            {(persona.trust_signals.proof_formats_they_need || []).length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.22)", marginBottom: 5 }}>
                  PROOF FORMATS REQUIRED
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(persona.trust_signals.proof_formats_they_need || []).map((p: string, i: number) => (
                    <TagPill key={i} text={p} color="#6ee7b7" />
                  ))}
                </div>
              </div>
            )}
            {persona.trust_signals.content_they_share_or_save && (
              <FactRow text={`Content they share/save: ${persona.trust_signals.content_they_share_or_save}`} color="#10b981" />
            )}
            <PromptsPanel section="trust" role={role} onAskBrain={onAskBrain} />
          </InsightCard>
        )}

        {/* COMPETITIVE AWARENESS */}
        {persona.competitive_awareness && (
          <InsightCard title="Competitive Awareness" icon={Target} color="#f472b6"
            basis={persona._provenance?.competitorCount > 0 ? "provided" : "inferred"}>
            {persona._provenance?.competitorCount > 0 ? null : (
              <div style={{ fontSize: 8, color: "rgba(245,158,11,0.7)", fontFamily: "monospace",
                marginBottom: 8, padding: "4px 8px", background: "rgba(245,158,11,0.06)",
                borderRadius: 5, border: "1px solid rgba(245,158,11,0.15)" }}>
                ~ No competitors provided — alternatives below are typical for this industry
              </div>
            )}
            {(persona.competitive_awareness.alternatives_they_consider || []).length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.22)", marginBottom: 5 }}>
                  ALTERNATIVES THEY CONSIDER
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(persona.competitive_awareness.alternatives_they_consider || []).map((a: string, i: number) => (
                    <TagPill key={i} text={a} color="#f9a8d4" />
                  ))}
                </div>
              </div>
            )}
            {persona.competitive_awareness.why_they_choose_one_over_another && (
              <div style={{ background: "rgba(244,114,182,0.07)", borderRadius: 7, padding: "8px 10px",
                border: "1px solid rgba(244,114,182,0.18)", marginBottom: 8 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#f472b6", marginBottom: 3 }}>
                  THE REAL DECIDING FACTOR
                </div>
                <p style={{ fontSize: 10, color: "rgba(249,168,212,0.8)", fontWeight: 600, margin: 0, lineHeight: 1.6 }}>
                  {persona.competitive_awareness.why_they_choose_one_over_another}
                </p>
              </div>
            )}
            {persona.competitive_awareness.why_they_leave_and_try_someone_else && (
              <div style={{ background: "rgba(239,68,68,0.06)", borderRadius: 7, padding: "8px 10px",
                border: "1px solid rgba(239,68,68,0.14)" }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#ef4444", marginBottom: 3 }}>
                  ⚡ SWITCHING TRIGGER
                </div>
                <p style={{ fontSize: 10, color: "rgba(252,165,165,0.8)", margin: 0, lineHeight: 1.6 }}>
                  {persona.competitive_awareness.why_they_leave_and_try_someone_else}
                </p>
              </div>
            )}
            <PromptsPanel section="competitive" role={role} onAskBrain={onAskBrain} />
          </InsightCard>
        )}

        {/* SEO & CONTENT IMPLICATIONS */}
        {persona.seo_content_implications && (
          <InsightCard title="SEO & Content Implications" icon={Zap} color="#818cf8"
            basis={hasKeywords ? "provided" : "industry"}>
            {!hasKeywords && (
              <div style={{ fontSize: 8, color: "rgba(245,158,11,0.7)", fontFamily: "monospace",
                marginBottom: 8, padding: "4px 8px", background: "rgba(245,158,11,0.06)",
                borderRadius: 5, border: "1px solid rgba(245,158,11,0.15)" }}>
                ~ No keywords provided — keyword examples below are industry inferences, validate against real search data
              </div>
            )}
            {(persona.seo_content_implications.content_gaps_this_persona_needs_filled || []).length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 7, fontFamily: "monospace", color: "#818cf8", marginBottom: 6 }}>
                  CONTENT GAPS — RANKED BY BUYER NEED
                </div>
                {(persona.seo_content_implications.content_gaps_this_persona_needs_filled || []).map((g: string, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 8, fontFamily: "monospace", color: "#818cf8",
                      background: "rgba(129,140,248,0.1)", borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, flex: 1 }}>{g}</span>
                    <button onClick={() => onAskBrain(`Write a detailed content brief for this gap: "${g}". Include: target audience, angle, format, word count, SEO requirements, and what conversion this supports.`)}
                      style={{ flexShrink: 0, background: "rgba(129,140,248,0.08)",
                        border: "1px solid rgba(129,140,248,0.2)", borderRadius: 4, padding: "2px 5px",
                        cursor: "pointer", fontSize: 7, color: "#a5b4fc", fontFamily: "monospace" }}>
                      BRIEF →
                    </button>
                  </div>
                ))}
              </div>
            )}
            {(persona.seo_content_implications.keyword_intent_map || []).map((m: any, i: number) => {
              const intentColor = m.intent?.includes("aware") ? "#67e8f9" : m.intent?.includes("consid") ? "#a5b4fc" : "#4ade80";
              return (
                <div key={i} style={{ marginBottom: 8, background: "rgba(255,255,255,0.02)",
                  borderRadius: 7, padding: "7px 10px", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <div style={{ fontSize: 7, fontFamily: "monospace", color: intentColor,
                      letterSpacing: "0.08em", fontWeight: 700 }}>
                      {(m.intent || "").toUpperCase()} INTENT
                    </div>
                    {m.basis && (
                      <BasisTag basis={m.basis === "provided keywords" || m.basis?.includes("provided") ? "provided" : "inferred"} />
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(m.example_keywords || []).map((kw: string, j: number) => (
                      <TagPill key={j} text={kw} color={intentColor} />
                    ))}
                  </div>
                </div>
              );
            })}
            <PromptsPanel section="seo_implications" role={role} onAskBrain={onAskBrain} />
          </InsightCard>
        )}
      </div>

      {/* ── EXPERT ACTIONS ── */}
      <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(99,102,241,0.04)",
        borderRadius: 10, border: "1px solid rgba(99,102,241,0.1)" }}>
        <div style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(255,255,255,0.18)",
          letterSpacing: "0.1em", marginBottom: 8 }}>
          ◈ WHAT EXPERTS DO WITH THIS INTELLIGENCE
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {[
            { label: "Build full 90-day content strategy", prompt: `Using this full market persona and buyer intelligence for ${di?.industry_analyzed || "this industry"}, build a comprehensive 90-day content strategy. Include: keyword priority order, content types, publishing sequence, and success metrics. Be specific — no generic frameworks.` },
            { label: "Write homepage conversion brief",    prompt: `Using this buyer persona, write a detailed homepage conversion brief: exact headline options using buyer language, subheadline, above-fold proof elements needed, CTA text, and what the hero section must NOT say (repel words).` },
            { label: "Competitive battle card",            prompt: `Create a competitive battle card from this persona's competitive analysis. How do we position vs each alternative they consider? What's our winning narrative for the deciding factor? How do we intercept the switching trigger?` },
            { label: "Executive summary for client",       prompt: `Write a 1-page market intelligence executive summary for client presentation. Structure: Market reality (2 sentences) → Who your buyer actually is (3 bullet points) → What they fear most → What makes them trust → Strategic recommendation → Immediate action.` },
          ].map((item, i) => (
            <button key={i} onClick={() => onAskBrain(item.prompt)} style={{
              textAlign: "left", background: "rgba(99,102,241,0.05)",
              border: "1px solid rgba(99,102,241,0.11)", borderRadius: 7,
              padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
            }}>
              <Zap size={9} style={{ color: "#6366f1", flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: "rgba(165,180,252,0.68)" }}>{item.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 7, fontFamily: "monospace",
                color: "rgba(99,102,241,0.35)" }}>→ BRAIN</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
