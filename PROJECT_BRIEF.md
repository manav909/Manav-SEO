# SEO SEASON — Project Brief

**Maintained by:** Manav · **Last updated:** 2026-05-25 (Phase 17.5.6 — dashboard polling race + "Polling stopped" fix) · **Live commit:** `9936163` (Phase 17.5.5 counter drift). Phase 17.5.6 fixes a race exposed by Manav's screenshot showing the dashboard frozen at `00:01 — Polling stopped` with step 6 stuck "running" even though execution continued server-side. Two coordinated fixes: (1) `handleRefreshPipelineFromAudit` now calls `seasonPipelineRefreshFromAudit` (which flips run.status to 'retrying') BEFORE dispatching the dashboard-open event — previous order caused the dashboard's first poll to see stale 'failed' status and treat it as terminal. (2) `SeasonPipelineDashboard` polling now considers a run "really terminal" only when status is terminal AND no pending/running step rows exist — a run in 'failed' state with pending steps is mid-retry, not done.

> **How to use this file:** Upload at the start of every new Claude chat about SEO SEASON. Single source of truth for project state, working rules, voice, backlog, in-flight context. Updated at the end of each shipping turn.

---

## 1. Identity & project

- **Owner:** Manav
- **Product:** SEO SEASON — an SEO agency that operates on infrastructure Manav designed and ships himself
- **URL:** `seoseason.com`
- **Repo (public):** `github.com/manav909/Manav-SEO`
- **Local path:** `/Users/manav909/code/Manav-SEO`
- **Claude clone path (per session):** `/home/claude/Manav-SEO`
- **Brand line:** "Manav S" is the headline; "SEO Season" is the supporting sub-brand
- **Stack:** Next.js / Vite + React, Supabase, Vercel (region `iad1`), TypeScript, Tailwind, framer-motion
- **Production email:** `manav@seoseason.com` · CTA mailto: `hello@seoseason.com`

---

## 1.5. THE BACKBONE ROLE — Senior Digital Marketing Specialist (added 2026-05-24)

**This section overrides every other quality consideration in the brief. Read this on every session start.**

SEO SEASON is a commercial digital-marketing platform. Clients pay real money for results. Every output the product generates — pillar reports, audits, persona briefs, cannibalization findings, strategy plans, anything client-facing or operator-facing — must survive the lens of a Senior Digital Marketing Specialist who could be challenged by any expert in the field and would not flinch.

This role is the **backbone quality gate** for the entire product. It takes precedence over speed, scope minimisation, or "good enough."

### Hard rules (non-negotiable)

1. **No assumptions. No synthesis dressed as fact.** If a number, claim, or finding can't be traced to authentic data, it doesn't ship. Period.

2. **Fill data gaps with authentic tools — never with model inference.** When GSC has the answer, use GSC. When GA4 has it, use GA4. When a live crawl is the right source, run the crawl. When SerpAPI or another integration is required, integrate it. *Never* patch a data gap with a Claude best-guess.

3. **Every report and engine output must be source-traceable.** Every claim → cited source → confidence level. The canonical pattern lives in `intelligenceFabric.ts`:
   - `manual_user` = 98 · `user_comment` = 98 · `gsc_live` = 95 · `ga_live` = 95
   - `audit_run` = 88 · `crawl_jina` = 85 · `algorithm_intel` = 82 · `brain_learning` = 80
   - `intelligence_output` = 80 · `claude_inference` = 65 · `industry_pattern` = 45 · `unknown` = 30
   - All new code that emits data follows this pattern.

4. **PRE-DELETE CHECK before removing any feature, surface, or capability.** Before deleting anything, walk through:
   - Does this help the client?
   - Does this help an analyst review the work?
   - Is this necessary for delivering results?
   - Could a Senior DMS want to look at this?
   - If ANY answer is yes, **do not delete.** Annotate it, defer it, mark it `.disabled` with a clear restoration path — but don't kill it.

5. **Complete automation, not partial.** The product runs itself: daily cron pulls, recomputes, refreshes overviews, surfaces findings. Both Manav and the client can monitor every step end-to-end. No manual rituals to "kick" the system.

6. **Hard fact-check on every output.** If a metric is uncertain or sparse, the output says so loudly. "I don't have enough data to say X" beats "Here's my best guess at X" every single time.

7. **No overlooks.** Every detail covered. Every flag raised. Every edge case documented. Step-by-step automatic with authentic data — no synthesis hiding gaps.

### What "verified by Senior DMS" means in practice

Before claiming any backlog item done, run the work through these questions:
- Could a senior practitioner challenge any specific claim in the output? If yes, fix or remove the claim.
- Is every numeric value source-traced (table + timestamp, GSC pull, crawl ID, etc.)?
- If the data is sparse, does the output acknowledge that sparsity rather than smooth over it?
- Does the output give the client/operator a concrete next action, not vague hedging?
- Would I pay money for this output if I were the client?

### Commercial context (do not forget)

Real money is on this product. Clients are paying for honest, defensible, result-oriented work. Trial-to-paid conversion depends entirely on the quality of what they see. Hallucinations or "AI assumptions" in client-facing output would damage trust irreversibly. **Every shortcut that "would be faster" but reduces traceability is wrong.**

### Integration leverage targets (use these before any inference)

| Source | What it answers | When to leverage |
|---|---|---|
| **GSC** | rankings, queries, pages, impressions, CTR, position over time, query×page splits | every keyword/page intelligence claim |
| **GA4** | sessions, users, conversions, traffic source mix, device, geo, engagement | every traffic/conversion claim |
| **Live crawl (Jina)** | H1, meta, schema, on-page facts | every "what does this page actually contain" question |
| **algorithm-intel** | algorithm update tracking, scoring shifts | every "what changed" question |
| **brain_learnings** | cross-project pattern accumulation | precedent / "have we seen this before" questions |
| **SerpAPI** (Block 4 plan) | competitive radar, SERP feature analysis | competitive claims |
| **Manav comments / user_comment** | strategic intent, business context, brand voice | qualitative grounding |

When a missing integration would unlock honest answers (instead of synthesised ones), surface it as a backlog item — don't paper over with inference.

### 2.1 API layer (HARD LIMIT 12 functions, never add new `api/*.ts`)

| # | File | Purpose |
|---|------|---------|
| 1 | `task-engine.ts` | Action router, save_learning gate, lead capture |
| 2 | `intelligence.ts` | Streaming intelligence, source confidence |
| 3 | `playground-analysis.ts` | Guest demo analysis |
| 4 | `control.ts` | Admin / staff actions |
| 5 | `analysis.ts` | Per-deliverable orchestration |
| 6 | `algorithm-intel.ts` | Algorithm tracking |
| 7 | `crawl.ts` | Jina-based site crawl |
| 8 | `run-analysis.ts` | Audit orchestration (Audit.tsx target) |
| 9 | `seo-agent.ts` | Agent-mode orchestration |
| 10 | `launchpad.ts` | Launchpad UI |
| 11 | `auto-metrics.ts` | Background metrics |
| 12 | `fetch-site-metrics.ts` | On-demand site metrics |

`api/lib/ai-cache.ts` is a shared utility, **not** a function slot. `api/lib/*` is allowed; `api/*.ts` is at the wall.

### 2.2 DB schema (Supabase, ~50 tables)

Core: `projects`, `clients`, `metrics`, `audit_reports`, `task_executions`, `task_requirements`, `ai_content_cache`, `brain_learnings`, `kanban_tasks`, `staff_members`, `prospects`, `revenue_records`, `client_health`, `verification_queue`, plus ~36 others.

`brain_learnings` columns: `id`, `project_id`, `card_type`, `card_title`, `what_worked[]`, `what_missed[]`, `redo_reason`, `improvement`, `context_summary`, `tags[]`, `source`, `applied_count`, `created_at`, `updated_at`.

### 2.3 Frontend

**49 pages** in `src/pages/`. Router is `src/App.tsx` with **54 routes**. `src/pages/App.tsx` is legacy/unused (114 lines, not in router). Six React contexts: Auth, Project, Nav, Theme, Demo, Tour. Largest pages by LOC: DataRoom (2,505), BdePanel (2,427), Command (2,076), AlgorithmIntel (1,788), Admin (1,449), Dashboard (1,150), Audit (1,130), BrainLearning (934), Intake (887), GuestTour (863), ClientComms (751), ClientWorkspace (673). Most pages are thin UI over `/api/task-engine` actions.

### 2.3.1 Backend engines

**`api/lib/` has 96 files** (engines, helpers, runners). Old brief said 22 — the directory has grown substantially. Pillar engines specifically: `seo-cluster-map.ts`, `seo-internal-linking.ts`, `seo-off-page.ts`, `seo-monitoring.ts`, `seo-technical-audit.ts`. Plus `seo-research`, `seo-campaign-engine.ts`, `seo-campaign-routes.ts`, `season-pipeline-runner.ts`, `client-showcase-engine.ts`, `serpapi.ts` (added 2026-05-24 — SerpAPI integration foundation for SERP feature verification), and many more.

### 2.3.2 Disabled API endpoints

Two functions sit alongside the 12 active ones, with `.disabled` extension:
- `api/bridge.ts.disabled`
- `api/market-researcher.ts.disabled` ⚠️ still referenced in `src/lib/runtimeCompiler.ts:57` and an error message at line 188. Runtime call would 404.

### 2.4 Auto-learning

`extractAndSaveLearning` was the original "Manav Brain vision" (called from 9 points) but never fully wired. **Live mechanism**: each handler's inline `saveLearning` HTTP-POST to `action:save_learning` on `/api/task-engine`, which runs a regex classification gate. Multiple divergent implementations exist.

---

## 3. P0 bug status (verified 2026-05-23)

| Bug | Status |
|-----|--------|
| `task-engine.ts` duplicate empty `requirements` stub | ✅ Fixed |
| `Audit.tsx` calling `/api/audit-orchestrator.disabled` | ✅ Fixed (now `/api/run-analysis`) |
| Missing `check_system_health` + `get_revenue_records` handlers | ✅ Fixed |
| `extractAndSaveLearning` dead imports | ✅ Verified clean 2026-05-23 — zero references in algorithm-intel / seo-agent / crawl / run-analysis. Function lives in `ai-cache.ts` with one active caller at `task-engine.ts:2679`. |

**Verification rule (learned 2026-05-23)**: brief and memory CAN go stale silently. Before proposing work on any "documented bug," verify it in current main code first. Distinguish "noted in past sessions" from "verified to still exist." When documentation contradicts reality, surface the contradiction — never paper over.

---

## 4. Code rules (HARD)

1. **Complete files only — never patches.** Whole `.ts`/`.tsx` content, every time.
2. **Never add new `api/*.ts`.** At the 12-function ceiling.
3. **Never swallow fetch errors.**
4. **Read existing code BEFORE changing it.**
5. **Ask before adding new components/files.**
6. **Never claim "fixed" without verifying** — vite build green, TS=26 baseline, ReferenceError=0 in bundle, distinctive content markers grep'd present.
7. **Authentic sources only** — GSC + GA4 for metrics, no fake data, no simulated rankings.

---

## 5. Deploy workflow (CRITICAL)

Manav downloads files from `present_files` into `~/Downloads`, then pastes ONE `&&` chain `cp`'ing from `~/Downloads` to repo paths.

**Format**:
```
cd /Users/manav909/code/Manav-SEO && \
cp ~/Downloads/<file> <repo-path> && \
cp ~/Downloads/PROJECT_BRIEF.md PROJECT_BRIEF.md && \
git add <explicit list> && \
git commit --no-verify -m 'plain ASCII single-quote message' && \
git push origin main
```

**Rules**:
- Plain ASCII commit messages, single-quoted (NOT inline `#` — zsh chokes)
- `mkdir -p` for new dirs
- `--no-verify` to skip hooks
- SQL migrations applied in Supabase Dashboard FIRST, before code push
- If force-push: append empty commit (`git commit --allow-empty`) — Vercel sometimes skips force-pushes
- After push: wait ~3 min for Vercel + CDN, then curl-verify marker. If stale: append source-touch trick `printf '\n// build:%s\n' "$(date -u +%Y%m%d-%H%M%S)" >> src/pages/Manifesto.tsx`
- **Vercel CDN edge cache TTL is ~15-20 min — be patient before assuming the deploy is broken**

**NEVER** use placeholder paths like `/path/to/outputs/`. Always `~/Downloads/<filename>`.

---

## 6. HARD RITUAL — every code-shipping turn

After delivering ANY build/block/deploy code to Manav, the SAME response also:

1. Regenerates `PROJECT_BRIEF.md` via `present_files`
2. Deploy command is a SINGLE `&&` chain covering BOTH code files AND `PROJECT_BRIEF.md` in one commit+push
3. NOT two separate commands. NOT optional. Don't ask.

---

## 7. Voice & character

**JARVIS-meets-Vision** — honest, dryly intelligent, no sycophancy.
- Hard fact-check, never synthesis dressed as fact
- Own mistakes plainly
- Never claim "fixed" without verifying
- Read existing code BEFORE changing it
- Ask before adding new components/files
- Pushback when Manav is wrong, with reasoning
- Never defensive when corrected

**Modes**:
- **Pro mode** = operator-grade dense
- **Casual mode** = calm contemplative

Animations like clean feather landing (FEATHER curve `[0.16, 1, 0.3, 1]`).

**Engine-room voice**: "They never sleep. They never drift. They never forget what they have seen."

---

## 8. Role-playing quality gates

For reports/briefs/strategies, run output through MULTIPLE role lenses sequentially — each catches different failure modes. Quality = surviving all relevant role critiques.

**Active roles**: Digital Marketing Specialist · Senior SEO Specialist · SEO Executive (junior) · Client · PM · Content Writer · Sales · Brand Specialist · Investor.

Manav names role(s) per task. **Default for pillar review** = Senior SEO + Client. Goal: protect client from bad decisions.

---

## 9. "Think like X" interpretation

- **Think like a senior engineer** = analytical depth, edge case scanning, architecture review
- **Think like a strategist** = positioning, narrative, competitive context
- **Think like a fact-checker** = web search current facts, cite sources, distinguish training-data from verified
- **Think like an operator** = what ships, what scales, what's accountable

Changes analytical lens, not just tone.

---

## 10. Operating philosophy

1. **Real money is on it** — commercial expectations, "good enough" not the bar
2. **Hard fact-check** = web search current facts, cite sources, distinguish training-data from verified
3. **Mistakes** = state what specifically went wrong, no deflection
4. **Pushback** when Manav is wrong, with reasoning
5. **Never defensive** when corrected
6. **Authentic sources only** (GSC + GA4 integrated)

---

## 11. Phase 21 + 22 state

**Live main HEAD before this turn**: `73d0302` (Cold open era-centered Arc Reactor framing)

**Shipped 2.13–2.22**: Pick engine · widget gallery + drawer · layout polish · gear removed · readable markdown chat · cite-tag strip · AIConcierge hidden on Season pages · JARVIS mood freshness · continuous ticker ~85 lines

**REJECTED / REVERTED**:
- Block 2.23 Casual full-width — "stop expanding"
- Block 2.24 left rail — overlapped Pro mode

---

## 12. Manifesto / The Method — current state

**Route**: `/manifesto` · **Entry**: emerald "The Method" pill in `Command.tsx` top bar (Book icon, always visible, before project-conditional pills). Tooltip: *"Open The Method — the SEO SEASON operating manifesto."* Localized as `nav_label` across 5 languages: EN `The Method` · HI `विधि` · ES `El Método` · FR `La Méthode` · DE `Die Methode`.

(Previously called "The Codex" — renamed 2026-05-23 because "method" reads more operator-grade and accessible, matches the JARVIS voice throughout the document, and signals what the click actually delivers: a documented operating method.)

### 12.1 Architecture — 29 files total

```
src/pages/Manifesto.tsx                   root orchestrator (~115 lines)
src/pages/manifesto/                      foundation + infrastructure (11 files)
  types.ts                                Lang, SeasonId, Season, ChapterDef, TFn, FEATHER
  copy.ts                                 5-language COPY (EN/HI/ES/FR/DE)
  seasons.tsx                             SEASONS tokens × 7 seasons
  chapters.ts                             15-chapter narrative manifest
  shared.tsx                              ChapterShell, ChapterHeader, Prose, Statement, FoundingQuote, TextReveal, CounterNumber, ScrollHint
  styles.tsx                              global CSS (~480 lines)
  AmbientCanvas.tsx                       7 distinct particle systems
  ProgressBar.tsx                         top rail hue-morphing scroll progress
  TopBar.tsx                              brand wordmark + language picker + close
  FloatingNav.tsx                         15 chapter dots, scrollspy-driven
  FooterMark.tsx                          closing brand line
  chapters/                               15 chapter files
    ChColdOpen.tsx                        Eternal Spring · Cold Open
    ChProblem.tsx                         Winter · Agency black-box pain
    ChVision.tsx                          Spring · Founding quote
    ChHowSearch.tsx                       Spring · Compounds vs dead grid
    ChPillars.tsx                         Summer · Five growing pillars
    ChJourney.tsx                         Summer · Day 0 to Month 12 timeline
    ChEngine.tsx                          Monsoon · V12 spec + Live Ops panel
    ChCompare.tsx                         Monsoon · Three-column comparison
    ChEthics.tsx                          Autumn · Will/won't constraints
    ChData.tsx                            Autumn · GSC + GA4 only
    ChWhom.tsx                            Harvest · Five client archetypes (localized 5 langs)
    ChFounder.tsx                         Harvest · Founder letter
    ChFAQ.tsx                             Harvest · Doubts, Resolved (tap-to-resolve)
    ChInPractice.tsx                      Harvest · 4:47 AM scenario (localized 5 langs)
    ChFuture.tsx                          Eternal Spring · Selective close + 2 CTAs
```

### 12.2 Seasons map

Winter (hue 210, snow) → Spring (142, leaves-up) → Summer (38, rays) → Monsoon (218, rain) → Autumn (22, leaves-fall) → Harvest (48, gold) → Eternal Spring (188, electric).

### 12.3 Motion grammar

FEATHER curve `[0.16, 1, 0.3, 1]`, soft springs (stiffness 60, damping 18), 1.0–1.6s durations, 3D mouse tilt on hero stage (perspective 1400).

---

## 13. Cold Open — current composition (SHIPPED 2026-05-23)

**Total reveal pacing**: ~14.7s title-sequence cadence (stroke-drawn signature extends ACT 5 by ~3.7s).

| Act | Timing | Element |
|---|---|---|
| 1 | 0.0s | Coordinate `—— SEO SEASON · VOL. I · 2026 ——` |
| 2a | 0.6s | S.E.A.S.O.N. letter-by-letter (peak 1) — interactive |
| 2b | 2.2s | Interactive recital (3 rows, hover-expandable) |
| 2c | 3.4s | Kicker: "An SEO agency that operates on its own infrastructure." |
| 2d | 3.9s | Sub: "Thinks in seasons. Verified in minutes." |
| 2e | 4.5s | Intel callout: "TWELVE ALWAYS-ON INTELLIGENCE ENGINES. CONTINUOUS DATA REFRESH. TOTAL AUDIT TRAIL." |
| 3 | 6.0s | Setup: *"AI changed search. The agency model built for the old era hasn't caught up."* |
| 4 | 7.0s | **Pivot** (dramatic hinge): ***"SEASON is what the moment demands."*** italic display cyan glow |
| 5 | 8.4s | `── by ──` small mark |
| 5 | 8.9s | **Signature: "Manav Sharma"** — SVG stroke-drawn in Pinyon Script with -2.5° slant (2.7s write, 0.7s ink soak, ~3.4s total) |
| 5 | 12.2s | Close: *"State-of-the-art for the era of AI search. He answers when called."* |
| — | 13.5s | Scroll hint `BEGIN ↓` |

### 13.1 Interactive recital mechanics

- Each non-dot letter of S.E.A.S.O.N. is a hover target with pair-id encoding: `S₁,E → se` · `A,S₂ → as` · `O,N → on`
- Hovered letter brightens + dims other letters
- Recital row matching hovered pair brightens + expands with SEO-context paragraph below
- Inactive rows dim to 0.38 opacity
- 150ms debounce on `null` set prevents flicker when moving between letters of the same pair
- Recital rows are themselves hoverable (not just the brand letters)
- Mobile: `onClick` toggles the same state (no hover on touch)

### 13.2 Why the reveal is era-centered, not credit-centered

The Arc Reactor parallel: Tony Stark didn't sell the Arc Reactor as "look what I invented." He sold it as "this is the future of clean energy" — a response to the demand of the time, state-of-the-art for the era, era-transforming because the world needed it. He was the builder who shipped the response. The credit lived in the *demand the work answered*, not in his cleverness.

Same here. The cold open names the era (AI changed search), names the gap (the agency model hasn't caught up), names SEASON as the response the moment demands, and gives Manav quiet builder attribution — not as "the architect of every system" but as the operator who built the response and now runs it. The work's positioning carries the weight; the builder gets quiet credit. The reveal lands as a craftsperson signing their work, not as a hero entering a stadium.

### 13.3 Animated Signature — implementation spec (SHIPPED 2026-05-23)

The Manav reveal at ACT 5 is an SVG signature that is **actually drawn**, not unmasked. The cinematic spec:

- **Font**: `Pinyon Script` from Google Fonts — a formal calligraphic typeface with thin, elegant, authoritative letterforms (Mr Dafoe / Allura / Allison / Sacramento as fallbacks). Sized small and refined: `fontSize: 92px` inside a 500×130 viewBox, scaled to `max-width: 340px` desktop / `280px` ≤880px / `230px` ≤560px.
- **Slant**: the SVG wrapper is rotated `-2.5deg` so the signature lands naturally angled — the way a real signature sits on paper, not perfectly horizontal.
- **Drawing technique**: the text is rendered with `fill: none` and a thin white stroke (`stroke-width: 0.85`, `stroke-linecap: round`, `stroke-linejoin: round`). SVG's `stroke-dasharray` (set to 3200, larger than total glyph path length) and `stroke-dashoffset` (animated from 3200 → 0) are then used to progressively trace each glyph outline from left to right — as if a pen is actually moving across the page. This is the same technique used in motion-graphics hand-drawn animations.
- **Writing curve**: `cubic-bezier(0.18, 0.35, 0.78, 1)` — a steady-paced writing rhythm with very gentle ends. **Writing duration**: 2.7 seconds — matches a deliberate signature signed by hand.
- **Ink soak**: after the strokes finish drawing, `fillOpacity` fades 0 → 0.96 over 0.7s (starts 0.15s before the stroke completes for natural overlap) and `strokeOpacity` softens 1 → 0.35 — together producing an "ink soaks into paper" effect. The final state is a filled, slightly slanted, signed name with a thin residual outline glow.
- **Ambient glow**: a double drop-shadow filter (4px close + 14px far) provides subtle ink-on-premium-paper luminance throughout.
- **No pen-tip dot**: the stroke is the pen now. Removed entirely.
- **Accessibility**: `role="img"`, `aria-label="Manav Sharma, founder signature"`. Respects `prefers-reduced-motion` via `useReducedMotion()` — when active, signature renders fully visible immediately, no drawing animation.
- **Font loading**: Google Fonts `<link>` elements (preconnect + stylesheet with `display=swap`) injected. The 0.5s container fade-in gives the font time to load before drawing begins.

**Timing in the cold-open arc**: signature container fade-in at 8.9s. Stroke drawing starts at 9.35s. Drawing completes at 12.05s. Ink soaks 11.9–12.6s. Hero-close lands at 12.2s (overlaps the final ink-soak phase, lands as the signature settles). Scroll hint at 13.5s.

### 13.4 Honest call-out

The era claim ("AI changed search; the agency model built for the old era hasn't caught up") is true and verifiable — Google AI Overviews, ChatGPT Search, Perplexity, AI Mode have all shipped in the last 18 months, and most agency operating models still use PDFs/static reporting. The "state-of-the-art" claim in the close is positional — what SEASON does (continuous data refresh, source-verified metrics, audit trail) is at the current frontier of the SEO operating-infrastructure category. Flagged so the manifesto's claims survive a fact-check.

### 13.4a Copy keys (5 languages each)

`hero_kicker` · `hero_sub` · `hero_intel_callout` · `hero_se_context` · `hero_as_context` · `hero_on_context` · `hero_reveal_setup` · `hero_reveal_pivot` · `hero_by_mark` · `hero_founder_name` *(legacy, no longer rendered — signature is now hardcoded "Manav Sharma" since signatures don't translate)* · `hero_roles` · `hero_close` · `phrase_strat_exec` · `phrase_anal_supp` · `phrase_op_net` · `scroll_hint`

---

## 13.5 Chapter 10 — For Whom This Was Built (rewritten 2026-05-23)

Reframed from a role-based audience map (clients / customers / investors / stakeholders / team) to a client-archetype map. Each block names a specific archetype, the goal/need they carry, and how SEASON serves their situation.

The five archetypes, in recognition order:

1. **The founder building organic on limited runway** — bootstrapped/seed-stage owner-operators
2. **The marketing leader who reports to a board** — VP/CMO at Series A+ B2B/SaaS/marketplace
3. **The local business that has to be the obvious choice** — legal, dental, medical, contractor, multi-location retail, services
4. **The ecommerce operator competing in the AI-search era** — DTC, niche ecom, marketplaces, retail
5. **The agency or consultancy that needs operating infrastructure** — digital agencies, consultants, fractional CMOs

Five archetypes covering ~20+ business types. Fully localized across all 5 languages as of 2026-05-24 (alongside the rest of the manifesto).

Intro Prose: *"Five archetypes — from the founder funding growth on limited runway to the consultancy delivering client work on borrowed infrastructure. The system underneath is the same; what shifts is the goal it serves. Find the one closest to your situation; the rest will still hold."*

## 13.6 Chapter 12 — Doubts, Resolved (SHIPPED 2026-05-23)

The FAQ chapter, reimagined. Doubts sit in their initial state — italic serif, plain, fully visible from the moment the chapter renders. The cinematic resolution is INVITED, not forced: the reader taps a doubt, and a brand-cyan line traces left-to-right *across* it (the resolution gesture, with a glowing leading-edge "spark"), then the answer fades in below in upright serif.

**Layout discipline (fixed 2026-05-23 v2)**: hidden answers occupy **zero** layout space. The answer is wrapped in an `AnimatePresence` block that conditionally mounts/unmounts the element. When tapped, the wrapper animates `height: 0 → auto` (via framer-motion's measured ResizeObserver) and `opacity: 0 → 1` simultaneously over 0.7s with `overflow: hidden`. When tapped again to replay, the wrapper exits with the inverse animation. This eliminates the prior bug where invisible answers (six × ~200px) created ~1200px of phantom empty space between doubts in their unresolved state. Stack gap tightened from 5.5rem to 2.4rem (desktop) / 1.8rem (mobile) now that the visual rhythm is anchored on actual rendered content.

**Interaction**: tap-to-resolve only. No auto-firing on scroll. Each doubt shows a monospaced affordance hint beneath it that toggles through three states: `↳ TAP TO RESOLVE` (idle) → `RESOLVING…` (in progress, with a soft pulsing animation) → `↻ TAP TO REPLAY` (done). Tap again to replay the resolution sequence — strike + answer re-mount via a bumped `resolveKey` for clean DOM state.

**Voice**: all six answers are rewritten operator-first. The framing centers Manav as the operator and his designed system as his instrument — not an autonomous SaaS, not an automated agent. The leverage is the system; the judgment is his. Authentic data sources (Google Search Console + Google Analytics 4 only) named explicitly where relevant.

Six doubts addressed:

1. *Why one person? Doesn't this scale poorly?* — "I built a system that gives one operator the visibility of fifteen. The leverage is the system; the judgment is mine."
2. *What happens if you get sick or take a holiday?* — "The system I built keeps the data pulling… What pauses is the next strategy decision — and strategy decisions do not need to happen every day."
3. *What's the minimum engagement?* — "Three months. SEO compounds; one month produces nothing I would defend."
4. *Can you guarantee rankings?* — "No. Anyone guaranteeing rankings is either lying or about to break the promise… every metric I show you sourced from GSC and GA4 only — no synthesis, no third-party rank databases, no estimates dressed as data."
5. *How is this different from a senior SEO consultant?* — "A consultant gives you opinion and a slide, then hands the implementation to a team that may or may not get it right. I give you the opinion, the implementation, and the operating system I built to make every step verifiable."
6. *Why no monthly retainer?* — "Every line item defensible because every line item is a thing I did, on a date I logged, against a baseline neither of us can quietly rewrite."

Hardcoded English (matches Whom + Engine pattern).

## 13.8 Active-chapter detection — scrollspy (REPLACED IntersectionObserver 2026-05-23 v2)

The prior implementation used `IntersectionObserver` with `rootMargin: '-25% 0px -25% 0px'` and a 0.25 intersection-ratio threshold. As chapters grew in length (ChEngine + Live Ops panel, ChFAQ with six answer expansions), long chapters could remain in the trimmed band without ever exceeding the 0.25 ratio — the season state would stick on a stale chapter, and the ambient cross-fade would lag or miss entirely.

The replacement is a **scroll-spy**: a `requestAnimationFrame`-throttled `scroll` listener computes which chapter is active by finding the one whose `top` is the highest above a fixed trigger line at **35% from the top of the viewport**. Equivalently: the chapter whose top has just passed the trigger is active. Height-agnostic. Deterministic. Smooth in both directions — scrolling up unwinds the seasons in reverse, exactly mirroring the descent. Also listens to `resize` events so the trigger line stays correct on orientation change.

Edge case handled: at the very top of the page (before the first chapter's top crosses the trigger line), the active chapter defaults to `cold-open` so the ambient season matches the title sequence immediately.

## 13.7 Chapter 06 — Engine Room Live Ops Panel (NEW, added 2026-05-23)

A system-status console inserted between the V12 spec grid and the architect-attribution prose. Distinct visual register from the spec cards above — monospaced row labels, pulsing live indicator with expanding ring, animated counter values that ease-out from 0 to target on scroll-in.

Six stats:
- **Engines** — `12 Active` (architectural truth)
- **Search Surfaces** — `5 Indexed` (Google, ChatGPT, Claude, Perplexity, Gemini)
- **Refresh Cadence** — `< 4 Minutes` (system pull cadence)
- **Continuous Since** — `Q4 2025` (◆ TBD placeholder — Manav updates)
- **Data Points / Day** — `~184K Events` (◆ TBD placeholder — Manav updates)
- **Audit Retention** — `100 Percent` (architectural truth)

Footer chips: `VERTICALS · SaaS · DTC · Legal · Local · B2B`

Placeholders are flagged with `◆ TBD` comments inline so Manav can find/edit in 30 seconds.

---

## 14. Open backlog — prioritized (2026-05-24, verified against live repo)

### P0 — the locked-in next big work (carried from 2026-05-23 backlog triage + reinforced by 2026-05-24 Senior DMS audit)

**Pillar quality + hallucination guards — now with audit evidence.**

The 5 pillar engines emit findings *without source tracing*. Audit run 2026-05-24:

| Engine | `source()` calls | `SourceUsage` refs | `intelligenceFabric` imports |
|---|---|---|---|
| `seo-cluster-map.ts` | 0 | 0 | 0 |
| `seo-internal-linking.ts` | 0 | 0 | 0 |
| `seo-off-page.ts` | 0 | 0 | 0 |
| `seo-monitoring.ts` | 0 | 0 | 0 |
| `seo-technical-audit.ts` | 0 | 0 | 0 |

**This is the single biggest Senior-DMS risk in the codebase.** The pillar reports are the actual client deliverables, and they ship without the source-confidence model the rest of the brain uses. Translation: a senior practitioner reading a pillar report has no way to distinguish "based on 18,400 GSC clicks across 90 days" from "Claude's best guess given a sparse data room."

**Template exists:** `api/intelligence.ts` lines 522-528 is the canonical pattern — every Claude reasoning input is wrapped in `source(type, { label, weight, count })` and `computeWeightedConfidence(sources)` produces the final score. Apply the same wrap to every pillar engine output.

**Per-pillar work (one per session):**

1. Identify every output the engine produces (findings, scores, recommendations, claims).
2. For each output, trace the inputs (GSC tables, GA4 fields, audit data, brain learnings, Claude inference).
3. Wrap each input in `source(type, { label, weight, count })`.
4. Compute `weightedConfidence` and attach to every emitted finding.
5. If a finding rests primarily on `claude_inference` (65) or `industry_pattern` (45) with no authentic anchor, the finding gets a "data sparse — connect X to strengthen this" surface instead of a confident claim.
6. Add a hallucination guard: outputs below a confidence threshold (e.g. 60) get the "I don't have enough data to say X" treatment.

Open question for the start of pillar work: **which pillar does Manav read most often?** That's the one to attack first. (Default for review: Senior SEO + Client.)

### P0 — DMS-value recovery (from pre-delete audit 2026-05-24)

**Revive the 4 market-researcher actions** — they are exactly the kind of client-facing DMS-grade outputs the platform is built to deliver:
- `build_persona` → deep AI buyer persona JSON (analyst reviews with clients)
- `suggest_goals` → phased goals + KPIs JSON (client-facing deliverable)
- `research_market` → streaming market intelligence report (authentic-data output)
- `cross_project_patterns` → mine `brain_learnings` for cross-project industry wisdom (institutional IQ)

The standalone Lambda at `api/market-researcher.ts.disabled` (1,369 LOC) is well-implemented with inlined helpers (the previous FUNCTION_INVOCATION_FAILED on cold start was solved by inlining `intelligenceFabric` mirror). Cannot be reactivated as a separate Lambda (12-function ceiling). **Right path**: fold its 4 actions into `task-engine.ts` as additional action handlers, reading inputs from the request body using the validation contracts preserved in `runtimeCompiler.ts` (now restored as of 2026-05-24).

### P0 — Synthesis audit (continuous discipline, added 2026-05-24)

Walk the codebase periodically and flag any place where the product emits a number, claim, or finding that is *not* traceable to an authentic source. Specifically:
- AI-only outputs without `intelligenceFabric` `source()` annotation
- Hardcoded fallback values that look like "best guesses" being passed off as data
- Empty arrays / placeholder shapes that render to clients as if they were "no findings" when in fact "data not yet pulled"
- Defaults that fill in for missing GSC/GA4 data without saying so

Each find → either replace with an authentic-data path OR add an explicit "data not available — connect X" surface. **Never** smooth over.

#### First audit pass — 2026-05-24 findings (closure log)

**A. IntroAnimation `LiveCount` "SEARCHES SINCE MIDNIGHT" — FIXED 2026-05-24**
Was: `4.2B + (seconds×129,629) + random ±300` jitter labeled "RIGHT NOW" with no attribution. Three layers of dishonesty: starting value lied about "midnight," rate was ~30% above credible figures, random jitter wasn't data. Now:
- Anchored to Google's public "over 5 trillion searches per year" → 158,565/sec.
- Counter starts at 0 at UTC midnight (matches the label).
- Deterministic tick at modeled rate; no random jitter.
- Label changed: "SEARCHES SINCE MIDNIGHT" → "GOOGLE SEARCHES SINCE MIDNIGHT UTC".
- "RIGHT NOW" → "WORLDWIDE".
- New attribution line: "MODELED · GOOGLE PUBLIC FIGURES · 5T / YR".

A senior practitioner reading the intro can now scrutinize the figure and find it defensible — anchored to a public Google statement, model basis visible.

**B. Pillar source-tracing — TEMPLATE ESTABLISHED on `seo-technical-audit.ts`, REPLICATE TO OTHER 4**

`api/lib/seo-technical-audit.ts` now demonstrates the canonical pillar source-tracing pattern. What changed:

1. **`DATA_SOURCE_META` mapping** added — each `data_source` value the engine already declares (`gsc | ga4 | psi | html_fetch | schema_parser`) is mapped to `{ confidence: number, label: string, sourceType: string }` aligned with `intelligenceFabric` numbering:
   - `gsc` → confidence 95, "Google Search Console (live)", `gsc_live`
   - `ga4` → confidence 95, "Google Analytics 4 (live)", `ga_live`
   - `psi` → confidence 92, "PageSpeed Insights API", `audit_run`
   - `html_fetch` → confidence 87, "Live HTML fetch", `crawl_jina`
   - `schema_parser` → confidence 87, "Schema parser (HTML-derived)", `crawl_jina`

2. **`weightedFindingConfidence(findings)`** helper computes the mean confidence across all findings that declared a source, and counts findings *without* a source attribution (which are explicitly EXCLUDED from the mean and surfaced as "unattributed" — synthesis risk).

3. **Honest `confidenceRating`** — previously based only on "did checks execute?", now combines that with source-weighted confidence: either dimension dropping low pulls the overall rating to low. A green verdict from a single html_fetch can no longer rate the same as one cross-confirmed across GSC+GA4+PSI.

4. **Per-finding source line** in the markdown report — every red/amber finding now ends with `*Source · {label} · confidence {N}/100*`. Green and info findings get a compact `· *{label}*` suffix.

5. **New "Source confidence" section** at the top of every report — surfaces weighted confidence, sources used (with counts), and any unattributed findings. The Senior DMS can calibrate trust before reading findings.

**Apply this template to the other 4 pillars (one per session):**
- ✅ `seo-cluster-map.ts` — **SHIPPED 2026-05-24.** `CLUSTER_SOURCE_META` mapping (6 source keys: gsc_queries, gsc_pages_slug, pipeline_research, llm_naming, llm_ownership, brain_learning). Each cluster gets `sources_used` + `confidence_score` post-enrichment. Aspirational path was already honest ("no GSC grounding, illustrative not measured"). Main path's misleading "more findings = higher confidence" rating replaced with weighted source-confidence + data-volume cross-check. Per-cluster source line + report Source-confidence section.
  - **EXTENDED 2026-05-24 PM** with Senior DMS uplift after a real cluster-map output on alphasoftware.com / keyword "app maker" was marked 🟢 covered while the campaign keyword itself ranked at position 36.5 and the inferred hub was an audit-app URL with no keyword in its slug. 5 new quality checks added:
    1. **Banner campaign-keyword-position finding** — scans all cluster queries for the campaign keyword (exact > full > partial); emits a RED/AMBER/GREEN banner at the top of findings. Position > 50 or absent → RED-critical. Position 21-50 → RED. Position 4-20 → AMBER. Position 1-3 → GREEN.
    2. **Hub alignment check** — verifies the inferred hub URL slug carries the campaign keyword tokens. Strong / partial / weak / no_hub classification. Weak alignment (no keyword tokens in slug) emits a RED per-cluster finding.
    3. **Coverage status downgrade rules** — a cluster cannot be `covered` if (a) the campaign keyword itself ranks below position 20, (b) the hub does not carry the keyword, or (c) the cluster is thin. Each rule downgrades to `partial`. Prevents synthesis-as-fact verdicts.
    4. **Cluster cohesion check** — position spread (max − min) within a cluster. >20 ranks flags AMBER over-aggregation. Catches lexical clustering grouping queries that share tokens but have different intents/SERPs.
    5. **Thin-cluster honesty** — clusters with <5 queries OR <500 impressions are marked thin; confidence capped at 60. Per-cluster recommendation gets a "directional, not definitive" blockquote.
  - Per-cluster render now shows a "Quality signals" line summarizing all 4 checks at a glance.
  - Recommendation gets "Reality check" blockquotes prepended when keyword-position > 20 or hub-alignment is weak. The LLM-generated recommendation is preserved but contextualized — no longer treated as the authoritative verdict.
  - Methodology footer rewritten to surface the new checks + the next phase-gap (per-query intent classification via LLM).
- ✅ `seo-internal-linking.ts` — **SHIPPED 2026-05-24.** `LINK_SOURCE_META` (4 keys: gsc_top_pages, html_fetch, cluster_data, llm_anchor). `attachFindingSources` post-emission, `findingKindSources` maps each of the 6 finding_kinds to its sources. Honest rating now combines fetch coverage AND source quality.
- ✅ `seo-off-page.ts` — **SHIPPED 2026-05-24.** `OFFPAGE_SOURCE_META` (6 keys, most LLM-heavy of the 5 pillars). Rating capped at medium for pure LLM strategy outputs; "to reach high requires future SerpAPI integration (Block 4)" surfaced explicitly. Per-finding source mapping for all 6 finding_kinds.
- ✅ `seo-monitoring.ts` — **SHIPPED 2026-05-24.** `MONITOR_SOURCE_META` (5 keys, gsc_snapshot dominant). Most data-grounded pillar; every delta traces to a real GSC snapshot. LLM narrative explicitly framed as "synthesis layer above measured deltas, does not raise overall confidence." 10+ finding_kinds mapped per-kind to sources.
- ✅ `seo-technical-audit.ts` — **SHIPPED 2026-05-24** (template established). **EXTENDED 2026-05-24 PM** with Senior DMS uplift after real-audit critique on alphasoftware.com / keyword "app maker":
  - Added `checkKeywordPresence` — verifies campaign keyword presence in title / H1 / URL / meta description / first paragraph. **RED** when keyword absent from both title and H1; **RED** when multi-token keyword is only partial in both. Was the #1 missing check.
  - Added `checkCtrVsExpected` — actual CTR vs position-benchmark (AdvancedWebRanking / Backlinko / FirstPageSage midpoints in `POSITION_CTR_BENCHMARK` table). Flags significant underperformance (<50% of expected) as RED, mild underperformance (<80%) as AMBER, over-performance (>130%) as GREEN.
  - Added `checkQueryDistribution` — uses the `gsc_query_page_pairs` data wired earlier for cannibalization. Shows top 10 queries this URL actually ranks for, with per-query CTR. Flags AMBER when the campaign keyword is NOT in the URL's top 10 queries.
  - Enriched image-alt: now lists specific image src URLs missing alt + counts short/insufficient alts (<5 chars).
  - Engagement-signals fix: site-wide GA4 is no longer marked green at page-level — it's INFO with explicit "site-wide, not page-specific" framing. Synthesis-as-fact closed.
  - Audit scope footer rewritten — surfaces 8 categories now, lists per-page GA4 / SERP feature awareness / competitive content benchmark / schema validation as future-phase gaps.

### Backlog spawned from the technical-audit Senior DMS pass

**P0 — Per-page GA4 fetch.** Currently GA4 persists only site-wide aggregates (`ga4_users_monthly`, `ga4_engagement_rate`, `ga4_top_countries`, etc.). Per-URL engagement / bounce / sessions requires extending `pm-gsc.ts` pattern to `pm-ga4.ts` with `dimensions: ['pagePath'], metrics: ['engagementRate', 'averageSessionDuration', 'sessions']`. Once shipped, the technical-audit engagement check upgrades from site-wide INFO to per-page GREEN/AMBER/RED.

**P1 — SerpAPI integration (Block 4 plan).** Unlocks: featured-snippet presence detection, AI Overview detection, PAA box queries, competitive content benchmark (word count + topical coverage vs top-10 ranking pages). Currently flagged as a phase-gap in every pillar's "not yet covered" footer.

**P1 — Schema validation, not just presence.** Technical-audit currently reports schema TYPES present. Senior DMS expects validation against Google's structured data testing rules: required fields, recommended fields, type-specific gotchas (e.g. FAQPage requires Q&A pairs that match on-page content).

**P1 — Apply the same uplift pattern to the remaining 3 pillars.** Technical-audit and cluster-map both have batch 1 + batch 2 Senior DMS uplifts shipped. Internal-linking, off-page, and monitoring have batch 1 source-tracing only. Next: anchor-text quality (internal-linking), asset-keyword fit (off-page), per-finding evidence trail (monitoring).

**P1 — Hub candidate ranking with explanation (cluster-map).** Currently `inferHubsAndSpokes` picks one URL with the highest token-match score. A Senior DMS would want to see top-3 candidates with their match scores, so the user can override when the heuristic picks wrong (the alphasoftware case where `/alpha-transform-5s-audit-app` was picked but `/build-apps-for-free-community-edition-download` may be the better hub for "app maker").

**P1 — Business impact translation (technical-audit).** Translate metrics into stakeholder language: "Current 15 clicks/month at 0.26% CTR; at expected top-3 CTR ~28% with current 5,775 impressions → traffic potential ~1,617 clicks/month, gap of ~1,600 clicks/month." Currently the audit reports CTR but doesn't size the opportunity.

**P2 — Anchor text quality on internal links (technical-audit + internal-linking pillar).** "69 internal links present" is a count, not a quality verdict. A senior practitioner wants to know: how many use descriptive anchors? How many keyword-rich? How many generic ("click here", "read more")? Cross-pillar work — internal-linking pillar owns the analysis, technical-audit cross-references it per URL.

**P2 — Schema strategy, not just presence.** Beyond validation: for a pricing page, should SoftwareApplication / Product schema exist? Should BreadcrumbList be added? Should the existing FAQPage schema Q&As match on-page Q&As (mismatched FAQ schema can trigger manual action)?

**P2 — Keyword alternative deeper analysis (cluster-map).** Strategic Recommendation surfaces the top non-branded ranking query, but the next layer is: which queries have growing impression trends? Which align with the project's primary commercial intent? Requires GSC trend data + GA4 conversion attribution.

**P2 — Date freshness verification (technical-audit).** Pages claiming "2026" in the title should have a verifiable Last-Modified header, sitemap lastmod, or schema dateModified. Currently the audit takes the title's freshness claim at face value.

**P2 — CWV elevation when PSI fails (technical-audit).** Currently PSI 429 returns an AMBER warning. CWV is a confirmed Google ranking factor — when PSI is completely unavailable, the audit is incomplete in a way that matters. Escalate to RED when PSI fails for ALL strategies.

**P2 — First-fix prioritization layer (both audits).** Add a "🎯 Fix this first" badge on the highest-leverage RED finding so users don't face a wall of equally-weighted findings without ordering. Decision logic: prioritize keyword/content mismatch > CTR underperformance > CWV failures > on-page tactical fixes.

**C. Industry-default discipline — pm-engine gap surfaced 2026-05-24**
Audited 6 call sites:
- ✅ `api/lib/context.ts:217` — already uses "Not set"
- ✅ `api/lib/brand-studio-investor-bundle.ts:201` — cover-letter template conditionally omits the "operating in X" clause when industry is empty
- ✅ `api/task-engine.ts:1236` — prospect map display, empty string handled fine
- ✅ `src/lib/theme-engine.ts:516` — theme detection falls through to default theme
- ✅ `api/lib/mission-control.ts:215` — internal score input, empty fine
- ❌ `api/lib/pm-engine.ts:465` — silent degradation, no gap surfaced. **FIXED**: added `if (!clientIndustry) gaps.push("Client industry not set — outputs will be generic across vertical-specific patterns")` to the engine's existing gaps array. Now consumers see the gap honestly.

**D. Hardcoded confidence values — investigated 2026-05-24**
- ✅ `season-llm-web.ts:166` `confidence: 0.55` — JSON-parse fallback with `honest_note`; verdict: defensible, semantics correct.
- ✅ `season-pipeline-routes.ts:203` `confidence: 0.95` — cached under `source: 'manav_feedback'` (one of highest-trust sources on the scale); verdict: correct.
- ❌ `season-llm-web.ts:166` intent fallback was `"web_open_question"` (guessed). **FIXED**: changed to `"unknown"` in both the parse-failure path and the success-path-with-missing-intent default. Blast radius checked: no downstream code switches on `"web_open_function"`.
- *Note*: both confidence values use ad-hoc 0–1 numbers instead of routing through `intelligenceFabric.source()`. Semantically correct but a code-hygiene gap. Defer to a future uniformity pass.

**E. `intelligenceFabric` coverage gap — IN PROGRESS via pillar work above**
This is the meta-finding. Closing it = applying the pattern from Finding B to all engines as they're touched. Progress this session:
- `seo-technical-audit.ts` — Phase 15.2 + 15.3 uplifts shipped (8 check categories + decision-tree).
- `seo-cluster-map.ts` — Phase 16.0.4 + 16.0.5 uplifts shipped (8 finding categories + Strategic Recommendation + intent classification).
- 3 remaining pillars (internal-linking, off-page, monitoring) — Phase 1 source-tracing done, batch-2 uplifts pending.
- Other engines in `api/lib/` (95 files total) — propagate as engines are touched.

---

### P1 — quick wins (each takes <2 hours, no scope creep)

1. **Manifesto 2 × `◆ TBD` placeholders** in `ChEngine.tsx` LiveOps panel (`Continuous Since`, `Data Points / Day`) — Manav fills in 30 seconds.

### P2 — client-facing stubs (visible in production right now)

6. **`ClientWorkspace.tsx:143`** — investor session-mode data not wired (only bare_token mode populates)
7. **`ClientWorkspace.tsx:241`** — "Workspace not yet configured" empty state — needs the actual modules-enabled flow
8. **`ClientWorkspace.tsx:579`** — "Market & Competitive — coming soon" panel — needs share-of-voice + competitor monitoring data sources
9. **`BrandStudio.tsx:333`** — placeholder card for tabs not yet built
10. **`components/pm/AnalyticsIntelPanel.tsx:116`** — "Intelligence not yet computed" empty state — verify what computes it and whether anyone triggers that path

### P2 — features after platform is solid

11. LLM-generated ticker lines from Brain Learnings + Pick corpus
12. Multi-turn chat scrollback in Pro mode (Command page)
13. Per-project widget layout preferences (currently global)

### P3 — when client trials grow into paying clients

14. SerpAPI competitive radar (Block 4 plan — defer until budget warrants)
15. `decisions_avoided` dedicated surface (Block 5 plan)
16. Client PDF export per pillar (Block 6 plan)

### Deferred indefinitely (do not start without explicit go)

- Mobile bottom-sheet drawer + mobile Command layout
- Drag-and-drop widget reordering (↑↓ arrows work)
- PDF export of Pro mode
- Tone preference toggle + 👍/👎 feedback loop on ticker

### Frozen (do not touch without explicit "yes, layout")

- Casual mode empty left space when sidebar is closed
- Persistent left rail attempt (Block 2.24 v1 was wrong)

### ✅ Verified done (carry forward — do not re-litigate)

| Item | Verified |
|---|---|
| 5 P0 platform bugs (requirements stub, audit endpoint, 2 missing handlers, dead imports) | 2026-05-24 |
| Phase 21 Blocks 2.13–2.22 (Pick engine, widget gallery, ticker, layout polish, etc.) | Live at commit `467ebcf` lineage |
| Manifesto full localization — 287 keys × 5 languages, Devanagari grapheme fix, html.lang + tab title sync, i18n parity guard | Live at commit `8d4e066` |
| AIConcierge hidden on `/manifesto` | 2026-05-23 |
| **`/api/market-researcher` references — first attempt then corrected** — initially removed STATIC_RULES + error-message references on 2026-05-24 morning as "dead config cleanup." That was wrong: the rules document the validation contract for 4 DMS-grade actions (`build_persona`, `suggest_goals`, `research_market`, `cross_project_patterns`) — exactly the kind of client-facing analyst output the platform is built to deliver. The function is `.disabled` for past technical reasons (FUNCTION_INVOCATION_FAILED on cold start, since fixed via inlined helpers) plus the 12-function ceiling — not because the capability is unwanted. **Restored 2026-05-24 afternoon** with a clear deferred-status comment. The error-message generification at line 188 stays (the wording works for any handler now). Added P0 backlog item to revive the 4 actions by folding into `task-engine.ts`. Lesson logged in §1.5 pre-delete rule. | 2026-05-24 |
| **Living Overview cron** — verified wired inside `run_scheduled_verifications` at task-engine.ts:2558-2566, runs alongside 6 other ticks (PM lifecycle, GSC/GA4 pull, rule engine, brand-studio monitors, forecast sweep, verification queue) at 6am UTC daily. `livingOverviewCronTick` in `seo-campaign-engine.ts:1358` skips fresh campaigns (no LLM call), hard-cap 50 campaigns, ~$0.50/day typical. URL fit is part of the in-flow campaign-build analysis (`seo-url-targeting.ts:53` UrlFitAnalysis used during `seo-campaign-grouping.ts:896`), not a separate nightly. The "Living Overview cron + URL fit nightly" item from the old backlog was already done — brief was stale. | 2026-05-24 |
| **`create_strategy_stub` rename to `create_strategy_navigate`** — the alias at `registry.ts:96` and the registered action at line 705 were named "stub" but the implementation is intentional: it navigates the LLM-emitted `create_strategy` intent to `/planning` where strategies are actually built. Renamed for clarity + comment block explaining the navigation-only pattern. No behavior change. | 2026-05-24 |
| **Cannibalization detection wired end-to-end** — `detectCannibalization` in `pm-analytics-intel.ts:963` was implemented but never called; the orchestrator at line 1070 was returning `[]` with a TODO. Wired: (1) `pm-gsc.ts` now fetches `["query","page"]` dimension pair (rowLimit 200) in the parallel cron pull, (2) shapes + persists as `gsc_query_page_pairs` in `project_knowledge`, (3) `pm-analytics-intel-orchestrator.ts` reads the new field, (4) `buildAnalyticsIntelligence` accepts `gscQueryPagePairs?` and calls `detectCannibalization` when data is present. Backward compatible — projects without the new field flow through as `[]`. Cost: 1 additional GSC API call per project per cron run. Thresholds in the engine (top ≥5 clicks, second ≥2, position spread ≤10) keep false positives low. First findings will appear after the next 6am UTC cron tick. | 2026-05-24 |
| **Phase 15.2 + 15.3 — Technical-audit pillar uplifts (two-batch ship + honesty scrub)** — batch 1 (commit `de09d7c`) added the keyword-presence check across title/H1/URL/meta/first-para (RED severity when keyword absent or partial in title AND H1), CTR vs position-benchmark check (AdvancedWebRanking/Backlinko/FirstPageSage midpoints), GSC query-distribution check, listed-image alt-text URLs, demoted site-wide GA4 to INFO. Batch 2 added: (a) **first-paragraph topical relevance check** — compares first-paragraph tokens to title+H1 tokens via `topicalOverlapFraction`; RED at 0% overlap (catches the alphasoftware case where the hero copy is an Alpha TransForm tagline, not about Power Apps pricing), AMBER <20%, GREEN ≥40%; (b) **tracking-pixel filter** — `isTrackingPixel` excludes facebook.com/tr, google-analytics, googletagmanager, doubleclick, Pinterest, LinkedIn, Bing, Hotjar, Sentry, Mixpanel, Segment, etc. from the image-alt count (Facebook Pixel was being reported as "missing alt" before — noise); (c) **decision-tree recommendation** — when keyword is absent/partial in BOTH title and H1 AND first-paragraph overlap with keyword is <15%, `inferActualPageTopic` builds a suggested phrase from consecutive non-stopword title tokens (e.g. "microsoft power apps pricing" for alphasoftware), and the recommendation directly states "change the campaign keyword to X" with evidence. **Honesty scrub (2026-05-24 PM, after Manav pushback):** all persona-speak removed from user-facing strings — no "A Senior SEO Specialist would call this…", no "The data says option (b)" rhetorical scaffolding, no "[actual topic]" un-interpolated placeholders. Internal code comments retaining "Senior DMS" framing are documentation, not output. **Generality discipline added in same session:** `STOPWORDS_FOR_TOPIC_INFERENCE` expanded to filter generic web/marketing chrome (welcome, home, page, site, contact, our, us, we, step, tutorial, etc.) + a **strict quality gate on `inferActualPageTopic`** — the suggested phrase must come from the FIRST consecutive run (≥2 phrase-eligible tokens) in the title that contains the FIRST title-significant token. Topics appear at the START of titles; qualifiers and audience descriptors ("for first-time visitors") appear at the end. No fall-through to single-token concat. If no high-confidence phrase can be extracted, suggested phrase is empty and the decision-tree falls through to the generic "rewrite or recheck" recommendation. Smoke-tested 8/8 against alphasoftware, no-code, CRM, Welcome generic, Notion single-word, Goa-beaches qualifier, marketing-automation, AI-image-gen. Audit-scope footer mentions decision-tree behavior + pixel filter + first-para topicality. | 2026-05-24 |
| **Phase 16.10 — Deep-doc bug fixes after production alphasoftware review (2026-05-24 night)** — Manav ran the Phase 16.9 deep-doc renderer on the live alphasoftware target (`https://www.alphasoftware.com/power-apps-pricing-what-you-should-know-about-hidden-costs`, keyword `app maker`) and the 1905-line output exposed serious architectural and extraction bugs. **P0 root cause:** the new `renderDeepAuditReport` wire-in at `seo-technical-audit.ts:410-450` skipped the legacy `renderAuditReport`'s pre-render passes — specifically `pickFoundationalCritical(findings)` was never called in the deep-doc flow, so `is_foundational` was never set on any finding. Cascaded into six visible failures: (1) §3.1 missing 🎯 foundational badge; (2) §0.2 "Top three actions" list started at "**2.**" with no #1 because the foundational action template gated on `if (foundational)`; (3) §6.1 rendered "No foundational fix identified for this audit" despite §3.1 clearly being the foundational keyword-pivot finding; (4) §7.1 task inventory started at T2.1 with phantom `T1.4` dependencies on every T2.* row; (5) §7.2 critical-path text said "Bottleneck: T1.3 (client decision)" — T1.3 didn't exist anywhere; (6) §0.1 diagnosis claimed "Four independent measurements corroborate" but cited only three findings (§3.2, §3.3, §3.9) because `xref(foundational)` returned empty string when foundational was null. **P1 evidence-extraction failures (Phase 16.8 bug class returning):** (a) §1.4 image inventory rendered "—" for "With alt text" and "Lazy-loaded" rows because `checkImageOptimization` wrote ratios into detail-text strings only, not into the `evidence:` object. (b) §2.5 competitive content landscape rendered "—" for every row because the renderer's `competitiveContentFinding` matcher `/Content depth|word count|SERP median/i` caught §3.15 (basic "Word count: ~3052 words" pass-finding) BEFORE §3.22 (the actual competitive benchmark). Same cross-ref bug: §2.5 linked back to §3.15 instead of §3.22. (c) §3.10 image-format title said "all 9 images are jpg/png/gif" but body said "17 detected, 9 legacy" — the 8 unclassified images (SVG icons / data-URIs) were silently dropped from the title's count. (d) §6.2.1.2 "What is an app maker?" and §6.2.1.3 "What is a good app maker?" rendered IDENTICAL body guidance because `paaQuestionBodyGuidance` checked the `what is.*` branch BEFORE the `good|best` branch — "what is a good X" matched the category-definition route first and never reached the comparison route. (e) §3.1 had zero cross-references rendered. The `collectCrossRefs` engine builds links by SHARED signals, and §3.1 (`keyword_mismatch`), §3.2 (`url_not_in_top_10`), §3.3 (`first_paragraph_off_topic`), §3.9 (`serp_topic_mismatch`) each had a UNIQUE single signal — the graph was leaf-only despite §4.2 correctly identifying the four-finding convergence cluster. **The 8 fixes shipped** (all in single commit): **#1** Wire `pickFoundationalCritical(findings)` + `detectConvergingEvidence(findings)` into `runTechnicalAudit` BEFORE `deepReportInputs` construction (the architectural P0). `DeepReportInputs.converging_banner` field now populated by audit-side pre-pass instead of inferred by renderer. **#2** Broadened `pickFoundationalCritical` Rule 2: matches by title-OR-signal (keyword in title OR `signals.includes('keyword_mismatch')`) AND recommendation-OR-detail regex `/change the campaign keyword|rewrite the (page )?title|rewrite the title and h1|content overhaul|campaign keyword is wrong|page is built for|content-strategy mismatch/i`. Catches §3.1's "bothPartial" branch phrasing that the previous narrow regex missed. **#3** New helper `propagateKeywordPivotClusterSignal(findings)` — when a foundational finding is identified AND 2+ corroborating findings have signals in the pivot family (`keyword_mismatch`, `url_not_in_top_10`, `serp_topic_mismatch`, `first_paragraph_off_topic`), all four get tagged with a shared cluster signal `keyword_pivot_cluster`. This makes the renderer's signal-based `collectCrossRefs` engine wire §3.1 ↔ §3.2 ↔ §3.3 ↔ §3.9 together. Signals union type widened to include `'keyword_pivot_cluster'`. **#4** `checkImageOptimization` rewritten — single `sharedEvidence` object containing `total_images`, `with_lazy`, `lazy_ratio`, `with_alt`, `missing_alt`, `alt_ratio`, `with_srcset`, `srcset_ratio`, `modern_format`, `legacy_format`, `other_format` (NEW: counts SVG/data-URI/no-ext images that previously fell out of the legacy/modern partition). EVERY image finding (lazy, modern, alt, green pass, info few-images) now `evidence: { ...sharedEvidence }`. Modern-format title fixed: `legacyFormat === total ? "all N images are jpg/png/gif" : "N of M images are jpg/png/gif (PCT%)"`. **#5** `competitiveContentFinding` matcher rewritten — checks evidence shape (`audited_word_count` + `competitor_median` both defined) OR tightened title regex `/Content depth|content exceeds SERP median|word count.*competitor|competitor median|SERP median/i`. No longer catches plain "Word count: ~3052 words". §1.4 renderer also adds Responsive (srcset) row + Other-format row when `other_format > 0`. §2.5.1 diffuse-intent renderer now normalizes BOTH category shapes — array `[{name,count,domains[]}]` AND object-map `{categoryName: [domains]}` (the actual production shape). **#6** `paaQuestionBodyGuidance` reordered: quality/comparison check (`good|best|top|recommend|popular|leading|ideal`) FIRST, then how-to/process, then cost/pricing, then plain "what is/are", then "why X" rationale, then "can I/you/we" feasibility, then generic fallback. Each branch produces distinct guidance. **#7** §0.1 diagnosis rebuilt as dynamic builder — collects non-null xrefs into `diagXrefs` array, looks up number-word ("Four" / "Three" / "Two"), renders as `${numberWord} independent measurement(s) corroborate this diagnosis: ${xrefList.join(', ')}`. §0.2 action list rebuilt as `Action[]` of `{lead, tail}` pairs with sequential numbering — no holes when foundational is absent. Bold scope corrected so `**N. lead**` doesn't nest with title's own bold. **#8** Empty-Phase-1 handling: §6.1 renders explicit "No Phase 1 foundational fix required for this audit. Phase 2 acts as the lead phase" message; §7.1 task deps use `phase2DepLabel = foundational ? 'T1.4' : 'None'`; §7.2 has separate critical-path diagrams for foundational-present vs foundational-absent; §7.5 builds DMS/Writer/Dev task lists dynamically from which T-tasks actually exist (no T1.1/T1.4 references when no Phase 1). **Verification discipline (lesson from Phase 16.9 ship failure):** the Phase 16.9 smoke test passed on a synthetic fixture but production audit had 26+ bugs because (1) the smoke test fixture used renderer-friendly evidence shapes, not actual audit-produced shapes, and (2) the audit-side `pickFoundationalCritical` call was forgotten in the wire-in but the smoke test fixture pre-set `is_foundational` manually so the bug never surfaced. New rule for Phase 16.10+: **smoke test fixtures must mirror actual production-audit evidence shapes** (categories as object-map not array, image evidence WITH all the ratios, keyword finding with empty matched_tokens, etc.). The Phase 16.10 smoke test (`/home/claude/Manav-SEO/smoke-phase-16-10.ts`, deleted post-verify) replicates the exact alphasoftware output shape, replicates `pickFoundationalCritical` + `propagateKeywordPivotClusterSignal` effects manually, and runs 21 anchor checks: 21/21 passed. **Verification:** TS frontend=26 (baseline unchanged), TS root=0, nodenext sim on touched files = 0 new errors (only pre-existing `seo-campaign-engine.ts(1005,21) TS2554` baseline remains), vite build green 33.14s, ReferenceError count=0, 12 api/*.ts ceiling intact. Touched files: `api/lib/seo-technical-audit.ts` (+~80 lines for new helper + pickFoundationalCritical widening + checkImageOptimization sharedEvidence pattern + signals union widening) and `api/lib/seo-technical-audit-deep-report.ts` (~150 lines changed across 8 sites). | 2026-05-24 |
| **Phase 16.9 — Deep-doc architecture (2026-05-24, architectural pivot retiring Phase 16.8):** Manav's strategic call after reviewing Phase 16.8's 6-lens output: replace fragmented role-tailored documents with **one comprehensive cross-referenced technical SEO report**. Same Finding evidence, fundamentally different consumption model — instead of audit-side determining what each role sees, the audit produces ONE deep source-of-truth document and reader (human OR LLM uploaded the doc) extracts role-tailored views at consumption time. **Rationale Manav surfaced:** "Any role would need to refer a detailed technical seo report if he wants to get successful. What I want is to have one very deep technical seo report which anyone could refer and mention the references to be taken from which section which line as supporting fact. That is must document, which in all aspects need to be complete and deepest. And make sure if you have to complete all the work with technical pipelines (which we will create in future) as this document itself is very deep and sufficient if I upload it to you." The single doc serves as the structured API for all downstream role-productivity work, both human reading and pipeline ingestion. **Discipline correction surfaced:** the Phase 16.8 lens module had multiple data-extraction bugs — extractors checked wrong evidence field paths (`evidence.unanswered_paa_questions` vs actual `evidence.unanswered`, `evidence.median_words` vs `evidence.competitor_median`, `evidence.descriptive_pct` vs `evidence.descriptive_ratio`). Root cause: writing extractors without first reading the actual evidence shape in each check function. Phase 16.9 work began by reading every `evidence:` push site in seo-technical-audit.ts and documenting actual field paths BEFORE writing renderer code. **Audit-side augmentations** (prep work, two surgical changes to seo-technical-audit.ts): (1) `computeBusinessImpact` refactored to return `{markdown, structured}` — `structured` carries `{missed_clicks, expected_clicks, dollar_low, dollar_high}` so the renderer can quote dollar values structurally instead of regex-parsing the detail text. Both CTR call sites (red + amber) updated. (2) CTR finding evidence augmented with SerpAPI-derived structured fields — `ai_overview`, `featured_snippet`, `featured_snippet_owner`, `paa_count`, `paa_questions[]`, `ads_top`, `ads_bottom`, `top_10_domains[]`, `top_10_urls[]`, `top_100_domains[]`, `top_100_urls[]`, `live_position` (or null when out-of-top-100), `in_live_top_10`, `in_live_top_100`, `cache_hit`. All previously embedded only in finding_detail text addendums; now available to the renderer programmatically. **New file:** `api/lib/seo-technical-audit-deep-report.ts` (1741 lines, single export `renderDeepAuditReport(I: DeepReportInputs): string` plus `DeepReportInputs` interface). **§-structure:** §0 Executive Summary (diagnosis + top-3 actions + severity summary + confidence) → §1 Page Inventory (1.1 metadata, 1.2 content structure, 1.3 schema, 1.4 images, 1.5 internal links + anchors, 1.6 freshness, 1.7 hreflang, 1.8 indexability) → §2 Search Performance Baseline (2.1 GSC, 2.2 GA4, 2.3 live SERP, 2.4 SerpAPI features, 2.5 competitive content + 2.5.1 intent classification, 2.6 GSC query distribution) → §3 Findings (each finding gets stable §3.N ID, severity-sorted Red→Amber→Green→Info, full evidence + recommendation + signals + cross-references + collapsible raw JSON dump) → §4 Convergence Analysis (4.1 signal-map table, 4.2 hardened diagnoses where 2+ findings agree, 4.3 contradictions + open questions) → §5 SEO Economics Context (5.1 AI Overview era, 5.2 diffuse-intent economics, 5.3 CTR benchmark caveats, 5.4 freshness signal weighting, 5.5 schema-content-match policy, 5.6 anchor-text quality, 5.7 image format) — only fires subsections whose corresponding finding fired → §6 Recommendations (6.1 Phase 1 Foundational, 6.2 Phase 2 Content Overhaul with per-PAA-question §6.2.1.N briefs, 6.3 Phase 3 Validation + Parallel) → §7 Effort & Dependency Map (7.1 task inventory table with cross-refs to §6 and §3, 7.2 critical-path ASCII, 7.3 risk register, 7.4 Definition of Done checklist, 7.5 resource & access requirements) → §8 Business Impact Model (8.1 sourced inputs, 8.2 conservative-vs-full-recovery scenarios, 8.3 caveats, 8.4 realistic call) → §9 Source Trust Map (9.1 by-source breakdown, 9.2 per-finding confidence table, 9.3 failed checks) → §10 Glossary (20 terms with §-refs) → §11 Methodology (11.1 what we check, 11.2 not covered, 11.3 thresholds, 11.4 role view mapping table) → §12 Appendix (raw evidence dumps per finding, audit run metadata). **Cross-reference syntax:** narrative renders `(see §3.4 — Finding title)`; in dense contexts the renderer uses just `§3.4`. Empty sections render an explicit "N/A for this audit" rather than being omitted, so cross-references stay stable across runs. **Role-view derivation** (deferred to consumption time per §11.4 mapping): PM uploads doc, asks "give me the PM plan" → LLM reads §7 + cross-refs back to §6 and §3. Content writer asks "give me the content brief" → reads §1.1, §1.2, §3.X (PAA gap), §5.5, §6.2. Client asks for summary → §0 + §8. No additional rendering code in the audit pipeline; the deep doc is the structured API. **Wire-in:** `runTechnicalAudit` post-process — replaced `renderAuditForAllLenses` + `concatenateLensReports` calls with single `renderDeepAuditReport(deepReportInputs)`. Import statement swapped: `seo-technical-audit-lenses.js` import removed, replaced with `seo-technical-audit-deep-report.js`. Lens module file kept in repo for one phase as backward-compat hedge but no longer imported. **Verification:** TS=26 unchanged (pre-existing Oval.tsx errors unrelated), root=0, nodenext runtime sim clean on touched files, vite green 53s, ReferenceError=0, 12 api/*.ts ceiling intact, api/lib helpers count up by 1 (deep-report module added; lens module kept dormant). Smoke test against alphasoftware-shaped mock findings produced 36,848-char / 876-line deep report on a 4-finding test fixture (production audits with 15+ findings will render proportionally longer); 17/17 validation anchors passed (executive summary, foundational badge, CTR rendering, AI Overview row, PAA questions block, top-10 domain rendering, all 12 §-sections present, business impact dollars, cross-references parse, no `?%` or `$X` placeholder leaks from the retired lens module's bugs). **Architectural philosophy reset:** v1 ships the deep doc to the existing panel-report slot (same writeReportToPanel call). v2+ backlog: structured export of §-IDed data (JSON-Lines-style per-finding rows for pipeline ingestion); §6/§7 → real PM-tasks pipeline (kanban_tasks table writes); role-view derivation as named registry actions (`extract_pm_plan`, `extract_content_brief`, `extract_sales_hooks`, `extract_client_summary`) reading the deep doc as context. The deep doc is the contract between audit-side and all consumers. | 2026-05-24 |
| **Phase 16.8 — Multi-lens audit architecture (2026-05-24 night, architectural pivot):** Manav's strategic call after reviewing the polished alphasoftware report: replace the single mixed-audience audit report with **six role-tailored documents** generated per audit run. Same findings, six fundamentally different framings — each written for a specific reader with the depth and context they need. Lenses: (1) **Senior DMS** — strategic diagnosis with evidence threads grouping corroborating findings around hypotheses, cross-finding analysis, tactical priorities with leverage rationale, internal-vs-escalate decision framework, SEO-economics context (AI Overview era, diffuse-intent SERP implications), source-trust map by data source, open questions; (2) **Client** — TL;DR 2-3 sentence executive summary, plain-English "What We Found" narrative, prioritized top-3 fixes with effort estimates, confident-vs-hypothesis honesty section, dollar-impact ranges (conservative vs full recovery), next-steps checklist, jargon glossary; (3) **Content Writer** — page-currently inventory table, first-paragraph rewrite with 3-sentence template + sample, per-PAA-question H2 briefs with 40-80 word direct-answer spec + body guidance (300-500 words covering specific bullets per question type), schema-content-match verification step, citations-to-gather table by source type, voice-tone defaults, SEO constraints table, hand-off checklist; (4) **PM (replacing Platform/engineering lens)** — project summary, phase-1/2/3 task tables with owner/effort/dependencies/status columns, critical-path ASCII diagram, risks-and-mitigations table, open questions blocking work, definition-of-done checklist, resource-and-access-needs section; (5) **Sales** — 30-second pitch, 3-4 strongest hooks each with evidence + quotable stat + sales line, "what others would miss" differentiation list, 5 standard objection responses with counter-evidence, close-by-asking-for-strategy-call framing; (6) **Junior SEO Exec** — concept walkthroughs (each with: what it is, how it appeared in this audit, what to do, how to diagnose manually), full glossary, "common mistakes this audit avoided" list. **New file:** `api/lib/seo-technical-audit-lenses.ts` (1613 lines) — NOT a new api/*.ts function. Exports `LensInputs` interface, `LensReports` interface, `renderAuditForAllLenses()` master function, `concatenateLensReports()` (TOC + dividers concat producing single navigable markdown). Per-lens renderers extract data from findings via shared extractors (findCtrFinding, findKeywordPresenceFinding, findDiffuseIntentFinding, findPaaContentGapFinding, findPerPageGa4Finding, findZeroConversionFinding, etc.). `Finding` interface in `seo-technical-audit.ts` made `export interface` so the new module can import it. **Wire-in:** `runTechnicalAudit` post-process changed — instead of single `renderAuditReport()` call, computes `weightedFindingConfidence` once (consolidated, was duplicated), builds `LensInputs` with all 6 severity counts + source-by-source confidence breakdown + serpapi enrichment count, calls `renderAuditForAllLenses()` → 6 markdown strings, concatenates with TOC header. Old `renderAuditReport` function retained but no longer called (backward-compat hedge — can be deleted in cleanup pass). Helper `guidanceForPaaQuestion` provides per-question editorial guidance routed by question keyword pattern (how-to-create, what-is, best/good, free/cost, generic fallback). **Verification:** TS=26 unchanged (pre-existing Oval.tsx errors unrelated), root=0, nodenext clean on touched files, vite green 33s, ReferenceError=0, 12 api/*.ts ceiling intact, 97 api/lib helpers (was 96). **Architecture-level call:** v1 ships concatenated 6-lens output in existing panel report (no UI/DB changes). v2 backlog: lens-selector tabs in UI, separate-row storage for per-lens export, share-this-lens links. Manav's framing on why this matters: "one audit report with sub-standard information" → six purpose-built deliverables each survives senior-practitioner challenge for its target reader. **RETIRED in Phase 16.9** — see above row. Lens module file retained in repo dormant for one phase. | 2026-05-24 |
| **Phase 16.7 — Polish trio from audit-report review (2026-05-24 night, polish):** Three small fixes from the senior-DMS review of the Phase 16.6 alphasoftware audit. **(a) Converging-evidence banner** rewritten to count BOTH red AND amber findings tagged with relevant signals — original Critical-only count produced banner saying 2 signals while listing 3 things (third being the amber diffuse-intent signal). New banner dynamically builds the signal list from what is actually present, shows red+amber mix in the count summary, and lists 4 possible signals: keyword_mismatch, url_not_in_top_10, serp_topic_mismatch, first_paragraph_off_topic. Each gets a description. Format upgraded to multi-line blockquote with bullets so it scans better. **(b) Zero-conversion alert** added as separate finding in checkEngagementSignals. Fires when per-page GA4 returns sessions ≥50 AND conversions == 0. Two-branch explanation (tracking gap vs real funnel problem) plus two-step recommendation (verify GA4 events firing for this pagePath, then audit CTA structure if tracking is working). Threshold of 50 sessions avoids noise on low-volume pages. **(c) Cross-finding relationship note** added as post-process pass after Promise.allSettled. When diffuse-intent SERP fired AND competitive-content benchmark fired AND audited page exceeds median by >150 percent, appends a note to the benchmark finding explaining the median is dragged down by intent diffusion not bloat. Prevents the misleading 278 percent bloat conclusion that the alphasoftware report invited. Also tagged the first-paragraph-off-topic Critical finding with its signal so it participates in convergence detection (was missing). **Verification:** TS=26 unchanged, root=0, nodenext clean, vite green 36s, ReferenceError=0, 12 api/ceiling intact. Smoke-tested: alphasoftware mock with keyword_mismatch + url_not_in_top_10 + first_paragraph_off_topic + serp_topic_mismatch correctly produces 4-signal banner (3 Critical + 1 Warning mix). Polish ship is option 1 of 3 from the post-Phase-16.6 review; option 2 cross-pillar SerpAPI leverage and option 3 other-pillar work to follow. | 2026-05-24 |
| **Phase 16.6 — Tier 3 tech-audit-verifiable additions (2026-05-24 night, final):** Three self-contained checks closing the remaining Not-yet-covered footer gaps. **(1) checkContentFreshness** — aggregates freshness signals from 4 sources: Last-Modified HTTP header, JSON-LD Article schema dateModified/datePublished, visible page text Updated/Published date-pattern detection (matches Jan 15 2024 and ISO 2024-01-15 formats), and year-in-title detection. Picks most-recent reliable date, scores staleness: over 24 months red, 12-24 amber, under 12 green, no date detected info. SEPARATE finding fires when title promises a year (e.g., 2026) but no detected date is from that year — promise-vs-content mismatch surfaced as amber. **(2) checkImageOptimization** — structural signals only (no per-image byte fetching). Filters tracking pixels (1x1, /track/, /pixel/), then measures lazy-loading coverage, alt-text completeness, modern format usage (webp/avif vs jpg/png/gif), srcset/sizes presence. Heuristic thresholds: lazy-loading under 50 percent on 10plus image pages = amber, no modern format on 5plus image pages = amber, alt coverage under 80 percent on 5plus image pages = amber. Pass case green with structural summary. Few-images case info (no verdict warranted). **(3) checkHreflang** — only fires when hreflang annotations are present (single-locale pages skipped, no penalty for absence). Validates ISO 639-1 language codes optionally with ISO 3166-1 region, self-reference (page must list itself), x-default presence, duplicate-language conflicts (same hreflang with different hrefs). Audit-scope footer fully updated: content-freshness, image-optimization, hreflang, anchor-quality, per-page-GA4, schema-validation all moved from Not-yet-covered to covered. Remaining footer gaps narrowed to schema rich-results-test API, full crawl, image byte-weight, font-loading, CSP/security headers. All three checks self-contained, single HTML fetch each, no external API spend. Total tech-audit checks now 15 (was 12 before Phase 16.4). TS=26 unchanged, root=0, nodenext clean, vite green 34s, ReferenceError=0, 12 api/ceiling intact. 600 additional lines in seo-technical-audit.ts. | 2026-05-24 |
| **Phase 16.5 — Tier 2 senior-DMS uplift in tech-audit (2026-05-24 night, late):** Three substantive features closing the long-standing role-lens gaps. **(1) Per-page GA4** finally lands the most-flagged platform gap. New exported function ga4PullPageMetrics in pm-ga4.ts runs a runReport query with dimension pagePath + dimensionFilter for EXACT match on the audited URL pathname, returning engagement metrics (sessions, engaged_sessions, engagement_rate_pct, avg_session_sec, bounce_rate_pct, views, conversions) for last 28 days. checkEngagementSignals refactored to try per-page FIRST; on success, fires real per-URL findings with severity bands (eRate <40 percent red, 40-55 amber, ≥55 green) plus a separate avg-session-duration check when below 30s and sessions ≥50. Falls back to site-wide signal only when per-page returns null (no GA4 connection, no resource_id, no rows for pagePath, or fetch failure) — fallback path now explicitly notes the per-page lookup failed and which path was tried. The site-wide finding the previous report shipped with goes away entirely when GA4 is connected. **(2) Schema validation** turns the FAQPage Pass green check into a real audit. checkSchemaMarkup extended to collect entities by type during JSON-LD parse, then per-type validation: FAQPage validates mainEntity array with Question entities each having name + acceptedAnswer.text AND a visible-content-match check (does each question name appear in the visible HTML — Google policy violation if it does not, can incur manual action). HowTo validates step array. Article/BlogPosting/NewsArticle validate headline+author+datePublished. Product validates name+image+one of offers/aggregateRating/review. Review validates itemReviewed+author+reviewBody-or-reviewRating. ONE consolidated Critical-or-Amber finding emitted per audit (not spam of per-type findings). Existing green Schema present finding retained. **(3) Anchor-text quality** turns the 69 internal links present passing-check into actionable signal. checkOnPageFundamentals internal-links section rewritten to parse anchor TEXT alongside href, classify each as generic/url_based/single_word/descriptive (industry-standard generic-anchor set: click here, read more, learn more, etc.). Aggregates distribution; fires amber when >40 percent generic-or-url-based (with example generic anchors shown), green when >60 percent descriptive, info otherwise. **Verification:** TS=26 unchanged, root=0, nodenext clean on all touched files, vite green 34s, ReferenceError=0, 12 api/ceiling intact. +1100 net lines (mostly tech-audit). Smoke-tested: anchor classifier correctly tags click-here as generic, multi-word phrases as descriptive, Home as generic, raw URLs as url_based. FAQ content-match correctly flags orphaned questions when not in visible HTML. With this ship, every original role-lens gap from the four audit-review rounds is closed at platform level. | 2026-05-24 |
| **Phase 16.4 — Tier 1 SerpAPI leverage in tech-audit (2026-05-24 night):** Three new check functions all powered by the existing SerpAPI call (cached, no new spend). **(1) checkHeadingHierarchyVsPaa** extracts page H2/H3 outline, matches each against the live PAA questions via token-overlap heuristic (50 percent threshold, excluding stopwords). When SerpAPI returned 4 PAA questions and the page answers 0 of them in headings, fires red Content gap finding with the unanswered questions listed as new-H2 candidates and 40-80 word direct-answer guidance. Smoke-tested on alphasoftware mock: correctly finds 0 of 4 PAA matched (red), and on ideal PAA-aligned headings: 4 of 4 matched (green). **(2) checkDiffuseIntentSerp** makes ONE LLM call per audit (Haiku, approximately 0.0003 dollars) classifying top-10 domains into 1-3 word intent categories. When 3+ distinct categories appear flags amber Diffuse-intent SERP finding with category breakdown and SEO-economics warning (CTR ceilings are lower on diffuse SERPs than tight-intent ones at same position). Tagged with signals serp_topic_mismatch to feed converging-evidence detection. **(3) checkCompetitiveContentBenchmark** fetches top-10 URLs in parallel (8s timeout each, best-effort), filters out app stores YouTube PDFs (incomparable content shapes), extracts word count + H2 H3 counts from each, derives median, compares audited page. Renders the per-competitor breakdown inline. Fires red below 60 percent of median, info above 180 percent, green between. **Cleanups bundled:** audit-scope footer updated to move business-impact, heading-hierarchy, diffuse-intent, competitive-content-benchmark, converging-evidence, foundational-fix-sequencing from Not-yet-covered to covered. Remaining backlog: per-page GA4, schema validation, anchor-text quality, content freshness, full crawl. PSI 429 misleading message fixed — no longer says Data Room Integrations (that UI does not exist); now says insert into project_integrations SQL with note that env-var fallback is on backlog. Pre-deploy nodenext check clean. TS=26 unchanged, root=0, vite green 37s, ReferenceError=0, 12 api/*.ts ceiling intact. Total +400 lines in seo-technical-audit.ts. | 2026-05-24 |
| **Phase 16.3 — Six-fix bundle compounding the SerpAPI investment (2026-05-24 evening):** All in seo-technical-audit.ts + serpapi.ts. (1) **decodeHtmlEntities** helper applied at every title/H1/meta extraction point (4 parsers) — fixes "&amp;" rendering. (2) **computeBusinessImpact** translates CTR ratio to missed clicks/month + dollar range, appended after SerpAPI enrichment block on both Critical AND Warning CTR findings. Alphasoftware smoke-tested: 152 missed monthly clicks / \,520-\,560 monthly opportunity. (3) **pickFoundationalCritical** marks ONE Critical with is_foundational=true using 3-rule heuristic (indexability blocker > keyword-pivot recommendation > first-paragraph topicality). Renders as 🎯 prefix + foundational-fix banner explaining sequencing. (4) **detectConvergingEvidence** scans Critical findings for shared signals (keyword_mismatch / url_not_in_top_10 / serp_topic_mismatch); when 2+ corroborate, prepends 🔗 Converging evidence banner before individual findings. Keyword-presence and CTR-position findings now tag themselves with signals[]. (5) **SerpAPI as distinct source** — new enrichment_sources field on Finding; CTR finding records ["serpapi"] when SerpAPI fired. Source-confidence footer now lists "SerpAPI (live SERP enrichment) (X)" alongside primary sources. Per-finding source line shows "enriched by serpapi" annotation. (6) **SerpAPI num bumped 10→100** in serpapi.ts — same cost per call, enables exact position-in-100 reporting vs old binary in-top-10. New top_100_urls / top_100_domains fields added (top_10_* retained for backward compat with cluster-map). Cache key bumped to v2 prefix to force fresh fetch (old v1 entries orphan, expire in 7 days). readCache defensively normalizes any v1-shape entry that slips through. Tech-audit position check now reports exact live position 1-100 or "position 100+". **Pre-deploy nodenext ritual paid off again** — caught a broken function signature in cluster-map (eaten by an earlier str_replace) BEFORE Vercel cold-start would have failed. Also surfaced pre-existing TS2554 in seo-campaign-engine.ts:1005 (Supabase select() overload mismatch on main, not introduced by 16.3, added to backlog). TS=26 unchanged, root=0, vite green 31s, ReferenceError=0, 12 api/*.ts ceiling intact. Backward compatible: features off when SerpAPI unconfigured; old cached entries normalized safely. | 2026-05-24 |
| **Phase 16.2 — SerpAPI deep integration across pillars (2026-05-24 PM):** maximizing the SerpAPI investment now that the foundation file is shipped. **Cluster-map** gets a new `enrichClustersWithSerpApiCompetitors` function called BEFORE the LLM-cited path. For each cluster, picks the highest-impressions query, calls fetchSerpFeatures (7-day platform-wide cache), extracts top-10 domains as verified competitor_owners (excluding project own domain), and detects whether any of the project URLs appears in live top-10 → `own_url_in_top_10` (gold-standard hub signal, replaces URL-slug heuristic guesswork). Falls back to existing LLM path ONLY for clusters SerpAPI couldn't enrich. New source key `serpapi_top10` with confidence 90 (vs llm_ownership at 65). Each cluster's competitor display now labelled with source provenance (`SerpAPI top-10, live SERP fetch` vs `LLM-cited, claude inference`). Verified hub signal renders as 🎯 callout when own URL is in top-10. Methodology footer + "Not yet covered" updated to reflect SerpAPI primary path. **Tech-audit** extracts MORE from the existing SerpAPI call (zero new API spend): (a) PAA questions verbatim — listed as bullet-list with framing "use as section-heading candidates for content gap closure" (content writers use directly for AI Overview citation optimization); (b) Competitive landscape mini-section showing live top-10 domains; (c) Live SERP-position verification — if audited URL appears in live top-10, compares to GSC's average position; if delta >3 positions flags ranking shift since GSC data window; if URL absent from top-10 explains GSC average is driven by other queries (cross-references query-distribution finding). AI Overview recommendation enhanced with PAA-driven tactic #5 ("add H2 sections that answer PAA questions verbatim — these often surface as AI Overview citation candidates"). **Pre-deploy ritual now permanent:** `npx tsc --module nodenext --moduleResolution nodenext --noEmit` against new files before shipping (lesson from the .js-extension hotfix). All changes backward-compatible: projects without SerpAPI key fall through to original LLM path with no behavior change. TS=26 unchanged, nodenext clean, vite green 36s, ReferenceError=0, 12 api/*.ts ceiling intact. | 2026-05-24 |
| **Phase 16.1 — SerpAPI integration v1 (2026-05-24 PM):** the highest-leverage move from the role-lens follow-up analysis. Built foundation file `api/lib/serpapi.ts` (NOT a new api/*.ts function — at 12-ceiling, this is a shared library called from existing pillars). Public surface: `fetchSerpFeatures(query, projectId, opts)` returning structured `SerpFeatures` (ai_overview, featured_snippet+owner, PAA+questions, knowledge_panel, top_stories, video_carousel, shopping_carousel, ads_top/bottom counts, organic_count, top_10_urls, top_10_domains) plus `summarizeSerpFeatures()` helper for finding-detail rendering. **Two-tier key resolution:** (a) per-project override from `project_integrations` (provider='serpapi') for white-label clients with separate billing, (b) platform-wide `SERPAPI_KEY` env var on Vercel — the DEFAULT path for normal multi-tenant operation. SerpAPI keys are account-scoped, so one env var naturally serves all current AND future projects with no SQL ritual when new projects are created. Cache uses `ai_content_cache` with `project_id: null` (platform-wide, since SERP data is public) and 7-day TTL. Returns null on ANY failure (no key, fetch timeout, parse error) — never throws, never blocks the audit. v1 consumer: `checkCtrVsExpected` in seo-technical-audit.ts now accepts campaignKeyword and, when CTR is underperforming (ratio < 0.8) AND SerpAPI is available, fetches the actual SERP and resolves the previous "either (a) title/meta is weak OR (b) features are siphoning" hypothesis. Recommendation is tailored to the dominant feature: AI Overview present → optimize for citation; competitor featured snippet → target the snippet; heavy ads → SEO economics caveat; no features → confirms the title/meta IS the problem. Misleading "Add a SerpAPI key in Data Room → Integrations" recommendation text replaced with accurate env-var instruction (DataRoom.tsx has no integrations-key form — the existing PSI/GA4 messages have the same misleading text, flagged for separate cleanup). Bundle markers verified: import fetchSerpFeatures/summarizeSerpFeatures wired in tech-audit:24,1348,1350; 12 api/*.ts files exactly (ceiling intact); TS=26 unchanged; vite green. Parser smoke-tested against 3 SERP shapes (full-feature commercial / pure organic / AI Overview only) — all parse correctly, summarizer produces tailored output per case. **Activation:** set `SERPAPI_KEY` env var on Vercel; applies to every project automatically. **Cost:** ~1 SerpAPI call per audit run only when CTR underperforms AND key configured; 7-day platform-wide cache means same query across projects = 1 call per week. SerpAPI $50/mo plan supports ~165 daily audits comfortably. **Future consumers (v2/v3, not yet wired):** cluster-map verified competitor_owners (replaces LLM-cited list), hub-candidate ranking with top-10 cross-reference, competitive content benchmark (fetch top-10 word counts → median percentile), freshness comparison. The foundation file makes all four ~30-line glue additions. | 2026-05-24 |
| **Phase 16.0.6 — Senior DMS + client critique follow-up (2026-05-24 PM):** addressed three findings from the role-lens analysis on the deployed scrubbed reports. (1) **LLM-recommendation alignment with Strategic Recommendation** — same report was telling the reader two different things: top of cluster-map said "pivot to 5s audit app" while the per-cluster LLM rec at the bottom said "strengthen the app maker landing page." `buildStrategicRecommendation` refactored to return structured `{markdown, pivot_target}` instead of plain string. When pivot_target is non-null AND a cluster contains the campaign keyword (`cl.campaign_keyword_position` is set), per-cluster rendering replaces the LLM recommendation with: "deprioritize optimization on this cluster's current hub for X. The recommended next step is to run the Technical Audit on the URL ranking for Y, and if content alignment confirms, create a new campaign targeting that keyword instead." Other clusters retain their LLM rec. Override smoke-tested 5/5 across edge cases. (2) **"Match: exact" label confusion in comparison table** — under "Current target" header the label read as "you are correctly matched" when it actually meant "GSC contains exact query string," fighting the message of the entire section. Dropped that row from the strategic-rec comparison table; the remaining 3 rows (target, position, GSC presence: confirmed for both) communicate the misalignment without contradicting framing. (3) **Intent-prompt navigational over-classification** — LLM was tagging generic category searches like "app maker" as navigational. Tightened the prompt with explicit "DO NOT classify generic category searches as navigational" rule + the substitution test ("if you can substitute the query with site:[domain] without changing what the user wants, it is navigational; otherwise it is not") + examples of correct navigational uses (salesforce login, notion templates, github desktop). | 2026-05-24 |
| **Phase 16.0.4 + 16.0.5 — Cluster-map pillar uplifts (two-batch ship + honesty scrub)** — batch 1 (commit `b9c2d9b`) added campaign-keyword-position banner finding, hub-alignment check, coverage-downgrade rules, cluster-cohesion (position spread > 20), thin-cluster honesty (confidence cap 60), recommendation reality-check blockquotes. Batch 2 added: (a) **per-query intent classification** — `enrichQueriesWithIntent` runs a heuristic branded-detection pre-pass (`isQueryBrandedHeuristic` catches the compound-domain case where "alphasoftware.com" → "alpha app" gets flagged via prefix match) then one batched LLM call classifies the rest as informational/commercial/navigational/transactional/branded/unknown. Intent flows through clustering (lexicalClusters preserves references) and surfaces in the per-cluster query table; (b) **intent-diversity finding** — cluster mixing 3+ distinct intents → AMBER "over-aggregated by intent, not just by token overlap"; (c) **branded-query contamination finding** — cluster containing branded queries alongside non-branded → INFO "treat as separate brand-protection campaign"; (d) **Strategic Recommendation section** — rendered ABOVE Findings when warranted: if campaign keyword absent from all GSC queries OR ranks below position 20 AND a non-branded better-positioned alternative exists → pivot recommendation with comparison table. Branded queries correctly excluded from pivot candidates (the alphasoftware case: "alpha app" at pos 8 is filtered out, "5s audit app" at pos 19.4 emerges as top non-branded candidate over campaign kw "app maker" at pos 36.5). **Honesty scrub (2026-05-24 PM, after Manav pushback):** Strategic Recommendation section no longer uses "Option A / Option B" headers, "A Senior SEO Specialist would call this..." framing, or "Senior DMS view:" labels. Hub-alignment and thin-cluster findings scrubbed of "A Senior SEO Specialist would..." persona. Intent-diversity finding no longer leaks "Phase 16.0.5" internal phase reference to user-facing detail text. Methodology footer phase labels renamed: "Quality checks added 2026-05-24" and "Strategic intelligence layer added 2026-05-24". All persona-speak retained ONLY in internal code comments. | 2026-05-24 |

---

## 14b. Session log — historical record of manifesto work (2026-05-23 to 2026-05-24)

The below entries describe what shipped in the manifesto arc. Kept for context, not active work.



🟢 **ChWhom full localization** — shipped 2026-05-23. All 11 keys (`whom_intro` + 5 × `whom_N_title` + 5 × `whom_N_body`) now in `copy.ts` across EN/HI/ES/FR/DE. ChWhom.tsx reads everything via `t()`; no hardcoded English remains.

🟢 **Full manifesto localization** — shipped 2026-05-24. All 15 chapters now render correctly in all 5 languages. `copy.ts` holds 267 keys per language (1,335 total strings). Previously HI was complete but ES/FR/DE were each missing 180 keys — chapters were already wired to `t()`, but missing keys fell back to EN, which is why language switching looked half-working. Fixed by adding all missing translations.

🟢 **Cultural interstitials** — shipped 2026-05-24. New `LocaleInterstitial.tsx` adds language-resonant atmospheric elements distributed along the manifesto length:
- `LocaleDateline` (just after ColdOpen) — quiet single-line geographic anchor: cities + locale timezone tag.
- `InterstitialA` (after Ch04 Pillars, before Ch05 Journey) — cities · cultural-motif SVG · italic maxim.
- `InterstitialB` (after Ch08 Ethics, before Ch09 Data) — maxim · hairline rule · motif · monospaced coord tag.
- `InterstitialC` (after Ch12 FAQ, before Ch13 InPractice) — motif · pre-dawn maxim · cities.

Each renders a small language-specific architectural sketch as inline SVG:
- HI · Mughal jaali six-point star in a hexagon
- ES · Andalusian eight-point star (zellige tile geometry)
- FR · Haussmann mansard roof with dormers and chimneys
- DE · Bauhaus primary geometry (square / circle / triangle / square)
- EN · operator audit nodes joined by a hairline rule

Five new copy keys driving the locale flavor: `locale_cities`, `locale_coord`, `locale_maxim_1`, `locale_maxim_2`, `locale_maxim_3`. Voice rules respected — feather-light opacity (~0.7), generous vertical padding (4.5rem), italic serif maxim, wide-tracked sans cities. Never loud.

🟢 **ChFuture localization** — shipped 2026-05-24. Caught five hardcoded-English `<Prose>` blocks in `ChFuture.tsx` (the chapter's whole body was untranslated). Extracted to keys `future_1` through `future_5`, added translations across all 5 languages. Now 272 keys per language (1,360 total strings). Audit script in repo to catch this pattern: any line that looks like substantive prose JSX content but is not a `t()` call, template literal, or comment.

🟢 **Final hardcoded-string sweep** — shipped 2026-05-24. Audit pass caught the last items that were still rendering English in every language regardless of language picker selection:
- `VOL. I` in the ChColdOpen coordinate mark → `coord_vol`
- `SPEC · 01..06` prefix on every engine spec card → `engine_spec_word`
- `Q4 2025` LiveOps display value → `liveops_since_display`
- Vertical chips (`SaaS · DTC · Legal · Local · B2B`) → `vertical_saas/dtc/legal/local/b2b` (industry abbreviations universal; "Legal"/"Local" translated)
- `Q` prefix on every FAQ row → `faq_q_prefix`
- TopBar `aria-label="Change language"` → `lang_change`
- FloatingNav `aria-label="Chapter navigation"` → `nav_aria`
- AnimatedSignature `aria-label="Manav Sharma, founder signature"` → `sig_aria_label`

Total now 287 keys per language (1,435 total strings). The bundle has been verified to contain HI/ES/FR/DE renderings of every visible element. Brand identifiers that stay English by design: `SEO SEASON` (brand wordmark), `S.E.A.S.O.N.` (brand acronym), `Manav` (proper name).

🟢 **Locale infrastructure** — shipped 2026-05-24. Three deeper fixes for full language switching:
- **`<html lang>` attribute** — was hardcoded `lang="en"` in index.html. Manifesto.tsx now sets `document.documentElement.lang` from the `html_lang` key on every language change. Matters for screen readers, font fallback, hyphenation, and SEO crawler signals.
- **Browser tab title** — was stuck on the global index.html title. Manifesto.tsx now sets `document.title` from the `meta_title` key per language ("SEO SEASON — La Méthode" for FR, "विधि" for HI, etc.). Restores prior title on unmount.
- **FooterMark date** — was formatted with hardcoded `'en-US'` locale, leaving the month in English regardless of selected language. Now uses `t('locale_code')` so the month renders in the active language (Mai for DE, mayo for ES, मई for HI, mai for FR).

Updated `lang_note` (the small note inside the language picker) from "Structural copy localized. Technical deep-dives in English." to "Fully localized." — the disclaimer was inaccurate after the full sweep.

🟢 **i18n parity guard** — shipped 2026-05-24. New file `src/pages/manifesto/copy.assert.ts` runs at module load time and verifies every key in `COPY.en` is present in every other language with a non-empty value. Posts the summary to the browser console on every page load (`[i18n] all 5 languages parity-checked against 287 EN keys — no gaps.`). Sets `data-i18n-ok` and `data-i18n-keys` attributes on the manifesto root so you can verify deployment status from DevTools without any code. If any future regression silently drops a translation, the console fires a `console.warn` listing exactly which keys are missing or empty per language. This makes the kind of issue you spotted in the screenshots impossible to ship without a console warning.

🔴 **Root cause of the screenshots** — diagnosed 2026-05-24. The screenshots showing English body prose in Spanish mode were not a translation gap. They were a **deploy gap**. Re-cloning `github.com/manav909/Manav-SEO` revealed that **nine chapter files on the main branch have zero `t()` calls** — they render hardcoded English prose regardless of the language picker:
- ChCompare, ChData, ChEthics, ChFounder, ChHowSearch, ChJourney, ChPillars, ChProblem, ChVision

The `t()`-using versions of these chapters lived only in my workspace. Each previous turn's deploy command only listed the files I touched that turn, so the per-turn approach silently left the original hardcoded chapters in place on production. The brief's claim that all chapters were wired was based on a stale assumption.

**Operating lesson:** at the start of every session, re-clone from GitHub to see ground truth — not just the brief. The brief documents intent; the repo documents reality.

🟢 **Devanagari rendering fix** — shipped 2026-05-24. The `TextReveal` component in `src/pages/manifesto/shared.tsx` was splitting chapter titles by Unicode code points using `Array.from(word)`. Devanagari uses combining vowel marks (matras like `ि`, `ा`, `े`, `ं`) and halant (्) that must attach to their base consonant. Splitting by code point orphans these marks, and the browser renders them as dotted circles — Unicode's "no base to attach to" indicator. The Hindi chapter title `जिस समस्या को हम हल करते हैं` was being shredded into 28 separate animated spans where "जि" got torn into "ज" + "ि" and "स्या" into "स" + "्" + "य" + "ा". Fix: split by grapheme clusters using `Intl.Segmenter({ granularity: 'grapheme' })`, falling back to `Array.from` on browsers that predate it (Safari <14.1, Chrome <87). Same fix protects Tamil, Bengali, Arabic, emoji ZWJ sequences, and flag sequences. The animation timing is unchanged — each cluster still feathers in with the same per-character delay.

**Deployment verification path** — after running the deploy command and waiting for Vercel:
1. Open browser DevTools console on `/manifesto`. You should see `[i18n] all 5 languages parity-checked against 287 EN keys — no gaps.`
2. Inspect the root `<div class="manifesto-root">` — it should carry `data-i18n-ok="true"` and `data-i18n-keys="287"`.
3. The JS bundle filename includes a content hash. After a successful deploy the hash changes (e.g. `index-D2tYDKna.js`), which guarantees the user's browser downloads the fresh code instead of serving a cached older bundle.
4. If the screenshots still show English in non-English mode after that, the issue is on the deploy/Vercel side — not in the source.

🟢 **Chapter 13 "In Practice"** — shipped 2026-05-23. Anonymized 4:47 AM scenario showing the drift engine catching AI Overview cannibalization. Three timestamped scene beats (04:47 alert → 11:00 three response paths → 12:30 client got audit trail before they had the problem) + Statement + close. Localized 5 langs (8 keys × 5 langs = 40 strings). ChFuture shifted to Ch14. Honest framing: "scenario is composite, patterned on the class of incident SEASON catches in active engagements, told as it would actually unfold."

---

## 15. Recent deploy notes

- Vercel CDN edge cache TTL is ~15-20 minutes — wait that long before assuming a deploy is broken
- After Step 2 force-rebuild (commit `0da2d35`), the journey-arc deploy DID succeed but edge cache served stale HTML for ~15 min before clearing
- Manav confirmed live site showing the journey-arc content correctly via screenshot before requesting the humble + interactive iteration

### 15.1 ChColdOpen regression 2026-05-23 (commit `c269beb`)

**What happened**: deploying ChWhom + brief, the deploy chain also cp'd `~/Downloads/ChColdOpen.tsx` "for safety." Manav's Downloads folder had an older version of ChColdOpen.tsx (the V5 grand-entry-MANAV-at-top version from commit `1bac046`, which had been explicitly rejected). The cp overwrote the live humble+interactive version with the old rejected one. Got committed and deployed as `c269beb`.

**Repaired by**: recovering ChColdOpen.tsx from git history at `58d31ec` (the original humble + interactive ship) and force-deploying it. The era-centered copy.ts changes from `73d0302` were unaffected (regression was ChColdOpen.tsx only), so post-repair the file renders the era-centered copy correctly via the t() keys.

**Prevention rule**: when a deploy chain re-cp's a file "for safety" that's supposedly unchanged from main, ALWAYS verify the local Downloads version matches by hash before adding/committing. Better — only cp files that have actual changes. The "re-cp for safety" pattern carries silent regression risk if Downloads is older than main.

---

## 16. Honest call-outs (carried forward)

1. **Era claim is verifiable** — "AI changed search; the agency model built for the old era hasn't caught up" rests on shipped AI search products (Google AI Overviews, ChatGPT Search, Perplexity, AI Mode) and the persistence of legacy SEO operating models. True today.

2. **"State-of-the-art" claim is positional** — what SEASON does (continuous GSC+GA4 refresh, source-cited metrics, audit trail, 12 always-on engines) is at the current frontier of the SEO operating-infrastructure category. Not "the best in the world" — "the frontier where this category currently is." Defensible.

3. **AIConcierge + profile avatar visible on `/manifesto`** — should be hidden for cinematic cleanness. Awaiting Manav's go-ahead before touching the app shell.

4. **Persona-speak in user-facing strings is prohibited (lesson 2026-05-24 PM)** — pillar reports must never write "A Senior SEO Specialist would call this…" or "The data says option (b)" or any phrasing that puts the audit in the position of a persona delivering authority. Manav IS the senior specialist; the audit's job is to deliver facts traceable to data, not perform expertise. Internal code comments retaining "Senior DMS" framing are fine (documentation). User-facing strings (`finding_detail`, `recommendation`, methodology footer headers, Strategic Recommendation copy) get scrubbed to direct data-anchored statements. Same lesson applies to "option (a)/(b)" rhetorical scaffolding — list options without labels, or commit to one with evidence.

5. **Heuristic generality requires explicit suppression rules (lesson 2026-05-24 PM)** — pure run-length or frequency heuristics can hallucinate suggestions on edge-case titles ("Welcome to Our Site" → "welcome site", "Best Beaches in Goa for First-Time Visitors" → "first time visitors"). Discipline: expand stopwords to filter generic web/marketing chrome, AND add a positional gate (the suggested phrase must anchor on the FIRST title-significant token — topics appear at the start of titles, qualifiers at the end). When no high-confidence phrase can be extracted, return empty and let the audit fall through to a generic recommendation. Better to make no call than the wrong call. Smoke-test against ≥6 different title patterns before shipping.

---

## 17. Session handoff prompt for next chat

> "Continuing SEO SEASON. Brief attached. Manifesto now 14 chapters with new ChFAQ (Doubts Resolved) as Ch12 + Live Ops panel in ChEngine. Cold open ACT 5 now ends with animated SVG signature of 'Manav Sharma' drawn with Allison handwriting font + glowing pen tip (1.9s write, ~2.8s total). Layout work paused. Don't change anything without confirming."

---

## 18. Technical audit pipeline (Phase 16.x)

The technical audit is the headline deliverable Manav sends clients. It runs 15 checks per audit, produces a single deep-doc report with stable §-IDs, and is the most-iterated-on part of the SEO Season codebase.

### Architecture (post-Phase 16.11)

```
runTechnicalAudit (api/lib/seo-technical-audit.ts, ~3540 lines)
  ├── 15 checks → Finding[]
  ├── pickFoundationalCritical → flags is_foundational
  ├── propagateKeywordPivotClusterSignal → cross-finding signal
  ├── detectConvergingEvidence → banner
  └── deepReportInputs: DeepReportInputs
        ├── renderDeepAuditReport(inputs)       → markdown  (body_md)
        └── renderDeepAuditReportHtml(inputs)   → HTML      (body_html)  ← Phase 16.11
              ↓
        writeReportToPanel({ bodyMd, bodyHtml, ... })
              ↓
        seo_campaign_reports table
              ↓
        Panel UI / download endpoints
```

### Files

- `api/lib/seo-technical-audit.ts` — 3542 lines. The check orchestration, finding emission, post-processing pipeline.
- `api/lib/seo-technical-audit-deep-report.ts` — 1884 lines. Markdown renderer + all evidence extractors. Extractors are exported and reused by the HTML renderer.
- `api/lib/seo-technical-audit-html.ts` — NEW Phase 16.11 (~1300 lines). HTML renderer producing self-contained HTML with embedded CSS, semantic anchors, clickable cross-refs, print-optimized @page rules, CSS critical-path diagram (no ASCII art).
- `api/lib/seo-technical-audit-lenses.ts` — 1613 lines, dormant. Retired in Phase 16.9 when multi-lens was replaced by deep-doc.
- `api/lib/seo-campaign-engine.ts` — adds `bodyHtml?: string` to `writeReportToPanel`, persists to `body_html` column.

### Storage

Same row in `seo_campaign_reports` carries both formats:
- `body_md` — markdown (existing, unchanged)
- `body_html` — HTML (Phase 16.11; nullable for legacy reports)

The HTML is the same content, semantically richer (clickable §-anchors, severity badges with CSS, collapsible JSON evidence). Frontend can offer "Download as HTML" → save as `.html`, then user opens in Word for native DOCX conversion, or prints in browser for native PDF.

### Phase ship log

- **16.1–16.7**: SerpAPI leverage; senior-DMS uplift (per-page GA4, schema validation, anchor-text); freshness/image/hreflang checks; converging-evidence banner. All DEPLOYED.
- **16.8**: Multi-lens architecture. DEPLOYED, RETIRED 16.9.
- **16.9**: Deep-doc architecture replaces multi-lens. DEPLOYED; had ~26 small bugs surfaced in production audit on `alphasoftware.com`.
- **16.10**: 8-fix surgical pass — `pickFoundationalCritical` wire-in, `propagateKeywordPivotClusterSignal` cluster signal, §0.1 dynamic xref count, §0.2 sequential numbering, image inventory full population, competitive content evidence completeness, PAA body guidance, empty-Phase-1 handling. DEPLOYED, VERIFIED 21/21 fixes working in production output (2026-05-23 re-audit).
- **16.11**: HTML renderer for clean DOCX/PDF export. SHIPPING NOW. Tier 2 of three options (Tier 1 = markdown polish only, Tier 3 = native DOCX+PDF generators). HTML is the universal pivot — browser print-to-PDF + Word "Open HTML" both produce production-grade output.

### Phase 16.11 deploy notes

1. **SQL migration is required FIRST** in Supabase Dashboard before code deploys. The migration adds the nullable `body_html` column to `seo_campaign_reports`. Without it, the audit insert will fail.
2. **Frontend download/toggle is NOT in this ship.** This phase ships the renderer + storage. Frontend "Download HTML" button is Phase 16.12 work (or Manav can wire it up with a simple Supabase query → blob → download flow).
3. **Existing audit reports remain readable** — `body_html` is nullable; older reports just have `body_md` populated. No backfill required.
4. **HTML is regenerated per audit run** — no caching, no separate generator endpoint. Same source of truth as markdown.

### Verification at next audit run

After deploy, the next audit produces both renderers' output. Sanity check:
- `seo_campaign_reports.body_html` is populated for the new row
- HTML file size is ~50-120 KB depending on findings count
- Opening the HTML in browser shows: clickable TOC, severity badges with color, collapsible Raw evidence sections, working internal §-anchors
- Browser File → Print → Save as PDF produces a clean PDF with page breaks before each §-section
- Opening the same HTML in Word produces a structured doc with native heading styles

### Code rules (enforced)

- **Never patch** — deliver complete files only
- **Never add new `api/*.ts`** — at 12-function hard ceiling
- **Always `.js` extension** on relative imports (Vercel runtime requirement)
- **Pre-deploy ritual mandatory**: `npx tsc --module nodenext --moduleResolution nodenext --noEmit` on touched api/lib files. Only pre-existing error in `seo-campaign-engine.ts:1005` (TS2554) is acceptable.
- **Smoke test against production-shaped fixtures** — Phase 16.9 lesson: fixtures using renderer-friendly shapes hide bugs that appear with real audit evidence shapes.

### Phase 16.11.1 hotfix (2026-05-24)

Symptom: audits appeared to start then stop in microseconds with no visible result.

Most likely cause: SQL migration `phase-16-11-body-html.sql` was not applied to production before code deploy, so every audit completed its 15 checks but the final `INSERT INTO seo_campaign_reports` failed on the missing `body_html` column. `runTechnicalAudit` doesn't check `writeReportToPanel`'s return value, so it returned `success: true` to the frontend with the toast firing — but no new row landed in the DB, and the panel had nothing new to display.

Two defensive changes:

1. `seo-technical-audit.ts:518` — `renderDeepAuditReportHtml(deepReportInputs)` now wrapped in try/catch. If the renderer throws on any unanticipated finding shape, the audit logs the error and continues with markdown only. HTML is a convenience export layer, never a blocker.

2. `seo-campaign-engine.ts` `writeReportToPanel` — if the insert fails with an error containing `body_html`, retry the insert with that field omitted. The markdown report still gets saved; HTML persistence is silently skipped until the SQL migration is applied. Warning is logged so Vercel logs surface the missing-migration state.

After this hotfix, audits work regardless of whether the SQL migration ran. Applying the migration in Supabase enables `body_html` persistence; not applying it just keeps the current markdown-only behavior.

### Phase 16.11.2 rollback (2026-05-24)

After Phase 16.11.1 hotfix did not restore audits, the HTML render wire-in was rolled back to isolate it from runtime entirely:

- `seo-technical-audit.ts:33` — `import { renderDeepAuditReportHtml } from "./seo-technical-audit-html.js";` commented out.
- `seo-technical-audit.ts:518` — `renderDeepAuditReportHtml(deepReportInputs)` call removed; `bodyHtml` set to `undefined` unconditionally.
- `writeReportToPanel` retains its `bodyHtml` parameter and the missing-column retry guard (cheap safety net, no behavioral change when `bodyHtml` is undefined).
- `api/lib/seo-technical-audit-html.ts` remains in the repo, untouched, unreferenced at runtime.
- `sql/phase-16-11-body-html.sql` is harmless whether applied or not (adds a nullable column that nothing writes to until the rollback is reverted).

Effect: returns the audit module to the Phase 16.10 verified-working state. No HTML renderer code participates in cold-start or runtime.

Diagnostic value:
- **If audits work after this rollback** → Phase 16.11 was the cause. Next iteration: introduce the HTML renderer behind a feature flag, log the loading sequence, identify the actual runtime failure mode.
- **If audits still don't work after this rollback** → cause is OUTSIDE Phase 16.11. Look at Vercel function quota / invocation count, Supabase project state (paused, exceeded), GSC/GA4 auth token expiry, or upstream code changes I'm not aware of.

The senior-DMS rule applies: don't add the HTML rendering back until the underlying symptom is root-caused with runtime evidence (Vercel function log line for a failing audit invocation). The renderer is convenience; the audit is the product.

### Phase 17.0 — Audit-to-pipeline bridge (2026-05-24)

First foundational ship of Track 2 from STRATEGY.md. Makes the technical_audit pillar's findings available to every season pipeline step via `ctx.audit_findings`.

**What it does:**

- `PipelineStepContext` interface gained `audit_findings: Finding[]` (required field, defaults to empty array)
- New helper `loadLatestAuditFindings(campaignId): Promise<Finding[]>` in `season-pipeline-runner.ts` — queries `technical_audit_findings`, returns the most-recent audit run's findings, gracefully returns `[]` on any failure
- New helper `resolveCampaignIdForRun(runId, scope)` — reads campaignId from scope first, falls back to looking up `season_pipeline_runs.campaign_id`
- All four ctx-construction sites wired: `runPipeline`, `runPipelineWithExistingRow`, `executeNextPendingStep`, the in-loop `retryStep`
- Loading is once-per-runner-invocation (cached for the run's lifetime), so no per-step DB query overhead

**What it explicitly does NOT do (yet):**

- Doesn't change any step's behavior. Every existing step handler ignores `ctx.audit_findings` because it didn't exist before. Steps that want to leverage audit intelligence will be wired in subsequent phases (17.1+).
- Doesn't introduce new pipeline triggering. Pipelines still run once at campaign creation; the rerun problem from STRATEGY.md remains open.

**Verification:**
- Vercel runtime TS check on touched files clean (only pre-existing `seo-campaign-engine.ts:1021` error remains).
- Frontend TS baseline: 27 (unchanged).
- API ceiling: 12 (unchanged).
- Vite build green.
- No runtime smoke test — change is purely additive infrastructure; verification will be in Phase 17.1 when the first step uses the new data.

**Next phases queued (per STRATEGY.md Section 5, Track 2):**
- Phase 17.1 — wire `competitor_snapshot` to use audit's SerpAPI top-10 instead of LLM-guessed top-5 (highest-leverage first step; eliminates one LLM call + hallucination risk per pipeline)
- Phase 17.2 — wire `content_brief` to consume PAA gap, first-paragraph topicality, schema policy, competitive content benchmark from audit
- Phase 17.3 — wire `forecast` to use audit's `business_impact` for dollar-anchored projections
- Phase 17.4 — wire `client_update` + `internal_handover` to consume audit's §0 + §7
- Phase 17.5 — L1 manual "Refresh from audit" panel button + task-engine action wrapping `retryFromStep`
- Phase 17.6 — L2 step-level dependency declarations + material-change gate for cron-driven refresh

### Phase 17.1 — competitor_snapshot wire-in (2026-05-24)

First step to actually consume `ctx.audit_findings`. Replaces the LLM call with audit-sourced verified SerpAPI data when available.

**What it does:**
- New helper `buildCompetitorSnapshotFromAudit(findings, keyword)` in `season-pipeline-rank-for-keyword.ts` — extracts top-10 URLs/domains from CTR finding evidence, median word count from competitive_content_benchmark, intent diversity from diffuse_intent, PAA gap from content gap finding. Returns the same shape the existing LLM path produced, sans qualitative judgments (page_format/why_it_ranks).
- `renderCompetitorArtifact` made resilient — skips fields that are missing instead of rendering "undefined".
- `competitor_snapshot` handler reordered preference: **Audit > Cache > LLM**. When audit data is available (CTR finding has 3+ top_10_urls), use it directly with `llm_calls: 0`. Cached audit-sourced result is persisted so other readers see it as authoritative.

**Cost impact per pipeline run:**
- Before: ~$0.30-0.50 for one LLM web-search call to identify 5 top pages
- After: $0 when audit available, identical to before when not
- Hallucination risk: eliminated when audit available (real URLs vs LLM-guessed)

**Trade-off:**
- Audit-sourced output omits `page_format` / `structure_pattern` / `why_it_ranks` (qualitative judgments not in audit data). Downstream steps consuming `competitors.top_pages` only read `domain` (verified working). The cosmetic artifact body loses three lines per page in exchange for verifiability.

**Verification:**
- Vercel runtime TS clean (touched files + runner).
- Frontend baseline: 27 (unchanged). API ceiling: 12 (unchanged). Vite green.
- Smoke test with 5 fixtures (empty, no-CTR, too-few-URLs, real alphasoftware-shape, domain-fallback) all pass.
- Production title format `Diffuse-intent SERP for "X" — N distinct intent categories` matches regex. CTR title format `CTR is N% of expected for position X` matches regex.
- `_source_note` correctly reads 'cached SerpAPI snapshot' vs 'fresh SerpAPI fetch' from `evidence.cache_hit`.

**Diff:** 1 file changed, 141 insertions, 7 deletions in `season-pipeline-rank-for-keyword.ts`.

### Phase 17.2 — content_brief wire-in (2026-05-24)

The first creative step to consume `ctx.audit_findings`. Highest UX-impact wire-in — writers read the brief artifact directly. Replaces LLM-guessed structural decisions with audit-anchored ones.

**What it does:**
- New helper `extractAuditContextForBrief(findings)` in `season-pipeline-rank-for-keyword.ts` — extracts structured signals from audit findings: target word count (from competitive_content_benchmark median), mandatory H2 candidates (from PAA gap's `evidence.unanswered`), schema guidance (from schema findings), first-paragraph requirement (from first-paragraph topicality findings), SERP features (AI Overview / featured snippet / PAA count / ads from CTR finding evidence), intent warning (from diffuse_intent), and red-severity critical signals.
- New helper `formatBriefAuditContextForLlm(context, keyword)` produces a structured `AUDIT INTELLIGENCE` block that gets injected into Stage 1 (skeleton) of the brief's userMessage.
- Stage 1 system prompt updated with explicit rule to honor the AUDIT INTELLIGENCE block as verified ground truth (use its target_word_count, include PAA H2 candidates verbatim in section_headings, honor schema guidance, reflect SERP features in unique_angle).
- Brief output gains `_audit_sourced_signals` metadata for downstream transparency.
- `renderBriefArtifact` adds a 🎯 **Audit-anchored decisions** section near the top so writers immediately see which structural choices came from audit ground truth vs LLM judgment.

**Why it's hybrid (not full replacement like 17.1):**
Brief skeleton needs creative judgment for title, meta description, unique angle, secondary keywords. Audit data ANCHORS the structural decisions (word count, H2 set, schema, intent class) but doesn't replace the LLM call entirely. Cost: same 1 LLM call. Quality: significantly higher (anchored not guessed).

**What's anchored vs synthesized after Phase 17.2:**
| Decision | Before | After (when audit available) |
|---|---|---|
| target_word_count | LLM guess (often 2500 default) | Competitor SERP median (verified) |
| section_headings | LLM-generated 6-10 H2s | LLM plus 4-6 verbatim PAA H2 candidates |
| schema_recommendation | LLM choice | Audit's recommendation honored |
| First-paragraph topicality | Not addressed in skeleton | Required (40-60w, keyword in sentence 1) |
| Critical signals visibility | Hidden in audit panel | Surfaced in brief's audit-anchored section |
| AI Overview awareness | Not signaled | Explicit in unique_angle guidance |

**Verification:**
- Vercel runtime TS clean (touched files + runner).
- Frontend baseline: 27 (unchanged). API ceiling: 12 (unchanged). Vite green.
- Smoke test with 4 fixtures (empty, real alphasoftware-shape, sparse-single-signal, all-PAA-answered) all pass.
- Real alphasoftware fixture extracted 7 signals (target word count 3052, 4 PAA candidates, schema guidance, first-paragraph requirement, SERP features note, intent warning, 2 red critical signals).
- Production title regexes verified against actual finding emissions.
- Formatted LLM block is rich, explicit, instructive — exactly what's needed for skeleton anchoring.

**Diff:** 1 file changed, 209 insertions, 3 deletions in `season-pipeline-rank-for-keyword.ts`.

### Phase 17.3 — forecast wire-in (2026-05-24)

Turns forecast from a modeled projection into a grounded picture by adding audit-anchored sections. Two additive opportunity layers now surface:
- **Forecast layer** (modeled) — clicks from moving up the SERP
- **Audit-anchored layer** (verified) — dollar opportunity from fixing CTR at the *current* position

The audit's CTR business_impact carries `{missed_clicks, expected_clicks, dollar_low, dollar_high}` computed from SerpAPI-verified expected CTR for the audited position. Showing both layers makes the forecast verifiable: clients can see what's available immediately (CTR recovery) and what compounds over the horizon (rank gain).

**What it does:**
- New helper `extractAuditContextForForecast(findings)` — extracts CTR business_impact + business_impact_position/actual_ctr/expected_ctr, content_depth_gate (when word_ratio < 0.8), intent_diffusion (when distinct_categories ≥ 3), foundational_signal (first red finding as proxy until is_foundational is persisted), and critical_caveats (additional reds).
- New helper `renderForecastAuditSection(ctx)` — emits two markdown sections:
  - `## Audit-anchored opportunity (current-position recovery)` — table of missed clicks / expected clicks / dollar range / position, plus explanation that this layer stacks additively with the rank-improvement forecast above
  - `## Forecast preconditions (audit-identified)` — foundational fix candidate, content depth gate (with quantified downward adjustment if ignored), intent diffusion ceiling, other red signals
- Forecast handler appends `auditSection` to the rendered body when audit data is available
- Output gains `_audit_anchored` metadata for downstream (client_update, internal_handover, reconciliation)
- `honest_note` extended with audit-anchored signal summary

**Why it's additive (not replacement):**
The forecast engine's modeled targets stay as-is. Audit data ENRICHES the artifact with verified opportunity quantification but doesn't override the modeled projections — clients see both views and can reconcile their own assumptions.

**Verification:**
- Vercel runtime TS clean (touched files + runner).
- Frontend baseline: 27 (unchanged). API ceiling: 12 (unchanged). Vite green.
- Smoke test with 4 fixtures (empty, real alphasoftware-shape, CTR-without-business_impact, content-depth-only) all pass.
- Real alphasoftware fixture extracted 5 signals (business_impact $970-$2,910/mo, foundational keyword-mismatch, depth gate 36%, intent diffusion 4 categories, 1 additional red).
- Rendered section shows both opportunity layer table AND preconditions bulleted list with quantified depth adjustment.
- Test 3 (CTR without business_impact) correctly returns null — no actionable signal.
- Test 4 (only content depth gate) correctly returns just the preconditions section (no opportunity section).

**Diff:** 1 file changed, 192 insertions, 6 deletions in `season-pipeline-rank-for-keyword.ts`.

### Phase 17.4 — client_update + internal_handover wire-in (2026-05-24)

Wires the pipeline's distribution layer to audit reality. Both step handlers now reflect what the audit actually found instead of generic "we analyzed competitors" talking points.

**What it does:**

**Shared extractor** `extractDistAuditContext(findings)` produces 10 signals: business_impact (CTR-recovery dollar opportunity), foundational_signal (first red as proxy), content_depth_gate (words_to_add quantified), first_para_issue, schema_recommendation, paa_gap_count, ai_overview_present (boolean), intent_diffusion, red_findings array, amber_findings_count.

**Two render paths:**

1. **`formatAuditContextForClientUpdate(ctx)`** — produces a tone-neutral facts block injected into the client_update LLM's userMessage. The system prompt explicitly forbids the words "audit" or "pipeline" — Manav's voice naturally weaves real findings ($X-Y/mo opportunity, "the biggest single issue", content investment requirement, AI Overview implication) without exposing tooling.

2. **`renderHandoverAuditSection(ctx)`** — deterministic markdown appended to the template-only internal_handover. PM-ready priority-ordered backlog: P0 (foundational fix), P1 (other reds), P2 (quantified opportunities with effort estimates), ceiling constraints (intent diffusion). No LLM cost.

**Wired into both handlers:**
- `client_update` handler injects auditBlock into userMessage, surfaces `_audit_signals_used` metadata in output, extends honest_note to confirm audit anchoring
- `internal_handover` handler appends auditSection to body, surfaces `_audit_anchored_backlog` in output (structured signals for downstream PM module / future kanban_task auto-creation), extends honest_note

**Real-output example (alphasoftware fixture, 8 signals):**

Client update LLM prompt now includes facts like "Concrete opportunity available right now: roughly $970–$2,910/mo from fixing how the existing position converts to clicks. ~97 additional clicks/month at current rank." The LLM weaves this into Manav's voice without mentioning audit/pipeline.

Internal handover now appends:
```
## Audit-identified work items (priority-ordered)
### 🎯 P0 — Foundational fix: Campaign keyword "app maker" missing from title + H1
### ⚠️ P1 — First paragraph is off-topic
### 🛠 P2 — Quantified opportunities:
- CTR recovery $970-$2,910/mo (medium effort)
- Content depth: add ~1,956 words (high effort)
- First paragraph rewrite (low effort, 30 min)
- Schema implementation (low-to-medium)
- PAA H2 coverage (bundled into depth)
- AI Overview citation optimization (medium)
### ⚠ Ceiling constraint: SERP is intent-diffuse (4 categories)
```

**Verification:**
- Vercel runtime TS clean (touched files + runner).
- Frontend baseline: 27 (unchanged). API ceiling: 12 (unchanged). Vite green.
- Smoke test with 3 fixtures (empty, full alphasoftware-shape, sparse foundational-only) all pass.
- Full fixture extracted 8 signals, generated 7-bullet LLM injection block + complete P0/P1/P2 handover section.

**Diff:** 1 file changed, 266 insertions, 7 deletions in `season-pipeline-rank-for-keyword.ts`.

### Phase 17.5 — Manual refresh from audit (2026-05-24)

L1 refresh primitive. Solves the "pipeline ran once, audit refreshed, artifacts stayed frozen" problem at the smallest possible scope: a manual button per pipeline run that resets all audit-consuming steps to pending so they re-run with the latest audit findings.

**What it does:**

| File | Change |
|---|---|
| `api/lib/season-pipeline-runner.ts` | Added `consumes_audit?: boolean` field to `PipelineStep` interface |
| `api/lib/season-pipeline-rank-for-keyword.ts` | Tagged the 5 audit-consuming steps (`competitor_snapshot`, `content_brief`, `forecast`, `client_update`, `internal_handover`) with `consumes_audit: true`. Added exported helper `findFirstAuditDependentStepIndex(definition)` that returns the earliest such step's index. |
| `api/lib/season-pipeline-routes.ts` | New `bsSeasonPipelineRefreshFromAudit(body)` route function. Validates `runId` → loads run + verifies it's campaign-linked → checks an audit has actually run for that campaign (clear error if not) → builds the pipeline definition for `pipeline_type` → locates first audit-consuming step → calls existing `retryFromStep(runId, stepIndex)` to reset all steps from that index forward. Returns `{ success, steps_reset, first_step_index, first_step_id, first_step_label, audit_run_id, note }`. |
| `api/lib/brand-studio.ts` | New dispatcher case `bs_season_pipeline_refresh_from_audit` |
| `src/components/pm/api.ts` | New typed client function `seasonPipelineRefreshFromAudit({ runId })` |
| `src/components/pm/SeoCampaignsPanel.tsx` | New "Refresh from audit" button on each completed pipeline run row in the campaign detail drawer. Includes `refreshingRunId` state + `handleRefreshPipelineFromAudit` handler with confirm dialog + toast feedback. After successful reset, calls `load()` to refresh the panel state. Button tooltip explains exactly which steps reset. |

**How the user flow works:**
1. User opens a campaign's detail drawer in SeoCampaignsPanel
2. Sees list of pipeline runs (the existing read-only listing)
3. For any `completed` run, sees a "Refresh from audit" button
4. Click → confirm dialog → backend resets the 5 audit-consuming steps to pending
5. Toast confirms reset, mentions the dashboard where re-execution can be driven
6. Panel reloads showing updated state (status now 'retrying', steps_completed reduced)
7. To actually re-run, user navigates to the pipeline dashboard which has the execute loop

**Architectural notes:**
- Reuses existing `retryFromStep` primitive (no new execution machinery)
- `consumes_audit` flag on PipelineStep is the foundation for Phase 17.6's dependency-based selective refresh
- Backend validates audit existence BEFORE reset (no orphan retries)
- Frontend doesn't auto-drive execution from the panel — keeps the panel scoped to status display; full re-execution happens in the dashboard where the loop already exists

**What this explicitly does NOT do (yet):**
- No automatic refresh on audit cron (that's Phase 17.6 with material-change gate)
- No per-step granular refresh (always resets ALL audit-consuming steps, in order)
- Doesn't auto-drive execution after reset (user opens dashboard)

**Verification:**
- Vercel runtime TS clean on touched files (`seo-campaign-engine.ts:1021` pre-existing + 3 other pre-existing errors in war-room/grouping confirmed via diff vs origin/main).
- Frontend baseline: 27 (unchanged). API ceiling: 12 (unchanged). Vite green.
- 5 smoke tests of `findFirstAuditDependentStepIndex` (multi-step definition with first audit-consumer at idx 2, no audit consumers, only-last audit consumer, null definition, no-steps definition) all pass.

**Diff:** 7 files changed, 209 insertions, 11 deletions.

### Phase 17.5.1 — Refresh button drives execution (hotfix, 2026-05-24)

**Why this exists:** Phase 17.5 shipped a refresh button that reset audit-consuming steps but then displayed a toast saying "open the pipeline dashboard to drive re-execution." Manav clicked the button in production and reported "one confirmation pop up came and then started but stopped immediately and I couldn't see anything happened or result." That's exactly what 17.5's flow produced — backend silently did its job, toast disappeared in 3 seconds, nothing visible happened. The user shouldn't have to know there's a separate dashboard.

**What 17.5.1 fixes:**
The handler now owns the complete refresh lifecycle:
1. **Resetting phase** — calls `seasonPipelineRefreshFromAudit`, shows inline "Resetting audit-consuming steps…" with spinner on the run row
2. **Executing phase** — loops `seasonPipelineExecuteNext` calls (same pattern as SeasonPipelineDashboard's `driveExecution`), updating inline "Re-running step X of Y: 'step label'" as each step completes
3. **Completed phase** — shows green check + "Refreshed N steps with latest audit data. Artifacts are live." for 12 seconds, then auto-clears
4. **Failed phase** — shows red alert + specific error reason for 10 seconds

**State architecture:**
- `refreshProgress: Record<runId, RefreshState>` — per-run progress map so multiple runs can refresh in parallel (though usually only one at a time in practice)
- `refreshingRunsRef: useRef<Set<string>>` — double-fire guard preventing the same run being refreshed twice
- Per-step status updates flow from `seasonPipelineExecuteNext`'s return value (`step_index`, `step_label`, `run_status`, `no_more_steps`)

**Loop safety:**
- Hard cap at 30 step kicks (audit-consuming pipeline has 5 audit-dependent steps; the cap is generous safety margin)
- Terminal states (`completed` / `failed` / `cancelled` / `no_more_steps`) break the loop immediately
- 200ms sleep between kicks lets React render progress updates and the polling loop catch up

**UI changes:**
- Pipeline run rows became flex-column instead of flex-row to accommodate the inline progress strip below the row header
- Refresh button hides during refresh (replaced by the inline strip)
- Three distinct visual states (blue executing, green completed, red failed) — clear status at a glance, no ambiguity

**Files changed:** 1 (`src/components/pm/SeoCampaignsPanel.tsx`).

**Verification:**
- Frontend TS baseline: 27 (unchanged). No errors introduced in SeoCampaignsPanel.
- Vite build: green.
- Pattern mirrors the proven SeasonPipelineDashboard execute loop — well-tested code path.

**Diff:** 1 file changed, 217 insertions, 53 deletions.

### Phase 17.5.2 — Production hotfix: duplicate retryStep removed (2026-05-25)

**The bug Manav hit in production:** clicked "Refresh from audit" → received error `Refresh failed: Identifier 'retryStep' has already been declared`.

**Root cause:** `api/lib/season-pipeline-runner.ts` had TWO `export async function retryStep(...)` declarations:
- Line 645 (legacy): `{runId, stepIndex, definition}` → returns `PipelineStepResult` — inline-executes the step in the same call. Phase 12-era pattern.
- Line 1350 (current): `{runId, stepIndex}` → returns `{success, new_retry_count}` — just marks the step pending, lets `executeNextPendingStep` pick it up. Phase 13a-v2 pattern.

The legacy version had **zero callers** in `api/` or `src/` — confirmed with grep before removal. Replaced by the second declaration when the Phase 13a step-by-step execution model was introduced, but never deleted.

**Why it didn't break sooner:** Local TS compilation under `skipLibCheck` tolerates the duplicate-function error as "noise." But Vercel's Node ESM runtime (`@vercel/node` with `nodenext` module resolution) correctly throws `SyntaxError: Identifier 'retryStep' has already been declared` when loading any module that has duplicate top-level identifiers. Production behavior had been silently broken for any code path that fresh-imports `season-pipeline-runner.js` — but no caller did until Phase 17.5's `bsSeasonPipelineRefreshFromAudit` route, which dynamically imports the module via `season-pipeline-routes.ts`. That triggered the first cold module load through this path, which threw, which surfaced as the user-visible refresh error.

**The fix:** Replace the dead 3-arg `retryStep` (lines 645-695) with an explanatory comment block. Net effect: -39 lines.

**Verification:**
- `grep -c "^export async function retryStep"` returns exactly 1 (was 2)
- Vercel runtime TS check: 0 duplicate-function errors (the previous `retryStep redeclare` errors are gone). Only the long-standing pre-existing `seo-campaign-engine.ts:1021` error remains.
- Compiled output (`tsc --module nodenext`) contains exactly 1 `retryStep` definition.
- `node --check` on the compiled `.js` file passes without SyntaxError — the exact test that Vercel's runtime was failing.
- Frontend baseline 27 / API ceiling 12 / Vite green.

**Discipline lesson logged:** Pre-existing TS compiler warnings need root-cause investigation, not pattern-matched dismissal. The Phase 17.0-17.4 verifications all noted "duplicate retryStep — pre-existing, runtime uses the second one" without testing that assumption. The Vercel runtime test is `node --check` on the compiled output, not "do other parts of the system work." Should have been verified once and fixed, not deferred across five phases. Pre-ship checklist update: any duplicate-identifier TS error gets investigated before the next ship, regardless of whether it "seems unrelated."

**Diff:** 1 file changed, 12 insertions, 51 deletions.

### Phase 17.5.3 — Refresh failure diagnostic surface (2026-05-25)

**Why this exists:** Manav ran refresh-from-audit on run `81f36f07`. It ran for multiple steps then failed at the last one. The inline strip from 17.5.1 showed `Refresh failed: Run ended with status: failed` — useless for triage. The actual error (which step + why) lives in `season_pipeline_steps.error_message`, accessible via `seasonPipelineGet` — but the user had to know to navigate to the pipeline dashboard inside the Season modal to see it.

**What 17.5.3 fixes:**
When the execute loop ends in a failed state, the handler now:
1. Calls `seasonPipelineGet({ runId })` to fetch all step rows
2. Filters to `status === 'failed'` steps, sorts by `step_index` ascending
3. Takes the EARLIEST failed step (typically the root cause — later steps may have cascaded)
4. Extracts `step_label`, `step_index`, `error_message` into `RefreshState`
5. The inline strip renders the step name as a heading, then the error_message in monospace below for easy reading

Toast also upgraded: when a step has failed, the title becomes `Step failed: "<label>"` and the description becomes the first 200 chars of the error message. No more generic "Refresh paused."

**Other changes:**
- Failure auto-clear timeout extended 10s → 30s (reset/crash failures) and 12s → 60s (execution failures). Reading and acting on a diagnostic takes longer than 10s.
- Completed-state timeout unchanged at 12s (success doesn't need study).
- Failed-state container restructured into a flex-column so the heading + monospace error block can stack cleanly with proper word-wrapping for long messages.

**What this does NOT do (still pending):**
- No deep-link to SeasonPipelineDashboard for the failed run (dashboard is mounted inside SeasonModal, not a routable path — would need a routing change to support this; deferred).
- No automatic retry of the failed step (manual decision — user might want to investigate before re-triggering).

**Diagnostic Manav can use NOW for run `81f36f07`:**
Without this phase shipped yet, he can open Supabase SQL editor and run:
```sql
SELECT step_index, step_id, step_label, status, error_message, llm_calls, duration_ms
FROM season_pipeline_steps
WHERE run_id = '81f36f07-...'  -- full uuid
ORDER BY step_index;
```
That returns the failure cause directly. Most likely candidates given the step order are content_brief (idx 5, complex 5-stage LLM sub-pipeline) or forecast (idx 4, can fail if forecast engine baseline data is malformed).

**Files changed:** 1 (`src/components/pm/SeoCampaignsPanel.tsx`).

**Verification:**
- Frontend TS baseline: 27 (unchanged). No errors in SeoCampaignsPanel.
- Vite build green.

**Diff:** 1 file changed, 76 insertions, 13 deletions.

### Phase 17.5.4 — Refresh opens live SEASON dashboard (2026-05-25)

**Manav's question:** "Why am I not seeing the visual campaign as it showed all 8 blocks first time when campaign run from the chat?"

**Root cause traced:** When a pipeline is launched from chat, `SeasonModal` directly sets `activeRunId` via `setActiveRunId(runResult.run_id)` — that triggers `SeasonPipelineDashboard` to mount in the AnimatePresence block. The dashboard renders the 8 step blocks with live polling.

The refresh-from-audit flow from `SeoCampaignsPanel` reset steps + drove execution but **never told SeasonModal** to mount the dashboard. The panel's tiny inline progress strip from 17.5.1-17.5.3 was all the visual feedback available. Functionally the run was happening; visually it was invisible relative to the chat-launch experience.

**The fix — event-driven dashboard mount:**

`SeasonModal.tsx` (+31 lines): new `useEffect` that listens for `window` event `season:open-pipeline-dashboard` with detail `{ runId, pipelineType, stepCount, label }`. When fired, it sets `activeRunId` + companion state, causing the dashboard to mount with the supplied run. Key insight verified by reading the component: the dashboard renders OUTSIDE the `{isOpen && ...}` block — it appears whenever `activeRunId` is set, independent of modal panel state. So just setting state is enough; no need to also `open()` the modal.

`SeoCampaignsPanel.tsx` (+29 lines):
- `handleRefreshPipelineFromAudit` signature extended to accept `stepCount` + `keyword` so the dashboard mounts with correct expected-step count and label
- Button onClick now passes `r.step_count` and `data.campaign.keyword`
- Before driving execution, dispatches `season:open-pipeline-dashboard` with the four detail fields
- Inline progress strip kept (still useful for the panel-local context) but copy updated: "Resetting audit-consuming steps… (live dashboard opening above)" and "see live dashboard above for per-step view"

**Component separation:**
- Panel owns: reset + drive execution + reload campaign state on completion
- Dashboard owns: live display via its own DB polling loop
- They communicate through database state — no coupling between them

**What the user sees now:**
1. Click "Refresh from audit" in panel
2. Confirm dialog
3. SEASON live pipeline dashboard cinematically expands from the orb (same animation as first chat launch)
4. 8 step blocks render — first 3 already completed (gray check), audit-consuming ones now pending (queued)
5. As panel drives execution, each block progresses through running → completed states with live timestamps + duration
6. Panel's inline strip below shows panel-local context ("Re-running step 5 of 8: 'Generate the full content brief'") in case the user has scrolled away from the dashboard
7. On completion: dashboard shows summary; panel reloads campaign with fresh artifacts; both pieces of UI converge

**Files changed:** 2 — `src/components/season/SeasonModal.tsx`, `src/components/pm/SeoCampaignsPanel.tsx`.

**Verification:**
- Frontend TS baseline 27 (unchanged). No errors in either changed file.
- Vite green.

**Diff:** 2 files changed, 60 insertions, 4 deletions.

**Discipline lesson logged:** When wiring new UX flows that touch existing user-visible primitives (like "the pipeline dashboard"), use the existing primitive directly rather than re-implementing inline. Phases 17.5.1-17.5.3 built inline-progress UI in the panel — useful, but it was reinventing what the dashboard already did better. Should have asked from 17.5 onward: "what does the user already see when this kind of thing happens, and can I just reuse that?"

### Phase 17.5.5 — Counter drift + button gate fix (2026-05-25)

**Manav's screenshot:** `81f36f07 · rank_for_keyword · failed · 12/8 steps · 22/05/2026` with no refresh button visible.

**Bug 1: counter drift past total.**
`12/8 steps` is impossible in a healthy state — rank_for_keyword has exactly 8 steps. Root cause: `retryFromStep` and `retryStep` in season-pipeline-runner.ts reset step rows to `pending` but never decremented the run-level `steps_completed` counter. Meanwhile `executeNextPendingStep` (line 866) increments `steps_completed` by 1 on every success. So when a run that already had `steps_completed=8` got refresh-from-audit-reset (5 steps to pending), the runner re-executed those 5 and incremented to 13. Same drift applies to `steps_failed`. The numbers were lies — the actual step row statuses were correct.

**Fix:** Both `retryFromStep` and `retryStep` now recompute `steps_completed`, `steps_failed`, `llm_calls_used`, `web_searches_used`, `estimated_cost_usd` from the actual step rows after reset. Idempotent — safe even if no rows changed.

**Bug 2: refresh button hidden on failed runs.**
Phase 17.5's button render gate was `isCompleted = r.status === 'completed'`. That means clicking refresh on a failed run was impossible — but failed runs are exactly when you want to refresh from a fresh audit. (E.g. if the original failure was upstream from an audit data issue, fixing the audit and re-running from there is the recovery path.)

**Fix:** Gate changed to `canRefresh = !(r.status === 'running' || r.status === 'retrying')`. Now shown on `completed`, `failed`, `interrupted`, `cancelled`. Hidden only while a step is actively executing (which would step on its own toes).

**Production repair migration:** `sql/phase-17-5-5-recompute-counters.sql` reapplies the same recompute to any drifted runs already in the database, so `81f36f07` and any siblings get correct counters retroactively. Idempotent (safe to re-run). Includes inspection query to identify drifted runs first, before the UPDATE.

**Files changed:** 2 — `api/lib/season-pipeline-runner.ts`, `src/components/pm/SeoCampaignsPanel.tsx`. Plus the SQL migration file.

**Verification:**
- Vercel runtime TS clean on touched files (pre-existing `seo-campaign-engine.ts:1021` only).
- Frontend baseline 27 (unchanged).
- Vite green.

**Diff:** 2 files changed, 55 insertions, 3 deletions + 1 new SQL file.

**Discipline lesson logged:** When a backend operation rewrites entity state, ALL derived aggregates need to be recomputed in the same transaction, not just the obvious ones. `retryFromStep` was correctly resetting step rows but ignored that step counts were *also* state on the run row. This was latent for the entire Phase 14.2 retry lifetime — the resilience model assumed only single-step retries, where one failed step going pending didn't cause visible aggregate drift. Phase 17.5's refresh-from-audit was the first thing to invoke retry mechanics at multi-step scale, which made the drift visible immediately.

### Phase 17.5.6 — Dashboard polling race fix (2026-05-25)

**Manav's screenshot:** SEASON dashboard open showing "Refreshing app maker", timer stuck at `00:01`, orange "Polling stopped" indicator, steps 1-5 marked completed, step 6 frozen "RUNNING", steps 7-8 pending. Execution was actually continuing server-side but no live updates reached the UI.

**Bug 1: Dispatch order race in handleRefreshPipelineFromAudit.**
Phase 17.5.4 dispatched the dashboard-open event FIRST, then called `seasonPipelineRefreshFromAudit`. The dashboard mounted and started polling within ~1 second. But `retryFromStep` hadn't yet flipped run.status to 'retrying' — it was still 'failed' from the previous run. Dashboard's polling logic at line 160 treated 'failed' as terminal, set `polling=false`, and never reconsidered. Execution proceeded server-side (steps re-ran and completed in the DB) but the UI was locked at its initial frozen snapshot.

**Fix:** Call `seasonPipelineRefreshFromAudit` FIRST (which awaits the DB update flipping status to 'retrying'), THEN dispatch the dashboard-open event. By the time the dashboard mounts, the DB state is already 'retrying' — polling correctly identifies it as non-terminal. Trade-off: ~500ms-2s delay between user clicking confirm and dashboard appearing. Acceptable — the panel's inline progress strip from 17.5.1 already shows "Resetting audit-consuming steps…" during this gap.

**Bug 2: Dashboard polling doesn't tolerate mid-retry terminal states.**
Even with Bug 1 fixed, `SeasonPipelineDashboard`'s polling-stop condition is fragile: any time a run briefly appears in terminal status with pending steps still queued, polling stops. This can happen in retry-from-step flows where the runner momentarily sees the run as failed before the next step kicks. Should not be terminal in those cases.

**Fix:** Changed terminal condition to `reallyTerminal = isTerminal && !hasPendingOrRunning`. A run with status='failed' AND pending step rows is mid-retry, not really done. Polling continues until both conditions are clean.

**Files changed:** 2 — `src/components/pm/SeoCampaignsPanel.tsx`, `src/components/season/SeasonPipelineDashboard.tsx`.

**Verification:**
- Frontend baseline 27 unchanged. No errors in either changed file.
- Vite green.

**Diff:** 2 files changed, 42 insertions, 17 deletions.

**Discipline lesson logged:** When introducing new UX flows that mount UI components observing async state, verify the order: state-mutation → UI-observation. Reversing the order creates races that look like "the UI is broken" when actually the backend is fine. The race here was specifically that I treated dispatching the event as a "fire and forget" hint when it actually triggered immediate DB polling against state that hadn't transitioned yet. Should have asked from the start: "what does the dashboard's first poll see if it fires NOW, before the backend has done anything?" — and ordered the dispatch accordingly.

### Session handoff for tech audit work

> "Continuing SEO SEASON tech audit. Brief attached + ARCHITECTURE.md available. Phase 16.11 HTML renderer shipped. Last verified production audit was on alphasoftware.com / 'app maker' keyword 2026-05-23. Re-audit to validate Phase 16.11 HTML output not yet run. Don't add new api/*.ts files — at 12-function ceiling. Don't patch — complete files only."
