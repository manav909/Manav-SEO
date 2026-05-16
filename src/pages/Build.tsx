import GlobalSearch from "@/components/GlobalSearch";
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const REFRESH = 15000;

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}
function post(action: string, body: any = {}) {
  return fetch("/api/task-engine",{method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action,...body})}).then(r=>r.json()).catch(()=>({}));
}

export default function Build() {
  const [feed, setFeed]         = useState<any[]>([]);
  const [stats, setStats]       = useState<any>({});
  const [health, setHealth]     = useState<any[]>([]);
  const [alerts, setAlerts]     = useState<any[]>([]);
  const [brief, setBrief]       = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [tables, setTables]     = useState<Record<string,number>>({});
  const [lastSync, setLastSync] = useState("");
  const [tab, setTab]           = useState<"feed"|"health"|"brief"|"tables"|"pages">("feed");
  const [tick, setTick]         = useState(0);

  const loadAll = useCallback(async () => {
    const [bRes, sRes, hRes, aRes, brRes, pRes] = await Promise.allSettled([
      supabase.from("claude_bridge").select("id,kind,title,body,created_by,created_at,metadata")
        .order("created_at",{ascending:false}).limit(100),
      post("get_empire_stats"),
      post("get_health_dashboard"),
      post("get_alerts",{unreadOnly:false,limit:30}),
      post("get_morning_brief",{scope:"empire"}),
      supabase.from("projects").select("id,name,url,created_at").limit(30),
    ]);
    if (bRes.status==="fulfilled" && bRes.value.data) setFeed(bRes.value.data as any[]);
    if (sRes.status==="fulfilled") setStats((sRes.value as any).stats||{});
    if (hRes.status==="fulfilled") setHealth((hRes.value as any).health||[]);
    if (aRes.status==="fulfilled") setAlerts((aRes.value as any).alerts||[]);
    if (brRes.status==="fulfilled") setBrief((brRes.value as any).brief||(brRes.value as any));
    if (pRes.status==="fulfilled" && pRes.value.data) setProjects(pRes.value.data as any[]);

    const tNames = ["projects","clients","brain_learnings","task_executions",
      "verification_queue","morning_briefs","llm_citations","reports",
      "content_briefs","client_health","alerts","prospects","claude_bridge",
      "api_cost_log","crawled_pages","metrics","algorithm_knowledge"];
    const counts: Record<string,number> = {};
    await Promise.allSettled(tNames.map(async t => {
      try {
        const {count} = await supabase.from(t).select("id",{count:"exact",head:true});
        counts[t] = count||0;
      } catch { counts[t] = -1; }
    }));
    setTables(counts);
    setLastSync(new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"}));
  }, []);

  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();setShowSearch(true);}
    };
    window.addEventListener('keydown',handler);
    return()=>window.removeEventListener('keydown',handler);
  },[]);
  useEffect(()=>{loadAll();const id=setInterval(loadAll,REFRESH);return()=>clearInterval(id);},[loadAll]);
  useEffect(()=>{const id=setInterval(()=>setTick(t=>t+1),1000);return()=>clearInterval(id);},[]);

  const C: any = {
    root:{minHeight:"100vh",background:"#06060e",color:"#e8e8f8",fontFamily:"-apple-system,'SF Pro Display',system-ui,sans-serif"},
    hdr:{background:"#09091a",borderBottom:"0.5px solid #1a1a3a",height:50,padding:"0 18px",
      position:"sticky" as const,top:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"space-between"},
    dot:{width:7,height:7,borderRadius:"50%",background:"#10b981",boxShadow:"0 0 8px #10b981",flexShrink:0},
    sBar:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:8,padding:"12px 16px"},
    sCard:{background:"#0d0d1e",border:"0.5px solid #1a1a3a",borderRadius:10,padding:"10px 13px"},
    tabs:{display:"flex",background:"#09091a",borderBottom:"0.5px solid #1a1a3a",padding:"0 16px"},
    tab:{padding:"9px 13px",fontSize:12,fontWeight:500,cursor:"pointer",border:"none",
      background:"transparent",color:"#8b8ba8",borderBottom:"2px solid transparent",whiteSpace:"nowrap" as const},
    tabA:{color:"#a78bfa",borderBottom:"2px solid #a78bfa"},
    body:{padding:14,overflowY:"auto" as const,height:"calc(100vh - 90px)"},
    card:{background:"#0d0d1e",border:"0.5px solid #1a1a3a",borderRadius:11,padding:13,marginBottom:9},
    row:{display:"flex",gap:8,padding:"7px 0",borderBottom:"0.5px solid #0e0e24",alignItems:"flex-start"},
    sec:{fontSize:10,fontWeight:600,letterSpacing:1.2,textTransform:"uppercase" as const,color:"#4b4b6a",marginBottom:9},
    btn:{background:"rgba(99,102,241,.12)",border:"0.5px solid rgba(99,102,241,.25)",
      borderRadius:7,color:"#a78bfa",padding:"6px 12px",fontSize:11,fontWeight:600,cursor:"pointer"},
  };
  const kc: any = {thinking:"#3b82f6",status:"#10b981",error:"#ef4444",
    complete:"#a78bfa",warning:"#f59e0b",info:"#06b6d4"};
  const sc: any = {urgent:"#ef4444",critical:"#f97316",warning:"#f59e0b",info:"#06b6d4"};
  const rc: any = {low:"#10b981",medium:"#f59e0b",high:"#ef4444",critical:"#dc2626"};

  const unread = alerts.filter((a:any)=>!a.read_at).length;
  const statItems = [
    {v:stats.projects||0,l:"Projects",c:"#6366f1"},
    {v:stats.learnings||0,l:"Learnings",c:"#a78bfa"},
    {v:stats.verifications||0,l:"Verified",c:"#10b981"},
    {v:stats.llmCitations||0,l:"LLM Cited",c:"#06b6d4"},
    {v:unread,l:"Alerts",c:unread>0?"#ef4444":"#4b4b6a"},
    {v:stats.prospects||0,l:"Leads",c:"#f59e0b"},
    {v:feed.length,l:"Feed",c:"#8b5cf6"},
    {v:Object.values(tables).filter(v=>v>=0).reduce((a,b)=>a+b,0),l:"DB Rows",c:"#0ea5e9"},
  ];
  const pages = [
    ["/empire","👑 Empire"],["/morning-brief","🌅 Brief"],
    ["/llm-visibility","🤖 LLM"],["/alerts","🚨 Alerts"],
    ["/health","❤️ Health"],["/reports","📊 Reports"],
    ["/content-hub","📝 Content"],["/intake","🎯 Intake"],
    ["/brain-command","🧠 Brain"],["/brain-learning","🔬 Learnings"],
    ["/client-portal","👥 Clients"],["/revenue-proof","💰 Revenue"],
    ["/scale-control","🏰 Scale"],["/playground","🎮 Playground"],
  ];

  return (
    <>
    <div style={C.root}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#1a1a3a;border-radius:2px}`}
      </style>

      {/* Header */}
      <div style={C.hdr}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{...C.dot,animation:"pulse 2s infinite"}}/>
          <span style={{fontSize:14,fontWeight:700}}>👑 SEO Season</span>
          <span style={{fontSize:10,color:"#3b3b5a",letterSpacing:1}}>LIVE SURVEILLANCE</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:11,color:"#3b3b5a",fontFamily:"monospace"}}>{lastSync}</span>
          <button onClick={()=>setShowSearch(true)} style={{background:"var(--accent-glow)",
          border:"0.5px solid var(--border-glow)",borderRadius:7,color:"var(--accent-soft)",
          padding:"5px 12px",fontSize:11,cursor:"pointer",display:"flex",gap:6,alignItems:"center"}}>
          🔍 <span>Search</span> <span style={{fontSize:9,opacity:.6}}>⌘K</span>
        </button>
        <button onClick={loadAll} style={C.btn}>↻</button>
          <div style={{display:"flex",gap:5}}>
            {pages.slice(0,5).map(([h,l])=>(
              <a key={h} href={h} style={{fontSize:10,color:"#4b4b6a",textDecoration:"none",
                padding:"3px 8px",borderRadius:5,background:"rgba(255,255,255,.03)",
                border:"0.5px solid #1a1a3a"}}>{l}</a>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={C.sBar}>
        {statItems.map(t=>(
          <div key={t.l} style={C.sCard}>
            <div style={{fontSize:20,fontWeight:700,color:t.c,fontFamily:"monospace",lineHeight:1,marginBottom:2}}>{t.v}</div>
            <div style={{fontSize:9,color:"#3b3b5a",textTransform:"uppercase",letterSpacing:.8}}>{t.l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={C.tabs}>
        {([["feed",`📡 Feed (${feed.length})`],["health",`❤️ Health${unread>0?` (${unread})`:""}`],
           ["brief","🌅 Brief"],["tables","🗄 DB"],["pages","🗺 Pages"]] as [typeof tab,string][])
          .map(([id,label])=>(
            <button key={id} style={{...C.tab,...(tab===id?C.tabA:{})}} onClick={()=>setTab(id)}>
              {label}
            </button>
          ))}
      </div>

      <div style={C.body}>

        {/* FEED */}
        {tab==="feed"&&(
          <div>
            {/* Top row: brief + alerts */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div style={{...C.card,borderColor:"rgba(99,102,241,.2)"}}>
                <div style={C.sec}>🌅 Today's Brief</div>
                {brief?.headline
                  ? <>
                    <div style={{fontSize:13,fontWeight:600,color:"#f0f0ff",marginBottom:8,lineHeight:1.5}}>
                      {brief.headline}
                    </div>
                    {brief.priority_actions?.slice(0,3).map((a:any,i:number)=>(
                      <div key={i} style={{...C.row,padding:"5px 0"}}>
                        <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:20,
                          background:(a.impact==="high"?"#ef4444":a.impact==="medium"?"#f59e0b":"#10b981")+"18",
                          color:a.impact==="high"?"#ef4444":a.impact==="medium"?"#f59e0b":"#10b981",
                          flexShrink:0,marginTop:1}}>
                          {(a.impact||"med").slice(0,3).toUpperCase()}
                        </span>
                        <div style={{fontSize:12,color:"#d0d0e8",lineHeight:1.4}}>
                          <div style={{fontWeight:600,marginBottom:1}}>{a.action}</div>
                          <div style={{fontSize:11,color:"#8b8ba8"}}>{a.why}</div>
                        </div>
                      </div>
                    ))}
                  </>
                  : <div style={{color:"#4b4b6a",fontSize:12}}>No brief yet.
                    <button onClick={()=>post("generate_morning_brief",{scope:"empire"}).then(loadAll)}
                      style={{...C.btn,marginLeft:8,padding:"3px 8px",fontSize:10}}>Generate</button>
                  </div>
                }
              </div>
              <div style={C.card}>
                <div style={C.sec}>🚨 Alerts ({unread} unread)</div>
                {alerts.slice(0,5).map((a:any)=>(
                  <div key={a.id} style={{...C.row,opacity:a.read_at?.5:1}}>
                    <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:20,
                      background:(sc[a.severity]||"#4b4b6a")+"18",
                      color:sc[a.severity]||"#4b4b6a",flexShrink:0,marginTop:1}}>
                      {a.severity?.slice(0,4).toUpperCase()}
                    </span>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:"#f0f0ff"}}>{a.title}</div>
                      <div style={{fontSize:10,color:"#4b4b6a"}}>{ago(a.created_at)} ago · {a.alert_type?.replace(/_/g," ")}</div>
                    </div>
                  </div>
                ))}
                {!alerts.length&&<div style={{color:"#4b4b6a",fontSize:12}}>No alerts. Empire calm.</div>}
              </div>
            </div>

            {/* Live feed */}
            <div style={C.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
                <div style={C.sec}>📡 Live Bridge Feed</div>
                <div style={{fontSize:10,color:"#3b3b5a"}}>auto-refresh every 15s</div>
              </div>
              {feed.map((r:any)=>{
                const col=kc[r.kind]||"#4b4b6a";
                const icon=r.kind==="thinking"?"→":r.kind==="error"?"✗":
                  (r.body||"").includes("DONE")||r.kind==="complete"?"✓":
                  r.created_by==="claude_chat"?"💬":"▸";
                return(
                  <div key={r.id} style={{...C.row,
                    background:r.kind==="error"?"rgba(239,68,68,.03)":
                      r.kind==="thinking"?"rgba(59,130,246,.02)":"transparent"}}>
                    <span style={{color:col,fontSize:13,flexShrink:0,width:14,textAlign:"center"as const}}>{icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2,flexWrap:"wrap" as const}}>
                        <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:20,
                          background:col+"18",color:col,flexShrink:0}}>{r.kind}</span>
                        <span style={{fontSize:10,color:"#3b3b5a"}}>{r.created_by}</span>
                        {r.title&&<span style={{fontSize:10,color:"#5b5b7a",overflow:"hidden",
                          textOverflow:"ellipsis",whiteSpace:"nowrap" as const,maxWidth:300}}>{r.title}</span>}
                        <span style={{fontSize:10,color:"#2d2d4a",marginLeft:"auto",flexShrink:0}}>
                          {ago(r.created_at)}
                        </span>
                      </div>
                      <div style={{fontSize:11,color:"#8b8ba8",lineHeight:1.4,
                        overflow:"hidden",textOverflow:"ellipsis",
                        display:"-webkit-box",WebkitLineClamp:2,
                        WebkitBoxOrient:"vertical" as const}}>
                        {r.body}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!feed.length&&<div style={{color:"#4b4b6a",textAlign:"center",padding:20,fontSize:12}}>
                No messages yet. Activity will appear here in real time.
              </div>}
            </div>
          </div>
        )}

        {/* HEALTH */}
        {tab==="health"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:600}}>Client Health
                {health.length>0&&<span style={{marginLeft:8,fontSize:12,color:"#4b4b6a"}}>
                  avg {Math.round(health.reduce((s:number,h:any)=>s+h.overall_score,0)/health.length)}/100
                </span>}
              </div>
              <button style={C.btn} onClick={()=>post("calculate_all_health").then(loadAll)}>
                ↻ Recalculate All
              </button>
            </div>
            {health.map((h:any)=>(
              <div key={h.project_id} style={{...C.card,
                borderColor:h.churn_risk==="high"||h.churn_risk==="critical"
                  ?`${rc[h.churn_risk]||"#ef4444"}35`:"#1a1a3a"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700}}>{(h as any).projects?.name||"Project"}</div>
                    <div style={{fontSize:11,color:"#8b8ba8",marginTop:2}}>{h.recommended_action}</div>
                  </div>
                  <div style={{textAlign:"right" as const}}>
                    <div style={{fontSize:24,fontWeight:700,fontFamily:"monospace",lineHeight:1,
                      color:h.overall_score>=70?"#10b981":h.overall_score>=50?"#f59e0b":"#ef4444"}}>
                      {h.overall_score}
                    </div>
                    <div style={{fontSize:9,color:"#4b4b6a",textTransform:"uppercase" as const}}>Health</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  {[["Brain",h.brain_score],["Velocity",h.velocity_score]].map(([l,v])=>(
                    <div key={l} style={{background:"#070710",borderRadius:6,padding:"6px 10px"}}>
                      <div style={{fontSize:12,fontWeight:700,fontFamily:"monospace"}}>{v}/100</div>
                      <div style={{fontSize:9,color:"#4b4b6a",textTransform:"uppercase" as const}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap" as const,alignItems:"center"}}>
                  <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,
                    background:`${rc[h.churn_risk]||"#4b4b6a"}18`,color:rc[h.churn_risk]||"#4b4b6a"}}>
                    {h.churn_risk?.toUpperCase()} RISK
                  </span>
                  {h.upsell_signals?.length>0&&<span style={{fontSize:10,color:"#10b981"}}>💡 Upsell</span>}
                  {h.days_to_renewal!=null&&
                    <span style={{fontSize:10,color:"#8b8ba8"}}>
                      {h.days_to_renewal>0?`Renews in ${h.days_to_renewal}d`:"Renewal overdue"}
                    </span>}
                </div>
                {h.churn_signals?.length>0&&(
                  <div style={{marginTop:6,display:"flex",flexWrap:"wrap" as const,gap:4}}>
                    {h.churn_signals.map((s:string,i:number)=>(
                      <span key={i} style={{fontSize:9,padding:"2px 7px",borderRadius:20,
                        background:"rgba(239,68,68,.07)",color:"#f87171"}}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!health.length&&<div style={{color:"#4b4b6a",textAlign:"center",padding:40,fontSize:13}}>
              No health data. Click Recalculate All to generate scores.
            </div>}
          </div>
        )}

        {/* BRIEF */}
        {tab==="brief"&&(
          <div>
            {brief?.headline?(
              <div>
                <div style={{...C.card,borderColor:"rgba(99,102,241,.2)"}}>
                  <div style={{fontSize:11,color:"#4b4b6a",letterSpacing:1,textTransform:"uppercase" as const,marginBottom:4}}>
                    {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}
                  </div>
                  <div style={{fontSize:18,fontWeight:700,lineHeight:1.4}}>{brief.headline}</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {brief.priority_actions?.length>0&&<div style={C.card}>
                    <div style={C.sec}>🎯 Priority Actions</div>
                    {brief.priority_actions.map((a:any,i:number)=>(
                      <div key={i} style={C.row}>
                        <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:20,flexShrink:0,marginTop:1,
                          background:(a.impact==="high"?"#ef4444":a.impact==="medium"?"#f59e0b":"#10b981")+"18",
                          color:a.impact==="high"?"#ef4444":a.impact==="medium"?"#f59e0b":"#10b981"}}>
                          {(a.impact||"med").toUpperCase()}
                        </span>
                        <div><div style={{fontSize:12,fontWeight:600,marginBottom:1}}>{a.action}</div>
                          <div style={{fontSize:11,color:"#8b8ba8"}}>{a.why}</div></div>
                      </div>
                    ))}
                  </div>}
                  {brief.wins?.length>0&&<div style={C.card}><div style={C.sec}>✅ Wins</div>
                    {brief.wins.map((w:string,i:number)=><div key={i} style={{...C.row,color:"#34d399"}}><span>✓</span>{w}</div>)}
                  </div>}
                  {brief.risks?.length>0&&<div style={C.card}><div style={C.sec}>⚠️ Risks</div>
                    {brief.risks.map((r:string,i:number)=><div key={i} style={{...C.row,color:"#f87171"}}><span>⚠</span>{r}</div>)}
                  </div>}
                  {brief.opportunities?.length>0&&<div style={C.card}><div style={C.sec}>💡 Opportunities</div>
                    {brief.opportunities.map((o:string,i:number)=><div key={i} style={{...C.row,color:"#818cf8"}}><span>→</span>{o}</div>)}
                  </div>}
                  {brief.algorithm_watch?.length>0&&<div style={C.card}><div style={C.sec}>🔍 Algorithm Watch</div>
                    {brief.algorithm_watch.map((a:string,i:number)=><div key={i} style={{...C.row,color:"#f59e0b"}}><span>◉</span>{a}</div>)}
                  </div>}
                </div>
              </div>
            ):(
              <div style={{...C.card,textAlign:"center",padding:40}}>
                <div style={{color:"#4b4b6a",marginBottom:14}}>No brief generated today.</div>
                <button style={{...C.btn,padding:"10px 20px",fontSize:13}}
                  onClick={()=>post("generate_morning_brief",{scope:"empire"}).then(loadAll)}>
                  Generate Today's Brief
                </button>
              </div>
            )}
          </div>
        )}

        {/* DB TABLES */}
        {tab==="tables"&&(
          <div>
            <div style={{fontSize:12,color:"#8b8ba8",marginBottom:12}}>
              Live row counts · refreshes every 15s
              · Total: <strong style={{color:"#f0f0ff"}}>
                {Object.values(tables).filter(v=>v>=0).reduce((a,b)=>a+b,0).toLocaleString()}
              </strong> rows across {Object.keys(tables).length} tables
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:7}}>
              {Object.entries(tables).sort(([,a],[,b])=>b-a).map(([name,count])=>(
                <div key={name} style={{...C.card,padding:"10px 12px",
                  borderColor:count<0?"rgba(239,68,68,.25)":count===0?"#1a1a3a":"rgba(16,185,129,.12)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:11,color:"#c0c0d8",fontFamily:"monospace"}}>{name}</div>
                    <div style={{fontSize:14,fontWeight:700,fontFamily:"monospace",
                      color:count<0?"#ef4444":count===0?"#3b3b5a":"#10b981"}}>
                      {count<0?"ERR":count.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{...C.card,marginTop:12}}>
              <div style={C.sec}>Projects ({projects.length})</div>
              {projects.map((p:any)=>(
                <div key={p.id} style={C.row}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600}}>{p.name}</div>
                    <div style={{fontSize:11,color:"#4b4b6a"}}>{p.url}</div>
                  </div>
                  <div style={{fontSize:10,color:"#3b3b5a",flexShrink:0}}>{ago(p.created_at)} ago</div>
                </div>
              ))}
              {!projects.length&&<div style={{color:"#4b4b6a",fontSize:12}}>No projects yet.</div>}
            </div>
          </div>
        )}

        {/* PAGES */}
        {tab==="pages"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:7,marginBottom:12}}>
              {pages.map(([href,label])=>(
                <a key={href} href={href} style={{...C.card,textDecoration:"none",
                  display:"flex",alignItems:"center",justifyContent:"space-between",
                  borderColor:"rgba(99,102,241,.12)"}}>
                  <div style={{fontSize:13,color:"#f0f0ff",fontWeight:500}}>{label}</div>
                  <div style={{fontSize:10,color:"#4b4b6a",fontFamily:"monospace"}}>{href}</div>
                </a>
              ))}
            </div>
            <div style={C.card}>
              <div style={C.sec}>Quick Actions</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                {[
                  ["🌅 Generate Brief",()=>post("generate_morning_brief",{scope:"empire"}).then(loadAll)],
                  ["❤️ Recalc Health",()=>post("calculate_all_health").then(loadAll)],
                  ["✓ Dismiss Alerts",()=>post("dismiss_all_alerts").then(loadAll)],
                ].map(([l,fn])=>(
                  <button key={l as string} onClick={fn as any} style={C.btn}>{l as string}</button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
    {showSearch && <GlobalSearch onClose={()=>setShowSearch(false)} />}
  </>
  );
}
