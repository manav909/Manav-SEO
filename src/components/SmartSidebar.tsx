
import React,{useState,useEffect} from "react";
import {useNav} from "@/contexts/NavContext";
const PORTAL_NAV_PAGES = new Set(["/","/oval","/dashboard","/playground","/audit","/launchpad","/mission-control","/brain-command","/brain-learning","/algorithm-intel","/desk","/system-control","/data-room"]);

const ALL_SECTIONS = [
  {
    id:"command", label:"Command", icon:"⚡",
    items:[
      {icon:"📡",label:"Build Dashboard",     href:"/build"},
      {icon:"👑",label:"Empire Command",       href:"/empire"},
      {icon:"🤖",label:"Ask the Empire",       href:"/ask"},
      {icon:"🌅",label:"Morning Brief",         href:"/morning-brief"},
      {icon:"🚨",label:"Alert Center",          href:"/alerts"},
      {icon:"🎯",label:"Mission Control",       href:"/mission-control"},
    ]
  },
  {
    id:"clients", label:"Clients & Leads", icon:"👥",
    items:[
      {icon:"💬",label:"Client Comms",          href:"/client-comms"},
      {icon:"🎯",label:"Lead Intake",            href:"/intake"},
      {icon:"🏢",label:"Client Dashboard",       href:"/client-dashboard"},
      {icon:"👥",label:"Client Portal",          href:"/client-portal"},
      {icon:"📊",label:"Reports",                href:"/reports"},
      {icon:"🌍",label:"LLM Visibility",         href:"/llm-visibility"},
      {icon:"🌐",label:"Revenue Proof",          href:"/revenue-proof"},
    ]
  },
  {
    id:"delivery", label:"Delivery", icon:"🚀",
    items:[
      {icon:"📋",label:"Kanban Board",           href:"/kanban"},
      {icon:"🔍",label:"Playground",             href:"/playground"},
      {icon:"🔬",label:"Audit",                  href:"/audit"},
      {icon:"📝",label:"Content Hub",            href:"/content-hub"},
      {icon:"✍️",label:"Content Writer",          href:"/content-writer"},
      {icon:"🚀",label:"Launchpad",              href:"/launchpad"},
      {icon:"📋",label:"Brain Learning",         href:"/brain-learning"},
    ]
  },
  {
    id:"intelligence", label:"Intelligence", icon:"🧠",
    items:[
      {icon:"🧠",label:"Brain Command",          href:"/brain-command"},
      {icon:"❤️",label:"Client Health",          href:"/health"},
      {icon:"🔭",label:"Algorithm Intel",        href:"/algorithm-intel"},
      {icon:"💰",label:"Revenue BI",             href:"/revenue"},
      {icon:"🗂",label:"Data Room",              href:"/data-room"},
      {icon:"📊",label:"Dashboard",              href:"/dashboard"},
    ]
  },
  {
    id:"team", label:"Team", icon:"👤",
    items:[
      {icon:"🏛",label:"Staff Command",          href:"/staff-command"},
      {icon:"💼",label:"BDE Panel",              href:"/bde-panel"},
      {icon:"👤",label:"My Profile",             href:"/profile"},
      {icon:"🚀",label:"Scale Control",          href:"/scale-control"},
      {icon:"🏠",label:"The Oval",               href:"/oval"},
      {icon:"🖥",label:"Desk",                   href:"/desk"},
    ]
  },
  {
    id:"settings", label:"Settings & System", icon:"⚙️",
    items:[
      {icon:"🎨",label:"Themes",                 href:"/themes"},
      {icon:"🗺",label:"Guided Tour",            href:"/tour"},
      {icon:"⚙️",label:"System Control",         href:"/system-control"},
      {icon:"🛡",label:"Admin",                  href:"/admin"},
    ]
  },
];

function NavBtn({item,current,navigate,compact=false}:{item:any,current:string,navigate:(p:string)=>void,compact?:boolean}){
  const active = current === item.href;
  return(
    <button onClick={()=>navigate(item.href)}
      style={{width:"100%",textAlign:"left" as const,display:"flex",alignItems:"center",
        gap:8,padding:compact?"5px 8px":"7px 8px",borderRadius:8,cursor:"pointer",
        border:"none",background:active?"rgba(var(--accent-rgb,99,102,241),.15)":"transparent",
        transition:"all .15s",marginBottom:1,position:"relative" as const}}
      onMouseEnter={e=>{if(!active)(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,.05)";}}
      onMouseLeave={e=>{if(!active)(e.currentTarget as HTMLElement).style.background="transparent";}}>
      {active&&<div style={{position:"absolute" as const,left:0,top:"20%",bottom:"20%",
        width:2.5,background:"var(--accent,#6366f1)",borderRadius:"0 2px 2px 0",
        boxShadow:"0 0 6px var(--accent,#6366f1)"}}/>}
      <span style={{fontSize:compact?12:14,flexShrink:0}}>{item.icon}</span>
      <span style={{fontSize:compact?11:12,fontWeight:active?600:400,
        color:active?"var(--accent-soft,#818cf8)":"rgba(255,255,255,.55)",
        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>
        {item.label}
      </span>
    </button>
  );
}

export default function SmartSidebar(){
  const{sidebarOpen,sidebarPinned,setSidebarOpen,setSidebarPinned,
        navigate,currentPath,role,frequentPaths,recentPaths,
        suggestion,suggestedActions}=useNav();

  const[expanded,setExpanded]=useState<string[]>(["command","clients"]);
  const[search,setSearch]=useState("");

  // Auto-expand section with current page
  useEffect(()=>{
    for(const sec of ALL_SECTIONS){
      if(sec.items.some(i=>i.href===currentPath)){
        setExpanded(prev=>prev.includes(sec.id)?prev:[...prev,sec.id]);
        break;
      }
    }
  },[currentPath]);

  // Don't show on pages with PortalNav
  const{currentPath}=useNav();
  if (PORTAL_NAV_PAGES.has(currentPath)) return null;
  const show = sidebarOpen || sidebarPinned;
  if(!show) return null;

  const allItems = ALL_SECTIONS.flatMap(s=>s.items);
  const filtered = search.length>1
    ? allItems.filter(i=>i.label.toLowerCase().includes(search.toLowerCase()))
    : null;

  const topFrequent = Object.entries(frequentPaths||{})
    .sort(([,a],[,b])=>(b as number)-(a as number)).slice(0,4).map(([p])=>p);

  return(
    <>
      {!sidebarPinned&&(
        <div style={{position:"fixed" as const,inset:0,zIndex:700,background:"rgba(0,0,8,.5)",
          backdropFilter:"blur(2px)"}} onClick={()=>setSidebarOpen(false)}/>
      )}
      <div style={{position:"fixed" as const,top:40,left:0,bottom:0,zIndex:701,width:260,
        background:"rgba(4,4,14,.98)",backdropFilter:"blur(40px) saturate(200%)",
        borderRight:"0.5px solid rgba(99,102,241,.2)",display:"flex",
        flexDirection:"column" as const,
        boxShadow:"4px 0 40px rgba(0,0,8,.7)",overflowY:"auto" as const,
        paddingBottom:80,animation:"panel-spring .38s cubic-bezier(.2,0,.2,1) both"}}>

        {/* Top bar */}
        <div style={{padding:"12px 14px 8px",borderBottom:"0.5px solid rgba(255,255,255,.06)",
          position:"sticky" as const,top:0,zIndex:10,
          background:"rgba(4,4,14,.98)",backdropFilter:"blur(20px)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"2px",
              background:"linear-gradient(90deg,#6366f1,#8b5cf6)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
              backgroundClip:"text"}}>EMPIRE NAV</div>
            <div style={{display:"flex",gap:5}}>
              <button onClick={()=>setSidebarPinned(!sidebarPinned)} title={sidebarPinned?"Unpin":"Pin"}
                style={{width:22,height:22,borderRadius:6,cursor:"pointer",fontSize:10,
                  background:sidebarPinned?"rgba(99,102,241,.2)":"rgba(255,255,255,.05)",
                  border:`.5px solid ${sidebarPinned?"rgba(99,102,241,.4)":"rgba(255,255,255,.1)"}`,
                  color:sidebarPinned?"#818cf8":"rgba(255,255,255,.3)",
                  display:"flex",alignItems:"center",justifyContent:"center" as const}}>
                {sidebarPinned?"📌":"📍"}
              </button>
              {!sidebarPinned&&<button onClick={()=>setSidebarOpen(false)}
                style={{width:22,height:22,borderRadius:6,background:"rgba(255,255,255,.05)",
                  border:"0.5px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.3)",
                  cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",
                  justifyContent:"center" as const}}>✕</button>}
            </div>
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search all pages..."
            style={{width:"100%",background:"rgba(255,255,255,.05)",border:"0.5px solid rgba(255,255,255,.1)",
              borderRadius:8,color:"#f0f0ff",padding:"6px 10px",fontSize:12,outline:"none",
              boxSizing:"border-box" as const,fontFamily:"inherit"}}/>
        </div>

        {/* Search results */}
        {filtered&&(
          <div style={{padding:"8px 10px"}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,.25)",padding:"4px 4px 8px",
              letterSpacing:"1px",textTransform:"uppercase" as const}}>
              {filtered.length} results for "{search}"
            </div>
            {filtered.length ? filtered.map(item=>(
              <NavBtn key={item.href} item={item} current={currentPath} navigate={navigate}/>
            )) : <div style={{fontSize:12,color:"rgba(255,255,255,.25)",padding:"8px 4px"}}>No pages match</div>}
          </div>
        )}

        {!filtered&&<>
          {/* JARVIS suggestion */}
          <div style={{margin:"10px 12px 6px",padding:"10px 12px",
            background:"rgba(99,102,241,.08)",borderRadius:10,
            border:"0.5px solid rgba(99,102,241,.2)"}}>
            <div style={{display:"flex",gap:6,alignItems:"flex-start"}}>
              <span style={{fontSize:12,flexShrink:0,marginTop:1,color:"rgba(99,102,241,.8)"}}>✦</span>
              <div style={{fontSize:11,color:"rgba(255,255,255,.5)",lineHeight:1.55}}>{suggestion}</div>
            </div>
          </div>

          {/* Suggested now */}
          {suggestedActions?.length>0&&(
            <div style={{padding:"0 10px 6px"}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,.2)",letterSpacing:"1.2px",
                textTransform:"uppercase" as const,padding:"0 4px 5px",marginTop:4}}>RECOMMENDED NOW</div>
              {suggestedActions.map((a:any)=>(
                <button key={a.href} onClick={()=>navigate(a.href)}
                  style={{width:"100%",textAlign:"left" as const,padding:"8px 10px",borderRadius:9,
                    marginBottom:4,cursor:"pointer",
                    background:a.urgency==="now"?"rgba(99,102,241,.1)":"rgba(255,255,255,.03)",
                    border:`0.5px solid ${a.urgency==="now"?"rgba(99,102,241,.25)":"rgba(255,255,255,.06)"}`,
                    display:"flex",gap:8,alignItems:"flex-start"}}>
                  <span style={{fontSize:14,flexShrink:0}}>{a.icon}</span>
                  <div>
                    <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:1}}>
                      <span style={{fontSize:12,fontWeight:600,color:"#f0f0ff"}}>{a.label}</span>
                      {a.urgency==="now"&&(
                        <span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:20,
                          background:"rgba(99,102,241,.2)",color:"#818cf8",letterSpacing:".5px"}}>NOW</span>
                      )}
                    </div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.3)",lineHeight:1.4}}>{a.why}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Most used */}
          {topFrequent.length>0&&(
            <div style={{padding:"0 10px 6px",borderTop:"0.5px solid rgba(255,255,255,.05)",paddingTop:10}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,.2)",letterSpacing:"1.2px",
                textTransform:"uppercase" as const,padding:"0 4px 5px"}}>MOST USED</div>
              {topFrequent.map(path=>{
                const item = ALL_SECTIONS.flatMap(s=>s.items).find(i=>i.href===path);
                if(!item) return null;
                return <NavBtn key={path} item={item} current={currentPath} navigate={navigate} compact/>;
              })}
            </div>
          )}

          {/* Recent */}
          {recentPaths?.filter((p:string)=>p!==currentPath).slice(0,4).length>0&&(
            <div style={{padding:"0 10px 6px",borderTop:"0.5px solid rgba(255,255,255,.05)",paddingTop:10}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,.2)",letterSpacing:"1.2px",
                textTransform:"uppercase" as const,padding:"0 4px 5px"}}>RECENT</div>
              {recentPaths.filter((p:string)=>p!==currentPath).slice(0,4).map((path:string)=>{
                const item = ALL_SECTIONS.flatMap(s=>s.items).find(i=>i.href===path);
                if(!item) return null;
                return <NavBtn key={path} item={item} current={currentPath} navigate={navigate} compact/>;
              })}
            </div>
          )}

          {/* All sections */}
          <div style={{padding:"0 10px",borderTop:"0.5px solid rgba(255,255,255,.05)",paddingTop:10}}>
            {ALL_SECTIONS.map(sec=>(
              <div key={sec.id} style={{marginBottom:2}}>
                <button onClick={()=>setExpanded(prev=>prev.includes(sec.id)?prev.filter(s=>s!==sec.id):[...prev,sec.id])}
                  style={{width:"100%",display:"flex",justifyContent:"space-between" as const,
                    alignItems:"center",padding:"7px 8px",borderRadius:8,cursor:"pointer",
                    background:"transparent",border:"none",color:"rgba(255,255,255,.35)",
                    fontSize:11,fontWeight:600,letterSpacing:".8px",textTransform:"uppercase" as const}}>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontSize:12}}>{sec.icon}</span>{sec.label}
                    <span style={{fontSize:9,color:"rgba(255,255,255,.2)",fontWeight:400}}>
                      {sec.items.length}
                    </span>
                  </div>
                  <span style={{fontSize:10,transition:"transform .2s",
                    transform:expanded.includes(sec.id)?"rotate(90deg)":"none"}}>›</span>
                </button>
                {expanded.includes(sec.id)&&(
                  <div style={{paddingLeft:4}}>
                    {sec.items.map(item=>(
                      <NavBtn key={item.href} item={item} current={currentPath} navigate={navigate}/>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>}
      </div>
    </>
  );
}
