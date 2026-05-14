/* ═══════════════════════════════════════════════════════════
   Unified save functions — every write to Supabase goes here.
   All callers get classification, deduplication, and logging
   for free. Never write directly to brain_learnings or
   brain_desk from an API route — always use these functions.
═══════════════════════════════════════════════════════════ */

import { db } from "./db";
import { classifyLearning, extractImprovement, checkForConflicts } from "./classify";

/* ── Save a learning through the full classification + dedup pipeline ── */
export async function saveLearning(opts: {
  source:           string;
  projectId:        string | null;
  content:          string;
  title?:           string;
  cardType?:        string;
  contextSummary?:  string;
  whatWorked?:      string[];
  whatMissed?:      string[];
  tags?:            string[];
  industry?:        string;   // adds industry tag for cross-project IQ
  keywordCluster?:  string[]; // adds keyword tags for cross-cluster IQ
  confidenceOverride?: number;
}): Promise<{ saved: boolean; id?: string; reason?: string; merged?: boolean }> {
  const {
    source, projectId, content, title = "", cardType,
    contextSummary, whatWorked = [], whatMissed = [], tags = [],
    industry, keywordCluster = [],
    confidenceOverride,
  } = opts;

  /* Build cross-project tags from industry + keyword clusters */
  const industryTag    = industry ? [industry.toLowerCase().replace(/\s+/g, "-")] : [];
  const keywordTags    = keywordCluster.map(k => k.toLowerCase().replace(/\s+/g, "-"));
  const enrichedTags   = [...tags, ...industryTag, ...keywordTags];

  if (!content || content.startsWith("Error:"))
    return { saved: false, reason: "empty_or_error" };

  const cls = classifyLearning({
    content, source, title, requestedType: cardType, projectId,
  });

  if (!cls.shouldSave)
    return { saved: false, reason: cls.rejectionReason || "classification_rejected" };

  const improvement = extractImprovement(content);
  if (!improvement || improvement.length < 50)
    return { saved: false, reason: "no_extractable_improvement" };

  const effectiveProjectId = cls.isSystemLevel ? null : projectId;
  const confidence = confidenceOverride ?? cls.confidence;

  /* Deduplication check */
  const { isDuplicate, isContradiction, existingId } = await checkForConflicts(
    effectiveProjectId, cls.category, title || improvement.slice(0, 60), improvement
  );

  if (isDuplicate && existingId) {
    const { data: existing } = await db().from("brain_learnings").select("*").eq("id", existingId).single();
    if (existing) {
      const merged: any = {
        what_worked: [...new Set([...(existing as any).what_worked || [], ...whatWorked])].slice(0, 6),
        what_missed: [...new Set([...(existing as any).what_missed || [], ...whatMissed])].slice(0, 4),
        confidence_score: Math.max((existing as any).confidence_score || 65, confidence),
        improvement: confidence >= ((existing as any).confidence_score || 65) ? improvement : (existing as any).improvement,
        tags: [...new Set([...((existing as any).tags || []), ...enrichedTags])].filter(Boolean),
        updated_at: new Date().toISOString(),
      };
      if (cls.autoApprove) merged.status = "active";
      await db().from("brain_learnings").update(merged).eq("id", existingId);
      return { saved: true, id: existingId, merged: true };
    }
  }

  const row: any = {
    project_id:      effectiveProjectId,
    source,
    card_type:       cls.category,
    card_title:      (title || improvement).slice(0, 100),
    improvement,
    context_summary: contextSummary || source,
    what_worked:     whatWorked.slice(0, 6),
    what_missed:     whatMissed.slice(0, 4),
    tags:            [...new Set([cls.category, source.split("_")[0], ...enrichedTags])].filter(Boolean),
    applied_count:   0,
    status:          cls.autoApprove ? "active" : "pending_review",
    auto_captured:   source !== "manual" && source !== "brain_chat",
    confidence_score: confidence,
    updated_at:      new Date().toISOString(),
  };

  if (isContradiction) row.tags = [...row.tags, "contradiction-flagged"];

  try {
    const { data, error } = await db().from("brain_learnings").insert(row).select("id").single();
    if (error) throw error;
    return { saved: true, id: (data as any)?.id };
  } catch (_e) {
    return { saved: false, reason: "db_insert_failed" };
  }
}

/* ── Save to brain_desk ── */
export async function saveToDesk(opts: {
  projectId:   string | null;
  title:       string;
  content:     string;
  contentType: string;
  source:      string;
  tags?:       string[];
}): Promise<void> {
  const { projectId, title, content, contentType, source, tags = [] } = opts;
  if (!projectId || !content || content.length < 50) return;
  try {
    await db().from("brain_desk").insert({
      project_id:   projectId,
      title:        title.slice(0, 200),
      content_type: contentType,
      content,
      source,
      tags:         [...new Set([...tags, source])].filter(Boolean),
      pinned:       false,
      metadata:     { auto_saved: true },
      updated_at:   new Date().toISOString(),
    });
  } catch (_e) { /* never crash callers */ }
}

/* ── Log API cost ── */
export async function logCost(opts: {
  projectId:    string | null;
  endpoint:     string;
  inputTokens:  number;
  outputTokens: number;
  cost?:        number;
  cached?:      boolean;
}): Promise<void> {
  const { projectId, endpoint, inputTokens, outputTokens, cached = false } = opts;
  const cost = opts.cost ?? (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015;
  try {
    await db().from("api_cost_log").insert({
      project_id:   projectId,
      api_endpoint: endpoint,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost: parseFloat(cost.toFixed(6)),
      cached,
    });
  } catch (_e) {}
}

/* ── Log a system change (audit trail) ── */
export async function logChange(opts: {
  projectId:   string | null;
  changeType:  string;
  description: string;
  metadata?:   Record<string, any>;
}): Promise<void> {
  const { projectId, changeType, description, metadata } = opts;
  try {
    await db().from("system_change_log").insert({
      project_id:  projectId,
      change_type: changeType,
      description: description.slice(0, 500),
      metadata:    metadata || null,
      created_at:  new Date().toISOString(),
    });
  } catch (_e) {}
}
