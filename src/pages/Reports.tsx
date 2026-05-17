import React, { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";
import { useProject } from "@/contexts/ProjectContext";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: a, ...b }),
  }).then(r => r.json()).catch(() => ({}));

export default function Reports() {
  const { selectedProjectId: projectId } = useProject();
  const [reports,   setReports]   = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [generating,setGenerating]= useState(false);

  useEffect(() => {
    post("get_reports", { projectId }).then(r => {
      setReports((r as any).reports || []);
      setLoading(false);
    });
  }, [projectId]);

  const generate = () => {
    setGenerating(true);
    post("generate_report", { projectId, reportType: "monthly" }).then(r => {
      if ((r as any).report) setReports(p => [(r as any).report, ...p]);
      setGenerating(false);
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">Auto-generated client reports</p>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {generating ? "Generating..." : "+ Generate Report"}
          </button>
        </div>
        {loading ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            Loading reports...
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r: any, i: number) => (
              <div key={r.id || i} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm">{r.title || `Report ${i + 1}`}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {r.created_at?.slice(0, 10) || "Recent"}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                    Ready
                  </span>
                </div>
                {r.summary && (
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{r.summary}</p>
                )}
              </div>
            ))}
            {!reports.length && (
              <div className="text-center py-16 text-sm text-muted-foreground">
                No reports yet. Click Generate Report to create your first one.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
