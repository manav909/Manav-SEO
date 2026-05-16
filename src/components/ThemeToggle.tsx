import React from "react";
import { useTheme } from "@/contexts/ThemeContext";
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, toggle, theme } = useTheme();
  return (
    <button onClick={toggle} title={`Switch to ${mode==="dark"?"light":"dark"} mode`}
      style={{ background:`${theme.accent}18`, border:`0.5px solid ${theme.borderGlow}`,
        borderRadius:20, padding: compact?"5px 10px":"6px 14px",
        color:theme.accentSoft, fontSize:compact?11:12, cursor:"pointer",
        display:"flex", alignItems:"center", gap:6, fontWeight:500,
        transition:"all .2s" }}>
      <span style={{ fontSize:14 }}>{mode==="dark"?"☀️":"🌙"}</span>
      {!compact && <span>{mode==="dark"?"Light":"Dark"}</span>}
    </button>
  );
}
