
import PortalNav from '@/components/PortalNav';
import { useProject } from '@/contexts/ProjectContext';
import React,{useState} from "react";
import {useTheme} from "@/contexts/ThemeContext";
import {THEMES,type ThemeId} from "@/lib/theme-engine";
import AnimatedBg from "@/components/AnimatedBg";

const THEME_LIST = [
  {id:"void",    name:"Void",     icon:"🌌", desc:"Deep space teal — the original",     moods:["Precise","Technical","Professional"]},
  {id:"obsidian",name:"Obsidian", icon:"💎", desc:"Electric violet luxury",             moods:["Premium","Dark","Powerful"]},
  {id:"arctic",  name:"Arctic",   icon:"❄️", desc:"Ice precision, sharp edges",         moods:["Clean","Sharp","Clinical"]},
  {id:"carbon",  name:"Carbon",   icon:"🔩", desc:"Industrial amber — raw power",       moods:["Heavy","Industrial","Bold"]},
  {id:"emerald", name:"Emerald",  icon:"🌿", desc:"Forest deep — organic growth",       moods:["Calm","Natural","Growth"]},
  {id:"rose",    name:"Rose",     icon:"🌹", desc:"Fashion editorial elegance",         moods:["Elegant","Refined","Bold"]},
  {id:"solar",   name:"Solar",    icon:"☀️", desc:"Desert gold — UAE luxury",           moods:["Luxury","Warm","Premium"]},
  {id:"matrix",  name:"Matrix",   icon:"🖥",  desc:"Terminal — hacker precision",       moods:["Focused","Sharp","Technical"]},
  {id:"vapor",   name:"Vapor",    icon:"🌊", desc:"Retrowave synthwave aesthetic",      moods:["Creative","Retro","Vibrant"]},
  {id:"cobalt",  name:"Cobalt",   icon:"🔷", desc:"Enterprise professional depth",     moods:["Trustworthy","Deep","Solid"]},
];

export default function ThemePreview(){
  const { selectedProjectId: projectId } = useProject();
  const{themeId,mode,setThemeId,toggle,theme}=useTheme();
  const[hoverId,setHover]=useState<string|null>(null);

  return(
    <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",
      fontFamily:"var(--font-display)",position:"relative"}}>
      <PortalNav />
      
      <div style={{position:"relative",zIndex:1,maxWidth:1000,margin:"0 auto",
        padding:"60px 24px 120px"}}>

        {/* Header */}
        <div style={{textAlign:"center" as const,marginBottom:52}}>
          <div style={{fontFamily:"var(--font-mono)",fontSize:10,letterSpacing:"3px",
            textTransform:"uppercase" as const,color:"var(--text-muted)",marginBottom:12}}>
            WORKING ENVIRONMENTS
          </div>
          <div style={{fontSize:36,fontWeight:800,letterSpacing:"-.03em",marginBottom:10,
            background:"var(--grad-accent)",WebkitBackgroundClip:"text",
            WebkitTextFillColor:"transparent",backgroundClip:"text"}}>
            Choose Your World
          </div>
          <div style={{fontSize:15,color:"var(--text-sub)",maxWidth:500,margin:"0 auto",lineHeight:1.7}}>
            Each environment is deeply implemented — not just colors, but radius, typography,
            shadows, animations, and card effects. A complete aesthetic.
          </div>
          {/* Day/Night toggle */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center" as const,
            gap:8,marginTop:20}}>
            <span style={{fontSize:12,color:"var(--text-muted)"}}>Night</span>
            <button onClick={toggle} style={{
              width:46,height:24,borderRadius:12,
              background:mode==="light"?"var(--accent)":"var(--bg-card)",
              border:".5px solid var(--border-glow)",cursor:"pointer",
              position:"relative" as const,transition:"background .25s"
            }}>
              <div style={{
                width:18,height:18,borderRadius:"50%",
                background:mode==="light"?"#fff":"var(--accent-soft)",
                position:"absolute" as const,
                top:3,left:mode==="light"?25:3,
                transition:"left .25s cubic-bezier(.4,0,.2,1)",
                boxShadow:"0 1px 4px rgba(0,0,0,.3)",
              }}/>
            </button>
            <span style={{fontSize:12,color:"var(--text-muted)"}}>Day</span>
          </div>
        </div>

        {/* Theme grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
          {THEME_LIST.map((t,i)=>{
            const themeKey=`${t.id}_${mode}`;
            const td=THEMES[themeKey];
            const isActive=themeId===t.id;
            const isHov=hoverId===t.id;
            return(
              <div key={t.id}
                onClick={()=>setThemeId(t.id as ThemeId)}
                onMouseEnter={()=>setHover(t.id)}
                onMouseLeave={()=>setHover(null)}
                style={{
                  borderRadius:"var(--radius)",cursor:"pointer",
                  padding:"18px",position:"relative" as const,
                  background:td?.bgCard||"var(--bg-card)",
                  border:`.5px solid ${isActive?td?.accent||"var(--accent)":td?.border||"var(--border)"}`,
                  boxShadow:isActive
                    ?`0 0 0 1px ${td?.accent||"var(--accent)"}, ${td?.shadowGlow||""}`
                    :isHov?td?.shadowGlow||"none":"none",
                  transform:isHov&&!isActive?"translateY(-2px)":"none",
                  transition:"all .2s cubic-bezier(.2,0,.2,1)",
                  animation:`warp-in .4s ease ${i*.04}s both`,
                }}>
                {/* Active indicator */}
                {isActive&&(
                  <div style={{
                    position:"absolute" as const,top:-1,left:24,right:24,height:2,
                    background:td?.gradAccent||"var(--grad-accent)",
                    borderRadius:"0 0 2px 2px",
                  }}/>
                )}
                {/* Preview swatches */}
                <div style={{display:"flex",gap:4,marginBottom:12,alignItems:"center"}}>
                  <div style={{width:32,height:32,borderRadius:td?.radiusSm||"6px",
                    background:td?.bgCard||"#111",
                    border:`.5px solid ${td?.border||"rgba(255,255,255,.1)"}`,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
                    {t.icon}
                  </div>
                  <div style={{display:"flex",flexDirection:"column" as const,gap:3}}>
                    {[td?.accent,td?.accentAlt,td?.accentSoft].map((c,j)=>(
                      <div key={j} style={{width:30,height:5,borderRadius:2,background:c||"#555"}}/>
                    ))}
                  </div>
                </div>
                <div style={{fontSize:13,fontWeight:700,color:td?.text||"var(--text)",
                  marginBottom:4,fontFamily:td?.fontDisplay||"inherit"}}>
                  {t.name}
                </div>
                <div style={{fontSize:11,color:td?.textMuted||"var(--text-muted)",
                  lineHeight:1.4,marginBottom:10}}>{t.desc}</div>
                {/* Mood tags */}
                <div style={{display:"flex",gap:4,flexWrap:"wrap" as const}}>
                  {t.moods.map(m=>(
                    <span key={m} style={{
                      fontSize:9,fontWeight:600,padding:"2px 6px",
                      borderRadius:td?.radiusSm||"6px",fontFamily:td?.fontMono||"monospace",
                      letterSpacing:".06em",textTransform:"uppercase" as const,
                      background:`${td?.accent||"#6366f1"}18`,
                      color:td?.accentSoft||"var(--accent-soft)",
                      border:`.5px solid ${td?.accent||"#6366f1"}30`,
                    }}>{m}</span>
                  ))}
                </div>
                {/* Radius preview */}
                <div style={{marginTop:10,display:"flex",gap:4,alignItems:"center"}}>
                  <div style={{width:20,height:20,borderRadius:td?.radius||"12px",
                    background:td?.accentGlow||"rgba(99,102,241,.2)",
                    border:`.5px solid ${td?.accent||"var(--accent)"}30`}}/>
                  <span style={{fontSize:9,color:td?.textMuted||"var(--text-muted)",
                    fontFamily:td?.fontMono||"monospace"}}>r={td?.radius||"12px"}</span>
                </div>
                {isActive&&(
                  <div style={{marginTop:8,fontFamily:"var(--font-mono)",fontSize:9,
                    color:td?.accent||"var(--accent)",letterSpacing:".1em",
                    textTransform:"uppercase" as const,display:"flex",alignItems:"center",gap:4}}>
                    <span style={{width:5,height:5,borderRadius:"50%",
                      background:td?.accent||"var(--accent)",
                      boxShadow:`0 0 6px ${td?.accent||"var(--accent)"}`,
                      display:"inline-block"}}/>
                    ACTIVE
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Preview strip */}
        <div style={{marginTop:32,padding:"24px",borderRadius:"var(--radius-lg)",
          background:"var(--bg-card)",border:".5px solid var(--border)"}}>
          <div style={{fontFamily:"var(--font-mono)",fontSize:9,letterSpacing:"2px",
            textTransform:"uppercase" as const,color:"var(--text-muted)",marginBottom:16}}>
            CURRENT: {themeId.toUpperCase()} {mode.toUpperCase()}
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap" as const}}>
            {/* Sample elements in current theme */}
            <button className="empire-btn">Primary Action</button>
            <span className="empire-badge" style={{background:"var(--accent-glow)",color:"var(--accent-soft)",border:".5px solid var(--border-glow)"}}>BADGE</span>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <div className="status-dot"/>
              <span className="status-label">STATUS</span>
            </div>
            <div style={{height:4,width:120,borderRadius:"var(--radius-sm)",overflow:"hidden" as const,background:"var(--progress-track)"}}>
              <div style={{height:"100%",width:"68%",background:"var(--progress-color)",
                borderRadius:"var(--radius-sm)"}}/>
            </div>
            <input className="empire-input" defaultValue="Input field" style={{width:140,padding:"6px 10px"}}/>
          </div>
        </div>
      </div>
    </div>
  );
}
