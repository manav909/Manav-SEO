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
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/* ─── Inline brain helpers (self-contained) ─── */
import { createClient as _sbCreate } from "@supabase/supabase-js";
function _sbClient() {
  return _sbCreate(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder"
  );
}

export const config = { maxDuration: 300, regions: ["iad1"] };

/* ── Lazy DB ── */
function db() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder";
  return createClient(url, key);
}

const SYSTEM = "You are Manav Brain — senior SEO strategist. Be direct, specific, honest. Never invent data.";

/* ── Auto-approval logic ── */
function shouldAutoApprove(cardType: string, source: string, confidence: number): boolean {
  const autoTypes = ["technical", "quick-win"];
  const autoSources = ["audit_streaming", "seo_agent_audit", "crawl_analysis", "algorithm_intel"];
  if (autoTypes.includes(cardType)) return true;
  if (autoSources.includes(source)) return true;
  if (confidence >= 85) return true;
  return false;
}

/* ── Contradiction/duplicate check ── */
async function checkForConflicts(
  projectId: string | null,
  cardType: string,
  title: string,
  improvement: string | null
): Promise<{ isDuplicate: boolean; isContradiction: boolean; existingId: string | null }> {
  try {
    const { data: existing } = await db()
      .from("brain_learnings")
      .select("id, card_title, improvement, status")
      .eq("card_type", cardType)
      .in("status", ["active", "pending_review"])
      .limit(20);

    if (!existing || existing.length === 0) return { isDuplicate: false, isContradiction: false, existingId: null };

    const titleLower = title.toLowerCase();
    const improveLower = (improvement || "").toLowerCase();

    for (const l of existing as any[]) {
      const lTitle = (l.card_title || "").toLowerCase();
      const lImprove = (l.improvement || "").toLowerCase();

      // Duplicate: >70% word overlap in title
      const titleWords = titleLower.split(/\W+/).filter(Boolean);
      const lWords = lTitle.split(/\W+/).filter(Boolean);
      const overlap = titleWords.filter(w => lWords.includes(w)).length;
      const similarity = titleWords.length > 0 ? overlap / titleWords.length : 0;
      if (similarity > 0.7) return { isDuplicate: true, isContradiction: false, existingId: l.id };

      // Contradiction: improvement contains opposite signal
      const contradictionPairs = [
        ["increase", "decrease"], ["add", "remove"], ["enable", "disable"],
        ["fast", "slow"], ["more", "less"], ["do not", "should"],
      ];
      for (const [a, b] of contradictionPairs) {
        if (improveLower.includes(a) && lImprove.includes(b)) {
          return { isDuplicate: false, isContradiction: true, existingId: l.id };
        }
        if (improveLower.includes(b) && lImprove.includes(a)) {
          return { isDuplicate: false, isContradiction: true, existingId: l.id };
        }
      }
    }

    return { isDuplicate: false, isContradiction: false, existingId: null };
  } catch (_e) {
    return { isDuplicate: false, isContradiction: false, existingId: null };
  }
}

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
  if (req.method !== "POST") return ok(res, { error: "POST only" });

  const body = req.body || {};
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

  /* ── GET ALL LEARNINGS ── */
  if (action === "get_all_learnings") {
    const { project_id } = body;
    try {
      const q = project_id
        ? db().from("brain_learnings").select("*")
            .or(`project_id.eq.${project_id},project_id.is.null`)
            .order("created_at", { ascending: false })
        : db().from("brain_learnings").select("*")
            .order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) return ok(res, { error: error.message });
      return ok(res, { success: true, learnings: data || [] });
    } catch (e: any) {
      return ok(res, { error: e.message });
    }
  }

  /* ── SAVE LEARNING (with auto-approval + conflict check) ── */
  if (action === "save_learning") {
    const {
      project_id, card_type = "insight", card_title = "",
      what_worked, what_missed, redo_reason, improvement,
      context_summary, tags, source = "manual",
      confidence_score: rawConfidence,
    } = body;

    const confidence = Number(rawConfidence) || 75;
    const autoApprove = shouldAutoApprove(card_type, source, confidence);

    // Conflict check
    const { isDuplicate, isContradiction, existingId } = await checkForConflicts(
      project_id, card_type, card_title, improvement
    );

    if (isDuplicate && existingId) {
      // Merge: update existing with higher confidence / additional insights
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
      project_id: project_id || null,
      card_type,
      card_title: card_title.slice(0, 100),
      what_worked: Array.isArray(what_worked) ? what_worked : [],
      what_missed: Array.isArray(what_missed) ? what_missed : [],
      redo_reason: redo_reason || null,
      improvement: improvement || null,
      context_summary: context_summary || null,
      tags: Array.isArray(tags) ? [...new Set([card_type, ...tags])] : [card_type],
      source,
      applied_count: 0,
      updated_at: new Date().toISOString(),
    };

    // Flag contradictions but still store
    if (isContradiction) {
      row.tags = [...(row.tags || []), "contradiction-flagged"];
    }

    try {
      const { data, error } = await db().from("brain_learnings").insert({
        ...row,
        status: autoApprove ? "active" : "pending_review",
        auto_captured: source !== "manual" && source !== "brain_chat",
        confidence_score: confidence,
      }).select().single();
      if (error) throw error;
      return ok(res, {
        success: true, learning: data,
        auto_approved: autoApprove,
        contradiction: isContradiction,
      });
    } catch (_e) {
      // Fallback without extended columns
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

    // Background: save output + learning
    const deskProjId = (body.projectId || context?.project?.id || null) as string | null;
    if (deskProjId && execFull.length > 300) {
      Promise.resolve().then(async () => {
        try {
          await _sbClient().from("brain_desk").insert({
            project_id: deskProjId,
            title: (card.title || "Task Output").slice(0, 200),
            content_type: card.type === "technical" ? "code" : card.type === "audit" ? "audit" : "report",
            content: execFull,
            source: "task_execute",
            tags: [card.type, "auto-saved"],
            pinned: false,
            metadata: { auto_saved: true },
            updated_at: new Date().toISOString(),
          });
        } catch (_e) {}

        // Auto-capture learning
        const lines = execFull.split("\n").filter(l => l.trim().length > 20);
        const positiveLines = lines.filter(l =>
          /improve|optim|strateg|recommend|should|increase|boost|rank|fix|add|create/i.test(l)
        ).slice(0, 4).map(l => l.trim().slice(0, 120));
        const gapLines = lines.filter(l =>
          /missing|lack|gap|issue|problem|not |without|poor|low/i.test(l)
        ).slice(0, 2).map(l => l.trim().slice(0, 120));

        try {
          await _sbClient().from("brain_learnings").insert({
            project_id: deskProjId,
            card_type: card.type,
            card_title: `${card.type}: ${(card.title || "").slice(0, 50)}`,
            what_worked: positiveLines.length > 0 ? positiveLines : ["Task executed"],
            what_missed: gapLines,
            improvement: positiveLines[0] || "Review output for improvements",
            context_summary: `${card.type} execution`,
            tags: [card.type, "task-execute"],
            source: "task_execution_auto",
            applied_count: 0,
            status: shouldAutoApprove(card.type, "task_execution_auto", 70) ? "active" : "pending_review",
            auto_captured: true,
            confidence_score: positiveLines.length >= 3 ? 78 : 65,
            updated_at: new Date().toISOString(),
          });
        } catch (_e) {}
      }).catch(() => {});
    }

    return;
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
      return ok(res, { success: true, evaluation: parsed });
    } catch (e: any) {
      return ok(res, { success: false, error: e.message });
    }
  }

  return ok(res, { error: `Unknown action: ${action}` });
}
