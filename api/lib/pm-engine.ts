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
import { TOPIC_CATALOG } from "./algo-catalog.js";
import { getTopicsDepth } from "./algo-depth.js";

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
  "",
  "STRATEGIC USE OF CONTEXT (when provided):",
  "- CLIENT IDENTITY (industry, model, lifecycle, offering, UVP): every output must feel",
  "  client-specific, not generic SEO advice. Ground recommendations in their business.",
  "- AUDIENCE (ICP, personas, funnel focus, search intent): tailor language and depth to",
  "  the actual buyer. A persona-aware output beats a generic one every time.",
  "- CONTENT (brand voice, tone words, prohibited topics, required disclaimers): these are",
  "  HARD constraints. Match the brand voice. Never violate prohibited topics. Surface",
  "  required disclaimers in any content output.",
  "- ANTI-GOALS: respect these as forbidden zones — never suggest work that violates them.",
  "- HISTORY (prior agency, what worked, what failed, penalties, migrations): do not repeat",
  "  documented mistakes. Acknowledge documented wins. Penalties demand extra caution on",
  "  recommendations that could re-trigger them.",
  "- CAPACITY (content hours/week, link building hours/month, retainer hours): your",
  "  recommendations must fit the available capacity. Do not propose 40 hours of work to",
  "  a team with 8 hours/week.",
  "- COMMERCIAL (engagement type, report audience, deliverables expected): the report",
  "  audience (e.g. CMO vs Founder) calibrates depth and tone of any client-facing output.",
  "- VALUE PER LEAD / LTV: if provided, USE these to express SEO impact in revenue terms,",
  "  not just traffic. ROI claims become real when grounded in conversion economics.",
  "- ABSENT CONTEXT: when V2 sections are not provided (empty), the project is in early",
  "  setup. Default to safe, broadly-applicable recommendations and flag what would unlock",
  "  better strategy if filled.",
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
    const [projR, auditR, algoR, brainR, knowledgeR, docsR, crawlR] =
      await Promise.allSettled([
        db().from("projects").select("*").eq("id", projectId).maybeSingle(),
        db().from("audit_reports").select("*")
          .eq("project_id", projectId).order("created_at", { ascending: false }).limit(5),
        db().from("algorithm_knowledge")
          .select("*")
          .order("updated_at", { ascending: false }).limit(8),
        db().from("brain_learnings")
          .select("id,card_type,card_title,improvement,project_id")
          .eq("status", "active").order("applied_count", { ascending: false }).limit(40),
        db().from("project_knowledge")
          .select("category,field_key,field_value")
          .eq("project_id", projectId),
        db().from("project_documents")
          .select("*")
          .eq("project_id", projectId).order("created_at", { ascending: false }).limit(10),
        db().from("crawled_pages")
          .select("url,page_analysis,crawl_status,crawled_at")
          .eq("project_id", projectId).order("crawled_at", { ascending: false }).limit(40),
      ]);

    let projError = "";
    if (projR.status === "rejected")
      projError = String((projR as any).reason?.message || (projR as any).reason || "projects query rejected");
    else if (projR.value?.error)
      projError = String(projR.value.error.message || projR.value.error);

    const val = (r: PromiseSettledResult<any>) =>
      r.status === "fulfilled" ? r.value?.data : null;

    const proj      = val(projR) || {};
    const audits    = Array.isArray(val(auditR))     ? val(auditR)     : [];
    const algo      = Array.isArray(val(algoR))      ? val(algoR)      : [];
    const brainAll  = Array.isArray(val(brainR))     ? val(brainR)     : [];
    const knowledge = Array.isArray(val(knowledgeR)) ? val(knowledgeR) : [];
    const docs      = Array.isArray(val(docsR))      ? val(docsR)      : [];
    const crawl     = Array.isArray(val(crawlR))     ? val(crawlR)     : [];

    const brainOwn = brainAll.filter((b: any) => b && b.project_id === projectId);
    const brain    = (brainOwn.length ? brainOwn : brainAll).slice(0, 12);

    /* ── Data Room: project_knowledge -> category -> {field_key: value} ── */
    const km: Record<string, Record<string, string>> = {};
    for (const k of knowledge) {
      if (!k || !k.category) continue;
      if (!km[k.category]) km[k.category] = {};
      km[k.category][k.field_key] = k.field_value || "";
    }
    const dr = (cat: string, key: string) => km[cat]?.[key] || "";

    /* ── Piece 4: prefer fresh GSC snapshot over project_knowledge ──
       If GSC is connected and the latest snapshot is < 7 days old,
       use those numbers — they're the live source of truth. The
       mirror keeps project_knowledge in sync but a race or a stale
       pull could still leave Data Room behind; this guarantees the
       gather is always fresh. */
    let gscFresh: { clicks: string; impressions: string; position: string; ctr: string; capturedAt: string } | null = null;
    let gscStaleDays: number | null = null;
    try {
      const { data: latestGsc } = await db().from("metrics_snapshots")
        .select("gsc_clicks,gsc_impressions,gsc_avg_position,extras,captured_at")
        .eq("project_id", projectId)
        .not("gsc_clicks", "is", null)
        .order("captured_at", { ascending: false }).limit(1).maybeSingle();
      if (latestGsc) {
        const ageDays = (Date.now() - new Date((latestGsc as any).captured_at).getTime()) / 86_400_000;
        gscStaleDays = Math.floor(ageDays);
        if (ageDays <= 7) {
          gscFresh = {
            clicks:      String((latestGsc as any).gsc_clicks ?? ""),
            impressions: String((latestGsc as any).gsc_impressions ?? ""),
            position:    Number((latestGsc as any).gsc_avg_position ?? 0).toFixed(2),
            ctr:         (latestGsc as any).extras?.gsc_ctr != null
                          ? (Number((latestGsc as any).extras.gsc_ctr) * 100).toFixed(2) + "%"
                          : "",
            capturedAt:  (latestGsc as any).captured_at,
          };
        }
      }
    } catch { /* non-fatal */ }

    /* ── Same logic for GA4 (Phase E): if fresh, use it for analytics fields. */
    let ga4Fresh: { sessions: string; conversions: string; bounceRate: string; capturedAt: string } | null = null;
    let ga4StaleDays: number | null = null;
    try {
      const { data: latestGa4 } = await db().from("metrics_snapshots")
        .select("organic_sessions,conversions,bounce_rate,extras,captured_at")
        .eq("project_id", projectId)
        .not("organic_sessions", "is", null)
        .order("captured_at", { ascending: false }).limit(1).maybeSingle();
      if (latestGa4) {
        const ageDays = (Date.now() - new Date((latestGa4 as any).captured_at).getTime()) / 86_400_000;
        ga4StaleDays = Math.floor(ageDays);
        if (ageDays <= 7) {
          ga4Fresh = {
            sessions:    String((latestGa4 as any).organic_sessions ?? ""),
            conversions: String((latestGa4 as any).conversions ?? ""),
            bounceRate:  (latestGa4 as any).bounce_rate != null
                          ? Number((latestGa4 as any).bounce_rate).toFixed(2) + "%"
                          : "",
            capturedAt:  (latestGa4 as any).captured_at,
          };
        }
      }
    } catch { /* non-fatal */ }

    /* helper: prefer fresh GSC + GA4 for analytics fields when available */
    const analyticsField = (key: string): string => {
      if (gscFresh) {
        if (key === "gsc_total_clicks")      return gscFresh.clicks;
        if (key === "gsc_total_impressions") return gscFresh.impressions;
        if (key === "gsc_avg_position")      return gscFresh.position;
        if (key === "gsc_ctr")               return gscFresh.ctr;
      }
      if (ga4Fresh) {
        if (key === "organic_sessions_monthly") return ga4Fresh.sessions;
        if (key === "conversions_monthly")      return ga4Fresh.conversions;
        if (key === "bounce_rate")              return ga4Fresh.bounceRate;
      }
      return dr("analytics", key);
    };

    const toList = (raw: any): string[] => {
      if (Array.isArray(raw)) return raw.filter(Boolean);
      if (typeof raw === "string" && raw.trim()) {
        try { const p = JSON.parse(raw); if (Array.isArray(p)) return p.filter(Boolean); }
        catch { /* not json */ }
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
      }
      return [];
    };

    /* keywords: Data Room goal.target_keywords first, then project column */
    const keywords = toList(dr("goal", "target_keywords") || (proj as any).keywords);

    /* competitors: Data Room competitor category (named, with DR) first */
    const drComps = [
      { domain: dr("competitor", "competitor_1"), dr: dr("competitor", "competitor_1_dr") },
      { domain: dr("competitor", "competitor_2"), dr: dr("competitor", "competitor_2_dr") },
      { domain: dr("competitor", "competitor_3"), dr: "" },
    ].filter((c) => c.domain);
    const competitors = drComps.length
      ? drComps
      : toList((proj as any).competitors).map((d) => ({ domain: d, dr: "" }));

    const auditScore = (a: any) =>
      a?.score ?? a?.overall_score ?? a?.overall_confidence ?? null;
    const auditOverview = (a: any): string => {
      const s = a?.sections || {};
      const syn = s?.synthesis || a?.synthesis || {};
      if (syn?.overall_verdict && syn.overall_verdict.length > 10) return syn.overall_verdict;
      const gap = syn?.most_urgent_gap || syn?.growth_opportunities?.[0];
      return gap ? `Key gap: ${gap}` : "";
    };
    const auditWins = (a: any): string[] => {
      const syn = a?.sections?.synthesis || a?.synthesis || {};
      const out: string[] = [];
      if (syn?.biggest_verified_win) out.push(`Win: ${syn.biggest_verified_win}`);
      if (syn?.most_urgent_gap)      out.push(`Urgent: ${syn.most_urgent_gap}`);
      (syn?.growth_opportunities || []).slice(0, 2).forEach((g: string) => out.push(`Opportunity: ${g}`));
      return out;
    };

    /* Pull the real findings out of an audit's sections jsonb so the
       PM tab shows what the audit actually found — not just a score.
       sections = { technical:{data}, content:{data}, visibility:{data},
       ranking:{data}, synthesis, cross_verifications }. */
    const auditDetail = (a: any) => {
      const s = a?.sections || {};
      const syn = s?.synthesis || a?.synthesis || {};
      const txt = (v: any): string => {
        if (!v) return "";
        if (typeof v === "string") return v;
        if (Array.isArray(v)) return v.filter(Boolean).map(txt).join("; ");
        if (typeof v === "object")
          return Object.values(v).filter((x) => typeof x === "string").join("; ");
        return String(v);
      };
      /* the ranking section carries competitive intelligence */
      const rank = s?.ranking?.data || {};
      const competitive =
        txt(rank.competitor_comparison) ||
        txt(rank.competitors) ||
        txt(rank.competitive_gaps) ||
        txt(rank.serp_analysis) || "";
      return {
        verdict:     syn?.overall_verdict || "",
        biggestWin:  syn?.biggest_verified_win || "",
        urgentGap:   syn?.most_urgent_gap || "",
        strengths:   (syn?.verified_strengths || []).slice(0, 4),
        opportunities: (syn?.growth_opportunities || []).slice(0, 4),
        technical:   txt(s?.technical?.data?.summary || s?.technical?.data) .slice(0, 400),
        content:     txt(s?.content?.data?.summary || s?.content?.data).slice(0, 400),
        visibility:  txt(s?.visibility?.data?.summary || s?.visibility?.data).slice(0, 400),
        competitive: competitive.slice(0, 500),
      };
    };

    /* ── Crawl: organise pages at the keyword -> landing-page grain ──
       Each crawled page declares its content type and the keywords found
       on it (page_analysis.keyword_presence). We map page -> keyword,
       preferring an explicit target_keywords on the page, inferring from
       keyword_presence otherwise (flagged inferred). */
    const ownDomain = ((proj as any).url || "").replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
    const compDomains = competitors.map((c) =>
      c.domain.replace(/^https?:\/\//, "").split("/")[0].toLowerCase());

    const crawlPages = crawl.map((row: any) => {
      const pa = row?.page_analysis || {};
      const host = (row?.url || "").replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
      const isOwn = ownDomain && host === ownDomain;
      const isCompetitor = compDomains.includes(host);

      /* explicit page keywords if present, else inferred from keyword_presence */
      const explicitKw = toList(pa.target_keywords);
      const inferredKw = Array.isArray(pa.keyword_presence)
        ? pa.keyword_presence.filter(Boolean) : [];
      const pageKeywords = explicitKw.length ? explicitKw : inferredKw;
      const keywordsInferred = !explicitKw.length && inferredKw.length > 0;

      /* match page keywords against the project's target keyword list.
         Word-overlap, not substring — a page "targets" a keyword if
         they share a meaningful word, or the page's URL slug or found
         keywords overlap with the keyword's words. */
      const norm = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
      const slugWords = norm((row?.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/[/-]/g, " "));
      const pageWordBag = new Set<string>([
        ...pageKeywords.flatMap((pk: string) => norm(pk)),
        ...slugWords,
      ]);
      const matchedTargets = keywords.filter((k) => {
        const kw = norm(k);
        if (!kw.length) return false;
        const hits = kw.filter((w) => pageWordBag.has(w)).length;
        /* match if at least half the keyword's words appear on the page */
        return hits >= Math.ceil(kw.length / 2);
      });

      return {
        url: row?.url || "",
        owner: isOwn ? "ours" : isCompetitor ? "competitor" : "other",
        contentType: pa.content_type || "unknown",
        crawlStatus: row?.crawl_status || "unknown",
        crawledAt: row?.crawled_at || "",
        keywords: pageKeywords,
        keywordsInferred,
        targetsKeywords: matchedTargets,
        titleIssues: pa.title_issues || "",
        contentQuality: pa.content_quality || "",
        wordCount: pa.word_count ?? null,
      };
    });

    /* manual keyword -> page links from the Data Room
       (project_knowledge category "keyword_pages", field_key = keyword). */
    const manualLinks = km["keyword_pages"] || {};

    /* group: for each target keyword, our page vs competitor pages.
       A manual link always wins over inference. */
    const keywordMap = keywords.map((kw) => {
      const manualUrl = manualLinks[kw] || manualLinks[kw.toLowerCase()] || "";
      let pagesFor = crawlPages.filter((p) => p.targetsKeywords.includes(kw));
      if (manualUrl) {
        const linked = crawlPages.find((p) => p.url === manualUrl);
        if (linked && !pagesFor.includes(linked)) pagesFor = [linked, ...pagesFor];
      }
      return {
        keyword: kw,
        ourPage: (manualUrl && crawlPages.find((p) => p.url === manualUrl && p.owner === "ours"))
          || pagesFor.find((p) => p.owner === "ours") || null,
        competitorPages: pagesFor.filter((p) => p.owner === "competitor"),
        anyInferred: pagesFor.some((p) => p.keywordsInferred) && !manualUrl,
        manuallyLinked: !!manualUrl,
      };
    });

    /* crawled pages that matched NO target keyword — never hide them,
       they still carry findings and can be manually linked. */
    const matchedUrls = new Set(
      keywordMap.flatMap((k) => [
        k.ourPage?.url,
        ...k.competitorPages.map((p: any) => p.url),
      ]).filter(Boolean));
    const unmatchedPages = crawlPages.filter((p) => !matchedUrls.has(p.url));

    /* ── client lookup (industry, company) — not on the projects table ── */
    let clientName  = "";
    let clientCompany = "";
    let clientIndustry = "";
    const clientId = (proj as any)?.client_id;
    if (clientId) {
      try {
        const { data: c } = await db().from("clients")
          .select("name,company,industry").eq("id", clientId).maybeSingle();
        clientName     = (c as any)?.name || "";
        clientCompany  = (c as any)?.company || "";
        clientIndustry = (c as any)?.industry || "";
      } catch { /* missing client is non-fatal */ }
    }

    /* ── data gaps ── */
    const gaps: string[] = [];
    if (!dr("goal", "primary_goal"))
      gaps.push("No campaign goal set in the Data Room");
    if (!keywords.length)        gaps.push("No target keywords — content/GEO cards will be vague");
    if (!competitors.length)     gaps.push("No competitors recorded in the Data Room");
    if (!audits.length)          gaps.push("No audit run yet");
    if (!crawlPages.length)      gaps.push("No pages crawled — competitive comparison unavailable");
    if (!dr("access", "gsc_access")) gaps.push("Tool access not recorded — card prerequisites may be incomplete");
    if (!clientIndustry)         gaps.push("Client industry not set — outputs will be generic across vertical-specific patterns");
    if (projError)               gaps.push(`Project record could not be read: ${projError}`);

    const context = {
      projectId,
      projectName: (proj as any).name || "",
      url:         (proj as any).url || "",
      /* goal lives only in the Data Room (project_knowledge), never on
         the projects table — projects has no goals column. */
      goal:        dr("goal", "primary_goal") || "",
      scope:       dr("goal", "success_metric") || "",
      projError,
      keywords,
      /* the project brief — for the strategist's overview block */
      client: { name: clientName, company: clientCompany, industry: clientIndustry },
      baselineDate: (proj as any)?.baseline_date || "",
      currentPhase: (proj as any)?.current_phase ?? null,

      /* GSC freshness signal for the UI + narrative calibration */
      gsc: {
        connected:     !!gscFresh || gscStaleDays != null,
        fresh:         !!gscFresh,
        capturedAt:    gscFresh?.capturedAt || null,
        staleDays:     gscStaleDays,
      },

      /* GA4 freshness signal */
      ga4: {
        connected:     !!ga4Fresh || ga4StaleDays != null,
        fresh:         !!ga4Fresh,
        capturedAt:    ga4Fresh?.capturedAt || null,
        staleDays:     ga4StaleDays,
      },

      /* full Data Room, grouped by category for the UI.
         Existing keys preserved verbatim — any module already reading
         them keeps working. V2 sections (identity, audience, content,
         backlinks, commercial, history) are additive. */
      dataRoom: {
        goal: {
          primaryGoal:    dr("goal", "primary_goal"),
          /* V2 additions on existing goal section */
          primaryGoalNarrative: dr("goal", "primary_goal_narrative"),
          timeline:       dr("goal", "target_timeline"),
          successMetric:  dr("goal", "success_metric"),
          baseline:       dr("goal", "current_baseline"),
          budget:         dr("goal", "budget_monthly"),
          reportingCadence: dr("goal", "reporting_cadence"),
          secondaryGoals: dr("goal", "secondary_goals"),
          antiGoals:      dr("goal", "anti_goals"),
          reportAudience: dr("goal", "report_audience"),
        },
        tech: {
          cms:        dr("cms", "cms"),
          cmsVersion: dr("cms", "cms_version"),
          theme:      dr("cms", "theme"),
          seoPlugin:  dr("cms", "seo_plugin"),
          hosting:    dr("cms", "hosting"),
          pagespeedMobile:  dr("cms", "pagespeed_mobile"),
          pagespeedDesktop: dr("cms", "pagespeed_desktop"),
          ssl:        dr("cms", "ssl"),
        },
        access: {
          gsc:    dr("access", "gsc_access"),
          ga4:    dr("access", "ga4_access"),
          ahrefs: dr("access", "ahrefs_access"),
          cmsAdmin: dr("access", "cms_admin"),
          hosting:  dr("access", "hosting_access"),
          /* V2 additions */
          dns:                dr("access", "dns_access"),
          schemaEdit:         dr("access", "schema_edit_ability"),
          robotsEdit:         dr("access", "robots_edit_ability"),
          sitemapRegeneration: dr("access", "sitemap_regeneration"),
          deploy:             dr("access", "deploy_access"),
          notes:              dr("access", "access_notes"),
        },
        analytics: {
          organicSessions: analyticsField("organic_sessions_monthly"),
          topLandingPages: dr("analytics", "top_landing_pages"),
          bounceRate:      analyticsField("bounce_rate"),
          conversions:     analyticsField("conversions_monthly"),
          gscImpressions:  analyticsField("gsc_total_impressions"),
          gscClicks:       analyticsField("gsc_total_clicks"),
          gscPosition:     analyticsField("gsc_avg_position"),
          /* V2 additions — these enable real ROI claims in reports */
          gscCtr:               analyticsField("gsc_ctr"),
          ga4ConversionEvents:  dr("analytics", "ga4_conversion_events"),
          valuePerLead:         dr("analytics", "value_per_lead"),
          valuePerCustomer:     dr("analytics", "value_per_customer"),
          rankTrackerSource:    dr("analytics", "rank_tracker_source"),
          lastManualRankCheck:  dr("analytics", "last_manual_rank_check"),
          lastManualRankNotes:  dr("analytics", "last_manual_rank_notes"),
        },
        technical: {
          pagesIndexed:   dr("technical", "pages_indexed"),
          pagesSubmitted: dr("technical", "pages_submitted"),
          crawlErrors:    dr("technical", "crawl_errors"),
          brokenLinks:    dr("technical", "broken_links"),
          duplicateContent: dr("technical", "duplicate_content"),
          schemaMarkup:   dr("technical", "schema_markup"),
          robotsTxt:      dr("technical", "robots_txt"),
          canonicalIssues: dr("technical", "canonical_issues"),
          /* V2 additions */
          cwvLcp:          dr("technical", "cwv_lcp"),
          cwvInp:          dr("technical", "cwv_inp"),
          cwvCls:          dr("technical", "cwv_cls"),
          mobileUsability: dr("technical", "mobile_usability"),
          hreflangSetup:   dr("technical", "hreflang_setup"),
          httpsStatus:     dr("technical", "https_status"),
          jsRendering:     dr("technical", "js_rendering"),
        },

        /* ── V2 sections (added during integration foundation work) ── */
        identity: {
          clientName:        dr("identity", "client_name"),
          legalEntity:       dr("identity", "legal_entity"),
          industry:          dr("identity", "industry"),
          industrySpecific:  dr("identity", "industry_specific"),
          businessModel:     dr("identity", "business_model"),
          lifecycleStage:    dr("identity", "lifecycle_stage"),
          primaryOffering:   dr("identity", "primary_offering"),
          uniqueValueProp:   dr("identity", "unique_value_prop"),
          annualRevenue:     dr("identity", "annual_revenue"),
          geographicMarkets: dr("identity", "geographic_markets"),
          languages:         dr("identity", "languages"),
          yearFounded:       dr("identity", "year_founded"),
          headcount:         dr("identity", "headcount"),
          publicOrPrivate:   dr("identity", "public_or_private"),
        },
        audience: {
          icp:                dr("audience", "ideal_customer_profile"),
          persona1Name:       dr("audience", "persona_1_name"),
          persona1Motivations: dr("audience", "persona_1_motivations"),
          persona1Objections: dr("audience", "persona_1_objections"),
          persona2Name:       dr("audience", "persona_2_name"),
          persona2Motivations: dr("audience", "persona_2_motivations"),
          persona3Name:       dr("audience", "persona_3_name"),
          searchIntentSplit:  dr("audience", "search_intent_split"),
          funnelFocus:        dr("audience", "funnel_focus"),
          positioningStatement: dr("audience", "positioning_statement"),
        },
        content: {
          brandVoice:         dr("content", "brand_voice"),
          brandToneWords:     dr("content", "brand_tone_words"),
          readingLevel:       dr("content", "reading_level"),
          prohibitedTopics:   dr("content", "prohibited_topics"),
          requiredDisclaimers: dr("content", "required_disclaimers"),
          contentThemes:      dr("content", "content_themes"),
          contentGapsKnown:   dr("content", "content_gaps_known"),
          contentCapacity:    dr("content", "content_capacity"),
          contentHoursWeekly: dr("content", "content_hours_weekly"),
          editorialCalendar:  dr("content", "editorial_calendar"),
          publishingWorkflow: dr("content", "publishing_workflow"),
        },
        backlinks: {
          drAhrefs:             dr("backlinks", "domain_rating_ahrefs"),
          daMoz:                dr("backlinks", "domain_authority_moz"),
          trustFlowMajestic:    dr("backlinks", "trust_flow_majestic"),
          referringDomains:     dr("backlinks", "referring_domains"),
          highQualityLinks:     dr("backlinks", "high_quality_links"),
          anchorTextHealth:     dr("backlinks", "anchor_text_health"),
          linkBuildingApproach: dr("backlinks", "link_building_approach"),
          linkBuildingCapacity: dr("backlinks", "link_building_capacity"),
          backlinkAuditDate:    dr("backlinks", "backlink_audit_date"),
          toxicLinks:           dr("backlinks", "toxic_links"),
        },
        commercial: {
          engagementType:      dr("commercial", "engagement_type"),
          monthlyHours:        dr("commercial", "monthly_hours"),
          contractStart:       dr("commercial", "contract_start"),
          contractRenewal:     dr("commercial", "contract_renewal"),
          pointOfContactRole:  dr("commercial", "point_of_contact_role"),
          decisionMakerRole:   dr("commercial", "decision_maker_role"),
          communicationChannel: dr("commercial", "communication_channel"),
          commsResponseSla:    dr("commercial", "comms_response_sla"),
          deliverablesExpected: dr("commercial", "deliverables_expected"),
          escalationPath:      dr("commercial", "escalation_path"),
          invoiceTerms:        dr("commercial", "invoice_terms"),
        },
        history: {
          priorSeoWork:        dr("history", "prior_seo_work"),
          priorAgencyName:     dr("history", "prior_agency_name"),
          whatWorked:          dr("history", "what_worked"),
          whatDidntWork:       dr("history", "what_didnt_work"),
          activePenalties:     dr("history", "active_penalties"),
          penaltyNotes:        dr("history", "penalty_notes"),
          recentMigrations:    dr("history", "recent_migrations"),
          recentRedesigns:     dr("history", "recent_redesigns"),
          algorithmImpacts:    dr("history", "algorithm_impacts"),
          businessChanges:     dr("history", "business_changes"),
        },
      },

      competitors: competitors.map((c) => ({
        kind: "competitor", label: c.dr ? `${c.domain} (${c.dr})` : c.domain,
      })),
      contentGapKeywords: toList(dr("competitor", "content_gap_keywords")),

      documents: docs.map((d: any) => {
        /* project_documents real columns: name, doc_type, extracted_data,
           source_date, file_size_kb. extracted_data is jsonb — pull out
           the actual key names and a short value snippet so the
           strategist sees WHAT was extracted, not just a count. */
        const ex = d?.extracted_data;
        const keys = ex && typeof ex === "object" ? Object.keys(ex) : [];
        const snippetOf = (v: any): string => {
          if (v == null) return "";
          if (typeof v === "string") return v.slice(0, 60);
          if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
          if (typeof v === "object") return `${Object.keys(v).length} fields`;
          return String(v).slice(0, 60);
        };
        const highlights = keys.slice(0, 4).map((k) => {
          const snip = snippetOf(ex[k]);
          return snip ? `${k}: ${snip}` : k;
        });
        return {
          kind: "document", refId: d?.id,
          label: d?.name || "Document",
          overview: [
            d?.doc_type ? `Type: ${d.doc_type}` : "",
            d?.source_date ? `Dated ${d.source_date}` : "",
            keys.length ? `${keys.length} field${keys.length === 1 ? "" : "s"} extracted` : "No data extracted",
          ].filter(Boolean).join(" — "),
          highlights,
        };
      }),

      audits: audits.map((a: any) => ({
        kind: "audit", refId: a?.id,
        label: `Audit ${(a?.created_at || "").split("T")[0] || "recent"} — score ${auditScore(a) ?? "n/a"}`,
        overview: auditOverview(a),
        url: a?.url || "",
        highlights: auditWins(a),
        competitors: Array.isArray(a?.competitors) ? a.competitors.filter(Boolean) : [],
        keywords:    Array.isArray(a?.keywords) ? a.keywords.filter(Boolean) : [],
        detail:      auditDetail(a),
      })),
      /* Algorithm intelligence — the built-in TOPIC_CATALOG merged with
         the project's saved Library rows. Saved rows carry real depth
         (practices, ranking factors, checklist items); the card
         generator fetches/generates depth on demand for the rest. */
      algorithm: (() => {
        const savedByLabel = new Map<string, any>();
        for (const a of algo) {
          const key = (a?.title || a?.topic || "").toLowerCase().trim();
          if (key) savedByLabel.set(key, a);
        }
        const aArr = (v: any) => (Array.isArray(v) ? v : []);
        const topTopics = [...TOPIC_CATALOG]
          .sort((x, y) => y.weight - x.weight)
          .slice(0, 12)
          .map((t) => {
            const saved = savedByLabel.get(t.label.toLowerCase().trim());
            const practices = aArr(saved?.best_practices);
            const checks    = aArr(saved?.checklist_items);
            const factors   = aArr(saved?.ranking_factors);
            return {
              kind: "algorithm",
              refId: saved?.id || t.id,
              label: t.label,
              overview: saved?.summary || saved?.what_changed
                || `${t.group} — ${t.engine} (priority ${t.weight}/10)`,
              saved: !!saved,
              impact: saved?.impact_level || "",
              /* real depth — surfaced when the topic is in the Library */
              practices: practices.slice(0, 5).map((p: any) =>
                typeof p === "string" ? p : `${p.practice || ""}: ${p.description || ""}`),
              checklist: checks.slice(0, 6).map((c: any) =>
                typeof c === "string" ? c
                  : `${c.item || ""}${c.pass_criteria ? ` (pass: ${c.pass_criteria})` : ""}`),
              rankingFactors: factors.slice(0, 5).map((f: any) =>
                typeof f === "string" ? f
                  : `${f.factor || ""} [${f.signal || ""}]: ${f.detail || ""}`),
            };
          });
        return topTopics;
      })(),
      brain: brain.map((b: any) => ({
        kind: "brain_learning", refId: b?.id, label: b?.card_title || "Learning",
        overview: b?.improvement || "",
        cardType: b?.card_type || "general",
      })),

      /* crawl & competitive pages — keyword -> landing-page grain */
      crawlPages,
      keywordMap,
      unmatchedPages,
      crawlSummary: {
        total:       crawlPages.length,
        ours:        crawlPages.filter((p) => p.owner === "ours").length,
        competitor:  crawlPages.filter((p) => p.owner === "competitor").length,
        lastCrawled: crawlPages[0]?.crawledAt || "",
      },

      /* the stored AI competitive comparison (from the last pm_run_crawl) */
      crawlComparison:   (proj as any).crawl_comparison || null,
      crawlComparisonAt: (proj as any).crawl_comparison_at || "",

      sales:       [] as any[],
      clientNotes: [] as any[],
      gaps,
    };
    return { success: true, context };
  } catch (e: any) {
    return { success: false, error: e?.message || "unknown" };
  }
}

/* ════════════════════════════════════════════════════
   3b. GENERATE CARDS
════════════════════════════════════════════════════ */
async function pmGenerateCards(projectId: string) {
  const gathered = await pmGatherRequirements(projectId);
  if (!gathered.success) return gathered;
  const ctx = (gathered as any).context;

  /* ──────────────────────────────────────────────────────────────
     Stage 0 — algorithm intelligence: pick relevant topics, fetch
     their depth (Library or generated). Bounded so it can never
     hang generation. The output is a map of topic -> depth that
     stage-B expansion can draw from per card.
  ────────────────────────────────────────────────────────────── */
  let algoDepths: any[] = [];
  let algoStageNote = "";
  try {
    const stage = (async () => {
      const catalogList = TOPIC_CATALOG
        .map((t) => `${t.id} | ${t.label} (${t.engine}/${t.category})`).join("\n");
      const pickResp = await ai().messages.create({
        model: MODEL, max_tokens: 400,
        system: "You select which SEO algorithm topics are relevant to a project. Return ONLY a raw JSON array of topic id strings.",
        messages: [{
          role: "user",
          content:
            `Project: ${ctx.projectName} | Goal: ${ctx.goal || "n/a"}\n` +
            `Keywords: ${(ctx.keywords || []).join(", ") || "none"}\n\n` +
            `Pick the 6-8 most relevant algorithm topics for this project's SEO work ` +
            `from the catalog below. Return ONLY their ids as a JSON array.\n\n` +
            catalogList,
        }],
      });
      const pickRaw = (pickResp.content[0] as any)?.text || "[]";
      const p = parseJSON(pickRaw);
      const pickedIds: string[] = Array.isArray(p) ? p.filter((x) => typeof x === "string") : [];
      const picked = TOPIC_CATALOG.filter((t) => pickedIds.includes(t.id)).slice(0, 8);
      return picked.length ? getTopicsDepth(picked) : [];
    })();
    algoDepths = await Promise.race([
      stage,
      new Promise<any[]>((_, rej) => setTimeout(() => rej(new Error("algorithm stage timed out")), 120_000)),
    ]);
  } catch (e: any) {
    algoStageNote = e?.message || "algorithm depth stage failed";
    console.error("[pm] algorithm depth stage:", algoStageNote);
  }

  /* concise context block reused by both stages — full picture but
     compact so the AI can spend its tokens on the actual output.
     Data Room V2: identity / audience / content / backlinks / commercial
     / history sections are surfaced ONLY when filled. Empty fields
     emit nothing — they are noise to the AI and hurt the output.
     The principle is: rich data → confident, specific cards; thin
     data → cards that acknowledge the gap and still help. */
  const dr = ctx.dataRoom || {};

  /* tiny helper: emit a labelled line if the value is non-empty */
  const ln = (label: string, value?: string): string =>
    value && String(value).trim() ? `${label}: ${String(value).trim()}` : "";

  /* identity block — who this client actually is */
  const identityLines = [
    ln("CLIENT", dr.identity?.clientName),
    ln("INDUSTRY", [dr.identity?.industry, dr.identity?.industrySpecific].filter(Boolean).join(" — ") || undefined),
    ln("MODEL", [dr.identity?.businessModel, dr.identity?.lifecycleStage].filter(Boolean).join(", ") || undefined),
    ln("OFFERING", dr.identity?.primaryOffering),
    ln("UVP", dr.identity?.uniqueValueProp),
    ln("MARKETS", dr.identity?.geographicMarkets),
    ln("LANGUAGES", dr.identity?.languages),
    ln("REVENUE", dr.identity?.annualRevenue),
    ln("HEADCOUNT", dr.identity?.headcount),
  ].filter(Boolean);

  /* audience block — who we are writing for */
  const audienceLines = [
    ln("ICP", dr.audience?.icp),
    ln("PRIMARY PERSONA", dr.audience?.persona1Name),
    ln("PERSONA MOTIVATIONS", dr.audience?.persona1Motivations),
    ln("PERSONA OBJECTIONS", dr.audience?.persona1Objections),
    dr.audience?.persona2Name ? ln("PERSONA 2", `${dr.audience.persona2Name}${dr.audience.persona2Motivations ? ` (${dr.audience.persona2Motivations})` : ""}`) : "",
    ln("FUNNEL FOCUS", dr.audience?.funnelFocus),
    ln("SEARCH INTENT MIX", dr.audience?.searchIntentSplit),
    ln("POSITIONING", dr.audience?.positioningStatement),
  ].filter(Boolean);

  /* content / editorial block — calibrates the voice of every output */
  const contentLines = [
    ln("BRAND VOICE", dr.content?.brandVoice),
    ln("TONE WORDS", dr.content?.brandToneWords),
    ln("READING LEVEL", dr.content?.readingLevel),
    ln("CONTENT THEMES", dr.content?.contentThemes),
    ln("PROHIBITED TOPICS", dr.content?.prohibitedTopics),
    ln("REQUIRED DISCLAIMERS", dr.content?.requiredDisclaimers),
    ln("CONTENT CAPACITY", [dr.content?.contentCapacity, dr.content?.contentHoursWeekly].filter(Boolean).join(", ") || undefined),
    ln("ACKNOWLEDGED CONTENT GAPS", dr.content?.contentGapsKnown),
  ].filter(Boolean);

  /* backlinks / authority block */
  const backlinkLines = [
    ln("DOMAIN RATING", [
      dr.backlinks?.drAhrefs ? `Ahrefs DR ${dr.backlinks.drAhrefs}` : "",
      dr.backlinks?.daMoz ? `Moz DA ${dr.backlinks.daMoz}` : "",
    ].filter(Boolean).join(", ") || undefined),
    ln("REFERRING DOMAINS", dr.backlinks?.referringDomains),
    ln("LINK BUILDING APPROACH", dr.backlinks?.linkBuildingApproach),
    ln("LINK CAPACITY", dr.backlinks?.linkBuildingCapacity),
    ln("ANCHOR TEXT HEALTH", dr.backlinks?.anchorTextHealth),
    ln("TOXIC LINKS", dr.backlinks?.toxicLinks),
  ].filter(Boolean);

  /* commercial block — shapes what cards we can realistically execute */
  const commercialLines = [
    ln("ENGAGEMENT", [dr.commercial?.engagementType, dr.commercial?.monthlyHours].filter(Boolean).join(", ") || undefined),
    ln("REPORT AUDIENCE", dr.goal?.reportAudience),
    ln("CONTACT ROLE", dr.commercial?.pointOfContactRole),
    ln("DECISION MAKER", dr.commercial?.decisionMakerRole),
    ln("DELIVERABLES EXPECTED", dr.commercial?.deliverablesExpected),
    ln("COMMS CHANNEL", dr.commercial?.communicationChannel),
  ].filter(Boolean);

  /* history block — institutional memory; stops the AI repeating mistakes */
  const historyLines = [
    ln("PRIOR SEO WORK", [dr.history?.priorSeoWork, dr.history?.priorAgencyName].filter(Boolean).join(" — ") || undefined),
    ln("WHAT WORKED BEFORE", dr.history?.whatWorked),
    ln("WHAT DID NOT WORK", dr.history?.whatDidntWork),
    ln("ACTIVE PENALTIES", [dr.history?.activePenalties, dr.history?.penaltyNotes].filter(Boolean).join(" — ") || undefined),
    ln("RECENT MIGRATIONS", dr.history?.recentMigrations),
    ln("RECENT REDESIGNS", dr.history?.recentRedesigns),
    ln("ALGORITHM IMPACTS", dr.history?.algorithmImpacts),
    ln("BUSINESS CHANGES TO REFLECT", dr.history?.businessChanges),
  ].filter(Boolean);

  /* enhanced existing blocks pull in the V2 fields without breaking the
     existing line shape — the AI sees richer context where filled */
  const goalLine = [
    `GOAL: ${ctx.goal || "not set"}`,
    dr.goal?.primaryGoalNarrative ? `— ${dr.goal.primaryGoalNarrative}` : "",
    dr.goal?.timeline ? `| Timeline: ${dr.goal.timeline}` : "",
    dr.goal?.successMetric ? `| Success: ${dr.goal.successMetric}` : "",
    dr.goal?.secondaryGoals ? `\n  Secondary goals: ${dr.goal.secondaryGoals}` : "",
    dr.goal?.antiGoals ? `\n  ANTI-GOALS (must respect): ${dr.goal.antiGoals}` : "",
  ].filter(Boolean).join(" ");

  const technicalLine = [
    `TECHNICAL: ${dr.technical?.pagesIndexed || "?"} indexed`,
    dr.technical?.crawlErrors ? `| crawl errors: ${dr.technical.crawlErrors}` : "",
    dr.technical?.schemaMarkup ? `| schema: ${dr.technical.schemaMarkup}` : "",
    dr.technical?.cwvLcp ? `| CWV LCP ${dr.technical.cwvLcp}` : "",
    dr.technical?.cwvInp ? `INP ${dr.technical.cwvInp}` : "",
    dr.technical?.cwvCls ? `CLS ${dr.technical.cwvCls}` : "",
    dr.technical?.hreflangSetup && dr.technical.hreflangSetup !== "Not needed (single market)" ? `| hreflang: ${dr.technical.hreflangSetup}` : "",
    dr.technical?.jsRendering ? `| JS: ${dr.technical.jsRendering}` : "",
  ].filter(Boolean).join(" ");

  const analyticsLine = [
    `ANALYTICS: ${dr.analytics?.organicSessions || "?"} sessions/mo`,
    `| GSC ${dr.analytics?.gscClicks || "?"} clicks pos ${dr.analytics?.gscPosition || "?"}`,
    dr.analytics?.gscCtr ? `CTR ${dr.analytics.gscCtr}` : "",
    dr.analytics?.conversions ? `| conv ${dr.analytics.conversions}/mo` : "",
    dr.analytics?.valuePerLead ? `| £/lead ${dr.analytics.valuePerLead}` : "",
    dr.analytics?.valuePerCustomer ? `LTV ${dr.analytics.valuePerCustomer}` : "",
  ].filter(Boolean).join(" ");

  const contextBlock = [
    `PROJECT: ${ctx.projectName} | URL: ${ctx.url || "not set"}`,
    goalLine,
    `TARGET KEYWORDS: ${(ctx.keywords || []).join(", ") || "none"}`,

    /* V2 section — emitted only when filled */
    identityLines.length ? "\n── CLIENT IDENTITY ──\n" + identityLines.join("\n") : "",
    audienceLines.length ? "\n── AUDIENCE & POSITIONING ──\n" + audienceLines.join("\n") : "",
    contentLines.length ? "\n── CONTENT & EDITORIAL (mandatory voice/constraint context) ──\n" + contentLines.join("\n") : "",

    `\nTECH: CMS ${dr.tech?.cms || "?"} | plugin ${dr.tech?.seoPlugin || "?"} | hosting ${dr.tech?.hosting || "?"}`,
    `ACCESS: GSC ${dr.access?.gsc || "?"} | GA4 ${dr.access?.ga4 || "?"} | Ahrefs ${dr.access?.ahrefs || "?"} | CMS admin ${dr.access?.cmsAdmin || "?"}`,
    dr.access?.schemaEdit || dr.access?.robotsEdit || dr.access?.deploy
      ? `EDIT ABILITY: schema ${dr.access?.schemaEdit || "?"} | robots ${dr.access?.robotsEdit || "?"} | deploy ${dr.access?.deploy || "?"}`
      : "",
    analyticsLine,
    technicalLine,

    backlinkLines.length ? "\n── BACKLINKS & AUTHORITY ──\n" + backlinkLines.join("\n") : "",
    commercialLines.length ? "\n── COMMERCIAL & ENGAGEMENT ──\n" + commercialLines.join("\n") : "",
    historyLines.length ? "\n── HISTORY & CONTEXT (avoid repeating past mistakes; acknowledge prior wins) ──\n" + historyLines.join("\n") : "",

    "",
    (ctx.competitors || []).length
      ? "COMPETITORS: " + ctx.competitors.map((c: any) => c.label).join(", ") : "COMPETITORS: none recorded.",
    ctx.contentGapKeywords?.length ? `CONTENT-GAP KEYWORDS: ${ctx.contentGapKeywords.join(", ")}` : "",
    "",
    (ctx.keywordMap || []).length
      ? "KEYWORD -> LANDING PAGE (from crawl):\n" + ctx.keywordMap.map((k: any) => {
          const our = k.ourPage ? `our: ${k.ourPage.url}` : "NO own page";
          const comp = k.competitorPages?.length ? k.competitorPages.map((p: any) => p.url).join(", ") : "no competitor crawled";
          return `  "${k.keyword}": ${our} | ${comp}`;
        }).join("\n")
      : "KEYWORD -> LANDING PAGE: no crawl data yet.",
    "",
    (ctx.audits || []).length
      ? "AUDIT FINDINGS:\n" + ctx.audits.slice(0, 2).map((a: any) =>
          `  - ${a.label}: ${a.detail?.verdict || a.overview || "(no detail)"}\n` +
          (a.detail?.urgentGap ? `    Urgent: ${a.detail.urgentGap}\n` : "") +
          (a.detail?.biggestWin ? `    Win: ${a.detail.biggestWin}\n` : "") +
          (a.detail?.competitive ? `    Competitive: ${a.detail.competitive.slice(0, 200)}` : "")
        ).join("\n")
      : "AUDIT FINDINGS: none.",
    "",
    (ctx.brain || []).length
      ? "BRAIN LEARNINGS:\n" + ctx.brain.slice(0, 6).map((b: any) => `  - ${b.label}: ${b.overview || ""}`).join("\n")
      : "",
    "",
    algoDepths.length
      ? "ALGORITHM TOPICS IN SCOPE (full practices & checklists supplied per card in stage B):\n" +
        algoDepths.map((d: any) => `  - ${d.title} (impact: ${d.impact_level})`).join("\n")
      : "ALGORITHM TOPICS: none selected.",
    ctx.gaps?.length ? `\nKNOWN DATA GAPS: ${ctx.gaps.join("; ")}` : "",
  ].filter(Boolean).join("\n");

  /* ──────────────────────────────────────────────────────────────
     Stage A — PLAN: get the list of cards as titles + metadata only.
     Small budget so this never truncates. The plan tells stage B
     what to build, including which algorithm topics each card uses.
  ────────────────────────────────────────────────────────────── */
  let planRaw = "";
  try {
    const planResp = await ai().messages.create({
      model: MODEL, max_tokens: 2500, system: PM_SYSTEM,
      messages: [{
        role: "user",
        content: [
          "You are a senior SEO project strategist. Plan a set of task cards for this project.",
          "Return a STRUCTURED PLAN — short titles and metadata only. Card details are written in a second pass.",
          "",
          contextBlock,
          "",
          "Produce 8-14 cards covering technical / content / GEO / competitive / quick-win work.",
          "Each card must target real project data: a specific landing page for a specific keyword,",
          "an actual technical issue from the audit, an algorithm topic above, or a competitor gap.",
          "",
          'Return ONLY a raw JSON array, no markdown:',
          '[{',
          '  "id": "c1",',
          '  "title": "concise action title (max 12 words)",',
          '  "type": "quick-win|technical|content|geo|competitive|insight|weekly|kpi",',
          '  "priority": "high|medium|low",',
          '  "week": 1-5,',
          '  "target_url": "the landing page this card is about, or \"\"",',
          '  "target_keyword": "the keyword this card targets, or \"\"",',
          '  "algorithm_topics": ["exact titles of relevant algorithm topics from the list above, max 2"],',
          '  "data_basis": "one sentence: which finding/data this card came from",',
          '  "rationale_hint": "one sentence: why this card matters for this project"',
          "}]",
        ].join("\n"),
      }],
    });
    planRaw = (planResp.content[0] as any)?.text || "";
    if ((planResp as any)?.stop_reason === "max_tokens") {
      console.warn("[pm] plan stage hit max_tokens — list may be truncated");
    }
  } catch (e: any) {
    return { success: false, cards: [],
      error: `Card planning failed: ${e?.message || "unknown"}` };
  }
  const plan = parseJSON(planRaw);
  if (!Array.isArray(plan) || !plan.length) {
    const preview = planRaw.slice(0, 160).replace(/\s+/g, " ").trim();
    return { success: false, cards: [],
      error: plan === null || plan === undefined
        ? `Card planner did not return a list. It returned: "${preview}${planRaw.length > 160 ? "…" : ""}"${algoStageNote ? ` (algo stage: ${algoStageNote})` : ""}`
        : "Card planner returned an empty list — the project may not have enough data to plan cards. Check that it has keywords, a goal, and either an audit or a crawl." };
  }

  /* ──────────────────────────────────────────────────────────────
     Stage B — EXPAND each planned card into a full executable card.
     Per-card AI call so each gets full token room. Parallel with
     bounded concurrency to keep latency reasonable without
     fan-out hammering rate limits.
  ────────────────────────────────────────────────────────────── */
  const algoByTitle = new Map<string, any>();
  for (const d of algoDepths) {
    if (d?.title) algoByTitle.set(d.title.toLowerCase().trim(), d);
  }
  const depthBlockFor = (topics: string[]): string => {
    const matched = (topics || [])
      .map((t) => algoByTitle.get(String(t).toLowerCase().trim()))
      .filter(Boolean);
    if (!matched.length) return "";
    return "ALGORITHM PRACTICES & CHECKLIST TO APPLY:\n" + matched.map((d: any) => {
      const practices = (d.best_practices || []).slice(0, 5)
        .map((p: any) => `  • ${p.practice}: ${p.description}`).join("\n");
      const checks = (d.checklist_items || []).slice(0, 6)
        .map((c: any) => `  ☐ ${c.item}${c.pass_criteria ? ` — pass: ${c.pass_criteria}` : ""}${c.tool ? ` [${c.tool}]` : ""}`).join("\n");
      return `[${d.title}]\n${d.summary || ""}\n` +
        (practices ? `Best practices:\n${practices}\n` : "") +
        (checks ? `Checklist:\n${checks}` : "");
    }).join("\n\n");
  };

  const expandOne = async (p: any): Promise<any | null> => {
    try {
      const depthBlock = depthBlockFor(p.algorithm_topics || []);
      const expandPrompt = [
        "You are a senior SEO strategist writing one detailed, executable task card.",
        "Use the project context and the algorithm practices below to write content that is",
        "specific to THIS project, references real data, and lists concrete prerequisites.",
        "Never invent data. If something must be assumed, flag it with [ASSUMPTION] in the content.",
        "",
        "PROJECT CONTEXT:",
        contextBlock,
        "",
        depthBlock,
        "",
        "THE CARD TO WRITE:",
        `Title: ${p.title}`,
        `Type: ${p.type} | Priority: ${p.priority} | Week: ${p.week}`,
        p.target_url ? `Target page: ${p.target_url}` : "",
        p.target_keyword ? `Target keyword: ${p.target_keyword}` : "",
        p.data_basis ? `Source data: ${p.data_basis}` : "",
        p.rationale_hint ? `Strategic rationale: ${p.rationale_hint}` : "",
        "",
        'Return ONLY a raw JSON object, no markdown:',
        '{',
        '  "content": "3-6 sentence detailed description of what to do, why, and how it ties to the project data + algorithm practices above. Be concrete. Reference the actual page, keyword, finding.",',
        '  "requirements": ["each prerequisite the executor needs — tool access, asset, approval, data. Be specific to this project."],',
        '  "checklist": ["specific algorithm checklist items copied/adapted from the practices above that this card must satisfy. Each item should be verifiable."],',
        '  "expected_outcome": "what success looks like — measurable if possible"',
        "}",
      ].filter(Boolean).join("\n");

      const resp = await ai().messages.create({
        model: MODEL, max_tokens: 2500, system: PM_SYSTEM,
        messages: [{ role: "user", content: expandPrompt }],
      });
      const raw = (resp.content[0] as any)?.text || "";
      const parsed = parseJSON(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return { plan: p, expanded: parsed };
    } catch (e: any) {
      console.error("[pm] card expansion failed for", p?.title, e?.message || e);
      return null;
    }
  };

  /* bounded concurrency — at most 4 expansions in flight at once,
     so a project with 14 cards completes in ~4 rounds, not 14 serial */
  const planSlice = plan.slice(0, 14);
  const expansions: any[] = [];
  const CONCURRENCY = 4;
  for (let i = 0; i < planSlice.length; i += CONCURRENCY) {
    const chunk = planSlice.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(expandOne));
    for (const r of results) if (r) expansions.push(r);
  }

  /* ──────────────────────────────────────────────────────────────
     Persist each expanded card to kanban_tasks.
  ────────────────────────────────────────────────────────────── */
  const saved: any[] = [];
  for (const { plan: p, expanded: e } of expansions) {
    const reqs: any[] = [];
    if (Array.isArray(e.requirements)) {
      e.requirements.forEach((label: any, i: number) => {
        if (label && typeof label === "string") {
          reqs.push({ id: `r${i}`, label, category: "general", met: false });
        }
      });
    }
    if (Array.isArray(e.checklist)) {
      e.checklist.forEach((label: any, i: number) => {
        if (label && typeof label === "string") {
          reqs.push({ id: `a${i}`, label, category: "algorithm", met: false });
        }
      });
    }
    const refs: any[] = [];
    if (p.data_basis)       refs.push({ kind: "scope", label: String(p.data_basis) });
    if (p.target_url)       refs.push({ kind: "metric", label: `Page: ${p.target_url}` });
    if (p.target_keyword)   refs.push({ kind: "metric", label: `Keyword: ${p.target_keyword}` });
    if (Array.isArray(p.algorithm_topics) && p.algorithm_topics.length) {
      refs.push({ kind: "algorithm", label: p.algorithm_topics.join(", ") });
    }
    if (e.expected_outcome) refs.push({ kind: "scope", label: `Outcome: ${e.expected_outcome}` });

    const r = await pmSaveCard({
      projectId,
      title:        String(p.title || "Untitled task").slice(0, 200),
      description:  String(e.content || p.rationale_hint || ""),
      card_type:    p.type || "custom",
      priority:     ["high", "medium", "low"].includes(p.priority) ? p.priority : "medium",
      status:       "todo",
      week:         Number(p.week) >= 1 && Number(p.week) <= 5 ? Number(p.week) : 5,
      placed:       false,
      requirements: reqs,
      source:       "ai_generated",
      source_refs:  refs,
      tags:         ["ai-generated"],
    });
    if (r.success && r.card) saved.push(r.card);
  }

  if (!saved.length) {
    return { success: false, cards: [],
      error: `Cards were planned but none could be expanded successfully${algoStageNote ? ` (algo stage: ${algoStageNote})` : ""}. Try again — the per-card AI calls may have timed out.` };
  }
  return {
    success: true, cards: saved, generated: saved.length,
    planned: plan.length, expanded: expansions.length,
    algoTopics: algoDepths.length,
  };
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
/* ════════════════════════════════════════════════════
   3c. SAVE A CRAWL COMPARISON
   The crawl + AI comparison run on the frontend (which can
   reach /api/crawl reliably). This action just persists the
   resulting comparison onto the project so the Requirements
   tab can show it as a stored cross-verification.
════════════════════════════════════════════════════ */
async function pmSaveCrawlComparison(projectId: string, comparison: any) {
  if (!projectId) return { success: false, error: "projectId required" };
  if (!comparison || typeof comparison !== "object") {
    return { success: false, error: "comparison data required" };
  }
  try {
    const { error } = await db().from("projects").update({
      crawl_comparison:    comparison,
      crawl_comparison_at: new Date().toISOString(),
    }).eq("id", projectId);
    if (error) return { success: false, error: error.message };
    return { success: true, savedAt: new Date().toISOString() };
  } catch (e: any) {
    return { success: false, error: e?.message || "save failed" };
  }
}

/* The project's crawl URLs — site + landing pages + competitors.
   Used by the frontend to know what to crawl. */
async function pmCrawlTargets(projectId: string) {
  if (!projectId) return { success: false, error: "projectId required" };
  try {
    const [{ data: proj }, { data: kn }] = await Promise.all([
      db().from("projects").select("name,url").eq("id", projectId).maybeSingle(),
      db().from("project_knowledge").select("category,field_key,field_value").eq("project_id", projectId),
    ]);
    const km: Record<string, Record<string, string>> = {};
    for (const k of (kn || [])) {
      if (!k?.category) continue;
      (km[k.category] ||= {})[k.field_key] = k.field_value || "";
    }
    const splitUrls = (s: string) =>
      (s || "").split(/[,\n]/).map((u) => u.trim()).filter(Boolean);

    const urlSet = new Set<string>();
    if ((proj as any)?.url) urlSet.add((proj as any).url);
    splitUrls(km["analytics"]?.["top_landing_pages"] || "").forEach((u) => urlSet.add(u));
    ["competitor_1", "competitor_2", "competitor_3"].forEach((k) => {
      const d = km["competitor"]?.[k];
      if (d) urlSet.add(d.startsWith("http") ? d : `https://${d}`);
    });

    return {
      success: true,
      urls: [...urlSet].slice(0, 12),
      projectContext: (proj as any)?.name || "",
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "failed", urls: [] };
  }
}

/* Manually link a target keyword to a landing-page URL.
   Stored in project_knowledge (category "keyword_pages") so it
   persists and overrides inferred matching. Pass url="" to unlink. */
async function pmLinkKeywordPage(projectId: string, keyword: string, url: string) {
  if (!projectId || !keyword) return { success: false, error: "projectId and keyword required" };
  try {
    if (!url) {
      await db().from("project_knowledge").delete()
        .eq("project_id", projectId).eq("category", "keyword_pages").eq("field_key", keyword);
      return { success: true, linked: false };
    }
    /* upsert: remove any existing link for this keyword, then insert */
    await db().from("project_knowledge").delete()
      .eq("project_id", projectId).eq("category", "keyword_pages").eq("field_key", keyword);
    const { error } = await db().from("project_knowledge").insert({
      project_id: projectId, category: "keyword_pages",
      field_key: keyword, field_value: url, source: "manual",
    });
    if (error) return { success: false, error: error.message };
    return { success: true, linked: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "link failed" };
  }
}

export async function handlePM(action: string, body: any): Promise<any | null> {
  switch (action) {
    case "pm_get_cards":             return pmGetCards(body.projectId);
    case "pm_save_card":             return pmSaveCard(body.card || {});
    case "pm_delete_card":           return pmDeleteCard(body.cardId);
    case "pm_gather_requirements":   return pmGatherRequirements(body.projectId);
    case "pm_generate_cards":        return pmGenerateCards(body.projectId);
    case "pm_crawl_targets":         return pmCrawlTargets(body.projectId);
    case "pm_save_crawl_comparison": return pmSaveCrawlComparison(body.projectId, body.comparison);
    case "pm_link_keyword_page":     return pmLinkKeywordPage(body.projectId, body.keyword, body.url || "");
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
