/**
 * ◈ BUILD — Claude Bridge Live Dashboard
 *
 * Realtime feed of Claude Code ↔ Claude Chat messages via /api/bridge.
 * Auto-refreshes every 20s. No auth gate — internal tool.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  RefreshCw, ChevronDown, ChevronUp, Terminal, MessageSquare,
  GitCommit, Activity, Clock, CheckCircle2,
  Loader2, Zap, Brain, Radio, Code2,
} from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/* ═══════════════════════════════════════════════════════════
   Types
═══════════════════════════════════════════════════════════ */

interface BridgeMessage {
  id:          string;
  kind:        string;
  title:       string | null;
  body:        string;
  metadata:    Record<string, any>;
  created_by:  string;
  in_reply_to: string | null;
  read_at:     string | null;
  read_by:     string | null;
  created_at:  string;
}

interface SummaryState {
  activeModule:    string;
  activeModuleNum: number;
  activeTask:      string;
  lastActivity:    string;
  totalMessages:   number;
  pending:         number;
  done:            number;
  blocked:         number;
  lastCommit:      string;
  tsHealth:        "clean" | "errors" | "unknown";
  moduleProgress:  ModuleStatus[];
}

interface ModuleStatus {
  num:    number;
  name:   string;
  status: "pending" | "in_progress" | "done" | "blocked" | "not_started";
}

/* ═══════════════════════════════════════════════════════════
   Constants
═══════════════════════════════════════════════════════════ */

const BRIDGE_READ_TOKEN = import.meta.env.VITE_BRIDGE_READ_TOKEN as string | undefined;

const MODULES: { num: number; name: string }[] = [
  { num:  1, name: "Foundation & Auth" },
  { num:  2, name: "Data Infrastructure" },
  { num:  3, name: "Market Intelligence" },
  { num:  4, name: "SEO Analysis Engine" },
  { num:  5, name: "Content Pipeline" },
  { num:  6, name: "Competitor Tracking" },
  { num:  7, name: "Algorithm Monitor" },
  { num:  8, name: "Reporting & Insights" },
  { num:  9, name: "Client Portal" },
  { num: 10, name: "Automation Layer" },
  { num: 11, name: "Claude Bridge" },
  { num: 12, name: "Launch & Polish" },
];

const WHO_COLORS: Record<string, string> = {
  claude_code: "#818cf8", // indigo
  claude_chat: "#34d399", // emerald
  manav:       "#fb923c", // orange
  unknown:     "#94a3b8", // slate
};

const WHO_LABELS: Record<string, string> = {
  claude_code: "CLAUDE CODE",
  claude_chat: "CLAUDE CHAT",
  manav:       "MANAV",
  unknown:     "SYSTEM",
};

const KIND_BADGE: Record<string, { label: string; color: string }> = {
  instruction: { label: "instruction", color: "#6366f1" },
  response:    { label: "response",    color: "#10b981" },
  status:      { label: "status",      color: "#f59e0b" },
  dump:        { label: "brain_dump",  color: "#8b5cf6" },
  note:        { label: "note",        color: "#06b6d4" },
  message:     { label: "message",     color: "#64748b" },
  request:     { label: "request",     color: "#ec4899" },
};

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "pending",   color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  executing: { label: "executing", color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  done:      { label: "done",      color: "#4ade80", bg: "rgba(74,222,128,0.12)"  },
  blocked:   { label: "blocked",   color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

/* ═══════════════════════════════════════════════════════════
   Helpers
═══════════════════════════════════════════════════════════ */

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function resolveKind(kind: string): string {
  return KIND_BADGE[kind] ? kind : "message";
}

function buildSummary(messages: BridgeMessage[]): SummaryState {
  const sorted = [...messages].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Find latest module/task ref
  let activeModule    = "—";
  let activeModuleNum = 0;
  let activeTask      = "—";
  let lastCommit      = "—";
  let tsHealth: SummaryState["tsHealth"] = "unknown";

  for (const m of sorted) {
    const meta = m.metadata || {};
    if (activeModule === "—" && meta.module)     { activeModule = meta.module; }
    if (activeModuleNum === 0 && meta.module_num){ activeModuleNum = Number(meta.module_num); }
    if (activeTask === "—"   && meta.task)       { activeTask = meta.task; }
    if (lastCommit === "—"   && (meta.sha || meta.commit)) {
      lastCommit = meta.sha || meta.commit;
      if (meta.branch) lastCommit += ` (${meta.branch})`;
    }
    if (tsHealth === "unknown" && meta.ts_status) {
      tsHealth = meta.ts_status === "clean" ? "clean" : "errors";
    }
    if (activeModule !== "—" && activeTask !== "—" && lastCommit !== "—" && tsHealth !== "unknown") break;
  }

  // Counts
  const statuses = sorted.map(m => (m.metadata?.status as string) || "");
  const pending  = statuses.filter(s => s === "pending").length;
  const done     = statuses.filter(s => s === "done").length;
  const blocked  = statuses.filter(s => s === "blocked").length;

  // Module progress — scan all messages for module refs
  const moduleMap: Record<number, BridgeMessage["metadata"]["status"][]> = {};
  for (const m of messages) {
    const num = Number(m.metadata?.module_num);
    if (num >= 1 && num <= 12) {
      if (!moduleMap[num]) moduleMap[num] = [];
      moduleMap[num].push(m.metadata?.status);
    }
  }

  const moduleProgress: ModuleStatus[] = MODULES.map(mod => {
    const statuses = moduleMap[mod.num] || [];
    let status: ModuleStatus["status"] = "not_started";
    if (statuses.length > 0) {
      if (statuses.some(s => s === "blocked"))       status = "blocked";
      else if (statuses.some(s => s === "executing")) status = "in_progress";
      else if (statuses.every(s => s === "done"))     status = "done";
      else if (statuses.some(s => s === "done"))      status = "in_progress";
      else                                             status = "pending";
    }
    return { ...mod, status };
  });

  // Infer current module from latest message with module_num
  if (activeModuleNum === 0) {
    const withModule = sorted.find(m => m.metadata?.module_num);
    if (withModule) activeModuleNum = Number(withModule.metadata.module_num);
  }

  const doneModules = moduleProgress.filter(m => m.status === "done").length;
  const progressPct = Math.round((doneModules / 12) * 100);

  return {
    activeModule:    activeModule === "—" ? MODULES[(activeModuleNum || 11) - 1]?.name || "Claude Bridge" : activeModule,
    activeModuleNum: activeModuleNum || 11,
    activeTask,
    lastActivity:    sorted[0]?.created_at || new Date().toISOString(),
    totalMessages:   messages.length,
    pending,
    done,
    blocked,
    lastCommit,
    tsHealth,
    moduleProgress,
  };
}

/* ═══════════════════════════════════════════════════════════
   Sub-components
═══════════════════════════════════════════════════════════ */

function WhoChip({ creator }: { creator: string }) {
  const color = WHO_COLORS[creator] || WHO_COLORS.unknown;
  const label = WHO_LABELS[creator] || creator.toUpperCase();
  const isCode = creator === "claude_code";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold"
      style={{ color, background: `${color}18`, border: `1px solid ${color}40` }}
    >
      {isCode ? <Terminal size={9} /> : <MessageSquare size={9} />}
      {label}
    </span>
  );
}

function KindChip({ kind }: { kind: string }) {
  const k = resolveKind(kind);
  const cfg = KIND_BADGE[k] || KIND_BADGE.message;
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded text-[10px] font-mono"
      style={{ color: cfg.color, background: `${cfg.color}18`, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.label}
    </span>
  );
}

function StatusChip({ status }: { status?: string }) {
  if (!status) return null;
  const cfg = STATUS_BADGE[status];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded text-[10px] font-mono font-semibold"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.label}
    </span>
  );
}

function ModuleStatusDot({ status }: { status: ModuleStatus["status"] }) {
  const colors: Record<ModuleStatus["status"], string> = {
    done:        "#4ade80",
    in_progress: "#60a5fa",
    pending:     "#fbbf24",
    blocked:     "#f87171",
    not_started: "#334155",
  };
  return (
    <span
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: colors[status], boxShadow: status === "in_progress" ? `0 0 6px ${colors[status]}` : undefined }}
    />
  );
}

function MessageCard({ msg }: { msg: BridgeMessage }) {
  const [expanded, setExpanded] = useState(false);
  const meta = msg.metadata || {};
  const previewLen = 160;
  const body = msg.body || "";
  const preview = body.length > previewLen ? body.slice(0, previewLen) + "…" : body;

  return (
    <div
      className="rounded-lg border transition-all duration-200 overflow-hidden"
      style={{
        borderColor: expanded ? "rgba(129,140,248,0.3)" : "rgba(255,255,255,0.06)",
        background:  expanded ? "rgba(129,140,248,0.04)" : "rgba(255,255,255,0.02)",
      }}
    >
      {/* Header row */}
      <button
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          {/* Top meta row */}
          <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
            <WhoChip creator={msg.created_by} />
            <KindChip kind={msg.kind} />
            {meta.status && <StatusChip status={meta.status} />}
            {meta.module_num && (
              <span className="text-[10px] font-mono text-slate-500">
                M{String(meta.module_num).padStart(2, "0")}
                {meta.task ? ` · ${meta.task}` : ""}
              </span>
            )}
          </div>

          {/* Title */}
          {msg.title && (
            <p className="text-sm font-medium text-slate-200 mb-0.5 truncate">{msg.title}</p>
          )}

          {/* Preview */}
          {!expanded && (
            <p className="text-xs text-slate-500 font-mono leading-relaxed">{preview}</p>
          )}

          {/* Git / TS meta */}
          {(meta.sha || meta.ts_status) && (
            <div className="flex items-center gap-3 mt-1.5">
              {meta.sha && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-slate-600">
                  <GitCommit size={9} />
                  {meta.sha}{meta.branch ? ` (${meta.branch})` : ""}
                </span>
              )}
              {meta.ts_status && (
                <span
                  className="flex items-center gap-1 text-[10px] font-mono"
                  style={{ color: meta.ts_status === "clean" ? "#4ade80" : "#f87171" }}
                >
                  <Code2 size={9} />
                  TS: {meta.ts_status}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] text-slate-600 font-mono">{fmtTime(msg.created_at)}</span>
          <span className="text-[10px] text-slate-700 font-mono">{fmtRelative(msg.created_at)}</span>
          {expanded ? <ChevronUp size={12} className="text-slate-500 mt-1" /> : <ChevronDown size={12} className="text-slate-600 mt-1" />}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/[0.05]">
          <pre
            className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap break-words mt-3 max-h-[500px] overflow-y-auto"
            style={{ scrollbarWidth: "thin" }}
          >
            {body}
          </pre>

          {/* Rich metadata */}
          {Object.keys(meta).filter(k => !["status", "module_num", "task", "sha", "branch", "ts_status"].includes(k) && meta[k]).length > 0 && (
            <details className="mt-3">
              <summary className="text-[10px] font-mono text-slate-600 cursor-pointer hover:text-slate-400">metadata</summary>
              <pre className="text-[10px] font-mono text-slate-600 mt-1 leading-relaxed">
                {JSON.stringify(
                  Object.fromEntries(Object.entries(meta).filter(([k]) => !["sha", "branch"].includes(k))),
                  null, 2
                )}
              </pre>
            </details>
          )}

          <div className="flex items-center gap-2 mt-3">
            <span className="text-[10px] font-mono text-slate-700">{fmtDate(msg.created_at)}</span>
            {msg.read_at && (
              <span className="text-[10px] font-mono text-slate-700 flex items-center gap-1">
                <CheckCircle2 size={8} className="text-emerald-600" />
                read by {msg.read_by || "unknown"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main page
═══════════════════════════════════════════════════════════ */

export default function Build() {
  const [messages,    setMessages]    = useState<BridgeMessage[]>([]);
  const [summary,     setSummary]     = useState<SummaryState | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [lastFetch,   setLastFetch]   = useState<Date | null>(null);
  const [countdown,   setCountdown]   = useState(20);
  const [error,       setError]       = useState<string | null>(null);
  const [pulse,       setPulse]       = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Fetch ── */
  const fetchMessages = useCallback(async () => {
    if (!BRIDGE_READ_TOKEN) {
      setError("VITE_BRIDGE_READ_TOKEN not set in .env — build the .env file first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bridge?token=${encodeURIComponent(BRIDGE_READ_TOKEN)}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "list", limit: 200 }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages(data.messages || []);
        setSummary(buildSummary(data.messages || []));
        setPulse(true);
        setTimeout(() => setPulse(false), 600);
      } else {
        setError(data.error || "Unknown error from bridge");
      }
    } catch (e: any) {
      setError(e?.message || "Fetch failed");
    } finally {
      setLoading(false);
      setLastFetch(new Date());
      setCountdown(20);
    }
  }, []);

  /* ── Auto-refresh ── */
  useEffect(() => {
    fetchMessages();
    intervalRef.current = setInterval(fetchMessages, 20_000);
    cdRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (cdRef.current)       clearInterval(cdRef.current);
    };
  }, [fetchMessages]);

  /* ── Sorted messages (newest first) ── */
  const sorted = [...messages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const progressPct = summary
    ? Math.round((summary.moduleProgress.filter(m => m.status === "done").length / 12) * 100)
    : 0;

  /* ── Render ── */
  return (
    <div
      className="min-h-screen text-slate-100 font-sans"
      style={{ background: "linear-gradient(135deg, #090c14 0%, #0d1220 50%, #0a0f1a 100%)" }}
    >
      {/* ── Top bar ── */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 border-b"
        style={{ background: "rgba(9,12,20,0.92)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-indigo-400" style={{ animation: "pulse 2s infinite" }} />
            <span className="text-sm font-mono font-bold text-slate-200 tracking-wider">BRIDGE MONITOR</span>
          </div>
          <span className="text-[10px] font-mono text-slate-600">SEO SEASON / BUILD</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: error ? "#f87171" : "#4ade80", boxShadow: error ? undefined : "0 0 6px #4ade80" }}
            />
            <span className="text-[10px] font-mono text-slate-500">
              {error ? "ERR" : `LIVE · ${countdown}s`}
            </span>
          </div>

          {lastFetch && (
            <span className="text-[10px] font-mono text-slate-700">
              {fmtTime(lastFetch.toISOString())}
            </span>
          )}

          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px] font-mono border-white/10 text-slate-400 hover:text-slate-200 bg-transparent hover:bg-white/5"
            onClick={fetchMessages}
            disabled={loading}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            <span className="ml-1">refresh</span>
          </Button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mx-6 mt-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm font-mono">
          {error}
        </div>
      )}

      {/* ── Empire summary bar ── */}
      {summary && (
        <div
          className="mx-6 mt-4 rounded-xl border p-4"
          style={{ borderColor: "rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.04)" }}
        >
          <div className="flex items-start gap-8 flex-wrap">
            {/* Module */}
            <div>
              <div className="text-[10px] font-mono text-slate-600 mb-1 uppercase tracking-wider">Active Module</div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-mono px-1.5 py-0.5 rounded"
                  style={{ color: "#818cf8", background: "rgba(129,140,248,0.15)" }}
                >
                  {String(summary.activeModuleNum).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold text-slate-200">{summary.activeModule}</span>
              </div>
            </div>

            {/* Task */}
            <div>
              <div className="text-[10px] font-mono text-slate-600 mb-1 uppercase tracking-wider">Current Task</div>
              <div className="text-sm text-slate-300 font-mono">{summary.activeTask}</div>
            </div>

            {/* Last activity */}
            <div>
              <div className="text-[10px] font-mono text-slate-600 mb-1 uppercase tracking-wider">Last Activity</div>
              <div className="text-sm text-slate-300 font-mono flex items-center gap-1.5">
                <Clock size={11} className="text-slate-600" />
                {fmtRelative(summary.lastActivity)}
              </div>
            </div>

            {/* Progress */}
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono text-slate-600 uppercase tracking-wider">Empire Progress</span>
                <span className="text-[10px] font-mono text-indigo-400">{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-1.5" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="text-[10px] font-mono text-slate-700 mt-1">
                {summary.moduleProgress.filter(m => m.status === "done").length} / 12 modules complete
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Body: feed + sidebar ── */}
      <div className="flex gap-4 mx-6 mt-4 pb-8" style={{ minHeight: "calc(100vh - 260px)" }}>

        {/* ─── Feed (main) ─── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity size={13} className="text-indigo-400" />
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Message Feed</span>
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(129,140,248,0.15)", color: "#818cf8" }}
              >
                {sorted.length}
              </span>
            </div>
            {pulse && (
              <span className="text-[10px] font-mono text-emerald-500 flex items-center gap-1">
                <Zap size={9} />updated
              </span>
            )}
          </div>

          <div ref={feedRef} className="flex flex-col gap-2">
            {sorted.length === 0 && !loading && (
              <div className="rounded-lg border border-white/[0.04] p-8 text-center">
                <Brain size={24} className="text-slate-700 mx-auto mb-2" />
                <p className="text-sm font-mono text-slate-600">No messages yet.</p>
                <p className="text-xs font-mono text-slate-700 mt-1">Post via: npx tsx scripts/bridge.ts dump</p>
              </div>
            )}
            {sorted.map(msg => (
              <MessageCard key={msg.id} msg={msg} />
            ))}
          </div>
        </div>

        {/* ─── Sidebar ─── */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-3">

          {/* Stats */}
          {summary && (
            <div
              className="rounded-xl border p-4"
              style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
            >
              <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-3">Counts</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "total",   value: summary.totalMessages, color: "#94a3b8" },
                  { label: "pending", value: summary.pending,        color: "#fbbf24" },
                  { label: "done",    value: summary.done,           color: "#4ade80" },
                  { label: "blocked", value: summary.blocked,        color: "#f87171" },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <div className="text-xl font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[9px] font-mono text-slate-700 uppercase">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Git + TS */}
          {summary && (
            <div
              className="rounded-xl border p-4"
              style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
            >
              <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-3">Build Health</div>
              <div className="flex items-start gap-2 mb-2">
                <GitCommit size={11} className="text-slate-600 mt-0.5 flex-shrink-0" />
                <span className="text-[11px] font-mono text-slate-400 break-all">{summary.lastCommit}</span>
              </div>
              <div className="flex items-center gap-2">
                <Code2 size={11} className="text-slate-600 flex-shrink-0" />
                <span
                  className="text-[11px] font-mono"
                  style={{
                    color: summary.tsHealth === "clean" ? "#4ade80"
                         : summary.tsHealth === "errors" ? "#f87171"
                         : "#94a3b8",
                  }}
                >
                  TS: {summary.tsHealth}
                </span>
              </div>
            </div>
          )}

          {/* Module progress list */}
          {summary && (
            <div
              className="rounded-xl border p-4 flex-1"
              style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
            >
              <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-3">
                Modules
              </div>
              <div className="flex flex-col gap-2">
                {summary.moduleProgress.map(mod => (
                  <div key={mod.num} className="flex items-center gap-2">
                    <ModuleStatusDot status={mod.status} />
                    <span className="text-[10px] font-mono text-slate-600 w-5 flex-shrink-0">
                      {String(mod.num).padStart(2, "0")}
                    </span>
                    <span
                      className="text-[11px] font-mono truncate"
                      style={{
                        color: mod.status === "done"        ? "#4ade80"
                             : mod.status === "in_progress" ? "#60a5fa"
                             : mod.status === "blocked"     ? "#f87171"
                             : mod.status === "pending"     ? "#fbbf24"
                             : "#334155",
                      }}
                    >
                      {mod.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
