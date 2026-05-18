import React, { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: a, ...b }) })
    .then(r => r.json()).catch(() => ({}));

const IMP_STYLE: any = {
  high:     { bg: "bg-red-500/10 border border-red-500/20 text-red-400" },
  medium:   { bg: "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400" },
  low:      { bg: "bg-blue-500/10 border border-blue-500/20 text-blue-400" },
  critical: { bg: "bg-red-600/20 border border-red-600/30 text-red-300" },
};

export default function MorningBrief() {
  const { selectedProjectId: projectId } = useProject();
  const [brief, setBrief] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [gen, setGen] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await post("get_morning_brief", { scope: "empire" });
    setBrief((r as any).brief || r);
    setLoading(false);
  };
  const regen = async () => {
    setGen(true);
    const r = await post("generate_morning_brief", { scope: "empire" });
    setBrief((r as any).brief || r);
    setGen(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Morning Brief</h1>
            <p className="text-sm text-muted-foreground mt-1">Daily AI intelligence — {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" })}</p>
          </div>
          <button onClick={regen} disabled={gen}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90">
            {gen ? "Generating..." : "↻ Regenerate"}
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : !brief?.headline ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <div className="text-3xl mb-3">🌅</div>
            <div className="text-base font-semibold mb-2">No brief generated yet</div>
            <p className="text-sm text-muted-foreground mb-4">Click Regenerate to create today's intelligence brief</p>
            <button onClick={regen} disabled={gen}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              {gen ? "Generating..." : "Generate Brief"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-2">✦ JARVIS</div>
              <h2 className="text-xl font-bold">{brief.headline}</h2>
              {brief.summary && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{brief.summary}</p>}
            </div>
            {brief.priority_actions?.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">🎯 Priority Actions</div>
                <div className="space-y-2">
                  {brief.priority_actions.map((a: any, i: number) => (
                    <div key={i} className="flex gap-3 py-2 border-b border-border/50 last:border-0">
                      <span className="text-xs font-bold text-primary font-mono flex-shrink-0 mt-0.5">{i + 1}</span>
                      <div>
                        <div className="text-sm font-medium">{a.action || a}</div>
                        {a.why && <div className="text-xs text-muted-foreground mt-0.5">{a.why}</div>}
                      </div>
                      {a.impact && (
                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full flex-shrink-0 self-start ${IMP_STYLE[a.impact]?.bg || "bg-muted text-muted-foreground"}`}>
                          {a.impact}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {brief.wins?.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">✅ Wins</div>
                  <ul className="space-y-1.5">{brief.wins.map((w: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-green-400 flex-shrink-0">•</span>{w}</li>
                  ))}</ul>
                </div>
              )}
              {brief.risks?.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">⚠️ Risks</div>
                  <ul className="space-y-1.5">{brief.risks.map((r: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-yellow-400 flex-shrink-0">•</span>{r}</li>
                  ))}</ul>
                </div>
              )}
              {brief.opportunities?.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">💡 Opportunities</div>
                  <ul className="space-y-1.5">{brief.opportunities.map((o: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-blue-400 flex-shrink-0">•</span>{o}</li>
                  ))}</ul>
                </div>
              )}
              {brief.algorithm_watch?.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">🔍 Algorithm Watch</div>
                  <ul className="space-y-1.5">{brief.algorithm_watch.map((a: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-purple-400 flex-shrink-0">•</span>{a}</li>
                  ))}</ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
