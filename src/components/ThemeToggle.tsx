
import React from "react";
import {useTheme} from "@/contexts/ThemeContext";
import {useNavigate} from "react-router-dom";

const THEME_ICONS:Record<string,string>={
  void:"🌌",obsidian:"💎",arctic:"❄️",carbon:"🔩",
  emerald:"🌿",rose:"🌹",solar:"☀️",matrix:"🖥",vapor:"🌊",cobalt:"🔷"
};

export default function ThemeToggle({compact=false}:{compact?:boolean}){
  const{themeId,mode,toggle,setThemeId}=useTheme();
  const navigate=useNavigate();
  return(
    <div style={{display:"flex",gap:5,alignItems:"center"}}>
      {/* Day/Night */}
      <button onClick={toggle} title={`Switch to ${mode==="dark"?"light":"dark"} mode`}
        style={{width:28,height:16,borderRadius:8,position:"relative" as const,cursor:"pointer",
          background:mode==="light"?"var(--accent)":"var(--bg-deep)",
          border:".5px solid var(--border-glow)",transition:"background .2s"}}>
        <div style={{width:10,height:10,borderRadius:"50%",
          background:mode==="light"?"#fff":"var(--accent-soft)",
          position:"absolute" as const,top:3,
          left:mode==="light"?15:3,
          transition:"left .2s cubic-bezier(.4,0,.2,1)"}}/>
      </button>
      {!compact&&(
        <button onClick={()=>navigate("/themes")}
          title="Change theme"
          style={{display:"flex",alignItems:"center",gap:5,
            background:"var(--accent-glow)",border:".5px solid var(--border-glow)",
            borderRadius:"var(--radius-sm)",padding:"4px 9px",fontSize:11,
            color:"var(--accent-soft)",cursor:"pointer",fontWeight:600,
            fontFamily:"var(--font-mono)",letterSpacing:".05em"}}>
          <span>{THEME_ICONS[themeId]||"🎨"}</span>
          <span style={{textTransform:"uppercase" as const,fontSize:9,letterSpacing:".1em"}}>
            {themeId}
          </span>
        </button>
      )}
    </div>
  );
}
