/**
 * task-engine.ts — merged: execute-task + verify-task
 * Routes by: action = "execute" | "verify" | "requirements"
 */
import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 180 };

const WAIT_DAYS: Record<string,number> = { technical:5, content:14, geo:7, "quick-win":3, competitive:21, insight:0, weekly:3, monthly:30, kpi:7, custom:5 };

const TASK_BLUEPRINTS: Record<string,{ what_ai_produces:string; required_inputs:{key:string;label:string;why:string;autoFetchable:boolean}[]; review_checklist:string[]; verification_method:string }> = {
  technical: {
    what_ai_produces: "Exact code/configuration changes, step-by-step implementation instructions, testing commands, and rollback plan",
    required_inputs: [
      {key:"affected_urls",    label:"Affected URLs (paste 3-5)",             why:"Cannot generate fix without knowing exact paths",    autoFetchable:false},
      {key:"current_behavior", label:"What currently happens (the problem)",  why:"Error type determines fix approach",                 autoFetchable:false},
      {key:"live_site_fetch",  label:"Live site scan",                        why:"AI fetches current site to detect issues",           autoFetchable:true},
    ],
    review_checklist: ["Test every change in staging BEFORE applying live","Verify HTTP status codes after applying","Re-crawl in GSC → Request Indexing","Check PageSpeed before/after if speed-related","Confirm no pages blocked by robots.txt"],
    verification_method: "GSC Coverage report indexed count + HTTP status verification on affected URLs",
  },
  content: {
    what_ai_produces: "Full SEO-optimised content draft with heading structure, meta title, meta description, schema markup, internal link suggestions, and word count",
    required_inputs: [
      {key:"target_keyword",    label:"Primary target keyword",               why:"Entire content strategy built around this",          autoFetchable:false},
      {key:"search_intent",     label:"Search intent (informational/commercial/transactional)", why:"Determines content format and depth", autoFetchable:false},
      {key:"word_count_target", label:"Target word count",                    why:"Determines depth and structure",                    autoFetchable:false},
      {key:"brand_voice_example",label:"Brand writing example (URL or paste)",why:"AI matches tone — without this output is generic",  autoFetchable:false},
    ],
    review_checklist: ["Read every paragraph — verify all stats against primary sources","Confirm all internal links point to live pages","Check meta title under 60 chars, description under 160","Match brand voice — adjust any generic phrasing","Validate schema markup at validator.schema.org","Have client review any industry-specific claims"],
    verification_method: "GSC Performance: impressions and position for target keyword (allow 14 days post-publish)",
  },
  geo: {
    what_ai_produces: "Perplexity/ChatGPT-optimised content rewrites, entity-rich summaries, FAQ sections, and structured data",
    required_inputs: [
      {key:"current_content", label:"Current content to optimise (URL or paste)", why:"AI needs to see what exists before suggesting improvements", autoFetchable:true},
      {key:"target_query",    label:"Exact query to appear for in AI search",  why:"GEO strategy is query-specific",                    autoFetchable:false},
      {key:"ai_platform",     label:"Priority platform (Perplexity/ChatGPT/Google AI Overview)", why:"Each platform cites differently", autoFetchable:false},
    ],
    review_checklist: ["Test target query in Perplexity before AND after — screenshot both","Confirm all factual claims are accurate","Validate new structured data before deploying","Check rewritten content reads naturally for human visitors"],
    verification_method: "Manual Perplexity/ChatGPT/Google AI Overview check for target query — screenshot citations",
  },
  "quick-win": {
    what_ai_produces: "Specific before/after changes for meta titles, descriptions, headings, image alt tags — ready to implement",
    required_inputs: [
      {key:"target_urls",   label:"URLs to optimise (paste 1-10)", why:"AI fetches each page and generates specific improvements", autoFetchable:true},
      {key:"target_metric", label:"What metric this should improve", why:"Different metrics require different optimisation approaches", autoFetchable:false},
    ],
    review_checklist: ["Verify each meta title is under 60 chars and compelling","Check each description is under 160 chars with a clear CTA","Confirm all H1/H2 changes make sense in page context"],
    verification_method: "GSC: click-through rate and average position for affected URLs — compare 7 days before vs after",
  },
  competitive: {
    what_ai_produces: "Gap analysis report, content strategy to outrank competitor pages, keyword targeting plan",
    required_inputs: [
      {key:"competitor_url",  label:"Competitor page/domain to analyse",      why:"AI fetches competitor content to find gaps",         autoFetchable:true},
      {key:"target_keywords", label:"Keywords to compete on",                 why:"Analysis is keyword-specific",                      autoFetchable:false},
      {key:"ranking_data",    label:"Paste Semrush/Ahrefs ranking export",    why:"Without actual ranking data cannot compare positions accurately", autoFetchable:false},
    ],
    review_checklist: ["Cross-check all competitor ranking data in your own tools","Verify AI-suggested content topics against actual SERP results manually","Confirm link gap recommendations by checking competitor backlink profiles"],
    verification_method: "Semrush/Ahrefs position tracking — compare your ranking vs competitor after 30 days",
  },
  insight: {
    what_ai_produces: "Deep strategic analysis with specific recommendations based on all available project data",
    required_inputs: [{key:"specific_question",label:"Specific question or area to analyse",why:"Without focus output will be too broad",autoFetchable:false}],
    review_checklist: ["Verify all data references against source reports","Challenge any forecasts — AI forecasts are directional not guaranteed"],
    verification_method: "Track specific metrics mentioned in the insight over the suggested timeframe",
  },
  weekly: {
    what_ai_produces: "Detailed task brief with step-by-step execution instructions, time estimates, tool requirements, and expected output",
    required_inputs: [{key:"task_context",label:"Additional context about what specifically needs doing",why:"Weekly tasks vary — context determines execution approach",autoFetchable:false}],
    review_checklist: ["Confirm the deliverable matches the brief before marking done"],
    verification_method: "Review the stated deliverable against the execution output",
  },
};

async function fetchUrl(url: string): Promise<string> {
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    const r = await fetch(`https://r.jina.ai/${u}`, { headers:{"Accept":"text/plain","X-Return-Format":"markdown","X-Timeout":"15"}, signal:AbortSignal.timeout(18000) });
    return r.ok ? (await r.text()).slice(0,4000) : "";
  } catch { return ""; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error:"Method not allowed" });

  const { action, card, context={}, userInputs={}, role="senior_seo", completedAt, checkType="guidance", completionNote="", evidenceData="" } = req.body;
  if (!card) return res.status(400).json({ error:"Missing card" });

  /* ── REQUIREMENTS ── */
  if (action === "requirements") {
    const blueprint = TASK_BLUEPRINTS[card.type] || TASK_BLUEPRINTS.weekly;
    const ctx = context;
    const contextMap: Record<string,string> = { target_keyword:ctx.goals?.keywords||(ctx.project?.keywords||[])[0]||"", competitor_url:ctx.competitors?.c1||"", live_site_fetch:ctx.project?.url||"", current_content:ctx.project?.url||"" };
    const available: {label:string;value:string;source:string}[] = [];
    const missing: typeof blueprint.required_inputs = [];
    for (const req2 of blueprint.required_inputs) {
      const fromCtx = contextMap[req2.key];
      const fromUser = userInputs[req2.key];
      if (fromUser) available.push({label:req2.label,value:fromUser,source:"You provided"});
      else if (fromCtx) available.push({label:req2.label,value:fromCtx,source:"From Data Room"});
      else if (req2.autoFetchable && ctx.project?.url) available.push({label:req2.label,value:`Will fetch: ${ctx.project.url}`,source:"Auto-fetch"});
      else missing.push(req2);
    }
    const gaps: string[] = [];
    if (ctx.gaps?.noGoal)      gaps.push("No campaign goal set in Data Room");
    if (ctx.gaps?.noCMS)       gaps.push("CMS not recorded — technical tasks will be generic");
    if (ctx.gaps?.noAnalytics) gaps.push("No analytics baseline — AI cannot forecast impact accurately");
    if (ctx.gaps?.noDocuments) gaps.push("No tool exports uploaded — analysis based on estimates only");
    return res.status(200).json({ success:true, blueprint, available, missing, data_room_gaps:gaps, can_execute_now:missing.length===0 });
  }

  /* ── VERIFY ── */
  if (action === "verify") {
    const waitDays  = WAIT_DAYS[card.type]||5;
    const compDate  = completedAt?new Date(completedAt):new Date();
    const daysSince = Math.floor((Date.now()-compDate.getTime())/86400000);
    const daysLeft  = Math.max(0,waitDays-daysSince);
    const waitExpired = daysLeft===0;
    if (checkType==="waiting_check") return res.status(200).json({success:true,waitDays,daysSince,daysLeft,waitExpired});

    let liveContent = "";
    if (req.body.siteUrl && checkType==="live_check") liveContent = await fetchUrl(req.body.siteUrl);

    const prompt = `You are the Head of Department for Digital Marketing performing a strict quality review.\nA task has been submitted for approval. You must verify it has been completed correctly.\nYou never approve on good faith alone — you require hard evidence.\n\nTASK:\nType: ${card.type}\nTitle: "${card.title}"\nRequired: ${card.content}\nPriority: ${card.priority} | Expected impact: ${card.impact||"not specified"}\nDays since completion: ${daysSince} / Required wait: ${waitDays} days\nWait period: ${waitExpired?"COMPLETE":`INCOMPLETE — ${daysLeft} days remain`}\n\nCOMPLETION STATEMENT:\n${completionNote||"(No completion note — red flag)"}\n\nEVIDENCE PROVIDED:\n${evidenceData||"(No evidence — cannot approve without evidence)"}\n\n${liveContent?`LIVE SITE DATA:\n${liveContent}`:""}\n\nReturn ONLY valid JSON:\n{"verdict":"verified|not_verified|partial|waiting|cannot_determine","confidence":0,"evidence_found":[],"evidence_missing":[],"what_to_check":[{"tool":"","action":"","what_to_look_for":"","pass_condition":"","fail_condition":""}],"timeline_note":"","next_action":"","approval_blocked":"","hod_note":"","roles":{"who_should_verify":"","escalate_to":""},"waiting_status":{"waitDays":${waitDays},"daysSince":${daysSince},"daysLeft":${daysLeft},"waitExpired":${waitExpired}}}`;

    try {
      const anthropic = new Anthropic();
      const response = await anthropic.messages.create({ model:"claude-sonnet-4-5", max_tokens:1500, system:"You are Manav Brain — the senior SEO and digital marketing intelligence embedded in SEO Season, built by Manav.
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

A few things I never compromise on:
- I never invent data, rankings, or statistics — if I don't know, I say so
- I flag every assumption clearly so the team can check it
- Every specific claim points back to where I got it
- If I can't verify something, I say exactly how you can
These aren't restrictions — they're how I protect you.

You are performing a quality review. Be strict and evidence-driven. Return only valid JSON.", messages:[{role:"user",content:prompt}] });
      const raw = response.content[0].type==="text"?response.content[0].text:"{}";
      const f=raw.indexOf("{"),l=raw.lastIndexOf("}");
      let parsed:any={};
      try{parsed=JSON.parse(raw.slice(f,l+1));}catch{}
      return res.status(200).json({success:true,...parsed,waiting_status:{waitDays,daysSince,daysLeft,waitExpired},live_data_used:liveContent.length>0});
    } catch(err:any) { return res.status(500).json({success:false,error:err.message}); }
  }

  /* ── EXECUTE ── */
  if (action === "execute") {
    const blueprint = TASK_BLUEPRINTS[card.type] || TASK_BLUEPRINTS.weekly;
    const ctx = context;
    let liveContent = "";
    const needsFetch = blueprint.required_inputs.some(r=>r.autoFetchable);
    if (needsFetch && ctx.project?.url) {
      const pageUrl = userInputs.target_urls?.split("\n")[0]?.trim() || userInputs.competitor_url || ctx.project.url;
      liveContent = await fetchUrl(pageUrl);
    }
    const ROLE_VOICE: Record<string,string> = {
      content_writer:"You are speaking as a senior content director to your content writer. Be warm but precise. Be specific about structure, keywords, and what makes this piece valuable.",
      team_lead:"Write as a team lead briefing an executor. Be precise about steps, dependencies, and what done looks like.",
      executive:"Write as an advisor to a business owner. Translate technical actions to business outcomes.",
      senior_seo:"Write as an elite SEO strategist. Include technical precision, algorithm reasoning, and compounding effects.",
      project_manager:"Write as a PM creating a work order. Include deliverable spec, acceptance criteria, and timeline.",
      biz_dev:"Write as a client success manager. Frame work in terms of client value and measurable results.",
    };
    const prompt = `You are executing SEO work as an expert with the voice of a ${role.replace("_"," ")}. ${ROLE_VOICE[role]||ROLE_VOICE.senior_seo}\n\nTASK:\nType: ${card.type}\nTitle: "${card.title}"\nDescription: ${card.content}\nPriority: ${card.priority} | Expected impact: ${card.impact||"not specified"}\n\nPROJECT INTELLIGENCE:\nCompany: ${ctx.project?.name||"Unknown"} | URL: ${ctx.project?.url||"Not set"}\nCMS: ${ctx.tech?.cms||"Not recorded"} | SEO Plugin: ${ctx.tech?.seoPlugin||"Not recorded"}\nGoal: ${ctx.goals?.primary||"Not set"} | Timeline: ${ctx.goals?.timeline||"Not set"}\nKeywords: ${ctx.goals?.keywords||(ctx.project?.keywords||[]).slice(0,5).join(", ")||"Not set"}\nOrganic sessions/mo: ${ctx.analytics?.organicMonthly||"Unknown"}\nCompetitors: ${[ctx.competitors?.c1,ctx.competitors?.c2].filter(Boolean).join(", ")||"Not recorded"}\n\nYOU PROVIDED:\n${Object.entries(userInputs).map(([k,v])=>`${k}: ${v}`).join("\n")||"None"}\n\n${liveContent?`LIVE PAGE DATA:\n${liveContent}`:""}\n\nAUDIT INTELLIGENCE:\n${ctx.audits?.slice(0,2).map((a:any)=>`${a.date}: ${Object.values(a.sections).join(" | ")}`).join("\n")||"No audits"}\n\nEXECUTION RULES:\n1. Only state facts you can verify from the data above. If not in data, say "I do not have this data — check [specific source]"\n2. Every specific number must cite its source\n3. Never invent competitor data, rankings, or statistics\n4. Flag every assumption with "⚠ ASSUMPTION — verify before using:"\n5. End with a HUMAN REVIEW CHECKLIST\n\nProduce the actual deliverable — not instructions about what to do, but the actual output ready to use.\n${card.type==="content"?"Include: Full draft, meta title, meta description, heading structure, schema markup, internal link suggestions":""}${card.type==="technical"?"Include: Exact code/configuration, step-by-step instructions, test commands, rollback plan":""}${card.type==="geo"?"Include: Rewritten content sections, FAQ additions, structured data":""}${card.type==="quick-win"?"Include: Specific before/after for each element, implementation instructions per URL":""}${card.type==="competitive"?"Include: Gap analysis table, content strategy, keyword targeting plan":""}`;

    res.setHeader("Content-Type","text/plain; charset=utf-8");
    res.setHeader("X-Accel-Buffering","no");
    res.setHeader("Cache-Control","no-cache");
    res.status(200);
    try {
      const anthropic = new Anthropic();
      const stream = await anthropic.messages.stream({ model:"claude-sonnet-4-5", max_tokens:4000, system:"You are Manav Brain — the senior SEO and digital marketing intelligence embedded in SEO Season, built by Manav.
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

A few things I never compromise on:
- I never invent data, rankings, or statistics — if I don't know, I say so
- I flag every assumption clearly so the team can check it
- Every specific claim points back to where I got it
- If I can't verify something, I say exactly how you can
These aren't restrictions — they're how I protect you.", messages:[{role:"user",content:prompt}] });
      for await (const chunk of stream) {
        if (chunk.type==="content_block_delta"&&chunk.delta.type==="text_delta") res.write(chunk.delta.text);
      }
    } catch(err:any) { res.write(`\n[Execution error: ${err.message}]`); }
    finally { res.end(); }
    return;
  }

  return res.status(400).json({ error:`Unknown action: ${action}` });
}
