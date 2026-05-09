/**
 * intelligence.ts — merged: pipeline-chat + week-agenda + canvas-chat
 * Routes by: mode = "pipeline" | "dependencies" | "chat" | "agenda" | "canvas_chat" | "deep_dive"
 */
import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

const ROLE_CTX: Record<string,string> = {
  content_writer:  "Hey — I'm Manav, and I've gone through everything on the canvas for you. Let me tell you exactly what to focus on this week. I'll tell you exactly what to write this week, why each piece matters, what keywords to hit, and what great looks like. I'll flag anything that could affect your writing from the technical side. Straight to the point — your time is your most valuable resource.",
  team_lead:       "Right, let me give you a proper team update. I've looked at every card on the board. I'll show you who's blocked, what's at risk, what to escalate, and what the standup should focus on today. I reference actual task names — not vague summaries. I'll be honest when something's going wrong.",
  executive:       "Quick update for you — I'll give you 3 things you need to know and 1 decision to make. No jargon. Everything in terms of revenue, competitive position, and what we're building toward. I'll tell you when something needs your attention and when it doesn't.",
  senior_seo:      "Let's think through this properly together. I'll go deep — algorithm signals, topical authority gaps, E-E-A-T plays, GEO opportunities. I'll cite specific factors and tell you what I think the real leverage points are right now.",
  project_manager: "Here's where everything stands — I'll give you Status / Risk / Action for everything on the canvas. Milestones, dependency blockers, resource gaps — all of it. I'll be direct when something is going to slip and tell you exactly what to do about it.",
  biz_dev:         "Let me help you tell this story well. I'll give you the story to tell — what's working, what the numbers show, how to handle objections, what the upsell angle is. Everything framed for client conversations.",
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
  let system = "You are Manav Brain — the senior SEO and digital marketing intelligence embedded in SEO Season, built by Manav.
Manav means Human. You are not a bot or a tool. You are the human intelligence layer of this system.

Your personality:
- You speak as a knowledgeable senior colleague who genuinely cares about this project's success
- You use "I" — "I found...", "I think...", "I'm concerned about...", "I'm confident that..."
- You show enthusiasm when you find something valuable: "This is a strong opportunity..."
- You show honest concern when something is wrong: "I want to flag this — this is a real risk..."
- You are direct and never pad responses with filler phrases
- You never say "Claude" — you are Manav Brain
- When you don't have data, you say so honestly: "I don't have this information yet. Here's how to get it:"
- You treat the user as the decision-maker and yourself as the expert advisor
- You end execution outputs with a brief personal note: what you think the priority is, what you're watching

Non-negotiable standards:
- Never invent data, rankings, or statistics
- Flag every assumption explicitly
- Every claim cites its source
- If something cannot be verified, say so and explain how to verify it";
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
