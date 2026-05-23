# SEO SEASON — Project Brief

**Maintained by:** Manav · **Last updated:** 2026-05-23 · **Live commit before this turn:** `39cee85`

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
| `extractAndSaveLearning` dead imports in `algorithm-intel.ts`, `seo-agent.ts`, `crawl.ts`, `run-analysis.ts` | 🟡 Cosmetic cleanup pending |

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

**Live main HEAD before this turn**: `39cee85` (Manifesto journey-arc hero, loud-Manav version)

**Shipped 2.13–2.22**: Pick engine · widget gallery + drawer · layout polish · gear removed · readable markdown chat · cite-tag strip · AIConcierge hidden on Season pages · JARVIS mood freshness · continuous ticker ~85 lines

**REJECTED / REVERTED**:
- Block 2.23 Casual full-width — "stop expanding"
- Block 2.24 left rail — overlapped Pro mode

---

## 12. Manifesto / Season Codex — current state

**Route**: `/manifesto` · **Entry**: emerald "The Codex" pill in `Command.tsx` top bar (Book icon, always visible, before project-conditional pills)

### 12.1 Architecture — 27 files total

```
src/pages/Manifesto.tsx                   root orchestrator (~110 lines)
src/pages/manifesto/                      foundation + infrastructure (11 files)
  types.ts                                Lang, SeasonId, Season, ChapterDef, TFn, FEATHER
  copy.ts                                 5-language COPY (EN/HI/ES/FR/DE)
  seasons.tsx                             SEASONS tokens × 7 seasons
  chapters.ts                             13-chapter narrative manifest
  shared.tsx                              ChapterShell, ChapterHeader, Prose, Statement, FoundingQuote, TextReveal, CounterNumber, ScrollHint
  styles.tsx                              global CSS (~480 lines)
  AmbientCanvas.tsx                       7 distinct particle systems
  ProgressBar.tsx                         top rail hue-morphing scroll progress
  TopBar.tsx                              brand wordmark + language picker + close
  FloatingNav.tsx                         13 chapter dots, IntersectionObserver
  FooterMark.tsx                          closing brand line
  chapters/                               13 chapter files
    ChColdOpen.tsx                        Eternal Spring · Cold Open
    ChProblem.tsx                         Winter · Agency black-box pain
    ChVision.tsx                          Spring · Founding quote
    ChHowSearch.tsx                       Spring · Compounds vs dead grid
    ChPillars.tsx                         Summer · Five growing pillars
    ChJourney.tsx                         Summer · Day 0 to Month 12 timeline
    ChEngine.tsx                          Monsoon · V12 capability spec
    ChCompare.tsx                         Monsoon · Three-column comparison
    ChEthics.tsx                          Autumn · Will/won't constraints
    ChData.tsx                            Autumn · GSC + GA4 only
    ChWhom.tsx                            Harvest · 5 audience blocks
    ChFounder.tsx                         Harvest · Founder letter
    ChFuture.tsx                          Eternal Spring · Selective close
```

### 12.2 Seasons map

Winter (hue 210, snow) → Spring (142, leaves-up) → Summer (38, rays) → Monsoon (218, rain) → Autumn (22, leaves-fall) → Harvest (48, gold) → Eternal Spring (188, electric).

### 12.3 Motion grammar

FEATHER curve `[0.16, 1, 0.3, 1]`, soft springs (stiffness 60, damping 18), 1.0–1.6s durations, 3D mouse tilt on hero stage (perspective 1400).

---

## 13. Cold Open — current composition (SHIPPED 2026-05-23)

**Total reveal pacing**: ~11s title-sequence cadence.

| Act | Timing | Element |
|---|---|---|
| 1 | 0.0s | Coordinate `—— SEO SEASON · VOL. I · 2026 ——` |
| 2a | 0.6s | S.E.A.S.O.N. letter-by-letter (peak 1) — interactive |
| 2b | 2.2s | Interactive recital (3 rows, hover-expandable) |
| 2c | 3.4s | Kicker: "An SEO agency that operates on its own infrastructure." |
| 2d | 3.9s | Sub: "Thinks in seasons. Verified in minutes." |
| 2e | 4.5s | Intel callout: "TWELVE ALWAYS-ON INTELLIGENCE ENGINES. CONTINUOUS DATA REFRESH. TOTAL AUDIT TRAIL." |
| 3 | 6.0s | Setup: "Infrastructure of this depth is usually a team's work." |
| 4 | 7.0s | **Pivot** (dramatic hinge): *"This is one person's."* italic display cyan glow |
| 5 | 8.4s | `── by ──` small mark |
| 5 | 8.9s | **Manav** humble — `clamp(2.5rem, 5vw, 4rem)`, italic serif, plain white, single fade-in |
| 5 | 9.8s | Close: *"Architect of the system above. He answers when called."* |
| — | 11.0s | Scroll hint `BEGIN ↓` |

### 13.1 Interactive recital mechanics

- Each non-dot letter of S.E.A.S.O.N. is a hover target with pair-id encoding: `S₁,E → se` · `A,S₂ → as` · `O,N → on`
- Hovered letter brightens + dims other letters
- Recital row matching hovered pair brightens + expands with SEO-context paragraph below
- Inactive rows dim to 0.38 opacity
- 150ms debounce on `null` set prevents flicker when moving between letters of the same pair
- Recital rows are themselves hoverable (not just the brand letters)
- Mobile: `onClick` toggles the same state (no hover on touch)

### 13.2 Why Manav is humble now

Iron Man doesn't shout "I AM IRON MAN" — he says it quietly into a microphone. Confidence is calm. The reveal is the moment AFTER the journey of trust-building (company → recital → capabilities → pivot), and lands as a craftsperson signing their work — not a hero entering a stadium. The role triplet was removed for the same reason; the close line carries the role attribution in service of the agency, not as separate billing.

### 13.3 Copy keys (5 languages each)

`hero_kicker` · `hero_sub` · `hero_intel_callout` · `hero_se_context` · `hero_as_context` · `hero_on_context` · `hero_reveal_setup` · `hero_reveal_pivot` · `hero_by_mark` · `hero_founder_name` · `hero_roles` · `hero_close` · `phrase_strat_exec` · `phrase_anal_supp` · `phrase_op_net` · `scroll_hint`

---

## 14. In-flight / open backlog

🟡 **Layout PAUSED as of 2026-05-23** — Manav explicitly asked to stop layout iteration after 10+ blocks of UX thrashing. Default response to layout complaints: acknowledge, log to backlog, do not build. Layout backlog (frozen):
1. Casual mode empty left space when sidebar is closed
2. Persistent left rail attempt (Block 2.24 v1 was wrong — overlapped Pro mode)

🟡 **AIConcierge + profile avatar visible on `/manifesto`** — visual clutter on cinematic page. The Block 2.16 "AIConcierge hidden on Season pages" fix didn't cover the manifesto route. Optional fix: route check + skip render for `pathname === '/manifesto'`. Awaiting Manav's go-ahead.

🟡 **`extractAndSaveLearning` dead imports** in `algorithm-intel.ts`, `seo-agent.ts`, `crawl.ts`, `run-analysis.ts` — cosmetic cleanup.

---

## 15. Recent deploy notes

- Vercel CDN edge cache TTL is ~15-20 minutes — wait that long before assuming a deploy is broken
- After Step 2 force-rebuild (commit `0da2d35`), the journey-arc deploy DID succeed but edge cache served stale HTML for ~15 min before clearing
- Manav confirmed live site showing the journey-arc content correctly via screenshot before requesting the humble + interactive iteration

---

## 16. Honest call-outs (carried forward)

1. The pivot line *"This is one person's"* only lands if literally true — no co-architects, no engineers contributing meaningfully beyond minor packages. From the visible repo signal (Manav is the sole committer at `manav909`), the claim looks defensible. Flagged for transparency since the entire grand entry rests on it being true.

2. AIConcierge + profile avatar on `/manifesto` should be hidden for cinematic cleanness. Awaiting Manav's go-ahead before touching the app shell.

---

## 17. Session handoff prompt for next chat

> "Continuing SEO SEASON. Brief attached. Just shipped cold open with interactive recital + humble Manav reveal — letters of S.E.A.S.O.N. hover-expand each pair's SEO context, Manav name is now small italic with no gradient. Layout work paused. Don't change anything without confirming."
