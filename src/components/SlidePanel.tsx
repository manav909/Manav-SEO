import React, { useEffect, useRef } from "react";
import "@/styles/hollywood.css";

interface Props {
  open: boolean;
  onClose: () => void;
  from?: "left" | "right" | "bottom";
  width?: number | string;
  height?: number | string;
  title?: string;
  icon?: string;
  children: React.ReactNode;
  noPadding?: boolean;
}

export default function SlidePanel({
  open, onClose, from = "right",
  width = 480, height = "60vh",
  title, icon, children, noPadding = false
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const panelStyle: React.CSSProperties = {
    width: from === "bottom" ? "100%" : width,
    height: from === "bottom" ? height : "100%",
    maxHeight: from !== "bottom" ? "100vh" : height,
    background: "rgba(6,6,20,.96)",
    backdropFilter: "blur(40px) saturate(200%)",
    borderLeft: from === "right" ? "0.5px solid var(--border-glow)" : "none",
    borderRight: from === "left"  ? "0.5px solid var(--border-glow)" : "none",
    borderTop:   from === "bottom"? "0.5px solid var(--border-glow)" : "none",
    display: "flex",
    flexDirection: "column",
    boxShadow: from === "right" ? "-20px 0 80px rgba(0,0,0,.6), -4px 0 0 var(--accent-glow)"
             : from === "left"  ? "20px 0 80px rgba(0,0,0,.6), 4px 0 0 var(--accent-glow)"
             : "0 -20px 80px rgba(0,0,0,.6)",
  };

  return (
    <>
      <div className="panel-overlay" onClick={onClose}/>
      <div className={`panel-${from}`} style={panelStyle} ref={panelRef}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "0.5px solid var(--border)",
          flexShrink: 0,
          background: "linear-gradient(180deg,rgba(255,255,255,.04) 0%,transparent 100%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {icon && (
              <div style={{
                width: 34, height: 34, borderRadius: 10, background: "var(--accent-glow)",
                border: "0.5px solid var(--border-glow)", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 16,
              }}>{icon}</div>
            )}
            {title && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{title}</div>
                <div style={{ width: 40, height: 1.5, background: "var(--grad-accent)",
                  borderRadius: 1, marginTop: 3 }}/>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8,
            background: "rgba(255,255,255,.06)", border: "0.5px solid var(--border)",
            color: "var(--text-muted)", cursor: "pointer", fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all .15s",
          }}>✕</button>
        </div>
        {/* Body */}
        <div style={{
          flex: 1, overflowY: "auto" as const,
          padding: noPadding ? 0 : "16px 20px",
        }}>
          {children}
        </div>
        {/* Accent line at edge */}
        <div style={{
          position: "absolute",
          [from === "right" ? "left" : from === "left" ? "right" : "top"]: 0,
          top: from === "bottom" ? undefined : "10%",
          bottom: from === "bottom" ? undefined : "10%",
          left: from === "bottom" ? "20%" : undefined,
          right: from === "bottom" ? "20%" : undefined,
          width: from === "bottom" ? undefined : 2,
          height: from === "bottom" ? 2 : undefined,
          background: "var(--grad-accent)",
          borderRadius: 1,
          opacity: .7,
        }}/>
      </div>
    </>
  );
}
