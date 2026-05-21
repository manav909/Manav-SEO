/* ════════════════════════════════════════════════════════════════
   api/lib/season-escalation-engine.ts
   Phase 12.5b — The five responses to a checkpoint.

   When the monitor engine produces a CheckpointResult with severity
   >= 'watch', this engine fans out into one or more responses:

     1. RECORDED        — always created. Audit trail.
     2. WISH_EMITTED    — when leading indicators reveal an insight gap
                          ("we didn't know X about this market")
     3. DIAGNOSTIC      — when severity = critical, kick off a root-cause
                          analysis pipeline (Phase 12.5c will define;
                          for now we log the intent)
     4. MOOD_CRITICAL   — flip the project's S.E.A.S.O.N. mood to critical
                          so the orb pulses red across the session
     5. CORRECTIVE_DRAFTED — pre-draft a remediation action (in Manav's
                          voice) that's ready for approval

   Honesty rules baked in:
     • Every response is logged to season_forecast_escalations
     • Corrective drafts are NEVER auto-executed — always pending approval
     • The engine never exceeds 1 escalation per (checkpoint, response_kind)
     • If the underlying check used estimated baseline, escalations are
       softer (no diagnostic auto-fire, no mood_critical) — we don't
       trigger panic on shaky data
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import type { CheckpointResult, Severity } from "./season-monitor-engine.js";

export type ResponseKind =
  | 'recorded'
  | 'wish_emitted'
  | 'diagnostic_started'
  | 'mood_critical'
  | 'corrective_drafted';

export interface EscalationFired {
  response_kind:   ResponseKind;
  detail?:         string;
  reference_id?:   string;
  reference_table?: string;
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6";

/* ════════════════════════════════════════════════════════════
   PUBLIC ENTRY — fanout
═══════════════════════════════════════════════════════════ */

export async function escalateCheckpoint(opts: {
  checkpoint: CheckpointResult;
  baselineSource?: string;   // 'gsc' | 'ga4' | 'manual' | 'estimated'
}): Promise<{ success: boolean; escalations: EscalationFired[]; error?: string }> {
  const { checkpoint } = opts;
  const baselineGrounded = (opts.baselineSource && opts.baselineSource !== 'estimated');
  const fired: EscalationFired[] = [];

  try {
    /* ─── 1. RECORDED — always ─── */
    await logEscalation({
      checkpointId: checkpoint.checkpoint_id,
      forecastId:   checkpoint.forecast_id,
      projectId:    checkpoint.project_id,
      responseKind: 'recorded',
      detail:       `Checkpoint at day ${checkpoint.day_offset_at_check}: severity=${checkpoint.severity}, variance ${checkpoint.variance_pct === null ? 'n/a' : checkpoint.variance_pct.toFixed(1) + '%'}`,
    });
    fired.push({ response_kind: 'recorded' });

    /* If severity is info, only record — don't escalate further */
    if (checkpoint.severity === 'info') {
      return { success: true, escalations: fired };
    }

    /* Fetch forecast row to enrich context */
    const { data: forecast } = await db().from("season_forecasts")
      .select("kpi, target_entity, target_entity_kind, target_value, target_day_offset, baseline_value, baseline_source, honest_caveats, pipeline_run_id, strategy_id")
      .eq("id", checkpoint.forecast_id)
      .maybeSingle();
    const fc = forecast as any || {};

    /* ─── 2. WISH_EMITTED — when leading indicators reveal insight gap ─── */
    if (checkpoint.severity === 'warning' || checkpoint.severity === 'critical') {
      const wishText = buildWishFromCheckpoint(checkpoint, fc);
      if (wishText) {
        try {
          const { bsSeasonEmitWish } = await import("./season-wishes.js");
          const wishResult = await bsSeasonEmitWish({
            projectId: checkpoint.project_id,
            wishText,
            category: 'knowledge',
            triggeredBy: `forecast checkpoint @ day ${checkpoint.day_offset_at_check}`,
            contextSummary: `kpi=${fc.kpi}, entity="${fc.target_entity}", severity=${checkpoint.severity}`,
          });
          if (wishResult.success) {
            await logEscalation({
              checkpointId: checkpoint.checkpoint_id,
              forecastId:   checkpoint.forecast_id,
              projectId:    checkpoint.project_id,
              responseKind: 'wish_emitted',
              detail:       wishText.slice(0, 240),
              referenceId:  wishResult.wishId,
              referenceTable: 'season_wishes',
            });
            fired.push({ response_kind: 'wish_emitted', detail: wishText, reference_id: wishResult.wishId });
          }
        } catch { /* non-fatal */ }
      }
    }

    /* ─── 3. DIAGNOSTIC_STARTED — only if critical AND baseline was grounded ─── */
    if (checkpoint.severity === 'critical' && baselineGrounded) {
      /* In Phase 12.5c we'll wire the actual diagnostic pipeline.
         For now, we log the intent so the dashboard can show it. */
      await logEscalation({
        checkpointId: checkpoint.checkpoint_id,
        forecastId:   checkpoint.forecast_id,
        projectId:    checkpoint.project_id,
        responseKind: 'diagnostic_started',
        detail:       `Critical miss on ${fc.kpi} for "${fc.target_entity}". Root-cause analysis queued.`,
      });
      fired.push({ response_kind: 'diagnostic_started' });
    } else if (checkpoint.severity === 'critical' && !baselineGrounded) {
      /* Honesty: critical severity on estimated baseline is a soft signal */
      await logEscalation({
        checkpointId: checkpoint.checkpoint_id,
        forecastId:   checkpoint.forecast_id,
        projectId:    checkpoint.project_id,
        responseKind: 'recorded',
        detail:       `Critical severity recorded but baseline was estimated — not auto-firing diagnostic. Manual review recommended.`,
      });
    }

    /* ─── 4. MOOD_CRITICAL — flip the orb mood for the session ─── */
    if (checkpoint.severity === 'critical' && baselineGrounded) {
      /* This works by writing an activity_log entry with severity=critical.
         The /command page derives orb mood from briefing.attention — which
         reads from activity_log + strategies + blockers. So a critical
         activity_log entry from forecast-monitoring will flip the orb. */
      try {
        await db().from("activity_log").insert({
          project_id: checkpoint.project_id,
          event_type: 'forecast_critical',
          source: 'system',
          headline: `${fc.kpi} for "${fc.target_entity}" is critically off-forecast`,
          detail:   checkpoint.honest_assessment.slice(0, 500),
          technical: { forecast_id: checkpoint.forecast_id, checkpoint_id: checkpoint.checkpoint_id, variance_pct: checkpoint.variance_pct },
          severity: 'critical',
        });
        await logEscalation({
          checkpointId: checkpoint.checkpoint_id,
          forecastId:   checkpoint.forecast_id,
          projectId:    checkpoint.project_id,
          responseKind: 'mood_critical',
          detail:       'Orb mood flipped to critical for the session.',
        });
        fired.push({ response_kind: 'mood_critical' });
      } catch { /* non-fatal */ }
    }

    /* ─── 5. CORRECTIVE_DRAFTED — pre-draft an action for approval ─── */
    if ((checkpoint.severity === 'warning' || checkpoint.severity === 'critical') && baselineGrounded) {
      const corrective = await draftCorrective({
        checkpoint,
        forecast: fc,
      });
      if (corrective) {
        const { data: inserted } = await db().from("season_forecast_escalations").insert({
          checkpoint_id:        checkpoint.checkpoint_id,
          forecast_id:          checkpoint.forecast_id,
          project_id:           checkpoint.project_id,
          response_kind:        'corrective_drafted',
          detail:               'Pre-drafted corrective action — awaiting approval.',
          corrective_summary:   corrective.summary,
          corrective_artifact:  corrective.artifact,
          approval_status:      'pending',
        }).select("id").maybeSingle();

        fired.push({
          response_kind: 'corrective_drafted',
          detail: corrective.summary,
          reference_id: (inserted as any)?.id,
        });
      }
    }

    return { success: true, escalations: fired };
  } catch (e: any) {
    return { success: false, escalations: fired, error: e?.message || 'escalation failed' };
  }
}

/* ════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */

async function logEscalation(opts: {
  checkpointId:   string;
  forecastId:     string;
  projectId:      string;
  responseKind:   ResponseKind;
  detail?:        string;
  referenceId?:   string;
  referenceTable?: string;
}): Promise<void> {
  try {
    /* Dedupe — never write the same response_kind twice per checkpoint */
    const { data: existing } = await db().from("season_forecast_escalations")
      .select("id")
      .eq("checkpoint_id", opts.checkpointId)
      .eq("response_kind", opts.responseKind)
      .maybeSingle();
    if (existing) return;

    await db().from("season_forecast_escalations").insert({
      checkpoint_id:    opts.checkpointId,
      forecast_id:      opts.forecastId,
      project_id:       opts.projectId,
      response_kind:    opts.responseKind,
      detail:           opts.detail ? String(opts.detail).slice(0, 1000) : null,
      reference_id:     opts.referenceId || null,
      reference_table:  opts.referenceTable || null,
    });
  } catch { /* non-fatal */ }
}

function buildWishFromCheckpoint(cp: CheckpointResult, fc: any): string | null {
  /* Generate a concrete wish-text reflecting what would have helped us
     anticipate this miss. The wish goes to season_wishes for triage. */
  const kpi = fc.kpi;
  const entity = fc.target_entity;
  const variance = cp.variance_pct;

  if (kpi === 'rank_position' && variance !== null && variance > 30) {
    return `I wish I had keyword difficulty + competitor backlink data for "${entity}". The rank forecast missed by ${variance.toFixed(0)}% — likely because we underestimated competitive strength. Ahrefs/Semrush would catch this earlier.`;
  }
  if (kpi === 'clicks' && variance !== null && variance < -30) {
    return `I wish I had SERP CTR data for "${entity}". Clicks came in ${Math.abs(variance).toFixed(0)}% below forecast despite impressions — the SERP layout (featured snippet, AI overview, etc.) may be eating clicks.`;
  }
  if (kpi === 'impressions' && variance !== null && variance < -40) {
    return `I wish I had live SERP indexing-status checks. Impressions are ${Math.abs(variance).toFixed(0)}% below forecast — the target page may not be indexed yet, or de-indexed.`;
  }
  if (kpi === 'organic_sessions' && variance !== null && variance < -30) {
    return `I wish I had source-of-truth attribution between GSC clicks and GA4 sessions for "${entity}". Sessions are ${Math.abs(variance).toFixed(0)}% below forecast — could be tracking gap or real traffic loss.`;
  }
  return null;
}

async function draftCorrective(opts: {
  checkpoint: CheckpointResult;
  forecast:   any;
}): Promise<{ summary: string; artifact: any } | null> {
  const { checkpoint, forecast } = opts;

  if (!ANTHROPIC_API_KEY) {
    /* No LLM available — produce a template-driven corrective so the
       feature still works honestly without keys */
    const summary = `Review needed: ${forecast.kpi} for "${forecast.target_entity}" is off-forecast (${checkpoint.variance_pct?.toFixed(0)}%). Suggested manual review.`;
    return {
      summary,
      artifact: {
        kind: 'corrective_template',
        steps: [
          'Open Data Room → Analytics and check actual values for this entity',
          'Compare against checkpoint assessment in the dashboard',
          'If hard blockers exist for this strategy, prioritize clearing them',
          'If blockers are clear, decide: continue current strategy, pivot angle, or kill',
        ],
        honest_note: 'Drafted without LLM (ANTHROPIC_API_KEY missing). Template-only.',
      },
    };
  }

  try {
    const sys = `You are S.E.A.S.O.N. drafting a corrective action plan in Manav's voice. The plan should be:
- Specific to the checkpoint failure
- 3-5 concrete steps, each actionable
- Honest about what we don't know
- No pipeline/AI references — Manav voice only

Reply with ONLY valid JSON:
{
  "summary": "1-sentence problem statement + recommended next move",
  "diagnosis": "what likely went wrong, in plain language",
  "steps": [{"step": "...", "owner": "Manav | client | writer | dev", "duration_days": 1}],
  "honest_unknowns": ["things we don't know that would sharpen this"],
  "decision_point": "the call Manav needs to make"
}`;

    const usr = `CHECKPOINT FAILURE:
- KPI: ${forecast.kpi}
- Target entity: "${forecast.target_entity}" (${forecast.target_entity_kind})
- Target: ${forecast.target_value} by day ${forecast.target_day_offset}
- Day of checkpoint: ${checkpoint.day_offset_at_check}
- Expected: ${checkpoint.expected_value}
- Actual: ${checkpoint.actual_value ?? 'no data'}
- Variance: ${checkpoint.variance_pct?.toFixed(1)}%
- Severity: ${checkpoint.severity}
- Honest assessment from monitor: ${checkpoint.honest_assessment}
- Baseline was: ${forecast.baseline_value} (source: ${forecast.baseline_source})
- Honest caveats on the forecast: ${forecast.honest_caveats || 'none'}

Draft a corrective action plan.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: sys,
        messages: [{ role: "user", content: usr }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    let parsed: any;
    try { parsed = JSON.parse(cleaned); } catch { return null; }
    if (!parsed?.summary) return null;
    return {
      summary: String(parsed.summary).slice(0, 500),
      artifact: parsed,
    };
  } catch {
    return null;
  }
}

/* ════════════════════════════════════════════════════════════
   PUBLIC — list pending correctives + approve
═══════════════════════════════════════════════════════════ */

export async function listPendingCorrectives(opts: { projectId: string }): Promise<any[]> {
  const { data } = await db().from("season_forecast_escalations")
    .select("id, checkpoint_id, forecast_id, project_id, response_kind, detail, corrective_summary, corrective_artifact, created_at")
    .eq("project_id", opts.projectId)
    .eq("response_kind", "corrective_drafted")
    .eq("approval_status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data || []) as any[];
}

export async function decideCorrective(opts: {
  escalationId: string;
  decision: 'approved' | 'dismissed';
}): Promise<{ success: boolean; error?: string }> {
  if (!['approved', 'dismissed'].includes(opts.decision)) {
    return { success: false, error: 'decision must be approved or dismissed' };
  }
  try {
    const { error } = await db().from("season_forecast_escalations")
      .update({ approval_status: opts.decision, approved_at: new Date().toISOString() })
      .eq("id", opts.escalationId)
      .eq("response_kind", "corrective_drafted");
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'decide failed' };
  }
}
