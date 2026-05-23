# SEO Season — Project Brief

**Maintained by:** Manav · **Last updated:** 2026-05-23 · **Live commit:** `467ebcf`

> **How to use this file:** Upload this at the start of every new Claude chat about SEO Season. It is the single source of truth for project state, working rules, voice, backlog, and in-flight context. Update at the end of each session.

---

## 1. Identity & Project

- **Owner:** Manav
- **Product:** SEO Season — a multi-tenant SEO platform with operator-grade intelligence
- **URL:** seoseason.com
- **Repo (public):** github.com/manav909/Manav-SEO
- **Local path:** `/Users/manav909/code/Manav-SEO`
- **Claude clone path (per session):** `/home/claude/Manav-SEO`
- **Brand line on documents:** "Manav S" is the headline; "SEO Season" is the supporting sub-brand

---

## 2. Product Vision (LOCKED — do not redesign)

**Character / voice of the platform:** JARVIS-meets-Vision. Honest, dryly intelligent, no sycophancy. Hard fact-check. Real business expectations, international clients. The platform never dresses synthesis as fact.

**Two operating modes:**

- **Casual** — calm contemplative reading. Centered, comfortable line lengths. Single column. Pick of the day. Manav reads, decides, moves on.
- **Pro** — operator-grade dense. Full-width 2-column grid (58/42). StatusStrip + ActionDeck + ProjectPulse. For when Manav is actively running the empire.

**Animation language:** Clean feather landing. Subtle breathing glows. No bouncing, no flash. Things settle in.

**Data sources:** Authentic only. GSC + GA4 integrated. Never fabricate metrics. Always show source + freshness.

**Native chat-first:** the chat input is the cockpit. Everything else is supporting context.

---

## 3. Hard Constraints (NEVER VIOLATE)

| Constraint | Detail |
|---|---|
| API function cap | **EXACTLY 12** files under `api/*.ts`. Never add a 13th. `api/lib/*` are utilities, not functions. |
| TS baseline | **26 errors** allowed (legacy files: `SeoEngine.tsx`, `src/pages/App.tsx`, `Build.tsx`, `Dashboard.tsx`, `Oval.tsx`). Don't introduce new ones. |
| Files | **Complete files only.** Never patches. Never partial diffs. |
| LLM model | `claude-sonnet-4-6` |
| Database access | Use `db()` from `api/lib/db.ts` (uses service key, bypasses RLS) |
| Error handling | Never swallow fetch errors. Surface them. |
| Deploy host | macOS, zsh shell |
| Production bundle | `grep -c 'throw new ReferenceError' dist/assets/index-*.js` must be `0` |

---

## 4. Stack & Architecture

**Stack:** Vite + React 18 + TanStack Query + Tailwind/shadcn + Supabase + Vercel (Hobby tier)

**The 12 API functions (immutable list):**
1. `task-engine.ts`
2. `intelligence.ts`
3. `playground-analysis.ts`
4. `control.ts`
5. `analysis.ts`
6. `algorithm-intel.ts`
7. `crawl.ts`
8. `run-analysis.ts`
9. `seo-agent.ts`
10. `launchpad.ts`
11. `auto-metrics.ts`
12. `fetch-site-metrics.ts`

**Engines under `api/lib/`** (utility modules, not function slots): ai-cache.ts, season-orchestrator.ts, season-llm.ts, season-llm-web.ts, season-pick-engine.ts, season-pipeline-runner.ts, season-llm-precomputes.ts, db.ts, and ~14 others.

**Frontend:**
- Router: `src/App.tsx` (36 routes). `src/pages/App.tsx` is **legacy/unused** — ignore.
- 42 pages total. Largest: DataRoom, BdePanel, AlgorithmIntel, Admin, Dashboard, Audit, Command.
- 6 React contexts: Auth, Project, Nav, Theme, Demo, Tour.
- Most pages are thin UI over `/api/task-engine` actions.

**Database (Supabase, ~50 tables in use). Core tables:**
- `projects` · `clients` · `metrics` · `audit_reports`
- `task_executions` · `task_requirements` · `kanban_tasks`
- `ai_content_cache` · `brain_learnings`
- `manavs_picks` (with `archive`, `connection score`)
- `project_knowledge_snapshot` (Block 2.13 corpus)
- `global_feed_items` (with enrichment columns from 2.13)
- `season_user_preferences` (Block 2.14)
- `staff_members` · `prospects` · `revenue_records` · `client_health` · `verification_queue`

**`brain_learnings` columns:** `id, project_id, card_type, card_title, what_worked[], what_missed[], redo_reason, improvement, context_summary, tags[], source, applied_count, created_at, updated_at`.

---

## 5. Shipped — Phase History

### Phases 1–20 (foundation, shipped earlier)

Setup, P0 bug fixes, Intelligence Playground recovery, PM Module (cards/strategy/agenda/pipeline), Client Reports, GSC/GA4 integration, Data Room V2, autopilot rules, Mission Control, Brand Studio H.0→H.6a, directives DSL, Recharts integration, DOCX/PDF export, investor bundle, time-scope picker, analytics intelligence (15 KPIs), what-if simulator, goal engine, strategy-to-PM bridge, provenance & diagnostics, resolution stores, project planning workspace, S.E.A.S.O.N. command surface, arc reactor (orb/modal/settings), awareness layer across 6 pages, action registry with permission gating, web search via Anthropic, end-to-end pipelines, forecast/monitor/escalation spine, pipeline dashboard with polling, step-by-step execution, campaigns + panels + reports + opportunities, per-artifact reports, Research pillar, alerts→opportunities unification, mid-pipeline resilience, Technical Audit pillar, Cluster Map pillar, Internal Linking pillar, Off-Page Strategy pillar, Living Overview LLM synthesis, Monitoring, Operator Inbox + Report Search.

### Phase 21 — Quality Foundation (active phase)

**Shipped to main (commit `467ebcf`):**

| Block | What |
|---|---|
| 2.5 | URL targeting + grounded chat with source citations |
| 2.6 | Strategic war room with three-tier intelligence + source citations |
| 2.7 | Adaptive war room (chat drives page, hero card, filter-on-type, inline campaign preview) |
| 2.8 | Wire ResponsePanel action buttons + pending confirm prompt + submitting indicators |
| 2.9 | Action ID aliases + label-refire fallback for unknown actions |
| 2.10 | Behavioral consolidation (unified runChatCommand, Escape handler, AnimatePresence) |
| 2.11 | Two-mode war room foundation (Casual/Pro), unified priority feed v2 from 9 sources |
| 2.12 | Strategist's Companion (Status Strip cockpit, Client questions LLM pre-compute) |
| 2.13 | **Manav's Pick Intelligence Engine** — persistent corpus + cross-connection + 5 role frames |
| 2.14 | Widget Gallery + right Drawer (4 tabs: Layout/Gallery/Saved/Preferences) + density prefs |
| 2.15 | Layout polish (Pro full-width container, real top bar, tighter status strip) |
| 2.16 | Remove floating gear + Behind-the-scenes; Settings moved to drawer; Pick Engine controls as 4th tab |
| 2.17 | Readable chat output (inline markdown parser; **bold**, numbered sections, em-dash lists, In Short callout) |
| 2.18 | Remove sticky in-page top bar colliding with global SmartTopBar; pt-10 to outer wrapper |
| 2.19 | Strip cite XML tags before typewriter; numbered sections as headers; standalone bold as h4 |
| 2.20 | Hide AIConcierge on Season pages (/command, /data-room, /bde-panel, etc.); widen Casual max-w-6xl |
| 2.21 | JARVIS daily mood freshness (8 variants per slot, day-of-week mornings, daily seed) |
| **2.22** | **Gossip Partner ticker** — continuous 14s cross-fade, ~85 signal-aware lines, pause on hover, shuffles on path change |

### Rejected / reverted (do not reship)

- **Block 2.23** Casual full-width — Manav: "stop expanding"
- **Block 2.24** Persistent left rail — overlapped Pro mode content, abandoned mid-build

---

## 6. P0 Platform Bugs (UNRESOLVED)

These are the highest-leverage bugs. Address before more features.

1. **`task-engine.ts` duplicate "requirements" stub.** Empty handler at line ~2420 shadows the real one at ~3122. Causes 300-second hang when TaskExecutor calls "requirements" action.
2. **`Audit.tsx` calls `/api/audit-orchestrator`** which is `.disabled` (returns 404). Audit flow broken.
3. **`check_system_health`** action has no handler in `task-engine.ts`.
4. **`get_revenue_records`** action has no handler in `task-engine.ts`.
5. **`extractAndSaveLearning`** in `api/lib/ai-cache.ts` is imported by seo-agent / crawl / algorithm-intel / run-analysis but **never called** — dead code. The live mechanism is each handler's inline `saveLearning` HTTP-POST to `/api/task-engine` action `save_learning` with a regex classification gate. Multiple divergent implementations exist.

---

## 7. Backlog (Prioritized)

### A. Critical platform (do first)
1. Fix the 5 P0 bugs above.

### B. Engine quality
6. Hallucination guards + quality pass for 4 pillars: `cluster_map`, `internal_linking`, `off_page`, `monitoring`. Quality reviews documented in older transcripts; improvements never shipped.
7. Living Overview cron + URL fit nightly — Phase 20 work never wired to a scheduler.

### C. Pick / Ticker (deferred from recent blocks)
8. LLM-generated ticker lines pulling from Brain Learnings + Manav's Pick corpus.
9. Feedback loop (👍/👎) on ticker lines.
10. Tone preference toggle (witty / motivational / serious) in drawer prefs.

### D. Pro mode features
11. Multi-turn chat scrollback in Pro mode.
12. PDF export of Pro mode view.
13. Per-project widget layout preferences (currently global).
14. Drag-and-drop widget reordering (currently ↑↓ arrows).

### E. Mobile
15. Mobile bottom-sheet drawer variant for CommandDrawer.
16. Mobile-specific layout for Command page.

### F. External integrations / engine work
17. SerpAPI for competitive radar (Block 4 plan).
18. `decisions_avoided` dedicated surface (Block 5 plan).
19. Client PDF export per pillar (Block 6 plan).
20. Block 3 — pillar engine hallucination guards (overlaps with #6).

### G. Layout (PAUSED — do not touch without explicit "yes, layout")
21. Casual mode empty left space when sidebar is closed.
22. Left rail attempt — needs redesign that respects Pro mode existing content (Block 2.24 v1 was wrong).

---

## 8. Working Style — How Claude Should Operate

**At session start, always:**
1. Ask Manav to upload this PROJECT_BRIEF.md if not already provided.
2. Re-clone the repo: `rm -rf Manav-SEO && git clone -q https://github.com/manav909/Manav-SEO.git`
3. `cd Manav-SEO && npm install --silent`
4. Confirm baseline: `git log --oneline -3`, `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c 'error TS'` (expect 26), `ls api/*.ts | wc -l` (expect 12).

**Before changing code:**
- READ the existing code thoroughly. Use `view` to see context, not just `grep`.
- Ask before adding new files or components. Especially for layout work.
- Map out what the change touches across components before writing.

**After every change, before claiming done:**
- `npx tsc --noEmit -p tsconfig.app.json | grep -c 'error TS'` — must be 26 (or whatever the baseline is)
- `npx vite build` — must succeed
- `grep -c 'throw new ReferenceError' dist/assets/index-*.js` — must be 0
- Pick 3–5 distinctive content phrases from the change and `grep -q` them in `dist/assets/index-*.js` to confirm they shipped
- Stage files to `/mnt/user-data/outputs/<block-name>/`
- Call `present_files`

**Delivery format:**
- One paste-able deploy command block at the end
- Plain ASCII commit messages in single quotes (zsh chokes on `#`)
- Use `&&` chaining
- `mkdir -p` for new dirs
- `--no-verify` on commits
- SQL migrations applied in Supabase Dashboard FIRST, before pushing code

**Honesty rules:**
- Own mistakes plainly. Don't claim "fixed" without verifying.
- Distinguish "what I tried" from "what's working."
- Surface uncertainty. If unsure, say so before acting.
- Never bounce between extremes — read the code, then change it once correctly.
- If a force-push is needed, push an empty commit afterwards (`git commit --allow-empty`) to guarantee Vercel rebuilds.

---

## 9. Voice & Ethics

**For Claude in conversation with Manav:**
- JARVIS-meets-Vision: honest, dryly intelligent, no sycophancy.
- No false certainty. No "definitely fixed!" without proof.
- Push back when Manav is wrong — but with reasoning, not stubbornness.
- Brief is good. Manav's time is real.
- Don't write 3 paragraphs when 5 sentences will do.

**For Claude generating content inside SEO Season (client-facing pillar reports, briefs, etc.):**
- Quality top-notch, hard fact-checked, no synthesis dressed as fact.
- Authentic sources only. Cite GSC/GA4 with timestamps.
- If a number is uncertain or sparse, say so. Don't smooth over.
- International business audience. Real expectations.
- Operator-grade dense in Pro, calm contemplative in Casual.

---

## 10. Session Handoff Protocol

**At session end, Claude should propose updates to this brief in the form:**

```
### Session N+1 updates to PROJECT_BRIEF.md

**Shipped this session:**
- Block X.Y — <one-line description>

**In flight (uncommitted / mid-build):**
- <thing>

**Rejected / reverted:**
- <thing> — reason: <reason>

**Backlog additions:**
- New item: <description>

**Backlog removals (completed):**
- Item #N

**Open questions for next session:**
- <question>
```

Manav then either copies these into the brief or asks Claude to regenerate the brief.

---

## 11. In-Flight State (as of 2026-05-23)

**Current main:** `467ebcf` (Block 2.22 Gossip Partner ticker)

**Active work paused:** None — Manav explicitly asked to stop layout iteration and triage backlog instead.

**Decision points open:**
- Where to spend next session (backlog item to pick)
- Whether to add LLM-curated ticker content (Backlog #8) before or after fixing P0 bugs

**Manav's stated current concern (this session):**
- Chat-length anxiety → addressed via this brief + auto-memory updates
- Did not want any more code touches until backlog is triaged and next focus is agreed

---

## 12. Reference Documents Manav Holds

- **`ARCHITECTURE.md`** — full line-by-line architecture deep-dive (all 12 API handlers, 22 api/lib engines, 42 pages, contexts, bugs). Older than this brief but more granular for codebase reference. Re-upload at start of architecture-heavy sessions.
- **`PROJECT_BRIEF.md`** — this document. The cross-chat memory bridge.

---

*End of brief. Update timestamp + commit at top of file whenever this is regenerated.*
