/**
 * analysis.ts — merged: seo-agent + extract-document + audit-sync
 * Routes by: action = "audit" | "extract" | "sync_audit"
 */
import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const { action="audit" } = req.body;

  /* ── EXTRACT DOCUMENT ── */
  if (action==="extract") {
    const { content, fileName, docType, projectContext="" } = req.body;
    if (!content) return res.status(400).json({error:"No content provided"});
    const anthropic = new Anthropic();
    const prompt = `You are an expert SEO data analyst. Extract every piece of SEO-relevant data from this document.\nDocument: ${fileName||"unknown"} (type: ${docType||"unknown"})\nProject: ${projectContext}\n\nCONTENT:\n${String(content).slice(0,15000)}\n\nReturn ONLY valid JSON:\n{"doc_summary":"2-sentence description","data_quality":"high|medium|low","date_range":"period or null","extracted":{"keywords":[{"keyword":"","position":null,"impressions":null,"clicks":null,"ctr":null}],"pages":[{"url":"","status_code":null,"title":"","issues":[]}],"technical_issues":[{"issue":"","severity":"critical|high|medium|low","count":null}],"metrics":{"total_pages":null,"indexed_pages":null,"total_keywords":null,"avg_position":null,"total_impressions":null,"total_clicks":null,"organic_traffic":null,"domain_rating":null},"action_items":[{"priority":"critical|high|medium|low","action":"","evidence":""}]},"knowledge_fields":[{"category":"technical|analytics|competitor|content|cms","key":"","value":"","notes":""}]}`;
    try {
      const response = await anthropic.messages.create({model:"claude-sonnet-4-5",max_tokens:4000,messages:[{role:"user",content:prompt}]});
      const raw=response.content[0].type==="text"?response.content[0].text:"{}";
      const f=raw.indexOf("{"),l=raw.lastIndexOf("}");
      let parsed:any={};
      try{parsed=JSON.parse(raw.slice(f,l+1));}catch{}
      return res.status(200).json({success:true,extracted:parsed});
    } catch(err:any) { return res.status(500).json({success:false,error:err.message}); }
  }

  /* ── AUDIT (SEO Agent — streaming) ── */
  const { url, keyword, mode="standard", projectContext="" } = req.body;
  if (!url) return res.status(400).json({error:"URL required"});

  res.setHeader("Content-Type","text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering","no");
  res.setHeader("Cache-Control","no-cache");
  res.status(200);

  let siteContent = "";
  try {
    const cleanUrl = url.startsWith("http")?url:`https://${url}`;
    const r = await fetch(`https://r.jina.ai/${cleanUrl}`,{headers:{"Accept":"text/plain","X-Return-Format":"markdown","X-Timeout":"25"},signal:AbortSignal.timeout(30000)});
    if (r.ok) siteContent = (await r.text()).slice(0, mode==="deep"?16000:8000);
  } catch { siteContent = "(Could not fetch live site — analysis based on URL and context only)"; }

  const maxTokens = mode==="deep"?16000:8000;
  const prompt = `You are an elite SEO analyst conducting a comprehensive audit.\n\nSITE: ${url}\nTARGET KEYWORD: ${keyword||"Not specified"}\nMODE: ${mode}\n\n${projectContext?`PROJECT CONTEXT:\n${projectContext}\n\n`:""}\nLIVE SITE CONTENT:\n${siteContent}\n\nProvide a comprehensive SEO audit covering:\n\n## Technical SEO\nCrawlability, indexation, page speed signals, Core Web Vitals indicators, schema markup, canonical tags, robots.txt, sitemap\n\n## On-Page SEO\nTitle tags, meta descriptions, heading structure, keyword usage, content quality, internal linking, image optimisation\n\n## Content Analysis\nContent depth, topical authority, E-E-A-T signals, freshness, uniqueness, user intent alignment\n\n## GEO / AI Visibility\nPerplexity citation potential, structured data for AI, entity coverage, FAQ opportunities\n\n## Quick Wins\n[List 5 highest-impact changes that could be made this week — specific, actionable]\n\n## Priority Action Plan\n[Ranked list: Critical → High → Medium — with specific implementation steps]\n\nFor every finding: cite what you actually observed in the content above, or state "Could not verify — requires manual check with [specific tool]". Never fabricate findings.`;

  try {
    const anthropic = new Anthropic();
    const stream = await anthropic.messages.stream({model:"claude-sonnet-4-5",max_tokens:maxTokens,system:"You are Manav Brain — the senior SEO and digital marketing intelligence embedded in SEO Season, built by Manav.
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
- If something cannot be verified, say so and explain how to verify it

Every finding must be based on observable data. Never invent rankings or metrics.",messages:[{role:"user",content:prompt}]});
    for await (const chunk of stream) {
      if (chunk.type==="content_block_delta"&&chunk.delta.type==="text_delta") res.write(chunk.delta.text);
    }
  } catch(err:any) { res.write(`\n[Error: ${err.message}]`); }
  finally { res.end(); }
}
