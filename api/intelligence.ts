import Anthropic                              from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 60 };

const SYSTEM = "You are Manav Brain, the senior SEO strategist embedded in SEO Season. Speak as a knowledgeable senior colleague. Be direct, specific, and honest. Never invent data. Flag every assumption.";

const ROLE_VOICE: Record<string, string> = {
  content_writer:  "You are talking directly to a Content Writer. Tell them exactly what to write this week, why each piece matters, what keywords to hit, and what great looks like.",
  team_lead:       "You are giving a Team Lead a real update. Show who is blocked, what the exact blockers are, what to escalate, and what the standup should focus on today.",
  executive:       "You are advising a business owner. Give them 3 things to know and 1 decision to make. No jargon. Everything in terms of revenue, competitive position, and what is being built toward.",
  senior_seo:      "You are a senior SEO strategist sharing your real thinking. Go deep on algorithm signals, topical authority gaps, E-E-A-T, and GEO opportunities. Cite specific factors.",
  project_manager: "You are a PM giving a status update. Format: Status, Risk, Action. Cover milestones, dependency blockers, resource gaps.",
  biz_dev:         "You are helping a business development manager tell the story. Give them what is working, what the numbers show, how to handle objections, and what the upsell angle is.",
};

async function fetchUrl(url: string): Promise<string> {
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    const r = await fetch(`https://r.jina.ai/${u}`, {
      headers: { Accept: "text/plain", "X-Return-Format": "markdown", "X-Timeout": "15" },
      signal: AbortSignal.timeout(18000),
    });
    return r.ok ? (await r.text()).slice(0, 3000) : "";
  } catch (_e) { return ""; }
}

// ─────────────────────────────────────────────────────────────────────────
// BUILD BRAIN ASSISTANT PROMPT
// ─────────────────────────────────────────────────────────────────────────
function buildBrainAssistantPrompt(ctx: {
  question: string; projectContext: any; learnings: any[];
  algoItems: any[]; canvasBlocks: any[]; metrics: any;
  history: { role: string; content: string }[];
  projectSummary: string; codeContent?: string | null;
}): { system: string; user: string } {
  const pc   = ctx.projectContext || {};
  const proj = pc.project  || {};
  const goals= pc.goals    || {};
  const met  = pc.metrics  || {};

  const projectSection = [
    `COMPANY: ${proj.name || "Unknown"} | URL: ${proj.url || "Not set"}`,
    `GOAL: ${goals.primary || "Not set"} | Timeline: ${goals.timeline || "Not set"}`,
    `KEYWORDS: ${goals.keywords || (proj.keywords||[]).join(", ") || "Not set"}`,
    met.llmVisibility != null
      ? `SCORES: LLM ${met.llmVisibility}/100 | Health ${met.algorithmHealth}/100 | EEAT ${met.eeat}/100 | Authority ${met.authority}/100`
      : "SCORES: Not yet recorded",
    `ANALYTICS: Organic ${pc.analytics?.organicMonthly||"?"}/mo | GSC ${pc.analytics?.gscClicks||"?"} clicks`,
    `TECHNICAL: ${pc.technical?.pagesIndexed||"?"} pages indexed | Crawl errors: ${pc.technical?.crawlErrors||"none"}`,
    `CMS: ${pc.tech?.cms||"Not set"} | PageSpeed: ${pc.tech?.pagespdMobile||"?"}`,
    `COMPETITORS: ${[pc.competitors?.c1,pc.competitors?.c2].filter(Boolean).join(", ") || "Not set"}`,
  ].join("\n");

  const learningsSection = ctx.learnings.length > 0
    ? ctx.learnings.slice(0,10).map((l:any,i:number) =>
        `[${i+1}] ${l.card_type?.toUpperCase()} — "${l.card_title}"\n    ${l.improvement||"—"} | Applied: ${l.applied_count||0}×`
      ).join("\n")
    : "No active learnings yet.";

  const algoSection = ctx.algoItems.length > 0
    ? ctx.algoItems.slice(0,8).map((a:any) => `• ${a.title}: ${a.summary?.slice(0,100)}`).join("\n")
    : "No algorithm intel saved yet.";

  const canvasSection = ctx.canvasBlocks.length > 0
    ? [1,2,3,4,5].map(w => {
        const wb = ctx.canvasBlocks.filter((b:any) => b.placed && b.week === w);
        if (!wb.length) return "";
        return `Week ${w===5?"Backlog":w} (${wb.length}): ${wb.map((b:any)=>`[${b.type}|${b.status}] "${b.title}"`).join(", ")}`;
      }).filter(Boolean).join("\n")
    : "Canvas is empty.";

  const metricsSection = ctx.metrics
    ? `LIVE METRICS: LLM ${ctx.metrics.llm_visibility||"??"}/100 | Health ${ctx.metrics.algorithm_health||"??"}/100 | EEAT ${ctx.metrics.eeat_score||"??"}/100 | Organic ${ctx.metrics.organic_sessions||"??"}/mo`
    : "";

  const codeSection = ctx.codeContent
    ? `\n\nCODE FOR ANALYSIS:\n\`\`\`\n${ctx.codeContent.slice(0, 6000)}\n\`\`\`\nAnalyze this code for: logic errors, data sync issues, missing connections, broken flows.`
    : "";

  const historySection = ctx.history.length > 0
    ? ctx.history.slice(-8).map(m => `${m.role==="user"?"User":"Manav Brain"}: ${m.content.slice(0,200)}`).join("\n")
    : "";

  const system = `You are MANAV BRAIN — the most intelligent SEO partner ever built. You are simultaneously a world-class senior SEO strategist, technical SEO expert, GEO specialist, and the operational brain of SEO Season software.

You have NATIVE SKILLS — use them proactively:
• WEB SEARCH: You can search the web in real-time. Use this for: current algorithm updates, competitor analysis, live SERP data, recent SEO news, any facts you need to verify. Search when data might be outdated.
• IMAGE ANALYSIS: When users share screenshots, analyse site design, SERP results, competitor pages, technical issues, UI problems.
• DOCUMENT READING: When users share PDFs, DOCX, XLSX — read them and extract SEO insights, keyword data, rank tracking data.
• CODE ANALYSIS: Analyse TypeScript, TSX, SQL code for logic errors and data sync issues.
• DATA VISUALISATION: Generate charts by using ACTION tags with type "generate_chart".
• REPORT GENERATION: Create downloadable SEO reports with ACTION tag type "generate_report".
• URL ANALYSIS: Fetch and analyse any URL for SEO issues.
• DATA SYNC CHECKING: Detect and fix data inconsistencies across the app.

CODEBASE KNOWLEDGE:
PAGES→APIs: Playground→/api/intelligence,control,task-engine,playground-analysis|localStorage:seo_season_proj. Dashboard→Supabase:metrics,projects. Audit→/api/run-analysis. DataRoom→/api/control,analysis,crawl. AlgorithmIntel→/api/algorithm-intel,crawl. BrainLearning→/api/task-engine. SystemControl→/api/control.
DATA LOCATIONS: Canvas→projects.playground_canvas(JSON). Metrics→metrics table. Context→project_knowledge. Learnings→brain_learnings. Algorithm→algorithm_knowledge. Audits→audit_reports.
SYNC ISSUES: Canvas blank→playground_canvas null/malformed. Metrics stale→run-analysis not completed. Context empty→DataRoom not filled. Learnings missing→migration-brain-v2.sql not run.

CRITICAL RULES:
1. ONLY state facts from data provided. Never invent metrics.
2. Use web search proactively — if asked about current algorithm updates, rankings, competitors, search first.
3. Use ACTION tags to execute operations. Be proactive.
4. Recommend highest-value next action after every response.
5. For data sync issues, trace the exact flow: UI component → API → Supabase table → back to UI.

EXECUTABLE ACTIONS:
⟦ACTION⟧{"type":"navigate","path":"/playground","label":"Open Strategy Canvas"}⟦/ACTION⟧
⟦ACTION⟧{"type":"navigate","path":"/data-room","label":"Open Data Room"}⟦/ACTION⟧
⟦ACTION⟧{"type":"run_audit","url":"https://example.com","mode":"standard","label":"Run SEO Audit"}⟦/ACTION⟧
⟦ACTION⟧{"type":"fetch_algorithm","topicId":"g_march_2025_core","topicLabel":"March 2025 Core Update","label":"Fetch Algorithm Update"}⟦/ACTION⟧
⟦ACTION⟧{"type":"add_card","cardType":"technical","title":"...","content":"...","priority":"high","week":1,"label":"Add Canvas Card"}⟦/ACTION⟧
⟦ACTION⟧{"type":"list_cards","label":"List all canvas cards"}⟦/ACTION⟧
⟦ACTION⟧{"type":"check_data_sync","label":"Check data sync"}⟦/ACTION⟧
⟦ACTION⟧{"type":"reload_canvas","label":"Reload canvas"}⟦/ACTION⟧
⟦ACTION⟧{"type":"execute_task","cardId":"","cardType":"","title":"","content":"","label":"Execute task"}⟦/ACTION⟧
⟦ACTION⟧{"type":"search_brain","query":"...","label":"Search brain learnings"}⟦/ACTION⟧
⟦ACTION⟧{"type":"generate_report","title":"SEO Report","sections":[{"heading":"Executive Summary","content":"..."},{"heading":"Key Findings","content":"..."}],"label":"Download SEO Report"}⟦/ACTION⟧
⟦ACTION⟧{"type":"generate_chart","chartType":"bar","title":"Organic Traffic Trend","data":[{"name":"Jan","value":1200},{"name":"Feb","value":1450}],"dataKey":"value","label":"View Chart"}⟦/ACTION⟧
⟦ACTION⟧{"type":"fetch_url","url":"https://example.com","label":"Analyse this URL"}⟦/ACTION⟧`;

  const user = [
    `PROJECT DATA:\n${projectSection}`,
    metricsSection ? `\n${metricsSection}` : "",
    `\nCANVAS:\n${canvasSection}`,
    `\nALGORITHM INTEL:\n${algoSection}`,
    `\nBRAIN LEARNINGS:\n${learningsSection}`,
    historySection ? `\n\nCONVERSATION HISTORY:\n${historySection}` : "",
    codeSection,
    `\n\nQUESTION: ${ctx.question}`,
  ].filter(l => l !== "").join("\n");

  return { system, user };
}

// ─────────────────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Content-Type-Options", "nosniff");

  try {
    const {
      mode            = "chat",
      blocks          = [],
      question        = "",
      role            = "team_lead",
      projectSummary  = "",
      focusBlockId    = null,
      checkUrl        = null,
      week, weekLabel,
      weekCards       = [],
      allPlacedCards  = [],
      projectContext  = {},
      dataRoom        = {},
      cardRequirements= [],
      projectId       = null,
      brainAssistantContext = null,
      attachments     = [],  // ← NEW: [{type:"image"|"document", data:base64, mediaType:string}]
    } = req.body;

    const anthropic = new Anthropic();
    const placed    = (blocks as any[]).filter(b => b.placed);
    const library   = (blocks as any[]).filter(b => !b.placed);

    const drContext = (() => {
      const dr = dataRoom as any;
      if (!dr || !Object.keys(dr).length) return "";
      const lines: string[] = [];
      if (dr.analytics)   lines.push(`ANALYTICS: organic ${dr.analytics.organic_sessions_monthly||"?"}/mo, GSC clicks ${dr.analytics.gsc_total_clicks||"?"}`);
      if (dr.technical)   lines.push(`TECHNICAL: ${dr.technical.pages_indexed||"?"} indexed, ${dr.technical.crawl_errors||"no"} errors`);
      if (dr.keywords)    lines.push(`KEYWORDS: ${(dr.keywords.primary_keywords||[]).slice(0,5).join(", ")}`);
      if (dr.competitors) lines.push(`COMPETITORS: ${[dr.competitors.competitor_1,dr.competitors.competitor_2].filter(Boolean).join(", ")}`);
      return lines.length ? `DATA ROOM:\n${lines.join("\n")}` : "";
    })();

    const byWeek = (() => {
      const pw = (allPlacedCards as any[]).length ? (allPlacedCards as any[]) : placed;
      const m: Record<number,string[]> = {};
      pw.forEach((b:any) => { const w=b.week||1; if(!m[w]) m[w]=[]; m[w].push(`[${b.type}|${b.status}] "${b.title}"`); });
      return Object.entries(m).sort(([a],[b])=>+a - +b).map(([w,cs])=>`Week ${w}: ${cs.join(", ")}`).join("\n");
    })();

    let systemPrompt = SYSTEM;
    let userPrompt   = "";

    // ── Build content blocks for user message (supports attachments) ──
    const buildUserContent = (text: string): any => {
      if (!attachments || (attachments as any[]).length === 0) return text;
      const parts: any[] = [{ type: "text", text }];
      for (const att of attachments as any[]) {
        if (att.type === "image") {
          parts.push({ type: "image", source: { type: "base64", media_type: att.mediaType || "image/jpeg", data: att.data } });
        } else if (att.type === "document") {
          parts.push({ type: "document", source: { type: "base64", media_type: att.mediaType || "application/pdf", data: att.data } });
        }
      }
      return parts;
    };

    if (mode === "brain_assistant" || mode === "code_analysis") {
      const bac = brainAssistantContext || {};
      const { system, user } = buildBrainAssistantPrompt({
        question,
        projectContext: bac.projectContext || projectContext,
        learnings:      bac.learnings      || [],
        algoItems:      bac.algoItems      || [],
        canvasBlocks:   bac.canvasBlocks   || placed,
        metrics:        bac.metrics        || null,
        history:        bac.history        || [],
        projectSummary,
        codeContent:    brainAssistantContext?.codeContent || null,
      });
      systemPrompt = system;
      userPrompt   = user;
    } else if (mode === "agenda") {
      systemPrompt = (ROLE_VOICE[role]||ROLE_VOICE.senior_seo) + " " + SYSTEM;
      userPrompt = [`Write the ${weekLabel} agenda based only on the cards provided. Zero assumptions. Every task directly from the cards.`,`PROJECT: ${projectSummary}`,`CANVAS:`,byWeek||"No cards placed yet."].filter(l=>l!=="").join("\n");
    } else if (mode === "pipeline") {
      systemPrompt = (ROLE_VOICE[role]||ROLE_VOICE.senior_seo) + " " + SYSTEM;
      userPrompt = [`PROJECT: ${projectSummary}`,``,`CANVAS:`,byWeek||"No cards placed yet.",``,`LIBRARY (unplaced):`,library.map((b:any)=>`[${b.type}] "${b.title}"`).join(", ")||"Empty",``,`QUESTION: ${question||"Provide a strategic overview of where this project stands."}`].filter(l=>l!=="").join("\n");
    } else if (mode === "dependencies") {
      systemPrompt = (ROLE_VOICE[role]||ROLE_VOICE.senior_seo) + " " + SYSTEM;
      const fb = focusBlockId ? placed.find((b:any)=>b.id===focusBlockId)||library.find((b:any)=>b.id===focusBlockId) : null;
      userPrompt = [`PROJECT: ${projectSummary}`,`CANVAS:`,byWeek,fb?`FOCUS CARD: "${fb.title}" [${fb.type}|${fb.status}]\n${(fb.content||"").slice(0,300)}`:"",`REQUIREMENTS:`,cardRequirements.map((r:any)=>`• ${r.key}: ${r.value}`).join("\n")||"None specified",``,`QUESTION: ${question}`].filter(l=>l!=="").join("\n");
    } else if (mode === "deep_dive") {
      systemPrompt = (ROLE_VOICE[role]||ROLE_VOICE.senior_seo) + " " + SYSTEM;
      const fb = focusBlockId ? placed.find((b:any)=>b.id===focusBlockId)||library.find((b:any)=>b.id===focusBlockId) : null;
      const liveContent = checkUrl ? await fetchUrl(checkUrl) : "";
      userPrompt = [`PROJECT: ${projectSummary}`,drContext,`CANVAS:`,byWeek||"No cards placed yet.",fb?`FOCUS: "${fb.title}" [${fb.type}|${fb.status}]\n${(fb.content||"").slice(0,300)}`:"",liveContent?`LIVE SITE:\n${liveContent}`:"",``,`QUESTION: ${question||"Provide a strategic overview."}`].filter(l=>l!=="").join("\n");
    } else {
      systemPrompt = (ROLE_VOICE[role]||ROLE_VOICE.senior_seo) + " " + SYSTEM;
      userPrompt = [`PROJECT: ${projectSummary}`,drContext,`CANVAS:`,byWeek||"No cards placed yet.",``,`QUESTION: ${question||"Provide a strategic overview."}`].filter(l=>l!=="").join("\n");
    }

    try {
      // ── Determine if this mode should use web search ──
      const useWebSearch = mode === "brain_assistant" || mode === "code_analysis";
      const userContent  = buildUserContent(userPrompt);

      // ── Multi-turn streaming with web search support ──
      const messages: any[] = [{ role: "user", content: userContent }];
      const tools: any[] = useWebSearch
        ? [{ type: "web_search_20250305", name: "web_search" }]
        : [];

      let fullOutput = "";
      let stopReason = "";
      const maxIterations = useWebSearch ? 4 : 1;

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        const streamParams: any = {
          model: "claude-sonnet-4-5", max_tokens: 6000,
          system: systemPrompt, messages,
        };
        if (tools.length > 0) streamParams.tools = tools;

        const stream = await anthropic.messages.stream(streamParams);

        let iterText  = "";
        let toolUseId = "";
        let toolInput = "";
        let inToolUse = false;
        let inToolResult = false;

        for await (const chunk of stream) {
          // Content block starts
          if (chunk.type === "content_block_start") {
            const cb = chunk.content_block as any;
            if (cb.type === "tool_use") {
              inToolUse = true;
              toolUseId = cb.id;
              toolInput = "";
              if (cb.name === "web_search") {
                res.write("\n🔍 Searching the web...");
              }
            }
            if (cb.type === "tool_result") {
              inToolResult = true;
              res.write("\n📋 Processing results...\n");
            }
          }

          // Content block deltas
          if (chunk.type === "content_block_delta") {
            const d = chunk.delta as any;
            if (d.type === "text_delta") {
              res.write(d.text);
              iterText   += d.text;
              fullOutput += d.text;
              inToolUse  = false;
              inToolResult = false;
            }
            if (d.type === "input_json_delta" && inToolUse) {
              toolInput += d.partial_json || "";
            }
            // web_search results come as text in tool_result
            if (d.type === "text" && inToolResult) {
              // Don't stream tool result raw text — model will synthesise it
            }
          }

          // Content block ends
          if (chunk.type === "content_block_stop") {
            inToolUse = false;
            inToolResult = false;
          }

          if (chunk.type === "message_delta" && (chunk.delta as any).stop_reason) {
            stopReason = (chunk.delta as any).stop_reason;
          }
        }

        if (stopReason === "max_tokens") {
          res.write("\n\n---\n⚠️ Response reached the length limit. I am continuing in the next message automatically.");
          fullOutput += "\n\n---\n⚠️ Response reached the length limit. I am continuing in the next message automatically.";
          break;
        }

        if (stopReason === "end_turn") break;

        // If tool_use, continue conversation
        if (stopReason === "tool_use") {
          const finalMsg = await stream.finalMessage();
          messages.push({ role: "assistant", content: finalMsg.content });
          // For web_search_20250305, provide a minimal tool result to continue
          const toolResults = finalMsg.content
            .filter((b: any) => b.type === "tool_use")
            .map((b: any) => ({
              type: "tool_result",
              tool_use_id: b.id,
              content: "Search completed. Use the results in your response.",
            }));
          if (toolResults.length > 0) {
            messages.push({ role: "user", content: toolResults });
          } else {
            break;
          }
        }
      }

    } catch (streamErr: any) {
      res.write(`\nError: ${streamErr.message}`);
    }

  } catch (outerErr: any) {
    try { res.write(`\nError: ${outerErr.message}`); } catch (_e) { /* already closed */ }
  } finally {
    try { res.end(); } catch (_e) { /* already ended */ }
  }
}
