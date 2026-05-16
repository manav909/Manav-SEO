import React, { useState, useEffect, useCallback } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import AnimatedBg from "@/components/AnimatedBg";
import MetricCard from "@/components/MetricCard";
import ThemeToggle from "@/components/ThemeToggle";

const post = (a:string,b:any={}) =>
  fetch("/api/task-engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));

function ProgressRing({ value, size=60, stroke=4, color }: any) {
  const r = (size-stroke*2)/2;
  const circ = 2*Math.PI*r;
  const offset = circ-(value/100)*circ;
  return (
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset}
        strokeLinecap="round" style={{transition:"stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)"}}/>
    </svg>
  );
}

export default function ClientDashboard() {
  const { theme, toggle, mode, setProject } = useTheme();
  const [projects, setProjects] = useState<any[]>([]);
  const [selProject, setSel] = useState<any>(null);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [brief, setBrief] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [learnings, setLearnings] = useState<any[]>([]);
  const [tab, setTab] = useState<"overview"|"progress"|"reports"|"insights">("overview");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    import("@/lib/supabase").then(({supabase})=>{
      supabase.from("projects").select("*").limit(10).then(({data})=>{
        setProjects(data||[]);
        if(data?.length){setSel(data[0]);setProject(data[0]);}
        setLoading(false);
      });
    });
  },[]);

  const loadProject = useCallback(async (p: any) => {
    setSel(p); setProject(p);
    const [m,b,r,a,l] = await Promise.allSettled([
      import("@/lib/supabase").then(({supabase})=>supabase.from("metrics").select("*").eq("project_id",p.id).order("recorded_at",{ascending:false}).limit(8)),
      post("get_morning_brief",{scope:"project",projectId:p.id}),
      post("get_reports",{projectId:p.id,limit:5}),
      post("get_alerts",{projectId:p.id,limit:5}),
      import("@/lib/supabase").then(({supabase})=>supabase.from("brain_learnings").select("card_title,what_worked,confidence_score").eq("project_id",p.id).order("confidence_score",{ascending:false}).limit(6)),
    ]);
    if(m.status==="fulfilled") setMetrics(m.value.data||[]);
    if(b.status==="fulfilled") setBrief((b.value as any).brief||(b.value as any));
    if(r.status==="fulfilled") setReports((r.value as any).reports||[]);
    if(a.status==="fulfilled") setAlerts((a.value as any).alerts||[]);
    if(l.status==="fulfilled") setLearnings(l.value.data||[]);
    // Health
    const h = await post("get_health_dashboard");
    const ph = (h as any).health?.find((x:any)=>x.project_id===p.id);
    if(ph) setHealth(ph);
  },[setProject]);

  useEffect(()=>{if(selProject)loadProject(selProject);},[selProject]);

  const latest = metrics[0];
  const prev = metrics[1];
  const trafficTrend = latest&&prev ? Math.round(((latest.organic_traffic-prev.organic_traffic)/Math.max(prev.organic_traffic,1))*100) : 0;
  const rankTrend = latest&&prev ? -(latest.avg_position - (prev.avg_position||0)) : 0;

  if(loading) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
      <AnimatedBg/>
      <div style={{zIndex:1,textAlign:"center"}}>
        <div style={{width:40,height:40,border:`3px solid var(--accent)`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/>
        <div style={{color:"var(--text-muted)",fontSize:14}}>Loading your dashboard...</div>
      </div>
    </div>
  );

  return (
    <div className="empire-page" style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      <AnimatedBg/>
      <div style={{position:"relative",zIndex:1}}>

        {/* Sticky header */}
        <div style={{background:"rgba(var(--bg-card),0.85)",backdropFilter:"blur(20px)",
          borderBottom:"0.5px solid var(--border)",padding:"0 24px",height:58,
          display:"flex",alignItems:"center",justifyContent:"space-between",
          position:"sticky",top:0,zIndex:100}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div className="empire-live-dot"/>
            <div>
              <div style={{fontSize:15,fontWeight:700,letterSpacing:"var(--letter-spacing)"}}>
                {selProject?.name||"Your Dashboard"}
              </div>
              {selProject&&<div style={{fontSize:10,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"1px"}}>
                {selProject.industry} · {selProject.market}
              </div>}
            </div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            {projects.length>1&&(
              <select style={{background:"var(--bg-card)",border:"0.5px solid var(--border)",
                borderRadius:8,color:"var(--text)",padding:"6px 12px",fontSize:12,cursor:"pointer"}}
                value={selProject?.id||""} onChange={e=>{
                  const p=projects.find((x:any)=>x.id===e.target.value);
                  if(p)loadProject(p);
                }}>
                {projects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <ThemeToggle compact/>
          </div>
        </div>

        {/* Hero banner */}
        {selProject&&(
          <div style={{padding:"32px 24px 24px",borderBottom:"0.5px solid var(--border)"}}>
            <div style={{maxWidth:900,margin:"0 auto"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:24}}>
                <div>
                  <div style={{fontSize:11,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:6}}>
                    {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long"})}
                  </div>
                  <div style={{fontSize:28,fontWeight:700,letterSpacing:"var(--letter-spacing)",background:"var(--grad-accent)",
                    WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1.2,marginBottom:6}}>
                    {brief?.headline||`${selProject.name} — SEO Campaign`}
                  </div>
                  <div style={{fontSize:14,color:"var(--text-sub)",maxWidth:520,lineHeight:1.6}}>
                    {selProject.goals||"Building organic growth and authority"}
                  </div>
                </div>
                {health&&(
                  <div style={{textAlign:"center",flexShrink:0}}>
                    <div style={{position:"relative",display:"inline-block"}}>
                      <ProgressRing value={health.overall_score||0} size={72} stroke={5} color={health.overall_score>=70?"#10b981":health.overall_score>=50?"var(--accent)":"#ef4444"}/>
                      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
                        <div style={{fontSize:16,fontWeight:700,color:health.overall_score>=70?"#10b981":health.overall_score>=50?"var(--accent)":"#ef4444"}}>{health.overall_score}</div>
                      </div>
                    </div>
                    <div style={{fontSize:9,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"1px",marginTop:4}}>Health</div>
                  </div>
                )}
              </div>

              {/* Metric strip */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
                <MetricCard value={latest?.organic_traffic||0} label="Monthly Traffic" trend={trafficTrend} icon="📈" suffix=" visits" animate/>
                <MetricCard value={latest?.organic_keywords||0} label="Keywords" icon="🔑" animate/>
                <MetricCard value={latest?.top_10_keywords||0} label="Top 10 Rankings" icon="🏆" animate/>
                <MetricCard value={latest?.llm_visibility_score||0} label="AI Visibility" icon="🤖" suffix="%" animate/>
                <MetricCard value={latest?.backlinks_count||0} label="Backlinks" icon="🔗" animate/>
                <MetricCard value={typeof latest?.avg_position==="number"?parseFloat(latest.avg_position.toFixed(1)):0} label="Avg Position" icon="📊" prefix="#" animate/>
              </div>
            </div>
          </div>
        )}

        {/* Tab navigation */}
        <div style={{borderBottom:"0.5px solid var(--border)",padding:"0 24px",display:"flex",gap:2}}>
          {([["overview","🏠 Overview"],["progress","📈 Progress"],["reports","📋 Reports"],["insights","💡 Insights"]] as [typeof tab,string][]).map(([id,l])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{padding:"12px 16px",fontSize:12,fontWeight:500,cursor:"pointer",border:"none",
                background:"transparent",color:tab===id?"var(--accent-soft)":"var(--text-muted)",
                borderBottom:tab===id?"2px solid var(--accent)":"2px solid transparent",
                transition:"all .2s",letterSpacing:".3px"}}>
              {l}
            </button>
          ))}
        </div>

        <div style={{maxWidth:900,margin:"0 auto",padding:"20px 24px"}}>

          {tab==="overview"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

              {/* Today's priorities */}
              <div className="empire-card" style={{gridColumn:"1/-1"}}>
                <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600,letterSpacing:"1.2px",textTransform:"uppercase",marginBottom:14}}>
                  🎯 This Week's Focus
                </div>
                {brief?.priority_actions?.length>0
                  ? brief.priority_actions.slice(0,3).map((a:any,i:number)=>(
                    <div key={i} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:"0.5px solid var(--border)",alignItems:"flex-start"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,marginTop:1,
                        background:`var(--accent-glow)`,border:`1px solid var(--border-glow)`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:10,fontWeight:700,color:"var(--accent-soft)"}}>
                        {i+1}
                      </div>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:2}}>{a.action}</div>
                        <div style={{fontSize:12,color:"var(--text-sub)"}}>{a.why}</div>
                      </div>
                      <span style={{marginLeft:"auto",flexShrink:0,fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:20,
                        background:a.impact==="high"?"rgba(239,68,68,.1)":"var(--accent-glow)",
                        color:a.impact==="high"?"#f87171":"var(--accent-soft)"}}>
                        {(a.impact||"med").toUpperCase()}
                      </span>
                    </div>
                  ))
                  : <div style={{color:"var(--text-muted)",fontSize:13}}>Your strategy is being generated. Check back shortly.</div>
                }
              </div>

              {/* Wins */}
              <div className="empire-card">
                <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600,letterSpacing:"1.2px",textTransform:"uppercase",marginBottom:12}}>
                  ✅ Recent Wins
                </div>
                {brief?.wins?.length>0
                  ? brief.wins.map((w:string,i:number)=>(
                    <div key={i} style={{display:"flex",gap:8,padding:"7px 0",borderBottom:"0.5px solid var(--border)",fontSize:13,color:"#34d399",lineHeight:1.4}}>
                      <span style={{flexShrink:0,opacity:.6}}>✓</span>{w}
                    </div>
                  ))
                  : learnings.filter(l=>l.confidence_score>80).slice(0,3).map((l:any,i:number)=>(
                    <div key={i} style={{display:"flex",gap:8,padding:"7px 0",borderBottom:"0.5px solid var(--border)",fontSize:12,color:"#34d399"}}>
                      <span>✓</span>{l.card_title}
                    </div>
                  ))
                }
                {!brief?.wins?.length&&!learnings.length&&<div style={{color:"var(--text-muted)",fontSize:12}}>Wins are being verified. Building your track record.</div>}
              </div>

              {/* Alerts */}
              <div className="empire-card">
                <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600,letterSpacing:"1.2px",textTransform:"uppercase",marginBottom:12}}>
                  🔔 Notifications
                </div>
                {alerts.slice(0,4).map((a:any)=>(
                  <div key={a.id} style={{display:"flex",gap:8,padding:"7px 0",borderBottom:"0.5px solid var(--border)",alignItems:"flex-start"}}>
                    <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,flexShrink:0,marginTop:2,
                      background:a.severity==="warning"?"rgba(245,158,11,.1)":a.severity==="critical"?"rgba(239,68,68,.1)":"var(--accent-glow)",
                      color:a.severity==="warning"?"#f59e0b":a.severity==="critical"?"#f87171":"var(--accent-soft)"}}>
                      {a.severity?.toUpperCase()}
                    </span>
                    <div style={{fontSize:12,color:"var(--text-sub)",lineHeight:1.4}}>{a.title}</div>
                  </div>
                ))}
                {!alerts.length&&<div style={{color:"var(--text-muted)",fontSize:12}}>No alerts. Everything is running smoothly. ✓</div>}
              </div>
            </div>
          )}

          {tab==="progress"&&(
            <div>
              <div style={{fontSize:12,color:"var(--text-sub)",marginBottom:16}}>
                8-week performance trend for {selProject?.name}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:16}}>
                {metrics.slice(0,8).reverse().map((m:any,i:number)=>(
                  <div className="empire-card" key={i} style={{padding:"12px 14px"}}>
                    <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:6}}>
                      Week {i+1} · {new Date(m.recorded_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}
                    </div>
                    <div style={{fontSize:16,fontWeight:700,color:"var(--accent)",fontFamily:"monospace"}}>
                      {(m.organic_traffic||0).toLocaleString()}
                    </div>
                    <div style={{fontSize:9,color:"var(--text-muted)",textTransform:"uppercase"}}>Organic visits</div>
                    <div style={{marginTop:6}}>
                      <div className="empire-progress-track">
                        <div className="empire-progress-fill" style={{width:`${Math.min((m.organic_traffic||0)/50,100)}%`}}/>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Verified tactics */}
              <div className="empire-card">
                <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600,letterSpacing:"1.2px",textTransform:"uppercase",marginBottom:14}}>
                  🧠 Proven Tactics (verified wins)
                </div>
                {learnings.map((l:any,i:number)=>(
                  <div key={i} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:"0.5px solid var(--border)",alignItems:"center"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:3}}>{l.card_title}</div>
                      {l.what_worked?.slice(0,2).map((w:string,j:number)=>(
                        <div key={j} style={{fontSize:11,color:"#34d399"}}>✓ {w}</div>
                      ))}
                    </div>
                    <div style={{flexShrink:0,textAlign:"center"}}>
                      <ProgressRing value={l.confidence_score||0} size={40} stroke={3} color={l.confidence_score>=80?"#10b981":"var(--accent)"}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab==="reports"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:12,color:"var(--text-sub)"}}>Your campaign reports</div>
                <button className="empire-btn" onClick={()=>post("generate_report",{projectId:selProject?.id,reportType:"monthly"})
                  .then(()=>post("get_reports",{projectId:selProject?.id,limit:5}).then(r=>setReports((r as any).reports||[])))}>
                  + Generate Report
                </button>
              </div>
              {reports.map((r:any)=>(
                <div key={r.id} className="empire-card" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:4}}>{r.title}</div>
                    <div style={{display:"flex",gap:8}}>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"var(--accent-glow)",color:"var(--accent-soft)"}}>{r.report_type}</span>
                      <span style={{fontSize:10,color:"var(--text-muted)"}}>{new Date(r.created_at).toLocaleDateString("en-GB")}</span>
                    </div>
                  </div>
                  <a href={`/reports/${r.token}`} target="_blank"
                    style={{background:"var(--accent-glow)",border:"0.5px solid var(--border-glow)",
                      borderRadius:8,color:"var(--accent-soft)",padding:"7px 14px",fontSize:11,
                      fontWeight:600,textDecoration:"none"}}>
                    View Report ↗
                  </a>
                </div>
              ))}
              {!reports.length&&<div className="empire-card" style={{textAlign:"center",padding:40,color:"var(--text-muted)"}}>
                No reports generated yet. Click Generate Report above.
              </div>}
            </div>
          )}

          {tab==="insights"&&(
            <div>
              <div className="empire-card" style={{marginBottom:14,borderColor:"var(--border-glow)"}}>
                <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600,letterSpacing:"1.2px",textTransform:"uppercase",marginBottom:12}}>
                  🤖 LLM Visibility
                </div>
                <div style={{fontSize:13,color:"var(--text-sub)",lineHeight:1.7,marginBottom:12}}>
                  Your brand is being tested against AI models — ChatGPT, Claude, Gemini. When someone asks about your industry, do they recommend you? This is the frontier of modern SEO.
                </div>
                {latest?.llm_visibility_score!=null&&(
                  <div style={{display:"flex",gap:12,alignItems:"center"}}>
                    <ProgressRing value={latest.llm_visibility_score} size={56} stroke={4} color={latest.llm_visibility_score>=60?"#10b981":"var(--accent)"}/>
                    <div>
                      <div style={{fontSize:20,fontWeight:700,color:"var(--accent)",fontFamily:"monospace"}}>{latest.llm_visibility_score}%</div>
                      <div style={{fontSize:11,color:"var(--text-muted)"}}>AI citation rate</div>
                      <div style={{fontSize:11,color:latest.llm_visibility_score>=60?"#34d399":"#f59e0b",marginTop:2}}>
                        {latest.llm_visibility_score>=60?"Strong visibility":"Growing — target 60%+"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {brief?.algorithm_watch?.length>0&&(
                <div className="empire-card">
                  <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600,letterSpacing:"1.2px",textTransform:"uppercase",marginBottom:12}}>
                    🔍 Algorithm Watch
                  </div>
                  {brief.algorithm_watch.map((a:string,i:number)=>(
                    <div key={i} style={{padding:"7px 0",borderBottom:"0.5px solid var(--border)",fontSize:13,color:"var(--text-sub)"}}>
                      ◉ {a}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
