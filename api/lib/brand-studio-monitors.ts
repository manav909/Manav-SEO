/* ════════════════════════════════════════════════════════════════
   api/lib/brand-studio-monitors.ts
   Brand Studio H.4 — Market & Monitoring backend.

   Five concerns:
   1. Monitor CRUD — per-project URL monitors with intentional "why"
   2. Observation listing — the Triggers queue (open meaningful changes)
   3. Cron tick — fetch eligible monitors, classify changes via AI,
      record observations, propagate staleness to subscribed docs
   4. Subscription propagation — when a monitor observation marks
      meaningful, all docs subscribed to that monitor get flagged stale
   5. Auto-subscribe on generation — when a generated doc cites
      source IDs (monitor:* in future, doc:*, traction:*, etc.),
      subscriptions are auto-created

   Brand-specialist discipline carried throughout:
   - "Suggestion not automation" — observations never auto-regenerate
     docs; they only suggest
   - Meaningful-change classification gates noise out
   - Per-monitor "why" field forces intentional monitoring
   - Hard cron cost caps prevent runaway resource consumption
═══════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

/* Hard caps for cron predictability */
const MAX_FETCHES_PER_RUN       = 50;
const MAX_CLASSIFICATIONS_PER_RUN = 100;     /* one classification per fetch normally */
const FETCH_TIMEOUT_MS          = 15000;
const CONTENT_EXCERPT_LENGTH    = 5000;

const VALID_MONITOR_TYPES = ["competitor_page","industry_publication","regulatory_source","general_url"];
const VALID_OBS_STATUS    = ["open","reviewed","acted","dismissed"];

/* ─── Monitor CRUD ─────────────────────────────────────────────── */

export async function bsListMonitors(body: any): Promise<any> {
  const { projectId } = body;
  if (!projectId) return { success: false, error: "projectId required" };
  const { data, error } = await db().from("internet_monitors")
    .select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, monitors: data || [] };
}

export async function bsUpsertMonitor(body: any): Promise<any> {
  const { id, projectId, ...fields } = body;
  if (!projectId) return { success: false, error: "projectId required" };

  if (!fields.monitor_type || !VALID_MONITOR_TYPES.includes(fields.monitor_type)) {
    return { success: false, error: `monitor_type must be one of: ${VALID_MONITOR_TYPES.join(", ")}` };
  }
  if (!fields.url || !fields.url.trim()) return { success: false, error: "url required" };
  try { const u = new URL(fields.url); if (!["http:","https:"].includes(u.protocol)) throw 0; }
  catch { return { success: false, error: "url must be http(s)" }; }
  if (!fields.label || !fields.label.trim()) return { success: false, error: "label required" };
  if (!fields.why   || !fields.why.trim())   return { success: false, error: "why required — explain why we're watching this URL" };

  const freq = Number(fields.check_frequency_hours || 24);
  if (!(freq >= 6 && freq <= 720)) {
    return { success: false, error: "check_frequency_hours must be between 6 and 720" };
  }

  const payload: any = {
    project_id:            projectId,
    monitor_type:          fields.monitor_type,
    url:                   String(fields.url).slice(0, 1000),
    label:                 String(fields.label).slice(0, 200),
    why:                   String(fields.why).slice(0, 1000),
    competitor_name:       fields.competitor_name ? String(fields.competitor_name).slice(0, 200) : null,
    watch_focus:           fields.watch_focus ? String(fields.watch_focus).slice(0, 500) : null,
    enabled:               fields.enabled === false ? false : true,
    check_frequency_hours: freq,
    created_by:            fields.created_by || null,
  };

  /* When a NEW monitor is added (or url changes), set next_check_due_at to now
     so it's picked up on the next cron run for initial baseline. */
  if (!id) {
    payload.next_check_due_at = new Date().toISOString();
  }

  if (id) {
    const { data, error } = await db().from("internet_monitors")
      .update(payload).eq("id", id).eq("project_id", projectId).select().single();
    if (error || !data) return { success: false, error: error?.message || "update failed" };
    return { success: true, monitor: data };
  } else {
    const { data, error } = await db().from("internet_monitors")
      .insert(payload).select().single();
    if (error || !data) return { success: false, error: error?.message || "insert failed" };
    return { success: true, monitor: data };
  }
}

export async function bsDeleteMonitor(body: any): Promise<any> {
  const { id, projectId } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };
  const { error } = await db().from("internet_monitors")
    .delete().eq("id", id).eq("project_id", projectId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/* ─── Observation listing ─────────────────────────────────────── */

export async function bsListObservations(body: any): Promise<any> {
  const { projectId, status, includeClassifications, limit } = body;
  if (!projectId) return { success: false, error: "projectId required" };

  let q = db().from("monitor_observations")
    .select("id,monitor_id,observed_at,change_classification,summary_of_change,ai_assessment,suggested_action,suggested_template_id,status,acted_document_id")
    .eq("project_id", projectId);

  if (status) q = q.eq("status", status);
  /* Default to interesting classifications only for the Triggers queue */
  const classes = Array.isArray(includeClassifications) && includeClassifications.length
    ? includeClassifications
    : ["meaningful", "new_item"];
  q = q.in("change_classification", classes);
  q = q.order("observed_at", { ascending: false }).limit(Math.min(Number(limit) || 50, 200));

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  /* Enrich with monitor labels */
  const obs = data || [];
  if (obs.length === 0) return { success: true, observations: [] };
  const monitorIds = Array.from(new Set(obs.map((o: any) => o.monitor_id)));
  const { data: monitors } = await db().from("internet_monitors")
    .select("id,label,url,monitor_type,competitor_name").in("id", monitorIds);
  const monitorMap = new Map<string, any>();
  for (const m of (monitors || [])) monitorMap.set((m as any).id, m);

  return {
    success: true,
    observations: obs.map((o: any) => ({
      ...o,
      monitor_label:    monitorMap.get(o.monitor_id)?.label,
      monitor_url:      monitorMap.get(o.monitor_id)?.url,
      monitor_type:     monitorMap.get(o.monitor_id)?.monitor_type,
      competitor_name:  monitorMap.get(o.monitor_id)?.competitor_name,
    })),
  };
}

export async function bsUpdateObservationStatus(body: any): Promise<any> {
  const { id, projectId, status, actedDocumentId } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };
  if (!status || !VALID_OBS_STATUS.includes(status)) {
    return { success: false, error: `status must be one of: ${VALID_OBS_STATUS.join(", ")}` };
  }
  const payload: any = { status };
  if (actedDocumentId) payload.acted_document_id = actedDocumentId;
  const { error } = await db().from("monitor_observations")
    .update(payload).eq("id", id).eq("project_id", projectId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/* ─── Subscription listing (for Library staleness badges) ─────── */

export async function bsListStaleDocs(body: any): Promise<any> {
  const { projectId } = body;
  if (!projectId) return { success: false, error: "projectId required" };

  /* Find all stale subscriptions for this project */
  const { data: subs } = await db().from("document_subscriptions")
    .select("document_id,subscription_type,target_id,target_category,target_field_key,stale_since,stale_reason")
    .eq("project_id", projectId)
    .not("stale_since", "is", null)
    .order("stale_since", { ascending: false });

  if (!subs || subs.length === 0) return { success: true, stale_docs: [] };

  /* Group by document, deduplicate reasons */
  const byDoc = new Map<string, any>();
  for (const s of (subs as any[])) {
    const existing = byDoc.get(s.document_id);
    const reason = s.stale_reason || `${s.subscription_type} input changed`;
    if (existing) {
      existing.reasons.push(reason);
      if (!existing.most_recent_stale || new Date(s.stale_since) > new Date(existing.most_recent_stale)) {
        existing.most_recent_stale = s.stale_since;
      }
    } else {
      byDoc.set(s.document_id, {
        document_id:        s.document_id,
        most_recent_stale:  s.stale_since,
        reasons:            [reason],
      });
    }
  }

  /* Fetch doc names */
  const docIds = Array.from(byDoc.keys());
  const { data: docs } = await db().from("project_documents")
    .select("id,name,template_id,version").in("id", docIds);
  const docMap = new Map<string, any>();
  for (const d of (docs || [])) docMap.set((d as any).id, d);

  return {
    success: true,
    stale_docs: Array.from(byDoc.values()).map((v) => ({
      ...v,
      document_name: docMap.get(v.document_id)?.name,
      template_id:   docMap.get(v.document_id)?.template_id,
      version:       docMap.get(v.document_id)?.version,
    })),
  };
}

export async function bsDismissStale(body: any): Promise<any> {
  const { documentId, projectId } = body;
  if (!documentId || !projectId) return { success: false, error: "documentId + projectId required" };
  /* Clear stale flags on all subscriptions for this doc */
  const { error } = await db().from("document_subscriptions")
    .update({ stale_since: null, stale_reason: null, stale_observation_id: null })
    .eq("document_id", documentId).eq("project_id", projectId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/* ─── Fetch + AI classification ───────────────────────────────── */

async function fetchUrlWithTimeout(url: string): Promise<{
  text: string; title?: string; error?: string; status?: number;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Brand Studio Monitors) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return { text: "", error: `HTTP ${res.status}`, status: res.status };
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    return { text: cleaned, title };
  } catch (e: any) {
    clearTimeout(timeout);
    return { text: "", error: e?.name === "AbortError" ? "timeout" : (e?.message || "fetch failed") };
  }
}

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

interface ClassificationResult {
  classification:        "no_change" | "cosmetic" | "meaningful" | "new_item" | "error";
  summary_of_change:     string;
  ai_assessment:         string;
  suggested_action:      string | null;
  suggested_template_id: string | null;
}

/** AI-classifies whether a content change is meaningful. Gated by the
 *  brand-specialist standard: "would a senior brand strategist care?"
 *  Returns a structured classification + suggested action. */
async function classifyChange(opts: {
  monitor: any;
  previousExcerpt: string | null;
  previousSummary: string | null;
  newExcerpt: string;
}): Promise<ClassificationResult> {
  const { monitor, previousExcerpt, previousSummary, newExcerpt } = opts;

  const system = [
    "You are a senior brand strategy consultant assessing whether a watched web page has changed in a way that warrants client team attention.",
    "",
    "Your job is to be a noise filter. The default classification is COSMETIC — most page changes (nav tweaks, copy adjustments, cookie banners, footer year updates, A/B test variations) do NOT warrant attention.",
    "",
    "Only classify as MEANINGFUL when a senior brand strategist would genuinely want to know — substantive changes that could affect positioning, competitive landscape, or client strategy. Examples of meaningful change:",
    "- New product, pricing tier, or service offering launched",
    "- Major positioning or messaging shift",
    "- Leadership change announced",
    "- Funding round announced",
    "- Significant feature or capability change",
    "- Regulatory or compliance text update on a gov page",
    "- New customer logo, case study, or major testimonial",
    "",
    "Classify as NEW_ITEM when this is a listing/feed page (industry publication, blog index) and a new post/item has appeared.",
    "",
    "Classify as NO_CHANGE if the change is purely whitespace, format, or timestamp updates with no semantic difference.",
    "",
    "If the change is meaningful, suggest ONE specific document template the client team might want to regenerate in response. Available templates (use the EXACT ID):",
    "  positioning_memo, competitor_battlecard, market_prominence, sales_battlecard, opportunity_verdict,",
    "  performance_prediction, executive_summary, competitive_moat, traction_memo, market_opportunity,",
    "  case_study, press_release, content_gap_plan, brand_statement, recovery_plan",
    "",
    "Be decisive. Suggest a template ONLY if the change clearly maps to one — never force a suggestion when none fits.",
    "",
    "Call the submit_classification tool with your assessment.",
  ].join("\n");

  const monitorContext = [
    `MONITOR CONTEXT`,
    `Type: ${monitor.monitor_type}`,
    `Label: ${monitor.label}`,
    `URL: ${monitor.url}`,
    `Why we're watching: ${monitor.why}`,
    monitor.competitor_name ? `Competitor: ${monitor.competitor_name}` : null,
    monitor.watch_focus ? `Specific focus: ${monitor.watch_focus}` : null,
  ].filter(Boolean).join("\n");

  const userMsg = previousExcerpt ? [
    monitorContext,
    "",
    "PREVIOUS CONTENT EXCERPT:",
    previousExcerpt,
    "",
    previousSummary ? `PREVIOUS AI SUMMARY: ${previousSummary}` : "",
    "",
    "NEW CONTENT EXCERPT (just fetched):",
    newExcerpt,
    "",
    "Classify the change. Call submit_classification.",
  ].filter(Boolean).join("\n") : [
    monitorContext,
    "",
    "This is the FIRST observation — no previous content to compare against. Classify as 'no_change' (baseline) and provide a 1-2 sentence ai_assessment summarizing what's on this page.",
    "",
    "NEW CONTENT EXCERPT:",
    newExcerpt,
    "",
    "Call submit_classification.",
  ].join("\n");

  const schema = {
    type: "object" as const,
    properties: {
      classification: {
        type: "string",
        enum: ["no_change", "cosmetic", "meaningful", "new_item"],
      },
      summary_of_change: {
        type: "string",
        description: "1-2 sentences describing what changed (or 'No change' / baseline summary).",
      },
      ai_assessment: {
        type: "string",
        description: "Your reasoning for the classification. Be specific about why a strategist would or wouldn't care.",
      },
      suggested_action: {
        type: "string",
        description: "If meaningful, a specific suggested action (e.g. 'Regenerate Competitor Battlecard for Competitor X to reflect the new pricing tier'). Empty string if no action.",
      },
      suggested_template_id: {
        type: "string",
        description: "The exact template ID to suggest regenerating, or empty string if none.",
      },
    },
    required: ["classification", "summary_of_change", "ai_assessment"],
  };

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const resp = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 1500,
      system,
      messages:   [{ role: "user", content: userMsg }],
      tools: [{
        name: "submit_classification",
        description: "Submit the change classification. Call exactly once.",
        input_schema: schema as any,
      }],
      tool_choice: { type: "tool", name: "submit_classification" },
    });

    let toolInput: any = null;
    for (const block of (resp.content || [])) {
      if ((block as any).type === "tool_use" && (block as any).name === "submit_classification") {
        toolInput = (block as any).input;
        break;
      }
    }
    if (!toolInput) {
      return {
        classification:        "error",
        summary_of_change:     "AI did not return a classification.",
        ai_assessment:         "Tool call missing from response.",
        suggested_action:      null,
        suggested_template_id: null,
      };
    }
    const cls = String(toolInput.classification || "no_change");
    const validCls = (cls === "no_change" || cls === "cosmetic" || cls === "meaningful" || cls === "new_item")
      ? cls : "no_change";
    const suggestedAction = String(toolInput.suggested_action || "").trim();
    const suggestedTemplate = String(toolInput.suggested_template_id || "").trim();
    return {
      classification:        validCls as ClassificationResult["classification"],
      summary_of_change:     String(toolInput.summary_of_change || "").slice(0, 1000),
      ai_assessment:         String(toolInput.ai_assessment || "").slice(0, 2000),
      suggested_action:      suggestedAction || null,
      suggested_template_id: suggestedTemplate || null,
    };
  } catch (e: any) {
    return {
      classification:        "error",
      summary_of_change:     "Classification failed.",
      ai_assessment:         e?.message || "AI error",
      suggested_action:      null,
      suggested_template_id: null,
    };
  }
}

/* ─── Propagate staleness to subscribed documents ─────────────── */

async function propagateStaleness(opts: {
  projectId:      string;
  monitorId:      string;
  observationId:  string;
  reason:         string;
}): Promise<number> {
  const { projectId, monitorId, observationId, reason } = opts;

  /* Find subscriptions pointing to this monitor */
  const { data: subs } = await db().from("document_subscriptions")
    .select("id").eq("project_id", projectId)
    .eq("subscription_type", "monitor")
    .eq("target_id", monitorId);

  if (!subs || subs.length === 0) return 0;

  const now = new Date().toISOString();
  const ids = (subs as any[]).map((s) => s.id);
  const { error } = await db().from("document_subscriptions")
    .update({
      stale_since:        now,
      stale_reason:       reason,
      stale_observation_id: observationId,
    })
    .in("id", ids);

  if (error) {
    console.error("[bs-monitors] propagateStaleness failed:", error.message);
    return 0;
  }
  return ids.length;
}

/* ─── Cron tick — the main automation entrypoint ──────────────── */

interface CronResult {
  checked:        number;
  no_change:      number;
  cosmetic:       number;
  meaningful:     number;
  new_item:       number;
  errors:         number;
  stale_docs_flagged: number;
  duration_ms:    number;
  monitors_remaining: number;
}

/** Called from the existing daily cron tick. Picks up to MAX_FETCHES_PER_RUN
 *  monitors that are due, fetches each, classifies via AI, records observations,
 *  propagates staleness to subscribed docs. Returns a summary. */
export async function monitorCronTick(): Promise<CronResult> {
  const startedAt = Date.now();
  const result: CronResult = {
    checked: 0, no_change: 0, cosmetic: 0, meaningful: 0, new_item: 0,
    errors: 0, stale_docs_flagged: 0, duration_ms: 0, monitors_remaining: 0,
  };

  /* Pick eligible monitors: enabled, past or no next_check_due_at */
  const nowIso = new Date().toISOString();
  const { data: dueMonitors } = await db().from("internet_monitors")
    .select("*")
    .eq("enabled", true)
    .or(`next_check_due_at.lte.${nowIso},next_check_due_at.is.null`)
    .order("next_check_due_at", { ascending: true, nullsFirst: true })
    .limit(MAX_FETCHES_PER_RUN + 10);     /* +10 for visibility into queue depth */

  const monitors = dueMonitors || [];
  result.monitors_remaining = Math.max(0, monitors.length - MAX_FETCHES_PER_RUN);
  const toCheck = monitors.slice(0, MAX_FETCHES_PER_RUN);

  let classificationsUsed = 0;

  for (const m of toCheck) {
    const monitor = m as any;
    result.checked++;

    /* Fetch */
    const fetched = await fetchUrlWithTimeout(monitor.url);
    const checkedAt = new Date().toISOString();
    const nextDue = new Date(Date.now() + monitor.check_frequency_hours * 3600 * 1000).toISOString();

    /* Fetch error path */
    if (fetched.error || !fetched.text) {
      result.errors++;
      await db().from("monitor_observations").insert({
        monitor_id:            monitor.id,
        project_id:            monitor.project_id,
        change_classification: "error",
        summary_of_change:     null,
        ai_assessment:         null,
        suggested_action:      null,
        new_content_excerpt:   null,
        status:                "open",
        error_detail:          fetched.error || "no content",
      });
      await db().from("internet_monitors").update({
        last_check_at:      checkedAt,
        next_check_due_at:  nextDue,
        consecutive_errors: (monitor.consecutive_errors || 0) + 1,
        last_error:         fetched.error || "no content",
        last_error_at:      checkedAt,
      }).eq("id", monitor.id);
      continue;
    }

    /* Hash + classify */
    const newHash = contentHash(fetched.text);
    const newExcerpt = fetched.text.slice(0, CONTENT_EXCERPT_LENGTH);
    const isFirstObservation = !monitor.last_content_hash;
    const hashMatches = !isFirstObservation && monitor.last_content_hash === newHash;

    if (hashMatches) {
      /* Hash match = no change, skip AI cost entirely */
      result.no_change++;
      await db().from("monitor_observations").insert({
        monitor_id:            monitor.id,
        project_id:            monitor.project_id,
        change_classification: "no_change",
        summary_of_change:     "Content hash unchanged.",
        ai_assessment:         "No bytes changed — skipped AI classification.",
        suggested_action:      null,
        new_content_excerpt:   null,
        status:                "reviewed",  /* not interesting — auto-mark reviewed */
      });
      await db().from("internet_monitors").update({
        last_check_at:      checkedAt,
        next_check_due_at:  nextDue,
        consecutive_errors: 0,
        last_error:         null,
        last_error_at:      null,
      }).eq("id", monitor.id);
      continue;
    }

    /* Hash differs (or first observation) — run AI classification */
    if (classificationsUsed >= MAX_CLASSIFICATIONS_PER_RUN) {
      /* Out of budget — record without classification, will retry next run */
      result.errors++;
      await db().from("monitor_observations").insert({
        monitor_id:            monitor.id,
        project_id:            monitor.project_id,
        change_classification: "error",
        summary_of_change:     "Classification budget exhausted for this cron run.",
        ai_assessment:         null,
        suggested_action:      null,
        new_content_excerpt:   null,
        status:                "open",
        error_detail:          "max_classifications_per_run",
      });
      /* Do NOT update last_check_at — we want this re-picked next run */
      continue;
    }

    classificationsUsed++;
    const cls = await classifyChange({
      monitor,
      previousExcerpt: monitor.last_content_excerpt,
      previousSummary: monitor.last_ai_summary,
      newExcerpt,
    });

    /* Decide observation status — only meaningful/new_item land in the open queue */
    const obsStatus =
      cls.classification === "meaningful" || cls.classification === "new_item" ? "open" :
      "reviewed";

    /* Insert observation */
    const { data: obsRow } = await db().from("monitor_observations").insert({
      monitor_id:            monitor.id,
      project_id:            monitor.project_id,
      change_classification: cls.classification,
      summary_of_change:     cls.summary_of_change,
      ai_assessment:         cls.ai_assessment,
      suggested_action:      cls.suggested_action,
      suggested_template_id: cls.suggested_template_id,
      new_content_excerpt:   (cls.classification === "meaningful" || cls.classification === "new_item") ? newExcerpt : null,
      status:                obsStatus,
    }).select("id").single();
    const observationId = (obsRow as any)?.id;

    /* Update monitor's cached state */
    const monitorUpdate: any = {
      last_check_at:        checkedAt,
      next_check_due_at:    nextDue,
      last_content_hash:    newHash,
      last_content_excerpt: newExcerpt,
      consecutive_errors:   0,
      last_error:           null,
      last_error_at:        null,
    };
    /* Update the AI summary on first observation or whenever the page meaningfully changed */
    if (isFirstObservation || cls.classification === "meaningful" || cls.classification === "new_item") {
      monitorUpdate.last_ai_summary = cls.summary_of_change;
    }
    await db().from("internet_monitors").update(monitorUpdate).eq("id", monitor.id);

    /* Tally + staleness propagation */
    if      (cls.classification === "no_change")  result.no_change++;
    else if (cls.classification === "cosmetic")   result.cosmetic++;
    else if (cls.classification === "meaningful") {
      result.meaningful++;
      if (observationId) {
        const flagged = await propagateStaleness({
          projectId:     monitor.project_id,
          monitorId:     monitor.id,
          observationId,
          reason:        `${monitor.label}: ${cls.summary_of_change}`,
        });
        result.stale_docs_flagged += flagged;
      }
    } else if (cls.classification === "new_item") {
      result.new_item++;
      if (observationId) {
        const flagged = await propagateStaleness({
          projectId:     monitor.project_id,
          monitorId:     monitor.id,
          observationId,
          reason:        `${monitor.label}: ${cls.summary_of_change}`,
        });
        result.stale_docs_flagged += flagged;
      }
    }
  }

  result.duration_ms = Date.now() - startedAt;
  return result;
}

/* ─── Manual single-monitor check (PM-triggered) ──────────────── */

export async function bsCheckMonitorNow(body: any): Promise<any> {
  const { id, projectId } = body;
  if (!id || !projectId) return { success: false, error: "id + projectId required" };

  const { data: monitor } = await db().from("internet_monitors")
    .select("*").eq("id", id).eq("project_id", projectId).maybeSingle();
  if (!monitor) return { success: false, error: "monitor not found" };

  /* Reuse cron logic by forcing next_check_due_at to now, then running ONE monitor */
  const m = monitor as any;
  const fetched = await fetchUrlWithTimeout(m.url);
  const checkedAt = new Date().toISOString();
  const nextDue = new Date(Date.now() + m.check_frequency_hours * 3600 * 1000).toISOString();

  if (fetched.error || !fetched.text) {
    await db().from("monitor_observations").insert({
      monitor_id:            m.id,
      project_id:            m.project_id,
      change_classification: "error",
      error_detail:          fetched.error || "no content",
      status:                "open",
    });
    return { success: false, error: fetched.error || "Could not fetch URL" };
  }

  const newHash = contentHash(fetched.text);
  const newExcerpt = fetched.text.slice(0, CONTENT_EXCERPT_LENGTH);
  const isFirstObservation = !m.last_content_hash;
  const hashMatches = !isFirstObservation && m.last_content_hash === newHash;

  let cls: ClassificationResult;
  if (hashMatches) {
    cls = {
      classification:        "no_change",
      summary_of_change:     "Content hash unchanged.",
      ai_assessment:         "No bytes changed — skipped AI classification.",
      suggested_action:      null,
      suggested_template_id: null,
    };
  } else {
    cls = await classifyChange({
      monitor: m,
      previousExcerpt: m.last_content_excerpt,
      previousSummary: m.last_ai_summary,
      newExcerpt,
    });
  }

  const obsStatus =
    cls.classification === "meaningful" || cls.classification === "new_item" ? "open" : "reviewed";

  const { data: obsRow } = await db().from("monitor_observations").insert({
    monitor_id:            m.id,
    project_id:            m.project_id,
    change_classification: cls.classification,
    summary_of_change:     cls.summary_of_change,
    ai_assessment:         cls.ai_assessment,
    suggested_action:      cls.suggested_action,
    suggested_template_id: cls.suggested_template_id,
    new_content_excerpt:   (cls.classification === "meaningful" || cls.classification === "new_item") ? newExcerpt : null,
    status:                obsStatus,
  }).select("id").single();

  const monitorUpdate: any = {
    last_check_at:        checkedAt,
    next_check_due_at:    nextDue,
    last_content_hash:    newHash,
    last_content_excerpt: newExcerpt,
    consecutive_errors:   0,
    last_error:           null,
    last_error_at:        null,
  };
  if (isFirstObservation || cls.classification === "meaningful" || cls.classification === "new_item") {
    monitorUpdate.last_ai_summary = cls.summary_of_change;
  }
  await db().from("internet_monitors").update(monitorUpdate).eq("id", m.id);

  /* Propagate if meaningful */
  if (cls.classification === "meaningful" || cls.classification === "new_item") {
    const observationId = (obsRow as any)?.id;
    if (observationId) {
      await propagateStaleness({
        projectId:     m.project_id,
        monitorId:     m.id,
        observationId,
        reason:        `${m.label}: ${cls.summary_of_change}`,
      });
    }
  }

  return {
    success: true,
    classification: cls.classification,
    summary_of_change: cls.summary_of_change,
    ai_assessment: cls.ai_assessment,
    suggested_action: cls.suggested_action,
    suggested_template_id: cls.suggested_template_id,
  };
}

/* ─── Dispatcher ──────────────────────────────────────────────── */

export async function handleBrandStudioMonitors(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "bs_list_monitors":              return bsListMonitors(body);
    case "bs_upsert_monitor":             return bsUpsertMonitor(body);
    case "bs_delete_monitor":             return bsDeleteMonitor(body);
    case "bs_check_monitor_now":          return bsCheckMonitorNow(body);
    case "bs_list_observations":          return bsListObservations(body);
    case "bs_update_observation_status":  return bsUpdateObservationStatus(body);
    case "bs_list_stale_docs":            return bsListStaleDocs(body);
    case "bs_dismiss_stale":              return bsDismissStale(body);
    default: return null;
  }
}
