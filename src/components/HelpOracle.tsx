/**
 * HelpOracle — The knowledge companion for SEO Season
 *
 * Features:
 * - Floating ◈ icon on every page (bottom-left, unobtrusive)
 * - Right-click anywhere → "Help with this" context menu
 * - Activity monitor → friendly floating bubble suggestions
 * - Full-screen Hollywood-style help panel
 * - Manav Brain integration for on-demand answers
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  HelpCircle, X, ChevronRight, Zap, Brain, Globe,
  Database, BarChart3, Layers, Cpu, BookOpen, Command,
  Search, Sparkles, ChevronDown, Rocket,
} from 'lucide-react';

/* ─── Help knowledge base ─── */
const PAGES: Record<string, {
  title: string; icon: any; tagline: string;
  sections: { title: string; icon: string; items: string[] }[];
  tips: string[];
  brainPrompt: string;
}> = {
  '/dashboard': {
    title: 'Dashboard', icon: BarChart3,
    tagline: 'Your project\'s health at a glance. Four scores that tell the real SEO story.',
    sections: [
      { title: 'What the scores mean', icon: '📊', items: [
        'LLM Score: Are AI engines (Perplexity, ChatGPT, Google AI) citing your content? 20/100 means invisible to AI — fix this first.',
        'Algorithm Health: How aligned your site is with current Google ranking signals. Below 70 = ranking suppression risk.',
        'E-E-A-T: Experience, Expertise, Authoritativeness, Trustworthiness. Google\'s trust framework. Impacts all content pages.',
        'Authority: Domain authority + backlink quality. Moves slowly — requires deliberate link building or PR strategy.',
      ]},
      { title: 'How to improve scores', icon: '⚡', items: [
        'LLM Score → Open Playground → Run GEO cards. Rewrite intros with FAQ schema. Target Perplexity citations.',
        'Algorithm Health → Run an SEO Audit. Execute technical quick-win cards first.',
        'E-E-A-T → Add author bios, case studies, certifications. Schema markup for all content.',
        'Authority → Execute competitive gap cards. Build topical clusters before pursuing backlinks.',
      ]},
      { title: 'When scores update', icon: '🔧', items: [
        'Scores update when you run a new audit from the Audit page.',
        'You can also manually update metrics in Data Room → Analytics section.',
        'LLM Score requires a GEO-specific check — standard audits don\'t measure AI visibility.',
        'Check weekly for fast-moving projects, monthly for established sites.',
      ]},
    ],
    tips: [
      'Your LLM score of 20/100 is critical — 3 GEO cards can move it to 60+ within 30 days.',
      'Run Brain → "analyse my scores and tell me what to fix first"',
      'Dashboard scores update after Audit runs — no data = no scores.',
    ],
    brainPrompt: 'Look at my current dashboard scores and tell me exactly what to prioritise this week to improve them. Be specific about which page or action moves each score.',
  },
  '/playground': {
    title: 'Strategy Canvas', icon: Layers,
    tagline: 'Your SEO execution plan. Brain reads every card to give smarter recommendations.',
    sections: [
      { title: 'How cards work', icon: '🎯', items: [
        'Cards represent SEO tasks. Each card has a type (technical, content, GEO, quick-win, competitive).',
        'Drag cards to week 1–4 to schedule. Week 5 = backlog.',
        'Execute a card: click it → Execute with AI → Brain generates the deliverable using your Data Room.',
        'Status flow: todo → doing → done → verified. Only verified cards count as complete.',
      ]},
      { title: 'Getting good outputs', icon: '🧠', items: [
        'Fill Data Room first — Brain uses your actual numbers, CMS, competitors.',
        'Role selector changes the output format — Content Writer gets drafts, Executive gets strategic summaries.',
        'Provide 3+ inputs when prompted (keyword, target URL, brand voice) — more context = sharper output.',
        'Submit for Verification after done — Brain checks if it actually worked.',
      ]},
      { title: 'Quick wins', icon: '⚡', items: [
        'Start with quick-win cards — they move metrics fastest and build momentum.',
        'Run Brain → "what are the 3 highest-impact cards I can execute today"',
        'Technical cards produce ready-to-deploy code. Content cards produce full drafts.',
        'Use Brain Command to run up to 4 cards in parallel — see Brain Command page.',
      ]},
    ],
    tips: [
      '61 cards, 0 completed → start with 1 quick-win this week.',
      'Tell Brain "generate a strategy canvas for [project]" to auto-create cards.',
      'Cards in Week 1 that aren\'t done after 7 days → Brain flags them as blockers.',
    ],
    brainPrompt: 'Look at my canvas and tell me: which 3 cards should I execute this week and in what order? Consider dependencies and quick wins.',
  },
  '/brain-learning': {
    title: 'Brain Learning', icon: Brain,
    tagline: 'Manav Brain\'s permanent memory. The more active learnings you have, the smarter every response becomes.',
    sections: [
      { title: 'Why learnings matter', icon: '🧠', items: [
        'Every active learning is injected into Brain\'s prompt before it answers. 50 learnings = dramatically sharper advice than 5.',
        'Learnings are project-specific — what worked for Alpha Software stays with Alpha Software.',
        'Brain references specific learnings by name when it uses them. You can see which ones it\'s applying.',
        'Applied count shows how many times Brain has used each learning — high count = high value.',
      ]},
      { title: 'Auto-approval guide', icon: '⚡', items: [
        'Technical findings, audit results, CWV data → Auto-approve. These are objective facts.',
        'Strategy, content approach, competitive positioning → Review before approving. Interpretive.',
        'Confidence ≥85 → Auto-approve. High confidence = Brain validated it against known data.',
        'CONTRADICTION badge → Two learnings conflict. Review both and keep the more recent/accurate one.',
      ]},
      { title: 'Building learning velocity', icon: '🎯', items: [
        'Tell Brain: "learn everything about [project]" — it generates and saves 8-10 structured learnings.',
        'Every task execution in Brain Command auto-generates a learning.',
        'DEEPEN WITH BRAIN: click on any pending learning to have Brain resolve its gaps before you approve.',
        'ALGO UPDATE badge: algorithm knowledge changed — this learning may be outdated. Re-enrich it.',
      ]},
    ],
    tips: [
      '0 active learnings = Brain gives generic advice. 20+ = project-specific intelligence.',
      'DEEPEN WITH BRAIN before approving shaky learnings — it raises confidence score.',
      'Delete learnings that are wrong — bad data is worse than no data.',
    ],
    brainPrompt: 'Look at my current brain learnings and tell me: which ones are most valuable, which should I delete, and what gaps are there in my learning base?',
  },
  '/brain-command': {
    title: 'Brain Command', icon: Command,
    tagline: 'Mission control for AI execution. Run up to 4 SEO tasks simultaneously.',
    sections: [
      { title: 'Running tasks', icon: '⚡', items: [
        '1. Select your project (top-right dropdown).',
        '2. Click canvas cards in the left panel to queue them.',
        '3. Hit RUN ALL — up to 4 execute in parallel with live streaming output.',
        '4. All outputs auto-save to Brain Desk after successful completion.',
      ]},
      { title: 'What makes good task output', icon: '🧠', items: [
        'Fill Data Room first — Brain uses your site URL, keywords, competitors, CMS in every task.',
        'Active learnings improve output quality — each relevant learning is injected into the task prompt.',
        'Technical cards output code, config, redirects. Content cards output full drafts. GEO cards output schema + rewritten content.',
        'Verify task outputs before deploying — Brain\'s output is a strong first draft, not final production.',
      ]},
      { title: 'Voice commands', icon: '🎯', items: [
        'The right panel Brain chat understands natural language — "run all quick-win cards" works.',
        '"What should I run first?" — Brain analyses your queue and gives a prioritised recommendation.',
        '"Save output from card X to the Data Room" — Brain can organise outputs for you.',
        'Voice input available — click the mic icon in the Brain chat panel.',
      ]},
    ],
    tips: [
      'Run Brain Command after adding learnings — Brain applies them to every task automatically.',
      'Failed tasks show in red with the server error — check Vercel logs for details.',
      'Outputs auto-save to Desk — check /desk after running to see all saved content.',
    ],
    brainPrompt: 'I want to run tasks in Brain Command. Which cards from my canvas should I run this session and what order? Tell me what to expect from each one.',
  },
  '/data-room': {
    title: 'Data Room', icon: Database,
    tagline: 'The knowledge base Brain reads for every single response. Empty Data Room = generic advice.',
    sections: [
      { title: 'Priority fill order', icon: '⚡', items: [
        '1st: Identity (5 mins) — who the client is, industry, business model, UVP. Without this every output is generic.',
        '2nd: Goals + Keywords (5 mins) — Brain needs a goal to give goal-oriented advice. Include anti-goals (things to NOT do).',
        '3rd: Audience — ICP and primary persona. Without these, content recommendations are guesswork.',
        '4th: Content & Editorial — brand voice, tone words, prohibited topics. These are HARD constraints for every AI output.',
        '5th: Analytics baseline (auto-fills if GSC + GA4 connected) — Brain needs numbers for ROI and impact claims.',
        '6th: Technical config — CMS, SEO plugin, Core Web Vitals. Brain gives platform-specific advice when it knows your stack.',
        '7th: Competitors (2 mins) — Enables competitive gap analysis and benchmarking.',
        '8th: Commercial + History — engagement terms, what worked/failed before. Stops the AI repeating mistakes and calibrates reports to the actual audience.',
      ]},
      { title: 'What each section unlocks', icon: '🧠', items: [
        'Identity → every output feels client-specific, not generic. Brain knows their industry, lifecycle, offering.',
        'Audience (personas, funnel focus) → content recommendations match who they sell to.',
        'Content (brand voice, prohibited topics) → reports match the brand voice and never violate constraints.',
        'Goals + Anti-Goals → ambitious where allowed, conservative where forbidden.',
        'Conversion economics (£/lead, LTV) → reports talk in revenue, not just clicks.',
        'History (what worked, penalties, migrations) → no repeated mistakes, acknowledged wins.',
        'Commercial (report audience) → reports calibrate depth to the CMO vs Founder vs Marketing Manager who reads them.',
        'GSC + GA4 connections → analytics auto-fill. Trend charts populate without manual snapshots.',
      ]},
      { title: 'Required vs optional', icon: '✅', items: [
        'Required fields are marked with a red asterisk. Reports and cards still generate when they\'re missing — but the AI hedges its claims and surfaces "context would strengthen this" notes.',
        'Soft gates, not hard gates: nothing blocks. But richer Data Room = noticeably better output.',
        'The Overview tab shows a health score per section so you can see what would have the highest impact to fill next.',
      ]},
      { title: 'Documents', icon: '📊', items: [
        'Upload Screaming Frog exports → Brain reads every crawl issue and creates canvas cards.',
        'Upload GSC Performance CSV → Brain identifies ranking opportunities by keyword.',
        'Upload competitor analysis → Brain builds a specific gap attack plan.',
        'Documents persist permanently — they\'re referenced every time you work on this project.',
      ]},
    ],
    tips: [
      'Brain reference block says "DATA ROOM KNOWLEDGE:" — this shows what it\'s using.',
      '"My Data Room feels empty" → Ask Brain what to fill next based on your current gaps.',
      'Upload a competitor\'s homepage URL → Brain compares it to yours and finds gaps.',
      'GSC + GA4 auto-sync fills the analytics fields automatically — focus your manual entry time on Identity, Audience, Content, and History.',
    ],
    brainPrompt: 'Review my Data Room and tell me: what\'s missing that would most improve the quality of your recommendations? Walk me through exactly what to add.',
  },
  '/algorithm-intel': {
    title: 'Algorithm Intelligence', icon: Cpu,
    tagline: 'What Google and AI engines are rewarding right now. Brain uses this to align your strategy.',
    sections: [
      { title: 'How to use it', icon: '🔧', items: [
        'Browse the catalog → click Fetch on any topic to load the full intelligence brief.',
        'Saved topics appear in your Library. Brain reads all saved topics before strategic responses.',
        'Custom topic: type any SEO topic → Brain researches it live and saves it.',
        'When you save a topic, Brain automatically checks if any existing learnings are affected.',
      ]},
      { title: 'Priority topics for your project', icon: '⚡', items: [
        'HubSpot SEO best practices (your CMS) — Brain can\'t give HubSpot-specific advice without this.',
        'AI Overviews citation triggers — critical for your LLM Score of 20/100.',
        'March 2025 Core Update — know what Google rewarded and penalised.',
        'No-code app builder SERP behavior — your primary keyword vertical.',
        'E-E-A-T signals 2025 — foundational for your content strategy.',
      ]},
      { title: 'ALGO UPDATE alerts', icon: '⚠️', items: [
        'When you save a new algorithm topic, Brain automatically scans your active learnings.',
        'Learnings that may be outdated get tagged ALGO UPDATE.',
        'Go to Brain Learning → ACTIVE tab to see which learnings need re-enrichment.',
        'Use DEEPEN WITH BRAIN to update them with the new algorithm context.',
      ]},
    ],
    tips: [
      '3 topics loaded → Brain estimates algorithm context. 10+ topics → Brain knows your specific vertical.',
      'Save topics in order of your biggest current gaps first.',
      'Ask Brain "what algorithm topics should I load for a HubSpot B2B SaaS site?"',
    ],
    brainPrompt: 'Based on my project type and current SEO gaps, what are the 5 most important algorithm topics I should load right now? For each, tell me exactly how it would change your advice.',
  },
  '/audit': {
    title: 'SEO Audit', icon: Globe,
    tagline: 'Comprehensive site analysis streaming in real time. Every finding auto-saved to Brain Desk.',
    sections: [
      { title: 'Running an audit', icon: '🔧', items: [
        'Enter your URL (or a competitor\'s) → select audit depth → results stream in real time.',
        'Standard: 3-5 min. Covers technical, content, schema, performance.',
        'Deep: 10-15 min. Includes LLM visibility scoring and comprehensive gap analysis.',
        'Outputs auto-save to Brain Desk after completion. Upload the PDF to Data Room for Brain to reference.',
      ]},
      { title: 'What Brain does with audit results', icon: '🧠', items: [
        'After an audit, tell Brain "interpret the latest audit results" — it prioritises findings by impact.',
        'Brain creates canvas cards from audit findings — "generate cards from this audit" works.',
        'Audit findings become auto-captured learnings in Brain Learning — approve the technical ones.',
        'LLM audit section shows exactly why AI engines aren\'t citing you — fix those first.',
      ]},
      { title: 'Interpreting results', icon: '📊', items: [
        'RED items: blocking issues. Fix before anything else.',
        'AMBER items: degrading performance. Fix this sprint.',
        'GREEN: working correctly. Maintain.',
        'LLM section: shows your AI engine citation score and exactly what to change.',
      ]},
    ],
    tips: [
      'Run a competitor audit → upload result to Data Room → Brain builds a gap attack plan.',
      'Audit before each major content push — catch technical issues before they suppress rankings.',
      'LLM Score on Dashboard updates after running a deep audit.',
    ],
    brainPrompt: 'I just ran an audit. Help me interpret the most important findings and create a prioritised action plan. What should I fix in Week 1?',
  },
  '/desk': {
    title: 'Brain Desk', icon: BookOpen,
    tagline: 'Everything Brain has produced, organised and searchable. Your AI output archive.',
    sections: [
      { title: 'What gets saved here', icon: '🔧', items: [
        'Every Brain Command task execution — full output, auto-tagged by type.',
        'Every audit result — structured findings ready to reference.',
        'Brain chat responses you save manually via "Save to Desk" button.',
        'Deep enrichment results from Brain Learning.',
      ]},
      { title: 'Finding what you need', icon: '📊', items: [
        'Filter by content type: report, code, audit, analysis, note.',
        'Filter by tags — Brain auto-tags by card type and source.',
        'Search by keyword — finds content anywhere in the full text.',
        'Pin important outputs to the top — they stay visible regardless of filter.',
      ]},
      { title: 'Using outputs', icon: '⚡', items: [
        'Code outputs (technical cards): copy directly into your CMS or developer handoff.',
        'Content drafts: download, review, then upload to your CMS.',
        'Audit reports: upload to Data Room so Brain references them in future responses.',
        'Strategy reports: share with team, use in client calls, track progress against them.',
      ]},
    ],
    tips: [
      'Empty desk = no tasks executed yet. Run Brain Command first.',
      'Pin your most recent audit result — Brain references pinned items more readily.',
      'Ask Brain "summarise everything saved to desk this week" for a weekly progress report.',
    ],
    brainPrompt: 'Show me what\'s in my Brain Desk and tell me what I should do with the most important outputs. What needs action versus what is already done?',
  },

  '/mission-control': {
    title: 'Mission Control', icon: Rocket,
    tagline: 'Portfolio view of every active project. Triage-first — what needs eyes today.',
    sections: [
      { title: 'How to read the page (top to bottom)', icon: '🎯', items: [
        'Eight portfolio tiles at the top: active projects, projects needing attention, cards in progress, blocked cards, shipped this month, ripe for measurement, open alerts, pending suggestions. Coloured tiles mean action — calm tiles mean healthy.',
        'Attention Required section appears only when projects have flags. Red = critical (open critical alerts). Amber = warn (open alerts or blocked cards). Blue = info (ripe measurements, pending suggestions, stale integrations).',
        'Portfolio table at the bottom shows every active project as one row. Sort by attention, name, in progress, shipped, audit score, alerts, or last activity.',
        'Filter pills (All / Attention / Healthy) narrow the table. Default sort is attention descending — fires float to the top.',
      ]},
      { title: 'The triage flow — clear morning routine', icon: '⚡', items: [
        'Step 1: Scan the Attention Required section. Each card lists exactly what is wrong (e.g. "2 blocked cards · GSC stale · 1 critical alert"). Click Open to jump straight into that project\'s PM page.',
        'Step 2: Look at portfolio totals. If "Need attention" tile is 0 and "Open alerts" tile is 0, the portfolio is healthy — you can spend the day on whichever project deserves deep work.',
        'Step 3: Use the table for non-urgent monitoring. Sort by "Last Activity" ascending to find stale projects. Sort by "Audit Score" ascending to find weakest sites.',
      ]},
      { title: 'Understanding the table', icon: '📊', items: [
        'In Progress column shows cards being worked on. "(N blocked)" means cards waiting on dependencies — open the PM board to resolve.',
        'Shipped (mo) column shows shipments this month. "(N ripe)" means shipments 14+ days old not yet measured — these auto-measure via cron, but you can also click into the card lifecycle to measure manually.',
        'GSC · GA4 dots: green = pulled in last 3 days. Amber = stale, refresh recommended. Grey = not connected.',
        'Alerts column shows open alert count. Red badge means at least one critical alert. "C" suffix shows critical count.',
        'Suggest column shows pending suggestions from auto-pilot rules. Click into the project\'s Auto-pilot tab to accept or dismiss.',
      ]},
      { title: 'Drill-in', icon: '🔍', items: [
        'Clicking any project in the Attention list or table sets it as your selected project and navigates to /pm. You land on the Board tab.',
        'Use the Auto-pilot tab in the PM module to handle Suggestions and Alerts for that project.',
        'Use the Requirements tab → Integrations section to reconnect a stale GSC/GA4.',
      ]},
    ],
    tips: [
      'Refresh button at the top re-runs the aggregation. The page is read-only — all changes happen in the per-project PM module.',
      'A "0 projects need attention" portfolio is the goal of every Monday morning. Pick the next deep-work project from the Healthy filter.',
      'If a project never moves off Attention Required, dig into why — usually one root cause (no GSC, perpetual blocker, missed measurements) fixes the rest.',
    ],
    brainPrompt: 'I am looking at Mission Control. Based on what you can see, what should my priority be today across the portfolio? Walk me through the top 3 projects I should touch in order, and what specific action each needs.',
  },

  '/admin': {
    title: 'Admin', icon: Sparkles,
    tagline: 'Client and project setup. Every project created here gets its own Brain intelligence.',
    sections: [
      { title: 'Project setup flow', icon: '🎯', items: [
        '1. Create client → 2. Create project → 3. Brain onboarding questions → 4. Fill Data Room → 5. Load Algorithm Intel.',
        'The Brain onboarding questions (8 questions) are permanently stored as active learnings — Brain uses them from day one.',
        'Each project has its own: canvas, data room, learnings, desk, audit history.',
        'Selecting a project anywhere in the app loads that project\'s complete intelligence context.',
      ]},
      { title: 'Getting the most from setup', icon: '🧠', items: [
        'Answer all 8 onboarding questions — Brain uses these to calibrate every recommendation.',
        'Add competitors at setup — Brain starts competitive analysis from the first response.',
        'Set a specific goal (not just "increase traffic") — "rank on page 1 for X keyword by Y date" makes Brain\'s advice measurable.',
        'Record CMS and SEO plugin — Brain gives platform-specific code and config for free.',
      ]},
    ],
    tips: [
      'Onboarding questions store as active learnings — the only learnings that auto-approve.',
      'Add multiple projects for different clients or different brand domains.',
      'Tell Brain "brief me on [project]" for an instant intelligence summary after setup.',
    ],
    brainPrompt: 'I just created a new project. Walk me through the optimal setup sequence to get Brain performing at full intelligence as quickly as possible.',
  },
  '/pm': {
    title: 'Project Manager', icon: Layers,
    tagline: "Turn the project's data into executable cards — grounded in audits, the crawl, algorithm practices, and your Data Room.",
    sections: [
      { title: 'What this page does', icon: '🎯', items: [
        'Gathers every signal the project has — Data Room, audits, crawled pages, brain learnings, documents — and presents it as a strategist would brief a team.',
        'Lets you cross-verify the gathered intelligence against live data: run a fresh crawl to see how your pages compare to competitors right now.',
        'Generates executable task cards in two stages — a plan first, then each card expanded with its own algorithm practices, checklist, and prerequisites.',
        'Every card carries the algorithm checklist items it must satisfy, so execution is measured against real ranking criteria, not generic advice.',
      ]},
      { title: 'Get the most out of card generation', icon: '⚡', items: [
        'Fill the Data Room first — goal, tool access, baseline metrics, and competitors. Cards quality scales directly with this.',
        'Run a full audit before generating cards. Audit detail (technical, content, competitive) is what makes cards specific.',
        'Run a fresh crawl on 5-7 important URLs (your landing pages + top 2-3 competitors). The keyword→page mapping and AI comparison both depend on this.',
        'Enrich the algorithm topics that matter for this project — click Enrich on each. Card generation will use the practices and checklists from enriched topics directly.',
        'After a crawl, manually link each target keyword to its landing page in the Crawl section — this makes content and competitive cards much sharper.',
      ]},
      { title: 'Reading the page', icon: '📊', items: [
        'Project brief at the top is your overview for client conversations — goal, timeline, success metric, baseline.',
        'Audit findings: verdict + biggest win + urgent gap + technical / content / AI-visibility / competitive sections. If you see only a score, click Run full audit.',
        'Algorithm intelligence: expand a topic to see best practices, the verifiable checklist, and ranking factors that should shape work in this area.',
        'Crawl & competitive comparison: the AI comparison includes the matrix, gaps your pages have, and ranked opportunities — these flow directly into card generation.',
        'Data gaps at the bottom: each gap is something to fix that would meaningfully raise card quality.',
      ]},
      { title: 'After cards are generated', icon: '🚀', items: [
        'Cards land on the Board (next tab). Each card carries its content, prerequisites, and algorithm checklist items.',
        'Open a card to execute it: the checklist items become the criteria — work is measured against real algorithm requirements.',
        'Verify cards once executed; verified work feeds Brain learnings for future projects.',
        'The Reports tab builds composable client-shareable reports: pick blocks (narrative, charts, tables, KPIs, matrices), set tone & emotion sliders, generate, edit, share.',
      ]},
      { title: 'Building a client report', icon: '📄', items: [
        'Open the Reports tab → New report. Pick the period.',
        'Choose which blocks to include — narrative slots (AI-written), KPI tiles, time-series charts, tables of delivered cards, the audit synthesis, the competitive matrix. Each block shows whether the data exists.',
        'Set the tone & style sliders: tone (casual↔formal), technical depth, confidence, emotion, length. These shape every AI-written block.',
        'Add PM context: what to emphasize, what to downplay, client mood, and a custom PM note. This is what makes the report feel like YOU wrote it.',
        'Generate, then edit/reorder/regenerate individual blocks. Save as draft, finalize, or share with an unguessable link.',
        'Trend charts need history. Take a snapshot any time you want a data point captured. Each report generation also captures one automatically.',
      ]},
      { title: 'The execution loop — ship & measure', icon: '🚢', items: [
        'Every card has a lifecycle: planned → in progress → executed → reviewed → shipped → measured. Open the Lifecycle drawer on any board card to move it through.',
        'Shipping requires what changed (a short summary) and which URL it landed on. The system captures a metrics baseline at ship-time automatically.',
        'Dependencies are real: a card cannot ship if it depends on another card that has not shipped yet. The board shows blocked cards with a lock icon.',
        'Force-shipping is allowed but requires a written reason — logged forever in the card activity so the team has accountability.',
        'After ~14-30 days, click "Measure now" on the shipment to capture post-ship metrics. The card carries its before/after, and reports use this as real attribution.',
        'The Reports tab adds a "Measured impact" block: every shipped card with its target URL, click delta, and position delta. This is the data clients actually want to see.',
      ]},
      { title: 'Integrations — Search Console, GA4 & friends', icon: '🔌', items: [
        'Connect Google Search Console + Google Analytics 4 on the Requirements page → Integrations section. The PM authorizes each via the connecting Google account.',
        'After connecting, pick which property applies to this project — one Google account can manage many GSC sites and many GA4 properties.',
        'Once connected, metrics pull automatically every day. GSC: clicks, impressions, average position. GA4: organic sessions (filtered to organic traffic only), conversions, bounce rate.',
        'Manual pull is available any time with "Pull now" — useful before generating a report.',
        'A green "Live" badge means pulled within the last 3 days; an amber "Stale" badge means refresh is recommended.',
        'Auto-synced fields in the Data Room show an "Auto-synced from GSC" or "from GA4" pill. To override (rare — e.g. during a GA outage), click "Edit anyway" — a deliberate action that protects live data from accidental overwrites.',
        'Reports calibrate their language to data source health: confident claims when GSC + GA4 are live, hedged claims when stale, and a recommendation to connect when not connected.',
      ]},
      { title: 'Brand Studio — Generate (H.2)', icon: '✨', items: [
        'Brand Studio → Generate tab. The headline feature: AI produces finished strategic documents from your Data Room + ingested documents + brand assets, with strict source citation per section.',
        'Ten templates available across four categories: Strategic (Brand Statement, Positioning Memo, Audience Persona, Content Style Guide), Performance (Executive Summary, Quarterly Business Review), Competitive (Competitor Battlecard, Market Prominence Report, Content Gap Action Plan), Forward-looking (Opportunity Verdict).',
        'Five templates are marked "investor-grade" with stricter source rules: Positioning Memo, QBR, Market Prominence Report, Opportunity Verdict, and (when shipped in H.3) the investor pack. Sections without source citations get auto-downgraded to low confidence and flagged.',
        'Workflow: pick template → readiness check (does the project have enough Data Room context?) → configure audience + write your vision → generate → review preview with editable sections → save as draft.',
        'Readiness gate: each template lists required Data Room categories. If any required category has zero populated fields, the Generate button is disabled and shows you exactly what to fill in first. No wasting AI tokens on under-supported generation.',
        'Vision input: optional text box where YOU tell the AI what to emphasize, what to downplay, what tone. Example: "Lead with the migration recovery story, soft-pedal lost traffic. Investor reads this Monday." The vision goes into the prompt verbatim.',
        'Source citation discipline: every section carries an array of source IDs. Format: dataroom:<category>.<field_key> for Data Room fields, doc:<id> for ingested documents, brand:<asset> for brand assets, ASSUMPTION (explicit, never silent) for inferences. No claim is fabricated.',
        'Per-section confidence: high (directly sourced), medium (reasonable inference from sources), low (limited evidence — content flagged). Section editor lets you override AI\'s confidence if you disagree.',
        'Editable preview: every section is editable before saving. The AI proposes; you confirm. Edit content, adjust confidence, leave sources intact (or update them if you have better citations).',
        'Saving: generated documents save with kind="generated", template_id set, full structured output in extracted_data, raw_content rendered as markdown. Default doc_status="draft" and published_to_client=FALSE. Nothing leaks until you publish from Library.',
        'Versioning: regenerating an existing document creates v2 with parent_document_id link to v1. Both versions kept in Library. (Diff UI comes in H.5.)',
        'Investor-grade enforcement: for the 5 investor-grade templates, sections with no source citations get auto-downgraded to "low" confidence AND flagged "uncited_strict" in the UI. The section header shows an amber "Uncited" badge. Review carefully before publishing — these flags exist because investor scrutiny is brutal.',
        'Best practice: populate the Data Room thoroughly + ingest a few strategic documents before generating. The richer the input, the better the output. A Brand Statement generated from 3 populated fields will be thin; one from 25+ populated fields + 5 ingested documents will be excellent.',
        'When you would actually generate: monthly QBR (around the 1st), Brand Statement at project kickoff, Competitor Battlecard when sales mentions a new competitor, Opportunity Verdict at quarterly strategy reviews, Persona Doc after every 3-5 sales call notes have been ingested.',
      ]},
      { title: 'Brand Studio — Client Portal (H.1.5)', icon: '🔑', items: [
        'Brand Studio → Client Access tab. Gives the client a branded workspace at /c/<token> where they can see only what you publish to them.',
        'Token-based auth — no signup, no password, no friction for the client. The link IS the credential. Share it via email or your preferred channel.',
        'Master switch first: "Client portal" toggle has to be enabled before any link works. Use this as a kill-switch if you ever need to lock everyone out instantly.',
        'Per-feature toggles: choose which tabs the client sees (Documents Library, Brand, Investor View, Market). Internal team always sees everything; client only sees what you toggle on.',
        'Generate access links: give each link a label (e.g. "John Smith (CMO)", "Q4 leadership review") so you remember who it\'s for. Optionally set an expiry in days.',
        'Generated links are shown ONCE on creation. Copy immediately. To retrieve a still-active link later, use the "Show link" button on the active links list.',
        'Revoke any link instantly. Revoked links stop working immediately and forever. The link cannot be un-revoked — generate a new one if needed.',
        'Audit: every link tracks last_accessed_at and access_count. Good way to know if the client is actually using their workspace.',
        'PUBLISHING: nothing leaks to clients by default. Every ingested or generated document starts as "Internal only" (gray EyeOff badge in Library). PM must explicitly click the publish button on each document to make it visible in the client portal.',
        'Publishing is one-click reversible — toggling unpublishes immediately. The badge turns green ("Published") on the Library row and the document appears in the client workspace.',
        'Client portal layout: branded with the CLIENT\'S OWN brand assets (logo, colors, tagline from the Brand sub-tab). Their workspace feels like theirs, not yours.',
        'Document detail in client portal: shows summary + key findings (from extraction) + the raw content. Read-only. No editing, no deletion, no extraction triggers.',
        'Best practice: ingest a document → review extraction quality in Brand Studio Library → toggle publish on documents the client should see. Anything that doesn\'t pass the "would I be comfortable if the client read this exact thing" sniff test stays unpublished.',
      ]},
      { title: 'Brand Studio — Ingest V2 (H.1)', icon: '📥', items: [
        'Brand Studio → Ingest tab. The Tier-3 unlock — turn documents the client (or any stakeholder) sends you into structured Data Room context.',
        'Five accepted source types: file uploads (PDF, DOCX, XLSX, CSV, TXT, HTML, MD, JSON), and URLs (paste any public URL — Google Doc public link, Notion page, press release, blog post, About page).',
        'EVERY ingest requires picking the stakeholder role (who provided this) before upload. 18 roles available — client executive, sales lead, customer, researcher, advertiser, press, etc. Forces honest tagging.',
        'After upload, the AI auto-detects the doc type from filename + content patterns. PM confirms or overrides before extraction runs. No AI tokens spent until you confirm.',
        '15 doc types supported, each with its own extraction strategy: brand guidelines → content + brand_narrative fields; persona research → audience fields; strategy decks → goal + commercial + audience; sales call notes → audience objections + history; legal/compliance → prohibited topics + required disclaimers; market research → market sizing with sources; existing SEO tool exports (GSC, Screaming Frog, Semrush, etc.) continue to work.',
        'Anti-hallucination discipline carries over: confidence per field, explicit evidence per claim, NEVER fabricates numbers, omits fields where evidence is thin.',
        'Provenance is full and visible: every extracted field writes a row in document_field_provenance. In the Data Room, fields populated from documents get a blue "From document · high|medium|low" badge. Click "From which document?" to see the evidence the AI cited.',
        'Promotion rules: extracted values write to project_knowledge with source="document_extracted". Manual values + GSC/GA4 auto-synced values + seed migration values are NEVER overwritten. AI-inferred values DO get promoted by document extraction (document evidence beats inference).',
        'PDFs go to Claude natively via the document API (best for visual docs). DOCX is parsed server-side via mammoth. XLSX via SheetJS (sheets are sent as CSV-like text). All others are read as plain text.',
        'After extraction completes, you see: 1-2 sentence document summary, list of key findings, open questions the AI flagged for follow-up, and per-field write status (written / skipped because existing manual value / failed).',
        'Best practice: pre-flight stakeholder tagging — pick the role + provided-by + audience BEFORE uploading. Saves time when ingesting a batch. Future H.1.5 will add multi-file batch with stakeholder per-file.',
      ]},
      { title: 'AI Fill — when the client hasn\'t given you everything', icon: '✨', items: [
        'On the Overview tab there are two helper buttons: the blue "Seed V2 fields" (copies data already in your database into the V2 slots), and the purple "AI Fill" (proposes values for fields the client hasn\'t given you, drawn from real evidence).',
        'AI Fill reads your crawled website pages, competitors, existing knowledge, and audit findings. It proposes values ONLY for fields where honest evidence exists.',
        'Every proposal carries a confidence level (high / medium / low) and the reasoning behind it. Click "Why this value?" on any field to see exactly which pages or sources the AI drew from.',
        'PM is always in the loop. Click AI Fill → preview modal opens → tick the proposals you trust → click Apply. Nothing is written without your approval.',
        'The AI is disciplined: it returns null for any field where evidence is too thin. It NEVER fabricates revenue figures, employee counts, prohibited topics, or anything else that should come from the client.',
        'Tier 3 fields (client-only knowledge — engagement terms, history, anti-goals, conversion economics) get a "Questions for client" list at the bottom of the modal. Copy-paste into an email to the client.',
        'Applied AI fields show a purple "AI inferred · high|medium|low" badge in the per-category forms. Click "Why this value?" under any field to see the reasoning. The badge turns amber after 60 days as a verify-with-client reminder.',
        'When you edit an AI-inferred field manually and save, it stops being "AI inferred" — it becomes your truth. Re-running AI Fill won\'t touch fields you\'ve confirmed.',
        'Best practice: run a website crawl first (URL Crawler tab) so AI Fill has rich evidence to ground in. Empty crawl = many null proposals.',
      ]},
      { title: 'Auto-pilot — rules, suggestions, alerts', icon: '⚡', items: [
        'Open the PM module → Auto-pilot tab. Three sub-tabs: Suggestions (cards the system thinks should exist), Alerts (anomalies detected), Rules (enable/disable per project).',
        'Six rule types: Monthly audit, Quarterly crawl, Weekly report draft, Monthly report draft, Rank drop alert, Click drop alert, Audit score drop alert.',
        'PM is always in the loop. The system NEVER creates a kanban card or sends a client report directly — it suggests, you accept.',
        'Suggestions inbox: review the title/description, then Accept (creates a real card in the Library) or Dismiss (with optional reason for audit trail).',
        'Alerts inbox: anomalies only fire when high-confidence (5+ position drop, 30%+ click drop, 10+ audit score drop). Acknowledge to mark as seen, Resolve when handled.',
        'Alerts deduplicate — the same condition won\'t pile up multiple open alerts. Once resolved, kept forever for history.',
        'Run now button on any rule fires it immediately, bypassing the schedule. Useful for testing or when you want fresh anomaly checks before a client call.',
        'Cron runs daily at 06:00 UTC: pulls fresh GSC/GA4 data, then walks every enabled rule across every project. Last fire status appears on each rule.',
      ]},
    ],
    tips: [
      'A weak project brief = generic cards. Spend 10 minutes on the Data Room and your cards will be 3× sharper.',
      'If a crawl fails or the comparison is thin, reduce the URL list to 5-6 most important pages — quality over coverage.',
      'Ask Brain "what is missing in this project to generate better cards?" — it reads the same context the generator does.',
    ],
    brainPrompt: "Look at this project's gathered context — Data Room, audits, crawl, algorithm intelligence — and tell me: what is the strongest 3-card week-one plan I should generate, and what data am I missing that would make these cards even sharper?",
  },
};

/* ─── Activity tracker ─── */
interface Activity { page: string; count: number; lastVisit: number }

function useActivityTracker(currentPage: string) {
  const [activity, setActivity] = useState<Record<string, Activity>>(() => {
    try { return JSON.parse(localStorage.getItem('brain_activity') || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    setActivity(prev => {
      const updated = {
        ...prev,
        [currentPage]: {
          page: currentPage,
          count: (prev[currentPage]?.count || 0) + 1,
          lastVisit: Date.now(),
        },
      };
      try { localStorage.setItem('brain_activity', JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, [currentPage]);

  const mostVisited = Object.values(activity)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return { activity, mostVisited };
}

/* ─── Context menu ─── */
interface ContextMenuState { x: number; y: number; visible: boolean; topic?: string }

/* ─── Bubble suggestion ─── */
interface Suggestion { id: string; message: string; page: string; action?: string; actionLabel?: string; delay: number }

function buildSuggestion(page: string, activity: Record<string, Activity>): Suggestion | null {
  const pageData = PAGES[page];
  if (!pageData) return null;

  const visits     = activity[page]?.count || 0;
  const totalPages = Object.keys(activity).length;

  const suggestions: Suggestion[] = [
    // Mission control — presidential advisor briefing
    visits === 1 && page === '/mission-control' ? {
      id: 'mc_first', page,
      message: "Vital Strip first — scan for amber. Pending Approvals is your queue. Any project ring below 60 needs a directive. Your briefing is one click away.",
      action: 'help', actionLabel: 'Full briefing', delay: 3500,
    } : null,
    // MC returning — nudge toward Brain briefing if not yet asked
    visits === 3 && page === '/mission-control' ? {
      id: 'mc_brief', page,
      message: "Use the centre panel Brain chat — ask for this week's top 3 priorities. That's the 30-second presidential briefing.",
      action: 'help', actionLabel: 'How to use it', delay: 5000,
    } : null,

    // First time on dashboard
    visits === 1 && page === '/dashboard' ? {
      id: 'welcome_dashboard', page,
      message: "Welcome! I'm noticing you're on the Dashboard for the first time. Your LLM Score needs attention — want me to show you the fastest way to fix it?",
      action: 'help', actionLabel: 'Show me how', delay: 4000,
    } : null,
    // Heavy brain-learning user
    visits >= 3 && page === '/brain-learning' ? {
      id: 'brain_power', page,
      message: "You're clearly building up Brain's intelligence — love that! Did you know DEEPEN WITH BRAIN can raise confidence scores significantly before you approve?",
      action: 'help', actionLabel: 'Tell me more', delay: 6000,
    } : null,
    // Algorithm intel rarely visited
    totalPages >= 3 && !activity['/algorithm-intel'] && (page === '/playground' || page === '/brain-learning') ? {
      id: 'algo_suggestion', page,
      message: "Quick insight: loading Algorithm Intelligence for your vertical would sharpen every Brain response. It takes 10 minutes and compounds over time.",
      action: 'navigate', actionLabel: 'Open Algorithm Intel', delay: 8000,
    } : null,
    // Data room empty signal
    visits >= 2 && page === '/data-room' ? {
      id: 'data_room_tip', page,
      message: "I see you're in the Data Room. The single highest-leverage action here is filling your Goals section — it calibrates everything Brain does for this project.",
      action: 'help', actionLabel: 'What to fill', delay: 5000,
    } : null,
    // Brain command first visit
    visits === 1 && page === '/brain-command' ? {
      id: 'command_first', page,
      message: "Brain Command is the power move — running multiple tasks in parallel. Select a project first, then queue your quick-win cards for instant results.",
      action: 'help', actionLabel: 'How it works', delay: 5000,
    } : null,
    // General exploration
    totalPages >= 5 && visits === 1 ? {
      id: 'explorer', page,
      message: `You're exploring ${pageData.title}! One thing that surprises most users here: ${pageData.tips[0]}`,
      action: 'help', actionLabel: 'Learn more', delay: 7000,
    } : null,
  ].filter(Boolean) as Suggestion[];

  if (suggestions.length === 0) return null;
  return suggestions[0];
}

/* ─── Main component ─── */
export default function HelpOracle() {
  const location = useLocation();
  const navigate  = useNavigate();
  const page     = location.pathname;
  const pageData = PAGES[page];

  const [panelOpen,   setPanelOpen]   = useState(false);
  const [activeSection, setSection]   = useState(0);
  const [search,      setSearch]      = useState('');
  const [ctxMenu,     setCtxMenu]     = useState<ContextMenuState>({ x:0, y:0, visible:false });
  const [bubble,      setBubble]      = useState<Suggestion | null>(null);
  const [bubbleSeen,  setBubbleSeen]  = useState<Set<string>>(new Set());
  const [brainAnswer, setBrainAnswer] = useState('');
  const [brainLoading,setBrainLoading]= useState(false);
  const [activeQ,     setActiveQ]     = useState('');
  const [minimized,   setMinimized]   = useState(false);
  const bubbleTimer  = useRef<any>(null);
  const { activity, mostVisited } = useActivityTracker(page);

  // Bubble suggestion logic
  useEffect(() => {
    if (!pageData) return;
    setBubble(null);
    clearTimeout(bubbleTimer.current);

    const suggestion = buildSuggestion(page, activity);
    if (!suggestion || bubbleSeen.has(suggestion.id)) return;

    bubbleTimer.current = setTimeout(() => {
      setBubble(suggestion);
    }, suggestion.delay);

    return () => clearTimeout(bubbleTimer.current);
  }, [page]);

  // Context menu: right-click anywhere
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!pageData) return;
      e.preventDefault();
      const selection = window.getSelection()?.toString().trim().slice(0, 60);
      setCtxMenu({ x: e.clientX, y: e.clientY, visible: true, topic: selection || undefined });
    };
    const close = () => setCtxMenu(c => ({ ...c, visible: false }));
    document.addEventListener('contextmenu', handler);
    document.addEventListener('click', close);
    return () => { document.removeEventListener('contextmenu', handler); document.removeEventListener('click', close); };
  }, [page, pageData]);

  // Ask Brain a question
  const askBrain = useCallback(async (question: string) => {
    if (!question.trim()) return;
    setActiveQ(question);
    setBrainAnswer('');
    setBrainLoading(true);
    try {
      const res = await fetch('/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Brain-Source': 'help-oracle' },
        body: JSON.stringify({
          mode: 'chat',
          question,
          projectSummary: `User is on page: ${pageData?.title || page}`,
          brainAssistantContext: { projectContext: null, learnings: [], algoItems: [], canvasBlocks: [], history: [] },
        }),
      });
      if (!res.ok || !res.body) throw new Error('Brain unavailable');
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value);
        setBrainAnswer(full);
      }
    } catch (e: any) {
      setBrainAnswer('⚡ Brain is not available right now. Check that you\'re signed in and the API is running.');
    }
    setBrainLoading(false);
  }, [page, pageData]);

  if (!pageData) return null;

  const Icon = pageData.icon;
  const filteredSections = pageData.sections.filter(s =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.items.some(i => i.toLowerCase().includes(search.toLowerCase()))
  );

  /* ─── CONTEXT MENU ─── */
  const ContextMenu = () => !ctxMenu.visible ? null : (
    <div style={{
      position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 99999,
      background: 'rgba(8,10,24,0.97)', border: '1px solid rgba(99,102,241,0.35)',
      borderRadius: 12, padding: '6px 0', minWidth: 200,
      boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 30px rgba(99,102,241,0.1)',
      backdropFilter: 'blur(16px)', animation: 'oracleIn 0.15s ease',
    }}>
      <div style={{ padding: '4px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#a5b4fc', letterSpacing: '0.1em' }}>
          ◈ HELP ORACLE — {pageData.title.toUpperCase()}
        </div>
        {ctxMenu.topic && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2, fontStyle: 'italic' }}>
            "{ctxMenu.topic.slice(0,40)}"
          </div>
        )}
      </div>
      {(page === '/mission-control' ? [
          { icon: '📋', label: 'Presidential briefing', action: () => { setPanelOpen(true); askBrain(pageData.brainPrompt); } },
          { icon: '⚡', label: 'What needs action now', action: () => { setPanelOpen(true); askBrain("What needs my attention across all projects in the next 30 minutes? Prioritise by urgency."); } },
          { icon: '🧠', label: 'Brain quality report', action: () => { setPanelOpen(true); askBrain("Brain quality report: which projects are optimal, which are weak, top action per each weak project?"); } },
          ctxMenu.topic ? { icon: '🔍', label: `Search: "${ctxMenu.topic?.slice(0,20)}"`, action: () => { setPanelOpen(true); setSearch(ctxMenu.topic!); } } : null,
        ] : [
          { icon: '📖', label: `How ${pageData.title} works`, action: () => { setPanelOpen(true); setSection(0); } },
          { icon: '⚡', label: 'Quick tips', action: () => { setPanelOpen(true); setSection(1); } },
          { icon: '🧠', label: 'Ask Brain about this', action: () => { setPanelOpen(true); askBrain(ctxMenu.topic ? `Help me understand: "${ctxMenu.topic}" in the context of ${pageData.title}` : pageData.brainPrompt); } },
          ctxMenu.topic ? { icon: '🔍', label: `Search: "${ctxMenu.topic?.slice(0,25)}"`, action: () => { setPanelOpen(true); setSearch(ctxMenu.topic!); } } : null,
        ]).filter(Boolean).map((item: any, i) => (
        <button key={i} onClick={() => { item.action(); setCtxMenu(c => ({ ...c, visible: false })); }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
            background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)',
            fontSize: 12, textAlign: 'left', transition: 'background 0.1s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.12)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );

  /* ─── BRAIN BUBBLE ─── */
  const BrainBubble = () => !bubble ? null : (
    <div style={{
      position: 'fixed', bottom: 90, left: 20, zIndex: 9998,
      maxWidth: 300, animation: 'bubbleIn 0.5s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      {/* Connector line */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
          border: '2px solid rgba(99,102,241,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 16px rgba(99,102,241,0.5)',
          animation: 'pulseGlow 2s ease-in-out infinite',
        }}>
          <Brain size={14} style={{ color: 'white' }}/>
        </div>
        <div style={{
          background: 'rgba(8,10,24,0.96)', border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: '16px 16px 16px 4px', padding: '12px 14px',
          boxShadow: '0 4px 30px rgba(0,0,0,0.5), 0 0 20px rgba(99,102,241,0.1)',
          backdropFilter: 'blur(16px)', position: 'relative',
        }}>
          <button onClick={() => setBubble(null)} style={{
            position: 'absolute', top: 6, right: 8, background: 'none', border: 'none',
            cursor: 'pointer', color: 'rgba(255,255,255,0.2)', fontSize: 12, lineHeight: 1,
          }}>×</button>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#a5b4fc', marginBottom: 5, letterSpacing: '0.08em' }}>
            ◈ MANAV BRAIN
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, margin: '0 0 10px' }}>
            {bubble.message}
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {bubble.actionLabel && (
              <button onClick={() => {
                setBubbleSeen(s => new Set([...s, bubble.id]));
                setBubble(null);
                if (bubble.action === 'help') setPanelOpen(true);
                if (bubble.action === 'navigate') navigate('/algorithm-intel');
              }} style={{
                background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
                borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                color: '#a5b4fc', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
              }}>
                {bubble.actionLabel}
              </button>
            )}
            <button onClick={() => { setBubbleSeen(s => new Set([...s, bubble.id])); setBubble(null); }} style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
              color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace',
            }}>
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ─── FLOATING TRIGGER ─── */
  const isMC = page === '/mission-control';

  const FloatingTrigger = () => (
    <button
      onClick={() => {
        setPanelOpen(true);
        // On MC: auto-load the presidential briefing
        if (isMC && !activeQ) {
          askBrain(pageData.brainPrompt);
        }
      }}
      style={{
        position: 'fixed', bottom: 24, left: 24, zIndex: 9997,
        height: isMC ? 32 : 36,
        width: isMC ? 'auto' : 36,
        padding: isMC ? '0 14px' : '0',
        borderRadius: isMC ? 8 : '50%',
        background: isMC ? 'rgba(255,184,0,0.1)' : 'rgba(8,10,24,0.85)',
        border: isMC ? '1px solid rgba(255,184,0,0.35)' : '1px solid rgba(99,102,241,0.3)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 6,
        backdropFilter: 'blur(12px)',
        boxShadow: isMC
          ? '0 0 0 1px rgba(255,184,0,0.15), 0 4px 16px rgba(0,0,0,0.4)'
          : '0 0 0 1px rgba(99,102,241,0.15), 0 4px 16px rgba(0,0,0,0.4)',
        transition: 'all 0.2s',
        opacity: isMC ? 0.8 : 0.6,
        fontFamily: '"Courier New",monospace',
      }}
      title={isMC ? 'Presidential Briefing (Right-click for more directives)' : 'Help & Knowledge (Right-click anywhere for more)'}
      onMouseEnter={e => {
        Object.assign(e.currentTarget.style, {
          opacity: '1', transform: 'scale(1.04)',
          boxShadow: isMC
            ? '0 0 0 1px rgba(255,184,0,0.5), 0 0 20px rgba(255,184,0,0.2)'
            : '0 0 0 1px rgba(99,102,241,0.5), 0 0 20px rgba(99,102,241,0.3)',
        });
      }}
      onMouseLeave={e => {
        Object.assign(e.currentTarget.style, {
          opacity: isMC ? '0.8' : '0.6', transform: 'scale(1)',
          boxShadow: isMC
            ? '0 0 0 1px rgba(255,184,0,0.15), 0 4px 16px rgba(0,0,0,0.4)'
            : '0 0 0 1px rgba(99,102,241,0.15), 0 4px 16px rgba(0,0,0,0.4)',
        });
      }}
    >
      {isMC
        ? <>
            <span style={{ fontSize: 11, color: 'rgba(255,184,0,0.8)', letterSpacing: '0.08em', fontWeight: 700 }}>◈ ADVISOR</span>
          </>
        : <HelpCircle size={15} style={{ color: 'rgba(165,180,252,0.7)' }}/>
      }
    </button>
  );

  /* ─── HELP PANEL ─── */
  if (!panelOpen) return (
    <>
      <ContextMenu/>
      <BrainBubble/>
      <FloatingTrigger/>
      <style>{ORACLE_STYLES}</style>
    </>
  );

  return (
    <>
      <ContextMenu/>
      {/* Backdrop */}
      <div onClick={() => setPanelOpen(false)} style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(3,5,15,0.7)', backdropFilter: 'blur(8px)',
      }}/>

      {/* Panel */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
        height: minimized ? 52 : '80vh',
        background: 'rgba(4,6,15,0.98)',
        borderTop: '1px solid rgba(99,102,241,0.25)',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -20px 80px rgba(0,0,0,0.6), 0 0 60px rgba(99,102,241,0.08)',
        display: 'flex', flexDirection: 'column',
        animation: 'panelSlideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        overflow: 'hidden',
        transition: 'height 0.3s ease',
      }}>
        {/* Panel header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))',
          borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, cursor: 'pointer',
        }} onClick={() => setMinimized(m => !m)}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'linear-gradient(135deg,rgba(99,102,241,0.25),rgba(139,92,246,0.15))',
            border: '1px solid rgba(99,102,241,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon size={14} style={{ color: '#a5b4fc' }}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: page === '/mission-control' ? '#FFB800' : '#a5b4fc', fontWeight: 900, letterSpacing: '0.08em' }}>
              {page === '/mission-control' ? '◈ PRESIDENTIAL ADVISOR' : `◈ HELP ORACLE — ${pageData.title.toUpperCase()}`}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
              {pageData.tagline}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={e => { e.stopPropagation(); setMinimized(m => !m); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 4 }}>
              <ChevronDown size={14} style={{ transform: minimized ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}/>
            </button>
            <button onClick={e => { e.stopPropagation(); setPanelOpen(false); setMinimized(false); setBrainAnswer(''); setActiveQ(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 4 }}>
              <X size={14}/>
            </button>
          </div>
        </div>

        {!minimized && (
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', flex: 1, overflow: 'hidden' }}>
            {/* Left nav */}
            <div style={{
              borderRight: '1px solid rgba(255,255,255,0.05)',
              background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column',
              padding: '12px 0', overflow: 'auto',
            }}>
              {/* Search */}
              <div style={{ padding: '0 12px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={10} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.2)' }}/>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search help..."
                    style={{ width: '100%', paddingLeft: 26, paddingRight: 8, height: 28, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, fontSize: 11, color: 'rgba(255,255,255,0.6)', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}/>
                </div>
              </div>

              {/* Sections nav */}
              <div style={{ padding: '8px 0' }}>
                <div style={{ padding: '2px 12px 6px', fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em' }}>
                  KNOWLEDGE SECTIONS
                </div>
                {pageData.sections.map((s, i) => (
                  <button key={i} onClick={() => setSection(i)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', background: i === activeSection ? 'rgba(99,102,241,0.1)' : 'none',
                      border: 'none', borderLeft: `2px solid ${i === activeSection ? '#6366f1' : 'transparent'}`,
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                    }}>
                    <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{s.icon}</span>
                    <span style={{ fontSize: 11, color: i === activeSection ? '#a5b4fc' : 'rgba(255,255,255,0.4)', lineHeight: 1.3 }}>{s.title}</span>
                  </button>
                ))}
              </div>

              {/* Tips section */}
              <div style={{ padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 4 }}>
                <div style={{ padding: '8px 12px 4px', fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em' }}>
                  QUICK TIPS
                </div>
                {pageData.tips.map((tip, i) => (
                  <div key={i} style={{ padding: '5px 12px', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <span style={{ color: '#fbbf24', fontSize: 10, marginTop: 1, flexShrink: 0 }}>⚡</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>{tip}</span>
                  </div>
                ))}
              </div>

              {/* Ask Brain */}
              <div style={{ padding: '10px 12px', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <button onClick={() => { setSection(-1); askBrain(pageData.brainPrompt); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px',
                    background: 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.1))',
                    border: '1px solid rgba(99,102,241,0.3)', borderRadius: 9, cursor: 'pointer',
                    color: '#a5b4fc', fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
                    boxShadow: '0 0 12px rgba(99,102,241,0.15)',
                  }}>
                  <Brain size={11}/>
                  {page === '/mission-control' ? 'GET BRIEFING' : 'ASK BRAIN'}
                </button>
              </div>
            </div>

            {/* Content area */}
            <div style={{ overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Brain answer mode */}
              {activeQ && (
                <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 4 }}>
                  <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#a5b4fc', marginBottom: 8, letterSpacing: '0.1em' }}>
                    ◈ BRAIN RESPONSE {brainLoading ? '— THINKING...' : '— COMPLETE'}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', marginBottom: 10 }}>
                    "{activeQ.slice(0, 120)}{activeQ.length > 120 ? '...' : ''}"
                  </div>
                  {brainLoading && !brainAnswer && (
                    <div style={{ display: 'flex', gap: 5, padding: '8px 0' }}>
                      {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animation: `dotPulse 1.4s ease-in-out ${i*0.2}s infinite` }}/>)}
                    </div>
                  )}
                  {brainAnswer && (
                    <pre style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                      {brainAnswer}
                    </pre>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input
                      placeholder="Ask a follow-up question..."
                      onKeyDown={e => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { askBrain(e.currentTarget.value.trim()); e.currentTarget.value = ''; } }}
                      style={{ flex: 1, height: 30, padding: '0 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, fontSize: 11, color: 'rgba(255,255,255,0.6)', outline: 'none', fontFamily: 'monospace' }}
                    />
                    <button onClick={() => { setActiveQ(''); setBrainAnswer(''); }}
                      style={{ padding: '0 10px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}>
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {/* Knowledge section content */}
              {activeSection >= 0 && filteredSections[activeSection] && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span style={{ fontSize: 20 }}>{filteredSections[activeSection].icon}</span>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
                      {filteredSections[activeSection].title}
                    </h2>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {filteredSections[activeSection].items.map((item, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, padding: '10px 14px',
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 10, alignItems: 'flex-start',
                      }}>
                        <span style={{ color: '#6366f1', fontSize: 11, marginTop: 2, flexShrink: 0 }}>›</span>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                  {/* Ask Brain about this section */}
                  <button
                    onClick={() => askBrain(`Regarding "${filteredSections[activeSection].title}" on ${pageData.title}: ${filteredSections[activeSection].items[0]?.slice(0, 80)}... Can you give me specific, actionable next steps for my project?`)}
                    style={{
                      marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                      background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                      borderRadius: 8, cursor: 'pointer', color: 'rgba(165,180,252,0.7)',
                      fontSize: 10, fontFamily: 'monospace',
                    }}>
                    <Brain size={10}/> Ask Brain for specific steps on this
                  </button>
                </div>
              )}

              {/* Search results across all sections */}
              {search && (
                <div>
                  <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
                    SEARCH RESULTS FOR "{search}"
                  </div>
                  {pageData.sections.flatMap(s =>
                    s.items.filter(item => item.toLowerCase().includes(search.toLowerCase())).map((item, i) => (
                      <div key={`${s.title}-${i}`} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, marginBottom: 8 }}>
                        <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6366f1', marginBottom: 4 }}>{s.title}</div>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{item}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <style>{ORACLE_STYLES}</style>
    </>
  );
}

const ORACLE_STYLES = `
  @keyframes oracleIn    { from{opacity:0;transform:scale(0.95) translateY(-4px)} to{opacity:1;transform:scale(1) translateY(0)} }
  @keyframes bubbleIn    { from{opacity:0;transform:translateY(20px) scale(0.9)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes panelSlideUp{ from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes pulseGlow   { 0%,100%{box-shadow:0 0 16px rgba(99,102,241,0.5)} 50%{box-shadow:0 0 28px rgba(99,102,241,0.8)} }
  @keyframes dotPulse    { 0%,80%,100%{transform:scale(0);opacity:0.5} 40%{transform:scale(1);opacity:1} }
`;