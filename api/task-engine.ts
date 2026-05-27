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

/* ── Lead email notification via Resend API ── */
async function sendLeadEmail(opts: {
  toManav: boolean;
  toLead?: string;
  leadName?: string;
  leadUrl?: string;
  auditScore?: number;
  auditIssues?: string[];
}): Promise<void> {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const MANAV_EMAIL = process.env.MANAV_EMAIL || "manav@seoseason.com";
  if (!RESEND_KEY) {
    console.log("[intake] RESEND_API_KEY not set — email not sent. Set it in Vercel env vars.");
    return;
  }
  try {
    const issuesList = (opts.auditIssues || []).slice(0,5).map(i => `• ${i}`).join("\n");
    const scoreText = opts.auditScore !== undefined ? `Score: ${opts.auditScore}/100` : "";
    
    // Notify Manav
    if (opts.toManav) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "SEO Season <noreply@seoseason.com>",
          to: [MANAV_EMAIL],
          subject: `🎯 New Lead: ${opts.leadUrl || "Unknown"}`,
          text: `New lead captured on SEO Season\n\nURL: ${opts.leadUrl}\nName: ${opts.leadName || "Not provided"}\n${scoreText}\n\nIssues Found:\n${issuesList}\n\nCheck your prospects dashboard: https://seoseason.com/staff-command`,
        }),
      });
    }
    // Send confirmation to lead
    if (opts.toLead) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Manav | SEO Season <manav@seoseason.com>",
          to: [opts.toLead],
          subject: `Your Free SEO Audit — ${opts.leadUrl || ""}`,
          text: `Hi ${opts.leadName || "there"},\n\nThank you for requesting your free SEO audit.\n\n${scoreText}\n\nKey Issues Found:\n${issuesList || "No major issues detected."}\n\nI'll be in touch shortly with your full report and personalised recommendations.\n\nBest,\nManav\nSEO Season\nhttps://seoseason.com`,
        }),
      });
    }
  } catch (e: any) {
    console.error("[intake] Email send failed:", e?.message);
  }
}


export const config = { maxDuration: 300, regions: ["iad1"] };

/* ── Inline Supabase client (avoid ./lib/db Lambda cold-start crash) ── */
let _supa: any = null;
function db(): any {
  if (_supa) return _supa;
  try {
    _supa = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder"
    );
  } catch (e) { console.error("[task-engine] db init failed:", (e as any)?.message); }
  return _supa;
}

// Admin client — always uses service_role key, required for auth.admin methods
let _admin: any = null;
function adminDb(): any {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const svcKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    "";
  if (!url || !svcKey) return null;
  try {
    _admin = createClient(url, svcKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  } catch (e) { console.error("[task-engine] adminDb init failed:", (e as any)?.message); }
  return _admin;
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


function safeParseJSON(raw: string): any {
  if (!raw || typeof raw !== "string") return null;
  const stripped = raw.replace(/^\s*```[a-z]*\s*/i,"").replace(/\s*```\s*$/,"").trim();
  const sanitise = (s: string): string => {
    let o="",inS=false,esc=false;
    for(let i=0;i<s.length;i++){
      const c=s[i];
      if(esc){o+=c;esc=false;continue;}
      if(c==="\\"){esc=true;o+=c;continue;}
      if(c==='"'){inS=!inS;o+=c;continue;}
      if(inS&&c==="\n"){o+="\\n";continue;}
      if(inS&&c==="\r"){o+="\\r";continue;}
      if(inS&&c==="\t"){o+="\\t";continue;}
      o+=c;
    }
    return o;
  };
  const san = sanitise(stripped);
  try{return JSON.parse(san);}catch{}
  const m1=san.match(/\{[\s\S]*\}/);
  if(m1)try{return JSON.parse(m1[0]);}catch{}
  try{return JSON.parse(stripped);}catch{}
  const m2=san.match(/\[[\s\S]*\]/);
  if(m2)try{return JSON.parse(m2[0]);}catch{}
  return null;
}

async function _run(req: VercelRequest, res: VercelResponse) {
  /* ── Google OAuth callback (Phase D) — GET with ?action=gsc_oauth_callback ──
     Must be handled BEFORE cron detection (which also triggers on GET). */
  if (req.method === "GET" && String((req.query as any)?.action || "") === "gsc_oauth_callback") {
    const code  = String((req.query as any)?.code || "");
    const state = String((req.query as any)?.state || "");
    try {
      const { gscOauthCallback } = await import("./lib/pm-gsc.js");
      const r = await gscOauthCallback({ code, state });
      if (r.success && r.html) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(r.html);
      }
      /* error HTML — keep simple */
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(400).send(
        `<!doctype html><html><body style="font-family:sans-serif;padding:40px;background:#0a0a0a;color:#e5e5e5">
        <h2>Connection failed</h2>
        <p>${(r.error || "Unknown error").replace(/[<>]/g, "")}</p>
        <p><a href="/data-room" style="color:#818cf8">Back to Data Room</a></p>
        </body></html>`);
    } catch (e: any) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(500).send(`<pre>${(e?.message || "callback failed").replace(/[<>]/g, "")}</pre>`);
    }
  }

  /* ── GA4 OAuth callback (Phase E) — same shape, different provider ── */
  if (req.method === "GET" && String((req.query as any)?.action || "") === "ga4_oauth_callback") {
    const code  = String((req.query as any)?.code || "");
    const state = String((req.query as any)?.state || "");
    try {
      const { ga4OauthCallback } = await import("./lib/pm-ga4.js");
      const r = await ga4OauthCallback({ code, state });
      if (r.success && r.html) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(r.html);
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(400).send(
        `<!doctype html><html><body style="font-family:sans-serif;padding:40px;background:#0a0a0a;color:#e5e5e5">
        <h2>GA4 connection failed</h2>
        <p>${(r.error || "Unknown error").replace(/[<>]/g, "")}</p>
        <p><a href="/pm" style="color:#818cf8">Back to PM module</a></p>
        </body></html>`);
    } catch (e: any) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(500).send(`<pre>${(e?.message || "callback failed").replace(/[<>]/g, "")}</pre>`);
    }
  }
  /* Vercel cron trigger (GET or x-vercel-cron header) — auto-routes to verification runner */
  const isCron = req.method === "GET" || req.headers["x-vercel-cron"] === "1";

  if (!isCron && req.method !== "POST") return ok(res, { error: "POST only" });

  const body: any = isCron ? { action: "run_scheduled_verifications" } : (req.body || {});
  const { action } = body;

  /* ── HEALTH CHECK ── */

  // ── BRIDGE endpoint (merged from bridge.ts) ──────────────
  if (req.method === 'POST' && req.url?.includes('/api/bridge') || action === '__bridge') {
    const secret = req.headers['x-bridge-secret'] as string;
    const expectedSecret = process.env.BRIDGE_SECRET || '';
    if (expectedSecret && secret !== expectedSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { kind='status', title='Bridge', body: msgBody='', created_by='system', metadata={} } = req.body;
    const { data } = await db().from('claude_bridge').insert({
      kind, title, body: msgBody, created_by, metadata
    }).select().single();
    return ok(res, { success: true, id: data?.id });
  }

  /* ═══ PM MODULE — streaming card execution ═══
     pm_execute_card streams like `execute`; all other pm_* actions are
     non-streaming and handled by the handlePM dispatcher below. */
  if (action === "pm_execute_card") {
    const { card, projectId, mode = "ai_execute", role = "senior_seo",
            userInputs = {}, context = {}, brainLearnings = [] } = body;
    if (!card) return ok(res, { error: "Missing card" });

    const { buildExecutePrompt } = await import("./lib/pm-engine.js");
    const { system, prompt } = buildExecutePrompt({
      card, mode, role, userInputs, context, brainLearnings,
    });

    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache, no-transform",
      "Transfer-Encoding": "chunked",
    });

    let execFull = "";
    try {
      const stream = await new Anthropic().messages.stream({
        model: "claude-sonnet-4-6", max_tokens: 8192, system,
        messages: [{ role: "user", content: prompt }],
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

    /* Background: persist the output onto the card + capture a learning. */
    if (card.id && execFull.length > 200) {
      Promise.resolve().then(async () => {
        const { handlePM } = await import("./lib/pm-engine.js");
        await handlePM("pm_save_execution", {
          cardId: card.id, mode, role, output: execFull,
        });
        await saveLearning({
          source:    "pm_task_execution",
          projectId: projectId || context?.project?.id || null,
          content:   execFull,
          title:     `${card.card_type || "task"}: ${(card.title || "").slice(0, 55)}`,
          cardType:  card.card_type,
          contextSummary: `PM module ${mode} of a ${card.card_type} card`,
          tags:      [card.card_type, "pm-module"],
        });
      }).catch(() => {});
    }
    return;
  }

  /* ═══ PM MODULE — non-streaming actions ═══ */
  if (typeof action === "string" && action.startsWith("pm_")) {
    const { handlePM } = await import("./lib/pm-engine.js");
    const pmResult = await handlePM(action, body);
    if (pmResult !== null) return ok(res, pmResult);
    /* fall through to the reports engine for pm_report_* + pm_metrics_snapshot */
    const { handlePmReport } = await import("./lib/pm-reports.js");
    const rptResult = await handlePmReport(action, body);
    if (rptResult !== null) return ok(res, rptResult);
    /* fall through to the lifecycle engine for pm_card_* + pm_shipped_in_period */
    const { handlePmLifecycle } = await import("./lib/pm-lifecycle.js");
    const lcResult = await handlePmLifecycle(action, body);
    if (lcResult !== null) return ok(res, lcResult);
    /* fall through to the rules engine for pm_rule* / pm_suggestion* / pm_alert* */
    const { handlePmRules } = await import("./lib/pm-rules.js");
    const rulesResult = await handlePmRules(action, body);
    if (rulesResult !== null) return ok(res, rulesResult);
    /* fall through to the V2 seed migration handler — pm_seed_v2_dataroom */
    const { handlePmSeed } = await import("./lib/pm-dataroom-seed.js");
    const seedResult = await handlePmSeed(action, body);
    if (seedResult !== null) return ok(res, seedResult);
    /* fall through to the AI Data Room fill handler — pm_ai_fill_* */
    const { handlePmAiFill } = await import("./lib/pm-dataroom-ai-fill.js");
    const aiFillResult = await handlePmAiFill(action, body);
    if (aiFillResult !== null) return ok(res, aiFillResult);
  }

  /* ═══ GSC INTEGRATION (Phase D) — gsc_* actions ═══ */
  if (typeof action === "string" && action.startsWith("gsc_")) {
    const { handlePmGsc } = await import("./lib/pm-gsc.js");
    const gscResult = await handlePmGsc(action, body, req, res);
    if (gscResult !== null) return ok(res, gscResult);
  }

  /* ═══ GA4 INTEGRATION (Phase E) — ga4_* actions ═══ */
  if (typeof action === "string" && action.startsWith("ga4_")) {
    const { handlePmGa4 } = await import("./lib/pm-ga4.js");
    const ga4Result = await handlePmGa4(action, body, req, res);
    if (ga4Result !== null) return ok(res, ga4Result);
  }

  /* ═══ PSI INTEGRATION — psi_* actions ═══ */
  if (typeof action === "string" && action.startsWith("psi_")) {
    const { handlePmPsi } = await import("./lib/pm-psi.js");
    const psiResult = await handlePmPsi(action, body);
    if (psiResult !== null) return ok(res, psiResult);
  }

  /* ═══ MISSION CONTROL (Phase G) — mc_* actions ═══ */
  if (typeof action === "string" && action.startsWith("mc_")) {
    const { handleMissionControl } = await import("./lib/mission-control.js");
    const mcResult = await handleMissionControl(action, body);
    if (mcResult !== null) return ok(res, mcResult);
  }

  /* ═══ BRAND STUDIO (Phase H foundation) — bs_* actions ═══ */
  if (typeof action === "string" && action.startsWith("bs_")) {
    const { handleBrandStudio } = await import("./lib/brand-studio.js");
    const bsResult = await handleBrandStudio(action, body);
    if (bsResult !== null) return ok(res, bsResult);
  }


  // ═══ INLINE BDE ACTIONS (override dynamic-import versions below) ═══

  if (action === "analyse_fiverr_conversation") {
    const { text = "", staffId, assignmentId } = body;
    if (!text) return ok(res, { error: "text required" });
    try {
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const _resp = await _ac.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: "Analyse this Fiverr conversation. Return ONLY valid JSON with fields: main_need, urgency (high/medium/low), hidden_concern, best_next_message, demo_to_show (array), quick_wins_to_mention (array), fiverr_specific.order_probability (0-100 number), fiverr_specific.conversion_blocker. No markdown.\n\nConversation:\n" + String(text)
        }]
      });
      const _raw = (_resp.content[0] as any).text || "{}";
      let _analysis: any = {};
      try { _analysis = JSON.parse(_raw.replace(/```json/g, "").replace(/```/g, "").trim()); }
      catch { _analysis = { main_need: _raw.slice(0, 200), urgency: "medium", hidden_concern: "N/A", best_next_message: "Happy to help with your SEO!", demo_to_show: [], quick_wins_to_mention: [], fiverr_specific: { order_probability: 50, conversion_blocker: "" } }; }
      const _lines = String(text).split("\n").filter((l: string) => l.trim()).map((l: string) => ({
        text: l.replace(/^(client:|me:|you:|buyer:)/i, "").trim(),
        speaker: /^(client:|buyer:)/i.test(l.trim()) ? "client" : "me",
      }));
      return ok(res, { success: true, analysis: _analysis, parsed_lines: _lines });
    } catch (e: any) { return ok(res, { error: e.message }); }
  }

  if (action === "generate_context_suggestions") {
    const { auditResult, url, currentContext = "" } = body;
    if (!auditResult) return ok(res, { success: false, suggestions: [] });
    try {
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const issues = (auditResult.issues||[]).slice(0,6)
        .map((i:any) => (i.issue||"")+" ["+( i.severity||"high")+"]").join("; ");
      const score = auditResult.score || 0;
      const siteUrl = url || auditResult.url || "their site";
      const prompt = [
        "You are helping a sales person customise an SEO audit for a prospect.",
        "Site: " + siteUrl + " | Score: " + score + "/100",
        "Issues found: " + issues,
        currentContext ? "Current instructions already given: " + currentContext : "",
        "",
        "Generate 6 smart context instructions the sales person can click to add.",
        "Each should be a ready-to-use instruction that changes how the document is written.",
        "Make them specific to this site and score.",
        "",
        'Return ONLY raw JSON array: [{"label":"<4 word label>","text":"<the actual instruction under 100 chars>","category":"emphasis|omit|tone|focus|strategy"}]',
        "Example categories: emphasis=highlight something, omit=exclude something, tone=writing style, focus=prioritise area, strategy=sales angle.",
      ].filter(Boolean).join("\n");
      const _r = await _ac.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 800,
        system: "Return ONLY a raw JSON array. No markdown.",
        messages: [{ role: "user", content: prompt }]
      });
      const raw = (_r.content[0] as any).text || "[]";
      const suggestions = safeParseJSON(raw);
      return ok(res, { success: true, suggestions: Array.isArray(suggestions) ? suggestions : [] });
    } catch(e:any){ return ok(res, { success: false, suggestions: [], error: e.message }); }
  }

  if (action === "save_intake_session") {
    const { url, salesContext, auditResult, pack, email, name } = body;
    if (!url) return ok(res, { success: false });
    const slug = String(url).toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,50);
    try {
      const existing = await db().from("brain_learnings")
        .select("id").eq("source","intake_session").eq("card_title",("Intake: "+url).slice(0,100)).limit(1);
      const payload: any = {
        card_type: "intake_session",
        card_title: ("Intake: " + url).slice(0,100),
        context_summary: JSON.stringify({ url, salesContext, auditResult, pack, email, name, savedAt: new Date().toISOString() }),
        improvement: "Score: " + (auditResult?.score||0) + "/100",
        what_worked: [], what_missed: [],
        tags: ["intake", slug], source: "intake_session",
        applied_count: 0, updated_at: new Date().toISOString(),
      };
      if (existing.data?.length) {
        await db().from("brain_learnings").update(payload).eq("id", existing.data[0].id);
      } else {
        await db().from("brain_learnings").insert(payload);
      }
      return ok(res, { success: true });
    } catch(e:any){ return ok(res, { success: false, error: e.message }); }
  }

  if (action === "load_intake_session") {
    const { url } = body;
    if (!url) return ok(res, { found: false });
    const slug = String(url).toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,50);
    try {
      const { data } = await db().from("brain_learnings")
        .select("context_summary,updated_at")
        .eq("source","intake_session")
        .contains("tags",[slug])
        .order("updated_at",{ascending:false})
        .limit(1);
      if (!data?.length) return ok(res, { found: false });
      let session: any = {};
      try { session = JSON.parse(data[0].context_summary||"{}"); } catch {}
      return ok(res, { found: true, session, updatedAt: data[0].updated_at });
    } catch(e:any){ return ok(res, { found: false, error: e.message }); }
  }

  if (action === "generate_sales_documents") {
    const { auditResult, url, salesContext = "", docType } = body;
    if (!auditResult || !docType) return ok(res, { error: "auditResult and docType required" });
    try {
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const siteUrl = String(url || auditResult.url || "their site");
      const score = auditResult.score || 0;
      const issues = (auditResult.issues||[]).slice(0,8)
        .map((i:any) => "- [" + (i.severity||"high").toUpperCase() + "] " + (i.issue||"") + ": " + (i.explanation||i.fix||"")).join("\n");
      const cats = (auditResult.categories||[]).map((c:any) => c.name + ": " + c.score + "/100").join(", ");
      const wins = (auditResult.quickWins||[]).join("; ");
      const execSummary = auditResult.executiveSummary || "";
      const salesBrief = salesContext ? "\n\nSALES BRIEF (follow these instructions): " + salesContext : "";

      const PROMPTS: any = {
        executive_brief: {
          system: "You are a senior SEO consultant writing a one-page executive brief for a C-suite decision maker. Be authoritative, data-driven, and concise. Every claim must come from the audit data provided.",
          user: `Write a client-ready executive brief for: ${siteUrl}
SEO Score: ${score}/100 | Categories: ${cats}
Executive Summary: ${execSummary}
Key Issues:\n${issues}
Quick Wins: ${wins}${salesBrief}

Return ONLY raw JSON:
{"headline":"<compelling 10-word headline>","subtitle":"<2-line subtitle>","scoreContext":"<2 sentences explaining what the score means for their business>","topFindings":[{"title":"<4 words>","detail":"<2 sentences — specific to this site>","impact":"<measurable impact statement>"}],"opportunity":"<3-4 sentences on the total opportunity if issues are fixed>","nextStep":"<one clear, specific call to action>","urgencyReason":"<1 sentence why this matters now>"}`,
        },
        pitch_deck: {
          system: "You are a world-class sales consultant creating a pitch deck for a prospect. Write compelling, specific copy for each slide. Every statistic and claim must be directly from the audit data. No assumed numbers.",
          user: `Create a 7-slide pitch deck for: ${siteUrl}
SEO Score: ${score}/100 | Categories: ${cats}
Issues:\n${issues}
Quick Wins: ${wins}
Executive Summary: ${execSummary}${salesBrief}

Return ONLY raw JSON:
{"slides":[
  {"slide":1,"title":"The Situation","headline":"<compelling statement about their current SEO state>","body":"<2-3 sentences using actual audit data>","dataPoint":"Score: ${score}/100"},
  {"slide":2,"title":"What We Found","headline":"<key finding>","bullets":["<specific finding 1>","<specific finding 2>","<specific finding 3>"],"dataPoint":"<category with lowest score>/100"},
  {"slide":3,"title":"The Opportunity","headline":"<what fixing this means>","body":"<2-3 sentences on business impact>","dataPoint":"<estimated opportunity statement>"},
  {"slide":4,"title":"Quick Wins","headline":"<3 fastest fixes>","bullets":["<quick win 1 with timeline>","<quick win 2>","<quick win 3>"],"dataPoint":"30-day impact"},
  {"slide":5,"title":"Our Approach","headline":"<methodology>","bullets":["<step 1>","<step 2>","<step 3>","<step 4>"],"dataPoint":"<timeline>"},
  {"slide":6,"title":"Case Study","headline":"<similar client title>","situation":"<2 sentences>","result":"<specific numbers>","relevance":"<1 sentence connecting to this prospect>"},
  {"slide":7,"title":"Next Step","headline":"<CTA>","body":"<2-3 sentences>","dataPoint":"<start date or timeline>"}
]}`,
        },
        case_study: {
          system: "You are writing a compelling case study for a sales consultant. The case study must be realistic and credible — no fake statistics. Base all numbers on reasonable SEO industry benchmarks consistent with the issues found.",
          user: `Write a case study for a business similar to: ${siteUrl}
Their SEO Score: ${score}/100 | Main issues: ${issues.slice(0,400)}${salesBrief}

Return ONLY raw JSON:
{"clientProfile":"<2 sentences describing a similar anonymous business, same industry/size>","challenge":"<2-3 sentences — the specific challenges they had, similar to the issues found>","approach":{"phase1":"<week 1-2: what was done>","phase2":"<week 3-6: what was done>","phase3":"<week 7-12: what was done>"},"results":{"metric1":{"label":"<metric>","value":"<value based on typical SEO gains>","timeframe":"<realistic timeframe>"},"metric2":{"label":"<metric>","value":"<value>","timeframe":"<timeframe>"},"metric3":{"label":"<metric>","value":"<value>","timeframe":"<timeframe>"}},"quote":"<realistic client testimonial>","relevance":"<2 sentences connecting this case study to the prospect>"}`,
        },
        action_plan: {
          system: "You are a senior SEO project manager creating a 90-day action plan. Every action must be directly tied to fixing an issue found in the audit. No generic advice.",
          user: `Create a 90-day SEO action plan for: ${siteUrl}
Score: ${score}/100 | Issues:\n${issues}
Quick Wins: ${wins}${salesBrief}

Return ONLY raw JSON:
{"overview":"<2-3 sentences on the plan focus>","phases":[
  {"phase":"Phase 1","label":"Foundation","days":"Days 1-30","focus":"<what this phase addresses>","tasks":["<specific task tied to actual issue>","<specific task>","<specific task>","<specific task>"],"deliverable":"<what client receives>","kpi":"<measurable outcome>"},
  {"phase":"Phase 2","label":"Growth","days":"Days 31-60","focus":"<what this phase addresses>","tasks":["<specific task>","<specific task>","<specific task>","<specific task>"],"deliverable":"<deliverable>","kpi":"<measurable outcome>"},
  {"phase":"Phase 3","label":"Scale","days":"Days 61-90","focus":"<what this phase addresses>","tasks":["<specific task>","<specific task>","<specific task>","<specific task>"],"deliverable":"<deliverable>","kpi":"<measurable outcome>"}
],"investment":"[INVESTMENT]","guarantee":"<realistic outcome guarantee>"}`,
        },
        competitive_brief: {
          system: "You are a senior SEO strategist writing a competitive opportunity brief. Base all claims on the audit findings. Do not invent competitor data.",
          user: `Write a competitive opportunity brief for: ${siteUrl}
Score: ${score}/100 | Issues found:\n${issues}
Executive Summary: ${execSummary}${salesBrief}

Return ONLY raw JSON:
{"marketContext":"<2-3 sentences about SEO competition in their space based on what the site reveals>","gapAnalysis":["<specific gap 1 found in audit and its competitive implication>","<gap 2>","<gap 3>"],"vulnerabilities":["<where competitors can outrank them based on issues found>","<vulnerability 2>","<vulnerability 3>"],"opportunities":["<specific opportunity 1 tied to an audit finding>","<opportunity 2>","<opportunity 3>"],"urgency":"<2 sentences on why acting now matters — based on algorithm context>","recommendation":"<2-3 sentences on the recommended strategy>"}`,
        },
      };

      const cfg = PROMPTS[docType];
      if (!cfg) return ok(res, { error: "Unknown docType: " + docType });

      const _r = await _ac.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 3000,
        system: cfg.system + " Return ONLY raw JSON. No markdown. No code fences. No line breaks inside string values.",
        messages: [{ role: "user", content: cfg.user }]
      });
      const raw = (_r.content[0] as any).text || "{}";
      let data: any = safeParseJSON(raw);

      // Truncation recovery
      if (!data) {
        try {
          const t = raw.trimEnd();
          let op=0,cl=0,ao=0,ac=0,inS=false,es=false;
          for(const c of t){if(es){es=false;continue;}if(c==="\\"){es=true;continue;}if(c==='"'){inS=!inS;continue;}if(!inS){if(c==="{")op++;if(c==="}") cl++;if(c==="[")ao++;if(c==="]")ac++;}}
          const closing="]".repeat(Math.max(0,ao-ac))+"}".repeat(Math.max(0,op-cl));
          data = safeParseJSON(t+closing);
        } catch {}
      }
      if (!data) return ok(res, { success: false, error: "Document generation failed — please retry" });

      return ok(res, { success: true, docType, data, url: siteUrl, score });
    } catch(e:any){ return ok(res, { success: false, error: e.message }); }
  }

  if (action === "suggest_sales_documents") {
    const { auditResult, url } = body;
    if (!auditResult) return ok(res, { error: "auditResult required" });
    const score = auditResult.score || 0;
    const sevCounts: any = { critical:0, high:0, medium:0, low:0 };
    (auditResult.issues||[]).forEach((i:any) => { sevCounts[i.severity] = (sevCounts[i.severity]||0)+1; });

    const docs: any[] = [
      { id:"executive_brief", label:"Executive Brief", icon:"📋", desc:"1-page summary for decision makers. High impact, fast to read.", priority: score < 60 ? "essential" : "recommended" },
      { id:"pitch_deck", label:"Pitch Deck", icon:"🎯", desc:"7-slide visual presentation covering findings, opportunity and next steps.", priority: "essential" },
      { id:"case_study", label:"Case Study", icon:"📊", desc:"Real-world example from a similar business showing measurable results.", priority: sevCounts.critical > 0 ? "essential" : "recommended" },
      { id:"action_plan", label:"90-Day Action Plan", icon:"🗓", desc:"Phased roadmap with specific tasks, deliverables and KPIs.", priority: "essential" },
      { id:"competitive_brief", label:"Competitive Brief", icon:"⚔️", desc:"Where they're vulnerable and the opportunity to outrank competitors.", priority: score < 50 ? "essential" : "recommended" },
    ];
    return ok(res, { success: true, suggestions: docs });
  }

  if (action === "generate_sales_pack") {
    const { auditResult, url, salesContext: spCtx = "" } = body;
    if (!auditResult) return ok(res, { error: "auditResult required" });
    try {
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const issues = (auditResult.issues || []).slice(0, 6)
        .map((i: any) => (typeof i==="string" ? i : (i.issue||"")+" ("+( i.severity||"high")+")")).join("; ");
      const cats = (auditResult.categories || []).map((c: any) => c.name+": "+c.score+"/100").join(", ");
      const wins = (auditResult.quickWins || []).join(", ");
      const siteUrl = String(url || auditResult.url || "their website");

      const schemaStr = '{"executiveSummary":"<3 sentences>","caseStudy":{"title":"<title>","situation":"<2 sentences>","approach":"<2 sentences>","result":"<numbers+timeline>","relevance":"<1 sentence>"},"proposalPoints":[{"heading":"<h>","body":"<2 sentences>"},{"heading":"<h>","body":"<2 sentences>"},{"heading":"<h>","body":"<2 sentences>"}],"objectionHandlers":[{"objection":"<obj>","response":"<2 sentences>"},{"objection":"<obj>","response":"<2 sentences>"}],"pitchScript":"<120 word Fiverr pitch mentioning their URL and issues>","followUpSequence":[{"day":1,"message":"<60 word message>"},{"day":3,"message":"<60 word message>"},{"day":7,"message":"<60 word message>"}],"quickWinPlan":"<3 bullet points as one string, bullets separated by | character>"}';

      const prompt = [
        "You are a senior SEO sales consultant. Return ONLY raw JSON. No markdown. No code fences.",
        "Prospect: " + siteUrl,
        "SEO Score: " + (auditResult.score||0) + "/100",
        "Categories: " + cats,
        "Issues: " + issues,
        "Quick Wins: " + wins,
        "",
        "Return this exact JSON structure:",
        schemaStr,
        "",
        spCtx ? "SALES PERSON INSTRUCTIONS — apply throughout the entire pack, affecting tone, emphasis, what to highlight and what to omit: " + spCtx : "",
        "Rules: Keep ALL strings under 150 chars. No line breaks inside strings. Be specific to this site and its actual findings.",
      ].join("\n");

      const _r = await _ac.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 3000,
        system: "You are a JSON API. Return ONLY raw JSON. Never use markdown or code fences. No line breaks inside string values. All strings under 150 chars.",
        messages: [{ role: "user", content: prompt }]
      });
      const raw = (_r.content[0] as any).text || "";
      let pack: any = safeParseJSON(raw);
      // Truncation recovery
      if (!pack || !pack.executiveSummary) {
        try {
          const trimmed = raw.trimEnd();
          if (!trimmed.endsWith("}")) {
            let op=0,cl=0,ao=0,ac=0,inS=false,es=false;
            for (const c of trimmed) {
              if(es){es=false;continue;} if(c==="\\"){es=true;continue;}
              if(c==='"'){inS=!inS;continue;}
              if(!inS){if(c==="{")op++;if(c==="}") cl++;if(c==="[")ao++;if(c==="]")ac++;}
            }
            const closing="]".repeat(Math.max(0,ao-ac))+"}".repeat(Math.max(0,op-cl));
            const rec = safeParseJSON(trimmed+closing);
            if(rec && rec.executiveSummary) pack = rec;
          }
        } catch {}
      }
      if (!pack || !pack.executiveSummary) {
        return ok(res, { success: false, error: "Sales pack generation failed — please retry" });
      }
      return ok(res, { success: true, pack });
    } catch(e:any){ return ok(res,{success:false,error:e.message}); }
  }

  if (action === "instant_audit_showcase") {
    const { url = "", forLead = "", conversationAnalysis, salesContext = "" } = body;
    if (!url) return ok(res, { error: "url required" });
    try {
      const rawUrl = String(url).replace(/^https?:\/\//, "").replace(/\/$/, "");
      const hdrs = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9", "Cache-Control": "no-cache",
      };
      let _html = ""; let _fetched = false;
      try {
        const jKey = process.env.JINA_API_KEY || "";
        const jh: any = { "Accept": "text/html", "X-Return-Format": "html", "X-No-Cache": "true" };
        if (jKey) jh["Authorization"] = "Bearer " + jKey;
        const jr = await fetch("https://r.jina.ai/https://" + rawUrl, { headers: jh, signal: AbortSignal.timeout(14000), redirect: "follow" });
        if (jr.ok) { const t = await jr.text(); if (t.length > 500 && !t.includes("blocked")) { _html = t.slice(0, 14000); _fetched = true; } }
      } catch {}
      if (!_fetched) {
        for (const v of ["https://"+rawUrl, "https://www."+rawUrl, "http://"+rawUrl]) {
          try {
            const dr = await fetch(v, { headers: hdrs, signal: AbortSignal.timeout(10000), redirect: "follow" });
            if (dr.ok) { const t = await dr.text(); if (t.length > 200) { _html = t.slice(0, 14000); _fetched = true; break; } }
          } catch {}
        }
      }
      if (!_fetched || !_html) {
        return ok(res, { success: true, url: rawUrl, reachable: false, score: 20,
          categories: [{ name: "Accessibility", score: 0, issues: [{ issue: "Site could not be reached", severity: "critical", fix: "Verify the URL is live.", explanation: "The site was unreachable.", algorithmNote: null }] }],
          issues: [], quickWins: ["Verify URL is correct", "Check site is live"], algorithmHighlights: [],
          executiveSummary: "", showcase_message: "", contextSummary: "" });
      }
      const [algoR, brainR] = await Promise.allSettled([
        db().from("algorithm_knowledge").select("topic,summary,recommendations").order("freshness_score", { ascending: false }).limit(4),
        db().from("brain_learnings").select("card_title,improvement,what_worked").order("applied_count", { ascending: false }).limit(3),
      ]);
      const algoData: any[] = algoR.status === "fulfilled" ? (algoR.value.data || []) : [];
      const brainData: any[] = brainR.status === "fulfilled" ? (brainR.value.data || []) : [];
      const ctxParts: string[] = [];
      if (forLead) ctxParts.push("Client name: " + forLead);
      const ca: any = conversationAnalysis || {};
      if (ca.main_need) ctxParts.push("Their main need: " + ca.main_need);
      if (ca.urgency)   ctxParts.push("Urgency level: " + ca.urgency);
      if (algoData.length) ctxParts.push("Relevant algorithm updates: " + algoData.map((a:any) => a.topic + " — " + (a.summary||"").slice(0,80)).join("; "));
      if (brainData.length) ctxParts.push("Proven results: " + brainData.map((b:any) => b.improvement).join("; "));
      const salesInst = salesContext ? "SALES BRIEF — follow every instruction precisely:\n" + String(salesContext).slice(0, 600) : "";
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const schemaStr = '{"score":<0-100>,"executiveSummary":"<3-4 sentences about this specific site>","categories":[{"name":"Technical SEO","score":<0-100>,"narrative":"<2-3 sentences for this site>","issues":[{"issue":"<specific>","severity":"critical|high|medium|low","explanation":"<2 sentences why it matters>","fix":"<specific step>","algorithmNote":"<or null>"}]},{"name":"On-Page SEO","score":<0-100>,"narrative":"<narrative>","issues":[...]},{"name":"Content Quality","score":<0-100>,"narrative":"<narrative>","issues":[...]},{"name":"User Experience","score":<0-100>,"narrative":"<narrative>","issues":[...]}],"quickWins":["<action>","<action>","<action>"],"algorithmHighlights":["<update>","<update>"],"showcase_message":"<one sentence>","contextSummary":"<what was adjusted based on sales brief, or empty string>"}';
      const prompt = [
        "You are a senior SEO consultant writing a client-facing audit. Return ONLY raw JSON. No markdown. No code fences.",
        "Write as a real expert — specific to THIS site. Reference actual HTML content.",
        "URL: https://" + rawUrl,
        ctxParts.length ? "Context: " + ctxParts.join(" | ") : "",
        salesInst,
        "HTML from their site:\n" + _html.slice(0, 12000),
        "Return this JSON structure (4 categories, 2-4 issues each, no line breaks in strings):",
        schemaStr,
      ].filter(Boolean).join("\n");
      const _r = await _ac.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 5000,
        system: "Return ONLY valid JSON. No markdown. No code fences. No line breaks inside string values.",
        messages: [{ role: "user", content: prompt }]
      });
      const raw = (_r.content[0] as any).text || "";
      let result: any = safeParseJSON(raw);
      if (!result || !Array.isArray(result.categories) || !result.categories.length) {
        try {
          const trimmed = raw.trimEnd();
          if (!trimmed.endsWith("}")) {
            let op=0,cl=0,ao=0,ac=0,inS=false,es=false;
            for (const c of trimmed) {
              if(es){es=false;continue;} if(c==="\\"){es=true;continue;}
              if(c==='"'){inS=!inS;continue;}
              if(!inS){if(c==="{")op++;if(c==="}") cl++;if(c==="[")ao++;if(c==="]")ac++;}
            }
            const closing="]".repeat(Math.max(0,ao-ac))+"}".repeat(Math.max(0,op-cl));
            const rec = safeParseJSON(trimmed+closing);
            if(rec && Array.isArray(rec.categories) && rec.categories.length>0) result=rec;
          }
        } catch {}
      }
      const hasData = result && Array.isArray(result.categories) && result.categories.length>0
        && result.categories.some((c:any)=>Array.isArray(c.issues)&&c.issues.length>0);
      if (!hasData) {
        const hasTitle=/<title>[^<]{5,}/i.test(_html);
        const hasMeta=/meta[^>]+(name=["']description["'][^>]+content=|content=[^>]+name=["']description["'])/i.test(_html);
        const hasH1=/<h1[^>]*>[^<]{3,}/i.test(_html);
        const hasSchema=/application\/ld\+json/i.test(_html);
        const hasVp=/name=["']viewport["']/i.test(_html);
        const hasCan=/rel=["']canonical["']/i.test(_html);
        const titleText=(_html.match(/<title>([^<]{1,70})/i)||[])[1]||"";
        const h1Text=(_html.match(/<h1[^>]*>([^<]{1,60})/i)||[])[1]||"";
        const missing:string[]=[];
        if(!hasTitle) missing.push("Add title tag");
        if(!hasMeta)  missing.push("Add meta description");
        if(!hasH1)    missing.push("Add H1 heading");
        if(!hasSchema) missing.push("Add structured data");
        const score=Math.max(25,90-missing.length*12+(hasSchema?5:0)+(hasCan?3:0));
        result={
          score, executiveSummary:rawUrl+" shows "+(missing.length>0?missing.length+" foundational SEO gaps that need immediate attention.":"a solid technical foundation with opportunities for deeper optimisation."),
          categories:[
            {name:"Technical SEO",score:hasSchema&&hasVp?70:40,narrative:"Technical foundations "+(hasSchema?"partially in place":"largely missing")+".",
              issues:[!hasSchema?{issue:"No structured data (JSON-LD) found",severity:"high",explanation:"Without schema markup, Google cannot identify your business type or services. Rich results require this.",fix:"Add Organization and WebPage schema to the homepage via Google's Structured Data Markup Helper.",algorithmNote:"Google rewards clearly-identified content types"}:{issue:"Basic technical setup present",severity:"low",explanation:"Core technical elements detected.",fix:"Run a deeper crawl for hidden issues.",algorithmNote:null}]},
            {name:"On-Page SEO",score:hasTitle&&hasMeta&&hasH1?70:40,narrative:"On-page signals "+(hasTitle&&hasMeta&&hasH1?"present but can be refined":"incomplete")+".",
              issues:[
                ...(!hasTitle?[{issue:"Title tag missing",severity:"critical",explanation:"Title tags are one of the strongest ranking signals. Missing = Google generates its own, usually less effective.",fix:"Add a 50-60 char title with primary keyword in the first 30 characters.",algorithmNote:null}]:
                  titleText?[{issue:'Title found: "'+titleText.trim().slice(0,50)+'"',severity:titleText.length>60||titleText.length<30?"medium":"low",explanation:titleText.length>60?"Title exceeds 60 chars and will be truncated in search results.":titleText.length<30?"Title is too short to signal relevance effectively.":"Title length is good. Verify keyword placement.",fix:"Ensure primary keyword appears in first 30 characters. Keep 50-60 chars.",algorithmNote:null}]:[]),
                ...(!hasMeta?[{issue:"Meta description missing",severity:"high",explanation:"Meta descriptions directly influence click-through rates. Missing ones get auto-generated by Google.",fix:"Write 150-160 char meta description with a clear call to action.",algorithmNote:null}]:[]),
                ...(!hasH1?[{issue:"H1 heading not found",severity:"critical",explanation:"H1 is the primary on-page topic signal. Without it Google has reduced clarity about page content.",fix:"Add one H1 per page containing your primary target keyword.",algorithmNote:null}]:h1Text?[{issue:'H1: "'+h1Text.trim().slice(0,50)+'"',severity:"low",explanation:"H1 is present. Verify it contains the target keyword.",fix:"Ensure H1 exactly matches the keyword you want to rank for.",algorithmNote:null}]:[]),
              ]},
            {name:"Content Quality",score:50,narrative:"Content depth requires a full crawl to assess properly.",
              issues:[{issue:"Content depth not fully assessable",severity:"medium",explanation:"Google's Helpful Content system rewards sites demonstrating genuine expertise. Thin content is actively penalised.",fix:"Audit all pages for content depth, authorship signals and E-E-A-T compliance.",algorithmNote:"Helpful Content Update — depth and expertise are direct ranking factors"}]},
            {name:"User Experience",score:hasVp?60:40,narrative:"Core Web Vitals are a confirmed ranking factor.",
              issues:[{issue:"Page speed not tested",severity:"medium",explanation:"Core Web Vitals (LCP, CLS, INP) directly affect rankings in competitive searches.",fix:"Run Google PageSpeed Insights on key pages. Target 90+ on mobile. Focus on LCP under 2.5s first.",algorithmNote:"Core Web Vitals — direct ranking signal since 2021"}]},
          ],
          quickWins:missing.length>0?missing.slice(0,3):["Improve mobile page speed","Add structured data","Review internal linking"],
          algorithmHighlights:algoData.slice(0,2).map((a:any)=>a.topic+": "+(a.summary||"").slice(0,100)),
          showcase_message:"",
          contextSummary:salesContext?"Sales brief applied.":"",
        };
      }
      const allIssues:any[]=(result.categories||[]).flatMap((c:any)=>(c.issues||[]).map((i:any)=>({...i,category:c.name})));
      return ok(res,{
        success:true, url:rawUrl, reachable:true,
        score:typeof result.score==="number"?result.score:50,
        executiveSummary:result.executiveSummary||"",
        categories:result.categories||[],
        issues:allIssues,
        quickWins:result.quickWins||[],
        algorithmHighlights:result.algorithmHighlights||[],
        showcase_message:result.showcase_message||"",
        contextSummary:result.contextSummary||"",
      });
    } catch(e:any){ return ok(res,{success:false,url:"",error:e.message}); }
  }



  if (action === "get_pipeline") {
    try {
      const { data: _pd } = await db().from("lead_assignments").select("*, prospects(*)").order("updated_at", { ascending: false }).limit(30);
      return ok(res, { success: true, assignments: _pd || [] });
    } catch (e: any) { return ok(res, { error: e.message }); }
  }

  // ═══ END INLINE BDE ACTIONS ═══


  // === GENERATE CLIENT DOCUMENT (inline) ===
  if (action === "generate_client_doc") {
    const { docType = "proposal", conversationAnalysis, auditResult, leadInfo = {}, brandName: bName = "Manav S", brainLearnings: passedLearnings = [], language = "US English", currency = "USD" } = body;
    // Fetch live DB context
    const supaClient = db();
    const [algoR, brainR] = await Promise.allSettled([
      supaClient.from("algorithm_knowledge").select("topic,summary,freshness_score,recommendations").order("freshness_score", { ascending: false }).limit(12),
      supaClient.from("brain_learnings").select("card_title,improvement,what_worked,card_type,tags").order("applied_count", { ascending: false }).limit(10),
    ]);
    const algoData: any[] = algoR.status === "fulfilled" ? (algoR.value.data || []) : [];
    const brainData: any[] = brainR.status === "fulfilled" ? (brainR.value.data || []) : (passedLearnings as any[]);
    // Build full context string
    const ctx: string[] = [];
    ctx.push("LANGUAGE: Write the entire document in " + language + ". Use natural, fluent " + language + " — not translated English.");
    ctx.push("CURRENCY: Use " + currency + " for all pricing, investment figures, and ROI calculations.");
    if (leadInfo.url) ctx.push("CLIENT WEBSITE: " + leadInfo.url);
    if (leadInfo.name) ctx.push("CLIENT NAME: " + leadInfo.name);
    if (leadInfo.industry) ctx.push("INDUSTRY: " + leadInfo.industry);
    if (conversationAnalysis?.main_need) ctx.push("MAIN NEED: " + conversationAnalysis.main_need);
    if (conversationAnalysis?.urgency) ctx.push("URGENCY: " + conversationAnalysis.urgency);
    if (conversationAnalysis?.hidden_concern) ctx.push("HIDDEN CONCERN: " + conversationAnalysis.hidden_concern);
    if (conversationAnalysis?.best_next_message) ctx.push("THEIR CONTEXT: " + conversationAnalysis.best_next_message);
    if (conversationAnalysis?.fiverr_specific?.conversion_blocker) ctx.push("CONVERSION BLOCKER: " + conversationAnalysis.fiverr_specific.conversion_blocker);
    if (conversationAnalysis?.fiverr_specific?.order_probability) ctx.push("ORDER PROBABILITY: " + conversationAnalysis.fiverr_specific.order_probability + "%");
    if (auditResult?.score !== undefined) ctx.push("SEO SCORE: " + auditResult.score + "/100");
    if (auditResult?.url) ctx.push("AUDITED URL: " + auditResult.url);
    if (auditResult?.score !== undefined) {
      // Issues are objects {issue, severity, category, fix} — serialize properly
      const issueList = (auditResult.issues || []).map((iss: any) =>
        typeof iss === "string" ? iss : `[${(iss.severity||"").toUpperCase()}] ${iss.issue||""} → Fix: ${iss.fix||""}`
      ).join("\n");
      if (issueList) ctx.push("AUDIT ISSUES FOUND:\n" + issueList);
      if (auditResult.quickWins?.length) ctx.push("QUICK WINS: " + auditResult.quickWins.join(" | "));
      if (auditResult.algorithmHighlights?.length) ctx.push("ALGORITHM RELEVANCE: " + auditResult.algorithmHighlights.join(" | "));
    }
    if (algoData.length) ctx.push("CURRENT ALGORITHM KNOWLEDGE:\n" + algoData.map((a: any) => a.topic + ": " + a.summary + (a.recommendations ? " Recommendations: " + a.recommendations : "")).join("\n"));
    if (brainData.length) ctx.push("SEO SEASON PROVEN RESULTS:\n" + brainData.map((b: any) => b.card_title + ": " + b.improvement + (b.what_worked?.length ? " What worked: " + b.what_worked.join(", ") : "")).join("\n"));
    const DOC_PROMPTS: Record<string, string> = {
      proposal: "Write a DETAILED, PROFESSIONAL SEO PROPOSAL. This must be comprehensive and ready to send — no placeholders. Use every piece of context provided. Structure: (1) EXECUTIVE SUMMARY — 3 sentences addressing their specific situation, mention their website and what we found. (2) WHAT WE FOUND ON YOUR WEBSITE — list every audit issue found, explain each in plain English, explain the business impact. If no audit data, reference common issues for their industry. (3) THE OPPORTUNITY — specific numbers: how many people search for their services monthly in their area (estimate based on industry), what being on page 1 would mean in leads per month, revenue impact assuming industry average conversion rates. (4) OUR 90-DAY STRATEGY — Month 1: specific technical fixes we will make (reference actual issues found), Month 2: content and authority building (specific to their industry), Month 3: scaling and optimisation. Reference specific algorithm knowledge in explaining WHY each action works. (5) WHY WE WIN — 3 specific SEO Season differentiators with proof: AI Brain, real-time reporting, LLM visibility. Reference actual results from brain learnings if available. (6) INVESTMENT AND ROI — state a realistic monthly investment range for their business size (small business: £497-£997, medium: £997-£1997, enterprise: £2000+). Calculate ROI: if X new clients per month, at industry average client value, the campaign pays for itself in Y weeks. (7) NEXT STEPS — 3 clear actions. Minimum 700 words. No placeholders.",
      pitch_email: "Write a COLD PITCH EMAIL that is specific, personalised and immediately valuable. Subject line must reference something specific about their website or industry. Opening paragraph: reference an exact finding from their audit or a specific trend in their industry. Second paragraph: show you understand their business and their customers' search behaviour. Third paragraph: one specific result from a similar business (use brain learnings if available, otherwise create a realistic case: 'a [industry] client went from position 18 to position 3 for [relevant keyword] in 11 weeks'). Close: low-pressure ask for a 20-minute call. Under 220 words. No placeholders — use their actual website, their actual industry, actual findings.",
      followup_email: "Write a FOLLOW-UP EMAIL after a discovery call. Reference specific things from the conversation analysis. Paragraph 1: thank them and reference one specific thing they said (use main_need or hidden_concern). Paragraph 2: summarise the 3 biggest opportunities you identified, being specific to their industry and audit findings. Paragraph 3: proposed next step with a timeline. Include a realistic pricing indication based on their business size. Sign off with genuine enthusiasm. 200-280 words. No placeholders.",
      audit_summary: "Write a CLIENT-READY SEO AUDIT SUMMARY. Use every audit issue found. For each issue: (1) issue name in plain English, (2) what it means for their customers finding them, (3) what we will do to fix it, (4) expected improvement timeline. Then: QUICK WINS section — 2-3 fixes achievable in the first week. THE BIG PICTURE section — if all issues are fixed, what does ranking on page 1 look like in 90 days for their main keywords. Reference algorithm knowledge to explain why these issues matter right now in terms of current Google/AI search behaviour. 400-500 words. No placeholders.",
      whatsapp_msg: "Write a SHORT WHATSAPP/FIVERR MESSAGE. One paragraph, maximum 100 words. Reference something SPECIFIC about their website or their message (use actual audit finding or conversation insight). Show you have done your homework. End with one clear, easy call to action. Must feel personal, not templated. No placeholders.",
      case_study: "Write a MINI CASE STUDY about a business in the same industry as this prospect. Make it realistic and specific. SITUATION: describe a business with the exact same problems this prospect has (reference their audit issues and conversation). WHAT WE DID: 4 specific actions taken, referencing actual SEO techniques and algorithm knowledge. RESULTS: specific numbers — traffic increase percentage, keyword rankings achieved (specific keywords in their niche), leads per month before and after, timeframe. THE TURNING POINT: the one insight that changed everything. HOW THIS APPLIES TO YOU: direct connection to the prospect's situation. 350-400 words. Use specific, believable numbers. No placeholders.",
      suggestion_doc: "You are a senior SEO consultant producing a client-facing strategic document. This document backs up a specific outreach message with substance, credibility, and a clear path forward. Structure: (1) THE MESSAGE — reproduce the exact script word-for-word in a formatted box under the heading 'Recommended Message'. Do not change a single word. (2) WHY NOW — 2 focused paragraphs: first, what you specifically found about this client's situation that makes this the right move; second, why timing matters and what they risk by waiting. Reference their actual website, industry, and any audit findings. (3) THE PLAN — a numbered 3-step process showing exactly what happens if they say yes. Each step: one sentence of what we do, one sentence of what they get, timeline in days. (4) EVIDENCE — one specific case example from a similar business: situation, what was done, result in numbers. Make it realistic and industry-relevant. (5) NEXT STEP — one short paragraph, one clear low-friction ask. No pressure, just logic. Total: 450-600 words. No placeholders. Write as a senior consultant who has done this many times — authoritative, specific, and human.",
      objection_response: "Write a PROFESSIONAL OBJECTION RESPONSE. Use the conversion_blocker and hidden_concern from the conversation analysis to understand exactly what the objection is. ACKNOWLEDGE: genuinely validate their concern in one sentence. REFRAME: show a different way to see it, using specific data or logic. EVIDENCE: cite a specific result (from brain learnings or a realistic industry example). RISK REMOVAL: offer something that makes the first step feel safe (free audit, 30-day review, month-by-month contract). CLOSE: one clear, easy ask. 130-160 words. Address their ACTUAL objection, not a generic one.",
    };
    const sysPrompt = "You are " + bName + ", a senior SEO consultant who has been doing this for years. You write client documents that win business — proposals, emails, and strategic documents that feel personal, authoritative, and impossible to ignore. Write as a real human expert would: with conviction, specific knowledge, and genuine insight into the client's situation. Never use phrases like 'leverage', 'cutting-edge', 'state-of-the-art', 'innovative solutions', 'we believe', 'we think', 'it is important to'. Never mention AI, automation, or technology tools. Write entirely in your own voice — confident, warm, specific, and direct. Every sentence must earn its place. No padding, no corporate speak. Use active voice throughout. Do not leave anything for the reader to fill in.";
    const userPrompt = "CONTEXT:\n" + ctx.join("\n") + (body.suggestionContext ? "\n\nSUGGESTION CONTEXT:\n" + String(body.suggestionContext).slice(0,600) : "") + "\n\nTASK: " + (DOC_PROMPTS[docType] || DOC_PROMPTS.proposal) + "\n\nReturn a JSON object with this EXACT structure (raw JSON only, no markdown):\n{\"title\":\"document title\",\"subtitle\":\"compelling one-line subtitle\",\"recipientName\":\"client name\",\"preparedFor\":\"company name if known\",\"sections\":[{\"heading\":\"SECTION HEADING\",\"body\":\"full section text — use \\\\n for line breaks, use \\\\n\\\\n for paragraph breaks\",\"type\":\"intro|findings|plan|pricing|proof|cta|body\"}],\"footerNote\":\"personalised note\"}";
    try {
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const _r = await _ac.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 3000, system: sysPrompt,
        messages: [{ role: "user", content: userPrompt }]
      });
      const raw = (_r.content[0] as any).text || "{}";
      const cleaned = raw.replace(/^```[a-z]*/i,"").replace(/```/g,"").trim();
      let doc: any = safeParseJSON(raw);
      const typeLabel: Record<string,string> = { proposal:"Strategic SEO Proposal", pitch_email:"Pitch Email", followup_email:"Follow-up", audit_summary:"SEO Audit Summary", whatsapp_msg:"Message", case_study:"Case Study", objection_response:"Response", suggestion_doc:"AI Suggestion Document" };
      // Fallback — wrap raw text as a single section
      if (!doc || !doc.sections) {
        const fallbackBody = cleaned.replace(/^[`\s]*json\s*/i,"").replace(/[`\s]*$/,"").trim();
        doc = {
          title: bName + " — " + (typeLabel[docType] || "SEO Proposal"),
          subtitle: "",
          recipientName: leadInfo.name || "",
          preparedFor: leadInfo.name || "",
          sections: [{ heading: "", body: fallbackBody, type: "body" }],
          footerNote: ""
        };
      }
      const clientName: string = doc.recipientName || leadInfo.name || "Valued Prospect";
      const companyName: string = doc.preparedFor || leadInfo.name || "";
      const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const secHtml = (doc.sections || []).map((s: any) => {
        const rows = (s.body || "").split("\n").map((ln: string) => {
          const t = ln.trim();
          if (!t) return "";
          if (t.startsWith("- ") || t.startsWith("* ")) return "<li>" + t.slice(2) + "</li>";
          return "<p>" + t + "</p>";
        }).join("");
        const wrapped = rows.replace(/(<li>.*?<\/li>)+/g, (m: string) => "<ul>" + m + "</ul>");
        if (!s.heading) return "<div class=\"sec body\">" + wrapped + "</div>";
        return "<div class=\"sec " + (s.type || "body") + "\"><h2>" + s.heading + "</h2>" + wrapped + "</div>";
      }).join("");
      // ── Document renderer ─────────────────────────────────────
      const escH = (s: string) =>
        String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

      const fmt = (s: string, col: string) =>
        escH(s)
          .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${col};font-weight:700;">$1</strong>`)
          .replace(/\*(.+?)\*/g, "<em>$1</em>");

      const renderBody = (body: string, textColor: string): string => {
        const lns = String(body||"").split("\n");
        let out = ""; let listType: "ul"|"ol"|null = null;
        const closeList = () => {
          if (listType === "ul") { out += "</ul>"; listType = null; }
          if (listType === "ol") { out += "</ol>"; listType = null; }
        };
        for (const raw of lns) {
          const t = raw.trim();
          if (!t) { closeList(); continue; }
          if (t.startsWith("## ") || t.startsWith("### ")) {
            closeList();
            out += `<p style="margin:10pt 0 3pt 0;font-size:9.5pt;font-weight:bold;`
                 + `letter-spacing:0.8pt;color:${textColor};opacity:0.75;">`
                 + `${fmt(t.replace(/^#+\s*/,""), textColor)}</p>`;
          } else if (/^[-•*]\s/.test(t)) {
            if (listType !== "ul") {
              closeList();
              out += `<ul style="margin:4pt 0 8pt 18pt;padding:0;">`;
              listType = "ul";
            }
            out += `<li style="font-size:11pt;line-height:1.7;margin-bottom:3pt;color:${textColor};">`
                 + `${fmt(t.replace(/^[-•*]\s/,""), textColor)}</li>`;
          } else if (/^\d+\.\s/.test(t)) {
            if (listType !== "ol") {
              closeList();
              out += `<ol style="margin:4pt 0 8pt 18pt;padding:0;">`;
              listType = "ol";
            }
            out += `<li style="font-size:11pt;line-height:1.7;margin-bottom:3pt;color:${textColor};">`
                 + `${fmt(t.replace(/^\d+\.\s/,""), textColor)}</li>`;
          } else {
            closeList();
            out += `<p style="margin:0 0 8pt 0;font-size:11pt;line-height:1.8;color:${textColor};">`
                 + `${fmt(t, textColor)}</p>`;
          }
        }
        closeList();
        return out;
      };

      // Section config
      const SEC_CFG: Record<string,{bg:string;border:string;tc:string;hc:string}> = {
        intro:    { bg:"#FFFFFF", border:"none",                tc:"#2A2A3E", hc:"#1B4080" },
        findings: { bg:"#F3F7FF", border:"3pt solid #1B4080",  tc:"#2A2A3E", hc:"#1B4080" },
        plan:     { bg:"#FFF7F3", border:"3pt solid #C94F1A",  tc:"#2A2A3E", hc:"#C94F1A" },
        pricing:  { bg:"#EEF4FF", border:"3pt solid #1B4080",  tc:"#2A2A3E", hc:"#1B4080" },
        proof:    { bg:"#F2FCF5", border:"3pt solid #1A7A45",  tc:"#2A2A3E", hc:"#1A7A45" },
        cta:      { bg:"#1B4080", border:"none",                tc:"#FFFFFF", hc:"#E8652A" },
        body:     { bg:"#FFFFFF", border:"none",                tc:"#2A2A3E", hc:"#1B4080" },
      };
      const DEF = { bg:"#FFFFFF", border:"none", tc:"#2A2A3E", hc:"#1B4080" };

      const secRows = (doc.sections||[]).map((s: any) => {
        const c = SEC_CFG[s.type] || DEF;
        const bl = c.border !== "none" ? `border-left:${c.border};` : "";
        const headHtml = s.heading
          ? `<p style="margin:0 0 0 0;font-family:Calibri,Arial,sans-serif;`
          + `font-size:7.5pt;font-weight:bold;letter-spacing:2pt;`
          + `text-transform:uppercase;color:${c.hc};">${escH(s.heading)}</p>`
          + `<div style="height:1.5pt;background:${c.hc};margin:5pt 0 10pt 0;"></div>`
          : "";
        const bodyHtml = renderBody(s.body, c.tc);
        return `<tr>
          <td style="background:${c.bg};${bl}padding:16pt 22pt;page-break-inside:avoid;vertical-align:top;">
            ${headHtml}${bodyHtml}
          </td>
        </tr>
        <tr><td style="height:10pt;background:#FFFFFF;font-size:1pt;">&nbsp;</td></tr>`;
      }).join("\n");

      const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<title>${escH(doc.title)}</title>
<!--[if gte mso 9]><xml>
<w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom>
<w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
  @page { size:A4; margin:0; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Calibri,"Segoe UI",Arial,sans-serif; font-size:11pt;
         color:#2A2A3E; background:#fff;
         -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  table { border-collapse:collapse; }
  p { margin:0; }
  ul,ol { margin:0; padding:0 0 0 18pt; }
  strong { font-weight:700; }
  @media print { * { -webkit-print-color-adjust:exact; } }
</style>
</head>
<body style="margin:0;padding:0;">

<!-- HEADER -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
  <td width="5" style="background:#E8652A;">&nbsp;</td>
  <td style="background:#1B4080; padding:30pt 30pt 26pt 26pt;">
    <p style="font-size:7.5pt;font-weight:bold;letter-spacing:3pt;text-transform:uppercase;
              color:rgba(255,255,255,0.55);margin:0 0 5pt 0;font-family:Calibri,Arial,sans-serif;">
      ${escH(bName)}&nbsp;&nbsp;&bull;&nbsp;&nbsp;SEO Season
    </p>
    <p style="font-size:7.5pt;font-weight:bold;letter-spacing:2pt;text-transform:uppercase;
              color:#E8652A;margin:0 0 12pt 0;font-family:Calibri,Arial,sans-serif;">
      ${escH(typeLabel[docType]||"Strategic Document")}
    </p>
    <p style="font-size:21pt;font-weight:300;color:#FFFFFF;line-height:1.25;
              margin:0 0 ${doc.subtitle?"7":"0"}pt 0;font-family:Calibri,Arial,sans-serif;">
      ${escH(doc.title)}
    </p>
    ${doc.subtitle ? `<p style="font-size:11pt;color:rgba(255,255,255,0.5);font-style:italic;
      margin:0;font-family:Calibri,Arial,sans-serif;">${escH(doc.subtitle)}</p>` : ""}
  </td>
</tr>
<tr>
  <td width="5" style="background:#BF4116;">&nbsp;</td>
  <td style="background:#E8652A; padding:7pt 30pt 7pt 26pt;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-size:8.5pt;font-weight:600;color:#fff;font-family:Calibri,Arial,sans-serif;">
        Prepared for:&nbsp;<strong style="color:#fff;">${escH(clientName)}${companyName && companyName !== clientName ? " &mdash; " + escH(companyName) : ""}</strong>
      </td>
      <td align="center" style="font-size:8.5pt;color:rgba(255,255,255,0.85);font-family:Calibri,Arial,sans-serif;">${today}</td>
      <td align="right" style="font-size:8.5pt;color:rgba(255,255,255,0.75);font-style:italic;font-family:Calibri,Arial,sans-serif;">Confidential</td>
    </tr></table>
  </td>
</tr>
<tr><td colspan="2" style="height:6pt;background:#fff;">&nbsp;</td></tr>
</table>

<!-- BODY -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
  <td width="5" style="background:#fff;">&nbsp;</td>
  <td style="padding:4pt 26pt;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${secRows}
    </table>
  </td>
  <td width="5" style="background:#fff;">&nbsp;</td>
</tr>
</table>

<!-- FOOTER -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10pt;">
<tr>
  <td width="5" style="background:#E8652A;">&nbsp;</td>
  <td style="border-top:1pt solid #DDE4F0; padding:9pt 30pt 9pt 26pt;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-size:8pt;color:#999;font-family:Calibri,Arial,sans-serif;">
        <strong style="color:#1B4080;font-weight:700;">${escH(bName)}</strong>
        &nbsp;&bull;&nbsp;SEO Season
      </td>
      <td align="right" style="font-size:8pt;color:#bbb;font-style:italic;font-family:Calibri,Arial,sans-serif;">
        ${doc.footerNote ? escH(doc.footerNote) : "Prepared exclusively for " + escH(clientName)}
      </td>
    </tr></table>
  </td>
</tr>
</table>

</body></html>`;
      
            return ok(res, { success: true, html, docType, title: doc.title, clientName });
    } catch (e: any) { return ok(res, { error: e.message }); }
  }
  // === END GENERATE CLIENT DOCUMENT ===

  // ═══ LEAD INTELLIGENCE ACTIONS ═══

  if (action === "get_quick_responses") {
    try {
      const { data } = await db().from("quick_responses").select("*").eq("active", true).order("usage_count", { ascending: false }).limit(60);
      return ok(res, { success: true, responses: data || [] });
    } catch (e: any) { return ok(res, { success: true, responses: [] }); }
  }

  if (action === "save_lead_conversation") {
    const { prospectName = "Prospect", prospectUrl = "", industry = "",
            analysis, conversationText = "", deepAnalysis: deepAn,
            auditResult: aRes, staffId = "bde" } = body;
    const slug = String(prospectName).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
    const payload = JSON.stringify({
      prospectName, prospectUrl, industry, analysis,
      conversationText: String(conversationText).slice(0, 8000),
      deepAnalysis: deepAn || null,
      auditResult: aRes || null,
      savedAt: new Date().toISOString(), staffId
    });
    // PRIMARY: brain_learnings with null project_id (always works)
    try {
      const { error: blErr } = await db().from("brain_learnings").insert({
        project_id: null,
        card_type: "lead_intel",
        card_title: ("LEAD: " + prospectName).slice(0, 100),
        context_summary: payload,
        improvement: "Lead saved from BDE panel",
        what_worked: [],
        what_missed: [],
        tags: ["lead_intel", slug],
        source: "lead_intel",
        applied_count: 0,
        updated_at: new Date().toISOString()
      });
      if (!blErr) return ok(res, { success: true, prospectName, store: "brain_learnings" });
    } catch (_e1) {}
    // FALLBACK: ai_content_cache
    const cacheKey = "lead_intel_" + slug + "_" + Date.now();
    try {
      await db().from("ai_content_cache").insert({ cache_key: cacheKey, response: payload, project_id: null });
      return ok(res, { success: true, prospectName, store: "cache_null", cacheKey });
    } catch (_e2) {}
    try {
      const { data: fp } = await db().from("projects").select("id").limit(1).single();
      const pid = (fp as any)?.id || null;
      await db().from("ai_content_cache").insert({ cache_key: cacheKey, response: payload, project_id: pid });
      return ok(res, { success: true, prospectName, store: "cache_proj", cacheKey });
    } catch (_e3) {}
    return ok(res, { success: false, error: "All storage strategies failed — check Supabase permissions for brain_learnings and ai_content_cache" });
  }


  if (action === "get_lead_prospects") {
    try {
      const map: Record<string, any> = {};
      const processRaw = (raw: string, ts: string) => {
        try {
          const d = JSON.parse(raw);
          const key = String(d.prospectName || "Unknown");
          if (!map[key]) {
            map[key] = { name: key, url: d.prospectUrl || "", industry: d.industry || "",
              latestAnalysis: d.analysis || null, lastSeen: ts, conversationCount: 0, status: "active" };
          }
          map[key].conversationCount++;
          if (new Date(ts) > new Date(map[key].lastSeen)) {
            map[key].lastSeen = ts;
            map[key].latestAnalysis = d.analysis || map[key].latestAnalysis;
          }
        } catch {}
      };
      // PRIMARY: brain_learnings
      const { data: bLeads } = await db().from("brain_learnings")
        .select("context_summary,created_at,updated_at")
        .eq("source", "lead_intel")
        .order("created_at", { ascending: false }).limit(500);
      (bLeads || []).forEach((r: any) => processRaw(r.context_summary, r.updated_at || r.created_at));
      // FALLBACK: ai_content_cache
      try {
        const { data: convs } = await db().from("ai_content_cache")
          .select("response,created_at").like("cache_key", "lead_intel_%")
          .order("created_at", { ascending: false }).limit(200);
        (convs || []).forEach((c: any) => processRaw(c.response, c.created_at));
      } catch {}
      const prospects = Object.values(map)
        .sort((a: any, b: any) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
      return ok(res, { success: true, prospects });
    } catch (e: any) { return ok(res, { success: false, error: e.message, prospects: [] }); }
  }


  if (action === "get_lead_conversations") {
    const { prospectName } = body;
    if (!prospectName) return ok(res, { conversations: [] });
    const slug = String(prospectName).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
    try {
      const convs: any[] = [];
      // PRIMARY: brain_learnings
      const { data: bLeads } = await db().from("brain_learnings")
        .select("id,context_summary,created_at,updated_at")
        .eq("source", "lead_intel")
        .contains("tags", [slug])
        .order("created_at", { ascending: false }).limit(100);
      (bLeads || []).forEach((r: any) => convs.push({
        id: r.id, response: r.context_summary,
        created_at: r.created_at, updated_at: r.updated_at
      }));
      // FALLBACK: ai_content_cache
      if (!convs.length) {
        try {
          const { data: cached } = await db().from("ai_content_cache")
            .select("cache_key,response,created_at")
            .like("cache_key", "lead_intel_" + slug + "_%")
            .order("created_at", { ascending: false }).limit(100);
          (cached || []).forEach((c: any) => convs.push(c));
        } catch {}
      }
      return ok(res, { success: true, conversations: convs });
    } catch (e: any) { return ok(res, { success: false, error: e.message, conversations: [] }); }
  }


  if (action === "generate_lead_suggestions") {
    const { prospectName = "", prospectUrl = "", latestAnalysis, auditData,
            conversationCount = 0, callContext = "", attachContext = "" } = body;
    try {
      const [algoR, brainR] = await Promise.allSettled([
        db().from("algorithm_knowledge").select("topic,summary,recommendations").order("freshness_score", { ascending: false }).limit(6),
        db().from("brain_learnings").select("card_title,improvement,what_worked").order("applied_count", { ascending: false }).limit(5),
      ]);
      const algo: any[] = algoR.status === "fulfilled" ? (algoR.value?.data || []) : [];
      const brain: any[] = brainR.status === "fulfilled" ? (brainR.value?.data || []) : [];

      const ctx: string[] = [];
      if (prospectName) ctx.push("Prospect: " + prospectName);
      if (prospectUrl) ctx.push("Website: " + prospectUrl);
      if (latestAnalysis?.main_need) ctx.push("Main need: " + latestAnalysis.main_need);
      if (latestAnalysis?.urgency) ctx.push("Urgency: " + latestAnalysis.urgency);
      if (latestAnalysis?.hidden_concern) ctx.push("Hidden concern: " + latestAnalysis.hidden_concern);
      if (latestAnalysis?.fiverr_specific?.conversion_blocker) ctx.push("Conversion blocker: " + latestAnalysis.fiverr_specific.conversion_blocker);
      if (latestAnalysis?.fiverr_specific?.order_probability !== undefined) ctx.push("Order probability: " + latestAnalysis.fiverr_specific.order_probability + "%");
      if (auditData?.score !== undefined) ctx.push("SEO score: " + auditData.score + "/100");
      if (auditData?.issues?.length) {
        const issueText = (auditData.issues as any[]).map((i: any) =>
          typeof i === "string" ? i : (i.severity ? "[" + i.severity.toUpperCase() + "] " : "") + (i.issue || "")
        ).filter(Boolean).slice(0, 5).join("; ");
        if (issueText) ctx.push("Audit issues: " + issueText);
      }
      if (auditData?.quickWins?.length) ctx.push("Quick wins: " + (auditData.quickWins as string[]).slice(0, 3).join("; "));
      if (conversationCount > 0) ctx.push("Saved conversations: " + conversationCount);
      if (callContext) ctx.push("Call context: " + String(callContext).slice(0, 400));
      if (attachContext) ctx.push("File attachments context: " + String(attachContext).slice(0, 300));
      if (algo.length) ctx.push("Latest algorithm updates: " + algo.map((a: any) => a.topic + ": " + a.summary + (a.recommendations ? " → " + a.recommendations : "")).join(" | "));
      if (brain.length) ctx.push("Proven SEO Season results: " + brain.map((b: any) => b.card_title + ": " + b.improvement).join(" | "));
      if (!ctx.length) ctx.push("Prospect: " + (prospectName || "unknown") + ". No prior analysis. Generate helpful general SEO closing suggestions.");

      const _ac2 = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const _r2 = await _ac2.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 1800,
        system: "You are a senior Fiverr BDE coach. Generate 5 specific, actionable suggestions to close this lead. IMPORTANT: Return ONLY a valid JSON array. No text before or after. No markdown. No wrapper object. Just the array starting with [ and ending with ].",
        messages: [{ role: "user", content: "LEAD CONTEXT:\n" + ctx.join("\n") + "\n\nGenerate exactly 5 suggestions. Return ONLY a JSON array [ ] with objects: type (close/followup/upsell/audit/content), priority (high/medium/low), action (exact step), script (word-for-word Fiverr message for this lead), reason (why this works), timing." }]
      });
      const raw2 = (_r2.content[0] as any).text || "[]";
      // Try multiple parse strategies
      let suggestions: any[] = [];
      const cleaned2 = raw2.replace(/^```[a-z]*/i, "").replace(/```/g, "").trim();
      // Strategy 1: direct parse
      try { const p = JSON.parse(cleaned2); suggestions = Array.isArray(p) ? p : Array.isArray((p as any).suggestions) ? (p as any).suggestions : []; } catch {}
      // Strategy 2: extract array from response
      if (!suggestions.length) {
        const arrMatch = cleaned2.match(/\[[\s\S]+\]/);
        if (arrMatch) try { suggestions = JSON.parse(arrMatch[0]); } catch {}
      }
      // Strategy 3: extract individual objects
      if (!suggestions.length) {
        const objMatches = [...cleaned2.matchAll(/\{[\s\S]+?\}/g)];
        for (const m of objMatches) {
          try { const obj = JSON.parse(m[0]); if (obj.action || obj.script) suggestions.push(obj); } catch {}
        }
      }
      if (!suggestions.length) {
        return ok(res, { success: false, error: "Claude could not generate suggestions — try saving more conversation context for this lead", suggestions: [] });
      }
      return ok(res, { success: true, suggestions: suggestions.slice(0, 5) });
    } catch (e: any) { return ok(res, { success: false, error: e.message, suggestions: [] }); }
  }

  // ═══ END LEAD INTELLIGENCE ACTIONS ═══

  if (action === "generate_best_message") {
    const { conversationText = "", analysis = {}, emotionLevel = 5, technicalLevel = 3 } = body;
    try {
      const emo = Number(emotionLevel);
      const tec = Number(technicalLevel);
      const emoDesc = emo <= 3 ? "professional and businesslike, keep it brief" : emo <= 6 ? "warm and friendly, show genuine interest" : "highly empathetic and personal, build emotional connection";
      const tecDesc = tec <= 3 ? "plain English only, no SEO jargon at all" : tec <= 6 ? "light SEO terms explained in plain language" : "use SEO terminology confidently, show deep expertise";
      const a: any = analysis;
      const contextParts: string[] = [];
      if (a.main_need) contextParts.push("Their main need: " + a.main_need);
      if (a.urgency) contextParts.push("Urgency level: " + a.urgency);
      if (a.hidden_concern) contextParts.push("Hidden concern: " + a.hidden_concern);
      if (a.fiverr_specific?.conversion_blocker) contextParts.push("What is blocking them: " + a.fiverr_specific.conversion_blocker);
      if (a.fiverr_specific?.order_probability) contextParts.push("Order probability: " + a.fiverr_specific.order_probability + "%");
      if (a.demo_to_show?.length) contextParts.push("Things to show: " + a.demo_to_show.join(", "));
      if (a.quick_wins_to_mention?.length) contextParts.push("Quick wins to mention: " + a.quick_wins_to_mention.join(", "));
      const analysisCtx = contextParts.join(" | ");
      const sysPrompt = "You are a BDE at SEO Season writing the actual Fiverr reply message. Write the message itself — not guidance about what to write. It must sound human and genuine, not AI-generated. Match the tone of the original conversation.";
      const userPrompt = "CONVERSATION CONTEXT:\n" + String(conversationText).slice(0, 2000) + "\n\nANALYSIS:\n" + analysisCtx + "\n\nTONE SETTINGS:\n- Emotion: " + emo + "/10 (" + emoDesc + ")\n- Technical: " + tec + "/10 (" + tecDesc + ")\n\nWrite the actual reply to send to this client RIGHT NOW. Address their specific situation directly. Match the existing conversation tone. Keep under 130 words unless truly needed. Do NOT start with Hello/Hi unless it fits naturally.\n\nAfter the message add a line: CONSIDERED: then a JSON array of 3-5 short strings of specific things you factored in.\n\nExample format:\n[Your message here]\nCONSIDERED: [\"Their urgency\", \"Price concern\"]";
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const _r = await _ac.messages.create({ model: "claude-sonnet-4-6", max_tokens: 600, system: sysPrompt, messages: [{ role: "user", content: userPrompt }] });
      const raw = (_r.content[0] as any).text || "";
      const cidx = raw.lastIndexOf("CONSIDERED:");
      let message = raw.trim();
      let considerations: string[] = [];
      if (cidx !== -1) {
        message = raw.slice(0, cidx).trim();
        try { considerations = JSON.parse(raw.slice(cidx + 11).trim()); } catch {
          const m = raw.slice(cidx + 11).match(/"([^"]+)"/g);
          if (m) considerations = m.map((s: string) => s.replace(/"/g, ""));
        }
      }
      return ok(res, { success: true, message, considerations });
    } catch (e: any) { return ok(res, { error: e.message }); }
  }

  if (action === "analyse_conversation_deep") {
    const { messages = [] } = body;
    if (!messages.length) return ok(res, { success: false, error: "No messages to analyse" });
    try {
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msgList = (messages as any[]).map((m: any, i: number) =>
        i + "|" + (m.speaker || "unknown") + "|" + String(m.text || "").replace(/\n/g, " ").slice(0, 600)
      ).join("\n");
      const totalMsgs = messages.length;
      const sys2 = "You are a brutally honest Fiverr BDE coach. You MUST analyse every single message and return data for ALL " + totalMsgs + " messages. Never skip a message. Be specific about missed opportunities and ToS risks.";
      const usr2 = "Analyse every message in this Fiverr conversation (INDEX|SPEAKER|TEXT):\n" + msgList
        + "\n\nIMPORTANT: Return data for ALL " + totalMsgs + " messages. Index must match exactly (0-based)."
        + "\n\nReturn ONLY raw JSON. No markdown. No code fences. This exact structure:"
        + "\n{\"messages\":[{\"index\":0,\"speaker\":\"client\",\"emotion\":\"curious\",\"intent\":\"what client wants\",\"conversionAfter\":50,\"delta\":0,\"quality\":null,\"missed\":null,\"betterReply\":null,\"riskFlag\":null}],"
        + "\"overallConversion\":60,\"topMiss\":\"biggest mistake\",\"topWin\":\"best thing done or null\",\"nextAction\":\"exact next step\",\"urgency\":\"high\"}\n\n"
        + "Rules: speaker=client: fill emotion+intent, quality=null. speaker=me: fill quality(good/ok/poor)+missed+betterReply+riskFlag, emotion=null+intent=null."
        + " riskFlag: TOS_VIOLATION=shared external contact, MULTIPLE_MESSAGES=3+ messages in a row, WEAK_CLOSE=missed chance to close, NO_VALUE_PROP=no value mentioned."
        + " betterReply=exact improved message to send. missed=specific thing that was missed.";
      const _r = await _ac.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 4000,
        system: sys2, messages: [{ role: "user", content: usr2 }]
      });
      const raw = (_r.content[0] as any).text || "{}";
            const result: any = safeParseJSON(raw);
      if (!result) {
        return ok(res, { success: false, error: "Claude returned unparseable response", rawPreview: raw.slice(0, 400) });
      }
      // Normalise: handle wrapped responses like {analysis:{messages:[...]}} or {data:{...}}
      if (!Array.isArray(result.messages)) {
        const nested = result.analysis || result.data || result.result || result.conversation;
        if (nested && Array.isArray(nested.messages)) result = nested;
        else if (Array.isArray(nested)) result.messages = nested;
      }
      if (!Array.isArray(result.messages) || !result.messages.length) {
        return ok(res, { success: false, error: "Claude response missing messages array", rawPreview: raw.slice(0, 400), parsed: JSON.stringify(result).slice(0,200) });
      }
      return ok(res, { success: true, ...result });
    } catch (e: any) { return ok(res, { success: false, error: e.message }); }
  }

  if (action === "extract_attachment_context") {
    const { base64, mimeType = "image/jpeg", fileName = "file", conversationContext = "" } = body;
    if (!base64) return ok(res, { error: "base64 required" });
    try {
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const isPdf = mimeType === "application/pdf";
      const isImage = mimeType.startsWith("image/");
      const sysP = "You are an SEO consultant analysing a file. Return ONLY raw JSON with: summary (2-3 sentences), keyFindings (string[] of specific facts/numbers/errors), seoIssues (string[] of SEO problems visible), actionItems (string[] of what to do), clientContext (string — what this reveals about the client). Be specific.";
      const userContent: any[] = [];
      if (isImage) {
        userContent.push({ type: "image", source: { type: "base64", media_type: mimeType, data: base64 } });
      } else if (isPdf) {
        userContent.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
      }
      const ctxNote = conversationContext ? "\n\nConversation context: " + conversationContext.slice(0, 500) : "";
      userContent.push({ type: "text", text: "File: " + fileName + ctxNote + "\n\nAnalyse this file and extract: (1) What it shows/contains, (2) Key SEO/technical issues visible, (3) Specific numbers, errors, or data points, (4) What action this suggests. Be concrete and specific — no generic statements." });
      const _r = await _ac.messages.create({ model: "claude-sonnet-4-6", max_tokens: 1200, system: sysP, messages: [{ role: "user", content: userContent }] });
      const rawR = (_r.content[0] as any).text||"";
      let st:any=safeParseJSON(rawR);
      const description = st?(st.summary||"")+(st.keyFindings?.length?"\n\nKey findings:\n"+st.keyFindings.map((f:string)=>"• "+f).join("\n"):"")+(st.seoIssues?.length?"\n\nSEO Issues:\n"+st.seoIssues.map((f:string)=>"• "+f).join("\n"):"")+(st.actionItems?.length?"\n\nAction items:\n"+st.actionItems.map((f:string)=>"→ "+f).join("\n"):""):rawR;
      return ok(res, { success:true, description, structured:st, fileName, mimeType });
    } catch (e: any) { return ok(res, { success: false, error: e.message }); }
  }


  if (action === "delete_lead") {
    const { prospectName } = body;
    if (!prospectName) return ok(res, { error: "prospectName required" });
    const slug = String(prospectName).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
    try {
      // Delete from brain_learnings (primary store)
      const { error: e1 } = await db().from("brain_learnings")
        .delete().eq("source", "lead_intel").contains("tags", [slug]);
      // Delete from ai_content_cache (fallback store)
      try { await db().from("ai_content_cache").delete().like("cache_key", "lead_intel_" + slug + "_%"); } catch {}
      if (e1) return ok(res, { success: false, error: e1.message });
      return ok(res, { success: true, deleted: prospectName });
    } catch (e: any) { return ok(res, { success: false, error: e.message }); }
  }

  if (action === "archive_lead") {
    const { prospectName, status = "archived" } = body;
    if (!prospectName) return ok(res, { error: "prospectName required" });
    const slug = String(prospectName).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
    try {
      // Update all brain_learnings entries for this lead
      const { data: rows } = await db().from("brain_learnings")
        .select("id,context_summary").eq("source", "lead_intel").contains("tags", [slug]);
      for (const row of (rows || [])) {
        try {
          const payload = JSON.parse(row.context_summary || "{}");
          payload.status = status;
          await db().from("brain_learnings").update({
            context_summary: JSON.stringify(payload),
            updated_at: new Date().toISOString()
          }).eq("id", row.id);
        } catch {}
      }
      return ok(res, { success: true, archived: prospectName, status });
    } catch (e: any) { return ok(res, { success: false, error: e.message }); }
  }


  if (action === "process_call_transcript") {
    const { base64, mimeType = "text/plain", fileName = "transcript.txt", prospectName = "", prospectUrl = "", callDate = "", text: rawInput = "" } = body;
    if (!base64 && !rawInput) return ok(res, { error: "base64 or text required" });
    try {
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const rawText = rawInput || Buffer.from(base64, "base64").toString("utf-8").slice(0, 20000);
      const userP = "Call transcript (" + fileName + ")" + (callDate ? " from " + callDate : "") + ":\n\n" + rawText.slice(0, 14000)
        + "\n\nReturn ONLY raw JSON (no markdown). Fields: clientName (string), callDate (string), duration (string or null), summary (2-3 sentences), keyPoints (string[]), decisions (string[]), commitments (string[] — what YOU promised), clientConcerns (string[]), nextSteps (string[]), sentiment (\"positive\"|\"neutral\"|\"negative\"), orderProbability (integer 0-100).";
      const _r = await _ac.messages.create({ model: "claude-sonnet-4-6", max_tokens: 1500,
        system: "You are an expert at analysing sales call transcripts. Extract every detail that helps close the deal.",
        messages: [{ role: "user", content: userP }] });
      const raw = (_r.content[0] as any).text || "{}";
      let parsed: any = {};
      parsed = safeParseJSON(raw) || {};
      const pName = prospectName || parsed.clientName || "";
      const slug = String(pName).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
      const payload = JSON.stringify({ ...parsed, fileName, prospectName: pName, prospectUrl, callDate: callDate || parsed.callDate || "", rawText: rawText.slice(0, 6000), savedAt: new Date().toISOString() });
      let savedId = "";
      try {
        const { data: ins } = await db().from("brain_learnings").insert({ project_id: null, card_type: "call_transcript",
          card_title: ("CALL: " + (pName || fileName)).slice(0, 100), context_summary: payload,
          improvement: parsed.summary || "Call transcript", what_worked: parsed.commitments || [], what_missed: parsed.clientConcerns || [],
          tags: ["call_transcript", slug], source: "call_transcript", applied_count: 0, updated_at: new Date().toISOString()
        }).select("id").single();
        savedId = (ins as any)?.id || "";
      } catch {}
      return ok(res, { success: true, parsed, id: savedId, fileName });
    } catch (e: any) { return ok(res, { success: false, error: e.message }); }
  }

  if (action === "get_call_transcripts") {
    const { prospectName } = body;
    try {
      const { data } = await db().from("brain_learnings").select("id,card_title,context_summary,created_at")
        .eq("source", "call_transcript").order("created_at", { ascending: false }).limit(200);
      const transcripts = (data || []).map((r: any) => {
        let d: any = {};
        try { d = JSON.parse(r.context_summary || "{}"); } catch {}
        return { id: r.id, fileName: d.fileName || r.card_title, clientName: d.clientName || d.prospectName || "",
          callDate: d.callDate || "", summary: d.summary || "", keyPoints: d.keyPoints || [], decisions: d.decisions || [],
          commitments: d.commitments || [], clientConcerns: d.clientConcerns || [], nextSteps: d.nextSteps || [],
          sentiment: d.sentiment || "neutral", orderProbability: d.orderProbability, created_at: r.created_at };
      });
      const out = prospectName
        ? transcripts.filter((t: any) => String(t.clientName).toLowerCase().includes(String(prospectName).toLowerCase()))
        : transcripts;
      return ok(res, { success: true, transcripts: out });
    } catch (e: any) { return ok(res, { success: false, error: e.message, transcripts: [] }); }
  }

  if (action === "delete_call_transcript") {
    const { id } = body;
    if (!id) return ok(res, { error: "id required" });
    try {
      await db().from("brain_learnings").delete().eq("id", id);
      return ok(res, { success: true });
    } catch (e: any) { return ok(res, { success: false, error: e.message }); }
  }


  if (action === "save_attachment_context") {
    const { prospectName="", fileName="", fileType="", description="", summary="", keyFindings=[], seoIssues=[], actionItems=[] } = body;
    const slug = String(prospectName).toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,40);
    const payload = JSON.stringify({ prospectName, fileName, fileType, description, summary, keyFindings, seoIssues, actionItems, savedAt: new Date().toISOString() });
    try {
      const { data: ins } = await db().from("brain_learnings").insert({
        project_id: null, card_type: "bde_attachment",
        card_title: ("FILE: "+fileName+(prospectName?" | "+prospectName:"")).slice(0,100),
        context_summary: payload, improvement: summary||description.slice(0,200),
        what_worked: keyFindings, what_missed: [],
        tags: ["bde_attachment", slug].filter(Boolean), source: "bde_attachment",
        applied_count: 0, updated_at: new Date().toISOString()
      }).select("id").single();
      return ok(res, { success: true, id: (ins as any)?.id||"" });
    } catch(e:any) { return ok(res, { success: false, error: e.message }); }
  }

  if (action === "get_lead_attachments") {
    const { prospectName } = body;
    try {
      const slug = String(prospectName||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,40);
      const q = slug
        ? db().from("brain_learnings").select("id,card_title,context_summary,created_at").eq("source","bde_attachment").contains("tags",[slug]).order("created_at",{ascending:false}).limit(100)
        : db().from("brain_learnings").select("id,card_title,context_summary,created_at").eq("source","bde_attachment").order("created_at",{ascending:false}).limit(100);
      const { data } = await q;
      const attachments = (data||[]).map((r:any) => {
        let d:any={};try{d=JSON.parse(r.context_summary||"{}");}catch{}
        return { id:r.id, fileName:d.fileName||r.card_title, fileType:d.fileType||"", description:d.description||"", summary:d.summary||"", keyFindings:d.keyFindings||[], seoIssues:d.seoIssues||[], actionItems:d.actionItems||[], prospectName:d.prospectName||"", created_at:r.created_at };
      });
      return ok(res, { success:true, attachments });
    } catch(e:any) { return ok(res, { success:false, error:e.message, attachments:[] }); }
  }

  if (action === "delete_attachment") {
    const { id } = body;
    if (!id) return ok(res, { error:"id required" });
    try { await db().from("brain_learnings").delete().eq("id",id); return ok(res,{success:true}); }
    catch(e:any) { return ok(res,{success:false,error:e.message}); }
  }


  if (action === "auto_save_activity") {
    // Fire-and-forget auto-save for all BDE activities with dates
    const { activityType = "", prospectName = "", payload = {} } = body;
    if (!activityType) return ok(res, { success: false });
    const slug = String(prospectName).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
    const now = new Date().toISOString();
    const titleMap: Record<string, string> = {
      chat_analysis: "Chat Analysis",
      deep_analysis: "Deep Analysis",
      audit_result: "Audit",
      generated_doc: "Document",
      call_analysis: "Call Analysis",
    };
    const title = (titleMap[activityType] || activityType) + (prospectName ? ": " + prospectName : "") + " — " + new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    try {
      await db().from("brain_learnings").insert({
        project_id: null,
        card_type: "bde_activity",
        card_title: title.slice(0, 100),
        context_summary: JSON.stringify({ activityType, prospectName, savedAt: now, ...payload }),
        improvement: (payload as any).summary || (payload as any).headline || title,
        what_worked: [],
        what_missed: [],
        tags: ["bde_activity", activityType, slug].filter(Boolean),
        source: activityType,
        applied_count: 0,
        updated_at: now,
      });
      return ok(res, { success: true });
    } catch { return ok(res, { success: false }); }
  }


  if (action === "analyse_delta") {
    const { newMessages = [], previousAnalysis = null, extraContext = "" } = body;
    if (!newMessages.length) return ok(res, { error: "newMessages required" });
    try {
      const prevCtx = previousAnalysis ? [
        previousAnalysis.main_need ? "Previous need: " + previousAnalysis.main_need : "",
        previousAnalysis.urgency ? "Urgency: " + previousAnalysis.urgency : "",
        previousAnalysis.hidden_concern ? "Hidden concern: " + previousAnalysis.hidden_concern : "",
        previousAnalysis.fiverr_specific?.conversion_blocker ? "Conversion blocker: " + previousAnalysis.fiverr_specific.conversion_blocker : "",
        previousAnalysis.fiverr_specific?.order_probability !== undefined ? "Order probability: " + previousAnalysis.fiverr_specific.order_probability + "%" : "",
      ].filter(Boolean).join(" | ") : "";
      const msgText = newMessages.map((m: any) =>
        (m.speaker === "me" ? "Me" : (m.speakerName || "Client")) + ": " + String(m.text || "")
      ).join("\n");
      const prompt = "Analyse these NEW Fiverr messages in context of the previous conversation.\n"
        + (prevCtx ? "PREVIOUS CONTEXT: " + prevCtx + "\n\n" : "")
        + (extraContext ? String(extraContext).slice(0, 600) + "\n\n" : "")
        + "NEW MESSAGES:\n" + msgText.slice(0, 3000);
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const _r = await _ac.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 1200,
        system: "You are a Fiverr BDE analyst. Analyse new messages using prior context. Return updated analysis JSON — same schema as full analysis. Raw JSON only.",
        messages: [{ role: "user", content: prompt }]
      });
      const raw = (_r.content[0] as any).text || "{}";
      let analysis = null;
      analysis = safeParseJSON(raw);
      return ok(res, { success: true, analysis, newMessageCount: newMessages.length });
    } catch (e: any) { return ok(res, { error: e.message }); }
  }


  if (action === "live_coach") {
    const { thread = [], newClientMessage = "", bdeNotes = "", leadContext = {}, attachmentCtx = "" } = body;
    if (!newClientMessage && !thread.length) return ok(res, { error: "message required" });
    try {
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      // Build conversation history
      const history = (thread as any[]).map((m: any) =>
        (m.role === "client" ? "CLIENT" : "BDE") + ": " + String(m.text || "").slice(0, 400)
      ).join("\n");

      // Lead context summary
      const lc: string[] = [];
      if (leadContext.name) lc.push("Lead: " + leadContext.name);
      if (leadContext.url)  lc.push("Website: " + leadContext.url);
      if (leadContext.main_need) lc.push("Need: " + leadContext.main_need);
      if (leadContext.urgency)   lc.push("Urgency: " + leadContext.urgency);
      if (leadContext.hidden_concern) lc.push("Hidden concern: " + leadContext.hidden_concern);
      if (leadContext.order_probability !== undefined) lc.push("Close probability: " + leadContext.order_probability + "%");
      if (bdeNotes) lc.push("BDE is thinking: " + String(bdeNotes).slice(0, 300));
      if (attachmentCtx) lc.push("Client shared: " + String(attachmentCtx).slice(0, 400));

      const sysPrompt = "You are an elite Fiverr BDE coach working live alongside a salesperson. Your job is to help them close deals. You know the full conversation history and the client context. When given the client's latest message, you provide the single best reply the BDE should send. Write in first person as the BDE. Be natural, warm, and persuasive — never robotic. Reference specifics from the conversation. Keep messages short enough to feel like real Fiverr messages (under 150 words unless the situation demands more). Never say things that would feel like a template.";

      const userPrompt = (lc.length ? "LEAD CONTEXT:\n" + lc.join("\n") + "\n\n" : "")
        + (history ? "CONVERSATION SO FAR:\n" + history + "\n\n" : "")
        + "CLIENT'S LATEST MESSAGE:\n" + newClientMessage
        + "\n\nProvide a JSON response:\n"
        + '{"suggestedReply":"the exact message to send","messageAnalysis":{"emotion":"curious/excited/hesitant/frustrated/ready_to_buy","intent":"what they really want","signal":"what this message reveals about close probability","risk":"any red flag to be aware of"},"followUp":{"needed":true/false,"when":"e.g. if no reply in 24 hours","what":"what to say"},"coachNote":"one sentence of tactical advice for the BDE"}';

      const _r = await _ac.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 1000, system: sysPrompt,
        messages: [{ role: "user", content: userPrompt }]
      });
      const raw = (_r.content[0] as any).text || "{}";
      let result: any = {};
      try { result = JSON.parse(raw.replace(/^```[a-z]*/i,"").replace(/```/g,"").trim()); } catch {
        const m = raw.match(/\{[\s\S]+\}/);
        try { result = m ? JSON.parse(m[0]) : {}; } catch {}
      }
      if (!result.suggestedReply) result.suggestedReply = raw.slice(0, 300);

      // Auto-save to brain_learnings fire-and-forget
      if (thread.length > 1 && leadContext.name) {
        const slug = String(leadContext.name).toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,40);
        db().from("brain_learnings").insert({
          project_id: null, card_type: "bde_activity",
          card_title: ("Live Coach: " + (leadContext.name || "Lead")).slice(0,100),
          context_summary: JSON.stringify({ leadContext, newClientMessage, suggestedReply: result.suggestedReply, bdeNotes, savedAt: new Date().toISOString() }),
          improvement: result.coachNote || "Live coaching session",
          what_worked: [], what_missed: [],
          tags: ["live_coach", slug], source: "live_coach",
          applied_count: 0, updated_at: new Date().toISOString()
        }).then(() => {}).catch(() => {});
      }

      return ok(res, { success: true, ...result });
    } catch (e: any) { return ok(res, { error: e.message }); }
  }

  if (action === "save_live_outcome") {
    // BDE reports what they actually sent + how client responded
    const { leadName = "", messageSent = "", clientResponse = "", outcome = "", bdeNotes = "" } = body;
    const slug = String(leadName).toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,40);
    try {
      await db().from("brain_learnings").insert({
        project_id: null, card_type: "bde_activity",
        card_title: ("Outcome: " + leadName + " — " + outcome).slice(0,100),
        context_summary: JSON.stringify({ leadName, messageSent, clientResponse, outcome, bdeNotes, savedAt: new Date().toISOString() }),
        improvement: outcome + (clientResponse ? ": " + String(clientResponse).slice(0,100) : ""),
        what_worked: outcome === "positive" ? [messageSent.slice(0,100)] : [],
        what_missed: outcome === "negative" ? [messageSent.slice(0,100)] : [],
        tags: ["live_coach", "outcome", slug], source: "live_coach_outcome",
        applied_count: 0, updated_at: new Date().toISOString()
      });
      return ok(res, { success: true });
    } catch (e: any) { return ok(res, { success: false, error: e.message }); }
  }


  if (action === "live_coach") {
    const { thread = [], newClientMessage = "", bdeNotes = "", leadContext = {}, attachmentCtx = "" } = body;
    if (!newClientMessage && !thread.length) return ok(res, { error: "message required" });
    try {
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      // Build conversation history
      const history = (thread as any[]).map((m: any) =>
        (m.role === "client" ? "CLIENT" : "BDE") + ": " + String(m.text || "").slice(0, 400)
      ).join("\n");

      // Lead context summary
      const lc: string[] = [];
      if (leadContext.name) lc.push("Lead: " + leadContext.name);
      if (leadContext.url)  lc.push("Website: " + leadContext.url);
      if (leadContext.main_need) lc.push("Need: " + leadContext.main_need);
      if (leadContext.urgency)   lc.push("Urgency: " + leadContext.urgency);
      if (leadContext.hidden_concern) lc.push("Hidden concern: " + leadContext.hidden_concern);
      if (leadContext.order_probability !== undefined) lc.push("Close probability: " + leadContext.order_probability + "%");
      if (bdeNotes) lc.push("BDE is thinking: " + String(bdeNotes).slice(0, 300));
      if (attachmentCtx) lc.push("Client shared: " + String(attachmentCtx).slice(0, 400));

      const sysPrompt = "You are an elite Fiverr BDE coach working live alongside a salesperson. Your job is to help them close deals. You know the full conversation history and the client context. When given the client's latest message, you provide the single best reply the BDE should send. Write in first person as the BDE. Be natural, warm, and persuasive — never robotic. Reference specifics from the conversation. Keep messages short enough to feel like real Fiverr messages (under 150 words unless the situation demands more). Never say things that would feel like a template.";

      const userPrompt = (lc.length ? "LEAD CONTEXT:\n" + lc.join("\n") + "\n\n" : "")
        + (history ? "CONVERSATION SO FAR:\n" + history + "\n\n" : "")
        + "CLIENT'S LATEST MESSAGE:\n" + newClientMessage
        + "\n\nProvide a JSON response:\n"
        + '{"suggestedReply":"the exact message to send","messageAnalysis":{"emotion":"curious/excited/hesitant/frustrated/ready_to_buy","intent":"what they really want","signal":"what this message reveals about close probability","risk":"any red flag to be aware of"},"followUp":{"needed":true/false,"when":"e.g. if no reply in 24 hours","what":"what to say"},"coachNote":"one sentence of tactical advice for the BDE"}';

      const _r = await _ac.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 1000, system: sysPrompt,
        messages: [{ role: "user", content: userPrompt }]
      });
      const raw = (_r.content[0] as any).text || "{}";
      let result: any = {};
      try { result = JSON.parse(raw.replace(/^```[a-z]*/i,"").replace(/```/g,"").trim()); } catch {
        const m = raw.match(/\{[\s\S]+\}/);
        try { result = m ? JSON.parse(m[0]) : {}; } catch {}
      }
      if (!result.suggestedReply) result.suggestedReply = raw.slice(0, 300);

      // Auto-save to brain_learnings fire-and-forget
      if (thread.length > 1 && leadContext.name) {
        const slug = String(leadContext.name).toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,40);
        db().from("brain_learnings").insert({
          project_id: null, card_type: "bde_activity",
          card_title: ("Live Coach: " + (leadContext.name || "Lead")).slice(0,100),
          context_summary: JSON.stringify({ leadContext, newClientMessage, suggestedReply: result.suggestedReply, bdeNotes, savedAt: new Date().toISOString() }),
          improvement: result.coachNote || "Live coaching session",
          what_worked: [], what_missed: [],
          tags: ["live_coach", slug], source: "live_coach",
          applied_count: 0, updated_at: new Date().toISOString()
        }).then(() => {}).catch(() => {});
      }

      return ok(res, { success: true, ...result });
    } catch (e: any) { return ok(res, { error: e.message }); }
  }

  if (action === "save_live_outcome") {
    // BDE reports what they actually sent + how client responded
    const { leadName = "", messageSent = "", clientResponse = "", outcome = "", bdeNotes = "" } = body;
    const slug = String(leadName).toLowerCase().replace(/[^a-z0-9]+/g,"_").slice(0,40);
    try {
      await db().from("brain_learnings").insert({
        project_id: null, card_type: "bde_activity",
        card_title: ("Outcome: " + leadName + " — " + outcome).slice(0,100),
        context_summary: JSON.stringify({ leadName, messageSent, clientResponse, outcome, bdeNotes, savedAt: new Date().toISOString() }),
        improvement: outcome + (clientResponse ? ": " + String(clientResponse).slice(0,100) : ""),
        what_worked: outcome === "positive" ? [messageSent.slice(0,100)] : [],
        what_missed: outcome === "negative" ? [messageSent.slice(0,100)] : [],
        tags: ["live_coach", "outcome", slug], source: "live_coach_outcome",
        applied_count: 0, updated_at: new Date().toISOString()
      });
      return ok(res, { success: true });
    } catch (e: any) { return ok(res, { success: false, error: e.message }); }
  }


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

  /* ── CHECK SYSTEM HEALTH (lightweight — AskEmpire status indicator) ── */
  if (action === "check_system_health") {
    const health: any = {
      env_vars_ok: !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) && !!process.env.ANTHROPIC_API_KEY,
      can_reach_anthropic: false,
      can_reach_supabase: false,
    };
    try {
      const { error } = await db().from("brain_learnings").select("id").limit(1);
      health.can_reach_supabase = !error;
    } catch (_e) { health.can_reach_supabase = false; }
    try {
      if (process.env.ANTHROPIC_API_KEY) {
        const _c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const _m = await _c.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        });
        health.can_reach_anthropic = !!_m;
      }
    } catch (_e) { health.can_reach_anthropic = false; }
    return ok(res, { success: true, health, ts: new Date().toISOString() });
  }

  /* ── GET REVENUE RECORDS (RevenueBI records list) ── */
  if (action === "get_revenue_records") {
    const { projectId, limit = 12 } = body;
    try {
      let q: any = db().from("revenue_records")
        .select("id,amount,record_type,currency,status,period_month,period_year,notes,invoice_number,projects(name)")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(Math.min(Number(limit) || 12, 100));
      if (projectId) q = q.eq("project_id", projectId);
      const { data, error } = await q;
      if (error) return ok(res, { success: false, records: [], error: error.message });
      return ok(res, { success: true, records: data || [] });
    } catch (e: any) {
      return ok(res, { success: false, records: [], error: e?.message || "unknown" });
    }
  }

  /* ── CLIENT SHOWCASE — composite cinematic data contract (Phase 22).
       Every animation parameter, color anchor, mood, and intensity on the
       /showcase/:projectId page flows from this single payload. */
  if (action === "bs_client_showcase_data") {
    const { projectId } = body;
    if (!projectId) return ok(res, { success: false, error: "projectId required" });
    try {
      const { assembleShowcase } = await import("./lib/client-showcase-engine.js");
      const r = await assembleShowcase({ projectId });
      return ok(res, r);
    } catch (e: any) {
      return ok(res, { success: false, error: e?.message || "showcase assembly failed" });
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

  if (action === "get_canvas_data") {
    const { projectId } = body;
    if (!projectId) return ok(res, { error: "projectId required" });
    try {
      const { data: projRows, error: projErr } = await db()
        .from("projects")
        .select("id,name,playground_strategy,playground_canvas")
        .eq("id", projectId)
        .limit(1);
      const proj = projRows?.[0] || null;
      if (!proj) {
        return ok(res, {
          error: "Project not found",
          _debug: {
            projectIdSent: projectId,
            projErr: projErr?.message || null,
            rowsReturned: projRows?.length ?? "null",
            keyUsed: process.env.SUPABASE_SERVICE_KEY ? "SUPABASE_SERVICE_KEY" :
                     process.env.SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY" :
                     process.env.SUPABASE_ANON_KEY ? "SUPABASE_ANON_KEY(RLS!)" : "NONE",
          }
        });
      }

      // Source 1: playground_strategy.canvas_blocks (Brain-created cards)
      const strategy = proj.playground_strategy || {};
      const blocks: any[] = Array.isArray(strategy.canvas_blocks) ? strategy.canvas_blocks : [];

      // Source 2: playground_canvas (position/status overrides)
      const canvas: any[] = Array.isArray(proj.playground_canvas) ? proj.playground_canvas : [];

      // Source 3: task_requirements table (cards created by task engine)
      const { data: reqRows, error: reqRowsErr } = await db()
        .from("task_requirements")
        .select("id,task_type,title,description,status,priority,week,effort,impact,tags,created_at,completed_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(200);

      // Convert task_requirements rows to card format
      const reqCards: any[] = (reqRows || []).map((r:any) => ({
        id: r.id,
        type: r.task_type || "task",
        title: r.title || r.task_type || "Task",
        content: r.description || "",
        status: r.status || "todo",
        priority: r.priority || "medium",
        week: r.week || null,
        effort: r.effort || null,
        impact: r.impact || null,
        tags: r.tags || [],
        source: "task_engine",
        created_at: r.created_at,
      }));

      // Merge canvas overrides onto blocks
      const mergedBlocks = blocks.map((b:any) => {
        const extra = canvas.find((c:any) => c.id === b.id) || {};
        return { ...b, ...extra };
      });

      // Deduplicate: prefer task_requirements rows, then canvas blocks
      const reqIds = new Set(reqCards.map((c:any) => c.id));
      const uniqueBlocks = mergedBlocks.filter((b:any) => !reqIds.has(b.id));
      const allCards = [...reqCards, ...uniqueBlocks];

      const { data: tasks } = await db()
        .from("task_executions")
        .select("id,task_type,status,output,created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50);

      return ok(res, {
        success: true,
        cards: allCards,
        tasks: tasks || [],
        projectName: proj.name,
        _debug: {
          totalCards: allCards.length,
          reqCards: reqCards.length,
          blockCards: mergedBlocks.length,
          canvasRows: canvas.length,
          reqError: reqRowsErr?.message || null,
          projStrategyIsNull: proj.playground_strategy === null,
          projCanvasIsNull: proj.playground_canvas === null,
          projStrategyType: typeof proj.playground_strategy,
          canvasBlocksLength: Array.isArray(strategy?.canvas_blocks) ? strategy.canvas_blocks.length : "not array",
          taskExecCount: tasks?.length || 0,
        },
      });
    } catch(e:any){ return ok(res,{success:false,error:e.message}); }
  }

  if (action === "update_canvas_card") {
    const { projectId, cardId, updates } = body;
    if (!projectId || !cardId) return ok(res, { error: "projectId and cardId required" });
    try {
      const { data: proj } = await db().from("projects")
        .select("playground_strategy,playground_canvas").eq("id", projectId).single();
      const strategy = proj?.playground_strategy || { canvas_blocks: [] };
      if (!Array.isArray(strategy.canvas_blocks)) strategy.canvas_blocks = [];
      strategy.canvas_blocks = strategy.canvas_blocks.map((b:any) =>
        b.id === cardId ? { ...b, ...updates } : b);
      const canvas: any[] = Array.isArray(proj?.playground_canvas) ? proj.playground_canvas : [];
      const newCanvas = canvas.map((c:any) => c.id === cardId ? { ...c, ...updates } : c);
      await db().from("projects").update({ playground_strategy: strategy, playground_canvas: newCanvas }).eq("id", projectId);
      return ok(res, { success: true });
    } catch(e:any){ return ok(res,{success:false,error:e.message}); }
  }

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
    /* ── PM cron jobs (Phase C) — runs alongside the verification runner.
       Best-effort; failures don't block verifications. */
    let pmCronSummary: any = null;
    try {
      const { pmCronTick } = await import("./lib/pm-lifecycle.js");
      pmCronSummary = await pmCronTick();
    } catch (e: any) {
      pmCronSummary = { success: false, error: e?.message || "pmCronTick failed" };
    }

    /* ── GSC daily pull (Phase D) — pull metrics for every connected project ── */
    let gscCronSummary: any = null;
    try {
      const { gscCronPullAll } = await import("./lib/pm-gsc.js");
      gscCronSummary = await gscCronPullAll();
    } catch (e: any) {
      gscCronSummary = { error: e?.message || "gscCronPullAll failed" };
    }

    /* ── GA4 daily pull (Phase E) — same pattern ── */
    let ga4CronSummary: any = null;
    try {
      const { ga4CronPullAll } = await import("./lib/pm-ga4.js");
      ga4CronSummary = await ga4CronPullAll();
    } catch (e: any) {
      ga4CronSummary = { error: e?.message || "ga4CronPullAll failed" };
    }

    /* ── Auto-pilot rule engine (Phase F) — runs AFTER data pulls so
       rules evaluate against fresh snapshots. Best-effort. */
    let rulesCronSummary: any = null;
    try {
      const { ruleEngineTick } = await import("./lib/pm-rules.js");
      rulesCronSummary = await ruleEngineTick();
    } catch (e: any) {
      rulesCronSummary = { error: e?.message || "ruleEngineTick failed" };
    }

    /* ── Brand Studio monitors (H.4) — fetch eligible URLs, classify
       changes via AI, propagate staleness to subscribed documents.
       Hard-capped at MAX_FETCHES_PER_RUN / MAX_CLASSIFICATIONS_PER_RUN
       (50 / 100 respectively) for predictable cost. Best-effort. */
    let monitorsCronSummary: any = null;
    try {
      const { monitorCronTick } = await import("./lib/brand-studio-monitors.js");
      monitorsCronSummary = await monitorCronTick();
    } catch (e: any) {
      monitorsCronSummary = { error: e?.message || "monitorCronTick failed" };
    }

    /* ── Phase 12.5b — forecast sweep — runs AFTER GSC/GA4 are fresh so
       checkpoints evaluate against same-day actuals. Best-effort. */
    let forecastSweepSummary: any = null;
    try {
      const { sweepForecastCheckpoints } = await import("./lib/season-monitor-engine.js");
      const sweep = await sweepForecastCheckpoints();
      forecastSweepSummary = {
        swept: sweep.swept,
        critical_count:  sweep.results.filter(r => r.severity === 'critical').length,
        warning_count:   sweep.results.filter(r => r.severity === 'warning').length,
      };
    } catch (e: any) {
      forecastSweepSummary = { error: e?.message || "forecast sweep failed" };
    }

    /* ── Living Overview cron — refresh executive summaries for active
       campaigns that have had new pillar reports since their last
       assessment. Hard-capped at 50 campaigns per tick. Best-effort. */
    let livingOverviewSummary: any = null;
    try {
      const { livingOverviewCronTick } = await import("./lib/seo-campaign-engine.js");
      livingOverviewSummary = await livingOverviewCronTick();
    } catch (e: any) {
      livingOverviewSummary = { error: e?.message || "living overview cron failed" };
    }

    const now = new Date().toISOString();

    /* Get all pending verifications due now */
    const { data: due } = await db()
      .from("verification_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .limit(10);

    if (!due || due.length === 0) {
      return ok(res, { success: true, processed: 0, message: "No verifications due", pmCron: pmCronSummary, gscCron: gscCronSummary, ga4Cron: ga4CronSummary, rulesCron: rulesCronSummary, monitorsCron: monitorsCronSummary, forecastSweep: forecastSweepSummary, livingOverview: livingOverviewSummary });
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
            model: "claude-sonnet-4-6",
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
      success:        true,
      processed:      results.length,
      results,
      pmCron:         pmCronSummary,
      gscCron:        gscCronSummary,
      ga4Cron:        ga4CronSummary,
      rulesCron:      rulesCronSummary,
      monitorsCron:   monitorsCronSummary,
      forecastSweep:  forecastSweepSummary,
      livingOverview: livingOverviewSummary,
      timestamp:      new Date().toISOString(),
    });
  }

  if (action === 'get_prospects') {
    const{status:pSt='new',limit:pL=20}=body;
    let q=db().from('prospects').select('*');
    if(pSt!=='all')q=q.eq('status',pSt);
    const{data}=await q.order('lead_score',{ascending:false}).limit(pL);
    return ok(res,{prospects:data||[]});
  }

  if (action === 'generate_proposal') {
    const{prospectId}=body;
    if(!prospectId)return ok(res,{error:'prospectId required'});
    try{
      const{generateProposalHTML}=await import('./lib/lead-engine');
      const html=await generateProposalHTML(prospectId);
      const{data:pr}=await db().from('prospects').select('url,company').eq('id',prospectId).single();
      const{data:proposal}=await db().from('proposals').insert({
        prospect_id:prospectId,title:`SEO Proposal — ${pr?.company||pr?.url||'Your Business'}`,
        html_content:html,status:'ready'}).select().single();
      await db().from('prospects').update({status:'proposal_sent'}).eq('id',prospectId);
      return ok(res,{success:true,proposal,shareUrl:`/proposal/${proposal?.token}`});
    }catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'accept_proposal') {
    const{token}=body;
    if(!token)return ok(res,{error:'token required'});
    const{data:proposal}=await db().from('proposals').select('*').eq('token',token).single();
    if(!proposal)return ok(res,{error:'Proposal not found'});
    await db().from('proposals').update({status:'accepted',accepted_at:new Date().toISOString()}).eq('id',proposal.id);
    if(proposal.prospect_id)await db().from('prospects').update({status:'won'}).eq('id',proposal.prospect_id);
    return ok(res,{success:true,message:'Welcome to the empire.'});
  }

  if (action === 'start_onboarding') {
    const{projectId}=body;
    if(!projectId)return ok(res,{error:'projectId required'});
    try{
      const{startOnboarding}=await import('./lib/onboarding-engine');
      const result=await startOnboarding(projectId);
      return ok(res,{success:true,...result});
    }catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'get_onboarding_status') {
    const{projectId}=body;
    if(!projectId)return ok(res,{error:'projectId required'});
    const{data}=await db().from('onboarding_sessions').select('*').eq('project_id',projectId)
      .order('created_at',{ascending:false}).limit(1).maybeSingle();
    return ok(res,{session:data});
  }

  if (action === 'calculate_client_health') {
    const{projectId}=body;
    if(!projectId)return ok(res,{error:'projectId required'});
    try{
      const{calculateClientHealth}=await import('./lib/health-engine');
      const result=await calculateClientHealth(projectId);
      return ok(res,{success:true,health:result});
    }catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'check_algorithm_updates') {
    try{
      const{checkAlgorithmUpdates}=await import('./lib/algorithm-monitor');
      return ok(res,{success:true,...await checkAlgorithmUpdates()});
    }catch(e:any){return ok(res,{error:e.message});}
  }
  if (action === 'get_algorithm_watchlist') {
    try{
      const{getAlgorithmWatchlist}=await import('./lib/algorithm-monitor');
      return ok(res,{events:await getAlgorithmWatchlist()});
    }catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'generate_content_calendar') {
    const{projectId,weeksAhead=4}=body;
    if(!projectId)return ok(res,{error:'projectId required'});
    try{
      const{generateContentCalendar}=await import('./lib/calendar-engine');
      return ok(res,{success:true,...await generateContentCalendar(projectId,weeksAhead)});
    }catch(e:any){return ok(res,{error:e.message});}
  }
  if (action === 'get_content_calendar') {
    const{projectId}=body;
    if(!projectId)return ok(res,{error:'projectId required'});
    try{
      const{getContentCalendar}=await import('./lib/calendar-engine');
      return ok(res,{calendar:await getContentCalendar(projectId)});
    }catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'record_ranking_change') {
    const{projectId,keyword,positionBefore,positionAfter,taskId}=body;
    if(!projectId||!keyword)return ok(res,{error:'projectId and keyword required'});
    const delta=(positionBefore||0)-(positionAfter||0);
    const{data}=await db().from('ranking_velocity').insert({
      project_id:projectId,keyword,position_before:positionBefore||0,
      position_after:positionAfter||0,task_id:taskId}).select().single();
    if(delta<-5)await db().from('alerts').insert({project_id:projectId,
      alert_type:'ranking_drop',severity:'warning',
      title:`Ranking drop: "${keyword}" fell ${Math.abs(delta)} positions`,
      body:`From ${positionBefore} to ${positionAfter}`,data:{keyword,delta}
    }).then(()=>{}).catch(()=>{});
    else if(delta>5)await db().from('alerts').insert({project_id:projectId,
      alert_type:'ranking_rise',severity:'info',
      title:`Ranking win: "${keyword}" rose ${delta} positions`,
      body:`From ${positionBefore} to ${positionAfter}`,data:{keyword,delta}
    }).then(()=>{}).catch(()=>{});
    return ok(res,{success:true,delta});
  }
  if (action === 'get_ranking_velocity') {
    const{projectId}=body;
    if(!projectId)return ok(res,{error:'projectId required'});
    const{data}=await db().from('ranking_velocity').select('*')
      .eq('project_id',projectId).order('measured_at',{ascending:false}).limit(50);
    const avg=data?.length?data.reduce((s:number,r:any)=>s+(r.delta||0),0)/data.length:0;
    return ok(res,{velocity:data||[],avgDelta:Math.round(avg*10)/10});
  }

  if (action === 'run_daily_automation') {
    const results:Record<string,any>={};
    const{data:projects}=await db().from('projects').select('id,name').limit(50);
    if(!projects?.length)return ok(res,{success:true,message:'No projects'});
    try{const{generateMorningBrief}=await import('./lib/brief-engine');results.brief=await generateMorningBrief('empire');}
    catch(e:any){results.brief={error:(e as any).message};}
    try{const{calculateClientHealth}=await import('./lib/health-engine');let h=0;
      for(const p of projects.slice(0,10)){try{await calculateClientHealth(p.id);h++;}catch{}}
      results.health={updated:h};}
    catch(e:any){results.health={error:(e as any).message};}
    if(new Date().getDay()===1){
      try{const{generateReport}=await import('./lib/report-engine');let r=0;
        for(const p of projects.slice(0,5)){try{await generateReport(p.id,'weekly');r++;}catch{}}
        results.reports={generated:r};}
      catch(e:any){results.reports={error:(e as any).message};}
    }
    return ok(res,{success:true,automated:true,timestamp:new Date().toISOString(),results});
  }

  if (action === 'analyze_competitor') {
    const{projectId,competitorUrl}=body;
    if(!projectId||!competitorUrl)return ok(res,{error:'projectId and competitorUrl required'});
    try{
      const domain=competitorUrl.replace(/^https?:\/\//,"").split("/")[0];
      let html="";
      try{const r=await fetch(`https://${domain}`,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(8000)});html=(await r.text()).slice(0,5000);}catch{}
      const ai=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY||"","anthropic-version":"2023-06-01"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:800,
          messages:[{role:"user",content:`Analyse competitor ${domain} based on this HTML snapshot. Return JSON only: {"competitor_name":"...","top_topics":["..."],"content_gaps":["what they do well that client might lack"],"threat_level":"low|medium|high|critical","opportunity":"specific weakness to exploit"}

HTML: ${html.slice(0,2000)}`}]})});
      const aj=await ai.json() as any;
      let analysis:any={competitor_name:domain,threat_level:"medium"};
      try{analysis=JSON.parse((aj?.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim());}catch{}
      await db().from("competitor_snapshots").insert({
        project_id:projectId,competitor_url:competitorUrl,
        competitor_name:analysis.competitor_name||domain,
        top_keywords:analysis.top_topics||[],
        content_gaps:analysis.content_gaps||[],
        threat_level:analysis.threat_level||"medium",
        authority_signals:{opportunity:analysis.opportunity}
      }).then(()=>{}).catch(()=>{});
      return ok(res,{success:true,analysis});
    }catch(e:any){return ok(res,{error:e.message});}
  }
  if (action === 'get_competitor_snapshots') {
    const{projectId}=body;
    if(!projectId)return ok(res,{error:'projectId required'});
    const{data}=await db().from('competitor_snapshots').select('*')
      .eq('project_id',projectId).order('checked_at',{ascending:false}).limit(20);
    return ok(res,{competitors:data||[]});
  }

  // ── CLIENT COMMUNICATIONS POWERHOUSE ────────────────────
  if (action === 'analyse_conversation') {
    const{text,projectId,channel='email'}=body;
    if(!text)return ok(res,{error:'text required'});
    try{
      const{analyseConversation}=await import('./lib/comms-engine');
      const result=await analyseConversation(text,projectId,channel);
      return ok(res,{success:true,...result});
    }catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === "generate_responses") {
    const { text = "", conversationText = "", analysis = {} } = body;
    const convText = conversationText || text;
    if (!convText && !analysis?.main_need) return ok(res, { error: "text and analysis required" });
    try {
      const _ac = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const a: any = analysis;
      const ctx = [
        a.main_need ? "Client need: " + a.main_need : "",
        a.urgency ? "Urgency: " + a.urgency : "",
        a.hidden_concern ? "Hidden concern: " + a.hidden_concern : "",
        a.fiverr_specific?.conversion_blocker ? "Conversion blocker: " + a.fiverr_specific.conversion_blocker : "",
        a.fiverr_specific?.order_probability ? "Order probability: " + a.fiverr_specific.order_probability + "%" : "",
      ].filter(Boolean).join(" | ");
      const _r = await _ac.messages.create({ model: "claude-sonnet-4-6", max_tokens: 2200,
        system: "You are an elite Fiverr BDE. Write conversion-focused response strategies. Return raw JSON only.",
        messages: [{ role: "user", content:
          "Conversation:\n" + String(convText).slice(0, 1500) +
          "\n\nIntelligence: " + ctx +
          "\n\nWrite 3 response strategies. Return JSON only:\n" +
          '{ "responses": [ { "title": "Strategy name", "tone": "empathetic|confident|direct|consultative", "when_to_use": "one sentence", "response": "full Fiverr message — ready to send, no placeholders", "conversion_probability": 0-100 } ], "follow_up_sequence": ["follow up after 2 days", "follow up after 5 days"] }'
        }]
      });
      const raw = (_r.content[0] as any).text || "{}";
      let result: any = { responses: [], follow_up_sequence: [] };
      try { result = JSON.parse(raw.replace(/^```[a-z]*/i,"").replace(/```/g,"").trim()); } catch {}
      return ok(res, { success: true, ...result });
    } catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'handle_objection') {
    const{objectionType,objectionText,language='en',projectId}=body;
    if(!objectionType||!objectionText)return ok(res,{error:'objectionType and objectionText required'});
    try{
      const{handleObjection}=await import('./lib/comms-engine');
      let ctx=null;
      if(projectId){const{data}=await db().from('projects').select('name,url,goals').eq('id',projectId).single();ctx=data;}
      const result=await handleObjection(objectionType,objectionText,language,ctx);
      return ok(res,{success:true,...result});
    }catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'generate_client_update') {
    const{projectId,updateType='email',language='en'}=body;
    if(!projectId)return ok(res,{error:'projectId required'});
    try{
      const{generateClientUpdate}=await import('./lib/comms-engine');
      const result=await generateClientUpdate(projectId,updateType,language);
      return ok(res,{success:true,...result});
    }catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'generate_presentation') {
    const{type='progress_update',projectId,prospectId,language='en'}=body;
    try{
      const{generatePresentation}=await import('./lib/comms-engine');
      const result=await generatePresentation(type,projectId,prospectId,language);
      return ok(res,{success:true,...result});
    }catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'get_presentations') {
    const{projectId,prospectId}=body;
    let q=db().from('client_presentations').select('id,title,presentation_type,status,token,viewed_count,created_at');
    if(projectId)q=q.eq('project_id',projectId);
    if(prospectId)q=q.eq('prospect_id',prospectId);
    const{data}=await q.order('created_at',{ascending:false}).limit(20);
    return ok(res,{presentations:data||[]});
  }

  if (action === 'get_conversation_history') {
    const{projectId,limit:cL=20}=body;
    let q=db().from('client_conversations').select('*').order('created_at',{ascending:false}).limit(cL);
    if(projectId)q=q.eq('project_id',projectId);
    const{data}=await q;
    return ok(res,{conversations:data||[]});
  }

  if (action === 'get_timezones') {
    const{getClientTimezones}=await import('./lib/comms-engine');
    return ok(res,{timezones:getClientTimezones()});
  }

  if (action === 'get_objection_library') {
    const{language='en',type}=body;
    let q=db().from('objection_library').select('*');
    if(language)q=q.eq('language',language);
    if(type)q=q.eq('objection_type',type);
    const{data}=await q.order('success_rate',{ascending:false}).limit(30);
    return ok(res,{objections:data||[]});
  }

  if (action === 'get_communication_templates') {
    const{category,language='en'}=body;
    let q=db().from('communication_templates').select('*').eq('language',language);
    if(category)q=q.eq('category',category);
    const{data}=await q.order('effectiveness_score',{ascending:false}).limit(20);
    return ok(res,{templates:data||[]});
  }

  if (action === 'get_proposal_by_token') {
    const{token}=body;
    if(!token)return ok(res,{error:'token required'});
    const{data}=await db().from('proposals').select('*').eq('token',token).single();
    if(data)await db().from('proposals').update({viewed_at:new Date().toISOString(),status:'viewed'}).eq('id',data.id).is('viewed_at',null);
    const{data:pres}=await db().from('client_presentations').select('*').eq('token',token).single();
    if(pres){await db().from('client_presentations').update({viewed_count:pres.viewed_count+1}).eq('id',pres.id);}
    return ok(res,{proposal:data||null,presentation:pres||null});
  }

  // ── ROLE-BASED STAFF & BDE SYSTEM ───────────────────────


  if (action === 'generate_staff_link') {
    const { email, staffId, name } = body;
    if (!email) return ok(res, { success: false, error: 'Email is required' });
    try {
      const admin = adminDb();
      if (!admin) return ok(res, { success: false, error: 'Service role key not found. Add SUPABASE_SERVICE_ROLE_KEY to Vercel environment variables (find it in Supabase → Settings → API → service_role)' });
      // Try magiclink first (works for existing + new users)
      // Fall back to invite if user doesn't exist yet
      let linkData: any = null;
      let linkError: any = null;
      const magicRes = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: 'https://seoseason.com' }
      });
      if (magicRes.error) {
        // User may not exist yet — try invite type
        const inviteRes = await admin.auth.admin.generateLink({
          type: 'invite',
          email,
          options: { redirectTo: 'https://seoseason.com', data: { name, staffId } }
        });
        linkData  = inviteRes.data;
        linkError = inviteRes.error;
      } else {
        linkData = magicRes.data;
      }
      if (linkError) return ok(res, { success: false, error: linkError.message });
      const link = linkData?.properties?.action_link || linkData?.action_link || '';
      if (!link) return ok(res, { success: false, error: 'Link not returned by Supabase' });
      return ok(res, { success: true, link });
    } catch(e: any) { return ok(res, { success: false, error: e.message }); }
  }

  if (action === 'invite_staff') {
    const { staffId, email, name, redirectTo = 'https://seoseason.com' } = body;
    if (!email) return ok(res, { success: false, error: 'Email is required to send an invite' });
    try {
      const admin = adminDb();
      if (!admin) return ok(res, { success: false, error: 'Service role key not found. Add SUPABASE_SERVICE_ROLE_KEY to Vercel environment variables (find it in Supabase → Settings → API → service_role)' });
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo, data: { name, staffId }
      });
      if (error) return ok(res, { success: false, error: error.message });
      return ok(res, { success: true, message: `Invite sent to ${email}` });
    } catch(e: any) { return ok(res, { success: false, error: e.message }); }
  }

  if (action === 'get_staff') {
    try {
      const { data, error } = await db()
        .from('staff_members')
        .select('id,name,email,role,timezone,permissions,avatar_initials');
      if (error) return ok(res, { error: error.message, staff: [] });
      return ok(res, { staff: data || [] });
    } catch(e:any) { return ok(res, { error: e.message, staff: [] }); }
  }

  if (action === 'create_staff') {
    const{name,email,role='bde',timezone='Europe/London',permissions={},managedBy}=body;
    if(!name||!role) return ok(res,{error:'name and role required'});
    try {
      const initials = name.split(' ').map((n:string)=>n[0]||'').join('').toUpperCase().slice(0,2);
      const { data, error } = await db().from('staff_members').insert({
        name, email: email||null, role, timezone,
        permissions, avatar_initials: initials,
        managed_by: managedBy||null,
      }).select('id,name,email,role,timezone,permissions,avatar_initials').single();
      if (error) return ok(res, { success:false, error: error.message });
      return ok(res, { success:true, staff:data });
    } catch(e:any) { return ok(res, { success:false, error: e.message }); }
  }

  /* ── Backfill artifacts from completed pipeline runs ─────────────────────
     Reads all completed season_pipeline_runs for a project (or all projects),
     and re-persists their final_artifacts to the artifacts table.
     The insert is idempotent — rows already present are skipped.
     Use this once after the upsert→insert fix to populate historical runs. */
  if (action === 'backfill_artifacts') {
    const { projectId: bfProjectId } = body;
    try {
      const { persistPipelineRunArtifacts } = await import('./lib/artifacts.js');

      let q = db().from('season_pipeline_runs')
        .select('id, project_id, campaign_id, panel_id, scope, pipeline_type, final_artifacts, llm_calls_used, estimated_cost_usd, finished_at')
        .eq('status', 'completed')
        .not('final_artifacts', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(200);
      if (bfProjectId) q = q.eq('project_id', bfProjectId);

      const { data: runs, error } = await q;
      if (error) return ok(res, { success: false, error: error.message });

      /* For each run, resolve campaign_id via multiple strategies:
         1. Already on the run row (best)
         2. In scope.campaignId (set by chat flow)
         3. Look up seo_campaigns by project_id + normalised keyword
            — use the FIRST word(s) of scope.keyword to avoid matching
              full input strings like "mobile forms on https://..." */
      const campaignCache: Record<string, string | null> = {};
      const resolveCampaignId = async (projectId: string, rawKeyword: string | null, scopeCampaignId?: string | null): Promise<string | null> => {
        if (scopeCampaignId) return scopeCampaignId;
        if (!rawKeyword) return null;
        const key = `${projectId}::${rawKeyword}`;
        if (key in campaignCache) return campaignCache[key];

        /* Try exact match first */
        const norm = rawKeyword.trim().toLowerCase().slice(0, 240);
        let { data: camp } = await db().from('seo_campaigns')
          .select('id').eq('project_id', projectId).eq('keyword', norm).eq('status', 'active').maybeSingle();

        /* If no exact match, try matching by taking just the first 4 words
           (handles "mobile forms on https://..." → "mobile forms") */
        if (!camp) {
          const shortKw = norm.split(/\s+/).slice(0, 4).join(' ');
          if (shortKw !== norm) {
            const res2 = await db().from('seo_campaigns')
              .select('id').eq('project_id', projectId).ilike('keyword', shortKw + '%').eq('status', 'active').maybeSingle();
            camp = (res2 as any).data;
          }
        }

        /* Also try any campaign for this project if still no match */
        if (!camp) {
          const res3 = await db().from('seo_campaigns')
            .select('id').eq('project_id', projectId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
          camp = (res3 as any).data;
        }

        campaignCache[key] = (camp as any)?.id || null;
        return campaignCache[key];
      };

      let totalInserted = 0, totalSkipped = 0, totalUpdated = 0, processed = 0;
      for (const run of (runs || []) as any[]) {
        const arts = Array.isArray(run.final_artifacts) ? run.final_artifacts : [];
        if (!arts.length || !run.project_id) continue;

        /* Resolve campaign_id */
        let campaignId: string | null = run.campaign_id
          || run.scope?.campaignId
          || run.scope?.campaign_id
          || null;
        if (!campaignId) {
          campaignId = await resolveCampaignId(run.project_id, run.scope?.keyword || null, null);
          if (campaignId) {
            await db().from('season_pipeline_runs').update({ campaign_id: campaignId }).eq('id', run.id);
          }
        }

        /* Insert artifacts (idempotent) */
        const keyword = run.scope?.keyword
          ? (run.scope.keyword as string).split(/\s+on\s+https?:\/\//i)[0].trim()
          : null;
        const r = await persistPipelineRunArtifacts({
          runId: run.id, projectId: run.project_id, campaignId,
          panelId: run.panel_id || null, keyword,
          targetUrl: run.scope?.target_url || null,
          pipelineType: run.pipeline_type || 'rank_for_keyword',
          artifacts: arts, totalLlmCalls: run.llm_calls_used || 0,
          totalCostUsd: run.estimated_cost_usd || 0, finishedAt: run.finished_at || null,
        });
        totalInserted += r.inserted;
        totalSkipped  += r.skipped;

        /* UPDATE existing artifact rows that have null campaign_id for this run */
        if (campaignId) {
          await db().from('artifacts')
            .update({ campaign_id: campaignId })
            .eq('source_kind', 'pipeline_run').eq('source_id', run.id).is('campaign_id', null);
          totalUpdated++;
        }
        processed++;
      }
      return ok(res, { success: true, runs_processed: processed, artifacts_inserted: totalInserted, artifacts_skipped: totalSkipped, campaign_id_stamped: totalUpdated });
    } catch(e:any) { return ok(res, { success:false, error: e.message }); }
  }

  if (action === 'delete_staff') {
    const { staffId } = body;
    if (!staffId) return ok(res, { error: 'staffId required' });
    try {
      const { error } = await db().from('staff_members').delete().eq('id', staffId);
      if (error) return ok(res, { success:false, error: error.message });
      return ok(res, { success:true });
    } catch(e:any) { return ok(res, { success:false, error: e.message }); }
  }

  if (action === 'update_staff_permissions') {
    const{staffId,permissions}=body;
    if(!staffId) return ok(res,{error:'staffId required'});
    try {
      const { error } = await db().from('staff_members').update({permissions}).eq('id',staffId);
      if (error) return ok(res, { success:false, error: error.message });
      return ok(res, { success:true });
    } catch(e:any) { return ok(res, { success:false, error: e.message }); }
  }

  if (action === 'analyse_fiverr_conversation') {
    const{text,staffId,assignmentId}=body;
    if(!text)return ok(res,{error:'text required'});
    try{
      const{analyseFiverrConversation}=await import('./lib/roles-engine');
      const result=await analyseFiverrConversation(text,staffId);
      if(assignmentId&&result.id){
        await db().from('lead_assignments').update({last_contact:new Date().toISOString()}).eq('id',assignmentId);
      }
      return ok(res,{success:true,...result});
    }catch(e:any){return ok(res,{error:e.message});}
  }

  // instant_audit_showcase handled above

  if (action === 'get_pipeline') {
    const{staffId,role}=body;
    try{
      const{getPipelineOverview}=await import('./lib/roles-engine');
      return ok(res,{success:true,...await getPipelineOverview(staffId,role)});
    }catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'upsert_lead_assignment') {
    const{prospectId,projectId,assignedTo,stage,priority,source='fiverr',notes,dealValue,conversionProbability}=body;
    const payload:any={stage:stage||'new',priority:priority||'medium',source,notes,updated_at:new Date().toISOString()};
    if(prospectId)payload.prospect_id=prospectId;
    if(projectId)payload.project_id=projectId;
    if(assignedTo)payload.assigned_to=assignedTo;
    if(dealValue)payload.deal_value=dealValue;
    if(conversionProbability)payload.conversion_probability=conversionProbability;
    const{data}=await db().from('lead_assignments').upsert(payload,{onConflict:'prospect_id'}).select().single();
    return ok(res,{success:true,assignment:data});
  }

  if (action === 'get_quick_responses') {
    const{category,channel='all',language='en',role}=body;
    let q=db().from('quick_responses').select('*');
    if(category)q=q.eq('category',category);
    if(language&&language!=='all')q=q.eq('language',language);
    if(role)q=q.contains('role_access',[role]);
    const{data}=await q.order('usage_count',{ascending:false}).limit(50);
    return ok(res,{responses:data||[]});
  }

  if (action === 'save_quick_response') {
    const{category,subcategory,title,body:rBody,channel='all',language='en',roleAccess,createdBy}=body;
    if(!category||!title||!rBody)return ok(res,{error:'category, title and body required'});
    const{data}=await db().from('quick_responses').insert({
      category,subcategory,title,body:rBody,channel,language,
      role_access:roleAccess||['hod','sales_manager','bdm','bde'],
      created_by:createdBy||null,
    }).select().single();
    return ok(res,{success:true,response:data});
  }

  if (action === 'increment_response_usage') {
    const{responseId}=body;
    if(!responseId)return ok(res,{error:'responseId required'});
    await db().from('quick_responses').update({usage_count:db().rpc('increment',{row_id:responseId})}).eq('id',responseId).then(()=>{}).catch(()=>{});
    return ok(res,{success:true});
  }

  if (action === 'get_showcase_items') {
    const{industry,itemType,featured}=body;
    let q=db().from('showcase_items').select('*');
    if(industry)q=q.eq('industry',industry);
    if(itemType)q=q.eq('item_type',itemType);
    if(featured)q=q.eq('is_featured',true);
    const{data}=await q.order('view_count',{ascending:false}).limit(20);
    return ok(res,{items:data||[]});
  }

  if (action === 'get_team_performance') {
    const{period='week'}=body;
    const since=period==='week'?new Date(Date.now()-7*864e5):period==='month'?new Date(Date.now()-30*864e5):new Date(Date.now()-864e5);
    const{data:staff}=await db().from('staff_members').select('id,name,role').eq('is_active',true);
    if(!staff?.length)return ok(res,{performance:[]});
    const perf=await Promise.all(staff.map(async(s:any)=>{
      const[aR,actR]=await Promise.allSettled([
        db().from('lead_assignments').select('stage,deal_value,updated_at').eq('assigned_to',s.id),
        db().from('staff_activity').select('activity_type').eq('staff_id',s.id).gte('created_at',since.toISOString()),
      ]);
      const assigns=aR.status==='fulfilled'?aR.value.data||[]:[];
      const acts=actR.status==='fulfilled'?actR.value.data||[]:[];
      const won=assigns.filter((a:any)=>a.stage==='won').length;
      return{
        staff_id:s.id,name:s.name,role:s.role,
        leads_handled:assigns.length,leads_won:won,
        conversion_rate:assigns.length?Math.round(won/assigns.length*100):0,
        pipeline_value:assigns.reduce((sum:number,a:any)=>sum+(a.deal_value||0),0),
        activity_count:acts.length,
        activities_by_type:acts.reduce((acc:any,a:any)=>{acc[a.activity_type]=(acc[a.activity_type]||0)+1;return acc;},{}),
      };
    }));
    return ok(res,{performance:perf});
  }

  if (action === 'log_staff_activity') {
    const{staffId,activityType,description,metadata}=body;
    if(!staffId||!activityType)return ok(res,{error:'staffId and activityType required'});
    await db().from('staff_activity').insert({staff_id:staffId,activity_type:activityType,description,metadata:metadata||{}});
    return ok(res,{success:true});
  }

  if (action === 'send_internal_message') {
    const{dept='general',senderId,senderName,senderRole,body:msgBody,msgType='text'}=body;
    if(!msgBody||!senderName)return ok(res,{error:'body and senderName required'});
    const{data}=await db().from('internal_messages').insert({
      dept,sender_id:senderId||null,sender_name:senderName,
      sender_role:senderRole||'bde',body:msgBody,msg_type:msgType,
    }).select().single();
    return ok(res,{success:true,message:data});
  }
  if (action === 'get_internal_messages') {
    const{dept='general',limit:mL=50}=body;
    const{data}=await db().from('internal_messages').select('*')
      .eq('dept',dept).order('created_at',{ascending:false}).limit(mL);
    return ok(res,{messages:(data||[]).reverse()});
  }

  // ── AI ASK ANYTHING ──────────────────────────────────────
  if (action === 'ask_empire') {
    const{question,sessionId='default',projectId}=body;
    if(!question)return ok(res,{error:'question required'});
    try{
      // Gather empire context
      const[pR,lR,hR,aR,sR,brR]=await Promise.allSettled([
        db().from('projects').select('id,name,url,goals,industry,market').limit(20),
        db().from('brain_learnings').select('card_title,what_worked,confidence_score,card_type')
          .order('confidence_score',{ascending:false}).limit(15),
        db().from('client_health').select('*,projects(name)').order('overall_score',{ascending:true}).limit(10),
        db().from('alerts').select('title,severity,alert_type').is('read_at',null).limit(5),
        db().from('staff_members').select('name,role,stats_cache').eq('is_active',true).limit(10),
        db().from('brain_learnings').select('card_title').gte('created_at',
          new Date(Date.now()-7*864e5).toISOString()).limit(5),
      ]);
      const projects=pR.status==='fulfilled'?pR.value.data||[]:[];
      const learnings=lR.status==='fulfilled'?lR.value.data||[]:[];
      const health=hR.status==='fulfilled'?hR.value.data||[]:[];
      const alerts_data=aR.status==='fulfilled'?aR.value.data||[]:[];
      const staff=sR.status==='fulfilled'?sR.value.data||[]:[];

      // Get conversation history
      const{data:history}=await db().from('ai_conversations')
        .select('role,content').eq('session_id',sessionId)
        .order('created_at',{ascending:true}).limit(10);

      const systemPrompt=`You are the SEO Season Empire AI — an intelligent assistant with full access to this SEO agency's data.
You know everything about the business: clients, projects, SEO performance, staff, learnings, health scores.
Answer questions about any aspect of the empire. Be specific, cite real data, be actionable.

EMPIRE DATA SNAPSHOT:
Projects (${projects.length}): ${projects.map((p:any)=>p.name).join(', ')}
Active alerts: ${alerts_data.map((a:any)=>a.title).join('; ')||'none'}
Health concerns: ${health.filter((h:any)=>h.churn_risk==='high').map((h:any)=>(h as any).projects?.name).filter(Boolean).join(', ')||'all healthy'}
Top learnings: ${learnings.slice(0,5).map((l:any)=>l.card_title).join('; ')}
Staff: ${staff.map((s:any)=>`${s.name}(${s.role})`).join(', ')}
${projectId?`Current project focus: ${projects.find((p:any)=>p.id===projectId)?.name||''}`:''}`

      const messages=[
        ...(history||[]).map((h:any)=>({role:h.role,content:h.content})),
        {role:'user' as const,content:question}
      ];

      const ai=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY||'','anthropic-version':'2023-06-01'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,system:systemPrompt,messages})
      });
      const aj=await ai.json() as any;
      const answer=aj?.content?.[0]?.text||'Could not generate answer.';

      // Save to history
      await db().from('ai_conversations').insert([
        {session_id:sessionId,role:'user',content:question,context_snapshot:{projectId}},
        {session_id:sessionId,role:'assistant',content:answer,tokens_used:aj?.usage?.output_tokens||0}
      ]);

      return ok(res,{answer,sessionId,tokens:aj?.usage?.output_tokens||0});
    }catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'get_conversation_history_ai') {
    const{sessionId='default',limit:cL=20}=body;
    const{data}=await db().from('ai_conversations').select('*')
      .eq('session_id',sessionId).order('created_at',{ascending:true}).limit(cL);
    return ok(res,{history:data||[]});
  }

  // ── REVENUE & BI ─────────────────────────────────────────
  if (action === 'get_revenue_overview') {
    const now=new Date();
    const thisMonth=now.getMonth()+1;
    const thisYear=now.getFullYear();
    const[mR,allR,pR]=await Promise.allSettled([
      db().from('revenue_records').select('amount,record_type,status')
        .eq('period_month',thisMonth).eq('period_year',thisYear),
      db().from('revenue_records').select('amount,period_month,period_year,record_type,status,projects(name)'),
      db().from('prospects').select('deal_value:lead_score,status').not('deal_value','is',null),
    ]);
    const monthly=mR.status==='fulfilled'?mR.value.data||[]:[];
    const all=allR.status==='fulfilled'?allR.value.data||[]:[];
    const prospects=pR.status==='fulfilled'?pR.value.data||[]:[];

    const mrr=monthly.filter((r:any)=>r.status==='paid'&&r.record_type==='monthly_retainer')
      .reduce((s:number,r:any)=>s+(r.amount||0),0);
    const arr=mrr*12;
    const totalPaid=all.filter((r:any)=>r.status==='paid').reduce((s:number,r:any)=>s+(r.amount||0),0);
    const pending=all.filter((r:any)=>r.status==='pending').reduce((s:number,r:any)=>s+(r.amount||0),0);
    const overdue=all.filter((r:any)=>r.status==='overdue').reduce((s:number,r:any)=>s+(r.amount||0),0);

    // Monthly trend
    const byMonth:Record<string,number>={};
    all.filter((r:any)=>r.status==='paid').forEach((r:any)=>{
      const key=`${r.period_year}-${String(r.period_month).padStart(2,'0')}`;
      byMonth[key]=(byMonth[key]||0)+(r.amount||0);
    });

    return ok(res,{mrr,arr,totalPaid,pending,overdue,
      monthlyTrend:Object.entries(byMonth).sort(([a],[b])=>a.localeCompare(b)).slice(-12),
      pipelineValue:0,recordCount:all.length});
  }

  if (action === 'add_revenue_record') {
    const{projectId,amount,recordType='monthly_retainer',currency='GBP',notes,invoiceNumber}=body;
    if(!projectId||!amount)return ok(res,{error:'projectId and amount required'});
    const now=new Date();
    const{data}=await db().from('revenue_records').insert({
      project_id:projectId,amount,record_type:recordType,currency,notes,
      invoice_number:invoiceNumber,period_month:now.getMonth()+1,period_year:now.getFullYear(),
      status:'paid'
    }).select().single();
    return ok(res,{success:true,record:data});
  }

  // ── KANBAN ────────────────────────────────────────────────
  if (action === 'get_kanban') {
    const{projectId,assignedTo}=body;
    if(!projectId)return ok(res,{error:'projectId required'});
    let q=db().from('kanban_tasks').select('*,staff_members(name,role,avatar_initials)')
      .eq('project_id',projectId).order('position').order('created_at');
    if(assignedTo)q=q.eq('assigned_to',assignedTo);
    const{data}=await q.limit(100);
    const cols:Record<string,any[]>={todo:[],in_progress:[],review:[],done:[],verified:[]};
    (data||[]).forEach((t:any)=>{ if(cols[t.status])cols[t.status].push(t); });
    return ok(res,{tasks:data||[],columns:cols});
  }

  if (action === 'upsert_kanban_task') {
    const{id,projectId,title,description,status,priority,category,assignedTo,dueDate,estimatedHours,tags}=body;
    if(!projectId||!title)return ok(res,{error:'projectId and title required'});
    const payload:any={project_id:projectId,title,description:description||'',
      status:status||'todo',priority:priority||'medium',category:category||'seo',
      assigned_to:assignedTo||null,due_date:dueDate||null,
      estimated_hours:estimatedHours||null,tags:tags||[],
      updated_at:new Date().toISOString()};
    let result;
    if(id){
      const{data}=await db().from('kanban_tasks').update(payload).eq('id',id).select().single();
      result=data;
    }else{
      const{data:count}=await db().from('kanban_tasks').select('id',{count:'exact',head:true})
        .eq('project_id',projectId).eq('status',status||'todo');
      payload.position=(count||0);
      const{data}=await db().from('kanban_tasks').insert(payload).select().single();
      result=data;
    }
    return ok(res,{success:true,task:result});
  }

  if (action === 'move_kanban_task') {
    const{taskId,newStatus,newPosition}=body;
    if(!taskId||!newStatus)return ok(res,{error:'taskId and newStatus required'});
    await db().from('kanban_tasks').update({status:newStatus,position:newPosition||0,
      updated_at:new Date().toISOString()}).eq('id',taskId);
    // Auto-create verification when moved to done
    if(newStatus==='done'){
      const{data:task}=await db().from('kanban_tasks').select('*').eq('id',taskId).single();
      if(task){
        await db().from('verification_queue').insert({
          project_id:task.project_id,card_title:task.title,
          card_type:task.category,status:'pending',
          scheduled_for:new Date(Date.now()+3*864e5).toISOString()
        }).then(()=>{}).catch(()=>{});
      }
    }
    return ok(res,{success:true});
  }

  if (action === 'delete_kanban_task') {
    const{taskId}=body;
    if(!taskId)return ok(res,{error:'taskId required'});
    await db().from('kanban_tasks').delete().eq('id',taskId);
    return ok(res,{success:true});
  }

  // ── GLOBAL SEARCH ────────────────────────────────────────
  if (action === 'global_search') {
    const{query,limit:sL=5}=body;
    if(!query||query.length<2)return ok(res,{results:[]});
    const q=query.toLowerCase();
    const[pR,lR,prR,sR]=await Promise.allSettled([
      db().from('projects').select('id,name,url,industry').ilike('name',`%${query}%`).limit(sL),
      db().from('brain_learnings').select('id,card_title,card_type,project_id').ilike('card_title',`%${query}%`).limit(sL),
      db().from('prospects').select('id,name,company,url,lead_score').or(`name.ilike.%${query}%,company.ilike.%${query}%,url.ilike.%${query}%`).limit(sL),
      db().from('staff_members').select('id,name,role').ilike('name',`%${query}%`).limit(sL),
    ]);
    return ok(res,{results:{
      projects:pR.status==='fulfilled'?pR.value.data||[]:[], 
      learnings:lR.status==='fulfilled'?lR.value.data||[]:[], 
      prospects:prR.status==='fulfilled'?prR.value.data||[]:[], 
      staff:sR.status==='fulfilled'?sR.value.data||[]:[], 
    },query});
  }


  if (action === "requirements") {
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
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:900,messages:[{role:'user',content:templates[briefType]||templates.progress}]}),
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
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:600,messages:[{role:'user',content:prompt}]}),
    });
    const aiJson=await aiRes.json() as any;
    return ok(res,{success:true,brief:aiJson?.content?.[0]?.text||'Failed',role,projectName:proj.name});
  }


  /* ── EMPIRE VISION ACTIONS — Modules 03+ Visual Empire ── */
  if (action === 'get_empire_stats') {
    const [pR,lR,vR,cR,aR,prR] = await Promise.allSettled([
      db().from('projects').select('id',{count:'exact',head:true}),
      db().from('brain_learnings').select('id',{count:'exact',head:true}),
      db().from('verification_queue').select('id',{count:'exact',head:true}).eq('status','done'),
      db().from('llm_citations').select('id',{count:'exact',head:true}).eq('cited',true),
      db().from('alerts').select('id',{count:'exact',head:true}).is('read_at',null),
      db().from('prospects').select('id',{count:'exact',head:true}),
    ]);
    return ok(res,{stats:{
      projects: pR.status==='fulfilled'?pR.value.count||0:0,
      learnings:lR.status==='fulfilled'?lR.value.count||0:0,
      verifications:vR.status==='fulfilled'?vR.value.count||0:0,
      llmCitations:cR.status==='fulfilled'?cR.value.count||0:0,
      alertsUnread:aR.status==='fulfilled'?aR.value.count||0:0,
      prospects:prR.status==='fulfilled'?prR.value.count||0:0,
    }});
  }

  if (action === 'get_morning_brief') {
    const{scope='empire',projectId}=body;
    const today=new Date().toISOString().split('T')[0];
    let q=db().from('morning_briefs').select('*').eq('brief_date',today).eq('scope',scope);
    if(projectId)q=q.eq('project_id',projectId);
    const{data}=await q.order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(!data){try{const{generateMorningBrief}=await import('./lib/brief-engine');return ok(res,await generateMorningBrief(scope,projectId));}catch(e:any){return ok(res,{brief:null,error:e.message});}}
    return ok(res,{brief:data});
  }

  if (action === 'generate_morning_brief') {
    const{scope='empire',projectId}=body;
    try{const{generateMorningBrief}=await import('./lib/brief-engine');return ok(res,{success:true,...await generateMorningBrief(scope,projectId)});}
    catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'get_health_dashboard') {
    const{data}=await db().from('client_health').select('*,projects(name,url)').order('overall_score',{ascending:true}).limit(20);
    return ok(res,{health:data||[]});
  }

  if (action === 'calculate_all_health') {
    const{data:projects}=await db().from('projects').select('id').limit(50);
    if(!projects?.length)return ok(res,{success:true,processed:0});
    let count=0;
    try{const{calculateClientHealth}=await import('./lib/health-engine');for(const p of projects){try{await calculateClientHealth(p.id);count++;}catch{}}}
    catch(e:any){return ok(res,{error:e.message});}
    return ok(res,{success:true,processed:count});
  }

  if (action === 'get_reports') {
    const{projectId,limit:rL=10}=body;
    if(!projectId)return ok(res,{error:'projectId required'});
    const{data}=await db().from('reports').select('id,report_type,title,status,token,created_at').eq('project_id',projectId).order('created_at',{ascending:false}).limit(rL);
    return ok(res,{reports:data||[]});
  }

  if (action === 'generate_report') {
    const{projectId,reportType='weekly'}=body;
    if(!projectId)return ok(res,{error:'projectId required'});
    try{const{generateReport}=await import('./lib/report-engine');const r=await generateReport(projectId,reportType);return ok(res,{success:true,report:r,shareUrl:`/reports/${r?.token}`});}
    catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'check_llm_visibility') {
    const{projectId}=body;
    if(!projectId)return ok(res,{error:'projectId required'});
    try{const{checkLLMVisibility}=await import('./lib/llm-probe');return ok(res,{success:true,...await checkLLMVisibility(projectId)});}
    catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'get_llm_visibility_history') {
    const{projectId,limit:lL=20}=body;
    if(!projectId)return ok(res,{error:'projectId required'});
    const{data}=await db().from('llm_citations').select('*').eq('project_id',projectId).order('checked_at',{ascending:false}).limit(lL);
    const cited=data?.filter((r:any)=>r.cited).length||0;
    return ok(res,{citations:data||[],citedRate:data?.length?Math.round(cited/data.length*100):0});
  }

  if (action === 'get_alerts') {
    const{projectId,unreadOnly=false,limit:aL=30}=body;
    let q=db().from('alerts').select('*').order('created_at',{ascending:false}).limit(aL);
    if(projectId)q=q.eq('project_id',projectId);
    if(unreadOnly)q=q.is('read_at',null);
    const{data}=await q;
    return ok(res,{alerts:data||[],unreadCount:data?.filter((a:any)=>!a.read_at).length||0});
  }

  if (action === 'mark_alert_read') {
    const{alertId}=body;if(!alertId)return ok(res,{error:'alertId required'});
    await db().from('alerts').update({read_at:new Date().toISOString()}).eq('id',alertId);
    return ok(res,{success:true});
  }

  if (action === 'dismiss_all_alerts') {
    const{projectId}=body;
    let q=db().from('alerts').update({read_at:new Date().toISOString()}).is('read_at',null);
    if(projectId)q=q.eq('project_id',projectId);
    await q;return ok(res,{success:true});
  }

  if (action === 'capture_lead') {
    const{url,email,name,company,source,market}=body;
    if(!url)return ok(res,{error:'url required'});
    try{const{captureAndScoreLead}=await import('./lib/lead-engine');return ok(res,{success:true,...await captureAndScoreLead({url,email,name,company,source,market})});}
    catch(e:any){return ok(res,{error:e.message});}
  }

  if (action === 'get_content_briefs') {
    const{projectId,status:bS}=body;if(!projectId)return ok(res,{error:'projectId required'});
    let q=db().from('content_briefs').select('*').eq('project_id',projectId);
    if(bS)q=q.eq('status',bS);
    const{data}=await q.order('created_at',{ascending:false}).limit(20);
    return ok(res,{briefs:data||[]});
  }

  if (action === 'generate_content_brief') {
    const{projectId,keyword,priority='medium'}=body;
    if(!projectId||!keyword)return ok(res,{error:'projectId and keyword required'});
    try{const{generateContentBrief}=await import('./lib/content-engine');return ok(res,{success:true,...await generateContentBrief(projectId,keyword,priority)});}
    catch(e:any){return ok(res,{error:e.message});}
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

  if (action === 'build_persona') {
    // Redirected from removed market-researcher — use intelligence
    const { projectId, url } = body;
    return ok(res, { 
      success: true, 
      message: 'Market research integrated into intelligence engine',
      projectId 
    });
  }

  /* ════════════════════════════════════════════════════════════════
     DEVELOPER TASK ENGINE
     Parse audit findings → tasks. Execute tasks via Claude.
     Verify fixes were applied. The "I am the developer" workflow.
  ════════════════════════════════════════════════════════════════ */

  if (action === 'update_project_cms') {
    const { projectId: pid, cms: cmsValue } = body;
    if (!pid || !cmsValue) return ok(res, { error: 'projectId and cms required' });
    try {
      const { db: getDb } = await import('./lib/db.js');
      await getDb().from('projects').update({ cms: cmsValue }).eq('id', pid);
      return ok(res, { success: true });
    } catch (e: any) {
      return ok(res, { error: e?.message });
    }
  }

  if (action === 'dev_detect_cms') {
    const { projectId, url } = body;
    try {
      const { detectCms, detectCmsForProject } = await import('./lib/dev-engine.js');
      let cms;
      if (projectId && !url) {
        cms = await detectCmsForProject(projectId);
      } else {
        // Read stored project hints first
        const { data: proj } = await db().from('projects').select('cms,seo_plugin,url').eq('id', projectId || 'x').maybeSingle();
        const hints = { cms: (proj as any)?.cms, seoPlugin: (proj as any)?.seo_plugin };
        cms = await detectCms(url || (proj as any)?.url || '', hints);
      }
      return ok(res, { success: true, cms });
    } catch (e: any) {
      return ok(res, { error: e?.message });
    }
  }

  if (action === 'dev_parse_audit_tasks') {
    const { projectId, campaignId, auditRunId, targetUrl, findings } = body;
    if (!projectId) return ok(res, { error: 'projectId required' });
    if (!findings || !Array.isArray(findings)) return ok(res, { error: 'findings array required' });
    try {
      const { parseFindingsToTasks, saveTasks, deleteProjectTasks } = await import('./lib/dev-engine.js');
      /* Clear old tasks for this audit run to avoid duplication */
      if (auditRunId) await deleteProjectTasks(projectId, auditRunId);
      const tasks = parseFindingsToTasks(findings, { projectId, campaignId, auditRunId, targetUrl });
      const { saved, error } = await saveTasks(tasks);
      if (error) return ok(res, { error });
      return ok(res, { success: true, tasks_created: saved, tasks });
    } catch (e: any) {
      return ok(res, { error: e?.message });
    }
  }

  if (action === 'dev_get_tasks') {
    const { projectId, campaignId } = body;
    if (!projectId) return ok(res, { error: 'projectId required' });
    try {
      const { getTasksForProject, updateTask } = await import('./lib/dev-engine.js');
      const tasks = await getTasksForProject(projectId, { campaignId });
      // Server-side stale task recovery — anything 'running' for >120s timed out
      for (const t of tasks) {
        if ((t.status === 'running' || t.status === 'verifying') && t.executed_at) {
          const ageMs = Date.now() - new Date(t.executed_at).getTime();
          if (ageMs > 120_000) {
            await updateTask(t.id!, { status: 'failed', analysis: 'Timed out after ' + Math.round(ageMs/1000) + 's. Click Retry.' });
            t.status = 'failed';
          }
        }
      }
      return ok(res, { success: true, tasks });
    } catch (e: any) {
      return ok(res, { error: e?.message });
    }
  }

  if (action === 'dev_execute_task') {
    /* Synchronous execution — do the work, then return the completed task.
       Vercel terminates Lambda after res.json() so fire-and-forget does
       not work. Instead: execute fully within the request, return result.
       PATH A tasks (no page fetch): ~5-10s. Acceptable client wait.
       PATH B/C tasks (with page fetch): up to 45s. Vercel maxDuration=300. */
    const { taskId } = body;
    if (!taskId) return ok(res, { error: 'taskId required' });
    try {
      const { getTask, updateTask, executeDevTask } = await import('./lib/dev-engine.js');
      const task = await getTask(taskId);
      if (!task) return ok(res, { error: 'task not found' });

      await updateTask(taskId, { status: 'running', executed_at: new Date().toISOString() });

      // Execute fully — then return the completed task
      await executeDevTask(task);

      const updated = await getTask(taskId);
      return ok(res, { success: true, task: updated });
    } catch (e: any) {
      try {
        const { updateTask } = await import('./lib/dev-engine.js');
        await updateTask(taskId, { status: 'failed', analysis: 'Error: ' + (e?.message || 'unknown') });
      } catch { /* best effort */ }
      return ok(res, { error: e?.message || 'Execution error' });
    }
  }


  if (action === 'dev_verify_task') {
    const { taskId } = body;
    if (!taskId) return ok(res, { error: 'taskId required' });
    try {
      const { getTask, updateTask, verifyDevTask } = await import('./lib/dev-engine.js');
      const task = await getTask(taskId);
      if (!task) return ok(res, { error: 'task not found' });

      await updateTask(taskId, { status: 'verifying' });

      try {
        const updates = await verifyDevTask(task);
        await updateTask(taskId, updates);
      } catch (ve: any) {
        await updateTask(taskId, {
          status:               'applied',
          verification_result:  'partial',
          verification_evidence: { message: 'Verification error: ' + (ve?.message || 'unknown') },
          verified_at:          new Date().toISOString(),
        });
      }

    } catch (e: any) {
      if (!res.headersSent) return ok(res, { error: e?.message });
    }
    return;
  }


  if (action === 'dev_update_task') {
    const { taskId, updates } = body;
    if (!taskId) return ok(res, { error: 'taskId required' });
    try {
      const { updateTask, getTask } = await import('./lib/dev-engine.js');
      await updateTask(taskId, updates || {});
      const updated = await getTask(taskId);
      return ok(res, { success: true, task: updated });
    } catch (e: any) {
      return ok(res, { error: e?.message });
    }
  }

  if (action === 'dev_get_snapshot') {
    const { taskId } = body;
    if (!taskId) return ok(res, { error: 'taskId required' });
    try {
      const { loadSnapshot } = await import('./lib/dev-engine.js');
      const snapshot = await loadSnapshot(taskId);
      return ok(res, { success: true, snapshot });
    } catch (e: any) {
      return ok(res, { error: e?.message });
    }
  }

  if (action === 'dev_chat') {
    /* Contextual chat for the Developer tab.
       Pulls full project context from DB — all tasks, project info, audit summary.
       Claude knows the whole picture, not just the current task. */
    const { message, taskContext, history, projectId } = body;
    if (!message) return ok(res, { error: 'message required' });

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
    const tc = taskContext || {};

    // ── Pull project context from DB ──────────────────────────────
    let projectInfo   = '';
    let allTasksSummary = '';
    let auditContext  = '';

    try {
      const { db: getDb } = await import('./lib/db.js');
      const dbClient = getDb();

      // Project info
      if (projectId) {
        const { data: proj } = await dbClient
          .from('projects')
          .select('name, url, cms, industry, target_keyword')
          .eq('id', projectId)
          .maybeSingle();
        if (proj) {
          projectInfo = [
            'Project: ' + ((proj as any).name || 'unknown'),
            'Website: ' + ((proj as any).url || tc.target_url || 'unknown'),
            'CMS: ' + (tc.cms_platform || (proj as any).cms || 'unknown'),
            (proj as any).industry ? 'Industry: ' + (proj as any).industry : '',
            (proj as any).target_keyword ? 'Target keyword: ' + (proj as any).target_keyword : '',
          ].filter(Boolean).join('\n');
        }

        // All tasks — give the AI the full task list so it understands priorities
        const { data: tasks } = await dbClient
          .from('dev_tasks')
          .select('phase, category, task_type, title, status, severity, priority')
          .eq('project_id', projectId)
          .order('priority', { ascending: true });

        if (tasks && (tasks as any[]).length > 0) {
          const taskLines = (tasks as any[]).map(t =>
            `  [${t.phase}] ${t.status === 'done' ? '✓' : t.status === 'fix_ready' ? '→' : '○'} ${t.title} (${t.severity})`
          );
          allTasksSummary = 'All tasks for this project:\n' + taskLines.join('\n');
        }

        // Audit run summary — most recent audit findings for this project
        const { data: auditRuns } = await dbClient
          .from('audit_reports')
          .select('run_id, created_at, mobile_lcp_ms, mobile_tbt_ms, desktop_lcp_ms')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (auditRuns && (auditRuns as any[]).length > 0) {
          const run = (auditRuns as any[])[0];
          auditContext = [
            'Latest audit data:',
            run.mobile_lcp_ms  ? '  Mobile LCP: ' + (run.mobile_lcp_ms / 1000).toFixed(1) + 's' : '',
            run.mobile_tbt_ms  ? '  Mobile TBT: ' + Math.round(run.mobile_tbt_ms) + 'ms' : '',
            run.desktop_lcp_ms ? '  Desktop LCP: ' + (run.desktop_lcp_ms / 1000).toFixed(1) + 's' : '',
          ].filter(Boolean).join('\n');
        }
      }
    } catch { /* context enrichment is best-effort — chat still works without it */ }

    // ── Build system prompt ───────────────────────────────────────
    const systemPrompt = [
      'You are Manav, an SEO and web development assistant helping a non-technical person fix their client\'s website.',
      '',
      '== PROJECT CONTEXT ==',
      projectInfo || 'Project info not available.',
      '',
      allTasksSummary ? '== ALL TASKS ==\n' + allTasksSummary : '',
      auditContext    ? '== AUDIT DATA ==\n' + auditContext    : '',
      '',
      '== CURRENT TASK (the one they are working on right now) ==',
      'Task: '        + (tc.title    || 'unknown'),
      'Type: '        + (tc.task_type || 'unknown'),
      'Page: '        + (tc.target_url || 'unknown'),
      tc.analysis ? 'What was found: ' + tc.analysis.slice(0, 500)    : '',
      tc.fix_code  ? 'Fix code preview: ' + tc.fix_code.slice(0, 400) : '',
      '',
      '== YOUR RULES ==',
      '- You know the whole project — reference other tasks when relevant',
      '- Answer in plain English — never use jargon without explaining it',
      '- Be specific: name the exact menu, button, or tab they need to click',
      '- Keep answers to 3-5 sentences unless they ask for more detail',
      '- If they are confused, ask "what do you see on your screen right now?"',
      '- Be calm — this is a live client site and mistakes feel scary',
      '- If they ask about a different task, answer it — you know all the tasks',
      '- If they ask about audit data, reference the actual numbers you have',
      '- Never say "just" or "simply" — be specific instead',
    ].filter(Boolean).join('\n');

    const messages = [
      ...(Array.isArray(history) ? history.slice(-8) : []),
      { role: 'user', content: message },
    ];

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: systemPrompt,
          messages,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await resp.json() as any;
      if (data?.error) return ok(res, { error: data.error.message });
      const reply = (data?.content?.[0]?.text || '').trim();
      return ok(res, { success: true, reply });
    } catch (e: any) {
      return ok(res, { error: 'Chat error: ' + (e?.message || 'unknown') });
    }
  }

  if (action === 'dev_confirm_backup') {
    /* User explicitly confirmed backup before applying — mark in DB */
    const { taskId } = body;
    if (!taskId) return ok(res, { error: 'taskId required' });
    try {
      const { updateTask } = await import('./lib/dev-engine.js');
      await updateTask(taskId, { backup_confirmed: true } as any);
      return ok(res, { success: true });
    } catch (e: any) {
      return ok(res, { error: e?.message });
    }
  }

    return ok(res, { error: `Unknown action: ${action}` });
}