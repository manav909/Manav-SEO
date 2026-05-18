import React from "react";
import PortalNav from "@/components/PortalNav";
import { useNavigate } from "react-router-dom";

const ITEMS = [
  { icon: "🏗", title: "Build Dashboard",  href: "/build",         desc: "Live surveillance — every system in real time" },
  { icon: "👑", title: "Empire Command",   href: "/empire",         desc: "God view — clients, health, priorities" },
  { icon: "💰", title: "Revenue BI",       href: "/revenue",        desc: "MRR, ARR, pipeline forecasting" },
  { icon: "📋", title: "Kanban Board",     href: "/kanban",         desc: "Delivery task management" },
  { icon: "🧠", title: "Brain Command",    href: "/brain-command",  desc: "Learning velocity and compound intelligence" },
  { icon: "💬", title: "Client Comms",     href: "/client-comms",   desc: "Conversation analyser, objection handler" },
  { icon: "🏛", title: "Staff Command",    href: "/staff-command",  desc: "Team performance and pipeline management" },
  { icon: "🤖", title: "Ask the Empire",   href: "/ask",            desc: "Natural language AI across all data" },
  { icon: "🌅", title: "Morning Brief",    href: "/morning-brief",  desc: "Daily AI intelligence briefing" },
  { icon: "📊", title: "Reports",          href: "/reports",        desc: "Automated client-ready reports" },
  { icon: "🎯", title: "Lead Intake",      href: "/intake",         desc: "Lead capture with instant site audit" },
  { icon: "🎨", title: "Themes",           href: "/themes",         desc: "10 smart environments — pick your world" },
];

export default function ScaleControl() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="text-center mb-10">
          <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-2">EMPIRE CONTROL</div>
          <h1 className="text-3xl font-bold mb-2">Scale Control</h1>
          <p className="text-muted-foreground text-sm">Every tool. Every module. One place.</p>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
          {ITEMS.map(item => (
            <button key={item.href} onClick={() => navigate(item.href)}
              className="text-left p-5 rounded-2xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 group">
              <div className="text-2xl mb-3">{item.icon}</div>
              <div className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">{item.title}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{item.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
