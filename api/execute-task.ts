import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 180 };

/* ─── What each task type needs & can produce ─── */
const TASK_BLUEPRINTS: Record<string, {
  what_ai_produces: string;
  required_inputs:  { key: string; label: string; why: string; autoFetchable: boolean }[];
  review_checklist: string[];
  verification_method: string;
}> = {
  technical: {
    what_ai_produces: "Exact code/configuration changes, step-by-step implementation instructions, testing commands, and rollback plan",
    required_inputs: [
      { key:"affected_urls",    label:"Affected URLs (paste 3-5)",              why:"Cannot generate redirect rules or fix without knowing exact paths",      autoFetchable:false },
      { key:"current_behavior", label:"What currently happens (the problem)",   why:"Error type, status code, or exact issue determines the fix approach",    autoFetchable:false },
      { key:"live_site_fetch",  label:"Live site scan",                         why:"AI fetches current site to detect issues in real-time",                  autoFetchable:true  },
    ],
    review_checklist: [
      "Test every code change in staging BEFORE applying to live site",
      "Verify HTTP status codes with curl or browser DevTools after applying",
      "Re-crawl affected URLs in Google Search Console → Request Indexing",
      "Check PageSpeed Insights score before/after if speed-related",
      "Confirm no pages blocked by robots.txt after changes",
    ],
    verification_method: "GSC Coverage report indexed count + HTTP status verification on affected URLs",
  },
  content: {
    what_ai_produces: "Full SEO-optimised content draft with heading structure, meta title, meta description, schema markup, internal link suggestions, and word count",
    required_inputs: [
      { key:"target_keyword",   label:"Primary target keyword",                 why:"Entire content strategy built around this — cannot proceed without it",   autoFetchable:false },
      { key:"secondary_keywords",label:"3-5 secondary keywords",               why:"Used for semantic coverage and subheadings",                              autoFetchable:false },
      { key:"search_intent",    label:"Search intent (informational/commercial/transactional)", why:"Determines content format, depth, and CTA placement",    autoFetchable:false },
      { key:"existing_content", label:"Existing content on this topic (URL or paste)", why:"AI cross-references to avoid duplication and add internal links", autoFetchable:true  },
      { key:"word_count_target",label:"Target word count",                      why:"Determines depth and structure of the draft",                            autoFetchable:false },
      { key:"brand_voice_example",label:"One example of brand writing style (URL or paste)", why:"AI matches tone — without this output will be generic",     autoFetchable:false },
    ],
    review_checklist: [
      "Read every paragraph — check all statistics and facts against primary sources",
      "Verify all internal links point to real, live pages",
      "Confirm keyword placement feels natural, not forced or repetitive",
      "Match brand voice — adjust any generic AI phrasing to match client tone",
      "Check meta title is under 60 characters and meta description under 160",
      "Validate schema markup at validator.schema.org before publishing",
      "Add real images (AI cannot source images)",
      "Have client/subject matter expert review any industry claims",
    ],
    verification_method: "GSC Performance report: impressions and position for target keyword (allow 14 days post-publish)",
  },
  geo: {
    what_ai_produces: "Perplexity/ChatGPT-optimised content rewrites, entity-rich summaries, FAQ sections, and structured data to maximise AI citation probability",
    required_inputs: [
      { key:"current_content",  label:"Current content to optimise (URL or paste)", why:"AI needs to see what exists before suggesting GEO improvements",    autoFetchable:true  },
      { key:"target_query",     label:"The exact query you want to appear for in AI search", why:"GEO strategy is query-specific — different queries need different structures", autoFetchable:false },
      { key:"ai_platform",      label:"Priority platform (Perplexity/ChatGPT/Google AI Overview)", why:"Each platform cites differently — structure varies significantly", autoFetchable:false },
    ],
    review_checklist: [
      "Test the target query in Perplexity before AND after — screenshot both",
      "Confirm all factual claims in the rewritten content are accurate",
      "Ensure new structured data is valid before deploying",
      "Check that rewritten content still reads naturally for human visitors",
      "Verify canonical tags are not broken after content update",
    ],
    verification_method: "Manual Perplexity/ChatGPT/Google AI Overview check for target query — screenshot citations",
  },
  "quick-win": {
    what_ai_produces: "Specific before/after changes for meta titles, descriptions, heading structures, image alt tags, or internal anchor text — ready to implement",
    required_inputs: [
      { key:"target_urls",      label:"URLs to optimise (paste 1-10)",          why:"AI fetches each page and generates specific improvements per URL",        autoFetchable:true  },
      { key:"target_metric",    label:"What metric this should improve",         why:"Different metrics require different optimisation approaches",             autoFetchable:false },
    ],
    review_checklist: [
      "Verify each suggested meta title is under 60 chars and compelling",
      "Check each description is under 160 chars and includes a clear CTA",
      "Confirm all suggested H1/H2 changes still make sense in page context",
      "Test changes on mobile — title truncation differs by device",
    ],
    verification_method: "GSC: click-through rate and average position for affected URLs — compare 7 days before vs 7 days after",
  },
  competitive: {
    what_ai_produces: "Gap analysis report, content strategy to outrank specific competitor pages, keyword targeting plan, and link gap recommendations",
    required_inputs: [
      { key:"competitor_url",   label:"Competitor page/domain to analyse",       why:"AI fetches competitor content to find exact gaps",                       autoFetchable:true  },
      { key:"target_keywords",  label:"Keywords to compete on",                  why:"Analysis is keyword-specific — generic analysis not actionable",         autoFetchable:false },
      { key:"ranking_data",     label:"Paste Semrush/Ahrefs ranking export",     why:"Without actual ranking data AI cannot compare positions accurately",     autoFetchable:false },
    ],
    review_checklist: [
      "Cross-check all competitor ranking data in your own Semrush/Ahrefs account",
      "Verify AI-suggested content topics against actual SERP results manually",
      "Confirm link gap recommendations by checking competitor backlink profiles",
      "Review content strategy suggestions against your existing content first",
    ],
    verification_method: "Semrush/Ahrefs position tracking — compare your ranking vs competitor for target keywords after 30 days",
  },
  insight: {
    what_ai_produces: "Deep strategic analysis with specific recommendations, priority sequencing, and impact forecasting based on all available project data",
    required_inputs: [
      { key:"specific_question", label:"Specific question or area to analyse",   why:"Without focus the output will be too broad to be actionable",            autoFetchable:false },
    ],
    review_checklist: [
      "Verify all data references in the analysis against source reports",
      "Challenge any forecasts — AI forecasts are directional, not guaranteed",
      "Ensure recommendations are sequenced correctly given your team's capacity",
    ],
    verification_method: "Track the specific metrics mentioned in the insight over the suggested timeframe",
  },
  weekly: {
    what_ai_produces: "Detailed task brief with step-by-step execution instructions, time estimates, tool requirements, and expected output",
    required_inputs: [
      { key:"task_context",     label:"Additional context about what specifically needs doing", why:"Weekly tasks vary — context determines the right execution approach", autoFetchable:false },
    ],
    review_checklist: [
      "Confirm the deliverable matches the brief before marking done",
      "Check all tool-specific instructions against your actual tool version",
    ],
    verification_method: "Review the stated deliverable against the execution output",
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    card,
    context,         // full project context from project-context API
    userInputs = {}, // { key: value } from the requirement form
    role = "senior_seo",
    phase = "execute", // "requirements" | "execute"
  } = req.body;

  if (!card) return res.status(400).json({ error: "Missing card" });

  const blueprint = TASK_BLUEPRINTS[card.type] || TASK_BLUEPRINTS.weekly;

  /* ── PHASE 1: Return what AI needs before executing ── */
  if (phase === "requirements") {
    const missing: typeof blueprint.required_inputs = [];
    const available: { label: string; value: string; source: string }[] = [];

    // Check what's already known from project context
    const ctx = context || {};

    // Auto-populate from context
    const contextMap: Record<string, string> = {
      target_keyword:    ctx.goals?.keywords || (Array.isArray(ctx.project?.keywords) ? ctx.project.keywords[0] : "") || "",
      competitor_url:    ctx.competitors?.c1 || "",
      cms:               ctx.tech?.cms || "",
      live_site_fetch:   ctx.project?.url || "",
    };

    for (const req2 of blueprint.required_inputs) {
      const fromContext = contextMap[req2.key];
      const fromUser    = userInputs[req2.key];

      if (fromUser) {
        available.push({ label: req2.label, value: fromUser, source: "You provided" });
      } else if (fromContext) {
        available.push({ label: req2.label, value: fromContext, source: "From Data Room" });
      } else if (req2.autoFetchable && ctx.project?.url) {
        available.push({ label: req2.label, value: `Will fetch: ${ctx.project.url}`, source: "Auto-fetch" });
      } else {
        missing.push(req2);
      }
    }

    const gaps: string[] = [];
    if (ctx.gaps?.noGoal)       gaps.push("No campaign goal set in Data Room");
    if (ctx.gaps?.noCMS)        gaps.push("CMS not recorded — technical execution will be generic");
    if (ctx.gaps?.noAnalytics)  gaps.push("No analytics baseline — AI cannot forecast impact accurately");
    if (ctx.gaps?.noDocuments)  gaps.push("No tool exports uploaded — analysis based on estimates only");

    return res.status(200).json({
      success:           true,
      phase:             "requirements",
      blueprint,
      available,
      missing,
      data_room_gaps:    gaps,
      can_execute_now:   missing.length === 0,
    });
  }

  /* ── PHASE 2: Execute ── */
  const ctx = context || {};

  // Fetch live site if needed and URL available
  let liveContent = "";
  const needsLiveFetch = blueprint.required_inputs.some(r => r.autoFetchable);
  if (needsLiveFetch && ctx.project?.url) {
    try {
      const pageUrl = userInputs.target_urls?.split("\n")[0]?.trim() || userInputs.competitor_url || ctx.project.url;
      const url = pageUrl.startsWith("http") ? pageUrl : `https://${pageUrl}`;
      const r = await fetch(`https://r.jina.ai/${url}`, {
        headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "15" },
        signal: AbortSignal.timeout(18000),
      });
      if (r.ok) liveContent = (await r.text()).slice(0, 4000);
    } catch {}
  }

  const ROLE_VOICE: Record<string, string> = {
    content_writer:  "Write as a content director briefing a writer. Be specific about structure, keywords, and what makes this piece valuable.",
    team_lead:       "Write as a team lead briefing an executor. Be precise about steps, dependencies, and what done looks like.",
    executive:       "Write as an advisor to a business owner. Translate technical actions to business outcomes.",
    senior_seo:      "Write as an elite SEO strategist. Include technical precision, algorithm reasoning, and compounding effects.",
    project_manager: "Write as a PM creating a work order. Include deliverable spec, acceptance criteria, and timeline.",
    biz_dev:         "Write as a client success manager. Frame work in terms of client value and measurable results.",
  };

  const roleVoice = ROLE_VOICE[role] || ROLE_VOICE.senior_seo;

  const prompt = `You are executing SEO work as an expert with the voice of a ${role.replace("_"," ")}. ${roleVoice}

TASK TO EXECUTE:
Type: ${card.type}
Title: "${card.title}"
Description: ${card.content}
Priority: ${card.priority}
Expected impact: ${card.impact || "not specified"}

COMPLETE PROJECT INTELLIGENCE:
Company: ${ctx.project?.name || "Unknown"} | URL: ${ctx.project?.url || "Not set"}
CMS: ${ctx.tech?.cms || "Not recorded"} | SEO Plugin: ${ctx.tech?.seoPlugin || "Not recorded"}
Primary goal: ${ctx.goals?.primary || "Not set"} | Timeline: ${ctx.goals?.timeline || "Not set"}
Target keywords: ${ctx.goals?.keywords || ctx.project?.keywords?.slice(0,5).join(", ") || "Not set"}
Success metric: ${ctx.goals?.success || "Not defined"}
Organic sessions/month: ${ctx.analytics?.organicMonthly || "Unknown"}
Pages indexed: ${ctx.technical?.pagesIndexed || "Unknown"}
Crawl errors known: ${ctx.technical?.crawlErrors || "None recorded"}
Competitors: ${[ctx.competitors?.c1, ctx.competitors?.c2].filter(Boolean).join(", ") || "Not recorded"}
Our DR: ${ctx.competitors?.ourDR || "Unknown"} | Referring domains: ${ctx.competitors?.ourRD || "Unknown"}

INFORMATION YOU PROVIDED:
${Object.entries(userInputs).map(([k,v]) => `${k}: ${v}`).join("\n") || "None provided — AI will work from project data only"}

${liveContent ? `LIVE PAGE DATA FETCHED NOW:\n${liveContent}` : ""}

AUDIT INTELLIGENCE:
${ctx.audits?.slice(0,2).map((a: any) => `${a.date}: ${Object.values(a.sections).join(" | ")}`).join("\n") || "No audits available"}

---

EXECUTION RULES — NON-NEGOTIABLE:
1. Only state facts you can verify from the data above. If a fact is not in the data, explicitly say "I do not have this data — please check [specific source]"
2. Every specific number, URL, or metric must cite its source (e.g. "from your GSC data" or "from the audit report")
3. Never invent competitor data, rankings, or statistics
4. Flag every assumption with "⚠ ASSUMPTION — verify before using:"
5. End every execution with a HUMAN REVIEW CHECKLIST — list exactly what a human must check before this is considered done
6. If critical information is missing, list it and explain what you WOULD do if you had it

Now execute this task completely. Produce the actual deliverable — not instructions about what to do, but the actual output that can be used immediately.

${card.type === "content" ? "Include: Full content draft, meta title, meta description, heading structure, schema markup, internal link suggestions" : ""}
${card.type === "technical" ? "Include: Exact code/configuration, step-by-step instructions, test commands, rollback plan" : ""}
${card.type === "geo" ? "Include: Rewritten content sections, FAQ additions, structured data, entity optimisations" : ""}
${card.type === "quick-win" ? "Include: Specific before/after for each element, implementation instructions per URL" : ""}
${card.type === "competitive" ? "Include: Gap analysis table, content strategy, specific pages to create or improve, keyword targeting plan" : ""}

Format output clearly with headers. Every section that contains AI-generated content must start with:
**[AI GENERATED — REQUIRES HUMAN REVIEW]**`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200);

  try {
    const anthropic = new Anthropic();
    const stream = await anthropic.messages.stream({
      model:      "claude-sonnet-4-5",
      max_tokens: 4000,
      system:     `You are an elite SEO execution engine. You produce actual deliverables, not advice. You are rigorous about sourcing every claim. You flag every assumption. You never hallucinate data. When data is missing you say so explicitly and tell the user exactly where to get it.`,
      messages:   [{ role: "user", content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        res.write(chunk.delta.text);
      }
    }
  } catch (err: any) {
    res.write(`\n[Execution error: ${err.message}]`);
  } finally {
    res.end();
  }
}
