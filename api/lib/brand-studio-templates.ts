/* ════════════════════════════════════════════════════════════════
   api/lib/brand-studio-templates.ts
   Brand Studio H.2 — Template library (configuration only).

   Each template defines:
   - Identity (id, label, category)
   - Required Data Room context (which categories MUST be populated)
   - Useful document types (will pull relevant ingested docs)
   - Default audience role + voice calibration
   - Section structure (the doc's outline)
   - Verification strictness

   Templates are pure config — the engine in brand-studio-generate.ts
   reads these and runs the generation. Adding a new template = adding
   a new entry here, no engine changes needed.
═══════════════════════════════════════════════════════════════ */

export type TemplateCategory =
  | "strategic"
  | "performance"
  | "competitive"
  | "forward_looking";

export interface SectionSpec {
  key:                   string;             /* stable identifier */
  title:                 string;
  description:           string;              /* what this section should answer */
  required_categories?:  string[];            /* Data Room categories this section needs */
  min_confidence?:       "high" | "medium" | "low";
}

export interface TemplateSpec {
  id:                    string;
  label:                 string;
  description:           string;
  category:              TemplateCategory;
  /* Data Room fields the AI should pull from. AT LEAST one field
     from each category must be populated, or generation refuses. */
  required_categories:   string[];
  /* Categories that are nice-to-have, used if present */
  optional_categories:   string[];
  /* Doc types worth surfacing as source material */
  useful_doc_types:      string[];
  /* Default audience for this template — PM can override */
  default_audience_role: string;
  /* "investor_grade" enforces stricter source citation — sections
     with no sources are downgraded; assumptions must be explicit */
  verification_strictness: "standard" | "investor_grade";
  /* The structured outline — the AI fills these section keys */
  sections:              SectionSpec[];
  /* Tone calibration hint surfaced to the AI */
  voice_hint:            string;
}

/* ─── Brand Statement ─────────────────────────────────────────── */
const BRAND_STATEMENT: TemplateSpec = {
  id: "brand_statement",
  label: "Brand Statement",
  description:
    "The 'who you are' anchor doc. One-page declaration of mission, vision, values, and what makes the brand distinct. Becomes the canonical reference for everything else.",
  category: "strategic",
  required_categories: ["identity", "audience"],
  optional_categories: ["brand_narrative", "content", "goal"],
  useful_doc_types: ["brand_guidelines", "strategy_deck", "internal_memo"],
  default_audience_role: "client_internal",
  verification_strictness: "standard",
  voice_hint: "Confident, declarative, brand-defining. Each sentence should be quotable.",
  sections: [
    { key: "mission",       title: "Mission",       description: "One sentence: what the brand does, for whom, to what end. Active voice." },
    { key: "vision",        title: "Vision",        description: "One sentence: the future state the brand is working toward." },
    { key: "values",        title: "Values",        description: "3-5 values that guide decisions, in priority order. Each value gets a one-sentence definition." },
    { key: "what_we_do",    title: "What We Do",    description: "Paragraph describing the primary offering and its uniqueness." },
    { key: "who_we_serve",  title: "Who We Serve",  description: "Paragraph describing the ideal customer and what they need from us." },
    { key: "what_makes_us_different", title: "What Makes Us Different", description: "Paragraph on positioning vs alternatives — what we do that competitors don't or can't.", required_categories: ["competitor", "identity"] },
  ],
};

/* ─── Positioning & Differentiation Memo ──────────────────────── */
const POSITIONING_MEMO: TemplateSpec = {
  id: "positioning_memo",
  label: "Positioning & Differentiation Memo",
  description:
    "Strategic memo defining where the brand sits in the market and why. Maps the competitive landscape, identifies the wedge, articulates the proof. Used internally and with key stakeholders.",
  category: "strategic",
  required_categories: ["identity", "competitor", "audience"],
  optional_categories: ["content", "history"],
  useful_doc_types: ["strategy_deck", "market_research", "persona_research"],
  default_audience_role: "client_executive",
  verification_strictness: "investor_grade",
  voice_hint: "Strategic, analytical, evidence-led. Senior consultant briefing the C-suite.",
  sections: [
    { key: "market_context",       title: "Market Context",       description: "The category, the alternatives, where buyers currently turn." },
    { key: "competitive_landscape",title: "Competitive Landscape",description: "Map of competitors and their positions. Where each one wins." },
    { key: "our_position",         title: "Our Position",         description: "Where we sit and why. The wedge — what we do that they don't." },
    { key: "proof_points",         title: "Proof Points",         description: "Evidence supporting the position — customer outcomes, traction signals, distinctive capabilities." },
    { key: "positioning_statement",title: "Positioning Statement",description: "Formal positioning statement: 'For [audience] who [need], [brand] is the [category] that [unique benefit] because [proof].'" },
    { key: "risks_to_position",    title: "Risks to the Position",description: "What could undermine this positioning? Competitor moves, market shifts, internal gaps." },
  ],
};

/* ─── Audience Persona Document ───────────────────────────────── */
const AUDIENCE_PERSONA: TemplateSpec = {
  id: "audience_persona",
  label: "Audience Persona Document",
  description:
    "Full persona briefs synthesized from interviews, sales notes, customer feedback, and existing Data Room audience data. One persona per primary buyer. Used to brief content writers, sales, and ad strategists.",
  category: "strategic",
  required_categories: ["audience"],
  optional_categories: ["content", "history", "identity"],
  useful_doc_types: ["persona_research", "sales_call_notes", "customer_feedback", "case_study"],
  default_audience_role: "team_creative",
  verification_strictness: "standard",
  voice_hint: "Empathetic, specific, behaviorally grounded. Writers and ad strategists should be able to write to this persona without further research.",
  sections: [
    { key: "icp_overview",         title: "Ideal Customer Profile",description: "Firmographic / demographic summary. What kind of buyer fits us." },
    { key: "persona_1",            title: "Primary Persona",      description: "Full brief on the primary persona: role, motivations, pain points, language patterns, objections, decision criteria. Cite specific evidence from sales notes or research." },
    { key: "persona_2",            title: "Secondary Persona",    description: "Same depth for the secondary persona IF the evidence supports a distinct second audience. If not, write 'No second persona evidence yet — single-persona positioning.'" },
    { key: "language_patterns",    title: "Language Patterns",    description: "Specific words, phrases, and metaphors customers use. Useful for content writers." },
    { key: "common_objections",    title: "Common Objections",    description: "The 3-5 most common reasons prospects hesitate or say no. Each with a recommended response angle." },
    { key: "decision_criteria",    title: "How They Decide",      description: "What they evaluate, what they care about most, who else gets involved." },
  ],
};

/* ─── Content Style Guide ─────────────────────────────────────── */
const CONTENT_STYLE_GUIDE: TemplateSpec = {
  id: "content_style_guide",
  label: "Content Style Guide",
  description:
    "Practical writing guide for content created in the brand's name. Voice, tone, vocabulary, formatting, what to avoid. Reads like a working document writers actually use.",
  category: "strategic",
  required_categories: ["content"],
  optional_categories: ["brand_narrative", "audience", "identity"],
  useful_doc_types: ["brand_guidelines", "legal_compliance", "ad_brief"],
  default_audience_role: "team_creative",
  verification_strictness: "standard",
  voice_hint: "Practical, example-led, prescriptive where it matters. Writers should be able to apply this without ambiguity.",
  sections: [
    { key: "voice_summary",       title: "Voice — In Three Words", description: "Three adjectives that define the brand's voice." },
    { key: "voice_examples",      title: "Voice in Practice",      description: "Side-by-side examples — 'we write like this, not like that.' At least 3 concrete pairs." },
    { key: "tone_calibration",    title: "Tone by Context",        description: "How tone shifts: marketing copy vs help docs vs press release vs sales follow-up." },
    { key: "vocabulary",          title: "Vocabulary Choices",     description: "Preferred terms and discouraged terms. Industry jargon: use or avoid. Customer language we mirror." },
    { key: "structural_patterns", title: "Structural Patterns",    description: "Heading hierarchy, paragraph length, list usage, CTA patterns." },
    { key: "what_to_avoid",       title: "What to Avoid",          description: "Prohibited topics, prohibited claims, required disclaimers. Be specific — cite source where relevant." },
  ],
};

/* ─── Executive Summary ───────────────────────────────────────── */
const EXECUTIVE_SUMMARY: TemplateSpec = {
  id: "executive_summary",
  label: "Executive Summary",
  description:
    "Plain-language project state, three pages or less. What's happening, what's working, what isn't, what's next. Written for a non-technical reader who doesn't have time for the long version.",
  category: "performance",
  required_categories: ["goal", "identity"],
  optional_categories: ["analytics", "technical", "history", "competitor"],
  useful_doc_types: ["audit_report", "gsc_export", "ga4_export", "strategy_deck"],
  default_audience_role: "client_executive",
  verification_strictness: "standard",
  voice_hint: "Direct, jargon-free, leadership-grade. Lead with the conclusion. No hedging.",
  sections: [
    { key: "headline",          title: "Headline",         description: "One sentence: where the project stands today. The 'if you only read one line, read this' version." },
    { key: "current_state",     title: "Current State",    description: "Plain-language summary of where things are. Cite specific numbers if available; otherwise describe directionally with confidence flagged." },
    { key: "whats_working",     title: "What's Working",   description: "The things going well right now. Cite the evidence." },
    { key: "whats_not_working", title: "What's Not Working",description: "Honest assessment of blockers, gaps, or underperformance. No sugarcoating." },
    { key: "next_30_60_90",     title: "Next 30 / 60 / 90 Days", description: "Concrete actions and expected outcomes for each window." },
    { key: "what_we_need",      title: "What We Need from You", description: "Asks of the executive — decisions, sign-offs, access, budget. Specific and actionable." },
  ],
};

/* ─── Quarterly Business Review ───────────────────────────────── */
const QBR: TemplateSpec = {
  id: "qbr",
  label: "Quarterly Business Review",
  description:
    "Full QBR document for the quarterly client meeting. Performance against plan, narrative for the numbers, strategic shifts, plan for next quarter. Designed to be presented from.",
  category: "performance",
  required_categories: ["goal", "analytics"],
  optional_categories: ["identity", "audience", "technical", "competitor", "history"],
  useful_doc_types: ["gsc_export", "ga4_export", "ahrefs_export", "audit_report"],
  default_audience_role: "client_executive",
  verification_strictness: "investor_grade",
  voice_hint: "Confident, evidence-led, narrative-driven. The numbers tell a story; tell it.",
  sections: [
    { key: "quarter_summary",       title: "Quarter Summary",       description: "Top-line: what did we set out to do, what happened, what's the verdict." },
    { key: "performance_vs_plan",   title: "Performance vs Plan",   description: "Specific metric comparisons. Where we beat plan, where we missed, why." },
    { key: "narrative_for_numbers", title: "What the Numbers Mean", description: "The story behind the data. Not just what changed — why, and what it implies." },
    { key: "wins_this_quarter",     title: "Key Wins",              description: "3-5 specific wins, each with evidence and what enabled it." },
    { key: "gaps_and_blockers",     title: "Gaps & Blockers",       description: "What underperformed, why, and what we'll do about it." },
    { key: "strategic_shifts",      title: "Strategic Shifts",      description: "Where we're changing direction based on what we learned this quarter." },
    { key: "next_quarter_plan",     title: "Next Quarter Plan",     description: "Specific initiatives + expected outcomes + success criteria." },
    { key: "asks",                  title: "Asks of the Client",    description: "Decisions, access, resources, or input we need to execute." },
  ],
};

/* ─── Competitor Battlecard ───────────────────────────────────── */
const COMPETITOR_BATTLECARD: TemplateSpec = {
  id: "competitor_battlecard",
  label: "Competitor Battlecard",
  description:
    "Per-competitor brief: where they win, where we win, how to counter their pitch. Used by sales, content, and strategy teams when our prospects mention this competitor.",
  category: "competitive",
  required_categories: ["competitor", "identity"],
  optional_categories: ["audience", "content", "backlinks"],
  useful_doc_types: ["market_research", "sales_call_notes", "press_coverage", "strategy_deck"],
  default_audience_role: "sales_team",
  verification_strictness: "standard",
  voice_hint: "Tactical, specific, action-ready. A salesperson reading this 5 minutes before a call should walk in confident.",
  sections: [
    { key: "competitor_overview",   title: "Who They Are",         description: "Brief overview of the competitor — who they target, what they do." },
    { key: "where_they_win",        title: "Where They Win",        description: "Their strongest positioning, audiences where they're hard to beat. Be honest." },
    { key: "where_we_win",          title: "Where We Win",          description: "Our distinctive advantages over them. Cite specific evidence — proof points, customer wins." },
    { key: "common_objections",     title: "Common Prospect Objections", description: "What prospects say when comparing us to them — and the recommended response." },
    { key: "trap_questions",        title: "Trap Questions to Ask", description: "Discovery questions that expose this competitor's weaknesses or surface our strengths." },
    { key: "do_not_say",            title: "What NOT to Say",       description: "Claims we should avoid making about this competitor — accuracy + legal + tonal reasons." },
  ],
};

/* ─── Market Prominence Report ────────────────────────────────── */
const MARKET_PROMINENCE: TemplateSpec = {
  id: "market_prominence",
  label: "Market Prominence Report",
  description:
    "Where the brand stands in market visibility — share of search, share of voice, content surface area vs competitors. Honest assessment with directional ratings if hard data is thin.",
  category: "competitive",
  required_categories: ["identity", "competitor"],
  optional_categories: ["analytics", "backlinks", "content"],
  useful_doc_types: ["semrush_export", "ahrefs_export", "gsc_export", "press_coverage"],
  default_audience_role: "client_executive",
  verification_strictness: "investor_grade",
  voice_hint: "Quantitative where data exists, directional where it doesn't. Always flag the difference.",
  sections: [
    { key: "executive_takeaway",    title: "Executive Takeaway",    description: "Two-sentence summary of market prominence position and trajectory." },
    { key: "visibility_metrics",    title: "Visibility Metrics",    description: "Specific numbers — keywords ranking, organic traffic, backlinks. Compare to competitors where data allows. Flag confidence of each number." },
    { key: "share_of_voice",        title: "Share of Voice",        description: "Estimated SOV vs named competitors. If estimating directionally, say so explicitly." },
    { key: "content_surface_area",  title: "Content Surface Area",  description: "Where the brand shows up — own site, third-party mentions, press, social. Compare against competitors." },
    { key: "gap_analysis",          title: "Prominence Gaps",       description: "Specific gaps where competitors out-show us. Quantify gap size where possible." },
    { key: "recommended_actions",   title: "Recommended Prominence Plays", description: "3-5 actions to close gaps, each tied to a specific evidence-based opportunity." },
  ],
};

/* ─── Content Gap Action Plan ─────────────────────────────────── */
const CONTENT_GAP_PLAN: TemplateSpec = {
  id: "content_gap_plan",
  label: "Content Gap Action Plan",
  description:
    "What competitors rank for that we don't, what topics our audience needs that we haven't covered, and the prioritized list of what to write next. Tactical, ready to brief writers from.",
  category: "competitive",
  required_categories: ["competitor", "content"],
  optional_categories: ["audience", "goal", "analytics"],
  useful_doc_types: ["semrush_export", "ahrefs_export", "screaming_frog", "persona_research"],
  default_audience_role: "team_creative",
  verification_strictness: "standard",
  voice_hint: "Action-ready, prioritized, brief-able. A writer should be able to pick a topic from this and start outlining.",
  sections: [
    { key: "audience_unmet_needs",  title: "Audience Needs We Haven't Met", description: "Topics our audience clearly cares about but we haven't covered. Cite the evidence." },
    { key: "competitor_gaps",       title: "Competitor Topic Gaps",         description: "Topics competitors rank for and we don't. List with traffic potential where data exists." },
    { key: "low_hanging_fruit",     title: "Low-Hanging Fruit",             description: "Topics where we're close (page 2-3) and could push to page 1 with focused effort." },
    { key: "topic_priority_list",   title: "Prioritized Topic List",        description: "Ranked list of 8-12 topics with: title angle, target keyword(s), persona served, expected effort, why it's prioritized." },
    { key: "structural_recommendations", title: "Structural Recommendations", description: "Beyond individual topics — content hub structures, pillar pages, internal linking opportunities." },
  ],
};

/* ─── Opportunity Verdict ─────────────────────────────────────── */
const OPPORTUNITY_VERDICT: TemplateSpec = {
  id: "opportunity_verdict",
  label: "Opportunity Verdict",
  description:
    "The biggest unblocked opportunity for this project right now, with a concrete path. Forward-looking strategic verdict — what to do, why now, what it'd take.",
  category: "forward_looking",
  required_categories: ["goal", "identity"],
  optional_categories: ["audience", "competitor", "content", "history", "analytics"],
  useful_doc_types: ["strategy_deck", "audit_report", "market_research", "persona_research"],
  default_audience_role: "client_executive",
  verification_strictness: "investor_grade",
  voice_hint: "Decisive, evidence-led, honest about uncertainty. A senior strategist's verdict, not a brainstorm.",
  sections: [
    { key: "the_opportunity",       title: "The Opportunity",       description: "One paragraph: what the opportunity is and why it matters." },
    { key: "why_now",               title: "Why Now",               description: "What in the current state makes this the right moment vs 6 months ago or 6 months from now. Cite evidence." },
    { key: "the_path",              title: "The Path",              description: "Concrete 3-6 step plan to capture the opportunity. Each step actionable." },
    { key: "what_it_takes",         title: "What It Takes",         description: "Resources, time, decisions required. Be specific." },
    { key: "what_could_go_wrong",   title: "What Could Go Wrong",   description: "Honest risk assessment. 3-5 specific failure modes and mitigations." },
    { key: "what_would_invalidate", title: "What Would Invalidate This Verdict", description: "Specific assumptions this verdict depends on. If any change, the verdict should be revisited." },
  ],
};

/* ─── Master template registry ────────────────────────────────── */

export const TEMPLATES: TemplateSpec[] = [
  BRAND_STATEMENT,
  POSITIONING_MEMO,
  AUDIENCE_PERSONA,
  CONTENT_STYLE_GUIDE,
  EXECUTIVE_SUMMARY,
  QBR,
  COMPETITOR_BATTLECARD,
  MARKET_PROMINENCE,
  CONTENT_GAP_PLAN,
  OPPORTUNITY_VERDICT,
];

export function getTemplate(id: string): TemplateSpec | null {
  return TEMPLATES.find((t) => t.id === id) || null;
}

/* Public template catalog for the frontend — strips internal config */
export function publicTemplateCatalog() {
  return TEMPLATES.map((t) => ({
    id:                    t.id,
    label:                 t.label,
    description:           t.description,
    category:              t.category,
    required_categories:   t.required_categories,
    optional_categories:   t.optional_categories,
    useful_doc_types:      t.useful_doc_types,
    default_audience_role: t.default_audience_role,
    verification_strictness: t.verification_strictness,
    section_count:         t.sections.length,
    section_outline:       t.sections.map((s) => ({ key: s.key, title: s.title, description: s.description })),
  }));
}
