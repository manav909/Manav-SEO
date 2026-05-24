/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/styles.tsx
   Global Manifesto stylesheet. Rendered ONCE by the root component.

   Scope: root, ambient canvas, progress rail, top bar, floating nav,
   footer, chapter shell (act + ch-header), shared primitives (prose,
   statement, founding quote, scroll hint, cold-open brand reveal).

   Chapter-specific styles live INSIDE each chapter file as a small
   inline <style> block. That keeps each chapter independently
   editable without touching the spine.
══════════════════════════════════════════════════════════════════════ */

export function ManifestoStyles() {
  return (
    <style>{`
      :root {
        --m-bg-deep:      9 11 18;
        --m-ink-soft:     rgba(245, 247, 255, 0.55);
        --m-ink-medium:   rgba(245, 247, 255, 0.78);
        --m-ink-strong:   rgba(245, 247, 255, 0.96);
        --m-hairline:     rgba(255, 255, 255, 0.08);
        --m-hairline-s:   rgba(255, 255, 255, 0.16);
      }

      /* ──── ROOT ──────────────────────────────────────────── */
      .manifesto-root {
        min-height: 100vh;
        background: rgb(var(--m-bg-deep));
        color: rgb(var(--m-ink-strong));
        font-family: ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif;
        position: relative;
        overflow-x: hidden;
        -webkit-font-smoothing: antialiased;
      }
      .manifesto-stage {
        position: relative;
        z-index: 2;
        max-width: 1040px;
        margin: 0 auto;
        padding: 0 2rem 8rem 2rem;
      }

      /* ──── AMBIENT CANVAS ────────────────────────────────── */
      .ambient-canvas {
        position: fixed; inset: 0;
        z-index: 1;
        pointer-events: none;
        overflow: hidden;
      }
      .ambient-wash { position: absolute; inset: 0; }
      .ambient-grain {
        position: absolute; inset: 0;
        background-image: radial-gradient(rgba(255,255,255,0.04) 0.5px, transparent 0.5px);
        background-size: 4px 4px;
        opacity: 0.45;
        mix-blend-mode: overlay;
      }
      .ambient-vignette {
        position: absolute; inset: 0;
        background: radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.5) 110%);
      }
      .particle-field { position: absolute; inset: 0; }
      .mote {
        position: absolute;
        border-radius: 50%;
        pointer-events: none;
      }
      .mote-rain { border-radius: 0; }

      /* ──── PROGRESS RAIL ─────────────────────────────────── */
      .progress-rail {
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 2px;
        z-index: 50;
        background: rgba(255, 255, 255, 0.06);
      }
      .progress-fill {
        height: 100%;
        transition: background 0.6s ease, box-shadow 0.6s ease;
      }

      /* ──── TOP BAR ───────────────────────────────────────── */
      .top-bar {
        position: fixed;
        top: 0; left: 0; right: 0;
        z-index: 40;
        padding: 1.25rem 2rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: linear-gradient(180deg, rgba(9,11,18,0.85), transparent);
        backdrop-filter: blur(8px);
      }
      .top-bar-left {
        display: flex; align-items: center;
        gap: 0.85rem;
      }
      .top-brand {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        color: var(--m-ink-strong);
        text-transform: uppercase;
      }
      .top-divider { color: var(--m-ink-soft); }
      .top-bar-label {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.7rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--m-ink-soft);
      }
      .top-bar-right {
        display: flex; align-items: center;
        gap: 0.85rem;
      }

      /* ──── LANG PICKER ───────────────────────────────────── */
      .lang-control { position: relative; }
      .lang-trigger {
        display: flex; align-items: center; gap: 0.45rem;
        padding: 0.4rem 0.9rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        border: 0.5px solid var(--m-hairline-s);
        color: var(--m-ink-medium);
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.75rem;
        cursor: pointer;
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .lang-trigger:hover {
        color: var(--m-ink-strong);
        border-color: rgba(255,255,255,0.3);
      }
      .lang-chevron { transition: transform 0.3s ease; }
      .lang-chevron-open { transform: rotate(180deg); }
      .lang-menu {
        position: absolute;
        top: calc(100% + 0.5rem);
        right: 0;
        min-width: 220px;
        background: rgba(15, 17, 26, 0.95);
        border: 0.5px solid var(--m-hairline-s);
        border-radius: 12px;
        padding: 0.4rem;
        backdrop-filter: blur(20px);
        z-index: 50;
      }
      .lang-option {
        display: block; width: 100%; text-align: left;
        padding: 0.5rem 0.85rem;
        background: transparent;
        border: none;
        color: var(--m-ink-medium);
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.85rem;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s ease;
      }
      .lang-option:hover {
        background: rgba(255,255,255,0.05);
        color: var(--m-ink-strong);
      }
      .lang-option-active {
        background: rgba(255,255,255,0.04);
        color: var(--m-ink-strong);
      }
      .lang-note {
        padding: 0.6rem 0.85rem 0.4rem 0.85rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.65rem;
        color: var(--m-ink-soft);
        font-style: italic;
        line-height: 1.4;
        border-top: 0.5px solid var(--m-hairline);
        margin-top: 0.3rem;
      }
      .top-exit {
        width: 36px; height: 36px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.04);
        border: 0.5px solid var(--m-hairline-s);
        color: var(--m-ink-medium);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .top-exit:hover {
        color: var(--m-ink-strong);
        border-color: rgba(255,255,255,0.3);
        transform: scale(1.05);
      }

      /* ──── FLOATING NAV ──────────────────────────────────── */
      .floating-nav {
        position: fixed;
        top: 50%;
        left: 1.5rem;
        transform: translateY(-50%);
        z-index: 30;
        display: flex; flex-direction: column;
        gap: 0.55rem;
      }
      .nav-dot {
        position: relative;
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0.35rem 0;
        display: flex; align-items: center;
        gap: 0.85rem;
      }
      .nav-dot-circle {
        display: block;
        width: 6px; height: 6px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.22);
        transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .nav-dot:hover .nav-dot-circle {
        width: 8px; height: 8px;
        background: rgba(255, 255, 255, 0.55);
      }
      .nav-dot-active .nav-dot-circle {
        width: 10px; height: 10px;
        background: hsla(var(--dot-hue), var(--dot-sat), var(--dot-light), 0.95);
        box-shadow: 0 0 14px hsla(var(--dot-hue), var(--dot-sat), var(--dot-light), 0.6);
      }
      .nav-dot-label {
        opacity: 0;
        transform: translateX(-6px);
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: none;
        white-space: nowrap;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.72rem;
        display: flex; align-items: center; gap: 0.5rem;
        background: rgba(15, 17, 26, 0.85);
        padding: 0.3rem 0.7rem;
        border-radius: 999px;
        border: 0.5px solid var(--m-hairline-s);
        backdrop-filter: blur(8px);
      }
      .nav-dot:hover .nav-dot-label,
      .nav-dot-active .nav-dot-label {
        opacity: 1;
        transform: translateX(0);
      }
      .nav-dot-no {
        color: var(--m-ink-soft);
        font-weight: 700;
        letter-spacing: 0.06em;
      }
      .nav-dot-title { color: var(--m-ink-strong); }

      /* ──── ACT / CHAPTER SHELL ───────────────────────────── */
      .act {
        position: relative;
        z-index: 2;
      }
      .act-chapter {
        min-height: 92vh;
        padding: 9rem 0;
        display: flex;
        align-items: center;
      }
      .act-inner { width: 100%; }

      .ch-header { margin-bottom: 3rem; }
      .ch-season-row {
        display: flex; align-items: center;
        gap: 0.6rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }
      .ch-season-glyph {
        display: inline-flex; align-items: center; justify-content: center;
        width: 24px; height: 24px;
        border-radius: 50%;
        border: 0.5px solid hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.4);
        background: hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.08);
        color: hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.95);
      }
      .ch-season-name {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: hsla(var(--ch-hue), var(--ch-sat), 75%, 0.95);
      }
      .ch-season-kicker {
        font-family: ui-serif, Georgia, serif;
        font-size: 0.85rem;
        color: var(--m-ink-soft);
        font-style: italic;
      }
      .ch-number {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--m-ink-soft);
        margin-bottom: 1rem;
      }
      .ch-title {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(2rem, 4.6vw, 3.4rem);
        line-height: 1.05;
        letter-spacing: -0.025em;
        font-weight: 400;
        color: var(--m-ink-strong);
        margin: 0;
        max-width: 22ch;
      }

      /* ──── PROSE / STATEMENT / FOUNDING QUOTE ────────────── */
      .prose-block {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.2rem;
        line-height: 1.7;
        color: var(--m-ink-medium);
        max-width: 64ch;
        margin: 1.5rem 0 0 0;
      }
      .prose-block em {
        color: var(--m-ink-strong);
        font-style: italic;
      }
      .prose-block strong {
        color: var(--m-ink-strong);
        font-weight: 500;
      }
      .statement-block {
        font-family: ui-serif, Georgia, serif;
        font-size: 1.5rem;
        line-height: 1.4;
        font-style: italic;
        color: var(--m-ink-strong);
        max-width: 36ch;
        padding: 1.5rem 0;
        border-top: 0.5px solid hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.25);
        border-bottom: 0.5px solid hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.25);
      }
      .founding-quote {
        position: relative;
        max-width: 44ch;
        padding: 1.5rem 0 0 0;
        margin: 2rem 0 0 0;
      }
      .founding-mark {
        position: absolute;
        top: -1.2rem; left: -0.5rem;
        font-size: 5rem;
        line-height: 1;
        color: hsla(var(--ch-hue), var(--ch-sat), var(--ch-light), 0.3);
        font-family: ui-serif, Georgia, serif;
      }
      .founding-text {
        font-size: 1.65rem;
        line-height: 1.4;
        font-style: italic;
        color: var(--m-ink-strong);
        letter-spacing: -0.01em;
      }

      /* ──── SCROLL HINT ───────────────────────────────────── */
      .scroll-hint {
        margin: 6rem auto 0 auto;
        display: flex; flex-direction: column;
        align-items: center;
        gap: 0.5rem;
      }
      .scroll-hint-text {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.65rem;
        letter-spacing: 0.32em;
        text-transform: uppercase;
        color: var(--m-ink-soft);
      }
      .scroll-hint-arrow { color: var(--m-ink-soft); }

      /* ──── COLD-OPEN BRAND REVEAL (used by ChColdOpen) ───── */
      .act-cold-open {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8rem 0;
        position: relative;
        z-index: 2;
      }
      .cold-open-stage {
        text-align: center;
        max-width: 920px;
        transform-style: preserve-3d;
        will-change: transform;
      }
      .cold-open-meet {
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      .overline {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--m-ink-soft);
      }
      .brand-reveal {
        font-size: clamp(3.5rem, 10vw, 9rem);
        line-height: 0.94;
        letter-spacing: -0.06em;
        font-weight: 400;
        color: var(--m-ink-strong);
        display: flex;
        justify-content: center;
        flex-wrap: nowrap;
      }
      .brand-letter {
        display: inline-block;
        background: linear-gradient(180deg, rgba(255, 255, 255, 1), rgba(255, 255, 255, 0.65));
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .brand-dot {
        display: inline-block;
        color: hsla(188, 80%, 65%, 0.85);
      }
      .cold-open-expand {
        display: flex;
        justify-content: center;
      }
      .acronym-expand {
        display: grid;
        grid-template-columns: repeat(3, auto);
        gap: 0.6rem 2.2rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      .acronym-pair {
        display: flex; align-items: baseline;
        gap: 0.6rem;
      }
      .acronym-letter {
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.1em;
        color: hsla(188, 75%, 70%, 0.9);
      }
      .acronym-word {
        font-size: 0.85rem;
        color: var(--m-ink-medium);
        letter-spacing: 0.04em;
      }
      .cold-open-kicker {
        font-family: ui-serif, Georgia, serif;
        font-size: clamp(1.3rem, 2.4vw, 1.7rem);
        line-height: 1.35;
        color: var(--m-ink-strong);
        font-style: italic;
        letter-spacing: -0.01em;
        max-width: 36ch;
        margin: 0 auto;
      }
      .cold-open-sub {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.95rem;
        color: var(--m-ink-soft);
        letter-spacing: 0.03em;
      }

      /* ──── FOOTER ────────────────────────────────────────── */
      .manifesto-footer {
        position: relative;
        z-index: 2;
        max-width: 1040px;
        margin: 0 auto;
        padding: 4rem 2rem 6rem 2rem;
        border-top: 0.5px solid var(--m-hairline);
        text-align: center;
      }
      .footer-brand {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.22em;
        color: var(--m-ink-medium);
        text-transform: uppercase;
      }
      .footer-line {
        margin-top: 0.8rem;
        font-family: ui-serif, Georgia, serif;
        font-size: 0.95rem;
        color: var(--m-ink-soft);
        font-style: italic;
      }
      .footer-date {
        margin-top: 1rem;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.7rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--m-ink-soft);
      }

      /* ──── RESPONSIVE ────────────────────────────────────── */
      @media (max-width: 880px) {
        .manifesto-stage { padding: 0 1.25rem 6rem 1.25rem; }
        .floating-nav    { left: 0.6rem; }
        .nav-dot-label   { display: none; }
        .top-bar         { padding: 1rem 1.25rem; }
        .top-bar-label   { display: none; }
        .act-chapter     { padding: 6rem 0; min-height: auto; }
        .ch-title        { max-width: 100%; }
        .acronym-expand  { grid-template-columns: repeat(2, auto); gap: 0.5rem 1.5rem; }
      }

      /* ──── REDUCED MOTION ────────────────────────────────── */
      @media (prefers-reduced-motion: reduce) {
        .mote,
        .ambient-wash    { animation: none !important; }
        .progress-fill   { transition: none; }
      }

      /* ══════════════════════════════════════════════════════
         PRINT — for "Save as PDF" via the browser's print dialog.

         Hides chrome, kills the dark theme, forces every animated
         block into its final visible state, and adds page breaks
         between chapters. The output is a clean, ink-friendly
         document a reader can share with a CMO or CEO.
      ════════════════════════════════════════════════════════ */
      @media print {
        /* Light theme override */
        :root, body, #root {
          background: #ffffff !important;
          color: #111 !important;
        }
        body { -webkit-print-color-adjust: economy; print-color-adjust: economy; }

        /* Hide UI chrome */
        .top-bar,
        .floating-nav,
        .progress-bar,
        .ambient-canvas,
        .ambient-wash,
        .scroll-hint,
        .closing-actions { display: none !important; }

        /* Page setup */
        @page { margin: 1.5cm; }

        .manifesto-stage { padding: 0 !important; }

        /* Each chapter on a fresh page */
        .act-chapter {
          page-break-before: always;
          page-break-inside: avoid;
          min-height: auto !important;
          padding: 0 0 1.5cm 0 !important;
        }
        .act-chapter:first-of-type { page-break-before: auto; }

        /* Force every motion element to its final state — no animations,
           no hidden content, no opacity:0 leftovers from initial state */
        .act-chapter *,
        .ch-title,
        .ch-no,
        .ch-prose,
        .ch-statement,
        .ch-founding-quote {
          opacity: 1 !important;
          transform: none !important;
          filter: none !important;
          color: #111 !important;
          text-shadow: none !important;
        }

        /* Typography overrides — ink-readable scale */
        .ch-no {
          font-size: 9pt !important;
          color: #666 !important;
          letter-spacing: 0.2em;
        }
        .ch-title {
          font-size: 24pt !important;
          color: #000 !important;
          margin-bottom: 1cm;
        }
        .ch-prose {
          font-size: 11pt !important;
          line-height: 1.6 !important;
          color: #222 !important;
          margin-bottom: 0.6cm;
        }
        .ch-statement {
          font-size: 13pt !important;
          color: #000 !important;
          border-left: 2px solid #888;
          padding-left: 0.5cm;
        }

        /* Avoid splitting tight blocks across pages */
        .spec-card,
        .pillar-column,
        .live-ops-panel,
        .faq-pair,
        .compare-row,
        .whom-block,
        .founding-quote,
        .ch-statement { page-break-inside: avoid; }

        /* Hide interactive-only UI affordances inside chapters */
        .faq-affordance,
        .faq-strike,
        .live-ops-pulse-wrap,
        .live-ops-status { display: none !important; }

        /* Force all FAQ answers to fully visible regardless of phase */
        .faq-answer-wrap {
          height: auto !important;
          overflow: visible !important;
        }

        /* Strip the dark spec-card backgrounds; show as clean bordered blocks */
        .spec-card,
        .live-ops-panel,
        .pillar-column {
          background: none !important;
          border: 0.5pt solid #ccc !important;
          box-shadow: none !important;
        }

        /* Signature — render the static fallback path strokes black */
        .hero-sig-stroke { stroke: #000 !important; filter: none !important; }
        .hero-sig-dot    { fill: #000 !important;   filter: none !important; }
      }
    `}</style>
  );
}
