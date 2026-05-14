/* ═══════════════════════════════════════════════════════════
   Automation Pipeline — runs after key events.

   Triggers:
   - runPostAuditPipeline()   → called after every audit run
   - runPostMetricsPipeline() → called after metrics are saved

   Each pipeline:
   1. Validates inputs
   2. Runs AI-driven extraction / classification
   3. Writes to DB (learnings, metrics, staleness)
   4. Logs every action to system_change_log
   5. Returns a PipelineResult for monitoring
═══════════════════════════════════════════════════════════ */

import { db } from "./db";
import { saveLearning, logChange } from "./save";
import type { PipelineResult } from "./types";

/* Sections we know produce actionable learnings after an audit */
const AUDIT_SECTION_TYPES: Record<string, string> = {
  technical:  "technical",
  on_page:    "content",
  off_page:   "competitive",
  geo:        "geo",
};

/* ── Post-audit pipeline ── */
export async function runPostAuditPipeline(opts: {
  projectId: string;
  auditId:   string;
  url:       string;
  sections:  Record<string, string>;  // section_key → full text output
  score:     number | null;
}): Promise<PipelineResult> {
  const { projectId, auditId, url, sections, score } = opts;
  const errors: string[] = [];
  let learningSaved  = 0;
  let learningSkipped = 0;
  let metricsAutoSynced = false;
  let launchpadMarkedStale = false;

  /* 1. Extract and save learnings from each audit section */
  for (const [sectionKey, text] of Object.entries(sections)) {
    if (!text || text.length < 100) continue;

    const cardType = AUDIT_SECTION_TYPES[sectionKey] || "insight";
    const result = await saveLearning({
      source:      "audit_streaming",
      projectId,
      content:     text,
      title:       `Audit ${sectionKey.replace(/_/g, " ")} — ${url.replace(/https?:\/\//, "").slice(0, 30)}`,
      cardType,
      contextSummary: `Audit run on ${url} — ${sectionKey} section`,
    });

    if (result.saved) learningSaved++;
    else learningSkipped++;
  }

  /* 2. Auto-sync score to metrics if no metric recorded in last 7 days */
  if (score != null) {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await db()
        .from("metrics").select("id").eq("project_id", projectId)
        .gte("recorded_at", sevenDaysAgo).limit(1);

      if (!recent?.length) {
        // Parse score into component scores if possible (audit score = overall_growth_score)
        await db().from("metrics").insert({
          project_id:          projectId,
          overall_growth_score: score,
          recorded_at:         new Date().toISOString(),
          source:              "audit_auto_sync",
          audit_report_id:     auditId,
        });
        metricsAutoSynced = true;
      }
    } catch (e: any) {
      errors.push(`metrics_sync: ${e?.message}`);
    }
  }

  /* 3. Mark launchpad as stale — needs regeneration */
  try {
    const staleEntries = ["strategy", "pipeline", "launchpad"].map(section => ({
      project_id:   projectId,
      section,
      stale:        true,
      stale_reason: `New audit completed for ${url}`,
      stale_since:  new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    }));
    for (const entry of staleEntries) {
      await db().from("staleness_registry").upsert(entry, { onConflict: "project_id,section" });
    }
    launchpadMarkedStale = true;
  } catch (e: any) {
    errors.push(`staleness: ${e?.message}`);
  }

  /* 4. Log the pipeline run */
  await logChange({
    projectId,
    changeType:  "audit_pipeline",
    description: `Audit pipeline: ${learningSaved} learnings saved, ${learningSkipped} skipped. Score: ${score ?? "n/a"}. Auto-synced metrics: ${metricsAutoSynced}.`,
    metadata:    { auditId, url, learningSaved, learningSkipped, metricsAutoSynced, launchpadMarkedStale, errors },
  });

  return {
    auditId, projectId, learningSaved, learningSkipped,
    metricsAutoSynced, launchpadMarkedStale, errors,
    timestamp: new Date().toISOString(),
  };
}

/* ── Post-metrics pipeline ── */
export async function runPostMetricsPipeline(opts: {
  projectId: string;
  metrics:   Record<string, any>;
}): Promise<void> {
  const { projectId, metrics } = opts;

  /* Mark launchpad stale so it auto-regenerates on next view */
  try {
    await db().from("staleness_registry").upsert({
      project_id:   projectId,
      section:      "launchpad",
      stale:        true,
      stale_reason: "Metrics updated — launchpad needs regeneration",
      stale_since:  new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    }, { onConflict: "project_id,section" });
  } catch (_e) {}

  await logChange({
    projectId,
    changeType:  "metrics_saved",
    description: `Metrics recorded. Scores: LLM ${metrics.llm_visibility_score ?? "?"}, Health ${metrics.algorithm_health_score ?? "?"}, EEAT ${metrics.eeat_score ?? "?"}`,
    metadata:    metrics,
  });
}

/* ── Check if launchpad is stale and needs regeneration ── */
export async function isLaunchpadStale(projectId: string): Promise<boolean> {
  try {
    const { data } = await db()
      .from("staleness_registry")
      .select("stale")
      .eq("project_id", projectId)
      .eq("section", "launchpad")
      .single();
    return (data as any)?.stale === true;
  } catch (_e) {
    return false;
  }
}

/* ── Mark a section as fresh (after regeneration) ── */
export async function markSectionFresh(projectId: string, section: string): Promise<void> {
  try {
    await db().from("staleness_registry").upsert({
      project_id:   projectId,
      section,
      stale:        false,
      stale_reason: null,
      updated_at:   new Date().toISOString(),
    }, { onConflict: "project_id,section" });
  } catch (_e) {}
}
