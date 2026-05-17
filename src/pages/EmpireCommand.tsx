import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import React,{useState,useEffect} from "react";
import AnimatedBg from "@/components/AnimatedBg";
import MetricCard from "@/components/MetricCard";
import ThemeToggle from "@/components/ThemeToggle";
const post=(action:string,body:any={})=>fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...body})}).then(r=>r.json()).catch(()=>({}));

function ProgressRing({value,size=52,stroke=4,color}:{value:number,size?:number,stroke?:number,color:string}){
  const r=(size-stroke*2)/2,circ=2*Math.PI*r,offset=circ-(value/100)*circ;
  return(<svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--progress-track)" strokeWidth={stroke}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
      strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset} strokeLinecap="round"
      style={{transition:"stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)"}}/>
  </svg>);
}

export default function EmpireCommand(){
  const { selectedProjectId: projectId } = useProject();
  const[stats,setStats]=useState<any>({});
  const[health,setHealth]=useState<any[]>([]);
  const[alerts,setAlerts]=useState<any[]>([]);
  const[brief,setBrief]=useState<any>(null);
  const[loading,setLoading]=useState(true);
  const load=()=>{setLoading(true);Promise.allSettled([
    post("get_empire_stats"),post("get_health_dashboard"),
    post("get_alerts",{unreadOnly:true,limit:5}),post("get_morning_brief",{scope:"empire"})
  ]).then(([s,h,a,b])=>{
    if(s.status==="fulfilled")setStats((s.value as any).stats||{});
    if(h.status==="fulfilled")setHealth((h.value as any).health||[]);
    if(a.status==="fulfilled")setAlerts((a.value as any).alerts||[]);
    if(b.status==="fulfilled")setBrief((b.value as any).brief||(b.value as any));
    setLoading(false);
  });};
  useEffect(()=>{load();},[]);
  const rc:any={low:"#10b981",medium:"#f59e0b",high:"#ef4444",critical:"#dc2626"};

  return(
    <div className="empire-page" style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"var(--font-display)"}}>
      <PortalNav />
      
      <div style={{position:"relative",zIndex:1}}>
        {/* Header */}
        
          <div style={{display:"flex",gap:8}}>
            <button className="empire-btn" onClick={load} disabled={loading}>{loading?"↻ Loading":"↻ Refresh"}</button>
                      </div>
        </div>

        <div style={{maxWidth:1100,margin:"0 auto",padding:"20px 24px 100px"}}>
          {/* Brief headline */}
          {brief?.headline&&(
            <div className="glass-card warp-in" style={{padding:"18px 22px",marginBottom:16,
              borderColor:"var(--border-glow)"}}>
              <div style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--text-muted)",
                letterSpacing:"1.5px",textTransform:"uppercase" as const,marginBottom:6}}>
                ✦ JARVIS · {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long"})}
              </div>
              <div style={{fontSize:20,fontWeight:700,color:"var(--text)",letterSpacing:"-.02em",lineHeight:1.3}}>
                {brief.headline}
              </div>
            </div>
          )}

          {/* Stat strip */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>
            <MetricCard value={stats.projects||0} label="Active Projects" icon="🏗" animate/>
            <MetricCard value={stats.learnings||0} label="Learnings" icon="🧠" animate/>
            <MetricCard value={stats.verifications||0} label="Verified Wins" icon="✅" animate/>
            <MetricCard value={stats.llmCitations||0} label="LLM Citations" icon="🤖" animate/>
            <MetricCard value={stats.prospects||0} label="Leads" icon="🎯" animate/>
            <MetricCard value={stats.alertsUnread||0} label="Alerts" icon="🚨"
              color={stats.alertsUnread>0?"#ef4444":undefined} animate/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
            {/* Health grid */}
            <div className="glass-card" style={{padding:"18px"}}>
              <div style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--text-muted)",
                letterSpacing:"1.5px",textTransform:"uppercase" as const,marginBottom:14}}>
                CLIENT HEALTH
              </div>
              {health.length===0&&<div style={{color:"var(--text-muted)",fontSize:13,padding:"20px 0"}}>
                {loading?"Loading...":"No health data. Run health calculations."}
              </div>}
              {health.map((h:any)=>(
                <div key={h.project_id} style={{display:"flex",alignItems:"center",gap:12,
                  padding:"10px 0",borderBottom:"0.5px solid var(--border)"}}>
                  <div style={{position:"relative" as const,flexShrink:0}}>
                    <ProgressRing value={h.overall_score||0} size={44} stroke={3}
                      color={rc[h.churn_risk]||"var(--accent)"}/>
                    <div style={{position:"absolute" as const,inset:0,display:"flex",
                      alignItems:"center",justifyContent:"center" as const,
                      fontSize:10,fontWeight:700,color:rc[h.churn_risk]||"var(--accent)"}}>
                      {h.overall_score}
                    </div>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:"var(--text)",marginBottom:2,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>
                      {(h as any).projects?.name||"Project"}
                    </div>
                    <div style={{fontSize:10,color:"var(--text-muted)"}}>{h.recommended_action?.slice(0,50)||""}</div>
                  </div>
                  <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,flexShrink:0,
                    background:`${rc[h.churn_risk]||"var(--accent)"}15`,
                    color:rc[h.churn_risk]||"var(--accent)"}}>
                    {(h.churn_risk||"ok").toUpperCase()}
                  </span>
                </div>
              ))}
              {!health.length&&!loading&&(
                <button className="empire-btn" onClick={()=>post("calculate_all_health").then(load)}
                  style={{marginTop:10}}>Calculate Health Scores</button>
              )}
            </div>

            {/* Alerts + priorities */}
            <div style={{display:"flex",flexDirection:"column" as const,gap:12}}>
              <div className="glass-card" style={{padding:"16px"}}>
                <div style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--text-muted)",
                  letterSpacing:"1.5px",textTransform:"uppercase" as const,marginBottom:12}}>
                  ALERTS
                </div>
                {alerts.map((a:any)=>(
                  <div key={a.id} style={{display:"flex",gap:8,padding:"7px 0",
                    borderBottom:"0.5px solid var(--border)",alignItems:"flex-start"}}>
                    <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:20,
                      flexShrink:0,marginTop:2,
                      background:`${a.severity==="warning"?"rgba(245,158,11,.12)":"rgba(239,68,68,.12)"}`,
                      color:a.severity==="warning"?"#f59e0b":"#ef4444"}}>
                      {a.severity?.toUpperCase()}
                    </span>
                    <div style={{fontSize:11,color:"var(--text-sub)",lineHeight:1.4}}>{a.title}</div>
                  </div>
                ))}
                {!alerts.length&&<div style={{fontSize:12,color:"var(--text-muted)"}}>No alerts ✓</div>}
                <a href="/alerts" style={{display:"block",marginTop:10,fontSize:11,
                  color:"var(--accent-soft)",textDecoration:"none",fontWeight:600}}>View all →</a>
              </div>

              {brief?.priority_actions?.length>0&&(
                <div className="glass-card" style={{padding:"16px"}}>
                  <div style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--text-muted)",
                    letterSpacing:"1.5px",textTransform:"uppercase" as const,marginBottom:12}}>
                    TODAY'S FOCUS
                  </div>
                  {brief.priority_actions.slice(0,3).map((a:any,i:number)=>(
                    <div key={i} style={{display:"flex",gap:8,padding:"7px 0",
                      borderBottom:"0.5px solid var(--border)"}}>
                      <span style={{fontSize:10,fontWeight:700,color:"var(--accent)",
                        fontFamily:"var(--font-mono)",flexShrink:0}}>{i+1}</span>
                      <div style={{fontSize:11,color:"var(--text-sub)",lineHeight:1.4}}>{a.action}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
