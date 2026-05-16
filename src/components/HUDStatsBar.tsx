import React, { useState, useEffect } from "react";

const post=(a:string,b:any={})=>fetch("/api/task-engine",{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,...b})}).then(r=>r.json()).catch(()=>({}));

function AnimatedNumber({ value, prefix="", suffix="" }: { value:number, prefix?:string, suffix?:string }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 800;
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min((now-start)/dur, 1);
      const ease = 1 - Math.pow(1-p, 3);
      setDisplayed(Math.round(from + (value-from)*ease));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);
  return <>{prefix}{displayed.toLocaleString()}{suffix}</>;
}

export default function HUDStatsBar() {
  const [stats, setStats] = useState<any>({});
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    post("get_empire_stats").then(r => setStats((r as any).stats || {}));
    const id = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const items = [
    { v: stats.projects || 0,     l: "PROJECTS",  c: "var(--accent)" },
    { v: stats.learnings || 0,    l: "LEARNINGS", c: "#a78bfa" },
    { v: stats.verifications || 0,l: "VERIFIED",  c: "#10b981" },
    { v: stats.llmCitations || 0, l: "LLM CITED", c: "#06b6d4" },
    { v: stats.prospects || 0,    l: "LEADS",     c: "#f59e0b" },
    { v: stats.alertsUnread || 0, l: "ALERTS",    c: stats.alertsUnread > 0 ? "#ef4444" : "#4b4b6a" },
  ];

  return (
    <div style={{
      position: "fixed" as const, top: 0, left: 0, right: 0, zIndex: 950,
      height: 40,
      background: "rgba(4,4,14,.92)",
      backdropFilter: "blur(20px)",
      borderBottom: "0.5px solid var(--border)",
      display: "flex", alignItems: "center",
      padding: "0 20px", gap: 24,
      fontSize: 10,
    }}>
      {/* Logo */}
      <div style={{
        fontWeight: 800, fontSize: 12, letterSpacing: "2px",
        background: "var(--grad-accent)", WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent", backgroundClip: "text",
        flexShrink: 0,
      }}>SEO SEASON</div>

      {/* Live dot */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
        <div style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "#10b981", boxShadow: "0 0 6px #10b981",
          animation: "breathe 2s ease-in-out infinite",
        }}/>
        <span style={{ color: "#10b981", fontWeight: 600, letterSpacing: "1px" }}>LIVE</span>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 20, flex: 1, justifyContent: "center" as const }}>
        {items.map(item => (
          <div key={item.l} style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
            <span style={{ color: item.c, fontWeight: 800, fontFamily: "monospace", fontSize: 12 }}>
              <AnimatedNumber value={item.v}/>
            </span>
            <span style={{ color: "var(--text-muted)", letterSpacing: "1px" }}>{item.l}</span>
          </div>
        ))}
      </div>

      {/* Clock */}
      <div style={{
        fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)",
        flexShrink: 0, letterSpacing: "1px",
      }}>
        {time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        {" "}
        <span style={{ color: "var(--text-muted)", fontSize: 9 }}>
          {time.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
        </span>
      </div>
    </div>
  );
}
