/* ═══════════════════════════════════════════════════════════
   Server-side Brain Context Builder.

   Fetches everything a project needs in one parallel call.
   Returns a strongly-typed BrainContext usable in:
   - AI system/user prompts (via formatContextForPrompt)
   - Pipeline decisions
   - Monitoring dashboards

   Usage:
     const ctx = await buildBrainContext(projectId);
     const { system, user } = formatContextForPrompt(ctx, question);
═══════════════════════════════════════════════════════════ */

import { db } from "./db";
import type {
  BrainContext, ProjectMetrics, AuditSummary,
  LearningSummary, AlgoTopic, TaskSummary, ContextGaps,
} from "./types";

function safeStr(v: any): string { return v == null ? "" : String(v); }

function computeBrainScore(ctx: Partial<BrainContext>): number {
  let s = 0;
  if (ctx.cms)                          s += 15;
  if ((ctx.keywords || []).length >= 3) s += 15;
  if (ctx.goals)                        s += 10;
  if (ctx.url)                          s += 10;
  if ((ctx.competitors || []).length >= 1) s += 10;
  if (ctx.metrics)                      s += 15;
  if (ctx.latestAudit)                  s += 10;
  const ln = (ctx.learnings || []).length;
  if (ln >= 20) s += 15;
  else if (ln >= 10) s += 10;
  else if (ln >= 3) s += 5;
  return Math.min(s, 100);
}

export async function buildBrainContext(projectId: string): Promise<BrainContext> {
  const [projR, metricsR, auditR, knowledgeR, learningsR, algoR, tasksR] =
    await Promise.allSettled([
      db().from("projects")
        .select("id,name,url,industry,country,cms,keywords,competitors,goals,client_id,playground_canvas,playground_strategy")
        .eq("id", projectId).single(),
      db().from("metrics")
        .select("llm_visibility_score,algorithm_health_score,eeat_score,content_authority_score,overall_growth_score,pages_indexed,pages_submitted,brand_mentions,recorded_at")
        .eq("project_id", projectId).order("recorded_at", { ascending: false }).limit(1),
      db().from("audit_reports")
        .select("id,created_at,score,sections")
        .eq("project_id", projectId).order("created_at", { ascending: false }).limit(1),
      db().from("project_knowledge")
        .select("category,field_key,field_value")
        .eq("project_id", projectId),
      db().from("brain_learnings")
        .select("id,card_type,card_title,improvement,confidence_score,applied_count,tags,what_worked,what_missed")
        .eq("project_id", projectId).eq("status", "active")
        .order("applied_count", { ascending: false }).order("confidence_score", { ascending: false })
        .limit(15),
      db().from("algorithm_knowledge")
        .select("id,topic,summary,freshness_score,updated_at")
        .order("freshness_score", { ascending: false }).limit(10),
      db().from("task_executions")
        .select("id,task_type,status,created_at")
        .eq("project_id", projectId).order("created_at", { ascending: false }).limit(10),
    ]);

  const get = <T>(r: PromiseSettledResult<any>, fallback: T): T =>
    r.status === "fulfilled" ? (r.value?.data ?? fallback) : fallback;
  const getOne = <T>(r: PromiseSettledResult<any>, fallback: T): T =>
    r.status === "fulfilled" ? (r.value?.data ?? fallback) : fallback;

  const proj      = getOne<any>(projR,      null);
  const metricsRaw= get<any[]>(metricsR,   []);
  const auditRaw  = get<any[]>(auditR,     []);
  const knowledge = get<any[]>(knowledgeR, []);
  const learningsRaw = get<any[]>(learningsR, []);
  const algoRaw   = get<any[]>(algoR,      []);
  const tasksRaw  = get<any[]>(tasksR,     []);

  /* ── Build project_knowledge map ── */
  const kMap: Record<string, Record<string, string>> = {};
  for (const row of knowledge) {
    if (!kMap[row.category]) kMap[row.category] = {};
    kMap[row.category][row.field_key] = row.field_value || "";
  }
  const km = (cat: string, key: string) => kMap[cat]?.[key] || "";

  /* ── Metrics ── */
  const m = metricsRaw[0] ?? null;
  const metrics: ProjectMetrics | null = m ? {
    llmVisibility:   m.llm_visibility_score   ?? null,
    algorithmHealth: m.algorithm_health_score ?? null,
    eeat:            m.eeat_score             ?? null,
    authority:       m.content_authority_score ?? null,
    growth:          m.overall_growth_score   ?? null,
    indexed:         m.pages_indexed          ?? null,
    submitted:       m.pages_submitted        ?? null,
    mentions:        m.brand_mentions         ?? null,
    recordedAt:      m.recorded_at            || "",
  } : null;

  /* ── Latest audit ── */
  const a = auditRaw[0] ?? null;
  const latestAudit: AuditSummary | null = a ? {
    id:       a.id,
    date:     (a.created_at || "").split("T")[0],
    score:    a.score ?? null,
    sections: Object.fromEntries(
      Object.entries(a.sections || {}).map(([k, v]) => [k, safeStr(v).slice(0, 400)])
    ),
  } : null;

  /* ── Learnings ── */
  const learnings: LearningSummary[] = (learningsRaw || []).map((l: any) => ({
    id:               l.id,
    card_type:        l.card_type        || "insight",
    card_title:       l.card_title       || "",
    improvement:      l.improvement      || "",
    confidence_score: l.confidence_score ?? 65,
    applied_count:    l.applied_count    ?? 0,
    tags:             Array.isArray(l.tags) ? l.tags : [],
    what_worked:      Array.isArray(l.what_worked) ? l.what_worked : [],
    what_missed:      Array.isArray(l.what_missed) ? l.what_missed : [],
  }));

  /* ── Algorithm topics ── */
  const algoTopics: AlgoTopic[] = (algoRaw || []).map((a: any) => ({
    id:              a.id,
    topic:           a.topic           || "",
    summary:         a.summary         || "",
    freshness_score: a.freshness_score ?? 5,
    impact_level:    a.freshness_score >= 7 ? "high" : a.freshness_score >= 4 ? "medium" : "low",
    engine:          "google",
  }));

  /* ── Tasks ── */
  const tasks: TaskSummary[] = (tasksRaw || []).map((t: any) => ({
    id:         t.id,
    task_type:  t.task_type  || "",
    status:     t.status     || "",
    created_at: t.created_at || "",
  }));

  /* ── Canvas ── */
  const canvas: any[] = Array.isArray(proj?.playground_canvas)
    ? proj.playground_canvas
    : (proj?.playground_strategy?.canvas_blocks || []);

  /* ── Gaps ── */
  const gaps: ContextGaps = {
    noGoal:        !km("goal","primary_goal") && !proj?.goals,
    noCMS:         !km("cms","cms")          && !proj?.cms,
    noAnalytics:   !km("analytics","organic_sessions_monthly"),
    noCompetitors: !(proj?.competitors?.length) && !km("competitor","competitor_1"),
    noMetrics:     !metrics,
    noAudit:       !latestAudit,
    noLearnings:   learnings.length === 0,
  };

  const ctx: BrainContext = {
    projectId:      proj?.id            || projectId,
    projectName:    proj?.name          || "",
    clientName:     "",  // filled by callers who have client data
    url:            proj?.url           || km("cms","url") || "",
    industry:       proj?.industry      || km("goal","industry") || "",
    country:        proj?.country       || km("analytics","country") || "",
    cms:            proj?.cms           || km("cms","cms") || "",
    seoPlugin:      proj?.seo_plugin    || km("cms","seo_plugin") || "",
    keywords:       (proj?.keywords     || []).filter(Boolean).slice(0, 20),
    competitors:    (proj?.competitors  || []).filter(Boolean).slice(0, 10),
    goals:          proj?.goals         || km("goal","primary_goal") || "",
    targetTimeline: km("goal","target_timeline"),
    metrics,
    latestAudit,
    learnings,
    algoTopics,
    tasks,
    canvas,
    analytics: {
      organicMonthly:  km("analytics","organic_sessions_monthly"),
      gscClicks:       km("analytics","gsc_total_clicks"),
      gscImpressions:  km("analytics","gsc_total_impressions"),
      gscAvgPosition:  km("analytics","gsc_avg_position"),
      topPages:        km("analytics","top_landing_pages"),
    },
    tech: {
      cms:           km("cms","cms")            || proj?.cms || "",
      seoPlugin:     km("cms","seo_plugin")     || "",
      hosting:       km("cms","hosting")        || "",
      pagespdMobile: km("cms","pagespeed_mobile") || "",
      pagespdDesk:   km("cms","pagespeed_desktop") || "",
    },
    competitorData: {
      c1:    km("competitor","competitor_1") || (proj?.competitors?.[0] || ""),
      c1dr:  km("competitor","competitor_1_dr") || "",
      c2:    km("competitor","competitor_2") || (proj?.competitors?.[1] || ""),
      ourDR: km("competitor","our_domain_rating") || "",
      ourRD: km("competitor","our_referring_domains") || "",
      gaps:  km("competitor","content_gap_keywords") || "",
    },
    gaps,
    brainScore: 0,
  };
  ctx.brainScore = computeBrainScore(ctx);
  return ctx;
}

/* ── Format context as AI-ready prompt sections ── */
export function formatContextForPrompt(ctx: BrainContext, question: string): {
  system: string;
  user:   string;
} {
  const m = ctx.metrics;
  const projectLines = [
    `PROJECT: ${ctx.projectName} | URL: ${ctx.url || "Not set"}`,
    ctx.clientName ? `CLIENT: ${ctx.clientName}` : "",
    `INDUSTRY: ${ctx.industry || "Not set"} | COUNTRY: ${ctx.country || "Not set"}`,
    `GOAL: ${ctx.goals || "Not set"} | Timeline: ${ctx.targetTimeline || "Not set"}`,
    `KEYWORDS: ${ctx.keywords.join(", ") || "Not set"}`,
    `COMPETITORS: ${ctx.competitors.join(", ") || "Not set"}`,
    `CMS: ${ctx.cms || "Not set"} | SEO Plugin: ${ctx.seoPlugin || "Not set"}`,
    m
      ? `SCORES: LLM ${m.llmVisibility}/100 | Health ${m.algorithmHealth}/100 | EEAT ${m.eeat}/100 | Authority ${m.authority}/100 | Growth ${m.growth}/100`
      : "SCORES: Not yet recorded",
    m
      ? `TECHNICAL: ${m.indexed} indexed / ${m.submitted} submitted | Mentions: ${m.mentions}`
      : "",
    ctx.analytics.organicMonthly
      ? `ANALYTICS: Organic ${ctx.analytics.organicMonthly}/mo | GSC Clicks: ${ctx.analytics.gscClicks}`
      : "",
  ].filter(Boolean).join("\n");

  const auditLines = ctx.latestAudit
    ? `LATEST AUDIT (${ctx.latestAudit.date}):\n` +
      Object.entries(ctx.latestAudit.sections)
        .map(([k, v]) => `  ${k}: ${v.slice(0, 200)}`)
        .join("\n")
    : "AUDIT: No audit run yet.";

  const learningsLines = ctx.learnings.length > 0
    ? ctx.learnings.map((l, i) => [
        `[${i + 1}] ${l.card_type.toUpperCase()} | Applied: ${l.applied_count}x | Confidence: ${l.confidence_score}/100`,
        `    Title: "${l.card_title}"`,
        l.what_worked.length ? `    ✓ Works: ${l.what_worked.slice(0, 2).join(" | ")}` : "",
        l.what_missed.length ? `    ✗ Gaps: ${l.what_missed.slice(0, 2).join(" | ")}` : "",
        `    → Apply: ${l.improvement || "—"}`,
        l.tags.length ? `    Tags: ${l.tags.slice(0, 4).join(", ")}` : "",
      ].filter(Boolean).join("\n")).join("\n---\n")
    : "No active learnings yet.";

  const algoLines = ctx.algoTopics.length > 0
    ? ctx.algoTopics.map(a =>
        `• [${a.impact_level.toUpperCase()}] ${a.topic}: ${a.summary.slice(0, 100)}`
      ).join("\n")
    : "No algorithm topics saved yet.";

  const canvasLines = (() => {
    const placed = ctx.canvas.filter((b: any) => b.placed);
    if (!placed.length) return "Canvas is empty.";
    return [1, 2, 3, 4, 5].map(w => {
      const wb = placed.filter((b: any) => b.week === w);
      if (!wb.length) return "";
      return `Week ${w === 5 ? "Backlog" : w} (${wb.length}): ${wb.map((b: any) => `[${b.type}|${b.status}] "${b.title}"`).join(", ")}`;
    }).filter(Boolean).join("\n");
  })();

  const gapWarnings = Object.entries(ctx.gaps)
    .filter(([, v]) => v)
    .map(([k]) => ({
      noGoal:        "⚠ No campaign goal — direct user to /data-room",
      noCMS:         "⚠ CMS not recorded — direct user to /data-room",
      noAnalytics:   "⚠ No analytics baseline — direct user to /data-room",
      noCompetitors: "⚠ No competitors set — ask user to add them",
      noMetrics:     "⚠ No scores recorded — run an audit first",
      noAudit:       "⚠ No audit run yet — direct to /audit",
      noLearnings:   "⚠ No learnings saved — Brain is starting from scratch",
    }[k] || ""))
    .filter(Boolean);

  const system = `You are MANAV BRAIN — the master intelligence of SEO Season. World-class SEO strategist, technical expert, GEO specialist, and the operational brain of this software.

BRAIN SCORE: ${ctx.brainScore}/100 — how well I know this project.
${gapWarnings.length ? `\nKNOWLEDGE GAPS:\n${gapWarnings.join("\n")}` : ""}

RULES:
1. FACTS ONLY: Never state a metric or statistic not in the data provided. Flag every assumption.
2. APPLY LEARNINGS: Reference at minimum 1 Brain Learning per response. State which and why.
3. USE ACTIONS: Emit ⟦ACTION⟧ tags to execute real operations — navigate, save, add card, fetch.
4. SAVE INSIGHTS: When you discover something new — emit save_learning ACTION tags immediately.
5. ESCALATE GAPS: Name the exact page to fix missing data and what specifically to add.
6. END WITH NEXT ACTION: Every response ends with one specific, executable next action.
7. AUTO-APPROVAL: Technical facts / audit findings / confirmed signals → confidence ≥ 85. Hypotheses → 65-79.
8. NO DUPLICATION: Check existing learnings before saving. Update instead of duplicating.

EXECUTABLE ACTIONS:
Navigate:      ⟦ACTION⟧{"type":"navigate","path":"/playground","label":"Open Strategy Canvas"}⟦/ACTION⟧
Save learning: ⟦ACTION⟧{"type":"save_learning","cardType":"technical","title":"...","improvement":"...","whatWorked":[],"whatMissed":[],"summary":"...","tags":[],"label":"Save Learning"}⟦/ACTION⟧
Save multiple: ⟦ACTION⟧{"type":"save_multiple_learnings","learnings":[...],"label":"Save Learnings"}⟦/ACTION⟧
Add card:      ⟦ACTION⟧{"type":"add_card","cardType":"technical","title":"...","content":"...","priority":"high","week":1,"label":"Add Card"}⟦/ACTION⟧
Fetch URL:     ⟦ACTION⟧{"type":"fetch_url","url":"https://...","label":"Fetch page"}⟦/ACTION⟧
Run audit:     ⟦ACTION⟧{"type":"run_audit","url":"https://...","label":"Run SEO Audit"}⟦/ACTION⟧`;

  const user = [
    "PROJECT INTELLIGENCE:",
    projectLines,
    "",
    "LATEST AUDIT:",
    auditLines,
    "",
    `CANVAS STATE:`,
    canvasLines,
    "",
    `BRAIN LEARNINGS (${ctx.learnings.length} active):`,
    learningsLines,
    "",
    `ALGORITHM KNOWLEDGE (${ctx.algoTopics.length} topics):`,
    algoLines,
    "",
    `USER REQUEST: ${question}`,
  ].join("\n");

  return { system, user };
}
