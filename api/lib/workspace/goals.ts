/* ════════════════════════════════════════════════════════════════
   api/lib/workspace/goals.ts

   The GOAL SYSTEM — the organizing principle of the Workspace.

   Goals are COMPOSABLE: each declares the evidence it needs (which deep
   steps, at what depth) and its data-source dependencies (satisfied by
   existing tools, or needing a new integration to activate). Selecting 2+
   goals unions their needs (deduped). A custom goal lets the operator pick
   needs directly. The run's step-config is COMPUTED from the union.

   This is pure declarative data + a composition function. It holds NO
   project-specific values — fully multi-tenant.
════════════════════════════════════════════════════════════════ */

/* ─── Data sources the system can draw on ──────────────────────── */
export interface DataSource {
  id: string;
  label: string;
  satisfied: boolean;          // true = available with current integrations
  activation_note?: string;    // what the operator must do to activate it
}

export const DATA_SOURCES: Record<string, DataSource> = {
  gsc:       { id: "gsc",       label: "Google Search Console", satisfied: true },
  ga4:       { id: "ga4",       label: "Google Analytics 4",    satisfied: true },
  serpapi:   { id: "serpapi",   label: "SerpAPI (live SERP)",   satisfied: true },
  crux:      { id: "crux",      label: "CrUX / PageSpeed (CWV)", satisfied: true },
  crawl:     { id: "crawl",     label: "Live HTML crawl",       satisfied: true },
  ga4_conv:  { id: "ga4_conv",  label: "GA4 conversion config", satisfied: true,  activation_note: "Requires conversion events/goals configured inside GA4; otherwise sessions/engagement only." },
  backlinks: { id: "backlinks", label: "Backlink/authority API (Ahrefs/Majestic/Moz)", satisfied: false, activation_note: "Connect a backlink data provider to verify off-site authority. Without it, authority signals are SERP-derived only." },
};

/* ─── Deep steps available, with depth knobs ───────────────────── */
export interface StepDef {
  key: string;
  label: string;
  sources: string[];          // DataSource ids it draws on
  depth_levels: string[];     // e.g. ["standard", "deep"]
  default_depth: string;
}

export const STEP_DEFS: Record<string, StepDef> = {
  gsc_visibility:        { key: "gsc_visibility",        label: "GSC Visibility & Indexation", sources: ["gsc", "crawl"],          depth_levels: ["standard", "deep"], default_depth: "deep" },
  competitor_intel:      { key: "competitor_intel",      label: "Competitor Intelligence",     sources: ["serpapi", "crawl"],      depth_levels: ["standard", "deep"], default_depth: "deep" },
  query_landscape:       { key: "query_landscape",       label: "Query Landscape & Untapped",  sources: ["gsc", "serpapi"],        depth_levels: ["standard", "deep"], default_depth: "standard" },
  onpage_audit:          { key: "onpage_audit",          label: "On-Page Audit",               sources: ["crawl"],                 depth_levels: ["standard", "deep"], default_depth: "standard" },
  core_web_vitals:       { key: "core_web_vitals",       label: "Core Web Vitals (field)",     sources: ["crux"],                  depth_levels: ["standard"],         default_depth: "standard" },
  internal_link_graph:   { key: "internal_link_graph",   label: "Internal Link Graph",         sources: ["crawl", "gsc"],          depth_levels: ["standard", "deep"], default_depth: "standard" },
  engagement_value:      { key: "engagement_value",      label: "Engagement & Conversion Value", sources: ["ga4", "ga4_conv"],     depth_levels: ["standard"],         default_depth: "standard" },
  authority_signals:     { key: "authority_signals",     label: "Authority & E-E-A-T Signals", sources: ["backlinks", "serpapi"],  depth_levels: ["standard", "deep"], default_depth: "standard" },
  trajectory:            { key: "trajectory",            label: "Trajectory (historical trend)", sources: ["gsc", "ga4"],          depth_levels: ["standard"],         default_depth: "standard" },
};

/* ─── Goal definitions: each declares the steps it needs ───────── */
export interface GoalDef {
  id: string;
  label: string;
  description: string;
  needs: string[];                 // StepDef keys this goal requires
  pillars: string[];               // pillars this goal engages
  panel_framing: string;           // how the panel should frame discussion for this goal
}

export const GOAL_DEFS: Record<string, GoalDef> = {
  keyword_ranking: {
    id: "keyword_ranking", label: "Keyword Ranking",
    description: "Rank specific keywords higher on the SERP.",
    needs: ["gsc_visibility", "competitor_intel", "query_landscape", "onpage_audit", "internal_link_graph", "trajectory"],
    pillars: ["visibility", "query_opportunity", "on_page_health", "internal_links", "monitoring"],
    panel_framing: "Focus on closing the gap to page 1 for target keywords: what competitors ranking above have, on-page deficits, internal anchor + authority flow to the target page, the keyword's recent trajectory, and the fastest ranking levers.",
  },
  page_growth: {
    id: "page_growth", label: "Page Growth",
    description: "Grow organic performance of specific target pages.",
    needs: ["gsc_visibility", "onpage_audit", "competitor_intel", "internal_link_graph", "trajectory"],
    pillars: ["visibility", "on_page_health", "internal_links", "monitoring"],
    panel_framing: "Focus on what holds each target page back — indexation, on-page quality, internal link support, competitive gap, and whether the page is decaying, stable, or recovering.",
  },
  traffic_growth: {
    id: "traffic_growth", label: "Traffic Growth",
    description: "Grow organic traffic, optionally by type (commercial / informational / local / branded).",
    needs: ["gsc_visibility", "query_landscape", "competitor_intel", "onpage_audit", "core_web_vitals", "internal_link_graph", "engagement_value", "trajectory"],
    pillars: ["visibility", "query_opportunity", "on_page_health", "technical_performance", "internal_links", "engagement", "monitoring"],
    panel_framing: "Find every realistic path to more traffic for this site and industry: quick-win recovery, untapped query clusters, competitor displacement, indexation fixes, and converting existing traffic. Size each with the site's own CTR curve.",
  },
  conversion: {
    id: "conversion", label: "Conversion",
    description: "Make existing organic traffic convert better.",
    needs: ["engagement_value", "gsc_visibility", "onpage_audit", "core_web_vitals", "trajectory"],
    pillars: ["engagement", "on_page_health", "technical_performance", "monitoring"],
    panel_framing: "Focus on where organic visitors arrive but fail to convert, page speed dragging conversion down, the highest-value pages to fix first, and whether conversion rates are trending in the right direction.",
  },
  authority_eeat: {
    id: "authority_eeat", label: "Authority & E-E-A-T",
    description: "Build domain and page authority / E-E-A-T signals.",
    needs: ["authority_signals", "competitor_intel", "onpage_audit", "gsc_visibility", "trajectory"],
    pillars: ["on_page_health", "visibility", "monitoring"],
    panel_framing: "Assess off-site authority and on-page E-E-A-T against competitors, see what's actually ranking and benefiting from current authority, identify credible authority-building moves, and watch trend signals.",
  },
  topical_authority: {
    id: "topical_authority", label: "Topical / Content Authority",
    description: "Own a topic cluster through comprehensive, authoritative content.",
    needs: ["query_landscape", "competitor_intel", "onpage_audit", "internal_link_graph", "gsc_visibility", "trajectory"],
    pillars: ["query_opportunity", "on_page_health", "internal_links", "visibility", "monitoring"],
    panel_framing: "Map the topic's query space, find coverage gaps vs. competitors, see which cluster pages are already surfacing vs. invisible, design the cluster + internal linking to own it, and track cluster momentum.",
  },
};

/* ─── A computed run configuration ─────────────────────────────── */
export interface RunConfig {
  goal_ids: string[];
  custom_label?: string;
  steps: Array<{ key: string; label: string; depth: string; enabled: boolean; sources: string[] }>;
  dependencies: Array<{ source: string; label: string; satisfied: boolean; activation_note?: string }>;
  pillars: string[];
  panel_framing: string;
  composed_goal: string;       // human description fed to the panel
}

/* Compose one or more goals (or a custom needs list) into a run config. */
export function composeRunConfig(opts: {
  goalIds?: string[];
  customNeeds?: string[];        // StepDef keys, for a custom goal
  customLabel?: string;
}): RunConfig {
  const goalIds = (opts.goalIds || []).filter(id => GOAL_DEFS[id]);
  const goals = goalIds.map(id => GOAL_DEFS[id]);

  // Union of needed step keys (goals + any custom needs)
  const needKeys = new Set<string>();
  for (const g of goals) g.needs.forEach(k => needKeys.add(k));
  (opts.customNeeds || []).forEach(k => { if (STEP_DEFS[k]) needKeys.add(k); });

  const steps = [...needKeys].map(k => {
    const d = STEP_DEFS[k];
    return { key: k, label: d.label, depth: d.default_depth, enabled: true, sources: d.sources };
  });

  // Union of dependencies across all selected steps
  const depIds = new Set<string>();
  for (const s of steps) s.sources.forEach(src => depIds.add(src));
  const dependencies = [...depIds].map(id => {
    const ds = DATA_SOURCES[id] || { id, label: id, satisfied: true };
    return { source: ds.id, label: ds.label, satisfied: ds.satisfied, activation_note: ds.activation_note };
  });

  // Union of pillars
  const pillarSet = new Set<string>();
  for (const g of goals) g.pillars.forEach(p => pillarSet.add(p));

  // Composed goal description + panel framing
  const composed_goal = goals.length
    ? goals.map(g => g.label).join(" + ") + (opts.customLabel ? ` + ${opts.customLabel}` : "")
    : (opts.customLabel || "custom goal");
  const panel_framing = goals.map(g => `[${g.label}] ${g.panel_framing}`).join("\n") ||
    "Frame the analysis around the operator's custom goal using the available evidence.";

  return {
    goal_ids: goalIds,
    custom_label: opts.customLabel,
    steps,
    dependencies,
    pillars: [...pillarSet],
    panel_framing,
    composed_goal,
  };
}

/* List goals + steps + sources for the UI to render the picker. */
export function goalCatalog() {
  return {
    goals: Object.values(GOAL_DEFS).map(g => ({ id: g.id, label: g.label, description: g.description, needs: g.needs, pillars: g.pillars })),
    steps: Object.values(STEP_DEFS),
    sources: Object.values(DATA_SOURCES),
  };
}
