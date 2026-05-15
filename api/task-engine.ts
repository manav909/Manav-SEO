/**
 * task-engine.ts — Manav Brain's core execution and learning engine
 *
 * AUTO-APPROVAL RULES (saves directly as 'active'):
 *   technical / quick-win  → objective facts, auto-approve
 *   algorithm              → confirmed signals, auto-approve
 *   audit (source=audit*)  → factual findings, auto-approve
 *   confidence >= 85       → sufficiently validated, auto-approve
 *
 * NEEDS APPROVAL (saves as 'pending_review'):
 *   content / geo / competitive / insight / strategy  → interpretive
 *   confidence < 85 from auto-capture sources
 *
 * CONTRADICTION CHECK: before insert, scan existing active learnings
 *   with same card_type for semantic overlap; flag or merge
 */
// BUNDLE-VERSION: 2026-05-15-standalone
import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 300, regions: ["iad1"] };

/* ── Inline Supabase client (avoid ./lib/db Lambda cold-start crash) ── */
let _supa: any = null;
function db(): any {
  if (_supa) return _supa;
  try {
    _supa = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder"
    );
  } catch (e) { console.error("[task-engine] db init failed:", (e as any)?.message); }
  return _supa;
}

/* ── Inline minimal classifyAndFilterLearning (rule-based, lossy but safe) ── */
function classifyAndFilterLearning(opts: { content: string; source: string; title?: string; requestedType?: string; projectId?: string | null }): {
  shouldSave: boolean; rejectionReason?: string; category: string; confidence: number; autoApprove: boolean; isSystemLevel: boolean;
} {
  const c = (opts.content || "").trim();
  if (c.length < 80)                      return { shouldSave: false, rejectionReason: "too_short",       category: "insight",   confidence: 50, autoApprove: false, isSystemLevel: false };
  if (/^error:|^failed:|cannot find/i.test(c)) return { shouldSave: false, rejectionReason: "error_text", category: "insight",  confidence: 30, autoApprove: false, isSystemLevel: false };
  const lower = c.toLowerCase();
  const category =
    /robots|sitemap|canonical|schema|crawl|index|404|redirect|broken|status code/.test(lower) ? "technical" :
    /algorithm|ranking|core update|signal|e-?e-?a-?t|geo|llm|perplexity/.test(lower)         ? "algorithm" :
    /quick win|low.{0,5}effort|fast/.test(lower)                                              ? "quick-win" :
    /competitor|rival|gap|outrank/.test(lower)                                                ? "competitive" :
    /content|article|landing|copy|page|blog/.test(lower)                                      ? "content" :
    /strategy|roadmap|plan|phase/.test(lower)                                                 ? "strategy" :
    (opts.requestedType || "insight");
  const sourceBoost = /audit/i.test(opts.source) ? 10 : 0;
  const lengthBoost = c.length > 400 ? 5 : 0;
  const confidence  = Math.min(95, 65 + sourceBoost + lengthBoost);
  const autoApprove = ["technical","algorithm","quick-win"].includes(category) || confidence >= 85 || /audit/i.test(opts.source);
  return { shouldSave: true, category, confidence, autoApprove, isSystemLevel: false };
}

/* ── Inline lightweight checkForConflicts (title-similarity only — safe pass-through) ── */
async function checkForConflicts(
  _projectId: string | null, _category: string, title: string, _content: string
): Promise<{ isDuplicate: boolean; isContradiction: boolean; existingId?: string }> {
  try {
    const sbc = db(); if (!sbc) return { isDuplicate: false, isContradiction: false };
    const { data } = await sbc.from("brain_learnings")
      .select("id,card_title")
      .ilike("card_title", title.slice(0, 60))
      .limit(1);
    if ((data as any)?.[0]?.id) return { isDuplicate: true, isContradiction: false, existingId: (data as any)[0].id };
  } catch (_e) {}
  return { isDuplicate: false, isContradiction: false };
}

/* ── Inline logError (mirror of ./lib/db logError — kept inline to avoid Lambda cold-start crash) ── */
async function logError(opts: {
  source:     string;
  action?:    string;
  error:      any;
  projectId?: string;
  metadata?:  Record<string, any>;
}): Promise<void> {
  try {
    await db().from("system_errors").insert({
      source:     opts.source,
      action:     opts.action    || null,
      error_msg:  String(opts.error?.message || opts.error || "unknown"),
      error_code: String(opts.error?.code    || ""),
      project_id: opts.projectId || null,
      metadata:   opts.metadata  || {},
    });
  } catch (_) { /* never throw from the error logger */ }
}

/* ── Inline minimal saveLearning ── */
async function saveLearning(opts: {
  source: string; projectId: string | null; content: string; title?: string;
  cardType?: string; contextSummary?: string; whatWorked?: string[]; whatMissed?: string[];
  tags?: string[]; industry?: string; keywordCluster?: string[]; confidenceOverride?: number;
}): Promise<{ saved: boolean; id?: string; reason?: string }> {
  const cls = classifyAndFilterLearning({ content: opts.content, source: opts.source, title: opts.title, requestedType: opts.cardType, projectId: opts.projectId });
  if (!cls.shouldSave) return { saved: false, reason: cls.rejectionReason };
  try {
    const sbc = db(); if (!sbc) return { saved: false, reason: "no_db" };
    const tags = [...new Set([cls.category, opts.source.split("_")[0], ...(opts.tags || []),
      ...(opts.industry ? [opts.industry.toLowerCase().replace(/\s+/g, "-")] : []),
      ...((opts.keywordCluster || []).map(k => k.toLowerCase().replace(/\s+/g, "-")))])].filter(Boolean);
    const { data } = await sbc.from("brain_learnings").insert({
      project_id:      opts.projectId,
      source:          opts.source,
      card_type:       cls.category,
      card_title:      (opts.title || opts.content.slice(0, 80)).slice(0, 100),
      improvement:     opts.content.slice(0, 800),
      context_summary: opts.contextSummary || opts.source,
      what_worked:     (opts.whatWorked || []).slice(0, 6),
      what_missed:     (opts.whatMissed || []).slice(0, 4),
      tags,
      applied_count:   0,
      status:          cls.autoApprove ? "active" : "pending_review",
      auto_captured:   opts.source !== "manual" && opts.source !== "brain_chat",
      confidence_score: opts.confidenceOverride ?? cls.confidence,
      updated_at:      new Date().toISOString(),
    }).select("id").single();
    return { saved: true, id: (data as any)?.id };
  } catch (_e) { return { saved: false, reason: "db_failed" }; }
}

/* ── Inline minimal saveToDesk ── */
async function saveToDesk(opts: { projectId: string | null; title: string; content: string; contentType: string; source: string; tags?: string[] }): Promise<void> {
  if (!opts.projectId || !opts.content || opts.content.length < 50) return;
  try {
    const sbc = db(); if (!sbc) return;
    await sbc.from("brain_desk").insert({
      project_id:   opts.projectId,
      title:        opts.title.slice(0, 200),
      content_type: opts.contentType,
      content:      opts.content,
      source:       opts.source,
      tags:         [...new Set([...(opts.tags || []), opts.source])].filter(Boolean),
      pinned:       false,
      metadata:     { auto_saved: true },
      updated_at:   new Date().toISOString(),
    });
  } catch (_e) {}
}

const SYSTEM = "You are Manav Brain — senior SEO strategist. Be direct, specific, honest. Never invent data.";

/* ── Safe ok response ── */
function ok(res: VercelResponse, data: object) {
  return res.status(200).json(data);
}

/* ── Blueprints ── */
const WAIT_DAYS: Record<string, number> = {
  technical: 5, content: 14, geo: 7, "quick-win": 3,
  competitive: 21, insight: 0, weekly: 3, monthly: 30, kpi: 7, custom: 5,
};
const CARD_COLORS: Record<string, string> = {
  "quick-win": "#4ade80", weekly: "#60a5fa", monthly: "#a78bfa",
  technical: "#06b6d4", content: "#facc15", geo: "#6366f1",
  competitive: "#fb923c", insight: "#f472b6", kpi: "#34d399", custom: "#94a3b8",
};

async function fetchUrl(url: string): Promise<string> {
  try {
    const u = url.startsWith("http") ? url : "https://" + url;
    const r = await fetch("https://r.jina.ai/" + u, {
      headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "15" },
      signal: AbortSignal.timeout(12000),
    });
    return r.ok ? (await r.text()).slice(0, 4000) : "";
  } catch (_e) { return ""; }
}

/* ── Main handler ── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _run(req, res); }
  catch (e: any) {
    try { res.status(200).json({ error: "Unexpected: " + (e?.message || "unknown"), healthy: false }); } catch (_) {}
  }
}

async function _run(req: VercelRequest, res: VercelResponse) {
  /* Vercel cron trigger (GET or x-vercel-cron header) — auto-routes to verification runner */
  const isCron = req.method === "GET" || req.headers["x-vercel-cron"] === "1";

  if (!isCron && req.method !== "POST") return ok(res, { error: "POST only" });

  const body: any = isCron ? { action: "run_scheduled_verifications" } : (req.body || {});
  const { action } = body;

  /* ── HEALTH CHECK ── */
  if (action === "health_check") {
    try {
      const { error } = await db().from("brain_learnings").select("id").limit(1);
      return ok(res, error
        ? { healthy: false, db: "error", error: error.message }
        : { healthy: true, db: "ok", ts: new Date().toISOString() });
    } catch (e: any) {
      return ok(res, { healthy: false, db: "error", error: e.message });
    }
  }

  /* ── HEALTH DIAGNOSTIC (full env + connectivity + Anthropic live test) ──
     Merged from former api/health-diagnostic.ts. Call: POST /api/task-engine
     with { action: "health_diagnostic" } ── */
  if (action === "health_diagnostic") {
    const results: Record<string, any> = {};

    /* 1. Env vars */
    results.env = {
      SUPABASE_URL:             !!process.env.SUPABASE_URL,
      SUPABASE_URL_value:       (process.env.SUPABASE_URL || "").slice(0, 30) + "...",
      VITE_SUPABASE_URL:        !!process.env.VITE_SUPABASE_URL,
      SUPABASE_ANON_KEY:        !!process.env.SUPABASE_ANON_KEY,
      VITE_SUPABASE_ANON_KEY:   !!process.env.VITE_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_KEY:     !!process.env.SUPABASE_SERVICE_KEY,
      ANTHROPIC_API_KEY:        !!process.env.ANTHROPIC_API_KEY,
      ANTHROPIC_KEY_PREFIX:     (process.env.ANTHROPIC_API_KEY || "").slice(0, 12),
      JINA_API_KEY:             !!process.env.JINA_API_KEY,
      NODE_VERSION:             process.version,
      NODE_ENV:                 process.env.NODE_ENV || "unknown",
      VERCEL_ENV:               process.env.VERCEL_ENV || "unknown",
      VERCEL_REGION:            process.env.VERCEL_REGION || "unknown",
    };

    /* 2. Supabase live ping */
    try {
      const sbc = db();
      if (sbc) {
        const { data, error } = await sbc.from("brain_learnings").select("id").limit(1);
        results.supabase = error
          ? { status: "ERROR", reason: error.message, code: (error as any).code }
          : { status: "OK", rows: data?.length ?? 0 };
      } else { results.supabase = { status: "ERROR", reason: "db() returned null" }; }
    } catch (e: any) { results.supabase = { status: "CRASH", reason: e?.message }; }

    /* 3. Anthropic key validation */
    const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
    results.anthropic = {
      key_present:      !!anthropicKey,
      key_valid_format: anthropicKey.startsWith("sk-ant-"),
      key_prefix:       anthropicKey.slice(0, 12),
      note: anthropicKey
        ? (anthropicKey.startsWith("sk-ant-") ? "Key looks valid" : "WARNING: Key should start with sk-ant-")
        : "MISSING — Anthropic calls will fail with authentication error",
    };

    /* 4. Anthropic live 1-token test */
    if (anthropicKey) {
      try {
        const client = new Anthropic({ apiKey: anthropicKey });
        const msg = await client.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        });
        results.anthropic_live_test = { status: "OK", stop_reason: msg.stop_reason };
      } catch (e: any) {
        results.anthropic_live_test = {
          status: "ERROR",
          reason: (e?.message || "").slice(0, 200),
          is_auth_error:  /401|authentication/i.test(e?.message || ""),
          is_rate_limit:  /429|rate/i.test(e?.message || ""),
          is_model_error: /model|404/i.test(e?.message || ""),
        };
      }
    }

    /* 5. Network */
    try {
      const r = await fetch("https://api.anthropic.com/health", { signal: AbortSignal.timeout(3000) });
      results.network = { anthropic_reachable: r.status < 500, status: r.status };
    } catch (e: any) { results.network = { anthropic_reachable: false, reason: e?.message }; }

    /* 6. Memory */
    const mem = process.memoryUsage();
    results.memory = {
      rss_mb:      Math.round(mem.rss / 1024 / 1024),
      heap_mb:     Math.round(mem.heapUsed / 1024 / 1024),
      heap_max_mb: Math.round(mem.heapTotal / 1024 / 1024),
    };

    return ok(res, {
      timestamp: new Date().toISOString(),
      diagnosis: results,
      summary: {
        can_reach_supabase:  results.supabase?.status === "OK",
        can_reach_anthropic: results.anthropic_live_test?.status === "OK",
        env_vars_ok:         (results.env.SUPABASE_URL || results.env.VITE_SUPABASE_URL) && results.env.ANTHROPIC_API_KEY,
        critical_issues: [
          !results.env.SUPABASE_URL && !results.env.VITE_SUPABASE_URL ? "SUPABASE_URL missing" : null,
          !results.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY missing" : null,
          results.anthropic?.key_present && !results.anthropic?.key_valid_format ? "ANTHROPIC_API_KEY wrong format (should start sk-ant-)" : null,
          results.anthropic_live_test?.is_auth_error ? "ANTHROPIC_API_KEY invalid — authentication rejected" : null,
        ].filter(Boolean),
      },
    });
  }

  /* ── GET ALL LEARNINGS ── */
  if (action === "get_all_learnings") {
    const { project_id } = body;
    try {
      // Strict project isolation: only return learnings for this project.
      // Learnings with project_id=null are institutional knowledge (from archived projects)
      // and are intentionally included so accumulated wisdom is never lost.
      const q = project_id
        ? db().from("brain_learnings").select("*")
            .or(`project_id.eq.${project_id},project_id.is.null`)
            .order("created_at", { ascending: false })
        : db().from("brain_learnings").select("*")
            .is("project_id", null)
            .order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) return ok(res, { error: error.message });
      return ok(res, { success: true, learnings: data || [] });
    } catch (e: any) {
      return ok(res, { error: e.message });
    }
  }

  /* ── SAVE LEARNING (classification gate + conflict check + auto-approval) ── */
  if (action === "save_learning") {
    const {
      project_id, card_type = "insight", card_title = "",
      what_worked, what_missed, redo_reason, improvement,
      context_summary, tags, source = "manual",
      confidence_score: rawConfidence,
    } = body;

    /* ── Run through the classification engine ── */
    const contentToClassify = [improvement, card_title, context_summary]
      .filter(Boolean).join(" ");
    const cls = classifyAndFilterLearning({
      content:       contentToClassify,
      source,
      title:         card_title,
      requestedType: card_type,
      projectId:     project_id,
    });

    if (!cls.shouldSave) {
      return ok(res, {
        success:  false,
        rejected: true,
        reason:   cls.rejectionReason || "Did not meet quality threshold",
      });
    }

    /* Use classified values — category and confidence may differ from caller */
    const resolvedType       = cls.category;
    const resolvedProjectId  = cls.isSystemLevel ? null : (project_id || null);
    const confidence         = cls.confidence;
    const autoApprove        = cls.autoApprove;

    /* ── Conflict check ── */
    const { isDuplicate, isContradiction, existingId } = await checkForConflicts(
      resolvedProjectId, resolvedType, card_title, improvement
    );

    if (isDuplicate && existingId) {
      const { data: existing } = await db()
        .from("brain_learnings").select("*").eq("id", existingId).single();
      if (existing) {
        const merged: any = {
          what_worked: [
            ...new Set([...(existing as any).what_worked || [], ...Array.isArray(what_worked) ? what_worked : []]),
          ].slice(0, 6),
          what_missed: [
            ...new Set([...(existing as any).what_missed || [], ...Array.isArray(what_missed) ? what_missed : []]),
          ].slice(0, 4),
          confidence_score: Math.max((existing as any).confidence_score || 75, confidence),
          improvement: confidence >= ((existing as any).confidence_score || 75) ? improvement : (existing as any).improvement,
          updated_at: new Date().toISOString(),
        };
        if (autoApprove) merged.status = "active";
        const { data, error } = await db()
          .from("brain_learnings").update(merged).eq("id", existingId).select().single();
        if (error) return ok(res, { error: error.message });
        return ok(res, { success: true, learning: data, merged: true });
      }
    }

    const row: any = {
      project_id:      resolvedProjectId,
      card_type:       resolvedType,
      card_title:      card_title.slice(0, 100),
      what_worked:     Array.isArray(what_worked) ? what_worked : [],
      what_missed:     Array.isArray(what_missed) ? what_missed : [],
      redo_reason:     redo_reason || null,
      improvement:     improvement || null,
      context_summary: context_summary || null,
      tags:            Array.isArray(tags)
        ? [...new Set([resolvedType, ...tags])]
        : [resolvedType, ...(cls.isSystemLevel ? ["system"] : [])],
      source,
      applied_count:   0,
      updated_at:      new Date().toISOString(),
    };

    if (isContradiction) {
      row.tags = [...(row.tags || []), "contradiction-flagged"];
    }

    try {
      const { data, error } = await db().from("brain_learnings").insert({
        ...row,
        status:           autoApprove ? "active" : "pending_review",
        auto_captured:    source !== "manual" && source !== "brain_chat",
        confidence_score: confidence,
      }).select().single();
      if (error) throw error;
      return ok(res, {
        success:        true,
        learning:       data,
        auto_approved:  autoApprove,
        contradiction:  isContradiction,
        classified_as:  resolvedType,
        system_level:   cls.isSystemLevel,
      });
    } catch (_e) {
      const { data, error } = await db().from("brain_learnings").insert(row).select().single();
      if (error) return ok(res, { error: error.message });
      return ok(res, { success: true, learning: data, auto_approved: false });
    }
  }

  /* ── GET RELEVANT (for Brain context — sorted by applied_count + recency) ── */
  if (action === "get_relevant") {
    const { project_id, card_type, limit = 12 } = body;

    const fetch = async (projId?: string, type?: string, status = "active") => {
      try {
        let q: any = db().from("brain_learnings").select("*").eq("status", status);
        if (projId) q = q.or(`project_id.eq.${projId},project_id.is.null`);
        if (type)   q = q.eq("card_type", type);
        const { data } = await q
          .order("applied_count", { ascending: false })
          .order("confidence_score", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(limit);
        return data || [];
      } catch (_e) {
        // Fallback without status filter
        let q: any = db().from("brain_learnings").select("*");
        if (projId) q = q.eq("project_id", projId);
        if (type)   q = q.eq("card_type", type);
        const { data } = await q.order("created_at", { ascending: false }).limit(limit);
        return data || [];
      }
    };

    const seen = new Set<string>();
    let rows: any[] = [];

    // 1. Project-specific + type match
    if (project_id && card_type) {
      const r = await fetch(project_id, card_type);
      r.forEach((x: any) => { if (!seen.has(x.id)) { seen.add(x.id); rows.push(x); } });
    }
    // 2. Cross-project same type
    if (rows.length < limit && card_type) {
      const r = await fetch(undefined, card_type);
      r.forEach((x: any) => { if (!seen.has(x.id)) { seen.add(x.id); rows.push(x); } });
    }
    // 3. Project any type
    if (rows.length < 4 && project_id) {
      const r = await fetch(project_id);
      r.forEach((x: any) => { if (!seen.has(x.id)) { seen.add(x.id); rows.push(x); } });
    }
    rows = rows.slice(0, limit);

    // Increment applied_count async
    Promise.resolve().then(async () => {
      for (const id of rows.slice(0, 5).map((r: any) => r.id)) {
        try {
          const { data: d } = await db().from("brain_learnings").select("applied_count").eq("id", id).single();
          if (d) await db().from("brain_learnings").update({
            applied_count: ((d as any).applied_count || 0) + 1,
            updated_at: new Date().toISOString(),
          }).eq("id", id);
        } catch (_e) {}
      }
    }).catch(() => {});

    return ok(res, { success: true, learnings: rows });
  }

  /* ── DELETE LEARNING ── */
  if (action === "delete_learning") {
    const { id } = body;
    if (!id) return ok(res, { error: "id required" });
    try {
      const { data: item } = await db().from("brain_learnings").select("source").eq("id", id).single();
      if ((item as any)?.source?.endsWith("_log")) return ok(res, { error: "Immutable log entry" });
    } catch (_e) {}
    const { error } = await db().from("brain_learnings").delete().eq("id", id);
    if (error) return ok(res, { error: error.message });
    return ok(res, { success: true });
  }

  /* ── UPDATE LEARNING ── */
  if (action === "update_learning") {
    const { id, improvement, tags, what_worked, what_missed, confidence_score } = body;
    if (!id) return ok(res, { error: "id required" });
    const updates: any = { updated_at: new Date().toISOString() };
    if (improvement !== undefined)    updates.improvement    = improvement;
    if (what_worked !== undefined)    updates.what_worked    = what_worked;
    if (what_missed !== undefined)    updates.what_missed    = what_missed;
    if (confidence_score !== undefined) updates.confidence_score = Number(confidence_score);
    if (tags !== undefined) {
      updates.tags = Array.isArray(tags) ? tags : String(tags).split(",").map((t: string) => t.trim()).filter(Boolean);
    }
    const { data, error } = await db().from("brain_learnings").update(updates).eq("id", id).select().single();
    if (error) return ok(res, { error: error.message });
    return ok(res, { success: true, learning: data });
  }

  /* ── APPROVE / REJECT / DEACTIVATE ── */
  if (action === "approve_learning") {
    const { id } = body;
    if (!id) return ok(res, { error: "id required" });
    const { data, error } = await db().from("brain_learnings")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) return ok(res, { error: error.message });
    return ok(res, { success: true, learning: data });
  }

  if (action === "reject_learning") {
    const { id } = body;
    if (!id) return ok(res, { error: "id required" });
    const { data, error } = await db().from("brain_learnings")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) return ok(res, { error: error.message });
    return ok(res, { success: true, learning: data });
  }

  if (action === "deactivate_learning") {
    const { id } = body;
    if (!id) return ok(res, { error: "id required" });
    const { data, error } = await db().from("brain_learnings")
      .update({ status: "pending_review", updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) return ok(res, { error: error.message });
    return ok(res, { success: true, learning: data });
  }

  /* ── CHECK LEARNING FRESHNESS (called by AlgorithmIntel after save) ── */
  if (action === "check_learning_freshness") {
    const { topic_category = "", topic_tags = [] } = body;
    const categoryToCardTypes: Record<string, string[]> = {
      core_update:     ["technical","content","insight"],
      helpful_content: ["content","insight"],
      eeat:            ["content","insight","competitive"],
      core_web_vitals: ["technical","quick-win"],
      technical:       ["technical","quick-win"],
      geo_ai:          ["geo"],
      links:           ["competitive","technical"],
    };
    const relatedTypes = categoryToCardTypes[topic_category] || ["technical","content","geo","insight"];
    try {
      const { data: affected } = await db()
        .from("brain_learnings")
        .select("id, card_title, card_type, tags")
        .in("card_type", relatedTypes)
        .eq("status", "active")
        .limit(20);
      const count = affected?.length || 0;
      return ok(res, { success: true, affected_count: count, affected_learnings: (affected || []).slice(0, 5) });
    } catch (_e) {
      return ok(res, { success: true, affected_count: 0, affected_learnings: [] });
    }
  }

  /* ── SAVE TO DESK ── */
  if (action === "save_to_desk") {
    const { project_id, title, content, content_type = "text", source: deskSource = "brain", tags: deskTags = [] } = body;
    if (!project_id || !title || !content) return ok(res, { error: "project_id, title and content required" });
    try {
      const { data, error } = await db().from("brain_desk").insert({
        project_id, title: title.slice(0, 200), content_type, content,
        source: deskSource,
        tags: Array.isArray(deskTags) ? [...deskTags, deskSource] : [deskSource],
        pinned: false,
        metadata: { saved_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }).select().single();
      if (error) return ok(res, { error: error.message });
      return ok(res, { success: true, item: data });
    } catch (e: any) {
      return ok(res, { error: e.message });
    }
  }

  /* ── ADD CANVAS CARD ── */
  if (action === "add_canvas_card") {
    const { project_id, card: newCard } = body;
    if (!project_id || !newCard?.type || !newCard?.title) {
      return ok(res, { error: "project_id, card.type, and card.title are required" });
    }
    try {
      const { data: proj, error: projErr } = await db()
        .from("projects").select("playground_strategy, playground_canvas").eq("id", project_id).single();
      if (projErr) return ok(res, { error: projErr.message });
      const strategy = proj?.playground_strategy || { canvas_blocks: [] };
      if (!Array.isArray(strategy.canvas_blocks)) strategy.canvas_blocks = [];
      const cardId = "brain_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      const builtCard = {
        id: cardId, type: newCard.type, title: newCard.title,
        content: newCard.content || "",
        color: CARD_COLORS[newCard.type] || "#94a3b8",
        priority: newCard.priority || "medium",
        status: "todo", week: Number(newCard.week) || 1,
        placed: true, effort: newCard.effort || null, impact: newCard.impact || null,
        tags: [...(newCard.tags || []), "brain-created"],
        source: "Manav Brain", assignee: null, aiAssisted: true,
      };
      strategy.canvas_blocks.push(builtCard);
      const canvas = Array.isArray(proj?.playground_canvas) ? proj.playground_canvas : [];
      canvas.push({
        id: cardId, placed: true, week: builtCard.week, status: "todo",
        assignee: null, aiAssisted: true, tags: builtCard.tags,
        effort: null, impact: null, title: builtCard.title, content: builtCard.content,
        type: builtCard.type, priority: builtCard.priority, color: builtCard.color,
        source: "Manav Brain",
      });
      const { error: saveErr } = await db()
        .from("projects").update({ playground_strategy: strategy, playground_canvas: canvas })
        .eq("id", project_id);
      if (saveErr) return ok(res, { error: saveErr.message });
      return ok(res, { success: true, card: builtCard });
    } catch (e: any) {
      return ok(res, { error: e.message });
    }
  }

  /* ── SCHEDULE VERIFICATION — Module 02 The Closed Loop ── */
  if (action === "schedule_verification") {
    const { projectId, taskId, cardType, cardTitle, siteUrl, checkType } = body;
    if (!projectId || !taskId) {
      return ok(res, { error: "projectId and taskId required" });
    }

    /* Days-until-verify by card type */
    const daysMap: Record<string, number> = {
      technical:    5,
      content:      14,
      geo:          7,
      "quick-win":  3,
      competitive:  10,
    };
    const days = daysMap[cardType] || 7;
    const scheduledFor = new Date();
    scheduledFor.setDate(scheduledFor.getDate() + days);

    const { data, error } = await db()
      .from("verification_queue")
      .insert({
        project_id:    projectId,
        task_id:       taskId,
        card_type:     cardType || "general",
        card_title:    cardTitle || "",
        site_url:      siteUrl || null,
        check_type:    checkType || "standard",
        scheduled_for: scheduledFor.toISOString(),
        status:        "pending",
      })
      .select()
      .single();

    if (error) {
      await logError({ source: "task-engine", action: "schedule_verification", error }).catch(() => {});
      return ok(res, { success: false, error: error.message });
    }

    return ok(res, {
      success:        true,
      id:             data.id,
      scheduledFor:   scheduledFor.toISOString(),
      daysUntilCheck: days,
    });
  }

  /* ── RUN SCHEDULED VERIFICATIONS — Module 02 The Closed Loop runner ── */
  if (action === "run_scheduled_verifications") {
    const now = new Date().toISOString();

    /* Get all pending verifications due now */
    const { data: due } = await db()
      .from("verification_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .limit(10);

    if (!due || due.length === 0) {
      return ok(res, { success: true, processed: 0, message: "No verifications due" });
    }

    const results: any[] = [];

    for (const item of due) {
      /* Mark as executing */
      await db()
        .from("verification_queue")
        .update({ status: "executing", updated_at: new Date().toISOString() })
        .eq("id", item.id);

      try {
        const daysSince =
          item.check_type === "quick" ? 3 :
          item.check_type === "deep"  ? 14 : 7;

        const prompt = `You are verifying whether an SEO task produced real results.

TASK: "${item.card_title}"
TYPE: ${item.card_type}
SITE: ${item.site_url || "Not specified"}
SCHEDULED: ${item.scheduled_for}
DAYS SINCE COMPLETION: approximately ${daysSince}

Check: Did this ${item.card_type} task likely produce measurable results by now?
Consider: typical timeframes for this task type, common success patterns.

Respond with JSON only:
{
  "verdict": "working" | "not_working" | "too_early" | "cannot_determine",
  "confidence": 0-100,
  "evidence_found": ["what signals suggest it worked"],
  "evidence_missing": ["what would confirm it better"],
  "hod_note": "one sentence summary for the king"
}`;

        const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type":     "application/json",
            "x-api-key":        process.env.ANTHROPIC_API_KEY || "",
            "anthropic-version":"2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 500,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        const aiData = await aiRes.json() as any;
        const rawText = aiData?.content?.[0]?.text || "{}";

        let parsed: any = {};
        try {
          const clean = rawText.replace(/```json|```/g, "").trim();
          parsed = JSON.parse(clean);
        } catch (_) {
          parsed = { verdict: "cannot_determine", confidence: 0 };
        }

        const verdict = parsed.verdict || "cannot_determine";

        /* Update queue item */
        await db()
          .from("verification_queue")
          .update({
            status:     "done",
            verdict,
            evidence: {
              found:   parsed.evidence_found   || [],
              missing: parsed.evidence_missing || [],
              note:    parsed.hod_note || "",
            },
            attempts:   (item.attempts || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        /* Auto-save as Brain Learning (fire and forget) */
        if (verdict !== "cannot_determine" && verdict !== "too_early" && item.project_id) {
          Promise.resolve().then(async () => {
            await saveLearning({
              source:        "verify_outcome",
              projectId:     item.project_id,
              content:       `Verdict: ${verdict}. ${parsed.hod_note || ""}`,
              title:         `Verified: ${item.card_type} — ${(item.card_title || "").slice(0, 55)}`,
              cardType:      item.card_type,
              whatWorked:    parsed.evidence_found   || [],
              whatMissed:    parsed.evidence_missing || [],
              contextSummary:`Auto-verified after ${item.check_type} check. Site: ${item.site_url}`,
            } as any);
          }).catch(() => {});
        }

        results.push({ id: item.id, title: item.card_title, verdict });
      // Auto-extract learning from verification
      if (item.project_id && parsed.hod_note) {
        extractAndSaveLearning({
          source: 'verify_outcome',
          projectId: item.project_id,
          content: `Verdict: ${verdict}. ${parsed.hod_note} Evidence found: ${(parsed.evidence_found||[]).join(', ')}`,
          context: `Verification of: ${item.card_title}`,
          cardType: item.card_type,
        });
      }

      } catch (err: any) {
        await db()
          .from("verification_queue")
          .update({
            status:     "failed",
            attempts:   (item.attempts || 0) + 1,
            evidence:   { error: err?.message || "unknown" },
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        await logError({
          source:    "task-engine",
          action:    "run_scheduled_verifications",
          error:     err,
          projectId: item.project_id,
          metadata:  { queueId: item.id, taskId: item.task_id },
        }).catch(() => {});

        results.push({ id: item.id, title: item.card_title, verdict: "error" });
      }
    }

    return ok(res, {
      success:   true,
      processed: results.length,
      results,
      timestamp: new Date().toISOString(),
    });
  }

  /* ── REQUIREMENTS ── */
  if (action === "requirements") {
    const { card, context = {}, userInputs = {} } = body;

  if (!card) return ok(res, { error: "Missing card" });

    const BLUEPRINTS: Record<string, any> = {
      technical: {
        what_ai_produces: "Ready-to-deploy code, redirects, schema, robots.txt, and step-by-step instructions.",
        required_inputs: [
          { key: "affected_urls",    label: "Affected URLs (paste 3-5)",    why: "Cannot generate fix without exact paths",              autoFetchable: false },
          { key: "current_behavior", label: "What is currently broken",      why: "Error type determines the correct fix",                autoFetchable: false },
          { key: "live_site_fetch",  label: "Live site scan",                why: "I will fetch the page to see the issue directly",      autoFetchable: true  },
        ],
        review_checklist: ["Test in staging", "Verify HTTP status codes", "Request re-indexing", "Check PageSpeed"],
        verification_method: "GSC Coverage report + HTTP status check",
      },
      content: {
        what_ai_produces: "Full draft with meta title, meta description, heading structure, schema markup.",
        required_inputs: [
          { key: "target_keyword",      label: "Primary target keyword",          why: "Content is built around this",             autoFetchable: false },
          { key: "search_intent",       label: "Search intent",                    why: "Determines format and depth",              autoFetchable: false },
          { key: "word_count_target",   label: "Target word count",                why: "Determines depth",                         autoFetchable: false },
          { key: "brand_voice_example", label: "One example of brand writing",     why: "Without this output will be generic",      autoFetchable: false },
        ],
        review_checklist: ["Verify every statistic", "Meta title under 60 chars", "Validate schema"],
        verification_method: "GSC Performance: impressions and position — 14 days after publishing",
      },
      geo: {
        what_ai_produces: "Rewritten intro, FAQ section with schema, entity-rich summary block.",
        required_inputs: [
          { key: "current_content", label: "Current page URL or content",          why: "Need to read before improving",             autoFetchable: true  },
          { key: "target_query",    label: "Exact query for Perplexity/ChatGPT",   why: "GEO strategy is query-specific",            autoFetchable: false },
          { key: "ai_platform",     label: "Priority platform",                    why: "Each platform cites differently",           autoFetchable: false },
        ],
        review_checklist: ["Screenshot Perplexity before deploying", "Validate schema"],
        verification_method: "Manual Perplexity and ChatGPT check — before and after screenshots",
      },
      "quick-win": {
        what_ai_produces: "Before and after for meta titles, descriptions, headings, alt tags.",
        required_inputs: [
          { key: "target_urls",   label: "URLs to optimise (1–10)", why: "I fetch each page and generate specific improvements", autoFetchable: true  },
          { key: "target_metric", label: "Metric to move",          why: "CTR, rankings, impressions need different approaches", autoFetchable: false },
        ],
        review_checklist: ["Meta titles < 60 chars", "Descriptions < 160 chars", "Check GSC CTR 7 days later"],
        verification_method: "GSC CTR and position — 7 days before vs after",
      },
      competitive: {
        what_ai_produces: "Gap analysis table, content to create, keyword plan with priority order.",
        required_inputs: [
          { key: "competitor_url",  label: "Competitor domain", why: "I fetch their pages to find exact gaps",               autoFetchable: true  },
          { key: "target_keywords", label: "Keywords to compete on", why: "Without this analysis is too broad",              autoFetchable: false },
        ],
        review_checklist: ["Cross-check in Semrush/Ahrefs", "Track positions 30 days after"],
        verification_method: "Position tracking — your ranking vs competitor after 30 days",
      },
    };

    const bp = BLUEPRINTS[card.type] || {
      what_ai_produces: "Step-by-step execution brief with numbered instructions.",
      required_inputs: [{ key: "task_context", label: "More context about what needs doing", why: "Context determines the right approach", autoFetchable: false }],
      review_checklist: ["Review output against definition of done"],
      verification_method: "Check deliverable matches the brief",
    };

    const ctxMap: Record<string, string> = {
      target_keyword:  context.goals?.keywords || (context.project?.keywords || [])[0] || "",
      competitor_url:  context.competitors?.c1 || "",
      live_site_fetch: context.project?.url    || "",
      current_content: context.project?.url    || "",
    };

    const available: any[] = [];
    const missing: any[]   = [];

    for (const inp of bp.required_inputs) {
      const fromCtx  = ctxMap[inp.key];
      const fromUser = userInputs[inp.key];
      if (fromUser)                                       available.push({ label: inp.label, value: fromUser,  source: "You provided" });
      else if (fromCtx)                                   available.push({ label: inp.label, value: fromCtx,   source: "From Data Room" });
      else if (inp.autoFetchable && context.project?.url) available.push({ label: inp.label, value: "Will fetch: " + context.project.url, source: "Auto-fetch" });
      else                                                missing.push(inp);
    }

    const gaps: string[] = [];
    if (context.gaps?.noGoal)      gaps.push("No campaign goal set in Data Room");
    if (context.gaps?.noCMS)       gaps.push("CMS not recorded");
    if (context.gaps?.noAnalytics) gaps.push("No analytics baseline");
    if (context.gaps?.noDocuments) gaps.push("No tool exports uploaded");

    return ok(res, {
      success: true, blueprint: bp, available, missing,
      data_room_gaps: gaps, can_execute_now: missing.length === 0,
    });
  }

  /* ── VERIFY ── */
  if (action === "verify") {
    const { card, context = {}, completedAt, checkType = "guidance", completionNote = "", evidenceData = "" } = body;
    if (!card) return ok(res, { error: "Missing card" });

    const waitDays  = WAIT_DAYS[card.type] || 5;
    const compDate  = completedAt ? new Date(completedAt) : new Date();
    const daysSince = Math.floor((Date.now() - compDate.getTime()) / 86400000);
    const daysLeft  = Math.max(0, waitDays - daysSince);
    if (checkType === "waiting_check") return ok(res, { success: true, waitDays, daysSince, daysLeft, waitExpired: daysLeft === 0 });

    let liveContent = "";
    if (body.siteUrl && checkType === "live_check") liveContent = await fetchUrl(body.siteUrl);

    const prompt = [
      "Strict quality review. Never approve without evidence.",
      `TASK: ${card.type} | "${card.title}" | Priority: ${card.priority}`,
      `Days since completion: ${daysSince} / Required wait: ${waitDays}`,
      `Wait: ${daysLeft === 0 ? "COMPLETE" : `INCOMPLETE — ${daysLeft} days remain`}`,
      `COMPLETION NOTE: ${completionNote || "(none — red flag)"}`,
      `EVIDENCE: ${evidenceData || "(none — cannot approve)"}`,
      liveContent ? `LIVE SITE: ${liveContent}` : "",
      'Return ONLY valid JSON: {"verdict":"verified|not_verified|partial|waiting|cannot_determine","confidence":0,"evidence_found":[],"evidence_missing":[],"what_to_check":[],"timeline_note":"","next_action":"","hod_note":""}',
    ].filter(Boolean).join("\n");

    try {
      const r = await new Anthropic().messages.create({
        model: "claude-sonnet-4-6", max_tokens: 2000, system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      const raw = r.content[0].type === "text" ? r.content[0].text : "{}";
      let parsed: any = {};
      try { parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch (_e) {}

      /* ── Auto-learning from verify verdict (fire-and-forget) ── */
      const verifyProjId = (body.projectId || null) as string | null;
      if (verifyProjId && parsed.verdict && parsed.verdict !== "waiting" && parsed.verdict !== "cannot_determine") {
        Promise.resolve().then(async () => {
          await saveLearning({
            source:         "verify_outcome",
            projectId:      verifyProjId,
            content:        `Verdict: ${parsed.verdict}. ${parsed.hod_note || parsed.timeline_note || ""}. Evidence: ${(parsed.evidence_found || []).join(". ")}`,
            title:          `Verified: ${card.type} — ${(card.title || "").slice(0, 55)}`,
            cardType:       card.type,
            whatWorked:     parsed.evidence_found   || [],
            whatMissed:     parsed.evidence_missing || [],
            contextSummary: `verify_outcome — ${card.type}: ${card.title}. Verdict: ${parsed.verdict}`,
            tags:           [card.type, "verified", parsed.verdict],
            confidenceOverride: parsed.confidence || undefined,
          });
        }).catch(() => {});
      }

      return ok(res, {
        success: true, ...parsed,
        waiting_status: { waitDays, daysSince, daysLeft, waitExpired: daysLeft === 0 },
      });
    } catch (e: any) {
      return ok(res, { success: false, error: e.message });
    }
  }

  /* ── EXECUTE (streaming) ── */
  if (action === "execute") {
    const { card, context = {}, userInputs = {}, role = "senior_seo", brainLearnings = [] } = body;
    if (!card) return ok(res, { error: "Missing card" });

    const ROLE_VOICE: Record<string, string> = {
      content_writer:  "You are briefing a content writer. Be exact: what to write, why, what great looks like.",
      team_lead:       "You are briefing your team lead. Direct, specific steps, honest about risks.",
      executive:       "You are advising a business owner. Outcomes only. Revenue and competitive position.",
      senior_seo:      "You are a senior SEO strategist. Include algorithm reasoning and compounding effects.",
      project_manager: "You are a PM. Deliverables, acceptance criteria, dependencies, timeline.",
    };

    let liveContent = "";
    if (context.project?.url) {
      const pageUrl = userInputs.target_urls?.split("\n")[0]?.trim() || userInputs.competitor_url || context.project.url;
      liveContent = await fetchUrl(pageUrl);
    }

    const learningsBlock = brainLearnings.length > 0
      ? "BRAIN LEARNINGS — APPLY THESE:\n" + brainLearnings.map((l: any, i: number) =>
          `  [${i+1}] ${l.card_type} | "${l.card_title}"\n` +
          (l.what_missed?.length ? `    Gaps: ${l.what_missed.join(" | ")}\n` : "") +
          (l.improvement ? `    Apply: ${l.improvement}\n` : "")
        ).join("")
      : "";

    const executePrompt = [
      (ROLE_VOICE[role] || ROLE_VOICE.senior_seo),
      "",
      `TASK: [${card.type.toUpperCase()}] ${card.title}`,
      card.content ? `Description: ${card.content}` : "",
      `Priority: ${card.priority || "medium"} | Impact: ${card.impact || "not specified"}`,
      "",
      "PROJECT INTELLIGENCE:",
      `Company: ${context.project?.name || "Unknown"} | URL: ${context.project?.url || "Not set"}`,
      `CMS: ${context.tech?.cms || "Not recorded"} | SEO Plugin: ${context.tech?.seoPlugin || "Not recorded"}`,
      `Goal: ${context.goals?.primary || "Not set"} | Timeline: ${context.goals?.timeline || "Not set"}`,
      `Keywords: ${context.goals?.keywords || (context.project?.keywords || []).slice(0, 5).join(", ") || "Not set"}`,
      `Organic: ${context.analytics?.organicMonthly || "Unknown"}/mo`,
      `Competitors: ${[context.competitors?.c1, context.competitors?.c2].filter(Boolean).join(", ") || "Not recorded"}`,
      "",
      Object.keys(userInputs).length > 0
        ? "INPUTS:\n" + Object.entries(userInputs).map(([k, v]) => `${k}: ${v}`).join("\n")
        : "",
      liveContent ? `\nLIVE PAGE DATA:\n${liveContent}` : "",
      learningsBlock ? "\n" + learningsBlock : "",
      "",
      "RULES: State only facts from data above. Flag every assumption.",
      "End with Manav's Take — what excites you, what to watch, one honest concern.",
    ].filter(l => l !== "").join("\n");

    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache, no-transform",
      "Transfer-Encoding": "chunked",
    });

    let execFull = "";
    try {
      const stream = await new Anthropic().messages.stream({
        model: "claude-sonnet-4-6", max_tokens: 8192, system: SYSTEM,
        messages: [{ role: "user", content: executePrompt }],
      });
      let stopReason = "";
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          const t = chunk.delta.text;
          res.write(t);
          execFull += t;
        }
        if (chunk.type === "message_delta" && chunk.delta.stop_reason) stopReason = chunk.delta.stop_reason;
      }
      if (stopReason === "max_tokens") res.write("\n\n---\n⚠️ Output reached length limit.");
    } catch (err: any) {
      res.write(`\nError: ${err.message}`);
    } finally {
      res.end();
    }

    // Background: save desk item + learning via unified pipeline
    const deskProjId = (body.projectId || context?.project?.id || null) as string | null;
    if (deskProjId && execFull.length > 300) {
      Promise.resolve().then(async () => {
        await saveToDesk({
          projectId:   deskProjId,
          title:       (card.title || "Task Output").slice(0, 200),
          content:     execFull,
          contentType: card.type === "technical" ? "code" : card.type === "audit" ? "audit" : "report",
          source:      "task_execute",
          tags:        [card.type, "auto-saved"],
        });
        await saveLearning({
          source:    "task_execution_auto",
          projectId: deskProjId,
          content:   execFull,
          title:     `${card.type}: ${(card.title || "").slice(0, 55)}`,
          cardType:  card.type,
          contextSummary: `${card.type} task execution`,
          tags:      [card.type, "task-execute"],
        });
      }).catch(() => {});
    }

    /* ── Module 02 — auto-schedule verification (fire and forget) ── */
    Promise.resolve().then(async () => {
      const projId  = (body.projectId || context?.project?.id || null) as string | null;
      const taskUrl = context?.project?.url || (context as any)?.url || null;
      if (projId && card?.id) {
        const daysMap: Record<string, number> = {
          technical: 5, content: 14, geo: 7, "quick-win": 3, competitive: 10,
        };
        const d = new Date();
        d.setDate(d.getDate() + (daysMap[card.type] || 7));
        await db()
          .from("verification_queue")
          .insert({
            project_id:    projId,
            task_id:       card.id,
            card_type:     card.type || "general",
            card_title:    card.title || "",
            site_url:      taskUrl,
            check_type:    "standard",
            scheduled_for: d.toISOString(),
            status:        "pending",
          });
      }
    }).catch(() => {});

    return;
  }


  
  if (action === 'client_brief') {
    const { projectId, briefType = 'progress' } = body;
    if (!projectId) return ok(res, { error: 'projectId required' });
    const [projR,metricsR,taskR,learnR] = await Promise.allSettled([
      db().from('projects').select('name,url,goals,industry').eq('id',projectId).single(),
      db().from('metrics').select('llm_visibility_score,algorithm_health_score').eq('project_id',projectId).order('recorded_at',{ascending:false}).limit(1),
      db().from('task_executions').select('task_type,status').eq('project_id',projectId).eq('status','done').order('created_at',{ascending:false}).limit(10),
      db().from('brain_learnings').select('card_title').eq('project_id',projectId).eq('status','active').order('applied_count',{ascending:false}).limit(5),
    ]);
    const proj    = projR.status==='fulfilled'    ? projR.value.data         : null;
    const metrics = metricsR.status==='fulfilled' ? metricsR.value.data?.[0] : null;
    const tasks   = taskR.status==='fulfilled'    ? taskR.value.data   || [] : [];
    const learns  = learnR.status==='fulfilled'   ? learnR.value.data  || [] : [];
    if (!proj) return ok(res, { error: 'Project not found' });
    const templates: Record<string,string> = {
      progress: `Write a professional 3-paragraph client progress update for ${proj.name}. Goals: ${proj.goals||'being established'}. Tasks done: ${tasks.length}. Key learnings: ${learns.map((l:any)=>l.card_title).join('; ')||'accumulating'}. Scores: ${metrics?`LLM ${metrics.llm_visibility_score}/100`:'first audit pending'}. Plain business language, no jargon. End with what happens next week.`,
      renewal:  `Write a compelling renewal brief for ${proj.name}. ${tasks.length} tasks completed. ${learns.length} proven strategies captured. ${metrics?`Current LLM score: ${metrics.llm_visibility_score}/100.`:''} Make the ROI case clearly in plain language.`,
      objection:`Client questioning the strategy for ${proj.name}. Write a confident, data-grounded response. ${tasks.length} tasks done, ${learns.length} learnings proven. Address concerns with facts, propose clear next steps.`,
      upsell:   `Identify 3 expansion opportunities for ${proj.name} in ${proj.industry||'their industry'}. Format: Opportunity → Why now → Expected impact. Be specific and compelling.`,
    };
    const aiRes = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY||'','anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:900,messages:[{role:'user',content:templates[briefType]||templates.progress}]}),
    });
    const aiJson = await aiRes.json() as any;
    return ok(res, { success:true, brief:aiJson?.content?.[0]?.text||'Failed', briefType, projectName:proj.name });
  }


  if (action === 'record_attribution') {
    const { projectId,taskId,taskType,taskTitle,completedAt,metricBefore,metricAfter,notes } = body;
    if (!projectId||!taskId) return ok(res,{error:'projectId+taskId required'});
    const before=metricBefore||{};const after=metricAfter||{};
    const delta:Record<string,number>={};
    for(const k of Object.keys(after)){if(typeof after[k]==='number'&&typeof before[k]==='number')delta[k]=after[k]-before[k];}
    const completed=new Date(completedAt||Date.now());
    const days=Math.round((Date.now()-completed.getTime())/864e5);
    const positive=Object.values(delta).some((v:any)=>(v as number)>0);
    const {data,error}=await db().from('attribution_log').insert({
      project_id:projectId,task_id:taskId,task_type:taskType||'general',task_title:taskTitle||'',
      completed_at:completed.toISOString(),verified_at:new Date().toISOString(),
      metric_before:before,metric_after:after,delta,
      attribution_confidence:positive?75:40,days_to_impact:days,notes:notes||''
    }).select().single();
    if(error)return ok(res,{success:false,error:error.message});
    return ok(res,{success:true,id:data.id,daysToImpact:days,delta});
  }


  if (action === 'mine_patterns') {
    const { minProjects = 3, minConfidence = 65 } = body;
    // Find brain_learnings that repeat across multiple projects
    const { data: learnings } = await db()
      .from('brain_learnings')
      .select('card_type,card_title,what_worked,project_id,confidence_score,applied_count')
      .eq('status','active')
      .gte('confidence_score', minConfidence)
      .order('applied_count', { ascending: false })
      .limit(200);
    if (!learnings?.length) return ok(res, { patterns: [], message: 'No learnings yet' });
    // Group by normalised title similarity
    const groups: Record<string, any[]> = {};
    for (const l of learnings) {
      const key = (l.card_type + ':' + l.card_title.toLowerCase().slice(0,40)).replace(/\s+/g,'_');
      if (!groups[key]) groups[key] = [];
      groups[key].push(l);
    }
    const patterns = [];
    for (const [key, items] of Object.entries(groups)) {
      const projectIds = [...new Set(items.map((i:any) => i.project_id))];
      if (projectIds.length < minProjects) continue;
      const existing = await db().from('empire_patterns').select('id').eq('title', items[0].card_title).single();
      if (!existing.data) {
        await db().from('empire_patterns').insert({
          pattern_type: items[0].card_type, title: items[0].card_title,
          description: `Proven across ${projectIds.length} projects`,
          evidence: items.slice(0,5).map((i:any)=>({project:i.project_id,worked:i.what_worked})),
          project_count: projectIds.length,
          confidence: Math.round(items.reduce((s:number,i:any)=>s+(i.confidence_score||65),0)/items.length),
          tags: [items[0].card_type],
        });
        patterns.push({ title: items[0].card_title, projects: projectIds.length });
      }
    }
    return ok(res, { success:true, newPatterns: patterns.length, patterns });
  }


  if (action === 'generate_role_brief') {
    const { projectId, role = 'strategist', context: ctx2 } = body;
    if (!projectId) return ok(res, { error: 'projectId required' });
    const voiceMap: Record<string,string> = {
      king:       'You are briefing the founder. Be direct, strategic, and visionary. Lead with wins, then risks, then what to decide. No fluff.',
      strategist: 'You are briefing a senior SEO strategist. Technical depth welcome. Show the data, explain the pattern, recommend the action.',
      writer:     'You are briefing a content writer. Plain language. Tell them what to write, why it matters, what the angle should be. No scores or metrics.',
      client:     'You are briefing a business owner. Translate everything to business impact. No SEO jargon. Focus on traffic, leads, and revenue implications.',
      executive:  'You are briefing a C-suite executive. One paragraph max. ROI focus. What was invested, what returned, what is the trajectory.',
    };
    const voice = voiceMap[role] || voiceMap.strategist;
    const [projR, taskR, learnR] = await Promise.allSettled([
      db().from('projects').select('name,goals,url').eq('id',projectId).single(),
      db().from('task_executions').select('task_type,output').eq('project_id',projectId).eq('status','done').order('created_at',{ascending:false}).limit(5),
      db().from('brain_learnings').select('card_title,what_worked').eq('project_id',projectId).order('applied_count',{ascending:false}).limit(3),
    ]);
    const proj  = projR.status==='fulfilled'  ? projR.value.data    : null;
    const tasks = taskR.status==='fulfilled'  ? taskR.value.data||[] : [];
    const learns= learnR.status==='fulfilled' ? learnR.value.data||[] : [];
    if (!proj) return ok(res, { error: 'Project not found' });
    const prompt = `${voice}\n\nProject: ${proj.name}\nGoals: ${proj.goals||'not set'}\nRecent tasks: ${tasks.map((t:any)=>t.task_type).join(', ')||'none'}\nProven learnings: ${learns.map((l:any)=>l.card_title).join('; ')||'accumulating'}\n${ctx2||''}`;
    const aiRes = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY||'','anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:600,messages:[{role:'user',content:prompt}]}),
    });
    const aiJson=await aiRes.json() as any;
    return ok(res,{success:true,brief:aiJson?.content?.[0]?.text||'Failed',role,projectName:proj.name});
  }

  /* ── WEEKLY BRAIN BRIEF — Module 04 The Automation Layer ── */
  if (action === "weekly_brain_brief") {
    const { projectIds } = body;
    if (!projectIds || !projectIds.length) {
      return ok(res, { error: "projectIds required" });
    }
    const briefItems: any[] = [];
    for (const pid of projectIds.slice(0, 10)) {
      const [projR, metricsR, learnR, verifyR] = await Promise.allSettled([
        db().from("projects").select("name,url,goals,cms,keywords").eq("id", pid).single(),
        db().from("metrics").select("llm_visibility_score,algorithm_health_score").eq("project_id", pid).order("recorded_at", { ascending: false }).limit(1),
        db().from("brain_learnings").select("id").eq("project_id", pid).eq("status", "active").limit(1),
        db().from("verification_queue").select("id").eq("project_id", pid).eq("status", "pending"),
      ]);
      const proj     = projR.status === "fulfilled"    ? projR.value.data           : null;
      const metrics  = metricsR.status === "fulfilled" ? metricsR.value.data?.[0]   : null;
      const hasLearn = learnR.status === "fulfilled"   ? (learnR.value.data?.length || 0) > 0 : false;
      const pending  = verifyR.status === "fulfilled"  ? verifyR.value.data?.length || 0 : 0;
      if (!proj) continue;
      let action_item = "";
      let priority    = "medium";
      if (!proj.goals)             { action_item = "Set campaign goals in Data Room to unlock strategy recommendations"; priority = "high"; }
      else if (!proj.cms)          { action_item = "Add CMS to Data Room — unlocks technical audit accuracy";            priority = "high"; }
      else if (pending > 3)        { action_item = `${pending} verifications pending — run check to close the loop`;     priority = "high"; }
      else if (!hasLearn)          { action_item = "No learnings yet — run first audit to start building Brain memory";  priority = "medium"; }
      else if (metrics && (metrics.algorithm_health_score || 0) < 50)
                                   { action_item = "Algorithm health low — review recent updates and fix exposed areas"; priority = "high"; }
      else                         { action_item = "Review canvas and advance highest-priority pending task";            priority = "low"; }
      briefItems.push({ projectId: pid, projectName: proj.name, actionItem: action_item, priority, verificationsPending: pending });
    }
    return ok(res, {
      success:     true,
      brief:       briefItems,
      generatedAt: new Date().toISOString(),
      weekLabel:   `Week of ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`,
    });
  }

  /* ── EVALUATE ── */
  if (action === "evaluate") {
    const { card, output: executedOutput, executedRole, executedInputs, projectId } = body;
    if (!executedOutput) return ok(res, { error: "No output to evaluate" });

    if (!card) return ok(res, { error: "Missing card" });

    const prompt = [
      "Evaluate your own output honestly as Manav Brain reviewing your work.",
      `TASK: ${card.type} | "${card.title}" | Role: ${executedRole}`,
      `Inputs: ${JSON.stringify(executedInputs)}`,
      `YOUR OUTPUT:\n${String(executedOutput).slice(0, 6000)}`,
      'Return ONLY valid JSON: {"quality_score":0,"what_worked":[],"what_missed":[],"was_role_right":"yes|no","better_role":"","redo_reason":"","confidence_actual":0,"manav_note":""}',
    ].join("\n");

    try {
      const r = await new Anthropic().messages.create({
        model: "claude-sonnet-4-6", max_tokens: 2000, system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      const raw = r.content[0].type === "text" ? r.content[0].text : "{}";
      let parsed: any = {};
      try { parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch (_e) {}

      /* ── Auto-learning from evaluation output (fire-and-forget) ── */
      const evalProjId = (projectId || (body as any).context?.project?.id || null) as string | null;
      if (evalProjId && parsed.quality_score != null) {
        Promise.resolve().then(async () => {
          await saveLearning({
            source:         "evaluate_output",
            projectId:      evalProjId,
            content:        `Quality ${parsed.quality_score}/100. ${parsed.manav_note || ""}. ${(parsed.what_worked || []).join(". ")}`,
            title:          `Eval: ${card.type} — ${(card.title || "").slice(0, 55)}`,
            cardType:       card.type,
            whatWorked:     parsed.what_worked  || [],
            whatMissed:     parsed.what_missed  || [],
            contextSummary: `evaluate_output — ${card.type}: ${card.title}`,
            tags:           [card.type, "evaluated", parsed.was_role_right === "no" ? "role-mismatch" : "role-ok"],
          });
        }).catch(() => {});
      }

      return ok(res, { success: true, evaluation: parsed });
    } catch (e: any) {
      return ok(res, { success: false, error: e.message });
    }
  }

  /* ── CHECK LEARNING FRESHNESS against algorithm update ── */
  if (action === "check_learning_freshness") {
    const { topic_title, topic_category, topic_tags = [], project_id } = body;
    if (!topic_title) return ok(res, { error: "topic_title required" });

    // Find learnings whose tags or card_type relate to the updated algorithm topic
    const CATEGORY_MAP: Record<string, string[]> = {
      "core_update":       ["content","strategy","insight","general"],
      "helpful_content":   ["content","insight"],
      "eeat":              ["content","insight","competitive"],
      "technical":         ["technical","quick-win"],
      "core_web_vitals":   ["technical","quick-win"],
      "content":           ["content","insight"],
      "links":             ["competitive","insight"],
      "geo_ai":            ["geo","insight"],
      "spam":              ["technical","content"],
      "local":             ["geo","technical"],
    };
    const affectedTypes = CATEGORY_MAP[topic_category || ""] || ["insight","strategy","content","technical"];

    try {
      // Find active learnings that are potentially stale
      let q: any = db().from("brain_learnings")
        .select("id, card_title, card_type, tags, confidence_score, improvement, updated_at, project_id")
        .in("status", ["active"])
        .in("card_type", affectedTypes);
      if (project_id) q = q.or(`project_id.eq.${project_id},project_id.is.null`);
      const { data: affected, error: qErr } = await q.order("updated_at", { ascending: true }).limit(20);
      if (qErr) return ok(res, { error: qErr.message });

      // Filter to learnings that overlap with the topic (by tags or keywords in title/improvement)
      const topicKeywords = [...topic_tags, topic_title.toLowerCase()].flatMap(t => t.toLowerCase().split(/\s+/));
      const stale = (affected || []).filter((l: any) => {
        const lText = [(l.card_title || ""), (l.improvement || ""), ...(l.tags || [])].join(" ").toLowerCase();
        return topicKeywords.some((kw: string) => kw.length > 3 && lText.includes(kw));
      });

      // Mark as needs-review by adding tag
      for (const l of stale) {
        const existingTags: string[] = l.tags || [];
        if (!existingTags.includes("needs-algo-review")) {
          await db().from("brain_learnings").update({
            tags: [...existingTags, "needs-algo-review"],
            updated_at: new Date().toISOString(),
          }).eq("id", l.id);
        }
      }

      return ok(res, {
        success: true,
        affected_count: stale.length,
        affected_learnings: stale.map((l: any) => ({
          id: l.id, card_title: l.card_title, card_type: l.card_type,
          improvement: l.improvement?.slice(0, 100),
          last_updated: l.updated_at,
        })),
        message: stale.length > 0
          ? `${stale.length} learning${stale.length > 1 ? "s" : ""} may be outdated by "${topic_title}". Tagged for review in Brain Learning.`
          : `No active learnings affected by "${topic_title}"`,
      });
    } catch (e: any) {
      return ok(res, { error: e.message });
    }
  }


  /* ── ARCHIVE PROJECT ──
     Preserves active learnings as institutional knowledge (project_id → null).
     The project is soft-deleted (status='archived').
     Knowledge NEVER degrades — accumulated intelligence remains for future projects. */
  if (action === "archive_project") {
    const { project_id: pid, hard_delete = false } = body;
    if (!pid) return ok(res, { error: "project_id required" });
    try {
      // Migrate active learnings: project_id=null → global institutional knowledge
      const { count: migratedCount } = await db()
        .from("brain_learnings")
        .update({ project_id: null })
        .eq("project_id", pid)
        .eq("status", "active")
        .select("id");

      // Reject unreviewed pending learnings (don't pollute global pool)
      await db()
        .from("brain_learnings")
        .update({ status: "rejected" })
        .eq("project_id", pid)
        .eq("status", "pending_review");

      // Log the archival event
      await db().from("system_change_log").insert({
        change_type: hard_delete ? "project_deleted" : "project_archived",
        description: `Project ${pid} ${hard_delete ? "deleted" : "archived"}. ${migratedCount || 0} active learnings preserved as institutional knowledge.`,
        metadata: { project_id: pid, migrated_learnings: migratedCount || 0, timestamp: new Date().toISOString() },
        affected_table: "projects", affected_id: pid,
      });

      if (hard_delete) {
        await Promise.allSettled([
          db().from("task_executions").delete().eq("project_id", pid),
          db().from("ai_content_cache").delete().eq("project_id", pid),
          db().from("brain_desk").delete().eq("project_id", pid),
          db().from("projects").delete().eq("id", pid),
        ]);
        return ok(res, { success: true, action: "deleted", migratedLearnings: migratedCount || 0 });
      } else {
        await db().from("projects").update({ status: "archived" }).eq("id", pid);
        return ok(res, { success: true, action: "archived", migratedLearnings: migratedCount || 0 });
      }
    } catch (e: any) { return ok(res, { error: e.message }); }
  }

  /* ── GET PROJECT INTEL — full dossier for Mission Control ── */
  if (action === "get_project_intel") {
    const { project_id: pid } = body;
    if (!pid) return ok(res, { error: "project_id required" });
    try {
      const [learningsR, knowledgeR, deskR, tasksR] = await Promise.allSettled([
        db().from("brain_learnings").select("*").eq("project_id", pid).order("created_at", { ascending: false }),
        db().from("project_knowledge").select("*").eq("project_id", pid).maybeSingle(),
        db().from("brain_desk").select("id,title,content_type,created_at,tags").eq("project_id", pid).order("created_at", { ascending: false }).limit(30),
        db().from("task_executions").select("id,task_type,status,created_at").eq("project_id", pid).order("created_at", { ascending: false }).limit(30),
      ]);
      return ok(res, {
        success: true,
        learnings:  learningsR.status === "fulfilled" ? (learningsR.value.data || []) : [],
        knowledge:  knowledgeR.status === "fulfilled" ? knowledgeR.value.data : null,
        deskItems:  deskR.status === "fulfilled"      ? (deskR.value.data || [])      : [],
        tasks:      tasksR.status === "fulfilled"     ? (tasksR.value.data || [])     : [],
      });
    } catch (e: any) { return ok(res, { error: e.message }); }
  }


  /* ── GET LAUNCHPAD INTEL ── Presidential Command Center data ── */
  if (action === "get_launchpad_intel") {
    try {
      const db2 = db();
      const [
        projectsR, clientsR, learningsR, tasksR,
        deskR, algoR, logsR, auditsR, costR
      ] = await Promise.allSettled([
        db2.from("projects").select("id,name,url,cms,status,keywords,goals,organic_monthly,created_at,client_id"),
        db2.from("clients").select("id,name,company,email"),
        db2.from("brain_learnings").select("id,project_id,status,card_type,confidence_score,created_at,applied_count,auto_captured"),
        db2.from("task_executions").select("id,project_id,task_type,status,created_at").order("created_at",{ascending:false}).limit(60),
        db2.from("brain_desk").select("id,project_id,content_type,created_at").order("created_at",{ascending:false}).limit(40),
        db2.from("algorithm_knowledge").select("id,topic,freshness_score,updated_at").order("updated_at",{ascending:false}).limit(20),
        db2.from("system_change_log").select("id,change_type,description,created_at").order("created_at",{ascending:false}).limit(20),
        db2.from("audit_reports").select("id,project_id,created_at,score").order("created_at",{ascending:false}).limit(20),
        db2.from("api_cost_log").select("id,cost,model,created_at,project_id").order("created_at",{ascending:false}).limit(100),
      ]);

      const get = (r: any) => r.status === "fulfilled" ? (r.value.data || []) : [];
      const projects   = get(projectsR);
      const clients    = get(clientsR);
      const learnings  = get(learningsR);
      const tasks      = get(tasksR);
      const deskItems  = get(deskR);
      const algoTopics = get(algoR);
      const logs       = get(logsR);
      const audits     = get(auditsR);
      const costs      = get(costR);

      // Per-project aggregated stats
      const projectStats = projects.map((p: any) => {
        const pLearnings = learnings.filter((l: any) => l.project_id === p.id);
        const pTasks     = tasks.filter((t: any) => t.project_id === p.id);
        const pAudits    = audits.filter((a: any) => a.project_id === p.id);
        const pCosts     = costs.filter((c: any) => c.project_id === p.id);
        const active     = pLearnings.filter((l: any) => l.status === "active").length;
        const pending    = pLearnings.filter((l: any) => l.status === "pending_review").length;
        const totalCost  = pCosts.reduce((s: number, c: any) => s + (c.cost || 0), 0);
        // Brain quality score
        let score = 0;
        if (p.cms)                          score += 25;
        if (p.keywords?.length >= 3)        score += 20;
        if (p.goals)                        score += 15;
        if (p.url)                          score += 10;
        if (active >= 20)                   score += 20;
        else if (active >= 10)              score += 12;
        else if (active >= 5)              score += 6;
        const lastActivity = [
          pTasks[0]?.created_at, pAudits[0]?.created_at, pLearnings[pLearnings.length-1]?.created_at
        ].filter(Boolean).sort().reverse()[0] || p.created_at;
        const client = clients.find((c: any) => c.id === p.client_id);
        return {
          ...p, clientName: client?.name || client?.company || "",
          activeLearnings: active, pendingLearnings: pending,
          totalLearnings: pLearnings.length, taskCount: pTasks.length,
          lastAuditScore: pAudits[0]?.score || null,
          lastAuditDate: pAudits[0]?.created_at || null,
          brainScore: score, totalCost: Math.round(totalCost * 100) / 100,
          lastActivity,
        };
      });

      // System totals
      const today = new Date().toISOString().split("T")[0];
      const todayCost   = costs.filter((c: any) => c.created_at?.startsWith(today)).reduce((s: number, c: any) => s + (c.cost || 0), 0);
      const totalCostAll = costs.reduce((s: number, c: any) => s + (c.cost || 0), 0);
      const todayTasks  = tasks.filter((t: any) => t.created_at?.startsWith(today)).length;
      const activePend  = learnings.filter((l: any) => l.status === "pending_review").length;
      const activeAll   = learnings.filter((l: any) => l.status === "active").length;
      const institutional = learnings.filter((l: any) => !l.project_id && l.status === "active").length;

      // Always return success if we have projects — other tables are optional
      return ok(res, {
        success: true,
        projectStats,
        clients,
        totals: {
          projects: projects.length,
          activeProjects: projects.filter((p: any) => p.status !== "archived").length,
          clients: clients.length,
          totalLearnings: learnings.length,
          activeLearnings: activeAll,
          pendingApprovals: activePend,
          institutionalKnowledge: institutional,
          algoTopics: algoTopics.length,
          totalDeskItems: deskItems.length,
          taskCount: tasks.length,
          todayTasks,
          todayCost: Math.round(todayCost * 10000) / 10000,
          totalCost: Math.round(totalCostAll * 100) / 100,
        },
        algoTopics: algoTopics.slice(0, 10),
        recentLogs:  logs.slice(0, 10),
        recentTasks: tasks.slice(0, 15),
        pendingLearnings: learnings.filter((l: any) => l.status === "pending_review").slice(0, 20),
      });
    } catch (e: any) {
      return ok(res, { error: e.message });
    }
  }

    return ok(res, { error: `Unknown action: ${action}` });
}
