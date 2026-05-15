/* ═══════════════════════════════════════════════════════════
   src/pages/Build.tsx — King's Command Dashboard
   Fully responsive: mobile / tablet / desktop / ultrawide
═══════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  RefreshCw, Loader2, Crown, Radio, Terminal, MessageSquare,
  ChevronDown, ChevronUp, GitCommit, Code2,
  DollarSign, Activity, Pause, Play,
  Clock, X, Layers, BarChart2, CheckSquare,
} from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase";

/* ═══════════════════════════════════════════════════════════
   ENV
═══════════════════════════════════════════════════════════ */

const BRIDGE_TOKEN  = import.meta.env.VITE_BRIDGE_READ_TOKEN  as string | undefined;
const BRIDGE_SECRET = import.meta.env.VITE_BRIDGE_SECRET      as string | undefined;
const BRIDGE_URL    = "/api/bridge";

/* ═══════════════════════════════════════════════════════════
   Types
═══════════════════════════════════════════════════════════ */

type ModStatus  = "pending" | "building" | "testing" | "done" | "blocked" | "paused";
type Breakpoint = "mobile" | "tablet" | "desktop" | "ultrawide";
type ActiveTab  = "modules" | "active" | "log" | "usage";

interface BridgeMsg {
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

interface UsageStats {
  total_messages:  number;
  completed_today: number;
  tokens_today:    number;
  cost_today_usd:  number;
  blocked_today:   number;
  month_cost_usd:  number | null;
}

interface CostData {
  today_usd:   number;
  month_usd:   number;
  month_tasks: number;
}

interface HealthState {
  ts:     "clean" | "errors" | "unknown";
  git:    "synced" | "stale" | "unknown";
  db:     "ok" | "error" | "unknown";
  build:  "ok" | "stale" | "unknown";
  ts_sha: string;
}

interface ModuleTask {
  name:   string;
  status: ModStatus;
  latest: BridgeMsg | null;
}

/* ═══════════════════════════════════════════════════════════
   Responsive hook
═══════════════════════════════════════════════════════════ */

function getBreakpoint(w: number): Breakpoint {
  if (w < 768)  return "mobile";
  if (w < 1280) return "tablet";
  if (w < 1920) return "desktop";
  return "ultrawide";
}

function useScreenSize() {
  const [size, setSize] = useState({
    width:      typeof window !== "undefined" ? window.innerWidth  : 1280,
    height:     typeof window !== "undefined" ? window.innerHeight : 800,
    breakpoint: getBreakpoint(typeof window !== "undefined" ? window.innerWidth : 1280) as Breakpoint,
  });
  useEffect(() => {
    const handle = () => setSize({
      width:      window.innerWidth,
      height:     window.innerHeight,
      breakpoint: getBreakpoint(window.innerWidth),
    });
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);
  return size;
}

/* ═══════════════════════════════════════════════════════════
   Constants
═══════════════════════════════════════════════════════════ */

const MODULES: { num: number; name: string }[] = [
  { num:  1, name: "Foundation Hardening"      },
  { num:  2, name: "The Closed Loop"           },
  { num:  3, name: "The Visual Empire"         },
  { num:  4, name: "The Automation Layer"      },
  { num:  5, name: "The Language Layer"        },
  { num:  6, name: "The Conversation Layer"    },
  { num:  7, name: "The Client Layer"          },
  { num:  8, name: "The Attribution Engine"    },
  { num:  9, name: "Cross-Empire Intelligence" },
  { num: 10, name: "The Role System"           },
  { num: 11, name: "Revenue and Proof"         },
  { num: 12, name: "The Scale Layer"           },
];

const SESSION_TOKEN_BUDGET = 100_000;

/* ═══════════════════════════════════════════════════════════
   Palette
═══════════════════════════════════════════════════════════ */

const C = {
  bg:     "#0a0a0f",
  card:   "#12121a",
  border: "#1e1e2e",
  text:   "#e2e2e8",
  muted:  "#6b6b80",
  green:  "#22c55e",
  blue:   "#3b82f6",
  yellow: "#eab308",
  red:    "#ef4444",
  orange: "#f97316",
  gray:   "#4b5563",
  purple: "#a855f7",
  cyan:   "#06b6d4",
  indigo: "#6366f1",
  teal:   "#14b8a6",
};

const MOD_STATUS_CFG: Record<ModStatus, { icon: string; color: string; label: string }> = {
  pending:  { icon: "⬜", color: C.gray,   label: "PENDING"  },
  building: { icon: "⚡", color: C.blue,   label: "BUILDING" },
  testing:  { icon: "🔬", color: C.yellow, label: "TESTING"  },
  done:     { icon: "✅", color: C.green,  label: "DONE"     },
  blocked:  { icon: "🚫", color: C.red,    label: "BLOCKED"  },
  paused:   { icon: "⏸",  color: C.orange, label: "PAUSED"   },
};

const WHO_CFG: Record<string, { color: string; label: string }> = {
  claude_chat: { color: C.purple, label: "CLAUDE CHAT" },
  claude_code: { color: C.cyan,   label: "CLAUDE CODE" },
  manav:       { color: C.orange, label: "MANAV"       },
  unknown:     { color: C.gray,   label: "SYSTEM"      },
};

const KIND_CFG: Record<string, { color: string; label: string }> = {
  instruction: { color: C.indigo,  label: "instruction" },
  response:    { color: C.teal,    label: "response"    },
  status:      { color: C.gray,    label: "status"      },
  dump:        { color: "#374151", label: "brain_dump"  },
  note:        { color: C.cyan,    label: "note"        },
  request:     { color: C.orange,  label: "question"    },
  message:     { color: C.gray,    label: "message"     },
};

const STATUS_BADGE_CFG: Record<string, { color: string; bg: string; label: string }> = {
  pending:   { color: C.yellow, bg: "rgba(234,179,8,0.12)",   label: "pending"   },
  executing: { color: C.blue,   bg: "rgba(59,130,246,0.12)",  label: "executing" },
  done:      { color: C.green,  bg: "rgba(34,197,94,0.12)",   label: "done"      },
  blocked:   { color: C.red,    bg: "rgba(239,68,68,0.12)",   label: "blocked"   },
  paused:    { color: C.orange, bg: "rgba(249,115,22,0.12)",  label: "paused"    },
  info:      { color: C.muted,  bg: "rgba(107,107,128,0.12)", label: "info"      },
};

/* ═══════════════════════════════════════════════════════════
   Helpers
═══════════════════════════════════════════════════════════ */

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function fmtRelative(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function resolveKind(k: string) {
  return KIND_CFG[k] ? k : "message";
}

function deriveModuleStatus(msgs: BridgeMsg[]): ModStatus {
  if (!msgs.length) return "pending";
  const latest = msgs[0];
  const meta   = latest.metadata || {};
  const status = (meta.status as string) || "";
  const kind   = latest.kind;
  const body   = (latest.body || "").toLowerCase();

  if (status === "blocked") return "blocked";
  if (status === "paused")  return "paused";
  if (kind === "instruction" && (status === "pending" || status === "executing" || !status)) return "building";
  if (kind === "response" && status === "done") {
    if (meta.tsc_clean || meta.ts_status === "clean") return "testing";
    if (body.includes("tested") || body.includes("verified") || body.includes("tsc: clean")) return "done";
    return "testing";
  }
  if (kind === "status") {
    if (body.includes("tested") || body.includes("verified") || body.includes("complete")) return "done";
    if (body.includes("paused"))  return "paused";
    if (body.includes("blocked")) return "blocked";
    if (body.includes("resumed") || body.includes("building")) return "building";
    if (status === "done") return "done";
  }
  return "pending";
}

function buildModuleMap(messages: BridgeMsg[]): Record<number, BridgeMsg[]> {
  const map: Record<number, BridgeMsg[]> = {};
  for (const m of messages) {
    const num = Number(m.metadata?.module_num);
    if (num >= 1 && num <= 12) {
      if (!map[num]) map[num] = [];
      map[num].push(m);
    }
  }
  for (const k of Object.keys(map)) {
    map[Number(k)].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  return map;
}

function extractModuleTasks(msgs: BridgeMsg[]): ModuleTask[] {
  const taskMap: Record<string, BridgeMsg[]> = {};
  for (const m of msgs) {
    const task = (m.metadata?.task as string) || "";
    if (task) {
      if (!taskMap[task]) taskMap[task] = [];
      taskMap[task].push(m);
    }
  }
  return Object.entries(taskMap).map(([name, tmsgs]) => {
    const sorted = [...tmsgs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { name, status: deriveModuleStatus(sorted), latest: sorted[0] || null };
  });
}

function findActiveTask(messages: BridgeMsg[]): BridgeMsg | null {
  const sorted = [...messages].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const blocked   = sorted.find(m => m.metadata?.status === "blocked");
  if (blocked) return blocked;
  const executing = sorted.find(m => m.metadata?.status === "executing" || m.metadata?.status === "pending");
  if (executing) return executing;
  return sorted[0] || null;
}

/* ═══════════════════════════════════════════════════════════
   API
═══════════════════════════════════════════════════════════ */

async function bridgeCall(action: string, payload: Record<string, any> = {}, useWrite = false): Promise<any> {
  const token = useWrite ? BRIDGE_SECRET : BRIDGE_TOKEN;
  if (!token) return { error: "No token configured" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (useWrite) headers["Authorization"] = `Bearer ${token}`;
  const url = useWrite
    ? BRIDGE_URL
    : `${BRIDGE_URL}?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ action, ...payload }) });
    return res.json();
  } catch (e: any) {
    return { error: e?.message || "fetch failed" };
  }
}

/* ═══════════════════════════════════════════════════════════
   Handoff doc generator
═══════════════════════════════════════════════════════════ */

function generateHandoff(messages: BridgeMsg[], modMap: Record<number, BridgeMsg[]>): string {
  const now  = new Date().toISOString();
  const done = MODULES.filter(m => deriveModuleStatus(modMap[m.num] || []) === "done").length;
  const lines: string[] = [
    `# SEO SEASON — EMPIRE BUILD HANDOFF`,
    `Generated: ${now}`,
    ``,
    `## Module Status (${done}/12 complete)`,
    ``,
  ];
  for (const mod of MODULES) {
    const s   = deriveModuleStatus(modMap[mod.num] || []);
    const cfg = MOD_STATUS_CFG[s];
    lines.push(`${cfg.icon} MODULE ${String(mod.num).padStart(2, "0")} — ${mod.name} [${cfg.label}]`);
  }
  const recent = [...messages]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);
  if (recent.length) {
    lines.push(``, `## Recent Messages`, ``);
    for (const m of recent) {
      lines.push(
        `[${m.created_by}] [${m.kind}] ${m.title || "(no title)"} — ${fmtRelative(m.created_at)}`,
        m.body ? m.body.slice(0, 200) + (m.body.length > 200 ? "…" : "") : "",
        ``,
      );
    }
  }
  const active = findActiveTask(messages);
  if (active) {
    lines.push(
      `## Active Task`, ``,
      `Module: ${active.metadata?.module_num ?? "?"} · Task: ${active.metadata?.task ?? "?"}`,
      active.body?.slice(0, 400) || "(no body)", ``,
    );
  }
  lines.push(
    `## Pending Modules`, ``,
    ...MODULES
      .filter(m => deriveModuleStatus(modMap[m.num] || []) === "pending")
      .map(m => `• MODULE ${String(m.num).padStart(2, "0")} — ${m.name}`),
    ``, `---`,
    `Paste this into a new Claude Chat session to continue the build.`,
  );
  return lines.join("\n");
}

/* ═══════════════════════════════════════════════════════════
   Sub-components
═══════════════════════════════════════════════════════════ */

function StatusBadge({ status }: { status: string }) {
  const cfg = (STATUS_BADGE_CFG as any)[status] || { color: C.gray, bg: "rgba(75,85,99,0.15)", label: status };
  return (
    <span
      className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}30` }}
    >
      {cfg.label}
    </span>
  );
}

function ModuleRow({
  mod, msgs, expanded, onToggle, compact = false,
}: {
  mod:      typeof MODULES[0];
  msgs:     BridgeMsg[];
  expanded: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  const status     = deriveModuleStatus(msgs);
  const cfg        = MOD_STATUS_CFG[status];
  const latest     = msgs[0] || null;
  const tasks      = extractModuleTasks(msgs);
  const isBuilding = status === "building";

  return (
    <div
      className="rounded-lg border transition-all overflow-hidden"
      style={{
        borderColor: expanded ? `${cfg.color}40` : C.border,
        background:  expanded ? `${cfg.color}08` : "transparent",
        boxShadow:   status === "blocked" ? `0 0 8px ${C.red}30` : undefined,
      }}
    >
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        <span
          className="text-sm flex-shrink-0"
          style={{
            filter:    isBuilding ? "drop-shadow(0 0 4px #3b82f6)" : undefined,
            animation: isBuilding ? "pulse 1.5s ease-in-out infinite" : undefined,
          }}
        >
          {cfg.icon}
        </span>

        <div className="flex-1 min-w-0">
          {!compact && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-600">
                MODULE {String(mod.num).padStart(2, "0")}
              </span>
              <span
                className="text-[9px] font-mono font-bold px-1 rounded"
                style={{ color: cfg.color, background: `${cfg.color}18` }}
              >
                {cfg.label}
              </span>
            </div>
          )}
          <div className="text-xs font-medium truncate" style={{ color: C.text }}>
            {compact ? `${String(mod.num).padStart(2,"0")}. ${mod.name}` : mod.name}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {latest && !compact && (
            <span className="text-[9px] font-mono" style={{ color: C.muted }}>
              {fmtRelative(latest.created_at)}
            </span>
          )}
          {expanded
            ? <ChevronUp  size={11} style={{ color: C.muted }} />
            : <ChevronDown size={11} style={{ color: C.muted }} />
          }
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t" style={{ borderColor: `${cfg.color}20` }}>
          {tasks.length > 0 && (
            <div className="mt-2 mb-3">
              <div className="text-[9px] font-mono uppercase mb-1.5" style={{ color: C.muted }}>Tasks</div>
              <div className="flex flex-col gap-1">
                {tasks.map(t => {
                  const tc = MOD_STATUS_CFG[t.status];
                  return (
                    <div key={t.name} className="flex items-center gap-2">
                      <span className="text-xs flex-shrink-0">{tc.icon}</span>
                      <span className="text-[10px] font-mono truncate flex-1" style={{ color: C.text }}>{t.name}</span>
                      <span className="text-[9px] font-mono" style={{ color: tc.color }}>{tc.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {latest && (
            <div className="rounded p-2" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}` }}>
              <div className="text-[9px] font-mono mb-1" style={{ color: C.muted }}>
                Latest · {fmtTime(latest.created_at)}
              </div>
              <p className="text-[10px] font-mono leading-relaxed line-clamp-3" style={{ color: C.text }}>
                {latest.title || latest.body?.slice(0, 120)}
              </p>
              {latest.metadata?.sha && (
                <div className="flex items-center gap-1 mt-1.5">
                  <GitCommit size={8} style={{ color: C.muted }} />
                  <span className="text-[9px] font-mono" style={{ color: C.muted }}>
                    {latest.metadata.sha}{latest.metadata.branch ? ` (${latest.metadata.branch})` : ""}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveTaskCard({ msg }: { msg: BridgeMsg | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!msg) {
    return (
      <div
        className="rounded-xl border p-6 flex flex-col items-center justify-center"
        style={{ borderColor: C.border, background: C.card, minHeight: 120 }}
      >
        <Clock size={20} style={{ color: C.muted, marginBottom: 8 }} />
        <p className="text-sm font-mono" style={{ color: C.muted }}>⏳ Waiting for next instruction…</p>
      </div>
    );
  }

  const meta    = msg.metadata || {};
  const isBlk   = meta.status === "blocked";
  const whoC    = WHO_CFG[msg.created_by] || WHO_CFG.unknown;
  const preview = msg.body?.slice(0, 300) || "";

  return (
    <div
      className="rounded-xl border p-4 transition-all"
      style={{
        borderColor: isBlk ? `${C.red}60` : `${C.blue}30`,
        background:  isBlk ? `rgba(239,68,68,0.06)` : C.card,
        boxShadow:   isBlk ? `0 0 16px rgba(239,68,68,0.15)` : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {isBlk && (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded" style={{ color: C.red, background: `${C.red}20`, border: `1px solid ${C.red}40` }}>
              ⚠ NEEDS ATTENTION
            </span>
          )}
          <span
            className="text-[10px] font-mono font-bold px-2 py-0.5 rounded"
            style={{ color: whoC.color, background: `${whoC.color}18`, border: `1px solid ${whoC.color}40` }}
          >
            {msg.created_by === "claude_chat" ? "🤖 CLAUDE CHAT" : "⚡ CLAUDE CODE"}
          </span>
          {msg.created_by === "claude_chat" && (
            <>
              <span className="text-[10px] font-mono" style={{ color: C.muted }}>→</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded" style={{ color: C.cyan, background: `${C.cyan}18`, border: `1px solid ${C.cyan}40` }}>
                CLAUDE CODE
              </span>
            </>
          )}
        </div>
        <span className="text-[10px] font-mono" style={{ color: C.muted }}>{fmtRelative(msg.created_at)}</span>
      </div>

      {(meta.module_num || meta.task) && (
        <div className="text-[10px] font-mono mb-2" style={{ color: C.muted }}>
          {meta.module_num && `Module ${String(meta.module_num).padStart(2, "0")}`}
          {meta.task && ` · ${meta.task}`}
        </div>
      )}

      <div className="border-b mb-3" style={{ borderColor: C.border }} />
      {msg.title && <p className="text-sm font-semibold mb-2" style={{ color: C.text }}>{msg.title}</p>}

      <p className="text-xs font-mono leading-relaxed mb-3" style={{ color: "#a0a0b0" }}>
        {expanded ? msg.body : preview}
        {!expanded && (msg.body?.length || 0) > 300 && (
          <button className="ml-1 hover:underline" style={{ color: C.blue }} onClick={() => setExpanded(true)}>
            View full ↓
          </button>
        )}
        {expanded && (
          <button className="ml-1 hover:underline" style={{ color: C.blue }} onClick={() => setExpanded(false)}>
            {" "}Collapse ↑
          </button>
        )}
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        {meta.status && <StatusBadge status={meta.status} />}
        {meta.sha && (
          <span className="flex items-center gap-1 text-[9px] font-mono" style={{ color: C.muted }}>
            <GitCommit size={8} /> {meta.sha}
          </span>
        )}
        {meta.ts_status && (
          <span className="flex items-center gap-1 text-[9px] font-mono" style={{ color: meta.ts_status === "clean" ? C.green : C.red }}>
            <Code2 size={8} /> TS: {meta.ts_status}
          </span>
        )}
        {meta.tokens_estimated && (
          <span className="text-[9px] font-mono" style={{ color: C.muted }}>
            ~{fmtTokens(meta.tokens_estimated)} tok
          </span>
        )}
      </div>
    </div>
  );
}

function FeedEntry({ msg, isNew = false }: { msg: BridgeMsg; isNew?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const meta  = msg.metadata || {};
  const whoC  = WHO_CFG[msg.created_by] || WHO_CFG.unknown;
  const kindK = resolveKind(msg.kind);
  const kindC = KIND_CFG[kindK] || KIND_CFG.message;
  const preview = msg.body?.slice(0, 130) || "";

  return (
    <div
      className="rounded-lg border transition-all overflow-hidden"
      style={{
        borderColor: isNew ? `${C.blue}50` : (expanded ? `${whoC.color}30` : C.border),
        background:  isNew ? `rgba(59,130,246,0.06)` : (expanded ? `${whoC.color}05` : "rgba(18,18,26,0.5)"),
        boxShadow:   isNew ? `0 0 8px rgba(59,130,246,0.15)` : undefined,
        animation:   isNew ? "fadeIn 0.4s ease-out" : undefined,
      }}
    >
      <button
        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/[0.015] transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-mono font-bold flex-shrink-0 mt-0.5"
          style={{ color: whoC.color, background: `${whoC.color}18`, border: `1px solid ${whoC.color}30` }}>
          {msg.created_by === "claude_chat" ? "CHAT" : msg.created_by === "claude_code" ? "CODE" : "SYS"}
        </span>
        <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-mono flex-shrink-0 mt-0.5"
          style={{ color: kindC.color, background: `${kindC.color}18`, border: `1px solid ${kindC.color}25` }}>
          {kindC.label}
        </span>
        {meta.module_num && (
          <span className="text-[9px] font-mono flex-shrink-0 mt-0.5" style={{ color: C.muted }}>
            M{String(meta.module_num).padStart(2, "0")}{meta.task ? `·${meta.task}` : ""}
          </span>
        )}
        <div className="flex-1 min-w-0">
          {msg.title && <p className="text-[10px] font-semibold truncate" style={{ color: C.text }}>{msg.title}</p>}
          {!expanded && <p className="text-[10px] font-mono truncate" style={{ color: C.muted }}>{preview}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          {meta.status && <StatusBadge status={meta.status} />}
          <span className="text-[9px] font-mono" style={{ color: C.muted }}>{fmtRelative(msg.created_at)}</span>
          {expanded ? <ChevronUp size={10} style={{ color: C.muted }} /> : <ChevronDown size={10} style={{ color: C.muted }} />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t" style={{ borderColor: C.border }}>
          <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-words mt-2 max-h-72 overflow-y-auto" style={{ color: "#a0a0b0", scrollbarWidth: "thin" }}>
            {msg.body}
          </pre>
          <div className="flex items-center gap-3 flex-wrap mt-2">
            <span className="text-[9px] font-mono" style={{ color: C.muted }}>{fmtTime(msg.created_at)}</span>
            {meta.sha && (
              <span className="flex items-center gap-1 text-[9px] font-mono" style={{ color: C.muted }}>
                <GitCommit size={7} /> {meta.sha}{meta.branch ? ` (${meta.branch})` : ""}
              </span>
            )}
            {meta.ts_status && (
              <span className="flex items-center gap-1 text-[9px] font-mono" style={{ color: meta.ts_status === "clean" ? C.green : C.red }}>
                <Code2 size={7} /> TS: {meta.ts_status}
              </span>
            )}
            {meta.tokens_estimated && (
              <span className="text-[9px] font-mono" style={{ color: C.muted }}>~{fmtTokens(meta.tokens_estimated)} tok</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Bottom Strip ── */
function BottomStrip({
  usage, cost, health, messages, breakpoint,
}: {
  usage:      UsageStats | null;
  cost:       CostData | null;
  health:     HealthState;
  messages:   BridgeMsg[];
  breakpoint: Breakpoint;
}) {
  const convWords = (() => {
    const sorted = [...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const cc = sorted.find(m => m.created_by === "claude_chat" && m.metadata?.conversation_length);
    return cc ? Number(cc.metadata.conversation_length) : null;
  })();

  const CONTEXT_MAX = 100_000;
  const ctxPct   = convWords !== null ? Math.min(100, Math.round((convWords / CONTEXT_MAX) * 100)) : null;
  const ctxColor  = ctxPct === null ? C.muted : ctxPct >= 90 ? C.red : ctxPct >= 70 ? C.yellow : C.green;
  const ctxLabel  = ctxPct === null ? "unknown" : ctxPct >= 90 ? "⚠ START FRESH" : ctxPct >= 70 ? "Consider fresh chat" : "OK";

  const tokenPct   = usage ? Math.min(100, Math.round((usage.tokens_today / SESSION_TOKEN_BUDGET) * 100)) : 0;
  const tokenColor = tokenPct >= 90 ? C.red : tokenPct >= 70 ? C.yellow : C.green;

  const healthItems = [
    { label: "TS",    ok: health.ts !== "errors",   val: health.ts    === "clean"  ? "✅ CLEAN" : health.ts    === "errors" ? "❌ ERR" : "—" },
    { label: "Git",   ok: health.git !== "stale",   val: health.git   === "synced" ? "✅ SYNC"  : health.git  === "stale"  ? "⚠ OLD" : "—" },
    { label: "DB",    ok: health.db !== "error",    val: health.db    === "ok"     ? "✅ OK"    : health.db   === "error"  ? "❌ ERR" : "—" },
    { label: "Build", ok: health.build !== "stale", val: health.build === "ok"     ? "✅ OK"    : health.build === "stale" ? "⚠ OLD" : "—" },
  ];

  const tile      = "rounded-xl border p-3 flex flex-col gap-2";
  const tileStyle = { borderColor: C.border, background: C.card };
  const isMobile  = breakpoint === "mobile";
  const isTablet  = breakpoint === "tablet";

  // Mobile: 2 tiles only (Context + Health)
  // Tablet: 3 tiles (Context, Code Today, Health)
  // Desktop+: 4 tiles

  return (
    <div className={`flex gap-3 ${isMobile ? "flex-col" : ""}`}>
      {/* CHAT CONTEXT */}
      <div className={tile} style={{ ...tileStyle, flex: 1 }}>
        <div className="flex items-center gap-2">
          <MessageSquare size={11} style={{ color: C.purple }} />
          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: C.muted }}>Chat Context</span>
        </div>
        {ctxPct !== null ? (
          <>
            <Progress value={ctxPct} className="h-1.5" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono" style={{ color: ctxColor }}>{ctxPct}% used</span>
              <span className="text-[10px] font-mono" style={{ color: ctxColor }}>{ctxLabel}</span>
            </div>
          </>
        ) : (
          <span className="text-[10px] font-mono" style={{ color: C.muted }}>No data yet</span>
        )}
      </div>

      {/* CODE TODAY */}
      <div className={tile} style={{ ...tileStyle, flex: 1 }}>
        <div className="flex items-center gap-2">
          <Terminal size={11} style={{ color: C.cyan }} />
          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: C.muted }}>Code Today</span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-[10px] font-mono" style={{ color: C.muted }}>Tasks done</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: C.green }}>{usage?.completed_today ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] font-mono" style={{ color: C.muted }}>Tokens</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: C.blue }}>{usage ? `~${fmtTokens(usage.tokens_today)}` : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] font-mono" style={{ color: C.muted }}>Est. cost</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: tokenColor }}>{usage ? `~$${usage.cost_today_usd.toFixed(4)}` : "—"}</span>
          </div>
          <Progress value={tokenPct} className="h-1 mt-1" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
      </div>

      {/* THIS MONTH — hidden on mobile */}
      {!isMobile && (
        <div className={tile} style={{ ...tileStyle, flex: 1 }}>
          <div className="flex items-center gap-2">
            <DollarSign size={11} style={{ color: C.orange }} />
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: C.muted }}>This Month</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-[10px] font-mono" style={{ color: C.muted }}>API cost</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: C.orange }}>
                {cost?.month_usd != null ? `$${cost.month_usd.toFixed(2)}` : usage?.month_cost_usd != null ? `$${usage.month_cost_usd.toFixed(2)}` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] font-mono" style={{ color: C.muted }}>Tasks</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: C.text }}>{cost?.month_tasks ?? usage?.total_messages ?? "—"}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.green, boxShadow: `0 0 4px ${C.green}` }} />
              <span className="text-[9px] font-mono" style={{ color: C.muted }}>Normal</span>
            </div>
          </div>
        </div>
      )}

      {/* HEALTH — hidden on tablet too (only desktop+) for space */}
      {!isMobile && !isTablet && (
        <div className={tile} style={{ ...tileStyle, flex: 1 }}>
          <div className="flex items-center gap-2">
            <Activity size={11} style={{ color: C.green }} />
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: C.muted }}>Health</span>
          </div>
          <div className="flex flex-col gap-1">
            {healthItems.map(h => (
              <div key={h.label} className="flex justify-between">
                <span className="text-[10px] font-mono" style={{ color: C.muted }}>{h.label}:</span>
                <span className="text-[10px] font-mono" style={{ color: h.ok ? C.green : C.red }}>{h.val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* On tablet: inline health as mini dots */}
      {isTablet && (
        <div className={tile} style={{ ...tileStyle, flex: 1 }}>
          <div className="flex items-center gap-2">
            <Activity size={11} style={{ color: C.green }} />
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: C.muted }}>Health</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {healthItems.map(h => (
              <div key={h.label} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: h.ok ? C.green : C.red }} />
                <span className="text-[9px] font-mono" style={{ color: C.muted }}>{h.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Last Completed Card (ultrawide sidebar) ── */
function LastCompletedCard({ messages }: { messages: BridgeMsg[] }) {
  const last = [...messages]
    .filter(m => m.metadata?.status === "done" || (m.kind === "status" && (m.body || "").toLowerCase().includes("complete")))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: C.border, background: C.card }}>
      <div className="text-[9px] font-mono uppercase tracking-wider mb-2" style={{ color: C.muted }}>
        Last Completed
      </div>
      {last ? (
        <>
          <p className="text-xs font-semibold truncate mb-1" style={{ color: C.green }}>{last.title || last.body?.slice(0, 60)}</p>
          <p className="text-[10px] font-mono" style={{ color: C.muted }}>{fmtRelative(last.created_at)}</p>
          {last.metadata?.module_num && (
            <p className="text-[9px] font-mono mt-1" style={{ color: C.teal }}>
              Module {String(last.metadata.module_num).padStart(2, "0")}
            </p>
          )}
        </>
      ) : (
        <p className="text-[10px] font-mono" style={{ color: C.muted }}>No completions yet</p>
      )}
    </div>
  );
}

/* ── Empire Timeline (ultrawide, 14-day sparkline) ── */
function EmpireTimeline({ messages }: { messages: BridgeMsg[] }) {
  const days = 14;
  const bars: { date: string; count: number; doneCount: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d     = new Date();
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
    const dStart = new Date(d); dStart.setHours(0, 0, 0, 0);
    const dEnd   = new Date(d); dEnd.setHours(23, 59, 59, 999);
    const dayMsgs = messages.filter(m => {
      const t = new Date(m.created_at).getTime();
      return t >= dStart.getTime() && t <= dEnd.getTime();
    });
    bars.push({
      date:      label,
      count:     dayMsgs.length,
      doneCount: dayMsgs.filter(m => m.metadata?.status === "done").length,
    });
  }

  const maxCount = Math.max(...bars.map(b => b.count), 1);

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: C.border, background: C.card }}>
      <div className="text-[9px] font-mono uppercase tracking-wider mb-3" style={{ color: C.muted }}>
        14-Day Activity
      </div>
      <div className="flex items-end gap-1 h-16">
        {bars.map((b, i) => {
          const h = Math.max(2, Math.round((b.count / maxCount) * 56));
          return (
            <div key={i} className="flex flex-col items-center gap-0.5 flex-1" title={`${b.date}: ${b.count} msgs, ${b.doneCount} done`}>
              <div
                className="w-full rounded-sm"
                style={{
                  height:     h,
                  background: b.doneCount > 0 ? C.green : b.count > 0 ? C.blue : "rgba(255,255,255,0.04)",
                  opacity:    b.count > 0 ? 1 : 0.3,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[8px] font-mono" style={{ color: C.muted }}>{bars[0]?.date}</span>
        <span className="text-[8px] font-mono" style={{ color: C.muted }}>today</span>
      </div>
    </div>
  );
}

/* ── Fresh Chat Modal ── */
function FreshChatModal({ content, onClose }: { content: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="relative rounded-xl border p-6 flex flex-col gap-4 max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden"
        style={{ background: C.card, borderColor: C.purple + "60" }}
        onClick={e => e.stopPropagation()}
      >
        <button className="absolute top-4 right-4" style={{ color: C.muted }} onClick={onClose}>
          <X size={16} />
        </button>
        <div>
          <h2 className="text-sm font-bold mb-1" style={{ color: C.purple }}>🔄 FRESH CHAT HANDOFF</h2>
          <p className="text-[11px] font-mono" style={{ color: C.muted }}>Copy into a new Claude Chat to continue the build.</p>
        </div>
        <div className="flex-1 overflow-y-auto rounded p-3" style={{ background: "#0a0a0f", border: `1px solid ${C.border}`, scrollbarWidth: "thin" }}>
          <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap" style={{ color: "#a0a0b0" }}>
            {content}
          </pre>
        </div>
        <Button
          onClick={copy}
          className="self-start h-8 text-xs font-mono px-4"
          style={{ background: copied ? C.green : C.purple, color: "#fff" }}
        >
          {copied ? "✓ Copied!" : "Copy to clipboard"}
        </Button>
      </div>
    </div>
  );
}

/* ── Mobile Tab Bar ── */
function MobileTabBar({
  active, onChange, logBadge,
}: {
  active:   ActiveTab;
  onChange: (t: ActiveTab) => void;
  logBadge: number;
}) {
  const tabs: { id: ActiveTab; icon: React.ReactNode; label: string }[] = [
    { id: "modules", icon: <Layers size={16} />,      label: "Modules"   },
    { id: "active",  icon: <CheckSquare size={16} />, label: "Active"    },
    { id: "log",     icon: <Radio size={16} />,       label: "Log"       },
    { id: "usage",   icon: <BarChart2 size={16} />,   label: "Usage"     },
  ];
  return (
    <div
      className="flex-shrink-0 flex border-t"
      style={{ background: "rgba(10,10,15,0.97)", borderColor: C.border }}
    >
      {tabs.map(t => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            className="flex-1 flex flex-col items-center gap-1 py-2 relative transition-colors"
            style={{ color: isActive ? C.blue : C.muted }}
            onClick={() => onChange(t.id)}
          >
            {t.id === "log" && logBadge > 0 && (
              <span
                className="absolute top-1.5 right-1/4 w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center"
                style={{ background: C.red, color: "#fff" }}
              >
                {logBadge > 9 ? "9+" : logBadge}
              </span>
            )}
            {t.icon}
            <span className="text-[9px] font-mono">{t.label}</span>
            {isActive && (
              <span className="absolute top-0 left-0 right-0 h-0.5" style={{ background: C.blue }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Module progress summary ── */
function ModuleSummaryBar({ moduleMap }: { moduleMap: Record<number, BridgeMsg[]> }) {
  const counts = (["done", "building", "blocked", "paused"] as ModStatus[]).map(s => ({
    s, l: MOD_STATUS_CFG[s].icon, c: MOD_STATUS_CFG[s].color,
    cnt: MODULES.filter(m => deriveModuleStatus(moduleMap[m.num] || []) === s).length,
  })).filter(x => x.cnt > 0);

  return (
    <div className="text-[10px] font-mono flex items-center gap-3" style={{ color: C.muted }}>
      {counts.map(({ s, l, c, cnt }) => (
        <span key={s} className="flex items-center gap-1" style={{ color: c }}>
          {l} {cnt}
        </span>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════════════════ */

export default function Build() {
  const screen = useScreenSize();
  const bp     = screen.breakpoint;

  const [messages,       setMessages]       = useState<BridgeMsg[]>([]);
  const [usage,          setUsage]          = useState<UsageStats | null>(null);
  const [cost,           setCost]           = useState<CostData | null>(null);
  const [health,         setHealth]         = useState<HealthState>({
    ts: "unknown", git: "unknown", db: "unknown", build: "unknown", ts_sha: "",
  });
  const [loading,        setLoading]        = useState(false);
  const [lastFetch,      setLastFetch]      = useState<Date | null>(null);
  const [countdown,      setCountdown]      = useState(20);
  const [error,          setError]          = useState<string | null>(null);
  const [isPaused,       setIsPaused]       = useState(false);
  const [posting,        setPosting]        = useState(false);
  const [expandedMod,    setExpandedMod]    = useState<number | null>(null);
  const [showFreshChat,  setShowFreshChat]  = useState(false);
  const [handoffContent, setHandoffContent] = useState("");
  const [activeTab,      setActiveTab]      = useState<ActiveTab>("modules");
  const [logBadgeCount,  setLogBadgeCount]  = useState(0);
  const [newMsgIds,      setNewMsgIds]      = useState<Set<string>>(new Set());

  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedScrollRef   = useRef<HTMLDivElement | null>(null);
  const moduleScrollRef = useRef<HTMLDivElement | null>(null);
  const savedFeedScroll = useRef(0);
  const savedModScroll  = useRef(0);
  const prevMsgCountRef = useRef(0);
  const kbHandlerRef    = useRef<(e: KeyboardEvent) => void>(() => {});

  /* ── Derived ── */
  const moduleMap   = buildModuleMap(messages);
  const doneCount   = MODULES.filter(m => deriveModuleStatus(moduleMap[m.num] || []) === "done").length;
  const sorted      = [...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const activeTask  = findActiveTask(messages);
  const progressPct = Math.round((doneCount / 12) * 100);

  const ctxWords = (() => {
    const cc = sorted.find(m => m.created_by === "claude_chat" && m.metadata?.conversation_length);
    return cc ? Number(cc.metadata.conversation_length) : null;
  })();
  const ctxPct = ctxWords !== null ? Math.min(100, Math.round((ctxWords / 100_000) * 100)) : 0;

  /* ── Keyboard shortcuts (stable ref pattern) ── */
  kbHandlerRef.current = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    switch (e.key.toLowerCase()) {
      case "r": fetchAll(); break;
      case "p": isPaused ? handleResume() : handlePause(); break;
      case "1": setActiveTab("modules"); break;
      case "2": setActiveTab("active");  break;
      case "3": setActiveTab("log"); setLogBadgeCount(0); break;
      case "4": setActiveTab("usage");   break;
      case "escape": setExpandedMod(null); break;
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => kbHandlerRef.current(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* ── Auto-expand building module ── */
  useEffect(() => {
    const buildingMod = MODULES.find(m => deriveModuleStatus(moduleMap[m.num] || []) === "building");
    if (buildingMod && expandedMod === null) {
      setExpandedMod(buildingMod.num);
    }
  }, [messages]);

  /* ── Fetch ── */
  const fetchBridge = useCallback(async () => {
    if (!BRIDGE_TOKEN) { setError("VITE_BRIDGE_READ_TOKEN not set in .env"); return; }
    setLoading(true);
    setError(null);
    try {
      // Save scroll positions
      if (feedScrollRef.current)   savedFeedScroll.current = feedScrollRef.current.scrollTop;
      if (moduleScrollRef.current) savedModScroll.current  = moduleScrollRef.current.scrollTop;

      const [listR, usageR] = await Promise.all([
        bridgeCall("list",  { limit: 200 }),
        bridgeCall("usage", {}),
      ]);
      if (listR.ok) {
        const newMsgs: BridgeMsg[] = listR.messages || [];
        const prevIds = new Set(messages.map((m: BridgeMsg) => m.id));
        const freshIds = new Set(newMsgs.filter(m => !prevIds.has(m.id)).map(m => m.id));
        if (freshIds.size > 0) {
          setNewMsgIds(freshIds);
          // Badge only if not viewing log
          if (activeTab !== "log") setLogBadgeCount(c => c + freshIds.size);
          setTimeout(() => setNewMsgIds(new Set()), 3000);
        }
        setMessages(newMsgs);
        prevMsgCountRef.current = newMsgs.length;
      } else {
        setError(listR.error || "Bridge list failed");
      }
      if (usageR.ok) setUsage(usageR.usage);
    } catch (e: any) {
      setError(e?.message || "Bridge fetch failed");
    } finally {
      setLoading(false);
      setLastFetch(new Date());
      setCountdown(20);
      // Restore scroll
      requestAnimationFrame(() => {
        if (feedScrollRef.current)   feedScrollRef.current.scrollTop   = savedFeedScroll.current;
        if (moduleScrollRef.current) moduleScrollRef.current.scrollTop = savedModScroll.current;
      });
    }
  }, [messages, activeTab]);

  const fetchCosts = useCallback(async () => {
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const [todayR, monthR] = await Promise.allSettled([
        supabase.from("api_cost_log").select("cost_usd").gte("created_at", todayStart.toISOString()),
        supabase.from("api_cost_log").select("cost_usd, created_at").gte("created_at", monthStart.toISOString()),
      ]);
      const todayRows = todayR.status === "fulfilled" ? (todayR.value.data || []) : [];
      const monthRows = monthR.status === "fulfilled" ? (monthR.value.data || []) : [];
      const today_usd = todayRows.reduce((s: number, r: any) => s + (Number(r.cost_usd) || 0), 0);
      const month_usd = monthRows.reduce((s: number, r: any) => s + (Number(r.cost_usd) || 0), 0);
      setCost({ today_usd: Number(today_usd.toFixed(4)), month_usd: Number(month_usd.toFixed(2)), month_tasks: monthRows.length });
    } catch { /* table may not exist */ }
  }, []);

  const fetchHealth = useCallback(async (msgs: BridgeMsg[]) => {
    const allSorted = [...msgs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const tsMsg     = allSorted.find(m => m.metadata?.ts_status);
    const tsStatus: HealthState["ts"] = tsMsg ? (tsMsg.metadata.ts_status === "clean" ? "clean" : "errors") : "unknown";
    const gitMsg    = allSorted.find(m => m.metadata?.sha);
    let gitStatus: HealthState["git"] = "unknown";
    if (gitMsg) {
      const age = Date.now() - new Date(gitMsg.created_at).getTime();
      gitStatus = age < 2 * 3600 * 1000 ? "synced" : "stale";
    }
    let dbStatus: HealthState["db"] = "unknown";
    try {
      const { error: dbErr } = await supabase.from("claude_bridge").select("id").limit(1);
      dbStatus = dbErr ? "error" : "ok";
    } catch { dbStatus = "error"; }
    const buildStatus: HealthState["build"] = allSorted[0]
      ? (Date.now() - new Date(allSorted[0].created_at).getTime() < 6 * 3600 * 1000 ? "ok" : "stale")
      : "unknown";
    setHealth({ ts: tsStatus, git: gitStatus, db: dbStatus, build: buildStatus, ts_sha: tsMsg?.metadata?.sha || "" });
  }, []);

  const fetchAll = useCallback(async () => {
    await fetchBridge();
    await fetchCosts();
  }, [fetchBridge, fetchCosts]);

  useEffect(() => {
    if (messages.length > 0) fetchHealth(messages);
  }, [messages, fetchHealth]);

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, 20_000);
    cdRef.current       = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (cdRef.current)       clearInterval(cdRef.current);
    };
  }, []);

  /* ── Pause / Resume ── */
  const handlePause = useCallback(async () => {
    if (!BRIDGE_SECRET) { alert("VITE_BRIDGE_SECRET not set"); return; }
    setPosting(true);
    try {
      await bridgeCall("post", {
        kind: "status",
        title: "PAUSED — King paused the build.",
        body: "PAUSED — King paused the build. Claude Chat: stop sending instructions until RESUMED status posted.",
        created_by: "claude_code",
        metadata: { status: "paused", control: true },
      }, true);
      setIsPaused(true);
      await fetchAll();
    } finally { setPosting(false); }
  }, [fetchAll]);

  const handleResume = useCallback(async () => {
    if (!BRIDGE_SECRET) { alert("VITE_BRIDGE_SECRET not set"); return; }
    setPosting(true);
    try {
      await bridgeCall("post", {
        kind: "status",
        title: "RESUMED — continue build",
        body: "RESUMED — continue build",
        created_by: "claude_code",
        metadata: { status: "executing", control: true },
      }, true);
      setIsPaused(false);
      await fetchAll();
    } finally { setPosting(false); }
  }, [fetchAll]);

  const openFreshChat = () => {
    setHandoffContent(generateHandoff(messages, moduleMap));
    setShowFreshChat(true);
  };

  /* ── Shared top bar ── */
  const isMobile = bp === "mobile";

  const TopBar = (
    <div
      className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b z-20"
      style={{ background: "rgba(10,10,15,0.97)", backdropFilter: "blur(12px)", borderColor: C.border, position: "sticky", top: 0 }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Crown size={14} style={{ color: "#fbbf24", flexShrink: 0 }} />
        <span className="text-xs font-bold tracking-wider truncate" style={{ color: C.text }}>
          {isMobile ? "EMPIRE BUILD" : "SEO SEASON — EMPIRE BUILD COMMAND"}
        </span>
        {!isMobile && lastFetch && (
          <span className="text-[10px] font-mono hidden sm:block" style={{ color: C.muted }}>
            {fmtTime(lastFetch.toISOString())}
          </span>
        )}
        {!isMobile && (
          <span className="text-[9px] font-mono hidden md:block" style={{ color: C.muted }}>
            {screen.width}×{screen.height} · {bp}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="flex items-center gap-1 mr-1">
          <span className="w-2 h-2 rounded-full" style={{
            background: error ? C.red : C.green,
            boxShadow:  error ? undefined : `0 0 6px ${C.green}`,
            animation:  error ? undefined : "pulse 2s infinite",
          }} />
          {!isMobile && (
            <span className="text-[10px] font-mono" style={{ color: C.muted }}>
              {error ? "ERR" : `${countdown}s`}
            </span>
          )}
        </div>

        {ctxPct >= 70 && (
          <Button size="sm" className="h-7 px-2 text-[10px] font-mono gap-1"
            style={{ background: `${C.purple}20`, color: C.purple, border: `1px solid ${C.purple}40` }}
            onClick={openFreshChat}>
            <MessageSquare size={10} />
            {!isMobile && "Fresh Chat"}
          </Button>
        )}

        {isPaused ? (
          <Button size="sm" disabled={posting} className="h-7 px-2 text-[10px] font-mono gap-1"
            style={{ background: `${C.green}20`, color: C.green, border: `1px solid ${C.green}40` }}
            onClick={handleResume}>
            {posting ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
            {!isMobile && "Resume"}
          </Button>
        ) : (
          <Button size="sm" disabled={posting} className="h-7 px-2 text-[10px] font-mono gap-1"
            style={{ background: `${C.orange}15`, color: C.orange, border: `1px solid ${C.orange}40` }}
            onClick={handlePause}>
            {posting ? <Loader2 size={10} className="animate-spin" /> : <Pause size={10} />}
            {!isMobile && "Pause"}
          </Button>
        )}

        <Button size="sm" disabled={loading} variant="outline"
          className="h-7 px-2 text-[10px] font-mono gap-1 border-white/10 text-slate-400 hover:text-slate-200 bg-transparent hover:bg-white/5"
          onClick={fetchAll}>
          {loading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
          {!isMobile && "Refresh"}
        </Button>
      </div>
    </div>
  );

  /* ── Banners ── */
  const Banners = (
    <>
      {isPaused && (
        <div className="flex-shrink-0 px-4 py-2 text-center text-xs font-mono font-bold"
          style={{ background: `${C.orange}20`, color: C.orange, borderBottom: `1px solid ${C.orange}30` }}>
          ⏸ BUILD PAUSED — waiting for RESUME
        </div>
      )}
      {error && (
        <div className="flex-shrink-0 mx-4 mt-3 px-3 py-2 rounded-lg text-xs font-mono"
          style={{ background: `${C.red}12`, color: C.red, border: `1px solid ${C.red}30` }}>
          ⚠ {error}
        </div>
      )}
    </>
  );

  /* ── Module panel (shared across layouts) ── */
  const ModulePanel = (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-xs font-bold tracking-wider" style={{ color: C.text }}>EMPIRE MODULES</div>
          <div className="text-[10px] font-mono" style={{ color: C.muted }}>{doneCount}/12</div>
        </div>
        <div className="mt-2">
          <Progress value={progressPct} className="h-1" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="flex items-center justify-between mt-1">
            <ModuleSummaryBar moduleMap={moduleMap} />
            <span className="text-[9px] font-mono" style={{ color: C.muted }}>{progressPct}%</span>
          </div>
        </div>
      </div>
      <div ref={moduleScrollRef} className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-1.5" style={{ scrollbarWidth: "thin" }}>
        {MODULES.map(mod => (
          <ModuleRow
            key={mod.num}
            mod={mod}
            msgs={moduleMap[mod.num] || []}
            expanded={expandedMod === mod.num}
            onToggle={() => setExpandedMod(v => v === mod.num ? null : mod.num)}
            compact={bp === "ultrawide"}
          />
        ))}
      </div>
    </div>
  );

  /* ── Active task panel ── */
  const ActivePanel = (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: C.muted }}>
          Active Right Now
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: "thin" }}>
        <ActiveTaskCard msg={activeTask} />
      </div>
    </div>
  );

  /* ── Feed panel ── */
  const FeedPanel = (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-3 pb-2">
        <Radio size={11} style={{ color: C.indigo }} />
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: C.muted }}>Build Log</span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: `${C.indigo}20`, color: C.indigo }}>
          {sorted.length}
        </span>
      </div>
      <div ref={feedScrollRef} className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-1.5" style={{ scrollbarWidth: "thin" }}>
        {sorted.length === 0 && !loading && (
          <div className="rounded-xl border p-8 text-center" style={{ borderColor: C.border, background: C.card }}>
            <Clock size={20} style={{ color: C.muted, margin: "0 auto 8px" }} />
            <p className="text-sm font-mono" style={{ color: C.muted }}>No messages yet.</p>
            <p className="text-[10px] font-mono mt-1" style={{ color: "#3b3b52" }}>npx tsx scripts/bridge.ts dump</p>
          </div>
        )}
        {sorted.map(msg => (
          <FeedEntry key={msg.id} msg={msg} isNew={newMsgIds.has(msg.id)} />
        ))}
      </div>
    </div>
  );

  /* ── Usage panel (mobile tab) ── */
  const UsagePanel = (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      <BottomStrip usage={usage} cost={cost} health={health} messages={messages} breakpoint={bp} />
    </div>
  );

  /* ══════════════════════════════════════════════════════════
     MOBILE LAYOUT — tabs
  ══════════════════════════════════════════════════════════ */
  if (bp === "mobile") {
    return (
      <div className="h-screen flex flex-col font-sans select-none overflow-hidden" style={{ background: C.bg, color: C.text }}>
        {TopBar}
        {Banners}
        <div className="flex-1 overflow-hidden">
          {activeTab === "modules" && ModulePanel}
          {activeTab === "active"  && ActivePanel}
          {activeTab === "log"     && FeedPanel}
          {activeTab === "usage"   && UsagePanel}
        </div>
        <MobileTabBar active={activeTab} onChange={t => { setActiveTab(t); if (t === "log") setLogBadgeCount(0); }} logBadge={logBadgeCount} />
        {showFreshChat && <FreshChatModal content={handoffContent} onClose={() => setShowFreshChat(false)} />}
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     TABLET LAYOUT — 2 column (40 / 60)
  ══════════════════════════════════════════════════════════ */
  if (bp === "tablet") {
    return (
      <div className="h-screen flex flex-col font-sans select-none overflow-hidden" style={{ background: C.bg, color: C.text }}>
        {TopBar}
        {Banners}
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {/* Left: modules */}
          <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: "40%", borderColor: C.border }}>
            {ModulePanel}
          </div>
          {/* Right: active + feed stacked */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <div className="flex-shrink-0 border-b overflow-hidden" style={{ borderColor: C.border, maxHeight: "45%" }}>
              {ActivePanel}
            </div>
            <div className="flex-1 overflow-hidden">
              {FeedPanel}
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-3 border-t" style={{ borderColor: C.border, background: "rgba(10,10,15,0.8)" }}>
          <BottomStrip usage={usage} cost={cost} health={health} messages={messages} breakpoint={bp} />
        </div>
        {showFreshChat && <FreshChatModal content={handoffContent} onClose={() => setShowFreshChat(false)} />}
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     DESKTOP LAYOUT — 3 column (25% / 40% / 35%)
  ══════════════════════════════════════════════════════════ */
  if (bp === "desktop") {
    return (
      <div className="h-screen flex flex-col font-sans select-none overflow-hidden" style={{ background: C.bg, color: C.text }}>
        {TopBar}
        {Banners}
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {/* Col 1: modules */}
          <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: "25%", borderColor: C.border }}>
            {ModulePanel}
          </div>
          {/* Col 2: active task */}
          <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: "40%", borderColor: C.border }}>
            {ActivePanel}
          </div>
          {/* Col 3: feed */}
          <div className="flex-1 overflow-hidden">
            {FeedPanel}
          </div>
        </div>
        <div className="flex-shrink-0 px-5 py-3 border-t" style={{ borderColor: C.border, background: "rgba(10,10,15,0.8)" }}>
          <BottomStrip usage={usage} cost={cost} health={health} messages={messages} breakpoint={bp} />
        </div>
        {showFreshChat && <FreshChatModal content={handoffContent} onClose={() => setShowFreshChat(false)} />}
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     ULTRAWIDE LAYOUT — 3 column, max-width 1800px, extras
  ══════════════════════════════════════════════════════════ */
  return (
    <div className="h-screen flex flex-col font-sans select-none overflow-hidden" style={{ background: C.bg, color: C.text }}>
      {TopBar}
      {Banners}
      <div className="flex-1 overflow-hidden flex justify-center" style={{ minHeight: 0 }}>
        <div className="w-full flex overflow-hidden" style={{ maxWidth: 1800 }}>
          {/* Col 1: modules (22%) */}
          <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: "22%", borderColor: C.border }}>
            {ModulePanel}
          </div>
          {/* Col 2: active + extras below (38%) */}
          <div className="flex-shrink-0 border-r flex flex-col overflow-hidden" style={{ width: "38%", borderColor: C.border }}>
            <div className="flex-1 overflow-hidden">
              {ActivePanel}
            </div>
            <div className="flex-shrink-0 flex flex-col gap-3 p-4 border-t" style={{ borderColor: C.border }}>
              <LastCompletedCard messages={messages} />
              <EmpireTimeline messages={messages} />
            </div>
          </div>
          {/* Col 3: feed (40%) */}
          <div className="flex-1 overflow-hidden">
            {FeedPanel}
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 px-5 py-3 border-t flex justify-center" style={{ borderColor: C.border, background: "rgba(10,10,15,0.8)" }}>
        <div className="w-full" style={{ maxWidth: 1800 }}>
          <BottomStrip usage={usage} cost={cost} health={health} messages={messages} breakpoint={bp} />
        </div>
      </div>
      {showFreshChat && <FreshChatModal content={handoffContent} onClose={() => setShowFreshChat(false)} />}
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
