/* ════════════════════════════════════════════════════════════════
   api/lib/mission-control.ts
   Cross-project portfolio aggregation for the senior-PM dashboard.

   One action: mc_summary
   Returns the data needed to answer the only two questions that
   matter every morning:
     1. What's on fire? (open alerts, blocked cards, ripe shipments,
        stale integrations, pending suggestions — sorted by severity)
     2. What's healthy? (projects with no urgent flags, humming along)

   Performance principle: do this with targeted aggregate queries
   per table, then stitch in memory. Avoid per-project loops at all
   costs — a 20-project portfolio must load in <1 second.
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

/* ── attention scoring ────────────────────────────────────── */

/* A higher score = more urgent. Used to sort the attention list.
   Each contributor maps to a real action the PM should take. */
interface AttentionScore {
  score:    number;
  flags:    string[];      /* human-readable flag labels */
  severity: "critical" | "warn" | "info" | "calm";
}

/* ── main aggregator ──────────────────────────────────────── */

export async function mcSummary(): Promise<{
  success: boolean; error?: string;
  projects?: any[];
  totals?: any;
  attention?: any[];
  generated_at?: string;
}> {
  try {
    /* ── 1. base projects + clients ──────────────────────────
       Read all projects with `status != 'archived'`. Pull only the
       columns we need to keep the payload light. */
    const { data: projects } = await db().from("projects")
      .select("id,name,url,status,client_id,current_phase,baseline_date,last_analysis_at,created_at")
      .neq("status", "archived")
      .order("created_at", { ascending: false });
    if (!projects || projects.length === 0) {
      return { success: true, projects: [], totals: emptyTotals(), attention: [], generated_at: new Date().toISOString() };
    }
    const projectIds = projects.map((p: any) => p.id);

    /* ── 2. clients lookup (for the row labels) ── */
    const clientIds = Array.from(new Set(projects.map((p: any) => p.client_id).filter(Boolean)));
    const { data: clients } = clientIds.length
      ? await db().from("clients").select("id,name,company").in("id", clientIds)
      : { data: [] };
    const clientById: Record<string, any> = {};
    for (const c of (clients || [])) clientById[(c as any).id] = c;

    /* ── 3. cards aggregate per project ──
       We need: total cards, in-progress, planned, blocked (computed
       at read-time via depends_on overlap), shipped this month, last activity. */
    const { data: cards } = await db().from("kanban_tasks")
      .select("id,project_id,status,placed,depends_on,updated_at,assigned_to,card_type")
      .in("project_id", projectIds);

    const cardsByProject: Record<string, any[]> = {};
    for (const c of (cards || [])) {
      const pid = (c as any).project_id;
      (cardsByProject[pid] ||= []).push(c);
    }

    /* compute blocked status per card — a card is blocked if it has
       unmet dependencies (any depends_on entry whose status is not
       shipped/measured/done). Build a fast lookup by id. */
    const cardById: Record<string, any> = {};
    for (const c of (cards || [])) cardById[(c as any).id] = c;
    const isTerminal = (s: string) => s === "shipped" || s === "measured" || s === "done";
    const isCardBlocked = (c: any): boolean => {
      const deps = Array.isArray(c?.depends_on) ? c.depends_on : [];
      if (!deps.length) return false;
      return deps.some((id: string) => {
        const dep = cardById[id];
        if (!dep) return false;                 /* unknown dep = treat as resolved */
        return !isTerminal(String(dep.status || ""));
      });
    };

    /* ── 4. shipments per project — counts in the current calendar month ── */
    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const { data: ships } = await db().from("card_shipments")
      .select("project_id,shipped_at,post_captured_at,baseline_captured_at,card_id")
      .in("project_id", projectIds)
      .gte("shipped_at", monthStart.toISOString());
    const shipsByProject: Record<string, any[]> = {};
    for (const s of (ships || [])) {
      const pid = (s as any).project_id;
      (shipsByProject[pid] ||= []).push(s);
    }

    /* ── ripe-unmeasured shipments (14+ days old, not yet measured) ──
       Separate query because we want this across all time, not just this month. */
    const ripeBefore = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data: ripeShips } = await db().from("card_shipments")
      .select("project_id,shipped_at,card_id")
      .in("project_id", projectIds)
      .is("post_captured_at", null)
      .lt("shipped_at", ripeBefore);
    const ripeByProject: Record<string, number> = {};
    for (const s of (ripeShips || [])) {
      const pid = (s as any).project_id;
      ripeByProject[pid] = (ripeByProject[pid] || 0) + 1;
    }

    /* ── 5. alerts per project — only open + acknowledged ── */
    const { data: alerts } = await db().from("project_alerts")
      .select("project_id,alert_type,severity,status,created_at")
      .in("project_id", projectIds)
      .in("status", ["open", "acknowledged"]);
    const alertsByProject: Record<string, any[]> = {};
    for (const a of (alerts || [])) {
      const pid = (a as any).project_id;
      (alertsByProject[pid] ||= []).push(a);
    }

    /* ── 6. suggestions per project — pending only ── */
    const { data: suggestions } = await db().from("card_suggestions")
      .select("project_id,created_at,priority")
      .in("project_id", projectIds)
      .eq("status", "pending");
    const suggestionsByProject: Record<string, number> = {};
    for (const s of (suggestions || [])) {
      const pid = (s as any).project_id;
      suggestionsByProject[pid] = (suggestionsByProject[pid] || 0) + 1;
    }

    /* ── 7. integration status per project — GSC + GA4 last pull ── */
    const { data: integrations } = await db().from("project_integrations")
      .select("project_id,provider,resource_id,last_pull_at,last_pull_status")
      .in("project_id", projectIds);
    const integByProject: Record<string, { gsc?: any; ga4?: any }> = {};
    for (const i of (integrations || [])) {
      const pid = (i as any).project_id;
      const prov = (i as any).provider;
      (integByProject[pid] ||= {})[prov as "gsc" | "ga4"] = i;
    }

    /* ── 8. project_knowledge for goal + identity labels (light query) ──
       We only need a few fields per project for the row labels. */
    const { data: pkn } = await db().from("project_knowledge")
      .select("project_id,category,field_key,field_value")
      .in("project_id", projectIds)
      .in("category", ["goal", "identity", "commercial"])
      .in("field_key", [
        "primary_goal", "primary_goal_narrative",
        "client_name", "industry", "report_audience",
        "engagement_type",
      ]);
    const pknByProject: Record<string, Record<string, Record<string, string>>> = {};
    for (const k of (pkn || [])) {
      const r = k as any;
      const m = (pknByProject[r.project_id] ||= {});
      (m[r.category] ||= {})[r.field_key] = r.field_value || "";
    }

    /* ── 9. latest audit score per project ── */
    const { data: latestAudits } = await db().from("audit_reports")
      .select("project_id,overall_score,created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });
    const auditByProject: Record<string, { score: number; date: string }> = {};
    for (const a of (latestAudits || [])) {
      const pid = (a as any).project_id;
      if (auditByProject[pid]) continue;          /* keep only the first (most recent) */
      auditByProject[pid] = { score: (a as any).overall_score, date: (a as any).created_at };
    }

    /* ── 10. stitch everything together per project ────── */
    const rows: any[] = [];
    for (const p of projects) {
      const proj = p as any;
      const pid = proj.id;
      const projectCards = cardsByProject[pid] || [];
      const inProgress   = projectCards.filter((c: any) => c.placed && !isTerminal(c.status) && c.status !== "archived").length;
      const blocked      = projectCards.filter((c: any) => isCardBlocked(c) && !isTerminal(c.status)).length;
      const planned      = projectCards.filter((c: any) => c.status === "planned" || c.status === "todo").length;
      const shipped      = (shipsByProject[pid] || []).length;
      const ripe         = ripeByProject[pid] || 0;
      const alertList    = alertsByProject[pid] || [];
      const openAlerts   = alertList.filter((a: any) => a.status === "open").length;
      const critAlerts   = alertList.filter((a: any) => a.severity === "critical" && a.status === "open").length;
      const ackAlerts    = alertList.filter((a: any) => a.status === "acknowledged").length;
      const suggCount    = suggestionsByProject[pid] || 0;

      /* integration freshness — same 3-day threshold used elsewhere */
      const gsc = integByProject[pid]?.gsc;
      const ga4 = integByProject[pid]?.ga4;
      const daysSince = (iso?: string | null): number | null =>
        iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;
      const gscState: "live" | "stale" | "not_connected" =
        !gsc?.resource_id ? "not_connected" :
        (daysSince(gsc.last_pull_at) ?? 99) > 3 ? "stale" : "live";
      const ga4State: "live" | "stale" | "not_connected" =
        !ga4?.resource_id ? "not_connected" :
        (daysSince(ga4.last_pull_at) ?? 99) > 3 ? "stale" : "live";

      /* last activity = most recent kanban_tasks.updated_at on the project */
      const lastActivity = projectCards.length
        ? projectCards.map((c: any) => c.updated_at).filter(Boolean).sort().pop()
        : proj.last_analysis_at || proj.created_at;

      /* labels from knowledge map */
      const km = pknByProject[pid] || {};
      const clientName = km.identity?.client_name || clientById[proj.client_id]?.name || proj.name;
      const industry   = km.identity?.industry || "";
      const primaryGoal = km.goal?.primary_goal_narrative || km.goal?.primary_goal || "";

      /* ── compute the attention score ── */
      const attn = computeAttention({
        critAlerts, openAlerts, blocked, ripe, suggCount, gscState, ga4State,
      });

      rows.push({
        id: pid,
        name: proj.name,
        url:  proj.url,
        client_name:    clientName,
        industry,
        primary_goal:   primaryGoal,
        report_audience: km.goal?.report_audience || "",
        last_activity:  lastActivity,
        audit_score:    auditByProject[pid]?.score ?? null,
        audit_date:     auditByProject[pid]?.date  ?? null,
        counts: {
          in_progress: inProgress,
          planned,
          blocked,
          shipped_this_month: shipped,
          ripe_unmeasured: ripe,
          open_alerts: openAlerts,
          critical_alerts: critAlerts,
          acknowledged_alerts: ackAlerts,
          pending_suggestions: suggCount,
        },
        integrations: {
          gsc: { state: gscState, last_pull_at: gsc?.last_pull_at || null, property: gsc?.resource_id || null },
          ga4: { state: ga4State, last_pull_at: ga4?.last_pull_at || null, property: ga4?.resource_id || null },
        },
        attention: attn,
      });
    }

    /* sort by attention score descending — fire-first */
    rows.sort((a, b) => b.attention.score - a.attention.score);

    /* ── portfolio totals ── */
    const totals = {
      projects: rows.length,
      cards_in_progress:    rows.reduce((s, r) => s + r.counts.in_progress, 0),
      cards_planned:        rows.reduce((s, r) => s + r.counts.planned, 0),
      cards_blocked:        rows.reduce((s, r) => s + r.counts.blocked, 0),
      shipped_this_month:   rows.reduce((s, r) => s + r.counts.shipped_this_month, 0),
      ripe_unmeasured:      rows.reduce((s, r) => s + r.counts.ripe_unmeasured, 0),
      open_alerts:          rows.reduce((s, r) => s + r.counts.open_alerts, 0),
      critical_alerts:      rows.reduce((s, r) => s + r.counts.critical_alerts, 0),
      pending_suggestions:  rows.reduce((s, r) => s + r.counts.pending_suggestions, 0),
      projects_needing_attention: rows.filter((r) => r.attention.severity !== "calm").length,
      integrations: {
        gsc_live:  rows.filter((r) => r.integrations.gsc.state === "live").length,
        gsc_stale: rows.filter((r) => r.integrations.gsc.state === "stale").length,
        gsc_not:   rows.filter((r) => r.integrations.gsc.state === "not_connected").length,
        ga4_live:  rows.filter((r) => r.integrations.ga4.state === "live").length,
        ga4_stale: rows.filter((r) => r.integrations.ga4.state === "stale").length,
        ga4_not:   rows.filter((r) => r.integrations.ga4.state === "not_connected").length,
      },
    };

    /* attention list = projects with severity warn+ */
    const attention = rows
      .filter((r) => r.attention.severity !== "calm")
      .slice(0, 30);

    return {
      success: true,
      projects: rows,
      totals,
      attention,
      generated_at: new Date().toISOString(),
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "summary failed" };
  }
}

/* ── attention scoring helper ─────────────────────────────── */

function computeAttention(c: {
  critAlerts: number; openAlerts: number;
  blocked: number; ripe: number; suggCount: number;
  gscState: "live" | "stale" | "not_connected";
  ga4State: "live" | "stale" | "not_connected";
}): AttentionScore {
  const flags: string[] = [];
  let score = 0;
  /* widen the literal so TS doesn't narrow after each assignment */
  let severity: AttentionScore["severity"] = "calm" as AttentionScore["severity"];

  const escalate = (target: AttentionScore["severity"]) => {
    const order: AttentionScore["severity"][] = ["calm", "info", "warn", "critical"];
    if (order.indexOf(target) > order.indexOf(severity)) severity = target;
  };

  if (c.critAlerts > 0) {
    score += 100 * c.critAlerts;
    flags.push(`${c.critAlerts} critical alert${c.critAlerts === 1 ? "" : "s"}`);
    escalate("critical");
  }
  if (c.openAlerts > c.critAlerts) {
    const nonCrit = c.openAlerts - c.critAlerts;
    score += 25 * nonCrit;
    flags.push(`${nonCrit} open alert${nonCrit === 1 ? "" : "s"}`);
    escalate("warn");
  }
  if (c.blocked > 0) {
    score += 15 * c.blocked;
    flags.push(`${c.blocked} blocked card${c.blocked === 1 ? "" : "s"}`);
    escalate("warn");
  }
  if (c.ripe > 0) {
    score += 10 * c.ripe;
    flags.push(`${c.ripe} shipment${c.ripe === 1 ? "" : "s"} ready to measure`);
    escalate("info");
  }
  if (c.suggCount > 0) {
    score += 5 * c.suggCount;
    flags.push(`${c.suggCount} pending suggestion${c.suggCount === 1 ? "" : "s"}`);
    escalate("info");
  }
  if (c.gscState === "stale") {
    score += 8;
    flags.push("GSC stale");
    escalate("info");
  }
  if (c.ga4State === "stale") {
    score += 8;
    flags.push("GA4 stale");
    escalate("info");
  }

  return { score, flags, severity };
}

function emptyTotals() {
  return {
    projects: 0, cards_in_progress: 0, cards_planned: 0, cards_blocked: 0,
    shipped_this_month: 0, ripe_unmeasured: 0, open_alerts: 0,
    critical_alerts: 0, pending_suggestions: 0, projects_needing_attention: 0,
    integrations: { gsc_live: 0, gsc_stale: 0, gsc_not: 0, ga4_live: 0, ga4_stale: 0, ga4_not: 0 },
  };
}

/* ── dispatch ─────────────────────────────────────────────── */

export async function handleMissionControl(action: string, _body: any): Promise<any | null> {
  switch (action) {
    case "mc_summary": return mcSummary();
    default: return null;
  }
}
