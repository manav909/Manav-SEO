import AnimatedBg from "@/components/AnimatedBg";
import ThemeToggle from "@/components/ThemeToggle";
import React,{useState,useEffect} from "react";
const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));
const rc:any={low:"#10b981",medium:"#f59e0b",high:"#ef4444",critical:"#dc2626"};
export default function HealthDashboard(){
  const[health,setHealth]=useState<any[]>([]);const[loading,setLoading]=useState(true);const[calc,setCalc]=useState(false);
  const load=async()=>{setLoading(true);const r=await post("get_health_dashboard");setHealth((r as any).health||[]);setLoading(false);};
  const calcAll=async()=>{setCalc(true);await post("calculate_all_health");await load();setCalc(false);};
  useEffect(()=>{load();},[]);
  const avg=health.length?Math.round(health.reduce((s:number,h:any)=>s+h.overall_score,0)/health.length):0;
  const S:any={p:{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",padding:28,fontFamily:"var(--font-display,-apple-system,system-ui,sans-serif)"},c:{background:"var(--bg-card)",border:"0.5px solid #1e1e3a",borderRadius:12,padding:18,marginBottom:10},btn:{background:"rgba(16,185,129,.12)",border:"0.5px solid rgba(16,185,129,.25)",borderRadius:8,color:"#10b981",padding:"9px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}};
  if(loading)return<div style={{...S.p,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-muted)"}}>Loading health data...</div>;
  return(<div style={S.p}>
      <AnimatedBg/>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div><div style={{fontSize:22,fontWeight:700}}>❤️ Client Health</div><div style={{fontSize:13,color:"var(--text-sub)",marginTop:4}}>Avg: {avg}/100 · {health.filter(h=>h.churn_risk==="high"||h.churn_risk==="critical").length} at risk</div></div>
      <button style={S.btn} onClick={calcAll} disabled={calc}>{calc?"Calculating...":"↻ Recalculate All"}</button>
    </div>
    {health.map((h:any)=><div key={h.project_id} style={{...S.c,borderColor:h.churn_risk==="high"||h.churn_risk==="critical"?`${rc[h.churn_risk]}40`:"var(--border)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div><div style={{fontSize:15,fontWeight:700}}>{(h as any).projects?.name}</div><div style={{fontSize:12,color:"var(--text-sub)",marginTop:2}}>{h.recommended_action}</div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:28,fontWeight:700,fontFamily:"monospace",lineHeight:1,color:h.overall_score>=70?"#10b981":h.overall_score>=50?"#f59e0b":"#ef4444"}}>{h.overall_score}</div><div style={{fontSize:10,color:"var(--text-muted)",textTransform:"uppercase"}}>Health</div></div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
        <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:`${rc[h.churn_risk]||"var(--text-muted)"}15`,color:rc[h.churn_risk]||"var(--text-muted)"}}>{h.churn_risk?.toUpperCase()} RISK</span>
        {h.upsell_signals?.length>0&&<span style={{fontSize:10,color:"#10b981"}}>💡 Upsell opportunity</span>}
      </div>
    </div>)}
    {!health.length&&<div style={{color:"var(--text-muted)",textAlign:"center",padding:40,fontSize:14}}>No health data. Click Recalculate All to start.</div>}
  </div>);
}