import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const DOCK_ITEMS = [
  { href: "/build",          icon: "📡", label: "Command" },
  { href: "/empire",         icon: "👑", label: "Empire" },
  { href: "/ask",            icon: "🤖", label: "Ask AI" },
  { href: "/kanban",         icon: "📋", label: "Kanban" },
  { href: "/revenue",        icon: "💰", label: "Revenue" },
  null, // divider
  { href: "/client-comms",   icon: "💬", label: "Comms" },
  { href: "/bde-panel",      icon: "💼", label: "BDE" },
  { href: "/staff-command",  icon: "🏛",  label: "Staff" },
  null, // divider
  { href: "/morning-brief",  icon: "🌅", label: "Brief" },
  { href: "/brain-command",  icon: "🧠", label: "Brain" },
  { href: "/health",         icon: "❤️", label: "Health" },
  { href: "/themes",         icon: "🎨", label: "Themes" },
];

export default function FloatingDock() {
  const location = useLocation();
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="dock-container no-select">
      {DOCK_ITEMS.map((item, i) => {
        if (!item) return <div key={`div-${i}`} className="dock-divider"/>;
        const active = location.pathname === item.href;
        const isHovered = hovered === i;
        return (
          <div
            key={item.href}
            className={`dock-item ${active ? "active" : ""}`}
            style={{
              transform: isHovered
                ? "translateY(-10px) scale(1.2)"
                : hovered !== null && Math.abs(hovered - i) === 1
                  ? "translateY(-4px) scale(1.07)"
                  : "scale(1)",
              transition: "transform .2s cubic-bezier(.34,1.56,.64,1)",
            }}
            onClick={() => navigate(item.href)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            title={item.label}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
            <div className="dock-label">{item.label}</div>
            {active && (
              <div style={{
                position: "absolute", bottom: -10, left: "50%",
                transform: "translateX(-50%)",
                width: 4, height: 4, borderRadius: "50%",
                background: "var(--accent)",
                boxShadow: "0 0 6px var(--accent)",
              }}/>
            )}
          </div>
        );
      })}
    </div>
  );
}
