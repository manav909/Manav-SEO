import {db} from "./db";
export async function calculateClientHealth(projectId:string){
  const since30=new Date(Date.now()-30*864e5).toISOString();
  const[pR,tR,lR,vR]=await Promise.allSettled([
    db().from("projects").select("name,created_at").eq("id",projectId).single(),
    db().from("task_executions").select("status").eq("project_id",projectId).gte("created_at",since30),
    db().from("brain_learnings").select("id").eq("project_id",projectId).gte("created_at",since30),
    db().from("verification_queue").select("verdict").eq("project_id",projectId).eq("status","done").gte("updated_at",since30),
  ]);
  const proj=pR.status==="fulfilled"?pR.value.data:null;
  const tasks=tR.status==="fulfilled"?tR.value.data||[]:[];
  const learns=lR.status==="fulfilled"?lR.value.data||[]:[];
  const verifs=vR.status==="fulfilled"?vR.value.data||[]:[];
  if(!proj)return null;
  const brainScore=Math.min(100,learns.length*10+verifs.filter((v:any)=>v.verdict==="working").length*15);
  const velocityScore=Math.min(100,tasks.filter((t:any)=>t.status==="done").length*8);
  const overall=Math.round(brainScore*0.5+velocityScore*0.5);
  const churnSignals:string[]=[];
  if(velocityScore<20)churnSignals.push("No tasks completed in 30 days");
  if(learns.length===0)churnSignals.push("No learnings captured recently");
  const churnRisk=churnSignals.length>=2?"high":churnSignals.length>=1?"medium":"low";
  const upsellSignals=brainScore>60&&velocityScore>60?["Strong results — expansion ready"]:[];
  const action=churnRisk==="high"?"Immediate review required":upsellSignals.length>0?"Schedule upsell call":"Continue current strategy";
  await db().from("client_health").upsert({project_id:projectId,overall_score:overall,brain_score:brainScore,velocity_score:velocityScore,churn_risk:churnRisk,churn_signals:churnSignals,upsell_signals:upsellSignals,recommended_action:action},{onConflict:"project_id"});
  if(churnRisk==="high")await db().from("alerts").insert({alert_type:"churn_risk",severity:"critical",title:`High churn risk: ${proj.name}`,body:churnSignals.join(", "),data:{churnSignals,overall}}).then(()=>{}).catch(()=>{});
  return{overall,brainScore,velocityScore,churnRisk,churnSignals,upsellSignals,action};
}
