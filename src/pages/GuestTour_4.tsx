import React,{useEffect} from "react";
import {useTour} from "@/contexts/TourContext";
import {useNavigate} from "react-router-dom";
import AnimatedBg from "@/components/AnimatedBg";

export default function Tour(){
  const{start,completed}=useTour();
  const navigate=useNavigate();

  const ROLES=[
    {r:"hod",   l:"Head of Department",c:"#dc2626",i:"👑",
     desc:"Full empire view — staff management, revenue, pipeline, morning briefs, everything"},
    {r:"bde",   l:"Business Dev Executive",c:"#10b981",i:"💼",
     desc:"Fiverr tools, lead pipeline, instant audits, quick responses, client comms"},
    {r:"client",l:"Client",c:"#6366f1",i:"🏢",
     desc:"Your campaign dashboard — metrics, wins, reports, AI visibility"},
    {r:"pm",    l:"Project Manager",c:"#06b6d4",i:"🗂",
     desc:"Kanban delivery, brain learnings, task verifications, client reports"},
  ];

  return(
    <div className="empire-page" style={{minHeight:"100vh",background:"var(--bg)",
      color:"var(--text)",fontFamily:"-apple-system,'SF Pro Display',system-ui,sans-serif",
      display:"flex",alignItems:"center",justifyContent:"center"}}>
      <AnimatedBg/>
      <div style={{position:"relative",zIndex:1,textAlign:"center" as const,
        maxWidth:680,padding:"0 24px"}}>
        <div style={{fontSize:52,marginBottom:16,animation:"float-y 4s ease-in-out infinite"}}>🚀</div>
        <div style={{fontSize:28,fontWeight:800,marginBottom:8,
          background:"var(--grad-accent)",WebkitBackgroundClip:"text",
          WebkitTextFillColor:"transparent",backgroundClip:"text",
          letterSpacing:"-0.03em"}}>
          Empire Guided Tour
        </div>
        <div style={{fontSize:15,color:"var(--text-sub)",lineHeight:1.7,marginBottom:36}}>
          Choose your role for a personalised walkthrough of every feature.
          The AI concierge will guide you through the entire empire.
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:28}}>
          {ROLES.map(({r,l,c,i,desc})=>(
            <div key={r} onClick={()=>{start(r);navigate("/build");}}
              className="glass-card" style={{padding:"20px",cursor:"pointer",
                border:`0.5px solid ${c}30`,textAlign:"left" as const}}>
              <div style={{fontSize:24,marginBottom:8}}>{i}</div>
              <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:4}}>{l}</div>
              <div style={{fontSize:12,color:"var(--text-muted)",lineHeight:1.5}}>{desc}</div>
              <div style={{marginTop:12,fontSize:11,color:c,fontWeight:600}}>Start tour →</div>
            </div>
          ))}
        </div>
        {completed&&(
          <div style={{fontSize:12,color:"var(--text-muted)"}}>
            ✓ You've completed the tour. Pick any role to restart.
          </div>
        )}
      </div>
    </div>
  );
}
