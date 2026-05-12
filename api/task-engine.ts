import Anthropic                              from "@anthropic-ai/sdk";
import { createClient }                      from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractAndSaveLearning, saveToDesk } from "./ai-cache";

export const config = { maxDuration: 60 };

/* ── Lazy DB — never throws on module load ── */
function db() {
  const url = process.env.VITE_SUPABASE_URL  || process.env.SUPABASE_URL  || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

const SYSTEM = "You are Manav Brain, the senior SEO strategist embedded in SEO Season. Speak as a knowledgeable senior colleague. Use I throughout. Be direct, specific, and honest. Never invent data. Flag every assumption. Cite every source.";

const WAIT_DAYS: Record<string, number> = {
  technical: 5, content: 14, geo: 7, "quick-win": 3,
  competitive: 21, insight: 0, weekly: 3, monthly: 30, kpi: 7, custom: 5,
};

const CARD_COLORS: Record<string, string> = {
  "quick-win": "#4ade80", "weekly": "#60a5fa", "monthly": "#a78bfa",
  "technical": "#06b6d4", "content": "#facc15", "geo": "#6366f1",
  "competitive": "#fb923c", "insight": "#f472b6", "kpi": "#34d399", "custom": "#94a3b8",
};

const BLUEPRINTS: Record<string, {
  what_ai_produces: string;
  required_inputs: { key: string; label: string; why: string; autoFetchable: boolean }[];
  review_checklist: string[];
  verification_method: string;
}> = {
  technical: {
    what_ai_produces: "Exact copy-paste ready code or configuration — redirects, schema, robots.txt — plus step-by-step deployment instructions and a rollback plan.",
    required_inputs: [
      { key: "affected_urls",    label: "Affected URLs (paste 3-5)",  why: "Cannot generate the fix without knowing the exact paths",  autoFetchable: false },
      { key: "current_behavior", label: "What is currently broken",   why: "The error type determines the correct fix approach",       autoFetchable: false },
      { key: "live_site_fetch",  label: "Live site scan",             why: "I will fetch the page to see the issue directly",         autoFetchable: true  },
    ],
    review_checklist: ["Test every change in staging","Verify HTTP status codes in browser DevTools","Request re-indexing in GSC","Check PageSpeed before and after","Confirm no important pages are blocked in robots.txt"],
    verification_method: "GSC Coverage report indexed count + HTTP status check on affected URLs",
  },
  content: {
    what_ai_produces: "Full SEO-optimised draft — heading structure, meta title, meta description, schema markup, and internal link suggestions.",
    required_inputs: [
      { key: "target_keyword",      label: "Primary target keyword",                                   why: "The entire content is built around this",          autoFetchable: false },
      { key: "search_intent",       label: "Search intent: informational, commercial, or transactional", why: "Determines format and depth",                   autoFetchable: false },
      { key: "word_count_target",   label: "Target word count",                                        why: "Determines how deep I go",                        autoFetchable: false },
      { key: "brand_voice_example", label: "One example of brand writing — URL or paste a paragraph", why: "Without this my output will be generic",          autoFetchable: false },
    ],
    review_checklist: ["Check every statistic against its primary source","Click every internal link","Meta title under 60 characters","Validate schema at validator.schema.org"],
    verification_method: "GSC Performance: impressions and position for target keyword — allow 14 days after publishing",
  },
  geo: {
    what_ai_produces: "Rewritten intro paragraph, FAQ section with FAQPage schema, entity-rich summary block.",
    required_inputs: [
      { key: "current_content", label: "Current page URL or paste the content",                             why: "I need to read what exists before I can improve it", autoFetchable: true  },
      { key: "target_query",    label: "The exact query you want to appear for in Perplexity or ChatGPT",  why: "GEO strategy is completely query-specific",          autoFetchable: false },
      { key: "ai_platform",     label: "Priority platform: Perplexity, ChatGPT, or Google AI Overview",   why: "Each platform cites content differently",            autoFetchable: false },
    ],
    review_checklist: ["Screenshot Perplexity result before deploying","Validate all schema markup","Search again in Perplexity 7 days after publishing and compare"],
    verification_method: "Manual Perplexity and ChatGPT check — screenshot citations before and after",
  },
  "quick-win": {
    what_ai_produces: "Specific before and after for meta titles, descriptions, headings, and image alt tags — one line per URL.",
    required_inputs: [
      { key: "target_urls",   label: "URLs to optimise — paste 1 to 10",  why: "I will fetch each page and generate specific improvements", autoFetchable: true  },
      { key: "target_metric", label: "What metric are we trying to move",  why: "CTR, rankings, and impressions need different approaches", autoFetchable: false },
    ],
    review_checklist: ["Meta titles under 60 characters","Meta descriptions under 160 characters","Preview in SERP simulator","Check GSC CTR 7 days after change"],
    verification_method: "GSC Performance: CTR and average position — compare 7 days before vs 7 days after",
  },
  competitive: {
    what_ai_produces: "Gap analysis table, specific content to create, keyword targeting plan with priority order.",
    required_inputs: [
      { key: "competitor_url",  label: "Competitor domain to analyse",              why: "I will fetch their pages to find the exact gaps",        autoFetchable: true  },
      { key: "target_keywords", label: "Keywords you want to compete on",           why: "Without this the analysis is too broad to be useful",   autoFetchable: false },
      { key: "ranking_data",    label: "Semrush or Ahrefs export if you have one",  why: "This takes my confidence from 65 to 85 percent",        autoFetchable: false },
    ],
    review_checklist: ["Cross-check all suggested keywords in Semrush/Ahrefs","Search top 3 gap keywords in incognito","Check GSC impressions 30 days after creating content"],
    verification_method: "Position tracking — compare your ranking vs competitor after 30 days",
  },
  insight: {
    what_ai_produces: "Deep strategic analysis with specific recommendations and priority sequencing.",
    required_inputs: [{ key: "specific_question", label: "The specific question or area you want me to analyse", why: "A focused question produces a useful answer", autoFetchable: false }],
    review_checklist: ["Verify all data references against the source reports","Challenge forecasts — treat them as directional"],
    verification_method: "Track the specific metrics mentioned over the timeframe I suggest",
  },
  weekly: {
    what_ai_produces: "Step-by-step execution brief with numbered instructions, tool requirements, time estimates, and a clear definition of done.",
    required_inputs: [{ key: "task_context", label: "More context about what specifically needs doing", why: "Context determines the right approach", autoFetchable: false }],
    review_checklist: ["Confirm the deliverable matches the brief before marking done"],
    verification_method: "Review the output against the definition of done in the brief",
  },
};

async function fetchUrl(url: string): Promise<string> {
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    const r = await fetch(`https://r.jina.ai/${u}`, {
      headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "15" },
      signal: AbortSignal.timeout(18000),
    });
    return r.ok ? (await r.text()).slice(0, 4000) : "";
  } catch (_e) { return ""; }
}

/* ── Safe export: catches any uncaught crash before Vercel sees it ── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try { return await _handler(req, res); }
  catch (e: any) { try { res.status(200).json({ error: "Unexpected: " + (e?.message||"unknown"), healthy: false }); } catch (_) {} }
}

async function _handler(req: VercelRequest, res: VercelResponse) {
  /* Global catch — ensures function never crashes with FUNCTION_INVOCATION_FAILED */
  try {
  if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed" });

  const {
    action, card, context: rawContext, userInputs = {}, role = "senior_seo",
    completedAt, checkType = "guidance", completionNote = "", evidenceData = "",
  } = req.body;

  const context = (rawContext && typeof rawContext === "object") ? rawContext : {};

  /* ═══════════════════════════════════════════════════════════════
     DEDICATED HEALTH CHECK — minimal DB ping, no complex queries
     Used by ManavBrainAssistant.tsx health scanner.
  ═══════════════════════════════════════════════════════════════ */
  if (action === "health_check") {
    try {
      const { error } = await db().from("brain_learnings").select("id").limit(1);
      if (error) return res.status(200).json({ healthy: false, db: "error", error: error.message });
      return res.status(200).json({ healthy: true, db: "ok", ts: new Date().toISOString() });
    } catch (err: any) {
      return res.status(200).json({ healthy: false, db: "error", error: err.message });
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     BRAIN LEARNING ACTIONS
  ═══════════════════════════════════════════════════════════════ */

  if (action === "get_all_learnings") {
    const { project_id } = req.body;
    try {
      const q = project_id
        ? db().from("brain_learnings").select("*").or(`project_id.eq.${project_id},project_id.is.null`).order("created_at", { ascending: false })
        : db().from("brain_learnings").select("*").order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) return res.status(200).json({ error: error.message });
      return res.status(200).json({ success: true, learnings: data || [] });
    } catch (err: any) {
      return res.status(200).json({ error: err.message });
    }
  }

  if (action === "save_learning") {
    const { project_id, card_type, card_title, what_worked, what_missed,
            redo_reason, improvement, context_summary, tags } = req.body;
    if (!card_type) return res.status(400).json({ error: "card_type required" });

    const row: any = {
      project_id: project_id || null, card_type,
      card_title: card_title || "",
      what_worked: Array.isArray(what_worked) ? what_worked : [],
      what_missed: Array.isArray(what_missed) ? what_missed : [],
      redo_reason: redo_reason || null, improvement: improvement || null,
      context_summary: context_summary || null,
      tags: Array.isArray(tags) ? tags : [],
      source: "task_execution", applied_count: 0,
      updated_at: new Date().toISOString(),
    };

    // Try with new columns first, fallback if migration not run
    try {
      const { data, error } = await db().from("brain_learnings").insert({
        ...row, status: "active", auto_captured: false, confidence_score: 85,
      }).select().single();
      if (error) throw error;
      return res.status(200).json({ success: true, learning: data });
    } catch (_e) {
      const { data, error } = await db().from("brain_learnings").insert(row).select().single();
      if (error) return res.status(200).json({ error: error.message });
      return res.status(200).json({ success: true, learning: data });
    }
  }

  if (action === "get_relevant") {
    const { project_id, card_type, limit = 8 } = req.body;
    let rows: any[] = [];

    // Try with status='active' filter (requires migration); fallback to all if column missing
    const fetchWithStatus = async (projId?: string, type?: string) => {
      let q: any = db().from("brain_learnings").select("*");
      try {
        // Attempt with status filter
        if (projId && type) q = (q as any).eq("project_id", projId).eq("card_type", type).eq("status", "active");
        else if (type)      q = (q as any).eq("card_type", type).eq("status", "active");
        else                q = (q as any).eq("status", "active");
        const { data, error } = await (q as any).order("applied_count", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
        if (error) throw error;
        return data || [];
      } catch (_e) {
        // Fallback: no status filter (migration not run yet)
        let q2: any = db().from("brain_learnings").select("*");
        if (projId && type) q2 = (q2 as any).eq("project_id", projId).eq("card_type", type);
        else if (type)      q2 = (q2 as any).eq("card_type", type);
        const { data } = await (q2 as any).order("created_at", { ascending: false }).limit(limit);
        return data || [];
      }
    };

    if (project_id && card_type) rows = await fetchWithStatus(project_id, card_type);
    if (rows.length < limit && card_type) {
      const seen = new Set(rows.map((r: any) => r.id));
      const more = await fetchWithStatus(undefined, card_type);
      rows = [...rows, ...more.filter((r: any) => !seen.has(r.id))].slice(0, limit);
    }
    if (rows.length < 3) {
      const seen = new Set(rows.map((r: any) => r.id));
      const all  = await fetchWithStatus();
      rows = [...rows, ...all.filter((r: any) => !seen.has(r.id))].slice(0, limit);
    }

    // Increment applied_count fire-and-forget
    void (async () => {
      for (const id of rows.slice(0, 3).map((r: any) => r.id)) {
        try {
          const { data: d } = await db().from("brain_learnings").select("applied_count").eq("id", id).single();
          if (d) await db().from("brain_learnings").update({ applied_count: ((d as any).applied_count || 0) + 1 }).eq("id", id);
        } catch (_e) { /* non-blocking */ }
      }
    })();

    return res.status(200).json({ success: true, learnings: rows });
  }

  if (action === "delete_learning") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    // IMMUTABLE LOG PROTECTION
    try {
      const { data: item } = await db().from("brain_learnings").select("source").eq("id", id).single();
      if (item?.source?.endsWith("_log")) {
        return res.status(403).json({ error: "Immutable log entry — brain logs cannot be deleted by design." });
      }
    } catch (_e) { /* if check fails, allow delete */ }
    const { error } = await db().from("brain_learnings").delete().eq("id", id);
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (action === "update_learning") {
    const { id, improvement, tags } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { data, error } = await db().from("brain_learnings").update({
      improvement,
      tags: Array.isArray(tags) ? tags : (tags || "").split(",").map((t: string) => t.trim()).filter(Boolean),
      updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ success: true, learning: data });
  }

  if (action === "approve_learning") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { data, error } = await db().from("brain_learnings")
      .update({ status: "active", updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ success: true, learning: data });
  }

  if (action === "reject_learning") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { data, error } = await db().from("brain_learnings")
      .update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ success: true, learning: data });
  }

  if (action === "deactivate_learning") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { data, error } = await db().from("brain_learnings")
      .update({ status: "pending_review", updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ success: true, learning: data });
  }

  /* ─── ADD CANVAS CARD — Brain creates cards directly ─── */
  if (action === "add_canvas_card") {
    const { project_id, card: newCard } = req.body;
    if (!project_id || !newCard?.type || !newCard?.title) {
      return res.status(400).json({ error: "project_id, card.type, and card.title are required" });
    }
    try {
      const { data: proj, error: projErr } = await db().from("projects")
        .select("playground_strategy, playground_canvas").eq("id", project_id).single();
      if (projErr) return res.status(200).json({ error: projErr.message });

      const strategy = proj?.playground_strategy || { canvas_blocks: [] };
      if (!Array.isArray(strategy.canvas_blocks)) strategy.canvas_blocks = [];

      const cardId  = `brain_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const builtCard = {
        id: cardId, type: newCard.type, title: newCard.title,
        content: newCard.content || "",
        color:   CARD_COLORS[newCard.type] || "#94a3b8",
        priority:newCard.priority || "medium",
        status:  "todo", week: Number(newCard.week) || 1,
        placed: true, effort: newCard.effort || null, impact: newCard.impact || null,
        tags: [...(newCard.tags || []), "brain-created"],
        source: "Manav Brain", assignee: null, aiAssisted: true,
      };

      strategy.canvas_blocks.push(builtCard);

      const canvas = Array.isArray(proj?.playground_canvas) ? proj.playground_canvas : [];
      canvas.push({ id: cardId, placed: true, week: builtCard.week, status: "todo",
        assignee: null, aiAssisted: true, tags: builtCard.tags, effort: null, impact: null,
        title: builtCard.title, content: builtCard.content, type: builtCard.type,
        priority: builtCard.priority, color: builtCard.color, source: "Manav Brain" });

      const { error: saveErr } = await db().from("projects").update({
        playground_strategy: strategy, playground_canvas: canvas,
      }).eq("id", project_id);

      if (saveErr) return res.status(200).json({ error: saveErr.message });
      return res.status(200).json({ success: true, card: builtCard });
    } catch (err: any) {
      return res.status(200).json({ error: err.message });
    }
  }

  /* ── All remaining actions require a card ── */
  if (!card) return res.status(400).json({ error: "Missing card" });

  /* ── REQUIREMENTS ── */
  if (action === "requirements") {
    const bp = BLUEPRINTS[card.type] || BLUEPRINTS.weekly;
    const ctx = context;
    const ctxMap: Record<string, string> = {
      target_keyword:  ctx.goals?.keywords || (ctx.project?.keywords || [])[0] || "",
      competitor_url:  ctx.competitors?.c1 || "",
      live_site_fetch: ctx.project?.url || "",
      current_content: ctx.project?.url || "",
    };
    const available: { label: string; value: string; source: string }[] = [];
    const missing: typeof bp.required_inputs = [];
    for (const inp of bp.required_inputs) {
      const fromCtx  = ctxMap[inp.key];
      const fromUser = userInputs[inp.key];
      if (fromUser)                                   available.push({ label: inp.label, value: fromUser, source: "You provided" });
      else if (fromCtx)                               available.push({ label: inp.label, value: fromCtx,  source: "From Data Room" });
      else if (inp.autoFetchable && ctx.project?.url) available.push({ label: inp.label, value: `Will fetch: ${ctx.project.url}`, source: "Auto-fetch" });
      else                                            missing.push(inp);
    }
    const gaps: string[] = [];
    if (ctx.gaps?.noGoal)      gaps.push("No campaign goal set in Data Room");
    if (ctx.gaps?.noCMS)       gaps.push("CMS not recorded");
    if (ctx.gaps?.noAnalytics) gaps.push("No analytics baseline");
    if (ctx.gaps?.noDocuments) gaps.push("No tool exports uploaded");
    return res.status(200).json({ success: true, blueprint: bp, available, missing, data_room_gaps: gaps, can_execute_now: missing.length === 0 });
  }

  /* ── VERIFY ── */
  if (action === "verify") {
    const waitDays    = WAIT_DAYS[card.type] || 5;
    const compDate    = completedAt ? new Date(completedAt) : new Date();
    const daysSince   = Math.floor((Date.now() - compDate.getTime()) / 86400000);
    const daysLeft    = Math.max(0, waitDays - daysSince);
    const waitExpired = daysLeft === 0;
    if (checkType === "waiting_check") {
      return res.status(200).json({ success: true, waitDays, daysSince, daysLeft, waitExpired });
    }
    let liveContent = "";
    if (req.body.siteUrl && checkType === "live_check") liveContent = await fetchUrl(req.body.siteUrl);

    const verifyPrompt = [
      "You are performing a strict quality review as Head of Department. Never approve without evidence.",
      `TASK: Type: ${card.type} | Title: ${card.title}`,
      `Required: ${card.content}`,
      `Priority: ${card.priority} | Impact: ${card.impact || "not specified"}`,
      `Days since completion: ${daysSince} / Required wait: ${waitDays} days`,
      `Wait period: ${waitExpired ? "COMPLETE" : `INCOMPLETE — ${daysLeft} days remain`}`,
      "COMPLETION STATEMENT:", completionNote || "(No completion note — red flag)",
      "EVIDENCE PROVIDED:", evidenceData || "(No evidence — cannot approve)",
      liveContent ? `LIVE SITE DATA:\n${liveContent}` : "",
      'Return ONLY valid JSON: {"verdict":"verified|not_verified|partial|waiting|cannot_determine","confidence":0,"evidence_found":[],"evidence_missing":[],"what_to_check":[{"tool":"","action":"","what_to_look_for":"","pass_condition":"","fail_condition":""}],"timeline_note":"","next_action":"","approval_blocked":"","hod_note":"","roles":{"who_should_verify":"","escalate_to":""}}',
    ].filter(Boolean).join("\n");

    try {
      const anthropic = new Anthropic();
      const response  = await anthropic.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 2000,
        system: SYSTEM + " You are performing a quality review. Be strict and evidence-driven. Return only valid JSON.",
        messages: [{ role: "user", content: verifyPrompt }],
      });
      const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
      const f = raw.indexOf("{"), l = raw.lastIndexOf("}");
      let parsed: any = {};
      try { parsed = JSON.parse(raw.slice(f, l + 1)); } catch (_e) { /* ignore */ }

      if (parsed.verdict && parsed.verdict !== "cannot_determine") {
        const projectId = req.body.projectId || context?.project?.id || null;
        void extractAndSaveLearning("verify_outcome", projectId,
          [`Verification: ${parsed.verdict} (${parsed.confidence}%) — ${card.type}: ${card.title}`,
           `Evidence found: ${(parsed.evidence_found||[]).join(" | ")||"none"}`,
           `Evidence missing: ${(parsed.evidence_missing||[]).join(" | ")||"none"}`,
           `HOD note: ${parsed.hod_note||""}`].join("\n"),
          { card_type: card.type, card_title: card.title, context_summary: `${card.type} verification: ${parsed.verdict}` }
        );
      }

      return res.status(200).json({ success: true, ...parsed, waiting_status: { waitDays, daysSince, daysLeft, waitExpired }, live_data_used: liveContent.length > 0 });
    } catch (err: any) {
      return res.status(200).json({ success: false, error: err.message });
    }
  }

  /* ── EXECUTE ── */
  if (action === "execute") {
    const bp             = BLUEPRINTS[card.type] || BLUEPRINTS.weekly;
    const ctx            = context;
    const brainLearnings = req.body.brainLearnings || [];
    let liveContent = "";
    if (bp.required_inputs.some(r => r.autoFetchable) && ctx.project?.url) {
      const pageUrl = userInputs.target_urls?.split("\n")[0]?.trim() || userInputs.competitor_url || ctx.project.url;
      liveContent = await fetchUrl(pageUrl);
    }
    const ROLE_VOICE: Record<string, string> = {
      content_writer:  "You are briefing a content writer. Tell them exactly what to write, why it matters, what keywords to hit, and what great looks like.",
      team_lead:       "You are briefing your team lead. Be direct, specific about steps, honest about risks.",
      executive:       "You are advising a business owner. Translate everything to outcomes. No jargon.",
      senior_seo:      "You are a senior SEO strategist sharing your real thinking. Include algorithm reasoning and compounding effects.",
      project_manager: "You are a PM. Be clear on deliverables, acceptance criteria, dependencies, and timeline.",
      biz_dev:         "You are advising a business development manager. Frame everything in client value.",
    };
    const executePrompt = [
      `Execute this SEO task as a ${role.replace("_", " ")}. ${ROLE_VOICE[role] || ROLE_VOICE.senior_seo}`,
      "", "TASK:",
      `Type: ${card.type} | Title: ${card.title}`,
      `Description: ${card.content}`,
      `Priority: ${card.priority} | Expected impact: ${card.impact || "not specified"}`,
      "", "PROJECT INTELLIGENCE:",
      `Company: ${ctx.project?.name || "Unknown"} | URL: ${ctx.project?.url || "Not set"}`,
      `CMS: ${ctx.tech?.cms || "Not recorded"} | SEO Plugin: ${ctx.tech?.seoPlugin || "Not recorded"}`,
      `Goal: ${ctx.goals?.primary || "Not set"} | Timeline: ${ctx.goals?.timeline || "Not set"}`,
      `Keywords: ${ctx.goals?.keywords || (ctx.project?.keywords || []).slice(0, 5).join(", ") || "Not set"}`,
      `Organic sessions/month: ${ctx.analytics?.organicMonthly || "Unknown"} | GSC clicks: ${ctx.analytics?.gscClicks || "?"}`,
      `Competitors: ${[ctx.competitors?.c1, ctx.competitors?.c2].filter(Boolean).join(", ") || "Not recorded"}`,
      `Technical: ${ctx.technical?.pagesIndexed || "?"} pages indexed | Crawl errors: ${ctx.technical?.crawlErrors || "none"}`,
      "", "INPUTS PROVIDED:",
      Object.entries(userInputs).map(([k, v]) => `${k}: ${v}`).join("\n") || "None",
      "", liveContent ? `LIVE PAGE DATA:\n${liveContent}` : "",
      "", "AUDIT INTELLIGENCE:",
      ctx.audits?.slice(0, 2).map((a: any) => `${a.date}: ${Object.values(a.sections).join(" | ")}`).join("\n") || "No audits available",
      "", brainLearnings?.length ? ["", "MANAV BRAIN LEARNINGS (apply these):",
        ...brainLearnings.map((l: any, idx: number) =>
          [`  [${idx+1}] ${l.card_type} | "${l.card_title}"`,
           l.what_missed?.length ? `    Missed last time: ${l.what_missed.join(" | ")}` : "",
           l.improvement ? `    Improvement: ${l.improvement}` : ""].filter(Boolean).join("\n")
        )].join("\n") : "",
      "", "RULES:",
      "1. Only state facts from the data above. If data is missing, say: I do not have this — check [source]",
      "2. Flag every assumption. Never invent competitor data or rankings.",
      "3. Apply every MANAV BRAIN LEARNING listed above.",
      "4. End with Manav's Take — what excites you, what to watch, one honest concern.",
      "",
      card.type === "content"     ? "Include: Full draft, meta title, meta description, heading structure, schema markup, internal link suggestions" : "",
      card.type === "technical"   ? "Include: Exact code or configuration, step-by-step deployment instructions, test commands, rollback plan" : "",
      card.type === "geo"         ? "Include: Rewritten intro, FAQ section, structured data, entity list" : "",
      card.type === "quick-win"   ? "Include: Before and after for each element, implementation instructions per URL" : "",
      card.type === "competitive" ? "Include: Gap analysis table, content to create, keyword targeting plan" : "",
    ].filter(l => l !== "").join("\n");

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Cache-Control", "no-cache");
    res.status(200);
    try {
      const anthropic = new Anthropic();
      const stream = await anthropic.messages.stream({
        model: "claude-sonnet-4-6", max_tokens: 8192, system: SYSTEM,
        messages: [{ role: "user", content: executePrompt }],
      });
      let finalStopReason = ""; let execFull = "";
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") { res.write(chunk.delta.text); execFull += chunk.delta.text; }
        if (chunk.type === "message_delta" && chunk.delta.stop_reason) finalStopReason = chunk.delta.stop_reason;
      }
      if (finalStopReason === "max_tokens") {
        res.write("\n\n---\n⚠️ Output reached the length limit and may be incomplete.");
      }
    } catch (err: any) { res.write(`\nError: ${err.message}`); } finally { res.end(); }
    // Auto-save to desk + capture learning (fire-and-forget)
    const deskProjId = (req.body.projectId || context?.project?.id || null) as string | null;
    if (deskProjId && execFull.length > 300) {
      void saveToDesk(deskProjId, card.title || "Task Output", execFull,
        card.type === "technical" ? "code" : card.type === "audit" ? "audit" : "report",
        "task_execute", [card.type]);
      void extractAndSaveLearning("task_execution_auto", deskProjId, execFull,
        { card_type: card.type, card_title: card.title, context_summary: card.type + " execution" });
    }
    return;
  }

  /* ── EVALUATE ── */
  if (action === "evaluate") {
    const { output: executedOutput, executedRole, executedInputs, projectId } = req.body;
    if (!executedOutput) return res.status(400).json({ error: "No output to evaluate" });

    const evaluatePrompt = [
      "You just produced the following output for a task. Now evaluate it honestly.",
      "You are Manav Brain reviewing your own work — be genuinely critical, not defensive.",
      `TASK: Type: ${card.type} | Title: ${card.title} | Role used: ${executedRole}`,
      `Inputs: ${JSON.stringify(executedInputs)}`,
      `YOUR OUTPUT:\n${String(executedOutput).slice(0, 6000)}`,
      "Return ONLY valid JSON:",
      JSON.stringify({
        quality_score: "0-100", what_worked: ["specific strength"], what_missed: ["specific weakness"],
        was_role_right: "yes|no", better_role: "which role and why",
        inputs_that_mattered: ["key inputs"], inputs_that_would_help: ["what would help more"],
        redo_reason: "One honest sentence: what I would change",
        confidence_actual: "0-100", manav_note: "Personal note to the team",
      }),
    ].join("\n");

    try {
      const anthropic = new Anthropic();
      const response  = await anthropic.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 2000,
        system: SYSTEM + " Evaluate your own work honestly. Return only valid JSON.",
        messages: [{ role: "user", content: evaluatePrompt }],
      });
      const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
      const f = raw.indexOf("{"), l = raw.lastIndexOf("}");
      let parsed: any = {};
      try { parsed = JSON.parse(raw.slice(f, l + 1)); } catch (_e) { /* ignore */ }

      void extractAndSaveLearning("task_execution_auto", projectId || context?.project?.id || null,
        [`Task: ${card.title} [${card.type}] — Quality: ${parsed.quality_score}/100`,
         `Worked: ${(parsed.what_worked||[]).join(" | ")}`,
         `Missed: ${(parsed.what_missed||[]).join(" | ")}`,
         `Redo: ${parsed.redo_reason||""}`,
         `Output preview: ${String(executedOutput).slice(0, 500)}`].join("\n"),
        { card_type: card.type, card_title: card.title, context_summary: `${card.type} evaluated — quality ${parsed.quality_score}/100` }
      );

      return res.status(200).json({ success: true, evaluation: parsed });
    } catch (err: any) {
      return res.status(200).json({ success: false, error: err.message });
    }
  }

  return res.status(200).json({ error: `Unknown action: ${action}` });

  } catch (topErr: any) {
    /* Top-level safety net — never let the function crash entirely */
    try { res.status(200).json({ error: "Internal error: " + (topErr?.message || "unknown"), healthy: false }); } catch (_e) { /* already sent */ }
  }
}
