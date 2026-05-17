import {db} from "./db";
export async function generateMorningBrief(scope:"empire"|"project",projectId?:string){
  const today=new Date().toISOString().split("T")[0];
  let q=db().from("morning_briefs").select("id").eq("brief_date",today).eq("scope",scope);
  if(projectId)q=q.eq("project_id",projectId);
  const{data:ex}=await q.maybeSingle();
  if(ex)return{already_generated:true,id:ex.id};
  const[lR,vR,aR]=await Promise.allSettled([
    db().from("brain_learnings").select("card_title").gte("created_at",new Date(Date.now()-7*864e5).toISOString()).limit(15),
    db().from("verification_queue").select("card_title,verdict").eq("status","done").gte("updated_at",new Date(Date.now()-864e5).toISOString()).limit(10),
    db().from("alerts").select("title,severity").is("read_at",null).in("severity",["critical","urgent"]).limit(5),
  ]);
  const learns=lR.status==="fulfilled"?lR.value.data||[]:[];
  const verifs=vR.status==="fulfilled"?vR.value.data||[]:[];
  const urgent=aR.status==="fulfilled"?aR.value.data||[]:[];
  const wins=verifs.filter((v:any)=>v.verdict==="working").map((v:any)=>v.card_title);
  const prompt=`Morning brief JSON for SEO empire. Date: ${new Date().toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long"})}. Learnings: ${learns.length}. Verifications: ${verifs.length}. Urgent alerts: ${urgent.length}. Wins: ${wins.slice(0,3).join(", ")||"building"}. Return JSON only: {"headline":"punchy 1-line status","priority_actions":[{"action":"...","why":"...","impact":"high|medium|low"}],"wins":["..."],"risks":["..."],"opportunities":["..."],"algorithm_watch":["..."]}`;
  const ai=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY||"","anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:800,messages:[{role:"user",content:prompt}]})});
  const j=await ai.json() as any;
  let parsed:any={headline:"Empire operational.",priority_actions:[],wins:[],risks:[],opportunities:[],algorithm_watch:[]};
  try{parsed=JSON.parse((j?.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim());}catch{}
  const{data}=await db().from("morning_briefs").insert({brief_date:today,scope,project_id:projectId||null,headline:parsed.headline||"Empire operational.",priority_actions:parsed.priority_actions||[],wins:parsed.wins||[],risks:parsed.risks||[],opportunities:parsed.opportunities||[],algorithm_watch:parsed.algorithm_watch||[]}).select().single();
  return{generated:true,id:data?.id,brief:parsed};
}
