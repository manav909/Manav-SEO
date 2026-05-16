import React, { useEffect, useRef, useMemo } from "react";
import { useTheme } from "@/contexts/ThemeContext";

function GridPattern({ color }: { color: string }) {
  return (
    <svg width="100%" height="100%" style={{ position:"absolute",inset:0,opacity:.4,pointerEvents:"none" }}>
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke={color} strokeWidth="0.5" opacity="0.4"/>
        </pattern>
        <radialGradient id="grid-fade" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="white" stopOpacity="1"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </radialGradient>
        <mask id="grid-mask"><rect width="100%" height="100%" fill="url(#grid-fade)"/></mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" mask="url(#grid-mask)"/>
    </svg>
  );
}

function NeuralPattern({ color }: { color: string }) {
  const nodes = useMemo(() => Array.from({length:20},(_,i)=>({
    x:10+Math.random()*80, y:10+Math.random()*80, r:1+Math.random()*2,
    delay:Math.random()*3, dur:3+Math.random()*4,
  })),[]);
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{position:"absolute",inset:0,opacity:.25,pointerEvents:"none"}}>
      {nodes.map((n,i)=>nodes.slice(i+1,i+4).map((n2,j)=>(
        <line key={`${i}-${j}`} x1={n.x} y1={n.y} x2={n2.x} y2={n2.y}
          stroke={color} strokeWidth="0.15" opacity="0.4"/>
      )))}
      {nodes.map((n,i)=>(
        <circle key={i} cx={`${n.x}%`} cy={`${n.y}%`} r={n.r} fill={color} opacity="0.6">
          <animate attributeName="opacity" values="0.2;0.8;0.2" dur={`${n.dur}s`} begin={`${n.delay}s`} repeatCount="indefinite"/>
          <animate attributeName="r" values={`${n.r};${n.r*1.8};${n.r}`} dur={`${n.dur*1.5}s`} begin={`${n.delay}s`} repeatCount="indefinite"/>
        </circle>
      ))}
    </svg>
  );
}

function FlowPattern({ color }: { color: string }) {
  return (
    <svg width="100%" height="100%" style={{position:"absolute",inset:0,opacity:.2,pointerEvents:"none",overflow:"visible"}}>
      <defs>
        <linearGradient id="flow1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0"/>
          <stop offset="50%" stopColor={color} stopOpacity="0.6"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[20,40,60,80].map((y,i)=>(
        <path key={i}
          d={`M-100,${y} Q25,${y-15} 50,${y} T200,${y}`}
          stroke="url(#flow1)" strokeWidth={1+i*0.3} fill="none">
          <animateTransform attributeName="transform" type="translate"
            from="0,0" to="-200,0" dur={`${12+i*3}s`} repeatCount="indefinite"/>
        </path>
      ))}
    </svg>
  );
}

function HexPattern({ color }: { color: string }) {
  const hexes = useMemo(()=>Array.from({length:30},(_,i)=>({
    x:((i%6)*18)+Math.random()*5,
    y:(Math.floor(i/6)*18)+Math.random()*5,
    size:6+Math.random()*6,
    delay:Math.random()*4,
  })),[]);
  const hexPath=(cx:number,cy:number,s:number)=>{
    const pts=Array.from({length:6},(_,i)=>{
      const a=i*60*(Math.PI/180);
      return `${cx+s*Math.cos(a)},${cy+s*Math.sin(a)}`;
    }).join(" ");
    return `M ${pts} Z`;
  };
  return(
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{position:"absolute",inset:0,opacity:.15,pointerEvents:"none"}}>
      {hexes.map((h,i)=>(
        <path key={i} d={hexPath(h.x,h.y,h.size/10)} stroke={color} strokeWidth="0.3" fill="none" opacity="0.5">
          <animate attributeName="opacity" values="0.1;0.5;0.1" dur={`${4+h.delay}s`} begin={`${h.delay}s`} repeatCount="indefinite"/>
        </path>
      ))}
    </svg>
  );
}

function DotsPattern({ color }: { color: string }) {
  return(
    <svg width="100%" height="100%" style={{position:"absolute",inset:0,opacity:.3,pointerEvents:"none"}}>
      <defs>
        <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="1" fill={color} opacity="0.4"/>
        </pattern>
        <radialGradient id="dots-fade" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="white" stopOpacity="1"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </radialGradient>
        <mask id="dots-mask"><rect width="100%" height="100%" fill="url(#dots-fade)"/></mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" mask="url(#dots-mask)"/>
    </svg>
  );
}

function GlowOrb({ color, x, y, size, blur, dur }: any) {
  return (
    <div style={{
      position:"absolute", left:`${x}%`, top:`${y}%`,
      width:size, height:size, borderRadius:"50%",
      background:color, filter:`blur(${blur}px)`, opacity:0.15,
      animation:`orb-pulse ${dur}s ease-in-out infinite alternate`,
      transform:"translate(-50%,-50%)",
    }}/>
  );
}

export default function AnimatedBg() {
  const { theme } = useTheme();

  const patterns: Record<string,React.ReactNode> = {
    grid:     <GridPattern color={theme.particleColor}/>,
    neural:   <NeuralPattern color={theme.particleColor}/>,
    flow:     <FlowPattern color={theme.particleColor}/>,
    hex:      <HexPattern color={theme.particleColor}/>,
    dots:     <DotsPattern color={theme.particleColor}/>,
    waves:    <FlowPattern color={theme.particleColor}/>,
    pulse:    <DotsPattern color={theme.particleColor}/>,
    editorial:<GridPattern color={theme.particleColor}/>,
    arabesque:<HexPattern color={theme.particleColor}/>,
    map:      <DotsPattern color={theme.particleColor}/>,
    grid_light:<GridPattern color={theme.particleColor}/>,
  };

  return (
    <div style={{ position:"fixed",inset:0,zIndex:0,overflow:"hidden",pointerEvents:"none" }}>
      <style>{`
        @keyframes orb-pulse { from { opacity:.08;transform:translate(-50%,-50%) scale(1); } to { opacity:.2;transform:translate(-50%,-50%) scale(1.3); } }
      `}</style>
      {/* Hero gradient */}
      <div style={{ position:"absolute",inset:0,background:theme.gradHero }}/>
      {/* Pattern */}
      {patterns[theme.bgPattern] || patterns.grid}
      {/* Glow orbs */}
      <GlowOrb color={theme.accent} x={15} y={20} size={400} blur={120} dur={8}/>
      <GlowOrb color={theme.accentSoft} x={80} y={70} size={300} blur={100} dur={12}/>
      <GlowOrb color={theme.accent} x={50} y={50} size={200} blur={80} dur={6}/>
    </div>
  );
}
