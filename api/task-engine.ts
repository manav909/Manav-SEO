import Anthropic                              from "@anthropic-ai/sdk";
import { createClient }                      from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractAndSaveLearning }            from "./ai-cache";

export const config = { maxDuration: 180 };

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const SYSTEM = "You are Manav Brain, the senior SEO strategist embedded in SEO Season. Speak as a knowledgeable senior colleague who genuinely cares about this project. Use I throughout. Be direct, specific, and honest. Never invent data. Flag every assumption. Cite every source. If you do not have data, say exactly where to find it.";

const WAIT_DAYS: Record<string, number> = {
  technical: 5, content: 14, geo: 7, "quick-win": 3,
  competitive: 21, insight: 0, weekly: 3, monthly: 30, kpi: 7, custom: 5,
};

// Card type → hex color (mirrors Playground.tsx TYPE_MAP colors)
const CARD_COLORS: Record<string, string> = {
  "quick-win":  "#4ade80", "weekly":    "#60a5fa", "monthly":  "#a78bfa",
  "technical":  "#06b6d4", "content":   "#facc15", "geo":      "#6366f1",
  "competitive":"#fb923c", "insight":   "#f472b6", "kpi":      "#34d399",
  "custom":     "#94a3b8",
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
    review_checklist: ["Test every change in staging before applying to the live site","Verify HTTP status codes in browser DevTools after applying","Request re-indexing in Google Search Console for affected URLs","Check PageSpeed before and after if this was a speed task","Confirm no important pages are blocked in robots.txt after the change"],
    verification_method: "GSC Coverage report indexed count + HTTP status check on affected URLs",
  },
  content: {
    what_ai_produces: "Full SEO-optimised draft at your target word count — heading structure, meta title, meta description, schema markup, and internal link suggestions.",
    required_inputs: [
      { key: "target_keyword",      label: "Primary target keyword",                                        why: "The entire content is built around this",                      autoFetchable: false },
      { key: "search_intent",       label: "Search intent: informational, commercial, or transactional",   why: "This determines the format and depth of the content",         autoFetchable: false },
      { key: "word_count_target",   label: "Target word count",                                             why: "This determines how deep I go",                               autoFetchable: false },
      { key: "brand_voice_example", label: "One example of brand writing — URL or paste a paragraph",      why: "Without this my output will be generic",                      autoFetchable: false },
    ],
    review_checklist: ["Read every paragraph — check every statistic against its primary source","Click every internal link I suggested","Check meta title is under 60 characters","Read the draft aloud — if it sounds forced, the keyword placement needs work","Validate any schema markup at validator.schema.org"],
    verification_method: "GSC Performance: impressions and position for target keyword — allow 14 days after publishing",
  },
  geo: {
    what_ai_produces: "Rewritten intro paragraph, FAQ section with FAQPage schema, entity-rich summary block — all structured to maximise AI citation probability.",
    required_inputs: [
      { key: "current_content", label: "Current page URL or paste the content",                             why: "I need to read what exists before I can improve it",  autoFetchable: true  },
      { key: "target_query",    label: "The exact query you want to appear for in Perplexity or ChatGPT",  why: "GEO strategy is completely query-specific",           autoFetchable: false },
      { key: "ai_platform",     label: "Priority platform: Perplexity, ChatGPT, or Google AI Overview",   why: "Each platform cites content differently",             autoFetchable: false },
    ],
    review_checklist: ["Search the target query in Perplexity right now and screenshot the result","Validate all schema markup at validator.schema.org before deploying","Confirm all factual claims in the rewritten content are accurate","Search again in Perplexity 7 days after publishing and compare"],
    verification_method: "Manual Perplexity and ChatGPT check for target query — screenshot citations before and after",
  },
  "quick-win": {
    what_ai_produces: "Specific before and after for meta titles, descriptions, headings, and image alt tags — one line per URL, ready to implement.",
    required_inputs: [
      { key: "target_urls",   label: "URLs to optimise — paste 1 to 10",  why: "I will fetch each page and generate specific improvements",        autoFetchable: true  },
      { key: "target_metric", label: "What metric are we trying to move",  why: "CTR, rankings, and impressions each need different approaches",   autoFetchable: false },
    ],
    review_checklist: ["Check each meta title is under 60 characters","Check each meta description is under 160 characters","Preview each in a SERP simulator","Check GSC CTR 7 days after the change"],
    verification_method: "GSC Performance: CTR and average position for affected URLs — compare 7 days before vs 7 days after",
  },
  competitive: {
    what_ai_produces: "Gap analysis table, specific content to create, keyword targeting plan with priority order.",
    required_inputs: [
      { key: "competitor_url",  label: "Competitor domain to analyse",              why: "I will fetch their pages to find the exact gaps",        autoFetchable: true  },
      { key: "target_keywords", label: "Keywords you want to compete on",           why: "Without this the analysis is too broad to be useful",   autoFetchable: false },
      { key: "ranking_data",    label: "Semrush or Ahrefs export if you have one",  why: "This takes my confidence from 65 to 85 percent",        autoFetchable: false },
    ],
    review_checklist: ["Cross-check all suggested keywords in your own Semrush or Ahrefs account","Search the top 3 gap keywords manually in incognito to verify the opportunity","Check GSC impressions for target keywords 30 days after creating content"],
    verification_method: "Semrush or Ahrefs position tracking — compare your ranking vs competitor after 30 days",
  },
  insight: {
    what_ai_produces: "Deep strategic analysis with specific recommendations, priority sequencing, and reasoning based on all available project data.",
    required_inputs: [{ key: "specific_question", label: "The specific question or area you want me to analyse", why: "A focused question produces a useful answer", autoFetchable: false }],
    review_checklist: ["Verify all data references against the source reports","Challenge any forecasts — treat them as directional, not guaranteed"],
    verification_method: "Track the specific metrics mentioned over the timeframe I suggest",
  },
  weekly: {
    what_ai_produces: "Step-by-step execution brief with numbered instructions, tool requirements, time estimates, and a clear definition of done.",
    required_inputs: [{ key: "task_context", label: "More context about what specifically needs doing", why: "Weekly tasks vary widely — context determines the right approach", autoFetchable: false }],
    review_checklist: ["Confirm the deliverable matches the brief before marking this done"],
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
  } catch { return ""; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    action, card, context: rawContext, userInputs = {}, role = "senior_seo",
    completedAt, checkType = "guidance", completionNote = "", evidenceData = "",
  } = req.body;

  const context = (rawContext && typeof rawContext === "object") ? rawContext : {};

  /* ═════════════════════════════════════════════════════════════════
     BRAIN LEARNING ACTIONS — no card required, always first
  ═════════════════════════════════════════════════════════════════ */

  if (action === "get_all_learnings") {
    const { project_id } = req.body;
    const { data, error } = await (
      project_id
        ? sb.from("brain_learnings").select("*").or(`project_id.eq.${project_id},project_id.is.null`).order("created_at", { ascending: false })
        : sb.from("brain_learnings").select("*").order("created_at", { ascending: false })
    );
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, learnings: data || [] });
  }

  if (action === "save_learning") {
    const { project_id, card_type, card_title, what_worked, what_missed,
            redo_reason, improvement, context_summary, tags } = req.body;
    if (!card_type) return res.status(400).json({ error: "card_type required" });
    const { data, error } = await sb.from("brain_learnings").insert({
      project_id:       project_id || null, card_type,
      card_title:       card_title  || "",
      what_worked:      Array.isArray(what_worked) ? what_worked : [],
      what_missed:      Array.isArray(what_missed) ? what_missed : [],
      redo_reason:      redo_reason     || null, improvement:  improvement     || null,
      context_summary:  context_summary || null,
      tags:             Array.isArray(tags) ? tags : [],
      source:           "task_execution", applied_count: 0,
      status:           "active", auto_captured: false, confidence_score: 85,
      updated_at:       new Date().toISOString(),
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, learning: data });
  }

  if (action === "get_relevant") {
    const { project_id, card_type, limit = 8 } = req.body;
    let rows: any[] = [];
    // CRITICAL: Only inject ACTIVE learnings — pending/rejected must never enter AI prompts
    if (project_id && card_type) {
      const { data } = await sb.from("brain_learnings").select("*")
        .eq("project_id", project_id).eq("card_type", card_type).eq("status", "active")
        .order("applied_count", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
      rows = data || [];
    }
    if (rows.length < limit && card_type) {
      const seen = new Set(rows.map((r: any) => r.id));
      const { data } = await sb.from("brain_learnings").select("*")
        .eq("card_type", card_type).eq("status", "active")
        .order("applied_count", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
      rows = [...rows, ...(data || []).filter((r: any) => !seen.has(r.id))].slice(0, limit);
    }
    if (rows.length < 3) {
      const seen = new Set(rows.map((r: any) => r.id));
      const { data } = await sb.from("brain_learnings").select("*")
        .eq("status", "active").order("created_at", { ascending: false }).limit(5);
      rows = [...rows, ...(data || []).filter((r: any) => !seen.has(r.id))].slice(0, limit);
    }
    void (async () => {
      for (const id of rows.slice(0, 3).map((r: any) => r.id)) {
        try {
          const { data: d } = await sb.from("brain_learnings").select("applied_count").eq("id", id).single();
          if (d) await sb.from("brain_learnings").update({ applied_count: ((d as any).applied_count || 0) + 1 }).eq("id", id);
        } catch { /* non-blocking */ }
      }
    })();
    return res.status(200).json({ success: true, learnings: rows });
  }

  if (action === "delete_learning") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });

    // IMMUTABLE LOG PROTECTION — log entries can never be deleted
    const { data: item } = await sb.from("brain_learnings").select("source").eq("id", id).single();
    if (item?.source?.endsWith("_log")) {
      return res.status(403).json({ error: "This is an immutable brain log entry and cannot be deleted. Brain logs are permanent by design." });
    }

    const { error } = await sb.from("brain_learnings").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (action === "update_learning") {
    const { id, improvement, tags } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { data, error } = await sb.from("brain_learnings").update({
      improvement,
      tags:       Array.isArray(tags) ? tags : (tags || "").split(",").map((t: string) => t.trim()).filter(Boolean),
      updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, learning: data });
  }

  if (action === "approve_learning") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { data, error } = await sb.from("brain_learnings")
      .update({ status: "active", updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, learning: data });
  }

  if (action === "reject_learning") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { data, error } = await sb.from("brain_learnings")
      .update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, learning: data });
  }

  if (action === "deactivate_learning") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { data, error } = await sb.from("brain_learnings")
      .update({ status: "pending_review", updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, learning: data });
  }

  /* ─── ADD CANVAS CARD — Brain assistant creates cards directly ─── */
  if (action === "add_canvas_card") {
    const { project_id, card: newCard } = req.body;
    if (!project_id || !newCard?.type || !newCard?.title) {
      return res.status(400).json({ error: "project_id, card.type, and card.title are required" });
    }

    // Fetch current strategy from Supabase
    const { data: proj, error: projErr } = await sb.from("projects")
      .select("playground_strategy, playground_canvas").eq("id", project_id).single();
    if (projErr) return res.status(500).json({ error: projErr.message });

    const strategy = proj?.playground_strategy || { canvas_blocks: [] };
    if (!Array.isArray(strategy.canvas_blocks)) strategy.canvas_blocks = [];

    const cardId = `brain_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const builtCard = {
      id:         cardId,
      type:       newCard.type,
      title:      newCard.title,
      content:    newCard.content || "",
      color:      CARD_COLORS[newCard.type] || "#94a3b8",
      priority:   newCard.priority || "medium",
      status:     "todo",
      week:       Number(newCard.week) || 1,
      placed:     true,
      effort:     newCard.effort || null,
      impact:     newCard.impact || null,
      tags:       [...(newCard.tags || []), "brain-created"],
      source:     "Manav Brain",
      assignee:   null,
      aiAssisted: true,
    };

    strategy.canvas_blocks.push(builtCard);

    // Save updated strategy — also update playground_canvas to keep in sync
    const canvas = Array.isArray(proj?.playground_canvas) ? proj.playground_canvas : [];
    canvas.push({
      id: cardId, placed: true, week: builtCard.week, status: "todo",
      assignee: null, aiAssisted: true, tags: builtCard.tags,
      effort: null, impact: null, title: builtCard.title,
      content: builtCard.content, type: builtCard.type,
      priority: builtCard.priority, color: builtCard.color, source: "Manav Brain",
    });

    const { error: saveErr } = await sb.from("projects").update({
      playground_strategy: strategy,
      playground_canvas:   canvas,
    }).eq("id", project_id);

    if (saveErr) return res.status(500).json({ error: saveErr.message });

    return res.status(200).json({ success: true, card: builtCard });
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
    if (ctx.gaps?.noGoal)      gaps.push("No campaign goal set in Data Room — strategy direction is unclear");
    if (ctx.gaps?.noCMS)       gaps.push("CMS not recorded — technical task output will be generic");
    if (ctx.gaps?.noAnalytics) gaps.push("No analytics baseline — cannot forecast realistic impact");
    if (ctx.gaps?.noDocuments) gaps.push("No tool exports uploaded — working from estimates only");
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

    const verifyPrompt = ["You are performing a strict quality review as Head of Department.","A task has been submitted for approval. Verify it has been completed correctly.","Never approve without evidence.","","TASK:",`Type: ${card.type}`,`Title: ${card.title}`,`Required: ${card.content}`,`Priority: ${card.priority} | Expected impact: ${card.impact || "not specified"}`,`Days since completion: ${daysSince} / Required wait: ${waitDays} days`,`Wait period: ${waitExpired ? "COMPLETE" : `INCOMPLETE — ${daysLeft} days remain`}`,"","COMPLETION STATEMENT:",completionNote || "(No completion note provided — this is a red flag)","","EVIDENCE PROVIDED:",evidenceData || "(No evidence provided — cannot approve without evidence)","",liveContent ? `LIVE SITE DATA:\n${liveContent}` : "","","Return ONLY valid JSON: {\"verdict\":\"verified|not_verified|partial|waiting|cannot_determine\",\"confidence\":0,\"evidence_found\":[],\"evidence_missing\":[],\"what_to_check\":[{\"tool\":\"\",\"action\":\"\",\"what_to_look_for\":\"\",\"pass_condition\":\"\",\"fail_condition\":\"\"}],\"timeline_note\":\"\",\"next_action\":\"\",\"approval_blocked\":\"\",\"hod_note\":\"\",\"roles\":{\"who_should_verify\":\"\",\"escalate_to\":\"\"}}"].join("\n");

    try {
      const anthropic = new Anthropic();
      const response  = await anthropic.messages.create({
        model: "claude-sonnet-4-5", max_tokens: 2000,
        system: SYSTEM + " You are performing a quality review. Be strict and evidence-driven. Return only valid JSON.",
        messages: [{ role: "user", content: verifyPrompt }],
      });
      const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
      const f = raw.indexOf("{"), l = raw.lastIndexOf("}");
      let parsed: any = {};
      try { parsed = JSON.parse(raw.slice(f, l + 1)); } catch { /* ignore */ }

      if (parsed.verdict && parsed.verdict !== "cannot_determine") {
        const projectId = req.body.projectId || context?.project?.id || null;
        void extractAndSaveLearning("verify_outcome", projectId,
          [`Verification result: ${parsed.verdict} (${parsed.confidence}% confidence)`,`Task type: ${card.type} | Title: ${card.title}`,`Evidence found: ${(parsed.evidence_found||[]).join(" | ")||"none"}`,`Evidence missing: ${(parsed.evidence_missing||[]).join(" | ")||"none"}`,`HOD note: ${parsed.hod_note||""}`,`Next action: ${parsed.next_action||""}`].join("\n"),
          { card_type: card.type, card_title: card.title, context_summary: `${card.type} verification — verdict: ${parsed.verdict}` }
        );
      }
      return res.status(200).json({ success: true, ...parsed, waiting_status: { waitDays, daysSince, daysLeft, waitExpired }, live_data_used: liveContent.length > 0 });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
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
      executive:       "You are advising a business owner. Translate everything to outcomes: revenue, competitive position, customer trust. No jargon.",
      senior_seo:      "You are a senior SEO strategist sharing your thinking. Include algorithm reasoning, compounding effects, and risks if we do not act.",
      project_manager: "You are a PM. Be clear on deliverables, acceptance criteria, dependencies, and timeline.",
      biz_dev:         "You are advising a business development manager. Frame everything in client value.",
    };
    const executePrompt = [
      `Execute this SEO task as a ${role.replace("_", " ")}. ${ROLE_VOICE[role] || ROLE_VOICE.senior_seo}`,
      "","TASK:",`Type: ${card.type} | Title: ${card.title}`,`Description: ${card.content}`,`Priority: ${card.priority} | Expected impact: ${card.impact || "not specified"}`,
      "","PROJECT INTELLIGENCE:",
      `Company: ${ctx.project?.name || "Unknown"} | URL: ${ctx.project?.url || "Not set"}`,
      `CMS: ${ctx.tech?.cms || "Not recorded"} | SEO Plugin: ${ctx.tech?.seoPlugin || "Not recorded"} | PageSpeed mobile: ${ctx.tech?.pagespdMobile || "?"}`,
      `Goal: ${ctx.goals?.primary || "Not set"} | Timeline: ${ctx.goals?.timeline || "Not set"}`,
      `Keywords: ${ctx.goals?.keywords || (ctx.project?.keywords || []).slice(0, 5).join(", ") || "Not set"}`,
      `Organic sessions/month: ${ctx.analytics?.organicMonthly || "Unknown"} | GSC clicks: ${ctx.analytics?.gscClicks || "?"} | Avg position: ${ctx.analytics?.gscAvgPos || "?"}`,
      `Competitors: ${[ctx.competitors?.c1, ctx.competitors?.c2].filter(Boolean).join(", ") || "Not recorded"} | Our DR: ${ctx.competitors?.ourDR || "?"}`,
      `Technical: ${ctx.technical?.pagesIndexed || "?"} pages indexed | Crawl errors: ${ctx.technical?.crawlErrors || "none"} | Schema: ${ctx.technical?.schema || "?"}`,
      "","INPUTS PROVIDED:",Object.entries(userInputs).map(([k, v]) => `${k}: ${v}`).join("\n") || "None",
      "",liveContent ? `LIVE PAGE DATA:\n${liveContent}` : "",
      "","AUDIT INTELLIGENCE:",ctx.audits?.slice(0, 2).map((a: any) => `${a.date}: ${Object.values(a.sections).join(" | ")}`).join("\n") || "No audits available",
      "",brainLearnings?.length ? ["","MANAV BRAIN LEARNINGS (apply these to improve quality):",...brainLearnings.map((l: any, idx: number) => [`  [Learning ${idx + 1}] Card type: ${l.card_type} | Task: "${l.card_title}"`,l.what_missed?.length ? `    What was missed: ${l.what_missed.join(" | ")}` : "",l.improvement ? `    Improvement to apply: ${l.improvement}` : ""].filter(Boolean).join("\n"))].join("\n") : "",
      "","RULES:","1. Only state facts from the data above. If data is missing, say: I do not have this — check [source]","2. Cite the source for every specific number","3. Never invent competitor data, rankings, or statistics","4. Flag every assumption with: ASSUMPTION — verify before using","5. Apply every MANAV BRAIN LEARNING listed above","6. End with a section called Manav's Take — what excites you, what to watch, one honest concern",
      "","Produce the actual deliverable — not a description of what to do, but the finished output ready to use.",
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
        model: "claude-sonnet-4-5", max_tokens: 8192,
        system: SYSTEM,
        messages: [{ role: "user", content: executePrompt }],
      });
      let finalStopReason = "";
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") res.write(chunk.delta.text);
        if (chunk.type === "message_delta" && chunk.delta.stop_reason) finalStopReason = chunk.delta.stop_reason;
      }
      if (finalStopReason === "max_tokens") {
        console.warn(`[SEO Season] task-engine execute hit max_tokens — card: "${card.title}" role: ${role}`);
        res.write("\n\n---\n⚠️ Output reached the length limit and may be incomplete. Try splitting this task or use the Redo button.");
      }
    } catch (err: any) {
      res.write(`\nError: ${err.message}`);
    } finally {
      res.end();
    }
    return;
  }

  /* ── EVALUATE ── */
  if (action === "evaluate") {
    const { output: executedOutput, executedRole, executedInputs, projectId } = req.body;
    if (!executedOutput) return res.status(400).json({ error: "No output to evaluate" });

    const evaluatePrompt = ["You just produced the following output for a task. Now evaluate it honestly.","You are Manav Brain reviewing your own work — be genuinely critical, not defensive.","","TASK:",`Type: ${card.type} | Title: ${card.title}`,`Role used: ${executedRole}`,`Inputs provided: ${JSON.stringify(executedInputs)}`,``,`YOUR OUTPUT:`,String(executedOutput).slice(0, 6000),"","Evaluate honestly. Return ONLY valid JSON:",JSON.stringify({quality_score:"0-100 — how good is this output really",what_worked:["specific thing that is genuinely strong"],what_missed:["specific gap or weakness in the output"],was_role_right:"yes or no",better_role:"which role would have produced better output and why",inputs_that_mattered:["which user inputs most shaped this output"],inputs_that_would_help:["what additional input would have made this significantly better"],suggested_inputs:{"key":"what I would have asked for"},redo_reason:"One honest sentence: if I could redo this, here is what I would change and why",confidence_actual:"0-100 — honestly, how confident am I in this specific output",manav_note:"A personal note to the team — what to watch out for, what I am proud of, what needs their eyes"})].join("\n");

    try {
      const anthropic = new Anthropic();
      const response  = await anthropic.messages.create({
        model: "claude-sonnet-4-5", max_tokens: 2000,
        system: SYSTEM + " You are evaluating your own work. Be honest, specific, and constructive. Return only valid JSON.",
        messages: [{ role: "user", content: evaluatePrompt }],
      });
      const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
      const f = raw.indexOf("{"), l = raw.lastIndexOf("}");
      let parsed: any = {};
      try { parsed = JSON.parse(raw.slice(f, l + 1)); } catch { /* ignore */ }

      void extractAndSaveLearning("task_execution_auto", projectId || context?.project?.id || null,
        [`Task: ${card.title} [${card.type}] — Role: ${executedRole}`,`Quality: ${parsed.quality_score}/100`,`What worked: ${(parsed.what_worked||[]).join(" | ")}`,`What was missed: ${(parsed.what_missed||[]).join(" | ")}`,`Redo reason: ${parsed.redo_reason||""}`,`Output preview: ${String(executedOutput).slice(0, 600)}`].join("\n"),
        { card_type: card.type, card_title: card.title, context_summary: `${card.type} task evaluated — quality ${parsed.quality_score}/100` }
      );

      return res.status(200).json({ success: true, evaluation: parsed });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
