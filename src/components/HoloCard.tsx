import React, { useRef, useState, useCallback } from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  glow?: boolean;
  intensity?: number;
  onClick?: () => void;
}

export default function HoloCard({
  children, className = "", style = {},
  glow = true, intensity = 15, onClick
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState("");
  const [shine, setShine] = useState({ x: "50%", y: "50%", opacity: 0 });
  const frameRef = useRef<number>(0);

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width  / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      const rx = dy * -intensity;
      const ry = dx *  intensity;
      const shineX = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
      const shineY = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
      setTransform(
        `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(12px) scale(1.02)`
      );
      setShine({ x: `${shineX}%`, y: `${shineY}%`, opacity: 0.12 });
    });
  }, [intensity]);

  const handleLeave = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    setTransform("perspective(800px) rotateX(0) rotateY(0) translateZ(0) scale(1)");
    setShine(s => ({ ...s, opacity: 0 }));
  }, []);

  return (
    <div
      ref={ref}
      className={`glass-card card-3d ${className}`}
      style={{
        ...style,
        transform,
        transition: transform ? "none" : "transform .4s cubic-bezier(.2,0,.2,1), box-shadow .3s ease",
        willChange: "transform",
      }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
    >
      {/* Shine overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        borderRadius: "inherit",
        background: `radial-gradient(circle at ${shine.x} ${shine.y},
          rgba(255,255,255,${shine.opacity}) 0%,
          transparent 60%)`,
        transition: shine.opacity === 0 ? "opacity .3s" : "none",
      }}/>
      {/* Corner HUD marks */}
      {glow && <>
        <div style={{ position:"absolute",top:8,left:8,width:10,height:10,
          borderTop:"1.5px solid var(--accent)",borderLeft:"1.5px solid var(--accent)",
          borderRadius:"2px 0 0 0",opacity:.6 }}/>
        <div style={{ position:"absolute",bottom:8,right:8,width:10,height:10,
          borderBottom:"1.5px solid var(--accent)",borderRight:"1.5px solid var(--accent)",
          borderRadius:"0 0 2px 0",opacity:.6 }}/>
      </>}
      <div style={{ position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}
