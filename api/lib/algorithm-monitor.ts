import {db} from "./db";
export async function checkAlgorithmUpdates(){
  const ai=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY||"","anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:600,
      messages:[{role:"user",content:"List 3 important recent Google algorithm updates as JSON: [{"event_type":"core_update","severity":"high","title":"...","description":"...","recommended_actions":["..."]}]. Return JSON array only."}]})});
  const j=await ai.json() as any;
  let events:any[]=[];
  try{events=JSON.parse((j?.content?.[0]?.text||"[]").replace(/```json|```/g,"").trim());}catch{}
  let newCount=0;
  for(const e of events.slice(0,3)){
    const{data:ex}=await db().from("algorithm_events").select("id").ilike("title",`%${(e.title||"").slice(0,25)}%`).maybeSingle();
    if(!ex){
      await db().from("algorithm_events").insert({source:"claude_knowledge",event_type:e.event_type||"core_update",severity:e.severity||"medium",title:e.title||"Algorithm Update",description:e.description||"",recommended_actions:e.recommended_actions||[]}).then(()=>{}).catch(()=>{});
      newCount++;
    }
  }
  return{checked:true,newEvents:newCount};
}
export async function getAlgorithmWatchlist(){
  const{data}=await db().from("algorithm_events").select("*").order("created_at",{ascending:false}).limit(10);
  return data||[];
}
