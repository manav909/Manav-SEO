/* ════════════════════════════════════════════════════════════════
   api/lib/pm-reports.ts
   The client-report engine. Assembles every available block for a
   project + period (narrative slots, KPIs, charts, tables, embedded
   audit/crawl visuals), then on the PM's selection generates the
   narrative blocks with slider-tuned prompts and persists the
   result as a shareable report.

   Used by the PM module's Reports tab. The engine is intentionally
   composable — each block carries its own type, title, and data,
   so the editor and the public view both read the same structure.
════════════════════════════════════════════════════════════════ */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db.js";

const MODEL = "claude-sonnet-4-6";

function ai(): Anthropic { return new Anthropic(); }

function parseJSON(raw: string): any {
  try {
    const clean = raw.replace(/^```[a-z]*\n?/gm, "").replace(/^```\s*$/gm, "").trim();
    return JSON.parse(clean);
  } catch { return null; }
}

/* ── helpers ──────────────────────────────────────────────── */

const N = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,%$]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/* Build 12.17 — Extract a numeric metric from a JSON-encoded summary
   object stored in project_knowledge. The Build 12.16 GSC + GA4 pulls
   write the AI Overview / AI platform summaries as stringified JSON.
   Returns null when the row is missing, malformed, or the requested
   field is absent. Safe to call with any input. */
function extractAiOverviewMetric(jsonStr: any, field: string): number | null {
  if (!jsonStr) return null;
  try {
    const obj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    if (obj && typeof obj === 'object') {
      const v = obj[field];
      if (v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
  } catch { /* malformed JSON — treat as null */ }
  return null;
}

function genToken(): string {
  /* unguessable share token — 32 hex chars */
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ── metric snapshotting ──────────────────────────────────── */

export interface SnapshotOptions {
  projectId: string;
  source?:   "data_room_save" | "report_generation" | "manual" | "cron";
  /* optional explicit values — if omitted, read current Data Room */
  values?:   Record<string, number | null>;
}

/**
 * Capture a single point in the project's metrics time-series.
 * Pulls current values from the Data Room (project_knowledge) unless
 * the caller supplies explicit values.
 */
export async function captureMetricsSnapshot(opts: SnapshotOptions): Promise<{
  success: boolean; id?: string; error?: string;
}> {
  if (!opts.projectId) return { success: false, error: "projectId required" };
  try {
    let values = opts.values || {};
    if (!opts.values) {
      const { data: kn } = await db().from("project_knowledge")
        .select("category,field_key,field_value").eq("project_id", opts.projectId);
      const km: Record<string, Record<string, string>> = {};
      for (const k of (kn || [])) {
        if (!k?.category) continue;
        (km[k.category] ||= {})[k.field_key] = k.field_value || "";
      }
      values = {
        organic_sessions: N(km.analytics?.organic_sessions_monthly),
        gsc_clicks:       N(km.analytics?.gsc_total_clicks),
        gsc_impressions:  N(km.analytics?.gsc_total_impressions),
        gsc_avg_position: N(km.analytics?.gsc_avg_position),
        conversions:      N(km.analytics?.conversions_monthly),
        bounce_rate:      N(km.analytics?.bounce_rate),
        pages_indexed:    N(km.technical?.pages_indexed),
        crawl_errors:     N(km.technical?.crawl_errors),
        /* Build 12.17 — AI Overview + AI platform referrals as first-class
           snapshot metrics. Stored on metrics_snapshots so they appear in
           reports, dashboards, and chart engines alongside classic KPIs.
           Pulled from the summary objects produced by Build 12.16 GSC and
           GA4 pulls; reduce to flat numbers for snapshot storage. */
        gsc_ai_overview_impressions:  extractAiOverviewMetric(km.analytics?.gsc_ai_overview_summary, 'total_impressions'),
        gsc_ai_overview_clicks:       extractAiOverviewMetric(km.analytics?.gsc_ai_overview_summary, 'total_clicks'),
        ga4_ai_referral_sessions:     extractAiOverviewMetric(km.analytics?.ga4_ai_platform_summary, 'sessions'),
        ga4_ai_referral_conversions:  extractAiOverviewMetric(km.analytics?.ga4_ai_platform_summary, 'conversions'),
        ga4_ai_referral_platforms:    extractAiOverviewMetric(km.analytics?.ga4_ai_platform_summary, 'source_count'),
      };
    }

    /* current audit score — latest row */
    const { data: latestAudit } = await db().from("audit_reports")
      .select("overall_score").eq("project_id", opts.projectId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latestAudit && (latestAudit as any).overall_score != null) {
      values.audit_score = N((latestAudit as any).overall_score);
    }

    /* don't write an empty row */
    const hasAny = Object.values(values).some((v) => v != null);
    if (!hasAny) return { success: false, error: "no metrics to snapshot" };

    const { data, error } = await db().from("metrics_snapshots").insert({
      project_id: opts.projectId,
      source:     opts.source || "manual",
      ...values,
    }).select("id").single();
    if (error) return { success: false, error: error.message };
    return { success: true, id: (data as any)?.id };
  } catch (e: any) {
    return { success: false, error: e?.message || "snapshot failed" };
  }
}

/* ── data assembly: every block a project COULD include ───── */

export interface ReportBlock {
  id:       string;
  type:     "narrative" | "kpi" | "chart" | "table" | "matrix" | "embed";
  title:    string;
  /* narrative blocks carry generated text; data blocks carry structured data */
  content?: string;
  data?:    any;
  /* metadata for the picker UI */
  category: "summary" | "delivery" | "performance" | "competitive" | "next";
  available: boolean;     // false = no underlying data; greyed in picker
  hint?:    string;        // why the block matters
}

/** Build the catalog of every block available for this project + period. */
export async function buildReportCatalog(
  projectId: string, periodStart: string, periodEnd: string,
): Promise<{ catalog: ReportBlock[]; rawData: any }> {
  /* Pull every source that could feed a block */
  const [{ data: proj }, { data: kn }, { data: cards }, { data: audits },
         { data: snaps }, { data: crawled }, { data: integrations }] = await Promise.all([
    db().from("projects").select("*").eq("id", projectId).maybeSingle(),
    db().from("project_knowledge").select("category,field_key,field_value").eq("project_id", projectId),
    db().from("kanban_tasks").select("*").eq("project_id", projectId)
      .order("updated_at", { ascending: false }).limit(200),
    db().from("audit_reports").select("*").eq("project_id", projectId)
      .order("created_at", { ascending: false }).limit(10),
    db().from("metrics_snapshots").select("*").eq("project_id", projectId)
      .order("captured_at", { ascending: true }).limit(200),
    db().from("crawled_pages").select("url,page_analysis,crawled_at").eq("project_id", projectId)
      .order("crawled_at", { ascending: false }).limit(40),
    db().from("project_integrations").select("provider,resource_id,last_pull_at,last_pull_status")
      .eq("project_id", projectId),
  ]);

  /* GSC + GA4 freshness signals — calibrate the AI narrative's confidence */
  const gscIntegration = (integrations || []).find((i: any) => i.provider === "gsc") as any;
  let gscStatus: "live" | "stale" | "not_connected" = "not_connected";
  let gscDaysSincePull: number | null = null;
  if (gscIntegration?.resource_id) {
    if (gscIntegration.last_pull_at) {
      gscDaysSincePull = Math.floor((Date.now() - new Date(gscIntegration.last_pull_at).getTime()) / 86_400_000);
      gscStatus = gscDaysSincePull <= 3 ? "live" : "stale";
    } else {
      gscStatus = "stale";
    }
  }

  const ga4Integration = (integrations || []).find((i: any) => i.provider === "ga4") as any;
  let ga4Status: "live" | "stale" | "not_connected" = "not_connected";
  let ga4DaysSincePull: number | null = null;
  if (ga4Integration?.resource_id) {
    if (ga4Integration.last_pull_at) {
      ga4DaysSincePull = Math.floor((Date.now() - new Date(ga4Integration.last_pull_at).getTime()) / 86_400_000);
      ga4Status = ga4DaysSincePull <= 3 ? "live" : "stale";
    } else {
      ga4Status = "stale";
    }
  }

  /* group Data Room values by category */
  const km: Record<string, Record<string, string>> = {};
  for (const k of (kn || [])) {
    if (!k?.category) continue;
    (km[k.category] ||= {})[k.field_key] = k.field_value || "";
  }

  /* filter to the period for cards (use executed_at first, fall back to updated_at) */
  const pStart = periodStart ? new Date(periodStart).getTime() : 0;
  const pEnd   = periodEnd   ? new Date(periodEnd).getTime() + 86_400_000 : Date.now();
  const inPeriod = (a: any) => {
    const t = new Date(a?.executed_at || a?.verified_at || a?.updated_at || 0).getTime();
    return t >= pStart && t <= pEnd;
  };
  const cardsInPeriod = (cards || []).filter(inPeriod);
  const cardsDelivered = cardsInPeriod.filter((c: any) => c.status === "done" || c.verified_at);
  const cardsInProgress = (cards || []).filter((c: any) => c.status === "doing");
  const cardsPlanned = (cards || []).filter((c: any) => c.status === "todo" && c.placed);

  /* latest two audits (for delta) */
  const latestAudit = (audits || [])[0] || null;
  const prevAudit   = (audits || [])[1] || null;

  /* current vs previous KPI: take last snapshot and one ~30 days prior */
  const lastSnap = (snaps || []).length ? (snaps as any[])[snaps!.length - 1] : null;
  const prevSnap = (snaps || []).length > 1
    ? (snaps as any[]).slice().reverse().find((s, i, arr) => i > 0 &&
        (new Date(arr[0].captured_at).getTime() - new Date(s.captured_at).getTime()) > 25 * 86_400_000)
        || (snaps as any[])[0]
    : null;

  const kpiTile = (key: string, label: string, format: "int" | "pct" | "dec" = "int"): ReportBlock => {
    const cur = lastSnap?.[key];
    const prev = prevSnap?.[key];
    const delta = (cur != null && prev != null) ? cur - prev : null;
    return {
      id: `kpi:${key}`, type: "kpi", title: label, category: "performance",
      available: cur != null,
      data: { current: cur, previous: prev, delta, format },
      hint: prev != null ? "Current vs ~30 days prior" : "Current value (no prior snapshot to compare)",
    };
  };

  /* assemble the catalog */
  const catalog: ReportBlock[] = [
    /* ── Narrative blocks (always available — AI writes them) ── */
    { id: "narr:exec_summary", type: "narrative", title: "Executive summary",
      category: "summary", available: true,
      hint: "AI-written headline tuned to your tone sliders." },
    { id: "narr:work_delivered", type: "narrative", title: "Work delivered this period",
      category: "delivery", available: true,
      hint: "Summarised from completed cards." },
    { id: "narr:performance", type: "narrative", title: "Performance signals",
      category: "performance", available: true,
      hint: "What moved, what didn't — calibrated to your confidence slider." },
    { id: "narr:whats_next", type: "narrative", title: "What's next",
      category: "next", available: true,
      hint: "Upcoming cards + strategic rationale." },
    { id: "narr:pm_note", type: "narrative", title: "PM note",
      category: "summary", available: true,
      hint: "Your custom opener/closer, if you provided one in PM context." },

    /* ── KPI tiles ── */
    kpiTile("organic_sessions", "Organic sessions"),
    kpiTile("gsc_clicks",       "GSC clicks"),
    kpiTile("gsc_impressions",  "GSC impressions"),
    kpiTile("gsc_avg_position", "Avg position", "dec"),
    kpiTile("conversions",      "Conversions"),
    kpiTile("bounce_rate",      "Bounce rate", "pct"),
    kpiTile("pages_indexed",    "Pages indexed"),
    kpiTile("audit_score",      "Audit score"),
    kpiTile("crawl_errors",     "Crawl errors"),

    /* ── Charts (time-series from snapshots) ── */
    {
      id: "chart:sessions", type: "chart", title: "Organic sessions over time",
      category: "performance",
      available: (snaps || []).filter((s: any) => s.organic_sessions != null).length >= 2,
      data: { series: (snaps || []).map((s: any) => ({ t: s.captured_at, v: s.organic_sessions })).filter((p: any) => p.v != null), key: "Sessions" },
      hint: "Needs ≥2 snapshots — each Data Room save / report generation adds one.",
    },
    {
      id: "chart:gsc_clicks", type: "chart", title: "GSC clicks over time",
      category: "performance",
      available: (snaps || []).filter((s: any) => s.gsc_clicks != null).length >= 2,
      data: { series: (snaps || []).map((s: any) => ({ t: s.captured_at, v: s.gsc_clicks })).filter((p: any) => p.v != null), key: "Clicks" },
    },
    {
      id: "chart:position", type: "chart", title: "Average position over time",
      category: "performance",
      available: (snaps || []).filter((s: any) => s.gsc_avg_position != null).length >= 2,
      data: { series: (snaps || []).map((s: any) => ({ t: s.captured_at, v: s.gsc_avg_position })).filter((p: any) => p.v != null), key: "Avg position", invertY: true },
      hint: "Lower position = better.",
    },
    {
      id: "chart:audit_score", type: "chart", title: "Audit score trend",
      category: "performance",
      available: (audits || []).length >= 2,
      data: { series: (audits || []).slice().reverse().map((a: any) => ({ t: a.created_at, v: a.overall_score })).filter((p: any) => p.v != null), key: "Audit score" },
    },
    {
      id: "chart:cards_per_week", type: "chart", title: "Cards completed per week",
      category: "delivery",
      available: cardsDelivered.length > 0,
      data: (() => {
        const weeks: Record<string, number> = {};
        for (const c of cardsDelivered) {
          const t = new Date(c.executed_at || c.verified_at || c.updated_at);
          const weekStart = new Date(t); weekStart.setDate(t.getDate() - t.getDay());
          const k = weekStart.toISOString().slice(0, 10);
          weeks[k] = (weeks[k] || 0) + 1;
        }
        const series = Object.entries(weeks).sort(([a],[b]) => a.localeCompare(b))
          .map(([t, v]) => ({ t, v }));
        return { series, key: "Cards", barChart: true };
      })(),
    },
    {
      id: "chart:cards_by_type", type: "chart", title: "Cards by type",
      category: "delivery",
      available: cardsDelivered.length > 0,
      data: (() => {
        const types: Record<string, number> = {};
        for (const c of cardsDelivered) types[c.card_type || "custom"] = (types[c.card_type || "custom"] || 0) + 1;
        return { categories: Object.entries(types).map(([name, value]) => ({ name, value })), pieChart: true };
      })(),
    },

    /* ── Tables ── */
    {
      id: "table:cards_delivered", type: "table", title: "Cards delivered this period",
      category: "delivery",
      available: cardsDelivered.length > 0,
      data: {
        columns: ["Title", "Type", "Priority", "Completed", "Verified"],
        rows: cardsDelivered.slice(0, 50).map((c: any) => ({
          title: c.title, type: c.card_type, priority: c.priority,
          completed: c.executed_at ? new Date(c.executed_at).toLocaleDateString("en-GB") : "—",
          verified: c.verified_at ? "Yes" : "No",
          output_excerpt: typeof c.output === "string" ? c.output.slice(0, 240) : "",
        })),
      },
    },
    {
      id: "table:cards_in_progress", type: "table", title: "In progress",
      category: "delivery",
      available: cardsInProgress.length > 0,
      data: {
        columns: ["Title", "Type", "Priority", "Week"],
        rows: cardsInProgress.slice(0, 30).map((c: any) => ({
          title: c.title, type: c.card_type, priority: c.priority, week: c.week,
        })),
      },
    },
    {
      id: "table:cards_planned", type: "table", title: "Planned next",
      category: "next",
      available: cardsPlanned.length > 0,
      data: {
        columns: ["Title", "Type", "Priority", "Week"],
        rows: cardsPlanned.slice(0, 30).map((c: any) => ({
          title: c.title, type: c.card_type, priority: c.priority, week: c.week,
        })),
      },
    },

    /* ── Matrix (audit + crawl) ── */
    {
      id: "matrix:audit_findings", type: "matrix", title: "Latest audit findings",
      category: "performance",
      available: !!latestAudit?.sections,
      data: latestAudit ? {
        date: latestAudit.created_at, score: latestAudit.overall_score,
        previous_score: prevAudit?.overall_score ?? null,
        synthesis: (latestAudit as any).sections?.synthesis || {},
      } : null,
    },
    {
      id: "matrix:competitive", type: "matrix", title: "Competitive comparison",
      category: "competitive",
      available: !!(proj as any)?.crawl_comparison,
      data: (proj as any)?.crawl_comparison || null,
      hint: "From the latest crawl in the PM Requirements tab.",
    },
  ];

  /* ── Measured impact (Phase B — execution loop) ──
     Async block: built outside the array literal so all promises are
     resolved cleanly. Lists shipped cards in the period with their
     ship-time vs post-ship metrics, plus measured/unmeasured status. */
  let shippedRows: any[] = [];
  try {
    const { pmShippedInPeriod } = await import("./pm-lifecycle.js");
    const r = await pmShippedInPeriod(projectId, periodStart, periodEnd);
    shippedRows = (r.success && r.rows) ? r.rows : [];
    const measuredCount = shippedRows.filter((x: any) => x.measured).length;
    catalog.push({
      id: "table:measured_impact", type: "table",
      title: "Measured impact — shipped this period",
      category: "delivery",
      available: shippedRows.length > 0,
      data: {
        columns: ["Shipped", "Card", "Type", "URL", "Δ clicks", "Δ position", "Evidence"],
        rows: shippedRows.map((x: any) => ({
          shipped:    new Date(x.shipped_at).toLocaleDateString("en-GB"),
          title:      x.card_title + (x.force_shipped ? " (force-shipped)" : ""),
          type:       x.card_type,
          url:        x.url || "—",
          d_clicks:   x.lift_clicks != null ? (x.lift_clicks > 0 ? `+${x.lift_clicks}` : String(x.lift_clicks)) : (x.measured ? "0" : "—"),
          d_position: x.lift_position != null ? (x.lift_position < 0 ? x.lift_position.toFixed(1) : `+${x.lift_position.toFixed(1)}`) : (x.measured ? "0" : "—"),
          evidence:   x.evidence_url || "",
        })),
        summary: shippedRows.length
          ? `${shippedRows.length} card${shippedRows.length === 1 ? "" : "s"} shipped, ${measuredCount} with measurements`
          : "",
      },
      hint: "Each row is a real shipment with baseline & post-ship metrics. — means measurement pending.",
    });
  } catch (e) {
    /* lifecycle data is best-effort — skipping the block is fine if it fails */
    console.error("[pm-reports] measured_impact block failed:", (e as any)?.message || e);
  }

  return {
    catalog,
    rawData: {
      project: proj, projectKnowledge: km,
      cardsDelivered, cardsInProgress, cardsPlanned,
      latestAudit, prevAudit, lastSnap, prevSnap, crawled,
      shippedRows,
      gscStatus, gscDaysSincePull,
      ga4Status, ga4DaysSincePull,
    },
  };
}

/* ── narrative generation: slider-tuned AI prompts ─────────── */

export interface Sliders {
  tone?:           number;  // 0=casual → 100=formal
  technicalDepth?: number;  // 0=plain → 100=technical
  confidence?:     number;  // 0=cautious → 100=confident
  emotion?:        number;  // 0=reserved → 100=warm
  length?:         number;  // 0=brief → 100=comprehensive
}

export interface PmContext {
  emphasize?:  string;
  downplay?:   string;
  mood?:       "steady" | "launching" | "under_pressure" | "celebrating" | "";
  customNote?: string;
}

function describeSlider(value: number | undefined, left: string, right: string): string {
  const v = typeof value === "number" ? value : 50;
  if (v < 20) return `very ${left}`;
  if (v < 40) return `mostly ${left}`;
  if (v < 60) return `balanced ${left}/${right}`;
  if (v < 80) return `mostly ${right}`;
  return `very ${right}`;
}

function styleBlock(sl: Sliders, ctx: PmContext): string {
  const lines = [
    "STYLE — write to these settings:",
    `- Tone: ${describeSlider(sl.tone, "casual", "formal")}`,
    `- Technical depth: ${describeSlider(sl.technicalDepth, "plain-English", "technical with SEO terminology")}`,
    `- Confidence: ${describeSlider(sl.confidence, "cautious and hedged", "definitive and confident")}`,
    `- Emotion: ${describeSlider(sl.emotion, "reserved and matter-of-fact", "warm and acknowledging")}`,
    `- Length: ${describeSlider(sl.length, "brief — one short paragraph max", "comprehensive — multiple paragraphs with detail")}`,
  ];
  if (ctx.emphasize)  lines.push(`PM WANTS YOU TO EMPHASIZE: ${ctx.emphasize}`);
  if (ctx.downplay)   lines.push(`PM WANTS YOU TO DOWNPLAY: ${ctx.downplay}`);
  if (ctx.mood)       lines.push(`CLIENT MOOD/SITUATION: ${ctx.mood}`);
  return lines.join("\n");
}

function projectContextBlock(rawData: any, periodStart: string, periodEnd: string): string {
  const p = rawData.project || {};
  const km = rawData.projectKnowledge || {};

  /* compact line helper — emits only when value exists */
  const ln = (label: string, value?: string): string =>
    value && String(value).trim() ? `${label}: ${String(value).trim()}` : "";

  /* Data Room V2 — feed identity, audience, content, history, commercial
     into the narrative builder. Every line is conditional on data being
     present, so an empty Data Room produces a minimal prompt and a full
     one produces a deeply calibrated prompt. */
  const identityBlock = [
    ln("CLIENT", km.identity?.client_name),
    ln("INDUSTRY", [km.identity?.industry, km.identity?.industry_specific].filter(Boolean).join(" — ") || undefined),
    ln("MODEL", [km.identity?.business_model, km.identity?.lifecycle_stage].filter(Boolean).join(", ") || undefined),
    ln("OFFERING", km.identity?.primary_offering),
    ln("UVP", km.identity?.unique_value_prop),
    ln("MARKETS", km.identity?.geographic_markets),
  ].filter(Boolean);

  const audienceBlock = [
    ln("ICP", km.audience?.ideal_customer_profile),
    ln("PRIMARY PERSONA", km.audience?.persona_1_name),
    ln("FUNNEL FOCUS", km.audience?.funnel_focus),
    ln("POSITIONING", km.audience?.positioning_statement),
  ].filter(Boolean);

  const contentBlock = [
    ln("BRAND VOICE", km.content?.brand_voice),
    ln("TONE WORDS", km.content?.brand_tone_words),
    ln("READING LEVEL", km.content?.reading_level),
    ln("PROHIBITED TOPICS", km.content?.prohibited_topics),
    ln("REQUIRED DISCLAIMERS", km.content?.required_disclaimers),
  ].filter(Boolean);

  const economicsBlock = [
    ln("VALUE PER LEAD", km.analytics?.value_per_lead),
    ln("VALUE PER CUSTOMER (LTV)", km.analytics?.value_per_customer),
  ].filter(Boolean);

  const commercialBlock = [
    ln("REPORT AUDIENCE", km.goal?.report_audience),
    ln("DECISION MAKER", km.commercial?.decision_maker_role),
    ln("DELIVERABLES EXPECTED", km.commercial?.deliverables_expected),
    ln("ANTI-GOALS (respect)", km.goal?.anti_goals),
  ].filter(Boolean);

  const historyBlock = [
    ln("WHAT WORKED BEFORE", km.history?.what_worked),
    ln("WHAT DID NOT WORK", km.history?.what_didnt_work),
    ln("ACTIVE PENALTIES", km.history?.active_penalties),
    ln("RECENT MIGRATIONS", km.history?.recent_migrations),
    ln("ALGORITHM IMPACTS", km.history?.algorithm_impacts),
  ].filter(Boolean);

  return [
    `PROJECT: ${p.name || ""} | URL: ${p.url || ""}`,
    `PERIOD: ${periodStart || "(open start)"} → ${periodEnd || "(open end)"}`,
    `GOAL: ${km.goal?.primary_goal || ""}`,
    km.goal?.primary_goal_narrative ? `GOAL DETAIL: ${km.goal.primary_goal_narrative}` : "",
    `TIMELINE: ${km.goal?.target_timeline || ""}`,
    `SUCCESS METRIC: ${km.goal?.success_metric || ""}`,

    /* V2 sections — emitted only when filled */
    identityBlock.length ? "\n── CLIENT IDENTITY ──\n" + identityBlock.join("\n") : "",
    audienceBlock.length ? "\n── AUDIENCE ──\n" + audienceBlock.join("\n") : "",
    contentBlock.length ? "\n── BRAND VOICE & CONSTRAINTS (calibrate tone; respect prohibitions) ──\n" + contentBlock.join("\n") : "",
    economicsBlock.length ? "\n── CONVERSION ECONOMICS (use for ROI claims) ──\n" + economicsBlock.join("\n") : "",
    commercialBlock.length ? "\n── REPORT CONTEXT ──\n" + commercialBlock.join("\n") : "",
    historyBlock.length ? "\n── HISTORY & CONSTRAINTS (do not repeat past mistakes; acknowledge wins) ──\n" + historyBlock.join("\n") : "",
  ].filter(Boolean).join("\n");
}

function deliveryFacts(rawData: any): string {
  const done = rawData.cardsDelivered || [];
  const progress = rawData.cardsInProgress || [];
  const planned = rawData.cardsPlanned || [];
  const ships = rawData.shippedRows || [];
  const lines: string[] = [
    `CARDS COMPLETED THIS PERIOD (${done.length}):`,
    ...done.slice(0, 12).map((c: any) =>
      `- [${c.card_type}/${c.priority}] ${c.title}${c.output ? ` — outcome: ${String(c.output).slice(0, 160)}` : ""}`),
    done.length > 12 ? `... and ${done.length - 12} more.` : "",
    "",
  ];
  if (ships.length) {
    lines.push(`SHIPMENTS IN PERIOD (${ships.length}) — these are the live changes:`);
    for (const s of ships.slice(0, 10)) {
      lines.push(`- ${new Date(s.shipped_at).toLocaleDateString("en-GB")} | ${s.card_title} | ${s.url || ""} | ${s.changes.slice(0, 120)}`);
    }
    lines.push("");
  }
  lines.push(
    `CARDS IN PROGRESS (${progress.length}):`,
    ...progress.slice(0, 8).map((c: any) => `- [${c.card_type}] ${c.title}`),
    "",
    `PLANNED NEXT (${planned.length}):`,
    ...planned.slice(0, 8).map((c: any) => `- [${c.card_type}] ${c.title}`),
  );
  return lines.filter(Boolean).join("\n");
}

function performanceFacts(rawData: any): string {
  const last = rawData.lastSnap || {};
  const prev = rawData.prevSnap || {};
  const audit = rawData.latestAudit || {};
  const prevAudit = rawData.prevAudit || {};
  const ships = rawData.shippedRows || [];
  const measuredShips = ships.filter((s: any) => s.measured);

  /* data-source calibration — tells the narrative how confident to be.
     Covers both GSC (search performance) and GA4 (engagement / sessions). */
  const sourceParts: string[] = [];
  if (rawData.gscStatus === "live") {
    sourceParts.push("Search Console is LIVE (pulled within 3 days). Write confidently about clicks, impressions, position.");
  } else if (rawData.gscStatus === "stale") {
    sourceParts.push(`Search Console pull is ${rawData.gscDaysSincePull} days old — hedge claims about search movement.`);
  } else {
    sourceParts.push("Search Console is NOT connected — hedge all search performance claims and recommend connecting GSC.");
  }
  if (rawData.ga4Status === "live") {
    sourceParts.push("Google Analytics 4 is LIVE (pulled within 3 days). Write confidently about organic sessions, conversions, bounce rate.");
  } else if (rawData.ga4Status === "stale") {
    sourceParts.push(`GA4 pull is ${rawData.ga4DaysSincePull} days old — hedge claims about session/conversion movement.`);
  } else {
    sourceParts.push("GA4 is NOT connected — hedge engagement/conversion claims and recommend connecting GA4.");
  }
  const sourceLine = "DATA SOURCES: " + sourceParts.join(" ");

  const cmp = (cur: any, p: any, label: string) =>
    (cur == null && p == null) ? "" :
    cur != null && p != null ? `${label}: ${cur} (was ${p}, ${(cur - p >= 0 ? "+" : "")}${(cur - p).toFixed(1)})` :
    cur != null ? `${label}: ${cur} (no prior point)` : "";

  const lines: string[] = [
    sourceLine,
    "",
    cmp(last.organic_sessions, prev.organic_sessions, "Organic sessions"),
    cmp(last.gsc_clicks,       prev.gsc_clicks,       "GSC clicks"),
    cmp(last.gsc_impressions,  prev.gsc_impressions,  "GSC impressions"),
    cmp(last.gsc_avg_position, prev.gsc_avg_position, "Avg position"),
    cmp(last.conversions,      prev.conversions,      "Conversions"),
    audit.overall_score != null
      ? `Audit score: ${audit.overall_score}${prevAudit.overall_score != null ? ` (prev ${prevAudit.overall_score})` : ""}`
      : "",
  ];

  if (measuredShips.length) {
    lines.push("", "MEASURED CARD-LEVEL IMPACT (attribute these confidently — they have before/after data):");
    for (const s of measuredShips.slice(0, 6)) {
      const liftBits: string[] = [];
      if (s.lift_clicks != null)   liftBits.push(`clicks ${s.lift_clicks > 0 ? "+" : ""}${s.lift_clicks}`);
      if (s.lift_position != null) liftBits.push(`position ${s.lift_position < 0 ? s.lift_position.toFixed(1) : `+${s.lift_position.toFixed(1)}`}`);
      lines.push(`- ${s.card_title} (${s.url || "n/a"}): ${liftBits.join(", ") || "no measurable change"}`);
    }
  }

  const out = lines.filter(Boolean).join("\n");
  return out || "No performance metrics captured yet — recommend running a fresh snapshot.";
}

async function generateOne(prompt: string, max = 800): Promise<string> {
  const resp = await ai().messages.create({
    model: MODEL, max_tokens: max,
    system: [
      "You write client-facing SEO progress reports for a senior project manager.",
      "Be specific to the data given. Never invent figures. Plain text only — no JSON,",
      "no markdown headings (the report frame supplies headings).",
      "",
      "WHEN THE PROMPT CONTAINS V2 CONTEXT SECTIONS, USE THEM:",
      "- BRAND VOICE + TONE WORDS: match this voice. If 'plain-spoken' is in tone, drop",
      "  any jargon. If 'warm' is there, use a conversational register. If 'evidence-based',",
      "  ground every claim in a number from the data.",
      "- PROHIBITED TOPICS: treat as hard constraints. Do not write about these.",
      "- REQUIRED DISCLAIMERS: include them where contextually appropriate.",
      "- READING LEVEL: respect it. 'Plain English Grade 6-8' = no industry shorthand.",
      "- CONVERSION ECONOMICS: when value-per-lead or LTV is provided, translate",
      "  traffic/conversion gains into revenue terms (a CMO/founder reads in £/$, not clicks).",
      "- REPORT AUDIENCE: a CMO wants strategic synthesis and decisions. A Founder wants ROI",
      "  and risk. A Marketing Manager wants tactical detail. Calibrate accordingly.",
      "- ANTI-GOALS: never propose work that violates these.",
      "- HISTORY: never frame current work as solving a problem the previous agency caused",
      "  (it reads as blame-shifting). When recent migrations or algorithm impacts are",
      "  documented, acknowledge them — they explain trends the data shows.",
      "- ACTIVE PENALTIES: write with extra care; never claim recovery before measurement proves it.",
      "",
      "WHEN V2 CONTEXT IS ABSENT: write competently in a professional default voice — neutral,",
      "evidence-based, neither over-formal nor casual. Do NOT invent context to compensate.",
    ].join("\n"),
    messages: [{ role: "user", content: prompt }],
  });
  return (resp.content[0] as any)?.text || "";
}

/** Generate the narrative text for every selected narrative block. */
async function generateNarratives(
  selectedIds: string[], sliders: Sliders, ctx: PmContext,
  rawData: any, periodStart: string, periodEnd: string,
): Promise<Record<string, string>> {
  const style = styleBlock(sliders, ctx);
  const proj  = projectContextBlock(rawData, periodStart, periodEnd);
  const lengthBudget = typeof sliders.length === "number"
    ? Math.round(400 + (sliders.length / 100) * 1200)   // 400 → 1600
    : 800;
  const out: Record<string, string> = {};

  /* run in parallel for speed, bounded */
  const jobs: { id: string; prompt: string; max: number }[] = [];

  if (selectedIds.includes("narr:exec_summary")) {
    jobs.push({
      id: "narr:exec_summary", max: Math.min(lengthBudget, 600),
      prompt: [proj, style,
        "Write the EXECUTIVE SUMMARY — the opening paragraph(s) the client reads first.",
        "Reference what was delivered, the most important signal that moved, and the headline next step.",
        "DELIVERY FACTS:", deliveryFacts(rawData),
        "PERFORMANCE FACTS:", performanceFacts(rawData),
      ].join("\n\n"),
    });
  }
  if (selectedIds.includes("narr:work_delivered")) {
    jobs.push({
      id: "narr:work_delivered", max: lengthBudget,
      prompt: [proj, style,
        "Write the WORK DELIVERED THIS PERIOD section. Specifically describe what was done and what it means for the project.",
        "Refer to actual cards by their work, not by generic categories.",
        deliveryFacts(rawData),
      ].join("\n\n"),
    });
  }
  if (selectedIds.includes("narr:performance")) {
    jobs.push({
      id: "narr:performance", max: lengthBudget,
      prompt: [proj, style,
        "Write the PERFORMANCE SIGNALS section. Discuss what moved (or didn't) since the last reporting period. Be calibrated to the confidence slider — hedge where data is thin.",
        performanceFacts(rawData),
      ].join("\n\n"),
    });
  }
  if (selectedIds.includes("narr:whats_next")) {
    jobs.push({
      id: "narr:whats_next", max: lengthBudget,
      prompt: [proj, style,
        "Write the WHAT'S NEXT section. Explain the upcoming work and why each piece matters for the client's goal.",
        deliveryFacts(rawData),
      ].join("\n\n"),
    });
  }
  if (selectedIds.includes("narr:pm_note") && ctx.customNote) {
    /* PM note is given by PM — light AI polish only */
    jobs.push({
      id: "narr:pm_note", max: 400,
      prompt: [proj, style,
        "Polish this PM NOTE to fit the style settings. Keep the meaning and most of the wording. Do not add new claims.",
        `PM NOTE: ${ctx.customNote}`,
      ].join("\n\n"),
    });
  }

  /* parallel with bounded concurrency */
  const CONC = 3;
  for (let i = 0; i < jobs.length; i += CONC) {
    const chunk = jobs.slice(i, i + CONC);
    const results = await Promise.all(chunk.map(async (j) => {
      try { return { id: j.id, text: (await generateOne(j.prompt, j.max)).trim() }; }
      catch (e: any) {
        return { id: j.id, text: `(Generation failed for this section: ${e?.message || "unknown"}. You can retry this block from the editor.)` };
      }
    }));
    for (const r of results) out[r.id] = r.text;
  }
  return out;
}

/* ── public-facing actions called by the API dispatcher ────── */

/** Return the full block catalog for a project + period (the picker view). */
export async function pmReportCatalog(projectId: string, periodStart: string, periodEnd: string) {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const { catalog } = await buildReportCatalog(projectId, periodStart, periodEnd);
    return { success: true, catalog };
  } catch (e: any) {
    return { success: false, error: e?.message || "catalog failed" };
  }
}

/** Generate a report — assemble selected blocks + write narratives. */
export async function pmReportGenerate(opts: {
  projectId: string;
  periodStart: string; periodEnd: string;
  selectedBlocks: string[];
  sliders: Sliders;
  pmContext: PmContext;
  title?: string;
}) {
  if (!opts.projectId) return { success: false, error: "projectId required" };
  try {
    /* take a fresh metric snapshot first so the report carries the latest point */
    await captureMetricsSnapshot({ projectId: opts.projectId, source: "report_generation" });

    const { catalog, rawData } = await buildReportCatalog(opts.projectId, opts.periodStart, opts.periodEnd);
    const byId: Record<string, ReportBlock> = {};
    for (const b of catalog) byId[b.id] = b;

    /* generate narratives for the narrative blocks the PM selected */
    const narrativeIds = opts.selectedBlocks.filter((id) => byId[id]?.type === "narrative");
    const narratives = narrativeIds.length
      ? await generateNarratives(narrativeIds, opts.sliders, opts.pmContext, rawData,
                                  opts.periodStart, opts.periodEnd)
      : {};

    /* build the ordered block list — preserve PM's selection order */
    const blocks: ReportBlock[] = opts.selectedBlocks
      .map((id) => byId[id])
      .filter(Boolean)
      .map((b) => {
        if (b.type === "narrative") {
          return { ...b, content: narratives[b.id] || "" };
        }
        return b;
      });

    /* persist as a draft */
    const { data, error } = await db().from("client_reports").insert({
      project_id:      opts.projectId,
      period_start:    opts.periodStart || null,
      period_end:      opts.periodEnd || null,
      title:           opts.title || "Client Report",
      sliders:         opts.sliders || {},
      pm_context:      opts.pmContext || {},
      selected_blocks: opts.selectedBlocks,
      blocks,
      status:          "draft",
    }).select("*").single();
    if (error) return { success: false, error: error.message };
    return { success: true, report: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "report generation failed" };
  }
}

/** Save edits to a report (block reorder, text edits, title changes). */
export async function pmReportSave(opts: {
  reportId: string;
  blocks?: any[];
  title?:  string;
  status?: "draft" | "finalized";
}) {
  if (!opts.reportId) return { success: false, error: "reportId required" };
  try {
    const update: any = {};
    if (Array.isArray(opts.blocks)) update.blocks = opts.blocks;
    if (typeof opts.title === "string") update.title = opts.title;
    if (opts.status) update.status = opts.status;
    if (!Object.keys(update).length) return { success: false, error: "nothing to update" };
    const { data, error } = await db().from("client_reports").update(update)
      .eq("id", opts.reportId).select("*").single();
    if (error) return { success: false, error: error.message };
    return { success: true, report: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "save failed" };
  }
}

/** Regenerate one narrative block in place. */
export async function pmReportRegenerateBlock(opts: {
  reportId: string;
  blockId:  string;
  sliders?: Sliders;
  pmContext?: PmContext;
}) {
  if (!opts.reportId || !opts.blockId) return { success: false, error: "reportId and blockId required" };
  try {
    const { data: report } = await db().from("client_reports").select("*")
      .eq("id", opts.reportId).maybeSingle();
    if (!report) return { success: false, error: "report not found" };
    const r = report as any;
    const sliders = opts.sliders ?? r.sliders ?? {};
    const ctx     = opts.pmContext ?? r.pm_context ?? {};
    const { rawData } = await buildReportCatalog(r.project_id, r.period_start, r.period_end);
    const result = await generateNarratives([opts.blockId], sliders, ctx, rawData,
                                             r.period_start, r.period_end);
    const newText = result[opts.blockId] || "";
    const blocks = (r.blocks || []).map((b: any) =>
      b.id === opts.blockId ? { ...b, content: newText } : b);
    const { data, error } = await db().from("client_reports").update({
      blocks, sliders, pm_context: ctx,
    }).eq("id", opts.reportId).select("*").single();
    if (error) return { success: false, error: error.message };
    return { success: true, report: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "regenerate failed" };
  }
}

/** Create or rotate a public share token. */
export async function pmReportShare(opts: { reportId: string; revoke?: boolean }) {
  if (!opts.reportId) return { success: false, error: "reportId required" };
  try {
    if (opts.revoke) {
      const { error } = await db().from("client_reports").update({
        share_token: null, shared_at: null,
        status: "finalized",
      }).eq("id", opts.reportId);
      if (error) return { success: false, error: error.message };
      return { success: true, share_token: null };
    }
    const token = genToken();
    const { error } = await db().from("client_reports").update({
      share_token: token, shared_at: new Date().toISOString(), status: "shared",
    }).eq("id", opts.reportId);
    if (error) return { success: false, error: error.message };
    return { success: true, share_token: token };
  } catch (e: any) {
    return { success: false, error: e?.message || "share failed" };
  }
}

/** List a project's reports (newest first). */
export async function pmReportList(projectId: string) {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const { data, error } = await db().from("client_reports")
      .select("id,title,period_start,period_end,status,share_token,shared_at,created_at,updated_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }).limit(50);
    if (error) return { success: false, error: error.message };
    return { success: true, reports: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "list failed" };
  }
}

/** Fetch a report (authenticated — by id). */
export async function pmReportGet(reportId: string) {
  if (!reportId) return { success: false, error: "reportId required" };
  try {
    const { data, error } = await db().from("client_reports").select("*")
      .eq("id", reportId).maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "not found" };
    return { success: true, report: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "fetch failed" };
  }
}

/** Public read-only fetch by share token — no auth, only finalized/shared. */
export async function pmReportGetShared(token: string) {
  if (!token) return { success: false, error: "token required" };
  try {
    const { data, error } = await db().from("client_reports")
      .select("id,title,period_start,period_end,blocks,shared_at,project_id")
      .eq("share_token", token).maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "report not found or no longer shared" };
    /* lookup project name + client for the public header */
    const { data: proj } = await db().from("projects").select("name,client_id")
      .eq("id", (data as any).project_id).maybeSingle();
    let clientCompany = "";
    if ((proj as any)?.client_id) {
      const { data: c } = await db().from("clients").select("company,name")
        .eq("id", (proj as any).client_id).maybeSingle();
      clientCompany = (c as any)?.company || (c as any)?.name || "";
    }
    return {
      success: true,
      report: {
        title:        (data as any).title,
        period_start: (data as any).period_start,
        period_end:   (data as any).period_end,
        blocks:       (data as any).blocks,
        shared_at:    (data as any).shared_at,
        project_name: (proj as any)?.name || "",
        client:       clientCompany,
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "fetch failed" };
  }
}

/** Delete a report. */
export async function pmReportDelete(reportId: string) {
  if (!reportId) return { success: false, error: "reportId required" };
  try {
    const { error } = await db().from("client_reports").delete().eq("id", reportId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "delete failed" };
  }
}

/* ── dispatch helper for task-engine ───────────────────────── */

export async function handlePmReport(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "pm_report_catalog":      return pmReportCatalog(body.projectId, body.periodStart || "", body.periodEnd || "");
    case "pm_report_generate":     return pmReportGenerate(body);
    case "pm_report_save":         return pmReportSave(body);
    case "pm_report_regenerate":   return pmReportRegenerateBlock(body);
    case "pm_report_share":        return pmReportShare(body);
    case "pm_report_list":         return pmReportList(body.projectId);
    case "pm_report_get":          return pmReportGet(body.reportId);
    case "pm_report_get_shared":   return pmReportGetShared(body.token);
    case "pm_report_delete":       return pmReportDelete(body.reportId);
    case "pm_metrics_snapshot":    return captureMetricsSnapshot({
      projectId: body.projectId, source: body.source || "manual", values: body.values,
    });
    default: return null;
  }
}
