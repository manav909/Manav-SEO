import React from "react";
import {useTour} from "@/contexts/TourContext";
import {useNavigate} from "react-router-dom";
import AnimatedBg from "@/components/AnimatedBg";

const ROLES=[
  {r:"hod",   l:"Head of Department",c:"#dc2626",i:"👑",
   desc:"Full empire — staff, revenue, pipeline, morning briefs, every system"},
  {r:"bde",   l:"Business Dev Executive",c:"#10b981",i:"💼",
   desc:"Fiverr tools, instant audit, quick responses, lead pipeline"},
  {r:"client",l:"Client",c:"#6366f1",i:"🏢",
   desc:"Your campaign metrics, verified wins, reports, AI visibility"},
  {r:"pm",    l:"Project Manager",c:"#06b6d4",i:"🗂",
   desc:"Kanban delivery, brain learnings, verifications, reports"},
];

export default function TourPage(){
  const{start,completed}=useTour();
  const navigate=useNavigate();
  return(
    <div className="empire-page" style={{minHeight:"100vh",background:"var(--bg)",
      color:"var(--text)",fontFamily:"var(--font-display)",
      display:"flex",alignItems:"center",justifyContent:"center" as const}}>
      <AnimatedBg/>
      <div style={{position:"relative",zIndex:1,textAlign:"center" as const,
        maxWidth:700,padding:"0 24px",width:"100%"}}>
        <div style={{fontSize:52,marginBottom:16,animation:"float-y 4s ease-in-out infinite"}}>🚀</div>
        <div style={{fontFamily:"var(--font-mono)",fontSize:10,letterSpacing:"3px",
          textTransform:"uppercase" as const,color:"var(--text-muted)",marginBottom:12}}>
          GUIDED TOUR
        </div>
        <div style={{fontSize:32,fontWeight:800,marginBottom:10,letterSpacing:"-.03em",
          background:"var(--grad-accent)",WebkitBackgroundClip:"text",
          WebkitTextFillColor:"transparent",backgroundClip:"text"}}>
          Choose your role
        </div>
        <div style={{fontSize:15,color:"var(--text-sub)",lineHeight:1.7,marginBottom:40,maxWidth:500,margin:"0 auto 40px"}}>
          Pick your role for a personalised walkthrough of every feature built for you.
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,maxWidth:560,margin:"0 auto"}}>
          {ROLES.map(({r,l,c,i,desc})=>(
            <div key={r} onClick={()=>{start(r);navigate("/build");}}
              className="glass-card" style={{padding:"22px",cursor:"pointer",
                borderColor:`${c}25`,textAlign:"left" as const,
                transition:"all .2s cubic-bezier(.2,0,.2,1)"}}>
              <div style={{fontSize:26,marginBottom:10}}>{i}</div>
              <div style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:4}}>{l}</div>
              <div style={{fontSize:11,color:"var(--text-muted)",lineHeight:1.5,marginBottom:12}}>{desc}</div>
              <div style={{fontSize:11,color:c,fontWeight:700,letterSpacing:".05em"}}>START TOUR →</div>
            </div>
          ))}
        </div>
        {completed&&<div style={{marginTop:24,fontSize:12,color:"var(--text-muted)"}}>
          ✓ Tour complete. Pick any role to restart.
        </div>}
      </div>
    </div>
  );
}
