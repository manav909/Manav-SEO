import React, { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/lib/supabase";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: a, ...b }) })
    .then(r => r.json()).catch(() => ({}));

export default function LLMVisibility() {
  const { selectedProjectId } = useProject();
  const [projects, setProjects] = useState<any[]>([]);
  const [sel, setSel] = useState(selectedProjectId || "");
  const [cits, setCits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    supabase.from("projects").select("id,name").limit(20).then(({ data }) => {
      setProjects(data || []);
      if (!sel && data?.length) setSel(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!sel) return;
    setLoading(true);
    post("get_llm_visibility_history", { projectId: sel, limit: 20 }).then(r => {
      setCits((r as any).citations || []);
      setLoading(false);
    });
  }, [sel]);

  const check = async () => {
    if (!sel) return;
    setChecking(true);
    await post("check_llm_visibility", { projectId: sel });
    const r = await post("get_llm_visibility_history", { projectId: sel, limit: 20 });
    setCits((r as any).citations || []);
    setChecking(false);
  };

  const cited = cits.filter((c: any) => c.cited).length;
  const rate = cits.length ? Math.round(cited / cits.length * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">LLM Visibility</h1>
            <p className="text-sm text-muted-foreground mt-1">AI citation tracking across ChatGPT, Perplexity, Claude</p>
          </div>
          <div className="flex gap-2">
            {projects.length > 1 && (
              <select value={sel} onChange={e => setSel(e.target.value)}
                className="h-9 rounded-xl border border-border bg-card text-sm px-3 outline-none">
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <button onClick={check} disabled={checking || !sel}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90">
              {checking ? "Checking..." : "Run Check"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { v: `${rate}%`, l: "Citation Rate", c: rate > 60 ? "#10b981" : rate > 30 ? "#f59e0b" : "#ef4444" },
            { v: `${cited}/${cits.length}`, l: "Checks Cited", c: "#6366f1" },
            { v: String(cits.length), l: "Total Checks", c: "#06b6d4" },
          ].map(s => (
            <div key={s.l} className="rounded-2xl border border-border bg-card p-4 text-center">
              <div className="text-2xl font-bold font-mono mb-1" style={{ color: s.c }}>{s.v}</div>
              <div className="text-xs text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {cits.map((c: any, i: number) => (
              <div key={i} className={`rounded-xl border p-4 ${c.cited ? "border-green-500/20 bg-green-500/5" : "border-border bg-card"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.cited ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>
                        {c.cited ? "CITED" : "NOT CITED"}
                      </span>
                      <span className="text-xs text-muted-foreground">{c.ai_model}</span>
                    </div>
                    <div className="text-sm truncate">{c.query}</div>
                  </div>
                  <div className="text-xs text-muted-foreground flex-shrink-0">{c.checked_at?.slice(0, 10)}</div>
                </div>
              </div>
            ))}
            {!cits.length && (
              <div className="text-center py-16 text-sm text-muted-foreground">
                No visibility checks yet. Click Run Check to test AI citations.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
