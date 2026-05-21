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
  /* Phase 1E — emit a :::cover-page{} directive at the top of the
     rendered output. Default true for investor_grade templates,
     false otherwise. Explicitly set this to override. */
  cover_page?:           boolean;
  /* Phase 1E — strong directive guidance for this template. When
     "encouraged", the AI is told to use kpi/chart/callout liberally
     where appropriate. "minimal" tells it to mostly use prose with
     only sparing directive use. Default "encouraged" for performance
     and forward_looking categories, "balanced" otherwise. */
  directive_style?:      "encouraged" | "balanced" | "minimal";
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

/* ─── Performance Prediction Memo ─────────────────────────────── */
const PERFORMANCE_PREDICTION: TemplateSpec = {
  id: "performance_prediction",
  label: "Performance Prediction Memo",
  description:
    "Forward-looking: based on current signals, here's what we expect over the next 30 / 60 / 90 days. Every prediction carries explicit confidence and the assumptions it depends on. Investor-grade rigor — predictions you can defend.",
  category: "forward_looking",
  required_categories: ["goal", "analytics"],
  optional_categories: ["identity", "audience", "history", "technical", "competitor", "content"],
  useful_doc_types: ["gsc_export", "ga4_export", "ahrefs_export", "semrush_export", "audit_report", "internal_memo"],
  default_audience_role: "client_executive",
  verification_strictness: "investor_grade",
  voice_hint: "Confident where evidence supports it, explicit about uncertainty where it doesn't. A prediction the writer would stake their reputation on.",
  sections: [
    { key: "executive_takeaway",     title: "Executive Takeaway",     description: "Two sentences: where this project is heading over the next 90 days, and with what confidence. The 'if you only read one line' summary." },
    { key: "current_trajectory",     title: "Current Trajectory",     description: "Where we are now, with specific numbers cited from GSC/GA4/Ahrefs data. Direction of travel over the trailing 90 days." },
    { key: "30_day_prediction",      title: "Next 30 Days",            description: "Specific predictions for the next 30 days. Each prediction must have a confidence level and the evidence backing it." },
    { key: "60_day_prediction",      title: "30-60 Days Out",          description: "Predictions for the 30-60 day window. Less certain than 30-day; flag the increased uncertainty." },
    { key: "90_day_prediction",      title: "60-90 Days Out",          description: "Predictions for the 60-90 day window. The widest uncertainty band; describe directionally where specific numbers can't be supported." },
    { key: "assumptions_baked_in",   title: "Assumptions This Depends On",  description: "EXPLICIT list of assumptions: 'Predictions assume (a) Google does not deploy a major algorithm update in this window, (b) the migration completes by date X, (c) competitor Y does not launch their announced product...' Every prediction depends on these." },
    { key: "what_would_invalidate",  title: "What Would Invalidate This",   description: "Specific events or signals that would force us to revise the predictions. Be concrete — 'if X happens by Y date, we revisit.'" },
    { key: "confidence_calibration", title: "Confidence Calibration",       description: "Honest assessment per prediction: how confident we are, why, and what would shift the confidence up or down. Investor reader needs to know the strength of each claim." },
  ],
};

/* ─── Recovery Plan ───────────────────────────────────────────── */
const RECOVERY_PLAN: TemplateSpec = {
  id: "recovery_plan",
  label: "Recovery Plan",
  description:
    "Structured turnaround document for post-penalty, post-migration, post-redesign, or post-incident situations. Honest situation assessment, root-cause analysis, phased recovery path with timelines and success metrics.",
  category: "performance",
  required_categories: ["history", "technical"],
  optional_categories: ["goal", "audience", "content", "analytics", "identity"],
  useful_doc_types: ["audit_report", "screaming_frog", "gsc_export", "internal_memo", "strategy_deck"],
  default_audience_role: "client_executive",
  verification_strictness: "standard",
  voice_hint: "Honest about the problem, structured about the solution, action-oriented. No sugarcoating, no panic. Senior consultant briefing the C-suite through a difficult moment.",
  sections: [
    { key: "situation_assessment",   title: "Where We Stand",         description: "Honest description of the current state — what happened, current scale of impact (cite specific numbers from history + analytics data), how long this has been the state." },
    { key: "root_cause_analysis",    title: "Root Cause",              description: "Evidence-led analysis of WHY this happened. Cite the specific signals — algorithm update timing, migration deltas, technical findings, content changes. If root cause is uncertain, say so." },
    { key: "recovery_phases",        title: "Three-Phase Recovery",   description: "Phase 1 (Stabilize, 0-30 days): stop the bleeding. Phase 2 (Rebuild, 30-90 days): foundational repair. Phase 3 (Grow, 90+ days): return to growth. Each phase with specific actions and intended outcomes." },
    { key: "immediate_priorities",   title: "Next 30 Days — Stabilize",description: "Concrete actions for the first 30 days. Each action with owner (PM / client / external), expected outcome, success indicator." },
    { key: "rebuilding_priorities",  title: "30-90 Days — Rebuild",   description: "Concrete actions for the rebuild phase. Each tied to a root cause we identified above." },
    { key: "what_we_need_from_you",  title: "What We Need From You",  description: "Specific asks of the client to execute the plan: budget approval, content sign-offs, technical access, internal decision-makers' time, escalation paths." },
    { key: "success_metrics",        title: "How We'll Know It's Working", description: "Specific metrics with target values + timeframes. Honest about lead times — SEO recovery is not 30 days. Calibrate expectations." },
    { key: "what_could_go_wrong",    title: "What Could Slow This Down",  description: "Realistic risks to the plan and mitigations. Honest about external factors we don't control." },
  ],
};

/* ─── Press Release Draft ─────────────────────────────────────── */
const PRESS_RELEASE: TemplateSpec = {
  id: "press_release",
  label: "Press Release Draft",
  description:
    "Newsroom-style draft ready for editorial review and distribution. Lead-with-the-angle structure, attributed quotes (marked as TO BE CONFIRMED if not directly sourced), boilerplate composed from identity data, and distribution notes for the comms team.",
  category: "strategic",
  required_categories: ["identity"],
  optional_categories: ["history", "competitor", "goal", "audience", "brand_narrative"],
  useful_doc_types: ["internal_memo", "strategy_deck", "case_study", "press_coverage"],
  default_audience_role: "press",
  verification_strictness: "standard",
  voice_hint: "Newsroom style. Lead with the angle. Short paragraphs. Quotable sentences. No hype — concrete claims with evidence behind them.",
  sections: [
    { key: "headline",                title: "Headline",                description: "8-12 words. Newsworthy. Specific. Active voice. Not 'Company announces' but the actual news (what changed)." },
    { key: "subhead",                 title: "Subhead",                 description: "One sentence below the headline. Reinforces the angle with the most important supporting detail." },
    { key: "lead_paragraph",          title: "Lead Paragraph",          description: "5W summary — who, what, when, where, why. Inverted-pyramid: most important fact first, supporting detail after. Under 60 words." },
    { key: "supporting_paragraph_1",  title: "Supporting Paragraph 1",  description: "Concrete details that support the lead. Specific numbers, names, dates — only if cited in source material. No fluff." },
    { key: "executive_quote",         title: "Quote — Leadership",      description: "Attributed quote from a leader at the company. Mark as '[TO BE CONFIRMED BY <ROLE>]' — do NOT fabricate exact wording. Provide 2-3 quotable sentence options the spokesperson can pick from." },
    { key: "supporting_paragraph_2",  title: "Supporting Paragraph 2",  description: "Context, competitive landscape framing, or customer impact angle. Concrete." },
    { key: "customer_or_partner_quote", title: "Quote — Customer / Partner (Optional)", description: "If the source material supports it, include an attributed quote from a customer or partner. Mark as '[TO BE CONFIRMED]'. If no source supports such a quote, write 'No customer quote sourced — request from client if desired.'" },
    { key: "boilerplate",             title: "About <Company> — Boilerplate", description: "Standard 'About' paragraph composed from identity fields: primary offering, target market, year founded, lifecycle stage. Concrete, no marketing fluff." },
    { key: "press_contact",           title: "Press Contact",           description: "Template fields: '[Name], [Title], [Email], [Phone].' Mark all as [TO BE FILLED IN] — never fabricate contact information." },
    { key: "distribution_notes",      title: "Distribution Notes (Internal)", description: "Brief notes for the comms team: suggested distribution channels (trade press / general business / tech / vertical), embargo timing recommendation, story angle pitches per outlet type. Internal use — not part of the actual release." },
  ],
};

/* ─── Case Study ──────────────────────────────────────────────── */
const CASE_STUDY: TemplateSpec = {
  id: "case_study",
  label: "Case Study",
  description:
    "Customer success story in publishable form. Narrative arc: customer + challenge + journey + results + lesson. Customer-centered (their words where possible), evidence-led (cite specific outcomes), publishable on the client's marketing site.",
  category: "strategic",
  required_categories: ["identity", "audience"],
  optional_categories: ["history", "competitor", "content", "analytics"],
  useful_doc_types: ["customer_feedback", "case_study", "sales_call_notes", "internal_memo"],
  default_audience_role: "client_marketing",
  verification_strictness: "standard",
  voice_hint: "Narrative, customer-centered, evidence-led. The customer is the hero. Avoid marketing-speak — concrete details outperform adjectives. Quotes must be attributed or marked as needing confirmation.",
  sections: [
    { key: "hero_line",              title: "Hero Line",                description: "One sentence headline result. The single most compelling outcome, stated concretely. 'X achieved Y in Z time' or 'How X solved Y.'" },
    { key: "customer_overview",      title: "About the Customer",       description: "1 paragraph: who they are, what they do, why this case study matters. Concrete — industry, scale indicator, audience served." },
    { key: "the_challenge",          title: "The Challenge",            description: "1-2 paragraphs: the problem the customer came in with. Specific, not generic. Use their language patterns from the source material where possible." },
    { key: "the_journey",            title: "The Journey",              description: "2-3 paragraphs in narrative form (NOT bullet-point dump). What was done, in what order, with what reasoning. The reader should understand the thought process — this is what makes a case study compelling vs a glorified feature list." },
    { key: "the_results",            title: "The Results",              description: "Specific outcomes. Cite numbers ONLY if they appear in source material. If a number is implied but not stated, describe directionally and flag it. NEVER fabricate metrics for case studies — this is publishable content; fabricated metrics are existential reputation risk." },
    { key: "customer_quote",         title: "Customer Quote",           description: "Attributed quote from the customer. Mark as '[TO BE CONFIRMED — exact wording requires customer review]' if no direct quote is in source material. Provide 2-3 quotable options drawn from the customer's own language patterns in the source." },
    { key: "why_this_matters",       title: "Why This Matters",         description: "1 paragraph: the broader lesson. What other companies in similar positions can take from this story. NOT 'and that's why our product is great' — the lesson is about the customer's industry / situation / approach." },
    { key: "what_made_it_work",      title: "What Made It Work",        description: "3-5 bullet points: the specific factors that drove the outcome. Useful for prospects to recognize their own situation. Honest — include factors specific to this customer that wouldn't apply universally." },
  ],
};

/* ─── Sales Battlecard ────────────────────────────────────────── */
const SALES_BATTLECARD: TemplateSpec = {
  id: "sales_battlecard",
  label: "Sales Battlecard",
  description:
    "Tactical asset for the sales team. Persona profile + value prop + proof points + objection handling + traps to avoid. Designed for a salesperson to read 5 minutes before a call and walk in confident.",
  category: "competitive",
  required_categories: ["identity", "audience"],
  optional_categories: ["competitor", "content", "history", "commercial", "analytics"],
  useful_doc_types: ["sales_call_notes", "persona_research", "customer_feedback", "case_study", "strategy_deck"],
  default_audience_role: "sales_team",
  verification_strictness: "standard",
  voice_hint: "Tactical, specific, action-ready. Bullet-friendly. A salesperson 5 minutes before a call should walk in with concrete things to say and concrete things to avoid. No theory — operational guidance only.",
  sections: [
    { key: "target_persona",            title: "Target Persona",                description: "Compact persona profile: role, motivations, what they care about most, who else gets involved in the decision. Brief — salesperson already knows their patch, this is calibration." },
    { key: "pain_points_to_probe",      title: "Pain Points to Probe",          description: "3-5 specific discovery questions designed to surface pain. Each tied to a pain the persona likely has based on the audience research and sales call notes." },
    { key: "our_value_proposition",     title: "Our Value Prop — Calibrated for This Persona", description: "How we position our offering specifically for this persona. Not generic — the part of our story that matters MOST to their role and their stage." },
    { key: "proof_points",              title: "Proof Points to Reach For",     description: "Specific evidence: customer wins, metrics, certifications, partnerships, awards. Each proof point with a one-line context for when to deploy it ('use when prospect is concerned about scale / risk / fit')." },
    { key: "common_objections",         title: "Top 5 Objections + Responses",  description: "The 5 most common objections from this persona based on sales notes and audience research. Each with a recommended response framing (not a script — a directional response that the salesperson adapts)." },
    { key: "traps_to_avoid",            title: "Traps to Avoid",                description: "What NOT to say. Claims we shouldn't make (accuracy / legal / tonal reasons). Topics that go badly with this persona. Comparison language to avoid. Be specific." },
    { key: "next_step_to_drive",        title: "Drive Them to This Next Step",  description: "The single action this call should produce — demo, technical review, trial signup, executive intro. Calibrated to the persona and the deal stage. Don't try to close in one call." },
    { key: "useful_questions_to_close", title: "Closing Questions",             description: "2-3 questions that surface the prospect's buying intent + remaining concerns. 'What would have to be true for you to move forward?' patterns." },
  ],
};

/* ─── Investor One-Pager ──────────────────────────────────────── */
const INVESTOR_ONE_PAGER: TemplateSpec = {
  id: "investor_one_pager",
  label: "Investor One-Pager",
  description:
    "The single-page distillation of the investment case. Designed for first-look investor outreach — a partner should be able to read it in 90 seconds and know whether to take the meeting. Every claim sourced, every number defensible.",
  category: "strategic",
  required_categories: ["identity", "audience", "goal"],
  optional_categories: ["commercial", "competitor", "brand_narrative"],
  useful_doc_types: ["strategy_deck", "internal_memo", "press_coverage"],
  default_audience_role: "investor",
  verification_strictness: "investor_grade",
  voice_hint: "Precise. Defensible. Every sentence earns its space. No hype words ('revolutionary', 'world-class'). No padding. The reader is a partner at a top-tier fund with 200 unread one-pagers in their inbox — yours needs to be the one they finish.",
  sections: [
    { key: "the_company",             title: "The Company",              description: "Sentence 1: what the company does + who for. Sentence 2: lifecycle stage + ask (raising X to do Y). No more. Concrete." },
    { key: "the_problem",             title: "The Problem",              description: "1-2 sentences: the specific market problem this business addresses. Cite a problem-size data point if available (traction:* or market_intel:*). NOT 'the industry is broken' — the SPECIFIC problem." },
    { key: "the_solution",            title: "The Solution",             description: "1-2 sentences: how the company solves it. Concrete — not 'AI-powered platform' but the actual mechanism." },
    { key: "the_market",              title: "Market Size",              description: "TAM/SAM with sources. Format: 'TAM $X.XB (Source: <name>, <year>). SAM $X.XB based on <methodology>.' If no cited market intel exists, write '[Market sizing requires market_intel:* entries before publication]' — do not fabricate." },
    { key: "the_traction",            title: "Traction",                 description: "3-5 specific dated proof points from traction_proof_points. Format: 'Metric X grew from A to B between dates C and D (Source: type).' If proof points are thin, say so directly — investors trust honesty more than overclaiming." },
    { key: "why_now",                 title: "Why Now",                  description: "1-2 sentences: what changed in the market that makes this moment correct. Tie to a specific external signal (regulatory shift, technological inflection, demographic change). Cited where possible." },
    { key: "the_team",                title: "Why This Team",            description: "1-2 sentences on team strength. Concrete relevant background only — not adjectives. If team field data is thin, write '[Team section needs founder/leadership context — populate identity.headcount and any team-specific Data Room fields]'." },
    { key: "the_ask",                 title: "The Ask",                  description: "1-2 sentences: amount raising, use of funds, intended milestones. Direct — investors prefer 'raising $4M to extend runway 18 months and reach $X ARR' to vague framing." },
  ],
};

/* ─── Pitch Deck Outline ──────────────────────────────────────── */
const PITCH_DECK_OUTLINE: TemplateSpec = {
  id: "pitch_deck_outline",
  label: "Pitch Deck Outline",
  description:
    "Slide-by-slide outline for an investor pitch deck. Each slide includes: headline, key visual concept, key talking points, and speaker notes. Designed for a founder to walk into a pitch and remember exactly what each slide proves.",
  category: "strategic",
  required_categories: ["identity", "audience", "goal"],
  optional_categories: ["commercial", "competitor", "brand_narrative", "history"],
  useful_doc_types: ["strategy_deck", "internal_memo", "market_research", "case_study"],
  default_audience_role: "investor",
  verification_strictness: "investor_grade",
  voice_hint: "Confident, evidence-grounded, calibrated for live presentation. Each slide's job is clear. Speaker notes guide what the founder SAYS, not what they read off the slide.",
  sections: [
    { key: "slide_1_title",           title: "Slide 1 — Title & Vision",  description: "Company name. One-line vision statement. Founder name + role. Date. Speaker notes: opening hook the founder uses to set tone — should reference the moment / market shift / specific customer pain that makes this company necessary." },
    { key: "slide_2_problem",         title: "Slide 2 — The Problem",     description: "Headline (problem stated as a question or assertion). Visual concept: a chart or photo showing the problem's scale or human cost. Talking points: 3 specific manifestations of the problem. Speaker notes: how to bridge from problem framing to 'and that's why we built X.'" },
    { key: "slide_3_solution",        title: "Slide 3 — The Solution",    description: "Headline (the solution stated as a one-line product description). Visual concept: product screenshot or workflow diagram. Talking points: 3 mechanism-level points about how it works. Speaker notes: the demo / story moment to land emotionally." },
    { key: "slide_4_market",          title: "Slide 4 — Market",          description: "Headline (the market opportunity quantified). Visual concept: TAM/SAM/SOM diagram. Talking points: cited market data from market_intel:* entries. Speaker notes: how to handle the 'how did you calculate that?' question — methodology should be one sentence." },
    { key: "slide_5_traction",        title: "Slide 5 — Traction",        description: "Headline (one-line top-of-mind traction stat). Visual concept: growth chart with the metric on the y-axis. Talking points: 3-4 specific traction proof points from traction_proof_points:*. Speaker notes: how to handle the 'is this real?' question — anchor to dated sources." },
    { key: "slide_6_business_model",  title: "Slide 6 — Business Model",  description: "Headline (pricing model in one phrase). Visual concept: unit economics or revenue flow diagram. Talking points: pricing structure, unit economics, current revenue if any. Speaker notes: how to handle margin questions." },
    { key: "slide_7_competition",     title: "Slide 7 — Competition",     description: "Headline (one-line positioning vs. competitors). Visual concept: 2x2 matrix or competitive map. Talking points: who else is in the space, where we win, where we don't. Speaker notes: honest acknowledgment of competitive strengths — investors verify this independently anyway." },
    { key: "slide_8_team",            title: "Slide 8 — Team",            description: "Headline. Visual: team photos + roles. Talking points: relevant background per key person. Speaker notes: how to convey the team's specific edge — not 'we're great' but 'we worked together at X where we shipped Y.'" },
    { key: "slide_9_ask",             title: "Slide 9 — The Ask",         description: "Headline (amount + use of funds). Visual: milestone chart. Talking points: specific milestones the raise will unlock, runway implications. Speaker notes: how to handle the 'why this amount and not 2x?' question." },
    { key: "slide_10_close",          title: "Slide 10 — Close & Q&A",    description: "Headline (the vision restated as a closing line). Visual: company logo + contact. Talking points: the single sentence the founder wants the room remembering. Speaker notes: the bridge into Q&A, AND the prepared answers for the 3 hardest questions this deck will get." },
  ],
};

/* ─── Market Opportunity Memo ─────────────────────────────────── */
const MARKET_OPPORTUNITY: TemplateSpec = {
  id: "market_opportunity",
  label: "Market Opportunity Memo",
  description:
    "Deep-dive investor memo on the market opportunity. Used in Series-B and later contexts where market sizing is scrutinized. Every figure cited with source URL and methodology. Honest about TAM-shaving assumptions.",
  category: "strategic",
  required_categories: ["identity", "audience"],
  optional_categories: ["competitor", "goal", "commercial"],
  useful_doc_types: ["market_research", "strategy_deck", "press_coverage", "internal_memo"],
  default_audience_role: "investor",
  verification_strictness: "investor_grade",
  voice_hint: "Analyst-grade. Every number sourced. Every methodology stated. No hand-waving. The reader is a fund's research associate who will check every citation — write to that standard.",
  sections: [
    { key: "market_thesis",           title: "Market Thesis",             description: "2-3 sentence statement of the market opportunity in plain language. What's happening in the market that creates the opening." },
    { key: "tam_analysis",            title: "TAM — Total Addressable Market", description: "TAM figure with full source. Format: '$X.XB (Source: <name>, year). Methodology: <bottom-up or top-down>.' Show the calculation if bottom-up. If only directional figure available, say so explicitly and describe the range." },
    { key: "sam_analysis",            title: "SAM — Serviceable Addressable Market", description: "SAM figure with explicit shaving from TAM. Format: 'From TAM of $X.XB, we exclude <Y> for reason <Z>, leaving SAM of $A.AB.' Make every exclusion defensible." },
    { key: "som_analysis",            title: "SOM — Serviceable Obtainable Market", description: "Realistic SOM over a stated time horizon (e.g. 'SOM over 5 years'). Methodology must be transparent — penetration rate × SAM, or comparable's actual penetration in similar markets." },
    { key: "growth_drivers",          title: "Market Growth Drivers",      description: "3-5 specific forces driving market growth. Each tied to a cited data point — regulatory change, technology shift, demographic trend. Industry growth rate stated with source." },
    { key: "market_segmentation",     title: "Market Segmentation",        description: "How the market splits — by geography, customer size, vertical, use case. Which segments we target and why. Cited where possible." },
    { key: "tailwinds_headwinds",     title: "Tailwinds & Headwinds",      description: "Honest list. Tailwinds: external forces helping the market. Headwinds: external forces that could slow or shrink it. Failing to mention obvious headwinds is the fastest way to lose investor trust." },
    { key: "expansion_optionality",   title: "Expansion Optionality",      description: "Adjacent markets the company could expand into. Each with directional sizing. Frame as optionality (potential), not certainty." },
    { key: "key_uncertainties",       title: "Key Uncertainties",          description: "Honest list of what we don't know about the market. The questions an investor's diligence will probe — better to surface them ourselves with our best current view." },
    { key: "sources_appendix",        title: "Sources & Methodology",      description: "List of every cited source with URL, publication date, and source type. Plus any explicit assumptions baked into our SAM/SOM math. Investors check this — make it bulletproof." },
  ],
};

/* ─── Traction Memo ────────────────────────────────────────────── */
const TRACTION_MEMO: TemplateSpec = {
  id: "traction_memo",
  label: "Traction Memo",
  description:
    "Quarterly investor update memo focused on traction. Dated, sourced proof points across revenue/customers/engagement. Honest about what missed, what surprised. Designed for existing investors expecting transparent quarterly reporting.",
  category: "performance",
  required_categories: ["identity", "goal"],
  optional_categories: ["audience", "commercial", "history", "analytics"],
  useful_doc_types: ["internal_memo", "strategy_deck", "case_study", "ga4_export", "gsc_export"],
  default_audience_role: "investor",
  verification_strictness: "investor_grade",
  voice_hint: "Operator-to-investor. Direct. Owned outcomes (good and bad). The kind of memo an existing investor wants to receive — no marketing spin, no defensiveness, just facts plus what the team learned. Builds trust over time.",
  sections: [
    { key: "headline",                title: "Headline",                  description: "One sentence: the quarter in one line. Where the business is and how confident we are about the trajectory. Lead with the verdict." },
    { key: "key_metrics_dashboard",   title: "Key Metrics",                description: "Compact table-format readout of top metrics. For each: current value, period covered, prior-period value, change. Cite traction_proof_points:* and analytics fields. Where a number is internally reported (no third-party verification), tag as [self-reported]." },
    { key: "what_went_well",          title: "What Went Well",             description: "Specific wins with dated proof points. Each win names the underlying cause where known — 'X grew because we shipped Y in week Z and Z increased adoption' — not 'X grew thanks to our team's hard work.'" },
    { key: "what_missed",             title: "What Missed",                description: "Honest list of misses. What didn't hit plan and by how much. Hypothesized causes. Investors trust founders who acknowledge misses; they distrust founders whose updates are all wins." },
    { key: "surprises",               title: "Surprises (Positive & Negative)", description: "Things that happened we didn't expect. Customer behavior, market shifts, competitor moves. The 'surprises' section is one of the most signal-rich for sophisticated investors — they know operators learn from anomalies." },
    { key: "key_decisions",           title: "Key Decisions This Quarter", description: "Strategic decisions taken this quarter, with the reasoning. 'We chose to focus on X audience over Y because of evidence Z.' Helps investors see how thinking is evolving." },
    { key: "next_quarter_plan",       title: "Next Quarter — Specific Goals", description: "Specific goals with target values + deadlines + how we'll measure. Avoid vague language. 'We aim to grow ARR' is worthless; 'We aim to grow ARR from $X to $Y by date Z, with X added through channel A' is operator-grade." },
    { key: "asks",                    title: "Asks of Investors",          description: "Specific introductions, advice, or actions we'd value from the investor reader. Lists by name where possible. Sophisticated investors EXPECT specific asks — vague 'let us know if you can help' suggests the founder isn't operating with clarity about what they need." },
    { key: "appendix_sources",        title: "Sources",                    description: "All cited proof points with source name and date. For internally-reported metrics, the system of record. Maintains the audit trail an investor expects." },
  ],
};

/* ─── Competitive Moat Memo ────────────────────────────────────── */
const COMPETITIVE_MOAT: TemplateSpec = {
  id: "competitive_moat",
  label: "Competitive Moat Memo",
  description:
    "Diligence-stage investor memo on competitive defensibility. Honest landscape map. Defensible moat thesis grounded in specific evidence. Acknowledges competitor strengths because investors will find them anyway.",
  category: "competitive",
  required_categories: ["identity", "competitor"],
  optional_categories: ["audience", "history", "content", "commercial"],
  useful_doc_types: ["strategy_deck", "market_research", "press_coverage", "competitor_battlecard"],
  default_audience_role: "investor",
  verification_strictness: "investor_grade",
  voice_hint: "Analytical. Self-aware. Acknowledging competitor strength is a sign of strategic maturity — pretending competitors don't exist is the fastest way to lose investor trust during diligence.",
  sections: [
    { key: "landscape_map",           title: "Competitive Landscape",      description: "Honest map of the competitive space. Direct competitors, adjacent competitors, substitute solutions. Each with one-sentence positioning. Use market_intel:* for any competitor figures cited." },
    { key: "competitor_strengths",    title: "What Competitors Do Well",   description: "For each major competitor: what they're genuinely strong at. Pretending they have no strengths is the fastest credibility leak in a diligence memo. Investors verify this independently." },
    { key: "where_we_differ",         title: "Where We're Different",      description: "Specific differentiators backed by Data Room evidence. Not 'we're better' — what's structurally different about the company. Tech, audience, business model, distribution, pricing." },
    { key: "moat_thesis",             title: "The Moat Thesis",            description: "The argument for why this differentiation compounds over time. Specific mechanism: network effects, data flywheel, switching costs, regulatory moat, brand, scale economics. State which moat type(s) apply and the evidence." },
    { key: "moat_evidence",           title: "Moat Evidence",              description: "Specific data points supporting the moat thesis. Customer retention rates, organic growth signals, switching cost behaviors, data scale advantages. Each cited to traction_proof_points:* or analytics fields." },
    { key: "what_could_erode_it",     title: "What Could Erode the Moat",  description: "Honest assessment of moat fragility. What competitive moves or market changes would weaken the position. A moat that the founder can't articulate erosion paths for is usually not a moat — it's wishful thinking." },
    { key: "how_we_widen_it",         title: "How We Widen the Moat",      description: "Concrete actions the company is taking to strengthen the moat. Each tied to a specific investment or operational priority." },
    { key: "competitive_response_plan", title: "Response Plan for Competitive Threats", description: "If specific competitor X makes specific move Y, our planned response is Z. The presence of a written plan signals operational maturity to investors." },
  ],
};

/* ─── Master template registry ────────────────────────────────── */

export const TEMPLATES: TemplateSpec[] = [
  /* H.2 — original 10 strategic templates */
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
  /* H.2.1 — 5 additional strategic templates */
  PERFORMANCE_PREDICTION,
  RECOVERY_PLAN,
  PRESS_RELEASE,
  CASE_STUDY,
  SALES_BATTLECARD,
  /* H.3 — 5 investor-grade templates */
  INVESTOR_ONE_PAGER,
  PITCH_DECK_OUTLINE,
  MARKET_OPPORTUNITY,
  TRACTION_MEMO,
  COMPETITIVE_MOAT,
];

export function getTemplate(id: string): TemplateSpec | null {
  return TEMPLATES.find((t) => t.id === id) || null;
}

/* ─── Phase 1E helpers ────────────────────────────────────────── */

/** Whether a template should auto-prepend a :::cover-page{} block.
 *  Default: investor_grade → true, otherwise → false. PM can override
 *  via the template's `cover_page` field. */
export function templateHasCoverPage(t: TemplateSpec): boolean {
  if (typeof t.cover_page === 'boolean') return t.cover_page;
  return t.verification_strictness === "investor_grade";
}

/** How aggressively the AI should use formatting directives.
 *  Default rule:
 *  - "encouraged" for performance + forward_looking templates
 *    (QBR, Performance Prediction, Recovery Plan, Investor docs, etc.)
 *  - "minimal" for strategic narrative templates (Brand Statement,
 *    Press Release, Case Study — these are mostly prose).
 *  - "balanced" for everything else.
 */
export function templateDirectiveStyle(t: TemplateSpec): "encouraged" | "balanced" | "minimal" {
  if (t.directive_style) return t.directive_style;
  if (t.category === "performance" || t.category === "forward_looking") return "encouraged";
  if (t.id === "brand_statement" || t.id === "press_release" || t.id === "case_study") return "minimal";
  return "balanced";
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
