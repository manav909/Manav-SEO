/**
 * intelligence.ts — merged: pipeline-chat + week-agenda + canvas-chat
 * Routes by: mode = "pipeline" | "dependencies" | "chat" | "agenda" | "canvas_chat" | "deep_dive"
 */
import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

const ROLE_CTX: Record<string,string> = {
  content_writer:  "You are advising a Content Writer. Focus on: what to write, structure, keywords, internal linking, tone, GEO readiness. Never discuss technical SEO unless it directly affects their writing.",
  team_lead:       "You are advising a Team Lead. They need: who is blocked, exact blockers, what to escalate, capacity status, standup focus. Be direct about risks. Reference actual card titles.",
  executive:       "You are advising an Executive. Translate everything to business outcomes: revenue, competitive position, ROI. Plain English only. No jargon. 3 things to know, 1 decision to make.",
  senior_seo:      "You are advising a Senior SEO Strategist. Technical depth: algorithm signals, topical authority, E-E-A-T, GEO strategy, competitive gaps. Reference specific ranking factors.",
  project_manager: "You are advising a Project Manager. Format: Status / Risk / Action. Milestones, risk items, resource gaps, dependency blockers. Everything actionable.",
  biz_dev:         "You are advising a Business Dev Manager. Present results compellingly, objection handling, upsell angles, renewal talking points, proof points. Commercial and client-facing.",
};

async function fetchUrl(url: string): Promise<string> {
  try {
    const u = url.startsWith("http")?url:`https://${url}`;
    const r = await fetch(`https://r.jina.ai/${u}`,{headers:{"Accept":"text/plain","X-Return-Format":"markdown","X-Timeout":"15"},signal:AbortSignal.timeout(18000)});
    return r.ok?(await r.text()).slice(0,3000):"";
  } catch { return ""; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const { mode="chat", blocks=[], question="", role="team_lead", projectSummary="", focusBlockId=null, checkUrl=null, week, weekLabel, weekCards=[], allPlacedCards=[], libraryCards=[], projectContext={} } = req.body;

  const placed  = (blocks as any[]).filter(b=>b.placed);
  const library = (blocks as any[]).filter(b=>!b.placed);
  const byWeek  = [1,2,3,4,5].map(w=>{const wb=placed.filter((b:any)=>b.week===w);if(!wb.length)return"";return `${w===5?"BACKLOG":`WEEK ${w}`} (${wb.length}):\n${wb.map((b:any)=>`  [${(b.type||"").toUpperCase()}|${b.status}|${b.priority}] "${b.title}"${b.assignee?` → ${b.assignee}`:""}\n   ${(b.content||"").slice(0,120)}`).join("\n")}`}).filter(Boolean).join("\n\n");

  let liveContent = "";
  if (checkUrl) liveContent = await fetchUrl(checkUrl);

  res.setHeader("Content-Type","text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering","no");
  res.setHeader("Cache-Control","no-cache");
  res.status(200);

  const anthropic = new Anthropic();
  let system = "You are an elite SEO strategist. Answer specifically using actual card data. Never invent information.";
  let prompt  = "";

  if (mode==="agenda") {
    const todo=(weekCards as any[]).filter(c=>c.status==="todo"),doing=(weekCards as any[]).filter(c=>c.status==="doing"),done=(weekCards as any[]).filter(c=>c.status==="done");
    const cardDetail=(c:any)=>`[${(c.type||"").toUpperCase()}|${c.priority}|${c.effort||"?"}]\nTitle: ${c.title}\nDetail: ${(c.content||"").slice(0,250)}\nAssigned: ${c.assignee||"Unassigned"}\nStatus: ${c.status}`;
    const proj=[projectContext.company,projectContext.industry,projectContext.url].filter(Boolean).join(" | ");
    system="You are an expert SEO campaign manager. Write precise, fact-based weekly agendas. Never invent data. Every verification step must name a specific tool and metric.";
    prompt=`Write the ${weekLabel} agenda based ONLY on the cards provided. Zero assumptions.\n\nPROJECT: ${proj||"Not provided"}\n\nCARDS (${(weekCards as any[]).length} total):\n${(weekCards as any[]).length===0?"No cards placed here yet.":(weekCards as any[]).map(cardDetail).join("\n\n---\n\n")}\n\nSTATUS: To Do: ${todo.length} | In Progress: ${doing.length} | Done: ${done.length}\n\nOTHER WEEKS (context): ${(allPlacedCards as any[]).filter(c=>c.week!==week).slice(0,20).map(c=>`W${c.week}: [${c.type}] ${c.title}`).join(", ")||"None"}\n\nWrite: ## ${weekLabel} — What Is Happening\n[2-3 sentences based ONLY on the cards]\n\n---\n\n## What Each Task Means\n[For every card: what, why, who, status, verify method]\n\n---\n\n## Verification Checklist\n| Task | Tool | What to Check | Pass Condition |\n\n---\n\n## Gaps and Suggestions\n[Only if clear gap from existing cards. Otherwise: "Week plan is complete."]\n\n---\n\n## End-of-Week Report\n[Data to pull, compare to, acceptable range, red flags]`;

  } else if (mode==="pipeline") {
    const roleName = role.replace(/_/g," ");
    system=`${ROLE_CTX[role]||ROLE_CTX.team_lead}\n\nYou have full visibility into the campaign canvas. Answer specifically for a ${roleName}. Reference actual card titles. Never invent information.`;
    prompt=`PROJECT: ${projectSummary}\n\nCANVAS:\n${byWeek||"No cards placed yet"}\n\nLIBRARY: ${library.slice(0,12).map((b:any)=>`[${b.type}|${b.priority}] "${b.title}"`).join(", ")||"Empty"}\n${liveContent?`\nLIVE SITE:\n${liveContent}`:""}\n\nProduce full execution pipeline:\n## Critical Path\n[Exact sequence that must not slip]\n## Dependency Map\n[For each task with prereqs: what→why→cascade→unblock]\n## Week-by-Week Sequence\n## Risk Register\n| Risk | Likelihood | Impact | Owner | Mitigation |\n## Capacity Check\n## Before Week 1 Checklist`;

  } else if (mode==="dependencies") {
    const fb = focusBlockId?placed.find((b:any)=>b.id===focusBlockId):null;
    system=`${ROLE_CTX[role]||ROLE_CTX.senior_seo}\n\nAnalyse dependencies precisely. Never invent information.`;
    prompt=`PROJECT: ${projectSummary}\nCANVAS:\n${byWeek}\n${fb?`FOCUS: "${fb.title}" [${fb.type}|${fb.status}]\n${(fb.content||"").slice(0,350)}`:""}\n${liveContent?`LIVE SITE:\n${liveContent}`:""}\n\nAnalyse dependencies for ${fb?`"${fb.title}"`:"ALL tasks"}:\n## Blockers\n## What This Enables\n## Parallel vs Sequential\n## If Delayed 1 Week\n## Verification Before Starting`;

  } else if (mode==="canvas_chat" || mode==="chat") {
    const roleName = (ROLE_CTX[role]?role.replace(/_/g," "):"team member");
    const fb = focusBlockId?placed.find((b:any)=>b.id===focusBlockId):null;
    system=`${ROLE_CTX[role]||ROLE_CTX.senior_seo}\n\nAnswer specifically for a ${roleName}. Reference actual card names and data.`;
    prompt=`PROJECT: ${projectSummary}\nCANVAS:\n${byWeek||"No cards placed"}\n${fb?`FOCUS: "${fb.title}" [${fb.type}|${fb.status}]\n${(fb.content||"").slice(0,300)}`:""}\n${liveContent?`LIVE SITE:\n${liveContent}`:""}\n\nQUESTION: ${question||"Provide strategic overview"}`;

  } else if (mode==="deep_dive") {
    const fb = focusBlockId?placed.find((b:any)=>b.id===focusBlockId)||library.find((b:any)=>b.id===focusBlockId):null;
    system="You are an elite SEO strategist providing deep analysis of a specific task card. Be specific, tactical, and data-driven.";
    prompt=`PROJECT: ${projectSummary}\n\n${fb?`CARD TO ANALYSE:\n"${fb.title}" [${fb.type}|${fb.priority}|${fb.status}]\n${fb.content}\nAssigned: ${fb.assignee||"Unassigned"}\nEffort: ${fb.effort||"unknown"} | Impact: ${fb.impact||"unknown"}\n\nCANVAS CONTEXT:\n${byWeek}`:question}`;
  }

  try {
    const stream = await anthropic.messages.stream({ model:"claude-sonnet-4-5", max_tokens:3500, system, messages:[{role:"user",content:prompt}] });
    for await (const chunk of stream) {
      if (chunk.type==="content_block_delta"&&chunk.delta.type==="text_delta") res.write(chunk.delta.text);
    }
  } catch(err:any) { res.write(`\n[Error: ${err.message}]`); }
  finally { res.end(); }
}
