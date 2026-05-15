/* ═══════════════════════════════════════════════════════════
   api/lib/intelligenceFabric.ts — SERVER-SIDE mirror
   Mirrors the client fabric in src/lib/intelligenceFabric.ts
   Confidence values are kept in sync — change both if you change one.
═══════════════════════════════════════════════════════════ */

export type SourceType =
  | "manual_user" | "user_comment" | "gsc_live" | "ga_live" | "audit_run"
  | "crawl_jina" | "brain_learning" | "algorithm_intel" | "intelligence_output"
  | "claude_inference" | "industry_pattern" | "unknown";

export const SOURCE_CONFIDENCE: Record<SourceType, number> = {
  manual_user: 98, user_comment: 98, gsc_live: 95, ga_live: 95, audit_run: 88,
  crawl_jina: 85, brain_learning: 80, algorithm_intel: 82, intelligence_output: 80,
  claude_inference: 65, industry_pattern: 45, unknown: 30,
};

export const ACTION_THRESHOLDS: Record<string, number> = {
  display_only: 0, suggest_to_user: 50, auto_add_canvas: 70,
  save_brain_learning: 70, update_soft_field: 75, update_protected: 100,
};

export type ProtectedCategory = "project_core" | "goals" | "metrics" | "competitors" | "comments";
export const PROTECTED_FIELDS: Record<string, ProtectedCategory> = {
  "project.url": "project_core", "project.name": "project_core",
  "project.industry": "project_core", "project.country": "project_core",
  "project.city": "project_core", "project.region": "project_core",
  "goals.primary": "goals", "goals.timeline": "goals", "goals.success": "goals",
  "goals.success_metric": "goals", "goals.baseline": "goals",
  "goals.keywords": "goals", "goals.target_keywords": "goals",
  "metrics.llm_visibility_score": "metrics", "metrics.eeat_score": "metrics",
  "metrics.authority_score": "metrics", "metrics.algorithm_health": "metrics",
  "analytics.organic_monthly": "metrics", "analytics.gsc_clicks": "metrics",
  "analytics.gsc_impressions": "metrics", "analytics.gsc_avg_position": "metrics",
  "analytics.conversions": "metrics",
  "competitors.c1": "competitors", "competitors.c1_dr": "competitors",
  "competitors.c2": "competitors", "competitors.c2_dr": "competitors",
  "competitors.our_dr": "competitors",
  "comments.client_question": "comments", "comments.user_note": "comments",
  "comments.meeting_note": "comments",
};

export function isProtectedField(path: string): boolean { return path in PROTECTED_FIELDS; }
export function getFieldCategory(path: string) { return PROTECTED_FIELDS[path] || null; }

export interface SourceUsage {
  source: SourceType; confidence: number; weight?: number; label?: string; count?: number;
}

export function source(type: SourceType, opts: { label?: string; weight?: number; count?: number; overrideConfidence?: number } = {}): SourceUsage {
  return {
    source: type,
    confidence: opts.overrideConfidence ?? SOURCE_CONFIDENCE[type],
    weight: opts.weight ?? 1,
    label: opts.label,
    count: opts.count,
  };
}

export function computeWeightedConfidence(sources: SourceUsage[]): number {
  if (!sources.length) return 0;
  let s = 0, w = 0;
  for (const x of sources) {
    const ww = x.weight ?? 1;
    s += (x.confidence ?? SOURCE_CONFIDENCE[x.source] ?? 30) * ww;
    w += ww;
  }
  return w > 0 ? Math.round(s / w) : 0;
}

export function confidenceGate(action: string, weighted: number): { allow: boolean; required: number; actual: number; reason?: string } {
  const required = ACTION_THRESHOLDS[action] ?? 70;
  return weighted >= required
    ? { allow: true, required, actual: weighted }
    : { allow: false, required, actual: weighted, reason: `Confidence ${weighted}/100 below required ${required} for "${action}"` };
}

export function fingerprint(input: any): string {
  const str = typeof input === "string" ? input : JSON.stringify(input, Object.keys(input || {}).sort()).slice(0, 5000);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h.toString(16);
}

/* ── PERSIST: save an intelligence output (sb passed in to avoid duplicate clients) ── */
export async function saveIntelligenceOutput(sb: any, p: {
  projectId: string; analysisType: string; title?: string; summary?: string;
  output: any; sources: SourceUsage[]; modelUsed?: string; inputFingerprint?: string;
  sourceBreakdown?: Record<string, number>; createdBy?: string;
}): Promise<string | null> {
  try {
    const weighted = computeWeightedConfidence(p.sources);
    const fp = p.inputFingerprint || fingerprint(p.output);
    const { data } = await sb.from("intelligence_outputs").insert({
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
    return data?.id || null;
  } catch (_e) { return null; }
}

export async function proposeFieldUpdate(sb: any, p: {
  projectId: string; fieldPath: string; currentValue?: string; proposedValue: string;
  proposedBy: string; proposerConfidence: number; reasoning?: string; sourceOutputId?: string;
}): Promise<{ id: string | null; protected: boolean }> {
  const cat = getFieldCategory(p.fieldPath);
  if (!cat) return { id: null, protected: false };
  try {
    const { data } = await sb.from("field_update_proposals").insert({
      project_id:          p.projectId,
      field_path:          p.fieldPath,
      field_category:      cat,
      current_value:       p.currentValue?.toString().slice(0, 2000) || null,
      proposed_value:      p.proposedValue.toString().slice(0, 2000),
      proposed_by:         p.proposedBy,
      proposer_confidence: Math.max(0, Math.min(100, Math.round(p.proposerConfidence))),
      reasoning:           p.reasoning?.slice(0, 1000) || null,
      source_output_id:    p.sourceOutputId || null,
      status:              "pending",
    }).select("id").single();
    return { id: data?.id || null, protected: true };
  } catch (_e) { return { id: null, protected: true }; }
}

/* Supersede previous output of same type for same project */
export async function supersedePriorOutputs(sb: any, projectId: string, analysisType: string, newOutputId: string): Promise<void> {
  try {
    await sb.from("intelligence_outputs")
      .update({ status: "superseded", superseded_by: newOutputId })
      .eq("project_id", projectId)
      .eq("analysis_type", analysisType)
      .eq("status", "active")
      .neq("id", newOutputId);
  } catch (_e) {}
}
