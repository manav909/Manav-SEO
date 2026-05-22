/* ════════════════════════════════════════════════════════════════
   api/lib/pm-rules.ts
   The auto-pilot rule engine. Walked by the daily cron.

   Six rule types in V1:
     1. monthly_audit              — re-audit on the 1st of each month
     2. quarterly_crawl            — re-crawl top pages every quarter
     3. weekly_report_draft        — auto-draft a weekly client report
     4. monthly_report_draft       — auto-draft a monthly client report
     5. rank_drop_alert            — daily check for target keyword position drops
     6. click_drop_alert           — weekly check for GSC click drops
     7. audit_score_drop_alert     — fires when a new audit lands with a score drop

   Design principles:
   - The system NEVER creates kanban_tasks directly. Audit-finding cards and
     report drafts land as card_suggestions or report drafts the PM reviews.
   - Anomalies land in project_alerts with deduplication so identical
     conditions don't pile up notifications.
   - Every rule fire writes a summary back to project_rules.last_fire_summary
     so the PM can see what the system did without digging.
   - Errors are caught per-rule, per-project — one failure never stops others.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

/* ── rule type definitions ────────────────────────────────── */

export type RuleType =
  | "monthly_audit"
  | "quarterly_crawl"
  | "weekly_report_draft"
  | "monthly_report_draft"
  | "rank_drop_alert"
  | "click_drop_alert"
  | "audit_score_drop_alert";

interface RuleRow {
  id:               string;
  project_id:       string;
  rule_type:        RuleType;
  enabled:          boolean;
  schedule:         any;
  config:           any;
  last_fired_at:    string | null;
  last_fire_status: string | null;
}

/* ── schedule evaluation ──────────────────────────────────── */

/** Decide whether a rule is due to fire right now. Different rule types
 *  use different schedule shapes; this is the central dispatcher. */
function isDue(rule: RuleRow, now = new Date()): { due: boolean; reason: string } {
  if (!rule.enabled) return { due: false, reason: "disabled" };
  const last = rule.last_fired_at ? new Date(rule.last_fired_at) : null;
  const daysSinceLast = last ? (now.getTime() - last.getTime()) / 86_400_000 : Infinity;

  switch (rule.rule_type) {
    case "monthly_audit":
    case "monthly_report_draft": {
      const targetDay = Number(rule.schedule?.day_of_month) || 1;
      const isTargetDay = now.getUTCDate() === targetDay;
      /* fire on the target day, but not twice in the same month */
      if (isTargetDay && (!last || daysSinceLast >= 25)) {
        return { due: true, reason: `monthly fire — day ${targetDay}` };
      }
      return { due: false, reason: isTargetDay ? "already fired this month" : `not the ${targetDay}` };
    }

    case "weekly_report_draft": {
      const targetDow = Number(rule.schedule?.day_of_week) || 1;   /* default Monday */
      const isTargetDow = now.getUTCDay() === targetDow;
      if (isTargetDow && (!last || daysSinceLast >= 5)) {
        return { due: true, reason: `weekly fire — day ${targetDow}` };
      }
      return { due: false, reason: isTargetDow ? "already fired this week" : `not day ${targetDow}` };
    }

    case "quarterly_crawl": {
      const months = Array.isArray(rule.schedule?.months) && rule.schedule.months.length
        ? rule.schedule.months as number[]
        : [1, 4, 7, 10];
      const targetDay = Number(rule.schedule?.day_of_month) || 1;
      const isQuarterMonth = months.includes(now.getUTCMonth() + 1);
      const isTargetDay = now.getUTCDate() === targetDay;
      if (isQuarterMonth && isTargetDay && (!last || daysSinceLast >= 80)) {
        return { due: true, reason: `quarterly fire — month ${now.getUTCMonth() + 1}` };
      }
      return { due: false, reason: "not a quarter trigger day" };
    }

    case "rank_drop_alert":
    case "audit_score_drop_alert": {
      /* daily checks — fire once per day */
      if (!last || daysSinceLast >= 0.9) {
        return { due: true, reason: "daily check" };
      }
      return { due: false, reason: "already checked today" };
    }

    case "click_drop_alert": {
      /* weekly check — fire once every 7 days */
      if (!last || daysSinceLast >= 6.9) {
        return { due: true, reason: "weekly check" };
      }
      return { due: false, reason: "already checked this week" };
    }

    default:
      return { due: false, reason: "unknown rule type" };
  }
}

/* ── individual rule handlers ─────────────────────────────── */

/** Stable dedupe key for an alert so re-firing the same condition
 *  doesn't create duplicate open rows. */
function dedupeKey(parts: (string | number | undefined | null)[]): string {
  return parts.filter((p) => p != null && p !== "").join("|").slice(0, 200);
}

async function upsertAlert(opts: {
  projectId: string; ruleId: string;
  alertType: string; severity: "info" | "warn" | "critical";
  title: string; detail: any; dedupeKey: string;
}): Promise<{ created: boolean; alertId?: string }> {
  /* check for an existing OPEN alert with the same dedupe key — if found,
     don't duplicate. The alert table's UNIQUE (project, dedupe, status)
     enforces this but we want a friendly response, not an error. */
  const { data: existing } = await db().from("project_alerts")
    .select("id").eq("project_id", opts.projectId)
    .eq("dedupe_key", opts.dedupeKey).eq("status", "open").maybeSingle();
  if (existing) return { created: false, alertId: (existing as any).id };

  const { data, error } = await db().from("project_alerts").insert({
    project_id:     opts.projectId,
    source_rule_id: opts.ruleId,
    alert_type:     opts.alertType,
    severity:       opts.severity,
    title:          opts.title,
    detail:         opts.detail,
    dedupe_key:     opts.dedupeKey,
  }).select("id").single();
  if (error) {
    console.error("[pm-rules] alert insert failed:", error.message);
    return { created: false };
  }
  const alertId = (data as any).id;

  /* Phase 14.1 — best-effort: also create an opportunity tied to this alert.
     If a campaign already exists for the alert's keyword, the opportunity gets
     linked to that campaign automatically. Failures here NEVER block the alert. */
  try {
    const { recordOpportunityFromAlert } = await import("./seo-campaign-engine.js");
    await recordOpportunityFromAlert({
      projectId: opts.projectId,
      alertId,
      alertType: opts.alertType,
      severity:  opts.severity,
      title:     opts.title,
      detail:    opts.detail,
    });
  } catch (e: any) {
    console.log(`[pm-rules] opportunity creation from alert failed (non-fatal): ${e?.message}`);
  }

  return { created: true, alertId };
}

/* ── rule: rank_drop_alert ────────────────────────────────── */

/** Check if any target keyword's average position dropped by 5+ positions
 *  comparing the last 14 days to the prior 14. This needs a rank tracker —
 *  for now, we use GSC average position per keyword (limitation: GSC pos
 *  is broad). Future: integrate per-keyword Ahrefs/Semrush ranking. */
async function runRankDropAlert(rule: RuleRow): Promise<any> {
  const threshold = Number(rule.config?.position_threshold) || 5;

  /* read the project's target keywords from the project row */
  const { data: proj } = await db().from("projects")
    .select("keywords,name").eq("id", rule.project_id).maybeSingle();
  const keywords = Array.isArray((proj as any)?.keywords) ? (proj as any).keywords : [];
  if (!keywords.length) {
    return { ok: true, message: "no target keywords set — nothing to check", checked: 0 };
  }

  /* check the GSC integration is live for this project */
  const { data: gsc } = await db().from("project_integrations")
    .select("resource_id,last_pull_at").eq("project_id", rule.project_id)
    .eq("provider", "gsc").maybeSingle();
  if (!gsc || !(gsc as any).resource_id) {
    return { ok: true, message: "GSC not connected — rank drop check requires GSC", checked: 0 };
  }

  /* take the most recent and prior metrics snapshots — V1 uses the
     project-level GSC average position, not per-keyword. This is
     coarse but high-signal: a 5+ drop in average position across the
     site is unambiguously worth attention. Per-keyword tracking will
     require Ahrefs/Semrush integration (future phase). */
  const { data: recent } = await db().from("metrics_snapshots")
    .select("gsc_avg_position,captured_at").eq("project_id", rule.project_id)
    .not("gsc_avg_position", "is", null)
    .order("captured_at", { ascending: false }).limit(30);
  const rows = recent || [];
  if (rows.length < 4) return { ok: true, message: "not enough snapshots yet", checked: 0 };

  /* split into two windows: last 14 days vs prior 14 days */
  const now = Date.now();
  const last14: number[]  = [];
  const prior14: number[] = [];
  for (const r of rows) {
    const ageDays = (now - new Date((r as any).captured_at).getTime()) / 86_400_000;
    const pos = Number((r as any).gsc_avg_position);
    if (!isFinite(pos)) continue;
    if (ageDays <= 14) last14.push(pos);
    else if (ageDays <= 28) prior14.push(pos);
  }
  if (!last14.length || !prior14.length) {
    return { ok: true, message: "need both 14-day windows of data", checked: 0 };
  }
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const recentAvg = avg(last14);
  const priorAvg  = avg(prior14);
  const delta = recentAvg - priorAvg;     /* positive = position got worse */

  if (delta < threshold) {
    return { ok: true, message: `position stable (Δ ${delta.toFixed(1)})`, checked: keywords.length, delta };
  }

  /* fire the alert */
  const r = await upsertAlert({
    projectId:  rule.project_id,
    ruleId:     rule.id,
    alertType:  "rank_drop",
    severity:   delta >= 10 ? "critical" : "warn",
    title:      `Average position dropped ${delta.toFixed(1)} places over the last 14 days`,
    detail: {
      previous_window: { days: "14-28d ago", avg_position: Number(priorAvg.toFixed(2)) },
      recent_window:   { days: "0-14d ago",  avg_position: Number(recentAvg.toFixed(2)) },
      delta:           Number(delta.toFixed(2)),
      threshold,
      target_keywords: keywords.slice(0, 10),
      gsc_property:    (gsc as any).resource_id,
      note: "Average position from GSC snapshots. For per-keyword precision, connect a dedicated rank tracker (future phase).",
    },
    dedupeKey: dedupeKey(["rank_drop", rule.project_id, "p14d"]),
  });
  return { ok: true, alerted: r.created, deduplicated: !r.created, delta };
}

/* ── rule: click_drop_alert ───────────────────────────────── */

async function runClickDropAlert(rule: RuleRow): Promise<any> {
  const threshold = Number(rule.config?.drop_pct_threshold) || 30;
  const { data: gsc } = await db().from("project_integrations")
    .select("resource_id").eq("project_id", rule.project_id)
    .eq("provider", "gsc").maybeSingle();
  if (!gsc || !(gsc as any).resource_id) {
    return { ok: true, message: "GSC not connected — click drop check requires GSC", checked: 0 };
  }

  const { data: recent } = await db().from("metrics_snapshots")
    .select("gsc_clicks,captured_at").eq("project_id", rule.project_id)
    .not("gsc_clicks", "is", null)
    .order("captured_at", { ascending: false }).limit(30);
  const rows = recent || [];
  if (rows.length < 4) return { ok: true, message: "not enough snapshots yet" };

  /* Each GSC snapshot is the trailing 7-day total. Compare the most
     recent snapshot to one ~7 days older for a clean week-on-week. */
  const now = Date.now();
  const recentRow = rows[0] as any;
  const priorRow = rows.find((r) => {
    const ageDays = (now - new Date((r as any).captured_at).getTime()) / 86_400_000;
    return ageDays >= 6 && ageDays <= 9;
  }) as any;
  if (!priorRow) return { ok: true, message: "no comparable prior week snapshot" };

  const recentClicks = Number(recentRow.gsc_clicks) || 0;
  const priorClicks  = Number(priorRow.gsc_clicks)  || 0;
  if (priorClicks < 5) {
    /* base too small to be statistically meaningful */
    return { ok: true, message: "click base too small for meaningful drop check" };
  }
  const dropPct = ((priorClicks - recentClicks) / priorClicks) * 100;

  if (dropPct < threshold) {
    return { ok: true, message: `clicks stable (Δ ${dropPct.toFixed(1)}%)`, dropPct };
  }

  const r = await upsertAlert({
    projectId:  rule.project_id,
    ruleId:     rule.id,
    alertType:  "click_drop",
    severity:   dropPct >= 50 ? "critical" : "warn",
    title:      `GSC clicks down ${dropPct.toFixed(0)}% week-on-week`,
    detail: {
      previous_week: { clicks: priorClicks, captured_at: priorRow.captured_at },
      recent_week:   { clicks: recentClicks, captured_at: recentRow.captured_at },
      drop_pct:      Number(dropPct.toFixed(2)),
      threshold_pct: threshold,
      gsc_property:  (gsc as any).resource_id,
      possible_causes: [
        "Algorithmic shift — check Google update tracker",
        "Site change — recent deployment may have removed pages or broken canonicals",
        "Seasonal — compare to same week prior year if data exists",
        "Tracking — verify GSC property has not been changed",
      ],
    },
    dedupeKey: dedupeKey(["click_drop", rule.project_id, "wow"]),
  });
  return { ok: true, alerted: r.created, deduplicated: !r.created, dropPct };
}

/* ── rule: audit_score_drop_alert ─────────────────────────── */

async function runAuditScoreDropAlert(rule: RuleRow): Promise<any> {
  const threshold = Number(rule.config?.score_drop_threshold) || 10;
  const { data: audits } = await db().from("audit_reports")
    .select("id,overall_score,created_at").eq("project_id", rule.project_id)
    .not("overall_score", "is", null)
    .order("created_at", { ascending: false }).limit(2);
  if (!audits || audits.length < 2) {
    return { ok: true, message: "need at least 2 audits to compare" };
  }
  const latest = audits[0] as any;
  const prior  = audits[1] as any;
  const drop = Number(prior.overall_score) - Number(latest.overall_score);

  if (drop < threshold) {
    return { ok: true, message: `audit score stable (Δ ${drop})`, drop };
  }

  /* dedupe key includes the latest audit ID so each new audit can
     trigger its own alert if it genuinely regressed */
  const r = await upsertAlert({
    projectId:  rule.project_id,
    ruleId:     rule.id,
    alertType:  "audit_score_drop",
    severity:   drop >= 20 ? "critical" : "warn",
    title:      `Audit score dropped ${drop} points (${prior.overall_score} → ${latest.overall_score})`,
    detail: {
      previous_audit: { id: prior.id, score: prior.overall_score, date: prior.created_at },
      latest_audit:   { id: latest.id, score: latest.overall_score, date: latest.created_at },
      drop,
      threshold,
      action: "Open the latest audit's synthesis section. The new low score points to recent regressions — fix the urgent gap before next audit.",
    },
    dedupeKey: dedupeKey(["audit_score_drop", rule.project_id, latest.id]),
  });
  return { ok: true, alerted: r.created, deduplicated: !r.created, drop };
}

/* ── rule: monthly_audit ──────────────────────────────────── */

async function runMonthlyAudit(rule: RuleRow): Promise<any> {
  /* Audits are expensive (multi-page crawl + AI analysis). Rather than
     running directly from the cron, we create a SUGGESTION for the PM
     to trigger the audit. This keeps the cron lightweight and keeps
     the PM in the loop. */
  const maxPages = Number(rule.config?.max_pages) || 5;
  const { data: proj } = await db().from("projects")
    .select("name,url").eq("id", rule.project_id).maybeSingle();
  if (!proj) return { ok: false, error: "project not found" };

  const monthLabel = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });

  const { error } = await db().from("card_suggestions").insert({
    project_id:     rule.project_id,
    source_rule_id: rule.id,
    source_kind:    "rule",
    card_type:      "audit",
    priority:       "high",
    title:          `Monthly audit — ${monthLabel}`,
    description:    `Auto-pilot rule fired: run a full site audit for ${monthLabel}. Recommended pages: ${maxPages}. Findings will surface in the next report.`,
    requirements: {
      url_strategy:     rule.config?.url_strategy || "top_pages_by_clicks",
      max_pages:        maxPages,
      depth:            "standard",
      auto_pilot_origin: true,
    },
    source_refs: [
      { kind: "rule", label: `Monthly audit rule`, ruleId: rule.id },
      proj && (proj as any).url ? { kind: "url", label: (proj as any).url } : null,
    ].filter(Boolean),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, suggested: true, period: monthLabel };
}

/* ── rule: quarterly_crawl ────────────────────────────────── */

async function runQuarterlyCrawl(rule: RuleRow): Promise<any> {
  const maxPages = Number(rule.config?.max_pages) || 10;
  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });

  const { error } = await db().from("card_suggestions").insert({
    project_id:     rule.project_id,
    source_rule_id: rule.id,
    source_kind:    "rule",
    card_type:      "technical_audit",
    priority:       "medium",
    title:          `Quarterly crawl — ${month}`,
    description:    `Auto-pilot rule fired: re-crawl the top ${maxPages} pages this quarter to refresh page-level signals (schema coverage, word count, internal linking).`,
    requirements: {
      max_pages:        maxPages,
      url_strategy:     rule.config?.url_strategy || "top_pages_by_clicks",
      auto_pilot_origin: true,
    },
    source_refs: [{ kind: "rule", label: "Quarterly crawl rule", ruleId: rule.id }],
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, suggested: true, period: month };
}

/* ── rule: weekly_report_draft / monthly_report_draft ─────── */

async function runReportDraft(rule: RuleRow, cadence: "weekly" | "monthly"): Promise<any> {
  /* Generate a report draft using the existing pm-reports engine. The
     draft saves with status='draft' so the PM reviews before sending. */
  const now = new Date();
  const periodEnd = now.toISOString().slice(0, 10);
  const days = cadence === "weekly" ? 7 : 30;
  const periodStart = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);

  try {
    const { pmReportGenerate } = await import("./pm-reports.js");
    const r = await pmReportGenerate({
      projectId:      rule.project_id,
      periodStart, periodEnd,
      title:          cadence === "weekly"
                        ? `Weekly report — week ending ${periodEnd}`
                        : `Monthly report — ${new Date().toLocaleString("en-GB", { month: "long", year: "numeric" })}`,
      selectedBlocks: [
        "narr:exec_summary", "narr:performance", "narr:delivery", "narr:next_steps",
        "kpi:organic_sessions", "kpi:gsc_clicks", "kpi:gsc_position", "kpi:audit_score",
        "chart:organic_sessions", "chart:gsc_clicks",
        "table:delivered", "table:measured_impact",
      ],
      sliders: {                /* conservative defaults — PM tunes before sending */
        tone: 50, technicalDepth: 50, confidence: 50, emotion: 30, length: 50,
      },
      pmContext: {
        emphasize: "", downplay: "", mood: "steady",
        customNote: `Auto-generated by ${cadence} report rule.`,
      },
    });
    if (!r?.success) return { ok: false, error: r?.error || "report generation failed" };
    return { ok: true, reportId: (r as any).report?.id, period: `${periodStart} → ${periodEnd}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || "report draft failed" };
  }
}

/* ── single rule dispatch ─────────────────────────────────── */

async function runOneRule(rule: RuleRow): Promise<any> {
  switch (rule.rule_type) {
    case "rank_drop_alert":         return runRankDropAlert(rule);
    case "click_drop_alert":        return runClickDropAlert(rule);
    case "audit_score_drop_alert":  return runAuditScoreDropAlert(rule);
    case "monthly_audit":           return runMonthlyAudit(rule);
    case "quarterly_crawl":         return runQuarterlyCrawl(rule);
    case "weekly_report_draft":     return runReportDraft(rule, "weekly");
    case "monthly_report_draft":    return runReportDraft(rule, "monthly");
    default: return { ok: false, error: "unknown rule type" };
  }
}

/* ── cron tick ────────────────────────────────────────────── */

/** Walk every enabled rule across all projects, fire any that are due,
 *  record outcomes back to project_rules.last_fire_*. Best-effort per
 *  rule — one failure never stops others. */
export async function ruleEngineTick(): Promise<{
  evaluated: number; fired: number; skipped: number; errors: string[];
  byType: Record<string, { fired: number; skipped: number; errors: number }>;
}> {
  const errors: string[] = [];
  const byType: Record<string, { fired: number; skipped: number; errors: number }> = {};
  let evaluated = 0, fired = 0, skipped = 0;

  try {
    const { data: rules } = await db().from("project_rules").select("*")
      .eq("enabled", true);
    for (const r of (rules || [])) {
      const rule = r as RuleRow;
      evaluated++;
      const bucket = byType[rule.rule_type] ||= { fired: 0, skipped: 0, errors: 0 };
      const decision = isDue(rule);
      if (!decision.due) {
        skipped++; bucket.skipped++;
        continue;
      }
      try {
        const result = await runOneRule(rule);
        const status = result?.ok === false ? "error" : "ok";
        await db().from("project_rules").update({
          last_fired_at:     new Date().toISOString(),
          last_fire_status:  status,
          last_fire_error:   status === "error" ? (result?.error || "unknown") : null,
          last_fire_summary: result || {},
        }).eq("id", rule.id);
        if (status === "ok") { fired++; bucket.fired++; }
        else { errors.push(`${rule.rule_type}/${rule.project_id}: ${result?.error}`); bucket.errors++; }
      } catch (e: any) {
        const msg = e?.message || "rule fire failed";
        errors.push(`${rule.rule_type}/${rule.project_id}: ${msg}`);
        bucket.errors++;
        await db().from("project_rules").update({
          last_fired_at:    new Date().toISOString(),
          last_fire_status: "error",
          last_fire_error:  msg,
        }).eq("id", rule.id);
      }
    }
  } catch (e: any) {
    errors.push(`ruleEngineTick top-level: ${e?.message || "fail"}`);
  }

  return { evaluated, fired, skipped, errors, byType };
}

/* ════════════════════════════════════════════════════════════
   PM-facing actions (CRUD + inbox handlers)
═══════════════════════════════════════════════════════════ */

/* ── list rules for a project ─────────────────────────────── */
export async function pmRulesList(projectId: string): Promise<{
  success: boolean; rules?: any[]; error?: string;
}> {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const { data } = await db().from("project_rules").select("*")
      .eq("project_id", projectId)
      .order("rule_type", { ascending: true });
    return { success: true, rules: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

/* ── upsert a rule ───────────────────────────────────────── */
export async function pmRuleUpsert(opts: {
  projectId: string; ruleType: RuleType; enabled?: boolean;
  schedule?: any; config?: any;
}): Promise<{ success: boolean; rule?: any; error?: string }> {
  if (!opts.projectId || !opts.ruleType) return { success: false, error: "projectId + ruleType required" };
  try {
    const payload: any = {
      project_id: opts.projectId,
      rule_type:  opts.ruleType,
      enabled:    opts.enabled !== false,
      schedule:   opts.schedule || {},
      config:     opts.config || {},
    };
    const { data, error } = await db().from("project_rules")
      .upsert(payload, { onConflict: "project_id,rule_type" })
      .select("*").single();
    if (error) return { success: false, error: error.message };
    return { success: true, rule: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "upsert failed" };
  }
}

/* ── toggle / delete a rule ──────────────────────────────── */
export async function pmRuleSetEnabled(ruleId: string, enabled: boolean) {
  if (!ruleId) return { success: false, error: "ruleId required" };
  try {
    const { error } = await db().from("project_rules")
      .update({ enabled }).eq("id", ruleId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "toggle failed" };
  }
}
export async function pmRuleDelete(ruleId: string) {
  if (!ruleId) return { success: false, error: "ruleId required" };
  try {
    const { error } = await db().from("project_rules").delete().eq("id", ruleId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "delete failed" };
  }
}

/** Manually fire a rule right now (PM clicks "Run now"). Bypasses isDue(). */
export async function pmRuleRunNow(ruleId: string) {
  if (!ruleId) return { success: false, error: "ruleId required" };
  try {
    const { data: rule } = await db().from("project_rules").select("*")
      .eq("id", ruleId).maybeSingle();
    if (!rule) return { success: false, error: "rule not found" };
    const result = await runOneRule(rule as RuleRow);
    const status = result?.ok === false ? "error" : "ok";
    await db().from("project_rules").update({
      last_fired_at:    new Date().toISOString(),
      last_fire_status: status,
      last_fire_error:  status === "error" ? (result?.error || "unknown") : null,
      last_fire_summary: result || {},
    }).eq("id", ruleId);
    return { success: status === "ok", result, error: status === "error" ? result?.error : undefined };
  } catch (e: any) {
    return { success: false, error: e?.message || "run now failed" };
  }
}

/* ── suggestions inbox ───────────────────────────────────── */

export async function pmSuggestionsList(projectId: string, status?: string) {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    let q = db().from("card_suggestions").select("*").eq("project_id", projectId);
    if (status) q = q.eq("status", status);
    else        q = q.eq("status", "pending");
    const { data } = await q.order("created_at", { ascending: false }).limit(100);
    return { success: true, suggestions: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

/** Accept a suggestion: create a real kanban_tasks card from the suggestion
 *  and mark the suggestion as accepted, linking back to the new task. */
export async function pmSuggestionAccept(suggestionId: string, actor?: string) {
  if (!suggestionId) return { success: false, error: "suggestionId required" };
  try {
    const { data: s } = await db().from("card_suggestions").select("*")
      .eq("id", suggestionId).maybeSingle();
    if (!s) return { success: false, error: "suggestion not found" };
    if ((s as any).status !== "pending") {
      return { success: false, error: `suggestion is ${(s as any).status}` };
    }

    /* create the kanban_tasks row */
    const { data: card, error: cardErr } = await db().from("kanban_tasks").insert({
      project_id:  (s as any).project_id,
      title:       (s as any).title,
      description: (s as any).description || "",
      card_type:   (s as any).card_type || "general",
      priority:    (s as any).priority || "medium",
      status:      "planned",
      requirements:(s as any).requirements || {},
      source_refs: (s as any).source_refs || [],
      source:      "auto_pilot",
      estimated_hours: (s as any).estimated_hours || null,
      placed:      false,
      week:        5,
      position:    0,
    }).select("*").single();
    if (cardErr) return { success: false, error: cardErr.message };

    /* mark the suggestion accepted */
    await db().from("card_suggestions").update({
      status:           "accepted",
      accepted_card_id: (card as any).id,
    }).eq("id", suggestionId);

    /* log activity on the new card so its origin is traceable */
    try {
      await db().from("card_activity").insert({
        card_id:    (card as any).id,
        project_id: (card as any).project_id,
        kind:       "auto_pilot_accepted",
        message:    `Card created from auto-pilot suggestion (rule fired by system).`,
        actor:      actor || null,
        detail:     { suggestionId, sourceKind: (s as any).source_kind },
      });
    } catch { /* activity is best-effort */ }

    return { success: true, card };
  } catch (e: any) {
    return { success: false, error: e?.message || "accept failed" };
  }
}

export async function pmSuggestionDismiss(suggestionId: string, reason?: string) {
  if (!suggestionId) return { success: false, error: "suggestionId required" };
  try {
    const { error } = await db().from("card_suggestions").update({
      status:         "dismissed",
      dismiss_reason: reason || null,
    }).eq("id", suggestionId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "dismiss failed" };
  }
}

/* ── alerts inbox ────────────────────────────────────────── */

export async function pmAlertsList(projectId: string, status?: string) {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    let q = db().from("project_alerts").select("*").eq("project_id", projectId);
    if (status) q = q.eq("status", status);
    else        q = q.in("status", ["open", "acknowledged"]);
    const { data } = await q.order("created_at", { ascending: false }).limit(100);
    return { success: true, alerts: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

export async function pmAlertAcknowledge(alertId: string, actor?: string) {
  if (!alertId) return { success: false, error: "alertId required" };
  try {
    const { error } = await db().from("project_alerts").update({
      status:          "acknowledged",
      acknowledged_by: actor || null,
      acknowledged_at: new Date().toISOString(),
    }).eq("id", alertId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "acknowledge failed" };
  }
}

export async function pmAlertResolve(alertId: string, note?: string) {
  if (!alertId) return { success: false, error: "alertId required" };
  try {
    const { error } = await db().from("project_alerts").update({
      status:          "resolved",
      resolved_at:     new Date().toISOString(),
      resolution_note: note || null,
    }).eq("id", alertId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "resolve failed" };
  }
}

/* ── dispatch ─────────────────────────────────────────────── */

export async function handlePmRules(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "pm_rules_list":          return pmRulesList(body.projectId);
    case "pm_rule_upsert":         return pmRuleUpsert(body);
    case "pm_rule_set_enabled":    return pmRuleSetEnabled(body.ruleId, !!body.enabled);
    case "pm_rule_delete":         return pmRuleDelete(body.ruleId);
    case "pm_rule_run_now":        return pmRuleRunNow(body.ruleId);
    case "pm_suggestions_list":    return pmSuggestionsList(body.projectId, body.status);
    case "pm_suggestion_accept":   return pmSuggestionAccept(body.suggestionId, body.actor);
    case "pm_suggestion_dismiss":  return pmSuggestionDismiss(body.suggestionId, body.reason);
    case "pm_alerts_list":         return pmAlertsList(body.projectId, body.status);
    case "pm_alert_acknowledge":   return pmAlertAcknowledge(body.alertId, body.actor);
    case "pm_alert_resolve":       return pmAlertResolve(body.alertId, body.note);
    default: return null;
  }
}
