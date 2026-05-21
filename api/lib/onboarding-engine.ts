import {db} from "./db";
export async function startOnboarding(projectId:string){
  const{data:project}=await db().from("projects").select("*").eq("id",projectId).single();
  if(!project)return null;
  const{data:session}=await db().from("onboarding_sessions").insert({project_id:projectId,status:"in_progress"}).select().single();
  // Async discovery
  Promise.resolve().then(async()=>{
    try{
      const url=project.url||"";
      let discovery:any={url,started_at:new Date().toISOString()};
      try{
        const res=await fetch(url,{headers:{"User-Agent":"SEOSeason/1.0"},signal:AbortSignal.timeout(8000)});
        const html=await res.text();
        discovery.cms=html.includes("wp-content")?"WordPress":html.includes("Shopify")?"Shopify":"Unknown";
        discovery.hasSchema=/ld\+json/.test(html);
        discovery.hasAnalytics=/gtag|_ga/.test(html);
      }catch{}
      const ai=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY||"","anthropic-version":"2023-06-01"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1200,
          messages:[{role:"user",content:`Create a 12-week SEO strategy for ${url} in ${project.industry||"general"} market. Goals: ${project.goals||"improve organic visibility"}. CMS: ${discovery.cms}. Give practical week-by-week plan with top 5 immediate actions.`}]})});
      const aj=await ai.json() as any;
      discovery.initial_strategy=aj?.content?.[0]?.text||"";
      await db().from("onboarding_sessions").update({status:"strategy_ready",discovery,detected_cms:discovery.cms,initial_strategy:discovery.initial_strategy}).eq("id",session!.id);
    }catch(e:any){await db().from("onboarding_sessions").update({status:"discovery_done",discovery:{error:e.message}}).eq("id",session!.id);}
  }).catch(()=>{});
  return{sessionId:session?.id,status:"discovery_started"};
}
