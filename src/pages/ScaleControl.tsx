import React from "react";
import AnimatedBg from "@/components/AnimatedBg";
import ThemeToggle from "@/components/ThemeToggle";

export default function ScaleControl() {
  const items = [
    {icon:"🏗",title:"Build Dashboard",href:"/build",desc:"Live surveillance — every system in real time"},
    {icon:"👑",title:"Empire Command",href:"/empire",desc:"God view — clients, health, priorities"},
    {icon:"💰",title:"Revenue BI",href:"/revenue",desc:"MRR, ARR, pipeline forecasting"},
    {icon:"📋",title:"Kanban Board",href:"/kanban",desc:"Delivery task management"},
    {icon:"🧠",title:"Brain Command",href:"/brain-command",desc:"Learning velocity and compound intelligence"},
    {icon:"💬",title:"Client Comms",href:"/client-comms",desc:"Conversation analyser, objection handler"},
    {icon:"🏛",title:"Staff Command",href:"/staff-command",desc:"Team performance and pipeline management"},
    {icon:"🤖",title:"Ask the Empire",href:"/ask",desc:"Natural language AI across all data"},
    {icon:"🌅",title:"Morning Brief",href:"/morning-brief",desc:"Daily AI intelligence briefing"},
    {icon:"📊",title:"Reports",href:"/reports",desc:"Automated client-ready reports"},
    {icon:"🎯",title:"Lead Intake",href:"/intake",desc:"Lead capture with instant site audit"},
    {icon:"🎨",title:"Themes",href:"/themes",desc:"12 smart themes — auto-detect by industry"},
  ];
  return (
    <div className="empire-page" style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"-apple-system,'SF Pro Display',system-ui,sans-serif"}}>
      <AnimatedBg/>
      <div style={{position:"relative",zIndex:1,maxWidth:1000,margin:"0 auto",padding:"60px 24px 100px"}}>
        <div style={{textAlign:"center" as const,marginBottom:48,animation:"warp-in .5s ease both"}}>
          <div style={{fontSize:13,color:"var(--text-muted)",letterSpacing:"3px",textTransform:"uppercase" as const,marginBottom:12}}>
            EMPIRE CONTROL
          </div>
          <div className="holo-text" style={{fontSize:36,fontWeight:800,letterSpacing:"-0.03em",marginBottom:12}}>
            Scale Control
          </div>
          <div style={{fontSize:15,color:"var(--text-sub)",maxWidth:480,margin:"0 auto",lineHeight:1.7}}>
            Every module, every capability. Navigate the full empire from here.
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
          {items.map((item,i)=>(
            <a key={item.href} href={item.href} className="glass-card"
              style={{textDecoration:"none",padding:"20px",
                animation:`warp-in .4s ease ${i*0.04}s both`,cursor:"pointer"}}>
              <div style={{fontSize:28,marginBottom:12}}>{item.icon}</div>
              <div style={{fontSize:14,fontWeight:700,color:"var(--text)",marginBottom:5,letterSpacing:"-0.01em"}}>{item.title}</div>
              <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.55}}>{item.desc}</div>
              <div style={{marginTop:14,fontSize:11,color:"var(--accent-soft)",fontWeight:600}}>Open →</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
