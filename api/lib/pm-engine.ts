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

    /* ── data gaps ── */
    const gaps: string[] = [];
    if (!dr("goal", "primary_goal"))
      gaps.push("No campaign goal set in the Data Room");
    if (!keywords.length)        gaps.push("No target keywords — content/GEO cards will be vague");
    if (!competitors.length)     gaps.push("No competitors recorded in the Data Room");
    if (!audits.length)          gaps.push("No audit run yet");
    if (!crawlPages.length)      gaps.push("No pages crawled — competitive comparison unavailable");
    if (!dr("access", "gsc_access")) gaps.push("Tool access not recorded — card prerequisites may be incomplete");
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

      /* full Data Room, grouped by category for the UI */
      dataRoom: {
        goal: {
          primaryGoal:    dr("goal", "primary_goal"),
          timeline:       dr("goal", "target_timeline"),
          successMetric:  dr("goal", "success_metric"),
          baseline:       dr("goal", "current_baseline"),
          budget:         dr("goal", "budget_monthly"),
          reportingCadence: dr("goal", "reporting_cadence"),
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
        },
        analytics: {
          organicSessions: dr("analytics", "organic_sessions_monthly"),
          topLandingPages: dr("analytics", "top_landing_pages"),
          bounceRate:      dr("analytics", "bounce_rate"),
          conversions:     dr("analytics", "conversions_monthly"),
          gscImpressions:  dr("analytics", "gsc_total_impressions"),
          gscClicks:       dr("analytics", "gsc_total_clicks"),
          gscPosition:     dr("analytics", "gsc_avg_position"),
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
        },
      },

      competitors: competitors.map((c) => ({
        kind: "competitor", label: c.dr ? `${c.domain} (${c.dr})` : c.domain,
      })),
      contentGapKeywords: toList(dr("competitor", "content_gap_keywords")),

      documents: docs.map((d: any) => {
        /* project_documents real columns: name, doc_type, extracted_data,
           source_date, file_size_kb. The doc's findings live in
           extracted_data (jsonb) — surface a count of what was extracted. */
        const ex = d?.extracted_data;
        const exCount = ex && typeof ex === "object" ? Object.keys(ex).length : 0;
        return {
          kind: "document", refId: d?.id,
          label: d?.name || "Document",
          overview: [
            d?.doc_type ? `Type: ${d.doc_type}` : "",
            exCount ? `${exCount} data point${exCount === 1 ? "" : "s"} extracted` : "",
            d?.source_date ? `Dated ${d.source_date}` : "",
          ].filter(Boolean).join(" — "),
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

  const auditSections = (ctx.audits || [])
    .map((a: any) => `- ${a.label}: ${a.overview || "(no summary)"}`).join("\n") || "- No audits.";

  const dr = ctx.dataRoom || {};
  const drBlock = [
    "DATA ROOM — PROJECT DEFINITION:",
    `  Goal: ${dr.goal?.primaryGoal || "not set"} | Timeline: ${dr.goal?.timeline || "n/a"} | Success: ${dr.goal?.successMetric || "n/a"}`,
    `  Budget: ${dr.goal?.budget || "n/a"} | Reporting: ${dr.goal?.reportingCadence || "n/a"}`,
    `  Tech: CMS ${dr.tech?.cms || "?"} ${dr.tech?.cmsVersion || ""} | SEO plugin ${dr.tech?.seoPlugin || "?"} | Hosting ${dr.tech?.hosting || "?"} | SSL ${dr.tech?.ssl || "?"}`,
    `  Tool access: GSC ${dr.access?.gsc || "?"} | GA4 ${dr.access?.ga4 || "?"} | Ahrefs ${dr.access?.ahrefs || "?"} | CMS admin ${dr.access?.cmsAdmin || "?"}`,
    `  Analytics: ${dr.analytics?.organicSessions || "?"} organic sessions/mo | GSC ${dr.analytics?.gscClicks || "?"} clicks, pos ${dr.analytics?.gscPosition || "?"}`,
    `  Technical: ${dr.technical?.pagesIndexed || "?"} indexed | crawl errors: ${dr.technical?.crawlErrors || "none recorded"} | broken links: ${dr.technical?.brokenLinks || "none"} | schema: ${dr.technical?.schemaMarkup || "?"} | robots: ${dr.technical?.robotsTxt || "?"}`,
  ].join("\n");

  const compBlock = (ctx.competitors || []).length
    ? "COMPETITORS: " + ctx.competitors.map((c: any) => c.label).join(", ")
      + (ctx.contentGapKeywords?.length ? `\n  Content-gap keywords: ${ctx.contentGapKeywords.join(", ")}` : "")
    : "COMPETITORS: none recorded.";

  /* keyword -> landing page comparison from the live crawl */
  const kwBlock = (ctx.keywordMap || []).length
    ? "KEYWORD -> LANDING PAGE (from live crawl):\n" + ctx.keywordMap.map((k: any) => {
        const our = k.ourPage ? `our page ${k.ourPage.url} (${k.ourPage.contentType}, ${k.ourPage.titleIssues || "title ok"})` : "NO own page targeting this";
        const comp = k.competitorPages?.length
          ? k.competitorPages.map((p: any) => p.url).join(", ") : "no competitor page seen";
        return `  "${k.keyword}": ${our} | competitor: ${comp}${k.anyInferred ? " [keyword match inferred]" : ""}`;
      }).join("\n")
    : "KEYWORD -> LANDING PAGE: no crawl data — recommend running a crawl.";

  const brainBlock = (ctx.brain || []).length
    ? "BRAIN LEARNINGS — APPLY THESE:\n" + ctx.brain.slice(0, 8)
        .map((b: any) => `- ${b.label}: ${b.overview || ""}`).join("\n")
    : "BRAIN LEARNINGS: none yet.";

  /* ── Algorithm intelligence — stage 1: pick relevant topics ──
     Show the AI the catalog and let it choose the topics that
     actually matter for this project, rather than dumping all 37.
     Hard-bounded to 90s so card generation cannot hang on this stage. */
  let algoDepthBlock = "ALGORITHM INTELLIGENCE: none selected.";
  let algoDepths: any[] = [];
  let algoStageNote = "";
  try {
    const stagePromise = (async () => {
      const catalogList = TOPIC_CATALOG
        .map((t) => `${t.id} | ${t.label} (${t.engine}/${t.category})`)
        .join("\n");
      const pickResp = await ai().messages.create({
        model: MODEL, max_tokens: 400,
        system: "You select which SEO algorithm topics are relevant to a project. Return ONLY a raw JSON array of topic id strings.",
        messages: [{
          role: "user",
          content:
            `Project: ${ctx.projectName} | Goal: ${ctx.goal || "n/a"}\n` +
            `Keywords: ${(ctx.keywords || []).join(", ") || "none"}\n\n` +
            `Pick the 6-8 most relevant algorithm topics for this project's SEO work ` +
            `from the catalog below. Return ONLY their ids as a JSON array, e.g. ["g_eeat","g_ai_overviews"].\n\n` +
            catalogList,
        }],
      });
      const pickRaw = (pickResp.content[0] as any)?.text || "[]";
      const pickedIds: string[] = (() => {
        const p = parseJSON(pickRaw);
        return Array.isArray(p) ? p.filter((x) => typeof x === "string") : [];
      })();
      const pickedTopics = TOPIC_CATALOG
        .filter((t) => pickedIds.includes(t.id))
        .slice(0, 8);
      if (!pickedTopics.length) return [];
      return getTopicsDepth(pickedTopics);
    })();
    const timeoutPromise = new Promise<any[]>((_, reject) =>
      setTimeout(() => reject(new Error("algorithm depth stage timeout (90s)")), 90_000));
    algoDepths = await Promise.race([stagePromise, timeoutPromise]);
    if (algoDepths.length) {
      algoDepthBlock = "ALGORITHM INTELLIGENCE — apply these practices and checklists:\n" +
        algoDepths.map((d: any) => {
          const practices = (d.best_practices || []).slice(0, 4)
            .map((p: any) => `    • ${p.practice}: ${p.description}`).join("\n");
          const checks = (d.checklist_items || []).slice(0, 5)
            .map((c: any) => `    ☐ ${c.item} (pass: ${c.pass_criteria || "n/a"})`).join("\n");
          return `\n  [${d.title}] — impact: ${d.impact_level}\n` +
            `  ${d.summary}\n` +
            (practices ? `  Best practices:\n${practices}\n` : "") +
            (checks ? `  Checklist:\n${checks}` : "");
        }).join("\n");
    }
  } catch (e: any) {
    algoStageNote = e?.message || "algorithm depth stage failed";
    console.error("[pm] algorithm depth stage failed:", algoStageNote);
    /* card generation continues without algorithm depth rather than failing */
  }

  const prompt = [
    "Create a set of SEO project task cards for this project. You are a senior digital",
    "marketing strategist. Use ALL the intelligence below — every card must be grounded",
    "in this project's real data, not generic advice.",
    "",
    `PROJECT: ${ctx.projectName} | URL: ${ctx.url || "not set"}`,
    `TARGET KEYWORDS: ${(ctx.keywords || []).join(", ") || "none set"}`,
    "",
    drBlock,
    "",
    compBlock,
    "",
    kwBlock,
    "",
    "AUDIT FINDINGS:",
    auditSections,
    "",
    brainBlock,
    "",
    algoDepthBlock,
    "",
    ctx.gaps?.length ? `KNOWN DATA GAPS: ${ctx.gaps.join("; ")}` : "",
    "",
    "RULES FOR THE CARDS:",
    "- Produce 8-14 concrete task cards covering technical, content, GEO, competitive work.",
    "- Content & competitive cards must target a SPECIFIC landing page for a SPECIFIC keyword,",
    "  citing the competitor's page from the crawl where relevant.",
    "- Technical cards must reflect the actual CMS and recorded technical issues.",
    "- Each card's requirements must reflect real tool access — if GSC is 'view only' or",
    "  CMS admin must be requested, list that as a prerequisite.",
    "- Apply the ALGORITHM INTELLIGENCE: where a card relates to a topic above, copy its",
    "  relevant checklist items into the card's \"checklist\" so execution is measured against",
    "  real algorithm criteria. Reference the practice in the card content.",
    "- Never invent data. If a card rests on an assumption, say so in its content.",
    "",
    'Return ONLY a raw JSON array, no markdown:',
    '[{',
    '  "type": "quick-win|technical|content|geo|competitive|insight|weekly|kpi",',
    '  "title": "concise action title",',
    '  "content": "what to do and why — specific, references the data above",',
    '  "priority": "high|medium|low",',
    '  "week": 1-5,',
    '  "requirements": ["prerequisites incl. any tool access needed"],',
    '  "checklist": ["algorithm checklist items this card must satisfy, from the intelligence above"],',
    '  "target_url": "the landing page this card is about, if applicable",',
    '  "target_keyword": "the keyword this card targets, if applicable",',
    '  "algorithm_basis": "which algorithm topic(s) inform this card, if any",',
    '  "source_label": "which finding/data this card came from"',
    "}]",
  ].filter(Boolean).join("\n");

  try {
    const resp = await ai().messages.create({
      model: MODEL, max_tokens: 8000, system: PM_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (resp.content[0] as any)?.text || "";
    /* token-limit detection — if generation was truncated the JSON cannot parse */
    const truncated = (resp as any)?.stop_reason === "max_tokens";
    if (!raw) {
      return { success: false, cards: [],
        error: `The AI returned an empty response${algoStageNote ? ` (algorithm stage: ${algoStageNote})` : ""}.` };
    }
    const parsed = parseJSON(raw);
    if (!Array.isArray(parsed)) {
      const preview = raw.slice(0, 160).replace(/\s+/g, " ").trim();
      return { success: false, cards: [],
        error: truncated
          ? `The AI ran out of tokens before completing the card list. Try generating again — the prompt may be too long given the project's data.`
          : `The AI did not return a card list. It returned: "${preview}${raw.length > 160 ? "…" : ""}"${algoStageNote ? ` (algorithm stage: ${algoStageNote})` : ""}` };
    }
    if (!parsed.length) {
      return { success: false, cards: [],
        error: "The AI returned an empty card list. The project may not have enough data — check that it has keywords, a goal, and an audit or crawl." };
    }

    const saved: any[] = [];
    for (const c of parsed.slice(0, 14)) {
      const reqs = Array.isArray(c.requirements)
        ? c.requirements.map((label: string, i: number) => ({
            id: `r${i}`, label, category: "general", met: false,
          }))
        : [];
      /* algorithm checklist items become verifiable requirements —
         the card executor checks the card against real algo criteria */
      if (Array.isArray(c.checklist)) {
        c.checklist.forEach((label: string, i: number) => {
          if (label && typeof label === "string") {
            reqs.push({ id: `a${i}`, label, category: "algorithm", met: false });
          }
        });
      }
      const refs: any[] = [];
      if (c.source_label)    refs.push({ kind: "scope", label: String(c.source_label) });
      if (c.target_url)      refs.push({ kind: "metric", label: `Page: ${c.target_url}` });
      if (c.target_keyword)  refs.push({ kind: "metric", label: `Keyword: ${c.target_keyword}` });
      if (c.algorithm_basis) refs.push({ kind: "algorithm", label: String(c.algorithm_basis) });
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
        source_refs:  refs,
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
