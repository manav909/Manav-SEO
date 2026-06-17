import {db} from "./db";
export interface LeadInput{url:string;email?:string;name?:string;company?:string;source?:string;market?:string;}
export async function captureAndScoreLead(input:LeadInput){
  const urlClean=input.url.replace(/^https?:\/\//,"").replace(/\/$/,"");
  let score=30;const audit:any={};
  try{
    const res=await fetch(`https://${urlClean}`,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"},signal:AbortSignal.timeout(8000)});
    const html=(await res.text()).slice(0,6000);
    audit.hasTitle=/<title>[^<]{10,}/i.test(html);
    audit.hasMeta=/meta name="description"/i.test(html);
    audit.hasH1=/<h1[^>]*>[^<]{5,}/i.test(html);
    audit.hasSchema=/application\/ld\+json/.test(html);
    audit.missingBasics=[!audit.hasTitle&&"Missing title tag",!audit.hasMeta&&"Missing meta description",!audit.hasH1&&"Missing H1",!audit.hasSchema&&"No structured data"].filter(Boolean);
    const m=audit.missingBasics.length;
    score=m>=3?85:m>=2?70:m>=1?55:40;
    audit.headline=m>0?`We found ${m} critical issue${m>1?"s":""} on ${urlClean} hurting your rankings.`:`${urlClean} looks solid — enter your email for a full competitive analysis.`;
  }catch{audit.headline=`Enter your email to get a full analysis of ${urlClean}.`;audit.missingBasics=[];}
  const{data}=await db().from("prospects").upsert({url:input.url,email:input.email,name:input.name,company:input.company,source:input.source||"organic",market:input.market||"global",lead_score:score,opportunity_size:score>=70?"high":score>=50?"medium":"low",instant_audit:audit,status:"new",next_followup:new Date(Date.now()+3*864e5).toISOString()},{onConflict:"url"}).select().single();

  // Send emails fire-and-forget
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const MANAV_EMAIL = process.env.MANAV_EMAIL || "manav@seoseason.com";
  if (RESEND_KEY) {
    const issuesList = (audit.missingBasics || []).slice(0,5).map((i:string) => `• ${i}`).join("\n");
    const scoreText = `Score: ${score}/100`;
    // Notify Manav
    fetch("https://api.resend.com/emails", {
      method:"POST",
      headers:{"Authorization":`Bearer ${RESEND_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        from:"SEO Season <noreply@seoseason.com>",
        to:[MANAV_EMAIL],
        subject:`🎯 New Lead: ${urlClean}`,
        text:`New lead captured\n\nURL: ${input.url}\nName: ${input.name||"Not provided"}\nEmail: ${input.email||"Not provided"}\n${scoreText}\n\nIssues Found:\n${issuesList||"None detected"}\n\nView: https://seoseason.com/staff-command`,
      }),
    }).catch(()=>{});
    // Send audit to lead
    if (input.email) {
      fetch("https://api.resend.com/emails", {
        method:"POST",
        headers:{"Authorization":`Bearer ${RESEND_KEY}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          from:"Manav | SEO Season <manav@seoseason.com>",
          to:[input.email],
          subject:`Your Free SEO Audit — ${urlClean}`,
          text:`Hi ${input.name||"there"},\n\nThank you for your free SEO audit request.\n\n${scoreText}\n\nKey Issues Found:\n${issuesList||"No major issues detected — great start!"}\n\n${audit.headline||""}\n\nI'll be in touch shortly with your full personalised report.\n\nBest,\nManav\nSEO Season\nhttps://seoseason.com`,
        }),
      }).catch(()=>{});
    }
  }

  return{prospect:data,score,instantAudit:audit};
}
export async function generateProposalHTML(prospectId:string){
  const{data:p}=await db().from("prospects").select("*").eq("id",prospectId).single();
  if(!p)return"<p>Prospect not found.</p>";
  const ai=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY||"","anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2000,messages:[{role:"user",content:`Write a compelling SEO proposal HTML body for ${p.company||p.url}. Issues: ${JSON.stringify(p.instant_audit?.missingBasics||[])}. Market: ${p.market||"global"}. Style: dark #070710, #6366f1 accent. Include: situation analysis, approach, timeline, expected results, CTA. Leave price as [INVESTMENT].`}]})});
  const j=await ai.json() as any;
  return j?.content?.[0]?.text||"<p>Proposal generation failed.</p>";
}
