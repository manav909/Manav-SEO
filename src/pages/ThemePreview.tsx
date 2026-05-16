import React from "react";
import { useTheme } from "@/contexts/ThemeContext";
import AnimatedBg from "@/components/AnimatedBg";
import { THEMES } from "@/lib/theme-engine";

export default function ThemePreview() {
  const { theme, setProject, toggle, mode } = useTheme();
  const themes = Object.values(THEMES);

  return (
    <div className="empire-page" style={{ minHeight:"100vh" }}>
      <AnimatedBg/>
      <div style={{ position:"relative", zIndex:1, padding:"32px 24px", maxWidth:960, margin:"0 auto" }}>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:24, fontWeight:700, letterSpacing:"var(--letter-spacing)",
            background:"var(--grad-accent)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            Theme Gallery
          </div>
          <div style={{ fontSize:13, color:"var(--text-sub)", marginTop:6 }}>
            Themes auto-apply based on client industry, market, and goals. Preview them here.
          </div>
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          <button className="empire-btn" onClick={toggle}>{mode==="dark"?"☀️ Light Mode":"🌙 Dark Mode"}</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
          {themes.filter(t=>t.mode===mode).map(t=>(
            <div key={t.id} onClick={()=>setProject({industry:t.id,goals:t.emotion,market:"uk"})}
              style={{ background:t.bgCard, border:`0.5px solid ${t.id===theme.id?t.accent:t.border}`,
                borderRadius:12, padding:18, cursor:"pointer",
                boxShadow:t.id===theme.id?`0 0 24px ${t.accentGlow}`:"none",
                transition:"all .2s", position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute",inset:0,background:t.gradCard,pointerEvents:"none" }}/>
              <div style={{ position:"relative" }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
                  <div style={{ fontSize:14,fontWeight:700,color:t.text }}>{t.name}</div>
                  {t.id===theme.id&&<div style={{ fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20,
                    background:`${t.accent}18`,color:t.accentSoft }}>ACTIVE</div>}
                </div>
                <div style={{ fontSize:11,color:t.textSub,marginBottom:12,fontStyle:"italic" }}>"{t.tagline}"</div>
                <div style={{ display:"flex",gap:6,flexWrap:"wrap" as const }}>
                  {[t.accent,t.accentSoft,t.text].map((c,i)=>(
                    <div key={i} style={{ width:20,height:20,borderRadius:"50%",background:c,border:`1px solid ${t.border}` }}/>
                  ))}
                </div>
                <div style={{ marginTop:10,fontSize:10,color:t.textMuted,textTransform:"uppercase",letterSpacing:"1px" }}>
                  {t.emotion} · {t.bgPattern}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
