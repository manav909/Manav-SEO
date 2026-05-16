import {db} from "./db";
export async function checkLLMVisibility(projectId:string){
  const{data:p}=await db().from("projects").select("name,url,goals,industry,market").eq("id",projectId).single();
  if(!p)return null;
  const company=p.name||(p.url||"").replace(/^https?:\/\//,"").split("/")[0]||"the company";
  const queries=[`What are the best ${p.industry||"digital"} companies in ${p.market||"the UK"}?`,`Who should I use for ${(p.goals||"SEO").slice(0,40)}?`,`Tell me about ${company}.`];
  const results=[];
  for(const query of queries){
    const ai=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY||"","anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:250,system:"Answer naturally.",messages:[{role:"user",content:query}]})});
    const j=await ai.json() as any;
    const response=j?.content?.[0]?.text||"";
    const cited=response.toLowerCase().includes(company.toLowerCase());
    const sentiment=cited?(response.toLowerCase().includes("best")||response.toLowerCase().includes("recommend")?"positive":"neutral"):"not_mentioned";
    const hint=cited?"Maintain LLM visibility — keep producing authoritative content.":`Not cited for "${query}". Create authoritative, entity-rich content targeting this query.`;
    await db().from("llm_citations").insert({project_id:projectId,query,model:"claude-haiku",cited,sentiment,response_excerpt:response.slice(0,300),improvement_hint:hint}).then(()=>{}).catch(()=>{});
    if(!cited)await db().from("alerts").insert({project_id:projectId,alert_type:"llm_mention_lost",severity:"info",title:`Not cited by AI: "${query.slice(0,50)}"`,body:hint,data:{query}}).then(()=>{}).catch(()=>{});
    results.push({query,cited,sentiment});
  }
  return{checked:results.length,cited:results.filter(r=>r.cited).length,results};
}
