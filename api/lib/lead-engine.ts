import {db} from "./db";
export interface LeadInput{url:string;email?:string;name?:string;company?:string;source?:string;market?:string;}
export async function captureAndScoreLead(input:LeadInput){
  const urlClean=input.url.replace(/^https?:\/\//,"").replace(/\/$/,"");
  let score=30;const audit:any={};
  try{
    const res=await fetch(`https://${urlClean}`,{headers:{"User-Agent":"SEOSeason-Audit/1.0"},signal:AbortSignal.timeout(8000)});
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
  return{prospect:data,score,instantAudit:audit};
}
export async function generateProposalHTML(prospectId:string){
  const{data:p}=await db().from("prospects").select("*").eq("id",prospectId).single();
  if(!p)return"<p>Prospect not found.</p>";
  const ai=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY||"","anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:2000,messages:[{role:"user",content:`Write a compelling SEO proposal HTML body for ${p.company||p.url}. Issues: ${JSON.stringify(p.instant_audit?.missingBasics||[])}. Market: ${p.market||"global"}. Style: dark #070710, #6366f1 accent. Include: situation analysis, approach, timeline, expected results, CTA. Leave price as [INVESTMENT].`}]})});
  const j=await ai.json() as any;
  return j?.content?.[0]?.text||"<p>Proposal generation failed.</p>";
}
