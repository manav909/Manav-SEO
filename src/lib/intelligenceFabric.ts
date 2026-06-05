/* ═══════════════════════════════════════════════════════════
   intelligenceFabric.ts — GLOBAL Intelligence Layer
   ───────────────────────────────────────────────────────────
   Single source of truth for the whole product:

   1. Source confidence scoring   — every piece of data has a confidence
   2. Protected fields registry   — hard data needs user approval to change
   3. Weighted confidence gate    — actions blocked below threshold
   4. Persistent storage          — every AI output saved to intelligence_outputs
   5. Field-update proposals      — protected fields go through approval queue
   6. Outcome feedback loop       — track which outputs led to real results

   Used by: intelligence (Brain chat), task-engine, BrainCommand UI,
   Audit, Strategy, Algorithm Intelligence, etc. (Also used by
   `market-researcher.ts.disabled` when that function is re-enabled —
   the disabled file inlines a mirror of these helpers.)
═══════════════════════════════════════════════════════════ */

/* ───────────────────────── SOURCE CONFIDENCE ─────────────────────────
   Every input we use carries a source-type. Each type has a base confidence.
   Brain Learnings use their stored confidence_score (dynamic).
   ────────────────────────────────────────────────────────────────────── */
export type SourceType =
  | "manual_user"        // user typed it into Data Room / Comments
  | "user_comment"       // user's own note / client question
  | "gsc_live"           // Google Search Console (live API or recent sync)
  | "ga_live"            // Google Analytics
  | "audit_run"          // result of an audit_reports row
  | "crawl_jina"         // live URL fetch via Jina
  | "brain_learning"     // existing brain_learnings row (uses its own confidence)
  | "algorithm_intel"    // algorithm_knowledge row
  | "intelligence_output"// prior intelligence_outputs row
  | "claude_inference"   // Claude's reasoning (no external grounding)
  | "industry_pattern"   // generic industry-pattern knowledge
  | "unknown";

export const SOURCE_CONFIDENCE: Record<SourceType, number> = {
  manual_user:         98,
  user_comment:        98,
  gsc_live:            95,
  ga_live:             95,
  audit_run:           88,
  crawl_jina:          85,
  brain_learning:      80,   // overridden per row when available
  algorithm_intel:     82,
  intelligence_output: 80,   // prior outputs are inferences-of-inferences
  claude_inference:    65,
  industry_pattern:    45,
  unknown:             30,
};

export const SOURCE_LABEL: Record<SourceType, string> = {
  manual_user:         "You provided this",
  user_comment:        "Your note / client question",
  gsc_live:            "Google Search Console (live)",
  ga_live:             "Google Analytics (live)",
  audit_run:           "From an audit",
  crawl_jina:          "Fetched from the live web",
  brain_learning:      "Brain Learning",
  algorithm_intel:     "Algorithm Intelligence",
  intelligence_output: "Prior analysis",
  claude_inference:    "Claude's inference",
  industry_pattern:    "Industry pattern (generic)",
  unknown:             "Unknown source",
};

/* Threshold table — what confidence is needed for what action? */
export const ACTION_THRESHOLDS: Record<string, number> = {
  display_only:        0,     // always allow
  suggest_to_user:     50,    // safe to surface
  auto_add_canvas:     70,    // can add a card automatically
  save_brain_learning: 70,    // create new learning
  update_soft_field:   75,    // update persona, suggestions, etc.
  update_protected:    100,   // hard data — never automated, always proposes
};

/* ───────────────────────── PROTECTED FIELDS ─────────────────────────
   These fields NEVER get overwritten automatically.
   Any AI proposal to change them goes through field_update_proposals.
   ──────────────────────────────────────────────────────────────────── */
export type ProtectedCategory = "project_core" | "goals" | "metrics" | "competitors" | "comments";

/* Paths use the REAL Supabase schema (singular categories, real field_keys).
   For project_knowledge rows: <category>.<field_key>
   For columns on the projects table: project.<column>
   For the metrics table: metrics.<column> (these are auto-scored, NEVER user-writable). */
export const PROTECTED_FIELDS: Record<string, ProtectedCategory> = {
  /* Project core (columns on `projects` table) */
  "project.url":                          "project_core",
  "project.name":                         "project_core",
  "project.industry":                     "project_core",
  "project.country":                      "project_core",
  "project.city":                         "project_core",
  /* Goals (project_knowledge category=goal) */
  "goal.primary_goal":                    "goals",
  "goal.target_timeline":                 "goals",
  "goal.success_metric":                  "goals",
  "goal.current_baseline":                "goals",
  "goal.target_keywords":                 "goals",
  "goal.budget_monthly":                  "goals",
  "goal.reporting_cadence":               "goals",
  /* Analytics (project_knowledge category=analytics — manually entered measurements) */
  "analytics.organic_sessions_monthly":   "metrics",
  "analytics.organic_sessions_baseline_date": "metrics",
  "analytics.gsc_total_impressions":      "metrics",
  "analytics.gsc_total_clicks":           "metrics",
  "analytics.gsc_avg_position":           "metrics",
  "analytics.conversions_monthly":        "metrics",
  /* Build 12.18 — GEO / AI surface attribution metrics. Keep in sync
     with server-side intelligenceFabric.ts. Confidence tier matches
     classic GSC/GA4 metrics because the source is the same. */
  "analytics.gsc_ai_overview_impressions":  "metrics",
  "analytics.gsc_ai_overview_clicks":       "metrics",
  "analytics.gsc_ai_overview_present":      "metrics",
  "analytics.gsc_discover_impressions":     "metrics",
  "analytics.gsc_discover_clicks":          "metrics",
  "analytics.ga4_ai_referral_sessions":     "metrics",
  "analytics.ga4_ai_referral_conversions":  "metrics",
  "analytics.ga4_ai_referral_platforms":    "metrics",
  /* System-computed metrics (metrics table — READ-ONLY, never written via approval) */
  "metrics.llm_visibility_score":         "metrics",
  "metrics.eeat_score":                   "metrics",
  "metrics.algorithm_health_score":       "metrics",
  "metrics.content_authority_score":      "metrics",
  "metrics.overall_growth_score":         "metrics",
  "metrics.geo_visibility_score":         "metrics",
  "metrics.geo_visibility_grade":         "metrics",
  /* Competitors (project_knowledge category=competitor) */
  "competitor.competitor_1":              "competitors",
  "competitor.competitor_1_dr":           "competitors",
  "competitor.competitor_2":              "competitors",
  "competitor.competitor_2_dr":           "competitors",
  "competitor.our_domain_rating":         "competitors",
  "competitor.our_referring_domains":     "competitors",
  /* Personal notes & client communication (project_knowledge category=comment) */
  "comment.client_question":              "comments",
  "comment.user_note":                    "comments",
  "comment.meeting_note":                 "comments",
};

export function isProtectedField(path: string): boolean {
  return path in PROTECTED_FIELDS;
}

export function getFieldCategory(path: string): ProtectedCategory | null {
  return PROTECTED_FIELDS[path] || null;
}

/* ───────────────────────── PROVENANCE & WEIGHTING ───────────────────── */
export interface SourceUsage {
  source: SourceType;
  confidence: number;   // 0–100
  weight?: number;      // relative weight in the weighted average (default 1)
  label?: string;       // human-readable, e.g. "Project URL", "5 Brain Learnings"
  count?: number;       // optional cardinality
}

export interface Provenance {
  sources: SourceUsage[];
  weightedConfidence: number;   // 0–100
  computedAt: string;           // ISO timestamp
  inputFingerprint?: string;
  breakdown?: Record<string, number>;
}

/* Compute weighted confidence across a set of sources */
export function computeWeightedConfidence(sources: SourceUsage[]): number {
  if (!sources.length) return 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of sources) {
    const w = s.weight ?? 1;
    const c = Math.max(0, Math.min(100, s.confidence ?? SOURCE_CONFIDENCE[s.source] ?? 30));
    weightedSum += c * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

/* Quick helper: build a SourceUsage from a known source type */
export function source(type: SourceType, opts: { label?: string; weight?: number; count?: number; overrideConfidence?: number } = {}): SourceUsage {
  return {
    source:     type,
    confidence: opts.overrideConfidence ?? SOURCE_CONFIDENCE[type],
    weight:     opts.weight ?? 1,
    label:      opts.label ?? SOURCE_LABEL[type],
    count:      opts.count,
  };
}

/* ───────────────────────── CONFIDENCE GATE ─────────────────────────── */
export type GateAction = keyof typeof ACTION_THRESHOLDS;
export interface GateResult {
  allow: boolean;
  block: boolean;
  required: number;
  actual: number;
  reason?: string;
  topMissing?: string[];   // missing high-value sources that would lift confidence
}

export function confidenceGate(action: GateAction, provenance: Provenance | number): GateResult {
  const required = ACTION_THRESHOLDS[action] ?? 70;
  const actual   = typeof provenance === "number" ? provenance : provenance.weightedConfidence;
  if (actual >= required) {
    return { allow: true, block: false, required, actual };
  }
  /* Identify which higher-confidence sources would lift this */
  const topMissing: string[] = [];
  if (typeof provenance !== "number") {
    const have = new Set(provenance.sources.map(s => s.source));
    const highValue: SourceType[] = ["manual_user", "gsc_live", "ga_live", "audit_run", "crawl_jina"];
    for (const s of highValue) if (!have.has(s)) topMissing.push(SOURCE_LABEL[s]);
  }
  return {
    allow:  false,
    block:  true,
    required, actual,
    reason: `Confidence ${actual}/100 below the required ${required} for "${action}". Add stronger data sources first.`,
    topMissing: topMissing.slice(0, 3),
  };
}

/* ───────────────────────── FINGERPRINT ─────────────────────────────── */
export function fingerprint(input: any): string {
  const str = typeof input === "string" ? input : JSON.stringify(input, Object.keys(input || {}).sort()).slice(0, 5000);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h.toString(16);
}

/* ───────────────────────── PERSISTENT STORAGE ───────────────────────
   These helpers work on BOTH client (Supabase) AND server (sb()) — pass the client in.
   ─────────────────────────────────────────────────────────────────── */
export interface SaveOutputParams {
  projectId:     string;
  analysisType:  string;            // 'persona' | 'audit' | etc
  title?:        string;
  summary?:      string;
  output:        any;               // the full output object
  sources:       SourceUsage[];
  modelUsed?:    string;
  inputFingerprint?: string;
  sourceBreakdown?: Record<string, number>;
  createdBy?:    string;
}

/* Save an output through ANY supabase-like client (works on server + client) */
export async function saveIntelligenceOutput(sb: any, p: SaveOutputParams): Promise<{ id: string | null; error?: string }> {
  try {
    const weighted = computeWeightedConfidence(p.sources);
    const fp = p.inputFingerprint || fingerprint(p.output);
    const { data, error } = await sb.from("intelligence_outputs").insert({
      project_id:          p.projectId,
      analysis_type:       p.analysisType,
      title:               p.title?.slice(0, 200) || null,
      summary:             p.summary?.slice(0, 500) || null,
      output:              p.output,
      sources_used:        p.sources,
      weighted_confidence: weighted,
      source_breakdown:    p.sourceBreakdown || null,
      model_used:          p.modelUsed || null,
      input_fingerprint:   fp,
      status:              "active",
      created_by:          p.createdBy || "system",
      generated_at:        new Date().toISOString(),
    }).select("id").single();
    if (error) return { id: null, error: error.message };
    return { id: data?.id || null };
  } catch (e: any) {
    return { id: null, error: e?.message || "save failed" };
  }
}

/* Load all outputs for a project (newest first) */
export async function listIntelligenceOutputs(sb: any, projectId: string, filter: { type?: string; limit?: number } = {}): Promise<any[]> {
  let q = sb.from("intelligence_outputs")
    .select("id,analysis_type,title,summary,weighted_confidence,sources_used,source_breakdown,model_used,status,generated_at,viewed_at,output")
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("generated_at", { ascending: false })
    .limit(filter.limit || 50);
  if (filter.type) q = q.eq("analysis_type", filter.type);
  const { data } = await q;
  return data || [];
}

/* Mark a prior output as superseded by a new one */
export async function supersedeOutput(sb: any, oldId: string, newId: string): Promise<void> {
  try {
    await sb.from("intelligence_outputs").update({ status: "superseded", superseded_by: newId }).eq("id", oldId);
  } catch (_e) {}
}

/* ───────────────────────── FIELD UPDATE PROPOSAL ────────────────────
   When an AI wants to change a protected field, it MUST go through here.
   Returns the proposal id so the UI can review/approve/reject.
   ─────────────────────────────────────────────────────────────────── */
export interface ProposalParams {
  projectId:           string;
  fieldPath:           string;       // e.g. "goals.primary"
  currentValue?:       string;
  proposedValue:       string;
  proposedBy:          string;       // 'claude_inference' | 'audit_run' | etc
  proposerConfidence:  number;
  reasoning?:          string;
  sourceOutputId?:     string;
}

export async function proposeFieldUpdate(sb: any, p: ProposalParams): Promise<{ id: string | null; protected: boolean; error?: string }> {
  const category = getFieldCategory(p.fieldPath);
  if (!category) {
    // Not protected — caller can write directly. Return signal.
    return { id: null, protected: false };
  }
  try {
    const { data, error } = await sb.from("field_update_proposals").insert({
      project_id:          p.projectId,
      field_path:          p.fieldPath,
      field_category:      category,
      current_value:       p.currentValue?.toString().slice(0, 2000) || null,
      proposed_value:      p.proposedValue.toString().slice(0, 2000),
      proposed_by:         p.proposedBy,
      proposer_confidence: Math.max(0, Math.min(100, Math.round(p.proposerConfidence))),
      reasoning:           p.reasoning?.slice(0, 1000) || null,
      source_output_id:    p.sourceOutputId || null,
      status:              "pending",
    }).select("id").single();
    if (error) return { id: null, protected: true, error: error.message };
    return { id: data?.id || null, protected: true };
  } catch (e: any) {
    return { id: null, protected: true, error: e?.message || "proposal failed" };
  }
}

export async function listPendingProposals(sb: any, projectId: string): Promise<any[]> {
  const { data } = await sb.from("field_update_proposals")
    .select("*").eq("project_id", projectId).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(50);
  return data || [];
}

export async function resolveProposal(sb: any, id: string, decision: "approved" | "rejected", reviewer: string, note?: string): Promise<void> {
  try {
    await sb.from("field_update_proposals").update({
      status:      decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewer,
      review_note: note?.slice(0, 500) || null,
    }).eq("id", id);
  } catch (_e) {}
}

/* ───────────────────────── FEEDBACK LOOP ──────────────────────────── */
export async function recordFeedback(sb: any, params: {
  projectId: string;
  intelligenceOutputId?: string;
  brainLearningId?: string;
  feedbackType: "helpful" | "wrong" | "applied" | "led_to_outcome" | "contradicted";
  outcomeScore?: number;
  notes?: string;
  metricBefore?: any;
  metricAfter?: any;
}): Promise<void> {
  try {
    await sb.from("intelligence_feedback").insert({
      project_id:              params.projectId,
      intelligence_output_id:  params.intelligenceOutputId || null,
      brain_learning_id:       params.brainLearningId || null,
      feedback_type:           params.feedbackType,
      outcome_score:           params.outcomeScore ?? null,
      notes:                   params.notes?.slice(0, 1000) || null,
      metric_before:           params.metricBefore || null,
      metric_after:            params.metricAfter  || null,
    });
  } catch (_e) {}
}

/* ───────────────────────── CONTRADICTION DETECTION ─────────────────
   Quick heuristic: compare two outputs' summaries / key fields for known disagreement words.
   The serious version runs in the deep_learn action.
   ──────────────────────────────────────────────────────────────────── */
export async function logContradiction(sb: any, params: {
  projectId: string;
  outputAId: string;
  outputBId: string;
  summary:   string;
  severity?: "low" | "medium" | "high";
  detectedBy?: string;
}): Promise<void> {
  try {
    await sb.from("intelligence_contradictions").insert({
      project_id:             params.projectId,
      output_a_id:            params.outputAId,
      output_b_id:            params.outputBId,
      contradiction_summary:  params.summary.slice(0, 1000),
      severity:               params.severity || "medium",
      detected_by:            params.detectedBy || "auto_diff",
      status:                 "open",
    });
  } catch (_e) {}
}

export async function listOpenContradictions(sb: any, projectId: string): Promise<any[]> {
  const { data } = await sb.from("intelligence_contradictions")
    .select("*").eq("project_id", projectId).eq("status", "open")
    .order("created_at", { ascending: false }).limit(20);
  return data || [];
}

/* ───────────────────────── DEEP LEARN TRIGGERS ─────────────────────
   Returns true if a deep_learn run is warranted right now (count-based).
   ────────────────────────────────────────────────────────────────── */
export async function shouldRunDeepLearn(sb: any, projectId: string, threshold = 10): Promise<{ should: boolean; newOutputs: number; lastDeepLearn?: string }> {
  try {
    /* Last deep_learn run */
    const { data: last } = await sb.from("intelligence_outputs")
      .select("generated_at").eq("project_id", projectId).eq("analysis_type", "deep_learn")
      .order("generated_at", { ascending: false }).limit(1).single();
    const since = last?.generated_at || "1970-01-01T00:00:00Z";
    /* Count outputs since then (excluding deep_learn itself) */
    const { count } = await sb.from("intelligence_outputs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .neq("analysis_type", "deep_learn")
      .gt("generated_at", since);
    return { should: (count ?? 0) >= threshold, newOutputs: count ?? 0, lastDeepLearn: last?.generated_at };
  } catch (_e) {
    return { should: false, newOutputs: 0 };
  }
}

/* ───────────────────────── CONFIDENCE COLOR HELPERS ────────────────
   For UI badge rendering (used across components).
   ──────────────────────────────────────────────────────────────────── */
export function confidenceColor(c: number): string {
  if (c >= 85) return "#10b981";     // green — high
  if (c >= 70) return "#06b6d4";     // cyan — solid
  if (c >= 55) return "#f59e0b";     // amber — caution
  if (c >= 40) return "#fb923c";     // orange — weak
  return "#ef4444";                  // red — too low to act on
}

export function confidenceLabel(c: number): string {
  if (c >= 85) return "High";
  if (c >= 70) return "Solid";
  if (c >= 55) return "Moderate";
  if (c >= 40) return "Weak";
  return "Too low";
}
