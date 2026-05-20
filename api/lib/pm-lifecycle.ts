/* ════════════════════════════════════════════════════════════════
   api/lib/pm-lifecycle.ts
   The execution loop engine. Owns the card lifecycle beyond
   "done" — shipped events, attribution baselines, post-ship
   measurement, dependency blocking, and the per-card activity log.

   States (kanban_tasks.status):
     planned → in_progress → executed → reviewed → shipped → measured
     blocked  (computed, never stored — set by isBlocked() at read time)
     archived (terminal; carries an archive_reason)

   Transitions are guarded:
     - You can only ship when not blocked (unless force_ship_reason given)
     - Shipment writes baseline metrics + activity log entry
     - measured state lights up automatically once a post-ship metric
       snapshot exists for the affected URL
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";

/* ── states & transitions ─────────────────────────────────── */

export type Lifecycle =
  | "planned" | "in_progress" | "executed" | "reviewed"
  | "shipped" | "measured" | "blocked" | "archived"
  /* legacy values still seen on existing rows */
  | "todo"    | "doing"      | "done";

/** Allowed forward transitions. PM can always move backward (e.g. shipped → reviewed
 *  if they spot something wrong) but those are loose; we only enforce that you
 *  cannot skip beyond shipped without a shipment row. */
const FORWARD: Record<string, Lifecycle[]> = {
  planned:     ["in_progress", "archived"],
  todo:        ["in_progress", "planned", "archived"],
  in_progress: ["executed", "planned", "archived"],
  doing:       ["executed", "planned", "archived"],
  executed:    ["reviewed", "in_progress", "archived"],
  reviewed:    ["shipped", "executed", "archived"],
  done:        ["shipped", "reviewed", "archived"],
  shipped:     ["measured", "reviewed", "archived"],
  measured:    ["archived"],
  archived:    [],
  blocked:     [],
};

/* ── helpers ──────────────────────────────────────────────── */

const isTerminalShippedState = (s: string): boolean =>
  s === "shipped" || s === "measured" || s === "done";

async function logActivity(opts: {
  cardId: string; projectId: string;
  kind: string; fromState?: string; toState?: string;
  detail?: any; message: string; actor?: string;
}): Promise<void> {
  try {
    await db().from("card_activity").insert({
      card_id:    opts.cardId,
      project_id: opts.projectId,
      kind:       opts.kind,
      from_state: opts.fromState || null,
      to_state:   opts.toState || null,
      detail:     opts.detail || {},
      message:    opts.message || "",
      actor:      opts.actor || null,
    });
  } catch (e) {
    /* logging is best-effort — must not block the user action */
    console.error("[pm-lifecycle] activity log failed:", (e as any)?.message || e);
  }
}

/** Resolve dependency-blocker information for a card. */
async function resolveBlockers(card: any): Promise<{
  blockerIds: string[];
  blockers: Array<{ id: string; title: string; status: string }>;
  isBlocked: boolean;
}> {
  const deps = Array.isArray(card?.depends_on) ? card.depends_on : [];
  if (!deps.length) return { blockerIds: [], blockers: [], isBlocked: false };
  try {
    const { data } = await db().from("kanban_tasks")
      .select("id,title,status").in("id", deps);
    const rows = (data || []) as any[];
    const blockers = rows.filter((r) => !isTerminalShippedState(String(r.status || "")))
      .map((r) => ({ id: r.id, title: r.title, status: r.status }));
    return {
      blockerIds: rows.map((r) => r.id),
      blockers,
      isBlocked: blockers.length > 0,
    };
  } catch {
    return { blockerIds: deps, blockers: [], isBlocked: false };
  }
}

/* ── reader actions ───────────────────────────────────────── */

/** Get a card plus its computed lifecycle context (blockers, shipments, activity). */
export async function pmCardDetail(cardId: string): Promise<{
  success: boolean; error?: string;
  card?: any; blockers?: any[]; isBlocked?: boolean;
  shipments?: any[]; activity?: any[];
}> {
  if (!cardId) return { success: false, error: "cardId required" };
  try {
    const [{ data: card }, { data: shipments }, { data: activity }] = await Promise.all([
      db().from("kanban_tasks").select("*").eq("id", cardId).maybeSingle(),
      db().from("card_shipments").select("*").eq("card_id", cardId)
        .order("shipped_at", { ascending: false }),
      db().from("card_activity").select("*").eq("card_id", cardId)
        .order("created_at", { ascending: false }).limit(80),
    ]);
    if (!card) return { success: false, error: "card not found" };
    const { blockers, isBlocked } = await resolveBlockers(card);
    return {
      success: true,
      card, blockers, isBlocked,
      shipments: shipments || [],
      activity:  activity  || [],
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "fetch failed" };
  }
}

/** List the open shipments + blockers for a project (the board's lifecycle layer). */
export async function pmCardLifecycleMap(projectId: string): Promise<{
  success: boolean; error?: string;
  blockedByCard?: Record<string, { blockers: any[] }>;
  shipmentCountsByCard?: Record<string, number>;
}> {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const { data: cards } = await db().from("kanban_tasks").select("id,depends_on,status")
      .eq("project_id", projectId).limit(500);
    const { data: ships } = await db().from("card_shipments").select("card_id")
      .eq("project_id", projectId);

    /* index all cards by id so blocker lookups are local */
    const byId: Record<string, any> = {};
    for (const c of (cards || [])) byId[(c as any).id] = c;

    const blockedByCard: Record<string, { blockers: any[] }> = {};
    for (const c of (cards || [])) {
      const deps = Array.isArray((c as any).depends_on) ? (c as any).depends_on : [];
      if (!deps.length) continue;
      const blockers = deps.map((id: string) => byId[id])
        .filter((b: any) => b && !isTerminalShippedState(String(b.status || "")));
      if (blockers.length) blockedByCard[(c as any).id] = { blockers };
    }

    const shipmentCountsByCard: Record<string, number> = {};
    for (const s of (ships || [])) {
      const cid = (s as any).card_id;
      shipmentCountsByCard[cid] = (shipmentCountsByCard[cid] || 0) + 1;
    }
    return { success: true, blockedByCard, shipmentCountsByCard };
  } catch (e: any) {
    return { success: false, error: e?.message || "lifecycle map failed" };
  }
}

/* ── transitions ──────────────────────────────────────────── */

/** Move a card to a new lifecycle state (non-shipping transitions). */
export async function pmCardTransition(opts: {
  cardId: string; toState: Lifecycle;
  actor?: string; note?: string; archiveReason?: string;
}): Promise<{ success: boolean; error?: string; card?: any }> {
  if (!opts.cardId || !opts.toState) return { success: false, error: "cardId + toState required" };
  /* shipping has its own action with required side-effects */
  if (opts.toState === "shipped") return { success: false, error: "use pm_card_ship to ship" };
  if (opts.toState === "measured") return { success: false, error: "measured is set automatically" };
  if (opts.toState === "blocked")  return { success: false, error: "blocked is computed, not stored" };

  try {
    const { data: card } = await db().from("kanban_tasks").select("*")
      .eq("id", opts.cardId).maybeSingle();
    if (!card) return { success: false, error: "card not found" };
    const from = String((card as any).status || "planned");

    /* allow same-state nops silently */
    if (from === opts.toState) return { success: true, card };

    /* guard: only allow forward transitions in the table */
    const allowed = FORWARD[from] || [];
    if (!allowed.includes(opts.toState)) {
      return { success: false, error: `Cannot transition ${from} → ${opts.toState}` };
    }

    const update: any = { status: opts.toState, updated_at: new Date().toISOString() };
    if (opts.toState === "executed")  update.executed_at = new Date().toISOString();
    if (opts.toState === "reviewed")  update.verified_at = new Date().toISOString();
    if (opts.toState === "archived" && opts.archiveReason) {
      update.verify_notes = (card as any).verify_notes
        ? `${(card as any).verify_notes}\n[ARCHIVED] ${opts.archiveReason}`
        : `[ARCHIVED] ${opts.archiveReason}`;
    }

    const { data: updated, error } = await db().from("kanban_tasks")
      .update(update).eq("id", opts.cardId).select("*").single();
    if (error) return { success: false, error: error.message };

    await logActivity({
      cardId: opts.cardId, projectId: (card as any).project_id,
      kind: "state_change", fromState: from, toState: opts.toState,
      detail: { note: opts.note || null, archiveReason: opts.archiveReason || null },
      message: `Status: ${from} → ${opts.toState}${opts.note ? ` — ${opts.note}` : ""}`,
      actor: opts.actor,
    });
    return { success: true, card: updated };
  } catch (e: any) {
    return { success: false, error: e?.message || "transition failed" };
  }
}

/* ── shipping ─────────────────────────────────────────────── */

/** Read the current metrics relevant to a URL — clicks, position, sessions if available.
 *  Used to capture baseline at ship-time and to take post-ship measurements. */
async function captureMetricsForUrl(projectId: string, url: string): Promise<{
  values: Record<string, any>;
  capturedAt: string;
}> {
  const values: Record<string, any> = {};
  const capturedAt = new Date().toISOString();
  try {
    /* latest metrics snapshot for the project — this is project-level GSC/GA4 data */
    const { data: snap } = await db().from("metrics_snapshots").select("*")
      .eq("project_id", projectId)
      .order("captured_at", { ascending: false }).limit(1).maybeSingle();
    if (snap) {
      values.organic_sessions = (snap as any).organic_sessions;
      values.gsc_clicks       = (snap as any).gsc_clicks;
      values.gsc_impressions  = (snap as any).gsc_impressions;
      values.gsc_avg_position = (snap as any).gsc_avg_position;
      values.conversions      = (snap as any).conversions;
      values.audit_score      = (snap as any).audit_score;
      values.snapshot_id      = (snap as any).id;
    }
    /* per-page crawl data — captures page-level title/H1/schema/word-count
       so we can show "the page had X schema before, now has Y" */
    if (url) {
      const { data: page } = await db().from("crawled_pages").select("page_analysis,crawled_at")
        .eq("project_id", projectId).eq("url", url)
        .order("crawled_at", { ascending: false }).limit(1).maybeSingle();
      if (page && (page as any).page_analysis) {
        const p = (page as any).page_analysis;
        values.page_signals = {
          word_count:       p.word_count,
          schema_types:     p.schema_types,
          title_length:     p.title_length,
          structured_data_quality: p.structured_data_quality,
          geo_readiness:    p.geo_readiness,
          crawled_at:       (page as any).crawled_at,
        };
      }
    }
  } catch (e) {
    console.error("[pm-lifecycle] metrics capture failed:", (e as any)?.message || e);
  }
  return { values, capturedAt };
}

/** Ship a card. Captures baseline metrics, writes shipment row, transitions to 'shipped'.
 *  If the card is blocked (any dependency not yet shipped), requires a force-ship reason. */
export async function pmCardShip(opts: {
  cardId: string;
  affectedUrls?: string[];
  actualShippedUrl?: string;
  changesSummary: string;
  evidenceUrl?: string;
  forceShipReason?: string;
  actor?: string;
}): Promise<{ success: boolean; error?: string; shipment?: any; card?: any; wasBlocked?: boolean }> {
  if (!opts.cardId) return { success: false, error: "cardId required" };
  if (!opts.changesSummary?.trim())
    return { success: false, error: "changesSummary required — what shipped?" };
  try {
    const { data: card } = await db().from("kanban_tasks").select("*")
      .eq("id", opts.cardId).maybeSingle();
    if (!card) return { success: false, error: "card not found" };

    /* dependency check */
    const { blockers, isBlocked } = await resolveBlockers(card);
    if (isBlocked && !opts.forceShipReason?.trim()) {
      return {
        success: false,
        wasBlocked: true,
        error: `Card is blocked by ${blockers.length} dependency${blockers.length === 1 ? "" : "ies"}: ${blockers.map((b: any) => b.title).join(", ")}. Provide a force-ship reason to ship anyway.`,
      };
    }

    /* baseline capture — primary affected URL is the actual_shipped_url or first affected URL */
    const primaryUrl = opts.actualShippedUrl || (opts.affectedUrls || [])[0] || "";
    const projectId = (card as any).project_id;
    const baseline = await captureMetricsForUrl(projectId, primaryUrl);

    /* write the shipment row */
    const { data: shipment, error: shipErr } = await db().from("card_shipments").insert({
      card_id:             opts.cardId,
      project_id:          projectId,
      affected_urls:       opts.affectedUrls || [],
      actual_shipped_url:  primaryUrl || null,
      changes_summary:     opts.changesSummary.trim(),
      evidence_url:        opts.evidenceUrl || null,
      baseline_metrics:    baseline.values,
      baseline_captured_at: baseline.capturedAt,
      shipped_by:          opts.actor || null,
      force_ship_reason:   opts.forceShipReason?.trim() || null,
    }).select("*").single();
    if (shipErr) return { success: false, error: shipErr.message };

    /* transition the card */
    const fromState = String((card as any).status || "planned");
    const { data: updatedCard } = await db().from("kanban_tasks").update({
      status: "shipped", updated_at: new Date().toISOString(),
    }).eq("id", opts.cardId).select("*").single();

    /* activity */
    await logActivity({
      cardId: opts.cardId, projectId,
      kind: opts.forceShipReason ? "force_shipped" : "shipped",
      fromState, toState: "shipped",
      detail: {
        shipment_id: (shipment as any).id,
        urls: opts.affectedUrls,
        actual_url: primaryUrl,
        force_reason: opts.forceShipReason || null,
        evidence: opts.evidenceUrl || null,
      },
      message: opts.forceShipReason
        ? `Force-shipped (despite ${blockers.length} blocker${blockers.length === 1 ? "" : "s"}): ${opts.changesSummary.slice(0, 120)}`
        : `Shipped: ${opts.changesSummary.slice(0, 120)}`,
      actor: opts.actor,
    });

    /* dependent cards may now be unblocked — log on each that referenced this one */
    try {
      const { data: dependents } = await db().from("kanban_tasks")
        .select("id,project_id,title,depends_on")
        .eq("project_id", projectId)
        .contains("depends_on", [opts.cardId]);
      for (const d of (dependents || [])) {
        await logActivity({
          cardId:     (d as any).id,
          projectId:  (d as any).project_id,
          kind:       "dependency_cleared",
          detail:     { cleared_by: opts.cardId, cleared_title: (card as any).title },
          message:    `Dependency cleared — blocker "${(card as any).title}" shipped.`,
          actor:      "system",
        });
      }
    } catch { /* non-fatal */ }

    return { success: true, shipment, card: updatedCard };
  } catch (e: any) {
    return { success: false, error: e?.message || "ship failed" };
  }
}

/* ── measurement (attribution) ────────────────────────────── */

/** Take a post-ship measurement for one or all of a card's shipments.
 *  Captures current metrics + compares to baseline. Transitions card to 'measured'. */
export async function pmCardMeasure(opts: {
  cardId: string;
  shipmentId?: string;     // measure a specific shipment; omit to measure latest
  actor?: string;
}): Promise<{ success: boolean; error?: string; shipment?: any; lift?: any }> {
  if (!opts.cardId) return { success: false, error: "cardId required" };
  try {
    const { data: card } = await db().from("kanban_tasks").select("*")
      .eq("id", opts.cardId).maybeSingle();
    if (!card) return { success: false, error: "card not found" };

    /* find the shipment to measure */
    const shipQuery = db().from("card_shipments").select("*").eq("card_id", opts.cardId);
    const { data: ships } = opts.shipmentId
      ? await shipQuery.eq("id", opts.shipmentId)
      : await shipQuery.order("shipped_at", { ascending: false }).limit(1);
    const shipment = (ships || [])[0] as any;
    if (!shipment) return { success: false, error: "no shipment to measure" };

    const projectId = (card as any).project_id;
    const after = await captureMetricsForUrl(projectId, shipment.actual_shipped_url || "");

    /* compute lift for the headline metrics where both sides exist */
    const base = shipment.baseline_metrics || {};
    const lift: Record<string, number | null> = {};
    for (const k of ["gsc_clicks", "gsc_impressions", "organic_sessions", "conversions"]) {
      if (base[k] != null && after.values[k] != null) {
        lift[k] = Number(after.values[k]) - Number(base[k]);
      }
    }
    /* position improvement is negative delta — lower = better */
    if (base.gsc_avg_position != null && after.values.gsc_avg_position != null) {
      lift.gsc_avg_position = Number(after.values.gsc_avg_position) - Number(base.gsc_avg_position);
    }

    const { data: updated, error } = await db().from("card_shipments").update({
      post_metrics:      after.values,
      post_captured_at:  after.capturedAt,
    }).eq("id", shipment.id).select("*").single();
    if (error) return { success: false, error: error.message };

    /* transition card to measured (best-effort — don't fail measurement on transition error) */
    try {
      const fromState = String((card as any).status || "");
      if (FORWARD[fromState]?.includes("measured")) {
        await db().from("kanban_tasks").update({ status: "measured" })
          .eq("id", opts.cardId);
      }
    } catch { /* non-fatal */ }

    await logActivity({
      cardId: opts.cardId, projectId, kind: "measured",
      detail: { shipment_id: shipment.id, lift },
      message: `Measured — clicks Δ ${lift.gsc_clicks ?? "n/a"}, position Δ ${lift.gsc_avg_position ?? "n/a"}`,
      actor: opts.actor || "system",
    });
    return { success: true, shipment: updated, lift };
  } catch (e: any) {
    return { success: false, error: e?.message || "measure failed" };
  }
}

/* ── reporting: shipped cards + lift in a period ──────────── */

/** Build the "Measured impact this period" data — shipped cards in range with their lift.
 *  Used by the report engine as the data behind the measured_impact block. */
export async function pmShippedInPeriod(
  projectId: string, periodStart: string, periodEnd: string,
): Promise<{ success: boolean; rows?: any[]; error?: string }> {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const start = periodStart ? new Date(periodStart).toISOString() : new Date(0).toISOString();
    const end   = periodEnd   ? new Date(new Date(periodEnd).getTime() + 86_400_000).toISOString() : new Date().toISOString();
    const { data: ships } = await db().from("card_shipments").select("*")
      .eq("project_id", projectId)
      .gte("shipped_at", start).lte("shipped_at", end)
      .order("shipped_at", { ascending: false });
    if (!ships || !ships.length) return { success: true, rows: [] };

    const cardIds = Array.from(new Set(ships.map((s: any) => s.card_id)));
    const { data: cards } = await db().from("kanban_tasks").select("id,title,card_type,priority")
      .in("id", cardIds);
    const cardById: Record<string, any> = {};
    for (const c of (cards || [])) cardById[(c as any).id] = c;

    const rows = ships.map((s: any) => {
      const c = cardById[s.card_id] || {};
      const base = s.baseline_metrics || {};
      const post = s.post_metrics || {};
      const liftClicks   = (base.gsc_clicks != null && post.gsc_clicks != null) ? Number(post.gsc_clicks) - Number(base.gsc_clicks) : null;
      const liftPosition = (base.gsc_avg_position != null && post.gsc_avg_position != null) ? Number(post.gsc_avg_position) - Number(base.gsc_avg_position) : null;
      return {
        shipped_at:      s.shipped_at,
        card_title:      c.title || "(card removed)",
        card_type:       c.card_type || "",
        priority:        c.priority || "",
        url:             s.actual_shipped_url || (s.affected_urls?.[0] || ""),
        changes:         s.changes_summary,
        evidence_url:    s.evidence_url,
        measured:        !!s.post_captured_at,
        baseline_clicks: base.gsc_clicks ?? null,
        post_clicks:     post.gsc_clicks ?? null,
        lift_clicks:     liftClicks,
        baseline_position: base.gsc_avg_position ?? null,
        post_position:   post.gsc_avg_position ?? null,
        lift_position:   liftPosition,
        force_shipped:   !!s.force_ship_reason,
      };
    });
    return { success: true, rows };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

/* ── cron jobs ────────────────────────────────────────────── */

/**
 * Daily cron jobs for the execution loop:
 *
 * JOB A — Snapshot active projects.
 *   A project is "active" if it has cards updated, audits run, or shipments
 *   in the last 60 days. These get a metric snapshot daily so trend charts
 *   populate over time without manual button-clicking.
 *
 * JOB B — Auto-measure ripe shipments.
 *   A shipment with a baseline 14+ days old that hasn't been measured yet
 *   is "ripe". We measure it automatically, capturing post-ship metrics and
 *   computing lift. The card transitions to "measured" automatically.
 *
 * Both jobs are best-effort: errors on one project don't stop the others.
 * Returns a summary suitable for cron monitoring.
 */
export async function pmCronTick(): Promise<{
  success: boolean;
  snapshotted: number;
  measured: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let snapshotted = 0;
  let measured = 0;
  let skipped = 0;

  /* ── JOB A: snapshot active projects ── */
  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
    /* find active project ids — any project with a card updated recently
       (this is the cheapest signal of activity) */
    const { data: activeRows } = await db().from("kanban_tasks")
      .select("project_id").gt("updated_at", sixtyDaysAgo).limit(2000);
    const activeIds = Array.from(new Set((activeRows || [])
      .map((r: any) => r?.project_id).filter(Boolean)));

    /* don't snapshot the same project twice in one day — check last snapshot age */
    const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();

    for (const pid of activeIds) {
      try {
        const { data: recent } = await db().from("metrics_snapshots")
          .select("id").eq("project_id", pid).gt("captured_at", oneDayAgo).limit(1);
        if (recent && recent.length) { skipped++; continue; }

        /* dynamic import keeps pm-reports out of the lifecycle's load path
           unless the cron is actually running */
        const { captureMetricsSnapshot } = await import("./pm-reports.js");
        const r = await captureMetricsSnapshot({ projectId: pid, source: "cron" });
        if (r.success) snapshotted++;
      } catch (e: any) {
        errors.push(`snapshot ${pid}: ${e?.message || "fail"}`);
      }
    }
  } catch (e: any) {
    errors.push(`JOB A: ${e?.message || "fail"}`);
  }

  /* ── JOB B: auto-measure ripe shipments (14+ days, unmeasured) ── */
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data: ripe } = await db().from("card_shipments")
      .select("id,card_id,project_id,shipped_at")
      .is("post_captured_at", null)
      .lt("shipped_at", fourteenDaysAgo)
      .order("shipped_at", { ascending: true })
      .limit(50);

    for (const s of (ripe || [])) {
      try {
        const r = await pmCardMeasure({
          cardId: (s as any).card_id,
          shipmentId: (s as any).id,
          actor: "system_cron",
        });
        if (r.success) measured++;
        else errors.push(`measure ${(s as any).id}: ${r.error || "fail"}`);
      } catch (e: any) {
        errors.push(`measure ${(s as any).id}: ${e?.message || "fail"}`);
      }
    }
  } catch (e: any) {
    errors.push(`JOB B: ${e?.message || "fail"}`);
  }

  return {
    success: errors.length === 0,
    snapshotted, measured, skipped, errors,
  };
}

/* ── dispatch ─────────────────────────────────────────────── */

export async function handlePmLifecycle(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "pm_card_detail":         return pmCardDetail(body.cardId);
    case "pm_card_lifecycle_map":  return pmCardLifecycleMap(body.projectId);
    case "pm_card_transition":     return pmCardTransition(body);
    case "pm_card_ship":           return pmCardShip(body);
    case "pm_card_measure":        return pmCardMeasure(body);
    case "pm_shipped_in_period":   return pmShippedInPeriod(body.projectId, body.periodStart || "", body.periodEnd || "");
    default: return null;
  }
}
