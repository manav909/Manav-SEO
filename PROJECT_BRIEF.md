# SEO SEASON — Project Brief

**Maintained by:** Manav · **Last updated:** 2026-05-24 · **Live commit:** `8f4a0db` — Pending deploy: full manifesto localization (all 11 remaining chapters extracted to ~175 keys × 5 langs in copy.ts; previously only 4 chapters used t())

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

## 2. Architecture — non-negotiables

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

42 pages. Router is `src/App.tsx` (36 routes). `src/pages/App.tsx` is legacy/unused. Six React contexts: Auth, Project, Nav, Theme, Demo, Tour. Largest pages: DataRoom, BdePanel, AlgorithmIntel, Admin, Dashboard, Audit. Most pages are thin UI over `/api/task-engine` actions.

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

## 14. In-flight / open backlog

🟡 **Layout PAUSED as of 2026-05-23** — Manav explicitly asked to stop layout iteration after 10+ blocks of UX thrashing. Default response to layout complaints: acknowledge, log to backlog, do not build. Layout backlog (frozen):
1. Casual mode empty left space when sidebar is closed
2. Persistent left rail attempt (Block 2.24 v1 was wrong — overlapped Pro mode)

🟢 **AIConcierge + profile avatar on `/manifesto`** — fixed 2026-05-23. `/manifesto` added to `HIDE_ON_PATHS` in `AIConcierge.tsx`. Cinematic page now stays clean.

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

---

## 17. Session handoff prompt for next chat

> "Continuing SEO SEASON. Brief attached. Manifesto now 14 chapters with new ChFAQ (Doubts Resolved) as Ch12 + Live Ops panel in ChEngine. Cold open ACT 5 now ends with animated SVG signature of 'Manav Sharma' drawn with Allison handwriting font + glowing pen tip (1.9s write, ~2.8s total). Layout work paused. Don't change anything without confirming."
