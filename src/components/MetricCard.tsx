import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

interface Props {
  value: number | string;
  label: string;
  sub?: string;
  color?: string;
  icon?: string;
  trend?: number;
  prefix?: string;
  suffix?: string;
  animate?: boolean;
}

function useCountUp(target: number, dur = 1200) {
  const [val, setVal] = useState(0);
  const ref = useRef<any>(null);
  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const p = Math.min((now-start)/dur, 1);
      const ease = 1-Math.pow(1-p,4);
      setVal(Math.round(target*ease));
      if (p < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(ref.current);
  }, [target, dur]);
  return val;
}

export default function MetricCard({ value, label, sub, color, icon, trend, prefix="", suffix="", animate=true }: Props) {
  const { theme } = useTheme();
  const numeric = typeof value === "number" ? value : parseFloat(String(value)) || 0;
  const counted = useCountUp(animate ? numeric : 0);
  const display = animate && typeof value === "number" ? counted : value;
  const c = color || theme.accent;

  return (
    <div className="empire-card" style={{ padding:"16px 18px", cursor:"default" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
        {icon && <div style={{ fontSize:20, opacity:.8 }}>{icon}</div>}
        {trend !== undefined && (
          <div style={{ fontSize:11, fontWeight:600, color:trend>=0?"#10b981":"#ef4444",
            background:trend>=0?"rgba(16,185,129,.1)":"rgba(239,68,68,.1)",
            padding:"2px 7px", borderRadius:20 }}>
            {trend>=0?"+":""}{trend}%
          </div>
        )}
      </div>
      <div className="empire-metric" style={{ color:c, fontSize:30 }}>
        {prefix}{display}{suffix}
      </div>
      <div style={{ fontSize:11, color:theme.textMuted, textTransform:"uppercase",
        letterSpacing:".8px", marginTop:6, fontWeight:600 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:theme.textSub, marginTop:3, lineHeight:1.4 }}>{sub}</div>}
      <div style={{ position:"absolute", bottom:0, left:0, height:2, width:`${Math.min(numeric,100)}%`,
        background:`linear-gradient(90deg,${c}00,${c})`, borderRadius:"0 0 0 12px",
        transition:"width .8s cubic-bezier(.4,0,.2,1)" }}/>
    </div>
  );
}
