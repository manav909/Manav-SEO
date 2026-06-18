import {db} from "./db";
export async function generateContentCalendar(projectId:string,weeksAhead:number=4){
  const{data:p}=await db().from("projects").select("name,goals,industry,market").eq("id",projectId).single();
  if(!p)return null;
  const _today=new Date(); const _todayISO=_today.toISOString().slice(0,10);
  const ai=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY||"","anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,
      system:`Today is ${_todayISO} and the current year is ${_today.getUTCFullYear()}. Treat this as the present moment. Every scheduled_for date MUST be on or after ${_todayISO}; never schedule content in a past year.`,
      messages:[{role:"user",content:`Create a ${weeksAhead}-week content calendar for ${p.name} (${p.industry||"general"}, ${p.market||"global"}). Goals: ${p.goals||"improve visibility"}. Return JSON array (${weeksAhead*2} items): [{"title":"...","target_keyword":"...","content_type":"article|guide|faq","scheduled_for":"YYYY-MM-DD","seo_priority":80,"llm_priority":true}]. Start from today, ${_todayISO}; every scheduled_for is on or after this date. Return JSON only.`}]})});
  const aj=await ai.json() as any;
  let calendar:any[]=[];
  try{calendar=JSON.parse((aj?.content?.[0]?.text||"[]").replace(/```json|```/g,"").trim());}catch{}
  for(const item of calendar){
    await db().from("content_calendar").insert({project_id:projectId,title:item.title,target_keyword:item.target_keyword,content_type:item.content_type||"article",scheduled_for:item.scheduled_for,seo_priority:item.seo_priority||50,llm_priority:item.llm_priority||false,status:"planned"}).then(()=>{}).catch(()=>{});
  }
  return{planned:calendar.length};
}
export async function getContentCalendar(projectId:string){
  const{data}=await db().from("content_calendar").select("*").eq("project_id",projectId).order("scheduled_for").limit(20);
  return data||[];
}
