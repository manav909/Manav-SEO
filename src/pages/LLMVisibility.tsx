import AnimatedBg from "@/components/AnimatedBg";
import ThemeToggle from "@/components/ThemeToggle";
import React,{useState,useEffect} from "react";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
export default function LLMVisibility(){
  const[projects,setProjects]=useState<any[]>([]);const[sel,setSel]=useState("");const[cits,setCits]=useState<any[]>([]);const[checking,setChecking]=useState(false);const[loading,setLoading]=useState(true);
  useEffect(()=>{import("@/lib/supabase").then(({supabase})=>{supabase.from("projects").select("id,name").limit(20).then(({data})=>{setProjects(data||[]);if(data?.length)setSel(data[0].id);setLoading(false);});});},[]);
  useEffect(()=>{if(sel)post("get_llm_visibility_history",{projectId:sel,limit:20}).then(r=>setCits((r as any).citations||[]));},[sel]);
  const check=async()=>{setChecking(true);await post("check_llm_visibility",{projectId:sel});const r=await post("get_llm_visibility_history",{projectId:sel,limit:20});setCits((r as any).citations||[]);setChecking(false);};
  const cited=cits.filter((c:any)=>c.cited).length;const rate=cits.length?Math.round(cited/cits.length*100):0;
  const S:any={p:{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",padding:28,fontFamily:"var(--font-display,-apple-system,system-ui,sans-serif)"},c:{background:"var(--bg-card)",border:"0.5px solid #1e1e3a",borderRadius:12,padding:18,marginBottom:10},sel:{background:"var(--bg-card)",border:"0.5px solid #1e1e3a",borderRadius:8,color:"var(--text)",padding:"8px 14px",fontSize:13},btn:{background:"rgba(6,182,212,.12)",border:"0.5px solid rgba(6,182,212,.3)",borderRadius:8,color:"var(--bg)",padding:"9px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}};
  if(loading)return<div style={{...S.p,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-muted)"}}>Loading...</div>;
  return(<div style={S.p}>
      <AnimatedBg/>
      <div style={{position:"relative",zIndex:1}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div><div style={{fontSize:22,fontWeight:700}}>🤖 LLM Visibility</div><div style={{fontSize:13,color:"var(--text-sub)",marginTop:4}}>How AI models see your clients</div></div>
      <div style={{display:"flex",gap:8}}><select style={S.sel} value={sel} onChange={e=>setSel(e.target.value)}>{projects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button style={S.btn} onClick={check} disabled={checking}>{checking?"Checking...":"▶ Run Check"}</button></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:20}}>
      {[{v:`${rate}%`,l:"Citation Rate",c:rate>60?"#10b981":rate>30?"#f59e0b":"#ef4444"},{v:`${cited}/${cits.length}`,l:"Cited",c:"var(--bg)"},{v:cits.filter((c:any)=>c.sentiment==="positive").length,l:"Positive",c:"#10b981"},{v:cits.filter((c:any)=>!c.cited).length,l:"Gaps",c:"#f87171"}].map((t:any)=><div key={t.l} style={{background:"var(--bg-card)",border:"0.5px solid #1e1e3a",borderRadius:12,padding:"16px 20px"}}><div style={{fontSize:26,fontWeight:700,color:t.c,fontFamily:"monospace",lineHeight:1,marginBottom:4}}>{t.v}</div><div style={{fontSize:11,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:.8}}>{t.l}</div></div>)}
    </div>
    {cits.map((c:any,i:number)=><div key={i} style={{...S.c,background:c.cited?"rgba(16,185,129,.04)":"rgba(239,68,68,.03)",borderColor:c.cited?"rgba(16,185,129,.2)":"rgba(239,68,68,.15)"}}><div style={{display:"flex",gap:10,alignItems:"flex-start"}}><span style={{fontSize:16,flexShrink:0}}>{c.cited?"✅":"❌"}</span><div><div style={{fontSize:13,fontWeight:600,marginBottom:3}}>{c.query?.slice(0,70)}</div><div style={{fontSize:12,color:"var(--text-sub)",lineHeight:1.4}}>{c.improvement_hint?.slice(0,120)}</div></div></div></div>)}
    {!cits.length&&<div style={{color:"var(--text-muted)",textAlign:"center",padding:40,fontSize:14}}>No checks yet. Run a visibility check above.</div>}
  </div>);
}