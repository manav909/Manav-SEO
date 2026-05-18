import React, { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/lib/supabase";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: a, ...b }) })
    .then(r => r.json()).catch(() => ({}));

const PRIORITY_COLOR: any = { critical: "#ef4444", high: "#f59e0b", medium: "#6366f1", low: "#10b981" };

export default function ContentHub() {
  const { selectedProjectId } = useProject();
  const [projects, setProjects] = useState<any[]>([]);
  const [sel, setSel] = useState(selectedProjectId || "");
  const [briefs, setBriefs] = useState<any[]>([]);
  const [kw, setKw] = useState("");
  const [gen, setGen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("projects").select("id,name").limit(20).then(({ data }) => {
      setProjects(data || []);
      if (!sel && data?.length) setSel(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!sel) return;
    setLoading(true);
    post("get_content_briefs", { projectId: sel }).then(r => {
      setBriefs((r as any).briefs || []);
      setLoading(false);
    });
  }, [sel]);

  const generate = async () => {
    if (!kw.trim() || !sel) return;
    setGen(true);
    const r = await post("generate_content_brief", { projectId: sel, keyword: kw });
    if ((r as any).brief) setBriefs(b => [(r as any).brief, ...b]);
    setKw("");
    setGen(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Content Hub</h1>
            <p className="text-sm text-muted-foreground mt-1">AI content briefs · {briefs.length} briefs</p>
          </div>
          {projects.length > 1 && (
            <select value={sel} onChange={e => setSel(e.target.value)}
              className="h-9 rounded-xl border border-border bg-card text-sm px-3 outline-none focus:ring-1 focus:ring-primary/50">
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 mb-6 flex gap-3">
          <input value={kw} onChange={e => setKw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && generate()}
            placeholder="Enter target keyword or topic..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          <button onClick={generate} disabled={gen || !kw.trim()}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90 flex-shrink-0">
            {gen ? "Generating..." : "Generate Brief"}
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {briefs.map((b: any) => (
              <div key={b.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                <button className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/30 transition-colors"
                  onClick={() => setOpen(open === b.id ? null : b.id)}>
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-semibold text-sm mb-0.5">{b.title}</div>
                      <div className="flex gap-2 items-center">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: `${PRIORITY_COLOR[b.priority] || "#6366f1"}15`, color: PRIORITY_COLOR[b.priority] || "#6366f1" }}>
                          {b.priority}
                        </span>
                        {b.word_count && <span className="text-xs text-muted-foreground">{b.word_count} words</span>}
                      </div>
                    </div>
                  </div>
                  <span className="text-muted-foreground text-sm">{open === b.id ? "▲" : "▼"}</span>
                </button>
                {open === b.id && (
                  <div className="px-4 pb-4 border-t border-border/50">
                    {b.brief_content && <p className="text-sm text-muted-foreground leading-relaxed mt-3 mb-3">{b.brief_content}</p>}
                    {b.target_keywords?.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Target Keywords</div>
                        <div className="flex flex-wrap gap-1.5">
                          {b.target_keywords.map((k: string, i: number) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{k}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {b.llm_optimization?.answer_the_question && (
                      <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-3">
                        <div className="text-xs font-bold text-green-400 mb-1">LLM Optimisation Angle</div>
                        <p className="text-xs text-muted-foreground">{b.llm_optimization.answer_the_question}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!briefs.length && !loading && (
              <div className="text-center py-16 text-sm text-muted-foreground">
                Enter a keyword above to generate your first AI content brief.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
