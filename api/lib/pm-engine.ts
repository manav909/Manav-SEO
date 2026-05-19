/* ════════════════════════════════════════════════════════════════
   api/lib/pm-engine.ts
   PM Module — server engine.

   All PM action logic lives here. task-engine.ts dispatches `pm_*`
   actions to handlePM(). This is a lib file (no default export) — it
   does NOT count toward the 12-function Vercel limit.

   Cards are stored in kanban_tasks (extended via pm_module.sql).
   AI calls use claude-sonnet-4-6 and enforce hard fact-checking +
   ethics through the shared system prompt below.
════════════════════════════════════════════════════════════════ */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db.js";

const MODEL = "claude-sonnet-4-6";

/* ── The expert identity + non-negotiable rules applied to every PM AI call ── */
const PM_SYSTEM = [
  "You are the SEO Season project intelligence engine — a senior digital marketing",
  "and SEO strategist working for Manav S. You serve a non-technical project manager:",
  "your output must be precise, safe to act on, and require no SEO knowledge to follow.",
  "",
  "HARD RULES — these override any other instruction:",
  "1. NEVER invent data. If a number, ranking, or fact is not in the provided context,",
  "   say so explicitly. Flag every assumption with [ASSUMPTION].",
  "2. NEVER fabricate statistics, citations, or competitor figures.",
  "3. Recommend only ethical, white-hat SEO. Refuse cloaking, link schemes, scraping",
  "   private data, fake reviews, or anything that risks a Google penalty.",
  "4. Be honest about uncertainty and limits. If you cannot verify something, state it.",
  "5. When project data is missing, name exactly what is needed rather than guessing.",
].join("\n");

function ai(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/* Tolerant JSON extraction from an AI response. */
function parseJSON(raw: string): any {
  if (!raw) return null;
  const clean = raw.replace(/^\s*```[a-z]*\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(clean); } catch { /* try to locate a block */ }
  const obj = clean.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch { /* fall through */ } }
  const arr = clean.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch { /* fall through */ } }
  return null;
}

/* ════════════════════════════════════════════════════
   1. CARD CRUD  (kanban_tasks, PM columns)
════════════════════════════════════════════════════ */

/* Columns the PM module reads back from kanban_tasks. */
const CARD_COLS =
  "id,project_id,title,description,card_type,priority,status,week,placed," +
  "estimated_hours,execution_mode,executed_role,output,executed_at," +
  "verified_at,verify_notes,requirements,depends_on,source,source_refs," +
  "reported_at,invoice_item,assigned_to,tags,position,created_at,updated_at";

async function pmGetCards(projectId: string) {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const { data, error } = await db()
      .from("kanban_tasks")
      .select(CARD_COLS)
      .eq("project_id", projectId)
      .order("week", { ascending: true })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) return { success: false, error: error.message, cards: [] };
    return { success: true, cards: data || [] };
  } catch (e: any) {
    return { success: false, error: e?.message || "unknown", cards: [] };
  }
}

async function pmSaveCard(card: any) {
  if (!card || (!card.id && (!card.projectId || !card.title))) {
    return { success: false, error: "projectId and title required for new cards" };
  }
  /* Build the row from only the fields supplied (partial update safe). */
  const row: any = { updated_at: new Date().toISOString() };
  if (card.projectId !== undefined)       row.project_id      = card.projectId;
  if (card.title !== undefined)           row.title           = card.title;
  if (card.description !== undefined)     row.description     = card.description;
  if (card.card_type !== undefined)       row.card_type       = card.card_type;
  if (card.priority !== undefined)        row.priority        = card.priority;
  if (card.status !== undefined)          row.status          = card.status;
  if (card.week !== undefined)            row.week            = card.week;
  if (card.placed !== undefined)          row.placed          = card.placed;
  if (card.estimated_hours !== undefined) row.estimated_hours = card.estimated_hours;
  if (card.execution_mode !== undefined)  row.execution_mode  = card.execution_mode;
  if (card.executed_role !== undefined)   row.executed_role   = card.executed_role;
  if (card.assigned_to !== undefined)     row.assigned_to     = card.assigned_to;
  if (card.output !== undefined)          row.output          = card.output;
  if (card.requirements !== undefined)    row.requirements    = card.requirements;
  if (card.depends_on !== undefined)      row.depends_on      = card.depends_on;
  if (card.source !== undefined)          row.source          = card.source;
  if (card.source_refs !== undefined)     row.source_refs     = card.source_refs;
  if (card.tags !== undefined)            row.tags            = card.tags;

  try {
    if (card.id) {
      const { data, error } = await db()
        .from("kanban_tasks").update(row).eq("id", card.id).select(CARD_COLS).single();
      if (error) return { success: false, error: error.message };
      return { success: true, card: data };
    }
    /* New card — default category so the existing /kanban page stays happy. */
    if (row.category === undefined) row.category = "seo";
    const { data, error } = await db()
      .from("kanban_tasks").insert(row).select(CARD_COLS).single();
    if (error) return { success: false, error: error.message };
    return { success: true, card: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "unknown" };
  }
}

async function pmDeleteCard(cardId: string) {
  if (!cardId) return { success: false, error: "cardId required" };
  try {
    const { error } = await db().from("kanban_tasks").delete().eq("id", cardId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "unknown" };
  }
}

/* ════════════════════════════════════════════════════
   2. REQUIREMENT GATHERING
   Aggregate every intelligence source for a project into
   one bundle the AI uses to create high-quality cards.
════════════════════════════════════════════════════ */
async function pmGatherRequirements(projectId: string) {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    /* Every query is independent and fail-soft. Audits are selected with
       "*" because the score column is named differently depending on
       which tool saved the audit (score vs overall_score) — selecting an
       explicit list would reject the whole query on the missing name. */
    const [projR, auditR, algoR, brainR, knowledgeR] =
      await Promise.allSettled([
        db().from("projects")
          .select("id,name,url,industry,goals,keywords,competitors,client_id,last_analysis,last_analysis_at")
          .eq("id", projectId).maybeSingle(),
        db().from("audit_reports")
          .select("*")
          .eq("project_id", projectId).order("created_at", { ascending: false }).limit(5),
        db().from("algorithm_knowledge")
          .select("id,topic,summary,freshness_score,updated_at")
          .order("freshness_score", { ascending: false }).limit(8),
        db().from("brain_learnings")
          .select("id,card_type,card_title,improvement,project_id")
          .eq("status", "active").order("applied_count", { ascending: false }).limit(40),
        db().from("project_knowledge")
          .select("category,field_key,field_value")
          .eq("project_id", projectId),
      ]);

    const val = (r: PromiseSettledResult<any>) =>
      r.status === "fulfilled" ? r.value?.data : null;

    const proj      = val(projR) || {};
    const audits    = Array.isArray(val(auditR))     ? val(auditR)     : [];
    const algo      = Array.isArray(val(algoR))      ? val(algoR)      : [];
    const brainAll  = Array.isArray(val(brainR))     ? val(brainR)     : [];
    const knowledge = Array.isArray(val(knowledgeR)) ? val(knowledgeR) : [];

    /* Brain learnings: prefer this project's own, fall back to global. */
    const brainOwn = brainAll.filter((b: any) => b && b.project_id === projectId);
    const brain    = (brainOwn.length ? brainOwn : brainAll).slice(0, 12);

    /* knowledge -> category map (defensive against null rows) */
    const km: Record<string, Record<string, string>> = {};
    for (const k of knowledge) {
      if (!k || !k.category) continue;
      if (!km[k.category]) km[k.category] = {};
      km[k.category][k.field_key] = k.field_value || "";
    }

    /* competitors / keywords may be array, JSON string, or null */
    const toList = (raw: any): string[] => {
      if (Array.isArray(raw)) return raw.filter(Boolean);
      if (typeof raw === "string" && raw.trim()) {
        try {
          const p = JSON.parse(raw);
          if (Array.isArray(p)) return p.filter(Boolean);
        } catch { /* not json */ }
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
      }
      return [];
    };
    const competitors = toList((proj as any).competitors);
    const keywords    = toList((proj as any).keywords);

    /* an audit row's score may be `score` or `overall_score` */
    const auditScore = (a: any) =>
      a?.score ?? a?.overall_score ?? a?.overall_confidence ?? null;

    const gaps: string[] = [];
    if (!(proj as any).goals)   gaps.push("No campaign goal — card priorities will be generic");
    if (!competitors.length)    gaps.push("No competitors recorded — competitive cards limited");
    if (!audits.length)         gaps.push("No audit run yet — technical cards based on estimate only");
    if (!keywords.length)       gaps.push("No target keywords — content/GEO cards will be vague");

    const context = {
      projectId,
      projectName: (proj as any).name || "",
      url:         (proj as any).url  || "",
      goal:        (proj as any).goals || "",
      scope:       km["goal"]?.["scope"] || km["scope"]?.["description"] || "",
      hasAnalysis: !!(proj as any).last_analysis,
      audits: audits.map((a: any) => ({
        kind: "audit", refId: a?.id,
        label: `Audit ${(a?.created_at || "").split("T")[0] || "recent"} — score ${auditScore(a) ?? "n/a"}`,
      })),
      algorithm: algo.map((a: any) => ({
        kind: "algorithm", refId: a?.id, label: a?.topic || "Algorithm topic",
      })),
      brain: brain.map((b: any) => ({
        kind: "brain_learning", refId: b?.id, label: b?.card_title || "Learning",
      })),
      competitors: competitors.map((c: string) => ({ kind: "competitor", label: c })),
      keywords,
      sales:       [] as any[],
      clientNotes: [] as any[],
      gaps,
    };
    return { success: true, context };
  } catch (e: any) {
    return { success: false, error: e?.message || "unknown" };
  }
}/* ════════════════════════════════════════════════════
   3. AI CARD GENERATION
   Turn gathered intelligence into a set of task cards.
════════════════════════════════════════════════════ */
async function pmGenerateCards(projectId: string) {
  const gathered = await pmGatherRequirements(projectId);
  if (!gathered.success) return gathered;
  const ctx = (gathered as any).context;

  /* Pull the actual audit + brain detail for the prompt. */
  const [auditDetailR, brainDetailR] = await Promise.allSettled([
    db().from("audit_reports").select("sections").eq("project_id", projectId)
      .order("created_at", { ascending: false }).limit(1),
    db().from("brain_learnings").select("card_type,card_title,improvement,what_missed")
      .eq("status", "active").order("applied_count", { ascending: false }).limit(8),
  ]);
  const auditSections = auditDetailR.status === "fulfilled"
    ? (auditDetailR.value?.data?.[0]?.sections || {}) : {};
  const brainDetail = brainDetailR.status === "fulfilled"
    ? (brainDetailR.value?.data || []) : [];

  const prompt = [
    "Create a set of SEO project task cards for this project.",
    "",
    `PROJECT: ${ctx.projectName} | URL: ${ctx.url || "not set"}`,
    `GOAL: ${ctx.goal || "not set"}`,
    `SCOPE: ${ctx.scope || "not set"}`,
    ctx.gaps.length ? `KNOWN DATA GAPS: ${ctx.gaps.join("; ")}` : "",
    "",
    "AUDIT FINDINGS:",
    Object.keys(auditSections).length
      ? Object.entries(auditSections).map(([k, v]) => `- ${k}: ${String(v).slice(0, 300)}`).join("\n")
      : "- No audit data available. Base technical cards on best practice and mark them [ASSUMPTION].",
    "",
    "BRAIN LEARNINGS (apply these — past lessons):",
    brainDetail.length
      ? brainDetail.map((b: any) => `- [${b.card_type}] ${b.card_title}: ${b.improvement || ""}`).join("\n")
      : "- None yet.",
    "",
    "Produce 8-14 task cards covering the project comprehensively. Each card must be a",
    "concrete, single unit of work that moves the project toward its goal.",
    "",
    'Return ONLY a raw JSON array, no markdown:',
    '[{',
    '  "type": "quick-win|technical|content|geo|competitive|insight|weekly|kpi",',
    '  "title": "concise action title",',
    '  "content": "what to do and why — specific, references the audit/goal where relevant",',
    '  "priority": "high|medium|low",',
    '  "week": 1-5,',
    '  "requirements": ["what is needed before this can start"],',
    '  "source_label": "which finding/goal this card came from"',
    "}]",
    "",
    "Do not invent audit numbers. If a card rests on an assumption, say so in content.",
  ].filter(Boolean).join("\n");

  try {
    const resp = await ai().messages.create({
      model: MODEL, max_tokens: 4000, system: PM_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (resp.content[0] as any)?.text || "[]";
    const parsed = parseJSON(raw);
    if (!Array.isArray(parsed)) return { success: false, error: "AI did not return a card list", cards: [] };

    /* Persist each generated card to kanban_tasks. */
    const saved: any[] = [];
    for (const c of parsed.slice(0, 14)) {
      const reqs = Array.isArray(c.requirements)
        ? c.requirements.map((label: string, i: number) => ({
            id: `r${i}`, label, category: "general", met: false,
          }))
        : [];
      const r = await pmSaveCard({
        projectId,
        title:        String(c.title || "Untitled task").slice(0, 200),
        description:  String(c.content || ""),
        card_type:    c.type || "custom",
        priority:     ["high", "medium", "low"].includes(c.priority) ? c.priority : "medium",
        status:       "todo",
        week:         Number(c.week) >= 1 && Number(c.week) <= 5 ? Number(c.week) : 5,
        placed:       false,
        requirements: reqs,
        source:       "ai_generated",
        source_refs:  c.source_label ? [{ kind: "scope", label: String(c.source_label) }] : [],
        tags:         ["ai-generated"],
      });
      if (r.success && r.card) saved.push(r.card);
    }
    return { success: true, cards: saved, generated: saved.length };
  } catch (e: any) {
    return { success: false, error: e?.message || "AI generation failed", cards: [] };
  }
}

/* ════════════════════════════════════════════════════
   4. ENHANCE A SINGLE CARD
════════════════════════════════════════════════════ */
async function pmEnhanceCard(card: any) {
  if (!card?.id) return { success: false, error: "card id required" };
  const prompt = [
    "Improve this SEO task card so a non-technical project manager can act on it confidently.",
    "",
    `TYPE: ${card.card_type || "custom"} | PRIORITY: ${card.priority || "medium"}`,
    `TITLE: ${card.title || ""}`,
    `CURRENT DESCRIPTION: ${card.description || "(empty)"}`,
    "",
    "Sharpen the title, make the description specific and actionable, and list precise",
    "prerequisites. Do not invent data.",
    "",
    'Return ONLY raw JSON: {"title":"...","content":"...","requirements":["..."]}',
  ].join("\n");

  try {
    const resp = await ai().messages.create({
      model: MODEL, max_tokens: 1500, system: PM_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const parsed = parseJSON((resp.content[0] as any)?.text || "{}");
    if (!parsed) return { success: false, error: "AI returned no usable result" };
    const reqs = Array.isArray(parsed.requirements)
      ? parsed.requirements.map((label: string, i: number) => ({
          id: `r${i}`, label, category: "general", met: false,
        }))
      : card.requirements;
    return pmSaveCard({
      id:           card.id,
      title:        parsed.title || card.title,
      description:  parsed.content || card.description,
      requirements: reqs,
      tags:         [...new Set([...(card.tags || []), "ai-enhanced"])],
    });
  } catch (e: any) {
    return { success: false, error: e?.message || "enhance failed" };
  }
}

/* ════════════════════════════════════════════════════
   5. DEPENDENCY ANALYSIS
════════════════════════════════════════════════════ */
async function pmAnalyzeDependencies(projectId: string) {
  const got = await pmGetCards(projectId);
  if (!got.success) return got;
  const cards = (got as any).cards as any[];
  if (cards.length < 2) return { success: true, analysis: [] };

  const list = cards.map((c) =>
    `${c.id} | [${c.card_type}] ${c.title}`).join("\n");
  const prompt = [
    "Analyse task interdependencies for this SEO project.",
    "For each task, identify which OTHER tasks must complete before it can start.",
    "Apply SEO sequencing logic: technical fixes before content; content before GEO;",
    "foundation before competitive moves.",
    "",
    "TASKS (id | type | title):",
    list,
    "",
    'Return ONLY a raw JSON array: [{"cardId":"<id>","dependsOn":["<id>",...]}]',
    "Only include tasks that genuinely have prerequisites. Empty dependsOn is fine.",
  ].join("\n");

  try {
    const resp = await ai().messages.create({
      model: MODEL, max_tokens: 2000, system: PM_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const parsed = parseJSON((resp.content[0] as any)?.text || "[]");
    if (!Array.isArray(parsed)) return { success: true, analysis: [] };

    /* Persist depends_on back onto each card. */
    const valid = new Set(cards.map((c) => c.id));
    for (const a of parsed) {
      if (!valid.has(a.cardId)) continue;
      const deps = Array.isArray(a.dependsOn)
        ? a.dependsOn.filter((d: string) => valid.has(d) && d !== a.cardId) : [];
      await pmSaveCard({ id: a.cardId, depends_on: deps });
    }
    return { success: true, analysis: parsed };
  } catch (e: any) {
    return { success: false, error: e?.message || "dependency analysis failed", analysis: [] };
  }
}

/* ════════════════════════════════════════════════════
   6. SAVE EXECUTION RESULT
   (the streaming execute itself is handled in task-engine.ts,
    reusing its existing streaming `execute` infrastructure)
════════════════════════════════════════════════════ */
async function pmSaveExecution(opts: { cardId: string; mode: string; role: string; output: string }) {
  if (!opts.cardId) return { success: false, error: "cardId required" };
  return pmSaveCard({
    id:             opts.cardId,
    execution_mode: opts.mode,
    executed_role:  opts.role,
    output:         opts.output,
    status:         "review",
  });
}

/* ════════════════════════════════════════════════════
   7. VERIFY A CARD
════════════════════════════════════════════════════ */
async function pmVerifyCard(cardId: string, notes: string) {
  if (!cardId) return { success: false, error: "cardId required" };
  try {
    const { data, error } = await db().from("kanban_tasks")
      .update({
        status:       "verified",
        verified_at:  new Date().toISOString(),
        verify_notes: notes || null,
        updated_at:   new Date().toISOString(),
      })
      .eq("id", cardId).select(CARD_COLS).single();
    if (error) return { success: false, error: error.message };
    return { success: true, card: data };
  } catch (e: any) {
    return { success: false, error: e?.message || "verify failed" };
  }
}

/* ════════════════════════════════════════════════════
   8. TASK REPORT  (for client dashboards / invoicing)
════════════════════════════════════════════════════ */
async function pmTaskReport(projectId: string, range: string) {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const since = range === "daily"
      ? new Date(Date.now() - 864e5).toISOString()
      : new Date(Date.now() - 30 * 864e5).toISOString();

    const { data: cards } = await db().from("kanban_tasks")
      .select("title,card_type,status,executed_at,verified_at,invoice_item,output")
      .eq("project_id", projectId)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false }).limit(100);

    const rows = cards || [];
    const completed = rows.filter((c: any) => ["done", "verified"].includes(c.status));
    const inProgress = rows.filter((c: any) => ["doing", "review"].includes(c.status));
    const billable = completed.filter((c: any) => c.invoice_item);

    const report = {
      generated_at: new Date().toISOString(),
      range,
      summary: {
        total:       rows.length,
        completed:   completed.length,
        in_progress: inProgress.length,
        billable:    billable.length,
      },
      completed_tasks:   completed.map((c: any) => ({ title: c.title, type: c.card_type })),
      in_progress_tasks: inProgress.map((c: any) => ({ title: c.title, type: c.card_type })),
    };

    /* Stamp reported_at on the cards included. */
    await db().from("kanban_tasks")
      .update({ reported_at: new Date().toISOString() })
      .eq("project_id", projectId).gte("updated_at", since);

    return { success: true, report };
  } catch (e: any) {
    return { success: false, error: e?.message || "report failed" };
  }
}

/* ════════════════════════════════════════════════════
   DISPATCHER — called from task-engine.ts
   Returns null if the action is not a PM action.
════════════════════════════════════════════════════ */
export async function handlePM(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "pm_get_cards":             return pmGetCards(body.projectId);
    case "pm_save_card":             return pmSaveCard(body.card || {});
    case "pm_delete_card":           return pmDeleteCard(body.cardId);
    case "pm_gather_requirements":   return pmGatherRequirements(body.projectId);
    case "pm_generate_cards":        return pmGenerateCards(body.projectId);
    case "pm_enhance_card":          return pmEnhanceCard(body.card || {});
    case "pm_analyze_dependencies":  return pmAnalyzeDependencies(body.projectId);
    case "pm_save_execution":        return pmSaveExecution(body);
    case "pm_verify_card":           return pmVerifyCard(body.cardId, body.notes);
    case "pm_task_report":           return pmTaskReport(body.projectId, body.range || "on_demand");
    default:                         return null;
  }
}

/* The streaming pm_execute_card prompt builder — used by task-engine.ts,
   which owns the streaming response. Returns the prompt + system text. */
export function buildExecutePrompt(opts: {
  card: any; mode: string; role: string;
  userInputs: Record<string, string>; context: any; brainLearnings: any[];
}): { system: string; prompt: string } {
  const { card, mode, role, userInputs, context, brainLearnings } = opts;

  const ROLE_VOICE: Record<string, string> = {
    senior_seo:      "Act as a senior SEO strategist — algorithm reasoning, ranking factors, E-E-A-T.",
    content_writer:  "Act as a content writer — exact structure, keywords, tone, internal links.",
    team_lead:       "Act as a team lead — numbered steps, owners, blockers, definition of done.",
    project_manager: "Act as a project manager — deliverable spec, acceptance criteria, dependencies.",
    executive:       "Act as an executive — business outcomes, ROI, what to decide.",
    biz_dev:         "Act as a biz dev manager — client value, proof points, commercial framing.",
  };

  const learnings = brainLearnings?.length
    ? "BRAIN LEARNINGS — APPLY THESE PAST LESSONS:\n" +
      brainLearnings.map((l: any, i: number) =>
        `  [${i + 1}] ${l.card_type} | ${l.card_title}` +
        (l.improvement ? ` → ${l.improvement}` : "")).join("\n")
    : "";

  const inputs = Object.keys(userInputs || {}).length
    ? "PROJECT MANAGER PROVIDED:\n" +
      Object.entries(userInputs).map(([k, v]) => `  ${k}: ${v}`).join("\n")
    : "";

  const modeInstruction = mode === "ai_execute"
    ? [
        "MODE: AI EXECUTE — perform the task now and produce the finished work product",
        "(the actual code, content draft, schema, analysis, etc.). It must be complete,",
        "copy-paste ready, and fact-checked. Flag every assumption with [ASSUMPTION].",
      ].join("\n")
    : [
        "MODE: HUMAN GUIDE — write a complete step-by-step guide so a non-technical team",
        "member can do this task themselves. Number every step. Name every tool, setting,",
        "and where to click. State what 'done' looks like and what to check.",
      ].join("\n");

  const prompt = [
    ROLE_VOICE[role] || ROLE_VOICE.senior_seo,
    "",
    modeInstruction,
    "",
    `TASK: [${(card.card_type || "task").toUpperCase()}] ${card.title}`,
    card.description ? `DETAIL: ${card.description}` : "",
    "",
    "PROJECT CONTEXT:",
    `  Company: ${context?.project?.name || "Unknown"} | URL: ${context?.project?.url || "not set"}`,
    `  Goal: ${context?.goals?.primary || "not set"}`,
    `  CMS: ${context?.tech?.cms || "not recorded"}`,
    inputs,
    learnings,
    "",
    "End with 'Manav's Take' — one honest sentence on what to watch.",
  ].filter(Boolean).join("\n");

  return { system: PM_SYSTEM, prompt };
}
