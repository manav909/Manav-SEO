import React, { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: a, ...b }) })
    .then(r => r.json()).catch(() => ({}));

const RISK_COLOR: any = { low: "#10b981", medium: "#f59e0b", high: "#ef4444", critical: "#dc2626" };

function Ring({ score, color }: { score: number; color: string }) {
  const r = 22, circ = 2 * Math.PI * r, off = circ - (score / 100) * circ;
  return (
    <div className="relative h-14 w-14 flex-shrink-0">
      <svg width="56" height="56" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color }}>{score}</div>
    </div>
  );
}

export default function HealthDashboard() {
  const { selectedProjectId: projectId } = useProject();
  const [health, setHealth] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [calc, setCalc] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await post("get_health_dashboard");
    setHealth((r as any).health || []);
    setLoading(false);
  };
  const calcAll = async () => {
    setCalc(true);
    await post("calculate_all_health");
    await load();
    setCalc(false);
  };
  useEffect(() => { load(); }, []);

  const avg = health.length ? Math.round(health.reduce((s, h) => s + h.overall_score, 0) / health.length) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Client Health</h1>
            <p className="text-sm text-muted-foreground mt-1">Churn risk · upsell signals · avg score: {avg}</p>
          </div>
          <button onClick={calcAll} disabled={calc}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90">
            {calc ? "Calculating..." : "↻ Recalculate All"}
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {health.map((h: any) => {
              const color = RISK_COLOR[h.churn_risk] || "#6366f1";
              return (
                <div key={h.project_id} className="rounded-2xl border border-border bg-card p-5"
                  style={{ borderColor: h.churn_risk === "high" || h.churn_risk === "critical" ? `${color}40` : undefined }}>
                  <div className="flex items-start gap-4 mb-4">
                    <Ring score={h.overall_score} color={color} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{(h as any).projects?.name || "Project"}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${color}15`, color }}>
                          {(h.churn_risk || "ok").toUpperCase()}
                        </span>
                        {h.upsell_signals?.length > 0 && (
                          <span className="text-xs text-green-400">💡 Upsell opportunity</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{h.recommended_action}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { l: "Traffic", v: h.traffic_score },
                      { l: "Rankings", v: h.ranking_score },
                      { l: "Technical", v: h.technical_score },
                      { l: "Content", v: h.content_score },
                    ].map(s => (
                      <div key={s.l} className="text-center">
                        <div className="text-sm font-bold font-mono" style={{ color }}>{s.v || 0}</div>
                        <div className="text-xs text-muted-foreground">{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {!health.length && (
              <div className="rounded-2xl border border-border bg-card p-12 text-center">
                <div className="text-3xl mb-3">❤️</div>
                <div className="text-base font-semibold mb-2">No health data yet</div>
                <p className="text-sm text-muted-foreground mb-4">Click Recalculate to compute health scores for all clients</p>
                <button onClick={calcAll} disabled={calc}
                  className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                  {calc ? "Calculating..." : "Calculate Health Scores"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
