import React,{useState,useEffect} from "react";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
const pc:any={critical:"#ef4444",high:"#f59e0b",medium:"#6366f1",low:"#10b981"};
export default function ContentHub(){
  const[projects,setProjects]=useState<any[]>([]);const[sel,setSel]=useState("");const[briefs,setBriefs]=useState<any[]>([]);const[kw,setKw]=useState("");const[gen,setGen]=useState(false);const[open,setOpen]=useState<string|null>(null);
  useEffect(()=>{import("@/lib/supabase").then(({supabase})=>{supabase.from("projects").select("id,name").limit(20).then(({data})=>{setProjects(data||[]);if(data?.length)setSel(data[0].id);});});},[]);
  useEffect(()=>{if(sel)post("get_content_briefs",{projectId:sel}).then(r=>setBriefs((r as any).briefs||[]));},[sel]);
  const generate=async()=>{if(!kw.trim())return;setGen(true);await post("generate_content_brief",{projectId:sel,keyword:kw,priority:"high"});setKw("");post("get_content_briefs",{projectId:sel}).then(r=>setBriefs((r as any).briefs||[]));setGen(false);};
  const S:any={p:{minHeight:"100vh",background:"#070710",color:"#f0f0ff",padding:28,fontFamily:"-apple-system,system-ui,sans-serif"},c:{background:"#0d0d1a",border:"0.5px solid #1e1e3a",borderRadius:12,padding:18,marginBottom:10},inp:{background:"#070710",border:"0.5px solid #1e1e3a",borderRadius:8,color:"#f0f0ff",padding:"10px 14px",fontSize:13,flex:1,outline:"none"},sel:{background:"#0d0d1a",border:"0.5px solid #1e1e3a",borderRadius:8,color:"#f0f0ff",padding:"10px 14px",fontSize:13},btn:{background:"rgba(99,102,241,.15)",border:"0.5px solid rgba(99,102,241,.3)",borderRadius:8,color:"#a78bfa",padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}};
  return(<div style={S.p}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div><div style={{fontSize:22,fontWeight:700}}>📝 Content Hub</div><div style={{fontSize:13,color:"#8b8ba8",marginTop:4}}>LLM-optimised content briefs</div></div>
      <select style={S.sel} value={sel} onChange={e=>setSel(e.target.value)}>{projects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
    </div>
    <div style={{...S.c,display:"flex",gap:10}}>
      <input style={S.inp} value={kw} onChange={e=>setKw(e.target.value)} placeholder="Target keyword or topic..." onKeyDown={e=>e.key==="Enter"&&generate()}/>
      <button style={S.btn} onClick={generate} disabled={gen||!kw}>{gen?"Generating...":"Generate Brief"}</button>
    </div>
    {briefs.map((b:any)=><div key={b.id} style={S.c}>
      <div style={{display:"flex",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setOpen(open===b.id?null:b.id)}>
        <div><div style={{fontSize:14,fontWeight:700,marginBottom:4}}>{b.title}</div><div style={{display:"flex",gap:8}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:`${pc[b.priority]||"#6366f1"}15`,color:pc[b.priority]||"#6366f1"}}>{b.priority?.toUpperCase()}</span><span style={{fontSize:11,color:"#8b8ba8"}}>{b.target_keyword}</span><span style={{fontSize:11,color:"#4b4b6a"}}>{b.word_count}w</span></div></div>
        <span style={{color:"#4b4b6a"}}>{open===b.id?"▲":"▼"}</span>
      </div>
      {open===b.id&&<div style={{marginTop:12,paddingTop:12,borderTop:"0.5px solid #1e1e3a"}}>
        {b.brief_content&&<div style={{fontSize:13,color:"#d0d0e8",lineHeight:1.7,marginBottom:10}}>{b.brief_content}</div>}
        {b.llm_optimization?.answer_the_question&&<div style={{background:"rgba(16,185,129,.06)",border:"0.5px solid rgba(16,185,129,.2)",borderRadius:8,padding:12}}><div style={{fontSize:11,color:"#34d399",fontWeight:600,marginBottom:4}}>🤖 LLM Direct Answer</div><div style={{fontSize:12,color:"#d0d0e8"}}>{b.llm_optimization.answer_the_question}</div></div>}
      </div>}
    </div>)}
    {!briefs.length&&<div style={{color:"#4b4b6a",textAlign:"center",padding:40,fontSize:14}}>Enter a keyword above to generate your first LLM-optimised brief.</div>}
  </div>);
}
