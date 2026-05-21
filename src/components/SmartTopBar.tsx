
import React,{useState,useEffect,useCallback} from "react";
import {useNav} from "@/contexts/NavContext";
import {useLocation} from "react-router-dom";

// Pages that use the original PortalNav — SmartTopBar hides on these
const PORTAL_NAV_PAGES = new Set([
  "/", "/oval", "/dashboard", "/playground", "/audit", "/launchpad",
  "/mission-control", "/brain-command", "/brain-learning", "/algorithm-intel",
  "/desk", "/system-control", "/data-room",
]);
import GlobalSearch from "@/components/GlobalSearch";

const BREADCRUMBS:Record<string,{label:string;parent?:string}> = {
  "/build":           {label:"Build Dashboard"},
  "/empire":          {label:"Empire Command"},
  "/ask":             {label:"Ask the Empire"},
  "/morning-brief":   {label:"Morning Brief"},
  "/alerts":          {label:"Alert Center"},
  "/client-comms":    {label:"Client Comms",parent:"/empire"},
  "/bde-panel":       {label:"BDE Panel",parent:"/staff-command"},
  "/staff-command":   {label:"Staff Command",parent:"/empire"},
  "/kanban":          {label:"Kanban Board",parent:"/empire"},
  "/revenue":         {label:"Revenue & BI",parent:"/empire"},
  "/health":          {label:"Client Health",parent:"/empire"},
  "/reports":         {label:"Reports"},
  "/content-hub":     {label:"Content Hub"},
  "/content-writer":  {label:"Content Writer",parent:"/content-hub"},
  "/brain-command":   {label:"Brain Command",parent:"/empire"},
  "/brain-learning":  {label:"Brain Learning",parent:"/brain-command"},
  "/llm-visibility":  {label:"LLM Visibility",parent:"/empire"},
  "/intake":          {label:"Lead Intake"},
  "/client-dashboard":{label:"Client Dashboard"},
  "/profile":         {label:"My Profile"},
  "/themes":          {label:"Themes"},
  "/tour":            {label:"Guided Tour"},
  "/algorithm-intel": {label:"Algorithm Intel",parent:"/brain-command"},
  "/playground":      {label:"Playground"},
  "/launchpad":       {label:"Launchpad"},
};

function AnimNum({v,prefix="",suffix=""}:{v:number,prefix?:string,suffix?:string}){
  const[d,setD]=useState(0);
  useEffect(()=>{
    const s=performance.now(),dur=600;
    const t=(now:number)=>{
      const p=Math.min((now-s)/dur,1);
      setD(Math.round(v*(1-Math.pow(1-p,3))));
      if(p<1)requestAnimationFrame(t);
    };
    requestAnimationFrame(t);
  },[v]);
  return<>{prefix}{d.toLocaleString()}{suffix}</>;
}

export default function SmartTopBar(){
  // Hooks MUST run before any early return (React Rules of Hooks).
  // Also: `const location = useLocation()` shadows window.location across
  // the whole function scope. Referencing it before this line = TDZ crash
  // in production builds. Order matters.
  const location=useLocation();
  const{setSidebarOpen,sidebarOpen,sidebarPinned,
        role,setRole,empireStats,suggestion,navigate}=useNav();
  const[time,setTime]=useState(new Date());
  const[showSearch,setShowSearch]=useState(false);
  const[jarvisMsg,setJarvisMsg]=useState("");
  const[showMsg,setShowMsg]=useState(false);

  // Hide on original PortalNav pages to avoid double navigation
  if (PORTAL_NAV_PAGES.has(location.pathname)) return null;

  useEffect(()=>{const id=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(id);},[]);

  // JARVIS ambient message - surfaces periodically
  useEffect(()=>{
    const t=setTimeout(()=>{
      setJarvisMsg(suggestion);
      setShowMsg(true);
      setTimeout(()=>setShowMsg(false),5000);
    },3000);
    return()=>clearTimeout(t);
  },[location.pathname]);

  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setShowSearch(true);}
      if((e.metaKey||e.ctrlKey)&&e.key==="\\"){e.preventDefault();setSidebarOpen(!sidebarOpen);}
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[sidebarOpen]);

  const bc=BREADCRUMBS[location.pathname];
  const parent=bc?.parent?BREADCRUMBS[bc.parent]:null;

  const stats=[
    {v:empireStats.projects||0,l:"PRJ",c:"#6366f1"},
    {v:empireStats.learnings||0,l:"LRN",c:"#a78bfa"},
    {v:empireStats.prospects||0,l:"LEADS",c:"#f59e0b"},
    {v:empireStats.alertsUnread||0,l:"ALRT",c:empireStats.alertsUnread>0?"#ef4444":"#4b4b6a"},
  ];

  return(
    <>
      <div style={{
        position:"fixed" as const,top:0,left:0,right:0,zIndex:950,height:40,
        background:"rgba(4,4,14,.95)",backdropFilter:"blur(24px) saturate(180%)",
        borderBottom:"0.5px solid rgba(99,102,241,.15)",
        display:"flex",alignItems:"center",padding:"0 16px",gap:12,
        boxShadow:"0 1px 0 rgba(255,255,255,.04)",
      }}>
        {/* Menu toggle */}
        <button onClick={()=>setSidebarOpen(!sidebarOpen)}
          style={{width:28,height:28,borderRadius:8,background:sidebarOpen||sidebarPinned?"rgba(99,102,241,.2)":"rgba(255,255,255,.05)",
            border:`0.5px solid ${sidebarOpen||sidebarPinned?"rgba(99,102,241,.4)":"rgba(255,255,255,.1)"}`,
            color:sidebarOpen||sidebarPinned?"#818cf8":"rgba(255,255,255,.4)",cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",
            transition:"all .2s",flexShrink:0}}
          title="Toggle sidebar (⌘\\)">
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
            <rect x="0" y="0" width="14" height="1.5" rx=".75" fill="currentColor"/>
            <rect x="0" y="4.25" width="9" height="1.5" rx=".75" fill="currentColor"/>
            <rect x="0" y="8.5" width="14" height="1.5" rx=".75" fill="currentColor"/>
          </svg>
        </button>

        {/* Logo */}
        <div style={{fontSize:11,fontWeight:800,letterSpacing:"2px",flexShrink:0,
          background:"linear-gradient(90deg,#6366f1,#8b5cf6)",
          WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>
          SEO SEASON
        </div>

        <div style={{width:.5,height:20,background:"rgba(255,255,255,.08)",flexShrink:0}}/>

        {/* Breadcrumb */}
        <div style={{display:"flex",alignItems:"center",gap:5,flex:1,minWidth:0}}>
          {parent&&(
            <>
              <button onClick={()=>navigate(bc!.parent!)}
                style={{fontSize:11,color:"rgba(255,255,255,.3)",background:"none",border:"none",
                  cursor:"pointer",padding:0,transition:"color .15s"}}
                onMouseEnter={e=>(e.currentTarget.style.color="rgba(255,255,255,.6)")}
                onMouseLeave={e=>(e.currentTarget.style.color="rgba(255,255,255,.3)")}>
                {parent.label}
              </button>
              <span style={{color:"rgba(255,255,255,.15)",fontSize:12}}>›</span>
            </>
          )}
          <span style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.8)",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>
            {bc?.label||location.pathname}
          </span>
        </div>

        {/* JARVIS ambient message */}
        <div style={{
          flex:2,minWidth:0,overflow:"hidden",
          display:"flex",alignItems:"center",gap:6,
          opacity:showMsg?.8:0,transition:"opacity .5s ease",
        }}>
          <span style={{fontSize:10,color:"rgba(99,102,241,.6)",flexShrink:0}}>✦</span>
          <span style={{fontSize:11,color:"rgba(255,255,255,.35)",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const,
            fontStyle:"italic"}}>
            {jarvisMsg}
          </span>
        </div>

        {/* Stats */}
        <div style={{display:"flex",gap:14,alignItems:"center",flexShrink:0}}>
          {stats.map(s=>(
            <div key={s.l} style={{display:"flex",gap:4,alignItems:"baseline"}}>
              <span style={{fontFamily:"monospace",fontSize:11,fontWeight:700,color:s.c}}>
                <AnimNum v={s.v}/>
              </span>
              <span style={{fontSize:8,color:"rgba(255,255,255,.2)",letterSpacing:"1px"}}>{s.l}</span>
            </div>
          ))}
        </div>

        <div style={{width:.5,height:20,background:"rgba(255,255,255,.08)",flexShrink:0}}/>

        {/* Search */}
        <button onClick={()=>setShowSearch(true)}
          style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:8,
            background:"rgba(255,255,255,.05)",border:"0.5px solid rgba(255,255,255,.1)",
            color:"rgba(255,255,255,.4)",cursor:"pointer",fontSize:11,transition:"all .15s",
            flexShrink:0}}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor="rgba(99,102,241,.4)";
            (e.currentTarget as HTMLElement).style.color="rgba(255,255,255,.7)";}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="rgba(255,255,255,.1)";
            (e.currentTarget as HTMLElement).style.color="rgba(255,255,255,.4)";}}>
          <span style={{fontSize:12}}>🔍</span>
          <span>Search</span>
          <span style={{fontSize:9,opacity:.5,marginLeft:2,fontFamily:"monospace"}}>⌘K</span>
        </button>

        {/* Role selector */}
        <select value={role} onChange={e=>setRole(e.target.value)}
          style={{background:"rgba(255,255,255,.05)",border:"0.5px solid rgba(255,255,255,.1)",
            borderRadius:8,color:"rgba(255,255,255,.6)",padding:"4px 8px",fontSize:11,
            cursor:"pointer",flexShrink:0}}>
          <option value="hod">👑 HOD</option>
          <option value="sales_manager">📊 Sales Mgr</option>
          <option value="bdm">🎯 BDM</option>
          <option value="bde">💼 BDE</option>
          <option value="pm">🗂 PM</option>
          <option value="client">🏢 Client</option>
        </select>

        {/* Live indicator */}
        <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:"#10b981",
            boxShadow:"0 0 6px #10b981",animation:"breathe 2s ease-in-out infinite"}}/>
          <span style={{fontSize:9,color:"#10b981",fontWeight:600,letterSpacing:"1px"}}>LIVE</span>
        </div>

        {/* Clock */}
        <div style={{fontFamily:"monospace",fontSize:10,color:"rgba(255,255,255,.3)",flexShrink:0}}>
          {time.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
        </div>
      </div>

      {showSearch&&<GlobalSearch onClose={()=>setShowSearch(false)}/>}
    </>
  );
}
