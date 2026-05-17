import React, { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: a, ...b }),
  }).then(r => r.json()).catch(() => ({}));

function Ring({ v, size = 48, stroke = 4, color }: { v: number; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const off  = circ - (v / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${circ} ${circ}`} strokeDashoffset={off} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)" }} />
    </svg>
  );
}

export default function EmpireCommand() {
  const { selectedProjectId } = useProject();
  const [stats,   setStats]   = useState<any>({});
  const [health,  setHealth]  = useState<any[]>([]);
  const [alerts,  setAlerts]  = useState<any[]>([]);
  const [brief,   setBrief]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const rc: any = { low:"#10b981", medium:"#f59e0b", high:"#ef4444", critical:"#dc2626" };

  const load = () => {
    setLoading(true);
    Promise.allSettled([
      post("get_empire_stats"),
      post("get_health_dashboard"),
      post("get_alerts", { unreadOnly: true, limit: 5 }),
      post("get_morning_brief", { scope: "empire" }),
    ]).then(([s, h, a, b]) => {
      if (s.status === "fulfilled") setStats((s.value as any).stats || {});
      if (h.status === "fulfilled") setHealth((h.value as any).health || []);
      if (a.status === "fulfilled") setAlerts((a.value as any).alerts || []);
      if (b.status === "fulfilled") setBrief((b.value as any).brief || b.value);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const metrics = [
    { v: stats.projects      || 0, l: "Projects",    c: "#6366f1", i: "🏗" },
    { v: stats.learnings     || 0, l: "Learnings",   c: "#a78bfa", i: "🧠" },
    { v: stats.verifications || 0, l: "Verified",    c: "#10b981", i: "✅" },
    { v: stats.llmCitations  || 0, l: "AI Citations",c: "#06b6d4", i: "🤖" },
    { v: stats.prospects     || 0, l: "Leads",       c: "#f59e0b", i: "🎯" },
    { v: stats.alertsUnread  || 0, l: "Alerts",      c: stats.alertsUnread > 0 ? "#ef4444" : "#4b4b6a", i: "🚨" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-6xl mx-auto px-6 py-6">
        {brief?.headline && (
          <div className="mb-6 p-4 rounded-2xl border border-border bg-card/50">
            <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-2">
              ✦ Empire Intelligence
            </div>
            <div className="text-lg font-bold">{brief.headline}</div>
          </div>
        )}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
          {metrics.map(m => (
            <div key={m.l} className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="text-xl mb-1">{m.i}</div>
              <div className="text-xl font-bold font-mono" style={{ color: m.c }}>{m.v}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{m.l}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
              Client Health
            </div>
            {loading && <div className="text-sm text-muted-foreground py-4">Loading...</div>}
            {health.map((h: any) => (
              <div key={h.project_id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                <div className="relative flex-shrink-0">
                  <Ring v={h.overall_score || 0} color={rc[h.churn_risk] || "#6366f1"} />
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-bold"
                    style={{ color: rc[h.churn_risk] || "#6366f1" }}>
                    {h.overall_score}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {(h as any).projects?.name || "Project"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {h.recommended_action?.slice(0, 50) || ""}
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: `${rc[h.churn_risk] || "#6366f1"}15`, color: rc[h.churn_risk] || "#6366f1" }}>
                  {(h.churn_risk || "ok").toUpperCase()}
                </span>
              </div>
            ))}
            {!health.length && !loading && (
              <button onClick={() => post("calculate_all_health").then(load)}
                className="text-sm text-primary mt-2 hover:underline">
                Calculate health scores →
              </button>
            )}
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                Unread Alerts
              </div>
              {alerts.map((a: any) => (
                <div key={a.id} className="flex gap-2 py-2 border-b border-border/50 last:border-0 items-start">
                  <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
                    style={{
                      background: a.severity === "warning" ? "rgba(245,158,11,.1)" : "rgba(239,68,68,.1)",
                      color:      a.severity === "warning" ? "#f59e0b" : "#ef4444",
                    }}>
                    {a.severity?.toUpperCase()}
                  </span>
                  <div className="text-xs text-muted-foreground">{a.title}</div>
                </div>
              ))}
              {!alerts.length && (
                <div className="text-xs text-muted-foreground">No alerts ✓</div>
              )}
              <a href="/alerts" className="text-xs text-primary mt-2 block hover:underline">
                View all →
              </a>
            </div>
            {brief?.priority_actions?.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                  Today's Focus
                </div>
                {brief.priority_actions.slice(0, 3).map((a: any, i: number) => (
                  <div key={i} className="flex gap-2 py-2 border-b border-border/50 last:border-0">
                    <span className="text-xs font-bold text-primary font-mono flex-shrink-0">{i + 1}</span>
                    <div className="text-xs text-muted-foreground">{a.action}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
