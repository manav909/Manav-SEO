import React,{useState,useEffect} from "react";
import {supabase} from "@/lib/supabase";
interface P{id:string;name:string;url:string;tasks:number;score:number|null}
export default function ClientPortal(){
  const [projects,setProjects]=useState<P[]>([]);
  const [loading,setLoading]=useState(true);
  const [sel,setSel]=useState<string|null>(null);
  const [brief,setBrief]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{load();},[]);
  async function load(){
    const {data}=await supabase.from("projects").select("id,name,url").limit(12);
    if(!data){setLoading(false);return;}
    const ps:P[]=await Promise.all(data.map(async(p:any)=>{
      const [t,m]=await Promise.allSettled([
        supabase.from("task_executions").select("id").eq("project_id",p.id).eq("status","done"),
        supabase.from("metrics").select("llm_visibility_score").eq("project_id",p.id).order("recorded_at",{ascending:false}).limit(1),
      ]);
      return{id:p.id,name:p.name,url:p.url||"",
        tasks:t.status==="fulfilled"?t.value.data?.length||0:0,
        score:m.status==="fulfilled"?m.value.data?.[0]?.llm_visibility_score??null:null};
    }));
    setProjects(ps);setLoading(false);
  }
  async function gen(id:string){
    setBusy(true);setBrief("");
    const r=await fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"client_brief",projectId:id,briefType:"progress"})});
    const d=await r.json();setBrief(d.brief||"Error");setBusy(false);
  }
  const c=(s:number|null)=>s==null?"#4b4b6a":s>=75?"#10b981":s>=50?"#3b82f6":s>=25?"#eab308":"#ef4444";
  const S:any={page:{minHeight:"100vh",background:"#070710",color:"#f0f0ff",padding:24,fontFamily:"system-ui"},
    card:{background:"#0d0d1a",border:"0.5px solid #1e1e3a",borderRadius:12,padding:20,cursor:"pointer",marginBottom:12},
    btn:{background:"#6366f1",border:"none",borderRadius:8,color:"#fff",padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer",marginTop:16},
    brief:{background:"#0d0d1a",border:"0.5px solid #1e1e3a",borderRadius:12,padding:20,whiteSpace:"pre-wrap",lineHeight:1.7,fontSize:14,marginTop:16}};
  if(loading)return<div style={{...S.page,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#4b4b6a"}}>Loading…</span></div>;
  return(
    <div style={S.page}>
      <div style={{fontSize:22,fontWeight:700,marginBottom:6}}>👑 Client Portal</div>
      <div style={{fontSize:14,color:"#8b8ba8",marginBottom:24}}>Project performance — plain and clear.</div>
      {projects.map(p=>(
        <div key={p.id} style={{...S.card,borderColor:sel===p.id?"#6366f1":"#1e1e3a"}} onClick={()=>setSel(sel===p.id?null:p.id)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:15,fontWeight:600}}>{p.name}</div>
            <div style={{display:"flex",gap:20}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:"#10b981",fontFamily:"monospace"}}>{p.tasks}</div><div style={{fontSize:10,color:"#4b4b6a",textTransform:"uppercase"}}>Tasks done</div></div>
              {p.score!=null&&<div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:c(p.score),fontFamily:"monospace"}}>{p.score}</div><div style={{fontSize:10,color:"#4b4b6a",textTransform:"uppercase"}}>LLM score</div></div>}
            </div>
          </div>
          {sel===p.id&&<div><button style={S.btn} onClick={e=>{e.stopPropagation();gen(p.id);}} disabled={busy}>{busy?"Generating…":"📋 Generate Progress Brief"}</button>{brief&&<div style={S.brief}>{brief}</div>}</div>}
        </div>
      ))}
    </div>
  );
}