import {db} from "./db";
export async function generateReport(projectId:string,reportType:"weekly"|"monthly"|"quarterly"){
  const{data:project}=await db().from("projects").select("name,url,goals").eq("id",projectId).single();
  if(!project)return null;
  const daysBack=reportType==="weekly"?7:reportType==="monthly"?30:90;
  const since=new Date(Date.now()-daysBack*864e5).toISOString();
  const[tR,lR,vR]=await Promise.allSettled([
    db().from("task_executions").select("status").eq("project_id",projectId).gte("created_at",since),
    db().from("brain_learnings").select("card_title").eq("project_id",projectId).gte("created_at",since),
    db().from("verification_queue").select("card_title,verdict").eq("project_id",projectId).eq("status","done").gte("updated_at",since),
  ]);
  const tasks=tR.status==="fulfilled"?tR.value.data||[]:[];
  const learns=lR.status==="fulfilled"?lR.value.data||[]:[];
  const verifs=vR.status==="fulfilled"?vR.value.data||[]:[];
  const done=tasks.filter((t:any)=>t.status==="done").length;
  const wins=verifs.filter((v:any)=>v.verdict==="working").map((v:any)=>v.card_title);
  const ai=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY||"","anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:2500,messages:[{role:"user",content:`Write a professional ${reportType} SEO report as HTML body (no html/head tags) for ${project.name} (${project.url||""}). Goals: ${project.goals||"improve organic visibility"}. Period: last ${daysBack} days. Tasks done: ${done}. Learnings: ${learns.length}. Wins: ${wins.slice(0,3).join(", ")||"building"}. Style: dark #070710 bg, #1e1e3a card borders, #6366f1 accent, white text, inline CSS. Sections: Executive Summary, Work Completed, Key Wins, What We Learned, Next Steps.`}]})});
  const j=await ai.json() as any;
  const html=j?.content?.[0]?.text||"<p>Report generation failed.</p>";
  const{data:report}=await db().from("reports").insert({project_id:projectId,report_type:reportType,period_start:new Date(Date.now()-daysBack*864e5).toISOString().split("T")[0],period_end:new Date().toISOString().split("T")[0],title:`${reportType.charAt(0).toUpperCase()+reportType.slice(1)} Report — ${project.name} — ${new Date().toLocaleDateString("en-GB",{month:"short",year:"numeric"})}`,html_content:html,status:"ready",highlights:learns.slice(0,5).map((l:any)=>l.card_title)}).select().single();
  return report;
}
