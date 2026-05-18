import React from "react";
import { useTour } from "@/contexts/TourContext";
import { useNavigate } from "react-router-dom";
import PortalNav from "@/components/PortalNav";

const ROLES = [
  { r: "hod",    l: "Head of Department",     c: "#dc2626", i: "👑", desc: "Full empire — staff, revenue, pipeline, morning briefs, every system" },
  { r: "bde",    l: "Business Dev Executive", c: "#10b981", i: "💼", desc: "Fiverr tools, instant audit, quick responses, lead pipeline" },
  { r: "client", l: "Client",                 c: "#6366f1", i: "🏢", desc: "Your campaign metrics, verified wins, reports, AI visibility" },
  { r: "pm",     l: "Project Manager",        c: "#06b6d4", i: "🗂", desc: "Kanban delivery, brain learnings, verifications, reports" },
];

export default function TourPage() {
  const { start, completed } = useTour();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <PortalNav />
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="text-center max-w-2xl w-full">
          <div className="text-5xl mb-4 animate-bounce">🚀</div>
          <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-2">GUIDED TOUR</div>
          <h1 className="text-3xl font-bold mb-3">Choose your role</h1>
          <p className="text-muted-foreground text-sm mb-8 leading-relaxed max-w-md mx-auto">
            Pick your role for a personalised walkthrough of every feature built for you.
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
            {ROLES.map(({ r, l, c, i, desc }) => (
              <button key={r}
                onClick={() => { start(r); navigate("/build"); }}
                className="text-left p-5 rounded-2xl border border-border bg-card hover:bg-primary/5 transition-all duration-200"
                style={{ borderColor: `${c}30` }}>
                <div className="text-2xl mb-3">{i}</div>
                <div className="font-semibold text-sm mb-1" style={{ color: c }}>{l}</div>
                <div className="text-xs text-muted-foreground leading-relaxed mb-3">{desc}</div>
                <div className="text-xs font-bold" style={{ color: c }}>START TOUR →</div>
              </button>
            ))}
          </div>
          {completed && (
            <p className="text-xs text-muted-foreground mt-6">✓ Tour complete. Pick any role to restart.</p>
          )}
        </div>
      </div>
    </div>
  );
}
