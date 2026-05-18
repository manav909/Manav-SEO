import { supabase } from "@/lib/supabase";
import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import React,{useState,useEffect} from "react";
import { useTheme } from "@/contexts/ThemeContext";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));

export default function ContentWriter(){
  const { selectedProjectId: projectId } = useProject();
  const{theme}=useTheme();
  const[projects,setProjects]=useState<any[]>([]);
  const[sel,setSel]=useState<any>(null);
  const[briefs,setBriefs]=useState<any[]>([]);
  const[calendar,setCalendar]=useState<any[]>([]);
  const[kw,setKw]=useState("");
  const[gen,setGen]=useState(false);
  const[expanded,setExpanded]=useState<string|null>(null);
  const[tab,setTab]=useState<"briefs"|"calendar"|"tools"|"llm">("briefs");
  const[copied,setCopied]=useState<string|null>(null);

  useEffect(()=>{
    Promise.resolve().then(()=>{
      supabase.from("projects").select("*").limit(20).then(({data})=>{
        setProjects(data||[]); if(data?.length)setSel(data[0]);
      });
    });
  },[]);

  useEffect(()=>{
    if(!sel)return;
    post("get_content_briefs",{projectId:sel.id}).then(r=>setBriefs((r as any).briefs||[]));
    post("get_content_calendar",{projectId:sel.id}).then(r=>setCalendar((r as any).calendar||[]));
  },[sel]);

  async function generate(){
    if(!kw.trim()||!sel)return; setGen(true);
    await post("generate_content_brief",{projectId:sel.id,keyword:kw,priority:"high"});
    setKw(""); post("get_content_briefs",{projectId:sel.id}).then(r=>setBriefs((r as any).briefs||[]));
    setGen(false);
  }

  function copy(text:string,id:string){navigator.clipboard.writeText(text).catch(()=>{});setCopied(id);setTimeout(()=>setCopied(null),2000);}

  const priorityC:any={critical:"#ef4444",high:"hsl(var(--primary))",medium:"#f59e0b",low:"#10b981"};

  return(
    <div className="empire-page">
      <PortalNav />
      
      <div style={{position:"relative",zIndex:1}}>
        <div style={{background:"rgba(13,13,30,.9)",backdropFilter:"blur(20px)",
          borderBottom:"0.5px solid var(--border)",height:56,padding:"0 24px",
          position:"sticky",top:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:18}}>✍️</span>
            <div>
              <div style={{fontSize:14,fontWeight:700}}>Content Intelligence</div>
              <div style={{fontSize:10,color:"hsl(var(--muted-foreground))",textTransform:"uppercase",letterSpacing:"1px"}}>Writer Dashboard</div>
            </div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <select style={{background:"hsl(var(--card))",border:"0.5px solid var(--border)",borderRadius:8,color:"hsl(var(--foreground))",padding:"6px 12px",fontSize:12}}
              value={sel?.id||""} onChange={e=>{const p=projects.find((x:any)=>x.id===e.target.value);if(p)setSel(p);}}>
              {projects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
                      </div>
        </div>

        <div style={{padding:"20px 24px",maxWidth:960,margin:"0 auto"}}>
          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:20}}>
            {[
              {v:briefs.length,l:"Total Briefs",i:"📝"},
              {v:briefs.filter((b:any)=>b.priority==="high"||b.priority==="critical").length,l:"High Priority",i:"🔥"},
              {v:briefs.filter((b:any)=>b.status==="ready").length,l:"Ready to Write",i:"✅"},
              {v:calendar.length,l:"Scheduled",i:"📅"},
              {v:briefs.filter((b:any)=>b.search_intent==="informational").length,l:"Informational",i:"📖"},
              {v:briefs.filter((b:any)=>b.search_intent==="commercial"||b.search_intent==="transactional").length,l:"Commercial",i:"💰"},
            ].map(t=>(
              <div key={t.l} className="empire-card" style={{padding:"12px 14px"}}>
                <div style={{fontSize:20,marginBottom:4}}>{t.i}</div>
                <div style={{fontSize:20,fontWeight:700,color:"hsl(var(--primary))",fontFamily:"monospace",lineHeight:1}}>{t.v}</div>
                <div style={{fontSize:9,color:"hsl(var(--muted-foreground))",textTransform:"uppercase",letterSpacing:".8px",marginTop:3}}>{t.l}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{display:"flex",borderBottom:"0.5px solid var(--border)",marginBottom:16}}>
            {([["briefs","📝 Briefs"],["calendar","📅 Calendar"],["tools","⚡ Tools"],["llm","🤖 LLM Tips"]] as [typeof tab,string][]).map(([id,l])=>(
              <button key={id} style={{padding:"9px 14px",fontSize:12,fontWeight:500,cursor:"pointer",border:"none",
                background:"transparent",color:tab===id?"hsl(var(--primary))":"hsl(var(--muted-foreground))",
                borderBottom:tab===id?"2px solid var(--accent)":"2px solid transparent",transition:"all .2s"}}
                onClick={()=>setTab(id)}>{l}</button>
            ))}
          </div>

          {tab==="briefs"&&(
            <div>
              <div className="empire-card" style={{marginBottom:14}}>
                <div style={{display:"flex",gap:10}}>
                  <input className="empire-input" style={{flex:1}} value={kw} onChange={e=>setKw(e.target.value)}
                    placeholder="Enter keyword or topic to generate brief..." onKeyDown={e=>e.key==="Enter"&&generate()}/>
                  <button className="empire-btn" onClick={generate} disabled={gen||!kw||!sel}>
                    {gen?"Generating...":"Generate Brief"}
                  </button>
                </div>
              </div>
              {briefs.map(b=>(
                <div key={b.id} className="empire-card" style={{borderLeft:`3px solid ${priorityC[b.priority]||"hsl(var(--primary))"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",cursor:"pointer",alignItems:"flex-start"}} onClick={()=>setExpanded(expanded===b.id?null:b.id)}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,color:"hsl(var(--foreground))",marginBottom:6}}>{b.title}</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                        <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:`${priorityC[b.priority]||"hsl(var(--primary))"}18`,color:priorityC[b.priority]||"hsl(var(--primary))"}}>{b.priority?.toUpperCase()}</span>
                        <span style={{fontSize:10,color:"hsl(var(--muted-foreground))"}}>{b.target_keyword}</span>
                        <span style={{fontSize:10,color:"hsl(var(--muted-foreground))"}}>{b.word_count}w</span>
                        <span style={{fontSize:10,color:"hsl(var(--muted-foreground))"}}>{b.search_intent}</span>
                      </div>
                    </div>
                    <span style={{color:"hsl(var(--muted-foreground))",fontSize:14,flexShrink:0,marginLeft:8}}>{expanded===b.id?"▲":"▼"}</span>
                  </div>
                  {expanded===b.id&&(
                    <div style={{marginTop:14,paddingTop:14,borderTop:"0.5px solid var(--border)"}}>
                      {b.brief_content&&(
                        <div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                            <div style={{fontSize:10,color:"hsl(var(--muted-foreground))",fontWeight:600,textTransform:"uppercase",letterSpacing:"1px"}}>Brief</div>
                            <button style={{background:"hsl(var(--primary) / .2)",border:"0.5px solid var(--border-glow)",borderRadius:6,
                              color:"hsl(var(--primary))",padding:"4px 10px",fontSize:10,cursor:"pointer"}}
                              onClick={()=>copy(b.brief_content,b.id)}>
                              {copied===b.id?"✓ Copied":"Copy Brief"}
                            </button>
                          </div>
                          <div style={{fontSize:13,color:"hsl(var(--muted-foreground))",lineHeight:1.7,marginBottom:12}}>{b.brief_content}</div>
                        </div>
                      )}
                      {b.llm_optimization?.answer_the_question&&(
                        <div style={{padding:"12px 14px",background:"rgba(16,185,129,.05)",borderRadius:9,border:"0.5px solid rgba(16,185,129,.2)",marginBottom:10}}>
                          <div style={{fontSize:10,color:"#10b981",fontWeight:600,letterSpacing:"1px",marginBottom:6}}>🤖 LLM DIRECT ANSWER — Put at top of article</div>
                          <div style={{fontSize:13,color:"hsl(var(--foreground))",lineHeight:1.7}}>{b.llm_optimization.answer_the_question}</div>
                          <button style={{marginTop:8,background:"rgba(16,185,129,.1)",border:"0.5px solid rgba(16,185,129,.25)",
                            borderRadius:6,color:"#10b981",padding:"4px 10px",fontSize:10,cursor:"pointer"}}
                            onClick={()=>copy(b.llm_optimization.answer_the_question,`llm_${b.id}`)}>
                            {copied===`llm_${b.id}`?"✓ Copied":"Copy Answer"}
                          </button>
                        </div>
                      )}
                      {b.entity_coverage?.length>0&&(
                        <div>
                          <div style={{fontSize:10,color:"hsl(var(--muted-foreground))",fontWeight:600,textTransform:"uppercase",letterSpacing:"1px",marginBottom:6}}>Entities to mention</div>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
                            {b.entity_coverage.map((e:string,i:number)=>(
                              <span key={i} style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"hsl(var(--primary) / .2)",color:"hsl(var(--primary))",border:"0.5px solid var(--border-glow)"}}>{e}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!briefs.length&&<div className="empire-card" style={{textAlign:"center",padding:40,color:"hsl(var(--muted-foreground))"}}>Enter a keyword above to generate your first content brief.</div>}
            </div>
          )}

          {tab==="calendar"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:12,color:"hsl(var(--muted-foreground))"}}>{calendar.length} pieces scheduled</div>
                <button className="empire-btn" onClick={()=>post("generate_content_calendar",{projectId:sel?.id,weeksAhead:4}).then(()=>post("get_content_calendar",{projectId:sel?.id}).then(r=>setCalendar((r as any).calendar||[])))}>
                  + Generate 4-Week Plan
                </button>
              </div>
              {calendar.map((c:any)=>(
                <div key={c.id} className="empire-card" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"hsl(var(--foreground))",marginBottom:4}}>{c.title}</div>
                    <div style={{display:"flex",gap:8}}>
                      <span style={{fontSize:10,color:"hsl(var(--muted-foreground))"}}>{c.scheduled_for}</span>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"hsl(var(--primary) / .2)",color:"hsl(var(--primary))"}}>{c.content_type}</span>
                      <span style={{fontSize:10,color:"hsl(var(--muted-foreground))"}}>{c.target_keyword}</span>
                      {c.llm_priority&&<span style={{fontSize:10,color:"#06b6d4"}}>🤖 LLM priority</span>}
                    </div>
                  </div>
                  <div style={{fontSize:11,color:"hsl(var(--muted-foreground))",textTransform:"capitalize"}}>{c.status}</div>
                </div>
              ))}
              {!calendar.length&&<div className="empire-card" style={{textAlign:"center",padding:40,color:"hsl(var(--muted-foreground))"}}>No calendar yet. Generate a 4-week plan above.</div>}
            </div>
          )}

          {tab==="tools"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[
                {icon:"🔍",title:"Keyword Research",desc:"Find high-value keywords with clear intent",link:"/content-hub"},
                {icon:"🤖",title:"LLM Visibility Check",desc:"See if your content gets cited by AI",link:"/llm-visibility"},
                {icon:"📊",title:"Competitor Analysis",desc:"Find content gaps vs competitors",link:"/client-portal"},
                {icon:"🧠",title:"Brain Learnings",desc:"See what content formats worked best",link:"/brain-command"},
                {icon:"📅",title:"Content Calendar",desc:"Plan your publishing schedule",link:"/content-hub"},
                {icon:"📋",title:"Client Briefs",desc:"All pending content requirements",link:"/content-hub"},
              ].map(t=>(
                <a key={t.title} href={t.link} className="empire-card"
                  style={{textDecoration:"none",cursor:"pointer",display:"block"}}>
                  <div style={{fontSize:24,marginBottom:8}}>{t.icon}</div>
                  <div style={{fontSize:13,fontWeight:700,color:"hsl(var(--foreground))",marginBottom:4}}>{t.title}</div>
                  <div style={{fontSize:12,color:"hsl(var(--muted-foreground))",lineHeight:1.5}}>{t.desc}</div>
                  <div style={{marginTop:10,fontSize:11,color:"hsl(var(--primary))"}}>Open →</div>
                </a>
              ))}
            </div>
          )}

          {tab==="llm"&&(
            <div>
              <div className="empire-card" style={{borderColor:"rgba(139,92,246,.3)",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:"hsl(var(--foreground))"}}>🤖 Writing for AI Citation</div>
                <div style={{color:"hsl(var(--muted-foreground))",fontSize:13,lineHeight:1.7,marginBottom:12}}>
                  AI models like ChatGPT, Claude, and Gemini cite content that answers questions directly, authoritatively, and concisely. Every piece you write should be optimised for AI citation, not just Google.
                </div>
                {[
                  {rule:"Open with a direct answer",detail:"Put the main answer in the first 2 sentences. AI models extract this for featured responses."},
                  {rule:"Use data and statistics",detail:"Specific numbers (23%, £4,200, 47 days) dramatically increase citation probability."},
                  {rule:"Name entities explicitly",detail:"Mention specific people, companies, tools, and places. AI models build knowledge graphs."},
                  {rule:"Structure with clear headings",detail:"H2/H3 structure helps AI extract specific sections for specific queries."},
                  {rule:"Write at 9th-grade reading level",detail:"Clear, direct language is cited more than complex academic writing."},
                  {rule:"Add 'According to [Brand]' framing",detail:"Attribution framing trains AI to associate your brand as the source."},
                ].map((r,i)=>(
                  <div key={i} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:"0.5px solid var(--border)"}}>
                    <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,background:"rgba(139,92,246,.15)",
                      border:"0.5px solid rgba(139,92,246,.3)",display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:10,fontWeight:700,color:"#a78bfa",marginTop:2}}>{i+1}</div>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:"hsl(var(--foreground))",marginBottom:2}}>{r.rule}</div>
                      <div style={{fontSize:11,color:"hsl(var(--muted-foreground))",lineHeight:1.5}}>{r.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
