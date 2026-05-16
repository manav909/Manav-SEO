import React,{useState,useEffect} from "react";
const post=(action:string,body:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...body})}).then(r=>r.json()).catch(()=>({}));
export default function EmpireCommand(){
  const[stats,setStats]=useState<any>({});
  const[health,setHealth]=useState<any[]>([]);
  const[alerts,setAlerts]=useState<any[]>([]);
  const[brief,setBrief]=useState<any>(null);
  const[loading,setLoading]=useState(true);
  const load=()=>{setLoading(true);Promise.allSettled([post("get_empire_stats"),post("get_health_dashboard"),post("get_alerts",{unreadOnly:true,limit:5}),post("get_morning_brief",{scope:"empire"})]).then(([s,h,a,b])=>{if(s.status==="fulfilled")setStats((s.value as any).stats||{});if(h.status==="fulfilled")setHealth((h.value as any).health||[]);if(a.status==="fulfilled")setAlerts((a.value as any).alerts||[]);if(b.status==="fulfilled")setBrief((b.value as any).brief||(b.value as any));setLoading(false);});};
  useEffect(()=>{load();},[]);
  const rc:any={low:"#10b981",medium:"#f59e0b",high:"#ef4444",critical:"#dc2626"};
  const S:any={p:{minHeight:"100vh",background:"#07070f",color:"#f0f0ff",padding:28,fontFamily:"-apple-system,system-ui,sans-serif"},card:{background:"#0a0a18",border:"0.5px solid #1a1a3a",borderRadius:14,padding:20,marginBottom:14},nav:{display:"flex",gap:8,flexWrap:"wrap" as const,marginBottom:20},a:{padding:"8px 14px",borderRadius:8,fontSize:12,textDecoration:"none",color:"#8b8ba8",background:"rgba(255,255,255,.04)",border:"0.5px solid #1a1a3a"},stat:{background:"#0a0a18",border:"0.5px solid #1a1a3a",borderRadius:12,padding:"16px 20px"}};
  const links=[["/morning-brief","🌅 Brief"],["/build","👑 Build"],["/brain-command","🧠 Brain"],["/llm-visibility","🤖 LLM"],["/health","❤️ Health"],["/alerts","🚨 Alerts"],["/reports","📊 Reports"],["/content-hub","📝 Content"],["/client-portal","👥 Clients"],["/revenue-proof","💰 Revenue"],["/intake","🎯 Intake"],["/brain-learning","🔬 Learnings"]];
  const statItems=[{v:stats.projects||0,l:"Projects",c:"#6366f1"},{v:stats.learnings||0,l:"Learnings",c:"#a78bfa"},{v:stats.verifications||0,l:"Verified",c:"#10b981"},{v:stats.llmCitations||0,l:"LLM Cited",c:"#06b6d4"},{v:stats.alertsUnread||0,l:"Alerts",c:stats.alertsUnread>0?"#ef4444":"#4b4b6a"},{v:stats.prospects||0,l:"Prospects",c:"#f59e0b"}];
  if(loading)return<div style={{...S.p,display:"flex",alignItems:"center",justifyContent:"center",color:"#4b4b6a"}}>Loading empire command...</div>;
  return(<div style={S.p}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div><div style={{fontSize:24,fontWeight:700}}>👑 Empire Command</div><div style={{fontSize:13,color:"#8b8ba8",marginTop:4}}>{brief?.headline||"Empire operational."}</div></div>
      <div style={{display:"flex",gap:8}}>{alerts.length>0&&<span style={{fontSize:12,padding:"6px 12px",borderRadius:20,background:"rgba(239,68,68,.1)",color:"#f87171",border:"0.5px solid rgba(239,68,68,.2)"}}>{alerts.length} alerts</span>}<button onClick={load} style={{padding:"8px 14px",borderRadius:8,border:"0.5px solid #1a1a3a",background:"transparent",color:"#8b8ba8",cursor:"pointer",fontSize:12}}>↻ Refresh</button></div>
    </div>
    <div style={S.nav}>{links.map(([href,label])=><a key={href} href={href} style={S.a}>{label}</a>)}</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:20}}>
      {statItems.map(t=><div key={t.l} style={S.stat}><div style={{fontSize:28,fontWeight:700,color:t.c,fontFamily:"monospace",lineHeight:1,marginBottom:4}}>{t.v}</div><div style={{fontSize:11,color:"#4b4b6a",textTransform:"uppercase",letterSpacing:.8}}>{t.l}</div></div>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <div style={S.card}><div style={{fontSize:11,color:"#4b4b6a",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Client Health</div>
        {health.slice(0,6).map((h:any)=><div key={h.project_id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"0.5px solid #1a1a3a"}}><div style={{width:8,height:8,borderRadius:"50%",background:rc[h.churn_risk]||"#4b4b6a",flexShrink:0}}/><div style={{flex:1,fontSize:13}}>{(h as any).projects?.name}</div><div style={{fontFamily:"monospace",fontSize:13,color:h.overall_score>=70?"#10b981":h.overall_score>=50?"#f59e0b":"#ef4444"}}>{h.overall_score}</div></div>)}
        {!health.length&&<div style={{color:"#4b4b6a",fontSize:13}}>Run health calc at <a href="/health" style={{color:"#6366f1"}}>/health</a></div>}
      </div>
      <div style={S.card}><div style={{fontSize:11,color:"#4b4b6a",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Latest Alerts</div>
        {alerts.slice(0,5).map((a:any)=><div key={a.id} style={{display:"flex",gap:8,padding:"7px 0",borderBottom:"0.5px solid #1a1a3a",alignItems:"flex-start"}}><span style={{fontSize:10,padding:"2px 6px",borderRadius:20,background:"rgba(239,68,68,.1)",color:"#f87171",flexShrink:0,marginTop:2}}>{a.severity?.slice(0,4)?.toUpperCase()}</span><div style={{fontSize:12,color:"#d0d0e8",lineHeight:1.4}}>{a.title}</div></div>)}
        {!alerts.length&&<div style={{color:"#4b4b6a",fontSize:13}}>No unread alerts.</div>}
      </div>
    </div>
    {brief?.priority_actions?.length>0&&<div style={{...S.card,marginTop:0}}><div style={{fontSize:11,color:"#4b4b6a",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>🎯 Today's Priorities</div>{brief.priority_actions.slice(0,3).map((a:any,i:number)=><div key={i} style={{display:"flex",gap:10,padding:"10px 0",borderBottom:"0.5px solid #1a1a3a",alignItems:"flex-start"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,flexShrink:0,marginTop:2,background:a.impact==="high"?"rgba(239,68,68,.1)":"rgba(99,102,241,.1)",color:a.impact==="high"?"#f87171":"#818cf8"}}>{(a.impact||"med").toUpperCase()}</span><div><div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{a.action}</div><div style={{fontSize:12,color:"#8b8ba8"}}>{a.why}</div></div></div>)}</div>}
  </div>);
}
