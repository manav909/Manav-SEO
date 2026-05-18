import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import React,{useState,useEffect,useRef} from "react";

const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));

const SUGGESTIONS=[
  "Which client has the highest churn risk right now?",
  "What are the top 3 SEO tactics that worked this month?",
  "Summarise TechNova UK's progress",
  "Which BDE is converting the most leads?",
  "What should I prioritise today?",
  "Which clients are ready for an upsell conversation?",
  "What algorithm updates should I watch this week?",
  "Show me the pipeline value broken down by stage",
  "Which leads haven't been contacted in 3+ days?",
];

export default function AskEmpire(){
  const { selectedProjectId: projectId } = useProject();
  const[messages,setMessages]=useState<{role:string;content:string;ts:Date}[]>([]);
  const[input,setInput]=useState("");
  const[loading,setLoading]=useState(false);
  const[sessionId]=useState(()=>`session_${Date.now()}`);
  const[aiStatus,setAiStatus]=useState<'checking'|'ok'|'error'>('checking');
  useEffect(()=>{post('check_system_health').then(r=>{const h=(r as any).health;setAiStatus(h?.can_reach_anthropic&&h?.env_vars_ok?'ok':'error');});},[]);
  const[projects,setProjects]=useState<any[]>([]);
  const[selProject,setSel]=useState("");
  const bottomRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    import("@/lib/supabase").then(({supabase})=>{
      supabase.from("projects").select("id,name").limit(20).then(({data})=>setProjects(data||[]));
    });
  },[]);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[messages]);

  async function ask(q?:string){
    const question=(q||input).trim();
    if(!question||loading)return;
    setInput("");
    setMessages(m=>[...m,{role:"user",content:question,ts:new Date()}]);
    setLoading(true);
    const r=await post("ask_empire",{question,sessionId,projectId:selProject||undefined});
    const answer=(r as any).answer||"I couldn't generate an answer. Please try again.";
    setMessages(m=>[...m,{role:"assistant",content:answer,ts:new Date()}]);
    setLoading(false);
  }

  const S:any={
    root:{minHeight:"100vh",background:"hsl(var(--background))",color:"hsl(var(--foreground))",
      fontFamily:"-apple-system,'SF Pro Display',system-ui,sans-serif"},
    hdr:{background:"rgba(8,8,24,.92)",backdropFilter:"blur(20px)",
      borderBottom:"0.5px solid var(--border)",height:56,padding:"0 24px",
      position:"sticky" as const,top:0,zIndex:100,
      display:"flex",alignItems:"center",justifyContent:"space-between"},
    body:{maxWidth:760,margin:"0 auto",padding:"24px 20px",
      display:"flex",flexDirection:"column" as const,height:"calc(100vh - 56px)"},
    bubble:(role:string)=>({
      maxWidth:"80%",padding:"12px 16px",borderRadius:role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",
      background:role==="user"?"hsl(var(--primary))":"hsl(var(--card))",
      border:`0.5px solid ${role==="user"?"transparent":"hsl(var(--border))"}`,
      color:role==="user"?"#fff":"hsl(var(--foreground))",fontSize:14,lineHeight:1.7,
      alignSelf:role==="user"?"flex-end":"flex-start" as const,
      boxShadow:role==="user"?`0 4px 20px var(--accent-glow)`:"0 2px 12px rgba(0,0,0,.2)",
    }),
    inp:{flex:1,background:"hsl(var(--card))",border:"0.5px solid var(--border)",
      borderRadius:12,color:"hsl(var(--foreground))",padding:"12px 16px",fontSize:14,
      outline:"none",resize:"none" as const,lineHeight:1.5,maxHeight:120,
      fontFamily:"inherit"},
    btn:{background:"hsl(var(--primary))",border:"none",borderRadius:10,color:"#fff",
      padding:"12px 20px",fontSize:14,fontWeight:600,cursor:"pointer",
      transition:"all .2s",flexShrink:0,
      boxShadow:"0 4px 16px var(--accent-glow)"},
    suggestion:{background:"hsl(var(--card))",border:"0.5px solid var(--border)",
      borderRadius:20,padding:"7px 14px",fontSize:12,color:"hsl(var(--muted-foreground))",
      cursor:"pointer",transition:"all .2s",whiteSpace:"nowrap" as const},
  };

  return(
    <div style={S.root} className="empire-page">
      <PortalNav />
      
      <div style={{position:"relative",zIndex:1,height:"100vh",display:"flex",flexDirection:"column" as const}}>
        <div style={S.hdr}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:"hsl(var(--primary) / .2)",
              border:"0.5px solid var(--border-glow)",display:"flex",alignItems:"center",
              justifyContent:"center",fontSize:16}}>🤖</div>
            <div>
              <div style={{fontSize:14,fontWeight:700}}>Ask the Empire</div>
              <div style={{fontSize:10,color:"hsl(var(--muted-foreground))",letterSpacing:"1px"}}>
                AI intelligence across all your data
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            {projects.length>0&&(
              <select style={{background:"hsl(var(--card))",border:"0.5px solid var(--border)",
                borderRadius:8,color:"hsl(var(--foreground))",padding:"6px 10px",fontSize:11}}
                value={selProject} onChange={e=>setSel(e.target.value)}>
                <option value="">All projects</option>
                {projects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
                      </div>
        </div>

        <div style={{flex:1,overflowY:"auto" as const,padding:"20px 24px"}}>
          {messages.length===0?(
            <div style={{maxWidth:720,margin:"0 auto"}}>
              <div style={{textAlign:"center" as const,padding:"48px 0 32px"}}>
                <div style={{fontSize:48,marginBottom:16}}>🧠</div>
                <div style={{fontSize:22,fontWeight:700,marginBottom:8,
                  background:"var(--grad-accent)",WebkitBackgroundClip:"text",
                  WebkitTextFillColor:"transparent"}}>
                  Ask anything about your empire
                </div>
                <div style={{fontSize:14,color:"hsl(var(--muted-foreground))",maxWidth:400,
                  margin:"0 auto",lineHeight:1.6}}>
                  I have full context on every client, project, staff member, learning,
                  alert, and metric. Ask me anything.
                </div>
              </div>
              <div style={{display:"flex",flexWrap:"wrap" as const,gap:8,
                justifyContent:"center" as const,marginBottom:32}}>
                {SUGGESTIONS.map((s,i)=>(
                  <button key={i} style={S.suggestion} onClick={()=>ask(s)}
                    onMouseEnter={e=>{(e.target as any).style.borderColor="var(--border-glow)";(e.target as any).style.color="hsl(var(--foreground))"}}
                    onMouseLeave={e=>{(e.target as any).style.borderColor="hsl(var(--border))";(e.target as any).style.color="hsl(var(--muted-foreground))"}}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ):(
            <div style={{maxWidth:720,margin:"0 auto",display:"flex",
              flexDirection:"column" as const,gap:16}}>
              {messages.map((m,i)=>(
                <div key={i} style={{display:"flex",
                  justifyContent:m.role==="user"?"flex-end" as const:"flex-start" as const}}>
                  {m.role==="assistant"&&(
                    <div style={{width:28,height:28,borderRadius:"50%",
                      background:"hsl(var(--primary) / .2)",border:"0.5px solid var(--border-glow)",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:12,flexShrink:0,marginRight:8,marginTop:4}}>🤖</div>
                  )}
                  <div style={S.bubble(m.role)}>
                    {m.content.split('\n').map((line,j)=>(
                      <div key={j} style={{marginBottom:line?2:8}}>{line}</div>
                    ))}
                    <div style={{fontSize:10,color:m.role==="user"?"rgba(255,255,255,.5)":"hsl(var(--muted-foreground))",
                      marginTop:6,textAlign:m.role==="user"?"right" as const:"left" as const}}>
                      {m.ts.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}
                    </div>
                  </div>
                </div>
              ))}
              {loading&&(
                <div style={{display:"flex",justifyContent:"flex-start" as const}}>
                  <div style={{...S.bubble("assistant"),display:"flex",gap:4,alignItems:"center"}}>
                    {[0,1,2].map(i=>(
                      <div key={i} style={{width:6,height:6,borderRadius:"50%",
                        background:"hsl(var(--primary))",opacity:.4,
                        animation:`pulse_ 1.2s ease-in-out ${i*0.2}s infinite`}}/>
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef}/>
            </div>
          )}
        </div>

        <div style={{padding:"16px 24px",borderTop:"0.5px solid var(--border)",
          background:"rgba(8,8,24,.8)",backdropFilter:"blur(20px)"}}>
          <div style={{maxWidth:720,margin:"0 auto",display:"flex",gap:10,alignItems:"flex-end"}}>
            <textarea style={S.inp} value={input} onChange={e=>setInput(e.target.value)}
              placeholder="Ask anything... 'Which client needs attention?' 'What worked best this week?'"
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask();}}}
              rows={1}/>
            <button style={{...S.btn,opacity:loading||!input.trim()?0.5:1}} onClick={()=>ask()} disabled={loading||!input.trim()}>
              {loading?"...":"Ask"}
            </button>
          </div>
          <div style={{maxWidth:720,margin:"6px auto 0",fontSize:11,color:"hsl(var(--muted-foreground))",textAlign:"center" as const}}>
            Enter to send · Shift+Enter for new line · Powered by Claude
          </div>
        </div>
      </div>
    </div>
  );
}
