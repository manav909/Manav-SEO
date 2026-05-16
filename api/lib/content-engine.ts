import {db} from "./db";
export async function generateContentBrief(projectId:string,keyword:string,priority:string="medium"){
  const{data:p}=await db().from("projects").select("name,url,goals,industry,language,market").eq("id",projectId).single();
  if(!p)return null;
  const ai=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY||"","anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1200,messages:[{role:"user",content:`Content brief for keyword: "${keyword}". Client: ${p.name}, Industry: ${p.industry||"general"}, Market: ${p.market||"global"}. Return JSON only: {"title":"SEO title","secondary_keywords":["kw1","kw2"],"search_intent":"informational|transactional","word_count":1500,"structure":[{"heading":"H2","content":"what to cover"}],"llm_optimization":{"answer_the_question":"direct answer to put at top","key_facts":"facts to include","authority_signals":"what builds trust"},"entity_coverage":["entity1","entity2"],"brief_content":"200 word writer brief","unique_angle":"what makes this different"}`}]})});
  const j=await ai.json() as any;
  let brief:any={title:keyword,word_count:1500,search_intent:"informational"};
  try{brief=JSON.parse((j?.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim());}catch{}
  const{data}=await db().from("content_briefs").insert({project_id:projectId,title:brief.title||keyword,target_keyword:keyword,secondary_keywords:brief.secondary_keywords||[],search_intent:brief.search_intent||"informational",word_count:brief.word_count||1500,structure:brief.structure||[],llm_optimization:brief.llm_optimization||{},entity_coverage:brief.entity_coverage||[],brief_content:brief.brief_content||"",priority,status:"ready"}).select().single();
  return{brief:data,preview:brief};
}
