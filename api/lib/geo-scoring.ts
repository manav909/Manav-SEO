/* ════════════════════════════════════════════════════════════════
   api/lib/geo-scoring.ts

   BUILD 12.21 — Single source of truth for the composite GEO
   Visibility Score (0-100) and its grade ladder.

   Previously inlined in 5+ places across the codebase:
     - api/lib/client-showcase-engine.ts (composeAiSearchVisibility)
     - api/lib/pm-analytics-intel.ts (composeGeoSnapshot)
     - api/lib/seo-campaign-routes.ts (campaigns route geo block)
     - api/lib/pm-scenario-engine.ts (getBaselineSnapshot)
     - api/lib/pm-goal-engine.ts (getCurrentMetricValue for geo_visibility_score)

   Inlining was documented coupling. Build 12.21 extracts the logic so
   threshold changes propagate from a single edit. Pure refactor — the
   thresholds are unchanged from prior builds so all five callers will
   produce identical scores after migration.

   THE SCORING MODEL:
   - 60 points max from AI Overview impressions (impression magnitude)
   - 40 points max from AI platform referrals (session count + multi-
     platform bonus)
   - Score range: 0 to 100
   - Grade ladder: absent (0) / emerging (1-24) / present (25-54) /
     established (55-79) / strong (80-100)

   The thresholds are heuristic and chosen to map roughly to senior-DMS
   judgment about what "showing up in AI search" actually means at
   different magnitudes. They are NOT validated against any external
   benchmark — adjust here when field evidence accumulates.
════════════════════════════════════════════════════════════════ */

export type GeoVisibilityGrade = "absent" | "emerging" | "present" | "established" | "strong";

/** The raw inputs that the composite score consumes. Any caller with
 *  these four numbers can compute the canonical score. Defaults to 0
 *  for any missing input — same behaviour as inlined callers. */
export interface GeoScoringInputs {
  /** Total AI Overview impressions across the window (gsc_ai_overview_summary.total_impressions) */
  aiOverviewImpressions:  number;
  /** Whether GSC explicitly marks AI Overview as present (gsc_ai_overview_summary.present).
   *  When false (or undefined), AI Overview points are zero even if impressions > 0. */
  aiOverviewPresent?:     boolean;
  /** AI platform referral sessions (ga4_ai_platform_summary.sessions) */
  aiPlatformSessions:     number;
  /** Distinct AI platforms detected (ga4_ai_platform_summary.source_count) */
  aiPlatformCount:        number;
}

export interface GeoScoringResult {
  /** Composite score 0-100 */
  score:                 number;
  /** Grade band */
  grade:                 GeoVisibilityGrade;
  /** Component breakdown — useful for explanations in UI */
  ai_overview_points:    number;     // 0-60
  ai_platform_points:    number;     // 0-40
  multi_platform_bonus:  number;     // 0-10, part of ai_platform_points
}

/* ─── Threshold tables (single source of truth) ────────────────── */

/** AI Overview impression magnitude → points. Higher impression bands
 *  earn more points; this rewards both having AI Overview presence at
 *  all (10 points minimum if any impressions) and having substantial
 *  presence (60 points at 50k+ impressions in the window). */
function aiOverviewPoints(impressions: number, present: boolean): number {
  if (!present || impressions <= 0) return 0;
  if (impressions >= 50000) return 60;
  if (impressions >= 10000) return 50;
  if (impressions >= 1000)  return 35;
  if (impressions >= 100)   return 20;
  return 10;
}

/** AI platform session count → base points (0-30), plus multi-platform
 *  bonus (0-10) when traffic spans multiple AI sources. Returns a tuple
 *  so callers can show the breakdown. */
function aiPlatformPoints(sessions: number, platformCount: number): { base: number; bonus: number } {
  if (sessions <= 0) return { base: 0, bonus: 0 };
  let base = 0;
  if      (sessions >= 5000) base = 30;
  else if (sessions >= 500)  base = 25;
  else if (sessions >= 50)   base = 15;
  else                       base = 8;
  let bonus = 0;
  if      (platformCount >= 3) bonus = 10;
  else if (platformCount >= 2) bonus = 5;
  return { base, bonus };
}

/** Score → grade band. Thresholds:
 *  0 = absent (no AI surface presence at all)
 *  1-24 = emerging (some presence, not yet meaningful)
 *  25-54 = present (real AI surface presence)
 *  55-79 = established (substantial AI presence)
 *  80-100 = strong (dominant AI presence) */
function gradeFromScore(score: number): GeoVisibilityGrade {
  if (score === 0)  return "absent";
  if (score < 25)   return "emerging";
  if (score < 55)   return "present";
  if (score < 80)   return "established";
  return "strong";
}

/* ─── Main API ────────────────────────────────────────────────── */

/** Compute the composite GEO Visibility Score from raw inputs.
 *  All callers should use this; do NOT inline the threshold logic. */
export function computeGeoVisibility(inputs: GeoScoringInputs): GeoScoringResult {
  const impressions = Math.max(0, Number(inputs.aiOverviewImpressions || 0));
  const present     = inputs.aiOverviewPresent !== false && impressions > 0;
  const sessions    = Math.max(0, Number(inputs.aiPlatformSessions || 0));
  const platformCt  = Math.max(0, Number(inputs.aiPlatformCount || 0));

  const aoPoints = aiOverviewPoints(impressions, present);
  const { base: aiBase, bonus: aiBonus } = aiPlatformPoints(sessions, platformCt);
  /* AI platform points cap at 40 — base (up to 30) + bonus (up to 10) */
  const aiPlatformPts = Math.min(40, aiBase + aiBonus);

  const score = Math.min(100, Math.max(0, Math.round(aoPoints + aiPlatformPts)));
  const grade = gradeFromScore(score);

  return {
    score,
    grade,
    ai_overview_points:   aoPoints,
    ai_platform_points:   aiPlatformPts,
    multi_platform_bonus: aiBonus,
  };
}

/** Convenience: just the score, when callers don't need the breakdown. */
export function computeGeoVisibilityScore(inputs: GeoScoringInputs): number {
  return computeGeoVisibility(inputs).score;
}

/** Convenience: just the grade. */
export function computeGeoVisibilityGrade(inputs: GeoScoringInputs): GeoVisibilityGrade {
  return computeGeoVisibility(inputs).grade;
}

/** Helper for callers that have raw project_knowledge summary objects.
 *  Parses safely and extracts the four numeric inputs, defaulting to 0
 *  for missing/malformed data. */
export function geoScoringInputsFromSummaries(opts: {
  aiOverviewSummary?: any;
  aiPlatformSummary?: any;
}): GeoScoringInputs {
  const ao = opts.aiOverviewSummary;
  const ai = opts.aiPlatformSummary;
  return {
    aiOverviewImpressions: ao ? Number(ao.total_impressions || 0) : 0,
    aiOverviewPresent:     ao ? Boolean(ao.present) : false,
    aiPlatformSessions:    ai ? Number(ai.sessions || 0) : 0,
    aiPlatformCount:       ai ? Number(ai.source_count || 0) : 0,
  };
}
