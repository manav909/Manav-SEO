
export type Industry = "saas"|"ecommerce"|"local"|"healthcare"|"finance"|"fashion"|"legal"|"tech"|"media"|"travel"|"education"|"real_estate"|"general";
export type Goal     = "traffic"|"ranking"|"llm_visibility"|"revenue"|"brand"|"technical"|"all";
export type Market   = "uk"|"us"|"uae"|"india"|"au"|"eu"|"global"|"apac"|"mena";
export type Mode     = "dark"|"light";

export interface Theme {
  id: string;
  name: string;
  mode: Mode;
  // Core palette
  bg: string;        // page background
  bgCard: string;    // card background
  bgDeep: string;    // deepest background
  accent: string;    // primary accent
  accentSoft: string;// softer accent
  accentGlow: string;// glow color
  text: string;      // primary text
  textSub: string;   // secondary text
  textMuted: string; // muted text
  border: string;    // border color
  borderGlow: string;// glowing border
  // Gradients
  gradHero: string;   // hero gradient
  gradCard: string;   // card gradient
  gradAccent: string; // accent gradient
  // Animation
  bgPattern: string;  // background pattern type
  particleColor: string;
  // Emotion
  emotion: string;
  tagline: string;
  // Typography feel
  fontDisplay: string;
  letterSpacing: string;
}

export const THEMES: Record<string, Theme> = {

  // ── SAAS / TECH (Ranking focus) ─────────────────────────
  saas_ranking_dark: {
    id:"saas_ranking_dark", name:"Apex Dark", mode:"dark", emotion:"precision",
    tagline:"Built for dominance",
    bg:"#04040d", bgCard:"#080818", bgDeep:"#020209",
    accent:"#6366f1", accentSoft:"#818cf8", accentGlow:"rgba(99,102,241,.35)",
    text:"#f0f0ff", textSub:"#a0a0c0", textMuted:"#4b4b7a",
    border:"#1a1a3a", borderGlow:"rgba(99,102,241,.4)",
    gradHero:"linear-gradient(135deg,#0d0d2a 0%,#1a0a3a 50%,#0a1a2a 100%)",
    gradCard:"linear-gradient(135deg,rgba(99,102,241,.06) 0%,rgba(139,92,246,.03) 100%)",
    gradAccent:"linear-gradient(135deg,#6366f1,#8b5cf6,#06b6d4)",
    bgPattern:"grid", particleColor:"#6366f1",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    letterSpacing:"-0.02em",
  },

  // ── SAAS / TECH (Traffic focus) ─────────────────────────
  saas_traffic_dark: {
    id:"saas_traffic_dark", name:"Velocity Dark", mode:"dark", emotion:"growth",
    tagline:"Every click compounds",
    bg:"#030a08", bgCard:"#061510", bgDeep:"#020806",
    accent:"#10b981", accentSoft:"#34d399", accentGlow:"rgba(16,185,129,.35)",
    text:"#f0fff8", textSub:"#a0c0b0", textMuted:"#3a5a4a",
    border:"#0f2a1e", borderGlow:"rgba(16,185,129,.4)",
    gradHero:"linear-gradient(135deg,#030a08 0%,#061a12 50%,#0a1a08 100%)",
    gradCard:"linear-gradient(135deg,rgba(16,185,129,.06) 0%,rgba(6,182,212,.03) 100%)",
    gradAccent:"linear-gradient(135deg,#10b981,#06b6d4,#6366f1)",
    bgPattern:"flow", particleColor:"#10b981",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    letterSpacing:"-0.01em",
  },

  // ── E-COMMERCE (Revenue focus) ──────────────────────────
  ecommerce_revenue_dark: {
    id:"ecommerce_revenue_dark", name:"Commerce Gold", mode:"dark", emotion:"desire",
    tagline:"Turn search into sales",
    bg:"#0a0800", bgCard:"#140e00", bgDeep:"#070500",
    accent:"#f59e0b", accentSoft:"#fbbf24", accentGlow:"rgba(245,158,11,.35)",
    text:"#fff8e8", textSub:"#c0a860", textMuted:"#5a4a20",
    border:"#2a1e00", borderGlow:"rgba(245,158,11,.4)",
    gradHero:"linear-gradient(135deg,#0a0800 0%,#1a1000 50%,#100a00 100%)",
    gradCard:"linear-gradient(135deg,rgba(245,158,11,.06) 0%,rgba(239,68,68,.03) 100%)",
    gradAccent:"linear-gradient(135deg,#f59e0b,#ef4444,#ec4899)",
    bgPattern:"pulse", particleColor:"#f59e0b",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    letterSpacing:"0em",
  },

  // ── HEALTHCARE (Trust focus) ─────────────────────────────
  healthcare_brand_dark: {
    id:"healthcare_brand_dark", name:"Clarity Dark", mode:"dark", emotion:"trust",
    tagline:"Precision builds trust",
    bg:"#020d10", bgCard:"#041820", bgDeep:"#010a0d",
    accent:"#06b6d4", accentSoft:"#22d3ee", accentGlow:"rgba(6,182,212,.35)",
    text:"#eefeff", textSub:"#7fb8c0", textMuted:"#2a5060",
    border:"#0a2530", borderGlow:"rgba(6,182,212,.4)",
    gradHero:"linear-gradient(135deg,#020d10 0%,#041a20 50%,#020f18 100%)",
    gradCard:"linear-gradient(135deg,rgba(6,182,212,.06) 0%,rgba(16,185,129,.03) 100%)",
    gradAccent:"linear-gradient(135deg,#06b6d4,#10b981,#6366f1)",
    bgPattern:"dots", particleColor:"#06b6d4",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    letterSpacing:"0.01em",
  },

  // ── FINANCE (Precision/Revenue) ──────────────────────────
  finance_revenue_dark: {
    id:"finance_revenue_dark", name:"Bullion Dark", mode:"dark", emotion:"power",
    tagline:"Numbers don't lie",
    bg:"#050508", bgCard:"#0a0a14", bgDeep:"#030305",
    accent:"#c9a227", accentSoft:"#e4b84d", accentGlow:"rgba(201,162,39,.35)",
    text:"#f8f4e8", textSub:"#a89870", textMuted:"#4a4230",
    border:"#1a1608", borderGlow:"rgba(201,162,39,.4)",
    gradHero:"linear-gradient(135deg,#050508 0%,#0f0c04 50%,#08060a 100%)",
    gradCard:"linear-gradient(135deg,rgba(201,162,39,.06) 0%,rgba(99,102,241,.03) 100%)",
    gradAccent:"linear-gradient(135deg,#c9a227,#6366f1,#e4b84d)",
    bgPattern:"hex", particleColor:"#c9a227",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    letterSpacing:"0.02em",
  },

  // ── FASHION / LIFESTYLE ──────────────────────────────────
  fashion_brand_dark: {
    id:"fashion_brand_dark", name:"Editorial Dark", mode:"dark", emotion:"elegance",
    tagline:"Identity is everything",
    bg:"#080808", bgCard:"#101010", bgDeep:"#050505",
    accent:"#ec4899", accentSoft:"#f472b6", accentGlow:"rgba(236,72,153,.35)",
    text:"#ffffff", textSub:"#a0a0a0", textMuted:"#404040",
    border:"#1a1a1a", borderGlow:"rgba(236,72,153,.4)",
    gradHero:"linear-gradient(135deg,#080808 0%,#140010 50%,#080808 100%)",
    gradCard:"linear-gradient(135deg,rgba(236,72,153,.06) 0%,rgba(139,92,246,.03) 100%)",
    gradAccent:"linear-gradient(135deg,#ec4899,#8b5cf6,#06b6d4)",
    bgPattern:"editorial", particleColor:"#ec4899",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    letterSpacing:"0.08em",
  },

  // ── UAE / LUXURY MARKET ──────────────────────────────────
  uae_revenue_dark: {
    id:"uae_revenue_dark", name:"Arabia Gold", mode:"dark", emotion:"luxury",
    tagline:"Excellence without compromise",
    bg:"#06050a", bgCard:"#0e0c16", bgDeep:"#04030a",
    accent:"#d4a017", accentSoft:"#f0c040", accentGlow:"rgba(212,160,23,.4)",
    text:"#fef8e8", textSub:"#c0a870", textMuted:"#605030",
    border:"#1e1a08", borderGlow:"rgba(212,160,23,.5)",
    gradHero:"linear-gradient(160deg,#06050a 0%,#1a1400 30%,#0a080f 70%,#06050a 100%)",
    gradCard:"linear-gradient(135deg,rgba(212,160,23,.08) 0%,rgba(139,92,246,.04) 100%)",
    gradAccent:"linear-gradient(135deg,#d4a017,#8b5cf6,#f0c040)",
    bgPattern:"arabesque", particleColor:"#d4a017",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    letterSpacing:"0.03em",
  },

  // ── INDIA / GROWTH MARKET ────────────────────────────────
  india_traffic_dark: {
    id:"india_traffic_dark", name:"Velocity India", mode:"dark", emotion:"energy",
    tagline:"Scale at Indian speed",
    bg:"#080408", bgCard:"#120810", bgDeep:"#060206",
    accent:"#ff6b35", accentSoft:"#ff8c5a", accentGlow:"rgba(255,107,53,.35)",
    text:"#fff4f0", textSub:"#c08070", textMuted:"#603020",
    border:"#2a1008", borderGlow:"rgba(255,107,53,.4)",
    gradHero:"linear-gradient(135deg,#080408 0%,#180808 50%,#080408 100%)",
    gradCard:"linear-gradient(135deg,rgba(255,107,53,.06) 0%,rgba(245,158,11,.03) 100%)",
    gradAccent:"linear-gradient(135deg,#ff6b35,#f59e0b,#ec4899)",
    bgPattern:"waves", particleColor:"#ff6b35",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    letterSpacing:"-0.01em",
  },

  // ── LOCAL BUSINESS ───────────────────────────────────────
  local_ranking_dark: {
    id:"local_ranking_dark", name:"Local Hero", mode:"dark", emotion:"community",
    tagline:"Own your neighbourhood",
    bg:"#040810", bgCard:"#080f1e", bgDeep:"#020510",
    accent:"#3b82f6", accentSoft:"#60a5fa", accentGlow:"rgba(59,130,246,.35)",
    text:"#eef4ff", textSub:"#8098c0", textMuted:"#304060",
    border:"#0e1e30", borderGlow:"rgba(59,130,246,.4)",
    gradHero:"linear-gradient(135deg,#040810 0%,#081020 50%,#040c18 100%)",
    gradCard:"linear-gradient(135deg,rgba(59,130,246,.06) 0%,rgba(16,185,129,.03) 100%)",
    gradAccent:"linear-gradient(135deg,#3b82f6,#10b981,#6366f1)",
    bgPattern:"map", particleColor:"#3b82f6",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    letterSpacing:"-0.005em",
  },

  // ── LLM VISIBILITY FOCUS ─────────────────────────────────
  general_llm_dark: {
    id:"general_llm_dark", name:"Neural Dark", mode:"dark", emotion:"intelligence",
    tagline:"The AI sees you now",
    bg:"#04080f", bgCard:"#080f1c", bgDeep:"#020508",
    accent:"#8b5cf6", accentSoft:"#a78bfa", accentGlow:"rgba(139,92,246,.4)",
    text:"#f0f0ff", textSub:"#9090c0", textMuted:"#404070",
    border:"#151530", borderGlow:"rgba(139,92,246,.4)",
    gradHero:"linear-gradient(135deg,#04080f 0%,#0d0820 50%,#04080f 100%)",
    gradCard:"linear-gradient(135deg,rgba(139,92,246,.07) 0%,rgba(6,182,212,.03) 100%)",
    gradAccent:"linear-gradient(135deg,#8b5cf6,#06b6d4,#10b981)",
    bgPattern:"neural", particleColor:"#8b5cf6",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    letterSpacing:"-0.02em",
  },

  // ── LIGHT MODES ─────────────────────────────────────────
  saas_ranking_light: {
    id:"saas_ranking_light", name:"Apex Light", mode:"light", emotion:"precision",
    tagline:"Built for dominance",
    bg:"#f8f8ff", bgCard:"#ffffff", bgDeep:"#f0f0fa",
    accent:"#6366f1", accentSoft:"#818cf8", accentGlow:"rgba(99,102,241,.2)",
    text:"#1a1a2e", textSub:"#4a4a6a", textMuted:"#9090b0",
    border:"#e0e0f0", borderGlow:"rgba(99,102,241,.3)",
    gradHero:"linear-gradient(135deg,#f0f0ff 0%,#e8e8ff 100%)",
    gradCard:"linear-gradient(135deg,rgba(99,102,241,.04) 0%,rgba(139,92,246,.02) 100%)",
    gradAccent:"linear-gradient(135deg,#6366f1,#8b5cf6,#06b6d4)",
    bgPattern:"grid_light", particleColor:"#6366f1",
    fontDisplay:"'SF Pro Display',-apple-system,system-ui,sans-serif",
    letterSpacing:"-0.02em",
  },
};

export function detectTheme(project?: any, mode: Mode = "dark"): Theme {
  if (!project) return THEMES[`saas_ranking_${mode}`] || THEMES.saas_ranking_dark;

  const industry = (project.industry || "general").toLowerCase();
  const goals    = (project.goals || "").toLowerCase();
  const market   = (project.market || "global").toLowerCase();

  // Goal detection
  const wantTraffic = goals.includes("traffic") || goals.includes("visit") || goals.includes("organic");
  const wantRanking = goals.includes("rank") || goals.includes("position") || goals.includes("top");
  const wantLLM     = goals.includes("llm") || goals.includes("ai") || goals.includes("citation");
  const wantRevenue = goals.includes("revenue") || goals.includes("sale") || goals.includes("convert") || goals.includes("roi");
  const wantBrand   = goals.includes("brand") || goals.includes("visibility") || goals.includes("awareness");

  // Market detection
  const isUAE   = market.includes("uae") || market.includes("dubai") || market.includes("arab");
  const isIndia = market.includes("india") || market.includes("in") || market.includes("mumbai");

  // Theme selection logic
  if (isUAE) return THEMES[`uae_revenue_${mode}`] || THEMES.uae_revenue_dark;
  if (isIndia && wantTraffic) return THEMES[`india_traffic_${mode}`] || THEMES.india_traffic_dark;

  if (industry.includes("fashion") || industry.includes("lifestyle") || industry.includes("beauty"))
    return THEMES[`fashion_brand_${mode}`] || THEMES.fashion_brand_dark;

  if (industry.includes("health") || industry.includes("medical") || industry.includes("dental"))
    return THEMES[`healthcare_brand_${mode}`] || THEMES.healthcare_brand_dark;

  if (industry.includes("finance") || industry.includes("bank") || industry.includes("invest") || industry.includes("legal"))
    return THEMES[`finance_revenue_${mode}`] || THEMES.finance_revenue_dark;

  if (industry.includes("ecommerce") || industry.includes("shop") || industry.includes("retail") || industry.includes("product"))
    return THEMES[`ecommerce_revenue_${mode}`] || THEMES.ecommerce_revenue_dark;

  if (industry.includes("local") || industry.includes("restaurant") || industry.includes("salon"))
    return THEMES[`local_ranking_${mode}`] || THEMES.local_ranking_dark;

  if (wantLLM) return THEMES[`general_llm_${mode}`] || THEMES.general_llm_dark;
  if (wantTraffic) return THEMES[`saas_traffic_${mode}`] || THEMES.saas_traffic_dark;
  if (wantRevenue && (industry.includes("ecommerce") || industry.includes("shop")))
    return THEMES[`ecommerce_revenue_${mode}`] || THEMES.ecommerce_revenue_dark;

  return THEMES[`saas_ranking_${mode}`] || THEMES.saas_ranking_dark;
}

export function themeToCSS(t: Theme): string {
  return `
    --bg: ${t.bg};
    --bg-card: ${t.bgCard};
    --bg-deep: ${t.bgDeep};
    --accent: ${t.accent};
    --accent-soft: ${t.accentSoft};
    --accent-glow: ${t.accentGlow};
    --text: ${t.text};
    --text-sub: ${t.textSub};
    --text-muted: ${t.textMuted};
    --border: ${t.border};
    --border-glow: ${t.borderGlow};
    --grad-hero: ${t.gradHero};
    --grad-card: ${t.gradCard};
    --grad-accent: ${t.gradAccent};
    --particle: ${t.particleColor};
    --letter-spacing: ${t.letterSpacing};
  `;
}
