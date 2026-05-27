/* ════════════════════════════════════════════════════════════════
   api/lib/season-pipeline-traffic-growth.ts

   Traffic Growth pipeline — runs when the objective is to increase
   organic clicks across multiple target pages (not a single keyword).

   Scope passed in from objective_full_setup:
     scope.targetUrls  — the specific pages to grow (may be empty)
     scope.projectId   — project with GSC/GA4 connected
     scope.keyword     — optional primary keyword (if specified)

   6 steps designed around organic traffic increase:

   1. Traffic Audit      — GSC: which pages are underperforming, position 4-15 quick wins
   2. Page Health        — CWV + indexability check across target URLs (PSI baseline data)
   3. Content Gap        — thin content, missing meta, CTR below expected for impressions
   4. Internal Link Flow — which target pages are receiving low internal PageRank
   5. Growth Strategy    — AI synthesises findings into a prioritised action plan
   6. Client Update      — plain-English summary of what we'll do and why

   Each step reads ctx.scope.targetUrls and narrows its analysis to those
   pages when provided. Falls back to project-wide top pages when not set.
════════════════════════════════════════════════════════════════ */

import { db } from "./db.js";
import { cacheKnowledge, getKnowledge } from "./season-knowledge-cache.js";
import type { PipelineDefinition, PipelineStepContext, PipelineStepResult } from "./season-pipeline-runner.js";

const MODEL             = "claude-sonnet-4-6";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

/* ─── LLM helper ─────────────────────────────────────────────── */
async function llm(system: string, user: string, maxTokens = 2000): Promise<string> {
  if (!ANTHROPIC_API_KEY) return "";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens,
      system, messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) return "";
  const d = await r.json();
  return (d?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
}

/* ─── Helper: get target URLs from scope or fall back to GSC top pages ─ */
async function resolveTargetPages(ctx: PipelineStepContext): Promise<string[]> {
  const fromScope: string[] = Array.isArray(ctx.scope.targetUrls)
    ? ctx.scope.targetUrls.filter(Boolean).slice(0, 30)
    : [];
  if (fromScope.length > 0) return fromScope;

  /* Fall back to GSC top pages cached in project_knowledge */
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_value")
      .eq("project_id", ctx.projectId)
      .eq("field_key", "gsc_top_pages")
      .maybeSingle();
    if (data) {
      const pages = JSON.parse((data as any).field_value || "[]");
      return pages.map((p: any) => p.page || p.url || p.dimension).filter(Boolean).slice(0, 20);
    }
  } catch { /* no cache */ }
  return [];
}

/* ─── Helper: load GSC metrics for pages from project_knowledge ─ */
async function loadGscData(projectId: string): Promise<{
  topPages: any[];
  quickWins: any[];  // position 4-15 with >100 impressions
}> {
  try {
    const { data } = await db().from("project_knowledge")
      .select("field_key,field_value")
      .eq("project_id", projectId)
      .in("field_key", ["gsc_top_pages", "gsc_top_queries"]);
    const rows = (data || []) as any[];
    const topPagesRow = rows.find(r => r.field_key === "gsc_top_pages");
    const topPages = topPagesRow ? JSON.parse(topPagesRow.field_value || "[]") : [];
    const quickWins = topPages.filter((p: any) =>
      p.position >= 4 && p.position <= 15 && (p.impressions || 0) > 100
    );
    return { topPages, quickWins };
  } catch {
    return { topPages: [], quickWins: [] };
  }
}

/* ─── Helper: load PSI baseline data for target pages ─ */
async function loadPageHealthData(projectId: string, targetUrls: string[]): Promise<any[]> {
  if (!targetUrls.length) return [];
  try {
    const { data } = await db().from("dev_pages")
      .select("url,baseline_lcp_ms,baseline_tbt_ms,baseline_score,issues_red,issues_amber,last_audited_at")
      .eq("project_id", projectId)
      .in("url", targetUrls.slice(0, 20));
    return (data || []) as any[];
  } catch { return []; }
}

/* ════════════════════════════════════════════════════════════════
   STEP 1 — Traffic Audit
   GSC analysis: where are clicks coming from, where are quick wins,
   which target pages are underperforming vs impressions.
════════════════════════════════════════════════════════════════ */
const stepTrafficAudit = {
  id: "traffic_audit",
  label: "Audit current organic traffic",
  description: "GSC clicks, impressions, CTR — quick wins at positions 4–15",
  artifact_kind: "traffic_audit",
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const targetUrls = await resolveTargetPages(ctx);
    const { topPages, quickWins } = await loadGscData(ctx.projectId);

    const targetNote = targetUrls.length > 0
      ? `\n\nFocusing on these ${targetUrls.length} target pages:\n${targetUrls.slice(0,10).map(u => `- ${u}`).join("\n")}`
      : "\n\nNo specific target pages set — analysing project-wide top pages.";

    const topPagesSummary = topPages.length > 0
      ? topPages.slice(0, 15).map((p: any) =>
          `${(p.page||p.url||'').replace(/^https?:\/\/[^/]+/,'') || '/'}: ${p.clicks||0} clicks, ${p.impressions||0} impr, pos ${(p.position||0).toFixed(1)}, CTR ${((p.ctr||0)*100).toFixed(1)}%`
        ).join("\n")
      : "No GSC data available — connect GSC in Site Manager to unlock this analysis.";

    const qwSummary = quickWins.length > 0
      ? `${quickWins.length} quick-win opportunities (positions 4–15):\n` +
        quickWins.slice(0,8).map((p: any) =>
          `  pos ${(p.position||0).toFixed(1)} — ${(p.page||p.url||'').replace(/^https?:\/\/[^/]+/,'') || '/'} (${p.impressions||0} impr, ${p.clicks||0} clicks)`
        ).join("\n")
      : "No position 4–15 quick wins identified.";

    const analysis = await llm(
      `You are a Senior SEO Specialist analysing organic traffic data for a growth objective.
Be specific, data-driven, and honest about gaps. No waffle. Max 400 words.`,
      `Analyse this organic traffic data for a traffic growth objective.${targetNote}

GSC top pages:
${topPagesSummary}

${qwSummary}

Identify:
1. Which target pages have the most growth potential and why
2. Which quick-win pages should be prioritised first
3. Pages with high impressions but poor CTR (title/meta opportunity)
4. Any target pages not appearing in GSC at all (indexability risk)

Format as markdown with clear sections.`
    );

    const artifact = `## Traffic Audit\n\n${analysis || "GSC data not available. Connect GSC in Site Manager → Settings to enable traffic analysis."}\n\n---\n**Quick wins (pos 4–15):** ${quickWins.length} pages\n**Top pages analysed:** ${Math.min(topPages.length, 15)}\n**Target pages:** ${targetUrls.length > 0 ? targetUrls.length : "all pages"}`;

    return {
      ok: true,
      output: { topPages: topPages.slice(0,15), quickWins: quickWins.slice(0,10), targetUrls },
      artifact: { kind: "traffic_audit", title: "Traffic Audit", body: artifact },
      honest_note: topPages.length === 0
        ? "No GSC data found. Connect GSC to get real traffic analysis."
        : `Analysed ${topPages.length} pages from GSC. ${quickWins.length} quick-win opportunities found.`,
    };
  },
};

/* ════════════════════════════════════════════════════════════════
   STEP 2 — Page Health Check
   CWV + indexability across target pages. Reads PSI baseline data
   from dev_pages (already captured — no new PSI calls).
════════════════════════════════════════════════════════════════ */
const stepPageHealth = {
  id: "page_health",
  label: "Check page health across target URLs",
  description: "Core Web Vitals, indexability, audit issue counts",
  artifact_kind: "page_health",
  continue_on_fail: true,
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const targetUrls = await resolveTargetPages(ctx);
    const pageData   = await loadPageHealthData(ctx.projectId, targetUrls);

    if (!pageData.length) {
      return {
        ok: true,
        output: { pages: [] },
        artifact: {
          kind: "page_health",
          title: "Page Health",
          body: "## Page Health\n\nNo baseline data available yet. Run baseline capture in Site Manager → Baseline tab first to populate CWV and audit scores.",
        },
        honest_note: "No dev_pages baseline data. Run baseline capture in Site Manager.",
      };
    }

    const badLcp    = pageData.filter(p => p.baseline_lcp_ms > 4000);
    const redIssues = pageData.filter(p => p.issues_red > 0);
    const unaudited = pageData.filter(p => !p.last_audited_at);

    const tableRows = pageData.slice(0, 15).map(p =>
      `| ${(p.url||'').replace(/^https?:\/\/[^/]+/,'') || '/'} | ${p.baseline_lcp_ms ? (p.baseline_lcp_ms/1000).toFixed(2)+'s' : 'N/A'} | ${p.baseline_score || 'N/A'} | ${p.issues_red || 0} 🔴 ${p.issues_amber || 0} 🟡 |`
    ).join("\n");

    const analysis = await llm(
      "You are a Senior SEO Specialist reviewing page health data. Be concise, max 300 words.",
      `Review these target pages for a traffic growth objective:

| URL | LCP | Score | Issues |
|---|---|---|---|
${tableRows}

Summarise:
1. Pages with poor CWV that will hurt rankings
2. Pages with most critical issues to fix first
3. Overall health score for these pages
Keep it actionable.`
    );

    return {
      ok: true,
      output: { pages: pageData, badLcp: badLcp.length, redIssues: redIssues.length },
      artifact: {
        kind: "page_health",
        title: "Page Health Check",
        body: `## Page Health\n\n${analysis}\n\n---\n**Pages checked:** ${pageData.length} | **Poor LCP (>4s):** ${badLcp.length} | **Critical issues:** ${redIssues.length} | **Not yet audited:** ${unaudited.length}`,
      },
      honest_note: `Checked ${pageData.length} pages. ${badLcp.length} have poor LCP, ${redIssues.length} have critical issues.`,
    };
  },
};

/* ════════════════════════════════════════════════════════════════
   STEP 3 — Content Gap Analysis
   Identifies thin content, missing/duplicate meta, pages with
   high impressions but low CTR (title optimisation opportunity).
════════════════════════════════════════════════════════════════ */
const stepContentGap = {
  id: "content_gap",
  label: "Identify content gaps and CTR opportunities",
  description: "Thin content, missing meta, title optimisation for CTR",
  artifact_kind: "content_gap",
  continue_on_fail: true,
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const trafficData = ctx.prior["traffic_audit"] || {};
    const topPages: any[]   = trafficData.topPages || [];
    const targetUrls        = await resolveTargetPages(ctx);
    const keyword           = ctx.scope.keyword || "";

    /* Pages with high impressions but poor CTR — title/meta opportunity */
    const poorCtr = topPages.filter((p: any) => (p.impressions || 0) > 200 && (p.ctr || 0) < 0.03);

    /* Load audit findings if available (from Site Manager audits) */
    const auditFindings = ctx.audit_findings || [];
    const contentFindings = auditFindings.filter((f: any) =>
      ["on_page_fundamentals","content_freshness","first_paragraph"].includes(f.audit_kind)
    );

    const analysis = await llm(
      "You are a Senior SEO Specialist. Be specific and data-driven. Max 400 words.",
      `Analyse content gaps for a traffic growth objective.

Target pages (${targetUrls.length}):
${targetUrls.slice(0,8).map(u => `- ${u.replace(/^https?:\/\/[^/]+/,'') || '/'}`).join("\n")}

Pages with poor CTR despite impressions (title optimisation opportunity):
${poorCtr.slice(0,6).map((p: any) =>
  `- ${(p.page||p.url||'').replace(/^https?:\/\/[^/]+/,'') || '/'}: ${Math.round(p.impressions||0)} impressions, ${((p.ctr||0)*100).toFixed(1)}% CTR`
).join("\n") || "No poor-CTR pages identified."}

Content audit findings from Site Manager:
${contentFindings.slice(0,6).map((f: any) => `- ${f.finding_title}`).join("\n") || "No content audit data — run audit in Site Manager."}
${keyword ? `\nPrimary keyword context: "${keyword}"` : ""}

Identify:
1. Pages where title/meta rewrites would lift CTR immediately
2. Pages with thin or stale content that needs expanding
3. Missing content opportunities based on the page URLs
Keep it specific and actionable.`
    );

    return {
      ok: true,
      output: { poorCtr: poorCtr.length, contentFindings: contentFindings.length },
      artifact: {
        kind: "content_gap",
        title: "Content Gap Analysis",
        body: `## Content Gap Analysis\n\n${analysis || "Run a Site Manager audit on target pages to populate content findings."}\n\n---\n**CTR opportunities:** ${poorCtr.length} pages | **Content findings:** ${contentFindings.length}`,
      },
      honest_note: `${poorCtr.length} poor-CTR pages identified. ${contentFindings.length} content findings from audit.`,
    };
  },
};

/* ════════════════════════════════════════════════════════════════
   STEP 4 — Internal Link Flow
   Which target pages are receiving poor internal link equity?
   Simple heuristic: pages not linked from homepage or navigation,
   or pages with very few inbound internal links.
════════════════════════════════════════════════════════════════ */
const stepInternalLinkFlow = {
  id: "internal_link_flow",
  label: "Analyse internal link flow to target pages",
  description: "Internal PageRank distribution to target URLs",
  artifact_kind: "internal_links",
  continue_on_fail: true,
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const targetUrls = await resolveTargetPages(ctx);
    const trafficData = ctx.prior["traffic_audit"] || {};
    const topPages: any[] = trafficData.topPages || [];

    /* Pages that get clicks but don't rank well — may have link equity issues */
    const underlinked = topPages.filter((p: any) =>
      (p.position || 0) > 10 && (p.clicks || 0) < 50 && (p.impressions || 0) > 100
    );

    const analysis = await llm(
      "You are a Senior SEO Specialist. Max 300 words. Be specific.",
      `Analyse internal linking for a traffic growth objective.

Target pages needing traffic growth:
${targetUrls.slice(0,8).map(u => `- ${u.replace(/^https?:\/\/[^/]+/,'') || '/'}`).join("\n") || "- Not specified"}

Pages ranking poorly (pos >10) despite impressions — may need more internal links:
${underlinked.slice(0,5).map((p: any) =>
  `- ${(p.page||p.url||'').replace(/^https?:\/\/[^/]+/,'') || '/'} pos ${(p.position||0).toFixed(1)}, ${Math.round(p.impressions||0)} impressions`
).join("\n") || "- No underlinked patterns identified from GSC data."}

Recommend:
1. Which pages should be linked FROM (high authority internal pages)
2. Which target pages need the most internal link support
3. Any quick wins (hub pages that could link to multiple target pages)
Be practical — specific page-to-page recommendations where possible.`
    );

    return {
      ok: true,
      output: { underlinked: underlinked.length },
      artifact: {
        kind: "internal_links",
        title: "Internal Link Flow",
        body: `## Internal Link Flow\n\n${analysis || "No internal link data available."}\n\n---\n**Underlinked target pages:** ${underlinked.length}`,
      },
      honest_note: `${underlinked.length} pages identified as potentially underlinked based on GSC position vs impressions ratio.`,
    };
  },
};

/* ════════════════════════════════════════════════════════════════
   STEP 5 — Growth Strategy
   Synthesises all findings into a prioritised action plan.
   Week-by-week roadmap for the target pages.
════════════════════════════════════════════════════════════════ */
const stepGrowthStrategy = {
  id: "growth_strategy",
  label: "Build traffic growth strategy",
  description: "Prioritised action plan from all findings",
  artifact_kind: "strategy",
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const targetUrls     = await resolveTargetPages(ctx);
    const trafficData    = ctx.prior["traffic_audit"]  || {};
    const healthData     = ctx.prior["page_health"]    || {};
    const contentData    = ctx.prior["content_gap"]    || {};
    const linkData       = ctx.prior["internal_link_flow"] || {};

    const strategy = await llm(
      `You are a Senior SEO Strategist building a traffic growth plan.
Output a clear, prioritised action plan. Structure: Priority 1 (do this week), Priority 2 (this month), Priority 3 (next quarter).
Be specific — name the pages, name the fixes. Max 600 words.`,
      `Build a traffic growth strategy based on these findings:

TARGET PAGES (${targetUrls.length}):
${targetUrls.slice(0,8).join(", ")}

TRAFFIC AUDIT:
- Quick wins at positions 4-15: ${trafficData.quickWins?.length || 0} pages
- Top pages: ${trafficData.topPages?.length || 0} pages in GSC

PAGE HEALTH:
- Poor LCP (>4s): ${healthData.badLcp || 0} pages
- Critical audit issues: ${healthData.redIssues || 0} pages

CONTENT GAPS:
- Poor CTR pages (title opportunity): ${contentData.poorCtr || 0}
- Content findings from audit: ${contentData.contentFindings || 0}

INTERNAL LINKS:
- Underlinked pages: ${linkData.underlinked || 0}

Output:
## Priority 1 — This Week (Quick Wins)
## Priority 2 — This Month (Core Fixes)
## Priority 3 — Next Quarter (Growth Foundations)

End with an honest estimated traffic uplift range based on the data.`
    );

    return {
      ok: true,
      output: { strategy },
      artifact: {
        kind: "strategy",
        title: "Traffic Growth Strategy",
        body: `## Traffic Growth Strategy\n\n${strategy || "Could not generate strategy — ensure GSC is connected and Site Manager audit has been run."}`,
      },
      honest_note: "Strategy synthesised from traffic audit, page health, content gaps, and internal link data.",
    };
  },
};

/* ════════════════════════════════════════════════════════════════
   STEP 6 — Client Update
   Plain-English summary of findings and the plan. Written in
   Manav's voice — honest, specific, no jargon.
════════════════════════════════════════════════════════════════ */
const stepClientUpdate = {
  id: "client_update",
  label: "Write client traffic growth update",
  description: "Plain-English summary for the client",
  artifact_kind: "client_update",
  handler: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
    const targetUrls  = await resolveTargetPages(ctx);
    const strategy    = ctx.prior["growth_strategy"]?.strategy || "";
    const quickWins   = (ctx.prior["traffic_audit"]?.quickWins || []).length;
    const badLcp      = ctx.prior["page_health"]?.badLcp || 0;

    const update = await llm(
      `You are writing a client update for an SEO traffic growth campaign.
Write in a professional but plain tone. Honest about timelines. No jargon.
Max 250 words.`,
      `Write a client update for a traffic growth SEO campaign.

Target pages: ${targetUrls.length > 0 ? targetUrls.slice(0,5).map(u => u.replace(/^https?:\/\/[^/]+/,'') || '/').join(", ") : "your key product/category pages"}
Quick win opportunities found: ${quickWins}
Pages with slow load times: ${badLcp}

Strategy summary:
${strategy.slice(0, 800)}

Write a brief client-facing update covering:
1. What we found (1-2 sentences)
2. What we're doing first and why
3. What they can expect in 30/60/90 days
Keep it confident but honest about timelines.`
    );

    return {
      ok: true,
      output: { update },
      artifact: {
        kind: "client_update",
        title: "Client Update — Traffic Growth",
        body: `## Client Update\n\n${update || "Client update could not be generated."}`,
      },
      honest_note: "Client update written from strategy and findings.",
    };
  },
};

/* ════════════════════════════════════════════════════════════════
   Export pipeline definition
════════════════════════════════════════════════════════════════ */
export function buildTrafficGrowthPipeline(): PipelineDefinition {
  return {
    type: "traffic_growth" as any,
    llm_call_cap: 20,
    steps: [
      stepTrafficAudit,
      stepPageHealth,
      stepContentGap,
      stepInternalLinkFlow,
      stepGrowthStrategy,
      stepClientUpdate,
    ],
  };
}
