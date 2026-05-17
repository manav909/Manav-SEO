
// ═══════════════════════════════════════════════════
// SEO SEASON EMPIRE — THEME ENGINE v2
// 10 Environments × 2 Modes = 20 complete worlds
// Each theme is a complete working environment with
// its own personality, feel and unique character
// ═══════════════════════════════════════════════════

export type ThemeId =
  | "void"      // The original — deep space teal (screenshot)
  | "obsidian"  // Electric violet — premium dark luxury
  | "arctic"    // Ice & precision — clinical sharp
  | "carbon"    // Industrial amber — heavy and solid
  | "emerald"   // Forest deep green — growth organic
  | "rose"      // Fashion rose-gold — editorial elegant
  | "solar"     // Desert gold — UAE luxury warm
  | "matrix"    // Terminal green — hacker precise
  | "vapor"     // Vaporwave — retrowave synthwave
  | "cobalt";   // Deep blue — enterprise professional

export type Mode = "dark" | "light";

export interface Theme {
  id: ThemeId;
  name: string;
  mode: Mode;
  tagline: string;
  // ── Backgrounds
  bg: string;         // Page background
  bgCard: string;     // Card background
  bgDeep: string;     // Deepest layer
  bgHover: string;    // Hover state bg
  // ── Accents
  accent: string;
  accentAlt: string;  // Secondary accent (e.g. green for success)
  accentSoft: string;
  accentGlow: string;
  // ── Text
  text: string;
  textSub: string;
  textMuted: string;
  textCode: string;   // Monospace label color
  // ── Borders
  border: string;
  borderGlow: string;
  borderSubtle: string;
  // ── Gradients
  gradHero: string;
  gradAccent: string;
  gradCard: string;
  // ── Shadows
  shadowCard: string;
  shadowGlow: string;
  shadowDeep: string;
  // ── Geometry
  radius: string;      // Card radius
  radiusSm: string;
  radiusLg: string;
  // ── Typography
  fontDisplay: string;
  fontMono: string;
  letterSpacing: string;
  labelStyle: string;  // CSS for status labels
  // ── Animation character
  transitionSpeed: string;  // "fast" | "normal" | "slow"
  bgPattern: string;
  particleColor: string;
  // ── Unique properties per theme
  unique: {
    badgeStyle: "outlined"|"filled"|"flat"|"glow"|"pill";
    buttonShape: "rounded"|"sharp"|"pill"|"angular";
    cardEffect: "glass"|"solid"|"frosted"|"deep"|"bordered";
    statusDot: string;  // Color for status dots
    progressColor: string;
    progressTrack: string;
  };
}

// ═══════════════════════════════════════════════════
// THE 10 THEMES
// ═══════════════════════════════════════════════════
export const THEMES: Record<string, Theme> = {

  // ── 1. VOID (Dark) — Screenshot aesthetic ──────────────
  // Deep space navy, teal/cyan accent, monospace precision
  void_dark: {
    id:"void", name:"Void", mode:"dark",
    tagline:"Deep space precision",
    bg:"#07070f", bgCard:"#0d1117", bgDeep:"#050509", bgHover:"rgba(255,255,255,.03)",
    accent:"#22d3ee", accentAlt:"#10b981", accentSoft:"#67e8f9", accentGlow:"rgba(34,211,238,.25)",
    text:"#f1f5f9", textSub:"#94a3b8", textMuted:"#475569", textCode:"#22d3ee",
    border:"rgba(255,255,255,.07)", borderGlow:"rgba(34,211,238,.35)", borderSubtle:"rgba(255,255,255,.04)",
    gradHero:"linear-gradient(135deg,#07070f 0%,#0d1628 50%,#07070f 100%)",
    gradAccent:"linear-gradient(135deg,#22d3ee,#10b981,#06b6d4)",
    gradCard:"linear-gradient(135deg,rgba(34,211,238,.04) 0%,transparent 60%)",
    shadowCard:"0 1px 3px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.4)",
    shadowGlow:"0 0 20px rgba(34,211,238,.2), 0 0 40px rgba(34,211,238,.08)",
    shadowDeep:"0 20px 60px rgba(0,0,0,.7)",
    radius:"12px", radiusSm:"8px", radiusLg:"16px",
    fontDisplay:"-apple-system,'SF Pro Display',Inter,system-ui,sans-serif",
    fontMono:"'SF Mono','Fira Code','JetBrains Mono',monospace",
    letterSpacing:"-0.015em",
    labelStyle:"font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;",
    transitionSpeed:"normal",
    bgPattern:"dots", particleColor:"#22d3ee",
    unique:{badgeStyle:"outlined",buttonShape:"rounded",cardEffect:"solid",
      statusDot:"#10b981",progressColor:"#22d3ee",progressTrack:"rgba(255,255,255,.08)"},
  },

  // ── 1. VOID (Light) ───────────────────────────────────
  void_light: {
    id:"void", name:"Void", mode:"light",
    tagline:"Crystal clarity",
    bg:"#f8fafc", bgCard:"#ffffff", bgDeep:"#f1f5f9", bgHover:"rgba(0,0,0,.02)",
    accent:"#0891b2", accentAlt:"#059669", accentSoft:"#06b6d4", accentGlow:"rgba(8,145,178,.2)",
    text:"#0f172a", textSub:"#475569", textMuted:"#94a3b8", textCode:"#0891b2",
    border:"rgba(0,0,0,.07)", borderGlow:"rgba(8,145,178,.3)", borderSubtle:"rgba(0,0,0,.04)",
    gradHero:"linear-gradient(135deg,#f8fafc 0%,#e0f2fe 50%,#f8fafc 100%)",
    gradAccent:"linear-gradient(135deg,#0891b2,#059669,#06b6d4)",
    gradCard:"linear-gradient(135deg,rgba(8,145,178,.04) 0%,transparent 60%)",
    shadowCard:"0 1px 3px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.06)",
    shadowGlow:"0 0 20px rgba(8,145,178,.15), 0 0 40px rgba(8,145,178,.06)",
    shadowDeep:"0 20px 60px rgba(0,0,0,.12)",
    radius:"12px", radiusSm:"8px", radiusLg:"16px",
    fontDisplay:"-apple-system,'SF Pro Display',Inter,system-ui,sans-serif",
    fontMono:"'SF Mono','Fira Code','JetBrains Mono',monospace",
    letterSpacing:"-0.015em", labelStyle:"font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;",
    transitionSpeed:"normal", bgPattern:"dots_light", particleColor:"#0891b2",
    unique:{badgeStyle:"outlined",buttonShape:"rounded",cardEffect:"bordered",
      statusDot:"#059669",progressColor:"#0891b2",progressTrack:"rgba(0,0,0,.08)"},
  },

  // ── 2. OBSIDIAN (Dark) — Electric violet luxury ────────
  obsidian_dark: {
    id:"obsidian", name:"Obsidian", mode:"dark",
    tagline:"Precision in darkness",
    bg:"#05050a", bgCard:"#0a0a14", bgDeep:"#030306", bgHover:"rgba(147,51,234,.04)",
    accent:"#a855f7", accentAlt:"#ec4899", accentSoft:"#c084fc", accentGlow:"rgba(168,85,247,.3)",
    text:"#faf5ff", textSub:"#a78bfa", textMuted:"#6d28d9", textCode:"#c084fc",
    border:"rgba(147,51,234,.15)", borderGlow:"rgba(168,85,247,.5)", borderSubtle:"rgba(147,51,234,.07)",
    gradHero:"linear-gradient(135deg,#05050a 0%,#150028 50%,#05050a 100%)",
    gradAccent:"linear-gradient(135deg,#a855f7,#ec4899,#8b5cf6)",
    gradCard:"linear-gradient(135deg,rgba(168,85,247,.06) 0%,transparent 60%)",
    shadowCard:"0 1px 3px rgba(0,0,0,.5), 0 8px 24px rgba(0,0,0,.6)",
    shadowGlow:"0 0 24px rgba(168,85,247,.3), 0 0 48px rgba(168,85,247,.1)",
    shadowDeep:"0 20px 60px rgba(0,0,0,.8)",
    radius:"10px", radiusSm:"6px", radiusLg:"14px",
    fontDisplay:"-apple-system,'SF Pro Display',Inter,system-ui,sans-serif",
    fontMono:"'JetBrains Mono','Fira Code',monospace",
    letterSpacing:"0em", labelStyle:"font-family:var(--font-mono);font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--accent);",
    transitionSpeed:"fast", bgPattern:"neural", particleColor:"#a855f7",
    unique:{badgeStyle:"glow",buttonShape:"rounded",cardEffect:"deep",
      statusDot:"#ec4899",progressColor:"#a855f7",progressTrack:"rgba(168,85,247,.12)"},
  },

  // ── 2. OBSIDIAN (Light) ──────────────────────────────
  obsidian_light: {
    id:"obsidian", name:"Obsidian", mode:"light",
    tagline:"Violet clarity",
    bg:"#faf5ff", bgCard:"#ffffff", bgDeep:"#f5f3ff", bgHover:"rgba(109,40,217,.02)",
    accent:"#7c3aed", accentAlt:"#db2777", accentSoft:"#8b5cf6", accentGlow:"rgba(124,58,237,.18)",
    text:"#1e0542", textSub:"#5b21b6", textMuted:"#8b5cf6", textCode:"#7c3aed",
    border:"rgba(109,40,217,.1)", borderGlow:"rgba(124,58,237,.3)", borderSubtle:"rgba(109,40,217,.05)",
    gradHero:"linear-gradient(135deg,#faf5ff 0%,#f0e8ff 50%,#faf5ff 100%)",
    gradAccent:"linear-gradient(135deg,#7c3aed,#db2777,#8b5cf6)",
    gradCard:"linear-gradient(135deg,rgba(124,58,237,.04) 0%,transparent 60%)",
    shadowCard:"0 1px 3px rgba(0,0,0,.07), 0 8px 24px rgba(109,40,217,.08)",
    shadowGlow:"0 0 20px rgba(124,58,237,.15)", shadowDeep:"0 20px 60px rgba(0,0,0,.1)",
    radius:"10px", radiusSm:"6px", radiusLg:"14px",
    fontDisplay:"-apple-system,'SF Pro Display',Inter,system-ui,sans-serif",
    fontMono:"'JetBrains Mono','Fira Code',monospace",
    letterSpacing:"0em", labelStyle:"font-family:var(--font-mono);font-size:10px;letter-spacing:.15em;text-transform:uppercase;",
    transitionSpeed:"fast", bgPattern:"neural_light", particleColor:"#7c3aed",
    unique:{badgeStyle:"glow",buttonShape:"rounded",cardEffect:"bordered",
      statusDot:"#db2777",progressColor:"#7c3aed",progressTrack:"rgba(109,40,217,.1)"},
  },

  // ── 3. ARCTIC (Dark) — Ice precision ──────────────────
  arctic_dark: {
    id:"arctic", name:"Arctic", mode:"dark",
    tagline:"Cold clarity, sharp edges",
    bg:"#020b14", bgCard:"#071828", bgDeep:"#010810", bgHover:"rgba(186,230,253,.03)",
    accent:"#38bdf8", accentAlt:"#818cf8", accentSoft:"#7dd3fc", accentGlow:"rgba(56,189,248,.2)",
    text:"#e0f2fe", textSub:"#93c5fd", textMuted:"#1e40af", textCode:"#38bdf8",
    border:"rgba(56,189,248,.1)", borderGlow:"rgba(56,189,248,.4)", borderSubtle:"rgba(56,189,248,.05)",
    gradHero:"linear-gradient(180deg,#020b14 0%,#071828 100%)",
    gradAccent:"linear-gradient(135deg,#38bdf8,#818cf8,#22d3ee)",
    gradCard:"linear-gradient(135deg,rgba(56,189,248,.04) 0%,transparent 60%)",
    shadowCard:"0 1px 3px rgba(0,0,0,.4), 0 8px 24px rgba(0,20,40,.5)",
    shadowGlow:"0 0 20px rgba(56,189,248,.2)", shadowDeep:"0 20px 60px rgba(0,0,0,.7)",
    radius:"6px", radiusSm:"4px", radiusLg:"8px",
    fontDisplay:"'SF Pro Display',-apple-system,Inter,system-ui,sans-serif",
    fontMono:"'SF Mono','Fira Code',monospace",
    letterSpacing:".01em", labelStyle:"font-family:var(--font-mono);font-size:9px;letter-spacing:.2em;text-transform:uppercase;font-weight:700;",
    transitionSpeed:"fast", bgPattern:"hex", particleColor:"#38bdf8",
    unique:{badgeStyle:"flat",buttonShape:"sharp",cardEffect:"frosted",
      statusDot:"#38bdf8",progressColor:"#38bdf8",progressTrack:"rgba(56,189,248,.1)"},
  },

  // ── 3. ARCTIC (Light) ────────────────────────────────
  arctic_light: {
    id:"arctic", name:"Arctic", mode:"light",
    tagline:"Polar white precision",
    bg:"#f0f9ff", bgCard:"#ffffff", bgDeep:"#e0f2fe", bgHover:"rgba(14,165,233,.02)",
    accent:"#0284c7", accentAlt:"#6366f1", accentSoft:"#0ea5e9", accentGlow:"rgba(2,132,199,.15)",
    text:"#0c4a6e", textSub:"#0369a1", textMuted:"#7dd3fc", textCode:"#0284c7",
    border:"rgba(2,132,199,.1)", borderGlow:"rgba(2,132,199,.3)", borderSubtle:"rgba(14,165,233,.05)",
    gradHero:"linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%)",
    gradAccent:"linear-gradient(135deg,#0284c7,#6366f1,#0ea5e9)",
    gradCard:"linear-gradient(135deg,rgba(2,132,199,.03) 0%,transparent 60%)",
    shadowCard:"0 1px 2px rgba(0,0,0,.05), 0 4px 16px rgba(14,165,233,.08)",
    shadowGlow:"0 0 16px rgba(2,132,199,.12)", shadowDeep:"0 16px 48px rgba(0,0,0,.08)",
    radius:"6px", radiusSm:"4px", radiusLg:"8px",
    fontDisplay:"'SF Pro Display',-apple-system,Inter,system-ui,sans-serif",
    fontMono:"'SF Mono','Fira Code',monospace",
    letterSpacing:".01em", labelStyle:"font-family:var(--font-mono);font-size:9px;letter-spacing:.2em;text-transform:uppercase;font-weight:700;",
    transitionSpeed:"fast", bgPattern:"hex_light", particleColor:"#0284c7",
    unique:{badgeStyle:"flat",buttonShape:"sharp",cardEffect:"bordered",
      statusDot:"#0284c7",progressColor:"#0284c7",progressTrack:"rgba(14,165,233,.1)"},
  },

  // ── 4. CARBON (Dark) — Industrial amber ───────────────
  carbon_dark: {
    id:"carbon", name:"Carbon", mode:"dark",
    tagline:"Raw industrial power",
    bg:"#080808", bgCard:"#111111", bgDeep:"#050505", bgHover:"rgba(245,158,11,.03)",
    accent:"#f59e0b", accentAlt:"#ef4444", accentSoft:"#fbbf24", accentGlow:"rgba(245,158,11,.25)",
    text:"#fafaf9", textSub:"#a8a29e", textMuted:"#57534e", textCode:"#f59e0b",
    border:"rgba(255,255,255,.08)", borderGlow:"rgba(245,158,11,.4)", borderSubtle:"rgba(255,255,255,.04)",
    gradHero:"linear-gradient(135deg,#080808 0%,#111111 100%)",
    gradAccent:"linear-gradient(135deg,#f59e0b,#ef4444,#fbbf24)",
    gradCard:"linear-gradient(135deg,rgba(245,158,11,.04) 0%,transparent 60%)",
    shadowCard:"0 1px 3px rgba(0,0,0,.5), 0 8px 24px rgba(0,0,0,.7)",
    shadowGlow:"0 0 24px rgba(245,158,11,.2)", shadowDeep:"0 24px 64px rgba(0,0,0,.8)",
    radius:"8px", radiusSm:"5px", radiusLg:"12px",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    fontMono:"'JetBrains Mono',monospace",
    letterSpacing:".02em", labelStyle:"font-family:var(--font-mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;",
    transitionSpeed:"normal", bgPattern:"grid", particleColor:"#f59e0b",
    unique:{badgeStyle:"filled",buttonShape:"angular",cardEffect:"solid",
      statusDot:"#f59e0b",progressColor:"#f59e0b",progressTrack:"rgba(255,255,255,.06)"},
  },

  // ── 4. CARBON (Light) ────────────────────────────────
  carbon_light: {
    id:"carbon", name:"Carbon", mode:"light",
    tagline:"Industrial daylight",
    bg:"#fafaf9", bgCard:"#ffffff", bgDeep:"#f5f5f4", bgHover:"rgba(180,83,9,.02)",
    accent:"#b45309", accentAlt:"#dc2626", accentSoft:"#d97706", accentGlow:"rgba(180,83,9,.15)",
    text:"#1c1917", textSub:"#44403c", textMuted:"#a8a29e", textCode:"#b45309",
    border:"rgba(0,0,0,.07)", borderGlow:"rgba(180,83,9,.3)", borderSubtle:"rgba(0,0,0,.04)",
    gradHero:"linear-gradient(135deg,#fafaf9 0%,#fef3c7 50%,#fafaf9 100%)",
    gradAccent:"linear-gradient(135deg,#b45309,#dc2626,#d97706)",
    gradCard:"linear-gradient(135deg,rgba(180,83,9,.03) 0%,transparent 60%)",
    shadowCard:"0 1px 2px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.06)",
    shadowGlow:"0 0 16px rgba(180,83,9,.12)", shadowDeep:"0 16px 48px rgba(0,0,0,.1)",
    radius:"8px", radiusSm:"5px", radiusLg:"12px",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    fontMono:"'JetBrains Mono',monospace",
    letterSpacing:".02em", labelStyle:"font-family:var(--font-mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;",
    transitionSpeed:"normal", bgPattern:"grid_light", particleColor:"#b45309",
    unique:{badgeStyle:"filled",buttonShape:"angular",cardEffect:"bordered",
      statusDot:"#d97706",progressColor:"#b45309",progressTrack:"rgba(0,0,0,.07)"},
  },

  // ── 5. EMERALD (Dark) — Forest deep ───────────────────
  emerald_dark: {
    id:"emerald", name:"Emerald", mode:"dark",
    tagline:"Growth never stops",
    bg:"#020d08", bgCard:"#071a0f", bgDeep:"#010a06", bgHover:"rgba(16,185,129,.03)",
    accent:"#10b981", accentAlt:"#06b6d4", accentSoft:"#34d399", accentGlow:"rgba(16,185,129,.25)",
    text:"#f0fdf4", textSub:"#86efac", textMuted:"#166534", textCode:"#34d399",
    border:"rgba(16,185,129,.12)", borderGlow:"rgba(16,185,129,.4)", borderSubtle:"rgba(16,185,129,.06)",
    gradHero:"linear-gradient(135deg,#020d08 0%,#071a0f 50%,#020d08 100%)",
    gradAccent:"linear-gradient(135deg,#10b981,#06b6d4,#34d399)",
    gradCard:"linear-gradient(135deg,rgba(16,185,129,.05) 0%,transparent 60%)",
    shadowCard:"0 1px 3px rgba(0,0,0,.4), 0 8px 24px rgba(0,20,10,.5)",
    shadowGlow:"0 0 20px rgba(16,185,129,.2)", shadowDeep:"0 20px 60px rgba(0,0,0,.7)",
    radius:"14px", radiusSm:"9px", radiusLg:"20px",
    fontDisplay:"-apple-system,'SF Pro Display',Inter,system-ui,sans-serif",
    fontMono:"'SF Mono','Fira Code',monospace",
    letterSpacing:"-.01em", labelStyle:"font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;",
    transitionSpeed:"slow", bgPattern:"flow", particleColor:"#10b981",
    unique:{badgeStyle:"pill",buttonShape:"pill",cardEffect:"glass",
      statusDot:"#10b981",progressColor:"#10b981",progressTrack:"rgba(16,185,129,.1)"},
  },

  // ── 5. EMERALD (Light) ───────────────────────────────
  emerald_light: {
    id:"emerald", name:"Emerald", mode:"light",
    tagline:"Daybreak growth",
    bg:"#f0fdf4", bgCard:"#ffffff", bgDeep:"#dcfce7", bgHover:"rgba(5,150,105,.02)",
    accent:"#059669", accentAlt:"#0284c7", accentSoft:"#10b981", accentGlow:"rgba(5,150,105,.15)",
    text:"#052e16", textSub:"#166534", textMuted:"#86efac", textCode:"#059669",
    border:"rgba(5,150,105,.1)", borderGlow:"rgba(5,150,105,.3)", borderSubtle:"rgba(5,150,105,.05)",
    gradHero:"linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)",
    gradAccent:"linear-gradient(135deg,#059669,#0284c7,#10b981)",
    gradCard:"linear-gradient(135deg,rgba(5,150,105,.04) 0%,transparent 60%)",
    shadowCard:"0 1px 2px rgba(0,0,0,.05), 0 4px 16px rgba(5,150,105,.07)",
    shadowGlow:"0 0 16px rgba(5,150,105,.12)", shadowDeep:"0 16px 48px rgba(0,0,0,.08)",
    radius:"14px", radiusSm:"9px", radiusLg:"20px",
    fontDisplay:"-apple-system,'SF Pro Display',Inter,system-ui,sans-serif",
    fontMono:"'SF Mono','Fira Code',monospace",
    letterSpacing:"-.01em", labelStyle:"font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;",
    transitionSpeed:"slow", bgPattern:"flow_light", particleColor:"#059669",
    unique:{badgeStyle:"pill",buttonShape:"pill",cardEffect:"bordered",
      statusDot:"#059669",progressColor:"#059669",progressTrack:"rgba(5,150,105,.1)"},
  },

  // ── 6. ROSE (Dark) — Fashion editorial ────────────────
  rose_dark: {
    id:"rose", name:"Rose", mode:"dark",
    tagline:"Elegant precision",
    bg:"#080409", bgCard:"#110810", bgDeep:"#050204", bgHover:"rgba(236,72,153,.03)",
    accent:"#ec4899", accentAlt:"#f43f5e", accentSoft:"#f472b6", accentGlow:"rgba(236,72,153,.25)",
    text:"#fff1f2", textSub:"#fda4af", textMuted:"#9f1239", textCode:"#f472b6",
    border:"rgba(236,72,153,.12)", borderGlow:"rgba(236,72,153,.5)", borderSubtle:"rgba(236,72,153,.06)",
    gradHero:"linear-gradient(135deg,#080409 0%,#1a0614 50%,#080409 100%)",
    gradAccent:"linear-gradient(135deg,#ec4899,#f43f5e,#a855f7)",
    gradCard:"linear-gradient(135deg,rgba(236,72,153,.05) 0%,transparent 60%)",
    shadowCard:"0 1px 3px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.6)",
    shadowGlow:"0 0 24px rgba(236,72,153,.25)", shadowDeep:"0 20px 60px rgba(0,0,0,.75)",
    radius:"16px", radiusSm:"10px", radiusLg:"22px",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    fontMono:"'JetBrains Mono',monospace",
    letterSpacing:".03em", labelStyle:"font-family:var(--font-mono);font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent-soft);",
    transitionSpeed:"slow", bgPattern:"arabesque", particleColor:"#ec4899",
    unique:{badgeStyle:"pill",buttonShape:"pill",cardEffect:"glass",
      statusDot:"#f43f5e",progressColor:"#ec4899",progressTrack:"rgba(236,72,153,.1)"},
  },

  // ── 6. ROSE (Light) ──────────────────────────────────
  rose_light: {
    id:"rose", name:"Rose", mode:"light",
    tagline:"Blush editorial",
    bg:"#fff1f2", bgCard:"#ffffff", bgDeep:"#ffe4e6", bgHover:"rgba(225,29,72,.02)",
    accent:"#e11d48", accentAlt:"#7c3aed", accentSoft:"#f43f5e", accentGlow:"rgba(225,29,72,.15)",
    text:"#4c0519", textSub:"#9f1239", textMuted:"#fda4af", textCode:"#e11d48",
    border:"rgba(225,29,72,.1)", borderGlow:"rgba(225,29,72,.3)", borderSubtle:"rgba(225,29,72,.05)",
    gradHero:"linear-gradient(135deg,#fff1f2 0%,#ffe4e6 100%)",
    gradAccent:"linear-gradient(135deg,#e11d48,#7c3aed,#f43f5e)",
    gradCard:"linear-gradient(135deg,rgba(225,29,72,.04) 0%,transparent 60%)",
    shadowCard:"0 1px 2px rgba(0,0,0,.05), 0 4px 16px rgba(225,29,72,.07)",
    shadowGlow:"0 0 16px rgba(225,29,72,.12)", shadowDeep:"0 16px 48px rgba(0,0,0,.08)",
    radius:"16px", radiusSm:"10px", radiusLg:"22px",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    fontMono:"'JetBrains Mono',monospace",
    letterSpacing:".03em", labelStyle:"font-family:var(--font-mono);font-size:9px;letter-spacing:.18em;text-transform:uppercase;",
    transitionSpeed:"slow", bgPattern:"arabesque_light", particleColor:"#e11d48",
    unique:{badgeStyle:"pill",buttonShape:"pill",cardEffect:"bordered",
      statusDot:"#f43f5e",progressColor:"#e11d48",progressTrack:"rgba(225,29,72,.08)"},
  },

  // ── 7. SOLAR (Dark) — UAE luxury gold ─────────────────
  solar_dark: {
    id:"solar", name:"Solar", mode:"dark",
    tagline:"Excellence without compromise",
    bg:"#060500", bgCard:"#0e0c00", bgDeep:"#040300", bgHover:"rgba(212,160,23,.03)",
    accent:"#d4a017", accentAlt:"#f59e0b", accentSoft:"#fbbf24", accentGlow:"rgba(212,160,23,.3)",
    text:"#fffbeb", textSub:"#fde68a", textMuted:"#92400e", textCode:"#fbbf24",
    border:"rgba(212,160,23,.15)", borderGlow:"rgba(212,160,23,.5)", borderSubtle:"rgba(212,160,23,.07)",
    gradHero:"linear-gradient(160deg,#060500 0%,#1a1200 40%,#060500 100%)",
    gradAccent:"linear-gradient(135deg,#d4a017,#f59e0b,#fbbf24)",
    gradCard:"linear-gradient(135deg,rgba(212,160,23,.06) 0%,transparent 60%)",
    shadowCard:"0 1px 3px rgba(0,0,0,.5), 0 8px 24px rgba(0,0,0,.6)",
    shadowGlow:"0 0 28px rgba(212,160,23,.3)", shadowDeep:"0 24px 64px rgba(0,0,0,.8)",
    radius:"10px", radiusSm:"6px", radiusLg:"14px",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    fontMono:"'JetBrains Mono',monospace",
    letterSpacing:".025em", labelStyle:"font-family:var(--font-mono);font-size:9px;letter-spacing:.15em;text-transform:uppercase;",
    transitionSpeed:"normal", bgPattern:"hex", particleColor:"#d4a017",
    unique:{badgeStyle:"glow",buttonShape:"angular",cardEffect:"deep",
      statusDot:"#f59e0b",progressColor:"#d4a017",progressTrack:"rgba(212,160,23,.12)"},
  },

  // ── 7. SOLAR (Light) ─────────────────────────────────
  solar_light: {
    id:"solar", name:"Solar", mode:"light",
    tagline:"Desert daylight",
    bg:"#fffbeb", bgCard:"#ffffff", bgDeep:"#fef3c7", bgHover:"rgba(146,64,14,.02)",
    accent:"#b45309", accentAlt:"#b91c1c", accentSoft:"#d97706", accentGlow:"rgba(180,83,9,.15)",
    text:"#451a03", textSub:"#78350f", textMuted:"#fde68a", textCode:"#b45309",
    border:"rgba(146,64,14,.1)", borderGlow:"rgba(180,83,9,.3)", borderSubtle:"rgba(146,64,14,.05)",
    gradHero:"linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)",
    gradAccent:"linear-gradient(135deg,#b45309,#b91c1c,#d97706)",
    gradCard:"linear-gradient(135deg,rgba(180,83,9,.04) 0%,transparent 60%)",
    shadowCard:"0 1px 2px rgba(0,0,0,.06), 0 4px 16px rgba(146,64,14,.07)",
    shadowGlow:"0 0 16px rgba(180,83,9,.12)", shadowDeep:"0 16px 48px rgba(0,0,0,.08)",
    radius:"10px", radiusSm:"6px", radiusLg:"14px",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    fontMono:"'JetBrains Mono',monospace",
    letterSpacing:".025em", labelStyle:"font-family:var(--font-mono);font-size:9px;letter-spacing:.15em;text-transform:uppercase;",
    transitionSpeed:"normal", bgPattern:"hex_light", particleColor:"#b45309",
    unique:{badgeStyle:"glow",buttonShape:"angular",cardEffect:"bordered",
      statusDot:"#d97706",progressColor:"#b45309",progressTrack:"rgba(146,64,14,.08)"},
  },

  // ── 8. MATRIX (Dark) — Terminal hacker ────────────────
  matrix_dark: {
    id:"matrix", name:"Matrix", mode:"dark",
    tagline:"All signals visible",
    bg:"#000000", bgCard:"#001a00", bgDeep:"#000000", bgHover:"rgba(0,255,0,.02)",
    accent:"#00ff41", accentAlt:"#00b300", accentSoft:"#39ff14", accentGlow:"rgba(0,255,65,.25)",
    text:"#ccffcc", textSub:"#00cc00", textMuted:"#004400", textCode:"#00ff41",
    border:"rgba(0,255,65,.15)", borderGlow:"rgba(0,255,65,.5)", borderSubtle:"rgba(0,255,65,.08)",
    gradHero:"linear-gradient(180deg,#000000 0%,#001200 100%)",
    gradAccent:"linear-gradient(135deg,#00ff41,#00b300,#39ff14)",
    gradCard:"linear-gradient(135deg,rgba(0,255,65,.04) 0%,transparent 60%)",
    shadowCard:"0 0 0 .5px rgba(0,255,65,.15)",
    shadowGlow:"0 0 24px rgba(0,255,65,.3)", shadowDeep:"0 20px 60px rgba(0,0,0,.9)",
    radius:"4px", radiusSm:"2px", radiusLg:"6px",
    fontDisplay:"'JetBrains Mono','Courier New',monospace",
    fontMono:"'JetBrains Mono','Courier New',monospace",
    letterSpacing:".04em", labelStyle:"font-family:var(--font-mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-weight:400;",
    transitionSpeed:"fast", bgPattern:"matrix", particleColor:"#00ff41",
    unique:{badgeStyle:"flat",buttonShape:"sharp",cardEffect:"bordered",
      statusDot:"#00ff41",progressColor:"#00ff41",progressTrack:"rgba(0,255,65,.08)"},
  },

  // ── 9. VAPOR (Dark) — Vaporwave retrowave ─────────────
  vapor_dark: {
    id:"vapor", name:"Vapor", mode:"dark",
    tagline:"Retrowave futures",
    bg:"#0a0014", bgCard:"#12001e", bgDeep:"#060009", bgHover:"rgba(255,0,128,.02)",
    accent:"#ff006e", accentAlt:"#8338ec", accentSoft:"#ff6b9d", accentGlow:"rgba(255,0,110,.3)",
    text:"#ffe4f3", textSub:"#ff9ecd", textMuted:"#6b0033", textCode:"#ff6b9d",
    border:"rgba(255,0,110,.15)", borderGlow:"rgba(255,0,110,.6)", borderSubtle:"rgba(131,56,236,.08)",
    gradHero:"linear-gradient(135deg,#0a0014 0%,#200030 40%,#0a0014 100%)",
    gradAccent:"linear-gradient(90deg,#ff006e,#8338ec,#3a86ff)",
    gradCard:"linear-gradient(135deg,rgba(255,0,110,.05) 0%,rgba(131,56,236,.03) 100%)",
    shadowCard:"0 1px 3px rgba(0,0,0,.5), 0 8px 24px rgba(0,0,0,.7)",
    shadowGlow:"0 0 30px rgba(255,0,110,.3), 0 0 60px rgba(131,56,236,.15)",
    shadowDeep:"0 24px 80px rgba(0,0,0,.8)",
    radius:"12px", radiusSm:"8px", radiusLg:"18px",
    fontDisplay:"-apple-system,'SF Pro Display',system-ui,sans-serif",
    fontMono:"'JetBrains Mono',monospace",
    letterSpacing:".01em", labelStyle:"font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;",
    transitionSpeed:"slow", bgPattern:"waves", particleColor:"#ff006e",
    unique:{badgeStyle:"glow",buttonShape:"pill",cardEffect:"glass",
      statusDot:"#ff006e",progressColor:"linear-gradient(90deg,#ff006e,#8338ec)",progressTrack:"rgba(255,0,110,.1)"},
  },

  // ── 9. VAPOR (Light) — Pastel vaporwave ───────────────
  vapor_light: {
    id:"vapor", name:"Vapor", mode:"light",
    tagline:"Pastel wave",
    bg:"#fdf4ff", bgCard:"#ffffff", bgDeep:"#f5e6ff", bgHover:"rgba(131,56,236,.02)",
    accent:"#7c3aed", accentAlt:"#ec4899", accentSoft:"#a855f7", accentGlow:"rgba(124,58,237,.15)",
    text:"#2d0040", textSub:"#5b21b6", textMuted:"#c084fc", textCode:"#7c3aed",
    border:"rgba(124,58,237,.1)", borderGlow:"rgba(124,58,237,.3)", borderSubtle:"rgba(124,58,237,.05)",
    gradHero:"linear-gradient(135deg,#fdf4ff 0%,#f5e6ff 50%,#fce7f3 100%)",
    gradAccent:"linear-gradient(90deg,#7c3aed,#ec4899,#6366f1)",
    gradCard:"linear-gradient(135deg,rgba(124,58,237,.04) 0%,transparent 60%)",
    shadowCard:"0 1px 2px rgba(0,0,0,.05), 0 4px 16px rgba(124,58,237,.07)",
    shadowGlow:"0 0 16px rgba(124,58,237,.12)", shadowDeep:"0 16px 48px rgba(0,0,0,.08)",
    radius:"12px", radiusSm:"8px", radiusLg:"18px",
    fontDisplay:"-apple-system,'SF Pro Display',system-ui,sans-serif",
    fontMono:"'JetBrains Mono',monospace",
    letterSpacing:".01em", labelStyle:"font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;",
    transitionSpeed:"slow", bgPattern:"waves_light", particleColor:"#7c3aed",
    unique:{badgeStyle:"glow",buttonShape:"pill",cardEffect:"bordered",
      statusDot:"#ec4899",progressColor:"#7c3aed",progressTrack:"rgba(124,58,237,.1)"},
  },

  // ── 10. COBALT (Dark) — Enterprise depth ──────────────
  cobalt_dark: {
    id:"cobalt", name:"Cobalt", mode:"dark",
    tagline:"Enterprise intelligence",
    bg:"#020918", bgCard:"#071022", bgDeep:"#010610", bgHover:"rgba(37,99,235,.03)",
    accent:"#3b82f6", accentAlt:"#10b981", accentSoft:"#60a5fa", accentGlow:"rgba(59,130,246,.25)",
    text:"#eff6ff", textSub:"#93c5fd", textMuted:"#1e3a8a", textCode:"#60a5fa",
    border:"rgba(59,130,246,.12)", borderGlow:"rgba(59,130,246,.4)", borderSubtle:"rgba(59,130,246,.06)",
    gradHero:"linear-gradient(135deg,#020918 0%,#0a1a3a 50%,#020918 100%)",
    gradAccent:"linear-gradient(135deg,#3b82f6,#10b981,#6366f1)",
    gradCard:"linear-gradient(135deg,rgba(59,130,246,.04) 0%,transparent 60%)",
    shadowCard:"0 1px 3px rgba(0,0,0,.4), 0 8px 24px rgba(0,20,60,.4)",
    shadowGlow:"0 0 20px rgba(59,130,246,.2)", shadowDeep:"0 20px 60px rgba(0,0,0,.7)",
    radius:"10px", radiusSm:"7px", radiusLg:"14px",
    fontDisplay:"-apple-system,'SF Pro Display',Inter,system-ui,sans-serif",
    fontMono:"'SF Mono','JetBrains Mono',monospace",
    letterSpacing:"-.01em", labelStyle:"font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;",
    transitionSpeed:"normal", bgPattern:"grid", particleColor:"#3b82f6",
    unique:{badgeStyle:"outlined",buttonShape:"rounded",cardEffect:"frosted",
      statusDot:"#3b82f6",progressColor:"#3b82f6",progressTrack:"rgba(59,130,246,.1)"},
  },

  // ── 10. COBALT (Light) ───────────────────────────────
  cobalt_light: {
    id:"cobalt", name:"Cobalt", mode:"light",
    tagline:"Daylight enterprise",
    bg:"#eff6ff", bgCard:"#ffffff", bgDeep:"#dbeafe", bgHover:"rgba(37,99,235,.02)",
    accent:"#1d4ed8", accentAlt:"#059669", accentSoft:"#2563eb", accentGlow:"rgba(29,78,216,.15)",
    text:"#1e3a8a", textSub:"#1d4ed8", textMuted:"#93c5fd", textCode:"#1d4ed8",
    border:"rgba(29,78,216,.1)", borderGlow:"rgba(29,78,216,.3)", borderSubtle:"rgba(37,99,235,.05)",
    gradHero:"linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)",
    gradAccent:"linear-gradient(135deg,#1d4ed8,#059669,#2563eb)",
    gradCard:"linear-gradient(135deg,rgba(29,78,216,.04) 0%,transparent 60%)",
    shadowCard:"0 1px 2px rgba(0,0,0,.05), 0 4px 16px rgba(29,78,216,.07)",
    shadowGlow:"0 0 16px rgba(29,78,216,.12)", shadowDeep:"0 16px 48px rgba(0,0,0,.07)",
    radius:"10px", radiusSm:"7px", radiusLg:"14px",
    fontDisplay:"-apple-system,'SF Pro Display',Inter,system-ui,sans-serif",
    fontMono:"'SF Mono','JetBrains Mono',monospace",
    letterSpacing:"-.01em", labelStyle:"font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;",
    transitionSpeed:"normal", bgPattern:"grid_light", particleColor:"#1d4ed8",
    unique:{badgeStyle:"outlined",buttonShape:"rounded",cardEffect:"bordered",
      statusDot:"#1d4ed8",progressColor:"#1d4ed8",progressTrack:"rgba(29,78,216,.1)"},
  },
};

// ── DEFAULT: VOID DARK (matches screenshot) ────────────────
export const DEFAULT_THEME = THEMES.void_dark;

// ── DETECT THEME from project data ─────────────────────────
export function detectTheme(project?: any, mode: Mode = "dark"): Theme {
  if (!project) return THEMES[`void_${mode}`] || DEFAULT_THEME;
  const industry = (project.industry || "").toLowerCase();
  const goals    = (project.goals    || "").toLowerCase();
  const market   = (project.market   || "").toLowerCase();
  const wantTraffic = goals.includes("traffic") || goals.includes("organic");
  const isUAE       = market.includes("uae") || market.includes("dubai");
  const isFinance   = industry.includes("finance") || industry.includes("legal");
  const isHealth    = industry.includes("health") || industry.includes("medical");
  const isFashion   = industry.includes("fashion") || industry.includes("beauty");
  const isEcom      = industry.includes("ecommerce") || industry.includes("shop");
  const isLLM       = goals.includes("llm") || goals.includes("ai");
  if (isUAE)     return THEMES[`solar_${mode}`]   || DEFAULT_THEME;
  if (isFinance) return THEMES[`carbon_${mode}`]  || DEFAULT_THEME;
  if (isHealth)  return THEMES[`arctic_${mode}`]  || DEFAULT_THEME;
  if (isFashion) return THEMES[`rose_${mode}`]    || DEFAULT_THEME;
  if (isEcom)    return THEMES[`emerald_${mode}`] || DEFAULT_THEME;
  if (isLLM)     return THEMES[`obsidian_${mode}`]|| DEFAULT_THEME;
  if (wantTraffic)return THEMES[`cobalt_${mode}`] || DEFAULT_THEME;
  return THEMES[`void_${mode}`] || DEFAULT_THEME;
}

// ── APPLY THEME TO CSS VARS ─────────────────────────────────
export function applyTheme(t: Theme): void {
  const r = document.documentElement;
  const s = r.style;
  // Base
  s.setProperty("--bg",            t.bg);
  s.setProperty("--bg-card",       t.bgCard);
  s.setProperty("--bg-deep",       t.bgDeep);
  s.setProperty("--bg-hover",      t.bgHover);
  // Accent
  s.setProperty("--accent",        t.accent);
  s.setProperty("--accent-alt",    t.accentAlt);
  s.setProperty("--accent-soft",   t.accentSoft);
  s.setProperty("--accent-glow",   t.accentGlow);
  // Text
  s.setProperty("--text",          t.text);
  s.setProperty("--text-sub",      t.textSub);
  s.setProperty("--text-muted",    t.textMuted);
  s.setProperty("--text-code",     t.textCode);
  // Border
  s.setProperty("--border",        t.border);
  s.setProperty("--border-glow",   t.borderGlow);
  s.setProperty("--border-subtle", t.borderSubtle);
  // Gradients
  s.setProperty("--grad-hero",     t.gradHero);
  s.setProperty("--grad-accent",   t.gradAccent);
  s.setProperty("--grad-card",     t.gradCard);
  // Shadows
  s.setProperty("--shadow-card",   t.shadowCard);
  s.setProperty("--shadow-glow",   t.shadowGlow);
  s.setProperty("--shadow-deep",   t.shadowDeep);
  // Geometry
  s.setProperty("--radius",        t.radius);
  s.setProperty("--radius-sm",     t.radiusSm);
  s.setProperty("--radius-lg",     t.radiusLg);
  // Typography
  s.setProperty("--font-display",  t.fontDisplay);
  s.setProperty("--font-mono",     t.fontMono);
  s.setProperty("--letter-spacing",t.letterSpacing);
  // Unique
  s.setProperty("--status-dot",    t.unique.statusDot);
  s.setProperty("--progress-color",t.unique.progressColor);
  s.setProperty("--progress-track",t.unique.progressTrack);
  // Page bg
  document.body.style.background = t.bg;
  document.body.style.color = t.text;
  document.body.style.fontFamily = t.fontDisplay;
  document.documentElement.setAttribute("data-theme", `${t.id}_${t.mode}`);
  document.documentElement.setAttribute("data-mode", t.mode);
  document.documentElement.setAttribute("data-radius", t.radius);
  document.documentElement.setAttribute("data-transition", t.transitionSpeed);
}
