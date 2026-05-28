# PROJECT_BRIEF — SEO Season · Quantum Intelligence Workspace

_Last updated: 2026-05-28 (Build 2 shipped). Re-upload at session start. Single source of truth for the Workspace architecture and build order._

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
