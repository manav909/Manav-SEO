
import React,{useState,useEffect} from "react";
import {useNav} from "@/contexts/NavContext";
import {useLocation} from "react-router-dom";

const SECTIONS:{
  id:string; label:string; icon:string;
  items:{icon:string;label:string;href:string;badge?:string;roles?:string[]}[];
  roles?:string[];
}[]=[
  {
    id:"command",label:"Command",icon:"⚡",
    items:[
      {icon:"📡",label:"Build Dashboard",href:"/build"},
      {icon:"👑",label:"Empire Command",href:"/empire"},
      {icon:"🤖",label:"Ask the Empire",href:"/ask"},
      {icon:"🌅",label:"Morning Brief",href:"/morning-brief"},
      {icon:"🚨",label:"Alert Center",href:"/alerts"},
    ]
  },
  {
    id:"clients",label:"Clients & Leads",icon:"👥",
    items:[
      {icon:"💬",label:"Client Comms",href:"/client-comms"},
      {icon:"🎯",label:"Lead Intake",href:"/intake"},
      {icon:"🏢",label:"Client Dashboard",href:"/client-dashboard"},
      {icon:"📊",label:"Reports",href:"/reports"},
      {icon:"🌍",label:"LLM Visibility",href:"/llm-visibility"},
    ]
  },
  {
    id:"delivery",label:"Delivery",icon:"🚀",
    items:[
      {icon:"📋",label:"Kanban Board",href:"/kanban"},
      {icon:"🔍",label:"Playground",href:"/playground"},
      {icon:"📝",label:"Content Hub",href:"/content-hub"},
      {icon:"✍️",label:"Content Writer",href:"/content-writer"},
      {icon:"🔬",label:"Brain Learning",href:"/brain-learning"},
    ]
  },
  {
    id:"intelligence",label:"Intelligence",icon:"🧠",
    items:[
      {icon:"🧠",label:"Brain Command",href:"/brain-command"},
      {icon:"❤️",label:"Client Health",href:"/health"},
      {icon:"🔭",label:"Algorithm Intel",href:"/algorithm-intel"},
      {icon:"📈",label:"Revenue BI",href:"/revenue"},
      {icon:"🗂",label:"Data Room",href:"/data-room"},
    ]
  },
  {
    id:"team",label:"Team",icon:"👤",
    roles:["hod","sales_manager","bdm"],
    items:[
      {icon:"🏛",label:"Staff Command",href:"/staff-command",roles:["hod","sales_manager"]},
      {icon:"💼",label:"BDE Panel",href:"/bde-panel"},
      {icon:"👤",label:"My Profile",href:"/profile"},
      {icon:"🚀",label:"Launchpad",href:"/launchpad"},
    ]
  },
  {
    id:"settings",label:"Settings",icon:"⚙️",
    items:[
      {icon:"🎨",label:"Themes",href:"/themes"},
      {icon:"🗺",label:"Take a Tour",href:"/tour"},
      {icon:"⚙️",label:"System Control",href:"/system-control"},
      {icon:"🛡",label:"Admin",href:"/admin"},
    ]
  },
];

export default function SmartSidebar(){
  const{sidebarOpen,sidebarPinned,setSidebarOpen,setSidebarPinned,
        navigate,currentPath,role,frequentPaths,recentPaths,
        suggestion,suggestedActions,empireStats}=useNav();
  const[expandedSections,setExpanded]=useState<string[]>(["command","clients"]);
  const[search,setSearch]=useState("");

  // Auto-expand section containing current page
  useEffect(()=>{
    for(const sec of SECTIONS){
      if(sec.items.some(i=>i.href===currentPath)){
        setExpanded(prev=>prev.includes(sec.id)?prev:[...prev,sec.id]);
        break;
      }
    }
  },[currentPath]);

  const toggleSection=(id:string)=>{
    setExpanded(prev=>prev.includes(id)?prev.filter(s=>s!==id):[...prev,id]);
  };

  // Top frequent pages (learned)
  const topFrequent=Object.entries(frequentPaths)
    .sort(([,a],[,b])=>b-a).slice(0,4).map(([p])=>p);

  const allItems=SECTIONS.flatMap(s=>s.items);
  const filtered=search.length>1
    ?allItems.filter(i=>i.label.toLowerCase().includes(search.toLowerCase()))
    :null;

  const show=sidebarOpen||sidebarPinned;
  if(!show)return null;

  return(
    <>
      {!sidebarPinned&&(
        <div style={{position:"fixed",inset:0,zIndex:700,background:"rgba(0,0,8,.4)",
          backdropFilter:"blur(2px)"}} onClick={()=>setSidebarOpen(false)}/>
      )}
      <div style={{
        position:"fixed",top:40,left:0,bottom:0,zIndex:701,
        width:260,
        background:"rgba(4,4,14,.97)",
        backdropFilter:"blur(40px) saturate(200%)",
        borderRight:"0.5px solid rgba(99,102,241,.2)",
        display:"flex",flexDirection:"column" as const,
        boxShadow:"4px 0 40px rgba(0,0,8,.7), 2px 0 0 rgba(99,102,241,.1)",
        animation:"panel-spring .38s cubic-bezier(.2,0,.2,1) both",
        overflowY:"auto" as const,
        paddingBottom:80,
      }}>
        {/* Top bar */}
        <div style={{padding:"12px 14px 8px",borderBottom:"0.5px solid rgba(255,255,255,.06)",
          position:"sticky" as const,top:0,zIndex:10,
          background:"rgba(4,4,14,.97)",backdropFilter:"blur(20px)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:"2px",
              background:"linear-gradient(90deg,#6366f1,#8b5cf6)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
              backgroundClip:"text"}}>EMPIRE NAV</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setSidebarPinned(!sidebarPinned)}
                title={sidebarPinned?"Unpin sidebar":"Pin sidebar"}
                style={{width:22,height:22,borderRadius:6,background:sidebarPinned?"rgba(99,102,241,.25)":"rgba(255,255,255,.05)",
                  border:`0.5px solid ${sidebarPinned?"rgba(99,102,241,.5)":"rgba(255,255,255,.1)"}`,
                  color:sidebarPinned?"#818cf8":"rgba(255,255,255,.3)",cursor:"pointer",fontSize:10,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                {sidebarPinned?"📌":"📍"}
              </button>
              {!sidebarPinned&&(
                <button onClick={()=>setSidebarOpen(false)}
                  style={{width:22,height:22,borderRadius:6,background:"rgba(255,255,255,.05)",
                    border:"0.5px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.3)",
                    cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  ✕
                </button>
              )}
            </div>
          </div>
          {/* Search */}
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search pages..."
            style={{width:"100%",background:"rgba(255,255,255,.05)",
              border:"0.5px solid rgba(255,255,255,.1)",borderRadius:8,
              color:"#f0f0ff",padding:"6px 10px",fontSize:12,outline:"none",
              boxSizing:"border-box" as const,fontFamily:"inherit"}}/>
        </div>

        {/* Search results */}
        {filtered&&(
          <div style={{padding:"8px 10px"}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,.3)",
              padding:"4px 4px 8px",letterSpacing:"1px",textTransform:"uppercase" as const}}>
              Results for "{search}"
            </div>
            {filtered.length?filtered.map(item=>(
              <NavItem key={item.href} item={item} current={currentPath} navigate={navigate}/>
            )):(
              <div style={{fontSize:12,color:"rgba(255,255,255,.3)",padding:"8px 4px"}}>
                No pages match
              </div>
            )}
          </div>
        )}

        {!filtered&&<>
          {/* JARVIS suggestion */}
          <div style={{margin:"10px 12px",padding:"10px 12px",
            background:"rgba(99,102,241,.07)",borderRadius:10,
            border:"0.5px solid rgba(99,102,241,.2)"}}>
            <div style={{display:"flex",gap:6,alignItems:"flex-start"}}>
              <span style={{fontSize:12,flexShrink:0,marginTop:1}}>✦</span>
              <div style={{fontSize:11,color:"rgba(255,255,255,.55)",lineHeight:1.55}}>{suggestion}</div>
            </div>
          </div>

          {/* Suggested actions */}
          <div style={{padding:"0 10px 8px"}}>
            <div style={{fontSize:9,color:"rgba(255,255,255,.25)",letterSpacing:"1.2px",
              textTransform:"uppercase" as const,padding:"0 4px 6px"}}>Recommended now</div>
            {suggestedActions.map(a=>(
              <button key={a.href} onClick={()=>navigate(a.href)}
                style={{width:"100%",textAlign:"left" as const,
                  padding:"8px 10px",borderRadius:9,marginBottom:4,cursor:"pointer",
                  background:a.urgency==="now"?"rgba(99,102,241,.12)":"rgba(255,255,255,.03)",
                  border:`0.5px solid ${a.urgency==="now"?"rgba(99,102,241,.3)":"rgba(255,255,255,.07)"}`,
                  display:"flex",gap:8,alignItems:"flex-start"}}>
                <span style={{fontSize:14,flexShrink:0}}>{a.icon}</span>
                <div>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2}}>
                    <span style={{fontSize:12,fontWeight:600,color:"#f0f0ff"}}>{a.label}</span>
                    {a.urgency==="now"&&(
                      <span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:20,
                        background:"rgba(99,102,241,.2)",color:"#818cf8",letterSpacing:".5px"}}>NOW</span>
                    )}
                  </div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,.35)",lineHeight:1.4}}>{a.why}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Most used (self-growing) */}
          {topFrequent.length>0&&(
            <div style={{padding:"0 10px 8px",borderTop:"0.5px solid rgba(255,255,255,.05)",paddingTop:12}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,.25)",letterSpacing:"1.2px",
                textTransform:"uppercase" as const,padding:"0 4px 6px"}}>Most used by you</div>
              {topFrequent.map(path=>{
                const item=allItems.find(i=>i.href===path);
                if(!item)return null;
                return(
                  <NavItem key={path} item={item} current={currentPath} navigate={navigate} compact/>
                );
              })}
            </div>
          )}

          {/* Recent */}
          {recentPaths.filter(p=>p!==currentPath).length>0&&(
            <div style={{padding:"0 10px 8px",borderTop:"0.5px solid rgba(255,255,255,.05)",paddingTop:12}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,.25)",letterSpacing:"1.2px",
                textTransform:"uppercase" as const,padding:"0 4px 6px"}}>Recent</div>
              {recentPaths.filter(p=>p!==currentPath).slice(0,4).map(path=>{
                const item=allItems.find(i=>i.href===path);
                if(!item)return null;
                return<NavItem key={path} item={item} current={currentPath} navigate={navigate} compact/>;
              })}
            </div>
          )}

          {/* All sections */}
          <div style={{padding:"0 10px",borderTop:"0.5px solid rgba(255,255,255,.05)",paddingTop:12}}>
            {SECTIONS.filter(s=>!s.roles||s.roles.includes(role)).map(sec=>(
              <div key={sec.id} style={{marginBottom:4}}>
                <button onClick={()=>toggleSection(sec.id)}
                  style={{width:"100%",display:"flex",justifyContent:"space-between",
                    alignItems:"center",padding:"7px 8px",borderRadius:8,cursor:"pointer",
                    background:"transparent",border:"none",color:"rgba(255,255,255,.4)",
                    fontSize:11,fontWeight:600,letterSpacing:".8px",
                    textTransform:"uppercase" as const}}>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span>{sec.icon}</span>{sec.label}
                  </div>
                  <span style={{fontSize:10,transition:"transform .2s",
                    transform:expandedSections.includes(sec.id)?"rotate(90deg)":"none"}}>›</span>
                </button>
                {expandedSections.includes(sec.id)&&(
                  <div style={{paddingLeft:4}}>
                    {sec.items.filter(i=>!i.roles||i.roles.includes(role)).map(item=>(
                      <NavItem key={item.href} item={item} current={currentPath} navigate={navigate}/>
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

function NavItem({item,current,navigate,compact=false}:{
  item:any;current:string;navigate:(p:string)=>void;compact?:boolean;
}){
  const active=current===item.href;
  return(
    <button onClick={()=>navigate(item.href)}
      style={{
        width:"100%",textAlign:"left" as const,
        display:"flex",alignItems:"center",gap:8,
        padding:compact?"5px 8px":"7px 8px",
        borderRadius:8,cursor:"pointer",border:"none",
        background:active?"rgba(99,102,241,.18)":"transparent",
        transition:"all .15s",marginBottom:1,
        position:"relative" as const,
      }}
      onMouseEnter={e=>{if(!active)(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,.05)";}}
      onMouseLeave={e=>{if(!active)(e.currentTarget as HTMLElement).style.background="transparent";}}>
      {active&&<div style={{position:"absolute" as const,left:0,top:"20%",bottom:"20%",
        width:2.5,background:"linear-gradient(180deg,#6366f1,#8b5cf6)",borderRadius:"0 2px 2px 0",
        boxShadow:"0 0 6px rgba(99,102,241,.6)"}}/>}
      <span style={{fontSize:compact?12:14,flexShrink:0}}>{item.icon}</span>
      <span style={{fontSize:compact?11:12,fontWeight:active?600:400,
        color:active?"#e0e0ff":"rgba(255,255,255,.55)",letterSpacing:".2px"}}>
        {item.label}
      </span>
      {item.badge&&(
        <span style={{marginLeft:"auto",fontSize:9,fontWeight:700,
          padding:"1px 6px",borderRadius:20,background:"rgba(239,68,68,.2)",color:"#f87171"}}>
          {item.badge}
        </span>
      )}
    </button>
  );
}
