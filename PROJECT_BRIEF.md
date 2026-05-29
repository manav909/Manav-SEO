# PROJECT_BRIEF — SEO Season · Quantum Intelligence Workspace

_Last updated: 2026-05-28 (Builds 3c + 5 shipped). Re-upload at session start. Single source of truth for the Workspace architecture and build order._

---

## 0. Project constants (do not drift)
- Repo: github.com/manav909/Manav-SEO · local: /Users/manav909/code/Manav-SEO
- Deploy: macOS zsh — download from present_files, `cp ~/Downloads/file` then git add, commit --no-verify, push. One && chain.
- SQL migrations: run in Supabase Dashboard FIRST, before code push.
- Working model string: claude-sonnet-4-6 (others 404 / return empty).
- Verify-before-done (hard): per-file esbuild compile, full `npx vite build` green, no backspace chars after heredoc, markers in bundle, NO hardcoded project values (multi-tenant audit).
- Voice: JARVIS-meets-Vision. Honest, no fluff, own mistakes, never claim fixed without verifying. No synthesis as fact; verified data only; unproven = open question; forecasts are ceilings with sourced benchmarks.
- MULTI-TENANT, ZERO HARDCODING (non-negotiable): 100s of projects. Every project-varying value flows through as runtime data. No literal domains/paths/ids/scenarios. No patches; complete files.

---

## 1. THE VISION (locked)
Goal-driven intelligence console. One project Workspace = single destination. Three layers, data flows forward, never discarded:

DEEP STEPS (gather) -> PANEL (frame: scenarios + per-role Qs, with Manav gate + rounds) -> PILLARS (scientists: solve, fully sourced)

- Deep Steps = separate modules. Gather verified data EXHAUSTIVELY at full integration depth; tag every fact {value, source, fetched_at}; emit BOTH structured evidence AND a downloadable 100%-sourced report; flag "worth deeper" for the panel. No analysis.
- Panel = role discussion (Senior DMS, Client, Content Writer, PM, Brand, Investor) over evidence -> SCENARIOS + per-role QUESTIONS tagged to pillars + cross-checks. Round 1 runs, STOPS at Manav gate. Manav adds scenario/context/data -> RE-RUN round 2 (round1 + input, non-destructive) OR RELEASE to pillars. Manual release only. Durable across sessions, versioned by round. Downloadable Panel Document.
- Pillars (scientists) = self-sufficient. Dual-path: A = answer panel Qs; B = Manav points at bare target (new pages/ad-hoc/his data, NO panel). Gather fresh-when-needed, answer every Q with INLINE source citations, live status. Fill gaps themselves. Forecasts use SITE'S OWN CTR curve.

---

## 2. GOAL SYSTEM (organizing principle — confirmed)
Goal selected in Workspace CONFIGURES the entire run (steps, depth, panel framing, pillars).
- Composable: goals declare evidence NEEDS. 2+ goals = UNION (deduped). Custom = pick needs directly. Step-config COMPUTED from union. Not a fixed enum->config.
- Config control = level (b): auto-smart-default steps+depth, but SHOW config, allow toggle steps + adjust depth before run.
- Dependency transparency: each goal declares data deps; UI shows satisfied-by-existing (GSC/GA4/SerpAPI/CrUX) vs needs-new-integration. Manav activates or runs "existing-tools mode" with honest note. NEVER silently synthesize.
- Documents in folders by goal/run, filterable.

Taxonomy + dependencies:
- Keyword Ranking — existing tools. None new.
- Page Growth — existing tools.
- Traffic Growth (commercial/informational/local/branded) — existing + GA4 value (have).
- Conversion — GA4 conversion config IN GA4 (not new integration); else sessions/engagement only.
- Authority & E-E-A-T — needs BACKLINK source (Ahrefs/Majestic/Moz API). Without: SERP-derived only, stated. Activate when built.
- Topical/Content Authority — existing (SERP+crawl gaps); richer with backlinks.
- Combinations (2+) + Custom — via composition.

---

## 3. BUILD ORDER (confirmed)
Build 1 — Goal infrastructure [SHIPPED 2026-05-28]: composable goal definitions (api/lib/workspace/goals.ts: GOAL_DEFS, STEP_DEFS, DATA_SOURCES, composeRunConfig, goalCatalog); goal-selection+config UI in Workspace.tsx (multi-select goals/custom, computed config, step toggles+depth shown, dependency-surfacing satisfied-vs-needs-activation); document run-folder label; CTR-curve bug FIXED (impression-weighted). Migration: workspace-build1-migration.sql adds goal_ids + run_config to workspace_runs. New actions: ws_goal_catalog, ws_compose_config; ws_create_run now takes goalIds/customLabel/stepOverrides; wsRunDeepSteps honors enabled steps; panel uses composed framing.
Build 2 — Traffic full depth [SHIPPED 2026-05-28]: 6 new deep steps in api/lib/workspace/deep-steps/traffic-steps.ts (query_landscape, onpage_audit, core_web_vitals[CrUX], internal_link_graph, engagement_value[GA4], trajectory[metrics_snapshots diff]) — each exhaustive, sourced, downloadable; wired into wsRunDeepSteps gated by isEnabled. ALL 7 PILLARS now in pillar-scientist.ts (INTERROGATIONS map w/ step_keys + default_questions per pillar). Pillars now CONSUME stored step evidence (Path A via loadStepEvidenceForPillar reading step_reports) and fall back to fresh gather for visibility (Path B); other pillars require deep steps first (no synthesis). UI: all 7 pillars enabled, Solve-all button (solves run_config.pillars or all 7, skips solved). No new migration (uses existing step_reports + seo_campaign_reports).
Then: goal by goal; shared infra built once in Build 1, reused. Infra-first avoids retrofit rework across 6+ goals.

---

## 4. WHAT EXISTS NOW (approved Visibility slice — shipped, working)
- Tables (migration provided, Manav runs): workspace_runs, step_reports, panel_sessions (workspace-migration.sql).
- api/lib/workspace/: llm.ts (model+timeout+JSON repair repairTruncatedJson/parseJsonResponse); shared.ts (SourcedFact, loadGsc, siteCtrCurve [HAS BUG S5], fetchPageFacts, resolveTargetUrls, fetchHtml); deep-steps/gsc-visibility.ts (exhaustive GSC + CTR curve + live indexation crawl); deep-steps/competitor-intel.ts (SerpAPI + LIVE competitor page fetch — STRONG, keep); panel-engine.ts (runPanelRound r1/r2 non-destructive, renderPanelDocument); pillar-scientist.ts (solvePillar dual-path, Visibility done, inline sourcing, persists to seo_campaign_reports generated_by manual, report_kind deep_analysis w/ manual_refresh fallback, project_id REQUIRED NOT NULL); routes.ts (handleWorkspace: ws_create_run/run_deep_steps/run_panel/release_to_pillars/solve_pillar/get_run).
- Wiring: task-engine routes ws_*; api.ts ws* client fns; App.tsx /workspace; PortalNav "Intelligence Workspace" (Delivery group, FlaskConical icon).
- src/pages/Workspace.tsx — connected screen: flow ribbon (Deep Steps->Panel->Pillars->Documents), step cards (expand+download), Panel (scenarios, per-role Qs, Manav gate, round2/release), pillar grid (solve+status), documents (copy/download). Dark cyan operator aesthetic.
- LIVE TEST (Sleep Land 2026-05-28): both steps ran, real sourced reports. Competitor intel verified-good (maxandlily 1758 words+schema vs site, real PAA). CTR curve broken (all 0% — the bug).

---

## 5. KNOWN BUGS / MUST-FIX
- CTR-CURVE BUG [FIXED 2026-05-28]: siteCtrCurve now impression-weighted = sum(clicks)/sum(impressions) per position bucket, skips zero-impression pairs. Report table shows CTR(weighted)/Impressions/Samples.

---

## 6. DEPTH GAP [LARGELY CLOSED in Build 2]
GA4 (engagement_value step), CrUX (core_web_vitals step), wrong-page + high-impr-low-CTR queries + PAA/AI-Overview landscape (query_landscape step), internal link graph (internal_link_graph step), trajectory vs metrics_snapshots (trajectory step) — ALL now built. REMAINING for later: deep steps don't yet branch their pulls by traffic SUBTYPE (commercial/informational/local/branded) — currently goal framing handles subtype at panel level only; authority_signals step still needs backlink API (not built, traffic doesn't need it). Conversion VALUE: GA4 step pulls sessions/engagement/bounce/conversions; monetary value needs GA4 conversion config.

---

## 7. ACCEPTANCE BAR (per lens, every pillar)
Client: grounded forecast from OWN CTR curve. DMS: verified competitor comparison via fetched pages. Writer: PAA/intent. Dev: live indexation/HTTP/canonical/noindex (done). PM/Investor: quantified effort/impact/confidence + trajectory vs metrics_snapshots. Every claim inline-sourced. No hardcoding. Build green.

---

## 8. OPEN DECISIONS (awaiting Manav)
- CONFIRM: Build 1 (goal infra + CTR fix) first with Traffic as first goal on it — vs finish Traffic standalone then retrofit. (Recommended: infra-first.)
- Future: Workspace REPLACES campaign-drawer pillar section, or links to it? Decide post-validation.

---

## 9. SESSION RITUAL
Re-upload this + ARCHITECTURE.md at session start. Re-clone repo; git pull main; build+verify in working dir; Manav deploys. Never claim done without end-to-end verification. When a DB write fails silently, get the EXACT error (toast or direct SQL insert test) before theorizing — that single fact ends guessing (lesson: project_id NOT NULL + report_kind/generated_by CHECK constraints caused days of blind patching).


Build 3a — Pillars with a real toolkit [SHIPPED 2026-05-28]: solvePillar is now an Anthropic tool-use loop. Per-pillar declared toolkit (UNIVERSAL_TOOLS = fetch_page + read_other_pillar_report, plus pillar-specific: fetch_serp, get_gsc_for_query_or_page, get_ga4_for_page, get_crux_for_page, get_snapshot_history). Budgets: 8 target tool calls / 12 hard cap / 180s wall-time per pillar. Status updates show each tool call live ('tool 3/8: fetch_page(...)').

Build 3b — Solve-all visibility + Stop [SHIPPED 2026-05-29]: Live queue UI (done/running/pending chips), 2s polling of pillar_status surfaces "tool 3/8: fetch_page(...)" as the loop runs, Stop button cancels remaining pillars (in-flight one finishes). New routes: ws_cancel_run, ws_poll_status.

Build 4 — Report readability + tone [SHIPPED 2026-05-29]: Decision-first pillar schema (priority_actions field added at top, separate from answers). Pillar prompts rewritten — "scientist/lab" stripped from all output, calmer professional tone. New "exhaust alternatives" rule: when primary tool returns null, scientist must try ≥3 alternative verifications (adjacent inputs, substitute tools, sibling pillar reports) before declaring a gap. Pillar renderer redesigned: "What to do" → "What we found" → "Context" → "Detailed findings" → "Still to verify" → "90-day plan" → "Sources used". Role chips moved from screaming caps prefixes to quiet metadata tags. Panel renderer regrouped questions by pillar (with asking role as quiet tag) instead of role-grouped. Self-identifying document titles in collapsed DocCard rows ("On-Page Health — Findings · 29 May"). 'Pillar findings' replaces 'Pillar scientists' in UI section heading. Branded HTML export inherits the new structure via mdToHtml. NOT YET done: stakeholder export reportExport.ts could surface priority_actions even more prominently visually in HTML (today renders sections as-is). After running, judge whether priority_actions visibility is enough; if not, separate styling pass.


Build 3c — Project context + missing perf tools [SHIPPED 2026-05-29]: PROJECT CONTEXT block injected at top of every pillar user prompt — states project_domain + full target URLs explicitly so model never hallucinates hostnames (fixes example.com bug in Technical Performance report). fetch_page dispatcher rejects placeholder hostnames (example.com / example.org / test.*) with retry hint. fetchCrux extended to accept origin (https://www.<domain>) for domain-wide field data when URL-level returns null — CrUX body switches between url: and origin: accordingly. New tool inspect_html_performance_signals: returns page bytes/KB, render-blocking scripts in <head>, external script total, stylesheet/inline counts, viewport meta presence, total/lazy/eager images, likely LCP image candidate w/ dimensions & load mode, preload directive count. Allowlisted to technical_performance and on_page_health. All expert_role strings stripped of 'scientist' → 'specialist'.

Build 5 — Pillar→Panel escalation loop [SHIPPED 2026-05-29]: Pillar JSON schema adds escalations: [{question, to_roles[], why}] field — for genuine judgement questions distinct from data gaps. Pillar renderer adds "Questions back to the panel" section. Migration workspace-build5-migration.sql adds escalations_json jsonb column to seo_campaign_reports (insert path is graceful if column not yet present). UI: each solved pillar card shows escalation count badge ("3 for panel" in amber). Pillar section header gets a "Take N to panel" button when totalEscalations > 0. New action ws_take_escalations_to_panel: aggregates latest-per-pillar escalations, formats them as manav_input for a new panel round, advances round number, runs panel. Closes the iterative quality loop: pillar gathers + analyses → flags judgement questions → panel discusses + refines → release → pillars re-solve with new framing.


Build 6 — Panel as tool-using analyst + versioned step reports [SHIPPED 2026-05-29]: Migration workspace-build6-migration.sql adds version int + triggered_by text columns to step_reports plus idx_step_reports_run_step_version. Step writers (upsertStepReport, recordStepFailure, recordStepSkipped) rewritten as version-bumping append (graceful fallback to upsert if migration not yet applied). All step_reports reads (wsGetRun, loadStepEvidenceForPillar in pillar-scientist, loadStepEvidence in panel-engine) updated to filter to latest version per (run_id, step_key). wsGetRun additionally returns all_versions[] per step for history-on-demand UI. runPanelRound refactored from single LLM call into Anthropic tool-use loop matching the pillar-scientist pattern. Panel toolkit (PANEL_TOOL_DEFS): gather_more_gsc_visibility, gather_more_competitor_intel, gather_more_onpage_audit, gather_more_query_landscape (each writes new step version with triggered_by=panel:r{round}); spot tools fetch_page, fetch_serp, get_gsc_for_query_or_page, get_ga4_for_page, get_crux_for_page. dispatchPanelTool enforces 'reason' field ≥10 chars on every gather_more; placeholder host rejection; project context injected at top of every panel prompt. Budgets: PANEL_MAX_TOOL_CALLS=5 target / 8 hard cap / 180s wall-time / 11 max loop turns. onStatus callback threaded from wsRunPanel → runPanelRound → dispatchPanelTool → writes pillar_status; existing 2s UI polling picks up panel progress automatically. Workspace step cards show v{n} chip when version>1 (cyan, tooltip shows triggered_by); expanded card shows "Evidence history: v1 · 29 May, v2 · panel:r2 · 29 May" line above markdown.

Build 7 — Within-project learning [PLANNED, not yet built]: Track per-project: which panel tools got called, which escalations recurred, which step extensions yielded useful evidence. Store as learned_signals(project_id, signal_type, signal, weight, last_seen). Next run for same project: surface as "based on prior runs, also gather X" at run-start (operator can accept/decline). Strictly project-scoped, no cross-project leak.

Build 8 — Cross-project goal evolution [PLANNED, not yet built]: Aggregate Build 7's signals across all projects (anonymised — pattern only, no project-specific data). Goal definitions get auto-updated default configs based on what works. Manual approval before any default changes apply. Operator stays in control of goal taxonomy.

Build 9 — Current-state research as goal-startup step [PLANNED, not yet built]: Each goal grows a current_landscape deep step that runs first: pulls verified live sources for the goal's domain (algo updates, current SERP behaviour, recent Google guidance, AI Overview prevalence). Sourced citations on every claim, dated, treated as evidence like everything else. Makes the system "aware of the changing internet" — honestly, with sources, not from training data.


Build 6 patch — panel timeout fix [SHIPPED 2026-05-29]: Symptom: 'Could not run panel — Panel returned empty (LLM timeout or error)' with Vercel log [workspace/panel-r2] exc This operation was aborted (timeout 150000ms). Root cause: panel's first tool-use call inputs (~100KB of evidence + prior output + escalations + 9 tool defs) plus tool-use reasoning overhead exceeded the 150s wrapper timeout. Three coordinated fixes: (1) panel per-call timeout 150s → 300s aligned with Vercel function maxDuration:300; (2) PANEL_TOTAL_BUDGET_MS 180s → 270s wall-time; (3) skimStepReportForPanel(md, maxLen=6000) helper added — strips per-page markdown table rows from each step's evidence before passing to panel, keeping headlines + state-of-play + worth_deeper flags only. Pillars still receive full unskimmed evidence via loadStepEvidenceForPillar; only loadStepEvidence (panel-side) applies the skim. Realistic step report compresses ~68% — combined with compact JSON.stringify (no pretty-print) for prior output, panel's first-turn user message drops from ~100KB to ~40-50KB, well under what the model can process in under 60s. Skim auto-marks omitted rows: '…(19 table rows omitted from panel view; full detail in pillar evidence)…' so the panel knows detail exists if needed.

Build 10a — Client Report pillar [SHIPPED 2026-05-29]: New "Client Report" pillar specialised in communication, not investigation. Distinct from the 7 analytical pillars. Consumes workspace evidence (latest-version step reports + all panel rounds + all solved pillar findings for the run window — never feeds prior client reports back in) and produces a client-ready deliverable shaped by the operator's per-report context. Lives at api/lib/workspace/client-report.ts (new file), exposed as ws_solve_client_report action; wsSolveClientReport handler in routes.ts. UI: a separate card below the 7-pillar grid in the Pillars section, with three fields: required context textarea, optional reference paste textarea (8KB cap), and mode selector (template / data / both) only shown when reference text is present. Multi-report semantics: every solve appends a new report_kind=deep_analysis row with pillar='client_report' — earlier reports stay in Documents so drafts can be compared. Hard rules in system prompt: every claim sources back to workspace evidence or operator-provided reference; no invention, no synthesis-as-fact; if context asks for unverifiable claims, refuse or flag transparently; operator_notes JSON field captures concerns visible only to operator (appended at end of body_md as "Operator notes (internal — not for the client)"). Default shape if context is thin: exec summary + 3-5 sourced findings + 3-5 prioritised actions + 90-day plan + sources. Skim helpers compress per-pillar bodies (5K cap each) + per-panel (3.5K) + per-step (3K) so the LLM input stays manageable. Graceful row insert with fallbacks for escalations_json column missing AND for pillar CHECK constraint rejecting 'client_report' (returns a clear error telling the operator to drop/extend the constraint). Live status streaming via the existing pillar_status mechanism. Live polling in UI shows "client_report: starting → composing the client deliverable → saving" during the call. PILLAR_LABEL updated to include client_report. Documents tab automatically renders client_report reports via the existing reports.map — same export and open-as-branded HTML controls.

Build 10b — File upload (PDF / DOCX / XLSX / CSV) [SHIPPED 2026-05-29]: Adds Supabase Storage integration + server-side parsers (pdfjs-dist/pdf-parse, mammoth, xlsx) so the operator can upload reference files instead of pasting text. Was deliberately deferred from 10a to keep that build scoped — parsing edge cases (encrypted PDFs, OCR for scans, complex spreadsheets) are real engineering. Build 10a delivers ~80% of value via the paste-text approach; 10b hardens the workflow once 10a is proven in real use.


Build 10b — File upload (PDF / DOCX / XLSX / CSV) [SHIPPED 2026-05-29]: Migration workspace-build10b-migration.sql creates storage bucket 'client-report-attachments' (private) + table client_report_attachments(id, project_id, run_id, file_name, content_type, size_bytes, storage_path, extracted_text, pdf_base64, parse_status, parse_note, created_at). New module api/lib/workspace/client-report-uploads.ts with parsers: PDF→passed natively to Anthropic as base64 document block (no server parse — handles scanned PDFs via Anthropic's own OCR); DOCX→mammoth converts to markdown; XLSX→SheetJS sheet_to_csv per sheet→formatted as markdown tables with 200-row cap; CSV→same markdown table treatment; .doc/.xls handled as best-effort by their modern counterparts. 10MB size cap server-side. Allowlist of mime types + ext fallback. Storage rollback on metadata insert failure (no orphans). New API actions: ws_cr_upload_attachment (base64 from browser), ws_cr_list_attachments, ws_cr_remove_attachment. solveClientReport extended to load attachments by id, fold extracted text into the prompt, accumulate PDF base64 strings as document blocks. When ANY attachment is a PDF, the LLM call bypasses llm() helper and goes direct-API with content blocks (docs before text per Anthropic guidance); otherwise text-only llm() preserved. UI: drag-drop zone OR pick-file button (multi-select supported); attached files list with parse_status indicator (green if ok, amber if scanned_pdf/empty/failed) and remove button per file; mode selector (template/data/both) now applies to ALL reference material (uploaded + pasted); textarea relabeled as "paste reference content directly" — alternative or supplement to upload. Live status updates: "uploading <file>" / "loading N attachment(s)" / "composing the client deliverable". Build 10a's placeholder text "PDF/DOCX/XLSX upload coming in Build 10b" removed.