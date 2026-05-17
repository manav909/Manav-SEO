import AnimatedBg from "@/components/AnimatedBg";
import ThemeToggle from "@/components/ThemeToggle";
import React,{useState,useEffect} from "react";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
const imp:any={high:{color:"#ef4444",background:"rgba(239,68,68,.1)",border:"0.5px solid rgba(239,68,68,.3)"},medium:{color:"#f59e0b",background:"rgba(245,158,11,.1)",border:"0.5px solid rgba(245,158,11,.3)"},low:{color:"#10b981",background:"rgba(16,185,129,.1)",border:"0.5px solid rgba(16,185,129,.3)"}};
export default function MorningBrief(){
  const[brief,setBrief]=useState<any>(null);const[loading,setLoading]=useState(true);const[gen,setGen]=useState(false);
  const load=async()=>{setLoading(true);const r=await post("get_morning_brief",{scope:"empire"});setBrief((r as any).brief||(r as any));setLoading(false);};
  const regen=async()=>{setGen(true);const r=await post("generate_morning_brief",{scope:"empire"});setBrief((r as any).brief||(r as any));setGen(false);};
  useEffect(()=>{load();},[]);
  const S:any={p:{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",padding:28,fontFamily:"var(--font-display,-apple-system,system-ui,sans-serif)"},c:{background:"var(--bg-card)",border:"0.5px solid #1e1e3a",borderRadius:14,padding:20,marginBottom:14},sec:{fontSize:10,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase" as const,color:"var(--text-muted)",marginBottom:10},item:{display:"flex",gap:10,padding:"9px 0",borderBottom:"0.5px solid #1e1e3a",fontSize:13,lineHeight:1.5 as const},btn:{background:"rgba(99,102,241,.15)",border:"0.5px solid rgba(99,102,241,.3)",borderRadius:8,color:"#a78bfa",padding:"8px 16px",fontSize:12,cursor:"pointer"}};
  if(loading)return<div style={{...S.p,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-muted)"}}>Loading brief...</div>;
  return(<div style={S.p}>
      <AnimatedBg/>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
      <div><div style={{fontSize:11,color:"var(--text-muted)",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</div><div style={{fontSize:22,fontWeight:700}}>🌅 Morning Brief</div>{brief?.headline&&<div style={{fontSize:14,color:"var(--text-sub)",marginTop:6,maxWidth:600,lineHeight:1.6}}>{brief.headline}</div>}</div>
      <button style={S.btn} onClick={regen} disabled={gen}>{gen?"Generating...":"↻ Regenerate"}</button>
    </div>
    {brief?.priority_actions?.length>0&&<div style={S.c}><div style={S.sec}>🎯 Priority Actions</div>{brief.priority_actions.map((a:any,i:number)=><div key={i} style={S.item}><span style={{...imp[a.impact||"medium"],padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,flexShrink:0,alignSelf:"flex-start",marginTop:2}}>{(a.impact||"med").toUpperCase()}</span><div><div style={{fontWeight:600,marginBottom:2}}>{a.action}</div><div style={{fontSize:12,color:"var(--text-sub)"}}>{a.why}</div></div></div>)}</div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      {brief?.wins?.length>0&&<div style={S.c}><div style={S.sec}>✅ Wins</div>{brief.wins.map((w:string,i:number)=><div key={i} style={{...S.item,color:"#34d399"}}><span>✓</span>{w}</div>)}</div>}
      {brief?.risks?.length>0&&<div style={S.c}><div style={S.sec}>⚠️ Risks</div>{brief.risks.map((r:string,i:number)=><div key={i} style={{...S.item,color:"#f87171"}}><span>⚠</span>{r}</div>)}</div>}
      {brief?.opportunities?.length>0&&<div style={S.c}><div style={S.sec}>💡 Opportunities</div>{brief.opportunities.map((o:string,i:number)=><div key={i} style={{...S.item,color:"#818cf8"}}><span>→</span>{o}</div>)}</div>}
      {brief?.algorithm_watch?.length>0&&<div style={S.c}><div style={S.sec}>🔍 Algorithm Watch</div>{brief.algorithm_watch.map((a:string,i:number)=><div key={i} style={{...S.item,color:"#f59e0b"}}><span>◉</span>{a}</div>)}</div>}
    </div>
    {!brief?.headline&&<div style={{...S.c,textAlign:"center",padding:40}}><div style={{color:"var(--text-muted)",marginBottom:16}}>No brief generated yet.</div><button style={{...S.btn,padding:"12px 24px"}} onClick={regen}>Generate Today's Brief</button></div>}
  </div>);
}