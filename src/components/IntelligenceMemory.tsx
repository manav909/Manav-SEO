/* ═══════════════════════════════════════════════════════════
   IntelligenceMemory.tsx — Brain's persistent memory panel.

   Shows every AI analysis ever generated for the selected project,
   with confidence scores, sources, and a feedback loop.

   Also surfaces:
     • Pending hard-data update proposals (need user approval)
     • Open contradictions detected between outputs
     • Deep Learn trigger
═══════════════════════════════════════════════════════════ */
import React, { useEffect, useState, useCallback } from "react";
import { Brain, AlertTriangle, CheckCircle2, XCircle, Eye, GitBranch, RefreshCw, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { confidenceColor, confidenceLabel, SOURCE_LABEL, type SourceUsage } from "@/lib/intelligenceFabric";

interface IntelligenceOutput {
  id: string;
  analysis_type: string;
  title: string;
  summary: string;
  weighted_confidence: number;
  sources_used: SourceUsage[];
  source_breakdown?: Record<string, number>;
  model_used?: string;
  status: string;
  generated_at: string;
  viewed_at?: string;
}

interface Proposal {
  id: string;
  field_path: string;
  field_category: string;
  current_value?: string;
  proposed_value: string;
  proposed_by: string;
  proposer_confidence: number;
  reasoning?: string;
  created_at: string;
}

interface Contradiction {
  id: string;
  contradiction_summary: string;
  severity: string;
  created_at: string;
}

interface Props {
  projectId: string | null;
  onAskBrain?: (prompt: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
  persona:                 "Market Persona",
  market_research:         "Market Research",
  cross_project_patterns:  "Industry Patterns",
  goal_plan:               "Goal Plan",
  audit:                   "Audit",
  strategy:                "Strategy",
  pipeline:                "Pipeline",
  deep_dive:               "Deep Dive",
  brain_assistant:         "Brain Chat",
  deep_learn:              "Deep Learn Report",
};

const TYPE_COLOR: Record<string, string> = {
  persona: "#a78bfa", market_research: "#06b6d4", cross_project_patterns: "#34d399",
  goal_plan: "#fbbf24", audit: "#f97316", strategy: "#6366f1",
  pipeline: "#06b6d4", deep_dive: "#a78bfa", brain_assistant: "#94a3b8",
  deep_learn: "#10b981",
};

export function IntelligenceMemory({ projectId, onAskBrain }: Props) {
  const [outputs, setOutputs]               = useState<IntelligenceOutput[]>([]);
  const [proposals, setProposals]           = useState<Proposal[]>([]);
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [loading, setLoading]               = useState(false);
  const [expandedId, setExpandedId]         = useState<string | null>(null);
  const [filter, setFilter]                 = useState<string>("all");
  const [error, setError]                   = useState<string>("");
  const [deepLearning, setDeepLearning]     = useState(false);
  const [deepLearnReport, setDeepLearnReport] = useState<any>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/intelligence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_intelligence", projectId }),
      });
      const data = await res.json();
      if (data?.error) { setError(data.error); return; }
      setOutputs(data.outputs || []);
      setProposals(data.pendingProposals || []);
      setContradictions(data.contradictions || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const resolveProposal = async (id: string, decision: "approved" | "rejected") => {
    if (!projectId) return;
    try {
      await fetch("/api/intelligence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_proposal", id, decision, reviewer: "user", projectId }),
      });
      await load();
    } catch (_e) {}
  };

  const runDeepLearn = async () => {
    if (!projectId) return;
    setDeepLearning(true); setError(""); setDeepLearnReport(null);
    try {
      const res = await fetch("/api/intelligence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deep_learn", projectId }),
      });
      const data = await res.json();
      if (data?.error) { setError(data.error); return; }
      setDeepLearnReport(data.report);
      await load();
    } catch (e: any) { setError(e?.message || "Deep-learn failed"); }
    finally { setDeepLearning(false); }
  };

  const filtered = filter === "all" ? outputs : outputs.filter(o => o.analysis_type === filter);
  const types = Array.from(new Set(outputs.map(o => o.analysis_type)));

  if (!projectId) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)", fontFamily: "monospace", fontSize: 11 }}>
        Select a project to view Intelligence Memory.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ─── Header bar ─── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px",
                    background: "linear-gradient(90deg, rgba(99,102,241,0.08), rgba(6,182,212,0.04))",
                    border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Brain size={16} color="#a5b4fc" />
          <span style={{ fontSize: 11, color: "#a5b4fc", letterSpacing: "0.1em", fontWeight: 700, fontFamily: "monospace" }}>
            INTELLIGENCE MEMORY · {outputs.length} OUTPUTS
          </span>
          {proposals.length > 0 && (
            <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.35)", color: "#fbbf24", fontFamily: "monospace" }}>
              {proposals.length} pending approval{proposals.length > 1 ? "s" : ""}
            </span>
          )}
          {contradictions.length > 0 && (
            <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444", fontFamily: "monospace" }}>
              {contradictions.length} contradiction{contradictions.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={load} disabled={loading} style={btnSecondary}>
            <RefreshCw size={11} style={{ marginRight: 4, animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
          <button onClick={runDeepLearn} disabled={deepLearning || outputs.length < 2} style={btnPrimary}>
            <Sparkles size={11} style={{ marginRight: 4 }} />
            {deepLearning ? "Learning…" : "Deep Learn"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 10, color: "#fca5a5" }}>
          {error}
        </div>
      )}

      {/* ─── Pending proposals (hard-data approval) ─── */}
      {proposals.length > 0 && (
        <div style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 10, color: "#fbbf24", letterSpacing: "0.1em", marginBottom: 8, fontFamily: "monospace", fontWeight: 700 }}>
            ⚠ HARD-DATA UPDATES AWAITING YOUR APPROVAL
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {proposals.map(p => (
              <div key={p.id} style={{ padding: 10, background: "rgba(0,0,0,0.25)", borderRadius: 8, border: "1px solid rgba(245,158,11,0.18)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "#fff", fontFamily: "monospace", marginBottom: 2 }}>
                      <span style={{ color: "#fbbf24" }}>{p.field_path}</span>
                      <span style={{ marginLeft: 8, fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>{p.field_category}</span>
                    </div>
                    {p.current_value && (
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>
                        Current: <span style={{ textDecoration: "line-through" }}>{p.current_value.slice(0, 120)}</span>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#10b981", marginBottom: 4 }}>
                      → {p.proposed_value.slice(0, 200)}
                    </div>
                    {p.reasoning && (
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>{p.reasoning}</div>
                    )}
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 4, fontFamily: "monospace" }}>
                      proposed by <span style={{ color: "#a5b4fc" }}>{p.proposed_by}</span> · confidence {p.proposer_confidence}/100
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => resolveProposal(p.id, "approved")} style={{ ...btnApprove, fontSize: 10 }}>
                      <CheckCircle2 size={11} style={{ marginRight: 4 }} />Approve
                    </button>
                    <button onClick={() => resolveProposal(p.id, "rejected")} style={{ ...btnReject, fontSize: 10 }}>
                      <XCircle size={11} style={{ marginRight: 4 }} />Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Contradictions ─── */}
      {contradictions.length > 0 && (
        <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 10, color: "#fca5a5", letterSpacing: "0.1em", marginBottom: 8, fontFamily: "monospace", fontWeight: 700 }}>
            ⚡ CONTRADICTIONS BETWEEN ANALYSES
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {contradictions.map(c => (
              <div key={c.id} style={{ padding: "8px 10px", background: "rgba(0,0,0,0.25)", borderRadius: 6, fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
                <span style={{ padding: "1px 5px", borderRadius: 3, background: c.severity === "high" ? "rgba(239,68,68,0.25)" : c.severity === "medium" ? "rgba(245,158,11,0.18)" : "rgba(99,102,241,0.18)", color: "#fff", fontSize: 8, marginRight: 6, fontFamily: "monospace" }}>{c.severity}</span>
                {c.contradiction_summary}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Deep Learn Report ─── */}
      {deepLearnReport && (
        <DeepLearnReport report={deepLearnReport} onAskBrain={onAskBrain} onClose={() => setDeepLearnReport(null)} />
      )}

      {/* ─── Type filter chips ─── */}
      {types.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <button onClick={() => setFilter("all")} style={filter === "all" ? chipActive : chipInactive}>
            All ({outputs.length})
          </button>
          {types.map(t => (
            <button key={t} onClick={() => setFilter(t)} style={filter === t ? { ...chipActive, color: TYPE_COLOR[t] || "#fff" } : chipInactive}>
              {TYPE_LABEL[t] || t} ({outputs.filter(o => o.analysis_type === t).length})
            </button>
          ))}
        </div>
      )}

      {/* ─── Output list ─── */}
      {filtered.length === 0 && !loading && (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)", fontFamily: "monospace", fontSize: 11 }}>
          No analyses saved yet for this project. Run a persona, audit, or Brain chat — outputs save automatically.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map(o => (
          <OutputRow
            key={o.id}
            o={o}
            expanded={expandedId === o.id}
            onToggle={() => setExpandedId(expandedId === o.id ? null : o.id)}
            onAskBrain={onAskBrain}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── Output row ─────────────────────── */
function OutputRow({ o, expanded, onToggle, onAskBrain }: {
  o: IntelligenceOutput; expanded: boolean; onToggle: () => void; onAskBrain?: (p: string) => void;
}) {
  const typeColor = TYPE_COLOR[o.analysis_type] || "#94a3b8";
  const typeLabel = TYPE_LABEL[o.analysis_type] || o.analysis_type;
  const confColor = confidenceColor(o.weighted_confidence || 0);
  const sources = (o.sources_used || []) as SourceUsage[];

  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
      <button onClick={onToggle} style={{ width: "100%", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10, color: "#fff" }}>
        {expanded ? <ChevronDown size={12} color="rgba(255,255,255,0.4)" /> : <ChevronRight size={12} color="rgba(255,255,255,0.4)" />}
        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: `${typeColor}22`, color: typeColor, fontFamily: "monospace", flexShrink: 0 }}>
          {typeLabel}
        </span>
        <span style={{ flex: 1, fontSize: 11, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {o.title || o.summary?.slice(0, 80) || o.id}
        </span>
        <ConfidenceBadge value={o.weighted_confidence || 0} />
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", flexShrink: 0 }}>
          {o.generated_at?.split("T")[0]}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: "0 12px 12px 30px", display: "flex", flexDirection: "column", gap: 8 }}>
          {o.summary && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>{o.summary}</div>
          )}
          {sources.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontFamily: "monospace" }}>SOURCES (weighted confidence: {o.weighted_confidence}/100)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {sources.map((s, i) => (
                  <div key={i} title={`Source: ${s.source} · Weight: ${s.weight || 1}`} style={{
                    fontSize: 9, padding: "3px 7px", borderRadius: 4, fontFamily: "monospace",
                    background: `${confidenceColor(s.confidence)}18`,
                    border: `1px solid ${confidenceColor(s.confidence)}33`,
                    color: confidenceColor(s.confidence),
                  }}>
                    {s.label || SOURCE_LABEL[s.source]} · {s.confidence}
                  </div>
                ))}
              </div>
            </div>
          )}
          {onAskBrain && (
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button onClick={() => onAskBrain(`Summarize this prior ${typeLabel} for me: "${o.title}". What's the most important thing I should know from it?`)} style={btnGhost}>
                <Eye size={10} style={{ marginRight: 4 }} />Ask Brain to recap
              </button>
              <button onClick={() => onAskBrain(`What's changed in the project since this ${typeLabel} from ${o.generated_at?.split("T")[0]}: "${o.title}"? Should we still rely on it or regenerate?`)} style={btnGhost}>
                <GitBranch size={10} style={{ marginRight: 4 }} />Compare to now
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Confidence badge ─────────────────────── */
export function ConfidenceBadge({ value, label }: { value: number; label?: string }) {
  const c = confidenceColor(value);
  return (
    <span style={{
      fontSize: 9, padding: "2px 7px", borderRadius: 4, fontFamily: "monospace", fontWeight: 600,
      background: `${c}1f`, border: `1px solid ${c}40`, color: c, flexShrink: 0,
    }}>
      {label || confidenceLabel(value)} · {value}
    </span>
  );
}

/* ─────────────────────── Deep Learn report block ─────────────────────── */
function DeepLearnReport({ report, onAskBrain, onClose }: { report: any; onAskBrain?: (p: string) => void; onClose: () => void }) {
  const health = report.overall_brain_health || {};
  return (
    <div style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.07), rgba(99,102,241,0.04))", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#10b981", letterSpacing: "0.1em", fontFamily: "monospace", fontWeight: 700 }}>
          ✨ DEEP LEARN REPORT
        </div>
        <button onClick={onClose} style={btnGhost}>Close</button>
      </div>

      {/* Brain Health */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
        <HealthMetric label="Consistency" value={health.consistency_score} />
        <HealthMetric label="Data Richness" value={health.data_richness_score} />
        <HealthMetric label="Learning Velocity" value={health.learning_velocity || "—"} string />
      </div>

      {health.next_recommended_action && (
        <div style={{ padding: 10, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginBottom: 3, fontFamily: "monospace" }}>NEXT RECOMMENDED ACTION</div>
          <div style={{ fontSize: 12, color: "#fff" }}>{health.next_recommended_action}</div>
          {onAskBrain && (
            <button onClick={() => onAskBrain(`Help me execute this: ${health.next_recommended_action}`)} style={{ ...btnPrimary, marginTop: 6 }}>
              Ask Brain to execute →
            </button>
          )}
        </div>
      )}

      {(report.consistent_patterns || []).length > 0 && (
        <ReportSection title={`Consistent Patterns (${report.consistent_patterns.length})`}>
          {report.consistent_patterns.map((p: any, i: number) => (
            <div key={i} style={reportRow}>
              <ConfidenceBadge value={p.confidence || 80} />
              <div style={{ flex: 1, fontSize: 11, color: "rgba(255,255,255,0.85)" }}>{p.pattern}</div>
              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>{(p.supported_by_outputs || []).join(", ")}</span>
            </div>
          ))}
        </ReportSection>
      )}

      {(report.new_emergent_insights || []).length > 0 && (
        <ReportSection title={`New Emergent Insights (${report.new_emergent_insights.length})`}>
          {report.new_emergent_insights.map((p: any, i: number) => (
            <div key={i} style={reportRow}>
              <ConfidenceBadge value={p.confidence || 70} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#fff", fontWeight: 600 }}>{p.title}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{p.reasoning}</div>
              </div>
            </div>
          ))}
        </ReportSection>
      )}

      {(report.hard_data_gaps_blocking_better_analysis || []).length > 0 && (
        <ReportSection title={`Hard Data Gaps Blocking Better Analysis (${report.hard_data_gaps_blocking_better_analysis.length})`}>
          {report.hard_data_gaps_blocking_better_analysis.map((p: any, i: number) => (
            <div key={i} style={reportRow}>
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: p.priority === "high" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.15)", color: p.priority === "high" ? "#ef4444" : "#fbbf24", fontFamily: "monospace" }}>{p.priority || "med"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#fbbf24", fontFamily: "monospace" }}>{p.field}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{p.why_it_blocks}</div>
              </div>
            </div>
          ))}
        </ReportSection>
      )}

      {(report.contradictions || []).length > 0 && (
        <ReportSection title={`Detected Contradictions (${report.contradictions.length})`}>
          {report.contradictions.map((c: any, i: number) => (
            <div key={i} style={reportRow}>
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: c.severity === "high" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.15)", color: c.severity === "high" ? "#ef4444" : "#fbbf24", fontFamily: "monospace" }}>{c.severity}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>{c.summary}</div>
                {c.resolution && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>→ {c.resolution}</div>}
              </div>
            </div>
          ))}
        </ReportSection>
      )}
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 6, fontFamily: "monospace", letterSpacing: "0.08em" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}

function HealthMetric({ label, value, string = false }: { label: string; value: any; string?: boolean }) {
  const v = string ? value : (typeof value === "number" ? value : 0);
  const c = string ? "#a5b4fc" : confidenceColor(v);
  return (
    <div style={{ padding: 10, background: "rgba(0,0,0,0.25)", borderRadius: 8, border: `1px solid ${c}33` }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontFamily: "monospace" }}>{label}</div>
      <div style={{ fontSize: string ? 14 : 18, color: c, fontFamily: "monospace", fontWeight: 700 }}>
        {string ? value : `${v}/100`}
      </div>
    </div>
  );
}

/* ─────────────────────── Styles ─────────────────────── */
const btnPrimary: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 6, background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.35)",
  color: "#a5b4fc", fontSize: 10, fontFamily: "monospace", cursor: "pointer", display: "inline-flex", alignItems: "center",
};
const btnSecondary: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: "monospace", cursor: "pointer", display: "inline-flex", alignItems: "center",
};
const btnApprove: React.CSSProperties = {
  padding: "4px 8px", borderRadius: 6, background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.4)",
  color: "#10b981", fontFamily: "monospace", cursor: "pointer", display: "inline-flex", alignItems: "center",
};
const btnReject: React.CSSProperties = {
  padding: "4px 8px", borderRadius: 6, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)",
  color: "#ef4444", fontFamily: "monospace", cursor: "pointer", display: "inline-flex", alignItems: "center",
};
const btnGhost: React.CSSProperties = {
  padding: "3px 7px", borderRadius: 5, background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.55)", fontSize: 9, fontFamily: "monospace", cursor: "pointer", display: "inline-flex", alignItems: "center",
};
const chipActive: React.CSSProperties = {
  padding: "3px 9px", borderRadius: 12, background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.4)",
  color: "#a5b4fc", fontSize: 9, fontFamily: "monospace", cursor: "pointer",
};
const chipInactive: React.CSSProperties = {
  padding: "3px 9px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.45)", fontSize: 9, fontFamily: "monospace", cursor: "pointer",
};
const reportRow: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 6,
};
