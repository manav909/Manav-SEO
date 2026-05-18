import React, { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: a, ...b }) })
    .then(r => r.json()).catch(() => ({}));

const SEV: any = {
  critical: "bg-red-600/15 border-red-600/30 text-red-300",
  urgent:   "bg-red-500/10 border-red-500/20 text-red-400",
  warning:  "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
  info:     "bg-blue-500/10 border-blue-500/20 text-blue-400",
};

export default function AlertCenter() {
  const { selectedProjectId: projectId } = useProject();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    const r = await post("get_alerts", { unreadOnly: false, limit: 50 });
    setAlerts((r as any).alerts || []);
    setLoading(false);
  };
  const markRead = async (id: string) => {
    await post("mark_alert_read", { alertId: id });
    setAlerts(a => a.map((x: any) => x.id === id ? { ...x, read_at: new Date().toISOString() } : x));
  };
  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? alerts
    : filter === "unread" ? alerts.filter((a: any) => !a.read_at)
    : alerts.filter((a: any) => a.severity === filter);
  const unread = alerts.filter((a: any) => !a.read_at).length;
  const filters = ["all", "unread", "critical", "urgent", "warning", "info"];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Alert Center</h1>
            <p className="text-sm text-muted-foreground mt-1">{unread} unread · {alerts.length} total</p>
          </div>
          <button onClick={load} className="px-4 py-2 rounded-xl bg-secondary text-sm font-medium hover:bg-secondary/80">
            ↻ Refresh
          </button>
        </div>
        <div className="flex gap-2 mb-6 flex-wrap">
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}>
              {f}{f === "unread" && unread > 0 ? ` (${unread})` : ""}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((a: any) => (
              <div key={a.id} onClick={() => !a.read_at && markRead(a.id)}
                className={`rounded-2xl border p-4 transition-all ${a.read_at ? "opacity-50" : "cursor-pointer hover:border-primary/40"} ${SEV[a.severity] || "bg-card border-border"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider">{a.severity}</span>
                      {!a.read_at && <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
                    </div>
                    <div className="text-sm font-semibold mb-1">{a.title}</div>
                    {a.body && <div className="text-xs text-muted-foreground leading-relaxed">{a.body}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground flex-shrink-0">{a.created_at?.slice(0, 10)}</div>
                </div>
              </div>
            ))}
            {!filtered.length && (
              <div className="text-center py-16 text-sm text-muted-foreground">
                {filter === "unread" ? "No unread alerts ✓" : "No alerts found"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
